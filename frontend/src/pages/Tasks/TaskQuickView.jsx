import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  X, ArrowUpRight, Check, Loader2, Plus,
  Building2, User, Calendar, Clock, AlertTriangle, Flag, FileText, Tag,
} from 'lucide-react'
import * as tasksApi from '../../api/tasks'
import { listUserOptions } from '../../api/users'
import {
  STATUS_LABELS, STATUS_TRANSITIONS, STATUS_CSS,
  PRIORITY_LABELS, PRIORITY_CSS, SOURCE_LABELS,
  fmtDate, isTaskOverdue, completionKind, taskStatusLabel, canEditDueDate,
} from './taskUtils'
import { useEnumsStore } from '../../hooks/useEnums'
import { useToastStore } from '../../stores/toastStore'
import { useAuthStore } from '../../stores/authStore'
import TaskLinksSection from './TaskLinksSection'
import TaskComments from './TaskComments'
import s from './tasks.module.css'

// Convert any ISO string to local yyyy-MM-dd.
// DATE columns now return plain "YYYY-MM-DD" strings from the backend; full
// ISO timestamps (e.g. createdAt) are converted using local time components.
function toDateValue(isoStr) {
  if (!isoStr) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) return isoStr   // already a plain date
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Date field: shows dd/MM/yyyy text, hidden native picker on click
function QvDateField({ value, onChange, isError }) {
  const ref = useRef(null)
  return (
    <div
      className={`${s.qvDateField} ${isError ? s.qvDateFieldError : ''}`}
      onClick={() => ref.current?.showPicker?.()}
    >
      <span className={s.qvDateValue}>{value ? fmtDate(value) : '—'}</span>
      <input
        ref={ref}
        type="date"
        value={value}
        onChange={onChange}
        className={s.qvDateHidden}
        tabIndex={-1}
      />
    </div>
  )
}

// ── Local constants ───────────────────────────────────────────────────────────

const SA_CLASS = {
  in_progress:    s.saInProgress,
  on_hold:        s.saOnHold,
  pending_review: s.saPendingReview,
  completed:      s.saCompleted,
  needs_revision: s.saNeedsRevision,
  pending:        s.saPending,
}

