import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Loader2, Trash2, AlertTriangle, Link2, Link2Off,
  CheckCircle2, XCircle, RotateCcw, Bell, Eye, Copy, Check,
  ClipboardList, RefreshCw, Search, ExternalLink, Filter, PenLine,
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

const SORT_OPTIONS = [
  { value: 'created_at:desc',    label: 'Mới nhất' },
  { value: 'created_at:asc',     label: 'Cũ nhất' },
  { value: 'deadline_date:asc',  label: 'Hạn nộp: Sớm nhất' },
  { value: 'deadline_date:desc', label: 'Hạn nộp: Muộn nhất' },
  { value: 'document_name:asc',  label: 'Tên A → Z' },
]

const STATUS_FILTERS = [
  { key: '', label: 'Tất cả' },
  { key: 'pending',      label: STATUS_LABEL.pending },
  { key: 'overdue',      label: STATUS_LABEL.overdue },
  { key: 'received',     label: STATUS_LABEL.received },
  { key: 'not_required', label: STATUS_LABEL.not_required },
]

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
  const [searchQuery, setSearchQuery]   = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sortFilter, setSortFilter]     = useState('created_at:desc')

  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting]     = useState(false)

  const [linkTarget, setLinkTarget] = useState(null)
  const [generatingLink, setGeneratingLink] = useState(false)
  const [generatedUrl, setGeneratedUrl] = useState(null)
  const [copied, setCopied]         = useState(false)

  const [viewSubmitted, setViewSubmitted] = useState(null)
  const [reminderTarget, setReminderTarget] = useState(null)
  const [manualSubmitTarget, setManualSubmitTarget] = useState(null)

  const [actionLoading, setActionLoading] = useState({})

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 350)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Reset page on filter change
  useEffect(() => { setPage(1) }, [statusFilter, debouncedSearch, sortFilter])

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    const [sortBy, sortDir] = sortFilter.split(':')
    cdrApi.getClientRequests({
      companyId: company.id,
      status:    statusFilter || undefined,
      search:    debouncedSearch || undefined,
      page,
      limit: 20,
      sortBy,
      sortDir,
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
  }, [company.id, statusFilter, debouncedSearch, sortFilter, page])

  useEffect(() => {
    const cancel = load()
    return cancel
  }, [load])

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
      const url = `${window.location.origin}/public/form/${data.token}`
      setGeneratedUrl(url)
      setItems((prev) => prev.map((r) =>
        r.id === linkTarget.id
          ? { ...r, publicToken: data.token, tokenExpiresAt: data.expiresAt }
          : r
      ))
      setLinkTarget((prev) => ({ ...prev, publicToken: data.token, tokenExpiresAt: data.expiresAt }))
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

      {/* ── Filter panel ── */}
      <div className={s.cTaskFilterPanel}>
        <div className={s.cTaskFilterHead}>
          <div className={s.cTaskFilterTitle}>
            <Filter size={12} />
            Bộ lọc
            {(searchQuery || statusFilter || sortFilter !== 'created_at:desc') && (
              <span className={s.cTaskFilterBadge}>
                {[searchQuery, statusFilter, sortFilter !== 'created_at:desc' ? '1' : ''].filter(Boolean).length} đang bật
              </span>
            )}
          </div>
          <button
            className={s.cTaskFilterReset}
            onClick={() => { setSearchQuery(''); setStatusFilter(''); setSortFilter('created_at:desc') }}
          >
            <RotateCcw size={11} /> Đặt lại
          </button>
        </div>

        <div className={s.cTaskFilterGrid}>
          {/* Sắp xếp */}
          <div className={s.cTaskFilterGroup}>
            <label className={s.cTaskFilterLabel}>Sắp xếp</label>
            <select
              className={s.cTaskFilterSelect}
              value={sortFilter}
              onChange={(e) => setSortFilter(e.target.value)}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Từ khoá */}
          <div className={`${s.cTaskFilterGroup} ${s.cTaskFilterGroupGrow}`}>
            <label className={s.cTaskFilterLabel}>Từ khoá</label>
            <div className={s.searchWrap}>
              <Search size={12} className={s.searchIcon} />
              <input
                className={`${s.cTaskFilterInput} ${s.cTaskFilterInputWithIcon}`}
                placeholder="Tìm tên tài liệu, email khách hàng..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Status chips row */}
        <div className={s.cTaskStatusRow} style={{ padding: '0 14px 10px', marginBottom: 0 }}>
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
      </div>

      {/* Table */}
      <div className={s.tableWrap}>
        <div className={s.tableScroll}>
          <table className={s.table}>
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Tài liệu yêu cầu</th>
                <th style={{ width: 110 }}>Trạng thái</th>
                <th style={{ width: 80, textAlign: 'center' }}>Dữ liệu KH</th>
                <th style={{ width: 120 }}>Kỳ</th>
                <th style={{ width: 100 }}>Hạn nộp</th>
                <th style={{ width: 160 }}>Email KH</th>
                <th style={{ width: 60, textAlign: 'center' }}>Link</th>
                <th style={{ width: 130 }} />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {[200, 100, 60, 100, 90, 150, 50, 110].map((w, j) => (
                      <td key={j}>
                        <div style={{ height: 12, width: w, background: '#f1f5f9', borderRadius: 4 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 16px', gap: 8, color: '#94a3b8' }}>
                      <ClipboardList size={32} />
                      <span style={{ fontSize: 13 }}>
                        {statusFilter || debouncedSearch
                          ? 'Không tìm thấy yêu cầu nào phù hợp'
                          : 'Chưa có yêu cầu tài liệu nào'}
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

                    {/* Trạng thái */}
                    <td>
                      <StatusBadge status={item.status} />
                    </td>

                    {/* Dữ liệu KH */}
                    <td style={{ textAlign: 'center' }}>
                      {hasSubmitted ? (
                        <button
                          onClick={() => setViewSubmitted(item)}
                          title="Xem dữ liệu khách hàng đã gửi"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '3px 9px', borderRadius: 12, border: 'none',
                            background: '#eff6ff', color: '#2563eb',
                            fontSize: 11, fontWeight: 600, cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <Eye size={11} /> Xem
                        </button>
                      ) : (
                        <span style={{ color: '#cbd5e1', fontSize: 12 }}>—</span>
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

                    {/* Link */}
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

                    {/* Actions */}
                    <td>
                      <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end' }}>
                        <button
                          className={s.rowActionBtn}
                          title="Chỉnh sửa yêu cầu"
                          onClick={() => setEditTarget(item)}
                          disabled={!!busy}
                        >
                          <Eye size={13} />
                        </button>

                        {/* Nhập dữ liệu KH thủ công */}
                        {item.status !== 'not_required' && (
                          <button
                            className={s.rowActionBtn}
                            title={item.tokenSubmittedAt ? 'Cập nhật dữ liệu KH' : 'Nhập dữ liệu KH thủ công'}
                            onClick={() => setManualSubmitTarget(item)}
                            disabled={!!busy}
                            style={{ color: '#7c3aed' }}
                          >
                            <PenLine size={13} />
                          </button>
                        )}

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

        {/* Pagination — always show when items exist */}
        {!loading && pagination.total > 0 && (
          <div className={s.paginationBar} style={{ marginTop: 8 }}>
            <span className={s.paginationInfo}>
              {pagination.total} yêu cầu
              {pagination.totalPages > 1 && ` · Trang ${page}/${pagination.totalPages}`}
            </span>
            {pagination.totalPages > 1 && (
              <div className={s.paginationBtns}>
                <button className={s.paginationBtn} onClick={() => setPage((p) => p - 1)} disabled={page === 1}>‹</button>
                <span style={{ fontSize: 12, padding: '0 8px', color: 'var(--color-muted)' }}>{page} / {pagination.totalPages}</span>
                <button className={s.paginationBtn} onClick={() => setPage((p) => p + 1)} disabled={page === pagination.totalPages}>›</button>
              </div>
            )}
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

      {/* ── Manual submit modal ── */}
      {manualSubmitTarget && (
        <ManualSubmitModal
          item={manualSubmitTarget}
          onClose={() => setManualSubmitTarget(null)}
          onSaved={(updated) => {
            setItems((prev) => prev.map((r) => r.id === updated.id ? updated : r))
            setManualSubmitTarget(null)
            addToast('Đã lưu dữ liệu khách hàng', 'success')
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
          remindedEmail: form.contactEmail.trim() || null,
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
    <Modal title={initial ? 'Chỉnh sửa yêu cầu' : 'Tạo yêu cầu tài liệu'} onClose={onClose} maxWidth={720}>
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
    <Modal title="Link chia sẻ cho khách hàng" onClose={onClose} maxWidth={600}>
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

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* silent */
    }
  }

  return (
    <button
      onClick={handleCopy}
      title="Copy"
      style={{
        flexShrink: 0, padding: '3px 8px', borderRadius: 5,
        border: '1px solid #e2e8f0', background: copied ? '#f0fdf4' : '#f8fafc',
        color: copied ? '#16a34a' : '#64748b', cursor: 'pointer', fontSize: 11,
        display: 'inline-flex', alignItems: 'center', gap: 4,
        transition: 'all 0.15s',
      }}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Đã copy' : 'Copy'}
    </button>
  )
}

function SubmittedDataModal({ item, onClose }) {
  const data = item.tokenSubmittedData ?? {}

  // Support both new format (shared_links: []) and old format (shared_link: string)
  const sharedLinks = Array.isArray(data.shared_links)
    ? data.shared_links.filter(Boolean)
    : data.shared_link
      ? [data.shared_link]
      : []

  const submittedAt = item.tokenSubmittedAt
    ? new Date(item.tokenSubmittedAt).toLocaleString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null

  return (
    <Modal title="Dữ liệu khách hàng đã gửi" onClose={onClose} maxWidth={660}>
      <div className={s.modalStack}>

        {/* Meta header */}
        <div style={{
          background: '#f0fdf4', border: '1px solid #86efac',
          borderRadius: 8, padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 13, color: '#15803d',
        }}>
          <span style={{ fontSize: 16 }}>{data.submitted_via === 'manual' ? '📋' : '✅'}</span>
          <div style={{ flex: 1 }}>
            <strong>{item.documentName}</strong>
            {submittedAt && (
              <span style={{ color: '#4ade80', fontSize: 12, marginLeft: 8 }}>
                · {data.submitted_via === 'manual' ? 'Nhập lúc' : 'Gửi lúc'} {submittedAt}
              </span>
            )}
            {data.submitted_via === 'manual' && (
              <span style={{
                display: 'inline-block', marginLeft: 8,
                fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99,
                background: '#ede9fe', color: '#6d28d9', border: '1px solid #c4b5fd',
              }}>
                Nhập thủ công
              </span>
            )}
          </div>
        </div>

        {/* Simple text fields */}
        {[
          { label: 'Tên liên hệ',    value: data.contact_name ?? data.contactName, icon: '👤' },
          { label: 'Số điện thoại',  value: data.phone,                            icon: '📞' },
          { label: 'Mô tả tài liệu', value: data.description,                      icon: '📄', multiline: true },
          { label: 'Ghi chú thêm',   value: data.notes,                            icon: '💬', multiline: true },
        ].map((f) => (
          <div key={f.label} style={{
            padding: '10px 0',
            borderBottom: '1px solid #f1f5f9',
            display: 'grid',
            gridTemplateColumns: '140px 1fr',
            gap: '8px 12px',
            alignItems: 'start',
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'flex', alignItems: 'center', gap: 5, paddingTop: 1 }}>
              <span style={{ fontSize: 13 }}>{f.icon}</span>
              {f.label}
            </div>
            {!f.value ? (
              <span style={{ fontSize: 13, color: '#cbd5e1', fontStyle: 'italic' }}>Không có</span>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{
                  fontSize: 13, color: '#1e293b', flex: 1,
                  whiteSpace: f.multiline ? 'pre-wrap' : 'normal',
                  wordBreak: 'break-word', lineHeight: 1.6,
                }}>
                  {f.value}
                </div>
                <CopyButton text={f.value} />
              </div>
            )}
          </div>
        ))}

        {/* Links — support multiple */}
        <div style={{
          padding: '10px 0',
          display: 'grid',
          gridTemplateColumns: '140px 1fr',
          gap: '8px 12px',
          alignItems: 'start',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'flex', alignItems: 'center', gap: 5, paddingTop: 1 }}>
            <span style={{ fontSize: 13 }}>🔗</span>
            Link chia sẻ
            {sharedLinks.length > 1 && (
              <span style={{
                fontSize: 10, fontWeight: 700, background: '#dbeafe',
                color: '#1d4ed8', padding: '1px 6px', borderRadius: 10,
              }}>
                {sharedLinks.length}
              </span>
            )}
          </div>
          {sharedLinks.length === 0 ? (
            <span style={{ fontSize: 13, color: '#cbd5e1', fontStyle: 'italic' }}>Không có</span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sharedLinks.map((link, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {sharedLinks.length > 1 && (
                    <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 18 }}>#{idx + 1}</span>
                  )}
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 12, color: '#2563eb', flex: 1,
                      wordBreak: 'break-all', lineHeight: 1.5,
                      textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    {link}
                    <ExternalLink size={10} style={{ flexShrink: 0 }} />
                  </a>
                  <CopyButton text={link} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={s.modalActions}>
          <button onClick={onClose} className={s.btnOutline}>Đóng</button>
        </div>
      </div>
    </Modal>
  )
}

// ── ManualSubmitModal ─────────────────────────────────────────────────────────

function ManualSubmitModal({ item, onClose, onSaved }) {
  const existing = item.tokenSubmittedData ?? {}
  const existingLinks = Array.isArray(existing.shared_links)
    ? existing.shared_links.filter(Boolean)
    : existing.shared_link ? [existing.shared_link] : []

  const [form, setForm] = useState({
    contactName: existing.contact_name ?? existing.contactName ?? '',
    phone:       existing.phone ?? '',
    description: existing.description ?? '',
    notes:       existing.notes ?? '',
  })
  const [sharedLinks, setSharedLinks] = useState(existingLinks.length ? existingLinks : [''])
  const [markReceived, setMarkReceived] = useState(
    item.status === 'pending' || item.status === 'overdue'
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  function setF(k, v) { setForm((p) => ({ ...p, [k]: v })); setErr('') }

  function handleLinkChange(idx, val) {
    setSharedLinks((p) => p.map((l, i) => i === idx ? val : l))
  }
  function addLink() { setSharedLinks((p) => [...p, '']) }
  function removeLink(idx) { setSharedLinks((p) => p.filter((_, i) => i !== idx)) }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setErr('')
    try {
      const validLinks = sharedLinks.map((l) => l.trim()).filter(Boolean)
      // Validate URLs
      for (const l of validLinks) {
        try { new URL(l) } catch {
          setErr(`Link không hợp lệ: ${l}`); setSaving(false); return
        }
      }
      const updated = await cdrApi.manualSubmit(item.id, {
        contactName:  form.contactName.trim() || null,
        phone:        form.phone.trim() || null,
        description:  form.description.trim() || null,
        sharedLinks:  validLinks,
        notes:        form.notes.trim() || null,
        markReceived,
      })
      onSaved(updated)
    } catch (e) {
      setErr(e.response?.data?.error?.message ?? 'Không thể lưu dữ liệu')
      setSaving(false)
    }
  }

  const isUpdate = !!item.tokenSubmittedAt

  return (
    <Modal
      title={isUpdate ? 'Cập nhật dữ liệu KH' : 'Nhập dữ liệu KH thủ công'}
      onClose={onClose}
      maxWidth={700}
    >
      <form onSubmit={handleSubmit} className={s.modalStack}>
        {/* Context banner */}
        <div style={{
          background: '#faf5ff', border: '1px solid #d8b4fe',
          borderRadius: 8, padding: '10px 14px',
          fontSize: 12, color: '#6b21a8', lineHeight: 1.6,
        }}>
          <strong>📋 {item.documentName}</strong>
          <br />
          {isUpdate
            ? 'Cập nhật lại dữ liệu KH đã nhập trước đó. Dữ liệu cũ sẽ bị thay thế.'
            : 'Nhập thông tin KH đã gửi qua Zalo / điện thoại / email trực tiếp vào hệ thống.'}
        </div>

        {err && <div className={s.errorBox}>{err}</div>}

        {/* Tên liên hệ */}
        <div>
          <label className={s.formLabel}>Tên liên hệ</label>
          <input
            type="text"
            value={form.contactName}
            onChange={(e) => setF('contactName', e.target.value)}
            className={s.formInput}
            placeholder="Họ tên người liên hệ bên khách hàng"
          />
        </div>

        {/* Số điện thoại */}
        <div>
          <label className={s.formLabel}>Số điện thoại</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setF('phone', e.target.value)}
            className={s.formInput}
            placeholder="0901 234 567"
          />
        </div>

        {/* Mô tả tài liệu */}
        <div>
          <label className={s.formLabel}>Mô tả tài liệu</label>
          <textarea
            value={form.description}
            onChange={(e) => setF('description', e.target.value)}
            rows={3}
            className={s.formTextarea}
            placeholder="Mô tả ngắn về tài liệu KH đã gửi..."
          />
        </div>

        {/* Links tài liệu */}
        <div>
          <label className={s.formLabel}>
            Link tài liệu
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400, marginLeft: 6 }}>
              (tuỳ chọn — có thể thêm nhiều)
            </span>
          </label>
          {sharedLinks.map((link, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input
                type="url"
                value={link}
                onChange={(e) => handleLinkChange(idx, e.target.value)}
                className={s.formInput}
                style={{ flex: 1, marginBottom: 0 }}
                placeholder={`https://drive.google.com/...${idx > 0 ? ` (tài liệu ${idx + 1})` : ''}`}
              />
              {sharedLinks.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeLink(idx)}
                  style={{
                    flexShrink: 0, padding: '0 10px', borderRadius: 6,
                    border: '1px solid #fca5a5', background: '#fff',
                    color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1,
                  }}
                >×</button>
              )}
            </div>
          ))}
          {sharedLinks.length < 10 && (
            <button
              type="button"
              onClick={addLink}
              style={{
                padding: '5px 12px', borderRadius: 6,
                border: '1px dashed #93c5fd', background: '#eff6ff',
                color: '#2563eb', cursor: 'pointer', fontSize: 12,
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}
            >
              <span style={{ fontSize: 14 }}>+</span> Thêm link
            </button>
          )}
        </div>

        {/* Ghi chú */}
        <div>
          <label className={s.formLabel}>Ghi chú thêm</label>
          <textarea
            value={form.notes}
            onChange={(e) => setF('notes', e.target.value)}
            rows={2}
            className={s.formTextarea}
            placeholder="Ghi chú nội bộ về dữ liệu KH gửi..."
          />
        </div>

        {/* Checkbox đánh dấu đã nhận */}
        {(item.status === 'pending' || item.status === 'overdue') && (
          <label style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', borderRadius: 8,
            background: markReceived ? '#f0fdf4' : '#f8fafc',
            border: `1px solid ${markReceived ? '#86efac' : '#e2e8f0'}`,
            cursor: 'pointer', transition: 'all 0.15s',
          }}>
            <input
              type="checkbox"
              checked={markReceived}
              onChange={(e) => setMarkReceived(e.target.checked)}
              style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#16a34a' }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: markReceived ? '#15803d' : '#374151' }}>
                Đồng thời đánh dấu "Đã nhận"
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                Chuyển trạng thái yêu cầu này sang Đã nhận sau khi lưu
              </div>
            </div>
          </label>
        )}

        <div className={s.modalActions}>
          <button type="button" onClick={onClose} className={s.btnOutline}>Huỷ</button>
          <button type="submit" disabled={saving} className={s.btnPrimary}>
            {saving ? <Loader2 size={13} className={s.spin} /> : <PenLine size={13} />}
            {saving ? 'Đang lưu...' : isUpdate ? 'Cập nhật dữ liệu' : 'Lưu dữ liệu KH'}
          </button>
        </div>
      </form>
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
    <Modal title="Gửi nhắc nhở khách hàng" onClose={onClose} maxWidth={560}>
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
