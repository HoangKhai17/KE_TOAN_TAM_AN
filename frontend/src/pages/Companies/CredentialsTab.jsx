import { useState, useEffect } from 'react'
import {
  Plus, Pencil, Trash2, Eye, EyeOff, Copy, Check,
  Shield, Loader2, ExternalLink,
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as credApi from '../../api/credentials'
import Modal from '../../components/ui/Modal'
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
  const [form, setForm] = useState(initial ?? emptyForm())
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function set(field) {
    return (e) => setForm((p) => ({ ...p, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.systemName.trim()) { setError('Vui lòng nhập tên hệ thống'); return }
    if (!form.username.trim())   { setError('Vui lòng nhập tên đăng nhập'); return }
    if (!initial && !form.password.trim()) { setError('Vui lòng nhập mật khẩu'); return }
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
    <Modal title={title} onClose={onClose}>
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
            <label className={`${s.formLabel} ${s.formLabelReq}`}>Tên đăng nhập</label>
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
            <label className={`${s.formLabel} ${!initial ? s.formLabelReq : ''}`}>
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
              rows={2}
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
  const [password, setPassword] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [copied, setCopied]     = useState(false)

  useEffect(() => {
    credApi.revealCredential(companyId, credential.id)
      .then((pw) => { setPassword(pw); setLoading(false) })
      .catch(() => {
        addToast('Không thể hiển thị mật khẩu', 'error')
        onClose()
      })
    return () => { setPassword(null) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    <Modal title={`Mật khẩu: ${credential.systemName}`} onClose={onClose}>
      <div style={{ padding: '8px 0' }}>
        <div className={s.securityBanner} style={{ marginBottom: 16 }}>
          <Shield size={14} style={{ flexShrink: 0 }} />
          <span>Lần hiển thị này đã được ghi vào audit log.</span>
        </div>

        {loading ? (
          <div className={s.credRevealSkeleton} />
        ) : (
          <div className={s.credRevealBox}>
            <code className={s.credRevealPw}>{password}</code>
            <button
              className={s.credRevealCopy}
              onClick={handleCopy}
              title="Sao chép"
            >
              {copied ? <Check size={14} style={{ color: '#22c55e' }} /> : <Copy size={14} />}
            </button>
          </div>
        )}

        <div className={s.modalActions} style={{ marginTop: 16 }}>
          <button onClick={onClose} className={s.btnOutline}>Đóng</button>
        </div>
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
        <p style={{ fontSize: 14, color: 'var(--color-text-soft)', marginBottom: 16 }}>
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

// ── Main CredentialsTab ───────────────────────────────────────────────────────

export default function CredentialsTab({ company }) {
  const companyId  = company.id
  const isAdmin    = useAuthStore((st) => st.user?.role === 'admin')
  const addToast   = useToastStore((st) => st.toast)

  const [creds, setCreds]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [filterActive, setFilterActive] = useState('')

  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [revealTarget, setRevealTarget] = useState(null)

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

  async function handleCreate(body) {
    const cred = await credApi.createCredential(companyId, body)
    setCreds((prev) => [cred, ...prev])
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

  return (
    <div>
      <div className={s.securityBanner}>
        <Shield size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          <strong>Khu vực bảo mật.</strong> Mật khẩu được mã hoá AES-256-GCM server-side.
          Mỗi lần xem mật khẩu đều được ghi vào audit log.
        </span>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <select
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value)}
          className={s.formSelect}
          style={{ height: 32, fontSize: 13, width: 'auto', minWidth: 140 }}
        >
          <option value="">Tất cả</option>
          <option value="true">Đang kích hoạt</option>
          <option value="false">Đã tắt</option>
        </select>
        <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
          {!loading && `${creds.length} tài khoản`}
        </span>
        {isAdmin && (
          <button
            className={s.btnNavy}
            style={{ marginLeft: 'auto', height: 32, padding: '0 14px', fontSize: 13 }}
            onClick={() => setShowCreate(true)}
          >
            <Plus size={13} /> Thêm tài khoản
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className={s.loadingCenter}>
          <Loader2 size={18} className={s.spin} style={{ marginRight: 8 }} /> Đang tải...
        </div>
      ) : creds.length === 0 ? (
        <div className={s.emptyState}>
          <Shield size={32} style={{ color: '#94a3b8', marginBottom: 8 }} />
          <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Chưa có tài khoản hệ thống nào.</p>
        </div>
      ) : (
        <div className={s.credList}>
          {creds.map((cred) => (
            <div
              key={cred.id}
              className={s.credCard}
              style={!cred.isActive ? { opacity: 0.55 } : {}}
            >
              <div className={s.credCardHead}>
                <div className={s.credCardTitle}>
                  {cred.systemName}
                  {!cred.isActive && (
                    <span className={s.credBadgeOff}>Đã tắt</span>
                  )}
                </div>
                <div className={s.credCardActions}>
                  {cred.systemUrl && (
                    <a
                      href={cred.systemUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={s.iconBtnSm}
                      title="Mở liên kết"
                    >
                      <ExternalLink size={13} />
                    </a>
                  )}
                  <button
                    className={s.iconBtnSm}
                    onClick={() => setRevealTarget(cred)}
                    title="Xem mật khẩu"
                  >
                    <Eye size={13} />
                  </button>
                  {isAdmin && (
                    <>
                      <button
                        className={s.iconBtnSm}
                        onClick={() => setEditTarget(cred)}
                        title="Chỉnh sửa"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        className={`${s.iconBtnSm} ${s.iconBtnDanger}`}
                        onClick={() => setDeleteTarget(cred)}
                        title="Xoá"
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className={s.credCardMeta}>
                <span className={s.credCardUsername}>
                  <strong>Tài khoản:</strong> {cred.username}
                </span>
                <span className={s.credCardPw}>
                  <strong>Mật khẩu:</strong> •••••••
                </span>
              </div>

              {cred.notes && (
                <p className={s.credCardNotes}>{cred.notes}</p>
              )}

              <div className={s.credCardFooter}>
                Cập nhật: {fmtDateTime(cred.updatedAt)}
              </div>
            </div>
          ))}
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
      {deleteTarget && (
        <DeleteConfirmModal
          credential={deleteTarget}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
      {revealTarget && (
        <RevealModal
          companyId={companyId}
          credential={revealTarget}
          onClose={() => setRevealTarget(null)}
        />
      )}
    </div>
  )
}
