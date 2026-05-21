# Kế Toán Tâm An

Hệ thống quản lý nội bộ dành cho công ty kế toán — quản lý công việc, khách hàng, nhân viên, chấm công và bảng lương trên một nền tảng duy nhất.

---

## Mục lục

- [Tính năng](#tính-năng)
- [Tech Stack](#tech-stack)
- [Kiến trúc hệ thống](#kiến-trúc-hệ-thống)
- [Yêu cầu môi trường](#yêu-cầu-môi-trường)
- [Cài đặt & Chạy](#cài-đặt--chạy)
  - [Cách 1 — Docker (khuyến nghị)](#cách-1--docker-khuyến-nghị)
  - [Cách 2 — Chạy thủ công](#cách-2--chạy-thủ-công)
- [Biến môi trường](#biến-môi-trường)
- [Database Migration & Seed](#database-migration--seed)
- [Tài khoản mặc định](#tài-khoản-mặc-định)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [API Documentation](#api-documentation)

---

## Tính năng

### Quản lý công việc
- Tạo, phân công và theo dõi tiến độ công việc theo từng khách hàng
- Trạng thái linh hoạt: Mới → Đang xử lý → Chờ phản hồi → Hoàn thành
- Nhắc nhở deadline tự động qua email, escalation khi quá hạn
- Checklist, comment, time-log, custom fields, phụ lục tài liệu
- Công việc định kỳ (daily / weekly / monthly / yearly)

### Quản lý khách hàng
- Hồ sơ công ty: thông tin, lịch hẹn, ghi chú, tài liệu, thông tin đăng nhập (mã hóa AES-256)
- Phân công nhân viên phụ trách — gửi email thông báo tự động
- Lịch lặp lại theo công ty (schedules)

### Quản lý nhân viên
- Hồ sơ nhân viên: chức danh, lương cơ bản, thông tin liên hệ
- Phân quyền: `admin` / `staff`

### Chấm công
- Check-in / Check-out theo ca làm việc (có thể cấu hình)
- Lịch chấm công dạng Calendar và Grid (tất cả nhân viên × tất cả ngày)
- Nghỉ phép, công tác, WFH, tăng ca — yêu cầu & phê duyệt
- Ngày nghỉ lễ quốc gia
- Báo cáo tháng: ngày công TT, nghỉ có lương, vắng, muộn, về sớm, OT đã duyệt
- Xuất Excel báo cáo chấm công
- **Gửi email xác nhận chấm công** hàng tháng đến từng nhân viên

### Bảng lương
- Quản lý kỳ lương (draft → confirmed → paid)
- Nhập lương: lương CB, phụ cấp, thưởng, BHXH, BHYT, BHTN, TNCN, khấu trừ khác
- Đồng bộ dữ liệu chấm công vào bảng lương
- Xuất Excel bảng lương
- **Gửi email bảng lương** đến từng nhân viên

### Báo cáo
- Tổng quan công việc theo trạng thái, khách hàng, nhân viên
- Báo cáo sáng tự động gửi cho admin

### Thông báo
- Thông báo real-time qua Socket.IO
- Email: nhắc nhở, escalation, phân công, chấm công, bảng lương

### Cài đặt hệ thống
- Cấu hình SMTP email
- **Template email** cho từng loại thông báo (có thể chỉnh sửa HTML trực tiếp từ UI)
- Cấu hình ca làm việc, ngày nghỉ lễ
- Quản lý enum, loại công việc
- Tích hợp OneDrive (Microsoft Graph API)

---

## Tech Stack

| Layer | Công nghệ |
|---|---|
| Frontend | React 18, Vite, React Router 6, Zustand, TanStack Query, Recharts, Lucide Icons |
| Backend | Node.js, Express 4, PostgreSQL 16, Redis 7 |
| Email | Nodemailer (SMTP — Microsoft 365 / Gmail / ...) |
| Export | ExcelJS |
| Real-time | Socket.IO |
| Auth | JWT (access 15m + refresh 7d), bcrypt |
| Proxy | Nginx |
| Container | Docker + Docker Compose |

---

## Kiến trúc hệ thống

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐
│   Browser   │────▶│    Nginx     │────▶│  Backend API   │
│  (React SPA)│     │  :8080       │     │  Express :3000 │
└─────────────┘     └──────────────┘     └───────┬────────┘
                                                 │
                                    ┌────────────┴───────────┐
                                    │                        │
                              ┌─────▼──────┐        ┌───────▼──────┐
                              │ PostgreSQL │        │    Redis     │
                              │   :5432    │        │   :6379      │
                              └────────────┘        └──────────────┘
```

---

## Yêu cầu môi trường

**Cách 1 — Docker:**
- Docker Desktop ≥ 24
- Docker Compose v2

**Cách 2 — Chạy thủ công:**
- Node.js ≥ 20
- PostgreSQL ≥ 16
- Redis ≥ 7
- npm ≥ 10

---

## Cài đặt & Chạy

### Cách 1 — Docker (khuyến nghị)

```bash
# 1. Clone repository
git clone <repo-url>
cd KE_TOAN_TAM_AN

# 2. Tạo file môi trường
cp backend/.env.example backend/.env
# Chỉnh sửa backend/.env theo hướng dẫn bên dưới

# 3. Build frontend (chạy 1 lần hoặc khi có thay đổi)
cd frontend
npm install
npm run build
# Copy dist vào nginx static volume
cd ..

# 4. Khởi động toàn bộ stack
docker compose up -d

# 5. Chạy migration & seed lần đầu
docker exec -it ke_toan_tam_an-backend-1 npm run migrate:up
docker exec -it ke_toan_tam_an-backend-1 npm run seed

# 6. Truy cập ứng dụng
# http://localhost:8080
```

> **Tắt toàn bộ:** `docker compose down`
> **Xem log:** `docker compose logs -f backend`

---

### Cách 2 — Chạy thủ công

#### Backend

```bash
cd backend

# Cài dependencies
npm install

# Tạo file môi trường
cp .env.example .env
# Chỉnh sửa .env (xem mục Biến môi trường)

# Chạy migration & seed
npm run migrate:up
npm run seed

# Khởi động dev server (hot-reload)
npm run dev

# Hoặc production
npm start
# Backend chạy tại http://localhost:3000
```

#### Frontend

```bash
cd frontend

# Cài dependencies
npm install

# Chạy dev server
npm run dev
# Vite dev server tại http://localhost:5173

# Build production
npm run build
```

---

## Biến môi trường

Tạo file `backend/.env` từ `backend/.env.example`:

```env
# ── App ──────────────────────────────────────────────────────────────────────
NODE_ENV=development
PORT=3000

# ── Database ─────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://ktta_user:YOUR_DB_PASSWORD@localhost:5432/ktta_db
POSTGRES_DB=ktta_db
POSTGRES_USER=ktta_user
POSTGRES_PASSWORD=YOUR_DB_PASSWORD       # Đặt mật khẩu mạnh

# ── Redis ────────────────────────────────────────────────────────────────────
REDIS_URL=redis://:YOUR_REDIS_PASSWORD@localhost:6379
REDIS_PASSWORD=YOUR_REDIS_PASSWORD       # Đặt mật khẩu mạnh

# ── JWT ──────────────────────────────────────────────────────────────────────
JWT_SECRET=your_64_char_random_hex       # openssl rand -hex 64
JWT_REFRESH_SECRET=your_64_char_random_hex
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ── Encryption ───────────────────────────────────────────────────────────────
CREDENTIAL_ENCRYPTION_KEY=your_32_byte_hex   # openssl rand -hex 32

# ── CORS ─────────────────────────────────────────────────────────────────────
FRONTEND_URL=http://localhost:5173,http://localhost:8080

# ── Email (SMTP) ─────────────────────────────────────────────────────────────
# Microsoft 365:
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
# Gmail:
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
SMTP_USER=your_email@domain.com
SMTP_PASS=your_email_password_or_app_password
SMTP_FROM=no-reply@your-domain.com

# ── OneDrive (tuỳ chọn) ──────────────────────────────────────────────────────
MICROSOFT_TENANT_ID=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_DRIVE_ID=

# ── Logging ──────────────────────────────────────────────────────────────────
LOG_LEVEL=debug
```

> **Tạo secret key ngẫu nhiên:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```

---

## Database Migration & Seed

```bash
# Chạy tất cả migration
npm run migrate:up

# Rollback migration gần nhất
npm run migrate:down

# Xem trạng thái migration
npm run migrate:status

# Seed dữ liệu mẫu (tạo admin + nhân viên + dữ liệu demo)
npm run seed
```

---

## Tài khoản mặc định

Sau khi chạy `npm run seed`:

| Role | Email | Mật khẩu |
|---|---|---|
| Admin | `admin@ketoan-taman.vn` | `Admin@123456` |
| Staff | `staff@ketoan-taman.vn` | `Staff@123456` |

> **Lưu ý:** Đổi mật khẩu ngay sau lần đăng nhập đầu tiên ở môi trường production.

---

## Cấu trúc thư mục

```
KE_TOAN_TAM_AN/
├── backend/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/           # Đăng nhập / JWT / refresh token
│   │   │   ├── users/          # Quản lý nhân viên
│   │   │   ├── companies/      # Quản lý khách hàng
│   │   │   ├── tasks/          # Công việc, checklist, comment, time-log
│   │   │   ├── schedules/      # Lịch định kỳ theo công ty
│   │   │   ├── attendance/     # Chấm công, nghỉ phép, OT, báo cáo
│   │   │   ├── payroll/        # Bảng lương, xuất Excel, gửi email
│   │   │   ├── notifications/  # Thông báo real-time (Socket.IO)
│   │   │   ├── reports/        # Báo cáo tổng hợp
│   │   │   ├── dashboard/      # Tổng quan
│   │   │   ├── system-configs/ # Cấu hình hệ thống (SMTP, templates)
│   │   │   ├── documents/      # Tài liệu đính kèm
│   │   │   ├── credentials/    # Thông tin đăng nhập khách hàng (mã hóa)
│   │   │   ├── enums/          # Quản lý danh mục
│   │   │   ├── onedrive/       # Tích hợp OneDrive
│   │   │   └── dev/            # Dev tools (simulate, chỉ dev env)
│   │   ├── jobs/               # Cron jobs (deadline, morning report, escalation)
│   │   ├── utils/
│   │   │   ├── mailer.js       # Gửi email qua Nodemailer
│   │   │   └── emailTemplates.js  # Template mặc định + render
│   │   ├── middleware/         # Auth, RBAC, validate, error handler
│   │   ├── config/             # DB, Redis, Logger, Swagger
│   │   ├── db/                 # Migration runner, seed
│   │   └── lib/                # Audit log, activity, enums
│   ├── migrations/             # SQL migration files
│   ├── seeds/                  # Seed data
│   └── .env.example
│
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Dashboard/      # Tổng quan
│       │   ├── Tasks/          # Công việc
│       │   ├── Companies/      # Khách hàng
│       │   ├── Staff/          # Nhân viên
│       │   ├── Attendance/     # Chấm công (admin + staff view)
│       │   ├── Payroll/        # Bảng lương
│       │   ├── Reports/        # Báo cáo
│       │   ├── Notifications/  # Thông báo
│       │   ├── Settings/       # Cài đặt hệ thống
│       │   └── Login/
│       ├── api/                # Axios API clients
│       ├── components/         # UI components dùng chung
│       └── stores/             # Zustand state (auth, toast)
│
├── nginx/                      # Nginx config + Dockerfile
├── docker-compose.yml
└── README.md
```

---

## API Documentation

Swagger UI khả dụng khi chạy backend:

```
http://localhost:3000/api-docs
```

---

## Cấu hình Email Template

Vào **Settings → Cấu hình email → Template nội dung email** để chỉnh sửa nội dung HTML cho từng loại email:

| Template | Khi nào gửi |
|---|---|
| Phân công KH | Nhân viên được phân công khách hàng mới |
| Thôi phụ trách | Nhân viên không còn phụ trách khách hàng |
| Nhắc nhở deadline | Công việc sắp đến hạn |
| Báo cáo sáng | Gửi cho admin mỗi sáng (cron job) |
| Escalation | Công việc quá hạn, tự động chuyển trạng thái |
| **Bảng lương** | Admin gửi bảng lương tháng cho nhân viên |
| **Xác nhận chấm công** | Admin xác nhận bảng chấm công tháng cho nhân viên |

Tất cả template hỗ trợ biến động `{{tên_biến}}` được thay thế tự động khi gửi.

---

## Phát triển

```bash
# Lint
npm run lint

# Format
npm run format

# Test (backend)
npm test
npm run test:unit
npm run test:integration
```

---

## License

Internal use only — Công ty Kế Toán Tâm An.
