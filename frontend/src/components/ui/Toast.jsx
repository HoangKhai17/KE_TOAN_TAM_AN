import { useState } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'
import s from './toast.module.css'

const TYPE_CONFIG = {
  success: { Icon: CheckCircle2, cls: s.toastSuccess },
  error:   { Icon: XCircle,      cls: s.toastError   },
  warning: { Icon: AlertTriangle, cls: s.toastWarning },
  info:    { Icon: Info,          cls: s.toastInfo    },
}

function ToastItem({ toast, onRemove }) {
  const [leaving, setLeaving] = useState(false)

  function close() {
    setLeaving(true)
    setTimeout(() => onRemove(toast.id), 240)
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
