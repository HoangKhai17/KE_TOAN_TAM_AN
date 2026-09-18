import { useState, useEffect, useCallback } from 'react'
import { Plus, Loader2, Trash2, History, Pencil } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import DateBox from '../../components/ui/DateBox'
import { useToastStore } from '../../stores/toastStore'
import { useEnumsStore } from '../../hooks/useEnums'
import { useDeleteConfirm } from '../../components/ui/DeleteConfirmDialog'
import * as payrollApi from '../../api/payroll'
import s from './payroll.module.css'

const fmtVnd = (n) => (n ? Number(n).toLocaleString('vi-VN') + '₫' : '—')
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—')
const TODAY = () => new Date().toISOString().slice(0, 10)

// ── Tab Cấu hình lương ────────────────────────────────────────────────────────
export default function SalaryConfig() {
  const addToast = useToastStore((st) => st.toast)
  const loadEnums = useEnumsStore((st) => st.load)
  const getOptions = useEnumsStore((st) => st.getOptions)
  useEffect(() => { loadEnums() }, [loadEnums])
  const enumLabel = useCallback((k) => (getOptions('salary_change_type').find((o) => o.key === k)?.label ?? k), [getOptions])

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)      // { user, salary } — mở hồ sơ/điều chỉnh
  const [historyFor, setHistoryFor] = useState(null)  // { userId, userName }
  const [sel, setSel] = useState(() => new Set())
  const allChecked = rows.length > 0 && rows.every((r) => sel.has(r.userId))

  const reload = useCallback(() => {
    setLoading(true)
    payrollApi.listSalaries().then(setRows).catch(() => setRows([])).finally(() => setLoading(false))
  }, [])
  useEffect(() => { reload() }, [reload])

  return (
    <div className={s.card}>
      {loading ? (
        <div className={s.loadingBox}><Loader2 size={18} className={s.spin} /> Đang tải...</div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={s.colChk}><input type="checkbox" className={s.check} title="Chọn tất cả" checked={allChecked} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.userId)) : new Set())} /></th>
                <th className={s.colStt}>STT</th>
                <th>Nhân viên</th><th className={s.num}>Lương cơ bản</th><th className={s.num}>Phụ cấp</th>
                <th className={s.num}>BH (NV)</th><th className={s.num}>PIT</th><th className={s.num}>Thực nhận (trước thưởng/phạt)</th>
                <th>Hiệu lực từ</th><th>Loại</th><th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={11} className={s.emptyText}>Chưa có nhân viên active.</td></tr>}
              {rows.map((r, idx) => {
                const sal = r.salary
                const bhNv = sal ? sal.bhxhEmployee + sal.bhytEmployee + sal.bhtnEmployee : 0
                return (
                  <tr key={r.userId}>
                    <td className={s.colChk}><input type="checkbox" className={s.check} checked={sel.has(r.userId)} onChange={() => setSel((prev) => { const n = new Set(prev); n.has(r.userId) ? n.delete(r.userId) : n.add(r.userId); return n })} /></td>
                    <td className={s.colStt}>{idx + 1}</td>
                    <td><strong>{r.userName}</strong>{r.jobTitle ? <div className={s.pageSubtitle}>{r.jobTitle}</div> : null}</td>
                    <td className={s.num}>{sal ? fmtVnd(sal.baseSalary) : <span className={s.badgeDraft}>Chưa có hồ sơ</span>}</td>
                    <td className={s.num}>{sal ? fmtVnd(sal.allowances) : '—'}</td>
                    <td className={s.num}>{sal ? fmtVnd(bhNv) : '—'}</td>
                    <td className={s.num}>{sal ? fmtVnd(sal.pitDeduction) : '—'}</td>
                    <td className={s.num}><strong>{sal ? fmtVnd(sal.netBeforeReward) : '—'}</strong></td>
                    <td>{sal ? fmtDate(sal.effectiveFrom) : '—'}</td>
                    <td>{sal ? enumLabel(sal.changeType) : '—'}</td>
                    <td>
                      <div className={s.rowActions}>
                        <button className={s.btnSecondary} onClick={() => setModal({ user: r, salary: sal })}>
                          {sal ? <><Pencil size={13} /> Điều chỉnh</> : <><Plus size={13} /> Tạo hồ sơ</>}
                        </button>
                        {sal && <button className={s.iconGreen} title="Lịch sử lương" onClick={() => setHistoryFor({ userId: r.userId, userName: r.userName })}><History size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {modal && (
        <SalaryModal user={modal.user} current={modal.salary} changeTypes={getOptions('salary_change_type')}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); reload() }} />
      )}
      {historyFor && (
        <HistoryModal userId={historyFor.userId} userName={historyFor.userName} enumLabel={enumLabel}
          onClose={() => setHistoryFor(null)} onChanged={reload} />
      )}
    </div>
  )
}

