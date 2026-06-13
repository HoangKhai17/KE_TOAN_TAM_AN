# 05 — Database Schema Design
> Phiên bản: 1.1 | Ngày tạo: 2026-05-07 | Cập nhật: 2026-05-07 | Stack: PostgreSQL 16 + Docker

---

## Entity Relationship Overview

```
┌─────────────┐      ┌──────────────────────────┐      ┌─────────────────┐
│   users     │─1:N──│ staff_company_assignments │──N:1─│   companies     │
│ (nhân viên) │      └──────────────────────────┘      │ (doanh nghiệp)  │
│             │─────────────────────────────────────────│                 │
└──────┬──────┘  phụ trách chính (assigned_staff_id)   └────────┬────────┘
       │                                                         │
       │                                          ┌──────────────┤
       │                                          │              │
       │                              ┌───────────────────┐  ┌──────────┐
       │                              │customer_task_sched│  │documents │
       │                              │ules (Lớp 2)       │  │(OneDrive)│
       │                              └────────┬──────────┘  └──────────┘
       │                                       │ (auto-generate)
┌──────┴──────┐                      ┌─────────▼──────────────────────────┐
│ task_types  │─────────────────────►│              tasks                 │
│ (Lớp 1)    │                       │ (công việc thực tế)                │
│             │                      └──┬──────────┬────────────┬─────────┘
│ ├ checklist │                         │          │            │
│   templates │             ┌───────────┘    ┌─────┘     ┌─────┘
│ └ custom    │             │                │           │
│   field     │   ┌─────────────────┐  ┌──────────┐  ┌──────────────────┐
│   schemas   │   │task_checklist   │  │task_     │  │task_custom_      │
└─────────────┘   │_items           │  │comments  │  │field_values      │
                  └─────────────────┘  └──────────┘  └──────────────────┘
                  ┌─────────────────┐  ┌──────────┐  ┌──────────────────┐
                  │task_dependencies│  │task_     │  │task_time_logs    │
                  │(N:N self-join)  │  │activity_ │  │(time tracking)   │
                  └─────────────────┘  │logs      │  └──────────────────┘
                                       └──────────┘
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│notifications │  │refresh_tokens│  │ system_      │  │  audit_logs      │
│              │  │              │  │ configs      │  │  (immutable)     │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────────┘

┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
│   payroll_periods    │─1:N│   payroll_records     │    │  company_credentials │
│   (Kỳ lương tháng)  │    │   (Lương/thưởng NV)  │    │  (Tài khoản hệ thống │
└──────────────────────┘    └──────────────────────┘    │   KH — mã hóa AES)  │
                                     │ N:1 users         └──────────────────────┘
                                     └──────────────────────────────────────────

── Module 7: Chấm Công ──────────────────────────────────────────────────────
┌─────────┐      ┌───────────────────┐      ┌──────────────────────────────┐
│ shifts  │─1:N──│  work_schedules   │      │      attendance_logs         │
│ (Ca LV) │      │  (Lịch ca NV)    │      │  (Raw log check-in/out)      │
└─────────┘      └───────────────────┘      │  APPEND-ONLY — no delete     │
                                            └──────────────────────────────┘
                                                         │ feeds into
┌───────────────────────────────────┐       ┌────────────▼─────────────────┐
│   leave_requests  (Đơn nghỉ phép)│──────►│    attendance_records         │
└───────────────────────────────────┘       │  (1 row / người / ngày)      │
┌───────────────────────────────────┐       └──────────────────────────────┘
│   overtime_requests  (Đơn OT)    │                    │ adjusted by
└───────────────────────────────────┘       ┌───────────▼──────────────────┐
┌───────────────────────────────────┐       │  attendance_adjustments       │
│   public_holidays  (Ngày lễ QG)  │       │  (Audit trail — immutable)    │
└───────────────────────────────────┘       └──────────────────────────────┘

── Module 1 (bổ sung): HS Lưu Trữ Khi QT ───────────────────────────────────
┌──────────────────────────────────────┐    ┌──────────────────────────────────────┐
│        company_archive_years          │─1:N│        company_archive_docs           │
│  UNIQUE (company_id, year)            │    │  months JSONB {"1":""…"12":""}        │
│  notes (ghi chú cấp năm)             │    │  position INT  (kéo thả reorder)      │
│  ON DELETE CASCADE ← companies       │    │  ON DELETE CASCADE ← archive_years    │
└──────────────────────────────────────┘    └──────────────────────────────────────┘
```

---

## ENUM Types

```sql
-- Vai trò người dùng
CREATE TYPE user_role AS ENUM ('admin', 'staff');

-- Trạng thái nhân viên
CREATE TYPE user_status AS ENUM ('active', 'on_leave', 'resigned');

-- Loại hình doanh nghiệp
CREATE TYPE business_type AS ENUM ('TNHH', 'CP', 'HKD', 'DN_TU_NHAN', 'KHAC');

-- Trạng thái doanh nghiệp
CREATE TYPE company_status AS ENUM ('active', 'inactive', 'terminated');

-- Trạng thái công việc (6 bước vòng đời)
CREATE TYPE task_status AS ENUM (
  'pending',          -- Chờ xử lý
  'in_progress',      -- Đang thực hiện
  'on_hold',          -- Tạm hoãn
  'pending_review',   -- Chờ duyệt
  'needs_revision',   -- Cần xem xét lại
  'completed'         -- Hoàn thành
);

-- Mức độ ưu tiên
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');

-- Nguồn tạo task
CREATE TYPE task_source AS ENUM ('auto', 'manual');

-- Loại lặp lại (9 chế độ)
CREATE TYPE recurrence_type AS ENUM (
  'daily',               -- Hàng ngày / mỗi N ngày
  'weekly',              -- Hàng tuần theo thứ
  'monthly_by_date',     -- Hàng tháng theo ngày cố định
  'monthly_by_weekday',  -- Hàng tháng theo thứ + tuần thứ N
  'monthly_last_day',    -- Hàng tháng ngày cuối tháng
  'quarterly',           -- Hàng quý
  'yearly',              -- Hàng năm
  'custom_dates',        -- Danh sách ngày tùy chỉnh
  'once'                 -- Một lần
);

-- Trạng thái kỳ lương
CREATE TYPE payroll_status AS ENUM (
  'draft',      -- Đang lập, chưa xác nhận
  'confirmed',  -- Đã xác nhận, chưa thanh toán
  'paid'        -- Đã thanh toán
);

-- Kiểu dữ liệu custom field
CREATE TYPE field_data_type AS ENUM ('text', 'number', 'date', 'boolean', 'select');

-- Danh mục tài liệu
CREATE TYPE document_category AS ENUM (
  'hop_dong', 'bao_cao_thue', 'so_sach', 'giay_phep', 'khac'
);

-- Loại thông báo
CREATE TYPE notification_type AS ENUM (
  'task_assigned', 'task_overdue', 'deadline_reminder',
  'escalation', 'morning_summary', 'task_status_changed'
);

-- ── Module 7: Chấm Công ──────────────────────────────────────────────────────

-- Trạng thái bảng công ngày
CREATE TYPE attendance_status AS ENUM (
  'present',        -- Đi làm đúng giờ
  'late',           -- Đi trễ (> tolerance_in phút)
  'early_leave',    -- Về sớm (> tolerance_out phút)
  'late_and_early', -- Vừa trễ vừa về sớm
  'absent',         -- Vắng không phép
  'on_leave',       -- Nghỉ phép được duyệt
  'business_trip',  -- Công tác
  'wfh',            -- Work From Home
  'holiday',        -- Ngày lễ quốc gia
  'unscheduled'     -- Không có ca, chờ admin xử lý
);

-- Loại nghỉ phép
CREATE TYPE leave_type AS ENUM (
  'annual',         -- Phép năm
  'sick',           -- Nghỉ bệnh
  'compensatory',   -- Nghỉ bù OT
  'unpaid',         -- Nghỉ không phép
  'business_trip',  -- Công tác
  'wfh'             -- WFH
);

-- Trạng thái đơn (dùng chung leave + OT requests)
CREATE TYPE request_status AS ENUM (
  'pending',    -- Chờ duyệt
  'approved',   -- Đã duyệt
  'rejected',   -- Từ chối
  'cancelled'   -- Nhân viên huỷ
);

-- Loại ca làm việc
CREATE TYPE shift_type AS ENUM (
  'fixed',     -- Ca cố định (start_time / end_time)
  'flexible'   -- Linh hoạt (chỉ cần đủ required_hours)
);

-- Phương thức check-in
CREATE TYPE checkin_method AS ENUM (
  'web',     -- Web app (trong văn phòng)
  'mobile',  -- Mobile app (WFH / công tác)
  'manual'   -- Admin nhập tay (điều chỉnh)
);

-- Loại log chấm công
CREATE TYPE attendance_log_type AS ENUM (
  'check_in',
  'check_out'
);

-- Loại báo cáo xuất
CREATE TYPE report_type_enum AS ENUM (
  'monthly_summary', 'staff_performance', 'customer_status',
  'sla_compliance', 'aging', 'velocity', 'forecast', 'custom'
);

-- ── Module 8: Yêu Cầu Tài Liệu Khách Hàng ───────────────────────────────────

-- Trạng thái yêu cầu tài liệu từ KH
CREATE TYPE client_doc_status AS ENUM (
  'pending',       -- Đang chờ KH cung cấp
  'received',      -- KH đã cung cấp, staff đã xác nhận
  'not_required',  -- Không cần thiết nữa
  'overdue'        -- Quá deadline mà KH chưa cung cấp (tự động bởi cron)
);
```

