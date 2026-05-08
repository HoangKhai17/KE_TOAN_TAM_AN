import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Building2, Pencil, UserPlus, AlertTriangle } from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import Modal from '../../components/ui/Modal'
import { useAuthStore } from '../../stores/authStore'
import * as companiesApi from '../../api/companies'
import * as usersApi from '../../api/users'
import { BUSINESS_TYPE_LABELS, COMPANY_STATUS_MAP, CompanyFormModal } from './Companies'

// ── Main component ─────────────────────────────────────────────────────────────

const TABS = [
  { id: 'info',        label: 'Hồ sơ công ty' },
  { id: 'assignments', label: 'Phân công nhân viên' },
  { id: 'tasks',       label: 'Công việc' },
  { id: 'schedules',   label: 'Lịch định kỳ' },
  { id: 'docs',        label: 'Tài liệu' },
  { id: 'credentials', label: 'Tài khoản hệ thống' },
]

const PLACEHOLDER_TABS = ['tasks', 'schedules', 'docs', 'credentials']
const PLACEHOLDER_PHASE = {
  tasks:       'Phase 6',
  schedules:   'Phase 5',
  docs:        'Phase 11',
  credentials: 'Phase 9',
}

export default function CompanyDetail() {
  const { id }   = useParams()
  const isAdmin  = useAuthStore((s) => s.user?.role === 'admin')

  const [company, setCompany] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [activeTab, setActiveTab] = useState('info')

  const [showEditModal, setShowEditModal] = useState(false)
  const [showTerminateConfirm, setShowTerminateConfirm] = useState(false)

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

  async function handleTerminate() {
    try {
      await companiesApi.terminateCompany(id)
      setCompany((c) => ({ ...c, status: 'terminated' }))
      setShowTerminateConfirm(false)
    } catch (err) {
      alert(err.response?.data?.error?.message ?? 'Không thể kết thúc hợp đồng')
    }
  }

  if (loading) {
    return (
      <AppLayout title="Đang tải...">
        <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Đang tải...</div>
      </AppLayout>
    )
  }

  if (error || !company) {
    return (
      <AppLayout title="Lỗi">
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <AlertTriangle size={32} className="text-red-400" />
          <p className="text-gray-500 text-sm">{error ?? 'Không tìm thấy công ty'}</p>
          <Link to="/companies" className="text-sm text-[#0f345e] hover:underline">← Quay lại danh sách</Link>
        </div>
      </AppLayout>
    )
  }

  const statusInfo = COMPANY_STATUS_MAP[company.status] ?? { label: company.status, cls: 'bg-gray-100 text-gray-500' }

  return (
    <AppLayout title={company.name}>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-400 mb-5">
        <Link to="/companies" className="hover:text-[#0f345e] transition-colors">Khách hàng</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium truncate max-w-[240px]">{company.name}</span>
      </nav>

      {/* Company header card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#0f345e]/10 flex items-center justify-center flex-shrink-0">
              <Building2 size={22} className="text-[#0f345e]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{company.name}</h2>
              <div className="flex flex-wrap items-center gap-2.5 mt-2">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.cls}`}>
                  {statusInfo.label}
                </span>
                {company.taxCode && (
                  <span className="text-xs text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded">
                    MST: {company.taxCode}
                  </span>
                )}
                {company.businessType && (
                  <span className="text-xs text-gray-400">
                    {BUSINESS_TYPE_LABELS[company.businessType] ?? company.businessType}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Task stat + actions */}
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="text-right">
              <p className="text-2xl font-bold text-[#0f345e]">{company.taskOpenCount}</p>
              <p className="text-xs text-gray-400">Đang mở</p>
            </div>
            {company.taskOverdueCount > 0 && (
              <div className="text-right">
                <p className="text-2xl font-bold text-red-600">{company.taskOverdueCount}</p>
                <p className="text-xs text-gray-400">Trễ hạn</p>
              </div>
            )}
            {isAdmin && (
              <div className="flex gap-2 ml-2">
                <button
                  onClick={() => setShowEditModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Pencil size={14} /> Chỉnh sửa
                </button>
                {company.status !== 'terminated' && (
                  <button
                    onClick={() => setShowTerminateConfirm(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Kết thúc
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200 mb-5 overflow-x-auto">
        <div className="flex gap-0.5 min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-[#0f345e] text-[#0f345e]'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'info' && <InfoTab company={company} />}
      {activeTab === 'assignments' && (
        <AssignmentsTab
          companyId={id}
          isAdmin={isAdmin}
          onAssigned={() =>
            companiesApi.getCompany(id).then(setCompany).catch(() => {})
          }
        />
      )}
      {PLACEHOLDER_TABS.includes(activeTab) && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-sm">
            Tính năng này sẽ có trong <strong>{PLACEHOLDER_PHASE[activeTab]}</strong>.
          </p>
        </div>
      )}

      {/* Edit modal */}
      {showEditModal && (
        <CompanyFormModal
          company={company}
          onClose={() => setShowEditModal(false)}
          onSaved={(updated) => {
            setCompany((c) => ({ ...c, ...updated }))
            setShowEditModal(false)
          }}
        />
      )}

      {/* Terminate confirm */}
      {showTerminateConfirm && (
        <Modal title="Kết thúc hợp đồng" onClose={() => setShowTerminateConfirm(false)}>
          <p className="text-sm text-gray-600 mb-5">
            Bạn chắc chắn muốn kết thúc hợp đồng với <strong>{company.name}</strong>?
            Công ty sẽ chuyển sang trạng thái &quot;Đã kết thúc&quot; và không thể tạo thêm công việc mới.
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowTerminateConfirm(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Hủy
            </button>
            <button
              onClick={handleTerminate}
              className="px-5 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Xác nhận kết thúc
            </button>
          </div>
        </Modal>
      )}
    </AppLayout>
  )
}

// ── InfoTab ────────────────────────────────────────────────────────────────────

function InfoField({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</dt>
      <dd className="text-sm text-gray-700">{value || <span className="text-gray-300">—</span>}</dd>
    </div>
  )
}

function InfoTab({ company }) {
  return (
    <div className="space-y-5">
      {/* Basic info */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Thông tin cơ bản</h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
          <InfoField label="Tên công ty"       value={company.name} />
          <InfoField label="Mã số thuế"        value={company.taxCode} />
          <InfoField label="Loại hình"         value={BUSINESS_TYPE_LABELS[company.businessType]} />
          <InfoField label="Ngành nghề"        value={company.industry} />
          <InfoField label="Địa chỉ"           value={company.address} />
          <InfoField
            label="Ngày bắt đầu dịch vụ"
            value={company.serviceStartDate
              ? new Date(company.serviceStartDate).toLocaleDateString('vi-VN')
              : null}
          />
        </dl>
        {company.notes && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <dt className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Ghi chú</dt>
            <dd className="text-sm text-gray-700">{company.notes}</dd>
          </div>
        )}
      </div>

      {/* Legal rep + Contact */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Người đại diện pháp lý</h3>
          <dl className="space-y-4">
            <InfoField label="Họ tên"        value={company.legalRepName} />
            <InfoField label="Số điện thoại" value={company.legalRepPhone} />
          </dl>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Người liên hệ</h3>
          <dl className="space-y-4">
            <InfoField label="Họ tên"        value={company.contactName} />
            <InfoField label="Số điện thoại" value={company.contactPhone} />
            <InfoField label="Email"         value={company.contactEmail} />
          </dl>
        </div>
      </div>

      {/* Bank + Assigned staff */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Tài khoản ngân hàng</h3>
          <dl className="space-y-4">
            <InfoField label="Số tài khoản" value={company.bankAccount} />
            <InfoField label="Ngân hàng"    value={company.bankName} />
          </dl>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Nhân viên phụ trách hiện tại</h3>
          {company.assignedStaff ? (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#0f345e]/10 text-[#0f345e] flex items-center justify-center text-xs font-bold flex-shrink-0">
                {company.assignedStaff.name.split(' ').slice(-2).map((w) => w[0]).join('').toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">{company.assignedStaff.name}</p>
                {company.assignedStaff.jobTitle && (
                  <p className="text-xs text-gray-400">{company.assignedStaff.jobTitle}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-300">Chưa phân công</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── AssignmentsTab ─────────────────────────────────────────────────────────────

function AssignmentsTab({ companyId, isAdmin, onAssigned }) {
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
    // Refetch assignments + update parent company
    companiesApi.getAssignments(companyId).then(setAssignments).catch(() => {})
    onAssigned()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700">Lịch sử phân công</h3>
        {isAdmin && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#0f345e] border border-[#0f345e]/30 rounded-lg hover:bg-[#0f345e]/5 transition-colors"
          >
            <UserPlus size={14} />
            Phân công nhân viên
          </button>
        )}
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400 text-sm">Đang tải...</div>
      ) : assignments.length === 0 ? (
        <div className="p-8 text-center text-gray-400 text-sm">Chưa có lịch sử phân công</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Nhân viên</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Từ ngày</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Đến ngày</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Phân công bởi</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {assignments.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-gray-800">{a.staff.name}</p>
                    {a.staff.jobTitle && <p className="text-xs text-gray-400">{a.staff.jobTitle}</p>}
                  </td>
                  <td className="px-5 py-3.5 text-gray-600 text-sm">
                    {a.startDate ? new Date(a.startDate).toLocaleDateString('vi-VN') : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-gray-600 text-sm">
                    {a.endDate ? new Date(a.endDate).toLocaleDateString('vi-VN') : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-gray-500 text-sm hidden md:table-cell">
                    {a.assignedBy?.name ?? '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    {a.isCurrent ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        Hiện tại
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                        Đã kết thúc
                      </span>
                    )}
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
  const [staffList, setStaffList] = useState([])
  const [loadingStaff, setLoadingStaff] = useState(true)

  const [staffId, setStaffId]     = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)

  useEffect(() => {
    usersApi
      .listUsers({ role: 'staff', status: 'active', limit: 100 })
      .then(({ users }) => { setStaffList(users) })
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
        notes:     notes     || null,
      })
      onAssigned()
    } catch (err) {
      setError(err.response?.data?.error?.message ?? 'Không thể phân công nhân viên')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Phân công nhân viên phụ trách" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
        )}

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            Nhân viên <span className="text-red-500">*</span>
          </label>
          {loadingStaff ? (
            <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
          ) : (
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f345e]/20 focus:border-[#0f345e] bg-white"
            >
              <option value="">Chọn nhân viên...</option>
              {staffList.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}{u.jobTitle ? ` — ${u.jobTitle}` : ''}
                </option>
              ))}
            </select>
          )}
          <p className="mt-1 text-xs text-gray-400">Chỉ hiển thị nhân viên đang làm việc. Phân công mới sẽ tự động đóng phân công cũ.</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Ngày bắt đầu</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f345e]/20 focus:border-[#0f345e]"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Ghi chú</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f345e]/20 focus:border-[#0f345e] resize-none"
            placeholder="Ghi chú về việc phân công (tùy chọn)"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={loading || loadingStaff}
            className="px-5 py-2 text-sm font-semibold bg-[#0f345e] text-white rounded-lg hover:bg-[#0a2544] disabled:opacity-60 transition-colors"
          >
            {loading ? 'Đang lưu...' : 'Xác nhận phân công'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
