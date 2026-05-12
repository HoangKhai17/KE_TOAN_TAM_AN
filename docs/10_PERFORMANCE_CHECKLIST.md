# ⚡ PERFORMANCE & OPTIMIZATION CHECKLIST
> Phiên bản: 1.0 | Tạo: 2026-04-24
> Tài liệu tham chiếu khi: xây dựng tính năng mới · review code · kiểm tra DB · trao đổi kỹ thuật

---

## Mục đích sử dụng

Dùng tài liệu này khi:
- Xây dựng **tính năng mới** — checklist trước khi merge
- **Review code** của người khác — danh sách điểm cần kiểm tra
- **Chẩn đoán chậm** — hệ thống ngày thường chạy tốt nhưng bắt đầu chậm
- **Trao đổi kỹ thuật** — ngôn ngữ chung giữa dev và DBA

---

## Phần 1 — Database: Query

### 1.1 Pagination (phân trang)

| # | Kiểm tra | Trạng thái hệ thống |
|---|----------|-------------------|
| ☐ | Mọi endpoint trả danh sách đều có `LIMIT` và `OFFSET` | ✅ Đã áp dụng toàn bộ |
| ☐ | `LIMIT` tối đa bị cap cứng (không để client truyền tuỳ ý) | ✅ `Math.min(100, limit)` |
| ☐ | Page mặc định là `1`, limit mặc định là `20` | ✅ |
| ☐ | Response trả về `total`, `page`, `total_pages` | ✅ Dùng `COUNT(*) OVER()` |

> **Tại sao quan trọng:** Không có LIMIT → 1 request có thể kéo 100 000 dòng về RAM → timeout hoặc OOM crash.

**Pattern chuẩn (đã áp dụng):**
```sql
-- Dùng window function — 1 query duy nhất trả cả data lẫn total
SELECT col1, col2, ..., COUNT(*) OVER() AS _total
FROM table
WHERE ...
ORDER BY created_at DESC
LIMIT $limit OFFSET $offset
```
```js
// Sau khi query:
const count = rows[0]?._total ?? 0
const total_pages = Math.ceil(count / limitNum)
```

---

### 1.2 Indexes

| # | Kiểm tra | Trạng thái hệ thống |
|---|----------|-------------------|
| ☐ | Cột dùng trong `WHERE` thường xuyên có index | ✅ `status`, `platform`, `received_at`, `category_id`, `document_type_id` |
| ☐ | Cột dùng `ORDER BY` có index DESC | ✅ `idx_records_received (received_at DESC)` |
| ☐ | FK (foreign key) có index riêng | ✅ `sender_id`, `category_id`, `document_type_id` |
| ☐ | Filter kết hợp nhiều cột có composite index | ✅ `(received_at DESC, status)`, `(received_at DESC, platform)` |
| ☐ | Full-text search dùng GIN index, không dùng ILIKE | ✅ `idx_records_fts` — `to_tsvector + plainto_tsquery` |
| ☐ | Cột nullable có partial index (`WHERE col IS NOT NULL`) | ✅ `idx_records_extraction_status`, `idx_rfv_value_number` |
| ☐ | Bảng tham chiếu nhỏ (< 1000 dòng) không cần thêm index | ✅ `categories`, `document_types` — dùng cache |

**Khi nào cần thêm index:**
```
Thêm index khi cột đó xuất hiện trong:
  WHERE col = ?           → BTREE đơn
  WHERE col = ANY(array)  → BTREE đơn
  ORDER BY col DESC       → BTREE DESC
  WHERE a = ? ORDER BY b  → Composite (a, b DESC)
  Full-text search        → GIN (to_tsvector)
  WHERE col IS NOT NULL   → Partial index
```

**Khi KHÔNG nên thêm index:**
```
  - Bảng < 1 000 dòng → seq scan nhanh hơn index scan
  - Cột có cardinality thấp (VD: boolean is_active chỉ có 2 giá trị)
    → nếu 80% dòng là TRUE thì index không giúp ích
  - Cột chỉ dùng trong INSERT, không bao giờ dùng để filter
  - Quá nhiều index trên 1 bảng → làm chậm INSERT/UPDATE
```

