import axios from 'axios'
import api from './axios'

// ─── Authenticated APIs ───────────────────────────────────────────────────────

export const getClientRequests = (params) =>
  api.get('/client-requests', { params }).then((r) => r.data.data)

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

export const sendReminder = (id, data) =>
  api.post(`/client-requests/${id}/remind`, data).then((r) => r.data.data.item)

export const generateLink = (id, data) =>
  api.post(`/client-requests/${id}/generate-link`, data).then((r) => r.data.data)

export const revokeLink = (id) =>
  api.post(`/client-requests/${id}/revoke-link`).then((r) => r.data)

export const manualSubmit = (id, data) =>
  api.post(`/client-requests/${id}/manual-submit`, data).then((r) => r.data.data.item)

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
