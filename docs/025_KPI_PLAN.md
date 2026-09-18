# 025 — Build Plan: KPI (Cỡ việc theo loại công việc + KPI tháng)

> Trạng thái: **Phase 1 ĐÃ XONG (2026-09-18)** · Phase 2–3 chờ triển khai. Mục [7] còn vài điểm
> chốt cho Phase 2.
> Ngày lập: 2026-09-18. Liên quan: `reward_penalty_module`, `salary_config_module` (memory).
>
> **Đổi hướng so với bản nháp đầu:** BỎ ý gắn trọng số vào từng mục checklist (rối, chỉnh
> nhiều, NV nhìn loạn). Thay bằng **"cỡ việc" (điểm) gắn ở LOẠI công việc** — đúng cách các
> tool lớn (Jira/Asana/ClickUp) làm: checklist chỉ là thanh tiến độ đều nhau, độ khó/công sức
> ước lượng ở mức task/loại (kiểu story point / cỡ áo S-M-L).

---

## 1. Mục tiêu & nguyên tắc

Đo **KPI hoàn thành công việc** của nhân viên theo tháng, tách rõ 2 tầng:

- **Tầng 1 — Cỡ việc:** mỗi *loại công việc* có 1 điểm "cỡ việc" (Nhỏ/Vừa/Lớn = 1/2/3), gán 1
  lần. Việc lớn/khó được ghi nhận nhiều hơn việc nhỏ — **không đụng checklist**.
- **Tầng 2 — KPI tháng:** tổng hợp *task đã hoàn thành* → 3 chỉ số: Đúng hạn %, Khối lượng
  (Σ cỡ việc), Tách theo loại CV.

### Nguyên tắc chốt

1. **Checklist giữ nguyên, đơn giản, đều nhau** (đếm mục xong/tổng mục). NV không phải chọn
   khó/dễ gì → không loạn. Không thêm cột `weight`.
2. **Độ khó = "cỡ việc" ở mức LOẠI CV**, đặt 1 lần cho vài chục loại → quản lý gọn.
3. **Cỡ = độ phức tạp KHÁCH QUAN của việc, cố định theo việc — KHÔNG theo người.** NV cũ thấy
   dễ / NV mới thấy khó là *chênh lệch kinh nghiệm*, và nó **tự hiện ra ở Đúng hạn + Số lượng**,
   không nhét vào cỡ việc (nhét vào sẽ đếm 2 lần, đảo ngược động lực).
4. **KPI tháng tính trên task ĐÃ ĐÓNG**, không dùng % tiến độ của task dở.
5. **Cảnh báo (thực tế ngành):** điểm cỡ việc chỉ để *không đánh đồng việc to với việc nhỏ*,
   **không** phải thước đo hiệu suất tuyệt đối. Xương sống KPI = **Đúng hạn + Hoàn thành**; cỡ
   việc là hệ số phụ. Tránh để người chạy theo điểm / chọn việc điểm cao / "vẽ" điểm.

---

## 2. Mô hình dữ liệu

### Bảng cần đụng (schema thật đã rà)

| Bảng | Hiện có | Thêm |
|---|---|---|
| `task_types` (`006`) | name, group_name, default_sla_days, is_active | **`size_points SMALLINT NOT NULL DEFAULT 2`** (1=Nhỏ, 2=Vừa, 3=Lớn) |
| `tasks` (`010`) | task_type_id, assigned_to, status, due_date, completed_at | **`size_points SMALLINT NULL`** (override / cho task tự nhập không có loại) |
| `task_checklist_items` (`011`) | level, is_completed | **KHÔNG đổi** |

### Công thức "cỡ hiệu lực" của 1 task

```
effective_size(task) = COALESCE(tasks.size_points, task_types.size_points, 2)
```
Ưu tiên: override trên task → cỡ chuẩn của loại → mặc định Vừa(2). Task tự nhập không chọn gì
thì = 2.

### Nhãn hiển thị — enum động `task_size` (ĐÃ LÀM, đúng chuẩn dự án)

- **KHÔNG hardcode.** Danh mục động `task_size` (migration `153`): **MÃ enum (option_key) CHÍNH LÀ
  điểm** — key `'1'`=Nhỏ, `'2'`=Vừa, `'3'`=Lớn. Nhãn sửa được trong **Cài đặt → Danh mục hệ thống**.
- Cột `size_points` lưu đúng con số = mã enum. KPI cộng điểm trực tiếp từ số này.
- Admin thêm mức mới (vd key `'5'` = "Rất lớn") → tự chạy, **không cần sửa code** (mã = trọng số).
- BE validate `size_points` ∈ `enums.getValues('task_size')` (giống cách validate `task_source`).
- FE đọc `getOptions('task_size')`; có fallback tĩnh khi enum chưa tải (giống `task_priority`).

---

## 3. Phase 1 — Cỡ việc ở loại công việc  ✅ ĐÃ XONG

