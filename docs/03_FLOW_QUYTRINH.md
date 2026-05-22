# 03 — Luồng Quy Trình Nghiệp Vụ

## 1. Tổng Quan Các Luồng Chính

```
FLOW 1: Onboarding khách hàng mới
FLOW 2: Sinh công việc định kỳ tự động
FLOW 3: Giao và thực hiện công việc
FLOW 4: Quản lý theo dõi & xử lý vấn đề
FLOW 5: Tổng kết & báo cáo cuối kỳ
FLOW 6: Escalation tự động (xử lý task tồn đọng)
FLOW 7: Yêu cầu tài liệu từ khách hàng (Client Document Requests)
```

---

## Flow 1: Onboarding Khách Hàng Mới

> Khi Tâm An ký hợp đồng phục vụ một doanh nghiệp mới.

```
[Ký hợp đồng KH mới]
        │
        ▼
[Admin tạo hồ sơ doanh nghiệp]
  - Nhập thông tin công ty (tên, MST, địa chỉ...)
  - Chọn loại hình, ngành nghề
  - Ngày bắt đầu dịch vụ
        │
        ▼
[Admin phân công nhân viên phụ trách]
  - Chọn nhân viên từ danh sách
  - Hệ thống hiển thị tải công việc hiện tại của từng NV
  - Gán nhân viên phụ trách chính
        │
        ▼
[Cấu hình Customer Task Schedule cho KH này]
  - Chọn loại công việc từ Task Type Library (Lớp 1)
  - Thiết lập quy tắc lặp lại (hàng ngày / hàng tuần / tháng / quý / năm / tùy chỉnh)
  - Đặt offset deadline (ví dụ: sinh ngày 1 + 20 ngày = hạn ngày 20)
  - Ghi chú đặc thù nếu KH có nghiệp vụ riêng
    (ví dụ: KH xuất nhập khẩu → thêm loại "Khai thuế NK" với lịch lặp riêng)
  - Override SLA nếu cần
        │
        ▼
[Hệ thống tự động lên lịch sinh việc dựa trên Customer Task Schedule]
        │
        ▼
[Nhân viên được thông báo có KH mới phụ trách]
        │
        ▼
[HOÀN TẤT - KH sẵn sàng phục vụ]
```

---

## Flow 2: Sinh Công Việc Định Kỳ Tự Động

> Đây là luồng tự động, không cần tác động của con người trong điều kiện bình thường.

```
[JOB SCHEDULER chạy định kỳ (mỗi ngày lúc 00:00)]
        │
        ▼
[Quét toàn bộ Customer Task Schedule của mọi KH]
        │
        ├── Quy tắc hàng ngày    → Kiểm tra khoảng ngày, sinh nếu đúng chu kỳ
        ├── Quy tắc hàng tuần    → Kiểm tra thứ trong tuần, sinh nếu khớp
        ├── Quy tắc hàng tháng   → Kiểm tra ngày/thứ/cuối tháng, sinh nếu khớp
        ├── Quy tắc hàng quý     → Kiểm tra tháng + ngày trong quý
        ├── Quy tắc hàng năm     → Kiểm tra tháng + ngày trong năm
        └── Quy tắc danh sách ngày → Kiểm tra ngày hôm nay có trong danh sách
        │
        ▼
[Với mỗi quy tắc khớp + mỗi KH áp dụng:]
  - Tạo task mới: tên = "Tên loại công việc - Tên KH - Tháng/Năm"
  - Gán checklist mặc định từ Task Type Library
  - Gán cho nhân viên phụ trách KH đó
  - Đặt deadline = ngày sinh + offset đã cấu hình
  - Trạng thái = "Chờ xử lý"
        │
        ▼
[Gửi thông báo cho nhân viên được giao việc mới]
        │
        ▼
[Quản lý có thể xem toàn bộ việc vừa được sinh ra trên Dashboard]
```

**Ví dụ thực tế - Ngày 01/06:**

| Template | KH áp dụng | Task được sinh | Giao cho | Deadline |
|----------|-----------|----------------|----------|----------|
| Kê khai thuế GTGT tháng | Tất cả KH | "Kê khai GTGT T6 - Cty ABC" | NV Lan | 20/06 |
| Kê khai thuế GTGT tháng | Tất cả KH | "Kê khai GTGT T6 - Cty XYZ" | NV Minh | 20/06 |
| Lập bảng lương tháng | Tất cả KH | "Bảng lương T6 - Cty ABC" | NV Lan | 05/06 |

---

## Flow 3: Giao và Thực Hiện Công Việc

> Luồng chính trong hoạt động hàng ngày.