**Kiểm tra index hiện tại (psql):**
```sql
-- Xem tất cả index của 1 bảng
\d records

-- Xem index nào đang được dùng (cần EXPLAIN ANALYZE)
EXPLAIN ANALYZE SELECT * FROM records WHERE status = 'new' ORDER BY received_at DESC LIMIT 20;

-- Xem index nào không bao giờ được dùng (production)
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY tablename;
```

---

### 1.3 N+1 Query

| # | Kiểm tra | Trạng thái hệ thống |
|---|----------|-------------------|
| ☐ | Không dùng loop để query từng dòng riêng lẻ | ✅ Dùng `ANY($ids::uuid[])` |
| ☐ | Related data được load theo batch, không từng dòng | ✅ `rfvService.getForRecords()` |
| ☐ | Subquery trong WHERE dùng `IN (subquery)` hoặc `EXISTS`, không join nhiều tầng | ✅ Đã refactor EXISTS |

**Pattern nguy hiểm (N+1):**
```js
// ❌ SAI — N query cho N records
for (const record of records) {
  record.fieldValues = await db.query('SELECT * FROM rfv WHERE record_id = $1', [record.id])
}

// ✅ ĐÚNG — 1 query cho tất cả
const fvMap = await rfvService.getForRecords(records.map(r => r.id))
// getForRecords dùng: WHERE record_id = ANY($1::uuid[])
```

**Pattern EXISTS an toàn (đã áp dụng):**
```sql
-- ✅ Không JOIN bên trong EXISTS — dùng IN subquery
EXISTS (
  SELECT 1 FROM record_field_values rfv
  WHERE rfv.record_id = r.id
    AND rfv.field_id IN (SELECT id FROM document_type_fields WHERE field_key = $key)
    AND rfv.value_number >= $val
)
```

---

### 1.4 Search & Filter

| # | Kiểm tra | Trạng thái hệ thống |
|---|----------|-------------------|
| ☐ | Search text dùng FTS (`to_tsvector` + GIN), không dùng `ILIKE '%..%'` | ✅ Đã sửa |
| ☐ | Filter nhiều giá trị dùng `= ANY(array)` thay vì `IN (?,?,?)` | ✅ |
| ☐ | Filter multi-value từ client phải được split và validate | ✅ CSV split + filter |
| ☐ | Input từ user không bao giờ concat trực tiếp vào SQL | ✅ Parameterized queries |

**Tại sao không dùng ILIKE:**
```sql
-- ❌ ILIKE '%keyword%' — leading wildcard → không dùng được index → seq scan toàn bảng
WHERE note ILIKE '%hóa đơn%'

-- ✅ Full-text search — dùng GIN index, hỗ trợ tiếng Việt
WHERE to_tsvector('simple', coalesce(note,'') || ' ' || coalesce(ocr_text,''))
      @@ plainto_tsquery('simple', 'hóa đơn')
```

**Tạo GIN index cho bảng mới:**
```sql
CREATE INDEX idx_<table>_fts ON <table>
  USING gin(to_tsvector('simple',
    coalesce(col1, '') || ' ' || coalesce(col2, '')
  ));
```

---

### 1.5 Transaction & Atomicity

| # | Kiểm tra | Trạng thái hệ thống |
|---|----------|-------------------|
| ☐ | Nhiều write liên quan được wrap trong transaction | ✅ OCR async UPDATE + upsertMany |
| ☐ | Transaction không bao gồm external call (HTTP, OCR...) | ✅ External call ở Phase 1, DB write ở Phase 2 |
| ☐ | `client.release()` luôn được gọi trong `finally` | ✅ |
| ☐ | ROLLBACK được catch và log | ✅ |
| ☐ | Không dùng `db.query` bên trong transaction — phải dùng `client.query` | ✅ rfvService nhận `client` param |

**Pattern transaction chuẩn:**
```js
const client = await db.pool.connect()
try {
  await client.query('BEGIN')

  await client.query('UPDATE table1 SET ... WHERE id = $1', [id])
  await someService.upsertMany(id, entries, client) // truyền client xuống

  await client.query('COMMIT')
} catch (err) {
  await client.query('ROLLBACK').catch(() => {})
  logger.warn('tx.failed', { error: err.message })
  // xử lý lỗi hoặc fallback
} finally {
  client.release() // LUÔN LUÔN release
}
```

---

### 1.6 SELECT — Chọn cột cẩn thận

