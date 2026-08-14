# 023 — Chấm công: Kế hoạch sửa lỗi Giai đoạn 1

> **Trạng thái:** ✅ ĐÃ TRIỂN KHAI CODE (14/08/2026) — chờ chạy checklist nghiệm thu ở mục 4
> **Ngày lập:** 14/08/2026
>
> **Khác biệt so với plan khi thi công** (chi tiết ở mục 8):
> - Gom 4 bản sao SQL vào module dùng chung `aggregate.sql.js` ngay ở GĐ1 (plan định để GĐ2)
> - Thêm dọn `leave_request_id` khi ngày không còn thuộc đơn nghỉ nào
> - Thêm `ORDER BY created_at` cho truy vấn tìm đơn nghỉ phủ ngày (trước đó `LIMIT 1` không xác định)
> - Sửa `payroll.upsertRecord` phân biệt "gửi danh sách rỗng" vs "không gửi trường"
> - Mốc ngày `attendance.strict_unpaid_from` hiện **để trống** = áp dụng toàn bộ lịch sử
> **Phạm vi:** Sửa lỗi logic module chấm công. KHÔNG đổi schema, KHÔNG migration.
> **Giai đoạn 2** (nghỉ nửa ngày, bảng chính sách, tách cột đơn vị công) nằm ngoài tài liệu này.

---

## 0. Tóm tắt

Giai đoạn 1 sửa **5 lỗi** trong module chấm công. Toàn bộ là thay đổi mã nguồn —
không có `ALTER TABLE`, không có `DELETE`, không có `UPDATE` hàng loạt.
Dữ liệu hiện có **không bị xoá và không bị sửa** khi deploy.

| # | Lỗi | Mức độ | Loại sửa |
|---|-----|--------|----------|
| 1 | Admin có đơn nghỉ đã duyệt vẫn được tính đủ công | 🔴 Nghiêm trọng | Đảo thứ tự khối lệnh |
| 2 | Duyệt đơn nghỉ xoá mất điều chỉnh thủ công của admin | 🔴 Nghiêm trọng | Thêm guard `is_adjusted` |
| 3 | Nghỉ không lương (`unpaid`) vẫn được tính 1 công hưởng lương | 🔴 Nghiêm trọng | Sửa câu `SELECT` (4 chỗ) |
| 4 | Duyệt nhầm đơn nghỉ thì không thu hồi được | 🟠 Vừa | Thêm endpoint mới |
| 5 | Lưu bảng lương ghi đè xoá mất `attendance_summary` | 🟠 Vừa | Đổi `=` thành `\|\|` |

**Ngoài phạm vi GĐ1** (để lại cho GĐ2): nghỉ nửa ngày, bảng `leave_policies`,
tách cột `paid/unpaid_leave_units`, quỹ phép năm, `countWorkingDays` bỏ sót thứ 7,
chống trùng đơn nghỉ, gom 4 bản sao SQL vào view.

---

## 1. QUYẾT ĐỊNH CẦN CHỐT TRƯỚC KHI LÀM

Fix #3 sửa cách **đọc** dữ liệu → báo cáo các tháng đã qua sẽ đổi số ngay khi deploy
(nhân viên từng nghỉ không lương sẽ thấy tổng công tháng cũ giảm xuống).

Nếu lương những tháng đó đã trả theo số cũ, báo cáo sẽ không còn khớp sổ sách.

### Giải pháp đề xuất: mốc ngày cấu hình được

Thay vì chọn cứng trong code, thêm một khoá `system_configs`:

```
key:   attendance.strict_unpaid_from
value: '' (rỗng)  → áp dụng cho TOÀN BỘ lịch sử
       '2026-09-01' → chỉ áp dụng từ ngày này trở đi; trước đó giữ cách tính cũ
```

Ưu điểm: đổi ý không cần deploy lại, và nếu kế toán phản ứng thì lùi về được trong 10 giây.

