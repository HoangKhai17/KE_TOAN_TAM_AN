import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { Plus, Trash2, Pencil, Loader2, Workflow, FileText, AlertTriangle, Archive } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import Modal from '../../components/ui/Modal'
import DeleteConfirmDialog from '../../components/ui/DeleteConfirmDialog'
import * as api from '../../api/companyProcesses'
import DocumentTypesSection from './DocumentTypesSection'
import OriginalDocumentsSection from './OriginalDocumentsSection'
import NotesSection from './NotesSection'
import s from './companies.module.css'

// LAZY LOAD: React Flow (~60KB) chỉ tải khi người dùng thực sự mở tab này.
// Ai không xem sơ đồ thì không phải tải thêm gì.
const ProcessFlowEditor = lazy(() => import('./ProcessFlowEditor'))

// Các mục con của tab (swap bằng segmented) — cùng cấp với Quy trình
const SECTIONS = [
  { key: 'process',   label: 'Quy trình',          icon: Workflow },
  { key: 'documents', label: 'Chứng từ KH cung cấp cho Tâm An',  icon: FileText },
  { key: 'originalDocs', label: 'KH lưu HS gốc tại Cty', icon: Archive },
  { key: 'notes',     label: 'Điều cần lưu ý',      icon: AlertTriangle },
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
  const [graph, setGraph]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingGraph, setLoadingGraph] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [renameTarget, setRenameTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [busy, setBusy] = useState(false)

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

  useEffect(() => {
    if (!selectedId) { setGraph(null); return }
    let cancelled = false
    setLoadingGraph(true)
    api.getGraph(company.id, selectedId)
      .then((g) => { if (!cancelled) setGraph(g) })
      .catch(() => { if (!cancelled) addToast('Không tải được sơ đồ', 'error') })
      .finally(() => { if (!cancelled) setLoadingGraph(false) })
    return () => { cancelled = true }
  }, [company.id, selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

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
      if (selectedId === deleteTarget.id) setSelectedId(rest[0]?.id ?? null)
      setDeleteTarget(null)
      addToast('Đã xoá quy trình', 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không xoá được', 'error')
    } finally { setBusy(false) }
  }

  return (
    <div className={s.procTab}>
      {/* Segmented: chuyển giữa các mục cùng cấp (Quy trình / Chứng từ / Lưu ý) */}
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
            processes={processes} selectedId={selectedId} setSelectedId={setSelectedId}
            graph={graph} setGraph={setGraph} loadingGraph={loadingGraph}
            setProcesses={setProcesses}
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

      {section === 'notes' && (
        <NotesSection companyId={company.id} canEdit={canEdit} />
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
        warning="Toàn bộ các bước và mũi tên trong sơ đồ sẽ bị xóa."
        loading={busy}
        onCancel={() => !busy && setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  )
}

// ── Mục Quy trình: chip chọn quy trình (ngang) + canvas full-width ─────────────
function ProcessSection({
  company, canEdit, processes, selectedId, setSelectedId,
  graph, setGraph, loadingGraph, setProcesses, onCreate, onRename, onDelete,
}) {
  return (
    <div>
      {/* Chip chọn quy trình — thay cho cột trái 230px, trả full chiều ngang cho canvas */}
      <div className={s.procChipBar}>
        {processes.map((p) => {
          const active = selectedId === p.id
          return (
            <div
              key={p.id}
              className={`${s.procChip} ${active ? s.procChipActive : ''}`}
              onClick={() => setSelectedId(p.id)}
            >
              <Workflow size={13} style={{ flexShrink: 0 }} />
              <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.name}
              </span>
              {p.nodeCount > 0 && <span className={s.procChipCount}>{p.nodeCount}</span>}
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

      {/* Canvas / sơ đồ — full chiều ngang */}
      {!selectedId ? (
        <div className={s.placeholderTab}>
          <div className={s.placeholderIcon}><Workflow size={24} /></div>
          <p className={s.placeholderTitle}>Chưa có quy trình nào</p>
          <p className={s.placeholderDesc}>
            {canEdit
              ? 'Nhấn "Thêm quy trình" để vẽ sơ đồ quy trình làm việc cho khách hàng này.'
              : 'Nhân sự phụ trách công ty này chưa tạo sơ đồ quy trình.'}
          </p>
        </div>
      ) : loadingGraph || !graph ? (
        <div className={s.loadingShort}><Loader2 size={18} className={s.spinIcon} /> Đang tải sơ đồ…</div>
      ) : (
        <Suspense fallback={
          <div className={s.loadingShort}><Loader2 size={18} className={s.spinIcon} /> Đang tải trình vẽ…</div>
        }>
          <ProcessFlowEditor
            companyId={company.id}
            process={graph.process}
            initialNodes={graph.nodes}
            initialEdges={graph.edges}
            canEdit={canEdit}
            onSaved={(res) => {
              setGraph(res)
              setProcesses((prev) => prev.map((p) => p.id === res.process.id
                ? { ...p, nodeCount: res.nodes.length } : p))
            }}
          />
        </Suspense>
      )}
    </div>
  )
}
