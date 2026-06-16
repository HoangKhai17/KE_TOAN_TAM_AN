# 019 — Generic Company Tables (Bảng Báo Cáo Tùy Biến Do Admin Tạo)

> Thiết kế hệ thống cho phép **admin tự tạo các "tab báo cáo" mới** trong Company Detail (kiểu Excel/Airtable), định nghĩa **một lần** và **đồng bộ tự động cho toàn bộ companies** — thay vì hardcode từng tab như hiện tại (HĐLĐ, HĐ KH.NCC, Nợ NSNN).

- **Trạng thái:** Đề xuất thiết kế (chưa implement)
- **Liên quan:** [02_CHUCNANG.md](./02_CHUCNANG.md) §1.5–1.8 · [05_DATABASE_SCHEMA.md](./05_DATABASE_SCHEMA.md) · [018_COLUMN_HEADER_FILTER.md](./018_COLUMN_HEADER_FILTER.md) · [014_CSS_STYLE_GUIDE.md](./014_CSS_STYLE_GUIDE.md)

---

## 1. Mục tiêu & phạm vi

### 1.1 Vấn đề
Mỗi "tab báo cáo" hiện tại (HĐLĐ, HĐ KH.NCC, Nợ NSNN, HS lưu trữ) là **một schema hardcode full-stack**: 1–2 bảng DB riêng + module backend (service/controller/router/schema) + component frontend ~1000 dòng + CSS. Mỗi lần khách hàng phát sinh báo cáo mới → phải code lại từ đầu. Cột tùy chỉnh hiện tại còn là **per-company** (không đồng bộ).

### 1.2 Mục tiêu
- Admin tạo / sửa / xóa **loại bảng** (tab) qua giao diện, không cần dev.
- Định nghĩa cột (tên, kiểu dữ liệu, bắt buộc, computed…) — **global**, tự áp dụng cho mọi company.
- Một component generic render mọi tab; một CRUD generic ở backend.
- Tái dùng toàn bộ tính năng đã có: column-header filter ([018](./018_COLUMN_HEADER_FILTER.md)), resize cột, inline edit, xuất Excel, phân trang client-side.

### 1.3 Non-goals (không làm)
- Không xây "Airtable mini" đầy đủ (relation giữa các bảng, formula language tổng quát, view nhiều kiểu).
- Không thay thế tab có cấu trúc đặc biệt: **HS lưu trữ (lưới 12 tháng)** giữ bespoke.
- Không đụng các tab nghiệp vụ lõi: Credentials, Documents, Notes, Công việc, Yêu cầu KH (CDR) — vẫn hardcode.

### 1.4 Tiền lệ trong codebase (vì sao khả thi)
Hệ thống đã đi theo triết lý **metadata-driven**:
- `task_type_custom_field_schemas` + `task_custom_field_values` — admin định nghĩa field → value lưu động (chính xác mô hình này).
- `enum_types` / `enum_options` — danh mục do admin quản lý.
- Column-header filter ([018](./018_COLUMN_HEADER_FILTER.md)) **đã type-driven** (text/number/date/enum) → khớp hoàn hảo với schema động.

---

## 2. Nguyên tắc thiết kế

1. **Định nghĩa global, dữ liệu per-company.** `defs` + `columns` dùng chung; `rows` thuộc từng company.
2. **JSONB cho dữ liệu động.** Giá trị mỗi dòng lưu trong `data JSONB` keyed theo `col_key` ổn định — không ALTER TABLE khi thêm cột.
3. **`col_key` bất biến.** Đổi label thoải mái; `col_key` không đổi để không mất data.
4. **Computed tách khỏi data.** Cột computed **không lưu** giá trị — tính tại render/query time từ cột nguồn (giống "số ngày còn lại" hiện tại).
5. **Tái dùng, không viết lại.** Filter/sort/resize/export/inline-edit dùng lại machinery sẵn có.
6. **An toàn dữ liệu cũ.** 4 tab hiện tại chạy song song; chỉ migrate khi engine generic đã ổn định và verify.

---

## 3. Tổng quan 3 pha

| Pha | Nội dung | Kết quả |
|---|---|---|
| **Pha 1** | Generic table thuần (text/number/date/select) + admin builder + CRUD rows | Admin tự tạo tab nhập liệu mới, đồng bộ mọi company |
| **Pha 2** | Computed columns + tô màu theo ngưỡng (conditional formatting) | Generic làm được "ngày còn lại / tình trạng / số ngày chậm" như tab bespoke |
| **Pha 3** | Migrate các tab bespoke (HĐLĐ, CSC, NSNN) → generic + hybrid per-company columns | Gỡ trùng lặp, một engine duy nhất (Archive vẫn riêng) |

