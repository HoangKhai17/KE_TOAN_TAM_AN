import { useState, useEffect, useMemo, useRef } from 'react'
import ReactQuill from 'react-quill-new'
import 'react-quill-new/dist/quill.snow.css'
import DOMPurify from 'dompurify'
import {
  StickyNote, Plus, Pencil, Trash2, Pin, PinOff,
  Loader2, Check, X,
} from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { useDeleteConfirm } from '../../components/ui/DeleteConfirmDialog'
import {
  DragHeaderCell, DragRowCell, IndexHeaderCell, IndexRowCell,
  SelectionHeaderCell, SelectionRowCell, useRowReorder, useRowSelection,
} from '../../components/ui/data-table'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as companiesApi from '../../api/companies'
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

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(' ')
  return (parts[0][0] + (parts[parts.length - 1][0] || '')).toUpperCase()
}

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

function NoteTableRow({ note, index, selection, reorder, currentUserId, isAdmin, onEdit, onDelete, onTogglePin }) {
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
      <DragRowCell enabled handleProps={reorder.handleProps(note.id)} />
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
          <div className={s.noteAvatar}>{getInitials(note.authorName)}</div>
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
  const selectableNotes = useMemo(
    () => notes.filter((note) => isAdmin || note.createdBy === currentUser?.id),
    [currentUser?.id, isAdmin, notes],
  )
  const selection = useRowSelection({ rows: selectableNotes })
  const reorder = useRowReorder({
    rows: notes, setRows: setNotes,
    onError: () => addToast('Không thể lưu thứ tự ghi chú', 'error'),
    onPersist: (ordered, previous) => Promise.all(ordered
      .map((note, index) => ({ note, index }))
      .filter(({ note, index }) => previous[index]?.id !== note.id)
      .map(({ note, index }) => companiesApi.updateNote(companyId, note.id, { sortOrder: index }))),
  })

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

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {selection.selectedCount > 0 && <button className={`${s.btnDanger} ${s.dataTableBulkDelete}`} onClick={handleBulkDelete}><Trash2 size={13} /> Xoá {selection.selectedCount} dòng</button>}
          <button
            className={s.btnNavy}
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
                <th>Ghim</th>
                <th>Nội dung ghi chú</th>
                <th>Người ghi</th>
                <th>Cập nhật</th>
                <th className={s.noteActionsCell}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((note, index) => (
                <NoteTableRow
                  key={note.id}
                  note={note}
                  index={index}
                  selection={selection}
                  reorder={reorder}
                  currentUserId={currentUser?.id}
                  isAdmin={isAdmin}
                  onEdit={setEditTarget}
                  onDelete={handleDelete}
                  onTogglePin={handleTogglePin}
                />
              ))}
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
    </div>
  )
}
