import api from './axios'

export async function getSchedulerStatus() {
  const { data } = await api.get('/admin/scheduler/status')
  return data.data.scheduler
}

export async function runSchedulerNow() {
  const { data } = await api.post('/admin/scheduler/run-now')
  return data.data.result
}
