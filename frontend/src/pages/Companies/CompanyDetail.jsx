import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { invalidateRefCompanies } from '../../hooks/useReferenceData'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Building2, Pencil, AlertTriangle, ChevronRight,
  Hash, Calendar, Briefcase, Loader2, Trash2, Table2,
  // Icon của TABS (dải tab Hồ sơ)
  BarChart2, ListTodo, ClipboardList, CalendarDays, Lock, FileText, StickyNote,
} from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import Modal from '../../components/ui/Modal'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as companiesApi from '../../api/companies'
import { BUSINESS_TYPE_LABELS, CompanyFormModal, getInitials, StatusPill } from './Companies'
import SchedulesTab from './SchedulesTab'
import CredentialsTab from './CredentialsTab'
import DocumentsTab from './DocumentsTab'
import NotesTab from './NotesTab'
import ClientRequestsTab from './ClientRequestsTab'
import CustomTableTab from './CustomTableTab'
import OverviewTab from './CompanyOverviewTab'
import CompanyTasksTab from './CompanyTasksTab'
import * as companyTablesApi from '../../api/companyTables'
import { useEnumsStore } from '../../hooks/useEnums'
import { useDataSync } from '../../hooks/useDataSync'
import { fmtDate } from './companyUtils'
import s from './companies.module.css'

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

// ── 2 chế độ của trang chi tiết KH ─────────────────────────────────────────────
// /companies/:id/ho-so/:tabId        → tab nghiệp vụ (TABS)
// /companies/:id/bang-du-lieu/:defId → bảng tùy biến
const MODE_PROFILE = 'ho-so'
const MODE_TABLES  = 'bang-du-lieu'

// Nút chuyển chế độ (segmented) — style nội tuyến để không phải sửa CSS module
function modeBtnStyle(active) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    height: 34, padding: '0 14px', borderRadius: 8, cursor: 'pointer',
    fontSize: 13, fontWeight: 600, transition: 'all .15s',
    border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
    background: active ? 'var(--color-primary)' : '#fff',
    color: active ? '#fff' : 'var(--color-text)',
  }
}

// ── sessionStorage: nhớ vị trí gần nhất theo công ty (để route trần điều hướng lại) ──
const ACTIVE_TAB_KEY = (cid) => `company_detail_tab:${cid}`