---

# PHA 1 — Generic Data Tables

## P1.1 Mô hình dữ liệu

### Migration `073_company_tables.sql` (mới)

```sql
-- ── Định nghĩa TAB / loại bảng (GLOBAL) ───────────────────────────────────────
CREATE TABLE company_table_defs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_key    TEXT    NOT NULL UNIQUE,        -- key ổn định, vd 'bhxh_tracking'
  name         TEXT    NOT NULL,               -- label hiển thị "Theo dõi BHXH"
  description  TEXT,
  icon         TEXT,                           -- tên icon lucide, vd 'ShieldCheck'
  sort_order   INT     NOT NULL DEFAULT 0,     -- thứ tự tab trong Company Detail
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,  -- ẩn tab mà không xóa data
  allow_company_columns BOOLEAN NOT NULL DEFAULT FALSE,  -- (Pha 3) cho company thêm cột riêng
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Cột của bảng (GLOBAL — đồng bộ mọi company) ───────────────────────────────
CREATE TABLE company_table_columns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  def_id       UUID NOT NULL REFERENCES company_table_defs(id) ON DELETE CASCADE,
  col_key      TEXT NOT NULL,                  -- key ổn định trong bảng, vd 'so_so_bhxh'
  label        TEXT NOT NULL,
  data_type    TEXT NOT NULL DEFAULT 'text'
               CHECK (data_type IN ('text','number','date','select','computed')),
  required     BOOLEAN NOT NULL DEFAULT FALSE,
  options      JSONB,                          -- type=select: ["Đã nộp","Chưa nộp"]
  sort_order   INT NOT NULL DEFAULT 0,
  width        INT,                            -- độ rộng mặc định (px)
  -- (Pha 2) — null ở Pha 1:
  computed_type   TEXT
                  CHECK (computed_type IN ('days_until','days_since','status_threshold')),
  computed_config JSONB,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (def_id, col_key)
);
CREATE INDEX idx_ctc_def ON company_table_columns(def_id, sort_order);

-- ── Dữ liệu dòng (PER-COMPANY) ────────────────────────────────────────────────
CREATE TABLE company_table_rows (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  def_id     UUID NOT NULL REFERENCES company_table_defs(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  data       JSONB NOT NULL DEFAULT '{}',      -- { col_key: value, ... }
  position   INT NOT NULL DEFAULT 0,           -- thứ tự kéo-thả trong bảng
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ctr_def_company ON company_table_rows(def_id, company_id, position);
```

> File `.down.sql` drop 3 bảng theo thứ tự ngược (rows → columns → defs).

**Vì sao mô hình này:**
- `defs` + `columns` global ⇒ thêm tab/cột là **mọi company thấy ngay** (đúng yêu cầu "đồng bộ").
- `data JSONB` ⇒ thêm/bớt cột không ALTER TABLE, không khóa bảng.
- Không EAV (bảng value riêng) vì JSONB đơn giản hơn, query/filter phía client như tab hiện tại.

### Quy ước `col_key`
- Sinh từ label (slug, bỏ dấu) + đảm bảo unique trong def; hoặc UUID ngắn. **Không cho sửa** sau khi tạo (chỉ sửa label).
- Cột built-in (Pha 3) dùng key cố định: `employee_name`, `end_date`…

## P1.2 Backend — module `company-tables`

Theo cấu trúc chuẩn: `backend/src/modules/company-tables/{service,controller,router,schema}.js`.

