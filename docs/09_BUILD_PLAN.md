# 09 — Build Plan: Kế Toán Tâm An
> Phiên bản: 1.0 | Ngày tạo: 2026-05-07
> Stack: Node.js (Express) + React (Vite) + PostgreSQL 16 + Redis + Docker Compose

---

## Tổng Quan Kế Hoạch

| Phase | Tên | Ước tính | Phụ thuộc | Status |
|-------|-----|----------|-----------|--------|
| 0 | Environment & Project Structure | 2–3 ngày | — | ✅ Hoàn thành |
| 1 | Database — Migrations & Seed | 2–3 ngày | Phase 0 | ✅ Hoàn thành |
| 2 | Authentication & User Management | 3–4 ngày | Phase 1 | 🔄 Backend ✅ / Frontend 🔄 |
| 3 | Company & Staff Management (API + UI) | 4–5 ngày | Phase 2 | 🔄 Backend ✅ / Frontend 🔄 |
| 4 | Task Type Library — Lớp 1 (API + UI) | 2–3 ngày | Phase 3 | ✅ Hoàn thành |
| 5 | Customer Task Schedules — Lớp 2 (API + UI) | 3–4 ngày | Phase 4 | 🔄 Backend ✅ / Frontend ✅ |
| 6 | Task Lifecycle — Core (API + UI) | 5–6 ngày | Phase 5 | 🔄 Backend ✅ / Frontend ⏳ |
| 7 | Task Extensions — Checklist, Deps, Time, Custom Fields | 4–5 ngày | Phase 6 |
| 8 | Job Scheduler — Tự Động Sinh Task | 3–4 ngày | Phase 5 |
| 9 | Credential Vault (API + UI) | 2–3 ngày | Phase 3 |
| 10 | Payroll Management (API + UI) | 3–4 ngày | Phase 2 |
| 11 | Document Management — OneDrive | 3–4 ngày | Phase 6 |
| 12 | Notifications & Escalation | 3–4 ngày | Phase 6, 8 |
| 13 | Dashboard & Reports | 5–7 ngày | Phase 6, 7 |
| 14 | Security Hardening | 2–3 ngày | Phase 13 |
| 15 | Observability — Logging, Sentry, Metrics | 2–3 ngày | Phase 14 |
| 16 | Production Deployment | 2–3 ngày | Phase 15 |

**Tổng ước tính:** 50–65 ngày làm việc (solo developer)

---

## Quy Tắc Chung Cho Tất Cả Phase

```
Trước khi bắt đầu phase:
□ Đọc lại section này trong BUILD_PLAN
□ Kiểm tra tất cả prerequisites đã hoàn thành

Trong khi làm:
□ Viết migration trước khi viết code
□ Viết API trước khi viết UI
□ Test API bằng Swagger/curl trước khi kết nối UI
□ Commit sau mỗi task nhỏ (không commit cả phase một lần)

Khi kết thúc phase:
□ Chạy toàn bộ test suite — không có test fail
□ Check lại Acceptance Criteria từng mục
□ Update PROGRESS.md (xem cuối tài liệu)
□ Review log không chứa sensitive data
```

---

## PHASE 0 — Environment & Project Structure

**Mục tiêu:** Thiết lập toàn bộ scaffolding, cấu hình Docker, coding standards — không viết business logic.

### 0.1 Cấu Trúc Thư Mục

```
ke-toan-tam-an/
├── backend/                  # Node.js + Express
│   ├── src/
│   │   ├── config/           # db.js, redis.js, logger.js, env.js
│   │   ├── middleware/        # auth.js, rbac.js, validate.js, errorHandler.js
│   │   ├── modules/          # Mỗi module có router + controller + service + schema
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── companies/
│   │   │   ├── tasks/
│   │   │   ├── task-types/
│   │   │   ├── schedules/
│   │   │   ├── credentials/
│   │   │   ├── payroll/
│   │   │   ├── documents/
│   │   │   ├── notifications/
│   │   │   └── reports/
│   │   ├── jobs/             # Scheduler jobs (cron)
│   │   ├── utils/            # encrypt.js, mailer.js, pagination.js
│   │   └── app.js            # Express app factory
│   ├── migrations/           # db-migrate SQL files (up + down)
│   ├── seeds/                # Seed data
│   ├── tests/
│   │   ├── unit/
│   │   └── integration/
│   ├── .env.example
│   ├── package.json
│   └── Dockerfile
├── frontend/                 # React + Vite
│   ├── src/
│   │   ├── api/              # axios instances + per-module API calls
│   │   ├── components/       # Shared UI components
│   │   │   ├── ui/           # Button, Input, Modal, Table, Badge...
│   │   │   ├── layout/       # Sidebar, Header, PageWrapper
│   │   │   └── shared/       # TaskCard, CompanyBadge, StatusChip...
│   │   ├── pages/            # Mỗi route là 1 page
│   │   │   ├── Login/
│   │   │   ├── Dashboard/
│   │   │   ├── Companies/
│   │   │   ├── Staff/
│   │   │   ├── Tasks/
│   │   │   ├── TaskTypes/
│   │   │   ├── Schedules/
│   │   │   ├── Credentials/
│   │   │   ├── Payroll/
│   │   │   ├── Documents/
│   │   │   └── Reports/
│   │   ├── stores/           # Zustand stores
│   │   ├── hooks/            # Custom React hooks
│   │   ├── utils/            # formatDate, formatCurrency, cn()...
│   │   ├── types/            # TypeScript interfaces (nếu dùng TS)
│   │   └── main.jsx
│   ├── .env.example
│   ├── package.json
│   ├── vite.config.js
│   └── Dockerfile
├── nginx/
│   ├── nginx.conf
│   └── Dockerfile
├── docker-compose.yml        # Development
├── docker-compose.prod.yml   # Production
├── .gitignore
└── README.md
```

### 0.2 Task List

**Docker & Infrastructure**
- [x] Tạo `docker-compose.yml` với 4 services: `nginx`, `backend`, `postgres`, `redis`
- [x] PostgreSQL: đặt `POSTGRES_DB=ktta_db`, `POSTGRES_USER`, `POSTGRES_PASSWORD` từ .env
- [x] Redis: set password, persist với `appendonly yes`
- [x] Health check cho postgres: `pg_isready` và redis: `redis-cli ping`
- [x] Volume: `postgres_data`, `redis_data`, `nginx_static` (cho React build)
- [x] Network: `internal` network — backend, postgres, redis trong cùng network, không expose postgres/redis ra ngoài
- [x] Kiểm tra `docker compose up` chạy thành công, tất cả services healthy

**Backend Setup**
- [x] `npm init` trong `/backend`, cài dependencies:
  ```
  express pg redis bcrypt jsonwebtoken uuid zod helmet cors
  express-rate-limit morgan winston node-cron axios dotenv
  ```
- [x] Dev dependencies: `nodemon jest supertest @faker-js/faker`
- [x] `src/config/env.js` — validate tất cả biến môi trường bắt buộc khi khởi động (throw nếu thiếu)
- [x] `src/config/db.js` — pg Pool, test connection khi khởi động
- [x] `src/config/redis.js` — ioredis client, test connection
- [x] `src/config/logger.js` — Winston: JSON format prod, pretty format dev
- [x] `src/app.js` — Express factory: helmet, cors, morgan, json parser, routes mount
- [x] `src/middleware/errorHandler.js` — global error handler, không lộ stack trace trong prod
- [x] Script `npm run dev` (nodemon), `npm start`, `npm test`
- [x] `.env.example` với tất cả keys (không có giá trị thật)

**Frontend Setup**
- [x] `npm create vite@latest frontend -- --template react` (hoặc react-ts)
- [x] Cài dependencies:
  ```
  axios react-router-dom zustand @tanstack/react-query
  recharts react-hook-form @hookform/resolvers
  date-fns lucide-react clsx tailwind-merge
  ```
- [x] Tailwind CSS setup, utility component classes (`.btn`, `.card`, `.input`)
- [x] Vite proxy: `/api` → `http://localhost:3000` (dev)
- [x] React Router: layout routes (protected vs public)
- [x] Axios instance: base URL, interceptor tự động thêm Bearer token, interceptor tự động refresh khi 401
- [x] `src/stores/authStore.js` — Zustand: user, token, login/logout actions
- [x] Script `npm run dev`, `npm run build`, `npm run preview`

