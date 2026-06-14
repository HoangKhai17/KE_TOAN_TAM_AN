import { useState, useEffect, useCallback } from 'react'
import {
  Link2, Plus, Trash2, ExternalLink, Loader2,
  Filter, RotateCcw, FolderOpen, AlertTriangle,
  Pencil, Check, X,
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as documentsApi from '../../api/documents'
import s from './companies.module.css'

// ── Constants ──────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'hop_dong',     label: 'Hợp đồng' },
  { key: 'bao_cao_thue', label: 'Báo cáo thuế' },
  { key: 'so_sach',      label: 'Sổ sách' },
  { key: 'giay_phep',    label: 'Giấy phép' },
  { key: 'khac',         label: 'Khác' },
]
const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]))

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function isValidUrl(str) {
  try { return /^https?:\/\//i.test(str) && Boolean(new URL(str)) }
  catch { return false }
}

// ── AddLinkModal ───────────────────────────────────────────────────────────────

function AddLinkModal({ onSave, onClose, saving }) {
  const [name, setName]         = useState('')
  const [url, setUrl]           = useState('')
  const [category, setCategory] = useState('khac')
  const [description, setDesc]  = useState('')
  const [errors, setErrors]     = useState({})

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saving, onClose])

  function validate() {
    const e = {}
    if (!name.trim()) e.name = 'Tên tài liệu không được để trống'
    if (!url.trim()) e.url = 'URL không được để trống'
    else if (!isValidUrl(url.trim())) e.url = 'URL không hợp lệ — phải bắt đầu bằng http:// hoặc https://'
    return e
  }

  function handleSubmit(e) {
    e.preventDefault()
    const e2 = validate()
    if (Object.keys(e2).length) { setErrors(e2); return }
    onSave({ name: name.trim(), url: url.trim(), category, description: description.trim() || undefined })
  }

  return (
    <div className={s.docModalOverlay} onClick={() => !saving && onClose()}>
      <div className={s.docModalDialog} onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className={s.docModalHead}>
          <div className={s.docModalHeadLeft}>
            <div className={s.docModalIconWrap}>
              <Link2 size={16} />
            </div>
            <div>
              <h3 className={s.docModalTitle}>Thêm link tài liệu</h3>
              <p className={s.docModalSubtitle}>Dán link Google Drive, Dropbox, OneDrive hoặc bất kỳ URL chia sẻ nào</p>
            </div>
          </div>
          <button className={s.docModalClose} onClick={onClose} disabled={saving} title="Đóng (Esc)">
            <X size={16} />
          </button>
        </div>

        {/* ── Body ── */}
        <form id="addLinkModalForm" onSubmit={handleSubmit}>
          <div className={s.docModalBody}>

            {/* Row 1: Tên + Danh mục */}
            <div className={s.docModalRow}>
              <div className={s.docModalField}>
                <label className={s.docModalLabel}>
                  Tên tài liệu <span className={s.docModalRequired}>*</span>
                </label>
                <input
                  className={`${s.docModalInput} ${errors.name ? s.docModalInputErr : ''}`}
                  placeholder="VD: Hợp đồng dịch vụ kế toán 2024"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: '' })) }}
                  autoFocus
                />
                {errors.name && <span className={s.docModalErr}>{errors.name}</span>}
              </div>

              <div className={s.docModalFieldSm}>
                <label className={s.docModalLabel}>Danh mục</label>
                <select
                  className={s.docModalSelect}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 2: URL */}
            <div className={s.docModalField}>
              <label className={s.docModalLabel}>
                Đường dẫn (URL) <span className={s.docModalRequired}>*</span>
              </label>
              <input
                className={`${s.docModalInput} ${errors.url ? s.docModalInputErr : ''}`}
                placeholder="https://docs.google.com/... hoặc link chia sẻ cloud khác"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setErrors((p) => ({ ...p, url: '' })) }}
              />
              {errors.url
                ? <span className={s.docModalErr}>{errors.url}</span>
                : <span className={s.docModalHint}>Chỉ chấp nhận URL bắt đầu bằng https:// hoặc http://</span>
              }
            </div>

            {/* Row 3: Mô tả */}
            <div className={s.docModalField}>
              <label className={s.docModalLabel}>
                Mô tả
                <span className={s.docModalOptional}> (tuỳ chọn)</span>
              </label>
              <textarea
                className={s.docModalTextarea}
                placeholder="Ghi chú thêm về nội dung, phạm vi hoặc ngày hiệu lực của tài liệu..."
                value={description}
                onChange={(e) => setDesc(e.target.value)}
                rows={3}
              />
            </div>

          </div>
        </form>

        {/* ── Footer ── */}
        <div className={s.docModalFoot}>
          <button type="button" className={s.btnOutline} onClick={onClose} disabled={saving}>
            Huỷ
          </button>
          <button
            form="addLinkModalForm"
            type="submit"
            className={s.btnPrimary}
            disabled={saving}
          >
            {saving ? <Loader2 size={13} className={s.spin} /> : <Check size={13} />}
            {saving ? 'Đang lưu...' : 'Lưu link tài liệu'}
          </button>
        </div>

      </div>
    </div>
  )
}

