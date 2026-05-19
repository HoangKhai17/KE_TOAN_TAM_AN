# 07 — Tính Năng Chấm Công Nội Bộ

> **Mục tiêu tài liệu:** Prompt tài liệu đầy đủ để Claude Code implement module chấm công từ DB schema → backend API → frontend UI, tích hợp vào hệ thống KẾ TOÁN TÂM AN hiện có.
>
> **Phạm vi:** Chấm công nội bộ cho nhân viên kế toán của **Tâm An** (không phải cho khách hàng). Quy mô nhỏ (~5–20 nhân viên), văn phòng cố định, có thể WFH.
>
> **Stack hiện tại:** PostgreSQL 16, Node.js backend (API), Next.js frontend, Tailwind CSS.
>
> **Tích hợp với schema hiện có:** Sử dụng lại bảng `users`, `payroll_periods`, `payroll_records`, `audit_logs`, `system_configs`.

---

## 1. Tổng Quan Flow Quy Trình Chấm Công

### 1.1 Flow Hàng Ngày (Per-Day Flow)

```
[Nhân viên]
    │
    ├─► CHECK-IN (sáng)
    │       │
    │       ▼
    │   Hệ thống ghi attendance_logs
    │   (timestamp UTC, device, method)
    │       │
    │       ▼
    │   Tra cứu ca làm việc hôm nay
    │   (work_schedules → shifts)
    │       │
    │       ├── Tìm thấy ca ──────────────────────────────────────┐
    │       │                                                       │
    │       └── Không có ca → ghi status='unscheduled'             │
    │           → flag cho admin xử lý                             │
    │                                                               ▼
    │                                               Kiểm tra giờ check-in
    │                                                               │
    │                                    ┌──────────────┬──────────┴──────────────┐
    │                                    ▼              ▼                          ▼
    │                              Đúng giờ        Trễ giờ                   Sớm giờ
    │                           status='present'  status='late'          (ghi nhận, ít gặp)
    │                                    │         late_minutes=N                  │
    │                                    └──────────────┼──────────────────────────┘
    │                                                   ▼
    │                               Ghi attendance_records (ngày hôm nay)
    │                               status · check_in_time · shift_id
    │
    ├─► LÀM VIỆC (trong ngày)
    │   [Không cần thao tác hệ thống]
    │
    └─► CHECK-OUT (chiều)
            │
            ▼
        Ghi attendance_logs (log_type='check_out')
            │
            ▼
        Cập nhật attendance_records:
        check_out_time · actual_hours · early_minutes (nếu về sớm)
            │
            ▼
        Tính work_units cho ngày:
        ≥ 80% → 1.0 | ≥ 50% → 0.5 | < 50% → 0.0
```

### 1.2 Flow Cuối Kỳ (Kết Nối Payroll)

```
[Admin / Manager]
    │
    ▼
Mở kỳ lương (payroll_periods đã có)
    │
    ▼
Tổng hợp chấm công kỳ:
    - Đếm ngày công (SUM work_units)
    - Đếm ngày nghỉ phép (leave_requests approved)
    - Đếm ngày OT (overtime_requests approved)
    - Đếm ngày absent (status='absent')
    │
    ▼
Xem báo cáo chấm công tổng hợp per nhân viên
    │
    ▼
[Nhân viên] xem bảng công của mình, yêu cầu điều chỉnh nếu sai
    │
    ▼
[Admin] duyệt / từ chối điều chỉnh
    │
    ▼
Chốt bảng công → link sang payroll_records
(cập nhật trường attendance_summary vào payroll_records.components)
    │
    ▼
Confirm kỳ lương → Paid
```

### 1.3 Flow Nghỉ Phép / OT

```
[Nhân viên tạo đơn]                     [Admin duyệt]
    │                                         │
    ▼                                         │
leave_requests / overtime_requests            │
status = 'pending'                            │
    │                                         │
    └──── gửi thông báo ──────────────────►  Admin nhận notification
                                              │
                                    ┌─────────┴─────────┐
                                    ▼                   ▼
                               Duyệt (approved)    Từ chối (rejected)
                                    │                   │
                                    ▼                   ▼
                          Cập nhật attendance_records  Gửi thông báo NV
                          status = 'on_leave' / OT ghi nhận
```

---

## 2. Nghiệp Vụ & Quy Tắc

### 2.1 Loại Ca Làm Việc

| Loại ca | Mô tả | Cấu hình |
|---------|--------|----------|
| `fixed` | Ca cố định (điển hình: 8:00–17:00) | start_time, end_time, break_minutes |
| `flexible` | Linh hoạt giờ vào-ra, chỉ cần đủ tổng giờ | required_hours_per_day |

> **Tâm An context:** Chủ yếu dùng ca `fixed`. Ca `flexible` áp dụng cho nhân viên WFH theo thỏa thuận riêng.

### 2.2 Xác Định Đúng Giờ / Trễ

```
tolerance_in  = số phút cho phép trễ (default: 15 phút, config được)
tolerance_out = số phút về sớm được phép (default: 15 phút)

Trường hợp check-in:
  - check_in_time ≤ shift.start_time + tolerance_in  → status = 'present'
  - check_in_time > shift.start_time + tolerance_in  → status = 'late'
    late_minutes = check_in_time − shift.start_time − tolerance_in

Trường hợp check-out:
  - check_out_time ≥ shift.end_time − tolerance_out  → không ghi early_minutes
  - check_out_time < shift.end_time − tolerance_out  → ghi early_minutes
    early_minutes = shift.end_time − tolerance_out − check_out_time
```

### 2.3 Tính Giờ Thực & Ngày Công

```
actual_hours = (check_out_time − check_in_time) − shift.break_minutes / 60

required_hours = shift.end_time − shift.start_time − shift.break_minutes / 60

work_units:
  actual_hours / required_hours ≥ 0.8  → 1.0 ngày công
  actual_hours / required_hours ≥ 0.5  → 0.5 ngày công
  actual_hours / required_hours < 0.5  → 0.0 ngày công

Ghi chú:
  - Ngày nghỉ phép được duyệt → work_units = 1.0 (không trừ công)
  - Nghỉ không phép (absent) → work_units = 0.0
  - Ngày lễ quốc gia (public_holidays) → work_units = 1.0, is_holiday = true
```

### 2.4 Overtime (OT)

```
Quy tắc OT:
  - Nhân viên PHẢI tạo đơn OT TRƯỚC khi làm thêm (hoặc trong ngày làm)
  - Admin duyệt → OT được ghi nhận vào bảng công

OT rates (tham chiếu luật lao động VN):
  - Ngày thường:   × 1.5
  - Cuối tuần:     × 2.0
  - Ngày lễ quốc gia: × 3.0

OT qua midnight:
  - Tách thành segments theo mốc 00:00
  - Mỗi segment tính rate theo ngày tương ứng (ngày thường vs cuối tuần vs lễ)
  - overtime_records: nhiều rows cho 1 đêm OT qua ngày
```

### 2.5 Trạng Thái Bảng Công (Attendance Status Enum)