---

## TABLE: users

```sql
CREATE TABLE users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(100) NOT NULL,
  email            VARCHAR(150) NOT NULL UNIQUE,
  password_hash    TEXT NOT NULL,
  role             user_role NOT NULL DEFAULT 'staff',
  status           user_status NOT NULL DEFAULT 'active',
  phone            VARCHAR(20),
  job_title        VARCHAR(100),
  avatar_url       TEXT,
  must_change_pw   BOOLEAN NOT NULL DEFAULT FALSE,
  login_attempts   INT NOT NULL DEFAULT 0,
  locked_until     TIMESTAMP,
  last_login_at    TIMESTAMP,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email  ON users(email);
CREATE INDEX idx_users_role   ON users(role);
CREATE INDEX idx_users_status ON users(status);
```

| Column | Mô tả |
|--------|-------|
| `role` | `admin` = Quản lý toàn quyền; `staff` = nhân viên kế toán |
| `status` | `active` / `on_leave` (nghỉ phép) / `resigned` (đã nghỉ) |
| `login_attempts` | Reset về 0 khi đăng nhập thành công; khoá tài khoản nếu ≥ 5 lần sai |
| `locked_until` | NULL = không bị khoá; có giá trị = khoá tạm thời |
| `must_change_pw` | TRUE = bắt buộc đổi mật khẩu lần đăng nhập kế tiếp |

---

## TABLE: refresh_tokens

```sql
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,   -- SHA-256 của token thật, không lưu token gốc
  family_id   UUID NOT NULL,          -- Nhóm token cùng chuỗi rotate; thu hồi toàn family khi phát hiện reuse
  expires_at  TIMESTAMP NOT NULL,
  revoked_at  TIMESTAMP,              -- NULL = còn hiệu lực
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rt_user_id ON refresh_tokens(user_id);
```

---

## TABLE: companies (Hồ Sơ Doanh Nghiệp)

```sql
CREATE TABLE companies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                VARCHAR(200) NOT NULL,
  tax_code            VARCHAR(20) UNIQUE,                         -- Mã số thuế
  address             TEXT,
  business_type       business_type NOT NULL DEFAULT 'TNHH',
  industry            VARCHAR(150),                               -- Ngành nghề kinh doanh
  legal_rep_name      VARCHAR(100),                               -- Đại diện pháp lý
  legal_rep_phone     VARCHAR(20),
  contact_name        VARCHAR(100),                               -- Người liên hệ làm việc
  contact_phone       VARCHAR(20),
  contact_email       VARCHAR(150),
  bank_account        VARCHAR(30),
  bank_name           VARCHAR(150),
  service_start_date  DATE,
  status              company_status NOT NULL DEFAULT 'active',
  notes               TEXT,                                       -- Ghi chú đặc thù nghiệp vụ
  assigned_staff_id   UUID REFERENCES users(id) ON DELETE SET NULL, -- Nhân viên phụ trách hiện tại
  created_by          UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_companies_tax_code      ON companies(tax_code);
CREATE INDEX idx_companies_status        ON companies(status);
CREATE INDEX idx_companies_assigned_staff ON companies(assigned_staff_id);
CREATE INDEX idx_companies_fts           ON companies
  USING gin(to_tsvector('simple', name || ' ' || coalesce(tax_code,'')));
```

| Column | Mô tả |
|--------|-------|
| `tax_code` | Mã số thuế — unique, dùng để tìm kiếm nhanh |
| `assigned_staff_id` | Nhân viên phụ trách hiện tại; ON DELETE SET NULL để không mất hồ sơ KH khi xóa nhân viên |
| `notes` | Ví dụ: "Công ty XNK — cần khai thêm thuế NK hàng tháng" |
| `status` | `terminated` = đã dừng hợp đồng, giữ lại lịch sử |

---

## TABLE: staff_company_assignments (Lịch Sử Phân Công)

```sql
CREATE TABLE staff_company_assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  staff_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by  UUID NOT NULL REFERENCES users(id),
  start_date   DATE NOT NULL,
  end_date     DATE,            -- NULL = đang phụ trách (phân công hiện tại)
  notes        TEXT,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Không cho phép 2 nhân viên cùng phụ trách 1 KH trong cùng 1 giai đoạn
  CONSTRAINT no_overlap CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX idx_sca_company ON staff_company_assignments(company_id);
CREATE INDEX idx_sca_staff   ON staff_company_assignments(staff_id);
CREATE INDEX idx_sca_current ON staff_company_assignments(company_id) WHERE end_date IS NULL;
```

> **Lưu ý:** Khi phân công lại, hệ thống tự động đặt `end_date = NOW()` cho bản ghi cũ trước khi tạo bản ghi mới.

---

## TABLE: task_types (Task Type Library — Lớp 1)

```sql
CREATE TABLE task_types (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(200) NOT NULL,
  group_name       VARCHAR(100),    -- 'Khai thuế' | 'Báo cáo tài chính' | 'Nhân sự' | 'Chứng từ' | 'Hành chính'
  description      TEXT,
  default_sla_days INTEGER NOT NULL DEFAULT 7,   -- SLA chuẩn tính bằng ngày
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_task_types_group     ON task_types(group_name);
CREATE INDEX idx_task_types_is_active ON task_types(is_active);
```

---

## TABLE: task_type_checklist_templates (Checklist Mặc Định)

```sql
CREATE TABLE task_type_checklist_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type_id UUID NOT NULL REFERENCES task_types(id) ON DELETE CASCADE,
  step_order   INTEGER NOT NULL,
  step_text    VARCHAR(300) NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE (task_type_id, step_order)
);

CREATE INDEX idx_tclt_task_type ON task_type_checklist_templates(task_type_id);
```

**Dữ liệu mẫu — Kê khai thuế GTGT:**

```sql
INSERT INTO task_type_checklist_templates (task_type_id, step_order, step_text) VALUES
  ('uuid-gtgt', 1, 'Thu thập hóa đơn đầu vào / đầu ra trong tháng'),
  ('uuid-gtgt', 2, 'Đối chiếu số liệu với phần mềm kế toán'),
  ('uuid-gtgt', 3, 'Lập tờ khai trên phần mềm khai thuế'),
  ('uuid-gtgt', 4, 'Nộp tờ khai điện tử lên cổng thuế'),
  ('uuid-gtgt', 5, 'Lưu biên lai xác nhận đã nộp');
```

---

## TABLE: task_type_custom_field_schemas (Định Nghĩa Custom Fields)

```sql
CREATE TABLE task_type_custom_field_schemas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type_id  UUID NOT NULL REFERENCES task_types(id) ON DELETE CASCADE,
  field_key     VARCHAR(80) NOT NULL,     -- snake_case, unique trong cùng task_type
  label         VARCHAR(150) NOT NULL,    -- Nhãn hiển thị trên UI
  data_type     field_data_type NOT NULL,
  options       JSONB,                    -- Dùng khi data_type = 'select', ví dụ: ["Đã nộp", "Chưa nộp"]
  is_required   BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE (task_type_id, field_key)
);

CREATE INDEX idx_ttcfs_task_type ON task_type_custom_field_schemas(task_type_id);
```

**Dữ liệu mẫu — Custom fields cho "Kê khai thuế GTGT":**

| field_key | label | data_type |
|-----------|-------|-----------|
| `ky_khai` | Kỳ khai (Tháng/Năm) | text |
| `so_thue_phat_sinh` | Số thuế phát sinh | number |
| `so_thue_phai_nop` | Số thuế phải nộp | number |
| `ma_bien_lai` | Mã biên lai | text |
| `ngay_nop` | Ngày nộp | date |
| `trang_thai_nop` | Trạng thái nộp | select (options: ["Đã nộp", "Chưa nộp", "Nộp bổ sung"]) |

