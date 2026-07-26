import { useState, useEffect, useCallback } from 'react'
import { MapPin, Plus, Pencil, Trash2, Check, X, Star, Loader2 } from 'lucide-react'
import * as locationsApi from '../../api/locations'
import { useEnumsStore } from '../../hooks/useEnums'
import { useToastStore } from '../../stores/toastStore'
import s from './companies.module.css'

function emptyDraft() {
  return {
    locationType: '', name: '', address: '', taxCode: '',
    accountingForm: '', status: 'active', isPrimary: false,
  }
}

function draftFromRow(r) {
  return {
    locationType: r.locationType ?? '',
    name: r.name ?? '',
    address: r.address ?? '',
    taxCode: r.taxCode ?? '',
    accountingForm: r.accountingForm ?? '',
    status: r.status ?? 'active',
    isPrimary: !!r.isPrimary,
  }
}

const STATUS_CLASS = {
  active:     s.locStatusActive,
  suspended:  s.locStatusSuspended,
  terminated: s.locStatusTerminated,
}

// Hàng nhập liệu (thêm mới / sửa) — ĐỊNH NGHĨA Ở CẤP CAO NHẤT (không lồng trong
// component cha) để ô input không bị tháo/gắn lại sau mỗi lần gõ → giữ được focus.
function LocationEditRow({ draft, setF, save, cancel, saving, typeOpts, statusOpts, acctOpts }) {
  return (
    <tr className={s.locEditRow}>
      <td>
        <select className={s.locInput} value={draft.locationType} onChange={setF('locationType')}>
          {typeOpts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </td>
      <td><input className={s.locInput} value={draft.name} onChange={setF('name')} placeholder="VD: Chi nhánh 1" /></td>
      <td><input className={s.locInput} value={draft.address} onChange={setF('address')} placeholder="Địa chỉ" /></td>
      <td><input className={s.locInput} value={draft.taxCode} onChange={setF('taxCode')} placeholder="MST phụ thuộc" /></td>
      <td>
        <select className={s.locInput} value={draft.accountingForm} onChange={setF('accountingForm')}>
          <option value="">—</option>
          {acctOpts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </td>
      <td>
        <select className={s.locInput} value={draft.status} onChange={setF('status')}>
          {statusOpts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </td>
      <td className={s.locCenter}>
        <input type="checkbox" checked={draft.isPrimary} onChange={setF('isPrimary')} title="Đặt làm trụ sở chính" />
      </td>
      <td className={s.locCenter}>
        <div className={s.locRowActions}>
          <button className={s.locBtnSave} onClick={save} disabled={saving} title="Lưu">
            {saving ? <Loader2 size={13} className={s.spin} /> : <Check size={13} />}
          </button>
          <button className={s.locBtnCancel} onClick={cancel} disabled={saving} title="Huỷ"><X size={13} /></button>
        </div>
      </td>
    </tr>
  )
}

export default function CompanyLocationsCard({ companyId, canEdit = true }) {
  const getOptions = useEnumsStore((st) => st.getOptions)
  const getLabel   = useEnumsStore((st) => st.getLabel)
  const addToast   = useToastStore((st) => st.toast)

  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [editingId, setEditingId] = useState(null)   // null | 'new' | <id>
  const [draft, setDraft]       = useState(emptyDraft)
  const [saving, setSaving]     = useState(false)

  const typeOpts   = getOptions('location_type')
  const statusOpts = getOptions('location_status')
  const acctOpts   = getOptions('accounting_form')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await locationsApi.listLocations(companyId))
    } catch {
      addToast('Không tải được danh sách địa điểm', 'error')
    } finally {
      setLoading(false)
    }
  }, [companyId, addToast])

  useEffect(() => { load() }, [load])

  function startAdd() {
    setDraft({ ...emptyDraft(), locationType: typeOpts[0]?.key ?? '' })
    setEditingId('new')
  }
  function startEdit(row) {
    setDraft(draftFromRow(row))
    setEditingId(row.id)
  }
  function cancel() { setEditingId(null); setDraft(emptyDraft()) }

  const setF = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setDraft((p) => ({ ...p, [k]: v }))
  }

  async function save() {
    if (!draft.locationType) { addToast('Vui lòng chọn loại địa điểm', 'error'); return }
    setSaving(true)
    try {
      const body = {
        locationType: draft.locationType,
        name: draft.name.trim() || null,
        address: draft.address.trim() || null,
        taxCode: draft.taxCode.trim() || null,
        accountingForm: draft.accountingForm || null,
        status: draft.status || 'active',
        isPrimary: draft.isPrimary,
      }
      if (editingId === 'new') await locationsApi.createLocation(companyId, body)
      else                     await locationsApi.updateLocation(companyId, editingId, body)
      addToast(editingId === 'new' ? 'Đã thêm địa điểm' : 'Đã cập nhật địa điểm', 'success')
      cancel()
      await load()
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không lưu được địa điểm', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function remove(row) {
    if (!window.confirm(`Xoá địa điểm "${row.name || getLabel('location_type', row.locationType, row.locationType)}"?`)) return
    try {
      await locationsApi.deleteLocation(companyId, row.id)
      addToast('Đã xoá địa điểm', 'success')
      await load()
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không xoá được địa điểm', 'error')
    }
  }

  const colSpan = 8
  const editRowProps = { draft, setF, save, cancel, saving, typeOpts, statusOpts, acctOpts }

  return (
    <div className={s.infoCard}>
      <div className={s.infoCardHeader}>
        <div className={s.infoCardTitle}>
          <div className={`${s.infoCardTitleIcon} ${s.infoCardIconBlue}`}>
            <MapPin size={14} />
          </div>
          Địa điểm
        </div>
        {canEdit && editingId !== 'new' && (
          <button className={s.locAddBtn} onClick={startAdd}>
            <Plus size={13} /> Thêm địa điểm
          </button>
        )}
      </div>

      <div className={s.infoCardBody}>
        <div className={s.locTableWrap}>
          <table className={s.locTable}>
            <thead>
              <tr>
                <th>Loại</th>
                <th>Tên</th>
                <th>Địa chỉ</th>
                <th>MST</th>
                <th>Hạch toán</th>
                <th>Trạng thái</th>
                <th className={s.locCenter}>Trụ sở</th>
                <th className={s.locCenter}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={colSpan} className={s.locEmpty}>Đang tải…</td></tr>
              ) : rows.length === 0 && editingId !== 'new' ? (
                <tr><td colSpan={colSpan} className={s.locEmpty}>Chưa có địa điểm. Nhấn “Thêm địa điểm”.</td></tr>
              ) : (
                rows.map((r) => (
                  editingId === r.id ? <LocationEditRow key={r.id} {...editRowProps} /> : (
                    <tr key={r.id}>
                      <td>{getLabel('location_type', r.locationType, r.locationType)}</td>
                      <td>{r.name || <span className={s.locMuted}>—</span>}</td>
                      <td>{r.address || <span className={s.locMuted}>—</span>}</td>
                      <td>{r.taxCode || <span className={s.locMuted}>—</span>}</td>
                      <td>{r.accountingForm ? getLabel('accounting_form', r.accountingForm, r.accountingForm) : <span className={s.locMuted}>—</span>}</td>
                      <td>
                        <span className={`${s.locStatus} ${STATUS_CLASS[r.status] ?? ''}`}>
                          {getLabel('location_status', r.status, r.status)}
                        </span>
                      </td>
                      <td className={s.locCenter}>
                        {r.isPrimary ? <Star size={14} className={s.locStar} fill="currentColor" /> : <span className={s.locMuted}>—</span>}
                      </td>
                      <td className={s.locCenter}>
                        {canEdit && (
                          <div className={s.locRowActions}>
                            <button className={s.locBtnEdit} onClick={() => startEdit(r)} title="Sửa"><Pencil size={13} /></button>
                            <button className={s.locBtnDelete} onClick={() => remove(r)} title="Xoá"><Trash2 size={13} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                ))
              )}
              {editingId === 'new' && <LocationEditRow {...editRowProps} />}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
