import { useState, useEffect, useRef } from 'react'
import { Info, Search, ChevronDown, ChevronLeft, ChevronRight, X, Plus, Link2, Trash2 } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { createTask, addTaskChecklistItem, addTaskLink } from '../../api/tasks'
import { listCompanies } from '../../api/companies'
import { listUserOptions } from '../../api/users'
import { listTaskTypes } from '../../api/taskTypes'
import { useEnumsStore } from '../../hooks/useEnums'
import { PRIORITY_LABELS } from './taskUtils'
import s from './tasks.module.css'

// ── Searchable company picker ─────────────────────────────────────────────────

function CompanyPicker({ companies, value, onChange, disabled, hasError }) {
  const [search, setSearch] = useState('')
  const [open,   setOpen]   = useState(false)
  const wrapRef   = useRef(null)
  const searchRef = useRef(null)

  const selected = companies.find((c) => c.id === value)
  const filtered = search.trim()
    ? companies.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : companies

  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()
    function onOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  function select(id) {
    onChange(id)
    setOpen(false)
    setSearch('')
  }

  if (disabled) {
    return (
      <div className={s.cpTrigger} style={{ background: '#f8fafc', cursor: 'not-allowed', borderColor: hasError ? '#ef4444' : undefined }}>
        <span className={s.cpTriggerText} style={{ color: 'var(--color-muted)' }}>
          {selected?.name ?? '-- Chọn khách hàng --'}
        </span>
        <ChevronDown size={12} style={{ flexShrink: 0, color: 'var(--color-muted)' }} />
      </div>
    )
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div
        className={s.cpTrigger}
        style={{ borderColor: hasError ? '#ef4444' : undefined }}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={s.cpTriggerText} style={{ color: selected ? 'var(--color-text)' : 'var(--color-muted)' }}>
          {selected?.name ?? '-- Chọn khách hàng --'}
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
              placeholder="Tìm kiếm khách hàng..."
              className={s.cpSearchInput}
            />
            {search && (
              <button type="button" className={s.cpSearchClear} onClick={() => setSearch('')}>
                <X size={10} />
              </button>
            )}
          </div>
          <div className={s.cpList}>
            <div
              className={`${s.cpItem} ${!value ? s.cpItemActive : ''}`}
              onClick={() => select('')}
            >
              — Chọn khách hàng —
            </div>
            {filtered.map((c) => (
              <div
                key={c.id}
                className={`${s.cpItem} ${value === c.id ? s.cpItemActive : ''}`}
                onClick={() => select(c.id)}
              >
                {c.name}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className={s.cpEmpty}>Không tìm thấy &ldquo;{search}&rdquo;</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function TaskFormModal({ onClose, onSaved, onSavedAndOpen, initialCompanyId, lockCompany }) {
  const todayISO = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    title: '', companyId: initialCompanyId || '', taskTypeId: '', assignedToId: '',
    startDate: todayISO, dueDate: '', priority: 'medium', slaDays: '', description: '',
    source: 'manual',
  })
  const [companies, setCompanies] = useState([])
  const [users,     setUsers]     = useState([])
  const [taskTypes, setTaskTypes] = useState([])
  const [saving,    setSaving]    = useState(false)
  const [fe,        setFE]        = useState({})
  const [error,     setError]     = useState(null)

  // Checklist
  const [checklistItems, setChecklistItems] = useState([])
  const [newItemText,    setNewItemText]    = useState('')
  const newItemRef = useRef(null)

  // Links
  const [linkItems,    setLinkItems]    = useState([])
  const [showLinkForm, setShowLinkForm] = useState(false)
  const [linkForm,     setLinkForm]     = useState({ name: '', url: '' })
  const [linkErr,      setLinkErr]      = useState('')

  const getOptions = useEnumsStore((st) => st.getOptions)
  const loadEnums  = useEnumsStore((st) => st.load)

  useEffect(() => {
    listCompanies({ limit: 500, status: 'active' })
      .then(({ companies: c }) => setCompanies(c)).catch(() => {})
    listUserOptions({ status: 'active' })
      .then(({ users: u }) => setUsers(u)).catch(() => {})
    listTaskTypes({ isActive: true, limit: 200 })
      .then(({ taskTypes: t }) => setTaskTypes(t)).catch(() => {})
    loadEnums()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }))

  function addToChecklist() {
    const text = newItemText.trim()
    if (!text) return
    setChecklistItems((prev) => [...prev, { id: Date.now(), text, level: 0 }])
    setNewItemText('')
    newItemRef.current?.focus()
  }

  function removeFromChecklist(id) {
    setChecklistItems((prev) => prev.filter((item) => item.id !== id))
  }

  function toggleItemLevel(id) {
    setChecklistItems((prev) => prev.map((item) => item.id === id ? { ...item, level: item.level === 1 ? 0 : 1 } : item))
  }

  function addLink() {
    if (!linkForm.name.trim()) { setLinkErr('Vui lòng nhập tên tài liệu'); return }
    if (!linkForm.url.trim())  { setLinkErr('Vui lòng nhập URL'); return }
    try { new URL(linkForm.url.trim()) } catch {
      setLinkErr('URL không hợp lệ (cần bắt đầu bằng https://)'); return
    }
    setLinkItems((prev) => [...prev, { id: Date.now(), name: linkForm.name.trim(), url: linkForm.url.trim() }])
    setLinkForm({ name: '', url: '' })
    setLinkErr('')
    setShowLinkForm(false)
  }

  function removeLink(id) {
    setLinkItems((prev) => prev.filter((l) => l.id !== id))
  }

  async function submit(openAfter) {
    const errs = {}
    if (!form.title.trim()) errs.title = 'Tiêu đề không được để trống'
    if (!form.companyId)    errs.companyId = 'Vui lòng chọn khách hàng'
    if (!form.dueDate)      errs.dueDate = 'Vui lòng nhập ngày hết hạn'
    if (Object.keys(errs).length) { setFE(errs); return }
    setError(null); setFE({}); setSaving(true)
    try {
      const task = await createTask({
        title:       form.title.trim(),
        companyId:   form.companyId,
        taskTypeId:  form.taskTypeId   || null,
        assignedTo:  form.assignedToId || null,
        startDate:   form.startDate    || null,
        dueDate:     form.dueDate      || null,
        priority:    form.priority,
        slaDays:     form.slaDays ? Number(form.slaDays) : null,
        description: form.description.trim() || null,
        source:      form.source || 'manual',
      })
      for (const item of checklistItems) {
        await addTaskChecklistItem(task.id, { stepText: item.text, level: item.level ?? 0 })
      }
      await Promise.all(linkItems.map((l) => addTaskLink(task.id, { name: l.name, url: l.url })))
      if (openAfter) onSavedAndOpen(task)
      else           onSaved(task)
    } catch (err) {
      const errData = err.response?.data?.error
      if (err.response?.status === 422 && errData?.details) {
        const fe2 = {}
        for (const d of errData.details) fe2[d.field] = d.message
        setFE(fe2)
      } else {
        setError(errData?.message ?? 'Đã xảy ra lỗi, vui lòng thử lại')
      }
    } finally {
      setSaving(false)
    }
  }

  const selectedType = taskTypes.find((t) => t.id === form.taskTypeId)

  return (
    <Modal title="Tạo công việc mới" onClose={onClose} wide>
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div className={s.formGrid} style={{ gap: 14 }}>

        {/* Title */}
        <div className={`${s.formGroup} ${s.span2}`}>
          <label className={`${s.formLabel} ${s.required}`}>Tiêu đề</label>
          <input
            type="text"
            value={form.title}
            onChange={set('title')}
            className={s.formInput}
            style={fe.title ? { borderColor: '#ef4444' } : {}}
            placeholder="Nhập tiêu đề công việc..."
            autoFocus
          />
          {fe.title && <p className={s.formError}>{fe.title}</p>}
        </div>

        {/* Company — searchable picker */}
        <div className={s.formGroup}>
          <label className={`${s.formLabel} ${s.required}`}>Khách hàng</label>
          <CompanyPicker
            companies={companies}
            value={form.companyId}
            onChange={(id) => setForm((p) => ({ ...p, companyId: id }))}
            disabled={lockCompany}
            hasError={!!fe.companyId}
          />
          {fe.companyId && <p className={s.formError}>{fe.companyId}</p>}
        </div>

        {/* Task type */}
        <div className={s.formGroup}>
          <label className={s.formLabel}>Loại công việc</label>
          <select value={form.taskTypeId} onChange={set('taskTypeId')} className={s.formSelect}>
            <option value="">-- Không có --</option>
            {taskTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {selectedType?.checklistCount > 0 && (
            <p className={s.formHint}>
              <Info size={11} style={{ display: 'inline', verticalAlign: 'middle' }} />
              {' '}{selectedType.checklistCount} bước checklist sẽ được sao chép
            </p>
          )}
        </div>

        {/* Assigned to */}
        <div className={s.formGroup}>
          <label className={s.formLabel}>Giao cho</label>
          <select value={form.assignedToId} onChange={set('assignedToId')} className={s.formSelect}>
            <option value="">-- Chưa phân công --</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>

        {/* Priority */}
        <div className={s.formGroup}>
          <label className={s.formLabel}>Ưu tiên</label>
          <select value={form.priority} onChange={set('priority')} className={s.formSelect}>
            {(getOptions('task_priority').length > 0
              ? getOptions('task_priority')
              : ['urgent', 'high', 'medium', 'low'].map((k) => ({ key: k, label: PRIORITY_LABELS[k] }))
            ).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>

        {/* Source — metadata-driven; 'auto' is reserved for the generator */}
        <div className={s.formGroup}>
          <label className={s.formLabel}>Nguồn công việc</label>
          <select value={form.source} onChange={set('source')} className={s.formSelect}>
            {(() => {
              const opts = getOptions('task_source').filter((o) => o.key !== 'auto')
              return (opts.length > 0 ? opts : [{ key: 'manual', label: 'Thủ công' }])
                .map((o) => <option key={o.key} value={o.key}>{o.label}</option>)
            })()}
          </select>
        </div>

        {/* Start date */}
        <div className={s.formGroup}>
          <label className={s.formLabel}>Ngày bắt đầu</label>
          <input type="date" value={form.startDate} onChange={set('startDate')} className={s.formInput} />
        </div>

        {/* Due date */}
        <div className={s.formGroup}>
          <label className={`${s.formLabel} ${s.required}`}>Ngày hết hạn</label>
          <input
            type="date"
            value={form.dueDate}
            onChange={set('dueDate')}
            className={s.formInput}
            min={form.startDate || undefined}
            style={fe.dueDate ? { borderColor: '#ef4444' } : {}}
          />
          {fe.dueDate && <p className={s.formError}>{fe.dueDate}</p>}
        </div>

        {/* SLA */}
        <div className={s.formGroup}>
          <label className={s.formLabel}>SLA chuẩn (ngày)</label>
          <input
            type="number" min="1" max="365"
            value={form.slaDays}
            onChange={set('slaDays')}
            className={s.formInput}
            placeholder="Ví dụ: 7"
          />
          <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 3 }}>
            Số ngày tối đa để hoàn thành theo chuẩn dịch vụ
          </p>
        </div>

        {/* Description */}
        <div className={`${s.formGroup} ${s.span2}`}>
          <label className={s.formLabel}>Mô tả</label>
          <textarea
            value={form.description}
            onChange={set('description')}
            className={s.formTextarea}
            style={{ height: 96 }}
            placeholder="Mô tả chi tiết công việc..."
          />
        </div>

        {/* Checklist */}
        <div className={`${s.formGroup} ${s.span2}`}>
          <label className={s.formLabel}>
            Checklist công việc
            {checklistItems.length > 0 && (
              <span style={{ fontWeight: 400, color: 'var(--color-muted)', marginLeft: 6 }}>
                ({checklistItems.length} bước)
              </span>
            )}
          </label>

          {checklistItems.length > 0 && (
            <div className={s.fmClList}>
              {checklistItems.map((item, idx) => {
                const isChild = item.level === 1
                return (
                <div key={item.id} className={`${s.fmClItem} ${isChild ? s.fmClItemChild : ''}`}>
                  <button
                    type="button"
                    className={s.fmClIndent}
                    onClick={() => toggleItemLevel(item.id)}
                    title={isChild ? 'Đưa lên mục chính' : 'Thụt thành mục phụ'}
                  >
                    {isChild ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
                  </button>
                  <span className={s.fmClIdx}>{isChild ? '•' : `${idx + 1}.`}</span>
                  <span className={s.fmClText} style={{ whiteSpace: 'pre-wrap' }}>{item.text}</span>
                  <button
                    type="button"
                    className={s.fmClDel}
                    onClick={() => removeFromChecklist(item.id)}
                    title="Xóa bước này"
                  >
                    <X size={11} />
                  </button>
                </div>
                )
              })}
            </div>
          )}

          <div className={s.fmClAdd}>
            <Plus size={12} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
            <textarea
              ref={newItemRef}
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.altKey && !e.shiftKey) { e.preventDefault(); addToChecklist() } }}
              className={s.fmClInput}
              placeholder="Thêm bước công việc… (Enter để thêm · Alt/Shift+Enter xuống dòng)"
              rows={2}
              style={{ resize: 'vertical' }}
            />
            {newItemText.trim() && (
              <button type="button" className={s.fmClAddBtn} onClick={addToChecklist}>
                Thêm
              </button>
            )}
          </div>
        </div>

        {/* Links */}
        <div className={`${s.formGroup} ${s.span2}`}>
          <label className={s.formLabel}>
            <Link2 size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            Link đính kèm
            {linkItems.length > 0 && (
              <span style={{ fontWeight: 400, color: 'var(--color-muted)', marginLeft: 6 }}>
                ({linkItems.length} link)
              </span>
            )}
          </label>

          {linkItems.length > 0 && (
            <div className={s.fmClList}>
              {linkItems.map((link) => (
                <div key={link.id} className={s.fmClItem}>
                  <Link2 size={11} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
                  <div className={s.fmLinkBody}>
                    <span className={s.fmLinkName}>{link.name}</span>
                    <span className={s.fmLinkUrl}>{link.url}</span>
                  </div>
                  <button
                    type="button"
                    className={s.fmClDel}
                    onClick={() => removeLink(link.id)}
                    title="Xóa link"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {showLinkForm ? (
            <div className={s.fmLinkForm}>
              {linkErr && <p className={s.formError} style={{ margin: 0 }}>{linkErr}</p>}
              <input
                type="text"
                value={linkForm.name}
                onChange={(e) => { setLinkForm((p) => ({ ...p, name: e.target.value })); setLinkErr('') }}
                className={s.tlAddInput}
                placeholder="Tên tài liệu *"
                autoFocus
              />
              <input
                type="url"
                value={linkForm.url}
                onChange={(e) => { setLinkForm((p) => ({ ...p, url: e.target.value })); setLinkErr('') }}
                className={s.tlAddInput}
                placeholder="https://drive.google.com/... *"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink() } }}
              />
              <div className={s.tlAddActions}>
                <button
                  type="button"
                  className={`${s.btnSecondary} ${s.btnCompact}`}
                  onClick={() => { setShowLinkForm(false); setLinkErr(''); setLinkForm({ name: '', url: '' }) }}
                >
                  Huỷ
                </button>
                <button type="button" className={`${s.btnPrimary} ${s.btnCompact}`} onClick={addLink}>
                  Thêm link
                </button>
              </div>
            </div>
          ) : (
            <div className={s.fmClAdd} style={{ cursor: 'pointer' }} onClick={() => setShowLinkForm(true)}>
              <Plus size={12} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>Thêm link đính kèm...</span>
            </div>
          )}
        </div>

      </div>

      <div className={s.formFooter}>
        <button onClick={onClose} className={s.btnSecondary} disabled={saving}>Huỷ</button>
        <button onClick={() => submit(false)} className={s.btnSecondary} disabled={saving}>
          {saving && <div className={s.spinner} style={{ width: 13, height: 13, borderWidth: 2 }} />}
          Tạo
        </button>
        <button onClick={() => submit(true)} className={s.btnPrimary} disabled={saving}>
          {saving && <div className={s.spinner} style={{ width: 13, height: 13, borderWidth: 2, borderTopColor: 'rgba(255,255,255,0.8)', borderColor: 'rgba(255,255,255,0.25)' }} />}
          Tạo và mở
        </button>
      </div>
    </Modal>
  )
}
