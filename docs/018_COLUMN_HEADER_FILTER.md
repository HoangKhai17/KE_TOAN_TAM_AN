# 018 - Column Header Filter (Bộ Lọc Trên Header Cột)

## Mục tiêu

Tài liệu này mô tả cơ chế bộ lọc kiểu Excel gắn trực tiếp vào header của từng cột trong bảng dữ liệu. Áp dụng khi bảng có nhiều cột và người dùng cần lọc/sắp xếp linh hoạt mà không cần thanh filter riêng bên trên.

---

## Khi nào nên dùng

- Bảng có từ **5 cột trở lên** với dữ liệu đa dạng (text, số, ngày, trạng thái).
- Người dùng cần lọc **đồng thời nhiều cột** (ví dụ: lọc theo loại hợp đồng VÀ tình trạng).
- Bảng có cột động (custom columns) mà số lượng cột không cố định.
- Thay thế cho thanh `<select>` filter bên trên — tránh trùng lặp UI.

## Khi nào không nên dùng

- Bảng đơn giản ≤ 4 cột, một chiều filter — dùng `<select>` hoặc tab filter bên trên cho gọn.
- Bảng chỉ hiển thị (read-only) không cần thao tác sắp xếp.

---

## Kiến trúc tổng quan

```
FilterTh (trigger trong <th>)
    ↓ click → openFilter()
ColumnFilterDropdown (position: fixed)
    ├── Sort section (A→Z / Z→A) — luôn có
    └── Filter section — khác nhau theo filterType:
            enum        → EnumFilterSection   (checkbox list)
            text        → TextFilterSection   (search box)
            dateRange   → DateRangeFilterSection (từ/đến ngày)
            numberRange → NumberRangeFilterSection (min/max)
```

---

## State cần thiết trong component cha

```js
// Bộ lọc theo từng cột — value có thể là nhiều kiểu tùy filterType
const [colFilters, setColFilters] = useState({})
/*
  colFilters[colKey] có thể là:
    Set<string>                      — filterType: 'enum'
    string                           — filterType: 'text'
    { from: string, to: string }     — filterType: 'dateRange'  (YYYY-MM-DD)
    { min: string, max: string }     — filterType: 'numberRange'
    undefined / null                 — không có filter
*/

// Sắp xếp — chỉ 1 cột tại 1 thời điểm
const [sortState, setSortState]   = useState({ col: null, dir: 'asc' })

// Vị trí dropdown đang mở — null nếu không mở
const [filterPopup, setFilterPopup] = useState(null)
// filterPopup: { colKey: string, top: number, left: number }
```

### colKey — định danh cột

| Loại cột | colKey |
|---|---|
| Trường cố định | tên field camelCase, ví dụ `employeeName`, `contractStatus` |
| Cột động / custom | tiền tố `dyn__` + tên cột, ví dụ `dyn__MucLuong` |

**Quy tắc**: `colKey` phải là string stable — không thay đổi giữa các render.

---

## Ba hàm helper bắt buộc (module-level)

Phải định nghĩa ở **cấp module** (ngoài component) để tránh re-create mỗi render.

### `getColumnFilterType(colKey, dynColumns)`

Xác định kiểu filter cho từng cột. **Đây là hàm quan trọng nhất** — cần khai báo đúng để toàn bộ cơ chế hoạt động nhất quán.

```js
function getColumnFilterType(colKey, dynColumns = []) {
  // Enum — trường có tập giá trị cố định, ít giá trị
  if (colKey === 'contractStatus') return 'enum'

  // Date range — so sánh ISO string YYYY-MM-DD
  if (colKey === 'contractDate' || colKey === 'endDate') return 'dateRange'

  // Number range — so sánh số
  if (colKey === 'daysRemaining') return 'numberRange'

  // Cột động — dựa vào colType được lưu trong DB
  if (colKey.startsWith('dyn__')) {
    const col = dynColumns.find((c) => c.colName === colKey.slice(5))
    if (col?.colType === 'date')   return 'dateRange'
    if (col?.colType === 'number') return 'numberRange'
    // colType === 'text' hoặc không xác định → text search
  }

  // Mặc định: text search (employeeName, taxCode, contractType, notes, ...)
  return 'text'
}
```