### 3A — Công Việc Từ Template (Tự Động)

```
[Task được tự động sinh] ──► [Trạng thái: Chờ xử lý]
        │
        ▼
[Nhân viên nhận thông báo]
        │
        ▼
[Nhân viên mở task]
  - Xem mô tả, tài liệu tham chiếu
  - Kiểm tra task dependencies: có task nào cần làm trước không?
  - Xem checklist bước thực hiện
        │
        ▼
[Kiểm tra dependencies]
        │
   [Chưa xong]           [Đã xong / Không có]
        │                        │
        ▼                        ▼
[Hệ thống cảnh báo,    [Nhân viên cập nhật → "Đang thực hiện"]
 chờ task trước]
                               │
                               ▼
                    [Nhân viên tick từng bước trong checklist]
                    [Nhân viên thực hiện công việc trên phần mềm kế toán]
                       (ngoài hệ thống này)
                               │
                               ▼
                    [Nhân viên đính kèm file kết quả lên OneDrive]
                      Ví dụ: biên lai nộp thuế, file báo cáo đã ký
                    [Nhân viên ghi chú + ghi thời gian thực tế (time tracking)]
                               │
                               ▼
                    [Nhân viên cập nhật → "Chờ duyệt" hoặc "Hoàn thành"]
                       (tùy cấu hình: có yêu cầu Quản lý duyệt không)
                               │
                        [Có duyệt]           [Không cần duyệt]
                               │                        │
                               ▼                        ▼
                    [Quản lý review]          [Hoàn thành ✅]
                    [Duyệt / Trả lại]
                               │
                               ▼
                    [Hoàn thành ✅]
```

### 3B — Công Việc Phát Sinh (Thủ Công)

```
[Quản lý hoặc Nhân viên nhận yêu cầu phát sinh]
  Ví dụ: "KH cần làm thủ tục thay đổi đăng ký KD"
        │
        ▼
[Tạo task thủ công]
  - Nhập tên, mô tả chi tiết
  - Chọn KH liên quan
  - Chọn nhân viên thực hiện
  - Đặt deadline
  - Mức độ ưu tiên: Thấp / Trung bình / Cao / Khẩn
        │
        ▼
[Nhân viên được giao nhận thông báo]
        │
        ▼
[Tiếp tục như Flow 3A từ bước "Nhân viên mở task"]
```

---

## Flow 4: Quản Lý Theo Dõi & Xử Lý Vấn Đề

> Luồng giám sát hàng ngày của Quản lý.

```
[Quản lý vào Dashboard mỗi ngày]
        │
        ▼
[Xem tổng quan:]
  - Số việc quá hạn (ô đỏ)
  - Số việc sắp đến hạn trong 3 ngày tới
  - Tỷ lệ hoàn thành tuần này vs tuần trước
        │
        ▼
[Phát hiện vấn đề?]
        │
   [Có vấn đề]                [Bình thường]
        │                           │
        ▼                           ▼
[Xác định loại vấn đề]         [Kết thúc review]
        │
   ┌────┴────────────────┐
   │                     │
   ▼                     ▼
[Việc quá hạn]    [Nhân viên quá tải]
        │                │
        ▼                ▼
[Mở task,        [Xem phân bố tải,
 xem lý do,       phân công lại
 comment,         một số task sang
 đôn đốc NV]      NV khác]
        │                │
        └────────┬────────┘
                 ▼
        [Ghi nhận, theo dõi tiếp]
```

---

## Flow 5: Tổng Kết & Báo Cáo Cuối Kỳ

> Vào cuối tháng hoặc cuối quý.

```
[Cuối tháng / cuối quý]
        │
        ▼
[Hệ thống tổng hợp dữ liệu kỳ vừa rồi]
        │
        ▼
[Quản lý mở Báo Cáo Tháng/Quý]
        │
        ├── Xem tỷ lệ hoàn thành toàn bộ đầu việc (% đúng hạn / trễ)
        ├── Xem Báo Cáo SLA: loại công việc nào hay vượt SLA
        ├── Xem Báo Cáo Aging: task nào đang tồn đọng lâu nhất
        ├── Xem Báo Cáo Velocity: xu hướng hoàn thành tuần/tháng từng NV
        ├── Xem Ma Trận Báo Cáo Chéo: NV × KH × Loại công việc
        ├── Xem danh sách KH có việc trễ / thiếu đầu việc định kỳ
        └── Xuất báo cáo Excel / PDF nếu cần
        │
        ▼
[Họp nội bộ / review]
  - Đánh giá hiệu suất nhân viên (dựa trên % đúng hạn + velocity)
  - Rà soát KH cần chú ý đặc biệt (dựa trên aging + báo cáo KH)
  - Điều chỉnh phân công nếu cần (dựa trên workload forecast tháng tới)
        │
        ▼
[Chuẩn bị cho kỳ tiếp theo]
  - Xem Forecast: dự báo số task sẽ sinh ra kỳ tới theo Customer Task Schedule
  - Thêm/bớt loại công việc trong Customer Task Schedule cho KH nếu có thay đổi
  - Cập nhật hồ sơ KH nếu có thay đổi
```

