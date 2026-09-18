import { useState, useEffect, useRef } from 'react'
import Modal from './ui/Modal'
import { useToastStore } from '../stores/toastStore'
import { discussEntry } from '../api/rewardPenalty'
import s from './DiscussionModal.module.css'

const fmtT = (at) => { try { return new Date(at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) } catch { return '' } }

// Hội thoại giải trình (chat 2 chiều staff ↔ admin) trên 1 dòng thưởng/phạt.
export default function DiscussionModal({ entry, onClose, onPosted }) {
  const addToast = useToastStore((st) => st.toast)
  const [msgs, setMsgs] = useState(entry.discussion || [])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef(null)
  useEffect(() => { setMsgs(entry.discussion || []) }, [entry])
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight }, [msgs])

  async function send() {
    const t = text.trim(); if (!t) return
    setSending(true)
    try { const upd = await discussEntry(entry.id, t); setMsgs(upd.discussion || []); setText(''); onPosted?.(upd) }
    catch (e) { addToast(e.response?.data?.error?.message ?? 'Lỗi gửi giải trình', 'error') }
    finally { setSending(false) }
  }

  return (
    <Modal title="Giải trình / trao đổi" onClose={onClose} width="min(520px, calc(100vw - 32px))">
      <div className={s.head}>
        <span className={s.kind}>{entry.categoryLabel}</span>
        <span className={s.pts}>{entry.points > 0 ? `+${entry.points}` : entry.points} điểm</span>
      </div>
      <div className={s.list} ref={listRef}>
        {msgs.length === 0 && <div className={s.empty}>Chưa có nội dung. Nhập giải trình / phản hồi bên dưới…</div>}
        {msgs.map((m, i) => (
          <div key={i} className={`${s.msg} ${m.role === 'admin' ? s.admin : s.staff}`}>
            <div className={s.meta}><strong>{m.role === 'admin' ? 'Quản lý' : (m.name || 'Nhân viên')}</strong> · {fmtT(m.at)}</div>
            <div className={s.bubble}>{m.text}</div>
          </div>
        ))}
      </div>
      <div className={s.composer}>
        <textarea className={s.textarea} rows={2} value={text} placeholder="Nhập giải trình / phản hồi… (Ctrl+Enter để gửi)"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send() }} />
        <button className={s.send} onClick={send} disabled={sending || !text.trim()}>{sending ? 'Đang gửi…' : 'Gửi'}</button>
      </div>
    </Modal>
  )
}