**Khi mở rộng sang module khác**: chỉ cần điều chỉnh hàm này theo tên field của module đó. Phần còn lại (filter logic, UI) tự động hoạt động đúng.

### `getDisplayLabel(row, colKey)`

Trả về string hiển thị trong checkbox của `EnumFilterSection`. Cũng dùng để so sánh khi lọc enum.

```js
function getDisplayLabel(row, colKey) {
  if (colKey.startsWith('dyn__')) {
    const v = row.customFields[colKey.slice(5)]
    return v != null && v !== '' ? String(v) : '(Trống)'
  }
  switch (colKey) {
    case 'contractStatus':  return STATUS_LABEL[row.contractStatus] ?? row.contractStatus
    case 'contractDate':    return row.contractDate ? fmtDate(row.contractDate) : '(Trống)'
    case 'endDate':         return row.endDate      ? fmtDate(row.endDate)      : '(Trống)'
    case 'daysRemaining':   return row.daysRemaining !== null ? String(row.daysRemaining) : '(Không xác định)'
    default: {
      const v = row[colKey]
      return v != null && v !== '' ? String(v) : '(Trống)'
    }
  }
}
```

**Lưu ý**: phải xử lý `null`/`undefined` thành chuỗi — không để trả về `null` vì `Set.has(null)` không match.

### `getSortKey(row, colKey)`

Trả về giá trị dùng để so sánh khi sắp xếp (kiểu dữ liệu gốc, không phải display string).

```js
function getSortKey(row, colKey) {
  if (colKey.startsWith('dyn__')) return (row.customFields[colKey.slice(5)] ?? '').toLowerCase()
  if (colKey === 'contractDate' || colKey === 'endDate') return row[colKey] ?? ''
  // ISO date string (YYYY-MM-DD) sort lexicographically đúng thứ tự
  if (colKey === 'daysRemaining') return row.daysRemaining ?? Number.MAX_SAFE_INTEGER
  // null → cuối danh sách khi sort tăng dần
  if (colKey === 'contractStatus') return STATUS_LABEL[row.contractStatus] ?? ''
  const v = row[colKey]
  return v != null ? String(v).toLowerCase() : ''
}
```

---

## Logic lọc và sắp xếp — `useMemo`

Xử lý 4 kiểu filter khác nhau trong cùng một vòng lặp. Lọc nhiều cột là **AND** (thu hẹp dần).

```js
const displayed = useMemo(() => {
  let result = [...contracts]

  for (const [colKey, filterVal] of Object.entries(colFilters)) {
    const filterType = getColumnFilterType(colKey, columns)

    if (filterType === 'enum') {
      // filterVal: Set<string>
      if (filterVal instanceof Set && filterVal.size > 0) {
        result = result.filter((row) => filterVal.has(getDisplayLabel(row, colKey)))
      }
    } else if (filterType === 'text') {
      // filterVal: string
      if (typeof filterVal === 'string' && filterVal.trim()) {
        const q = filterVal.toLowerCase()
        result = result.filter((row) => getDisplayLabel(row, colKey).toLowerCase().includes(q))
      }
    } else if (filterType === 'dateRange') {
      // filterVal: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
      if (filterVal && (filterVal.from || filterVal.to)) {
        result = result.filter((row) => {
          const raw = colKey.startsWith('dyn__')
            ? row.customFields[colKey.slice(5)]
            : row[colKey]
          if (!raw) return false // row không có ngày → loại ra khi có range
          const d = String(raw).substring(0, 10)
          if (filterVal.from && d < filterVal.from) return false
          if (filterVal.to   && d > filterVal.to)   return false
          return true
        })
      }
    } else if (filterType === 'numberRange') {
      // filterVal: { min: string, max: string }
      if (filterVal && (filterVal.min !== '' || filterVal.max !== '')) {
        result = result.filter((row) => {
          const num = colKey === 'daysRemaining'
            ? row.daysRemaining
            : parseFloat(colKey.startsWith('dyn__')
                ? row.customFields[colKey.slice(5)]
                : row[colKey])
          if (num === null || num === undefined || isNaN(num)) return false
          if (filterVal.min !== '' && num < parseFloat(filterVal.min)) return false
          if (filterVal.max !== '' && num > parseFloat(filterVal.max)) return false
          return true
        })
      }
    }
  }

  if (sortState.col) {
    result.sort((a, b) => {
      const ak = getSortKey(a, sortState.col)
      const bk = getSortKey(b, sortState.col)
      if (typeof ak === 'number' && typeof bk === 'number') {
        return sortState.dir === 'asc' ? ak - bk : bk - ak
      }
      const cmp = String(ak).localeCompare(String(bk), 'vi', { numeric: true })
      return sortState.dir === 'asc' ? cmp : -cmp
    })
  }

  return result
}, [contracts, columns, colFilters, sortState])
// Lưu ý: columns (dynColumns) phải nằm trong dependency array
```