### Endpoints

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/company-tables/defs` | auth | List def active + columns (render tabs) |
| GET | `/company-tables/defs/:id` | auth | 1 def + columns |
| POST | `/company-tables/defs` | **admin** | Tạo def |
| PATCH | `/company-tables/defs/:id` | **admin** | Sửa def (name/icon/sort/is_active) |
| DELETE | `/company-tables/defs/:id` | **admin** | Xóa def (cascade columns+rows) |
| POST | `/company-tables/defs/:id/columns` | **admin** | Thêm cột |
| PATCH | `/company-tables/columns/:colId` | **admin** | Sửa cột |
| DELETE | `/company-tables/columns/:colId` | **admin** | Xóa cột |
| PATCH | `/company-tables/defs/:id/columns/reorder` | **admin** | Sắp lại thứ tự cột |
| GET | `/companies/:companyId/tables/:defId/rows` | auth + ownership | Rows của company cho def |
| POST | `/companies/:companyId/tables/:defId/rows` | auth + ownership | Thêm dòng |
| PATCH | `/companies/:companyId/tables/:defId/rows/:rowId` | auth + ownership | Sửa dòng (patch `data`) |
| DELETE | `/companies/:companyId/tables/:defId/rows/:rowId` | auth + ownership | Xóa dòng |
| PATCH | `/companies/:companyId/tables/:defId/rows/reorder` | auth + ownership | Kéo-thả thứ tự |

### RBAC
- **defs/columns:** chỉ admin (router `...admin`).
- **rows:** admin toàn quyền; staff chỉ trên company mình phụ trách. Tái dùng pattern hiện có:
  ```js
  // helper assertCompanyAccess(companyId, user) — giống logic companies.service
  if (user.role === 'staff' && company.assigned_staff_id !== user.id) throw 403
  ```

### Validation (zod, `company-tables.schema.js`)
- `createDefSchema`: `{ tableKey (slug), name, icon?, sortOrder?, description? }`.
- `createColumnSchema`: `{ colKey, label, dataType ∈ enum, required?, options? (array khi select), width? }`.
- `upsertRowSchema`: `{ data: record }` — **validate động theo columns**: với mỗi column `required` phải có giá trị; `number` → coerce số; `date` → regex `YYYY-MM-DD`; `select` → value ∈ options. Cột `computed` **bỏ qua** (không nhận từ client).

### Service — điểm cốt lõi
- `listDefs()` → join defs + columns (active), trả `[{ ...def, columns: [...] }]`, sort theo `sort_order`.
- `listRows(defId, companyId)` → `SELECT * FROM company_table_rows WHERE def_id=$1 AND company_id=$2 ORDER BY position`. Cap an toàn (vd ≤ 1000/company/def) — đủ cho phạm vi 1 công ty.
- `createRow`: lọc `data` chỉ giữ `col_key` hợp lệ (không phải computed), validate, `position = max+1`.
- `updateRow`: merge `data` (chỉ key hợp lệ).
- **Sanitize khi xóa cột:** không cần xóa key trong mọi row ngay (JSONB thừa key vô hại); có thể dọn bằng job nền nếu muốn.

## P1.3 Frontend

### 3 phần
1. **`CustomTableTab.jsx`** (generic) — render 1 tab từ `def` + `companyId`.
2. **CompanyDetail** — fetch `listDefs()` 1 lần, sinh tab động cho mỗi def active.
3. **Admin Builder** — trang trong Settings để CRUD def + columns.

### `CustomTableTab.jsx` — tái dùng tối đa
Component nhận `{ def, company }`:
- State: `rows`, `colFilters`, `sortState`, `filterPopup`, `page`, `colWidths` (localStorage key `ctbl_${def.table_key}_${companyId}`).
- `columns = def.columns` (đã có data_type) → **map thẳng** sang machinery [018](./018_COLUMN_HEADER_FILTER.md):
  ```js
  function getColumnFilterType(colKey) {
    const c = def.columns.find(x => x.col_key === colKey)
    if (c.data_type === 'select')                  return 'enum'
    if (c.data_type === 'date')                    return 'dateRange'
    if (c.data_type === 'number')                  return 'numberRange'
    if (c.data_type === 'computed') return computedFilterType(c)  // Pha 2
    return 'text'
  }
  function getDisplayLabel(row, colKey) { /* đọc row.data[colKey], format theo type */ }
  function getSortKey(row, colKey)     { /* number→Number, date→ISO string, ... */ }
  ```
- **Inline edit:** tái dùng pattern `LcInlineTdCell` (LaborContractsTab) — click ô → input đúng type (text/number/date/select) → PATCH `rows/:id { data: { col_key: value } }`.
- **Filter/sort/pagination client-side:** copy `displayed` useMemo + client pagination như các tab đã làm.
- **Resize cột:** tái dùng `ResizeHandle` + localStorage (đã có ở NsnnDebtsTab).
- **Xuất Excel:** generic — cột = def.columns (+ computed), preview rồi tải (tái dùng `ExcelImportModal`/export pattern).
- **Thêm dòng:** nút "+ Thêm dòng" → tạo row rỗng → inline edit.

> Toàn bộ CSS dùng lại class `hdld*` + token trong [companies.module.css](../frontend/src/pages/Companies/companies.module.css). **Không CSS mới.**

### CompanyDetail — tab động
```jsx
const [customDefs, setCustomDefs] = useState([])
useEffect(() => { companyTablesApi.listDefs().then(setCustomDefs) }, [])
// ...
// Tab list = [tab built-in cố định] + customDefs.filter(d => d.is_active).map(d => ({
//    key: `ct_${d.table_key}`, label: d.name, icon: d.icon, render: <CustomTableTab def={d} company={company} />
// }))
```
- Tab built-in (Thông tin, Công việc, Credentials, Documents, Notes, CDR, **Archive**) giữ nguyên.
- Tab generic chèn vào sau, sắp theo `sort_order`.

### Admin Builder (Settings)
Trang `/settings` thêm mục **"Bảng tùy chỉnh (Company tables)"**:
- Danh sách def (kéo-thả `sort_order`, bật/tắt `is_active`, sửa name/icon).
- Mở 1 def → **Column editor**: bảng cột (label, type, required, options nếu select, width), kéo-thả thứ tự, thêm/xóa cột.
- Cảnh báo khi xóa cột đang có data ("N công ty đang có dữ liệu ở cột này").
- Chọn icon từ tập lucide cho phép (whitelist).

## P1.4 Edge cases Pha 1
| Tình huống | Xử lý |
|---|---|
| Đổi label cột | OK — chỉ đổi `label`, `col_key` giữ nguyên |
| Đổi `data_type` cột đã có data | **Chặn** hoặc cảnh báo mạnh (vd text→number có thể NaN). Khuyến nghị: chỉ cho đổi khi cột chưa có data |
| Xóa cột | Cho xóa def-column; data thừa trong JSONB để lại (vô hại) hoặc dọn nền |
| Xóa def | Cascade rows+columns (xác nhận 2 bước) |
| `required` thêm sau khi đã có row trống | Chỉ enforce khi tạo/sửa row mới; row cũ không bị chặn |
| Cap dữ liệu | ≤ 1000 row/company/def (client-side filter/sort/paginate) |

## P1.5 Wireframe màn hình (UI/UX)

> ASCII mockup — chốt bố cục trước khi code. Ký hiệu: `⏷` nút filter/sort header · `⠿` handle kéo-thả · `●` badge màu · `🔒` không sửa được.

### Flow tổng thể
```
Admin: Settings ▸ Bảng tùy chỉnh ──(tạo Def)──▶ Column editor ──(thêm cột)──▶ [ON]
                                                                                  │
                                                              đồng bộ GLOBAL ▼
