# 020 - Rà & Fix Hardcode Enum (Danh mục động)

## Mục tiêu
Playbook để **quét, báo cáo, sửa** các chỗ đang hardcode danh mục (enum) trên toàn app.
Danh mục = những giá trị admin quản lý được trong **Cài đặt → Danh mục hệ thống**
(`enum_types` / `enum_options`). Enum bị hardcode → thêm option mới trong Cài đặt sẽ
**crash khi lọc** hoặc **không gán/không hiển thị được**.

> Áp cho người mới vào rà 1 page: đọc mục "Checklist quét 1 page" ở cuối rồi chạy các lệnh grep.

---

## 1. Hai hệ enum trong dự án (phải phân biệt)

| Hệ | Là gì | Trạng thái mong muốn |
|---|---|---|
| **enum_types / enum_options** | Danh mục admin sửa được ở Cài đặt (nhãn, thứ tự, nhóm, thêm/xóa) | Nguồn DUY NHẤT của danh sách + nhãn |
| **ENUM gốc Postgres** (`CREATE TYPE ... AS ENUM`) | Kiểu cột cứng, chỉ nhận tập giá trị cố định | ❌ KHÔNG dùng cho cột danh mục → phải là **VARCHAR** |

**Nguyên tắc vàng:**
1. Cột DB của danh mục = **VARCHAR**, KHÔNG phải ENUM gốc.
2. Backend validate = **`z.string()`** (không `z.enum([...])`), trừ nhóm "hành vi/bảo mật" (mục 5).
3. Frontend lấy danh sách = **`getOptions('type_key')`**, lấy nhãn = **`getLabel('type_key', key, fallback)`**.
   Không render `<option>` từ mảng cứng, không tra nhãn từ map cứng làm nguồn chính.

---

## 2. Bốn loại hardcode cần quét (và cách phát hiện)

### Loại 1 — Cột DB là ENUM gốc (nặng nhất: crash 500 khi lọc)
```bash
# Còn cột nào đang dùng ENUM gốc? (kỳ vọng: 0)
docker exec <postgres> psql -U <user> -d <db> -tAc "
  SELECT c.table_name||'.'||c.column_name||' :: '||c.udt_name
  FROM information_schema.columns c JOIN pg_type t ON t.typname=c.udt_name
  WHERE t.typtype='e' AND c.table_schema='public';"
```
Ra dòng nào = cột đó còn hardcode → cần migration đổi sang VARCHAR (mục 4).

### Loại 2 — Backend ép kiểu `::<enum>` trong câu SQL (vỡ query sau khi đổi cột)
```bash
cd backend/src
grep -rnoE "::(task_status|task_priority|user_role|company_status|document_category|recurrence_type|field_data_type|notification_type|payroll_status|report_type_enum|assignment_status|assignment_priority|assignee_status|request_status|attendance_status|checkin_method|leave_type|shift_type|client_doc_status|business_type)(\[\])?" .
```
Mỗi kết quả → đổi `::<enum>` thành `::text` / `::text[]`.

### Loại 3 — Backend `z.enum([...])` khoá cứng danh sách (chặn giá trị mới)
```bash
grep -rnE "z\.enum\(" backend/src/modules/
```
Field danh mục → đổi sang `z.string().min(1).max(50)`.
(Giữ z.enum cho nhóm hành vi/bảo mật — mục 5. Bỏ qua các z.enum KHÔNG phải danh mục
Cài đặt, vd hình khối process editor `nodeType/edgeKind/edgeShape`.)

### Loại 4 — Frontend render option / tra nhãn từ mảng-map CỨNG
```bash
cd frontend/src/pages/<Page>
# Mảng giá trị cứng render dropdown/option:
grep -rnE "\['[a-z_]+',\s*'[a-z_]+'" .
# Map nhãn/CSS cứng dùng LÀM NGUỒN CHÍNH (không qua getLabel/getOptions):
grep -rnE "_LABELS\[|_CSS\[|_OPTIONS\b|CATEGORIES\b" .
# Đối chiếu: có dùng getOptions/getLabel không?
grep -rnE "getOptions\(|getLabel\(" .
```
**Phân biệt tốt vs xấu:**
- ✅ TỐT (fallback): `getLabel('task_priority', key, PRIORITY_LABELS[key])` — store là chính, map cứng chỉ đỡ.
- ✅ TỐT: `getOptions('x').length ? getOptions('x') : FALLBACK` — động, có fallback.
- ❌ XẤU (nguồn chính cứng): `['urgent','high','medium','low'].map(...)` render option;
  `STATUS_LABELS[row.status]` (không bọc getLabel) làm nhãn hiển thị.