---

## Flow 6: Escalation Tự Động (Xử Lý Task Tồn Đọng)

> Luồng tự động chạy song song mỗi ngày — không cần tác động thủ công.

```
[JOB SCHEDULER chạy hàng ngày (ví dụ: 07:00 sáng)]
        │
        ▼
[Quét toàn bộ task đang mở]
        │
        ├── Task quá hạn N ngày mà không có cập nhật nào
        │       │
        │       ▼
        │   [Tự động chuyển trạng thái → "Cần xem xét lại"]
        │   [Gửi cảnh báo cho Quản lý: "Task X của KH Y đã quá hạn N ngày"]
        │
        ├── Task đang "Tạm hoãn" quá N ngày
        │       │
        │       ▼
        │   [Gửi nhắc nhở cho Nhân viên + Quản lý]
        │
        └── Task sắp đến hạn hôm nay / ngày mai
                │
                ▼
            [Gửi nhắc nhở cho Nhân viên phụ trách]
        │
        ▼
[Tổng hợp gửi email sáng cho Quản lý]
  - Danh sách task quá hạn (tên task, KH, NV, số ngày trễ)
  - Danh sách task đến hạn hôm nay
  - Số task cần xem xét lại
        │
        ▼
[Quản lý xử lý theo Flow 4]
```

> **Cấu hình ngưỡng N ngày** theo từng loại công việc hoặc mức ưu tiên trong Module 6.2.

---

## Flow 7: Yêu Cầu Tài Liệu Từ Khách Hàng

> Staff theo dõi tài liệu / chứng từ KH cần cung cấp để hoàn thành task. Hỗ trợ 2 kênh: nhắc nhở qua email và link form công khai không cần đăng nhập.

### 7A — Luồng Cơ Bản (Thêm & Quản Lý Yêu Cầu)

> CDR là entity độc lập. Điểm tạo: trang công ty (tab "Yêu cầu KH") hoặc trang `/tasks` (chọn loại "Yêu cầu KH"). Không tạo từ task detail.

```
[Điểm khởi tạo — 1 trong 2:]
  A) Trang /companies/:id → tab "Yêu cầu KH" → bấm [+ Thêm yêu cầu]
  B) Trang /tasks → filter "Yêu cầu KH" → bấm [+ Tạo yêu cầu KH mới]
        │
        ▼
[Điền thông tin yêu cầu]
  - Tên tài liệu, Mô tả/hướng dẫn, Kỳ (period_label), Hạn nộp (deadline_date)
  - Chọn công ty KH (bắt buộc)
  - Liên kết task (tùy chọn — để tham chiếu ngữ cảnh)
  - Xác nhận → tạo record với status = 'pending'
        │
        ▼
[Chọn kênh đôn đốc KH]
        │
        ├──► [Kênh Email]        → xem Flow 7B
        │
        └──► [Kênh Link Form]    → xem Flow 7C
        │
        ▼
[KH cung cấp tài liệu (ngoài / qua link)]
        │
        ▼
[Staff xác nhận "Đã nhận"]
  - Bấm nút "Đánh dấu đã nhận" trên mục tương ứng
  - Hệ thống cập nhật: status = 'received', received_at = NOW(), received_by = staff
        │
        ▼
[Cron job kiểm tra hàng ngày]
  - Nếu deadline_date < today và status = 'pending'
    → Chuyển status = 'overdue'
    → Tạo in-app notification cho staff phụ trách
        │
        ▼
[Staff hoàn thành task]
  - Nếu còn mục pending/overdue → hiện cảnh báo:
    "Còn X yêu cầu KH chưa nhận. Vẫn tiếp tục hoàn thành?"
  - Staff có thể bỏ qua (soft block) hoặc huỷ mục ('not_required')
  - Sau xác nhận → task chuyển 'completed' bình thường
```

### 7B — Luồng Nhắc Nhở Qua Email

