import { useEffect } from 'react'
import s from './Modal.module.css'

export default function Modal({ title, onClose, children, wide = false, maxWidth, width }) {
  useEffect(() => {
    function handler(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const inlineStyle = {}
  if (maxWidth) inlineStyle.maxWidth = maxWidth
  if (width)    inlineStyle.width    = width

  return (
    <div className={s.overlay}>
      <div className={s.backdrop} onClick={onClose} />
      <div
        className={`${s.dialog} ${wide ? s.dialogWide : ''}`}
        style={Object.keys(inlineStyle).length ? inlineStyle : undefined}
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
