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

### File chạm
- `backend/migrations/NNN_*.sql` — `ALTER TABLE companies ADD COLUMN max_task_due_date DATE;`
- `backend/src/modules/tasks/tasks.service.js` — thêm kiểm tra trần trong nhánh `changingDue` (staff).
- `backend/src/modules/companies/companies.service.js` + `companies.schema.js` — đọc/ghi `maxTaskDueDate` (chỉ **admin** được set).
- Frontend: 1 ô ngày **"Hạn hoàn thành tối đa (KH)"** cho admin — đặt ở **company detail** (Tổng quan) hoặc header tab Lịch định kỳ.

### Edge cases / lưu ý cần bạn xác nhận
- Task lặp qua nhiều tháng: 1 mốc tuyệt đối (VD 5/8) sẽ **chặn mọi task có hạn vượt 5/8**. Đây là "chốt cứng tạm thời" — admin cần **cập nhật lại mốc** theo thời gian, hoặc ta để null khi hết hiệu lực. → xem "Câu hỏi mở #3".

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
- ⏳ **Câu 3 (Luồng 2)**: mốc tuyệt đối theo KH chặn **mọi** task vượt mốc → admin cập nhật định kỳ? Hay chỉ áp **kỳ hiện tại**?
- ⏳ **Câu 4 (Luồng 2)**: vị trí ô admin đặt trần — Tổng quan company detail hay header tab Lịch định kỳ?

> Câu 3 & 4 chỉ ảnh hưởng **Luồng 2** → **không chặn Luồng 1**. Làm Luồng 1 trước, chốt 3 & 4 sau.

---

## 7. Phạm vi LUỒNG 1 — ✅ ĐÃ THỰC THI & TEST (2026-07-29)
Gồm **1a + 1b**. Đã xong toàn bộ + backtest PASS (13 unit + integration + HTTP preview). File mới: `backend/src/utils/workday.util.js`. Sửa: `recurrence.calculator.js`, `recurrence.validator.js`, `taskGenerator.job.js`, `schedules.service.js` (previewSchedule), `frontend/src/utils/recurrencePreview.js`, `SchedulesTab.jsx`. **Không migration.** Thứ tự đã làm:
1. `workday.util.js` (mới) + unit test roll-forward.
2. `recurrence.calculator.js` — anchor `start_date` cho `daily` + unit test.
3. `taskGenerator.job.js` — nạp holiday + roll-forward start/due.
4. Preview occurrences — roll-forward.
5. `SchedulesTab.jsx` — ô "Ngày bắt đầu" (daily) + preview phản ánh ngày dời.
6. Backtest tổng hợp (unit + integration + idempotency + tương thích ngược).