| # | Kiểm tra | Trạng thái hệ thống |
|---|----------|-------------------|
| ☐ | List endpoint không dùng `SELECT *` — chỉ lấy cột cần thiết | ✅ List endpoint chỉ lấy cần thiết |
| ☐ | Detail endpoint có thể dùng `SELECT r.*` vì cần tất cả | ⚠️ `GET /:id` dùng `r.*` — chấp nhận được |
| ☐ | Cột TEXT lớn (ocr_text, extracted_data) không trả trong list view | ✅ List endpoint bỏ `extracted_data` |

**Khi nào cần cẩn thận với SELECT *:**
```
Bảng records có các cột TEXT lớn:
  - ocr_text     → có thể 5–20KB
  - extracted_data (JSONB) → có thể 10–50KB
  - image_url    → ~200 bytes (nhỏ, OK)

→ List 20 records × 20KB = 400KB payload mỗi request
→ Detail 1 record × 50KB = acceptable
```

---

### 1.7 Aggregate & Report Query

| # | Kiểm tra | Trạng thái hệ thống |
|---|----------|-------------------|
| ☐ | GROUP BY trên cột có index | ✅ GROUP BY status (có idx_records_status) |
| ☐ | Aggregate query chạy parallel khi độc lập | ✅ `Promise.all([q1, q2, q3])` trong reports |
| ☐ | Report query có filter `date_from/date_to` để tránh scan toàn bảng | ✅ |
| ☐ | Aggregate trên `value_number` dùng partial index | ✅ `idx_rfv_field_value_number` |

---

## Phần 2 — Database: Schema & Migration

### 2.1 Thiết kế bảng mới

| # | Kiểm tra |
|---|----------|
| ☐ | Primary key là UUID (`gen_random_uuid()`) — phân tán tốt, không sequential |
| ☐ | Timestamps: `created_at TIMESTAMP NOT NULL DEFAULT NOW()`, `updated_at TIMESTAMP NOT NULL DEFAULT NOW()` |
| ☐ | FK có `ON DELETE` rõ ràng: `CASCADE` (xóa theo), `SET NULL` (giữ lại null), `RESTRICT` (chặn xóa) |
| ☐ | Enum định nghĩa bằng `VARCHAR + CHECK` hoặc `CREATE TYPE` |
| ☐ | Cột nullable được đánh dấu `NULLABLE` rõ ràng (không để PostgreSQL tự hiểu) |
| ☐ | UNIQUE constraint trên cột cần unique (PostgreSQL tự tạo index) |
| ☐ | Thêm index ngay trong file migration — không để sau |

**Template bảng mới:**
```sql
CREATE TABLE <name> (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ... cột nghiệp vụ ...
  created_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- Indexes (thêm ngay, đừng để sau)
CREATE INDEX idx_<name>_<col> ON <name>(<col>);
```

---

### 2.2 Migration an toàn

| # | Kiểm tra |
|---|----------|
| ☐ | File migration đánh số thứ tự: `011_`, `012_`, ... |
| ☐ | Dùng `IF NOT EXISTS` cho `CREATE INDEX` để idempotent |
| ☐ | Thêm cột mới phải `NULLABLE` hoặc có `DEFAULT` (tránh lock bảng) |
| ☐ | KHÔNG DROP cột/bảng nếu code cũ vẫn đang dùng (blue-green) |
| ☐ | Test migration trên DB dev trước khi chạy production |
| ☐ | Migration runner dùng transaction + tracking (`_migrations` table) |

**Thêm cột an toàn (không lock bảng có dữ liệu):**
```sql
-- ✅ An toàn — nullable hoặc có default
ALTER TABLE records ADD COLUMN new_col VARCHAR(50);
ALTER TABLE records ADD COLUMN score NUMERIC DEFAULT 0;

-- ❌ Nguy hiểm — NOT NULL không có default → lock bảng, fail nếu có dữ liệu
ALTER TABLE records ADD COLUMN new_col VARCHAR(50) NOT NULL;
```

---

### 2.3 Kiểm tra sức khỏe DB

