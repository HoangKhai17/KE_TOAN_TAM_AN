import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Link2, Plus, Trash2, ExternalLink, Loader2,
  Filter, RotateCcw, FolderOpen, AlertTriangle,
  Pencil, Check, X, Upload, FileText, Download, Eye,
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { useEnumsStore } from '../../hooks/useEnums'
import { MultiSelectFilter } from './Companies'
import ColumnFilterDropdown from '../../components/ui/ColumnFilterDropdown'
import { matchColFilter, isColFilterActive } from '../../components/ui/columnFilter'
import * as documentsApi from '../../api/documents'
import * as attApi from '../../api/attachments'
import AttachmentPreviewModal from './AttachmentPreviewModal'
import DeleteConfirmDialog, { useDeleteConfirm } from '../../components/ui/DeleteConfirmDialog'
import {
  DragHeaderCell, DragRowCell, IndexHeaderCell, IndexRowCell,
  SelectionHeaderCell, SelectionRowCell, useRowReorder, useRowSelection,
} from '../../components/ui/data-table'
import { useCompanyFooter } from './companyFooter'
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

// ── Header-filter cột (docs/018) — helper cấp module ─────────────────────────────
function docColType(colKey) {
  if (colKey === 'category' || colKey === 'addedByName') return 'enum'
  if (colKey === 'createdAt') return 'dateRange'
  return 'text'   // name, period (Kỳ) — gõ text tìm theo một phần
}
function docColLabel(row, colKey) {
  switch (colKey) {
    case 'name':        return row.name || '(Trống)'
    case 'category':    return useEnumsStore.getState().getLabel('document_category', row.category, CAT_LABEL[row.category] ?? row.category)
    case 'period':      return row.period || '(Trống)'
    case 'createdAt':   return row.createdAt ? fmtDate(row.createdAt) : '(Trống)'
    case 'addedByName': return row.addedByName || '(Trống)'
    default:            return String(row[colKey] ?? '')
  }
}
function docSortKey(row, colKey) {
  if (colKey === 'createdAt') return row.createdAt ?? ''
  if (colKey === 'category')  return useEnumsStore.getState().getLabel('document_category', row.category, CAT_LABEL[row.category] ?? row.category ?? '')
  const v = row[colKey]
  return v != null ? String(v).toLowerCase() : ''
}

// ── AddLinkModal ───────────────────────────────────────────────────────────────

