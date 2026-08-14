# 024 — Chấm công Giai đoạn 2

> **Mục tiêu:** hệ thống biểu diễn được “0.5 công làm + 0.5 ngày nghỉ”, và chính sách
> từng loại nghỉ trở thành **cấu hình** thay vì code cứng.
> Giai đoạn 1 (sửa 5 lỗi logic, không migration) ở [023_ATTENDANCE_PHASE1_FIX_PLAN.md](./023_ATTENDANCE_PHASE1_FIX_PLAN.md).

| Nhóm | Nội dung | Migration? | Trạng thái |
|------|----------|-----------|-----------|
| **A** | Sửa lỗi đếm ngày công + chặn đơn trùng | Không | ✅ **XONG 14/08/2026** |
| **B** | Mô hình đúng: nghỉ nửa ngày + chính sách nghỉ | 125–127 | ✅ **XONG 14/08/2026** |
| **C** | Quỹ phép năm | 128 | ✅ **XONG 14/08/2026** |

> **Kiểm thử toàn phần: 93 PASS / 0 FAIL** (`qa_phase1`, `qa_phase1b`, `qa_groupA`, `qa_groupBC`).
> DB về đúng nguyên trạng sau khi dọn: `leave_requests` 9 · `attendance_records` 188 · `payroll_records` 0.
>
> **Hai giả định đã tự chốt** (bạn đổi được, xem mục "Quyết định đã chốt"):
> nghỉ nửa ngày chỉ cho đơn 1 ngày · `sick` hưởng 100%.

---

## NHÓM A — ✅ ĐÃ XONG

### A1. `countWorkingDays` bỏ sót thứ 7

**Lỗi:** [leave.service.js](../backend/src/modules/attendance/leave.service.js) hardcode
`if (dow !== 0 && dow !== 6)` — loại trừ thứ 7 vô điều kiện. Nhưng hệ thống đặt
`attendance.saturday_shift_id` (⇒ `saturdayMode = workday`) và có **30 ngày thứ 7 chấm công thật**.

**Hệ quả đo được trên dữ liệu thật — 2/9 đơn nghỉ sai:**

| Nhân viên | Khoảng | Đã ghi | Đúng phải là |
|-----------|--------|--------|--------------|
| Bùi Thị Đức Thảo | T7 18/07/2026 | **0 ngày** | 1 |
| Lê Thị Kim Liên | 22→25/07/2026 | **3 ngày** | 4 (sót T7 25/07) |

**Cách sửa:** `countWorkingDays(startDate, endDate, userId)` nay khớp đúng quy tắc của
`calculateAttendanceRecord`:
- Chủ nhật: luôn nghỉ
- Thứ 7: nghỉ **chỉ khi** chưa cấu hình `attendance.saturday_shift_id`
- Ngày lễ: không tính (đã trả lương qua `status='holiday'`)
- `work_schedules`: override riêng của từng nhân viên **thắng mọi quy tắc trên**

Nạp holidays + config + overrides trong **3 truy vấn song song** rồi lặp trong JS — không query theo ngày.

**Thêm:** đơn mà cả khoảng không có ngày làm việc nào (chỉ CN / ngày lễ) → **422**,
thay vì lặng lẽ tạo đơn 0 ngày.

**Dọn bản sao ở frontend:** `countWeekdays()` trong `Attendance.jsx` và `AttendanceAdmin.jsx`
lặp lại **đúng lỗi này** và được dùng làm giá trị dự phòng khi `totalDays = 0` → hiển thị
số bịa ra, mâu thuẫn với backend. Đã **xoá cả 2 hàm**, mọi chỗ hiển thị lấy thẳng
`totalDays` từ backend — nơi duy nhất biết cấu hình ca thứ 7 và lịch riêng của nhân viên.

### A2. Chặn đơn nghỉ trùng khoảng ngày

