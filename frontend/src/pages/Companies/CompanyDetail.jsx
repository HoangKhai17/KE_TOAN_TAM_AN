import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  Building2, Pencil, AlertTriangle, ChevronRight,
  Hash, Calendar, Briefcase,
  User, UserPlus, ListTodo, CalendarDays, Lock, FileText, StickyNote,
  Loader2, Users, BarChart2, Clock, Trash2,
  Plus, Search, RotateCcw, Filter, Eye, ClipboardList, SlidersHorizontal, ScrollText, Archive, FileSignature,
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
import DocumentsTab from './DocumentsTab'
import NotesTab from './NotesTab'
import ClientRequestsTab from './ClientRequestsTab'
import LaborContractsTab from './LaborContractsTab'
import ClientSupplierContractsTab from './ClientSupplierContractsTab'
import ArchiveTab from './ArchiveTab'
import TaskFormModal from '../Tasks/TaskFormModal'
import TaskQuickView from '../Tasks/TaskQuickView'
import {
  STATUS_LABELS, STATUS_CSS, PRIORITY_LABELS, PRIORITY_CSS,
  isTaskOverdue, fmtDate as fmtTaskDate, progressPct,
} from '../Tasks/taskUtils'
import { useEnumsStore } from '../../hooks/useEnums'
import { useDataSync } from '../../hooks/useDataSync'
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
  { id: 'overview',          label: 'Tổng quan',         icon: BarChart2 },
  { id: 'tasks',             label: 'Công việc',          icon: ListTodo },
  { id: 'client-requests',   label: 'Yêu cầu KH',        icon: ClipboardList },
  { id: 'schedules',         label: 'Lịch định kỳ',       icon: CalendarDays },
  { id: 'labor-contracts',   label: 'Theo dõi HĐLĐ',      icon: ScrollText },
  { id: 'csc',               label: 'Theo dõi HĐ KH.NCC', icon: FileSignature },
  { id: 'credentials',       label: 'Tài khoản hệ thống', icon: Lock },
  { id: 'documents',         label: 'Tài liệu',           icon: FileText },
  { id: 'archive',           label: 'HS lưu trữ khi QT',  icon: Archive },
  { id: 'notes',             label: 'Ghi chú',            icon: StickyNote },
]

