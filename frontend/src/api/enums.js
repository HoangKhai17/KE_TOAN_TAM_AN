import api from './axios'

export async function fetchAllEnums() {
  const { data } = await api.get('/enums')
  return data.data.enums
}

export async function updateEnumOptionLabel(typeKey, optionKey, label) {
  const { data } = await api.patch(`/enums/${typeKey}/options/${optionKey}`, { label })
  return data.data.option
}

export async function addEnumOption(typeKey, optionKey, label) {
  const { data } = await api.post(`/enums/${typeKey}/options`, { optionKey, label })
  return data.data.option
}

export async function toggleEnumOption(typeKey, optionKey) {
  const { data } = await api.post(`/enums/${typeKey}/options/${optionKey}/toggle`)
  return data.data.option
}

// Xóa 1 mục danh mục (chỉ khi chưa được dùng — backend chặn 409 nếu đang dùng)
export async function deleteEnumOption(typeKey, optionKey) {
  await api.delete(`/enums/${typeKey}/options/${optionKey}`)
}
