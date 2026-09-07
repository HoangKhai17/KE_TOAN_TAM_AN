import { useState, useRef, useEffect, useMemo } from 'react'
import { ArrowUp, ArrowDown, FilterX, Settings2, Check } from 'lucide-react'
import DateBox from './DateBox'
import { TEXT_OPS, NUM_OPS } from './columnFilter'
import s from './ColumnFilterDropdown.module.css'

// ── ColumnFilterDropdown (docs/018) ─────────────────────────────────────────────
//
// Bộ lọc/sắp xếp kiểu Excel gắn trên header cột. Generic — component cha truyền
// filterType + getDisplayLabel (cho enum). Định vị bằng position:fixed qua `style`.
// Logic ÁP lọc nằm ở columnFilter.js (dùng chung). Component này chỉ lo phần UI +
// phát ra giá trị filter theo shape:
//   enum        : Set<string>
//   text        : { conditions:[{op,value}], join:'and'|'or' }
//   numberRange : { conditions:[{op,value}], join:'and'|'or' }
//   dateRange   : { from, to }
//
// Props:
//   colKey, filterType: 'enum'|'text'|'dateRange'|'numberRange'
//   allRows           — danh sách GỐC (liệt kê giá trị + đếm số lượng cho enum)
//   getDisplayLabel   — (row, colKey) => string  (bắt buộc cho enum)
//   currentFilter     — giá trị filter hiện tại
//   sortState         — { col, dir }
//   sortAscLabel/sortDescLabel — nhãn 2 nút sort (mặc định A→Z / Z→A)
//   onSort(colKey, dir) · onFilterChange(colKey, value|null) · onClose() · style
//
export default function ColumnFilterDropdown({
  colKey, filterType, allRows = [], getDisplayLabel,
  currentFilter, sortState, onSort, onFilterChange, onClose, style,
  sortAscLabel = 'A → Z', sortDescLabel = 'Z → A',
  // ── Chế độ SERVER (tuỳ chọn): value-list lấy từ API thay vì tính từ allRows ──
  //   serverMode · hasValueList (cột có tab "Theo giá trị" không) · serverValues:[{value,count}]
  //   loadingValues · labelOf(value)→nhãn · totalRows (tổng dòng cho badge)
  serverMode = false, hasValueList = false, serverValues, loadingValues, labelOf, totalRows,
}) {
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        if (!e.target.closest('[data-colfilter-btn]')) onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // "Xoá bộ lọc" xoá luôn cả sort của cột này.
  const colSorted = sortState?.col === colKey
  const onClearSort = () => onSort(colKey, null)

  // Mô hình 2 tab như Excel: MỌI cột (trừ 'none') đều có "Theo giá trị" (nếu trang cấp
  // getDisplayLabel) + "Theo điều kiện" (toán tử theo kiểu cột).
  const valueAvailable     = filterType !== 'none' && (serverMode ? hasValueList : typeof getDisplayLabel === 'function')
  const conditionAvailable = filterType !== 'none'
  const conditionKind = filterType === 'numberRange' ? 'number' : filterType === 'dateRange' ? 'date' : 'text'
  const showTabs = valueAvailable && conditionAvailable

  // Filter đang lưu là Set → chế độ "giá trị"; ngược lại (string/{conditions}/{from,to}) → "điều kiện".
  const isSetFilter = currentFilter instanceof Set
  const [tab, setTab] = useState(isSetFilter ? 'value' : (currentFilter != null ? 'condition' : (valueAvailable ? 'value' : 'condition')))
  const showValue     = valueAvailable     && (!showTabs || tab === 'value')
  const showCondition = conditionAvailable && (!showTabs || tab === 'condition')
  const valueFilter = isSetFilter ? currentFilter : null   // 2 chế độ tách shape, đổi tab không lẫn
  const condFilter  = isSetFilter ? null : currentFilter

  return (
    <div ref={ref} className={s.dropdown} style={style}>
      {/* Sort — luôn hiển thị, 2 nút trên cùng 1 hàng, ngăn bằng dấu | */}
      <div className={s.sortSection}>
        <button
          className={`${s.sortBtn} ${sortState?.col === colKey && sortState.dir === 'asc' ? s.sortBtnActive : ''}`}
          onClick={() => onSort(colKey, 'asc')}
        >
          <ArrowUp size={12} /> {sortAscLabel}
        </button>
        <span className={s.sortDivider} aria-hidden="true">|</span>
        <button
          className={`${s.sortBtn} ${sortState?.col === colKey && sortState.dir === 'desc' ? s.sortBtnActive : ''}`}
          onClick={() => onSort(colKey, 'desc')}
        >
          <ArrowDown size={12} /> {sortDescLabel}
        </button>
      </div>

      {showTabs && (
        <div className={s.tabRow} role="tablist">
          <button className={`${s.tab} ${tab === 'value' ? s.tabActive : ''}`} onClick={() => setTab('value')}>Theo giá trị</button>
          <button className={`${s.tab} ${tab === 'condition' ? s.tabActive : ''}`} onClick={() => setTab('condition')}>Theo điều kiện</button>
        </div>
      )}

      {showValue && (
        <ValueSection allRows={allRows} colKey={colKey} getDisplayLabel={getDisplayLabel}
          numeric={filterType === 'numberRange'} dateCol={filterType === 'dateRange'}
          serverMode={serverMode} serverValues={serverValues} loadingValues={loadingValues}
          labelOf={labelOf} totalRows={totalRows}
          currentFilter={valueFilter} onFilterChange={onFilterChange} colSorted={colSorted} onClearSort={onClearSort} />
      )}
      {showCondition && conditionKind === 'text' && (
        <TextSection colKey={colKey} currentFilter={condFilter} onFilterChange={onFilterChange} colSorted={colSorted} onClearSort={onClearSort} />
      )}
      {showCondition && conditionKind === 'number' && (
        <NumberSection colKey={colKey} currentFilter={condFilter} onFilterChange={onFilterChange} colSorted={colSorted} onClearSort={onClearSort} />
      )}
      {showCondition && conditionKind === 'date' && (
        <DateRangeSection colKey={colKey} currentFilter={condFilter} onFilterChange={onFilterChange} colSorted={colSorted} onClearSort={onClearSort} />
      )}

      {/* Cột chỉ-sắp-xếp (STT/File): vẫn cho xoá sort khi đang sắp */}
      {filterType === 'none' && colSorted && (
        <ClearFooter disabled={false} onClear={onClearSort} />
      )}
    </div>
  )
}

