/* =====================================================================
   DUBCHEF - DỮ LIỆU MẪU BỔ SUNG (phần 09-du-lieu-mau.sql còn thiếu)
   Cách dùng : 1) Chạy db/migrations/RUN_ALL_IN_SSMS.sql (đủ migration 001-022).
               2) Chạy 09-du-lieu-mau.sql (dữ liệu nền: người dùng, video, đơn cũ...).
               3) Mở file này trong SSMS, bấm Execute (F5).
   Bổ sung   : bảng giá + gói + cấu hình (nếu chưa có), đơn hàng kiểu mới (payOS / mô phỏng
               / chờ / hết hạn / lỗi / hoàn tiền), quyền lợi gói + lịch sử sử dụng, webhook,
               công việc xử lý + tệp xuất, lịch sử thuyết minh/phụ đề, lịch sử xử lý phản hồi,
               xác minh chủ đơn cũ, nhật ký quản trị, mã đặt lại mật khẩu, đăng nhập sai,
               tỷ giá, bảng giá theo thời điểm, lịch sử đổi giá.
   An toàn   : - Chỉ THÊM dòng mới (một vài dòng mẫu của 09 được bổ sung cột người xử lý / phiên bản).
               - Dòng mẫu nhận biết bằng email @demo.dubchef.local, mã tham chiếu DEMO-...,
                 EventId 'demo-...', lý do '[DEMO] ...'.
               - Chạy lại không tạo trùng. Muốn xóa: chạy 09b-xoa-du-lieu-mau.sql
                 (đã xử lý cả dữ liệu của file này; dữ liệu tham chiếu như bảng giá, gói,
                 tỷ giá, cấu hình được giữ lại).
   Ghi chú   : Tiền lưu theo đơn vị nhỏ nhất: VND = đồng, USD = cent, CNY = xu.
   ===================================================================== */
USE DubchefDB;
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;

/* ---- Kiểm tra điều kiện chạy ------------------------------------------ */
IF OBJECT_ID(N'dbo.QuyenLoiGoi',N'U') IS NULL OR OBJECT_ID(N'dbo.WebhookNhan',N'U') IS NULL
   OR OBJECT_ID(N'dbo.CongViecXuLy',N'U') IS NULL OR OBJECT_ID(N'dbo.TepXuat',N'U') IS NULL
   OR OBJECT_ID(N'dbo.MaDatLaiMatKhau',N'U') IS NULL OR OBJECT_ID(N'dbo.LanDangNhapSai',N'U') IS NULL
   OR OBJECT_ID(N'dbo.TyGia',N'U') IS NULL OR OBJECT_ID(N'dbo.BangGiaDonVi',N'U') IS NULL
   OR OBJECT_ID(N'dbo.LichSuDoiGia',N'U') IS NULL OR OBJECT_ID(N'dbo.CauHinhHeThong',N'U') IS NULL
   OR OBJECT_ID(N'dbo.XacMinhChuDonHang',N'U') IS NULL OR OBJECT_ID(N'dbo.LichSuNoiDung',N'U') IS NULL
   OR OBJECT_ID(N'dbo.LichSuXuLyPhanHoi',N'U') IS NULL OR OBJECT_ID(N'dbo.NhatKyQuanTri',N'U') IS NULL
   OR OBJECT_ID(N'dbo.BangGia',N'U') IS NULL OR OBJECT_ID(N'dbo.LichSuBangGia',N'U') IS NULL
   OR OBJECT_ID(N'dbo.GoiDichVu',N'U') IS NULL OR OBJECT_ID(N'dbo.NgonNgu',N'U') IS NULL
   OR COL_LENGTH(N'dbo.DonHang',N'DonCu') IS NULL OR COL_LENGTH(N'dbo.DonHang',N'GiamGiaSnapshotPct') IS NULL
   OR COL_LENGTH(N'dbo.GiaoDich',N'NguonXacNhan') IS NULL OR COL_LENGTH(N'dbo.GiaoDich',N'PayOSOrderCode') IS NULL
   OR COL_LENGTH(N'dbo.Video',N'ThoiLuong') IS NULL OR COL_LENGTH(N'dbo.ThuyetMinh',N'NguoiSuaId') IS NULL
   OR COL_LENGTH(N'dbo.PhanHoi',N'NguoiXuLyId') IS NULL OR COL_LENGTH(N'dbo.NhatKyQuanTri',N'NguoiThucHienId') IS NULL
BEGIN
    PRINT N'Thiếu bảng/cột của migration 010-022. Hãy chạy db/migrations/RUN_ALL_IN_SSMS.sql trước, rồi chạy lại file này.';
    RETURN;
END;

IF NOT EXISTS (SELECT 1 FROM dbo.NguoiDung WHERE Email = N'minhanh@demo.dubchef.local')
BEGIN
    PRINT N'Chưa có dữ liệu mẫu nền. Hãy chạy 09-du-lieu-mau.sql trước, rồi chạy lại file này.';
    RETURN;
END;

IF EXISTS (SELECT 1 FROM dbo.WebhookNhan WHERE EventId LIKE 'demo-%')
BEGIN
    PRINT N'Dữ liệu mẫu bổ sung đã có sẵn, không thêm lần nữa. Muốn làm lại: chạy 09b-xoa-du-lieu-mau.sql trước.';
    RETURN;
END;

BEGIN TRY
BEGIN TRANSACTION;

DECLARE @now DATETIME2(0) = SYSUTCDATETIME();
DECLARE @admin NVARCHAR(254) = N'admin@dubchef.vn';   -- trùng với NguoiSua / NguoiXuLy của 09-du-lieu-mau.sql
DECLARE @adminId INT = (SELECT MaNguoiDung FROM dbo.NguoiDung WHERE Email = @admin);  -- NULL nếu chưa có tài khoản này: các cột *Id cho phép NULL

/* =====================================================================
   1. DỮ LIỆU THAM CHIẾU (chỉ thêm khi còn thiếu)
   ===================================================================== */
INSERT dbo.NgonNgu (MaNgonNgu, TenNgonNgu, TenTiengAnh, TrangThai)
SELECT v.Ma, v.Ten, v.TenAnh, 'active'
FROM (VALUES ('vi', N'Tiếng Việt', N'Vietnamese'), ('en', N'Tiếng Anh', N'English'), ('zh', N'Tiếng Trung', N'Chinese')) AS v(Ma, Ten, TenAnh)
WHERE NOT EXISTS (SELECT 1 FROM dbo.NgonNgu n WHERE n.MaNgonNgu = v.Ma);