```sql
-- Xem size các bảng
SELECT
  relname AS table,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  pg_size_pretty(pg_relation_size(relid))        AS table_size,
  pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;

-- Xem index nào không được dùng (ứng viên để DROP)
SELECT schemaname, tablename, indexname, idx_scan AS times_used
FROM pg_stat_user_indexes
WHERE idx_scan < 10
ORDER BY idx_scan;

-- Xem slow queries (cần pg_stat_statements extension)
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;

-- EXPLAIN ANALYZE cho query cụ thể
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM records WHERE status = 'new' AND received_at >= '2026-04-01'
ORDER BY received_at DESC LIMIT 20;
```

**Đọc EXPLAIN ANALYZE:**
```
Seq Scan on records  → KHÔNG có index — cần thêm index
Index Scan           → Tốt — đang dùng index
Bitmap Heap Scan     → Tốt với filter phức tạp
Hash Join            → Join kiểu hash — OK với bảng lớn
Nested Loop          → Cẩn thận nếu outer loop lớn
rows=1 (actual: 5000) → Optimizer ước sai → cần ANALYZE để cập nhật statistics
```

---

## Phần 3 — Backend API

### 3.1 Response Size

| # | Kiểm tra |
|---|----------|
| ☐ | List endpoint không trả về cột TEXT lớn (ocr_text, extracted_data) |
| ☐ | Có thể dùng `?include_field_values=true` để opt-in data nặng |
| ☐ | Ảnh không trả base64 — chỉ trả URL |
| ☐ | Response không có nested object quá sâu (> 3 level) |

---

### 3.2 Caching

| # | Kiểm tra | Trạng thái hệ thống |
|---|----------|-------------------|
| ☐ | Dữ liệu tham chiếu ít thay đổi được cache in-memory | ✅ `document_types` + `categories` cache 5 phút |
| ☐ | Cache có TTL — không cache vĩnh viễn | ✅ `CACHE_TTL_MS = 5 * 60 * 1000` |
| ☐ | Cache được invalidate ngay khi có mutation | ✅ `invalidateCache()` sau POST/PATCH/DELETE |
| ☐ | Cache size được kiểm soát (không cache bảng lớn) | ✅ Chỉ cache bảng nhỏ (< 1000 dòng) |

**Khi nào nên cache:**
```
Cache tốt cho:
  ✓ Dữ liệu tham chiếu (categories, document_types, config)
  ✓ Kết quả query đắt được gọi nhiều lần trong 1 request
  ✓ API response của external service (OCR config, platform info)

Không nên cache:
  ✗ Dữ liệu user-specific (records của từng user)
  ✗ Dữ liệu realtime (pending count, status)
  ✗ Bảng có > 10 000 dòng (tốn RAM)
```

---

### 3.3 Connection Pool

| # | Kiểm tra | Trạng thái hệ thống |
|---|----------|-------------------|
| ☐ | Pool size `max` phù hợp với số CPU và concurrent request | ✅ `max: 20` |
| ☐ | `idleTimeoutMillis` được đặt (tránh connection zombie) | ✅ `30_000` |
| ☐ | `connectionTimeoutMillis` được đặt (fail fast khi DB down) | ✅ `2_000` |
| ☐ | Mọi `client.connect()` đều có `client.release()` trong finally | ✅ |
| ☐ | Không dùng pool connection cho long-running external call | ✅ External call trước, lấy client sau |

**Tại sao không lấy connection trước external call:**
```js
// ❌ SAI — giữ connection trong khi chờ OCR (có thể 30 giây)
const client = await db.pool.connect()
const ocrResult = await ocrService.extractText(url) // 30s → pool bị chiếm
await client.query(...)
client.release()

// ✅ ĐÚNG — OCR xong mới lấy connection
const ocrResult = await ocrService.extractText(url)
const client = await db.pool.connect()
try { ... } finally { client.release() }
```

---

### 3.4 Async & Non-blocking

| # | Kiểm tra | Trạng thái hệ thống |
|---|----------|-------------------|
| ☐ | Tác vụ nặng không block response API | ✅ OCR dùng `setImmediate` |
| ☐ | Fire-and-forget task (audit log) không await | ✅ `logAudit(...)` không await |
| ☐ | Các query độc lập chạy song song | ✅ `Promise.all([q1, q2])` trong reports |
| ☐ | Background task có error handling và log | ✅ try/catch + logger.warn |

