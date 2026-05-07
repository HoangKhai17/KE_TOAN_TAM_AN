# 07 — Debugging & Observability
> Phiên bản: 1.0 | Ngày tạo: 2026-05-07 | Stack: Node.js + React + PostgreSQL + Docker

---

## Observability Stack Tổng Quan

```
┌─────────────────────────────────────────────────────────────────┐
│                   OBSERVABILITY PYRAMID                         │
│                                                                 │
│              ▲  METRICS                                         │
│             ▲▲▲  Prometheus + Grafana                          │
│            ▲▲▲▲▲ (CPU, RAM, request rate, DB connections)      │
│                                                                 │
│           ▲▲▲▲▲▲▲  TRACING                                     │
│          ▲▲▲▲▲▲▲▲▲  Request ID propagation                    │
│         ▲▲▲▲▲▲▲▲▲▲▲ (End-to-end request flow)                 │
│                                                                 │
│        ▲▲▲▲▲▲▲▲▲▲▲▲▲  LOGS                                     │
│       ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲  Winston (JSON) → Docker stdout        │
│      ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲ (Structured, searchable)              │
│                                                                 │
│     ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲  ERROR TRACKING                       │
│    ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲  Sentry                             │
│   ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲ (Real-time alerts khi có lỗi)     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Toolset Theo Môi Trường

### A. Backend (Node.js / Express)

#### 1. Structured Logging — Winston

```js
// config/logger.js
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    process.env.NODE_ENV === 'development'
      ? winston.format.prettyPrint()    // Dev: dễ đọc
      : winston.format.json()           // Prod: JSON cho log aggregation
  ),
  transports: [new winston.transports.Console()],
});

module.exports = logger;

// Dùng trong code
logger.info('task.created', {
  task_id: task.id,
  company_id: task.company_id,
  assigned_to: task.assigned_to,
  source: 'auto',
  schedule_id: task.customer_task_schedule_id,
});

// Output (prod): {"level":"info","message":"task.created","task_id":"uuid","timestamp":"2026-05-07T09:30:00.123Z",...}
```

#### 2. Request ID Middleware

```js
// Mỗi request có ID duy nhất — dùng để trace log từ đầu đến cuối
const { v4: uuidv4 } = require('uuid');

app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', req.requestId);
  next();
});

// Log kèm requestId để trace toàn bộ flow của 1 request
logger.info('api.request', {
  requestId: req.requestId,
  method: req.method,
  path: req.path,
  userId: req.user?.id,
});
```

#### 3. Error Tracking — Sentry

```js
// app.js
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,    // "development" | "production"
  tracesSampleRate: 0.1,               // 10% requests cho performance tracing
  beforeSend(event) {
    // Xóa headers chứa token trước khi gửi lên Sentry
    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
    }
    return event;
  },
});

// Express error handler
app.use(Sentry.Handlers.errorHandler());
```

#### 4. Local Debugging

```
Công cụ            Dùng khi nào
────────────────   ─────────────────────────────────────────
node --inspect     Debug breakpoint: node --inspect src/index.js
                   → Attach VS Code debugger hoặc Chrome DevTools

nodemon            Hot reload khi dev: nodemon src/index.js

Swagger UI         Test API trực tiếp: http://localhost:3000/api/docs
                   → Dùng express-swagger-ui hoặc swagger-ui-express

pgAdmin            Xem dữ liệu PostgreSQL trực quan
                   → Query trực tiếp, xem indexes, explain plan

Redis Insight      Xem session/cache trong Redis
                   → Kiểm tra TTL, xóa key khi debug