const STATUS_SELECT_STYLE = {
  pending:        { background: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' },
  in_progress:    { background: '#eff6ff', color: '#1d4ed8', borderColor: '#93c5fd' },
  on_hold:        { background: '#fff7ed', color: '#c2410c', borderColor: '#fed7aa' },
  pending_review: { background: '#faf5ff', color: '#7e22ce', borderColor: '#d8b4fe' },
  needs_revision: { background: '#fff1f2', color: '#be123c', borderColor: '#fda4af' },
  completed:      { background: '#f0fdf4', color: '#15803d', borderColor: '#86efac' },
}

const PRIORITY_SELECT_STYLE = {
  urgent: { background: '#fef2f2', color: '#b91c1c', borderColor: '#fca5a5' },
  high:   { background: '#fff7ed', color: '#c2410c', borderColor: '#fdba74' },
  medium: { background: '#eff6ff', color: '#1d4ed8', borderColor: '#93c5fd' },
  low:    { background: '#f8fafc', color: '#64748b', borderColor: '#cbd5e1' },
}

// ── Badges ────────────────────────────────────────────────────────────────────

function StatusBadge({ status, task }) {
  const getLabel = useEnumsStore((st) => st.getLabel)
  const t = task ?? { status }
  const late = t.status === 'completed' && completionKind(t) === 'late'
  const cssKey = late ? 'statusCompletedLate' : STATUS_CSS[t.status]
  return (
    <span className={`${s.statusBadge} ${s[cssKey]}`}>
      {taskStatusLabel(t, getLabel)}
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

// ── Main component ────────────────────────────────────────────────────────────

export default function TaskQuickView({ taskId, onClose, onUpdated }) {
  const navigate  = useNavigate()
  const addToast  = useToastStore((st) => st.toast)
  const getLabel  = useEnumsStore((st) => st.getLabel)
  const getOptions = useEnumsStore((st) => st.getOptions)
  const isAdmin   = useAuthStore((st) => st.user?.role === 'admin')

  const [task,        setTask]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [checklist,   setChecklist]   = useState([])
  const [togglingIds, setTogglingIds] = useState(new Set())
  const [saving,      setSaving]      = useState(false)
  const [staffList,   setStaffList]   = useState([])

  // Checklist add
  const [newItemText, setNewItemText] = useState('')
  const [addingItem,  setAddingItem]  = useState(false)
  const newItemRef = useRef(null)

  // Description inline edit
  const [descDraft,  setDescDraft]  = useState('')
  const [descDirty,  setDescDirty]  = useState(false)
  const [savingDesc, setSavingDesc] = useState(false)

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Fetch task + checklist + staff in parallel
  useEffect(() => {
    if (!taskId) return
    setLoading(true)
    setTask(null)
    setChecklist([])
    setDescDirty(false)
    Promise.all([
      tasksApi.getTask(taskId),
      tasksApi.getTaskChecklist(taskId),
      listUserOptions({ status: 'active' }),
    ])
      .then(([t, items, { users }]) => {
        setTask(t)
        setChecklist(items)
        setDescDraft(t.description ?? '')
        setStaffList(users)
      })
      .catch(() => { addToast('Không thể tải công việc', 'error'); onClose() })
      .finally(() => setLoading(false))
  }, [taskId]) // eslint-disable-line react-hooks/exhaustive-deps

  function applyUpdate(updated) {
    setTask(updated)
    onUpdated?.(updated)
  }

  async function changeStatus(newStatus) {
    setSaving(true)
    try {
      const updated = await tasksApi.changeTaskStatus(taskId, { status: newStatus })
      applyUpdate(updated)
      addToast(`Đã chuyển sang "${getLabel('task_status', newStatus, STATUS_LABELS[newStatus])}"`, 'success')
    } catch (err) {
      const status = err.response?.status
      const msg    = err.response?.data?.error?.message
      if (status === 409) {
        addToast('Checklist chưa hoàn thành — vào chi tiết để ép hoàn thành.', 'warning')
      } else if (status === 422) {
        addToast(msg ?? 'Bị chặn bởi dependency chưa xong', 'error')
      } else {
        addToast(msg ?? 'Không thể đổi trạng thái', 'error')
      }
    } finally { setSaving(false) }
  }

  async function changePriority(priority) {
    try {
      const updated = await tasksApi.updateTask(taskId, { priority })
      applyUpdate(updated)
      addToast(`Ưu tiên → "${getLabel('task_priority', priority, PRIORITY_LABELS[priority])}"`, 'success')
    } catch { addToast('Không thể đổi ưu tiên', 'error') }
  }

  async function changeSource(source) {
    try {
      const updated = await tasksApi.updateTask(taskId, { source })
      applyUpdate(updated)
      addToast(`Nguồn → "${getLabel('task_source', source, SOURCE_LABELS[source] ?? source)}"`, 'success')
    } catch { addToast('Không thể đổi nguồn công việc', 'error') }
  }

  async function changeStartDate(startDate) {
    try {
      const updated = await tasksApi.updateTask(taskId, { startDate: startDate || null })
      applyUpdate(updated)
      addToast(startDate ? 'Đã cập nhật ngày bắt đầu' : 'Đã xóa ngày bắt đầu', 'success')
    } catch { addToast('Không thể đổi ngày bắt đầu', 'error') }
  }

  async function changeDueDate(dueDate) {
    try {
      const updated = await tasksApi.updateTask(taskId, { dueDate: dueDate || null })
      applyUpdate(updated)
      addToast(dueDate ? 'Đã cập nhật ngày hết hạn' : 'Đã xóa ngày hết hạn', 'success')
    } catch { addToast('Không thể đổi ngày hết hạn', 'error') }
  }

  async function changeAssigned(assignedTo) {
    try {
      const updated = await tasksApi.updateTask(taskId, { assignedTo: assignedTo || null })
      applyUpdate(updated)
      const name = staffList.find((u) => u.id === assignedTo)?.name
      addToast(name ? `Đã giao cho ${name}` : 'Đã bỏ phân công', 'success')
    } catch { addToast('Không thể đổi người phụ trách', 'error') }
  }

  async function saveDescription() {
    if (!descDirty) return
    setSavingDesc(true)
    try {
      const updated = await tasksApi.updateTask(taskId, { description: descDraft.trim() || null })
      applyUpdate(updated)
      setDescDraft(updated.description ?? '')
      setDescDirty(false)
      addToast('Đã lưu mô tả', 'success')
    } catch { addToast('Không thể lưu mô tả', 'error') }
    finally { setSavingDesc(false) }
  }

  function syncChecklistCounts(newCl) {
    if (!task) return
    const done = newCl.filter((i) => i.isCompleted).length
    applyUpdate({ ...task, checklistTotal: newCl.length, checklistDone: done })
  }

  async function toggleChecklist(item) {
    if (togglingIds.has(item.id)) return
    setTogglingIds((p) => new Set([...p, item.id]))
    try {
      const updated = await tasksApi.updateTaskChecklistItem(taskId, item.id, { isCompleted: !item.isCompleted })
      const newCl = checklist.map((i) => i.id === updated.id ? updated : i)
      setChecklist(newCl)
      syncChecklistCounts(newCl)
    } catch { addToast('Không thể cập nhật checklist', 'error') }
    finally {
      setTogglingIds((p) => { const n = new Set(p); n.delete(item.id); return n })
    }
  }

  async function addChecklistItem() {
    const text = newItemText.trim()
    if (!text) return
    setAddingItem(true)
    try {
      const item = await tasksApi.addTaskChecklistItem(taskId, { stepText: text })
      const newCl = [...checklist, item]
      setChecklist(newCl)
      setNewItemText('')
      newItemRef.current?.focus()
      syncChecklistCounts(newCl)
    } catch { addToast('Không thể thêm việc cần làm', 'error') }
    finally { setAddingItem(false) }
  }

  async function removeChecklistItem(itemId) {
    try {
      await tasksApi.deleteTaskChecklistItem(taskId, itemId)
      const newCl = checklist.filter((i) => i.id !== itemId)
      setChecklist(newCl)
      syncChecklistCounts(newCl)
    } catch { addToast('Không thể xóa mục checklist', 'error') }
  }

  const overdue     = task ? isTaskOverdue(task) : false
  const transitions = task ? (STATUS_TRANSITIONS[task.status] ?? []) : []
  const clDone      = checklist.filter((i) => i.isCompleted).length
  const clTotal     = checklist.length
  const pct         = clTotal ? Math.round((clDone / clTotal) * 100) : null

  return (
    <>
      {/* Backdrop */}
      <div className={s.qvOverlay} onClick={onClose} />

      {/* Slide-in panel */}
      <div className={s.qvPanel}>

        {/* ── Header ── */}
        <div className={s.qvHeader}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {loading
              ? <div style={{ height: 20, width: '55%', background: '#f1f5f9', borderRadius: 4 }} />
              : <h2 className={s.qvTitle}>{task?.title}</h2>
            }
            {task && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <StatusBadge task={task} />
                <PriorityBadge priority={task.priority} />
                {overdue && (
                  <span className={s.overdueTag}><AlertTriangle size={10} /> Quá hạn</span>
                )}
              </div>
            )}
          </div>
          <div className={s.qvHeaderActions}>
            {task && (
              <button
                className={s.btnQvDetail}
                onClick={() => navigate(`/tasks/${taskId}`)}
                title="Mở trang chi tiết đầy đủ"
              >
                <ArrowUpRight size={13} /> Chi tiết
              </button>
            )}
            <button className={s.btnIcon} onClick={onClose} title="Đóng (Esc)">
              <X size={14} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className={s.loadingBox}><div className={s.spinner} /> Đang tải...</div>
        ) : task ? (
          <div className={s.qvBody}>

            {/* ── Status transitions ── */}
            {transitions.length > 0 && (
              <div className={s.qvStatusActions}>
                <span className={s.qvTransitionLabel}>Chuyển sang:</span>
                {transitions.map((st) => (
                  <button
                    key={st}
                    className={`${s.statusActionBtn} ${SA_CLASS[st] ?? ''}`}
                    onClick={() => changeStatus(st)}
                    disabled={saving}
                  >
                    {saving ? <Loader2 size={11} className={s.spinIcon} /> : null}
                    {getLabel('task_status', st, STATUS_LABELS[st])}
                  </button>
                ))}
              </div>
            )}

            {/* ── 2-column body ── */}
            <div className={s.qvGrid}>

              {/* ── LEFT: meta info ── */}
              <div className={s.qvLeft}>
                <div className={s.qvSectionTitle}>Thông tin</div>

                <div className={s.qvRow}>
                  <span className={s.qvLabel}><Building2 size={11} /> Khách hàng</span>
                  <span className={s.qvValue}>{task.companyName || '—'}</span>
                </div>

                {task.taskTypeName && (
                  <div className={s.qvRow}>
                    <span className={s.qvLabel}>Loại công việc</span>
                    <span className={s.qvValue}>{task.taskTypeName}</span>
                  </div>
                )}

                <div className={s.qvRow}>
                  <span className={s.qvLabel}><User size={11} /> Giao cho</span>
                  <select
                    value={task.assignedTo ?? ''}
                    onChange={(e) => changeAssigned(e.target.value || null)}
                    className={`${s.qeSelect} ${s.qvFieldSelect}`}
                  >
                    <option value="">— Chưa phân công —</option>
                    {staffList.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>

                <div className={s.qvRow}>
                  <span className={s.qvLabel}><Flag size={11} /> Ưu tiên</span>
                  <select
                    value={task.priority}
                    onChange={(e) => changePriority(e.target.value)}
                    className={`${s.qeSelect} ${s.qvFieldSelect}`}
                    style={{ ...(PRIORITY_SELECT_STYLE[task.priority] ?? {}), fontWeight: 600 }}
                  >
                    {['urgent', 'high', 'medium', 'low'].map((p) => (
                      <option key={p} value={p}>
                        {getLabel('task_priority', p, PRIORITY_LABELS[p])}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={s.qvRow}>
                  <span className={s.qvLabel}><Tag size={11} /> Nguồn</span>
                  <select
                    value={task.source ?? 'manual'}
                    onChange={(e) => changeSource(e.target.value)}
                    className={`${s.qeSelect} ${s.qvFieldSelect}`}
                  >
                    {(getOptions('task_source').length > 0
                      ? getOptions('task_source')
                      : [{ key: 'manual', label: 'Thủ công' }, { key: 'auto', label: 'Tự động' }]
                    ).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                </div>

                <div className={s.qvRow}>
                  <span className={s.qvLabel}><Calendar size={11} /> Bắt đầu</span>
                  <QvDateField
                    value={toDateValue(task.startDate || task.createdAt)}
                    onChange={(e) => changeStartDate(e.target.value)}
                  />
                </div>

                <div className={s.qvRow}>
                  <span className={s.qvLabel}><Clock size={11} /> Hết hạn</span>
                  {canEditDueDate(task, isAdmin) ? (
                    <QvDateField
                      value={toDateValue(task.dueDate)}
                      onChange={(e) => changeDueDate(e.target.value)}
                      isError={overdue}
                    />
                  ) : (
                    <span className={s.qvValue} title="Chỉ Quản trị viên được sửa (công việc này không phải từ lịch định kỳ)">
                      {task.dueDate ? fmtDate(task.dueDate) : '—'}
                    </span>
                  )}
                </div>

                {task.slaDays && (
                  <div className={s.qvRow}>
                    <span className={s.qvLabel}>SLA chuẩn</span>
                    <span className={s.qvValue}>{task.slaDays} ngày</span>
                  </div>
                )}

                {/* Ngày tạo — hệ thống tự lấy khi tạo task (không cho sửa) */}
                <div className={s.qvRow}>
                  <span className={s.qvLabel}><Calendar size={11} /> Ngày tạo</span>
                  <span className={s.qvValue}>{fmtDate(task.createdAt)}</span>
                </div>
              </div>

              {/* ── RIGHT: checklist + description ── */}
              <div className={s.qvRight}>

                {/* Checklist */}
                <div className={s.qvSection}>
                  <div className={s.qvSectionTitle}>
                    Checklist
                    {clTotal > 0 && (
                      <span style={{ fontWeight: 400, color: 'var(--color-muted)', marginLeft: 6 }}>
                        {clDone}/{clTotal}{pct !== null ? ` · ${pct}%` : ''}
                      </span>
                    )}
                  </div>

                  {clTotal > 0 && (
                    <div className={s.progressBar} style={{ marginBottom: 12 }}>
                      <div
                        className={`${s.progressFill} ${pct === 100 ? s.progressFillDone : ''}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}

                  <div className={s.qvChecklistList}>
                    {checklist.map((item) => {
                      const isToggling = togglingIds.has(item.id)
                      return (
                        <div key={item.id} className={s.qvChecklistItem}>
                          <div
                            className={`${s.checklistCheck} ${item.isCompleted ? s.checklistCheckDone : ''}`}
                            onClick={() => toggleChecklist(item)}
                            style={isToggling ? { opacity: 0.5, pointerEvents: 'none' } : { cursor: 'pointer' }}
                          >
                            {item.isCompleted && <Check size={10} color="#fff" />}
                          </div>
                          <span className={`${s.qvChecklistText} ${item.isCompleted ? s.qvChecklistTextDone : ''}`} style={{ whiteSpace: 'pre-wrap' }}>
                            {item.stepText}
                          </span>
                          <button
                            className={s.qvChecklistDel}
                            onClick={() => removeChecklistItem(item.id)}
                            title="Xóa"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      )
                    })}
                  </div>

                  {/* Add checklist item */}
                  <div className={s.qvAddItem}>
                    <Plus size={12} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
                    <textarea
                      ref={newItemRef}
                      value={newItemText}
                      onChange={(e) => setNewItemText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.altKey && !e.shiftKey) { e.preventDefault(); addChecklistItem() } }}
                      className={s.qvAddItemInput}
                      placeholder="Thêm việc cần làm… (Enter để thêm · Alt/Shift+Enter xuống dòng)"
                      rows={2}
                      style={{ resize: 'vertical' }}
                      disabled={addingItem}
                    />
                    {addingItem && <Loader2 size={13} className={s.spinIcon} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />}
                  </div>
                </div>

                {/* Description */}
                <div className={s.qvSection}>
                  <div className={s.qvSectionTitle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span><FileText size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />Mô tả</span>
                    {descDirty && (
                      <button
                        className={s.btnQvSave}
                        onClick={saveDescription}
                        disabled={savingDesc}
                      >
                        {savingDesc ? <Loader2 size={11} className={s.spinIcon} /> : <Check size={11} />}
                        Lưu
                      </button>
                    )}
                  </div>
                  <textarea
                    value={descDraft}
                    onChange={(e) => {
                      setDescDraft(e.target.value)
                      setDescDirty(e.target.value !== (task.description ?? ''))
                    }}
                    onBlur={saveDescription}
                    className={s.qvDescTextarea}
                    placeholder="Nhập mô tả công việc..."
                  />
                </div>

                {/* Links */}
                <div className={s.qvSection}>
                  <TaskLinksSection taskId={taskId} compact />
                </div>

                {/* Bình luận — để nhân viên/staff xem & trao đổi ngay trong quick view */}
                <div className={s.qvSection} style={{ borderBottom: 'none', marginBottom: 0 }}>
                  <div className={s.qvSectionTitle}>Bình luận</div>
                  <TaskComments taskId={taskId} />
                </div>

              </div>
            </div>

          </div>
        ) : null}
      </div>
    </>
  )
}
