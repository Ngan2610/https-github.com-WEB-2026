/* Canonical read-only SSMS dashboard: SQL Server 2022, UTC+7.
   Requires canonical migrations 001..022; DO NOT treat demo or legacy as revenue. */
USE [DubchefDB];
GO
SET NOCOUNT ON;
IF OBJECT_ID('dbo.SchemaMigrations','U') IS NULL OR
   OBJECT_ID('dbo.WebhookNhan','U') IS NULL OR
   OBJECT_ID('dbo.QuyenLoiGoi','U') IS NULL OR
   OBJECT_ID('dbo.SuDungQuyenLoi','U') IS NULL OR
   OBJECT_ID('dbo.CauHinhHeThong','U') IS NULL OR
   OBJECT_ID('dbo.CongViecXuLy','U') IS NULL OR
   OBJECT_ID('dbo.TepXuat','U') IS NULL OR
   OBJECT_ID('dbo.ThuyetMinh','U') IS NULL OR
   OBJECT_ID('dbo.PhuDe','U') IS NULL OR
   OBJECT_ID('bc.KiemTraToanVen','V') IS NULL OR
   OBJECT_ID('dbo.vw_DoanhThuNgay','V') IS NULL OR
   OBJECT_ID('bc.BaoCaoTongHop','V') IS NULL OR
   OBJECT_ID('dbo.NguoiDung','U') IS NULL OR
   OBJECT_ID('dbo.DonHang','U') IS NULL OR
   OBJECT_ID('dbo.GiaoDich','U') IS NULL OR
   OBJECT_ID('dbo.BangGia','U') IS NULL OR
   OBJECT_ID('dbo.GoiDichVu','U') IS NULL OR
   OBJECT_ID('dbo.LichSuBangGia','U') IS NULL OR
   OBJECT_ID('dbo.NhatKyQuanTri','U') IS NULL OR
   OBJECT_ID('dbo.NgonNgu','U') IS NULL OR
   OBJECT_ID('dbo.LuotQuetQR','U') IS NULL OR
   OBJECT_ID('dbo.LuotTruyCap','U') IS NULL OR
   OBJECT_ID('dbo.PhanHoi','U') IS NULL OR
   OBJECT_ID('dbo.LienHe','U') IS NULL OR
   OBJECT_ID('dbo.LichSuDangNhap','U') IS NULL OR
   OBJECT_ID('dbo.LichSuNoiDung','U') IS NULL OR
   OBJECT_ID('dbo.BangGiaDonVi','U') IS NULL OR
   OBJECT_ID('dbo.TyGia','U') IS NULL OR
   OBJECT_ID('dbo.LichSuDoiGia','U') IS NULL
 THROW 51940,N'Incomplete database. Apply db/migrations/RUN_ALL_IN_SSMS.sql first.',1;
GO
-- 1) Single-row KPI; all amounts in VND minor units and only authenticated payOS.
SELECT
 (SELECT COUNT_BIG(*) FROM dbo.NguoiDung WHERE VaiTro='user' AND NgayXoa IS NULL) AS NguoiDung,
 (SELECT COUNT_BIG(*) FROM dbo.Video) AS SoVideo,
 (SELECT COUNT_BIG(*) FROM dbo.DonHang WHERE TrangThai='pending') AS DonDangCho,
 (SELECT COUNT_BIG(*) FROM dbo.GiaoDich WHERE TrangThai='success' AND NguonXacNhan='payos' AND LoaiTien='VND') AS GiaoDichPayOSXacMinh,
 (SELECT COALESCE(SUM(TongSoTien),0) FROM dbo.vw_DoanhThuNgay WHERE LoaiTien='VND') AS DoanhThuThucVND,
 (SELECT COALESCE(SUM(TongTienMoPhong),0) FROM dbo.vw_DoanhThuNgay WHERE LoaiTien='VND') AS MoPhongVND,
 (SELECT COALESCE(SUM(TongTienChuaXacMinh),0) FROM dbo.vw_DoanhThuNgay WHERE LoaiTien='VND') AS ChuaXacMinhVND,
 (SELECT COUNT_BIG(*) FROM dbo.LienHe WHERE TrangThai NOT IN ('resolved','closed')) AS LienHeDangXuLy,
 (SELECT COUNT_BIG(*) FROM dbo.QuyenLoiGoi WHERE NgayHetHan IS NULL OR NgayHetHan>SYSUTCDATETIME()) AS GoiConHan;
