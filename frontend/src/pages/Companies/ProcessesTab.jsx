import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { Plus, Trash2, Pencil, Loader2, Workflow } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import Modal from '../../components/ui/Modal'
import * as api from '../../api/companyProcesses'
import s from './companies.module.css'

// LAZY LOAD: React Flow (~60KB) chỉ tải khi người dùng thực sự mở tab này.
// Ai không xem sơ đồ thì không phải tải thêm gì.
const ProcessFlowEditor = lazy(() => import('./ProcessFlowEditor'))

export default function ProcessesTab({ company }) {
  const currentUser = useAuthStore((st) => st.user)
  const addToast    = useToastStore((st) => st.toast)
  const isAdmin     = currentUser?.role === 'admin'
  // Sửa được nếu: admin HOẶC là nhân sự phụ trách công ty này (khớp RBAC của backend)
  const canEdit     = isAdmin || company?.assignedStaffId === currentUser?.id

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

  if (loading) {
    return <div className={s.loadingShort}><Loader2 size={18} className={s.spinIcon} /> Đang tải…</div>
  }

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      {/* Danh sách quy trình */}
      <div style={{ width: 230, flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-muted)', marginBottom: 8 }}>
          QUY TRÌNH ({processes.length})
        </div>
        {processes.map((p) => (
          <div
            key={p.id}
            onClick={() => setSelectedId(p.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', marginBottom: 4,
              borderRadius: 7, cursor: 'pointer', fontSize: 13,
              background: selectedId === p.id ? 'var(--color-primary-bg)' : 'transparent',
              color: selectedId === p.id ? 'var(--color-primary-dark)' : 'var(--color-text)',
              fontWeight: selectedId === p.id ? 600 : 400,
            }}
          >
            <Workflow size={13} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.name}
            </span>
            {p.nodeCount > 0 && (
              <span style={{ fontSize: 10, opacity: 0.6 }}>{p.nodeCount}</span>
            )}
            {canEdit && (
              <>
                <button title="Đổi tên" onClick={(e) => { e.stopPropagation(); setRenameTarget({ id: p.id, name: p.name }) }}
                  style={iconBtn}><Pencil size={11} /></button>
                <button title="Xoá" onClick={(e) => { e.stopPropagation(); setDeleteTarget(p) }}
                  style={{ ...iconBtn, color: '#dc2626' }}><Trash2 size={11} /></button>
              </>
            )}
          </div>
        ))}

        {canEdit && (
          <button onClick={() => setShowCreate(true)} className={s.btnOutline} style={{ width: '100%', marginTop: 6 }}>
            <Plus size={13} /> Thêm quy trình
          </button>
        )}
        {!canEdit && processes.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>Chưa có quy trình nào.</div>
        )}
      </div>

      {/* Sơ đồ */}
      <div style={{ flex: 1, minWidth: 0 }}>
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
      {deleteTarget && (
        <Modal title="Xoá quy trình" onClose={() => setDeleteTarget(null)}>
          <div className={s.modalStack}>
            <p>Xoá quy trình <strong>{deleteTarget.name}</strong>? Toàn bộ các bước và mũi tên trong sơ đồ sẽ mất.</p>
            <div className={s.modalActions}>
              <button className={s.btnOutline} onClick={() => setDeleteTarget(null)} disabled={busy}>Huỷ</button>
              <button className={s.btnDanger} onClick={handleDelete} disabled={busy}>Xoá</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

const iconBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 20, height: 20, padding: 0, border: 'none', background: 'none',
  borderRadius: 4, cursor: 'pointer', color: 'var(--color-muted)', flexShrink: 0,
}