---

## TABLE: customer_task_schedules (Customer Task Schedule — Lớp 2)

```sql
CREATE TABLE customer_task_schedules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  task_type_id        UUID NOT NULL REFERENCES task_types(id),
  assigned_staff_id   UUID REFERENCES users(id) ON DELETE SET NULL,  -- Override NV thực hiện
  recurrence_type     recurrence_type NOT NULL,
  recurrence_config   JSONB NOT NULL DEFAULT '{}',   -- Cấu hình chi tiết (xem bên dưới)
  deadline_offset_days INTEGER NOT NULL DEFAULT 0,    -- Offset: sinh ngày X + N ngày = deadline
  override_sla_days   INTEGER,                        -- NULL = dùng SLA mặc định của task_type
  notes               TEXT,                           -- Ghi chú đặc thù cho KH này
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  last_generated_at   TIMESTAMP,                      -- Thời điểm lần cuối scheduler sinh task
  created_by          UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cts_company      ON customer_task_schedules(company_id);
CREATE INDEX idx_cts_task_type    ON customer_task_schedules(task_type_id);
CREATE INDEX idx_cts_is_active    ON customer_task_schedules(is_active);
```

**Cấu trúc `recurrence_config` theo từng `recurrence_type`:**

| recurrence_type | recurrence_config (JSONB) | Ý nghĩa |
|-----------------|--------------------------|---------|
| `daily` | `{"every_n_days": 2}` | Mỗi 2 ngày |
| `weekly` | `{"weekdays": [1, 4]}` | Thứ 2 và Thứ 5 (0=CN, 1=T2...) |
| `monthly_by_date` | `{"day": 1}` | Ngày 1 mỗi tháng |
| `monthly_by_weekday` | `{"weekday": 1, "week": 1}` | Thứ 2 tuần đầu tháng |
| `monthly_last_day` | `{}` | Ngày cuối tháng (tự tính 28/29/30/31) |
| `quarterly` | `{"month_in_quarter": 1, "day": 5}` | Tháng đầu quý, ngày 5 |
| `yearly` | `{"month": 3, "day": 31}` | 31/03 hàng năm |
| `custom_dates` | `{"dates": ["2026-01-15","2026-04-15","2026-07-15","2026-10-15"]}` | Danh sách ngày cụ thể |
| `once` | `{"date": "2026-06-30"}` | Một lần duy nhất |

---

## TABLE: tasks (Công Việc Thực Tế)

```sql
CREATE TABLE tasks (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                        VARCHAR(300) NOT NULL,
  description                  TEXT,

  -- Liên kết nghiệp vụ
  company_id                   UUID NOT NULL REFERENCES companies(id),
  task_type_id                 UUID REFERENCES task_types(id) ON DELETE SET NULL,
  customer_task_schedule_id    UUID REFERENCES customer_task_schedules(id) ON DELETE SET NULL,

  -- Phân công
  assigned_to                  UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_by                  UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Trạng thái & ưu tiên
  status                       task_status NOT NULL DEFAULT 'pending',
  priority                     task_priority NOT NULL DEFAULT 'medium',
  source                       task_source NOT NULL DEFAULT 'manual',

  -- Thời gian
  due_date                     DATE,
  period_label                 VARCHAR(20),    -- Ví dụ: "T06/2026", "Q2/2026"
  completed_at                 TIMESTAMP,
  on_hold_reason               TEXT,           -- Lý do tạm hoãn

  -- SLA & tracking
  sla_days                     INTEGER,        -- SLA áp dụng cho task này (copy từ template)
  actual_hours                 NUMERIC(6,2),   -- Tổng thời gian thực tế (tổng hợp từ task_time_logs)

  created_by                   UUID NOT NULL REFERENCES users(id),
  created_at                   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_tasks_company       ON tasks(company_id);
CREATE INDEX idx_tasks_assigned_to   ON tasks(assigned_to);
CREATE INDEX idx_tasks_status        ON tasks(status);
CREATE INDEX idx_tasks_due_date      ON tasks(due_date);
CREATE INDEX idx_tasks_source        ON tasks(source);
CREATE INDEX idx_tasks_period        ON tasks(period_label);
CREATE INDEX idx_tasks_schedule      ON tasks(customer_task_schedule_id);

-- Index tổng hợp cho dashboard query phổ biến
CREATE INDEX idx_tasks_staff_status  ON tasks(assigned_to, status);
CREATE INDEX idx_tasks_overdue       ON tasks(due_date, status)
  WHERE status NOT IN ('completed') AND due_date IS NOT NULL;

-- Full-text search
CREATE INDEX idx_tasks_fts ON tasks
  USING gin(to_tsvector('simple', title || ' ' || coalesce(description,'')));
```

| Column | Mô tả |
|--------|-------|
| `customer_task_schedule_id` | NULL = tạo thủ công; có giá trị = auto-generated từ scheduler |
| `period_label` | Nhãn kỳ làm việc, ví dụ "T06/2026" để phân biệt task GTGT tháng 6 |
| `sla_days` | Copy từ `task_type.default_sla_days` hoặc `customer_task_schedule.override_sla_days` tại thời điểm tạo |
| `actual_hours` | Cột denormalized — cập nhật khi insert/delete `task_time_logs` để tránh aggregate query |
| `on_hold_reason` | Ghi lý do khi chuyển sang trạng thái `on_hold` |

---

## TABLE: task_checklist_items (Subtask / Checklist)

```sql
CREATE TABLE task_checklist_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id        UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  step_order     INTEGER NOT NULL,
  step_text      TEXT NOT NULL,
  is_completed   BOOLEAN NOT NULL DEFAULT FALSE,
  completed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at   TIMESTAMP,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE (task_id, step_order)
);

CREATE INDEX idx_checklist_task ON task_checklist_items(task_id);
```

> Khi tạo task từ template, hệ thống copy `task_type_checklist_templates` → `task_checklist_items`. Người dùng có thể thêm/bớt bước sau khi tạo.

---

## TABLE: task_dependencies (Phụ Thuộc Công Việc)

```sql
CREATE TABLE task_dependencies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id             UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,  -- Task cần đợi (B)
  depends_on_task_id  UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,  -- Task phải hoàn thành trước (A)
  created_by          UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE (task_id, depends_on_task_id),
  -- Ngăn self-reference
  CHECK (task_id <> depends_on_task_id)
);

CREATE INDEX idx_td_task_id    ON task_dependencies(task_id);
CREATE INDEX idx_td_depends_on ON task_dependencies(depends_on_task_id);
```

> **Logic nghiệp vụ:** Khi nhân viên cố cập nhật trạng thái task B, backend kiểm tra tất cả `depends_on_task_id` — nếu bất kỳ task A nào chưa `completed` thì trả về lỗi 422.

---

## TABLE: task_comments (Comment Nội Bộ)

```sql
CREATE TABLE task_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  is_edited   BOOLEAN NOT NULL DEFAULT FALSE,
  edited_at   TIMESTAMP,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_task ON task_comments(task_id);
CREATE INDEX idx_comments_user ON task_comments(user_id);
```

---

## TABLE: task_activity_logs (Nhật Ký Hoạt Động)

```sql
CREATE TABLE task_activity_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,   -- NULL = hành động của system
  action      VARCHAR(50) NOT NULL,   -- Xem bảng action types bên dưới
  old_value   TEXT,
  new_value   TEXT,
  meta        JSONB,                  -- Context bổ sung tùy action
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tal_task    ON task_activity_logs(task_id);
CREATE INDEX idx_tal_created ON task_activity_logs(created_at DESC);
```

**Danh sách `action` types:**

| action | Mô tả | old_value / new_value |
|--------|-------|----------------------|
| `created` | Task được tạo | — / title |
| `status_changed` | Đổi trạng thái | trạng thái cũ / mới |
| `assigned` | Phân công lại | tên NV cũ / tên NV mới |
| `due_date_changed` | Đổi deadline | ngày cũ / ngày mới |
| `checklist_checked` | Tick một bước checklist | step_text / "completed" |
| `comment_added` | Thêm comment | — / 30 ký tự đầu |
| `file_uploaded` | Upload tài liệu | — / tên file |
| `time_logged` | Ghi time tracking | — / số giờ |
| `escalated` | Escalation tự động | — / lý do |
| `dependency_blocked` | Bị block bởi task khác | — / title task block |

---

## TABLE: task_custom_field_values (Giá Trị Custom Fields)

