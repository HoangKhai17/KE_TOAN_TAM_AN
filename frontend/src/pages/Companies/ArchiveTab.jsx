import { useState, useEffect, useRef } from 'react'
import {
  Archive, Plus, Pencil, Trash2, Loader2, AlertTriangle, Check,
} from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as archiveApi from '../../api/archive'
import s from './companies.module.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = ['1','2','3','4','5','6','7','8','9','10','11','12']
const MONTH_LABELS = {
  '1':'T1','2':'T2','3':'T3','4':'T4','5':'T5','6':'T6',
  '7':'T7','8':'T8','9':'T9','10':'T10','11':'T11','12':'T12',
}

// Cột cố định + 12 tháng + Năm + Ghi chú + Đặc điểm + Actions
const COL_COUNT_BASE = 18 // không có cột Actions

function countFilledMonths(months) {
  if (!months) return 0
  return MONTHS.filter((m) => (months[m] ?? '').trim() !== '').length
}

// ── MonthCell — inline click-to-edit ──────────────────────────────────────────

function MonthCell({ value, canEdit, onSave }) {
  const [editing,  setEditing]  = useState(false)
  const [localVal, setLocalVal] = useState(value ?? '')
  const inputRef                = useRef(null)

  // Sync local value when parent updates after API save
  useEffect(() => { setLocalVal(value ?? '') }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  function commit() {
    setEditing(false)
    const trimmed = localVal.trim()
    if (trimmed !== (value ?? '').trim()) onSave(trimmed)
  }

  return (
    <td
      className={`${s.archMonthCell} ${canEdit ? s.archMonthCellEditable : ''}`}
      onClick={() => canEdit && !editing && setEditing(true)}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={localVal}
          className={s.archMonthInput}
          onChange={(e) => setLocalVal(e.target.value)}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            if (e.key === 'Escape') { setLocalVal(value ?? ''); setEditing(false) }
          }}
        />
      ) : (
        <span className={(value ?? '').trim() ? s.archMonthValFilled : s.archMonthValEmpty}>
          {(value ?? '').trim()}
        </span>
      )}
    </td>
  )
}

// ── AddYearModal ──────────────────────────────────────────────────────────────

