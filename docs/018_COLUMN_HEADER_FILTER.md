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

## Kiến trúc

### State cần thiết trong component cha

```js
// Bộ lọc theo từng cột — key là colKey, value là Set<string> hoặc undefined
const [colFilters, setColFilters] = useState({})

// Sắp xếp — chỉ 1 cột tại 1 thời điểm
const [sortState, setSortState]   = useState({ col: null, dir: 'asc' })

// Vị trí dropdown đang mở — null nếu không mở
const [filterPopup, setFilterPopup] = useState(null)
// filterPopup có dạng: { colKey: string, top: number, left: number }
```

### colKey — định danh cột

Mỗi cột cần một `colKey` duy nhất trong bảng:

| Loại cột | colKey |
|---|---|
| Trường cố định (field trong row) | tên field camelCase, ví dụ `employeeName`, `contractStatus` |
| Cột động / custom | tiền tố `dyn__` + tên cột, ví dụ `dyn__MucLuong` |

**Quy tắc**: `colKey` phải là string stable — không thay đổi giữa các render.

---

## Hai hàm helper bắt buộc (module-level)

Phải định nghĩa ở **cấp module** (ngoài component) để tránh re-create mỗi render và có thể dùng trong cả `useMemo`.

### `getDisplayLabel(row, colKey)`

Trả về string hiển thị trong danh sách checkbox của dropdown. Đây cũng là giá trị dùng để **so sánh khi lọc**.

```js
function getDisplayLabel(row, colKey) {
  if (colKey.startsWith('dyn__')) {
    const v = row.customFields[colKey.slice(5)]
    return v != null && v !== '' ? String(v) : '(Trống)'
  }
  switch (colKey) {
    case 'contractStatus':
      return STATUS_LABEL[row.contractStatus] ?? row.contractStatus
    case 'contractDate':
      return row.contractDate ? fmtDate(row.contractDate) : '(Trống)'
    case 'endDate':
      return row.endDate ? fmtDate(row.endDate) : '(Trống)'
    case 'daysRemaining':
      return row.daysRemaining !== null ? String(row.daysRemaining) : '(Không xác định)'
    default: {
      const v = row[colKey]
      return v != null && v !== '' ? String(v) : '(Trống)'
    }
  }
}
```

**Lưu ý quan trọng**: `getDisplayLabel` phải xử lý `null`/`undefined` thành chuỗi `'(Trống)'` — không để trả về `null` vì Set.has(null) sẽ không match.

### `getSortKey(row, colKey)`

Trả về giá trị dùng để **so sánh khi sắp xếp**. Khác với `getDisplayLabel` — cần trả về kiểu dữ liệu gốc để sort đúng thứ tự.

```js
function getSortKey(row, colKey) {
  if (colKey.startsWith('dyn__')) return (row.customFields[colKey.slice(5)] ?? '').toLowerCase()
  if (colKey === 'contractDate' || colKey === 'endDate') return row[colKey] ?? ''
  // ISO date string (YYYY-MM-DD) sort lexicographically đúng thứ tự
  if (colKey === 'daysRemaining') return row.daysRemaining ?? Number.MAX_SAFE_INTEGER
  // Null → cuối danh sách khi sort tăng dần
  if (colKey === 'contractStatus') return STATUS_LABEL[row.contractStatus] ?? ''
  const v = row[colKey]
  return v != null ? String(v).toLowerCase() : ''
}
```

---

## Logic lọc và sắp xếp — `useMemo`

```js
const displayed = useMemo(() => {
  let result = [...contracts]

  // 1. Áp dụng tất cả bộ lọc cột (AND giữa các cột)
  for (const [colKey, selected] of Object.entries(colFilters)) {
    if (selected && selected.size > 0) {
      result = result.filter((row) => selected.has(getDisplayLabel(row, colKey)))
    }
  }

  // 2. Sắp xếp
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
}, [contracts, colFilters, sortState])
```

**Quy tắc**:
- Lọc nhiều cột là **AND** (thu hẹp dần), không phải OR.
- `getUniqueValues` cho dropdown **luôn lấy từ `contracts` gốc**, không phải từ `displayed` — tránh mất giá trị khi đang filter cột khác.
- Sort dùng `localeCompare('vi', { numeric: true })` để xử lý đúng ký tự tiếng Việt và số (`"10"` > `"9"`).

---

## Component `ColumnFilterDropdown`

### Vị trí render

Dropdown phải render **ngoài cấu trúc bảng**, ở gốc component cha. Lý do: bảng có `overflow: hidden` hoặc `overflow-x: auto` sẽ clip dropdown nếu render bên trong.

