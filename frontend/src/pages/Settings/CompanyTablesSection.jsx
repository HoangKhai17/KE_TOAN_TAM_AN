import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Loader2, Columns, Power, ChevronUp, ChevronDown, GripVertical } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { useDeleteConfirm } from '../../components/ui/DeleteConfirmDialog'
import { SortableList, SortableItem } from '../../components/ui/SortableList'
import { useToastStore } from '../../stores/toastStore'
import * as api from '../../api/companyTables'
import { checkSyntax, extractRefs } from '../../utils/formula'
import s from './settings.module.css'

const TYPE_LABELS = { text: 'Văn bản', number: 'Số', date: 'Ngày', select: 'Lựa chọn', link: 'Link', file: 'File đính kèm', formula: 'Công thức', computed: 'Computed' }
const COMPUTED_LABELS = { days_until: 'Số ngày còn lại', days_since: 'Số ngày chậm', months_since: 'Số tháng chậm', status_threshold: 'Tô màu theo ngưỡng' }
const TONES = ['success', 'warning', 'danger', 'info', 'muted']

const row = { display: 'flex', alignItems: 'center', gap: 8 }

// ── Def create/edit modal ─────────────────────────────────────────────────────
function DefModal({ def, parentDefId, onClose, onSaved }) {
  const [form, setForm] = useState({ name: def?.name ?? '', icon: def?.icon ?? '', description: def?.description ?? '' })
  const [saving, setSaving] = useState(false)
  const addToast = useToastStore((st) => st.toast)
  const isChild = !def && !!parentDefId
  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const saved = def ? await api.updateDef(def.id, form)
        : await api.createDef(parentDefId ? { ...form, parentDefId } : form)
      onSaved(saved)
    } catch (e) { addToast(e.response?.data?.error?.message ?? 'Không thể lưu bảng', 'error') } finally { setSaving(false) }
  }
  return (
    <Modal title={def ? 'Sửa bảng' : isChild ? 'Tạo bảng con' : 'Tạo bảng mới'} onClose={onClose}>
      <div style={{ display: 'grid', gap: 12 }}>
        <label>Tên tab *
          <input className={s.settingsInput} value={form.name} autoFocus
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </label>
        <label>Icon (tên lucide, tùy chọn)
          <input className={s.settingsInput} value={form.icon} placeholder="vd: ShieldCheck"
            onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} />
        </label>
        <label>Mô tả
          <input className={s.settingsInput} value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </label>
      </div>
      <div style={{ ...row, justifyContent: 'flex-end', marginTop: 16 }}>
        <button className={s.btnOutline} onClick={onClose} disabled={saving}>Huỷ</button>
        <button className={s.btnSave} onClick={save} disabled={saving}>
          {saving && <Loader2 size={13} className={s.spin} />} Lưu
        </button>
      </div>
    </Modal>
  )
}