**Pattern async đúng:**
```js
// ✅ Parallel queries độc lập
const [summary, records] = await Promise.all([
  db.query('SELECT COUNT(*) FROM records WHERE ...'),
  db.query('SELECT * FROM records LIMIT 20'),
])

// ✅ Background task không block response
setImmediate(async () => {
  try { await heavyTask() }
  catch (err) { logger.warn('task.failed', { error: err.message }) }
})
res.json({ success: true }) // trả về ngay
```

---

### 3.5 Input Validation & SQL Safety

| # | Kiểm tra | Trạng thái hệ thống |
|---|----------|-------------------|
| ☐ | Không có string concatenation trong SQL | ✅ 100% parameterized |
| ☐ | Input array (CSV) được split, trim, và filter rỗng trước khi dùng | ✅ |
| ☐ | Enum value được validate trước khi dùng trong query | ✅ `VALID_STATUSES.includes(s)` |
| ☐ | `field_key` động chỉ cho phép `[a-zA-Z0-9_]` | ✅ regex check trong buildFvCondition |
| ☐ | UUID input không cần escape — PostgreSQL tự validate khi cast `::uuid` | ✅ |

**Pattern validate CSV input:**
```js
const statuses = status
  ? status.split(',').map(s => s.trim()).filter(s => VALID_VALUES.includes(s))
  : []
```

---

## Phần 4 — Frontend

### 4.1 API Calls & State

| # | Kiểm tra |
|---|----------|
| ☐ | Không gọi API trong render loop — chỉ gọi trong `useEffect` hoặc event handler |
| ☐ | Concurrent request độc lập được gọi song song (`Promise.all`) |
| ☐ | Loading state được hiển thị trong khi chờ API |
| ☐ | Error state được xử lý — không crash khi API fail |
| ☐ | Race condition được xử lý (cancel request cũ khi component unmount) |

**Tránh race condition:**
```js
useEffect(() => {
  let cancelled = false
  fetchData().then(data => {
    if (!cancelled) setData(data)
  })
  return () => { cancelled = true } // cleanup khi unmount
}, [deps])
```

---

### 4.2 Polling

| # | Kiểm tra | Trạng thái hệ thống |
|---|----------|-------------------|
| ☐ | Polling dừng ngay khi condition không còn đúng | ✅ OCR poll dừng khi `ocr_status != 'pending'` |
| ☐ | `clearInterval` được gọi trong cleanup của `useEffect` | ✅ |
| ☐ | Interval không quá ngắn — tối thiểu 3 giây | ✅ `setInterval(fn, 3000)` |
| ☐ | Polling không chạy khi tab bị ẩn (tùy chọn — `document.hidden`) | 🔲 Chưa implement |

---

### 4.3 Optimistic UI

| # | Kiểm tra | Trạng thái hệ thống |
|---|----------|-------------------|
| ☐ | Action (approve/flag) cập nhật UI ngay, không chờ API response | ✅ `updateRecord()` |
| ☐ | Filter-aware: record biến mất khỏi list nếu status mới không khớp filter | ✅ |
| ☐ | Nếu API fail → rollback state về trạng thái cũ | ✅ `message.error` + state không thay đổi |
| ☐ | Không update UI khi chưa xác nhận action thành công (thao tác nguy hiểm) | ✅ Delete cần confirm |

---

### 4.4 Re-render & Memory

| # | Kiểm tra |
|---|----------|
| ☐ | Callback không tạo lại mỗi render — dùng `useCallback` khi cần |
| ☐ | Object/array không tạo mới trong JSX nếu không cần — gây re-render con |
| ☐ | List lớn (> 200 items) nên dùng virtual list (`react-window` hoặc tương đương) |
| ☐ | `socket.off` được gọi khi component unmount |
| ☐ | `clearInterval` / `clearTimeout` được gọi trong cleanup |

---

## Phần 5 — Checklist trước khi merge tính năng mới

### 5.1 Backend

```
Database:
  [ ] Bảng mới có đủ index (WHERE, ORDER BY, FK)
  [ ] Migration file được đánh số đúng, có IF NOT EXISTS
  [ ] ALTER TABLE thêm cột mới dùng NULLABLE hoặc DEFAULT
  [ ] Query mới không có ILIKE '%..%' — dùng FTS nếu cần search text
  [ ] Query list có LIMIT/OFFSET
  [ ] Không có N+1 (kiểm tra xem có loop query không)
  [ ] Nhiều write liên quan được wrap transaction

API:
  [ ] Input từ client được validate
  [ ] Enum value được whitelist check
  [ ] Không có SQL string concatenation
  [ ] Heavy task (upload, OCR, email) chạy async, không block response
  [ ] Parallel query cho data độc lập (Promise.all)
  [ ] Error được catch và trả HTTP status đúng
```

