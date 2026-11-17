# Kiến trúc dịch vụ Dubchef

Xem [sơ đồ triển khai](so-do/KienTruc_TrienKhai.svg) và [sơ đồ thành phần](so-do/KienTruc_ThanhPhan.svg). Cấu hình cổng, volume, phụ thuộc và biến môi trường nằm trong [docker-compose.yml](../docker-compose.yml).

| Service | Vai trò | Cổng |
|---|---|---|
| `web` | Nginx phục vụ React và chuyển `/backend` đến Express. | Máy 5173 → container 80 |
| `api` | Điểm vào cho Web/Mobile. Xác thực, lưu dữ liệu, tạo công việc, phục vụ tệp, quản trị và thanh toán. | Máy 4000 → container 3000 |
| `db` | SQL Server lưu nghiệp vụ và hàng đợi. | Máy 1433 → container 1433 |
| `migrate` | Áp dụng migrations trước API và worker. | Công việc một lần |
| `job-worker` | Lấy công việc SQL, đọc video và lời thoại, cập nhật tiến độ và lưu sản phẩm. | Tiến trình nền |
| `translation` | Dịch văn bản, sử dụng thuật ngữ và đơn vị nấu ăn. | Nội bộ 4100 |
| `transcription` | Nhận diện lời thoại server bằng faster-whisper; dùng FFmpeg để tách audio. | Nội bộ 4300 |
| `render` | Tạo MP3/MP4 với FFmpeg và eSpeak NG; ghép nhiều track khi được yêu cầu. | Nội bộ 4200 |
| `ollama` / `ollama-init` | Chạy mô hình dịch; bước init tải mô hình vào volume. | Nội bộ 11434 |

## Đường đi của dữ liệu

1. API xác thực tài khoản, lưu metadata và video, rồi nhận `POST /api/jobs/process-video`. `CongViecXuLy` lưu trạng thái và tiến độ, còn tùy chọn của job được lưu cùng kho tệp.
2. Worker lấy job qua SQL và dùng lời thoại đã lưu hoặc yêu cầu phiên âm. Khi cần dịch, worker gọi `translation` qua HTTP. Dịch vụ `translation` gửi yêu cầu suy luận sang Ollama.
3. Worker tự ghi tệp SRT/VTT. Render nhận yêu cầu tạo MP3/MP4 và trả sản phẩm cho worker lưu vào `dubchef-uploads`. `TepXuat` lưu đường dẫn và metadata để API phục vụ tải xuống cho chủ job.
4. Web/Mobile có thể phát TTS ngay trên thiết bị. API còn có đường xuất trực tiếp MP3/MP4 từ thuyết minh đã xuất bản.

`TRANSLATION_INTERNAL_TOKEN`, `TRANSCRIPTION_INTERNAL_TOKEN` và `RENDER_INTERNAL_TOKEN` là cấu hình xác thực nội bộ tùy chọn của bản hiện tại. Docker truyền token tương ứng cho bên gọi và bên nhận. Các dịch vụ nội bộ dùng mạng Docker; hồ sơ Redis là tùy chọn, hàng đợi nghiệp vụ dùng SQL Server.

`GET /api/health` kiểm tra API/SQL và trạng thái khởi tạo Admin. `GET /api/health/translation` kiểm tra kết nối dịch và mô hình Ollama. Worker đợi `ollama-init` hoàn tất. Kiểm thử microservice dịch bằng `npm test --prefix services/translation`.