---

## 3. Phân biệt danh mục PHÂN LOẠI vs enum HÀNH VI (quyết định mức fix)

**Danh mục PHÂN LOẠI** — giá trị chỉ để gắn nhãn/lọc, code KHÔNG rẽ nhánh theo:
→ Làm **động hoàn toàn** (cột varchar + `z.string` + frontend getOptions).
- VD: `business_type`, `document_category`, `location_type`, `accounting_form`, priorities.

**Enum HÀNH VI / BẢO MẬT** — giá trị **gắn với logic code** (máy trạng thái, bộ sinh việc,
renderer, phân quyền):
→ Cột vẫn **varchar** (không crash) + **frontend động** (list/nhãn), NHƯNG:
- **Giữ `z.enum`** ở backend làm rào validate (trừ khi cố ý mở như `task_status` — xem mục 6),
- **Có "key dành riêng"** mà code neo vào — đổi nhãn được, **KHÔNG xóa/đổi key**.

| Enum hành vi | Key dành riêng (code neo vào) | Logic |
|---|---|---|
| `task_status` | `pending`, `in_progress`, `on_hold`, `completed`, `needs_revision` | gate checklist, hoàn thành, quá hạn, escalation |
| `recurrence_type` | daily/weekly/monthly.../once | bộ sinh công việc định kỳ |
| `field_data_type` | text/number/date/boolean/select | renderer trường tùy chỉnh |
| `user_role` | `admin`, `staff` | RBAC — **KHÔNG nới z.enum** (bảo mật) |
| `company_status` | `active`, `terminated` | chặn thao tác khi terminated |
| `payroll_status` | draft/confirmed/paid | quy trình duyệt lương |

> Quy tắc: đổi cột→varchar + frontend động là AN TOÀN với mọi logic vì code **so sánh theo
> GIÁ TRỊ chuỗi** (`status === 'completed'`), varchar hay enum đều chạy như nhau. Chỉ **thêm
> KEY mới** vào enum hành vi mới là vô nghĩa (code không xử lý) → cần code riêng nếu muốn.

---

## 4. Recipe FIX theo từng lớp

### 4a. DB — đổi cột ENUM gốc → VARCHAR (migration mới `NNN_*.sql`)
```sql
-- Cột CÓ default: drop → đổi kiểu → set lại (dạng text)
ALTER TABLE <t> ALTER COLUMN <c> DROP DEFAULT;
ALTER TABLE <t> ALTER COLUMN <c> TYPE VARCHAR(50) USING <c>::text;
ALTER TABLE <t> ALTER COLUMN <c> SET DEFAULT '<giá trị>';
-- Cột KHÔNG default: chỉ 1 dòng TYPE ... USING ::text
```
**Bẫy thường gặp — partial index ép enum trong predicate** (làm ALTER lỗi
`operator does not exist: character varying <> <enum>`):
```bash
# Tìm index có WHERE tham chiếu cột enum
docker exec <pg> psql ... -tAc "SELECT indexname, indexdef FROM pg_indexes
  WHERE schemaname='public' AND indexdef ILIKE '%WHERE%';"
```
→ trong migration: `DROP INDEX` → đổi cột → `CREATE INDEX ... WHERE (status <> 'completed')`
(literal KHÔNG ép `::enum` để hợp cả varchar lẫn enum). Giữ lại KIỂU enum gốc để down migrate.
Runner gửi cả file trong 1 query ⇒ **transaction ngầm, lỗi là rollback sạch**.

### 4b. Backend
- Câu lọc: `col = ANY($n::text[])` / `col::text IN (...)` (thay vì `::<enum>`).
- Schema: `z.string().min(1).max(50)` cho field danh mục phân loại.
- Nếu cần validate giá trị hợp lệ (vd status): `const valid = await enums.getValues('type_key')`
  rồi kiểm tra `valid.includes(newValue)`.

### 4c. Frontend
```jsx
const opts = getOptions('type_key').length > 0
  ? getOptions('type_key')                 // [{ key, label }]
  : FALLBACK.map(k => ({ key: k, label: LABELS[k] }))
// render:
{opts.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
// nhãn hiển thị luôn qua getLabel (có fallback):
getLabel('type_key', row.value, LABELS[row.value] ?? row.value)
// hàm cấp module (không gọi hook được): useEnumsStore.getState().getLabel(...)
```
Giữ map cứng (`*_LABELS`, `*_CSS`) **chỉ làm fallback** — không xóa, không dùng làm nguồn chính.

