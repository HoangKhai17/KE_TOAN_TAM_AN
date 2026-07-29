import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Check, X, Loader2, Pin } from 'lucide-react'
import * as notesApi from '../../api/companyNotes'
import { useEnumsStore } from '../../hooks/useEnums'
import { useToastStore } from '../../stores/toastStore'
import s from './companies.module.css'

// Màu badge mức độ theo key của enum assignment_priority (dùng lại, không tạo enum mới)
const SEVERITY_STYLE = {
  urgent: { background: '#fee2e2', color: '#b91c1c' },
  high:   { background: '#ffedd5', color: '#c2410c' },
  normal: { background: '#e0f2fe', color: '#0369a1' },
  low:    { background: '#f1f5f9', color: '#64748b' },
}

function emptyDraft(defSeverity) {
  return { content: '', severity: defSeverity || 'normal', isPinned: false }
}
function draftFromRow(r) {
  return { content: r.content ?? '', severity: r.severity ?? 'normal', isPinned: !!r.isPinned }
}

// Hàng nhập liệu ở cấp cao nhất để input không bị remount → giữ focus.
function NoteEditRow({ draft, setF, save, cancel, saving, severityOpts }) {
  return (
    <tr className={s.locEditRow}>
      <td><input className={s.locInput} value={draft.content} onChange={setF('content')} placeholder="Nội dung lưu ý" /></td>
      <td>
        <select className={s.locInput} value={draft.severity} onChange={setF('severity')}>
          {severityOpts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </td>
      <td className={s.locCenter}>
        <input type="checkbox" checked={draft.isPinned} onChange={setF('isPinned')} title="Ghim lên đầu" />
      </td>
      <td className={s.locCenter}>
        <div className={s.credRowActions}>
          <button className={s.locBtnSave} onClick={save} disabled={saving} title="Lưu">
            {saving ? <Loader2 size={13} className={s.spin} /> : <Check size={13} />}
          </button>
          <button className={s.locBtnCancel} onClick={cancel} disabled={saving} title="Huỷ"><X size={13} /></button>
        </div>
      </td>
    </tr>
  )
}

export default function NotesSection({ companyId, canEdit = true }) {
  const getOptions = useEnumsStore((st) => st.getOptions)
  const getLabel   = useEnumsStore((st) => st.getLabel)
  const addToast   = useToastStore((st) => st.toast)

  const severityOpts = getOptions('assignment_priority')
  const defSeverity  = severityOpts.some((o) => o.key === 'normal') ? 'normal' : (severityOpts[0]?.key ?? 'normal')

  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [editingId, setEditingId] = useState(null)   // null | 'new' | <id>
  const [draft, setDraft]       = useState(() => emptyDraft(defSeverity))
  const [saving, setSaving]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await notesApi.listNotes(companyId))
    } catch {
      addToast('Không tải được danh sách lưu ý', 'error')
    } finally {
      setLoading(false)
    }
  }, [companyId, addToast])

  useEffect(() => { load() }, [load])

  function startAdd() { setDraft(emptyDraft(defSeverity)); setEditingId('new') }
  function startEdit(row) { setDraft(draftFromRow(row)); setEditingId(row.id) }
  function cancel() { setEditingId(null); setDraft(emptyDraft(defSeverity)) }

  const setF = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setDraft((p) => ({ ...p, [k]: v }))
  }

  async function save() {
    if (!draft.content.trim()) { addToast('Vui lòng nhập nội dung lưu ý', 'error'); return }
    setSaving(true)
    try {
      const body = {
        content: draft.content.trim(),
        severity: draft.severity || defSeverity,
        isPinned: draft.isPinned,
      }
      if (editingId === 'new') await notesApi.createNote(companyId, body)
      else                     await notesApi.updateNote(companyId, editingId, body)
      addToast(editingId === 'new' ? 'Đã thêm lưu ý' : 'Đã cập nhật lưu ý', 'success')
      cancel()
      await load()
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không lưu được lưu ý', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function remove(row) {
    if (!window.confirm('Xoá lưu ý này?')) return
    try {
      await notesApi.deleteNote(companyId, row.id)
      addToast('Đã xoá lưu ý', 'success')
      await load()
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không xoá được lưu ý', 'error')
    }
  }

  const colSpan = 4
  const editRowProps = { draft, setF, save, cancel, saving, severityOpts }

  return (
    <div>
      {canEdit && editingId !== 'new' && (
        <div className={s.procSectionBar}>
          <button className={s.credAddBtn} onClick={startAdd}><Plus size={13} /> Thêm lưu ý</button>
        </div>
      )}
      <div className={s.credTableWrap}>
        <table className={s.credTable}>
          <colgroup>
            <col style={{ width: '58%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '12%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Nội dung</th>
              <th>Mức độ</th>
              <th style={{ textAlign: 'center' }}>Ghim</th>
              <th style={{ textAlign: 'center' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={colSpan} className={s.locEmpty}>Đang tải…</td></tr>
            ) : rows.length === 0 && editingId !== 'new' ? (
              <tr><td colSpan={colSpan} className={s.locEmpty}>Chưa có điều cần lưu ý. Nhấn “Thêm lưu ý”.</td></tr>
            ) : (
              rows.map((r) => (
                editingId === r.id ? <NoteEditRow key={r.id} {...editRowProps} /> : (
                  <tr key={r.id}>
                    <td title={r.content}>{r.content}</td>
                    <td>
                      <span className={s.locStatus} style={SEVERITY_STYLE[r.severity] ?? SEVERITY_STYLE.normal}>
                        {getLabel('assignment_priority', r.severity, r.severity)}
                      </span>
                    </td>
                    <td className={s.locCenter}>
                      {r.isPinned ? <Pin size={14} className={s.locStar} fill="currentColor" /> : <span className={s.locMuted}>—</span>}
                    </td>
                    <td className={s.locCenter}>
                      {canEdit && (
                        <div className={s.credRowActions}>
                          <button className={s.iconBtnSm} onClick={() => startEdit(r)} title="Sửa"><Pencil size={13} /></button>
                          <button className={`${s.iconBtnSm} ${s.iconBtnDanger}`} onClick={() => remove(r)} title="Xoá"><Trash2 size={13} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              ))
            )}
            {editingId === 'new' && <NoteEditRow {...editRowProps} />}
          </tbody>
        </table>
      </div>
    </div>
  )
}
