import { useState, useEffect, useRef } from 'react'
import {
  Link2, Plus, Search, Pencil, Trash2, ExternalLink,
  FolderOpen, Loader2, X, Check, FolderPlus,
} from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as api from '../../api/internalDocLinks'
import InternalNavTabs from './InternalNavTabs'
import s from './InternalDocLinks.module.css'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (diff < 60)   return 'vừa xong'
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`
  return `${Math.floor(diff / 86400)} ngày trước`
}

const COLOR_PALETTE = [
  '#6366f1', '#3b82f6', '#10b981', '#f59e0b',
  '#ef4444', '#8b5cf6', '#14b8a6', '#f97316',
  '#ec4899', '#64748b',
]

// ── CategoryModal ─────────────────────────────────────────────────────────────

function CategoryModal({ initial, onClose, onSave }) {
  const [name,    setName]  = useState(initial?.name  ?? '')
  const [color,   setColor] = useState(initial?.color ?? '#6366f1')
  const [saving,  setSaving] = useState(false)
  const [err,     setErr]   = useState('')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function handleSave() {
    if (!name.trim()) { setErr('Tên không được để trống'); return }
    setSaving(true)
    try {
      await onSave({ name: name.trim(), color })
      onClose()
    } catch (e) {
      setErr(e?.response?.data?.error?.message ?? 'Không thể lưu')
    } finally { setSaving(false) }
  }

  return (
    <div className={s.overlay}>
      <div className={s.modal}>
        <div className={s.modalHeader}>
          <span className={s.modalTitle}>{initial ? 'Sửa danh mục' : 'Thêm danh mục'}</span>
          <button className={s.modalClose} onClick={onClose}><X size={14} /></button>
        </div>
        <div className={s.modalBody}>
          <div className={s.formGroup}>
            <label className={s.formLabel}>Tên danh mục *</label>
            <input
              ref={inputRef}
              className={`${s.formInput} ${err ? s.formInputErr : ''}`}
              value={name}
              onChange={(e) => { setName(e.target.value); setErr('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
              placeholder="VD: Biểu mẫu thuế"
            />
            {err && <span className={s.formErr}>{err}</span>}
          </div>
          <div className={s.formGroup}>
            <label className={s.formLabel}>Màu</label>
            <div className={s.colorPalette}>
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`${s.colorSwatch} ${color === c ? s.colorSwatchActive : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                >
                  {color === c && <Check size={10} color="#fff" />}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className={s.modalFooter}>
          <button className={s.btnSecondary} onClick={onClose} disabled={saving}>Hủy</button>
          <button className={s.btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 size={13} className={s.spin} /> Đang lưu...</> : <><Check size={13} /> Lưu</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── LinkModal ─────────────────────────────────────────────────────────────────

function LinkModal({ initial, categories, onClose, onSave }) {
  const [form,   setForm]   = useState({
    title:       initial?.title       ?? '',
    url:         initial?.url         ?? '',
    description: initial?.description ?? '',
    categoryId:  initial?.category?.id ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [errs,   setErrs]   = useState({})
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  function set(field, val) { setForm((p) => ({ ...p, [field]: val })); setErrs((p) => ({ ...p, [field]: '' })) }

  async function handleSave() {
    const e = {}
    if (!form.title.trim()) e.title = 'Tiêu đề không được để trống'
    if (!form.url.trim())   e.url   = 'URL không được để trống'
    else {
      try { new URL(form.url) } catch { e.url = 'URL không hợp lệ' }
    }
    if (Object.keys(e).length) { setErrs(e); return }

    setSaving(true)
    try {
      await onSave({
        title:       form.title.trim(),
        url:         form.url.trim(),
        description: form.description.trim() || null,
        categoryId:  form.categoryId || null,
      })
      onClose()
    } catch (err) {
      setErrs({ global: err?.response?.data?.error?.message ?? 'Không thể lưu' })
    } finally { setSaving(false) }
  }

  return (
    <div className={s.overlay}>
      <div className={s.modal}>
        <div className={s.modalHeader}>
          <span className={s.modalTitle}>{initial ? 'Sửa tài liệu' : 'Thêm tài liệu'}</span>
          <button className={s.modalClose} onClick={onClose}><X size={14} /></button>
        </div>
        <div className={s.modalBody}>
          {errs.global && <div className={s.globalErr}>{errs.global}</div>}

          <div className={s.formGroup}>
            <label className={s.formLabel}>Tiêu đề *</label>
            <input
              ref={inputRef}
              className={`${s.formInput} ${errs.title ? s.formInputErr : ''}`}
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Tên tài liệu"
            />
            {errs.title && <span className={s.formErr}>{errs.title}</span>}
          </div>

          <div className={s.formGroup}>
            <label className={s.formLabel}>URL *</label>
            <input
              className={`${s.formInput} ${errs.url ? s.formInputErr : ''}`}
              value={form.url}
              onChange={(e) => set('url', e.target.value)}
              placeholder="https://..."
            />
            {errs.url && <span className={s.formErr}>{errs.url}</span>}
          </div>

          <div className={s.formGroup}>
            <label className={s.formLabel}>Danh mục</label>
            <select
              className={s.formSelect}
              value={form.categoryId}
              onChange={(e) => set('categoryId', e.target.value)}
            >
              <option value="">Không có danh mục</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className={s.formGroup}>
            <label className={s.formLabel}>Mô tả</label>
            <textarea
              className={s.formTextarea}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Mô tả ngắn về tài liệu này..."
              rows={3}
            />
          </div>
        </div>
        <div className={s.modalFooter}>
          <button className={s.btnSecondary} onClick={onClose} disabled={saving}>Hủy</button>
          <button className={s.btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 size={13} className={s.spin} /> Đang lưu...</> : <><Check size={13} /> Lưu</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── LinkCard ──────────────────────────────────────────────────────────────────

function LinkCard({ link, canEdit, onEdit, onDelete }) {
  const domain = getDomain(link.url)
  return (
    <div className={s.card}>
      <div className={s.cardMain}>
        <div className={s.cardInfo}>
          <div className={s.cardTitleRow}>
            <Link2 size={13} className={s.cardLinkIcon} />
            <span className={s.cardTitle}>{link.title}</span>
          </div>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className={s.cardUrl}
            onClick={(e) => e.stopPropagation()}
          >
            {domain || link.url}
            <ExternalLink size={11} />
          </a>
          {link.description && (
            <p className={s.cardDesc}>{link.description}</p>
          )}
          <div className={s.cardMeta}>
            {link.category && (
              <span className={s.categoryBadge} style={{ background: link.category.color + '22', color: link.category.color }}>
                {link.category.name}
              </span>
            )}
            <span className={s.cardMetaText}>{link.createdBy?.name} · {timeAgo(link.createdAt)}</span>
          </div>
        </div>
        <div className={s.cardActions}>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className={s.btnOpen}
            title="Mở tài liệu"
          >
            <ExternalLink size={12} /> Mở
          </a>
          {canEdit && (
            <>
              <button className={s.btnIcon} onClick={() => onEdit(link)} title="Sửa">
                <Pencil size={12} />
              </button>
              <button className={s.btnIconDanger} onClick={() => onDelete(link)} title="Xóa">
                <Trash2 size={12} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── DeleteConfirm ─────────────────────────────────────────────────────────────

function DeleteConfirm({ label, onClose, onConfirm, deleting }) {
  return (
    <div className={s.overlay}>
      <div className={`${s.modal} ${s.modalSm}`}>
        <div className={s.modalHeader}>
          <span className={s.modalTitle}>Xác nhận xóa</span>
          <button className={s.modalClose} onClick={onClose}><X size={14} /></button>
        </div>
        <div className={s.modalBody}>
          <p className={s.confirmText}>Bạn có chắc chắn muốn xóa <strong>&ldquo;{label}&rdquo;</strong>? Không thể hoàn tác.</p>
        </div>
        <div className={s.modalFooter}>
          <button className={s.btnSecondary} onClick={onClose} disabled={deleting}>Hủy</button>
          <button className={s.btnDanger} onClick={onConfirm} disabled={deleting}>
            {deleting ? <><Loader2 size={13} className={s.spin} /> Đang xóa...</> : <><Trash2 size={13} /> Xóa</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

export default function InternalDocLinks() {
  const currentUser = useAuthStore((st) => st.user)
  const addToast    = useToastStore((st) => st.toast)
  const isAdmin     = currentUser?.role === 'admin'

  const [categories,     setCategories]     = useState([])
  const [links,          setLinks]          = useState([])
  const [pagination,     setPagination]     = useState({ page: 1, totalPages: 1, total: 0 })
  const [loading,        setLoading]        = useState(true)
  const [search,         setSearch]         = useState('')
  const [searchInput,    setSearchInput]    = useState('')
  const [activeCategory, setActiveCategory] = useState('')
  const [page,           setPage]           = useState(1)

  // Modals
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [editLink,      setEditLink]      = useState(null)
  const [showCatModal,  setShowCatModal]  = useState(false)
  const [editCategory,  setEditCategory]  = useState(null)
  const [deleteTarget,  setDeleteTarget]  = useState(null)
  const [deleting,      setDeleting]      = useState(false)
  const [refreshKey,    setRefreshKey]    = useState(0)

  // Reset page on filter/search change
  useEffect(() => { setPage(1) }, [activeCategory, search])

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // Load categories (independent of pagination)
  useEffect(() => {
    let cancelled = false
    api.listCategories()
      .then((cats) => { if (!cancelled) setCategories(cats) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [refreshKey])

  // Load links with pagination
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const params = { page, limit: PAGE_SIZE }
    if (activeCategory) params.categoryId = activeCategory
    if (search)         params.search     = search
    api.listLinks(params)
      .then((result) => {
        if (cancelled) return
        setLinks(result.items ?? [])
        setPagination(result.pagination ?? { page: 1, totalPages: 1, total: 0 })
      })
      .catch(() => { if (!cancelled) { setLinks([]); setPagination({ page: 1, totalPages: 1, total: 0 }) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [activeCategory, search, page, refreshKey])

  function refresh() { setRefreshKey((k) => k + 1) }

  // ── Category actions ──────────────────────────────────────────────────────

  async function handleSaveCategory(body) {
    if (editCategory) {
      await api.updateCategory(editCategory.id, body)
      addToast('Đã cập nhật danh mục', 'success')
    } else {
      await api.createCategory(body)
      addToast('Đã thêm danh mục', 'success')
    }
    refresh()
  }

  async function handleDeleteCategory() {
    setDeleting(true)
    try {
      await api.deleteCategory(deleteTarget.item.id)
      addToast('Đã xóa danh mục', 'success')
      if (activeCategory === deleteTarget.item.id) setActiveCategory('')
      setDeleteTarget(null)
      refresh()
    } catch (err) {
      addToast(err?.response?.data?.error?.message ?? 'Không thể xóa', 'error')
    } finally { setDeleting(false) }
  }

  // ── Link actions ──────────────────────────────────────────────────────────

  async function handleSaveLink(body) {
    if (editLink) {
      await api.updateLink(editLink.id, body)
      addToast('Đã cập nhật tài liệu', 'success')
    } else {
      await api.createLink(body)
      addToast('Đã thêm tài liệu', 'success')
    }
    refresh()
  }

  async function handleDeleteLink() {
    setDeleting(true)
    try {
      await api.deleteLink(deleteTarget.item.id)
      addToast('Đã xóa tài liệu', 'success')
      setDeleteTarget(null)
      refresh()
    } catch (err) {
      addToast(err?.response?.data?.error?.message ?? 'Không thể xóa', 'error')
    } finally { setDeleting(false) }
  }

  // Pagination window helper
  function pageWindow() {
    const total = pagination.totalPages ?? 1
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
    if (page <= 4)         return [1, 2, 3, 4, 5, '…', total]
    if (page >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total]
    return [1, '…', page - 1, page, page + 1, '…', total]
  }

  const from = pagination.total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const to   = Math.min(page * PAGE_SIZE, pagination.total)

  return (
    <AppLayout>
      <div className={s.page}>

        {/* ── Title + tabs ── */}
        <div className={s.topSection}>
          <h1 className={s.pageTitle}>Công việc nội bộ</h1>
          <InternalNavTabs />
        </div>

        {/* ── Search + add ── */}
        <div className={s.toolbar}>
          <div className={s.searchWrap}>
            <Search size={13} className={s.searchIcon} />
            <input
              type="text"
              className={s.searchInput}
              placeholder="Tìm kiếm tài liệu..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            {searchInput && (
              <button className={s.searchClear} onClick={() => setSearchInput('')}><X size={12} /></button>
            )}
          </div>
          <button className={s.btnPrimary} onClick={() => { setEditLink(null); setShowLinkModal(true) }}>
            <Plus size={14} /> Thêm tài liệu
          </button>
        </div>

        {/* ── Body: sidebar + content ── */}
        <div className={s.body}>

          {/* ── Category sidebar ── */}
          <div className={s.sidebar}>
            <div className={s.sidebarHead}>
              <span className={s.sidebarTitle}>Danh mục</span>
              {isAdmin && (
                <button className={s.btnAddCat} onClick={() => { setEditCategory(null); setShowCatModal(true) }} title="Thêm danh mục">
                  <FolderPlus size={13} />
                </button>
              )}
            </div>

            <button
              className={`${s.catItem} ${activeCategory === '' ? s.catItemActive : ''}`}
              onClick={() => setActiveCategory('')}
            >
              <FolderOpen size={13} />
              <span className={s.catName}>Tất cả</span>
              <span className={s.catCount}>{activeCategory === '' ? pagination.total : categories.reduce((s, c) => s + c.linkCount, 0)}</span>
            </button>

            {categories.map((cat) => (
              <div key={cat.id} className={s.catRow}>
                <button
                  className={`${s.catItem} ${activeCategory === cat.id ? s.catItemActive : ''}`}
                  onClick={() => setActiveCategory(cat.id)}
                >
                  <span className={s.catDot} style={{ background: cat.color }} />
                  <span className={s.catName}>{cat.name}</span>
                  <span className={s.catCount}>{cat.linkCount}</span>
                </button>
                {isAdmin && (
                  <div className={s.catActions}>
                    <button className={s.catActionBtn} onClick={() => { setEditCategory(cat); setShowCatModal(true) }}>
                      <Pencil size={11} />
                    </button>
                    <button className={s.catActionBtn} onClick={() => setDeleteTarget({ type: 'category', item: cat })}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                )}
              </div>
            ))}

            {categories.length === 0 && (
              <p className={s.catEmpty}>Chưa có danh mục</p>
            )}
          </div>

          {/* ── Links area ── */}
          <div className={s.linksArea}>
            {/* summary row */}
            {!loading && pagination.total > 0 && (
              <div className={s.paginationInfo}>
                {from}–{to} / {pagination.total} tài liệu
              </div>
            )}

            {loading ? (
              <div className={s.loadingBox}>
                <Loader2 size={22} className={s.spin} />
                <span>Đang tải...</span>
              </div>
            ) : links.length === 0 ? (
              <div className={s.emptyBox}>
                <Link2 size={32} className={s.emptyIcon} />
                <p className={s.emptyTitle}>Chưa có tài liệu nào</p>
                <p className={s.emptyText}>
                  {search ? 'Thử tìm với từ khoá khác' : 'Nhấn "Thêm tài liệu" để lưu link đầu tiên'}
                </p>
              </div>
            ) : (
              <div className={s.cardList}>
                {links.map((link) => (
                  <LinkCard
                    key={link.id}
                    link={link}
                    canEdit={isAdmin || link.createdBy?.id === currentUser?.id}
                    onEdit={(l) => { setEditLink(l); setShowLinkModal(true) }}
                    onDelete={(l) => setDeleteTarget({ type: 'link', item: l })}
                  />
                ))}
              </div>
            )}

            {/* Pagination */}
            {!loading && pagination.totalPages > 1 && (
              <div className={s.pagination}>
                <button className={s.pageBtn} onClick={() => setPage(1)} disabled={page === 1}>«</button>
                <button className={s.pageBtn} onClick={() => setPage(page - 1)} disabled={page === 1}>‹</button>
                {pageWindow().map((n, i) =>
                  n === '…' ? (
                    <span key={`e${i}`} className={s.paginationGap}>…</span>
                  ) : (
                    <button
                      key={n}
                      className={`${s.pageBtn} ${page === n ? s.pageBtnActive : ''}`}
                      onClick={() => setPage(n)}
                    >
                      {n}
                    </button>
                  )
                )}
                <button className={s.pageBtn} onClick={() => setPage(page + 1)} disabled={page === pagination.totalPages}>›</button>
                <button className={s.pageBtn} onClick={() => setPage(pagination.totalPages)} disabled={page === pagination.totalPages}>»</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {showCatModal && (
        <CategoryModal
          initial={editCategory}
          onClose={() => setShowCatModal(false)}
          onSave={handleSaveCategory}
        />
      )}

      {showLinkModal && (
        <LinkModal
          initial={editLink}
          categories={categories}
          onClose={() => setShowLinkModal(false)}
          onSave={handleSaveLink}
        />
      )}

      {deleteTarget && (
        <DeleteConfirm
          label={deleteTarget.item.title ?? deleteTarget.item.name}
          deleting={deleting}
          onClose={() => !deleting && setDeleteTarget(null)}
          onConfirm={deleteTarget.type === 'link' ? handleDeleteLink : handleDeleteCategory}
        />
      )}
    </AppLayout>
  )
}
