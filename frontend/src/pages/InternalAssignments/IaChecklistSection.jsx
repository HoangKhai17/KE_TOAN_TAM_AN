import { useState, useEffect, useRef } from 'react'
import { CheckSquare, Trash2, Loader2, Check } from 'lucide-react'
import * as api from '../../api/internalAssignments'
import { useToastStore } from '../../stores/toastStore'
import s from './internalAssignments.module.css'

export default function IaChecklistSection({ assignmentId, readOnly = false }) {
  const addToast  = useToastStore((st) => st.toast)
  const inputRef  = useRef(null)
  const [items,      setItems]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [newText,    setNewText]    = useState('')
  const [adding,     setAdding]     = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [togglingId, setTogglingId] = useState(null)

  useEffect(() => {
    api.getChecklist(assignmentId)
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [assignmentId])

  const doneCount  = items.filter((i) => i.isDone).length
  const totalCount = items.length

  async function handleToggle(item) {
    setTogglingId(item.id)
    try {
      const updated = await api.updateChecklistItem(assignmentId, item.id, { isDone: !item.isDone })
      setItems((prev) => prev.map((i) => i.id === updated.id ? updated : i))
    } catch {
      addToast('Không thể cập nhật', 'error')
    } finally {
      setTogglingId(null)
    }
  }

  async function handleAdd() {
    if (!newText.trim()) return
    setAdding(true)
    try {
      const item = await api.addChecklistItem(assignmentId, newText.trim())
      setItems((prev) => [...prev, item])
      setNewText('')
      inputRef.current?.focus()
    } catch {
      addToast('Không thể thêm mục', 'error')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id) {
    setDeletingId(id)
    try {
      await api.deleteChecklistItem(assignmentId, id)
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch {
      addToast('Không thể xóa mục', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) return null

  return (
    <div className={s.checkSection}>
      <div className={s.checkHeader}>
        <span className={s.checkTitle}>
          <CheckSquare size={12} />
          Checklist
          {totalCount > 0 && (
            <span className={s.checkCount}>{doneCount}/{totalCount}</span>
          )}
        </span>
      </div>

      {totalCount > 0 && (
        <div className={s.checkProgressBar}>
          <div
            className={s.checkProgressFill}
            style={{ width: `${Math.round((doneCount / totalCount) * 100)}%` }}
          />
        </div>
      )}

      {items.length > 0 && (
        <div className={s.checkList}>
          {items.map((item) => (
            <div key={item.id} className={`${s.checkItem} ${item.isDone ? s.checkItemDone : ''}`}>
              <button
                className={`${s.checkBox} ${item.isDone ? s.checkBoxDone : ''}`}
                onClick={() => !readOnly && handleToggle(item)}
                disabled={togglingId === item.id || readOnly}
              >
                {togglingId === item.id
                  ? <Loader2 size={11} className={s.spinIcon} />
                  : item.isDone ? <Check size={11} /> : null
                }
              </button>
              <span className={s.checkItemText}>{item.text}</span>
              {!readOnly && (
                <button
                  className={s.checkDelBtn}
                  onClick={() => handleDelete(item.id)}
                  disabled={deletingId === item.id}
                >
                  {deletingId === item.id
                    ? <Loader2 size={11} className={s.spinIcon} />
                    : <Trash2 size={11} />
                  }
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {items.length === 0 && readOnly && (
        <p className={s.checkEmpty}>Chưa có mục nào trong checklist.</p>
      )}

      {!readOnly && (
        <div className={s.checkInlineAdd}>
          <input
            ref={inputRef}
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
            className={s.checkInlineInput}
            placeholder="Thêm công việc… (Enter để lưu)"
            disabled={adding}
          />
        </div>
      )}
    </div>
  )
}
