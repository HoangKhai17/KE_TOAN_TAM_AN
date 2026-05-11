# Hướng Dẫn Sử Dụng — Phần Mềm Kế Toán Tâm An

**Phiên bản:** 1.0 &nbsp;|&nbsp; **Ngày cập nhật:** 2026-05-11

---

## Mục Lục

1. [Đăng nhập và Bảo mật](#1-đăng-nhập-và-bảo-mật)
2. [Giao diện chính — Dashboard](#2-giao-diện-chính--dashboard)
3. [Quản lý Công ty](#3-quản-lý-công-ty)
4. [Công việc (Tasks)](#4-công-việc-tasks)
5. [Bảng lương (Payroll)](#5-bảng-lương-payroll)
6. [Nhân viên](#6-nhân-viên)
7. [Cài đặt hệ thống](#7-cài-đặt-hệ-thống)
8. [Tài khoản hệ thống khách hàng (Credentials Vault)](#8-tài-khoản-hệ-thống-khách-hàng-credentials-vault)
9. [Quy trình làm việc hàng tháng](#9-quy-trình-làm-việc-hàng-tháng)
10. [Phân quyền](#10-phân-quyền)

---

## 1. Đăng nhập và Bảo mật

### Đăng nhập

1. Truy cập URL hệ thống (do quản trị viên cung cấp).
2. Nhập **Email** và **Mật khẩu**.
3. Nhấn **Đăng nhập**.

> Tài khoản demo:
> - Admin: `admin@ketoan-taman.vn` / `Admin@2026!`
> - Nhân viên: `lan.nguyen@ketoan-taman.vn` / `Staff@2026!`

### Đăng xuất

Nhấn nút **Đăng xuất** ở góc dưới bên trái sidebar.

### Đổi mật khẩu

Vào **Cài đặt → Tài khoản** để đổi mật khẩu. Khuyến nghị đổi mật khẩu sau lần đăng nhập đầu tiên.

---

## 2. Giao diện chính — Dashboard

Dashboard hiển thị bức tranh tổng quan về tình trạng công việc.

### Các thẻ thống kê (KPI Cards)

| Thẻ | Ý nghĩa |
|-----|---------|
| **Tổng công việc** | Số công việc đang theo dõi trong hệ thống |
| **Đang thực hiện** | Công việc ở trạng thái `in_progress` |
| **Chờ duyệt** | Công việc ở trạng thái `pending_review` |
| **Sắp đến hạn** | Công việc có `due_date` trong 7 ngày tới chưa hoàn thành |
| **Quá hạn** | Công việc đã qua `due_date` chưa hoàn thành |

### Danh sách công việc ưu tiên

Dashboard liệt kê các công việc cần chú ý nhất: quá hạn, đến hạn sớm, ưu tiên cao. Nhấn vào bất kỳ công việc nào để xem chi tiết.

---

## 3. Quản lý Công ty

### Xem danh sách công ty

Vào **menu Công ty** ở sidebar. Danh sách hiển thị:
- Tên công ty, mã số thuế
- Loại hình, ngành nghề
- Nhân viên phụ trách
- Trạng thái: `active` / `inactive` / `terminated`

**Lọc và Tìm kiếm:**
- Ô tìm kiếm: nhập tên hoặc MST để lọc ngay lập tức
- Bộ lọc trạng thái: chọn `Đang hoạt động`, `Tạm dừng`, hoặc `Đã chấm dứt`

### Xem chi tiết công ty

Nhấn vào tên công ty để mở trang chi tiết. Trang chi tiết gồm các tab:

#### Tab Thông tin
Hiển thị đầy đủ thông tin pháp lý:
- Tên, MST, địa chỉ, loại hình, ngành nghề
- Người đại diện pháp luật, đầu mối liên hệ
- Thông tin tài khoản ngân hàng
- Ngày bắt đầu dịch vụ, trạng thái
- Ghi chú nội bộ

**Chỉnh sửa (Admin):** Nhấn nút **Chỉnh sửa** để cập nhật thông tin.

#### Tab Lịch công việc (Schedule)
Hiển thị các loại công việc định kỳ đã đăng ký cho công ty (VD: kê khai GTGT hàng tháng, BHXH...).

- **Thêm lịch:** Nhấn **+ Thêm** → chọn loại công việc, cấu hình tần suất và thông số
- **Kích hoạt/Tắt:** Toggle công tắc để bật/tắt tự động sinh task
- **Xoá:** Nhấn icon thùng rác

> Scheduler tự động chạy hàng ngày lúc 7:00 sáng, tạo task cho các lịch đã kích hoạt theo cấu hình.

#### Tab Phân công nhân viên
Lịch sử phân công nhân viên phụ trách công ty theo thời gian.

- **Phân công mới (Admin):** Nhấn **+ Phân công** → chọn nhân viên và ngày bắt đầu
- Nhân viên hiện tại có `end_date` trống. Khi chuyển giao, nhập `end_date` cho nhân viên cũ trước.

#### Tab Tài khoản hệ thống
Xem [Mục 8 — Credentials Vault](#8-tài-khoản-hệ-thống-khách-hàng-credentials-vault).

### Thêm công ty mới (Admin)

1. Nhấn nút **+ Thêm công ty** (góc trên phải danh sách).
2. Điền các trường bắt buộc: Tên, MST, Loại hình, Địa chỉ.
3. Điền thông tin bổ sung: đại diện pháp luật, liên hệ, ngân hàng, nhân viên phụ trách.
4. Nhấn **Lưu**.

---

## 4. Công việc (Tasks)

### Xem danh sách công việc

Vào **menu Công việc**. Giao diện gồm:
- **Bảng tác vụ** (bên phải): danh sách tất cả công việc đang hiển thị
- **Bộ lọc** (bên trái): lọc theo công ty, nhân viên, loại, trạng thái, ưu tiên, thời gian

**Các cột trong bảng:**
- Tiêu đề công việc
- Công ty
- Trạng thái (badge màu)
- Ưu tiên
- Ngày đến hạn
- Nhân viên phụ trách

**Trạng thái công việc:**

| Trạng thái | Màu | Ý nghĩa |
|-----------|-----|---------|
| `pending` | Xám | Chờ xử lý |
| `in_progress` | Xanh dương | Đang thực hiện |
| `pending_review` | Vàng | Chờ kiểm duyệt |
| `needs_revision` | Cam | Cần chỉnh sửa |
| `on_hold` | Tím | Tạm giữ |
| `completed` | Xanh lá | Hoàn thành |

**Mức ưu tiên:** `low` → `medium` → `high` → `urgent`

### Xem chi tiết công việc

Nhấn vào tiêu đề công việc để mở trang chi tiết. Gồm các tab:

#### Tab Checklist
Danh sách các bước cần hoàn thành. Tích vào ô checkbox để đánh dấu bước đã xong.

#### Tab Phụ thuộc (Dependencies)
Các công việc phải hoàn thành trước công việc này. Nếu có phụ thuộc chưa xong, công việc sẽ bị chặn.

- **Thêm phụ thuộc:** Nhấn **+ Thêm** → tìm và chọn công việc tiên quyết.

#### Tab Bình luận
Trao đổi nội bộ về công việc.

- Nhập nội dung vào ô text → nhấn **Gửi** (hoặc `Ctrl+Enter`)
- Hỗ trợ mention `@tên` để thông báo

#### Tab Hoạt động (Activity)
Lịch sử thay đổi tự động: ai tạo, ai đổi trạng thái, ai thêm bình luận, ai tích checklist...

#### Tab Ghi giờ (Time Logs)
Ghi nhận thời gian làm việc cho công việc.

- Nhấn **+ Ghi giờ** → nhập số giờ, ngày, ghi chú
- Tổng giờ thực tế được cộng dồn tự động

#### Tab Trường tùy chỉnh (Custom Fields)
Các trường dữ liệu bổ sung theo loại công việc (VD: kỳ kê khai, số tờ khai, mã cơ quan thuế...).

### Thay đổi trạng thái công việc

Trong trang chi tiết công việc, nhấn vào badge trạng thái hiện tại (hoặc nút action) để chuyển sang trạng thái mới.

Quy trình thông thường:
```
pending → in_progress → pending_review → completed
                      ↘ needs_revision ↗
```

Khi chuyển sang `on_hold`, hệ thống yêu cầu nhập lý do giữ lại.

### Tạo công việc thủ công (Admin)

1. Nhấn **+ Tạo công việc** (góc trên phải danh sách).
2. Chọn **Loại công việc**, **Công ty**, **Nhân viên phụ trách**.
3. Đặt **Ưu tiên**, **Ngày đến hạn**, **Nhãn kỳ** (tùy chọn, VD: T05/2026).
4. Nhập **Mô tả** nếu cần.
5. Nhấn **Tạo công việc**.

> Công việc định kỳ được tạo tự động bởi Scheduler — xem [Mục 7.4](#74-bộ-lập-lịch-tự-động).

---

## 5. Bảng lương (Payroll)

> Chỉ Admin mới có quyền truy cập mục này.

### Xem danh sách kỳ lương

Vào **menu Bảng lương**. Hiển thị tất cả kỳ lương theo tháng/năm.

**Trạng thái kỳ lương:**

| Trạng thái | Ý nghĩa |
|-----------|---------|
| `draft` | Nháp — đang nhập liệu, có thể sửa |
| `confirmed` | Đã xác nhận — khoá nhập liệu, chờ thanh toán |
| `paid` | Đã thanh toán |

### Tạo kỳ lương mới

1. Nhấn **+ Tạo kỳ lương**.
2. Chọn **Tháng**, **Năm**, **Ngày bắt đầu**, **Ngày kết thúc**.
3. Nhập ghi chú nếu cần.
4. Nhấn **Tạo kỳ lương** — hệ thống tạo kỳ lương ở trạng thái `draft`.

### Nhập bảng lương (Draft)

Nhấn vào kỳ lương để vào trang chi tiết.

**Thêm nhân viên vào kỳ lương:**
1. Nhấn **+ Thêm nhân viên**.
2. Chọn nhân viên từ danh sách (chỉ hiện nhân viên chưa có trong kỳ này).
3. Nhập các khoản:
   - **Thu nhập:** Lương cơ bản, Phụ cấp, Thưởng
   - **Khấu trừ nhân viên:** BHXH (8%), BHYT (1.5%), BHTN (1%), Thuế TNCN, Khấu trừ khác
   - **Đóng góp công ty:** BHXH (17.5%), BHYT (3%), BHTN (1%)
4. Lương thực nhận (`Net`) được tính tự động: `Lương CB + Phụ cấp + Thưởng - BHXH NV - BHYT NV - BHTN NV - TNCN - KT khác`
5. Nhấn **Lưu**.

**Chỉnh sửa bản ghi:** Nhấn icon bút chì bên cạnh tên nhân viên.

**Xoá bản ghi:** Nhấn icon thùng rác → xác nhận xoá.

### Xác nhận kỳ lương

Khi đã nhập đủ lương cho tất cả nhân viên:

1. Nhấn **Xác nhận kỳ lương**.
2. Trạng thái chuyển sang `confirmed` — không thể sửa bản ghi nữa.

### Đánh dấu đã thanh toán

Sau khi chuyển khoản lương thực tế:

1. Nhấn **Đã thanh toán**.
2. Trạng thái chuyển sang `paid`.

### Xuất Excel

Nhấn **Xuất Excel** để tải file `.xlsx` chứa toàn bộ bảng lương của kỳ đã chọn.

---

## 6. Nhân viên

> Chỉ Admin mới có quyền truy cập.

### Xem danh sách nhân viên

Vào **menu Nhân viên**. Hiển thị tất cả tài khoản trong hệ thống.

**Thông tin hiển thị:** Họ tên, Email, Chức danh, Vai trò (Admin/Staff), Trạng thái.

### Thêm nhân viên

1. Nhấn **+ Thêm nhân viên**.
2. Điền Họ tên, Email, Số điện thoại, Chức danh.
3. Chọn Vai trò: `staff` (nhân viên thường) hoặc `admin` (quản trị).
4. Nhập mật khẩu tạm thời → nhân viên sẽ được yêu cầu đổi khi đăng nhập lần đầu.
5. Nhấn **Lưu**.

### Chỉnh sửa nhân viên

Nhấn vào tên hoặc icon bút chì để cập nhật thông tin (trừ email — không thể đổi).

### Khoá / Mở tài khoản

Nhấn nút **Khoá** / **Mở khoá** bên cạnh tên nhân viên. Tài khoản bị khoá không thể đăng nhập.

---

## 7. Cài đặt hệ thống

Vào **menu Cài đặt** (chỉ Admin). Gồm các mục con:

### 7.1 Loại công việc

Quản lý danh mục loại công việc (task types) trong hệ thống.

**Thêm loại công việc:**
1. Nhấn **+ Thêm**.
2. Nhập Tên, Mô tả, chọn Màu nhãn, biểu tượng.
3. Nhấn **Lưu**.

**Sửa/Xoá:** Sử dụng icon tương ứng trên mỗi dòng.

### 7.2 Checklist mẫu

Mỗi loại công việc có thể có checklist mẫu (template). Khi tạo task mới, checklist sẽ được sao chép từ mẫu này.

**Cấu hình checklist mẫu:**
1. Chọn loại công việc → nhấn tab **Checklist mẫu**.
2. Nhấn **+ Thêm bước** để thêm từng bước.
3. Kéo thả để sắp xếp thứ tự.
4. Nhấn biểu tượng thùng rác để xoá bước.

### 7.3 Quản lý Enum

Các giá trị tùy chỉnh (dropdown) cho trường dữ liệu của từng loại công việc. VD: kỳ kê khai, trạng thái hồ sơ...

### 7.4 Bộ lập lịch tự động

Scheduler tự động tạo task định kỳ cho các công ty theo lịch đã đăng ký.

**Xem trạng thái:**
- `Đang hoạt động` / `Đã tắt`
- Lần chạy gần nhất: ngày giờ
- Kết quả lần chạy gần nhất: số task đã tạo, bỏ qua, lỗi

**Chạy thủ công:**
Nhấn **Chạy ngay** để kích hoạt Scheduler ngay lập tức (không chờ đến 7:00 sáng).

> Scheduler kiểm tra từng công ty có lịch kích hoạt, tính ngày đến hạn theo cấu hình, và tạo task nếu chưa tồn tại trong kỳ đó.

---

## 8. Tài khoản hệ thống khách hàng (Credentials Vault)

Lưu trữ thông tin đăng nhập vào các cổng điện tử của khách hàng (eTax, BHXH Online, ngân hàng...) theo chuẩn bảo mật AES-256-GCM.

> **Quan trọng:** Mật khẩu được mã hoá server-side. Mỗi lần xem mật khẩu đều được ghi vào audit log.

### Truy cập Credentials Vault

1. Vào trang chi tiết công ty (xem [Mục 3](#3-quản-lý-công-ty)).
2. Chọn tab **Tài khoản hệ thống**.

### Xem danh sách tài khoản

Mỗi thẻ hiển thị:
- **Tên hệ thống** (VD: Cổng thuế eTax, BHXH điện tử)
- **Tài khoản đăng nhập** (username/MST)
- **Mật khẩu:** hiển thị `•••••••` — nhấn icon mắt để xem
- **URL** hệ thống (nếu có) — nhấn icon link để mở
- Ngày cập nhật cuối

**Lọc:** Sử dụng dropdown để xem `Tất cả`, `Đang kích hoạt`, hoặc `Đã tắt`.

### Xem mật khẩu

1. Nhấn icon **mắt** trên thẻ tài khoản cần xem.
2. Hệ thống giải mã và hiển thị mật khẩu trong hộp thoại.
3. Nhấn **Sao chép** để copy vào clipboard.
4. Thao tác này được ghi vào audit log tự động.

### Thêm tài khoản (Admin)

1. Nhấn **+ Thêm tài khoản**.
2. Điền:
   - **Tên hệ thống** (bắt buộc): VD "Cổng thuế eTax"
   - **URL hệ thống**: đường dẫn để mở nhanh
   - **Tên đăng nhập** (bắt buộc): MST hoặc username
   - **Mật khẩu** (bắt buộc khi tạo mới)
   - **Ghi chú**: thông tin bổ sung
3. Nhấn **Lưu** — mật khẩu được mã hoá ngay khi lưu.

### Sửa tài khoản (Admin)

Nhấn icon **bút chì** → cập nhật thông tin. Để trường mật khẩu trống nếu không muốn đổi mật khẩu.

### Tắt tài khoản (Admin)

Khi tài khoản hết sử dụng, có thể tắt (không xoá) bằng cách chỉnh sửa và bỏ chọn **Đang kích hoạt**.

### Xoá tài khoản (Admin)

Nhấn icon **thùng rác** → xác nhận. Thao tác này **không thể hoàn tác**.

---

## 9. Quy trình làm việc hàng tháng

Dưới đây là quy trình mẫu cho một tháng làm việc điển hình.

### Đầu tháng (ngày 1–3)

1. **Scheduler tự động** tạo các task định kỳ cho tháng mới (chạy lúc 7:00 ngày 1/tháng).
2. **Admin kiểm tra** Dashboard — xem task nào được sinh ra, phân công đúng chưa.
3. **Nhân viên** vào Dashboard → xem danh sách công việc được giao.

### Trong tháng

**Nhân viên thực hiện từng task:**

1. Nhấn vào task → đổi trạng thái sang `in_progress`.
2. Tích hoàn thành từng bước trong **Checklist**.
3. Ghi nhận thời gian trong **Ghi giờ**.
4. Khi xong → đổi trạng thái sang `pending_review`.
5. Thêm **bình luận** nếu cần thông báo cho Admin.

**Admin duyệt:**

1. Vào tab **Chờ duyệt** trên Dashboard.
2. Kiểm tra nội dung → nếu OK: đổi sang `completed`.
3. Nếu cần sửa: đổi sang `needs_revision` + comment hướng dẫn.

### Cuối tháng

1. **Lập bảng lương:**
   - Admin tạo kỳ lương mới trong **Bảng lương**.
   - Nhập số liệu cho từng nhân viên.
   - Xác nhận kỳ lương khi hoàn tất.
   - Đánh dấu **Đã thanh toán** sau khi chuyển khoản.

2. **Kiểm tra tồn đọng:**
   - Lọc task `overdue` (quá hạn) — liên hệ nhân viên phụ trách.
   - Lọc `on_hold` — xem lý do giữ lại, có thể xử lý được chưa.

---

## 10. Phân quyền

| Tính năng | Admin | Staff |
|-----------|:-----:|:-----:|
| Xem dashboard | ✓ | ✓ |
| Xem danh sách công ty | ✓ | ✓ |
| Sửa thông tin công ty | ✓ | — |
| Thêm/xoá công ty | ✓ | — |
| Xem danh sách task | ✓ | ✓ (task được giao) |
| Tạo task thủ công | ✓ | — |
| Cập nhật trạng thái task | ✓ | ✓ |
| Tích checklist, ghi giờ, bình luận | ✓ | ✓ |
| Xem lịch sử phân công | ✓ | ✓ |
| Phân công nhân viên | ✓ | — |
| Quản lý lịch công việc (Schedule) | ✓ | — |
| Xem tài khoản hệ thống (Credentials) | ✓ | ✓ |
| Thêm/sửa/xoá Credentials | ✓ | — |
| Xem mật khẩu Credentials | ✓ | ✓ |
| Bảng lương | ✓ | — |
| Quản lý nhân viên | ✓ | — |
| Cài đặt hệ thống | ✓ | — |

---

## Ghi chú kỹ thuật

- **Trình duyệt hỗ trợ:** Chrome 110+, Firefox 115+, Edge 110+, Safari 16+
- **Độ phân giải tối thiểu:** 1280×720
- **Phiên đăng nhập:** tự động gia hạn; hết hạn sau 7 ngày không hoạt động
- **Mã hóa dữ liệu:** mật khẩu credentials được mã hoá AES-256-GCM, không ai (kể cả quản trị server) xem được mật khẩu plaintext mà không có khóa mã hoá
- **Audit log:** mọi thao tác xem mật khẩu credentials đều được ghi lại với thông tin user và thời gian
