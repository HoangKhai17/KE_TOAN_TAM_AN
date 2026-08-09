import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Check, X, Loader2 } from 'lucide-react'
import * as docTypeApi from '../../api/documentTypes'
import { useToastStore } from '../../stores/toastStore'
import { useDeleteConfirm } from '../../components/ui/DeleteConfirmDialog'
import {
  DragHeaderCell, DragRowCell, IndexHeaderCell, IndexRowCell,
  SelectionHeaderCell, SelectionRowCell, useRowReorder, useRowSelection,
} from '../../components/ui/data-table'
import s from './companies.module.css'

function emptyDraft() {
  return { name: '', category: '', frequency: '', source: '', note: '' }
}
function draftFromRow(r) {
  return {
    name: r.name ?? '', category: r.category ?? '', frequency: r.frequency ?? '',
    source: r.source ?? '', note: r.note ?? '',
  }
}

// Hàng nhập liệu ở cấp cao nhất để input không bị remount → giữ focus.
function DocTypeEditRow({ draft, setF, save, cancel, saving }) {
  return (
    <tr className={s.locEditRow}>
      <td /><td /><td />
      <td><input className={s.locInput} value={draft.name} onChange={setF('name')} placeholder="VD: Hóa đơn đầu vào" /></td>
      <td><input className={s.locInput} value={draft.category} onChange={setF('category')} placeholder="VD: Đầu vào" /></td>
      <td><input className={s.locInput} value={draft.frequency} onChange={setF('frequency')} placeholder="VD: Hàng tháng" /></td>
      <td><input className={s.locInput} value={draft.source} onChange={setF('source')} placeholder="VD: Khách gửi" /></td>
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
  const selection = useRowSelection({ rows })
  const reorder = useRowReorder({
    rows, setRows, enabled: canEdit && editingId == null,
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

  function startAdd() { setDraft(emptyDraft()); setEditingId('new') }
  function startEdit(row) { setDraft(draftFromRow(row)); setEditingId(row.id) }
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
      {canEdit && editingId !== 'new' && (
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
              <th>Tên chứng từ</th>
              <th>Phân loại</th>
              <th>Tần suất</th>
              <th>Nguồn cung cấp</th>
              <th>Ghi chú</th>
              <th style={{ textAlign: 'center' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={colSpan} className={s.locEmpty}>Đang tải…</td></tr>
            ) : rows.length === 0 && editingId !== 'new' ? (
              <tr><td colSpan={colSpan} className={s.locEmpty}>Chưa có chứng từ phát sinh. Nhấn “Thêm chứng từ”.</td></tr>
            ) : (
              rows.map((r, index) => (
                editingId === r.id ? <DocTypeEditRow key={r.id} {...editRowProps} /> : (
                  <tr key={r.id} {...reorder.rowProps(r.id)} className={reorder.dragOverId === r.id ? s.dataTableRowDragOver : ''}>
                    <DragRowCell enabled={canEdit && editingId == null} handleProps={reorder.handleProps(r.id)} />
                    <SelectionRowCell checked={selection.selectedIds.has(r.id)} onToggle={() => selection.toggle(r.id)} />
                    <IndexRowCell index={index + 1} />
                    <td title={r.name}>{r.name}</td>
                    <td title={r.category || ''}>{r.category || <span className={s.locMuted}>—</span>}</td>
                    <td title={r.frequency || ''}>{r.frequency || <span className={s.locMuted}>—</span>}</td>
                    <td title={r.source || ''}>{r.source || <span className={s.locMuted}>—</span>}</td>
                    <td title={r.note || ''}>{r.note || <span className={s.locMuted}>—</span>}</td>
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
            {editingId === 'new' && <DocTypeEditRow {...editRowProps} />}
          </tbody>
        </table>
      </div>
    </div>
  )
}
