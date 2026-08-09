import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'
import s from './DeleteConfirmDialog.module.css'

const DeleteConfirmContext = createContext(null)

const DEFAULT_OPTIONS = {
  title: 'Xác nhận xóa',
  message: 'Bạn có chắc chắn muốn xóa mục này?',
  warning: 'Hành động này không thể hoàn tác.',
  confirmLabel: 'Xóa',
  cancelLabel: 'Hủy',
}

/**
 * Popup xác nhận xóa duy nhất của hệ thống.
 * Có thể dùng trực tiếp hoặc thông qua useDeleteConfirm() (khuyến nghị).
 */
export function DeleteConfirmDialog({
  open,
  title = DEFAULT_OPTIONS.title,
  message = DEFAULT_OPTIONS.message,
  warning = DEFAULT_OPTIONS.warning,
  confirmLabel = DEFAULT_OPTIONS.confirmLabel,
  cancelLabel = DEFAULT_OPTIONS.cancelLabel,
  loading = false,
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const previousActiveElement = document.activeElement
    cancelRef.current?.focus()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !loading) onCancel?.()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousActiveElement?.focus?.()
    }
  }, [open, loading, onCancel])

  if (!open) return null

  return (
    <div className={s.overlay} role="presentation">
      <div className={s.backdrop} onClick={() => !loading && onCancel?.()} />
      <div
        className={s.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
        aria-describedby="delete-confirm-description"
      >
        <div className={s.iconWrap} aria-hidden="true">
          <AlertTriangle size={20} />
        </div>
        <div className={s.content}>
          <h3 id="delete-confirm-title" className={s.title}>{title}</h3>
          <div id="delete-confirm-description" className={s.message}>{message}</div>
          {warning && <p className={s.warning}>{warning}</p>}
        </div>
        <div className={s.actions}>
          <button
            ref={cancelRef}
            type="button"
            className={s.cancelButton}
            disabled={loading}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={s.deleteButton}
            disabled={loading}
            onClick={onConfirm}
          >
            {loading ? <Loader2 size={13} className={s.spinner} /> : <Trash2 size={13} />}
            {loading ? 'Đang xóa...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function DeleteConfirmProvider({ children }) {
  const [request, setRequest] = useState(null)
  const [loading, setLoading] = useState(false)

  const confirmDelete = useCallback((options = {}) => new Promise((resolve) => {
    setRequest({ ...DEFAULT_OPTIONS, ...options, resolve })
  }), [])

  const close = useCallback((result) => {
    if (loading) return
    setRequest((current) => {
      current?.resolve(result)
      return null
    })
  }, [loading])

  const handleConfirm = useCallback(async () => {
    if (!request || loading) return
    if (!request.onConfirm) {
      request.resolve(true)
      setRequest(null)
      return
    }

    setLoading(true)
    try {
      await request.onConfirm()
      request.resolve(true)
      setRequest(null)
    } catch (error) {
      request.resolve(false)
      setRequest(null)
      if (!request.handleError) throw error
      request.handleError(error)
    } finally {
      setLoading(false)
    }
  }, [loading, request])

  useEffect(() => () => {
    request?.resolve(false)
  }, [request])

  return (
    <DeleteConfirmContext.Provider value={confirmDelete}>
      {children}
      <DeleteConfirmDialog
        open={Boolean(request)}
        title={request?.title}
        message={request?.message}
        warning={request?.warning}
        confirmLabel={request?.confirmLabel}
        cancelLabel={request?.cancelLabel}
        loading={loading}
        onCancel={() => close(false)}
        onConfirm={handleConfirm}
      />
    </DeleteConfirmContext.Provider>
  )
}

export function useDeleteConfirm() {
  const confirmDelete = useContext(DeleteConfirmContext)
  if (!confirmDelete) {
    throw new Error('useDeleteConfirm phải được sử dụng bên trong DeleteConfirmProvider')
  }
  return confirmDelete
}

export default DeleteConfirmDialog