| Status | Mô tả |
|--------|--------|
| `present` | Đi làm đúng giờ |
| `late` | Đi trễ (late_minutes > tolerance_in) |
| `early_leave` | Về sớm (early_minutes > tolerance_out) |
| `late_and_early` | Vừa trễ vừa về sớm |
| `absent` | Vắng mặt không phép |
| `on_leave` | Nghỉ phép được duyệt (annual, sick, compensatory) |
| `business_trip` | Công tác |
| `wfh` | Làm tại nhà (Work From Home) |
| `holiday` | Ngày lễ quốc gia |
| `unscheduled` | Không có lịch ca — chờ admin xử lý |

### 2.6 Loại Nghỉ Phép

| Loại | Code | Có tính công? | Yêu cầu giấy tờ? |
|------|------|---------------|------------------|
| Phép năm | `annual` | Có (1.0) | Không |
| Nghỉ bệnh | `sick` | Có (1.0) | Giấy khám bệnh nếu > 2 ngày |
| Nghỉ bù OT | `compensatory` | Có (1.0) | Không (link với OT đã được duyệt) |
| Nghỉ không phép | `unpaid` | Không (0.0) | — |
| Công tác | `business_trip` | Có (1.0) | Không |
| WFH | `wfh` | Có (1.0, check-in qua app) | Không |

### 2.7 Phương Thức Check-in

Vì Tâm An là văn phòng nhỏ, ưu tiên đơn giản:

| Phương thức | Code | Ghi chú |
|-------------|------|---------|
| Web app (trong văn phòng) | `web` | IP/location validate tùy chọn |
| Mobile app | `mobile` | Cho WFH / đi công tác |
| Admin nhập thủ công | `manual` | Khi quên check-in, admin điều chỉnh |

### 2.8 Quy Tắc Tính Lương Từ Chấm Công

Khi chốt kỳ lương, dữ liệu chấm công feed vào `payroll_records` như sau:

```
actual_work_days   = SUM(work_units) WHERE status IN ('present','late','early_leave','late_and_early')
leave_paid_days    = SUM(work_units) WHERE status IN ('on_leave','wfh','business_trip','holiday')
absent_days        = COUNT(*) WHERE status = 'absent'
total_paid_days    = actual_work_days + leave_paid_days

Công thức lương cơ bản theo ngày công:
  daily_rate = base_salary / standard_work_days_in_month (thường là 26 ngày)
  salary_by_attendance = daily_rate × total_paid_days

OT pay = SUM(ot_hours × hourly_rate × ot_rate) cho các overtime_records được duyệt

Ghi vào payroll_records.components:
  {
    "attendance_summary": {
      "actual_work_days": 22,
      "leave_paid_days": 2,
      "absent_days": 1,
      "total_paid_days": 24,
      "late_count": 3,
      "ot_hours": 4.5,
      "ot_pay": 300000
    }
  }
```

---

## 3. DB Schema — Bảng Mới Cần Tạo

> **Lưu ý cho Claude Code:**
> - KHÔNG sửa các bảng đã có trong `05_DATABASE_SCHEMA.md`
> - Tất cả UUID dùng `gen_random_uuid()` theo convention hiện tại
> - Timestamp dùng `TIMESTAMP` (không có timezone) theo convention hiện tại
> - Thêm vào cuối file migration mới: `migrations/008_attendance_module.sql`

### 3.1 ENUM Types Mới

```sql
-- Trạng thái bảng công ngày
CREATE TYPE attendance_status AS ENUM (
  'present',        -- Đi làm đúng giờ
  'late',           -- Trễ
  'early_leave',    -- Về sớm
  'late_and_early', -- Vừa trễ vừa về sớm
  'absent',         -- Vắng không phép
  'on_leave',       -- Nghỉ phép
  'business_trip',  -- Công tác
  'wfh',            -- WFH
  'holiday',        -- Ngày lễ
  'unscheduled'     -- Không có ca, chờ xử lý
);

-- Loại nghỉ phép
CREATE TYPE leave_type AS ENUM (
  'annual',         -- Phép năm
  'sick',           -- Nghỉ bệnh
  'compensatory',   -- Nghỉ bù OT
  'unpaid',         -- Không phép
  'business_trip',  -- Công tác
  'wfh'             -- WFH
);

-- Trạng thái đơn (dùng chung cho leave + OT request)
CREATE TYPE request_status AS ENUM (
  'pending',    -- Chờ duyệt
  'approved',   -- Đã duyệt
  'rejected',   -- Từ chối
  'cancelled'   -- Nhân viên huỷ
);

-- Loại ca
CREATE TYPE shift_type AS ENUM (
  'fixed',     -- Ca cố định
  'flexible'   -- Linh hoạt
);

-- Phương thức check-in
CREATE TYPE checkin_method AS ENUM (
  'web',     -- Web app
  'mobile',  -- Mobile app
  'manual'   -- Admin nhập tay
);

-- Loại log chấm công
CREATE TYPE attendance_log_type AS ENUM (
  'check_in',
  'check_out'
);
```

### 3.2 TABLE: shifts (Ca Làm Việc)

```sql
CREATE TABLE shifts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(100) NOT NULL,           -- 'Ca Hành Chính', 'Ca Sáng', ...
  shift_type        shift_type NOT NULL DEFAULT 'fixed',
  start_time        TIME,                            -- NULL nếu flexible
  end_time          TIME,                            -- NULL nếu flexible
  break_minutes     INTEGER NOT NULL DEFAULT 60,     -- Giờ nghỉ trưa (tính bằng phút)
  required_hours    NUMERIC(4,2),                    -- Cho ca flexible: số giờ yêu cầu mỗi ngày
  tolerance_in      INTEGER NOT NULL DEFAULT 15,     -- Phút trễ cho phép (không tính trễ)
  tolerance_out     INTEGER NOT NULL DEFAULT 15,     -- Phút về sớm cho phép
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_by        UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO shifts (id, name, shift_type, start_time, end_time, break_minutes, tolerance_in, tolerance_out, created_by)
VALUES (
  gen_random_uuid(),
  'Ca Hành Chính',
  'fixed',
  '08:00:00',
  '17:00:00',
  60,
  15,
  15,
  (SELECT id FROM users WHERE role = 'admin' LIMIT 1)
);
```

### 3.3 TABLE: work_schedules (Lịch Ca Theo Nhân Viên)

```sql
-- Lịch ca từng ngày cho từng nhân viên.
-- Scheduler hoặc admin tạo trước theo tháng.
-- Nếu is_day_off = true → ngày nghỉ lịch (T7, CN hoặc nghỉ bù thoả thuận)
CREATE TABLE work_schedules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_date     DATE NOT NULL,
  shift_id      UUID REFERENCES shifts(id) ON DELETE SET NULL,
  is_day_off    BOOLEAN NOT NULL DEFAULT FALSE,   -- TRUE: ngày nghỉ, không cần check-in
  notes         TEXT,
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, work_date)
);

CREATE INDEX idx_ws_user_date  ON work_schedules(user_id, work_date);
CREATE INDEX idx_ws_date       ON work_schedules(work_date);
CREATE INDEX idx_ws_shift      ON work_schedules(shift_id);
```

