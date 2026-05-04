# 03 — Luồng Quy Trình Nghiệp Vụ

## 1. Tổng Quan Các Luồng Chính

```
FLOW 1: Onboarding khách hàng mới
FLOW 2: Sinh công việc định kỳ tự động
FLOW 3: Giao và thực hiện công việc
FLOW 4: Quản lý theo dõi & xử lý vấn đề
FLOW 5: Tổng kết & báo cáo cuối kỳ
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
[Cấu hình template định kỳ cho KH này]
  - Chọn các template công việc áp dụng cho KH
    (ví dụ: KH có xuất nhập khẩu → thêm template khai thuế NK)
  - Xác nhận lịch sinh việc
        │
        ▼
[Hệ thống tự động lên lịch sinh việc tương lai]
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
[NGÀY KÍCH HOẠT (ví dụ: ngày 1 mỗi tháng)]
        │
        ▼
[Hệ thống quét toàn bộ Template Định Kỳ]
        │
        ├── Template hàng tháng → Sinh cho tất cả KH áp dụng template này
        ├── Template hàng quý  → Kiểm tra nếu là tháng đầu quý → Sinh
        └── Template hàng tuần → Sinh vào ngày đầu tuần
        │
        ▼
[Với mỗi template + mỗi KH áp dụng:]
  - Tạo task mới: tên = "Tên template - Tên KH - Tháng/Năm"
  - Gán cho nhân viên phụ trách KH đó
  - Đặt deadline = ngày template quy định
  - Trạng thái = "Chờ xử lý"
        │
        ▼
[Gửi thông báo cho nhân viên được giao việc mới]
        │
        ▼
[Quản lý có thể xem toàn bộ việc vừa được sinh ra]
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
[Nhân viên mở task, xem mô tả, tài liệu tham chiếu]
        │
        ▼
[Nhân viên cập nhật → "Đang thực hiện"]
        │
        ▼
[Nhân viên thực hiện công việc trên phần mềm kế toán]
   (ngoài hệ thống này)
        │
        ▼
[Nhân viên đính kèm file kết quả + ghi chú]
  Ví dụ: "Đã kê khai và nộp GTGT T6, biên lai đính kèm"
        │
        ▼
[Nhân viên cập nhật → "Chờ duyệt" hoặc "Hoàn thành"]
   (tùy cấu hình: có yêu cầu QM duyệt không)
        │
     [Có duyệt]           [Không cần duyệt]
        │                        │
        ▼                        ▼
[Quản lý review]          [Hoàn thành]
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
        ├── Xem tỷ lệ hoàn thành toàn bộ đầu việc
        ├── Xem hiệu suất từng nhân viên
        ├── Xem danh sách công ty có việc trễ/thiếu
        └── Xuất báo cáo Excel nếu cần
        │
        ▼
[Họp nội bộ / review]
  - Đánh giá hiệu suất nhân viên
  - Rà soát KH cần chú ý đặc biệt
  - Điều chỉnh phân công nếu cần
        │
        ▼
[Chuẩn bị cho kỳ tiếp theo]
  - Xác nhận lịch tự động sinh việc kỳ tới
  - Thêm/bớt template cho KH nếu có thay đổi
  - Cập nhật hồ sơ KH nếu có thay đổi
```

---

## Sơ Đồ Phân Quyền Theo Luồng

| Hành động | Nhân Viên | Quản Lý |
|-----------|-----------|---------|
| Xem tất cả KH | ❌ (chỉ KH mình phụ trách) | ✅ |
| Tạo hồ sơ KH mới | ❌ | ✅ |
| Phân công NV cho KH | ❌ | ✅ |
| Cấu hình template định kỳ | ❌ | ✅ |
| Tạo task thủ công | ✅ (cho KH của mình) | ✅ |
| Cập nhật trạng thái task | ✅ (task được giao) | ✅ |
| Phân công lại task | ❌ | ✅ |
| Xem dashboard tổng quan | ❌ | ✅ |
| Xem việc của mình | ✅ | ✅ |
| Tải lên tài liệu | ✅ | ✅ |
| Xem báo cáo toàn hệ thống | ❌ | ✅ |
| Quản lý tài khoản người dùng | ❌ | ✅ |

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
