import api from './axios'

export async function listConfigs() {
  const { data } = await api.get('/system-configs')
  return data.data.configs  // [{ id, key, value, description, updatedBy, updatedAt }]
}

export async function updateConfig(key, value) {
  const { data } = await api.patch(`/system-configs/${key}`, { value })
  return data.data.config
}

// Cờ public (mọi user đọc được) — vd công tắc "Cách lấy". Trả object { key: value }
export async function getPublicConfigs() {
  const { data } = await api.get('/system-configs/public')
  return data.data.configs
}