### 3.4 TABLE: attendance_logs (Raw Log Chấm Công — Append-Only)

```sql
-- Bảng raw log — KHÔNG BAO GIỜ UPDATE/DELETE.
-- Mọi lần check-in/out đều append một row mới.
-- Khi tính toán: MIN(timestamp) WHERE log_type='check_in' = giờ vào, MAX(timestamp) WHERE log_type='check_out' = giờ ra.
CREATE TABLE attendance_logs (
  id            BIGSERIAL PRIMARY KEY,             -- bigserial cho volume cao
  user_id       UUID NOT NULL REFERENCES users(id),
  log_type      attendance_log_type NOT NULL,
  logged_at     TIMESTAMP NOT NULL DEFAULT NOW(),  -- Thời điểm thực tế ghi nhận
  method        checkin_method NOT NULL DEFAULT 'web',
  device_info   VARCHAR(200),                      -- Browser UA, mobile device name
  ip_address    INET,
  notes         TEXT,                              -- Ghi chú nếu admin nhập tay
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_al_user_date ON attendance_logs(user_id, logged_at);
CREATE INDEX idx_al_logged_at ON attendance_logs(logged_at DESC);

-- Row security: không ai DELETE được
REVOKE DELETE ON attendance_logs FROM PUBLIC;
```

### 3.5 TABLE: attendance_records (Bảng Công Ngày — 1 Row Per Nhân Viên Per Ngày)

```sql
-- Bảng được tính toán và lưu lại sau mỗi ngày làm việc.
-- Được tạo/cập nhật tự động khi nhân viên check-in/out.
-- Admin có thể chỉnh sửa (sẽ ghi vào attendance_adjustments).
CREATE TABLE attendance_records (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id),
  work_date         DATE NOT NULL,
  shift_id          UUID REFERENCES shifts(id) ON DELETE SET NULL,

  -- Thời gian thực tế
  check_in_time     TIMESTAMP,                     -- NULL nếu absent hoặc không check-in
  check_out_time    TIMESTAMP,                     -- NULL nếu chưa check-out
  actual_hours      NUMERIC(4,2),                  -- Tổng giờ thực tế (trừ break)

  -- Lệch so với ca
  late_minutes      INTEGER NOT NULL DEFAULT 0,    -- Phút trễ (0 nếu đúng giờ)
  early_minutes     INTEGER NOT NULL DEFAULT 0,    -- Phút về sớm (0 nếu đúng giờ)

  -- Kết quả tính toán
  work_units        NUMERIC(3,1) NOT NULL DEFAULT 0.0, -- 0.0 | 0.5 | 1.0
  status            attendance_status NOT NULL DEFAULT 'absent',

  -- Metadata
  is_adjusted       BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE nếu admin đã điều chỉnh
  is_holiday        BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE nếu ngày lễ
  leave_request_id  UUID REFERENCES leave_requests(id) ON DELETE SET NULL,
  ot_hours          NUMERIC(4,2) NOT NULL DEFAULT 0, -- Tổng giờ OT được duyệt trong ngày này
  notes             TEXT,

  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, work_date)
);

CREATE INDEX idx_ar_user_date   ON attendance_records(user_id, work_date);
CREATE INDEX idx_ar_date        ON attendance_records(work_date);
CREATE INDEX idx_ar_status      ON attendance_records(status);
CREATE INDEX idx_ar_period      ON attendance_records(work_date, user_id)
  WHERE status NOT IN ('holiday');
```

### 3.6 TABLE: leave_requests (Đơn Nghỉ Phép)

```sql
CREATE TABLE leave_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  leave_type      leave_type NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  total_days      NUMERIC(4,1) NOT NULL,           -- Tính khi tạo đơn (trừ T7, CN, lễ)
  reason          TEXT,
  status          request_status NOT NULL DEFAULT 'pending',
  approved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at     TIMESTAMP,
  rejection_note  TEXT,                            -- Lý do từ chối
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),

  CHECK (end_date >= start_date)
);

CREATE INDEX idx_lr_user     ON leave_requests(user_id);
CREATE INDEX idx_lr_status   ON leave_requests(status);
CREATE INDEX idx_lr_dates    ON leave_requests(start_date, end_date);
```

### 3.7 TABLE: overtime_requests (Đơn OT)

```sql
CREATE TABLE overtime_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  ot_date         DATE NOT NULL,
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  ot_hours        NUMERIC(4,2) NOT NULL,           -- Tính tự động từ start-end (trừ break nếu > 4h)
  ot_rate         NUMERIC(3,1) NOT NULL,           -- 1.5 | 2.0 | 3.0 (tính tự động theo ngày)
  reason          TEXT,
  status          request_status NOT NULL DEFAULT 'pending',
  approved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at     TIMESTAMP,
  rejection_note  TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_or_user   ON overtime_requests(user_id);
CREATE INDEX idx_or_status ON overtime_requests(status);
CREATE INDEX idx_or_date   ON overtime_requests(ot_date);
```

### 3.8 TABLE: attendance_adjustments (Điều Chỉnh Bảng Công — Audit Trail)

```sql
-- Mỗi lần admin chỉnh sửa attendance_records → tạo 1 row tại đây.
-- KHÔNG BAO GIỜ xóa row này. Là audit trail bất biến.
CREATE TABLE attendance_adjustments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_record_id    UUID NOT NULL REFERENCES attendance_records(id),
  field_name              VARCHAR(80) NOT NULL,     -- Tên cột bị sửa: 'check_in_time', 'status', ...
  before_value            TEXT,
  after_value             TEXT,
  reason                  TEXT NOT NULL,
  adjusted_by             UUID NOT NULL REFERENCES users(id),
  adjusted_at             TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_adj_record ON attendance_adjustments(attendance_record_id);
CREATE INDEX idx_adj_by     ON attendance_adjustments(adjusted_by);

REVOKE UPDATE, DELETE ON attendance_adjustments FROM PUBLIC;
```

### 3.9 TABLE: public_holidays (Ngày Lễ Quốc Gia)