INSERT dbo.BangGia (LoaiTien, DonGiaDangMinor, DonGiaDichMinor, GioiHanVideo, GioiHanBanDich, GiamGiaNamPct)
SELECT v.Tien, v.Dang, v.Dich, 500, 3, 20
FROM (VALUES ('VND', 20000, 10000), ('USD', 80, 40), ('CNY', 600, 300)) AS v(Tien, Dang, Dich)
WHERE NOT EXISTS (SELECT 1 FROM dbo.BangGia b WHERE b.LoaiTien = v.Tien);

INSERT dbo.GoiDichVu (MaGoi, TenGoi, SoVideoDang, SoVideoDich, ThuTu)
SELECT v.Ma, v.Ten, v.Dang, v.Dich, v.Ma
FROM (VALUES (1, N'Cơ bản', 3, 3), (2, N'Tiêu chuẩn', 10, 20), (3, N'Chuyên nghiệp', 30, 90), (4, N'Doanh nghiệp', 100, 300)) AS v(Ma, Ten, Dang, Dich)
WHERE NOT EXISTS (SELECT 1 FROM dbo.GoiDichVu g WHERE g.MaGoi = v.Ma);

INSERT dbo.CauHinhHeThong (Khoa, KieuGiaTri, GiaTri, MaNguoiSua)
SELECT v.Khoa, v.Kieu, v.GiaTri, @adminId
FROM (VALUES
 (N'video.maxBytes',              'integer', N'157286400'),
 (N'video.maxDurationSeconds',    'integer', N'900'),
 (N'translation.targetLanguages', 'json',    N'["vi","en","zh"]'),
 (N'payment.provider',            'string',  N'payos'),
 (N'payment.demoMode',            'boolean', N'true'),
 (N'export.retentionDays',        'integer', N'7'),
 (N'support.autoCloseDays',       'integer', N'14')
) AS v(Khoa, Kieu, GiaTri)
WHERE NOT EXISTS (SELECT 1 FROM dbo.CauHinhHeThong c WHERE c.Khoa = v.Khoa);

/* Bảng giá theo thời điểm: mốc cũ và mốc hiện hành (trùng với BangGia). */
INSERT dbo.BangGiaDonVi (LoaiTien, DonGiaDangMinor, DonGiaDichMinor, HieuLucTu)
SELECT v.Tien, v.Dang, v.Dich, CAST(v.Tu AS DATETIME2(0))
FROM (VALUES
 ('VND', 18000, 9000, '2026-01-01T00:00:00'), ('VND', 20000, 10000, '2026-06-01T00:00:00'),
 ('USD',    72,   36, '2026-01-01T00:00:00'), ('USD',    80,    40, '2026-06-01T00:00:00'),
 ('CNY',   540,  270, '2026-01-01T00:00:00'), ('CNY',   600,   300, '2026-06-01T00:00:00')
) AS v(Tien, Dang, Dich, Tu)
WHERE NOT EXISTS (SELECT 1 FROM dbo.BangGiaDonVi b WHERE b.LoaiTien = v.Tien AND b.HieuLucTu = CAST(v.Tu AS DATETIME2(0)));

/* Tỷ giá quy đổi sang VND (số liệu minh họa). */
INSERT dbo.TyGia (LoaiTien, VNDChoMotDonVi, NgayHieuLuc)
SELECT v.Tien, v.Gia, CAST(v.Tu AS DATETIME2(0))
FROM (VALUES
 ('USD', 25100.000000, '2026-01-01T00:00:00'), ('USD', 25400.000000, '2026-06-01T00:00:00'),
 ('CNY',  3480.000000, '2026-01-01T00:00:00'), ('CNY',  3520.000000, '2026-06-01T00:00:00')
) AS v(Tien, Gia, Tu)
WHERE NOT EXISTS (SELECT 1 FROM dbo.TyGia t WHERE t.LoaiTien = v.Tien AND t.NgayHieuLuc = CAST(v.Tu AS DATETIME2(0)));

INSERT dbo.LichSuDoiGia (LoaiTien, MaNguoiDung, GiaCu, GiaMoi, LyDo, NgayTao, NgayCapNhat)
SELECT v.Tien, @adminId, v.Cu, v.Moi, N'[DEMO] Cập nhật tỷ giá theo ngân hàng', DATEADD(DAY, -v.Ngay, @now), DATEADD(DAY, -v.Ngay, @now)
FROM (VALUES
 ('USD', N'{"vndPerUnit":25100}', N'{"vndPerUnit":25400}', 40),
 ('CNY', N'{"vndPerUnit":3480}',  N'{"vndPerUnit":3520}',  40)
) AS v(Tien, Cu, Moi, Ngay);

/* Lịch sử đổi giá bán: chỉ tạo khi bảng giá còn ở phiên bản 1 và chưa có lịch sử thật. */
INSERT dbo.LichSuBangGia (LoaiTien, GiaCu, GiaMoi, PhienBanCu, PhienBanMoi, NguoiSua, LyDo, NgaySua)
SELECT b.LoaiTien,
  (SELECT b.LoaiTien AS currency, b.DonGiaDangMinor * 9 / 10 AS uploadMinor, b.DonGiaDichMinor * 9 / 10 AS translationMinor,
          b.GioiHanVideo AS maxVideos, b.GioiHanBanDich AS maxTranslations, b.GiamGiaNamPct AS annualDiscountPct, 0 AS [version]
   FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
  (SELECT b.LoaiTien AS currency, b.DonGiaDangMinor AS uploadMinor, b.DonGiaDichMinor AS translationMinor,
          b.GioiHanVideo AS maxVideos, b.GioiHanBanDich AS maxTranslations, b.GiamGiaNamPct AS annualDiscountPct, CAST(b.PhienBan AS INT) AS [version]
   FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
  0, b.PhienBan, @admin, N'[DEMO] Điều chỉnh đơn giá theo bảng giá mới', DATEADD(DAY, -45, @now)
FROM dbo.BangGia b
WHERE b.PhienBan = 1 AND NOT EXISTS (SELECT 1 FROM dbo.LichSuBangGia h WHERE h.LoaiTien = b.LoaiTien);

/* =====================================================================
   2. BỔ SUNG CỘT CHO VIDEO MẪU (thời lượng, mã băm, nguồn, mã yêu cầu tải lên)
   ===================================================================== */
UPDATE v SET
    ThoiLuong       = CAST(45 + (v.MaVideo * 37) % 240 AS DECIMAL(12,3)) + 0.480,
    Sha256          = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONCAT(N'demo-video-', v.MaVideo)), 2)),
    Nguon           = 'upload',
    MaYeuCauTaiLen  = LOWER(CONVERT(VARCHAR(36), NEWID())),
    NgayCapNhat     = CASE WHEN v.TrangThai = 'completed' THEN DATEADD(MINUTE, 30, v.NgayTaiLen) ELSE v.NgayTaiLen END
