import { useState, useEffect, useCallback, useRef } from 'react'
import { MapPin, Plus, Pencil, Trash2, Check, X, Loader2, Paperclip, Download, Upload } from 'lucide-react'
import * as locationsApi from '../../api/locations'
import * as attachmentsApi from '../../api/attachments'
import Modal from '../../components/ui/Modal'
import { useEnumsStore } from '../../hooks/useEnums'
import { useToastStore } from '../../stores/toastStore'
import { fmtDate } from './companyUtils'
import DateBox from './DateBox'
import s from './companies.module.css'

const ATTACH_MODULE = 'company_location'

function emptyDraft() {
  return {
    locationType: '', name: '', taxCode: '', licenseEstablishedDate: '',
    address: '', accountingForm: '', locationFunction: '', status: 'active',
    startDate: '', endDate: '', notes: '',
  }
}

function draftFromRow(r) {
  return {
    locationType: r.locationType ?? '',
    name: r.name ?? '',
    taxCode: r.taxCode ?? '',
    licenseEstablishedDate: r.licenseEstablishedDate ? String(r.licenseEstablishedDate).slice(0, 10) : '',
    address: r.address ?? '',
    accountingForm: r.accountingForm ?? '',
    locationFunction: r.locationFunction ?? '',
    status: r.status ?? 'active',
    startDate: r.startDate ? String(r.startDate).slice(0, 10) : '',
    endDate: r.endDate ? String(r.endDate).slice(0, 10) : '',
    notes: r.notes ?? '',
  }
}

const STATUS_CLASS = {
  active:     s.locStatusActive,
  suspended:  s.locStatusSuspended,
  terminated: s.locStatusTerminated,
}

