# 027 — Build Plan: Thiết kế lại Báo cáo KPI (đa nguồn) + Bộ lọc Tổng quan

> Trạng thái: **ĐỀ XUẤT — chờ chốt**. Viết để đọc & duyệt trước khi code.
> Phạm vi: màn **Đánh giá nhân viên → tab KPI (Tổng quan)** và popup chi tiết NV.

---

## 1. Bối cảnh & vấn đề (đã kiểm chứng trên dữ liệu thật)

**1.1. KPI đang tính trên MỌI task, nhưng báo cáo chưa tách rõ theo nguồn.**
Bảng `tasks` hiện có 5 nguồn (enum `task_source`):

| source | nhãn | số lượng (thực tế) |
|---|---|---|
| `auto` | CV định kỳ | 741 |
| `manual` | CV tự sắp xếp | 108 |
| `reques` | CV nhờ hỗ trợ | 85 |
| `customer` | CV KH yêu cầu | 20 |
| `out` | CV đi ra ngoài | 4 |

→ KPI (điểm khối lượng + đúng hạn) đang **gộp chung tất cả**. Admin không thấy được hiệu suất đến từ đâu (định kỳ hay phát sinh), nên "chưa đủ tốt" như nhận xét.
→ Lưu ý: *Tasks nội bộ* (`internal_assignments`) và *yêu cầu KH chưa chuyển thành task* (`client_document_requests`) là **bảng riêng, KHÔNG vào KPI**. Chỉ việc đã là `tasks` mới tính.

**1.2. Tổng quan chưa có bộ lọc.**
`KpiPanel` fetch `getKpiPerformance(year, month)` → trả **mọi NV active** (gồm cả admin). Admin không lọc được "chỉ staff", "1 NV", hay "một nhóm".

**1.3. Hệ thống CHƯA có khái niệm "nhóm/phòng ban" chính thức.**
`users` chỉ có `role` (admin/staff) + `job_title` (free-text, không chuẩn hoá: "Kế Toán Viên" vs "Kế toán viên"). Hiện có **4 staff + 2 admin** active.
→ "Nhóm nhân viên" trước mắt chỉ dựa được vào **role**. Muốn nhóm theo phòng ban thật thì cần thêm bảng/cột (xem Phần C).

**1.4. (Đã fix ở lần trước)** Mẫu số %đúng hạn đã loại task chưa tới hạn; popup chi tiết đã full-screen + 4 tab (Theo công ty / loại CV / nguồn / từng việc).

---

## 2. Mục tiêu

- **(A) Bộ lọc Tổng quan**: lọc theo **vai trò** (chỉ staff / chỉ admin / tất cả), theo **1 hoặc nhiều nhân viên**, và (tùy chọn) theo **nguồn task**.
- **(B) Báo cáo đa nguồn**: thể hiện KPI **tách theo nguồn** ngay ở Tổng quan (không chỉ trong popup), để admin thấy định kỳ vs phát sinh.
- **(C) Chốt mô hình tính điểm**: phạm vi nguồn nào vào KPI, có trọng số theo nguồn không, mốc điểm.

---

## 3. Phần A — Bộ lọc Tổng quan (ưu tiên làm trước)

### A1. Backend (`kpi.service` + controller + router)
- `getPerformance(year, month, { userIds?, role?, sources? })` — mở rộng tham số lọc:
  - `role`: `'staff' | 'admin' | null(all)` → thêm `AND u.role = $role` trong `listLive`.
  - `userIds`: mảng id → `AND u.id = ANY($ids)`.
  - `sources`: mảng nguồn → khi lọc nguồn, `vol`/`ont`/breakdown thêm `AND t.source = ANY($sources)` (chỉ tính điểm/đúng hạn của các nguồn được chọn).
- `listLive`/`listMonthly` nhận cùng bộ lọc (để tab Tiến độ dùng chung).
- Controller `list`/`performance` đọc query: `?role=staff&userIds=a,b&sources=auto,manual`. (Staff vẫn chỉ xem mình như hiện tại — chặn ở controller.)
- API FE (`api/kpi.js`): `getKpiPerformance(year, month, filters)`.

> Lọc theo **role/userIds** chỉ đổi *danh sách NV*. Lọc theo **sources** đổi *cách tính điểm* → cần ghi rõ trên UI "đang xem KPI của nguồn X".

### A2. Frontend (`KpiPanel` toolbar)
Thêm vào thanh toolbar (khu vực `slot` cạnh Tháng/Năm):
- **Vai trò**: segmented `[Tất cả | Chỉ staff | Chỉ admin]` — mặc định **Chỉ staff** (đúng nhu cầu admin hay dùng).
- **Nhân viên**: multi-select (MultiSelect đã có sẵn trong dự án) — để trống = tất cả theo vai trò.
- **(Tùy chọn) Nguồn**: multi-select 5 nguồn — để trống = mọi nguồn.
- Lưu lựa chọn vào `localStorage` (tiện mở lại). Cards/biểu đồ/bảng tự lọc theo bộ lọc.

**Chi phí**: nhỏ–vừa. Tái dùng `MultiSelect`, `useEnumsStore('task_source')`, CSS token sẵn.

---

## 4. Phần B — Báo cáo đa nguồn ở Tổng quan

Chọn 1 trong 2 mức (hoặc làm dần):

