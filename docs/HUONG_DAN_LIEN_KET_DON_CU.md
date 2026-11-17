# Liên kết đơn hàng lịch sử chưa có tài khoản
> Gộp từ `docs/HUONG_DAN_LIEN_KET_DON_CU.md` (nguyên tắc an toàn) và `HUONG_DAN_LIEN_KET_DON_HANG_CU.md` (hướng dẫn chi tiết).


**Mục lục**

1. Liên kết đơn hàng lịch sử chưa có tài khoản – Dubchef
2. DUBCHEF – Hướng dẫn liên kết chủ sở hữu đơn hàng cũ

---

## Liên kết đơn hàng lịch sử chưa có tài khoản – Dubchef

*Nguồn gốc: `docs/HUONG_DAN_LIEN_KET_DON_CU.md` (đã gộp)*

### Nguyên tắc an toàn

- Đơn cũ có `MaNguoiDung=NULL` **không tự được gán theo email**. Email chỉ tạo danh sách tài khoản *gợi ý*.
- Admin cần đối chiếu chứng từ độc lập (mã giao dịch đối chiếu, biên nhận xác nhận, phiếu hỗ trợ đã xác minh), nhập mã chứng từ + lý do và xác nhận chủ đơn trước khi liên kết.
- Ghi đầy đủ thời gian, nhân viên, tài khoản và căn cứ vào `dbo.XacMinhChuDonHang`, kèm nhật ký `dbo.NhatKyQuanTri`.
- Liên kết chủ đơn **không đổi `paid`, không đổi `NguonXacNhan`, không ghi giao dịch thành công và không cấp lượt**. Các giao dịch `legacy_unknown` tiếp tục là dữ liệu lịch sử chưa xác minh thanh toán thật.
- Nếu email không tìm được đúng một tài khoản, hoặc chưa có chứng cứ độc lập: **để nguyên chưa liên kết**. Không đổi dữ liệu SQL thủ công để ép đạt 0 bản ghi NULL.

### Cài đặt

1. Sao lưu thư mục mã nguồn và backup SQL Server. Không chạy `docker compose down -v`.
2. Chép nội dung `CNPM/` của bản vá vào thư mục `CNPM/` hiện tại, thay các file trùng tên và giữ nguyên `.env`.
3. Ở thư mục gốc `CNPM` chạy `docker compose up -d --build api`. Backend sẽ tự chạy migration 13.
4. Ở `CNPM/web`, chạy `npm run build`, `npm run test`, `npm run dev`.
5. Đăng nhập Admin, mở **Đối soát thanh toán → Chi tiết** của đơn chưa liên kết.
6. Trong **Xác minh chủ đơn hàng cũ**, xem tài khoản khớp email, kiểm tra giấy tờ bên ngoài, nhập loại + mã bằng chứng, ghi chú (15–500 ký tự), tick xác nhận rồi nhấn **Xác nhận liên kết tài khoản**.
7. Danh sách làm mới và chuyển `MaNguoiDung` sang mã khách đã được xác minh. Đơn không đủ bằng chứng được giữ nguyên.

### Kiểm tra SSMS

Mở `db/bao-cao/11-KiemTraVaDoiSoatChuDonCu.sql` và nhấn Execute. Đây là truy vấn **chỉ đọc**, gồm đơn chưa liên kết, nhật ký liên kết và số lượng đơn.

### Kiểm thử

- `cd server; npm test` – kiểm thử quyền Admin, dữ liệu đầu vào, trùng xác minh và lịch sử.
- `cd web; npm run test; npm run build` – kiểm thử frontend.
- Bài kiểm thử SQL tích hợp là tùy chọn, chỉ chạy với `DB_INTEGRATION=true` trong môi trường thử nghiệm; tự tạo một database riêng có tên ngẫu nhiên, **không dùng dữ liệu đang vận hành**.

### Giới hạn

Liên kết đơn cũ không đồng nghĩa chứng minh khách đã thanh toán thật hoặc sở hữu lượt sử dụng đã mua. Muốn cấp lượt từ giao dịch lịch sử phải có quy trình kiểm chứng thanh toán và phê duyệt bổ sung riêng, không thực hiện ngầm qua chức năng này.

---

## DUBCHEF – Hướng dẫn liên kết chủ sở hữu đơn hàng cũ

