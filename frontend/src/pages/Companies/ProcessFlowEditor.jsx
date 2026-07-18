import { useState, useCallback, useEffect, useRef } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap, Panel,
  useNodesState, useEdgesState, addEdge, MarkerType, ReactFlowProvider,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Plus, Save, X, Trash2, Undo2, Maximize2 } from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'
import * as api from '../../api/companyProcesses'
import { nodeTypes, NODE_TYPE_LABELS } from './ProcessNodes'

// Sinh UUID cho nút/mũi tên mới.
// LƯU Ý: crypto.randomUUID() CHỈ có trong ngữ cảnh bảo mật (HTTPS hoặc localhost).
// Server đang chạy HTTP theo IP → hàm đó undefined, bấm "Thêm bước" sẽ lỗi ngay
// (chạy ở localhost thì không lộ ra). Vì vậy phải có phương án dự phòng.
// crypto.getRandomValues thì có ở MỌI ngữ cảnh nên dùng làm nguồn ngẫu nhiên.
function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const b = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b)
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256)
  b[6] = (b[6] & 0x0f) | 0x40   // version 4
  b[8] = (b[8] & 0x3f) | 0x80   // variant
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

// ── Chuyển đổi giữa dữ liệu API và định dạng React Flow ──────────────────────

const edgeStyleFor = (kind) => (kind === 'back'
  ? { stroke: '#f97316', strokeDasharray: '6 4', strokeWidth: 2 }   // quay ngược: nét đứt cam
  : { stroke: '#64748b', strokeWidth: 2 })

function toFlowNodes(nodes) {
  return nodes.map((n) => ({
    id: n.id,
    type: n.nodeType || 'step',
    position: { x: n.posX, y: n.posY },
    data: { title: n.title, actor: n.actor, note: n.note, code: n.code },
  }))
}

function toFlowEdges(edges) {
  return edges.map((e) => ({
    id: e.id,
    source: e.fromNodeId,
    target: e.toNodeId,
    sourceHandle: e.sourceHandle || undefined,
    targetHandle: e.targetHandle || undefined,
    label: e.label || undefined,
    data: { edgeKind: e.edgeKind || 'normal' },
    style: edgeStyleFor(e.edgeKind),
    markerEnd: { type: MarkerType.ArrowClosed, color: e.edgeKind === 'back' ? '#f97316' : '#64748b' },
    labelStyle: { fontSize: 12, fontWeight: 600 },
    labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 4,
  }))
}

const toApiNodes = (flowNodes) => flowNodes.map((n) => ({
  id: n.id,
  code: n.data.code || null,
  title: n.data.title || 'Bước mới',
  nodeType: n.type || 'step',
  actor: n.data.actor || null,
  note: n.data.note || null,
  posX: n.position.x,
  posY: n.position.y,
}))

const toApiEdges = (flowEdges) => flowEdges.map((e, i) => ({
  id: e.id,
  fromNodeId: e.source,
  toNodeId: e.target,
  label: e.label || null,
  edgeKind: e.data?.edgeKind || 'normal',
  sourceHandle: e.sourceHandle || null,
  targetHandle: e.targetHandle || null,
  position: i,
}))

// ── Editor ────────────────────────────────────────────────────────────────────

