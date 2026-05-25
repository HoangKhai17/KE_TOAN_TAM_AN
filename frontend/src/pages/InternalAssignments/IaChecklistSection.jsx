import { useState, useEffect } from 'react'
import { Plus, CheckSquare, Trash2, Loader2, Check } from 'lucide-react'
import * as api from '../../api/internalAssignments'
import { useToastStore } from '../../stores/toastStore'
import s from './internalAssignments.module.css'

export default function IaChecklistSection({ assignmentId, readOnly = false }) {
  const addToast = useToastStore((st) => st.toast)
  const [items,     setItems]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [newText,   setNewText]   = useState('')
  const [adding,    setAdding]    = useState(false)
  const [showInput, setShowInput] = useState(false)
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

  async function handleAdd(e) {
    e.preventDefault()
    if (!newText.trim()) return
    setAdding(true)
    try {
      const item = await api.addChecklistItem(assignmentId, newText.trim())
      setItems((prev) => [...prev, item])
      setNewText('')
      setShowInput(false)
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
        {!readOnly && !showInput && (
          <button className={s.checkAddBtn} onClick={() => setShowInput(true)}>
            <Plus size={12} /> Thêm
          </button>
        )}
      </div>

      {totalCount > 0 && (
        <div className={s.checkProgressBar}>
          <div
            className={s.checkProgressFill}
            style={{ width: `${totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0}%` }}
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

      {items.length === 0 && !showInput && (
        <p className={s.checkEmpty}>Chưa có mục nào trong checklist.</p>
      )}

      {showInput && (
        <form onSubmit={handleAdd} className={s.checkAddForm}>
          <input
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            className={s.checkAddInput}
            placeholder="Nhập nội dung công việc..."
            autoFocus
          />
          <div className={s.checkAddActions}>
            <button
              type="button"
              className={s.btnSecondary}
              style={{ height: 32, padding: '0 12px', fontSize: 12 }}
              onClick={() => { setShowInput(false); setNewText('') }}
              disabled={adding}
            >
              Huỷ
            </button>
            <button
              type="submit"
              className={s.btnPrimary}
              style={{ height: 32, padding: '0 12px', fontSize: 12 }}
              disabled={adding || !newText.trim()}
            >
              {adding ? <Loader2 size={12} className={s.spinIcon} /> : <Check size={12} />}
              Thêm
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
