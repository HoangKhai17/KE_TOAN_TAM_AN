import { useState, useEffect, useRef } from 'react'
import { Check, X, Edit2, Plus, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import * as cdrApi from '../../api/clientRequests'
import { useToastStore } from '../../stores/toastStore'
import { useDataSync } from '../../hooks/useDataSync'
import s from '../Tasks/tasks.module.css'

// Checklist gọn cho Yêu cầu KH (danh sách giấy tờ cần thu): thêm/tích/sửa/xoá + tiến độ %.
export default function CdrChecklist({ requestId, onProgress }) {
  const addToast = useToastStore((st) => st.toast)
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [newText, setNewText]   = useState('')
  const [adding, setAdding]     = useState(false)
  const [togglingIds, setTogglingIds] = useState(new Set())
  const [editId, setEditId]     = useState(null)
  const [editText, setEditText] = useState('')
  const [syncTick, setSyncTick] = useState(0)
  const newRef = useRef(null)

  useDataSync('data:cdr_checklist', (payload) => {
    if (payload.requestId === requestId) setSyncTick((k) => k + 1)
  }, [requestId])

  useEffect(() => {
    cdrApi.getCdrChecklist(requestId)
      .then((list) => { setItems(list); reportProgress(list) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [requestId, syncTick]) // eslint-disable-line react-hooks/exhaustive-deps

  function reportProgress(list) {
    const total = list.length
    const done = list.filter((i) => i.isCompleted).length
    onProgress?.({ total, done })
  }

  async function add() {
    const text = newText.trim()
    if (!text) return
    setAdding(true)
    try {
      const item = await cdrApi.addCdrChecklistItem(requestId, { stepText: text })
      const next = [...items, item]
      setItems(next); reportProgress(next)
      setNewText('')
      newRef.current?.focus()
    } catch { addToast('Không thể thêm mục', 'error') } finally { setAdding(false) }
  }

  async function toggle(item) {
    if (togglingIds.has(item.id)) return
    setTogglingIds((p) => new Set([...p, item.id]))
    try {
      const updated = await cdrApi.updateCdrChecklistItem(requestId, item.id, { isCompleted: !item.isCompleted })
      const next = items.map((i) => i.id === updated.id ? updated : i)
      setItems(next); reportProgress(next)
    } catch { addToast('Không thể cập nhật', 'error') }
    finally { setTogglingIds((p) => { const n = new Set(p); n.delete(item.id); return n }) }
  }

  async function saveEdit(id) {
    const text = editText.trim()
    if (!text) return
    try {
      const updated = await cdrApi.updateCdrChecklistItem(requestId, id, { stepText: text })
      setItems((prev) => prev.map((i) => i.id === updated.id ? updated : i))
      setEditId(null)
    } catch { addToast('Không thể sửa mục', 'error') }
  }

  async function remove(id) {
    try {
      await cdrApi.deleteCdrChecklistItem(requestId, id)
      const next = items.filter((i) => i.id !== id)
      setItems(next); reportProgress(next)
    } catch { addToast('Không thể xoá mục', 'error') }
  }

  async function changeLevel(item) {
    try {
      const updated = await cdrApi.updateCdrChecklistItem(requestId, item.id, { level: item.level === 1 ? 0 : 1 })
      setItems((prev) => prev.map((i) => i.id === updated.id ? updated : i))
    } catch { addToast('Không thể đổi cấp', 'error') }
  }

  const total = items.length
  const done  = items.filter((i) => i.isCompleted).length
  const pct   = total ? Math.round((done / total) * 100) : 0

  if (loading) return <div className={s.loadingBox}><div className={s.spinner} /> Đang tải...</div>

  return (
    <div>
      {total > 0 && (
        <>
          <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--color-muted)', marginBottom: 6 }}>
            {done}/{total} mục · {pct}%
          </div>
          <div className={s.progressBar} style={{ marginBottom: 12 }}>
            <div className={`${s.progressFill} ${pct === 100 ? s.progressFillDone : ''}`} style={{ width: `${pct}%` }} />
          </div>
        </>
      )}

      <div className={s.qvChecklistList}>
        {items.map((item) => {
          const isToggling = togglingIds.has(item.id)
          const isChild = item.level === 1
          return (
            <div key={item.id} className={`${s.qvChecklistItem} ${isChild ? s.checklistItemChild : ''}`}>
              <div
                className={`${s.checklistCheck} ${item.isCompleted ? s.checklistCheckDone : ''}`}
                onClick={() => toggle(item)}
                style={isToggling ? { opacity: 0.5, pointerEvents: 'none' } : { cursor: 'pointer' }}
              >
                {item.isCompleted && <Check size={10} color="#fff" />}
              </div>
              {editId === item.id ? (
                <>
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className={s.checklistTextInput}
                    autoFocus
                    rows={2}
                    style={{ resize: 'vertical' }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.altKey && !e.shiftKey) { e.preventDefault(); saveEdit(item.id) }
                      if (e.key === 'Escape') setEditId(null)
                    }}
                  />
                  <button className={s.qvChecklistDel} onClick={() => saveEdit(item.id)} title="Lưu"><Check size={11} /></button>
                  <button className={s.qvChecklistDel} onClick={() => setEditId(null)} title="Huỷ"><X size={10} /></button>
                </>
              ) : (
                <>
                  <span
                    className={`${s.qvChecklistText} ${item.isCompleted ? s.qvChecklistTextDone : ''}`}
                    style={{ whiteSpace: 'pre-wrap', cursor: 'text' }}
                    onDoubleClick={() => { setEditId(item.id); setEditText(item.stepText) }}
                    title="Nhấp đúp để sửa"
                  >
                    {item.stepText}
                  </span>
                  <button
                    className={`${s.qvChecklistDel} ${s.clEdit}`}
                    onClick={() => { setEditId(item.id); setEditText(item.stepText) }}
                    title="Sửa nội dung"
                  >
                    <Edit2 size={10} />
                  </button>
                  <button
                    className={`${s.qvChecklistDel} ${s.clMove}`}
                    onClick={() => changeLevel(item)}
                    title={isChild ? 'Đưa lên mục chính' : 'Thụt thành mục phụ'}
                  >
                    {isChild ? <ChevronLeft size={11} /> : <ChevronRight size={11} />}
                  </button>
                  <button className={`${s.qvChecklistDel} ${s.clDel}`} onClick={() => remove(item.id)} title="Xoá">
                    <X size={10} />
                  </button>
                </>
              )}
            </div>
          )
        })}
        {total === 0 && <p className={s.emptyInline}>Chưa có mục nào. Thêm các giấy tờ / bước cần thu bên dưới.</p>}
      </div>

      <div className={s.qvAddItem}>
        <Plus size={12} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
        <textarea
          ref={newRef}
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.altKey && !e.shiftKey) { e.preventDefault(); add() } }}
          className={s.qvAddItemInput}
          placeholder="Thêm giấy tờ / bước cần thu… (Enter để thêm)"
          rows={2}
          style={{ resize: 'vertical' }}
          disabled={adding}
        />
        {adding && <Loader2 size={13} className={s.spinIcon} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />}
      </div>
    </div>
  )
}
