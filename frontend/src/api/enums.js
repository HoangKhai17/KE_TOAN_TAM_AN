import api from './axios'

export async function fetchAllEnums() {
  const { data } = await api.get('/enums')
  return data.data.enums
}

export async function updateEnumOptionLabel(typeKey, optionKey, label) {
  const { data } = await api.patch(`/enums/${typeKey}/options/${optionKey}`, { label })
  return data.data.option
}
