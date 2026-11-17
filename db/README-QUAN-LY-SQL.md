# SQL Server của phiên bản hiện tại

Cấu trúc chuẩn là `NgonNgu` trong PhuDe/ThuyetMinh, `NoiDung` JSON các dòng text/start/end, metadata Video gồm TenTep/DungLuong/DinhDang. Tên `MaNgonNgu` vẫn là khóa chính của bảng danh mục NgonNgu; không nhầm với cột của bảng nội dung.

## Cài và nâng cấp

Nguồn chuẩn duy nhất là **`db/migrations/`**, theo danh sách trong `server/src/migrationPlan.mjs` (có SHA-256 trong bảng `SchemaMigrations`). Không còn các file cài đặt rời kiểu `02-schema.sql`, `04-workflows.sql`… (đã trùng 100% với migrations nên bị xóa).

- Docker: `docker compose up -d --build` (service `migrate` chạy trước API).
- Máy riêng: `npm run db:migrate` (đọc `.env`).
- Cài bằng SSMS: mở `db/migrations/RUN_ALL_IN_SSMS.sql` (file sinh tự động bằng `npm run db:ssms`; **không sửa tay**, vì checksum phụ thuộc từng byte).
- Tên database lấy từ `DB_NAME` (mặc định `DubchefDB`); `DB_SKIP_CREATE=true` khi database đã có và login không có quyền tạo database.

Nếu preflight phát hiện cấu trúc cũ hoặc đơn hàng lịch sử mâu thuẫn, migration sẽ dừng. Sao lưu trước, đối chiếu rồi xử lý; không xóa bảng để vượt qua lỗi. Với DB đang có dữ liệu, đọc `docs/DATABASE.md` và chạy `db/tests/preflight-existing.sql` trước.

## Tra cứu và báo cáo

- `queries.sql` và `bao-cao/00-TONG-HOP.sql`: truy vấn tổng hợp chỉ đọc.
- `bao-cao/01..11`: truy vấn theo từng chức năng, gồm lịch sử đăng nhập và đối soát.
- `08-bao-cao-chuyen-nghiep.sql`: view báo cáo tùy chọn cho SSMS (`server/scripts/bao-cao.mjs` cũng tự tạo khi cần).
- `00-PREFLIGHT.sql`, `00-KIEM-TRA-CAU-TRUC.sql`, `06-kiem-tra-dong-bo-ssms.sql`: kiểm tra trước/sau khi cài (chỉ đọc).
- `09-du-lieu-mau.sql` và `09b-xoa-du-lieu-mau.sql`: chỉ dùng chủ động cho dữ liệu mẫu; không nằm trong cài tự động.
- `supabase-*.sql`: PostgreSQL cho phương án Supabase tùy chọn ở web, **không chạy trong SSMS**.
- Đã xóa: `00-CAI-DAT-KHONG-XOA.sql`, `03-admin.sql`, `05-sqlserver-tai-khoan.sql` (thủ tục đăng nhập SHA2_256 lỗi thời; mật khẩu do Node/scrypt quản lý), `06-service.sql`, `07-service-queries.sql`, thư mục `legacy/`.

Mật khẩu đăng nhập ứng dụng không phải mật khẩu sa. Giữ `DB_PASSWORD` cũ khi dùng volume SQL đã có: đổi biến môi trường không đổi mật khẩu sa của volume cũ. Không chạy `docker compose down -v` nếu muốn giữ dữ liệu.

## Dữ liệu cần kiểm tra

```sql
USE DubchefDB;
SELECT TOP(20) MaNguoiDung,HoTen,Email,VaiTro,TrangThai FROM dbo.NguoiDung ORDER BY MaNguoiDung DESC;
SELECT TOP(20) * FROM dbo.Video ORDER BY MaVideo DESC;
SELECT TOP(20) * FROM dbo.ThuyetMinh ORDER BY MaThuyetMinh DESC;
SELECT TOP(20) * FROM dbo.PhuDe ORDER BY MaPhuDe DESC;
SELECT TOP(20) * FROM dbo.PhanHoi ORDER BY MaPhanHoi DESC;
SELECT TOP(20) * FROM dbo.LienHe ORDER BY MaLienHe DESC;
SELECT TOP(20) * FROM dbo.DonHang ORDER BY MaDonHang DESC;
SELECT TOP(20) * FROM dbo.GiaoDich ORDER BY MaGiaoDich DESC;
SELECT * FROM dbo.NgonNgu;
SELECT TOP(20) * FROM dbo.LichSuNoiDung ORDER BY MaLichSu DESC;
SELECT TOP(20) * FROM dbo.LichSuXuLyPhanHoi ORDER BY MaLichSu DESC;
SELECT TOP(20) * FROM dbo.LichSuDangNhap ORDER BY MaLichSu DESC;
```

Trong PhuDe/ThuyetMinh, NoiDung là JSON. Volume `dubchef-uploads` lưu video gốc và tệp xuất qua worker. `CongViecXuLy` lưu trạng thái công việc; `TepXuat` lưu metadata và đường dẫn tệp MP3, MP4, SRT hoặc VTT theo tùy chọn đã xử lý. Thời gian lưu UTC, báo cáo hiển thị Việt Nam bằng DATEADD(HOUR,7,...). DonHang và GiaoDich chỉ mô phỏng khi `PAYMENT_MODE=demo`.
