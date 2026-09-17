import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Loader2, Plus, Check, X, Trash2, ListChecks, ClipboardList, Users, Wallet } from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import PaginationFooter from '../../components/layout/PaginationFooter'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { useEnumsStore } from '../../hooks/useEnums'
import { useDeleteConfirm } from '../../components/ui/DeleteConfirmDialog'
import { listUserOptions } from '../../api/users'
import { applyRewardPenalty as pullToPayroll } from '../../api/payroll'
import * as api from '../../api/rewardPenalty'
import { useColFilter, FilterTh, ColFilterPortal } from './useColFilter'
import s from './rewardPenalty.module.css'

const CUR_Y = new Date().getFullYear()
const CUR_M = new Date().getMonth() + 1
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)   // tháng là phổ quát, không phải danh mục
const TODAY = () => new Date().toISOString().slice(0, 10)

const fmtMoney = (n) => (n == null || n === 0) ? '—' : `${n > 0 ? '+' : '−'}${Math.abs(Number(n)).toLocaleString('vi-VN')}₫`
const fmtPts = (n) => (n == null) ? '—' : (n > 0 ? `+${n}` : `${n}`)
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : '—'
const signCls = (n) => n > 0 ? s.pos : n < 0 ? s.neg : s.zero
const KIND_PILL = { reward: s.pillReward, violation: s.pillPenalty }
const STATUS_PILL = { approved: s.pillApproved, draft: s.pillDraft }
const kindSelCls = (k) => k === 'reward' ? s.selReward : s.selPenalty
const statusSelCls = (k) => k === 'approved' ? s.selApproved : s.selDraft

// Phân trang phía client (dữ liệu trả về là mảng đầy đủ).
function paginate(list, page, pageSize) {
  const total = list.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize
  return { total, totalPages, safePage, start, from: total === 0 ? 0 : start + 1, to: Math.min(total, safePage * pageSize), slice: list.slice(start, start + pageSize) }
}

