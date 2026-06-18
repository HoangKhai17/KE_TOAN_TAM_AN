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

// Ma trận tiến độ theo (taskTypeId, month, year)
export async function getMatrix(params) {
  const { data } = await api.get('/progress-matrix', { params })
  return data.data
}

// Xuất Excel — trả về Blob + filename
export async function exportMatrix(params) {
  const res = await api.get('/progress-matrix/export', { params, responseType: 'blob' })
  const cd = res.headers['content-disposition'] || ''
  const m = /filename="?([^"]+)"?/i.exec(cd)
  return { blob: res.data, filename: m ? m[1] : 'bc-tien-do.xlsx' }
}
