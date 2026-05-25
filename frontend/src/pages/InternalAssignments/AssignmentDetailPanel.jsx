import { useState, useEffect, useRef } from 'react'
import {
  X, Check, ThumbsUp, Play, XCircle, Trash2, Loader2,
  MessageSquare, Plus, Search, Users, Building2, Calendar, Flag, FileText,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useToastStore } from '../../stores/toastStore'
import { useEnumsStore } from '../../hooks/useEnums'
import { listUserOptions } from '../../api/users'
import { listCompanies } from '../../api/companies'
import * as api from '../../api/internalAssignments'
import IaChecklistSection from './IaChecklistSection'
import IaLinksSection from './IaLinksSection'
import s from './internalAssignments.module.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS = {
  draft:     'Nháp',
  active:    'Đang thực hiện',
  done:      'Hoàn thành',
  cancelled: 'Đã hủy',
}

const STATUS_CSS = {
  draft:     s.badgeDraft,
  active:    s.badgeActive,
  done:      s.badgeDone,
  cancelled: s.badgeCancelled,
}

const PRIORITY_LABELS = {
  low:    'Thấp',
  normal: 'Bình thường',
  high:   'Cao',
  urgent: 'Khẩn cấp',
}

const PRIORITY_CSS = {
  low:    s.badgeLow,
  normal: s.badgeNormal,
  high:   s.badgeHigh,
  urgent: s.badgeUrgent,
}

const PRIORITY_SELECT_STYLE = {
  low:    { background: '#f8fafc', color: '#64748b', borderColor: '#e2e8f0' },
  normal: { background: '#eff6ff', color: '#1d4ed8', borderColor: '#93c5fd' },
  high:   { background: '#fff7ed', color: '#c2410c', borderColor: '#fdba74' },
  urgent: { background: '#fef2f2', color: '#b91c1c', borderColor: '#fca5a5' },
}

const ASSIGNEE_STATUS_LABELS = {
  pending:     'Chờ tiếp nhận',
  accepted:    'Đã tiếp nhận',
  in_progress: 'Đang làm',
  done:        'Hoàn thành',
  rejected:    'Từ chối',
}

const ASSIGNEE_STATUS_CSS = {
  pending:     s.chipPending,
  accepted:    s.chipAccepted,
  in_progress: s.chipInProgress,
  done:        s.chipDone,
  rejected:    s.chipRejected,
}

const IA_STATUS_TRANSITIONS = {
  draft:  ['active', 'cancelled'],
  active: ['done', 'cancelled'],
}

const IA_SA_CLASS = {
  active:    s.iaStatusBtnActive,
  done:      s.iaStatusBtnDone,
  cancelled: s.iaStatusBtnCancelled,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—'
  try { return format(parseISO(d), 'dd/MM/yyyy') } catch { return d }
}

function fmtDateTime(d) {
  if (!d) return '—'
  try { return format(typeof d === 'string' ? parseISO(d) : d, 'dd/MM/yyyy HH:mm') } catch { return d }
}

function initials(name) {
  if (!name) return '?'
  return name.split(' ').slice(-2).map((w) => w[0]).join('').toUpperCase()
}

// ── IaDateField ───────────────────────────────────────────────────────────────

function IaDateField({ value, onChange, isError }) {
  const ref = useRef(null)
  return (
    <div
      className={`${s.iaQvDateField} ${isError ? s.iaQvDateFieldError : ''}`}
      onClick={() => ref.current?.showPicker?.()}
    >
      <span className={s.iaQvDateValue}>{value ? fmtDate(value) : '—'}</span>
      <input
        ref={ref}
        type="date"
        value={value}
        onChange={onChange}
        className={s.iaQvDateHidden}
        tabIndex={-1}
      />
    </div>
  )
}

// ── RejectModal ───────────────────────────────────────────────────────────────

