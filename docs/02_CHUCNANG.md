# 02 — Danh Sách Chức Năng

## Tổng Quan Các Module

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      HỆ THỐNG KẾ TOÁN TÂM AN                            │
├──────────────┬──────────────┬──────────────┬────────────────┬────────────┤
│  M1: Hồ Sơ  │ M2: Nhân Sự │ M3: Công     │ M4: Báo Cáo   │ M7: Chấm  │
│  Khách Hàng │ & Hồ Sơ NV  │ Việc         │ & Thống Kê     │ Công & OT  │
├──────────────┴──────────────┴──────────────┴────────────────┴────────────┤
│  M5: Hồ Sơ Giấy Tờ                  │  M6: Cấu Hình Hệ Thống            │
└──────────────────────────────────────┴────────────────────────────────────┘
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

### 1.4 Tài Khoản Hệ Thống Khách Hàng (Dynamic Credentials)

> Lưu trữ an toàn các tài khoản đăng nhập hệ thống bên ngoài mà khách hàng cung cấp để nhân viên kế toán thao tác thay mặt.

**Tính năng:**
- Thêm tài khoản hệ thống cho từng khách hàng: tên hệ thống, đường link, username, mật khẩu
- Mỗi khách hàng có số lượng tài khoản khác nhau — không giới hạn loại
- Hiển thị mật khẩu ẩn (`***`) mặc định; nhân viên bấm "Hiện" để xem (có ghi log audit)
- Sao chép username/password nhanh bằng nút copy trực tiếp trên giao diện
- Bật/tắt tài khoản không còn dùng (is_active)

**Các hệ thống phổ biến thường dùng:**

| Hệ thống | Mục đích |
|----------|----------|
| Cổng thuế điện tử eTax | Kê khai, nộp thuế GTGT, TNCN, TNDN |
| Cổng BHXH điện tử (VssID) | Khai báo lao động, đóng bảo hiểm |
| Phần mềm kế toán MISA | Nhập liệu chứng từ, xuất báo cáo tài chính |
| Internet Banking | Đối soát giao dịch ngân hàng |
| Cổng Hải quan (VNACCS) | Khai báo xuất nhập khẩu (nếu có) |

> **Bảo mật:** Mật khẩu được mã hóa AES-256-GCM tại application layer — không bao giờ lưu plain text. Xem chi tiết tại [06_SECURITY.md](./06_SECURITY.md).

### 1.5 Theo Dõi Hợp Đồng Lao Động (HĐLĐ)

> Quản lý danh sách hợp đồng lao động của nhân viên tại từng doanh nghiệp khách hàng — cho phép nhân viên kế toán phụ trách theo dõi hạn hợp đồng và nhắc nhở gia hạn kịp thời.

**Tính năng:**
- Xem danh sách toàn bộ HĐLĐ của nhân viên thuộc công ty KH
- Thêm / sửa / xóa từng hợp đồng — **staff toàn quyền trên công ty mình phụ trách**, admin toàn quyền
- Tự động tính **số ngày còn lại** tại thời điểm truy vấn từ `end_date − ngày hôm nay`
- Tự động phân **tình trạng** theo ngưỡng:

  | Tình trạng | Điều kiện | Màu hiển thị |
  |-----------|-----------|-------------|
  | Còn hiệu lực | > 30 ngày còn lại | Xanh lá |
  | Sắp hết hạn | 1–30 ngày còn lại | Vàng / cam |
  | Đã hết hạn | Ngày kết thúc đã qua | Đỏ |
  | Không xác định | `end_date` NULL | Xám |

- **Trường tùy chỉnh (dynamic fields):** mỗi hợp đồng có thể thêm trường bổ sung tùy ý — hỗ trợ kiểu `text`, `number`, `date`
- **Xuất Excel:** toàn bộ danh sách HĐLĐ của công ty bao gồm dynamic fields

**Các trường dữ liệu cố định:**