// ── EditLinkForm ───────────────────────────────────────────────────────────────

function EditLinkForm({ doc, onSave, onCancel, saving }) {
  const [name, setName]         = useState(doc.name)
  const [url, setUrl]           = useState(doc.url)
  const [category, setCategory] = useState(doc.category)
  const [description, setDesc]  = useState(doc.description ?? '')
  const [errors, setErrors]     = useState({})

  function validate() {
    const e = {}
    if (!name.trim()) e.name = 'Tên không được để trống'
    if (!url.trim()) e.url = 'URL không được để trống'
    else if (!isValidUrl(url.trim())) e.url = 'URL không hợp lệ'
    return e
  }

  function handleSubmit(e) {
    e.preventDefault()
    const e2 = validate()
    if (Object.keys(e2).length) { setErrors(e2); return }
    onSave({ name: name.trim(), url: url.trim(), category, description: description.trim() || null })
  }

  return (
    <div className={s.docEditRow}>
      <form onSubmit={handleSubmit}>
        <div className={s.addLinkFormGrid}>
          <div>
            <label className={s.addLinkFormLabel}>Tên tài liệu <span>*</span></label>
            <input
              className={`${s.addLinkFormInput} ${errors.name ? s.addLinkFormInputError : ''}`}
              value={name}
              onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: '' })) }}
            />
            {errors.name && <p className={s.addLinkFormError}>{errors.name}</p>}
          </div>
          <div>
            <label className={s.addLinkFormLabel}>Danh mục</label>
            <select
              className={s.addLinkFormInput}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <div className={s.addLinkFormFull}>
            <label className={s.addLinkFormLabel}>URL <span>*</span></label>
            <input
              className={`${s.addLinkFormInput} ${errors.url ? s.addLinkFormInputError : ''}`}
              value={url}
              onChange={(e) => { setUrl(e.target.value); setErrors((p) => ({ ...p, url: '' })) }}
            />
            {errors.url && <p className={s.addLinkFormError}>{errors.url}</p>}
          </div>
          <div className={s.addLinkFormFull}>
            <label className={s.addLinkFormLabel}>Mô tả</label>
            <textarea
              className={`${s.addLinkFormInput} ${s.addLinkFormTextarea}`}
              value={description}
              onChange={(e) => setDesc(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <div className={s.addLinkFormActions}>
          <button type="button" className={s.btnOutline} onClick={onCancel} disabled={saving}>Huỷ</button>
          <button type="submit" className={s.btnPrimary} disabled={saving}>
            {saving ? <Loader2 size={13} className={s.spin} /> : <Check size={13} />}
            {saving ? 'Đang lưu...' : 'Cập nhật'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── DocumentsTab ───────────────────────────────────────────────────────────────

export default function DocumentsTab({ company }) {
  const isAdmin  = useAuthStore((st) => st.user?.role === 'admin')
  const addToast = useToastStore((st) => st.toast)

  const [docs, setDocs]             = useState([])
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 })
  const [loading, setLoading]       = useState(true)
  const [page, setPage]             = useState(1)
  const [category, setCategory]     = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [editingId, setEditingId]   = useState(null)
  const [editSaving, setEditSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting]     = useState(false)

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    documentsApi.listDocuments(company.id, { category: category || undefined, page, limit: 20 })
      .then(({ documents: d, pagination: p }) => {
        if (!cancelled) { setDocs(d); setPagination(p) }
      })
      .catch(() => { if (!cancelled) setDocs([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [company.id, category, page])

  useEffect(() => {
    const cancel = load()
    return cancel
  }, [load])

  async function handleAdd(data) {
    setSaving(true)
    try {
      await documentsApi.addDocumentLink(company.id, data)
      addToast(`Đã thêm link "${data.name}"`, 'success')
      setShowAddModal(false)
      setPage(1)
      load()
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể thêm link', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleEdit(doc, data) {
    setEditSaving(true)
    try {
      await documentsApi.updateDocumentLink(company.id, doc.id, data)
      addToast('Đã cập nhật tài liệu', 'success')
      setEditingId(null)
      load()
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể cập nhật', 'error')
    } finally {
      setEditSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await documentsApi.deleteDocument(company.id, deleteTarget.id)
      addToast(`Đã xoá "${deleteTarget.name}"`, 'success')
      setDeleteTarget(null)
      if (docs.length === 1 && page > 1) setPage((p) => p - 1)
      else load()
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể xoá tài liệu', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>

      {/* ── Header row: add button + count ── */}
      <div className={s.docHeaderRow}>
        <button className={s.addLinkBtn} onClick={() => setShowAddModal(true)}>
          <Plus size={14} />
          Thêm link tài liệu
        </button>
        {!loading && pagination.total > 0 && (
          <span className={s.docCountBadge}>{pagination.total} tài liệu</span>
        )}
      </div>

      {/* ── Category filter bar ── */}
      <div className={s.docFilterBar}>
        <Filter size={12} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
        <span className={s.docFilterLabel}>Danh mục:</span>
        <div className={s.docFilterChips}>
          {[{ key: '', label: 'Tất cả' }, ...CATEGORIES].map(({ key, label }) => (
            <button
              key={key}
              className={`${s.docCatChip} ${category === key ? s.docCatChipActive : ''}`}
              onClick={() => { setCategory(key); setPage(1) }}
            >
              {label}
            </button>
          ))}
        </div>
        {category && (
          <button className={s.docFilterReset} onClick={() => { setCategory(''); setPage(1) }}>
            <RotateCcw size={11} /> Xoá lọc
          </button>
        )}
      </div>

      {/* ── Document table ── */}
      <div className={s.docTableWrap}>
        <table className={s.docTable}>
          <thead>
            <tr>
              <th>Tài liệu</th>
              <th>Danh mục</th>
              <th>Đường dẫn</th>
              <th>Ngày thêm</th>
              <th>Người thêm</th>
              <th className={s.docThActions}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className={s.docTableRow}>
                  <td colSpan={6} style={{ padding: '14px 16px' }}>
                    <div className={s.docSkeletonBar} style={{ width: `${50 + (i % 3) * 12}%` }} />
                  </td>
                </tr>
              ))
            ) : docs.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className={s.docEmpty}>
                    <FolderOpen size={36} color="var(--color-border)" />
                    <p>
                      {category
                        ? 'Không có tài liệu trong danh mục này'
                        : 'Chưa có tài liệu nào — nhấn "Thêm link" để bắt đầu'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : docs.map((doc) => (
              editingId === doc.id ? (
                <tr key={doc.id}>
                  <td colSpan={6} className={s.docEditTd}>
                    <EditLinkForm
                      doc={doc}
                      onSave={(data) => handleEdit(doc, data)}
                      onCancel={() => setEditingId(null)}
                      saving={editSaving}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={doc.id} className={s.docTableRow}>

                  {/* Tài liệu */}
                  <td>
                    <div className={s.docNameCell}>
                      <span className={s.docLinkDot}><Link2 size={13} /></span>
                      <div className={s.docNameBody}>
                        <span className={s.docTableName}>{doc.name}</span>
                        {doc.description && (
                          <span className={s.docTableDesc}>{doc.description}</span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Danh mục */}
                  <td>
                    <span className={`${s.docCatBadge} ${s[`docCat_${doc.category}`]}`}>
                      {CAT_LABEL[doc.category] ?? doc.category}
                    </span>
                  </td>

                  {/* Đường dẫn */}
                  <td>
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={s.docUrlLink}
                      title={doc.url}
                    >
                      <ExternalLink size={11} className={s.docUrlIcon} />
                      <span className={s.docUrlText}>{doc.url}</span>
                    </a>
                  </td>

                  {/* Ngày thêm */}
                  <td className={s.docTableDate}>{fmtDate(doc.createdAt)}</td>

                  {/* Người thêm */}
                  <td className={s.docTableBy}>{doc.addedByName || '—'}</td>

                  {/* Thao tác */}
                  <td>
                    <div className={s.docActions}>
                      <button
                        className={s.docActionBtn}
                        title="Mở link"
                        onClick={() => window.open(doc.url, '_blank', 'noopener,noreferrer')}
                      >
                        <ExternalLink size={13} />
                      </button>
                      <button
                        className={s.docActionBtn}
                        title="Chỉnh sửa"
                        onClick={() => setEditingId(doc.id)}
                      >
                        <Pencil size={13} />
                      </button>
                      {isAdmin && (
                        <button
                          className={`${s.docActionBtn} ${s.docActionDanger}`}
                          title="Xoá tài liệu"
                          onClick={() => setDeleteTarget(doc)}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {pagination.totalPages > 1 && (
        <div className={s.paginationBar} style={{ marginTop: 10 }}>
          <span className={s.paginationInfo}>{pagination.total} tài liệu</span>
          <div className={s.paginationBtns}>
            <button className={s.paginationBtn} onClick={() => setPage((p) => p - 1)} disabled={page === 1}>‹</button>
            <span style={{ fontSize: 'var(--fs-sm)', padding: '0 8px', color: 'var(--color-muted)' }}>
              {page} / {pagination.totalPages}
            </span>
            <button className={s.paginationBtn} onClick={() => setPage((p) => p + 1)} disabled={page === pagination.totalPages}>›</button>
          </div>
        </div>
      )}

      {/* ── Add link modal ── */}
      {showAddModal && (
        <AddLinkModal
          onSave={handleAdd}
          onClose={() => setShowAddModal(false)}
          saving={saving}
        />
      )}

      {/* ── Delete confirm overlay ── */}
      {deleteTarget && (
        <div className={s.docDeleteOverlay} onClick={() => setDeleteTarget(null)}>
          <div className={s.docDeleteDialog} onClick={(e) => e.stopPropagation()}>
            <div className={s.terminateWarn} style={{ background: 'var(--color-danger-bg-soft)', borderColor: 'var(--color-danger-border)' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, color: 'var(--color-danger)' }} />
              <span style={{ fontSize: 'var(--fs-md)' }}>
                Xoá link tài liệu <strong>"{deleteTarget.name}"</strong>?
                Hành động này không thể hoàn tác.
              </span>
            </div>
            <div className={s.modalActions} style={{ marginTop: 16 }}>
              <button onClick={() => setDeleteTarget(null)} className={s.btnOutline}>Huỷ</button>
              <button onClick={handleDelete} disabled={deleting} className={s.btnDanger}>
                {deleting ? <Loader2 size={13} className={s.spin} /> : <Trash2 size={13} />}
                {deleting ? 'Đang xoá...' : 'Xoá'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
