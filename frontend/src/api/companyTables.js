import api from './axios'

// ── Defs + global columns (admin write, any read) ─────────────────────────────
export async function listDefs(params = {}) {
  const { data } = await api.get('/company-tables/defs', { params })
  return data.data.defs
}
export async function getDef(id) {
  const { data } = await api.get(`/company-tables/defs/${id}`)
  return data.data.def
}
export async function createDef(body) {
  const { data } = await api.post('/company-tables/defs', body)
  return data.data.def
}
export async function updateDef(id, body) {
  const { data } = await api.patch(`/company-tables/defs/${id}`, body)
  return data.data.def
}
export async function deleteDef(id) {
  await api.delete(`/company-tables/defs/${id}`)
}
export async function addColumn(defId, body) {
  const { data } = await api.post(`/company-tables/defs/${defId}/columns`, body)
  return data.data.column
}
export async function updateColumn(colId, body) {
  const { data } = await api.patch(`/company-tables/columns/${colId}`, body)
  return data.data.column
}
export async function deleteColumn(colId) {
  await api.delete(`/company-tables/columns/${colId}`)
}
export async function reorderColumns(defId, orderedIds) {
  const { data } = await api.patch(`/company-tables/defs/${defId}/columns/reorder`, { orderedIds })
  return data.data.def
}

// ── Rows (per-company) ────────────────────────────────────────────────────────
export async function listRows(companyId, defId) {
  const { data } = await api.get(`/companies/${companyId}/tables/${defId}/rows`)
  return data.data.rows
}
export async function createRow(companyId, defId, rowData) {
  const { data } = await api.post(`/companies/${companyId}/tables/${defId}/rows`, { data: rowData })
  return data.data.row
}
export async function updateRow(companyId, defId, rowId, rowData) {
  const { data } = await api.patch(`/companies/${companyId}/tables/${defId}/rows/${rowId}`, { data: rowData })
  return data.data.row
}
export async function deleteRow(companyId, defId, rowId) {
  await api.delete(`/companies/${companyId}/tables/${defId}/rows/${rowId}`)
}
export async function batchCreateRows(companyId, defId, rows) {
  const { data } = await api.post(`/companies/${companyId}/tables/${defId}/rows/batch`, { rows })
  return data.data  // { inserted, failed, errors }
}
export async function upsertRows(companyId, defId, matchKey, rows) {
  const { data } = await api.post(`/companies/${companyId}/tables/${defId}/rows/upsert`, { matchKey, rows })
  return data.data  // { inserted, updated, failed, errors }
}

// ── Per-company columns (hybrid) ──────────────────────────────────────────────
export async function listCompanyColumns(companyId, defId) {
  const { data } = await api.get(`/companies/${companyId}/tables/${defId}/company-columns`)
  return data.data.columns
}
export async function addCompanyColumn(companyId, defId, body) {
  const { data } = await api.post(`/companies/${companyId}/tables/${defId}/company-columns`, body)
  return data.data.column
}
export async function deleteCompanyColumn(companyId, defId, colId) {
  await api.delete(`/companies/${companyId}/tables/${defId}/company-columns/${colId}`)
}
