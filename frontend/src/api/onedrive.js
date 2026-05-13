import api from './axios'

export async function getStatus() {
  const { data } = await api.get('/admin/onedrive/status')
  return data.data  // { connected, driveId }
}

export async function getAuthUrl() {
  const { data } = await api.get('/admin/onedrive/auth-url')
  return data.data.url
}

export async function exchangeCode(code) {
  const { data } = await api.post('/admin/onedrive/exchange', { code })
  return data.data  // { driveId, driveName, quota }
}

export async function disconnect() {
  await api.post('/admin/onedrive/disconnect')
}
