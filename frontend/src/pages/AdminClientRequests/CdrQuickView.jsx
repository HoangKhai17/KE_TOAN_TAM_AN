import { useState, useEffect } from 'react'
import {
  X, Loader2, Building2, User, Users, Calendar, Clock, Flag, Mail,
  AlertTriangle, ChevronDown, PenLine, Check, FileText, Edit2, ExternalLink, Copy, Inbox,
} from 'lucide-react'
import * as cdrApi from '../../api/clientRequests'
import DateBox from '../../components/ui/DateBox'
import CollaboratorPicker from '../Tasks/CollaboratorPicker'
import { useStaffOptions } from '../../hooks/useReferenceData'
import { useToastStore } from '../../stores/toastStore'
import { useAuthStore } from '../../stores/authStore'
import CdrComments from './CdrComments'
import CdrChecklist from './CdrChecklist'
import s from '../Tasks/tasks.module.css'
import cs from './adminClientRequests.module.css'

const STATUS_LABEL = { pending: 'Chờ KH', received: 'Đã nhận', not_required: 'Không cần', overdue: 'Quá hạn' }
const STATUS_CLASS = { pending: cs.statusPending, received: cs.statusReceived, not_required: cs.statusNotRequired, overdue: cs.statusOverdue }
const PRIORITY_LABEL = { high: 'Cao', medium: 'Trung bình', low: 'Thấp' }
const PRIORITY_CLASS = { high: cs.prioHigh, medium: cs.prioMedium, low: cs.prioLow }

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function toDateValue(iso) {
  if (!iso) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const shortName = (nm) => { const p = (nm || '').trim().split(/\s+/); return p.length <= 2 ? (nm || '') : p.slice(-2).join(' ') }

function CopyBtn({ text }) {
  const [done, setDone] = useState(false)
  if (!text) return null
  return (
    <button
      type="button"
      className={cs.qvCopyBtn}
      title="Sao chép"
      onClick={() => { try { navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200) } catch { /* noop */ } }}
    >
      {done ? <Check size={11} /> : <Copy size={11} />}
    </button>
  )
}

