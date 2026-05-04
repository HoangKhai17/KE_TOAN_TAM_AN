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

### 3.1 Thiết Kế 2 Lớp: Thư Viện Loại Công Việc & Lịch Lặp Theo Khách Hàng

> Tách biệt "loại công việc dùng chung" với "lịch lặp riêng từng khách hàng" để linh hoạt tối đa — mỗi khách hàng có đặc thù nghiệp vụ riêng.

#### Lớp 1 — Thư Viện Loại Công Việc (Task Type Library)

Danh mục dùng chung toàn hệ thống. Admin tạo và quản lý. Mỗi loại công việc định nghĩa:
- Tên, mô tả, hướng dẫn thực hiện
- SLA mặc định (thời gian hoàn thành tiêu chuẩn tính bằng ngày)
- Checklist bước thực hiện mặc định (có thể override khi áp dụng cho KH cụ thể)
- Danh sách trường tùy chỉnh (custom fields) đặc thù theo loại

| Nhóm | Ví dụ loại công việc |
|------|---------------------|
| Khai thuế | Kê khai thuế GTGT, Thuế TNCN, Thuế môn bài, Thuế nhà thầu |
| Báo cáo tài chính | Báo cáo quý, Quyết toán năm, Báo cáo lưu chuyển tiền tệ |
| Nhân sự — lương | Lập bảng lương, Đóng BHXH/BHYT, Quyết toán TNCN cuối năm |
| Chứng từ — đối soát | Nhập hóa đơn đầu vào, Đối soát ngân hàng, Kiểm tra công nợ |
| Hành chính | Thay đổi đăng ký KD, Gia hạn giấy phép, Hỗ trợ kiểm toán |

#### Lớp 2 — Lịch Công Việc Theo Khách Hàng (Customer Task Schedule)

Mỗi khách hàng có danh sách công việc định kỳ được cấu hình riêng. Với mỗi mục cấu hình:
- Chọn loại công việc từ Lớp 1
- Thiết lập quy tắc lặp lại (xem bảng bên dưới)
- Offset deadline: ví dụ sinh ngày 1 + `+20 ngày` = hạn ngày 20
- Override SLA nếu KH có yêu cầu đặc biệt về thời gian
- Ghi chú đặc thù riêng cho KH này (ví dụ: "KH xuất nhập khẩu — cần khai thêm thuế NK")
- Gán nhân viên thực hiện (mặc định là nhân viên phụ trách KH)

**Bộ quy tắc lặp lại đầy đủ (tương đương ClickUp Repeat):**

| Chế độ | Tham số cấu hình | Ví dụ |
|--------|-----------------|-------|
| **Hàng ngày** | Mỗi N ngày | Mỗi 2 ngày kiểm tra giao dịch ngân hàng |
| **Hàng tuần** | Chọn một hoặc nhiều thứ trong tuần | Thứ 2 + Thứ 5 hàng tuần đối soát chứng từ |
| **Hàng tháng — theo ngày cố định** | Ngày X mỗi tháng | Ngày 1 mỗi tháng sinh kê khai GTGT |
| **Hàng tháng — theo thứ** | Thứ X tuần thứ Y trong tháng | Thứ 2 tuần đầu tháng họp review KH |
| **Hàng tháng — ngày cuối tháng** | Tự tính 28/29/30/31 theo tháng | Cuối tháng chốt số liệu kế toán |
| **Hàng quý** | Tháng thứ N trong quý + ngày cụ thể | Tháng đầu quý, ngày 5 nộp báo cáo quý |
| **Hàng năm** | Tháng + ngày cụ thể | 31/03 hàng năm quyết toán thuế TNDN |
| **Danh sách ngày tùy chỉnh** | Chọn thủ công các ngày trong năm | 15/01, 15/04, 15/07, 15/10 |
| **Một lần** | Ngày cụ thể trong tương lai | Task phát sinh đặc thù, không lặp |

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

### 3.6 Subtask & Checklist Bước Thực Hiện

