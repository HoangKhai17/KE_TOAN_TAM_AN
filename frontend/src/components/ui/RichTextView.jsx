import { useEffect, useMemo, useRef } from 'react'
import DOMPurify from 'dompurify'
import { getFileBlobUrl } from '../../api/attachments'
import './RichTextEditor.css'

// Hiển thị chỉ-đọc nội dung rich-text (NHẸ — không kéo theo TipTap).
// Sanitize chống XSS + tự nạp ảnh attachments (thẻ có data-att-id nhưng chưa có src).
export default function RichTextView({ html, className = '' }) {
  const ref = useRef(null)
  const clean = useMemo(() => {
    const src = html || ''
    const isHtml = /<[a-z][\s\S]*>/i.test(src)
    const norm = isHtml ? src : `<p>${src.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`
    return DOMPurify.sanitize(norm, { ADD_ATTR: ['data-att-id', 'target'] })
  }, [html])

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const imgs = el.querySelectorAll('img[data-att-id]')
    const created = []
    let alive = true
    imgs.forEach((img) => {
      const id = img.getAttribute('data-att-id')
      if (!id) return
      getFileBlobUrl(id)
        .then((u) => { if (alive) { created.push(u); img.src = u } else URL.revokeObjectURL(u) })
        .catch(() => {})
    })
    return () => { alive = false; created.forEach((u) => URL.revokeObjectURL(u)) }
  }, [clean])

  return <div ref={ref} className={`rte-doc rte-view ${className}`} dangerouslySetInnerHTML={{ __html: clean }} />
}
