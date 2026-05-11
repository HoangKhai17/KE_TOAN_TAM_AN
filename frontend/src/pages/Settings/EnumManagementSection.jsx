import { useState, useEffect, useRef } from 'react'
import { Pencil, Save, X, Loader2, ChevronRight, Plus, Power } from 'lucide-react'
import { fetchAllEnums, updateEnumOptionLabel, addEnumOption, toggleEnumOption } from '../../api/enums'
import { useEnumsStore } from '../../hooks/useEnums'
import { useToastStore } from '../../stores/toastStore'
import s from './settings.module.css'

export default function EnumManagementSection() {
  const addToast   = useToastStore((st) => st.toast)
  const invalidate = useEnumsStore((st) => st.invalidate)
  const reloadStore = useEnumsStore((st) => st.load)

  const [allEnums, setAllEnums]       = useState(null)
  const [loading, setLoading]         = useState(true)
  const [activeType, setActiveType]   = useState(null)

  // Edit label state
  const [editKey, setEditKey]   = useState(null)
  const [editVal, setEditVal]   = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const editRef = useRef(null)

  // Add new option state
  const [showAdd, setShowAdd]       = useState(false)
  const [newKey, setNewKey]         = useState('')
  const [newLabel, setNewLabel]     = useState('')
  const [addErr, setAddErr]         = useState('')
  const [savingAdd, setSavingAdd]   = useState(false)

  // Toggle active state
  const [togglingKey, setTogglingKey] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const data = await fetchAllEnums()
      setAllEnums(data)
      if (!activeType && data) setActiveType(Object.keys(data)[0] ?? null)
    } catch {
      addToast('Không thể tải danh mục hệ thống', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function syncStore() { invalidate(); reloadStore() }

  // ── Edit label ─────────────────────────────────────────────────────────────

  function startEdit(optionKey, currentLabel) {
    setEditKey(optionKey)
    setEditVal(currentLabel)
    setTimeout(() => editRef.current?.focus(), 50)
  }

  function cancelEdit() { setEditKey(null); setEditVal('') }

  async function saveEdit(optionKey) {
    if (!editVal.trim()) return
    const cur = allEnums[activeType]?.options.find((o) => o.key === optionKey)?.label
    if (editVal.trim() === cur) { cancelEdit(); return }
    setSavingEdit(true)
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
      syncStore()
      cancelEdit()
      addToast('Đã cập nhật nhãn', 'success')
    } catch {
      addToast('Không thể lưu nhãn', 'error')
    } finally {
      setSavingEdit(false)
    }
  }

  // ── Toggle active ──────────────────────────────────────────────────────────

  async function handleToggle(optionKey) {
    setTogglingKey(optionKey)
    try {
      const updated = await toggleEnumOption(activeType, optionKey)
      setAllEnums((prev) => ({
        ...prev,
        [activeType]: {
          ...prev[activeType],
          options: prev[activeType].options.map((o) =>
            o.key === optionKey ? { ...o, isActive: updated.isActive } : o
          ),
        },
      }))
      syncStore()
      addToast(updated.isActive ? 'Đã kích hoạt' : 'Đã tắt', 'success')
    } catch {
      addToast('Không thể cập nhật', 'error')
    } finally {
      setTogglingKey(null)
    }
  }

  // ── Add new option ─────────────────────────────────────────────────────────

  function openAdd() { setShowAdd(true); setNewKey(''); setNewLabel(''); setAddErr('') }
  function closeAdd() { setShowAdd(false); setNewKey(''); setNewLabel(''); setAddErr('') }

  async function handleAdd(e) {
    e.preventDefault()
    const key   = newKey.trim().toLowerCase()
    const label = newLabel.trim()
    if (!key)   { setAddErr('Vui lòng nhập mã'); return }
    if (!/^[a-z0-9_]+$/.test(key)) { setAddErr('Mã chỉ gồm chữ thường (a-z), số và dấu _'); return }
    if (!label) { setAddErr('Vui lòng nhập tên hiển thị'); return }
    setSavingAdd(true); setAddErr('')
    try {
      const option = await addEnumOption(activeType, key, label)
      setAllEnums((prev) => ({
        ...prev,
        [activeType]: {
          ...prev[activeType],
          options: [...prev[activeType].options, option],
        },
      }))
      syncStore()
      closeAdd()
      addToast(`Đã thêm "${label}"`, 'success')
    } catch (err) {
      const msg = err.response?.data?.error?.message ?? 'Không thể thêm mới'
      setAddErr(msg)
    } finally {
      setSavingAdd(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

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
        Quản lý nhãn hiển thị, thêm mới và bật/tắt các giá trị enum trong hệ thống.
        Giá trị kỹ thuật (mã) không thể thay đổi sau khi tạo.
      </p>

      <div className={s.enumShell}>
        {/* ── Sidebar: type list ── */}
        <aside className={s.enumSidebar}>
          {typeKeys.map((key) => (
            <button
              key={key}
              className={`${s.enumTypeBtn} ${activeType === key ? s.enumTypeBtnActive : ''}`}
              onClick={() => { setActiveType(key); cancelEdit(); closeAdd() }}
            >
              <span className={s.enumTypeName}>
                {allEnums[key]?.label || key}
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
                <div className={s.enumContentTitle}>{activeData.label || activeType}</div>
                <code className={s.codePill}>{activeType}</code>
                <button
                  className={s.btnAddSmall}
                  style={{ marginLeft: 'auto' }}
                  onClick={openAdd}
                >
                  <Plus size={12} /> Thêm mới
                </button>
              </div>

              {/* Add form */}
              {showAdd && (
                <form onSubmit={handleAdd} className={s.enumAddForm}>
                  <div className={s.enumAddRow}>
                    <div className={s.enumAddField}>
                      <label className={s.settingsLabel} style={{ fontSize: 11, marginBottom: 3 }}>
                        Mã kỹ thuật <span style={{ color: '#94a3b8' }}>(a-z, 0-9, _)</span>
                      </label>
                      <input
                        type="text"
                        value={newKey}
                        onChange={(e) => { setNewKey(e.target.value); setAddErr('') }}
                        placeholder="vd: moi_them"
                        className={s.settingsInput}
                        style={{ height: 32, fontSize: 13 }}
                        autoFocus
                      />
                    </div>
                    <div className={s.enumAddField} style={{ flex: 2 }}>
                      <label className={s.settingsLabel} style={{ fontSize: 11, marginBottom: 3 }}>
                        Tên hiển thị
                      </label>
                      <input
                        type="text"
                        value={newLabel}
                        onChange={(e) => { setNewLabel(e.target.value); setAddErr('') }}
                        placeholder="vd: Tên tiếng Việt"
                        className={s.settingsInput}
                        style={{ height: 32, fontSize: 13 }}
                      />
                    </div>
                    <div className={s.enumAddActions}>
                      <button type="submit" className={s.btnSave} disabled={savingAdd} style={{ height: 32, padding: '0 14px' }}>
                        {savingAdd ? <Loader2 size={13} /> : <Save size={13} />}
                        Lưu
                      </button>
                      <button type="button" className={s.btnOutline} onClick={closeAdd} disabled={savingAdd} style={{ height: 32 }}>
                        Huỷ
                      </button>
                    </div>
                  </div>
                  {addErr && <p className={s.enumAddErr}>{addErr}</p>}
                </form>
              )}

              <table className={s.settingsTable}>
                <thead>
                  <tr>
                    <th style={{ width: 160 }}>Mã kỹ thuật</th>
                    <th>Nhãn hiển thị</th>
                    <th style={{ width: 70, textAlign: 'center' }}>Thứ tự</th>
                    <th style={{ width: 90, textAlign: 'center' }}>Trạng thái</th>
                    <th style={{ width: 70 }} />
                  </tr>
                </thead>
                <tbody>
                  {activeData.options.map((opt) => (
                    <tr key={opt.key} style={!opt.isActive ? { opacity: 0.5 } : {}}>
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
                            <button className={s.iconBtn} onClick={() => saveEdit(opt.key)} disabled={savingEdit} title="Lưu">
                              {savingEdit ? <Loader2 size={13} /> : <Save size={13} />}
                            </button>
                            <button className={s.iconBtn} onClick={cancelEdit} disabled={savingEdit} title="Huỷ">
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
                      <td style={{ textAlign: 'center' }}>
                        <span className={opt.isActive ? s.enumBadgeActive : s.enumBadgeInactive}>
                          {opt.isActive ? 'Đang bật' : 'Đã tắt'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {editKey !== opt.key && (
                            <button className={s.iconBtn} onClick={() => startEdit(opt.key, opt.label)} title="Sửa nhãn">
                              <Pencil size={13} />
                            </button>
                          )}
                          <button
                            className={`${s.iconBtn} ${opt.isActive ? s.iconBtnSuspend : s.iconBtnActivate}`}
                            onClick={() => handleToggle(opt.key)}
                            disabled={togglingKey === opt.key}
                            title={opt.isActive ? 'Tắt' : 'Kích hoạt'}
                          >
                            {togglingKey === opt.key
                              ? <Loader2 size={13} />
                              : <Power size={13} />
                            }
                          </button>
                        </div>
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
