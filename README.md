# Dubchef

Dubchef hỗ trợ tạo phụ đề và thuyết minh đa ngôn ngữ cho video nấu ăn. React Web và React Native dùng chung API Express. SQL Server lưu tài khoản, đơn hàng, quyền sử dụng gói, nội dung phụ đề và thuyết minh, trạng thái công việc và nhật ký quản trị.

## Chạy trên Windows bằng Docker

Cần Docker Desktop đang chạy và Node.js 22.12 trở lên trong dòng 22. Mở PowerShell tại thư mục chứa `docker-compose.yml`.

```powershell
npm run setup:local
docker compose up -d --build
docker compose ps -a
```

Máy mới được tạo `.env` với mật khẩu SQL, mật khẩu Admin và khóa ký phiên ngẫu nhiên. Nếu tái sử dụng volume SQL từ bản trước, **dùng lại `.env` cũ và mật khẩu SQL đang hoạt động**. Bước `migrate` chạy tự động trước API. Với cơ sở dữ liệu có dữ liệu cần giữ, sao lưu và kiểm tra [preflight](db/tests/preflight-existing.sql) theo [hướng dẫn nâng cấp](docs/DATABASE.md) trước khi chạy bản mới.

Bản này bổ sung [migration 022](db/migrations/022_integrity_guards.sql) cho thanh toán, quyền sử dụng, công việc xử lý, tệp xuất và lịch sử phản hồi. Trước khi nâng cấp cơ sở dữ liệu hiện có, chạy [kiểm tra toàn vẹn chỉ đọc](db/tests/integrity-audit.sql) trong SSMS. Migration dừng nếu gặp bản ghi mâu thuẫn để bạn có thể đối soát dữ liệu.

