import { useState, useEffect, useCallback } from 'react'
import { Loader2, CalendarPlus, AlertTriangle, RefreshCw } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { getSchedulePeriods, backfillSchedulePeriods } from '../../api/schedules'
import { useToastStore } from '../../stores/toastStore'
import s from '../Companies/companies.module.css'

// yyyy-MM-dd → dd/mm/yyyy (luôn hiển thị đúng chuẩn VN)
const fmt = (str) => {
  if (!str) return '—'
  const [y, m, d] = str.split('-')
  return `${d}/${m}/${y}`
}

const MONTH_OPTS = [3, 6, 12, 24]

// Sinh bù kỳ cho MỘT lịch định kỳ: đối chiếu kỳ "đáng lẽ có" vs "đã có task",
// admin tích các kỳ THIẾU rồi bấm "Sinh bù". Chế độ force: sinh lại cả kỳ đã có.
export default function BackfillPeriodsModal({ schedule, onClose, onDone }) {
  const addToast = useToastStore((st) => st.toast)
  const [months, setMonths]       = useState(6)
  const [loading, setLoading]     = useState(true)
  const [data, setData]           = useState(null)
  const [selected, setSelected]   = useState(() => new Set())
  const [force, setForce]         = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback((m) => {
    setLoading(true)
    getSchedulePeriods(schedule.scheduleId, m)
      .then((res) => {
        setData(res)
        // Mặc định chọn sẵn các kỳ THIẾU cho tiện
        setSelected(new Set(res.periods.filter((p) => !p.exists).map((p) => p.forDate)))
      })
      .catch((err) => addToast(err.response?.data?.error?.message ?? 'Không tải được danh sách kỳ', 'error'))
      .finally(() => setLoading(false))
  }, [schedule.scheduleId, addToast])

  useEffect(() => { load(months) }, [months, load])

  // Khi tắt force → bỏ chọn mọi kỳ ĐÃ CÓ (chỉ còn kỳ thiếu được phép chọn)
  useEffect(() => {
    if (force || !data) return
    setSelected((prev) => {
      const next = new Set(prev)
      for (const p of data.periods) if (p.exists) next.delete(p.forDate)
      return next
    })
  }, [force, data])

  function toggle(p) {
    if (p.exists && !force) return                 // kỳ đã có: chỉ chọn được khi bật force
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(p.forDate) ? next.delete(p.forDate) : next.add(p.forDate)
      return next
    })
  }

  async function submit() {
    if (selected.size === 0) return
    setSubmitting(true)
    try {
      const res = await backfillSchedulePeriods(schedule.scheduleId, [...selected], force)
      const c = res.created?.length ?? 0
      const sk = res.skipped?.length ?? 0
      if (c > 0) addToast(`Đã sinh ${c} công việc${sk ? ` · bỏ qua ${sk} kỳ đã có` : ''}`, 'success')
      else addToast(sk ? `Không sinh mới — ${sk} kỳ đã có task` : 'Không có kỳ nào được sinh', 'warning')
      onDone?.()
      load(months)                                  // tải lại để cập nhật trạng thái
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Sinh bù kỳ thất bại', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const periods = data?.periods ?? []
  const missingCount = data?.missingCount ?? 0

  return (
    <Modal
      title={`Sinh bù kỳ — ${schedule.taskTypeName}`}
      onClose={onClose}
      width="92vw"
      maxWidth={920}
    >
      <div style={{ padding: '4px 0' }}>
        {/* Thông tin lịch */}
        <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--color-muted)', marginBottom: 10 }}>
          <strong style={{ color: '#1e3a8a' }}>{schedule.companyName}</strong>
          {data?.periodOffset ? (
            <span> · Độ lệch kỳ: {data.periodOffset > 0 ? `+${data.periodOffset}` : data.periodOffset}</span>
          ) : null}
        </div>

        <div className={s.securityBanner} style={{ marginBottom: 12 }}>
          <CalendarPlus size={16} style={{ flexShrink: 0 }} />
          <span>
            Đối chiếu các <strong>kỳ đáng lẽ phải có</strong> (theo công thức lặp) với <strong>kỳ đã có task</strong>.
            Tích các <strong>kỳ thiếu</strong> rồi bấm “Sinh bù”. Ngày bắt đầu/hạn chót được tính đúng như bộ sinh tự động.
          </span>
        </div>

        {/* Điều khiển */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-2xs)' }}>
            Khoảng lùi:
            <select
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              className={s.formInput}
              style={{ width: 110, height: 32 }}
            >
              {MONTH_OPTS.map((m) => <option key={m} value={m}>{m} tháng</option>)}
            </select>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-2xs)', cursor: 'pointer' }}>
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
            Sinh lại cả kỳ đã có (force)
          </label>

          <button className={s.btnGhost} style={{ height: 32 }} onClick={() => load(months)} disabled={loading}>
            <RefreshCw size={13} /> Tải lại
          </button>
        </div>

        {force && (
          <div className={s.securityBanner}
               style={{ marginBottom: 12, background: '#fff7ed', borderColor: '#fed7aa', color: '#9a3412' }}>
            <AlertTriangle size={15} style={{ flexShrink: 0 }} />
            <span><strong>Chế độ force:</strong> sinh lại kể cả kỳ đã có task → có thể tạo <strong>task trùng nhãn kỳ</strong>. Chỉ dùng cho ca đặc biệt.</span>
          </div>
        )}

        {loading ? (
          <div className={s.loadingCenter}>
            <Loader2 size={18} className={s.spin} style={{ marginRight: 8 }} /> Đang tải...
          </div>
        ) : (
          <>
            <div className={s.credTableWrap} style={{ maxHeight: '52vh', overflowY: 'auto' }}>
              <table className={s.credTable}>
                <colgroup>
                  <col style={{ width: 44 }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '22%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th></th>
                    <th>Kỳ</th>
                    <th>Ngày phát sinh</th>
                    <th>Bắt đầu</th>
                    <th>Hạn chót</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 16, color: 'var(--color-muted)' }}>
                      Không có kỳ nào trong khoảng đã chọn.
                    </td></tr>
                  ) : periods.map((p) => {
                    const selectable = !p.exists || force
                    const checked = selected.has(p.forDate)
                    return (
                      <tr key={p.forDate}
                          style={{ background: !p.exists ? '#fefce8' : undefined, opacity: selectable ? 1 : 0.7 }}>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!selectable}
                            onChange={() => toggle(p)}
                          />
                        </td>
                        <td style={{ fontWeight: 700 }}>{p.periodLabel}</td>
                        <td>{fmt(p.forDate)}</td>
                        <td>{fmt(p.startDate)}</td>
                        <td>{fmt(p.dueDate)}</td>
                        <td>
                          {p.exists ? (
                            <span title={p.existingTitle || ''} style={{ color: '#047857', fontWeight: 600, fontSize: 'var(--fs-3xs)' }}>
                              ✓ Đã có task
                            </span>
                          ) : (
                            <span style={{ color: '#b45309', fontWeight: 700, fontSize: 'var(--fs-3xs)' }}>
                              ● Thiếu
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--color-muted)' }}>
                <strong style={{ color: missingCount ? '#b45309' : '#047857' }}>{missingCount}</strong> kỳ thiếu
                {' · '}đã chọn <strong>{selected.size}</strong>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className={s.btnGhost} onClick={onClose} disabled={submitting}>Đóng</button>
                <button className={s.btnPrimary} onClick={submit} disabled={submitting || selected.size === 0}>
                  {submitting ? <Loader2 size={14} className={s.spin} /> : <CalendarPlus size={14} />}
                  Sinh bù ({selected.size})
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