**Nginx**
- [x] `nginx.conf`: serve React static từ `/usr/share/nginx/html`, proxy `/api/*` → `http://backend:3000`
- [x] Gzip compression cho static files
- [x] Cache-Control headers cho assets (1 năm cho hashed files)

**Coding Standards**
- [x] `.eslintrc` (backend + frontend)
- [x] `.prettierrc` (printWidth: 100, singleQuote: true, semi: false)
- [x] `.gitignore` — node_modules, .env, dist, coverage, *.log
- [x] ~~Husky + lint-staged~~ — **Đã bỏ** (quyết định 2026-05-07: dev solo, dùng `npm run lint` thủ công)
- [x] Conventional commits: feat/fix/chore/refactor/test/docs

**Acceptance Criteria Phase 0:** ✅
```
✅ docker compose up --build chạy không lỗi
✅ GET /api/health → { status: "ok", db: "ok", redis: "ok" }
✅ curl http://localhost:8080 → nginx serving (port 8080 thay 80 trên Windows dev)
✅ postgres và redis healthy, kết nối được từ backend container
⬜ git commit bị block nếu code không pass ESLint (Husky đã bỏ — dùng thủ công)
```

---

## PHASE 1 — Database: Migrations & Seed

**Mục tiêu:** Tạo đầy đủ 23 bảng, ENUMs, indexes, triggers, seed data ban đầu.

### 1.1 Migration Tool

- [x] Viết migration runner đơn giản bằng `fs` + `pg` (custom, không dùng ORM)
- [x] Convention: `NNN_<description>.sql` (up) + `NNN_<description>.down.sql`
- [x] Script: `npm run migrate:up`, `npm run migrate:down`, `npm run migrate:status`
- [x] Migration table: `schema_migrations(filename, applied_at)` để track đã chạy migration nào

### 1.2 Migration Files (thứ tự quan trọng)

- [x] `001_create_enums.sql` — 13 ENUM types
- [x] `002_create_users.sql` — Table users + 3 indexes
- [x] `003_create_refresh_tokens.sql`
- [x] `004_create_companies.sql` — Table companies + FTS index
- [x] `005_create_staff_company_assignments.sql`
- [x] `006_create_task_types.sql`
- [x] `007_create_task_type_checklist_templates.sql`
- [x] `008_create_task_type_custom_field_schemas.sql`
- [x] `009_create_customer_task_schedules.sql`
- [x] `010_create_tasks.sql` — Table tasks + 10 indexes (bao gồm FTS)
- [x] `011_create_task_checklist_items.sql`
- [x] `012_create_task_dependencies.sql`
- [x] `013_create_task_comments.sql`
- [x] `014_create_task_activity_logs.sql`
- [x] `015_create_task_custom_field_values.sql`
- [x] `016_create_task_time_logs.sql`
- [x] `017_create_documents.sql`
- [x] `018_create_notifications.sql`
- [x] `019_create_report_jobs.sql`
- [x] `020_create_system_configs.sql`
- [x] `021_create_audit_logs.sql` — bao gồm `REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC`
- [x] `022_create_payroll_periods.sql`
- [x] `023_create_payroll_records.sql` — bao gồm GENERATED ALWAYS AS columns
- [x] `024_create_company_credentials.sql`
- [x] `025_create_trigger_actual_hours.sql` — trigger update tasks.actual_hours

### 1.3 Seed Data

- [x] `seeds/001_admin_user.sql` — admin@ketoan-taman.vn / Admin@2026! (must_change_pw=TRUE)
- [x] `seeds/002_system_configs.sql` — 6 cấu hình mặc định
- [x] `seeds/003_task_types.sql` — 17 loại công việc phổ biến (Khai thuế / BCTC / Nhân sự / Chứng từ / Hành chính)
- [x] `seeds/004_task_type_checklists.sql` — Checklist cho 5 loại CV quan trọng nhất
- [x] Script: `npm run seed`

### 1.4 Verify

- [x] `npm run migrate:up` chạy không lỗi — 25 migrations applied
- [x] 23 bảng + `schema_migrations` = 24 tables tồn tại trong DB
- [x] Trigger `trg_task_time_logs_after` được tạo
- [x] `SELECT COUNT(*) FROM schema_migrations` → 25 rows
- [x] `SELECT COUNT(*) FROM task_types` → 17 rows
- [x] `SELECT COUNT(*) FROM system_configs` → 6 rows

**Acceptance Criteria Phase 1:** ✅
```
✅ migrate:up chạy từ empty DB thành công, không lỗi — 25/25 migrations
✅ Seed data insert không conflict (ON CONFLICT DO NOTHING)
✅ 23 bảng + trigger đúng cấu trúc schema
⬜ migrate:down rollback (có down files, chưa test toàn bộ chain)
⬜ Trigger actual_hours: cần test thủ công sau khi có tasks API (Phase 6)
```

---

## PHASE 2 — Authentication & User Management

**Mục tiêu:** Đăng nhập / đăng xuất / refresh token / phân quyền hoàn chỉnh. Frontend có màn hình login và protected routes.

### 2.1 Backend — Auth Module

**Endpoints:**
- [x] `POST /api/auth/login` — validate email+password, trả access_token + refresh_token (httpOnly cookie)
- [x] `POST /api/auth/refresh` — verify refresh token, rotation, trả access_token mới
- [x] `POST /api/auth/logout` — revoke refresh token hiện tại
- [x] `POST /api/auth/logout-all` — revoke toàn bộ refresh tokens của user (family)
- [x] `GET /api/auth/me` — trả thông tin user hiện tại từ token
- [x] `POST /api/auth/change-password` — đổi mật khẩu, invalidate tất cả sessions

**Logic chi tiết:**
- [x] `src/modules/auth/auth.service.js`:
  - `login(email, password)`: tìm user, bcrypt.compare, check status, check locked_until, reset login_attempts, tạo tokens
  - `register_failure(userId)`: tăng login_attempts, nếu >= max → set locked_until
  - `refreshToken(token)`: SHA-256 hash lookup, verify family không bị revoke, rotate (revoke old, insert new)
  - `logout(tokenHash)`: set revoked_at = NOW()
  - `logoutAll(userId, familyId)`: revoke toàn bộ family
- [x] `src/middleware/auth.js` — verify JWT Bearer token, attach `req.user = { id, role, jti, exp }`; Redis blacklist check
- [x] `src/middleware/rbac.js` — `requireRole('admin')` middleware factory
- [x] Refresh token lưu trong httpOnly cookie (không localStorage để chống XSS)
- [x] Access token 15 phút, refresh token 7 ngày

**Endpoints User Management:**
- [x] `GET /api/users` — [admin] danh sách nhân viên, pagination + filter (role/status/search)
- [x] `POST /api/users` — [admin] tạo user mới (set must_change_pw = true)
- [x] `GET /api/users/:id` — [admin] xem thông tin
- [x] `PATCH /api/users/:id` — [admin] cập nhật (name, phone, jobTitle, avatarUrl, role)
- [x] `PATCH /api/users/:id/status` — [admin] đổi status (active/inactive/suspended)
- [x] `DELETE /api/users/:id` — [admin] xóa user (không tự xóa bản thân)
- [ ] `POST /api/users/:id/reset-password` — [admin] reset password (phát password tạm) *(để dành sau)*

### 2.2 Backend — Validation

- [x] `src/modules/auth/auth.schema.js` — Zod schemas: loginSchema, changePasswordSchema
- [x] `src/modules/users/users.schema.js` — createUserSchema, updateUserSchema, updateStatusSchema
- [x] `src/middleware/validate.js` — middleware(schema) → validate req.body/params/query, trả 422 nếu sai

### 2.3 Backend — Audit

- [x] `src/lib/audit.js` — helper ghi audit_log với try/catch (không block request nếu fail)
- [x] Ghi audit_log cho: `auth.login`, `auth.login.failed`, `auth.refresh.reuse_detected`, `auth.logout`, `auth.logout_all`, `auth.change_password`, `user.created`, `user.updated`, `user.status_changed`, `user.deleted`

### 2.4 Frontend — Auth

