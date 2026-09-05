import { useState, useEffect, useMemo } from 'react'
import {
  Plus, Pencil, Trash2, Eye, EyeOff, Copy, Check,
  Shield, Loader2, ExternalLink, Download, Filter,
} from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'
import { useEnumsStore } from '../../hooks/useEnums'
import * as credApi from '../../api/credentials'
import Modal from '../../components/ui/Modal'
import DeleteConfirmDialog, { useDeleteConfirm } from '../../components/ui/DeleteConfirmDialog'
import { useCompanyFooter } from './companyFooter'
import ColumnFilterDropdown from '../../components/ui/ColumnFilterDropdown'
import { matchColFilter, isColFilterActive } from '../../components/ui/columnFilter'
import {
  DragHeaderCell,
  DragRowCell,
  IndexHeaderCell,
  IndexRowCell,
  SelectionHeaderCell,
  SelectionRowCell,
  useRowSelection,
} from '../../components/ui/data-table'
import s from './companies.module.css'

// ── Helpers ───────────────────────────────────────────────────────────────────


function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function emptyForm() {
  return { systemName: '', systemUrl: '', username: '', password: '', notes: '', isActive: true }
}

// ── CredentialForm (shared by create/edit modals) ─────────────────────────────

function CredentialForm({ initial, onSubmit, onClose, title }) {
  // Always start password as empty in edit mode — user must type a new one to change it.
  // Chuẩn hoá null → '' để các field text luôn là chuỗi (tránh lỗi .trim() khi lưu).
  const [form, setForm] = useState(initial ? {
    systemName: initial.systemName ?? '',
    systemUrl:  initial.systemUrl  ?? '',
    username:   initial.username   ?? '',
    password:   '',
    notes:      initial.notes      ?? '',
    isActive:   initial.isActive   ?? true,
  } : emptyForm())
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function set(field) {
    return (e) => setForm((p) => ({ ...p, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    // Chỉ bắt buộc Tên hệ thống — tên đăng nhập & mật khẩu là tuỳ chọn (theo yêu cầu KH)
    if (!form.systemName.trim()) { setError('Vui lòng nhập tên hệ thống'); return }
    setError(null)
    setSaving(true)
    try {
      const body = {
        systemName: form.systemName.trim(),
        systemUrl:  form.systemUrl.trim() || null,
        username:   form.username.trim(),
        notes:      form.notes.trim() || null,
        isActive:   form.isActive,
      }
      if (form.password.trim()) body.password = form.password.trim()
      await onSubmit(body)
    } catch (err) {
      setError(err.response?.data?.error?.message ?? 'Không thể lưu')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose} width="min(1120px, calc(100vw - 56px))">
      <form onSubmit={handleSubmit} className={s.modalForm}>
        {error && <div className={s.errorBox}>{error}</div>}

        <div className={s.formGrid2}>
          <div style={{ gridColumn: 'span 2' }}>
            <label className={`${s.formLabel} ${s.formLabelReq}`}>Tên hệ thống</label>
            <input
              type="text"
              value={form.systemName}
              onChange={set('systemName')}
              placeholder="VD: Cổng thuế eTax, BHXH điện tử..."
              className={s.formInput}
              autoFocus
            />
          </div>

          <div style={{ gridColumn: 'span 2' }}>
            <label className={s.formLabel}>URL hệ thống</label>
            <input
              type="url"
              value={form.systemUrl}
              onChange={set('systemUrl')}
              placeholder="https://..."
              className={s.formInput}
            />
          </div>

          <div>
            <label className={s.formLabel}>Tên đăng nhập</label>
            <input
              type="text"
              value={form.username}
              onChange={set('username')}
              placeholder="MST hoặc username"
              className={s.formInput}
              autoComplete="off"
            />
          </div>

          <div>
            <label className={s.formLabel}>
              Mật khẩu {initial && <span className={s.formLabelHint}>(bỏ trống = giữ nguyên)</span>}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={form.password}
                onChange={set('password')}
                placeholder={initial ? '••••••••' : 'Nhập mật khẩu'}
                className={s.formInput}
                style={{ paddingRight: 36 }}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className={s.pwToggle}
                tabIndex={-1}
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div style={{ gridColumn: 'span 2' }}>
            <label className={s.formLabel}>Ghi chú</label>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              placeholder="Thông tin thêm về tài khoản..."
              className={s.formTextarea}
              rows={11}
              style={{ minHeight: 220 }}
            />
          </div>

          {initial && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                id="credIsActive"
                checked={form.isActive}
                onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
                style={{ width: 15, height: 15, cursor: 'pointer' }}
              />
              <label htmlFor="credIsActive" className={s.formLabel} style={{ margin: 0, cursor: 'pointer' }}>
                Đang kích hoạt
              </label>
            </div>
          )}
        </div>

        <div className={s.modalActions}>
          <button type="button" onClick={onClose} className={s.btnOutline} disabled={saving}>Huỷ</button>
          <button type="submit" disabled={saving} className={s.btnNavy}>
            {saving && <Loader2 size={13} />}
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── RevealModal ───────────────────────────────────────────────────────────────

function RevealModal({ companyId, credential, onClose }) {
  const addToast = useToastStore((st) => st.toast)
  const [password, setPassword] = useState(null)   // mật khẩu hệ thống
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [copied, setCopied]     = useState(false)

  // Bỏ re-auth: mở popup là xem luôn. Server vẫn kiểm quyền + ghi audit log mỗi lần xem.
  useEffect(() => {
    let cancelled = false
    credApi.revealCredential(companyId, credential.id)
      .then((pw) => { if (!cancelled) setPassword(pw) })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.error?.message ?? 'Không xem được mật khẩu') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [companyId, credential.id])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      addToast('Không thể sao chép', 'error')
    }
  }

  return (
    <Modal title={`Mật khẩu: ${credential.systemName}`} onClose={onClose} maxWidth={500}>
      <div style={{ padding: '8px 0' }}>
        <div className={s.securityBanner} style={{ marginBottom: 16 }}>
          <Shield size={14} style={{ flexShrink: 0 }} />
          <span>Mỗi lần xem đều được ghi vào audit log.</span>
        </div>

        {loading ? (
          <div className={s.loadingCenter}><Loader2 size={16} className={s.spin} style={{ marginRight: 8 }} /> Đang tải...</div>
        ) : error ? (
          <>
            <div className={s.formError}>{error}</div>
            <div className={s.modalActions} style={{ marginTop: 16 }}>
              <button onClick={onClose} className={s.btnOutline}>Đóng</button>
            </div>
          </>
        ) : (
          <>
            <div className={s.credRevealBox}>
              <code className={s.credRevealPw}>{password}</code>
              <button className={s.credRevealCopy} onClick={handleCopy} title="Sao chép">
                {copied ? <Check size={14} style={{ color: 'var(--color-success-strong)' }} /> : <Copy size={14} />}
              </button>
            </div>
            <div className={s.modalActions} style={{ marginTop: 16 }}>
              <button onClick={onClose} className={s.btnOutline}>Đóng</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

// ── DeleteConfirmModal ────────────────────────────────────────────────────────

function DeleteConfirmModal({ credential, onConfirm, onClose }) {
  const [deleting, setDeleting] = useState(false)

  async function go() {
    setDeleting(true)
    try { await onConfirm() } finally { setDeleting(false) }
  }

  return (
    <Modal title="Xoá tài khoản" onClose={onClose}>
      <div className={s.modalForm}>
        <p style={{ fontSize: 'var(--fs-base)', color: 'var(--color-text-soft)', marginBottom: 16 }}>
          Bạn có chắc muốn xoá tài khoản <strong>{credential.systemName}</strong>?
          Hành động này không thể hoàn tác.
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

// ── ImportTemplateModal ───────────────────────────────────────────────────────
// Xác nhận trước khi tạo hàng loạt tài khoản mẫu (danh mục động credential_template)

function ImportTemplateModal({ names, onConfirm, onClose }) {
  const [importing, setImporting] = useState(false)

  async function go() {
    setImporting(true)
    try { await onConfirm() } finally { setImporting(false) }
  }

  return (
    <Modal title="Import tài khoản mẫu" onClose={onClose} maxWidth={480}>
      <div className={s.modalForm}>
        <p style={{ fontSize: 'var(--fs-base)', color: 'var(--color-text-soft)', marginBottom: 10 }}>
          Sẽ thêm <strong>{names.length}</strong> dòng tài khoản trống (chỉ có tên hệ thống).
          Bạn tự bổ sung đường dẫn, tên đăng nhập và mật khẩu sau.
        </p>
        <ul className={s.importList}>
          {names.map((n) => <li key={n}>{n}</li>)}
        </ul>
        <div className={s.modalActions}>
          <button onClick={onClose} className={s.btnOutline} disabled={importing}>Huỷ</button>
          <button onClick={go} className={s.btnNavy} disabled={importing}>
            {importing ? <Loader2 size={13} className={s.spin} /> : <Download size={13} />}
            {importing ? 'Đang thêm...' : 'Import'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Main CredentialsTab ───────────────────────────────────────────────────────

export default function CredentialsTab({ company }) {
  const confirmDelete = useDeleteConfirm()
  const companyId  = company.id
  const addToast   = useToastStore((st) => st.toast)
  const loadEnums  = useEnumsStore((st) => st.load)
  const getOptions = useEnumsStore((st) => st.getOptions)

  const [creds, setCreds]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [filterActive, setFilterActive] = useState('')
  const [page, setPage]           = useState(1)
  const [pageSize, setPageSize]   = useState(20)

  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [revealTarget, setRevealTarget] = useState(null)
  const [showImport, setShowImport] = useState(false)
  const [dragCredentialId, setDragCredentialId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [colFilters, setColFilters] = useState({})
  const [sortState, setSortState] = useState({ col: null, dir: 'asc' })
  const [filterPopup, setFilterPopup] = useState(null)

  useEffect(() => { loadEnums() }, [loadEnums])

  // Danh sách tên tài khoản mẫu (danh mục động credential_template)
  const templateNames = getOptions('credential_template').map((o) => o.label)

  async function load(isActiveFilter) {
    setLoading(true)
    try {
      const params = {}
      if (isActiveFilter !== '') params.isActive = isActiveFilter
      const list = await credApi.listCredentials(companyId, params)
      setCreds(list)
    } catch {
      addToast('Không thể tải tài khoản hệ thống', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(filterActive) }, [companyId, filterActive]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1) }, [companyId, filterActive])

  // Phân trang phía client (danh sách theo 1 công ty nên số lượng nhỏ)
  const filteredCreds = useMemo(() => {
    let result = [...creds]
    const displayValue = (row, key) => {
      if (key === 'isActive') return row.isActive ? 'Đang kích hoạt' : 'Đã tắt'
      if (key === 'updatedAt') return fmtDateTime(row.updatedAt)
      return String(row[key] ?? '')
    }
    for (const [key, value] of Object.entries(colFilters)) {
      const ft = key === 'isActive' ? 'enum' : key === 'updatedAt' ? 'dateRange' : 'text'
      if (!isColFilterActive(value, ft)) continue
      result = result.filter((row) => matchColFilter(value, ft, {
        label: displayValue(row, key),
        date:  row.updatedAt,
      }))
    }
    if (sortState.col) {
      result.sort((a, b) => displayValue(a, sortState.col).localeCompare(displayValue(b, sortState.col), 'vi', { numeric: true }) * (sortState.dir === 'asc' ? 1 : -1))
    }
    return result
  }, [creds, colFilters, sortState])

  const totalPages = Math.max(1, Math.ceil(filteredCreds.length / pageSize))
  const pageSafe   = Math.min(page, totalPages)
  const pageCreds  = filteredCreds.slice((pageSafe - 1) * pageSize, pageSafe * pageSize)

  // Phân trang → footer trang (thay copyright)
  useCompanyFooter(loading ? null : {
    total: filteredCreds.length,
    from: (pageSafe - 1) * pageSize + 1,
    to: Math.min(pageSafe * pageSize, filteredCreds.length),
    page: pageSafe, pageSize, totalPages,
    itemLabel: 'tài khoản',
    onPageChange: setPage,
    onPageSizeChange: (n) => { setPageSize(n); setPage(1) },
  })
  const selection = useRowSelection({ rows: pageCreds })
  const canReorder = filterActive === '' && Object.keys(colFilters).length === 0 && !sortState.col

  useEffect(() => { selection.clear() }, [companyId, filterActive]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); selection.clear() }, [colFilters, sortState]) // eslint-disable-line react-hooks/exhaustive-deps

  function updateColumnFilter(colKey, value) {
    setColFilters((current) => {
      const next = { ...current }
      if (value == null || (value instanceof Set && value.size === 0) || (typeof value === 'string' && !value.trim())) delete next[colKey]
      else next[colKey] = value
      return next
    })
  }

  function openColumnFilter(colKey, event) {
    event.stopPropagation()
    if (filterPopup?.colKey === colKey) return setFilterPopup(null)
    const rect = event.currentTarget.getBoundingClientRect()
    setFilterPopup({ colKey, top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 260) })
  }

  function FilterHeader({ colKey, children }) {
    const active = colFilters[colKey] != null || sortState.col === colKey
    return (
      <th>
        <div className={s.hdldThInner}>
          <span className={s.hdldThLabel}>{children}</span>
          <button data-colfilter-btn className={`${s.hdldFilterBtn} ${active ? s.hdldFilterBtnActive : ''}`} onClick={(event) => openColumnFilter(colKey, event)} title="Lọc / Sắp xếp">
            <Filter size={10} />
          </button>
        </div>
      </th>
    )
  }

  async function handleDrop(targetId) {
    const sourceId = dragCredentialId
    setDragCredentialId(null)
    setDragOverId(null)
    if (!canReorder || !sourceId || sourceId === targetId) return

    const orderedIds = creds.map((credential) => credential.id)
    const from = orderedIds.indexOf(sourceId)
    const to = orderedIds.indexOf(targetId)
    if (from < 0 || to < 0) return
    orderedIds.splice(to, 0, orderedIds.splice(from, 1)[0])

    const previous = creds
    const rank = new Map(orderedIds.map((id, index) => [id, index]))
    setCreds((current) => [...current].sort((a, b) => rank.get(a.id) - rank.get(b.id)))
    try {
      await credApi.reorderCredentials(companyId, orderedIds)
    } catch {
      setCreds(previous)
      addToast('Không thể lưu thứ tự tài khoản', 'error')
    }
  }

  async function handleBulkDelete() {
    if (!selection.selectedCount) return
    if (!(await confirmDelete({ title: 'Xóa tài khoản hệ thống', message: <>Bạn có chắc chắn muốn xóa <strong>{selection.selectedCount}</strong> tài khoản đã chọn?</>, confirmLabel: `Xóa ${selection.selectedCount} mục` }))) return
    setBulkDeleting(true)
    const ids = [...selection.selectedIds]
    const deletedIds = new Set()
    for (const id of ids) {
      try {
        await credApi.deleteCredential(companyId, id)
        deletedIds.add(id)
      } catch { /* tiếp tục các dòng còn lại */ }
    }
    setCreds((current) => current.filter((credential) => !deletedIds.has(credential.id)))
    selection.remove(deletedIds)
    setBulkDeleting(false)
    addToast(
      deletedIds.size === ids.length ? `Đã xoá ${deletedIds.size} tài khoản` : `Đã xoá ${deletedIds.size}/${ids.length} tài khoản`,
      deletedIds.size ? 'success' : 'error',
    )
  }

  async function handleCreate(body) {
    const cred = await credApi.createCredential(companyId, body)
    setCreds((prev) => [...prev, cred])
    setShowCreate(false)
    addToast(`Đã thêm "${cred.systemName}"`, 'success')
  }

  async function handleEdit(body) {
    const updated = await credApi.updateCredential(companyId, editTarget.id, body)
    setCreds((prev) => prev.map((c) => c.id === updated.id ? updated : c))
    setEditTarget(null)
    addToast('Đã cập nhật tài khoản', 'success')
  }

  async function handleDelete() {
    await credApi.deleteCredential(companyId, deleteTarget.id)
    setCreds((prev) => prev.filter((c) => c.id !== deleteTarget.id))
    setDeleteTarget(null)
    addToast('Đã xoá tài khoản', 'success')
  }

  // Import mẫu: tạo 1 credential trống cho mỗi tên trong danh mục credential_template
  async function handleImport() {
    const created = []
    for (const name of templateNames) {
      const cred = await credApi.createCredential(companyId, { systemName: name, isActive: true })
      created.push(cred)
    }
    setCreds((prev) => [...created, ...prev])
    setShowImport(false)
    setPage(1)
    addToast(`Đã thêm ${created.length} tài khoản mẫu`, 'success')
  }

  return (
    <div>
      {/* Header gộp 1 hàng: banner bảo mật + filter + đếm + nút thêm */}
      <div className={s.credHeader}>
        <div className={`${s.securityBanner} ${s.credBannerInline}`}>
          <Shield size={16} style={{ flexShrink: 0 }} />
          <span>
            <strong>Khu vực bảo mật.</strong> Mật khẩu được mã hoá AES-256-GCM server-side.
            Mỗi lần xem mật khẩu đều được ghi vào audit log.
          </span>
        </div>
        <select
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value)}
          className={s.credFilterSelect}
        >
          <option value="">Tất cả</option>
          <option value="true">Đang kích hoạt</option>
          <option value="false">Đã tắt</option>
        </select>
        <span className={s.credCount}>{!loading && `${creds.length} tài khoản`}</span>
        {selection.selectedCount > 0 && (
          <button className={`${s.btnOutline} ${s.credBulkDelete}`} onClick={handleBulkDelete} disabled={bulkDeleting}>
            {bulkDeleting ? <Loader2 size={13} className={s.spin} /> : <Trash2 size={13} />}
            Xoá {selection.selectedCount} dòng
          </button>
        )}
        {templateNames.length > 0 && (
          <button className={s.credImportBtn} onClick={() => setShowImport(true)} title="Thêm nhanh các tài khoản hệ thống mặc định">
            <Download size={13} /> Import mẫu
          </button>
        )}
        <button className={s.credAddBtn} onClick={() => setShowCreate(true)}>
          <Plus size={13} /> Thêm tài khoản
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className={s.loadingCenter}>
          <Loader2 size={18} className={s.spin} style={{ marginRight: 8 }} /> Đang tải...
        </div>
      ) : creds.length === 0 ? (
        <div className={s.emptyState}>
          <Shield size={32} style={{ color: 'var(--color-muted-soft)', marginBottom: 8 }} />
          <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-muted)' }}>Chưa có tài khoản hệ thống nào.</p>
        </div>
      ) : (
        <div className={s.credTableWrap}>
          <table className={s.credTable}>
            <colgroup>
              <col className={s.dataTableColDrag} />
              <col className={s.dataTableColSelect} />
              <col className={s.dataTableColIndex} />
              <col className={s.credColName} />
              <col className={s.credColUrl} />
              <col className={s.credColUser} />
              <col className={s.credColPw} />
              <col className={s.credColStatus} />
              <col className={s.credColUpdated} />
              <col className={s.credColActions} />
            </colgroup>
            <thead>
              <tr>
                <DragHeaderCell />
                <SelectionHeaderCell
                  allSelected={selection.allSelected}
                  someSelected={selection.someSelected}
                  onToggle={selection.toggleAll}
                />
                <IndexHeaderCell />
                <FilterHeader colKey="systemName">Hệ thống</FilterHeader>
                <FilterHeader colKey="systemUrl">Đường dẫn</FilterHeader>
                <FilterHeader colKey="username">Tên đăng nhập</FilterHeader>
                <th>Mật khẩu</th>
                <FilterHeader colKey="isActive">Trạng thái</FilterHeader>
                <FilterHeader colKey="updatedAt">Cập nhật</FilterHeader>
                <th className={s.credCenter}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {pageCreds.map((cred, index) => (
                <tr
                  key={cred.id}
                  className={`${cred.isActive ? '' : s.credRowOff} ${dragOverId === cred.id ? s.dataTableRowDragOver : ''}`}
                  onDragOver={canReorder ? (event) => { event.preventDefault(); setDragOverId(cred.id) } : undefined}
                  onDrop={canReorder ? () => handleDrop(cred.id) : undefined}
                >
                  <DragRowCell
                    enabled={canReorder}
                    handleProps={{
                      draggable: true,
                      onDragStart: () => setDragCredentialId(cred.id),
                      onDragEnd: () => { setDragCredentialId(null); setDragOverId(null) },
                    }}
                  />
                  <SelectionRowCell
                    checked={selection.selectedIds.has(cred.id)}
                    onToggle={() => selection.toggle(cred.id)}
                  />
                  <IndexRowCell index={(pageSafe - 1) * pageSize + index + 1} />
                  <td>
                    <div className={s.credName} title={cred.systemName}>{cred.systemName}</div>
                    {cred.notes && <div className={s.credNoteSub} title={cred.notes}>{cred.notes}</div>}
                  </td>
                  <td title={cred.systemUrl || ''}>
                    {cred.systemUrl ? (
                      <a href={cred.systemUrl} target="_blank" rel="noopener noreferrer" className={s.credUrlLink}>
                        <ExternalLink size={11} /> {cred.systemUrl}
                      </a>
                    ) : <span className={s.credMuted}>—</span>}
                  </td>
                  <td title={cred.username || ''}>{cred.username || <span className={s.credMuted}>—</span>}</td>
                  <td>
                    {cred.hasPassword ? (
                      <span className={s.credPwCell}>
                        <span className={s.credPwMask}>•••••••</span>
                        <button className={s.iconBtnSm} onClick={() => setRevealTarget(cred)} title="Xem mật khẩu">
                          <Eye size={13} />
                        </button>
                      </span>
                    ) : <span className={s.credMuted}>—</span>}
                  </td>
                  <td>
                    <span className={cred.isActive ? s.credStatusOn : s.credStatusOff}>
                      {cred.isActive ? 'Đang kích hoạt' : 'Đã tắt'}
                    </span>
                  </td>
                  <td className={s.credDate}>{fmtDateTime(cred.updatedAt)}</td>
                  <td className={s.credCenter}>
                    <div className={s.credRowActions}>
                      <button className={s.iconBtnSm} onClick={() => setEditTarget(cred)} title="Chỉnh sửa">
                        <Pencil size={13} />
                      </button>
                      <button className={`${s.iconBtnSm} ${s.iconBtnDanger}`} onClick={() => setDeleteTarget(cred)} title="Xoá">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}


      {/* Modals */}
      {showCreate && (
        <CredentialForm
          title="Thêm tài khoản hệ thống"
          onSubmit={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}
      {editTarget && (
        <CredentialForm
          title={`Chỉnh sửa: ${editTarget.systemName}`}
          initial={editTarget}
          onSubmit={handleEdit}
          onClose={() => setEditTarget(null)}
        />
      )}
      <DeleteConfirmDialog
        open={Boolean(deleteTarget)}
        title="Xóa tài khoản hệ thống"
        message={deleteTarget ? <>Bạn có chắc chắn muốn xóa tài khoản <strong>“{deleteTarget.systemName}”</strong>?</> : null}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      {filterPopup && (
        <ColumnFilterDropdown
          colKey={filterPopup.colKey}
          filterType={filterPopup.colKey === 'isActive' ? 'enum' : filterPopup.colKey === 'updatedAt' ? 'dateRange' : 'text'}
          allRows={creds}
          getDisplayLabel={(row, key) => key === 'isActive' ? (row.isActive ? 'Đang kích hoạt' : 'Đã tắt') : String(row[key] ?? '')}
          currentFilter={colFilters[filterPopup.colKey] ?? null}
          sortState={sortState}
          onSort={(col, dir) => { setSortState(dir ? { col, dir } : { col: null, dir: 'asc' }); setFilterPopup(null) }}
          onFilterChange={updateColumnFilter}
          onClose={() => setFilterPopup(null)}
          style={{ '--cfd-top': `${filterPopup.top}px`, '--cfd-left': `${filterPopup.left}px` }}
        />
      )}
      {revealTarget && (
        <RevealModal
          companyId={companyId}
          credential={revealTarget}
          onClose={() => setRevealTarget(null)}
        />
      )}
      {showImport && (
        <ImportTemplateModal
          names={templateNames}
          onConfirm={handleImport}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}
