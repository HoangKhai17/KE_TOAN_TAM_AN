import { useState, useEffect } from 'react'
import { Info } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { createTask } from '../../api/tasks'
import { listCompanies } from '../../api/companies'
import { listUsers } from '../../api/users'
import { listTaskTypes } from '../../api/taskTypes'
import { useEnumsStore } from '../../hooks/useEnums'
import { PRIORITY_LABELS } from './taskUtils'
import s from './tasks.module.css'

export default function TaskFormModal({ onClose, onSaved, onSavedAndOpen, initialCompanyId, lockCompany }) {
  const todayISO = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    title: '', companyId: initialCompanyId || '', taskTypeId: '', assignedToId: '',
    startDate: todayISO, dueDate: '', priority: 'medium', slaDays: '', description: '',
  })
  const [companies, setCompanies]   = useState([])
  const [users, setUsers]           = useState([])
  const [taskTypes, setTaskTypes]   = useState([])
  const [saving, setSaving]         = useState(false)
  const [fe, setFE]                 = useState({})
  const [error, setError]           = useState(null)

  const getOptions = useEnumsStore((st) => st.getOptions)
  const loadEnums  = useEnumsStore((st) => st.load)

  useEffect(() => {
    listCompanies({ limit: 200, status: 'active' })
      .then(({ companies: c }) => setCompanies(c)).catch(() => {})
    listUsers({ role: 'staff', status: 'active', limit: 100 })
      .then(({ users: u }) => setUsers(u)).catch(() => {})
    listTaskTypes({ isActive: true, limit: 200 })
      .then(({ taskTypes: t }) => setTaskTypes(t)).catch(() => {})
    loadEnums()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }))

  async function submit(openAfter) {
    const errs = {}
    if (!form.title.trim()) errs.title = 'Tiêu đề không được để trống'
    if (!form.companyId)    errs.companyId = 'Vui lòng chọn khách hàng'
    if (Object.keys(errs).length) { setFE(errs); return }
    setError(null); setFE({}); setSaving(true)
    try {
      const task = await createTask({
        title:       form.title.trim(),
        companyId:   form.companyId,
        taskTypeId:  form.taskTypeId   || null,
        assignedTo:  form.assignedToId || null,
        startDate:   form.startDate    || null,
        dueDate:     form.dueDate      || null,
        priority:    form.priority,
        slaDays:     form.slaDays ? Number(form.slaDays) : null,
        description: form.description.trim() || null,
      })
      if (openAfter) onSavedAndOpen(task)
      else           onSaved(task)
    } catch (err) {
      const errData = err.response?.data?.error
      if (err.response?.status === 422 && errData?.details) {
        const fe2 = {}
        for (const d of errData.details) fe2[d.field] = d.message
        setFE(fe2)
      } else {
        setError(errData?.message ?? 'Đã xảy ra lỗi, vui lòng thử lại')
      }
    } finally {
      setSaving(false)
    }
  }

  const selectedType = taskTypes.find((t) => t.id === form.taskTypeId)

  return (
    <Modal title="Tạo công việc mới" onClose={onClose} wide>
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div className={s.formGrid} style={{ gap: 14 }}>
        <div className={`${s.formGroup} ${s.span2}`}>
          <label className={`${s.formLabel} ${s.required}`}>Tiêu đề</label>
          <input
            type="text"
            value={form.title}
            onChange={set('title')}
            className={s.formInput}
            style={fe.title ? { borderColor: '#ef4444' } : {}}
            placeholder="Nhập tiêu đề công việc..."
            autoFocus
          />
          {fe.title && <p className={s.formError}>{fe.title}</p>}
        </div>

        <div className={s.formGroup}>
          <label className={`${s.formLabel} ${s.required}`}>Khách hàng</label>
          <select
            value={form.companyId}
            onChange={set('companyId')}
            className={s.formSelect}
            disabled={lockCompany}
            style={{
              ...(fe.companyId ? { borderColor: '#ef4444' } : {}),
              ...(lockCompany ? { background: '#f8fafc', cursor: 'not-allowed' } : {}),
            }}
          >
            <option value="">-- Chọn khách hàng --</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {fe.companyId && <p className={s.formError}>{fe.companyId}</p>}
        </div>

        <div className={s.formGroup}>
          <label className={s.formLabel}>Loại công việc</label>
          <select value={form.taskTypeId} onChange={set('taskTypeId')} className={s.formSelect}>
            <option value="">-- Không có --</option>
            {taskTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {selectedType?.checklistCount > 0 && (
            <p className={s.formHint}>
              <Info size={11} style={{ display: 'inline', verticalAlign: 'middle' }} />
              {' '}{selectedType.checklistCount} bước checklist sẽ được sao chép
            </p>
          )}
        </div>

        <div className={s.formGroup}>
          <label className={s.formLabel}>Giao cho</label>
          <select value={form.assignedToId} onChange={set('assignedToId')} className={s.formSelect}>
            <option value="">-- Chưa phân công --</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>

        <div className={s.formGroup}>
          <label className={s.formLabel}>Ưu tiên</label>
          <select value={form.priority} onChange={set('priority')} className={s.formSelect}>
            {(getOptions('task_priority').length > 0
              ? getOptions('task_priority')
              : ['urgent', 'high', 'medium', 'low'].map((k) => ({ key: k, label: PRIORITY_LABELS[k] }))
            ).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>

        <div className={s.formGroup}>
          <label className={s.formLabel}>Ngày bắt đầu</label>
          <input type="date" value={form.startDate} onChange={set('startDate')} className={s.formInput} />
        </div>

        <div className={s.formGroup}>
          <label className={s.formLabel}>Ngày hết hạn</label>
          <input
            type="date"
            value={form.dueDate}
            onChange={set('dueDate')}
            className={s.formInput}
            min={form.startDate || undefined}
          />
        </div>

        <div className={s.formGroup}>
          <label className={s.formLabel}>SLA chuẩn (ngày)</label>
          <input
            type="number" min="1" max="365"
            value={form.slaDays}
            onChange={set('slaDays')}
            className={s.formInput}
            placeholder="Ví dụ: 7"
          />
          <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 3 }}>
            Số ngày tối đa để hoàn thành theo chuẩn dịch vụ
          </p>
        </div>

        <div className={`${s.formGroup} ${s.span2}`}>
          <label className={s.formLabel}>Mô tả</label>
          <textarea
            value={form.description}
            onChange={set('description')}
            className={s.formTextarea}
            style={{ height: 96 }}
            placeholder="Mô tả chi tiết công việc..."
          />
        </div>
      </div>

      <div className={s.formFooter}>
        <button onClick={onClose} className={s.btnSecondary} disabled={saving}>Huỷ</button>
        <button onClick={() => submit(false)} className={s.btnSecondary} disabled={saving}>
          {saving && <div className={s.spinner} style={{ width: 13, height: 13, borderWidth: 2 }} />}
          Tạo
        </button>
        <button onClick={() => submit(true)} className={s.btnPrimary} disabled={saving}>
          {saving && <div className={s.spinner} style={{ width: 13, height: 13, borderWidth: 2, borderTopColor: 'rgba(255,255,255,0.8)', borderColor: 'rgba(255,255,255,0.25)' }} />}
          Tạo và mở
        </button>
      </div>
    </Modal>
  )
}