```sql
CREATE TABLE public_holidays (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date  DATE NOT NULL UNIQUE,
  name          VARCHAR(200) NOT NULL,              -- 'Tết Dương Lịch', 'Giỗ Tổ Hùng Vương', ...
  ot_multiplier NUMERIC(3,1) NOT NULL DEFAULT 3.0, -- Hệ số OT ngày lễ
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ph_date ON public_holidays(holiday_date);

-- Seed data ngày lễ 2026 (Việt Nam)
INSERT INTO public_holidays (holiday_date, name, ot_multiplier) VALUES
  ('2026-01-01', 'Tết Dương Lịch', 3.0),
  ('2026-01-27', 'Tết Nguyên Đán (29 Tháng Chạp)', 3.0),
  ('2026-01-28', 'Tết Nguyên Đán (30 Tháng Chạp)', 3.0),
  ('2026-01-29', 'Tết Nguyên Đán (Mùng 1)', 3.0),
  ('2026-01-30', 'Tết Nguyên Đán (Mùng 2)', 3.0),
  ('2026-01-31', 'Tết Nguyên Đán (Mùng 3)', 3.0),
  ('2026-02-01', 'Tết Nguyên Đán (Mùng 4)', 3.0),
  ('2026-02-02', 'Tết Nguyên Đán (Mùng 5)', 3.0),
  ('2026-04-16', 'Giỗ Tổ Hùng Vương (10/3 AL)', 3.0),
  ('2026-04-30', 'Giải Phóng Miền Nam', 3.0),
  ('2026-05-01', 'Quốc Tế Lao Động', 3.0),
  ('2026-09-02', 'Quốc Khánh', 3.0),
  ('2026-09-03', 'Quốc Khánh (nghỉ bù)', 3.0);
```

### 3.10 Thêm Cột Vào Bảng Hiện Có

```sql
-- Thêm default_shift_id vào bảng users (ca làm việc mặc định)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS default_shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS annual_leave_days NUMERIC(4,1) NOT NULL DEFAULT 12.0; -- Số ngày phép năm

-- Thêm attendance_period_id vào payroll_records để link bảng công đã chốt
-- (Không cần bảng mới — dùng JSONB components đã có)
-- Chỉ cần convention: thêm key "attendance_summary" vào payroll_records.components
-- Xem mục 2.8 ở trên.
```

---

## 4. API Endpoints Cần Build

> Convention: `GET /api/v1/attendance/...` — tất cả require JWT auth header.
> Admin endpoints require `role = 'admin'`.

### 4.1 Shifts (Ca Làm Việc)
```
GET    /api/v1/shifts                    → Danh sách ca (admin)
POST   /api/v1/shifts                    → Tạo ca mới (admin)
PUT    /api/v1/shifts/:id                → Cập nhật ca (admin)
```

### 4.2 Work Schedules (Lịch Ca)
```
GET    /api/v1/work-schedules?userId=&month=&year=   → Lịch ca tháng (cá nhân hoặc admin xem all)
POST   /api/v1/work-schedules/bulk                   → Tạo lịch ca cả tháng cho một NV (admin)
```

### 4.3 Attendance (Check-in/out & Bảng Công)
```
POST   /api/v1/attendance/check-in                   → Nhân viên check-in
POST   /api/v1/attendance/check-out                  → Nhân viên check-out
GET    /api/v1/attendance/today                      → Trạng thái check-in hôm nay (cá nhân)
GET    /api/v1/attendance/records?userId=&month=&year=  → Bảng công tháng
GET    /api/v1/attendance/records/summary?month=&year=  → Tổng hợp tất cả NV (admin)
PUT    /api/v1/attendance/records/:id/adjust         → Điều chỉnh bảng công (admin)
```

### 4.4 Leave Requests (Đơn Nghỉ Phép)
```
GET    /api/v1/leave-requests?status=&userId=        → Danh sách đơn
POST   /api/v1/leave-requests                        → Tạo đơn nghỉ
PUT    /api/v1/leave-requests/:id/approve            → Duyệt đơn (admin)
PUT    /api/v1/leave-requests/:id/reject             → Từ chối đơn (admin)
DELETE /api/v1/leave-requests/:id                    → Huỷ đơn (chính chủ, chỉ khi pending)
```

### 4.5 Overtime Requests (Đơn OT)
```
GET    /api/v1/overtime-requests?status=&userId=     → Danh sách đơn OT
POST   /api/v1/overtime-requests                     → Tạo đơn OT
PUT    /api/v1/overtime-requests/:id/approve         → Duyệt OT (admin)
PUT    /api/v1/overtime-requests/:id/reject          → Từ chối OT (admin)
```

### 4.6 Reporting & Payroll Integration
```
GET    /api/v1/attendance/report?month=&year=        → Báo cáo tổng hợp tháng (admin)
POST   /api/v1/attendance/sync-payroll               → Đồng bộ dữ liệu chấm công → payroll_records (admin)
GET    /api/v1/attendance/holidays?year=             → Danh sách ngày lễ
POST   /api/v1/attendance/holidays                   → Thêm ngày lễ (admin)
```

---

## 5. Xử Lý Ngoại Lệ

### 5.1 Quên Check-in hoặc Check-out
**Tình huống:** Nhân viên đến làm nhưng quên bấm check-in sáng hoặc check-out chiều.

**Xử lý:**
1. Nhân viên vào trang "Bảng công của tôi", thấy ngày bị đánh dấu `absent` hoặc thiếu checkout.
2. Nhân viên bấm "Yêu cầu điều chỉnh" → nhập thời gian thực tế + lý do.
3. Admin nhận notification → vào trang "Duyệt điều chỉnh" → Approve / Reject.
4. Khi approve: ghi `attendance_logs` thêm 1 row với `method='manual'`, cập nhật `attendance_records`, ghi `attendance_adjustments` (audit trail).
5. `is_adjusted = TRUE` trên record đó.

**Backend logic:**
```
POST /api/v1/attendance/records/:id/adjust
Body: {
  field: "check_in_time" | "check_out_time" | "status",
  new_value: "2026-05-15T08:30:00",
  reason: "Quên check-in do họp khách hàng sáng sớm"
}

→ Ghi attendance_adjustments (before, after, reason, adjusted_by)
→ Cập nhật attendance_records
→ Tính lại actual_hours, work_units, late_minutes
→ Set is_adjusted = TRUE
```

### 5.2 Check-in Nhiều Lần (Bấm Nhầm)
**Xử lý:**
- Giữ nguyên toàn bộ rows trong `attendance_logs` (append-only).
- Khi tính toán: lấy `MIN(logged_at) WHERE log_type='check_in'` và `MAX(logged_at) WHERE log_type='check_out'`.
- UI hiển thị: "Ghi nhận 2 lần check-in. Sử dụng lần đầu tiên lúc 08:03."

### 5.3 Nhân Viên Không Có Lịch Ca (unscheduled)
**Xử lý:**
- Check-in thành công, nhưng `attendance_records.status = 'unscheduled'`.
- Tạo notification cho admin: "Nhân viên X check-in lúc 08:05 nhưng không có lịch ca ngày Y".
- Admin vào xử lý: gán ca → hệ thống tự tính lại record → cập nhật status.
- Không block UX check-in để tránh nhân viên không check-in được.

### 5.4 Chốt Lương Khi Có Bảng Công Chưa Đầy Đủ
**Xử lý:**
- Trước khi sync sang payroll, hệ thống kiểm tra: còn ngày nào trong kỳ có `status='unscheduled'` hoặc `check_out_time IS NULL` không?
- Nếu có → hiển thị cảnh báo danh sách các ngày chưa đủ dữ liệu.
- Admin chọn: "Bỏ qua và tiếp tục" hoặc "Dừng lại để xử lý từng trường hợp".

