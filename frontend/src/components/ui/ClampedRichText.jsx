import { useState, useEffect, useRef } from 'react'
import RichTextView from './RichTextView'

// Hiển thị nội dung rich-text GỌN trong một khung cao cố định. Nếu tràn khung → hiện
// nút "Xem thêm" để mở modal xem đầy đủ (không xổ dài inline gây phình bảng).
export default function ClampedRichText({ html, maxHeight = 96, onExpand }) {
  const innerRef = useRef(null)
  const [overflow, setOverflow] = useState(false)

  useEffect(() => {
    const el = innerRef.current
    if (!el) return undefined
    const check = () => setOverflow(el.scrollHeight > maxHeight + 4)
    check()
    // Ảnh tải xong / nội dung đổi kích thước → đo lại
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [html, maxHeight])

  return (
    <div>
      <div style={{ maxHeight, overflow: 'hidden' }}>
        <div ref={innerRef}>
          <RichTextView html={html} />
        </div>
      </div>
      {overflow && onExpand && (
        <button
          type="button"
          onClick={onExpand}
          style={{
            marginTop: 4, padding: 0, background: 'none', border: 'none',
            color: 'var(--color-accent, #2563eb)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Xem thêm →
        </button>
      )}
    </div>
  )
}
