# Bản hoàn thiện Dubchef — 15/11/2026

Bản nền: `YiTang-159/CNPM`, commit `6ec1b51` (CI và CD Web đã xanh trước bản nâng cấp này).
Bản nâng cấp phải được push và chạy CI lại; không dùng kết quả CI cũ để khẳng định code mới đã qua GitHub Actions.

## Chức năng và vị trí mã nguồn

| Yêu cầu | Triển khai |
|---|---|
| FE React Web và React Native | Giao diện xử lý, thư viện video cá nhân, phụ đề, phát/tải bản lồng tiếng trên cả Web/Mobile |
| Backend 3 lớp | `app.js` lắp ghép middleware; `routes/*Routes.js` xử lý HTTP; `services/accountService.js`, `jobService.js`, `jobWorker.js` và các policy xử lý nghiệp vụ; `db.js`, `workflows.js`, `repositories/jobRepository.js` truy cập SQL |
| Service giao tiếp HTTP | API/worker → transcription (Whisper), translation (Ollama), render (eSpeak/FFmpeg), qua mạng nội bộ Docker và token cấu hình |
| Upload/lưu video | Upload nhị phân có giới hạn, xác thực chủ sở hữu; volume `dubchef-uploads` |
| Tách âm thanh và STT | Transcription tách PCM mono 16 kHz bằng FFmpeg, Whisper CPU int8, trả timestamp; hỗ trợ chọn vi/en/zh hoặc tự nhận diện |
| Dịch giữ timestamp | Worker dịch mỗi câu, giữ start/end, lưu SQL qua cơ chế tính hạn mức và lịch sử nội dung |
| TTS và xuất file | MP3, MP4, SRT, VTT; eSpeak-ng + FFmpeg; có co tốc độ đọc để khớp câu, từ chối nếu cần tăng quá 2,5 lần |
| Nhiều audio track | Khi xuất MP4 từ ít nhất 2 ngôn ngữ, tạo thêm `job-<id>-multi.mp4` với nhãn vie/eng/zho; mở bằng VLC để đổi track |
| Đổi tiếng trên Web/Mobile | Phát bản MP4 theo từng ngôn ngữ; không phụ thuộc giọng có sẵn trên thiết bị |
| Hàng đợi và tiến độ | SQL queue bền vững; worker độc lập; polling tuần tự; retry; heartbeat và thu hồi job treo quá 30 phút; mở lại từ thư viện cá nhân |
| Từ điển/quy đổi | Thuật ngữ VI/EN/ZH; °F→°C, cup/tbsp/tsp/fl oz→ml, oz/lb→g; giữ chứng cứ nguồn và hiển thị trên cả hai FE |
| Nguyên liệu/các bước | Trích theo quy tắc từ lời thoại, có câu nguồn/timestamp; không tự bịa lượng nguyên liệu; cần người dùng rà soát |
| CI/CD | CI kiểm tra/test/build; CD Web Pages; CD Services publish image và triển khai Docker Desktop Windows; CD Mobile EAS APK |

Ngôn ngữ xử lý được hỗ trợ là **vi/en/zh**. Thêm ngôn ngữ vào trang quản trị không tự bổ sung model/voice tương ứng.
Giới hạn luồng STT/render: **150 MB, tối đa 10 phút, 100 câu và tổng 12.000 ký tự**. Model mặc định `small`; thử nhanh có thể chọn `tiny`, chất lượng thấp hơn. eSpeak là giọng tổng hợp cơ bản, không phải giọng neural tự nhiên.

## 1. Áp dụng bản vá, không thay dữ liệu hiện có

Nếu dùng ZIP bản vá: giải nén ra thư mục riêng, mở PowerShell tại thư mục vừa giải nén:

```powershell
powershell -ExecutionPolicy Bypass -File .\Apply-Upgrade.ps1 -RepositoryPath 'C:\Users\Ngan\Documents\GitHub\CNPM'
cd C:\Users\Ngan\Documents\GitHub\CNPM
npm ci --prefix server
npm ci --prefix web
npm ci --prefix mobile
```