// Hàng nhập liệu (thêm mới / sửa) — ĐỊNH NGHĨA Ở CẤP CAO NHẤT (không lồng trong
// component cha) để ô input không bị tháo/gắn lại sau mỗi lần gõ → giữ được focus.
function LocationEditRow({ draft, setF, save, cancel, saving, typeOpts, statusOpts, acctOpts, funcOpts }) {
  const dateF = (k) => (v) => setF(k)({ target: { value: v } })
  return (
    <tr className={s.locEditRow}>
      <td>
        <select className={s.locInput} value={draft.locationType} onChange={setF('locationType')}>
          <option value="">—</option>
          {typeOpts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </td>
      <td><input className={s.locInput} value={draft.name} onChange={setF('name')} placeholder="VD: Chi nhánh 1" /></td>
      <td><input className={s.locInput} value={draft.taxCode} onChange={setF('taxCode')} placeholder="MST phụ thuộc" /></td>
      <td><DateBox value={draft.licenseEstablishedDate} onChange={dateF('licenseEstablishedDate')} className={s.locDateBox} /></td>
      <td><input className={s.locInput} value={draft.address} onChange={setF('address')} placeholder="Địa chỉ" /></td>
      <td>
        <select className={s.locInput} value={draft.accountingForm} onChange={setF('accountingForm')}>
          <option value="">—</option>
          {acctOpts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </td>
      <td>
        <select className={s.locInput} value={draft.locationFunction} onChange={setF('locationFunction')}>
          <option value="">—</option>
          {funcOpts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </td>
      <td>
        <select className={s.locInput} value={draft.status} onChange={setF('status')}>
          {statusOpts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </td>
      <td><DateBox value={draft.startDate} onChange={dateF('startDate')} className={s.locDateBox} /></td>
      <td><DateBox value={draft.endDate} onChange={dateF('endDate')} className={s.locDateBox} /></td>
      <td><input className={s.locInput} value={draft.notes} onChange={setF('notes')} placeholder="Ghi chú" /></td>
      <td className={s.locCenter}><span className={s.locMuted}>Lưu trước</span></td>
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

// ── Popup quản lý file đính kèm của MỘT địa điểm ────────────────────────────────
function LocationFilesModal({ location, canEdit, onClose, onChanged }) {
  const addToast = useToastStore((st) => st.toast)
  const [files, setFiles]     = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setFiles(await attachmentsApi.listFiles(ATTACH_MODULE, location.id)) }
    catch { addToast('Không tải được danh sách file', 'error') }
    finally { setLoading(false) }
  }, [location.id, addToast])

  useEffect(() => { load() }, [load])

  async function onPick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > attachmentsApi.MAX_FILE_BYTES) {
      addToast(`File quá lớn (tối đa ${attachmentsApi.formatSize(attachmentsApi.MAX_FILE_BYTES)})`, 'error'); return
    }
    setUploading(true)
    try {
      await attachmentsApi.uploadFile(ATTACH_MODULE, location.id, file)
      addToast('Đã tải file lên', 'success')
      await load(); onChanged?.()
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Tải file thất bại', 'error')
    } finally { setUploading(false) }
  }

  async function remove(f) {
    if (!window.confirm(`Xoá file "${f.fileName}"?`)) return
    try {
      await attachmentsApi.deleteFile(f.id)
      addToast('Đã xoá file', 'success')
      await load(); onChanged?.()
    } catch (err) { addToast(err.response?.data?.error?.message ?? 'Không xoá được file', 'error') }
  }

  return (
    <Modal title={`File đính kèm — ${location.name || 'địa điểm'}`} onClose={onClose}>
      {loading ? (
        <div className={s.locFileEmpty}><Loader2 size={16} className={s.spin} /> Đang tải…</div>
      ) : files.length === 0 ? (
        <div className={s.locFileEmpty}>Chưa có file đính kèm.</div>
      ) : (
        <div className={s.locFileList}>
          {files.map((f) => (
            <div key={f.id} className={s.locFileRow}>
              <Paperclip size={14} className={s.locMuted} />
              <span className={s.locFileName} title={f.fileName}>{f.fileName}</span>
              <span className={s.locFileSize}>{attachmentsApi.formatSize(f.sizeBytes)}</span>
              <button className={s.locFileIconBtn} title="Tải xuống" onClick={() => attachmentsApi.downloadFile(f.id, f.fileName)}>
                <Download size={14} />
              </button>
              {canEdit && (
                <button className={`${s.locFileIconBtn} ${s.locFileIconDanger}`} title="Xoá" onClick={() => remove(f)}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <>
          <input ref={fileRef} type="file" accept={attachmentsApi.ACCEPT_ATTR} className={s.hiddenInput} onChange={onPick} />
          <button className={s.locFileBtn} onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 size={13} className={s.spin} /> : <Upload size={13} />}
            {uploading ? 'Đang tải lên…' : 'Tải file lên'}
          </button>
        </>
      )}
    </Modal>
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
  const [fileCounts, setFileCounts] = useState({})   // { [locationId]: number }
  const [filesFor, setFilesFor] = useState(null)     // location row đang mở popup file

  const typeOpts   = getOptions('location_type')
  const statusOpts = getOptions('location_status')
  const acctOpts   = getOptions('accounting_form')
  const funcOpts   = getOptions('location_function')

  // Đếm số file cho từng địa điểm (địa điểm thường ít → chấp nhận N request nhẹ)
  const loadFileCounts = useCallback(async (locs) => {
    const entries = await Promise.all(locs.map(async (r) => {
      try { return [r.id, (await attachmentsApi.listFiles(ATTACH_MODULE, r.id)).length] }
      catch { return [r.id, 0] }
    }))
    setFileCounts(Object.fromEntries(entries))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await locationsApi.listLocations(companyId)
      setRows(data)
      loadFileCounts(data)
    } catch {
      addToast('Không tải được danh sách địa điểm', 'error')
    } finally {
      setLoading(false)
    }
  }, [companyId, addToast, loadFileCounts])

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

  const setF = (k) => (e) => setDraft((p) => ({ ...p, [k]: e.target.value }))

  async function save() {
    if (!draft.locationType) { addToast('Vui lòng chọn loại GP / địa điểm', 'error'); return }
    if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) {
      addToast('Ngày kết thúc không được nhỏ hơn ngày bắt đầu', 'error'); return
    }
    setSaving(true)
    try {
      const body = {
        locationType: draft.locationType,
        name: draft.name.trim() || null,
        taxCode: draft.taxCode.trim() || null,
        licenseEstablishedDate: draft.licenseEstablishedDate || null,
        address: draft.address.trim() || null,
        accountingForm: draft.accountingForm || null,
        locationFunction: draft.locationFunction || null,
        status: draft.status || 'active',
        startDate: draft.startDate || null,
        endDate: draft.endDate || null,
        notes: draft.notes.trim() || null,
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

  const colSpan = 13
  const editRowProps = { draft, setF, save, cancel, saving, typeOpts, statusOpts, acctOpts, funcOpts }

  return (
    <div className={s.infoCard}>
      <div className={s.infoCardHeader}>
        <div className={s.infoCardTitle}>
          <div className={`${s.infoCardTitleIcon} ${s.infoCardIconBlue}`}>
            <MapPin size={14} />
          </div>
          Trụ sở chính / địa điểm kinh doanh
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
            <colgroup>
              <col className={s.colType} />
              <col className={s.colName} />
              <col className={s.colTax} />
              <col className={s.colEstDate} />
              <col className={s.colAddr} />
              <col className={s.colAcct} />
              <col className={s.colFunc} />
              <col className={s.colStatus} />
              <col className={s.colStart} />
              <col className={s.colEnd} />
              <col className={s.colNotes} />
              <col className={s.colFiles} />
              <col className={s.colAction} />
            </colgroup>
            <thead>
              <tr>
                <th>Loại GP</th>
                <th>Tên</th>
                <th>MST</th>
                <th>Ngày thành lập</th>
                <th>Địa chỉ</th>
                <th>PP hạch toán</th>
                <th>Chức năng</th>
                <th>Trạng thái</th>
                <th>Ngày bắt đầu</th>
                <th>Ngày kết thúc</th>
                <th>Ghi chú</th>
                <th className={s.locCenter}>File đính kèm</th>
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
                      <td title={r.name || ''}>{r.name || <span className={s.locMuted}>—</span>}</td>
                      <td title={r.taxCode || ''}>{r.taxCode || <span className={s.locMuted}>—</span>}</td>
                      <td>{r.licenseEstablishedDate ? fmtDate(r.licenseEstablishedDate) : <span className={s.locMuted}>—</span>}</td>
                      <td title={r.address || ''}>{r.address || <span className={s.locMuted}>—</span>}</td>
                      <td>{r.accountingForm ? getLabel('accounting_form', r.accountingForm, r.accountingForm) : <span className={s.locMuted}>—</span>}</td>
                      <td>{r.locationFunction ? getLabel('location_function', r.locationFunction, r.locationFunction) : <span className={s.locMuted}>—</span>}</td>
                      <td>
                        <span className={`${s.locStatus} ${STATUS_CLASS[r.status] ?? ''}`}>
                          {getLabel('location_status', r.status, r.status)}
                        </span>
                      </td>
                      <td>{r.startDate ? fmtDate(r.startDate) : <span className={s.locMuted}>—</span>}</td>
                      <td>{r.endDate ? fmtDate(r.endDate) : <span className={s.locMuted}>—</span>}</td>
                      <td title={r.notes || ''}>{r.notes || <span className={s.locMuted}>—</span>}</td>
                      <td className={s.locCenter}>
                        <button className={s.locFileBtn} onClick={() => setFilesFor(r)} title="Quản lý file đính kèm">
                          <Paperclip size={13} />
                          {fileCounts[r.id] > 0 && <span className={s.locFileCount}>{fileCounts[r.id]}</span>}
                        </button>
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

      {filesFor && (
        <LocationFilesModal
          location={filesFor}
          canEdit={canEdit}
          onClose={() => setFilesFor(null)}
          onChanged={() => loadFileCounts(rows)}
        />
      )}
    </div>
  )
}
