import api from './axios'

// Ghi chú nhanh cá nhân — backend tự scope theo user đang đăng nhập.
export const listQuickNotes  = ()           => api.get('/quick-notes').then((r) => r.data.data.notes)
export const createQuickNote = (content)     => api.post('/quick-notes', { content }).then((r) => r.data.data.note)
export const updateQuickNote = (id, content) => api.patch(`/quick-notes/${id}`, { content }).then((r) => r.data.data.note)
export const deleteQuickNote = (id)          => api.delete(`/quick-notes/${id}`).then(() => true)
