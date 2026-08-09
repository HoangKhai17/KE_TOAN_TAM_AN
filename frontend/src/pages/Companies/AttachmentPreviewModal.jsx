import { useEffect, useState } from 'react'
import { Download, FileText, Loader2, X } from 'lucide-react'
import * as attachmentsApi from '../../api/attachments'
import s from './companies.module.css'

// Viewer dùng chung cho tab Tài liệu và các popup file đính kèm.
// Trình duyệt xem trực tiếp PDF/ảnh; định dạng khác hướng dẫn tải xuống.
export default function AttachmentPreviewModal({ file, title, onClose }) {
  const [url, setUrl] = useState(null)
  const [error, setError] = useState(false)
  const canPreview = attachmentsApi.canPreview(file?.mimeType)
  const isImage = (file?.mimeType || '').startsWith('image/')
  const displayTitle = title || file?.fileName || 'Tệp đính kèm'

  useEffect(() => {
    if (!file?.id || !canPreview) return undefined
    let objectUrl
    let alive = true
    attachmentsApi.getFileBlobUrl(file.id)
      .then((nextUrl) => {
        if (!alive) return
        objectUrl = nextUrl
        setUrl(nextUrl)
      })
      .catch(() => { if (alive) setError(true) })
    return () => {
      alive = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [file?.id, canPreview])

  useEffect(() => {
    const handleKey = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className={s.docModalOverlay} onClick={onClose}>
      <div className={s.docPreviewDialog} onClick={(event) => event.stopPropagation()}>
        <div className={s.docPreviewHead}>
          <span className={s.docPreviewTitle}><FileText size={14} /> {displayTitle}</span>
          <div className={s.docPreviewHeadBtns}>
            <button className={s.docActionBtn} title="Tải xuống" onClick={() => attachmentsApi.downloadFile(file.id, file.fileName)}>
              <Download size={14} />
            </button>
            <button className={s.docActionBtn} title="Đóng (Esc)" onClick={onClose}>
              <X size={14} />
            </button>
          </div>
        </div>
        <div className={s.docPreviewBody}>
          {!canPreview || error ? (
            <div className={s.docPreviewMsg}>Không xem trước được tệp này. Hãy tải xuống để mở.</div>
          ) : !url ? (
            <div className={s.docPreviewMsg}><Loader2 size={20} className={s.spin} /></div>
          ) : isImage ? (
            <img src={url} alt={displayTitle} className={s.docPreviewImg} />
          ) : (
            <iframe src={url} title={displayTitle} className={s.docPreviewFrame} />
          )}
        </div>
      </div>
    </div>
  )
}
