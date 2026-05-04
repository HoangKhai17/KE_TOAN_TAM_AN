# 02 — Danh Sách Chức Năng

## Tổng Quan Các Module

```
┌─────────────────────────────────────────────────────────────┐
│                   HỆ THỐNG KẾ TOÁN TÂM AN                  │
├──────────────┬──────────────┬──────────────┬────────────────┤
│  M1: Hồ Sơ  │ M2: Nhân Sự │ M3: Công     │ M4: Báo Cáo   │
│  Khách Hàng │              │ Việc         │ & Thống Kê     │
├──────────────┴──────────────┴──────────────┴────────────────┤
│  M5: Hồ Sơ Giấy Tờ         │  M6: Cấu Hình Hệ Thống       │
└─────────────────────────────┴────────────────────────────────┘
```

---

## Module 1: Hồ Sơ Khách Hàng (Doanh Nghiệp)

> Quản lý thông tin các công ty mà Tâm An đang cung cấp dịch vụ kế toán.

### 1.1 Danh Sách Khách Hàng
- Xem danh sách tất cả doanh nghiệp đang phục vụ
- Tìm kiếm, lọc theo: tên công ty, mã số thuế, nhân viên phụ trách, trạng thái hợp đồng
- Phân loại theo loại hình doanh nghiệp (TNHH, CP, HKD, ...)
- Hiển thị trạng thái tổng quan: số việc đang mở, số việc quá hạn

### 1.2 Hồ Sơ Doanh Nghiệp
- Thông tin cơ bản: Tên, địa chỉ, MST, ngành nghề, loại hình
- Thông tin đại diện pháp lý, người liên hệ
- Thông tin tài khoản ngân hàng
- **Nhân viên kế toán phụ trách** (liên kết với Module 2)
- Ngày bắt đầu hợp đồng dịch vụ
- Ghi chú đặc thù (ví dụ: "Công ty xuất nhập khẩu - cần khai thuế NK")

### 1.3 Phân Công Nhân Viên
- Gán / thay đổi nhân viên phụ trách cho một doanh nghiệp
- Lịch sử phân công (ai phụ trách từ ngày nào đến ngày nào)
- Cảnh báo khi doanh nghiệp chưa có nhân viên phụ trách

---

## Module 2: Quản Lý Nhân Sự

> Quản lý thông tin nhân viên kế toán nội bộ của Tâm An.

### 2.1 Danh Sách Nhân Viên
- Xem toàn bộ nhân viên đang làm việc
- Thông tin: họ tên, email, số điện thoại, ngày vào làm, chức danh
- Trạng thái: đang làm / nghỉ phép / đã nghỉ việc

### 2.2 Hồ Sơ Nhân Viên
- Thông tin cá nhân cơ bản
- **Danh sách công ty đang phụ trách** (liên kết Module 1)
- **Tổng quan công việc**: số việc đang mở, hoàn thành trong tháng, quá hạn
- Phân quyền trong hệ thống (Admin / Nhân viên)

### 2.3 Theo Dõi Khối Lượng Công Việc
- Hiển thị tải công việc hiện tại của từng nhân viên
- So sánh khối lượng giữa các nhân viên (dùng cho phân công cân bằng)
- Lịch sử hoàn thành công việc theo tháng

---

## Module 3: Quản Lý Công Việc

> **Module trung tâm** của hệ thống — nơi toàn bộ đầu việc được tạo, giao và theo dõi.

### 3.1 Loại Công Việc & Mẫu Công Việc (Task Template)

**Ý nghĩa:** Vì công việc kế toán lặp lại theo chu kỳ, hệ thống cần lưu sẵn các **mẫu công việc** để tự động sinh ra đầu việc cụ thể, không cần nhập thủ công mỗi lần.

| Loại | Mô tả | Ví dụ |
|------|-------|-------|
| **Định kỳ - Hàng tháng** | Tự động sinh vào ngày X mỗi tháng | Kê khai thuế GTGT (sinh ngày 1, hạn ngày 20) |
| **Định kỳ - Hàng quý** | Tự động sinh vào đầu mỗi quý | Báo cáo tài chính quý (sinh ngày 1/4, 1/7, 1/10, 1/1) |
| **Định kỳ - Hàng tuần** | Tự động sinh mỗi tuần | Đối soát chứng từ thứ Hai hàng tuần |
| **Thường xuyên** | Không có lịch cố định, xảy ra thường xuyên | Nhập hóa đơn, kiểm tra ngân hàng |
| **Không thường xuyên** | Phát sinh theo sự kiện | Quyết toán năm, thay đổi đăng ký KD |

**Tính năng Template:**
- Tạo, chỉnh sửa, xóa mẫu công việc
- Mỗi template có: tên, loại, mô tả, thời gian hoàn thành tiêu chuẩn (SLA)
- Cấu hình lịch tự động sinh việc (ngày trong tháng, ngày trong quý)
- Template có thể áp dụng cho: tất cả KH / một nhóm KH / KH cụ thể

### 3.2 Tạo & Giao Công Việc

- **Tạo từ template:** Hệ thống tự sinh hoặc Quản lý chủ động tạo từ mẫu
- **Tạo thủ công:** Nhập tên, mô tả, hạn hoàn thành, mức độ ưu tiên
- **Giao việc:** Gán công việc cho nhân viên cụ thể + khách hàng liên quan
- **Phân công lại:** Quản lý có thể chuyển việc từ nhân viên này sang nhân viên khác
- Đính kèm file tài liệu tham chiếu khi tạo việc

### 3.3 Theo Dõi & Cập Nhật Trạng Thái