function AddLinkModal({ onSave, onClose, saving, catOptions }) {
  // Tài liệu là LINK hoặc FILE — không phải cả hai (khớp ràng buộc phía CSDL)
  const [kieu, setKieu]         = useState('link')   // 'link' | 'file'
  const [file, setFile]         = useState(null)
  const [name, setName]         = useState('')
  const [url, setUrl]           = useState('')
  const [category, setCategory] = useState('khac')
  const [period, setPeriod]     = useState('')
  const [description, setDesc]  = useState('')
  const [errors, setErrors]     = useState({})

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saving, onClose])

  function chonFile(f) {
    if (!f) { setFile(null); return }
    const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
    if (!attApi.ALLOWED_EXTS.includes(ext)) {
      setErrors((p) => ({ ...p, file: `Định dạng ".${ext}" không được phép. Chỉ nhận: ${attApi.ALLOWED_EXTS.join(', ')}.` }))
      return
    }
    if (f.size > attApi.MAX_FILE_BYTES) {
      setErrors((p) => ({ ...p, file: `File ${attApi.formatSize(f.size)} vượt quá 5MB.` }))
      return
    }
    setErrors((p) => ({ ...p, file: '' }))
    setFile(f)
    // Chưa đặt tên thì lấy luôn tên file cho đỡ phải gõ
    if (!name.trim()) setName(f.name.replace(/\.[^.]+$/, ''))
  }

  function validate() {
    const e = {}
    if (!name.trim()) e.name = 'Tên tài liệu không được để trống'
    if (kieu === 'link') {
      if (!url.trim()) e.url = 'URL không được để trống'
      else if (!isValidUrl(url.trim())) e.url = 'URL không hợp lệ — phải bắt đầu bằng http:// hoặc https://'
    } else if (!file) {
      e.file = 'Chưa chọn file'
    }
    return e
  }

  function handleSubmit(e) {
    e.preventDefault()
    const e2 = validate()
    if (Object.keys(e2).length) { setErrors(e2); return }
    onSave({
      name: name.trim(),
      category,
      period: period.trim() || undefined,
      description: description.trim() || undefined,
      ...(kieu === 'link' ? { url: url.trim() } : { file }),
    })
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
              <h3 className={s.docModalTitle}>Thêm tài liệu</h3>
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
                  {catOptions.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div className={s.docModalFieldSm}>
                <label className={s.docModalLabel}>
                  Kỳ<span className={s.docModalOptional}> (tuỳ chọn)</span>
                </label>
                <input
                  className={s.docModalInput}
                  placeholder="VD: 2025, T06/2026"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  maxLength={30}
                />
              </div>
            </div>

            {/* Row 2: chọn kiểu — Link hoặc File */}
            <div className={s.docModalField}>
              <label className={s.docModalLabel}>Nguồn tài liệu</label>
              <div className={s.docKindSwitch}>
                <button
                  type="button"
                  className={`${s.docKindBtn} ${kieu === 'link' ? s.docKindBtnActive : ''}`}
                  onClick={() => { setKieu('link'); setErrors((p) => ({ ...p, file: '' })) }}
                >
                  <Link2 size={13} /> Đường dẫn
                </button>
                <button
                  type="button"
                  className={`${s.docKindBtn} ${kieu === 'file' ? s.docKindBtnActive : ''}`}
                  onClick={() => { setKieu('file'); setErrors((p) => ({ ...p, url: '' })) }}
                >
                  <Upload size={13} /> Tải file lên
                </button>
              </div>
            </div>

            {kieu === 'link' ? (
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
            ) : (
              <div className={s.docModalField}>
                <label className={s.docModalLabel}>
                  Chọn file <span className={s.docModalRequired}>*</span>
                </label>
                <input
                  type="file"
                  className={`${s.docModalInput} ${errors.file ? s.docModalInputErr : ''}`}
                  accept={attApi.ACCEPT_ATTR}
                  onChange={(e) => chonFile(e.target.files?.[0] ?? null)}
                />
                {file && (
                  <span className={s.docFilePicked}>
                    <FileText size={12} /> {file.name} · {attApi.formatSize(file.size)}
                  </span>
                )}
                {errors.file
                  ? <span className={s.docModalErr}>{errors.file}</span>
                  : <span className={s.docModalHint}>
                      Tối đa 5MB · {attApi.ALLOWED_EXTS.join(', ')} — không nhận video/âm thanh
                    </span>
                }
              </div>
            )}

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
            {saving ? 'Đang lưu...' : 'Lưu tài liệu'}
          </button>
        </div>

      </div>
    </div>
  )
}

// ── EditLinkForm ───────────────────────────────────────────────────────────────

