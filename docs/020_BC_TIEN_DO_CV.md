# 020 — BC Tiến Độ CV (Ma trận theo dõi tiến độ quy trình theo khách hàng)

## 1. Mục tiêu & bối cảnh

Khách hàng cần một **bảng ma trận theo dõi tiến độ** cho từng quy trình định kỳ (vd *Lập bảng lương* tháng 5/2026): hàng = khách hàng, cột = các bước công việc, ô = đã làm (✓) / chưa.

Đây là **loại báo cáo khác** với module "Báo cáo" hiện tại:

| | Module "Báo cáo" (hiện có) | "BC Tiến Độ CV" (mới) |
|---|---|---|
| Bản chất | Thống kê/phân tích KPI | Ma trận tiến độ checklist |
| Mục đích | Quản trị nhìn tổng thể | Vận hành + gửi khách hàng |
| Dữ liệu ô | Số liệu gộp, tỷ lệ | ✓ / trống theo từng bước/KH |

→ Tách thành **menu top-level riêng**: **"BC Tiến Độ CV"**. Module Báo cáo cũ giữ nguyên.

## 2. Quyết định đã chốt

- **Vị trí**: menu mới riêng (đặt gần nhóm vận hành: Công việc / Nội bộ / Yêu cầu KH).
- **Tên menu**: "BC Tiến Độ CV".
- **Tương tác ô**: **chỉ xem (read-only)** ✓/trống + **xuất Excel**. Không tick-back (cập nhật tiến độ vẫn làm ở phiếu công việc).
- **Cột "NV quản lý"**: lấy `tasks.assigned_to` của phiếu kỳ đó (người phụ trách phiếu).

## 3. Ánh xạ dữ liệu (không đổi schema)

| Thành phần trong mẫu KH | Nguồn dữ liệu |
|---|---|
| Quy trình (Lập bảng lương) | `task_types` (chọn 1) |
| **Cột D–J** (các bước) | `task_type_checklist_templates` (step_order, step_text) |
| Hàng = khách hàng có phát sinh | `tasks` của task_type đó, period = tháng/năm chọn |
| **Ô "x"** | `task_checklist_items.is_completed` |
| Tên KH / MST | `companies.name`, `companies.tax_code` |
| NV quản lý | `users.name` qua `tasks.assigned_to` |
| Kỳ (Tháng 5/2026) | derive từ `tasks.start_date` (fallback due_date) trong tháng/năm |

Thực tế hiện tại: *Lập bảng lương* đã có **7 bước checklist** + **3 KH lịch định kỳ** → dựng được ngay từ dữ liệu thật.

## 4. Logic pivot

**Tham số:** `taskTypeId`, `month`, `year`.

1. **Cột** = `task_type_checklist_templates` WHERE task_type_id = ? ORDER BY step_order. (Đây là tiêu đề cột D–J, ổn định.)
2. **Hàng (phiếu)** = các `tasks` WHERE task_type_id = ? AND kỳ rơi vào tháng/năm
   (kỳ = `COALESCE(start_date, due_date)` nằm trong [đầu tháng, cuối tháng]). Mỗi task gắn 1 công ty.
   - Join `companies` (name, tax_code), `users` (assigned_to → tên NV).
3. **Ô** = với mỗi task (hàng) × mỗi bước (cột): tìm `task_checklist_items` của task đó khớp **step_text** (fallback step_order) → `is_completed` ? `✓` : trống. Trả thêm `completed_at` (để có thể hiện tooltip/ngày nếu cần).
4. Sắp xếp hàng theo tên công ty (hoặc theo NV quản lý — tùy chọn).

**Vì sao khớp step_text:** checklist items được copy từ template lúc tạo task; nếu template sửa sau đó, item cũ có thể lệch → khớp theo `step_text` để đồng bộ với tiêu đề cột đang hiển thị (bước nào task không có → ô trống). Ghi chú rõ ràng cho admin.

## 5. API (backend)