---

## 5. Test bắt buộc sau khi fix (test kỹ qua HTTP thật)
1. **Lọc theo giá trị mới/lạ không crash**: `GET /api/<list>?<field>=gia_tri_la` → **200** (không 500).
2. **Gán giá trị mới**: thêm option qua `POST /api/enums/:typeKey/options {optionKey,label}` →
   `PATCH`/`POST` bản ghi với giá trị mới → **200**; lọc lại thấy nó.
3. **Giá trị rác bị chặn** (nếu có validate): → **422**.
4. **Rule hành vi còn nguyên**: vd tick checklist khi task `pending` → **422 (TASK_NOT_STARTED)**.
5. **Không đụng frontend contract**: các list endpoint liên quan vẫn **200**, JSON không đổi.
6. Dọn sạch dữ liệu test.

> Lưu ý test: sau khi restart backend phải **chờ sẵn sàng** (poll `/api/enums` tới khi 200/401)
> rồi mới gọi, tránh 502 giả. Thêm option qua **API** để cache enum tự invalidate (thêm bằng
> SQL trực tiếp thì phải restart để nạp lại cache).

---

## 6. Trạng thái hiện tại (đã làm)

| Module | Đã fix | Ghi chú |
|---|---|---|
| **Toàn bộ 22 cột enum gốc → VARCHAR** | ✅ migration `104_all_enums_dynamic` | DB hết hardcode enum |
| `business_type` | ✅ migration `103` + service + schema | danh mục động |
| **Companies** (list, detail, filter, popup, header-filter) | ✅ | getOptions/getLabel |
| **Tasks** (list, board, detail, filter, quick-edit, form) | ✅ | priority + status động |
| `task_status` — **any-to-any** | ✅ bỏ `canTransition`, `z.string`, board/dropdown động | rule hành vi giữ nguyên |

**Vẫn giữ z.enum (cố ý)**: `recurrence_type`, `field_data_type`, `user_role`
(+ `nodeType/edgeKind/edgeShape` của process editor — không phải danh mục Cài đặt).

**CHƯA làm động** (còn hardcode ở tầng hiển thị/nghiệp vụ, cần rà tiếp):
- **Màu** danh mục (`STATUS_CSS`, `COL_DOT`, `PRIORITY_CSS`...) — `enum_options` chưa có cột `color`,
  UI Cài đặt chưa có ô chọn màu → option mới hiện màu trung tính.
- Các page khác chưa rà: Nội bộ (internal-assignments), Yêu cầu KH (client-requests),
  Chấm công (attendance/leave/overtime/shifts), Bảng lương (payroll), Nhân viên (staff),
  BC Tiến độ (progress-matrix), Lịch định kỳ (schedules).

---

## 7. Checklist quét 1 page (làm theo thứ tự)

- [ ] **DB**: chạy grep Loại 1 — page này đụng bảng nào? Cột đó còn ENUM gốc không?
- [ ] **Backend service của page**: grep Loại 2 (`::<enum>`) + Loại 3 (`z.enum`).
- [ ] **Frontend page**: grep Loại 4 (mảng cứng render option; `*_LABELS[...]`/`*_CSS[...]` làm nguồn chính).
- [ ] Với mỗi chỗ ❌: xác định là **phân loại** hay **hành vi** (mục 3) → chọn mức fix.
- [ ] Fix theo recipe (mục 4).
- [ ] **Test** theo mục 5 (đặc biệt: lọc giá trị lạ không 500 + rule hành vi còn nguyên).
- [ ] Báo cáo: liệt kê chỗ đã sửa (file:line), kết quả test, phần cố ý giữ + lý do.

## Tham chiếu
| File | Vai trò |
|---|---|
| `backend/migrations/103_business_type_dynamic.sql` · `104_all_enums_dynamic.sql` | Mẫu migration enum→varchar (kèm xử lý partial index) |
| `backend/src/lib/enums.js` | `getOptions / getValues / getLabel / expandGroupKeys / invalidate` |
| `frontend/src/hooks/useEnums.js` | store: `getOptions('type') → [{key,label}]`, `getLabel(type,key,fb)` |
| `frontend/src/pages/Companies/Companies.jsx` · `Tasks/Tasks.jsx` | Mẫu đã fix đầy đủ |
| `docs/018_COLUMN_HEADER_FILTER.md` | Bộ lọc header cột (liên quan getDisplayLabel) |