```
[Staff ở tab "Yêu cầu KH"]
        │
        ▼
[Chọn mục cần nhắc → bấm "Gửi email nhắc nhở"]
  - Hệ thống tự điền email từ companies.contact_email (có thể override)
  - Nhập nội dung email nhắc (template có sẵn, chỉnh sửa được)
        │
        ▼
[Xác nhận gửi]
        │
        ▼
[Backend gửi email qua SMTP (mailer.js)]
  - Cập nhật: reminder_sent_count + 1, last_reminder_at = NOW(), reminded_email
        │
        ▼
[KH nhận email]
  - Chuẩn bị tài liệu
  - Giao tài liệu cho staff qua kênh trực tiếp / email riêng / Zalo...
        │
        ▼
[Staff nhận tài liệu ngoài hệ thống]
  - Vào tab "Yêu cầu KH" → đánh dấu "Đã nhận" thủ công
        │
        ▼
[HOÀN TẤT MỤC NÀY ✅]
```

### 7C — Luồng Link Form Công Khai (Shareable Link)

```
[Staff ở tab "Yêu cầu KH"]
        │
        ▼
[Chọn mục → bấm "Tạo link form"]
  - Đặt thời hạn link (mặc định 14 ngày, có thể tùy chỉnh hoặc không hết hạn)
  - Bấm "Tạo link"
        │
        ▼
[Backend sinh public_token (UUID v4, 36 ký tự)]
  - Lưu: public_token, token_expires_at
  - Trả về URL: https://app.ketoan-taman.vn/public/form/{token}
        │
        ▼
[Staff nhận URL → chia sẻ cho KH]
  - Qua: Zalo, Telegram, email, SMS, bất kỳ kênh nào
  - Staff copy link (1 click) trực tiếp từ UI
        │
        ▼
[KH nhận link, mở trình duyệt bất kỳ]
  - KHÔNG cần đăng nhập
  - Trang hiển thị:
    · Tên công ty (hiển thị từ company.name)
    · Tên tài liệu cần cung cấp + mô tả/hướng dẫn
    · Form điền thông tin:
        - Tên liên hệ *
        - Số điện thoại *
        - Mô tả tài liệu *  (KH mô tả ngắn gọn)
        - Link chia sẻ *     (dán link Google Drive / Zalo / Dropbox / bất kỳ)
        - Ghi chú thêm
    → KHÔNG có trường upload file — KH tự lưu file trên cloud và dán link vào đây
        │
        ▼
[KH điền form + submit]
  - Kiểm tra: token còn hợp lệ và chưa hết hạn
  - Lưu: token_submitted_at = NOW(), token_submitted_data = { contact_name, phone, description, shared_link, notes }
  - Trả về trang xác nhận "Đã gửi thành công"
        │
        ▼
[Staff nhận in-app notification: "KH đã submit yêu cầu: {tên tài liệu}"]
        │
        ▼
[Staff vào hệ thống, review dữ liệu KH điền]
  - Xem nội dung token_submitted_data trong tab "Yêu cầu KH"
  - Kiểm tra thông tin đầy đủ và chính xác
        │
        ▼
[Staff xác nhận "Đã nhận"]
  - status = 'received', received_at = NOW()
  - (Tùy chọn: Staff có thể yêu cầu KH bổ sung qua email nếu thiếu)
        │
        ▼
[HOÀN TẤT MỤC NÀY ✅]

[Staff có thể thu hồi link bất kỳ lúc nào]
  - Bấm "Thu hồi link" → public_token = NULL
  - Link cũ trả về 404 / "Link không còn hợp lệ"
```

**Lưu ý bảo mật link:**
- Token là UUID random — không đoán được
- Link không tiết lộ thông tin nhạy cảm (chỉ hiển thị tên công ty + nội dung yêu cầu)
- Staff luôn kiểm soát: tạo, thu hồi, xem thời hạn bất kỳ lúc nào
- Sau khi KH submit, backend tự xóa public_token để link không dùng được lần 2
  (nếu cần KH bổ sung → staff tạo link mới)

---

## Sơ Đồ Phân Quyền Theo Luồng

