import { useState, useEffect, useRef } from 'react'
import {
  Building2, UserPlus, Loader2, Users, SlidersHorizontal, Pencil,
  Plus, Trash2, Check, X,
} from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { useToastStore } from '../../stores/toastStore'
import * as companiesApi from '../../api/companies'
import * as usersApi from '../../api/users'
import { BUSINESS_TYPE_LABELS } from './Companies'
import CompanyLocationsCard from './CompanyLocationsCard'
import { useEnumsStore } from '../../hooks/useEnums'
import { fmtDate } from './companyUtils'
import s from './companies.module.css'

// ── Helpers (chỉ tab Tổng quan dùng) ───────────────────────────────────────────

function staffAvatarSrc(staff) {
  if (staff?.avatarUrl) return staff.avatarUrl
  const encoded = encodeURIComponent(staff?.name || '?')
  return `https://ui-avatars.com/api/?name=${encoded}&size=88&background=e2e8f0&color=64748b&bold=true&font-size=0.4`
}

const FALLBACK_AVATAR = `https://ui-avatars.com/api/?name=&size=88&background=e2e8f0&color=94a3b8`

// ── EditableField: hiển thị + sửa TẠI CHỖ (click → input → lưu, không popup) ──────
// Định nghĩa ở cấp cao nhất (không lồng) để input không mất focus khi gõ.
function EditableField({ companyId, field, value, label, type = 'text', options = [], canEdit, onSaved, fullWidth }) {
  const addToast = useToastStore((st) => st.toast)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState('')
  const [saving, setSaving]   = useState(false)
  const inputRef  = useRef(null)
  const dateRef   = useRef(null)
  const cancelRef = useRef(false)

  function begin() {
    if (!canEdit || saving) return
    setDraft(type === 'date' ? (value ? String(value).slice(0, 10) : '') : (value ?? ''))
    cancelRef.current = false
    setEditing(true)
    setTimeout(() => {
      const editor = inputRef.current
      if (!editor) return
      editor.focus()
      if ((type === 'text' || type === 'textarea' || type === 'tel' || type === 'email') && editor.setSelectionRange) {
        const end = String(editor.value ?? '').length
        editor.setSelectionRange(end, end)
      }
      if (type === 'textarea') {
        editor.style.height = '0px'
        editor.style.height = `${editor.scrollHeight}px`
        editor.scrollTop = editor.scrollHeight
      }
    }, 20)
  }

  async function commit(override) {
    if (cancelRef.current) { cancelRef.current = false; setEditing(false); return }
    const raw = override !== undefined ? override : draft
    const newVal = (typeof raw === 'string' ? raw.trim() : raw) || null
    if ((value ?? null) === newVal) { setEditing(false); return }
    setSaving(true)
    try {
      const updated = await companiesApi.updateCompany(companyId, { [field]: newVal })
      onSaved?.(updated)
      setEditing(false)
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không lưu được thay đổi', 'error')
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && type !== 'textarea') { e.preventDefault(); inputRef.current?.blur() }
    else if (e.key === 'Escape') { cancelRef.current = true; inputRef.current?.blur() }
  }

  // Ngày: hiển thị CHỮ TRƠN dd/mm/yyyy như các field khác (không viền). Bấm mới mở
  // lịch native (ẩn) → chọn xong lưu ngay. Tránh input native lộ mm/dd/yyyy.
  if (type === 'date') {
    const display = value ? fmtDate(value) : null
    return (
      <div className={`${s.editRow} ${fullWidth ? s.infoGridFull : ''}`}>
        <div className={s.infoLabel}>{label}</div>
        <div
          className={`${s.editValue} ${canEdit ? s.editValueOn : ''} ${display ? '' : s.editValueEmpty}`}
          onClick={() => canEdit && dateRef.current?.showPicker?.()}
          title={canEdit ? 'Nhấp để chọn ngày' : undefined}
        >
          <span className={s.editValueText}>{display || '—'}</span>
          {canEdit && !saving && <Pencil size={11} className={s.editPencil} />}
          {saving && <Loader2 size={12} className={s.spin} />}
          {canEdit && (
            <input
              ref={dateRef}
              type="date"
              value={value ? String(value).slice(0, 10) : ''}
              onChange={(e) => commit(e.target.value)}
              style={{ position: 'absolute', left: 0, bottom: 0, width: 0, height: 0, opacity: 0, pointerEvents: 'none', border: 0, padding: 0 }}
              tabIndex={-1}
              aria-hidden="true"
            />
          )}
        </div>
      </div>
    )
  }

  if (!editing) {
    let display = value
    if (type === 'select') display = options.find((o) => o.value === value)?.label ?? value
    else if (type === 'date') display = value ? fmtDate(value) : null
    return (
      <div className={`${s.editRow} ${fullWidth ? s.infoGridFull : ''}`}>
        <div className={s.infoLabel}>{label}</div>
        <div
          className={`${s.editValue} ${field === 'name' ? s.editValuePrimary : ''} ${type === 'textarea' ? s.editValueMultiline : ''} ${canEdit ? s.editValueOn : ''} ${display ? '' : s.editValueEmpty}`}
          onClick={begin}
          title={canEdit ? 'Nhấp để sửa' : undefined}
        >
          <span className={s.editValueText}>{display || '—'}</span>
          {canEdit && <Pencil size={11} className={s.editPencil} />}
        </div>
      </div>
    )
  }

  const common = { ref: inputRef, className: s.editInput, value: draft, disabled: saving, onKeyDown }
  return (
    <div className={`${s.editRow} ${fullWidth ? s.infoGridFull : ''}`}>
      <div className={s.infoLabel}>{label}</div>
      <div className={s.editInputWrap}>
        {type === 'select' ? (
          <select {...common}
            onChange={(e) => { setDraft(e.target.value); commit(e.target.value) }}
            onBlur={() => { if (!saving) setEditing(false) }}
          >
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : type === 'textarea' ? (
          <textarea {...common} rows={1} wrap="soft"
            onChange={(e) => {
              setDraft(e.target.value)
              e.target.style.height = '0px'
              e.target.style.height = `${e.target.scrollHeight}px`
            }}
            onBlur={() => commit()} />
        ) : (
          <input {...common}
            type={type === 'date' ? 'date' : type === 'tel' ? 'tel' : type === 'email' ? 'email' : 'text'}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit()}
          />
        )}
        {saving && <Loader2 size={13} className={s.spin} />}
      </div>
    </div>
  )
}