function RejectModal({ onConfirm, onClose, saving }) {
  const [note, setNote] = useState('')
  const err = note.trim().length === 0
  return (
    <div className={s.modalOverlay} onClick={onClose}>
      <div className={`${s.modal} ${s.modalSm}`} onClick={(e) => e.stopPropagation()}>
        <div className={s.modalHead}>
          <h3 className={s.modalTitle}>Từ chối phiếu</h3>
          <button className={s.panelClose} onClick={onClose}><X size={15} /></button>
        </div>
        <div className={s.modalBody}>
          <div className={s.formGroup}>
            <label className={s.formLabel}>Lý do từ chối *</label>
            <textarea
              className={`${s.formTextarea} ${err && note.length > 0 ? s.formInputError : ''}`}
              placeholder="Nhập lý do từ chối..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoFocus
              rows={4}
            />
            {err && note.length > 0 && <span className={s.formError}>Lý do không được để trống</span>}
          </div>
        </div>
        <div className={s.modalFooter}>
          <button className={s.btnSecondary} onClick={onClose} disabled={saving}>Huỷ</button>
          <button
            className={s.btnDanger}
            disabled={saving || err}
            onClick={() => !err && onConfirm(note.trim())}
          >
            {saving ? <><Loader2 size={13} className={s.spinIcon} /> Đang gửi...</> : <><XCircle size={13} /> Từ chối</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── CompleteModal ─────────────────────────────────────────────────────────────

function CompleteModal({ onConfirm, onClose, saving }) {
  const [note, setNote] = useState('')
  return (
    <div className={s.modalOverlay} onClick={onClose}>
      <div className={`${s.modal} ${s.modalSm}`} onClick={(e) => e.stopPropagation()}>
        <div className={s.modalHead}>
          <h3 className={s.modalTitle}>Báo hoàn thành</h3>
          <button className={s.panelClose} onClick={onClose}><X size={15} /></button>
        </div>
        <div className={s.modalBody}>
          <div className={s.formGroup}>
            <label className={s.formLabel}>Ghi chú (tuỳ chọn)</label>
            <textarea
              className={s.formTextarea}
              placeholder="Ghi chú kết quả..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoFocus
              rows={4}
            />
          </div>
        </div>
        <div className={s.modalFooter}>
          <button className={s.btnSecondary} onClick={onClose} disabled={saving}>Huỷ</button>
          <button className={s.btnSuccess} disabled={saving} onClick={() => onConfirm(note.trim() || null)}>
            {saving ? <><Loader2 size={13} className={s.spinIcon} /> Đang gửi...</> : <><Check size={13} /> Hoàn thành</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── DeleteModal ───────────────────────────────────────────────────────────────

function DeleteModal({ title, onConfirm, onClose, saving }) {
  return (
    <div className={s.miniOverlay}>
      <div className={s.miniDialog}>
        <h4 className={s.miniTitle}>Xóa phiếu giao việc</h4>
        <p className={s.miniBody}>
          Bạn có chắc chắn muốn xóa phiếu <strong>"{title}"</strong>? Hành động này không thể hoàn tác.
        </p>
        <div className={s.miniActions}>
          <button onClick={onClose} className={s.btnSecondary} disabled={saving}>Hủy bỏ</button>
          <button onClick={onConfirm} disabled={saving} className={s.btnDanger}>
            {saving ? <><Loader2 size={13} className={s.spinIcon} /> Đang xóa...</> : <><Trash2 size={13} /> Xóa</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function AssignmentDetailPanel({
  assignmentId, currentUser, isAdmin, onClose, onUpdate,
}) {
  const addToast   = useToastStore((st) => st.toast)
  const getOptions = useEnumsStore((st) => st.getOptions)

  const [item,    setItem]    = useState(null)
  const [loading, setLoading] = useState(true)

  // Title inline edit
  const [titleDraft,  setTitleDraft]  = useState('')
  const [titleDirty,  setTitleDirty]  = useState(false)
  const [savingTitle, setSavingTitle] = useState(false)

  // Description inline edit
  const [descDraft,  setDescDraft]  = useState('')
  const [descDirty,  setDescDirty]  = useState(false)
  const [savingDesc, setSavingDesc] = useState(false)

  // Reference data (admin)
  const [staffList,   setStaffList]   = useState([])
  const [companies,   setCompanies]   = useState([])
  const [staffSearch, setStaffSearch] = useState('')

  // Comment
  const [commentText, setCommentText] = useState('')
  const [submitting,  setSubmitting]  = useState(false)

  // Modal / action
  const [modal,  setModal]  = useState(null)
  const [acting, setActing] = useState(false)

  // Load assignment
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.getAssignment(assignmentId)
      .then((data) => {
        if (!cancelled) {
          setItem(data)
          setTitleDraft(data.title ?? '')
          setDescDraft(data.description ?? '')
          setTitleDirty(false)
          setDescDirty(false)
          setLoading(false)
        }
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [assignmentId])

  // Load reference data
  useEffect(() => {
    listUserOptions({ status: 'active' }).then(({ users }) => setStaffList(users)).catch(() => {})
    listCompanies({ limit: 300, status: 'active' }).then(({ companies: c }) => setCompanies(c)).catch(() => {})
  }, [])

  const filteredStaff = staffSearch.trim()
    ? staffList.filter((u) => u.name.toLowerCase().includes(staffSearch.toLowerCase()))
    : staffList

  const myAssigneeEarly = item?.assignees?.find((a) => a.userId === currentUser?.id) ?? null
  const canEdit     = !!(item && ['draft', 'active'].includes(item.status))
  const canEditDesc = !!(item && ['draft', 'active'].includes(item.status))
  const isOverdueField = item?.deadlineDate && item?.status === 'active' && new Date(item.deadlineDate) < new Date()

  // ── Field save handlers ───────────────────────────────────────────────────

  async function handleSaveTitle() {
    if (!titleDirty) return
    const trimmed = titleDraft.trim()
    if (!trimmed) { setTitleDraft(item.title); setTitleDirty(false); return }
    setSavingTitle(true)
    try {
      const updated = await api.updateAssignment(assignmentId, { title: trimmed })
      setItem(updated)
      setTitleDirty(false)
      onUpdate?.()
    } catch (err) {
      addToast(err?.response?.data?.error?.message ?? 'Không thể cập nhật tiêu đề', 'error')
      setTitleDraft(item.title)
      setTitleDirty(false)
    } finally { setSavingTitle(false) }
  }

  async function handleSaveDesc() {
    if (!descDirty) return
    setSavingDesc(true)
    try {
      const updated = await api.updateAssignment(assignmentId, { description: descDraft.trim() || null })
      setItem(updated)
      setDescDirty(false)
      onUpdate?.()
    } catch (err) {
      addToast(err?.response?.data?.error?.message ?? 'Không thể cập nhật mô tả', 'error')
    } finally { setSavingDesc(false) }
  }

  async function handleSavePriority(newPriority) {
    if (newPriority === item.priority) return
    try {
      const updated = await api.updateAssignment(assignmentId, { priority: newPriority })
      setItem(updated)
      onUpdate?.()
    } catch (err) {
      addToast(err?.response?.data?.error?.message ?? 'Không thể cập nhật ưu tiên', 'error')
    }
  }

  async function handleSaveDeadline(val) {
    const newDeadline = val || null
    if (newDeadline === (item.deadlineDate ?? null)) return
    try {
      const updated = await api.updateAssignment(assignmentId, { deadlineDate: newDeadline })
      setItem(updated)
      onUpdate?.()
    } catch (err) {
      addToast(err?.response?.data?.error?.message ?? 'Không thể cập nhật hạn', 'error')
    }
  }

  async function handleSaveCompany(val) {
    const newId = val || null
    if (newId === (item.company?.id ?? null)) return
    try {
      const updated = await api.updateAssignment(assignmentId, { companyId: newId })
      setItem(updated)
      onUpdate?.()
    } catch (err) {
      addToast(err?.response?.data?.error?.message ?? 'Không thể cập nhật khách hàng', 'error')
    }
  }

  async function handleSaveStatus(newStatus) {
    if (newStatus === item.status) return
    setActing(true)
    try {
      let updated
      if (newStatus === 'active')         updated = await api.sendAssignment(assignmentId)
      else if (newStatus === 'done')      updated = await api.closeAssignment(assignmentId)
      else if (newStatus === 'cancelled') updated = await api.cancelAssignment(assignmentId)
      if (updated) {
        setItem(updated)
        setTitleDraft(updated.title ?? '')
        setDescDraft(updated.description ?? '')
      } else {
        const reloaded = await api.getAssignment(assignmentId)
        setItem(reloaded)
        setTitleDraft(reloaded.title ?? '')
        setDescDraft(reloaded.description ?? '')
      }
      addToast(`Đã chuyển sang "${STATUS_LABELS[newStatus]}"`, 'success')
      onUpdate?.()
    } catch (err) {
      addToast(err?.response?.data?.error?.message ?? 'Không thể cập nhật trạng thái', 'error')
    } finally { setActing(false) }
  }

  async function handleToggleAssignee(userId) {
    const existing = item?.assignees?.find((a) => a.userId === userId)
    const isActive = existing && !['pending', 'rejected'].includes(existing.status)
    if (isActive) return
    try {
      const body = existing
        ? { removeAssigneeIds: [userId] }
        : { addAssigneeIds: [userId] }
      const updated = await api.updateAssignment(assignmentId, body)
      if (updated) setItem(updated)
      onUpdate?.()
    } catch (err) {
      addToast(err?.response?.data?.error?.message ?? 'Không thể cập nhật nhân sự', 'error')
    }
  }

  // ── Lifecycle / staff actions ─────────────────────────────────────────────

  async function doAction(fn, successMsg, closeAfter = false) {
    setActing(true)
    try {
      const result = await fn()
      if (result) setItem(result)
      addToast(successMsg, 'success')
      onUpdate?.()
      if (closeAfter) onClose()
      setModal(null)
    } catch (err) {
      addToast(err?.response?.data?.error?.message ?? 'Có lỗi xảy ra', 'error')
    } finally { setActing(false) }
  }

  async function handleDelete()   { await doAction(() => api.deleteAssignment(assignmentId),   'Đã xóa phiếu', true) }
  async function handleAccept()   { await doAction(() => api.acceptAssignment(assignmentId),   'Đã tiếp nhận phiếu') }
  async function handleProgress() { await doAction(() => api.progressAssignment(assignmentId), 'Đã bắt đầu thực hiện') }
  async function handleComplete(note) { await doAction(() => api.completeAssignment(assignmentId, note), 'Đã báo hoàn thành') }
  async function handleReject(note)   { await doAction(() => api.rejectAssignment(assignmentId, note),  'Đã từ chối phiếu') }

  async function handleAddComment() {
    if (!commentText.trim()) return
    setSubmitting(true)
    try {
      const comment = await api.addComment(assignmentId, commentText.trim())
      setItem((prev) => ({ ...prev, comments: [...(prev?.comments ?? []), comment] }))
      setCommentText('')
    } catch (err) {
      addToast(err?.response?.data?.error?.message ?? 'Không thể gửi comment', 'error')
    } finally { setSubmitting(false) }
  }

  async function handleDeleteComment(commentId) {
    try {
      await api.deleteComment(assignmentId, commentId)
      setItem((prev) => ({ ...prev, comments: (prev?.comments ?? []).filter((c) => c.id !== commentId) }))
    } catch (err) {
      addToast(err?.response?.data?.error?.message ?? 'Không thể xóa comment', 'error')
    }
  }

  const myAssignee  = myAssigneeEarly
  const canAccept   = myAssignee?.status === 'pending'
  const canProgress = myAssignee?.status === 'accepted'
  const canComplete = ['accepted', 'in_progress'].includes(myAssignee?.status)
  const canReject   = ['pending', 'accepted'].includes(myAssignee?.status)

  const priorityOptions = getOptions('assignment_priority').length > 0
    ? getOptions('assignment_priority')
    : [{ key: 'low', label: 'Thấp' }, { key: 'normal', label: 'Bình thường' }, { key: 'high', label: 'Cao' }, { key: 'urgent', label: 'Khẩn cấp' }]

  const transitions = item ? (IA_STATUS_TRANSITIONS[item.status] ?? []) : []

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className={s.panelOverlay} onClick={onClose}>
        <div className={s.panel} onClick={(e) => e.stopPropagation()}>

          {/* ── Header ── */}
          <div className={s.panelHead}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {loading ? (
                <div className={s.skeletonBar} style={{ width: '65%', height: 18 }} />
              ) : canEdit ? (
                <input
                  type="text"
                  className={s.panelTitleEditable}
                  value={titleDraft}
                  onChange={(e) => { setTitleDraft(e.target.value); setTitleDirty(true) }}
                  onBlur={handleSaveTitle}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
                  placeholder="Tiêu đề phiếu..."
                  disabled={savingTitle}
                />
              ) : (
                <h2 className={s.panelTitle}>{item?.title}</h2>
              )}
              {item && (
                <div className={s.panelHeadBadges} style={{ marginTop: 6 }}>
                  <span className={`${s.badge} ${STATUS_CSS[item.status]}`}>{STATUS_LABELS[item.status]}</span>
                  <span className={`${s.badge} ${PRIORITY_CSS[item.priority]}`}>{PRIORITY_LABELS[item.priority]}</span>
                  {isOverdueField && <span className={s.iaOverdueTag}>⚠ Quá hạn</span>}
                </div>
              )}
            </div>
            <div className={s.panelHeadActions}>
              {canEdit && item?.status === 'draft' && (
                <button
                  className={`${s.btnIcon} ${s.btnIconDanger}`}
                  onClick={() => setModal('delete')}
                  title="Xóa phiếu"
                >
                  <Trash2 size={13} />
                </button>
              )}
              <button className={s.panelClose} onClick={onClose}><X size={15} /></button>
            </div>
          </div>

          {/* ── Status transition bar ── */}
          {item && !loading && transitions.length > 0 && (
            <div className={s.iaStatusBar}>
              <span className={s.iaStatusBarLabel}>Chuyển sang:</span>
              {transitions.map((st) => (
                <button
                  key={st}
                  className={`${s.statusActionBtn} ${IA_SA_CLASS[st] ?? ''}`}
                  onClick={() => handleSaveStatus(st)}
                  disabled={acting}
                >
                  {STATUS_LABELS[st]}
                </button>
              ))}
            </div>
          )}

          {/* ── Body ── */}
          <div className={s.panelBody}>
            {loading ? (
              <div className={s.panelSkeleton}>
                {[70, 45, 60, 40].map((w, i) => (
                  <div key={i} className={s.skeletonBar} style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : item ? (
              <div className={s.iaQvGrid}>

                {/* ── Left column — metadata ── */}
                <div className={s.iaQvLeft}>
                  <div className={s.iaQvSectionTitle}>Thông tin</div>

                  {/* Trạng thái */}
                  <div className={s.iaQvRow}>
                    <span className={s.iaQvLabel}>Trạng thái</span>
                    {canEdit ? (
                      <select
                        className={`${s.qeSelect} ${s.iaQvFieldSelect}`}
                        value={item.status}
                        onChange={(e) => handleSaveStatus(e.target.value)}
                        disabled={acting}
                      >
                        <option value={item.status}>{STATUS_LABELS[item.status]}</option>
                        {(IA_STATUS_TRANSITIONS[item.status] ?? []).map((st) => (
                          <option key={st} value={st}>{STATUS_LABELS[st]}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`${s.badge} ${STATUS_CSS[item.status]}`}>{STATUS_LABELS[item.status]}</span>
                    )}
                  </div>

                  {/* Ưu tiên */}
                  <div className={s.iaQvRow}>
                    <span className={s.iaQvLabel}><Flag size={11} /> Ưu tiên</span>
                    {canEdit ? (
                      <select
                        className={`${s.qeSelect} ${s.iaQvFieldSelect}`}
                        value={item.priority}
                        onChange={(e) => handleSavePriority(e.target.value)}
                        style={{ ...(PRIORITY_SELECT_STYLE[item.priority] ?? {}), fontWeight: 700 }}
                      >
                        {priorityOptions.map((o) => (
                          <option key={o.key} value={o.key}>{o.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`${s.badge} ${PRIORITY_CSS[item.priority]}`}>{PRIORITY_LABELS[item.priority]}</span>
                    )}
                  </div>

                  {/* Khách hàng */}
                  <div className={s.iaQvRow}>
                    <span className={s.iaQvLabel}><Building2 size={11} /> Khách hàng</span>
                    {canEdit ? (
                      <select
                        className={`${s.qeSelect} ${s.iaQvFieldSelect}`}
                        value={item.company?.id ?? ''}
                        onChange={(e) => handleSaveCompany(e.target.value)}
                      >
                        <option value="">— Không gắn —</option>
                        {companies.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={s.iaQvValue}>
                        {item.company?.name ?? <span className={s.internalBadge}>Nội bộ</span>}
                      </span>
                    )}
                  </div>

                  {/* Người tạo */}
                  <div className={s.iaQvRow}>
                    <span className={s.iaQvLabel}>Người tạo</span>
                    <span className={s.iaQvValue}>{item.createdBy?.name ?? '—'}</span>
                  </div>

                  {/* Ngày tạo */}
                  <div className={s.iaQvRow}>
                    <span className={s.iaQvLabel}><Calendar size={11} /> Ngày tạo</span>
                    <span className={s.iaQvValue}>{fmtDate(item.createdAt)}</span>
                  </div>

                  {/* Hạn hoàn thành */}
                  <div className={s.iaQvRow}>
                    <span className={s.iaQvLabel}><Calendar size={11} /> Hết hạn</span>
                    {canEdit ? (
                      <IaDateField
                        value={item.deadlineDate ? item.deadlineDate.slice(0, 10) : ''}
                        onChange={(e) => handleSaveDeadline(e.target.value)}
                        isError={isOverdueField}
                      />
                    ) : (
                      <span className={`${s.iaQvValue} ${isOverdueField ? s.iaQvValueDanger : ''}`}>
                        {fmtDate(item.deadlineDate)}
                      </span>
                    )}
                  </div>

                  {item.sentAt && (
                    <div className={s.iaQvRow}>
                      <span className={s.iaQvLabel}>Ngày gửi</span>
                      <span className={s.iaQvValue}>{fmtDateTime(item.sentAt)}</span>
                    </div>
                  )}

                  {item.closedAt && (
                    <div className={s.iaQvRow}>
                      <span className={s.iaQvLabel}>Ngày đóng</span>
                      <span className={s.iaQvValue}>{fmtDateTime(item.closedAt)}</span>
                    </div>
                  )}
                </div>

                {/* ── Right column — content ── */}
                <div className={s.iaQvRight}>

                  {/* Nhân sự thực hiện */}
                  <div className={s.iaQvSection}>
                    <div className={s.iaQvSectionTitle}>
                      <Users size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                      Nhân sự thực hiện ({item.assignees?.length ?? 0})
                    </div>

                    {(item.assignees ?? []).length === 0 ? (
                      <p className={s.panelEmptyText}>Chưa có nhân sự</p>
                    ) : (
                      <div className={s.assigneeList}>
                        {item.assignees.map((a) => (
                          <div key={a.userId} className={s.assigneeRow}>
                            <div className={s.assigneeInfo}>
                              <div className={s.avatarSm}>{initials(a.name)}</div>
                              <div>
                                <div className={s.assigneeName}>{a.name}</div>
                                {a.note && <div className={s.assigneeNote}>"{a.note}"</div>}
                              </div>
                            </div>
                            <span className={`${s.assigneeChip} ${ASSIGNEE_STATUS_CSS[a.status]}`}>
                              {ASSIGNEE_STATUS_LABELS[a.status]}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {canEdit && staffList.length > 0 && (
                      <div className={s.staffPickerWrap} style={{ marginTop: 10 }}>
                        <div className={s.staffPickerSearch}>
                          <Search size={13} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
                          <input
                            type="text"
                            className={s.staffPickerSearchInput}
                            placeholder="Thêm / xóa nhân sự..."
                            value={staffSearch}
                            onChange={(e) => setStaffSearch(e.target.value)}
                          />
                        </div>
                        <div className={s.staffPickerList}>
                          {filteredStaff.length === 0 ? (
                            <div className={s.staffPickerEmpty}>Không tìm thấy nhân viên</div>
                          ) : filteredStaff.map((u) => {
                            const existing = item?.assignees?.find((a) => a.userId === u.id)
                            const isChecked = !!existing
                            const isActive  = existing && !['pending', 'rejected'].includes(existing.status)
                            return (
                              <label
                                key={u.id}
                                className={`${s.staffPickerItem} ${isActive ? s.staffPickerItemDisabled : ''}`}
                                title={isActive ? 'Không thể xóa nhân sự đang thực hiện' : ''}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  disabled={isActive}
                                  onChange={() => !isActive && handleToggleAssignee(u.id)}
                                />
                                <span className={s.staffPickerName}>{u.name}</span>
                                {isChecked && <Check size={12} className={s.staffPickerCheck} />}
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Checklist */}
                  <div className={s.iaQvSection}>
                    <IaChecklistSection
                      assignmentId={assignmentId}
                      readOnly={item.status === 'cancelled' || item.status === 'done'}
                    />
                  </div>

                  {/* Mô tả */}
                  <div className={s.iaQvSection}>
                    <div className={s.iaQvSectionTitleRow}>
                      <span className={s.iaQvSectionTitle} style={{ marginBottom: 0 }}>
                        <FileText size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                        Mô tả
                      </span>
                      {descDirty && (
                        <button
                          className={s.btnQvSave}
                          onClick={handleSaveDesc}
                          disabled={savingDesc}
                        >
                          {savingDesc ? <Loader2 size={11} className={s.spinIcon} /> : <Check size={11} />}
                          Lưu
                        </button>
                      )}
                    </div>
                    {canEditDesc ? (
                      <textarea
                        className={s.iaQvDescTextarea}
                        value={descDraft}
                        onChange={(e) => {
                          setDescDraft(e.target.value)
                          setDescDirty(e.target.value !== (item.description ?? ''))
                        }}
                        onBlur={handleSaveDesc}
                        placeholder="Nhập mô tả công việc..."
                      />
                    ) : item.description ? (
                      <p className={s.descriptionText}>{item.description}</p>
                    ) : (
                      <p className={s.panelEmptyText}>Chưa có mô tả</p>
                    )}
                  </div>

                  {/* Links */}
                  <div className={s.iaQvSection}>
                    <IaLinksSection assignmentId={assignmentId} />
                  </div>

                  {/* Comments */}
                  <div className={s.iaQvSection} style={{ borderBottom: 'none', marginBottom: 0 }}>
                    <div className={s.iaQvSectionTitle}>
                      <MessageSquare size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                      Bình luận ({item.comments?.length ?? 0})
                    </div>

                    <div className={s.commentList}>
                      {(item.comments ?? []).map((c) => (
                        <div key={c.id} className={s.commentItem}>
                          <div className={s.avatarSm}>{initials(c.user?.name)}</div>
                          <div className={s.commentBody}>
                            <div className={s.commentHeader}>
                              <span className={s.commentAuthor}>{c.user?.name}</span>
                              <span className={s.commentTime}>{fmtDateTime(c.createdAt)}</span>
                            </div>
                            <p className={s.commentText}>{c.content}</p>
                          </div>
                          {c.user?.id === currentUser?.id && (
                            <button
                              className={s.commentDelete}
                              onClick={() => handleDeleteComment(c.id)}
                              title="Xóa"
                            >
                              <X size={11} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {item.status !== 'cancelled' && (
                      <div className={s.commentForm}>
                        <textarea
                          className={s.commentTextarea}
                          placeholder="Thêm bình luận..."
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddComment()
                          }}
                          rows={2}
                        />
                        <button
                          className={`${s.btnPrimary} ${s.commentSendBtn}`}
                          onClick={handleAddComment}
                          disabled={submitting || !commentText.trim()}
                        >
                          {submitting ? <Loader2 size={13} className={s.spinIcon} /> : <Plus size={14} />}
                        </button>
                      </div>
                    )}
                  </div>

                </div>
              </div>
            ) : (
              <p className={s.panelEmptyText}>Không thể tải phiếu</p>
            )}
          </div>

          {/* ── Footer — assignee actions ── */}
          {item && !loading && item.status === 'active' && myAssignee && (
            <div className={s.panelFooter}>
              <div className={s.panelActions}>
                {canAccept && (
                  <button className={s.btnPrimary} onClick={handleAccept} disabled={acting}>
                    {acting ? <Loader2 size={13} className={s.spinIcon} /> : <ThumbsUp size={13} />}
                    Tiếp nhận
                  </button>
                )}
                {canProgress && (
                  <button className={s.btnPrimary} onClick={handleProgress} disabled={acting}>
                    {acting ? <Loader2 size={13} className={s.spinIcon} /> : <Play size={13} />}
                    Bắt đầu làm
                  </button>
                )}
                {canComplete && (
                  <button className={s.btnSuccess} onClick={() => setModal('complete')} disabled={acting}>
                    <Check size={13} /> Báo hoàn thành
                  </button>
                )}
                {canReject && (
                  <button className={s.btnDanger} onClick={() => setModal('reject')} disabled={acting}>
                    <XCircle size={13} /> Từ chối
                  </button>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Modals ── */}
      {modal === 'reject' && (
        <RejectModal saving={acting} onConfirm={handleReject} onClose={() => setModal(null)} />
      )}
      {modal === 'complete' && (
        <CompleteModal saving={acting} onConfirm={handleComplete} onClose={() => setModal(null)} />
      )}
      {modal === 'delete' && (
        <DeleteModal
          title={item?.title}
          saving={acting}
          onConfirm={handleDelete}
          onClose={() => !acting && setModal(null)}
        />
      )}
    </>
  )
}
