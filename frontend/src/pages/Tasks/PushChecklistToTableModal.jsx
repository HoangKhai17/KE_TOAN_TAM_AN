import { useState, useEffect, useMemo } from 'react'
import { Loader2, ArrowRightLeft } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import DateBox from '../../components/ui/DateBox'
import { useToastStore } from '../../stores/toastStore'
import * as ctApi from '../../api/companyTables'
import s from './tasks.module.css'

// ── Ghi 1 bước checklist sang 1 bảng dữ liệu tùy chỉnh của công ty ──────────────
// THUẦN FRONTEND: chỉ gọi API tạo dòng (createRow) sẵn có — KHÔNG lưu liên kết nào.
// Nhớ bảng + giá trị cột (vd "Phần mềm") lần trước trong localStorage để lần sau đỡ nhập.

const LS_LAST_DEF = 'pushChecklist:lastDefId'
const LS_VALS = (defId) => `pushChecklist:vals:${defId}`
// Chỉ cho nhập các kiểu cột đơn giản (bỏ computed/formula/file/link).
const EDITABLE = ['text', 'number', 'date', 'select']

// Cột nhận "tên công việc": ưu tiên nhãn giống Công việc/Tên/Nội dung/Hạng mục, else cột text đầu tiên.
function pickNameCol(cols) {
  const txt = cols.filter((c) => c.dataType === 'text')
  return txt.find((c) => /công\s*việc|tên|nội\s*dung|hạng\s*mục/i.test(c.label)) || txt[0] || null
}

const ctl = {
  height: 30, padding: '0 8px', borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-border-muted)', background: 'var(--color-white)',
  fontSize: 'var(--fs-2xs)', fontFamily: 'inherit', color: 'var(--color-text-strong)',
  outline: 'none', width: '100%', boxSizing: 'border-box',
}
const lbl = { fontSize: 'var(--fs-2xs)', color: 'var(--color-text-soft)', fontWeight: 'var(--fw-medium)' }

