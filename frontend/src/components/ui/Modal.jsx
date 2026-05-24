import { useEffect } from 'react'
import s from './Modal.module.css'

export default function Modal({ title, onClose, children, wide = false, maxWidth }) {
  useEffect(() => {
    function handler(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className={s.overlay}>
      <div className={s.backdrop} onClick={onClose} />
      <div
        className={`${s.dialog} ${wide ? s.dialogWide : ''}`}
        style={maxWidth ? { maxWidth } : undefined}
      >
        <div className={s.header}>
          <h3 className={s.title}>{title}</h3>
          <button
            onClick={onClose}
            className={s.closeButton}
            aria-label="Đóng"
          >
            ×
          </button>
        </div>
        <div className={s.body}>
          {children}
        </div>
      </div>
    </div>
  )
}