GO
-- 2) Users and explicitly linked orders only. Email is NOT used as ownership key.
SELECT TOP(100) u.MaNguoiDung,u.HoTen,u.Email,u.TrangThai,u.NgayXoa,
 COUNT(DISTINCT d.MaDonHang) AS SoDonLienKet,
 (SELECT COUNT_BIG(*) FROM dbo.Video v WHERE v.MaNguoiDung=u.MaNguoiDung) AS SoVideo
FROM dbo.NguoiDung u LEFT JOIN dbo.DonHang d ON d.MaNguoiDung=u.MaNguoiDung
WHERE u.VaiTro='user'
GROUP BY u.MaNguoiDung,u.HoTen,u.Email,u.TrangThai,u.NgayXoa
ORDER BY u.MaNguoiDung DESC;
GO
-- 3) Recent orders: new records must have MaNguoiDung and price snapshot.
SELECT TOP(100) d.MaDonHang,d.MaNguoiDung,d.DonCu,d.TenKhachHang,
 d.SoVideoDang,d.SoVideoDich,d.LoaiTien,d.SoTien,d.TrangThai,
 d.DonGiaDangSnapshot,d.DonGiaDichSnapshot,d.PhienBanGiaSnapshot,
 DATEADD(HOUR,7,d.NgayTao) AS NgayTaoVN
FROM dbo.DonHang d ORDER BY d.NgayTao DESC,d.MaDonHang DESC;
GO
-- 4) Usage/remaining quotas, from ledger-consistent DB counters.
SELECT TOP(100) q.MaQuyenLoi,q.MaNguoiDung,q.MaDonHang,
 q.SoVideoDang,q.DaDungVideoDang,q.SoVideoDang-q.DaDungVideoDang AS VideoConLai,
 q.SoVideoDich,q.DaDungVideoDich,q.SoVideoDich-q.DaDungVideoDich AS BanDichConLai,
 q.NgayHetHan,q.NguonXacNhan
FROM dbo.QuyenLoiGoi q ORDER BY q.NgayCap DESC,q.MaQuyenLoi DESC;
GO
-- 5) Vietnamese-calendar daily revenues; demo and unknown are strictly separate.
SELECT Ngay AS NgayVN,LoaiTien,SoGiaoDich,TongSoTien,
 SoGiaoDichMoPhong,TongTienMoPhong,SoGiaoDichChuaXacMinh,TongTienChuaXacMinh
FROM dbo.vw_DoanhThuNgay
WHERE Ngay>=CONVERT(DATE,DATEADD(DAY,-30,DATEADD(HOUR,7,SYSUTCDATETIME())))
ORDER BY Ngay DESC,LoaiTien;
GO
-- 6) Payment and webhook integrity summary.
SELECT (SELECT COUNT_BIG(*) FROM dbo.WebhookNhan WHERE ChuKyHopLe=1 AND KetQua='processed') AS WebhookDaXacMinh,
 (SELECT COUNT_BIG(*) FROM dbo.WebhookNhan WHERE KetQua='rejected') AS WebhookBiTuChoi,
 (SELECT COUNT_BIG(*) FROM dbo.DonHang WHERE DonCu=1 AND MaNguoiDung IS NULL) AS DonCuChuaXacMinhChu;
GO
-- 7) Background jobs (export/ASR/translate/TTS): totals by state, then the newest 50.
SELECT Loai,TrangThai,COUNT_BIG(*) AS SoCongViec,MAX(DATEADD(HOUR,7,NgayCapNhat)) AS CapNhatCuoiVN
FROM dbo.CongViecXuLy GROUP BY Loai,TrangThai ORDER BY Loai,TrangThai;
GO
SELECT TOP(50) j.MaCongViec,j.MaVideo,j.MaNguoiDung,j.Loai,j.TrangThai,j.TienDo,j.SoLanThu,j.Loi,
 DATEADD(HOUR,7,j.NgayTao) AS NgayTaoVN,DATEADD(HOUR,7,j.NgayCapNhat) AS CapNhatVN
