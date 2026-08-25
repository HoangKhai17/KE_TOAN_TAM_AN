import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { invalidateRefCompanies } from '../../hooks/useReferenceData'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Building2, Pencil, AlertTriangle, ChevronRight,
  Loader2, Trash2, Table2,
  // Icon của TABS (dải tab Hồ sơ)
  BarChart2, ListTodo, ClipboardList, CalendarDays, Lock, FileText, StickyNote, Workflow,
} from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import { CompanyFooterContext } from './companyFooter'
import Modal from '../../components/ui/Modal'
import DeleteConfirmDialog from '../../components/ui/DeleteConfirmDialog'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as companiesApi from '../../api/companies'
import { CompanyFormModal, getInitials } from './Companies'
import SchedulesTab from './SchedulesTab'
import CredentialsTab from './CredentialsTab'
import DocumentsTab from './DocumentsTab'
import NotesTab from './NotesTab'
import NotesSection from './NotesSection'
import ClientRequestsTab from './ClientRequestsTab'
import CustomTableTab from './CustomTableTab'
import OverviewTab, { StaffCard } from './CompanyOverviewTab'
import CompanyTasksTab from './CompanyTasksTab'
import ProcessesTab from './ProcessesTab'
import * as companyTablesApi from '../../api/companyTables'
import { useEnumsStore } from '../../hooks/useEnums'
import { useDataSync } from '../../hooks/useDataSync'
import s from './companies.module.css'

// ── Tab config ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview',          label: 'Tổng quan',         icon: BarChart2 },
  { id: 'credentials',       label: 'Tài khoản hệ thống', icon: Lock },
  { id: 'processes',         label: 'Quy trình',          icon: Workflow },
  { id: 'schedules',         label: 'Lịch định kỳ',       icon: CalendarDays },
  { id: 'tasks',             label: 'Công việc',          icon: ListTodo },
  { id: 'client-requests',   label: 'Yêu cầu KH',        icon: ClipboardList },
  { id: 'notes',             label: 'Ghi chú',            icon: StickyNote },
  { id: 'important-notes',   label: 'Điều cần lưu ý',     icon: AlertTriangle },
  { id: 'documents',         label: 'Tài liệu',           icon: FileText },
]

// ── 2 chế độ của trang chi tiết KH ─────────────────────────────────────────────
// /companies/:id/ho-so/:tabId        → tab nghiệp vụ (TABS)
// /companies/:id/bang-du-lieu/:defId → bảng tùy biến
const MODE_PROFILE = 'ho-so'
const MODE_TABLES  = 'bang-du-lieu'

