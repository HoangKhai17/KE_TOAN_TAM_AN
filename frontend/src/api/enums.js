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

// ── Nhóm lựa chọn (chỉ danh mục có hasGroups) ────────────────────────────────
export async function addEnumGroup(typeKey, groupKey, label) {
  const { data } = await api.post(`/enums/${typeKey}/groups`, { groupKey, label })
  return data.data.group
}

export async function updateEnumGroup(typeKey, groupKey, label) {
  const { data } = await api.patch(`/enums/${typeKey}/groups/${groupKey}`, { label })
  return data.data.group
}

export async function deleteEnumGroup(typeKey, groupKey) {
  await api.delete(`/enums/${typeKey}/groups/${groupKey}`)
}

// groupKey = null → bỏ lựa chọn khỏi nhóm
export async function setEnumOptionGroup(typeKey, optionKey, groupKey) {
  const { data } = await api.patch(`/enums/${typeKey}/options/${optionKey}/group`, { groupKey })
  return data.data.option
}
