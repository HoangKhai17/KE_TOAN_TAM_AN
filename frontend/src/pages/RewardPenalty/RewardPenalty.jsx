import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Plus, Check, X, Trash2, Upload, Download, ListChecks, ClipboardList, Users, ChevronDown, Search } from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import Modal from '../../components/ui/Modal'
import PaginationFooter from '../../components/layout/PaginationFooter'
import { BulkActionBar } from '../../components/ui/data-table'
import ExcelImportModal from '../../components/ui/ExcelImportModal'
import DateBox from '../../components/ui/DateBox'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { useEnumsStore } from '../../hooks/useEnums'
import { useDeleteConfirm } from '../../components/ui/DeleteConfirmDialog'
import { listUserOptions } from '../../api/users'
import * as api from '../../api/rewardPenalty'
import { useColFilter, FilterTh, ColFilterPortal } from './useColFilter'
import ExportPreviewModal from './ExportPreviewModal'
import s from './rewardPenalty.module.css'

const CUR_Y = new Date().getFullYear()
const CUR_M = new Date().getMonth() + 1
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)   // tháng là phổ quát, không phải danh mục
const TODAY = () => new Date().toISOString().slice(0, 10)
const ISO = (v) => (v ? String(v).slice(0, 10) : '')

const fmtPts = (n) => (n == null) ? '—' : (n > 0 ? `+${n}` : `${n}`)
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : '—'
const signCls = (n) => n > 0 ? s.pos : n < 0 ? s.neg : s.zero
const KIND_PILL = { reward: s.pillReward, violation: s.pillPenalty }
const STATUS_PILL = { approved: s.pillApproved, draft: s.pillDraft }
const kindSelCls = (k) => k === 'reward' ? s.selReward : s.selPenalty
const statusSelCls = (k) => k === 'approved' ? s.selApproved : s.selDraft

