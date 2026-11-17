# ERD SQL Server của Dubchef

- [Sơ đồ quan hệ chính](so-do/ERD_LienKetChinh.svg) cho thấy đường đi từ tài khoản đến video, công việc, kết quả; từ đơn hàng đến giao dịch và quyền sử dụng; từ phản hồi đến lịch sử xử lý.
- [Sơ đồ bảng và khóa](so-do/ERD_SQL.svg) liệt kê 31 bảng theo [kế hoạch migration](../server/src/migrationPlan.mjs), khóa chính, các khóa ngoại và cột cho phép NULL trong quan hệ.
- Nguồn chỉnh sửa nằm trong [ERD quan hệ chính](so-do/ERD_LienKetChinh.drawio) và [ERD bảng và khóa](so-do/ERD_SQL.drawio).

## Quan hệ cần lưu ý khi trình bày

| Quan hệ | Ràng buộc trong SQL |
|---|---|
| Đơn hàng ↔ người dùng | `DonHang.MaNguoiDung` có thể NULL cho hồ sơ cũ. Các đơn của thành viên được truy vấn theo mã người dùng. |
| Đơn hàng ↔ giao dịch | `GiaoDich` có FK theo mã đơn và FK ghép `(MaDonHang, LoaiTien, SoTien)`. |
| Đơn hàng ↔ quyền sử dụng | `QuyenLoiGoi.MaDonHang` là duy nhất và FK ghép giữ mã đơn đồng nhất với chủ đơn. |
| Video ↔ nội dung và job | Phụ đề và thuyết minh trỏ tới video. FK từ job, tệp xuất, lịch sử nội dung và lượt sử dụng đến video cho phép NULL để giữ các bản ghi này khi xóa video theo quy tắc trong migration. |
| Phản hồi / liên hệ ↔ lịch sử | Mỗi bản ghi lịch sử trỏ đến đúng một trong hai nguồn. ID người xử lý tham chiếu `NguoiDung`. |
| Job ↔ tệp xuất | `TepXuat` chứa metadata và đường dẫn. Tệp tải xuống nằm ở volume `dubchef-uploads`. |

## Ràng buộc nghiệp vụ trong migration 022

| Dữ liệu | Ràng buộc |
|---|---|
| Thanh toán và quyền sử dụng | Đơn `paid` phải có giao dịch `success`. Quyền sử dụng chỉ được ghi khi đơn `paid` và nguồn xác nhận khớp với giao dịch đó. Trigger bảo vệ giao dịch đang làm căn cứ cho đơn. API ghi giao dịch, cập nhật đơn rồi cấp quyền trong một transaction. |
| Công việc xử lý và tệp xuất | Khi còn video gốc, chủ công việc phải trùng với chủ video. Tệp đã gắn công việc phải có cùng mã video với công việc, kể cả khi cả hai cùng về NULL sau khi xóa video. Chỉ mục duy nhất theo công việc và đường dẫn áp dụng cho tệp đã gắn công việc. |
| Lịch sử phản hồi | Nguồn `user` bắt buộc có FK phản hồi; nguồn `contact` bắt buộc có FK liên hệ. FK được chọn phải khớp `MaBanGhi`; FK còn lại để NULL. |

Mở [migration 022](../db/migrations/022_integrity_guards.sql) để xem đầy đủ trigger và CHECK. [Kiểm tra toàn vẹn](../db/tests/integrity-audit.sql) chỉ đọc và báo số bản ghi vi phạm.

Để kiểm tra schema đang chạy trên máy, chạy [schema-catalog.sql](../db/tests/schema-catalog.sql) trong SSMS và đối chiếu với [các migration](../db/migrations/).

## Cách đọc bội số và khóa duy nhất

Trong sơ đồ quan hệ chính, mũi tên đi từ bảng được tham chiếu sang bảng giữ FK. Chẳng hạn `1 → 0..N` nghĩa là mỗi dòng con tham chiếu đúng một dòng cha, còn một dòng cha có thể có từ không đến nhiều dòng con.

