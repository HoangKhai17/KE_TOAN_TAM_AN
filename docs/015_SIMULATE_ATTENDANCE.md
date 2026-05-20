# 015 — Kế Hoạch: Simulation API cho Chấm Công

> **Mục tiêu:** Implement một bộ API chỉ chạy trong môi trường development, cho phép giả lập dữ liệu chấm công theo ngày/tháng bất kỳ mà không cần chờ thời gian thực. Toàn bộ business logic (tính late_minutes, work_units, status) được thực thi bởi chính service thật — không bypass, không insert thủ công.

---

## 1. Vấn Đề Cần Giải Quyết

Hệ thống chấm công phụ thuộc vào thời gian thực:

```js
// attendance.service.js
const date = new Date().toISOString().slice(0, 10)   // luôn là "hôm nay"

// attendance_logs được ghi với NOW()
INSERT INTO attendance_logs (user_id, log_type, logged_at, ...)
VALUES ($1, $2, NOW(), ...)
```

**Hệ quả:** Không thể test kịch bản "nhân viên đi muộn ngày 15/5" mà không chờ đến ngày 15/5. Không thể tạo data thực tế cho cả tháng trong vài giây.

**Những gì hiện tại còn thiếu để test đúng:**

| Kịch bản | Vấn đề nếu insert thủ công |
|---|---|
| Đi muộn → late_minutes | Phải tự tính, dễ sai |
| Về sớm → early_minutes | Phải tự tính |
| work_units = 0.5 hay 1.0 | Phải biết công thức ratio |
| Status: late/early_leave/late_and_early | Phải tự gán đúng |
| Attendance_logs (audit trail) | Không có nếu insert thẳng vào records |

---

## 2. Giải Pháp: Dev Simulation API

### Nguyên tắc thiết kế

- **Không mock thời gian toàn cục** — không thay `new Date()` trong service thật
- **Tái sử dụng business logic thật** — gọi `calculateAndUpsertRecord()` có sẵn
- **Chỉ chạy trong development** — guard bằng `NODE_ENV !== 'production'`
- **Ghi đầy đủ audit trail** — insert `attendance_logs` với timestamp giả lập, sau đó recalculate

### Flow hoạt động

```
[Simulation API]
      │
      ├─ 1. Nhận input: { userId, date, checkInTime, checkOutTime }
      │
      ├─ 2. Xóa attendance_logs cũ của (userId, date) nếu có
      │
      ├─ 3. Insert attendance_log: log_type='check_in',  logged_at = date + checkInTime
      │
      ├─ 4. Insert attendance_log: log_type='check_out', logged_at = date + checkOutTime
      │
      ├─ 5. Gọi calculateAndUpsertRecord(userId, date)
      │         ↓
      │     (hệ thống đọc logs, tính late/early, work_units, status)
      │         ↓
      │     ghi vào attendance_records
      │
      └─ 6. Trả về attendance_record kết quả
```

---

## 3. Danh Sách File Cần Tạo / Sửa

```
backend/
├── src/
│   ├── modules/
│   │   └── dev/                              ← THƯ MỤC MỚI
│   │       ├── dev.router.js                 ← THÊM MỚI
│   │       └── simulate.service.js           ← THÊM MỚI
│   └── app.js                                ← SỬA: mount /dev router
│
frontend/
└── src/
    └── pages/
        └── Attendance/
            └── AttendanceAdmin.jsx           ← SỬA: thêm tab DevTools
```

---

## 4. Backend — Chi Tiết Implementation

### 4.1 `simulate.service.js`

**Hàm 1: `simulateDay({ userId, date, checkInTime, checkOutTime })`**

```js
// Input ví dụ:
// { userId: 'abc...', date: '2026-05-15', checkInTime: '08:25', checkOutTime: '17:10' }

// Bước 1: Xóa logs cũ (cho phép chạy lại)
DELETE FROM attendance_logs WHERE user_id=$1 AND logged_at::date=$2

// Bước 2: Insert check-in log với timestamp giả lập
INSERT INTO attendance_logs (user_id, log_type, logged_at, method)
VALUES ($1, 'check_in', CAST($2 + ' ' + $3 AS TIMESTAMP), 'simulation')

// Bước 3: Insert check-out log
INSERT INTO attendance_logs (user_id, log_type, logged_at, method)
VALUES ($1, 'check_out', CAST($2 + ' ' + $4 AS TIMESTAMP), 'simulation')

// Bước 4: Gọi hàm recalculate đã có sẵn
await calculateAndUpsertRecord(userId, date)
```

