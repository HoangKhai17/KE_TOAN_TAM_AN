import api from './axios'

// Danh sách quy trình (task_type) cho dropdown
export async function getTaskTypes() {
  const { data } = await api.get('/progress-matrix/task-types')
  return data.data.taskTypes
}

// Các năm có dữ liệu (cho dropdown)
export async function getYears() {
  const { data } = await api.get('/progress-matrix/years')
  return data.data.years
}

// Ma trận tiến độ theo quy trình (taskTypeId, month, year)
export async function getMatrix(params) {
  const { data } = await api.get('/progress-matrix', { params })
  return data.data
}

// Bảng tiến độ theo công ty
export async function getByCompany(params) {
  const { data } = await api.get('/progress-matrix/by-company', { params })
  return data.data
}

// Bảng tiến độ theo nhân viên
export async function getByStaff(params) {
  const { data } = await api.get('/progress-matrix/by-staff', { params })
  return data.data
}

// Xuất Excel (POST) — body: { view, taskTypeId|companyId|staffId, month, year, columns } → Blob
export async function exportReport(body) {
  const res = await api.post('/progress-matrix/export', body, { responseType: 'blob' })
  const cd = res.headers['content-disposition'] || ''
  const m = /filename="?([^"]+)"?/i.exec(cd)
  return { blob: res.data, filename: m ? m[1] : 'bc-tien-do.xlsx' }
}