Staff/Admin: /companies/:id ─▶ tab mới tự xuất hiện ─▶ nhập liệu (inline) / lọc / xuất
```

### Màn A — Settings ▸ Bảng tùy chỉnh (danh sách Def)
```
┌─ Settings ▸ Bảng tùy chỉnh (Company Tables) ──────────────────────────────────┐
│  Các tab báo cáo tự tạo — áp dụng cho TẤT CẢ công ty        [ + Tạo bảng mới ] │
├──────────────────────────────────────────────────────────────────────────────┤
│ ⠿ │ Tab                  │ Key            │ Số cột │ Hiện  │ Thao tác           │
├───┼──────────────────────┼────────────────┼────────┼───────┼────────────────────┤
│ ⠿ │ 🛡 Theo dõi BHXH      │ bhxh_tracking  │   6    │ [ ON] │ ⚙ Cột   ✎ Sửa   🗑 │
│ ⠿ │ 📄 Theo dõi hóa đơn   │ invoice_track  │   8    │ [ ON] │ ⚙ Cột   ✎ Sửa   🗑 │
│ ⠿ │ 📑 Theo dõi BHYT      │ bhyt_tracking  │   5    │ [OFF] │ ⚙ Cột   ✎ Sửa   🗑 │
└──────────────────────────────────────────────────────────────────────────────┘
   ⠿ kéo-thả đổi sort_order · [ON/OFF] is_active · 🗑 xóa def (xác nhận 2 bước)