function EditorInner({ companyId, process, initialNodes, initialEdges, canEdit, onSaved }) {
  const addToast = useToastStore((st) => st.toast)
  const [nodes, setNodes, onNodesChange] = useNodesState(toFlowNodes(initialNodes))
  const [edges, setEdges, onEdgesChange] = useEdgesState(toFlowEdges(initialEdges))
  const [editing, setEditing]   = useState(false)
  const [dirty, setDirty]       = useState(false)
  const [saving, setSaving]     = useState(false)
  const [selNode, setSelNode]   = useState(null)
  const [selEdge, setSelEdge]   = useState(null)
  const updatedAtRef = useRef(process.updatedAt)
  const historyRef   = useRef([])       // ảnh chụp để hoàn tác

  // Sơ đồ khác được chọn → nạp lại
  useEffect(() => {
    setNodes(toFlowNodes(initialNodes))
    setEdges(toFlowEdges(initialEdges))
    updatedAtRef.current = process.updatedAt
    setEditing(false); setDirty(false); setSelNode(null); setSelEdge(null)
    historyRef.current = []
  }, [process.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const snapshot = useCallback(() => {
    historyRef.current.push({ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) })
    if (historyRef.current.length > 30) historyRef.current.shift()
  }, [nodes, edges])

  function undo() {
    const prev = historyRef.current.pop()
    if (!prev) { addToast('Không còn thao tác để hoàn tác', 'info'); return }
    setNodes(prev.nodes); setEdges(prev.edges); setDirty(true)
  }

  // Nối 2 bước → tạo mũi tên mới
  const onConnect = useCallback((params) => {
    snapshot()
    setEdges((eds) => addEdge({
      ...params,
      id: newId(),
      data: { edgeKind: 'normal' },
      style: edgeStyleFor('normal'),
      markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
      labelStyle: { fontSize: 12, fontWeight: 600 },
      labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
      labelBgPadding: [6, 3],
      labelBgBorderRadius: 4,
    }, eds))
    setDirty(true)
  }, [setEdges, snapshot])

  function addNode(type) {
    snapshot()
    const id = newId()
    // Đặt nút mới lệch dần để không chồng lên nhau
    const offset = nodes.length * 30
    setNodes((nds) => [...nds, {
      id, type,
      position: { x: 80 + (offset % 300), y: 80 + offset * 0.6 },
      data: { title: NODE_TYPE_LABELS[type], actor: '', note: '', code: `B${nds.length + 1}` },
    }])
    setDirty(true)
  }

  function patchNode(id, patch) {
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
    setSelNode((s) => (s && s.id === id ? { ...s, data: { ...s.data, ...patch } } : s))
    setDirty(true)
  }

  function changeNodeType(id, type) {
    snapshot()
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, type } : n))
    setSelNode((s) => (s && s.id === id ? { ...s, type } : s))
    setDirty(true)
  }

  function patchEdge(id, patch) {
    setEdges((eds) => eds.map((e) => {
      if (e.id !== id) return e
      const kind = patch.edgeKind ?? e.data?.edgeKind ?? 'normal'
      return {
        ...e,
        label: patch.label !== undefined ? (patch.label || undefined) : e.label,
        data: { ...e.data, edgeKind: kind },
        style: edgeStyleFor(kind),
        markerEnd: { type: MarkerType.ArrowClosed, color: kind === 'back' ? '#f97316' : '#64748b' },
      }
    }))
    setSelEdge((s) => (s && s.id === id
      ? { ...s, label: patch.label !== undefined ? patch.label : s.label, data: { ...s.data, ...patch } }
      : s))
    setDirty(true)
  }

  function removeSelected() {
    if (!selNode && !selEdge) return
    snapshot()
    if (selNode) {
      setNodes((nds) => nds.filter((n) => n.id !== selNode.id))
      // Xoá luôn mũi tên dính tới bước đó, nếu không sẽ mồ côi
      setEdges((eds) => eds.filter((e) => e.source !== selNode.id && e.target !== selNode.id))
      setSelNode(null)
    } else {
      setEdges((eds) => eds.filter((e) => e.id !== selEdge.id))
      setSelEdge(null)
    }
    setDirty(true)
  }

  async function save() {
    setSaving(true)
    try {
      const res = await api.saveGraph(companyId, process.id, {
        nodes: toApiNodes(nodes),
        edges: toApiEdges(edges),
        expectedUpdatedAt: updatedAtRef.current,
      })
      updatedAtRef.current = res.process.updatedAt
      setDirty(false); setEditing(false); setSelNode(null); setSelEdge(null)
      historyRef.current = []
      addToast('Đã lưu sơ đồ quy trình', 'success')
      onSaved?.(res)
    } catch (err) {
      const status = err.response?.status
      addToast(
        status === 409
          ? 'Sơ đồ vừa được người khác cập nhật. Vui lòng tải lại trước khi lưu.'
          : err.response?.data?.error?.message ?? 'Không lưu được sơ đồ',
        'error', 6000,
      )
    } finally { setSaving(false) }
  }

  function cancelEdit() {
    setNodes(toFlowNodes(initialNodes))
    setEdges(toFlowEdges(initialEdges))
    setEditing(false); setDirty(false); setSelNode(null); setSelEdge(null)
    historyRef.current = []
  }

  const btn = (extra) => ({
    display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 10px',
    borderRadius: 6, border: '1px solid var(--color-border)', background: '#fff',
    fontSize: 12, fontWeight: 600, cursor: 'pointer', ...extra,
  })

  return (
    <div style={{ height: 560, border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={editing ? onNodesChange : undefined}
        onEdgesChange={editing ? onEdgesChange : undefined}
        onConnect={editing ? onConnect : undefined}
        onNodeClick={(_, n) => { setSelNode(n); setSelEdge(null) }}
        onEdgeClick={(_, e) => { setSelEdge(e); setSelNode(null) }}
        onPaneClick={() => { setSelNode(null); setSelEdge(null) }}
        onNodeDragStop={() => setDirty(true)}
        nodeTypes={nodeTypes}
        nodesDraggable={editing}
        nodesConnectable={editing}
        elementsSelectable
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} color="#e2e8f0" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable style={{ height: 90 }} />

        {/* Thanh công cụ */}
        <Panel position="top-left" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {!editing ? (
            canEdit && (
              <button style={btn({ background: 'var(--color-primary)', color: '#fff', borderColor: 'var(--color-primary)' })}
                onClick={() => setEditing(true)}>
                ✏ Chỉnh sửa
              </button>
            )
          ) : (
            <>
              {Object.entries(NODE_TYPE_LABELS).map(([type, label]) => (
                <button key={type} style={btn()} onClick={() => addNode(type)} title={`Thêm ${label}`}>
                  <Plus size={12} /> {label}
                </button>
              ))}
              <button style={btn()} onClick={undo}><Undo2 size={12} /> Hoàn tác</button>
              <button
                style={btn({ color: '#b91c1c', borderColor: '#fca5a5' })}
                onClick={removeSelected}
                disabled={!selNode && !selEdge}
              >
                <Trash2 size={12} /> Xoá mục đang chọn
              </button>
              <button
                style={btn({ background: dirty ? '#16a34a' : '#94a3b8', color: '#fff', borderColor: 'transparent' })}
                onClick={save}
                disabled={saving || !dirty}
              >
                <Save size={12} /> {saving ? 'Đang lưu…' : 'Lưu'}
              </button>
              <button style={btn()} onClick={cancelEdit}><X size={12} /> Huỷ</button>
            </>
          )}
        </Panel>

        {/* Bảng sửa thuộc tính bước đang chọn */}
        {editing && selNode && (
          <Panel position="top-right" style={{
            width: 250, background: '#fff', border: '1px solid var(--color-border)',
            borderRadius: 8, padding: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Thông tin bước</div>
            <input value={selNode.data.code || ''} onChange={(e) => patchNode(selNode.id, { code: e.target.value })}
              placeholder="Mã (B1, B2…)" style={inp} />
            <input value={selNode.data.title || ''} onChange={(e) => patchNode(selNode.id, { title: e.target.value })}
              placeholder="Tên bước *" style={inp} />
            <input value={selNode.data.actor || ''} onChange={(e) => patchNode(selNode.id, { actor: e.target.value })}
              placeholder="Ai làm (KH, NV, Quản lý…)" list="process-actors" style={inp} />
            <datalist id="process-actors">
              <option value="Khách hàng" /><option value="Nhân viên" />
              <option value="Quản lý" /><option value="Cơ quan thuế" />
            </datalist>
            <textarea value={selNode.data.note || ''} onChange={(e) => patchNode(selNode.id, { note: e.target.value })}
              placeholder="Ghi chú" rows={2} style={{ ...inp, resize: 'vertical' }} />
            <select value={selNode.type} onChange={(e) => changeNodeType(selNode.id, e.target.value)} style={inp}>
              {Object.entries(NODE_TYPE_LABELS).map(([t, l]) => <option key={t} value={t}>{l}</option>)}
            </select>
          </Panel>
        )}

        {/* Bảng sửa mũi tên đang chọn */}
        {editing && selEdge && (
          <Panel position="top-right" style={{
            width: 250, background: '#fff', border: '1px solid var(--color-border)',
            borderRadius: 8, padding: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Nhánh (mũi tên)</div>
            <input
              value={selEdge.label || ''}
              onChange={(e) => patchEdge(selEdge.id, { label: e.target.value })}
              placeholder='Điều kiện: "Hợp lệ", "Thiếu chứng từ"…'
              style={inp}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={(selEdge.data?.edgeKind || 'normal') === 'back'}
                onChange={(e) => patchEdge(selEdge.id, { edgeKind: e.target.checked ? 'back' : 'normal' })}
              />
              Mũi tên quay ngược (vẽ nét đứt)
            </label>
          </Panel>
        )}

        {!editing && (
          <Panel position="bottom-right" style={{ fontSize: 11, color: 'var(--color-muted)' }}>
            <Maximize2 size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /> Cuộn để phóng to · kéo nền để di chuyển
          </Panel>
        )}
      </ReactFlow>
    </div>
  )
}

const inp = {
  width: '100%', marginBottom: 6, padding: '6px 8px', fontSize: 12,
  border: '1px solid var(--color-border)', borderRadius: 6,
}

export default function ProcessFlowEditor(props) {
  return (
    <ReactFlowProvider>
      <EditorInner {...props} />
    </ReactFlowProvider>
  )
}
