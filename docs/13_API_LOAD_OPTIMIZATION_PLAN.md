# 13 — Kế hoạch tối ưu tải API (chống "too many request → treo hệ thống")

> **Trạng thái:** Kế hoạch — chưa thực hiện
> **Vấn đề:** Thao tác liên tục → nhiều request → cạn tài nguyên server → 429 + server không phản hồi kịp → treo.
> **Liên quan:** docs/10 (DB query — đã làm gần hết), docs/11 (Redis + Load balancer — track mở rộng).

---

## 1. Bối cảnh & triệu chứng

Khi người dùng thao tác nhanh/liên tục (đổi tab, filter, phân trang, mở nhiều màn hình), lượng request API tăng vọt → pool/CPU cạn → rate limiter trả **429 Too Many Requests** → client retry/hammer → server càng quá tải → **treo**.

DB query đã được tối ưu (docs/10). Điểm nghẽn còn lại **không phải query** mà là **số lượng request & độ trùng lặp ở client + năng lực chịu tải ở server**.

## 2. Chẩn đoán (từ chính code hiện tại)

| Phát hiện | Hiện trạng | Hệ quả |
|---|---|---|
| **React Query** | Đã cài + cấu hình (`staleTime 30s`) nhưng **0 file dùng** `useQuery` — 37 trang dùng `useEffect + axios` thô | Đổi tab/filter/quay lại trang đều **refetch lại**, không cache, không gộp request trùng → bùng nổ request |
| **DB pool** | `env.db.max = 10` | Burst >10 request đồng thời → pool cạn → request xếp hàng → timeout → treo |
| **Compression** | **Chưa bật** gzip/brotli | Payload lớn → tốn băng thông + thời gian mỗi request |
| **Rate limit** | Global **200 req / 60s / IP**, không phân tầng read/write, không có `Retry-After`, key theo IP | UI bursty chạm trần; client không biết chờ bao lâu → hammer |
| **Client khi 429** | Không có backoff/retry có kiểm soát | Gặp 429 → user bấm lại → càng nặng |

→ **Gốc rễ: request quá nhiều & trùng lặp (client) + pool nhỏ + thiếu lớp bảo vệ (server).**

## 3. Playbook theo lớp (các kỹ sư hàng đầu áp dụng)

### Lớp 1 — Giảm request tại NGUỒN (frontend) — rẻ nhất, tác động lớn nhất

**1.1 React Query hoá các GET** (đã cài sẵn `@tanstack/react-query`):
- Tự **cache + dedup + stale-while-revalidate**: cùng một data, nhiều component / nhiều lần thao tác → chỉ **1 request**; data còn "tươi" (`staleTime`) → không refetch.
- `keepPreviousData` cho phân trang mượt; `signal` (AbortController) huỷ request cũ tự động.
- Query key chuẩn hoá theo tham số.

```js
// frontend/src/hooks/useApi.js — wrapper mỏng
import { useQuery } from '@tanstack/react-query'
export function useApiQuery(key, fetcher, opts = {}) {
  return useQuery({ queryKey: key, queryFn: ({ signal }) => fetcher(signal), staleTime: 30_000, keepPreviousData: true, ...opts })
}
```
```js
// Ví dụ: trang Tasks
const { data, isLoading } = useApiQuery(
  ['tasks', { companyId, month, year, status }],
  (signal) => tasksApi.listTasks(params, { signal }),
)
// Mutation → invalidate đúng key
const qc = useQueryClient()
await tasksApi.updateTask(id, body)
qc.invalidateQueries({ queryKey: ['tasks'] })
```
`staleTime` đề xuất theo loại dữ liệu:
- Reference (task-types, companies, users, enums, sources): **5–30 phút**.
- Danh sách nghiệp vụ (tasks, CDR…): **20–60 giây**.
- Realtime (đếm thông báo): **0–10 giây** + `refetchOnWindowFocus`.

**1.2 Debounce & huỷ request:** search/filter debounce 300–350ms (rà soát toàn bộ); React Query `signal` tự huỷ in-flight khi đổi key.

**1.3 Không refetch thừa:** tắt `refetchOnWindowFocus` cho data ít đổi; giữ cache khi chuyển tab nội bộ.

### Lớp 2 — Mỗi request RẺ hơn (backend)

**2.1 Tăng DB pool:** `env.db.max 10 → 25` (theo số CPU/RAM Postgres) + log `pool.totalCount / waitingCount`.
**2.2 Bật compression:**
```js
// backend/src/app.js
const compression = require('compression')   // npm i compression
app.use(compression())
```
**2.3 Redis cache reference data** (theo docs/11): task-types, companies, users, enums, progress-matrix sources… + invalidate khi mutation.
**2.4 HTTP cache headers:** `ETag` / `Cache-Control: private, max-age=…` cho endpoint data tĩnh → trình duyệt tự dùng `304 Not Modified`.