**Lỗi:** `createLeaveRequest` không kiểm tra chồng lấn. `calculateAttendanceRecord` chỉ lấy
MỘT đơn cho mỗi ngày (`ORDER BY created_at LIMIT 1`) → đơn thứ hai bị bỏ qua âm thầm,
và quỹ phép (Nhóm C) sẽ trừ hai lần cho cùng một ngày.

**Cách sửa:** `assertNoOverlappingLeave()` — chặn **409** nếu khoảng ngày giao với đơn
`pending` hoặc `approved` của cùng nhân viên. Thông báo nêu rõ đơn nào, loại gì, từ ngày nào.
Đơn `cancelled`/`rejected` không tính.

### Kiểm thử — **13 PASS / 0 FAIL**

Script `scratchpad/qa_groupA.js`, gọi HTTP thật với JWT.

| Ca kiểm thử | Kết quả |
|-------------|---------|
| Đơn đúng 1 ngày thứ 7 → `total_days = 1` (trước fix: 0) | PASS |
| Ngày T7 đó thật sự thành `on_leave` → khớp `total_days` | PASS |
| Đơn chỉ gồm chủ nhật → 422 | PASS |
| T6→T2 (gồm T7 làm việc + CN nghỉ) → 3 ngày, không phải 2 | PASS |
| Trùng y hệt đơn đã duyệt → 409 | PASS |
| Trùng một phần → 409 | PASS |
| Trùng đơn đang chờ duyệt → 409 | PASS |
| Không trùng → tạo bình thường | PASS |
| Sau khi thu hồi đơn cũ → tạo lại cùng ngày được | PASS |
| Hồi quy: danh sách đơn nghỉ, báo cáo tháng | PASS |

**Dọn dẹp:** DB về đúng nguyên trạng — `leave_requests` 9→9 · `attendance_records` 188→188 · `payroll_records` 0→0.

### ⚠️ CHƯA LÀM — backfill `total_days` của đơn cũ

Code đã đúng, nhưng **2 đơn cũ vẫn giữ số sai** (bảng ở A1). Chưa chạy vì đây là **ghi dữ liệu
nghiệp vụ thật**, cần bạn quyết. Script tính lại (chạy thử trước, không ghi):

```bash
docker compose exec -T backend node -e "
const { query } = require('/app/src/config/db');
const svc = require('/app/src/modules/attendance/leave.service');
const APPLY = false;   // đổi thành true để GHI
(async () => {
  const { rows } = await query('SELECT id, user_id, start_date, end_date, total_days FROM leave_requests');
  const ymd = d => new Date(d).toISOString().slice(0,10);
  for (const r of rows) {
    const moi = await svc.countWorkingDays(ymd(r.start_date), ymd(r.end_date), r.user_id);
    if (moi !== parseFloat(r.total_days)) {
      console.log(ymd(r.start_date), '->', ymd(r.end_date), ':', r.total_days, '=>', moi);
      if (APPLY) await query('UPDATE leave_requests SET total_days=\$1, updated_at=NOW() WHERE id=\$2', [moi, r.id]);
    }
  }
  process.exit(0);
})();
"
```

---

## NHÓM B — ✅ ĐÃ XONG

### Quyết định đã chốt (bạn đổi được bất cứ lúc nào)

1. **Nghỉ nửa ngày chỉ cho đơn 1 ngày** — ràng buộc `chk_lr_halfday_single_day`.
   Nếu sau này có ca “chiều T2 → sáng T5”: bỏ ràng buộc + thêm bảng con
   `leave_request_days(request_id, work_date, units)`.
2. **`sick` hưởng 100%** (`paid_rate = 1.000`). Đổi sang 75% theo BHXH chỉ cần một câu:
   `UPDATE leave_policies SET paid_rate = 0.750 WHERE leave_type = 'sick';`
   Cột đơn vị công đã dùng `NUMERIC(4,3)` nên 0.375 (nửa ngày × 75%) lưu chính xác.

**LƯU Ý về down-migration:** nếu đã đổi `paid_rate` khác 1.0 thì `126_down` **không khôi phục
đúng** được (phép nhân đã mất thông tin gốc) — phải phục hồi từ bản dump.