**Luồng trạng thái công việc:**

```
[Chờ xử lý] → [Đang thực hiện] → [Chờ duyệt] → [Hoàn thành]
                      ↓
                 [Tạm hoãn]
                      ↓
              [Cần xem xét lại]
```

- Nhân viên cập nhật trạng thái và ghi chú tiến độ
- Nhật ký hoạt động (activity log) cho mỗi công việc
- Đính kèm file kết quả / bằng chứng hoàn thành
- Comment nội bộ giữa nhân viên và quản lý trên từng việc

### 3.4 Quản Lý Deadline & Nhắc Nhở

- Hiển thị cảnh báo công việc sắp đến hạn (trước N ngày — cấu hình được)
- Cảnh báo công việc đã quá hạn (highlight đỏ)
- **Tự động nhắc nhở:** Email / thông báo trong app khi gần đến deadline
- Dashboard "Cần xử lý hôm nay" cho từng nhân viên

### 3.5 Xem Công Việc Theo Nhiều Góc Nhìn

| Góc nhìn | Mô tả |
|----------|-------|
| **Theo nhân viên** | Toàn bộ việc của một nhân viên, lọc theo trạng thái/thời gian |
| **Theo khách hàng** | Toàn bộ việc của một công ty KH |
| **Theo thời gian** | Lịch công việc dạng calendar (tháng/tuần) |
| **Tổng quan (Board)** | Dạng Kanban: cột theo trạng thái, card là từng việc |
| **Danh sách** | Bảng danh sách, sắp xếp/lọc linh hoạt |

---

## Module 4: Báo Cáo & Thống Kê

> Cung cấp dữ liệu cho Quản lý ra quyết định.

### 4.1 Dashboard Tổng Quan (Quản Lý)

**Thẻ số liệu nhanh (KPI Cards):**
- Tổng số việc đang mở / hoàn thành trong tháng
- Số việc quá hạn (cảnh báo đỏ)
- Số công ty KH đang có việc trễ hạn

**Biểu đồ:**
- Tỷ lệ hoàn thành công việc theo tuần/tháng (line chart)
- Phân bố công việc theo nhân viên (bar chart)
- Công việc theo loại (pie chart: định kỳ tháng / quý / tuần / thường xuyên)

### 4.2 Báo Cáo Nhân Sự

- Số lượng công việc hoàn thành theo nhân viên trong kỳ
- Tỷ lệ hoàn thành đúng hạn của từng nhân viên
- Công việc quá hạn theo nhân viên

### 4.3 Báo Cáo Theo Khách Hàng

- Danh sách công ty có việc đang trễ hạn
- Lịch sử công việc của một công ty (timeline)
- Tiến độ hoàn thành các đầu việc định kỳ

### 4.4 Xuất Báo Cáo
- Xuất Excel / CSV danh sách công việc theo bộ lọc tùy chọn
- In báo cáo tổng hợp tháng/quý

---

## Module 5: Quản Lý Hồ Sơ & Giấy Tờ

> Lưu trữ tập trung các tài liệu liên quan đến từng khách hàng.

### 5.1 Kho Tài Liệu Theo Khách Hàng
- Mỗi doanh nghiệp có thư mục tài liệu riêng
- Upload, xem, tải về tài liệu
- Phân loại theo danh mục: Hợp đồng, Báo cáo thuế, Sổ sách, Giấy phép, Khác

### 5.2 Tài Liệu Đính Kèm Công Việc
- Tài liệu có thể gắn với một công việc cụ thể
- Lưu kết quả / đầu ra của công việc (ví dụ: file báo cáo đã nộp)

### 5.3 Tìm Kiếm Tài Liệu
- Tìm theo tên file, loại tài liệu, khách hàng, ngày tạo

---

## Module 6: Cấu Hình Hệ Thống

> Dành cho Admin quản lý cài đặt và danh mục hệ thống.

### 6.1 Quản Lý Người Dùng & Phân Quyền
- Tạo tài khoản cho nhân viên mới
- Gán vai trò: Admin / Nhân viên
- Reset mật khẩu, khóa/mở tài khoản

### 6.2 Danh Mục Hệ Thống
- Quản lý danh mục loại công việc
- Quản lý danh mục loại hình doanh nghiệp
- Cấu hình số ngày cảnh báo trước deadline

### 6.3 Cấu Hình Template Công Việc Định Kỳ
- Xem, tạo, chỉnh sửa toàn bộ template định kỳ
- Bật/tắt tự động sinh việc
- Kiểm tra lịch sinh việc sắp tới

---

## Bảng Tóm Tắt Ưu Tiên Tính Năng

| Module | Tính năng | Ưu tiên | Ghi chú |
|--------|-----------|---------|---------|
| M1 | Hồ sơ doanh nghiệp | 🔴 P1 | Nền tảng của toàn hệ thống |
| M2 | Hồ sơ nhân viên + phân công | 🔴 P1 | |
| M3 | Tạo & giao công việc | 🔴 P1 | |
| M3 | Template công việc định kỳ | 🔴 P1 | Đặc thù quan trọng nhất |
| M3 | Theo dõi trạng thái | 🔴 P1 | |
| M3 | Cảnh báo deadline | 🟠 P2 | |
| M4 | Dashboard tổng quan | 🟠 P2 | |
| M3 | Calendar view | 🟠 P2 | |
| M5 | Quản lý tài liệu | 🟡 P3 | |
| M4 | Báo cáo chi tiết + xuất Excel | 🟡 P3 | |
| M3 | Kanban board | 🟡 P3 | |
