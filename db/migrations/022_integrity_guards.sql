/* Cross-table invariants. Run through the transactional migration runner. */
IF EXISTS (SELECT 1 FROM dbo.DonHang d WHERE d.TrangThai='paid' AND NOT EXISTS
           (SELECT 1 FROM dbo.GiaoDich g WHERE g.MaDonHang=d.MaDonHang AND g.TrangThai='success'))
 THROW 52201,N'PRECHECK: paid order without successful transaction.',1;
IF EXISTS (SELECT 1 FROM dbo.QuyenLoiGoi q JOIN dbo.DonHang d ON d.MaDonHang=q.MaDonHang
           WHERE d.TrangThai<>'paid' OR NOT EXISTS
           (SELECT 1 FROM dbo.GiaoDich g WHERE g.MaDonHang=q.MaDonHang
             AND g.TrangThai='success' AND g.NguonXacNhan=q.NguonXacNhan))
 THROW 52202,N'PRECHECK: entitlement without a matching paid transaction.',1;
IF EXISTS (SELECT 1 FROM dbo.CongViecXuLy j JOIN dbo.Video v ON v.MaVideo=j.MaVideo
           WHERE j.MaNguoiDung<>v.MaNguoiDung)
 THROW 52203,N'PRECHECK: processing job belongs to a different video owner.',1;
IF EXISTS (SELECT 1 FROM dbo.TepXuat t JOIN dbo.CongViecXuLy j ON j.MaCongViec=t.MaCongViec
           WHERE t.MaVideo<>j.MaVideo OR (t.MaVideo IS NULL AND j.MaVideo IS NOT NULL)
              OR (t.MaVideo IS NOT NULL AND j.MaVideo IS NULL))
 THROW 52204,N'PRECHECK: export and processing job refer to different videos.',1;
IF EXISTS (SELECT 1 FROM dbo.TepXuat WHERE MaCongViec IS NOT NULL
           GROUP BY MaCongViec,DuongDan HAVING COUNT_BIG(*)>1)
 THROW 52205,N'PRECHECK: multiple export records with the same job and path.',1;
GO
ALTER TABLE dbo.LichSuXuLyPhanHoi DROP CONSTRAINT CK_LichSuXuLyPhanHoi_ExactlyOne;
ALTER TABLE dbo.LichSuXuLyPhanHoi WITH CHECK ADD CONSTRAINT CK_LichSuXuLyPhanHoi_ExactlyOne
 CHECK ((Nguon='user' AND MaPhanHoi IS NOT NULL AND MaPhanHoi=MaBanGhi AND MaLienHe IS NULL)
     OR (Nguon='contact' AND MaLienHe IS NOT NULL AND MaLienHe=MaBanGhi AND MaPhanHoi IS NULL));
CREATE UNIQUE INDEX UX_TepXuat_CongViec_DuongDan ON dbo.TepXuat(MaCongViec,DuongDan)
 WHERE MaCongViec IS NOT NULL;
GO
CREATE OR ALTER TRIGGER dbo.TR_DonHang_ThanhToanHopLe ON dbo.DonHang
 AFTER INSERT,UPDATE AS
BEGIN
 SET NOCOUNT ON;
 IF NOT UPDATE(TrangThai) RETURN;
 IF EXISTS (SELECT 1 FROM inserted d WHERE d.TrangThai='paid' AND NOT EXISTS
            (SELECT 1 FROM dbo.GiaoDich g WITH(UPDLOCK,HOLDLOCK)
             WHERE g.MaDonHang=d.MaDonHang AND g.TrangThai='success'))
  THROW 52211,N'Paid order requires a successful transaction.',1;
 IF EXISTS (SELECT 1 FROM inserted d JOIN dbo.QuyenLoiGoi q WITH(UPDLOCK,HOLDLOCK)
            ON q.MaDonHang=d.MaDonHang WHERE d.TrangThai<>'paid')
  THROW 52212,N'Order with entitlements must remain paid.',1;
