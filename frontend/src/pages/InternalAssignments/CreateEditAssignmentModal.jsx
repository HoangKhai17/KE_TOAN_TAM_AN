import { useState, useEffect } from 'react'
import { X, Search, Loader2, Check } from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'
import { listUserOptions } from '../../api/users'
import { listCompanies } from '../../api/companies'
import * as api from '../../api/internalAssignments'
import s from './internalAssignments.module.css'

export default function CreateEditAssignmentModal({ item, onClose, onSaved }) {
  const isEdit  = !!item
  const addToast = useToastStore((st) => st.toast)

  // Form state
  const [title,        setTitle]        = useState(item?.title ?? '')
  const [description,  setDescription]  = useState(item?.description ?? '')
  const [priority,     setPriority]     = useState(item?.priority ?? 'normal')
  const [deadlineDate, setDeadlineDate] = useState(item?.deadlineDate ?? '')
  const [companyId,    setCompanyId]    = useState(item?.company?.id ?? '')
  const [assigneeIds,  setAssigneeIds]  = useState(
    isEdit ? [] : (item?.assignees?.map((a) => a.userId) ?? [])
  )

  // For edit mode — track additions and removals
  const [addAssigneeIds,    setAddAssigneeIds]    = useState([])
  const [removeAssigneeIds, setRemoveAssigneeIds] = useState([])

  // Reference data
  const [staffList,  setStaffList]  = useState([])
  const [companies,  setCompanies]  = useState([])
  const [staffSearch, setStaffSearch] = useState('')

  // Saving
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  // Load reference data
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

  // In create mode, assigneeIds is the full list
  // In edit mode, we track add/remove separately
  function isChecked(userId) {
    if (!isEdit) return assigneeIds.includes(userId)
    const existing = item?.assignees?.find((a) => a.userId === userId)
    if (existing) {
      // Currently assigned — shown as checked unless in removeList
      return !removeAssigneeIds.includes(userId)
    }
    // Not currently assigned — shown as checked if in addList
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
      // Toggle removal
      setRemoveAssigneeIds((prev) =>
        prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
      )
    } else {
      // Toggle addition
      setAddAssigneeIds((prev) =>
        prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
      )
    }
  }

  function getSelectedCount() {
    if (!isEdit) return assigneeIds.length
    const currentCount = (item?.assignees?.length ?? 0) - removeAssigneeIds.length
    return currentCount + addAssigneeIds.length
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
        if (title.trim()       !== item.title)        body.title        = title.trim()
        if (description.trim() !== (item.description ?? '')) body.description = description.trim() || null
        if (priority           !== item.priority)     body.priority     = priority
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
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <div className={s.modalHead}>
          <h3 className={s.modalTitle}>
            {isEdit ? 'Chỉnh sửa phiếu' : 'Tạo phiếu giao việc'}
          </h3>
          <button className={s.panelClose} onClick={onClose}><X size={15} /></button>
        </div>

        <div className={s.modalBody}>
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
              <select
                className={s.formSelect}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
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
            <select
              className={s.formSelect}
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              <option value="">Không gắn khách hàng</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Assignees */}
          <div className={s.formGroup}>
            <label className={s.formLabel}>
              Nhân sự thực hiện
              {getSelectedCount() > 0 && (
                <span style={{ marginLeft: 6, color: 'var(--color-primary)', fontWeight: 700 }}>
                  ({getSelectedCount()} đã chọn)
                </span>
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
                ) : (
                  filteredStaff.map((u) => {
                    const checked = isChecked(u.id)
                    const existingAssignee = isEdit
                      ? item?.assignees?.find((a) => a.userId === u.id)
                      : null
                    const isActive = existingAssignee && !['pending', 'rejected'].includes(existingAssignee.status)
                    return (
                      <label
                        key={u.id}
                        className={s.staffPickerItem}
                        style={isActive ? { opacity: 0.6 } : {}}
                        title={isActive ? 'Không thể xóa nhân sự đang thực hiện' : ''}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isActive}
                          onChange={() => !isActive && toggleAssignee(u.id)}
                        />
                        <span className={s.staffPickerName}>{u.name}</span>
                        {checked && <Check size={12} style={{ marginLeft: 'auto', color: 'var(--color-primary)' }} />}
                      </label>
                    )
                  })
                )}
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
