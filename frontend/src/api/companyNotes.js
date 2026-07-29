import api from './axios'

export async function listNotes(companyId) {
  const { data } = await api.get(`/companies/${companyId}/important-notes`)
  return data.data.notes
}

export async function createNote(companyId, body) {
  const { data } = await api.post(`/companies/${companyId}/important-notes`, body)
  return data.data.note
}

export async function updateNote(companyId, id, body) {
  const { data } = await api.patch(`/companies/${companyId}/important-notes/${id}`, body)
  return data.data.note
}

export async function deleteNote(companyId, id) {
  await api.delete(`/companies/${companyId}/important-notes/${id}`)
}
