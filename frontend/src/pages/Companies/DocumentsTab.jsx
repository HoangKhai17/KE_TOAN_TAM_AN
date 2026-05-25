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
  { key: 'hop_dong',    label: 'Hợp đồng' },
  { key: 'bao_cao_thue', label: 'Báo cáo thuế' },
  { key: 'so_sach',     label: 'Sổ sách' },
  { key: 'giay_phep',   label: 'Giấy phép' },
  { key: 'khac',        label: 'Khác' },
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

// ── AddLinkForm ────────────────────────────────────────────────────────────────

function AddLinkForm({ onSave, onCancel, saving }) {
  const [name, setName]           = useState('')
  const [url, setUrl]             = useState('')
  const [category, setCategory]   = useState('khac')
  const [description, setDesc]    = useState('')
  const [errors, setErrors]       = useState({})

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
    <div className={s.addLinkForm}>
      <p className={s.addLinkFormTitle}>Thêm link tài liệu</p>
      <form onSubmit={handleSubmit}>
        <div className={s.addLinkFormGrid}>
          <div>
            <label className={s.addLinkFormLabel}>Tên tài liệu <span>*</span></label>
            <input
              className={`${s.addLinkFormInput} ${errors.name ? s.addLinkFormInputError : ''}`}
              placeholder="VD: Hợp đồng dịch vụ 2024"
              value={name}
              onChange={(e) => { setName(e.target.value); setErrors((prev) => ({ ...prev, name: '' })) }}
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
              placeholder="https://docs.google.com/... hoặc link chia sẻ cloud khác"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setErrors((prev) => ({ ...prev, url: '' })) }}
            />
            {errors.url && <p className={s.addLinkFormError}>{errors.url}</p>}
          </div>
          <div className={s.addLinkFormFull}>
            <label className={s.addLinkFormLabel}>Mô tả <span style={{ color: 'var(--color-muted)', fontWeight: 400 }}>(tùy chọn)</span></label>
            <textarea
              className={`${s.addLinkFormInput} ${s.addLinkFormTextarea}`}
              placeholder="Ghi chú về tài liệu này..."
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
            {saving ? 'Đang lưu...' : 'Lưu link'}
          </button>
        </div>
      </form>
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
  const [showAddForm, setShowAddForm] = useState(false)
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
      setShowAddForm(false)
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
      {/* Add link button / form */}
      {!showAddForm ? (
        <button className={s.addLinkBtn} onClick={() => setShowAddForm(true)}>
          <Plus size={14} />
          Thêm link tài liệu
        </button>
      ) : (
        <AddLinkForm
          onSave={handleAdd}
          onCancel={() => setShowAddForm(false)}
          saving={saving}
        />
      )}

      {/* Category filter */}
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

      {/* Document list */}
      <div className={s.docList}>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={s.docRow} style={{ opacity: 0.5 }}>
              <div style={{ width: 32, height: 32, background: '#f1f5f9', borderRadius: 6 }} />
              <div style={{ flex: 1 }}>
                <div style={{ height: 12, width: '55%', background: '#f1f5f9', borderRadius: 4, marginBottom: 6 }} />
                <div style={{ height: 10, width: '35%', background: '#f1f5f9', borderRadius: 4 }} />
              </div>
            </div>
          ))
        ) : docs.length === 0 ? (
          <div className={s.docEmpty}>
            <FolderOpen size={36} color="#d1d5db" />
            <p>{category ? 'Không có tài liệu trong danh mục này' : 'Chưa có tài liệu nào'}</p>
          </div>
        ) : docs.map((doc) => (
          editingId === doc.id ? (
            <EditLinkForm
              key={doc.id}
              doc={doc}
              onSave={(data) => handleEdit(doc, data)}
              onCancel={() => setEditingId(null)}
              saving={editSaving}
            />
          ) : (
            <div key={doc.id} className={s.docRow}>
              <div className={s.docLinkIcon}>
                <Link2 size={15} color="#2563eb" />
              </div>
              <div className={s.docInfo}>
                <div className={s.docFileName}>{doc.name}</div>
                <div className={s.docMeta}>
                  <span className={s.docCatPill}>{CAT_LABEL[doc.category] ?? doc.category}</span>
                  <span>{fmtDate(doc.createdAt)}</span>
                  {doc.addedByName && <span>bởi {doc.addedByName}</span>}
                </div>
                {doc.description && <div className={s.docDescription}>{doc.description}</div>}
              </div>
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
            </div>
          )
        ))}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className={s.paginationBar} style={{ marginTop: 8 }}>
          <span className={s.paginationInfo}>
            {pagination.total} tài liệu
          </span>
          <div className={s.paginationBtns}>
            <button className={s.paginationBtn} onClick={() => setPage((p) => p - 1)} disabled={page === 1}>‹</button>
            <span style={{ fontSize: 12, padding: '0 8px', color: 'var(--color-muted)' }}>
              {page} / {pagination.totalPages}
            </span>
            <button className={s.paginationBtn} onClick={() => setPage((p) => p + 1)} disabled={page === pagination.totalPages}>›</button>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className={s.docDeleteOverlay} onClick={() => setDeleteTarget(null)}>
          <div className={s.docDeleteDialog} onClick={(e) => e.stopPropagation()}>
            <div className={s.terminateWarn} style={{ background: '#fef2f2', borderColor: '#fca5a5' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, color: '#dc2626' }} />
              <span style={{ fontSize: 13 }}>
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
