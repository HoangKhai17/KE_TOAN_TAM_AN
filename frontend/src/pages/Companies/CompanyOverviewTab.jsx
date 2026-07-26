import { useState, useEffect } from 'react'
import {
  Building2, User, UserPlus, Loader2, Users, SlidersHorizontal,
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

function InfoField({ label, value, fullWidth }) {
  return (
    <div className={fullWidth ? s.infoGridFull : ''}>
      <div className={s.infoLabel}>{label}</div>
      {value
        ? <div className={s.infoValue}>{value}</div>
        : <div className={s.infoValueEmpty}>—</div>
      }
    </div>
  )
}

// ── OverviewTab ────────────────────────────────────────────────────────────────

function OverviewTab({ company }) {
  // Một cột full-width: các section trải hết bề ngang layout
  return (
    <div className={s.overviewSingle}>
      <BusinessInfoCard company={company} />
      <CompanyLocationsCard companyId={company.id} />
      <ContactCard company={company} />
      <CustomFieldsCard company={company} />
    </div>
  )
}

// ── BusinessInfoCard ───────────────────────────────────────────────────────────

function BusinessInfoCard({ company }) {
  const getLabel = useEnumsStore((st) => st.getLabel)
  return (
    <div className={s.infoCard}>
      <div className={s.infoCardHeader}>
        <div className={s.infoCardTitle}>
          <div className={`${s.infoCardTitleIcon} ${s.infoCardIconBlue}`}>
            <Building2 size={14} />
          </div>
          Thông tin doanh nghiệp
        </div>
      </div>
      <div className={s.infoCardBody}>
        <div className={s.infoGrid}>
          <InfoField label="Tên công ty"        value={company.name} />
          <InfoField label="Tên viết tắt"       value={company.shortName} />
          <InfoField label="Mã số thuế"         value={company.taxCode} />
          <InfoField label="Loại hình"          value={getLabel('business_type', company.businessType, BUSINESS_TYPE_LABELS[company.businessType] ?? company.businessType)} />
          <InfoField label="Ngành nghề"         value={company.industry} />
          <InfoField label="Địa chỉ"            value={company.address} fullWidth />
          <InfoField label="Ngày bắt đầu HĐ"   value={fmtDate(company.serviceStartDate)} />
          <InfoField label="Số TK ngân hàng"   value={company.bankAccount} />
          <InfoField label="Tên ngân hàng"     value={company.bankName} />
        </div>
        {company.notes && (
          <div className={s.infoNoteWrap}>
            <div className={s.infoLabel}>Ghi chú</div>
            <div className={s.infoNote}>{company.notes}</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── ContactCard ────────────────────────────────────────────────────────────────

function ContactCard({ company }) {
  const hasLegal   = company.legalRepName || company.legalRepPhone
  const hasContact = company.contactName  || company.contactPhone || company.contactEmail
  if (!hasLegal && !hasContact) return null
  return (
    <div className={s.infoCard}>
      <div className={s.infoCardHeader}>
        <div className={s.infoCardTitle}>
          <div className={`${s.infoCardTitleIcon} ${s.infoCardIconGreen}`}>
            <User size={14} />
          </div>
          Liên hệ
        </div>
      </div>
      <div className={s.infoCardBody}>
        <div className={s.infoContactGrid}>
          {hasLegal && (
            <div>
              <div className={`${s.infoLabel} ${s.infoSubsectionLabel}`}>Đại diện pháp lý</div>
              <div className={`${s.infoGrid} ${s.infoGridSingle}`}>
                <InfoField label="Họ tên"    value={company.legalRepName} />
                <InfoField label="Điện thoại" value={company.legalRepPhone} />
              </div>
            </div>
          )}
          {hasContact && (
            <div>
              <div className={`${s.infoLabel} ${s.infoSubsectionLabel}`}>Người liên hệ</div>
              <div className={`${s.infoGrid} ${s.infoGridSingle}`}>
                <InfoField label="Họ tên"    value={company.contactName} />
                <InfoField label="Điện thoại" value={company.contactPhone} />
                <InfoField label="Email"     value={company.contactEmail} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── CustomFieldsCard ───────────────────────────────────────────────────────────

function CustomFieldsCard({ company }) {
  const fields = (company.customFields ?? []).filter((f) => f.name?.trim())
  return (
    <div className={s.infoCard}>
      <div className={s.infoCardHeader}>
        <div className={s.infoCardTitle}>
          <div className={`${s.infoCardTitleIcon} ${s.infoCardIconPurple}`}>
            <SlidersHorizontal size={14} />
          </div>
          Thông tin bổ sung
        </div>
      </div>
      <div className={s.infoCardBody}>
        {fields.length === 0 ? (
          <div className={s.infoValueEmpty} style={{ fontSize: 'var(--fs-sm)', padding: '4px 0' }}>
            Chưa có trường tùy chỉnh. Nhấn <strong>Chỉnh sửa</strong> để thêm.
          </div>
        ) : (
          <div className={s.customFieldsViewList}>
            {fields.map((field, i) => (
              <div key={i} className={s.customFieldsViewRow}>
                <span className={s.customFieldsViewLabel}>{field.name}</span>
                <span className={s.customFieldsViewValue}>{field.value || '—'}</span>
              </div>
            ))}
          </div>
        )}
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
