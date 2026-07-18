import api from './axios'

// Sơ đồ quy trình làm việc theo từng công ty

export async function listProcesses(companyId) {
  const { data } = await api.get(`/companies/${companyId}/processes`)
  return data.data.processes
}

export async function createProcess(companyId, body) {
  const { data } = await api.post(`/companies/${companyId}/processes`, body)
  return data.data.process
}

export async function updateProcess(companyId, processId, body) {
  const { data } = await api.patch(`/companies/${companyId}/processes/${processId}`, body)
  return data.data.process
}

export async function deleteProcess(companyId, processId) {
  await api.delete(`/companies/${companyId}/processes/${processId}`)
}

export async function getGraph(companyId, processId) {
  const { data } = await api.get(`/companies/${companyId}/processes/${processId}/graph`)
  return data.data   // { process, nodes, edges }
}

// Lưu TOÀN BỘ sơ đồ (nút + cạnh) trong 1 lần
export async function saveGraph(companyId, processId, body) {
  const { data } = await api.put(`/companies/${companyId}/processes/${processId}/graph`, body)
  return data.data
}