| Trường | Mô tả | Bắt buộc |
|--------|-------|---------|
| Tên nhân viên | Tên NV của doanh nghiệp KH (nhập tự do, không FK vào `users`) | ✓ |
| Loại hợp đồng | Nhập tự do — VD: "Xác định thời hạn", "Thử việc", "Không xác định thời hạn" | |
| Số hợp đồng | Mã số / số hiệu hợp đồng | |
| Ngày hợp đồng | Ngày ký / ngày có hiệu lực | |
| Ngày kết thúc | NULL = không xác định thời hạn (hợp đồng vô thời hạn) | |
| Số ngày còn lại | **Tính tại query time** — không lưu DB | — |
| Tình trạng | **Tính tại query time** từ số ngày còn lại | — |
| Ghi chú | Ghi chú nội bộ của nhân viên phụ trách | |
| Trường tùy chỉnh | Danh sách `[{name, value, type}]` — thêm/xóa tùy ý | |

**Nơi hiển thị:**
- Tab **"Theo dõi HĐLĐ"** trên trang `/companies/:id`

---

### 1.6 Hồ Sơ Lưu Trữ Khi Quyết Toán

> Theo dõi trạng thái hồ sơ / chứng từ mà từng khách hàng đã giao nộp cho kế toán, tổ chức theo năm. Giúp nhân viên biết ngay tháng nào còn thiếu chứng từ khi chuẩn bị quyết toán cuối năm.

**Tính năng:**
- Tổ chức dữ liệu theo năm — mỗi năm là một tập hồ sơ độc lập, có thể xóa toàn bộ khi không còn cần thiết
- Thêm / sửa / xóa từng dòng chứng từ
- **12 ô tháng per dòng** — click-to-edit inline, nhập giá trị tự do (`x`, `kps`, tên file, hoặc để trống)
- **Cột "Năm"** — hiển thị số tháng có data của dòng đó (computed từ 12 ô tháng, không lưu DB)
- Kéo thả để sắp xếp thứ tự các dòng chứng từ trong bảng
- Ghi chú cấp năm — lưu thông tin hợp đồng nguyên tắc hoặc ghi chú chung của cả năm

**Cột dữ liệu mỗi dòng:**

| Cột | Mô tả | Lưu DB |
|-----|-------|--------|
| Loại chứng từ | Tên loại hồ sơ (VD: "Bảng chấm công + Bảng lương") | ✓ |
| Chi tiết | Mô tả bổ sung hoặc tên đối tác liên quan | ✓ |
| Tháng 1–12 | Giá trị tự do — `x`, `kps`, tên file, hoặc rỗng | ✓ (JSONB) |
| Năm | Tổng số tháng trong dòng đó có giá trị (≠ rỗng) | ✗ (computed) |
| Ghi chú | Ghi chú nội bộ của nhân viên phụ trách | ✓ |
| Đặc điểm | Đặc điểm ngắn: "Song ngữ", "Bản giấy", "Bản scan"... | ✓ |

**Nơi hiển thị:**
- Tab **"HS lưu trữ khi QT"** trên trang `/companies/:id`

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

### 2.3 Theo Dõi Khối Lượng Công Việc (Module 3 link)
- Hiển thị tải công việc hiện tại của từng nhân viên
- So sánh khối lượng giữa các nhân viên (dùng cho phân công cân bằng)
- Lịch sử hoàn thành công việc theo tháng

### 2.4 Chấm Công & Nghỉ Phép (tích hợp Module 7)

- Xem nhanh tình trạng chấm công hôm nay của từng nhân viên (đã/chưa check-in)
- Tổng ngày công, ngày vắng, ngày OT trong tháng — hiển thị ngay trên hồ sơ nhân viên
- Link nhanh sang bảng công tháng và lịch sử đơn nghỉ phép / OT của từng nhân viên

### 2.5 Quản Lý Lương & Thưởng

> Lập và lưu trữ bảng lương hàng tháng cho toàn bộ nhân viên nội bộ của Tâm An.

**Quy trình lập lương:**
1. Admin tạo **kỳ lương** mới (tháng/năm) → trạng thái `Draft`
2. Nhập dữ liệu từng nhân viên: lương cơ bản, phụ cấp, thưởng, khấu trừ
3. Hệ thống tự tính: lương gross, BHXH/BHYT/BHTN, thuế TNCN, **lương thực nhận (net)**
4. Admin xác nhận kỳ lương → trạng thái `Confirmed`
5. Sau thanh toán → chuyển sang `Paid`; lưu vĩnh viễn để đối chiếu

