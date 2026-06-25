import api from './axios'

export const getBackupOverview  = () => api.get('/admin/backup').then((r) => r.data.data)
export const runBackup          = () => api.post('/admin/backup/run', {}, { timeout: 120000 }).then((r) => r.data.data)
export const updateBackupConfig = (patch) => api.patch('/admin/backup/config', patch).then((r) => r.data.data.config)
export const deleteBackup       = (name) => api.delete(`/admin/backup/${encodeURIComponent(name)}`).then(() => true)

export async function downloadBackup(name) {
  const res = await api.get(`/admin/backup/${encodeURIComponent(name)}/download`, { responseType: 'blob', timeout: 120000 })
  const url = window.URL.createObjectURL(new Blob([res.data]))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', name)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
