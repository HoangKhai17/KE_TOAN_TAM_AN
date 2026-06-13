import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Archive, Plus, Pencil, Trash2, Loader2, AlertTriangle, Check, Columns, GripVertical,
} from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as archiveApi from '../../api/archive'
import s from './companies.module.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = ['1','2','3','4','5','6','7','8','9','10','11','12']
const MONTH_LABELS = {
  '1':'T1','2':'T2','3':'T3','4':'T4','5':'T5','6':'T6',
  '7':'T7','8':'T8','9':'T9','10':'T10','11':'T11','12':'T12',
}

function countFilledMonths(months) {
  if (!months) return 0
  return MONTHS.filter((m) => (months[m] ?? '').trim() !== '').length
}

// ── MonthCell — inline click-to-edit (compact, dành cho cột tháng) ────────────

function MonthCell({ value, canEdit, onSave }) {
  const [editing,  setEditing]  = useState(false)
  const [localVal, setLocalVal] = useState(value ?? '')
  const inputRef                = useRef(null)

  useEffect(() => { setLocalVal(value ?? '') }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  function commit() {
    setEditing(false)
    const trimmed = localVal.trim()
    if (trimmed !== (value ?? '').trim()) onSave(trimmed)
  }

  return (
    <td
      className={`${s.archMonthCell} ${canEdit ? s.archMonthCellEditable : ''}`}
      onClick={() => canEdit && !editing && setEditing(true)}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={localVal}
          className={s.archMonthInput}
          onChange={(e) => setLocalVal(e.target.value)}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            if (e.key === 'Escape') { setLocalVal(value ?? ''); setEditing(false) }
          }}
        />
      ) : (
        <span className={(value ?? '').trim() ? s.archMonthValFilled : s.archMonthValEmpty}>
          {(value ?? '').trim()}
        </span>
      )}
    </td>
  )
}

// ── ExtraFieldCell — inline click-to-edit (wide, dành cho cột tuỳ chỉnh) ─────

function ExtraFieldCell({ value, canEdit, onSave }) {
  const [editing,  setEditing]  = useState(false)
  const [localVal, setLocalVal] = useState(value ?? '')
  const inputRef                = useRef(null)

  useEffect(() => { setLocalVal(value ?? '') }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  function commit() {
    setEditing(false)
    const trimmed = localVal.trim()
    if (trimmed !== (value ?? '').trim()) onSave(trimmed)
  }

  return (
    <td
      className={`${s.archExtraCell} ${canEdit ? s.archMonthCellEditable : ''}`}
      onClick={() => canEdit && !editing && setEditing(true)}
    >
      {editing ? (
        <textarea
          ref={inputRef}
          value={localVal}
          className={s.archExtraInput}
          rows={2}
          onChange={(e) => setLocalVal(e.target.value)}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit() }
            if (e.key === 'Escape') { setLocalVal(value ?? ''); setEditing(false) }
          }}
        />
      ) : (
        <span className={s.archExtraVal}>
          {(value ?? '').trim() || <span className={s.archMonthValEmpty} />}
        </span>
      )}
    </td>
  )
}

// ── InlineTdCell — click-to-edit cell (like MonthCell but for text fields) ────

function InlineTdCell({ value, canEdit, onSave, multiline, tdClassName, required }) {
  const [editing,  setEditing]  = useState(false)
  const [localVal, setLocalVal] = useState(value ?? '')
  const inputRef               = useRef(null)

  useEffect(() => { setLocalVal(value ?? '') }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  function commit() {
    setEditing(false)
    const trimmed  = localVal.trim()
    const original = (value ?? '').trim()
    if (trimmed === original) return
    if (required && !trimmed) { setLocalVal(value ?? ''); return }
    onSave(trimmed || null)
  }

  return (
    <td
      className={`${tdClassName} ${canEdit ? s.archInlineTdEditable : ''}`}
      onClick={() => canEdit && !editing && setEditing(true)}
    >
      {editing ? (
        multiline ? (
          <textarea
            ref={inputRef}
            value={localVal}
            className={s.archInlineEditInput}
            rows={2}
            onChange={(e) => setLocalVal(e.target.value)}
            onBlur={commit}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit() }
              if (e.key === 'Escape') { setLocalVal(value ?? ''); setEditing(false) }
            }}
          />
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={localVal}
            className={s.archInlineEditInput}
            onChange={(e) => setLocalVal(e.target.value)}
            onBlur={commit}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit() }
              if (e.key === 'Escape') { setLocalVal(value ?? ''); setEditing(false) }
            }}
          />
        )
      ) : (
        (value ?? '').trim()
          ? value
          : <span className={s.archInlineEmpty}>—</span>
      )}
    </td>
  )
}

