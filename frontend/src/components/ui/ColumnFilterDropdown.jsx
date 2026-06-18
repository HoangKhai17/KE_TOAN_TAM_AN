import { useState, useRef, useEffect, useMemo } from 'react'
import { ArrowUp, ArrowDown } from 'lucide-react'
import s from './ColumnFilterDropdown.module.css'

// ── ColumnFilterDropdown (docs/018) ─────────────────────────────────────────────
//
// Bộ lọc/sắp xếp kiểu Excel gắn trên header cột. Generic — component cha truyền
// filterType + getDisplayLabel (cho enum). Định vị bằng position:fixed qua `style`.
//
// Props:
//   colKey, filterType: 'enum'|'text'|'dateRange'|'numberRange'
//   allRows           — danh sách GỐC (để liệt kê giá trị enum)
//   getDisplayLabel   — (row, colKey) => string  (bắt buộc cho enum)
//   currentFilter     — giá trị filter hiện tại (Set | string | {from,to} | {min,max})
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
      {/* Sort — luôn hiển thị */}
      <div className={s.sortSection}>
        <button
          className={`${s.sortBtn} ${sortState?.col === colKey && sortState.dir === 'asc' ? s.sortBtnActive : ''}`}
          onClick={() => onSort(colKey, 'asc')}
        >
          <ArrowUp size={12} /> {sortAscLabel}
        </button>
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
        <NumberRangeSection colKey={colKey} currentFilter={currentFilter} onFilterChange={onFilterChange} />
      )}
    </div>
  )
}

// ── Enum ─────────────────────────────────────────────────────────────────────
function EnumSection({ allRows, colKey, getDisplayLabel, currentFilter, onFilterChange }) {
  const [q, setQ] = useState('')
  const values = useMemo(() => {
    const set = new Set()
    for (const row of allRows) set.add(getDisplayLabel(row, colKey))
    return [...set].sort((a, b) => String(a).localeCompare(String(b), 'vi', { numeric: true }))
  }, [allRows, colKey, getDisplayLabel])

  const selected = currentFilter instanceof Set ? currentFilter : new Set()
  const filtered = q.trim() ? values.filter((v) => String(v).toLowerCase().includes(q.toLowerCase())) : values
  const allChecked = values.length > 0 && selected.size === values.length

  function toggle(v) {
    const next = new Set(selected)
    next.has(v) ? next.delete(v) : next.add(v)
    onFilterChange(colKey, next.size > 0 ? next : null)
  }
  function toggleAll() {
    onFilterChange(colKey, allChecked ? null : new Set(values))
  }

  return (
    <div className={s.section}>
      {values.length > 8 && (
        <input className={s.input} placeholder="Tìm giá trị..." value={q} onChange={(e) => setQ(e.target.value)} />
      )}
      <label className={s.selectAll}>
        <input type="checkbox" checked={allChecked}
          ref={(el) => { if (el) el.indeterminate = selected.size > 0 && !allChecked }}
          onChange={toggleAll} />
        <span>Chọn tất cả</span>
      </label>
      <div className={s.valueList}>
        {filtered.map((v) => (
          <label key={v} className={s.valueItem}>
            <input type="checkbox" checked={selected.has(v)} onChange={() => toggle(v)} />
            <span className={s.valueText}>{v}</span>
          </label>
        ))}
        {filtered.length === 0 && <div className={s.empty}>Không có giá trị</div>}
      </div>
      {selected.size > 0 && (
        <div className={s.footer}>
          <button className={s.clearBtn} onClick={() => onFilterChange(colKey, null)}>Xoá bộ lọc</button>
        </div>
      )}
    </div>
  )
}

// ── Text ─────────────────────────────────────────────────────────────────────
function TextSection({ colKey, currentFilter, onFilterChange }) {
  const [val, setVal] = useState(typeof currentFilter === 'string' ? currentFilter : '')
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])
  return (
    <div className={s.section}>
      <input
        ref={ref}
        className={s.input}
        placeholder="Tìm trong cột..."
        value={val}
        onChange={(e) => { setVal(e.target.value); onFilterChange(colKey, e.target.value.trim() ? e.target.value : null) }}
      />
      {val && (
        <div className={s.footer}>
          <button className={s.clearBtn} onClick={() => { setVal(''); onFilterChange(colKey, null) }}>Xoá bộ lọc</button>
        </div>
      )}
    </div>
  )
}

// ── Date range ───────────────────────────────────────────────────────────────
function DateRangeSection({ colKey, currentFilter, onFilterChange }) {
  const [from, setFrom] = useState(currentFilter?.from ?? '')
  const [to, setTo]     = useState(currentFilter?.to ?? '')
  function update(nf, nt) {
    onFilterChange(colKey, (nf || nt) ? { from: nf, to: nt } : null)
  }
  return (
    <div className={s.section}>
      <div className={s.rangeGroup}>
        <div className={s.rangeRow}>
          <label className={s.rangeLabel}>Từ ngày</label>
          <input type="date" className={s.input} value={from}
            onChange={(e) => { setFrom(e.target.value); update(e.target.value, to) }} />
        </div>
        <div className={s.rangeRow}>
          <label className={s.rangeLabel}>Đến ngày</label>
          <input type="date" className={s.input} value={to}
            onChange={(e) => { setTo(e.target.value); update(from, e.target.value) }} />
        </div>
      </div>
      {(from || to) && (
        <div className={s.footer}>
          <button className={s.clearBtn} onClick={() => { setFrom(''); setTo(''); onFilterChange(colKey, null) }}>Xoá bộ lọc</button>
        </div>
      )}
    </div>
  )
}

// ── Number range ─────────────────────────────────────────────────────────────
function NumberRangeSection({ colKey, currentFilter, onFilterChange }) {
  const [min, setMin] = useState(currentFilter?.min ?? '')
  const [max, setMax] = useState(currentFilter?.max ?? '')
  function update(nmin, nmax) {
    onFilterChange(colKey, (nmin !== '' || nmax !== '') ? { min: nmin, max: nmax } : null)
  }
  return (
    <div className={s.section}>
      <div className={s.rangeGroup}>
        <div className={s.rangeRow}>
          <label className={s.rangeLabel}>Nhỏ nhất</label>
          <input type="number" className={s.input} value={min}
            onChange={(e) => { setMin(e.target.value); update(e.target.value, max) }} />
        </div>
        <div className={s.rangeRow}>
          <label className={s.rangeLabel}>Lớn nhất</label>
          <input type="number" className={s.input} value={max}
            onChange={(e) => { setMax(e.target.value); update(min, e.target.value) }} />
        </div>
      </div>
      {(min !== '' || max !== '') && (
        <div className={s.footer}>
          <button className={s.clearBtn} onClick={() => { setMin(''); setMax(''); onFilterChange(colKey, null) }}>Xoá bộ lọc</button>
        </div>
      )}
    </div>
  )
}