const COMPANY_TASK_STATUS_TONE = {
  '': s.cTaskStatusAll,
  pending: s.cTaskStatusPending,
  in_progress: s.cTaskStatusProgress,
  on_hold: s.cTaskStatusHold,
  pending_review: s.cTaskStatusReview,
  needs_revision: s.cTaskStatusRevision,
  completed: s.cTaskStatusCompleted,
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function CompanyDetail() {
  const { id }      = useParams()
  const currentUser = useAuthStore((st) => st.user)
  const isAdmin     = currentUser?.role === 'admin'
  const addToast  = useToastStore((st) => st.toast)
  const getLabel  = useEnumsStore((st) => st.getLabel)
  const loadEnums = useEnumsStore((st) => st.load)

  const [company, setCompany]   = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [activeTab, setActiveTab] = useState('overview')

  const [noteCount, setNoteCount]         = useState(0)
  const [overviewTick, setOverviewTick]   = useState(0)
  const [companyTick, setCompanyTick]     = useState(0)
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
        if (!cancelled) {
          const status = err.response?.status
          setError(
            status === 404 ? 'Không tìm thấy công ty' :
            status === 403 ? 'Bạn không có quyền xem thông tin công ty này' :
            'Lỗi tải dữ liệu'
          )
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id, companyTick])

  // Live sync: reload company + overview cards when related data changes
  useDataSync(['data:task', 'data:company'], (payload) => {
    if (payload.companyId === id || payload.id === id) {
      setCompanyTick((k) => k + 1)
      setOverviewTick((k) => k + 1)
    }
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
        <div className={`${s.placeholderTab} ${s.placeholderTop}`}>
          <div className={`${s.placeholderIcon} ${s.placeholderIconDanger}`}>
            <AlertTriangle size={24} />
          </div>
          <p className={s.placeholderTitle}>Không tìm thấy</p>
          <p className={s.placeholderDesc}>{error ?? 'Công ty này không tồn tại hoặc đã bị xoá.'}</p>
          <Link to="/companies">
            <button className={`${s.btnOutline} ${s.btnTopTiny}`}>← Quay lại danh sách</button>
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
        <ChevronRight size={13} className={s.breadcrumbSepIcon} />
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
                onError={(e) => {
                  e.currentTarget.classList.add(s.isHidden)
                  e.currentTarget.nextSibling?.classList.remove(s.isHidden)
                }}
              />
            ) : null}
            <div className={`${s.heroInitials} ${company.avatarUrl ? s.isHidden : ''}`}>
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

          {(isAdmin || company.assignedStaffId === currentUser?.id) && (
            <div className={s.heroActions}>
              <button className={s.btnOutline} onClick={() => setShowEdit(true)}>
                <Pencil size={13} /> Chỉnh sửa
              </button>
              {isAdmin && company.status !== 'terminated' && (
                <button className={s.btnDanger} onClick={() => setShowTerminate(true)}>
                  Kết thúc HĐ
                </button>
              )}
              {isAdmin && (
                <button
                  className={s.btnDeleteIcon}
                  onClick={() => setShowDelete(true)}
                  title="Xoá công ty"
                >
                  <Trash2 size={14} />
                </button>
              )}
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
            {tid === 'notes' && noteCount > 0 && (
              <span className={s.tabCount}>{noteCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <OverviewTab
          company={company}
          isAdmin={isAdmin}
          refreshTick={overviewTick}
          onAssigned={() => {
            companiesApi.getCompany(id).then(setCompany).catch(() => {})
            setOverviewTick((t) => t + 1)
          }}
        />
      )}
      {activeTab === 'tasks' && (
        <CompanyTasksTab
          company={company}
          onTaskCountChange={(openCount) => setCompany((c) => ({ ...c, taskOpenCount: openCount }))}
        />
      )}
      {activeTab === 'client-requests' && (
        <ClientRequestsTab company={company} />
      )}
      {activeTab === 'schedules' && (
        <SchedulesTab company={company} isAdmin={isAdmin} />
      )}
      {activeTab === 'labor-contracts' && (
        <LaborContractsTab company={company} />
      )}
      {activeTab === 'csc' && (
        <ClientSupplierContractsTab company={company} />
      )}
      {activeTab === 'archive' && (
        <ArchiveTab company={company} />
      )}
      {activeTab === 'credentials' && (
        <CredentialsTab company={company} />
      )}
      {activeTab === 'documents' && (
        <DocumentsTab company={company} />
      )}
      {activeTab === 'notes' && (
        <NotesTab company={company} onNoteCountChange={setNoteCount} />
      )}

      {/* Edit modal */}
      {showEdit && (
        <CompanyFormModal
          company={company}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => {
            setCompany((c) => ({ ...c, ...updated }))
            setOverviewTick((t) => t + 1)
            setShowEdit(false)
            addToast('Đã cập nhật thông tin công ty', 'success')
          }}
        />
      )}

      {/* Terminate confirm */}
      {showTerminate && (
        <Modal title="Kết thúc hợp đồng" onClose={() => setShowTerminate(false)}>
          <div className={s.modalStack}>
            <div className={s.terminateWarn}>
              <AlertTriangle size={18} className={s.warnIconInline} />
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
          <div className={s.modalStack}>
            <div className={`${s.terminateWarn} ${s.terminateWarnDanger}`}>
              <AlertTriangle size={18} className={`${s.warnIconInline} ${s.warnIconDanger}`} />
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


// ── PlaceholderTab ─────────────────────────────────────────────────────────────

function PlaceholderTab({ icon, title, desc, phase, btnLabel, btnDisabled }) {
  return (
    <div className={s.placeholderTab}>
      <div className={s.placeholderIcon}>
        {icon}
      </div>
      <p className={s.placeholderTitle}>{title}</p>
      <p className={s.placeholderDesc}>{desc}</p>
      {phase && <span className={s.placeholderPhase}>{phase}</span>}
      {btnLabel && (
        <button className={`${s.btnOutline} ${s.btnTopTiny}`} disabled={btnDisabled}>
          {btnLabel}
        </button>
      )}
    </div>
  )
}

// ── DeleteTaskModal ────────────────────────────────────────────────────────────

function DeleteTaskModal({ task, deleting, onClose, onConfirm }) {
  return (
    <Modal title="Xoá công việc" onClose={onClose}>
      <div className={s.modalForm}>
        <div className={`${s.terminateWarn} ${s.terminateWarnDanger}`}>
          <AlertTriangle size={16} className={`${s.warnIconInline} ${s.warnIconDanger}`} />
          <span className={s.textSmall}>
            Bạn có chắc chắn muốn xoá công việc{' '}
            <strong>&ldquo;{task.title}&rdquo;</strong>?
            Hành động này không thể hoàn tác.
          </span>
        </div>
        <div className={`${s.modalActions} ${s.infoNoteWrap}`}>
          <button onClick={onClose} className={s.btnOutline} disabled={deleting}>Huỷ bỏ</button>
          <button onClick={onConfirm} disabled={deleting} className={s.btnDanger}>
            {deleting ? <Loader2 size={13} className={s.spin} /> : <Trash2 size={13} />}
            {deleting ? 'Đang xoá...' : 'Xoá công việc'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── CompanyTasksTab ────────────────────────────────────────────────────────────

function CompanyTasksTab({ company, onTaskCountChange }) {
  const navigate   = useNavigate()
  const isAdmin    = useAuthStore((st) => st.user?.role === 'admin')
  const addToast   = useToastStore((st) => st.toast)
  const getOptions = useEnumsStore((st) => st.getOptions)
  const getLabel   = useEnumsStore((st) => st.getLabel)
  const loadEnums  = useEnumsStore((st) => st.load)

  const CUR_MONTH = String(new Date().getMonth() + 1)
  const CUR_YEAR  = String(new Date().getFullYear())

  const [tasks, setTasks]           = useState([])
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 })
  const [statusCounts, setStatusCounts] = useState({})
  const [page, setPage]             = useState(1)
  const [limit, setLimit]           = useState(20)
  const [loading, setLoading]       = useState(true)
  const [availableYears, setAvailableYears] = useState([])

  const [searchInput, setSearchInput]       = useState('')
  const [search, setSearch]                 = useState('')
  const [statusFilter, setStatusFilter]     = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [isOverdue, setIsOverdue]           = useState(false)
  const [monthFilter, setMonthFilter]       = useState(CUR_MONTH)
  const [yearFilter, setYearFilter]         = useState(CUR_YEAR)

  const [showCreate, setShowCreate]     = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting]         = useState(false)
  const [quickViewId, setQuickViewId]   = useState(null)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  // Reset to page 1 when filters or limit change
  useEffect(() => { setPage(1) }, [statusFilter, priorityFilter, isOverdue, monthFilter, yearFilter, limit])

  useEffect(() => {
    loadEnums()
    tasksApi.getTaskYears()
      .then((years) => setAvailableYears(years))
      .catch(() => {
        const y = parseInt(CUR_YEAR, 10)
        setAvailableYears([y, y - 1, y - 2])
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (y) return { dueDateFrom: `${y}-01-01`, dueDateTo: `${y}-12-31` }
    return {}
  }

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    tasksApi.listTasks({
      companyId:  company.id,
      search:     search        || undefined,
      status:     statusFilter  || undefined,
      priority:   priorityFilter || undefined,
      isOverdue:  isOverdue     ? true : undefined,
      ...getDateRange(),
      page,
      limit,
      sortBy:  'due_date',
      sortDir: 'asc',
    })
      .then(({ tasks: t, pagination: p, statusCounts: sc }) => {
        if (!cancelled) {
          setTasks(t)
          setPagination(p ?? { total: t.length, totalPages: 1 })
          if (sc) setStatusCounts(sc)
        }
      })
      .catch(() => { if (!cancelled) setTasks([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [company.id, search, statusFilter, priorityFilter, isOverdue, monthFilter, yearFilter, page, limit]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const cancel = load()
    return cancel
  }, [load])

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await tasksApi.deleteTask(deleteTarget.id)
      addToast(`Đã xoá "${deleteTarget.title}"`, 'success')
      setDeleteTarget(null)
      onTaskCountChange(Math.max(0, (company.taskOpenCount ?? 0) - 1))
      if (tasks.length === 1 && page > 1) {
        setPage((p) => p - 1)
      } else {
        load()
      }
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể xoá công việc', 'error')
    } finally {
      setDeleting(false)
    }
  }

  function resetFilters() {
    setSearchInput(''); setSearch('')
    setStatusFilter(''); setPriorityFilter(''); setIsOverdue(false)
    setMonthFilter(CUR_MONTH); setYearFilter(CUR_YEAR)
    setPage(1)
  }

  const activeFilters = [search, statusFilter, priorityFilter].filter(Boolean).length
    + (isOverdue ? 1 : 0)
    + (monthFilter !== CUR_MONTH ? 1 : 0)
    + (yearFilter  !== CUR_YEAR  ? 1 : 0)
  const colSpan = 8  // always 8: title + status + priority + createdAt + dueDate + assigned + progress + actions
  const from = pagination.total === 0 ? 0 : (page - 1) * limit + 1
  const to   = Math.min(page * limit, pagination.total)

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
      <div className={s.taskPanelHeader}>
        <div className={s.taskPanelHeaderTitle}>
          <h3 className={s.taskPanelTitle}>
            Công việc của khách hàng
          </h3>
          {!loading && (
            <span className={s.countPill}>
              {pagination.total}
            </span>
          )}
        </div>
        <button className={`${ts.btnPrimary} ${s.taskCreateBtnCompact}`} onClick={() => setShowCreate(true)}>
          <Plus size={13} /> Tạo công việc
        </button>
      </div>

      {/* Filter panel */}
      <div className={s.cTaskFilterPanel}>
        <div className={s.cTaskFilterHead}>
          <div className={s.cTaskFilterTitle}>
            <Filter size={12} />
            Bộ lọc
            {activeFilters > 0 && (
              <span className={s.cTaskFilterBadge}>{activeFilters} đang bật</span>
            )}
          </div>
          <button className={s.cTaskFilterReset} onClick={resetFilters}>
            <RotateCcw size={11} /> Đặt lại
          </button>
        </div>

        <div className={s.cTaskFilterGrid}>
          {/* Tìm kiếm */}
          <div className={`${s.cTaskFilterGroup} ${s.cTaskFilterGroupGrow}`}>
            <label className={s.cTaskFilterLabel}>Từ khoá</label>
            <div className={s.searchFieldWrap}>
              <Search size={12} className={s.searchFieldIcon} />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Tìm công việc..."
                className={`${s.cTaskFilterInput} ${s.cTaskFilterInputWithIcon}`}
              />
            </div>
          </div>

          {/* Tháng */}
          <div className={s.cTaskFilterGroup}>
            <label className={s.cTaskFilterLabel}>Tháng</label>
            <select value={monthFilter} onChange={(e) => { setMonthFilter(e.target.value); setPage(1) }} className={s.cTaskFilterSelect}>
              <option value="">Tất cả</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
          </div>

          {/* Năm */}
          <div className={s.cTaskFilterGroup}>
            <label className={s.cTaskFilterLabel}>Năm</label>
            <select value={yearFilter} onChange={(e) => { setYearFilter(e.target.value); setPage(1) }} className={s.cTaskFilterSelect}>
              <option value="">Tất cả</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>Năm {y}</option>
              ))}
            </select>
          </div>

          {/* Ưu tiên */}
          <div className={s.cTaskFilterGroup}>
            <label className={s.cTaskFilterLabel}>Ưu tiên</label>
            <select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); setPage(1) }} className={s.cTaskFilterSelect}>
              <option value="">Tất cả</option>
              {(getOptions('task_priority').length > 0
                ? getOptions('task_priority')
                : ['urgent', 'high', 'medium', 'low'].map((k) => ({ key: k, label: PRIORITY_LABELS[k] }))
              ).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>

          {/* Quá hạn */}
          <div className={`${s.cTaskFilterGroup} ${s.filterGroupEnd}`}>
            <label className={s.cTaskFilterLabel}>&nbsp;</label>
            <button
              className={`${s.cTaskOverdueBtn} ${isOverdue ? s.cTaskOverdueBtnActive : ''}`}
              onClick={() => { setIsOverdue((v) => !v); setPage(1) }}
            >
              Quá hạn
            </button>
          </div>
        </div>

        {/* Active filter chips */}
        <div className={`${s.filterChips} ${s.filterChipsCompact}`}>
          {/* Period chip — always show current period */}
          <span className={`${s.filterChip} ${(monthFilter !== CUR_MONTH || yearFilter !== CUR_YEAR) ? '' : s.filterChipMuted}`}>
            Kỳ: {monthFilter ? `T${monthFilter}/` : ''}{yearFilter || '—'}
            {(monthFilter !== CUR_MONTH || yearFilter !== CUR_YEAR) && (
              <button className={s.filterChipRemove} onClick={() => { setMonthFilter(CUR_MONTH); setYearFilter(CUR_YEAR); setPage(1) }}>×</button>
            )}
          </span>
          {priorityFilter && (
            <span className={s.filterChip}>
              Ưu tiên: {PRIORITY_LABELS[priorityFilter] ?? priorityFilter}
              <button className={s.filterChipRemove} onClick={() => { setPriorityFilter(''); setPage(1) }}>×</button>
            </span>
          )}
          {isOverdue && (
            <span className={`${s.filterChip} ${s.filterChipDanger}`}>
              Quá hạn
              <button className={s.filterChipRemove} onClick={() => { setIsOverdue(false); setPage(1) }}>×</button>
            </span>
          )}
          {search && (
            <span className={s.filterChip}>
              &ldquo;{search}&rdquo;
              <button className={s.filterChipRemove} onClick={() => { setSearchInput(''); setSearch(''); setPage(1) }}>×</button>
            </span>
          )}
        </div>

        {/* Status count chips */}
        <div className={s.cTaskStatusRow}>
          {[
            { key: '',              label: 'Tất cả',       color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
            { key: 'pending',       label: STATUS_LABELS.pending,         color: '#92400e', bg: '#fffbeb', border: '#fcd34d' },
            { key: 'in_progress',   label: STATUS_LABELS.in_progress,     color: '#1e40af', bg: '#eff6ff', border: '#93c5fd' },
            { key: 'on_hold',       label: STATUS_LABELS.on_hold,         color: '#6b7280', bg: '#f9fafb', border: '#d1d5db' },
            { key: 'pending_review',label: STATUS_LABELS.pending_review,  color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd' },
            { key: 'needs_revision',label: STATUS_LABELS.needs_revision,  color: '#b45309', bg: '#fff7ed', border: '#fed7aa' },
            { key: 'completed',     label: STATUS_LABELS.completed,       color: '#15803d', bg: '#f0fdf4', border: '#86efac' },
          ].map(({ key, label }) => {
            const count = key === '' ? pagination.total : (statusCounts[key] ?? 0)
            const isActive = statusFilter === key
            return (
              <button
                key={key}
                className={`${s.cTaskStatusChip} ${isActive ? `${s.cTaskStatusChipActive} ${COMPANY_TASK_STATUS_TONE[key] ?? ''}` : ''}`}
                onClick={() => { setStatusFilter(key); setPage(1) }}
              >
                <span>{label}</span>
                <span className={`${s.cTaskStatusChipCount} ${isActive ? s.cTaskStatusChipCountActive : ''}`}>{count}</span>
              </button>
            )
          })}
        </div>
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
                <th>Ngày tạo</th>
                <th>Hết hạn</th>
                <th>Phụ trách</th>
                <th>Tiến độ</th>
                <th className={s.taskActionHeadAdmin} />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {[220, 100, 80, 80, 80, 100, 80].map((w, j) => (
                      <td key={j} className={s.taskSkeletonCell}>
                        <div className={s.taskSkeletonBar} style={{ '--skeleton-w': `${w}px` }} />
                      </td>
                    ))}
                    <td />
                  </tr>
                ))
              ) : tasks.length === 0 ? (
                <tr>
                  <td colSpan={colSpan}>
                    <div className={s.taskEmptyInline}>
                      <ListTodo size={28} className={s.taskEmptyInlineIcon} />
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
                    className={`${s.cTaskRow} ${overdue ? s.cTaskRowOverdue : ''}`}
                    onClick={() => setQuickViewId(task.id)}
                  >
                    <td>
                      <div className={`${s.cTaskTitle} ${overdue ? s.cTaskTitleOverdue : ''}`}>
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
                    <td className={s.cTaskDateCell}>
                      {fmtTaskDate(task.createdAt)}
                    </td>
                    <td className={`${s.cTaskDateCell} ${overdue ? s.cTaskDueOverdue : ''}`}>
                      {fmtTaskDate(task.dueDate)}
                    </td>
                    <td className={s.cTaskAssigneeCell}>
                      {task.assignedToName ?? '—'}
                    </td>
                    <td>
                      {pct !== null ? (
                        <div className={s.cTaskProgress}>
                          <div className={s.cTaskProgressBar}>
                            <div className={`${s.cTaskProgressFill} ${pct === 100 ? s.cTaskProgressFillDone : ''}`} style={{ '--progress-width': `${pct}%` }} />
                          </div>
                          <span className={s.cTaskProgressText}>{pct}%</span>
                        </div>
                      ) : <span className={s.cTaskDash}>—</span>}
                    </td>
                    <td className={s.cTaskActionCell} onClick={(e) => e.stopPropagation()}>
                      <div className={s.cTaskActionBtns}>
                        <button
                          className={s.rowActionBtn}
                          title="Xem chi tiết"
                          onClick={() => navigate(`/tasks/${task.id}`)}
                        >
                          <Eye size={13} />
                        </button>
                        <button
                          className={`${s.rowActionBtn} ${s.rowActionDanger}`}
                          title="Xoá công việc"
                          onClick={() => setDeleteTarget(task)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination — always visible when data exists */}
        <div className={s.paginationBar}>
          <span className={s.paginationInfo}>
            {loading ? '...' : pagination.total === 0 ? '0 công việc' : `${from}–${to} / ${pagination.total}`}
          </span>
          <div className={s.paginationBtns}>
            <button className={s.paginationBtn} onClick={() => setPage(1)} disabled={page === 1 || loading}>«</button>
            <button className={s.paginationBtn} onClick={() => setPage((p) => p - 1)} disabled={page === 1 || loading}>‹</button>
            {pageWindow().map((n, i) =>
              n === '…' ? (
                <span key={`e${i}`} className={s.paginationGap}>…</span>
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
            <button className={s.paginationBtn} onClick={() => setPage((p) => p + 1)} disabled={page === (pagination.totalPages ?? 1) || loading}>›</button>
            <button className={s.paginationBtn} onClick={() => setPage(pagination.totalPages ?? 1)} disabled={page === (pagination.totalPages ?? 1) || loading}>»</button>
          </div>
          <div className={s.pageSizeWrap}>
            <span className={s.pageSizeLabel}>Hiển thị:</span>
            {[10, 20, 50].map((n) => (
              <button
                key={n}
                className={`${s.pageSizeBtn} ${limit === n ? s.pageSizeBtnActive : ''}`}
                onClick={() => setLimit(n)}
              >
                {n}
              </button>
            ))}
            <span className={s.pageSizeLabel}>/ trang</span>
          </div>
        </div>
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

      {/* Delete confirm modal */}
      {deleteTarget && (
        <DeleteTaskModal
          task={deleteTarget}
          deleting={deleting}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}

      {/* Quick view sidebar */}
      {quickViewId && (
        <TaskQuickView
          taskId={quickViewId}
          onClose={() => setQuickViewId(null)}
          onUpdated={() => load()}
        />
      )}
    </div>
  )
}