- [x] `pages/Login/` — form email + password, show/hide password, loading state, error message
- [x] Axios interceptor: đính kèm Authorization header từ `authStore`
- [x] Axios interceptor: khi nhận 401 → tự động call `/api/auth/refresh` → retry original request → nếu refresh fail → redirect login
- [x] Protected route component: kiểm tra authStore, redirect `/login` nếu chưa đăng nhập
- [x] Bootstrap session: gọi `/auth/refresh` khi app mount, spinner khi chưa ready, proactive timer refresh 60s trước expiry
- [-] `must_change_pw === true` → redirect `/change-password` bắt buộc đổi mật khẩu trước khi dùng app *(App.jsx redirect về /dashboard tạm thời — Phase 2 TODO)*

### 2.5 Frontend — User Management Page

- [x] `pages/Staff/` — danh sách nhân viên dạng bảng: avatar, tên, email, chức danh, role, status
- [x] Filter: role (admin/staff), status (active/on_leave/resigned)
- [x] Modal tạo nhân viên mới (admin only)
- [x] Modal chỉnh sửa nhân viên (admin only)
- [x] Action: đổi trạng thái (active/on_leave/resigned), xóa nhân viên
- [-] Xem profile nhân viên: thông tin cơ bản + danh sách KH đang phụ trách + overview task *(chưa triển khai)*
- [-] Action: reset password (admin only) *(API resetUserPassword có sẵn, chưa có UI)*

**Acceptance Criteria Phase 2:**
```
✅ POST /api/auth/login với đúng credentials → 200 + tokens
✅ POST /api/auth/login với sai password 5 lần → tài khoản bị lock
✅ GET /api/auth/me với expired access token → 401
✅ POST /api/auth/refresh với valid refresh token → 200 + new tokens + old token revoked
✅ Dùng lại old refresh token sau khi rotate → 401 + toàn bộ family bị revoke
✅ Màn hình login hoạt động, redirect về dashboard sau login
✅ F5 trang bất kỳ → vẫn còn đăng nhập (token persist qua HttpOnly refresh cookie)
⏳ must_change_pw = true → không vào được app ngoài trang đổi mật khẩu (chưa làm — trang /change-password chưa tồn tại)
```

---

## PHASE 3 — Company & Staff Management

**Mục tiêu:** CRUD đầy đủ cho hồ sơ doanh nghiệp + phân công nhân viên. Frontend hiển thị và tìm kiếm được.

### 3.1 Backend — Companies

**Endpoints:**
- [x] `GET /api/companies` — danh sách, pagination (page, limit), filter (status, assigned_staff_id, business_type), search (name/tax_code FTS)
- [x] `POST /api/companies` — [admin] tạo công ty mới
- [x] `GET /api/companies/:id` — chi tiết + assigned_staff + tổng số task đang mở
- [x] `PATCH /api/companies/:id` — [admin] cập nhật thông tin
- [x] `DELETE /api/companies/:id` — [admin] soft-delete (set status = 'terminated')

**Staff Assignment:**
- [x] `GET /api/companies/:id/assignments` — lịch sử phân công
- [x] `POST /api/companies/:id/assign` — [admin] phân công nhân viên (tự động đóng assignment cũ)
- [x] Validation: chỉ được assign user có role = 'staff' và status = 'active'

**Logic:**
- [x] `companies.service.js` có method `getCompanySummary(id)` trả thêm: task_open_count, task_overdue_count
- [ ] Khi tạo công ty → tự động tạo thư mục OneDrive (Phase 11 sẽ implement, để placeholder)

### 3.2 Backend — Company Search

- [x] Full-text search: `to_tsvector('simple', name || ' ' || coalesce(tax_code,''))` đã có GIN index
- [x] Query: `WHERE fts_column @@ plainto_tsquery('simple', $1)`
- [x] Kết hợp search + filter trong cùng 1 query

### 3.3 Frontend — Companies

**Trang danh sách (`/companies`):**
- [x] Bảng: tên công ty, MST, loại hình, nhân viên phụ trách, trạng thái, số task mở/trễ
- [x] Search bar (debounce 300ms)
- [x] Filter dropdown: loại hình, trạng thái
- [x] Nút "Thêm khách hàng" (admin only)
- [x] Click row → mở trang chi tiết

**Trang chi tiết (`/companies/:id`):**
- [x] Tab 1: Thông tin hồ sơ (xem/chỉnh sửa qua modal Edit)
- [-] Tab 2: Danh sách công việc (link sang `/tasks?company_id=...`) — placeholder *(Phase 6)*
- [x] Tab 3: Tài liệu (placeholder — Phase 11)
- [x] Tab 4: Tài khoản hệ thống (placeholder — Phase 9)
- [x] Tab 5: Lịch sử phân công + modal phân công nhân viên mới
- [x] Tab 6: Lịch định kỳ — SchedulesTab đầy đủ *(Phase 5 — hoàn thành)*
- [x] Header badge: số task đang mở, số task quá hạn
- [x] Nút "Kết thúc hợp đồng" (admin only — soft delete)

**Acceptance Criteria Phase 3:**
```
✅ Tạo công ty mới → xuất hiện trong danh sách
✅ Search "ABC" → chỉ hiển thị công ty có "ABC" trong tên hoặc MST
✅ Phân công nhân viên → assignment cũ tự động đóng (end_date set)
✅ Xóa công ty → status = 'terminated', không xóa khỏi DB
✅ staff chỉ thấy được danh sách tất cả công ty (xem nhưng không edit nếu không phụ trách)
```

---

## PHASE 4 — Task Type Library (Lớp 1)

**Mục tiêu:** Admin quản lý thư viện loại công việc, checklist mặc định, custom field schemas.

### 4.1 Backend

**Endpoints:**
- [x] `GET /api/task-types` — danh sách, filter group_name, is_active
- [x] `POST /api/task-types` — [admin] tạo mới
- [x] `GET /api/task-types/:id` — chi tiết + checklist_templates + custom_field_schemas
- [x] `PATCH /api/task-types/:id` — [admin]
- [x] `POST /api/task-types/:id/toggle` — [admin] soft-deactivate (is_active toggle)

**Checklist Templates:**
- [x] `GET /api/task-types/:id/checklist`
- [x] `POST /api/task-types/:id/checklist` — thêm bước (auto-increment step_order)
- [x] `PATCH /api/task-types/:id/checklist/:stepId` — sửa text, đổi thứ tự
- [x] `DELETE /api/task-types/:id/checklist/:stepId`
- [x] `POST /api/task-types/:id/checklist/reorder` — truyền mảng [{id, step_order}] để sắp xếp lại

**Custom Field Schemas:**
- [x] `GET /api/task-types/:id/fields`
- [x] `POST /api/task-types/:id/fields` — tạo field schema (validate data_type + options hợp lệ)
- [x] `PATCH /api/task-types/:id/fields/:fieldId`
- [x] `DELETE /api/task-types/:id/fields/:fieldId`

### 4.2 Frontend — Task Types Page (`/settings/task-types`)

- [x] Danh sách card theo nhóm (Khai thuế / Báo cáo tài chính / Nhân sự...) — grouped + collapsible header
- [x] Expand card → xem checklist + custom fields (detail cache, lazy load)
- [x] Modal tạo/sửa loại công việc (tạo gồm initial checklist steps, sửa chỉ metadata)
- [x] Drag-and-drop reorder checklist steps (dùng `@dnd-kit/core` + `@dnd-kit/sortable`, optimistic UI)
- [x] Form thêm custom field: label, key (auto snake_case từ Vietnamese), data_type, required, options (nếu select)
- [x] Toggle is_active trực tiếp trên card
- [x] Sidebar link `/settings?section=task-types` + URL param `?section=` để active đúng tab
- [x] Redirect `/task-types` → `/settings?section=task-types` (App.jsx)

**Acceptance Criteria Phase 4:**
```
✅ Tạo task type với checklist 5 bước → bước hiển thị đúng thứ tự
✅ Reorder checklist → lưu thứ tự mới (DnD + reorderChecklist API)
✅ Tạo custom field type 'select' với options → options lưu đúng JSON
✅ Deactivate task type → không xuất hiện trong danh sách khi tạo schedule (filter isActive trong SchedulesTab)
```

---

## PHASE 5 — Customer Task Schedules (Lớp 2)

**Mục tiêu:** Cấu hình lịch lặp riêng cho từng khách hàng, validate đủ 9 recurrence types.

### 5.1 Backend