### 5.2 Frontend

```
Data fetching:
  [ ] API call trong useEffect, không trong render
  [ ] Loading + error state được xử lý
  [ ] Cleanup (cancel, clearInterval) khi unmount

UI:
  [ ] Optimistic update cho action thường xuyên
  [ ] Skeleton/spinner khi chờ data
  [ ] Không crash khi API trả về mảng rỗng
  [ ] Pagination hoạt động đúng

Performance:
  [ ] Không gọi API trùng lặp cho cùng data
  [ ] useCallback cho handler truyền vào child component
  [ ] Poll interval hợp lý (>= 3s)
```

---

## Phần 6 — Chẩn đoán khi hệ thống chậm

### 6.1 Quy trình chẩn đoán

```
Hệ thống bắt đầu chậm?
         │
         ├─ 1. Xem slow query log (query > 1000ms)
         │       → backend/logs/ hoặc logger output
         │
         ├─ 2. EXPLAIN ANALYZE query đó
         │       → Tìm "Seq Scan" trên bảng lớn
         │       → Nếu rows ước sai nhiều → chạy ANALYZE <table>
         │
         ├─ 3. Kiểm tra index
         │       → pg_stat_user_indexes: idx_scan = 0 → index không được dùng
         │       → Thêm composite index nếu filter kết hợp nhiều cột
         │
         ├─ 4. Kiểm tra connection pool
         │       → Nếu pool.totalCount == pool.max và pool.waitingCount > 0
         │       → Có connection bị leak (không release) hoặc cần tăng max
         │
         └─ 5. Kiểm tra N+1
                → Đếm số query trong 1 request (Morgan log hoặc pg query count)
                → Nếu số query tỉ lệ thuận với số record → N+1
```

### 6.2 Công cụ chẩn đoán

```sql
-- Xem query đang chạy hiện tại (production)
SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
FROM pg_stat_activity
WHERE state != 'idle' AND query_start < now() - interval '5 seconds'
ORDER BY duration DESC;

-- Kill query đang chạy quá lâu
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE duration > interval '60 seconds' AND state = 'active';

-- Xem bảng nào đang bị lock
SELECT relation::regclass, mode, granted
FROM pg_locks
WHERE NOT granted;

-- Cập nhật statistics để optimizer ước đúng hơn
ANALYZE records;
ANALYZE record_field_values;
```

---

## Phần 7 — Ngưỡng tham chiếu

| Metric | Tốt | Cần xem xét | Nguy hiểm |
|--------|-----|-------------|-----------|
| Query response time | < 100ms | 100–500ms | > 500ms |
| Slow query (> 1000ms) | 0/giờ | < 5/giờ | > 20/giờ |
| Connection pool usage | < 50% | 50–80% | > 80% |
| Số query / request | ≤ 5 | 6–10 | > 10 |
| Index hit rate | > 95% | 80–95% | < 80% |
| Records table size | < 100k | 100k–1M | > 1M |
| Response payload | < 50KB | 50–200KB | > 200KB |

---

## Phần 8 — Roadmap tối ưu khi scale

Khi hệ thống đạt ngưỡng cần nâng cấp:

```
50k+ records:
  → Thêm composite indexes (đã làm — migration 011)
  → Cân nhắc materialized view cho stats cards (thay COUNT realtime)

200k+ records:
  → Redis cache cho dashboard summary (thay polling DB 30s)
  → Read replica cho report queries
  → Partition records table theo received_at (range partition theo tháng)

1M+ records:
  → pg_partman để auto-partition
  → Archive records cũ (> 2 năm) sang cold storage
  → Elasticsearch cho full-text search nếu FTS PostgreSQL không đủ
  → Connection pooler (PgBouncer) trước PostgreSQL
```

---

*Tài liệu này được cập nhật sau mỗi đợt performance review hoặc khi phát hiện pattern mới.*
Beta
0 / 0
used queries
1