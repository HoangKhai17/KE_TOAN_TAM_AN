import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Loader2, CheckCircle2, ShieldAlert, FileText, BadgeCheck, Receipt, ArrowRight, Search, Info, X, ChevronDown } from 'lucide-react'
import { getAccountingAlerts, getTaxAlertSources } from '../../api/dashboard'
import { evaluateFormula } from '../../utils/formula'
import { useEnumsStore } from '../../hooks/useEnums'
import s from './Dashboard.module.css'

const WITHIN_OPTS = [30, 60, 90]
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—')
const fmtMoney = (n) => (Number(n) || 0).toLocaleString('vi-VN')

// Ngày còn lại so với hôm nay (giờ địa phương) từ chuỗi YYYY-MM-DD. <0 = đã quá hạn.
function parseYMD(sv) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(sv || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null }
function daysLeftFromToday(sv) {
  const d = parseYMD(sv); if (!d) return null
  const t = new Date(); const t0 = new Date(t.getFullYear(), t.getMonth(), t.getDate())
  return Math.round((d - t0) / 86400000)
}

// Nhãn + màu theo số ngày còn lại
function dueMeta(daysLeft) {
  if (daysLeft == null) return { cls: s.alertAmber, text: '—' }
  if (daysLeft < 0)  return { cls: s.alertRed,    text: `Quá hạn ${Math.abs(daysLeft)} ngày` }
  if (daysLeft === 0) return { cls: s.alertRed,    text: 'Hết hạn hôm nay' }
  if (daysLeft <= 7) return { cls: s.alertOrange, text: `Còn ${daysLeft} ngày` }
  return { cls: s.alertAmber, text: `Còn ${daysLeft} ngày` }
}

// ── Resolver cho engine công thức (raw + formula lồng nhau + chống vòng lặp) ────
// Trạng thái thuế chỉ phụ thuộc cột raw & công thức con (không cross-row) nên đủ dùng.
function makeRowResolver(row, byKey) {
  const stack = new Set()
  function resolve(key) {
    if (typeof key === 'string' && key.includes('!')) return undefined   // cross-row: không cần
    const col = byKey[key]
    if (!col) return undefined
    if (col.dataType === 'formula') {
      if (stack.has(key)) { const e = new Error('cycle'); e.__formulaError = '#CYCLE'; throw e }
      stack.add(key)
      const { value, error } = evaluateFormula(col.computedConfig?.expression, resolve)
      stack.delete(key)
      if (error) { const e = new Error(error); e.__formulaError = error; throw e }
      return value
    }
    if (col.dataType === 'computed' || col.dataType === 'link' || col.dataType === 'file') return null
    const v = row.data?.[key]
    if (v == null || v === '') return null
    return col.dataType === 'number' ? Number(v) : v
  }
  return resolve
}

// Suy ra danh sách cảnh báo thuế từ RAW rows + định nghĩa cột, bằng chính công thức "Trạng thái".
export function buildTaxItems(sources, withinDays) {
  const items = []
  for (const src of (sources || [])) {
    const cols = src.def?.columns || []
    const byKey = Object.fromEntries(cols.map((c) => [c.colKey, c]))
    // Cột trạng thái = công thức có chữ "Trễ hạn" trong biểu thức; cột hạn = cột ngày có nhãn "Hạn".
    const statusCol = cols.find((c) => c.dataType === 'formula' && /Trễ hạn/i.test(c.computedConfig?.expression || ''))
    const dueCol    = cols.find((c) => c.dataType === 'date' && /hạn/i.test(c.label || '')) || byKey.han_nop
    const amountCol = cols.find((c) => c.dataType === 'formula' && /còn phải nộp/i.test(c.label || '')) || byKey.con_phai_nop
    const periodCol = cols.find((c) => /kỳ/i.test(c.label || '')) || byKey.debt_amount
    const catCol    = cols.find((c) => /tiểu mục/i.test(c.label || '')) || byKey.category
    if (!statusCol) continue

    for (const row of (src.rows || [])) {
      let status = ''
      try { status = String(evaluateFormula(statusCol.computedConfig?.expression, makeRowResolver(row, byKey)).value ?? '') } catch { status = '' }
      const isOverdue = status.includes('Chưa nộp') && status.includes('Trễ hạn')
      const isPending = /chưa đến hạn/i.test(status)
      if (!isOverdue && !isPending) continue

      const dueStr = dueCol ? row.data?.[dueCol.colKey] : null
      const daysLeft = dueStr != null ? daysLeftFromToday(dueStr) : (isOverdue ? -1 : null)
      if (isPending && !(daysLeft != null && daysLeft >= 0 && daysLeft <= withinDays)) continue

      let amount = null
      if (amountCol) { try { amount = Number(evaluateFormula(amountCol.computedConfig?.expression, makeRowResolver(row, byKey)).value) || null } catch { amount = null } }

      items.push({
        kind: 'tax',
        id: row.id,
        companyId: row.companyId,
        companyName: row.companyName,
        companyShortName: row.companyShortName,
        title: [row.data?.[periodCol?.colKey], row.data?.[catCol?.colKey]].filter(Boolean).join(' · ') || 'Phát sinh thuế',
        amount,
        dueDate: dueStr,
        daysLeft,
      })
    }
  }
  return items
}