```sql
CREATE TABLE task_custom_field_values (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  field_schema_id UUID NOT NULL REFERENCES task_type_custom_field_schemas(id) ON DELETE CASCADE,

  -- Lưu theo đúng cột tương ứng data_type để tránh cast khi query
  value_text      TEXT,
  value_number    NUMERIC,
  value_date      DATE,
  value_boolean   BOOLEAN,

  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE (task_id, field_schema_id)
);

CREATE INDEX idx_tcfv_task  ON task_custom_field_values(task_id);
CREATE INDEX idx_tcfv_field ON task_custom_field_values(field_schema_id);
```

---

## TABLE: task_time_logs (Time Tracking)

```sql
CREATE TABLE task_time_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hours       NUMERIC(5,2) NOT NULL CHECK (hours > 0),
  note        TEXT,
  logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ttl_task ON task_time_logs(task_id);
CREATE INDEX idx_ttl_user ON task_time_logs(user_id);
```

> Mỗi lần insert/delete, trigger cập nhật `tasks.actual_hours = SUM(hours) WHERE task_id = ...`.

---

## TABLE: documents (Hồ Sơ & Giấy Tờ — OneDrive Metadata)

```sql
CREATE TABLE documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  task_id           UUID REFERENCES tasks(id) ON DELETE SET NULL,  -- NULL = tài liệu chung của KH
  file_name         VARCHAR(300) NOT NULL,
  category          document_category NOT NULL DEFAULT 'khac',
  onedrive_item_id  VARCHAR(200) NOT NULL UNIQUE,  -- Item ID từ Microsoft Graph API
  web_url           TEXT NOT NULL,                  -- Link xem trực tiếp trên OneDrive
  size_bytes        BIGINT,
  mime_type         VARCHAR(100),
  uploaded_by       UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_company   ON documents(company_id);
CREATE INDEX idx_documents_task      ON documents(task_id);
CREATE INDEX idx_documents_category  ON documents(category);
CREATE INDEX idx_documents_fts       ON documents
  USING gin(to_tsvector('simple', file_name));
```

| Column | Mô tả |
|--------|-------|
| `onedrive_item_id` | Item ID từ Microsoft Graph API — dùng để gọi API tạo link, xóa file |
| `web_url` | Link preview trực tiếp; có thể hết hạn — backend refresh khi cần |
| `task_id` | NULL = tài liệu hồ sơ chung; có giá trị = đính kèm bằng chứng hoàn thành task |

---

## TABLE: notifications (Thông Báo)

```sql
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        notification_type NOT NULL,
  title       VARCHAR(200) NOT NULL,
  body        TEXT,
  task_id     UUID REFERENCES tasks(id) ON DELETE CASCADE,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  read_at     TIMESTAMP,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_user        ON notifications(user_id);
CREATE INDEX idx_notif_unread      ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notif_created     ON notifications(created_at DESC);
```

---

## TABLE: report_jobs (Lịch Sử Xuất Báo Cáo)

```sql
CREATE TABLE report_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by    UUID NOT NULL REFERENCES users(id),
  report_type   report_type_enum NOT NULL,
  params        JSONB NOT NULL DEFAULT '{}',   -- Bộ lọc: kỳ, nhân viên, KH, loại task...
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending'|'processing'|'done'|'failed'
  file_url      TEXT,                          -- URL file đã xuất (lưu tạm trên server)
  file_type     VARCHAR(10),                   -- 'excel' | 'pdf'
  error_msg     TEXT,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMP
);

CREATE INDEX idx_rj_created_by ON report_jobs(created_by);
CREATE INDEX idx_rj_created_at ON report_jobs(created_at DESC);
```

---

## TABLE: system_configs (Cấu Hình Hệ Thống)

```sql
CREATE TABLE system_configs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key          VARCHAR(100) NOT NULL UNIQUE,
  value        TEXT NOT NULL,
  description  TEXT,
  updated_by   UUID REFERENCES users(id),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Dữ liệu mẫu cấu hình mặc định:**

```sql
INSERT INTO system_configs (key, value, description) VALUES
  ('deadline_warning_days',    '3',    'Số ngày trước deadline hiển thị cảnh báo vàng'),
  ('escalation_overdue_days',  '2',    'Số ngày quá hạn trước khi tự động escalate'),
  ('escalation_on_hold_days',  '5',    'Số ngày tạm hoãn trước khi gửi nhắc nhở'),
  ('morning_email_time',       '07:00','Giờ gửi email tổng hợp sáng cho quản lý'),
  ('max_login_attempts',       '5',    'Số lần sai mật khẩu tối đa trước khi khoá tài khoản'),
  ('lock_duration_minutes',    '30',   'Thời gian khoá tài khoản (phút)');
```

---

## TABLE: audit_logs (Immutable — Không Xóa, Không Sửa)

```sql
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(80) NOT NULL,   -- 'login', 'logout', 'task_delete', 'user_lock', ...
  target_type VARCHAR(30),            -- 'task', 'user', 'company', 'document', ...
  target_id   UUID,
  meta        JSONB,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Partition theo tháng để tránh bảng quá lớn (tùy chọn, áp dụng khi > 1 triệu rows)