// Nút "Xoá bộ lọc" dùng chung — LUÔN hiển thị ở mọi loại filter cho đồng bộ,
// disable khi cột chưa lọc gì (khỏi phải mở "Đặt lại" trên panel để xoá 1 cột).
function ClearFooter({ disabled, onClear }) {
  return (
    <div className={s.footer}>
      <button className={s.clearBtn} disabled={disabled} onClick={onClear}>
        <FilterX size={13} /> Xoá bộ lọc
      </button>
    </div>
  )
}

// ── Tuỳ chọn hiển thị của tab "Theo giá trị" (lưu localStorage, riêng mỗi trình duyệt) ──
const VALUE_PREFS_KEY = 'cfd.valuePrefs'
const DEFAULT_VALUE_PREFS = { showCount: true, showTotal: false, pinSelected: false }
function loadValuePrefs() {
  try { return { ...DEFAULT_VALUE_PREFS, ...(JSON.parse(localStorage.getItem(VALUE_PREFS_KEY)) || {}) } }
  catch { return { ...DEFAULT_VALUE_PREFS } }
}
function saveValuePrefs(p) {
  try { localStorage.setItem(VALUE_PREFS_KEY, JSON.stringify(p)) } catch { /* ignore */ }
}

// Menu bánh răng như Excel — bật/tắt cách hiển thị danh sách giá trị
function ValueGearMenu({ prefs, setPref }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  const item = (key, label) => (
    <button className={s.gearItem} onClick={() => setPref(key, !prefs[key])}>
      <span className={s.gearCheck}>{prefs[key] && <Check size={12} />}</span>{label}
    </button>
  )
  return (
    <div className={s.gearWrap} ref={ref}>
      <button className={`${s.miniBtn} ${s.gearBtn}`} title="Tuỳ chọn hiển thị" onClick={() => setOpen((o) => !o)}>
        <Settings2 size={12} />
      </button>
      {open && (
        <div className={s.gearMenu}>
          {item('showCount', 'Hiện số lượng')}
          {item('showTotal', 'Hiện tổng số dòng')}
          {item('pinSelected', 'Ghim mục đã chọn lên đầu')}
        </div>
      )}
    </div>
  )
}