---

## `hasFilter` — kiểm tra filter đang active

Cần xử lý đúng từng kiểu vì cấu trúc `filterVal` khác nhau.

```js
function hasFilter(colKey) {
  const f = colFilters[colKey]
  if (f == null) return false
  const t = getColumnFilterType(colKey, columns)
  if (t === 'enum')        return f instanceof Set && f.size > 0
  if (t === 'text')        return typeof f === 'string' && f.trim().length > 0
  if (t === 'dateRange')   return Boolean(f.from || f.to)
  if (t === 'numberRange') return f.min !== '' || f.max !== ''
  return false
}
```

---

## Component `ColumnFilterDropdown`

### Cấu trúc

Dropdown nhận thêm `dynColumns` prop để `getColumnFilterType` hoạt động đúng với cột custom:

```jsx
{filterPopup && (
  <ColumnFilterDropdown
    colKey={filterPopup.colKey}
    dynColumns={columns}          // ← bắt buộc cho cột dynamic
    allRows={contracts}           // ← luôn là danh sách gốc, không phải displayed
    currentFilter={colFilters[filterPopup.colKey] ?? null}
    sortState={sortState}
    onSort={handleSort}
    onFilterChange={handleFilterChange}
    onClose={() => setFilterPopup(null)}
    style={{
      '--hdld-dd-top':  `${filterPopup.top}px`,
      '--hdld-dd-left': `${filterPopup.left}px`,
    }}
  />
)}
```

Bên trong `ColumnFilterDropdown`, render đúng sub-section theo `filterType`:

```jsx
function ColumnFilterDropdown({ colKey, dynColumns, allRows, currentFilter, ... }) {
  const filterType = getColumnFilterType(colKey, dynColumns)
  // ...
  return (
    <div ref={dropRef} className={s.hdldFilterDropdown} style={style}>
      {/* Sort section — luôn hiển thị */}
      <SortSection ... />

      {/* Filter section — theo filterType */}
      {filterType === 'enum'        && <EnumFilterSection        ... />}
      {filterType === 'text'        && <TextFilterSection        ... />}
      {filterType === 'dateRange'   && <DateRangeFilterSection   ... />}
      {filterType === 'numberRange' && <NumberRangeFilterSection ... />}
    </div>
  )
}
```

### Bốn sub-section components

| Component | Props chính | Behavior |
|---|---|---|
| `EnumFilterSection` | `allRows`, `currentFilter` (Set) | Checkbox list, "Chọn tất cả" với indeterminate |
| `TextFilterSection` | `currentFilter` (string) | Input text, live filter, auto-focus khi mở |
| `DateRangeFilterSection` | `currentFilter` ({from, to}) | 2 date input, có thể set chỉ 1 trong 2 |
| `NumberRangeFilterSection` | `currentFilter` ({min, max}) | 2 number input, có thể set chỉ 1 trong 2 |