CREATE INDEX idx_audit_user    ON audit_logs(user_id);
CREATE INDEX idx_audit_action  ON audit_logs(action);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- Row-level security: không ai có quyền UPDATE hoặc DELETE
REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;
```

---

## Trigger: Cập Nhật actual_hours Tự Động

```sql
-- Trigger cập nhật tasks.actual_hours mỗi khi thêm/xóa time log
CREATE OR REPLACE FUNCTION update_task_actual_hours()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE tasks
  SET actual_hours = (
    SELECT COALESCE(SUM(hours), 0)
    FROM task_time_logs
    WHERE task_id = COALESCE(NEW.task_id, OLD.task_id)
  )
  WHERE id = COALESCE(NEW.task_id, OLD.task_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_task_time_logs_after
AFTER INSERT OR DELETE ON task_time_logs
FOR EACH ROW EXECUTE FUNCTION update_task_actual_hours();
```

---

## TABLE: payroll_periods (Kỳ Lương)

```sql
CREATE TABLE payroll_periods (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_year    SMALLINT NOT NULL CHECK (period_year >= 2020),
  period_month   SMALLINT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  status         payroll_status NOT NULL DEFAULT 'draft',
  notes          TEXT,
  created_by     UUID NOT NULL REFERENCES users(id),
  confirmed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at   TIMESTAMP,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE (period_year, period_month),
  CHECK (end_date >= start_date)
);

CREATE INDEX idx_pp_year_month ON payroll_periods(period_year, period_month);
CREATE INDEX idx_pp_status     ON payroll_periods(status);
```

| Column | Mô tả |
|--------|-------|
| `period_year / period_month` | Kỳ tháng/năm — unique, ngăn tạo trùng kỳ lương |
| `status` | `draft` → `confirmed` → `paid`; chỉ admin mới được chuyển trạng thái |
| `confirmed_by / confirmed_at` | Ghi nhận ai đã xác nhận và thời điểm nào |

---

## TABLE: payroll_records (Bảng Lương & Thưởng Nhân Viên)

```sql
CREATE TABLE payroll_records (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_period_id    UUID NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL REFERENCES users(id),

  -- Thu nhập
  base_salary          NUMERIC(15,0) NOT NULL DEFAULT 0,   -- Lương cơ bản theo hợp đồng
  allowances           NUMERIC(15,0) NOT NULL DEFAULT 0,   -- Phụ cấp (đi lại, ăn trưa, điện thoại...)
  bonus                NUMERIC(15,0) NOT NULL DEFAULT 0,   -- Thưởng tháng / thưởng KPI
  gross_income         NUMERIC(15,0) GENERATED ALWAYS AS (base_salary + allowances + bonus) STORED,

  -- Bảo hiểm — phần nhân viên đóng
  bhxh_employee        NUMERIC(15,0) NOT NULL DEFAULT 0,   -- 8% lương đóng BH
  bhyt_employee        NUMERIC(15,0) NOT NULL DEFAULT 0,   -- 1.5%
  bhtn_employee        NUMERIC(15,0) NOT NULL DEFAULT 0,   -- 1%

  -- Bảo hiểm — phần công ty đóng (ghi nhận để đối soát chi phí)
  bhxh_employer        NUMERIC(15,0) NOT NULL DEFAULT 0,   -- 17.5%
  bhyt_employer        NUMERIC(15,0) NOT NULL DEFAULT 0,   -- 3%
  bhtn_employer        NUMERIC(15,0) NOT NULL DEFAULT 0,   -- 1%

  -- Khấu trừ khác
  pit_deduction        NUMERIC(15,0) NOT NULL DEFAULT 0,   -- Thuế thu nhập cá nhân
  other_deductions     NUMERIC(15,0) NOT NULL DEFAULT 0,   -- Tạm ứng, phạt...

  -- Lương thực nhận
  net_salary           NUMERIC(15,0) GENERATED ALWAYS AS (
                         base_salary + allowances + bonus
                         - bhxh_employee - bhyt_employee - bhtn_employee
                         - pit_deduction - other_deductions
                       ) STORED,

  -- Chi tiết bổ sung
  components           JSONB,   -- Phân rã từng khoản phụ cấp/thưởng (tùy chọn, xem mẫu dưới)
  notes                TEXT,
  created_by           UUID NOT NULL REFERENCES users(id),
  created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE (payroll_period_id, user_id)
);

CREATE INDEX idx_pr_period  ON payroll_records(payroll_period_id);
CREATE INDEX idx_pr_user    ON payroll_records(user_id);
```

| Column | Mô tả |
|--------|-------|
| `gross_income` | Cột generated: `base_salary + allowances + bonus` — PostgreSQL tự tính |
| `net_salary` | Cột generated: thu nhập thực nhận sau khấu trừ NV phải đóng |
| `bhxh/bhyt/bhtn_employer` | Ghi nhận để lập báo cáo chi phí nhân sự tổng thể của công ty |
| `components` | JSONB linh hoạt để ghi chi tiết nếu cần, không bắt buộc |

**Cấu trúc `components` (tùy chọn):**

```json
{
  "allowances": [
    { "label": "Phụ cấp xăng xe",   "amount": 500000 },
    { "label": "Phụ cấp ăn trưa",   "amount": 730000 },
    { "label": "Phụ cấp điện thoại","amount": 200000 }
  ],
  "bonuses": [
    { "label": "Thưởng KPI tháng 5", "amount": 2000000 },
    { "label": "Thưởng tiếp nhận KH mới", "amount": 500000 }
  ],
  "deductions": [
    { "label": "Tạm ứng tháng 4 thu lại", "amount": 1000000 }
  ]
}
```

---

## TABLE: company_credentials (Tài Khoản Hệ Thống Khách Hàng)

> **Bảo mật:** Cột `encrypted_password` lưu ciphertext AES-256-GCM, base64-encoded. Khoá mã hóa (encryption key) KHÔNG lưu trong database — quản lý qua biến môi trường hoặc secrets manager. Không bao giờ log hoặc trả về raw password qua API.

```sql
CREATE TABLE company_credentials (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  system_name       VARCHAR(200) NOT NULL,   -- 'Cổng thuế điện tử eTax', 'Cổng BHXH điện tử VssID', ...
  system_url        TEXT,                    -- https://... đường link đăng nhập
  username          VARCHAR(200) NOT NULL,   -- Tên đăng nhập (lưu plain — không nhạy cảm)
  encrypted_password TEXT NOT NULL,          -- AES-256-GCM, base64 — KHÔNG lưu plain text
  iv                VARCHAR(100) NOT NULL,   -- Initialization Vector (IV/nonce) cho AES-GCM, base64

  notes             TEXT,                    -- Ghi chú thêm (không nhạy cảm), ví dụ: "Đổi PW hàng quý"
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_by        UUID NOT NULL REFERENCES users(id),
  updated_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cc_company    ON company_credentials(company_id);
CREATE INDEX idx_cc_active     ON company_credentials(company_id, is_active) WHERE is_active = TRUE;
```

| Column | Mô tả |
|--------|-------|
| `system_name` | Tên hệ thống bên ngoài (nhập tự do — linh hoạt cho mọi loại cổng) |
| `system_url` | Link đăng nhập để nhân viên click trực tiếp từ trong ứng dụng |
| `username` | Tên đăng nhập — không nhạy cảm, lưu plain text |
| `encrypted_password` | **Mã hóa AES-256-GCM** — giải mã tại application layer, không bao giờ decrypt tại DB layer |
| `iv` | Initialization Vector riêng cho mỗi record — đảm bảo cùng password → ciphertext khác nhau |
| `notes` | Ghi chú vận hành, ví dụ: "Tài khoản phụ trợ", "Yêu cầu OTP SMS" |

**Dữ liệu mẫu — các loại tài khoản phổ biến:**

| system_name | system_url (ví dụ) |
|-------------|-------------------|
| Cổng thuế điện tử eTax | `https://etax.gdt.gov.vn` |
| Cổng dịch vụ công BHXH (VssID) | `https://dichvucong.baohiemxahoi.gov.vn` |
| Phần mềm kế toán MISA | `https://actapp.misa.vn` |
| Ngân hàng điện tử (Internet Banking) | `https://...` |
| Cổng thông tin Hải quan (VNACCS) | `https://www.customs.gov.vn` |

> **Lưu ý triển khai:**
> - Encryption key quản lý qua `process.env.CREDENTIAL_ENCRYPTION_KEY` (Node.js) — không hardcode, không commit vào git.
> - Khi đọc credential để hiển thị: API trả về `{ system_name, system_url, username, password: "***" }` — chỉ decrypt khi user bấm "Hiện mật khẩu" và có ghi log vào `audit_logs`.
> - Khi người dùng xem password: ghi `action = 'credential_viewed'` vào `audit_logs` với `target_type = 'company_credentials'`.

---

## TABLE: company_labor_contracts (Theo Dõi HĐLĐ Nhân Viên KH)

> Lưu trữ danh sách hợp đồng lao động của nhân viên tại từng doanh nghiệp khách hàng. Trường `days_remaining` và `contract_status` **không lưu DB** — tính tại query time để luôn phản ánh đúng thực tế.

```sql
CREATE TABLE company_labor_contracts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Thông tin nhân viên và hợp đồng
  employee_name    VARCHAR(200) NOT NULL,     -- Tên NV của KH (không FK vào users)
  contract_type    VARCHAR(150),              -- Nhập tự do: 'Xác định thời hạn', 'Thử việc'...
  contract_number  VARCHAR(100),              -- Số / mã hiệu hợp đồng
  contract_date    DATE,                      -- Ngày ký / ngày có hiệu lực
  end_date         DATE,                      -- NULL = không xác định thời hạn (vô thời hạn)

  notes            TEXT,
  custom_fields    JSONB NOT NULL DEFAULT '[]',  -- [{name, value, type: 'text'|'number'|'date'}]

  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clc_company  ON company_labor_contracts(company_id);
CREATE INDEX idx_clc_end_date ON company_labor_contracts(end_date) WHERE end_date IS NOT NULL;
```

**Query pattern — tính `days_remaining` và `contract_status` tại thời điểm truy vấn:**

```sql
SELECT *,
  CASE WHEN end_date IS NULL THEN NULL
       ELSE (end_date - CURRENT_DATE)
  END AS days_remaining,
  CASE
    WHEN end_date IS NULL              THEN 'permanent'      -- Không xác định thời hạn
    WHEN end_date < CURRENT_DATE       THEN 'expired'        -- Đã hết hạn
    WHEN end_date - CURRENT_DATE <= 30 THEN 'expiring_soon'  -- Sắp hết hạn (≤ 30 ngày)
    ELSE                                    'active'          -- Còn hiệu lực
  END AS contract_status
FROM company_labor_contracts
WHERE company_id = $1
ORDER BY
  CASE WHEN end_date IS NULL THEN 2 ELSE 1 END,
  end_date ASC;
```

| Column | Mô tả |
|--------|-------|
| `employee_name` | Tên nhân viên của doanh nghiệp KH — **không FK vào `users`** (đây là NV của KH, không phải NV Tâm An) |
| `contract_type` | Loại hợp đồng — lưu VARCHAR tự do, không dùng ENUM để linh hoạt cho mọi KH |
| `end_date` | NULL = hợp đồng không xác định thời hạn; có giá trị = hợp đồng xác định thời hạn |
| `custom_fields` | JSONB `[{name, value, type}]` — `type` ∈ `'text' \| 'number' \| 'date'` — validate ở application layer |
| `days_remaining` | **Không lưu DB** — computed tại query time: `end_date - CURRENT_DATE` |
| `contract_status` | **Không lưu DB** — computed: `active \| expiring_soon \| expired \| permanent` |

---

## TABLE: client_document_requests (Yêu Cầu Tài Liệu Từ Khách Hàng)

> Theo dõi những tài liệu / chứng từ mà staff cần yêu cầu KH cung cấp. CDR là **entity độc lập** (không bắt buộc gắn vào task), hiển thị trong tab "Yêu cầu KH" trên trang công ty và trong danh sách `/tasks` (filter riêng). Hỗ trợ 2 kênh đôn đốc: email nhắc nhở và shareable public link (KH điền form + dán link chia sẻ, không cần upload file lên hệ thống).

```sql
CREATE TABLE client_document_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID REFERENCES tasks(id) ON DELETE SET NULL,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  requested_by    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  -- Mô tả tài liệu cần
  document_name   VARCHAR(200) NOT NULL,   -- Ví dụ: "Hóa đơn đầu vào tháng 5"
  description     TEXT,                    -- Hướng dẫn chi tiết cho KH
  period_label    VARCHAR(20),             -- Ví dụ: "T05/2026"
  deadline_date   DATE,                    -- Hạn KH phải cung cấp

  -- Trạng thái
  status          client_doc_status NOT NULL DEFAULT 'pending',
  received_at     TIMESTAMP,               -- Thời điểm staff xác nhận đã nhận
  received_by     UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Email nhắc nhở
  reminder_sent_count  INTEGER NOT NULL DEFAULT 0,
  last_reminder_at     TIMESTAMP,
  reminded_email       VARCHAR(150),       -- Email KH đã gửi nhắc nhở tới

  -- Shareable public link
  public_token         VARCHAR(64) UNIQUE,     -- UUID token để tạo link công khai
  token_expires_at     TIMESTAMP,              -- Thời điểm link hết hạn
  token_submitted_at   TIMESTAMP,              -- Thời điểm KH submit qua link
  token_submitted_data JSONB,                  -- Dữ liệu thô KH điền vào form

  notes           TEXT,                    -- Ghi chú nội bộ của staff

  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cdr_task      ON client_document_requests(task_id);
CREATE INDEX idx_cdr_company   ON client_document_requests(company_id);
CREATE INDEX idx_cdr_status    ON client_document_requests(status);
CREATE INDEX idx_cdr_deadline  ON client_document_requests(deadline_date) WHERE status = 'pending';
CREATE INDEX idx_cdr_token     ON client_document_requests(public_token) WHERE public_token IS NOT NULL;
```

| Column | Mô tả |
|--------|-------|
| `task_id` | **Nullable** — tham chiếu task tùy chọn (ngữ cảnh). Khi task bị xóa → `SET NULL`, CDR vẫn còn |
| `company_id` | Denormalized từ task để query tổng quan theo KH nhanh hơn |
| `document_name` | Tên tài liệu KH cần cung cấp, ví dụ: "Bảng chấm công tháng 5" |
| `deadline_date` | NULL = không đặt hạn; có giá trị = cron job tự đánh dấu `overdue` khi qua hạn |
| `status` | `pending` → `received` (staff xác nhận) hoặc `overdue` (cron tự chuyển) hoặc `not_required` (huỷ) |
| `public_token` | Token 64 ký tự (UUID v4 no-dashes) để tạo URL `/public/form/:token` — NULL nếu chưa tạo link |
| `token_expires_at` | Staff đặt thời hạn link khi tạo (thường 7–30 ngày); NULL = không hết hạn |
| `token_submitted_data` | JSONB chứa dữ liệu KH điền: tên liên hệ, mô tả, ghi chú, và **link chia sẻ** (Google Drive / Zalo / Dropbox…) — **không upload file** lên hệ thống |

---

## TABLE: company_archive_years (Năm Lưu Trữ Hồ Sơ)

> Migration: `migrations/064_archive_years.sql`
> Mỗi năm lưu trữ là một record độc lập — xóa năm = cascade toàn bộ dòng chứng từ của năm đó.

```sql
CREATE TABLE company_archive_years (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID    NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  year       INT     NOT NULL CHECK (year >= 2000 AND year <= 2100),
  notes      TEXT,              -- Ghi chú cấp năm (VD: HĐ nguyên tắc, thông tin chung)
  created_by UUID    REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_archive_year UNIQUE (company_id, year)
);

CREATE INDEX idx_cay_company ON company_archive_years(company_id);
```

| Column | Mô tả |
|--------|-------|
| `company_id` | Công ty KH — ON DELETE CASCADE: xóa công ty = xóa toàn bộ năm lưu trữ |
| `year` | Năm lưu trữ — CHECK (2000–2100); UNIQUE per company ngăn trùng năm |
| `notes` | Ghi chú cấp năm, ví dụ: "HĐ nguyên tắc 22/05/2026 — Bản giấy, hai bên ký + đóng dấu" |

---

## TABLE: company_archive_docs (Dòng Chứng Từ Lưu Trữ)

> Migration: `migrations/065_archive_docs.sql`

```sql
CREATE TABLE company_archive_docs (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  year_id         UUID         NOT NULL REFERENCES company_archive_years(id) ON DELETE CASCADE,
  document_type   VARCHAR(300) NOT NULL,     -- Loại chứng từ: "Bảng chấm công + Bảng lương"
  detail          VARCHAR(500),              -- Chi tiết / mô tả bổ sung
  months          JSONB        NOT NULL DEFAULT
    '{"1":"","2":"","3":"","4":"","5":"","6":"","7":"","8":"","9":"","10":"","11":"","12":""}',
  notes           TEXT,                      -- Ghi chú nội bộ
  characteristics VARCHAR(300),              -- Đặc điểm: "Song ngữ", "Bản giấy", "Bản scan"...
  position        INT          NOT NULL DEFAULT 0,   -- Thứ tự hiển thị (kéo thả reorder)
  created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cad_year     ON company_archive_docs(year_id);
CREATE INDEX idx_cad_position ON company_archive_docs(year_id, position);
```

| Column | Mô tả |
|--------|-------|
| `year_id` | Năm lưu trữ — ON DELETE CASCADE: xóa năm = xóa toàn bộ dòng chứng từ |
| `document_type` | Tên loại hồ sơ (nhập tự do), ví dụ: "Bảng chấm công + Bảng lương" |
| `detail` | Mô tả chi tiết hoặc tên đối tác liên quan |
| `months` | JSONB 12 key cố định `"1"` – `"12"`, giá trị free text (`x`, `kps`, rỗng...) |
| `notes` | Ghi chú nội bộ của nhân viên phụ trách |
| `characteristics` | Đặc điểm ngắn: "Song ngữ", "Bản giấy + bản scan", "Bản giấy" |
| `position` | Thứ tự hiển thị trong bảng — hỗ trợ kéo thả reorder |

**Cột "Năm" hiển thị trên UI — không lưu DB (computed tại frontend):**
```js
const yearCount = Object.values(doc.months).filter(v => v.trim() !== '').length
```

**Pattern PATCH một ô tháng — JSONB merge operator:**
```sql
UPDATE company_archive_docs
SET months = months || '{"3": "x"}'::jsonb,
    updated_at = NOW()
WHERE id = $1;
```
Operator `||` chỉ ghi đè đúng key được chỉ định, 11 key còn lại giữ nguyên.

---

## TABLE: company_csc_contracts (HĐ Khách Hàng / Nhà Cung Cấp)

> Migration: `migrations/068_csc_contracts.sql`

```sql
CREATE TABLE company_csc_contracts (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contract_party   VARCHAR(100),
  party_name       VARCHAR(300) NOT NULL,
  contract_content VARCHAR(500),
  contract_number  VARCHAR(100),
  contract_date    DATE,
  end_date         DATE,
  notes            TEXT,
  custom_fields    JSONB        NOT NULL DEFAULT '{}',
  created_by       UUID         NOT NULL REFERENCES users(id),
  created_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_csc_company  ON company_csc_contracts(company_id);
CREATE INDEX idx_csc_end_date ON company_csc_contracts(end_date) WHERE end_date IS NOT NULL;
```

| Column | Mô tả |
|--------|-------|
| `company_id` | Công ty KH đang xem — ON DELETE CASCADE |
| `contract_party` | Đối tượng hợp đồng: "Nhà cung cấp", "Khách hàng"... (tự do nhập) |
| `party_name` | Tên đối tượng ký kết (bắt buộc) |
| `contract_content` | Nội dung / mục đích hợp đồng |
| `contract_number` | Số hợp đồng |
| `contract_date` | Ngày ký |
| `end_date` | Ngày kết thúc — NULL nghĩa là vô thời hạn |
| `custom_fields` | JSONB — cột tùy chỉnh do người dùng tự thêm |
| `created_by` | Người tạo bản ghi |

**Computed tại query time (không lưu DB):**
```sql
CASE WHEN end_date IS NULL THEN NULL
     ELSE (end_date - CURRENT_DATE)::INTEGER
END AS days_remaining,
CASE
  WHEN end_date IS NULL              THEN 'permanent'
  WHEN end_date < CURRENT_DATE       THEN 'expired'
  WHEN end_date - CURRENT_DATE <= 30 THEN 'expiring_soon'
  ELSE                                    'active'
END AS contract_status
```

---

## TABLE: company_csc_columns (Cột Tùy Chỉnh HĐ KH.NCC)

> Migration: `migrations/069_csc_columns.sql`

```sql
CREATE TABLE company_csc_columns (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  col_name   VARCHAR(200) NOT NULL,
  col_type   VARCHAR(10)  NOT NULL DEFAULT 'text'
             CHECK (col_type IN ('text', 'number', 'date')),
  position   INT          NOT NULL DEFAULT 0,
  created_at TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_csc_cols_company ON company_csc_columns(company_id);
```

| Column | Mô tả |
|--------|-------|
| `col_name` | Tên cột do người dùng đặt |
| `col_type` | Kiểu dữ liệu: `text` / `number` / `date` |
| `position` | Thứ tự hiển thị |

---

## Tóm Tắt Các Bảng

| # | Bảng | Mô tả | Quan hệ chính |
|---|------|-------|---------------|
| 1 | `users` | Nhân viên và quản lý | — |
| 2 | `refresh_tokens` | JWT refresh token | N:1 users |
| 3 | `companies` | Hồ sơ doanh nghiệp KH | N:1 users (assigned_staff) |
| 4 | `staff_company_assignments` | Lịch sử phân công | N:1 companies, users |
| 5 | `task_types` | Thư viện loại CV (Lớp 1) | — |
| 6 | `task_type_checklist_templates` | Checklist mặc định | N:1 task_types |
| 7 | `task_type_custom_field_schemas` | Schema custom fields | N:1 task_types |
| 8 | `customer_task_schedules` | Lịch lặp theo KH (Lớp 2) | N:1 companies, task_types |
| 9 | `tasks` | Công việc thực tế | N:1 companies, users, schedules |
| 10 | `task_checklist_items` | Subtask / checklist | N:1 tasks |
| 11 | `task_dependencies` | Phụ thuộc giữa tasks | N:N tasks (self-join) |
| 12 | `task_comments` | Comment nội bộ | N:1 tasks, users |
| 13 | `task_activity_logs` | Nhật ký hoạt động | N:1 tasks |
| 14 | `task_custom_field_values` | Giá trị custom fields | N:1 tasks, field_schemas |
| 15 | `task_time_logs` | Time tracking | N:1 tasks, users |
| 16 | `documents` | Metadata file OneDrive | N:1 companies, tasks |
| 17 | `notifications` | Thông báo hệ thống | N:1 users, tasks |
| 18 | `report_jobs` | Lịch sử xuất báo cáo | N:1 users |
| 19 | `system_configs` | Cấu hình hệ thống | — |
| 20 | `audit_logs` | Audit trail (immutable) | N:1 users |
| 21 | `payroll_periods` | Kỳ lương theo tháng | N:1 users (created_by, confirmed_by) |
| 22 | `payroll_records` | Lương/thưởng từng nhân viên | N:1 payroll_periods, users |
| 23 | `company_credentials` | Tài khoản hệ thống KH (mã hóa) | N:1 companies |
| **—** | **— Module 7: Chấm Công —** | | |
| 24 | `shifts` | Định nghĩa ca làm việc | N:1 users (created_by) |
| 25 | `work_schedules` | Lịch ca từng ngày cho từng NV | N:1 users, shifts |
| 26 | `attendance_logs` | Raw log check-in/out (append-only) | N:1 users |
| 27 | `attendance_records` | Bảng công ngày (1 row/người/ngày) | N:1 users, shifts, leave_requests |
| 28 | `leave_requests` | Đơn nghỉ phép | N:1 users (user_id, approved_by) |
| 29 | `overtime_requests` | Đơn tăng ca / OT | N:1 users (user_id, approved_by) |
| 30 | `attendance_adjustments` | Điều chỉnh bảng công — audit trail | N:1 attendance_records, users |
| 31 | `public_holidays` | Ngày lễ quốc gia | — |
| **—** | **— Module 8: Client Document Requests —** | | |
| 32 | `client_document_requests` | Yêu cầu tài liệu từ KH (entity độc lập) | N:1 companies, users; N:0..1 tasks (nullable) |
| **—** | **— Module 1: Công Ty (bổ sung) —** | | |
| 33 | `company_labor_contracts` | Theo dõi HĐLĐ nhân viên KH | N:1 companies, users (created_by) |
| 34 | `company_archive_years` | Năm lưu trữ hồ sơ theo công ty KH | N:1 companies |
| 35 | `company_archive_docs` | Dòng chứng từ lưu trữ theo năm | N:1 company_archive_years (cascade) |
| 36 | `company_csc_contracts` | HĐ khách hàng / nhà cung cấp | N:1 companies, users (created_by) |
| 37 | `company_csc_columns` | Cột tùy chỉnh tab HĐ KH.NCC | N:1 companies |

---

---

## [MODULE 7] TABLE: shifts (Ca Làm Việc)

> Migration: `migrations/008_attendance_module.sql`

```sql
CREATE TABLE shifts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(100) NOT NULL,        -- 'Ca Hành Chính', 'Ca Sáng', ...
  shift_type     shift_type NOT NULL DEFAULT 'fixed',
  start_time     TIME,                          -- NULL nếu flexible
  end_time       TIME,                          -- NULL nếu flexible
  break_minutes  INTEGER NOT NULL DEFAULT 60,   -- Giờ nghỉ giữa ca (phút)
  required_hours NUMERIC(4,2),                  -- Cho ca flexible: tổng giờ yêu cầu/ngày
  tolerance_in   INTEGER NOT NULL DEFAULT 15,   -- Phút trễ cho phép (không tính trễ)
  tolerance_out  INTEGER NOT NULL DEFAULT 15,   -- Phút về sớm cho phép
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by     UUID NOT NULL REFERENCES users(id),
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shifts_active ON shifts(is_active);

-- Seed: Ca Hành Chính 08:00–17:00 (tạo ngay sau khi có admin user)
INSERT INTO shifts (name, shift_type, start_time, end_time, break_minutes, tolerance_in, tolerance_out, created_by)
VALUES (
  'Ca Hành Chính', 'fixed', '08:00:00', '17:00:00', 60, 15, 15,
  (SELECT id FROM users WHERE role = 'admin' LIMIT 1)
);
```

| Column | Mô tả |
|--------|-------|
| `tolerance_in` | Đi muộn ≤ tolerance_in phút → vẫn tính `present`. Đi muộn hơn → `late` |
| `break_minutes` | Trừ ra khi tính `actual_hours` (nghỉ trưa không tính vào giờ làm) |
| `required_hours` | Chỉ dùng cho ca `flexible`: ví dụ 8.0 giờ/ngày |

---

## [MODULE 7] TABLE: work_schedules (Lịch Ca Nhân Viên)

```sql
-- Lịch ca từng ngày cho từng nhân viên — admin tạo trước theo tháng hoặc bulk generate.
-- is_day_off = TRUE → ngày nghỉ lịch (T7, CN, nghỉ bù), không cần check-in.
CREATE TABLE work_schedules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_date   DATE NOT NULL,
  shift_id    UUID REFERENCES shifts(id) ON DELETE SET NULL,  -- NULL nếu is_day_off = TRUE
  is_day_off  BOOLEAN NOT NULL DEFAULT FALSE,
  notes       TEXT,
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, work_date)
);

CREATE INDEX idx_ws_user_date ON work_schedules(user_id, work_date);
CREATE INDEX idx_ws_date      ON work_schedules(work_date);
CREATE INDEX idx_ws_shift     ON work_schedules(shift_id);
```

---

## [MODULE 7] TABLE: attendance_logs (Raw Log Check-in/out — Append-Only)

```sql
-- Bảng raw log — KHÔNG BAO GIỜ UPDATE/DELETE.
-- Mỗi lần check-in hoặc check-out → append 1 row mới.
-- Khi tính toán: MIN(logged_at) WHERE log_type='check_in' = giờ vào thực tế;
--               MAX(logged_at) WHERE log_type='check_out' = giờ ra thực tế.
-- Xử lý bấm nhầm nhiều lần một cách tự nhiên.
CREATE TABLE attendance_logs (
  id          BIGSERIAL PRIMARY KEY,           -- bigserial cho volume cao
  user_id     UUID NOT NULL REFERENCES users(id),
  log_type    attendance_log_type NOT NULL,
  logged_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  method      checkin_method NOT NULL DEFAULT 'web',
  device_info VARCHAR(200),                    -- Browser UA hoặc tên thiết bị mobile
  ip_address  INET,
  notes       TEXT,                            -- Ghi chú nếu admin nhập tay
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_al_user_date ON attendance_logs(user_id, logged_at);
CREATE INDEX idx_al_logged_at ON attendance_logs(logged_at DESC);

-- Bảo vệ tính bất biến của raw log
REVOKE DELETE ON attendance_logs FROM PUBLIC;
```

---

## [MODULE 7] TABLE: attendance_records (Bảng Công Ngày — 1 Row/Người/Ngày)

```sql
-- Kết quả tính toán sau mỗi ngày — tự động tạo/cập nhật khi check-in/out.
-- Admin có thể điều chỉnh (ghi vào attendance_adjustments để audit).
CREATE TABLE attendance_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id),
  work_date        DATE NOT NULL,
  shift_id         UUID REFERENCES shifts(id) ON DELETE SET NULL,

  -- Thời gian thực tế
  check_in_time    TIMESTAMP,               -- NULL nếu absent / chưa check-in
  check_out_time   TIMESTAMP,               -- NULL nếu chưa check-out
  actual_hours     NUMERIC(4,2),            -- Tổng giờ thực tế (đã trừ break)

  -- Lệch so với ca
  late_minutes     INTEGER NOT NULL DEFAULT 0,   -- Phút đi trễ (0 nếu đúng giờ hoặc không trễ)
  early_minutes    INTEGER NOT NULL DEFAULT 0,   -- Phút về sớm (0 nếu đúng giờ)

  -- Kết quả tính toán
  work_units       NUMERIC(3,1) NOT NULL DEFAULT 0.0,  -- 0.0 | 0.5 | 1.0
  status           attendance_status NOT NULL DEFAULT 'absent',

  -- Metadata
  is_adjusted      BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE nếu admin đã điều chỉnh
  is_holiday       BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE nếu ngày lễ quốc gia
  leave_request_id UUID REFERENCES leave_requests(id) ON DELETE SET NULL,
  ot_hours         NUMERIC(4,2) NOT NULL DEFAULT 0, -- Tổng giờ OT được duyệt trong ngày này
  notes            TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, work_date)
);

CREATE INDEX idx_ar_user_date ON attendance_records(user_id, work_date);
CREATE INDEX idx_ar_date      ON attendance_records(work_date);
CREATE INDEX idx_ar_status    ON attendance_records(status);
CREATE INDEX idx_ar_period    ON attendance_records(work_date, user_id)
  WHERE status NOT IN ('holiday');
```

**Quy tắc tính `work_units` sau check-out:**

| Điều kiện | work_units |
|-----------|-----------|
| `actual_hours / required_hours ≥ 0.8` | **1.0** |
| `actual_hours / required_hours ≥ 0.5` | **0.5** |
| `actual_hours / required_hours < 0.5` | **0.0** |
| Nghỉ phép được duyệt (`on_leave`, `wfh`, `business_trip`) | **1.0** |
| Ngày lễ (`holiday`) | **1.0** |
| Vắng không phép (`absent`) | **0.0** |

---

## [MODULE 7] TABLE: leave_requests (Đơn Nghỉ Phép)

```sql
CREATE TABLE leave_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id),
  leave_type     leave_type NOT NULL,
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  total_days     NUMERIC(4,1) NOT NULL,      -- Tính khi tạo (trừ T7, CN, lễ)
  reason         TEXT,
  status         request_status NOT NULL DEFAULT 'pending',
  approved_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at    TIMESTAMP,
  rejection_note TEXT,                       -- Lý do từ chối nếu rejected
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),

  CHECK (end_date >= start_date)
);

CREATE INDEX idx_lr_user   ON leave_requests(user_id);
CREATE INDEX idx_lr_status ON leave_requests(status);
CREATE INDEX idx_lr_dates  ON leave_requests(start_date, end_date);
```

---

## [MODULE 7] TABLE: overtime_requests (Đơn OT)

```sql
CREATE TABLE overtime_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id),
  ot_date        DATE NOT NULL,
  start_time     TIME NOT NULL,
  end_time       TIME NOT NULL,
  ot_hours       NUMERIC(4,2) NOT NULL,      -- Tính tự động từ start–end (trừ break nếu OT > 4h)
  ot_rate        NUMERIC(3,1) NOT NULL,      -- 1.5 (ngày thường) / 2.0 (cuối tuần) / 3.0 (ngày lễ)
  reason         TEXT,
  status         request_status NOT NULL DEFAULT 'pending',
  approved_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at    TIMESTAMP,
  rejection_note TEXT,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_or_user   ON overtime_requests(user_id);
CREATE INDEX idx_or_status ON overtime_requests(status);
CREATE INDEX idx_or_date   ON overtime_requests(ot_date);
```

| ot_rate | Áp dụng khi |
|---------|------------|
| 1.5 | Ngày làm việc bình thường |
| 2.0 | T7 hoặc CN (cuối tuần) |
| 3.0 | Ngày lễ quốc gia (`public_holidays`) |

---

## [MODULE 7] TABLE: attendance_adjustments (Điều Chỉnh — Audit Trail)

```sql
-- Mỗi lần admin chỉnh sửa attendance_records → tạo 1 row tại đây.
-- KHÔNG BAO GIỜ xóa hoặc sửa. Là audit trail bất biến tương tự audit_logs.
CREATE TABLE attendance_adjustments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_record_id UUID NOT NULL REFERENCES attendance_records(id),
  field_name           VARCHAR(80) NOT NULL,   -- Cột bị sửa: 'check_in_time', 'status', ...
  before_value         TEXT,
  after_value          TEXT,
  reason               TEXT NOT NULL,
  adjusted_by          UUID NOT NULL REFERENCES users(id),
  adjusted_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_adj_record ON attendance_adjustments(attendance_record_id);
CREATE INDEX idx_adj_by     ON attendance_adjustments(adjusted_by);

REVOKE UPDATE, DELETE ON attendance_adjustments FROM PUBLIC;
```

---

## [MODULE 7] TABLE: public_holidays (Ngày Lễ Quốc Gia)

```sql
CREATE TABLE public_holidays (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date  DATE NOT NULL UNIQUE,
  name          VARCHAR(200) NOT NULL,           -- 'Tết Dương Lịch', 'Giỗ Tổ Hùng Vương', ...
  ot_multiplier NUMERIC(3,1) NOT NULL DEFAULT 3.0,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ph_date ON public_holidays(holiday_date);

-- Seed data: Ngày lễ Việt Nam năm 2026
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

---

## [MODULE 7] ALTER TABLE: users (Thêm Cột Chấm Công)

```sql
-- Thêm vào users: ca mặc định và số ngày phép năm
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS default_shift_id    UUID REFERENCES shifts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS annual_leave_days   NUMERIC(4,1) NOT NULL DEFAULT 12.0;

-- annual_leave_days: Số ngày phép năm theo hợp đồng (mặc định 12 ngày/năm theo Luật LĐ VN)
```

---

## Data Retention Policy

| Loại dữ liệu | Thời gian lưu | Lý do |
|-------------|---------------|-------|
| Tasks (completed) | 5 năm | Yêu cầu pháp lý kế toán |
| Tasks (deleted/cancelled) | 1 năm rồi purge | |
| task_activity_logs | 3 năm | Truy vết lịch sử |
| task_time_logs | 3 năm | Phân tích hiệu suất |
| documents (metadata) | Theo vòng đời task | File thật lưu trên OneDrive |
| notifications | 90 ngày | Làm sạch inbox |
| report_jobs (files) | 30 ngày | Tái xuất khi cần |
| audit_logs | Vĩnh viễn | Immutable, không xóa |
| refresh_tokens (expired) | Purge sau 7 ngày | Cleanup định kỳ |
| payroll_records | Vĩnh viễn | Yêu cầu pháp lý kế toán lao động |
| company_credentials | Theo vòng đời hợp đồng KH | Xóa khi `companies.status = terminated` và quá 1 năm |
| attendance_logs | 5 năm | Yêu cầu pháp lý lao động VN |
| attendance_records | 5 năm | Yêu cầu pháp lý lao động VN |
| attendance_adjustments | Vĩnh viễn | Immutable audit trail |
| leave_requests | 5 năm | Hồ sơ lao động |
| overtime_requests | 5 năm | Hồ sơ lao động |
| public_holidays | Vĩnh viễn | Cập nhật thủ công hàng năm |
| client_document_requests | 5 năm | Lịch sử theo dõi yêu cầu tài liệu KH (giữ ngay cả khi task bị xóa) |