**→ Cần bạn chốt giá trị khởi tạo: để rỗng (sửa cả lịch sử), hay đặt một mốc ngày?**

---

## 2. Chi tiết từng fix

### FIX 1 — Admin có đơn nghỉ vẫn đủ công

**File:** `backend/src/modules/attendance/attendance.service.js`

**Hiện trạng:** trong `calculateAttendanceRecord`, khối "Step 4.5 — admin auto-present"
(dòng 132–168) nằm **trước** khối "Step 5 — approved leave" (dòng 170–193) và có `return`
ở cuối. Hệ quả: mọi user `role = 'admin'` luôn được ghi `status = 'present', work_units = 1.0`,
đơn nghỉ đã duyệt của họ **không bao giờ được đọc tới**.

**Cách sửa:** di chuyển nguyên khối Step 4.5 xuống **sau** khối Step 5.
Không đổi một dòng logic nào bên trong khối.

```
Thứ tự MỚI trong calculateAttendanceRecord:
  Step 1-2  resolve work schedule → day off thì return null
  Step 4    public holiday
  Step 5    approved leave          ← ĐẨY LÊN
  Step 4.5  admin auto-present      ← ĐẨY XUỐNG
  Step 6+   tính từ attendance_logs
```

**Ảnh hưởng dữ liệu:** không. Chỉ đổi kết quả của các lần tính **sau này**.
Bản ghi cũ nằm yên cho tới khi có sự kiện kích hoạt tính lại (check-in/out,
duyệt đơn, admin điều chỉnh) trên đúng ngày đó.

**Rủi ro:** thấp. Rủi ro duy nhất là admin nào đó đang có đơn nghỉ "công tác"/"WFH"
đã duyệt kéo dài — sau fix, những ngày đó sẽ hiện `business_trip`/`wfh` thay vì
`present`. Cả hai đều là `work_units = 1.0` nên tổng công không đổi.

---

### FIX 2 — Duyệt đơn nghỉ xoá mất điều chỉnh thủ công

**File:** `backend/src/modules/attendance/attendance.service.js` (dòng 183–191)

**Hiện trạng:** nhánh nghỉ phép dùng `ON CONFLICT ... DO UPDATE SET status = $4, work_units = 1.0`
**không kiểm tra `is_adjusted`** — trong khi nhánh admin ngay phía trên (dòng 154–161)
thì có kiểm tra. Hệ quả: admin sửa tay giờ vào/ra hoặc trạng thái một ngày, sau đó
duyệt một đơn nghỉ phủ ngày đó → toàn bộ điều chỉnh bị ghi đè mất, không có cảnh báo.

**Cách sửa:** dùng đúng pattern `CASE WHEN ... is_adjusted THEN ... ELSE ... END`
đã có sẵn ở nhánh admin, cho hai cột `status` và `work_units`:

```sql
ON CONFLICT (user_id, work_date) DO UPDATE SET
  status     = CASE WHEN attendance_records.is_adjusted
                    THEN attendance_records.status     ELSE $4  END,
  work_units = CASE WHEN attendance_records.is_adjusted
                    THEN attendance_records.work_units ELSE 1.0 END,
  leave_request_id = $5,          -- LUÔN gắn, kể cả khi is_adjusted
  shift_id         = $3,
  updated_at       = NOW()
```

**Lưu ý thiết kế:** `leave_request_id` vẫn luôn được ghi kể cả khi `is_adjusted = TRUE`.
Lý do: đây là *liên kết dữ liệu* (ngày này thuộc đơn nghỉ nào), không phải *giá trị tính công*.
Fix #3 và toàn bộ GĐ2 dựa vào FK này để biết loại nghỉ — mất nó là mất luôn khả năng phân loại.

**Ảnh hưởng dữ liệu:** không.

---

### FIX 3 — Nghỉ không lương vẫn ăn 1 công

**File:** 4 vị trí, cùng một biểu thức bị copy 4 lần:

| File | Dòng | Hàm |
|------|------|-----|
| `attendance.service.js` | 445 | `getAttendanceSummary` |
| `attendance.service.js` | 572 | `sendAttendanceConfirmation` (email) |
| `report.service.js` | 79 | `getMonthlyReport` |
| `report.service.js` | 169 | `syncAttendanceToPayroll` |

**Hiện trạng:**
```sql
COALESCE(SUM(ar.work_units) FILTER (
  WHERE ar.status IN ('on_leave','wfh','business_trip','holiday')
), 0) AS leave_paid_days
```
Vì cả 4 loại `annual/sick/compensatory/unpaid` đều bị gom thành `status = 'on_leave'`,
nghỉ không lương rơi thẳng vào `leave_paid_days` và được cộng vào tổng công.

**Cách sửa:** JOIN ngược về `leave_requests` qua FK `leave_request_id` để lấy lại
`leave_type` gốc, rồi tách làm hai cột:

```sql
LEFT JOIN leave_requests lr ON lr.id = ar.leave_request_id
...
COALESCE(SUM(ar.work_units) FILTER (
  WHERE ar.status IN ('on_leave','wfh','business_trip','holiday')
    AND NOT (lr.leave_type = 'unpaid' AND <trong phạm vi mốc>)
), 0) AS leave_paid_days,

COALESCE(SUM(ar.work_units) FILTER (
  WHERE lr.leave_type = 'unpaid' AND <trong phạm vi mốc>
), 0) AS unpaid_leave_days      -- CỘT MỚI
```

`<trong phạm vi mốc>` = `(<cfg> = '' OR ar.work_date >= <cfg>::date)` theo mục 1.

**Vì sao FK cứu được lịch sử:** `attendance_records.leave_request_id` đã tồn tại từ
migration 039 và luôn được ghi khi duyệt đơn → loại nghỉ gốc **chưa hề mất**.
Không cần nhập tay, không cần backfill.

**Cần kiểm tra trước khi code** — đếm số bản ghi mồ côi (nghỉ nhưng mất FK, có thể do
lần ghi đè trước đây):
```sql
SELECT COUNT(*) FROM attendance_records
 WHERE status = 'on_leave' AND leave_request_id IS NULL;
```
Nếu số này > 0, những ngày đó sẽ tiếp tục bị tính là nghỉ có lương (không phân loại được)
→ phải liệt kê ra và xử lý tay. **Bước này chạy trước, kết quả quyết định có phát sinh
thêm việc hay không.**

**Sửa kèm — `late_count` đang đếm sót:** cả 4 chỗ đều dùng
`COUNT(*) FILTER (WHERE ar.status = 'late')`, bỏ sót `late_and_early`
(người vừa đi trễ vừa về sớm không bị tính là đi trễ). Sửa thành
`WHERE ar.status IN ('late','late_and_early')` — cùng lúc, cùng 4 chỗ.

**Frontend cần hiện cột mới `unpaidLeaveDays`:**

| File | Dòng | Việc |
|------|------|------|
| `AttendanceAdmin.jsx` | 450–451 | Thêm định nghĩa cột "Nghỉ không lương" vào danh sách export |
| `AttendanceAdmin.jsx` | 485–486 | Thêm vào hàm format giá trị ô |
| `AttendanceAdmin.jsx` | 1673–1691 | Bảng tổng hợp — thêm cột |
| `AttendanceAdmin.jsx` | 3049–3050, 3152–3153 | 2 chỗ tính `work + leave` — rà lại, KHÔNG cộng unpaid |
| `report.service.js` | 244–255, `exportCustomSummary`, `exportDetailRecords` | 3 export Excel — thêm cột |
| `attendance.service.js` | 629–640 + template email | Email xác nhận — thêm dòng nghỉ không lương |