### 5.5 WFH / Công Tác
**Xử lý:**
1. Nhân viên tạo đơn `leave_requests` với `leave_type = 'wfh'` hoặc `'business_trip'`.
2. Admin duyệt trước ngày làm việc.
3. Nhân viên check-in qua mobile/web bình thường (không validate IP/location ở bước này).
4. `attendance_records.status = 'wfh'` hoặc `'business_trip'`, `work_units = 1.0`.

### 5.6 Ngày Lễ Quốc Gia
**Xử lý:**
- Mỗi ngày khi sinh `attendance_records`, JOIN với `public_holidays`.
- Nếu trùng: `is_holiday = TRUE`, `status = 'holiday'`, `work_units = 1.0`.
- Nếu nhân viên vẫn làm ngày lễ: tạo `overtime_requests` với rate tự động = 3.0.

### 5.7 Admin Nhập Bảng Công Hàng Loạt (Bulk Import)
**Tình huống:** Mất điện cả ngày, không có log nào.

**Xử lý:**
1. Admin vào trang "Nhập bảng công thủ công".
2. Chọn ngày + chọn nhân viên → nhập check-in/out cho từng người.
3. Hệ thống tạo `attendance_logs` với `method='manual'` cho từng dòng.
4. Cập nhật `attendance_records` + ghi `attendance_adjustments` với `reason = 'Bulk import - [lý do sự cố]'`.

### 5.8 Nhân Viên Nghỉ Thai Sản / Nghỉ Dài Hạn
**Xử lý:**
- Tạo `leave_requests` với `leave_type = 'unpaid'` hoặc extend theo thoả thuận.
- Ngày nghỉ dài hạn: admin chạy bulk create `leave_requests` cho cả giai đoạn.
- `work_units = 0.0` cho toàn bộ ngày nghỉ không lương.

---

## 6. Frontend — Trang & Component Cần Build

### 6.1 Trang Nhân Viên (route: `/chamcong`)
| Trang | Route | Mô tả |
|-------|-------|--------|
| Bảng công cá nhân | `/chamcong` | Xem bảng công tháng hiện tại, nút check-in/out |
| Đơn nghỉ phép | `/chamcong/nghi-phep` | Danh sách đơn + form tạo mới |
| Đơn OT | `/chamcong/tang-ca` | Danh sách đơn OT + form tạo mới |

**Component check-in/out widget (hiển thị mọi trang sau login):**
- Trạng thái hôm nay: chưa check-in / đã check-in lúc HH:mm / đã check-out
- Nút to "CHECK IN" (disable sau khi đã check-in)
- Nút to "CHECK OUT" (enable sau khi đã check-in)

### 6.2 Trang Admin (route: `/admin/chamcong`)
| Trang | Route | Mô tả |
|-------|-------|--------|
| Tổng quan chấm công | `/admin/chamcong` | Dashboard: ai đã/chưa check-in hôm nay |
| Bảng công tháng | `/admin/chamcong/bang-cong?month=&year=` | Grid: NV × ngày, màu theo status |
| Duyệt điều chỉnh | `/admin/chamcong/dieu-chinh` | Danh sách yêu cầu điều chỉnh chờ duyệt |
| Duyệt đơn nghỉ | `/admin/chamcong/don-nghi` | Danh sách leave_requests pending |
| Duyệt đơn OT | `/admin/chamcong/tang-ca` | Danh sách overtime_requests pending |
| Quản lý ca | `/admin/chamcong/ca-lam-viec` | CRUD shifts |
| Lịch ca | `/admin/chamcong/lich-ca` | Gán ca cho NV theo tháng |
| Báo cáo | `/admin/chamcong/bao-cao` | Xuất báo cáo tổng hợp |
| Ngày lễ | `/admin/chamcong/ngay-le` | CRUD public_holidays |

### 6.3 Màu Sắc Status (dùng nhất quán trong toàn bộ UI)
| Status | Màu |
|--------|-----|
| `present` | Xanh lá (green) |
| `late` | Vàng (amber) |
| `early_leave` | Cam nhạt |
| `late_and_early` | Cam đậm |
| `absent` | Đỏ (red) |
| `on_leave` | Xanh dương nhạt (blue) |
| `wfh` | Tím nhạt (purple) |
| `business_trip` | Xanh teal |
| `holiday` | Xám nhạt (gray) |
| `unscheduled` | Đỏ viền (border red) |

---

## 7. Business Logic Functions Cần Implement

### 7.1 `calculateAttendanceRecord(userId, date)`
Gọi sau mỗi lần check-in hoặc check-out:
```
1. Lấy work_schedules cho (userId, date) → shift
2. Nếu không có shift → status = 'unscheduled', dừng
3. Nếu is_day_off = TRUE → không cần xử lý
4. Kiểm tra public_holidays → nếu trùng: is_holiday = TRUE, status = 'holiday'
5. Kiểm tra leave_requests approved → nếu ngày đó covered: status = leave_type, work_units = 1.0
6. Lấy attendance_logs của (userId, date):
   - check_in = MIN(logged_at) WHERE log_type='check_in'
   - check_out = MAX(logged_at) WHERE log_type='check_out'
7. Tính actual_hours = (check_out - check_in) - break_minutes/60
8. Tính late_minutes, early_minutes theo tolerance
9. Tính work_units theo tỷ lệ actual_hours / required_hours
10. Xác định status (present/late/early_leave/late_and_early/absent)
11. Upsert attendance_records
```

### 7.2 `generateMonthlyWorkSchedule(userId, month, year)`
Admin trigger để tạo lịch ca cả tháng:
```
1. Lấy default_shift_id từ users
2. Lặp qua từng ngày trong tháng
3. Nếu T7/CN: is_day_off = TRUE
4. Nếu ngày lễ (public_holidays): is_day_off = TRUE
5. Các ngày còn lại: gán default shift
6. Bulk insert work_schedules (skip nếu đã tồn tại)
```

### 7.3 `syncAttendanceToPayroll(payrollPeriodId)`
Gọi khi admin muốn chốt bảng công vào kỳ lương:
```
1. Lấy payroll_period → start_date, end_date
2. Với mỗi user có payroll_records trong kỳ:
   a. SUM(work_units) WHERE status IN ('present','late','early_leave','late_and_early')
      → actual_work_days
   b. SUM(work_units) WHERE status IN ('on_leave','wfh','business_trip','holiday')
      → leave_paid_days
   c. COUNT WHERE status = 'absent' → absent_days
   d. SUM(ot_hours) WHERE overtime_requests.status = 'approved' AND date IN period
      → total_ot_hours
3. Update payroll_records.components → merge "attendance_summary" object
4. Ghi audit_logs
```

---

## 8. Kế Hoạch Thực Hiện Chi Tiết (Implementation Phases)

> **Nguyên tắc:** Mỗi phase phải chạy được độc lập và có thể test trước khi sang phase tiếp theo. Backend luôn đi trước frontend cùng phase. Không phụ thuộc chéo giữa phase (phase N+1 không bắt đầu khi phase N chưa pass).

---