function AlertRow({ it, getLabel, onOpen }) {
  const meta = dueMeta(it.daysLeft)
  const conf = {
    contract: { tag: 'Hợp đồng', cls: s.alertKindContract, Icon: FileText },
    license:  { tag: 'Giấy phép', cls: s.alertKindLicense,  Icon: BadgeCheck },
    tax:      { tag: 'Thuế',      cls: s.alertKindTax,      Icon: Receipt },
  }[it.kind] || { tag: '', cls: '', Icon: FileText }
  const desc = it.kind === 'contract'
    ? (it.title || getLabel('contract_type', it.contractType, 'Hợp đồng dịch vụ'))
    : it.kind === 'license'
      ? (getLabel('location_type', it.locationType, 'Giấy phép') + (it.title ? ` · ${it.title}` : ''))
      : (it.title + (it.amount ? ` · còn ${fmtMoney(it.amount)}đ` : ''))
  return (
    <button type="button" className={s.alertRow} onClick={onOpen}>
      <span className={`${s.alertDot} ${meta.cls}`} />
      <span className={`${s.alertKind} ${conf.cls}`}>
        <conf.Icon size={12} />{conf.tag}
      </span>
      <span className={s.alertBody}>
        <span className={s.alertCompany}>{it.companyShortName || it.companyName}</span>
        <span className={s.alertDesc} title={desc}>{desc}</span>
      </span>
      <span className={s.alertDue}>
        <span className={`${s.alertDueText} ${meta.cls}`}>{meta.text}</span>
        <span className={s.alertDueDate}>{fmtDate(it.dueDate)}</span>
      </span>
      <ArrowRight size={13} className={s.alertArrow} />
    </button>
  )
}

const KINDS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'contract', label: 'Hợp đồng' },
  { key: 'license', label: 'Giấy phép' },
  { key: 'tax', label: 'Thuế' },
]
const STATUSES = [
  { key: 'all', label: 'Mọi mức' },
  { key: 'overdue', label: 'Quá hạn' },
  { key: 'soon', label: 'Sắp đến' },
]
const VISIBLE = 6