```

---

### B. Frontend (React / Vite)

#### 1. React DevTools

```
Cài extension Chrome: "React Developer Tools"
├─ Inspect component tree
├─ Xem props / state realtime
└─ Profiler: đo hiệu suất render — phát hiện component re-render thừa
```

#### 2. Network Debugging

```
Browser DevTools → Network tab
├─ Xem mọi API call (request/response body, status code)
├─ Filter: Fetch/XHR
├─ Copy as cURL → paste vào terminal để reproduce lỗi
└─ Throttle network: mô phỏng mạng chậm (3G) → test UX loading state
```

#### 3. Sentry cho Frontend

```js
// src/main.jsx
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: true,          // Ẩn text nhạy cảm trong session replay
      blockAllMedia: false,
    }),
  ],
  tracesSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,  // 100% session khi có lỗi — để debug
});
```

#### 4. Job Scheduler Debugging

```js
// Kiểm tra log scheduler tạo task
// Log mỗi lần scheduler chạy
logger.info('scheduler.run', {
  checked_schedules: schedules.length,
  tasks_generated: newTasks.length,
  run_at: new Date().toISOString(),
});

logger.warn('scheduler.skip', {
  schedule_id: schedule.id,
  reason: 'last_generated_at too recent',
  next_run: nextRunDate,
});
```

---

## Logging Strategy

### Log Levels & Khi Nào Dùng

```
LEVEL       KHI NÀO DÙNG                                VÍ DỤ
──────────  ──────────────────────────────────────────  ──────────────────────────
debug       Chi tiết nội bộ (chỉ dev, tắt ở prod)      SQL params, token claims
info        Sự kiện bình thường quan trọng              Task created, User login, Scheduler run
warn        Bất thường nhưng hệ thống vẫn chạy         Retry attempt, schedule skipped
error       Lỗi cần xử lý ngay                         DB connection fail, Graph API timeout
```

### Structured Log Format (Production)

```json
{
  "timestamp": "2026-05-07T09:30:00.123Z",
  "level": "info",
  "message": "task.completed",
  "service": "ktta-backend",
  "environment": "production",
  "requestId": "req-uuid-abc",
  "userId": "user-uuid-xyz",
  "taskId": "task-uuid-123",
  "companyId": "company-uuid-456",
  "duration_ms": 145
}
```

### Log Pipeline (Docker)

```
Node.js App (Winston JSON)
      │
      ▼ stdout
Docker logging driver
      │
      ▼
docker compose logs  ← xem realtime khi cần
      │
      ▼ (optional, khi scale)
Loki + Grafana  ←  dashboard + alert theo log pattern
```

---

## Metrics & Alerts

### Key Metrics Cần Theo Dõi

```
BUSINESS METRICS
├─ Số task được sinh tự động / ngày (scheduler hoạt động đúng không)
├─ Số task quá hạn hiện tại (SLA compliance)
├─ Số credential được xem / ngày (bảo mật)
└─ Tỷ lệ hoàn thành task theo nhân viên / tháng

TECHNICAL METRICS
├─ API Response time (p50, p95, p99) theo endpoint
├─ Error rate (%) theo endpoint và theo giờ
├─ PostgreSQL: số connections active, slow queries (> 1 giây)
├─ Redis: hit rate, memory usage
└─ VPS: CPU (%), RAM (%), disk (%)
```

### Alert Rules (Grafana / Uptime Robot)

| Alert | Ngưỡng | Hành động |
|-------|--------|-----------|
| Server không phản hồi | > 1 phút downtime | Email + SMS ngay |
| Error rate cao | > 5% trong 5 phút | Email |
| API chậm | p95 > 3 giây | Email |
| Disk sắp đầy | > 80% | Email |
| Scheduler không chạy | > 2 giờ không có log | Email |
| Nhiều lần login sai | > 10 lần/phút từ 1 IP | Email (brute force) |

---

## Testing Strategy

```
┌─────────────────────────────────────────────────────────┐
│                   TEST PYRAMID                          │
│                                                         │
│              ▲  E2E Tests (Playwright)                  │
│             ▲▲▲  Ít, chậm — test flow hoàn chỉnh      │
│                  Ví dụ: đăng nhập → tạo task → hoàn thành
│                                                         │
│            ▲▲▲▲▲  Integration Tests (Jest + Supertest) │
│           ▲▲▲▲▲▲▲  Test API endpoint + DB thật         │
│                    Không mock database                  │
│                                                         │
│          ▲▲▲▲▲▲▲▲▲  Unit Tests (Jest / Vitest)         │
│         ▲▲▲▲▲▲▲▲▲▲▲  Nhiều, nhanh — test logic thuần  │
│                      Ví dụ: recurrence calculator       │
└─────────────────────────────────────────────────────────┘
```

### Môi Trường Test Quan Trọng

```
Local Dev    → Jest unit tests + Supertest integration (DB test riêng)
              → Vitest cho frontend components
