import { useEffect, useRef, useState } from 'react'
import s from './InlineTableCell.module.css'

export default function InlineTableCell({
  value,
  displayValue,
  emptyValue = '—',
  type = 'text',
  options = [],
  canEdit = true,
  required = false,
  multiline = false,
  onSave,
  active,
  onActivate,
  onNavigate,
}) {
  const [internalEditing, setInternalEditing] = useState(false)
  const editing = active ?? internalEditing
  const [draft, setDraft] = useState(value ?? '')
  const inputRef = useRef(null)
  const savingRef = useRef(false)

  useEffect(() => { if (!editing) setDraft(value ?? '') }, [value, editing])
  useEffect(() => {
    if (!editing) return
    const input = inputRef.current
    input?.focus()
    if (input && typeof input.setSelectionRange === 'function') {
      const end = String(input.value ?? '').length
      input.setSelectionRange(end, end)
      input.scrollTop = input.scrollHeight
    }
  }, [editing])

  function closeEditor() {
    if (active === undefined) setInternalEditing(false)
  }

  async function commit(nextValue = draft, direction = 'cancel') {
    if (savingRef.current) return
    const normalized = typeof nextValue === 'string' ? nextValue.trim() : nextValue
    if (required && !normalized) { setDraft(value ?? ''); closeEditor(); onNavigate?.('cancel'); return }
    if (normalized === (value ?? '')) { closeEditor(); onNavigate?.(direction); return }
    savingRef.current = true
    try {
      const result = await onSave(normalized)
      onNavigate?.(direction, result)
    }
    catch { setDraft(value ?? '') }
    finally { savingRef.current = false; closeEditor() }
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') { setDraft(value ?? ''); closeEditor(); onNavigate?.('cancel') }
    if (event.key === 'Enter' && (!multiline || (!event.shiftKey && !event.altKey))) {
      event.preventDefault()
      commit(draft, 'down')
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      commit(draft, event.shiftKey ? 'prev' : 'next')
    }
  }

  if (editing && type === 'select') {
    return (
      <select ref={inputRef} className={s.editor} value={draft} onChange={(event) => { setDraft(event.target.value); commit(event.target.value, 'next') }} onBlur={() => { closeEditor(); onNavigate?.('cancel') }}>
        {options.map((option) => <option key={option.key ?? option.value} value={option.key ?? option.value}>{option.label}</option>)}
      </select>
    )
  }

  if (editing) {
    const Editor = multiline ? 'textarea' : 'input'
    return <Editor ref={inputRef} className={`${s.editor} ${multiline ? s.textarea : ''}`} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleKeyDown} onBlur={() => commit(draft, 'cancel')} rows={multiline ? 2 : undefined} />
  }

  return (
    <div className={`${s.value} ${canEdit ? s.editable : ''}`} onClick={() => { if (!canEdit) return; onActivate?.(); if (active === undefined) setInternalEditing(true) }} title={canEdit ? 'Nhấp để chỉnh sửa' : undefined}>
      {displayValue ?? (value || <span className={s.empty}>{emptyValue}</span>)}
    </div>
  )
}
