import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Check, X, Plus, Trash2, Send, Edit2, Loader2,
  Building2, User, Tag, Clock, Calendar, AlertTriangle,
  ClipboardList, MessageSquare, History, Timer, Sliders,
} from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as tasksApi from '../../api/tasks'
import {
  STATUS_LABELS, STATUS_TRANSITIONS, STATUS_CSS,
  PRIORITY_LABELS, PRIORITY_CSS, SOURCE_LABELS,
  fmtDate, fmtDateTime, isTaskOverdue,
} from './taskUtils'
import { useEnumsStore } from '../../hooks/useEnums'
import { useDataSync } from '../../hooks/useDataSync'
import s from './tasks.module.css'

// ── Status action CSS map ─────────────────────────────────────────────────────

const SA_CLASS = {
  in_progress:    s.saInProgress,
  on_hold:        s.saOnHold,
  pending_review: s.saPendingReview,
  completed:      s.saCompleted,
  needs_revision: s.saNeedsRevision,
  pending:        s.saPending,
}

// ── Shared badges ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const getLabel = useEnumsStore((st) => st.getLabel)
  return (
    <span className={`${s.statusBadge} ${s[STATUS_CSS[status]]}`}>
      {getLabel('task_status', status, STATUS_LABELS[status])}
    </span>
  )
}

function PriorityBadge({ priority }) {
  const getLabel = useEnumsStore((st) => st.getLabel)
  return (
    <span className={`${s.priorityBadge} ${s[PRIORITY_CSS[priority]]}`}>
      {getLabel('task_priority', priority, PRIORITY_LABELS[priority])}
    </span>
  )
}

// ── On-hold reason modal ──────────────────────────────────────────────────────