### Lớp 3 — BẢO VỆ server (không để treo)

**3.1 Rate limit phân tầng + key theo user + Retry-After:**
```js
const readLimiter  = rateLimit({ windowMs: 60_000, max: 600, keyGenerator: r => r.user?.id || r.ip,
  standardHeaders: true, legacyHeaders: false,
  handler: (req,res) => res.status(429).set('Retry-After','10').json({ success:false, error:{ message:'Quá nhiều yêu cầu, thử lại sau ít giây' }}) })
const writeLimiter = rateLimit({ windowMs: 60_000, max: 120, keyGenerator: r => r.user?.id || r.ip, /* ... */ })
// GET → readLimiter; POST/PATCH/DELETE → writeLimiter
```
**3.2 Client backoff khi 429** (axios interceptor — chống hammer):
```js
api.interceptors.response.use(null, async (err) => {
  const cfg = err.config
  if (err.response?.status === 429 && (cfg._retry ?? 0) < 2) {
    cfg._retry = (cfg._retry ?? 0) + 1
    const wait = (Number(err.response.headers['retry-after']) || 1) * 1000 + Math.random() * 300
    await new Promise(r => setTimeout(r, wait))
    return api(cfg)
  }
  return Promise.reject(err)
})
```
**3.3 Timeout fail-fast:** axios `timeout: 20000`; server `server.requestTimeout` → không giữ pool/treo vô hạn.
**3.4 Queue việc nặng** (BullMQ trên Redis): export lớn / báo cáo nặng đẩy vào hàng đợi, trả `202 + jobId`, FE poll/nhận socket → không chiếm request thread.

### Lớp 4 — Mở RỘNG năng lực (khi traffic thật lớn)
- Nginx **load balancer** + scale backend nhiều instance (docs/11) + **distributed scheduler lock** (Redis).
- **PgBouncer** trước Postgres (pooling tập trung); **read replica** cho report.

### Lớp 5 — ĐO lường
- `pg_stat_statements`, slow-query log, Redis hit-rate, log pool stats, đếm query/request, p95 latency.

## 4. Roadmap đề xuất (impact / cost)

| Pha | Nội dung | Ước tính | Tác động |
|---|---|---|---|
| **A — Quick wins server** | Pool 10→25 · `compression` · axios 429-backoff + timeout · rate-limit phân tầng + `Retry-After` | 2–4h | Chặn ngay tình trạng treo do burst; không cần đổi nhiều file |
| **B — React Query hoá GET** | Wrapper `useApiQuery`; áp dần: reference data → trang nặng (Tasks, Companies, ProgressMatrix, CDR, Internal) | 1–2 ngày (làm dần) | **Giảm 50–80% request trùng** — đòn lớn nhất |
| **C — Redis cache reference** | task-types/companies/users/enums/sources + invalidation (docs/11) | 0.5–1 ngày | Giảm tải DB cho data ít đổi |
| **D — Queue việc nặng** | BullMQ cho export/report lớn | 0.5–1 ngày | Không để job nặng chiếm request thread |
| **E — Scale ngang** | Nginx LB + PgBouncer + read replica | 1–2 ngày | Chịu tải gấp nhiều lần (khi cần) |

**Khuyến nghị:** làm **A trước** (rẻ, chặn treo ngay) → **B** (giảm request tận gốc) → C → D → E khi cần.

## 5. Tiêu chí nghiệm thu

- Thao tác liên tục bình thường **không còn 429** / treo.
- Pool usage < 80%, `waitingCount` ~ 0 ở tải thường.
- Số query / request ≤ 5; p95 response < 200ms (list từ cache < 50ms).
- Khi vẫn 429 (tải bất thường): client **tự backoff**, không hammer; user thấy thông báo "thử lại sau".

## 6. Rủi ro & lưu ý

- **Cache invalidation sai** → user thấy data cũ → phải invalidate đúng query key / Redis key sau mọi mutation (test kỹ).
- React Query hoá nên làm **dần từng trang**, không "big bang" — mỗi trang build + kiểm thử.
- Tăng pool phải cân với `max_connections` của Postgres (pool tổng các instance ≤ max_connections − dự phòng).
- Rate-limit theo `user.id` cần đặt **sau** middleware `authenticate` (có `req.user`); route public vẫn key theo IP.