FROM dbo.Video v
JOIN dbo.NguoiDung u ON u.MaNguoiDung = v.MaNguoiDung AND u.Email LIKE N'%@demo.dubchef.local'
WHERE v.ThoiLuong IS NULL AND v.Sha256 IS NULL AND v.MaYeuCauTaiLen IS NULL;

/* Liên kết người xử lý (cột *Id) cho các dòng mẫu của 09, như migration 021 làm với dữ liệu thật. */
UPDATE t SET NguoiSuaId = a.MaNguoiDung
FROM dbo.ThuyetMinh t
JOIN dbo.Video v ON v.MaVideo = t.MaVideo
JOIN dbo.NguoiDung u ON u.MaNguoiDung = v.MaNguoiDung AND u.Email LIKE N'%@demo.dubchef.local'
JOIN dbo.NguoiDung a ON a.Email = t.NguoiSua
WHERE t.NguoiSuaId IS NULL;

UPDATE t SET NguoiSuaId = a.MaNguoiDung
FROM dbo.PhuDe t
JOIN dbo.Video v ON v.MaVideo = t.MaVideo
JOIN dbo.NguoiDung u ON u.MaNguoiDung = v.MaNguoiDung AND u.Email LIKE N'%@demo.dubchef.local'
JOIN dbo.NguoiDung a ON a.Email = t.NguoiSua
WHERE t.NguoiSuaId IS NULL;

UPDATE p SET NguoiXuLyId = a.MaNguoiDung
FROM dbo.PhanHoi p
JOIN dbo.NguoiDung u ON u.MaNguoiDung = p.MaNguoiDung AND u.Email LIKE N'%@demo.dubchef.local'
JOIN dbo.NguoiDung a ON a.Email = p.NguoiXuLy
WHERE p.NguoiXuLyId IS NULL;

/* Liên hệ đã xem xét / đã giải quyết cần có người xử lý. */
UPDATE dbo.LienHe SET
    NguoiXuLy = @admin, NguoiXuLyId = @adminId,
    NgayGiaiQuyet = CASE WHEN TrangThai = 'resolved' THEN DATEADD(HOUR, 2, NgayTao) END,
    NgayCapNhat = DATEADD(HOUR, 2, NgayTao)
WHERE Email LIKE N'%@demo.dubchef.local' AND TrangThai IN ('reviewing', 'resolved') AND NguoiXuLy IS NULL;

/* =====================================================================
   3. ĐƠN HÀNG KIỂU MỚI (có MaNguoiDung + ảnh chụp giá) VÀ GIAO DỊCH
   ===================================================================== */
CREATE TABLE #n (Ten NVARCHAR(100), Email NVARCHAR(254), Dang INT, Dich INT, Tien CHAR(3),
                 TrangThai VARCHAR(10), TxTrangThai VARCHAR(10), Nguon VARCHAR(20), PhuongThuc VARCHAR(10),
                 Ref VARCHAR(40), NgayTao DATETIME2(0), SoTien BIGINT, UpMinor BIGINT, OutMinor BIGINT, Ver BIGINT);
INSERT #n (Ten, Email, Dang, Dich, Tien, TrangThai, TxTrangThai, Nguon, PhuongThuc, Ref, NgayTao) VALUES
 (N'Nguyễn Minh Anh', N'minhanh@demo.dubchef.local', 10, 20, 'VND', 'paid',      'success', 'payos', 'payos', 'DEMO-PAYOS-0001', DATEADD(DAY,  -20, @now)),
 (N'Trần Quốc Bảo',   N'quocbao@demo.dubchef.local',  3,  3, 'VND', 'paid',      'success', 'demo',  'demo',  'DEMO-SIM-0001',   DATEADD(DAY,  -16, @now)),
 (N'Lê Thu Hà',       N'thuha@demo.dubchef.local',   10, 20, 'VND', 'paid',      'success', 'payos', 'payos', 'DEMO-PAYOS-0002', DATEADD(DAY,   -8, @now)),
 (N'Lê Thu Hà',       N'thuha@demo.dubchef.local',    3,  3, 'VND', 'refunded',  'refunded','payos', 'payos', 'DEMO-PAYOS-0003', DATEADD(DAY,   -7, @now)),
 (N'Phạm Gia Huy',    N'giahuy@demo.dubchef.local',   3,  6, 'USD', 'expired',   'expired', 'payos', 'payos', 'DEMO-PAYOS-0004', DATEADD(DAY,   -3, @now)),
 (N'Trần Quốc Bảo',   N'quocbao@demo.dubchef.local',  1,  3, 'CNY', 'failed',    'failed',  'payos', 'payos', 'DEMO-PAYOS-0005', DATEADD(DAY,   -2, @now)),
 (N'Nguyễn Minh Anh', N'minhanh@demo.dubchef.local', 30, 90, 'VND', 'pending',   'pending', 'payos', 'payos', 'DEMO-PAYOS-0006', DATEADD(MINUTE, -3, @now));

UPDATE n SET
    SoTien   = CAST(n.Dang AS BIGINT) * b.DonGiaDangMinor + CAST(n.Dich AS BIGINT) * b.DonGiaDichMinor,
    UpMinor  = b.DonGiaDangMinor,
    OutMinor = b.DonGiaDichMinor,
    Ver      = b.PhienBan
FROM #n n JOIN dbo.BangGia b ON b.LoaiTien = n.Tien;

INSERT dbo.DonHang (DonCu, MaNguoiDung, TenKhachHang, EmailKhachHang, SoVideoDang, SoVideoDich, LoaiTien, SoTien, TrangThai, NgayTao,
                    DonGiaDangSnapshot, DonGiaDichSnapshot, PhienBanGiaSnapshot, GiamGiaSnapshotPct, ThoiHanSnapshotNgay)
SELECT 0, u.MaNguoiDung, n.Ten, n.Email, n.Dang, n.Dich, n.Tien, n.SoTien,
       CASE WHEN n.TrangThai = 'paid' THEN 'pending' ELSE n.TrangThai END,   -- đơn paid được nâng cấp sau khi có giao dịch thành công
       n.NgayTao, n.UpMinor, n.OutMinor, n.Ver, 0, NULL