**Các thành phần trong bảng lương:**

| Khoản mục | Chi tiết |
|-----------|---------|
| Lương cơ bản | Theo hợp đồng lao động |
| Phụ cấp | Xăng xe, ăn trưa, điện thoại... (phân rã từng khoản) |
| Thưởng | Thưởng KPI tháng, thưởng tiếp nhận KH mới... |
| BHXH/BHYT/BHTN (NV đóng) | 8% + 1.5% + 1% lương đóng BH |
| Thuế TNCN | Theo biểu thuế lũy tiến (nhập thủ công hoặc tính tự động) |
| Khấu trừ khác | Tạm ứng thu lại, phạt... |
| **Lương thực nhận (Net)** | **Tự động tính = Gross − các khoản khấu trừ** |

**Báo cáo lương:**
- Bảng lương tổng hợp toàn công ty theo tháng / quý
- Chi phí nhân sự thực tế (bao gồm cả phần công ty đóng BHXH/BHYT)
- Xuất Excel để nộp cho kế toán nội bộ hoặc đối soát ngân hàng

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

### 3.11 Yêu Cầu Tài Liệu Từ Khách Hàng (Client Document Requests)

> CDR là **entity độc lập** — không phải con của task. Staff tạo và theo dõi tài liệu / chứng từ cần KH cung cấp. KH **không cần tài khoản** trong hệ thống.

**Bài toán nghiệp vụ:** Nhiều loại công việc kế toán (kê khai thuế, lập bảng lương, quyết toán...) đòi hỏi KH cung cấp hóa đơn, chứng từ, bảng chấm công... trước khi staff có thể thực hiện. Nếu không theo dõi có hệ thống, dễ bị trễ hạn do chờ KH mà không có ai đôn đốc.

**Loại task khi tạo mới:**

Khi staff / admin tạo task, họ chọn **Loại task**:
- **Nội bộ (Internal):** Task thực hiện bởi staff — luồng quản lý công việc thông thường
- **Yêu cầu KH (Client Request):** CDR — staff yêu cầu KH cung cấp tài liệu; hiển thị riêng trong list tasks (với filter) và trong trang công ty

**Nơi hiển thị CDR:**

| Vị trí | Cách thể hiện |
|--------|---------------|
| Trang `/companies/:id` | Tab riêng **"Yêu cầu KH"** — toàn bộ CDR của công ty đó |
| Trang `/tasks` (danh sách chính) | Filter toggle **[Tất cả \| Nội bộ \| Yêu cầu KH]** — CDR row hiển thị khác biệt về màu sắc/icon |

**Phạm vi tính năng:**
- Staff tạo CDR từ: trang công ty (tab "Yêu cầu KH") hoặc danh sách `/tasks` (loại "Yêu cầu KH")
- CDR có thể liên kết tùy chọn với một task nội bộ (để tham chiếu ngữ cảnh — không bắt buộc)
- Staff chủ động thêm / đánh dấu nhận / huỷ bỏ từng mục
- **Soft block:** khi task nội bộ liên kết có CDR đang `pending` mà staff cố chuyển sang `completed` → hệ thống cảnh báo nhưng không chặn cứng (staff tự quyết)
- Cron job tự động chuyển trạng thái `overdue` khi qua `deadline_date`

**Workflow cơ bản:**
1. Staff vào trang công ty (tab "Yêu cầu KH") **hoặc** trang `/tasks` (chọn loại "Yêu cầu KH") → tạo yêu cầu mới (tên tài liệu, mô tả, hạn nộp, liên kết task tùy chọn)
2. Chọn cách đôn đốc KH: **Email nhắc nhở** hoặc **Tạo link form**
3. Staff theo dõi trạng thái từng mục; khi KH cung cấp đủ → đánh dấu "Đã nhận"
4. Admin có trang tổng quan "Yêu cầu KH đang pending" toàn hệ thống

**Kênh 1 — Email nhắc nhở:**
- Staff nhập email KH + nội dung nhắc → hệ thống gửi email qua SMTP
- Ghi nhận số lần gửi và thời điểm gửi lần cuối
- KH nhận email, chuẩn bị tài liệu, giao trực tiếp hoặc gửi qua kênh ngoài hệ thống
- Staff nhận tài liệu → vào hệ thống đánh dấu "Đã nhận"