Script kiểm tra hash từng file trước khi chép; nếu bạn đã sửa khác bản nền thì dừng để tránh ghi đè. File đã đúng bản mới được bỏ qua. Các file cũ được sao lưu vào `.upgrade-backups/` trong repo.
Không chép đè `.env` bằng `.env.example`. Không xóa volume và không chạy `docker compose down -v`.

Nếu dùng ZIP mã nguồn đầy đủ: so sánh trước khi chép vào repo hiện tại, giữ `.git`, `.env`, backup SQL và dữ liệu Docker cũ.

## 2. Chạy Docker Desktop tại Windows

Mở Docker Desktop, dùng Linux containers. Dừng các terminal đang chạy Vite/API bằng `Ctrl+C` nếu đang chiếm cổng 5173/4000. Nếu SQL Server đang chạy native trên cổng 1433 thay vì container/volume của dự án, cần giữ nguyên DB đó và lập phương án kết nối/backup trước; không mặc định DB mới trong Docker sẽ có dữ liệu native. Giữ `.env` đang hoạt động. Thêm các biến nếu chưa có:

```dotenv
WHISPER_MODEL=small
OLLAMA_MODEL=qwen2.5:3b
TRANSCRIPTION_INTERNAL_TOKEN=
TRANSLATION_INTERNAL_TOKEN=
RENDER_INTERNAL_TOKEN=
```

Các token có thể để trống khi tất cả service nội bộ không publish cổng ra ngoài; nếu cấu hình thì dùng giá trị ngẫu nhiên riêng cho từng service. Compose truyền cùng giá trị cho hai đầu. Không commit token.
`TRANSCRIPTION_SERVICE_URL`, `TRANSLATION_SERVICE_URL`, `RENDER_SERVICE_URL` trong Docker đã tự trỏ đúng tên service; không sửa thành localhost bên trong container.

```powershell
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs -f ollama-init
```

Lần đầu cần tải image, model Ollama và model Whisper; có thể mất nhiều phút và cần dung lượng đĩa cho Docker. `translation` chờ `ollama-init` hoàn tất. Whisper tải model ở job đầu, cache trong `dubchef-whisper`.

- Web: http://localhost:5173
- API: http://localhost:4000/api/health
- Kiểm tra model dịch: http://localhost:4000/api/health/translation
- Nhật ký worker: `docker compose logs -f job-worker transcription render translation`

Web GitHub Pages không kết nối được `localhost` trên máy bạn từ máy người khác. Để Pages/Mobile dùng backend từ xa, cần một URL HTTPS trỏ về API, cập nhật `VITE_API_URL`/`EXPO_PUBLIC_API_URL` và `CORS_ORIGIN`. Không đưa SQL Server lên internet. Web chạy trực tiếp bằng Docker Desktop đã có proxy `/backend`.

## 3. Demo đầy đủ

1. Đăng nhập tài khoản khách có lượt upload/dịch hợp lệ. Admin dùng để quản trị, không được mua gói như khách.
2. Mở trang xử lý, chọn video nấu ăn có giọng nói rõ ràng, không quá giới hạn.
3. Web: bấm **Tự nhận ngôn ngữ và xử lý trên máy chủ**. Mobile Expo Go: chọn video, để trống kịch bản, bấm xử lý; ứng dụng dùng server STT khi không có native Whisper.
4. Xem tiến độ; có thể đóng trang và mở lại video ở Tài khoản. Nếu model đang tải, theo dõi log `transcription`.
5. Khi hoàn tất, thử phát MP4 VI/EN/ZH; tải MP3, SRT và VTT; xem nguyên liệu, bước nấu, thuật ngữ và quy đổi.
6. Tải MP4 `multi`, mở bằng VLC → Audio → Audio Track để kiểm tra từng tiếng.
7. Đăng nhập tài khoản thứ hai: không được xem/tải video riêng của tài khoản thứ nhất.
8. Chạy lại công việc đã lưu: hạn mức dịch chỉ trừ khi tạo một ngôn ngữ đích mới; không trừ lại khi retry.

Nếu cần demo mua gói giả lập cục bộ, chủ động đặt `PAYMENT_MODE=demo` trong `.env` hiện tại rồi tạo lại container API. Đây là thanh toán mô phỏng; thanh toán payOS thật vẫn cần thông tin nhà cung cấp và webhook hợp lệ. Không có khóa payOS trong gói bàn giao.

