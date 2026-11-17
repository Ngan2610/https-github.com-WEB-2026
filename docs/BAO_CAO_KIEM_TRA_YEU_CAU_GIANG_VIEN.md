# Báo cáo kiểm tra theo yêu cầu giảng viên (15/11/2026)

Đề tài: Thuyết minh tự động đa ngôn ngữ cho video nấu ăn (Dubchef).
Môi trường kiểm tra: Node 22, **không có Docker, SQL Server, Ollama, espeak-ng, GPU**. Mục nào cần các thứ đó ghi "chưa kiểm chứng".

## 1. Kết quả chạy thực tế

| Hạng mục | Kết quả | Ghi chú |
|---|---|---|
| Shared test | ✅ 24/24 | |
| Web: lint / test | ✅ 0 lỗi, 1 cảnh báo / ✅ 121/121 | Cảnh báo `AdminPricing.jsx:20` thiếu dependency của `useEffect` |
| **Web: build** | ❌ -> ✅ đã sửa | `whisper.worker.js` import `@xenova/transformers` nhưng `package.json` chỉ có `@huggingface/transformers`. Build, Docker web và CD Web đều hỏng. Đã đổi import. |
| Mobile: lint / test / bundle Android | ✅ / ✅ 15/15 / ✅ | `expo export` thành công (2,34 MB) |
| Backend test | ✅ 79/83 | 4 lỗi do sandbox: 2 test eSpeak (thiếu `espeak-ng`), 2 test SQL (thiếu SQL Server). CI có cài sẵn nên cần xem kết quả CI thật. |
| Script/contract test | ❌ -> ✅ 9/9 | Test `qa-source-contracts` kiểm tra sai chỗ (giá nay tính trong `repo.createOrder`); đã cập nhật |
| **docker-compose** | ❌ -> ✅ đã sửa | Healthcheck của `api` gọi `127.0.0.1:4000` trong khi app nghe cổng 3000 và cổng publish là `4000:3000` (README/mobile dùng 3000). `api` luôn unhealthy nên `web` không khởi động. Đã sửa về 3000. |
| `.env.example` | ⚠️ -> ✅ | Còn `PAYMENT_DEMO` đã bị bỏ khỏi code; đã đổi sang `PAYMENT_MODE` và bổ sung biến mà compose dùng |
| Chạy `docker compose` end-to-end với video thật | ⏳ chưa kiểm chứng | Cần Docker + tải model Ollama |

## 2. Checklist theo yêu cầu

| # | Yêu cầu | Trạng thái | Ghi chú |
|---|---|---|---|
| 1 | FE React.js (Web) + CI/CD | ✅ | Có 18 file test, lint, build, CD GitHub Pages (cần biến `VITE_API_URL` HTTPS) |
| 1 | FE React Native (Mobile) + CI/CD | ✅ / ⚠️ | Có test, bundle, CD EAS (cần `EXPO_TOKEN`). Whisper native cần dev build; Expo Go chỉ nhập lời thoại tay |
| 2 | BE 3 lớp + CI/CD | ⚠️ | Có tầng dữ liệu rõ (`db.js` + migrations). Nhưng `app.js` (~815 dòng) chứa toàn bộ route kèm kiểm tra, throttle, stream file; tầng service mỏng (`orders.js`, `entitlements.js`, `workflows.js`). Nên tách `routes/ -> services/ -> repositories/` |
| 3 | Services giao tiếp với nhau + CI/CD | ❌ -> ⚠️ | Trước đây 1 monolith + Ollama. Đã thêm microservice `translation` (REST, token nội bộ, healthcheck, CI). Mới có 2 service ứng dụng; nên tách thêm `render` |
| - | Nhóm 2-3 SV, làm qua GitHub | ✅ | 156 commit, 3 người (99 / 43 / 14) |
| - | Báo cáo giữa kỳ/cuối kỳ | ⚠️ | Có nhiều tài liệu trong `docs/`; nên gom 1 báo cáo chính theo mẫu của khoa |

## 3. Luồng video nấu ăn