**Kênh 2 — Shareable public link (form điền trực tuyến):**
- Staff bấm "Tạo link" → hệ thống sinh token UUID → URL `/public/form/:token`
- URL này **không yêu cầu đăng nhập** — chia sẻ qua bất kỳ kênh nào (Zalo, Telegram, email, SMS...)
- KH mở link → xem yêu cầu tài liệu + điền thông tin vào form + **dán link chia sẻ** (Google Drive, Zalo, Dropbox... — **không upload file** lên hệ thống)
- Sau khi KH submit → dữ liệu lưu thẳng vào `client_document_requests.token_submitted_data`
- Staff nhận thông báo, review dữ liệu KH điền + link chia sẻ, xác nhận "Đã nhận" → trạng thái chuyển `received`
- Staff có thể thu hồi link bất kỳ lúc nào (revoke token)
- Link có thể đặt thời hạn hết hạn (token_expires_at)

**Trạng thái vòng đời:**
```
[pending] ──► [received]     — Staff xác nhận đã nhận tài liệu
    │
    ├──► [overdue]           — Cron job tự chuyển khi qua deadline_date
    │
    └──► [not_required]      — Staff huỷ bỏ (không cần thiết nữa)
```

**Admin Overview:**
- Widget trên Dashboard: số lượng yêu cầu pending toàn hệ thống
- Trang `/admin/client-requests`: lọc theo KH / nhân viên / trạng thái / trễ hạn
- Badge trên CDR row trong `/tasks` nếu có item pending/overdue
- Tab "Yêu cầu KH" trên từng trang công ty hiển thị đầy đủ CDR của công ty đó

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

## Module 7: Chấm Công Nội Bộ

> Quản lý chấm công hàng ngày, nghỉ phép, tăng ca cho nhân viên kế toán **nội bộ** của Tâm An. Phạm vi: ~5–20 nhân viên, văn phòng cố định, hỗ trợ WFH. Kết quả chấm công tự động feed vào Module 2 (Payroll) khi chốt bảng lương.

### 7.1 Ca Làm Việc (Shifts)

- **Ca cố định (`fixed`):** Xác định giờ vào – giờ ra cụ thể (mặc định: 08:00–17:00), nghỉ trưa 60 phút
- **Ca linh hoạt (`flexible`):** Chỉ yêu cầu đủ tổng số giờ làm/ngày (áp dụng cho WFH)
- Cấu hình ngưỡng cho phép trễ (`tolerance_in`) và về sớm (`tolerance_out`) — mặc định 15 phút
- Mặc định: **Ca Hành Chính** 08:00–17:00 được seed sẵn khi deploy
- Admin tạo và quản lý danh sách ca; gán ca mặc định (`default_shift_id`) cho từng nhân viên

### 7.2 Lịch Ca Theo Nhân Viên (Work Schedules)

- Admin tạo lịch ca cho từng nhân viên theo tháng (bulk generate tự động)
- Quy tắc tự động: T7/CN và ngày lễ → `is_day_off = TRUE`, ngày thường → gán ca mặc định
- Admin có thể điều chỉnh lịch ca thủ công cho từng ngày cụ thể
- Nhân viên xem lịch ca của mình trên trang Chấm Công cá nhân

### 7.3 Check-in / Check-out

**Phương thức:**
| Phương thức | Code | Ghi chú |
|-------------|------|---------|
| Web app | `web` | Trong văn phòng — click nút trên UI |
| Mobile app | `mobile` | WFH / công tác — truy cập qua trình duyệt mobile |
| Admin nhập tay | `manual` | Điều chỉnh khi nhân viên quên hoặc sự cố |

**Luồng hàng ngày:**
1. Nhân viên bấm **CHECK IN** → hệ thống ghi `attendance_logs` + tính trạng thái (đúng giờ/trễ)
2. Nhân viên bấm **CHECK OUT** → ghi log out + tính `actual_hours`, `work_units`
3. Kết quả: 1 record duy nhất/người/ngày trong `attendance_records`

