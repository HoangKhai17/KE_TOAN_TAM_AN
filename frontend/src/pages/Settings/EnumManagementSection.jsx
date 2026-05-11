import { useState, useEffect, useRef } from 'react'
import { Pencil, Save, X, Loader2, ChevronRight } from 'lucide-react'
import { fetchAllEnums, updateEnumOptionLabel } from '../../api/enums'
import { useEnumsStore } from '../../hooks/useEnums'
import { useToastStore } from '../../stores/toastStore'
import s from './settings.module.css'

const TYPE_LABELS = {
  user_role:         'Vai trò người dùng',
  user_status:       'Trạng thái tài khoản',
  business_type:     'Loại hình doanh nghiệp',
  company_status:    'Trạng thái khách hàng',
  task_status:       'Trạng thái công việc',
  task_priority:     'Mức ưu tiên',
  task_source:       'Nguồn tạo công việc',
  recurrence_type:   'Kiểu lặp lịch',
  payroll_status:    'Trạng thái bảng lương',
  field_data_type:   'Kiểu dữ liệu',
  document_category: 'Danh mục tài liệu',
  notification_type: 'Loại thông báo',
  report_type_enum:  'Loại báo cáo',
}

export default function EnumManagementSection() {
  const addToast      = useToastStore((st) => st.toast)
  const invalidate    = useEnumsStore((st) => st.invalidate)
  const reloadStore   = useEnumsStore((st) => st.load)

  const [allEnums, setAllEnums] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [activeType, setActiveType] = useState(null)
  const [editKey, setEditKey]   = useState(null)   // optionKey currently being edited
  const [editVal, setEditVal]   = useState('')
  const [saving, setSaving]     = useState(false)
  const editRef = useRef(null)

  async function load() {
    setLoading(true)
    try {
      const data = await fetchAllEnums()
      setAllEnums(data)
      if (!activeType && data) {
        setActiveType(Object.keys(data)[0] ?? null)
      }
    } catch {
      addToast('Không thể tải danh mục hệ thống', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function startEdit(optionKey, currentLabel) {
    setEditKey(optionKey)
    setEditVal(currentLabel)
    setTimeout(() => editRef.current?.focus(), 50)
  }

  function cancelEdit() {
    setEditKey(null)
    setEditVal('')
  }

  async function saveEdit(optionKey) {
    if (!editVal.trim()) return
    if (editVal.trim() === allEnums[activeType]?.options.find((o) => o.key === optionKey)?.label) {
      cancelEdit()
      return
    }
    setSaving(true)
    try {
      await updateEnumOptionLabel(activeType, optionKey, editVal.trim())
      setAllEnums((prev) => ({
        ...prev,
        [activeType]: {
          ...prev[activeType],
          options: prev[activeType].options.map((o) =>
            o.key === optionKey ? { ...o, label: editVal.trim() } : o
          ),
        },
      }))
      invalidate()
      reloadStore()
      cancelEdit()
      addToast('Đã cập nhật nhãn', 'success')
    } catch {
      addToast('Không thể lưu nhãn', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className={s.skeletonStack} style={{ padding: 16 }}>
        {[1, 2, 3, 4].map((i) => <div key={i} className={s.skeletonLine} />)}
      </div>
    )
  }

  if (!allEnums) return null

  const typeKeys   = Object.keys(allEnums)
  const activeData = allEnums[activeType]

  return (
    <div>
      <p className={s.sectionText}>
        Chỉnh sửa nhãn hiển thị (tiếng Việt) cho các giá trị enum hệ thống.
        Giá trị kỹ thuật (mã) không thay đổi — chỉ tên hiển thị được cập nhật.
      </p>

      <div className={s.enumShell}>
        {/* ── Sidebar: type list ── */}
        <aside className={s.enumSidebar}>
          {typeKeys.map((key) => (
            <button
              key={key}
              className={`${s.enumTypeBtn} ${activeType === key ? s.enumTypeBtnActive : ''}`}
              onClick={() => { setActiveType(key); cancelEdit() }}
            >
              <span className={s.enumTypeName}>
                {allEnums[key]?.label || TYPE_LABELS[key] || key}
              </span>
              <span className={s.enumTypeCount}>{allEnums[key]?.options?.length ?? 0}</span>
              <ChevronRight size={12} className={s.enumTypeChevron} />
            </button>
          ))}
        </aside>

        {/* ── Main: option list ── */}
        <div className={s.enumContent}>
          {activeType && activeData && (
            <>
              <div className={s.enumContentHead}>
                <div className={s.enumContentTitle}>
                  {activeData.label || TYPE_LABELS[activeType] || activeType}
                </div>
                <code className={s.codePill}>{activeType}</code>
              </div>

              <table className={s.settingsTable}>
                <thead>
                  <tr>
                    <th style={{ width: 160 }}>Mã kỹ thuật</th>
                    <th>Nhãn hiển thị</th>
                    <th style={{ width: 80, textAlign: 'center' }}>Thứ tự</th>
                    <th style={{ width: 80 }} />
                  </tr>
                </thead>
                <tbody>
                  {activeData.options.map((opt) => (
                    <tr key={opt.key}>
                      <td>
                        <code className={s.codePill}>{opt.key}</code>
                      </td>
                      <td>
                        {editKey === opt.key ? (
                          <div className={s.enumEditRow}>
                            <input
                              ref={editRef}
                              type="text"
                              value={editVal}
                              onChange={(e) => setEditVal(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter')  saveEdit(opt.key)
                                if (e.key === 'Escape') cancelEdit()
                              }}
                              className={s.settingsInput}
                              style={{ flex: 1, height: 30, fontSize: 13 }}
                            />
                            <button
                              className={s.iconBtn}
                              onClick={() => saveEdit(opt.key)}
                              disabled={saving}
                              title="Lưu"
                            >
                              {saving ? <Loader2 size={13} /> : <Save size={13} />}
                            </button>
                            <button
                              className={s.iconBtn}
                              onClick={cancelEdit}
                              disabled={saving}
                              title="Huỷ"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <span className={s.semiBold}>{opt.label}</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', color: 'var(--color-muted)', fontSize: 12 }}>
                        {opt.sortOrder}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {editKey !== opt.key && (
                          <button
                            className={s.iconBtn}
                            onClick={() => startEdit(opt.key, opt.label)}
                            title="Sửa nhãn"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
