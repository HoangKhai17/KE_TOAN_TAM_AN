import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Loader2, Plus, Check, Pencil, Trash2, ListChecks, ClipboardList, Users, Wallet } from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import Modal from '../../components/ui/Modal'
import PaginationFooter from '../../components/layout/PaginationFooter'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { useEnumsStore } from '../../hooks/useEnums'
import { useDeleteConfirm } from '../../components/ui/DeleteConfirmDialog'
import { listUserOptions } from '../../api/users'
import { applyRewardPenalty as pullToPayroll } from '../../api/payroll'
import * as api from '../../api/rewardPenalty'
import s from './rewardPenalty.module.css'

const CUR_Y = new Date().getFullYear()
const CUR_M = new Date().getMonth() + 1
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)   // tháng là phổ quát, không phải danh mục

const fmtMoney = (n) => (n == null || n === 0) ? '—' : `${n > 0 ? '+' : '−'}${Math.abs(Number(n)).toLocaleString('vi-VN')}₫`
const fmtPts = (n) => (n == null) ? '—' : (n > 0 ? `+${n}` : `${n}`)
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : '—'
const signCls = (n) => n > 0 ? s.pos : n < 0 ? s.neg : s.zero
const KIND_PILL = { reward: s.pillReward, violation: s.pillPenalty }
const STATUS_PILL = { approved: s.pillApproved, draft: s.pillDraft }

// Phân trang phía client (dữ liệu trả về là mảng đầy đủ).
function paginate(list, page, pageSize) {
  const total = list.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize
  return {
    total, totalPages, safePage, start,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(total, safePage * pageSize),
    slice: list.slice(start, start + pageSize),
  }
}

export default function RewardPenalty() {
  const isAdmin = useAuthStore((st) => st.user?.role === 'admin')
  const loadEnums = useEnumsStore((st) => st.load)
  const getOptions = useEnumsStore((st) => st.getOptions)
  useEffect(() => { loadEnums() }, [loadEnums])
  const enumLabel = useCallback((type, key) => (getOptions(type).find((x) => x.key === key)?.label ?? key), [getOptions])
  const [tab, setTab] = useState('ledger')
  const [createSignal, setCreateSignal] = useState(0)
  const [pullSignal, setPullSignal] = useState(0)
  // Footer phân trang là footer CỦA TRANG (ghim đáy) — panel đang mở đẩy footer của nó lên đây.
  const [footer, setFooter] = useState(null)
  // Năm lấy ĐỘNG từ DB (năm có dữ liệu + năm hiện tại), không hardcode.
  const [years, setYears] = useState([CUR_Y])
  useEffect(() => { api.listYears().then((ys) => setYears(ys.length ? ys : [CUR_Y])).catch(() => {}) }, [])

  const cls = (t) => `${s.tab} ${tab === t ? s.tabActive : ''}`
  const action = {
    rules:   { label: 'Thêm quy tắc', icon: <Plus size={14} />, onClick: () => setCreateSignal((n) => n + 1) },
    ledger:  { label: 'Ghi nhận',     icon: <Plus size={14} />, onClick: () => setCreateSignal((n) => n + 1) },
    summary: { label: 'Kéo vào Bảng lương', icon: <Wallet size={14} />, onClick: () => setPullSignal((n) => n + 1) },
  }[tab]

  return (
    <AppLayout footer={footer}>
      <div className={s.page}>
        {isAdmin ? (
          <>
            <div className={s.tabs}>
              <div className={s.tabLinks} role="tablist">
                <button className={cls('ledger')} onClick={() => setTab('ledger')}><ClipboardList size={13} /> Sổ thưởng/phạt</button>
                <button className={cls('summary')} onClick={() => setTab('summary')}><Users size={13} /> Tổng hợp theo NV</button>
                <button className={cls('rules')} onClick={() => setTab('rules')}><ListChecks size={13} /> Quy tắc</button>
              </div>
              <div className={s.tabActions}>
                <button className={s.btnPrimary} onClick={action.onClick}>{action.icon} {action.label}</button>
              </div>
            </div>
            {tab === 'rules' && <RulesPanel createSignal={createSignal} getOptions={getOptions} enumLabel={enumLabel} onFooter={setFooter} />}
            {tab === 'ledger' && <LedgerPanel isAdmin createSignal={createSignal} years={years} getOptions={getOptions} enumLabel={enumLabel} onFooter={setFooter} />}
            {tab === 'summary' && <SummaryPanel pullSignal={pullSignal} years={years} onFooter={setFooter} />}
          </>
        ) : (
          <LedgerPanel isAdmin={false} years={years} getOptions={getOptions} enumLabel={enumLabel} onFooter={setFooter} />
        )}
      </div>
    </AppLayout>
  )
}