**Hàm 2: `simulateMonth({ userId, month, year, scenario })`**

```js
// scenario: 'perfect' | 'normal' | 'mixed'
// Lặp qua từng ngày workday trong tháng:
//   - Lấy work_schedule của ngày đó
//   - Nếu is_day_off → bỏ qua
//   - Nếu là workday → tạo checkIn/checkOut theo scenario

// Scenario 'perfect':  100% đúng giờ (08:00 - 17:00)
// Scenario 'normal':   90% đúng, 10% muộn ±15 phút
// Scenario 'mixed':    70% đúng, 20% muộn, 5% về sớm, 5% vắng
```

**Hàm 3: `simulateTeamMonth({ month, year, scenario })`**

Chạy `simulateMonth` cho tất cả active staff (không phải admin).

### 4.2 `dev.router.js`

```
POST /dev/simulate/day          — Giả lập 1 ngày, 1 người
POST /dev/simulate/month        — Giả lập 1 tháng, 1 người
POST /dev/simulate/team-month   — Giả lập 1 tháng, toàn bộ nhân viên
DELETE /dev/simulate/clear      — Xóa toàn bộ data giả lập của 1 tháng
GET  /dev/simulate/status       — Xem thống kê data hiện có theo tháng
```

### 4.3 Guard trong `app.js`

```js
// Chỉ mount khi không phải production
if (process.env.NODE_ENV !== 'production') {
  app.use('/dev', require('./modules/dev/dev.router'))
  logger.warn('⚠️  Dev simulation routes enabled — disable in production')
}
```

---

## 5. Frontend — Tab DevTools

Thêm tab **"Dev Tools"** vào `ADMIN_TABS` trong `AttendanceAdmin.jsx`:

- Chỉ hiển thị nếu `import.meta.env.DEV === true` (Vite tự set)
- Tab có badge màu cam "DEV" để phân biệt

### UI gồm 2 section:

**Section A — Giả lập 1 ngày:**

```
┌─────────────────────────────────────────────────────┐
│  Nhân viên: [dropdown]                              │
│  Ngày:      [date picker]                           │
│  Giờ vào:   [08:00]     Giờ ra: [17:00]            │
│  [Vắng mặt (không tạo log)]  [▶ Giả lập ngày này] │
└─────────────────────────────────────────────────────┘
```

**Section B — Giả lập cả tháng:**

```
┌─────────────────────────────────────────────────────┐
│  Nhân viên: [Tất cả nhân viên / chọn 1 người]      │
│  Tháng:     [Tháng 6] [2026]                        │
│  Kịch bản:  ○ Perfect  ● Normal  ○ Mixed            │
│                                                     │
│  [🗑 Xóa data tháng này]  [▶ Giả lập cả tháng]     │
└─────────────────────────────────────────────────────┘
```

---

## 6. Các Kịch Bản Test (Test Scenarios)

### Scenario A — Test tính năng "đi muộn"
```
Input:  userId=Nguyễn Thị Lan, date=2026-06-03 (Thứ 4)
        checkIn=08:25, checkOut=17:00
Expected:
  - late_minutes = 10  (25 phút muộn - 15 phút tolerance = 10)
  - status = 'late'
  - work_units = 1.0   (đủ giờ)
```

### Scenario B — Test tính năng "về sớm"
```
Input:  userId=Trần Văn Minh, date=2026-06-04
        checkIn=08:00, checkOut=16:30
Expected:
  - early_minutes = 15  (30 phút sớm - 15 tolerance)
  - status = 'early_leave'
  - work_units = 1.0
```

### Scenario C — Test "muộn + về sớm" (late_and_early)
```
Input:  checkIn=09:00, checkOut=16:00
Expected:
  - late_minutes  = 45
  - early_minutes = 45
  - status = 'late_and_early'
  - work_units = 0.5  (ratio = 7h / 8h = 0.875 → vẫn ≥ 0.8 → 1.0)
                       hoặc tùy shift
```