```jsx
{/* Nằm ngoài <div className={s.tableWrap}> */}
{filterPopup && (
  <ColumnFilterDropdown
    colKey={filterPopup.colKey}
    allRows={contracts}            // ← luôn là danh sách gốc, không phải displayed
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

**Tại sao `position: fixed` thay vì `absolute`**: các container bảng thường có `overflow: hidden` hoặc `overflow-x: auto` — `absolute` sẽ bị clip. `fixed` thoát khỏi mọi stacking context và luôn hiển thị đúng vị trí.

### Đóng khi click ngoài

```js
useEffect(() => {
  function handler(e) {
    if (dropRef.current && !dropRef.current.contains(e.target)) {
      // Không đóng nếu click vào nút filter khác — tránh đóng rồi mở lại cùng lúc
      if (!e.target.closest('[data-hdld-filter-btn]')) onClose()
    }
  }
  document.addEventListener('mousedown', handler)
  return () => document.removeEventListener('mousedown', handler)
}, [onClose])
```

**Bắt buộc** thêm `data-hdld-filter-btn` (hoặc attribute tương tự) vào nút trigger trong `<th>`. Nếu thiếu, click sang cột khác sẽ: đóng dropdown hiện tại → openFilter mở dropdown mới — nhưng do `mousedown` chạy trước `click`, dropdown mới sẽ bị đóng ngay lập tức.

### Logic checkbox "Chọn tất cả"

- `currentFilter = null` → không có filter → hiển thị tất cả checked.
- `currentFilter = Set([...values])` → filter active, chỉ hiển thị các giá trị trong Set.
- Khi `selected.size === allValues.length` → xóa filter (set về `null`) thay vì lưu Set đầy đủ.
- Dùng `ref` để set `indeterminate` trên checkbox "Chọn tất cả":

```jsx
<input
  type="checkbox"
  checked={allChecked}
  ref={(el) => { if (el) el.indeterminate = !allChecked && !noneChecked }}
  onChange={toggleAll}
/>
```

---

## Nút trigger trong `<th>` — `FilterTh`

Dùng inner component để tái sử dụng cho mọi cột:

```jsx
function FilterTh({ colKey, className, children }) {
  const active = hasFilter(colKey) || hasSort(colKey)
  return (
    <th className={className}>
      <div className={s.hdldThInner}>
        <span className={s.hdldThLabel}>{children}</span>
        <button
          data-hdld-filter-btn          // ← bắt buộc để close-on-outside hoạt động đúng
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

**`active` = có filter đang áp dụng HOẶC đang sắp xếp theo cột này** → đổi màu nút để người dùng biết cột đang bị tác động.

---

## CSS classes cần khai báo

Tất cả class đặt trong CSS module của trang, có namespace prefix (ví dụ `hdld*` cho HĐLĐ):

| Class | Mục đích |
|---|---|
| `*ThInner` | `display: flex; align-items: center; gap` — bọc label + nút filter |
| `*ThLabel` | `flex: 1` — label chiếm phần còn lại |
| `*FilterBtn` | Nút trigger: transparent bg, màu cùng với header text |
| `*FilterBtnActive` | Trạng thái active: `background: var(--color-accent); color: #fff` |
| `*FilterDropdown` | `position: fixed; top: var(--dd-top); left: var(--dd-left); z-index: 1000` |
| `*DdSortSection` | Khu vực 2 nút sort, `border-bottom` ngăn cách với danh sách |
| `*DdSortBtn` / `*DdSortBtnActive` | Nút sort: full-width, hover highlight |
| `*DdSelectAll` | Hàng "Chọn tất cả" với checkbox |
| `*DdValueList` | `max-height: 200px; overflow-y: auto` — danh sách giá trị |
| `*DdValueItem` | Mỗi checkbox + label |
| `*DdFooter` | Footer chứa nút "Xoá bộ lọc & sắp xếp" |
| `*DdClearBtn` | Nút xóa: màu danger, no background |

**Quy tắc CSS**: màu nút filter (`*FilterBtn`) phải cùng màu với `color` của `.table th` (`#1e3a8a`). Không dùng màu nhạt hơn vì khó nhìn trên nền gradient sáng của header.

---

## Toolbar — thông tin trạng thái filter

Khi có filter/sort đang hoạt động, toolbar nên hiển thị:

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

---

## Checklist triển khai

- [ ] Định nghĩa `getDisplayLabel` và `getSortKey` ở **module level** (ngoài component).
- [ ] `colKey` cho cột động phải dùng tiền tố nhất quán (ví dụ `dyn__`).
- [ ] `displayed` dùng `useMemo`, dependencies: `[contracts, colFilters, sortState]`.
- [ ] `getUniqueValues` trong dropdown lấy từ `allRows` (prop), không phải từ `displayed`.
- [ ] Dropdown render **ngoài** `tableWrap`/`tableScroll`.
- [ ] Nút trigger trong `<th>` có attribute `data-hdld-filter-btn` (hoặc tên tương đương dự án).
- [ ] Close-on-outside dùng `mousedown`, bỏ qua click vào filter buttons.
- [ ] Màu `*FilterBtn` = màu text của `.table th`.
- [ ] Khi `selected.size === allValues.length` → lưu `null` thay vì Set đầy đủ (tránh bloat state).
- [ ] CSS `position: fixed`, không dùng `absolute` cho dropdown.

---

## File tham chiếu

| File | Vai trò |
|---|---|
| `frontend/src/pages/Companies/LaborContractsTab.jsx` | Triển khai mẫu đầy đủ |
| `frontend/src/pages/Companies/companies.module.css` | CSS classes mẫu (prefix `hdld`) |
| `docs/014_CSS_STYLE_GUIDE.md` | Quy tắc CSS chung, token design |