// Trả về hậu tố đường dẫn dạng "ho-so/tasks" | "bang-du-lieu/<defId>".
// Tương thích ngược giá trị cũ đã lưu ('overview', 'ct_<id>').
function loadActivePath(cid) {
  try {
    const v = sessionStorage.getItem(ACTIVE_TAB_KEY(cid))
    if (!v) return `${MODE_PROFILE}/overview`
    if (v.includes('/')) return v                                  // định dạng mới
    if (v.startsWith('ct_')) return `${MODE_TABLES}/${v.slice(3)}`  // cũ: bảng tùy biến
    return `${MODE_PROFILE}/${v}`                                   // cũ: tab nghiệp vụ
  } catch { return `${MODE_PROFILE}/overview` }
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function CompanyDetail() {
  const { id, mode, tabId } = useParams()
  const navigate    = useNavigate()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((st) => st.user)
  const isAdmin     = currentUser?.role === 'admin'
  const addToast  = useToastStore((st) => st.toast)
  const getLabel  = useEnumsStore((st) => st.getLabel)
  const loadEnums = useEnumsStore((st) => st.load)

  const [customDefs, setCustomDefs] = useState([])
  const isTablesMode = mode === MODE_TABLES

  // activeTab suy ra từ URL (URL là nguồn sự thật, không dùng state nữa)
  const activeTab = useMemo(() => {
    if (isTablesMode) {
      if (tabId) return `ct_${tabId}`
      return customDefs.length ? `ct_${customDefs[0].id}` : ''
    }
    if (tabId && TABS.some((t) => t.id === tabId)) return tabId
    return 'overview'
  }, [isTablesMode, tabId, customDefs])

  // Điều hướng tab (thay cho setActiveTab cũ)
  const goProfileTab = useCallback((tid) => navigate(`/companies/${id}/${MODE_PROFILE}/${tid}`), [navigate, id])
  const goTableTab   = useCallback((defId) => navigate(`/companies/${id}/${MODE_TABLES}/${defId}`), [navigate, id])

  // Nhớ tab cuối của TỪNG chế độ → chuyển qua lại không mất chỗ đang xem
  const lastProfileTabRef = useRef('overview')
  const lastTableIdRef    = useRef(null)
  useEffect(() => {
    if (!mode) return
    if (isTablesMode) { if (tabId) lastTableIdRef.current = tabId }
    else if (activeTab) lastProfileTabRef.current = activeTab
  }, [mode, isTablesMode, tabId, activeTab])

  const goProfileMode = useCallback(() => {
    navigate(`/companies/${id}/${MODE_PROFILE}/${lastProfileTabRef.current || 'overview'}`)
  }, [navigate, id])
  const goTablesMode = useCallback(() => {
    const target = lastTableIdRef.current ?? customDefs[0]?.id
    navigate(target ? `/companies/${id}/${MODE_TABLES}/${target}` : `/companies/${id}/${MODE_TABLES}`)
  }, [navigate, id, customDefs])

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

  // Route trần /companies/:id → chuyển hướng về vị trí dùng gần nhất.
  // Đồng thời hỗ trợ link cũ dạng /companies/:id?tab=client-requests (trước đây không chạy).
  useEffect(() => {
    if (mode) return
    const legacyTab = searchParams.get('tab')
    if (legacyTab && TABS.some((t) => t.id === legacyTab)) {
      navigate(`/companies/${id}/${MODE_PROFILE}/${legacyTab}`, { replace: true })
      return
    }
    navigate(`/companies/${id}/${loadActivePath(id)}`, { replace: true })
  }, [mode, id, searchParams, navigate])

  // Vào chế độ bảng nhưng chưa chỉ định bảng → chọn bảng đầu tiên cho URL rõ ràng
  useEffect(() => {
    if (isTablesMode && !tabId && customDefs.length) {
      navigate(`/companies/${id}/${MODE_TABLES}/${customDefs[0].id}`, { replace: true })
    }
  }, [isTablesMode, tabId, customDefs, id, navigate])

  // Nhớ vị trí gần nhất (để lần sau vào /companies/:id quay lại đúng chỗ)
  useEffect(() => {
    if (!mode) return
    const suffix = isTablesMode
      ? `${MODE_TABLES}/${tabId ?? customDefs[0]?.id ?? ''}`
      : `${MODE_PROFILE}/${activeTab}`
    try { sessionStorage.setItem(ACTIVE_TAB_KEY(id), suffix) } catch { /* ignore */ }
  }, [mode, isTablesMode, tabId, activeTab, customDefs, id])

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

        <div className={s.heroRight} style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
          {/* Hàng 1: chỉ số + hành động */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
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

          {/* Hàng 2: chuyển chế độ Hồ sơ ↔ Bảng dữ liệu (cùng canh phải với hàng 1) */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button onClick={goProfileMode} style={modeBtnStyle(!isTablesMode)}>
              <Building2 size={13} /> Hồ sơ
            </button>
            <button onClick={goTablesMode} style={modeBtnStyle(isTablesMode)}>
              <Table2 size={13} /> Bảng dữ liệu
              {customDefs.length > 0 && (
                <span style={{
                  marginLeft: 2, padding: '0 6px', borderRadius: 9, fontSize: 11, fontWeight: 700,
                  background: isTablesMode ? 'rgba(255,255,255,0.25)' : 'var(--color-primary-bg)',
                  color: isTablesMode ? '#fff' : 'var(--color-primary-dark)',
                }}>{customDefs.length}</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Tab bar của chế độ hiện tại — cuộn ngang: kéo chuột hoặc kéo thanh cuộn */}
      <div
        className={s.tabBar}
        ref={tabBarRef}
        onMouseDown={onTabBarMouseDown}
        onMouseMove={onTabBarMouseMove}
        onMouseUp={endTabBarDrag}
        onMouseLeave={endTabBarDrag}
        onClickCapture={onTabBarClickCapture}
      >
        {!isTablesMode && TABS.map(({ id: tid, label, icon: Icon }) => (
          <button
            key={tid}
            className={`${s.tabBtn} ${activeTab === tid ? s.tabBtnActive : ''}`}
            onClick={() => goProfileTab(tid)}
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
        {isTablesMode && customDefs.map((d) => (
          <button
            key={`ct_${d.id}`}
            className={`${s.tabBtn} ${activeTab === `ct_${d.id}` ? s.tabBtnActive : ''}`}
            onClick={() => goTableTab(d.id)}
          >
            <Table2 size={13} />
            {d.name}
          </button>
        ))}
        {isTablesMode && customDefs.length === 0 && (
          <span style={{ padding: '8px 4px', fontSize: 13, color: 'var(--color-muted)' }}>
            Chưa có bảng tùy biến nào. Quản trị viên có thể tạo trong Cài đặt.
          </span>
        )}
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
