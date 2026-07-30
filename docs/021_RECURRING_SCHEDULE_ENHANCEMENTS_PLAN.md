# Build Plan — Nâng cấp Lịch định kỳ (3 tính năng)

> Trạng thái: **CHỜ DUYỆT** — chưa code. Viết để review trước khi thực hiện.
> Phạm vi: bộ lặp lịch định kỳ (customer_task_schedules) + luồng sửa ngày của task.

## 0. Chốt quyết định (đã thống nhất)

| # | Tính năng | Quyết định |
|---|---|---|
| 1a | Ngày bắt đầu cho lịch **lặp theo ngày** | Làm. Lưu trong `recurrenceConfig.start_date` (JSON, **không đổi schema**). |
| 1b | Bỏ qua CN + ngày nghỉ | **Cách B — đẩy tới ngày làm việc kế**. Tái dùng **data** `public_holidays`; **logic mới** cho engine. Chỉ bỏ **CN + lễ**; **thứ 7 vẫn là ngày làm việc**. **BẬT CHO TẤT CẢ LỊCH (global, không cần ô tích)**. **Đẩy CẢ ngày bắt đầu + ngày hết hạn**. |
| 2 | Trần ngày hoàn thành | **Tuyệt đối, theo từng khách hàng** (1 cột `max_task_due_date` trên `companies`). Chặn khi **staff** sửa Ngày hết hạn; **admin miễn trừ**. |

> **Chốt thêm (câu 1 & 2):** 1b áp **toàn hệ thống**, không có công tắc theo lịch → **không thêm cột `skip_non_working_days`**. Roll-forward áp cho **cả `start_date` và `due_date`**. Chấp nhận rủi ro: các lịch đang chạy cũng đổi cách tính ngày (past tasks không đổi; chỉ task sinh mới bị dời).

Nguyên tắc chung: **tương thích ngược tuyệt đối** — lịch/task cũ không đổi hành vi; migration chỉ ADD cột; các nhánh mới chỉ kích hoạt khi có cấu hình.

---

## 1a. Ngày bắt đầu (anchor) cho lịch lặp theo ngày

### Hiện trạng
- `daily` config = `{ every_n_days: N }`, không có ngày bắt đầu. Mốc tính dựa `last_generated_at` (lịch mới lấy "hôm qua") → kỳ đầu không kiểm soát được.
- Điểm cộng: cả cron + "Chạy ngay" đều đi qua `getNextOccurrence` trong [recurrence.calculator.js](../backend/src/utils/recurrence.calculator.js) → sửa 1 chỗ.

### Thiết kế
- `recurrenceConfig.start_date` (YYYY-MM-DD), **tùy chọn**. Không có → giữ nguyên hành vi cũ (fallback).
- Sửa nhánh `daily` của `getNextOccurrence(type, config, after)`:
  - Nếu có `start_date`:
    - `after < start_date` → trả về `start_date` (kỳ đầu tiên).
    - Ngược lại → `k = floor((after - start_date)/N) + 1`; trả `start_date + k*N`.
  - Không có `start_date` → công thức cũ (`after + N`).
- `getCurrentOccurrence` và `shouldGenerateToday` tự thừa hưởng (đều gọi `getNextOccurrence`).
  - Lịch mới, `start_date = ngày mai`: `shouldGenerateToday` trả kỳ = ngày mai; `next <= today` sai → **hôm nay chưa sinh**, đúng ý.

### File chạm
- `backend/src/utils/recurrence.calculator.js` — nhánh `daily`.
- `backend/src/utils/recurrence.validator.js` — cho phép/validate `start_date` khi `daily`.
- `frontend/src/pages/Companies/SchedulesTab.jsx` — thêm ô **"Ngày bắt đầu"** trong cấu hình lặp theo ngày; ghi vào `recurrenceConfig.start_date`; preview "các kỳ tiếp theo" phản ánh anchor.

### Edge cases
- Lịch daily cũ không có `start_date` → không đổi.
- `start_date` trong quá khứ → tính tiến bình thường.
- Kết hợp với 1b (roll-forward) ở dưới.

---

## 1b. Đẩy tới ngày làm việc kế (Cách B) — bỏ CN + lễ