### Phase CC-1: DB Migration — Tạo Schema (Ước tính: 0.5 ngày)

**Mục tiêu:** Toàn bộ schema module chấm công tồn tại trong DB, sẵn sàng cho backend.

**File cần tạo:** `backend/migrations/008_attendance_module.sql`

**Nội dung migration (theo thứ tự phụ thuộc):**
```
1. CREATE TYPE: attendance_status, leave_type, request_status, shift_type, checkin_method, attendance_log_type
2. CREATE TABLE shifts
3. ALTER TABLE users ADD COLUMN default_shift_id, annual_leave_days
4. CREATE TABLE work_schedules
5. CREATE TABLE attendance_logs  (+ REVOKE DELETE)
6. CREATE TABLE leave_requests
7. CREATE TABLE attendance_records  (FK → leave_requests phải có trước)
8. CREATE TABLE overtime_requests
9. CREATE TABLE attendance_adjustments  (+ REVOKE UPDATE/DELETE)
10. CREATE TABLE public_holidays
11. INSERT INTO shifts: Ca Hành Chính 08:00–17:00
12. INSERT INTO public_holidays: 13 ngày lễ năm 2026
13. CREATE INDEX tất cả
```

**Acceptance criteria:**
- `\dt` trong psql hiện đủ 8 bảng mới + 6 enum types mới
- `\d attendance_records` hiển thị đúng FK → leave_requests
- Migration idempotent với `IF NOT EXISTS` cho các ALTER TABLE

---

### Phase CC-2: Backend — Shifts & Work Schedules API (Ước tính: 1 ngày)

**Mục tiêu:** Admin có thể quản lý ca và tạo lịch ca tháng cho nhân viên.

**File cần tạo:**
```
backend/src/modules/attendance/
  shifts.service.js       ← CRUD shifts
  shifts.router.js
  schedules.service.js    ← work_schedules + generateMonthlyWorkSchedule()
  schedules.router.js
```

**API endpoints:**
```
GET    /api/v1/shifts                         → Danh sách ca (admin)
POST   /api/v1/shifts                         → Tạo ca mới (admin)
PUT    /api/v1/shifts/:id                     → Cập nhật ca (admin)

GET    /api/v1/work-schedules?userId=&month=&year=   → Lịch ca tháng
POST   /api/v1/work-schedules/bulk            → Bulk generate lịch tháng (admin)
  Body: { userId, month, year }
  Logic: vòng lặp qua ngày → T7/CN/lễ → is_day_off, còn lại → default_shift_id
```

**Đăng ký vào `app.js`:**
```js
app.use('/api/v1/shifts', require('./modules/attendance/shifts.router'))
app.use('/api/v1/work-schedules', require('./modules/attendance/schedules.router'))
```

**Acceptance criteria:**
- `GET /api/v1/shifts` trả về Ca Hành Chính được seed
- `POST /api/v1/work-schedules/bulk` với userId + tháng 6/2026 → tạo ~21 ngày làm + 9 ngày nghỉ (T7/CN/lễ)
- API trả lỗi 409 nếu lịch đã tồn tại cho ngày đó

---

### Phase CC-3: Backend — Check-in/out & Attendance Records (Ước tính: 2 ngày)

**Mục tiêu:** Nhân viên có thể check-in/out; hệ thống tự tính bảng công ngày.

**File cần tạo:**
```
backend/src/modules/attendance/
  attendance.service.js   ← calculateAttendanceRecord(), checkIn(), checkOut(), getToday()
  attendance.router.js
```

**Core function `calculateAttendanceRecord(userId, date)`:**
```
1. Lấy work_schedules cho (userId, date) → shift
2. Không có schedule → status='unscheduled', dừng
3. is_day_off = TRUE → không xử lý
4. JOIN public_holidays → is_holiday, status='holiday', work_units=1.0
5. JOIN leave_requests approved → status=leave_type, work_units=1.0
6. Lấy attendance_logs: check_in = MIN(logged_at), check_out = MAX(logged_at)
7. Tính actual_hours = (check_out − check_in) − break_minutes/60
8. Tính late_minutes, early_minutes theo tolerance
9. Tính work_units theo tỷ lệ actual_hours / required_hours
10. Xác định status (present/late/early_leave/late_and_early/absent)
11. UPSERT attendance_records
```

**API endpoints:**
```
POST   /api/v1/attendance/check-in                  → Nhân viên check-in
  Body: { method?, notes? }
  Logic: INSERT attendance_logs (log_type='check_in') → calculateAttendanceRecord()

POST   /api/v1/attendance/check-out                 → Nhân viên check-out
  Body: { method?, notes? }
  Logic: INSERT attendance_logs (log_type='check_out') → calculateAttendanceRecord()

GET    /api/v1/attendance/today                     → Trạng thái hôm nay (cá nhân)
  Returns: { hasCheckedIn, checkInTime, hasCheckedOut, checkOutTime, status, workUnits }

GET    /api/v1/attendance/records?userId=&month=&year=  → Bảng công tháng
  Returns: mảng attendance_records đã join shift + leave_request info

GET    /api/v1/attendance/records/summary?month=&year=  → Tổng hợp tất cả NV (admin only)
  Returns: mảng { user, totalDays, workUnits, absentDays, lateDays, leaveDays, otHours }
```

**Acceptance criteria:**
- Check-in trả về trạng thái `present` hoặc `late` đúng với tolerance
- Check-in không có lịch ca → status `unscheduled` + notification đến admin
- `GET /today` trả về check-in time đúng sau khi đã check-in
- Bấm check-in nhiều lần → MIN(logged_at) là giờ vào, không bị duplicate

---

### Phase CC-4: Backend — Leave Requests & OT Requests (Ước tính: 1.5 ngày)

**Mục tiêu:** Nhân viên tạo được đơn nghỉ phép / OT; admin duyệt và hệ thống tự cập nhật bảng công.

**File cần tạo:**
```
backend/src/modules/attendance/
  leave.service.js        ← CRUD leave_requests + approve/reject logic
  leave.router.js
  overtime.service.js     ← CRUD overtime_requests + approve logic
  overtime.router.js
```

**API endpoints:**
```
── Leave Requests ──
GET    /api/v1/leave-requests?status=&userId=        → Danh sách đơn
POST   /api/v1/leave-requests                        → Tạo đơn nghỉ
  Body: { leave_type, start_date, end_date, reason }
  Logic: tính total_days (trừ T7/CN/lễ) → INSERT → notify admin
PUT    /api/v1/leave-requests/:id/approve            → Duyệt (admin)
  Logic: UPDATE status='approved' → calculateAttendanceRecord() cho mỗi ngày trong kỳ
PUT    /api/v1/leave-requests/:id/reject             → Từ chối (admin)
  Body: { rejection_note }
DELETE /api/v1/leave-requests/:id                    → Huỷ (chính chủ, chỉ khi pending)

── Overtime Requests ──
GET    /api/v1/overtime-requests?status=&userId=     → Danh sách đơn OT
POST   /api/v1/overtime-requests                     → Tạo đơn OT
  Body: { ot_date, start_time, end_time, reason }
  Logic: tính ot_hours, ot_rate (dựa vào public_holidays + ngày trong tuần) → INSERT → notify admin
PUT    /api/v1/overtime-requests/:id/approve         → Duyệt OT (admin)
  Logic: UPDATE → cập nhật attendance_records.ot_hours cho ngày đó
PUT    /api/v1/overtime-requests/:id/reject          → Từ chối OT (admin)
```