Module mới `backend/src/modules/progress-matrix/` (hoặc thêm vào `reports`), route top-level riêng:

```
GET /api/progress-matrix/task-types        → danh sách task_type có checklist (cho dropdown)
GET /api/progress-matrix?taskTypeId=&month=&year=
```

**Response:**
```json
{
  "taskType": { "id": "...", "name": "Lập bảng lương", "groupName": "Nhân sự" },
  "period":   { "month": 5, "year": 2026, "label": "Tháng 5/2026" },
  "columns":  [ { "stepOrder": 1, "stepText": "Làm bảng lương" }, ... ],   // D–J
  "rows": [
    {
      "companyId": "...", "companyName": "Cty 1", "taxCode": "...",
      "assigneeName": "Thảo", "taskId": "...",
      "cells": [ { "stepText": "Làm bảng lương", "done": true, "completedAt": "..." }, ... ]
    }
  ]
}
```

- **RBAC**: đọc cho user đã đăng nhập (staff thấy KH mình phụ trách? → cân nhắc; mặc định admin xem tất cả, staff lọc theo phiếu của mình). Xuất Excel: như module reports (admin) hoặc cho cả staff — chốt ở pha 1.
- **Hiệu năng**: vài query (templates, tasks+join, checklist_items theo task_id ANY) + pivot in-memory. Quy mô hàng = số KH (chục) → nhẹ.

## 6. Frontend

- **Menu mới** "BC Tiến Độ CV" (icon dạng bảng/grid).
- **Trang**: bộ lọc trên cùng — **Quy trình** (dropdown task_type) + **Tháng** + **Năm**.
- **Bảng ma trận**: cố định 3 cột trái (Tên KH · MST · NV quản lý), cột động D–J theo `columns`, ô ✓/trống (ô ✓ tô nền nhẹ). Header cột xoay/wrap như mẫu.
- **Tiêu đề**: "BẢNG THEO DÕI TIẾN ĐỘ {tên quy trình} VỚI KH — Tháng {M}/{Y}".
- **Nút Xuất Excel** → đúng layout mẫu KH.
- CSS theo docs/014 (token màu/font), tái dùng pattern bảng hiện có.

## 7. Xuất Excel (exceljs) — khớp mẫu KH

- Dòng tiêu đề (merge) "BẢNG THEO DÕI TIẾN ĐỘ … Tháng M/Y".
- Header: `Tên khách hàng | Mã số thuế | NV quản lý | <D> | <E> | … | <J>`.
- Mỗi hàng: KH + MST + NV + các ô "x" (✓) / trống.
- Style header (nền xanh, in đậm — như `styleHeader` trong reports.service), wrap text cột checklist, freeze 3 cột trái.
- Tên file: `bc-tien-do-{slug(taskType)}-T{M}-{Y}.xlsx`.

## 8. Edge cases

- **Quy trình chưa có checklist template** → trả `columns = []`, UI báo "Quy trình này chưa cấu hình bước công việc — vào Cài đặt loại công việc để thêm".
- **KH có lịch định kỳ nhưng task chưa được sinh** trong tháng → mặc định **không hiện** (chỉ hiện KH có phiếu). *Tùy chọn pha sau:* hiện cả KH theo lịch (hàng toàn trống) để biết "chưa làm".
- **Task chưa có item cho một bước** (template thêm bước sau khi tạo task) → ô trống.
- **Nhiều task cùng loại/cùng KH trong tháng** (hiếm) → lấy phiếu mới nhất; ghi chú.
- **Kỳ không theo tháng** (quý/năm): v1 lọc theo tháng chứa occurrence; tinh chỉnh sau nếu cần chọn theo quý/năm.

## 9. Phân pha triển khai

