import { useState, useEffect } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Loader2, DollarSign, CalendarDays, SlidersHorizontal, Trash2 } from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import SalaryConfig from './SalaryConfig'
import PaginationFooter from '../../components/layout/PaginationFooter'
import Modal from '../../components/ui/Modal'
import DateBox from '../../components/ui/DateBox'
import { useDeleteConfirm } from '../../components/ui/DeleteConfirmDialog'
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
              block className={s.dateField}
            />
          </div>
          <div className={s.formGroup}>
            <label className={`${s.formLabel} ${s.formLabelReq}`}>Ngày kết thúc</label>
            <DateBox
              value={form.endDate ?? ''}
              onChange={(v) => setForm((p) => ({ ...p, endDate: v }))}
              min={form.startDate || ''}
              block className={s.dateField}
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
  const navigate     = useNavigate()
  const isAdmin      = useAuthStore((st) => st.user?.role === 'admin')
  const addToast     = useToastStore((st) => st.toast)
  const queryClient  = useQueryClient()
  const confirmDelete = useDeleteConfirm()

  const [tab,          setTab]          = useState('periods')  // periods | salary
  const [selPeriods,   setSelPeriods]   = useState(() => new Set())
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

  const refetchPeriods = () => queryClient.invalidateQueries({ queryKey: ['payroll', 'periods'] })

  // Xoá 1 kỳ lương rác (chỉ kỳ Nháp).
  async function handleDeletePeriod(period) {
    if (!(await confirmDelete({
      title: 'Xoá kỳ lương',
      message: <>Xoá kỳ lương <strong>Tháng {period.periodMonth}/{period.periodYear}</strong>? Toàn bộ bảng lương của kỳ sẽ bị xoá theo.</>,
    }))) return
    try {
      await payrollApi.deletePeriod(period.id)
      setSelPeriods((prev) => { const n = new Set(prev); n.delete(period.id); return n })
      addToast(`Đã xoá kỳ lương ${period.periodMonth}/${period.periodYear}`, 'success')
      refetchPeriods()
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể xoá kỳ lương', 'error')
    }
  }

  // Xoá hàng loạt các kỳ đã chọn (bỏ qua kỳ đã chốt/đã trả).
  async function handleBulkDelete() {
    const chosen = periods.filter((p) => selPeriods.has(p.id))
    const draftIds = chosen.filter((p) => p.status === 'draft').map((p) => p.id)
    const skipped  = chosen.length - draftIds.length
    if (draftIds.length === 0) { addToast('Chỉ xoá được kỳ lương đang Nháp', 'error'); return }
    if (!(await confirmDelete({
      title: 'Xoá kỳ lương đã chọn',
      message: <>Xoá <strong>{draftIds.length}</strong> kỳ lương đang Nháp?{skipped > 0 && ` (${skipped} kỳ đã chốt/đã trả sẽ được giữ lại)`}</>,
    }))) return
    let ok = 0
    for (const id of draftIds) {
      try { await payrollApi.deletePeriod(id); ok++ } catch { /* bỏ qua từng lỗi lẻ */ }
    }
    setSelPeriods(new Set())
    addToast(`Đã xoá ${ok}/${draftIds.length} kỳ lương`, ok ? 'success' : 'error')
    refetchPeriods()
  }

  return (
    <AppLayout footer={tab === 'periods' ? (
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
    ) : null}>
      <div className={s.page}>
        <div className={s.tabRow}>
          <div className={s.tabBar}>
            <button className={`${s.tabBtn} ${tab === 'periods' ? s.tabBtnActive : ''}`} onClick={() => setTab('periods')}><CalendarDays size={14} /> Kỳ lương</button>
            <button className={`${s.tabBtn} ${tab === 'salary' ? s.tabBtnActive : ''}`} onClick={() => setTab('salary')}><SlidersHorizontal size={14} /> Cấu hình lương</button>
          </div>
          {tab === 'periods' && (
            <div className={s.tabActions}>
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
              {isAdmin && selPeriods.size > 0 && (
                <button className={s.btnDanger} onClick={handleBulkDelete}>
                  <Trash2 size={14} /> Xoá ({selPeriods.size})
                </button>
              )}
              {isAdmin && (
                <button className={s.btnPrimary} onClick={() => setShowCreate(true)}>
                  <Plus size={14} /> Tạo kỳ lương
                </button>
              )}
            </div>
          )}
        </div>

        {tab === 'salary' ? <SalaryConfig /> : (<>
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
                    <th className={s.colChk}><input type="checkbox" className={s.check} title="Chọn tất cả" checked={periods.length > 0 && periods.every((p) => selPeriods.has(p.id))} onChange={(e) => setSelPeriods(e.target.checked ? new Set(periods.map((p) => p.id)) : new Set())} /></th>
                    <th className={s.colStt}>STT</th>
                    <th>Kỳ lương</th>
                    <th>Trạng thái</th>
                    <th>Bắt đầu</th>
                    <th>Kết thúc</th>
                    <th>Ghi chú</th>
                    {isAdmin && <th className={s.colAct} />}
                  </tr>
                </thead>
                <tbody>
                  {periods.map((period, idx) => (
                    <tr
                      key={period.id}
                      className={s.tableRowClickable}
                      onClick={() => navigate(`/payroll/${period.id}`)}
                    >
                      <td className={s.colChk} onClick={(e) => e.stopPropagation()}><input type="checkbox" className={s.check} checked={selPeriods.has(period.id)} onChange={() => setSelPeriods((prev) => { const n = new Set(prev); n.has(period.id) ? n.delete(period.id) : n.add(period.id); return n })} /></td>
                      <td className={s.colStt}>{(page - 1) * 24 + idx + 1}</td>
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
                      {isAdmin && (
                        <td className={s.colAct} onClick={(e) => e.stopPropagation()}>
                          {period.status === 'draft' && (
                            <button
                              className={s.iconDanger}
                              title="Xoá kỳ lương"
                              onClick={() => handleDeletePeriod(period)}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

            </>
          )}
        </div>
        </>)}

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