// ── Modal tạo/điều chỉnh lương (mỗi lần lưu = 1 phiên bản hiệu lực) ────────────
function SalaryModal({ user, current, changeTypes, onClose, onSaved }) {
  const addToast = useToastStore((st) => st.toast)
  const numStr = (v) => (v ? String(v) : '')
  const [f, setF] = useState({
    effectiveFrom: TODAY(),
    changeType: current ? (changeTypes.find((o) => o.key === 'adjust') ? 'adjust' : changeTypes[0]?.key) : (changeTypes.find((o) => o.key === 'initial') ? 'initial' : changeTypes[0]?.key),
    baseSalary: numStr(current?.baseSalary),
    allowanceItems: (current?.allowanceItems ?? []).map((i) => ({ name: i.name ?? '', amount: String(i.amount ?? '') })),
    bhxhEmployee: numStr(current?.bhxhEmployee), bhytEmployee: numStr(current?.bhytEmployee), bhtnEmployee: numStr(current?.bhtnEmployee),
    bhxhEmployer: numStr(current?.bhxhEmployer), bhytEmployer: numStr(current?.bhytEmployer), bhtnEmployer: numStr(current?.bhtnEmployer),
    pitDeduction: numStr(current?.pitDeduction), otherDeductions: numStr(current?.otherDeductions),
    reason: '', note: current?.note ?? '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))
  const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : Math.round(n) }
  const setItem = (i, k, v) => setF((p) => ({ ...p, allowanceItems: p.allowanceItems.map((it, idx) => idx === i ? { ...it, [k]: v } : it) }))
  const addItem = () => setF((p) => ({ ...p, allowanceItems: [...p.allowanceItems, { name: '', amount: '' }] }))
  const rmItem = (i) => setF((p) => ({ ...p, allowanceItems: p.allowanceItems.filter((_, idx) => idx !== i) }))

  async function save() {
    if (!f.effectiveFrom) { addToast('Chọn ngày hiệu lực', 'error'); return }
    setSaving(true)
    try {
      await payrollApi.createSalary({
        userId: user.userId, effectiveFrom: f.effectiveFrom, changeType: f.changeType,
        baseSalary: num(f.baseSalary),
        allowanceItems: f.allowanceItems.filter((i) => i.name.trim()).map((i) => ({ name: i.name.trim(), amount: num(i.amount) })),
        bhxhEmployee: num(f.bhxhEmployee), bhytEmployee: num(f.bhytEmployee), bhtnEmployee: num(f.bhtnEmployee),
        bhxhEmployer: num(f.bhxhEmployer), bhytEmployer: num(f.bhytEmployer), bhtnEmployer: num(f.bhtnEmployer),
        pitDeduction: num(f.pitDeduction), otherDeductions: num(f.otherDeductions),
        reason: f.reason.trim() || null, note: f.note.trim() || null,
      })
      addToast('Đã lưu hồ sơ lương', 'success'); onSaved()
    } catch (e) { addToast(e.response?.data?.error?.message ?? 'Lỗi khi lưu', 'error'); setSaving(false) }
  }

  const numField = (label, key) => (
    <div className={s.formGroup}><label className={s.formLabel}>{label}</label>
      <input className={s.formInput} type="number" value={f[key]} onChange={set(key)} placeholder="0" /></div>
  )

  return (
    <Modal title={`${current ? 'Điều chỉnh' : 'Tạo hồ sơ'} lương — ${user.userName}`} onClose={onClose} width="min(900px, calc(100vw - 40px))">
      <div className={s.formGrid}>
        <div className={s.formGroup}><label className={`${s.formLabel} ${s.formLabelReq}`}>Hiệu lực từ</label>
          <DateBox block className={s.dateField} value={f.effectiveFrom} onChange={(v) => setF((p) => ({ ...p, effectiveFrom: v }))} /></div>
        <div className={s.formGroup}><label className={s.formLabel}>Loại điều chỉnh</label>
          <select className={s.formInput} value={f.changeType} onChange={set('changeType')}>
            {changeTypes.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></div>
        {numField('Lương cơ bản', 'baseSalary')}
        <div className={s.formGroup}><label className={s.formLabel}>Lý do (nếu tăng/giảm)</label>
          <input className={s.formInput} value={f.reason} onChange={set('reason')} placeholder="VD: Tăng lương định kỳ" /></div>

        <div className={`${s.formGroup} ${s.formSpan2}`}>
          <label className={s.formLabel}>Phụ cấp</label>
          {f.allowanceItems.map((it, i) => (
            <div key={i} className={s.salItemRow}>
              <input className={s.formInput} placeholder="Tên phụ cấp" value={it.name} onChange={(e) => setItem(i, 'name', e.target.value)} />
              <input className={`${s.formInput} ${s.num}`} type="number" placeholder="Số tiền" value={it.amount} onChange={(e) => setItem(i, 'amount', e.target.value)} />
              <button className={s.btnDanger} type="button" onClick={() => rmItem(i)}><Trash2 size={13} /></button>
            </div>
          ))}
          <button className={s.btnSecondary} type="button" onClick={addItem}><Plus size={13} /> Thêm phụ cấp</button>
        </div>

        {numField('BHXH (NV)', 'bhxhEmployee')}
        {numField('BHYT (NV)', 'bhytEmployee')}
        {numField('BHTN (NV)', 'bhtnEmployee')}
        {numField('BHXH (NSDLĐ)', 'bhxhEmployer')}
        {numField('BHYT (NSDLĐ)', 'bhytEmployer')}
        {numField('BHTN (NSDLĐ)', 'bhtnEmployer')}
        {numField('Thuế TNCN (PIT)', 'pitDeduction')}
        {numField('Khấu trừ khác', 'otherDeductions')}
        <div className={`${s.formGroup} ${s.formSpan2}`}><label className={s.formLabel}>Ghi chú</label>
          <textarea className={s.formTextarea} rows={3} value={f.note} onChange={set('note')} placeholder="Ghi chú thêm (nếu có)…" /></div>

        <div className={`${s.modalActions} ${s.formSpan2}`}>
          <button className={s.btnSecondary} onClick={onClose} disabled={saving}>Huỷ</button>
          <button className={s.btnPrimary} onClick={save} disabled={saving}>{saving && <Loader2 size={13} className={s.spin} />} Lưu</button>
        </div>
      </div>
    </Modal>
  )
}

// ── Lịch sử phiên bản lương ───────────────────────────────────────────────────
function HistoryModal({ userId, userName, enumLabel, onClose, onChanged }) {
  const addToast = useToastStore((st) => st.toast)
  const confirmDelete = useDeleteConfirm()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(() => { setLoading(true); payrollApi.getSalaryHistory(userId).then(setRows).catch(() => setRows([])).finally(() => setLoading(false)) }, [userId])
  useEffect(() => { load() }, [load])

  async function remove(r) {
    if (!(await confirmDelete({ title: 'Xoá phiên bản lương', message: <>Xoá mốc hiệu lực <strong>{fmtDate(r.effectiveFrom)}</strong>?</> }))) return
    try { await payrollApi.deleteSalary(r.id); addToast('Đã xoá', 'success'); load(); onChanged?.() } catch (e) { addToast(e.response?.data?.error?.message ?? 'Lỗi', 'error') }
  }

  return (
    <Modal title={`Lịch sử lương — ${userName}`} onClose={onClose} width="min(960px, calc(100vw - 40px))">
      {loading ? <div className={s.loadingBox}><Loader2 size={16} className={s.spin} /> Đang tải...</div> : (
        <table className={s.table}>
          <thead><tr><th>Hiệu lực từ</th><th>Loại</th><th className={s.num}>Lương CB</th><th className={s.num}>Thực nhận</th><th>Lý do</th><th /></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className={s.emptyText}>Chưa có.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{fmtDate(r.effectiveFrom)}</td>
                <td>{enumLabel(r.changeType)}</td>
                <td className={s.num}>{fmtVnd(r.baseSalary)}</td>
                <td className={s.num}>{fmtVnd(r.netBeforeReward)}</td>
                <td>{r.reason || '—'}</td>
                <td className={s.num}><button className={s.btnDanger} onClick={() => remove(r)}><Trash2 size={13} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  )
}