// Nội dung dữ liệu khách hàng đã gửi — hiển thị ngay trong tab Quick view.
function SubmittedDataView({ item, onManualSubmit }) {
  const data = item.tokenSubmittedData ?? {}
  const sharedLinks = Array.isArray(data.shared_links) ? data.shared_links.filter(Boolean)
    : (data.shared_link ? [data.shared_link] : [])
  const submittedAt = item.tokenSubmittedAt
    ? new Date(item.tokenSubmittedAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null

  if (!item.tokenSubmittedAt) {
    return (
      <div className={cs.qvDataEmpty}>
        <Inbox size={30} />
        <p>Chưa có dữ liệu khách hàng gửi về.</p>
        {item.status !== 'not_required' && (
          <button className={cs.dataEntryBtn} onClick={() => onManualSubmit?.(item)}>
            <PenLine size={12} /> Nhập dữ liệu KH thủ công
          </button>
        )}
      </div>
    )
  }

  const fields = [
    { label: 'Tên liên hệ',    value: data.contact_name ?? data.contactName, icon: '👤' },
    { label: 'Số điện thoại',  value: data.phone,       icon: '📞' },
    { label: 'Mô tả tài liệu', value: data.description, icon: '📄' },
    { label: 'Ghi chú thêm',   value: data.notes,       icon: '💬' },
  ]

  return (
    <div className={cs.qvDataView}>
      <div className={cs.receivedBanner}>
        <span style={{ fontSize: 16 }}>{data.submitted_via === 'manual' ? '📋' : '✅'}</span>
        <div style={{ flex: 1 }}>
          <strong>{item.documentName}</strong>
          {submittedAt && <span className={cs.reminderCount}> · {data.submitted_via === 'manual' ? 'Nhập lúc' : 'Gửi lúc'} {submittedAt}</span>}
          {data.submitted_via === 'manual' && <span className={cs.manualBadge}>Nhập thủ công</span>}
        </div>
        {item.status !== 'not_required' && (
          <button className={cs.dataEntryBtn} onClick={() => onManualSubmit?.(item)} title="Cập nhật dữ liệu KH">
            <PenLine size={11} /> Sửa
          </button>
        )}
      </div>

      {fields.map((f) => (
        <div key={f.label} className={cs.dataFieldRow}>
          <div className={cs.dataFieldLabel}><span>{f.icon}</span>{f.label}</div>
          {!f.value
            ? <span className={cs.dataFieldEmpty}>Không có</span>
            : <div className={cs.dataFieldValueRow}>
                <div className={cs.dataFieldValue}>{f.value}</div>
                <CopyBtn text={f.value} />
              </div>}
        </div>
      ))}

      <div className={cs.dataFieldRow}>
        <div className={cs.dataFieldLabel}>
          <span>🔗</span>Link chia sẻ
          {sharedLinks.length > 1 && <span className={cs.dataCountBadge}>{sharedLinks.length}</span>}
        </div>
        {sharedLinks.length === 0
          ? <span className={cs.dataFieldEmpty}>Không có</span>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sharedLinks.map((link, idx) => (
                <div key={idx} className={cs.dataLinkRow}>
                  {sharedLinks.length > 1 && <span className={cs.dataLinkIdx}>#{idx + 1}</span>}
                  <a href={link} target="_blank" rel="noopener noreferrer" className={cs.dataLink}>
                    {link}<ExternalLink size={10} style={{ flexShrink: 0 }} />
                  </a>
                  <CopyBtn text={link} />
                </div>
              ))}
            </div>}
      </div>
    </div>
  )
}

export default function CdrQuickView({ requestId, onClose, onUpdated, onManualSubmit }) {
  const addToast = useToastStore((st) => st.toast)
  const isAdmin  = useAuthStore((st) => st.user?.role === 'admin')
  const { data: staffList = [] } = useStaffOptions()

  const [item, setItem]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [descDraft, setDescDraft] = useState('')
  const [descDirty, setDescDirty] = useState(false)
  const [savingDesc, setSavingDesc] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft]     = useState('')
  const [savingTitle, setSavingTitle]   = useState(false)
  const [tab, setTab] = useState('info')   // 'info' | 'data'

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!requestId) return
    setLoading(true); setItem(null); setDescDirty(false)
    cdrApi.getClientRequest(requestId)
      .then((it) => { setItem(it); setDescDraft(it.description ?? '') })
      .catch(() => { addToast('Không thể tải yêu cầu', 'error'); onClose() })
      .finally(() => setLoading(false))
  }, [requestId]) // eslint-disable-line react-hooks/exhaustive-deps

  function apply(updated) { setItem(updated); onUpdated?.(updated) }
  // Cập nhật 1 phần + đẩy ra bảng ngoài (cho cột Tiến độ / Bình luận cập nhật ngay)
  function patchLocal(partial) { setItem((prev) => { const next = prev ? { ...prev, ...partial } : prev; if (next) onUpdated?.(next); return next }) }

  async function changeStatus(next) {
    if (!item || next === item.status) return
    setSaving(true)
    try {
      let updated
      if (next === 'received')      updated = await cdrApi.receiveClientRequest(requestId)
      else if (next === 'not_required') updated = await cdrApi.dismissClientRequest(requestId)
      else                          updated = await cdrApi.unreceiveClientRequest(requestId)
      apply(updated)
      addToast(`Đã chuyển sang "${STATUS_LABEL[next]}"`, 'success')
    } catch (err) { addToast(err.response?.data?.error?.message ?? 'Không thể đổi trạng thái', 'error') }
    finally { setSaving(false) }
  }

  async function changePriority(priority) {
    try { apply(await cdrApi.setPriorityClientRequest(requestId, priority)); addToast(`Mức độ → "${PRIORITY_LABEL[priority]}"`, 'success') }
    catch { addToast('Không thể đổi mức độ', 'error') }
  }

  async function changeStartDate(v) {
    try { apply(await cdrApi.updateClientRequest(requestId, { startDate: v || null })); addToast(v ? 'Đã cập nhật ngày bắt đầu' : 'Đã xoá ngày bắt đầu', 'success') }
    catch (err) { addToast(err.response?.data?.error?.message ?? 'Không thể đổi ngày bắt đầu', 'error') }
  }

  async function changeDeadline(v) {
    try { apply(await cdrApi.updateClientRequest(requestId, { deadlineDate: v || null })); addToast(v ? 'Đã cập nhật hạn nộp' : 'Đã xoá hạn nộp', 'success') }
    catch (err) { addToast(err.response?.data?.error?.message ?? 'Không thể đổi hạn nộp', 'error') }
  }

  async function changePeriod(v) {
    try { apply(await cdrApi.updateClientRequest(requestId, { periodLabel: v.trim() || null })); addToast('Đã cập nhật kỳ', 'success') }
    catch (err) { addToast(err.response?.data?.error?.message ?? 'Không thể đổi kỳ', 'error') }
  }

  async function changeOwner(uid) {
    if (!uid) return
    try { apply(await cdrApi.updateClientRequest(requestId, { requestedBy: uid })); addToast('Đã đổi người phụ trách', 'success') }
    catch (err) { addToast(err.response?.data?.error?.message ?? 'Không thể đổi người phụ trách', 'error') }
  }

  async function saveTitle() {
    const trimmed = titleDraft.trim()
    setEditingTitle(false)
    if (!trimmed || trimmed === item?.documentName) { setTitleDraft(item?.documentName ?? ''); return }
    setSavingTitle(true)
    try { apply(await cdrApi.updateClientRequest(requestId, { documentName: trimmed })); addToast('Đã lưu tiêu đề', 'success') }
    catch (err) { setTitleDraft(item?.documentName ?? ''); addToast(err.response?.data?.error?.message ?? 'Không thể lưu tiêu đề', 'error') }
    finally { setSavingTitle(false) }
  }

  async function changeEmail(v) {
    const val = v.trim()
    if ((val || null) === (item.contactEmail || null)) return
    try { apply(await cdrApi.updateClientRequest(requestId, { contactEmail: val || null })); addToast('Đã cập nhật email KH', 'success') }
    catch (err) { addToast(err.response?.data?.error?.message ?? 'Không thể đổi email (kiểm tra định dạng)', 'error') }
  }

  async function saveDescription() {
    if (!descDirty) return
    setSavingDesc(true)
    try {
      const updated = await cdrApi.updateClientRequest(requestId, { description: descDraft.trim() || null })
      apply(updated); setDescDraft(updated.description ?? ''); setDescDirty(false)
      addToast('Đã lưu mô tả', 'success')
    } catch { addToast('Không thể lưu mô tả', 'error') }
    finally { setSavingDesc(false) }
  }

  async function changeCollaborators(ids) {
    try { apply(await cdrApi.updateClientRequest(requestId, { collaboratorIds: ids.filter((x) => x && x !== item.requestedBy) })) }
    catch { addToast('Không thể cập nhật người hỗ trợ', 'error') }
  }

  const overdue = item?.status === 'overdue'

  return (
    <>
      <div className={s.qvOverlay} onClick={onClose} />
      <div className={s.qvPanel}>

        <div className={s.qvHeader}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {loading
              ? <div style={{ height: 20, width: '55%', background: 'var(--color-surface-muted)', borderRadius: 4 }} />
              : editingTitle ? (
                <input
                  type="text"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setTitleDraft(item.documentName); setEditingTitle(false) } }}
                  className={s.qvTitleInput}
                  disabled={savingTitle}
                  autoFocus
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <h2
                    className={`${s.qvTitle} ${s.qvTitleEditable}`}
                    title="Nhấp đúp để sửa tiêu đề"
                    onDoubleClick={() => { setTitleDraft(item?.documentName ?? ''); setEditingTitle(true) }}
                  >
                    {item?.documentName}
                  </h2>
                  <button className={s.qvTitleEditBtn} title="Sửa tiêu đề" onClick={() => { setTitleDraft(item?.documentName ?? ''); setEditingTitle(true) }}>
                    <Edit2 size={12} />
                  </button>
                </div>
              )}
            {item && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <span className={`${cs.statusBadge} ${STATUS_CLASS[item.status] ?? cs.statusPending}`}>{STATUS_LABEL[item.status] ?? item.status}</span>
                <span className={`${cs.statusBadge} ${PRIORITY_CLASS[item.priority || 'medium']}`}>Mức độ: {PRIORITY_LABEL[item.priority || 'medium']}</span>
                {overdue && <span className={s.overdueTag}><AlertTriangle size={10} /> Quá hạn</span>}
              </div>
            )}
          </div>
          {item && (
            <div className={cs.qvTabs}>
              <button type="button" className={`${cs.qvTab} ${tab === 'info' ? cs.qvTabActive : ''}`} onClick={() => setTab('info')}>
                Thông tin
              </button>
              <button type="button" className={`${cs.qvTab} ${tab === 'data' ? cs.qvTabActive : ''}`} onClick={() => setTab('data')}>
                Dữ liệu KH{item.tokenSubmittedAt ? ' ✓' : ''}
              </button>
            </div>
          )}
          <div className={s.qvHeaderActions}>
            <button className={s.btnIcon} onClick={onClose} title="Đóng (Esc)"><X size={14} /></button>
          </div>
        </div>

        {loading ? (
          <div className={s.loadingBox}><div className={s.spinner} /> Đang tải...</div>
        ) : item ? (
          <div className={s.qvBody}>

            {tab === 'data' ? (
              <SubmittedDataView item={item} onManualSubmit={onManualSubmit} />
            ) : (
            <div className={s.qvGrid}>
              {/* LEFT — thông tin */}
              <div className={s.qvLeft}>
                <div className={s.qvSectionTitle}>Thông tin</div>

                <div className={s.qvRow}>
                  <span className={s.qvLabel}><Building2 size={11} /> Khách hàng</span>
                  <span className={s.qvValue}>{item.companyName || '—'}</span>
                </div>

                <div className={s.qvRow}>
                  <span className={s.qvLabel}><Calendar size={11} /> Kỳ</span>
                  <input
                    type="text"
                    defaultValue={item.periodLabel || ''}
                    key={item.periodLabel || ''}
                    onBlur={(e) => { if ((e.target.value.trim() || null) !== (item.periodLabel || null)) changePeriod(e.target.value) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
                    placeholder="VD: T01/2026"
                    className={`${s.qeSelect} ${s.qvFieldSelect}`}
                  />
                </div>

                <div className={s.qvRow}>
                  <span className={s.qvLabel}><User size={11} /> Người phụ trách</span>
                  {isAdmin ? (
                    <select
                      value={item.requestedBy || ''}
                      onChange={(e) => changeOwner(e.target.value)}
                      className={`${s.qeSelect} ${s.qvFieldSelect}`}
                    >
                      {!item.requestedBy && <option value="">— Chọn —</option>}
                      {staffList.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  ) : (
                    <span className={s.qvValue} title={item.requestedByName || ''}>{item.requestedByName ? shortName(item.requestedByName) : '—'}</span>
                  )}
                </div>

                <div className={s.qvRow}>
                  <span className={s.qvLabel}><Users size={11} /> Hỗ trợ</span>
                  {isAdmin ? (
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <CollaboratorPicker
                        options={staffList}
                        value={(item.collaborators || []).map((c) => c.id)}
                        onChange={changeCollaborators}
                        excludeId={item.requestedBy}
                      />
                    </div>
                  ) : (
                    <span className={s.qvValue}>{(item.collaborators || []).length ? item.collaborators.map((c) => c.name).join(', ') : '—'}</span>
                  )}
                </div>

                <div className={s.qvRow}>
                  <span className={s.qvLabel}><Flag size={11} /> Mức độ</span>
                  <span className={cs.statusSelectWrap}>
                    <select className={`${cs.statusSelect} ${PRIORITY_CLASS[item.priority || 'medium']}`} value={item.priority || 'medium'} onChange={(e) => changePriority(e.target.value)}>
                      <option value="high">Cao</option>
                      <option value="medium">Trung bình</option>
                      <option value="low">Thấp</option>
                    </select>
                    <ChevronDown size={11} className={cs.statusSelectCaret} />
                  </span>
                </div>

                <div className={s.qvRow}>
                  <span className={s.qvLabel}><Calendar size={11} /> Ngày bắt đầu</span>
                  <DateBox
                    value={toDateValue(item.startDate)}
                    onChange={changeStartDate}
                    max={toDateValue(item.deadlineDate) || undefined}
                    className={s.qvDateBox}
                  />
                </div>

                <div className={s.qvRow}>
                  <span className={s.qvLabel}><Clock size={11} /> Hạn nộp</span>
                  <DateBox
                    value={toDateValue(item.deadlineDate)}
                    onChange={changeDeadline}
                    min={toDateValue(item.startDate) || undefined}
                    className={`${s.qvDateBox} ${overdue ? s.dbError : ''}`}
                  />
                </div>

                <div className={s.qvRow}>
                  <span className={s.qvLabel}><Mail size={11} /> Email KH</span>
                  <input
                    type="email"
                    defaultValue={item.contactEmail || ''}
                    key={item.contactEmail || ''}
                    onBlur={(e) => changeEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
                    placeholder="email@khachhang.com"
                    className={`${s.qeSelect} ${s.qvFieldSelect}`}
                  />
                </div>

                <div className={s.qvRow}>
                  <span className={s.qvLabel}><Calendar size={11} /> Ngày tạo</span>
                  <span className={s.qvValue}>{fmtDate(item.createdAt)}</span>
                </div>

                <div className={s.qvRow}>
                  <span className={s.qvLabel}>Trạng thái</span>
                  <span className={cs.statusSelectWrap}>
                    <select className={`${cs.statusSelect} ${STATUS_CLASS[item.status] ?? cs.statusPending}`} value={item.status} onChange={(e) => changeStatus(e.target.value)} disabled={saving}>
                      {item.status === 'overdue' && <option value="overdue" disabled>Quá hạn</option>}
                      <option value="pending">Chờ KH</option>
                      <option value="received">Đã nhận</option>
                      <option value="not_required">Không cần</option>
                    </select>
                    <ChevronDown size={11} className={cs.statusSelectCaret} />
                  </span>
                </div>

                <div className={s.qvRow} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                  <span className={s.qvLabel} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span><FileText size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />Mô tả</span>
                    {descDirty && (
                      <button className={s.btnQvSave} onClick={saveDescription} disabled={savingDesc}>
                        {savingDesc ? <Loader2 size={11} className={s.spinIcon} /> : <Check size={11} />} Lưu
                      </button>
                    )}
                  </span>
                  <textarea
                    value={descDraft}
                    onChange={(e) => { setDescDraft(e.target.value); setDescDirty(e.target.value !== (item.description ?? '')) }}
                    onBlur={saveDescription}
                    className={s.qvDescTextarea}
                    placeholder="Nhập mô tả yêu cầu..."
                  />
                </div>
              </div>

              {/* RIGHT — checklist + dữ liệu KH + bình luận */}
              <div className={s.qvRight}>
                <div className={s.qvSection}>
                  <div className={s.qvSectionTitle}>Giấy tờ cần thu (checklist)</div>
                  <CdrChecklist
                    requestId={requestId}
                    onProgress={({ total, done }) => patchLocal({ checklistTotal: total, checklistDone: done })}
                  />
                </div>

                <div className={s.qvSection} style={{ borderBottom: 'none', marginBottom: 0 }}>
                  <div className={s.qvSectionTitle}>Bình luận</div>
                  <CdrComments
                    requestId={requestId}
                    onChange={({ count, latest }) => patchLocal({ commentCount: count, latestComment: latest })}
                  />
                </div>
              </div>
            </div>
            )}

          </div>
        ) : null}
      </div>
    </>
  )
}