> Đã triển khai: migration `152_task_size_points.sql` (2 cột) + `153_enum_task_size.sql` (enum động
> `task_size`, mã=điểm); BE `task_types` + `tasks` (DTO `sizePoints`/`effectiveSize`, create/update,
> validate theo enum, staff không đổi cỡ); FE util `utils/taskSize.js` (đọc `getOptions('task_size')`
> + fallback), select cỡ ở Settings loại CV (modal + inline sửa nhanh trên dòng) + form tạo task,
> badge ở TaskDetail. Migration đã chạy, backend restart, build FE pass; smoke: values=['1','2','3'],
> cỡ sai bị 422. Nhãn Nhỏ/Vừa/Lớn sửa được ở **Danh mục hệ thống**.
> Số migration THẬT là **152–153** (không phải 025 — 025 là số của tài liệu này).

### 3.1 Migration `025_task_size_points.sql` (+ `.down`)

```sql
ALTER TABLE task_types ADD COLUMN IF NOT EXISTS size_points SMALLINT NOT NULL DEFAULT 2;
ALTER TABLE tasks      ADD COLUMN IF NOT EXISTS size_points SMALLINT;              -- nullable = kế thừa loại
-- (tuỳ chọn) seed enum động task_size: nho=1 / vua=2 / lon=3
```
Dữ liệu cũ: mọi loại về mặc định Vừa(2), mọi task `NULL` → kế thừa. **Không phá số liệu.**

### 3.2 Backend

- `task_types` service/schema: thêm `sizePoints` vào DTO + create/update (validate 1..3 hoặc
  theo enum). Files: `backend/src/modules/settings/taskTypes.*` (hoặc nơi CRUD loại CV hiện tại).
- `tasks` service/schema: thêm `sizePoints` (nullable) vào DTO + create/update task. Trả
  `effectiveSize` khi list/detail để FE hiển thị. File: `backend/src/modules/tasks/tasks.service.js`.
- Không cần đụng logic copy checklist template (`tasks.service.js:795/804/845`) vì bỏ weight.

### 3.3 Frontend

- **Settings → Loại công việc:** thêm ô chọn **Cỡ việc (Nhỏ/Vừa/Lớn)** cho mỗi loại. 1 control,
  set 1 lần. (Nơi: trang quản lý task types trong Settings.)
- **Tạo/sửa task** (`TaskFormModal.jsx`): ô **Cỡ việc** —
  - Task có loại: mặc định hiển thị theo cỡ của loại, cho **override** (tuỳ quyền — [7.d]).
  - Task tự nhập (không loại): chọn cỡ, mặc định **Vừa**.
- **Hiển thị:** badge cỡ việc nhỏ ở list/detail task (vd chip "L"). Không thêm gì vào checklist.
- Tuân chuẩn: token CSS, `Modal`, enum động qua `useEnumsStore` nếu dùng enum `task_size`.

### 3.4 Kết quả Phase 1

Việc lớn/khó được gắn cỡ cao hơn, gán 1 lần ở loại; checklist sạch như cũ; nền tảng "điểm khối
lượng" cho Phase 2 sẵn sàng.

---

## 4. Phase 2 — Module KPI tháng

### 4.1 Menu & quyền

- Menu **KPI** mới, chọn **tháng** (đồng bộ kỳ với Điểm thưởng / Bảng lương).
- RBAC như Tasks: **admin xem tất cả NV**, **staff chỉ xem mình**.

### 4.2 Ba chỉ số (mỗi NV, theo tháng M/Y)

**(1) Đúng hạn %** — đo kỷ luật theo hạn. Mẫu số = task **có `due_date` trong tháng** & giao
cho NV; tử số = trong đó **đóng đúng hạn**.
```sql
-- tử/mẫu cho 1 user, 1 tháng
assigned = COUNT(*) FILTER (
  WHERE assigned_to = :uid AND due_date BETWEEN :mStart AND :mEnd)
on_time  = COUNT(*) FILTER (
  WHERE assigned_to = :uid AND due_date BETWEEN :mStart AND :mEnd
        AND status = 'completed' AND completed_at::date <= due_date)
pct = ROUND(on_time * 100.0 / NULLIF(assigned, 0))
```

**(2) Khối lượng (Σ cỡ việc)** — đo sản lượng có tính độ lớn. Tính theo **task hoàn thành trong
tháng** (`completed_at` trong tháng).
```sql
volume_points = SUM(COALESCE(t.size_points, tt.size_points, 2)) FILTER (
  WHERE t.assigned_to = :uid AND t.status = 'completed'
        AND t.completed_at::date BETWEEN :mStart AND :mEnd)
```

**(3) Tách theo loại CV** — gom `task_type`: mỗi loại có số việc hoàn thành + tỉ lệ đúng hạn +
điểm → thấy **loại nào làm tốt nhất**.

> Lưu ý cố ý: (1) neo theo `due_date`, (2) neo theo `completed_at` — vì đo 2 thứ khác nhau (kỷ
> luật hạn vs sản lượng thực trong tháng). Ghi rõ trong UI để khỏi hiểu nhầm.

