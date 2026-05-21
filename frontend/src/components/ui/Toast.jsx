import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'
import s from './toast.module.css'

const TYPE_CONFIG = {
  success: { Icon: CheckCircle2, cls: s.toastSuccess },
  error:   { Icon: XCircle,      cls: s.toastError   },
  warning: { Icon: AlertTriangle, cls: s.toastWarning },
  info:    { Icon: Info,          cls: s.toastInfo    },
}

const NOTIF_ICON = {
  task_assigned:       { emoji: '📋', color: '#2563eb' },
  task_overdue:        { emoji: '⚠️', color: '#dc2626' },
  deadline_reminder:   { emoji: '🔔', color: '#d97706' },
  escalation:          { emoji: '🚨', color: '#dc2626' },
  morning_summary:     { emoji: '☀️', color: '#059669' },
  task_status_changed: { emoji: '🔄', color: '#7c3aed' },
}

function ToastItem({ toast, onRemove }) {
  const [leaving, setLeaving] = useState(false)
  const navigate = useNavigate()

  function close() {
    setLeaving(true)
    setTimeout(() => onRemove(toast.id), 240)
  }

  // Notification-type toast — rich card with emoji + title + body + optional navigation
  if (toast.notifType !== undefined) {
    const meta = NOTIF_ICON[toast.notifType] || { emoji: '🔔', color: '#64748b' }
    const clickable = Boolean(toast.taskId)

    function handleCardClick() {
      if (!clickable) return
      navigate(`/tasks/${toast.taskId}`)
      close()
    }

    return (
      <div
        className={`${s.toast} ${s.toastNotification} ${leaving ? s.toastLeaving : ''} ${clickable ? s.toastClickable : ''}`}
        onClick={handleCardClick}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        onKeyDown={clickable ? (e) => e.key === 'Enter' && handleCardClick() : undefined}
      >
        <span className={s.toastEmojiIcon} style={{ color: meta.color }}>{meta.emoji}</span>
        <div className={s.toastBody}>
          {toast.title && <div className={s.toastTitle}>{toast.title}</div>}
          <div className={toast.title ? s.toastMsg : s.toastMsgOnly}>{toast.message}</div>
        </div>
        <button
          className={s.toastClose}
          onClick={(e) => { e.stopPropagation(); close() }}
          aria-label="Đóng"
        >
          <X size={12} />
        </button>
      </div>
    )
  }

  const { Icon, cls } = TYPE_CONFIG[toast.type] || TYPE_CONFIG.success
  const hasTitle = Boolean(toast.title)

  return (
    <div className={`${s.toast} ${cls} ${leaving ? s.toastLeaving : ''}`}>
      <Icon size={16} className={s.toastIcon} />
      <div className={s.toastBody}>
        {hasTitle ? (
          <>
            <div className={s.toastTitle}>{toast.title}</div>
            <div className={s.toastMsg}>{toast.message}</div>
          </>
        ) : (
          <div className={s.toastMsgOnly}>{toast.message}</div>
        )}
      </div>
      <button className={s.toastClose} onClick={close} aria-label="Đóng">
        <X size={12} />
      </button>
    </div>
  )
}

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore()
  if (toasts.length === 0) return null
  return (
    <div className={s.container}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={removeToast} />
      ))}
    </div>
  )
}
