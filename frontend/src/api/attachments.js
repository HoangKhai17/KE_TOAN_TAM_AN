import api from './axios'

// ── File đính kèm DÙNG CHUNG ──────────────────────────────────────────────────
// module: 'internal_doc' (hiện tại) · sau này 'task', 'company'… — không cần đổi file này.

export const MAX_FILE_BYTES = 5 * 1024 * 1024
export const ALLOWED_EXTS = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'csv', 'txt', 'png', 'jpg', 'jpeg', 'webp', 'zip', 'rar',
]
export const ACCEPT_ATTR = ALLOWED_EXTS.map((e) => `.${e}`).join(',')

export function formatSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export async function listFiles(module, entityId) {
  const { data } = await api.get(`/attachments/${module}/${entityId}`)
  return data.data.files
}

// onProgress(percent) — tuỳ chọn, để hiện thanh tiến trình
export async function uploadFile(module, entityId, file, { title, description, onProgress } = {}) {
  const fd = new FormData()
  fd.append('file', file)
  if (title) fd.append('title', title)
  if (description) fd.append('description', description)

  const { data } = await api.post(`/attachments/${module}/${entityId}`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total))
    },
  })
  return data.data.file
}

// Tải xuống qua backend (có kiểm tra đăng nhập) → không lộ file ra ngoài
export async function downloadFile(id, fileName) {
  const res = await api.get(`/attachments/download/${id}`, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName || 'download'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function deleteFile(id) {
  await api.delete(`/attachments/${id}`)
}