function OnHoldModal({ onConfirm, onClose }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleConfirm() {
    setSaving(true)
    try { await onConfirm(reason.trim()) } finally { setSaving(false) }
  }

  return (
    <div className={s.miniOverlay}>
      <div className={s.miniDialog}>
        <h4 className={s.miniTitle}>Tạm hoãn công việc</h4>
        <p className={s.miniBody}>Nhập lý do tạm hoãn (không bắt buộc):</p>
        <textarea
          className={s.miniTextarea}
          placeholder="Lý do tạm hoãn..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        />
        <div className={s.miniActions}>
          <button onClick={onClose} className={s.btnSecondary} disabled={saving}>Huỷ</button>
          <button onClick={handleConfirm} disabled={saving} className={s.btnDanger}>
            {saving ? 'Đang lưu...' : 'Tạm hoãn'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Force complete modal ──────────────────────────────────────────────────────

function ForceModal({ newStatus, onConfirm, onClose }) {
  const [saving, setSaving] = useState(false)
  const getLabel = useEnumsStore((st) => st.getLabel)

  async function go() {
    setSaving(true)
    try { await onConfirm() } finally { setSaving(false) }
  }

  return (
    <div className={s.miniOverlay}>
      <div className={s.miniDialog}>
        <h4 className={s.miniTitle}>Checklist chưa xong</h4>
        <p className={s.miniBody}>
          Còn các bước chưa hoàn thành. Vẫn chuyển sang <strong>&ldquo;{getLabel('task_status', newStatus, STATUS_LABELS[newStatus])}&rdquo;</strong>?
        </p>
        <div className={s.miniActions}>
          <button onClick={onClose} className={s.btnSecondary} disabled={saving}>Huỷ</button>
          <button onClick={go} disabled={saving} className={s.btnPrimary}>
            {saving ? 'Đang lưu...' : 'Vẫn chuyển'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Tab: Description ──────────────────────────────────────────────────────────

function DescriptionTab({ taskId, initialDesc, onSaved }) {
  const addToast = useToastStore((s) => s.toast)
  const [desc, setDesc]     = useState(initialDesc ?? '')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving]   = useState(false)

  async function save() {
    setSaving(true)
    try {
      await tasksApi.updateTask(taskId, { description: desc.trim() || null })
      onSaved(desc.trim() || null)
      setEditing(false)
      addToast('Đã lưu mô tả', 'success')
    } catch {
      addToast('Không thể lưu mô tả', 'error')
    } finally { setSaving(false) }
  }

  if (!editing) {
    return (
      <div>
        {desc ? (
          <p style={{ fontSize: 14, color: 'var(--color-text-soft)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{desc}</p>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--color-muted)', fontStyle: 'italic' }}>Chưa có mô tả.</p>
        )}
        <div className={s.descActions}>
          <button className={s.btnSecondary} onClick={() => setEditing(true)} style={{ height: 30, padding: '0 12px', fontSize: 13 }}>
            <Edit2 size={12} /> Chỉnh sửa
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <textarea
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        className={s.descTextarea}
        placeholder="Nhập mô tả công việc..."
        autoFocus
      />
      <div className={s.descActions}>
        <button className={s.btnSecondary} onClick={() => { setDesc(initialDesc ?? ''); setEditing(false) }} disabled={saving} style={{ height: 30, padding: '0 12px', fontSize: 13 }}>Huỷ</button>
        <button className={s.btnPrimary} onClick={save} disabled={saving} style={{ height: 30, padding: '0 12px', fontSize: 13 }}>
          {saving ? 'Đang lưu...' : <><Check size={12} /> Lưu</>}
        </button>
      </div>
    </div>
  )
}

// ── Tab: Checklist ────────────────────────────────────────────────────────────

function ChecklistTab({ taskId, onCountChange }) {
  const addToast = useToastStore((s) => s.toast)
  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [togglingIds, setTogglingIds] = useState(new Set())
  const [addText, setAddText]     = useState('')
  const [adding, setAdding]       = useState(false)
  const [editId, setEditId]       = useState(null)
  const [editText, setEditText]   = useState('')

  useEffect(() => {
    tasksApi.getTaskChecklist(taskId)
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [taskId])

  const done  = items.filter((i) => i.isCompleted).length
  const total = items.length
  const pct   = total ? Math.round((done / total) * 100) : 0

  useEffect(() => { onCountChange(total, done) }, [total, done, onCountChange]) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(item) {
    if (togglingIds.has(item.id)) return
    setTogglingIds((prev) => new Set([...prev, item.id]))
    try {
      const updated = await tasksApi.updateTaskChecklistItem(taskId, item.id, { isCompleted: !item.isCompleted })
      setItems((prev) => prev.map((i) => i.id === updated.id ? updated : i))
    } catch {
      addToast('Không thể cập nhật bước checklist', 'error')
    } finally {
      setTogglingIds((prev) => { const n = new Set(prev); n.delete(item.id); return n })
    }
  }

  async function addItem() {
    if (!addText.trim()) return
    setAdding(true)
    try {
      const item = await tasksApi.addTaskChecklistItem(taskId, { stepText: addText.trim() })
      setItems((prev) => [...prev, item])
      setAddText('')
    } catch { addToast('Không thể thêm bước', 'error') } finally { setAdding(false) }
  }

  async function saveEdit(id) {
    if (!editText.trim()) return
    try {
      const updated = await tasksApi.updateTaskChecklistItem(taskId, id, { stepText: editText.trim() })
      setItems((prev) => prev.map((i) => i.id === updated.id ? updated : i))
      setEditId(null)
    } catch { addToast('Không thể cập nhật', 'error') }
  }

  async function deleteItem(id) {
    try {
      await tasksApi.deleteTaskChecklistItem(taskId, id)
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch { addToast('Không thể xoá', 'error') }
  }

  if (loading) return <div className={s.loadingBox}><div className={s.spinner} /> Đang tải...</div>

  return (
    <div>
      {total > 0 && (
        <div className={s.checklistProgress}>
          <div className={s.progressBar} style={{ flex: 1 }}>
            <div className={`${s.progressFill} ${pct === 100 ? s.progressFillDone : ''}`} style={{ width: `${pct}%` }} />
          </div>
          <span className={s.progressText}>{done}/{total} ({pct}%)</span>
        </div>
      )}

      {items.map((item) => {
        const isToggling = togglingIds.has(item.id)
        return (
        <div key={item.id} className={s.checklistItem}>
          <div
            className={`${s.checklistCheck} ${item.isCompleted ? s.checklistCheckDone : ''}`}
            onClick={() => toggle(item)}
            style={isToggling ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
          >
            {item.isCompleted && <Check size={10} color="#fff" />}
          </div>

          {editId === item.id ? (
            <>
              <input
                type="text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className={s.checklistTextInput}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(item.id); if (e.key === 'Escape') setEditId(null) }}
              />
              <button className={s.btnIcon} onClick={() => saveEdit(item.id)} title="Lưu"><Check size={12} /></button>
              <button className={s.btnIcon} onClick={() => setEditId(null)} title="Huỷ"><X size={12} /></button>
            </>
          ) : (
            <>
              <span className={`${s.checklistText} ${item.isCompleted ? s.checklistTextDone : ''}`}>{item.stepText}</span>
              <div className={s.checklistItemActions}>
                <button className={s.btnIcon} onClick={() => { setEditId(item.id); setEditText(item.stepText) }} title="Sửa"><Edit2 size={11} /></button>
                <button className={s.btnIcon} onClick={() => deleteItem(item.id)} title="Xoá" style={{ color: 'var(--color-danger)' }}><Trash2 size={11} /></button>
              </div>
            </>
          )}
        </div>
        )
      })}

      <div className={s.checklistAddRow}>
        <input
          type="text"
          value={addText}
          onChange={(e) => setAddText(e.target.value)}
          placeholder="Thêm bước mới..."
          className={s.checklistAddInput}
          onKeyDown={(e) => { if (e.key === 'Enter') addItem() }}
        />
        <button className={s.btnPrimary} onClick={addItem} disabled={adding || !addText.trim()} style={{ height: 32, padding: '0 12px', fontSize: 13 }}>
          <Plus size={13} /> Thêm
        </button>
      </div>
    </div>
  )
}

// ── Tab: Dependencies ─────────────────────────────────────────────────────────

function DependenciesTab({ taskId, currentTaskId }) {
  const addToast = useToastStore((s) => s.toast)
  const [deps, setDeps]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [results, setResults]     = useState([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    tasksApi.getTaskDependencies(taskId).then(setDeps).catch(() => {}).finally(() => setLoading(false))
  }, [taskId])

  useEffect(() => {
    if (!search.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const { tasks } = await tasksApi.listTasks({ search: search.trim(), limit: 10 })
        setResults(tasks.filter((t) => t.id !== currentTaskId && !deps.find((d) => d.dependsOnTaskId === t.id)))
      } catch (_e) { /* ignore */ } finally { setSearching(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [search, deps, currentTaskId])

  async function addDep(dependsOnTaskId) {
    try {
      const dep = await tasksApi.addTaskDependency(taskId, { dependsOnTaskId })
      setDeps((prev) => [...prev, dep])
      setSearch(''); setResults([])
      addToast('Đã thêm phụ thuộc', 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể thêm', 'error')
    }
  }

  async function removeDep(depId) {
    try {
      await tasksApi.deleteTaskDependency(taskId, depId)
      setDeps((prev) => prev.filter((d) => d.id !== depId))
      addToast('Đã xoá phụ thuộc', 'success')
    } catch { addToast('Không thể xoá', 'error') }
  }

  if (loading) return <div className={s.loadingBox}><div className={s.spinner} /> Đang tải...</div>

  return (
    <div>
      {deps.length > 0 && (
        <div className={s.depList}>
          {deps.map((dep) => {
            const blocked = dep.dependsOnStatus !== 'completed'
            return (
              <div key={dep.id} className={`${s.depItem} ${blocked ? s.depBlocked : s.depDone}`}>
                <StatusBadge status={dep.dependsOnStatus} />
                <span className={s.depTitle} title={dep.dependsOnTitle}>{dep.dependsOnTitle}</span>
                {blocked && <span className={s.depWarning}><AlertTriangle size={10} /> Chưa xong</span>}
                <button className={s.btnIcon} onClick={() => removeDep(dep.id)} title="Xoá" style={{ color: 'var(--color-danger)', width: 24, height: 24 }}>
                  <Trash2 size={11} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {deps.length === 0 && (
        <p style={{ color: 'var(--color-muted)', fontSize: 13, marginBottom: 16 }}>Chưa có phụ thuộc.</p>
      )}

      <div className={s.depSearchWrap}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm công việc cần hoàn thành trước..."
            className={s.filterInput}
            style={{ width: '100%' }}
          />
          {searching && (
            <div className={s.spinner} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, borderWidth: 2 }} />
          )}
        </div>
        {results.length > 0 && (
          <div className={s.depSearchResults}>
            {results.map((t) => (
              <div key={t.id} className={s.depSearchItem} onClick={() => addDep(t.id)} role="button" tabIndex={0}>
                <span className={s.depSearchTitle}>{t.title}</span>
                <span className={s.depSearchCompany}>{t.companyName}</span>
                <StatusBadge status={t.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tab: Comments ─────────────────────────────────────────────────────────────

function CommentsTab({ taskId }) {
  const addToast    = useToastStore((s) => s.toast)
  const currentUser = useAuthStore((s) => s.user)
  const isAdmin     = currentUser?.role === 'admin'

  const [comments, setComments] = useState([])
  const [loading, setLoading]   = useState(true)
  const [newText, setNewText]   = useState('')
  const [sending, setSending]   = useState(false)
  const [editId, setEditId]     = useState(null)
  const [editText, setEditText] = useState('')
  const [syncTick, setSyncTick] = useState(0)

  // Live sync: reload when another user posts a comment on this task
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

  function initials(name) {
    if (!name) return '?'
    const parts = name.split(' ')
    return (parts[0][0] + (parts[parts.length - 1][0] || '')).toUpperCase()
  }

  if (loading) return <div className={s.loadingBox}><div className={s.spinner} /> Đang tải...</div>

  return (
    <div>
      <div className={s.commentList}>
        {comments.length === 0 && (
          <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Chưa có bình luận.</p>
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
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className={s.commentInput}
                      style={{ minHeight: 56 }}
                      autoFocus
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <button className={s.btnIcon} onClick={() => saveEdit(c.id)} title="Lưu"><Check size={12} /></button>
                      <button className={s.btnIcon} onClick={() => setEditId(null)} title="Huỷ"><X size={12} /></button>
                    </div>
                  </div>
                ) : (
                  <p className={s.commentContent}>{c.content}</p>
                )}
                {canEdit && editId !== c.id && (
                  <div className={s.commentActions}>
                    <button className={s.btnGhost} style={{ height: 24, fontSize: 11 }} onClick={() => { setEditId(c.id); setEditText(c.content) }}>
                      <Edit2 size={10} /> Sửa
                    </button>
                    <button className={s.btnGhost} style={{ height: 24, fontSize: 11, color: 'var(--color-danger)' }} onClick={() => deleteComment(c.id)}>
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
            <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>Ctrl + Enter để gửi</span>
            <button
              className={s.btnPrimary}
              onClick={submit}
              disabled={sending || !newText.trim()}
              style={{ height: 32, padding: '0 16px', fontSize: 13 }}
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

// ── Tab: Activity ─────────────────────────────────────────────────────────────

function ActivityTab({ taskId }) {
  const [logs, setLogs]     = useState([])
  const [loading, setLoading] = useState(true)
  const getLabel = useEnumsStore((st) => st.getLabel)
  const [syncTick, setSyncTick] = useState(0)

  // Live sync: reload when task is mutated or a comment is added (both create activity entries)
  useDataSync(['data:task', 'data:comment'], (payload) => {
    if (payload.taskId === taskId) setSyncTick((k) => k + 1)
  }, [taskId])

  useEffect(() => {
    tasksApi.getTaskActivity(taskId).then(setLogs).catch(() => {}).finally(() => setLoading(false))
  }, [taskId, syncTick])

  if (loading) return <div className={s.loadingBox}><div className={s.spinner} /> Đang tải...</div>

  if (logs.length === 0) return (
    <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Chưa có nhật ký hoạt động.</p>
  )

  return (
    <div className={s.activityList}>
      {logs.map((log, i) => (
        <div key={log.id ?? i} className={s.activityItem}>
          <div className={s.activityDot} />
          <div className={s.activityContent}>
            <p className={s.activityText}>
              <strong>{log.actorName ?? 'Hệ thống'}</strong>{' '}
              {log.action === 'status_changed' && `đổi trạng thái → ${getLabel('task_status', log.newValue, STATUS_LABELS[log.newValue] ?? log.newValue)}`}
              {log.action === 'comment_added' && 'thêm bình luận'}
              {log.action === 'checklist_checked' && `đánh dấu hoàn thành bước "${log.meta?.stepText ?? ''}"`}
              {log.action === 'checklist_unchecked' && `bỏ hoàn thành bước "${log.meta?.stepText ?? ''}"`}
              {log.action === 'task_created' && 'tạo công việc'}
              {log.action === 'dependency_added' && 'thêm phụ thuộc'}
              {log.action === 'dependency_removed' && 'xoá phụ thuộc'}
              {log.action === 'time_logged' && `ghi ${log.meta?.hours ?? 0} giờ làm việc`}
              {!['status_changed','comment_added','checklist_checked','checklist_unchecked','task_created','dependency_added','dependency_removed','time_logged'].includes(log.action) && log.action}
            </p>
            <p className={s.activityTime}>{fmtDateTime(log.createdAt)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Tab: Time logs ────────────────────────────────────────────────────────────

function TimeLogsTab({ taskId }) {
  const addToast    = useToastStore((s) => s.toast)
  const currentUser = useAuthStore((s) => s.user)
  const isAdmin     = currentUser?.role === 'admin'

  const [logs, setLogs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [hours, setHours]     = useState('')
  const [note, setNote]       = useState('')
  const [adding, setAdding]   = useState(false)

  useEffect(() => {
    tasksApi.getTaskTimeLogs(taskId).then(setLogs).catch(() => {}).finally(() => setLoading(false))
  }, [taskId])

  async function addLog() {
    if (!hours || Number(hours) <= 0) { addToast('Số giờ phải lớn hơn 0', 'error'); return }
    setAdding(true)
    try {
      const log = await tasksApi.addTaskTimeLog(taskId, { hours: Number(hours), note: note.trim() || undefined })
      setLogs((prev) => [log, ...prev])
      setHours(''); setNote('')
      addToast('Đã ghi thời gian', 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể ghi', 'error')
    } finally { setAdding(false) }
  }

  async function deleteLog(logId) {
    try {
      await tasksApi.deleteTaskTimeLog(taskId, logId)
      setLogs((prev) => prev.filter((l) => l.id !== logId))
      addToast('Đã xoá', 'success')
    } catch { addToast('Không thể xoá', 'error') }
  }

  if (loading) return <div className={s.loadingBox}><div className={s.spinner} /> Đang tải...</div>

  const total = logs.reduce((sum, l) => sum + Number(l.hours || 0), 0)

  return (
    <div>
      <div className={s.timeLogAddRow}>
        <div>
          <label className={s.cfLabel} style={{ marginBottom: 4, display: 'block' }}>Số giờ *</label>
          <input
            type="number" min="0.1" step="0.5"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className={s.cfInput}
            placeholder="0"
          />
        </div>
        <div>
          <label className={s.cfLabel} style={{ marginBottom: 4, display: 'block' }}>Ghi chú</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={s.cfInput}
            placeholder="Mô tả công việc đã làm..."
          />
        </div>
        <button className={s.btnPrimary} onClick={addLog} disabled={adding || !hours} style={{ height: 32, padding: '0 14px', fontSize: 13, alignSelf: 'flex-end' }}>
          {adding ? '...' : <><Plus size={13} /> Ghi</>}
        </button>
      </div>

      {total > 0 && (
        <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 8 }}>
          Tổng: <strong style={{ color: 'var(--color-primary)' }}>{total.toFixed(1)} giờ</strong>
        </p>
      )}

      <div className={s.timeLogList}>
        {logs.length === 0 && <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Chưa có nhật ký thời gian.</p>}
        {logs.map((log) => {
          const canDel = log.userId === currentUser?.id || isAdmin
          return (
            <div key={log.id} className={s.timeLogItem}>
              <span className={s.timeLogHours}>{Number(log.hours).toFixed(1)}h</span>
              <span className={s.timeLogNote}>{log.note || '—'}</span>
              <span className={s.timeLogMeta}>{log.userName} · {fmtDate(log.loggedDate)}</span>
              {canDel && (
                <button className={s.btnIcon} onClick={() => deleteLog(log.id)} title="Xoá" style={{ width: 24, height: 24, color: 'var(--color-danger)' }}>
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Tab: Custom fields ────────────────────────────────────────────────────────

function CustomFieldsTab({ taskId }) {
  const addToast = useToastStore((s) => s.toast)
  const [fields, setFields]   = useState([])
  const [loading, setLoading] = useState(true)
  const [values, setValues]   = useState({})
  const [saving, setSaving]   = useState(false)

  function initValues(data) {
    const init = {}
    for (const f of data) {
      if (f.dataType === 'boolean') init[f.fieldKey] = f.value ?? false
      else if (f.dataType === 'number') init[f.fieldKey] = f.value ?? ''
      else if (f.dataType === 'date') init[f.fieldKey] = f.value ? String(f.value).slice(0, 10) : ''
      else init[f.fieldKey] = f.value ?? ''
    }
    return init
  }

  useEffect(() => {
    tasksApi.getTaskCustomFields(taskId)
      .then((data) => {
        setFields(data)
        setValues(initValues(data))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [taskId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    // Client-side required check
    for (const f of fields) {
      const v = values[f.fieldKey]
      if (f.isRequired && (v === '' || v === null || v === undefined)) {
        addToast(`Trường "${f.label}" là bắt buộc`, 'error')
        return
      }
    }
    setSaving(true)
    try {
      const payload = fields.map((f) => {
        let value = values[f.fieldKey] ?? null
        if (f.dataType === 'number') value = value !== '' && value !== null ? Number(value) : null
        if (f.dataType === 'date' || f.dataType === 'text' || f.dataType === 'select') {
          value = value === '' ? null : value
        }
        return { fieldKey: f.fieldKey, value }
      })
      const updated = await tasksApi.upsertTaskCustomFields(taskId, { fields: payload })
      setFields(updated)
      setValues(initValues(updated))
      addToast('Đã lưu trường tuỳ chỉnh', 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể lưu', 'error')
    } finally { setSaving(false) }
  }

  if (loading) return <div className={s.loadingBox}><div className={s.spinner} /> Đang tải...</div>

  if (fields.length === 0) return (
    <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>
      Loại công việc này không có trường tuỳ chỉnh.
    </p>
  )

  function renderInput(f) {
    const val = values[f.fieldKey]
    const set = (v) => setValues((p) => ({ ...p, [f.fieldKey]: v }))

    if (f.dataType === 'boolean') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32 }}>
          <input type="checkbox" checked={!!val} onChange={(e) => set(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
          <span style={{ fontSize: 13, color: 'var(--color-text-soft)' }}>{val ? 'Có' : 'Không'}</span>
        </div>
      )
    }
    if (f.dataType === 'select') {
      const opts = f.options ?? []
      return (
        <select value={val} onChange={(e) => set(e.target.value)} className={s.cfSelect}>
          <option value="">-- Chọn --</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    }
    if (f.dataType === 'date') {
      return <input type="date" value={val} onChange={(e) => set(e.target.value)} className={s.cfInput} />
    }
    if (f.dataType === 'number') {
      return <input type="number" value={val} onChange={(e) => set(e.target.value)} className={s.cfInput} />
    }
    return <input type="text" value={val} onChange={(e) => set(e.target.value)} className={s.cfInput} placeholder={f.label} />
  }

  return (
    <div>
      <div className={s.cfGrid}>
        {fields.map((f) => (
          <div key={f.fieldKey} className={s.cfGroup}>
            <label className={`${s.cfLabel} ${f.isRequired ? s.cfRequired : ''}`}>{f.label}</label>
            {renderInput(f)}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className={s.btnPrimary} onClick={save} disabled={saving} style={{ height: 32, padding: '0 16px', fontSize: 13 }}>
          {saving ? 'Đang lưu...' : <><Check size={13} /> Lưu trường tuỳ chỉnh</>}
        </button>
      </div>
    </div>
  )
}

// ── Main TaskDetail ───────────────────────────────────────────────────────────

const TABS = [
  { key: 'desc',    label: 'Mô tả',      icon: <ClipboardList size={13} /> },
  { key: 'checklist', label: 'Checklist', icon: <Check size={13} /> },
  { key: 'deps',    label: 'Phụ thuộc',  icon: <AlertTriangle size={13} /> },
  { key: 'comments', label: 'Bình luận', icon: <MessageSquare size={13} /> },
  { key: 'activity', label: 'Nhật ký',   icon: <History size={13} /> },
  { key: 'timelogs', label: 'Thời gian', icon: <Timer size={13} /> },
  { key: 'custom',  label: 'Tuỳ chỉnh',  icon: <Sliders size={13} /> },
]

export default function TaskDetail() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const addToast  = useToastStore((s) => s.toast)
  const getLabel  = useEnumsStore((st) => st.getLabel)
  const getOptions = useEnumsStore((st) => st.getOptions)
  const loadEnums  = useEnumsStore((st) => st.load)

  const [task, setTask]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const [activeTab, setActiveTab] = useState('desc')

  // Status change modals
  const [onHoldVisible, setOnHoldVisible] = useState(false)
  const [pendingStatus, setPendingStatus] = useState(null)
  const [forceVisible, setForceVisible]   = useState(false)

  // Inline title edit
  const [titleEdit, setTitleEdit] = useState('')
  const [savingTitle, setSavingTitle] = useState(false)

  // Due date
  const [savingDue, setSavingDue] = useState(false)

  // Checklist counts for tab badge
  const [clTotal, setClTotal] = useState(0)
  const [clDone, setClDone]   = useState(0)

  useEffect(() => { loadEnums() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLoading(true)
    setError(null)
    tasksApi.getTask(id)
      .then((t) => { setTask(t); setTitleEdit(t.title) })
      .catch(() => setError('Không thể tải công việc'))
      .finally(() => setLoading(false))
  }, [id])

  async function changeStatus(newStatus, extra = {}) {
    if (newStatus === 'on_hold' && !('reason' in extra)) {
      setPendingStatus(newStatus)
      setOnHoldVisible(true)
      return
    }
    // Always track the target status so ForceModal knows what to retry
    setPendingStatus(newStatus)
    try {
      const body = { status: newStatus }
      if (extra.reason !== undefined) body.onHoldReason = extra.reason || null
      if (extra.force)                body.force        = true

      const updated = await tasksApi.changeTaskStatus(id, body)
      setTask(updated)
      addToast(`Đã chuyển sang "${getLabel('task_status', newStatus, STATUS_LABELS[newStatus])}"`, 'success')
      setOnHoldVisible(false)
      setForceVisible(false)
      setPendingStatus(null)
    } catch (err) {
      const httpStatus = err.response?.status
      const msg        = err.response?.data?.error?.message
      if (httpStatus === 409) {
        setOnHoldVisible(false)
        setForceVisible(true)
      } else if (httpStatus === 422) {
        setOnHoldVisible(false)
        addToast(msg ?? 'Task bị chặn bởi dependency chưa hoàn thành', 'error')
        setPendingStatus(null)
      } else {
        addToast(msg ?? 'Không thể cập nhật trạng thái', 'error')
        setPendingStatus(null)
      }
    }
  }

  async function saveTitle() {
    const trimmed = titleEdit.trim()
    if (!trimmed || trimmed === task.title) return
    setSavingTitle(true)
    try {
      const updated = await tasksApi.updateTask(id, { title: trimmed })
      setTask(updated)
      addToast('Đã lưu tiêu đề', 'success')
    } catch { addToast('Không thể lưu tiêu đề', 'error') } finally { setSavingTitle(false) }
  }

  async function saveDueDate(val) {
    setSavingDue(true)
    try {
      const updated = await tasksApi.updateTask(id, { dueDate: val || null })
      setTask(updated)
    } catch { addToast('Không thể lưu ngày hết hạn', 'error') } finally { setSavingDue(false) }
  }

  // Loading
  if (loading) {
    return (
      <AppLayout>
        <div className={s.loadingBox} style={{ padding: 80 }}>
          <div className={s.spinner} /> Đang tải công việc...
        </div>
      </AppLayout>
    )
  }

  // Error
  if (error || !task) {
    return (
      <AppLayout>
        <div className={s.errorBox}>
          <AlertTriangle size={32} style={{ color: 'var(--color-danger)' }} />
          <p className={s.errorTitle}>{error ?? 'Không tìm thấy công việc'}</p>
          <button className={s.btnSecondary} onClick={() => navigate('/tasks')}>
            <ArrowLeft size={13} /> Quay lại danh sách
          </button>
        </div>
      </AppLayout>
    )
  }

  const overdue      = isTaskOverdue(task)
  const transitions  = STATUS_TRANSITIONS[task.status] ?? []
  const pct          = clTotal ? Math.round((clDone / clTotal) * 100) : null

  return (
    <AppLayout>
      <div className={s.detailPage}>

        {/* ── Header ── */}
        <div className={s.detailHeader}>
          <div className={s.detailHeaderTop}>
            <div className={s.detailTitleRow}>
              <button
                className={s.btnGhost}
                onClick={() => navigate('/tasks')}
                style={{ marginBottom: 8, height: 28, fontSize: 12 }}
              >
                <ArrowLeft size={12} /> Danh sách
              </button>
              <input
                type="text"
                value={titleEdit}
                onChange={(e) => setTitleEdit(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
                className={s.detailTitleInput}
                disabled={savingTitle}
              />
              <div className={s.detailBadges}>
                <StatusBadge status={task.status} />
                <PriorityBadge priority={task.priority} />
                {overdue && (
                  <span className={s.overdueTag}><AlertTriangle size={10} /> Quá hạn</span>
                )}
                {task.source && (
                  <span className={`${s.sourceBadge} ${task.source === 'auto' ? s.sourceAuto : s.sourceManual}`}>
                    {getLabel('task_source', task.source, SOURCE_LABELS[task.source] ?? task.source)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Meta row */}
          <div className={s.detailMeta}>
            {task.companyName && (
              <div className={s.detailMetaItem}>
                <Building2 size={12} style={{ color: 'var(--color-muted)' }} />
                <span className={s.detailMetaLabel}>KH:</span>
                <Link to={`/companies/${task.companyId}`} className={s.detailMetaLink}>{task.companyName}</Link>
              </div>
            )}
            {task.assignedToName && (
              <div className={s.detailMetaItem}>
                <User size={12} style={{ color: 'var(--color-muted)' }} />
                <span className={s.detailMetaLabel}>Giao cho:</span>
                <span>{task.assignedToName}</span>
              </div>
            )}
            {task.taskTypeName && (
              <div className={s.detailMetaItem}>
                <Tag size={12} style={{ color: 'var(--color-muted)' }} />
                <span className={s.detailMetaLabel}>Loại:</span>
                <span>{task.taskTypeName}</span>
              </div>
            )}
            {task.periodLabel && (
              <div className={s.detailMetaItem}>
                <Calendar size={12} style={{ color: 'var(--color-muted)' }} />
                <span className={s.detailMetaLabel}>Kỳ:</span>
                <span>{task.periodLabel}</span>
              </div>
            )}
            <div className={s.detailMetaItem}>
              <Clock size={12} style={{ color: 'var(--color-muted)' }} />
              <span className={s.detailMetaLabel}>Tạo:</span>
              <span>{fmtDateTime(task.createdAt)}</span>
            </div>
          </div>

          {/* Status actions */}
          {transitions.length > 0 && (
            <div className={s.statusActions}>
              <span className={s.statusActionLabel}>Chuyển sang:</span>
              {(getOptions('task_status').length > 0
                ? getOptions('task_status').filter((o) => transitions.includes(o.key))
                : transitions.map((k) => ({ key: k, label: STATUS_LABELS[k] }))
              ).map((opt) => (
                <button
                  key={opt.key}
                  className={`${s.statusActionBtn} ${SA_CLASS[opt.key] ?? ''}`}
                  onClick={() => changeStatus(opt.key)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Body: tabs + sidebar ── */}
        <div className={s.detailBody}>

          {/* Tabs */}
          <div className={s.tabsCard}>
            <div className={s.tabNav}>
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  className={`${s.tabBtn} ${activeTab === tab.key ? s.tabBtnActive : ''}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.icon}
                  {tab.label}
                  {tab.key === 'checklist' && clTotal > 0 && (
                    <span className={s.tabCount}>{clDone}/{clTotal}</span>
                  )}
                </button>
              ))}
            </div>

            <div className={s.tabContent}>
              {activeTab === 'desc' && (
                <DescriptionTab
                  taskId={id}
                  initialDesc={task.description}
                  onSaved={(desc) => setTask((t) => ({ ...t, description: desc }))}
                />
              )}
              {activeTab === 'checklist' && (
                <ChecklistTab
                  taskId={id}
                  onCountChange={(total, done) => { setClTotal(total); setClDone(done) }}
                />
              )}
              {activeTab === 'deps' && (
                <DependenciesTab taskId={id} currentTaskId={id} />
              )}
              {activeTab === 'comments' && (
                <CommentsTab taskId={id} />
              )}
              {activeTab === 'activity' && (
                <ActivityTab taskId={id} />
              )}
              {activeTab === 'timelogs' && (
                <TimeLogsTab taskId={id} />
              )}
              {activeTab === 'custom' && (
                <CustomFieldsTab taskId={id} />
              )}
            </div>
          </div>

          {/* Info sidebar */}
          <div className={s.infoCard}>
            <div className={s.infoSection}>
              <div className={s.infoSectionTitle}>Thời hạn</div>

              <div className={s.infoRow}>
                <span className={s.infoRowLabel}>Hết hạn</span>
                <input
                  type="date"
                  value={task.dueDate?.slice(0, 10) ?? ''}
                  onChange={(e) => saveDueDate(e.target.value)}
                  className={s.dateInput}
                  disabled={savingDue}
                  style={{ maxWidth: 140 }}
                />
              </div>

              {task.slaDays && (
                <div className={s.infoRow}>
                  <span className={s.infoRowLabel}>SLA chuẩn</span>
                  <span className={s.infoRowValue}>{task.slaDays} ngày</span>
                </div>
              )}

              {task.actualHours > 0 && (
                <div className={s.infoRow}>
                  <span className={s.infoRowLabel}>Đã dùng</span>
                  <span className={s.infoRowValue}>{Number(task.actualHours).toFixed(1)} giờ</span>
                </div>
              )}

              {overdue && (
                <div style={{ marginTop: 8 }}>
                  <span className={s.overdueTag}><AlertTriangle size={10} /> Quá hạn</span>
                </div>
              )}
            </div>

            {clTotal > 0 && (
              <div className={s.infoSection}>
                <div className={s.infoSectionTitle}>Tiến độ checklist</div>
                <div className={s.progressWrap} style={{ marginBottom: 6 }}>
                  <div className={s.progressBar}>
                    <div
                      className={`${s.progressFill} ${pct === 100 ? s.progressFillDone : ''}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className={s.progressText}>{pct}%</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{clDone}/{clTotal} bước hoàn thành</span>
              </div>
            )}

            <div className={s.infoSection}>
              <div className={s.infoSectionTitle}>Thông tin</div>

              <div className={s.infoRow}>
                <span className={s.infoRowLabel}>Ưu tiên</span>
                <PriorityBadge priority={task.priority} />
              </div>

              {task.completedAt && (
                <div className={s.infoRow}>
                  <span className={s.infoRowLabel}>Hoàn thành</span>
                  <span className={s.infoRowValue}>{fmtDate(task.completedAt)}</span>
                </div>
              )}

              <div className={s.infoRow}>
                <span className={s.infoRowLabel}>Nguồn</span>
                <span className={s.infoRowValue}>{getLabel('task_source', task.source, SOURCE_LABELS[task.source] ?? task.source)}</span>
              </div>

              {task.periodLabel && (
                <div className={s.infoRow}>
                  <span className={s.infoRowLabel}>Kỳ</span>
                  <span className={s.infoRowValue}>{task.periodLabel}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {onHoldVisible && (
        <OnHoldModal
          onConfirm={(reason) => changeStatus('on_hold', { reason })}
          onClose={() => { setOnHoldVisible(false); setPendingStatus(null) }}
        />
      )}

      {forceVisible && pendingStatus && (
        <ForceModal
          newStatus={pendingStatus}
          onConfirm={() => changeStatus(pendingStatus, { force: true })}
          onClose={() => { setForceVisible(false); setPendingStatus(null) }}
        />
      )}
    </AppLayout>
  )
}
