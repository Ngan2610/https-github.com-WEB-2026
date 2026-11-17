/* =====================================================================
   DUBCHEF - XÓA DỮ LIỆU MẪU (gồm cả dữ liệu của 09c-du-lieu-mau-bo-sung.sql)
   Chỉ xóa dữ liệu mẫu: email @demo.dubchef.local, mã khách bắt đầu bằng 'demo-',
   EventId webhook 'demo-...', lý do '[DEMO] ...'. Dữ liệu thật không bị ảnh hưởng.
   Giữ lại dữ liệu tham chiếu: BangGia, GoiDichVu, BangGiaDonVi, TyGia, CauHinhHeThong, NgonNgu.
   ===================================================================== */
USE DubchefDB;
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRANSACTION;

/* ---- Phần bổ sung (09c): xóa trước vì các bảng này tham chiếu đơn hàng, video, người dùng ---- */
IF OBJECT_ID(N'dbo.NhatKyQuanTri', N'U') IS NOT NULL
    DELETE FROM dbo.NhatKyQuanTri
    WHERE (Loai = 'user_status' AND DoiTuong LIKE N'%@demo.dubchef.local')
       OR (Loai = 'video_status' AND DoiTuong IN (SELECT CAST(v.MaVideo AS NVARCHAR(254)) FROM dbo.Video v JOIN dbo.NguoiDung u ON u.MaNguoiDung = v.MaNguoiDung WHERE u.Email LIKE N'%@demo.dubchef.local'))
       OR (Loai = 'order_owner_link' AND DoiTuong IN (SELECT CONCAT(N'order:', d.MaDonHang) FROM dbo.DonHang d WHERE d.EmailKhachHang LIKE N'%@demo.dubchef.local'));

IF OBJECT_ID(N'dbo.LichSuXuLyPhanHoi', N'U') IS NOT NULL
    DELETE FROM dbo.LichSuXuLyPhanHoi
    WHERE MaPhanHoi IN (SELECT p.MaPhanHoi FROM dbo.PhanHoi p JOIN dbo.NguoiDung u ON u.MaNguoiDung = p.MaNguoiDung WHERE u.Email LIKE N'%@demo.dubchef.local')
       OR MaLienHe IN (SELECT MaLienHe FROM dbo.LienHe WHERE Email LIKE N'%@demo.dubchef.local');

IF OBJECT_ID(N'dbo.LichSuNoiDung', N'U') IS NOT NULL
    DELETE FROM dbo.LichSuNoiDung
    WHERE MaVideo IN (SELECT v.MaVideo FROM dbo.Video v JOIN dbo.NguoiDung u ON u.MaNguoiDung = v.MaNguoiDung WHERE u.Email LIKE N'%@demo.dubchef.local');

IF OBJECT_ID(N'dbo.TepXuat', N'U') IS NOT NULL
    DELETE FROM dbo.TepXuat
    WHERE MaVideo IN (SELECT v.MaVideo FROM dbo.Video v JOIN dbo.NguoiDung u ON u.MaNguoiDung = v.MaNguoiDung WHERE u.Email LIKE N'%@demo.dubchef.local')
       OR MaCongViec IN (SELECT j.MaCongViec FROM dbo.CongViecXuLy j JOIN dbo.NguoiDung u ON u.MaNguoiDung = j.MaNguoiDung WHERE u.Email LIKE N'%@demo.dubchef.local');

IF OBJECT_ID(N'dbo.CongViecXuLy', N'U') IS NOT NULL
    DELETE j FROM dbo.CongViecXuLy j JOIN dbo.NguoiDung u ON u.MaNguoiDung = j.MaNguoiDung WHERE u.Email LIKE N'%@demo.dubchef.local';

-- Xóa lịch sử sử dụng trước, rồi mới xóa quyền lợi (trigger tự trừ bộ đếm).
IF OBJECT_ID(N'dbo.SuDungQuyenLoi', N'U') IS NOT NULL
    DELETE s FROM dbo.SuDungQuyenLoi s
    JOIN dbo.QuyenLoiGoi q ON q.MaQuyenLoi = s.MaQuyenLoi
    JOIN dbo.NguoiDung u ON u.MaNguoiDung = q.MaNguoiDung
    WHERE u.Email LIKE N'%@demo.dubchef.local';