*Nguồn gốc: `HUONG_DAN_LIEN_KET_DON_HANG_CU.md` (đã gộp)*

### 1. Phạm vi bản sửa

- API `GET /api/admin/orders/:id/owner-candidates` (chỉ Admin): xem đơn và tài khoản khách hàng có email trùng để **gợi ý** xác minh.
- API `POST /api/admin/orders/:id/link-owner` (chỉ Admin): chỉ liên kết khi có bằng chứng được kiểm tra độc lập, Admin xác nhận, và SQL còn ghi nhận đơn chưa có chủ.
- `server/src/db.js` tự chạy migration `db/13-doi-soat-chu-don-hang-cu.sql` sau migration 12 mỗi khi Backend khởi động; **không xóa hoặc tự động gán** đơn hàng cũ.
- Dữ liệu xác minh được lưu trong `dbo.XacMinhChuDonHang` và nhật ký `dbo.NhatKyQuanTri`, cùng transaction với cập nhật `dbo.DonHang.MaNguoiDung`.
- Liên kết chủ đơn KHÔNG xác nhận tiền đã nhận, KHÔNG thay đổi `dbo.GiaoDich.NguonXacNhan`, KHÔNG cấp `dbo.QuyenLoiGoi`. Việc cấp quyền lợi là quy trình khác.

### 2. Cập nhật lên đồ án đang chạy

1. **Sao lưu** dữ liệu SQL và các file video đang sử dụng trước khi thay mã nguồn. Có thể tham khảo `README-BACKUP.txt` trong dự án. Không dùng `docker compose down -v`.
2. Nếu dùng ZIP vá lỗi, giải nén và chép các file vào đúng vị trí trong thư mục CNPM, **ghi đè đúng đường dẫn**. ZIP vá lỗi không bao gồm `docker-compose.yml`, `.env`, dữ liệu hay volume.
3. Nếu dùng ZIP mã nguồn đầy đủ, giải nén thành một thư mục mới, rồi **sao chép .env của dự án cũ vào** (gồm cả `web/.env` nếu đang dùng) trước khi chạy. Không sao chép thư mục `.git`, `node_modules` hoặc `backups` từ bản cũ vào bản public.
4. Mở terminal tại thư mục có `docker-compose.yml` và chạy:

   ```powershell
   docker compose up -d --build
   docker compose logs -f api
   ```

5. Đợi Backend báo `SQL Server sẵn sàng.` và `API chạy ở http://localhost:3000`. Migration 13 đã chạy tự động. **Không cần chạy lại toàn bộ file SQL hoặc xóa CSDL**.
6. Nếu đang chạy Vite trên máy Windows: `npm --prefix web install` (nếu thiếu thư viện) rồi `npm --prefix web run dev`. Giữ nguyên `VITE_API_URL` đã cấu hình hoạt động.

> Nếu chạy migration 13 thủ công bằng SSMS, mở `db/13-doi-soat-chu-don-hang-cu.sql`, kết nối đúng SQL Server và đúng database `DubchefDB`, rồi Execute. Script là idempotent. Không chạy `db/01-create-database.sql` hoặc `db/09b-xoa-du-lieu-mau.sql` để sửa tính năng này.

### 3. Cách kiểm tra tại giao diện Admin

1. Đăng nhập Admin, vào **Quản lý đơn hàng** (`/admin/orders`).
2. Chọn **Chi tiết** của một đơn cũ có nhãn **Chưa xác minh**. Nếu đơn nằm ngoài 500 bản ghi mới nhất, nhập trực tiếp **mã đơn** vào ô **Tra cứu đơn hàng cũ theo mã**.
3. Hệ thống hiển thị mã đơn, tên/email của đơn, và tài khoản khách trùng email (nếu có). **Trùng email chưa đủ chứng minh sở hữu**.
4. Đối chiếu chứng từ **bên ngoài hệ thống** với khách hàng và bản gốc; chọn loại bằng chứng (mã giao dịch đã đối chiếu, biên nhận xác nhận, hoặc phiếu hỗ trợ đã xác minh), nhập mã chứng từ và giải thích ít nhất 15 ký tự. Đánh dấu xác nhận, rồi bấm **Xác nhận liên kết tài khoản**.
5. Thành công: đơn hiển thị `MaNguoiDung` thay cho **Chưa xác minh**. Không thể liên kết cùng đơn lần thứ hai. Khách hàng sau khi đăng nhập sẽ thấy đơn thuộc tài khoản.
6. Đối chiếu thanh toán và quyền lợi trong các phần riêng biệt; **đơn trả `paid` từ dữ liệu cũ không được biến thành giao dịch ngân hàng đã xác minh** chỉ vì được liên kết.