FROM #n n JOIN dbo.NguoiDung u ON u.Email = n.Email;

INSERT dbo.GiaoDich (MaDonHang, PhuongThuc, SoTien, LoaiTien, TrangThai, MaThamChieu, NgayThanhToan,
                     NguonXacNhan, NhaCungCap, PayOSOrderCode, PaymentLinkId, NgayHetHan)
SELECT d.MaDonHang, n.PhuongThuc, n.SoTien, n.Tien, n.TxTrangThai, n.Ref,
       CASE n.TxTrangThai WHEN 'success'  THEN DATEADD(MINUTE, 7, n.NgayTao)
                          WHEN 'refunded' THEN DATEADD(MINUTE, 7, n.NgayTao)
                          WHEN 'failed'   THEN DATEADD(MINUTE, 3, n.NgayTao)
                          ELSE n.NgayTao END,
       n.Nguon,
       CASE WHEN n.Nguon = 'payos' THEN 'payos' END,
       CASE WHEN n.Nguon = 'payos' THEN d.MaDonHang END,
       CASE WHEN n.Nguon = 'payos' THEN CONCAT('demo-link-', n.Ref) END,
       CASE WHEN n.TxTrangThai IN ('pending', 'expired') THEN DATEADD(MINUTE, 15, n.NgayTao) END
FROM #n n
JOIN dbo.DonHang d ON d.EmailKhachHang = n.Email AND d.NgayTao = n.NgayTao AND d.DonCu = 0;

UPDATE d SET TrangThai = 'paid'
FROM dbo.DonHang d
JOIN #n n ON d.EmailKhachHang = n.Email AND d.NgayTao = n.NgayTao AND d.DonCu = 0
WHERE n.TrangThai = 'paid';

/* =====================================================================
   4. QUYỀN LỢI GÓI VÀ LỊCH SỬ SỬ DỤNG (bộ đếm do trigger tự cập nhật)
   ===================================================================== */
INSERT dbo.QuyenLoiGoi (MaDonHang, MaNguoiDung, SoVideoDang, SoVideoDich, NguonXacNhan, NgayCap)
SELECT d.MaDonHang, d.MaNguoiDung, d.SoVideoDang, d.SoVideoDich, g.NguonXacNhan, g.NgayThanhToan
FROM dbo.DonHang d
JOIN dbo.GiaoDich g ON g.MaDonHang = d.MaDonHang AND g.TrangThai = 'success'
WHERE d.DonCu = 0 AND d.TrangThai = 'paid' AND d.EmailKhachHang LIKE N'%@demo.dubchef.local'
  AND NOT EXISTS (SELECT 1 FROM dbo.QuyenLoiGoi q WHERE q.MaDonHang = d.MaDonHang);

CREATE TABLE #u (Email NVARCHAR(254), TieuDe NVARCHAR(200), Loai VARCHAR(12), NgonNgu VARCHAR(8) NULL, TrangThai VARCHAR(12), Phut INT);
INSERT #u (Email, TieuDe, Loai, NgonNgu, TrangThai, Phut) VALUES
 (N'minhanh@demo.dubchef.local', N'Hướng dẫn nấu phở bò',      'upload',      NULL, 'used',     5),
 (N'minhanh@demo.dubchef.local', N'Cách làm bánh mì Sài Gòn',   'upload',      NULL, 'used',     5),
 (N'minhanh@demo.dubchef.local', N'Hướng dẫn nấu phở bò',      'translation', 'en', 'used',    60),
 (N'minhanh@demo.dubchef.local', N'Hướng dẫn nấu phở bò',      'translation', 'zh', 'used',    90),
 (N'minhanh@demo.dubchef.local', N'Cách làm bánh mì Sài Gòn',   'translation', 'en', 'used',    60),
 (N'minhanh@demo.dubchef.local', N'Cách làm bánh mì Sài Gòn',   'translation', 'zh', 'refunded', 75),  -- bản dịch lỗi, đã hoàn lượt
 (N'quocbao@demo.dubchef.local', N'Bún chả Hà Nội',            'upload',      NULL, 'used',     5),
 (N'quocbao@demo.dubchef.local', N'Fresh spring rolls',        'upload',      NULL, 'used',     5),
 (N'quocbao@demo.dubchef.local', N'Bún chả Hà Nội',            'translation', 'en', 'used',    60),
 (N'quocbao@demo.dubchef.local', N'Bún chả Hà Nội',            'translation', 'zh', 'used',    90),
 (N'quocbao@demo.dubchef.local', N'Fresh spring rolls',        'translation', 'vi', 'used',    60),
 (N'thuha@demo.dubchef.local',   N'Chè khúc bạch',             'upload',      NULL, 'used',     5),
 (N'thuha@demo.dubchef.local',   N'Cơm tấm sườn nướng',        'upload',      NULL, 'used',     5),
 (N'thuha@demo.dubchef.local',   N'Cơm tấm sườn nướng',        'translation', 'en', 'used',    60);

INSERT dbo.SuDungQuyenLoi (MaQuyenLoi, MaVideo, Loai, NgonNgu, TrangThai, NgaySuDung)
SELECT q.MaQuyenLoi, v.MaVideo, x.Loai, x.NgonNgu, x.TrangThai, DATEADD(MINUTE, x.Phut, v.NgayTaiLen)
FROM #u x
JOIN dbo.NguoiDung nd ON nd.Email = x.Email
JOIN dbo.Video v ON v.MaNguoiDung = nd.MaNguoiDung AND v.TieuDe = x.TieuDe
JOIN dbo.QuyenLoiGoi q ON q.MaNguoiDung = nd.MaNguoiDung;

/* =====================================================================
   5. WEBHOOK payOS
   ===================================================================== */
INSERT dbo.WebhookNhan (EventId, NhaCungCap, MaDonHang, ChuKyHopLe, PayloadSha256, KetQua, NgayNhan, NgayCapNhat)
SELECT w.EventId, 'payos', g.MaDonHang, w.HopLe,
       LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', w.EventId), 2)),
       w.KetQua, DATEADD(SECOND, w.Giay, g.NgayThanhToan), DATEADD(SECOND, w.Giay + 1, g.NgayThanhToan)
