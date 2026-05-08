import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Building2, ChevronLeft, ChevronRight } from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import Modal from '../../components/ui/Modal'
import { useAuthStore } from '../../stores/authStore'
import * as companiesApi from '../../api/companies'

// ── Constants ──────────────────────────────────────────────────────────────────

export const BUSINESS_TYPE_LABELS = {
  TNHH:       'Công ty TNHH',
  CP:          'Công ty Cổ phần',
  HKD:         'Hộ kinh doanh',
  DN_TU_NHAN:  'Doanh nghiệp tư nhân',
  KHAC:        'Khác',
}

export const COMPANY_STATUS_MAP = {
  active:     { label: 'Đang hoạt động', cls: 'bg-green-100 text-green-700' },
  inactive:   { label: 'Tạm dừng',       cls: 'bg-yellow-100 text-yellow-700' },
  terminated: { label: 'Đã kết thúc',    cls: 'bg-gray-100 text-gray-500' },
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Companies() {
  const navigate = useNavigate()
  const isAdmin  = useAuthStore((s) => s.user?.role === 'admin')

  const [companies, setCompanies]   = useState([])
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 })
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)

  const [searchInput, setSearchInput]               = useState('')
  const [search, setSearch]                         = useState('')
  const [statusFilter, setStatusFilter]             = useState('')
  const [businessTypeFilter, setBusinessTypeFilter] = useState('')
  const [page, setPage]                             = useState(1)

  const [showCreateModal, setShowCreateModal] = useState(false)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // Reset page on filter change
  useEffect(() => { setPage(1) }, [statusFilter, businessTypeFilter])

  // Fetch companies
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    companiesApi
      .listCompanies({
        page,
        limit:        20,
        status:       statusFilter       || undefined,
        businessType: businessTypeFilter || undefined,
        search:       search             || undefined,
      })
      .then(({ companies: c, pagination: p }) => {
        if (!cancelled) { setCompanies(c); setPagination(p) }
      })
      .catch(() => { if (!cancelled) setError('Không thể tải danh sách công ty') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [page, statusFilter, businessTypeFilter, search])

  return (
    <AppLayout title="Khách hàng">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Danh sách khách hàng</h2>
          <p className="text-sm text-gray-500">
            {loading ? '...' : `${pagination.total} công ty`}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#0f345e] text-white rounded-lg text-sm font-medium hover:bg-[#0a2544] transition-colors"
          >
            <Plus size={16} />
            Thêm khách hàng
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Tên công ty, mã số thuế..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f345e]/20 focus:border-[#0f345e] bg-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0f345e]/20 focus:border-[#0f345e]"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="active">Đang hoạt động</option>
          <option value="inactive">Tạm dừng</option>
          <option value="terminated">Đã kết thúc</option>
        </select>
        <select
          value={businessTypeFilter}
          onChange={(e) => setBusinessTypeFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0f345e]/20 focus:border-[#0f345e]"
        >
          <option value="">Tất cả loại hình</option>
          {Object.entries(BUSINESS_TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
        {error ? (
          <p className="p-8 text-center text-sm text-red-500">{error}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Công ty</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">MST</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Loại hình</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">NV phụ trách</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Trạng thái</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Công việc</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                ) : companies.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400">
                      Không tìm thấy công ty nào
                    </td>
                  </tr>
                ) : (
                  companies.map((c) => (
                    <CompanyRow
                      key={c.id}
                      company={c}
                      onClick={() => navigate(`/companies/${c.id}`)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">
            Trang {pagination.page}/{pagination.totalPages} — {pagination.total} công ty
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={page === pagination.totalPages}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreateModal && (
        <CompanyFormModal
          onClose={() => setShowCreateModal(false)}
          onSaved={(c) => {
            setShowCreateModal(false)
            setCompanies((prev) => [c, ...prev])
            setPagination((p) => ({ ...p, total: p.total + 1 }))
          }}
        />
      )}
    </AppLayout>
  )
}

// ── CompanyRow ─────────────────────────────────────────────────────────────────

function CompanyRow({ company, onClick }) {
  const statusInfo = COMPANY_STATUS_MAP[company.status] ?? { label: company.status, cls: 'bg-gray-100 text-gray-500' }

  return (
    <tr onClick={onClick} className="hover:bg-gray-50/70 transition-colors cursor-pointer">
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#0f345e]/10 flex items-center justify-center flex-shrink-0">
            <Building2 size={15} className="text-[#0f345e]" />
          </div>
          <span className="font-medium text-gray-800 truncate max-w-[200px]">{company.name}</span>
        </div>
      </td>
      <td className="px-5 py-3.5 text-gray-500 text-xs hidden sm:table-cell">
        {company.taxCode ?? <span className="text-gray-300">—</span>}
      </td>
      <td className="px-5 py-3.5 text-gray-500 text-xs hidden md:table-cell">
        {BUSINESS_TYPE_LABELS[company.businessType] ?? company.businessType}
      </td>
      <td className="px-5 py-3.5 text-gray-600 text-xs hidden lg:table-cell">
        {company.assignedStaff?.name ?? <span className="text-gray-300">Chưa phân công</span>}
      </td>
      <td className="px-5 py-3.5">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.cls}`}>
          {statusInfo.label}
        </span>
      </td>
      <td className="px-5 py-3.5 text-right hidden sm:table-cell">
        <div className="flex items-center justify-end gap-2">
          {company.taskOpenCount > 0 && (
            <span className="text-xs text-blue-600 font-medium">
              {company.taskOpenCount} mở
            </span>
          )}
          {company.taskOverdueCount > 0 && (
            <span className="inline-flex items-center text-xs font-medium bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
              {company.taskOverdueCount} trễ
            </span>
          )}
          {company.taskOpenCount === 0 && company.taskOverdueCount === 0 && (
            <span className="text-xs text-gray-300">—</span>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── SkeletonRow ────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gray-200 flex-shrink-0" />
          <div className="h-3 w-40 bg-gray-200 rounded" />
        </div>
      </td>
      <td className="px-5 py-3.5 hidden sm:table-cell"><div className="h-3 w-24 bg-gray-100 rounded" /></td>
      <td className="px-5 py-3.5 hidden md:table-cell"><div className="h-3 w-28 bg-gray-100 rounded" /></td>
      <td className="px-5 py-3.5 hidden lg:table-cell"><div className="h-3 w-24 bg-gray-100 rounded" /></td>
      <td className="px-5 py-3.5"><div className="h-5 w-24 bg-gray-200 rounded-full" /></td>
      <td className="px-5 py-3.5 hidden sm:table-cell"><div className="h-3 w-16 bg-gray-100 rounded ml-auto" /></td>
    </tr>
  )
}

// ── CompanyFormModal ───────────────────────────────────────────────────────────

export function CompanyFormModal({ company, onClose, onSaved }) {
  const isEdit = !!company
  const [form, setForm] = useState({
    name:             company?.name             ?? '',
    taxCode:          company?.taxCode          ?? '',
    businessType:     company?.businessType     ?? 'TNHH',
    address:          company?.address          ?? '',
    industry:         company?.industry         ?? '',
    legalRepName:     company?.legalRepName     ?? '',
    legalRepPhone:    company?.legalRepPhone    ?? '',
    contactName:      company?.contactName      ?? '',
    contactPhone:     company?.contactPhone     ?? '',
    contactEmail:     company?.contactEmail     ?? '',
    bankAccount:      company?.bankAccount      ?? '',
    bankName:         company?.bankName         ?? '',
    serviceStartDate: company?.serviceStartDate ? company.serviceStartDate.slice(0, 10) : '',
    notes:            company?.notes            ?? '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [fieldErrors, setFE]  = useState({})

  function set(field) {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setFE({})
    setLoading(true)
    try {
      const body = {
        name:             form.name,
        taxCode:          form.taxCode          || null,
        businessType:     form.businessType,
        address:          form.address          || null,
        industry:         form.industry         || null,
        legalRepName:     form.legalRepName     || null,
        legalRepPhone:    form.legalRepPhone    || null,
        contactName:      form.contactName      || null,
        contactPhone:     form.contactPhone     || null,
        contactEmail:     form.contactEmail     || null,
        bankAccount:      form.bankAccount      || null,
        bankName:         form.bankName         || null,
        serviceStartDate: form.serviceStartDate || null,
        notes:            form.notes            || null,
      }
      const saved = isEdit
        ? await companiesApi.updateCompany(company.id, body)
        : await companiesApi.createCompany(body)
      onSaved(saved)
    } catch (err) {
      const errData = err.response?.data?.error
      if (err.response?.status === 422 && errData?.details) {
        const fe = {}
        for (const d of errData.details) fe[d.field] = d.message
        setFE(fe)
      } else {
        setError(errData?.message ?? 'Đã xảy ra lỗi, vui lòng thử lại')
      }
    } finally {
      setLoading(false)
    }
  }

  const inputCls = (field) =>
    `w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f345e]/20 focus:border-[#0f345e] ${fieldErrors[field] ? 'border-red-400' : 'border-gray-200'}`

  return (
    <Modal
      title={isEdit ? 'Chỉnh sửa thông tin công ty' : 'Thêm khách hàng mới'}
      onClose={onClose}
      wide
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
        )}

        {/* Name + Business type */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Tên công ty <span className="text-red-500">*</span>
            </label>
            <input type="text" value={form.name} onChange={set('name')} required className={inputCls('name')} placeholder="Công ty TNHH ABC" />
            {fieldErrors.name && <p className="mt-1 text-xs text-red-500">{fieldErrors.name}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Loại hình</label>
            <select
              value={form.businessType}
              onChange={set('businessType')}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f345e]/20 focus:border-[#0f345e] bg-white"
            >
              {Object.entries(BUSINESS_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Tax code + Industry */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Mã số thuế</label>
            <input type="text" value={form.taxCode} onChange={set('taxCode')} className={inputCls('taxCode')} placeholder="0123456789" />
            {fieldErrors.taxCode && <p className="mt-1 text-xs text-red-500">{fieldErrors.taxCode}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Ngành nghề</label>
            <input type="text" value={form.industry} onChange={set('industry')} className={inputCls('industry')} placeholder="Thương mại, sản xuất..." />
          </div>
        </div>

        {/* Address */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Địa chỉ</label>
          <input type="text" value={form.address} onChange={set('address')} className={inputCls('address')} placeholder="123 Đường ABC, Quận XYZ, TP.HCM" />
        </div>

        {/* Legal rep */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Người đại diện pháp lý</p>
          <div className="grid grid-cols-2 gap-3">
            <input type="text" value={form.legalRepName} onChange={set('legalRepName')} className={inputCls('legalRepName')} placeholder="Họ tên" />
            <input type="tel" value={form.legalRepPhone} onChange={set('legalRepPhone')} className={inputCls('legalRepPhone')} placeholder="Số điện thoại" />
          </div>
        </div>

        {/* Contact person */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Người liên hệ</p>
          <div className="grid grid-cols-2 gap-3 mb-2">
            <input type="text" value={form.contactName} onChange={set('contactName')} className={inputCls('contactName')} placeholder="Họ tên" />
            <input type="tel" value={form.contactPhone} onChange={set('contactPhone')} className={inputCls('contactPhone')} placeholder="Số điện thoại" />
          </div>
          <input type="email" value={form.contactEmail} onChange={set('contactEmail')} className={inputCls('contactEmail')} placeholder="Email liên hệ" />
          {fieldErrors.contactEmail && <p className="mt-1 text-xs text-red-500">{fieldErrors.contactEmail}</p>}
        </div>

        {/* Bank */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Tài khoản ngân hàng</p>
          <div className="grid grid-cols-2 gap-3">
            <input type="text" value={form.bankAccount} onChange={set('bankAccount')} className={inputCls('bankAccount')} placeholder="Số tài khoản" />
            <input type="text" value={form.bankName} onChange={set('bankName')} className={inputCls('bankName')} placeholder="Tên ngân hàng" />
          </div>
        </div>

        {/* Service start date + Notes */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Ngày bắt đầu dịch vụ</label>
            <input type="date" value={form.serviceStartDate} onChange={set('serviceStartDate')} className={inputCls('serviceStartDate')} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Ghi chú</label>
            <input type="text" value={form.notes} onChange={set('notes')} className={inputCls('notes')} placeholder="Ghi chú thêm..." />
          </div>
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
            disabled={loading}
            className="px-5 py-2 text-sm font-semibold bg-[#0f345e] text-white rounded-lg hover:bg-[#0a2544] disabled:opacity-60 transition-colors"
          >
            {loading ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Thêm khách hàng'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
