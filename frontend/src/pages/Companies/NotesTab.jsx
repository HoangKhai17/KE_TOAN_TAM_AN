import { useState, useEffect, useMemo, useRef } from 'react'
import ReactQuill from 'react-quill-new'
import 'react-quill-new/dist/quill.snow.css'
import DOMPurify from 'dompurify'
import {
  StickyNote, Plus, Pencil, Trash2, Pin, PinOff,
  Loader2, Check, X, Filter, Search, RotateCcw,
} from 'lucide-react'
import Modal from '../../components/ui/Modal'
import ColumnFilterDropdown from '../../components/ui/ColumnFilterDropdown'
import PeriodPicker from '../Tasks/PeriodPicker'
import { resolvePeriodRange } from '../Tasks/taskUtils'
import { useDeleteConfirm } from '../../components/ui/DeleteConfirmDialog'
import {
  DragHeaderCell, DragRowCell, IndexHeaderCell, IndexRowCell,
  SelectionHeaderCell, SelectionRowCell, useRowReorder, useRowSelection,
} from '../../components/ui/data-table'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as companiesApi from '../../api/companies'
import { useCompanyFooter } from './companyFooter'
import s from './companies.module.css'

// ── Quill config ───────────────────────────────────────────────────────────────

const QUILL_MODULES = {
  toolbar: [
    [{ header: [1, 2, false] }],
    ['bold', 'italic', 'underline'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link', 'clean'],
  ],
}
const QUILL_FORMATS = ['header', 'bold', 'italic', 'underline', 'list', 'bullet', 'link']

const CLAMP_PX = 58

function isHtmlEmpty(html) {
  if (!html) return true
  return !html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Header-column filter machinery (đồng bộ với các bảng khác) ───────────────────
// Bỏ HTML để lọc/sắp xếp theo nội dung dạng chữ thuần.
function stripHtml(str) {
  if (!str) return ''
  return DOMPurify.sanitize(String(str), { ALLOWED_TAGS: [] }).replace(/\s+/g, ' ').trim()
}
function noteColFilterType(colKey) {
  if (colKey === 'isPinned' || colKey === 'authorName') return 'enum'
  if (colKey === 'updatedAt') return 'dateRange'
  return 'text' // content
}
// Ngày dùng để lọc/sắp xếp cột "Cập nhật" (ưu tiên ngày sửa, chưa sửa thì ngày tạo).
function noteColRawDate(note) { return note.updatedAt || note.createdAt }
function noteColDisplayLabel(note, colKey) {
  if (colKey === 'isPinned')   return note.isPinned ? 'Ghim' : '—'
  if (colKey === 'authorName') return note.authorName || '(Không rõ)'
  if (colKey === 'updatedAt')  return fmtDateTime(noteColRawDate(note))
  return stripHtml(note.content) // content
}
function noteColSortKey(note, colKey) {
  if (colKey === 'updatedAt') return noteColRawDate(note) || ''  // ISO → so sánh chuỗi đúng thứ tự thời gian
  if (colKey === 'isPinned')  return note.isPinned ? 1 : 0
  return noteColDisplayLabel(note, colKey).toLowerCase()
}

const CUR_YEAR  = String(new Date().getFullYear())
const CUR_MONTH = String(new Date().getMonth() + 1)

// ── NoteEditorModal ────────────────────────────────────────────────────────────

function NoteEditorModal({ initialNote, onSave, onClose }) {
  const isEdit = !!initialNote
  const [html, setHtml]     = useState(initialNote?.content ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (isHtmlEmpty(html)) return
    setSaving(true)
    try {
      await onSave(html)
    } catch {
      // error already toasted by caller
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={isEdit ? 'Chỉnh sửa ghi chú' : 'Thêm ghi chú nội bộ'}
      onClose={onClose}
      wide
    >
      <div className={s.noteEditorModalBody}>
        <div className={s.noteEditorWrap}>
          <ReactQuill
            value={html}
            onChange={setHtml}
            modules={QUILL_MODULES}
            formats={QUILL_FORMATS}
            placeholder="Nhập nội dung ghi chú..."
            theme="snow"
          />
        </div>
        <div className={s.noteEditorModalFooter}>
          <button className={s.btnOutline} onClick={onClose} disabled={saving}>
            Huỷ
          </button>
          <button
            className={s.btnNavy}
            onClick={handleSave}
            disabled={saving || isHtmlEmpty(html)}
          >
            {saving ? <Loader2 size={13} className={s.spin} /> : <Check size={13} />}
            {isEdit ? 'Cập nhật' : 'Lưu ghi chú'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── NoteCard ───────────────────────────────────────────────────────────────────

function NoteTableRow({ note, index, canReorder = true, selection, reorder, currentUserId, isAdmin, onEdit, onDelete, onTogglePin }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [expanded, setExpanded]           = useState(false)
  const [overflows, setOverflows]         = useState(false)
  const contentRef = useRef(null)
  const canEdit = note.createdBy === currentUserId || isAdmin

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    setOverflows(el.scrollHeight > CLAMP_PX + 4)
  }, [note.content])

  // Backward compat: old records are plain text (no HTML tags)
  const isHtml = /<[a-z][\s\S]*>/i.test(note.content)
  const rawHtml = isHtml
    ? note.content
    : `<p>${note.content.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`
  // Sanitize trước khi render — chống stored XSS (loại <script>, onerror, javascript: …)
  const displayHtml = DOMPurify.sanitize(rawHtml)

  return (
    <tr {...reorder.rowProps(note.id)} className={`${note.isPinned ? s.noteTableRowPinned : ''} ${reorder.dragOverId === note.id ? s.dataTableRowDragOver : ''}`}>
      <DragRowCell enabled={canReorder} handleProps={reorder.handleProps(note.id)} />
      {canEdit
        ? <SelectionRowCell checked={selection.selectedIds.has(note.id)} onToggle={() => selection.toggle(note.id)} />
        : <td />}
      <IndexRowCell index={index + 1} />
      <td className={s.notePinCell}>
        {note.isPinned ? <span className={s.notePinnedBadge}><Pin size={10} /> Ghim</span> : <span className={s.noteMuted}>—</span>}
      </td>
      <td className={s.noteContentCell}>
        <div
          ref={contentRef}
          className={`${s.noteHtmlContent} ${!expanded ? s.noteContentClamped : ''}`}
          dangerouslySetInnerHTML={{ __html: displayHtml }}
        />
        {(overflows || expanded) && (
          <button className={s.noteExpandBtn} onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Thu gọn ▴' : 'Xem thêm ▾'}
          </button>
        )}
      </td>
      <td>
        <div className={s.noteAuthorRow}>
          <span className={s.noteAuthorName}>{note.authorName}</span>
        </div>
      </td>
      <td className={s.noteTimeCell}>
        <span>{fmtDateTime(note.updatedAt !== note.createdAt ? note.updatedAt : note.createdAt)}</span>
        {note.updatedAt !== note.createdAt && <span className={s.noteEdited}>(đã sửa)</span>}
      </td>
      <td className={s.noteActionsCell}>
        {canEdit && (
          <div className={s.noteActions}>
            {confirmDelete ? (
              <>
                <span className={s.noteConfirmText}>Xoá?</span>
                <button
                  className={`${s.noteActionBtn} ${s.noteActionBtnDanger}`}
                  onClick={() => onDelete(note.id)}
                  title="Xác nhận xoá"
                >
                  <Check size={11} />
                </button>
                <button className={s.noteActionBtn} onClick={() => setConfirmDelete(false)} title="Huỷ">
                  <X size={11} />
                </button>
              </>
            ) : (
              <>
                <button
                  className={`${s.noteActionBtn} ${s.noteActionBtnPin}`}
                  onClick={() => onTogglePin(note.id, !note.isPinned)}
                  title={note.isPinned ? 'Bỏ ghim' : 'Ghim ghi chú'}
                >
                  {note.isPinned ? <PinOff size={12} /> : <Pin size={12} />}
                </button>
                <button
                  className={`${s.noteActionBtn} ${s.noteActionBtnEdit}`}
                  onClick={() => onEdit(note)}
                  title="Chỉnh sửa"
                >
                  <Pencil size={12} />
                </button>
                <button
                  className={`${s.noteActionBtn} ${s.noteActionBtnDanger}`}
                  onClick={() => setConfirmDelete(true)}
                  title="Xoá"
                >
                  <Trash2 size={12} />
                </button>
              </>
            )}
          </div>
        )}
      </td>
    </tr>
  )
}

// ── Main NotesTab ──────────────────────────────────────────────────────────────

export default function NotesTab({ company, onNoteCountChange }) {
  const confirmDelete = useDeleteConfirm()
  const companyId   = company.id
  const currentUser = useAuthStore((st) => st.user)
  const isAdmin     = currentUser?.role === 'admin'
  const addToast    = useToastStore((st) => st.toast)

  const [notes,       setNotes]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showAdd,     setShowAdd]     = useState(false)
  const [editTarget,  setEditTarget]  = useState(null)  // note object being edited
  const [page, setPage]     = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // Lọc/sắp xếp theo header cột (đồng bộ với các bảng khác)
  const [colFilters, setColFilters]     = useState({})
  const [sortColState, setSortColState] = useState({ col: null, dir: 'asc' })
  const [filterPopup, setFilterPopup]   = useState(null)   // { colKey, top, left }

  // Thanh lọc phía trên: Kỳ (theo ngày Cập nhật) + Người ghi + Từ khoá.
  // Mặc định "Tất cả thời gian" (year/month/from/to đều rỗng) để KHÔNG ẩn ghi chú cũ.
  const [pYear, setPYear]   = useState('')
  const [pMonth, setPMonth] = useState('')
  const [pFrom, setPFrom]   = useState('')
  const [pTo, setPTo]       = useState('')
  const [authorFilter, setAuthorFilter] = useState('')
  const [searchInput, setSearchInput]   = useState('')

  // Năm/tác giả có thật trong dữ liệu (để đổ vào bộ chọn)
  const availableYears = useMemo(() => {
    const set = new Set()
    for (const n of notes) { const d = noteColRawDate(n); if (d) set.add(new Date(d).getFullYear()) }
    const arr = [...set].sort((a, b) => b - a)
    return arr.length ? arr : [new Date().getFullYear()]
  }, [notes])
  const authorOptions = useMemo(() => {
    const set = new Set()
    for (const n of notes) if (n.authorName) set.add(n.authorName)
    return [...set].sort((a, b) => a.localeCompare(b, 'vi'))
  }, [notes])

  // Handlers Kỳ (đồng bộ PeriodPicker): chọn năm/tháng thì xoá khoảng tuỳ chọn và ngược lại.
  function setPeriod(y, m) { setPYear(y); setPMonth(m); setPFrom(''); setPTo(''); setPage(1) }
  function onPeriodYear(y)  { setPeriod(y, y ? pMonth : '') }
  function onPeriodMonth(m) { if (pYear) setPeriod(pYear, m) }
  function onPeriodPreset(key) {
    if (key === 'tm') return setPeriod(CUR_YEAR, CUR_MONTH)
    if (key === 'ty') return setPeriod(CUR_YEAR, '')
    if (key === 'lm') { let y = +CUR_YEAR, m = +CUR_MONTH - 1; if (m < 1) { m = 12; y -= 1 }; return setPeriod(String(y), String(m)) }
    setPYear(''); setPMonth(''); setPFrom(''); setPTo(''); setPage(1) // 'all'
  }
  function onPeriodFrom(v) { setPFrom(v); setPYear(''); setPMonth(''); setPage(1) }
  function onPeriodTo(v)   { setPTo(v);   setPYear(''); setPMonth(''); setPage(1) }

  const selectableNotes = useMemo(
    () => notes.filter((note) => isAdmin || note.createdBy === currentUser?.id),
    [currentUser?.id, isAdmin, notes],
  )
  const selection = useRowSelection({ rows: selectableNotes })

  // ── Áp lọc + sắp xếp phía client rồi mới phân trang ─────────────────────────────
  const hasAnyColFilter = Object.entries(colFilters).some(([k, v]) => {
    const t = noteColFilterType(k)
    if (t === 'enum')      return v instanceof Set && v.size > 0
    if (t === 'dateRange') return v && (v.from || v.to)
    return typeof v === 'string' && v.trim().length > 0
  })
  // Kỳ (thanh lọc trên) → khoảng ngày áp lên "Cập nhật"
  const periodRange = resolvePeriodRange({ year: pYear, month: pMonth, from: pFrom, to: pTo })
  const topFilterActive = Boolean(searchInput.trim() || authorFilter || periodRange.from || periodRange.to)

  const displayed = useMemo(() => {
    let result = [...notes]
    // Thanh lọc trên: Từ khoá (nội dung) + Người ghi + Kỳ (ngày Cập nhật)
    if (searchInput.trim()) {
      const q = searchInput.toLowerCase()
      result = result.filter((r) => stripHtml(r.content).toLowerCase().includes(q))
    }
    if (authorFilter) result = result.filter((r) => (r.authorName || '') === authorFilter)
    if (periodRange.from || periodRange.to) {
      result = result.filter((r) => {
        const raw = noteColRawDate(r); if (!raw) return false
        const d = String(raw).substring(0, 10)
        if (periodRange.from && d < periodRange.from) return false
        if (periodRange.to   && d > periodRange.to)   return false
        return true
      })
    }
    for (const [colKey, fv] of Object.entries(colFilters)) {
      const ft = noteColFilterType(colKey)
      if (ft === 'enum') {
        if (fv instanceof Set && fv.size > 0) result = result.filter((r) => fv.has(noteColDisplayLabel(r, colKey)))
      } else if (ft === 'text') {
        if (typeof fv === 'string' && fv.trim()) {
          const q = fv.toLowerCase()
          result = result.filter((r) => noteColDisplayLabel(r, colKey).toLowerCase().includes(q))
        }
      } else if (ft === 'dateRange') {
        if (fv && (fv.from || fv.to)) {
          result = result.filter((r) => {
            const raw = noteColRawDate(r); if (!raw) return false
            const d = String(raw).substring(0, 10)
            if (fv.from && d < fv.from) return false
            if (fv.to   && d > fv.to)   return false
            return true
          })
        }
      }
    }
    if (sortColState.col) {
      result.sort((a, b) => {
        const ak = noteColSortKey(a, sortColState.col)
        const bk = noteColSortKey(b, sortColState.col)
        if (typeof ak === 'number' && typeof bk === 'number') return sortColState.dir === 'asc' ? ak - bk : bk - ak
        const cmp = String(ak).localeCompare(String(bk), 'vi', { numeric: true })
        return sortColState.dir === 'asc' ? cmp : -cmp
      })
    }
    return result
  }, [notes, colFilters, sortColState, searchInput, authorFilter, periodRange.from, periodRange.to])

  // Phân trang client-side (trên tập đã lọc) → footer trang
  const notesTotal      = displayed.length
  const notesTotalPages = Math.max(1, Math.ceil(notesTotal / pageSize))
  const safePage        = Math.min(page, notesTotalPages)
  const pageNotes       = displayed.slice((safePage - 1) * pageSize, safePage * pageSize)
  useEffect(() => { setPage(1) }, [pageSize, colFilters, sortColState, searchInput, authorFilter])
  useCompanyFooter(loading ? null : {
    total: notesTotal, from: notesTotal === 0 ? 0 : (safePage - 1) * pageSize + 1, to: Math.min(safePage * pageSize, notesTotal),
    page: safePage, pageSize, totalPages: notesTotalPages, itemLabel: 'ghi chú',
    onPageChange: setPage, onPageSizeChange: setPageSize,
  })

  // Kéo thả sắp xếp: chỉ khi 1 trang VÀ không đang lọc/sắp xếp (tránh hỏng thứ tự)
  const canReorder = notesTotalPages === 1 && !hasAnyColFilter && !sortColState.col && !topFilterActive
  const reorder = useRowReorder({
    rows: notes, setRows: setNotes, enabled: canReorder,
    onError: () => addToast('Không thể lưu thứ tự ghi chú', 'error'),
    onPersist: (ordered, previous) => Promise.all(ordered
      .map((note, index) => ({ note, index }))
      .filter(({ note, index }) => previous[index]?.id !== note.id)
      .map(({ note, index }) => companiesApi.updateNote(companyId, note.id, { sortOrder: index }))),
  })

  function openColFilter(colKey, e) {
    e.stopPropagation()
    if (filterPopup?.colKey === colKey) { setFilterPopup(null); return }
    const rect = e.currentTarget.getBoundingClientRect()
    setFilterPopup({ colKey, top: rect.bottom + 4, left: rect.left })
  }
  function handleColFilterChange(colKey, val) {
    setColFilters((prev) => { const n = { ...prev }; if (val == null) delete n[colKey]; else n[colKey] = val; return n })
  }
  function handleColSort(col, dir) { setSortColState({ col, dir }); setFilterPopup(null) }
  function hasColFilter(colKey) {
    const f = colFilters[colKey]; if (f == null) return false
    const t = noteColFilterType(colKey)
    if (t === 'enum')      return f instanceof Set && f.size > 0
    if (t === 'dateRange') return Boolean(f.from || f.to)
    return typeof f === 'string' && f.trim().length > 0
  }
  const anyFilterActive = topFilterActive || hasAnyColFilter || Boolean(sortColState.col)
  function resetFilters() {
    setPYear(''); setPMonth(''); setPFrom(''); setPTo('')
    setAuthorFilter(''); setSearchInput('')
    setColFilters({}); setSortColState({ col: null, dir: 'asc' })
    setFilterPopup(null); setPage(1)
  }

  useEffect(() => { onNoteCountChange?.(notes.length) }, [notes.length]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    try {
      const list = await companiesApi.getNotes(companyId)
      setNotes(list)
    } catch {
      addToast('Không thể tải ghi chú', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAdd(html) {
    try {
      const note = await companiesApi.createNote(companyId, { content: html })
      setNotes((prev) => [...prev, note])
      setShowAdd(false)
      addToast('Đã thêm ghi chú', 'success')
    } catch {
      addToast('Không thể thêm ghi chú', 'error')
      throw new Error('failed')
    }
  }

  async function handleEdit(html) {
    try {
      const updated = await companiesApi.updateNote(companyId, editTarget.id, { content: html })
      setNotes((prev) => prev.map((n) => n.id === editTarget.id ? { ...n, ...updated } : n))
      setEditTarget(null)
      addToast('Đã cập nhật ghi chú', 'success')
    } catch {
      addToast('Không thể cập nhật ghi chú', 'error')
      throw new Error('failed')
    }
  }

  async function handleDelete(noteId) {
    try {
      await companiesApi.deleteNote(companyId, noteId)
      setNotes((prev) => prev.filter((n) => n.id !== noteId))
      addToast('Đã xoá ghi chú', 'success')
    } catch {
      addToast('Không thể xoá ghi chú', 'error')
    }
  }

  async function handleBulkDelete() {
    if (!selection.selectedCount || !(await confirmDelete({ title: 'Xóa ghi chú', message: <>Bạn có chắc chắn muốn xóa <strong>{selection.selectedCount}</strong> ghi chú đã chọn?</>, confirmLabel: `Xóa ${selection.selectedCount} mục` }))) return
    const ids = [...selection.selectedIds]
    const results = await Promise.allSettled(ids.map((id) => companiesApi.deleteNote(companyId, id)))
    const deleted = new Set(ids.filter((_, index) => results[index].status === 'fulfilled'))
    setNotes((current) => current.filter((note) => !deleted.has(note.id)))
    selection.remove(deleted)
    addToast(`Đã xoá ${deleted.size}/${ids.length} ghi chú`, deleted.size ? 'success' : 'error')
  }

  async function handleTogglePin(noteId, isPinned) {
    try {
      const updated = await companiesApi.updateNote(companyId, noteId, { isPinned })
      setNotes((prev) => {
        const list = prev.map((n) => n.id === noteId ? { ...n, ...updated } : n)
        return [...list].sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0))
      })
    } catch {
      addToast('Không thể cập nhật', 'error')
    }
  }

  // Header cột có nút lọc/sắp xếp (funnel) — dùng chung style với các bảng khác
  function FilterTh({ colKey, children, className }) {
    const active = hasColFilter(colKey) || sortColState.col === colKey
    return (
      <th className={className}>
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

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StickyNote size={16} style={{ color: 'var(--color-accent)' }} />
          <h3 style={{ margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--color-text)' }}>
            Ghi chú nội bộ
          </h3>
          {!loading && notes.length > 0 && (
            <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, background: 'var(--color-accent-bg-soft)', color: 'var(--color-warning-text)', border: '1px solid var(--color-warning-border)', borderRadius: 99, padding: '1px 8px' }}>
              {notes.length}
            </span>
          )}
        </div>

        {/* Thanh lọc: Kỳ (theo ngày Cập nhật) + Người ghi + Từ khoá */}
        {!loading && notes.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <PeriodPicker
              year={pYear} month={pMonth} from={pFrom} to={pTo}
              availableYears={availableYears}
              onYear={onPeriodYear} onMonth={onPeriodMonth}
              onFrom={onPeriodFrom} onTo={onPeriodTo} onPreset={onPeriodPreset}
            />
            <select
              className={s.filterSelect}
              style={{ width: 160 }}
              value={authorFilter}
              onChange={(e) => setAuthorFilter(e.target.value)}
            >
              <option value="">Tất cả người ghi</option>
              {authorOptions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <div className={s.searchWrap} style={{ width: 200 }}>
              <Search size={12} className={s.searchIcon} />
              <input
                className={s.searchInput}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Tìm nội dung ghi chú..."
              />
            </div>
            {anyFilterActive && (
              <button
                onClick={resetFilters}
                title="Xoá tất cả bộ lọc & sắp xếp"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 32, padding: '0 10px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', color: 'var(--color-text-soft)', fontSize: 'var(--fs-2xs)', fontWeight: 600, cursor: 'pointer' }}
              >
                <RotateCcw size={11} /> Đặt lại
              </button>
            )}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {selection.selectedCount > 0 && <button className={`${s.btnDanger} ${s.dataTableBulkDelete}`} onClick={handleBulkDelete}><Trash2 size={13} /> Xoá {selection.selectedCount} dòng</button>}
          <button
            className={s.btnPrimary}
            style={{ height: 32, fontSize: 'var(--fs-2xs)', padding: '0 14px' }}
            onClick={() => setShowAdd(true)}
          >
            <Plus size={13} /> Thêm ghi chú
          </button>
        </div>
      </div>

      {/* Notes list */}
      {loading ? (
        <div className={s.loadingCenter}>
          <Loader2 size={18} className={s.spin} style={{ marginRight: 8 }} /> Đang tải...
        </div>
      ) : notes.length === 0 ? (
        <div className={s.emptyState} style={{ paddingTop: 40 }}>
          <StickyNote size={32} style={{ color: 'var(--color-warning-border)', marginBottom: 8 }} />
          <p style={{ fontSize: 'var(--fs-md)', color: 'var(--color-muted)', margin: 0 }}>Chưa có ghi chú nào.</p>
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--color-muted)', margin: '4px 0 0' }}>
            {'Nhấn "Thêm ghi chú" để tạo ghi chú đầu tiên.'}
          </p>
        </div>
      ) : (
        <div className={s.noteTableWrap}>
          <table className={s.noteTable}>
            <colgroup>
              <col className={s.dataTableColDrag} /><col className={s.dataTableColSelect} /><col className={s.dataTableColIndex} />
              <col className={s.noteColPin} />
              <col className={s.noteColContent} />
              <col className={s.noteColAuthor} />
              <col className={s.noteColUpdated} />
              <col className={s.noteColActions} />
            </colgroup>
            <thead>
              <tr>
                <DragHeaderCell />
                <SelectionHeaderCell allSelected={selection.allSelected} someSelected={selection.someSelected} onToggle={selection.toggleAll} />
                <IndexHeaderCell />
                <FilterTh colKey="isPinned">Ghim</FilterTh>
                <FilterTh colKey="content">Nội dung ghi chú</FilterTh>
                <FilterTh colKey="authorName">Người ghi</FilterTh>
                <FilterTh colKey="updatedAt">Cập nhật</FilterTh>
                <th className={s.noteActionsCell}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {pageNotes.map((note, index) => (
                <NoteTableRow
                  key={note.id}
                  note={note}
                  index={(safePage - 1) * pageSize + index}
                  canReorder={canReorder}
                  selection={selection}
                  reorder={reorder}
                  currentUserId={currentUser?.id}
                  isAdmin={isAdmin}
                  onEdit={setEditTarget}
                  onDelete={handleDelete}
                  onTogglePin={handleTogglePin}
                />
              ))}
              {pageNotes.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '24px 8px', color: 'var(--color-muted)', fontSize: 'var(--fs-sm)' }}>
                    Không có ghi chú khớp bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <NoteEditorModal
          onSave={handleAdd}
          onClose={() => setShowAdd(false)}
        />
      )}

      {/* Edit modal */}
      {editTarget && (
        <NoteEditorModal
          initialNote={editTarget}
          onSave={handleEdit}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* Header-column filter dropdown — position:fixed, ngoài vùng cuộn bảng */}
      {filterPopup && (
        <ColumnFilterDropdown
          colKey={filterPopup.colKey}
          filterType={noteColFilterType(filterPopup.colKey)}
          allRows={notes}
          getDisplayLabel={noteColDisplayLabel}
          currentFilter={colFilters[filterPopup.colKey] ?? null}
          sortState={sortColState}
          onSort={handleColSort}
          onFilterChange={handleColFilterChange}
          onClose={() => setFilterPopup(null)}
          style={{ '--cfd-top': `${filterPopup.top}px`, '--cfd-left': `${filterPopup.left}px` }}
        />
      )}
    </div>
  )
}
