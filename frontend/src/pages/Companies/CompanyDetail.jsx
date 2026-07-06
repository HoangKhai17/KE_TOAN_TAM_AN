import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { invalidateRefCompanies } from '../../hooks/useReferenceData'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  Building2, Pencil, AlertTriangle, ChevronRight,
  Hash, Calendar, Briefcase,
  User, UserPlus, ListTodo, CalendarDays, Lock, FileText, StickyNote,
  Loader2, Users, BarChart2, Clock, Trash2,
  Plus, Search, RotateCcw, Filter, Eye, ClipboardList, SlidersHorizontal,
  ChevronDown, X, Table2, Check, LayoutGrid, List,
} from 'lucide-react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  closestCenter, useDraggable, useDroppable,
} from '@dnd-kit/core'
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
import CustomTableTab from './CustomTableTab'
import * as companyTablesApi from '../../api/companyTables'
import TaskFormModal from '../Tasks/TaskFormModal'
import TaskQuickView from '../Tasks/TaskQuickView'
import {
  STATUS_LABELS, STATUS_CSS, PRIORITY_LABELS, PRIORITY_CSS, SOURCE_LABELS,
  STATUS_TRANSITIONS, isTaskOverdue, fmtDate as fmtTaskDate, progressPct,
  completionKind, taskStatusLabel, canEditDueDate, calcDays, calcPlannedDays,
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
  { id: 'credentials',       label: 'Tài khoản hệ thống', icon: Lock },
  { id: 'documents',         label: 'Tài liệu',           icon: FileText },
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

// ── sessionStorage: remember the active tab per company (survives F5) ───────────
const ACTIVE_TAB_KEY = (cid) => `company_detail_tab:${cid}`
function loadActiveTab(cid) {
  try { return sessionStorage.getItem(ACTIVE_TAB_KEY(cid)) || 'overview' }
  catch { return 'overview' }
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function CompanyDetail() {
  const { id }      = useParams()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((st) => st.user)
  const isAdmin     = currentUser?.role === 'admin'
  const addToast  = useToastStore((st) => st.toast)
  const getLabel  = useEnumsStore((st) => st.getLabel)
  const loadEnums = useEnumsStore((st) => st.load)

  const [activeTab, setActiveTab] = useState(() => loadActiveTab(id))
  const [customDefs, setCustomDefs] = useState([])

  // ── Kéo ngang dải tab bằng chuột (desktop không có scroll ngang) ──────────────
  const tabBarRef = useRef(null)
  const dragRef   = useRef({ down: false, moved: false, startX: 0, startScroll: 0 })

  function onTabBarMouseDown(e) {
    const el = tabBarRef.current
    if (!el) return
    dragRef.current = { down: true, moved: false, startX: e.pageX, startScroll: el.scrollLeft }
  }
  function onTabBarMouseMove(e) {
    const st = dragRef.current
    if (!st.down || !tabBarRef.current) return
    const dx = e.pageX - st.startX
    if (Math.abs(dx) > 4) st.moved = true
    if (st.moved) tabBarRef.current.scrollLeft = st.startScroll - dx
  }
  function endTabBarDrag() { dragRef.current.down = false }
  // Nếu vừa kéo (không phải click) thì chặn click để không nhảy tab ngoài ý muốn
  function onTabBarClickCapture(e) {
    if (dragRef.current.moved) { e.preventDefault(); e.stopPropagation(); dragRef.current.moved = false }
  }

  // Persist the active tab so a page reload (F5) returns to the same tab
  useEffect(() => {
    try { sessionStorage.setItem(ACTIVE_TAB_KEY(id), activeTab) } catch { /* ignore */ }
  }, [activeTab, id])

  const refetchCustomDefs = useCallback(() => {
    companyTablesApi.listDefs({ activeOnly: true }).then(setCustomDefs).catch(() => {})
  }, [])
  useEffect(() => { refetchCustomDefs() }, [refetchCustomDefs])

  const [noteCount, setNoteCount]         = useState(0)
  const [overviewTick, setOverviewTick]   = useState(0)
  const [showEdit, setShowEdit]           = useState(false)
  const [showTerminate, setShowTerminate] = useState(false)
  const [terminating, setTerminating]       = useState(false)
  const [showDelete, setShowDelete]         = useState(false)
  const [deleting, setDeleting]             = useState(false)

  useEffect(() => { loadEnums() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Thông tin công ty — React Query (cache theo id, optimistic qua setQueryData) ──
  const companyKey = ['company', 'detail', id]
  const companyQuery = useQuery({
    queryKey: companyKey,
    queryFn: () => companiesApi.getCompany(id),
    staleTime: 30_000,
    retry: false,
  })
  const company = companyQuery.data ?? null
  const loading = companyQuery.isLoading
  const error = companyQuery.isError ? (() => {
    const status = companyQuery.error?.response?.status
    return status === 404 ? 'Không tìm thấy công ty'
      : status === 403 ? 'Bạn không có quyền xem thông tin công ty này'
      : 'Lỗi tải dữ liệu'
  })() : null
  // Cập nhật optimistic vào cache (giữ hành vi setCompany cũ)
  const patchCompany = (updater) => queryClient.setQueryData(companyKey, (old) => (old ? updater(old) : old))

  // Live sync: reload company + overview cards when related data changes
  useDataSync(['data:task', 'data:company'], (payload) => {
    if (payload.companyId === id || payload.id === id) {
      queryClient.invalidateQueries({ queryKey: companyKey })
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
      patchCompany((c) => ({ ...c, status: 'terminated' }))
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
            {company.shortName && <div className={s.heroShortName}>{company.shortName}</div>}
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

      {/* Tab bar — cuộn ngang: kéo chuột trên dải tab hoặc kéo thanh cuộn */}
      <div
        className={s.tabBar}
        ref={tabBarRef}
        onMouseDown={onTabBarMouseDown}
        onMouseMove={onTabBarMouseMove}
        onMouseUp={endTabBarDrag}
        onMouseLeave={endTabBarDrag}
        onClickCapture={onTabBarClickCapture}
      >
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
        {customDefs.map((d) => (
          <button
            key={`ct_${d.id}`}
            className={`${s.tabBtn} ${activeTab === `ct_${d.id}` ? s.tabBtnActive : ''}`}
            onClick={() => setActiveTab(`ct_${d.id}`)}
          >
            <Table2 size={13} />
            {d.name}
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
            queryClient.invalidateQueries({ queryKey: companyKey })
            setOverviewTick((t) => t + 1)
          }}
        />
      )}
      {activeTab === 'tasks' && (
        <CompanyTasksTab
          company={company}
          onTaskCountChange={(openCount) => patchCompany((c) => ({ ...c, taskOpenCount: openCount }))}
        />
      )}
      {activeTab === 'client-requests' && (
        <ClientRequestsTab company={company} />
      )}
      {activeTab === 'schedules' && (
        <SchedulesTab company={company} isAdmin={isAdmin} />
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
      {activeTab.startsWith('ct_') && (() => {
        const d = customDefs.find((x) => `ct_${x.id}` === activeTab)
        return d ? <CustomTableTab def={d} company={company} onDefUpdated={refetchCustomDefs} /> : null
      })()}

      {/* Edit modal */}
      {showEdit && (
        <CompanyFormModal
          company={company}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => {
            invalidateRefCompanies(queryClient)   // tên công ty đổi → refresh dropdown
            patchCompany((c) => ({ ...c, ...updated }))
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

// ── Cột danh sách công việc (đồng bộ với trang Tasks) ─────────────────────────
// Bỏ "Tên viết tắt" vì trong 1 công ty mọi dòng đều cùng công ty.
const CT_TASK_COLUMNS = [
  { key: 'title',          label: 'Tiêu đề', fixed: true },
  { key: 'startDate',      label: 'Ngày bắt đầu' },
  { key: 'dueDate',        label: 'Hết hạn' },
  { key: 'days',           label: 'Số ngày hoàn thành' },
  { key: 'plannedDays',    label: 'Số ngày kế hoạch' },
  { key: 'source',         label: 'Nguồn tạo' },
  { key: 'createdAt',      label: 'Ngày tạo' },
  { key: 'status',         label: 'Trạng thái' },
  { key: 'priority',       label: 'Ưu tiên' },
  { key: 'progress',       label: 'Tiến độ' },
  { key: 'assignedToName', label: 'Giao cho' },
  { key: 'latestComment',  label: 'Bình luận mới nhất' },
]

const CT_STATUS_SELECT_CLASS = {
  pending: ts.qeStatusPending,
  in_progress: ts.qeStatusInProgress,
  on_hold: ts.qeStatusOnHold,
  pending_review: ts.qeStatusPendingReview,
  needs_revision: ts.qeStatusNeedsRevision,
  completed: ts.qeStatusCompleted,
}
const CT_PRIORITY_SELECT_CLASS = {
  urgent: ts.qePriorityUrgent,
  high: ts.qePriorityHigh,
  medium: ts.qePriorityMedium,
  low: ts.qePriorityLow,
}

// Ô chỉnh nhanh Ngày hết hạn (đồng bộ giao diện với trang Tasks)
function CtListDateField({ value, onChange, isOverdue }) {
  const ref = useRef(null)
  const dateStr = value ? value.slice(0, 10) : ''
  return (
    <div
      className={`${ts.qeDate} ${ts.qeDateInteractive} ${isOverdue ? ts.qeDateOverdue : ''}`}
      onClick={() => ref.current?.showPicker?.()}
    >
      <span className={ts.qeDateText}>{dateStr ? fmtTaskDate(dateStr) : '—'}</span>
      <input ref={ref} type="date" value={dateStr} onChange={onChange} className={ts.qeDateInputNative} tabIndex={-1} />
    </div>
  )
}

// ── Column-header filter machinery (per docs/018) ─────────────────────────────

/** Filter kind per task column */
function getTaskColumnFilterType(colKey) {
  if (colKey === 'status' || colKey === 'priority' || colKey === 'assignedToName' || colKey === 'source') return 'enum'
  if (colKey === 'createdAt' || colKey === 'dueDate' || colKey === 'startDate') return 'dateRange'
  if (colKey === 'progress' || colKey === 'days' || colKey === 'plannedDays') return 'numberRange'
  return 'text'
}

/** Display string used in enum checkboxes / text search */
function getTaskDisplayLabel(row, colKey) {
  switch (colKey) {
    case 'status':         return STATUS_LABELS[row.status] ?? row.status
    case 'priority':       return PRIORITY_LABELS[row.priority] ?? row.priority
    case 'startDate':      { const d = row.startDate || row.createdAt; return d ? fmtTaskDate(d) : '(Trống)' }
    case 'createdAt':      return row.createdAt ? fmtTaskDate(row.createdAt) : '(Trống)'
    case 'dueDate':        return row.dueDate ? fmtTaskDate(row.dueDate) : '(Trống)'
    case 'days':           { const d = calcDays(row);        return d !== null ? `${d}d` : '(Trống)' }
    case 'plannedDays':    { const d = calcPlannedDays(row); return d !== null ? `${d}d` : '(Trống)' }
    case 'assignedToName': return row.assignedToName || '(Chưa giao)'
    case 'latestComment':  return row.latestComment || '(Trống)'
    case 'source':         return SOURCE_LABELS[row.source] ?? row.source ?? '(Trống)'
    case 'progress': {
      const p = progressPct(row)
      return p !== null ? `${p}%` : '(Trống)'
    }
    default: {
      const v = row[colKey]
      return v != null && v !== '' ? String(v) : '(Trống)'
    }
  }
}

/** Sortable primitive for the given column */
function getTaskSortKey(row, colKey) {
  switch (colKey) {
    case 'status':         return STATUS_LABELS[row.status] ?? ''
    case 'priority':       return ({ urgent: 1, high: 2, medium: 3, low: 4 })[row.priority] ?? 5
    case 'startDate':      return row.startDate || row.createdAt || ''
    case 'createdAt':      return row.createdAt ?? ''
    case 'dueDate':        return row.dueDate ?? ''
    case 'days':           { const d = calcDays(row);        return d == null ? Number.MAX_SAFE_INTEGER : d }
    case 'plannedDays':    { const d = calcPlannedDays(row); return d == null ? Number.MAX_SAFE_INTEGER : d }
    case 'progress':       return progressPct(row) ?? -1
    case 'assignedToName': return (row.assignedToName ?? '').toLowerCase()
    case 'latestComment':  return (row.latestComment ?? '').toLowerCase()
    case 'source':         return SOURCE_LABELS[row.source] ?? row.source ?? ''
    default:               return String(row[colKey] ?? '').toLowerCase()
  }
}

function TaskEnumFilterSection({ colKey, allRows, currentFilter, onFilterChange, onClose }) {
  const allValues = useMemo(() => {
    const seen = new Set()
    const vals = []
    for (const row of allRows) {
      const lbl = getTaskDisplayLabel(row, colKey)
      if (!seen.has(lbl)) { seen.add(lbl); vals.push(lbl) }
    }
    return vals.sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }))
  }, [allRows, colKey])

  const selected = useMemo(
    () => (!currentFilter ? new Set(allValues) : currentFilter),
    [currentFilter, allValues]
  )

  function toggleValue(val) {
    const next = new Set(selected)
    next.has(val) ? next.delete(val) : next.add(val)
    onFilterChange(colKey, next.size === allValues.length ? null : next)
  }
  function toggleAll() {
    onFilterChange(colKey, selected.size === allValues.length ? new Set() : null)
  }

  const allChecked  = selected.size === allValues.length
  const noneChecked = selected.size === 0

  return (
    <>
      <label className={s.hdldDdSelectAll}>
        <input
          type="checkbox"
          checked={allChecked}
          ref={(el) => { if (el) el.indeterminate = !allChecked && !noneChecked }}
          onChange={toggleAll}
        />
        Chọn tất cả ({allValues.length})
      </label>
      <div className={s.hdldDdValueList}>
        {allValues.map((val) => (
          <label key={val} className={s.hdldDdValueItem}>
            <input type="checkbox" checked={selected.has(val)} onChange={() => toggleValue(val)} />
            <span className={s.hdldDdValueText}>{val}</span>
          </label>
        ))}
      </div>
      <div className={s.hdldDdFooter}>
        <button className={s.hdldDdClearBtn} onClick={() => { onFilterChange(colKey, null); onClose() }}>
          Xoá bộ lọc
        </button>
      </div>
    </>
  )
}

function TaskTextFilterSection({ colKey, currentFilter, onFilterChange }) {
  const [query, setQuery] = useState(typeof currentFilter === 'string' ? currentFilter : '')
  const inputRef = useRef(null)
  useEffect(() => { inputRef.current?.focus() }, [])
  return (
    <div className={s.hdldDdFilterSection}>
      <input
        ref={inputRef}
        type="text"
        className={s.hdldDdInput}
        placeholder="Tìm kiếm..."
        value={query}
        onChange={(e) => { setQuery(e.target.value); onFilterChange(colKey, e.target.value.trim() || null) }}
      />
      {query && (
        <div className={s.hdldDdFooter}>
          <button className={s.hdldDdClearBtn} onClick={() => { setQuery(''); onFilterChange(colKey, null) }}>
            Xoá bộ lọc
          </button>
        </div>
      )}
    </div>
  )
}

function TaskDateRangeFilterSection({ colKey, currentFilter, onFilterChange }) {
  const [from, setFrom] = useState(currentFilter?.from ?? '')
  const [to,   setTo  ] = useState(currentFilter?.to   ?? '')
  function apply(f, t) { onFilterChange(colKey, f || t ? { from: f, to: t } : null) }
  return (
    <div className={s.hdldDdFilterSection}>
      <div className={s.hdldDdRangeGroup}>
        <div className={s.hdldDdRangeRow}>
          <span className={s.hdldDdRangeLabel}>Từ ngày</span>
          <input type="date" className={s.hdldDdInput} value={from}
            onChange={(e) => { setFrom(e.target.value); apply(e.target.value, to) }} />
        </div>
        <div className={s.hdldDdRangeRow}>
          <span className={s.hdldDdRangeLabel}>Đến ngày</span>
          <input type="date" className={s.hdldDdInput} value={to}
            onChange={(e) => { setTo(e.target.value); apply(from, e.target.value) }} />
        </div>
      </div>
      {(from || to) && (
        <div className={s.hdldDdFooter}>
          <button className={s.hdldDdClearBtn}
            onClick={() => { setFrom(''); setTo(''); onFilterChange(colKey, null) }}>
            Xoá bộ lọc
          </button>
        </div>
      )}
    </div>
  )
}

function TaskNumberRangeFilterSection({ colKey, currentFilter, onFilterChange }) {
  const [minVal, setMinVal] = useState(currentFilter?.min ?? '')
  const [maxVal, setMaxVal] = useState(currentFilter?.max ?? '')
  function apply(mn, mx) { onFilterChange(colKey, mn !== '' || mx !== '' ? { min: mn, max: mx } : null) }
  return (
    <div className={s.hdldDdFilterSection}>
      <div className={s.hdldDdRangeGroup}>
        <div className={s.hdldDdRangeRow}>
          <span className={s.hdldDdRangeLabel}>Tối thiểu</span>
          <input type="number" className={s.hdldDdInput} placeholder="0" value={minVal}
            onChange={(e) => { setMinVal(e.target.value); apply(e.target.value, maxVal) }} />
        </div>
        <div className={s.hdldDdRangeRow}>
          <span className={s.hdldDdRangeLabel}>Tối đa</span>
          <input type="number" className={s.hdldDdInput} placeholder="∞" value={maxVal}
            onChange={(e) => { setMaxVal(e.target.value); apply(minVal, e.target.value) }} />
        </div>
      </div>
      {(minVal !== '' || maxVal !== '') && (
        <div className={s.hdldDdFooter}>
          <button className={s.hdldDdClearBtn}
            onClick={() => { setMinVal(''); setMaxVal(''); onFilterChange(colKey, null) }}>
            Xoá bộ lọc
          </button>
        </div>
      )}
    </div>
  )
}

function TaskColumnFilterDropdown({ colKey, allRows, currentFilter, sortState, onSort, onFilterChange, onClose, style }) {
  const dropRef    = useRef(null)
  const filterType = getTaskColumnFilterType(colKey)

  useEffect(() => {
    function handler(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        if (!e.target.closest('[data-hdld-filter-btn]')) onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const activeAsc  = sortState.col === colKey && sortState.dir === 'asc'
  const activeDesc = sortState.col === colKey && sortState.dir === 'desc'

  return (
    <div ref={dropRef} className={s.hdldFilterDropdown} style={style}>
      <div className={s.hdldDdSortSection}>
        <button className={`${s.hdldDdSortBtn} ${activeAsc ? s.hdldDdSortBtnActive : ''}`}
          onClick={() => onSort(colKey, 'asc')}>↑&nbsp; Sắp xếp A → Z</button>
        <button className={`${s.hdldDdSortBtn} ${activeDesc ? s.hdldDdSortBtnActive : ''}`}
          onClick={() => onSort(colKey, 'desc')}>↓&nbsp; Sắp xếp Z → A</button>
      </div>
      {filterType === 'enum' && (
        <TaskEnumFilterSection colKey={colKey} allRows={allRows} currentFilter={currentFilter}
          onFilterChange={onFilterChange} onClose={onClose} />
      )}
      {filterType === 'text' && (
        <TaskTextFilterSection colKey={colKey} currentFilter={currentFilter} onFilterChange={onFilterChange} />
      )}
      {filterType === 'dateRange' && (
        <TaskDateRangeFilterSection colKey={colKey} currentFilter={currentFilter} onFilterChange={onFilterChange} />
      )}
      {filterType === 'numberRange' && (
        <TaskNumberRangeFilterSection colKey={colKey} currentFilter={currentFilter} onFilterChange={onFilterChange} />
      )}
    </div>
  )
}

// ── Multi-select dropdown (status / priority / source filter) ─────────────────

function TaskMultiSelect({ placeholder, options, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onOut(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [open])

  function toggle(key) {
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key])
  }

  const count = selected.length
  const allChecked = options.length > 0 && count === options.length

  return (
    <div className={ts.multiSelect} ref={ref}>
      <button
        type="button"
        className={`${ts.multiSelectTrigger} ${count > 0 ? ts.multiSelectActive : ''}`}
        onClick={() => setOpen((p) => !p)}
      >
        <span className={ts.multiSelectLabel}>{count === 0 ? placeholder : `${count} đã chọn`}</span>
        {count > 0 && <span className={ts.multiSelectBadge}>{count}</span>}
        <ChevronDown size={11} className={`${ts.chevronRotate} ${open ? ts.chevronOpen : ''}`} />
      </button>
      {open && (
        <div className={ts.multiSelectDropdown}>
          <label className={ts.multiSelectItem}>
            <input type="checkbox" checked={allChecked}
              onChange={() => onChange(allChecked ? [] : options.map((o) => o.key))} />
            <span>Tất cả</span>
          </label>
          <div className={ts.multiSelectDivider} />
          {options.map((o) => (
            <label key={o.key} className={`${ts.multiSelectItem} ${selected.includes(o.key) ? ts.multiSelectItemChecked : ''}`}>
              <input type="checkbox" checked={selected.includes(o.key)} onChange={() => toggle(o.key)} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ── CompanyTasksTab ────────────────────────────────────────────────────────────

// ── sessionStorage: remember Công việc tab filters/view per company (survives F5) ─
const CT_STATE_KEY = (cid) => `company_tasks_state:${cid}`
function loadCtState(cid) {
  try { return JSON.parse(sessionStorage.getItem(CT_STATE_KEY(cid))) ?? {} }
  catch { return {} }
}
function saveCtState(cid, obj) {
  try { sessionStorage.setItem(CT_STATE_KEY(cid), JSON.stringify(obj)) } catch { /* ignore */ }
}

// ── Kanban board grouped by task source (Nguồn công việc) ───────────────────────

function SourceCardInner({ task, getLabel }) {
  const overdue = isTaskOverdue(task)
  const pct     = progressPct(task)
  return (
    <>
      <div className={`${s.cTaskTitle} ${overdue ? s.cTaskTitleOverdue : ''}`}>{task.title}</div>
      <div className={s.srcCardMeta}>
        <span className={`${ts.statusBadge} ${ts[STATUS_CSS[task.status]]}`}>
          {getLabel('task_status', task.status, STATUS_LABELS[task.status])}
        </span>
        <span className={`${ts.priorityBadge} ${ts[PRIORITY_CSS[task.priority]]}`}>
          {getLabel('task_priority', task.priority, PRIORITY_LABELS[task.priority])}
        </span>
      </div>
      <div className={s.srcCardFoot}>
        <span className={overdue ? s.cTaskDueOverdue : ''}>{fmtTaskDate(task.dueDate) ?? 'Chưa có hạn'}</span>
        <span>{task.assignedToName ?? '—'}</span>
      </div>
      {pct !== null && (
        <div className={s.cTaskProgressBar}>
          <div
            className={`${s.cTaskProgressFill} ${pct === 100 ? s.cTaskProgressFillDone : ''}`}
            style={{ '--progress-width': `${pct}%` }}
          />
        </div>
      )}
    </>
  )
}

function DraggableSourceCard({ task, onOpen, getLabel }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id, data: { source: task.source },
  })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`${ts.boardCard} ${isDragging ? ts.boardCardDragging : ''} ${transform ? ts.dragTransform : ''}`}
      style={transform ? { '--drag-x': `${transform.x}px`, '--drag-y': `${transform.y}px` } : undefined}
      onClick={() => !isDragging && onOpen(task.id)}
    >
      <SourceCardInner task={task} getLabel={getLabel} />
    </div>
  )
}

function DroppableSourceColumn({ srcKey, label, tasks, onOpen, getLabel }) {
  const { setNodeRef, isOver } = useDroppable({ id: srcKey })
  return (
    <div className={ts.boardCol}>
      <div className={ts.boardColHead}>
        <span className={ts.boardColDot} />
        <span className={ts.boardColTitle}>{label}</span>
        <span className={ts.boardColCount}>{tasks.length}</span>
      </div>
      <div ref={setNodeRef} className={`${ts.boardCards} ${isOver ? ts.boardCardsOver : ''}`}>
        {tasks.map((t) => (
          <DraggableSourceCard key={t.id} task={t} onOpen={onOpen} getLabel={getLabel} />
        ))}
        {tasks.length === 0 && <p className={ts.boardEmptyText}>Không có</p>}
      </div>
    </div>
  )
}

function SourceBoardView({ tasks, sources, onSourceChange, onOpen, getLabel }) {
  const [activeTask, setActiveTask] = useState(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const bySource = useMemo(() => {
    const map = {}
    for (const sc of sources) map[sc.key] = []
    for (const t of tasks) {
      if (map[t.source]) map[t.source].push(t)
      else (map.__other ??= []).push(t)
    }
    return map
  }, [tasks, sources])

  const cols = [...sources]
  if ((bySource.__other ?? []).length > 0) cols.push({ key: '__other', label: 'Khác' })

  function handleDragStart({ active }) {
    setActiveTask(tasks.find((t) => t.id === active.id) ?? null)
  }
  function handleDragEnd({ active, over }) {
    setActiveTask(null)
    if (!over) return
    const src = active.data.current?.source
    const dst = over.id
    if (src === dst || dst === '__other') return
    const task = tasks.find((t) => t.id === active.id)
    if (task) onSourceChange(task, dst)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className={ts.boardWrap}>
        {cols.map((sc) => (
          <DroppableSourceColumn
            key={sc.key}
            srcKey={sc.key}
            label={sc.label}
            tasks={bySource[sc.key] ?? []}
            onOpen={onOpen}
            getLabel={getLabel}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className={`${ts.boardCard} ${ts.boardCardOverlay}`}>
            <SourceCardInner task={activeTask} getLabel={getLabel} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function CompanyTasksTab({ company, onTaskCountChange }) {
  const navigate   = useNavigate()
  const isAdmin    = useAuthStore((st) => st.user?.role === 'admin')
  const addToast   = useToastStore((st) => st.toast)
  const getOptions = useEnumsStore((st) => st.getOptions)
  const getLabel   = useEnumsStore((st) => st.getLabel)
  const loadEnums  = useEnumsStore((st) => st.load)

  const CUR_MONTH = String(new Date().getMonth() + 1)
  const CUR_YEAR  = String(new Date().getFullYear())

  // Restore saved filters/view from sessionStorage (once on mount)
  const [initCt] = useState(() => loadCtState(company.id))

  const [view, setView]             = useState(initCt.view ?? 'list')
  const [tasks, setTasks]           = useState([])
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 })
  const [statusCounts, setStatusCounts] = useState({})
  const [page, setPage]             = useState(1)
  const [limit, setLimit]           = useState(initCt.limit ?? 20)
  const [loading, setLoading]       = useState(true)
  const [availableYears, setAvailableYears] = useState([])

  const [searchInput, setSearchInput]       = useState(initCt.searchInput   ?? '')
  const [search, setSearch]                 = useState(initCt.searchInput   ?? '')
  const [statusFilter, setStatusFilter]     = useState(initCt.statusFilter  ?? [])
  const [priorityFilter, setPriorityFilter] = useState(initCt.priorityFilter ?? [])
  const [sourceFilter, setSourceFilter]     = useState(initCt.sourceFilter  ?? [])
  const [isOverdue, setIsOverdue]           = useState(initCt.isOverdue     ?? false)
  const [monthFilter, setMonthFilter]       = useState(initCt.monthFilter   ?? CUR_MONTH)
  const [yearFilter, setYearFilter]         = useState(initCt.yearFilter    ?? CUR_YEAR)

  // Bulk selection
  const [selectedIds, setSelectedIds]       = useState(new Set())
  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [bulkDeleting, setBulkDeleting]     = useState(false)

  // Column-header filter / sort (client-side, per docs/018)
  const [colFilters, setColFilters]   = useState({})
  const [sortState, setSortState]     = useState(initCt.sortState ?? { col: null, dir: 'asc' })
  const [filterPopup, setFilterPopup] = useState(null)

  const [showCreate, setShowCreate]     = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting]         = useState(false)
  const [quickViewId, setQuickViewId]   = useState(null)

  // Ẩn/hiện cột (đồng bộ với trang Tasks) — lưu sessionStorage theo công ty
  const [hiddenCols, setHiddenCols] = useState(() => new Set(Array.isArray(initCt.hiddenCols) ? initCt.hiddenCols : []))
  const [showColMenu, setShowColMenu] = useState(false)
  const colMenuRef = useRef(null)
  useEffect(() => {
    if (!showColMenu) return
    function onDoc(e) { if (colMenuRef.current && !colMenuRef.current.contains(e.target)) setShowColMenu(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [showColMenu])
  const vis = (key) => !hiddenCols.has(key)
  function toggleColVisible(key) {
    setHiddenCols((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  // Reset to page 1 when filters or limit change
  useEffect(() => { setPage(1) }, [statusFilter, priorityFilter, sourceFilter, isOverdue, monthFilter, yearFilter, colFilters, sortState, limit])

  // Persist filters/view to sessionStorage (survives F5). colFilters holds Sets → skipped.
  useEffect(() => {
    saveCtState(company.id, {
      view, limit, searchInput, statusFilter, priorityFilter, sourceFilter,
      isOverdue, monthFilter, yearFilter, sortState, hiddenCols: [...hiddenCols],
    })
  }, [company.id, view, limit, searchInput, statusFilter, priorityFilter, sourceFilter, isOverdue, monthFilter, yearFilter, sortState, hiddenCols])

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
    // Load the whole period (server-side coarse filters); column-header filter,
    // sort and pagination are applied client-side on top of this set.
    tasksApi.listTasks({
      companyId:  company.id,
      search:     search                         || undefined,
      status:     statusFilter.length   ? statusFilter   : undefined,
      priority:   priorityFilter.length ? priorityFilter : undefined,
      source:     sourceFilter.length   ? sourceFilter   : undefined,
      isOverdue:  isOverdue     ? true : undefined,
      ...getDateRange(),
      page:  1,
      limit: 100,
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
  }, [company.id, search, statusFilter, priorityFilter, sourceFilter, isOverdue, monthFilter, yearFilter]) // eslint-disable-line react-hooks/exhaustive-deps

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
      load()
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể xoá công việc', 'error')
    } finally {
      setDeleting(false)
    }
  }

  function resetFilters() {
    setSearchInput(''); setSearch('')
    setStatusFilter([]); setPriorityFilter([]); setSourceFilter([]); setIsOverdue(false)
    setMonthFilter(CUR_MONTH); setYearFilter(CUR_YEAR)
    setColFilters({}); setSortState({ col: null, dir: 'asc' })
    setPage(1)
  }

  // ── Bulk selection actions ────────────────────────────────────────────────────
  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function selectAllOnPage(checked) {
    setSelectedIds(checked ? new Set(pageRows.map((t) => t.id)) : new Set())
  }
  async function bulkComplete() {
    let done = 0, blocked = 0
    for (const id of selectedIds) {
      const task = tasks.find((t) => t.id === id)
      if (!task || task.status === 'completed') continue
      try { await tasksApi.changeTaskStatus(id, { status: 'completed' }); done++ }
      catch (err) { if (err.response?.status === 409) blocked++ }
    }
    if (done > 0) {
      addToast(`Đã hoàn thành ${done} công việc`, 'success')
      onTaskCountChange(Math.max(0, (company.taskOpenCount ?? 0) - done))
      load()
    } else if (blocked === 0) {
      addToast('Không có công việc nào được hoàn thành', 'info')
    }
    if (blocked > 0) addToast(`${blocked} công việc chưa tích đủ checklist nên không thể hoàn thành.`, 'error')
    setSelectedIds(new Set())
  }
  async function bulkDelete() {
    setBulkDeleting(true)
    let done = 0
    for (const id of [...selectedIds]) {
      try { await tasksApi.deleteTask(id); done++ } catch (_e) { /* skip */ }
    }
    addToast(`Đã xoá ${done} công việc`, done > 0 ? 'success' : 'error')
    if (done > 0) {
      onTaskCountChange(Math.max(0, (company.taskOpenCount ?? 0) - done))
      load()
    }
    setSelectedIds(new Set())
    setShowBulkDelete(false)
    setBulkDeleting(false)
  }

  // ── Kanban: change a task's source via drag-and-drop ──────────────────────────
  async function handleSourceChange(task, newSource) {
    const prevSource = task.source
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, source: newSource } : t)))
    try {
      await tasksApi.updateTask(task.id, { source: newSource })
      addToast('Đã chuyển nguồn công việc', 'success')
    } catch (err) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, source: prevSource } : t)))
      addToast(err.response?.data?.error?.message ?? 'Không thể chuyển nguồn', 'error')
    }
  }

  // ── Quick-edit trong danh sách (đồng bộ với trang Tasks) ──────────────────────
  async function handleStatusChange(task, newStatus) {
    try {
      const updated = await tasksApi.changeTaskStatus(task.id, { status: newStatus })
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      addToast(`Đã chuyển sang "${getLabel('task_status', newStatus, STATUS_LABELS[newStatus])}"`, 'success')
      if (newStatus === 'completed') onTaskCountChange(Math.max(0, (company.taskOpenCount ?? 0) - 1))
    } catch (err) {
      const status = err.response?.status
      const msg    = err.response?.data?.error?.message
      if (status === 409) addToast(msg ?? 'Còn mục checklist chưa hoàn thành. Vui lòng tích đủ checklist trước khi hoàn thành.', 'error')
      else                addToast(msg ?? 'Không thể cập nhật trạng thái', 'error')
    }
  }
  async function handlePriorityChange(task, priority) {
    try {
      const updated = await tasksApi.updateTask(task.id, { priority })
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể cập nhật ưu tiên', 'error')
    }
  }
  async function handleDueDateChange(task, dueDate) {
    try {
      const updated = await tasksApi.updateTask(task.id, { dueDate: dueDate || null })
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      addToast(dueDate ? 'Đã cập nhật ngày hết hạn' : 'Đã xoá ngày hết hạn', 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể cập nhật ngày hết hạn', 'error')
    }
  }

  const activeFilters = (search ? 1 : 0)
    + statusFilter.length + priorityFilter.length + sourceFilter.length
    + (isOverdue ? 1 : 0)
    + (monthFilter !== CUR_MONTH ? 1 : 0)
    + (yearFilter  !== CUR_YEAR  ? 1 : 0)

  // ── Client-side column-header filter + sort + pagination (docs/018) ───────────
  const displayed = useMemo(() => {
    let result = [...tasks]
    for (const [colKey, filterVal] of Object.entries(colFilters)) {
      const ft = getTaskColumnFilterType(colKey)
      if (ft === 'enum') {
        if (filterVal instanceof Set && filterVal.size > 0) {
          result = result.filter((row) => filterVal.has(getTaskDisplayLabel(row, colKey)))
        }
      } else if (ft === 'text') {
        if (typeof filterVal === 'string' && filterVal.trim()) {
          const q = filterVal.toLowerCase()
          result = result.filter((row) => getTaskDisplayLabel(row, colKey).toLowerCase().includes(q))
        }
      } else if (ft === 'dateRange') {
        if (filterVal && (filterVal.from || filterVal.to)) {
          result = result.filter((row) => {
            const raw = colKey === 'startDate' ? (row.startDate || row.createdAt) : row[colKey]
            if (!raw) return false
            const d = String(raw).substring(0, 10)
            if (filterVal.from && d < filterVal.from) return false
            if (filterVal.to   && d > filterVal.to)   return false
            return true
          })
        }
      } else if (ft === 'numberRange') {
        if (filterVal && (filterVal.min !== '' || filterVal.max !== '')) {
          result = result.filter((row) => {
            const num = colKey === 'progress'     ? progressPct(row)
                      : colKey === 'days'         ? calcDays(row)
                      : colKey === 'plannedDays'  ? calcPlannedDays(row)
                      : parseFloat(row[colKey])
            if (num === null || num === undefined || isNaN(num)) return false
            if (filterVal.min !== '' && num < parseFloat(filterVal.min)) return false
            if (filterVal.max !== '' && num > parseFloat(filterVal.max)) return false
            return true
          })
        }
      }
    }
    if (sortState.col) {
      result.sort((a, b) => {
        const ak = getTaskSortKey(a, sortState.col)
        const bk = getTaskSortKey(b, sortState.col)
        if (typeof ak === 'number' && typeof bk === 'number') {
          return sortState.dir === 'asc' ? ak - bk : bk - ak
        }
        const cmp = String(ak).localeCompare(String(bk), 'vi', { numeric: true })
        return sortState.dir === 'asc' ? cmp : -cmp
      })
    }
    return result
  }, [tasks, colFilters, sortState])

  const clientTotal      = displayed.length
  const clientTotalPages = Math.max(1, Math.ceil(clientTotal / limit))
  const safePage         = Math.min(page, clientTotalPages)
  const pageRows         = displayed.slice((safePage - 1) * limit, safePage * limit)

  const sourceOptions = getOptions('task_source').length > 0
    ? getOptions('task_source')
    : [{ key: 'manual', label: 'Thủ công' }, { key: 'auto', label: 'Tự động' }]
  const allPageSelected = pageRows.length > 0 && pageRows.every((t) => selectedIds.has(t.id))

  function openFilter(colKey, e) {
    e.stopPropagation()
    if (filterPopup?.colKey === colKey) setFilterPopup(null)
    else {
      const rect = e.currentTarget.getBoundingClientRect()
      setFilterPopup({ colKey, top: rect.bottom + 4, left: rect.left })
    }
  }
  function handleFilterChange(colKey, val) {
    setColFilters((prev) => {
      const next = { ...prev }
      if (val === null) delete next[colKey]
      else next[colKey] = val
      return next
    })
  }
  function handleSort(col, dir) { setSortState({ col, dir }) }
  function hasColFilter(colKey) {
    const f = colFilters[colKey]
    if (f == null) return false
    const t = getTaskColumnFilterType(colKey)
    if (t === 'enum')        return f instanceof Set && f.size > 0
    if (t === 'text')        return typeof f === 'string' && f.trim().length > 0
    if (t === 'dateRange')   return Boolean(f.from || f.to)
    if (t === 'numberRange') return f.min !== '' || f.max !== ''
    return false
  }
  const colFilterCount = Object.keys(colFilters).filter(hasColFilter).length
  const hasSortActive  = sortState.col !== null

  function FilterTh({ colKey, className, children }) {
    const active = hasColFilter(colKey) || sortState.col === colKey
    return (
      <th className={className}>
        <div className={s.hdldThInner}>
          <span className={s.hdldThLabel}>{children}</span>
          <button
            data-hdld-filter-btn
            className={`${s.hdldFilterBtn} ${active ? s.hdldFilterBtnActive : ''}`}
            onClick={(e) => openFilter(colKey, e)}
            title="Lọc / Sắp xếp"
          >
            <Filter size={10} />
          </button>
        </div>
      </th>
    )
  }

  const visibleDataCols = CT_TASK_COLUMNS.filter((c) => c.fixed || vis(c.key)).length
  const colSpan = visibleDataCols + 2  // + checkbox + actions
  const from = clientTotal === 0 ? 0 : (safePage - 1) * limit + 1
  const to   = Math.min(safePage * limit, clientTotal)

  function pageWindow() {
    const total = clientTotalPages
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
    if (safePage <= 4) return [1, 2, 3, 4, 5, '…', total]
    if (safePage >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total]
    return [1, '…', safePage - 1, safePage, safePage + 1, '…', total]
  }

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
        <div className={s.cTaskHeaderActions}>
          <div className={s.viewToggle}>
            <button
              className={`${s.viewToggleBtn} ${view === 'list' ? s.viewToggleBtnActive : ''}`}
              onClick={() => setView('list')}
              title="Dạng danh sách"
            >
              <List size={14} /> Danh sách
            </button>
            <button
              className={`${s.viewToggleBtn} ${view === 'board' ? s.viewToggleBtnActive : ''}`}
              onClick={() => { setView('board'); setSelectedIds(new Set()) }}
              title="Kanban theo nguồn công việc"
            >
              <LayoutGrid size={14} /> Kanban
            </button>
          </div>

          {view === 'list' && (
            <div className={ts.colMenuWrap} ref={colMenuRef}>
              <button
                className={`${s.viewToggleBtn} ${showColMenu ? s.viewToggleBtnActive : ''}`}
                onClick={() => setShowColMenu((v) => !v)}
                title="Chọn cột hiển thị"
              >
                <SlidersHorizontal size={14} /> Cột
              </button>
              {showColMenu && (
                <div className={ts.colMenu}>
                  <div className={ts.colMenuHead}>
                    <span>Cột hiển thị</span>
                    <button className={ts.colMenuReset} onClick={() => setHiddenCols(new Set())}>Hiện tất cả</button>
                  </div>
                  {CT_TASK_COLUMNS.map((c) => (
                    <label key={c.key} className={`${ts.colMenuItem} ${c.fixed ? ts.colMenuItemFixed : ''}`}>
                      <input
                        type="checkbox"
                        checked={c.fixed || !hiddenCols.has(c.key)}
                        disabled={c.fixed}
                        onChange={() => toggleColVisible(c.key)}
                      />
                      <span>{c.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <button className={`${ts.btnPrimary} ${s.taskCreateBtnCompact}`} onClick={() => setShowCreate(true)}>
            <Plus size={13} /> Tạo công việc
          </button>
        </div>
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

          {/* Trạng thái — multi-select */}
          <div className={s.cTaskFilterGroup}>
            <label className={s.cTaskFilterLabel}>Trạng thái</label>
            <TaskMultiSelect
              placeholder="Tất cả"
              options={getOptions('task_status').length > 0
                ? getOptions('task_status')
                : ['pending', 'in_progress', 'on_hold', 'pending_review', 'needs_revision', 'completed'].map((k) => ({ key: k, label: STATUS_LABELS[k] }))}
              selected={statusFilter}
              onChange={(v) => { setStatusFilter(v); setPage(1) }}
            />
          </div>

          {/* Ưu tiên — multi-select */}
          <div className={s.cTaskFilterGroup}>
            <label className={s.cTaskFilterLabel}>Ưu tiên</label>
            <TaskMultiSelect
              placeholder="Tất cả"
              options={getOptions('task_priority').length > 0
                ? getOptions('task_priority')
                : ['urgent', 'high', 'medium', 'low'].map((k) => ({ key: k, label: PRIORITY_LABELS[k] }))}
              selected={priorityFilter}
              onChange={(v) => { setPriorityFilter(v); setPage(1) }}
            />
          </div>

          {/* Nguồn công việc — multi-select */}
          <div className={s.cTaskFilterGroup}>
            <label className={s.cTaskFilterLabel}>Nguồn</label>
            <TaskMultiSelect
              placeholder="Tất cả"
              options={getOptions('task_source').length > 0
                ? getOptions('task_source')
                : [{ key: 'manual', label: 'Thủ công' }, { key: 'auto', label: 'Tự động' }]}
              selected={sourceFilter}
              onChange={(v) => { setSourceFilter(v); setPage(1) }}
            />
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
          {priorityFilter.map((p) => (
            <span key={p} className={s.filterChip}>
              Ưu tiên: {getLabel('task_priority', p, PRIORITY_LABELS[p] ?? p)}
              <button className={s.filterChipRemove} onClick={() => { setPriorityFilter((arr) => arr.filter((k) => k !== p)); setPage(1) }}>×</button>
            </span>
          ))}
          {sourceFilter.map((src) => (
            <span key={src} className={s.filterChip}>
              Nguồn: {getLabel('task_source', src, src === 'auto' ? 'Tự động' : 'Thủ công')}
              <button className={s.filterChipRemove} onClick={() => { setSourceFilter((arr) => arr.filter((k) => k !== src)); setPage(1) }}>×</button>
            </span>
          ))}
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
            { key: '',              label: 'Tất cả',       color: 'var(--color-primary-dark)', bg: 'var(--color-primary-bg)', border: 'var(--color-status-progress-bg)' },
            { key: 'pending',       label: STATUS_LABELS.pending,         color: 'var(--color-warning-text)', bg: 'var(--color-accent-bg-soft)', border: 'var(--color-warning-border)' },
            { key: 'in_progress',   label: STATUS_LABELS.in_progress,     color: 'var(--color-primary-deep)', bg: 'var(--color-primary-bg)', border: 'var(--color-primary-soft)' },
            { key: 'on_hold',       label: STATUS_LABELS.on_hold,         color: 'var(--color-muted)', bg: 'var(--color-bg-soft)', border: 'var(--color-border)' },
            { key: 'pending_review',label: STATUS_LABELS.pending_review,  color: 'var(--color-purple-bright)', bg: 'var(--color-purple-bg-soft)', border: 'var(--color-purple-border)' },
            { key: 'needs_revision',label: STATUS_LABELS.needs_revision,  color: 'var(--color-accent-dark)', bg: 'var(--color-warning-bg)', border: 'var(--color-warning-bg-strong)' },
            { key: 'completed',     label: STATUS_LABELS.completed,       color: 'var(--color-success-text)', bg: 'var(--color-success-surface)', border: 'var(--color-success-border)' },
          ].map(({ key, label }) => {
            const count = key === '' ? pagination.total : (statusCounts[key] ?? 0)
            const isActive = key === '' ? statusFilter.length === 0 : statusFilter.includes(key)
            return (
              <button
                key={key}
                className={`${s.cTaskStatusChip} ${isActive ? `${s.cTaskStatusChipActive} ${COMPANY_TASK_STATUS_TONE[key] ?? ''}` : ''}`}
                onClick={() => {
                  if (key === '') setStatusFilter([])
                  else setStatusFilter((arr) => arr.includes(key) ? arr.filter((k) => k !== key) : [...arr, key])
                  setPage(1)
                }}
              >
                <span>{label}</span>
                <span className={`${s.cTaskStatusChipCount} ${isActive ? s.cTaskStatusChipCountActive : ''}`}>{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Bulk action bar (list view) */}
      {view === 'list' && selectedIds.size > 0 && (
        <div className={ts.bulkBar}>
          <span className={ts.bulkCount}>{selectedIds.size} đã chọn</span>
          <span className={ts.bulkDivider} />
          <button className={ts.btnGhost} onClick={bulkComplete}>
            <Check size={13} /> Hoàn thành tất cả
          </button>
          <button className={`${ts.btnGhost} ${ts.btnDangerText}`} onClick={() => setShowBulkDelete(true)}>
            <Trash2 size={13} /> Xóa đã chọn
          </button>
          <button className={ts.btnGhost} onClick={() => setSelectedIds(new Set())}>
            Bỏ chọn
          </button>
        </div>
      )}

      {/* ── Kanban board (theo nguồn công việc) ── */}
      {view === 'board' ? (
        <div className={s.tableWrap}>
          {loading ? (
            <div className={s.cTaskBoardLoading}>Đang tải...</div>
          ) : displayed.length === 0 ? (
            <div className={s.taskEmptyInline}>
              <ListTodo size={28} className={s.taskEmptyInlineIcon} />
              {(activeFilters > 0 || colFilterCount > 0) ? 'Không tìm thấy công việc phù hợp' : 'Chưa có công việc nào'}
            </div>
          ) : (
            <SourceBoardView
              tasks={displayed}
              sources={sourceOptions}
              onSourceChange={handleSourceChange}
              onOpen={setQuickViewId}
              getLabel={getLabel}
            />
          )}
        </div>
      ) : (
      /* ── Table (list view) ── */
      <div className={s.tableWrap}>
        <div className={s.tableScroll}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={ts.thCheck}>
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={(e) => selectAllOnPage(e.target.checked)}
                    title="Chọn tất cả trên trang"
                  />
                </th>
                <FilterTh colKey="title">Tiêu đề</FilterTh>
                {vis('startDate')      && <FilterTh colKey="startDate">Ngày bắt đầu</FilterTh>}
                {vis('dueDate')        && <FilterTh colKey="dueDate">Hết hạn</FilterTh>}
                {vis('days')           && <FilterTh colKey="days">Số ngày hoàn thành</FilterTh>}
                {vis('plannedDays')    && <FilterTh colKey="plannedDays">Số ngày kế hoạch</FilterTh>}
                {vis('source')         && <FilterTh colKey="source">Nguồn tạo</FilterTh>}
                {vis('createdAt')      && <FilterTh colKey="createdAt">Ngày tạo</FilterTh>}
                {vis('status')         && <FilterTh colKey="status">Trạng thái</FilterTh>}
                {vis('priority')       && <FilterTh colKey="priority">Ưu tiên</FilterTh>}
                {vis('progress')       && <FilterTh colKey="progress">Tiến độ</FilterTh>}
                {vis('assignedToName') && <FilterTh colKey="assignedToName">Giao cho</FilterTh>}
                {vis('latestComment')  && <FilterTh colKey="latestComment">Bình luận mới nhất</FilterTh>}
                <th className={s.taskActionHeadAdmin} />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td className={ts.tdCheck} />
                    {Array.from({ length: visibleDataCols }).map((_, j) => (
                      <td key={j} className={s.taskSkeletonCell}>
                        <div className={s.taskSkeletonBar} style={{ '--skeleton-w': `${j === 0 ? 220 : 80}px` }} />
                      </td>
                    ))}
                    <td />
                  </tr>
                ))
              ) : displayed.length === 0 ? (
                <tr>
                  <td colSpan={colSpan}>
                    <div className={s.taskEmptyInline}>
                      <ListTodo size={28} className={s.taskEmptyInlineIcon} />
                      {(activeFilters > 0 || colFilterCount > 0) ? 'Không tìm thấy công việc phù hợp' : 'Chưa có công việc nào'}
                    </div>
                  </td>
                </tr>
              ) : pageRows.map((task) => {
                const overdue = isTaskOverdue(task)
                const pct     = progressPct(task)
                const days    = calcDays(task)
                const planned = calcPlannedDays(task)
                return (
                  <tr
                    key={task.id}
                    className={`${s.cTaskRow} ${selectedIds.has(task.id) ? ts.trSelected : ''} ${overdue ? s.cTaskRowOverdue : ''}`}
                    onClick={() => setQuickViewId(task.id)}
                  >
                    <td className={ts.tdCheck} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(task.id)}
                        onChange={() => toggleSelect(task.id)}
                      />
                    </td>

                    {/* Tiêu đề (cố định) */}
                    <td>
                      <div className={`${s.cTaskTitle} ${overdue ? s.cTaskTitleOverdue : ''}`}>
                        {task.title}
                      </div>
                    </td>

                    {/* Ngày bắt đầu */}
                    {vis('startDate') && (
                      <td className={s.cTaskDateCell}>
                        {fmtTaskDate(task.startDate || task.createdAt)}
                      </td>
                    )}

                    {/* Hết hạn — staff chỉ sửa được với task từ lịch định kỳ; nguồn khác chỉ admin */}
                    {vis('dueDate') && (
                      <td className={`${s.cTaskDateCell} ${overdue ? s.cTaskDueOverdue : ''}`} onClick={(e) => e.stopPropagation()}>
                        {canEditDueDate(task, isAdmin) ? (
                          <CtListDateField
                            value={task.dueDate ?? ''}
                            onChange={(e) => handleDueDateChange(task, e.target.value)}
                            isOverdue={overdue}
                          />
                        ) : (
                          <span title="Chỉ Quản trị viên được sửa (công việc này không phải từ lịch định kỳ)">
                            {task.dueDate ? fmtTaskDate(task.dueDate) : '—'}
                          </span>
                        )}
                      </td>
                    )}

                    {/* Số ngày hoàn thành (thực tế) */}
                    {vis('days') && (
                      <td>
                        {days !== null ? (
                          <span className={`${ts.daysBadge} ${task.status === 'completed' ? ts.daysBadgeDone : ''}`}>{days}d</span>
                        ) : <span className={s.cTaskDash}>—</span>}
                      </td>
                    )}

                    {/* Số ngày kế hoạch (hết hạn − bắt đầu) */}
                    {vis('plannedDays') && (
                      <td>
                        {planned !== null ? (
                          <span className={`${ts.daysBadge} ${ts.daysBadgePlan}`}>{planned}d</span>
                        ) : <span className={s.cTaskDash}>—</span>}
                      </td>
                    )}

                    {/* Nguồn tạo */}
                    {vis('source') && (
                      <td>
                        <span className={`${ts.sourceBadge} ${task.source === 'auto' ? ts.sourceAuto : ts.sourceManual}`}>
                          {getLabel('task_source', task.source, SOURCE_LABELS[task.source] ?? task.source)}
                        </span>
                      </td>
                    )}

                    {/* Ngày tạo */}
                    {vis('createdAt') && (
                      <td className={s.cTaskDateCell}>
                        {fmtTaskDate(task.createdAt)}
                      </td>
                    )}

                    {/* Trạng thái — chỉnh nhanh */}
                    {vis('status') && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <select
                          value={task.status}
                          onChange={(e) => { if (e.target.value !== task.status) handleStatusChange(task, e.target.value) }}
                          className={`${ts.qeSelect} ${ts.qeSelectStyled} ${(task.status === 'completed' && completionKind(task) === 'late') ? ts.qeStatusCompletedLate : (CT_STATUS_SELECT_CLASS[task.status] ?? '')}`}
                          title="Đổi trạng thái"
                        >
                          <option value={task.status}>{taskStatusLabel(task, getLabel)}</option>
                          {(STATUS_TRANSITIONS[task.status] ?? []).map((st) => (
                            <option key={st} value={st}>{getLabel('task_status', st, STATUS_LABELS[st])}</option>
                          ))}
                        </select>
                      </td>
                    )}

                    {/* Ưu tiên — chỉnh nhanh */}
                    {vis('priority') && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <select
                          value={task.priority ?? ''}
                          onChange={(e) => handlePriorityChange(task, e.target.value)}
                          className={`${ts.qeSelect} ${ts.qeSelectStyled} ${CT_PRIORITY_SELECT_CLASS[task.priority] ?? ''}`}
                          title="Đổi ưu tiên"
                        >
                          {['urgent', 'high', 'medium', 'low'].map((p) => (
                            <option key={p} value={p}>{getLabel('task_priority', p, PRIORITY_LABELS[p])}</option>
                          ))}
                        </select>
                      </td>
                    )}

                    {/* Tiến độ */}
                    {vis('progress') && (
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
                    )}

                    {/* Giao cho */}
                    {vis('assignedToName') && (
                      <td className={s.cTaskAssigneeCell}>
                        {task.assignedToName ?? '—'}
                      </td>
                    )}

                    {/* Bình luận mới nhất */}
                    {vis('latestComment') && (
                      <td>
                        {task.latestComment ? (
                          <div className={ts.latestCommentCell} title={`${task.latestCommentBy ?? ''}: ${task.latestComment}`}>
                            {task.latestCommentBy && <span className={ts.latestCommentBy}>{task.latestCommentBy}:</span>}
                            <span className={ts.latestCommentText}>{task.latestComment}</span>
                          </div>
                        ) : <span className={s.cTaskDash}>—</span>}
                      </td>
                    )}

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
            {loading ? '...' : clientTotal === 0 ? '0 công việc' : `${from}–${to} / ${clientTotal}`}
            {colFilterCount > 0 && ` · ${colFilterCount} lọc cột`}
            {hasSortActive && ' · đang sắp xếp'}
          </span>
          <div className={s.paginationBtns}>
            <button className={s.paginationBtn} onClick={() => setPage(1)} disabled={safePage === 1 || loading}>«</button>
            <button className={s.paginationBtn} onClick={() => setPage(safePage - 1)} disabled={safePage === 1 || loading}>‹</button>
            {pageWindow().map((n, i) =>
              n === '…' ? (
                <span key={`e${i}`} className={s.paginationGap}>…</span>
              ) : (
                <button
                  key={n}
                  className={`${s.paginationBtn} ${safePage === n ? s.paginationBtnActive : ''}`}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              )
            )}
            <button className={s.paginationBtn} onClick={() => setPage(safePage + 1)} disabled={safePage === clientTotalPages || loading}>›</button>
            <button className={s.paginationBtn} onClick={() => setPage(clientTotalPages)} disabled={safePage === clientTotalPages || loading}>»</button>
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
      )}

      {/* Bulk delete confirm modal */}
      {showBulkDelete && (
        <Modal title={`Xóa ${selectedIds.size} công việc`} onClose={() => !bulkDeleting && setShowBulkDelete(false)}>
          <div className={s.modalStack}>
            <div className={`${s.terminateWarn} ${s.terminateWarnDanger}`}>
              <AlertTriangle size={18} className={`${s.warnIconInline} ${s.warnIconDanger}`} />
              <span>
                Bạn có chắc muốn xoá <strong>{selectedIds.size}</strong> công việc đã chọn?
                Hành động này không thể hoàn tác.
              </span>
            </div>
            <div className={s.modalActions}>
              <button className={s.btnOutline} onClick={() => setShowBulkDelete(false)} disabled={bulkDeleting}>Huỷ bỏ</button>
              <button className={s.btnDanger} onClick={bulkDelete} disabled={bulkDeleting}>
                {bulkDeleting ? <Loader2 size={13} className={s.spin} /> : <Trash2 size={13} />}
                {bulkDeleting ? 'Đang xoá...' : `Xoá ${selectedIds.size} mục`}
              </button>
            </div>
          </div>
        </Modal>
      )}

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

      {/* Column-header filter dropdown — position:fixed, outside table scroll */}
      {filterPopup && (
        <TaskColumnFilterDropdown
          colKey={filterPopup.colKey}
          allRows={tasks}
          currentFilter={colFilters[filterPopup.colKey] ?? null}
          sortState={sortState}
          onSort={handleSort}
          onFilterChange={handleFilterChange}
          onClose={() => setFilterPopup(null)}
          style={{
            '--hdld-dd-top':  `${filterPopup.top}px`,
            '--hdld-dd-left': `${filterPopup.left}px`,
          }}
        />
      )}
    </div>
  )
}