IF OBJECT_ID(N'dbo.QuyenLoiGoi', N'U') IS NOT NULL
    DELETE q FROM dbo.QuyenLoiGoi q JOIN dbo.NguoiDung u ON u.MaNguoiDung = q.MaNguoiDung WHERE u.Email LIKE N'%@demo.dubchef.local';

IF OBJECT_ID(N'dbo.XacMinhChuDonHang', N'U') IS NOT NULL
    DELETE m FROM dbo.XacMinhChuDonHang m JOIN dbo.DonHang d ON d.MaDonHang = m.MaDonHang WHERE d.EmailKhachHang LIKE N'%@demo.dubchef.local';

IF OBJECT_ID(N'dbo.WebhookNhan', N'U') IS NOT NULL
    DELETE FROM dbo.WebhookNhan
    WHERE EventId LIKE 'demo-%'
       OR MaDonHang IN (SELECT MaDonHang FROM dbo.DonHang WHERE EmailKhachHang LIKE N'%@demo.dubchef.local');

IF OBJECT_ID(N'dbo.MaDatLaiMatKhau', N'U') IS NOT NULL
    DELETE m FROM dbo.MaDatLaiMatKhau m JOIN dbo.NguoiDung u ON u.MaNguoiDung = m.MaNguoiDung WHERE u.Email LIKE N'%@demo.dubchef.local';

IF OBJECT_ID(N'dbo.LanDangNhapSai', N'U') IS NOT NULL
    DELETE FROM dbo.LanDangNhapSai
    WHERE IpHash IN (SELECT LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONCAT(N'demo-ip-', n)), 2)) FROM (VALUES (1), (2), (3), (4)) AS k(n));

IF OBJECT_ID(N'dbo.LichSuDoiGia', N'U') IS NOT NULL
    DELETE FROM dbo.LichSuDoiGia WHERE LEFT(LyDo, 6) = N'[DEMO]';
IF OBJECT_ID(N'dbo.LichSuBangGia', N'U') IS NOT NULL
    DELETE FROM dbo.LichSuBangGia WHERE LEFT(LyDo, 6) = N'[DEMO]';

/* ---- Phần dữ liệu mẫu nền (09) ---- */
-- Đơn đã thanh toán phải chuyển sang 'cancelled' trước khi xóa giao dịch (trigger bảo vệ bằng chứng thanh toán).
UPDATE dbo.DonHang SET TrangThai='cancelled'
WHERE TrangThai='paid' AND EmailKhachHang LIKE N'%@demo.dubchef.local';
DELETE g FROM dbo.GiaoDich g JOIN dbo.DonHang d ON d.MaDonHang = g.MaDonHang WHERE d.EmailKhachHang LIKE N'%@demo.dubchef.local';
DELETE FROM dbo.DonHang WHERE EmailKhachHang LIKE N'%@demo.dubchef.local';
DELETE FROM dbo.LienHe WHERE Email LIKE N'%@demo.dubchef.local';
DELETE p FROM dbo.PhanHoi p JOIN dbo.NguoiDung u ON u.MaNguoiDung = p.MaNguoiDung WHERE u.Email LIKE N'%@demo.dubchef.local';
DELETE v FROM dbo.Video v JOIN dbo.NguoiDung u ON u.MaNguoiDung = v.MaNguoiDung WHERE u.Email LIKE N'%@demo.dubchef.local';
DELETE FROM dbo.NguoiDung WHERE Email LIKE N'%@demo.dubchef.local';
DELETE FROM dbo.LuotTruyCap WHERE MaKhach LIKE 'demo-%';
DELETE FROM dbo.LuotQuetQR WHERE MaKhach LIKE 'demo-%';

COMMIT TRANSACTION;
PRINT N'Đã xóa dữ liệu mẫu.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    PRINT N'Không xóa được (đã hoàn tác). Lỗi: ' + ERROR_MESSAGE();
END CATCH;