**Acceptance criteria:**
- Tạo đơn nghỉ T7/CN → total_days không đếm T7/CN
- Duyệt đơn nghỉ → `attendance_records.status = 'on_leave'` cho các ngày đó
- OT ngày Chủ Nhật → ot_rate = 2.0 tự động
- OT ngày lễ → ot_rate = 3.0 tự động
- Notify đến admin khi có đơn mới (dùng `createAndEmit` + `emitData`)

---

### Phase CC-5: Backend — Điều Chỉnh, Báo Cáo & Tích Hợp Lương (Ước tính: 1.5 ngày)

**Mục tiêu:** Admin điều chỉnh bảng công + xuất báo cáo + sync vào payroll.

**File cần tạo/update:**
```
backend/src/modules/attendance/
  adjustments.service.js  ← Điều chỉnh attendance_records + ghi attendance_adjustments
  report.service.js       ← Tổng hợp báo cáo tháng + sync-payroll
```

**API endpoints:**
```
PUT    /api/v1/attendance/records/:id/adjust         → Điều chỉnh bảng công (admin)
  Body: { field: 'check_in_time'|'check_out_time'|'status', new_value, reason }
  Logic:
    1. Ghi attendance_adjustments (before/after/reason)
    2. UPDATE attendance_records
    3. Nếu field là check-in/out → tính lại actual_hours, work_units, status
    4. SET is_adjusted = TRUE

GET    /api/v1/attendance/report?month=&year=        → Báo cáo tổng hợp tháng (admin)
  Returns: mảng per user { name, workDays, leaveDays, absentDays, lateDays, otHours, otPay }

POST   /api/v1/attendance/sync-payroll               → Sync dữ liệu chấm công → payroll (admin)
  Body: { payrollPeriodId }
  Logic: syncAttendanceToPayroll(payrollPeriodId) → merge attendance_summary vào payroll_records.components

GET    /api/v1/attendance/holidays?year=             → Danh sách ngày lễ
POST   /api/v1/attendance/holidays                   → Thêm ngày lễ (admin)
DELETE /api/v1/attendance/holidays/:id               → Xóa ngày lễ (admin)
```

**Acceptance criteria:**
- Điều chỉnh check_in_time → tính lại đúng late_minutes, work_units
- Mỗi điều chỉnh ghi đúng 1 row vào `attendance_adjustments`
- Sync payroll → `payroll_records.components.attendance_summary` được merge đúng
- Sync payroll với kỳ có ngày `unscheduled` → trả về warning list, không fail

---

### Phase CC-6: Frontend — Check-in Widget (Ước tính: 1 ngày)

**Mục tiêu:** Nhân viên check-in/out trực tiếp từ Header — hiện diện trên mọi trang sau login.

**File cần tạo:**
```
frontend/src/components/layout/CheckInWidget.jsx
frontend/src/api/attendance.js   ← checkIn(), checkOut(), getToday(), getRecords()
```

**UI/UX CheckInWidget:**
```
┌──────────────────────────────────────────────┐
│  📍 Hôm nay: Thứ Hai, 18/05/2026            │
│                                              │
│  Trạng thái: ⏰ Chưa check-in               │
│                                              │
│  [  ✅ CHECK IN  ]                           │
└──────────────────────────────────────────────┘

Sau khi check-in:
  Trạng thái: 🟢 Đã check-in lúc 08:05
  [ ❌ CHECK OUT ]   (enable)

Sau khi check-out:
  Trạng thái: ✅ Đã check-out lúc 17:02 | 8.0h
  (cả 2 nút disable)
```

**Tích hợp vào Header.jsx:**
- Import và render `<CheckInWidget />` trong khu vực user action bar
- Dùng `getToday()` API để poll trạng thái khi mount
- Update local state ngay lập tức sau khi check-in/out thành công

**Acceptance criteria:**
- Widget hiển thị đúng trạng thái hôm nay (chưa/đã check-in/đã check-out)
- Check-in → button disable ngay, trạng thái cập nhật
- Tải lại trang → trạng thái đúng (không mất state)
- Chỉ hiện cho user role `staff` và `admin`

---

### Phase CC-7: Frontend — Bảng Công Cá Nhân `/chamcong` (Ước tính: 2 ngày)

**Mục tiêu:** Nhân viên xem bảng công tháng của mình dạng calendar + tổng hợp cuối tháng.

**File cần tạo:**
```
frontend/src/pages/Attendance/
  Attendance.jsx               ← Trang chính bảng công cá nhân
  attendance.module.css
```

**UI Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│  Bảng Công Cá Nhân                    [< Tháng 5/2026 >]   │
├─────────────────────────────────────────────────────────────┤
│  T2   T3   T4   T5   T6   T7   CN                          │
│  [  ] [  ] [  ] [  ] [  ] [  ] [  ]  ← week 1             │
│  ...                                                        │
├─────────────────────────────────────────────────────────────┤
│  Tổng kết:  22 ngày công  |  2 ngày nghỉ  |  0 ngày vắng  │
│             3 lần trễ     |  4.5h OT                       │
└─────────────────────────────────────────────────────────────┘
```

**Màu mỗi ô ngày theo trạng thái:**
- `present`: xanh lá
- `late`: vàng (+ hiện số phút trễ)
- `early_leave`: cam nhạt
- `late_and_early`: cam đậm
- `absent`: đỏ
- `on_leave`: xanh dương
- `wfh`: tím
- `business_trip`: teal
- `holiday`: xám nhạt (+ tên lễ)
- `unscheduled`: viền đỏ đứt
- Ngày chưa đến: trắng / mờ

**Click vào ngày:**
- Popup chi tiết: giờ vào, giờ ra, số phút trễ/về sớm, số giờ thực, OT nếu có
- Nút "Yêu cầu điều chỉnh" → mở form điều chỉnh (gửi request cho admin)

**Acceptance criteria:**
- Lịch hiển thị đúng tháng/năm với đúng số ngày
- Màu mỗi ô đúng với trạng thái từ API
- Tổng kết cuối trang tính đúng
- Chuyển tháng trước/sau load lại data

---

### Phase CC-8: Frontend — Đơn Nghỉ Phép & OT `/chamcong/nghi-phep` `/chamcong/tang-ca` (Ước tính: 1.5 ngày)

**Mục tiêu:** Nhân viên tạo và theo dõi đơn nghỉ phép / tăng ca.

**File cần tạo:**
```
frontend/src/pages/Attendance/
  LeaveRequests.jsx            ← Danh sách + form tạo đơn nghỉ
  OvertimeRequests.jsx         ← Danh sách + form tạo đơn OT