**Nguyên tắc chung cho text/date/number sub-sections:**
- Dùng local state (`useState`) để giữ giá trị input — không re-render parent mỗi keystroke thay vào đó gọi `onFilterChange` trực tiếp trong `onChange`.
- Nút "Xoá bộ lọc" chỉ hiện khi có giá trị — tự reset cả local state và parent filter.
- Không dùng `useEffect` để sync với parent (tránh double-call trên mount).

### Định vị bằng `position: fixed` + CSS custom property

```css
.hdldFilterDropdown {
  position: fixed;
  top:  var(--hdld-dd-top);
  left: var(--hdld-dd-left);
  z-index: 1000;
}
```

Tọa độ lấy từ `getBoundingClientRect()` của nút trigger:

```js
function openFilter(colKey, e) {
  e.stopPropagation()
  if (filterPopup?.colKey === colKey) {
    setFilterPopup(null)
  } else {
    const rect = e.currentTarget.getBoundingClientRect()
    setFilterPopup({ colKey, top: rect.bottom + 4, left: rect.left })
  }
}
```

**Tại sao `position: fixed`**: bảng có `overflow: hidden` hoặc `overflow-x: auto` sẽ clip dropdown nếu dùng `absolute`. `fixed` thoát khỏi mọi stacking context.

### Đóng khi click ngoài

```js
useEffect(() => {
  function handler(e) {
    if (dropRef.current && !dropRef.current.contains(e.target)) {
      if (!e.target.closest('[data-hdld-filter-btn]')) onClose()
    }
  }
  document.addEventListener('mousedown', handler)
  return () => document.removeEventListener('mousedown', handler)
}, [onClose])
```

**Bắt buộc** thêm `data-hdld-filter-btn` vào nút trigger trong `<th>`. Nếu thiếu, click sang cột khác sẽ: đóng dropdown hiện tại → `openFilter` mở dropdown mới — nhưng `mousedown` chạy trước `click` nên dropdown mới bị đóng ngay.

---

## Nút trigger trong `<th>` — `FilterTh`

```jsx
function FilterTh({ colKey, className, children }) {
  const active = hasFilter(colKey) || hasSort(colKey)
  return (
    <th className={className}>
      <div className={s.hdldThInner}>
        <span className={s.hdldThLabel}>{children}</span>
        <button
          data-hdld-filter-btn
          className={`${s.hdldFilterBtn} ${active ? s.hdldFilterBtnActive : ''}`}
          onClick={(e) => openFilter(colKey, e)}
          title="Lọc / Sắp xếp"
        >
          <Filter size={10} />
        </button>
      </div>
    </th>
  )
}
```

**`active` = có filter đang áp dụng HOẶC đang sắp xếp theo cột này** — đổi màu nút để người dùng nhận biết.

---

## CSS classes cần khai báo

Tất cả class đặt trong CSS module của trang, có namespace prefix (ví dụ `hdld*`):

### Classes cơ bản (sort + enum)

| Class | Mục đích |
|---|---|
| `*ThInner` | `display: flex; align-items: center; gap` — bọc label + nút filter |
| `*ThLabel` | `flex: 1` — label chiếm phần còn lại |
| `*FilterBtn` | Nút trigger: transparent bg, màu = `color` của `.table th` |
| `*FilterBtnActive` | Trạng thái active: `background: var(--color-accent); color: #fff` |
| `*FilterDropdown` | `position: fixed; top: var(--dd-top); left: var(--dd-left); z-index: 1000` |
| `*DdSortSection` | 2 nút sort, `border-bottom` ngăn cách với phần filter |
| `*DdSortBtn` / `*DdSortBtnActive` | Nút sort: full-width, hover highlight |
| `*DdSelectAll` | Hàng "Chọn tất cả" với checkbox (enum only) |
| `*DdValueList` | `max-height: 200px; overflow-y: auto` (enum only) |
| `*DdValueItem` | Mỗi checkbox + label (enum only) |
| `*DdFooter` | Footer nút "Xoá bộ lọc" |
| `*DdClearBtn` | Nút xóa: màu danger, no background |