END;
GO
CREATE OR ALTER TRIGGER dbo.TR_GiaoDich_GiuBangChung ON dbo.GiaoDich
 AFTER UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS (
    SELECT 1 FROM deleted old
    JOIN dbo.DonHang d WITH(UPDLOCK,HOLDLOCK) ON d.MaDonHang=old.MaDonHang
    LEFT JOIN dbo.QuyenLoiGoi q WITH(UPDLOCK,HOLDLOCK) ON q.MaDonHang=d.MaDonHang
    WHERE old.TrangThai='success' AND d.TrangThai='paid' AND NOT EXISTS (
      SELECT 1 FROM dbo.GiaoDich g WITH(UPDLOCK,HOLDLOCK)
      WHERE g.MaDonHang=d.MaDonHang AND g.TrangThai='success'
        AND (q.MaQuyenLoi IS NULL OR g.NguonXacNhan=q.NguonXacNhan)
    )
 )
  THROW 52213,N'Cannot remove or invalidate the transaction supporting a paid order.',1;
END;
GO
CREATE OR ALTER TRIGGER dbo.TR_QuyenLoiGoi_ThanhToanHopLe ON dbo.QuyenLoiGoi
 AFTER INSERT,UPDATE AS
BEGIN
 SET NOCOUNT ON;
 IF NOT (UPDATE(MaDonHang) OR UPDATE(NguonXacNhan)) RETURN;
 IF EXISTS (SELECT 1 FROM inserted q
   JOIN dbo.DonHang d WITH(UPDLOCK,HOLDLOCK) ON d.MaDonHang=q.MaDonHang
   WHERE d.TrangThai<>'paid' OR NOT EXISTS
     (SELECT 1 FROM dbo.GiaoDich g WITH(UPDLOCK,HOLDLOCK)
      WHERE g.MaDonHang=q.MaDonHang AND g.TrangThai='success' AND g.NguonXacNhan=q.NguonXacNhan))
  THROW 52214,N'Entitlement requires a paid order and a matching successful transaction.',1;
END;
GO
CREATE OR ALTER TRIGGER dbo.TR_CongViecXuLy_LienKetHopLe ON dbo.CongViecXuLy
 AFTER INSERT,UPDATE AS
BEGIN
 SET NOCOUNT ON;
 IF NOT (UPDATE(MaVideo) OR UPDATE(MaNguoiDung)) RETURN;
 IF EXISTS (SELECT 1 FROM inserted j JOIN dbo.Video v WITH(UPDLOCK,HOLDLOCK) ON v.MaVideo=j.MaVideo
            WHERE j.MaNguoiDung<>v.MaNguoiDung)
  THROW 52215,N'Processing job must belong to the video owner.',1;
 IF EXISTS (SELECT 1 FROM inserted j JOIN dbo.TepXuat t WITH(UPDLOCK,HOLDLOCK) ON t.MaCongViec=j.MaCongViec
            WHERE t.MaVideo<>j.MaVideo OR (t.MaVideo IS NULL AND j.MaVideo IS NOT NULL)
               OR (t.MaVideo IS NOT NULL AND j.MaVideo IS NULL))
  THROW 52216,N'Export must refer to the same video as its job.',1;
END;
GO
CREATE OR ALTER TRIGGER dbo.TR_Video_GiuChuCongViec ON dbo.Video
 AFTER UPDATE AS
BEGIN
 SET NOCOUNT ON;
 IF NOT UPDATE(MaNguoiDung) RETURN;
 IF EXISTS (SELECT 1 FROM inserted v JOIN dbo.CongViecXuLy j WITH(UPDLOCK,HOLDLOCK) ON j.MaVideo=v.MaVideo
            WHERE j.MaNguoiDung<>v.MaNguoiDung)
  THROW 52215,N'Processing job must belong to the video owner.',1;
END;
GO
CREATE OR ALTER TRIGGER dbo.TR_TepXuat_CungVideo ON dbo.TepXuat
 AFTER INSERT,UPDATE AS
BEGIN
 SET NOCOUNT ON;
 IF NOT (UPDATE(MaCongViec) OR UPDATE(MaVideo)) RETURN;
 IF EXISTS (SELECT 1 FROM inserted t JOIN dbo.CongViecXuLy j WITH(UPDLOCK,HOLDLOCK) ON j.MaCongViec=t.MaCongViec
            WHERE t.MaVideo<>j.MaVideo OR (t.MaVideo IS NULL AND j.MaVideo IS NOT NULL)
               OR (t.MaVideo IS NOT NULL AND j.MaVideo IS NULL))
  THROW 52216,N'Export must refer to the same video as its job.',1;
END;
GO
