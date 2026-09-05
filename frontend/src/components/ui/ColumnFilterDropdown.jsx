import { useState, useRef, useEffect, useMemo } from 'react'
import { ArrowUp, ArrowDown, FilterX } from 'lucide-react'
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

      {filterType === 'enum' && (
        <EnumSection allRows={allRows} colKey={colKey} getDisplayLabel={getDisplayLabel}
          currentFilter={currentFilter} onFilterChange={onFilterChange} />
      )}
      {filterType === 'text' && (
        <TextSection colKey={colKey} currentFilter={currentFilter} onFilterChange={onFilterChange} />
      )}
      {filterType === 'dateRange' && (
        <DateRangeSection colKey={colKey} currentFilter={currentFilter} onFilterChange={onFilterChange} />
      )}
      {filterType === 'numberRange' && (
        <NumberSection colKey={colKey} currentFilter={currentFilter} onFilterChange={onFilterChange} />
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

// ── Enum: value list kiểu Excel (đếm số lượng, ô trống, đảo chọn, sắp xếp) ───────
function EnumSection({ allRows, colKey, getDisplayLabel, currentFilter, onFilterChange }) {
  const [q, setQ] = useState('')
  const [sortBy, setSortBy] = useState('name') // 'name' | 'count'

  // Danh sách giá trị + số lượng từng giá trị
  const items = useMemo(() => {
    const counts = new Map()
    for (const row of allRows) {
      const v = getDisplayLabel(row, colKey) ?? ''
      counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    const arr = [...counts.entries()].map(([value, count]) => ({ value, count }))
    arr.sort((a, b) => {
      if (sortBy === 'count') return b.count - a.count || String(a.value).localeCompare(String(b.value), 'vi', { numeric: true })
      return String(a.value).localeCompare(String(b.value), 'vi', { numeric: true })
    })
    return arr
  }, [allRows, colKey, getDisplayLabel, sortBy])

  const allValues = useMemo(() => items.map((it) => it.value), [items])
  const selected = currentFilter instanceof Set ? currentFilter : new Set()
  const filtered = q.trim()
    ? items.filter((it) => String(it.value).toLocaleLowerCase('vi').includes(q.toLocaleLowerCase('vi')))
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

  const showLabel = (v) => (String(v).trim() === '' ? '(Trống)' : v)

  return (
    <div className={s.section}>
      <input className={s.input} placeholder="Tìm giá trị..." value={q} onChange={(e) => setQ(e.target.value)} />

      <div className={s.valueSortRow}>
        <button className={`${s.miniBtn} ${sortBy === 'name' ? s.miniBtnActive : ''}`} onClick={() => setSortBy('name')}>Tên</button>
        <button className={`${s.miniBtn} ${sortBy === 'count' ? s.miniBtnActive : ''}`} onClick={() => setSortBy('count')}>Số lượng</button>
        <span className={s.spacer} />
        <button className={s.linkBtn} onClick={invert}>Đảo chọn</button>
      </div>

      <label className={s.selectAll}>
        <input type="checkbox" checked={allChecked}
          ref={(el) => { if (el) el.indeterminate = selected.size > 0 && !allChecked }}
          onChange={toggleAll} />
        <span>Chọn tất cả</span>
        <span className={s.countBadge}>{allRows.length}</span>
      </label>

      <div className={s.valueList}>
        {filtered.map((it) => (
          <label key={it.value} className={s.valueItem}>
            <input type="checkbox" checked={selected.has(it.value)} onChange={() => toggle(it.value)} />
            <span className={`${s.valueText} ${String(it.value).trim() === '' ? s.blankText : ''}`}>{showLabel(it.value)}</span>
            <span className={s.countBadge}>{it.count}</span>
          </label>
        ))}
        {filtered.length === 0 && <div className={s.empty}>Không có giá trị</div>}
      </div>

      <ClearFooter disabled={selected.size === 0} onClear={() => onFilterChange(colKey, null)} />
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
function TextSection({ colKey, currentFilter, onFilterChange }) {
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
      <ClearFooter disabled={!textActive(state)} onClear={() => emit(toTextConditions(null))} />
    </div>
  )
}

// ── Number: bộ điều kiện (2 dòng, AND/OR) ────────────────────────────────────────
function NumberSection({ colKey, currentFilter, onFilterChange }) {
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
      <ClearFooter disabled={!numActive(state)} onClear={() => emit(toNumConditions(null))} />
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

function DateRangeSection({ colKey, currentFilter, onFilterChange }) {
  const [from, setFrom] = useState(currentFilter?.from ?? '')
  const [to, setTo]     = useState(currentFilter?.to ?? '')
  function update(nf, nt) {
    setFrom(nf); setTo(nt)
    onFilterChange(colKey, (nf || nt) ? { from: nf, to: nt } : null)
  }
  return (
    <div className={s.section}>
      <div className={s.quickRow}>
        <button className={s.miniBtn} onClick={() => update(...Object.values(quickRange('today')))}>Hôm nay</button>
        <button className={s.miniBtn} onClick={() => update(...Object.values(quickRange('week')))}>Tuần này</button>
        <button className={s.miniBtn} onClick={() => update(...Object.values(quickRange('month')))}>Tháng này</button>
        <button className={s.miniBtn} onClick={() => update(...Object.values(quickRange('year')))}>Năm nay</button>
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
      <ClearFooter disabled={!from && !to} onClear={() => update('', '')} />
    </div>
  )
}