```

### Màn B — Tạo / Sửa Def (modal)
```
┌─ Tạo bảng mới ─────────────────────────────────────────[ × ]┐
│ Tên tab *      [ Theo dõi BHXH_______________________ ]      │
│ Key (tự sinh)  [ bhxh_tracking ] 🔒  (không đổi sau khi tạo) │
│ Icon           [ 🛡 ShieldCheck            ▾ ]  (whitelist)  │
│ Mô tả          [ ____________________________________ ]      │
│                                        [ Huỷ ]  [ Tạo bảng ] │
└─────────────────────────────────────────────────────────────┘
```

### Màn C — Column editor (mở 1 Def)
```
┌─ Bảng "Theo dõi BHXH" ▸ Quản lý cột ─────────────────────────────────[ Đóng ]┐
│  Cột áp dụng cho MỌI công ty                                  [ + Thêm cột ]   │
├──────────────────────────────────────────────────────────────────────────────┤
│ ⠿ │ Nhãn          │ Key          │ Kiểu      │ Bắt buộc │ Rộng │ Thao tác       │
├───┼───────────────┼──────────────┼───────────┼──────────┼──────┼────────────────┤
│ ⠿ │ Số sổ BHXH    │ so_so_bhxh   │ Văn bản   │    ✓     │ 140  │ ✎   🗑          │
│ ⠿ │ Loại          │ loai         │ Lựa chọn  │          │ 120  │ ✎   🗑          │
│ ⠿ │ Ngày nộp      │ ngay_nop     │ Ngày      │          │ 120  │ ✎   🗑          │
│ ⠿ │ Số tiền       │ so_tien      │ Số        │          │ 120  │ ✎   🗑          │
│ ⠿ │ Trạng thái    │ trang_thai   │ Lựa chọn  │          │ 120  │ ✎   🗑          │
│ ⠿ │ Ghi chú       │ ghi_chu      │ Văn bản   │          │ 200  │ ✎   🗑          │
└──────────────────────────────────────────────────────────────────────────────┘
   🗑 cột đang có data → cảnh báo: "12 công ty đang có dữ liệu ở cột này"
```

### Màn D — Thêm / Sửa cột (modal, field đổi theo Kiểu)
```
┌─ Thêm cột ─────────────────────────────────────────────[ × ]┐
│ Nhãn hiển thị *   [ Trạng thái________________________ ]     │
│ Key (tự sinh)     [ trang_thai ] 🔒                          │
│ Kiểu dữ liệu *    [ Lựa chọn (select)             ▾ ]        │
│                     Văn bản · Số · Ngày · Lựa chọn · Computed│
│ ┌─ chỉ hiện khi Kiểu = "Lựa chọn" ───────────────────────┐   │
│ │ Giá trị:  [ Đã nộp_________ ] [×]                       │   │
│ │           [ Chưa nộp_______ ] [×]                       │   │
│ │           [ + Thêm giá trị ]                            │   │
│ └────────────────────────────────────────────────────────┘   │
│ ☐ Bắt buộc nhập         Độ rộng (px) [ 120 ]                 │
│                                         [ Huỷ ]  [ Lưu cột ] │
└─────────────────────────────────────────────────────────────┘
```

### Màn E — CompanyDetail: tab bar (tab generic xuất hiện tự động)
```
┌─ /companies/123 — Công ty ABC ───────────────────────────────────────────────┐
│ [Thông tin][Công việc][Yêu cầu KH][Credentials][Documents][Notes]             │
│ [Theo dõi HĐLĐ][HĐ KH.NCC][Nợ NSNN][HS lưu trữ]            ◀ built-in (cố định)│
│ │ 🛡 Theo dõi BHXH │ 📄 Theo dõi hóa đơn │             ◀ generic (từ defs)      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Màn F — CustomTableTab (tab generic render)
```
┌─ Tab "Theo dõi BHXH" ─────────────────────────────────────────────────────────┐
│  🛡 Theo dõi BHXH    24 dòng · 2 lọc cột · đang sắp xếp   [⤓ Xuất Excel][+ Thêm dòng]│
├──────────────────────────────────────────────────────────────────────────────┤
│ STT│ Số sổ BHXH ⏷│ Loại ⏷   │ Ngày nộp ⏷│ Số tiền ⏷│ Trạng thái ⏷│ Ghi chú ⏷│ ⋯ │
├────┼─────────────┼──────────┼───────────┼──────────┼─────────────┼──────────┼───┤
│ 1  │ SO-0012     │ Tăng mới │ 01/06/2026│ 1.200.000│ ● Đã nộp    │ ...      │🗑 │
│ 2  │ SO-0013     │ [Giảm▾ ] │ 03/06/2026│   850.000│ ● Chưa nộp  │          │🗑 │
│    │             │  ↑ inline edit đang mở (select)                            │   │
│ 3  │ SO-0014     │ Giảm     │ 05/06/2026│ 2.000.000│ ● Đã nộp    │ KPS      │🗑 │
├──────────────────────────────────────────────────────────────────────────────┤
│  ‹ Trước   1 2 [3] 4 … 7   Tiếp ›       20/trang ▾       Hiển thị 41–60 / 137  │
└──────────────────────────────────────────────────────────────────────────────┘
   ⏷ filter/sort header (docs/018) · click ô = inline edit · 🗑 xóa dòng · ⋯ cột hành động
```