**Endpoints:**
- [x] `GET /api/companies/:companyId/schedules` — danh sách lịch của 1 KH
- [x] `POST /api/companies/:companyId/schedules` — tạo lịch mới
- [x] `GET /api/schedules/:id` — chi tiết
- [x] `PATCH /api/schedules/:id` — cập nhật
- [x] `DELETE /api/schedules/:id` — xóa (kiểm tra không xóa nếu đã có task được sinh)
- [x] `GET /api/schedules/:id/preview` — preview 10 ngày sẽ sinh task tiếp theo (không lưu DB)
- [x] `POST /api/schedules/:id/toggle` — bật/tắt is_active

**Validation `recurrence_config`:**
- [x] `src/utils/recurrence.validator.js` — validate theo từng type:
  - `daily`: `every_n_days` phải là số nguyên >= 1
  - `weekly`: `weekdays` là array, phần tử trong [0..6], không rỗng
  - `monthly_by_date`: `day` trong [1..31]
  - `monthly_by_weekday`: `weekday` trong [0..6], `week` trong [1..5]
  - `monthly_last_day`: config có thể rỗng `{}`
  - `quarterly`: `month_in_quarter` trong [1..3], `day` trong [1..31]
  - `yearly`: `month` trong [1..12], `day` trong [1..31]
  - `custom_dates`: `dates` là array ISO date strings, không rỗng
  - `once`: `date` là ISO date string YYYY-MM-DD

**Recurrence Calculator:**
- [x] `src/utils/recurrence.calculator.js` — functions `getNextOccurrence`, `getNextOccurrences`, `shouldGenerateToday`:
  - Xử lý đúng tháng 2 (monthly_last_day = 28/29), năm nhuận
  - monthly_by_weekday: tìm thứ N tuần thứ M, skip nếu tháng không có đủ tuần
  - Dùng `date-fns` (đã có trong package.json)

### 5.2 Frontend — Schedules trong trang Company

- [x] Tab "Lịch định kỳ" trong trang chi tiết KH (`SchedulesTab.jsx`)
- [x] Bảng: loại CV, chế độ lặp (label + mô tả ngắn), deadline offset, SLA override, NV thực hiện, trạng thái
- [x] Modal tạo lịch: chọn task type → chọn recurrence type → form động theo type → preview ngày kế tiếp
- [x] Modal chỉnh sửa lịch: readonly task type name, cập nhật tất cả trường còn lại
- [x] Form động — đủ 9 recurrence types:
  - `daily`: number input "Mỗi N ngày"
  - `weekly`: toggle buttons 7 ngày trong tuần (multi-select)
  - `monthly_by_date`: number picker 1–31
  - `monthly_by_weekday`: select "Thứ" + select "Tuần thứ N"
  - `monthly_last_day`: info text (không cần config)
  - `quarterly`: select tháng trong quý + number picker ngày
  - `yearly`: select tháng + number picker ngày
  - `custom_dates`: date input + add/remove list
  - `once`: date picker, min = today
- [x] Preview realtime: `utils/recurrencePreview.js` mirrors backend calculator (date-fns), hiển thị "10 lần kích hoạt tới" trong modal
- [x] Server preview modal: gọi `GET /schedules/:id/preview` cho lịch đã tồn tại
- [x] Toggle is_active (admin): bật/tắt với loading indicator
- [x] Xóa lịch (admin): confirm dialog + guard 409 "đã sinh task"
- [x] Validation: taskTypeId required, config per type, once/custom_dates không trong quá khứ
- [x] `src/api/schedules.js` — 7 hàm API client đầy đủ
- [x] `src/utils/recurrencePreview.js` — local calculator mirror backend

**Acceptance Criteria Phase 5:**
```
✅ Tạo schedule monthly_last_day → preview tháng 2 = ngày 28 (hoặc 29 nếu năm nhuận) — recurrencePreview.js dùng lastDayOfMonth từ date-fns
✅ Tạo schedule quarterly month_in_quarter=1 day=5 → preview đúng 5 tháng đầu quý
✅ Tạo schedule once date trong quá khứ → validation error (validateForm kiểm tra date <= today)
✅ Tạo schedule custom_dates với list dates → preview đúng thứ tự ngày (sort + filter future)
⏳ Toggle is_active = false → scheduler sẽ bỏ qua (Phase 8 — job chưa implement)
```

---

## PHASE 6 — Task Lifecycle (Core)

**Mục tiêu:** CRUD task đầy đủ, transitions trạng thái, activity log.

### 6.1 Backend — Tasks

**Endpoints:**
- [x] `GET /api/tasks` — danh sách với filters đa chiều:
  - `companyId`, `assignedTo`, `status` (multi), `priority` (multi)
  - `source` (auto/manual), `dueDateFrom`, `dueDateTo`
  - `periodLabel`, `isOverdue` (boolean)
  - `search` (FTS trên title + description)
  - pagination: `page`, `limit`, `sortBy`, `sortDir`
- [x] `POST /api/tasks` — tạo task thủ công (auto-copy checklist từ task type nếu có taskTypeId)
- [x] `GET /api/tasks/:id` — chi tiết task + checklist counts
- [x] `PATCH /api/tasks/:id` — cập nhật: title, description, assignedTo, dueDate, priority, slaDays
- [x] `DELETE /api/tasks/:id` — [admin] xóa + ghi audit log
- [x] `POST /api/tasks/:id/status` — chuyển trạng thái (validate transitions)
- [x] `GET /api/tasks/:id/activity` — activity log của task

**Status Transition Rules:**
- [x] `src/modules/tasks/tasks.transitions.js` — map allowed transitions:
  ```
  pending         → [in_progress, on_hold]
  in_progress     → [on_hold, pending_review, completed]
  on_hold         → [in_progress, needs_revision]
  pending_review  → [completed, needs_revision]
  needs_revision  → [in_progress]
  completed       → []
  ```
- [x] Khi chuyển sang `on_hold`: bắt buộc có `onHoldReason`
- [x] Khi chuyển sang `completed`: check tất cả checklist items done (hoặc có `force = true`)
- [x] Khi chuyển sang `completed`: set `completed_at = NOW()`
- [x] Rời `on_hold` → tự động clear `on_hold_reason`

**Activity Logging:**
- [x] `src/lib/activity.js` — fire-and-forget helper `logActivity(taskId, userId, action, oldVal, newVal, meta)`
- [x] Log: `created`, `status_changed`, `assigned`, `due_date_changed`, `priority_changed`

### 6.2 Frontend — Tasks

**Trang danh sách Tasks (`/tasks`):**
- [ ] **3 view modes**: List (bảng) / Board (Kanban) / Calendar — toggle bằng icon
- [ ] **List view**: sort, multi-column filter, bulk actions (assign, change priority)
- [ ] **Board view**: 6 cột (pending / in_progress / on_hold / pending_review / needs_revision / completed), drag card để đổi status, hiển thị tối đa 10 cards/cột + "Xem thêm"
- [ ] **Calendar view**: task deadline trên calendar tháng, click ngày → popover danh sách task ngày đó
- [ ] Filter bar: KH, nhân viên, trạng thái, ưu tiên, kỳ (period_label), trễ hạn, nguồn (auto/manual)
- [ ] Badge màu theo priority: urgent=đỏ đậm, high=cam, medium=vàng, low=xám
- [ ] Badge màu theo status với icon
- [ ] Indicator quá hạn: đỏ khi due_date < today + status != completed

**Trang chi tiết Task (`/tasks/:id`):**
- [ ] Header: title (inline edit), status badge, priority badge, KH, assigned to
- [ ] Action buttons: chuyển status, phân công lại, xóa (admin)
- [ ] Sidebar: due_date picker, SLA progress bar, actual_hours
- [ ] Tab: Mô tả | Checklist | Phụ thuộc | Comments | Activity Log | Time Log | Custom Fields

**Modal tạo task thủ công:**
- [ ] Fields: title, company, task_type (optional), assigned_to, due_date, priority, description
- [ ] Nếu chọn task_type → tự động copy checklist + custom fields

**Acceptance Criteria Phase 6:**
```
□ Tạo task → xuất hiện trong list, board, calendar
□ Kéo task trên Kanban từ pending → in_progress → DB cập nhật, activity log ghi
□ Chuyển sang on_hold không có reason → 422 error
□ Chuyển sang completed với checklist chưa xong → warning + confirm
□ completed_at được set khi và chỉ khi status = completed
□ GET /api/tasks?is_overdue=true → chỉ trả task quá hạn chưa hoàn thành
```

---

## PHASE 7 — Task Extensions

**Mục tiêu:** Checklist (tick bước), dependencies (phụ thuộc), comments, time tracking, custom fields.

### 7.1 Checklist Items