FROM (VALUES
 ('demo-payos:DEMO-PAYOS-0001',       'DEMO-PAYOS-0001', 1, 'processed',  2),
 ('demo-payos:DEMO-PAYOS-0001:retry', 'DEMO-PAYOS-0001', 1, 'duplicate', 40),
 ('demo-payos:DEMO-PAYOS-0002',       'DEMO-PAYOS-0002', 1, 'processed',  3),
 ('demo-payos:DEMO-PAYOS-0003',       'DEMO-PAYOS-0003', 1, 'processed',  3),
 ('demo-payos:DEMO-PAYOS-0005',       'DEMO-PAYOS-0005', 1, 'failed',     4)
) AS w(EventId, Ref, HopLe, KetQua, Giay)
JOIN dbo.GiaoDich g ON g.MaThamChieu = w.Ref;

-- Một webhook sai chữ ký bị từ chối, không gắn với đơn nào.
INSERT dbo.WebhookNhan (EventId, NhaCungCap, MaDonHang, ChuKyHopLe, PayloadSha256, KetQua, NgayNhan, NgayCapNhat)
VALUES ('demo-payos:invalid-signature-1', 'payos', NULL, 0,
        LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', 'demo-payos:invalid-signature-1'), 2)),
        'rejected', DATEADD(HOUR, -30, @now), DATEADD(HOUR, -30, @now));

/* =====================================================================
   6. CÔNG VIỆC XỬ LÝ VÀ TỆP XUẤT
   ===================================================================== */
INSERT dbo.CongViecXuLy (MaVideo, MaNguoiDung, Loai, TrangThai, TienDo, Loi, SoLanThu, NgayTao, NgayCapNhat)
SELECT v.MaVideo, v.MaNguoiDung, s.Loai,
       CASE v.TrangThai WHEN 'completed' THEN 'completed'
            WHEN 'processing' THEN CASE s.Thu WHEN 1 THEN 'completed' WHEN 2 THEN 'running' ELSE 'queued' END
            WHEN 'failed' THEN 'failed' ELSE 'queued' END,
       CASE v.TrangThai WHEN 'completed' THEN 100
            WHEN 'processing' THEN CASE s.Thu WHEN 1 THEN 100 WHEN 2 THEN 60 ELSE 0 END
            WHEN 'failed' THEN 35 ELSE 0 END,
       CASE WHEN v.TrangThai = 'failed' THEN N'Không nhận dạng được giọng nói: âm thanh bị lỗi hoặc nhiều tiếng ồn.' END,
       CASE WHEN v.TrangThai = 'failed' THEN 3 WHEN v.TrangThai = 'processing' AND s.Thu = 2 THEN 1 ELSE 0 END,
       DATEADD(MINUTE, s.Thu * 2, v.NgayTaiLen),
       DATEADD(MINUTE, s.Thu * 2 + 3, v.NgayTaiLen)
FROM dbo.Video v
JOIN dbo.NguoiDung u ON u.MaNguoiDung = v.MaNguoiDung AND u.Email LIKE N'%@demo.dubchef.local'
CROSS JOIN (VALUES ('asr', 1), ('translate', 2), ('tts', 3), ('export', 4)) AS s(Loai, Thu)
WHERE v.TrangThai IN ('completed', 'processing')
   OR (v.TrangThai IN ('failed', 'uploaded') AND s.Thu = 1);

INSERT dbo.TepXuat (MaCongViec, MaVideo, Loai, DuongDan, DungLuong, Sha256, NgayHetHan, NgayTao, NgayCapNhat)
SELECT j.MaCongViec, j.MaVideo, f.Loai, p.Duong,
       CASE f.Loai WHEN 'mp4' THEN v.DungLuong WHEN 'mp3' THEN v.DungLuong / 12 WHEN 'srt' THEN 4096 ELSE 4300 END,
       LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', p.Duong), 2)),
       DATEADD(DAY, 7, j.NgayCapNhat), j.NgayCapNhat, j.NgayCapNhat
FROM dbo.CongViecXuLy j
JOIN dbo.Video v ON v.MaVideo = j.MaVideo
JOIN dbo.NguoiDung u ON u.MaNguoiDung = v.MaNguoiDung AND u.Email LIKE N'%@demo.dubchef.local'
JOIN (VALUES ('tts', 'mp3'), ('export', 'mp4'), ('export', 'srt'), ('export', 'vtt')) AS f(LoaiViec, Loai) ON f.LoaiViec = j.Loai
CROSS APPLY (SELECT CONCAT(N'demo/export/', j.MaVideo, N'/video-', j.MaVideo, N'.', f.Loai) AS Duong) p
WHERE j.TrangThai = 'completed';

/* =====================================================================
   7. THUYẾT MINH / PHỤ ĐỀ: thêm bản tiếng Trung, lịch sử phiên bản, vài lần chỉnh sửa
   ===================================================================== */
INSERT dbo.ThuyetMinh (MaVideo, NgonNgu, NoiDung, TrangThaiDuyet, NguoiSua, NguoiSuaId, NgayTao, NgayCapNhat)
SELECT v.MaVideo, 'zh',
       N'[{"start":0,"end":4,"text":"大家好，今天我们一起来做一道美味的菜。"},{"start":4,"end":9,"text":"首先，请准备好所有的食材。"}]',
       'reviewing', @admin, @adminId, DATEADD(HOUR, 2, v.NgayTaiLen), DATEADD(HOUR, 2, v.NgayTaiLen)
FROM dbo.Video v JOIN dbo.NguoiDung u ON u.MaNguoiDung = v.MaNguoiDung AND u.Email LIKE N'%@demo.dubchef.local'
WHERE v.TieuDe IN (N'Hướng dẫn nấu phở bò', N'Bún chả Hà Nội')
  AND NOT EXISTS (SELECT 1 FROM dbo.ThuyetMinh t WHERE t.MaVideo = v.MaVideo AND t.NgonNgu = 'zh');

INSERT dbo.PhuDe (MaVideo, NgonNgu, NoiDung, TrangThaiDuyet, NguoiSua, NguoiSuaId, NgayTao, NgayCapNhat)
SELECT v.MaVideo, 'zh',
       N'[{"start":0,"end":4,"text":"大家好，今天我们一起来做一道美味的菜。"},{"start":4,"end":9,"text":"首先，请准备好所有的食材。"}]',
       'reviewing', @admin, @adminId, DATEADD(HOUR, 2, v.NgayTaiLen), DATEADD(HOUR, 2, v.NgayTaiLen)
