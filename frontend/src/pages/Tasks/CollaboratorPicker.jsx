import { useState, useEffect, useRef } from 'react'
import { Search, ChevronDown, X } from 'lucide-react'
import s from './tasks.module.css'

// Multi-select "Người hỗ trợ" (collaborators). Tái dùng style cp* của tasks.module.css.
//   options   : [{ id, name }]  — danh sách nhân sự
//   value     : string[]        — id người hỗ trợ đang chọn
//   onChange  : (ids) => void
//   excludeId : owner id (assignedTo) — loại khỏi danh sách chọn, owner không phải người hỗ trợ
export default function CollaboratorPicker({ options, value, onChange, excludeId, placeholder = '-- Thêm người hỗ trợ --' }) {
  const [search, setSearch] = useState('')
  const [open,   setOpen]   = useState(false)
  const wrapRef   = useRef(null)
  const searchRef = useRef(null)

  const selectedSet = new Set(value)
  const pool = options.filter((o) => o.id !== excludeId)
  const filtered = search.trim()
    ? pool.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()))
    : pool
  const selectedItems = pool.filter((o) => selectedSet.has(o.id))

  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()
    function onOutside(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  function toggle(id) {
    onChange(selectedSet.has(id) ? value.filter((x) => x !== id) : [...value, id])
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {selectedItems.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
          {selectedItems.map((o) => (
            <span
              key={o.id}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 12,
                       background: 'var(--color-primary-bg)', color: 'var(--color-primary-dark)', fontSize: 12 }}
            >
              {o.name}
              <button
                type="button"
                onClick={() => toggle(o.id)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', padding: 0 }}
                title="Gỡ người hỗ trợ"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className={s.cpTrigger} onClick={() => setOpen((o) => !o)}>
        <span className={s.cpTriggerText} style={{ color: 'var(--color-muted)' }}>
          {value.length ? `${value.length} người hỗ trợ` : placeholder}
        </span>
        <ChevronDown size={12} style={{ flexShrink: 0, color: 'var(--color-muted)', transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
      </div>

      {open && (
        <div className={s.cpDropdown}>
          <div className={s.cpSearch}>
            <Search size={12} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
              placeholder="Tìm nhân viên..."
              className={s.cpSearchInput}
            />
            {search && (
              <button type="button" className={s.cpSearchClear} onClick={() => setSearch('')}><X size={10} /></button>
            )}
          </div>
          <div className={s.cpList}>
            {value.length > 0 && <div className={s.cpItem} onClick={() => onChange([])}>Bỏ chọn tất cả</div>}
            {filtered.map((o) => (
              <label key={o.id} className={`${s.cpItem} ${selectedSet.has(o.id) ? s.cpItemActive : ''} ${s.cpItemMulti}`}>
                <input type="checkbox" checked={selectedSet.has(o.id)} onChange={() => toggle(o.id)} />
                <span>{o.name}</span>
              </label>
            ))}
            {filtered.length === 0 && <div className={s.cpEmpty}>Không tìm thấy &quot;{search}&quot;</div>}
          </div>
        </div>
      )}
    </div>
  )
}
