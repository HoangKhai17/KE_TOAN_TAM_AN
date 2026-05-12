import api from './axios'

export async function getSchedulerStatus() {
  const { data } = await api.get('/admin/scheduler/status')
  return data.data.scheduler
}

export async function runSchedulerNow() {
  const { data } = await api.post('/admin/scheduler/run-now')
  return data.data.result
}

export async function getSchedulerLogs(limit = 30) {
  const { data } = await api.get('/admin/scheduler/logs', { params: { limit } })
  return data.data.logs
}

export async function updateSchedulerConfig(config) {
  const { data } = await api.patch('/admin/scheduler/config', config)
  return data.data
}

export async function deleteSchedulerLog(id) {
  await api.delete(`/admin/scheduler/logs/${id}`)
}

export async function clearSchedulerLogs() {
  await api.delete('/admin/scheduler/logs')
}