- [ ] `GET /api/tasks/:id/checklist`
- [ ] `POST /api/tasks/:id/checklist` — thêm bước mới
- [ ] `PATCH /api/tasks/:id/checklist/:itemId` — sửa text, đổi thứ tự
- [ ] `POST /api/tasks/:id/checklist/:itemId/toggle` — tick/untick (ghi activity log)
- [ ] `DELETE /api/tasks/:id/checklist/:itemId`
- [ ] UI: checkbox list, progress bar "3/5 bước hoàn thành", inline add new step

### 7.2 Task Dependencies

- [ ] `GET /api/tasks/:id/dependencies` — trả cả blockers (tasks phải xong trước) + blocked_by (tasks đang bị block)
- [ ] `POST /api/tasks/:id/dependencies` — thêm phụ thuộc
- [ ] `DELETE /api/tasks/:id/dependencies/:depId`
- [ ] Validation: check cycle detection (A→B→C→A là invalid) — dùng DFS
- [ ] Backend check: khi update status → nếu task này có blocker chưa completed → 422
- [ ] UI: section "Phụ thuộc vào" (danh sách task blockers + status badge), section "Được chờ bởi"

### 7.3 Task Comments

- [ ] `GET /api/tasks/:id/comments` — pagination, sort by created_at DESC
- [ ] `POST /api/tasks/:id/comments` — tạo comment
- [ ] `PATCH /api/tasks/:id/comments/:commentId` — [owner] sửa (set is_edited = true)
- [ ] `DELETE /api/tasks/:id/comments/:commentId` — [owner | admin]
- [ ] UI: comment box dưới cùng, danh sách comment với avatar, timestamp, "(đã chỉnh sửa)"

### 7.4 Time Tracking

- [ ] `GET /api/tasks/:id/time-logs`
- [ ] `POST /api/tasks/:id/time-logs` — ghi thời gian (hours, note, logged_date)
- [ ] `DELETE /api/tasks/:id/time-logs/:logId` — [owner | admin]
- [ ] Trigger PostgreSQL tự động cập nhật `tasks.actual_hours` (đã có từ Phase 1)
- [ ] UI: form nhỏ "Ghi thêm thời gian: [input hours] [input note]", bảng lịch sử time logs, tổng actual_hours vs SLA_days

### 7.5 Custom Field Values

- [ ] `GET /api/tasks/:id/custom-fields` — trả schema + giá trị hiện tại
- [ ] `PUT /api/tasks/:id/custom-fields` — upsert toàn bộ values (không patch từng field)
- [ ] Validation: kiểm tra field_schema thuộc đúng task_type của task
- [ ] UI: form động generated từ field schemas, render đúng input theo data_type

**Acceptance Criteria Phase 7:**
```
□ Tick checklist item → activity log ghi "checklist_checked"
□ Thêm dependency A → B → B → A → 422 cycle detection error
□ Khi task A chưa completed → update task B status → 422 blocked
□ Insert time_log 2h → tasks.actual_hours tăng 2h (trigger hoạt động)
□ Custom field type 'select' → chỉ cho phép giá trị trong options list
```

---

## PHASE 8 — Job Scheduler (Tự Động Sinh Task)

**Mục tiêu:** Cron job chạy hàng ngày, scan `customer_task_schedules` is_active, sinh tasks đúng ngày.

### 8.1 Scheduler Architecture

```
node-cron → chạy mỗi 6h một lần (hoặc 1 lần/ngày lúc 00:05)
     │
     ▼
src/jobs/taskGenerator.job.js
     │
     ├─ Query tất cả schedules is_active = true
     │
     ├─ Với mỗi schedule:
     │   ├─ Tính nextOccurrence(schedule, last_generated_at)
     │   ├─ Nếu nextOccurrence <= today → sinh task
     │   └─ Update last_generated_at = nextOccurrence
     │
     └─ Log kết quả: bao nhiêu task được sinh, bao nhiêu skip
```

### 8.2 Implementation

- [ ] `src/jobs/taskGenerator.job.js` — main job function
- [ ] `src/utils/recurrence.calculator.js` — hàm `shouldGenerateToday(schedule, today)`:
  - Tính next occurrence dựa vào recurrence_type + recurrence_config + last_generated_at
  - Trả về `{ shouldGenerate: boolean, forDate: Date }`
  - Unit test đầy đủ cho 9 loại (đây là logic phức tạp nhất)
- [ ] Khi sinh task: copy từ schedule:
  - `title` = `[task_type.name] — [period_label]` (ví dụ: "Kê khai GTGT — T05/2026")
  - `company_id`, `task_type_id`, `customer_task_schedule_id`
  - `assigned_to` = schedule.assigned_staff_id ?? company.assigned_staff_id
  - `due_date` = forDate + deadline_offset_days
  - `sla_days` = schedule.override_sla_days ?? task_type.default_sla_days
  - `source` = 'auto'
  - `period_label` = format(forDate, "'T'MM/yyyy") hoặc "'Q'Q/yyyy"
- [ ] Copy checklist items từ `task_type_checklist_templates`
- [ ] Idempotent check: query `tasks` xem đã có task cùng `customer_task_schedule_id + period_label` chưa → không sinh trùng
- [ ] Xử lý lỗi từng schedule độc lập: 1 schedule lỗi không crash toàn bộ job
- [ ] Ghi log đầy đủ: `scheduler.generated`, `scheduler.skipped`, `scheduler.error`

### 8.3 Cron Setup

- [ ] `src/jobs/index.js` — khởi động tất cả cron jobs khi app start
- [ ] Job chạy lúc `05:00` hàng ngày (VN timezone UTC+7: `0 22 * * *` UTC)
- [ ] Endpoint `GET /api/admin/scheduler/status` — [admin] xem jobs đang chạy + last run time
- [ ] Endpoint `POST /api/admin/scheduler/run-now` — [admin] trigger manual run (dev/debug)

**Acceptance Criteria Phase 8:**
```
□ Schedule monthly_by_date day=20 → task được sinh đúng ngày 20 tháng đó
□ Chạy 2 lần trong ngày → chỉ sinh 1 task (idempotent)
□ Schedule is_active = false → không sinh task
□ Schedule lỗi recurrence_config → log error, không crash job
□ Task sinh ra có đúng title format, due_date = forDate + offset, source = 'auto'
□ Checklist items được copy từ task_type template
```

---

## PHASE 9 — Credential Vault

**Mục tiêu:** Lưu trữ an toàn tài khoản hệ thống KH với AES-256-GCM. UI hiển thị/ẩn mật khẩu.

### 9.1 Backend

- [ ] `src/utils/encrypt.js` — hàm `encrypt(plaintext)` và `decrypt(ciphertext, iv)` dùng AES-256-GCM (xem 06_SECURITY.md)
- [ ] Validate `CREDENTIAL_ENCRYPTION_KEY` = 64 hex chars khi startup
- [ ] Test encrypt/decrypt round-trip trong unit test

**Endpoints:**
- [ ] `GET /api/companies/:companyId/credentials` — danh sách (KHÔNG trả password, trả `"***"`)
- [ ] `POST /api/companies/:companyId/credentials` — tạo mới (encrypt password trước khi lưu)
- [ ] `PATCH /api/credentials/:id` — cập nhật (nếu có password mới → encrypt lại, tạo IV mới)
- [ ] `DELETE /api/credentials/:id` — xóa
- [ ] `GET /api/credentials/:id/reveal` — [auth + phân quyền] decrypt + trả password thật + ghi audit_log
- [ ] `POST /api/credentials/:id/toggle` — bật/tắt is_active

**Phân quyền `/reveal`:**
- [ ] Admin: xem mọi credential
- [ ] Staff: chỉ xem credential của công ty mình đang phụ trách (check qua assignments)

### 9.2 Frontend — Tab Credentials trong Company Detail

- [ ] Danh sách credentials: system_name, link (clickable), username, password (hiển thị `***`)
- [ ] Nút "Hiện" → gọi API `/reveal`, hiện password 30 giây rồi tự ẩn lại (countdown timer)
- [ ] Nút copy username / copy password (call `/reveal` rồi copy vào clipboard)
- [ ] Modal thêm/sửa: system_name, system_url, username, password (type=password), notes
- [ ] Toggle is_active
- [ ] Xác nhận khi xóa credential

