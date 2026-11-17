import sql from 'mssql';
import { cleanPriceUpdate, calculateOrderSnapshot } from './pricingPolicy.js';
const format = r => ({ currency:r.LoaiTien.trim(), uploadMinor:Number(r.DonGiaDangMinor),
  translationMinor:Number(r.DonGiaDichMinor), maxVideos:r.GioiHanVideo,
  maxTranslations:r.GioiHanBanDich, annualDiscountPct:r.GiamGiaNamPct,
  version:Number(r.PhienBan), updatedAt:new Date(r.NgayCapNhat).toISOString() });
const conflict = Object.assign(new Error('price_changed'), {code:'price_changed'});

const formatPack = r => ({
  id:Number(r.MaGoi),name:r.TenGoi,uploads:r.SoVideoDang,outs:r.SoVideoDich,
  durationDays:r.ThoiHanNgay == null ? null : r.ThoiHanNgay,
  enabled:Boolean(r.HienThi),sortOrder:r.ThuTu,
  updatedAt:new Date(r.NgayCapNhat).toISOString(),
});
const samePack = (a,b) => ['name','uploads','outs','durationDays','enabled','sortOrder']
  .every(k=>a[k]===b[k]);
const packConflict = () => Object.assign(new Error('pack_changed'),{code:'pack_changed'});

async function assertPackLimits(tx,pack) {
  if (!pack.enabled) return;
  const result=await new sql.Request(tx).query(`SELECT MIN(GioiHanVideo) AS maxVideos,
    MIN(GioiHanBanDich) AS maxTranslations FROM dbo.BangGia`);
  const limits=result.recordset[0];
  if (!limits?.maxVideos || pack.uploads>limits.maxVideos || pack.outs>pack.uploads*limits.maxTranslations)
    throw Object.assign(new Error('pack_exceeds_pricing_limits'),{code:'pack_exceeds_pricing_limits'});
}

async function addPackAudit(tx,id,kind,before,after,actor) {
  const change=pack => pack ? `${pack.uploads}/${pack.outs}/${pack.enabled?'on':'off'}` : null;
  await new sql.Request(tx).input('type',sql.VarChar(30),`pricing_pack_${kind}`)
    .input('target',sql.NVarChar(254),`GoiDichVu:${id} ${after.name}`.slice(0,254))
    .input('actor',sql.NVarChar(254),actor)
    .input('prev',sql.NVarChar(40),change(before))
    .input('next',sql.NVarChar(40),change(after))
    .query(`INSERT dbo.NhatKyQuanTri (Loai,DoiTuong,NguoiThucHien,GiaTriCu,GiaTriMoi)
      VALUES(@type,@target,@actor,@prev,@next)`);
}

