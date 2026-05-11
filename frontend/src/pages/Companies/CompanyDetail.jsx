import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  Building2, Pencil, AlertTriangle, ChevronRight,
  Hash, Calendar, Briefcase,
  User, UserPlus, ListTodo, CalendarDays, Lock, FileText, StickyNote,
  Loader2, Users, BarChart2, Clock, Trash2,
  Plus, Search, RotateCcw,
} from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import Modal from '../../components/ui/Modal'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as companiesApi from '../../api/companies'
import * as usersApi from '../../api/users'
import * as tasksApi from '../../api/tasks'
import { BUSINESS_TYPE_LABELS, CompanyFormModal, getInitials, StatusPill } from './Companies'
import SchedulesTab from './SchedulesTab'
import CredentialsTab from './CredentialsTab'
import TaskFormModal from '../Tasks/TaskFormModal'
import {
  STATUS_LABELS, STATUS_CSS, PRIORITY_LABELS, PRIORITY_CSS,
  isTaskOverdue, fmtDate as fmtTaskDate, progressPct,
} from '../Tasks/taskUtils'
import { useEnumsStore } from '../../hooks/useEnums'
import ts from '../Tasks/tasks.module.css'
import s from './companies.module.css'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

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

// ── Tab config ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview',     label: 'Tổng quan',         icon: BarChart2 },
  { id: 'tasks',        label: 'Công việc',          icon: ListTodo },
  { id: 'schedules',    label: 'Lịch định kỳ',       icon: CalendarDays },
  { id: 'credentials',  label: 'Tài khoản hệ thống', icon: Lock },
  { id: 'documents',    label: 'Tài liệu',           icon: FileText },
  { id: 'notes',        label: 'Ghi chú',            icon: StickyNote },
]

// ── Main page ──────────────────────────────────────────────────────────────────