```

**Form tạo đơn nghỉ:**
- Chọn loại nghỉ (dropdown)
- Date picker: từ ngày → đến ngày
- Hiển thị tự động: "Tổng X ngày công"
- Ghi chú / lý do
- Submit → hiện toast + cập nhật danh sách

**Danh sách đơn (nhân viên tự xem):**
- Badge trạng thái: `pending` (vàng), `approved` (xanh), `rejected` (đỏ), `cancelled` (xám)
- Lý do từ chối hiển thị khi `rejected`
- Nút huỷ (chỉ hiện khi `pending`)

**Form tạo đơn OT:**
- Chọn ngày OT + giờ bắt đầu + giờ kết thúc
- Hiển thị tự động: X giờ OT × Y hệ số = Z (hệ số tự tính theo ngày)
- Lý do / ghi chú

**Acceptance criteria:**
- Tạo đơn nghỉ 5 ngày (có T7/CN) → total_days = 3 (không đếm cuối tuần)
- Đơn approved → badge đổi màu ngay (real-time hoặc sau reload)
- Hủy đơn pending → biến mất hoặc status = cancelled

---

### Phase CC-9: Frontend — Admin Dashboard Chấm Công (Ước tính: 2.5 ngày)

**Mục tiêu:** Admin có full control: tổng quan hôm nay, bảng công tháng dạng grid, duyệt đơn.

**File cần tạo:**
```
frontend/src/pages/Attendance/Admin/
  AttendanceAdmin.jsx          ← Dashboard hôm nay
  AttendanceGrid.jsx           ← Bảng công tháng (grid NV × ngày)
  LeaveApproval.jsx            ← Duyệt đơn nghỉ
  OvertimeApproval.jsx         ← Duyệt đơn OT
  AdjustmentApproval.jsx       ← Duyệt yêu cầu điều chỉnh
  ShiftsManagement.jsx         ← CRUD ca làm việc
  ScheduleManagement.jsx       ← Gán lịch ca theo tháng
  HolidaysManagement.jsx       ← CRUD ngày lễ
```

**Attendance Grid (bảng NV × ngày):**
```
         | 01 | 02 | 03 | 04 | 05 | ... | 31 | Tổng |
---------|----|----|----|----|----|----|-----|------|
NV A     | 🟢 | 🟡 | 🔵 | 🟢 | ⚪ | ...| 🟢 |  22  |
NV B     | 🟢 | 🟢 | 🔴 | 🟢 | ⚪ | ...| 🟢 |  21  |
...
```
- Click ô → popup chi tiết + nút "Điều chỉnh trực tiếp"
- Filter: chọn tháng + năm

**Acceptance criteria:**
- Grid hiển thị đúng màu cho tất cả nhân viên active
- Admin duyệt đơn → badge đổi + attendance_records cập nhật ngay
- Tạo lịch ca tháng cho 1 NV → form chọn NV + tháng + bulk generate
- Chỉnh sửa bảng công từ grid → ghi đúng vào attendance_adjustments

---

### Phase CC-10: Frontend — Báo Cáo & Tích Hợp Lương (Ước tính: 1 ngày)

**Mục tiêu:** Admin xuất báo cáo tổng hợp và đồng bộ chấm công vào payroll.

**File cần tạo:**
```
frontend/src/pages/Attendance/Admin/
  AttendanceReport.jsx         ← Báo cáo tổng hợp + sync payroll
```

**Layout báo cáo:**
```
Báo cáo Chấm Công — Tháng 5/2026      [Chọn tháng] [Xuất Excel]

| Nhân viên | Ngày công | Nghỉ phép | Vắng | Trễ | Giờ OT | OT Pay |
|-----------|-----------|-----------|------|-----|--------|--------|
| NV A      | 22.0      | 2.0       | 0    | 1   | 4.5    | 337,500|
| NV B      | 21.0      | 0         | 1    | 0   | 0      | 0      |
...

[🔄 Đồng bộ vào Bảng Lương Tháng 5]
```

**Sync payroll flow (UI):**
1. Admin bấm "Đồng bộ vào Bảng Lương"
2. Modal: chọn kỳ lương
3. Hệ thống kiểm tra còn ngày `unscheduled` → hiện danh sách cảnh báo
4. Admin xác nhận → gọi POST `/api/v1/attendance/sync-payroll`
5. Toast thành công + link sang trang Payroll

**Acceptance criteria:**
- Báo cáo tổng hợp hiển thị đúng số ngày công / nghỉ / OT
- Sync payroll → `payroll_records.components.attendance_summary` merge đúng
- Xuất Excel → file hợp lệ với đầy đủ cột

---

### Tổng Hợp Thứ Tự & Ước Tính

| Phase | Nội dung | Ước tính | Phụ thuộc | Trạng thái |
|-------|---------|----------|-----------|------------|
| **CC-1** | DB Migration | 0.5 ngày | — | ✅ Hoàn thành |
| **CC-1b** | Enum Metadata (Settings UI) | — | CC-1 | ✅ Hoàn thành (migration 041) |
| **CC-2** | Backend: Shifts + Schedules API | 1 ngày | CC-1 | ✅ Hoàn thành |
| **CC-3** | Backend: Check-in/out + Bảng công | 2 ngày | CC-2 | ✅ Hoàn thành |
| **CC-4** | Backend: Leave + OT Requests | 1.5 ngày | CC-3 | ✅ Hoàn thành |
| **CC-5** | Backend: Điều chỉnh + Báo cáo + Payroll | 1.5 ngày | CC-4 | ✅ Hoàn thành |
| **CC-5b** | Settings: Cấu hình Ca + Ngày lễ | — | CC-2 | ✅ Hoàn thành (AttendanceConfigSection) |
| **CC-6** | Frontend: Check-in Widget | 1 ngày | CC-3 | ✅ Hoàn thành |
| **CC-7** | Frontend: Bảng Công Cá Nhân | 2 ngày | CC-6 | ✅ Hoàn thành |
| **CC-8** | Frontend: Đơn Nghỉ / OT (nhân viên) | 1.5 ngày | CC-4, CC-7 | ✅ Hoàn thành |
| **CC-9** | Frontend: Admin Dashboard | 2.5 ngày | CC-5, CC-8 | ✅ Hoàn thành |
| **CC-10** | Frontend: Báo Cáo + Tích Hợp Lương | 1 ngày | CC-9 | ✅ Hoàn thành |
| **CC-11** | Seed Data Demo (Dec 2025 – May 2026) | — | CC-10 | ✅ Hoàn thành (`seed_attendance_demo.sql`) |
| | **Tổng cộng** | **~14.5 ngày** | | |

> **Ghi chú thực tế:** Nếu làm tuần tự 1 người: ~3 tuần. Nếu backend + frontend song song từ CC-3 trở đi: ~10–12 ngày.

---

*Tài liệu này là spec đầy đủ để Claude Code implement module chấm công từ DB đến UI. Mọi thay đổi schema sau khi review nên được cập nhật lại tài liệu này trước khi commit code.*