// Đọc số từ nhãn (hỗ trợ định dạng vi-VN "80.000.000" / "12,5" / "3")
function parseViNumber(label) {
  if (label == null) return null
  let s = String(label).trim()
  if (s === '' || s === '(Trống)') return null
  s = s.replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

// Đọc ngày từ nhãn — hỗ trợ "dd/mm/yyyy" LẪN ISO "yyyy-mm-dd[...]" (bỏ phần giờ)
function parseViDate(label) {
  const s = String(label ?? '').trim()
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (m) { const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])); return isNaN(d.getTime()) ? null : d }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) { const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])); return isNaN(d.getTime()) ? null : d }
  return null
}

// Khoảng [from, to] (Date, 0h) của một mốc thời gian tương đối, so với hôm nay
function dateRangePreset(key) {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const y = now.getFullYear(), mo = now.getMonth(), da = now.getDate()
  const mk = (yy, mm, dd) => new Date(yy, mm, dd)
  const dow = (now.getDay() + 6) % 7   // Thứ 2 = 0
  const weekMon = (shift) => mk(y, mo, da - dow + shift * 7)
  const weekOf = (shift) => { const s = weekMon(shift); return [s, mk(s.getFullYear(), s.getMonth(), s.getDate() + 6)] }
  const q = Math.floor(mo / 3)
  switch (key) {
    case 'yesterday': return [mk(y, mo, da - 1), mk(y, mo, da - 1)]
    case 'today':     return [now, now]
    case 'tomorrow':  return [mk(y, mo, da + 1), mk(y, mo, da + 1)]
    case 'lastWeek':  return weekOf(-1)
    case 'thisWeek':  return weekOf(0)
    case 'nextWeek':  return weekOf(1)
    case 'lastMonth': return [mk(y, mo - 1, 1), mk(y, mo, 0)]
    case 'thisMonth': return [mk(y, mo, 1), mk(y, mo + 1, 0)]
    case 'nextMonth': return [mk(y, mo + 1, 1), mk(y, mo + 2, 0)]
    case 'lastQuarter': return [mk(y, q * 3 - 3, 1), mk(y, q * 3, 0)]
    case 'thisQuarter': return [mk(y, q * 3, 1), mk(y, q * 3 + 3, 0)]
    case 'nextQuarter': return [mk(y, q * 3 + 3, 1), mk(y, q * 3 + 6, 0)]
    case 'lastYear': return [mk(y - 1, 0, 1), mk(y - 1, 11, 31)]
    case 'thisYear': return [mk(y, 0, 1), mk(y, 11, 31)]
    case 'nextYear': return [mk(y + 1, 0, 1), mk(y + 1, 11, 31)]
    default: return null
  }
}

// Menu "Nâng cao" — các thao tác CHỌN NHANH trên value-list (như "More" của Excel)
function ValueMoreMenu({ actions }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  const act = (fn) => { fn(); setOpen(false) }
  return (
    <div className={s.gearWrap} ref={ref}>
      <button className={`${s.miniBtn} ${open ? s.miniBtnActive : ''}`} onClick={() => setOpen((o) => !o)}>Nâng cao ▾</button>
      {open && (
        <div className={s.gearMenu}>
          {actions.map((a, i) => (
            a.separator
              ? <div key={`sep${i}`} className={s.gearSep} />
              : (
                <button key={a.label} className={`${s.gearItem} ${a.active ? s.gearItemActive : ''}`} disabled={a.disabled} onClick={() => act(a.run)}>
                  <span className={s.gearCheck}>{a.active && <Check size={12} />}</span>{a.label}
                </button>
              )
          ))}
        </div>
      )}
    </div>
  )
}