// ── Ô nhập thẳng trong bảng (commit khi blur / Enter) ──────────────────────────
function CellText({ value, onCommit, numeric, placeholder, disabled }) {
  const [v, setV] = useState(value ?? '')
  useEffect(() => { setV(value ?? '') }, [value])
  const commit = () => { if (String(v) !== String(value ?? '')) onCommit(v) }
  return (
    <input
      className={`${s.cellInput} ${numeric ? s.cellInputNum : ''}`}
      type={numeric ? 'number' : 'text'} value={v} placeholder={placeholder} disabled={disabled}
      onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setV(value ?? ''); e.currentTarget.blur() } }}
    />
  )
}
function CellDate({ value, onCommit, disabled }) {
  return <input type="date" className={s.cellInput} value={value ? String(value).slice(0, 10) : ''} disabled={disabled}
    onChange={(e) => onCommit(e.target.value)} />
}
function EnumSelect({ value, options, onCommit, cls, title, disabled }) {
  return (
    <select className={`${s.qeSelect} ${cls || ''}`} value={value} disabled={disabled} title={title}
      onChange={(e) => onCommit(e.target.value)}>
      {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
    </select>
  )
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

// ══ QUY TẮC — bảng nhập thẳng ═════════════════════════════════════════════════
function RulesPanel({ createSignal, getOptions, enumLabel, onFooter }) {
  const addToast = useToastStore((st) => st.toast)
  const confirmDelete = useDeleteConfirm()
  const kinds = getOptions('reward_penalty_kind')
  const detects = getOptions('reward_penalty_detect')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState(null)     // dòng thêm mới (chưa lưu)
  const [savingNew, setSavingNew] = useState(false)
  const [sel, setSel] = useState(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const cols = useMemo(() => [
    { key: 'label',  label: 'Tên quy tắc',    type: 'text',        getLabel: (r) => r.label },
    { key: 'kind',   label: 'Loại',           type: 'enum',        getLabel: (r) => enumLabel('reward_penalty_kind', r.kind) },
    { key: 'points', label: 'Điểm',           type: 'numberRange', num: true, getNumber: (r) => Number(r.defaultPoints), getLabel: (r) => String(r.defaultPoints) },
    { key: 'detect', label: 'Nguồn phát hiện', type: 'enum',       getLabel: (r) => enumLabel('reward_penalty_detect', r.detectSource) },
    { key: 'active', label: 'Trạng thái',     type: 'enum',        getLabel: (r) => (r.isActive ? 'Đang bật' : 'Tắt') },
  ], [enumLabel])
  const cf = useColFilter(cols)
  const view = cf.apply(rows)
  const pg = paginate(view, page, pageSize)
  useEffect(() => { setPage(1) }, [cf.depKey])

  const allChecked = rows.length > 0 && sel.size === rows.length
  const toggleAll = () => setSel(allChecked ? new Set() : new Set(rows.map((r) => r.id)))
  const toggle = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  const reload = useCallback(() => { setLoading(true); setSel(new Set()); api.listRules().then(setRows).catch(() => setRows([])).finally(() => setLoading(false)) }, [])
  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    onFooter(<PaginationFooter total={pg.total} from={pg.from} to={pg.to} itemLabel="quy tắc"
      page={pg.safePage} pageSize={pageSize} totalPages={pg.totalPages} loading={loading}
      onPageChange={setPage} onPageSizeChange={(sz) => { setPageSize(sz); setPage(1) }} />)
    return () => onFooter(null)
  }, [onFooter, pg.total, pg.from, pg.to, pg.safePage, pg.totalPages, pageSize, loading])

  // Nút "Thêm quy tắc" trên thanh tab → mở 1 dòng nhập thẳng ở đầu bảng.
  const lastSig = useRef(createSignal)
  useEffect(() => {
    if (lastSig.current === createSignal) return; lastSig.current = createSignal
    setDraft({ label: '', kind: kinds[0]?.key ?? 'violation', defaultPoints: 0, detectSource: detects[0]?.key ?? 'manual', isActive: true })
  }, [createSignal, kinds, detects])

  async function patchRule(r, patch) {
    setRows((list) => list.map((x) => x.id === r.id ? { ...x, ...patch } : x))
    try { await api.updateRule(r.id, patch) }
    catch (e) { addToast(e.response?.data?.error?.message ?? 'Lỗi khi lưu', 'error'); reload() }
  }
  async function saveDraft() {
    if (!draft.label.trim()) { addToast('Nhập tên quy tắc', 'error'); return }
    setSavingNew(true)
    try {
      await api.createRule({ label: draft.label.trim(), kind: draft.kind, defaultPoints: Number(draft.defaultPoints) || 0, detectSource: draft.detectSource, isActive: !!draft.isActive })
      setDraft(null); reload()
    } catch (e) { addToast(e.response?.data?.error?.message ?? 'Lỗi khi lưu', 'error') }
    finally { setSavingNew(false) }
  }
  async function remove(r) {
    if (!(await confirmDelete({ title: 'Xoá quy tắc', message: <>Xoá quy tắc <strong>“{r.label}”</strong>?</> }))) return
    try { await api.deleteRule(r.id); addToast('Đã xoá', 'success'); reload() } catch (e) { addToast(e.response?.data?.error?.message ?? 'Lỗi', 'error') }
  }
  const setD = (k, v) => setDraft((p) => ({ ...p, [k]: v }))
  const ACTIVE_OPTS = [{ key: '1', label: 'Đang bật' }, { key: '0', label: 'Tắt' }]

  return (
    <div className={s.card}>
      {loading ? <div className={s.loading}><Loader2 size={14} className={s.spin} /> Đang tải…</div> : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr>
              <th className={s.colChk}><input type="checkbox" className={s.check} checked={allChecked} onChange={toggleAll} title="Chọn tất cả" /></th>
              <th className={s.colStt}>STT</th>
              <FilterTh cf={cf} colKey="label">Tên quy tắc</FilterTh>
              <FilterTh cf={cf} colKey="kind">Loại</FilterTh>
              <FilterTh cf={cf} colKey="points" num>Điểm</FilterTh>
              <FilterTh cf={cf} colKey="detect">Nguồn phát hiện</FilterTh>
              <FilterTh cf={cf} colKey="active">Trạng thái</FilterTh>
              <th>Hành động</th>
            </tr></thead>
            <tbody>
              {draft && (
                <tr className={`${s.newRow} ${savingNew ? s.rowSaving : ''}`}>
                  <td className={s.colChk} />
                  <td className={s.colStt}>＋</td>
                  <td><input autoFocus className={s.cellInput} value={draft.label} placeholder="Tên quy tắc…" onChange={(e) => setD('label', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveDraft()} /></td>
                  <td><EnumSelect value={draft.kind} options={kinds} cls={kindSelCls(draft.kind)} onCommit={(v) => setD('kind', v)} /></td>
                  <td><input type="number" className={`${s.cellInput} ${s.cellInputNum}`} value={draft.defaultPoints} onChange={(e) => setD('defaultPoints', e.target.value)} /></td>
                  <td><EnumSelect value={draft.detectSource} options={detects} onCommit={(v) => setD('detectSource', v)} /></td>
                  <td><EnumSelect value={draft.isActive ? '1' : '0'} options={ACTIVE_OPTS} cls={draft.isActive ? s.selOn : s.selOff} onCommit={(v) => setD('isActive', v === '1')} /></td>
                  <td>
                    <span className={s.rowActions}>
                      <button className={`${s.iconBtn}`} title="Lưu" onClick={saveDraft} disabled={savingNew}>{savingNew ? <Loader2 size={13} className={s.spin} /> : <Check size={14} />}</button>
                      <button className={`${s.iconBtn} ${s.iconBtnDanger}`} title="Huỷ" onClick={() => setDraft(null)}><X size={14} /></button>
                    </span>
                  </td>
                </tr>
              )}
              {rows.length === 0 && !draft && <tr><td colSpan={8} className={s.empty}>Chưa có quy tắc. Bấm “Thêm quy tắc”.</td></tr>}
              {pg.slice.map((r, i) => (
                <tr key={r.id}>
                  <td className={s.colChk}><input type="checkbox" className={s.check} checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></td>
                  <td className={s.colStt}>{pg.start + i + 1}</td>
                  <td><CellText value={r.label} onCommit={(v) => v.trim() && patchRule(r, { label: v.trim() })} /></td>
                  <td><EnumSelect value={r.kind} options={kinds} cls={kindSelCls(r.kind)} onCommit={(v) => patchRule(r, { kind: v })} /></td>
                  <td><CellText value={r.defaultPoints} numeric onCommit={(v) => patchRule(r, { defaultPoints: Number(v) || 0 })} /></td>
                  <td><EnumSelect value={r.detectSource} options={detects} onCommit={(v) => patchRule(r, { detectSource: v })} /></td>
                  <td><EnumSelect value={r.isActive ? '1' : '0'} options={ACTIVE_OPTS} cls={r.isActive ? s.selOn : s.selOff} onCommit={(v) => patchRule(r, { isActive: v === '1' })} /></td>
                  <td>
                    <span className={s.rowActions}>
                      <button className={`${s.iconBtn} ${s.iconBtnDanger}`} title="Xoá" onClick={() => remove(r)}><Trash2 size={13} /></button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ColFilterPortal cf={cf} allRows={rows} />
    </div>
  )
}

// ══ SỔ THƯỞNG/PHẠT — bảng nhập thẳng (admin), xem (staff) ══════════════════════
function LedgerPanel({ isAdmin, createSignal, years, getOptions, enumLabel, onFooter }) {
  const addToast = useToastStore((st) => st.toast)
  const confirmDelete = useDeleteConfirm()
  const kinds = getOptions('reward_penalty_kind')
  const statuses = getOptions('reward_penalty_status')
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [draft, setDraft] = useState(null)
  const [savingNew, setSavingNew] = useState(false)
  const [flt, setFlt] = useState({ year: CUR_Y, month: CUR_M })
  const [sel, setSel] = useState(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const cols = useMemo(() => [
    ...(isAdmin ? [{ key: 'user', label: 'Nhân viên', type: 'enum', getLabel: (e) => e.userName }] : []),
    { key: 'date',   label: 'Ngày',      type: 'dateRange',   getDate: (e) => String(e.occurredOn || '').slice(0, 10), getLabel: (e) => fmtDate(e.occurredOn) },
    { key: 'kind',   label: 'Loại',      type: 'enum',        getLabel: (e) => enumLabel('reward_penalty_kind', e.kind) },
    { key: 'cat',    label: 'Danh mục',  type: 'text',        getLabel: (e) => e.categoryLabel },
    { key: 'points', label: 'Điểm',      type: 'numberRange', num: true, getNumber: (e) => Number(e.points), getLabel: (e) => String(e.points) },
    { key: 'amount', label: 'Tiền',      type: 'numberRange', num: true, getNumber: (e) => (e.amount == null ? null : Number(e.amount)), getLabel: (e) => (e.amount == null ? '' : String(e.amount)) },
    { key: 'source', label: 'Nguồn',     type: 'enum',        getLabel: (e) => enumLabel('reward_penalty_source', e.source) },
    { key: 'status', label: 'Trạng thái', type: 'enum',       getLabel: (e) => enumLabel('reward_penalty_status', e.status) },
    { key: 'note',   label: 'Ghi chú',   type: 'text',        getLabel: (e) => e.note || '' },
  ], [isAdmin, enumLabel])
  const cf = useColFilter(cols)
  const view = cf.apply(entries)
  const pg = paginate(view, page, pageSize)
  useEffect(() => { setPage(1) }, [cf.depKey])

  const allChecked = entries.length > 0 && sel.size === entries.length
  const toggleAll = () => setSel(allChecked ? new Set() : new Set(entries.map((e) => e.id)))
  const toggle = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  useEffect(() => { if (isAdmin) listUserOptions({ status: 'active' }).then(({ users: u }) => setUsers(u)).catch(() => {}) }, [isAdmin])
  const reload = useCallback(() => {
    setLoading(true); setSel(new Set())
    api.listEntries({ year: flt.year, month: flt.month }).then(setEntries).catch(() => setEntries([])).finally(() => setLoading(false))
  }, [flt])
  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    onFooter(<PaginationFooter total={pg.total} from={pg.from} to={pg.to} itemLabel="dòng"
      page={pg.safePage} pageSize={pageSize} totalPages={pg.totalPages} loading={loading}
      onPageChange={setPage} onPageSizeChange={(sz) => { setPageSize(sz); setPage(1) }} />)
    return () => onFooter(null)
  }, [onFooter, pg.total, pg.from, pg.to, pg.safePage, pg.totalPages, pageSize, loading])

  // Nút "Ghi nhận" trên thanh tab → mở dòng nhập thẳng.
  const lastSig = useRef(createSignal)
  useEffect(() => {
    if (lastSig.current === createSignal) return; lastSig.current = createSignal
    const st = statuses.find((o) => o.key === 'approved') ? 'approved' : (statuses[0]?.key ?? '')
    setDraft({ userId: users[0]?.id ?? '', occurredOn: TODAY(), kind: kinds[0]?.key ?? 'violation', categoryLabel: '', points: 0, amount: '', note: '', status: st })
  }, [createSignal, users, kinds, statuses])

  async function patchEntry(e, patch) {
    setEntries((list) => list.map((x) => x.id === e.id ? { ...x, ...patch } : x))
    try {
      if (patch.status && Object.keys(patch).length === 1 && patch.status === 'approved') await api.approveEntry(e.id)
      else await api.updateEntry(e.id, patch)
    } catch (er) { addToast(er.response?.data?.error?.message ?? 'Lỗi khi lưu', 'error'); reload() }
  }
  async function saveDraft() {
    if (!draft.userId) { addToast('Chọn nhân viên', 'error'); return }
    if (!draft.categoryLabel.trim()) { addToast('Nhập danh mục', 'error'); return }
    setSavingNew(true)
    try {
      await api.createEntry({
        userId: draft.userId, occurredOn: draft.occurredOn, kind: draft.kind,
        categoryLabel: draft.categoryLabel.trim(), points: Number(draft.points) || 0,
        amount: draft.amount === '' ? null : Number(draft.amount), note: draft.note.trim() || null, status: draft.status, source: 'manual',
      })
      setDraft(null); reload()
    } catch (e) { addToast(e.response?.data?.error?.message ?? 'Lỗi khi lưu', 'error') }
    finally { setSavingNew(false) }
  }
  async function remove(e) {
    if (!(await confirmDelete({ title: 'Xoá bản ghi', message: <>Xoá dòng <strong>“{e.categoryLabel}”</strong>?</> }))) return
    try { await api.deleteEntry(e.id); addToast('Đã xoá', 'success'); reload() } catch (er) { addToast(er.response?.data?.error?.message ?? 'Lỗi', 'error') }
  }
  const setD = (k, v) => setDraft((p) => ({ ...p, [k]: v }))

  return (
    <div className={s.stack}>
      <div className={s.card}>
        <div className={s.filters}>
          <div className={s.fld}><label className={s.lbl}>Năm</label><select className={s.select} value={flt.year} onChange={(e) => setFlt((p) => ({ ...p, year: Number(e.target.value) }))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></div>
          <div className={s.fld}><label className={s.lbl}>Tháng</label><select className={s.select} value={flt.month} onChange={(e) => setFlt((p) => ({ ...p, month: Number(e.target.value) }))}>{MONTHS.map((m) => <option key={m} value={m}>Tháng {m}</option>)}</select></div>
        </div>
        {loading ? <div className={s.loading}><Loader2 size={14} className={s.spin} /> Đang tải…</div> : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr>
                <th className={s.colChk}><input type="checkbox" className={s.check} checked={allChecked} onChange={toggleAll} title="Chọn tất cả" /></th>
                <th className={s.colStt}>STT</th>
                {isAdmin && <FilterTh cf={cf} colKey="user">Nhân viên</FilterTh>}
                <FilterTh cf={cf} colKey="date">Ngày</FilterTh>
                <FilterTh cf={cf} colKey="kind">Loại</FilterTh>
                <FilterTh cf={cf} colKey="cat">Danh mục</FilterTh>
                <FilterTh cf={cf} colKey="points" num>Điểm</FilterTh>
                <FilterTh cf={cf} colKey="amount" num>Tiền</FilterTh>
                <FilterTh cf={cf} colKey="source">Nguồn</FilterTh>
                <FilterTh cf={cf} colKey="status">Trạng thái</FilterTh>
                <FilterTh cf={cf} colKey="note">Ghi chú</FilterTh>
                {isAdmin && <th>Hành động</th>}
              </tr></thead>
              <tbody>
                {isAdmin && draft && (
                  <tr className={`${s.newRow} ${savingNew ? s.rowSaving : ''}`}>
                    <td className={s.colChk} />
                    <td className={s.colStt}>＋</td>
                    <td><select className={s.qeSelect} value={draft.userId} onChange={(e) => setD('userId', e.target.value)}><option value="">— chọn —</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></td>
                    <td><input type="date" className={s.cellInput} value={draft.occurredOn} onChange={(e) => setD('occurredOn', e.target.value)} /></td>
                    <td><EnumSelect value={draft.kind} options={kinds} cls={kindSelCls(draft.kind)} onCommit={(v) => setD('kind', v)} /></td>
                    <td><input autoFocus className={s.cellInput} value={draft.categoryLabel} placeholder="Danh mục…" onChange={(e) => setD('categoryLabel', e.target.value)} /></td>
                    <td><input type="number" className={`${s.cellInput} ${s.cellInputNum}`} value={draft.points} onChange={(e) => setD('points', e.target.value)} /></td>
                    <td><input type="number" className={`${s.cellInput} ${s.cellInputNum}`} value={draft.amount} placeholder="—" onChange={(e) => setD('amount', e.target.value)} /></td>
                    <td className={s.note}>Thủ công</td>
                    <td><EnumSelect value={draft.status} options={statuses} cls={statusSelCls(draft.status)} onCommit={(v) => setD('status', v)} /></td>
                    <td><input className={s.cellInput} value={draft.note} placeholder="Ghi chú…" onChange={(e) => setD('note', e.target.value)} /></td>
                    <td>
                      <span className={s.rowActions}>
                        <button className={s.iconBtn} title="Lưu" onClick={saveDraft} disabled={savingNew}>{savingNew ? <Loader2 size={13} className={s.spin} /> : <Check size={14} />}</button>
                        <button className={`${s.iconBtn} ${s.iconBtnDanger}`} title="Huỷ" onClick={() => setDraft(null)}><X size={14} /></button>
                      </span>
                    </td>
                  </tr>
                )}
                {entries.length === 0 && !draft && <tr><td colSpan={isAdmin ? 12 : 10} className={s.empty}>Không có dòng nào trong kỳ.</td></tr>}
                {pg.slice.map((e, i) => (
                  <tr key={e.id}>
                    <td className={s.colChk}><input type="checkbox" className={s.check} checked={sel.has(e.id)} onChange={() => toggle(e.id)} /></td>
                    <td className={s.colStt}>{pg.start + i + 1}</td>
                    {isAdmin && <td>{e.userName}</td>}
                    {isAdmin ? (
                      <>
                        <td><CellDate value={e.occurredOn} onCommit={(v) => v && patchEntry(e, { occurredOn: v })} /></td>
                        <td><EnumSelect value={e.kind} options={kinds} cls={kindSelCls(e.kind)} onCommit={(v) => patchEntry(e, { kind: v })} /></td>
                        <td><CellText value={e.categoryLabel} onCommit={(v) => v.trim() && patchEntry(e, { categoryLabel: v.trim() })} /></td>
                        <td><CellText value={e.points} numeric onCommit={(v) => patchEntry(e, { points: Number(v) || 0 })} /></td>
                        <td><CellText value={e.amount ?? ''} numeric onCommit={(v) => patchEntry(e, { amount: v === '' ? null : Number(v) })} /></td>
                        <td className={s.note}>{enumLabel('reward_penalty_source', e.source)}</td>
                        <td><EnumSelect value={e.status} options={statuses} cls={statusSelCls(e.status)} onCommit={(v) => patchEntry(e, { status: v })} /></td>
                        <td><CellText value={e.note ?? ''} onCommit={(v) => patchEntry(e, { note: v.trim() || null })} /></td>
                        <td>
                          <span className={s.rowActions}>
                            <button className={`${s.iconBtn} ${s.iconBtnDanger}`} title="Xoá" onClick={() => remove(e)}><Trash2 size={13} /></button>
                          </span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className={s.num} style={{ textAlign: 'left' }}>{fmtDate(e.occurredOn)}</td>
                        <td><span className={`${s.pill} ${KIND_PILL[e.kind]}`}>{enumLabel('reward_penalty_kind', e.kind)}</span></td>
                        <td>{e.categoryLabel}</td>
                        <td className={`${s.num} ${signCls(e.points)}`}>{fmtPts(e.points)}</td>
                        <td className={`${s.num} ${signCls(e.amount ?? 0)}`}>{fmtMoney(e.amount)}</td>
                        <td className={s.note}>{enumLabel('reward_penalty_source', e.source)}</td>
                        <td><span className={`${s.pill} ${STATUS_PILL[e.status] ?? s.pillDraft}`}>{enumLabel('reward_penalty_status', e.status)}</span></td>
                        <td className={s.note}>{e.note || '—'}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ColFilterPortal cf={cf} allRows={entries} />
    </div>
  )
}

// ══ TỔNG HỢP — chỉ xem + lọc header ═══════════════════════════════════════════
function SummaryPanel({ pullSignal, years, onFooter }) {
  const addToast = useToastStore((st) => st.toast)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [pulling, setPulling] = useState(false)
  const [ym, setYm] = useState({ year: CUR_Y, month: CUR_M })
  const [sel, setSel] = useState(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const cols = useMemo(() => [
    { key: 'user', label: 'Nhân viên',   type: 'text',        getLabel: (r) => r.userName },
    { key: 'rp',   label: 'Điểm thưởng', type: 'numberRange', num: true, getNumber: (r) => r.rewardPoints,  getLabel: (r) => String(r.rewardPoints) },
    { key: 'pp',   label: 'Điểm phạt',   type: 'numberRange', num: true, getNumber: (r) => r.penaltyPoints, getLabel: (r) => String(r.penaltyPoints) },
    { key: 'np',   label: 'Điểm ròng',   type: 'numberRange', num: true, getNumber: (r) => r.netPoints,     getLabel: (r) => String(r.netPoints) },
    { key: 'ra',   label: 'Tiền thưởng', type: 'numberRange', num: true, getNumber: (r) => r.rewardAmount,  getLabel: (r) => String(r.rewardAmount) },
    { key: 'pa',   label: 'Tiền phạt',   type: 'numberRange', num: true, getNumber: (r) => r.penaltyAmount, getLabel: (r) => String(r.penaltyAmount) },
    { key: 'na',   label: 'Ròng (₫)',    type: 'numberRange', num: true, getNumber: (r) => r.netAmount,     getLabel: (r) => String(r.netAmount) },
  ], [])
  const cf = useColFilter(cols)
  const view = cf.apply(rows)
  const pg = paginate(view, page, pageSize)
  useEffect(() => { setPage(1) }, [cf.depKey])

  const allChecked = rows.length > 0 && sel.size === rows.length
  const toggleAll = () => setSel(allChecked ? new Set() : new Set(rows.map((r) => r.userId)))
  const toggle = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  useEffect(() => { setLoading(true); setSel(new Set()); setPage(1); api.getSummary(ym.year, ym.month).then(setRows).catch(() => setRows([])).finally(() => setLoading(false)) }, [ym])
  useEffect(() => {
    onFooter(<PaginationFooter total={pg.total} from={pg.from} to={pg.to} itemLabel="nhân viên"
      page={pg.safePage} pageSize={pageSize} totalPages={pg.totalPages} loading={loading}
      onPageChange={setPage} onPageSizeChange={(sz) => { setPageSize(sz); setPage(1) }} />)
    return () => onFooter(null)
  }, [onFooter, pg.total, pg.from, pg.to, pg.safePage, pg.totalPages, pageSize, loading])
  const tot = useMemo(() => view.reduce((a, r) => ({ rp: a.rp + r.rewardPoints, pp: a.pp + r.penaltyPoints, np: a.np + r.netPoints, ra: a.ra + r.rewardAmount, pa: a.pa + r.penaltyAmount, na: a.na + r.netAmount }), { rp: 0, pp: 0, np: 0, ra: 0, pa: 0, na: 0 }), [view])

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
              <FilterTh cf={cf} colKey="user">Nhân viên</FilterTh>
              <FilterTh cf={cf} colKey="rp" num>Điểm thưởng</FilterTh>
              <FilterTh cf={cf} colKey="pp" num>Điểm phạt</FilterTh>
              <FilterTh cf={cf} colKey="np" num>Điểm ròng</FilterTh>
              <FilterTh cf={cf} colKey="ra" num>Tiền thưởng</FilterTh>
              <FilterTh cf={cf} colKey="pa" num>Tiền phạt</FilterTh>
              <FilterTh cf={cf} colKey="na" num>Ròng (₫)</FilterTh>
            </tr></thead>
            <tbody>
              {view.length === 0 && <tr><td colSpan={9} className={s.empty}>Chưa có dữ liệu đã duyệt trong kỳ.</td></tr>}
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
            {view.length > 0 && <tfoot><tr>
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
      <ColFilterPortal cf={cf} allRows={rows} />
      <div className={s.cardFoot}>🔗 <strong>Nối payroll (GĐ2):</strong> nút “Kéo vào Bảng lương” sẽ đọc <strong>Ròng (₫)</strong> theo tháng → cộng vào bảng lương. Điểm ròng dùng cho KPI.</div>
    </div>
  )
}