### Classes bổ sung cho text / date / number

| Class | Mục đích |
|---|---|
| `*DdFilterSection` | Padding wrapper cho filter section (text/date/number) |
| `*DdInput` | Input dùng chung: `height: 30px`, border, focus ring — dùng cho text search, date, number |
| `*DdRangeGroup` | `flex-direction: column; gap` — bọc 2 range inputs |
| `*DdRangeRow` | `flex-direction: column; gap` — bọc label + input cho từng range |
| `*DdRangeLabel` | Label nhỏ trên input: `font-size: fs-2xs; text-transform: uppercase` |

**Quy tắc CSS**:
- Màu `*FilterBtn` phải cùng màu với `color` của `.table th` (thường là `#1e3a8a`).
- Dropdown nên có `min-width: 240px; max-width: 310px` — đủ rộng cho date range 2 input.
- `*DdInput` dùng `box-sizing: border-box` và `width: 100%` để fill đúng trong padding container.

---

## Toolbar — thông tin trạng thái filter

```jsx
{!loading && (
  <span className={s.hdldToolbarCount}>
    {displayed.length}
    {displayed.length < contracts.length && `/${contracts.length}`} bản ghi
    {activeFilterCount > 0 && ` · ${activeFilterCount} bộ lọc`}
    {hasSortActive && ' · đang sắp xếp'}
  </span>
)}

{(activeFilterCount > 0 || hasSortActive) && (
  <button
    className={s.btnOutline}
    onClick={() => { setColFilters({}); setSortState({ col: null, dir: 'asc' }) }}
  >
    Xoá tất cả bộ lọc
  </button>
)}
```

`activeFilterCount` phải dùng hàm `hasFilter` (không phải `Object.keys(colFilters).length`) để tránh đếm nhầm filter rỗng:

```js
const activeFilterCount = Object.keys(colFilters).filter(hasFilter).length
```

---

## Checklist triển khai

- [ ] Định nghĩa `getColumnFilterType`, `getDisplayLabel`, `getSortKey` ở **module level**.
- [ ] `getColumnFilterType` mapping đúng từng field của module — đây là nơi duy nhất cần customize.
- [ ] `colKey` cho cột động phải dùng tiền tố nhất quán (ví dụ `dyn__`).
- [ ] `displayed` dùng `useMemo`, dependencies: `[contracts, columns, colFilters, sortState]` — có `columns` để detect đúng type của cột dynamic.
- [ ] Unique values trong `EnumFilterSection` lấy từ `allRows` (prop gốc), không phải từ `displayed`.
- [ ] Dropdown render **ngoài** `tableWrap`/`tableScroll`.
- [ ] Nút trigger trong `<th>` có `data-hdld-filter-btn` attribute.
- [ ] Close-on-outside dùng `mousedown`, bỏ qua click vào `[data-hdld-filter-btn]`.
- [ ] `ColumnFilterDropdown` nhận `dynColumns` prop để `getColumnFilterType` hoạt động đúng với cột custom.
- [ ] `hasFilter` xử lý đúng 4 kiểu (enum/text/dateRange/numberRange) — không dùng `f.size > 0` cho mọi kiểu.
- [ ] Text/date/number sub-sections dùng local state, không dùng `useEffect` để sync.
- [ ] CSS `position: fixed`, `min-width: 240px` cho dropdown.
- [ ] Màu `*FilterBtn` = màu text `.table th`.

---

## File tham chiếu

| File | Vai trò |
|---|---|
| `frontend/src/pages/Companies/LaborContractsTab.jsx` | Triển khai mẫu đầy đủ |
| `frontend/src/pages/Companies/companies.module.css` | CSS classes mẫu (prefix `hdld`) |
| `docs/014_CSS_STYLE_GUIDE.md` | Quy tắc CSS chung, token design |