FROM dbo.CongViecXuLy j ORDER BY j.MaCongViec DESC;
GO
-- 7b) Stuck jobs: running with no heartbeat for 30+ minutes (the worker recovers these on restart). Empty = healthy.
SELECT j.MaCongViec,j.MaVideo,j.Loai,j.TienDo,j.SoLanThu,DATEADD(HOUR,7,j.NgayCapNhat) AS CapNhatCuoiVN
FROM dbo.CongViecXuLy j
WHERE j.TrangThai='running' AND j.NgayCapNhat<DATEADD(MINUTE,-30,SYSUTCDATETIME());
GO
-- 8) Exported files recorded by the worker (mp3/mp4/srt/vtt) with size and checksum.
SELECT TOP(100) t.MaTep,t.MaCongViec,t.MaVideo,t.Loai,t.DuongDan,t.DungLuong,t.Sha256,
 DATEADD(HOUR,7,t.NgayTao) AS NgayTaoVN
FROM dbo.TepXuat t ORDER BY t.MaTep DESC;
GO
-- 9) Saved results per video: how many subtitle/narration languages exist and their review state/version.
SELECT TOP(100) v.MaVideo,v.TieuDe,v.TrangThai,v.NgonNguGoc,
 (SELECT COUNT_BIG(*) FROM dbo.PhuDe d WHERE d.MaVideo=v.MaVideo) AS SoPhuDe,
 (SELECT COUNT_BIG(*) FROM dbo.ThuyetMinh t WHERE t.MaVideo=v.MaVideo) AS SoThuyetMinh,
 (SELECT STRING_AGG(CONCAT(d.NgonNgu,':',d.TrangThaiDuyet,' v',d.PhienBan),', ') FROM dbo.PhuDe d WHERE d.MaVideo=v.MaVideo) AS PhuDeTheoNgonNgu,
 (SELECT STRING_AGG(CONCAT(t.NgonNgu,':',t.TrangThaiDuyet,' v',t.PhienBan),', ') FROM dbo.ThuyetMinh t WHERE t.MaVideo=v.MaVideo) AS ThuyetMinhTheoNgonNgu,
 DATEADD(HOUR,7,v.NgayTaiLen) AS NgayTaiLenVN
FROM dbo.Video v ORDER BY v.MaVideo DESC;
GO
-- 10) Data-integrity findings (view from migration 020). EMPTY RESULT = no problem found.
SELECT * FROM bc.KiemTraToanVen;
GO

-- ============================================================================
-- PHẦN BỔ SUNG: BÁO CÁO TỔNG HỢP CHO DEMO VÀ NGHIỆM THU (CHỈ SELECT)
-- Lưu ý: Bảng BangGiaDonVi/TyGia là dữ liệu cấu hình bổ sung; giao diện
-- hiện đọc BangGia và GoiDichVu. Không cộng tiền từ đơn demo vào doanh thu thật.
-- ============================================================================

-- 11) Bảng giá HIỆN HÀNH — đúng với GET /api/pricing và trang quản trị.
SELECT bg.LoaiTien,bg.DonGiaDangMinor,bg.DonGiaDichMinor,
 bg.GioiHanVideo,bg.GioiHanBanDich,bg.GiamGiaNamPct,bg.PhienBan,
 bg.NguoiSua,DATEADD(HOUR,7,bg.NgayCapNhat) AS CapNhatVN
FROM dbo.BangGia AS bg ORDER BY CASE bg.LoaiTien WHEN 'VND' THEN 1 WHEN 'USD' THEN 2 ELSE 3 END;
GO

-- 12) Danh mục gói, số lượt và ước tính giá VND theo BangGia (KHÔNG phải khoản thu).
SELECT g.MaGoi,g.TenGoi,g.SoVideoDang,g.SoVideoDich,g.ThoiHanNgay,
 g.HienThi,g.ThuTu,
 CAST(g.SoVideoDang AS BIGINT)*b.DonGiaDangMinor+CAST(g.SoVideoDich AS BIGINT)*b.DonGiaDichMinor AS GiaGoiThamKhaoVND,
 CASE WHEN g.SoVideoDang>b.GioiHanVideo OR g.SoVideoDich>CAST(g.SoVideoDang AS BIGINT)*b.GioiHanBanDich
      THEN N'Vượt giới hạn' ELSE N'Hợp lệ' END AS HopLeTheoBangGiaVND,
 DATEADD(HOUR,7,g.NgayCapNhat) AS NgayCapNhatVN
FROM dbo.GoiDichVu AS g
LEFT JOIN dbo.BangGia AS b ON b.LoaiTien='VND'
ORDER BY g.ThuTu,g.MaGoi;
GO