- **Pha 1 — Backend**: endpoint `task-types` + `progress-matrix` (pivot), RBAC, test trực tiếp với "Lập bảng lương" T5/2026.
- **Pha 2 — Frontend**: menu mới + trang ma trận (lọc quy trình/tháng/năm) + bảng cố định-3-cột + ô ✓/trống.
- **Pha 3 — Xuất Excel** đúng layout mẫu KH.
- **Pha 4 (tùy chọn)**: hiện cả KH theo lịch chưa sinh phiếu; hiện ngày hoàn thành (tooltip); lọc theo NV quản lý.

## 10. Mở rộng tương lai (không làm ngay)

- Áp cho **mọi quy trình** tự động (đã thỏa: chọn task_type là xong, không cần mẫu mới).
- Tổng hợp nhiều tháng (timeline) / nhiều quy trình một lúc.
- Gắn link từ ô → mở phiếu công việc tương ứng.

## 11. Các góc nhìn bổ sung: Theo công ty / Theo nhân viên

Trong cùng menu **BC Tiến Độ CV**, thêm các **tab góc nhìn**:

```
[ Theo quy trình ]  [ Theo công ty ]  [ Theo nhân viên ]
```

- **Theo quy trình** (Pha 1–3, đã làm): ma trận **KH × các bước checklist** của 1 quy trình — đúng mẫu KH gửi (ô ✓/x).

### Vì sao 2 tab kia KHÁC hình dạng (quan trọng)

Ma trận ✓/x **chỉ đồng nhất khi cố định 1 quy trình** (mọi hàng chung bộ bước D–J). "Theo công ty" và "Theo nhân viên" trải trên **nhiều quy trình khác nhau** → checklist khác nhau → **không thể pivot thành cùng một bộ cột bước**. Vì vậy 2 tab này dùng dạng **bảng tiến độ tổng hợp** (mỗi hàng = 1 phiếu, thể hiện *X/Y bước · %*), có thể **bung chi tiết** để xem checklist từng phiếu.

### Tab "Theo công ty"

- **Bộ lọc**: Công ty + Tháng/Năm.
- **Hàng** = mỗi phiếu (`task`) của công ty đó trong kỳ (mọi quy trình).
- **Cột**: Quy trình (task_type) · NV phụ trách · **Tiến độ** (X/Y bước + thanh %) · Trạng thái phiếu · Hết hạn. (Bấm hàng → bung checklist chi tiết.)
- **Mục đích**: tháng này khách hàng đang vướng quy trình nào, % tới đâu.

### Tab "Theo nhân viên"

- **Bộ lọc**: Nhân viên + Tháng/Năm.
- **Hàng** = mỗi phiếu NV đó phụ trách trong kỳ.
- **Cột**: Công ty · Quy trình · **Tiến độ** (X/Y bước + %) · Trạng thái · Hết hạn.
- **Mục đích**: khối lượng + tiến độ của từng NV (cũng có thể gộp dòng tổng: tổng phiếu, % TB).

### Dữ liệu & API

- Tái dùng `tasks` + đếm `task_checklist_items` (done/total) cho mỗi phiếu — không cần schema mới.
- API: 2 endpoint mới
  ```
  GET /api/progress-matrix/by-company?companyId=&month=&year=
  GET /api/progress-matrix/by-staff?staffId=&month=&year=
  ```
  Response: `{ rows: [ { taskId, taskTypeName, companyName|assigneeName, doneSteps, totalSteps, percent, status, dueDate } ] }`.
- RBAC: như tab chính (admin tất cả; staff "theo nhân viên" mặc định chính họ).
- Export Excel riêng cho từng tab.

### Phân pha (bổ sung)

- **Pha 5** — Tab "Theo công ty" (backend summary + UI bảng tiến độ + export).
- **Pha 6** — Tab "Theo nhân viên" (tương tự).
- **Pha 7 (tùy chọn)** — bung chi tiết checklist từng phiếu; dòng tổng %.

> Lưu ý thiết kế: giữ **"Theo quy trình"** là tab đúng-mẫu-KH (ô ✓/x); 2 tab kia là **tổng hợp tiến độ %** (không phải ✓/x từng bước) — đây là sự khác biệt bản chất, không phải thiếu sót.