function AddYearModal({ existingYears, onSave, onClose }) {
  const curYear = new Date().getFullYear()
  const [year,   setYear]   = useState(String(curYear))
  const [notes,  setNotes]  = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    const y = parseInt(year, 10)
    if (isNaN(y) || y < 2000 || y > 2100) { setError('Năm không hợp lệ (2000–2100)'); return }
    if (existingYears.includes(y))         { setError(`Năm ${y} đã tồn tại`);          return }
    setError(null)
    setSaving(true)
    try {
      await onSave({ year: y, notes: notes.trim() || null })
    } catch (err) {
      setError(err.response?.data?.error?.message ?? 'Không thể tạo năm')
      setSaving(false)
    }
  }

  return (
    <Modal title="Thêm năm lưu trữ" onClose={onClose}>
      <form onSubmit={handleSubmit} className={s.modalForm}>
        {error && <div className={s.errorBox}>{error}</div>}
        <div>
          <label className={`${s.formLabel} ${s.formLabelReq}`}>Năm</label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            min="2000" max="2100"
            className={s.formInput}
            autoFocus
          />
        </div>
        <div>
          <label className={s.formLabel}>Ghi chú năm</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={s.formTextarea}
            placeholder="VD: HĐ nguyên tắc 22/05/2026 — Bản giấy, hai bên ký + đóng dấu"
          />
        </div>
        <div className={s.modalActions}>
          <button type="button" onClick={onClose} className={s.btnOutline}>Huỷ</button>
          <button type="submit" disabled={saving} className={s.btnNavy}>
            {saving ? <Loader2 size={13} className={s.spin} /> : <Plus size={13} />}
            {saving ? 'Đang lưu...' : 'Tạo năm'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── DocFormModal ──────────────────────────────────────────────────────────────

function DocFormModal({ initialDoc, onSave, onClose }) {
  const isEdit = !!initialDoc
  const [documentType,    setDocumentType]    = useState(initialDoc?.documentType    ?? '')
  const [detail,          setDetail]          = useState(initialDoc?.detail          ?? '')
  const [notes,           setNotes]           = useState(initialDoc?.notes           ?? '')
  const [characteristics, setCharacteristics] = useState(initialDoc?.characteristics ?? '')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!documentType.trim()) { setError('Vui lòng nhập loại chứng từ'); return }
    setError(null)
    setSaving(true)
    try {
      await onSave({
        documentType:    documentType.trim(),
        detail:          detail.trim()          || null,
        notes:           notes.trim()           || null,
        characteristics: characteristics.trim() || null,
      })
    } catch (err) {
      setError(err.response?.data?.error?.message ?? 'Không thể lưu')
      setSaving(false)
    }
  }

  return (
    <Modal title={isEdit ? 'Chỉnh sửa chứng từ' : 'Thêm loại chứng từ'} onClose={onClose}>
      <form onSubmit={handleSubmit} className={s.modalForm}>
        {error && <div className={s.errorBox}>{error}</div>}
        <div>
          <label className={`${s.formLabel} ${s.formLabelReq}`}>Loại chứng từ</label>
          <input
            type="text"
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            className={s.formInput}
            placeholder="VD: Bảng chấm công + Bảng lương"
            maxLength={300}
            autoFocus
          />
        </div>
        <div>
          <label className={s.formLabel}>Chi tiết</label>
          <input
            type="text"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            className={s.formInput}
            placeholder="Mô tả bổ sung (tùy chọn)"
            maxLength={500}
          />
        </div>
        <div>
          <label className={s.formLabel}>Đặc điểm</label>
          <input
            type="text"
            value={characteristics}
            onChange={(e) => setCharacteristics(e.target.value)}
            className={s.formInput}
            placeholder="VD: Song ngữ, Bản giấy + bản scan"
            maxLength={300}
          />
        </div>
        <div>
          <label className={s.formLabel}>Ghi chú</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={s.formTextarea}
            placeholder="Ghi chú nội bộ (tùy chọn)"
          />
        </div>
        <div className={s.modalActions}>
          <button type="button" onClick={onClose} className={s.btnOutline}>Huỷ</button>
          <button type="submit" disabled={saving} className={s.btnNavy}>
            {saving ? <Loader2 size={13} className={s.spin} /> : <Check size={13} />}
            {saving ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Thêm'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── ArchiveTab ─────────────────────────────────────────────────────────────────

export default function ArchiveTab({ company }) {
  const companyId   = company.id
  const currentUser = useAuthStore((st) => st.user)
  const isAdmin     = currentUser?.role === 'admin'
  const canEdit     = isAdmin || company.assignedStaffId === currentUser?.id
  const addToast    = useToastStore((st) => st.toast)

  const [years,       setYears]       = useState([])
  const [activeYear,  setActiveYear]  = useState(null)
  const [docs,        setDocs]        = useState([])
  const [loading,     setLoading]     = useState(true)
  const [docsLoading, setDocsLoading] = useState(false)

  const [showAddYear,    setShowAddYear]    = useState(false)
  const [showAddDoc,     setShowAddDoc]     = useState(false)
  const [editDoc,        setEditDoc]        = useState(null)
  const [deleteDocId,    setDeleteDocId]    = useState(null)
  const [showDeleteYear, setShowDeleteYear] = useState(false)
  const [deleting,       setDeleting]       = useState(false)

  // ── Load years ───────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    archiveApi.listYears(companyId)
      .then((list) => {
        if (cancelled) return
        setYears(list)
        setActiveYear(list[0] ?? null)
      })
      .catch(() => addToast('Không thể tải danh sách năm', 'error'))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load docs khi đổi năm ────────────────────────────────────────────────────

  useEffect(() => {
    if (!activeYear) { setDocs([]); return }
    let cancelled = false
    setDocsLoading(true)
    archiveApi.listDocs(companyId, activeYear.id)
      .then((list) => { if (!cancelled) setDocs(list) })
      .catch(() => addToast('Không thể tải danh sách chứng từ', 'error'))
      .finally(() => { if (!cancelled) setDocsLoading(false) })
    return () => { cancelled = true }
  }, [companyId, activeYear?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Year handlers ────────────────────────────────────────────────────────────

  async function handleAddYear({ year, notes }) {
    const created = await archiveApi.createYear(companyId, { year, notes })
    setYears((prev) => [...prev, created].sort((a, b) => b.year - a.year))
    setActiveYear(created)
    setShowAddYear(false)
    addToast(`Đã tạo năm ${created.year}`, 'success')
  }

  async function handleDeleteYear() {
    if (!activeYear) return
    setDeleting(true)
    try {
      await archiveApi.deleteYear(companyId, activeYear.id)
      const remaining = years.filter((y) => y.id !== activeYear.id)
      setYears(remaining)
      setActiveYear(remaining[0] ?? null)
      setShowDeleteYear(false)
      addToast(`Đã xoá năm ${activeYear.year}`, 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể xoá năm', 'error')
    } finally {
      setDeleting(false)
    }
  }

  // ── Doc handlers ─────────────────────────────────────────────────────────────

  async function handleAddDoc(body) {
    const doc = await archiveApi.createDoc(companyId, activeYear.id, body)
    setDocs((prev) => [...prev, doc])
    setShowAddDoc(false)
    addToast('Đã thêm loại chứng từ', 'success')
  }

  async function handleEditDoc(body) {
    const updated = await archiveApi.updateDoc(companyId, activeYear.id, editDoc.id, body)
    setDocs((prev) => prev.map((d) => d.id === updated.id ? updated : d))
    setEditDoc(null)
    addToast('Đã cập nhật', 'success')
  }

  async function handleDeleteDoc() {
    if (!deleteDocId) return
    setDeleting(true)
    try {
      await archiveApi.deleteDoc(companyId, activeYear.id, deleteDocId)
      setDocs((prev) => prev.filter((d) => d.id !== deleteDocId))
      setDeleteDocId(null)
      addToast('Đã xoá dòng chứng từ', 'success')
    } catch {
      addToast('Không thể xoá', 'error')
    } finally {
      setDeleting(false)
    }
  }

  async function handleMonthSave(docId, month, value) {
    try {
      const updated = await archiveApi.updateDoc(companyId, activeYear.id, docId, {
        months: { [month]: value },
      })
      setDocs((prev) => prev.map((d) => d.id === docId ? updated : d))
    } catch {
      addToast('Không thể lưu ô tháng', 'error')
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={s.loadingCenter}>
        <Loader2 size={18} className={s.spin} style={{ marginRight: 8 }} />
        Đang tải...
      </div>
    )
  }

  const colSpan = COL_COUNT_BASE + (canEdit ? 1 : 0)

  return (
    <div>
      {/* ── Toolbar ───────────────────────────────────────────────────────────── */}
      <div className={s.archToolbar}>
        <div className={s.archYearPills}>
          {years.map((y) => (
            <button
              key={y.id}
              className={`${s.archYearPill} ${activeYear?.id === y.id ? s.archYearPillActive : ''}`}
              onClick={() => setActiveYear(y)}
            >
              {y.year}
            </button>
          ))}
          {canEdit && (
            <button className={s.archYearPillAdd} onClick={() => setShowAddYear(true)}>
              <Plus size={12} /> Thêm năm
            </button>
          )}
        </div>

        {activeYear && canEdit && (
          <div className={s.archToolbarRight}>
            <button className={s.btnNavy} onClick={() => setShowAddDoc(true)}>
              <Plus size={13} /> Thêm dòng
            </button>
            <button
              className={`${s.rowActionBtn} ${s.rowActionDanger}`}
              title={`Xoá năm ${activeYear.year}`}
              onClick={() => setShowDeleteYear(true)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ── Year notes banner ─────────────────────────────────────────────────── */}
      {activeYear?.notes && (
        <div className={s.archNotesBanner}>
          <Archive size={13} className={s.archNotesBannerIcon} />
          <span>{activeYear.notes}</span>
        </div>
      )}

      {/* ── Trạng thái không có năm ───────────────────────────────────────────── */}
      {!activeYear && (
        <div className={s.placeholderTab}>
          <div className={s.placeholderIcon}>
            <Archive size={28} color="#94a3b8" />
          </div>
          <p className={s.placeholderTitle}>Chưa có năm lưu trữ</p>
          <p className={s.placeholderDesc}>
            {canEdit
              ? 'Nhấn "Thêm năm" để bắt đầu theo dõi hồ sơ lưu trữ.'
              : 'Chưa có dữ liệu lưu trữ cho công ty này.'}
          </p>
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────────────── */}
      {activeYear && (
        <div className={s.tableWrap}>
          <div className={`${s.tableScroll} ${s.archTableScroll}`}>
            <table className={`${s.table} ${s.archTable}`}>
              <thead>
                <tr>
                  <th className={s.archThStt}>#</th>
                  <th className={s.archThDocType}>Loại chứng từ</th>
                  <th className={s.archThDetail}>Chi tiết</th>
                  {MONTHS.map((m) => (
                    <th key={m} className={s.archThMonth}>{MONTH_LABELS[m]}</th>
                  ))}
                  <th className={s.archThYear}>Năm</th>
                  <th className={s.archThNotes}>Ghi chú</th>
                  <th className={s.archThChar}>Đặc điểm</th>
                  {canEdit && <th className={s.archThActions} />}
                </tr>
              </thead>

              <tbody>
                {docsLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: colSpan }).map((_, j) => (
                        <td key={j} className={s.taskSkeletonCell}>
                          <div className={s.taskSkeletonBar} style={{ '--skeleton-w': '60px' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : docs.length === 0 ? (
                  <tr>
                    <td colSpan={colSpan} className={s.archEmptyRow}>
                      <Archive size={18} style={{ opacity: 0.3, verticalAlign: 'middle', marginRight: 8 }} />
                      Chưa có dòng chứng từ nào.
                      {canEdit && ' Nhấn "Thêm dòng" để bắt đầu.'}
                    </td>
                  </tr>
                ) : docs.map((doc, idx) => (
                  <tr key={doc.id} className={s.archDocRow}>
                    <td className={s.archCellStt}>{idx + 1}</td>
                    <td className={s.archCellDocType}>{doc.documentType}</td>
                    <td className={s.archCellDetail}>{doc.detail ?? ''}</td>
                    {MONTHS.map((m) => (
                      <MonthCell
                        key={m}
                        value={doc.months?.[m] ?? ''}
                        canEdit={canEdit}
                        onSave={(val) => handleMonthSave(doc.id, m, val)}
                      />
                    ))}
                    <td className={s.archCellYear}>
                      <span className={s.archYearCount}>
                        {countFilledMonths(doc.months)}
                      </span>
                    </td>
                    <td className={s.archCellNotes}>{doc.notes ?? ''}</td>
                    <td className={s.archCellChar}>{doc.characteristics ?? ''}</td>
                    {canEdit && (
                      <td className={s.archCellActions}>
                        <div className={s.cTaskActionBtns}>
                          <button
                            className={s.rowActionBtn}
                            title="Chỉnh sửa"
                            onClick={() => setEditDoc(doc)}
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            className={`${s.rowActionBtn} ${s.rowActionDanger}`}
                            title="Xoá dòng"
                            onClick={() => setDeleteDocId(doc.id)}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!docsLoading && docs.length > 0 && (
            <div className={s.archTableFooter}>
              <span className={s.archTableCount}>
                {docs.length} loại chứng từ · năm {activeYear.year}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────────── */}

      {showAddYear && (
        <AddYearModal
          existingYears={years.map((y) => y.year)}
          onSave={handleAddYear}
          onClose={() => setShowAddYear(false)}
        />
      )}

      {showAddDoc && (
        <DocFormModal
          onSave={handleAddDoc}
          onClose={() => setShowAddDoc(false)}
        />
      )}

      {editDoc && (
        <DocFormModal
          initialDoc={editDoc}
          onSave={handleEditDoc}
          onClose={() => setEditDoc(null)}
        />
      )}

      {deleteDocId && (
        <Modal title="Xoá dòng chứng từ" onClose={() => setDeleteDocId(null)}>
          <div className={s.modalStack}>
            <div className={`${s.terminateWarn} ${s.terminateWarnDanger}`}>
              <AlertTriangle size={16} className={`${s.warnIconInline} ${s.warnIconDanger}`} />
              <span>Bạn có chắc muốn xoá dòng chứng từ này? Hành động không thể hoàn tác.</span>
            </div>
            <div className={s.modalActions}>
              <button onClick={() => setDeleteDocId(null)} className={s.btnOutline} disabled={deleting}>Huỷ</button>
              <button onClick={handleDeleteDoc} disabled={deleting} className={s.btnDanger}>
                {deleting ? <Loader2 size={13} className={s.spin} /> : <Trash2 size={13} />}
                {deleting ? 'Đang xoá...' : 'Xoá'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showDeleteYear && (
        <Modal title={`Xoá năm ${activeYear?.year}`} onClose={() => setShowDeleteYear(false)}>
          <div className={s.modalStack}>
            <div className={`${s.terminateWarn} ${s.terminateWarnDanger}`}>
              <AlertTriangle size={16} className={`${s.warnIconInline} ${s.warnIconDanger}`} />
              <span>
                Bạn sắp xoá toàn bộ dữ liệu năm{' '}
                <strong>{activeYear?.year}</strong>{' '}
                ({docs.length} dòng chứng từ).
                Hành động này không thể hoàn tác.
              </span>
            </div>
            <div className={s.modalActions}>
              <button onClick={() => setShowDeleteYear(false)} className={s.btnOutline} disabled={deleting}>Huỷ</button>
              <button onClick={handleDeleteYear} disabled={deleting} className={s.btnDanger}>
                {deleting ? <Loader2 size={13} className={s.spin} /> : <Trash2 size={13} />}
                {deleting ? 'Đang xoá...' : 'Xoá năm'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