**Ảnh hưởng dữ liệu:** không ghi gì. Nhưng **đây là fix hồi tố** — số hiển thị của
các tháng cũ đổi ngay khi deploy (trừ khi đặt mốc ngày ở mục 1).

---

### FIX 4 — Thu hồi đơn nghỉ đã duyệt

**File:** `leave.service.js`, `leave.router.js`, `frontend/src/api/attendance.js`, `AttendanceAdmin.jsx`

**Hiện trạng:** `rejectLeaveRequest` (dòng 169) và `cancelLeaveRequest` (dòng 190) đều có
`AND status = 'pending'`. Đơn đã duyệt là trạng thái cuối — duyệt nhầm thì kẹt vĩnh viễn,
`attendance_records` giữ `on_leave` mãi.

**Cách sửa — backend:** thêm `revokeLeaveRequest(id, { reason, actorId })`:

1. `UPDATE ... SET status = 'cancelled' WHERE id = $1 AND status = 'approved'`
   — tái dùng giá trị enum `cancelled` đã có, **không cần migration enum**.
2. Ghi lý do vào `rejection_note` với tiền tố `[Thu hồi]` để phân biệt với từ chối thường.
3. Bắt buộc có `reason` (422 nếu rỗng) — cùng chuẩn với `resetCheckout` đã làm.
4. Chạy lại `calculateAttendanceRecord` cho mọi ngày trong khoảng đơn.
5. Gửi thông báo cho nhân viên (`createAndEmit`).

**Refactor kèm:** vòng lặp sinh danh sách ngày + `Promise.all(recalc)` hiện đang nằm
inline trong `approveLeaveRequest` (dòng 145–158). Tách thành `recalcRange(userId, start, end)`
dùng chung cho cả approve và revoke — tránh copy lần thứ hai.

**Route:** `PUT /leave-requests/:id/revoke`, middleware `...admin`. Thêm khối `@openapi`
theo đúng style các route lân cận.

**Frontend:**
- `api/attendance.js`: thêm `revokeLeaveRequest(id, body)`.
- `AttendanceAdmin.jsx` tab Nghỉ phép (~dòng 2629–2711): thêm nút **"Thu hồi"** trên
  dòng có `status === 'approved'`, mở modal nhập lý do (tái dùng modal của approve/reject
  ở dòng 2711–2723).

**Ảnh hưởng dữ liệu:** endpoint này **có ghi** — nhưng chỉ khi admin chủ động bấm,
và đó đúng là hành động admin muốn. Không có gì chạy tự động.

---

### FIX 5 — Lưu bảng lương xoá mất `attendance_summary`

**File:** `backend/src/modules/payroll/payroll.service.js` dòng 247

**Hiện trạng:**
```sql
components = EXCLUDED.components,     -- ghi đè NGUYÊN CỤC
```
`syncAttendanceToPayroll` ghi `components.attendance_summary`; `upsertRecord` ghi
`components.{allowanceItems, bonusItems}`. Cái nào chạy sau **xoá sạch** cái chạy trước.
Kết quả phụ thuộc thứ tự thao tác của người dùng.

**Cách sửa:**
```sql
components = COALESCE(payroll_records.components, '{}'::jsonb)
             || COALESCE(EXCLUDED.components, '{}'::jsonb),
```
`syncAttendanceToPayroll` đã dùng `||` sẵn (report.service.js:213) → sau fix, hai chiều
đều merge, hết phụ thuộc thứ tự.

**Lưu ý:** khi `upsertRecord` được gọi mà không có allowance/bonus item nào,
biến `components` = `null` (dòng 223–225). `COALESCE(..., '{}')` xử lý đúng ca này —
merge với object rỗng, giữ nguyên `attendance_summary`.

**Ảnh hưởng dữ liệu:** không ghi gì khi deploy. Từ đó về sau **bớt** mất dữ liệu.
Các bản ghi lương đã bị mất `attendance_summary` trước đây thì lấy lại bằng cách
bấm sync lại kỳ đó (nếu kỳ chưa `paid`).

