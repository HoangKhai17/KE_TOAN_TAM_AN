import { useState, useEffect, Fragment } from 'react'
import { Loader2, Search, ShieldAlert } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { getRecurringOverview, setScheduleMaxDueDay } from '../../api/schedules'
import { useToastStore } from '../../stores/toastStore'
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
  const [savingId, setSavingId] = useState(null)

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
  const filtered = kw
    ? rows.filter((r) => `${r.companyName} ${r.taskTypeName}`.toLowerCase().includes(kw))
    : rows

  // Gộp nhóm theo công ty (giữ thứ tự đã sort từ backend)
  const groups = []
  for (const r of filtered) {
    let g = groups[groups.length - 1]
    if (!g || g.companyId !== r.companyId) { g = { companyId: r.companyId, companyName: r.companyName, items: [] }; groups.push(g) }
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

        <div style={{ position: 'relative', marginBottom: 12, maxWidth: 340 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--color-muted)' }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm công ty / loại công việc..."
            className={s.formInput}
            style={{ paddingLeft: 30 }}
          />
        </div>

        {loading ? (
          <div className={s.loadingCenter}>
            <Loader2 size={18} className={s.spin} style={{ marginRight: 8 }} /> Đang tải...
          </div>
        ) : (
          <div className={s.credTableWrap} style={{ maxHeight: '68vh', minHeight: 360, overflowY: 'auto' }}>
            <table className={s.credTable}>
              <colgroup>
                <col style={{ width: '38%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '20%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Loại công việc (lịch)</th>
                  <th>Chu kỳ</th>
                  <th>Phụ trách</th>
                  <th>Trần ngày (hàng tháng)</th>
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: 16, color: 'var(--color-muted)' }}>
                    {rows.length === 0 ? 'Chưa có lịch định kỳ nào.' : 'Không tìm thấy.'}
                  </td></tr>
                ) : groups.map((g) => (
                  <Fragment key={g.companyId}>
                    <tr>
                      <td colSpan={4} style={{ background: '#f0f6ff', fontWeight: 700, color: '#1e3a8a' }}>
                        {g.companyName}
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
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  )
}