FROM dbo.Video v JOIN dbo.NguoiDung u ON u.MaNguoiDung = v.MaNguoiDung AND u.Email LIKE N'%@demo.dubchef.local'
WHERE v.TieuDe IN (N'Hướng dẫn nấu phở bò', N'Bún chả Hà Nội')
  AND NOT EXISTS (SELECT 1 FROM dbo.PhuDe t WHERE t.MaVideo = v.MaVideo AND t.NgonNgu = 'zh');

-- Phiên bản 1 của mọi bản thuyết minh / phụ đề mẫu (đúng trạng thái hiện tại, trước khi chỉnh sửa).
INSERT dbo.LichSuNoiDung (Loai, MaVideo, NgonNgu, PhienBan, TrangThai, NoiDung, NguoiSua, NguoiSuaId, ThoiGian)
SELECT 'narrations', t.MaVideo, t.NgonNgu, t.PhienBan, t.TrangThaiDuyet, t.NoiDung, ISNULL(t.NguoiSua, N'system'), t.NguoiSuaId, t.NgayCapNhat
FROM dbo.ThuyetMinh t
JOIN dbo.Video v ON v.MaVideo = t.MaVideo
JOIN dbo.NguoiDung u ON u.MaNguoiDung = v.MaNguoiDung AND u.Email LIKE N'%@demo.dubchef.local';

INSERT dbo.LichSuNoiDung (Loai, MaVideo, NgonNgu, PhienBan, TrangThai, NoiDung, NguoiSua, NguoiSuaId, ThoiGian)
SELECT 'subtitles', t.MaVideo, t.NgonNgu, t.PhienBan, t.TrangThaiDuyet, t.NoiDung, ISNULL(t.NguoiSua, N'system'), t.NguoiSuaId, t.NgayCapNhat
FROM dbo.PhuDe t
JOIN dbo.Video v ON v.MaVideo = t.MaVideo
JOIN dbo.NguoiDung u ON u.MaNguoiDung = v.MaNguoiDung AND u.Email LIKE N'%@demo.dubchef.local';

-- Ba lần chỉnh sửa của quản trị viên (phiên bản 2).
UPDATE t SET
    NoiDung = N'[{"start":0,"end":4,"text":"Xin chào các bạn, hôm nay chúng ta cùng nấu món phở bò thơm ngon."},{"start":4,"end":9,"text":"Đầu tiên, hãy chuẩn bị xương bò, thịt bò và các loại gia vị."}]',
    PhienBan = 2, TrangThaiDuyet = 'published', NguoiSua = @admin, NguoiSuaId = @adminId, NgayCapNhat = DATEADD(HOUR, 3, t.NgayTao)
FROM dbo.ThuyetMinh t
JOIN dbo.Video v ON v.MaVideo = t.MaVideo
JOIN dbo.NguoiDung u ON u.MaNguoiDung = v.MaNguoiDung AND u.Email = N'minhanh@demo.dubchef.local'
WHERE v.TieuDe = N'Hướng dẫn nấu phở bò' AND t.NgonNgu = 'vi';

UPDATE t SET   -- sửa phụ đề tiếng Anh sau phản hồi "chưa khớp ở đoạn 0:45"
    NoiDung = N'[{"start":0,"end":4,"text":"Hello everyone, today we are cooking delicious beef pho together."},{"start":4,"end":9,"text":"First, prepare the beef bones, beef and all the spices."},{"start":44,"end":49,"text":"Simmer the broth for at least three hours."}]',
    PhienBan = 2, TrangThaiDuyet = 'published', NguoiSua = @admin, NguoiSuaId = @adminId, NgayCapNhat = DATEADD(DAY, 1, t.NgayTao)
FROM dbo.PhuDe t
JOIN dbo.Video v ON v.MaVideo = t.MaVideo
JOIN dbo.NguoiDung u ON u.MaNguoiDung = v.MaNguoiDung AND u.Email = N'minhanh@demo.dubchef.local'
WHERE v.TieuDe = N'Hướng dẫn nấu phở bò' AND t.NgonNgu = 'en';

UPDATE t SET
    NoiDung = N'[{"start":0,"end":4,"text":"Hello everyone, today we are making Hanoi bun cha."},{"start":4,"end":9,"text":"First, marinate the pork with fish sauce, sugar and garlic."}]',
    PhienBan = 2, TrangThaiDuyet = 'reviewing', NguoiSua = @admin, NguoiSuaId = @adminId, NgayCapNhat = DATEADD(HOUR, 5, t.NgayTao)
FROM dbo.ThuyetMinh t
JOIN dbo.Video v ON v.MaVideo = t.MaVideo
JOIN dbo.NguoiDung u ON u.MaNguoiDung = v.MaNguoiDung AND u.Email = N'quocbao@demo.dubchef.local'
WHERE v.TieuDe = N'Bún chả Hà Nội' AND t.NgonNgu = 'en';

INSERT dbo.LichSuNoiDung (Loai, MaVideo, NgonNgu, PhienBan, TrangThai, NoiDung, NguoiSua, NguoiSuaId, ThoiGian)
SELECT 'narrations', t.MaVideo, t.NgonNgu, t.PhienBan, t.TrangThaiDuyet, t.NoiDung, t.NguoiSua, t.NguoiSuaId, t.NgayCapNhat
FROM dbo.ThuyetMinh t
JOIN dbo.Video v ON v.MaVideo = t.MaVideo
JOIN dbo.NguoiDung u ON u.MaNguoiDung = v.MaNguoiDung AND u.Email LIKE N'%@demo.dubchef.local'
WHERE t.PhienBan > 1;

INSERT dbo.LichSuNoiDung (Loai, MaVideo, NgonNgu, PhienBan, TrangThai, NoiDung, NguoiSua, NguoiSuaId, ThoiGian)
SELECT 'subtitles', t.MaVideo, t.NgonNgu, t.PhienBan, t.TrangThaiDuyet, t.NoiDung, t.NguoiSua, t.NguoiSuaId, t.NgayCapNhat
FROM dbo.PhuDe t
JOIN dbo.Video v ON v.MaVideo = t.MaVideo
JOIN dbo.NguoiDung u ON u.MaNguoiDung = v.MaNguoiDung AND u.Email LIKE N'%@demo.dubchef.local'
WHERE t.PhienBan > 1;

/* =====================================================================
   8. LỊCH SỬ XỬ LÝ PHẢN HỒI / LIÊN HỆ
   ===================================================================== */