-- 13) Lịch sử thay đổi đơn giá — bảng này độc lập nhật ký quản trị gói.
SELECT TOP(100) l.MaLichSu,l.LoaiTien,l.PhienBanCu,l.PhienBanMoi,
 l.NguoiSua,l.LyDo,JSON_VALUE(l.GiaCu,'$.uploadMinor') AS GiaDangCu,
 JSON_VALUE(l.GiaMoi,'$.uploadMinor') AS GiaDangMoi,
 JSON_VALUE(l.GiaCu,'$.translationMinor') AS GiaDichCu,
 JSON_VALUE(l.GiaMoi,'$.translationMinor') AS GiaDichMoi,
 DATEADD(HOUR,7,l.NgaySua) AS NgaySuaVN
FROM dbo.LichSuBangGia AS l ORDER BY l.MaLichSu DESC;
GO

-- 14) Nhật ký thêm/sửa/ẩn/hiện gói của Admin (nếu phát sinh).
SELECT TOP(100) nk.MaNhatKy,nk.Loai,nk.DoiTuong,nk.NguoiThucHien,
 nk.GiaTriCu,nk.GiaTriMoi,DATEADD(HOUR,7,nk.ThoiGian) AS ThoiGianVN
FROM dbo.NhatKyQuanTri AS nk WHERE nk.Loai LIKE 'pricing_pack_%'
ORDER BY nk.MaNhatKy DESC;
GO

-- 15) Đối soát các đơn đã thanh toán với giao dịch, nguồn xác minh và quyền lợi.
SELECT TOP(150) d.MaDonHang,d.MaNguoiDung,u.Email AS EmailTaiKhoan,
 d.TenKhachHang,d.SoVideoDang,d.SoVideoDich,d.LoaiTien,d.SoTien,d.TrangThai,
 g.MaGiaoDich,g.TrangThai AS TrangThaiGiaoDich,g.NguonXacNhan,
 g.NhaCungCap,g.PhuongThuc,g.MaThamChieu,
 q.MaQuyenLoi,q.NguonXacNhan AS NguonCapQuyen,
 DATEADD(HOUR,7,d.NgayTao) AS NgayTaoVN,
 DATEADD(HOUR,7,g.NgayThanhToan) AS NgayThanhToanVN
FROM dbo.DonHang d
LEFT JOIN dbo.NguoiDung u ON u.MaNguoiDung=d.MaNguoiDung
LEFT JOIN dbo.GiaoDich g ON g.MaDonHang=d.MaDonHang AND g.TrangThai='success'
LEFT JOIN dbo.QuyenLoiGoi q ON q.MaDonHang=d.MaDonHang
ORDER BY d.MaDonHang DESC;
GO

-- 16) Nhật ký tiêu dùng quyền lợi (không cộng trùng lượt hoàn trả).
SELECT TOP(150) s.MaSuDung,s.MaQuyenLoi,q.MaNguoiDung,q.MaDonHang,
 s.MaVideo,s.Loai,s.NgonNgu,s.TrangThai,
 DATEADD(HOUR,7,s.NgaySuDung) AS NgaySuDungVN
FROM dbo.SuDungQuyenLoi AS s
INNER JOIN dbo.QuyenLoiGoi q ON q.MaQuyenLoi=s.MaQuyenLoi
ORDER BY s.MaSuDung DESC;
GO

-- 17) Người quét QR trong 7/14/30 ngày theo giờ Việt Nam.
SELECT p.SoNgay,
 COUNT(DISTINCT CASE WHEN x.NgayQuet >= DATEADD(DAY,-p.SoNgay,SYSUTCDATETIME()) THEN x.MaKhach END) AS SoNguoiQuet,
 COUNT(CASE WHEN x.NgayQuet >= DATEADD(DAY,-p.SoNgay,SYSUTCDATETIME()) THEN 1 END) AS TongLuotQuet
FROM (VALUES(7),(14),(30)) p(SoNgay)
LEFT JOIN dbo.LuotQuetQR x ON 1=1
GROUP BY p.SoNgay ORDER BY p.SoNgay;
GO
-- 17b) Nhật ký QR theo ngày: người quét duy nhất và lượt quét.
SELECT CONVERT(DATE,DATEADD(HOUR,7,q.NgayQuet)) AS NgayVN,
 COUNT_BIG(*) AS TongLuot,COUNT(DISTINCT q.MaKhach) AS NguoiQuetDuyNhat
