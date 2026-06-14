import { useState, useEffect, useRef } from 'react'
import ReactQuill from 'react-quill-new'
import 'react-quill-new/dist/quill.snow.css'
import {
  StickyNote, Plus, Pencil, Trash2, Pin, PinOff,
  Loader2, Check, X,
} from 'lucide-react'
import Modal from '../../components/ui/Modal'
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

const CLAMP_PX = 130

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

function NoteCard({ note, currentUserId, isAdmin, onEdit, onDelete, onTogglePin }) {
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
  const displayHtml = isHtml
    ? note.content
    : `<p>${note.content.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`

  return (
    <div className={`${s.noteCard} ${note.isPinned ? s.noteCardPinned : ''}`}>
      {note.isPinned && (
        <div className={s.notePinnedBadge}>
          <Pin size={10} /> Ghim
        </div>
      )}

      <div className={s.noteCardBody}>
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
      </div>

      <div className={s.noteCardFooter}>
        <div className={s.noteAuthorRow}>
          <div className={s.noteAvatar}>{getInitials(note.authorName)}</div>
          <span className={s.noteAuthorName}>{note.authorName}</span>
          <span className={s.noteTime}>
            {fmtDateTime(note.updatedAt !== note.createdAt ? note.updatedAt : note.createdAt)}
          </span>
          {note.updatedAt !== note.createdAt && <span className={s.noteEdited}>(đã sửa)</span>}
        </div>

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
      </div>
    </div>
  )
}

// ── Main NotesTab ──────────────────────────────────────────────────────────────

export default function NotesTab({ company, onNoteCountChange }) {
  const companyId   = company.id
  const currentUser = useAuthStore((st) => st.user)
  const isAdmin     = currentUser?.role === 'admin'
  const addToast    = useToastStore((st) => st.toast)

  const [notes,       setNotes]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showAdd,     setShowAdd]     = useState(false)
  const [editTarget,  setEditTarget]  = useState(null)  // note object being edited

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
      setNotes((prev) => [note, ...prev])
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
        <button
          className={s.btnNavy}
          style={{ height: 32, fontSize: 'var(--fs-md)', padding: '0 14px' }}
          onClick={() => setShowAdd(true)}
        >
          <Plus size={13} /> Thêm ghi chú
        </button>
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
            Nhấn "Thêm ghi chú" để tạo ghi chú đầu tiên.
          </p>
        </div>
      ) : (
        <div className={s.noteList}>
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              currentUserId={currentUser?.id}
              isAdmin={isAdmin}
              onEdit={setEditTarget}
              onDelete={handleDelete}
              onTogglePin={handleTogglePin}
            />
          ))}
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
