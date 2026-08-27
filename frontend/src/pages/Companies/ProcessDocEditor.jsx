import { useState, useEffect, useRef, useCallback } from 'react'
import { Pencil, Save, X, Loader2, Maximize2, Minimize2 } from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'
import { useDeleteConfirm } from '../../components/ui/DeleteConfirmDialog'
import RichTextEditor from '../../components/ui/RichTextEditor'
import RichTextView from '../../components/ui/RichTextView'
import * as api from '../../api/companyProcesses'
import './ProcessDocEditor.css'

// Tuỳ chọn cho dialog cảnh báo "bỏ thay đổi chưa lưu" (dùng chung useDeleteConfirm)
const DISCARD_CONFIRM = {
  title: 'Bỏ thay đổi chưa lưu?',
  message: 'Các thay đổi bạn vừa soạn sẽ bị mất nếu không lưu.',
  warning: null,
  confirmLabel: 'Bỏ thay đổi',
  cancelLabel: 'Tiếp tục soạn',
}

// Vỏ Quy trình: khung Xem/Sửa + toàn màn hình + Lưu/Huỷ + chống ghi đè (409).
// Lõi soạn thảo tái sử dụng component chung RichTextEditor / RichTextView.
export default function ProcessDocEditor({ companyId, process, canEdit, onSaved, onDirtyChange }) {
  const addToast = useToastStore((st) => st.toast)
  const confirmDiscard = useDeleteConfirm()
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [full, setFull] = useState(false)
  const [content, setContent] = useState(process.content || '')  // giá trị đang soạn
  const expectedRef = useRef(process.updatedAt)                   // mốc chống ghi đè

  const setDirtyBoth = useCallback((v) => { setDirty(v); onDirtyChange?.(v) }, [onDirtyChange])

  // Toàn màn hình: khoá cuộn nền + Esc để thoát
  useEffect(() => {
    if (!full) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape') setFull(false) }
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey) }
  }, [full])

  // Cảnh báo khi rời trang lúc còn thay đổi chưa lưu
  useEffect(() => {
    if (!dirty) return undefined
    const h = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  function handleChange(html) {
    setContent(html)
    if (!dirty) setDirtyBoth(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const updated = await api.updateProcess(companyId, process.id, {
        content, expectedUpdatedAt: expectedRef.current,
      })
      expectedRef.current = updated.updatedAt
      setDirtyBoth(false)
      setEditing(false)
      onSaved?.(updated)
      addToast('Đã lưu quy trình', 'success')
    } catch (err) {
      if (err.response?.status === 409) {
        addToast('Quy trình vừa được người khác cập nhật. Vui lòng tải lại trước khi lưu.', 'error')
      } else {
        addToast(err.response?.data?.error?.message ?? 'Không lưu được quy trình', 'error')
      }
    } finally { setSaving(false) }
  }

  async function handleCancel() {
    if (dirty && !(await confirmDiscard(DISCARD_CONFIRM))) return
    setContent(process.content || '')      // hoàn nguyên
    setDirtyBoth(false)
    setEditing(false)
  }

  const isEmpty = !content || !content.replace(/<[^>]*>/g, '').trim()

  return (
    <div className={`pde-wrap ${full ? 'pde-full' : ''}`}>
      {/* Thanh trên: trạng thái + toàn màn hình + Chỉnh sửa / Huỷ · Lưu (luôn thấy) */}
      <div className="pde-head">
        {editing && dirty
          ? <span className="pde-dirty">● Có thay đổi chưa lưu</span>
          : <span className="pde-headtitle">{process.name}</span>}
        <span className="pde-spacer" />
        <button className="pde-btn" onClick={() => setFull((v) => !v)} title={full ? 'Thu nhỏ' : 'Toàn màn hình'}>
          {full ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
        {!editing && canEdit && (
          <button className="pde-btn pde-active" style={{ height: 32, padding: '0 14px' }}
            onClick={() => setEditing(true)}><Pencil size={14} /> Chỉnh sửa</button>
        )}
        {editing && (
          <>
            <button className="pde-btn" style={{ border: '1px solid var(--color-border)', height: 32, padding: '0 14px' }}
              onClick={handleCancel} disabled={saving}><X size={14} /> Huỷ</button>
            <button className="pde-btn pde-active" style={{ height: 32, padding: '0 16px' }}
              onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={14} className="pde-spin" /> : <Save size={14} />} Lưu
            </button>
          </>
        )}
      </div>

      {editing ? (
        <RichTextEditor
          value={content}
          onChange={handleChange}
          editable
          companyId={companyId}
          minHeight={360}
          placeholder="Soạn nội dung quy trình… (có thể dán từ Word, Google Docs, hoặc dùng nút “Dán Markdown”)"
        />
      ) : (
        <div className="pde-viewscroll">
          {isEmpty
            ? <p style={{ color: 'var(--color-muted)', fontSize: 14, margin: 0 }}>
                {canEdit ? 'Chưa có nội dung. Nhấn “Chỉnh sửa” để soạn quy trình.' : 'Chưa có nội dung quy trình.'}
              </p>
            : <RichTextView html={content} />}
        </div>
      )}
    </div>
  )
}
