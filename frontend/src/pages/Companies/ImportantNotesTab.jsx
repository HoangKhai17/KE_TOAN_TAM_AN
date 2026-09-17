import { useState, useEffect, useMemo, useCallback } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import * as companyTablesApi from '../../api/companyTables'
import CustomTableTab from './CustomTableTab'
import s from './companies.module.css'

// Tab "Điều cần lưu ý" (Hồ sơ) — TÁI DÙNG engine bảng cột-động, lọc section='important_note'.
// Mỗi NHÓM là 1 def (tab con); mỗi tab hiển thị bảng động theo cột của def đó. Dữ liệu nằm chung
// engine company_table_* nhưng KHÔNG lẫn sang tab "Bảng dữ liệu" (khác section).
export default function ImportantNotesTab({ company, onCountChange }) {
  const [defs, setDefs]       = useState([])
  const [activeId, setActiveId] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    return companyTablesApi.listDefs({ activeOnly: true, section: 'important_note' })
      .then((d) => {
        setDefs(d)
        setActiveId((prev) => (prev && d.some((x) => x.id === prev))
          ? prev
          : (d.find((x) => !x.parentDefId)?.id ?? null))
      })
      .catch(() => setDefs([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { setLoading(true); load() }, [company.id, load])

  // Badge tổng số dòng (mọi nhóm) — nạp nhẹ khi mount/đổi công ty/đổi cấu trúc nhóm.
  useEffect(() => {
    if (!onCountChange) return
    const tops = defs.filter((d) => !d.parentDefId)
    if (tops.length === 0) { onCountChange(0); return }
    let cancelled = false
    Promise.all(tops.map((d) => companyTablesApi.listRows(company.id, d.id).catch(() => [])))
      .then((lists) => { if (!cancelled) onCountChange(lists.reduce((n, l) => n + l.length, 0)) })
    return () => { cancelled = true }
  }, [defs, company.id, onCountChange])

  const topDefs = useMemo(() => defs.filter((d) => !d.parentDefId), [defs])
  const activeDef = useMemo(() => defs.find((d) => d.id === activeId) ?? null, [defs, activeId])
  const clusterDefs = useMemo(() => {
    const topId = activeDef?.parentDefId ?? activeDef?.id ?? null
    if (!topId) return []
    const top = defs.find((d) => d.id === topId)
    const children = defs.filter((d) => d.parentDefId === topId)
    return top ? [top, ...children] : []
  }, [defs, activeDef])

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
      <Loader2 size={14} className={s.spin} /> Đang tải…
    </div>
  }

  if (topDefs.length === 0) {
    return <div style={{ padding: 24, color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
      <AlertTriangle size={15} /> Chưa có nhóm điều cần lưu ý. Vào <strong style={{ margin: '0 4px' }}>Settings → Hồ sơ → Nhóm điều cần lưu ý</strong> để tạo nhóm &amp; cột.
    </div>
  }

  return (
    <div>
      {/* Tab nhóm (dùng lại style segmented như trước) */}
      <div className={s.procSeg} style={{ marginBottom: 12 }}>
        {topDefs.map((d) => (
          <button
            key={d.id}
            className={`${s.procSegBtn} ${activeId === d.id ? s.procSegBtnActive : ''}`}
            onClick={() => setActiveId(d.id)}
          >
            {d.name}
          </button>
        ))}
      </div>

      {activeDef && (
        <CustomTableTab
          key={activeDef.id}
          def={activeDef}
          company={company}
          onDefUpdated={load}
          clusterDefs={clusterDefs}
        />
      )}
    </div>
  )
}