---

## 3. Thứ tự thực hiện

| Bước | Nội dung | Có thể tự kiểm chứng? |
|------|----------|----------------------|
| 0 | Dump DB. Chạy câu đếm bản ghi mồ côi ở Fix 3 | — |
| 1 | Fix 5 (payroll merge) — độc lập, nhỏ nhất | Có |
| 2 | Fix 1 + Fix 2 (attendance.service.js) — cùng file, cùng hàm | Có |
| 3 | Fix 4 (revoke) — backend + FE | Có |
| 4 | Fix 3 backend (4 câu SQL + config mốc ngày) | Có |
| 5 | Fix 3 frontend (cột mới ở 6 chỗ + 3 export + email) | Có |
| 6 | Chạy checklist mục 4 | — |

Làm Fix 3 **sau cùng** là có chủ đích: nó là fix duy nhất hồi tố, nên khi số liệu
thay đổi ta biết chắc nguyên nhân đến từ đâu, không lẫn với 4 fix kia.

---

## 4. Checklist nghiệm thu

Theo bài học đã ghi nhận của dự án: **backend xanh chưa đủ — phải đi đúng đường người dùng đi.**
Frontend chưa có test framework, nên toàn bộ mục này làm thủ công qua UI.

### Fix 1 — admin nghỉ phép
- [ ] Tạo đơn nghỉ `annual` cho một tài khoản **admin**, ngày mai → duyệt bằng UI
- [ ] Mở lịch chấm công admin, ngày đó phải hiện **"Nghỉ phép"**, không phải "Có mặt"
- [ ] Đơn `wfh`/`business_trip` của admin → hiện WFH/Công tác, tổng công **không đổi**

### Fix 2 — không đè điều chỉnh tay
- [ ] Chọn 1 ngày, admin sửa tay giờ vào/ra (ghi lại giá trị)
- [ ] Tạo + duyệt đơn nghỉ phủ đúng ngày đó
- [ ] Mở lại ngày đó: giờ vào/ra **giữ nguyên**, `is_adjusted` vẫn `TRUE`
- [ ] Kiểm tra DB: `leave_request_id` **đã được gắn** dù `is_adjusted = TRUE`

### Fix 3 — nghỉ không lương
- [ ] Tạo + duyệt đơn `unpaid` 2 ngày cho 1 nhân viên
- [ ] Tab Báo cáo: "Nghỉ có lương" **không tăng**, cột "Nghỉ không lương" hiện **2.0**
- [ ] Tổng công = công thực tế + nghỉ có lương, **không** gồm 2 ngày unpaid
- [ ] Xuất Excel cả 3 loại (tổng hợp / chi tiết / nghỉ phép) — **mở file lên xem**, đủ cột
- [ ] Gửi email xác nhận thử 1 người — kiểm tra hộp thư, có dòng nghỉ không lương
- [ ] Đối chiếu: số ở tab Báo cáo == số ở email == số trong file Excel
- [ ] Đơn `sick`/`annual`/`compensatory` vẫn vào "Nghỉ có lương" như cũ (không vạ lây)

### Fix 4 — thu hồi đơn
- [ ] Duyệt 1 đơn → nút "Thu hồi" xuất hiện
- [ ] Bấm thu hồi, để trống lý do → phải báo lỗi
- [ ] Nhập lý do → đơn về `cancelled`, `rejection_note` có tiền tố `[Thu hồi]`
- [ ] Các ngày trong khoảng đơn quay về `absent`/`present` theo log thực tế
- [ ] Nhân viên nhận được thông báo

### Fix 5 — payroll
- [ ] Sync chấm công → kỳ lương, kiểm tra `components.attendance_summary` có mặt
- [ ] Sửa + lưu 1 bản ghi lương (thêm phụ cấp) → `attendance_summary` **vẫn còn**
- [ ] Sync lại lần nữa → `allowanceItems` **vẫn còn**