### 4. Kiểm tra an toàn với SSMS (chỉ đọc)

```sql
USE DubchefDB;
GO
-- Số đơn cũ chưa có tài khoản sở hữu
SELECT COUNT_BIG(*) AS DonChuaLienKet
FROM dbo.DonHang WHERE MaNguoiDung IS NULL;

-- Giao dịch xác minh gần nhất
SELECT TOP (20) x.MaDonHang, x.MaNguoiDung, u.Email,
       x.LoaiBangChung, x.MaBangChung, x.LyDo,
       x.NguoiXacMinh, x.ThoiGian
FROM dbo.XacMinhChuDonHang x
JOIN dbo.NguoiDung u ON u.MaNguoiDung = x.MaNguoiDung
ORDER BY x.MaXacMinh DESC;

-- Kiểm tra đơn sau liên kết (thay 123 bằng MaDonHang thật)
DECLARE @MaDonHang INT = 123;
SELECT d.MaDonHang,d.MaNguoiDung,d.TrangThai,d.EmailKhachHang,
       g.MaThamChieu,g.NguonXacNhan,
       q.MaQuyenLoi
FROM dbo.DonHang d
OUTER APPLY (SELECT TOP (1) MaThamChieu,NguonXacNhan
             FROM dbo.GiaoDich WHERE MaDonHang=d.MaDonHang AND TrangThai='success'
             ORDER BY MaGiaoDich DESC) g
LEFT JOIN dbo.QuyenLoiGoi q ON q.MaDonHang=d.MaDonHang
WHERE d.MaDonHang=@MaDonHang;
```

Chỉ xác minh `XacMinhChuDonHang` có đúng 1 dòng cho một mã đơn đã thao tác. Đối với đơn cũ chưa có quyền lợi, `MaQuyenLoi` phải tiếp tục NULL sau khi gắn chủ.

### 5. Kiểm thử tự động

```powershell
npm run test:shared
npm run test:server
npm --prefix web run lint
```

Bộ kiểm thử tích hợp SQL là **tùy chọn và không mặc định chạy**. Nó yêu cầu SQL Server thật, `DB_PASSWORD`, và `DB_INTEGRATION=true`, tạo một CSDL ngẫu nhiên có prefix `DubchefIntegration_` rồi tự xóa CSDL test sau kiểm thử:

```powershell
$env:DB_HOST = "localhost"
$env:DB_PORT = "1433"
$env:DB_USER = "sa"
$env:DB_PASSWORD = "<mat-khau-SQL-dang-su-dung>"
$env:DB_INTEGRATION = "true"
npm --prefix server test
Remove-Item Env:DB_INTEGRATION
```

**Lưu ý:** Không thay `DB_NAME` sản xuất để kiểm thử; bài test tự tạo CSDL test. Chỉ chạy trên máy chủ thử nghiệm có quyền tạo/drop database. Đừng chạy trong hệ thống doanh nghiệp đang hoạt động mà chưa phê duyệt.

### 6. Tình trạng xác minh bản sửa

- Kiểm thử Node Backend: 41 đạt, 0 lỗi, 2 bị bỏ qua (trong đó có tích hợp SQL thật).
- Shared: 24 đạt.
- ESLint Frontend: đạt.
- Chưa thử trực tiếp giao dịch SQL trong Docker/SSMS ở môi trường kiểm tra này; cần thực hiện bước 4–5 trên máy có SQL Server để xác nhận tính năng đầu-cuối.
- Web build/Vitest trong môi trường kiểm tra Linux không chạy được vì `node_modules` gốc chứa bản Rollup dành cho Windows, thiếu `@rollup/rollup-linux-x64-gnu`. Đây là giới hạn môi trường kiểm tra, **không phải bằng chứng lỗi của mã nguồn sửa**. Hãy cài `npm ci` đúng hệ điều hành khi chạy dự án.
