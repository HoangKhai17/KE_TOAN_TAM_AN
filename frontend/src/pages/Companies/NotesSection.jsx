import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Trash2, Check, X, Loader2, Pin, Filter } from 'lucide-react'
import * as notesApi from '../../api/companyNotes'
import { useEnumsStore } from '../../hooks/useEnums'
import { useToastStore } from '../../stores/toastStore'
import { useDeleteConfirm } from '../../components/ui/DeleteConfirmDialog'
import InlineTableCell from '../../components/ui/InlineTableCell'
import ColumnFilterDropdown from '../../components/ui/ColumnFilterDropdown'
import {
  DragHeaderCell, DragRowCell, IndexHeaderCell, IndexRowCell,
  SelectionHeaderCell, SelectionRowCell, useRowReorder, useRowSelection,
} from '../../components/ui/data-table'
import { useCompanyFooter } from './companyFooter'
import s from './companies.module.css'

// Màu badge mức độ theo key của enum assignment_priority (dùng lại, không tạo enum mới)
const SEVERITY_STYLE = {
  urgent: { background: 'var(--color-danger)', color: '#fff' },
  high:   { background: 'var(--color-warning)', color: '#fff' },
  normal: { background: 'var(--color-primary-deep)', color: '#fff' },
  low:    { background: 'var(--color-muted)', color: '#fff' },
}

