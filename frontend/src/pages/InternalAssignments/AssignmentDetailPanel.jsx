import { useState, useEffect } from 'react'
import {
  X, Send, Ban, CheckCircle, ThumbsUp, Play, Check,
  XCircle, Pencil, Trash2, Loader2, MessageSquare, Plus,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useToastStore } from '../../stores/toastStore'
import * as api from '../../api/internalAssignments'
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
          <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--color-text)', lineHeight: 1.6 }}>{body}</p>
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
  assignmentId, currentUser, isAdmin, onClose, onEdit, onUpdate,
}) {
  const addToast = useToastStore((s) => s.toast)

  const [item,    setItem]    = useState(null)
  const [loading, setLoading] = useState(true)

  // Comment state
  const [commentText, setCommentText] = useState('')
  const [submitting,  setSubmitting]  = useState(false)

  // Modal state
  const [modal, setModal] = useState(null) // 'reject' | 'complete' | 'send' | 'cancel' | 'close' | 'delete'
  const [acting, setActing] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.getAssignment(assignmentId)
      .then((data) => { if (!cancelled) { setItem(data); setLoading(false) } })
      .catch(() => { if (!cancelled) { setLoading(false) } })
    return () => { cancelled = true }
  }, [assignmentId])

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

  async function handleSend() {
    await doAction(() => api.sendAssignment(assignmentId), 'Đã gửi phiếu')
  }

  async function handleCancel() {
    await doAction(() => api.cancelAssignment(assignmentId), 'Đã hủy phiếu')
  }

  async function handleClose() {
    await doAction(() => api.closeAssignment(assignmentId), 'Đã đóng phiếu')
  }

  async function handleDelete() {
    await doAction(
      () => api.deleteAssignment(assignmentId),
      'Đã xóa phiếu',
      true
    )
  }

  async function handleAccept() {
    await doAction(() => api.acceptAssignment(assignmentId), 'Đã tiếp nhận phiếu')
  }

  async function handleProgress() {
    await doAction(() => api.progressAssignment(assignmentId), 'Đã bắt đầu thực hiện')
  }

  async function handleComplete(note) {
    await doAction(() => api.completeAssignment(assignmentId, note), 'Đã báo hoàn thành')
  }

  async function handleReject(note) {
    await doAction(() => api.rejectAssignment(assignmentId, note), 'Đã từ chối phiếu')
  }

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

  // Determine my assignee record
  const myAssignee = !isAdmin && item
    ? item.assignees?.find((a) => a.userId === currentUser?.id)
    : null

  // What staff actions are available
  const canAccept   = myAssignee?.status === 'pending'
  const canProgress = myAssignee?.status === 'accepted'
  const canComplete = ['accepted', 'in_progress'].includes(myAssignee?.status)
  const canReject   = ['pending', 'accepted'].includes(myAssignee?.status)

  return (
    <>
      <div className={s.panelOverlay} onClick={onClose}>
        <div className={s.panel} onClick={(e) => e.stopPropagation()}>

          {/* ── Head ── */}
          <div className={s.panelHead}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {loading ? (
                <div className={s.skeletonBar} style={{ width: '70%', height: 18 }} />
              ) : (
                <>
                  <p className={s.panelTitle}>{item?.title}</p>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    {item && (
                      <>
                        <span className={`${s.badge} ${STATUS_CSS[item.status]}`}>
                          {STATUS_LABELS[item.status]}
                        </span>
                        <span className={`${s.badge} ${PRIORITY_CSS[item.priority]}`}>
                          {PRIORITY_LABELS[item.priority]}
                        </span>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
            <button className={s.panelClose} onClick={onClose}><X size={15} /></button>
          </div>

          {/* ── Body ── */}
          <div className={s.panelBody}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[80, 50, 65, 40].map((w, i) => (
                  <div key={i} className={s.skeletonBar} style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : item ? (
              <>
                {/* Meta */}
                <div className={s.panelSection}>
                  <p className={s.panelSectionTitle}>Thông tin chung</p>
                  <div className={s.metaGrid}>
                    <div className={s.metaItem}>
                      <span className={s.metaLabel}>Người tạo</span>
                      <span className={s.metaValue}>{item.createdBy?.name ?? '—'}</span>
                    </div>
                    <div className={s.metaItem}>
                      <span className={s.metaLabel}>Khách hàng</span>
                      <span className={s.metaValue}>{item.company?.name ?? '—'}</span>
                    </div>
                    <div className={s.metaItem}>
                      <span className={s.metaLabel}>Ngày tạo</span>
                      <span className={s.metaValue}>{fmtDate(item.createdAt)}</span>
                    </div>
                    <div className={s.metaItem}>
                      <span className={s.metaLabel}>Hạn hoàn thành</span>
                      <span className={s.metaValue} style={
                        item.deadlineDate && item.status === 'active' && new Date(item.deadlineDate) < new Date()
                          ? { color: 'var(--color-danger)' } : {}
                      }>
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
                </div>

                {/* Description */}
                {item.description && (
                  <div className={s.panelSection}>
                    <p className={s.panelSectionTitle}>Mô tả</p>
                    <p className={s.descriptionText}>{item.description}</p>
                  </div>
                )}

                {/* Assignees */}
                <div className={s.panelSection}>
                  <p className={s.panelSectionTitle}>
                    Nhân sự thực hiện ({item.assignees?.length ?? 0})
                  </p>
                  <div className={s.assigneeList}>
                    {(item.assignees ?? []).length === 0 ? (
                      <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--color-muted)' }}>
                        Chưa có nhân sự
                      </p>
                    ) : (
                      item.assignees.map((a) => (
                        <div key={a.userId} className={s.assigneeRow}>
                          <div className={s.assigneeInfo}>
                            <div className={s.avatarSm}>{initials(a.name)}</div>
                            <div>
                              <div className={s.assigneeName}>{a.name}</div>
                              {a.note && (
                                <div className={s.assigneeNote}>"{a.note}"</div>
                              )}
                            </div>
                          </div>
                          <span className={`${s.assigneeChip} ${ASSIGNEE_STATUS_CSS[a.status]}`}>
                            {ASSIGNEE_STATUS_LABELS[a.status]}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Comments */}
                <div className={s.panelSection}>
                  <p className={s.panelSectionTitle}>
                    <MessageSquare size={12} style={{ display: 'inline', marginRight: 4 }} />
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

                  {/* Comment input */}
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
                        className={s.btnPrimary}
                        onClick={handleAddComment}
                        disabled={submitting || !commentText.trim()}
                        style={{ height: 60, padding: '0 14px', alignSelf: 'flex-start' }}
                      >
                        {submitting ? <Loader2 size={13} className={s.spinIcon} /> : <Plus size={14} />}
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p style={{ color: 'var(--color-muted)', fontSize: 'var(--fs-sm)' }}>
                Không thể tải phiếu
              </p>
            )}
          </div>

          {/* ── Footer actions ── */}
          {item && !loading && (
            <div className={s.panelFooter}>
              {/* Admin actions */}
              {isAdmin && (
                <div className={s.panelActionsAdmin}>
                  {item.status === 'draft' && (
                    <>
                      <button className={s.btnGhost} onClick={() => onEdit?.(item)}>
                        <Pencil size={13} /> Sửa
                      </button>
                      <button className={s.btnPrimary} onClick={() => setModal('send')}>
                        <Send size={13} /> Gửi phiếu
                      </button>
                      <button
                        className={`${s.btnIcon} ${s.btnIconDanger}`}
                        onClick={() => setModal('delete')}
                        title="Xóa phiếu"
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                  {item.status === 'active' && (
                    <>
                      <button className={s.btnGhost} onClick={() => onEdit?.(item)}>
                        <Pencil size={13} /> Sửa
                      </button>
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
              {!isAdmin && item.status === 'active' && myAssignee && (
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
        <RejectModal
          saving={acting}
          onConfirm={handleReject}
          onClose={() => setModal(null)}
        />
      )}

      {modal === 'complete' && (
        <CompleteModal
          saving={acting}
          onConfirm={handleComplete}
          onClose={() => setModal(null)}
        />
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