// ── Lọc theo GIÁ TRỊ: value list kiểu Excel (đếm số lượng, ô trống, đảo chọn, sắp xếp) ──
function ValueSection({ allRows, colKey, getDisplayLabel, numeric, dateCol, currentFilter, onFilterChange, colSorted, onClearSort,
  serverMode, serverValues, loadingValues, labelOf, totalRows }) {
  const [q, setQ] = useState('')
  const [sortBy, setSortBy] = useState('name') // 'name' | 'count'
  const [prefs, setPrefs] = useState(loadValuePrefs)
  const setPref = (k, v) => { const n = { ...prefs, [k]: v }; setPrefs(n); saveValuePrefs(n) }

  // Nhãn hiển thị của một giá trị (server: qua labelOf; client: value là chính nhãn)
  const display = (v) => {
    const lbl = (serverMode && labelOf) ? labelOf(v) : v
    return String(lbl ?? '').trim() === '' ? '(Trống)' : lbl
  }

  // Danh sách giá trị + số lượng. Server: lấy thẳng từ API; Client: gom từ allRows.
  const items = useMemo(() => {
    let arr
    if (serverMode) {
      arr = (serverValues || []).map((v) => ({ value: v.value ?? '', count: v.count }))
    } else {
      const counts = new Map()
      for (const row of allRows) {
        const v = getDisplayLabel(row, colKey) ?? ''
        counts.set(v, (counts.get(v) ?? 0) + 1)
      }
      arr = [...counts.entries()].map(([value, count]) => ({ value, count }))
    }
    const nameOf = (it) => String((serverMode && labelOf) ? (labelOf(it.value) ?? '') : it.value)
    const byName = (a, b) => {
      if (dateCol) {   // cột ngày: so theo mốc thời gian, không theo chuỗi
        const da = parseViDate(a.value), db = parseViDate(b.value)
        if (da && db) return da - db
        if (da) return -1
        if (db) return 1
      }
      return nameOf(a).localeCompare(nameOf(b), 'vi', { numeric: true })
    }
    arr.sort((a, b) => (sortBy === 'count' ? (b.count - a.count || byName(a, b)) : byName(a, b)))
    return arr
  }, [serverMode, serverValues, labelOf, allRows, colKey, getDisplayLabel, sortBy, dateCol])

  const allValues = useMemo(() => items.map((it) => it.value), [items])
  const selected = currentFilter instanceof Set ? currentFilter : new Set()
  // Tìm NHIỀU từ khoá, cách nhau bằng dấu "," → khớp nếu chứa BẤT KỲ từ nào (như Excel)
  const keywords = q.split(',').map((k) => k.trim().toLocaleLowerCase('vi')).filter(Boolean)
  const filtered = keywords.length
    ? items.filter((it) => { const l = String(display(it.value)).toLocaleLowerCase('vi'); return keywords.some((k) => l.includes(k)) })
    : items
  const allChecked = allValues.length > 0 && selected.size === allValues.length

  function toggle(v) {
    const next = new Set(selected)
    next.has(v) ? next.delete(v) : next.add(v)
    onFilterChange(colKey, next.size > 0 ? next : null)
  }
  function toggleAll() {
    onFilterChange(colKey, allChecked ? null : new Set(allValues))
  }
  function invert() {
    const next = new Set(allValues.filter((v) => !selected.has(v)))
    onFilterChange(colKey, next.size > 0 ? next : null)
  }
  // Áp một TẬP giá trị làm bộ lọc; so sánh với lựa chọn hiện tại để biết preset nào đang active.
  const applySet = (set) => onFilterChange(colKey, set.size > 0 ? new Set(set) : null)
  const setsEqual = (a, b) => !!a && !!b && a.size === b.size && [...a].every((v) => b.has(v))
  const setOf = (arr) => new Set(arr.map((it) => it.value))
  const mkAction = (label, set, disabled = false) => ({
    label, run: () => applySet(set),
    disabled: disabled || set.size === 0,
    active: !disabled && set.size > 0 && setsEqual(selected, set),
  })

  // Nhóm chung: trùng lặp (count>1) / duy nhất (count===1)
  const dupSet  = useMemo(() => setOf(items.filter((it) => it.count > 1)),  [items]) // eslint-disable-line react-hooks/exhaustive-deps
  const uniqSet = useMemo(() => setOf(items.filter((it) => it.count === 1)), [items]) // eslint-disable-line react-hooks/exhaustive-deps

  // Nhóm SỐ (chỉ cột số): Top 10 / Trên–Dưới TB / Chỉ số nguyên
  const numItems = useMemo(() => (
    numeric ? items.map((it) => ({ ...it, num: parseViNumber(it.value) })).filter((it) => it.num != null) : []
  ), [numeric, items])
  const numAvg = useMemo(() => {
    if (numItems.length === 0) return null
    let sum = 0, cnt = 0
    for (const it of numItems) { sum += it.num * it.count; cnt += it.count }
    return cnt ? sum / cnt : null
  }, [numItems])
  const numActions = numItems.length > 0 ? [
    { separator: true },
    mkAction('10 giá trị lớn nhất', setOf([...numItems].sort((a, b) => b.num - a.num).slice(0, 10))),
    mkAction('Trên trung bình', setOf(numItems.filter((it) => numAvg != null && it.num > numAvg)), numAvg == null),
    mkAction('Dưới trung bình', setOf(numItems.filter((it) => numAvg != null && it.num < numAvg)), numAvg == null),
    mkAction('Chỉ số nguyên', setOf(numItems.filter((it) => Number.isInteger(it.num)))),
  ] : []

  // Nhóm NGÀY (chỉ cột ngày): chọn giá trị rơi vào mốc thời gian tương đối
  const dateItems = useMemo(() => (
    dateCol ? items.map((it) => ({ ...it, d: parseViDate(it.value) })).filter((it) => it.d != null) : []
  ), [dateCol, items])
  const dateSetOf = (key) => {
    const r = dateRangePreset(key); if (!r) return new Set()
    const [from, to] = r
    return setOf(dateItems.filter((it) => it.d >= from && it.d <= to))
  }
  const DATE_PRESETS = [
    ['Hôm qua', 'yesterday'], ['Hôm nay', 'today'], ['Ngày mai', 'tomorrow'],
    ['Tuần trước', 'lastWeek'], ['Tuần này', 'thisWeek'], ['Tuần sau', 'nextWeek'],
    ['Tháng trước', 'lastMonth'], ['Tháng này', 'thisMonth'], ['Tháng sau', 'nextMonth'],
    ['Quý trước', 'lastQuarter'], ['Quý này', 'thisQuarter'], ['Quý sau', 'nextQuarter'],
    ['Năm trước', 'lastYear'], ['Năm nay', 'thisYear'], ['Năm sau', 'nextYear'],
  ]
  const dateActions = dateItems.length > 0
    ? [{ separator: true }, ...DATE_PRESETS.map(([label, key]) => mkAction(label, dateSetOf(key)))]
    : []

  const totalBadge = serverMode ? (totalRows ?? '') : allRows.length

  // Ghim mục đã chọn lên đầu (giữ nguyên thứ tự sắp xếp trong từng nhóm)
  const listed = prefs.pinSelected
    ? [...filtered.filter((it) => selected.has(it.value)), ...filtered.filter((it) => !selected.has(it.value))]
    : filtered

  return (
    <div className={s.section}>
      <input className={s.input} placeholder="Tìm giá trị (nhiều từ, cách bằng dấu ,)" value={q} onChange={(e) => setQ(e.target.value)} />

      <div className={s.valueSortRow}>
        <button className={`${s.miniBtn} ${sortBy === 'name' ? s.miniBtnActive : ''}`} onClick={() => setSortBy('name')}>Tên</button>
        <button className={`${s.miniBtn} ${sortBy === 'count' ? s.miniBtnActive : ''}`} onClick={() => setSortBy('count')}>Số lượng</button>
        <span className={s.spacer} />
        <ValueMoreMenu actions={[
          { label: 'Đảo chọn', run: invert },
          mkAction('Chọn giá trị trùng lặp', dupSet),
          mkAction('Chọn giá trị duy nhất', uniqSet),
          ...numActions,
          ...dateActions,
        ]} />
        <ValueGearMenu prefs={prefs} setPref={setPref} />
      </div>

      <label className={s.selectAll}>
        <input type="checkbox" checked={allChecked}
          ref={(el) => { if (el) el.indeterminate = selected.size > 0 && !allChecked }}
          onChange={toggleAll} />
        <span>Chọn tất cả</span>
        {prefs.showCount && <span className={s.countBadge}>{totalBadge}</span>}
      </label>

      <div className={s.valueList}>
        {serverMode && loadingValues && items.length === 0
          ? <div className={s.empty}>Đang tải…</div>
          : (<>
              {listed.map((it) => (
                <label key={it.value} className={s.valueItem}>
                  <input type="checkbox" checked={selected.has(it.value)} onChange={() => toggle(it.value)} />
                  <span className={`${s.valueText} ${String(it.value ?? '').trim() === '' ? s.blankText : ''}`}>{display(it.value)}</span>
                  {prefs.showCount && <span className={s.countBadge}>{it.count}</span>}
                </label>
              ))}
              {listed.length === 0 && <div className={s.empty}>Không có giá trị</div>}
            </>)}
      </div>

      {prefs.showTotal && (
        <div className={s.totalRow}>Tổng: {totalBadge} dòng · {allValues.length} giá trị</div>
      )}

      <ClearFooter disabled={selected.size === 0 && !colSorted}
        onClear={() => { onFilterChange(colKey, null); onClearSort() }} />
    </div>
  )
}