export default function PushChecklistToTableModal({ companyId, companyName, stepText, onClose }) {
  const addToast = useToastStore((st) => st.toast)
  const [defs, setDefs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [defId, setDefId]     = useState('')
  const [values, setValues]   = useState({})   // colKey -> giá trị
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    ctApi.listDefs({ section: 'data', activeOnly: true })
      .then((list) => {
        setDefs(list)
        const last = localStorage.getItem(LS_LAST_DEF)
        setDefId((last && list.some((d) => d.id === last)) ? last : (list[0]?.id ?? ''))
      })
      .catch(() => addToast('Không tải được danh sách bảng', 'error'))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const def  = useMemo(() => defs.find((d) => d.id === defId) || null, [defs, defId])
  const cols = useMemo(
    () => (def?.columns ?? []).filter((c) => EDITABLE.includes(c.dataType) && c.isActive !== false),
    [def])
  const nameCol = useMemo(() => pickNameCol(cols), [cols])

  // Đổi bảng → dựng lại form: tên công việc = stepText; cột khác lấy từ localStorage (nhớ lần trước);
  // cột ngày có nhãn "cập nhật" mặc định = hôm nay.
  useEffect(() => {
    if (!def) { setValues({}); return }
    let remembered = {}
    try { remembered = JSON.parse(localStorage.getItem(LS_VALS(def.id)) || '{}') } catch { /* ignore */ }
    const today = new Date().toISOString().slice(0, 10)
    const next = {}
    for (const c of cols) {
      if (nameCol && c.colKey === nameCol.colKey) next[c.colKey] = stepText
      else if (c.dataType === 'date' && /cập\s*nhật/i.test(c.label)) next[c.colKey] = remembered[c.colKey] ?? today
      else next[c.colKey] = remembered[c.colKey] ?? ''
    }
    setValues(next)
  }, [defId, def, cols, nameCol, stepText])

  const setVal = (k, v) => setValues((p) => ({ ...p, [k]: v }))

  async function submit() {
    if (!def) { addToast('Chọn bảng dữ liệu', 'error'); return }
    const data = {}
    for (const c of cols) {
      const v = values[c.colKey]
      if (v === '' || v == null) continue
      if (c.dataType === 'number') { const n = Number(v); if (!Number.isNaN(n)) data[c.colKey] = n }
      else if (c.dataType === 'date') data[c.colKey] = String(v).slice(0, 10)
      else data[c.colKey] = String(v)
    }
    if (!Object.keys(data).length) { addToast('Chưa có dữ liệu để ghi', 'error'); return }
    setSaving(true)
    try {
      await ctApi.createRow(companyId, def.id, data)
      // Nhớ lựa chọn (thuần FE): bảng + giá trị các cột KHÔNG phải tên công việc.
      localStorage.setItem(LS_LAST_DEF, def.id)
      const remember = {}
      for (const c of cols) {
        if (nameCol && c.colKey === nameCol.colKey) continue
        if (values[c.colKey] !== '' && values[c.colKey] != null) remember[c.colKey] = values[c.colKey]
      }
      try { localStorage.setItem(LS_VALS(def.id), JSON.stringify(remember)) } catch { /* ignore */ }
      addToast(`Đã ghi sang bảng "${def.name}"`, 'success')
      onClose()
    } catch (e) {
      addToast(e.response?.data?.error?.message ?? 'Không ghi được (có thể bạn không phụ trách công ty này)', 'error')
    } finally { setSaving(false) }
  }

  function renderControl(c) {
    const v = values[c.colKey] ?? ''
    if (c.dataType === 'date') {
      return <DateBox block value={v ? String(v).slice(0, 10) : ''} onChange={(nv) => setVal(c.colKey, nv)} />
    }
    if (c.dataType === 'select') {
      return (
        <select style={ctl} value={v} onChange={(e) => setVal(c.colKey, e.target.value)}>
          <option value=""></option>
          {(c.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    }
    return (
      <input
        style={ctl}
        type={c.dataType === 'number' ? 'number' : 'text'}
        value={v}
        placeholder={c.dataType === 'number' ? '0' : ''}
        onChange={(e) => setVal(c.colKey, e.target.value)}
      />
    )
  }

  return (
    <Modal title="Ghi bước checklist sang bảng dữ liệu" onClose={onClose} width="min(960px, calc(100vw - 40px))">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--color-text-soft)', lineHeight: 1.5 }}>
          Công ty: <strong style={{ color: 'var(--color-text-strong)' }}>{companyName || '—'}</strong>
          <span style={{ margin: '0 6px' }}>·</span>
          Bước: <strong style={{ color: 'var(--color-text-strong)' }}>{stepText}</strong>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 18, color: 'var(--color-muted)', fontSize: 'var(--fs-2xs)' }}>
            <Loader2 size={15} style={{ animation: 'app-spin .8s linear infinite' }} /> Đang tải bảng…
          </div>
        ) : defs.length === 0 ? (
          <div style={{ padding: 18, color: 'var(--color-muted)', fontSize: 'var(--fs-2xs)' }}>Chưa có bảng dữ liệu nào.</div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={lbl}>Bảng dữ liệu đích</label>
              <select style={ctl} value={defId} onChange={(e) => setDefId(e.target.value)}>
                {defs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            {cols.length === 0 ? (
              <div style={{ padding: 12, color: 'var(--color-muted)', fontSize: 'var(--fs-2xs)', fontStyle: 'italic' }}>
                Bảng này không có cột nhập trực tiếp (chỉ có cột tính/file).
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px 14px' }}>
                {cols.map((c) => (
                  <div key={c.colKey} style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: c.dataType === 'text' && nameCol && c.colKey === nameCol.colKey ? '1 / -1' : 'auto' }}>
                    <label style={lbl}>{c.label}{nameCol && c.colKey === nameCol.colKey ? ' (tên bước)' : ''}</label>
                    {renderControl(c)}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" className={s.btnSecondary} onClick={onClose} disabled={saving}>Huỷ</button>
          <button type="button" className={s.btnPrimary} onClick={submit} disabled={saving || loading || !def || cols.length === 0}>
            {saving ? <Loader2 size={13} style={{ animation: 'app-spin .8s linear infinite' }} /> : <ArrowRightLeft size={13} />} Ghi sang bảng
          </button>
        </div>
      </div>
    </Modal>
  )
}