export default function DashboardAlerts() {
  const navigate = useNavigate()
  const getLabel = useEnumsStore((st) => st.getLabel)
  const [withinDays, setWithinDays] = useState(30)
  const [kindF, setKindF]     = useState('all')
  const [statusF, setStatusF] = useState('all')
  const [search, setSearch]   = useState('')
  const [expanded, setExpanded] = useState(false)

  const acctQuery = useQuery({
    queryKey: ['dashboard-accounting-alerts', withinDays],
    queryFn: () => getAccountingAlerts(withinDays),
    staleTime: 60_000,
  })
  const taxQuery = useQuery({
    queryKey: ['dashboard-tax-alert-sources'],
    queryFn: () => getTaxAlertSources(),
    staleTime: 60_000,
  })
  const loading = acctQuery.isLoading || taxQuery.isLoading

  const allItems = useMemo(() => {
    const acct = acctQuery.data?.items ?? []
    const tax = buildTaxItems(taxQuery.data?.sources, withinDays)
    return [...acct, ...tax].sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999))
  }, [acctQuery.data, taxQuery.data, withinDays])

  const overdue = allItems.filter((x) => (x.daysLeft ?? 0) < 0).length
  const dueSoon = allItems.length - overdue

  // Lọc theo mức + tên công ty (chưa lọc theo loại → để đếm chip theo loại)
  const q = search.trim().toLowerCase()
  const baseFiltered = useMemo(() => allItems.filter((it) => {
    if (statusF === 'overdue' && !((it.daysLeft ?? 0) < 0)) return false
    if (statusF === 'soon' && !((it.daysLeft ?? 0) >= 0)) return false
    if (q && !`${it.companyName || ''} ${it.companyShortName || ''}`.toLowerCase().includes(q)) return false
    return true
  }), [allItems, statusF, q])
  const kindCount = (k) => (k === 'all' ? baseFiltered.length : baseFiltered.filter((it) => it.kind === k).length)
  const filtered = kindF === 'all' ? baseFiltered : baseFiltered.filter((it) => it.kind === kindF)
  const displayed = expanded ? filtered : filtered.slice(0, VISIBLE)

  return (
    <div className={`${s.chartPanel} ${s.kpiPanel} ${s.alertPanel}`}>
      {/* Tiêu đề + số liệu trên CÙNG 1 hàng */}
      <div className={s.chartHeader}>
        <span className={`${s.chartTitle} ${s.alertTitle}`}>
          <ShieldAlert size={15} className={s.alertTitleIcon} />
          <span>Cảnh báo kế toán</span>
          {allItems.length > 0 && (
            <span className={s.alertHeadCount}>· <strong style={{ color: 'var(--color-danger)' }}>{overdue}</strong> quá hạn · {dueSoon} sắp đến</span>
          )}
        </span>
        <div className={s.alertWithin}>
          {WITHIN_OPTS.map((d) => (
            <button key={d} className={`${s.alertWithinBtn} ${withinDays === d ? s.alertWithinActive : ''}`} onClick={() => setWithinDays(d)}>
              {d} ngày
            </button>
          ))}
        </div>
      </div>

      {/* Điều kiện cảnh báo (trả lời "điều kiện để đây là gì") */}
      <div className={s.alertInfo}>
        <Info size={13} />
        <span><strong>Hợp đồng / giấy phép</strong> còn hạn ≤ {withinDays} ngày hoặc đã quá hạn (theo ngày kết thúc) · <strong>Thuế</strong>: tờ khai “Chưa nộp – Trễ hạn” hoặc sắp đến hạn nộp trong {withinDays} ngày.</span>
      </div>

      {loading ? (
        <div className={s.chartLoading}><Loader2 size={20} className={s.spin} /></div>
      ) : allItems.length === 0 ? (
        <div className={s.chartEmpty}>
          <CheckCircle2 size={26} className={s.emptySuccessIcon} />
          Không có hợp đồng / giấy phép / thuế nào cần cảnh báo trong {withinDays} ngày 🎉
        </div>
      ) : (
        <>
          {/* Bộ lọc: loại · mức · tìm công ty */}
          <div className={s.alertFilters}>
            <div className={s.alertChips}>
              {KINDS.map((k) => (
                <button key={k.key} className={`${s.alertChip} ${kindF === k.key ? s.alertChipActive : ''}`} onClick={() => setKindF(k.key)}>
                  {k.label}<span className={s.alertChipN}>{kindCount(k.key)}</span>
                </button>
              ))}
            </div>
            <div className={s.alertChips}>
              {STATUSES.map((st2) => (
                <button key={st2.key} className={`${s.alertChip} ${statusF === st2.key ? s.alertChipActive : ''}`} onClick={() => setStatusF(st2.key)}>{st2.label}</button>
              ))}
            </div>
            <div className={s.alertSearch}>
              <Search size={13} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm công ty..." />
              {search && <button onClick={() => setSearch('')}><X size={12} /></button>}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className={s.chartEmpty} style={{ padding: '22px 12px' }}>Không có mục nào khớp bộ lọc.</div>
          ) : (
            <>
              <div className={s.alertList}>
                {displayed.map((it) => (
                  <AlertRow key={`${it.kind}-${it.id}`} it={it} getLabel={getLabel} onOpen={() => navigate(`/companies/${it.companyId}`)} />
                ))}
              </div>
              {filtered.length > VISIBLE && (
                <button className={s.alertMore} onClick={() => setExpanded((v) => !v)}>
                  {expanded ? 'Thu gọn' : `Xem thêm ${filtered.length - VISIBLE} mục`}
                  <ChevronDown size={13} style={{ transform: expanded ? 'rotate(180deg)' : 'none' }} />
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