### Migration 125 — `leave_policies` + `day_part`

Bảng chính sách thay cho việc rải chính sách trong chuỗi SQL:
`is_paid`, `paid_rate`, `allow_half_day`, `deduct_balance`, `counts_as_work`, `maps_to_status`.
`leave_requests` thêm `day_part` (`full`/`morning`/`afternoon`/`hours`) + `hours`.

⇒ `wfh` / `business_trip` đặt `counts_as_work = true` — hết bị xếp nhầm vào “nghỉ”.
⇒ Frontend bỏ 2 object `LEAVE_TYPE` hardcode, lấy động (sửa luôn nhãn `unpaid` đang lệch:
   DB ghi “Nghỉ không phép”, UI ghi “Nghỉ không lương”).

### Migration 126 — Tách cột đơn vị công (**bước rủi ro nhất**)

`work_units` (chỉ từ chấm công) · `paid_leave_units` · `unpaid_leave_units` ·
`payable_units` **GENERATED ALWAYS AS (work_units + paid_leave_units) STORED` ·
`CHECK (tổng ≤ 1.0)`.

Kiểu `NUMERIC(4,3)` chứ không phải `(3,1)`: `paid_rate 0.75` × nửa ngày = **0.375**,
kiểu cũ làm tròn thành 0.4 và sai âm thầm.

**Backfill phải chạy TRƯỚC khi thêm CHECK** (dữ liệu cũ đang có `work_units = 1.0` trên ngày nghỉ).

### Migration 127 — View `v_attendance_daily`

Một nguồn duy nhất cho mọi báo cáo, diệt luôn lỗi OT hai nguồn
(`ar.ot_hours` vs `overtime_requests`).
**Đã đi được nửa đường:** [aggregate.sql.js](../backend/src/modules/attendance/aggregate.sql.js)
tạo ở GĐ1 đã gom 4 bản sao về một chỗ — bước này chỉ cần đổi ruột file đó.

### Viết lại `calculateAttendanceRecord`

Từ **ghi-đè** sang **cộng-dồn**: tính chấm công thực tế → cộng phần nghỉ theo
`day_part × paid_rate` → cap ≤ 1.0. `status` mất vai trò nguồn dữ liệu, chỉ còn là nhãn hiển thị.

---

## NHÓM C — ✅ ĐÃ XONG: Quỹ phép năm

`users.annual_leave_days` (migration 036, mặc định 12.0) từng là **cột chết** — không dòng
code nào đọc. Nay:
- **Migration 128** `v_leave_balance`: hạn mức × từng năm, đã dùng (chỉ loại nghỉ có
  `deduct_balance` và đơn ĐÃ DUYỆT), còn lại. `total_days` đã tính sẵn hệ số nửa ngày
  nên trừ quỹ đúng 0.5.
- **Chặn khi duyệt vượt quỹ** → 409 kèm `code: LEAVE_BALANCE_EXCEEDED`.
  Không chặn cứng: giao diện hỏi lại, admin đồng ý thì gửi `force: true` và backend ghi
  `[Duyệt vượt quỹ: còn X, xin Y]` vào ghi chú để còn dấu vết.
- `GET /leave-requests/balance` — nhân viên xem của mình, admin xem tất cả.
- Form đơn nghỉ hiện “Quỹ phép năm 2026: còn 10.5/12 ngày”.

---

## Lỗi phát hiện TRONG lúc làm Nhóm B+C

Đây là những thứ chỉ lộ ra khi chạy thật, không thấy được khi đọc code:

**1. `leave_policies` suýt dùng sai kiểu.** Migration 125 bản đầu khai `leave_type` là ENUM
gốc Postgres. Chạy lên báo `operator does not exist: leave_type = character varying` —
vì [migration 104](../backend/migrations/104_all_enums_dynamic.sql) đã chuyển TẤT CẢ cột
danh mục sang VARCHAR + `enum_options`. Đã lùi 125 và viết lại theo đúng quy ước đó.
**Bài học: mọi bảng danh mục mới phải theo chuẩn enum động, không quay lại ENUM gốc.**

**2. Nửa ngày ra 0 công.** Người làm 08:00–12:00 rồi nghỉ phép buổi chiều bị tính 0 công:
giờ làm được so với giờ chuẩn CẢ NGÀY (3/8 = 0.375 < 0.5) và bị trừ trọn 1 tiếng nghỉ trưa.
Sửa: nghỉ trưa trừ **theo tỉ lệ** phần ngày còn phải làm, và tỉ lệ giờ so với
`requiredHours × remaining`. Áp cho cả `attendance.service` lẫn `adjustments.service`.

**3. Nghỉ phép buổi chiều bị gắn nhãn “Về sớm”.** Nghỉ đúng phép mà mang tiếng về sớm.
Sửa: nghỉ một phần ngày thì bỏ tính trễ/sớm ở phía được nghỉ (`morning` → bỏ trễ,
`afternoon` → bỏ sớm, `hours` → bỏ cả hai).

**4. 🔴 `is_adjusted` làm vỡ trần công — và hỏng IM LẶNG.** Ngày admin đã sửa tay có
`work_units` bị đóng băng; khi sau đó duyệt đơn nghỉ, phần nghỉ vẫn được ghi → tổng > 1.0 →
`chk_ar_units_cap` chặn → **cả lần tính lại bị huỷ**. Tệ hơn: `recalcRange` đang nuốt lỗi bằng
`.catch(() => {})` nên đơn nghỉ trông như duyệt thành công trong khi bảng chấm công không đổi.
Sửa hai chỗ: `work_units = LEAST(giá trị đã đóng băng, 1.0 - paid - unpaid)`, và
`recalcRange` **không nuốt lỗi nữa** — log ra + ném lỗi kèm danh sách ngày hỏng.

**5. `adjustments.service` chưa biết tới cột mới.** Đổi status bằng tay vẫn dồn hết vào
`work_units` (vd `on_leave` → `work_units = 1.0`) thay vì ghi vào `paid_leave_units`.
Đã thay bằng bảng ánh xạ ghi đúng ba cột.

**6. `onClick={handleApprove}` truyền event vào tham số `force`** → mọi lần duyệt đều thành
ép duyệt vượt quỹ. Sửa thành `onClick={() => handleApprove()}`.

**7. `errorHandler` nuốt mất `err.code`** → giao diện không phân biệt được lỗi vượt quỹ với
lỗi thường, buộc phải so khớp chuỗi tiếng Việt. Đã cho trả `code` với lỗi < 500.

---

## Điều kiện đã có sẵn giúp Nhóm B bớt rủi ro

| Đã biết (đo được ở GĐ1 + Nhóm A) | Ý nghĩa |
|---|---|
| **0 bản ghi mồ côi** (`on_leave` mà `leave_request_id IS NULL`) | Backfill 126 sẽ sạch, không phải xử lý tay |
| Chỉ **10 ngày** `on_leave` trong toàn DB | Khối lượng backfill rất nhỏ, dễ đối chiếu |
| **13 ngày lễ đã khai báo** (Tết tháng 1/2026) | Bẫy `COALESCE(..., FALSE)` sẽ bị thực thi thật — phải giữ nguyên khi viết lại |
| `aggregate.sql.js` đã gom 4 bản sao | Bước 127 nhẹ hơn dự tính |
| **53 ca kiểm thử HTTP** đã có (`qa_phase1*.js`, `qa_groupA.js`) | Lưới an toàn chạy lại được sau mỗi migration của Nhóm B |

---

## Nhắc khi deploy

- Build lại frontend **và restart backend**. Code có mount vào container nhưng process Express
  giữ bản cũ trong bộ nhớ — đã vấp một lần ở GĐ1 (route mới trả 404).
- Backfill `total_days` (mục A) phải chạy trên server, không chỉ local.
