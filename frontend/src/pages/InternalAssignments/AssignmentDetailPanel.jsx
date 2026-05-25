import { useState, useEffect } from 'react'
import {
  X, Send, Ban, CheckCircle, ThumbsUp, Play, Check,
  XCircle, Pencil, Trash2, Loader2, MessageSquare, Plus,
  Save, Search,
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
            {err && note.length > 0 && (
              <span className={s.formError}>Lý do không được để trống</span>
            )}
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
              placeholder="Ghi chú kết quả, đính kèm thông tin..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoFocus
              rows={4}
            />
          </div>
        </div>
        <div className={s.modalFooter}>
          <button className={s.btnSecondary} onClick={onClose} disabled={saving}>Huỷ</button>
          <button
            className={s.btnSuccess}
            disabled={saving}
            onClick={() => onConfirm(note.trim() || null)}
          >
            {saving ? <><Loader2 size={13} className={s.spinIcon} /> Đang gửi...</> : <><Check size={13} /> Hoàn thành</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ConfirmModal ──────────────────────────────────────────────────────────────

function ConfirmModal({ title, body, confirmLabel, confirmClass, onConfirm, onClose, saving }) {
  return (
    <div className={s.modalOverlay} onClick={onClose}>
      <div className={`${s.modal} ${s.modalSm}`} onClick={(e) => e.stopPropagation()}>
        <div className={s.modalHead}>
          <h3 className={s.modalTitle}>{title}</h3>
          <button className={s.panelClose} onClick={onClose}><X size={15} /></button>
        </div>
        <div className={s.modalBody}>
          <p className={s.confirmBody}>{body}</p>
        </div>
        <div className={s.modalFooter}>
          <button className={s.btnSecondary} onClick={onClose} disabled={saving}>Huỷ</button>
          <button className={confirmClass} disabled={saving} onClick={onConfirm}>
            {saving ? <Loader2 size={13} className={s.spinIcon} /> : confirmLabel}
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
  const addToast  = useToastStore((st) => st.toast)
  const getOptions = useEnumsStore((st) => st.getOptions)

  const [item,    setItem]    = useState(null)
  const [loading, setLoading] = useState(true)

  // Edit mode
  const [editing,      setEditing]      = useState(false)
  const [editForm,     setEditForm]     = useState({})
  const [staffList,    setStaffList]    = useState([])
  const [companies,    setCompanies]    = useState([])
  const [staffSearch,  setStaffSearch]  = useState('')
  const [addIds,       setAddIds]       = useState([])
  const [removeIds,    setRemoveIds]    = useState([])
  const [savingEdit,   setSavingEdit]   = useState(false)

  // Comment state
  const [commentText, setCommentText] = useState('')
  const [submitting,  setSubmitting]  = useState(false)

  // Modal state
  const [modal, setModal] = useState(null)
  const [acting, setActing] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.getAssignment(assignmentId)
      .then((data) => { if (!cancelled) { setItem(data); setLoading(false) } })
      .catch(() => { if (!cancelled) { setLoading(false) } })
    return () => { cancelled = true }
  }, [assignmentId])

  // Load reference data for edit mode (lazy)
  function openEdit() {
    setEditForm({
      title:        item.title,
      description:  item.description ?? '',
      priority:     item.priority,
      deadlineDate: item.deadlineDate ?? '',
      companyId:    item.company?.id ?? '',
    })
    setAddIds([])
    setRemoveIds([])
    setStaffSearch('')
    setEditing(true)
    if (staffList.length === 0) {
      listUserOptions({ status: 'active' }).then(({ users }) => setStaffList(users)).catch(() => {})
    }
    if (companies.length === 0) {
      listCompanies({ limit: 300, status: 'active' }).then(({ companies: c }) => setCompanies(c)).catch(() => {})
    }
  }

  function cancelEdit() {
    setEditing(false)
    setAddIds([])
    setRemoveIds([])
  }

  function setEF(k, v) { setEditForm((p) => ({ ...p, [k]: v })) }

  function isAssigneeChecked(userId) {
    const existing = item?.assignees?.find((a) => a.userId === userId)
    if (existing) return !removeIds.includes(userId)
    return addIds.includes(userId)
  }

  function toggleEditAssignee(userId) {
    const existing = item?.assignees?.find((a) => a.userId === userId)
    const isActive = existing && !['pending', 'rejected'].includes(existing.status)
    if (isActive) return
    if (existing) {
      setRemoveIds((p) => p.includes(userId) ? p.filter((id) => id !== userId) : [...p, userId])
    } else {
      setAddIds((p) => p.includes(userId) ? p.filter((id) => id !== userId) : [...p, userId])
    }
  }

  async function handleSaveEdit() {
    if (!editForm.title?.trim()) {
      addToast('Tiêu đề không được để trống', 'error')
      return
    }
    setSavingEdit(true)
    try {
      const body = {}
      if (editForm.title.trim()       !== item.title)              body.title        = editForm.title.trim()
      if (editForm.description.trim() !== (item.description ?? '')) body.description  = editForm.description.trim() || null
      if (editForm.priority           !== item.priority)            body.priority     = editForm.priority
      if (editForm.deadlineDate       !== (item.deadlineDate ?? '')) body.deadlineDate = editForm.deadlineDate || null
      if (editForm.companyId          !== (item.company?.id ?? '')) body.companyId    = editForm.companyId || null
      if (addIds.length)    body.addAssigneeIds    = addIds
      if (removeIds.length) body.removeAssigneeIds = removeIds

      const updated = await api.updateAssignment(assignmentId, body)
      setItem(updated)
      setEditing(false)
      setAddIds([])
      setRemoveIds([])
      addToast('Đã cập nhật phiếu', 'success')
      onUpdate?.()
    } catch (err) {
      addToast(err?.response?.data?.error?.message ?? 'Không thể cập nhật phiếu', 'error')
    } finally {
      setSavingEdit(false)
    }
  }

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
    } finally {
      setActing(false)
    }
  }

  async function handleSend()    { await doAction(() => api.sendAssignment(assignmentId),     'Đã gửi phiếu') }
  async function handleCancel()  { await doAction(() => api.cancelAssignment(assignmentId),   'Đã hủy phiếu') }
  async function handleClose()   { await doAction(() => api.closeAssignment(assignmentId),    'Đã đóng phiếu') }
  async function handleDelete()  { await doAction(() => api.deleteAssignment(assignmentId),   'Đã xóa phiếu', true) }
  async function handleAccept()  { await doAction(() => api.acceptAssignment(assignmentId),   'Đã tiếp nhận phiếu') }
  async function handleProgress(){ await doAction(() => api.progressAssignment(assignmentId), 'Đã bắt đầu thực hiện') }
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
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteComment(commentId) {
    try {
      await api.deleteComment(assignmentId, commentId)
      setItem((prev) => ({
        ...prev,
        comments: (prev?.comments ?? []).filter((c) => c.id !== commentId),
      }))
    } catch (err) {
      addToast(err?.response?.data?.error?.message ?? 'Không thể xóa comment', 'error')
    }
  }

  const myAssignee = item ? item.assignees?.find((a) => a.userId === currentUser?.id) : null
  const canAccept   = myAssignee?.status === 'pending'
  const canProgress = myAssignee?.status === 'accepted'
  const canComplete = ['accepted', 'in_progress'].includes(myAssignee?.status)
  const canReject   = ['pending', 'accepted'].includes(myAssignee?.status)

  const canEdit = isAdmin && item && ['draft', 'active'].includes(item.status)

  const filteredStaff = staffSearch.trim()
    ? staffList.filter((u) => u.name.toLowerCase().includes(staffSearch.toLowerCase()))
    : staffList

  const priorityOptions = getOptions('assignment_priority').length > 0
    ? getOptions('assignment_priority')
    : [{ key: 'low', label: 'Thấp' }, { key: 'normal', label: 'Bình thường' }, { key: 'high', label: 'Cao' }, { key: 'urgent', label: 'Khẩn cấp' }]

  return (
    <>
      <div className={s.panelOverlay} onClick={onClose}>
        <div className={s.panel} onClick={(e) => e.stopPropagation()}>

          {/* ── Head ── */}
          <div className={s.panelHead}>
            <div className={s.panelHeadContent}>
              {loading ? (
                <div className={s.skeletonBar} style={{ width: '70%', height: 18 }} />
              ) : (
                <>
                  {editing ? (
                    <input
                      type="text"
                      className={s.panelTitleInput}
                      value={editForm.title}
                      onChange={(e) => setEF('title', e.target.value)}
                      placeholder="Tiêu đề phiếu..."
                    />
                  ) : (
                    <p className={s.panelTitle}>{item?.title}</p>
                  )}
                  {item && !editing && (
                    <div className={s.panelHeadBadges}>
                      <span className={`${s.badge} ${STATUS_CSS[item.status]}`}>
                        {STATUS_LABELS[item.status]}
                      </span>
                      <span className={`${s.badge} ${PRIORITY_CSS[item.priority]}`}>
                        {PRIORITY_LABELS[item.priority]}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className={s.panelHeadActions}>
              {canEdit && !editing && (
                <button className={s.btnIcon} onClick={openEdit} title="Chỉnh sửa">
                  <Pencil size={13} />
                </button>
              )}
              <button className={s.panelClose} onClick={onClose}><X size={15} /></button>
            </div>
          </div>

          {/* ── Body ── */}
          <div className={s.panelBody}>
            {loading ? (
              <div className={s.panelSkeleton}>
                {[80, 50, 65, 40].map((w, i) => (
                  <div key={i} className={s.skeletonBar} style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : item ? (
              <>
                {/* ── Thông tin chung ── */}
                <div className={s.panelSection}>
                  <div className={s.panelSectionHead}>
                    <p className={s.panelSectionTitle}>Thông tin chung</p>
                  </div>

                  {editing ? (
                    <div className={s.editMetaGrid}>
                      {/* Priority + Deadline */}
                      <div className={s.editRow}>
                        <div className={s.formGroup}>
                          <label className={s.formLabel}>Ưu tiên</label>
                          <select
                            className={s.formSelect}
                            value={editForm.priority}
                            onChange={(e) => setEF('priority', e.target.value)}
                          >
                            {priorityOptions.map((o) => (
                              <option key={o.key} value={o.key}>{o.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className={s.formGroup}>
                          <label className={s.formLabel}>Hạn hoàn thành</label>
                          <input
                            type="date"
                            className={s.formInput}
                            value={editForm.deadlineDate}
                            onChange={(e) => setEF('deadlineDate', e.target.value)}
                          />
                        </div>
                      </div>
                      {/* Company */}
                      <div className={s.formGroup}>
                        <label className={s.formLabel}>Khách hàng</label>
                        <select
                          className={s.formSelect}
                          value={editForm.companyId}
                          onChange={(e) => setEF('companyId', e.target.value)}
                        >
                          <option value="">Không gắn khách hàng</option>
                          {companies.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      {/* Description */}
                      <div className={s.formGroup}>
                        <label className={s.formLabel}>Mô tả</label>
                        <textarea
                          className={s.formTextarea}
                          value={editForm.description}
                          onChange={(e) => setEF('description', e.target.value)}
                          rows={4}
                          placeholder="Mô tả chi tiết..."
                        />
                      </div>
                    </div>
                  ) : (
                    <div className={s.metaGrid}>
                      <div className={s.metaItem}>
                        <span className={s.metaLabel}>Người tạo</span>
                        <span className={s.metaValue}>{item.createdBy?.name ?? '—'}</span>
                      </div>
                      <div className={s.metaItem}>
                        <span className={s.metaLabel}>Khách hàng</span>
                        <span className={s.metaValue}>
                          {item.company?.name
                            ? item.company.name
                            : <span className={s.internalBadge}>Công việc nội bộ</span>}
                        </span>
                      </div>
                      <div className={s.metaItem}>
                        <span className={s.metaLabel}>Ngày tạo</span>
                        <span className={s.metaValue}>{fmtDate(item.createdAt)}</span>
                      </div>
                      <div className={s.metaItem}>
                        <span className={s.metaLabel}>Hạn hoàn thành</span>
                        <span className={`${s.metaValue} ${item.deadlineDate && item.status === 'active' && new Date(item.deadlineDate) < new Date() ? s.metaValueDanger : ''}`}>
                          {fmtDate(item.deadlineDate)}
                        </span>
                      </div>
                      {item.sentAt && (
                        <div className={s.metaItem}>
                          <span className={s.metaLabel}>Ngày gửi</span>
                          <span className={s.metaValue}>{fmtDateTime(item.sentAt)}</span>
                        </div>
                      )}
                      {item.closedAt && (
                        <div className={s.metaItem}>
                          <span className={s.metaLabel}>Ngày đóng</span>
                          <span className={s.metaValue}>{fmtDateTime(item.closedAt)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Mô tả (read-only view) ── */}
                {!editing && item.description && (
                  <div className={s.panelSection}>
                    <p className={s.panelSectionTitle}>Mô tả</p>
                    <p className={s.descriptionText}>{item.description}</p>
                  </div>
                )}

                {/* ── Checklist ── */}
                <div className={s.panelSection}>
                  <IaChecklistSection
                    assignmentId={assignmentId}
                    readOnly={item.status === 'cancelled' || item.status === 'done'}
                  />
                </div>

                {/* ── Links ── */}
                <div className={s.panelSection}>
                  <IaLinksSection assignmentId={assignmentId} />
                </div>

                {/* ── Nhân sự thực hiện ── */}
                <div className={s.panelSection}>
                  <p className={s.panelSectionTitle}>
                    Nhân sự thực hiện ({item.assignees?.length ?? 0})
                  </p>
                  <div className={s.assigneeList}>
                    {(item.assignees ?? []).length === 0 ? (
                      <p className={s.panelEmptyText}>Chưa có nhân sự</p>
                    ) : (
                      item.assignees.map((a) => (
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
                      ))
                    )}
                  </div>

                  {/* Assignee picker (edit mode) */}
                  {editing && (
                    <div className={s.staffPickerWrap} style={{ marginTop: 10 }}>
                      <div className={s.staffPickerSearch}>
                        <Search size={13} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
                        <input
                          type="text"
                          className={s.staffPickerSearchInput}
                          placeholder="Tìm nhân viên..."
                          value={staffSearch}
                          onChange={(e) => setStaffSearch(e.target.value)}
                        />
                      </div>
                      <div className={s.staffPickerList}>
                        {filteredStaff.length === 0 ? (
                          <div className={s.staffPickerEmpty}>Không tìm thấy nhân viên</div>
                        ) : filteredStaff.map((u) => {
                          const checked  = isAssigneeChecked(u.id)
                          const existing = item?.assignees?.find((a) => a.userId === u.id)
                          const isActive = existing && !['pending', 'rejected'].includes(existing.status)
                          return (
                            <label
                              key={u.id}
                              className={`${s.staffPickerItem} ${isActive ? s.staffPickerItemDisabled : ''}`}
                              title={isActive ? 'Không thể xóa nhân sự đang thực hiện' : ''}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={isActive}
                                onChange={() => !isActive && toggleEditAssignee(u.id)}
                              />
                              <span className={s.staffPickerName}>{u.name}</span>
                              {checked && <Check size={12} className={s.staffPickerCheck} />}
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Comments ── */}
                <div className={s.panelSection}>
                  <p className={s.panelSectionTitle}>
                    <MessageSquare size={12} className={s.sectionTitleIcon} />
                    Bình luận ({item.comments?.length ?? 0})
                  </p>
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
                        {(isAdmin || c.user?.id === currentUser?.id) && (
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
              </>
            ) : (
              <p className={s.panelEmptyText}>Không thể tải phiếu</p>
            )}
          </div>

          {/* ── Footer ── */}
          {item && !loading && (
            <div className={s.panelFooter}>
              {/* Edit mode actions */}
              {editing && (
                <div className={s.panelActionsAdmin}>
                  <button className={s.btnSecondary} onClick={cancelEdit} disabled={savingEdit}>
                    Huỷ
                  </button>
                  <button className={s.btnPrimary} onClick={handleSaveEdit} disabled={savingEdit}>
                    {savingEdit ? <><Loader2 size={13} className={s.spinIcon} /> Đang lưu...</> : <><Save size={13} /> Lưu thay đổi</>}
                  </button>
                </div>
              )}

              {/* Admin lifecycle actions */}
              {isAdmin && !editing && (
                <div className={s.panelActionsAdmin}>
                  {item.status === 'draft' && (
                    <>
                      <button className={s.btnPrimary} onClick={() => setModal('send')}>
                        <Send size={13} /> Gửi phiếu
                      </button>
                      <button className={`${s.btnIcon} ${s.btnIconDanger}`} onClick={() => setModal('delete')} title="Xóa phiếu">
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                  {item.status === 'active' && (
                    <>
                      <button className={s.btnSuccess} onClick={() => setModal('close')}>
                        <CheckCircle size={13} /> Đóng phiếu
                      </button>
                      <button className={s.btnDanger} onClick={() => setModal('cancel')}>
                        <Ban size={13} /> Hủy phiếu
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Staff actions */}
              {!isAdmin && item.status === 'active' && myAssignee && !editing && (
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
              )}
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
      {modal === 'send' && (
        <ConfirmModal
          title="Gửi phiếu giao việc"
          body={`Xác nhận gửi phiếu "${item?.title}" đến các nhân sự? Phiếu sẽ chuyển sang trạng thái "Đang thực hiện".`}
          confirmLabel={<><Send size={13} /> Gửi phiếu</>}
          confirmClass={s.btnPrimary}
          saving={acting}
          onConfirm={handleSend}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'cancel' && (
        <ConfirmModal
          title="Hủy phiếu giao việc"
          body={`Bạn có chắc muốn hủy phiếu "${item?.title}"? Hành động này không thể hoàn tác.`}
          confirmLabel={<><Ban size={13} /> Hủy phiếu</>}
          confirmClass={s.btnDanger}
          saving={acting}
          onConfirm={handleCancel}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'close' && (
        <ConfirmModal
          title="Đóng phiếu giao việc"
          body={`Xác nhận đóng phiếu "${item?.title}"? Phiếu sẽ được đánh dấu hoàn thành.`}
          confirmLabel={<><CheckCircle size={13} /> Đóng phiếu</>}
          confirmClass={s.btnSuccess}
          saving={acting}
          onConfirm={handleClose}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'delete' && (
        <ConfirmModal
          title="Xóa phiếu"
          body={`Bạn có chắc muốn xóa phiếu "${item?.title}"? Hành động này không thể hoàn tác.`}
          confirmLabel={<><Trash2 size={13} /> Xóa</>}
          confirmClass={s.btnDanger}
          saving={acting}
          onConfirm={handleDelete}
          onClose={() => setModal(null)}
        />
      )}
    </>
  )
}
