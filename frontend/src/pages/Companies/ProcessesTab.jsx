import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { Plus, Trash2, Pencil, Loader2, Workflow, FileText, Archive } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { useDeleteConfirm } from '../../components/ui/DeleteConfirmDialog'
import Modal from '../../components/ui/Modal'
import DeleteConfirmDialog from '../../components/ui/DeleteConfirmDialog'
import * as api from '../../api/companyProcesses'
import DocumentTypesSection from './DocumentTypesSection'
import OriginalDocumentsSection from './OriginalDocumentsSection'
import s from './companies.module.css'

// LAZY LOAD: trình soạn thảo tài liệu (TipTap) chỉ tải khi mở tab này.
const ProcessDocEditor = lazy(() => import('./ProcessDocEditor'))

// Các mục con của tab (swap bằng segmented) — cùng cấp với Quy trình
const SECTIONS = [
  { key: 'process',   label: 'Quy trình',          icon: Workflow },
  { key: 'originalDocs', label: 'HS gốc lưu tại KH', icon: Archive },
  { key: 'documents', label: 'Chứng từ KH cung cấp cho Tâm An',  icon: FileText },
]

export default function ProcessesTab({ company }) {
  const currentUser = useAuthStore((st) => st.user)
  const addToast    = useToastStore((st) => st.toast)
  const isAdmin     = currentUser?.role === 'admin'
  // Sửa được nếu: admin HOẶC là nhân sự phụ trách công ty này (khớp RBAC của backend)
  const canEdit     = isAdmin || company?.assignedStaffId === currentUser?.id

  const [section, setSection] = useState('process')   // mục con đang xem
  const [processes, setProcesses] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [current, setCurrent]   = useState(null)      // quy trình đang xem (kèm content)
  const [loading, setLoading] = useState(true)
  const [loadingDoc, setLoadingDoc] = useState(false)
  const [docDirty, setDocDirty] = useState(false)     // tài liệu có thay đổi chưa lưu?
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [renameTarget, setRenameTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [busy, setBusy] = useState(false)

  const confirmDiscard = useDeleteConfirm()

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const list = await api.listProcesses(company.id)
      setProcesses(list)
      setSelectedId((cur) => cur ?? list[0]?.id ?? null)
    } catch {
      addToast('Không tải được danh sách quy trình', 'error')
    } finally { setLoading(false) }
  }, [company.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadList() }, [loadList])

  // Tải nội dung quy trình đang chọn (kèm content HTML)
  useEffect(() => {
    if (!selectedId) { setCurrent(null); return undefined }
    let cancelled = false
    setLoadingDoc(true)
    api.getProcess(company.id, selectedId)
      .then((p) => { if (!cancelled) setCurrent(p) })
      .catch(() => { if (!cancelled) addToast('Không tải được nội dung quy trình', 'error') })
      .finally(() => { if (!cancelled) setLoadingDoc(false) })
    return () => { cancelled = true }
  }, [company.id, selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function selectProcess(id) {
    if (id === selectedId) return
    if (docDirty && !(await confirmDiscard({
      title: 'Bỏ thay đổi chưa lưu?',
      message: 'Các thay đổi ở quy trình này chưa được lưu và sẽ bị mất.',
      warning: null, confirmLabel: 'Bỏ thay đổi', cancelLabel: 'Tiếp tục soạn',
    }))) return
    setDocDirty(false)
    setSelectedId(id)
  }

  async function handleCreate() {
    if (!newName.trim()) return
    setBusy(true)
    try {
      const p = await api.createProcess(company.id, { name: newName.trim() })
      setProcesses((prev) => [...prev, p])
      setSelectedId(p.id)
      setShowCreate(false); setNewName('')
      addToast('Đã tạo quy trình mới', 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không tạo được quy trình', 'error')
    } finally { setBusy(false) }
  }

  async function handleRename() {
    if (!renameTarget?.name.trim()) return
    setBusy(true)
    try {
      const p = await api.updateProcess(company.id, renameTarget.id, { name: renameTarget.name.trim() })
      setProcesses((prev) => prev.map((x) => x.id === p.id ? { ...x, name: p.name } : x))
      if (current?.id === p.id) setCurrent((c) => ({ ...c, name: p.name }))
      setRenameTarget(null)
      addToast('Đã đổi tên quy trình', 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không đổi được tên', 'error')
    } finally { setBusy(false) }
  }

  async function handleDelete() {
    setBusy(true)
    try {
      await api.deleteProcess(company.id, deleteTarget.id)
      const rest = processes.filter((p) => p.id !== deleteTarget.id)
      setProcesses(rest)
      if (selectedId === deleteTarget.id) { setDocDirty(false); setSelectedId(rest[0]?.id ?? null) }
      setDeleteTarget(null)
      addToast('Đã xoá quy trình', 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không xoá được', 'error')
    } finally { setBusy(false) }
  }

  // Sau khi lưu nội dung: cập nhật cờ hasContent + mốc thời gian trong danh sách
  function handleSaved(updated) {
    setCurrent(updated)
    setProcesses((prev) => prev.map((p) => p.id === updated.id
      ? { ...p, hasContent: updated.hasContent, updatedAt: updated.updatedAt } : p))
  }

  // Kéo-thả đổi thứ tự chip: cập nhật tại chỗ + lưu position cho các mục thay đổi
  async function handleReorder(orderedIds) {
    const map = new Map(processes.map((p) => [p.id, p]))
    const ordered = orderedIds.map((id) => map.get(id)).filter(Boolean)
    setProcesses(ordered)   // hiển thị ngay
    const calls = ordered
      .map((p, i) => (p.position === i ? null : api.updateProcess(company.id, p.id, { position: i })))
      .filter(Boolean)
    if (!calls.length) return
    try {
      await Promise.all(calls)
      setProcesses(ordered.map((p, i) => ({ ...p, position: i })))
    } catch {
      addToast('Không lưu được thứ tự quy trình', 'error')
      loadList()
    }
  }

  return (
    <div className={s.procTab}>
      {/* Segmented: chuyển giữa các mục cùng cấp */}
      <div className={s.procSeg}>
        {SECTIONS.map((sec) => {
          const Icon = sec.icon
          const active = section === sec.key
          const badge = sec.key === 'process' && processes.length > 0 ? processes.length : null
          return (
            <button
              key={sec.key}
              className={`${s.procSegBtn} ${active ? s.procSegBtnActive : ''}`}
              onClick={() => setSection(sec.key)}
            >
              <Icon size={14} />
              {sec.label}
              {badge != null && <span className={s.procSegBadge}>{badge}</span>}
            </button>
          )
        })}
      </div>

      {/* Nội dung mục đang chọn */}
      {section === 'process' && (
        loading ? (
          <div className={s.loadingShort}><Loader2 size={18} className={s.spinIcon} /> Đang tải…</div>
        ) : (
          <ProcessSection
            company={company} canEdit={canEdit}
            processes={processes} selectedId={selectedId} onSelect={selectProcess}
            onReorder={handleReorder}
            current={current} loadingDoc={loadingDoc} onDirtyChange={setDocDirty}
            onSaved={handleSaved}
            onCreate={() => setShowCreate(true)}
            onRename={(p) => setRenameTarget({ id: p.id, name: p.name })}
            onDelete={(p) => setDeleteTarget(p)}
          />
        )
      )}

      {section === 'documents' && (
        <DocumentTypesSection companyId={company.id} canEdit={canEdit} />
      )}

      {section === 'originalDocs' && (
        <OriginalDocumentsSection companyId={company.id} canEdit={canEdit} />
      )}

      {/* Modal tạo mới */}
      {showCreate && (
        <Modal title="Thêm quy trình" onClose={() => setShowCreate(false)}>
          <div className={s.modalStack}>
            <input
              autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
              placeholder="VD: Kê khai thuế GTGT hàng tháng"
              className={s.formInput}
            />
            <div className={s.modalActions}>
              <button className={s.btnOutline} onClick={() => setShowCreate(false)} disabled={busy}>Huỷ</button>
              <button className={s.btnPrimary} onClick={handleCreate} disabled={busy || !newName.trim()}>Tạo</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal đổi tên */}
      {renameTarget && (
        <Modal title="Đổi tên quy trình" onClose={() => setRenameTarget(null)}>
          <div className={s.modalStack}>
            <input
              autoFocus value={renameTarget.name}
              onChange={(e) => setRenameTarget({ ...renameTarget, name: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRename() }}
              className={s.formInput}
            />
            <div className={s.modalActions}>
              <button className={s.btnOutline} onClick={() => setRenameTarget(null)} disabled={busy}>Huỷ</button>
              <button className={s.btnPrimary} onClick={handleRename} disabled={busy}>Lưu</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal xoá */}
      <DeleteConfirmDialog
        open={Boolean(deleteTarget)}
        title="Xóa quy trình"
        message={deleteTarget ? <>Bạn có chắc chắn muốn xóa quy trình <strong>“{deleteTarget.name}”</strong>?</> : null}
        warning="Toàn bộ nội dung tài liệu của quy trình sẽ bị xóa."
        loading={busy}
        onCancel={() => !busy && setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  )
}

// ── Mục Quy trình: chip chọn quy trình + tài liệu full-width ──────────────────
function ProcessSection({
  company, canEdit, processes, selectedId, onSelect, onReorder,
  current, loadingDoc, onDirtyChange, onSaved, onCreate, onRename, onDelete,
}) {
  const [dragId, setDragId] = useState(null)   // chip đang kéo
  const [overId, setOverId] = useState(null)   // chip đang được kéo tới

  function handleDrop(targetId) {
    if (dragId && dragId !== targetId) {
      const ids = processes.map((p) => p.id)
      const from = ids.indexOf(dragId)
      const to   = ids.indexOf(targetId)
      if (from !== -1 && to !== -1) {
        const next = [...ids]
        next.splice(from, 1)
        next.splice(to, 0, dragId)
        onReorder(next)
      }
    }
    setDragId(null); setOverId(null)
  }

  return (
    <div>
      {/* Chip chọn quy trình — kéo-thả để đổi thứ tự */}
      <div className={s.procChipBar}>
        {processes.map((p) => {
          const active = selectedId === p.id
          return (
            <div
              key={p.id}
              className={`${s.procChip} ${active ? s.procChipActive : ''}`}
              style={{
                cursor: canEdit ? 'grab' : 'pointer',
                opacity: dragId === p.id ? 0.4 : 1,
                outline: (overId === p.id && dragId && dragId !== p.id) ? '2px dashed var(--color-accent)' : undefined,
                outlineOffset: 1,
              }}
              onClick={() => onSelect(p.id)}
              draggable={canEdit}
              onDragStart={(e) => { setDragId(p.id); e.dataTransfer.effectAllowed = 'move' }}
              onDragEnd={() => { setDragId(null); setOverId(null) }}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); if (overId !== p.id) setOverId(p.id) } }}
              onDrop={(e) => { e.preventDefault(); handleDrop(p.id) }}
            >
              <Workflow size={13} style={{ flexShrink: 0 }} />
              <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.name}
              </span>
              {canEdit && (
                <span className={s.procChipBtns}>
                  <button title="Đổi tên" className={s.procChipIcon}
                    onClick={(e) => { e.stopPropagation(); onRename(p) }}><Pencil size={11} /></button>
                  <button title="Xoá" className={s.procChipIcon} style={{ color: '#dc2626' }}
                    onClick={(e) => { e.stopPropagation(); onDelete(p) }}><Trash2 size={11} /></button>
                </span>
              )}
            </div>
          )
        })}
        {canEdit && (
          <button className={s.procAddChip} onClick={onCreate}>
            <Plus size={13} /> Thêm quy trình
          </button>
        )}
      </div>

      {/* Tài liệu quy trình — full chiều ngang */}
      {!selectedId ? (
        <div className={s.placeholderTab}>
          <div className={s.placeholderIcon}><Workflow size={24} /></div>
          <p className={s.placeholderTitle}>Chưa có quy trình nào</p>
          <p className={s.placeholderDesc}>
            {canEdit
              ? 'Nhấn "Thêm quy trình" để soạn tài liệu quy trình làm việc cho khách hàng này.'
              : 'Nhân sự phụ trách công ty này chưa tạo quy trình.'}
          </p>
        </div>
      ) : loadingDoc || !current ? (
        <div className={s.loadingShort}><Loader2 size={18} className={s.spinIcon} /> Đang tải nội dung…</div>
      ) : (
        <Suspense fallback={
          <div className={s.loadingShort}><Loader2 size={18} className={s.spinIcon} /> Đang tải trình soạn thảo…</div>
        }>
          <ProcessDocEditor
            key={current.id}
            companyId={company.id}
            process={current}
            canEdit={canEdit}
            onDirtyChange={onDirtyChange}
            onSaved={onSaved}
          />
        </Suspense>
      )}
    </div>
  )
}