### Màn G — Dropdown filter trên header (theo data_type, docs/018)
```
 "Trạng thái" (select→enum)        "Ngày nộp" (date→dateRange)    "Số tiền" (number→numberRange)
 ┌─────────────────────────┐       ┌─────────────────────────┐    ┌─────────────────────────┐
 │ ↑ Sắp xếp A → Z         │       │ ↑ Sắp xếp A → Z         │    │ ↑ Sắp xếp A → Z         │
 │ ↓ Sắp xếp Z → A         │       │ ↓ Sắp xếp Z → A         │    │ ↓ Sắp xếp Z → A         │
 ├─────────────────────────┤       ├─────────────────────────┤    ├─────────────────────────┤
 │ ☑ Chọn tất cả (3)       │       │ TỪ NGÀY [ 2026-06-01 ]  │    │ TỐI THIỂU [ 500000   ]  │
 │ ☑ Đã nộp                │       │ ĐẾN NGÀY [ 2026-06-30 ] │    │ TỐI ĐA    [ ________ ]  │
 │ ☑ Chưa nộp              │       ├─────────────────────────┤    ├─────────────────────────┤
 │ ☐ (Trống)               │       │             Xoá bộ lọc  │    │             Xoá bộ lọc  │
 ├─────────────────────────┤       └─────────────────────────┘    └─────────────────────────┘
 │             Xoá bộ lọc  │       (cột "Văn bản" → ô search text 1 dòng)
 └─────────────────────────┘
```

### Màn H — Trạng thái rỗng
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              ▢  (icon)                                        │
│                   Chưa có dữ liệu trong bảng này                              │
│                   Nhấn "+ Thêm dòng" để bắt đầu nhập                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

# PHA 2 — Computed Columns & Conditional Formatting

> Mục tiêu: generic làm được "Số ngày còn lại", "Tình trạng (xanh/vàng/đỏ)", "Số ngày chậm" như HĐLĐ/CSC/NSNN — **không cần formula language**, chỉ vài kiểu dựng sẵn.

## P2.1 Kiểu computed (đủ phủ 4 tab)

`company_table_columns.computed_type` + `computed_config (JSONB)`:

| computed_type | config | Công thức | Dùng cho |
|---|---|---|---|
| `days_until` | `{ source_col }` | `data[source_col] − today` (ngày) | "Số ngày còn lại" (HĐLĐ/CSC) |
| `days_since` | `{ source_col }` | `today − data[source_col]` | "Số ngày chậm" (NSNN) |
| `status_threshold` | `{ source_col, mode, buckets:[{ max, label, tone }] }` | map số/ngày → nhãn + màu | "Tình trạng" (xanh/vàng/đỏ) |

**Ví dụ `status_threshold` cho HĐLĐ:**
```json
{
  "source_col": "end_date",
  "mode": "days_until",
  "buckets": [
    { "max": 0,    "label": "Đã hết hạn",   "tone": "danger" },
    { "max": 30,   "label": "Sắp hết hạn",  "tone": "warning" },
    { "max": null, "label": "Còn hiệu lực", "tone": "success" }
  ],
  "null_label": "Không xác định", "null_tone": "muted"
}
```
`tone ∈ {success, warning, danger, info, muted}` → ánh xạ sang class/token màu sẵn có.

## P2.2 Engine (client-side)
- Tính computed khi render & khi filter/sort — **không lưu DB** (giống số ngày còn lại hiện tại).
  ```js
  function computeValue(col, row) {
    const src = row.data[col.computed_config.source_col]
    switch (col.computed_type) {
      case 'days_until': return src ? daysBetween(today, src) : null
      case 'days_since': return src ? daysBetween(src, today) : null
      case 'status_threshold': return resolveBucket(col.computed_config, src) // {label, tone}
    }
  }
  ```
- **Filter type của computed:** `days_*` → `numberRange`; `status_threshold` → `enum` (giá trị = các label bucket). Khớp luôn machinery [018](./018_COLUMN_HEADER_FILTER.md).
- **Sort:** `days_*` theo số; `status_threshold` theo thứ tự bucket.
- **Màu:** cell computed render badge với class theo `tone` (tái dùng token `--color-success/-warning/-danger…`).

## P2.3 Admin Builder Pha 2
Khi thêm cột type `computed`:
- Chọn `computed_type`, chọn `source_col` (dropdown từ các cột date/number của def), cấu hình buckets (label + ngưỡng + màu) cho `status_threshold`.
- Validate: `source_col` phải tồn tại & đúng kiểu.

