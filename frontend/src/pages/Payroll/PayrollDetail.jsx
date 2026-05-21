import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Check, Pencil, DollarSign, Download, Plus, Trash2,
  AlertTriangle, Loader2, UserCog, Mail, CheckCircle2,
} from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import Modal from '../../components/ui/Modal'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as payrollApi from '../../api/payroll'
import * as usersApi from '../../api/users'
import s from './payroll.module.css'

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABEL = { draft: 'Nháp', confirmed: 'Đã xác nhận', paid: 'Đã thanh toán' }
const STATUS_CLASS = { draft: s.badgeDraft, confirmed: s.badgeConfirmed, paid: s.badgePaid }

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtVND(n) {
  if (n == null || n === '') return '—'
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(n))
}

function calcNet(rec) {
  const earn = Number(rec.baseSalary ?? 0) + Number(rec.allowances ?? 0) + Number(rec.bonus ?? 0)
  const deduct = Number(rec.bhxhEmployee ?? 0) + Number(rec.bhytEmployee ?? 0) + Number(rec.bhtnEmployee ?? 0)
    + Number(rec.pitDeduction ?? 0) + Number(rec.otherDeductions ?? 0)
  return earn - deduct
}

// ── UpsertRecordModal ─────────────────────────────────────────────────────────