export function attachPricing(pool,repo) {
  Object.assign(repo, {
    async getPricing() {
      const [rows,packs]=await Promise.all([
        pool.request().query('SELECT * FROM dbo.BangGia ORDER BY LoaiTien'),
        pool.request().query('SELECT * FROM dbo.GoiDichVu ORDER BY ThuTu,MaGoi')]);
      return { currencies:rows.recordset.map(format), packs:packs.recordset.map(formatPack) };
    },
    async getPricingHistory(limit=40) {
      const r=await pool.request().input('n',sql.Int,Math.min(Math.max(1,limit),100))
        .query('SELECT TOP (@n) MaLichSu AS id,LoaiTien AS currency,PhienBanCu AS previousVersion,PhienBanMoi AS version, NguoiSua AS changedBy,LyDo AS reason,NgaySua AS changedAt,GiaCu AS previous,GiaMoi AS next FROM dbo.LichSuBangGia ORDER BY MaLichSu DESC');
      return r.recordset.map(x=>({...x,previous:JSON.parse(x.previous),next:JSON.parse(x.next)}));
    },
    async getPackHistory() {
      const r=await pool.request().query(`SELECT TOP(50) MaNhatKy AS id,Loai AS action,
        DoiTuong AS target,NguoiThucHien AS changedBy,GiaTriCu AS previous,
        GiaTriMoi AS next,ThoiGian AS changedAt
        FROM dbo.NhatKyQuanTri WHERE Loai LIKE 'pricing_pack_%'
        ORDER BY MaNhatKy DESC`);
      return r.recordset.map(x=>({...x,changedAt:new Date(x.changedAt).toISOString()}));
    },
    async createPack(input,actor) {
      const tx=new sql.Transaction(pool); await tx.begin();
      try {
        await assertPackLimits(tx,input);
        // MaGoi is not an IDENTITY in migration 014. Lock the table during ID allocation.
        const next=(await new sql.Request(tx).query(`SELECT ISNULL(MAX(MaGoi),0)+1 AS id
          FROM dbo.GoiDichVu WITH (TABLOCKX,HOLDLOCK)`)).recordset[0].id;
        const created=await new sql.Request(tx)
          .input('id',sql.Int,next).input('name',sql.NVarChar(100),input.name)
          .input('uploads',sql.Int,input.uploads).input('outs',sql.Int,input.outs)
          .input('days',sql.Int,input.durationDays)
          .input('enabled',sql.Bit,input.enabled?1:0).input('sort',sql.Int,input.sortOrder)
          .query(`INSERT dbo.GoiDichVu(MaGoi,TenGoi,SoVideoDang,SoVideoDich,ThoiHanNgay,HienThi,ThuTu)
            OUTPUT INSERTED.* VALUES(@id,@name,@uploads,@outs,@days,@enabled,@sort)`);
        const pack=formatPack(created.recordset[0]);
        await addPackAudit(tx,next,'create',null,pack,actor);
        await tx.commit(); return pack;
      } catch(e) { await tx.rollback().catch(()=>{}); throw e; }
    },
    async updatePack(id,input,expected,actor) {
      const tx=new sql.Transaction(pool); await tx.begin();
      try {
        const current=(await new sql.Request(tx).input('id',sql.Int,id)
          .query(`SELECT * FROM dbo.GoiDichVu WITH (UPDLOCK,HOLDLOCK) WHERE MaGoi=@id`)).recordset[0];
        if(!current) {await tx.rollback();return null;}
        const old=formatPack(current);
        if (!samePack(old,expected)) throw packConflict();
        await assertPackLimits(tx,input);
        const result=await new sql.Request(tx)
          .input('id',sql.Int,id).input('name',sql.NVarChar(100),input.name)
          .input('uploads',sql.Int,input.uploads).input('outs',sql.Int,input.outs)
          .input('days',sql.Int,input.durationDays)
          .input('enabled',sql.Bit,input.enabled?1:0).input('sort',sql.Int,input.sortOrder)
          .query(`UPDATE dbo.GoiDichVu SET TenGoi=@name,SoVideoDang=@uploads,
             SoVideoDich=@outs,ThoiHanNgay=@days,HienThi=@enabled,ThuTu=@sort,
             NgayCapNhat=SYSUTCDATETIME() OUTPUT INSERTED.* WHERE MaGoi=@id`);
        const pack=formatPack(result.recordset[0]);
        const kind=old.enabled!==pack.enabled?(pack.enabled?'show':'hide'):'update';
        await addPackAudit(tx,id,kind,old,pack,actor);
        await tx.commit();return pack;
      } catch(e) {await tx.rollback().catch(()=>{});throw e;}
    },

    async updatePricing(input, actor) {
      const parsed=cleanPriceUpdate(input);
      if(parsed.error) throw Object.assign(new Error(parsed.error),{code:parsed.error});
      const v=parsed.value;
      const tx=new sql.Transaction(pool); await tx.begin();
      try {
        const current=(await new sql.Request(tx).input('currency',sql.Char(3),v.currency)
          .query('SELECT * FROM dbo.BangGia WITH (UPDLOCK,HOLDLOCK) WHERE LoaiTien=@currency')).recordset[0];
        if(!current) throw Object.assign(new Error('not_found'),{code:'not_found'});
        if(Number(current.PhienBan)!==v.version) throw conflict;
        const activePackOutsideLimits=(await new sql.Request(tx)
          .input('maxUp',sql.Int,v.maxVideos).input('maxOut',sql.Int,v.maxTranslations)
          .query(`SELECT TOP(1) MaGoi FROM dbo.GoiDichVu WITH (HOLDLOCK)
            WHERE HienThi=1 AND (SoVideoDang>@maxUp
              OR SoVideoDich>CONVERT(BIGINT,SoVideoDang)*@maxOut)`)).recordset[0];
        if(activePackOutsideLimits) throw Object.assign(new Error('pack_exceeds_pricing_limits'),{code:'pack_exceeds_pricing_limits'});
        const before=format(current), next={...before,uploadMinor:v.uploadMinor,translationMinor:v.translationMinor,
          maxVideos:v.maxVideos,maxTranslations:v.maxTranslations,annualDiscountPct:v.annualDiscountPct,version:v.version+1};
        await new sql.Request(tx).input('currency',sql.Char(3),v.currency)
          .input('up',sql.BigInt,v.uploadMinor).input('out',sql.BigInt,v.translationMinor)
          .input('maxUp',sql.Int,v.maxVideos).input('maxOut',sql.Int,v.maxTranslations)
          .input('annual',sql.Int,v.annualDiscountPct).input('editor',sql.NVarChar(254),actor)
          .query(`UPDATE dbo.BangGia SET DonGiaDangMinor=@up,DonGiaDichMinor=@out,
            GioiHanVideo=@maxUp,GioiHanBanDich=@maxOut,GiamGiaNamPct=@annual,
            PhienBan=PhienBan+1,NguoiSua=@editor,NgayCapNhat=SYSUTCDATETIME() WHERE LoaiTien=@currency`);
        await new sql.Request(tx).input('currency',sql.Char(3),v.currency)
          .input('before',sql.NVarChar(sql.MAX),JSON.stringify(before))
          .input('after',sql.NVarChar(sql.MAX),JSON.stringify(next))
          .input('old',sql.BigInt,v.version).input('new',sql.BigInt,next.version)
          .input('editor',sql.NVarChar(254),actor).input('reason',sql.NVarChar(500),v.reason)
          .query(`INSERT dbo.LichSuBangGia(LoaiTien,GiaCu,GiaMoi,PhienBanCu,PhienBanMoi,NguoiSua,LyDo)
            VALUES(@currency,@before,@after,@old,@new,@editor,@reason)`);
        await tx.commit();
        return next;
      } catch(e) { await tx.rollback().catch(()=>{}); throw e; }
    },
  });
}