**Acceptance Criteria Phase 9:**
```
□ Tạo credential với password "abc123" → DB lưu ciphertext (không phải "abc123")
□ GET /api/companies/:id/credentials → password trả về là "***"
□ GET /api/credentials/:id/reveal → trả password đúng "abc123" + audit_log ghi credential_viewed
□ Staff không phụ trách công ty → 403 khi gọi /reveal
□ Encrypt 2 lần cùng password → 2 ciphertext khác nhau (do IV random)
```

---

## PHASE 10 — Payroll Management

**Mục tiêu:** Lập bảng lương hàng tháng với vòng đời draft → confirmed → paid.

### 10.1 Backend

**Endpoints:**
- [ ] `GET /api/payroll` — [admin] danh sách kỳ lương, pagination, filter year/status
- [ ] `POST /api/payroll` — [admin] tạo kỳ lương mới (validate unique year+month)
- [ ] `GET /api/payroll/:periodId` — chi tiết kỳ + records
- [ ] `PATCH /api/payroll/:periodId` — [admin] cập nhật notes (chỉ khi status = draft)
- [ ] `POST /api/payroll/:periodId/confirm` — [admin] chuyển draft → confirmed (validate có đủ records cho active staff)
- [ ] `POST /api/payroll/:periodId/mark-paid` — [admin] confirmed → paid
- [ ] `GET /api/payroll/:periodId/records` — danh sách records của kỳ
- [ ] `POST /api/payroll/:periodId/records` — [admin] thêm/cập nhật record cho 1 nhân viên
- [ ] `PATCH /api/payroll/records/:recordId` — [admin] cập nhật (chỉ khi period.status = draft)
- [ ] `DELETE /api/payroll/records/:recordId` — [admin] xóa (chỉ khi draft)
- [ ] `GET /api/payroll/:periodId/export` — [admin] export Excel bảng lương kỳ đó

**Logic:**
- [ ] `gross_income` và `net_salary` là GENERATED columns — không cần tính ở app layer
- [ ] Khi confirm: warn nếu có active staff không có record trong kỳ này
- [ ] Khi status = confirmed hoặc paid: chặn sửa records (trả 409)

**Export Excel:**
- [ ] Dùng `exceljs` để tạo file bảng lương:
  - Header: Bảng lương tháng MM/YYYY — Công ty Kế Toán Tâm An
  - Columns: STT, Họ tên, Lương CB, Phụ cấp, Thưởng, Gross, BHXH, BHYT, BHTN, Thuế TNCN, Khấu trừ khác, Net
  - Footer: Tổng cộng
  - Format số: VND (có dấu chấm phân cách ngàn)

### 10.2 Frontend (`/payroll`)

- [ ] Danh sách kỳ lương: năm/tháng, status badge, tổng net salary, số nhân viên
- [ ] Tạo kỳ lương mới (chọn tháng/năm)
- [ ] Màn hình chi tiết kỳ lương:
  - Header: thông tin kỳ, status, actions (confirm/mark-paid/export Excel)
  - Bảng: từng nhân viên với tất cả columns lương
  - Inline edit khi status = draft
  - Summary row tổng cuối
- [ ] Modal thêm nhân viên vào kỳ lương (dropdown user + form nhập số liệu)
- [ ] Button export Excel

**Acceptance Criteria Phase 10:**
```
□ Tạo kỳ 05/2026, thêm record cho 3 NV → DB lưu đúng, gross_income và net_salary tự tính
□ Sửa base_salary → gross_income và net_salary cập nhật tự động (GENERATED)
□ Confirm kỳ → không thể sửa records nữa
□ Export Excel → file download được, số liệu đúng, format VND
□ Tạo trùng kỳ tháng/năm → 409 conflict
```

---

## PHASE 11 — Document Management (OneDrive)

**Mục tiêu:** Upload/download tài liệu KH qua Microsoft Graph API. File lưu trên OneDrive, DB chỉ lưu metadata.

### 11.1 Microsoft Graph API Setup

- [ ] Đăng ký Azure App Registration:
  - Tenant: Microsoft 365 của Tâm An
  - Permissions: `Files.ReadWrite.All` (application permission — không cần user login)
  - Client credentials flow (client_id + client_secret)
- [ ] `src/config/graph.js` — khởi tạo `@microsoft/microsoft-graph-client`, auto-refresh token
- [ ] Test: `GET /v1.0/me/drive` → kết nối thành công
- [ ] Cấu hình thư mục gốc: `/TamAn_Documents/` trong OneDrive của service account

### 11.2 Backend

**Upload Flow:**
- [ ] `POST /api/companies/:companyId/documents/upload` — nhận file (multipart/form-data), category
  1. Validate file type (PDF, XLSX, DOC, DOCX, PNG, JPG, JPEG) + size (<= 50MB)
  2. Xác định OneDrive path: `/TamAn_Documents/KH_{companyName}/{year}/{category}/`
  3. Upload lên OneDrive: `PUT /v1.0/drives/{driveId}/root:/{path}/{filename}:/content`
  4. Lấy `id` và `webUrl` từ response
  5. Insert vào `documents` table
  6. Return metadata

**Other Endpoints:**
- [ ] `GET /api/companies/:companyId/documents` — danh sách, filter category, task_id, search tên file
- [ ] `GET /api/documents/:id/link` — generate download link (Graph API create share link hoặc trả webUrl)
- [ ] `DELETE /api/documents/:id` — xóa file trên OneDrive + xóa record DB (soft delete)
- [ ] `PATCH /api/tasks/:taskId/documents/:docId/attach` — gắn document vào task (set task_id)

### 11.3 Frontend

**Tab Tài Liệu trong Company Detail:**
- [ ] Upload zone: drag-and-drop hoặc click-to-browse
- [ ] Chọn category khi upload
- [ ] Danh sách files: icon theo loại file, tên, category, ngày upload, người upload
- [ ] Click file → mở link OneDrive trên tab mới
- [ ] Xóa file (confirm dialog)
- [ ] Filter theo category

**Đính kèm vào Task:**
- [ ] Trong trang chi tiết task → tab "Tài liệu": chọn từ file đã có của KH, hoặc upload mới

**Acceptance Criteria Phase 11:**
```
□ Upload file PDF → xuất hiện trong OneDrive đúng path /TamAn_Documents/KH_ABC/2026/hop_dong/
□ Click link → mở file trên trình duyệt trực tiếp từ OneDrive
□ Xóa document → file xóa khỏi OneDrive, record xóa khỏi DB
□ Upload file .exe → 400 invalid file type
□ Upload file > 50MB → 400 file too large
```

---

## PHASE 12 — Notifications & Escalation

**Mục tiêu:** In-app notifications + email + cron jobs tự động nhắc nhở và escalate.

### 12.1 In-App Notifications

- [ ] `POST /api/notifications` — internal only (gọi từ services khác, không expose ra ngoài)
- [ ] `GET /api/notifications` — [self] danh sách thông báo của mình, pagination, filter is_read
- [ ] `POST /api/notifications/read-all` — đánh dấu tất cả đã đọc
- [ ] `PATCH /api/notifications/:id/read` — đánh dấu 1 notification đã đọc
- [ ] `GET /api/notifications/unread-count` — số thông báo chưa đọc (dùng cho badge)
- [ ] Frontend: bell icon trong header, badge số, dropdown danh sách 10 thông báo gần nhất, "Xem tất cả" → `/notifications`

**Các sự kiện sinh notification:**
- [ ] Task được assign → notify `assigned_to`
- [ ] Task status changed → notify creator + assigned_to
- [ ] Comment được thêm → notify các người đã comment trước trên task đó
- [ ] Task overdue → notify assigned_to + admin (bởi cron job)
- [ ] Deadline reminder (N ngày trước) → notify assigned_to

### 12.2 Email Notifications (SMTP via Microsoft 365)

- [ ] `src/utils/mailer.js` — Nodemailer với SMTP Microsoft 365
  - host: `smtp.office365.com`, port: 587, STARTTLS
  - auth: Microsoft 365 account của Tâm An
- [ ] Template email HTML đơn giản (không dùng framework phức tạp — inline CSS)
- [ ] Emails gửi async (không block API response): dùng queue hoặc `setImmediate`

### 12.3 Cron Jobs — Nhắc Nhở & Escalation

- [ ] **Deadline Reminder Job** — chạy mỗi ngày lúc 07:30:
  - Query tasks: `due_date = today + N ngày` (N = system_config `deadline_warning_days`)
  - Gửi in-app notification + email cho assigned_to
