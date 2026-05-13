import { useState, useEffect, useRef, useCallback } from 'react'
import {
  FileText, Upload, Trash2, ExternalLink, Loader2,
  Filter, RotateCcw, File, FileSpreadsheet, Image,
  AlertTriangle, FolderOpen,
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

const MIME_ICONS = {
  'application/pdf': FileText,
  'application/msword': FileText,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': FileText,
  'application/vnd.ms-excel': FileSpreadsheet,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': FileSpreadsheet,
  'image/jpeg': Image,
  'image/png': Image,
}

const MIME_COLORS = {
  'application/pdf': '#dc2626',
  'application/msword': '#2563eb',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '#2563eb',
  'application/vnd.ms-excel': '#16a34a',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '#16a34a',
  'image/jpeg': '#d97706',
  'image/png': '#d97706',
}

function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function FileIcon({ mimeType, size = 16 }) {
  const Icon  = MIME_ICONS[mimeType]  ?? File
  const color = MIME_COLORS[mimeType] ?? '#6b7280'
  return <Icon size={size} color={color} style={{ flexShrink: 0 }} />
}

// ── DocumentsTab ───────────────────────────────────────────────────────────────

export default function DocumentsTab({ company }) {
  const isAdmin  = useAuthStore((st) => st.user?.role === 'admin')
  const addToast = useToastStore((st) => st.toast)
  const fileRef  = useRef(null)

  const [docs, setDocs]           = useState([])
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 })
  const [loading, setLoading]     = useState(true)
  const [page, setPage]           = useState(1)
  const [category, setCategory]   = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadCat, setUploadCat] = useState('khac')
  const [dragOver, setDragOver]   = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting]   = useState(false)
  const [openingId, setOpeningId] = useState(null)

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

  async function handleUpload(files) {
    if (!files?.length) return
    const file = files[0]
    setUploading(true)
    try {
      const doc = await documentsApi.uploadDocument(company.id, file, { category: uploadCat })
      addToast(`Đã upload "${doc.fileName}"`, 'success')
      setPage(1)
      load()
    } catch (err) {
      const msg = err.response?.data?.error?.message ?? err.message ?? 'Upload thất bại'
      addToast(msg, 'error')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await documentsApi.deleteDocument(company.id, deleteTarget.id)
      addToast(`Đã xoá "${deleteTarget.fileName}"`, 'success')
      setDeleteTarget(null)
      if (docs.length === 1 && page > 1) setPage((p) => p - 1)
      else load()
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể xoá tài liệu', 'error')
    } finally {
      setDeleting(false)
    }
  }

  async function handleOpen(doc) {
    setOpeningId(doc.id)
    try {
      const url = await documentsApi.getLinkUrl(company.id, doc.id)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      addToast('Không thể lấy link tài liệu', 'error')
    } finally {
      setOpeningId(null)
    }
  }

  function onDrop(e) {
    e.preventDefault()
    setDragOver(false)
    handleUpload(e.dataTransfer.files)
  }

  return (
    <div>
      {/* Upload zone */}
      <div
        className={`${s.dropZone} ${dragOver ? s.dropZoneActive : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !uploading && fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          style={{ display: 'none' }}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt"
          onChange={(e) => handleUpload(e.target.files)}
        />
        {uploading ? (
          <div className={s.dropZoneContent}>
            <Loader2 size={28} className={s.spin} color="#2563eb" />
            <p className={s.dropZoneText}>Đang upload lên OneDrive...</p>
          </div>
        ) : (
          <div className={s.dropZoneContent}>
            <Upload size={28} color="#2563eb" style={{ opacity: 0.7 }} />
            <p className={s.dropZoneText}>
              Kéo thả file vào đây hoặc <span className={s.dropZoneLink}>chọn file</span>
            </p>
            <p className={s.dropZoneHint}>PDF, Word, Excel, JPG, PNG — tối đa 20MB</p>
          </div>
        )}
      </div>

      {/* Upload category select */}
      <div className={s.uploadMeta}>
        <span className={s.uploadMetaLabel}>Danh mục khi upload:</span>
        <select
          value={uploadCat}
          onChange={(e) => setUploadCat(e.target.value)}
          className={s.uploadCatSelect}
        >
          {CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* Filter bar */}
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
          <div key={doc.id} className={s.docRow}>
            <div className={s.docFileIcon}>
              <FileIcon mimeType={doc.mimeType} size={18} />
            </div>
            <div className={s.docInfo}>
              <div className={s.docFileName}>{doc.fileName}</div>
              <div className={s.docMeta}>
                <span className={s.docCatPill}>{CAT_LABEL[doc.category] ?? doc.category}</span>
                {doc.sizeBytes && <span>{fmtSize(doc.sizeBytes)}</span>}
                <span>{fmtDate(doc.createdAt)}</span>
                {doc.uploaderName && <span>bởi {doc.uploaderName}</span>}
              </div>
            </div>
            <div className={s.docActions}>
              <button
                className={s.docActionBtn}
                title="Mở trên OneDrive"
                onClick={() => handleOpen(doc)}
                disabled={openingId === doc.id}
              >
                {openingId === doc.id
                  ? <Loader2 size={13} className={s.spin} />
                  : <ExternalLink size={13} />
                }
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
                Xoá <strong>"{deleteTarget.fileName}"</strong> khỏi OneDrive và hệ thống?
                Hành động này không thể hoàn tác.
              </span>
            </div>
            <div className={s.modalActions} style={{ marginTop: 16 }}>
              <button onClick={() => setDeleteTarget(null)} className={s.btnOutline}>Huỷ</button>
              <button onClick={handleDelete} disabled={deleting} className={s.btnDanger}>
                {deleting ? <Loader2 size={13} className={s.spin} /> : <Trash2 size={13} />}
                {deleting ? 'Đang xoá...' : 'Xoá tài liệu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