export default function CompanyDetail() {
  const { id }    = useParams()
  const isAdmin   = useAuthStore((st) => st.user?.role === 'admin')
  const addToast  = useToastStore((st) => st.toast)
  const getLabel  = useEnumsStore((st) => st.getLabel)
  const loadEnums = useEnumsStore((st) => st.load)

  const [company, setCompany]   = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [activeTab, setActiveTab] = useState('overview')

  const [showEdit, setShowEdit]           = useState(false)
  const [showTerminate, setShowTerminate] = useState(false)
  const [terminating, setTerminating]       = useState(false)
  const [showDelete, setShowDelete]         = useState(false)
  const [deleting, setDeleting]             = useState(false)

  useEffect(() => { loadEnums() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    companiesApi
      .getCompany(id)
      .then((c) => { if (!cancelled) setCompany(c) })
      .catch((err) => {
        if (!cancelled)
          setError(err.response?.status === 404 ? 'Không tìm thấy công ty' : 'Lỗi tải dữ liệu')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])

  async function handleDelete() {
    setDeleting(true)
    try {
      await companiesApi.deleteCompany(id)
      addToast(`Đã xoá công ty "${company?.name}"`, 'success')
      window.location.href = '/companies'
    } catch (err) {
      const msg = err.response?.data?.error?.message ?? 'Không thể xoá công ty'
      addToast(msg, 'error')
      if (err.response?.status === 409) setShowDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  async function handleTerminate() {
    setTerminating(true)
    try {
      await companiesApi.terminateCompany(id)
      setCompany((c) => ({ ...c, status: 'terminated' }))
      setShowTerminate(false)
      addToast(`Đã kết thúc hợp đồng với "${company?.name}"`, 'warning')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể kết thúc hợp đồng', 'error')
    } finally {
      setTerminating(false)
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className={s.breadcrumb}>
          <Link to="/companies" className={s.breadcrumbLink}>Khách hàng</Link>
          <ChevronRight size={13} className={s.breadcrumbSep} />
          <span className={s.muted}>Đang tải...</span>
        </div>
        <div className={s.detailSkeleton}>
          <div className={s.detailSkeletonHero} />
          <div className={s.detailSkeletonTabs} />
          <div className={s.detailSkeletonBody} />
        </div>
      </AppLayout>
    )
  }

  if (error || !company) {
    return (
      <AppLayout>
        <div className={s.placeholderTab} style={{ marginTop: 24 }}>
          <div className={s.placeholderIcon} style={{ background: '#fef2f2' }}>
            <AlertTriangle size={24} color="#dc2626" />
          </div>
          <p className={s.placeholderTitle}>Không tìm thấy</p>
          <p className={s.placeholderDesc}>{error ?? 'Công ty này không tồn tại hoặc đã bị xoá.'}</p>
          <Link to="/companies">
            <button className={s.btnOutline} style={{ marginTop: 4 }}>← Quay lại danh sách</button>
          </Link>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      {/* Breadcrumb */}
      <div className={s.breadcrumb}>
        <Link to="/companies" className={s.breadcrumbLink}>Khách hàng</Link>
        <ChevronRight size={13} style={{ color: '#d1d5db' }} />
        <span className={s.breadcrumbCurrent}>{company.name}</span>
      </div>

      {/* Hero card */}
      <div className={s.heroCard}>
        <div className={s.heroLeft}>
          <div className={s.heroAvatarWrap}>
            {company.avatarUrl ? (
              <img
                src={company.avatarUrl}
                alt=""
                className={s.heroAvatarImg}
                onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
              />
            ) : null}
            <div className={s.heroInitials} style={company.avatarUrl ? { display: 'none' } : {}}>
              {getInitials(company.name)}
            </div>
          </div>
          <div className={s.heroInfo}>
            <h1 className={s.heroName}>{company.name}</h1>
            <div className={s.heroBadges}>
              <StatusPill status={company.status} />
              {company.businessType && (
                <span className={`${s.heroBadge} ${s.heroBadgeType}`}>
                  {getLabel('business_type', company.businessType, BUSINESS_TYPE_LABELS[company.businessType] ?? company.businessType)}
                </span>
              )}
            </div>
            <div className={s.heroMeta}>
              {company.taxCode && (
                <span className={s.heroMetaItem}>
                  <Hash size={12} /> MST: {company.taxCode}
                </span>
              )}
              {company.industry && (
                <span className={s.heroMetaItem}>
                  <Briefcase size={12} /> {company.industry}
                </span>
              )}
              {company.serviceStartDate && (
                <span className={s.heroMetaItem}>
                  <Calendar size={12} /> HĐ từ {fmtDate(company.serviceStartDate)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className={s.heroRight}>
          <div className={s.heroMetricGroup}>
            <div className={s.heroMetric}>
              <div className={`${s.heroMetricValue} ${s.heroMetricValueBlue}`}>
                {company.taskOpenCount ?? 0}
              </div>
              <div className={s.heroMetricLabel}>Đang mở</div>
            </div>
            {(company.taskOverdueCount ?? 0) > 0 && (
              <div className={s.heroMetric}>
                <div className={`${s.heroMetricValue} ${s.heroMetricValueRed}`}>
                  {company.taskOverdueCount}
                </div>
                <div className={s.heroMetricLabel}>Quá hạn</div>
              </div>
            )}
          </div>

          {isAdmin && (
            <div className={s.heroActions}>
              <button className={s.btnOutline} onClick={() => setShowEdit(true)}>
                <Pencil size={13} /> Chỉnh sửa
              </button>
              {company.status !== 'terminated' && (
                <button className={s.btnDanger} onClick={() => setShowTerminate(true)}>
                  Kết thúc HĐ
                </button>
              )}
              <button
                className={s.btnDeleteIcon}
                onClick={() => setShowDelete(true)}
                title="Xoá công ty"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className={s.tabBar}>
        {TABS.map(({ id: tid, label, icon: Icon }) => (
          <button
            key={tid}
            className={`${s.tabBtn} ${activeTab === tid ? s.tabBtnActive : ''}`}
            onClick={() => setActiveTab(tid)}
          >
            <Icon size={13} />
            {label}
            {tid === 'tasks' && (company.taskOpenCount ?? 0) > 0 && (
              <span className={s.tabCount}>{company.taskOpenCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <OverviewTab
          company={company}
          isAdmin={isAdmin}
          onAssigned={() => companiesApi.getCompany(id).then(setCompany).catch(() => {})}
        />
      )}
      {activeTab === 'tasks' && (
        <CompanyTasksTab
          company={company}
          onTaskCountChange={(openCount) => setCompany((c) => ({ ...c, taskOpenCount: openCount }))}
        />
      )}
      {activeTab === 'schedules' && (
        <SchedulesTab company={company} isAdmin={isAdmin} />
      )}
      {activeTab === 'credentials' && (
        <CredentialsTab company={company} />
      )}
      {activeTab === 'documents' && (
        <PlaceholderTab
          icon={<FileText size={24} color="#2563eb" />}
          iconBg="#eff6ff"
          title="Tài liệu & hồ sơ"
          desc="Upload, quản lý và liên kết tài liệu KH qua Microsoft OneDrive. Tính năng thuộc Phase 11."
          phase="Phase 11"
        />
      )}
      {activeTab === 'notes' && (
        <PlaceholderTab
          icon={<StickyNote size={24} color="#d97706" />}
          iconBg="#fffbeb"
          title="Ghi chú nội bộ"
          desc="Lưu ghi chú, trao đổi nội bộ về khách hàng. Sẽ triển khai trong Phase sau."
          phase="Sắp có"
          btnLabel="+ Thêm ghi chú"
          btnDisabled
        />
      )}

      {/* Edit modal */}
      {showEdit && (
        <CompanyFormModal
          company={company}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => {
            setCompany((c) => ({ ...c, ...updated }))
            setShowEdit(false)
            addToast('Đã cập nhật thông tin công ty', 'success')
          }}
        />
      )}

      {/* Terminate confirm */}
      {showTerminate && (
        <Modal title="Kết thúc hợp đồng" onClose={() => setShowTerminate(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className={s.terminateWarn}>
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Bạn sắp kết thúc hợp đồng với <strong>{company.name}</strong>.
                Công ty sẽ chuyển sang trạng thái <strong>&ldquo;Đã kết thúc&rdquo;</strong> và không thể tạo thêm công việc mới.
                Dữ liệu hiện có vẫn được giữ nguyên.
              </span>
            </div>
            <div className={s.modalActions}>
              <button onClick={() => setShowTerminate(false)} className={s.btnOutline}>Huỷ bỏ</button>
              <button onClick={handleTerminate} disabled={terminating} className={s.btnDanger}>
                {terminating ? <Loader2 size={13} className={s.spin} /> : null}
                Xác nhận kết thúc
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {showDelete && (
        <Modal title="Xoá công ty" onClose={() => setShowDelete(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className={s.terminateWarn} style={{ background: '#fef2f2', borderColor: '#fca5a5' }}>
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1, color: '#dc2626' }} />
              <span>
                Bạn sắp <strong>xoá vĩnh viễn</strong> công ty <strong>&ldquo;{company.name}&rdquo;</strong>.
                Hành động này không thể hoàn tác. Nếu công ty đã có công việc hoặc lịch sử phân công, hãy dùng <strong>&ldquo;Kết thúc HĐ&rdquo;</strong> thay thế.
              </span>
            </div>
            <div className={s.modalActions}>
              <button onClick={() => setShowDelete(false)} className={s.btnOutline}>Huỷ bỏ</button>
              <button onClick={handleDelete} disabled={deleting} className={s.btnDanger}>
                {deleting ? <Loader2 size={13} className={s.spin} /> : <Trash2 size={13} />}
                {deleting ? 'Đang xoá...' : 'Xoá vĩnh viễn'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </AppLayout>
  )
}

// ── OverviewTab ────────────────────────────────────────────────────────────────

function OverviewTab({ company, isAdmin, onAssigned }) {
  return (
    <div className={s.overviewGrid}>
      {/* Left column */}
      <div className={s.overviewLeft}>
        <BusinessInfoCard company={company} />
        <ContactCard company={company} />
        <ActivityCard companyId={company.id} />
      </div>

      {/* Right column */}
      <div className={s.overviewRight}>
        <StaffCard company={company} isAdmin={isAdmin} onAssigned={onAssigned} />
        <PerformanceCard company={company} />
        <AssignmentsCard companyId={company.id} isAdmin={isAdmin} onAssigned={onAssigned} />
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
          <div className={s.infoCardTitleIcon} style={{ background: '#eff6ff' }}>
            <Building2 size={14} color="#1d4ed8" />
          </div>
          Thông tin doanh nghiệp
        </div>
      </div>
      <div className={s.infoCardBody}>
        <div className={s.infoGrid}>
          <InfoField label="Tên công ty"        value={company.name} />
          <InfoField label="Mã số thuế"         value={company.taxCode} />
          <InfoField label="Loại hình"          value={getLabel('business_type', company.businessType, BUSINESS_TYPE_LABELS[company.businessType] ?? company.businessType)} />
          <InfoField label="Ngành nghề"         value={company.industry} />
          <InfoField label="Địa chỉ"            value={company.address} fullWidth />
          <InfoField label="Ngày bắt đầu HĐ"   value={fmtDate(company.serviceStartDate)} />
          <InfoField label="Số TK ngân hàng"   value={company.bankAccount} />
          <InfoField label="Tên ngân hàng"     value={company.bankName} />
        </div>
        {company.notes && (
          <div style={{ marginTop: 16 }}>
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
          <div className={s.infoCardTitleIcon} style={{ background: '#f0fdf4' }}>
            <User size={14} color="#059669" />
          </div>
          Liên hệ
        </div>
      </div>
      <div className={s.infoCardBody}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
          {hasLegal && (
            <div>
              <div className={s.infoLabel} style={{ marginBottom: 10 }}>Đại diện pháp lý</div>
              <div className={s.infoGrid} style={{ gridTemplateColumns: '1fr' }}>
                <InfoField label="Họ tên"    value={company.legalRepName} />
                <InfoField label="Điện thoại" value={company.legalRepPhone} />
              </div>
            </div>
          )}
          {hasContact && (
            <div>
              <div className={s.infoLabel} style={{ marginBottom: 10 }}>Người liên hệ</div>
              <div className={s.infoGrid} style={{ gridTemplateColumns: '1fr' }}>
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

function ActivityCard({ companyId }) {
  const [activities, setActivities] = useState([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    companiesApi.getActivityLog(companyId, 15)
      .then(setActivities)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={s.infoCard}>
      <div className={s.infoCardHeader}>
        <div className={s.infoCardTitle}>
          <div className={s.infoCardTitleIcon} style={{ background: '#f5f3ff' }}>
            <Clock size={14} color="#7c3aed" />
          </div>
          Hoạt động gần đây
        </div>
      </div>
      <div className={s.infoCardBody} style={{ padding: 0 }}>
        {loading ? (
          <div className={s.loadingCenter} style={{ height: 80 }}>
            <Loader2 size={15} className={s.spin} />
          </div>
        ) : activities.length === 0 ? (
          <div style={{ padding: '20px 16px', textAlign: 'center', fontSize: 12, color: 'var(--color-muted)' }}>
            Chưa có hoạt động nào.
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {activities.map((a, i) => (
              <li key={a.id} style={{
                display: 'flex', gap: 10, padding: '10px 16px',
                borderBottom: i < activities.length - 1 ? '1px solid #f3f4f6' : 'none',
              }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%', background: '#7c3aed',
                  flexShrink: 0, marginTop: 5,
                }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ACTION_LABELS[a.action] ?? a.action}
                    {a.taskTitle && (
                      <span style={{ fontWeight: 400, color: '#6b7280' }}> · {a.taskTitle}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                    {a.actorName} · {fmtRelative(a.createdAt)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
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
          <Users size={13} style={{ marginRight: 6, verticalAlign: 'middle', color: '#6b7280' }} />
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
            <Users size={20} color="#d1d5db" />
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
  return (
    <div className={s.metricCard}>
      <div className={s.metricCardHeader}>
        <BarChart2 size={13} style={{ marginRight: 6, verticalAlign: 'middle', color: '#6b7280' }} />
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
          <div className={`${s.metricItemValue} ${s.metricItemValueGray}`}>—</div>
          <div className={s.metricItemLabel}>Hoàn thành</div>
        </div>
        <div className={s.metricItem}>
          <div className={`${s.metricItemValue} ${s.metricItemValueGray}`}>—</div>
          <div className={s.metricItemLabel}>SLA tháng</div>
        </div>
      </div>
    </div>
  )
}

// ── AssignmentsCard ────────────────────────────────────────────────────────────

function AssignmentsCard({ companyId, isAdmin, onAssigned }) {
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading]         = useState(true)
  const [showModal, setShowModal]     = useState(false)

  useEffect(() => {
    let cancelled = false
    companiesApi
      .getAssignments(companyId)
      .then((a) => { if (!cancelled) setAssignments(a) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [companyId])

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
        <div className={s.loadingCenter} style={{ height: 80 }}>
          <Loader2 size={16} className={s.spin} /> Đang tải...
        </div>
      ) : assignments.length === 0 ? (
        <div className={s.emptyState} style={{ padding: '24px' }}>
          <p className={s.emptyDesc} style={{ fontSize: 12 }}>Chưa có lịch sử phân công.</p>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className={s.staffAvatar} style={{ width: 26, height: 26, fontSize: 9 }}>
                        {getInitials(a.staff?.name)}
                      </div>
                      <div>
                        <div className={s.semiBold} style={{ fontSize: 12 }}>{a.staff?.name}</div>
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
      .listUsers({ role: 'staff', status: 'active', limit: 100 })
      .then(({ users }) => setStaffList(users))
      .finally(() => setLoadingStaff(false))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!staffId) { setError('Vui lòng chọn nhân viên'); return }
    setError(null)
    setLoading(true)
    try {
      await companiesApi.assignStaff(companyId, {
        staffId,
        startDate: startDate || undefined,
        notes: notes || null,
      })
      const chosen = staffList.find((u) => u.id === staffId)
      addToast(`Đã phân công "${chosen?.name ?? 'nhân viên'}" phụ trách`, 'success')
      onAssigned()
    } catch (err) {
      setError(err.response?.data?.error?.message ?? 'Không thể phân công nhân viên')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Phân công nhân viên phụ trách" onClose={onClose}>
      <form onSubmit={handleSubmit} className={s.modalForm}>
        {error && <div className={s.errorBox}>{error}</div>}

        <div>
          <label className={`${s.formLabel} ${s.formLabelReq}`}>Nhân viên phụ trách</label>
          {loadingStaff ? (
            <div style={{ height: 36, background: '#f0f2f5', borderRadius: 7, animation: 'skeleton-fade 1.4s ease-in-out infinite' }} />
          ) : (
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className={s.formSelect}
            >
              <option value="">Chọn nhân viên...</option>
              {staffList.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}{u.jobTitle ? ` — ${u.jobTitle}` : ''}
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


// ── PlaceholderTab ─────────────────────────────────────────────────────────────

function PlaceholderTab({ icon, iconBg, title, desc, phase, btnLabel, btnDisabled }) {
  return (
    <div className={s.placeholderTab}>
      <div className={s.placeholderIcon} style={{ background: iconBg ?? '#f3f4f6' }}>
        {icon}
      </div>
      <p className={s.placeholderTitle}>{title}</p>
      <p className={s.placeholderDesc}>{desc}</p>
      {phase && <span className={s.placeholderPhase}>{phase}</span>}
      {btnLabel && (
        <button className={s.btnOutline} disabled={btnDisabled} style={{ marginTop: 4 }}>
          {btnLabel}
        </button>
      )}
    </div>
  )
}

// ── CompanyTasksTab ────────────────────────────────────────────────────────────

function CompanyTasksTab({ company, onTaskCountChange }) {
  const navigate   = useNavigate()
  const addToast   = useToastStore((st) => st.toast)
  const getOptions = useEnumsStore((st) => st.getOptions)
  const getLabel   = useEnumsStore((st) => st.getLabel)
  const loadEnums  = useEnumsStore((st) => st.load)

  const [tasks, setTasks]           = useState([])
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 })
  const [page, setPage]             = useState(1)
  const [loading, setLoading]       = useState(true)

  const [searchInput, setSearchInput]     = useState('')
  const [search, setSearch]               = useState('')
  const [statusFilter, setStatusFilter]   = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [isOverdue, setIsOverdue]         = useState(false)
  const [monthFilter, setMonthFilter]     = useState('')
  const [yearFilter, setYearFilter]       = useState('')

  const [showCreate, setShowCreate] = useState(false)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => { loadEnums() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function getDateRange() {
    const y = yearFilter  ? parseInt(yearFilter, 10)  : null
    const m = monthFilter ? parseInt(monthFilter, 10) : null
    if (y && m) {
      const lastDay = new Date(y, m, 0).getDate()
      return {
        dueDateFrom: `${y}-${String(m).padStart(2, '0')}-01`,
        dueDateTo:   `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      }
    }
    if (y) {
      return { dueDateFrom: `${y}-01-01`, dueDateTo: `${y}-12-31` }
    }
    return {}
  }

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    tasksApi.listTasks({
      companyId:  company.id,
      search:     search     || undefined,
      status:     statusFilter  || undefined,
      priority:   priorityFilter || undefined,
      isOverdue:  isOverdue  ? true : undefined,
      ...getDateRange(),
      page,
      limit:      20,
      sortBy:     'due_date',
      sortDir:    'asc',
    })
      .then(({ tasks: t, pagination: p }) => {
        if (!cancelled) {
          setTasks(t)
          setPagination(p ?? { total: t.length, totalPages: 1 })
        }
      })
      .catch(() => { if (!cancelled) setTasks([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [company.id, search, statusFilter, priorityFilter, isOverdue, monthFilter, yearFilter, page]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const cancel = load()
    return cancel
  }, [load])

  function resetFilters() {
    setSearchInput(''); setSearch('')
    setStatusFilter(''); setPriorityFilter(''); setIsOverdue(false)
    setMonthFilter(''); setYearFilter('')
    setPage(1)
  }

  const activeFilters = [search, statusFilter, priorityFilter, monthFilter, yearFilter].filter(Boolean).length + (isOverdue ? 1 : 0)

  // KPI derived from current page (not perfect but good enough without extra API)
  const openCount     = tasks.filter((t) => t.status !== 'completed').length
  const overdueCount  = tasks.filter((t) => isTaskOverdue(t)).length
  const completedCount = tasks.filter((t) => t.status === 'completed').length

  function pageWindow() {
    const total = pagination.totalPages ?? 1
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
    if (page <= 4) return [1, 2, 3, 4, 5, '…', total]
    if (page >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total]
    return [1, '…', page - 1, page, page + 1, '…', total]
  }

  const STATUSES = ['pending', 'in_progress', 'on_hold', 'pending_review', 'needs_revision', 'completed']

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>
            Công việc của khách hàng
          </h3>
          {!loading && (
            <span style={{ fontSize: 11, fontWeight: 700, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: 99, padding: '1px 8px' }}>
              {pagination.total}
            </span>
          )}
        </div>
        <button className={ts.btnPrimary} style={{ height: 32, fontSize: 13 }} onClick={() => setShowCreate(true)}>
          <Plus size={13} /> Tạo công việc
        </button>
      </div>

      {/* KPI strip */}
      {!loading && tasks.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {[
            { label: 'Đang mở',   value: openCount,      color: '#1d4ed8', bg: '#eff6ff', border: '#93c5fd' },
            { label: 'Quá hạn',   value: overdueCount,   color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', hide: overdueCount === 0 },
            { label: 'Hoàn thành', value: completedCount, color: '#15803d', bg: '#f0fdf4', border: '#86efac' },
          ].filter((k) => !k.hide).map((k) => (
            <div key={k.label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 8, background: k.bg, border: `1px solid ${k.border}` }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: k.color }}>{k.value}</span>
              <span style={{ fontSize: 11, color: k.color, fontWeight: 600 }}>{k.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filter row */}
      <div className={s.taskFilterBar}>
        <div className={s.taskFilterSearch}>
          <Search size={12} className={s.taskFilterSearchIcon} />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Tìm công việc..."
            className={s.taskFilterInput}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className={s.taskFilterSelect}
        >
          <option value="">Tất cả trạng thái</option>
          {(getOptions('task_status').length > 0
            ? getOptions('task_status')
            : STATUSES.map((k) => ({ key: k, label: STATUS_LABELS[k] }))
          ).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => { setPriorityFilter(e.target.value); setPage(1) }}
          className={s.taskFilterSelect}
        >
          <option value="">Tất cả ưu tiên</option>
          {(getOptions('task_priority').length > 0
            ? getOptions('task_priority')
            : ['urgent', 'high', 'medium', 'low'].map((k) => ({ key: k, label: PRIORITY_LABELS[k] }))
          ).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <select
          value={monthFilter}
          onChange={(e) => { setMonthFilter(e.target.value); setPage(1) }}
          className={`${s.taskFilterSelect} ${s.taskFilterSelectSm}`}
        >
          <option value="">Tháng</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>T{m}</option>
          ))}
        </select>
        <select
          value={yearFilter}
          onChange={(e) => { setYearFilter(e.target.value); setPage(1) }}
          className={`${s.taskFilterSelect} ${s.taskFilterSelectSm}`}
        >
          <option value="">Năm</option>
          {[2024, 2025, 2026, 2027].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <button
          className={ts.qBtn}
          style={isOverdue ? { background: '#dc2626', borderColor: '#dc2626', color: '#fff' } : {}}
          onClick={() => { setIsOverdue((v) => !v); setPage(1) }}
        >
          Quá hạn
        </button>
        {activeFilters > 0 && (
          <button className={ts.qResetBtn} onClick={resetFilters}>
            <RotateCcw size={11} /> Xoá lọc ({activeFilters})
          </button>
        )}
      </div>

      {/* Table */}
      <div className={s.tableWrap}>
        <div className={s.tableScroll}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Tiêu đề</th>
                <th>Trạng thái</th>
                <th>Ưu tiên</th>
                <th>Hết hạn</th>
                <th>Phụ trách</th>
                <th>Tiến độ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {[220, 100, 80, 80, 100, 80].map((w, j) => (
                      <td key={j} style={{ padding: '10px 16px' }}>
                        <div style={{ width: w, height: 10, background: '#f1f5f9', borderRadius: 4, animation: 'app-pulse 1.5s ease-in-out infinite' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : tasks.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-muted)', fontSize: 13 }}>
                      <ListTodo size={28} style={{ opacity: 0.3, marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
                      {activeFilters > 0 ? 'Không tìm thấy công việc phù hợp' : 'Chưa có công việc nào'}
                    </div>
                  </td>
                </tr>
              ) : tasks.map((task) => {
                const overdue = isTaskOverdue(task)
                const pct     = progressPct(task)
                return (
                  <tr
                    key={task.id}
                    style={{ cursor: 'pointer', borderLeft: overdue ? '3px solid #ef4444' : undefined }}
                    onClick={() => navigate(`/tasks/${task.id}`)}
                  >
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13, color: overdue ? '#dc2626' : 'var(--color-text)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {task.title}
                      </div>
                    </td>
                    <td>
                      <span className={`${ts.statusBadge} ${ts[STATUS_CSS[task.status]]}`}>
                        {getLabel('task_status', task.status, STATUS_LABELS[task.status])}
                      </span>
                    </td>
                    <td>
                      <span className={`${ts.priorityBadge} ${ts[PRIORITY_CSS[task.priority]]}`}>
                        {getLabel('task_priority', task.priority, PRIORITY_LABELS[task.priority])}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: overdue ? '#dc2626' : 'var(--color-text-soft)', fontWeight: overdue ? 700 : 400 }}>
                      {fmtTaskDate(task.dueDate)}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--color-text-soft)' }}>
                      {task.assignedToName ?? '—'}
                    </td>
                    <td>
                      {pct !== null ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <div style={{ flex: 1, height: 5, minWidth: 40, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#22c55e' : '#3b82f6', borderRadius: 99, transition: 'width 0.3s' }} />
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>{pct}%</span>
                        </div>
                      ) : <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className={s.paginationBar}>
            <span className={s.paginationInfo}>
              {loading ? '...' : `${(page - 1) * 20 + 1}–${Math.min(page * 20, pagination.total)} / ${pagination.total}`}
            </span>
            <div className={s.paginationBtns}>
              <button className={s.paginationBtn} onClick={() => setPage(1)} disabled={page === 1}>«</button>
              <button className={s.paginationBtn} onClick={() => setPage((p) => p - 1)} disabled={page === 1}>‹</button>
              {pageWindow().map((n, i) =>
                n === '…' ? (
                  <span key={`e${i}`} style={{ padding: '0 4px', fontSize: 12, color: 'var(--color-muted)' }}>…</span>
                ) : (
                  <button
                    key={n}
                    className={`${s.paginationBtn} ${page === n ? s.paginationBtnActive : ''}`}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </button>
                )
              )}
              <button className={s.paginationBtn} onClick={() => setPage((p) => p + 1)} disabled={page === pagination.totalPages}>›</button>
              <button className={s.paginationBtn} onClick={() => setPage(pagination.totalPages)} disabled={page === pagination.totalPages}>»</button>
            </div>
          </div>
        )}
      </div>

      {/* Create task modal */}
      {showCreate && (
        <TaskFormModal
          initialCompanyId={company.id}
          lockCompany
          onClose={() => setShowCreate(false)}
          onSaved={(task) => {
            setShowCreate(false)
            addToast(`Đã tạo "${task.title}"`, 'success')
            setPage(1)
            load()
            onTaskCountChange((company.taskOpenCount ?? 0) + 1)
          }}
          onSavedAndOpen={(task) => {
            setShowCreate(false)
            navigate(`/tasks/${task.id}`)
          }}
        />
      )}
    </div>
  )
}