### Scenario D — Test ca Thứ 7 nửa ngày
```
Input:  userId=Bảo Phúc, date=2026-06-06 (Thứ 7)
        checkIn=08:00, checkOut=12:00
Expected:
  - shift = Ca hàng chính - Nửa ngày (4h)
  - actual_hours = 4.0
  - work_units = 1.0  (4/4 = 1.0)
  - status = 'present'
```

### Scenario E — Test báo cáo tháng sau khi giả lập
```
1. Giả lập tháng 6/2026 với scenario 'mixed' cho toàn nhân viên
2. Vào tab Báo cáo → Tháng 6/2026
3. Kiểm tra: số ngày công, số vắng, số muộn có hợp lý không
4. Click "Đồng bộ vào Bảng Lương" → chọn kỳ lương T6/2026
5. Kiểm tra bảng lương đã nhận attendance_summary
```

### Scenario F — Test giả lập → xóa → giả lập lại
```
1. Giả lập tháng 6 với 'perfect'
2. Vào Lịch chấm công → xác nhận 100% xanh
3. Click "Xóa data tháng này"
4. Giả lập lại với 'mixed'
5. Xác nhận có ngày vắng, ngày muộn xuất hiện
```

---

## 7. Vấn Đề Cần Lưu Ý Khi Implement

### 7.1 `calculateAndUpsertRecord` cần được export

Hàm này hiện đang là hàm nội bộ trong `attendance.service.js`. Cần export ra để `simulate.service.js` gọi được:

```js
// attendance.service.js — thêm vào module.exports
module.exports = {
  checkIn, checkOut, getToday,
  listAttendanceRecords, getAttendanceSummary,
  calculateAndUpsertRecord,   // ← thêm dòng này
}
```

### 7.2 Xử lý ngày trong quá khứ

`checkIn()` hiện có check "không chấm công ngày cũ" (hoặc không — cần verify). Simulation service bypass check này bằng cách ghi thẳng vào `attendance_logs` với timestamp giả lập.

### 7.3 Tháng chưa có work_schedules

Nếu gọi `simulateMonth` cho tháng 6 mà nhân viên chưa có `work_schedules` → simulation service tự gọi `generateMonthlySchedule` trước.

### 7.4 Conflict với data thật

Nếu một ngày đã có attendance_record thật (do nhân viên check-in thật) → simulation sẽ overwrite. `DELETE /dev/simulate/clear` chỉ xóa records có `notes LIKE '%simulation%'` để tránh xóa nhầm data thật.

---

## 8. Thứ Tự Implementation

```
Bước 1:  Export calculateAndUpsertRecord từ attendance.service.js
Bước 2:  Tạo simulate.service.js với simulateDay()
Bước 3:  Tạo dev.router.js với POST /dev/simulate/day
Bước 4:  Mount /dev router vào app.js (dev only)
Bước 5:  Test endpoint bằng curl/Postman cho Scenario A, B, C
Bước 6:  Implement simulateMonth() + simulateTeamMonth()
Bước 7:  Test các endpoint month với Scenario D, E
Bước 8:  Thêm tab DevTools vào AttendanceAdmin.jsx
Bước 9:  Test toàn bộ flow qua UI (Scenario E, F)
Bước 10: Viết seed script tự động (optional) chạy 1 lệnh tạo 6 tháng data
```

---

## 9. Ước Tính Effort

| Phần | Effort |
|---|---|
| simulate.service.js (simulateDay + simulateMonth) | ~2–3 giờ |
| dev.router.js + mount vào app.js | ~30 phút |
| Frontend DevTools tab | ~1–2 giờ |
| Test + debug các scenarios | ~1 giờ |
| **Tổng** | **~5–6 giờ** |

---

## 10. Kết Quả Sau Khi Hoàn Thành

```bash
# Giả lập 1 ngày (curl)
curl -X POST http://localhost:3000/dev/simulate/day \
  -H "Content-Type: application/json" \
  -d '{ "userId": "abc...", "date": "2026-06-10", "checkInTime": "08:25", "checkOutTime": "17:00" }'

# Giả lập cả tháng cho toàn nhân viên (1 click từ UI)
curl -X POST http://localhost:3000/dev/simulate/team-month \
  -H "Content-Type: application/json" \
  -d '{ "month": 6, "year": 2026, "scenario": "mixed" }'

# Kết quả: ~130 attendance_records với late_minutes, work_units, status
# được tính đúng bởi business logic thật — sẵn sàng test báo cáo và payroll sync
```
