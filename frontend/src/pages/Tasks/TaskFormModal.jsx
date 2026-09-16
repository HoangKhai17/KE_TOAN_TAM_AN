import { useState, useEffect, useRef } from 'react'
import { Info, Search, ChevronDown, ChevronLeft, ChevronRight, X, Plus, Link2, Trash2, GripVertical, Lock, GitBranch } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import DateBox from '../../components/ui/DateBox'
import { SortableList, SortableItem } from '../../components/ui/SortableList'
import { createTask, addTaskChecklistItem, addTaskLink } from '../../api/tasks'
import { listCompanies } from '../../api/companies'
import { listUserOptions } from '../../api/users'
import { listTaskTypes, getTaskType } from '../../api/taskTypes'
import { useAuthStore } from '../../stores/authStore'
import { useEnumsStore } from '../../hooks/useEnums'
import { PRIORITY_LABELS } from './taskUtils'
import CollaboratorPicker from './CollaboratorPicker'
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

export default function TaskFormModal({ onClose, onSaved, onSavedAndOpen, initialCompanyId, lockCompany, parentTask }) {
  const isAdmin = useAuthStore((st) => st.user?.role === 'admin')
  const todayISO = new Date().toISOString().slice(0, 10)
  // Tách việc con: khoá công ty theo cha; con hoàn thành độc lập nên KHÔNG bắt buộc checklist.
  const isSubtask = !!parentTask
  const companyLocked = isSubtask || lockCompany
  const [form, setForm] = useState({
    title: '', companyId: parentTask?.companyId || initialCompanyId || '', taskTypeId: '', assignedToId: '',
    startDate: todayISO, dueDate: '', priority: 'medium', slaDays: '', description: '',
    source: 'manual', collaboratorIds: [], visibility: parentTask?.visibility === 'private' ? 'private' : 'company',
  })
  const [companies, setCompanies] = useState([])
  const [users,     setUsers]     = useState([])
  const [taskTypes, setTaskTypes] = useState([])
  const [typeDetail, setTypeDetail] = useState(null)   // chi tiết loại CV đang chọn (preview checklist + việc con)
  const [typeLoading, setTypeLoading] = useState(false)
  // Chuỗi tạo việc con LIÊN KẾT: sau khi tạo cha, lần lượt hỏi ngày RIÊNG từng việc con.
  // null = đang ở form cha; object = đang nhập việc con thứ index.
  const [childChain, setChildChain] = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [fe,        setFE]        = useState({})
  const [error,     setError]     = useState(null)

  // Checklist
  const [checklistItems, setChecklistItems] = useState([])
  const [newItemText,    setNewItemText]    = useState('')
  const newItemRef = useRef(null)
  // Sửa tại chỗ một bước đã thêm (nhấp vào nội dung để sửa)
  const [editingId, setEditingId] = useState(null)
  const [editText,  setEditText]  = useState('')

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

  // Preview: khi chọn loại công việc → tải checklist + việc con liên kết của mẫu để xem trước.
  useEffect(() => {
    if (!form.taskTypeId) { setTypeDetail(null); setTypeLoading(false); return }
    let cancelled = false
    setTypeLoading(true)
    getTaskType(form.taskTypeId)
      .then((tt) => { if (!cancelled) setTypeDetail(tt) })
      .catch(() => { if (!cancelled) setTypeDetail(null) })
      .finally(() => { if (!cancelled) setTypeLoading(false) })
    return () => { cancelled = true }
  }, [form.taskTypeId])

  const set = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }))

  function addToChecklist() {
    const text = newItemText.trim()
    if (!text) return
    setChecklistItems((prev) => [...prev, { id: Date.now(), text, level: 0 }])
    setNewItemText('')
    setFE((p) => (p.checklist ? { ...p, checklist: undefined } : p))
    newItemRef.current?.focus()
  }

  function removeFromChecklist(id) {
    setChecklistItems((prev) => prev.filter((item) => item.id !== id))
    if (editingId === id) cancelEdit()
  }

  function toggleItemLevel(id) {
    setChecklistItems((prev) => prev.map((item) => item.id === id ? { ...item, level: item.level === 1 ? 0 : 1 } : item))
  }

  // ── Sửa nội dung một bước đã thêm ───────────────────────────────────────────
  function startEdit(item) {
    setEditingId(item.id)
    setEditText(item.text)
  }
  function cancelEdit() {
    setEditingId(null)
    setEditText('')
  }
  function saveEdit() {
    const text = editText.trim()
    if (!text) { cancelEdit(); return }   // để trống → giữ nguyên nội dung cũ
    setChecklistItems((prev) => prev.map((item) => item.id === editingId ? { ...item, text } : item))
    cancelEdit()
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
    if (saving) return   // chặn double-submit (bấm nhanh 2 lần) → tránh tạo trùng
    // Chọn loại CV nhưng mẫu chưa tải xong → chờ (nếu không sẽ không biết có việc con để hỏi ngày).
    if (form.taskTypeId && typeLoading) {
      setError('Đang tải mẫu công việc, vui lòng thử lại sau giây lát…')
      return
    }
    const errs = {}
    if (!form.title.trim()) errs.title = 'Tiêu đề không được để trống'
    if (!form.companyId)    errs.companyId = 'Vui lòng chọn khách hàng'
    if (!form.dueDate)      errs.dueDate = 'Vui lòng nhập ngày hết hạn'
    else if (form.startDate && form.dueDate < form.startDate)
      errs.dueDate = 'Ngày hết hạn không được nhỏ hơn ngày bắt đầu'
    // Bắt buộc phải có checklist: hoặc thêm tay ≥1 bước, hoặc chọn loại công việc có sẵn
    // checklist / việc con liên kết (mẫu). Dùng chi tiết mẫu đã tải (typeDetail) cho chính xác.
    const typeHasStructure = (typeDetail?.checklist?.length ?? 0) > 0 || (typeDetail?.subtaskTemplates?.length ?? 0) > 0
    // Nếu đã chọn loại công việc: coi như mẫu sẽ cung cấp cấu trúc (bỏ bắt buộc). Khi chi tiết
    // đã tải mà mẫu KHÔNG có gì thì mới bắt buộc nhập tay.
    const hasTemplate = !!form.taskTypeId && (typeDetail == null || typeHasStructure)
    if (checklistItems.length === 0 && !hasTemplate && !isSubtask) {
      errs.checklist = 'Công việc phải có ít nhất 1 bước checklist (thêm bên dưới hoặc chọn loại công việc có sẵn checklist).'
    }
    if (Object.keys(errs).length) { setFE(errs); return }
    setError(null); setFE({})

    // Việc con LIÊN KẾT của mẫu (nếu ĐÃ tải được chi tiết mẫu).
    const typeStructureKnown = !form.taskTypeId || typeDetail != null
    const subs = (!isSubtask && form.taskTypeId && typeDetail) ? (typeDetail.subtaskTemplates ?? []) : []

    // CÓ việc con → vào WIZARD nhiều bước. KHÔNG tạo gì ngay: cha + tất cả con chỉ được tạo ở
    // bước cuối (Hoàn tất), nhờ vậy có thể ← quay lại sửa cả việc cha lẫn từng việc con.
    if (subs.length > 0) {
      const drafts = subs.map((sub) => ({
        title: sub.title || '', assignedToId: form.assignedToId || '',
        priority: form.priority, source: form.source || 'manual',
        startDate: form.startDate || '', dueDate: '', skip: false, createdId: null,
      }))
      setChildChain({
        subs, drafts, step: 1, openAfter,
        parentForm: { ...form }, parentChecklist: checklistItems.slice(), parentLinks: linkItems.slice(),
        parentCreated: null,
      })
      loadDraft(drafts[0])
      return
    }

    // KHÔNG có việc con → tạo ngay như cũ.
    setSaving(true)
    try {
      const task = await createTask({ ...buildParentPayload(form), spawnSubtasks: typeStructureKnown ? false : true })
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

  // Payload tạo việc CHA từ 1 snapshot form.
  function buildParentPayload(pf) {
    return {
      title:       pf.title.trim(),
      companyId:   pf.companyId,
      taskTypeId:  pf.taskTypeId   || null,
      assignedTo:  pf.assignedToId || null,
      startDate:   pf.startDate    || null,
      dueDate:     pf.dueDate      || null,
      priority:    pf.priority,
      slaDays:     pf.slaDays ? Number(pf.slaDays) : null,
      description: pf.description.trim() || null,
      source:      pf.source || 'manual',
      collaboratorIds: pf.collaboratorIds.filter((id) => id && id !== pf.assignedToId),
      ...(isAdmin && pf.visibility === 'private' ? { visibility: 'private' } : {}),
      ...(isSubtask ? { parentTaskId: parentTask.id } : {}),
      spawnSubtasks: false,   // wizard tự tạo việc con — tắt tự đẻ ở backend
    }
  }

  // ── WIZARD việc con LIÊN KẾT ────────────────────────────────────────────────
  // step 0 = việc CHA; step 1..N = từng việc con. Chỉ tạo (cha + con) ở bước cuối.
  function loadDraft(d) {
    setForm((p) => ({
      ...p, title: d.title, assignedToId: d.assignedToId,
      priority: d.priority, source: d.source, startDate: d.startDate, dueDate: d.dueDate,
    }))
    setFE({}); setError(null)
  }

  // Khôi phục form về việc CHA (khi ← quay lại từ việc con đầu tiên).
  function restoreParentForm(chain) {
    setForm(chain.parentForm)
    setChecklistItems(chain.parentChecklist)
    setLinkItems(chain.parentLinks)
    setFE({}); setError(null)
  }

  // Tạo CHA (nếu chưa) rồi tạo tất cả việc con chưa tạo. Lỗi giữa chừng → GIỮ phần đã tạo
  // (parentCreated + createdId của con) để bấm lại "Hoàn tất" không nhân đôi.
  async function commitWizard(drafts, chain) {
    setError(null); setFE({}); setSaving(true)
    let parentCreated = chain.parentCreated
    const updated = drafts.slice()
    try {
      // 1) Việc cha (kèm checklist + link) — chỉ tạo 1 lần.
      if (!parentCreated) {
        const parent = await createTask(buildParentPayload(chain.parentForm))
        for (const item of chain.parentChecklist) {
          await addTaskChecklistItem(parent.id, { stepText: item.text, level: item.level ?? 0 })
        }
        await Promise.all(chain.parentLinks.map((l) => addTaskLink(parent.id, { name: l.name, url: l.url })))
        parentCreated = parent
        setChildChain({ ...chain, drafts: updated, parentCreated })
      }
      // 2) Việc con
      for (let i = 0; i < updated.length; i++) {
        const d = updated[i]
        if (d.skip || d.createdId) continue
        if (!d.title.trim() || !d.dueDate) {
          setSaving(false)
          setChildChain({ ...chain, drafts: updated, parentCreated, step: i + 1 })
          loadDraft(updated[i])
          setFE(!d.title.trim() ? { title: 'Tiêu đề không được để trống' } : { dueDate: 'Vui lòng nhập ngày hết hạn' })
          return
        }
        const created = await createTask({
          title: d.title.trim(), companyId: chain.parentForm.companyId, taskTypeId: chain.parentForm.taskTypeId || null,
          parentTaskId: parentCreated.id, subtaskTemplateId: chain.subs[i].id,
          assignedTo: d.assignedToId || null, startDate: d.startDate || null, dueDate: d.dueDate || null,
          priority: d.priority, source: d.source || 'manual', spawnSubtasks: false,
        })
        updated[i] = { ...d, createdId: created.id }
      }
      setSaving(false)
      setChildChain(null)
      if (chain.openAfter) onSavedAndOpen(parentCreated)
      else                 onSaved(parentCreated)
    } catch (err) {
      const errData = err.response?.data?.error
      setError(errData?.message ?? 'Đã xảy ra lỗi, vui lòng thử lại')
      setChildChain({ ...chain, drafts: updated, parentCreated })   // giữ tiến trình đã tạo (tránh nhân đôi khi thử lại)
      setSaving(false)
    }
  }

  // Điều hướng wizard việc con. mode: 'back' | 'skip' | 'next'.
  async function stepChild(mode) {
    if (saving) return
    const chain = childChain
    if (!chain) return
    const idx = chain.step - 1
    const drafts = chain.drafts.slice()
    const cur = {
      ...drafts[idx],
      title: form.title, assignedToId: form.assignedToId,
      priority: form.priority, source: form.source, startDate: form.startDate, dueDate: form.dueDate,
    }

    if (mode === 'back') {
      drafts[idx] = cur
      if (chain.step === 1) {
        const next = { ...chain, drafts, step: 0 }
        setChildChain(next); restoreParentForm(next); return   // về việc cha
      }
      const ns = chain.step - 1
      setChildChain({ ...chain, drafts, step: ns }); loadDraft(drafts[ns - 1]); return
    }

    if (mode === 'skip') {
      cur.skip = true
    } else {
      const errs = {}
      if (!form.title.trim()) errs.title = 'Tiêu đề không được để trống'
      if (!form.dueDate)      errs.dueDate = 'Vui lòng nhập ngày hết hạn'
      else if (form.startDate && form.dueDate < form.startDate)
        errs.dueDate = 'Ngày hết hạn không được nhỏ hơn ngày bắt đầu'
      if (Object.keys(errs).length) { setFE(errs); return }
      cur.skip = false
    }
    drafts[idx] = cur

    if (chain.step < chain.subs.length) {
      const ns = chain.step + 1
      setChildChain({ ...chain, drafts, step: ns }); loadDraft(drafts[ns - 1]); return
    }
    await commitWizard(drafts, chain)   // bước cuối → tạo cha + tất cả con
  }

  // Việc CHA trong wizard bấm "Tiếp →": xác thực, lưu snapshot cha, sang việc con 1.
  function parentNext() {
    if (saving || !childChain) return
    const errs = {}
    if (!form.title.trim()) errs.title = 'Tiêu đề không được để trống'
    if (!form.companyId)    errs.companyId = 'Vui lòng chọn khách hàng'
    if (!form.dueDate)      errs.dueDate = 'Vui lòng nhập ngày hết hạn'
    else if (form.startDate && form.dueDate < form.startDate)
      errs.dueDate = 'Ngày hết hạn không được nhỏ hơn ngày bắt đầu'
    if (Object.keys(errs).length) { setFE(errs); return }
    const next = {
      ...childChain, step: 1,
      parentForm: { ...form }, parentChecklist: checklistItems.slice(), parentLinks: linkItems.slice(),
    }
    setChildChain(next)
    loadDraft(next.drafts[0])
  }

  // Đóng modal. Wizard: chưa tạo gì → huỷ hẳn; đã tạo cha (lỗi giữa chừng) → báo đã tạo để refresh.
  function handleClose() {
    if (childChain) {
      const parent = childChain.parentCreated
      const openAfter = childChain.openAfter
      setChildChain(null)
      if (parent) { if (openAfter) onSavedAndOpen(parent); else onSaved(parent) }
      else onClose()
      return
    }
    onClose()
  }

  const inChildStep = !!childChain && childChain.step >= 1
  const curSub = inChildStep ? childChain.subs[childChain.step - 1] : null

  return (
    <Modal
      title={inChildStep ? 'Việc con liên kết' : (childChain ? 'Công việc cha' : (isSubtask ? 'Tách thành việc con' : 'Tạo công việc mới'))}
      onClose={handleClose}
      width="min(1120px, calc(100vw - 40px))"
      maxWidth="1120px"
    >
      {error && (
        <div className={s.taskFormErrorBox}>
          {error}
        </div>
      )}

      {inChildStep ? (
      <>
        <div
          className={s.taskFormErrorBox}
          style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary-dark)', border: '1px solid var(--color-primary-ring)' }}
        >
          Việc con <strong>{childChain.step}/{childChain.subs.length}</strong> của: <strong>{childChain.parentForm.title}</strong>.
          {' '}Nhập <strong>ngày hết hạn riêng</strong> cho việc con này — mỗi con hoàn thành độc lập, hạn khác nhau là bình thường.
        </div>

        <div className={s.formGrid}>
          {/* Tiêu đề việc con */}
          <div className={`${s.formGroup} ${s.span2}`}>
            <label className={`${s.formLabel} ${s.required}`}>Tiêu đề việc con</label>
            <input
              type="text"
              value={form.title}
              onChange={set('title')}
              className={s.formInput}
              style={fe.title ? { borderColor: '#ef4444' } : {}}
              placeholder="Nhập tiêu đề việc con..."
              autoFocus
            />
            {fe.title && <p className={s.formError}>{fe.title}</p>}
          </div>

          {/* Giao cho */}
          <div className={s.formGroup}>
            <label className={s.formLabel}>Giao cho</label>
            <select
              value={form.assignedToId}
              onChange={(e) => setForm((p) => ({ ...p, assignedToId: e.target.value }))}
              className={s.formSelect}
            >
              <option value="">-- Chưa phân công --</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          {/* Ưu tiên */}
          <div className={s.formGroup}>
            <label className={s.formLabel}>Ưu tiên</label>
            <select value={form.priority} onChange={set('priority')} className={s.formSelect}>
              {(getOptions('task_priority').length > 0
                ? getOptions('task_priority')
                : ['urgent', 'high', 'medium', 'low'].map((k) => ({ key: k, label: PRIORITY_LABELS[k] }))
              ).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>

          {/* Ngày bắt đầu */}
          <div className={s.formGroup}>
            <label className={s.formLabel}>Ngày bắt đầu</label>
            <DateBox block value={form.startDate ?? ''} onChange={(v) => setForm((p) => ({ ...p, startDate: v }))} />
          </div>

          {/* Ngày hết hạn */}
          <div className={s.formGroup}>
            <label className={`${s.formLabel} ${s.required}`}>Ngày hết hạn</label>
            <DateBox
              block
              value={form.dueDate ?? ''}
              onChange={(v) => setForm((p) => ({ ...p, dueDate: v }))}
              min={form.startDate || ''}
              className={fe.dueDate ? s.dbError : ''}
            />
            {fe.dueDate && <p className={s.formError}>{fe.dueDate}</p>}
          </div>

          {/* Checklist việc con (chỉ xem — copy từ mẫu) */}
          {curSub?.steps?.length > 0 && (
            <div className={`${s.formGroup} ${s.span2}`}>
              <label className={s.formLabel}>Checklist việc con ({curSub.steps.length} bước)</label>
              <div style={{ padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-bg-soft, #f8fafc)', maxHeight: 160, overflowY: 'auto' }}>
                {curSub.steps.map((st) => (
                  <div key={st.id} style={{ fontSize: 12, color: 'var(--color-text)', paddingLeft: st.level === 1 ? 16 : 0, lineHeight: 1.7 }}>
                    {st.level === 1 ? '– ' : '• '}{st.stepText}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={s.formFooter}>
          <button onClick={() => stepChild('back')} className={s.btnSecondary} disabled={saving} style={{ marginRight: 'auto' }} title={childChain.step === 1 ? 'Quay lại việc cha' : 'Quay lại việc con trước'}>
            {childChain.step === 1 ? '← Việc cha' : '← Quay lại'}
          </button>
          <button onClick={() => stepChild('skip')} className={s.btnSecondary} disabled={saving} title="Không tạo việc con này">
            Bỏ qua
          </button>
          <button onClick={() => stepChild('next')} className={s.btnPrimary} disabled={saving}>
            {saving && <div className={s.spinner} style={{ width: 13, height: 13, borderWidth: 2, borderTopColor: 'rgba(255,255,255,0.8)', borderColor: 'rgba(255,255,255,0.25)' }} />}
            {childChain.step < childChain.subs.length ? 'Tiếp →' : 'Hoàn tất'}
          </button>
        </div>
      </>
      ) : (
      <>
      {isSubtask && (
        <div
          className={s.taskFormErrorBox}
          style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary-dark)', border: '1px solid var(--color-primary-ring)' }}
        >
          Việc con của: <strong>{parentTask.title}</strong>
          {parentTask.companyName ? ` — ${parentTask.companyName}` : ''}. Việc con hoàn thành độc lập, có ngày hết hạn riêng.
        </div>
      )}

      {childChain && (
        <div
          className={s.taskFormErrorBox}
          style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary-dark)', border: '1px solid var(--color-primary-ring)' }}
        >
          Bước <strong>1/{childChain.subs.length + 1}</strong> — Việc cha. Bấm <strong>Tiếp →</strong> để nhập từng việc con liên kết ({childChain.subs.length} việc). Chưa tạo gì cho tới khi bạn bấm <strong>Hoàn tất</strong>.
        </div>
      )}

      <div className={s.formGrid}>

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
            disabled={companyLocked}
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
          {typeDetail && (typeDetail.checklist?.length > 0 || typeDetail.subtaskTemplates?.length > 0) && (
            <div style={{ marginTop: 8, padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-bg-soft, #f8fafc)', maxHeight: 180, overflowY: 'auto' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-primary-dark)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                <Info size={12} /> Sẽ tự tạo khi lưu:
              </div>
              {typeDetail.checklist?.length > 0 && (
                <div style={{ marginBottom: typeDetail.subtaskTemplates?.length ? 8 : 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', color: 'var(--color-muted)', marginBottom: 3 }}>Checklist ({typeDetail.checklist.length} bước)</div>
                  {typeDetail.checklist.map((c) => (
                    <div key={c.id} style={{ fontSize: 12, color: 'var(--color-text)', paddingLeft: c.level === 1 ? 16 : 0, lineHeight: 1.6 }}>
                      {c.level === 1 ? '– ' : '• '}{c.stepText}
                    </div>
                  ))}
                </div>
              )}
              {typeDetail.subtaskTemplates?.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', color: 'var(--color-muted)', marginBottom: 3 }}>Việc con liên kết ({typeDetail.subtaskTemplates.length})</div>
                  {typeDetail.subtaskTemplates.map((sub) => (
                    <div key={sub.id} style={{ fontSize: 12, color: 'var(--color-text)', lineHeight: 1.7, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <GitBranch size={11} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
                      {sub.title}
                      {sub.steps?.length > 0 && <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>· {sub.steps.length} bước</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Assigned to (owner) */}
        <div className={s.formGroup}>
          <label className={s.formLabel}>Giao cho</label>
          <select
            value={form.assignedToId}
            onChange={(e) => setForm((p) => ({
              ...p,
              assignedToId: e.target.value,
              // Owner không đồng thời là người hỗ trợ → loại khỏi danh sách nếu trùng
              collaboratorIds: p.collaboratorIds.filter((id) => id !== e.target.value),
            }))}
            className={s.formSelect}
          >
            <option value="">-- Chưa phân công --</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>

        {/* Collaborators (người hỗ trợ) */}
        <div className={s.formGroup}>
          <label className={s.formLabel}>Người hỗ trợ</label>
          <CollaboratorPicker
            options={users}
            value={form.collaboratorIds}
            onChange={(ids) => setForm((p) => ({ ...p, collaboratorIds: ids }))}
            excludeId={form.assignedToId}
          />
          <p className={s.taskFormHelper}>
            Đồng nghiệp cùng xem &amp; xử lý công việc này (ngoài người phụ trách chính)
          </p>
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
          <DateBox block value={form.startDate ?? ''} onChange={(v) => setForm((p) => ({ ...p, startDate: v }))} />
        </div>

        {/* Due date */}
        <div className={s.formGroup}>
          <label className={`${s.formLabel} ${s.required}`}>Ngày hết hạn</label>
          <DateBox
            block
            value={form.dueDate ?? ''}
            onChange={(v) => setForm((p) => ({ ...p, dueDate: v }))}
            min={form.startDate || ''}
            className={fe.dueDate ? s.dbError : ''}
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
          <p className={s.taskFormHelper}>
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
            rows={4}
            placeholder="Mô tả chi tiết công việc..."
          />
        </div>

        {/* Riêng tư — admin only */}
        {isAdmin && (
          <div className={`${s.formGroup} ${s.span2}`}>
            <label className={s.fmVisibility}>
              <input
                type="checkbox"
                checked={form.visibility === 'private'}
                onChange={(e) => setForm((p) => ({ ...p, visibility: e.target.checked ? 'private' : 'company' }))}
              />
              <Lock size={13} />
              <span>
                <strong>Riêng tư</strong> — chỉ quản lý xem, ẩn với nhân sự phụ trách công ty
              </span>
            </label>
            <p className={`${s.taskFormHelper} ${s.taskFormVisibilityHint}`}>
              Chỉ admin, người được giao và người hỗ trợ thấy công việc này. Nhân sự quản lý công ty sẽ không thấy.
            </p>
          </div>
        )}

        {/* Checklist */}
        <div className={`${s.formGroup} ${s.span2}`}>
          <label className={`${s.formLabel} ${s.required}`}>
            Checklist công việc
            {checklistItems.length > 0 && (
              <span style={{ fontWeight: 400, color: 'var(--color-muted)', marginLeft: 6 }}>
                ({checklistItems.length} bước)
              </span>
            )}
          </label>
          {fe.checklist && <p className={s.formError} style={{ marginTop: 0 }}>{fe.checklist}</p>}

          {checklistItems.length > 0 && (
            <div className={s.fmClList}>
              <SortableList
                ids={checklistItems.map((i) => i.id)}
                onReorder={(newIds) => setChecklistItems(newIds.map((id) => checklistItems.find((i) => i.id === id)))}
              >
                {checklistItems.map((item, idx) => {
                  const isChild = item.level === 1
                  return (
                  <SortableItem key={item.id} id={item.id}>
                    {({ setNodeRef, style, handleProps }) => (
                    <div ref={setNodeRef} style={style} className={`${s.fmClItem} ${isChild ? s.fmClItemChild : ''}`}>
                      <button type="button" className={s.fmClDrag} title="Kéo để sắp xếp" {...handleProps}>
                        <GripVertical size={12} />
                      </button>
                      <button
                        type="button"
                        className={s.fmClIndent}
                        onClick={() => toggleItemLevel(item.id)}
                        title={isChild ? 'Đưa lên mục chính' : 'Thụt thành mục phụ'}
                      >
                        {isChild ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
                      </button>
                      <span className={s.fmClIdx}>{isChild ? '•' : `${idx + 1}.`}</span>
                      {editingId === item.id ? (
                        <textarea
                          autoFocus
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onBlur={saveEdit}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.altKey && !e.shiftKey) { e.preventDefault(); saveEdit() }
                            if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
                          }}
                          className={s.fmClInput}
                          rows={2}
                          style={{ resize: 'vertical', whiteSpace: 'pre-wrap' }}
                        />
                      ) : (
                        <span
                          className={s.fmClText}
                          style={{ whiteSpace: 'pre-wrap', cursor: 'text' }}
                          onClick={() => startEdit(item)}
                          title="Nhấp để sửa"
                        >
                          {item.text}
                        </span>
                      )}
                      <button
                        type="button"
                        className={s.fmClDel}
                        onClick={() => removeFromChecklist(item.id)}
                        title="Xóa bước này"
                      >
                        <X size={11} />
                      </button>
                    </div>
                    )}
                  </SortableItem>
                  )
                })}
              </SortableList>
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
              <span className={s.taskFormAddLinkText}>Thêm link đính kèm...</span>
            </div>
          )}
        </div>

      </div>

      <div className={s.formFooter}>
        <button onClick={handleClose} className={s.btnSecondary} disabled={saving}>Huỷ</button>
        {childChain ? (
          <button onClick={parentNext} className={s.btnPrimary} disabled={saving}>
            Tiếp → (việc con)
          </button>
        ) : (
          <>
            <button onClick={() => submit(false)} className={s.btnSecondary} disabled={saving}>
              {saving && <div className={s.spinner} style={{ width: 13, height: 13, borderWidth: 2 }} />}
              Tạo
            </button>
            <button onClick={() => submit(true)} className={s.btnPrimary} disabled={saving}>
              {saving && <div className={s.spinner} style={{ width: 13, height: 13, borderWidth: 2, borderTopColor: 'rgba(255,255,255,0.8)', borderColor: 'rgba(255,255,255,0.25)' }} />}
              Tạo và mở
            </button>
          </>
        )}
      </div>
      </>
      )}
    </Modal>
  )
}