- [ ] **Overdue Escalation Job** — chạy mỗi ngày lúc 08:00:
  - Query tasks: `due_date < today - N ngày` (N = `escalation_overdue_days`), status != completed
  - Chuyển status → needs_revision nếu còn trong in_progress
  - Ghi activity_log action = 'escalated'
  - Gửi notification type = 'escalation' cho assigned_to + admin
- [ ] **On-Hold Reminder Job** — chạy mỗi ngày lúc 08:00:
  - Query tasks: status = 'on_hold' và updated_at < today - N ngày (N = `escalation_on_hold_days`)
  - Gửi reminder notification cho assigned_to + admin
- [ ] **Morning Summary Job** — chạy mỗi ngày lúc 07:00 (cấu hình qua system_config `morning_email_time`):
  - Gửi email cho admin: danh sách task quá hạn, task đến hạn hôm nay, task on_hold quá lâu
  - Format: HTML table gọn, có link trực tiếp vào từng task

**Acceptance Criteria Phase 12:**
```
□ Assign task → người được assign nhận notification trong app
□ Morning summary email gửi đúng giờ, nội dung đúng dữ liệu
□ Task quá hạn N ngày → status chuyển needs_revision, activity log ghi escalated
□ Unread badge cập nhật realtime khi nhận notification mới (polling hoặc SSE)
```

---

## PHASE 13 — Dashboard & Reports

**Mục tiêu:** Dashboard KPI + biểu đồ + 6 loại báo cáo + export Excel/PDF.

### 13.1 Dashboard API

- [ ] `GET /api/dashboard/summary` — KPI cards:
  - `tasks_open_total`, `tasks_overdue`, `tasks_completed_this_month`
  - `companies_with_overdue_tasks`, `sla_compliance_rate_this_month`
  - `my_tasks_today` (nếu là staff)
- [ ] `GET /api/dashboard/charts` — data cho biểu đồ:
  - `weekly_completion_trend`: 4 tuần gần nhất, tasks hoàn thành mỗi tuần
  - `staff_workload`: mỗi staff → tasks đang mở, tasks hoàn thành tháng này
  - `task_type_distribution`: theo nhóm task type
  - `overdue_heatmap`: 30 ngày gần nhất → số task quá hạn từng ngày

### 13.2 Reports API

- [ ] `GET /api/reports/staff-performance` — params: `staff_id[]`, `from`, `to`
  - Mỗi staff: tasks hoàn thành, % đúng hạn, avg_actual_hours, top 5 task types
- [ ] `GET /api/reports/company-status` — params: `company_id[]`, `from`, `to`
  - Mỗi KH: tasks open/completed/overdue, tổng thời gian, % hoàn thành đầu việc định kỳ
- [ ] `GET /api/reports/sla-compliance` — params: `from`, `to`, `group_by` (staff|company|task_type)
  - % tasks hoàn thành trước hạn / đúng hạn / trễ 1-3 ngày / trễ >3 ngày
- [ ] `GET /api/reports/aging` — tasks đang mở, sắp xếp theo số ngày đã mở
- [ ] `GET /api/reports/velocity` — tasks hoàn thành mỗi tuần/tháng, so sánh kỳ trước
- [ ] `GET /api/reports/forecast` — dựa trên schedules is_active → dự báo tasks tháng tới theo staff

### 13.3 Export

- [ ] `POST /api/reports/export` — body: `{report_type, params, format: 'excel'|'pdf'}`
  1. Insert `report_jobs` record (status = processing)
  2. Generate file async (`exceljs` cho Excel, `puppeteer` hoặc `jspdf` cho PDF)
  3. Lưu file tạm vào `/tmp/reports/` (30 ngày rồi tự xóa)
  4. Update `report_jobs.status = done`, `file_url`
- [ ] `GET /api/reports/jobs` — danh sách lịch sử export
- [ ] `GET /api/reports/download/:jobId` — download file

### 13.4 Frontend — Dashboard (`/dashboard`)

- [ ] **KPI Row**: 5 cards số liệu với màu sắc trực quan (Recharts hoặc tự custom)
- [ ] **Biểu đồ hàng 1**: Line chart xu hướng hoàn thành (4 tuần), Bar chart tải công việc theo nhân viên
- [ ] **Biểu đồ hàng 2**: Pie chart phân loại task type, Heat map deadline trong tháng
- [ ] **Quick List**: 5 task quá hạn gần nhất + link "Xem thêm"

### 13.5 Frontend — Reports (`/reports`)

- [ ] Tab navigation: Tổng quan | Nhân sự | Khách hàng | SLA | Đang tồn đọng | Dự báo
- [ ] Mỗi tab: filter bar (date range, multi-select dropdown) + render chart/table
- [ ] Button "Export Excel" trên mỗi tab → gọi API export → show progress → download khi done
- [ ] Lịch sử export: danh sách file đã tạo + download link

**Acceptance Criteria Phase 13:**
```
□ Dashboard load trong < 2 giây với 500 tasks trong DB
□ SLA compliance report tính đúng % cho tháng hiện tại
□ Aging report trả đúng danh sách và số ngày mở
□ Export Excel với 1000 rows → file download được, không timeout
□ Chart tải công việc hiển thị đúng khi filter theo tháng cụ thể
```

---

## PHASE 14 — Security Hardening

**Mục tiêu:** Áp dụng đầy đủ security checklist trước khi deploy.

### 14.1 HTTP Security

- [ ] `helmet.js` configured đầy đủ (xem 06_SECURITY.md):
  - CSP header với whitelist domains
  - HSTS: `max-age=31536000; includeSubDomains`
  - `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`
- [ ] CORS: chỉ cho phép `FRONTEND_URL` từ env
- [ ] Rate limiting phân tầng:
  - `/api/auth/login`: 10 req / 15 phút / IP
  - `/api/auth/refresh`: 20 req / 15 phút / IP
  - `/api/`: 100 req / 1 phút / IP
- [ ] Nginx: disable `Server` header, thêm security headers ở nginx level

### 14.2 Input Hardening

- [ ] Kiểm tra toàn bộ endpoints có Zod schema validation
- [ ] Kiểm tra không có raw string interpolation trong SQL queries
- [ ] `express-mongo-sanitize` hoặc tương tự để clean NoSQL injection (nếu có JSONB input từ user)
- [ ] File upload validation: MIME type check + file extension check + max size
- [ ] Sanitize HTML trong comment content (dùng `DOMPurify` phía frontend, backend strip tags)

### 14.3 Data Security

- [ ] Kiểm tra `CREDENTIAL_ENCRYPTION_KEY` không bị log ở bất kỳ đâu
- [ ] Kiểm tra không có password hoặc token trong log output
- [ ] Review tất cả API response: không trả `password_hash`, `token_hash`, `encrypted_password` raw
- [ ] `audit_logs`: chạy test confirm không thể UPDATE/DELETE
- [ ] Backup script: `src/jobs/backup.job.js` — dump PostgreSQL hàng ngày → lưu OneDrive

### 14.4 Dependency Audit

- [ ] `npm audit` cho cả backend và frontend — fix vulnerabilities >= high
- [ ] Xem xét loại bỏ packages không dùng (`npm prune`)
- [ ] Pin phiên bản dependencies trong `package.json` (không dùng `^` cho prod dependencies quan trọng)

**Acceptance Criteria Phase 14:**
```
□ curl -I https://app.ketoan-taman.vn → có đủ security headers
□ Brute force /auth/login 11 lần → rate limit 429 ở lần thứ 11
□ GET /api/users → response không chứa password_hash
□ Attempt SQL injection trong search field → query trả kết quả rỗng, không lỗi
□ npm audit → 0 vulnerabilities level high hoặc critical
```

---

## PHASE 15 — Observability

**Mục tiêu:** Structured logging, Sentry, health checks, metrics cơ bản.

### 15.1 Logging

- [ ] Winston đã setup từ Phase 0 — verify production format là JSON
- [ ] Thêm `request_id` middleware vào tất cả request (đã mô tả trong 07_DEBUGGING_OBSERVABILITY.md)
- [ ] Kiểm tra tất cả log có đủ context (userId, requestId, resource, duration_ms)
- [ ] Không log: password, token, encrypted_password, CREDENTIAL_ENCRYPTION_KEY
- [ ] Log rotation: Winston `DailyRotateFile` hoặc giới hạn Docker log size trong compose

### 15.2 Error Tracking — Sentry

