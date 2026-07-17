import { useState, useEffect } from 'react'
import { Users, Edit2, Check, X } from 'lucide-react'
import { updateTask } from '../../api/tasks'
import { listUserOptions } from '../../api/users'
import { useToastStore } from '../../stores/toastStore'
import CollaboratorPicker from './CollaboratorPicker'
import s from './tasks.module.css'

// Hiển thị + chỉnh sửa người hỗ trợ trong trang chi tiết công việc.
//   task      : task DTO (có collaborators, assignedTo)
//   canManage : true nếu admin / owner / phụ trách công ty → cho phép sửa danh sách
//   onChange  : (updatedTask) => void  — cập nhật state cha sau khi lưu
export default function TaskCollaborators({ task, canManage, onChange }) {
  const collaborators = task.collaborators || []
  const [editing, setEditing] = useState(false)
  const [users,   setUsers]   = useState([])
  const [selected, setSelected] = useState(collaborators.map((c) => c.id))
  const [saving,  setSaving]  = useState(false)
  const addToast = useToastStore((st) => st.toast)

  // Đồng bộ lại khi đổi task hoặc danh sách hỗ trợ thay đổi từ ngoài
  useEffect(() => {
    setSelected((task.collaborators || []).map((c) => c.id))
  }, [task.id, task.collaborators])

  // Nạp danh sách nhân sự khi mở trình sửa (lazy)
  useEffect(() => {
    if (editing && users.length === 0) {
      listUserOptions({ status: 'active' }).then(({ users: u }) => setUsers(u)).catch(() => {})
    }
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setSaving(true)
    try {
      const updated = await updateTask(task.id, {
        collaboratorIds: selected.filter((id) => id && id !== task.assignedTo),
      })
      onChange?.(updated)
      setEditing(false)
    } catch (err) {
      addToast(err?.response?.data?.error?.message ?? 'Không lưu được người hỗ trợ', 'error')
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setSelected(collaborators.map((c) => c.id))
    setEditing(false)
  }

  // Không có người hỗ trợ và không được sửa → ẩn hẳn
  if (collaborators.length === 0 && !canManage) return null

  if (editing) {
    return (
      <div className={s.detailMetaItem} style={{ alignItems: 'flex-start' }}>
        <Users size={12} className={s.detailMetaIcon} />
        <span className={s.detailMetaLabel}>Hỗ trợ:</span>
        <div style={{ minWidth: 240 }}>
          <CollaboratorPicker
            options={users}
            value={selected}
            onChange={setSelected}
            excludeId={task.assignedTo}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '3px 10px',
                       borderRadius: 6, border: 'none', cursor: 'pointer', background: 'var(--color-primary)', color: '#fff' }}
            >
              <Check size={12} /> Lưu
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '3px 10px',
                       borderRadius: 6, border: '1px solid var(--color-border)', cursor: 'pointer', background: 'transparent', color: 'var(--color-text)' }}
            >
              <X size={12} /> Huỷ
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={s.detailMetaItem}>
      <Users size={12} className={s.detailMetaIcon} />
      <span className={s.detailMetaLabel}>Hỗ trợ:</span>
      {collaborators.length > 0 ? (
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6 }}>
          {collaborators.map((c) => (
            <span
              key={c.id}
              style={{ padding: '1px 8px', borderRadius: 12, background: 'var(--color-primary-bg)',
                       color: 'var(--color-primary-dark)', fontSize: 12 }}
            >
              {c.name}
            </span>
          ))}
        </span>
      ) : (
        <span style={{ color: 'var(--color-muted)', fontStyle: 'italic' }}>Chưa có</span>
      )}
      {canManage && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Sửa người hỗ trợ"
          style={{ marginLeft: 4, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-muted)', display: 'inline-flex', padding: 2 }}
        >
          <Edit2 size={12} />
        </button>
      )}
    </div>
  )
}
