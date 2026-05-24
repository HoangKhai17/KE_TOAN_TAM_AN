import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ClipboardList, Search, Filter, RotateCcw, Plus, Loader2,
  Trash2, AlertTriangle, Link2, Link2Off, CheckCircle2, XCircle,
  Eye, Copy, Check, Bell, ExternalLink, PenLine, Building2, List, Columns,
  ChevronDown, X,
} from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import Modal from '../../components/ui/Modal'
import * as cdrApi from '../../api/clientRequests'
import { listCompanies } from '../../api/companies'
import { listUserOptions } from '../../api/users'
import s from './adminClientRequests.module.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABEL = {
  pending:      'Chờ KH',
  received:     'Đã nhận',
  not_required: 'Không cần',
  overdue:      'Quá hạn',
}

const STATUS_CLASS = {
  pending:      s.statusPending,
  received:     s.statusReceived,
  not_required: s.statusNotRequired,
  overdue:      s.statusOverdue,
}

const STATUS_FILTERS = [
  { key: '',             label: 'Tất cả' },
  { key: 'pending',      label: 'Chờ KH' },
  { key: 'overdue',      label: 'Quá hạn' },
  { key: 'received',     label: 'Đã nhận' },
  { key: 'not_required', label: 'Không cần' },
]

const SORT_OPTIONS = [
  { value: 'deadline_date:asc',  label: 'Hạn nộp: Sớm nhất' },
  { value: 'deadline_date:desc', label: 'Hạn nộp: Muộn nhất' },
  { value: 'created_at:desc',    label: 'Mới nhất' },
  { value: 'created_at:asc',     label: 'Cũ nhất' },
  { value: 'document_name:asc',  label: 'Tên A → Z' },
]

const BOARD_COLS = [
  { key: 'pending',      label: 'Chờ KH',     dot: s.dotPending },
  { key: 'overdue',      label: 'Quá hạn',    dot: s.dotOverdue },
  { key: 'received',     label: 'Đã nhận',    dot: s.dotReceived },
  { key: 'not_required', label: 'Không cần',  dot: s.dotNotRequired },
]

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function yearMonthToDates(year, month) {
  if (!year) return { from: '', to: '' }
  if (!month) return { from: `${year}-01-01`, to: `${year}-12-31` }
  const m = parseInt(month, 10)
  const lastDay = new Date(parseInt(year, 10), m, 0).getDate()
  const mm = String(m).padStart(2, '0')
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` }
}

const CUR_YEAR   = String(new Date().getFullYear())
const CUR_MONTH  = String(new Date().getMonth() + 1)
const INIT_DATES = yearMonthToDates(CUR_YEAR, CUR_MONTH)

const FILTER_KEY = 'cdr_filter_v1'

function loadSavedFilters() {
  try { return JSON.parse(sessionStorage.getItem(FILTER_KEY)) ?? {} }
  catch { return {} }
}
function saveFilters(obj) {
  try { sessionStorage.setItem(FILTER_KEY, JSON.stringify(obj)) } catch (_) {}
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function StatusBadge({ status }) {
  return (
    <span className={`${s.statusBadge} ${STATUS_CLASS[status] ?? s.statusPending}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  async function handle() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* silent */ }
  }
  return (
    <button onClick={handle} title="Copy" className={`${s.copyBtn} ${copied ? s.copyBtnCopied : ''}`}>
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Đã copy' : 'Copy'}
    </button>
  )
}

function RowBtn({ onClick, title, disabled, className, children }) {
  return (
    <button
      onClick={onClick} title={title} disabled={disabled}
      className={`${s.rowBtn} ${className ?? ''}`}
    >
      {children}
    </button>
  )
}

// ── CdrFormModal ──────────────────────────────────────────────────────────────

