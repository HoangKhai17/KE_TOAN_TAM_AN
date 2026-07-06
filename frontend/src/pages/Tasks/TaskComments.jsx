import { useState, useEffect } from 'react'
import { Check, X, Edit2, Trash2, Loader2, Send } from 'lucide-react'
import * as tasksApi from '../../api/tasks'
import { useToastStore } from '../../stores/toastStore'
import { useAuthStore } from '../../stores/authStore'
import { useDataSync } from '../../hooks/useDataSync'
import { fmtDateTime } from './taskUtils'
import s from './tasks.module.css'

function initials(name) {
  if (!name) return '?'
  const parts = name.split(' ')
  return (parts[0][0] + (parts[parts.length - 1][0] || '')).toUpperCase()
}

// Danh sách + thêm/sửa/xoá bình luận cho 1 task. Dùng chung cho TaskDetail (tab) và QuickView.
export default function TaskComments({ taskId }) {
  const addToast    = useToastStore((st) => st.toast)
  const currentUser = useAuthStore((st) => st.user)
  const isAdmin     = currentUser?.role === 'admin'

  const [comments, setComments] = useState([])
  const [loading, setLoading]   = useState(true)
  const [newText, setNewText]   = useState('')
  const [sending, setSending]   = useState(false)
  const [editId, setEditId]     = useState(null)
  const [editText, setEditText] = useState('')
  const [syncTick, setSyncTick] = useState(0)

  // Live sync: reload khi người khác bình luận vào task này
  useDataSync('data:comment', (payload) => {
    if (payload.taskId === taskId) setSyncTick((k) => k + 1)
  }, [taskId])

  useEffect(() => {
    tasksApi.getTaskComments(taskId).then(setComments).catch(() => {}).finally(() => setLoading(false))
  }, [taskId, syncTick])

  async function submit() {
    if (!newText.trim()) return
    setSending(true)
    try {
      const c = await tasksApi.addTaskComment(taskId, { content: newText.trim() })
      setComments((prev) => [...prev, c])
      setNewText('')
    } catch { addToast('Không thể gửi bình luận', 'error') } finally { setSending(false) }
  }

  async function saveEdit(id) {
    if (!editText.trim()) return
    try {
      const updated = await tasksApi.updateTaskComment(taskId, id, { content: editText.trim() })
      setComments((prev) => prev.map((c) => c.id === updated.id ? updated : c))
      setEditId(null)
    } catch { addToast('Không thể cập nhật', 'error') }
  }

  async function deleteComment(id) {
    try {
      await tasksApi.deleteTaskComment(taskId, id)
      setComments((prev) => prev.filter((c) => c.id !== id))
    } catch { addToast('Không thể xoá', 'error') }
  }

  if (loading) return <div className={s.loadingBox}><div className={s.spinner} /> Đang tải...</div>

  return (
    <div>
      <div className={s.commentList}>
        {comments.length === 0 && (
          <p className={s.emptyInline}>Chưa có bình luận.</p>
        )}
        {comments.map((c) => {
          const canEdit = c.userId === currentUser?.id || isAdmin
          return (
            <div key={c.id} className={s.commentItem}>
              <div className={s.commentAvatar}>{initials(c.userName)}</div>
              <div className={s.commentBody}>
                <div className={s.commentMeta}>
                  <span className={s.commentAuthor}>{c.userName}</span>
                  <span className={s.commentTime}>{fmtDateTime(c.createdAt)}</span>
                  {c.isEdited && <span className={s.commentEdited}>(đã sửa)</span>}
                </div>
                {editId === c.id ? (
                  <div className={s.commentEditRow}>
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className={`${s.commentInput} ${s.commentInputEdit}`}
                      autoFocus
                    />
                    <div className={s.commentEditActions}>
                      <button className={s.btnIcon} onClick={() => saveEdit(c.id)} title="Lưu"><Check size={12} /></button>
                      <button className={s.btnIcon} onClick={() => setEditId(null)} title="Huỷ"><X size={12} /></button>
                    </div>
                  </div>
                ) : (
                  <p className={s.commentContent}>{c.content}</p>
                )}
                {canEdit && editId !== c.id && (
                  <div className={s.commentActions}>
                    <button className={`${s.btnGhost} ${s.btnTiny}`} onClick={() => { setEditId(c.id); setEditText(c.content) }}>
                      <Edit2 size={10} /> Sửa
                    </button>
                    <button className={`${s.btnGhost} ${s.btnTiny} ${s.btnDangerText}`} onClick={() => deleteComment(c.id)}>
                      <Trash2 size={10} /> Xoá
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className={s.commentAddRow}>
        <div className={s.commentAvatar}>{initials(currentUser?.name)}</div>
        <div className={s.commentInputWrap}>
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Viết bình luận... (Ctrl+Enter để gửi)"
            className={s.commentInput}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) submit() }}
          />
          <div className={s.commentSendRow}>
            <span className={s.commentShortcut}>Ctrl + Enter để gửi</span>
            <button
              className={`${s.btnPrimary} ${s.btnCompactWide}`}
              onClick={submit}
              disabled={sending || !newText.trim()}
            >
              {sending ? <Loader2 size={13} className={s.spin} /> : <Send size={13} />}
              Gửi
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
