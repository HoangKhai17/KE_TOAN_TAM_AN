import { useState, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import s from './tasks.module.css'
import { fmtDate, resolvePeriodRange, periodRangeLabel } from './taskUtils'

// Gộp Năm + Tháng (+ tuỳ chọn Từ ngày / Đến ngày) vào MỘT control "Kỳ".
// Dùng chung cho trang Công việc và tab Công việc trong hồ sơ công ty để hai
// nơi lọc theo kỳ giống hệt nhau — trước đây tab công ty có 2 ô select rời,
// vừa chiếm chỗ vừa lệch thói quen so với trang Công việc.
//
// Chỉ bọc phần giao diện: vẫn đẩy xuống đúng các state cũ nên logic truy vấn và
// backend không đổi. Bỏ qua onFrom/onTo thì phần khoảng ngày tự ẩn.

// Ô ngày: hiện dd/mm/yyyy, giấu input ngày gốc của trình duyệt phía sau.
// Chưa nhập gì thì hiện luôn ngày suy ra từ Năm/Tháng (mờ) — nhờ vậy chọn
// "Tháng 7" là thấy ngay đang lọc 01/07 → 31/07, không cần ghi thêm ở đâu nữa.
export function FilterDateField({ value, onChange, placeholder }) {
  const ref = useRef(null)
  return (
    <div className={s.filterDateField} onClick={() => ref.current?.showPicker?.()}>
      <span className={value ? s.filterDateFieldText : `${s.filterDateFieldText} ${s.filterDateFieldPlaceholder}`}>
        {value ? fmtDate(value) : (placeholder ? fmtDate(placeholder) : 'dd/mm/yyyy')}
      </span>
      <input
        ref={ref}
        type="date"
        value={value}
        onChange={onChange}
        tabIndex={-1}
        className={s.filterDateFieldInput}
      />
    </div>
  )
}

export default function PeriodPicker({
  year, month, from, to, availableYears, disabled,
  onYear, onMonth, onFrom, onTo, onPreset,
  disabledTitle,
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const withRange = typeof onFrom === 'function' && typeof onTo === 'function'

  useEffect(() => {
    if (!open) return undefined
    function onOutside(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  // Khoảng ngày THẬT đang lọc — "T7/2026" không cho biết lấy từ ngày nào tới
  // ngày nào, nên luôn quy đổi ra ngày cụ thể để hiển thị kèm.
  const range      = resolvePeriodRange({ year, month, from, to })
  const rangeLabel = periodRangeLabel(range)
  const isCustom   = withRange && !!(from || to)

  let label = 'Tất cả thời gian'
  if (disabled)           label = disabledTitle ?? 'Không áp dụng'
  else if (isCustom)      label = rangeLabel
  else if (month && year) label = `T${month}/${year}`
  else if (year)          label = `Năm ${year}`

  const PRESETS = [['Tháng này', 'tm'], ['Tháng trước', 'lm'], ['Năm nay', 'ty'], ['Tất cả', 'all']]
  const hasValue = !!(month || year || isCustom)

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div
        className={`${s.cpTrigger} ${s.companyPickerTriggerCompact}`}
        onClick={() => !disabled && setOpen((o) => !o)}
        style={disabled ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
        title={disabled ? disabledTitle : undefined}
      >
        <span
          className={`${s.cpTriggerText} ${hasValue ? s.companyPickerSelected : s.companyPickerPlaceholder}`}
          title={disabled ? undefined : `Lọc theo hạn: ${rangeLabel}`}
        >
          {label}
        </span>
        <ChevronDown size={11} className={`${s.iconMuted} ${s.chevronRotate} ${open ? s.chevronOpen : ''}`} />
      </div>

      {open && !disabled && (
        <div className={s.cpDropdown} style={{ width: 300, padding: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {PRESETS.map(([lbl, key]) => (
              <button
                key={key}
                type="button"
                className={s.filterToggle}
                style={{ height: 28, fontSize: 12, padding: '0 10px' }}
                onClick={() => { onPreset(key); setOpen(false) }}
              >
                {lbl}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: withRange ? 8 : 0 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className={s.filterLabel}>Năm</label>
              <select value={year} onChange={(e) => onYear(e.target.value)} className={s.filterSelect}>
                <option value="">Tất cả năm</option>
                {availableYears.map((y) => <option key={y} value={String(y)}>Năm {y}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className={s.filterLabel}>Tháng</label>
              <select value={month} onChange={(e) => onMonth(e.target.value)} className={s.filterSelect} disabled={!year}>
                <option value="">Cả năm</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={String(m)}>Tháng {m}</option>)}
              </select>
            </div>
          </div>

          {withRange && (
            <>
              <div style={{ fontSize: 11, color: 'var(--color-muted)', margin: '6px 0 4px' }}>Hoặc khoảng ngày tùy chọn:</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <FilterDateField value={from} onChange={onFrom} placeholder={range.from} />
                <span style={{ color: 'var(--color-muted)' }}>–</span>
                <FilterDateField value={to} onChange={onTo} placeholder={range.to} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