// ── Chuẩn hoá currentFilter text/number về shape { conditions, join } để chỉnh sửa ──
function toTextConditions(cf) {
  if (typeof cf === 'string') return { conditions: [{ op: 'contains', value: cf }, { op: 'contains', value: '' }], join: 'and' }
  if (cf && Array.isArray(cf.conditions)) {
    const c = [...cf.conditions]
    while (c.length < 2) c.push({ op: 'contains', value: '' })
    return { conditions: c.slice(0, 2), join: cf.join === 'or' ? 'or' : 'and' }
  }
  return { conditions: [{ op: 'contains', value: '' }, { op: 'contains', value: '' }], join: 'and' }
}
function toNumConditions(cf) {
  if (cf && Array.isArray(cf.conditions)) {
    const c = [...cf.conditions]
    while (c.length < 2) c.push({ op: 'gte', value: '' })
    return { conditions: c.slice(0, 2), join: cf.join === 'or' ? 'or' : 'and' }
  }
  // legacy { min, max } → ≥ min AND ≤ max
  if (cf && (cf.min != null || cf.max != null)) {
    return { conditions: [{ op: 'gte', value: cf.min ?? '' }, { op: 'lte', value: cf.max ?? '' }], join: 'and' }
  }
  return { conditions: [{ op: 'gte', value: '' }, { op: 'lte', value: '' }], join: 'and' }
}

