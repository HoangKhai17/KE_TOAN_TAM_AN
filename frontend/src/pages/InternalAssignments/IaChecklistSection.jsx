import { useState, useEffect, useRef } from 'react'
import { CheckSquare, Trash2, Loader2, Check, GripVertical, ChevronLeft, ChevronRight, X, Plus } from 'lucide-react'
import * as api from '../../api/internalAssignments'
import { useToastStore } from '../../stores/toastStore'
import { SortableList, SortableItem } from '../../components/ui/SortableList'
import s from './internalAssignments.module.css'

// Checklist trong Quick view — sửa được đầy đủ như form Tạo phiếu:
// phân cấp cha/con (◄►), kéo-thả sắp xếp, Alt/Shift+Enter xuống dòng, click sửa nội dung.
export default function IaChecklistSection({ assignmentId, readOnly = false }) {
  const addToast   = useToastStore((st) => st.toast)
  const newRef     = useRef(null)
  const [items,      setItems]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [newText,    setNewText]    = useState('')
  const [adding,     setAdding]     = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [togglingId, setTogglingId] = useState(null)
  const [editingId,  setEditingId]  = useState(null)
  const [editText,   setEditText]   = useState('')

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
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
    } catch { addToast('Không thể cập nhật', 'error') } finally { setTogglingId(null) }
  }

  async function handleAdd() {
    const text = newText.trim()
    if (!text) return
    setAdding(true)
    try {
      const item = await api.addChecklistItem(assignmentId, text, 0)
      setItems((prev) => [...prev, item])
      setNewText('')
      newRef.current?.focus()
    } catch { addToast('Không thể thêm mục', 'error') } finally { setAdding(false) }
  }

  async function handleToggleLevel(item) {
    const level = item.level === 1 ? 0 : 1
    try {
      const updated = await api.updateChecklistItem(assignmentId, item.id, { level })
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
    } catch { addToast('Không thể đổi cấp', 'error') }
  }

  function startEdit(it) { setEditingId(it.id); setEditText(it.text) }
  function cancelEdit() { setEditingId(null); setEditText('') }
  async function saveEdit(it) {
    const text = editText.trim()
    if (!text || text === it.text) { cancelEdit(); return }
    try {
      const updated = await api.updateChecklistItem(assignmentId, it.id, { text })
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
    } catch { addToast('Không thể sửa', 'error') } finally { cancelEdit() }
  }

  function handleReorder(newIds) {
    const prev = items
    setItems(newIds.map((id) => prev.find((i) => i.id === id)))   // optimistic
    api.reorderChecklist(assignmentId, newIds).catch(() => {
      setItems(prev)
      addToast('Không thể lưu thứ tự', 'error')
    })
  }

  async function handleDelete(id) {
    setDeletingId(id)
    try {
      await api.deleteChecklistItem(assignmentId, id)
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch { addToast('Không thể xóa mục', 'error') } finally { setDeletingId(null) }
  }

  if (loading) return null

  // Một dòng checklist (dùng chung cho chế độ sửa + chỉ đọc)
  const renderRow = (item, handleProps) => {
    const isChild = item.level === 1
    return (
      <div className={`${s.iaClItem} ${isChild ? s.iaClItemChild : ''} ${item.isDone ? s.checkItemDone : ''}`}>
        {!readOnly && (
          <>
            <button type="button" className={s.iaClDrag} title="Kéo để sắp xếp" {...handleProps}><GripVertical size={12} /></button>
            <button type="button" className={s.iaClIndent} onClick={() => handleToggleLevel(item)}
              title={isChild ? 'Đưa lên mục chính' : 'Thụt thành mục phụ'}>
              {isChild ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
            </button>
          </>
        )}
        <button
          className={`${s.checkBox} ${item.isDone ? s.checkBoxDone : ''}`}
          onClick={() => !readOnly && handleToggle(item)}
          disabled={togglingId === item.id || readOnly}
        >
          {togglingId === item.id ? <Loader2 size={11} className={s.spinIcon} /> : item.isDone ? <Check size={11} /> : null}
        </button>
        {editingId === item.id ? (
          <textarea
            autoFocus rows={2} value={editText}
            className={s.iaClInput} style={{ whiteSpace: 'pre-wrap', resize: 'vertical' }}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={() => saveEdit(item)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.altKey && !e.shiftKey) { e.preventDefault(); saveEdit(item) }
              if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
            }}
          />
        ) : (
          <span
            className={s.iaClText}
            style={{ whiteSpace: 'pre-wrap', cursor: readOnly ? 'default' : 'text' }}
            onClick={() => !readOnly && startEdit(item)}
            title={readOnly ? undefined : 'Nhấp để sửa'}
          >
            {item.text}
          </span>
        )}
        {!readOnly && (
          <button type="button" className={s.iaClDel} onClick={() => handleDelete(item.id)} disabled={deletingId === item.id} title="Xóa bước này">
            {deletingId === item.id ? <Loader2 size={11} className={s.spinIcon} /> : <X size={11} />}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className={s.checkSection}>
      <div className={s.checkHeader}>
        <span className={s.checkTitle}>
          <CheckSquare size={12} />
          Checklist
          {totalCount > 0 && <span className={s.checkCount}>{doneCount}/{totalCount}</span>}
        </span>
      </div>

      {totalCount > 0 && (
        <div className={s.checkProgressBar}>
          <div className={s.checkProgressFill} style={{ width: `${Math.round((doneCount / totalCount) * 100)}%` }} />
        </div>
      )}

      {items.length > 0 && (
        <div className={s.iaClList}>
          {readOnly ? (
            items.map((item) => <div key={item.id}>{renderRow(item, null)}</div>)
          ) : (
            <SortableList ids={items.map((i) => i.id)} onReorder={handleReorder}>
              {items.map((item) => (
                <SortableItem key={item.id} id={item.id}>
                  {({ setNodeRef, style, handleProps }) => (
                    <div ref={setNodeRef} style={style}>{renderRow(item, handleProps)}</div>
                  )}
                </SortableItem>
              ))}
            </SortableList>
          )}
        </div>
      )}

      {items.length === 0 && readOnly && (
        <p className={s.checkEmpty}>Chưa có mục nào trong checklist.</p>
      )}

      {!readOnly && (
        <div className={s.iaClAdd}>
          <Plus size={12} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
          <textarea
            ref={newRef} value={newText} rows={2}
            className={s.iaClInput} style={{ resize: 'vertical' }}
            placeholder="Thêm bước công việc… (Enter để thêm · Alt/Shift+Enter xuống dòng)"
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.altKey && !e.shiftKey) { e.preventDefault(); handleAdd() } }}
            disabled={adding}
          />
          {newText.trim() && (
            <button type="button" className={s.iaClAddBtn} onClick={handleAdd} disabled={adding}>Thêm</button>
          )}
        </div>
      )}
    </div>
  )
}
