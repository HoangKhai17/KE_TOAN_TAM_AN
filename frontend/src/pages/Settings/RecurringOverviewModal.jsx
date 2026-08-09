import { useState, useEffect, useMemo, Fragment } from 'react'
import { Loader2, Search, ShieldAlert, CalendarPlus } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { getRecurringOverview, setScheduleMaxDueDay } from '../../api/schedules'
import { useToastStore } from '../../stores/toastStore'
import { useEnumsStore } from '../../hooks/useEnums'
import { MultiSelectFilter, isGroupValue, stripGroup, BUSINESS_TYPE_LABELS } from '../Companies/Companies'
import BackfillPeriodsModal from './BackfillPeriodsModal'
import s from '../Companies/companies.module.css'

const RECUR_LABEL = {
  daily: 'Hàng ngày', weekly: 'Hàng tuần', monthly_by_date: 'Hàng tháng (theo ngày)',
  monthly_by_weekday: 'Hàng tháng (theo thứ)', monthly_last_day: 'Cuối tháng',
  quarterly: 'Hàng quý', yearly: 'Hàng năm', custom_dates: 'Ngày tùy chọn', once: 'Một lần',
}

// Console tập trung (admin): mỗi LỊCH định kỳ = 1 dòng, gộp nhóm theo công ty.
// Đặt trần "ngày N hàng tháng" (1–31) cho từng lịch — có lịch có, có lịch không.
export default function RecurringOverviewModal({ onClose }) {
  const addToast = useToastStore((st) => st.toast)
  const [rows, setRows]       = useState([])
  const [drafts, setDrafts]   = useState({})   // scheduleId → giá trị ô đang gõ
  const [loading, setLoading] = useState(true)
  const [q, setQ]             = useState('')
  const [btFilter, setBtFilter] = useState([])   // lọc loại hình DN (mã lựa chọn + 'g:nhóm')
  const [savingId, setSavingId] = useState(null)
  const [backfillFor, setBackfillFor] = useState(null)   // lịch đang mở popup "Sinh bù kỳ"

  const loadEnums = useEnumsStore((st) => st.load)
  const getOptions = useEnumsStore((st) => st.getOptions)
  const getGroups  = useEnumsStore((st) => st.getGroups)
  const getLabel   = useEnumsStore((st) => st.getLabel)
  const enumsLoaded = useEnumsStore((st) => st.loaded)

  useEffect(() => { loadEnums() }, [loadEnums])

  useEffect(() => {
    let cancelled = false
    getRecurringOverview()
      .then((list) => {
        if (cancelled) return
        setRows(list)
        setDrafts(Object.fromEntries(list.map((r) => [r.scheduleId, r.maxDueDay ?? ''])))
      })
      .catch(() => { if (!cancelled) addToast('Không tải được danh sách lịch định kỳ', 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [addToast])

  // Options + nhóm loại hình DN cho bộ lọc (dùng chung enum 'business_type' như Companies)
  const btOptions = useMemo(() => {
    const opts = getOptions('business_type')
    if (opts.length) return opts.map((o) => ({ value: o.key, label: o.label, groupKey: o.groupKey ?? null }))
    return Object.entries(BUSINESS_TYPE_LABELS).map(([value, label]) => ({ value, label }))
  }, [getOptions, enumsLoaded])
  const btGroups = useMemo(() => getGroups('business_type'), [getGroups, enumsLoaded])
  // Mã loại hình → nhóm (để lọc theo nhóm)
  const btOptionGroup = useMemo(() => {
    const m = {}
    for (const o of getOptions('business_type')) m[o.key] = o.groupKey ?? null
    return m
  }, [getOptions, enumsLoaded])
  const btLabel = (key) => key ? getLabel('business_type', key, BUSINESS_TYPE_LABELS[key] ?? key) : '—'

  // Lưu khi rời ô (blur) nếu giá trị đổi so với dữ liệu gốc
  async function commit(row) {
    const raw = drafts[row.scheduleId]
    const val = raw === '' || raw === null || raw === undefined ? '' : Number(raw)
    const orig = row.maxDueDay ?? ''
    if (String(val) === String(orig)) return           // không đổi → bỏ qua
    setSavingId(row.scheduleId)
    try {
      const res = await setScheduleMaxDueDay(row.scheduleId, val)
      setRows((prev) => prev.map((r) => r.scheduleId === row.scheduleId ? { ...r, maxDueDay: res.maxDueDay } : r))
      setDrafts((prev) => ({ ...prev, [row.scheduleId]: res.maxDueDay ?? '' }))
      addToast(res.maxDueDay ? `Đã đặt trần: ngày ${res.maxDueDay} hàng tháng` : 'Đã xoá trần ngày', 'success')
    } catch (err) {
      setDrafts((prev) => ({ ...prev, [row.scheduleId]: row.maxDueDay ?? '' }))  // rollback ô
      addToast(err.response?.data?.error?.message ?? 'Không lưu được trần ngày', 'error')
    } finally {
      setSavingId(null)
    }
  }

  function setDraft(scheduleId, v) {
    // chỉ cho số rỗng hoặc 1–31
    if (v === '') { setDrafts((p) => ({ ...p, [scheduleId]: '' })); return }
    let n = parseInt(v, 10)
    if (Number.isNaN(n)) return
    n = Math.max(1, Math.min(31, n))
    setDrafts((p) => ({ ...p, [scheduleId]: n }))
  }

  const kw = q.trim().toLowerCase()
  // Tách bộ lọc loại hình DN thành mã lựa chọn + mã nhóm (tiền tố 'g:')
  const btOptSel = new Set(btFilter.filter((v) => !isGroupValue(v)))
  const btGrpSel = new Set(btFilter.filter(isGroupValue).map(stripGroup))
  const matchesBt = (r) => {
    if (btFilter.length === 0) return true
    if (btOptSel.has(r.businessType)) return true
    const g = btOptionGroup[r.businessType]
    return g != null && btGrpSel.has(g)
  }
  const filtered = rows.filter((r) =>
    (!kw || `${r.companyName} ${r.taskTypeName}`.toLowerCase().includes(kw)) && matchesBt(r))

  // Gộp nhóm theo công ty (giữ thứ tự đã sort từ backend)
  const groups = []
  for (const r of filtered) {
    let g = groups[groups.length - 1]
    if (!g || g.companyId !== r.companyId) { g = { companyId: r.companyId, companyName: r.companyName, businessType: r.businessType, items: [] }; groups.push(g) }
    g.items.push(r)
  }

  return (
    <Modal title="Lịch định kỳ toàn hệ thống" onClose={onClose} width="96vw" maxWidth={1680}>
      <div style={{ padding: '4px 0' }}>
        <div className={s.securityBanner} style={{ marginBottom: 12 }}>
          <ShieldAlert size={16} style={{ flexShrink: 0 }} />
          <span>
            Đặt <strong>trần ngày hoàn thành (ngày N hàng tháng)</strong> cho từng lịch định kỳ. Nhân viên không thể
            dời hạn công việc vượt ngày N của tháng (Admin không bị giới hạn). Để trống = không giới hạn.
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: 340, maxWidth: '100%' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--color-muted)' }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm công ty / loại công việc..."
              className={s.formInput}
              style={{ paddingLeft: 30 }}
            />
          </div>
          <div style={{ minWidth: 220 }}>
            <MultiSelectFilter
              options={btOptions}
              groups={btGroups}
              value={btFilter}
              onChange={setBtFilter}
              placeholder="Loại hình doanh nghiệp"
            />
          </div>
          {btFilter.length > 0 && (
            <button className={s.btnGhost} style={{ height: 32 }} onClick={() => setBtFilter([])}>
              Xoá lọc
            </button>
          )}
        </div>

        {loading ? (
          <div className={s.loadingCenter}>
            <Loader2 size={18} className={s.spin} style={{ marginRight: 8 }} /> Đang tải...
          </div>
        ) : (
          <div className={s.credTableWrap} style={{ maxHeight: '68vh', minHeight: 360, overflowY: 'auto' }}>
            <table className={s.credTable}>
              <colgroup>
                <col style={{ width: '30%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '19%' }} />
                <col style={{ width: '17%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Loại công việc (lịch)</th>
                  <th>Chu kỳ</th>
                  <th>Phụ trách</th>
                  <th>Trần ngày (hàng tháng)</th>
                  <th>Sinh bù kỳ</th>
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 16, color: 'var(--color-muted)' }}>
                    {rows.length === 0 ? 'Chưa có lịch định kỳ nào.' : 'Không tìm thấy.'}
                  </td></tr>
                ) : groups.map((g) => (
                  <Fragment key={g.companyId}>
                    <tr>
                      <td colSpan={5} style={{ background: '#f0f6ff', fontWeight: 700, color: '#1e3a8a' }}>
                        {g.companyName}
                        {g.businessType && (
                          <span style={{
                            marginLeft: 8, padding: '1px 8px', borderRadius: 10, fontWeight: 600,
                            fontSize: 'var(--fs-3xs)', background: '#dbeafe', color: '#1d4ed8',
                            verticalAlign: 'middle',
                          }}>
                            {btLabel(g.businessType)}
                          </span>
                        )}
                      </td>
                    </tr>
                    {g.items.map((r) => (
                      <tr key={r.scheduleId}>
                        <td title={r.taskTypeName} style={{ paddingLeft: 22 }}>{r.taskTypeName}</td>
                        <td>{RECUR_LABEL[r.recurrenceType] ?? r.recurrenceType}</td>
                        <td title={r.assignedStaffName || ''}>{r.assignedStaffName || <span className={s.credMuted}>—</span>}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                              type="number" min="1" max="31"
                              value={drafts[r.scheduleId] ?? ''}
                              placeholder="—"
                              className={s.formInput}
                              style={{ width: 90, height: 30 }}
                              onChange={(e) => setDraft(r.scheduleId, e.target.value)}
                              onBlur={() => commit(r)}
                            />
                            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-muted)' }}>hàng tháng</span>
                            {savingId === r.scheduleId && <Loader2 size={13} className={s.spin} />}
                          </div>
                        </td>
                        <td>
                          <button
                            className={s.btnOutline}
                            style={{ height: 30, padding: '0 12px', fontSize: 'var(--fs-3xs)' }}
                            onClick={() => setBackfillFor(r)}
                            title="Đối chiếu & sinh bù các kỳ còn thiếu"
                          >
                            <CalendarPlus size={13} /> Kỳ thiếu
                          </button>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {backfillFor && (
        <BackfillPeriodsModal
          schedule={backfillFor}
          onClose={() => setBackfillFor(null)}
        />
      )}
    </Modal>
  )
}
