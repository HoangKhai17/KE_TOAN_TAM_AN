import axios from 'axios'
import api from './axios'

// ─── Authenticated APIs ───────────────────────────────────────────────────────

export const getClientRequests = (params) =>
  api.get('/client-requests', { params }).then((r) => r.data.data)

export const getCdrColumnValues = (params = {}) =>
  api.get('/client-requests/meta/column-values', { params }).then((r) => r.data.data.values)


export const getClientRequest = (id) =>
  api.get(`/client-requests/${id}`).then((r) => r.data.data.item)

export const createClientRequest = (data) =>
  api.post('/client-requests', data).then((r) => r.data.data.item)

export const updateClientRequest = (id, data) =>
  api.patch(`/client-requests/${id}`, data).then((r) => r.data.data.item)

export const deleteClientRequest = (id) =>
  api.delete(`/client-requests/${id}`)

export const receiveClientRequest = (id) =>
  api.post(`/client-requests/${id}/receive`).then((r) => r.data.data.item)

export const unreceiveClientRequest = (id) =>
  api.post(`/client-requests/${id}/unreceive`).then((r) => r.data.data.item)

export const dismissClientRequest = (id) =>
  api.post(`/client-requests/${id}/dismiss`).then((r) => r.data.data.item)

export const setPriorityClientRequest = (id, priority) =>
  api.post(`/client-requests/${id}/priority`, { priority }).then((r) => r.data.data.item)

// ─── Bình luận ───────────────────────────────────────────────────────────────
export const getCdrComments = (id) =>
  api.get(`/client-requests/${id}/comments`).then((r) => r.data.data.comments)

export const addCdrComment = (id, data) =>
  api.post(`/client-requests/${id}/comments`, data).then((r) => r.data.data.comment)

export const updateCdrComment = (id, commentId, data) =>
  api.patch(`/client-requests/${id}/comments/${commentId}`, data).then((r) => r.data.data.comment)

export const deleteCdrComment = (id, commentId) =>
  api.delete(`/client-requests/${id}/comments/${commentId}`)

// ─── Checklist ───────────────────────────────────────────────────────────────
export const getCdrChecklist = (id) =>
  api.get(`/client-requests/${id}/checklist`).then((r) => r.data.data.items)

export const addCdrChecklistItem = (id, data) =>
  api.post(`/client-requests/${id}/checklist`, data).then((r) => r.data.data.item)

export const updateCdrChecklistItem = (id, itemId, data) =>
  api.patch(`/client-requests/${id}/checklist/${itemId}`, data).then((r) => r.data.data.item)

export const deleteCdrChecklistItem = (id, itemId) =>
  api.delete(`/client-requests/${id}/checklist/${itemId}`)

export const reorderCdrChecklist = (id, items) =>
  api.post(`/client-requests/${id}/checklist/reorder`, { items }).then((r) => r.data.data.items)

export const sendReminder = (id, data) =>
  api.post(`/client-requests/${id}/remind`, data).then((r) => r.data.data.item)

export const generateLink = (id, data) =>
  api.post(`/client-requests/${id}/generate-link`, data).then((r) => r.data.data)

export const revokeLink = (id) =>
  api.post(`/client-requests/${id}/revoke-link`).then((r) => r.data)

export const manualSubmit = (id, data) =>
  api.post(`/client-requests/${id}/manual-submit`, data).then((r) => r.data.data.item)

export const getCdrYears = () =>
  api.get('/client-requests/meta/years').then((r) => r.data.data.years)

export const getCdrStats = (params) =>
  api.get('/client-requests/stats', { params }).then((r) => r.data.data)

export const getAdminOverview = (params) =>
  api.get('/admin/client-requests/overview', { params }).then((r) => r.data.data)

// ─── Public APIs (no Authorization header) ───────────────────────────────────

const publicApi = axios.create({
  baseURL: '/api/public',
  headers: { 'Content-Type': 'application/json' },
})

export const getPublicForm = (token) =>
  publicApi.get(`/client-forms/${token}`).then((r) => r.data.data.form)

export const submitPublicForm = (token, data) =>
  publicApi.post(`/client-forms/${token}/submit`, data).then((r) => r.data.data)
