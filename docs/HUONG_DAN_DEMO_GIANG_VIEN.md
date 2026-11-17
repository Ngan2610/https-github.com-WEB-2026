# Demo Dubchef (bản nâng cấp hàng đợi SQL, 15/11/2026)

## Phạm vi đã có mã nguồn

- Web React xử lý audio và STT Whisper **trên trình duyệt** khi người dùng chủ động thực hiện. Người dùng chọn ngôn ngữ nguồn; chưa chứng minh tự nhận ngôn ngữ chuẩn xác với mọi video.
- API Express lưu video, timeline, kết quả vào SQL Server. `translation:4100` dùng Ollama để dịch; `render:4200` dùng eSpeak-ng và FFmpeg để xuất MP3/MP4.
- Worker `job-worker` lấy công việc từ bảng SQL `dbo.CongViecXuLy` (KHÔNG phải BullMQ); có retry tối đa 3 lần, lưu thông tin file trong `dbo.TepXuat` và file trong Docker volume `dubchef-uploads`.
- Khi người dùng xem video trong tài khoản, có thể tạo job, xem tiến độ và tải MP3/MP4/SRT/VTT; khi tải lại trang, ứng dụng có thể tải job gần nhất.
- Có `redis` trong Compose để dự phòng/mở rộng, nhưng job hiện tại **không dùng Redis**.

## Chuẩn bị an toàn

1. Backup SQL Server; giữ `.env` đang chạy, KHÔNG thay mật khẩu SQL, KHÔNG xóa Docker volume.
2. Windows đã chặn cổng 3000 của host: bản này ánh xạ `127.0.0.1:4000 -> api:3000`.
3. Mở Docker Desktop; tại thư mục gốc chạy:
   ```powershell
   docker compose up -d --build
   docker compose ps
   Invoke-RestMethod http://localhost:4000/api/health
   Invoke-RestMethod http://localhost:5173/backend/api/health
   ```
4. Nếu bảng job còn thiếu trên CSDL cũ, chạy migration chính thức sau khi đã có backup:
   ```powershell
   docker compose run --rm --build migrate
   ```
5. Đăng nhập user đã có quyền upload, mở `http://localhost:5173` và chọn video nấu ăn **30–60 giây** có lời thoại rõ ràng.

## Quy trình kiểm tra thực tế

1. Upload video qua Web, thực hiện STT Whisper và dịch VI/EN/ZH trên trang trải nghiệm; lưu kết quả có `start/end` vào SQL Server.
2. Vào **Tài khoản** → **Video của tôi** → mở video vừa lưu.
3. Nhấn **Tạo MP3/MP4 + phụ đề đa ngôn ngữ**. Nếu báo `source_timeline_missing`, cần thực hiện và lưu STT có timestamp trước.
4. Theo dõi tiến độ `queued` → `active` → `completed`. Các bước thực hiện trong `job-worker` chứ không chạy trên luồng request HTTP.
5. Tải MP3, SRT, VTT và bấm phát MP4 đã lồng tiếng. Đổi lựa chọn VI/EN/ZH khi có file; tải lại trang và xác minh job vẫn hiển thị.
6. Kiểm tra job và tệp trong SSMS (chỉ đọc):
   ```sql
   USE DubchefDB;
   SELECT TOP (10) * FROM dbo.CongViecXuLy ORDER BY MaCongViec DESC;
   SELECT TOP (20) * FROM dbo.TepXuat ORDER BY MaTep DESC;
   ```
7. Mở `docker compose logs --tail 80 job-worker render translation`; kiểm tra lỗi. Nếu job failed, xem cột `Loi`.

## Điểm chưa đạt, KHÔNG tuyên bố trong demo

- Chưa tự động lấy STT từ video hoàn toàn phía máy chủ; phụ thuộc thao tác Whisper trên Web/Mobile.
- Chưa kiểm chứng bản build Mobile Native (STT/video) trên Android/iOS.
- Chưa có microservice STT độc lập, S3/MinIO, DLQ chuyên dụng, hay đổi audio track HTML5 đa luồng nguyên bản.
- Chưa có kết quả E2E Docker/video trên máy trong môi trường tạo ZIP này. Các test Node chỉ kiểm tra một phần bằng fixture.
