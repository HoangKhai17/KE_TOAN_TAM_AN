import api from './axios'

// Quy trình làm việc theo từng công ty — mỗi quy trình là MỘT TÀI LIỆU rich-text.

export async function listProcesses(companyId) {
  const { data } = await api.get(`/companies/${companyId}/processes`)
  return data.data.processes
}

// Lấy 1 quy trình KÈM nội dung (content HTML) cho trình soạn thảo
export async function getProcess(companyId, processId) {
  const { data } = await api.get(`/companies/${companyId}/processes/${processId}`)
  return data.data.process
}

export async function createProcess(companyId, body) {
  const { data } = await api.post(`/companies/${companyId}/processes`, body)
  return data.data.process
}

// Cập nhật tên/mô tả/thứ tự HOẶC nội dung tài liệu (kèm expectedUpdatedAt chống ghi đè)
export async function updateProcess(companyId, processId, body) {
  const { data } = await api.patch(`/companies/${companyId}/processes/${processId}`, body)
  return data.data.process
}

export async function deleteProcess(companyId, processId) {
  await api.delete(`/companies/${companyId}/processes/${processId}`)
}
