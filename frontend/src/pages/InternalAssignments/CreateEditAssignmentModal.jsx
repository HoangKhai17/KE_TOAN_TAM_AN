import { useState, useEffect, useRef } from 'react'
import { X, Search, Loader2, Check, Plus, Trash2, CheckSquare, Link2 } from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'
import { useEnumsStore } from '../../hooks/useEnums'
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

  // Checklist items (create mode only — added after assignment is created)
  const [checklistItems, setChecklistItems] = useState([''])
  const checklistInputsRef = useRef([])

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

  // Checklist helpers
  function setChecklistItem(idx, val) {
    setChecklistItems((prev) => prev.map((v, i) => (i === idx ? val : v)))
  }
  function addChecklistRow(focusIdx) {
    setChecklistItems((prev) => [...prev, ''])
    if (focusIdx !== undefined) {
      setTimeout(() => {
        checklistInputsRef.current[focusIdx + 1]?.focus()
      }, 0)
    }
  }
  function removeChecklistRow(idx) {
    setChecklistItems((prev) => prev.filter((_, i) => i !== idx))
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
        // Batch-create checklist items
        const texts = checklistItems.map((t) => t.trim()).filter(Boolean)
        if (texts.length > 0) {
          await Promise.allSettled(texts.map((text) => api.addChecklistItem(result.id, text)))
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
                  <input
                    type="date"
                    className={s.formInput}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className={s.formGroup}>
                  <label className={s.formLabel}>Hạn hoàn thành</label>
                  <input
                    type="date"
                    className={s.formInput}
                    value={deadlineDate}
                    onChange={(e) => setDeadlineDate(e.target.value)}
                    min={new Date().toISOString().slice(0, 10)}
                  />
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

              {/* Checklist items (create mode only) */}
              {!isEdit && (
                <div className={s.formGroup}>
                  <label className={s.formLabel}>
                    <CheckSquare size={12} style={{ display: 'inline', marginRight: 5 }} />
                    Danh sách công việc (tuỳ chọn)
                  </label>
                  <div className={s.checklistInputList}>
                    {checklistItems.map((text, idx) => (
                      <div key={idx} className={s.checklistInputRow}>
                        <span className={s.checklistBullet} />
                        <input
                          ref={(el) => { checklistInputsRef.current[idx] = el }}
                          type="text"
                          className={s.checklistInputField}
                          placeholder={`Công việc ${idx + 1}...`}
                          value={text}
                          onChange={(e) => setChecklistItem(idx, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); addChecklistRow(idx) }
                          }}
                        />
                        {checklistItems.length > 1 && (
                          <button
                            type="button"
                            className={s.checklistRemoveBtn}
                            onClick={() => removeChecklistRow(idx)}
                            tabIndex={-1}
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    ))}
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
