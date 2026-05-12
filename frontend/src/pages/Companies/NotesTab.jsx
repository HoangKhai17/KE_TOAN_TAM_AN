import { useState, useEffect, useRef } from 'react'
import {
  StickyNote, Plus, Pencil, Trash2, Pin, PinOff,
  Loader2, Check, X,
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as companiesApi from '../../api/companies'
import s from './companies.module.css'

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

// ── NoteCard ──────────────────────────────────────────────────────────────────

function NoteCard({ note, currentUserId, isAdmin, onEdit, onDelete, onTogglePin }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const canEdit = note.createdBy === currentUserId || isAdmin

  return (
    <div className={`${s.noteCard} ${note.isPinned ? s.noteCardPinned : ''}`}>
      {note.isPinned && (
        <div className={s.notePinnedBadge}>
          <Pin size={10} /> Ghim
        </div>
      )}

      <div className={s.noteCardBody}>
        <p className={s.noteContent}>{note.content}</p>
      </div>

      <div className={s.noteCardFooter}>
        <div className={s.noteAuthorRow}>
          <div className={s.noteAvatar}>{getInitials(note.authorName)}</div>
          <span className={s.noteAuthorName}>{note.authorName}</span>
          <span className={s.noteTime}>{fmtDateTime(note.updatedAt !== note.createdAt ? note.updatedAt : note.createdAt)}</span>
          {note.updatedAt !== note.createdAt && <span className={s.noteEdited}>(đã sửa)</span>}
        </div>

        {canEdit && (
          <div className={s.noteActions}>
            {confirmDelete ? (
              <>
                <span className={s.noteConfirmText}>Xoá?</span>
                <button className={`${s.noteActionBtn} ${s.noteActionBtnDanger}`} onClick={() => onDelete(note.id)} title="Xác nhận xoá">
                  <Check size={11} />
                </button>
                <button className={s.noteActionBtn} onClick={() => setConfirmDelete(false)} title="Huỷ">
                  <X size={11} />
                </button>
              </>
            ) : (
              <>
                {isAdmin && (
                  <button
                    className={s.noteActionBtn}
                    onClick={() => onTogglePin(note.id, !note.isPinned)}
                    title={note.isPinned ? 'Bỏ ghim' : 'Ghim ghi chú'}
                  >
                    {note.isPinned ? <PinOff size={12} /> : <Pin size={12} />}
                  </button>
                )}
                <button className={s.noteActionBtn} onClick={() => onEdit(note)} title="Chỉnh sửa">
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

// ── EditForm (inline) ─────────────────────────────────────────────────────────

function EditForm({ initial, onSave, onCancel }) {
  const [text, setText]       = useState(initial.content)
  const [saving, setSaving]   = useState(false)
  const textareaRef           = useRef(null)

  useEffect(() => {
    textareaRef.current?.focus()
    textareaRef.current?.setSelectionRange(text.length, text.length)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!text.trim()) return
    setSaving(true)
    try { await onSave(initial.id, text) } finally { setSaving(false) }
  }

  return (
    <div className={s.noteEditForm}>
      <textarea
        ref={textareaRef}
        className={s.noteTextarea}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
      />
      <div className={s.noteEditActions}>
        <button className={s.btnNavy} style={{ height: 30, fontSize: 12, padding: '0 12px' }} onClick={handleSave} disabled={saving || !text.trim()}>
          {saving ? <Loader2 size={12} className={s.spin} /> : <Check size={12} />}
          Lưu
        </button>
        <button className={s.btnOutline} style={{ height: 30, fontSize: 12 }} onClick={onCancel} disabled={saving}>
          Huỷ
        </button>
      </div>
    </div>
  )
}

// ── Main NotesTab ─────────────────────────────────────────────────────────────

export default function NotesTab({ company }) {
  const companyId   = company.id
  const currentUser = useAuthStore((st) => st.user)
  const isAdmin     = currentUser?.role === 'admin'
  const addToast    = useToastStore((st) => st.toast)

  const [notes,     setNotes]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [newText,   setNewText]   = useState('')
  const [adding,    setAdding]    = useState(false)
  const [showAdd,   setShowAdd]   = useState(false)
  const [editNote,  setEditNote]  = useState(null)  // note object being edited
  const newTextareaRef            = useRef(null)

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

  useEffect(() => {
    if (showAdd) newTextareaRef.current?.focus()
  }, [showAdd])

  async function handleAdd() {
    if (!newText.trim()) return
    setAdding(true)
    try {
      const note = await companiesApi.createNote(companyId, { content: newText.trim() })
      setNotes((prev) => [note, ...prev])
      setNewText('')
      setShowAdd(false)
      addToast('Đã thêm ghi chú', 'success')
    } catch {
      addToast('Không thể thêm ghi chú', 'error')
    } finally {
      setAdding(false)
    }
  }

  async function handleEdit(noteId, content) {
    try {
      const updated = await companiesApi.updateNote(companyId, noteId, { content })
      setNotes((prev) => prev.map((n) => n.id === noteId ? { ...n, ...updated } : n))
      setEditNote(null)
      addToast('Đã cập nhật ghi chú', 'success')
    } catch {
      addToast('Không thể cập nhật ghi chú', 'error')
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
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StickyNote size={16} style={{ color: '#d97706' }} />
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>
            Ghi chú nội bộ
          </h3>
          {!loading && notes.length > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, background: '#fffbeb', color: '#92400e', border: '1px solid #fcd34d', borderRadius: 99, padding: '1px 8px' }}>
              {notes.length}
            </span>
          )}
        </div>
        <button
          className={s.btnNavy}
          style={{ height: 32, fontSize: 13, padding: '0 14px' }}
          onClick={() => { setShowAdd((v) => !v); setNewText('') }}
        >
          <Plus size={13} /> Thêm ghi chú
        </button>
      </div>

      {/* Add note form */}
      {showAdd && (
        <div className={s.noteAddPanel}>
          <textarea
            ref={newTextareaRef}
            className={s.noteTextarea}
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Nhập nội dung ghi chú..."
            rows={4}
            onKeyDown={(e) => { if (e.key === 'Escape') { setShowAdd(false); setNewText('') } }}
          />
          <div className={s.noteEditActions}>
            <button className={s.btnNavy} style={{ height: 30, fontSize: 12, padding: '0 14px' }} onClick={handleAdd} disabled={adding || !newText.trim()}>
              {adding ? <Loader2 size={12} className={s.spin} /> : <Check size={12} />}
              Lưu ghi chú
            </button>
            <button className={s.btnOutline} style={{ height: 30, fontSize: 12 }} onClick={() => { setShowAdd(false); setNewText('') }} disabled={adding}>
              Huỷ
            </button>
          </div>
        </div>
      )}

      {/* Notes list */}
      {loading ? (
        <div className={s.loadingCenter}>
          <Loader2 size={18} className={s.spin} style={{ marginRight: 8 }} /> Đang tải...
        </div>
      ) : notes.length === 0 ? (
        <div className={s.emptyState} style={{ paddingTop: 40 }}>
          <StickyNote size={32} style={{ color: '#fcd34d', marginBottom: 8 }} />
          <p style={{ fontSize: 13, color: 'var(--color-muted)', margin: 0 }}>Chưa có ghi chú nào.</p>
          <p style={{ fontSize: 12, color: 'var(--color-muted)', margin: '4px 0 0' }}>Nhấn "Thêm ghi chú" để tạo ghi chú đầu tiên.</p>
        </div>
      ) : (
        <div className={s.noteList}>
          {notes.map((note) => (
            editNote?.id === note.id ? (
              <EditForm
                key={note.id}
                initial={note}
                onSave={handleEdit}
                onCancel={() => setEditNote(null)}
              />
            ) : (
              <NoteCard
                key={note.id}
                note={note}
                currentUserId={currentUser?.id}
                isAdmin={isAdmin}
                onEdit={setEditNote}
                onDelete={handleDelete}
                onTogglePin={handleTogglePin}
              />
            )
          ))}
        </div>
      )}
    </div>
  )
}
