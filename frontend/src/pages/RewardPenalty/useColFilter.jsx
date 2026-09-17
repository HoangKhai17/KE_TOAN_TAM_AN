// useColFilter — wiring bộ lọc/sắp xếp header cột (docs/018) cho các bảng Điểm thưởng.
// TÁI SỬ DỤNG component & logic có sẵn của hệ thống:
//   • ColumnFilterDropdown (UI dropdown Excel-like)
//   • columnFilter.js (matchColFilter / isColFilterActive)
// colDefs: [{ key, label, type:'text'|'enum'|'numberRange'|'dateRange'|'none',
//            getLabel(row)?, getNumber(row)?, getDate(row)?, num?:bool }]
import { useCallback, useMemo, useState } from 'react'
import { Filter } from 'lucide-react'
import ColumnFilterDropdown from '../../components/ui/ColumnFilterDropdown'
import { matchColFilter, isColFilterActive } from '../../components/ui/columnFilter'
import s from './rewardPenalty.module.css'

export function useColFilter(colDefs) {
  const defMap = useMemo(() => Object.fromEntries(colDefs.map((c) => [c.key, c])), [colDefs])
  const [colFilters, setColFilters] = useState({})
  const [sort, setSort] = useState({ col: null, dir: 'asc' })
  const [popup, setPopup] = useState(null)

  const typeOf = useCallback((k) => defMap[k]?.type ?? 'text', [defMap])
  const hasColFilter = useCallback((k) => isColFilterActive(colFilters[k], typeOf(k)), [colFilters, typeOf])

  const openColFilter = useCallback((k, e) => {
    e.stopPropagation()
    setPopup((cur) => {
      if (cur?.colKey === k) return null
      const rect = e.currentTarget.getBoundingClientRect()
      const left = Math.min(rect.left, window.innerWidth - 348)
      return { colKey: k, top: rect.bottom + 4, left: Math.max(8, left) }
    })
  }, [])
  const closePopup = useCallback(() => setPopup(null), [])
  const handleColSort = useCallback((col, dir) => { setSort(dir ? { col, dir } : { col: null, dir: 'asc' }); setPopup(null) }, [])
  const handleColFilterChange = useCallback((k, v) => {
    setColFilters((p) => { const n = { ...p }; if (v == null) delete n[k]; else n[k] = v; return n })
  }, [])

  const getDisplayLabel = useCallback((row, k) => {
    const d = defMap[k]; const v = d?.getLabel ? d.getLabel(row) : ''
    return v != null && String(v) !== '' ? String(v) : '(Trống)'
  }, [defMap])

  // Áp lọc + sắp xếp → trả về danh sách hiển thị
  const apply = useCallback((rows) => {
    let out = rows.filter((row) => colDefs.every((c) => {
      const f = colFilters[c.key]; if (!f) return true
      const cell = {
        label: c.getLabel ? c.getLabel(row) : '',
        number: c.getNumber ? c.getNumber(row) : null,
        date: c.getDate ? c.getDate(row) : '',
      }
      return matchColFilter(f, c.type, cell)
    }))
    if (sort.col) {
      const c = defMap[sort.col]
      out = [...out].sort((a, b) => {
        let r
        if (c?.getNumber) r = (c.getNumber(a) ?? -Infinity) - (c.getNumber(b) ?? -Infinity)
        else if (c?.getDate) r = String(c.getDate(a) ?? '').localeCompare(String(c.getDate(b) ?? ''))
        else r = String(c?.getLabel ? c.getLabel(a) ?? '' : '').localeCompare(String(c?.getLabel ? c.getLabel(b) ?? '' : ''), 'vi', { numeric: true })
        return sort.dir === 'asc' ? r : -r
      })
    }
    return out
  }, [colFilters, sort, colDefs, defMap])

  // Khoá phụ thuộc để panel reset trang khi lọc/sắp xếp đổi
  const depKey = useMemo(() => JSON.stringify({
    f: Object.fromEntries(Object.entries(colFilters).map(([k, v]) => [k, v instanceof Set ? [...v] : v])),
    s: sort,
  }), [colFilters, sort])

  return {
    colFilters, sort, popup, setPopup, typeOf, hasColFilter,
    openColFilter, closePopup, handleColSort, handleColFilterChange, getDisplayLabel, apply, depKey,
  }
}

// Header cell có nút lọc/sắp xếp. `num` = canh phải.
export function FilterTh({ cf, colKey, children, num, className }) {
  const filterable = cf.typeOf(colKey) !== 'none'
  const active = cf.hasColFilter(colKey) || cf.sort.col === colKey
  return (
    <th className={className}>
      <div className={`${s.thInner} ${num ? s.thInnerNum : ''}`}>
        <span className={s.thLabel}>{children}</span>
        {filterable && (
          <button data-colfilter-btn className={`${s.thFilterBtn} ${active ? s.thFilterBtnActive : ''}`}
            onClick={(e) => cf.openColFilter(colKey, e)} title="Lọc / Sắp xếp">
            <Filter size={10} />
          </button>
        )}
      </div>
    </th>
  )
}

// Dropdown (position:fixed) — đặt 1 lần trong panel; allRows = danh sách GỐC (chưa lọc).
export function ColFilterPortal({ cf, allRows }) {
  if (!cf.popup) return null
  return (
    <ColumnFilterDropdown
      colKey={cf.popup.colKey}
      filterType={cf.typeOf(cf.popup.colKey)}
      allRows={allRows}
      getDisplayLabel={cf.getDisplayLabel}
      currentFilter={cf.colFilters[cf.popup.colKey] ?? null}
      sortState={cf.sort}
      onSort={cf.handleColSort}
      onFilterChange={cf.handleColFilterChange}
      onClose={cf.closePopup}
      style={{ '--cfd-top': `${cf.popup.top}px`, '--cfd-left': `${cf.popup.left}px` }}
    />
  )
}