function CdrFormModal({ companies, initial, onClose, onSaved }) {
  const [form, setForm] = useState({
    companyId:    initial?.companyId ?? '',
    documentName: initial?.documentName ?? '',
    description:  initial?.description ?? '',
    deadlineDate: initial?.deadlineDate ? initial.deadlineDate.slice(0, 10) : '',
    periodLabel:  initial?.periodLabel ?? '',
    contactEmail: initial?.contactEmail ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  function set(k, v) { setForm((p) => ({ ...p, [k]: v })); setErr('') }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.documentName.trim()) { setErr('Vui lòng nhập tên tài liệu'); return }
    if (!initial && !form.companyId) { setErr('Vui lòng chọn công ty'); return }
    setSaving(true)
    try {
      let saved
      if (initial) {
        saved = await cdrApi.updateClientRequest(initial.id, {
          documentName: form.documentName.trim() || undefined,
          description:  form.description.trim() || null,
          deadlineDate: form.deadlineDate || null,
          periodLabel:  form.periodLabel.trim() || null,
          contactEmail: form.contactEmail.trim() || null,
        })
      } else {
        saved = await cdrApi.createClientRequest({
          companyId:     form.companyId,
          documentName:  form.documentName.trim(),
          description:   form.description.trim() || null,
          deadlineDate:  form.deadlineDate || null,
          periodLabel:   form.periodLabel.trim() || null,
          remindedEmail: form.contactEmail.trim() || null,
        })
      }
      onSaved(saved)
    } catch (e) {
      setErr(e.response?.data?.error?.message ?? 'Không thể lưu')
    } finally { setSaving(false) }
  }

  return (
    <Modal title={initial ? 'Chỉnh sửa yêu cầu' : 'Tạo yêu cầu tài liệu'} onClose={onClose}>
      <form onSubmit={handleSubmit} className={s.formBody}>
        {err && <div className={s.formError}>{err}</div>}

        {!initial && (
          <div className={s.formGroup}>
            <label className={s.formLabelReq}>Công ty *</label>
            <select value={form.companyId} onChange={(e) => set('companyId', e.target.value)} className={s.formSelect} required>
              <option value="">-- Chọn công ty --</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {initial && (
          <div className={s.formCompanyInfo}>
            <Building2 size={12} /> {initial.companyName ?? '—'}
          </div>
        )}

        <div className={s.formGroup}>
          <label className={s.formLabelReq}>Tên tài liệu yêu cầu *</label>
          <input type="text" value={form.documentName} onChange={(e) => set('documentName', e.target.value)}
            className={s.formInput} placeholder="VD: Bảng lương tháng 5/2025" autoFocus={!!initial} />
        </div>

        <div className={s.formGroup}>
          <label className={s.formLabel}>Kỳ kế toán</label>
          <input type="text" value={form.periodLabel} onChange={(e) => set('periodLabel', e.target.value)}
            className={s.formInput} placeholder="VD: Tháng 5/2025 hoặc Q2-2025" />
        </div>

        <div className={s.formGroup}>
          <label className={s.formLabel}>Hạn nộp</label>
          <input type="date" value={form.deadlineDate} onChange={(e) => set('deadlineDate', e.target.value)} className={s.formInput} />
        </div>

        <div className={s.formGroup}>
          <label className={s.formLabel}>Email khách hàng</label>
          <input type="email" value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)}
            className={s.formInput} placeholder="Để gửi nhắc nhở qua email" />
        </div>

        <div className={s.formGroup}>
          <label className={s.formLabel}>Mô tả / hướng dẫn</label>
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3}
            className={s.formTextarea} placeholder="Hướng dẫn cho khách hàng khi điền form..." />
        </div>

        <div className={s.formActions}>
          <button type="button" onClick={onClose} className={s.btnSecondary} disabled={saving}>Huỷ</button>
          <button type="submit" disabled={saving} className={s.btnPrimary}>
            {saving ? <Loader2 size={13} className={s.spinIcon} /> : <Plus size={13} />}
            {saving ? 'Đang lưu...' : initial ? 'Cập nhật' : 'Tạo yêu cầu'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── LinkModal ─────────────────────────────────────────────────────────────────

function LinkModal({ item, generatedUrl, generating, copied, onGenerate, onCopy, onClose }) {
  const hasToken = !!item.publicToken
  return (
    <Modal title="Link chia sẻ cho khách hàng" onClose={onClose}>
      <div className={s.formBody}>
        <div className={s.linkInfo}>
          <strong>{item.documentName}</strong><br />
          {hasToken
            ? 'Link đã được tạo. Gửi link này cho khách hàng để họ điền thông tin và chia sẻ tài liệu.'
            : 'Tạo link chia sẻ để gửi cho khách hàng. Link có hiệu lực 30 ngày.'}
        </div>
        {item.tokenExpiresAt && (
          <div className={s.linkExpiry}>
            Hết hạn: {new Date(item.tokenExpiresAt).toLocaleDateString('vi-VN')}
          </div>
        )}
        {generatedUrl && (
          <div className={s.linkUrlRow}>
            <input readOnly value={generatedUrl} className={s.linkUrlInput} onFocus={(e) => e.target.select()} />
            <button onClick={() => onCopy(generatedUrl)} className={`${s.linkCopyBtn} ${copied ? s.linkCopyBtnCopied : ''}`}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Đã copy' : 'Copy'}
            </button>
          </div>
        )}
        <div className={s.formActions}>
          <button onClick={onClose} className={s.btnSecondary}>Đóng</button>
          <button onClick={onGenerate} disabled={generating} className={s.btnPrimary}>
            {generating ? <Loader2 size={13} className={s.spinIcon} /> : <Link2 size={13} />}
            {generating ? 'Đang tạo...' : hasToken ? 'Tạo link mới' : 'Tạo link'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── SubmittedDataModal ────────────────────────────────────────────────────────

function SubmittedDataModal({ item, onClose }) {
  const data = item.tokenSubmittedData ?? {}
  const sharedLinks = Array.isArray(data.shared_links)
    ? data.shared_links.filter(Boolean)
    : data.shared_link ? [data.shared_link] : []

  const submittedAt = item.tokenSubmittedAt
    ? new Date(item.tokenSubmittedAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <Modal title="Dữ liệu khách hàng đã gửi" onClose={onClose} maxWidth={660}>
      <div className={s.formBody}>
        <div className={s.receivedBanner}>
          <span style={{ fontSize: 16 }}>{data.submitted_via === 'manual' ? '📋' : '✅'}</span>
          <div style={{ flex: 1 }}>
            <strong>{item.documentName}</strong>
            {submittedAt && <span className={s.reminderCount}> · {data.submitted_via === 'manual' ? 'Nhập lúc' : 'Gửi lúc'} {submittedAt}</span>}
            {data.submitted_via === 'manual' && <span className={s.manualBadge}>Nhập thủ công</span>}
          </div>
        </div>

        {[
          { label: 'Tên liên hệ',    value: data.contact_name ?? data.contactName, icon: '👤' },
          { label: 'Số điện thoại',  value: data.phone,                            icon: '📞' },
          { label: 'Mô tả tài liệu', value: data.description,                      icon: '📄' },
          { label: 'Ghi chú thêm',   value: data.notes,                            icon: '💬' },
        ].map((f) => (
          <div key={f.label} className={s.dataFieldRow}>
            <div className={s.dataFieldLabel}><span>{f.icon}</span>{f.label}</div>
            {!f.value
              ? <span className={s.dataFieldEmpty}>Không có</span>
              : <div className={s.dataFieldValueRow}>
                  <div className={s.dataFieldValue}>{f.value}</div>
                  <CopyButton text={f.value} />
                </div>
            }
          </div>
        ))}

        <div className={s.dataFieldRow}>
          <div className={s.dataFieldLabel}>
            <span>🔗</span>Link chia sẻ
            {sharedLinks.length > 1 && <span className={s.dataCountBadge}>{sharedLinks.length}</span>}
          </div>
          {sharedLinks.length === 0
            ? <span className={s.dataFieldEmpty}>Không có</span>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sharedLinks.map((link, idx) => (
                  <div key={idx} className={s.dataLinkRow}>
                    {sharedLinks.length > 1 && <span className={s.dataLinkIdx}>#{idx + 1}</span>}
                    <a href={link} target="_blank" rel="noopener noreferrer" className={s.dataLink}>
                      {link}<ExternalLink size={10} style={{ flexShrink: 0 }} />
                    </a>
                    <CopyButton text={link} />
                  </div>
                ))}
              </div>
          }
        </div>

        <div className={s.formActions}>
          <button onClick={onClose} className={s.btnSecondary}>Đóng</button>
        </div>
      </div>
    </Modal>
  )
}

// ── ManualSubmitModal ─────────────────────────────────────────────────────────

function ManualSubmitModal({ item, onClose, onSaved }) {
  const existing = item.tokenSubmittedData ?? {}
  const existingLinks = Array.isArray(existing.shared_links)
    ? existing.shared_links.filter(Boolean)
    : existing.shared_link ? [existing.shared_link] : []

  const [form, setForm] = useState({
    contactName: existing.contact_name ?? existing.contactName ?? '',
    phone:       existing.phone ?? '',
    description: existing.description ?? '',
    notes:       existing.notes ?? '',
  })
  const [sharedLinks, setSharedLinks]   = useState(existingLinks.length ? existingLinks : [''])
  const [markReceived, setMarkReceived] = useState(item.status === 'pending' || item.status === 'overdue')
  const [saving, setSaving]             = useState(false)
  const [err, setErr]                   = useState('')

  function setF(k, v) { setForm((p) => ({ ...p, [k]: v })); setErr('') }
  function handleLinkChange(idx, val) { setSharedLinks((p) => p.map((l, i) => i === idx ? val : l)) }
  function addLink()        { setSharedLinks((p) => [...p, '']) }
  function removeLink(idx)  { setSharedLinks((p) => p.filter((_, i) => i !== idx)) }

  const isUpdate = !!item.tokenSubmittedAt

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setErr('')
    try {
      const validLinks = sharedLinks.map((l) => l.trim()).filter(Boolean)
      for (const l of validLinks) {
        try { new URL(l) } catch { setErr(`Link không hợp lệ: ${l}`); setSaving(false); return }
      }
      const updated = await cdrApi.manualSubmit(item.id, {
        contactName:  form.contactName.trim() || null,
        phone:        form.phone.trim() || null,
        description:  form.description.trim() || null,
        sharedLinks:  validLinks,
        notes:        form.notes.trim() || null,
        markReceived,
      })
      onSaved(updated)
    } catch (e) {
      setErr(e.response?.data?.error?.message ?? 'Không thể lưu dữ liệu')
      setSaving(false)
    }
  }

  return (
    <Modal title={isUpdate ? 'Cập nhật dữ liệu KH' : 'Nhập dữ liệu KH thủ công'} onClose={onClose} maxWidth={600}>
      <form onSubmit={handleSubmit} className={s.formBody}>
        <div className={s.manualBanner}>
          <strong>📋 {item.documentName}</strong><br />
          {isUpdate ? 'Cập nhật lại dữ liệu KH đã nhập trước đó. Dữ liệu cũ sẽ bị thay thế.' : 'Nhập thông tin KH đã gửi qua Zalo / điện thoại / email trực tiếp vào hệ thống.'}
        </div>
        {err && <div className={s.formError}>{err}</div>}

        {[
          { label: 'Tên liên hệ', key: 'contactName', placeholder: 'Họ tên người liên hệ bên khách hàng', type: 'text' },
          { label: 'Số điện thoại', key: 'phone', placeholder: '0901 234 567', type: 'tel' },
        ].map((f) => (
          <div key={f.key} className={s.formGroup}>
            <label className={s.formLabel}>{f.label}</label>
            <input type={f.type} value={form[f.key]} onChange={(e) => setF(f.key, e.target.value)} className={s.formInput} placeholder={f.placeholder} />
          </div>
        ))}

        <div className={s.formGroup}>
          <label className={s.formLabel}>Mô tả tài liệu</label>
          <textarea value={form.description} onChange={(e) => setF('description', e.target.value)} rows={3}
            className={s.formTextarea} placeholder="Mô tả ngắn về tài liệu KH đã gửi..." />
        </div>

        <div className={s.formGroup}>
          <label className={s.formLabel}>
            Link tài liệu <span className={s.reminderCount}>(tuỳ chọn — có thể thêm nhiều)</span>
          </label>
          {sharedLinks.map((link, idx) => (
            <div key={idx} className={s.formLinkRow}>
              <input type="url" value={link} onChange={(e) => handleLinkChange(idx, e.target.value)}
                className={s.formInput} style={{ flex: 1 }} placeholder={`https://drive.google.com/...${idx > 0 ? ` (tài liệu ${idx + 1})` : ''}`} />
              {sharedLinks.length > 1 && (
                <button type="button" onClick={() => removeLink(idx)} className={s.formRemoveLink}>×</button>
              )}
            </div>
          ))}
          {sharedLinks.length < 10 && (
            <button type="button" onClick={addLink} className={s.formAddLink}>
              <span>+</span> Thêm link
            </button>
          )}
        </div>

        <div className={s.formGroup}>
          <label className={s.formLabel}>Ghi chú thêm</label>
          <textarea value={form.notes} onChange={(e) => setF('notes', e.target.value)} rows={2}
            className={s.formTextarea} placeholder="Ghi chú nội bộ về dữ liệu KH gửi..." />
        </div>

        {(item.status === 'pending' || item.status === 'overdue') && (
          <label className={`${s.formCheckRow} ${markReceived ? s.formCheckRowActive : ''}`}>
            <input type="checkbox" checked={markReceived} onChange={(e) => setMarkReceived(e.target.checked)} className={s.formCheckInput} />
            <div>
              <div className={`${s.formCheckTitle} ${markReceived ? s.formCheckTitleActive : ''}`}>Đồng thời đánh dấu "Đã nhận"</div>
              <div className={s.formCheckHint}>Chuyển trạng thái yêu cầu này sang Đã nhận sau khi lưu</div>
            </div>
          </label>
        )}

        <div className={s.formActions}>
          <button type="button" onClick={onClose} className={s.btnSecondary}>Huỷ</button>
          <button type="submit" disabled={saving} className={s.btnPrimary} style={{ background: 'var(--gradient-primary)' }}>
            {saving ? <Loader2 size={13} className={s.spinIcon} /> : <PenLine size={13} />}
            {saving ? 'Đang lưu...' : isUpdate ? 'Cập nhật dữ liệu' : 'Lưu dữ liệu KH'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── ReminderModal ─────────────────────────────────────────────────────────────

function ReminderModal({ item, onClose, onSent }) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr]         = useState('')

  async function handleSend(e) {
    e.preventDefault()
    setSending(true); setErr('')
    try {
      const updated = await cdrApi.sendReminder(item.id, { email: item.contactEmail, message: message.trim() || null })
      onSent(updated)
    } catch (e) {
      setErr(e.response?.data?.error?.message ?? 'Không thể gửi nhắc nhở')
      setSending(false)
    }
  }

  return (
    <Modal title="Gửi nhắc nhở khách hàng" onClose={onClose}>
      <form onSubmit={handleSend} className={s.formBody}>
        {err && <div className={s.formError}>{err}</div>}
        <div className={s.reminderNote}>
          Gửi nhắc nhở đến <strong>{item.contactEmail}</strong> về tài liệu <strong>"{item.documentName}"</strong>.
          {item.reminderCount > 0 && <span className={s.reminderCount}> (đã nhắc {item.reminderCount} lần)</span>}
        </div>
        <div className={s.formGroup}>
          <label className={s.formLabel}>Lời nhắn thêm (tuỳ chọn)</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3}
            className={s.formTextarea} placeholder="Thêm lời nhắn tùy chỉnh..." />
        </div>
        <div className={s.formActions}>
          <button type="button" onClick={onClose} className={s.btnSecondary}>Huỷ</button>
          <button type="submit" disabled={sending} className={s.btnPrimary}>
            {sending ? <Loader2 size={13} className={s.spinIcon} /> : <Bell size={13} />}
            {sending ? 'Đang gửi...' : 'Gửi nhắc nhở'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── FilterCompanyPicker ───────────────────────────────────────────────────────

function FilterCompanyPicker({ companies, value, onChange }) {
  const [search,   setSearch] = useState('')
  const [open,     setOpen]   = useState(false)
  const wrapRef   = useRef(null)
  const searchRef = useRef(null)

  const selected = companies.find((c) => c.id === value)
  const filtered = search.trim()
    ? companies.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : companies

  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()
    function onOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  function select(id) { onChange(id); setOpen(false); setSearch('') }

  return (
    <div ref={wrapRef} className={s.companyPickerWrap}>
      <div className={`${s.cpTrigger} ${s.companyPickerTriggerCompact}`} onClick={() => setOpen((o) => !o)}>
        <span className={`${s.cpTriggerText} ${selected ? s.companyPickerSelected : s.companyPickerPlaceholder}`}>
          {selected?.name ?? 'Tất cả'}
        </span>
        <ChevronDown size={11} className={`${s.iconMuted} ${s.chevronRotate} ${open ? s.chevronOpen : ''}`} />
      </div>
      {open && (
        <div className={s.cpDropdown}>
          <div className={s.cpSearch}>
            <Search size={12} className={s.iconMuted} />
            <input ref={searchRef} type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
              placeholder="Tìm khách hàng..." className={s.cpSearchInput} />
            {search && (
              <button type="button" className={s.cpSearchClear} onClick={() => setSearch('')}>
                <X size={10} />
              </button>
            )}
          </div>
          <div className={s.cpList}>
            <div className={`${s.cpItem} ${!value ? s.cpItemActive : ''}`} onClick={() => select('')}>
              Tất cả khách hàng
            </div>
            {filtered.map((c) => (
              <div key={c.id} className={`${s.cpItem} ${value === c.id ? s.cpItemActive : ''}`} onClick={() => select(c.id)}>
                {c.name}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className={s.cpEmpty}>Không tìm thấy &quot;{search}&quot;</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── BoardView ─────────────────────────────────────────────────────────────────

function BoardView({ items, isAdmin, navigate, actionLoading, onEdit, onReceive, onUnreceive, onDismiss, onManualSubmit, onViewSubmitted, onOpenLink, onDelete }) {
  const byStatus = {}
  BOARD_COLS.forEach(({ key }) => { byStatus[key] = [] })
  items.forEach((item) => { if (byStatus[item.status]) byStatus[item.status].push(item) })

  return (
    <div className={s.boardWrap}>
      {BOARD_COLS.map(({ key, label, dot }) => (
        <div key={key} className={s.boardCol}>
          <div className={s.boardColHead}>
            <span className={`${s.boardColDot} ${dot}`} />
            <span className={s.boardColTitle}>{label}</span>
            <span className={s.boardColCount}>{byStatus[key].length}</span>
          </div>
          <div className={s.boardCards}>
            {byStatus[key].length === 0 && (
              <p className={s.boardEmptyText}>Không có</p>
            )}
            {byStatus[key].map((item) => {
              const busy       = actionLoading[item.id]
              const hasToken   = !!item.publicToken
              const isOverdue  = item.status === 'overdue'

              return (
                <div key={item.id} className={`${s.boardCard} ${isOverdue ? s.boardCardOverdue : ''}`}>
                  <div className={s.boardCardTitle}>{item.documentName}</div>
                  {item.companyName && (
                    <div
                      className={s.boardCardCompany}
                      onClick={() => navigate(`/companies/${item.companyId}?tab=client-requests`)}
                      title={item.companyName}
                    >
                      <Building2 size={10} />
                      {item.companyName}
                    </div>
                  )}
                  <div className={s.boardCardMeta}>
                    {item.periodLabel && <span className={s.boardCardDeadline}>{item.periodLabel}</span>}
                    {item.deadlineDate && (
                      <span className={isOverdue ? s.boardCardDeadlineOver : s.boardCardDeadline}>
                        Hạn: {fmtDate(item.deadlineDate)}
                      </span>
                    )}
                  </div>
                  <div className={s.boardCardActions}>
                    {item.tokenSubmittedAt && (
                      <button className={`${s.boardCardBtn}`} onClick={() => onViewSubmitted(item)} title="Xem dữ liệu KH">
                        <Eye size={12} />
                      </button>
                    )}
                    <button className={s.boardCardBtn} onClick={() => onEdit(item)} title="Chỉnh sửa" disabled={!!busy}>
                      <PenLine size={12} />
                    </button>
                    <button className={`${s.boardCardBtn}`} onClick={() => onOpenLink(item)} title={hasToken ? 'Xem link' : 'Tạo link'}
                      disabled={!hasToken && (item.status === 'received' || item.status === 'not_required')}>
                      <Link2 size={12} />
                    </button>
                    {(item.status === 'pending' || item.status === 'overdue') && (
                      <button className={`${s.boardCardBtn} ${s.boardCardBtnSuccess}`} onClick={() => onReceive(item)} title="Đánh dấu đã nhận" disabled={!!busy}>
                        {busy === 'receive' ? <Loader2 size={12} className={s.spinIcon} /> : <CheckCircle2 size={12} />}
                      </button>
                    )}
                    {item.status === 'received' && (
                      <button className={s.boardCardBtn} onClick={() => onUnreceive(item)} title="Hoàn tác đã nhận" disabled={!!busy}>
                        <RotateCcw size={12} />
                      </button>
                    )}
                    {(item.status === 'pending' || item.status === 'overdue') && (
                      <button className={`${s.boardCardBtn} ${s.boardCardBtnDanger}`} onClick={() => onDismiss(item)} title="Không cần" disabled={!!busy}>
                        <XCircle size={12} />
                      </button>
                    )}
                    {isAdmin && (
                      <button className={`${s.boardCardBtn} ${s.boardCardBtnDanger}`} onClick={() => onDelete(item)} title="Xoá" disabled={!!busy}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminClientRequests() {
  const navigate    = useNavigate()
  const currentUser = useAuthStore((st) => st.user)
  const addToast    = useToastStore((st) => st.toast)
  const isAdmin     = currentUser?.role === 'admin'

  // Restore saved filters on mount
  const [initF] = useState(() => loadSavedFilters())

  // View
  const [view, setView] = useState(initF.view ?? 'list')

  // Reference data
  const [companies, setCompanies]         = useState([])
  const [staffList, setStaffList]         = useState([])
  const [availableYears, setAvailableYears] = useState([])

  // Stats
  const [stats, setStats]               = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsKey, setStatsKey]         = useState(0)

  // List data
  const [items, setItems]           = useState([])
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 })
  const [loading, setLoading]       = useState(true)
  const [page, setPage]             = useState(1)
  const [pageSize, setPageSize]     = useState(initF.pageSize ?? 20)

  // Date filters — default: current month
  const [yearFilter,   setYearFilter]   = useState(initF.yearFilter   ?? CUR_YEAR)
  const [monthFilter,  setMonthFilter]  = useState(initF.monthFilter  ?? CUR_MONTH)
  const [deadlineFrom, setDeadlineFrom] = useState(initF.deadlineFrom ?? INIT_DATES.from)
  const [deadlineTo,   setDeadlineTo]   = useState(initF.deadlineTo   ?? INIT_DATES.to)

  // Filters
  const [statusFilter, setStatusFilter]       = useState(initF.statusFilter  ?? '')
  const [companyFilter, setCompanyFilter]     = useState(initF.companyFilter ?? '')
  const [staffFilter, setStaffFilter]         = useState(initF.staffFilter   ?? '')
  const [searchQuery, setSearchQuery]         = useState(initF.searchQuery   ?? '')
  const [debouncedSearch, setDebouncedSearch] = useState(initF.searchQuery   ?? '')
  const [sortFilter, setSortFilter]           = useState(initF.sortFilter    ?? 'deadline_date:asc')

  // Modals
  const [showCreate, setShowCreate]                 = useState(false)
  const [editTarget, setEditTarget]                 = useState(null)
  const [deleteTarget, setDeleteTarget]             = useState(null)
  const [deleting, setDeleting]                     = useState(false)
  const [linkTarget, setLinkTarget]                 = useState(null)
  const [generatingLink, setGeneratingLink]         = useState(false)
  const [generatedUrl, setGeneratedUrl]             = useState(null)
  const [linkCopied, setLinkCopied]                 = useState(false)
  const [viewSubmitted, setViewSubmitted]           = useState(null)
  const [reminderTarget, setReminderTarget]         = useState(null)
  const [manualSubmitTarget, setManualSubmitTarget] = useState(null)
  const [actionLoading, setActionLoading]           = useState({})

  // Load reference data on mount
  useEffect(() => {
    listCompanies({ limit: 300, status: 'active' })
      .then(({ companies: c }) => setCompanies(c))
      .catch(() => {})
    listUserOptions({ status: 'active' })
      .then(({ users: u }) => setStaffList(u))
      .catch(() => {})
    cdrApi.getCdrYears()
      .then((years) => {
        setAvailableYears(years)
        if (years.length > 0 && !years.includes(parseInt(CUR_YEAR, 10))) {
          const firstYear = String(years[0])
          setYearFilter(firstYear)
          const { from, to } = yearMonthToDates(firstYear, '')
          setDeadlineFrom(from); setDeadlineTo(to)
        }
      })
      .catch(() => {
        const y = parseInt(CUR_YEAR, 10)
        setAvailableYears([y, y - 1, y - 2])
      })
  }, [])

  // Load stats via parallel calls — works for both admin and staff roles
  useEffect(() => {
    let cancelled = false
    setStatsLoading(true)
    const base = {
      companyId:        companyFilter   || undefined,
      requestedBy:      !isAdmin ? currentUser?.id : (staffFilter || undefined),
      search:           debouncedSearch || undefined,
      deadlineDateFrom: deadlineFrom    || undefined,
      deadlineDateTo:   deadlineTo      || undefined,
      limit: 1, page: 1,
    }
    const statusKeys = ['pending', 'overdue', 'received', 'not_required']
    Promise.all([
      cdrApi.getClientRequests(base),
      ...statusKeys.map((st) => cdrApi.getClientRequests({ ...base, status: st })),
    ]).then(([all, ...bySt]) => {
      if (!cancelled) {
        const counts = { total: all.pagination.total }
        statusKeys.forEach((st, i) => { counts[st] = bySt[i].pagination.total })
        setStats(counts)
        setStatsLoading(false)
      }
    }).catch(() => {
      if (!cancelled) { setStats({}); setStatsLoading(false) }
    })
    return () => { cancelled = true }
  }, [companyFilter, staffFilter, debouncedSearch, isAdmin, currentUser?.id, deadlineFrom, deadlineTo, statsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 350)
    return () => clearTimeout(t)
  }, [searchQuery])

  // Reset page on filter change
  useEffect(() => { setPage(1) }, [statusFilter, companyFilter, staffFilter, debouncedSearch, sortFilter, deadlineFrom, deadlineTo, pageSize])

  // Persist filters to sessionStorage
  useEffect(() => {
    saveFilters({
      view, yearFilter, monthFilter, deadlineFrom, deadlineTo,
      sortFilter, searchQuery, companyFilter, staffFilter, statusFilter, pageSize,
    })
  }, [view, yearFilter, monthFilter, deadlineFrom, deadlineTo, sortFilter, searchQuery, companyFilter, staffFilter, statusFilter, pageSize])

  // Load list — staff always forced to their own, admin can filter
  const loadList = useCallback(() => {
    let cancelled = false
    setLoading(true)
    const [sortBy, sortDir] = sortFilter.split(':')
    cdrApi.getClientRequests({
      status:           statusFilter  || undefined,
      companyId:        companyFilter || undefined,
      requestedBy:      !isAdmin ? currentUser?.id : (staffFilter || undefined),
      search:           debouncedSearch || undefined,
      deadlineDateFrom: deadlineFrom  || undefined,
      deadlineDateTo:   deadlineTo    || undefined,
      page,
      limit: view === 'board' ? 500 : pageSize,
      sortBy,
      sortDir,
    })
      .then(({ items: it, pagination: p }) => {
        if (!cancelled) {
          setItems(it ?? [])
          setPagination(p ?? { total: 0, totalPages: 1 })
        }
      })
      .catch(() => { if (!cancelled) setItems([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [statusFilter, companyFilter, staffFilter, debouncedSearch, sortFilter, page, pageSize, isAdmin, currentUser?.id, deadlineFrom, deadlineTo, view])

  useEffect(() => {
    const cancel = loadList()
    return cancel
  }, [loadList])

  // ── Row actions ──────────────────────────────────────────────────────────────

  async function handleReceive(item) {
    setActionLoading((p) => ({ ...p, [item.id]: 'receive' }))
    try {
      const updated = await cdrApi.receiveClientRequest(item.id)
      setItems((prev) => prev.map((r) => r.id === item.id ? updated : r))
      setStatsKey((k) => k + 1)
      addToast('Đã đánh dấu đã nhận', 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể cập nhật', 'error')
    } finally { setActionLoading((p) => ({ ...p, [item.id]: null })) }
  }

  async function handleUnreceive(item) {
    setActionLoading((p) => ({ ...p, [item.id]: 'unreceive' }))
    try {
      const updated = await cdrApi.unreceiveClientRequest(item.id)
      setItems((prev) => prev.map((r) => r.id === item.id ? updated : r))
      setStatsKey((k) => k + 1)
      addToast('Đã hoàn tác trạng thái nhận', 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể cập nhật', 'error')
    } finally { setActionLoading((p) => ({ ...p, [item.id]: null })) }
  }

  async function handleDismiss(item) {
    setActionLoading((p) => ({ ...p, [item.id]: 'dismiss' }))
    try {
      const updated = await cdrApi.dismissClientRequest(item.id)
      setItems((prev) => prev.map((r) => r.id === item.id ? updated : r))
      setStatsKey((k) => k + 1)
      addToast('Đã đánh dấu không cần', 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể cập nhật', 'error')
    } finally { setActionLoading((p) => ({ ...p, [item.id]: null })) }
  }

  async function handleRevokeLink(item) {
    setActionLoading((p) => ({ ...p, [item.id]: 'revoke' }))
    try {
      await cdrApi.revokeLink(item.id)
      setItems((prev) => prev.map((r) => r.id === item.id ? { ...r, publicToken: null, tokenExpiresAt: null } : r))
      addToast('Đã thu hồi link', 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể thu hồi link', 'error')
    } finally { setActionLoading((p) => ({ ...p, [item.id]: null })) }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await cdrApi.deleteClientRequest(deleteTarget.id)
      setItems((prev) => prev.filter((r) => r.id !== deleteTarget.id))
      setPagination((p) => ({ ...p, total: Math.max(0, p.total - 1) }))
      setDeleteTarget(null)
      setStatsKey((k) => k + 1)
      addToast(`Đã xoá yêu cầu "${deleteTarget.documentName}"`, 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể xoá', 'error')
    } finally { setDeleting(false) }
  }

  function openLinkModal(item) {
    setLinkTarget(item)
    setGeneratedUrl(item.publicToken ? `${window.location.origin}/public/form/${item.publicToken}` : null)
    setLinkCopied(false)
  }

  async function handleGenerateLink() {
    if (!linkTarget) return
    setGeneratingLink(true)
    try {
      const data = await cdrApi.generateLink(linkTarget.id, { expiresInDays: 30 })
      const url  = `${window.location.origin}/public/form/${data.token}`
      setGeneratedUrl(url)
      setItems((prev) => prev.map((r) => r.id === linkTarget.id ? { ...r, publicToken: data.token, tokenExpiresAt: data.expiresAt } : r))
      setLinkTarget((prev) => ({ ...prev, publicToken: data.token, tokenExpiresAt: data.expiresAt }))
      addToast('Đã tạo link chia sẻ', 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể tạo link', 'error')
    } finally { setGeneratingLink(false) }
  }

  async function handleCopyUrl(url) {
    try {
      await navigator.clipboard.writeText(url)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch { addToast('Không thể copy, hãy copy thủ công', 'warning') }
  }

  function handleYearChange(year) {
    setYearFilter(year)
    const { from, to } = yearMonthToDates(year, year ? monthFilter : '')
    setDeadlineFrom(from); setDeadlineTo(to)
  }

  function handleMonthChange(month) {
    setMonthFilter(month)
    if (!yearFilter) return
    const { from, to } = yearMonthToDates(yearFilter, month)
    setDeadlineFrom(from); setDeadlineTo(to)
  }

  function resetFilters() {
    setStatusFilter(''); setCompanyFilter(''); setStaffFilter('')
    setSearchQuery(''); setSortFilter('deadline_date:asc'); setPage(1)
    setYearFilter(CUR_YEAR); setMonthFilter(CUR_MONTH)
    setDeadlineFrom(INIT_DATES.from); setDeadlineTo(INIT_DATES.to)
    setPageSize(20)
    try { sessionStorage.removeItem(FILTER_KEY) } catch (_) {}
  }

  const activeFilterCount = [statusFilter, companyFilter, staffFilter, debouncedSearch].filter(Boolean).length
    + (sortFilter !== 'deadline_date:asc' ? 1 : 0)
    + (yearFilter !== CUR_YEAR || monthFilter !== CUR_MONTH ? 1 : 0)

  const statItems = [
    { label: 'Tổng',      value: stats?.total        ?? 0, cls: s.statTotal },
    { label: 'Chờ KH',    value: stats?.pending      ?? 0, cls: s.statPending },
    { label: 'Quá hạn',   value: stats?.overdue      ?? 0, cls: s.statOverdue },
    { label: 'Đã nhận',   value: stats?.received     ?? 0, cls: s.statReceived },
    { label: 'Không cần', value: stats?.not_required ?? 0, cls: s.statNotRequired },
  ]

  function pageWindow() {
    const total = pagination.totalPages ?? 1
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
    if (page <= 4) return [1, 2, 3, 4, 5, '…', total]
    if (page >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total]
    return [1, '…', page - 1, page, page + 1, '…', total]
  }

  const from = pagination.total === 0 ? 0 : (page - 1) * pageSize + 1
  const to   = Math.min(page * pageSize, pagination.total)

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className={s.page}>

        {/* ── Toolbar ── */}
        <div className={s.toolbar}>
          <div className={s.toolbarLeft}>
            <h1 className={s.pageTitle}>Yêu cầu KH</h1>
            {pagination.total > 0 && !loading && (
              <span className={s.totalBadge}>{pagination.total}</span>
            )}
          </div>
          <div className={s.toolbarRight}>
            <div className={s.viewSwitch}>
              <button className={`${s.viewBtn} ${view === 'list' ? s.viewBtnActive : ''}`} onClick={() => setView('list')}>
                <List size={13} /> Danh sách
              </button>
              <button className={`${s.viewBtn} ${view === 'board' ? s.viewBtnActive : ''}`} onClick={() => setView('board')}>
                <Columns size={13} /> Board
              </button>
            </div>
            <button className={s.btnPrimary} onClick={() => setShowCreate(true)}>
              <Plus size={14} /> Tạo yêu cầu
            </button>
          </div>
        </div>

        {/* ── Filter bar ── */}
        <div className={s.filterBar}>
          <div className={s.filterBarHead}>
            <div className={s.filterBarTitle}>
              <Filter size={12} />
              Bộ lọc
              {activeFilterCount > 0 && (
                <span className={s.filterActiveBadge}>{activeFilterCount} đang bật</span>
              )}
            </div>
            <button className={s.filterReset} onClick={resetFilters}>
              <RotateCcw size={11} /> Đặt lại
            </button>
          </div>

          <div className={s.filterGrid}>

            {/* Năm */}
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>Năm</label>
              <select value={yearFilter} onChange={(e) => handleYearChange(e.target.value)} className={s.filterSelect}>
                <option value="">Tất cả năm</option>
                {availableYears.map((y) => (
                  <option key={y} value={String(y)}>Năm {y}</option>
                ))}
              </select>
            </div>

            {/* Tháng */}
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>Tháng</label>
              <select value={monthFilter} onChange={(e) => handleMonthChange(e.target.value)} className={s.filterSelect} disabled={!yearFilter}>
                <option value="">Cả năm</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={String(m)}>Tháng {m}</option>
                ))}
              </select>
            </div>

            {/* Sắp xếp */}
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>Sắp xếp</label>
              <select value={sortFilter} onChange={(e) => setSortFilter(e.target.value)} className={s.filterSelect}>
                {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Công ty */}
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>Khách hàng</label>
              <FilterCompanyPicker
                companies={companies}
                value={companyFilter}
                onChange={(id) => { setCompanyFilter(id); setPage(1) }}
              />
            </div>

            {/* Nhân viên (admin only) */}
            {isAdmin && staffList.length > 0 && (
              <div className={s.filterGroup}>
                <label className={s.filterLabel}>Nhân viên</label>
                <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} className={s.filterSelect}>
                  <option value="">Tất cả</option>
                  {staffList.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            )}

            {/* Từ khoá */}
            <div className={`${s.filterGroup} ${s.filterGroupGrow}`}>
              <label className={s.filterLabel}>Từ khoá</label>
              <div className={s.filterSearchWrap}>
                <Search size={12} className={s.filterSearchIcon} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm tên tài liệu, email KH..."
                  className={`${s.filterInput} ${s.filterInputWithIcon}`}
                />
              </div>
            </div>
          </div>

          {/* Status chips */}
          <div className={s.statusChips}>
            {STATUS_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`${s.statusChip} ${statusFilter === key ? s.statusChipActive : ''}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Active filter chips */}
          {(yearFilter !== CUR_YEAR || monthFilter !== CUR_MONTH || companyFilter || staffFilter || debouncedSearch) && (
            <div className={s.filterChipsRow}>
              {(yearFilter || monthFilter) && (yearFilter !== CUR_YEAR || monthFilter !== CUR_MONTH) && (
                <span className={s.filterChip}>
                  {monthFilter && yearFilter ? `T${monthFilter}/${yearFilter}` : yearFilter ? `Năm ${yearFilter}` : `T${monthFilter}`}
                  <button className={s.filterChipRemove} onClick={() => { setYearFilter(CUR_YEAR); setMonthFilter(CUR_MONTH); setDeadlineFrom(INIT_DATES.from); setDeadlineTo(INIT_DATES.to) }}>×</button>
                </span>
              )}
              {companyFilter && (
                <span className={s.filterChip}>
                  KH: {companies.find((c) => c.id === companyFilter)?.name ?? '?'}
                  <button className={s.filterChipRemove} onClick={() => setCompanyFilter('')}>×</button>
                </span>
              )}
              {isAdmin && staffFilter && (
                <span className={s.filterChip}>
                  NV: {staffList.find((u) => u.id === staffFilter)?.name ?? '?'}
                  <button className={s.filterChipRemove} onClick={() => setStaffFilter('')}>×</button>
                </span>
              )}
              {debouncedSearch && (
                <span className={s.filterChip}>
                  &ldquo;{debouncedSearch}&rdquo;
                  <button className={s.filterChipRemove} onClick={() => setSearchQuery('')}>×</button>
                </span>
              )}
            </div>
          )}

          {/* ── Stats row ── */}
          <div className={s.statsRow}>
            {statItems.map((item, i) => (
              <Fragment key={item.label}>
                <div className={s.statItem}>
                  <span className={`${s.statValue} ${item.cls}`}>
                    {statsLoading ? '…' : item.value}
                  </span>
                  <span className={s.statLabel}>{item.label}</span>
                </div>
                {i < statItems.length - 1 && <span className={s.statDivider} />}
              </Fragment>
            ))}
          </div>
        </div>

        {/* ── Loading spinner (non-list views) ── */}
        {loading && view === 'board' && (
          <div className={s.loadingBox}>
            <div className={s.spinner} />
            Đang tải...
          </div>
        )}

        {/* ── Board view ── */}
        {view === 'board' && !loading && (
          <BoardView
            items={items}
            isAdmin={isAdmin}
            navigate={navigate}
            actionLoading={actionLoading}
            onEdit={setEditTarget}
            onReceive={handleReceive}
            onUnreceive={handleUnreceive}
            onDismiss={handleDismiss}
            onManualSubmit={setManualSubmitTarget}
            onViewSubmitted={setViewSubmitted}
            onOpenLink={openLinkModal}
            onDelete={setDeleteTarget}
          />
        )}

        {/* ── List view ── */}
        {view === 'list' && (
          <div className={s.tableWrap}>
            <div className={s.tableScrollX}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.th} style={{ minWidth: 200 }}>Tài liệu yêu cầu</th>
                    <th className={s.th} style={{ minWidth: 150 }}>Công ty</th>
                    <th className={s.th} style={{ width: 110 }}>Trạng thái</th>
                    <th className={`${s.th} ${s.thCenter}`} style={{ width: 80 }}>Dữ liệu KH</th>
                    <th className={s.th} style={{ width: 110 }}>Kỳ</th>
                    <th className={s.th} style={{ width: 100 }}>Hạn nộp</th>
                    <th className={s.th} style={{ width: 155 }}>Email KH</th>
                    <th className={`${s.th} ${s.thCenter}`} style={{ width: 60 }}>Link</th>
                    <th className={s.th} style={{ width: 150 }} />
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        {[200, 150, 100, 60, 100, 90, 140, 50, 110].map((w, j) => (
                          <td key={j} className={s.td}>
                            <div className={s.tableSkeletonBar} style={{ width: w }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={9} className={s.td}>
                        <div className={s.emptyBox}>
                          <div className={s.emptyIcon}><ClipboardList size={32} /></div>
                          <p className={s.emptyTitle}>Không có yêu cầu tài liệu</p>
                          <p className={s.emptyText}>Thử thay đổi bộ lọc hoặc tạo yêu cầu mới</p>
                        </div>
                      </td>
                    </tr>
                  ) : items.map((item) => {
                    const busy         = actionLoading[item.id]
                    const hasToken     = !!item.publicToken
                    const hasSubmitted = !!item.tokenSubmittedAt
                    const isOverdue    = item.status === 'overdue'

                    return (
                      <tr key={item.id} className={`${s.tr} ${isOverdue ? s.trOverdue : ''}`}>
                        <td className={s.td}>
                          <div className={s.docTitle}>{item.documentName}</div>
                          {item.description && <div className={s.docDesc}>{item.description}</div>}
                        </td>

                        <td className={s.td}>
                          {item.companyName ? (
                            <span
                              className={s.companyLink}
                              onClick={() => navigate(`/companies/${item.companyId}?tab=client-requests`)}
                              title={item.companyName}
                            >
                              <Building2 size={11} />
                              {item.companyName}
                            </span>
                          ) : <span className={s.mutedDash}>—</span>}
                        </td>

                        <td className={s.td}><StatusBadge status={item.status} /></td>

                        <td className={`${s.td} ${s.tdCenter}`}>
                          {hasSubmitted ? (
                            <button className={s.viewSubmittedBtn} onClick={() => setViewSubmitted(item)} title="Xem dữ liệu KH đã gửi">
                              <Eye size={11} /> Xem
                            </button>
                          ) : <span className={s.mutedDash}>—</span>}
                        </td>

                        <td className={s.td}><span className={s.periodText}>{item.periodLabel || '—'}</span></td>

                        <td className={s.td}>
                          <span className={isOverdue ? s.deadlineOverdue : s.deadlineText}>
                            {fmtDate(item.deadlineDate)}
                          </span>
                        </td>

                        <td className={s.td}><span className={s.emailText}>{item.contactEmail || '—'}</span></td>

                        <td className={`${s.td} ${s.tdCenter}`}>
                          <RowBtn
                            title={hasToken ? 'Xem / sao chép link' : 'Tạo link chia sẻ'}
                            onClick={() => openLinkModal(item)}
                            disabled={!hasToken && (item.status === 'received' || item.status === 'not_required')}
                            className={hasToken ? s.rowBtnPrimary : ''}
                          >
                            <Link2 size={13} />
                          </RowBtn>
                        </td>

                        <td className={s.td}>
                          <div className={s.actionBtns}>
                            <RowBtn title="Chỉnh sửa" onClick={() => setEditTarget(item)} disabled={!!busy}>
                              <Eye size={13} />
                            </RowBtn>

                            {item.status !== 'not_required' && (
                              <RowBtn
                                title={item.tokenSubmittedAt ? 'Cập nhật dữ liệu KH' : 'Nhập dữ liệu KH thủ công'}
                                onClick={() => setManualSubmitTarget(item)}
                                disabled={!!busy}
                                className={s.rowBtnPurple}
                              >
                                <PenLine size={13} />
                              </RowBtn>
                            )}

                            {(item.status === 'pending' || item.status === 'overdue') && (
                              <RowBtn title="Đánh dấu đã nhận" onClick={() => handleReceive(item)} disabled={!!busy} className={s.rowBtnSuccess}>
                                {busy === 'receive' ? <Loader2 size={13} className={s.spinIcon} /> : <CheckCircle2 size={13} />}
                              </RowBtn>
                            )}

                            {item.status === 'received' && (
                              <RowBtn title="Hoàn tác đã nhận" onClick={() => handleUnreceive(item)} disabled={!!busy}>
                                <RotateCcw size={13} />
                              </RowBtn>
                            )}

                            {(item.status === 'pending' || item.status === 'overdue') && (
                              <RowBtn title="Đánh dấu không cần" onClick={() => handleDismiss(item)} disabled={!!busy}>
                                <XCircle size={13} />
                              </RowBtn>
                            )}

                            {hasToken && (item.status === 'pending' || item.status === 'overdue') && (
                              <RowBtn title="Thu hồi link" onClick={() => handleRevokeLink(item)} disabled={!!busy} className={s.rowBtnWarning}>
                                {busy === 'revoke' ? <Loader2 size={13} className={s.spinIcon} /> : <Link2Off size={13} />}
                              </RowBtn>
                            )}

                            {item.contactEmail && (item.status === 'pending' || item.status === 'overdue') && (
                              <RowBtn title="Gửi nhắc nhở email" onClick={() => setReminderTarget(item)} disabled={!!busy}>
                                <Bell size={13} />
                              </RowBtn>
                            )}

                            {isAdmin && (
                              <RowBtn title="Xoá yêu cầu" onClick={() => setDeleteTarget(item)} disabled={!!busy} className={s.rowBtnDanger}>
                                <Trash2 size={13} />
                              </RowBtn>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className={s.pagination}>
              <div className={s.paginationLeft}>
                <span className={s.paginationInfo}>
                  {loading ? '...' : `${from}–${to} / ${pagination.total} yêu cầu`}
                </span>
                <div className={s.pageSizeBtns}>
                  {[20, 50, 100].map((n) => (
                    <button
                      key={n}
                      className={`${s.pageSizeBtn} ${pageSize === n ? s.pageSizeBtnActive : ''}`}
                      onClick={() => setPageSize(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className={s.paginationBtns}>
                <button className={s.pageBtn} onClick={() => setPage(1)} disabled={page === 1}>«</button>
                <button className={s.pageBtn} onClick={() => setPage((p) => p - 1)} disabled={page === 1}>‹</button>
                {pageWindow().map((n, i) =>
                  n === '…' ? (
                    <span key={`e${i}`} className={s.paginationGap}>…</span>
                  ) : (
                    <button key={n} className={`${s.pageBtn} ${page === n ? s.pageBtnActive : ''}`} onClick={() => setPage(n)}>{n}</button>
                  )
                )}
                <button className={s.pageBtn} onClick={() => setPage((p) => p + 1)} disabled={page === (pagination.totalPages ?? 1)}>›</button>
                <button className={s.pageBtn} onClick={() => setPage(pagination.totalPages ?? 1)} disabled={page === (pagination.totalPages ?? 1)}>»</button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ── Modals ── */}
      {(showCreate || editTarget) && (
        <CdrFormModal
          companies={companies}
          initial={editTarget}
          onClose={() => { setShowCreate(false); setEditTarget(null) }}
          onSaved={(saved) => {
            setShowCreate(false); setEditTarget(null)
            if (editTarget) {
              setItems((prev) => prev.map((r) => r.id === saved.id ? saved : r))
              addToast('Đã cập nhật yêu cầu', 'success')
            } else {
              loadList()
              setStatsKey((k) => k + 1)
              addToast(`Đã tạo yêu cầu "${saved.documentName}"`, 'success')
            }
          }}
        />
      )}

      {deleteTarget && (
        <Modal title="Xoá yêu cầu tài liệu" onClose={() => setDeleteTarget(null)}>
          <div className={s.formBody}>
            <div className={s.deleteBanner}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Xoá yêu cầu <strong>"{deleteTarget.documentName}"</strong>? Hành động này không thể hoàn tác.
              </span>
            </div>
            <div className={s.formActions}>
              <button onClick={() => setDeleteTarget(null)} className={s.btnSecondary}>Huỷ</button>
              <button onClick={handleDelete} disabled={deleting} className={s.btnDangerSolid}>
                {deleting ? <Loader2 size={13} className={s.spinIcon} /> : <Trash2 size={13} />}
                {deleting ? 'Đang xoá...' : 'Xoá'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {linkTarget && (
        <LinkModal item={linkTarget} generatedUrl={generatedUrl} generating={generatingLink} copied={linkCopied}
          onGenerate={handleGenerateLink} onCopy={handleCopyUrl}
          onClose={() => { setLinkTarget(null); setGeneratedUrl(null) }}
        />
      )}

      {viewSubmitted && <SubmittedDataModal item={viewSubmitted} onClose={() => setViewSubmitted(null)} />}

      {reminderTarget && (
        <ReminderModal item={reminderTarget} onClose={() => setReminderTarget(null)}
          onSent={(updated) => {
            setItems((prev) => prev.map((r) => r.id === updated.id ? updated : r))
            setReminderTarget(null)
            addToast('Đã gửi nhắc nhở', 'success')
          }}
        />
      )}

      {manualSubmitTarget && (
        <ManualSubmitModal item={manualSubmitTarget} onClose={() => setManualSubmitTarget(null)}
          onSaved={(updated) => {
            setItems((prev) => prev.map((r) => r.id === updated.id ? updated : r))
            setManualSubmitTarget(null)
            addToast('Đã lưu dữ liệu khách hàng', 'success')
          }}
        />
      )}
    </AppLayout>
  )
}