### Wireframe — Thêm cột Computed (status_threshold)
```
┌─ Thêm cột — Kiểu = Computed ──────────────────────────[ × ]┐
│ Nhãn          [ Tình trạng__________________ ]             │
│ Loại computed [ Tô màu theo ngưỡng (status_threshold) ▾ ]  │
│                 Số ngày còn lại (days_until)               │
│                 Số ngày chậm (days_since)                  │
│                 Tô màu theo ngưỡng (status_threshold)      │
│ Cột nguồn *   [ Ngày kết thúc (end_date) ▾ ]  (date/number)│
│ ┌─ Ngưỡng (bucket) — xét từ trên xuống ─────────────────┐  │
│ │ ≤ [  0 ] →  [ Đã hết hạn   ]  ● Đỏ   (danger)   [×]   │  │
│ │ ≤ [ 30 ] →  [ Sắp hết hạn  ]  ● Vàng (warning)  [×]   │  │
│ │ còn lại →   [ Còn hiệu lực ]  ● Xanh (success)       │  │
│ │ NULL →      [ Không xác định] ● Xám  (muted)         │  │
│ │ [ + Thêm ngưỡng ]                                    │  │
│ └──────────────────────────────────────────────────────┘  │
│ Preview:  end_date=01/06/2026 → "● Sắp hết hạn"           │
│                                       [ Huỷ ]  [ Lưu cột ] │
└────────────────────────────────────────────────────────────┘
```
- Cột `days_until`/`days_since` không cần bucket → chỉ chọn `source_col`, hiển thị số.
- Badge ở bảng (Màn F) lấy `tone` → class màu token sẵn có (`--color-danger/-warning/-success/-muted`).

## P2.4 Edge cases Pha 2
- `source_col` bị xóa → cột computed báo "cấu hình lỗi", không crash (trả null).
- Computed **không** nhận giá trị từ client (server bỏ qua nếu có).
- Export Excel: xuất giá trị computed đã tính (số / nhãn), không xuất công thức.

---

# PHA 3 — Migrate Tab Bespoke & Hybrid Per-Company Columns

> Gỡ trùng lặp: chuyển HĐLĐ / HĐ KH.NCC / Nợ NSNN sang generic. **Archive (12 ô tháng) giữ bespoke** vì cấu trúc khác.

## P3.1 Hybrid: cột global + cột riêng company
4 tab cũ cho phép company thêm cột riêng (`company_csc_columns`, `company_nsnn_columns`, `custom_fields`). Để giữ tính năng này:
- `company_table_defs.allow_company_columns = TRUE` cho các def migrate.
- Thêm bảng **`company_table_company_columns`** (def_id, company_id, col_key, label, data_type, sort_order, width) — cột **riêng** của 1 company, nối tiếp sau cột global.
- Frontend gộp `columns = [...globalColumns, ...companyColumns]` khi render. `data JSONB` chứa cả 2 nhóm key.

## P3.2 Ánh xạ tab → def

**HĐLĐ → def `labor_contracts`** (built-in columns):
| col_key | label | data_type | computed |
|---|---|---|---|
| employee_name | Tên nhân viên | text (required) | |
| contract_type | Loại HĐ | text | |
| contract_number | Số HĐ | text | |
| contract_date | Ngày HĐ | date | |
| end_date | Ngày kết thúc | date | |
| days_remaining | Ngày còn lại | computed | `days_until(end_date)` |
| status | Tình trạng | computed | `status_threshold(end_date)` |
| notes | Ghi chú | text | |

CSC, NSNN ánh xạ tương tự (số ngày chậm = `days_since(update_date)`…).

## P3.3 Migration dữ liệu (idempotent)
Mỗi tab 1 migration `0xx_migrate_<tab>_to_generic.sql`:
1. INSERT def + columns built-in (nếu chưa có) với `table_key` cố định.
2. INSERT rows từ bảng cũ, build `data` bằng `jsonb_build_object`:
   ```sql
   INSERT INTO company_table_rows (def_id, company_id, data, position, created_by, created_at)
   SELECT :def_id, lc.company_id,
          jsonb_strip_nulls(jsonb_build_object(
            'employee_name', lc.employee_name,
            'contract_type', lc.contract_type,
            'end_date',      lc.end_date,
            'notes',         lc.notes
          )) || COALESCE(lc.custom_fields_as_jsonb, '{}'::jsonb),
          ROW_NUMBER() OVER (PARTITION BY lc.company_id ORDER BY lc.created_at),
          lc.created_by, lc.created_at
   FROM company_labor_contracts lc;
   ```