INSERT dbo.LichSuXuLyPhanHoi (Nguon, MaBanGhi, TrangThai, UuTien, TraLoi, NguoiXuLy, NguoiXuLyId, ThoiGian, MaPhanHoi, MaLienHe)
SELECT 'user', p.MaPhanHoi, 'reviewing', p.UuTien, CAST(NULL AS NVARCHAR(2000)), @admin, @adminId, DATEADD(HOUR, 1, p.NgayTao), p.MaPhanHoi, NULL
FROM dbo.PhanHoi p JOIN dbo.NguoiDung u ON u.MaNguoiDung = p.MaNguoiDung AND u.Email LIKE N'%@demo.dubchef.local'
WHERE p.TrangThai IN ('reviewing', 'resolved')
UNION ALL
SELECT 'user', p.MaPhanHoi, 'resolved', p.UuTien, p.TraLoi, @admin, @adminId, ISNULL(p.NgayGiaiQuyet, DATEADD(HOUR, 5, p.NgayTao)), p.MaPhanHoi, NULL
FROM dbo.PhanHoi p JOIN dbo.NguoiDung u ON u.MaNguoiDung = p.MaNguoiDung AND u.Email LIKE N'%@demo.dubchef.local'
WHERE p.TrangThai = 'resolved'
UNION ALL
SELECT 'contact', c.MaLienHe, c.TrangThai, c.UuTien, c.TraLoi, @admin, @adminId, DATEADD(HOUR, 2, c.NgayTao), NULL, c.MaLienHe
FROM dbo.LienHe c
WHERE c.Email LIKE N'%@demo.dubchef.local' AND c.TrangThai IN ('reviewing', 'resolved');

/* =====================================================================
   9. XÁC MINH CHỦ ĐƠN CŨ (đơn cũ vẫn chỉ là dữ liệu lịch sử, không được cấp quyền lợi)
   ===================================================================== */
CREATE TABLE #x (Ref VARCHAR(40), Loai VARCHAR(30), BangChung NVARCHAR(120), LyDo NVARCHAR(500), Ngay INT);
INSERT #x (Ref, Loai, BangChung, LyDo, Ngay) VALUES
 ('DEMO-0001', 'payment_reference', N'DEMO-0001',      N'Khách cung cấp mã tham chiếu thanh toán trùng với giao dịch của đơn.', 10),
 ('DEMO-0003', 'support_ticket',    N'TICKET-2041',    N'Khách gửi yêu cầu hỗ trợ kèm email đặt hàng, quản trị đối chiếu và xác nhận.', 8),
 ('DEMO-0004', 'signed_receipt',    N'BL-0004-SIGNED', N'Khách gửi biên nhận có chữ ký, khớp số tiền và ngày thanh toán.', 3);

UPDATE d SET MaNguoiDung = u.MaNguoiDung
FROM #x x
JOIN dbo.GiaoDich g ON g.MaThamChieu = x.Ref
JOIN dbo.DonHang d ON d.MaDonHang = g.MaDonHang AND d.DonCu = 1 AND d.MaNguoiDung IS NULL
JOIN dbo.NguoiDung u ON u.Email = d.EmailKhachHang;

INSERT dbo.XacMinhChuDonHang (MaDonHang, MaNguoiDung, LoaiBangChung, MaBangChung, LyDo, NguoiXacMinh, NguoiXacMinhId, ThoiGian)
SELECT d.MaDonHang, d.MaNguoiDung, x.Loai, x.BangChung, x.LyDo, @admin, @adminId, DATEADD(DAY, -x.Ngay, @now)
FROM #x x
JOIN dbo.GiaoDich g ON g.MaThamChieu = x.Ref
JOIN dbo.DonHang d ON d.MaDonHang = g.MaDonHang AND d.DonCu = 1 AND d.MaNguoiDung IS NOT NULL
WHERE NOT EXISTS (SELECT 1 FROM dbo.XacMinhChuDonHang m WHERE m.MaDonHang = d.MaDonHang);

/* =====================================================================
   10. NHẬT KÝ QUẢN TRỊ
   ===================================================================== */
INSERT dbo.NhatKyQuanTri (Loai, DoiTuong, NguoiThucHien, NguoiThucHienId, GiaTriCu, GiaTriMoi, ThoiGian)
SELECT 'user_status', u.Email, @admin, @adminId, N'active', N'locked', DATEADD(DAY, -6, @now)
FROM dbo.NguoiDung u WHERE u.Email = N'ngoclan@demo.dubchef.local';

INSERT dbo.NhatKyQuanTri (Loai, DoiTuong, NguoiThucHien, NguoiThucHienId, GiaTriCu, GiaTriMoi, ThoiGian)
SELECT 'video_status', CAST(v.MaVideo AS NVARCHAR(254)), @admin, @adminId, s.Cu, s.Moi, DATEADD(HOUR, s.Gio, v.NgayTaiLen)
FROM (VALUES
 (N'minhanh@demo.dubchef.local', N'Hướng dẫn nấu phở bò', N'processing', N'completed', 1),
 (N'giahuy@demo.dubchef.local',  N'Mì Quảng',             N'processing', N'failed',    1),
 (N'thuha@demo.dubchef.local',   N'Chè khúc bạch',        N'uploaded',   N'processing', 0)
) AS s(Email, TieuDe, Cu, Moi, Gio)
JOIN dbo.NguoiDung u ON u.Email = s.Email
JOIN dbo.Video v ON v.MaNguoiDung = u.MaNguoiDung AND v.TieuDe = s.TieuDe;

INSERT dbo.NhatKyQuanTri (Loai, DoiTuong, NguoiThucHien, NguoiThucHienId, GiaTriCu, GiaTriMoi, ThoiGian)
SELECT 'order_owner_link', CONCAT(N'order:', m.MaDonHang), @admin, @adminId, NULL, CAST(m.MaNguoiDung AS NVARCHAR(40)), m.ThoiGian
FROM dbo.XacMinhChuDonHang m
JOIN dbo.NguoiDung u ON u.MaNguoiDung = m.MaNguoiDung AND u.Email LIKE N'%@demo.dubchef.local';

/* =====================================================================
   11. BẢO MẬT: MÃ ĐẶT LẠI MẬT KHẨU VÀ ĐĂNG NHẬP SAI
   ===================================================================== */
INSERT dbo.MaDatLaiMatKhau (MaNguoiDung, TokenSha256, NgayHetHan, DaDung, NgayTao, NgayCapNhat)
SELECT u.MaNguoiDung,
       LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONCAT(N'demo-reset-', u.Email)), 2)),
       DATEADD(MINUTE, 30, DATEADD(MINUTE, -v.TaoPhut, @now)), v.DaDung,
       DATEADD(MINUTE, -v.TaoPhut, @now), DATEADD(MINUTE, -v.TaoPhut, @now)
