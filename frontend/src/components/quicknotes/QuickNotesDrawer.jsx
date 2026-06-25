import { StickyNote, X } from 'lucide-react'
import QuickNotes from './QuickNotes'
import s from './quickNotes.module.css'

// Ngăn trượt bên phải cho desktop (mở từ icon trên Header).
export default function QuickNotesDrawer({ open, onClose }) {
  if (!open) return null
  return (
    <>
      <div className={s.backdrop} onClick={onClose} />
      <aside className={s.drawer} role="dialog" aria-label="Ghi chú nhanh">
        <div className={s.drawerHead}>
          <span className={s.drawerTitle}><StickyNote size={16} /> Ghi chú nhanh</span>
          <button className={s.iconBtn} onClick={onClose} aria-label="Đóng"><X size={16} /></button>
        </div>
        <QuickNotes />
      </aside>
    </>
  )
}