**Tính ngày công tự động:**
- ≥ 80% giờ yêu cầu → **1.0 ngày công**
- ≥ 50% → **0.5 ngày công**
- < 50% → **0.0 ngày công**

**Widget Check-in (hiển thị trên Header sau khi login):**
- Trạng thái hôm nay: Chưa check-in / Đã check-in lúc HH:mm / Đã check-out HH:mm
- Nút CHECK IN (disable sau khi đã check-in)
- Nút CHECK OUT (enable sau khi đã check-in, disable sau khi đã check-out)

### 7.4 Bảng Công Cá Nhân

- Xem bảng công tháng hiện tại dưới dạng lịch (calendar grid)
- Màu theo trạng thái: xanh lá (present), vàng (late), cam (early_leave), đỏ (absent), xanh dương (on_leave), tím (wfh)...
- Click vào ngày → xem chi tiết: giờ vào, giờ ra, số phút trễ/về sớm, số giờ thực
- Tổng hợp cuối tháng: tổng ngày công, ngày vắng, ngày nghỉ phép, giờ OT

### 7.5 Đơn Nghỉ Phép (Leave Requests)

| Loại nghỉ | Code | Tính công? |
|-----------|------|-----------|
| Phép năm | `annual` | Có (1.0 ngày) |
| Nghỉ bệnh | `sick` | Có (1.0 ngày) |
| Nghỉ bù OT | `compensatory` | Có (1.0 ngày) |
| Nghỉ không phép | `unpaid` | Không (0.0) |
| Công tác | `business_trip` | Có (1.0 ngày) |
| WFH | `wfh` | Có (check-in qua app) |

**Flow đơn nghỉ:**
1. Nhân viên tạo đơn → trạng thái `pending`
2. Thông báo đến Admin
3. Admin duyệt (`approved`) hoặc từ chối (`rejected`) với lý do
4. Khi duyệt → tự động cập nhật `attendance_records.status = 'on_leave'` cho các ngày đó

### 7.6 Đơn Tăng Ca / OT (Overtime Requests)

- Nhân viên tạo đơn OT **trước** hoặc **trong ngày** làm thêm
- Khai: ngày OT, giờ bắt đầu – giờ kết thúc, lý do
- Hệ thống tự tính: số giờ OT + hệ số lương (1.5× ngày thường / 2.0× cuối tuần / 3.0× ngày lễ)
- Admin duyệt → OT được ghi vào bảng công và feed vào payroll

### 7.7 Điều Chỉnh Bảng Công (Admin)

- Admin xem danh sách yêu cầu điều chỉnh từ nhân viên (quên check-in, check-out sai giờ)
- Duyệt / Từ chối từng yêu cầu với lý do
- Khi duyệt: ghi `attendance_logs` với `method='manual'`, cập nhật record, tính lại ngày công
- Mọi điều chỉnh đều ghi vào `attendance_adjustments` — audit trail bất biến, không xóa được

### 7.8 Admin Dashboard Chấm Công

**Tổng quan hôm nay:**
- Danh sách ai đã check-in / chưa check-in / đang trễ
- Số nhân viên vắng mặt, số đang OT

**Bảng công tháng (Grid View):**
- Grid 2 chiều: nhân viên (hàng) × ngày trong tháng (cột)
- Màu từng ô theo trạng thái — nhìn là biết ngay ai vắng ngày nào
- Click ô → xem chi tiết, click "Điều chỉnh" nếu có vấn đề

**Các trang quản lý:**
| Trang | Route | Mô tả |
|-------|-------|--------|
| Tổng quan | `/admin/chamcong` | Dashboard check-in hôm nay |
| Bảng công tháng | `/admin/chamcong/bang-cong` | Grid NV × ngày |
| Duyệt điều chỉnh | `/admin/chamcong/dieu-chinh` | Yêu cầu sửa bảng công chờ duyệt |
| Duyệt đơn nghỉ | `/admin/chamcong/don-nghi` | Leave requests pending |
| Duyệt đơn OT | `/admin/chamcong/tang-ca` | OT requests pending |
| Quản lý ca | `/admin/chamcong/ca-lam-viec` | CRUD shifts |
| Lịch ca | `/admin/chamcong/lich-ca` | Gán ca cho NV theo tháng |
| Ngày lễ | `/admin/chamcong/ngay-le` | CRUD public_holidays |
| Báo cáo | `/admin/chamcong/bao-cao` | Tổng hợp + xuất |