Staging      → Playwright E2E + Sentry (dev env) + dữ liệu giả
Production   → Sentry (prod) + Grafana alerts + Uptime Robot
```

### Test Cases Quan Trọng Nhất

```
Scheduler (logic phức tạp nhất):
□ monthly_by_date: tháng 2 (28/29 ngày) không sinh ngày 30/31
□ monthly_last_day: tháng 2 → ngày 28/29, tháng 4 → ngày 30
□ quarterly: sinh đúng tháng và ngày trong quý
□ Không sinh task trùng (idempotent)
□ last_generated_at cập nhật đúng

Credential encryption:
□ Encrypt → Decrypt round-trip cho cùng password
□ Cùng password + key → 2 lần encrypt → 2 ciphertext khác nhau (do IV ngẫu nhiên)
□ Sai key → lỗi AuthenticationError (không return garbage)

Authentication:
□ Refresh token rotation — token cũ bị thu hồi sau khi rotate
□ Phát hiện token reuse → thu hồi cả family
□ Tài khoản bị khóa sau 5 lần sai
```

---

## Quick Debug Commands

```bash
# Xem log realtime tất cả services
docker compose logs -f

# Xem log riêng backend, 200 dòng cuối
docker compose logs -f backend --tail=200

# Lọc chỉ xem errors
docker compose logs backend | grep '"level":"error"'

# Xem slow queries PostgreSQL (phải bật pg_stat_statements)
docker compose exec postgres psql -U postgres -d ktta_db -c "
  SELECT query, mean_exec_time::int as avg_ms, calls
  FROM pg_stat_statements
  ORDER BY mean_exec_time DESC
  LIMIT 10;"

# Kiểm tra connections PostgreSQL đang active
docker compose exec postgres psql -U postgres -d ktta_db -c "
  SELECT count(*), state
  FROM pg_stat_activity
  WHERE datname = 'ktta_db'
  GROUP BY state;"

# Xem Redis memory và keys
docker compose exec redis redis-cli info memory
docker compose exec redis redis-cli keys "*"

# Restart 1 service mà không restart toàn bộ
docker compose restart backend

# Kiểm tra disk VPS
df -h

# Xem top processes ngốn RAM/CPU
docker stats
```

---

## ENV Configuration

```bash
# .env.example (commit lên git — chỉ key, không có giá trị thật)
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ktta_db
REDIS_URL=redis://localhost:6379
JWT_SECRET=
JWT_REFRESH_SECRET=
CREDENTIAL_ENCRYPTION_KEY=
FRONTEND_URL=http://localhost:5173
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=
SENTRY_DSN=
LOG_LEVEL=debug

# .env (KHÔNG commit — trong .gitignore)
# Chứa giá trị thật cho từng môi trường
```

---

## Phân Tầng Môi Trường

| | Local Dev | Staging | Production |
|--|-----------|---------|------------|
| Database | Docker local | Docker VPS test | Docker VPS prod |
| Log format | Pretty print | JSON | JSON |
| Log level | debug | info | info |
| Sentry | Tắt | Bật (env=staging) | Bật (env=production) |
| Scheduler | Chạy | Chạy | Chạy |
| Hot reload | nodemon | Tắt | Tắt |
| Source maps | Có | Có | Không (production build) |