3. `custom_fields` (HĐLĐ dạng `[{name,value,type}]`) → chuyển thành key trong `data` + tạo bản ghi `company_table_company_columns` tương ứng (per-company).
4. **Giữ nguyên bảng cũ** (không drop) tới khi verify xong.

## P3.4 Chiến lược cắt chuyển (an toàn)
1. **Feature flag** `system_configs.use_generic_company_tables` (per-tab hoặc global).
2. **Parallel run:** chạy migration copy data; bật flag → CompanyDetail render `CustomTableTab` thay component cũ cho tab đó; component cũ vẫn còn trong code.
3. **Verify:** so khớp số dòng + vài bản ghi mẫu (script đối chiếu cũ vs generic).
4. **Cutover:** khi ổn → ẩn component cũ; sau 1–2 kỳ → drop bảng cũ + xóa code (migration `down` đảo ngược).
5. **Archive** không migrate.

## P3.5 Rủi ro & giảm thiểu (Pha 3)
| Rủi ro | Giảm thiểu |
|---|---|
| Sai lệch data khi copy | Migration idempotent + script đối chiếu count/sample; giữ bảng cũ |
| Computed không khớp bespoke | Verify song song trên data thật trước cutover |
| Mất cột per-company | Hybrid `company_table_company_columns` |
| Regression filter/resize/export | Đã tái dùng chung machinery; test theo checklist [018](./018_COLUMN_HEADER_FILTER.md) |
| Performance | Cap 1000 row/company/def; index `(def_id, company_id, position)` |

---

## 4. Bảng so sánh trước/sau

| Tiêu chí | Hiện tại (bespoke) | Sau (generic) |
|---|---|---|
| Thêm báo cáo mới | Code full-stack ~1–2 ngày | Admin tạo trong vài phút, 0 code |
| Đồng bộ toàn company | Không (cột per-company) | Có (def/columns global) |
| Computed/màu | Có sẵn từng tab | Có qua engine Pha 2 |
| Trùng lặp code | ~1000 dòng/tab × 4 | 1 component + 1 module |
| Polish case đặc biệt | Cao | Trung bình (chấp nhận đánh đổi) |
| Cấu trúc bất thường (Archive) | — | Giữ bespoke |

---

## 5. Checklist triển khai

### Pha 1
- [ ] Migration `073_company_tables.sql` (+ down) — 3 bảng.
- [ ] Backend module `company-tables` (service/controller/router/schema) + RBAC ownership.
- [ ] Validation động theo columns (required/number/date/select).
- [ ] `CustomTableTab.jsx` generic: inline edit, filter [018], sort, resize, pagination, export.
- [ ] CompanyDetail: fetch `listDefs`, render tab động theo `sort_order`/`is_active`.
- [ ] Admin Builder trong Settings: CRUD def + columns, reorder, icon whitelist, cảnh báo xóa cột.
- [ ] Seed 1 def demo để QA.

### Pha 2
- [ ] Cột `computed_type`/`computed_config` (đã có trong schema Pha 1).
- [ ] Engine `computeValue` + map filter/sort (days→number, status→enum).
- [ ] Tô màu theo `tone` (token sẵn có).
- [ ] Admin Builder: UI cấu hình computed (source_col, buckets).
- [ ] Export tính computed.

### Pha 3
- [ ] Bảng `company_table_company_columns` + `allow_company_columns`.
- [ ] Frontend gộp global + company columns.
- [ ] Migration copy data từng tab (HĐLĐ/CSC/NSNN) — idempotent, giữ bảng cũ.
- [ ] Feature flag + parallel run + script đối chiếu.
- [ ] Cutover từng tab; drop bảng + code cũ sau khi ổn.
- [ ] Archive giữ nguyên.

---

## 6. File tham chiếu (khi implement)
| File | Vai trò |
|---|---|
| `backend/migrations/073_company_tables.sql` | Schema 3 bảng |
| `backend/src/modules/company-tables/*` | CRUD generic |
| `frontend/src/pages/Companies/CustomTableTab.jsx` | Component generic (mới) |
| `frontend/src/pages/Companies/LaborContractsTab.jsx` | Mẫu inline-edit + resize + filter để tái dùng |
| `frontend/src/pages/Companies/companies.module.css` | Class `hdld*` dùng lại |
| `frontend/src/pages/Settings/*` | Admin Builder |
| [018_COLUMN_HEADER_FILTER.md](./018_COLUMN_HEADER_FILTER.md) | Cơ chế filter type-driven |
| [014_CSS_STYLE_GUIDE.md](./014_CSS_STYLE_GUIDE.md) | Token & quy tắc CSS |