// ══ QUY TẮC ══════════════════════════════════════════════════════════════════
function RulesPanel({ createSignal, getOptions, enumLabel, onFooter }) {
  const addToast = useToastStore((st) => st.toast)
  const confirmDelete = useDeleteConfirm()
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [sel, setSel] = useState(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const allChecked = rules.length > 0 && sel.size === rules.length
  const toggleAll = () => setSel(allChecked ? new Set() : new Set(rules.map((r) => r.id)))
  const toggle = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const reload = useCallback(() => { setLoading(true); setSel(new Set()); setPage(1); api.listRules().then(setRules).catch(() => setRules([])).finally(() => setLoading(false)) }, [])
  const pg = paginate(rules, page, pageSize)
  useEffect(() => {
    onFooter(<PaginationFooter total={pg.total} from={pg.from} to={pg.to} itemLabel="quy tắc"
      page={pg.safePage} pageSize={pageSize} totalPages={pg.totalPages} loading={loading}
      onPageChange={setPage} onPageSizeChange={(sz) => { setPageSize(sz); setPage(1) }} />)
    return () => onFooter(null)
  }, [onFooter, pg.total, pg.from, pg.to, pg.safePage, pg.totalPages, pageSize, loading])
  useEffect(() => { reload() }, [reload])
  // Nút "Thêm quy tắc" nằm trên thanh tab (parent) → tăng signal để mở modal.
  // So sánh giá trị signal (không dùng cờ "lần đầu") để không bị bật nhầm khi mount/StrictMode.
  const lastSig = useRef(createSignal)
  useEffect(() => { if (lastSig.current === createSignal) return; lastSig.current = createSignal; setModal({}) }, [createSignal])

  async function remove(r) {
    if (!(await confirmDelete({ title: 'Xoá quy tắc', message: <>Xoá quy tắc <strong>“{r.label}”</strong>?</> }))) return
    try { await api.deleteRule(r.id); addToast('Đã xoá', 'success'); reload() } catch (e) { addToast(e.response?.data?.error?.message ?? 'Lỗi', 'error') }
  }

  return (
    <div className={s.card}>
      {loading ? <div className={s.loading}><Loader2 size={14} className={s.spin} /> Đang tải…</div> : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr>
              <th className={s.colChk}><input type="checkbox" className={s.check} checked={allChecked} onChange={toggleAll} title="Chọn tất cả" /></th>
              <th className={s.colStt}>STT</th>
              <th>Mã</th><th>Danh mục</th><th>Loại</th><th className={s.num}>Điểm</th><th className={s.num}>Tiền gợi ý</th>
              <th>Nguồn phát hiện</th><th>Trạng thái</th><th>Hành động</th>
            </tr></thead>
            <tbody>
              {rules.length === 0 && <tr><td colSpan={10} className={s.empty}>Chưa có quy tắc. Bấm “Thêm quy tắc”.</td></tr>}
              {pg.slice.map((r, i) => (
                <tr key={r.id}>
                  <td className={s.colChk}><input type="checkbox" className={s.check} checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></td>
                  <td className={s.colStt}>{pg.start + i + 1}</td>
                  <td className={s.code}>{r.code || '—'}</td>
                  <td>{r.label}</td>
                  <td><span className={`${s.pill} ${KIND_PILL[r.kind]}`}>{enumLabel('reward_penalty_kind', r.kind)}</span></td>
                  <td className={`${s.num} ${signCls(r.defaultPoints)}`}>{fmtPts(r.defaultPoints)}</td>
                  <td className={`${s.num} ${signCls(r.defaultAmount ?? 0)}`}>{fmtMoney(r.defaultAmount)}</td>
                  <td className={s.note}>{enumLabel('reward_penalty_detect', r.detectSource)}</td>
                  <td>{r.isActive ? <span className={`${s.pill} ${s.pillApproved}`}>Đang bật</span> : <span className={`${s.pill} ${s.pillOff}`}>Tắt</span>}</td>
                  <td className={s.num}>
                    <span className={s.rowActions}>
                      <button className={s.iconBtn} title="Sửa" onClick={() => setModal(r)}><Pencil size={13} /></button>
                      <button className={`${s.iconBtn} ${s.iconBtnDanger}`} title="Xoá" onClick={() => remove(r)}><Trash2 size={13} /></button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && <RuleModal rule={modal.id ? modal : null} getOptions={getOptions} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload() }} />}
    </div>
  )
}

function RuleModal({ rule, getOptions, onClose, onSaved }) {
  const addToast = useToastStore((st) => st.toast)
  const kinds = getOptions('reward_penalty_kind')
  const detects = getOptions('reward_penalty_detect')
  const [f, setF] = useState({
    code: rule?.code ?? '', label: rule?.label ?? '', kind: rule?.kind ?? kinds[0]?.key ?? '',
    defaultPoints: rule?.defaultPoints ?? 0, defaultAmount: rule?.defaultAmount ?? '',
    detectSource: rule?.detectSource ?? detects[0]?.key ?? '', isActive: rule?.isActive ?? true,
  })
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))

  async function save() {
    if (!f.label.trim()) { addToast('Nhập tên danh mục', 'error'); return }
    setSaving(true)
    const body = {
      code: f.code.trim() || null, label: f.label.trim(), kind: f.kind,
      defaultPoints: Number(f.defaultPoints) || 0, defaultAmount: f.defaultAmount === '' ? null : Number(f.defaultAmount),
      detectSource: f.detectSource, isActive: !!f.isActive,
    }
    try { rule ? await api.updateRule(rule.id, body) : await api.createRule(body); onSaved() }
    catch (e) { addToast(e.response?.data?.error?.message ?? 'Lỗi khi lưu', 'error'); setSaving(false) }
  }

  return (
    <Modal title={rule ? 'Sửa quy tắc' : 'Thêm quy tắc'} onClose={onClose} width="min(680px, calc(100vw - 40px))">
      <div className={s.form}>
        <div><label className={s.fLbl}>Mã (tùy chọn)</label><input className={s.input} value={f.code} onChange={set('code')} placeholder="VD: KP-CC" /></div>
        <div><label className={s.fLbl}>Loại</label><select className={s.input} value={f.kind} onChange={set('kind')}>{kinds.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></div>
        <div className={s.fFull}><label className={s.fLbl}>Tên danh mục <span className={s.fReq}>*</span></label><input className={s.input} value={f.label} onChange={set('label')} autoFocus placeholder="VD: Không chấm công" /></div>
        <div><label className={s.fLbl}>Điểm mặc định (âm = phạt)</label><input className={s.input} type="number" value={f.defaultPoints} onChange={set('defaultPoints')} /></div>
        <div><label className={s.fLbl}>Tiền gợi ý (₫, âm = phạt)</label><input className={s.input} type="number" value={f.defaultAmount} onChange={set('defaultAmount')} placeholder="tùy chọn" /></div>
        <div><label className={s.fLbl}>Nguồn phát hiện</label><select className={s.input} value={f.detectSource} onChange={set('detectSource')}>{detects.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></div>
        <div><label className={s.fLbl}>Trạng thái</label><select className={s.input} value={f.isActive ? '1' : '0'} onChange={(e) => setF((p) => ({ ...p, isActive: e.target.value === '1' }))}><option value="1">Đang bật</option><option value="0">Tắt</option></select></div>
        <div className={s.formFoot}>
          <button className={s.btnSecondary} onClick={onClose} disabled={saving}>Huỷ</button>
          <button className={s.btnPrimary} onClick={save} disabled={saving}>{saving && <Loader2 size={13} className={s.spin} />} Lưu</button>
        </div>
      </div>
    </Modal>
  )
}

// ══ SỔ GHI ═══════════════════════════════════════════════════════════════════
function LedgerPanel({ isAdmin, createSignal, years, getOptions, enumLabel, onFooter }) {
  const addToast = useToastStore((st) => st.toast)
  const confirmDelete = useDeleteConfirm()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [modal, setModal] = useState(null)
  const [flt, setFlt] = useState({ year: CUR_Y, month: CUR_M, userId: '', kind: '', status: '' })
  const [sel, setSel] = useState(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const allChecked = entries.length > 0 && sel.size === entries.length
  const toggleAll = () => setSel(allChecked ? new Set() : new Set(entries.map((e) => e.id)))
  const toggle = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const pg = paginate(entries, page, pageSize)
  useEffect(() => {
    onFooter(<PaginationFooter total={pg.total} from={pg.from} to={pg.to} itemLabel="dòng"
      page={pg.safePage} pageSize={pageSize} totalPages={pg.totalPages} loading={loading}
      onPageChange={setPage} onPageSizeChange={(sz) => { setPageSize(sz); setPage(1) }} />)
    return () => onFooter(null)
  }, [onFooter, pg.total, pg.from, pg.to, pg.safePage, pg.totalPages, pageSize, loading])

  useEffect(() => { if (isAdmin) listUserOptions({ status: 'active' }).then(({ users: u }) => setUsers(u)).catch(() => {}) }, [isAdmin])
  // Nút "Ghi nhận" nằm trên thanh tab (parent) → tăng signal để mở modal.
  const lastSig = useRef(createSignal)
  useEffect(() => { if (lastSig.current === createSignal) return; lastSig.current = createSignal; setModal({}) }, [createSignal])
  const reload = useCallback(() => {
    setLoading(true); setSel(new Set()); setPage(1)
    const params = { year: flt.year, month: flt.month }
    if (isAdmin) { if (flt.userId) params.userId = flt.userId; if (flt.kind) params.kind = flt.kind; if (flt.status) params.status = flt.status }
    api.listEntries(params).then(setEntries).catch(() => setEntries([])).finally(() => setLoading(false))
  }, [flt, isAdmin])
  useEffect(() => { reload() }, [reload])

  async function approve(e) { try { await api.approveEntry(e.id); addToast('Đã duyệt', 'success'); reload() } catch (er) { addToast(er.response?.data?.error?.message ?? 'Lỗi', 'error') } }
  async function remove(e) { if (!(await confirmDelete({ title: 'Xoá bản ghi', message: <>Xoá dòng <strong>“{e.categoryLabel}”</strong>?</> }))) return; try { await api.deleteEntry(e.id); addToast('Đã xoá', 'success'); reload() } catch (er) { addToast(er.response?.data?.error?.message ?? 'Lỗi', 'error') } }

  return (
    <div className={s.stack}>
      <div className={s.card}>
        <div className={s.filters}>
          <div className={s.fld}><label className={s.lbl}>Năm</label><select className={s.select} value={flt.year} onChange={(e) => setFlt((p) => ({ ...p, year: Number(e.target.value) }))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></div>
          <div className={s.fld}><label className={s.lbl}>Tháng</label><select className={s.select} value={flt.month} onChange={(e) => setFlt((p) => ({ ...p, month: Number(e.target.value) }))}>{MONTHS.map((m) => <option key={m} value={m}>Tháng {m}</option>)}</select></div>
          {isAdmin && <>
            <div className={s.fld}><label className={s.lbl}>Nhân viên</label><select className={s.select} value={flt.userId} onChange={(e) => setFlt((p) => ({ ...p, userId: e.target.value }))}><option value="">Tất cả</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
            <div className={s.fld}><label className={s.lbl}>Loại</label><select className={s.select} value={flt.kind} onChange={(e) => setFlt((p) => ({ ...p, kind: e.target.value }))}><option value="">Tất cả</option>{getOptions('reward_penalty_kind').map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></div>
            <div className={s.fld}><label className={s.lbl}>Trạng thái</label><select className={s.select} value={flt.status} onChange={(e) => setFlt((p) => ({ ...p, status: e.target.value }))}><option value="">Tất cả</option>{getOptions('reward_penalty_status').map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></div>
          </>}
        </div>
        {loading ? <div className={s.loading}><Loader2 size={14} className={s.spin} /> Đang tải…</div> : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr>
                <th className={s.colChk}><input type="checkbox" className={s.check} checked={allChecked} onChange={toggleAll} title="Chọn tất cả" /></th>
                <th className={s.colStt}>STT</th>
                {isAdmin && <th>Nhân viên</th>}
                <th>Ngày</th><th>Loại</th><th>Danh mục</th><th className={s.num}>Điểm</th><th className={s.num}>Tiền</th>
                <th>Nguồn</th><th>Trạng thái</th><th>Ghi chú</th>{isAdmin && <th>Hành động</th>}
              </tr></thead>
              <tbody>
                {entries.length === 0 && <tr><td colSpan={isAdmin ? 12 : 10} className={s.empty}>Không có dòng nào trong kỳ.</td></tr>}
                {pg.slice.map((e, i) => (
                  <tr key={e.id}>
                    <td className={s.colChk}><input type="checkbox" className={s.check} checked={sel.has(e.id)} onChange={() => toggle(e.id)} /></td>
                    <td className={s.colStt}>{pg.start + i + 1}</td>
                    {isAdmin && <td>{e.userName}</td>}
                    <td className={s.num} style={{ textAlign: 'left' }}>{fmtDate(e.occurredOn)}</td>
                    <td><span className={`${s.pill} ${KIND_PILL[e.kind]}`}>{enumLabel('reward_penalty_kind', e.kind)}</span></td>
                    <td>{e.categoryLabel}</td>
                    <td className={`${s.num} ${signCls(e.points)}`}>{fmtPts(e.points)}</td>
                    <td className={`${s.num} ${signCls(e.amount ?? 0)}`}>{fmtMoney(e.amount)}</td>
                    <td className={s.note}>{enumLabel('reward_penalty_source', e.source)}</td>
                    <td><span className={`${s.pill} ${STATUS_PILL[e.status] ?? s.pillDraft}`}>{enumLabel('reward_penalty_status', e.status)}</span></td>
                    <td className={s.note}>{e.note || '—'}</td>
                    {isAdmin && <td className={s.num}>
                      <span className={s.rowActions}>
                        {e.status === 'draft' && <button className={`${s.btnMini} ${s.btnMiniPrimary}`} onClick={() => approve(e)}><Check size={13} /> Duyệt</button>}
                        <button className={s.iconBtn} title="Sửa" onClick={() => setModal(e)}><Pencil size={13} /></button>
                        <button className={`${s.iconBtn} ${s.iconBtnDanger}`} title="Xoá" onClick={() => remove(e)}><Trash2 size={13} /></button>
                      </span>
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {modal && <EntryModal entry={modal.id ? modal : null} users={users} getOptions={getOptions} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload() }} />}
    </div>
  )
}

function EntryModal({ entry, users, getOptions, onClose, onSaved }) {
  const addToast = useToastStore((st) => st.toast)
  const statuses = getOptions('reward_penalty_status')
  const [rules, setRules] = useState([])
  useEffect(() => { api.listRules({ activeOnly: 'true' }).then(setRules).catch(() => {}) }, [])
  const [f, setF] = useState({
    userId: entry?.userId ?? (users[0]?.id ?? ''), occurredOn: entry?.occurredOn?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    ruleId: entry?.ruleId ?? '', kind: entry?.kind ?? getOptions('reward_penalty_kind')[0]?.key ?? '', categoryLabel: entry?.categoryLabel ?? '',
    points: entry?.points ?? 0, amount: entry?.amount ?? '', note: entry?.note ?? '',
    status: entry?.status ?? (statuses.find((o) => o.key === 'approved') ? 'approved' : (statuses[0]?.key ?? '')),
  })
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))
  function pickRule(id) {
    const r = rules.find((x) => x.id === id)
    if (!r) { setF((p) => ({ ...p, ruleId: '' })); return }
    setF((p) => ({ ...p, ruleId: id, kind: r.kind, categoryLabel: r.label, points: r.defaultPoints, amount: r.defaultAmount ?? '' }))
  }
  const pickedRule = rules.find((x) => x.id === f.ruleId)

  async function save() {
    if (!f.userId) { addToast('Chọn nhân viên', 'error'); return }
    if (!f.categoryLabel.trim() && !f.ruleId) { addToast('Chọn quy tắc hoặc nhập danh mục', 'error'); return }
    setSaving(true)
    const body = {
      userId: f.userId, occurredOn: f.occurredOn, ruleId: f.ruleId || null, kind: f.kind,
      categoryLabel: f.categoryLabel.trim() || undefined, points: Number(f.points) || 0,
      amount: f.amount === '' ? null : Number(f.amount), note: f.note.trim() || null, status: f.status,
    }
    try {
      if (entry) await api.updateEntry(entry.id, { occurredOn: body.occurredOn, kind: body.kind, categoryLabel: body.categoryLabel, points: body.points, amount: body.amount, note: body.note, status: body.status, userId: body.userId })
      else await api.createEntry(body)
      onSaved()
    } catch (e) { addToast(e.response?.data?.error?.message ?? 'Lỗi khi lưu', 'error'); setSaving(false) }
  }

  return (
    <Modal title={entry ? 'Sửa ghi nhận' : 'Ghi nhận thưởng / phạt'} onClose={onClose} width="min(760px, calc(100vw - 40px))">
      <div className={s.form}>
        <div><label className={s.fLbl}>Nhân viên <span className={s.fReq}>*</span></label><select className={s.input} value={f.userId} onChange={set('userId')}><option value="">— chọn —</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
        <div><label className={s.fLbl}>Ngày xảy ra <span className={s.fReq}>*</span></label><input className={s.input} type="date" value={f.occurredOn} onChange={set('occurredOn')} /></div>
        {!entry && (
          <div className={s.fFull}>
            <label className={s.fLbl}>Quy tắc (chọn → tự điền điểm/tiền, sửa được)</label>
            <select className={s.input} value={f.ruleId} onChange={(e) => pickRule(e.target.value)}>
              <option value="">— Không dùng quy tắc (nhập tay) —</option>
              {rules.map((r) => <option key={r.id} value={r.id}>{r.code ? `${r.code} · ` : ''}{r.label} ({getOptions('reward_penalty_kind').find((o) => o.key === r.kind)?.label ?? r.kind})</option>)}
            </select>
            {pickedRule && <span className={s.autofill}>↳ mặc định {fmtPts(pickedRule.defaultPoints)} điểm{pickedRule.defaultAmount != null ? ` · ${fmtMoney(pickedRule.defaultAmount)}` : ''} (sửa được bên dưới)</span>}
          </div>
        )}
        <div><label className={s.fLbl}>Loại</label><select className={s.input} value={f.kind} onChange={set('kind')}>{getOptions('reward_penalty_kind').map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></div>
        <div><label className={s.fLbl}>Danh mục / nhãn <span className={s.fReq}>*</span></label><input className={s.input} value={f.categoryLabel} onChange={set('categoryLabel')} placeholder="VD: Đi trễ họp KH" /></div>
        <div><label className={s.fLbl}>Điểm (âm = phạt)</label><input className={s.input} type="number" value={f.points} onChange={set('points')} /></div>
        <div><label className={s.fLbl}>Số tiền (₫, âm = phạt)</label><input className={s.input} type="number" value={f.amount} onChange={set('amount')} placeholder="tùy chọn" /></div>
        <div className={s.fFull}><label className={s.fLbl}>Ghi chú / bằng chứng</label><input className={s.input} value={f.note} onChange={set('note')} placeholder="Mô tả, kể cả vi phạm ngoài hệ thống" /></div>
        <div><label className={s.fLbl}>Trạng thái</label><select className={s.input} value={f.status} onChange={set('status')}>{statuses.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></div>
        <div className={s.formFoot}>
          <button className={s.btnSecondary} onClick={onClose} disabled={saving}>Huỷ</button>
          <button className={s.btnPrimary} onClick={save} disabled={saving}>{saving && <Loader2 size={13} className={s.spin} />} Lưu</button>
        </div>
      </div>
    </Modal>
  )
}

// ══ TỔNG HỢP ═════════════════════════════════════════════════════════════════
function SummaryPanel({ pullSignal, years, onFooter }) {
  const addToast = useToastStore((st) => st.toast)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [pulling, setPulling] = useState(false)
  const [ym, setYm] = useState({ year: CUR_Y, month: CUR_M })
  const [sel, setSel] = useState(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const allChecked = rows.length > 0 && sel.size === rows.length
  const toggleAll = () => setSel(allChecked ? new Set() : new Set(rows.map((r) => r.userId)))
  const toggle = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const pg = paginate(rows, page, pageSize)
  useEffect(() => { setLoading(true); setSel(new Set()); setPage(1); api.getSummary(ym.year, ym.month).then(setRows).catch(() => setRows([])).finally(() => setLoading(false)) }, [ym])
  useEffect(() => {
    onFooter(<PaginationFooter total={pg.total} from={pg.from} to={pg.to} itemLabel="nhân viên"
      page={pg.safePage} pageSize={pageSize} totalPages={pg.totalPages} loading={loading}
      onPageChange={setPage} onPageSizeChange={(sz) => { setPageSize(sz); setPage(1) }} />)
    return () => onFooter(null)
  }, [onFooter, pg.total, pg.from, pg.to, pg.safePage, pg.totalPages, pageSize, loading])
  const tot = useMemo(() => rows.reduce((a, r) => ({ rp: a.rp + r.rewardPoints, pp: a.pp + r.penaltyPoints, np: a.np + r.netPoints, ra: a.ra + r.rewardAmount, pa: a.pa + r.penaltyAmount, na: a.na + r.netAmount }), { rp: 0, pp: 0, np: 0, ra: 0, pa: 0, na: 0 }), [rows])

  const pull = useCallback(async () => {
    if (rows.length === 0) { addToast('Kỳ này chưa có dòng đã duyệt để kéo.', 'info'); return }
    setPulling(true)
    try {
      const r = await pullToPayroll(ym.year, ym.month)
      addToast(`Đã kéo ${r.applied} nhân viên vào Bảng lương T${ym.month}/${ym.year}.`, 'success')
      if (r.missing?.length) addToast(`${r.missing.length} NV có thưởng/phạt nhưng CHƯA có dòng lương (bỏ qua): ${r.missing.join(', ')}`, 'warning')
    } catch (e) { addToast(e.response?.data?.error?.message ?? 'Lỗi khi kéo vào bảng lương', 'error') }
    finally { setPulling(false) }
  }, [rows.length, ym, addToast])
  // Nút "Kéo vào Bảng lương" nằm trên thanh tab (parent) → tăng signal để kích hoạt.
  const lastSig = useRef(pullSignal)
  useEffect(() => { if (lastSig.current === pullSignal) return; lastSig.current = pullSignal; pull() }, [pullSignal]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={s.card}>
      <div className={s.filters}>
        <div className={s.fld}><label className={s.lbl}>Năm</label><select className={s.select} value={ym.year} onChange={(e) => setYm((p) => ({ ...p, year: Number(e.target.value) }))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></div>
        <div className={s.fld}><label className={s.lbl}>Tháng</label><select className={s.select} value={ym.month} onChange={(e) => setYm((p) => ({ ...p, month: Number(e.target.value) }))}>{MONTHS.map((m) => <option key={m} value={m}>Tháng {m}</option>)}</select></div>
        {pulling && <span className={s.lbl}><Loader2 size={13} className={s.spin} /> đang kéo…</span>}
      </div>
      {loading ? <div className={s.loading}><Loader2 size={14} className={s.spin} /> Đang tải…</div> : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr>
              <th className={s.colChk}><input type="checkbox" className={s.check} checked={allChecked} onChange={toggleAll} title="Chọn tất cả" /></th>
              <th className={s.colStt}>STT</th>
              <th>Nhân viên</th>
              <th className={s.num}>Điểm thưởng</th><th className={s.num}>Điểm phạt</th><th className={s.num}>Điểm ròng</th>
              <th className={s.num}>Tiền thưởng</th><th className={s.num}>Tiền phạt</th><th className={s.num}>Ròng (₫)</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={9} className={s.empty}>Chưa có dữ liệu đã duyệt trong kỳ.</td></tr>}
              {pg.slice.map((r, i) => (
                <tr key={r.userId}>
                  <td className={s.colChk}><input type="checkbox" className={s.check} checked={sel.has(r.userId)} onChange={() => toggle(r.userId)} /></td>
                  <td className={s.colStt}>{pg.start + i + 1}</td>
                  <td>{r.userName}</td>
                  <td className={`${s.num} ${signCls(r.rewardPoints)}`}>{fmtPts(r.rewardPoints)}</td>
                  <td className={`${s.num} ${signCls(r.penaltyPoints)}`}>{fmtPts(r.penaltyPoints)}</td>
                  <td className={`${s.num} ${signCls(r.netPoints)}`}>{fmtPts(r.netPoints)}</td>
                  <td className={`${s.num} ${signCls(r.rewardAmount)}`}>{fmtMoney(r.rewardAmount)}</td>
                  <td className={`${s.num} ${signCls(r.penaltyAmount)}`}>{fmtMoney(r.penaltyAmount)}</td>
                  <td className={`${s.num} ${signCls(r.netAmount)}`}>{fmtMoney(r.netAmount)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && <tfoot><tr>
              <td className={s.colChk} /><td className={s.colStt} />
              <td>Cộng kỳ</td>
              <td className={`${s.num} ${signCls(tot.rp)}`}>{fmtPts(tot.rp)}</td>
              <td className={`${s.num} ${signCls(tot.pp)}`}>{fmtPts(tot.pp)}</td>
              <td className={`${s.num} ${signCls(tot.np)}`}>{fmtPts(tot.np)}</td>
              <td className={`${s.num} ${signCls(tot.ra)}`}>{fmtMoney(tot.ra)}</td>
              <td className={`${s.num} ${signCls(tot.pa)}`}>{fmtMoney(tot.pa)}</td>
              <td className={`${s.num} ${signCls(tot.na)}`}>{fmtMoney(tot.na)}</td>
            </tr></tfoot>}
          </table>
        </div>
      )}
      <div className={s.cardFoot}>🔗 <strong>Nối payroll (GĐ2):</strong> nút “Kéo vào Bảng lương” sẽ đọc <strong>Ròng (₫)</strong> theo tháng → cộng vào bảng lương. Điểm ròng dùng cho KPI.</div>
    </div>
  )
}