// map giá trị Excel (nhãn hoặc key) → key enum
const optKey = (options, val, fallback) => {
  const q = String(val ?? '').trim().toLowerCase()
  if (!q) return fallback
  const hit = options.find((o) => o.key.toLowerCase() === q || String(o.label).toLowerCase() === q)
  return hit ? hit.key : fallback
}
const parseActive = (v) => !['tắt', 'tat', '0', 'false', 'off', 'ngưng', 'ngung', 'no', 'không', 'khong'].includes(String(v ?? '').trim().toLowerCase())

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
  return <DateBox block className={s.dateCell} value={ISO(value)} disabled={disabled} onChange={(v) => onCommit(v)} />
}
function EnumSelect({ value, options, onCommit, cls, title, disabled }) {
  return (
    <select className={`${s.qeSelect} ${cls || ''}`} value={value} disabled={disabled} title={title} onChange={(e) => onCommit(e.target.value)}>
      {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
    </select>
  )
}

// Ô "Tên quy tắc" trong Sổ thưởng/phạt: chọn từ danh sách Quy tắc, tạo nhanh quy tắc mới,
// hoặc nhập tay (ngoài danh sách). Dùng cho cả dòng thêm mới lẫn dòng đã lưu (sửa được).
function RuleCell({ label, ruleId, rules, enumLabel, onPick, onManual, onCreate }) {
  const [mode, setMode] = useState('closed')   // closed | open | manual
  const [q, setQ] = useState('')
  const [text, setText] = useState('')
  const [pos, setPos] = useState(null)
  const wrapRef = useRef(null)
  const triggerRef = useRef(null)
  const curRule = rules.find((r) => r.id === ruleId) || rules.find((r) => r.label === label)

  useEffect(() => {
    if (mode !== 'open') return undefined
    const close = (e) => {
      if (e.type === 'mousedown') { if (wrapRef.current && !wrapRef.current.contains(e.target)) setMode('closed'); return }
      if (e.type === 'scroll' && wrapRef.current && wrapRef.current.contains(e.target)) return   // cuộn trong panel
      setMode('closed')
    }
    document.addEventListener('mousedown', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [mode])

  function openPanel() {
    const rect = triggerRef.current.getBoundingClientRect()
    const width = Math.max(rect.width, 260)
    setPos({ top: rect.bottom + 2, left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), width })
    setQ(''); setMode('open')
  }
  function confirmText() { const name = text.trim(); if (!name) return; onManual(name); setMode('closed'); setText('') }

  if (mode === 'manual') {
    return (
      <div className={s.catManual}>
        <input autoFocus className={s.cellInput} value={text} placeholder="Nhập tên (ngoài danh sách)…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') confirmText(); if (e.key === 'Escape') { setMode('closed'); setText('') } }} />
        <button className={s.catBack} title="Áp dụng" onClick={confirmText}><Check size={13} /></button>
        <button className={s.catBack} title="Quay lại chọn" onClick={() => { setMode('closed'); setText('') }}><X size={13} /></button>
      </div>
    )
  }

  const kw = q.trim().toLowerCase()
  const filtered = kw ? rules.filter((r) => String(r.label).toLowerCase().includes(kw)) : rules
  const display = curRule ? `${curRule.label} (${enumLabel('reward_penalty_kind', curRule.kind)})` : (label || '— Chọn quy tắc —')

  return (
    <div className={s.rp} ref={wrapRef}>
      <button type="button" ref={triggerRef} className={s.rpTrigger} onClick={() => (mode === 'open' ? setMode('closed') : openPanel())}>
        <span className={`${s.rpValue} ${(curRule || label) ? '' : s.rpPlaceholder}`}>{display}</span>
        <ChevronDown size={13} className={s.rpChevron} />
      </button>
      {mode === 'open' && pos && (
        <div className={s.rpPanel} style={{ top: pos.top, left: pos.left, width: pos.width }}>
          <div className={s.rpActions}>
            <button className={s.rpAction} onClick={() => { setMode('closed'); onCreate('') }}><Plus size={13} /> Tạo quy tắc mới…</button>
            <button className={s.rpAction} onClick={() => { setText(label || ''); setMode('manual') }}>✎ Khác (nhập tay)</button>
          </div>
          <div className={s.rpSearchWrap}>
            <Search size={13} className={s.rpSearchIcon} />
            <input autoFocus className={s.rpSearch} placeholder="Tìm quy tắc…" value={q}
              onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setMode('closed') }} />
          </div>
          <div className={s.rpList}>
            {filtered.length === 0 && <div className={s.rpEmpty}>Không có quy tắc khớp</div>}
            {filtered.map((r) => (
              <button key={r.id} className={`${s.rpItem} ${curRule?.id === r.id ? s.rpItemActive : ''}`} onClick={() => { setMode('closed'); onPick(r) }}>
                {r.label} <span className={s.rpKind}>({enumLabel('reward_penalty_kind', r.kind)})</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Popup tạo quy tắc mới ngay từ Sổ thưởng/phạt (nhập đủ điểm/nguồn/trạng thái).
function QuickRuleModal({ prefill, getOptions, onClose, onCreated }) {
  const addToast = useToastStore((st) => st.toast)
  const kinds = getOptions('reward_penalty_kind')
  const detects = getOptions('reward_penalty_detect')
  const [f, setF] = useState({ label: prefill || '', kind: kinds[0]?.key ?? 'violation', defaultPoints: 0, detectSource: detects[0]?.key ?? 'manual', isActive: true })
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))
  async function save() {
    if (!f.label.trim()) { addToast('Nhập tên quy tắc', 'error'); return }
    setSaving(true)
    try {
      const r = await api.createRule({ label: f.label.trim(), kind: f.kind, defaultPoints: Number(f.defaultPoints) || 0, detectSource: f.detectSource, isActive: !!f.isActive })
      addToast(`Đã tạo quy tắc “${r.label}”`, 'success'); onCreated(r)
    } catch (e) { addToast(e.response?.data?.error?.message ?? 'Lỗi tạo quy tắc', 'error'); setSaving(false) }
  }
  return (
    <Modal title="Tạo quy tắc mới" onClose={onClose} width="min(560px, calc(100vw - 40px))">
      <div className={s.form}>
        <div className={s.fFull}><label className={s.fLbl}>Tên quy tắc <span className={s.fReq}>*</span></label><input autoFocus className={s.input} value={f.label} onChange={set('label')} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="VD: Không chấm công" /></div>
        <div><label className={s.fLbl}>Loại</label><select className={s.input} value={f.kind} onChange={set('kind')}>{kinds.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></div>
        <div><label className={s.fLbl}>Điểm mặc định (âm = phạt)</label><input className={s.input} type="number" value={f.defaultPoints} onChange={set('defaultPoints')} /></div>
        <div><label className={s.fLbl}>Nguồn phát hiện</label><select className={s.input} value={f.detectSource} onChange={set('detectSource')}>{detects.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></div>
        <div><label className={s.fLbl}>Trạng thái</label><select className={s.input} value={f.isActive ? '1' : '0'} onChange={(e) => setF((p) => ({ ...p, isActive: e.target.value === '1' }))}><option value="1">Đang bật</option><option value="0">Tắt</option></select></div>
        <div className={s.formFoot}>
          <button className={s.btnSecondary} onClick={onClose} disabled={saving}>Huỷ</button>
          <button className={s.btnPrimary} onClick={save} disabled={saving}>{saving && <Loader2 size={13} className={s.spin} />} Tạo &amp; chọn</button>
        </div>
      </div>
    </Modal>
  )
}

export default function RewardPenalty() {
  const isAdmin = useAuthStore((st) => st.user?.role === 'admin')
  const loadEnums = useEnumsStore((st) => st.load)
  const getOptions = useEnumsStore((st) => st.getOptions)
  useEffect(() => { loadEnums() }, [loadEnums])
  const enumLabel = useCallback((type, key) => (getOptions(type).find((x) => x.key === key)?.label ?? key), [getOptions])
  const [tab, setTab] = useState('ledger')
  const [footer, setFooter] = useState(null)
  const [slot, setSlot] = useState(null)   // thanh công cụ trên đầu — panel portal vào đây
  // Năm lấy ĐỘNG từ DB (năm có dữ liệu + năm hiện tại), không hardcode.
  const [years, setYears] = useState([CUR_Y])
  useEffect(() => { api.listYears().then((ys) => setYears(ys.length ? ys : [CUR_Y])).catch(() => {}) }, [])

  const cls = (t) => `${s.tab} ${tab === t ? s.tabActive : ''}`

  return (
    <AppLayout footer={footer}>
      <div className={s.page}>
        <div className={s.tabs}>
          {isAdmin ? (
            <div className={s.tabLinks} role="tablist">
              <button className={cls('ledger')} onClick={() => setTab('ledger')}><ClipboardList size={13} /> Sổ thưởng/phạt</button>
              <button className={cls('summary')} onClick={() => setTab('summary')}><Users size={13} /> Tổng hợp theo NV</button>
              <button className={cls('rules')} onClick={() => setTab('rules')}><ListChecks size={13} /> Danh sách quy tắc</button>
            </div>
          ) : <span />}
          <div className={s.tabActions} ref={setSlot} />
        </div>
        {isAdmin ? (
          <>
            {tab === 'rules' && <RulesPanel slot={slot} getOptions={getOptions} enumLabel={enumLabel} onFooter={setFooter} />}
            {tab === 'ledger' && <LedgerPanel isAdmin slot={slot} years={years} getOptions={getOptions} enumLabel={enumLabel} onFooter={setFooter} />}
            {tab === 'summary' && <SummaryPanel slot={slot} years={years} onFooter={setFooter} />}
          </>
        ) : (
          <LedgerPanel isAdmin={false} slot={slot} years={years} getOptions={getOptions} enumLabel={enumLabel} onFooter={setFooter} />
        )}
      </div>
    </AppLayout>
  )
}

// ══ QUY TẮC — bảng nhập thẳng ═════════════════════════════════════════════════
function RulesPanel({ slot, getOptions, enumLabel, onFooter }) {
  const addToast = useToastStore((st) => st.toast)
  const confirmDelete = useDeleteConfirm()
  const kinds = getOptions('reward_penalty_kind')
  const detects = getOptions('reward_penalty_detect')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState(null)
  const [savingNew, setSavingNew] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
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

  function openAdd() { setDraft({ label: '', kind: kinds[0]?.key ?? 'violation', defaultPoints: 0, detectSource: detects[0]?.key ?? 'manual', isActive: true }) }
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
  async function removeSelected() {
    if (!(await confirmDelete({ title: 'Xoá nhiều quy tắc', message: <>Xoá <strong>{sel.size}</strong> quy tắc đã chọn?</> }))) return
    const ids = [...sel]; let ok = 0
    for (const id of ids) { try { await api.deleteRule(id); ok++ } catch { /* skip */ } }
    addToast(`Đã xoá ${ok}/${ids.length} quy tắc`, ok ? 'success' : 'error'); reload()
  }
  const exportData = sel.size ? view.filter((r) => sel.has(r.id)) : view
  const exportCols = [
    { key: 'label', label: 'Tên quy tắc', width: 36, value: (r) => r.label },
    { key: 'kind', label: 'Loại', width: 12, value: (r) => enumLabel('reward_penalty_kind', r.kind) },
    { key: 'points', label: 'Điểm', width: 10, type: 'number', value: (r) => Number(r.defaultPoints) },
    { key: 'detect', label: 'Nguồn phát hiện', width: 18, value: (r) => enumLabel('reward_penalty_detect', r.detectSource) },
    { key: 'active', label: 'Trạng thái', width: 12, value: (r) => (r.isActive ? 'Đang bật' : 'Tắt') },
  ]
  async function onImport(validRows) {
    let inserted = 0, failed = 0; const errors = []
    for (const row of validRows) {
      try {
        await api.createRule({
          label: String(row.label).trim(), kind: optKey(kinds, row.kind, kinds[0]?.key ?? 'violation'),
          defaultPoints: Number(row.points) || 0, detectSource: optKey(detects, row.detect, detects[0]?.key ?? 'manual'), isActive: parseActive(row.active),
        })
        inserted++
      } catch (e) { failed++; errors.push({ row: row._rowNum, message: e.response?.data?.error?.message ?? 'Lỗi khi tạo' }) }
    }
    reload()
    return { inserted, failed, errors }
  }
  const setD = (k, v) => setDraft((p) => ({ ...p, [k]: v }))
  const ACTIVE_OPTS = [{ key: '1', label: 'Đang bật' }, { key: '0', label: 'Tắt' }]

  const toolbar = (
    <div className={s.toolbar}>
      <button className={s.btnSecondary} onClick={() => setImportOpen(true)}><Upload size={14} /> Nhập Excel</button>
      <button className={s.btnSecondary} onClick={() => setExportOpen(true)}><Download size={14} /> Xuất Excel</button>
      <button className={s.btnPrimary} onClick={openAdd}><Plus size={14} /> Thêm quy tắc</button>
    </div>
  )

  return (
    <div className={s.card}>
      {slot && createPortal(toolbar, slot)}
      {sel.size > 0 && (
        <div className={s.bulkWrap}>
          <BulkActionBar count={sel.size}>
            <button className={`${s.btnMini} ${s.btnMiniDanger}`} onClick={removeSelected}><Trash2 size={13} /> Xoá đã chọn</button>
            <button className={s.btnMini} onClick={() => setSel(new Set())}>Bỏ chọn</button>
          </BulkActionBar>
        </div>
      )}
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
                      <button className={s.iconBtn} title="Lưu" onClick={saveDraft} disabled={savingNew}>{savingNew ? <Loader2 size={13} className={s.spin} /> : <Check size={14} />}</button>
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
      {importOpen && (
        <ExcelImportModal
          title="Nhập quy tắc từ Excel" entityLabel="quy tắc" templateName="mau_quy_tac_diem_thuong.xlsx" sheetName="Quy tắc"
          fixedCols={[
            { key: 'label', label: 'Tên quy tắc', required: true, type: 'text', example: 'Không chấm công' },
            { key: 'kind', label: 'Loại', required: false, type: 'text', example: 'Vi phạm' },
            { key: 'points', label: 'Điểm', required: false, type: 'number', example: -5 },
            { key: 'detect', label: 'Nguồn phát hiện', required: false, type: 'text', example: 'Thủ công' },
            { key: 'active', label: 'Trạng thái', required: false, type: 'text', example: 'Đang bật' },
          ]}
          onImport={onImport} onClose={() => setImportOpen(false)}
        />
      )}
      {exportOpen && (
        <ExportPreviewModal title="Xuất Excel — Quy tắc" filename={`quy_tac_diem_thuong_${TODAY()}`} sheetName="Quy tắc"
          columns={exportCols} data={exportData} onClose={() => setExportOpen(false)} />
      )}
    </div>
  )
}

// ══ SỔ THƯỞNG/PHẠT — bảng nhập thẳng (admin), xem (staff) ══════════════════════
function LedgerPanel({ isAdmin, slot, years, getOptions, enumLabel, onFooter }) {
  const addToast = useToastStore((st) => st.toast)
  const confirmDelete = useDeleteConfirm()
  const kinds = getOptions('reward_penalty_kind')
  const statuses = getOptions('reward_penalty_status')
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [rules, setRules] = useState([])
  const [draft, setDraft] = useState(null)
  const [savingNew, setSavingNew] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [createRuleFor, setCreateRuleFor] = useState(null)   // { prefill, apply(rule) }
  const [flt, setFlt] = useState({ year: CUR_Y, month: CUR_M })
  const [sel, setSel] = useState(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const cols = useMemo(() => [
    { key: 'cat',    label: 'Tên quy tắc', type: 'text',      getLabel: (e) => e.categoryLabel },
    { key: 'kind',   label: 'Loại',      type: 'enum',        getLabel: (e) => enumLabel('reward_penalty_kind', e.kind) },
    ...(isAdmin ? [{ key: 'user', label: 'Nhân viên', type: 'enum', getLabel: (e) => e.userName }] : []),
    { key: 'date',   label: 'Ngày',      type: 'dateRange',   getDate: (e) => ISO(e.occurredOn), getLabel: (e) => fmtDate(e.occurredOn) },
    { key: 'points', label: 'Điểm',      type: 'numberRange', num: true, getNumber: (e) => Number(e.points), getLabel: (e) => String(e.points) },
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
  useEffect(() => { if (isAdmin) api.listRules({ activeOnly: 'true' }).then(setRules).catch(() => {}) }, [isAdmin])
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

  function openAdd() {
    const st = statuses.find((o) => o.key === 'approved') ? 'approved' : (statuses[0]?.key ?? '')
    setDraft({ userId: users[0]?.id ?? '', occurredOn: TODAY(), ruleId: '', kind: kinds[0]?.key ?? 'violation', categoryLabel: '', points: 0, note: '', status: st })
  }
  async function patchEntry(e, patch) {
    setEntries((list) => list.map((x) => x.id === e.id ? { ...x, ...patch } : x))
    try {
      if (patch.status && Object.keys(patch).length === 1 && patch.status === 'approved') await api.approveEntry(e.id)
      else await api.updateEntry(e.id, patch)
    } catch (er) { addToast(er.response?.data?.error?.message ?? 'Lỗi khi lưu', 'error'); reload() }
  }
  async function saveDraft() {
    if (!draft.userId) { addToast('Chọn nhân viên', 'error'); return }
    if (!draft.categoryLabel.trim()) { addToast('Chọn hoặc nhập tên quy tắc', 'error'); return }
    setSavingNew(true)
    try {
      await api.createEntry({
        userId: draft.userId, occurredOn: draft.occurredOn, ruleId: draft.ruleId || null, kind: draft.kind, categoryLabel: draft.categoryLabel.trim(),
        points: Number(draft.points) || 0, note: draft.note.trim() || null, status: draft.status, source: 'manual',
      })
      setDraft(null); reload()
    } catch (e) { addToast(e.response?.data?.error?.message ?? 'Lỗi khi lưu', 'error') }
    finally { setSavingNew(false) }
  }
  async function remove(e) {
    if (!(await confirmDelete({ title: 'Xoá bản ghi', message: <>Xoá dòng <strong>“{e.categoryLabel}”</strong>?</> }))) return
    try { await api.deleteEntry(e.id); addToast('Đã xoá', 'success'); reload() } catch (er) { addToast(er.response?.data?.error?.message ?? 'Lỗi', 'error') }
  }
  async function removeSelected() {
    if (!(await confirmDelete({ title: 'Xoá nhiều dòng', message: <>Xoá <strong>{sel.size}</strong> dòng đã chọn?</> }))) return
    const ids = [...sel]; let ok = 0
    for (const id of ids) { try { await api.deleteEntry(id); ok++ } catch { /* skip */ } }
    addToast(`Đã xoá ${ok}/${ids.length} dòng`, ok ? 'success' : 'error'); reload()
  }
  async function approveSelected() {
    const targets = entries.filter((e) => sel.has(e.id) && e.status === 'draft')
    if (targets.length === 0) { addToast('Không có dòng nháp trong lựa chọn', 'info'); return }
    let ok = 0
    for (const e of targets) { try { await api.approveEntry(e.id); ok++ } catch { /* skip */ } }
    addToast(`Đã duyệt ${ok}/${targets.length} dòng`, ok ? 'success' : 'error'); reload()
  }
  const exportData = sel.size ? view.filter((e) => sel.has(e.id)) : view
  const exportCols = [
    { key: 'cat', label: 'Tên quy tắc', width: 28, value: (e) => e.categoryLabel },
    { key: 'kind', label: 'Loại', width: 12, value: (e) => enumLabel('reward_penalty_kind', e.kind) },
    ...(isAdmin ? [{ key: 'user', label: 'Nhân viên', width: 22, value: (e) => e.userName }] : []),
    { key: 'date', label: 'Ngày', width: 12, type: 'date', value: (e) => ISO(e.occurredOn) },
    { key: 'points', label: 'Điểm', width: 9, type: 'number', value: (e) => Number(e.points) },
    { key: 'source', label: 'Nguồn', width: 12, value: (e) => enumLabel('reward_penalty_source', e.source) },
    { key: 'status', label: 'Trạng thái', width: 14, value: (e) => enumLabel('reward_penalty_status', e.status) },
    { key: 'note', label: 'Ghi chú', width: 30, value: (e) => e.note || '' },
  ]
  async function onImport(validRows) {
    const byName = new Map(users.map((u) => [String(u.name).trim().toLowerCase(), u.id]))
    let inserted = 0, failed = 0; const errors = []
    for (const row of validRows) {
      const uid = byName.get(String(row.user ?? '').trim().toLowerCase())
      if (!uid) { failed++; errors.push({ row: row._rowNum, message: `Không tìm thấy nhân viên "${row.user}"` }); continue }
      try {
        await api.createEntry({
          userId: uid, occurredOn: row.date, kind: optKey(kinds, row.kind, kinds[0]?.key ?? 'violation'),
          categoryLabel: String(row.cat).trim(), points: Number(row.points) || 0,
          note: (row.note && String(row.note).trim()) || null,
          status: optKey(statuses, row.status, statuses.find((o) => o.key === 'approved') ? 'approved' : (statuses[0]?.key ?? '')), source: 'manual',
        })
        inserted++
      } catch (e) { failed++; errors.push({ row: row._rowNum, message: e.response?.data?.error?.message ?? 'Lỗi khi tạo' }) }
    }
    reload()
    return { inserted, failed, errors }
  }
  const setD = (k, v) => setDraft((p) => ({ ...p, [k]: v }))

  const toolbar = (
    <div className={s.toolbar}>
      <label className={s.toolField}>Năm <select className={s.select} value={flt.year} onChange={(e) => setFlt((p) => ({ ...p, year: Number(e.target.value) }))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
      <label className={s.toolField}>Tháng <select className={s.select} value={flt.month} onChange={(e) => setFlt((p) => ({ ...p, month: Number(e.target.value) }))}>{MONTHS.map((m) => <option key={m} value={m}>Tháng {m}</option>)}</select></label>
      {isAdmin && <button className={s.btnSecondary} onClick={() => setImportOpen(true)}><Upload size={14} /> Nhập Excel</button>}
      <button className={s.btnSecondary} onClick={() => setExportOpen(true)}><Download size={14} /> Xuất Excel</button>
      {isAdmin && <button className={s.btnPrimary} onClick={openAdd}><Plus size={14} /> Ghi nhận</button>}
    </div>
  )

  return (
    <div className={s.stack}>
      <div className={s.card}>
        {slot && createPortal(toolbar, slot)}
        {sel.size > 0 && (
          <div className={s.bulkWrap}>
            <BulkActionBar count={sel.size}>
              {isAdmin && <button className={`${s.btnMini} ${s.btnMiniPrimary}`} onClick={approveSelected}><Check size={13} /> Duyệt đã chọn</button>}
              {isAdmin && <button className={`${s.btnMini} ${s.btnMiniDanger}`} onClick={removeSelected}><Trash2 size={13} /> Xoá đã chọn</button>}
              <button className={s.btnMini} onClick={() => setExportOpen(true)}><Download size={13} /> Xuất đã chọn</button>
              <button className={s.btnMini} onClick={() => setSel(new Set())}>Bỏ chọn</button>
            </BulkActionBar>
          </div>
        )}
        {loading ? <div className={s.loading}><Loader2 size={14} className={s.spin} /> Đang tải…</div> : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr>
                <th className={s.colChk}><input type="checkbox" className={s.check} checked={allChecked} onChange={toggleAll} title="Chọn tất cả" /></th>
                <th className={s.colStt}>STT</th>
                <FilterTh cf={cf} colKey="cat">Tên quy tắc</FilterTh>
                <FilterTh cf={cf} colKey="kind">Loại</FilterTh>
                {isAdmin && <FilterTh cf={cf} colKey="user">Nhân viên</FilterTh>}
                <FilterTh cf={cf} colKey="date">Ngày</FilterTh>
                <FilterTh cf={cf} colKey="points" num>Điểm</FilterTh>
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
                    <td><RuleCell label={draft.categoryLabel} ruleId={draft.ruleId} rules={rules} enumLabel={enumLabel}
                      onPick={(r) => setDraft((p) => ({ ...p, ruleId: r.id, categoryLabel: r.label, kind: r.kind, points: r.defaultPoints }))}
                      onManual={(name) => setDraft((p) => ({ ...p, ruleId: '', categoryLabel: name }))}
                      onCreate={(name) => setCreateRuleFor({ prefill: name, apply: (r) => setDraft((p) => ({ ...p, ruleId: r.id, categoryLabel: r.label, kind: r.kind, points: r.defaultPoints })) })} /></td>
                    <td><EnumSelect value={draft.kind} options={kinds} cls={kindSelCls(draft.kind)} onCommit={(v) => setD('kind', v)} /></td>
                    <td><select className={s.qeSelect} value={draft.userId} onChange={(e) => setD('userId', e.target.value)}><option value="">— chọn —</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></td>
                    <td><DateBox block className={s.dateCell} value={draft.occurredOn} onChange={(v) => setD('occurredOn', v)} /></td>
                    <td><input type="number" className={`${s.cellInput} ${s.cellInputNum}`} value={draft.points} onChange={(e) => setD('points', e.target.value)} /></td>
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
                {entries.length === 0 && !draft && <tr><td colSpan={isAdmin ? 11 : 9} className={s.empty}>Không có dòng nào trong kỳ.</td></tr>}
                {pg.slice.map((e, i) => (
                  <tr key={e.id}>
                    <td className={s.colChk}><input type="checkbox" className={s.check} checked={sel.has(e.id)} onChange={() => toggle(e.id)} /></td>
                    <td className={s.colStt}>{pg.start + i + 1}</td>
                    {isAdmin ? (
                      <>
                        <td><RuleCell label={e.categoryLabel} ruleId={e.ruleId} rules={rules} enumLabel={enumLabel}
                          onPick={(r) => patchEntry(e, { ruleId: r.id, categoryLabel: r.label, kind: r.kind, points: r.defaultPoints })}
                          onManual={(name) => patchEntry(e, { ruleId: null, categoryLabel: name })}
                          onCreate={(name) => setCreateRuleFor({ prefill: name, apply: (r) => patchEntry(e, { ruleId: r.id, categoryLabel: r.label, kind: r.kind, points: r.defaultPoints }) })} /></td>
                        <td><EnumSelect value={e.kind} options={kinds} cls={kindSelCls(e.kind)} onCommit={(v) => patchEntry(e, { kind: v })} /></td>
                        <td><select className={`${s.qeSelect} ${s.ruleSelect}`} value={e.userId} onChange={(ev) => ev.target.value && patchEntry(e, { userId: ev.target.value })}>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></td>
                        <td><CellDate value={e.occurredOn} onCommit={(v) => v && patchEntry(e, { occurredOn: v })} /></td>
                        <td><CellText value={e.points} numeric onCommit={(v) => patchEntry(e, { points: Number(v) || 0 })} /></td>
                        <td className={s.note}>{enumLabel('reward_penalty_source', e.source)}</td>
                        <td><EnumSelect value={e.status} options={statuses} cls={statusSelCls(e.status)} onCommit={(v) => patchEntry(e, { status: v })} /></td>
                        <td><CellText value={e.note ?? ''} placeholder="Ghi chú…" onCommit={(v) => patchEntry(e, { note: v.trim() || null })} /></td>
                        <td>
                          <span className={s.rowActions}>
                            <button className={`${s.iconBtn} ${s.iconBtnDanger}`} title="Xoá" onClick={() => remove(e)}><Trash2 size={13} /></button>
                          </span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{e.categoryLabel}</td>
                        <td><span className={`${s.pill} ${KIND_PILL[e.kind]}`}>{enumLabel('reward_penalty_kind', e.kind)}</span></td>
                        <td className={s.num} style={{ textAlign: 'left' }}>{fmtDate(e.occurredOn)}</td>
                        <td className={`${s.num} ${signCls(e.points)}`}>{fmtPts(e.points)}</td>
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
      {importOpen && (
        <ExcelImportModal
          title="Nhập sổ thưởng/phạt từ Excel" entityLabel="dòng" templateName="mau_so_thuong_phat.xlsx" sheetName="Sổ thưởng phạt"
          fixedCols={[
            { key: 'cat', label: 'Tên quy tắc', required: true, type: 'text', example: 'Đi trễ họp KH' },
            { key: 'kind', label: 'Loại', required: false, type: 'text', example: 'Vi phạm' },
            { key: 'user', label: 'Nhân viên', required: true, type: 'text', example: 'Nguyễn Văn A' },
            { key: 'date', label: 'Ngày', required: true, type: 'date', example: '2026-09-10' },
            { key: 'points', label: 'Điểm', required: false, type: 'number', example: -3 },
            { key: 'note', label: 'Ghi chú', required: false, type: 'text', example: '' },
            { key: 'status', label: 'Trạng thái', required: false, type: 'text', example: 'Đã duyệt' },
          ]}
          onImport={onImport} onClose={() => setImportOpen(false)}
        />
      )}
      {exportOpen && (
        <ExportPreviewModal title="Xuất Excel — Sổ thưởng/phạt" filename={`so_thuong_phat_${flt.year}-${String(flt.month).padStart(2, '0')}`}
          sheetName={`T${flt.month}-${flt.year}`} columns={exportCols} data={exportData} onClose={() => setExportOpen(false)} />
      )}
      {createRuleFor && (
        <QuickRuleModal prefill={createRuleFor.prefill} getOptions={getOptions}
          onClose={() => setCreateRuleFor(null)}
          onCreated={(r) => { setRules((list) => [...list, r]); createRuleFor.apply(r); setCreateRuleFor(null) }} />
      )}
    </div>
  )
}

// ══ TỔNG HỢP — chỉ xem + lọc header ═══════════════════════════════════════════
function SummaryPanel({ slot, years, onFooter }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [ym, setYm] = useState({ year: CUR_Y, month: CUR_M })
  const [sel, setSel] = useState(() => new Set())
  const [exportOpen, setExportOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const cols = useMemo(() => [
    { key: 'user', label: 'Nhân viên',   type: 'text',        getLabel: (r) => r.userName },
    { key: 'rp',   label: 'Điểm thưởng', type: 'numberRange', num: true, getNumber: (r) => r.rewardPoints,  getLabel: (r) => String(r.rewardPoints) },
    { key: 'pp',   label: 'Điểm phạt',   type: 'numberRange', num: true, getNumber: (r) => r.penaltyPoints, getLabel: (r) => String(r.penaltyPoints) },
    { key: 'np',   label: 'Điểm ròng',   type: 'numberRange', num: true, getNumber: (r) => r.netPoints,     getLabel: (r) => String(r.netPoints) },
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
  const tot = useMemo(() => view.reduce((a, r) => ({ rp: a.rp + r.rewardPoints, pp: a.pp + r.penaltyPoints, np: a.np + r.netPoints }), { rp: 0, pp: 0, np: 0 }), [view])

  const exportData = sel.size ? view.filter((r) => sel.has(r.userId)) : view
  const exportCols = [
    { key: 'user', label: 'Nhân viên', width: 24, value: (r) => r.userName },
    { key: 'rp', label: 'Điểm thưởng', width: 12, type: 'number', total: true, value: (r) => r.rewardPoints },
    { key: 'pp', label: 'Điểm phạt', width: 12, type: 'number', total: true, value: (r) => r.penaltyPoints },
    { key: 'np', label: 'Điểm ròng', width: 12, type: 'number', total: true, value: (r) => r.netPoints },
  ]

  const toolbar = (
    <div className={s.toolbar}>
      <label className={s.toolField}>Năm <select className={s.select} value={ym.year} onChange={(e) => setYm((p) => ({ ...p, year: Number(e.target.value) }))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
      <label className={s.toolField}>Tháng <select className={s.select} value={ym.month} onChange={(e) => setYm((p) => ({ ...p, month: Number(e.target.value) }))}>{MONTHS.map((m) => <option key={m} value={m}>Tháng {m}</option>)}</select></label>
      <button className={s.btnSecondary} onClick={() => setExportOpen(true)}><Download size={14} /> Xuất Excel</button>
    </div>
  )

  return (
    <div className={s.card}>
      {slot && createPortal(toolbar, slot)}
      {sel.size > 0 && (
        <div className={s.bulkWrap}>
          <BulkActionBar count={sel.size}>
            <button className={s.btnMini} onClick={() => setExportOpen(true)}><Download size={13} /> Xuất đã chọn</button>
            <button className={s.btnMini} onClick={() => setSel(new Set())}>Bỏ chọn</button>
          </BulkActionBar>
        </div>
      )}
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
            </tr></thead>
            <tbody>
              {view.length === 0 && <tr><td colSpan={6} className={s.empty}>Chưa có dữ liệu đã duyệt trong kỳ.</td></tr>}
              {pg.slice.map((r, i) => (
                <tr key={r.userId}>
                  <td className={s.colChk}><input type="checkbox" className={s.check} checked={sel.has(r.userId)} onChange={() => toggle(r.userId)} /></td>
                  <td className={s.colStt}>{pg.start + i + 1}</td>
                  <td>{r.userName}</td>
                  <td className={`${s.num} ${signCls(r.rewardPoints)}`}>{fmtPts(r.rewardPoints)}</td>
                  <td className={`${s.num} ${signCls(r.penaltyPoints)}`}>{fmtPts(r.penaltyPoints)}</td>
                  <td className={`${s.num} ${signCls(r.netPoints)}`}>{fmtPts(r.netPoints)}</td>
                </tr>
              ))}
            </tbody>
            {view.length > 0 && <tfoot><tr>
              <td className={s.colChk} /><td className={s.colStt} />
              <td>Cộng kỳ</td>
              <td className={`${s.num} ${signCls(tot.rp)}`}>{fmtPts(tot.rp)}</td>
              <td className={`${s.num} ${signCls(tot.pp)}`}>{fmtPts(tot.pp)}</td>
              <td className={`${s.num} ${signCls(tot.np)}`}>{fmtPts(tot.np)}</td>
            </tr></tfoot>}
          </table>
        </div>
      )}
      <ColFilterPortal cf={cf} allRows={rows} />
      {exportOpen && (
        <ExportPreviewModal title="Xuất Excel — Tổng hợp KPI" filename={`tong_hop_kpi_${ym.year}-${String(ym.month).padStart(2, '0')}`}
          sheetName={`T${ym.month}-${ym.year}`} columns={exportCols} data={exportData} totalLabel="Cộng kỳ" onClose={() => setExportOpen(false)} />
      )}
      <div className={s.cardFoot}>ℹ️ Tổng hợp theo <strong>điểm</strong> (thưởng/phạt/ròng), chỉ tính dòng <strong>đã duyệt</strong>. Việc quy đổi điểm → tiền để nối bảng lương sẽ bổ sung sau.</div>
    </div>
  )
}