| Hành động | Nhân Viên | Quản Lý |
|-----------|-----------|---------|
| Xem tất cả KH | ❌ (chỉ KH mình phụ trách) | ✅ |
| Tạo hồ sơ KH mới | ❌ | ✅ |
| Phân công NV cho KH | ❌ | ✅ |
| Cấu hình Customer Task Schedule (2 lớp) | ❌ | ✅ |
| Tạo task thủ công | ✅ (cho KH của mình) | ✅ |
| Cập nhật trạng thái task | ✅ (task được giao) | ✅ |
| Tick checklist bước thực hiện | ✅ (task được giao) | ✅ |
| Ghi time tracking | ✅ (task được giao) | ✅ |
| Phân công lại task | ❌ | ✅ |
| Xem dashboard tổng quan (toàn bộ) | ❌ | ✅ |
| Xem việc của mình | ✅ | ✅ |
| Tải lên tài liệu (OneDrive) | ✅ | ✅ |
| Xem báo cáo toàn hệ thống | ❌ | ✅ |
| Xem báo cáo SLA / Aging / Velocity | ❌ | ✅ |
| Cấu hình ngưỡng escalation | ❌ | ✅ |
| Quản lý tài khoản người dùng | ❌ | ✅ |
| Tạo yêu cầu tài liệu KH (CDR) cho KH mình phụ trách | ✅ | ✅ |
| Xem / quản lý CDR trong tab "Yêu cầu KH" trên trang công ty | ✅ (KH mình) | ✅ |
| Xem CDR trong danh sách /tasks (filter "Yêu cầu KH") | ✅ (KH mình) | ✅ |
| Gửi email nhắc nhở KH | ✅ (CDR mình tạo) | ✅ |
| Tạo / thu hồi shareable link form | ✅ (CDR mình tạo) | ✅ |
| Đánh dấu đã nhận tài liệu | ✅ (CDR mình tạo) | ✅ |
| Xem tổng quan yêu cầu tài liệu toàn hệ thống | ❌ | ✅ |

---

## Trạng Thái Công Việc - Giải Thích Chi Tiết

```
┌─────────────────────────────────────────────────────────┐
│                  VÒNG ĐỜI CÔNG VIỆC                     │
│                                                         │
│  [Chờ xử lý]                                           │
│       │ NV nhận việc, bắt đầu làm                      │
│       ▼                                                 │
│  [Đang thực hiện] ──── NV gặp vấn đề ──► [Tạm hoãn]   │
│       │                                       │         │
│       │ NV hoàn thành                    Vấn đề giải   │
│       ▼                                  quyết xong    │
│  [Chờ duyệt] ◄────────────────────────────────────┘   │
│       │                                                 │
│    ┌──┴──────────────┐                                  │
│    │                 │                                  │
│    ▼                 ▼                                  │
│ [Hoàn thành ✅]  [Cần xem xét lại]                     │
│                       │                                 │
│               NV chỉnh sửa, nộp lại                    │
│                       │                                 │
│                       ▼                                 │
│                  [Chờ duyệt] (lặp lại)                  │
└─────────────────────────────────────────────────────────┘
```

| Trạng thái | Màu | Ai thay đổi | Ý nghĩa |
|------------|-----|-------------|---------|
| Chờ xử lý | ⚪ Xám | Hệ thống (auto) / Quản lý | Việc mới, chưa ai nhận |
| Đang thực hiện | 🔵 Xanh | Nhân viên | NV đang làm |
| Tạm hoãn | 🟡 Vàng | Nhân viên / Quản lý | Bị block, chờ thông tin |
| Chờ duyệt | 🟠 Cam | Nhân viên | NV đã xong, chờ QM review |
| Cần xem xét lại | 🔴 Đỏ | Quản lý | QM trả lại, cần làm lại |
| Hoàn thành | 🟢 Xanh lá | Nhân viên / Quản lý | Xong hoàn toàn |

---

## Lịch Công Việc Định Kỳ Điển Hình (Tháng)

> Ví dụ minh họa một tháng làm việc điển hình của Tâm An.

```
NGÀY 01:  ► Hệ thống TỰ ĐỘNG sinh việc tháng mới cho tất cả KH
             - Kê khai thuế GTGT
             - Lập bảng lương
             - Kiểm tra công nợ tháng

NGÀY 05:  ► Deadline: Nộp bảng lương (hoặc gửi cho KH duyệt)

NGÀY 10:  ► Nhắc nhở: Còn 10 ngày đến hạn nộp thuế GTGT
             Quản lý thấy cảnh báo trên dashboard

NGÀY 15:  ► Cuối tuần: Hệ thống sinh việc tuần mới (đối soát chứng từ)

NGÀY 18:  ► Cảnh báo đỏ: Còn 2 ngày đến hạn nộp thuế GTGT

NGÀY 20:  ► DEADLINE nộp thuế GTGT
             NV cập nhật "Hoàn thành" + đính kèm biên lai

NGÀY 25:  ► Deadline nộp báo cáo sử dụng hóa đơn (nếu có)

NGÀY 28-31: ► Chuẩn bị số liệu cho tháng sau
              Quản lý xem báo cáo tháng, họp nội bộ
```