function EditLinkForm({ doc, onSave, onCancel, saving, catOptions }) {
  // Tài liệu dạng FILE không có URL để sửa — chỉ đổi được tên, danh mục, kỳ, mô tả.
  // Muốn thay file thì xoá rồi tải lên lại.
  const laFile = !!doc.file
  const [name, setName]         = useState(doc.name)
  const [url, setUrl]           = useState(doc.url ?? '')
  const [category, setCategory] = useState(doc.category)
  const [period, setPeriod]     = useState(doc.period ?? '')
  const [description, setDesc]  = useState(doc.description ?? '')
  const [errors, setErrors]     = useState({})

  function validate() {
    const e = {}
    if (!name.trim()) e.name = 'Tên không được để trống'
    if (!laFile) {
      if (!url.trim()) e.url = 'URL không được để trống'
      else if (!isValidUrl(url.trim())) e.url = 'URL không hợp lệ'
    }
    return e
  }

  function handleSubmit(e) {
    e.preventDefault()
    const e2 = validate()
    if (Object.keys(e2).length) { setErrors(e2); return }
    onSave({
      name: name.trim(), category, period: period.trim() || null,
      description: description.trim() || null,
      ...(laFile ? {} : { url: url.trim() }),
    })
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
              {catOptions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className={s.addLinkFormLabel}>Kỳ</label>
            <input
              className={s.addLinkFormInput}
              value={period}
              placeholder="VD: 2025, T06/2026"
              onChange={(e) => setPeriod(e.target.value)}
              maxLength={30}
            />
          </div>
          <div className={s.addLinkFormFull}>
            {laFile ? (
              <>
                <label className={s.addLinkFormLabel}>File đính kèm</label>
                <div className={s.docEditFileInfo}>
                  <FileText size={12} />
                  {doc.file.fileName} · {attApi.formatSize(doc.file.sizeBytes)}
                  <span>— muốn thay file thì xoá tài liệu rồi tải lên lại</span>
                </div>
              </>
            ) : (
              <>
                <label className={s.addLinkFormLabel}>URL <span>*</span></label>
                <input
                  className={`${s.addLinkFormInput} ${errors.url ? s.addLinkFormInputError : ''}`}
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setErrors((p) => ({ ...p, url: '' })) }}
                />
                {errors.url && <p className={s.addLinkFormError}>{errors.url}</p>}
              </>
            )}
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

// ── PreviewModal: xem trước PDF/ảnh ngay trong app (tải blob giữ auth) ───────────

function PreviewModal({ doc, onClose }) {
  return (
    <AttachmentPreviewModal file={doc.file} title={doc.name} onClose={onClose} />
  )
}

// ── DocumentsTab ───────────────────────────────────────────────────────────────

export default function DocumentsTab({ company }) {
  const confirmDelete = useDeleteConfirm()
  const isAdmin  = useAuthStore((st) => st.user?.role === 'admin')
  const addToast = useToastStore((st) => st.toast)
  const getOptions = useEnumsStore((st) => st.getOptions)
  const getLabel   = useEnumsStore((st) => st.getLabel)

  // Danh mục lấy từ ENUM (document_category), fallback hằng số cũ nếu enum chưa tải
  const catOptions = getOptions('document_category').length > 0
    ? getOptions('document_category').map((o) => ({ value: o.key, label: o.label }))
    : CATEGORIES.map((c) => ({ value: c.key, label: c.label }))
  const catLabel = (key) => getLabel('document_category', key, CAT_LABEL[key] ?? key)

  const [docs, setDocs]             = useState([])
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 })
  const [loading, setLoading]       = useState(true)
  const [page, setPage]             = useState(1)
  const [pageSize, setPageSize]     = useState(20)
  const [category, setCategory]     = useState([])   // multi-select
  const [period, setPeriod]         = useState('')   // text (đã áp dụng)
  const [periodInput, setPeriodInput] = useState('') // ô nhập Kỳ (debounce)
  const [showAddModal, setShowAddModal] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [editingId, setEditingId]   = useState(null)
  const [editSaving, setEditSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting]     = useState(false)
  const [previewDoc, setPreviewDoc] = useState(null)
  const selection = useRowSelection({ rows: docs })

  // Header-filter cột (docs/018) — client-side trên tập đã tải
  const [colFilters, setColFilters]   = useState({})
  const [sortState, setSortState]     = useState({ col: null, dir: 'asc' })
  const [filterPopup, setFilterPopup] = useState(null)

  const hasFilter = category.length > 0 || period.trim() !== ''

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    documentsApi.listDocuments(company.id, {
      category: category.length ? category.join(',') : undefined,
      period:   period.trim() || undefined,
      page, limit: 500,
    })
      .then(({ documents: d, pagination: p }) => {
        if (!cancelled) { setDocs(d); setPagination(p) }
      })
      .catch(() => { if (!cancelled) setDocs([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [company.id, category, period, page])

  useEffect(() => {
    const cancel = load()
    return cancel
  }, [load])

  // Gõ Kỳ: debounce 350ms rồi mới áp dụng bộ lọc
  useEffect(() => {
    const t = setTimeout(() => setPeriod(periodInput.trim()), 350)
    return () => clearTimeout(t)
  }, [periodInput])

  // Đổi bộ lọc thì về trang 1
  useEffect(() => { setPage(1) }, [category, period, pageSize, colFilters, sortState])

  // Lọc + sắp xếp theo header cột (client-side, AND nhiều cột) — docs/018
  const displayed = useMemo(() => {
    let result = [...docs]
    for (const [colKey, fv] of Object.entries(colFilters)) {
      const t = docColType(colKey)
      if (!isColFilterActive(fv, t)) continue
      result = result.filter((r) => matchColFilter(fv, t, {
        label: docColLabel(r, colKey),
        date:  r[colKey],
      }))
    }
    if (sortState.col) {
      result.sort((a, b) => {
        const cmp = String(docSortKey(a, sortState.col)).localeCompare(String(docSortKey(b, sortState.col)), 'vi', { numeric: true })
        return sortState.dir === 'asc' ? cmp : -cmp
      })
    }
    return result
  }, [docs, colFilters, sortState])

  // Phân trang client-side trên tập đã lọc (đồng bộ footer hệ thống)
  const clientTotal      = displayed.length
  const clientTotalPages = Math.max(1, Math.ceil(clientTotal / pageSize))
  const safePage         = Math.min(page, clientTotalPages)
  const pageDocs         = displayed.slice((safePage - 1) * pageSize, safePage * pageSize)

  // Kéo-thả chỉ khi KHÔNG lọc/sắp VÀ vừa 1 trang (tránh lệch thứ tự khi phân trang)
  const canReorder = !hasFilter && Object.keys(colFilters).length === 0 && sortState.col == null && editingId == null && clientTotalPages === 1

  // Phân trang → footer trang (thay copyright)
  useCompanyFooter(loading ? null : {
    total: clientTotal,
    from: (safePage - 1) * pageSize + 1,
    to: Math.min(safePage * pageSize, clientTotal),
    page: safePage, pageSize, totalPages: clientTotalPages,
    itemLabel: 'tài liệu',
    onPageChange: setPage, onPageSizeChange: setPageSize,
  })
  const reorder = useRowReorder({
    rows: docs, setRows: setDocs, enabled: canReorder,
    onError: () => addToast('Không thể lưu thứ tự tài liệu', 'error'),
    onPersist: (ordered, previous) => Promise.all(ordered
      .map((doc, index) => ({ doc, index }))
      .filter(({ doc, index }) => previous[index]?.id !== doc.id)
      .map(({ doc, index }) => documentsApi.updateDocumentLink(company.id, doc.id, { sortOrder: index }))),
  })

  async function handleBulkDelete() {
    if (!isAdmin || !selection.selectedCount || !(await confirmDelete({ title: 'Xóa tài liệu', message: <>Bạn có chắc chắn muốn xóa <strong>{selection.selectedCount}</strong> tài liệu đã chọn?</>, confirmLabel: `Xóa ${selection.selectedCount} mục` }))) return
    const ids = [...selection.selectedIds]
    const results = await Promise.allSettled(ids.map((id) => documentsApi.deleteDocument(company.id, id)))
    const deleted = new Set(ids.filter((_, index) => results[index].status === 'fulfilled'))
    setDocs((current) => current.filter((doc) => !deleted.has(doc.id)))
    selection.remove(deleted)
    addToast(`Đã xoá ${deleted.size}/${ids.length} tài liệu`, deleted.size ? 'success' : 'error')
  }

  function hasColFilter(colKey) {
    return isColFilterActive(colFilters[colKey], docColType(colKey))
  }
  const colFilterCount = Object.keys(colFilters).filter(hasColFilter).length

  function handleColSort(colKey, dir) { setSortState({ col: colKey, dir }); setFilterPopup(null) }
  function handleColFilterChange(colKey, val) {
    setColFilters((prev) => {
      const next = { ...prev }
      const empty = val == null
        || (val instanceof Set && val.size === 0)
        || (typeof val === 'string' && !val.trim())
      if (empty) delete next[colKey]
      else next[colKey] = val
      return next
    })
  }
  function openColFilter(colKey, e) {
    e.stopPropagation()
    if (filterPopup?.colKey === colKey) { setFilterPopup(null); return }
    const r = e.currentTarget.getBoundingClientRect()
    setFilterPopup({ colKey, top: r.bottom + 4, left: r.left })
  }

  function FilterTh({ colKey, children }) {
    const active = hasColFilter(colKey) || sortState.col === colKey
    return (
      <th>
        <div className={s.hdldThInner}>
          <span className={s.hdldThLabel}>{children}</span>
          <button
            data-colfilter-btn
            className={`${s.hdldFilterBtn} ${active ? s.hdldFilterBtnActive : ''}`}
            onClick={(e) => openColFilter(colKey, e)}
            title="Lọc / Sắp xếp"
          >
            <Filter size={10} />
          </button>
        </div>
      </th>
    )
  }

  async function handleAdd(data) {
    setSaving(true)
    try {
      const { file, ...rest } = data
      let payload = rest
      if (file) {
        // Tải file lên TRƯỚC, lấy id rồi mới tạo bản ghi tài liệu — nếu tải lỗi
        // thì không để lại dòng tài liệu rỗng trong danh sách.
        const up = await attApi.uploadFile('company', company.id, file, { title: rest.name })
        payload = { ...rest, attachmentId: up.id }
      }
      await documentsApi.addDocumentLink(company.id, payload)
      addToast(`Đã thêm ${file ? 'file' : 'link'} "${data.name}"`, 'success')
      setShowAddModal(false)
      setPage(1)
      load()
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể thêm tài liệu', 'error')
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

      {/* ── Một hàng duy nhất: nút thêm + bộ lọc danh mục ──
           Trước đây tách 2 hàng, hàng nút bỏ trống gần hết chiều ngang. */}
      <div className={s.docToolbar}>
        <button className={s.addLinkBtn} onClick={() => setShowAddModal(true)}>
          <Plus size={14} />
          Thêm tài liệu
        </button>

        <span className={s.docToolbarDivider} />

        <Filter size={12} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
        <span className={s.docFilterLabel}>Danh mục:</span>
        <MultiSelectFilter
          options={catOptions}
          value={category}
          onChange={setCategory}
          placeholder="Tất cả"
        />

        <span className={s.docFilterLabel}>Kỳ:</span>
        <input
          className={s.docPeriodFilter}
          value={periodInput}
          onChange={(e) => setPeriodInput(e.target.value)}
          placeholder="VD: 2026, T07/2026"
        />

        <div className={s.docToolbarRight}>
          {(hasFilter || colFilterCount > 0 || sortState.col) && (
            <button
              className={s.docFilterReset}
              onClick={() => {
                setCategory([]); setPeriodInput(''); setPeriod('')
                setColFilters({}); setSortState({ col: null, dir: 'asc' })
              }}
            >
              <RotateCcw size={11} /> Xoá lọc
            </button>
          )}
          {!loading && docs.length > 0 && (
            <span className={s.docCountBadge}>
              {displayed.length}{displayed.length < docs.length ? `/${docs.length}` : ''} tài liệu
            </span>
          )}
          {isAdmin && selection.selectedCount > 0 && <button className={`${s.btnDanger} ${s.dataTableBulkDelete}`} onClick={handleBulkDelete}><Trash2 size={13} /> Xoá {selection.selectedCount} dòng</button>}
        </div>
      </div>

      {/* ── Document table ── */}
      <div className={s.docTableWrap}>
        <table className={s.docTable}>
          <colgroup>
            <col className={s.dataTableColDrag} /><col className={s.dataTableColSelect} /><col className={s.dataTableColIndex} />
            <col className={s.docColName} />
            <col className={s.docColCat} />
            <col className={s.docColPeriod} />
            <col className={s.docColUrl} />
            <col className={s.docColDate} />
            <col className={s.docColBy} />
            <col className={s.docColActions} />
          </colgroup>
          <thead>
            <tr>
              <DragHeaderCell />
              <SelectionHeaderCell allSelected={selection.allSelected} someSelected={selection.someSelected} onToggle={selection.toggleAll} />
              <IndexHeaderCell />
              <FilterTh colKey="name">Tài liệu</FilterTh>
              <FilterTh colKey="category">Danh mục</FilterTh>
              <FilterTh colKey="period">Kỳ</FilterTh>
              <th>Đường dẫn</th>
              <FilterTh colKey="createdAt">Ngày thêm</FilterTh>
              <FilterTh colKey="addedByName">Người thêm</FilterTh>
              <th className={s.docThActions}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className={s.docTableRow}>
                  <td colSpan={10} style={{ padding: '7px 8px' }}>
                    <div className={s.docSkeletonBar} style={{ width: `${50 + (i % 3) * 12}%` }} />
                  </td>
                </tr>
              ))
            ) : displayed.length === 0 ? (
              <tr>
                <td colSpan={10}>
                  <div className={s.docEmpty}>
                    <FolderOpen size={36} color="var(--color-border)" />
                    <p>
                      {(hasFilter || colFilterCount > 0)
                        ? 'Không có tài liệu khớp bộ lọc'
                        : 'Chưa có tài liệu nào — nhấn "Thêm tài liệu" để bắt đầu'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : pageDocs.map((doc, index) => (
              editingId === doc.id ? (
                <tr key={doc.id}>
                  <td /><td /><td />
                  <td colSpan={7} className={s.docEditTd}>
                    <EditLinkForm
                      doc={doc}
                      onSave={(data) => handleEdit(doc, data)}
                      onCancel={() => setEditingId(null)}
                      saving={editSaving}
                      catOptions={catOptions}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={doc.id} {...reorder.rowProps(doc.id)} className={`${s.docTableRow} ${reorder.dragOverId === doc.id ? s.dataTableRowDragOver : ''}`}>
                  <DragRowCell enabled={canReorder} handleProps={reorder.handleProps(doc.id)} />
                  <SelectionRowCell checked={selection.selectedIds.has(doc.id)} onToggle={() => selection.toggle(doc.id)} />
                  <IndexRowCell index={(safePage - 1) * pageSize + index + 1} />

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
                      {catLabel(doc.category)}
                    </span>
                  </td>

                  {/* Kỳ */}
                  <td className={s.docTablePeriod}>
                    {doc.period || <span className={s.docMutedDash}>—</span>}
                  </td>

                  {/* Đường dẫn */}
                  <td>
                    {doc.file ? (
                      <button
                        className={s.docUrlLink}
                        title={attApi.canPreview(doc.file.mimeType) ? `Xem trước ${doc.file.fileName}` : `Tải xuống ${doc.file.fileName}`}
                        onClick={() => attApi.canPreview(doc.file.mimeType)
                          ? setPreviewDoc(doc)
                          : attApi.downloadFile(doc.file.id, doc.file.fileName)}
                      >
                        <FileText size={11} className={s.docUrlIcon} />
                        <span className={s.docUrlText}>{doc.file.fileName}</span>
                        <span className={s.docFileSize}>{attApi.formatSize(doc.file.sizeBytes)}</span>
                      </button>
                    ) : (
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
                    )}
                  </td>

                  {/* Ngày thêm */}
                  <td className={s.docTableDate}>{fmtDate(doc.createdAt)}</td>

                  {/* Người thêm */}
                  <td className={s.docTableBy}>{doc.addedByName || '—'}</td>

                  {/* Thao tác */}
                  <td>
                    <div className={s.docActions}>
                      {doc.file && attApi.canPreview(doc.file.mimeType) && (
                        <button
                          className={s.docActionBtn}
                          title="Xem trước"
                          onClick={() => setPreviewDoc(doc)}
                        >
                          <Eye size={13} />
                        </button>
                      )}
                      {doc.file ? (
                        <button
                          className={s.docActionBtn}
                          title="Tải xuống"
                          onClick={() => attApi.downloadFile(doc.file.id, doc.file.fileName)}
                        >
                          <Download size={13} />
                        </button>
                      ) : (
                        <button
                          className={s.docActionBtn}
                          title="Mở link"
                          onClick={() => window.open(doc.url, '_blank', 'noopener,noreferrer')}
                        >
                          <ExternalLink size={13} />
                        </button>
                      )}
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


      {/* ── Add link modal ── */}
      {showAddModal && (
        <AddLinkModal
          onSave={handleAdd}
          onClose={() => setShowAddModal(false)}
          saving={saving}
          catOptions={catOptions}
        />
      )}

      {/* ── Preview modal (PDF/ảnh) ── */}
      {previewDoc && (
        <PreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      )}

      {/* ── Header-filter dropdown (docs/018) ── */}
      {filterPopup && (
        <ColumnFilterDropdown
          colKey={filterPopup.colKey}
          filterType={docColType(filterPopup.colKey)}
          allRows={docs}
          getDisplayLabel={docColLabel}
          currentFilter={colFilters[filterPopup.colKey] ?? null}
          sortState={sortState}
          onSort={handleColSort}
          onFilterChange={handleColFilterChange}
          onClose={() => setFilterPopup(null)}
          style={{ '--cfd-top': `${filterPopup.top}px`, '--cfd-left': `${filterPopup.left}px` }}
        />
      )}

      {/* ── Delete confirm overlay ── */}
      <DeleteConfirmDialog
        open={Boolean(deleteTarget)}
        title="Xóa tài liệu"
        message={deleteTarget ? <>Bạn có chắc chắn muốn xóa tài liệu <strong>“{deleteTarget.name}”</strong>?</> : null}
        loading={deleting}
        onCancel={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  )
}
