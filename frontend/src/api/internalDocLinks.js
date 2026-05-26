import api from './axios'

// ── Categories ────────────────────────────────────────────────────────────────

export async function listCategories() {
  const { data } = await api.get('/internal-doc-links/categories')
  return data.data.categories
}

export async function createCategory(body) {
  const { data } = await api.post('/internal-doc-links/categories', body)
  return data.data.category
}

export async function updateCategory(id, body) {
  const { data } = await api.patch(`/internal-doc-links/categories/${id}`, body)
  return data.data.category
}

export async function deleteCategory(id) {
  await api.delete(`/internal-doc-links/categories/${id}`)
}

// ── Links ─────────────────────────────────────────────────────────────────────

export async function listLinks(params = {}) {
  const { data } = await api.get('/internal-doc-links', { params })
  return data.data  // { items, pagination }
}

export async function createLink(body) {
  const { data } = await api.post('/internal-doc-links', body)
  return data.data.link
}

export async function updateLink(id, body) {
  const { data } = await api.patch(`/internal-doc-links/${id}`, body)
  return data.data.link
}

export async function deleteLink(id) {
  await api.delete(`/internal-doc-links/${id}`)
}