function UpsertRecordModal({ periodId, existing, staffList, onClose, onSaved }) {
  const addToast = useToastStore((st) => st.toast)
  const emptyNum = (v) => (v != null && v !== 0 ? String(v) : '')

  const [form, setForm] = useState({
    userId:          existing?.userId ?? '',
    baseSalary:      emptyNum(existing?.baseSalary),
    allowances:      emptyNum(existing?.allowances),
    bonus:           emptyNum(existing?.bonus),
    bhxhEmployee:    emptyNum(existing?.bhxhEmployee),
    bhytEmployee:    emptyNum(existing?.bhytEmployee),
    bhtnEmployee:    emptyNum(existing?.bhtnEmployee),
    bhxhEmployer:    emptyNum(existing?.bhxhEmployer),
    bhytEmployer:    emptyNum(existing?.bhytEmployer),
    bhtnEmployer:    emptyNum(existing?.bhtnEmployer),
    pitDeduction:    emptyNum(existing?.pitDeduction),
    otherDeductions: emptyNum(existing?.otherDeductions),
    notes:           existing?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  function set(field) {
    return (e) => setForm((p) => ({ ...p, [field]: e.target.value }))
  }

  function numVal(v) {
    const n = parseFloat(v)
    return isNaN(n) ? 0 : Math.round(n)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.userId) { setError('Vui lòng chọn nhân viên'); return }
    setError(null)
    setSaving(true)
    try {
      const body = {
        userId:          form.userId,
        baseSalary:      numVal(form.baseSalary),
        allowances:      numVal(form.allowances),
        bonus:           numVal(form.bonus),
        bhxhEmployee:    numVal(form.bhxhEmployee),
        bhytEmployee:    numVal(form.bhytEmployee),
        bhtnEmployee:    numVal(form.bhtnEmployee),
        bhxhEmployer:    numVal(form.bhxhEmployer),
        bhytEmployer:    numVal(form.bhytEmployer),
        bhtnEmployer:    numVal(form.bhtnEmployer),
        pitDeduction:    numVal(form.pitDeduction),
        otherDeductions: numVal(form.otherDeductions),
        notes:           form.notes.trim() || null,
      }
      const record = await payrollApi.upsertRecord(periodId, body)
      addToast('Đã lưu bảng lương nhân viên', 'success')
      onSaved(record)
    } catch (err) {
      setError(err.response?.data?.error?.message ?? 'Không thể lưu')
    } finally {
      setSaving(false)
    }
  }

  const numInput = (field, label) => (
    <div className={s.formGroup}>
      <label className={s.formLabel}>{label}</label>
      <input
        type="number" min={0} step={1000}
        value={form[field]}
        onChange={set(field)}
        className={s.formInput}
        placeholder="0"
      />
    </div>
  )

  return (
    <Modal
      title={existing ? `Sửa lương: ${existing.userName ?? ''}` : 'Thêm bảng lương nhân viên'}
      onClose={onClose}
      wide
    >
      <form onSubmit={handleSubmit} className={s.modalForm}>
        {error && <div className={s.errorBox}>{error}</div>}

        <div className={s.formGroup}>
          <label className={`${s.formLabel} ${s.formLabelReq}`}>Nhân viên</label>
          <select
            value={form.userId}
            onChange={set('userId')}
            className={s.formInput}
            disabled={!!existing}
          >
            <option value="">Chọn nhân viên...</option>
            {staffList.map((u) => (
              <option key={u.id} value={u.id}>{u.name}{u.jobTitle ? ` — ${u.jobTitle}` : ''}</option>
            ))}
          </select>
        </div>

        <div className={s.recordFormGrid}>
          <div className={s.recordFormSection}>Thu nhập</div>
          {numInput('baseSalary',   'Lương cơ bản (VND)')}
          {numInput('allowances',   'Phụ cấp (VND)')}
          {numInput('bonus',        'Thưởng (VND)')}

          <div className={s.recordFormSection}>Khấu trừ NV</div>
          {numInput('bhxhEmployee', 'BHXH nhân viên')}
          {numInput('bhytEmployee', 'BHYT nhân viên')}
          {numInput('bhtnEmployee', 'BHTN nhân viên')}

          <div className={s.recordFormSection}>Đóng góp của công ty</div>
          {numInput('bhxhEmployer', 'BHXH công ty')}
          {numInput('bhytEmployer', 'BHYT công ty')}
          {numInput('bhtnEmployer', 'BHTN công ty')}

          <div className={s.recordFormSection}>Khấu trừ khác</div>
          {numInput('pitDeduction',    'Thuế TNCN')}
          {numInput('otherDeductions', 'Khấu trừ khác')}
        </div>

        <div className={s.formGroup}>
          <label className={s.formLabel}>Ghi chú</label>
          <textarea
            value={form.notes}
            onChange={set('notes')}
            className={s.formTextarea}
            rows={2}
            placeholder="Ghi chú về lương kỳ này..."
          />
        </div>

        <div className={s.modalActions}>
          <button type="button" onClick={onClose} className={s.btnSecondary} disabled={saving}>Huỷ</button>
          <button type="submit" className={s.btnPrimary} disabled={saving}>
            {saving && <Loader2 size={13} className={s.spin} />}
            {saving ? 'Đang lưu...' : <><Check size={13} /> Lưu</>}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── DeleteRecordConfirm ───────────────────────────────────────────────────────

function DeleteRecordModal({ record, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false)

  async function go() {
    setDeleting(true)
    try { await onDeleted() } finally { setDeleting(false) }
  }

  return (
    <Modal title="Xoá bản ghi lương" onClose={onClose}>
      <div className={s.modalForm}>
        <p className={s.modalText}>
          Xoá bảng lương của <strong>{record.userName}</strong> khỏi kỳ này?
        </p>
        <div className={s.modalActions}>
          <button onClick={onClose} className={s.btnSecondary} disabled={deleting}>Huỷ</button>
          <button onClick={go} className={s.btnDanger} disabled={deleting}>
            {deleting ? <Loader2 size={13} className={s.spin} /> : <Trash2 size={13} />}
            Xoá
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Main PayrollDetail ────────────────────────────────────────────────────────

export default function PayrollDetail() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const isAdmin   = useAuthStore((st) => st.user?.role === 'admin')
  const addToast  = useToastStore((st) => st.toast)

  const [period, setPeriod]   = useState(null)
  const [records, setRecords] = useState([])
  const [staffList, setStaffList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const [showUpsert, setShowUpsert] = useState(false)
  const [editRecord, setEditRecord] = useState(null)
  const [deleteRecord, setDeleteRecord] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [markingPaid, setMarkingPaid] = useState(false)
  const [exporting, setExporting]   = useState(false)
  const [sendingMail, setSendingMail] = useState(false)
  const [mailResult, setMailResult]   = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      payrollApi.getPeriod(id),
      payrollApi.listRecords(id),
      usersApi.listUsers({ status: 'active', limit: 200 }).then((r) => r.users),
    ])
      .then(([p, r, staff]) => {
        if (cancelled) return
        setPeriod(p)
        setRecords(r)
        setStaffList(staff)
      })
      .catch(() => { if (!cancelled) setError('Không thể tải dữ liệu') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])

  async function handleConfirm() {
    setConfirming(true)
    try {
      const updated = await payrollApi.confirmPeriod(id)
      setPeriod(updated)
      addToast('Đã xác nhận kỳ lương', 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể xác nhận', 'error')
    } finally {
      setConfirming(false)
    }
  }

  async function handleMarkPaid() {
    setMarkingPaid(true)
    try {
      const updated = await payrollApi.markPaid(id)
      setPeriod(updated)
      addToast('Đã đánh dấu đã thanh toán', 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể cập nhật', 'error')
    } finally {
      setMarkingPaid(false)
    }
  }

  async function handleSendMail() {
    setSendingMail(true)
    setMailResult(null)
    try {
      const result = await payrollApi.sendPayrollEmails(id)
      setMailResult(result)
      addToast(`Đã gửi ${result.sent}/${result.total} email bảng lương`, 'success')
    } catch {
      addToast('Gửi email thất bại — kiểm tra cấu hình SMTP', 'error')
    } finally {
      setSendingMail(false)
    }
  }

  async function handleExport() {
    setExporting(true)
    try {
      const response = await payrollApi.exportExcel(id)
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.download = `bang-luong-${period.periodMonth}-${period.periodYear}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      addToast('Không thể xuất Excel', 'error')
    } finally {
      setExporting(false)
    }
  }

  function handleUpserted(record) {
    setRecords((prev) => {
      const idx = prev.findIndex((r) => r.id === record.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = record
        return next
      }
      return [...prev, record]
    })
    setShowUpsert(false)
    setEditRecord(null)
  }

  async function handleDeleteRecord() {
    await payrollApi.deleteRecord(id, deleteRecord.id)
    setRecords((prev) => prev.filter((r) => r.id !== deleteRecord.id))
    setDeleteRecord(null)
    addToast('Đã xoá bản ghi lương', 'success')
  }

  if (loading) {
    return (
      <AppLayout>
        <div className={s.page}>
          <div className={`${s.loadingBox} ${s.loadingBoxLarge}`}>
            <Loader2 size={20} className={s.spin} /> Đang tải...
          </div>
        </div>
      </AppLayout>
    )
  }

  if (error || !period) {
    return (
      <AppLayout>
        <div className={s.page}>
          <div className={s.errorState}>
            <AlertTriangle size={36} className={s.errorIcon} />
            <p className={s.errorText}>{error ?? 'Không tìm thấy kỳ lương'}</p>
            <button className={s.btnSecondary} onClick={() => navigate('/payroll')}>
              <ArrowLeft size={13} /> Quay lại
            </button>
          </div>
        </div>
      </AppLayout>
    )
  }

  const isDraft = period.status === 'draft'
  const totalNet = records.reduce((sum, r) => sum + calcNet(r), 0)

  return (
    <AppLayout>
      <div className={s.page}>

        {/* Header */}
        <div className={s.detailHeader}>
          <div className={s.detailTitleRow}>
            <button className={s.btnGhost} onClick={() => navigate('/payroll')}>
              <ArrowLeft size={13} /> Danh sách
            </button>
            <h2 className={s.detailTitle}>
              Bảng lương tháng {period.periodMonth}/{period.periodYear}
            </h2>
            <span className={STATUS_CLASS[period.status] ?? s.badgeDraft}>
              {STATUS_LABEL[period.status] ?? period.status}
            </span>
          </div>

          <div className={s.detailMeta}>
            <span>Kỳ: {fmtDate(period.startDate)} — {fmtDate(period.endDate)}</span>
            <span>{records.length} nhân viên</span>
            <span className={s.detailTotal}>
              Tổng chi: {fmtVND(totalNet)}
            </span>
            {period.notes && <span className={s.detailNote}>{period.notes}</span>}
          </div>

          {isAdmin && (
            <div className={`${s.detailActions} ${s.detailActionsSpaced}`}>
              {isDraft && (
                <>
                  <button
                    className={s.btnPrimary}
                    onClick={() => { setEditRecord(null); setShowUpsert(true) }}
                  >
                    <Plus size={13} /> Thêm nhân viên
                  </button>
                  <button className={s.btnSuccess} onClick={handleConfirm} disabled={confirming}>
                    {confirming ? <Loader2 size={13} className={s.spin} /> : <Check size={13} />}
                    {confirming ? 'Đang xác nhận...' : 'Xác nhận kỳ lương'}
                  </button>
                </>
              )}
              {period.status === 'confirmed' && (
                <button className={s.btnSuccess} onClick={handleMarkPaid} disabled={markingPaid}>
                  {markingPaid ? <Loader2 size={13} className={s.spin} /> : <DollarSign size={13} />}
                  {markingPaid ? 'Đang cập nhật...' : 'Đánh dấu đã thanh toán'}
                </button>
              )}
              <button className={s.btnSecondary} onClick={handleExport} disabled={exporting}>
                {exporting ? <Loader2 size={13} className={s.spin} /> : <Download size={13} />}
                {exporting ? 'Đang xuất...' : 'Xuất Excel'}
              </button>
              <button
                className={s.btnPrimary}
                onClick={handleSendMail}
                disabled={sendingMail || records.length === 0}
                title="Gửi bảng lương qua email đến từng nhân viên"
              >
                {sendingMail
                  ? <><Loader2 size={13} className={s.spin} /> Đang gửi...</>
                  : mailResult
                    ? <><CheckCircle2 size={13} /> Đã gửi {mailResult.sent}/{mailResult.total}</>
                    : <><Mail size={13} /> Gửi email bảng lương</>}
              </button>
            </div>
          )}
        </div>

        {/* Records table */}
        <div className={s.recordsCard}>
          {records.length === 0 ? (
            <div className={s.emptyState}>
              <UserCog size={32} className={s.emptyIcon} />
              <p className={s.emptyText}>Chưa có bản ghi lương nào.</p>
              {isAdmin && isDraft && (
                <button className={`${s.btnPrimary} ${s.emptyAction}`} onClick={() => { setEditRecord(null); setShowUpsert(true) }}>
                  <Plus size={13} /> Thêm nhân viên
                </button>
              )}
            </div>
          ) : (
            <div className={s.tableWrap}>
              <table className={`${s.table} ${s.recordsTable}`}>
                <thead>
                  <tr>
                    <th>Nhân viên</th>
                    <th className={s.moneyCol}>Lương CB</th>
                    <th className={s.moneyCol}>Phụ cấp</th>
                    <th className={s.moneyCol}>Thưởng</th>
                    <th className={s.moneyCol}>BHXH NV</th>
                    <th className={s.moneyCol}>Thuế TNCN</th>
                    <th className={s.moneyCol}>KT khác</th>
                    <th className={`${s.moneyCol} ${s.netPayHead}`}>Thực nhận</th>
                    {isAdmin && isDraft && <th className={s.actionHead}>Hành động</th>}
                  </tr>
                </thead>
                <tbody>
                  {records.map((rec) => {
                    const net = calcNet(rec)
                    return (
                      <tr key={rec.id}>
                        <td className={s.recordName}>{rec.userName ?? '—'}</td>
                        <td className={s.moneyCol}>{fmtVND(rec.baseSalary)}</td>
                        <td className={s.moneyCol}>{fmtVND(rec.allowances)}</td>
                        <td className={s.moneyCol}>{fmtVND(rec.bonus)}</td>
                        <td className={s.moneyCol}>{fmtVND(rec.bhxhEmployee)}</td>
                        <td className={s.moneyCol}>{fmtVND(rec.pitDeduction)}</td>
                        <td className={s.moneyCol}>{fmtVND(rec.otherDeductions)}</td>
                        <td className={`${s.moneyCol} ${s.netPay}`}>{fmtVND(net)}</td>
                        {isAdmin && isDraft && (
                          <td>
                            <div className={s.recordActions}>
                              <button
                                className={s.iconBtn}
                                onClick={() => { setEditRecord(rec); setShowUpsert(true) }}
                                title="Chỉnh sửa"
                              >
                                <Pencil size={12} />
                              </button>
                              <button
                                className={`${s.iconBtn} ${s.iconBtnDanger}`}
                                onClick={() => setDeleteRecord(rec)}
                                title="Xoá"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modals */}
        {showUpsert && (
          <UpsertRecordModal
            periodId={id}
            existing={editRecord}
            staffList={staffList}
            onClose={() => { setShowUpsert(false); setEditRecord(null) }}
            onSaved={handleUpserted}
          />
        )}
        {deleteRecord && (
          <DeleteRecordModal
            record={deleteRecord}
            onClose={() => setDeleteRecord(null)}
            onDeleted={handleDeleteRecord}
          />
        )}
      </div>
    </AppLayout>
  )
}
