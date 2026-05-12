import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Loader2, DollarSign } from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import Modal from '../../components/ui/Modal'
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
            <input
              type="date"
              value={form.startDate}
              onChange={set('startDate')}
              className={s.formInput}
            />
          </div>
          <div className={s.formGroup}>
            <label className={`${s.formLabel} ${s.formLabelReq}`}>Ngày kết thúc</label>
            <input
              type="date"
              value={form.endDate}
              onChange={set('endDate')}
              className={s.formInput}
            />
          </div>
          <div className={s.formGroup} style={{ gridColumn: 'span 2' }}>
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

  const [periods, setPeriods]   = useState([])
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 })
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  async function load(p = page) {
    setLoading(true)
    try {
      const result = await payrollApi.listPeriods({ page: p, limit: 24 })
      setPeriods(result.periods ?? [])
      setPagination(result.pagination ?? { total: 0, totalPages: 1 })
    } catch {
      addToast('Không thể tải danh sách kỳ lương', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(page) }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppLayout>
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

        <div className={s.card}>
          {loading ? (
            <div className={s.loadingBox}>
              <Loader2 size={18} className={s.spin} /> Đang tải...
            </div>
          ) : periods.length === 0 ? (
            <div className={s.emptyState}>
              <DollarSign size={36} style={{ marginBottom: 8 }} />
              <p style={{ fontSize: 13 }}>Chưa có kỳ lương nào.</p>
              {isAdmin && (
                <button className={s.btnPrimary} onClick={() => setShowCreate(true)} style={{ marginTop: 12 }}>
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
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/payroll/${period.id}`)}
                    >
                      <td style={{ fontWeight: 700, color: '#1e3a8a' }}>
                        Tháng {period.periodMonth}/{period.periodYear}
                      </td>
                      <td>
                        <span className={STATUS_CLASS[period.status] ?? s.badgeDraft}>
                          {STATUS_LABEL[period.status] ?? period.status}
                        </span>
                      </td>
                      <td style={{ color: 'var(--color-text-soft)', fontSize: 13 }}>
                        {fmtDate(period.startDate)}
                      </td>
                      <td style={{ color: 'var(--color-text-soft)', fontSize: 13 }}>
                        {fmtDate(period.endDate)}
                      </td>
                      <td style={{ color: 'var(--color-muted)', fontSize: 13, maxWidth: 200 }}>
                        {period.notes ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {pagination.totalPages > 1 && (
                <div className={s.paginationBar}>
                  <span className={s.paginationInfo}>
                    Tổng: {pagination.total} kỳ lương
                  </span>
                  <div className={s.paginationBtns}>
                    <button className={s.paginationBtn} onClick={() => setPage(1)} disabled={page === 1}>«</button>
                    <button className={s.paginationBtn} onClick={() => setPage((p) => p - 1)} disabled={page === 1}>‹</button>
                    {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        className={`${s.paginationBtn} ${page === n ? s.paginationBtnActive : ''}`}
                        onClick={() => setPage(n)}
                      >
                        {n}
                      </button>
                    ))}
                    <button className={s.paginationBtn} onClick={() => setPage((p) => p + 1)} disabled={page === pagination.totalPages}>›</button>
                    <button className={s.paginationBtn} onClick={() => setPage(pagination.totalPages)} disabled={page === pagination.totalPages}>»</button>
                  </div>
                </div>
              )}
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
