import { useState, useEffect } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Loader2, DollarSign } from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import PaginationFooter from '../../components/layout/PaginationFooter'
import Modal from '../../components/ui/Modal'
import DateBox from '../../components/ui/DateBox'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as payrollApi from '../../api/payroll'
import s from './payroll.module.css'

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABEL = { draft: 'Nháp', confirmed: 'Đã xác nhận', paid: 'Đã thanh toán' }
const STATUS_CLASS = { draft: s.badgeDraft, confirmed: s.badgeConfirmed, paid: s.badgePaid }

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ── CreatePeriodModal ─────────────────────────────────────────────────────────

function CreatePeriodModal({ onClose, onCreated }) {
  const addToast = useToastStore((st) => st.toast)
  const now = new Date()
  const [form, setForm] = useState({
    periodYear:  now.getFullYear(),
    periodMonth: now.getMonth() + 1,
    startDate:   `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
    endDate:     '',
    notes:       '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  function set(field) {
    return (e) => {
      const val = field === 'periodYear' || field === 'periodMonth'
        ? Number(e.target.value)
        : e.target.value
      setForm((p) => ({ ...p, [field]: val }))
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.startDate) { setError('Vui lòng chọn ngày bắt đầu'); return }
    if (!form.endDate)   { setError('Vui lòng chọn ngày kết thúc'); return }
    if (form.endDate < form.startDate) { setError('Ngày kết thúc không được nhỏ hơn ngày bắt đầu'); return }
    if (form.periodMonth < 1 || form.periodMonth > 12) { setError('Tháng không hợp lệ'); return }
    setError(null)
    setSaving(true)
    try {
      const period = await payrollApi.createPeriod({
        periodYear:  form.periodYear,
        periodMonth: form.periodMonth,
        startDate:   form.startDate,
        endDate:     form.endDate,
        notes:       form.notes.trim() || null,
      })
      addToast(`Đã tạo kỳ lương ${form.periodMonth}/${form.periodYear}`, 'success')
      onCreated(period)
    } catch (err) {
      const code = err.response?.status
      if (code === 409) {
        setError(`Kỳ lương ${form.periodMonth}/${form.periodYear} đã tồn tại`)
      } else {
        setError(err.response?.data?.error?.message ?? 'Không thể tạo kỳ lương')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Tạo kỳ lương mới" onClose={onClose}>
      <form onSubmit={handleSubmit} className={s.modalForm}>
        {error && <div className={s.errorBox}>{error}</div>}

        <div className={s.formGrid}>
          <div className={s.formGroup}>
            <label className={`${s.formLabel} ${s.formLabelReq}`}>Tháng</label>
            <input
              type="number" min={1} max={12}
              value={form.periodMonth}
              onChange={set('periodMonth')}
              className={s.formInput}
            />
          </div>
          <div className={s.formGroup}>
            <label className={`${s.formLabel} ${s.formLabelReq}`}>Năm</label>
            <input
              type="number" min={2020} max={2099}
              value={form.periodYear}
              onChange={set('periodYear')}
              className={s.formInput}
            />
          </div>
          <div className={s.formGroup}>
            <label className={`${s.formLabel} ${s.formLabelReq}`}>Ngày bắt đầu</label>
            <DateBox
              value={form.startDate ?? ''}
              onChange={(v) => setForm((p) => ({ ...p, startDate: v }))}
              block
            />
          </div>
          <div className={s.formGroup}>
            <label className={`${s.formLabel} ${s.formLabelReq}`}>Ngày kết thúc</label>
            <DateBox
              value={form.endDate ?? ''}
              onChange={(v) => setForm((p) => ({ ...p, endDate: v }))}
              min={form.startDate || ''}
              block
            />
          </div>
          <div className={`${s.formGroup} ${s.formSpan2}`}>
            <label className={s.formLabel}>Ghi chú</label>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              className={s.formTextarea}
              placeholder="Ghi chú cho kỳ lương..."
              rows={2}
            />
          </div>
        </div>

        <div className={s.modalActions}>
          <button type="button" onClick={onClose} className={s.btnSecondary} disabled={saving}>Huỷ</button>
          <button type="submit" className={s.btnPrimary} disabled={saving}>
            {saving ? <Loader2 size={13} className={s.spin} /> : <Plus size={13} />}
            {saving ? 'Đang tạo...' : 'Tạo kỳ lương'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Main Payroll page ─────────────────────────────────────────────────────────

export default function Payroll() {
  const navigate  = useNavigate()
  const isAdmin   = useAuthStore((st) => st.user?.role === 'admin')
  const addToast  = useToastStore((st) => st.toast)

  const [page,         setPage]         = useState(1)
  const [showCreate,   setShowCreate]   = useState(false)
  const [availableYears, setAvailableYears] = useState([])
  const [selectedYear,   setSelectedYear]   = useState('')   // '' = tất cả năm

  // Fetch distinct years from DB on mount
  useEffect(() => {
    payrollApi.listDistinctYears()
      .then((years) => {
        setAvailableYears(years ?? [])
        // Auto-select current year if it exists in DB
        const currentYear = new Date().getFullYear()
        if (years?.includes(currentYear)) setSelectedYear(String(currentYear))
      })
      .catch(() => {})
  }, [])

  // Reset to page 1 when year filter changes
  useEffect(() => { setPage(1) }, [selectedYear])

  // ── Danh sách kỳ lương — React Query (cache theo trang/năm) ──
  const listQuery = useQuery({
    queryKey: ['payroll', 'periods', page, selectedYear],
    queryFn: () => payrollApi.listPeriods({ page, limit: 24, ...(selectedYear ? { year: selectedYear } : {}) }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
  const periods    = listQuery.data?.periods ?? []
  const pagination = listQuery.data?.pagination ?? { total: 0, totalPages: 1 }
  const loading    = listQuery.isFetching
  const paginationFrom = pagination.total === 0 ? 0 : (page - 1) * 24 + 1
  const paginationTo = Math.min(page * 24, pagination.total)
  useEffect(() => { if (listQuery.isError) addToast('Không thể tải danh sách kỳ lương', 'error') }, [listQuery.errorUpdatedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppLayout footer={(
      <PaginationFooter
        total={pagination.total}
        from={paginationFrom}
        to={paginationTo}
        itemLabel="kỳ lương"
        page={page}
        pageSize={24}
        totalPages={pagination.totalPages}
        pageSizeOptions={[24]}
        loading={loading}
        onPageChange={setPage}
      />
    )}>
      <div className={s.page}>
        <div className={s.pageHeader}>
          <div>
            <h1 className={s.pageTitle}>Bảng lương</h1>
            <p className={s.pageSubtitle}>Quản lý kỳ lương và bảng lương nhân viên</p>
          </div>
          {isAdmin && (
            <button className={s.btnPrimary} onClick={() => setShowCreate(true)}>
              <Plus size={14} /> Tạo kỳ lương
            </button>
          )}
        </div>

        {/* Year filter bar */}
        <div className={s.filterBar}>
          <select
            className={s.filterSelect}
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
          >
            <option value="">Tất cả năm</option>
            {availableYears.map((y) => (
              <option key={y} value={String(y)}>Năm {y}</option>
            ))}
          </select>
          {selectedYear && (
            <span className={s.filterLabel}>
              Đang xem: <strong>Năm {selectedYear}</strong>
              {!loading && ` — ${pagination.total} kỳ lương`}
            </span>
          )}
        </div>

        <div className={s.card}>
          {loading ? (
            <div className={s.loadingBox}>
              <Loader2 size={18} className={s.spin} /> Đang tải...
            </div>
          ) : periods.length === 0 ? (
            <div className={s.emptyState}>
              <DollarSign size={36} className={s.emptyIcon} />
              <p className={s.emptyText}>
                {selectedYear ? `Chưa có kỳ lương nào trong năm ${selectedYear}.` : 'Chưa có kỳ lương nào.'}
              </p>
              {isAdmin && !selectedYear && (
                <button className={`${s.btnPrimary} ${s.emptyAction}`} onClick={() => setShowCreate(true)}>
                  <Plus size={13} /> Tạo kỳ lương đầu tiên
                </button>
              )}
            </div>
          ) : (
            <>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Kỳ lương</th>
                    <th>Trạng thái</th>
                    <th>Bắt đầu</th>
                    <th>Kết thúc</th>
                    <th>Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((period) => (
                    <tr
                      key={period.id}
                      className={s.tableRowClickable}
                      onClick={() => navigate(`/payroll/${period.id}`)}
                    >
                      <td className={s.periodNameCell}>
                        Tháng {period.periodMonth}/{period.periodYear}
                      </td>
                      <td>
                        <span className={STATUS_CLASS[period.status] ?? s.badgeDraft}>
                          {STATUS_LABEL[period.status] ?? period.status}
                        </span>
                      </td>
                      <td className={s.tableDateCell}>
                        {fmtDate(period.startDate)}
                      </td>
                      <td className={s.tableDateCell}>
                        {fmtDate(period.endDate)}
                      </td>
                      <td className={s.tableNoteCell}>
                        {period.notes ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

            </>
          )}
        </div>

        {showCreate && (
          <CreatePeriodModal
            onClose={() => setShowCreate(false)}
            onCreated={(period) => {
              setShowCreate(false)
              navigate(`/payroll/${period.id}`)
            }}
          />
        )}
      </div>
    </AppLayout>
  )
}
