import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Trash2, Check, X, Loader2, Filter } from 'lucide-react'
import * as docTypeApi from '../../api/documentTypes'
import { useToastStore } from '../../stores/toastStore'
import { useDeleteConfirm } from '../../components/ui/DeleteConfirmDialog'
import InlineTableCell from '../../components/ui/InlineTableCell'
import ColumnFilterDropdown from '../../components/ui/ColumnFilterDropdown'
import { matchColFilter, isColFilterActive } from '../../components/ui/columnFilter'
import {
  DragHeaderCell, DragRowCell, IndexHeaderCell, IndexRowCell,
  SelectionHeaderCell, SelectionRowCell, useRowReorder, useRowSelection,
} from '../../components/ui/data-table'
import { useCompanyFooter } from './companyFooter'
import s from './companies.module.css'

function emptyDraft() {
  return { name: '', category: '', frequency: '', source: '', note: '' }
}
// Hàng nhập liệu ở cấp cao nhất để input không bị remount → giữ focus.
function DocTypeEditRow({ draft, setF, save, cancel, saving }) {
  return (
    <tr className={s.locEditRow}>
      <td /><td /><td />
      <td><input className={s.locInput} value={draft.name} onChange={setF('name')} placeholder="VD: Hóa đơn đầu vào" /></td>
      <td><input className={s.locInput} value={draft.category} onChange={setF('category')} placeholder="VD: Đầu vào" /></td>
      <td><input className={s.locInput} value={draft.source} onChange={setF('source')} placeholder="VD: Khách gửi" /></td>
      <td><input className={s.locInput} value={draft.frequency} onChange={setF('frequency')} placeholder="VD: Hàng tháng" /></td>
      <td><input className={s.locInput} value={draft.note} onChange={setF('note')} placeholder="Ghi chú" /></td>
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

export default function DocumentTypesSection({ companyId, canEdit = true }) {
  const confirmDelete = useDeleteConfirm()
  const addToast = useToastStore((st) => st.toast)

  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [editingId, setEditingId] = useState(null)   // null | 'new' | <id>
  const [draft, setDraft]       = useState(emptyDraft)
  const [saving, setSaving]     = useState(false)
  const [activeCell, setActiveCell] = useState(null)
  const [colFilters, setColFilters] = useState({})
  const [sortState, setSortState] = useState({ col: null, dir: 'asc' })
  const [filterPopup, setFilterPopup] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const displayedRows = useMemo(() => {
    let result = [...rows]
    for (const [key, value] of Object.entries(colFilters)) {
      if (!isColFilterActive(value, 'text')) continue
      result = result.filter((row) => matchColFilter(value, 'text', { label: String(row[key] ?? '') }))
    }
    if (sortState.col) result.sort((a, b) => String(a[sortState.col] ?? '').localeCompare(String(b[sortState.col] ?? ''), 'vi', { numeric: true }) * (sortState.dir === 'asc' ? 1 : -1))
    return result
  }, [rows, colFilters, sortState])

  // Phân trang client-side → footer trang
  const docTotal      = displayedRows.length
  const docTotalPages = Math.max(1, Math.ceil(docTotal / pageSize))
  const safePage      = Math.min(page, docTotalPages)
  const pageRows      = displayedRows.slice((safePage - 1) * pageSize, safePage * pageSize)
  useEffect(() => { setPage(1) }, [colFilters, sortState, pageSize])
  useCompanyFooter(loading ? null : {
    total: docTotal, from: (safePage - 1) * pageSize + 1, to: Math.min(safePage * pageSize, docTotal),
    page: safePage, pageSize, totalPages: docTotalPages, itemLabel: 'chứng từ',
    onPageChange: setPage, onPageSizeChange: setPageSize,
  })

  const selection = useRowSelection({ rows: displayedRows })
  const reorder = useRowReorder({
    rows, setRows, enabled: canEdit && editingId == null && activeCell == null && Object.keys(colFilters).length === 0 && !sortState.col && docTotalPages === 1,
    onError: () => addToast('Không thể lưu thứ tự chứng từ', 'error'),
    onPersist: (ordered, previous) => Promise.all(ordered
      .map((row, index) => ({ row, index }))
      .filter(({ row, index }) => previous[index]?.id !== row.id)
      .map(({ row, index }) => docTypeApi.updateDocumentType(companyId, row.id, { sortOrder: index }))),
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await docTypeApi.listDocumentTypes(companyId))
    } catch {
      addToast('Không tải được danh sách chứng từ', 'error')
    } finally {
      setLoading(false)
    }
  }, [companyId, addToast])

  useEffect(() => { load() }, [load])

  function startAdd() { setActiveCell({ rowId: 'new', colKey: 'name' }) }
  function cancel() { setEditingId(null); setDraft(emptyDraft()) }

  const setF = (k) => (e) => setDraft((p) => ({ ...p, [k]: e.target.value }))

  async function save() {
    if (!draft.name.trim()) { addToast('Vui lòng nhập tên chứng từ', 'error'); return }
    setSaving(true)
    try {
      const body = {
        name: draft.name.trim(),
        category: draft.category.trim() || null,
        frequency: draft.frequency.trim() || null,
        source: draft.source.trim() || null,
        note: draft.note.trim() || null,
      }
      if (editingId === 'new') await docTypeApi.createDocumentType(companyId, body)
      else                     await docTypeApi.updateDocumentType(companyId, editingId, body)
      addToast(editingId === 'new' ? 'Đã thêm chứng từ' : 'Đã cập nhật chứng từ', 'success')
      cancel()
      await load()
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không lưu được chứng từ', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function saveCell(row, field, value) {
    try {
      const updated = await docTypeApi.updateDocumentType(companyId, row.id, { [field]: value || null })
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, ...updated, [field]: value || null } : item))
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không lưu được thay đổi', 'error')
      throw err
    }
  }

  async function createFromFirstCell(value) {
    if (!value?.trim()) return null
    try {
      const created = await docTypeApi.createDocumentType(companyId, { name: value.trim() })
      setRows((current) => [...current, created])
      addToast('Đã thêm chứng từ', 'success')
      return { rowId: created.id }
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thêm được chứng từ', 'error')
      throw err
    }
  }

  const editableColumns = ['name', 'category', 'source', 'frequency', 'note']
  function setColumnFilter(colKey, value) {
    setColFilters((current) => {
      const next = { ...current }
      if (value == null || (typeof value === 'string' && !value.trim())) delete next[colKey]
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
      return setActiveCell({ rowId: nextRow?.id ?? 'new', colKey: 'name' })
    }
    if (direction === 'prev') {
      if (columnIndex > 0 && actualRowId !== 'new') return setActiveCell({ rowId: actualRowId, colKey: editableColumns[columnIndex - 1] })
      const previousRow = rows[rowIndex - 1]
      return setActiveCell(previousRow ? { rowId: previousRow.id, colKey: 'note' } : null)
    }
    if (direction === 'down') {
      // Vừa tạo dòng mới từ ô nhập → mở NGAY một dòng nhập mới để nhập liên tục (Enter → Enter…)
      if (result?.rowId) return setActiveCell({ rowId: 'new', colKey: 'name' })
      // Xuống cùng cột ở dòng kế; nếu đang ở dòng cuối → mở dòng nhập mới (ở cột Tên)
      const nextRow = rows[rowIndex + 1]
      setActiveCell(nextRow ? { rowId: nextRow.id, colKey } : { rowId: 'new', colKey: 'name' })
    }
  }

  async function remove(row) {
    if (!(await confirmDelete({ title: 'Xóa chứng từ', message: <>Bạn có chắc chắn muốn xóa chứng từ <strong>“{row.name}”</strong>?</> }))) return
    try {
      await docTypeApi.deleteDocumentType(companyId, row.id)
      addToast('Đã xoá chứng từ', 'success')
      await load()
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không xoá được chứng từ', 'error')
    }
  }

  async function removeSelected() {
    if (!selection.selectedCount || !(await confirmDelete({ title: 'Xóa chứng từ', message: <>Bạn có chắc chắn muốn xóa <strong>{selection.selectedCount}</strong> chứng từ đã chọn?</>, confirmLabel: `Xóa ${selection.selectedCount} mục` }))) return
    const ids = [...selection.selectedIds]
    const results = await Promise.allSettled(ids.map((id) => docTypeApi.deleteDocumentType(companyId, id)))
    const deleted = new Set(ids.filter((_, index) => results[index].status === 'fulfilled'))
    setRows((current) => current.filter((row) => !deleted.has(row.id)))
    selection.remove(deleted)
    addToast(`Đã xoá ${deleted.size}/${ids.length} chứng từ`, deleted.size ? 'success' : 'error')
  }

  const colSpan = 9
  const editRowProps = { draft, setF, save, cancel, saving }

  return (
    <div>
      {canEdit && (
        <div className={s.procSectionBar}>
          {selection.selectedCount > 0 && <button className={`${s.btnDanger} ${s.dataTableBulkDelete}`} onClick={removeSelected}><Trash2 size={13} /> Xoá {selection.selectedCount} dòng</button>}
          <button className={s.credAddBtn} onClick={startAdd}><Plus size={13} /> Thêm chứng từ</button>
        </div>
      )}
      <div className={s.credTableWrap}>
        <table className={s.credTable}>
          <colgroup>
            <col className={s.dataTableColDrag} /><col className={s.dataTableColSelect} /><col className={s.dataTableColIndex} />
            <col style={{ width: '26%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '8%' }} />
          </colgroup>
          <thead>
            <tr>
              <DragHeaderCell />
              <SelectionHeaderCell allSelected={selection.allSelected} someSelected={selection.someSelected} onToggle={selection.toggleAll} />
              <IndexHeaderCell />
              <FilterHeader colKey="name">Tên chứng từ</FilterHeader>
              <FilterHeader colKey="category">Phân loại</FilterHeader>
              <FilterHeader colKey="source">Nguồn cung cấp</FilterHeader>
              <FilterHeader colKey="frequency">Tần suất</FilterHeader>
              <FilterHeader colKey="note">Ghi chú</FilterHeader>
              <th style={{ textAlign: 'center' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={colSpan} className={s.locEmpty}>Đang tải…</td></tr>
            ) : displayedRows.length === 0 && editingId !== 'new' ? (
              <tr><td colSpan={colSpan} className={s.locEmpty}>Chưa có chứng từ phát sinh. Nhấn “Thêm chứng từ”.</td></tr>
            ) : (
              pageRows.map((r, index) => (
                <tr key={r.id} {...reorder.rowProps(r.id)} className={reorder.dragOverId === r.id ? s.dataTableRowDragOver : ''}>
                    <DragRowCell enabled={canEdit && editingId == null} handleProps={reorder.handleProps(r.id)} />
                    <SelectionRowCell checked={selection.selectedIds.has(r.id)} onToggle={() => selection.toggle(r.id)} />
                    <IndexRowCell index={(safePage - 1) * pageSize + index + 1} />
                    {editableColumns.map((field) => <td key={field}><InlineTableCell value={r[field]} required={field === 'name'} multiline canEdit={canEdit} active={activeCell?.rowId === r.id && activeCell?.colKey === field} onActivate={() => setActiveCell({ rowId: r.id, colKey: field })} onSave={(value) => saveCell(r, field, value)} onNavigate={(direction) => navigateCell(r.id, field, direction)} /></td>)}
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
                <td><InlineTableCell key={`newrow-${rows.length}`} value="" required multiline active={activeCell?.rowId === 'new' && activeCell?.colKey === 'name'} onActivate={() => setActiveCell({ rowId: 'new', colKey: 'name' })} onSave={createFromFirstCell} onNavigate={(direction, result) => navigateCell('new', 'name', direction, result)} /></td>
                <td colSpan={4} />
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {filterPopup && <ColumnFilterDropdown colKey={filterPopup.colKey} filterType="text" allRows={rows} currentFilter={colFilters[filterPopup.colKey] ?? null} sortState={sortState} onSort={(col, dir) => { setSortState(dir ? { col, dir } : { col: null, dir: 'asc' }); setFilterPopup(null) }} onFilterChange={setColumnFilter} onClose={() => setFilterPopup(null)} style={{ '--cfd-top': `${filterPopup.top}px`, '--cfd-left': `${filterPopup.left}px` }} />}
    </div>
  )
}
