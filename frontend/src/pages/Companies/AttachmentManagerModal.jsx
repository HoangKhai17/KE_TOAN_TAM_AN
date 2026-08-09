import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Eye, Loader2, Paperclip, Trash2, Upload } from 'lucide-react'
import * as attachmentsApi from '../../api/attachments'
import Modal from '../../components/ui/Modal'
import { useToastStore } from '../../stores/toastStore'
import AttachmentPreviewModal from './AttachmentPreviewModal'
import s from './companies.module.css'

export default function AttachmentManagerModal({ module, entityId, title, canEdit, onClose, onChanged }) {
  const addToast = useToastStore((state) => state.toast)
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [previewFile, setPreviewFile] = useState(null)
  const fileRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const nextFiles = await attachmentsApi.listFiles(module, entityId)
      setFiles(nextFiles)
      return nextFiles
    } catch {
      addToast('Không tải được danh sách file', 'error')
      return null
    } finally {
      setLoading(false)
    }
  }, [module, entityId, addToast])

  useEffect(() => { load() }, [load])

  async function handlePick(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > attachmentsApi.MAX_FILE_BYTES) {
      addToast(`File quá lớn (tối đa ${attachmentsApi.formatSize(attachmentsApi.MAX_FILE_BYTES)})`, 'error')
      return
    }
    setUploading(true)
    try {
      await attachmentsApi.uploadFile(module, entityId, file)
      addToast('Đã tải file lên', 'success')
      const nextFiles = await load()
      onChanged?.(nextFiles?.length ?? 0)
    } catch (error) {
      addToast(error.response?.data?.error?.message ?? 'Tải file thất bại', 'error')
    } finally {
      setUploading(false)
    }
  }

  async function remove(file) {
    try {
      await attachmentsApi.deleteFile(file.id)
      addToast('Đã xoá file', 'success')
      const nextFiles = await load()
      onChanged?.(nextFiles?.length ?? 0)
    } catch (error) {
      addToast(error.response?.data?.error?.message ?? 'Không xoá được file', 'error')
    }
  }

  return (
    <>
      <Modal title={title} onClose={onClose} width="min(920px, calc(100vw - 40px))" maxWidth="920px">
        <div className={s.attachmentManagerBody}>
          {loading ? (
            <div className={s.locFileEmpty}><Loader2 size={16} className={s.spin} /> Đang tải…</div>
          ) : files.length === 0 ? (
            <div className={s.locFileEmpty}>Chưa có file đính kèm.</div>
          ) : (
            <div className={s.locFileList}>
              {files.map((file) => (
                <div key={file.id} className={s.locFileRow}>
                  <Paperclip size={14} className={s.locMuted} />
                  <span className={s.locFileName} title={file.fileName}>{file.fileName}</span>
                  <span className={s.locFileSize}>{attachmentsApi.formatSize(file.sizeBytes)}</span>
                  {attachmentsApi.canPreview(file.mimeType) && (
                    <button className={s.locFileIconBtn} title="Xem trước" onClick={() => setPreviewFile(file)}>
                      <Eye size={14} />
                    </button>
                  )}
                  <button className={s.locFileIconBtn} title="Tải xuống" onClick={() => attachmentsApi.downloadFile(file.id, file.fileName)}>
                    <Download size={14} />
                  </button>
                  {canEdit && (
                    <button className={`${s.locFileIconBtn} ${s.locFileIconDanger}`} title="Xoá" onClick={() => remove(file)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {canEdit && (
            <div className={s.attachmentManagerFooter}>
              <input ref={fileRef} type="file" accept={attachmentsApi.ACCEPT_ATTR} className={s.hiddenInput} onChange={handlePick} />
              <button className={s.locFileBtn} onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 size={13} className={s.spin} /> : <Upload size={13} />}
                {uploading ? 'Đang tải lên…' : 'Tải file lên'}
              </button>
            </div>
          )}
        </div>
      </Modal>
      {previewFile && (
        <AttachmentPreviewModal file={previewFile} title={previewFile.fileName} onClose={() => setPreviewFile(null)} />
      )}
    </>
  )
}