Nếu TTS báo `speech_too_long`, chỉnh/chia câu và khoảng thời gian; hệ thống không cắt mất tiếng rồi báo thành công.

## 4. CD backend tự cập nhật Docker Desktop

Workflow `.github/workflows/cd-services.yml` publish image ghcr.io với tag SHA đầy đủ sau khi CI của push main thành công. Không dùng tag `latest` cho triển khai.

Trên repo GitHub, người có quyền quản trị thiết lập:

1. Settings → Actions → Runners → New self-hosted runner → Windows x64. Làm theo lệnh GitHub cung cấp trên **máy Windows đang có Docker Desktop**.
2. Khi cấu hình runner, thêm label `dubchef`; workflow yêu cầu `[self-hosted, Windows, dubchef]`.
3. Máy có PowerShell 7 (`pwsh`; có thể cài bằng `winget install --id Microsoft.PowerShell -e`), Git và Docker Desktop. Chạy runner bằng tài khoản Windows sử dụng được Docker Desktop; kiểm tra `docker info` trong chính tài khoản đó.
4. Settings → Secrets and variables → Actions → Variables:
   - `DEPLOY_LOCAL_WINDOWS` = `true`
   - `DUBCHEF_DEPLOY_DIR` = `C:\Users\Ngan\Documents\GitHub\CNPM` (thư mục có `.env` hiện tại).
5. Tạo environment `local-docker` nếu cần quy tắc duyệt triển khai của nhóm.
6. Push code lên main → CI → CD Services. Khi không bật biến hoặc runner chưa online, bước triển khai sẽ không chạy; đó chưa phải bằng chứng backend đã deploy.

Workflow dùng token GitHub tích hợp để publish/pull image. Script deploy không in `.env`, không đổi mật khẩu, không xóa volume, và báo lỗi nếu container không healthy. Lần tải model đầu có thể lâu hơn giới hạn chờ; xem log rồi chạy lại workflow sau khi tải xong.

Quay lại image của commit đã kiểm chứng nếu cần:

```powershell
$env:DUBCHEF_IMAGE_PREFIX = 'ghcr.io/yitang-159/cnpm'
$env:DUBCHEF_RELEASE = 'SHA_DAY_DU_CUA_BAN_DA_KIEM_CHUNG'
.\scripts\deploy-windows.ps1 -DataDirectory 'C:\Users\Ngan\Documents\GitHub\CNPM'
```

Rollback image không hoàn tác migration SQL; cần backup trước khi nâng cấp lớn.

## 5. CD Mobile APK (EAS)

Dùng tài khoản Expo của nhóm. Tạo dự án Expo/EAS và lấy project UUID. Trong GitHub Actions đặt:

- Secret `EXPO_TOKEN`: token Expo có quyền build.
- Variables `EXPO_PROJECT_ID`, `EXPO_OWNER` (tài khoản/tổ chức Expo), `EXPO_PUBLIC_API_URL` (backend HTTPS truy cập được từ điện thoại).

Chạy Actions → CD Mobile → Run workflow hoặc push tag `mobile-v...`.
Workflow tự gắn project ID/owner vào app.json và URL backend vào profile preview trước build; link APK xuất hiện trong Summary. Không điền project ID giả. Chưa có tài khoản/secret thì chưa thể nghiệm thu CD Mobile.

## 6. Kiểm thử và phần cần nghiệm thu

Xem `LICH_SU_NGHIEM_THU_VA_SUA_LOI.md` để phân biệt kết quả đã chạy thật với cấu hình chỉ được kiểm tra mã nguồn. Không đánh dấu toàn bộ hệ thống hoàn tất trước khi kiểm tra SQL + Ollama + Docker + điện thoại thật trên máy nhóm.

Giữ `.env` ngoài Git. Nếu khóa từng lộ trong lịch sử, người quản trị cần đổi khóa/mật khẩu ở hệ thống tương ứng; bản vá không tự thay mật khẩu SQL đang dùng hoặc viết lại lịch sử Git của nhóm.
