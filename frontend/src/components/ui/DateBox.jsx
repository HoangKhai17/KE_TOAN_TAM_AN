import { useRef, useState, useEffect } from 'react'
import { Calendar } from 'lucide-react'
import { fmtDate, parseDateInput } from '../../utils/dateFormat'
import s from './DateBox.module.css'

// Ô ngày "lai" DÙNG CHUNG TOÀN HỆ THỐNG: vừa GÕ TAY được (dd/mm/yyyy), vừa bấm
// icon lịch để chọn. Hiển thị luôn theo dd/mm/yyyy; giá trị lưu vẫn là YYYY-MM-DD.
//   value: 'YYYY-MM-DD' | '' | null
//   onChange(v): v = 'YYYY-MM-DD' | ''
//   className: lớp phủ tuỳ biến kích thước/vị trí (từ module CSS của trang dùng)
export default function DateBox({ value, onChange, className = '', placeholder = 'dd/mm/yyyy', disabled = false, min = '', max = '', block = false }) {
  const nativeRef = useRef(null)
  const iso = value ? String(value).slice(0, 10) : ''
  const [text, setText] = useState(iso ? fmtDate(iso) : '')
  const [focused, setFocused] = useState(false)
  const [invalid, setInvalid] = useState(false)

  // So YYYY-MM-DD bằng so chuỗi là đúng thứ tự thời gian.
  const outOfRange = (d) => d !== '' && ((min && d < min) || (max && d > max))

  // Đồng bộ khi value đổi từ ngoài (chỉ khi không đang gõ dở để tránh giật chữ).
  useEffect(() => {
    if (!focused) { setText(iso ? fmtDate(iso) : ''); setInvalid(false) }
  }, [iso, focused])

  // Chốt giá trị khi rời ô / Enter. Gõ sai / ngoài khoảng -> khôi phục giá trị cũ, không lưu.
  function commit(raw) {
    const parsed = parseDateInput(raw)
    if (parsed === null || outOfRange(parsed)) { setText(iso ? fmtDate(iso) : ''); setInvalid(false); return }
    setInvalid(false)
    setText(parsed ? fmtDate(parsed) : '')
    if (parsed !== iso) onChange(parsed)
  }

  return (
    <div className={`${s.dateBox} ${s.dateBoxHybrid} ${block ? s.block : ''} ${className} ${invalid ? s.dateBoxError : ''}`}>
      <input
        type="text"
        inputMode="numeric"
        className={s.dateBoxText}
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value
          setText(v)
          const p = parseDateInput(v)
          setInvalid(v.trim() !== '' && (p === null || outOfRange(p)))
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); commit(text) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(text); e.currentTarget.blur() }
          else if (e.key === 'Escape') { setText(iso ? fmtDate(iso) : ''); setInvalid(false); e.currentTarget.blur() }
        }}
      />
      <button
        type="button"
        className={s.dateBoxIconBtn}
        onClick={() => !disabled && nativeRef.current?.showPicker?.()}
        // giữ focus ở ô text để lịch mở mà không gây blur/commit sớm
        onMouseDown={(e) => e.preventDefault()}
        tabIndex={-1}
        aria-label="Chọn ngày từ lịch"
        disabled={disabled}
      >
        <Calendar size={13} className={s.dateBoxIcon} />
      </button>
      {/* input native ẩn — chỉ để mở lịch; chọn xong đổ ngược về YYYY-MM-DD */}
      <input
        ref={nativeRef}
        type="date"
        value={iso}
        min={min || undefined}
        max={max || undefined}
        onChange={(e) => onChange(e.target.value)}
        className={s.dateBoxNativeHidden}
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
      />
    </div>
  )
}