// ── ResizeHandle — drag handle for column resize ──────────────────────────────

const PAGE_SIZE = 20
const DEFAULT_COL_WIDTHS = { docType: 200, detail: 150, notes: 140, char: 150 }
const MIN_COL_W = 80

function ResizeHandle({ onResize }) {
  const startX = useRef(null)

  function handleMouseDown(e) {
    e.preventDefault()
    e.stopPropagation()
    startX.current = e.clientX
    document.body.style.cursor     = 'col-resize'
    document.body.style.userSelect = 'none'

    function onMove(me) {
      const dx = me.clientX - startX.current
      startX.current = me.clientX
      onResize(dx)
    }

    function onUp() {
      document.body.style.cursor     = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
  }

  return <span className={s.archColResizeHandle} onMouseDown={handleMouseDown} />
}

// ── ManageColumnsModal ────────────────────────────────────────────────────────

function ManageColumnsModal({ companyId, columns, onColumnsChange, onClose }) {
  const addToast              = useToastStore((st) => st.toast)
  const [newName, setNewName] = useState('')
  const [adding,  setAdding]  = useState(false)
  const [error,   setError]   = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  async function handleAdd(e) {
    e.preventDefault()
    if (!newName.trim()) { setError('Vui lòng nhập tên cột'); return }
    if (columns.some((c) => c.colName === newName.trim())) {
      setError('Tên cột đã tồn tại'); return
    }
    setError(null)
    setAdding(true)
    try {
      const col = await archiveApi.createColumn(companyId, { colName: newName.trim() })
      onColumnsChange([...columns, col])
      setNewName('')
      addToast(`Đã thêm cột "${col.colName}"`, 'success')
    } catch (err) {
      setError(err.response?.data?.error?.message ?? 'Không thể thêm cột')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(col) {
    setDeletingId(col.id)
    try {
      await archiveApi.deleteColumn(companyId, col.id)
      onColumnsChange(columns.filter((c) => c.id !== col.id))
      addToast(`Đã xoá cột "${col.colName}"`, 'success')
    } catch {
      addToast('Không thể xoá cột', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Modal title="Quản lý cột tuỳ chỉnh" onClose={onClose} maxWidth={520}>
      <div className={s.archFormWrapSm}>
        <div className={s.modalForm}>
          <p className={s.hdldModalDesc}>
            Cột tuỳ chỉnh áp dụng cho tất cả năm trong công ty này.
            Xoá cột không ảnh hưởng đến dữ liệu đã nhập ở các năm.
          </p>

          {columns.length === 0 ? (
            <p className={s.hdldModalEmpty}>Chưa có cột tuỳ chỉnh nào.</p>
          ) : (
            <div className={s.hdldColList}>
              {columns.map((col) => (
                <div key={col.id} className={s.hdldColRow}>
                  <GripVertical size={13} className={s.hdldColGrip} />
                  <span className={s.hdldColName}>{col.colName}</span>
                  <button
                    className={`${s.iconBtnSm} ${s.iconBtnDanger} ${s.hdldColDeleteBtn}`}
                    onClick={() => handleDelete(col)}
                    disabled={deletingId === col.id}
                    title="Xoá cột"
                  >
                    {deletingId === col.id
                      ? <Loader2 size={12} className={s.spin} />
                      : <Trash2 size={12} />}
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleAdd}>
            {error && <div className={`${s.errorBox} ${s.hdldInlineError}`}>{error}</div>}
            <div className={s.hdldAddColForm}>
              <div className={s.hdldAddColMain}>
                <label className={s.formLabel}>Tên cột mới</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="VD: Kho lưu, Tình trạng, Số lượng..."
                  className={s.formInput}
                  maxLength={200}
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className={`${s.btnNavy} ${s.hdldAddColBtn}`}
                disabled={adding}
              >
                {adding ? <Loader2 size={13} className={s.spin} /> : <Plus size={13} />}
                Thêm
              </button>
            </div>
          </form>

          <div className={`${s.modalActions} ${s.hdldModalActions}`}>
            <button onClick={onClose} className={s.btnOutline}>Đóng</button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ── AddYearModal ──────────────────────────────────────────────────────────────

function AddYearModal({ existingYears, onSave, onClose }) {
  const curYear = new Date().getFullYear()
  const [year,   setYear]   = useState(String(curYear))
  const [notes,  setNotes]  = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    const y = parseInt(year, 10)
    if (isNaN(y) || y < 2000 || y > 2100) { setError('Năm không hợp lệ (2000–2100)'); return }
    if (existingYears.includes(y))         { setError(`Năm ${y} đã tồn tại`);          return }
    setError(null)
    setSaving(true)
    try {
      await onSave({ year: y, notes: notes.trim() || null })
    } catch (err) {
      setError(err.response?.data?.error?.message ?? 'Không thể tạo năm')
      setSaving(false)
    }
  }

  return (
    <Modal title="Thêm năm lưu trữ" onClose={onClose}>
      <div className={s.archFormWrapSm}>
        <form onSubmit={handleSubmit} className={s.modalForm}>
          {error && <div className={s.errorBox}>{error}</div>}
          <div>
            <label className={`${s.formLabel} ${s.formLabelReq}`}>Năm</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              min="2000" max="2100"
              className={s.formInput}
              autoFocus
            />
          </div>
          <div>
            <label className={s.formLabel}>Ghi chú năm</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className={s.formTextarea}
              placeholder="VD: HĐ nguyên tắc 22/05/2026 — Bản giấy, hai bên ký + đóng dấu"
            />
          </div>
          <div className={s.modalActions}>
            <button type="button" onClick={onClose} className={s.btnOutline}>Huỷ</button>
            <button type="submit" disabled={saving} className={s.btnNavy}>
              {saving ? <Loader2 size={13} className={s.spin} /> : <Plus size={13} />}
              {saving ? 'Đang lưu...' : 'Tạo năm'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  )
}

// ── DocFormModal ──────────────────────────────────────────────────────────────

function DocFormModal({ initialDoc, columns = [], onSave, onClose }) {
  const isEdit = !!initialDoc
  const [documentType,    setDocumentType]    = useState(initialDoc?.documentType    ?? '')
  const [detail,          setDetail]          = useState(initialDoc?.detail          ?? '')
  const [notes,           setNotes]           = useState(initialDoc?.notes           ?? '')
  const [characteristics, setCharacteristics] = useState(initialDoc?.characteristics ?? '')
  // Khởi tạo extraFields từ tất cả cột tuỳ chỉnh hiện có
  const [extraFields, setExtraFields] = useState(
    () => Object.fromEntries(
      columns.map((c) => [c.colName, initialDoc?.extraFields?.[c.colName] ?? ''])
    )
  )
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  function setExtraField(colName, val) {
    setExtraFields((prev) => ({ ...prev, [colName]: val }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!documentType.trim()) { setError('Vui lòng nhập loại chứng từ'); return }
    setError(null)
    setSaving(true)
    try {
      const payload = {
        documentType:    documentType.trim(),
        detail:          detail.trim()          || null,
        notes:           notes.trim()           || null,
        characteristics: characteristics.trim() || null,
      }
      if (columns.length > 0) {
        payload.extraFields = Object.fromEntries(
          Object.entries(extraFields).map(([k, v]) => [k, v.trim()])
        )
      }
      await onSave(payload)
    } catch (err) {
      setError(err.response?.data?.error?.message ?? 'Không thể lưu')
      setSaving(false)
    }
  }

  return (
    <Modal title={isEdit ? 'Chỉnh sửa chứng từ' : 'Thêm loại chứng từ'} onClose={onClose}>
      <div className={s.archFormWrapLg}>
        <form onSubmit={handleSubmit} className={s.modalForm}>
          {error && <div className={s.errorBox}>{error}</div>}
          <div>
            <label className={`${s.formLabel} ${s.formLabelReq}`}>Loại chứng từ</label>
            <input
              type="text"
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className={s.formInput}
              placeholder="VD: Bảng chấm công + Bảng lương"
              maxLength={300}
              autoFocus
            />
          </div>
          <div>
            <label className={s.formLabel}>Chi tiết</label>
            <input
              type="text"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              className={s.formInput}
              placeholder="Mô tả bổ sung (tùy chọn)"
              maxLength={500}
            />
          </div>
          <div>
            <label className={s.formLabel}>Đặc điểm</label>
            <input
              type="text"
              value={characteristics}
              onChange={(e) => setCharacteristics(e.target.value)}
              className={s.formInput}
              placeholder="VD: Song ngữ, Bản giấy + bản scan"
              maxLength={300}
            />
          </div>
          <div>
            <label className={s.formLabel}>Ghi chú</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={s.formTextarea}
              placeholder="Ghi chú nội bộ (tùy chọn)"
            />
          </div>

          {/* ── Cột tuỳ chỉnh ───────────────────────────────────────────────── */}
          {columns.length > 0 && (
            <>
              <div className={s.archFormDynDivider}>Thông tin cột tuỳ chỉnh</div>
              {columns.map((col) => (
                <div key={col.id}>
                  <label className={s.formLabel}>{col.colName}</label>
                  <textarea
                    value={extraFields[col.colName] ?? ''}
                    onChange={(e) => setExtraField(col.colName, e.target.value)}
                    rows={2}
                    className={s.formTextarea}
                    placeholder={`Nhập ${col.colName}...`}
                  />
                </div>
              ))}
            </>
          )}

          <div className={s.modalActions}>
            <button type="button" onClick={onClose} className={s.btnOutline}>Huỷ</button>
            <button type="submit" disabled={saving} className={s.btnNavy}>
              {saving ? <Loader2 size={13} className={s.spin} /> : <Check size={13} />}
              {saving ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Thêm'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  )
}

// ── ArchiveTab ─────────────────────────────────────────────────────────────────

export default function ArchiveTab({ company }) {
  const companyId   = company.id
  const currentUser = useAuthStore((st) => st.user)
  const isAdmin     = currentUser?.role === 'admin'
  const canEdit     = isAdmin || company.assignedStaffId === currentUser?.id
  const addToast    = useToastStore((st) => st.toast)

  const [years,       setYears]       = useState([])
  const [activeYear,  setActiveYear]  = useState(null)
  const [docs,        setDocs]        = useState([])
  const [docsTotal,   setDocsTotal]   = useState(0)
  const [page,        setPage]        = useState(1)
  const [docsKey,     setDocsKey]     = useState(0)
  const [columns,     setColumns]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [docsLoading, setDocsLoading] = useState(false)

  const [showAddYear,    setShowAddYear]    = useState(false)
  const [showAddDoc,     setShowAddDoc]     = useState(false)
  const [showManageCols, setShowManageCols] = useState(false)
  const [editDoc,        setEditDoc]        = useState(null)
  const [deleteDocId,    setDeleteDocId]    = useState(null)
  const [showDeleteYear, setShowDeleteYear] = useState(false)
  const [deleting,       setDeleting]       = useState(false)

  // ── Column resize widths ─────────────────────────────────────────────────────

  const [colWidths, setColWidths] = useState({ ...DEFAULT_COL_WIDTHS })

  function resizeCol(key, dx) {
    setColWidths((prev) => ({
      ...prev,
      [key]: Math.max(MIN_COL_W, (prev[key] ?? 160) + dx),
    }))
  }

  const tableWidth = useMemo(() => {
    const customW = columns.reduce((sum, c) => sum + (colWidths[`col_${c.id}`] ?? 160), 0)
    return (
      44                           // STT (fixed)
      + (colWidths.docType ?? 200) // DocType
      + (colWidths.detail  ?? 150) // Detail
      + 42 * 12                    // 12 month cols (fixed)
      + 52                         // Năm (fixed)
      + (colWidths.notes ?? 140)   // Notes
      + (colWidths.char  ?? 150)   // Đặc điểm
      + customW                    // Custom cols
      + (canEdit ? 68 : 0)         // Actions (fixed)
    )
  }, [colWidths, columns, canEdit])

  // ── Load years + columns khi mount ──────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      archiveApi.listYears(companyId),
      archiveApi.listColumns(companyId),
    ])
      .then(([yearList, colList]) => {
        if (cancelled) return
        setYears(yearList)
        setActiveYear(yearList[0] ?? null)
        setColumns(colList)
      })
      .catch(() => addToast('Không thể tải dữ liệu lưu trữ', 'error'))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load docs khi đổi năm / page / docsKey ──────────────────────────────────

  useEffect(() => {
    if (!activeYear) { setDocs([]); setDocsTotal(0); return }
    let cancelled = false
    setDocsLoading(true)
    archiveApi.listDocs(companyId, activeYear.id, { page, pageSize: PAGE_SIZE })
      .then(({ docs, total }) => {
        if (!cancelled) { setDocs(docs); setDocsTotal(total) }
      })
      .catch(() => addToast('Không thể tải danh sách chứng từ', 'error'))
      .finally(() => { if (!cancelled) setDocsLoading(false) })
    return () => { cancelled = true }
  }, [companyId, activeYear?.id, page, docsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  function refetchDocs() { setDocsKey((k) => k + 1) }

  // ── Year handlers ────────────────────────────────────────────────────────────

  async function handleAddYear({ year, notes }) {
    const created = await archiveApi.createYear(companyId, { year, notes })
    setYears((prev) => [...prev, created].sort((a, b) => b.year - a.year))
    setPage(1)
    setActiveYear(created)
    setShowAddYear(false)
    addToast(`Đã tạo năm ${created.year}`, 'success')
  }

  async function handleDeleteYear() {
    if (!activeYear) return
    setDeleting(true)
    try {
      await archiveApi.deleteYear(companyId, activeYear.id)
      const remaining = years.filter((y) => y.id !== activeYear.id)
      setYears(remaining)
      setActiveYear(remaining[0] ?? null)
      setShowDeleteYear(false)
      addToast(`Đã xoá năm ${activeYear.year}`, 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể xoá năm', 'error')
    } finally {
      setDeleting(false)
    }
  }

  // ── Doc handlers ─────────────────────────────────────────────────────────────

  async function handleAddDoc(body) {
    await archiveApi.createDoc(companyId, activeYear.id, body)
    setShowAddDoc(false)
    addToast('Đã thêm loại chứng từ', 'success')
    if (page === 1) refetchDocs()
    else setPage(1)
  }

  async function handleEditDoc(body) {
    const updated = await archiveApi.updateDoc(companyId, activeYear.id, editDoc.id, body)
    setDocs((prev) => prev.map((d) => d.id === updated.id ? updated : d))
    setEditDoc(null)
    addToast('Đã cập nhật', 'success')
  }

  async function handleDeleteDoc() {
    if (!deleteDocId) return
    setDeleting(true)
    try {
      await archiveApi.deleteDoc(companyId, activeYear.id, deleteDocId)
      setDeleteDocId(null)
      addToast('Đã xoá dòng chứng từ', 'success')
      if (docs.length === 1 && page > 1) setPage((p) => p - 1)
      else refetchDocs()
    } catch {
      addToast('Không thể xoá', 'error')
    } finally {
      setDeleting(false)
    }
  }

  async function handleFieldSave(docId, fieldData) {
    try {
      const updated = await archiveApi.updateDoc(companyId, activeYear.id, docId, fieldData)
      setDocs((prev) => prev.map((d) => d.id === docId ? updated : d))
    } catch {
      addToast('Không thể lưu', 'error')
    }
  }

  async function handleMonthSave(docId, month, value) {
    try {
      const updated = await archiveApi.updateDoc(companyId, activeYear.id, docId, {
        months: { [month]: value },
      })
      setDocs((prev) => prev.map((d) => d.id === docId ? updated : d))
    } catch {
      addToast('Không thể lưu ô tháng', 'error')
    }
  }

  async function handleExtraFieldSave(docId, colName, value) {
    try {
      const updated = await archiveApi.updateDoc(companyId, activeYear.id, docId, {
        extraFields: { [colName]: value },
      })
      setDocs((prev) => prev.map((d) => d.id === docId ? updated : d))
    } catch {
      addToast('Không thể lưu ô dữ liệu', 'error')
    }
  }

  // ── colSpan ──────────────────────────────────────────────────────────────────

  // STT + DocType + Detail + 12 tháng + Năm + Notes + Char + extra cols + [Actions]
  const colSpan = 3 + 12 + 1 + 2 + columns.length + (canEdit ? 1 : 0)

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={s.loadingCenter}>
        <Loader2 size={18} className={s.spin} style={{ marginRight: 8 }} />
        Đang tải...
      </div>
    )
  }

  return (
    <div>
      {/* ── Toolbar ───────────────────────────────────────────────────────────── */}
      <div className={s.archToolbar}>
        <div className={s.archYearPills}>
          {years.map((y) => (
            <button
              key={y.id}
              className={`${s.archYearPill} ${activeYear?.id === y.id ? s.archYearPillActive : ''}`}
              onClick={() => { setPage(1); setActiveYear(y) }}
            >
              {y.year}
            </button>
          ))}
          {canEdit && (
            <button className={s.archYearPillAdd} onClick={() => setShowAddYear(true)}>
              <Plus size={12} /> Thêm năm
            </button>
          )}
        </div>

        <div className={s.archToolbarRight}>
          {canEdit && (
            <button className={s.btnOutline} onClick={() => setShowManageCols(true)}>
              <Columns size={13} /> Quản lý cột
            </button>
          )}
          {activeYear && canEdit && (
            <>
              <button className={s.btnNavy} onClick={() => setShowAddDoc(true)}>
                <Plus size={13} /> Thêm dòng
              </button>
              <button
                className={`${s.rowActionBtn} ${s.rowActionDanger}`}
                title={`Xoá năm ${activeYear.year}`}
                onClick={() => setShowDeleteYear(true)}
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Year notes banner ─────────────────────────────────────────────────── */}
      {activeYear?.notes && (
        <div className={s.archNotesBanner}>
          <Archive size={13} className={s.archNotesBannerIcon} />
          <span>{activeYear.notes}</span>
        </div>
      )}

      {/* ── Trạng thái không có năm ───────────────────────────────────────────── */}
      {!activeYear && (
        <div className={s.placeholderTab}>
          <div className={s.placeholderIcon}>
            <Archive size={28} color="#94a3b8" />
          </div>
          <p className={s.placeholderTitle}>Chưa có năm lưu trữ</p>
          <p className={s.placeholderDesc}>
            {canEdit
              ? 'Nhấn "Thêm năm" để bắt đầu theo dõi hồ sơ lưu trữ.'
              : 'Chưa có dữ liệu lưu trữ cho công ty này.'}
          </p>
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────────────── */}
      {activeYear && (
        <div className={s.tableWrap}>
          <div className={`${s.tableScroll} ${s.archTableScroll}`}>
            <table className={`${s.table} ${s.archTable}`} style={{ width: tableWidth }}>
              <thead>
                <tr>
                  <th className={s.archThStt}>#</th>
                  <th className={s.archThDocType} style={{ width: colWidths.docType }}>
                    <span className={s.archThLabel}>Loại chứng từ</span>
                    <ResizeHandle onResize={(dx) => resizeCol('docType', dx)} />
                  </th>
                  <th className={s.archThDetail} style={{ width: colWidths.detail }}>
                    <span className={s.archThLabel}>Chi tiết</span>
                    <ResizeHandle onResize={(dx) => resizeCol('detail', dx)} />
                  </th>
                  {MONTHS.map((m) => (
                    <th key={m} className={s.archThMonth}>{MONTH_LABELS[m]}</th>
                  ))}
                  <th className={s.archThYear}>Năm</th>
                  <th className={s.archThNotes} style={{ width: colWidths.notes }}>
                    <span className={s.archThLabel}>Ghi chú</span>
                    <ResizeHandle onResize={(dx) => resizeCol('notes', dx)} />
                  </th>
                  <th className={s.archThChar} style={{ width: colWidths.char }}>
                    <span className={s.archThLabel}>Đặc điểm</span>
                    <ResizeHandle onResize={(dx) => resizeCol('char', dx)} />
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col.id}
                      className={s.archThCustom}
                      style={{ width: colWidths[`col_${col.id}`] ?? 160 }}
                    >
                      <span className={s.archThLabel}>{col.colName}</span>
                      <ResizeHandle onResize={(dx) => resizeCol(`col_${col.id}`, dx)} />
                    </th>
                  ))}
                  {canEdit && <th className={s.archThActions} />}
                </tr>
              </thead>

              <tbody>
                {docsLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: colSpan }).map((_, j) => (
                        <td key={j} className={s.taskSkeletonCell}>
                          <div className={s.taskSkeletonBar} style={{ '--skeleton-w': '60px' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : docs.length === 0 ? (
                  <tr>
                    <td colSpan={colSpan} className={s.archEmptyRow}>
                      <Archive size={18} style={{ opacity: 0.3, verticalAlign: 'middle', marginRight: 8 }} />
                      Chưa có dòng chứng từ nào.
                      {canEdit && ' Nhấn "Thêm dòng" để bắt đầu.'}
                    </td>
                  </tr>
                ) : docs.map((doc, idx) => (
                  <tr key={doc.id} className={s.archDocRow}>
                    <td className={s.archCellStt}>{idx + 1 + (page - 1) * PAGE_SIZE}</td>
                    <InlineTdCell
                      value={doc.documentType}
                      canEdit={canEdit}
                      tdClassName={s.archCellDocType}
                      required
                      onSave={(val) => handleFieldSave(doc.id, { documentType: val })}
                    />
                    <InlineTdCell
                      value={doc.detail}
                      canEdit={canEdit}
                      tdClassName={s.archCellDetail}
                      onSave={(val) => handleFieldSave(doc.id, { detail: val })}
                    />
                    {MONTHS.map((m) => (
                      <MonthCell
                        key={m}
                        value={doc.months?.[m] ?? ''}
                        canEdit={canEdit}
                        onSave={(val) => handleMonthSave(doc.id, m, val)}
                      />
                    ))}
                    <td className={s.archCellYear}>
                      <span className={s.archYearCount}>
                        {countFilledMonths(doc.months)}
                      </span>
                    </td>
                    <InlineTdCell
                      value={doc.notes}
                      canEdit={canEdit}
                      tdClassName={s.archCellNotes}
                      multiline
                      onSave={(val) => handleFieldSave(doc.id, { notes: val })}
                    />
                    <InlineTdCell
                      value={doc.characteristics}
                      canEdit={canEdit}
                      tdClassName={s.archCellChar}
                      onSave={(val) => handleFieldSave(doc.id, { characteristics: val })}
                    />
                    {columns.map((col) => (
                      <ExtraFieldCell
                        key={col.id}
                        value={doc.extraFields?.[col.colName] ?? ''}
                        canEdit={canEdit}
                        onSave={(val) => handleExtraFieldSave(doc.id, col.colName, val)}
                      />
                    ))}
                    {canEdit && (
                      <td className={s.archCellActions}>
                        <div className={s.cTaskActionBtns}>
                          <button
                            className={s.rowActionBtn}
                            title="Chỉnh sửa"
                            onClick={() => setEditDoc(doc)}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            className={`${s.rowActionBtn} ${s.rowActionDanger}`}
                            title="Xoá dòng"
                            onClick={() => setDeleteDocId(doc.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!docsLoading && (
            <div className={s.archTableFooter}>
              <span className={s.archTableCount}>
                {docsTotal} loại chứng từ · năm {activeYear.year}
                {columns.length > 0 && ` · ${columns.length} cột tuỳ chỉnh`}
              </span>
              {docsTotal > PAGE_SIZE && (
                <div className={s.archPagination}>
                  <button
                    className={s.archPageBtn}
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    ‹ Trước
                  </button>
                  <span className={s.archPageInfo}>
                    {page} / {Math.ceil(docsTotal / PAGE_SIZE)}
                  </span>
                  <button
                    className={s.archPageBtn}
                    disabled={page >= Math.ceil(docsTotal / PAGE_SIZE)}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Tiếp ›
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────────── */}

      {showAddYear && (
        <AddYearModal
          existingYears={years.map((y) => y.year)}
          onSave={handleAddYear}
          onClose={() => setShowAddYear(false)}
        />
      )}

      {showAddDoc && (
        <DocFormModal
          columns={columns}
          onSave={handleAddDoc}
          onClose={() => setShowAddDoc(false)}
        />
      )}

      {editDoc && (
        <DocFormModal
          initialDoc={editDoc}
          columns={columns}
          onSave={handleEditDoc}
          onClose={() => setEditDoc(null)}
        />
      )}

      {showManageCols && (
        <ManageColumnsModal
          companyId={companyId}
          columns={columns}
          onColumnsChange={setColumns}
          onClose={() => setShowManageCols(false)}
        />
      )}

      {deleteDocId && (
        <Modal title="Xoá dòng chứng từ" onClose={() => setDeleteDocId(null)}>
          <div className={s.modalStack}>
            <div className={`${s.terminateWarn} ${s.terminateWarnDanger}`}>
              <AlertTriangle size={16} className={`${s.warnIconInline} ${s.warnIconDanger}`} />
              <span>Bạn có chắc muốn xoá dòng chứng từ này? Hành động không thể hoàn tác.</span>
            </div>
            <div className={s.modalActions}>
              <button onClick={() => setDeleteDocId(null)} className={s.btnOutline} disabled={deleting}>Huỷ</button>
              <button onClick={handleDeleteDoc} disabled={deleting} className={s.btnDanger}>
                {deleting ? <Loader2 size={13} className={s.spin} /> : <Trash2 size={13} />}
                {deleting ? 'Đang xoá...' : 'Xoá'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showDeleteYear && (
        <Modal title={`Xoá năm ${activeYear?.year}`} onClose={() => setShowDeleteYear(false)}>
          <div className={s.modalStack}>
            <div className={`${s.terminateWarn} ${s.terminateWarnDanger}`}>
              <AlertTriangle size={16} className={`${s.warnIconInline} ${s.warnIconDanger}`} />
              <span>
                Bạn sắp xoá toàn bộ dữ liệu năm{' '}
                <strong>{activeYear?.year}</strong>{' '}
                ({docs.length} dòng chứng từ).
                Hành động này không thể hoàn tác.
              </span>
            </div>
            <div className={s.modalActions}>
              <button onClick={() => setShowDeleteYear(false)} className={s.btnOutline} disabled={deleting}>Huỷ</button>
              <button onClick={handleDeleteYear} disabled={deleting} className={s.btnDanger}>
                {deleting ? <Loader2 size={13} className={s.spin} /> : <Trash2 size={13} />}
                {deleting ? 'Đang xoá...' : 'Xoá năm'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