### Kiểm tra không vỡ chỗ khác
- [ ] Nút Check-in/Check-out trên Header hoạt động bình thường
- [ ] Trang MobileHome check-in bình thường
- [ ] Reset check-out (tính năng đã có) vẫn chạy
- [ ] Duyệt/từ chối đơn OT không bị ảnh hưởng

---

## 5. Phạm vi lan toả (đã quét toàn repo)

**Backend** — chỉ module `attendance` đụng `attendance_records` / `leave_requests`.
Ngoài ra chỉ `modules/dev/simulate.service.js` nhưng nó chỉ ghi cột `notes`, không vỡ.
Payroll **không** đọc trực tiếp `attendance_records` — chỉ nhận JSON qua sync,
và `base_salary` nhập tay ⇒ **không có nguy cơ lương tự nhảy số.**

**Frontend** — 5 file: `Attendance.jsx`, `AttendanceAdmin.jsx`,
`components/layout/CheckInWidget.jsx`, `MobileHome.jsx`, `Settings/AttendanceConfigSection.jsx`.

**Không đụng tới:** Công việc, Công ty, Dashboard, CDR, Phân công nội bộ, Báo cáo tiến độ.

---

## 6. Hoàn tác

| Tình huống | Cách lùi |
|------------|----------|
| Sai bất kỳ đâu | `git revert` — không có migration nên không cần lùi DB |
| Chỉ muốn tắt fix 3 | Đặt `attendance.strict_unpaid_from` = ngày tương lai xa — không cần deploy |
| Dữ liệu sai do thao tác | Restore từ dump ở bước 0 |

Không cần downtime. Không ảnh hưởng đăng nhập / phân quyền / check-in trong lúc deploy.

---

## 8. Nhật ký thi công (14/08/2026)

### File đã đổi

**Backend**
| File | Việc |
|------|------|
| `modules/attendance/aggregate.sql.js` | **MỚI** — nơi duy nhất định nghĩa biểu thức tổng hợp công + đọc config mốc ngày |
| `modules/attendance/attendance.service.js` | Đảo Step 5 (nghỉ phép) lên trước Step 5.5 (admin); guard `is_adjusted`; gỡ `leave_request_id` mồ côi; 2 truy vấn tổng hợp dùng `summaryColumns` |
| `modules/attendance/report.service.js` | 2 truy vấn tổng hợp dùng `summaryColumns`; `total_paid_days` không cộng nghỉ KL; 2 export thêm cột |
| `modules/attendance/leave.service.js` | Tách `recalcRange()`; thêm `revokeLeaveRequest()` |
| `modules/attendance/leave.router.js` | `PUT /leave-requests/:id/revoke` (admin) + openapi |
| `modules/attendance/settings.service.js` | Thêm khoá `attendance.strict_unpaid_from` (có validate YYYY-MM-DD) |
| `modules/attendance/attendance.controller.js` | Nhận `strictUnpaidFrom` ('' là giá trị hợp lệ) |
| `modules/attendance/attendance.router.js` | openapi cho khoá mới |
| `modules/payroll/payroll.service.js` | `components` MERGE thay vì ghi đè + phân biệt danh sách rỗng |
| `utils/emailTemplates.js` | Thêm dòng `{{unpaid_days}}`, đổi nhãn "Tổng công tính lương" |

**Frontend**
| File | Việc |
|------|------|
| `api/attendance.js` | `revokeLeaveRequest()` |
| `pages/Attendance/AttendanceAdmin.jsx` | Nút + modal Thu hồi; cột "Nghỉ không lương" ở bảng báo cáo, thẻ thống kê, chip xem trước email, danh sách cột export |
| `pages/Settings/AttendanceConfigSection.jsx` | Ô cấu hình mốc áp dụng (DateBox + Lưu + Xoá mốc) |

### Quyết định phát sinh cần biết

