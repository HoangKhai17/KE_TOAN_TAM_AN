import { useState } from 'react'
import { Loader2, Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { useQuickNotes } from '../../hooks/useQuickNotes'
import s from './quickNotes.module.css'

function fmtRelative(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'vừa xong'
  if (m < 60) return `${m} phút trước`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} giờ trước`
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Lõi UI ghi chú nhanh — dùng chung cho ngăn trượt desktop và màn hình mobile.
export default function QuickNotes() {
  const { data: notes = [], isLoading, create, update, remove } = useQuickNotes()
  const [draft, setDraft]         = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText]   = useState('')

  function handleAdd() {
    const content = draft.trim()
    if (!content || create.isPending) return
    create.mutate(content, { onSuccess: () => setDraft('') })
  }

  function startEdit(n) { setEditingId(n.id); setEditText(n.content) }
  function cancelEdit()  { setEditingId(null); setEditText('') }
  function saveEdit() {
    const content = editText.trim()
    if (!content || update.isPending) return
    update.mutate({ id: editingId, content }, { onSuccess: cancelEdit })
  }

  return (
    <div className={s.wrap}>
      <div className={s.composer}>
        <textarea
          className={s.input}
          placeholder="Ghi chú nhanh… (vd: khách A gọi hỏi báo cáo, gọi lại chiều)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd() } }}
          rows={2}
        />
        <button className={s.addBtn} onClick={handleAdd} disabled={!draft.trim() || create.isPending}>
          {create.isPending ? <Loader2 size={14} className={s.spin} /> : <Plus size={14} />} Lưu
        </button>
      </div>

      <div className={s.list}>
        {isLoading ? (
          <div className={s.empty}>Đang tải…</div>
        ) : notes.length === 0 ? (
          <div className={s.empty}>Chưa có ghi chú nào. Gõ ở trên để thêm.</div>
        ) : (
          notes.map((n) => (
            <div key={n.id} className={s.item}>
              {editingId === n.id ? (
                <div className={s.editRow}>
                  <textarea
                    className={s.input}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={2}
                    autoFocus
                  />
                  <div className={s.editActions}>
                    <button className={s.iconBtn} onClick={saveEdit} title="Lưu"><Check size={15} /></button>
                    <button className={s.iconBtn} onClick={cancelEdit} title="Huỷ"><X size={15} /></button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={s.itemBody}>
                    <div className={s.itemContent}>{n.content}</div>
                    <div className={s.itemTime}>{fmtRelative(n.created_at)}</div>
                  </div>
                  <div className={s.itemActions}>
                    <button className={s.iconBtn} onClick={() => startEdit(n)} title="Sửa"><Pencil size={13} /></button>
                    <button
                      className={`${s.iconBtn} ${s.danger}`}
                      onClick={() => { if (window.confirm('Xoá ghi chú này?')) remove.mutate(n.id) }}
                      title="Xoá"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
