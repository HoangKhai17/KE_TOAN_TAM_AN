import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  X, ArrowUpRight, Check, Loader2,
  Building2, User, Calendar, Clock, AlertTriangle, Flag, FileText,
} from 'lucide-react'
import * as tasksApi from '../../api/tasks'
import {
  STATUS_LABELS, STATUS_TRANSITIONS, STATUS_CSS,
  PRIORITY_LABELS, PRIORITY_CSS,
  fmtDate, isTaskOverdue, progressPct,
} from './taskUtils'
import { useEnumsStore } from '../../hooks/useEnums'
import { useToastStore } from '../../stores/toastStore'
import s from './tasks.module.css'

// ── Local constants (mirrors Tasks.jsx) ───────────────────────────────────────

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

// ── Main component ────────────────────────────────────────────────────────────

export default function TaskQuickView({ taskId, onClose, onUpdated }) {
  const navigate   = useNavigate()
  const addToast   = useToastStore((st) => st.toast)
  const getLabel   = useEnumsStore((st) => st.getLabel)

  const [task,        setTask]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [checklist,   setChecklist]   = useState([])
  const [togglingIds, setTogglingIds] = useState(new Set())
  const [saving,      setSaving]      = useState(false)

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Fetch task + checklist in parallel
  useEffect(() => {
    if (!taskId) return
    setLoading(true)
    setTask(null)
    setChecklist([])
    Promise.all([
      tasksApi.getTask(taskId),
      tasksApi.getTaskChecklist(taskId),
    ])
      .then(([t, items]) => { setTask(t); setChecklist(items) })
      .catch(() => { addToast('Không thể tải công việc', 'error'); onClose() })
      .finally(() => setLoading(false))
  }, [taskId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function changeStatus(newStatus) {
    setSaving(true)
    try {
      const updated = await tasksApi.changeTaskStatus(taskId, { status: newStatus })
      setTask(updated)
      addToast(`Đã chuyển sang "${getLabel('task_status', newStatus, STATUS_LABELS[newStatus])}"`, 'success')
      onUpdated?.(updated)
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
      setTask(updated)
      addToast(`Đã đổi ưu tiên → "${getLabel('task_priority', priority, PRIORITY_LABELS[priority])}"`, 'success')
      onUpdated?.(updated)
    } catch { addToast('Không thể đổi ưu tiên', 'error') }
  }

  async function changeDueDate(dueDate) {
    try {
      const updated = await tasksApi.updateTask(taskId, { dueDate: dueDate || null })
      setTask(updated)
      addToast(dueDate ? 'Đã cập nhật ngày hết hạn' : 'Đã xóa ngày hết hạn', 'success')
      onUpdated?.(updated)
    } catch { addToast('Không thể đổi ngày hết hạn', 'error') }
  }

  async function toggleChecklist(item) {
    if (togglingIds.has(item.id)) return
    setTogglingIds((p) => new Set([...p, item.id]))
    try {
      const updated = await tasksApi.updateTaskChecklistItem(taskId, item.id, { isCompleted: !item.isCompleted })
      setChecklist((p) => p.map((i) => i.id === updated.id ? updated : i))
    } catch { addToast('Không thể cập nhật checklist', 'error') }
    finally {
      setTogglingIds((p) => { const n = new Set(p); n.delete(item.id); return n })
    }
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
              ? <div style={{ height: 18, width: '60%', background: '#f1f5f9', borderRadius: 4 }} />
              : <h2 className={s.qvTitle}>{task?.title}</h2>
            }
            {task && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <StatusBadge status={task.status} />
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

            {/* ── Info section ── */}
            <div className={s.qvSection}>
              <div className={s.qvSectionTitle}>Thông tin</div>

              <div className={s.qvRow}>
                <span className={s.qvLabel}><Building2 size={11} /> Khách hàng</span>
                <span className={s.qvValue}>{task.companyName || '—'}</span>
              </div>

              <div className={s.qvRow}>
                <span className={s.qvLabel}><User size={11} /> Giao cho</span>
                <span className={s.qvValue}>{task.assignedToName || '—'}</span>
              </div>

              <div className={s.qvRow}>
                <span className={s.qvLabel}><Flag size={11} /> Ưu tiên</span>
                <select
                  value={task.priority}
                  onChange={(e) => changePriority(e.target.value)}
                  className={s.qeSelect}
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
                <span className={s.qvLabel}><Calendar size={11} /> Bắt đầu</span>
                <span className={s.qvValue}>{fmtDate(task.startDate || task.createdAt)}</span>
              </div>

              <div className={s.qvRow}>
                <span className={s.qvLabel}><Clock size={11} /> Hết hạn</span>
                <input
                  type="date"
                  value={task.dueDate?.slice(0, 10) ?? ''}
                  onChange={(e) => changeDueDate(e.target.value)}
                  className={s.qeDate}
                  style={overdue ? { borderColor: 'var(--color-danger)', color: 'var(--color-danger)' } : {}}
                />
              </div>

              {task.slaDays && (
                <div className={s.qvRow}>
                  <span className={s.qvLabel}>SLA chuẩn</span>
                  <span className={s.qvValue}>{task.slaDays} ngày</span>
                </div>
              )}
            </div>

            {/* ── Checklist ── */}
            {clTotal > 0 && (
              <div className={s.qvSection}>
                <div className={s.qvSectionTitle}>
                  Checklist — {clDone}/{clTotal}
                  {pct !== null && ` (${pct}%)`}
                </div>

                <div className={s.progressBar} style={{ marginBottom: 10 }}>
                  <div
                    className={`${s.progressFill} ${pct === 100 ? s.progressFillDone : ''}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

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
                      <span className={`${s.qvChecklistText} ${item.isCompleted ? s.qvChecklistTextDone : ''}`}>
                        {item.stepText}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── Description ── */}
            {task.description && (
              <div className={s.qvSection}>
                <div className={s.qvSectionTitle}><FileText size={11} style={{ display: 'inline', marginRight: 4 }} />Mô tả</div>
                <p className={s.qvDesc}>{task.description}</p>
              </div>
            )}

          </div>
        ) : null}
      </div>
    </>
  )
}