| Quan hệ | Bội số và ý nghĩa |
|---|---|
| `NguoiDung` → `DonHang` | `0..1 → 0..N`. Đơn mới có chủ. Một số đơn cũ chưa đối soát có thể có `DonHang.MaNguoiDung = NULL`. |
| `DonHang` → `QuyenLoiGoi`, `XacMinhChuDonHang` | Mỗi quan hệ là `1 → 0..1`. Hai bảng con đều có `UNIQUE(MaDonHang)` riêng. |
| `DonHang` → `GiaoDich` | `1 → 0..N`. Một đơn có thể có nhiều lần giao dịch, trong đó tối đa một bản ghi `success`. |
| `Video` → `ThuyetMinh`, `PhuDe` | Mỗi quan hệ là `1 → 0..N`. `UNIQUE(MaVideo, NgonNgu)` giới hạn mỗi video còn một bản ghi hiện hành cho mỗi ngôn ngữ trong từng bảng. Phiên bản cũ xem trong `LichSuNoiDung`. |
| `PhanHoi` / `LienHe` → `LichSuXuLyPhanHoi` | Mỗi cạnh riêng là `0..1 → 0..N`. Ràng buộc `CHECK` yêu cầu một bản ghi lịch sử chọn đúng một trong hai nguồn. |

Trong `ERD_SQL`, `UK` là khóa duy nhất trên bảng. `UK*` là chỉ mục duy nhất áp dụng với điều kiện ghi ngay bên dưới, ví dụ `GiaoDich.MaDonHang` chỉ duy nhất khi `TrangThai='success'`. Các khóa duy nhất của email, mã tham chiếu giao dịch và mã sự kiện webhook được ghi trực tiếp trên bảng tương ứng.

## Các bảng giá và danh mục đứng riêng

| Bảng | Vai trò trong phiên bản hiện tại |
|---|---|
| `GoiDichVu` | Danh mục gói do `GET /api/pricing` trả để giao diện hiển thị và điền số lượt. Khi lập đơn, backend lưu số lượt và bản chụp giá vào `DonHang`. Schema hiện tại không lưu `MaGoi` trên đơn. |
| `BangGia`, `LichSuBangGia` | Nguồn giá đang dùng. `BangGia` lưu đơn giá và phiên bản theo loại tiền. Khi quản trị viên sửa giá, backend ghi giá cũ và giá mới vào `LichSuBangGia`. |
| `BangGiaDonVi` | Schema đã định nghĩa đơn giá theo loại tiền và thời điểm hiệu lực. Luồng định giá hiện tại đọc `BangGia`. |
| `TyGia` | Schema lưu tỷ giá VND theo loại tiền và ngày hiệu lực. Tính tiền hiện tại dùng đơn giá riêng theo loại tiền, nên Web, Mobile và API chưa gọi bảng này. |
| `LichSuDoiGia` | Schema lưu giá cũ, giá mới, lý do và có FK tùy chọn tới người sửa. Chức năng đổi giá hiện tại ghi `LichSuBangGia`. |

Đối chiếu [API giá](../server/src/pricingRepo.js), [tiếp nhận và định giá đơn](../server/src/repositories/sqlRepository.js) và [migration tạo bảng vận hành](../db/migrations/017_operational_tables.sql).

## Dữ liệu được lưu thêm để giữ lịch sử

| Cột | Lý do lưu song song |
|---|---|
| `NguoiSua`, `NguoiXuLy`, `NguoiThucHien`, `NguoiXacMinh` và các cột `...Id` tương ứng | Trường chữ giữ thông tin người thao tác đã ghi lúc phát sinh sự kiện, thường là email. FK theo ID hỗ trợ đối chiếu tới tài khoản. Bản ghi cũ hoặc do hệ thống tạo có thể không xác định được ID tài khoản. |
| `DonHang.TenKhachHang`, `EmailKhachHang` và `MaNguoiDung` | Tên và email là bản chụp lúc lập đơn. ID xác định chủ đơn hiện tại để truy vấn theo tài khoản và phục vụ đối soát đơn cũ. |
| `LichSuXuLyPhanHoi.MaBanGhi` và `MaPhanHoi` / `MaLienHe` | `MaBanGhi` giữ cách tra cứu lịch sử theo cặp `(Nguon, MaBanGhi)`. FK theo từng nguồn bảo đảm bản ghi gốc tồn tại. Migration 022 buộc FK phù hợp phải có giá trị và khớp `MaBanGhi`. |
| `QuyenLoiGoi.DaDungVideoDang`, `DaDungVideoDich` | Bộ đếm lưu sẵn để đọc số lượt còn lại. Bảng `SuDungQuyenLoi` lưu từng lần dùng, còn trigger SQL cập nhật và kiểm tra bộ đếm khớp với các dòng `used`. |

Các cột bản chụp mô tả dữ liệu **tại thời điểm phát sinh**. Những cột tra cứu và bộ đếm lưu sẵn cần `CHECK` hoặc trigger để tránh lệch với dữ liệu gốc.
