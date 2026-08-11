import { useState, useEffect, useRef } from 'react'
import { X, Search, Loader2, Check, Plus, Trash2, CheckSquare, Link2, GripVertical, ChevronLeft, ChevronRight } from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'
import { useEnumsStore } from '../../hooks/useEnums'
import { SortableList, SortableItem } from '../../components/ui/SortableList'
import DateBox from '../../components/ui/DateBox'
import { listUserOptions } from '../../api/users'
import { listCompanies } from '../../api/companies'
import * as api from '../../api/internalAssignments'
import s from './internalAssignments.module.css'

const PRIORITY_LABELS = { low: 'Thấp', normal: 'Bình thường', high: 'Cao', urgent: 'Khẩn cấp' }

export default function CreateEditAssignmentModal({ item, onClose, onSaved }) {
  const isEdit   = !!item
  const addToast = useToastStore((st) => st.toast)
  const getOptions = useEnumsStore((st) => st.getOptions)

  // Form state
  const [title,        setTitle]        = useState(item?.title ?? '')
  const [description,  setDescription]  = useState(item?.description ?? '')
  const [priority,     setPriority]     = useState(item?.priority ?? 'normal')
  const [startDate,    setStartDate]    = useState(item?.startDate ?? new Date().toISOString().slice(0, 10))
  const [deadlineDate, setDeadlineDate] = useState(item?.deadlineDate ?? '')
  const [companyId,    setCompanyId]    = useState(item?.company?.id ?? '')
  const [assigneeIds,  setAssigneeIds]  = useState(
    !isEdit ? [] : (item?.assignees?.map((a) => a.userId) ?? [])
  )

  // For edit mode — track additions and removals
  const [addAssigneeIds,    setAddAssigneeIds]    = useState([])
  const [removeAssigneeIds, setRemoveAssigneeIds] = useState([])

  // Checklist items (create mode only) — phân cấp cha-con như trang Tasks: [{id,text,level}]
  const [checklistItems, setChecklistItems] = useState([])
  const [newItemText, setNewItemText] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const newItemRef = useRef(null)

  // Link items (create mode only — added after assignment is created)
  const [linkItems,    setLinkItems]    = useState([])
  const [showLinkForm, setShowLinkForm] = useState(false)
  const [linkForm,     setLinkForm]     = useState({ name: '', url: '' })
  const [linkErr,      setLinkErr]      = useState('')

  // Reference data
  const [staffList,      setStaffList]      = useState([])
  const [companies,      setCompanies]      = useState([])
  const [staffSearch,    setStaffSearch]    = useState('')
  const [companySearch,  setCompanySearch]  = useState('')

  // Saving
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    listUserOptions({ status: 'active' })
      .then(({ users }) => setStaffList(users))
      .catch(() => {})
    listCompanies({ limit: 300, status: 'active' })
      .then(({ companies: c }) => setCompanies(c))
      .catch(() => {})
  }, [])

  const filteredStaff = staffSearch.trim()
    ? staffList.filter((u) => u.name.toLowerCase().includes(staffSearch.toLowerCase()))
    : staffList

  const filteredCompanies = companySearch.trim()
    ? companies.filter((c) => c.name.toLowerCase().includes(companySearch.toLowerCase()))
    : companies

  const selectedCompanyName = companies.find((c) => c.id === companyId)?.name ?? null

  const priorityOptions = getOptions('assignment_priority').length > 0
    ? getOptions('assignment_priority')
    : Object.entries(PRIORITY_LABELS).map(([key, label]) => ({ key, label }))

  function isChecked(userId) {
    if (!isEdit) return assigneeIds.includes(userId)
    const existing = item?.assignees?.find((a) => a.userId === userId)
    if (existing) return !removeAssigneeIds.includes(userId)
    return addAssigneeIds.includes(userId)
  }

  function toggleAssignee(userId) {
    if (!isEdit) {
      setAssigneeIds((prev) =>
        prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
      )
      return
    }
    const existing = item?.assignees?.find((a) => a.userId === userId)
    if (existing) {
      setRemoveAssigneeIds((prev) =>
        prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
      )
    } else {
      setAddAssigneeIds((prev) =>
        prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
      )
    }
  }

  function getSelectedCount() {
    if (!isEdit) return assigneeIds.length
    return (item?.assignees?.length ?? 0) - removeAssigneeIds.length + addAssigneeIds.length
  }

  // Checklist helpers — cha/con, kéo thả, xuống dòng (đồng bộ trang Tasks)
  function addToChecklist() {
    const text = newItemText.trim()
    if (!text) return
    setChecklistItems((prev) => [...prev, { id: Date.now(), text, level: 0 }])
    setNewItemText('')
    newItemRef.current?.focus()
  }
  function removeFromChecklist(id) {
    setChecklistItems((prev) => prev.filter((i) => i.id !== id))
    if (editingId === id) cancelEdit()
  }
  function toggleItemLevel(id) {
    setChecklistItems((prev) => prev.map((i) => (i.id === id ? { ...i, level: i.level === 1 ? 0 : 1 } : i)))
  }
  function startEdit(it) { setEditingId(it.id); setEditText(it.text) }
  function cancelEdit() { setEditingId(null); setEditText('') }
  function saveEdit() {
    const text = editText.trim()
    if (!text) { cancelEdit(); return }
    setChecklistItems((prev) => prev.map((i) => (i.id === editingId ? { ...i, text } : i)))
    cancelEdit()
  }

  // Link helpers
  function addLink() {
    if (!linkForm.name.trim()) { setLinkErr('Tên link không được để trống'); return }
    if (!linkForm.url.trim()) { setLinkErr('URL không được để trống'); return }
    try { new URL(linkForm.url) } catch { setLinkErr('URL không hợp lệ'); return }
    setLinkItems((prev) => [...prev, { name: linkForm.name.trim(), url: linkForm.url.trim() }])
    setLinkForm({ name: '', url: '' })
    setLinkErr('')
    setShowLinkForm(false)
  }
  function removeLink(idx) {
    setLinkItems((prev) => prev.filter((_, i) => i !== idx))
  }

  function validate() {
    const errs = {}
    if (!title.trim()) errs.title = 'Tiêu đề không được để trống'
    if (startDate && deadlineDate && deadlineDate < startDate)
      errs.deadlineDate = 'Hạn hoàn thành không được nhỏ hơn ngày bắt đầu'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSaving(true)
    try {
      let result
      if (isEdit) {
        const body = {}
        if (title.trim()       !== item.title)               body.title        = title.trim()
        if (description.trim() !== (item.description ?? '')) body.description  = description.trim() || null
        if (priority           !== item.priority)            body.priority     = priority
        if (startDate          !== (item.startDate ?? ''))   body.startDate    = startDate || null
        if (deadlineDate       !== (item.deadlineDate ?? '')) body.deadlineDate = deadlineDate || null
        if (companyId          !== (item.company?.id ?? '')) body.companyId    = companyId || null
        if (addAssigneeIds.length)    body.addAssigneeIds    = addAssigneeIds
        if (removeAssigneeIds.length) body.removeAssigneeIds = removeAssigneeIds
        result = await api.updateAssignment(item.id, body)
      } else {
        result = await api.createAssignment({
          title:        title.trim(),
          description:  description.trim() || null,
          priority,
          startDate:    startDate || null,
          deadlineDate: deadlineDate || null,
          companyId:    companyId || null,
          assigneeIds,
        })
        // Tạo checklist TUẦN TỰ để giữ đúng thứ tự (position) + cấp cha/con (level)
        for (const it of checklistItems) {
          const text = (it.text ?? '').trim()
          if (text) await api.addChecklistItem(result.id, text, it.level ?? 0)
        }
        // Batch-create link items
        if (linkItems.length > 0) {
          await Promise.allSettled(linkItems.map((l) => api.addLink(result.id, { name: l.name, url: l.url })))
        }
      }
      onSaved(result)
    } catch (err) {
      addToast(err?.response?.data?.error?.message ?? 'Có lỗi xảy ra', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={s.modalOverlay} onClick={onClose}>
      <div className={`${s.modal} ${s.modalLg}`} onClick={(e) => e.stopPropagation()}>
        <div className={s.modalHead}>
          <h3 className={s.modalTitle}>
            {isEdit ? 'Chỉnh sửa phiếu' : 'Tạo phiếu giao việc'}
          </h3>
          <button className={s.panelClose} onClick={onClose}><X size={15} /></button>
        </div>

        <div className={s.modalBody}>
          <div className={s.modalTwoCol}>
            {/* ── LEFT column ── */}
            <div className={s.modalColLeft}>
              {/* Title */}
              <div className={s.formGroup}>
                <label className={s.formLabel}>Tiêu đề *</label>
                <input
                  type="text"
                  className={`${s.formInput} ${errors.title ? s.formInputError : ''}`}
                  placeholder="Nhập tiêu đề phiếu..."
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); setErrors((p) => ({ ...p, title: '' })) }}
                  autoFocus
                />
                {errors.title && <span className={s.formError}>{errors.title}</span>}
              </div>

              {/* Description */}
              <div className={s.formGroup}>
                <label className={s.formLabel}>Mô tả / Nội dung</label>
                <textarea
                  className={s.formTextarea}
                  placeholder="Mô tả chi tiết yêu cầu công việc..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                />
              </div>

              {/* Priority */}
              <div className={s.formGroup}>
                <label className={s.formLabel}>Ưu tiên</label>
                <select className={s.formSelect} value={priority} onChange={(e) => setPriority(e.target.value)}>
                  {priorityOptions.map((o) => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Start date + Deadline */}
              <div className={s.formRow}>
                <div className={s.formGroup}>
                  <label className={s.formLabel}>Ngày bắt đầu</label>
                  <DateBox
                    block
                    value={startDate ?? ''}
                    onChange={(v) => setStartDate(v)}
                  />
                </div>
                <div className={s.formGroup}>
                  <label className={s.formLabel}>Hạn hoàn thành</label>
                  <DateBox
                    block
                    value={deadlineDate ?? ''}
                    onChange={(v) => setDeadlineDate(v)}
                    min={startDate || new Date().toISOString().slice(0, 10)}
                    className={errors.deadlineDate ? s.dbError : ''}
                  />
                  {errors.deadlineDate && <span className={s.formError}>{errors.deadlineDate}</span>}
                </div>
              </div>

              {/* Company */}
              <div className={s.formGroup}>
                <label className={s.formLabel}>Khách hàng (tuỳ chọn)</label>
                {selectedCompanyName && (
                  <div className={s.companySelected}>
                    <span className={s.companySelectedName}>{selectedCompanyName}</span>
                    <button
                      type="button"
                      className={s.companySelectedClear}
                      onClick={() => { setCompanyId(''); setCompanySearch('') }}
                    >×</button>
                  </div>
                )}
                <div className={s.staffPickerWrap} style={{ marginTop: selectedCompanyName ? 6 : 0 }}>
                  <div className={s.staffPickerSearch}>
                    <Search size={13} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
                    <input
                      type="text"
                      className={s.staffPickerSearchInput}
                      placeholder="Tìm khách hàng..."
                      value={companySearch}
                      onChange={(e) => setCompanySearch(e.target.value)}
                    />
                  </div>
                  <div className={s.staffPickerList}>
                    <label
                      className={`${s.staffPickerItem} ${!companyId ? s.companyItemActive : ''}`}
                      onClick={() => setCompanyId('')}
                    >
                      <span className={s.staffPickerName} style={{ color: 'var(--color-muted)', fontStyle: 'italic' }}>
                        Không gắn khách hàng
                      </span>
                      {!companyId && <Check size={12} className={s.staffPickerCheck} />}
                    </label>
                    {filteredCompanies.length === 0 ? (
                      <div className={s.staffPickerEmpty}>Không tìm thấy khách hàng</div>
                    ) : filteredCompanies.map((c) => (
                      <label
                        key={c.id}
                        className={`${s.staffPickerItem} ${companyId === c.id ? s.companyItemActive : ''}`}
                        onClick={() => setCompanyId(c.id)}
                      >
                        <span className={s.staffPickerName}>{c.name}</span>
                        {companyId === c.id && <Check size={12} className={s.staffPickerCheck} />}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Checklist items (create mode only) — cha/con, kéo thả, Alt/Shift+Enter xuống dòng */}
              {!isEdit && (
                <div className={s.formGroup}>
                  <label className={s.formLabel}>
                    <CheckSquare size={12} style={{ display: 'inline', marginRight: 5 }} />
                    Danh sách công việc (tuỳ chọn)
                    {checklistItems.length > 0 && (
                      <span style={{ fontWeight: 400, color: 'var(--color-muted)', marginLeft: 6 }}>({checklistItems.length} bước)</span>
                    )}
                  </label>

                  {checklistItems.length > 0 && (
                    <div className={s.iaClList}>
                      <SortableList
                        ids={checklistItems.map((i) => i.id)}
                        onReorder={(newIds) => setChecklistItems(newIds.map((id) => checklistItems.find((i) => i.id === id)))}
                      >
                        {checklistItems.map((it, idx) => {
                          const isChild = it.level === 1
                          return (
                            <SortableItem key={it.id} id={it.id}>
                              {({ setNodeRef, style, handleProps }) => (
                                <div ref={setNodeRef} style={style} className={`${s.iaClItem} ${isChild ? s.iaClItemChild : ''}`}>
                                  <button type="button" className={s.iaClDrag} title="Kéo để sắp xếp" {...handleProps}>
                                    <GripVertical size={12} />
                                  </button>
                                  <button type="button" className={s.iaClIndent} onClick={() => toggleItemLevel(it.id)}
                                    title={isChild ? 'Đưa lên mục chính' : 'Thụt thành mục phụ'}>
                                    {isChild ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
                                  </button>
                                  <span className={s.iaClIdx}>{isChild ? '•' : `${idx + 1}.`}</span>
                                  {editingId === it.id ? (
                                    <textarea
                                      autoFocus value={editText} rows={2}
                                      className={s.iaClInput} style={{ resize: 'vertical', whiteSpace: 'pre-wrap' }}
                                      onChange={(e) => setEditText(e.target.value)}
                                      onBlur={saveEdit}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.altKey && !e.shiftKey) { e.preventDefault(); saveEdit() }
                                        if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
                                      }}
                                    />
                                  ) : (
                                    <span className={s.iaClText} style={{ whiteSpace: 'pre-wrap', cursor: 'text' }}
                                      onClick={() => startEdit(it)} title="Nhấp để sửa">
                                      {it.text}
                                    </span>
                                  )}
                                  <button type="button" className={s.iaClDel} onClick={() => removeFromChecklist(it.id)} title="Xóa bước này">
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

                  <div className={s.iaClAdd}>
                    <Plus size={12} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
                    <textarea
                      ref={newItemRef} value={newItemText} rows={2}
                      className={s.iaClInput} style={{ resize: 'vertical' }}
                      placeholder="Thêm bước công việc… (Enter để thêm · Alt/Shift+Enter xuống dòng)"
                      onChange={(e) => setNewItemText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.altKey && !e.shiftKey) { e.preventDefault(); addToChecklist() } }}
                    />
                    {newItemText.trim() && (
                      <button type="button" className={s.iaClAddBtn} onClick={addToChecklist}>Thêm</button>
                    )}
                  </div>
                </div>
              )}

              {/* Link items (create mode only) */}
              {!isEdit && (
                <div className={s.formGroup}>
                  <label className={s.formLabel}>
                    <Link2 size={12} style={{ display: 'inline', marginRight: 5 }} />
                    Link tài liệu đính kèm (tuỳ chọn)
                  </label>
                  {linkItems.length > 0 && (
                    <div className={s.checklistInputList} style={{ marginBottom: 6 }}>
                      {linkItems.map((l, idx) => (
                        <div key={idx} className={s.checklistInputRow}>
                          <Link2 size={11} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                          <span style={{ flex: 1, fontSize: 'var(--fs-sm)', color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {l.name}
                            <span style={{ color: 'var(--color-muted)', marginLeft: 6 }}>— {l.url}</span>
                          </span>
                          <button type="button" className={s.checklistRemoveBtn} onClick={() => removeLink(idx)} tabIndex={-1}>
                            <Trash2 size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {showLinkForm ? (
                    <div className={s.iaLinkAddForm}>
                      {linkErr && <div className={s.iaLinkErr}>{linkErr}</div>}
                      <input
                        type="text"
                        className={s.iaLinkInput}
                        placeholder="Tên link (VD: Báo cáo Q1)"
                        value={linkForm.name}
                        onChange={(e) => { setLinkForm((p) => ({ ...p, name: e.target.value })); setLinkErr('') }}
                        autoFocus
                      />
                      <input
                        type="url"
                        className={s.iaLinkInput}
                        placeholder="URL (https://...)"
                        value={linkForm.url}
                        onChange={(e) => { setLinkForm((p) => ({ ...p, url: e.target.value })); setLinkErr('') }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink() } }}
                      />
                      <div className={s.iaLinkAddActions}>
                        <button
                          type="button"
                          className={s.btnSecondary}
                          style={{ height: 30, padding: '0 12px', fontSize: 12 }}
                          onClick={() => { setShowLinkForm(false); setLinkErr('') }}
                        >
                          Huỷ
                        </button>
                        <button
                          type="button"
                          className={s.btnPrimary}
                          style={{ height: 30, padding: '0 12px', fontSize: 12 }}
                          onClick={addLink}
                        >
                          Thêm link
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className={s.checklistAddRowBtn} onClick={() => setShowLinkForm(true)}>
                      <Plus size={11} /> Thêm link
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ── RIGHT column — Assignees ── */}
            <div className={s.modalColRight}>
              <div className={s.formGroup}>
                <label className={s.formLabel}>
                  Nhân sự thực hiện
                  {getSelectedCount() > 0 && (
                    <span className={s.assigneeCountBadge}>{getSelectedCount()} đã chọn</span>
                  )}
                </label>
                <div className={s.staffPickerWrap}>
                  <div className={s.staffPickerSearch}>
                    <Search size={13} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
                    <input
                      type="text"
                      className={s.staffPickerSearchInput}
                      placeholder="Tìm nhân viên..."
                      value={staffSearch}
                      onChange={(e) => setStaffSearch(e.target.value)}
                    />
                  </div>
                  <div className={s.staffPickerList}>
                    {filteredStaff.length === 0 ? (
                      <div className={s.staffPickerEmpty}>Không tìm thấy nhân viên</div>
                    ) : filteredStaff.map((u) => {
                      const checked = isChecked(u.id)
                      const existingAssignee = isEdit ? item?.assignees?.find((a) => a.userId === u.id) : null
                      const isActive = existingAssignee && !['pending', 'rejected'].includes(existingAssignee.status)
                      return (
                        <label
                          key={u.id}
                          className={`${s.staffPickerItem} ${isActive ? s.staffPickerItemDisabled : ''}`}
                          title={isActive ? 'Không thể xóa nhân sự đang thực hiện' : ''}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={isActive}
                            onChange={() => !isActive && toggleAssignee(u.id)}
                          />
                          <span className={s.staffPickerName}>{u.name}</span>
                          {checked && <Check size={12} className={s.staffPickerCheck} />}
                        </label>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={s.modalFooter}>
          <button className={s.btnSecondary} onClick={onClose} disabled={saving}>
            Huỷ
          </button>
          <button className={s.btnPrimary} onClick={handleSubmit} disabled={saving}>
            {saving
              ? <><Loader2 size={13} className={s.spinIcon} /> Đang lưu...</>
              : isEdit ? 'Cập nhật' : 'Tạo phiếu'
            }
          </button>
        </div>
      </div>
    </div>
  )
}
