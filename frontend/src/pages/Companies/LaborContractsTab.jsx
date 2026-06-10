import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Download, Loader2, ScrollText, Columns, GripVertical } from 'lucide-react'
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

const STATUS_CSS = {
  active:        s.hdldStatusActive,
  expiring_soon: s.hdldStatusExpiringSoon,
  expired:       s.hdldStatusExpired,
  permanent:     s.hdldStatusPermanent,
}

const COL_TYPE_LABEL = { text: 'Văn bản', number: 'Số', date: 'Ngày' }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function StatusBadge({ status }) {
  return (
    <span className={`${s.hdldStatusBadge} ${STATUS_CSS[status] ?? ''}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

// ── ManageColumnsModal ────────────────────────────────────────────────────────

function ManageColumnsModal({ companyId, columns, onColumnsChange, onClose }) {
  const addToast             = useToastStore((st) => st.toast)
  const [newName, setNewName]       = useState('')
  const [newType, setNewType]       = useState('text')
  const [adding, setAdding]         = useState(false)
  const [error, setError]           = useState(null)
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
        <p className={s.hdldModalDesc}>
          Các cột tuỳ chỉnh áp dụng cho tất cả hợp đồng trong công ty này.
          Xoá cột không làm mất dữ liệu đã nhập.
        </p>

        {columns.length === 0 ? (
          <p className={s.hdldModalEmpty}>Chưa có cột tuỳ chỉnh nào.</p>
        ) : (
          <div className={s.hdldColList}>
            {columns.map((col) => (
              <div key={col.id} className={s.hdldColRow}>
                <GripVertical size={13} className={s.hdldColGrip} />
                <span className={s.hdldColName}>{col.colName}</span>
                <span className={s.hdldColTypeBadge}>
                  {COL_TYPE_LABEL[col.colType] ?? col.colType}
                </span>
                <button
                  className={`${s.iconBtnSm} ${s.iconBtnDanger} ${s.hdldColDeleteBtn}`}
                  onClick={() => handleDelete(col)}
                  disabled={deletingId === col.id}
                  title="Xoá cột"
                >
                  {deletingId === col.id
                    ? <Loader2 size={12} className={s.spin} />
                    : <Trash2 size={12} />}
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleAdd}>
          {error && <div className={`${s.errorBox} ${s.hdldInlineError}`}>{error}</div>}
          <div className={s.hdldAddColForm}>
            <div className={s.hdldAddColMain}>
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
            <div className={s.hdldAddColType}>
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
              className={`${s.btnNavy} ${s.hdldAddColBtn}`}
              disabled={adding}
            >
              {adding ? <Loader2 size={13} className={s.spin} /> : <Plus size={13} />}
              Thêm
            </button>
          </div>
        </form>

        <div className={`${s.modalActions} ${s.hdldModalActions}`}>
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
        customFields:   {
          ...Object.fromEntries(columns.map((c) => [c.colName, ''])),
          ...(initial.customFields ?? {}),
        },
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
          <div className={s.hdldFormSpan2}>
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

          <div className={s.hdldFormSpan2}>
            <label className={s.formLabel}>Ghi chú</label>
            <textarea
              value={form.notes}
              onChange={setField('notes')}
              placeholder="Ghi chú thêm về hợp đồng..."
              className={s.formTextarea}
              rows={2}
            />
          </div>

          {columns.map((col) => (
            <div key={col.id}>
              <label className={s.formLabel}>
                {col.colName}
                <span className={s.hdldColTypeHint}>({COL_TYPE_LABEL[col.colType]})</span>
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
        <p className={s.hdldConfirmText}>
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

  const [contracts, setContracts]         = useState([])
  const [columns, setColumns]             = useState([])
  const [loading, setLoading]             = useState(true)
  const [filterStatus, setFilterStatus]   = useState('')
  const [exporting, setExporting]         = useState(false)

  const [showCreate, setShowCreate]           = useState(false)
  const [editTarget, setEditTarget]           = useState(null)
  const [deleteTarget, setDeleteTarget]       = useState(null)
  const [showManageCols, setShowManageCols]   = useState(false)

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
      <div className={s.hdldToolbar}>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className={`${s.formSelect} ${s.hdldFilterSelect}`}
        >
          <option value="">Tất cả tình trạng</option>
          <option value="active">Còn hiệu lực</option>
          <option value="expiring_soon">Sắp hết hạn</option>
          <option value="expired">Đã hết hạn</option>
          <option value="permanent">Không thời hạn</option>
        </select>

        {!loading && (
          <span className={s.hdldToolbarCount}>
            {displayed.length} hợp đồng
            {columns.length > 0 && ` · ${columns.length} cột tuỳ chỉnh`}
          </span>
        )}

        <div className={s.hdldToolbarRight}>
          {canEdit && (
            <button
              className={`${s.btnOutline} ${s.hdldToolbarBtn}`}
              onClick={() => setShowManageCols(true)}
            >
              <Columns size={13} /> Quản lý cột
            </button>
          )}
          <button
            className={`${s.btnOutline} ${s.hdldToolbarBtn}`}
            onClick={handleExport}
            disabled={exporting || loading}
          >
            {exporting ? <Loader2 size={13} className={s.spin} /> : <Download size={13} />}
            Xuất Excel
          </button>
          {canEdit && (
            <button
              className={`${s.btnNavy} ${s.hdldToolbarBtn}`}
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
          <Loader2 size={18} className={s.spin} /> Đang tải...
        </div>
      ) : displayed.length === 0 ? (
        <div className={s.emptyState}>
          <ScrollText size={32} className={s.hdldEmptyIcon} />
          <p className={s.hdldEmptyText}>
            {filterStatus
              ? 'Không có hợp đồng nào khớp bộ lọc.'
              : 'Chưa có hợp đồng lao động nào.'}
          </p>
        </div>
      ) : (
        <div className={s.tableWrap}>
          <div className={s.tableScroll}>
            <table className={`${s.table} ${s.hdldTable}`}>
              <thead>
                <tr>
                  <th className={s.hdldThStt}>STT</th>
                  <th className={s.hdldThName}>Tên nhân viên</th>
                  <th className={s.hdldThTaxCode}>MST nhân viên</th>
                  <th className={s.hdldThType}>Loại HĐ</th>
                  <th className={s.hdldThNumber}>Số HĐ</th>
                  <th className={s.hdldThDateSm}>Ngày ký</th>
                  <th className={s.hdldThDate}>Ngày kết thúc</th>
                  <th className={s.hdldThDays}>Ngày còn lại</th>
                  <th className={s.hdldThStatus}>Tình trạng</th>
                  <th className={s.hdldThNotes}>Ghi chú</th>
                  {columns.map((col) => (
                    <th key={col.id} className={s.hdldThCustom}>{col.colName}</th>
                  ))}
                  {canEdit && <th className={s.actionsHead}>Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {displayed.map((c, idx) => (
                  <tr key={c.id}>
                    <td className={s.hdldCellStt}>{idx + 1}</td>
                    <td className={s.hdldCellName}>{c.employeeName}</td>
                    <td className={s.hdldCellMono}>{c.taxCode ?? '—'}</td>
                    <td className={s.hdldCellSoft}>{c.contractType ?? '—'}</td>
                    <td className={s.hdldCellMono}>{c.contractNumber ?? '—'}</td>
                    <td className={s.hdldCellDate}>{fmtDate(c.contractDate)}</td>
                    <td className={s.hdldCellDate}>{fmtDate(c.endDate)}</td>
                    <td className={s.hdldCellDays}>
                      {c.daysRemaining !== null ? c.daysRemaining : '—'}
                    </td>
                    <td><StatusBadge status={c.contractStatus} /></td>
                    <td className={s.hdldCellNotes} title={c.notes ?? ''}>
                      {c.notes ?? '—'}
                    </td>
                    {columns.map((col) => (
                      <td key={col.id} className={s.hdldCellCustom}>
                        {c.customFields[col.colName] ?? '—'}
                      </td>
                    ))}
                    {canEdit && (
                      <td>
                        <div className={s.hdldActionsRow}>
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