### 4.3 Backend

- Module mới `backend/src/modules/kpi/` (service + controller + router), hoặc gộp vào `tasks`.
- Endpoint (admin + self):
  - `GET /kpi?year=&month=` → tổng hợp mọi NV (admin) hoặc chính mình (staff): mảng
    `{ userId, userName, assigned, onTime, onTimePct, volumePoints }`.
  - `GET /kpi/:userId?year=&month=` → chi tiết 1 NV + bảng tách theo loại CV.
- Đọc enum trạng thái/loại đúng chuẩn; timezone quy **giờ VN** khi cắt mốc tháng (tránh lệch UTC
  như các module cũ).

### 4.4 Frontend

- Trang `frontend/src/pages/KPI/` : bảng NV (STT/checkbox chuẩn, `PaginationFooter`), cột Đúng
  hạn %, Khối lượng; filter tháng; click NV → chi tiết + bảng theo loại CV.
- Dùng lại: `data-table` primitives, `ColumnFilterDropdown`, `exportXlsx` (chuẩn POST
  `/api/export/xlsx`), token CSS.

### 4.5 Con số "69%"

Con số hiển thị **chính = Đúng hạn %**. Khối lượng & theo-loại là **bảng bổ trợ**, không gộp vào
1 số để tránh nhập nhằng. (Chốt [7.c].)

---

## 5. Phase 3 — Ráp KPI → Thưởng → Lương (phần "chưa ráp")

- Map KPI tháng → **xếp loại E→S** (Điểm thưởng) → `kpi_grades.amount` (tiền) → cộng vào `bonus`
  của Bảng lương.
- `payroll.applyRewardPenalty` hiện đang throw → bật lại theo hướng cộng `grade.amount`.
- Làm **sau khi Phase 1–2 nghiệm thu**. Tham chiếu `reward_penalty_module`, `salary_config_module`.

---

## 6. Thứ tự & phạm vi

```
Phase 1 (cỡ việc ở loại CV)  → nghiệm thu
  → Phase 2 (module KPI tháng)  → nghiệm thu
     → Phase 3 (ráp KPI → thưởng → lương)
```
Phase 1 nhỏ gọn (2 cột + UI select), dùng được ngay. Phase 2 là phần chính. Phase 3 để cuối.

---

## 7. Cần chốt trước khi code

- **a. Task không có `due_date`** thì tính đúng-hạn thế nào? *Đề xuất:* loại khỏi mẫu số "Đúng
  hạn" (vì không có hạn để so), nhưng **vẫn tính vào Khối lượng** khi hoàn thành.
- **b. "Được giao" neo theo `due_date` trong tháng** (đề xuất) hay theo ngày tạo/giao? *Đề xuất:*
  `due_date` — phản ánh "việc đến hạn tháng này xong chưa".
- **c. Con số KPI chính = Đúng hạn %** (đề xuất) hay công thức tổng hợp có trọng số cả 3?
- **d. Ai được đặt/override cỡ việc?** *Đã chốt:* cỡ chuẩn ở loại CV do **admin** đặt; override
  trên task do **người giao việc** (staff làm việc không tự đổi — đã chặn ở updateTask). Nhãn cỡ
  dùng **enum động `task_size`** (đã làm — migration 153).
- **e. Task việc con (subtask)** có cỡ riêng không? *Đề xuất:* không — chỉ task chính có cỡ,
  subtask thừa hưởng ngữ cảnh của task cha.

---

## 8. Rủi ro & lưu ý

- **Anti-pattern hiệu suất:** đừng biến điểm cỡ việc thành thước đo cá nhân tuyệt đối (nguồn:
  Atlassian/Asana/Scrum.org). Ưu tiên **Đúng hạn + Hoàn thành**, cỡ việc là hệ số phụ.
- **Cỡ theo việc, không theo người:** chênh lệch kinh nghiệm đã nằm ở tốc độ/đúng hạn — không
  nhân đôi vào cỡ.
- **Không phá dữ liệu cũ:** default cỡ = Vừa(2), checklist không đổi → hệ thống chạy y như trước
  cho tới khi admin bắt đầu gán cỡ.
- **Enum động + timezone VN** theo chuẩn dự án.
- **Task tự nhập** vốn khó so sánh khách quan giữa người — đây là giới hạn tự nhiên; ưu tiên
  chuẩn hoá việc lặp lại thành loại CV để phần có-cỡ-chuẩn phình ra theo thời gian.

---

## Tham khảo

- Story Points — Atlassian: https://www.atlassian.com/agile/project-management/estimation
- Story Points — Asana: https://asana.com/resources/story-points
- 9 Bad Practices for Story Points — Agile Insider: https://medium.com/agileinsider/9-bad-practices-for-using-story-points-ae210ad1d06c
- To Estimate or Not — Scrum.org: https://www.scrum.org/resources/blog/story-points-estimate-or-not-estimate
