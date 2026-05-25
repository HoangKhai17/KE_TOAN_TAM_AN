import { useState, useEffect } from 'react'
import { X, Search, Loader2, Check, Plus, Trash2, CheckSquare } from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'
import { listUserOptions } from '../../api/users'
import { listCompanies } from '../../api/companies'
import * as api from '../../api/internalAssignments'
import s from './internalAssignments.module.css'

export default function CreateEditAssignmentModal({ item, onClose, onSaved }) {
  const isEdit   = !!item
  const addToast = useToastStore((st) => st.toast)

  // Form state
  const [title,        setTitle]        = useState(item?.title ?? '')
  const [description,  setDescription]  = useState(item?.description ?? '')
  const [priority,     setPriority]     = useState(item?.priority ?? 'normal')
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

  // Reference data
  const [staffList,   setStaffList]   = useState([])
  const [companies,   setCompanies]   = useState([])
  const [staffSearch, setStaffSearch] = useState('')

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
  function addChecklistRow() {
    setChecklistItems((prev) => [...prev, ''])
  }
  function removeChecklistRow(idx) {
    setChecklistItems((prev) => prev.filter((_, i) => i !== idx))
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
          deadlineDate: deadlineDate || null,
          companyId:    companyId || null,
          assigneeIds,
        })
        // Batch-create checklist items
        const texts = checklistItems.map((t) => t.trim()).filter(Boolean)
        if (texts.length > 0) {
          await Promise.allSettled(texts.map((text) => api.addChecklistItem(result.id, text)))
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

              {/* Priority + Deadline */}
              <div className={s.formRow}>
                <div className={s.formGroup}>
                  <label className={s.formLabel}>Ưu tiên</label>
                  <select className={s.formSelect} value={priority} onChange={(e) => setPriority(e.target.value)}>
                    <option value="low">Thấp</option>
                    <option value="normal">Bình thường</option>
                    <option value="high">Cao</option>
                    <option value="urgent">Khẩn cấp</option>
                  </select>
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
                <select className={s.formSelect} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                  <option value="">Không gắn khách hàng</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
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
                          type="text"
                          className={s.checklistInputField}
                          placeholder={`Công việc ${idx + 1}...`}
                          value={text}
                          onChange={(e) => setChecklistItem(idx, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); addChecklistRow() }
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
                    <button type="button" className={s.checklistAddRowBtn} onClick={addChecklistRow}>
                      <Plus size={11} /> Thêm công việc
                    </button>
                  </div>
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
