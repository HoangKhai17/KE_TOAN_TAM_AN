import { useState, useEffect } from 'react'
import {
  Building2, User, UserPlus, Loader2, Users, BarChart2, Clock, SlidersHorizontal,
} from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { useToastStore } from '../../stores/toastStore'
import * as companiesApi from '../../api/companies'
import * as usersApi from '../../api/users'
import { BUSINESS_TYPE_LABELS, getInitials } from './Companies'
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

function OverviewTab({ company, isAdmin, onAssigned, refreshTick }) {
  return (
    <div className={s.overviewGrid}>
      {/* Left column */}
      <div className={s.overviewLeft}>
        <BusinessInfoCard company={company} />
        <ContactCard company={company} />
        <CustomFieldsCard company={company} />
        <ActivityCard companyId={company.id} refreshTick={refreshTick} />
      </div>

      {/* Right column */}
      <div className={s.overviewRight}>
        <StaffCard company={company} isAdmin={isAdmin} onAssigned={onAssigned} />
        <PerformanceCard company={company} />
        <AssignmentsCard companyId={company.id} isAdmin={isAdmin} onAssigned={onAssigned} refreshTick={refreshTick} />
      </div>
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

// ── ActivityCard ───────────────────────────────────────────────────────────────

const ACTION_LABELS = {
  'status_changed':    'Đổi trạng thái',
  'created':           'Tạo công việc',
  'assigned':          'Phân công',
  'due_date_changed':  'Đổi hạn',
  'priority_changed':  'Đổi ưu tiên',
  'title_changed':     'Đổi tiêu đề',
  'comment_added':     'Thêm bình luận',
  'checklist_added':   'Thêm checklist',
  'checklist_checked': 'Hoàn thành checklist',
  'time_logged':       'Ghi giờ làm',
  'completed':         'Hoàn thành',
}

function fmtRelative(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'Vừa xong'
  if (m < 60) return `${m} phút trước`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} giờ trước`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} ngày trước`
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const ACT_PER_PAGE = 10

function ActivityCard({ companyId, refreshTick }) {
  const [activities, setActivities] = useState([])
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(1)
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    companiesApi.getActivityLog(companyId, { page, limit: ACT_PER_PAGE })
      .then(({ activities: a, total: t }) => {
        if (!cancelled) { setActivities(a); setTotal(t) }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [companyId, page, refreshTick]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.max(1, Math.ceil(total / ACT_PER_PAGE))

  return (
    <div className={s.infoCard}>
      <div className={s.infoCardHeader}>
        <div className={s.infoCardTitle}>
          <div className={`${s.infoCardTitleIcon} ${s.infoCardIconPurple}`}>
            <Clock size={14} />
          </div>
          Hoạt động gần đây
          {total > 0 && <span className={s.activityMetaCount}>{total} mục</span>}
        </div>
      </div>
      <div className={`${s.infoCardBody} ${s.infoCardBodyFlush}`}>
        {loading ? (
          <div className={`${s.loadingCenter} ${s.loadingShort}`}>
            <Loader2 size={15} className={s.spin} />
          </div>
        ) : activities.length === 0 ? (
          <div className={s.activityEmpty}>
            Chưa có hoạt động nào.
          </div>
        ) : (
          <>
            <ul className={s.activityList}>
              {activities.map((a, i) => (
                <li key={a.id} className={`${s.activityItem} ${i < activities.length - 1 ? s.activityItemBorder : ''}`}>
                  <div className={s.activityDot} />
                  <div className={s.activityContent}>
                    <div className={s.activityTitle}>
                      {ACTION_LABELS[a.action] ?? a.action}
                      {a.taskTitle && (
                        <span className={s.activityTaskTitle}> · {a.taskTitle}</span>
                      )}
                    </div>
                    <div className={s.activityMeta}>
                      {a.actorName} · {fmtRelative(a.createdAt)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {totalPages > 1 && (
              <div className={s.actPagination}>
                <button
                  className={s.actPageBtn}
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page === 1}
                >‹</button>
                <span className={s.actPageInfo}>Trang {page} / {totalPages}</span>
                <button
                  className={s.actPageBtn}
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page === totalPages}
                >›</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── StaffCard ──────────────────────────────────────────────────────────────────

function StaffCard({ company, isAdmin, onAssigned }) {
  const [showModal, setShowModal] = useState(false)
  const staff = company.assignedStaff

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

// ── PerformanceCard ────────────────────────────────────────────────────────────

function PerformanceCard({ company }) {
  const completed = company.taskCompletedCount ?? 0
  const onTime    = company.taskOnTimeCount ?? 0
  const slaRate   = completed > 0 ? Math.round((onTime / completed) * 100) : null

  return (
    <div className={s.metricCard}>
      <div className={s.metricCardHeader}>
        <BarChart2 size={13} className={s.titleInlineIcon} />
        Hiệu suất
      </div>
      <div className={s.metricCardBody}>
        <div className={s.metricItem}>
          <div className={`${s.metricItemValue} ${s.metricItemValueNavy}`}>{company.taskOpenCount ?? 0}</div>
          <div className={s.metricItemLabel}>Đang mở</div>
        </div>
        <div className={s.metricItem}>
          <div className={`${s.metricItemValue} ${(company.taskOverdueCount ?? 0) > 0 ? s.metricItemValueRed : s.metricItemValueGray}`}>
            {company.taskOverdueCount ?? 0}
          </div>
          <div className={s.metricItemLabel}>Quá hạn</div>
        </div>
        <div className={s.metricItem}>
          <div className={`${s.metricItemValue} ${s.metricItemValueGreen}`}>{completed}</div>
          <div className={s.metricItemLabel}>Hoàn thành</div>
        </div>
        <div className={s.metricItem}>
          <div className={`${s.metricItemValue} ${slaRate === null ? s.metricItemValueGray : slaRate >= 80 ? s.metricItemValueGreen : s.metricItemValueRed}`}>
            {slaRate === null ? '—' : `${slaRate}%`}
          </div>
          <div className={s.metricItemLabel}>Đúng hạn</div>
        </div>
      </div>
    </div>
  )
}

// ── AssignmentsCard ────────────────────────────────────────────────────────────

function AssignmentsCard({ companyId, isAdmin, onAssigned, refreshTick }) {
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading]         = useState(true)
  const [showModal, setShowModal]     = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    companiesApi
      .getAssignments(companyId)
      .then((a) => { if (!cancelled) setAssignments(a) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [companyId, refreshTick])

  function handleAssigned() {
    setShowModal(false)
    companiesApi.getAssignments(companyId).then(setAssignments).catch(() => {})
    onAssigned()
  }

  return (
    <div className={s.assignmentsCard}>
      <div className={s.assignmentsHeader}>
        <span className={s.assignmentsTitle}>Lịch sử phân công</span>
        {isAdmin && (
          <button className={s.btnNavy} onClick={() => setShowModal(true)}>
            <UserPlus size={12} /> Phân công
          </button>
        )}
      </div>

      {loading ? (
        <div className={`${s.loadingCenter} ${s.loadingShort}`}>
          <Loader2 size={16} className={s.spin} /> Đang tải...
        </div>
      ) : assignments.length === 0 ? (
        <div className={`${s.emptyState} ${s.emptyStatePadded}`}>
          <p className={`${s.emptyDesc} ${s.emptyDescSmall}`}>Chưa có lịch sử phân công.</p>
        </div>
      ) : (
        <div className={s.assignmentsTableWrap}>
          <table className={s.assignmentsTable}>
            <thead>
              <tr>
                <th>Nhân viên</th>
                <th>Từ ngày</th>
                <th>Đến ngày</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div className={s.assignmentPersonCell}>
                      <div className={`${s.staffAvatar} ${s.staffAvatarSmall}`}>
                        {getInitials(a.staff?.name)}
                      </div>
                      <div>
                        <div className={`${s.semiBold} ${s.textSmall}`}>{a.staff?.name}</div>
                        {a.staff?.jobTitle && <div className={s.muted}>{a.staff.jobTitle}</div>}
                      </div>
                    </div>
                  </td>
                  <td className={s.muted}>{fmtDate(a.startDate)}</td>
                  <td className={s.muted}>{a.endDate ? fmtDate(a.endDate) : 'Hiện tại'}</td>
                  <td>
                    {a.isCurrent
                      ? <span className={s.pillCurrent}>Hiện tại</span>
                      : <span className={s.pillPast}>Đã kết thúc</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <AssignStaffModal
          companyId={companyId}
          onClose={() => setShowModal(false)}
          onAssigned={handleAssigned}
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