- Mỗi task có danh sách bước thực hiện dạng checklist
- Checklist mặc định lấy từ Task Type Library (Lớp 1), có thể chỉnh sửa khi tạo task
- Nhân viên tick từng bước → quản lý biết đang ở bước nào mà không cần hỏi
- Phần trăm hoàn thành hiển thị trực tiếp trên card task (dựa trên số bước đã tick)

**Ví dụ checklist task `Kê khai thuế GTGT`:**
- ☐ Thu thập hóa đơn đầu vào / đầu ra trong tháng
- ☐ Đối chiếu số liệu với phần mềm kế toán
- ☐ Lập tờ khai trên phần mềm khai thuế
- ☐ Nộp tờ khai điện tử lên cổng thuế
- ☐ Lưu biên lai xác nhận đã nộp

### 3.7 Task Dependencies (Phụ Thuộc Công Việc)

- Cấu hình quan hệ: "Task B chỉ bắt đầu khi Task A hoàn thành"
- Hệ thống cảnh báo nếu nhân viên cố cập nhật task B khi task A chưa xong
- Hiển thị chuỗi phụ thuộc trực quan trên màn hình task

**Ví dụ chuỗi phụ thuộc điển hình trong tháng:**

```
[Nhập hóa đơn đầu vào] → [Đối soát ngân hàng] → [Lập bảng lương] → [Kê khai GTGT]
```

### 3.8 Theo Dõi Thời Gian Thực Tế (Time Tracking)

- Nhân viên ghi nhận thời gian thực tế thực hiện task (nhập thủ công khi hoàn thành)
- Hệ thống so sánh thực tế vs SLA chuẩn → highlight task nào vượt SLA bất thường
- Dữ liệu thời gian hiển thị trên báo cáo hiệu suất và báo cáo SLA
- Quản lý dùng để điều chỉnh SLA chuẩn hoặc cân bằng phân công hợp lý hơn

### 3.9 Trường Tùy Chỉnh Theo Loại Công Việc (Custom Fields)

Mỗi loại công việc trong Task Type Library có thể cấu hình thêm trường thông tin riêng để lưu kết quả cụ thể:

| Loại công việc | Custom Fields |
|----------------|---------------|
| Kê khai thuế GTGT | Kỳ khai, số thuế phát sinh, số thuế phải nộp, mã biên lai, ngày nộp |
| Lập bảng lương | Số lao động, tổng lương gross, đã gửi KH duyệt chưa |
| Quyết toán thuế TNCN | Số người quyết toán, tổng thuế phát sinh, trạng thái hoàn thuế |
| Thay đổi đăng ký KD | Loại thay đổi, cơ quan nộp hồ sơ, số biên nhận, ngày hẹn trả |

### 3.10 Quy Tắc Escalation (Leo Thang Xử Lý)

- **Tự động cảnh báo quản lý** khi task quá hạn N ngày mà không có bất kỳ cập nhật nào
- **Tự động chuyển trạng thái** sang `Cần xem xét lại` nếu task bị tạm hoãn quá N ngày
- **Email tổng hợp buổi sáng** gửi quản lý: danh sách task quá hạn + task sắp đến hạn hôm nay
- Cấu hình ngưỡng N ngày riêng theo từng loại công việc hoặc mức độ ưu tiên (P1/P2/P3)

---

## Module 4: Báo Cáo & Thống Kê

> Cung cấp dữ liệu đa chiều cho Quản lý ra quyết định và theo dõi hiệu suất tổng thể.

### 4.1 Dashboard Tổng Quan (Quản Lý)

**KPI Cards — thẻ số liệu nhanh:**
- Tổng số việc đang mở / hoàn thành trong tháng
- Số việc quá hạn (highlight đỏ, click vào xem chi tiết)
- Số KH đang có việc trễ hạn
- Tỷ lệ hoàn thành đúng SLA tháng này (%)

