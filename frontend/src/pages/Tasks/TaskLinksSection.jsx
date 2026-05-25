import { useState, useEffect } from 'react'
import { Plus, Link2, ExternalLink, Trash2, Loader2, Check } from 'lucide-react'
import * as tasksApi from '../../api/tasks'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import s from './tasks.module.css'

export default function TaskLinksSection({ taskId, compact = false }) {
  const addToast    = useToastStore((st) => st.toast)
  const currentUser = useAuthStore((st) => st.user)
  const isAdmin     = currentUser?.role === 'admin'

  const [links,       setLinks]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [form,        setForm]        = useState({ name: '', url: '', description: '' })
  const [saving,      setSaving]      = useState(false)
  const [err,         setErr]         = useState('')
  const [deletingId,  setDeletingId]  = useState(null)

  useEffect(() => {
    tasksApi.getTaskLinks(taskId)
      .then(setLinks)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [taskId])

  function setF(k, v) { setForm((p) => ({ ...p, [k]: v })); setErr('') }

  function resetForm() {
    setForm({ name: '', url: '', description: '' })
    setErr('')
    setShowForm(false)
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!form.name.trim()) { setErr('Vui lòng nhập tên link'); return }
    if (!form.url.trim())  { setErr('Vui lòng nhập URL'); return }
    try { new URL(form.url.trim()) } catch {
      setErr('URL không hợp lệ (cần bắt đầu bằng https://)'); return
    }
    setSaving(true)
    try {
      const link = await tasksApi.addTaskLink(taskId, {
        name:        form.name.trim(),
        url:         form.url.trim(),
        description: form.description.trim() || null,
      })
      setLinks((prev) => [...prev, link])
      resetForm()
      addToast('Đã thêm link đính kèm', 'success')
    } catch (e) {
      setErr(e.response?.data?.error?.message ?? 'Không thể thêm link')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(linkId) {
    setDeletingId(linkId)
    try {
      await tasksApi.deleteTaskLink(taskId, linkId)
      setLinks((prev) => prev.filter((l) => l.id !== linkId))
      addToast('Đã xóa link', 'success')
    } catch {
      addToast('Không thể xóa link', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) return null

  return (
    <div className={s.tlSection}>
      <div className={s.tlHeader}>
        <span className={s.tlTitle}>
          <Link2 size={11} />
          Link đính kèm
          {links.length > 0 && (
            <span className={s.tlCount}>{links.length}</span>
          )}
        </span>
        {!showForm && (
          <button className={s.tlAddBtn} onClick={() => setShowForm(true)}>
            <Plus size={12} /> Thêm
          </button>
        )}
      </div>

      {links.length > 0 && (
        <div className={s.tlList}>
          {links.map((link) => (
            <div key={link.id} className={s.tlItem}>
              <div className={s.tlItemIcon}><Link2 size={13} /></div>
              <div className={s.tlItemBody}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={s.tlItemName}
                >
                  {link.name}
                  <ExternalLink size={10} />
                </a>
                <span className={s.tlItemUrl}>{link.url}</span>
                {link.description && (
                  <span className={s.tlItemDesc}>{link.description}</span>
                )}
              </div>
              {(link.createdBy === currentUser?.id || isAdmin) && (
                <button
                  className={s.tlDelBtn}
                  onClick={() => handleDelete(link.id)}
                  disabled={deletingId === link.id}
                  title="Xóa link"
                >
                  {deletingId === link.id
                    ? <Loader2 size={12} className={s.spinIcon} />
                    : <Trash2 size={12} />
                  }
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {links.length === 0 && !showForm && (
        <p className={s.tlEmpty}>Chưa có link đính kèm nào.</p>
      )}

      {showForm && (
        <form onSubmit={handleAdd} className={s.tlAddForm}>
          {err && <div className={s.tlErr}>{err}</div>}
          <input
            type="text"
            value={form.name}
            onChange={(e) => setF('name', e.target.value)}
            className={s.tlAddInput}
            placeholder="Tên tài liệu / mô tả ngắn *"
            autoFocus
          />
          <input
            type="url"
            value={form.url}
            onChange={(e) => setF('url', e.target.value)}
            className={s.tlAddInput}
            placeholder="https://drive.google.com/... *"
          />
          {!compact && (
            <input
              type="text"
              value={form.description}
              onChange={(e) => setF('description', e.target.value)}
              className={s.tlAddInput}
              placeholder="Ghi chú thêm (tùy chọn)"
            />
          )}
          <div className={s.tlAddActions}>
            <button
              type="button"
              className={`${s.btnSecondary} ${s.btnCompact}`}
              onClick={resetForm}
              disabled={saving}
            >
              Huỷ
            </button>
            <button
              type="submit"
              className={`${s.btnPrimary} ${s.btnCompact}`}
              disabled={saving}
            >
              {saving ? <Loader2 size={12} className={s.spinIcon} /> : <Check size={12} />}
              Thêm link
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
