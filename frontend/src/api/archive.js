import api from './axios'

// ── Years ─────────────────────────────────────────────────────────────────────

export async function listYears(companyId) {
  const { data } = await api.get(`/companies/${companyId}/archive/years`)
  return data.data.years
}

export async function createYear(companyId, body) {
  const { data } = await api.post(`/companies/${companyId}/archive/years`, body)
  return data.data.year
}

export async function updateYear(companyId, yearId, body) {
  const { data } = await api.patch(`/companies/${companyId}/archive/years/${yearId}`, body)
  return data.data.year
}

export async function deleteYear(companyId, yearId) {
  await api.delete(`/companies/${companyId}/archive/years/${yearId}`)
}

// ── Docs ──────────────────────────────────────────────────────────────────────

export async function listDocs(companyId, yearId, { page = 1, pageSize = 20 } = {}) {
  const { data } = await api.get(`/companies/${companyId}/archive/years/${yearId}/docs`, {
    params: { page, pageSize },
  })
  return data.data // { docs, total, page, pageSize }
}

export async function createDoc(companyId, yearId, body) {
  const { data } = await api.post(`/companies/${companyId}/archive/years/${yearId}/docs`, body)
  return data.data.doc
}

export async function updateDoc(companyId, yearId, docId, body) {
  const { data } = await api.patch(
    `/companies/${companyId}/archive/years/${yearId}/docs/${docId}`,
    body
  )
  return data.data.doc
}

export async function deleteDoc(companyId, yearId, docId) {
  await api.delete(`/companies/${companyId}/archive/years/${yearId}/docs/${docId}`)
}

export async function reorderDocs(companyId, yearId, items) {
  await api.patch(`/companies/${companyId}/archive/years/${yearId}/docs/reorder`, items)
}

// ── Columns ───────────────────────────────────────────────────────────────────

export async function listColumns(companyId) {
  const { data } = await api.get(`/companies/${companyId}/archive/columns`)
  return data.data.columns
}

export async function createColumn(companyId, body) {
  const { data } = await api.post(`/companies/${companyId}/archive/columns`, body)
  return data.data.column
}

export async function deleteColumn(companyId, colId) {
  await api.delete(`/companies/${companyId}/archive/columns/${colId}`)
}
