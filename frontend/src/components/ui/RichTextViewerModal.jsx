import { Pencil } from 'lucide-react'
import Modal from './Modal'
import RichTextView from './RichTextView'

// Modal XEM đầy đủ nội dung rich-text (chỉ đọc), cuộn trong khung cố định để không
// tràn/overload trang. Nếu có quyền sửa → nút "Chỉnh sửa" mở trình soạn thảo.
export default function RichTextViewerModal({ title = 'Nội dung', html, onEdit, onClose }) {
  return (
    <Modal title={title} onClose={onClose} wide>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{
          maxHeight: '66vh', overflow: 'auto',
          border: '1px solid var(--color-border)', borderRadius: 8,
          padding: '14px 18px', background: 'var(--color-surface)',
        }}>
          <RichTextView html={html} />
        </div>
        {onEdit && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onEdit}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 16px',
                border: 'none', borderRadius: 8, background: 'var(--color-accent, #2563eb)', color: '#fff',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <Pencil size={14} /> Chỉnh sửa
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