**B1 (nhẹ) — Thêm cột/tách ở bảng hiện tại:**
- Bảng Tổng quan thêm cột gọn: **Điểm KL theo nguồn** (vd "ĐK 20 · PS 8" = Định kỳ/Phát sinh) hoặc tooltip tách nguồn.
- Thêm 1 biểu đồ **stacked bar**: điểm KL mỗi NV tách theo nguồn (màu theo nguồn).

**B2 (đầy đủ) — "Chế độ xem theo nguồn":**
- Toggle ở toolbar: *Xem gộp* ↔ *Xem tách nguồn*.
- Khi tách: mỗi NV 1 dòng, các cột con theo nguồn (định kỳ / tự sắp xếp / nhờ hỗ trợ / KH yêu cầu / ra ngoài) × (điểm KL, %đúng hạn).
- Popup chi tiết đã có tab "Theo nguồn" → giữ nguyên, bổ sung %đúng hạn/điểm mỗi nguồn (đã có `bySource`).

**Khuyến nghị**: làm **B1 trước** (đủ để "thấy đa nguồn"), B2 sau nếu cần sâu.

---

## 5. Phần C — Quyết định MÔ HÌNH (cần bạn chốt)

> Đây là phần quan trọng nhất — ảnh hưởng con số KPI của mọi người.

**C1. Phạm vi nguồn nào vào KPI?**
- (a) **Tất cả nguồn** (hiện tại) — mọi việc đều tính.
- (b) **Chỉ một số nguồn** (vd chỉ `auto` + `manual`, bỏ `out`/`customer`).
- (c) **Tính tất cả nhưng cho LỌC/xem riêng** từng nguồn (không loại trừ khỏi điểm) — *đề xuất*.

**C2. Có trọng số theo nguồn không?**
- Hiện mọi task đóng góp như nhau (theo điểm checklist + đúng hạn).
- Có muốn vd: việc "KH yêu cầu" trễ bị phạt nặng hơn? → cần hệ số theo nguồn (phức tạp hơn, có thể để phase sau).

**C3. Đúng hạn: 2 chỉ số đang đo 2 việc khác mốc:**
- *Điểm khối lượng* = theo `completed_at` (việc hoàn thành trong tháng).
- *Đúng hạn* = theo `due_date` (việc đến hạn trong tháng).
→ Giữ như vậy (đo 2 thứ khác nhau — đúng chuẩn), hay thống nhất 1 mốc?

**C4. "Nhóm nhân viên" thật sự:**
- Trước mắt dùng **role** (staff/admin) — đủ cho nhu cầu "chỉ xem staff".
- Nếu cần nhóm theo **phòng ban/đội** (vd nhóm KH doanh nghiệp vs hộ kinh doanh): cần **migration thêm bảng `teams` + `users.team_id`** (hoặc chuẩn hoá `job_title` thành enum). → Đề xuất làm **phase riêng** khi bạn xác định cơ cấu nhóm.

**C5. Mốc điểm (`kpi_ontime_tiers`) hiện "gắt"** (≤49% đã −10). Có nới không? (chỉnh dữ liệu, không cần code).

---

## 6. Thứ tự triển khai đề xuất

| Phase | Nội dung | Phụ thuộc quyết định |
|---|---|---|
| **1** | **Bộ lọc Tổng quan** (role + nhân viên) — Phần A1+A2 (trừ lọc nguồn) | Không — làm ngay được |
| **2** | **Lọc theo nguồn** + ghi chú "đang xem nguồn X" — phần còn lại của A | C1 |
| **3** | **Báo cáo đa nguồn B1** (cột/stacked bar tách nguồn) | C1 |
| **4** | (Tùy) B2 xem-tách-nguồn đầy đủ | C1, C2 |
| **5** | (Tùy) Nhóm/phòng ban thật — migration `teams` | C4 |

→ **Phase 1 không cần chốt gì**, có thể làm ngay. Phase 2+ cần bạn trả lời C1–C5.

---

## 7. Rủi ro / lưu ý
- Lọc theo **nguồn** làm đổi con số điểm/đúng hạn → phải hiển thị rõ để không gây hiểu nhầm "điểm bị giảm".
- Tháng **đã chốt** đọc snapshot `kpi_monthly_results` (không có `bySource` cũ) → bộ lọc nguồn chỉ áp cho tháng **đang mở** (live); tháng đã chốt sẽ disable lọc nguồn hoặc tính lại từ live (cần quyết).
- Staff RBAC: mọi bộ lọc vẫn phải chặn staff chỉ xem chính mình.
- Dữ liệu cũ: điểm khối lượng = 0 (task cũ không chấm điểm) → báo cáo điểm sẽ 0 cho dữ liệu lịch sử; chỉ task sinh mới có điểm.

---

## 8. Việc cần bạn trả lời để mình bắt tay
1. **Phase 1 (bộ lọc role + nhân viên)**: làm luôn chứ? (mình đề xuất mặc định lọc **Chỉ staff**.)
2. **C1**: nguồn vào KPI — chọn (a)/(b)/(c)? (đề xuất (c): tính hết nhưng cho lọc xem riêng.)
3. **C4**: nhóm = role là đủ, hay cần phòng ban/đội thật (làm phase 5)?
4. **C2/C5**: có cần trọng số theo nguồn / nới mốc điểm không? (có thể để sau.)
