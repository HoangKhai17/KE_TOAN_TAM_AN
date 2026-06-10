import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Download, Loader2, ScrollText, Columns, X, GripVertical } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as lcApi from '../../api/laborContracts'
import Modal from '../../components/ui/Modal'
import s from './companies.module.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABEL = {
  active:        'Còn hiệu lực',
  expiring_soon: 'Sắp hết hạn',
  expired:       'Đã hết hạn',
  permanent:     'Không thời hạn',
}

const STATUS_STYLE = {
  active:        { background: '#d1fae5', color: '#065f46' },
  expiring_soon: { background: '#fef9c3', color: '#854d0e' },
  expired:       { background: '#fee2e2', color: '#991b1b' },
  permanent:     { background: '#f1f5f9', color: '#475569' },
}

const COL_TYPE_LABEL = { text: 'Văn bản', number: 'Số', date: 'Ngày' }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function StatusBadge({ status }) {
  const style = STATUS_STYLE[status] ?? {}
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

// ── ManageColumnsModal ────────────────────────────────────────────────────────

function ManageColumnsModal({ companyId, columns, onColumnsChange, onClose }) {
  const addToast       = useToastStore((st) => st.toast)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('text')
  const [adding, setAdding]   = useState(false)
  const [error, setError]     = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  async function handleAdd(e) {
    e.preventDefault()
    if (!newName.trim()) { setError('Vui lòng nhập tên cột'); return }
    if (columns.some((c) => c.colName === newName.trim())) {
      setError('Tên cột đã tồn tại')
      return
    }
    setError(null)
    setAdding(true)
    try {
      const col = await lcApi.createColumn(companyId, { colName: newName.trim(), colType: newType })
      onColumnsChange([...columns, col])
      setNewName('')
      setNewType('text')
      addToast(`Đã thêm cột "${col.colName}"`, 'success')
    } catch (err) {
      setError(err.response?.data?.error?.message ?? 'Không thể thêm cột')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(col) {
    setDeletingId(col.id)
    try {
      await lcApi.deleteColumn(companyId, col.id)
      onColumnsChange(columns.filter((c) => c.id !== col.id))
      addToast(`Đã xoá cột "${col.colName}"`, 'success')
    } catch {
      addToast('Không thể xoá cột', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Modal title="Quản lý cột tuỳ chỉnh" onClose={onClose} maxWidth={520}>
      <div className={s.modalForm}>
        <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 14 }}>
          Các cột tuỳ chỉnh áp dụng cho tất cả hợp đồng trong công ty này.
          Xoá cột không làm mất dữ liệu đã nhập.
        </p>

        {/* Existing columns */}
        {columns.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-muted)', textAlign: 'center', padding: '12px 0' }}>
            Chưa có cột tuỳ chỉnh nào.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {columns.map((col) => (
              <div
                key={col.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 10px',
                  background: 'var(--color-bg-soft)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-soft)',
                }}
              >
                <GripVertical size={13} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{col.colName}</span>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--color-muted)',
                    background: '#e5e7eb',
                    padding: '1px 7px',
                    borderRadius: 999,
                  }}
                >
                  {COL_TYPE_LABEL[col.colType] ?? col.colType}
                </span>
                <button
                  className={`${s.iconBtnSm} ${s.iconBtnDanger}`}
                  onClick={() => handleDelete(col)}
                  disabled={deletingId === col.id}
                  title="Xoá cột"
                  style={{ flexShrink: 0 }}
                >
                  {deletingId === col.id ? <Loader2 size={12} className={s.spin} /> : <Trash2 size={12} />}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add new column */}
        <form onSubmit={handleAdd}>
          {error && <div className={s.errorBox} style={{ marginBottom: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label className={s.formLabel}>Tên cột mới</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="VD: Mức lương, Vị trí..."
                className={s.formInput}
                autoFocus
              />
            </div>
            <div style={{ width: 110 }}>
              <label className={s.formLabel}>Kiểu dữ liệu</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className={s.formSelect}
              >
                <option value="text">Văn bản</option>
                <option value="number">Số</option>
                <option value="date">Ngày</option>
              </select>
            </div>
            <button
              type="submit"
              className={s.btnNavy}
              disabled={adding}
              style={{ height: 36, padding: '0 14px', flexShrink: 0 }}
            >
              {adding ? <Loader2 size={13} className={s.spin} /> : <Plus size={13} />}
              Thêm
            </button>
          </div>
        </form>

        <div className={s.modalActions} style={{ marginTop: 20 }}>
          <button onClick={onClose} className={s.btnOutline}>Đóng</button>
        </div>
      </div>
    </Modal>
  )
}

// ── ContractFormModal ─────────────────────────────────────────────────────────

function emptyForm(columns) {
  return {
    employeeName:   '',
    taxCode:        '',
    contractType:   '',
    contractNumber: '',
    contractDate:   '',
    endDate:        '',
    notes:          '',
    customFields:   Object.fromEntries(columns.map((c) => [c.colName, ''])),
  }
}

function ContractFormModal({ initial, columns, onSubmit, onClose, title }) {
  const [form, setForm] = useState(() => {
    if (initial) {
      return {
        employeeName:   initial.employeeName   ?? '',
        taxCode:        initial.taxCode        ?? '',
        contractType:   initial.contractType   ?? '',
        contractNumber: initial.contractNumber ?? '',
        contractDate:   initial.contractDate   ? String(initial.contractDate).substring(0, 10) : '',
        endDate:        initial.endDate        ? String(initial.endDate).substring(0, 10)       : '',
        notes:          initial.notes          ?? '',
        customFields:   { ...Object.fromEntries(columns.map((c) => [c.colName, ''])), ...(initial.customFields ?? {}) },
      }
    }
    return emptyForm(columns)
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  function setField(field) {
    return (e) => setForm((p) => ({ ...p, [field]: e.target.value }))
  }

  function setColValue(colName, val) {
    setForm((p) => ({ ...p, customFields: { ...p.customFields, [colName]: val } }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.employeeName.trim()) { setError('Vui lòng nhập tên nhân viên'); return }
    setError(null)
    setSaving(true)
    try {
      await onSubmit({
        employeeName:   form.employeeName.trim(),
        taxCode:        form.taxCode.trim()        || null,
        contractType:   form.contractType.trim()   || null,
        contractNumber: form.contractNumber.trim() || null,
        contractDate:   form.contractDate  || null,
        endDate:        form.endDate       || null,
        notes:          form.notes.trim()  || null,
        customFields:   form.customFields,
      })
    } catch (err) {
      setError(err.response?.data?.error?.message ?? 'Không thể lưu')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose} maxWidth={760}>
      <form onSubmit={handleSubmit} className={s.modalForm}>
        {error && <div className={s.errorBox}>{error}</div>}

        <div className={s.formGrid2}>
          <div style={{ gridColumn: 'span 2' }}>
            <label className={`${s.formLabel} ${s.formLabelReq}`}>Tên nhân viên</label>
            <input
              type="text"
              value={form.employeeName}
              onChange={setField('employeeName')}
              placeholder="Nhập tên nhân viên"
              className={s.formInput}
              autoFocus
            />
          </div>

          <div>
            <label className={s.formLabel}>MST nhân viên</label>
            <input
              type="text"
              value={form.taxCode}
              onChange={setField('taxCode')}
              placeholder="Mã số thuế TNCN của nhân viên"
              className={s.formInput}
            />
          </div>

          <div>
            <label className={s.formLabel}>Loại hợp đồng</label>
            <input
              type="text"
              value={form.contractType}
              onChange={setField('contractType')}
              placeholder="VD: Hợp đồng thử việc, HĐLĐ 1 năm..."
              className={s.formInput}
            />
          </div>

          <div>
            <label className={s.formLabel}>Số hợp đồng</label>
            <input
              type="text"
              value={form.contractNumber}
              onChange={setField('contractNumber')}
              placeholder="VD: HĐ-2024/001"
              className={s.formInput}
            />
          </div>

          <div>
            <label className={s.formLabel}>Ngày ký hợp đồng</label>
            <input
              type="date"
              value={form.contractDate}
              onChange={setField('contractDate')}
              className={s.formInput}
            />
          </div>

          <div>
            <label className={s.formLabel}>Ngày kết thúc</label>
            <input
              type="date"
              value={form.endDate}
              onChange={setField('endDate')}
              className={s.formInput}
            />
          </div>

          <div style={{ gridColumn: 'span 2' }}>
            <label className={s.formLabel}>Ghi chú</label>
            <textarea
              value={form.notes}
              onChange={setField('notes')}
              placeholder="Ghi chú thêm về hợp đồng..."
              className={s.formTextarea}
              rows={2}
            />
          </div>

          {/* Dynamic columns — one input per defined column */}
          {columns.map((col) => (
            <div key={col.id}>
              <label className={s.formLabel}>
                {col.colName}
                <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--color-muted)' }}>
                  ({COL_TYPE_LABEL[col.colType]})
                </span>
              </label>
              <input
                type={col.colType === 'number' ? 'number' : col.colType === 'date' ? 'date' : 'text'}
                value={form.customFields[col.colName] ?? ''}
                onChange={(e) => setColValue(col.colName, e.target.value)}
                className={s.formInput}
              />
            </div>
          ))}
        </div>

        <div className={s.modalActions}>
          <button type="button" onClick={onClose} className={s.btnOutline} disabled={saving}>
            Huỷ
          </button>
          <button type="submit" disabled={saving} className={s.btnNavy}>
            {saving && <Loader2 size={13} />}
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── DeleteConfirmModal ────────────────────────────────────────────────────────

function DeleteConfirmModal({ contract, onConfirm, onClose }) {
  const [deleting, setDeleting] = useState(false)

  async function go() {
    setDeleting(true)
    try { await onConfirm() } finally { setDeleting(false) }
  }

  return (
    <Modal title="Xoá hợp đồng" onClose={onClose}>
      <div className={s.modalForm}>
        <p style={{ fontSize: 14, color: 'var(--color-text-soft)', marginBottom: 16 }}>
          Bạn có chắc muốn xoá hợp đồng của nhân viên{' '}
          <strong>{contract.employeeName}</strong>? Hành động này không thể hoàn tác.
        </p>
        <div className={s.modalActions}>
          <button onClick={onClose} className={s.btnOutline} disabled={deleting}>Huỷ</button>
          <button onClick={go} className={s.btnDanger} disabled={deleting}>
            {deleting ? <Loader2 size={13} /> : <Trash2 size={13} />}
            Xoá
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── LaborContractsTab ─────────────────────────────────────────────────────────

export default function LaborContractsTab({ company }) {
  const companyId = company.id
  const user      = useAuthStore((st) => st.user)
  const addToast  = useToastStore((st) => st.toast)

  const canEdit = user?.role === 'admin' || company.assignedStaffId === user?.id

  const [contracts, setContracts]   = useState([])
  const [columns, setColumns]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [exporting, setExporting]   = useState(false)

  const [showCreate, setShowCreate]       = useState(false)
  const [editTarget, setEditTarget]       = useState(null)
  const [deleteTarget, setDeleteTarget]   = useState(null)
  const [showManageCols, setShowManageCols] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [list, cols] = await Promise.all([
        lcApi.listContracts(companyId),
        lcApi.listColumns(companyId),
      ])
      setContracts(list)
      setColumns(cols)
    } catch {
      addToast('Không thể tải dữ liệu hợp đồng', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate(body) {
    await lcApi.createContract(companyId, body)
    await load()
    setShowCreate(false)
    addToast(`Đã thêm hợp đồng của "${body.employeeName}"`, 'success')
  }

  async function handleEdit(body) {
    await lcApi.updateContract(companyId, editTarget.id, body)
    await load()
    setEditTarget(null)
    addToast('Đã cập nhật hợp đồng', 'success')
  }

  async function handleDelete() {
    await lcApi.deleteContract(companyId, deleteTarget.id)
    setContracts((prev) => prev.filter((c) => c.id !== deleteTarget.id))
    setDeleteTarget(null)
    addToast('Đã xoá hợp đồng', 'success')
  }

  async function handleExport() {
    setExporting(true)
    try {
      const blob = await lcApi.exportContracts(companyId)
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `hdld_${(company.name ?? companyId).replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      addToast('Xuất Excel thành công', 'success')
    } catch {
      addToast('Không thể xuất Excel', 'error')
    } finally {
      setExporting(false)
    }
  }

  const displayed = filterStatus
    ? contracts.filter((c) => c.contractStatus === filterStatus)
    : contracts

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className={s.formSelect}
          style={{ height: 32, fontSize: 13, width: 'auto', minWidth: 160 }}
        >
          <option value="">Tất cả tình trạng</option>
          <option value="active">Còn hiệu lực</option>
          <option value="expiring_soon">Sắp hết hạn</option>
          <option value="expired">Đã hết hạn</option>
          <option value="permanent">Không thời hạn</option>
        </select>

        {!loading && (
          <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
            {displayed.length} hợp đồng
            {columns.length > 0 && ` · ${columns.length} cột tuỳ chỉnh`}
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {canEdit && (
            <button
              className={s.btnOutline}
              style={{ height: 32, padding: '0 14px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={() => setShowManageCols(true)}
            >
              <Columns size={13} /> Quản lý cột
            </button>
          )}
          <button
            className={s.btnOutline}
            style={{ height: 32, padding: '0 14px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={handleExport}
            disabled={exporting || loading}
          >
            {exporting ? <Loader2 size={13} className={s.spin} /> : <Download size={13} />}
            Xuất Excel
          </button>
          {canEdit && (
            <button
              className={s.btnNavy}
              style={{ height: 32, padding: '0 14px', fontSize: 13 }}
              onClick={() => setShowCreate(true)}
            >
              <Plus size={13} /> Thêm hợp đồng
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className={s.loadingCenter}>
          <Loader2 size={18} className={s.spin} style={{ marginRight: 8 }} /> Đang tải...
        </div>
      ) : displayed.length === 0 ? (
        <div className={s.emptyState}>
          <ScrollText size={32} style={{ color: '#94a3b8', marginBottom: 8 }} />
          <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>
            {filterStatus
              ? 'Không có hợp đồng nào khớp bộ lọc.'
              : 'Chưa có hợp đồng lao động nào.'}
          </p>
        </div>
      ) : (
        <div className={s.tableWrap}>
          <div className={s.tableScroll}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th style={{ width: 44 }}>STT</th>
                  <th style={{ minWidth: 160 }}>Tên nhân viên</th>
                  <th style={{ minWidth: 120 }}>MST nhân viên</th>
                  <th style={{ minWidth: 160 }}>Loại HĐ</th>
                  <th style={{ minWidth: 120 }}>Số HĐ</th>
                  <th style={{ minWidth: 100 }}>Ngày ký</th>
                  <th style={{ minWidth: 110 }}>Ngày kết thúc</th>
                  <th style={{ textAlign: 'center', minWidth: 90 }}>Ngày còn lại</th>
                  <th style={{ minWidth: 120 }}>Tình trạng</th>
                  <th style={{ minWidth: 160 }}>Ghi chú</th>
                  {columns.map((col) => (
                    <th key={col.id} style={{ minWidth: 130 }}>{col.colName}</th>
                  ))}
                  {canEdit && <th className={s.actionsHead}>Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {displayed.map((c, idx) => (
                  <tr key={c.id}>
                    <td style={{ color: 'var(--color-muted)', fontSize: 12 }}>{idx + 1}</td>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{c.employeeName}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {c.taxCode ?? '—'}
                    </td>
                    <td style={{ color: 'var(--color-text-soft)', whiteSpace: 'nowrap' }}>
                      {c.contractType ?? '—'}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {c.contractNumber ?? '—'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(c.contractDate)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(c.endDate)}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>
                      {c.daysRemaining !== null ? c.daysRemaining : '—'}
                    </td>
                    <td>
                      <StatusBadge status={c.contractStatus} />
                    </td>
                    <td
                      style={{
                        maxWidth: 200,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'var(--color-text-soft)',
                        fontSize: 12,
                      }}
                      title={c.notes ?? ''}
                    >
                      {c.notes ?? '—'}
                    </td>
                    {columns.map((col) => (
                      <td
                        key={col.id}
                        style={{ fontSize: 13, whiteSpace: 'nowrap', color: 'var(--color-text-soft)' }}
                      >
                        {c.customFields[col.colName] ?? '—'}
                      </td>
                    ))}
                    {canEdit && (
                      <td>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                          <button
                            className={s.iconBtnSm}
                            onClick={() => setEditTarget(c)}
                            title="Chỉnh sửa"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            className={`${s.iconBtnSm} ${s.iconBtnDanger}`}
                            onClick={() => setDeleteTarget(c)}
                            title="Xoá"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {showManageCols && (
        <ManageColumnsModal
          companyId={companyId}
          columns={columns}
          onColumnsChange={setColumns}
          onClose={() => setShowManageCols(false)}
        />
      )}
      {showCreate && (
        <ContractFormModal
          title="Thêm hợp đồng lao động"
          columns={columns}
          onSubmit={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}
      {editTarget && (
        <ContractFormModal
          title={`Chỉnh sửa: ${editTarget.employeeName}`}
          initial={editTarget}
          columns={columns}
          onSubmit={handleEdit}
          onClose={() => setEditTarget(null)}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          contract={deleteTarget}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
