import { useCallback, useMemo, useState } from 'react'
import { GripVertical } from 'lucide-react'
import s from './CompactDataTable.module.css'

const defaultGetRowId = (row) => row.id

export function useRowSelection({ rows = [], getRowId = defaultGetRowId } = {}) {
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const rowIds = useMemo(() => rows.map(getRowId), [rows, getRowId])
  const allSelected = rowIds.length > 0 && rowIds.every((id) => selectedIds.has(id))
  const someSelected = rowIds.some((id) => selectedIds.has(id))

  const toggle = useCallback((id) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelectedIds((current) => {
      const next = new Set(current)
      const shouldClear = rowIds.length > 0 && rowIds.every((id) => next.has(id))
      rowIds.forEach((id) => shouldClear ? next.delete(id) : next.add(id))
      return next
    })
  }, [rowIds])

  const clear = useCallback(() => setSelectedIds(new Set()), [])
  const remove = useCallback((ids) => {
    const removing = ids instanceof Set ? ids : new Set(ids)
    setSelectedIds((current) => new Set([...current].filter((id) => !removing.has(id))))
  }, [])

  return {
    selectedIds,
    setSelectedIds,
    selectedCount: selectedIds.size,
    allSelected,
    someSelected,
    toggle,
    toggleAll,
    clear,
    remove,
  }
}

export function useRowReorder({ rows = [], setRows, onPersist, onError, enabled = true, getRowId = defaultGetRowId } = {}) {
  const [draggedId, setDraggedId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)

  const reset = useCallback(() => {
    setDraggedId(null)
    setDragOverId(null)
  }, [])

  const drop = useCallback(async (targetId) => {
    const sourceId = draggedId
    reset()
    if (!enabled || !sourceId || sourceId === targetId) return
    const sourceIndex = rows.findIndex((row) => getRowId(row) === sourceId)
    const targetIndex = rows.findIndex((row) => getRowId(row) === targetId)
    if (sourceIndex < 0 || targetIndex < 0) return

    const previous = rows
    const next = [...rows]
    next.splice(targetIndex, 0, next.splice(sourceIndex, 1)[0])
    setRows?.(next)
    try {
      await onPersist?.(next, previous)
    } catch (error) {
      setRows?.(previous)
      onError?.(error)
    }
  }, [draggedId, enabled, getRowId, onError, onPersist, reset, rows, setRows])

  const rowProps = useCallback((id) => ({
    onDragOver: enabled ? (event) => { event.preventDefault(); setDragOverId(id) } : undefined,
    onDrop: enabled ? () => drop(id) : undefined,
  }), [drop, enabled])

  const handleProps = useCallback((id) => ({
    draggable: true,
    onDragStart: () => setDraggedId(id),
    onDragEnd: reset,
  }), [reset])

  return { draggedId, dragOverId, rowProps, handleProps, reset }
}

export function SelectionHeaderCell({ allSelected, someSelected, onToggle, className = '', title = 'Chọn tất cả trang này' }) {
  return (
    <th className={`${s.selectionCell} ${className}`}>
      <input
        type="checkbox"
        checked={allSelected}
        ref={(element) => { if (element) element.indeterminate = !allSelected && someSelected }}
        onChange={onToggle}
        title={title}
        aria-label={title}
      />
    </th>
  )
}

export function SelectionRowCell({ checked, onToggle, className = '', title = 'Chọn dòng' }) {
  return (
    <td className={`${s.selectionCell} ${className}`} onClick={(event) => event.stopPropagation()}>
      <input type="checkbox" checked={checked} onChange={onToggle} title={title} aria-label={title} />
    </td>
  )
}

export function DragHeaderCell({ className = '' }) {
  return <th className={`${s.dragCell} ${className}`} aria-label="Kéo thứ tự" />
}

export function DragRowCell({ enabled, handleProps, className = '', enabledClassName = '', disabledClassName = '' }) {
  return (
    <td className={`${s.dragCell} ${className}`} onClick={(event) => event.stopPropagation()}>
      <span
        {...(enabled ? handleProps : {})}
        className={`${s.dragHandle} ${enabled ? enabledClassName : `${s.dragHandleDisabled} ${disabledClassName}`}`}
        title={enabled ? 'Kéo để đổi vị trí' : 'Bỏ lọc/sắp xếp để kéo thả hàng'}
      >
        <GripVertical size={14} />
      </span>
    </td>
  )
}

export function IndexHeaderCell({ children = 'STT', className = '' }) {
  return <th className={`${s.indexCell} ${className}`}>{children}</th>
}

export function IndexRowCell({ index, className = '' }) {
  return <td className={`${s.indexCell} ${className}`}>{index}</td>
}

export function BulkActionBar({ count, children, className = '' }) {
  if (!count) return null
  return (
    <div className={`${s.bulkBar} ${className}`}>
      <span className={s.bulkCount}>{count} đã chọn</span>
      <div className={s.bulkActions}>{children}</div>
    </div>
  )
}