// ── Column create/edit modal ──────────────────────────────────────────────────
function ColumnModal({ defColumns, column, onClose, onSaved }) {
  const addToast = useToastStore((st) => st.toast)
  const [form, setForm] = useState({
    label: column?.label ?? '', dataType: column?.dataType ?? 'text',
    required: column?.required ?? false, width: column?.width ?? '',
    options: (Array.isArray(column?.options) ? column.options : []).join('\n'),
    multiple: column?.options?.multiple ?? true,               // link/file: cho nhiều
    expression: column?.computedConfig?.expression ?? '',      // formula
    resultType: column?.computedConfig?.resultType ?? 'number',
    computedType: column?.computedType ?? 'days_until',
    sourceCol: column?.computedConfig?.source_col ?? '',
    buckets: column?.computedConfig?.buckets ?? [
      { max: 0, label: 'Quá hạn', tone: 'danger' },
      { max: 30, label: 'Sắp đến hạn', tone: 'warning' },
      { max: null, label: 'Bình thường', tone: 'success' },
    ],
    nullLabel: column?.computedConfig?.null_label ?? 'Không xác định',
    mode: column?.computedConfig?.mode ?? 'days_until',
  })
  const [saving, setSaving] = useState(false)
  const dateNumberCols = defColumns.filter((c) => c.dataType === 'date' || c.dataType === 'number')

  // Kiểm công thức: cú pháp + cột tham chiếu có tồn tại (trừ chính cột đang sửa)
  const knownKeys = new Set(defColumns.map((c) => c.colKey))
  const formulaSyntax = form.dataType === 'formula' ? checkSyntax(form.expression) : { ok: true }
  const formulaRefs = form.dataType === 'formula' ? extractRefs(form.expression) : []
  const unknownRefs = formulaRefs.filter((k) => !knownKeys.has(k))
  const formulaValid = form.dataType !== 'formula' || (form.expression.trim() !== '' && formulaSyntax.ok && unknownRefs.length === 0)

  function insertToken(key) {
    setForm((f) => ({ ...f, expression: `${f.expression}{${key}}` }))
  }

  function buildBody() {
    const body = {
      label: form.label.trim(),
      dataType: form.dataType,
      required: form.required,
      width: form.width === '' ? null : Number(form.width),
    }
    if (form.dataType === 'select') {
      body.options = form.options.split('\n').map((x) => x.trim()).filter(Boolean)
    }
    if (form.dataType === 'link' || form.dataType === 'file') {
      body.options = { multiple: !!form.multiple }
    }
    if (form.dataType === 'formula') {
      body.required = false
      body.computedConfig = { expression: form.expression.trim(), resultType: form.resultType }
    }
    if (form.dataType === 'computed') {
      body.computedType = form.computedType
      if (form.computedType === 'status_threshold') {
        body.computedConfig = {
          source_col: form.sourceCol, mode: form.mode,
          buckets: form.buckets.map((b) => ({ max: b.max === '' || b.max === null ? null : Number(b.max), label: b.label, tone: b.tone })),
          null_label: form.nullLabel, null_tone: 'muted',
        }
      } else {
        body.computedConfig = { source_col: form.sourceCol }
      }
    }
    return body
  }

  async function save() {
    if (!form.label.trim()) return
    if (form.dataType === 'formula' && !formulaValid) {
      addToast(form.expression.trim() === '' ? 'Chưa nhập công thức'
        : unknownRefs.length ? `Cột không tồn tại: ${unknownRefs.join(', ')}`
        : `Công thức lỗi cú pháp (${formulaSyntax.error})`, 'error')
      return
    }
    setSaving(true)
    try {
      const saved = column ? await api.updateColumn(column.id, buildBody()) : await api.addColumn(defColumns._defId, buildBody())
      onSaved(saved)
    } catch { addToast('Không thể lưu cột', 'error') } finally { setSaving(false) }
  }

  const setBucket = (i, key, val) => setForm((f) => ({ ...f, buckets: f.buckets.map((b, j) => j === i ? { ...b, [key]: val } : b) }))

  return (
    <Modal title={column ? 'Sửa cột' : 'Thêm cột'} onClose={onClose} wide>
      <div style={{ display: 'grid', gap: 12 }}>
        <label>Nhãn hiển thị *
          <input className={s.settingsInput} value={form.label} autoFocus
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
        </label>
        <div style={row}>
          <label style={{ flex: 1 }}>Kiểu dữ liệu
            <select className={s.settingsInput} value={form.dataType}
              onChange={(e) => setForm((f) => ({ ...f, dataType: e.target.value }))}>
              {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label style={{ width: 110 }}>Rộng (px)
            <input type="number" className={s.settingsInput} value={form.width}
              onChange={(e) => setForm((f) => ({ ...f, width: e.target.value }))} />
          </label>
          <label style={{ ...row, alignSelf: 'flex-end', paddingBottom: 8 }}>
            <input type="checkbox" checked={form.required}
              onChange={(e) => setForm((f) => ({ ...f, required: e.target.checked }))} /> Bắt buộc
          </label>
        </div>

        {form.dataType === 'select' && (
          <label>Các giá trị (mỗi dòng 1 giá trị)
            <textarea className={s.settingsInput} rows={4} value={form.options}
              onChange={(e) => setForm((f) => ({ ...f, options: e.target.value }))} />
          </label>
        )}

        {(form.dataType === 'link' || form.dataType === 'file') && (
          <label style={{ ...row }}>
            <input type="checkbox" checked={form.multiple}
              onChange={(e) => setForm((f) => ({ ...f, multiple: e.target.checked }))} />
            Cho phép nhiều {form.dataType === 'link' ? 'link' : 'file'}
          </label>
        )}

        {form.dataType === 'formula' && (
          <div style={{ border: '1px solid var(--color-border-muted)', borderRadius: 8, padding: 10, display: 'grid', gap: 8 }}>
            <label>Công thức
              <textarea className={s.settingsInput} rows={3} value={form.expression}
                placeholder="VD: {so_luong} * {don_gia}   ·   IF({con_lai} < 0, 'Quá hạn', 'Còn hạn')"
                onChange={(e) => setForm((f) => ({ ...f, expression: e.target.value }))} />
            </label>
            <div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-muted)', marginBottom: 4 }}>Chèn cột (bấm để thêm):</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {defColumns.filter((c) => !column || c.colKey !== column.colKey).map((c) => (
                  <button key={c.colKey} type="button" className={s.btnOutline}
                    style={{ padding: '2px 8px', fontSize: 'var(--fs-2xs)' }}
                    onClick={() => insertToken(c.colKey)} title={c.colKey}>{c.label}</button>
                ))}
                {defColumns.length === 0 && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-muted)' }}>Chưa có cột nào để tham chiếu.</span>}
              </div>
            </div>
            <label style={{ width: 180 }}>Kiểu kết quả
              <select className={s.settingsInput} value={form.resultType}
                onChange={(e) => setForm((f) => ({ ...f, resultType: e.target.value }))}>
                <option value="number">Số</option>
                <option value="text">Văn bản</option>
              </select>
            </label>
            {form.expression.trim() && (
              <div style={{ fontSize: 'var(--fs-xs)' }}>
                {!formulaSyntax.ok
                  ? <span style={{ color: 'var(--color-danger)' }}>✗ Lỗi cú pháp ({formulaSyntax.error})</span>
                  : unknownRefs.length
                    ? <span style={{ color: 'var(--color-danger)' }}>✗ Cột không tồn tại: {unknownRefs.join(', ')}</span>
                    : <span style={{ color: 'var(--color-success)' }}>✓ Hợp lệ{formulaRefs.length ? ` · dùng: ${formulaRefs.join(', ')}` : ''}</span>}
              </div>
            )}
            <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--color-muted)', lineHeight: 1.5 }}>
              Hàm: IF AND OR NOT SUM MIN MAX AVG ROUND ABS CONCAT LEN TODAY DATEDIFF · Toán tử: + − × / % ^ &amp; = &lt;&gt; &lt; &lt;= &gt; &gt;= · Tham chiếu cột bằng {'{col_key}'}.
            </div>
          </div>
        )}

        {form.dataType === 'computed' && (
          <>
            <div style={row}>
              <label style={{ flex: 1 }}>Loại computed
                <select className={s.settingsInput} value={form.computedType}
                  onChange={(e) => setForm((f) => ({ ...f, computedType: e.target.value, mode: e.target.value === 'days_since' ? 'days_since' : 'days_until' }))}>
                  {Object.entries(COMPUTED_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label style={{ flex: 1 }}>Cột nguồn (date/number)
                <select className={s.settingsInput} value={form.sourceCol}
                  onChange={(e) => setForm((f) => ({ ...f, sourceCol: e.target.value }))}>
                  <option value="">— chọn —</option>
                  {dateNumberCols.map((c) => <option key={c.colKey} value={c.colKey}>{c.label}</option>)}
                </select>
              </label>
            </div>
            {form.computedType === 'status_threshold' && (
              <div style={{ border: '1px solid var(--color-border-muted)', borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-muted)', marginBottom: 6 }}>Ngưỡng (xét từ trên xuống; max trống = còn lại)</div>
                {form.buckets.map((b, i) => (
                  <div key={i} style={{ ...row, marginBottom: 6 }}>
                    <span style={{ fontSize: 'var(--fs-xs)' }}>≤</span>
                    <input type="number" className={s.settingsInput} style={{ width: 70 }} value={b.max ?? ''}
                      placeholder="∞" onChange={(e) => setBucket(i, 'max', e.target.value)} />
                    <input className={s.settingsInput} style={{ flex: 1 }} value={b.label}
                      placeholder="Nhãn" onChange={(e) => setBucket(i, 'label', e.target.value)} />
                    <select className={s.settingsInput} style={{ width: 110 }} value={b.tone}
                      onChange={(e) => setBucket(i, 'tone', e.target.value)}>
                      {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button className={s.btnOutline} onClick={() => setForm((f) => ({ ...f, buckets: f.buckets.filter((_, j) => j !== i) }))}>×</button>
                  </div>
                ))}
                <button className={s.btnAddSmall} onClick={() => setForm((f) => ({ ...f, buckets: [...f.buckets, { max: '', label: '', tone: 'muted' }] }))}>
                  <Plus size={12} /> Thêm ngưỡng
                </button>
                <label style={{ display: 'block', marginTop: 8 }}>Nhãn khi trống
                  <input className={s.settingsInput} value={form.nullLabel}
                    onChange={(e) => setForm((f) => ({ ...f, nullLabel: e.target.value }))} />
                </label>
              </div>
            )}
          </>
        )}
      </div>
      <div style={{ ...row, justifyContent: 'flex-end', marginTop: 16 }}>
        <button className={s.btnOutline} onClick={onClose} disabled={saving}>Huỷ</button>
        <button className={s.btnSave} onClick={save} disabled={saving}>
          {saving && <Loader2 size={13} className={s.spin} />} Lưu cột
        </button>
      </div>
    </Modal>
  )
}

// ── Main section ──────────────────────────────────────────────────────────────
export default function CompanyTablesSection() {
  const confirmDelete = useDeleteConfirm()
  const addToast = useToastStore((st) => st.toast)
  const [defs, setDefs] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null) // def id
  const [defModal, setDefModal] = useState(null)  // {def}|{}
  const [colModal, setColModal] = useState(null)  // {column}|{}

  function reload() {
    setLoading(true)
    api.listDefs().then((d) => setDefs(d)).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { reload() }, [])

  const selDef = defs.find((d) => d.id === selected)
  const topDefs = defs.filter((d) => !d.parentDefId)                                  // bảng cấp cao (tab chính)
  const selChildren = selDef && !selDef.parentDefId ? defs.filter((d) => d.parentDefId === selDef.id) : []
  const selParent = selDef?.parentDefId ? defs.find((d) => d.id === selDef.parentDefId) : null

  async function toggleActive(def) {
    try { await api.updateDef(def.id, { isActive: !def.isActive }); reload() }
    catch { addToast('Không thể đổi trạng thái', 'error') }
  }
  async function removeDef(def) {
    if (!(await confirmDelete({ title: 'Xóa bảng dữ liệu', message: <>Xóa bảng <strong>“{def.name}”</strong> và toàn bộ dữ liệu của bảng này ở mọi công ty?</> }))) return
    try { await api.deleteDef(def.id); if (selected === def.id) setSelected(null); reload() }
    catch (e) { addToast(e.response?.data?.error?.message ?? 'Không thể xóa', 'error') }
  }
  async function removeCol(col) {
    if (!(await confirmDelete({ title: 'Xóa cột dữ liệu', message: <>Bạn có chắc chắn muốn xóa cột <strong>“{col.label}”</strong>?</>, warning: 'Dữ liệu của cột này tại các công ty sẽ không còn hiển thị.' }))) return
    try { await api.deleteColumn(col.id); reload() }
    catch { addToast('Không thể xóa cột', 'error') }
  }
  // Kéo-thả đổi thứ tự BẢNG cấp cao → đổi luôn thứ tự tab trong Chi tiết khách hàng.
  // Giữ nguyên các bảng con trong state (chỉ sắp lại nhóm cấp cao).
  async function reorderDefs(newIds) {
    const prev = defs
    const children = prev.filter((d) => d.parentDefId)
    setDefs([...newIds.map((id) => prev.find((d) => d.id === id)), ...children])   // optimistic
    try { await api.reorderDefs(newIds) }
    catch {
      setDefs(prev)                                              // revert
      addToast('Không thể đổi thứ tự bảng', 'error')
    }
  }

  // Đổi thứ tự BẢNG CON (sub-tab) trong phạm vi cùng bảng cha
  async function moveChild(children, idx, dir) {
    const j = idx + dir
    if (j < 0 || j >= children.length) return
    const ids = children.map((c) => c.id)
    ;[ids[idx], ids[j]] = [ids[j], ids[idx]]
    try { await api.reorderDefs(ids); reload() }
    catch { addToast('Không thể đổi thứ tự bảng con', 'error') }
  }

  async function moveColumn(idx, dir) {
    const cols = selDef?.columns ?? []
    const j = idx + dir
    if (j < 0 || j >= cols.length) return
    const ids = cols.map((c) => c.id)
    ;[ids[idx], ids[j]] = [ids[j], ids[idx]]
    try { await api.reorderColumns(selDef.id, ids); reload() }
    catch { addToast('Không thể đổi thứ tự cột', 'error') }
  }

  return (
    <div>
      <div style={{ ...row, justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 className={s.sectionTitle}>Bảng tùy chỉnh (Company tables)</h3>
        <button className={s.btnSave} onClick={() => setDefModal({})}><Plus size={14} /> Tạo bảng mới</button>
      </div>
      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--color-muted)', marginTop: 0 }}>
        Tab báo cáo tự tạo — áp dụng cho TẤT CẢ công ty.
      </p>

      {loading ? <div><Loader2 size={16} className={s.spin} /> Đang tải...</div> : (
        <table className={s.settingsTable}>
          <thead><tr><th style={{ width: 34 }}></th><th>Tab</th><th>Key</th><th>Số cột</th><th>Hiện</th><th></th></tr></thead>
          <tbody>
            {topDefs.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--color-muted)' }}>Chưa có bảng nào.</td></tr>}
            <SortableList ids={topDefs.map((d) => d.id)} onReorder={reorderDefs}>
            {topDefs.map((d) => (
              <SortableItem key={d.id} id={d.id}>
              {({ setNodeRef, style, handleProps }) => (
              <tr ref={setNodeRef} style={{ ...style, ...(selected === d.id ? { background: 'var(--color-primary-bg)' } : null) }}>
                <td>
                  <button className={s.btnOutline} title="Kéo để đổi thứ tự tab" style={{ cursor: 'grab', padding: 4 }} {...handleProps}>
                    <GripVertical size={13} color="var(--color-muted)" />
                  </button>
                </td>
                <td>{d.name}{d.isSystem && <span style={{ marginLeft: 6, fontSize: 'var(--fs-2xs)', color: 'var(--color-muted)' }}>(hệ thống)</span>}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)' }}>{d.tableKey}</td>
                <td>{d.columns?.length ?? 0}</td>
                <td>
                  <button className={s.btnOutline} onClick={() => toggleActive(d)} title={d.isActive ? 'Đang hiện' : 'Đang ẩn'}>
                    <Power size={13} color={d.isActive ? 'var(--color-success)' : 'var(--color-muted)'} />
                  </button>
                </td>
                <td>
                  <div style={row}>
                    <button className={s.btnOutline} onClick={() => setSelected(d.id)}><Columns size={13} /> Cột</button>
                    <button className={s.btnOutline} onClick={() => setDefModal({ def: d })}><Pencil size={13} /></button>
                    {!d.isSystem && <button className={s.btnOutline} onClick={() => removeDef(d)}><Trash2 size={13} color="var(--color-danger)" /></button>}
                  </div>
                </td>
              </tr>
              )}
              </SortableItem>
            ))}
            </SortableList>
          </tbody>
        </table>
      )}

      {selDef?.parentDefId && (
        <div style={{ marginTop: 16, ...row, gap: 10 }}>
          <button className={s.btnOutline} onClick={() => setSelected(selDef.parentDefId)}>← Bảng cha: {selParent?.name}</button>
          <span style={{ color: 'var(--color-muted)', fontSize: 'var(--fs-sm)' }}>Đang chỉnh cột của bảng con “{selDef.name}”.</span>
        </div>
      )}

      {selDef && (
        <div style={{ marginTop: 20, border: '1px solid var(--color-border-muted)', borderRadius: 10, padding: 14 }}>
          <div style={{ ...row, justifyContent: 'space-between', marginBottom: 10 }}>
            <h4 className={s.sectionTitle} style={{ margin: 0 }}>Cột của “{selDef.name}”</h4>
            <button className={s.btnSave} onClick={() => setColModal({})}><Plus size={13} /> Thêm cột</button>
          </div>
          <table className={s.settingsTable}>
            <thead><tr><th>Nhãn</th><th>Key</th><th>Kiểu</th><th>Bắt buộc</th><th></th></tr></thead>
            <tbody>
              {(selDef.columns ?? []).map((c, idx, arr) => (
                <tr key={c.id}>
                  <td>{c.label}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)' }}>{c.colKey}</td>
                  <td>{TYPE_LABELS[c.dataType]}{c.dataType === 'computed' && ` · ${COMPUTED_LABELS[c.computedType] ?? ''}`}</td>
                  <td>{c.required ? '✓' : ''}</td>
                  <td>
                    <div style={row}>
                      <button className={s.btnOutline} disabled={idx === 0} title="Lên" onClick={() => moveColumn(idx, -1)}><ChevronUp size={13} /></button>
                      <button className={s.btnOutline} disabled={idx === arr.length - 1} title="Xuống" onClick={() => moveColumn(idx, 1)}><ChevronDown size={13} /></button>
                      <button className={s.btnOutline} onClick={() => setColModal({ column: c })}><Pencil size={13} /></button>
                      <button className={s.btnOutline} onClick={() => removeCol(c)}><Trash2 size={13} color="var(--color-danger)" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {(selDef.columns ?? []).length === 0 && <tr><td colSpan={5} style={{ color: 'var(--color-muted)' }}>Chưa có cột.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Bảng con (sub-tab) — chỉ cho bảng CẤP CAO, 1 cấp */}
      {selDef && !selDef.parentDefId && (
        <div style={{ marginTop: 16, border: '1px dashed var(--color-border-muted)', borderRadius: 10, padding: 14 }}>
          <div style={{ ...row, justifyContent: 'space-between', marginBottom: 10 }}>
            <h4 className={s.sectionTitle} style={{ margin: 0 }}>
              Bảng con của “{selDef.name}”
              <span style={{ fontWeight: 400, fontSize: 'var(--fs-xs)', color: 'var(--color-muted)', marginLeft: 6 }}>(hiện dạng sub-tab)</span>
            </h4>
            <button className={s.btnSave} onClick={() => setDefModal({ parentDefId: selDef.id })}><Plus size={13} /> Thêm bảng con</button>
          </div>
          {selChildren.length === 0 ? (
            <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--color-muted)', margin: 0 }}>
              Chưa có bảng con. Bảng con là bảng <strong>song song</strong> (cột & dữ liệu riêng), người dùng chuyển qua lại bằng sub-tab.
            </p>
          ) : (
            <table className={s.settingsTable}>
              <thead><tr><th>Tên</th><th>Key</th><th>Số cột</th><th>Hiện</th><th></th></tr></thead>
              <tbody>
                {selChildren.map((c, idx, arr) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)' }}>{c.tableKey}</td>
                    <td>{c.columns?.length ?? 0}</td>
                    <td>
                      <button className={s.btnOutline} onClick={() => toggleActive(c)} title={c.isActive ? 'Đang hiện' : 'Đang ẩn'}>
                        <Power size={13} color={c.isActive ? 'var(--color-success)' : 'var(--color-muted)'} />
                      </button>
                    </td>
                    <td>
                      <div style={row}>
                        <button className={s.btnOutline} disabled={idx === 0} title="Lên" onClick={() => moveChild(arr, idx, -1)}><ChevronUp size={13} /></button>
                        <button className={s.btnOutline} disabled={idx === arr.length - 1} title="Xuống" onClick={() => moveChild(arr, idx, 1)}><ChevronDown size={13} /></button>
                        <button className={s.btnOutline} onClick={() => setSelected(c.id)}><Columns size={13} /> Cột</button>
                        <button className={s.btnOutline} onClick={() => setDefModal({ def: c })}><Pencil size={13} /></button>
                        <button className={s.btnOutline} onClick={() => removeDef(c)}><Trash2 size={13} color="var(--color-danger)" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {defModal && (
        <DefModal def={defModal.def} parentDefId={defModal.parentDefId}
          onClose={() => setDefModal(null)} onSaved={() => { setDefModal(null); reload() }} />
      )}
      {colModal && selDef && (
        <ColumnModal
          defColumns={Object.assign(selDef.columns ?? [], { _defId: selDef.id })}
          column={colModal.column}
          onClose={() => setColModal(null)}
          onSaved={() => { setColModal(null); reload() }}
        />
      )}
    </div>
  )
}