1. **Gom SQL sớm hơn plan.** Việc sửa đúng 4 bản sao bằng tay là nguồn lỗi lớn hơn giá trị của kỷ luật phạm vi, nên tạo `aggregate.sql.js` ngay. KHÔNG phải view DB (vẫn không migration) — chỉ là hằng chuỗi JS dùng chung.

2. **`COALESCE(..., FALSE)` là bắt buộc** trong vị ngữ unpaid. Ngày lễ / ngày đi làm không gắn đơn nghỉ → `lr.leave_type IS NULL` → phép so sánh trả NULL → `NOT NULL` = NULL → FILTER sẽ loại nhầm cả ngày lễ khỏi công hưởng lương. Đây là bẫy dễ bỏ sót nhất của fix này.

3. **Mốc ngày truyền dạng `$n::date IS NULL`**, JS đổi `''` → `null`. Không dùng `$n = ''` vì SQL không đảm bảo short-circuit và `''::date` sẽ ném lỗi.

4. **Gỡ `leave_request_id` khi ngày không còn đơn nghỉ.** Không có bước này, đơn bị thu hồi để lại FK mồ côi và fix 3 sẽ phân loại nhầm ngày đi làm bình thường thành nghỉ không lương. Phát hiện khi ghép Fix 3 với Fix 4.

5. **Email template có thể cần cập nhật tay.** `getTemplate()` ưu tiên bản lưu trong `system_configs`; nếu admin đã sửa template thì bản DB KHÔNG có `{{unpaid_days}}` → phải vào Cài đặt › Mẫu email lưu lại.

### Đã kiểm chứng trên DB local (14/08/2026)

Chạy thật trên `ke_toan_tam_an-postgres-1` + `ke_toan_tam_an-backend-1`.

| Hạng mục | Kết quả |
|----------|---------|
| `node --check` 8 file BE, require 9 module + `app.js` | Pass |
| `npm run build` frontend | Pass |
| Mọi class CSS mới dùng (`sa.confirmStatChipWarn`, `s.summaryWarning`, `s.tableWarning`, `s.req`, `s.btnOutline`…) | Tồn tại |
| Số cột bảng báo cáo | thead 10 / tbody 10 / tfoot 2+8 — khớp |
| **Bản ghi mồ côi** (`on_leave` mà `leave_request_id IS NULL`) | **0** — không phát sinh việc xử lý tay |
| `getMonthlyReport` + `getAttendanceSummary` chạy thật | Pass, hai hàm cho số **khớp nhau** |
| Đối chiếu cũ/mới | T7: nghỉ 7.0 → 2.0 có lương + 5.0 không lương · T8: 3.0 → 1.0 + 2.0 — **bảo toàn tổng, không thất thoát** |
| Bẫy `COALESCE` | Chứng minh bằng SQL: `NOT (NULL='unpaid')` = NULL (loại nhầm), `NOT COALESCE(…,FALSE)` = TRUE (đúng) |
| 2 export Excel sinh + đọc lại | Pass — có cột "Nghỉ không lương", "Tổng công tính lương" |
| `PUT /leave-requests/:id/revoke` | 401 (đã đăng ký, đúng như `/approve`) |
| Validate mốc ngày sai định dạng | Chặn đúng, HTTP 400 |

**Lỗi thật đã phát hiện & xử lý trong lúc kiểm chứng:**
1. `/revoke` ban đầu trả **404** — container backend chạy bản cũ trong bộ nhớ (code có mount nhưng process chưa nạp lại). Đã `docker compose restart backend` → 401. **Khi deploy phải restart backend, không chỉ copy code.**
2. **Template email đã bị tuỳ biến trong `system_configs` và KHÔNG có `{{unpaid_days}}`** → dòng nghỉ không lương sẽ không hiện trong email. Sửa `DEFAULTS` trong code không có tác dụng vì `getTemplate()` ưu tiên bản DB. Phải vá bản DB hoặc sửa qua Cài đặt › Mẫu email. **CHƯA XỬ LÝ.**