### 7.9 Báo Cáo Chấm Công & Tích Hợp Lương

**Báo cáo tổng hợp tháng (per nhân viên):**
- Tổng ngày công thực tế, ngày nghỉ phép, ngày vắng, số lần đi trễ
- Tổng giờ OT được duyệt, OT pay ước tính
- Xuất Excel cho đối soát

**Tích hợp Payroll:**
- Khi admin chốt kỳ lương: bấm "Đồng bộ chấm công → Bảng lương"
- Hệ thống kiểm tra: còn ngày nào `unscheduled` hoặc thiếu check-out → cảnh báo danh sách
- Sau xác nhận: tự động merge `attendance_summary` vào `payroll_records.components`
- Dữ liệu merge: `actual_work_days`, `leave_paid_days`, `absent_days`, `ot_hours`, `ot_pay`

### 7.10 Xử Lý Ngoại Lệ

| Tình huống | Xử lý |
|-----------|--------|
| Quên check-in/out | Nhân viên yêu cầu điều chỉnh → Admin duyệt |
| Check-in nhiều lần (bấm nhầm) | Lấy lần đầu tiên (check-in) / lần cuối (check-out) |
| Không có lịch ca | status=`unscheduled`, check-in vẫn được ghi nhận, Admin xử lý sau |
| Ngày lễ quốc gia | Tự động mark `is_holiday=TRUE`, `work_units=1.0` |
| Mất điện cả ngày | Admin bulk import thủ công cho cả nhóm |
| Nghỉ thai sản / dài hạn | Tạo `leave_requests` bulk cho toàn bộ giai đoạn |

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
| M1 | Tài khoản hệ thống KH (Credentials) | 🔴 P1 | Nhu cầu hàng ngày của nhân viên kế toán |
| M1 | Theo dõi HĐLĐ nhân viên KH | 🟠 P2 | Tab trong company detail; staff toàn quyền; dynamic fields (text/number/date); xuất Excel |
| M1 | Hồ Sơ Lưu Trữ Khi Quyết Toán | 🟠 P2 | Tab trong company detail; tổ chức theo năm; 12 ô tháng click-to-edit inline; xóa theo năm cascade |
| M2 | Hồ sơ nhân viên + phân công | 🔴 P1 | |
| M2 | Quản lý lương & thưởng | 🟠 P2 | Lập bảng lương hàng tháng, tính net salary |
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
| M3 | Yêu cầu tài liệu từ KH (Client Document Requests) | 🟠 P2 | Entity độc lập: tab trong company detail + filter trong /tasks + shareable public link (link đính kèm, không upload file) + admin overview |
| M4 | Dashboard tổng quan + KPI Cards | 🟠 P2 | |
| M3 | Calendar view | 🟠 P2 | |
| M4 | Báo cáo SLA, Aging, Velocity | 🟠 P2 | |
| M4 | Ma trận báo cáo chéo (NV × KH × Loại) | 🟡 P3 | |
| M4 | Báo cáo dự báo (Forecast) | 🟡 P3 | |
| M5 | Quản lý tài liệu tích hợp OneDrive | 🟡 P3 | |
| M4 | Xuất Excel / PDF + lịch sử xuất | 🟡 P3 | |
| M3 | Kanban board | 🟡 P3 | |
| **M7** | **DB migration + Ca làm việc + Lịch ca** | 🔴 **P1** | **Nền tảng module chấm công** |
| M7 | Check-in / Check-out widget + bảng công cá nhân | 🔴 P1 | Nhân viên dùng hàng ngày |
| M7 | Đơn nghỉ phép + Đơn OT | 🔴 P1 | |
| M7 | Admin dashboard chấm công + duyệt đơn | 🟠 P2 | |
| M7 | Điều chỉnh bảng công (admin) + audit trail | 🟠 P2 | |
| M7 | Báo cáo chấm công + tích hợp payroll | 🟠 P2 | Feed vào Module 2 |
| M7 | Ngày lễ quốc gia + seed data | 🟠 P2 | |