| Bước | Trạng thái | Ghi chú |
|---|---|---|
| Upload video, lưu volume | ✅ | `PUT /api/videos/:id/file`, giới hạn 150 MB, volume `dubchef-uploads` |
| Tách audio (FFmpeg) | ⚠️ | Chỉ có ở chiều xuất; nhận diện chạy trong trình duyệt nên không cần tách phía server |
| STT có timestamp, tự nhận diện ngôn ngữ | ⚠️ | Whisper chạy trong trình duyệt (Web). Phụ thuộc máy người dùng; chưa kiểm chứng chất lượng với tiếng ồn bếp |
| Dịch giữ timestamp | ✅ (chưa kiểm chứng chất lượng) | Dịch từng câu qua Ollama `qwen2.5:3b` (model nhỏ, tiếng Trung/Việt có thể yếu) |
| TTS nhiều ngôn ngữ | ⚠️ | Phát trên thiết bị; xuất MP3/MP4 bằng eSpeak-ng (giọng máy, robot). Chưa căn chỉnh độ dài giọng đọc theo câu gốc |
| Ghép audio vào video | ✅ (chưa kiểm chứng ở đây) | `audioExport.js`; CI có job render thật |
| Đổi ngôn ngữ trong player | ⚠️ | Có chọn ngôn ngữ phụ đề và đọc thuyết minh bằng giọng của trình duyệt (SpeechSynthesis); không phải nhiều audio track gắn trong video |
| Hàng đợi, thông báo tiến độ | ❌ | Không có job queue; trạng thái chỉ là cột `uploaded/processing/completed/failed` |
| Ngôn ngữ | ⚠️ | Chỉ vi/en/zh |
| **Từ điển ẩm thực** | ❌ -> ✅ | Đã thêm 42 mục trong `services/translation` |
| **Quy đổi đơn vị** | ❌ -> ✅ | Đã thêm (°F, cup, tbsp, tsp, fl oz, oz, lb) |
| Trích nguyên liệu/các bước (điểm cộng) | ❌ | Chưa có |
| Giao diện hiển thị phần quy đổi/thuật ngữ | ❌ | `api` mới trả `translatedText`; service đã trả sẵn `conversions`, `glossary` để FE dùng sau |

## 4. Rủi ro bảo mật cần xử lý ngay

- Lịch sử Git có **6 commit đụng tới `.env` gốc và 5 commit tới `web/.env`** (ví dụ "đổi mật khẩu ok", "Update .env"); các phiên bản `.env` gốc từng chứa khóa `TOKEN_SECRET`, `ADMIN_PASSWORD`, `DB_PASSWORD`. Hiện `.env` đã không còn được theo dõi, nhưng giá trị cũ vẫn nằm trong lịch sử. Nếu repo công khai, coi như đã lộ: **đổi toàn bộ mật khẩu/khóa** rồi làm theo `docs/SECURITY.md`. CI chạy gitleaks trên toàn lịch sử nên có thể đang đỏ vì lý do này.
- File ZIP bạn gửi chứa `.env` và `backups/` thật. Không gửi lại ZIP kiểu này cho người ngoài. Bản ZIP bàn giao kèm theo đã loại các file đó.

## 5. Đã thay đổi

| File | Thay đổi |
|---|---|
| `web/src/workers/whisper.worker.js` | Sửa import sang `@huggingface/transformers` |
| `docker-compose.yml` | Sửa cổng/healthcheck API; thêm service `translation`; api gọi qua `TRANSLATION_SERVICE_URL` |
| `.env.example` | `PAYMENT_MODE` và các biến compose |
| `.github/workflows/ci.yml` | Thêm job `translation-service`, build image |
| `server/src/translationClient.js` (mới), `server/src/app.js` | Bộ dịch chọn theo `TRANSLATION_SERVICE_URL`, giữ chế độ trực tiếp |
| `server/test/translationClient.test.mjs`, `translate-route.test.mjs` (mới) | 8 test |
| `services/translation/**` (mới) | Microservice + 26 test + Dockerfile |
| `scripts/qa-source-contracts.test.mjs` | Cập nhật test lỗi thời |
| `docs/KIEN_TRUC_MICROSERVICES.md`, file này | Tài liệu |

## 6. Việc nhóm cần quyết định / làm tiếp

1. Đổi mật khẩu/khóa, dọn lịch sử Git (mục 4).
2. Chạy `docker compose up -d --build` trên máy có Docker, kiểm tra `docker compose ps` thấy `api`, `web`, `translation` healthy; thử dịch 1 câu có "2 cups", "350°F", "fish sauce".
3. Tách `app.js` thành `routes/services/repositories`; tách `render` thành service.
4. Cân nhắc model dịch lớn hơn `qwen2.5:3b` nếu máy đủ RAM/GPU.
5. Giả định của tôi: "kiến trúc 3 lớp" là Controller-Service-Repository; "service giao tiếp" là REST giữa các service Docker.