FROM (VALUES
 (N'thuha@demo.dubchef.local',   1,  2880),   -- đã dùng
 (N'giahuy@demo.dubchef.local',  0,     5),   -- còn hiệu lực
 (N'ngoclan@demo.dubchef.local', 0,  4320)    -- hết hạn, chưa dùng
) AS v(Email, DaDung, TaoPhut)
JOIN dbo.NguoiDung u ON u.Email = v.Email;

INSERT dbo.LanDangNhapSai (IpHash, SoLan, HanKhoa, NgayTao, NgayCapNhat)
SELECT LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONCAT(N'demo-ip-', v.N)), 2)),
       v.SoLan, DATEADD(MINUTE, v.KhoaPhut, @now), DATEADD(MINUTE, -v.TaoPhut, @now), DATEADD(MINUTE, -v.CapNhatPhut, @now)
FROM (VALUES
 (1,  1, -50,  300, 295),   -- hết hạn khóa
 (2,  3, -10,  120, 100),
 (3,  5,  10,   40,   2),   -- đang bị khóa
 (4, 10,  45,   90,   1)    -- đang bị khóa
) AS v(N, SoLan, KhoaPhut, TaoPhut, CapNhatPhut);

COMMIT TRANSACTION;

DROP TABLE #n; DROP TABLE #u; DROP TABLE #x;

PRINT N'Đã thêm dữ liệu mẫu bổ sung. Thống kê dòng mẫu theo bảng:';
SELECT Bang, SoDong FROM (VALUES
 (N'DonHang (kiểu mới, DonCu=0)', (SELECT COUNT(*) FROM dbo.DonHang WHERE DonCu = 0 AND EmailKhachHang LIKE N'%@demo.dubchef.local')),
 (N'GiaoDich (mã DEMO-)',         (SELECT COUNT(*) FROM dbo.GiaoDich WHERE MaThamChieu LIKE 'DEMO-%')),
 (N'QuyenLoiGoi',                 (SELECT COUNT(*) FROM dbo.QuyenLoiGoi q JOIN dbo.NguoiDung u ON u.MaNguoiDung = q.MaNguoiDung WHERE u.Email LIKE N'%@demo.dubchef.local')),
 (N'SuDungQuyenLoi',              (SELECT COUNT(*) FROM dbo.SuDungQuyenLoi s JOIN dbo.QuyenLoiGoi q ON q.MaQuyenLoi = s.MaQuyenLoi JOIN dbo.NguoiDung u ON u.MaNguoiDung = q.MaNguoiDung WHERE u.Email LIKE N'%@demo.dubchef.local')),
 (N'WebhookNhan',                 (SELECT COUNT(*) FROM dbo.WebhookNhan WHERE EventId LIKE 'demo-%')),
 (N'CongViecXuLy',                (SELECT COUNT(*) FROM dbo.CongViecXuLy j JOIN dbo.NguoiDung u ON u.MaNguoiDung = j.MaNguoiDung WHERE u.Email LIKE N'%@demo.dubchef.local')),
 (N'TepXuat',                     (SELECT COUNT(*) FROM dbo.TepXuat t JOIN dbo.CongViecXuLy j ON j.MaCongViec = t.MaCongViec JOIN dbo.NguoiDung u ON u.MaNguoiDung = j.MaNguoiDung WHERE u.Email LIKE N'%@demo.dubchef.local')),
 (N'LichSuNoiDung',               (SELECT COUNT(*) FROM dbo.LichSuNoiDung h JOIN dbo.Video v ON v.MaVideo = h.MaVideo JOIN dbo.NguoiDung u ON u.MaNguoiDung = v.MaNguoiDung WHERE u.Email LIKE N'%@demo.dubchef.local')),
 (N'LichSuXuLyPhanHoi',           (SELECT COUNT(*) FROM dbo.LichSuXuLyPhanHoi h LEFT JOIN dbo.PhanHoi p ON p.MaPhanHoi = h.MaPhanHoi LEFT JOIN dbo.NguoiDung u ON u.MaNguoiDung = p.MaNguoiDung LEFT JOIN dbo.LienHe c ON c.MaLienHe = h.MaLienHe WHERE u.Email LIKE N'%@demo.dubchef.local' OR c.Email LIKE N'%@demo.dubchef.local')),
 (N'XacMinhChuDonHang',           (SELECT COUNT(*) FROM dbo.XacMinhChuDonHang m JOIN dbo.NguoiDung u ON u.MaNguoiDung = m.MaNguoiDung WHERE u.Email LIKE N'%@demo.dubchef.local')),
 (N'MaDatLaiMatKhau',             (SELECT COUNT(*) FROM dbo.MaDatLaiMatKhau m JOIN dbo.NguoiDung u ON u.MaNguoiDung = m.MaNguoiDung WHERE u.Email LIKE N'%@demo.dubchef.local')),
 (N'LanDangNhapSai',              (SELECT COUNT(*) FROM dbo.LanDangNhapSai)),
 (N'BangGia / GoiDichVu',         (SELECT COUNT(*) FROM dbo.BangGia) + (SELECT COUNT(*) FROM dbo.GoiDichVu)),
 (N'BangGiaDonVi / TyGia',        (SELECT COUNT(*) FROM dbo.BangGiaDonVi) + (SELECT COUNT(*) FROM dbo.TyGia)),
 (N'CauHinhHeThong',              (SELECT COUNT(*) FROM dbo.CauHinhHeThong))
) AS t(Bang, SoDong);
PRINT N'Bước tiếp theo: chạy db/bao-cao/00-TONG-HOP.sql hoặc 08-bao-cao-chuyen-nghiep.sql để xem báo cáo.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    IF OBJECT_ID('tempdb..#n') IS NOT NULL DROP TABLE #n;
    IF OBJECT_ID('tempdb..#u') IS NOT NULL DROP TABLE #u;
    IF OBJECT_ID('tempdb..#x') IS NOT NULL DROP TABLE #x;
    PRINT N'Không thêm được dữ liệu mẫu bổ sung (đã hoàn tác, không có gì bị thay đổi). Lỗi: ' + ERROR_MESSAGE()
        + N' (dòng ' + CAST(ERROR_LINE() AS NVARCHAR(10)) + N')';
END CATCH;