**Biểu đồ tổng quan:**
- Tỷ lệ hoàn thành công việc theo tuần trong tháng (line chart — xu hướng)
- Phân bố công việc hiện tại theo nhân viên (bar chart — phát hiện quá tải)
- Phân bố theo loại công việc (pie chart — định kỳ tháng / quý / phát sinh)
- Heat map task theo ngày trong tháng (xem ngày nào deadline dày đặc)

### 4.2 Ma Trận Báo Cáo Chéo (Cross-Dimension Reports)

> Xem dữ liệu theo tổ hợp 2 chiều: ai làm gì, khách hàng nào ra sao, loại việc nào có vấn đề.

| Chiều phân tích | Theo Tháng | Theo Quý | Theo Năm |
|-----------------|-----------|---------|---------|
| **Theo Nhân Viên** | Số task HT, % đúng hạn, số task trễ | Tổng kết hiệu suất quý | So sánh năm |
| **Theo Khách Hàng** | Task trễ, task đang mở, task HT | Tình trạng phục vụ KH trong quý | Lịch sử toàn bộ KH |
| **Theo Loại Công Việc** | Loại nào đang trễ nhiều nhất | Xu hướng theo quý | Phân tích SLA theo loại |

### 4.3 Báo Cáo SLA & Hiệu Suất

**Báo cáo SLA Compliance:**
- % task hoàn thành trong thời gian SLA chuẩn — drill down theo loại / nhân viên / KH
- Loại công việc nào hay vượt SLA → cơ sở để điều chỉnh thời gian chuẩn
- Phân bố: task hoàn thành trước hạn / đúng hạn / trễ 1–3 ngày / trễ >3 ngày

**Báo cáo Aging (Task đang tồn đọng):**
- Danh sách task đang mở, sắp xếp theo số ngày đã mở
- Heat map màu: xanh (mới) → vàng (sắp đến hạn) → đỏ (quá hạn)
- Phát hiện task "zombie" — mở quá lâu mà không có bất kỳ cập nhật nào

**Báo cáo Velocity:**
- Số task hoàn thành mỗi tuần/tháng theo nhân viên — phát hiện xu hướng giảm sút
- So sánh kỳ này vs kỳ trước (tháng/quý)

**Báo cáo Dự Báo (Forecast):**
- Dựa trên Customer Task Schedule → dự báo số task sẽ sinh ra tháng tới
- Tổng khối lượng dự kiến theo nhân viên → phát hiện sớm trường hợp sắp quá tải

### 4.4 Báo Cáo Nhân Sự Chi Tiết

- Số lượng / tỷ lệ hoàn thành đúng hạn / trễ theo từng nhân viên trong kỳ
- Thời gian thực tế vs SLA chuẩn (từ dữ liệu time tracking)
- Top 5 loại công việc mỗi nhân viên thực hiện nhiều nhất
- Lịch sử hoàn thành theo tháng (sparkline 12 tháng)

### 4.5 Báo Cáo Theo Khách Hàng

- Danh sách KH có việc đang trễ hạn (xếp theo mức độ nghiêm trọng)
- Timeline lịch sử công việc của từng KH
- % hoàn thành các đầu việc định kỳ trong tháng/quý (đủ hay thiếu đầu việc)
- KH nào đang có nhiều task tồn đọng nhất

### 4.6 Xuất Báo Cáo

- Xuất Excel / CSV danh sách công việc theo bộ lọc tùy chọn (nhân viên, KH, loại, kỳ)
- Báo cáo tổng hợp tháng / quý dạng PDF để họp nội bộ
- Lịch sử xuất báo cáo (ai xuất, lúc nào, bộ lọc gì)

---

## Module 5: Quản Lý Hồ Sơ & Giấy Tờ

> Lưu trữ tập trung tài liệu liên quan đến từng khách hàng — **tích hợp OneDrive của Tâm An**, không phát sinh chi phí storage bổ sung.

### 5.1 Tích Hợp OneDrive (Microsoft Graph API)

