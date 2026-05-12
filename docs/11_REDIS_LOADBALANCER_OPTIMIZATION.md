# 11 — Redis Cache & Load Balancer Optimization

> **Trạng thái:** Chưa thực hiện — lên kế hoạch sau khi hệ thống hoàn thiện  
> **Ưu tiên:** Cao khi traffic > 50 concurrent users  
> **Thời gian ước tính:** 6–10 giờ

---

## Bối cảnh

Sau khi áp dụng Migration 032 (indexes) và tối ưu query (LATERAL JOIN, Recursive CTE, Bulk INSERT, FTS), hệ thống đã giảm query load đáng kể. Bước tiếp theo để scale lên hàng trăm nghìn / triệu requests là:

1. **Redis Cache** — giảm load DB 60–80% cho read-heavy endpoints
2. **Nginx Load Balancer + Horizontal Scaling** — chạy nhiều backend instances song song

---

## Phần 1: Redis Cache

### Cài đặt

```bash
# Trong backend/
npm install ioredis
```

```yaml
# docker-compose.yml — thêm service redis
redis:
  image: redis:7-alpine
  restart: unless-stopped
  ports:
    - "6379:6379"
  volumes:
    - redis_data:/data
  command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru

volumes:
  redis_data:
```

```js
// backend/src/config/redis.js
const Redis = require('ioredis')
const redis = new Redis({ host: process.env.REDIS_HOST || 'redis', port: 6379 })
module.exports = redis
```

```env
# backend/.env
REDIS_HOST=redis
```

### Endpoints cần cache

| Endpoint | TTL | Invalidate khi |
|---|---|---|
| `GET /task-types` | 30 phút | Tạo/sửa/xoá task type |
| `GET /companies` | 5 phút | Tạo/sửa/xoá company |
| `GET /companies/:id` | 5 phút | Sửa/xoá company đó |
| `GET /users` (admin) | 2 phút | Tạo/sửa/xoá user |
| `GET /admin/scheduler/status` | 30 giây | Trigger scheduler |

### Pattern implementation

```js
// Cache wrapper helper — backend/src/lib/cache.js
const redis = require('../config/redis')

async function cacheGet(key, ttlSeconds, fetchFn) {
  const cached = await redis.get(key)
  if (cached) return JSON.parse(cached)

  const data = await fetchFn()
  await redis.setex(key, ttlSeconds, JSON.stringify(data))
  return data
}

async function cacheInvalidate(...keys) {
  if (keys.length) await redis.del(...keys)
}

async function cacheInvalidatePattern(pattern) {
  const keys = await redis.keys(pattern)
  if (keys.length) await redis.del(...keys)
}

module.exports = { cacheGet, cacheInvalidate, cacheInvalidatePattern }
```

```js
// Ví dụ dùng trong task-types.service.js
const { cacheGet, cacheInvalidate } = require('../../lib/cache')

async function listTaskTypes() {
  return cacheGet('task_types:all', 1800, async () => {
    const { rows } = await query('SELECT * FROM task_types ORDER BY name')
    return rows
  })
}

async function createTaskType(data) {
  const result = await query('INSERT INTO task_types...')
  await cacheInvalidate('task_types:all')   // xoá cache sau khi write
  return result
}
```

### Lưu ý quan trọng

- Invalidation sai → user thấy data cũ. Test kỹ các write operations.
- Dùng `allkeys-lru` eviction policy để Redis tự dọn khi đầy memory.
- Không cache data nhạy cảm (password hash, token).

---

## Phần 2: Horizontal Scaling

### Điều kiện tiên quyết

**Kiểm tra trước khi scale:**

```bash
# Kiểm tra auth hiện tại dùng JWT hay session
grep -r "session" backend/src/modules/auth/
grep -r "jsonwebtoken\|jwt" backend/src/
```

- **JWT (stateless)** → scale ngay được
- **Session in-memory** → phải move session sang Redis trước (xem bên dưới)

### Nginx Load Balancer

```nginx
# nginx/nginx.conf
upstream backend {
  least_conn;                         # route đến instance ít connection nhất
  server backend_1:3000;
  server backend_2:3000;
  server backend_3:3000;
  keepalive 32;
}

server {
  listen 80;

  location /api/ {
    proxy_pass         http://backend;
    proxy_http_version 1.1;
    proxy_set_header   Connection "";
    proxy_set_header   Host $host;
    proxy_set_header   X-Real-IP $remote_addr;
    proxy_read_timeout 30s;
  }

  location / {
    root   /usr/share/nginx/html;
    try_files $uri /index.html;       # SPA fallback
  }
}
```

```yaml
# docker-compose.yml — thêm nginx service
nginx:
  image: nginx:alpine
  ports:
    - "80:80"
  volumes:
    - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
  depends_on:
    - backend
```

### Scale backend instances

```bash
# Chạy 3 backend instances song song
docker-compose up --scale backend=3 -d
```

### Distributed Scheduler Lock (bắt buộc khi scale)

Khi chạy nhiều instances, `node-cron` sẽ chạy trên tất cả → job bị duplicate.

```js
// backend/src/jobs/index.js — thêm distributed lock
const redis = require('../config/redis')

async function acquireSchedulerLock(ttlSeconds = 60) {
  // SET NX = chỉ set nếu key chưa tồn tại (atomic)
  const result = await redis.set('scheduler:lock', process.env.HOSTNAME, 'EX', ttlSeconds, 'NX')
  return result === 'OK'
}

// Trong job runner:
cron.schedule('0 * * * *', async () => {
  const acquired = await acquireSchedulerLock(3600)
  if (!acquired) return   // instance khác đang giữ lock, bỏ qua
  // ... chạy job bình thường
})
```

### Session Redis (nếu cần — chỉ khi không dùng JWT)

```bash
npm install connect-redis express-session
```

```js
const session = require('express-session')
const RedisStore = require('connect-redis').default
const redis = require('./config/redis')

app.use(session({
  store: new RedisStore({ client: redis }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: true, httpOnly: true, maxAge: 86400000 }
}))
```

---

## Tác động khi hoàn thành

| Metric | Hiện tại (sau 032) | Sau Redis + Scale |
|---|---|---|
| DB queries/request (list) | 1 | ~0.1 (90% cache hit) |
| Concurrent users chịu được | ~500 | ~5,000+ |
| Thời gian response (list endpoints) | ~50ms | ~5ms (từ cache) |
| Điểm single-of-failure | Backend 1 instance | 3 instances — 1 chết vẫn chạy |

---

## Thứ tự thực hiện đề xuất

1. [ ] Kiểm tra auth → JWT hay session?
2. [ ] Thêm Redis vào docker-compose
3. [ ] Viết `cache.js` helper
4. [ ] Cache `task-types` (static nhất, ít rủi ro nhất)
5. [ ] Cache `companies` list + invalidation
6. [ ] Cache `users` admin list + invalidation
7. [ ] Thêm Nginx config
8. [ ] Thêm distributed scheduler lock
9. [ ] Scale backend lên 3 instances + smoke test
10. [ ] Monitor Redis hit rate (`redis-cli info stats | grep hits`)
