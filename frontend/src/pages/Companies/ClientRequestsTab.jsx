import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Loader2, Trash2, AlertTriangle, Link2, Link2Off,
  CheckCircle2, XCircle, RotateCcw, Bell, Eye, Copy, Check,
  ClipboardList, RefreshCw,
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import Modal from '../../components/ui/Modal'
import * as cdrApi from '../../api/clientRequests'
import s from './companies.module.css'

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_LABEL = {
  pending:      'Chờ KH',
  received:     'Đã nhận',
  not_required: 'Không cần',
  overdue:      'Quá hạn',
}

const STATUS_COLOR = {
  pending:      { bg: '#fffbeb', color: '#92400e', border: '#fcd34d' },
  received:     { bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
  not_required: { bg: '#f8fafc', color: '#64748b', border: '#cbd5e1' },
  overdue:      { bg: '#fef2f2', color: '#b91c1c', border: '#fca5a5' },
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function StatusBadge({ status }) {
  const cfg = STATUS_COLOR[status] ?? STATUS_COLOR.pending
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
      whiteSpace: 'nowrap',
    }}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

// ── ClientRequestsTab ──────────────────────────────────────────────────────────

export default function ClientRequestsTab({ company }) {
  const isAdmin  = useAuthStore((st) => st.user?.role === 'admin')
  const addToast = useToastStore((st) => st.toast)

  const [items, setItems]           = useState([])
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 })
  const [loading, setLoading]       = useState(true)
  const [page, setPage]             = useState(1)
  const [statusFilter, setStatusFilter] = useState('')

  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting]     = useState(false)

  const [linkTarget, setLinkTarget] = useState(null)   // CDR to generate/show link
  const [generatingLink, setGeneratingLink] = useState(false)
  const [generatedUrl, setGeneratedUrl] = useState(null)
  const [copied, setCopied]         = useState(false)

  const [viewSubmitted, setViewSubmitted] = useState(null)  // CDR with submitted data
  const [reminderTarget, setReminderTarget] = useState(null)

  // action loading per-row
  const [actionLoading, setActionLoading] = useState({}) // { [id]: 'receive'|'unreceive'|'dismiss'|'revoke' }

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    cdrApi.getClientRequests({
      companyId: company.id,
      status: statusFilter || undefined,
      page,
      limit: 20,
      sortBy: 'created_at',
      sortDir: 'desc',
    })
      .then(({ items: it, pagination: p }) => {
        if (!cancelled) {
          setItems(it ?? [])
          setPagination(p ?? { total: 0, totalPages: 1 })
        }
      })
      .catch(() => { if (!cancelled) setItems([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [company.id, statusFilter, page])

  useEffect(() => {
    const cancel = load()
    return cancel
  }, [load])

  useEffect(() => { setPage(1) }, [statusFilter])

  // ── Row actions ──────────────────────────────────────────────────────────────

  async function handleReceive(item) {
    setActionLoading((p) => ({ ...p, [item.id]: 'receive' }))
    try {
      const updated = await cdrApi.receiveClientRequest(item.id)
      setItems((prev) => prev.map((r) => r.id === item.id ? updated : r))
      addToast('Đã đánh dấu đã nhận', 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể cập nhật', 'error')
    } finally {
      setActionLoading((p) => ({ ...p, [item.id]: null }))
    }
  }

  async function handleUnreceive(item) {
    setActionLoading((p) => ({ ...p, [item.id]: 'unreceive' }))
    try {
      const updated = await cdrApi.unreceiveClientRequest(item.id)
      setItems((prev) => prev.map((r) => r.id === item.id ? updated : r))
      addToast('Đã hoàn tác trạng thái nhận', 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể cập nhật', 'error')
    } finally {
      setActionLoading((p) => ({ ...p, [item.id]: null }))
    }
  }

  async function handleDismiss(item) {
    setActionLoading((p) => ({ ...p, [item.id]: 'dismiss' }))
    try {
      const updated = await cdrApi.dismissClientRequest(item.id)
      setItems((prev) => prev.map((r) => r.id === item.id ? updated : r))
      addToast('Đã đánh dấu không cần', 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể cập nhật', 'error')
    } finally {
      setActionLoading((p) => ({ ...p, [item.id]: null }))
    }
  }

  async function handleRevokeLink(item) {
    setActionLoading((p) => ({ ...p, [item.id]: 'revoke' }))
    try {
      await cdrApi.revokeLink(item.id)
      setItems((prev) => prev.map((r) =>
        r.id === item.id ? { ...r, publicToken: null, tokenExpiresAt: null } : r
      ))
      addToast('Đã thu hồi link', 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể thu hồi link', 'error')
    } finally {
      setActionLoading((p) => ({ ...p, [item.id]: null }))
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await cdrApi.deleteClientRequest(deleteTarget.id)
      setItems((prev) => prev.filter((r) => r.id !== deleteTarget.id))
      setPagination((p) => ({ ...p, total: p.total - 1 }))
      setDeleteTarget(null)
      addToast(`Đã xoá yêu cầu "${deleteTarget.documentName}"`, 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể xoá', 'error')
    } finally {
      setDeleting(false)
    }
  }

  // ── Generate link modal ──────────────────────────────────────────────────────

  function openLinkModal(item) {
    setLinkTarget(item)
    setGeneratedUrl(null)
    setCopied(false)
    if (item.publicToken) {
      setGeneratedUrl(`${window.location.origin}/public/form/${item.publicToken}`)
    }
  }

  async function handleGenerateLink() {
    if (!linkTarget) return
    setGeneratingLink(true)
    try {
      const data = await cdrApi.generateLink(linkTarget.id, { expiresInDays: 30 })
      const url = `${window.location.origin}/public/form/${data.publicToken}`
      setGeneratedUrl(url)
      setItems((prev) => prev.map((r) =>
        r.id === linkTarget.id
          ? { ...r, publicToken: data.publicToken, tokenExpiresAt: data.tokenExpiresAt }
          : r
      ))
      setLinkTarget((prev) => ({ ...prev, publicToken: data.publicToken, tokenExpiresAt: data.tokenExpiresAt }))
      addToast('Đã tạo link chia sẻ', 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể tạo link', 'error')
    } finally {
      setGeneratingLink(false)
    }
  }

  async function handleCopyUrl(url) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      addToast('Không thể copy, hãy copy thủ công', 'warning')
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const STATUS_FILTERS = [
    { key: '', label: 'Tất cả' },
    { key: 'pending', label: STATUS_LABEL.pending },
    { key: 'overdue', label: STATUS_LABEL.overdue },
    { key: 'received', label: STATUS_LABEL.received },
    { key: 'not_required', label: STATUS_LABEL.not_required },
  ]

  return (
    <div>
      {/* Header */}
      <div className={s.taskPanelHeader}>
        <div className={s.taskPanelHeaderTitle}>
          <h3 className={s.taskPanelTitle}>Yêu cầu tài liệu khách hàng</h3>
          {!loading && (
            <span className={s.countPill}>{pagination.total}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className={s.btnOutline}
            style={{ height: 32, padding: '0 10px', fontSize: 12 }}
            onClick={load}
            title="Làm mới"
          >
            <RefreshCw size={12} />
          </button>
          <button
            className={s.btnPrimary}
            style={{ height: 32, padding: '0 12px', fontSize: 13 }}
            onClick={() => setShowCreate(true)}
          >
            <Plus size={13} /> Tạo yêu cầu
          </button>
        </div>
      </div>

      {/* Status filter chips */}
      <div className={s.cTaskStatusRow} style={{ marginBottom: 12 }}>
        {STATUS_FILTERS.map(({ key, label }) => (
          <button
            key={key}
            className={`${s.cTaskStatusChip} ${statusFilter === key ? s.cTaskStatusChipActive : ''}`}
            onClick={() => setStatusFilter(key)}
          >
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className={s.tableWrap}>
        <div className={s.tableScroll}>
          <table className={s.table}>
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Tài liệu yêu cầu</th>
                <th style={{ width: 110 }}>Trạng thái</th>
                <th style={{ width: 120 }}>Kỳ</th>
                <th style={{ width: 100 }}>Hạn nộp</th>
                <th style={{ width: 160 }}>Email KH</th>
                <th style={{ width: 80, textAlign: 'center' }}>Link</th>
                <th style={{ width: 120 }} />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {[200, 100, 100, 90, 150, 60, 100].map((w, j) => (
                      <td key={j}>
                        <div style={{ height: 12, width: w, background: '#f1f5f9', borderRadius: 4 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 16px', gap: 8, color: '#94a3b8' }}>
                      <ClipboardList size={32} />
                      <span style={{ fontSize: 13 }}>
                        {statusFilter ? 'Không có yêu cầu nào ở trạng thái này' : 'Chưa có yêu cầu tài liệu nào'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : items.map((item) => {
                const busy = actionLoading[item.id]
                const hasToken = !!item.publicToken
                const hasSubmitted = !!item.tokenSubmittedAt
                return (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b', marginBottom: 2 }}>
                        {item.documentName}
                      </div>
                      {item.description && (
                        <div style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>
                          {item.description}
                        </div>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={item.status} />
                      {hasSubmitted && (
                        <button
                          style={{ display: 'block', marginTop: 3, fontSize: 10, color: '#2563eb', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                          onClick={() => setViewSubmitted(item)}
                        >
                          Xem dữ liệu KH
                        </button>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>
                      {item.periodLabel || '—'}
                    </td>
                    <td style={{ fontSize: 12, color: item.status === 'overdue' ? '#b91c1c' : '#64748b' }}>
                      {fmtDate(item.deadlineDate)}
                    </td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>
                      {item.contactEmail || '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {hasToken ? (
                        <button
                          className={s.rowActionBtn}
                          title="Xem / sao chép link"
                          onClick={() => openLinkModal(item)}
                          style={{ color: '#2563eb' }}
                        >
                          <Link2 size={13} />
                        </button>
                      ) : (
                        <button
                          className={s.rowActionBtn}
                          title="Tạo link chia sẻ"
                          onClick={() => openLinkModal(item)}
                          disabled={item.status === 'received' || item.status === 'not_required'}
                        >
                          <Link2 size={13} />
                        </button>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end' }}>
                        {/* Edit */}
                        <button
                          className={s.rowActionBtn}
                          title="Chỉnh sửa"
                          onClick={() => setEditTarget(item)}
                          disabled={!!busy}
                        >
                          <Eye size={13} />
                        </button>

                        {/* Receive */}
                        {(item.status === 'pending' || item.status === 'overdue') && (
                          <button
                            className={s.rowActionBtn}
                            title="Đánh dấu đã nhận"
                            onClick={() => handleReceive(item)}
                            disabled={!!busy}
                            style={{ color: '#16a34a' }}
                          >
                            {busy === 'receive' ? <Loader2 size={13} className={s.spin} /> : <CheckCircle2 size={13} />}
                          </button>
                        )}

                        {/* Unreceive */}
                        {item.status === 'received' && (
                          <button
                            className={s.rowActionBtn}
                            title="Hoàn tác đã nhận"
                            onClick={() => handleUnreceive(item)}
                            disabled={!!busy}
                          >
                            {busy === 'unreceive' ? <Loader2 size={13} className={s.spin} /> : <RotateCcw size={13} />}
                          </button>
                        )}

                        {/* Dismiss */}
                        {(item.status === 'pending' || item.status === 'overdue') && (
                          <button
                            className={s.rowActionBtn}
                            title="Đánh dấu không cần tài liệu này"
                            onClick={() => handleDismiss(item)}
                            disabled={!!busy}
                          >
                            {busy === 'dismiss' ? <Loader2 size={13} className={s.spin} /> : <XCircle size={13} />}
                          </button>
                        )}

                        {/* Revoke link */}
                        {hasToken && (item.status === 'pending' || item.status === 'overdue') && (
                          <button
                            className={s.rowActionBtn}
                            title="Thu hồi link"
                            onClick={() => handleRevokeLink(item)}
                            disabled={!!busy}
                            style={{ color: '#d97706' }}
                          >
                            {busy === 'revoke' ? <Loader2 size={13} className={s.spin} /> : <Link2Off size={13} />}
                          </button>
                        )}

                        {/* Remind */}
                        {item.contactEmail && (item.status === 'pending' || item.status === 'overdue') && (
                          <button
                            className={s.rowActionBtn}
                            title="Gửi nhắc nhở email"
                            onClick={() => setReminderTarget(item)}
                            disabled={!!busy}
                          >
                            <Bell size={13} />
                          </button>
                        )}

                        {/* Delete */}
                        {isAdmin && (
                          <button
                            className={`${s.rowActionBtn} ${s.rowActionDanger}`}
                            title="Xoá yêu cầu"
                            onClick={() => setDeleteTarget(item)}
                            disabled={!!busy}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className={s.paginationBar} style={{ marginTop: 8 }}>
            <span className={s.paginationInfo}>{pagination.total} yêu cầu</span>
            <div className={s.paginationBtns}>
              <button className={s.paginationBtn} onClick={() => setPage((p) => p - 1)} disabled={page === 1}>‹</button>
              <span style={{ fontSize: 12, padding: '0 8px', color: 'var(--color-muted)' }}>{page} / {pagination.totalPages}</span>
              <button className={s.paginationBtn} onClick={() => setPage((p) => p + 1)} disabled={page === pagination.totalPages}>›</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Create / Edit Modal ── */}
      {(showCreate || editTarget) && (
        <CdrFormModal
          company={company}
          initial={editTarget}
          onClose={() => { setShowCreate(false); setEditTarget(null) }}
          onSaved={(saved) => {
            setShowCreate(false)
            setEditTarget(null)
            if (editTarget) {
              setItems((prev) => prev.map((r) => r.id === saved.id ? saved : r))
              addToast('Đã cập nhật yêu cầu', 'success')
            } else {
              load()
              addToast(`Đã tạo yêu cầu "${saved.documentName}"`, 'success')
            }
          }}
        />
      )}

      {/* ── Delete confirm ── */}
      {deleteTarget && (
        <Modal title="Xoá yêu cầu tài liệu" onClose={() => setDeleteTarget(null)}>
          <div className={s.modalStack}>
            <div className={`${s.terminateWarn} ${s.terminateWarnDanger}`}>
              <AlertTriangle size={16} className={`${s.warnIconInline} ${s.warnIconDanger}`} />
              <span style={{ fontSize: 13 }}>
                Xoá yêu cầu <strong>"{deleteTarget.documentName}"</strong>? Hành động này không thể hoàn tác.
              </span>
            </div>
            <div className={s.modalActions}>
              <button onClick={() => setDeleteTarget(null)} className={s.btnOutline}>Huỷ</button>
              <button onClick={handleDelete} disabled={deleting} className={s.btnDanger}>
                {deleting ? <Loader2 size={13} className={s.spin} /> : <Trash2 size={13} />}
                {deleting ? 'Đang xoá...' : 'Xoá'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Generate/copy link modal ── */}
      {linkTarget && (
        <LinkModal
          item={linkTarget}
          generatedUrl={generatedUrl}
          generating={generatingLink}
          copied={copied}
          onGenerate={handleGenerateLink}
          onCopy={handleCopyUrl}
          onClose={() => { setLinkTarget(null); setGeneratedUrl(null) }}
        />
      )}

      {/* ── View submitted data modal ── */}
      {viewSubmitted && (
        <SubmittedDataModal item={viewSubmitted} onClose={() => setViewSubmitted(null)} />
      )}

      {/* ── Reminder modal ── */}
      {reminderTarget && (
        <ReminderModal
          item={reminderTarget}
          onClose={() => setReminderTarget(null)}
          onSent={(updated) => {
            setItems((prev) => prev.map((r) => r.id === updated.id ? updated : r))
            setReminderTarget(null)
            addToast('Đã gửi nhắc nhở', 'success')
          }}
        />
      )}
    </div>
  )
}

// ── CdrFormModal ──────────────────────────────────────────────────────────────

function CdrFormModal({ company, initial, onClose, onSaved }) {
  const [form, setForm]   = useState({
    documentName: initial?.documentName ?? '',
    description:  initial?.description ?? '',
    deadlineDate: initial?.deadlineDate ? initial.deadlineDate.slice(0, 10) : '',
    periodLabel:  initial?.periodLabel ?? '',
    contactEmail: initial?.contactEmail ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  function set(k, v) { setForm((p) => ({ ...p, [k]: v })); setErr('') }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.documentName.trim()) { setErr('Vui lòng nhập tên tài liệu'); return }
    setSaving(true)
    try {
      let saved
      if (initial) {
        saved = await cdrApi.updateClientRequest(initial.id, {
          documentName: form.documentName.trim() || undefined,
          description:  form.description.trim() || null,
          deadlineDate: form.deadlineDate || null,
          periodLabel:  form.periodLabel.trim() || null,
          contactEmail: form.contactEmail.trim() || null,
        })
      } else {
        saved = await cdrApi.createClientRequest({
          companyId:    company.id,
          documentName: form.documentName.trim(),
          description:  form.description.trim() || null,
          deadlineDate: form.deadlineDate || null,
          periodLabel:  form.periodLabel.trim() || null,
          contactEmail: form.contactEmail.trim() || null,
        })
      }
      onSaved(saved)
    } catch (e) {
      setErr(e.response?.data?.error?.message ?? 'Không thể lưu')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={initial ? 'Chỉnh sửa yêu cầu' : 'Tạo yêu cầu tài liệu'} onClose={onClose}>
      <form onSubmit={handleSubmit} className={s.modalForm}>
        {err && <div className={s.errorBox}>{err}</div>}

        <div>
          <label className={`${s.formLabel} ${s.formLabelReq}`}>Tên tài liệu yêu cầu</label>
          <input
            type="text"
            value={form.documentName}
            onChange={(e) => set('documentName', e.target.value)}
            className={s.formInput}
            placeholder="VD: Bảng lương tháng 5/2025"
            autoFocus
          />
        </div>

        <div>
          <label className={s.formLabel}>Kỳ kế toán</label>
          <input
            type="text"
            value={form.periodLabel}
            onChange={(e) => set('periodLabel', e.target.value)}
            className={s.formInput}
            placeholder="VD: Tháng 5/2025 hoặc Q2-2025"
          />
        </div>

        <div>
          <label className={s.formLabel}>Hạn nộp</label>
          <input
            type="date"
            value={form.deadlineDate}
            onChange={(e) => set('deadlineDate', e.target.value)}
            className={s.formInput}
          />
        </div>

        <div>
          <label className={s.formLabel}>Email khách hàng</label>
          <input
            type="email"
            value={form.contactEmail}
            onChange={(e) => set('contactEmail', e.target.value)}
            className={s.formInput}
            placeholder="Để gửi nhắc nhở qua email"
          />
        </div>

        <div>
          <label className={s.formLabel}>Mô tả / hướng dẫn</label>
          <textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            rows={3}
            className={s.formTextarea}
            placeholder="Hướng dẫn cho khách hàng khi điền form..."
          />
        </div>

        <div className={s.modalActions}>
          <button type="button" onClick={onClose} className={s.btnOutline}>Huỷ</button>
          <button type="submit" disabled={saving} className={s.btnPrimary}>
            {saving ? <Loader2 size={13} className={s.spin} /> : <Plus size={13} />}
            {saving ? 'Đang lưu...' : initial ? 'Cập nhật' : 'Tạo yêu cầu'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── LinkModal ─────────────────────────────────────────────────────────────────

function LinkModal({ item, generatedUrl, generating, copied, onGenerate, onCopy, onClose }) {
  const hasToken = !!item.publicToken

  return (
    <Modal title="Link chia sẻ cho khách hàng" onClose={onClose}>
      <div className={s.modalStack}>
        <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
          <strong>{item.documentName}</strong>
          <br />
          {hasToken
            ? 'Link đã được tạo. Gửi link này cho khách hàng để họ điền thông tin và chia sẻ tài liệu.'
            : 'Tạo link chia sẻ để gửi cho khách hàng. Link có hiệu lực 30 ngày.'}
        </div>

        {item.tokenExpiresAt && (
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            Hết hạn: {new Date(item.tokenExpiresAt).toLocaleDateString('vi-VN')}
          </div>
        )}

        {generatedUrl && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              readOnly
              value={generatedUrl}
              style={{
                flex: 1, fontSize: 12, padding: '8px 10px',
                border: '1px solid #e2e8f0', borderRadius: 6,
                background: '#f8fafc', color: '#334155', fontFamily: 'monospace',
              }}
              onFocus={(e) => e.target.select()}
            />
            <button
              onClick={() => onCopy(generatedUrl)}
              style={{
                flexShrink: 0, padding: '8px 14px', borderRadius: 6,
                background: copied ? '#16a34a' : '#2563eb', color: '#fff',
                border: 'none', cursor: 'pointer', fontSize: 13,
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'background 0.15s',
              }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Đã copy' : 'Copy'}
            </button>
          </div>
        )}

        <div className={s.modalActions}>
          <button onClick={onClose} className={s.btnOutline}>Đóng</button>
          <button
            onClick={onGenerate}
            disabled={generating}
            className={s.btnPrimary}
          >
            {generating ? <Loader2 size={13} className={s.spin} /> : <Link2 size={13} />}
            {generating ? 'Đang tạo...' : hasToken ? 'Tạo link mới' : 'Tạo link'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── SubmittedDataModal ────────────────────────────────────────────────────────

function SubmittedDataModal({ item, onClose }) {
  const data = item.tokenSubmittedData ?? {}
  const fields = [
    { label: 'Tên liên hệ',   value: data.contactName },
    { label: 'Số điện thoại', value: data.phone },
    { label: 'Mô tả tài liệu', value: data.description },
    { label: 'Link chia sẻ',   value: data.sharedLink, isLink: true },
    { label: 'Ghi chú thêm',  value: data.notes },
  ]
  return (
    <Modal title="Dữ liệu khách hàng đã gửi" onClose={onClose}>
      <div className={s.modalStack}>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
          Gửi lúc: {new Date(item.tokenSubmittedAt).toLocaleString('vi-VN')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {fields.filter((f) => f.value).map((f) => (
            <div key={f.label}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
                {f.label}
              </div>
              {f.isLink ? (
                <a href={f.value} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 13, color: '#2563eb', wordBreak: 'break-all' }}>
                  {f.value}
                </a>
              ) : (
                <div style={{ fontSize: 13, color: '#1e293b', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {f.value}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className={s.modalActions}>
          <button onClick={onClose} className={s.btnOutline}>Đóng</button>
        </div>
      </div>
    </Modal>
  )
}

// ── ReminderModal ─────────────────────────────────────────────────────────────

function ReminderModal({ item, onClose, onSent }) {
  const addToast = useToastStore((st) => st.toast)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr]         = useState('')

  async function handleSend(e) {
    e.preventDefault()
    setSending(true); setErr('')
    try {
      const updated = await cdrApi.sendReminder(item.id, {
        email: item.contactEmail,
        message: message.trim() || null,
      })
      onSent(updated)
    } catch (e) {
      setErr(e.response?.data?.error?.message ?? 'Không thể gửi nhắc nhở')
      setSending(false)
    }
  }

  return (
    <Modal title="Gửi nhắc nhở khách hàng" onClose={onClose}>
      <form onSubmit={handleSend} className={s.modalStack}>
        {err && <div className={s.errorBox}>{err}</div>}
        <div style={{ fontSize: 13, color: '#475569' }}>
          Gửi nhắc nhở đến <strong>{item.contactEmail}</strong> về tài liệu <strong>"{item.documentName}"</strong>.
          {item.reminderCount > 0 && (
            <span style={{ color: '#94a3b8', fontSize: 12 }}> (đã nhắc {item.reminderCount} lần)</span>
          )}
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            Lời nhắn thêm (tuỳ chọn)
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className={s.formTextarea}
            placeholder="Thêm lời nhắn tùy chỉnh..."
          />
        </div>
        <div className={s.modalActions}>
          <button type="button" onClick={onClose} className={s.btnOutline}>Huỷ</button>
          <button type="submit" disabled={sending} className={s.btnPrimary}>
            {sending ? <Loader2 size={13} className={s.spin} /> : <Bell size={13} />}
            {sending ? 'Đang gửi...' : 'Gửi nhắc nhở'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