### Kiểm thử end-to-end qua HTTP (14/08/2026) — **40 PASS / 0 FAIL**

Chạy bằng token JWT thật, gọi đúng các endpoint mà giao diện gọi → phủ router + phân quyền + service.
Script: `scratchpad/qa_phase1.js` (Fix 1–4) và `qa_phase1b.js` (Fix 5 + hồi quy).

| Nhóm | Kết quả |
|------|---------|
| **Fix 1** | Admin tạo+duyệt đơn nghỉ → ngày đó `on_leave` (trước fix: `present` 1.0 công), `leave_request_id` được gắn |
| **Fix 2** | Nhập tay giờ 08:00–17:00 → duyệt đơn nghỉ phủ ngày đó → giờ vào/ra + status **giữ nguyên**, `leave_request_id` vẫn gắn |
| **Fix 3** | Duyệt đơn `unpaid` → nghỉ KL 0→1, nghỉ CL **không đổi**, tổng công tính lương **không tăng**; `/report` khớp `/records/summary` |
| **Fix 4** | Thiếu lý do→422 · nhân viên thu hồi→403 · admin→200 · đơn `cancelled` · `[Thu hồi]` trong note · ngày về `absent` · FK gỡ về NULL · báo cáo về số cũ · thu hồi lần 2→404 |
| **Fix 5** | `attendance_summary` có `unpaid_leave_days`; `total_paid_days` = TT + nghỉ CL · sửa lương → summary **còn** · sync lại → `allowanceItems` **còn** · xoá hết phụ cấp → thật sự rỗng |
| **Hồi quy** | Check-in/out, `/today`, reset check-out, tạo+duyệt OT, danh sách chấm công, danh sách đơn nghỉ — đều bình thường |

**Dọn dẹp:** xoá 3 đơn nghỉ test, 3 bản ghi ngày tương lai, 6 payroll_records, mọi log/adjustment gắn dấu.
Đối chiếu: `leave_requests` 9→9 · `attendance_records` 188→188 · `payroll_records` 0→0 · mồ côi 0. **DB về đúng nguyên trạng.**

**Ghi chú kỹ thuật:** `payroll.schema.js` đặt `allowanceItems: z.array(...).optional().default([])` → sau validate luôn là mảng, nên nhánh `sentItems` trong `upsertRecord` thực tế luôn đúng. Không phải lỗi, nhưng nếu sau này bỏ `.default([])` thì nhánh đó mới phát huy tác dụng.

**Còn phải làm tay (không tự động kiểm chứng được):**
- **Bấm nút thật trong trình duyệt** — dự án chưa có Playwright/Cypress nên không tự động hoá được phần render: nút "Thu hồi" có hiện trên dòng đơn đã duyệt không, modal có mở không, cột "Nghỉ không lương" có hiển thị đúng không, ô cấu hình mốc ngày trong Cài đặt có lưu được không.
- **Gửi email xác nhận thật** (cần template DB đã có `{{unpaid_days}}`).

**Ghi nhận thêm:** `saturdayMode = workday` — công ty CÓ làm thứ 7. Xác nhận lỗi `countWorkingDays` bỏ sót thứ 7 (`dow !== 6`) là có thật và đang ảnh hưởng: mọi đơn nghỉ trải qua thứ 7 đều thiếu ngày. Thuộc phạm vi GĐ2.

---

## 7. Liên quan

- `docs/013_CHAMCONG.md` — tài liệu module chấm công
- `docs/020_DYNAMIC_ENUM_AUDIT.md` — nền cho việc bỏ hardcode loại nghỉ ở GĐ2
- `docs/015_SIMULATE_ATTENDANCE.md` — công cụ sinh dữ liệu giả để test
- Giai đoạn 2 (chưa lập tài liệu): `leave_policies`, `day_part`, tách cột đơn vị công,
  view `v_attendance_daily`, quỹ phép năm
