import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Check, ChevronDown, Building2, AlertTriangle, Loader2, X, Download } from 'lucide-react'
import * as ctApi from '../../api/companyTables'
import { useCompanyOptions } from '../../hooks/useReferenceData'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import CustomTableTab from '../Companies/CustomTableTab'
import s from './Reports.module.css'

// Bảng quy trình mục tiêu — khớp theo tableKey (ổn định dù đổi tên hiển thị);
// fallback theo tên nếu tableKey đổi.
export const TARGET_DEF_KEY  = 'bc_theo_tien_do_cv'
export const TARGET_DEF_NAME = 'Quy trình & tiến độ SL SKT trên PMKT Misa'

// Tìm def mục tiêu trong danh sách defs (dùng chung cho tab Báo cáo + nhãn tab)
export function findProcessDef(defs = []) {
  const top = defs.filter((d) => !d.parentDefId)
  return top.find((d) => d.tableKey === TARGET_DEF_KEY)
    ?? top.find((d) => (d.name || '').trim().toLowerCase() === TARGET_DEF_NAME.toLowerCase())
    ?? null
}

// ── Bộ lọc công ty (multi-select, có tìm kiếm) ────────────────────────────────
function CompanyFilter({ options, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    function onDoc(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? options.filter((c) => (c.name || '').toLowerCase().includes(q) || (c.shortName || '').toLowerCase().includes(q)) : options
  }, [options, search])

  const toggle = (id) => {
    const n = new Set(selected)
    n.has(id) ? n.delete(id) : n.add(id)
    onChange(n)
  }

  return (
    <div className={s.companyFilterWrap} ref={wrapRef}>
      <button type="button" className={s.companyFilterBtn} onClick={() => setOpen((v) => !v)}>
        <Building2 size={13} />
        {selected.size === 0 ? 'Chọn công ty' : `${selected.size} công ty`}
        <ChevronDown size={13} style={{ marginLeft: 'auto' }} />
      </button>
      {open && (
        <div className={s.companyFilterMenu}>
          <div className={s.companyFilterSearch}>
            <Search size={13} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm công ty..." autoFocus />
            {search && <button onClick={() => setSearch('')}><X size={12} /></button>}
          </div>
          <div className={s.companyFilterActions}>
            <button onClick={() => onChange(new Set(options.map((c) => c.id)))}>Chọn tất cả</button>
            <button onClick={() => onChange(new Set())}>Bỏ chọn</button>
          </div>
          <div className={s.companyFilterList}>
            {filtered.length === 0 && <div className={s.companyFilterEmpty}>Không tìm thấy</div>}
            {filtered.map((c) => (
              <label key={c.id} className={s.companyFilterItem}>
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                <span>{c.name}</span>
                {c.rowCount > 0 && <span className={s.companyFilterCount}>{c.rowCount}</span>}
                {selected.has(c.id) && <Check size={13} className={s.companyFilterCheck} />}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Chỉ gắn (mount) bảng nặng khi khối cuộn vào vùng nhìn → chịu được nhiều công ty.
function LazyMount({ label, children }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || visible) return undefined
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) { setVisible(true); io.disconnect() }
    }, { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [visible])
  return (
    <div ref={ref} style={{ minHeight: visible ? undefined : 56 }}>
      {visible ? children : (
        <div className={s.lazyPlaceholder}>
          <Building2 size={14} /> {label || 'Cuộn tới để hiển thị bảng…'}
        </div>
      )}
    </div>
  )
}

export default function ProcessReportTab() {
  const user    = useAuthStore((st) => st.user)
  const addToast = useToastStore((st) => st.toast)
  const isAdmin = user?.role === 'admin'
  const [exporting, setExporting] = useState(false)

  // 1) Tìm bảng def mục tiêu
  const defsQuery = useQuery({
    queryKey: ['company-tables', 'defs', 'data'],
    queryFn: () => ctApi.listDefs({ section: 'data' }),
    staleTime: 5 * 60_000,
  })
  const def = useMemo(() => findProcessDef(defsQuery.data ?? []), [defsQuery.data])

  // 2) Công ty có dòng cho bảng này (mặc định chọn)
  const rowCompaniesQuery = useQuery({
    queryKey: ['company-tables', 'row-companies', def?.id],
    queryFn: () => ctApi.getRowCompanies(def.id),
    enabled: !!def,
    staleTime: 60_000,
  })
  const { data: allCompanies = [] } = useCompanyOptions()

  const rowCompanies = rowCompaniesQuery.data ?? []

  // Gộp danh sách lọc: tất cả công ty, kèm rowCount + ưu tiên thông tin từ rowCompanies.
  // RBAC: staff CHỈ thấy công ty mình phụ trách (cả danh sách lẫn bộ lọc).
  const companyMap = useMemo(() => {
    const m = new Map()
    const mine = (c) => isAdmin || c.assignedStaffId === user?.id
    for (const c of allCompanies) if (mine(c)) m.set(c.id, { id: c.id, name: c.name, shortName: c.shortName, assignedStaffId: c.assignedStaffId, rowCount: 0 })
    for (const c of rowCompanies) m.set(c.id, { id: c.id, name: c.name, shortName: c.shortName, assignedStaffId: c.assignedStaffId, rowCount: c.rowCount })
    return m
  }, [allCompanies, rowCompanies, isAdmin, user?.id])
  const filterOptions = useMemo(
    () => [...companyMap.values()].sort((a, b) => (b.rowCount - a.rowCount) || (a.name || '').localeCompare(b.name || '')),
    [companyMap],
  )

  // Mặc định chọn = các công ty CÓ dữ liệu
  const [selected, setSelected] = useState(null)
  useEffect(() => {
    if (selected === null && rowCompaniesQuery.isSuccess) {
      setSelected(new Set(rowCompanies.map((c) => c.id)))
    }
  }, [selected, rowCompaniesQuery.isSuccess, rowCompanies])
  const effectiveSelected = selected ?? new Set()

  const selectedCompanies = useMemo(
    () => [...effectiveSelected].map((id) => companyMap.get(id)).filter(Boolean)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [effectiveSelected, companyMap],
  )

  async function handleExportAll() {
    if (!def) return
    setExporting(true)
    try {
      await ctApi.exportAllCompanies(def.id, [...effectiveSelected])
      addToast('Đã xuất Excel tổng hợp', 'success')
    } catch {
      addToast('Xuất Excel tổng thất bại', 'error')
    } finally {
      setExporting(false)
    }
  }

  if (defsQuery.isLoading) {
    return <div className={s.centered}><Loader2 size={26} className={s.spin} /><p className={s.loadingText}>Đang tải...</p></div>
  }
  if (!def) {
    return (
      <div className={s.errorBox}>
        <AlertTriangle size={18} />
        Chưa tìm thấy bảng “{TARGET_DEF_NAME}”. Hãy tạo bảng này trong Cài đặt → Bảng dữ liệu, hoặc đổi tên cho khớp.
      </div>
    )
  }

  return (
    <div className={s.tabContent}>
      <div className={s.processToolbar}>
        <CompanyFilter options={filterOptions} selected={effectiveSelected} onChange={setSelected} />
        <button
          className={s.exportAllBtn}
          onClick={handleExportAll}
          disabled={exporting || effectiveSelected.size === 0}
          title="Xuất Excel tổng hợp tất cả công ty đang chọn"
        >
          {exporting ? <Loader2 size={14} className={s.spin} /> : <Download size={14} />}
          Xuất Excel tổng
        </button>
      </div>

      {selectedCompanies.length === 0 ? (
        <div className={s.emptyState}><p>Chọn công ty để hiển thị bảng quy trình.</p></div>
      ) : (
        <div className={s.processGroups}>
          {selectedCompanies.map((company) => (
            <section key={company.id} className={s.processGroup}>
              <LazyMount label={company.name}>
                <CustomTableTab def={def} company={company} title={company.name} />
              </LazyMount>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