// ── OverviewTab ────────────────────────────────────────────────────────────────

function OverviewTab({ company, canEdit, onCompanyUpdated }) {
  // Một cột full-width: các section trải hết bề ngang layout
  return (
    <div className={s.overviewSingle}>
      <CustomerInfoCard company={company} canEdit={canEdit} onSaved={onCompanyUpdated} />
      <CompanyLocationsCard companyId={company.id} />
      <CustomFieldsCard company={company} canEdit={canEdit} onSaved={onCompanyUpdated} />
    </div>
  )
}

// ── CustomerInfoCard: 3 cột, mọi trường sửa inline ───────────────────────────────

function CustomerInfoCard({ company, canEdit, onSaved }) {
  const getOptions = useEnumsStore((st) => st.getOptions)
  const btOptions = getOptions('business_type').length > 0
    ? getOptions('business_type').map((o) => ({ value: o.key, label: o.label }))
    : Object.entries(BUSINESS_TYPE_LABELS).map(([value, label]) => ({ value, label }))
  const common = { companyId: company.id, canEdit, onSaved }

  return (
    <div className={s.infoCard}>
      <div className={s.infoCardHeader}>
        <div className={s.infoCardTitle}>
          <div className={`${s.infoCardTitleIcon} ${s.infoCardIconBlue}`}>
            <Building2 size={14} />
          </div>
          Thông tin khách hàng
        </div>
      </div>
      <div className={s.infoCardBody}>
        <div className={s.customerCols}>
          {/* Cột 1 — Thông tin khách hàng & hợp đồng */}
          <div className={s.customerCol}>
            <div className={s.customerColTitle}>Thông tin khách hàng &amp; hợp đồng</div>
            <EditableField {...common} field="name"         label="Tên công ty"  value={company.name} />
            <EditableField {...common} field="shortName"    label="Tên viết tắt" value={company.shortName} />
            <EditableField {...common} field="taxCode"      label="Mã số thuế"   value={company.taxCode} />
            <EditableField {...common} field="businessType" label="Loại hình"    value={company.businessType} type="select" options={btOptions} />
            <EditableField {...common} field="industry"     label="Ngành nghề"   value={company.industry} />
            <EditableField {...common} field="serviceStartDate" label="Ngày bắt đầu HĐ" value={company.serviceStartDate} type="date" />
          </div>

          {/* Cột 2 — Đại diện pháp lý, người liên hệ & ghi chú */}
          <div className={s.customerCol}>
            <div className={s.customerColTitle}>Đại diện pháp lý &amp; người liên hệ</div>
            <EditableField {...common} field="legalRepName"  label="Họ tên đại diện pháp lý" value={company.legalRepName} />
            <EditableField {...common} field="legalRepPhone" label="ĐT đại diện"            value={company.legalRepPhone} type="tel" />
            <EditableField {...common} field="contactName"   label="Họ tên liên hệ"         value={company.contactName} />
            <EditableField {...common} field="contactPhone"  label="ĐT liên hệ"             value={company.contactPhone} type="tel" />
            <EditableField {...common} field="contactEmail"  label="Email liên hệ"          value={company.contactEmail} type="email" />
            <EditableField {...common} field="notes"            label="Ghi chú"         value={company.notes} type="textarea" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── CustomFieldsCard ───────────────────────────────────────────────────────────

// Hàng nhập liệu cho trường bổ sung — cấp cao nhất để không mất focus khi gõ
function CustomFieldEditRow({ draft, setF, save, cancel, saving }) {
  return (
    <tr className={s.locEditRow}>
      <td><input className={s.locInput} value={draft.name} onChange={setF('name')} placeholder="Tên trường" /></td>
      <td><input className={s.locInput} value={draft.value} onChange={setF('value')} placeholder="Nội dung" /></td>
      <td className={s.locCenter}>
        <div className={s.locRowActions}>
          <button className={s.locBtnSave} onClick={save} disabled={saving} title="Lưu">
            {saving ? <Loader2 size={13} className={s.spin} /> : <Check size={13} />}
          </button>
          <button className={s.locBtnCancel} onClick={cancel} disabled={saving} title="Huỷ"><X size={13} /></button>
        </div>
      </td>
    </tr>
  )
}

function CustomFieldsCard({ company, canEdit, onSaved }) {
  const addToast = useToastStore((st) => st.toast)
  const fields = company.customFields ?? []
  const [editing, setEditing] = useState(null)   // null | 'new' | <index>
  const [draft, setDraft]     = useState({ name: '', value: '' })
  const [saving, setSaving]   = useState(false)

  const setF = (k) => (e) => setDraft((p) => ({ ...p, [k]: e.target.value }))
  function startAdd()   { setDraft({ name: '', value: '' }); setEditing('new') }
  function startEdit(i) { setDraft({ name: fields[i].name ?? '', value: fields[i].value ?? '' }); setEditing(i) }
  function cancel()     { setEditing(null) }

  async function persist(nextFields) {
    setSaving(true)
    try {
      const updated = await companiesApi.updateCompany(company.id, { customFields: nextFields })
      onSaved?.(updated)
      setEditing(null)
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không lưu được', 'error')
    } finally {
      setSaving(false)
    }
  }
  async function save() {
    const name = draft.name.trim()
    if (!name) { addToast('Vui lòng nhập tên trường', 'error'); return }
    const item = { name, value: draft.value.trim() }
    const next = editing === 'new' ? [...fields, item] : fields.map((f, i) => (i === editing ? item : f))
    await persist(next)
  }
  async function remove(i) {
    await persist(fields.filter((_, j) => j !== i))
  }

  const editProps = { draft, setF, save, cancel, saving }

  return (
    <div className={s.infoCard}>
      <div className={s.infoCardHeader}>
        <div className={s.infoCardTitle}>
          <div className={`${s.infoCardTitleIcon} ${s.infoCardIconPurple}`}>
            <SlidersHorizontal size={14} />
          </div>
          Thông tin bổ sung
        </div>
        {canEdit && editing !== 'new' && (
          <button className={s.locAddBtn} onClick={startAdd}>
            <Plus size={13} /> Thêm trường
          </button>
        )}
      </div>
      <div className={s.infoCardBody}>
        <div className={s.locTableWrap}>
          <table className={s.locTable}>
            <colgroup>
              <col className={s.cfName} />
              <col className={s.cfValue} />
              <col className={s.cfAction} />
            </colgroup>
            <thead>
              <tr>
                <th>Tên trường</th>
                <th>Nội dung</th>
                <th className={s.locCenter}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {fields.length === 0 && editing !== 'new' ? (
                <tr><td colSpan={3} className={s.locEmpty}>Chưa có trường bổ sung. Nhấn “Thêm trường”.</td></tr>
              ) : (
                fields.map((f, i) => (
                  editing === i ? <CustomFieldEditRow key={i} {...editProps} /> : (
                    <tr key={i}>
                      <td title={f.name}>{f.name || <span className={s.locMuted}>—</span>}</td>
                      <td title={f.value}>{f.value || <span className={s.locMuted}>—</span>}</td>
                      <td className={s.locCenter}>
                        {canEdit && (
                          <div className={s.locRowActions}>
                            <button className={s.locBtnEdit} onClick={() => startEdit(i)} title="Sửa"><Pencil size={13} /></button>
                            <button className={s.locBtnDelete} onClick={() => remove(i)} title="Xoá"><Trash2 size={13} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                ))
              )}
              {editing === 'new' && <CustomFieldEditRow {...editProps} />}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── StaffCard ──────────────────────────────────────────────────────────────────

export function StaffCard({ company, isAdmin, onAssigned, inline = false }) {
  const [showModal, setShowModal] = useState(false)
  const staff = company.assignedStaff

  // Biến thể ngang (dùng trong heroCard) — không bọc card, chỉ hiện tên + nút Đổi
  if (inline) {
    return (
      <div className={s.heroStaff}>
        <span className={s.heroStaffLabel}><Users size={13} /> Phụ trách</span>
        {staff ? (
          <div className={s.heroStaffPerson}>
            <img
              src={staffAvatarSrc(staff)}
              alt={staff.name}
              className={s.heroStaffAvatar}
              onError={(e) => { e.target.src = FALLBACK_AVATAR }}
            />
            <div className={s.heroStaffText}>
              <div className={s.heroStaffName}>{staff.name}</div>
              <div className={s.heroStaffRole}>{staff.jobTitle || staff.email || 'Nhân viên phụ trách'}</div>
            </div>
          </div>
        ) : (
          <span className={s.heroStaffEmpty}>Chưa phân công</span>
        )}
        {isAdmin && (
          <button className={s.btnNavy} onClick={() => setShowModal(true)}>
            <UserPlus size={12} /> Đổi
          </button>
        )}
        {showModal && (
          <AssignStaffModal
            companyId={company.id}
            onClose={() => setShowModal(false)}
            onAssigned={() => { setShowModal(false); onAssigned() }}
          />
        )}
      </div>
    )
  }

  return (
    <div className={s.staffCard}>
      <div className={s.staffCardHeader}>
        <span>
          <Users size={13} className={s.titleInlineIcon} />
          Phụ trách
        </span>
        {isAdmin && (
          <button className={s.btnNavy} onClick={() => setShowModal(true)}>
            <UserPlus size={12} /> Đổi
          </button>
        )}
      </div>
      <div className={s.staffCardBody}>
        {staff ? (
          <div className={s.staffProfile}>
            <img
              src={staffAvatarSrc(staff)}
              alt={staff.name}
              className={s.staffAvatarLg}
              onError={(e) => { e.target.src = FALLBACK_AVATAR }}
            />
            <div className={s.staffProfileInfo}>
              <div className={s.staffProfileName}>{staff.name}</div>
              <div className={s.staffProfileMeta}>
                {staff.jobTitle || staff.email || 'Nhân viên phụ trách'}
              </div>
            </div>
          </div>
        ) : (
          <div className={s.staffUnassigned}>
            <Users size={20} color="var(--color-border)" />
            <span>Chưa phân công</span>
          </div>
        )}
      </div>

      {showModal && (
        <AssignStaffModal
          companyId={company.id}
          onClose={() => setShowModal(false)}
          onAssigned={() => { setShowModal(false); onAssigned() }}
        />
      )}
    </div>
  )
}

// ── AssignStaffModal ───────────────────────────────────────────────────────────

function AssignStaffModal({ companyId, onClose, onAssigned }) {
  const addToast          = useToastStore((st) => st.toast)
  const [staffList, setStaffList]   = useState([])
  const [loadingStaff, setLoadingStaff] = useState(true)
  const [staffId, setStaffId]       = useState('')
  const [startDate, setStartDate]   = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)

  useEffect(() => {
    usersApi
      .listUserOptions({ status: 'active' })
      .then(({ users }) => setStaffList(users))
      .finally(() => setLoadingStaff(false))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!staffId) { setError('Vui lòng chọn người phụ trách'); return }
    setError(null)
    setLoading(true)
    try {
      await companiesApi.assignStaff(companyId, {
        staffId,
        startDate: startDate || undefined,
        notes: notes || null,
      })
      const chosen = staffList.find((u) => u.id === staffId)
      addToast(`Đã phân công "${chosen?.name ?? 'nhân sự'}" phụ trách`, 'success')
      onAssigned()
    } catch (err) {
      setError(err.response?.data?.error?.message ?? 'Không thể phân công')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Phân công người phụ trách" onClose={onClose}>
      <form onSubmit={handleSubmit} className={s.modalForm}>
        {error && <div className={s.errorBox}>{error}</div>}

        <div>
          <label className={`${s.formLabel} ${s.formLabelReq}`}>Người phụ trách</label>
          {loadingStaff ? (
            <div className={s.assignSkeleton} />
          ) : (
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className={s.formSelect}
            >
              <option value="">Chọn người phụ trách...</option>
              {staffList.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.role === 'admin' ? '[Admin] ' : ''}{u.name}{u.jobTitle ? ` — ${u.jobTitle}` : ''}
                </option>
              ))}
            </select>
          )}
          <p className={s.formHint}>Chỉ hiển thị nhân viên đang làm việc. Phân công mới tự đóng phân công cũ.</p>
        </div>

        <div>
          <label className={s.formLabel}>Ngày bắt đầu</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={s.formInput}
          />
        </div>

        <div>
          <label className={s.formLabel}>Ghi chú</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={s.formTextarea}
            placeholder="Ghi chú về việc phân công (tùy chọn)"
          />
        </div>

        <div className={s.modalActions}>
          <button type="button" onClick={onClose} className={s.btnOutline}>Huỷ</button>
          <button type="submit" disabled={loading || loadingStaff} className={s.btnPrimary}>
            {loading ? <Loader2 size={13} className={s.spin} /> : <UserPlus size={13} />}
            {loading ? 'Đang lưu...' : 'Xác nhận phân công'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default OverviewTab