// Nút chuyển chế độ (segmented) — style nội tuyến để không phải sửa CSS module
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
  const loadEnums = useEnumsStore((st) => st.load)

  const [customDefs, setCustomDefs] = useState([])
  const [pageFooter, setPageFooter] = useState(null)   // tab con đẩy PaginationFooter lên đây
  const isTablesMode = mode === MODE_TABLES

  // Bảng CẤP CAO (không phải bảng con) → dựng thanh tab chính. Bảng con hiện dạng sub-tab.
  const topDefs = useMemo(() => customDefs.filter((d) => !d.parentDefId), [customDefs])

  // activeTab suy ra từ URL (URL là nguồn sự thật, không dùng state nữa)
  const activeTab = useMemo(() => {
    if (isTablesMode) {
      if (tabId) return `ct_${tabId}`
      return topDefs.length ? `ct_${topDefs[0].id}` : ''
    }
    if (tabId && TABS.some((t) => t.id === tabId)) return tabId
    return 'overview'
  }, [isTablesMode, tabId, topDefs])

  // Bảng đang mở (có thể là bảng cha hoặc bảng con) + nhóm sub-tab của nó
  const activeDef = useMemo(() => customDefs.find((x) => `ct_${x.id}` === activeTab) ?? null, [customDefs, activeTab])
  const activeTopId = activeDef?.parentDefId ?? activeDef?.id ?? null
  const subDefs = useMemo(() => {
    if (!activeTopId) return []
    const children = customDefs.filter((d) => d.parentDefId === activeTopId)
    if (!children.length) return []
    const top = customDefs.find((d) => d.id === activeTopId)
    return top ? [top, ...children] : []
  }, [customDefs, activeTopId])

  // Cụm cha–con (top + mọi con) — luôn có (kể cả cụm 1 bảng). Dùng cho công thức LIÊN BẢNG.
  const clusterDefs = useMemo(() => {
    if (!activeTopId) return []
    const top = customDefs.find((d) => d.id === activeTopId)
    const children = customDefs.filter((d) => d.parentDefId === activeTopId)
    return [top, ...children].filter(Boolean)
  }, [customDefs, activeTopId])

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
    const target = lastTableIdRef.current ?? topDefs[0]?.id
    navigate(target ? `/companies/${id}/${MODE_TABLES}/${target}` : `/companies/${id}/${MODE_TABLES}`)
  }, [navigate, id, topDefs])

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

  // Vào chế độ bảng nhưng chưa chỉ định bảng → chọn bảng cấp cao đầu tiên cho URL rõ ràng
  useEffect(() => {
    if (isTablesMode && !tabId && topDefs.length) {
      navigate(`/companies/${id}/${MODE_TABLES}/${topDefs[0].id}`, { replace: true })
    }
  }, [isTablesMode, tabId, topDefs, id, navigate])

  // Nhớ vị trí gần nhất (để lần sau vào /companies/:id quay lại đúng chỗ)
  useEffect(() => {
    if (!mode) return
    const suffix = isTablesMode
      ? `${MODE_TABLES}/${tabId ?? topDefs[0]?.id ?? ''}`
      : `${MODE_PROFILE}/${activeTab}`
    try { sessionStorage.setItem(ACTIVE_TAB_KEY(id), suffix) } catch { /* ignore */ }
  }, [mode, isTablesMode, tabId, activeTab, customDefs, id])

  const refetchCustomDefs = useCallback(() => {
    companyTablesApi.listDefs({ activeOnly: true }).then(setCustomDefs).catch(() => {})
  }, [])
  useEffect(() => { refetchCustomDefs() }, [refetchCustomDefs])

  const [noteCount, setNoteCount]         = useState(0)
  const [importantNoteCount, setImportantNoteCount] = useState(0)
  const [, setOverviewTick]   = useState(0)
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
    <CompanyFooterContext.Provider value={setPageFooter}>
    <AppLayout footer={pageFooter ?? undefined}>
      {/* Breadcrumb đã có ở header chung → bỏ ở đây cho gọn layout */}

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

            {/* Hàng nút dưới tên: chuyển chế độ + hành động — dồn hết sang trái cho gọn */}
            <div className={s.heroButtonRow}>
              <button
                onClick={goProfileMode}
                className={`${s.modeBtn} ${!isTablesMode ? s.modeBtnActive : ''}`}
              >
                <Building2 size={14} /> Hồ sơ
              </button>
              <button
                onClick={goTablesMode}
                className={`${s.modeBtn} ${s.modeBtnTables} ${isTablesMode ? s.modeBtnTablesActive : ''}`}
              >
                <Table2 size={14} /> Bảng dữ liệu
                {topDefs.length > 0 && (
                  <span className={s.modeBtnCount}>{topDefs.length}</span>
                )}
              </button>

            </div>
          </div>
        </div>

        {/* Bên phải hero: Phụ trách */}
        <div className={s.heroRight}>
          <StaffCard
            company={company}
            isAdmin={isAdmin}
            inline
            onAssigned={() => {
              queryClient.invalidateQueries({ queryKey: companyKey })
              setOverviewTick((t) => t + 1)
            }}
          />
          {(isAdmin || company.assignedStaffId === currentUser?.id) && (
            <div className={s.heroActionRow}>
              <button className={`${s.btnOutline} ${s.heroEditBtn}`} onClick={() => setShowEdit(true)}>
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
                  aria-label="Xoá công ty"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          )}
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
            {tid === 'important-notes' && importantNoteCount > 0 && (
              <span className={s.tabCount}>{importantNoteCount}</span>
            )}
          </button>
        ))}
        {isTablesMode && topDefs.map((d) => (
          <button
            key={`ct_${d.id}`}
            className={`${s.tabBtn} ${activeTopId === d.id ? s.tabBtnActive : ''}`}
            onClick={() => goTableTab(d.id)}
          >
            <Table2 size={13} />
            {d.name}
          </button>
        ))}
        {isTablesMode && topDefs.length === 0 && (
          <span style={{ padding: '8px 4px', fontSize: 13, color: 'var(--color-muted)' }}>
            Chưa có bảng tùy biến nào. Quản trị viên có thể tạo trong Cài đặt.
          </span>
        )}
      </div>

      {/* Dải sub-tab: bảng cha ↔ các bảng con (chỉ hiện khi bảng cha có bảng con) */}
      {isTablesMode && subDefs.length > 0 && (
        <div className={s.subTabBar}>
          {subDefs.map((d) => (
            <button
              key={d.id}
              className={`${s.subTabBtn} ${activeDef?.id === d.id ? s.subTabBtnActive : ''}`}
              onClick={() => goTableTab(d.id)}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      {activeTab === 'overview' && (
        <OverviewTab
          company={company}
          canEdit={isAdmin || company.assignedStaffId === currentUser?.id}
          onCompanyUpdated={(updated) => patchCompany(() => updated)}
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
      {activeTab === 'processes' && (
        <ProcessesTab company={company} />
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
      {activeTab === 'important-notes' && (
        <NotesSection
          companyId={company.id}
          canEdit={isAdmin || company.assignedStaffId === currentUser?.id}
          onCountChange={setImportantNoteCount}
        />
      )}
      {activeTab.startsWith('ct_') && activeDef && (
        <CustomTableTab key={activeDef.id} def={activeDef} company={company} onDefUpdated={refetchCustomDefs} clusterDefs={clusterDefs} />
      )}

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
      <DeleteConfirmDialog
        open={showDelete}
        title="Xóa công ty"
        message={<>Bạn có chắc chắn muốn xóa vĩnh viễn công ty <strong>“{company.name}”</strong>?</>}
        warning="Nếu công ty đã có công việc hoặc lịch sử phân công, hãy dùng “Kết thúc HĐ” thay thế."
        confirmLabel="Xóa vĩnh viễn"
        loading={deleting}
        onCancel={() => !deleting && setShowDelete(false)}
        onConfirm={handleDelete}
      />
    </AppLayout>
    </CompanyFooterContext.Provider>
  )
}