// Điều kiện có "hiệu lực" để quyết định lưu/xoá filter
function textActive(state) {
  return state.conditions.some((c) => c.op === 'blank' || c.op === 'notBlank' || String(c.value).trim() !== '')
}
function numActive(state) {
  return state.conditions.some((c) => String(c.value).trim() !== '')
}

// ── Text: bộ điều kiện (2 dòng, AND/OR) ──────────────────────────────────────────
function TextSection({ colKey, currentFilter, onFilterChange, colSorted, onClearSort }) {
  const [state, setState] = useState(() => toTextConditions(currentFilter))
  const firstRef = useRef(null)
  useEffect(() => { firstRef.current?.focus() }, [])

  function emit(next) {
    setState(next)
    onFilterChange(colKey, textActive(next) ? { conditions: next.conditions, join: next.join } : null)
  }
  const setCond = (i, patch) => {
    const conditions = state.conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c))
    emit({ ...state, conditions })
  }
  const noVal = (op) => op === 'blank' || op === 'notBlank'

  return (
    <div className={s.section}>
      {state.conditions.map((c, i) => (
        <div key={i}>
          {i === 1 && (
            <div className={s.joinRow}>
              <label className={s.joinOpt}><input type="radio" checked={state.join === 'and'} onChange={() => emit({ ...state, join: 'and' })} /> Và</label>
              <label className={s.joinOpt}><input type="radio" checked={state.join === 'or'}  onChange={() => emit({ ...state, join: 'or' })} /> Hoặc</label>
            </div>
          )}
          <div className={s.condRow}>
            <select className={s.opSelect} value={c.op} onChange={(e) => setCond(i, { op: e.target.value })}>
              {TEXT_OPS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <input
              ref={i === 0 ? firstRef : null}
              className={s.input}
              placeholder={noVal(c.op) ? '(không cần nhập)' : 'nhập giá trị...'}
              value={c.value}
              disabled={noVal(c.op)}
              onChange={(e) => setCond(i, { value: e.target.value })}
            />
          </div>
        </div>
      ))}
      <ClearFooter disabled={!textActive(state) && !colSorted}
        onClear={() => { emit(toTextConditions(null)); onClearSort() }} />
    </div>
  )
}

