import { useState, useEffect } from 'react'
import Modal from './ui/Modal'
import { useRpAlertStore } from '../stores/rewardPenaltyAlert'
import { useToastStore } from '../stores/toastStore'
import { useEnumsStore } from '../hooks/useEnums'
import { explainEntry } from '../api/rewardPenalty'
import s from './RewardPenaltyAlert.module.css'

const fmtPts = (n) => (n == null) ? '—' : (n > 0 ? `+${n}` : `${n}`)

// Popup TOÀN CỤC: hiện ngay khi admin duyệt 1 dòng thưởng/phạt cho nhân viên (qua socket).
// Nhân viên bấm "Đồng ý" để đóng, hoặc nhập giải trình gửi lại cho quản lý xem xét.
export default function RewardPenaltyAlert() {
  const queue = useRpAlertStore((st) => st.queue)
  const dismiss = useRpAlertStore((st) => st.dismiss)
  const addToast = useToastStore((st) => st.toast)
  const getOptions = useEnumsStore((st) => st.getOptions)
  const loadEnums = useEnumsStore((st) => st.load)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  useEffect(() => { loadEnums() }, [loadEnums])
  const entry = queue[0]
  useEffect(() => { setText('') }, [entry?.id])
  if (!entry) return null

  const kindLabel = getOptions('reward_penalty_kind').find((o) => o.key === entry.kind)?.label ?? entry.kind
  const cls = entry.points > 0 ? s.reward : entry.points < 0 ? s.penalty : s.neutral
  const dateStr = entry.occurredOn ? new Date(entry.occurredOn).toLocaleDateString('vi-VN') : '—'

  async function submit() {
    if (!text.trim()) { addToast('Nhập nội dung giải trình', 'error'); return }
    setSending(true)
    try { await explainEntry(entry.id, text.trim()); addToast('Đã gửi giải trình cho quản lý', 'success'); dismiss() }
    catch (e) { addToast(e.response?.data?.error?.message ?? 'Lỗi gửi giải trình', 'error') }
    finally { setSending(false) }
  }

  return (
    <Modal title="🔔 Thông báo thưởng / phạt" onClose={dismiss} width="min(480px, calc(100vw - 32px))">
      <div className={s.wrap}>
        <div className={`${s.banner} ${cls}`}>
          <span className={s.kind}>{kindLabel}</span>
          <span className={s.points}>{fmtPts(entry.points)} điểm</span>
        </div>
        <div className={s.info}>
          <div className={s.row}><span className={s.lbl}>Nội dung</span><span className={s.val}>{entry.categoryLabel}</span></div>
          <div className={s.row}><span className={s.lbl}>Ngày</span><span className={s.val}>{dateStr}</span></div>
          {entry.note && <div className={s.row}><span className={s.lbl}>Ghi chú</span><span className={s.val}>{entry.note}</span></div>}
        </div>
        <label className={s.explainLbl}>Giải trình (tuỳ chọn) — gửi để quản lý xem xét lại</label>
        <textarea className={s.textarea} rows={3} value={text} placeholder="Nêu lý do nếu bạn thấy chưa hợp lý…" onChange={(e) => setText(e.target.value)} />
        <div className={s.actions}>
          <button className={s.btnGhost} onClick={submit} disabled={sending}>{sending ? 'Đang gửi…' : 'Gửi giải trình'}</button>
          <button className={s.btnPrimary} onClick={dismiss}>Đồng ý</button>
        </div>
        {queue.length > 1 && <div className={s.more}>còn {queue.length - 1} thông báo khác</div>}
      </div>
    </Modal>
  )
}
