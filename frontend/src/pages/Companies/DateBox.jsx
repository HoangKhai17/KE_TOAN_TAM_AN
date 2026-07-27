import { useRef } from 'react'
import { Calendar } from 'lucide-react'
import { fmtDate } from './companyUtils'
import s from './companies.module.css'

// Ô chọn ngày hiển thị LUÔN theo dd/mm/yyyy (không phụ thuộc locale trình duyệt).
// Bên trong là <input type="date"> ẩn để mở lịch native; giá trị vẫn là YYYY-MM-DD.
//   value: 'YYYY-MM-DD' | '' | null
//   onChange(v): v = 'YYYY-MM-DD' | ''
export default function DateBox({ value, onChange, className = '', placeholder = 'dd/mm/yyyy' }) {
  const ref = useRef(null)
  const dateStr = value ? String(value).slice(0, 10) : ''
  return (
    <div
      className={`${s.dateBox} ${className}`}
      onClick={() => ref.current?.showPicker?.()}
      role="button"
      tabIndex={0}
    >
      <span className={dateStr ? '' : s.dateBoxPlaceholder}>
        {dateStr ? fmtDate(dateStr) : placeholder}
      </span>
      <Calendar size={13} className={s.dateBoxIcon} />
      <input
        ref={ref}
        type="date"
        value={dateStr}
        onChange={(e) => onChange(e.target.value)}
        className={s.dateBoxNative}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  )
}
