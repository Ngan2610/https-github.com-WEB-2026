# Dùng thử qua QR trong 1 tiếng

- Mở đường dẫn QR /#/guest để ghi nhận lượt quét và bắt đầu 60 phút dùng thử.
- Thời hạn lưu theo trình duyệt từ lượt quét thành công đầu tiên. Tải lại hoặc quét lại không gia hạn.
- Trang /demo kiểm tra hạn mỗi giây và khi trở lại tab. Hết hạn chuyển sang /login, gỡ giao diện demo.
- Đăng nhập thành công quay lại /demo và tiếp tục sử dụng theo quyền của tài khoản.
- Khách mở thẳng /demo mà chưa quét cần đăng nhập.
- Trang giới thiệu, bảng giá, đăng ký vẫn truy cập được.

Chép đè các file trong bản PATCH vào đúng cấu trúc dự án; giữ nguyên .env. Trong web chạy npm ci rồi npm run build và triển khai lại web.

Giới hạn: đây là giới hạn dùng thử trên giao diện web, lưu localStorage. Xóa dữ liệu, dùng trình duyệt khác hoặc chỉnh đồng hồ/dữ liệu có thể vượt giới hạn. Không thay đổi xác thực/quota backend; không hủy tác vụ máy chủ đã gửi trước khi hết giờ. Muốn chống vượt hạn cần phiên khách được quản lý ở backend (và cơ chế tương ứng cho bản Supabase).