function emptyDraft(defSeverity) {
  return { content: '', severity: defSeverity || 'normal', isPinned: false }
}
// Hàng nhập liệu ở cấp cao nhất để input không bị remount → giữ focus.
function NoteEditRow({ draft, setF, save, cancel, saving, severityOpts }) {
  return (
    <tr className={s.locEditRow}>
      <td /><td /><td />
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

export default function NotesSection({ companyId, canEdit = true, onCountChange }) {
  const confirmDelete = useDeleteConfirm()
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
  const [activeCell, setActiveCell] = useState(null)
  const [colFilters, setColFilters] = useState({})
  const [sortState, setSortState] = useState({ col: null, dir: 'asc' })
  const [filterPopup, setFilterPopup] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const displayValue = useCallback((row, key) => {
    if (key === 'severity') return getLabel('assignment_priority', row.severity, row.severity)
    if (key === 'isPinned') return row.isPinned ? 'Đã ghim' : 'Chưa ghim'
    return String(row[key] ?? '')
  }, [getLabel])
  const displayedRows = useMemo(() => {
    let result = [...rows]
    for (const [key, value] of Object.entries(colFilters)) {
      if (value instanceof Set && value.size) result = result.filter((row) => value.has(displayValue(row, key)))
      else if (typeof value === 'string' && value.trim()) {
        const query = value.trim().toLocaleLowerCase('vi')
        result = result.filter((row) => displayValue(row, key).toLocaleLowerCase('vi').includes(query))
      }
    }
    if (sortState.col) result.sort((a, b) => displayValue(a, sortState.col).localeCompare(displayValue(b, sortState.col), 'vi', { numeric: true }) * (sortState.dir === 'asc' ? 1 : -1))
    return result
  }, [rows, colFilters, sortState, displayValue])

  // Phân trang client-side → footer trang
  const noteTotal      = displayedRows.length
  const noteTotalPages = Math.max(1, Math.ceil(noteTotal / pageSize))
  const safePage       = Math.min(page, noteTotalPages)
  const pageRows       = displayedRows.slice((safePage - 1) * pageSize, safePage * pageSize)
  useEffect(() => { setPage(1) }, [colFilters, sortState, pageSize])
  useCompanyFooter(loading ? null : {
    total: noteTotal, from: (safePage - 1) * pageSize + 1, to: Math.min(safePage * pageSize, noteTotal),
    page: safePage, pageSize, totalPages: noteTotalPages, itemLabel: 'lưu ý',
    onPageChange: setPage, onPageSizeChange: setPageSize,
  })

  const selection = useRowSelection({ rows: displayedRows })
  const reorder = useRowReorder({
    rows, setRows, enabled: canEdit && editingId == null && activeCell == null && Object.keys(colFilters).length === 0 && !sortState.col && noteTotalPages === 1,
    onError: () => addToast('Không thể lưu thứ tự lưu ý', 'error'),
    onPersist: (ordered, previous) => Promise.all(ordered
      .map((row, index) => ({ row, index }))
      .filter(({ row, index }) => previous[index]?.id !== row.id)
      .map(({ row, index }) => notesApi.updateNote(companyId, row.id, { sortOrder: index }))),
  })

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

  // Báo số lượng lưu ý ra ngoài (badge trên tab)
  useEffect(() => { onCountChange?.(rows.length) }, [rows.length]) // eslint-disable-line react-hooks/exhaustive-deps

  function startAdd() { setActiveCell({ rowId: 'new', colKey: 'content' }) }
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

  async function saveCell(row, field, value) {
    try {
      const payload = { [field]: value }
      const updated = await notesApi.updateNote(companyId, row.id, payload)
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, ...updated, [field]: value } : item))
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không lưu được thay đổi', 'error')
      throw err
    }
  }

  async function createFromFirstCell(value) {
    if (!value?.trim()) return null
    try {
      const created = await notesApi.createNote(companyId, { content: value.trim(), severity: defSeverity, isPinned: false })
      setRows((current) => [...current, created])
      addToast('Đã thêm lưu ý', 'success')
      return { rowId: created.id }
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thêm được lưu ý', 'error')
      throw err
    }
  }

  const editableColumns = ['content', 'severity']
  function setColumnFilter(colKey, value) {
    setColFilters((current) => {
      const next = { ...current }
      if (value == null || (value instanceof Set && value.size === 0) || (typeof value === 'string' && !value.trim())) delete next[colKey]
      else next[colKey] = value
      return next
    })
  }
  function openColumnFilter(colKey, event) {
    event.stopPropagation()
    if (filterPopup?.colKey === colKey) return setFilterPopup(null)
    const rect = event.currentTarget.getBoundingClientRect()
    setFilterPopup({ colKey, top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 260) })
  }
  function FilterHeader({ colKey, children }) {
    const active = colFilters[colKey] != null || sortState.col === colKey
    return <th><div className={s.hdldThInner}><span className={s.hdldThLabel}>{children}</span><button data-colfilter-btn className={`${s.hdldFilterBtn} ${active ? s.hdldFilterBtnActive : ''}`} onClick={(event) => openColumnFilter(colKey, event)} title="Lọc / Sắp xếp"><Filter size={10} /></button></div></th>
  }
  function navigateCell(rowId, colKey, direction, result) {
    if (direction === 'cancel') { setActiveCell(null); return }
    const actualRowId = result?.rowId ?? rowId
    const rowIndex = rows.findIndex((row) => row.id === actualRowId)
    const columnIndex = editableColumns.indexOf(colKey)
    if (direction === 'next') {
      if (columnIndex < editableColumns.length - 1 && actualRowId !== 'new') return setActiveCell({ rowId: actualRowId, colKey: editableColumns[columnIndex + 1] })
      const nextRow = rows[rowIndex + 1]
      return setActiveCell({ rowId: nextRow?.id ?? 'new', colKey: 'content' })
    }
    if (direction === 'prev') {
      if (columnIndex > 0 && actualRowId !== 'new') return setActiveCell({ rowId: actualRowId, colKey: editableColumns[columnIndex - 1] })
      const previousRow = rows[rowIndex - 1]
      return setActiveCell(previousRow ? { rowId: previousRow.id, colKey: 'severity' } : null)
    }
    if (direction === 'down') {
      if (result?.rowId) return setActiveCell(null)
      const nextRow = rows[rowIndex + 1]
      setActiveCell({ rowId: nextRow?.id ?? 'new', colKey })
    }
  }

  async function remove(row) {
    if (!(await confirmDelete({ title: 'Xóa lưu ý', message: 'Bạn có chắc chắn muốn xóa lưu ý này?' }))) return
    try {
      await notesApi.deleteNote(companyId, row.id)
      addToast('Đã xoá lưu ý', 'success')
      await load()
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không xoá được lưu ý', 'error')
    }
  }

  async function removeSelected() {
    if (!selection.selectedCount || !(await confirmDelete({ title: 'Xóa lưu ý', message: <>Bạn có chắc chắn muốn xóa <strong>{selection.selectedCount}</strong> lưu ý đã chọn?</>, confirmLabel: `Xóa ${selection.selectedCount} mục` }))) return
    const ids = [...selection.selectedIds]
    const results = await Promise.allSettled(ids.map((id) => notesApi.deleteNote(companyId, id)))
    const deleted = new Set(ids.filter((_, index) => results[index].status === 'fulfilled'))
    setRows((current) => current.filter((row) => !deleted.has(row.id)))
    selection.remove(deleted)
    addToast(`Đã xoá ${deleted.size}/${ids.length} lưu ý`, deleted.size ? 'success' : 'error')
  }

  const colSpan = 7
  const editRowProps = { draft, setF, save, cancel, saving, severityOpts }

  return (
    <div>
      {canEdit && (
        <div className={s.procSectionBar}>
          {selection.selectedCount > 0 && <button className={`${s.btnDanger} ${s.dataTableBulkDelete}`} onClick={removeSelected}><Trash2 size={13} /> Xoá {selection.selectedCount} dòng</button>}
          <button className={s.credAddBtn} onClick={startAdd}><Plus size={13} /> Thêm lưu ý</button>
        </div>
      )}
      <div className={s.credTableWrap}>
        <table className={s.credTable}>
          <colgroup>
            <col className={s.dataTableColDrag} /><col className={s.dataTableColSelect} /><col className={s.dataTableColIndex} />
            <col style={{ width: '58%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '12%' }} />
          </colgroup>
          <thead>
            <tr>
              <DragHeaderCell />
              <SelectionHeaderCell allSelected={selection.allSelected} someSelected={selection.someSelected} onToggle={selection.toggleAll} />
              <IndexHeaderCell />
              <FilterHeader colKey="content">Nội dung</FilterHeader>
              <FilterHeader colKey="severity">Mức độ</FilterHeader>
              <FilterHeader colKey="isPinned">Ghim</FilterHeader>
              <th style={{ textAlign: 'center' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={colSpan} className={s.locEmpty}>Đang tải…</td></tr>
            ) : displayedRows.length === 0 && activeCell?.rowId !== 'new' ? (
              <tr><td colSpan={colSpan} className={s.locEmpty}>Chưa có điều cần lưu ý. Nhấn “Thêm lưu ý”.</td></tr>
            ) : (
              pageRows.map((r, index) => (
                <tr key={r.id} {...reorder.rowProps(r.id)} className={reorder.dragOverId === r.id ? s.dataTableRowDragOver : ''}>
                    <DragRowCell enabled={canEdit && editingId == null} handleProps={reorder.handleProps(r.id)} />
                    <SelectionRowCell checked={selection.selectedIds.has(r.id)} onToggle={() => selection.toggle(r.id)} />
                    <IndexRowCell index={(safePage - 1) * pageSize + index + 1} />
                    <td><InlineTableCell value={r.content} required multiline canEdit={canEdit} active={activeCell?.rowId === r.id && activeCell?.colKey === 'content'} onActivate={() => setActiveCell({ rowId: r.id, colKey: 'content' })} onSave={(value) => saveCell(r, 'content', value)} onNavigate={(direction) => navigateCell(r.id, 'content', direction)} /></td>
                    <td>
                      <InlineTableCell
                        value={r.severity}
                        type="select"
                        options={severityOpts}
                        canEdit={canEdit}
                        active={activeCell?.rowId === r.id && activeCell?.colKey === 'severity'}
                        onActivate={() => setActiveCell({ rowId: r.id, colKey: 'severity' })}
                        displayValue={<span className={s.locStatus} style={SEVERITY_STYLE[r.severity] ?? SEVERITY_STYLE.normal}>{getLabel('assignment_priority', r.severity, r.severity)}</span>}
                        onSave={(value) => saveCell(r, 'severity', value)}
                        onNavigate={(direction) => navigateCell(r.id, 'severity', direction)}
                      />
                    </td>
                    <td className={s.locCenter}>
                      <button type="button" className={s.inlinePinButton} disabled={!canEdit} onClick={() => saveCell(r, 'isPinned', !r.isPinned)} title={r.isPinned ? 'Bỏ ghim' : 'Ghim'}>
                        {r.isPinned ? <Pin size={14} className={s.locStar} fill="currentColor" /> : <Pin size={14} />}
                      </button>
                    </td>
                    <td className={s.locCenter}>
                      {canEdit && (
                        <div className={s.credRowActions}>
                          <button className={`${s.iconBtnSm} ${s.iconBtnDanger}`} onClick={() => remove(r)} title="Xoá"><Trash2 size={13} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
              ))
            )}
            {canEdit && activeCell?.rowId === 'new' && (
              <tr className={s.excelNewRow}>
                <td /><td /><td />
                <td><InlineTableCell value="" required multiline active={activeCell?.rowId === 'new' && activeCell?.colKey === 'content'} onActivate={() => setActiveCell({ rowId: 'new', colKey: 'content' })} onSave={createFromFirstCell} onNavigate={(direction, result) => navigateCell('new', 'content', direction, result)} /></td>
                <td colSpan={3} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {filterPopup && <ColumnFilterDropdown colKey={filterPopup.colKey} filterType={filterPopup.colKey === 'content' ? 'text' : 'enum'} allRows={rows} getDisplayLabel={displayValue} currentFilter={colFilters[filterPopup.colKey] ?? null} sortState={sortState} onSort={(col, dir) => { setSortState({ col, dir }); setFilterPopup(null) }} onFilterChange={setColumnFilter} onClose={() => setFilterPopup(null)} style={{ '--cfd-top': `${filterPopup.top}px`, '--cfd-left': `${filterPopup.left}px` }} />}
    </div>
  )
}
