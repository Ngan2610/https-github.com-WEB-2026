/** Durable job operations in existing dbo.CongViecXuLy and dbo.TepXuat tables.
 * This implementation intentionally uses the already-migrated SQL schema, not
 * an uninstalled BullMQ dependency or in-memory Map. Queries are parameterized.
 */
import sql from 'mssql';

const MAX_ATTEMPTS = 3;
export function attachJobRepository(pool, repo) {
  Object.assign(repo, {
    async setDetectedSourceLanguage(id, language) {
      if (!['vi','en','zh'].includes(language)) throw new Error('unsupported_language');
      const result=await pool.request().input('id',sql.Int,id).input('lang',sql.VarChar(8),language)
        .query(`UPDATE dbo.Video SET NgonNguGoc=@lang WHERE MaVideo=@id
          AND NOT EXISTS(SELECT 1 FROM dbo.ThuyetMinh WHERE MaVideo=@id)`);
      if (!result.rowsAffected[0]) throw new Error('source_language_conflict');
    },
    async createProcessingJob(videoId, userId) {
      const tx = new sql.Transaction(pool);
      await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
      try {
        const request = new sql.Request(tx).input('id', sql.Int, videoId).input('uid', sql.Int, userId);
        const existing = await request.query(`SELECT TOP (1) MaCongViec AS id FROM dbo.CongViecXuLy WITH(UPDLOCK,HOLDLOCK)
          WHERE MaVideo=@id AND MaNguoiDung=@uid AND Loai='export' AND TrangThai IN ('queued','running')
          ORDER BY MaCongViec DESC`);
        if (existing.recordset.length) { await tx.commit(); return { id: Number(existing.recordset[0].id), reused: true }; }
        const inserted = await new sql.Request(tx).input('id', sql.Int, videoId).input('uid', sql.Int, userId)
          .query(`DECLARE @created TABLE(id BIGINT);
                  INSERT dbo.CongViecXuLy(MaVideo,MaNguoiDung,Loai,TrangThai,TienDo)
                  OUTPUT inserted.MaCongViec INTO @created
                  SELECT MaVideo,MaNguoiDung,'export','queued',0
                  FROM dbo.Video WHERE MaVideo=@id AND MaNguoiDung=@uid;
                  SELECT id FROM @created;`);
        await tx.commit();
        return inserted.recordset.length ? { id:Number(inserted.recordset[0].id), reused:false } : null;
      } catch (err) { await tx.rollback().catch(() => {}); throw err; }
    },
    async latestVideoProcessingJob(videoId, userId) {
      const result = await pool.request().input('id',sql.Int,videoId).input('uid',sql.Int,userId)
        .query(`SELECT TOP (1) j.MaCongViec AS id,j.MaVideo AS videoId,j.MaNguoiDung AS userId,
          j.TrangThai AS status,j.TienDo AS progress,j.Loi AS failedReason,
          j.SoLanThu AS attempts,j.NgayTao AS createdAt,j.NgayCapNhat AS updatedAt
          FROM dbo.CongViecXuLy j
          WHERE j.MaVideo=@id AND j.MaNguoiDung=@uid AND j.Loai='export'
          ORDER BY j.MaCongViec DESC`);
      return result.recordset[0] || null;
    },
    async getProcessingJob(id) {
      const r = await pool.request().input('id',sql.BigInt,id).query(`SELECT
        j.MaCongViec AS id, j.MaVideo AS videoId, j.MaNguoiDung AS userId,
        j.TrangThai AS status,j.TienDo AS progress,j.Loi AS failedReason,
        j.SoLanThu AS attempts,j.NgayTao AS createdAt,j.NgayCapNhat AS updatedAt
        FROM dbo.CongViecXuLy j WHERE j.MaCongViec=@id AND j.Loai='export'`);
      return r.recordset[0] || null;
    },
    async claimProcessingJob() {
      // READPAST + UPDLOCK prevents two worker processes claiming the same job.
      const r = await pool.request().query(`DECLARE @claimed TABLE(id BIGINT,videoId INT,userId INT,attempts INT);
        ;WITH picked AS (
          SELECT TOP (1) * FROM dbo.CongViecXuLy WITH (READPAST,UPDLOCK,ROWLOCK)
          WHERE Loai='export' AND TrangThai='queued' AND SoLanThu < 3
            AND NgayCapNhat <= DATEADD(SECOND,-4,SYSUTCDATETIME())
          ORDER BY NgayTao,MaCongViec
        ) UPDATE picked SET TrangThai='running', SoLanThu=SoLanThu+1,
          TienDo=5,Loi=NULL,NgayCapNhat=SYSUTCDATETIME()
        OUTPUT inserted.MaCongViec,inserted.MaVideo,inserted.MaNguoiDung,inserted.SoLanThu INTO @claimed;
        SELECT id,videoId,userId,attempts FROM @claimed;`);
      return r.recordset[0] || null;
    },
    async setProcessingProgress(id, progress) {
      await pool.request().input('id',sql.BigInt,id).input('progress',sql.Int,Math.max(0,Math.min(99,Math.round(progress))))
        .query(`UPDATE dbo.CongViecXuLy SET TienDo=@progress,NgayCapNhat=SYSUTCDATETIME()
                WHERE MaCongViec=@id AND TrangThai='running'`);
    },
    async completeProcessingJob(id) {
      await pool.request().input('id',sql.BigInt,id).query(`UPDATE dbo.CongViecXuLy
        SET TrangThai='completed',TienDo=100,Loi=NULL,NgayCapNhat=SYSUTCDATETIME()
        WHERE MaCongViec=@id AND TrangThai='running'`);
    },
    async failProcessingJob(id, errorCode, attempts) {
      const retry = Number(attempts) < MAX_ATTEMPTS;
      await pool.request().input('id',sql.BigInt,id).input('code',sql.NVarChar(2000),String(errorCode).slice(0,500))
        .input('state',sql.VarChar(20),retry?'queued':'failed')
        .query(`UPDATE dbo.CongViecXuLy SET TrangThai=@state,Loi=@code,
          NgayCapNhat=SYSUTCDATETIME() WHERE MaCongViec=@id AND (TrangThai='running' OR (@state='failed' AND TrangThai='queued'))`);
      return retry;
    },
    async touchProcessingJob(id) {
      await pool.request().input('id',sql.BigInt,id).query(`UPDATE dbo.CongViecXuLy
        SET NgayCapNhat=SYSUTCDATETIME() WHERE MaCongViec=@id AND TrangThai='running'`);
    },
    async recoverProcessingJobs() {
      // Called on worker startup only: interrupted work from a previous container.
      await pool.request().query(`UPDATE dbo.CongViecXuLy SET
        TrangThai=CASE WHEN SoLanThu>=3 THEN 'failed' ELSE 'queued' END,
        Loi='worker_restarted',NgayCapNhat=DATEADD(SECOND,-10,SYSUTCDATETIME())
        WHERE Loai='export' AND TrangThai='running'
          AND NgayCapNhat < DATEADD(MINUTE,-30,SYSUTCDATETIME())`);
    },
    async recordProcessingAsset({ jobId, videoId, format, path, size, sha256 }) {
      await pool.request().input('job',sql.BigInt,jobId).input('video',sql.Int,videoId)
        .input('format',sql.VarChar(8),format).input('path',sql.NVarChar(500),path)
        .input('size',sql.BigInt,size).input('sha',sql.Char(64),sha256)
        .query(`INSERT dbo.TepXuat(MaCongViec,MaVideo,Loai,DuongDan,DungLuong,Sha256)
          SELECT @job,@video,@format,@path,@size,@sha
          WHERE NOT EXISTS (SELECT 1 FROM dbo.TepXuat WITH(UPDLOCK,HOLDLOCK)
                            WHERE MaCongViec=@job AND DuongDan=@path)`);
    },
    async listProcessingAssets(jobId) {
      const r = await pool.request().input('job',sql.BigInt,jobId).query(`SELECT
        Loai AS format,DuongDan AS path,DungLuong AS size,Sha256 AS sha256
        FROM dbo.TepXuat WHERE MaCongViec=@job ORDER BY MaTep`);
      return r.recordset;
    },
  });
}
