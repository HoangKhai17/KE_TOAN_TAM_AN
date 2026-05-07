# 05 — Database Schema Design
> Phiên bản: 1.0 | Ngày tạo: 2026-05-07 | Stack: PostgreSQL 16 + Docker

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

-- Loại báo cáo xuất
CREATE TYPE report_type_enum AS ENUM (
  'monthly_summary', 'staff_performance', 'customer_status',
  'sla_compliance', 'aging', 'velocity', 'forecast', 'custom'
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