| Kiểm tra | Địa chỉ hoặc lệnh | Kết quả cần xem |
|---|---|---|
| Web | [localhost:5173](http://localhost:5173) | Nginx phục vụ React và chuyển tiếp yêu cầu `/backend/` đến API. |
| API và SQL | [localhost:4000/api/health](http://localhost:4000/api/health) | `ok: true`, `db: true`. |
| Mô hình dịch | [localhost:4000/api/health/translation](http://localhost:4000/api/health/translation) | `modelReady: true`. Xem tiến độ bằng `docker compose logs ollama-init`. |
| Worker | `docker compose logs job-worker transcription render` | Worker xuất hiện sau khi tải model Ollama xong và các dịch vụ cần thiết sẵn sàng. |
| SSMS | `127.0.0.1,1433` hoặc `localhost,1433` | Chọn SQL Server Authentication, dùng thông tin SQL hiện tại và mở `DubchefDB`. |

Để xem dữ liệu trong SSMS, mở [db/queries.sql](db/queries.sql). Đây là truy vấn báo cáo. Nếu cài cơ sở dữ liệu riêng bằng SSMS, dùng [RUN_ALL_IN_SSMS.sql](db/migrations/RUN_ALL_IN_SSMS.sql) theo [hướng dẫn SQL](db/README-QUAN-LY-SQL.md). Dừng stack bằng `docker compose down`. Tùy chọn `-v` sẽ xóa các volume của stack, gồm dữ liệu SQL và tệp đã tải.

<details>
<summary>Chạy Web bằng Vite hoặc mở trên điện thoại</summary>

- **Vite** — khởi động các dịch vụ Docker rồi chạy `docker compose stop web` để nhường cổng 5173. Sao chép `web/.env.example` thành `web/.env` nếu thiếu, chạy `npm ci --prefix web` và `npm run web`. Proxy `/backend` chuyển tiếp đến `127.0.0.1:4000`.
- **Web trên điện thoại** — chạy `npm run lan` trên máy tính và mở liên kết được in ra từ điện thoại cùng Wi-Fi riêng. Chế độ này mở cổng Web 5173 và chuyển tiếp API qua Nginx. Cổng API trực tiếp và SQL vẫn bind loopback. Chi tiết trong [hướng dẫn Mobile và LAN](docs/MOBILE.md).
- **Ứng dụng Expo** — sao chép `mobile/.env.example` thành `mobile/.env`, đặt `EXPO_PUBLIC_API_URL` đến API mà thiết bị truy cập được, chạy `npm ci --prefix mobile` và `npm run mobile`. Android emulator dùng `http://10.0.2.2:4000` nếu máy chủ Docker lắng nghe ở cổng 4000. Với điện thoại thật, cấu hình địa chỉ LAN và firewall cho cổng API theo [hướng dẫn Mobile](docs/MOBILE.md). SQL vẫn dùng kết nối hiện tại.

</details>

## Luồng chức năng

| Luồng | Cách code thực hiện |
|---|---|
| Trải nghiệm Web | Whisper chạy trong Web Worker; trình duyệt phát phụ đề và TTS. Khách có thể trải nghiệm lời thoại gốc. Dịch sang ngôn ngữ khác qua `POST /api/translate` cần token. |
| Xử lý trên Mobile | Dùng lời thoại nhập tay hoặc Whisper native nếu bản ứng dụng hỗ trợ. Với chế độ tự nhận diện khi thiếu Whisper native, thành viên có API có thể đưa video vào hàng đợi trên máy chủ. |
| Tải lên và lưu kết quả | Tạo bản ghi bằng `POST /api/videos`, tải tệp qua `PUT /api/videos/:id/file`, gửi kết quả qua `POST /api/videos/:id/results`. SQL lưu metadata, nội dung JSON và lịch sử; volume `dubchef-uploads` lưu tệp. Các lượt tải và lưu bản dịch mới được ghi theo quyền sử dụng gói. |
| Dịch | API gọi dịch vụ `translation`, dịch vụ này dùng Ollama và xử lý thuật ngữ nấu ăn. Luồng dịch ở Web/Mobile đọc danh mục ngôn ngữ hỗ trợ `vi`, `en`, `zh`. |
| Xử lý nền và tải file | `POST /api/jobs/process-video` tạo công việc SQL. Worker dùng lời thoại đã lưu hoặc gọi dịch vụ Whisper, dịch và gọi render khi cần. Chủ công việc tải kết quả MP3, MP4, SRT hoặc VTT theo tùy chọn qua `/api/jobs/:id/download/:language/:format`. Ngoài ra có luồng xuất MP3/MP4 trực tiếp từ bản thuyết minh đã xuất bản. |
| Quản trị | Admin theo dõi thống kê, tài khoản, video, phụ đề, thuyết minh, ngôn ngữ, phản hồi, giá, đơn và giao dịch. Nội dung duyệt theo trạng thái `draft`, `reviewing`, `published`; SQL lưu lịch sử. Đơn cũ có luồng xác minh và liên kết chủ riêng. |

## Demo thanh toán và QR

- **Trình diễn mua gói trên laptop** — đặt `PAYMENT_MODE=demo` trong `.env`, chạy lại `docker compose up -d` rồi đăng nhập bằng tài khoản thành viên. Luồng mô phỏng ghi đơn, giao dịch và cấp lượt sử dụng bằng SQL. Xem [Demo giảng viên](docs/HUONG_DAN_DEMO_GIANG_VIEN.md).
- **Thanh toán thật** — `PAYMENT_MODE=payos` cần thông tin kênh, URL quay về và webhook theo [hướng dẫn payOS](docs/HUONG_DAN_THANH_TOAN_PAYOS_THUC_TE.md). Backend kiểm chữ ký, số tiền và loại tiền trước khi ghi nhận đơn đã thanh toán. Mặc định `PAYMENT_MODE=disabled`.
- **QR dẫn vào web** — QR trải nghiệm mở trang `/#/guest` để ghi lượt quét. Khi thử LAN chỉ để mở trang, dùng `PAYMENT_MODE=disabled`. Để hiển thị QR công khai trong Web build, đặt `VITE_PUBLIC_BASE_URL` thành URL HTTPS đã kiểm tra; bối cảnh LAN có thể dùng QR do `npm run lan` tạo.

## Sơ đồ theo mã nguồn

| Nhóm | Xem | Chỉnh sửa |
|---|---|---|
| Triển khai Docker | [Sơ đồ triển khai](docs/so-do/KienTruc_TrienKhai.svg) | [Draw.io](docs/so-do/KienTruc_TrienKhai.drawio) |
| Thành phần Backend | [Sơ đồ thành phần](docs/so-do/KienTruc_ThanhPhan.svg) | [Draw.io](docs/so-do/KienTruc_ThanhPhan.drawio) |
| Dữ liệu SQL | [Quan hệ chính](docs/so-do/ERD_LienKetChinh.svg) · [Bảng và khóa](docs/so-do/ERD_SQL.svg) | [Draw.io](docs/so-do/ERD_SQL.drawio) |
| Nghiệp vụ | [Mô hình miền](docs/so-do/MoHinh_Mien.svg) | [Draw.io](docs/so-do/MoHinh_Mien.drawio) |
| Use Case, Activity và DFD | [Mục lục sơ đồ và đường dẫn đối chiếu](docs/so-do/README.md) | Mỗi sơ đồ có bản Draw.io, SVG và PNG. |

## Kiểm thử và triển khai

```sh
npm ci --prefix server
npm ci --prefix web
npm ci --prefix mobile
npm run test:shared
npm run test:server
npm test --prefix web
npm test --prefix mobile -- --runInBand
npm run lint
npm run build --prefix web
```

- [Kiểm thử](docs/KIEM_THU.md) hướng dẫn các bài kiểm tra ứng dụng và SQL. Với video thật, thử lần lượt tải video ngắn, nhận diện, dịch và tải một tệp kết quả từ hàng đợi.
- [CI/CD](docs/DEPLOYMENT.md) mô tả các workflow trong [`.github/workflows/`](.github/workflows/). Web trên GitHub Pages cần URL API HTTPS công khai. Build Mobile dùng Expo EAS. Docker release có cấu hình triển khai riêng.
- Giữ `.env`, khóa payOS và tệp sao lưu ở máy riêng. [Bảo mật và chia sẻ mã nguồn](docs/BAO_MAT_VA_CHIA_SE.md) có hướng dẫn biến môi trường và đóng gói.