FROM dbo.LuotQuetQR q
GROUP BY CONVERT(DATE,DATEADD(HOUR,7,q.NgayQuet))
ORDER BY NgayVN DESC;
GO
-- 17c) 50 lượt quét gần đây (không in mã khách nhận diện).
SELECT TOP(50) q.MaLuotQuet,q.NgonNgu,
 DATEADD(HOUR,7,q.NgayQuet) AS NgayQuetVN
FROM dbo.LuotQuetQR q ORDER BY q.NgayQuet DESC;
GO

-- 18) Truy cập trang công khai: nhóm theo ngày/đường dẫn.
SELECT TOP(100) CONVERT(DATE,DATEADD(HOUR,7,lt.NgayTruyCap)) AS NgayVN,
 lt.DuongDan,COUNT_BIG(*) AS LuotXem,COUNT(DISTINCT lt.MaKhach) AS KhachDuyNhat
FROM dbo.LuotTruyCap lt
GROUP BY CONVERT(DATE,DATEADD(HOUR,7,lt.NgayTruyCap)),lt.DuongDan
ORDER BY NgayVN DESC,LuotXem DESC;
GO

-- 19) Danh sách ngôn ngữ và tính sẵn sàng cấu hình.
SELECT nn.MaNgonNgu,nn.TenNgonNgu,nn.TenTiengAnh,nn.TrangThai,
 DATEADD(HOUR,7,nn.NgayTao) AS NgayTaoVN
FROM dbo.NgonNgu nn ORDER BY nn.MaNgonNgu;
GO

-- 20) Video: chủ sở hữu, trạng thái, số phụ đề, thuyết minh, kết quả xuất.
SELECT TOP(100) v.MaVideo,v.MaNguoiDung,u.Email AS EmailChuSoHuu,
 v.TieuDe,v.NgonNguGoc,v.TrangThai,v.DinhDang,v.DungLuong,
 (SELECT COUNT_BIG(*) FROM dbo.PhuDe pd WHERE pd.MaVideo=v.MaVideo) AS SoPhuDe,
 (SELECT COUNT_BIG(*) FROM dbo.ThuyetMinh tm WHERE tm.MaVideo=v.MaVideo) AS SoThuyetMinh,
 (SELECT COUNT_BIG(*) FROM dbo.TepXuat tx WHERE tx.MaVideo=v.MaVideo) AS SoTepXuat,
 DATEADD(HOUR,7,v.NgayTaiLen) AS NgayTaiLenVN
FROM dbo.Video v LEFT JOIN dbo.NguoiDung u ON u.MaNguoiDung=v.MaNguoiDung
ORDER BY v.MaVideo DESC;
GO

-- 21) Lịch sử duyệt nội dung; không in JSON dài trong bản tổng quan.
SELECT TOP(100) ls.MaLichSu,ls.Loai,ls.MaVideo,ls.NgonNgu,
 ls.PhienBan,ls.TrangThai,ls.NguoiSua,
 LEN(ls.NoiDung) AS SoKyTuNoiDung,DATEADD(HOUR,7,ls.ThoiGian) AS ThoiGianVN
FROM dbo.LichSuNoiDung ls ORDER BY ls.MaLichSu DESC;
GO

-- 22) Phản hồi người dùng & liên hệ khách (hai nguồn dữ liệu khác nhau).
SELECT TOP(100) p.MaPhanHoi,p.MaNguoiDung,u.Email,p.MaVideo,p.TrangThai,
 p.UuTien,p.NguoiXuLy,p.NoiDung,p.TraLoi,
 DATEADD(HOUR,7,p.NgayTao) AS NgayTaoVN
FROM dbo.PhanHoi p LEFT JOIN dbo.NguoiDung u ON u.MaNguoiDung=p.MaNguoiDung
ORDER BY p.MaPhanHoi DESC;
GO
SELECT TOP(100) lh.MaLienHe,lh.HoTen,lh.Email,lh.TrangThai,
 lh.NoiDung,lh.TraLoi,DATEADD(HOUR,7,lh.NgayTao) AS NgayTaoVN
FROM dbo.LienHe lh ORDER BY lh.MaLienHe DESC;
GO

-- 23) Lịch sử đăng nhập (không lấy mật khẩu hoặc token).
SELECT TOP(100) lg.MaLichSu,lg.MaNguoiDung,nd.Email,
 DATEADD(HOUR,7,lg.ThoiGian) AS ThoiGianVN
FROM dbo.LichSuDangNhap lg
LEFT JOIN dbo.NguoiDung nd ON nd.MaNguoiDung=lg.MaNguoiDung
ORDER BY lg.MaLichSu DESC;
GO