### Hiện trạng
- Engine lặp **không** đụng ngày nghỉ. `+N ngày` và deadline offset cộng thẳng ([taskGenerator.job.js:66](../backend/src/jobs/taskGenerator.job.js#L66)).
- **Đã có**: bảng `public_holidays` (holiday_date) + admin CRUD ở Chấm công → tái dùng **data**.
- **Chưa có**: mọi logic bỏ/đẩy ngày → viết mới.

### Thiết kế (áp TOÀN HỆ THỐNG — không có công tắc)
- **Helper mới thuần** (nhận sẵn tập ngày nghỉ, không đụng DB) — `workday.util.js`:
  - `isOffDay(date, holidaySet)` = `getDay(date)===0` (CN) **hoặc** `yyyy-MM-dd ∈ holidaySet`. (Thứ 7 KHÔNG off.)
  - `rollForwardToWorkday(date, holidaySet)` = trong khi `isOffDay` → `+1 ngày`; trả ngày làm việc đầu tiên (≥ date).
- **KHÔNG thêm cột toggle** — áp cho mọi lịch, mọi loại lặp.
- **Áp dụng trong taskGenerator** (nơi có DB để nạp holiday):
  - Nạp `public_holidays` **1 lần/lần chạy** vào `Set` (perf).
  - `occurrence = getNextOccurrence(...)` → **dùng để tạo `period_label`** (GIỮ NGUYÊN, không roll — đảm bảo idempotency, không sinh trùng; cũng để **không lệch chu kỳ** kỳ kế).
  - `start_date = rollForwardToWorkday(occurrence)`
  - `due_date  = rollForwardToWorkday(occurrence + deadline_offset_days)`  ← **đẩy cả hai**
- **Preview** ("các kỳ tiếp theo" trong UI) cũng phải roll-forward để hiển thị đúng → endpoint preview nạp holiday + áp cùng helper.
- **Tương thích ngược:** past tasks không đổi (idempotency theo nhãn kỳ); chỉ **task sinh mới** bị dời khi trúng CN/lễ.

### Điểm mấu chốt / rủi ro
- **`period_label` phải tính từ occurrence GỐC** (trước roll) để idempotency key (lịch + nhãn kỳ) ổn định → chạy lại không nhân đôi task.
- Chỉ CN + lễ; thứ 7 làm việc (theo yêu cầu). Sau này nếu cần cấu hình "ngày nghỉ tuần" khác → mở rộng riêng.
- Perf: cache holiday theo năm đang xét, tránh query mỗi task.

### File chạm
- `backend/src/utils/workday.util.js` (mới) — `isOffDay`, `rollForwardToWorkday`.
- `backend/src/jobs/taskGenerator.job.js` — nạp holiday + roll-forward start/due (áp mọi lịch).
- Preview occurrences (trong schedules service/controller) — nạp holiday + áp roll-forward.
- `frontend/src/pages/Companies/SchedulesTab.jsx` — preview "các kỳ tiếp theo" phản ánh ngày đã dời (KHÔNG cần toggle).
- **Không đổi schema cho 1b** (không thêm cột toggle).

---

## 2. Trần ngày hoàn thành tuyệt đối theo từng khách hàng

### Hiện trạng
- Staff chỉ được chỉnh Ngày bắt đầu / Ngày hết hạn **mỗi thứ đúng 1 lần**, chỉ với task từ lịch định kỳ; admin không giới hạn ([tasks.service.js:599-645](../backend/src/modules/tasks/tasks.service.js#L599-L645)).
- **Chưa có trần** — staff có thể dời hạn xa tuỳ ý (trong 1 lượt).

### Thiết kế
- Thêm cột **`max_task_due_date DATE NULL`** trên `companies` (mốc tuyệt đối admin đặt cho KH đó).
- Chặn tại **đúng gate có sẵn** trong `updateTask` (nhánh `changingDue` của staff):
  - Lấy `companies.max_task_due_date` của công ty chứa task.
  - Nếu **có** trần và `newDueDate > max` → ném lỗi 403 (VD "Ngày hết hạn không được vượt quá 05/08/2026 do Quản trị viên đặt cho khách hàng này").
  - **Admin miễn trừ** (khối staff-date không chạy cho admin — giữ nguyên).
  - Không đặt trần → không hạn chế.
- **Chỉ áp cho Ngày hết hạn** (không đụng Ngày bắt đầu). **Chỉ validate lượt sửa của staff**; **KHÔNG kẹp** ngày auto sinh ra (giữ nguyên nghiệp vụ sinh task; admin tự chỉnh lịch nếu cần).

### Nơi thao tác — CONSOLE tập trung (đã chốt)
Admin **không vào từng khách hàng**. Trong Settings → section **"Bộ lập lịch tự động"** (đã có) thêm **button "Lịch định kỳ toàn hệ thống"** → mở **popup overview**:
- Bảng **theo công ty** (mỗi công ty có lịch định kỳ = 1 dòng): Tên công ty · Số lịch định kỳ · Nhân sự phụ trách · **ô ngày "Trần ngày hoàn thành"** (DateBox dd/mm/yyyy) để admin đặt/sửa.
- Có ô tìm/lọc theo tên công ty. **Admin-only.**

### Logic chặn (đã chốt: CHỈ chặn khi staff sửa tay)
- Chặn tại gate sẵn có trong `updateTask` (nhánh `changingDue` của **staff**): nếu công ty có `max_task_due_date` và `newDueDate > max` → **403**.
- **Admin miễn trừ.** **Task auto sinh KHÔNG bị kẹp.** Chỉ áp cho **Ngày hết hạn** (không đụng Ngày bắt đầu).
- Trần rỗng (null) → không hạn chế. Mốc tuyệt đối → admin tự cập nhật theo thời gian (chấp nhận).

### File chạm
- `backend/migrations/NNN_*.sql` — `ALTER TABLE companies ADD COLUMN max_task_due_date DATE;`
- `backend/src/modules/tasks/tasks.service.js` — kiểm tra trần trong nhánh `changingDue` (staff).
- **Console API (admin-only):**
  - `GET /api/schedules/overview` — list công ty có lịch định kỳ active + số lịch + phụ trách + `max_task_due_date`.
  - Set trần: thêm `maxTaskDueDate` vào cập nhật công ty (guard admin) **hoặc** endpoint riêng `PATCH /api/companies/:id/max-due-date`.
- `backend/src/modules/companies/*` — đọc/ghi `maxTaskDueDate` (chỉ admin).
- Frontend: `Settings` section "Bộ lập lịch tự động" → button + **popup console** (bảng công ty + DateBox trần ngày).

---

## 3. Migration

```
ALTER TABLE companies ADD COLUMN max_task_due_date DATE;   -- chỉ cho Luồng 2
```
- **1a**: không cần cột (dùng JSON `recurrenceConfig.start_date`).
- **1b**: không cần cột (áp toàn hệ thống).
- ⇒ **Luồng 1 KHÔNG có migration.** Migration chỉ phát sinh ở Luồng 2. Kèm `.down.sql` DROP cột.

---

## 4. Kế hoạch backtest (bắt buộc trước khi bật thật)

### Unit — recurrence.calculator (daily anchor)
- Anchor = hôm nay, N=3 → 3 kỳ kế đúng cách nhau 3 ngày.
- Anchor = ngày mai → kỳ đầu = ngày mai (hôm nay chưa sinh).
- Anchor quá khứ → tính tiến đúng.

### Unit — workday.util (roll-forward)
- Ngày CN → thứ 2 (nếu T2 không lễ).
- Ngày rơi lễ → ngày làm việc kế; thứ 7 KHÔNG bị đẩy.
- Chuỗi CN + T2(lễ) → thứ 3.

### Integration — taskGenerator
- Lịch daily, anchor ngày mai, cờ bật → `start_date` = ngày mai (đẩy nếu trúng nghỉ); `due_date` = start + offset (đẩy nếu trúng nghỉ).
- **Idempotency**: chạy lại / xóa task rồi "Chạy ngay" → không nhân đôi (nhãn kỳ từ occurrence gốc).
- Lịch cũ (cờ tắt, không anchor) → hành vi y nguyên.

### Integration — trần ngày (Feature 2)
- Staff sửa due ≤ trần → OK; > trần → 403; admin > trần → OK; không đặt trần → OK.
- Cờ "sửa 1 lần" vẫn hoạt động song song.
- Dùng harness sẵn có (mint JWT trong container, công ty test) + tham khảo `backend/scripts/test-scheduler-integration.js`.

---

## 5. Thứ tự thực hiện đề xuất
1. Migration (2 cột) + backend calculator (1a) + workday.util + generator (1b) → **backtest engine** trước.
2. Schedules schema/service + SchedulesTab UI (anchor + toggle + preview).
3. Feature 2: cột companies + gate trong tasks.service + ô admin ở company detail.
4. Backtest tổng hợp + rà tương thích ngược.

---

## 6. Câu hỏi mở
- ✅ **Câu 1 (đã chốt)**: 1b bật **cho tất cả lịch** (global, không toggle).
- ✅ **Câu 2 (đã chốt)**: đẩy **cả ngày bắt đầu + ngày hết hạn**.
- ✅ **Câu 3 (đã chốt)**: trần **chỉ chặn khi staff sửa tay** (admin & auto-gen miễn); mốc tuyệt đối, admin tự cập nhật theo thời gian.
- ✅ **Câu 4 (đã chốt)**: **KHÔNG** đặt ở company detail. Đặt ở **console tập trung** — button "Lịch định kỳ toàn hệ thống" trong section "Bộ lập lịch tự động", mở popup bảng **theo công ty**.

---

## 7. Phạm vi LUỒNG 1 — ✅ ĐÃ THỰC THI & TEST (2026-07-29)
Gồm **1a + 1b**. Đã xong toàn bộ + backtest PASS (13 unit + integration + HTTP preview). File mới: `backend/src/utils/workday.util.js`. Sửa: `recurrence.calculator.js`, `recurrence.validator.js`, `taskGenerator.job.js`, `schedules.service.js` (previewSchedule), `frontend/src/utils/recurrencePreview.js`, `SchedulesTab.jsx`. **Không migration.** Thứ tự đã làm:
1. `workday.util.js` (mới) + unit test roll-forward.
2. `recurrence.calculator.js` — anchor `start_date` cho `daily` + unit test.
3. `taskGenerator.job.js` — nạp holiday + roll-forward start/due.
4. Preview occurrences — roll-forward.
5. `SchedulesTab.jsx` — ô "Ngày bắt đầu" (daily) + preview phản ánh ngày dời.
6. Backtest tổng hợp (unit + integration + idempotency + tương thích ngược).

---

## 8. Phạm vi LUỒNG 2 — ✅ ĐÃ THỰC THI & TEST (2026-07-29)

> ⚠️ **REWORK**: bản đầu (migration 108) làm SAI — trần ngày **tuyệt đối theo công ty**. Đã sửa: trần **"ngày N hàng tháng" (1–31) theo TỪNG LỊCH** (mỗi loại công việc khác nhau; task lặp nhiều tháng nên mốc phải lặp hàng tháng). Migration **109** bỏ `companies.max_task_due_date`, thêm `customer_task_schedules.max_due_day`.

Mô hình đúng (đã chạy + test PASS 9/9):
1. **Migration 109**: DROP `companies.max_task_due_date`; ADD `customer_task_schedules.max_due_day SMALLINT CHECK 1–31` (NULL = không trần).
2. **Backend chặn** (`tasks.service.js`, nhánh `changingDue` của staff): đọc `max_due_day` của LỊCH (qua `customer_task_schedule_id`); mốc = **ngày N của THÁNG hạn hiện tại** của task (kẹp theo ngày cuối tháng); `newDue > mốc` → 403. Chặn cả nhảy tháng. Admin & auto-gen miễn trừ.
3. **Console API** (admin-only): `GET /api/schedules/overview` (list LỊCH + công ty + loại CV + `maxDueDay`), `PATCH /api/schedules/overview/:scheduleId` `{maxDueDay}` (1–31 | ''=xoá). Đăng ký TRƯỚC `/:id`.
4. **Frontend**: `RecurringOverviewModal.jsx` — bảng **lịch gộp nhóm theo công ty**, mỗi lịch 1 ô số 1–31 (lưu khi blur). Button trong TemplatesSection.
5. **Backtest PASS 9/9**: overview theo lịch; set=5 & đọc lại; staff dời >mốc/nhảy tháng → 403; staff ≤mốc → 200; admin >mốc → 200; maxDueDay=40 → 422; staff overview → 403 RBAC; message "ngày 5 hàng tháng (tối đa 05/08/2026)".
