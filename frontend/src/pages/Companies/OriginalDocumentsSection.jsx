import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react'
import { Plus, Trash2, Check, X, Loader2, Filter, Pencil } from 'lucide-react'
import * as origDocApi from '../../api/originalDocuments'
import { useToastStore } from '../../stores/toastStore'
import { useDeleteConfirm } from '../../components/ui/DeleteConfirmDialog'
import Modal from '../../components/ui/Modal'
import InlineTableCell from '../../components/ui/InlineTableCell'
import ColumnFilterDropdown from '../../components/ui/ColumnFilterDropdown'
import ClampedRichText from '../../components/ui/ClampedRichText'
import RichTextViewerModal from '../../components/ui/RichTextViewerModal'
import {
  DragHeaderCell, DragRowCell, IndexHeaderCell, IndexRowCell,
  SelectionHeaderCell, SelectionRowCell, useRowReorder, useRowSelection,
} from '../../components/ui/data-table'
import { useCompanyFooter } from './companyFooter'
import s from './companies.module.css'

// Editor nặng (TipTap) chỉ tải khi mở modal sửa Ghi chú
const RichTextEditor = lazy(() => import('../../components/ui/RichTextEditor'))

function isHtmlEmpty(html) {
  if (!html) return true
  return !html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

// ── Modal sửa Ghi chú (rich-text) cho 1 hồ sơ ──────────────────────────────────
function NoteEditModal({ companyId, row, onSave, onClose }) {
  const [html, setHtml]     = useState(row.note || '')
  const [saving, setSaving] = useState(false)
  async function handleSave() {
    setSaving(true)
    try { await onSave(html) } catch { /* toasted */ } finally { setSaving(false) }
  }
  return (
    <Modal title={`Ghi chú — ${row.name}`} onClose={onClose} wide>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(88vh - 216px)', minHeight: 300,
          border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          <Suspense fallback={<div style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-muted)' }}><Loader2 size={16} className={s.spin} /> Đang tải trình soạn thảo…</div>}>
            <RichTextEditor
              value={html} onChange={setHtml} editable companyId={companyId}
              autoFocus minHeight={200} className="rte-fill"
              placeholder="Nhập ghi chú cho hồ sơ này… (dán được ảnh, bảng, hoặc Markdown)"
            />
          </Suspense>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className={s.btnOutline} onClick={onClose} disabled={saving}>Huỷ</button>
          <button className={s.btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={13} className={s.spin} /> : <Check size={13} />} Lưu
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function OriginalDocumentsSection({ companyId, canEdit = true }) {
  const confirmDelete = useDeleteConfirm()
  const addToast = useToastStore((st) => st.toast)

  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [activeCell, setActiveCell] = useState(null)
  const [noteEdit, setNoteEdit] = useState(null)   // hồ sơ đang sửa ghi chú
  const [noteView, setNoteView] = useState(null)   // hồ sơ đang xem đầy đủ ghi chú
  const [colFilters, setColFilters] = useState({})
  const [sortState, setSortState] = useState({ col: null, dir: 'asc' })
  const [filterPopup, setFilterPopup] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const displayedRows = useMemo(() => {
    let result = [...rows]
    for (const [key, value] of Object.entries(colFilters)) {
      if (typeof value === 'string' && value.trim()) {
        const query = value.trim().toLocaleLowerCase('vi')
        result = result.filter((row) => String(row[key] ?? '').toLocaleLowerCase('vi').includes(query))
      }
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
    page: safePage, pageSize, totalPages: docTotalPages, itemLabel: 'hồ sơ',
    onPageChange: setPage, onPageSizeChange: setPageSize,
  })

  const selection = useRowSelection({ rows: displayedRows })
  const reorder = useRowReorder({
    rows, setRows, enabled: canEdit && activeCell == null && Object.keys(colFilters).length === 0 && !sortState.col && docTotalPages === 1,
    onError: () => addToast('Không thể lưu thứ tự hồ sơ', 'error'),
    onPersist: (ordered, previous) => Promise.all(ordered
      .map((row, index) => ({ row, index }))
      .filter(({ row, index }) => previous[index]?.id !== row.id)
      .map(({ row, index }) => origDocApi.updateOriginalDocument(companyId, row.id, { sortOrder: index }))),
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await origDocApi.listOriginalDocuments(companyId))
    } catch {
      addToast('Không tải được danh sách hồ sơ', 'error')
    } finally {
      setLoading(false)
    }
  }, [companyId, addToast])

  useEffect(() => { load() }, [load])

  function startAdd() { setActiveCell({ rowId: 'new', colKey: 'name' }) }

  async function saveCell(row, field, value) {
    try {
      const updated = await origDocApi.updateOriginalDocument(companyId, row.id, { [field]: value || null })
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, ...updated, [field]: value || null } : item))
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không lưu được thay đổi', 'error')
      throw err
    }
  }

  async function createFromFirstCell(value) {
    if (!value?.trim()) return null
    try {
      const created = await origDocApi.createOriginalDocument(companyId, { name: value.trim() })
      setRows((current) => [...current, created])
      addToast('Đã thêm hồ sơ', 'success')
      return { rowId: created.id }
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thêm được hồ sơ', 'error')
      throw err
    }
  }

  async function saveNote(row, html) {
    try {
      const body = { note: isHtmlEmpty(html) ? null : html }
      const updated = await origDocApi.updateOriginalDocument(companyId, row.id, body)
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, ...updated, note: body.note } : item))
      setNoteEdit(null)
      addToast('Đã lưu ghi chú', 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không lưu được ghi chú', 'error')
      throw err
    }
  }

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
  // Điều hướng ô Tên (chỉ còn cột này inline). Enter/Tab → dòng kế; dòng cuối → dòng nhập mới.
  function navigateCell(rowId, direction, result) {
    if (direction === 'cancel') { setActiveCell(null); return }
    const actualRowId = result?.rowId ?? rowId
    const rowIndex = rows.findIndex((row) => row.id === actualRowId)
    if (direction === 'prev') {
      const previousRow = rows[rowIndex - 1]
      return setActiveCell(previousRow ? { rowId: previousRow.id, colKey: 'name' } : null)
    }
    // next / down
    if (result?.rowId) return setActiveCell({ rowId: 'new', colKey: 'name' })
    const nextRow = rows[rowIndex + 1]
    setActiveCell(nextRow ? { rowId: nextRow.id, colKey: 'name' } : { rowId: 'new', colKey: 'name' })
  }

  async function remove(row) {
    if (!(await confirmDelete({ title: 'Xóa hồ sơ', message: <>Bạn có chắc chắn muốn xóa hồ sơ <strong>“{row.name}”</strong>?</> }))) return
    try {
      await origDocApi.deleteOriginalDocument(companyId, row.id)
      addToast('Đã xoá hồ sơ', 'success')
      await load()
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không xoá được hồ sơ', 'error')
    }
  }

  async function removeSelected() {
    if (!selection.selectedCount || !(await confirmDelete({ title: 'Xóa hồ sơ', message: <>Bạn có chắc chắn muốn xóa <strong>{selection.selectedCount}</strong> hồ sơ đã chọn?</>, confirmLabel: `Xóa ${selection.selectedCount} mục` }))) return
    const ids = [...selection.selectedIds]
    const results = await Promise.allSettled(ids.map((id) => origDocApi.deleteOriginalDocument(companyId, id)))
    const deleted = new Set(ids.filter((_, index) => results[index].status === 'fulfilled'))
    setRows((current) => current.filter((row) => !deleted.has(row.id)))
    selection.remove(deleted)
    addToast(`Đã xoá ${deleted.size}/${ids.length} hồ sơ`, deleted.size ? 'success' : 'error')
  }

  const colSpan = 6

  return (
    <div>
      {canEdit && (
        <div className={s.procSectionBar}>
          {selection.selectedCount > 0 && <button className={`${s.btnDanger} ${s.dataTableBulkDelete}`} onClick={removeSelected}><Trash2 size={13} /> Xoá {selection.selectedCount} dòng</button>}
          <button className={s.credAddBtn} onClick={startAdd}><Plus size={13} /> Thêm hồ sơ</button>
        </div>
      )}
      <div className={s.credTableWrap}>
        <table className={s.credTable}>
          <colgroup>
            <col className={s.dataTableColDrag} /><col className={s.dataTableColSelect} /><col className={s.dataTableColIndex} />
            <col style={{ width: '34%' }} />
            <col style={{ width: '58%' }} />
            <col style={{ width: '8%' }} />
          </colgroup>
          <thead>
            <tr>
              <DragHeaderCell />
              <SelectionHeaderCell allSelected={selection.allSelected} someSelected={selection.someSelected} onToggle={selection.toggleAll} />
              <IndexHeaderCell />
              <FilterHeader colKey="name">Tên hồ sơ</FilterHeader>
              <th><div className={s.hdldThInner}><span className={s.hdldThLabel}>Ghi chú</span></div></th>
              <th style={{ textAlign: 'center' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={colSpan} className={s.locEmpty}>Đang tải…</td></tr>
            ) : displayedRows.length === 0 && activeCell?.rowId !== 'new' ? (
              <tr><td colSpan={colSpan} className={s.locEmpty}>Chưa có hồ sơ gốc. Nhấn “Thêm hồ sơ”.</td></tr>
            ) : (
              pageRows.map((r, index) => (
                <tr key={r.id} {...reorder.rowProps(r.id)} className={reorder.dragOverId === r.id ? s.dataTableRowDragOver : ''}>
                  <DragRowCell enabled={canEdit && activeCell == null} handleProps={reorder.handleProps(r.id)} />
                  <SelectionRowCell checked={selection.selectedIds.has(r.id)} onToggle={() => selection.toggle(r.id)} />
                  <IndexRowCell index={(safePage - 1) * pageSize + index + 1} />
                  <td><InlineTableCell value={r.name} required multiline canEdit={canEdit} active={activeCell?.rowId === r.id && activeCell?.colKey === 'name'} onActivate={() => setActiveCell({ rowId: r.id, colKey: 'name' })} onSave={(value) => saveCell(r, 'name', value)} onNavigate={(direction) => navigateCell(r.id, direction)} /></td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {isHtmlEmpty(r.note)
                          ? <span style={{ color: 'var(--color-muted)' }}>—</span>
                          : <ClampedRichText html={r.note} maxHeight={96} onExpand={() => setNoteView(r)} />}
                      </div>
                      {canEdit && (
                        <button className={`${s.iconBtnSm}`} onClick={() => setNoteEdit(r)} title="Sửa ghi chú" style={{ flexShrink: 0 }}><Pencil size={13} /></button>
                      )}
                    </div>
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
                <td><InlineTableCell key={`newrow-${rows.length}`} value="" required multiline active={activeCell?.rowId === 'new' && activeCell?.colKey === 'name'} onActivate={() => setActiveCell({ rowId: 'new', colKey: 'name' })} onSave={createFromFirstCell} onNavigate={(direction, result) => navigateCell('new', direction, result)} /></td>
                <td colSpan={2} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {filterPopup && <ColumnFilterDropdown colKey={filterPopup.colKey} filterType="text" allRows={rows} currentFilter={colFilters[filterPopup.colKey] ?? null} sortState={sortState} onSort={(col, dir) => { setSortState({ col, dir }); setFilterPopup(null) }} onFilterChange={setColumnFilter} onClose={() => setFilterPopup(null)} style={{ '--cfd-top': `${filterPopup.top}px`, '--cfd-left': `${filterPopup.left}px` }} />}
      {noteEdit && <NoteEditModal companyId={companyId} row={noteEdit} onSave={(html) => saveNote(noteEdit, html)} onClose={() => setNoteEdit(null)} />}
      {noteView && (
        <RichTextViewerModal
          title={`Ghi chú — ${noteView.name}`}
          html={noteView.note}
          onEdit={canEdit ? () => { const row = noteView; setNoteView(null); setNoteEdit(row) } : undefined}
          onClose={() => setNoteView(null)}
        />
      )}
    </div>
  )
}