-- 24) Nhật ký quản trị tổng hợp (thao tác tài khoản, video, gói dịch vụ).
SELECT TOP(100) nk.MaNhatKy,nk.Loai,nk.DoiTuong,nk.NguoiThucHien,
 nk.GiaTriCu,nk.GiaTriMoi,DATEADD(HOUR,7,nk.ThoiGian) AS ThoiGianVN
FROM dbo.NhatKyQuanTri nk ORDER BY nk.MaNhatKy DESC;
GO

-- 25) Danh sách job lỗi, phục vụ kiểm tra ASR/translate/TTS/export.
SELECT TOP(100) j.MaCongViec,j.MaVideo,j.MaNguoiDung,j.Loai,j.TrangThai,
 j.TienDo,j.SoLanThu,j.Loi,DATEADD(HOUR,7,j.NgayCapNhat) AS CapNhatVN
FROM dbo.CongViecXuLy j WHERE j.TrangThai IN ('failed','cancelled')
ORDER BY j.NgayCapNhat DESC,j.MaCongViec DESC;
GO

-- 26) Thống kê số lượng file đầu ra MP3/MP4/SRT/VTT.
SELECT t.Loai,COUNT_BIG(*) AS SoTep,
 SUM(CONVERT(BIGINT,t.DungLuong)) AS TongDungLuongByte
FROM dbo.TepXuat t GROUP BY t.Loai ORDER BY t.Loai;
GO

-- 27) Cấu hình giá/vận hành phụ trợ: đếm bản ghi, KHÔNG đọc giá trị bí mật.
SELECT N'BangGia' AS Bang,COUNT_BIG(*) AS SoBanGhi FROM dbo.BangGia
UNION ALL SELECT N'GoiDichVu',COUNT_BIG(*) FROM dbo.GoiDichVu
UNION ALL SELECT N'BangGiaDonVi',COUNT_BIG(*) FROM dbo.BangGiaDonVi
UNION ALL SELECT N'TyGia',COUNT_BIG(*) FROM dbo.TyGia
UNION ALL SELECT N'LichSuDoiGia',COUNT_BIG(*) FROM dbo.LichSuDoiGia
UNION ALL SELECT N'CauHinhHeThong',COUNT_BIG(*) FROM dbo.CauHinhHeThong
UNION ALL SELECT N'WebhookNhan',COUNT_BIG(*) FROM dbo.WebhookNhan;
GO

-- 28) Các phiên bản migration đã ghi nhận — không tự chạy migration tại đây.
SELECT Version,FileName,DATEADD(HOUR,7,AppliedAt) AS AppliedAtVN
FROM dbo.SchemaMigrations ORDER BY Version;
GO

-- 29) Các gói đang hiển thị nhưng vượt giới hạn: không có dòng = hợp lệ.
SELECT g.MaGoi,g.TenGoi,g.SoVideoDang,g.SoVideoDich,b.LoaiTien,
 b.GioiHanVideo,b.GioiHanBanDich
FROM dbo.GoiDichVu g CROSS JOIN dbo.BangGia b
WHERE g.HienThi=1 AND (g.SoVideoDang>b.GioiHanVideo
 OR g.SoVideoDich>CONVERT(BIGINT,g.SoVideoDang)*b.GioiHanBanDich);
GO

-- 30) Kiểm tra sơ bộ bản chụp giá của đơn mới: không có dòng = hợp lệ.
SELECT d.MaDonHang,d.MaNguoiDung,d.DonCu,d.DonGiaDangSnapshot,
 d.DonGiaDichSnapshot,d.PhienBanGiaSnapshot
FROM dbo.DonHang d
WHERE d.DonCu=0 AND
 (d.MaNguoiDung IS NULL OR d.DonGiaDangSnapshot IS NULL
 OR d.DonGiaDichSnapshot IS NULL OR d.PhienBanGiaSnapshot IS NULL);
GO

-- 31) Báo cáo quản trị theo nhóm do migration 020 tạo sẵn.
SELECT [Nhóm],[Chỉ số],[Giá trị],[Ghi chú]
FROM bc.BaoCaoTongHop ORDER BY STT;
GO

-- 32) Kết luận kiểm tra dữ liệu: chỉ hiện số vấn đề; xem mục 10 để thấy chi tiết.
SELECT COUNT_BIG(*) AS SoVanDeToanVen FROM bc.KiemTraToanVen;
GO