- [ ] Setup Sentry project (Node.js + React)
- [ ] Backend: `@sentry/node` + Express error handler (xem 07_DEBUGGING_OBSERVABILITY.md)
- [ ] Frontend: `@sentry/react` + session replay
- [ ] `beforeSend` scrub: xóa Authorization header trước khi gửi Sentry
- [ ] Test: trigger intentional error → verify xuất hiện trên Sentry dashboard

### 15.3 Health Check & Monitoring

- [ ] `GET /api/health` — trả `{ status, db: 'ok'|'error', redis: 'ok'|'error', uptime, version }`
- [ ] Docker health check: `curl -f http://localhost:3000/api/health || exit 1`
- [ ] Uptime Robot: monitoring endpoint `https://app.ketoan-taman.vn/api/health` mỗi 5 phút → email nếu down

**Acceptance Criteria Phase 15:**
```
□ GET /api/health → 200 với db: ok, redis: ok
□ Trigger error → xuất hiện trên Sentry trong vòng 30 giây
□ Log file chứa JSON đúng format với requestId
□ Không tìm thấy từ "password", "token", "secret" trong log files
```

---

## PHASE 16 — Production Deployment

**Mục tiêu:** Deploy lên Vietnix VPS NVME 2, HTTPS, auto-restart, backup tự động.

### 16.1 Server Setup

- [ ] Mua và nhận VPS Vietnix NVME 2 (Ubuntu 22.04 LTS)
- [ ] Tạo non-root user `deploy`, disable root login SSH
- [ ] Setup SSH key authentication, disable password login
- [ ] Cài Docker Engine + Docker Compose v2 trên Ubuntu
- [ ] Cài `fail2ban` — block IP brute force SSH
- [ ] Cấu hình UFW firewall: chỉ mở port 22 (SSH), 80 (HTTP), 443 (HTTPS)
- [ ] Đăng ký domain `ketoan-taman.vn` (hoặc sub-domain), trỏ A record về IP VPS

### 16.2 SSL Certificate

- [ ] Cài `certbot` và `python3-certbot-nginx`
- [ ] Sinh cert: `certbot --nginx -d app.ketoan-taman.vn`
- [ ] Verify auto-renewal: `certbot renew --dry-run`
- [ ] Nginx production config: HTTPS only, HTTP redirect → HTTPS, HTTP/2

### 16.3 Production Docker Compose

- [ ] `docker-compose.prod.yml`:
  - `restart: unless-stopped` cho tất cả services
  - Không expose postgres/redis ports ra ngoài host
  - Nginx: mount React build từ volume, bind port 80/443
  - Backend: `NODE_ENV=production`, không mount source code
  - Resource limits: `deploy.resources.limits.memory` cho từng service
- [ ] Tạo file `.env.production` trên server (không commit vào git)
- [ ] Deploy script `deploy.sh`:
  ```bash
  git pull origin main
  docker compose -f docker-compose.prod.yml build backend
  npm run build (trong frontend container)
  docker compose -f docker-compose.prod.yml up -d
  npm run migrate:up
  ```

### 16.4 Backup Automation

- [ ] `src/jobs/backup.job.js` — chạy mỗi ngày lúc 02:00:
  - `pg_dump ktta_db` → compress → upload OneDrive `TamAn_Documents/_backups/YYYY-MM-DD.sql.gz`
  - Xóa backup cũ hơn 30 ngày trên OneDrive
  - Ghi log backup success/failure
- [ ] Test restore: download backup → restore vào DB test → verify data intact

### 16.5 Smoke Tests Post-Deploy

- [ ] Truy cập `https://app.ketoan-taman.vn` → React app load, HTTPS green lock
- [ ] Đăng nhập admin → vào được dashboard
- [ ] Tạo 1 công ty test → lưu được
- [ ] Tạo 1 task thủ công → xuất hiện trong list
- [ ] Upload 1 file test → xuất hiện trong OneDrive
- [ ] Trigger scheduler manual → task được sinh
- [ ] Kiểm tra Sentry dashboard → không có unexpected errors

**Acceptance Criteria Phase 16:**
```
□ https://app.ketoan-taman.vn load trong < 3 giây
□ HTTP redirect sang HTTPS tự động
□ SSL Labs Score: A hoặc A+
□ docker ps → tất cả containers status Up
□ Backup cron chạy lần đầu thành công, file xuất hiện trên OneDrive
□ Smoke tests tất cả pass
```

---

## Dependency Map

```
Phase 0 ──────────────────────────────────────────────────────────►
         │
         ▼
       Phase 1 ────────────────────────────────────────────────────►
                │
                ▼
              Phase 2 ──────────────────────────────────────────────►
                       │
                       ├──────► Phase 3 ──────► Phase 4 ──────► Phase 5
                       │                                              │
                       │                                              ▼
                       │                                           Phase 6 ──► Phase 7
                       │                                              │
                       │                         Phase 8 (depends on 5) ◄──────┘
                       │
                       ├──────► Phase 9 (depends on 3)
                       │
                       ├──────► Phase 10 (depends on 2)
                       │
                       │        Phase 11 (depends on 6)
                       │        Phase 12 (depends on 6, 8)
                       │        Phase 13 (depends on 6, 7)
                       │
                       └──────────────────────────────────────────► Phase 14
                                                                          │
                                                                          ▼
                                                                       Phase 15
                                                                          │
                                                                          ▼
                                                                       Phase 16
```

---

## PROGRESS.md Template

> Tạo file `PROGRESS.md` ở root project, cập nhật sau mỗi phase.

```markdown
# Build Progress — Kế Toán Tâm An

| Phase | Status | Ngày bắt đầu | Ngày hoàn thành | Ghi chú |
|-------|--------|-------------|-----------------|---------|
| 0 — Environment | ⬜ | | | |
| 1 — Database | ⬜ | | | |
| 2 — Auth | ⬜ | | | |
| 3 — Companies | ⬜ | | | |
| 4 — Task Types | ⬜ | | | |
| 5 — Schedules | ⬜ | | | |
| 6 — Tasks Core | ⬜ | | | |
| 7 — Task Extensions | ⬜ | | | |
| 8 — Scheduler | ⬜ | | | |
| 9 — Credentials | ⬜ | | | |
| 10 — Payroll | ⬜ | | | |
| 11 — Documents | ⬜ | | | |
| 12 — Notifications | ⬜ | | | |
| 13 — Dashboard | ⬜ | | | |
| 14 — Security | ⬜ | | | |
| 15 — Observability | ⬜ | | | |
| 16 — Deployment | ⬜ | | | |

## Issues / Decisions Log
- [date] [phase] [issue/decision]
```

---

## Tổng Hợp Dependencies (npm packages)

### Backend
```json
{
  "dependencies": {
    "express": "^4.19",
    "pg": "^8.11",
    "ioredis": "^5.3",
    "bcrypt": "^5.1",
    "jsonwebtoken": "^9.0",
    "uuid": "^9.0",
    "zod": "^3.23",
    "helmet": "^7.1",
    "cors": "^2.8",
    "express-rate-limit": "^7.3",
    "morgan": "^1.10",
    "winston": "^3.13",
    "winston-daily-rotate-file": "^5.0",
    "node-cron": "^3.0",
    "axios": "^1.7",
    "dotenv": "^16.4",
    "exceljs": "^4.4",
    "nodemailer": "^6.9",
    "date-fns": "^3.6",
    "@microsoft/microsoft-graph-client": "^3.0",
    "@sentry/node": "^8.0",
    "multer": "^1.4"
  },
  "devDependencies": {
    "nodemon": "^3.1",
    "jest": "^29.7",
    "supertest": "^7.0",
    "@faker-js/faker": "^8.4"
  }
}
```

### Frontend
```json
{
  "dependencies": {
    "react": "^18.3",
    "react-dom": "^18.3",
    "react-router-dom": "^6.23",
    "axios": "^1.7",
    "zustand": "^4.5",
    "@tanstack/react-query": "^5.40",
    "react-hook-form": "^7.52",
    "@hookform/resolvers": "^3.6",
    "recharts": "^2.12",
    "date-fns": "^3.6",
    "lucide-react": "^0.390",
    "clsx": "^2.1",
    "tailwind-merge": "^2.3",
    "@dnd-kit/core": "^6.1",
    "@dnd-kit/sortable": "^8.0",
    "@sentry/react": "^8.0"
  }
}
```
