# Quyết định triển khai staging Dubchef (15/11/2026)

**Chưa triển khai public. Không có URL staging, uptime hoặc chứng nhận giao dịch.**

- SQL Server 2022 Linux yêu cầu tối thiểu **2 GB RAM, 6 GB đĩa** theo Microsoft; mức tối thiểu để khởi động không có nghĩa đủ cho tải demo thật: https://learn.microsoft.com/en-us/sql/linux/install-upgrade/setup?view=sql-server-ver16
- Ollama model `qwen2.5:3b` bản đang dùng chiếm **1,9 GB chỉ riêng tệp model** (đã thấy trên máy thử). Suy luận kỹ thuật: bộ nhớ khi suy luận còn có KV cache/runtime và tăng theo concurrency. Không nên ghép SQL Server + Ollama + web/API vào container 512 MB miễn phí.
- Render công bố mức **8 GB RAM khoảng 135 USD/tháng** cho cấu hình 2 CPU và ổ đĩa tính riêng (thông tin tham khảo, phải kiểm tra lại lúc mua): https://render.com/pricing

**Quyết định:** giữ kiến trúc SQL Server/API/Ollama trên laptop Docker cho demo tại lớp; triển khai HTTPS staging riêng chỉ sau khi có tài khoản host/VPS, bí mật, thử restore và xác nhận ngân sách. Phương án tiết kiệm để trình chiếu xa: tunnel HTTPS tới web trên laptop đang chạy và giới hạn quyền truy cập; KHÔNG giả là dịch vụ uptime 24/7. Khi staging lâu dài: VPS đủ RAM/SSD, volume DB persistent ngoài Git, API không mở SQL public, reverse proxy TLS, Ollama nội bộ hoặc endpoint inference riêng. Không đưa demo payments/credential production lên staging công khai.

Trước khi đánh giá 10/10: đo RAM CPU thời gian dịch MP3/MP4, thử bằng điện thoại thật, load test, backup/restore, secret scan và uptime được ghi nhận độc lập.

## CI/CD

CI có năm job: Shared, Web, Mobile, Backend và SQL integration. Backend chạy toàn bộ server/test/*.test.mjs. SQL integration khởi động SQL Server 2022 tạm, tạo database ngẫu nhiên riêng và kiểm tra đọc ghi/quyền/lịch sử sau mở lại kết nối.

CD Web chạy sau CI thành công trên main hoặc chạy tay; đặt GitHub Variables VITE_API_URL là Backend HTTPS công khai, VITE_PAYMENT_API_URL tùy chọn dùng cùng Backend, VITE_PUBLIC_URL nếu cần địa chỉ QR công khai. Bật Settings → Pages → GitHub Actions. Pages chỉ phục vụ Web tĩnh, không chạy SQL/API và không có Vite proxy /backend.

CD Mobile chạy khi tag mobile-v* hoặc chạy tay; cấu hình EXPO_TOKEN trong Secrets và EXPO_PUBLIC_API_URL trong Variables. Chạy eas init trong mobile và liên kết dự án Expo trước. Workflow ghi URL vào .env của job build và chờ EAS build kết thúc. Chỉ kết luận có APK khi EAS trả kết quả thành công.

Kiểm tra tab Actions trên GitHub cho đúng commit. Bộ ZIP không chứa bằng chứng lần chạy trên GitHub hoặc thông tin đăng nhập Expo. Không commit .env thật, DB_PASSWORD, ADMIN_PASSWORD, TOKEN_SECRET hoặc EXPO_TOKEN. Nếu .env đã bị Git theo dõi từ trước, thêm .gitignore chưa đủ: dùng git rm --cached .env rồi commit việc bỏ theo dõi và giữ file tại máy.

Chạy test cục bộ theo README và docs/KIEM_THU.md trước khi push. Không sửa test để bỏ qua lỗi nghiệp vụ; bộ API cũ projects/uploads đã được thay bằng videos, media và feedback thống nhất, nên các test được cập nhật tương ứng và bổ sung kiểm tra quyền/phiên bản/thời gian.