**Chiến lược lưu trữ:** Dùng OneDrive Business của Tâm An (có sẵn trong Microsoft 365) làm backend lưu file. Hệ thống chỉ lưu metadata trong database — không tự host storage server riêng.

**Luồng hoạt động:**
1. Người dùng upload file qua giao diện hệ thống
2. Backend gọi Microsoft Graph API → lưu tự động vào OneDrive theo cấu trúc thư mục chuẩn
3. Database chỉ lưu metadata: `file_name`, `category`, `onedrive_item_id`, `web_url`, `task_id` (nếu có), `uploaded_by`, `uploaded_at`
4. Khi xem / tải: hệ thống generate link trực tiếp từ OneDrive API, không đi qua server trung gian

**Cấu trúc thư mục OneDrive tự động tạo:**

```
/TamAn_Documents/
    ├── KH_CtyABC/
    │   ├── 2026-01_GTGT/
    │   ├── 2026-Q1_BaoCaoQuy/
    │   └── HopDong/
    └── KH_CtyXYZ/
        └── ...
```

**Lợi ích:**
- Không phát sinh chi phí lưu trữ — OneDrive Business (1TB+) đã bao gồm trong Microsoft 365
- Dữ liệu nằm trong tay Tâm An — dễ backup, toàn quyền kiểm soát
- Nhân viên có thể truy cập file trực tiếp từ OneDrive Web nếu cần
- Tích hợp một lần duy nhất qua OAuth admin consent — sau đó vận hành tự động

**Yêu cầu:** Tâm An cần đang dùng **Microsoft 365 Business** (Basic/Standard/Premium). Cả 3 gói đều đủ điều kiện dùng Microsoft Graph API và OneDrive Business.

### 5.2 Kho Tài Liệu Theo Khách Hàng
- Mỗi doanh nghiệp có thư mục tài liệu riêng (tự động tạo khi onboarding KH)
- Upload, xem trực tuyến, tải về tài liệu
- Phân loại theo danh mục: Hợp đồng, Báo cáo thuế, Sổ sách, Giấy phép, Khác

### 5.3 Tài Liệu Đính Kèm Công Việc
- Tài liệu có thể gắn với một công việc cụ thể
- Lưu kết quả / đầu ra của công việc (ví dụ: biên lai nộp thuế, file báo cáo đã nộp)

### 5.4 Tìm Kiếm Tài Liệu
- Tìm theo tên file, loại tài liệu, khách hàng, ngày tạo
- Kết quả tìm kiếm hiển thị link xem trực tiếp trên OneDrive

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
| M3 | Tạo & giao công việc (thủ công + template) | 🔴 P1 | |
| M3 | Task Type Library — Lớp 1 | 🔴 P1 | Danh mục loại công việc dùng chung |
| M3 | Customer Task Schedule + 9 chế độ lặp | 🔴 P1 | Đặc thù quan trọng nhất, xem 3.1 |
| M3 | Subtask & Checklist | 🔴 P1 | |
| M3 | Theo dõi trạng thái + nhật ký hoạt động | 🔴 P1 | |
| M3 | Cảnh báo deadline | 🟠 P2 | |
| M3 | Escalation tự động | 🟠 P2 | |
| M3 | Task Dependencies | 🟠 P2 | |
| M3 | Time Tracking | 🟠 P2 | |
| M3 | Custom Fields theo loại công việc | 🟠 P2 | |
| M4 | Dashboard tổng quan + KPI Cards | 🟠 P2 | |
| M3 | Calendar view | 🟠 P2 | |
| M4 | Báo cáo SLA, Aging, Velocity | 🟠 P2 | |
| M4 | Ma trận báo cáo chéo (NV × KH × Loại) | 🟡 P3 | |
| M4 | Báo cáo dự báo (Forecast) | 🟡 P3 | |
| M5 | Quản lý tài liệu tích hợp OneDrive | 🟡 P3 | |
| M4 | Xuất Excel / PDF + lịch sử xuất | 🟡 P3 | |
| M3 | Kanban board | 🟡 P3 | |