// ── Number: bộ điều kiện (2 dòng, AND/OR) ────────────────────────────────────────
function NumberSection({ colKey, currentFilter, onFilterChange, colSorted, onClearSort }) {
  const [state, setState] = useState(() => toNumConditions(currentFilter))

  function emit(next) {
    setState(next)
    onFilterChange(colKey, numActive(next) ? { conditions: next.conditions, join: next.join } : null)
  }
  const setCond = (i, patch) => {
    const conditions = state.conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c))
    emit({ ...state, conditions })
  }

  return (
    <div className={s.section}>
      {state.conditions.map((c, i) => (
        <div key={i}>
          {i === 1 && (
            <div className={s.joinRow}>
              <label className={s.joinOpt}><input type="radio" checked={state.join === 'and'} onChange={() => emit({ ...state, join: 'and' })} /> Và</label>
              <label className={s.joinOpt}><input type="radio" checked={state.join === 'or'}  onChange={() => emit({ ...state, join: 'or' })} /> Hoặc</label>
            </div>
          )}
          <div className={s.condRow}>
            <select className={s.opSelect} value={c.op} onChange={(e) => setCond(i, { op: e.target.value })}>
              {NUM_OPS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <input type="number" className={s.input} placeholder="giá trị..." value={c.value}
              onChange={(e) => setCond(i, { value: e.target.value })} />
          </div>
        </div>
      ))}
      <ClearFooter disabled={!numActive(state) && !colSorted}
        onClear={() => { emit(toNumConditions(null)); onClearSort() }} />
    </div>
  )
}

// ── Date range + nút nhanh ───────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0') }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function quickRange(key) {
  const now = new Date()
  if (key === 'today') { const t = ymd(now); return { from: t, to: t } }
  if (key === 'week') {
    const day = (now.getDay() + 6) % 7 // Mon=0
    const mon = new Date(now); mon.setDate(now.getDate() - day)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    return { from: ymd(mon), to: ymd(sun) }
  }
  if (key === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { from: ymd(first), to: ymd(last) }
  }
  if (key === 'year') return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` }
  return { from: '', to: '' }
}

function DateRangeSection({ colKey, currentFilter, onFilterChange, colSorted, onClearSort }) {
  const [from, setFrom] = useState(currentFilter?.from ?? '')
  const [to, setTo]     = useState(currentFilter?.to ?? '')
  function update(nf, nt) {
    setFrom(nf); setTo(nt)
    onFilterChange(colKey, (nf || nt) ? { from: nf, to: nt } : null)
  }
  const isQuick = (key) => { const r = quickRange(key); return from === r.from && to === r.to }
  const qcls = (key) => `${s.miniBtn} ${isQuick(key) ? s.miniBtnActive : ''}`
  return (
    <div className={s.section}>
      <div className={s.quickRow}>
        <button className={qcls('today')} onClick={() => update(...Object.values(quickRange('today')))}>Hôm nay</button>
        <button className={qcls('week')}  onClick={() => update(...Object.values(quickRange('week')))}>Tuần này</button>
        <button className={qcls('month')} onClick={() => update(...Object.values(quickRange('month')))}>Tháng này</button>
        <button className={qcls('year')}  onClick={() => update(...Object.values(quickRange('year')))}>Năm nay</button>
      </div>
      <div className={s.rangeGroup}>
        <div className={s.rangeRow}>
          <label className={s.rangeLabel}>Từ ngày</label>
          <DateBox block value={from} onChange={(v) => update(v, to)} />
        </div>
        <div className={s.rangeRow}>
          <label className={s.rangeLabel}>Đến ngày</label>
          <DateBox block value={to} onChange={(v) => update(from, v)} />
        </div>
      </div>
      <ClearFooter disabled={!from && !to && !colSorted}
        onClear={() => { update('', ''); onClearSort() }} />
    </div>
  )
}
