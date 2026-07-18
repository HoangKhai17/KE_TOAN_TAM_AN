import { useState, useCallback, useEffect, useRef } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap, Panel,
  useNodesState, useEdgesState, addEdge, MarkerType, ReactFlowProvider, useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Save, X, Undo2, Copy, ClipboardPaste, Maximize2, Minimize2, ArrowLeftRight,
  Hand, MousePointer2, Focus,
} from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'
import * as api from '../../api/companyProcesses'
import { nodeTypes, SHAPES, LINE_SHAPES } from './ProcessNodes'

// crypto.randomUUID() CHỈ có trong ngữ cảnh bảo mật (HTTPS/localhost). Server chạy
// HTTP theo IP → phải có dự phòng, nếu không thêm hình sẽ lỗi trên server.
function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b)
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256)
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

// ── Quy đổi dữ liệu API ↔ React Flow ─────────────────────────────────────────

const ARROW = { type: MarkerType.ArrowClosed, color: '#64748b', width: 18, height: 18 }

function edgeVisual(kind, dashed) {
  return {
    style: { stroke: '#64748b', strokeWidth: 2, strokeDasharray: dashed ? '6 4' : undefined },
    markerEnd:   kind === 'line' ? undefined : ARROW,
    markerStart: kind === 'double' ? ARROW : undefined,   // 2 chiều
  }
}

const LABEL_STYLE = {
  labelStyle: { fontSize: 12, fontWeight: 600 },
  labelBgStyle: { fill: '#fff', fillOpacity: 0.92 },
  labelBgPadding: [6, 3],
  labelBgBorderRadius: 4,
}

const toFlowNodes = (nodes, editable) => nodes.map((n) => ({
  id: n.id,
  type: SHAPES[n.nodeType] ? n.nodeType : 'rectangle',
  position: { x: n.posX, y: n.posY },
  width:  n.width  ?? SHAPES[n.nodeType]?.w ?? 160,
  height: n.height ?? SHAPES[n.nodeType]?.h ?? 70,
  data: { title: n.title, actor: n.actor, note: n.note, code: n.code, style: n.style || {}, _editable: editable },
}))

const toFlowEdges = (edges) => edges.map((e) => ({
  id: e.id,
  source: e.fromNodeId,
  target: e.toNodeId,
  sourceHandle: e.sourceHandle || undefined,
  targetHandle: e.targetHandle || undefined,
  label: e.label || undefined,
  data: { edgeKind: e.edgeKind || 'arrow', dashed: !!e.dashed },
  ...edgeVisual(e.edgeKind || 'arrow', !!e.dashed),
  ...LABEL_STYLE,
}))

const toApiNodes = (fn) => fn.map((n) => ({
  id: n.id,
  code: n.data.code || null,
  title: n.data.title || '',
  nodeType: n.type || 'rectangle',
  actor: n.data.actor || null,
  note: n.data.note || null,
  posX: n.position.x,
  posY: n.position.y,
  width:  n.width  ?? n.measured?.width  ?? null,
  height: n.height ?? n.measured?.height ?? null,
  style:  n.data.style && Object.keys(n.data.style).length ? n.data.style : null,
}))

const toApiEdges = (fe) => fe.map((e, i) => ({
  id: e.id,
  fromNodeId: e.source,
  toNodeId: e.target,
  label: e.label || null,
  edgeKind: e.data?.edgeKind || 'arrow',
  dashed: !!e.data?.dashed,
  sourceHandle: e.sourceHandle || null,
  targetHandle: e.targetHandle || null,
  position: i,
}))

// ── Editor ────────────────────────────────────────────────────────────────────

function EditorInner({ companyId, process, initialNodes, initialEdges, canEdit, onSaved }) {
  const addToast = useToastStore((st) => st.toast)
  const [editing, setEditing] = useState(false)
  const [nodes, setNodes, onNodesChange] = useNodesState(toFlowNodes(initialNodes, false))
  const [edges, setEdges, onEdgesChange] = useEdgesState(toFlowEdges(initialEdges))
  const [dirty, setDirty]   = useState(false)
  const [saving, setSaving] = useState(false)
  const [full, setFull]     = useState(false)
  const [selEdge, setSelEdge] = useState(null)
  // MẶC ĐỊNH là di chuyển canvas bằng chuột trái (dễ dùng nhất).
  // Bật "Chọn" khi cần khoanh vùng nhiều hình — hoặc chỉ cần giữ Shift là khoanh được.
  const [selectMode, setSelectMode] = useState(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const { fitView } = useReactFlow()

  // Giữ SPACE = tạm chuyển sang di chuyển canvas (chuẩn như Figma/draw.io)
  useEffect(() => {
    function down(e) {
      if (e.code !== 'Space') return
      if (['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) return
      e.preventDefault()      // chặn Space cuộn trang
      setSpaceHeld(true)
    }
    function up(e) { if (e.code === 'Space') setSpaceHeld(false) }
    document.addEventListener('keydown', down)
    document.addEventListener('keyup', up)
    return () => { document.removeEventListener('keydown', down); document.removeEventListener('keyup', up) }
  }, [])

  // Kéo chuột trái để di chuyển: luôn bật, TRỪ khi đang ở chế độ Chọn (và không giữ Space)
  const panWithLeftDrag = !editing || !selectMode || spaceHeld

  // Hình đang được chọn (để chỉnh định dạng: màu, cỡ chữ, xoay…)
  const selNode = nodes.find((n) => n.selected) || null
  const selIsLine = selNode ? LINE_SHAPES.has(selNode.type) : false

  function patchNodeStyle(nodeId, patch) {
    setNodes((nds) => nds.map((n) => n.id === nodeId
      ? { ...n, data: { ...n.data, style: { ...(n.data.style || {}), ...patch } } }
      : n))
    setDirty(true)
  }
  const updatedAtRef = useRef(process.updatedAt)
  const historyRef   = useRef([])
  const clipboardRef = useRef([])
  const wrapRef      = useRef(null)

  // Cờ _editable nằm trong data để hình biết có cho sửa chữ / hiện cổng nối không
  useEffect(() => {
    setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, _editable: editing } })))
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setNodes(toFlowNodes(initialNodes, false))
    setEdges(toFlowEdges(initialEdges))
    updatedAtRef.current = process.updatedAt
    setEditing(false); setDirty(false); setSelEdge(null)
    historyRef.current = []
  }, [process.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const snapshot = useCallback(() => {
    historyRef.current.push({ nodes: structuredClone(nodes), edges: structuredClone(edges) })
    if (historyRef.current.length > 40) historyRef.current.shift()
  }, [nodes, edges])

  const undo = useCallback(() => {
    const prev = historyRef.current.pop()
    if (!prev) { addToast('Không còn thao tác để hoàn tác', 'info'); return }
    setNodes(prev.nodes); setEdges(prev.edges); setDirty(true)
  }, [setNodes, setEdges, addToast])

  const onConnect = useCallback((params) => {
    snapshot()
    setEdges((eds) => addEdge({
      ...params, id: newId(),
      data: { edgeKind: 'arrow', dashed: false },
      ...edgeVisual('arrow', false), ...LABEL_STYLE,
    }, eds))
    setDirty(true)
  }, [setEdges, snapshot])

  function addShape(type) {
    snapshot()
    const { w, h } = SHAPES[type]
    const k = nodes.length
    setNodes((nds) => [...nds, {
      id: newId(), type,
      position: { x: 60 + (k * 40) % 360, y: 60 + Math.floor(k / 9) * 120 + (k * 25) % 200 },
      width: w, height: h,
      data: { title: '', actor: '', note: '', code: '', _editable: true },
    }])
    setDirty(true)
  }

  // ── Copy / Paste khối đang chọn ─────────────────────────────────────────────
  const copySelection = useCallback(() => {
    const sel = nodes.filter((n) => n.selected)
    if (!sel.length) { addToast('Chưa chọn hình nào để sao chép', 'info'); return }
    clipboardRef.current = structuredClone(sel)
    addToast(`Đã sao chép ${sel.length} hình`, 'success')
  }, [nodes, addToast])

  const pasteClipboard = useCallback(() => {
    const clip = clipboardRef.current
    if (!clip.length) { addToast('Chưa có gì để dán', 'info'); return }
    snapshot()
    const copies = clip.map((n) => ({
      ...n,
      id: newId(),
      position: { x: n.position.x + 40, y: n.position.y + 40 },
      selected: true,
      data: { ...n.data, _editable: true },
    }))
    setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...copies])
    setDirty(true)
    addToast(`Đã dán ${copies.length} hình`, 'success')
  }, [setNodes, snapshot, addToast])

  // ── Phím tắt: Ctrl+C / Ctrl+V / Ctrl+Z / Esc thoát toàn màn hình ────────────
  useEffect(() => {
    if (!editing) return
    function onKey(e) {
      const typing = ['INPUT', 'TEXTAREA'].includes(e.target?.tagName)
      if (typing) return
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelection() }
      else if (ctrl && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteClipboard() }
      else if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); undo() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [editing, copySelection, pasteClipboard, undo])

  useEffect(() => {
    function onEsc(e) { if (e.key === 'Escape' && full) setFull(false) }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [full])

  // ── Mũi tên: đổi chiều / kiểu / nét ─────────────────────────────────────────
  function patchEdge(id, patch) {
    setEdges((eds) => eds.map((e) => {
      if (e.id !== id) return e
      const kind   = patch.edgeKind ?? e.data?.edgeKind ?? 'arrow'
      const dashed = patch.dashed   ?? e.data?.dashed   ?? false
      const next = {
        ...e,
        label: patch.label !== undefined ? (patch.label || undefined) : e.label,
        data: { ...e.data, edgeKind: kind, dashed },
        ...edgeVisual(kind, dashed), ...LABEL_STYLE,
      }
      // Đổi chiều = hoán đổi đầu-cuối (kèm cổng nối để mũi tên không nhảy lung tung)
      if (patch.reverse) {
        next.source = e.target; next.target = e.source
        next.sourceHandle = e.targetHandle ? e.targetHandle.replace('t-', 's-') : undefined
        next.targetHandle = e.sourceHandle ? e.sourceHandle.replace('s-', 't-') : undefined
      }
      setSelEdge(next)
      return next
    }))
    setDirty(true)
  }

  async function save() {
    setSaving(true)
    try {
      const res = await api.saveGraph(companyId, process.id, {
        nodes: toApiNodes(nodes), edges: toApiEdges(edges),
        expectedUpdatedAt: updatedAtRef.current,
      })
      updatedAtRef.current = res.process.updatedAt
      // GIỮ NGUYÊN chế độ chỉnh sửa sau khi lưu — trước đây tự thoát ra khiến
      // muốn sửa tiếp phải bấm "Chỉnh sửa" lại, rất bất tiện khi vẽ nhiều lần.
      setDirty(false); setSelEdge(null)
      historyRef.current = []
      addToast('Đã lưu sơ đồ', 'success')
      onSaved?.(res, { keepEditing: true })
    } catch (err) {
      addToast(err.response?.status === 409
        ? 'Sơ đồ vừa được người khác cập nhật. Vui lòng tải lại trước khi lưu.'
        : err.response?.data?.error?.message ?? 'Không lưu được sơ đồ', 'error', 6000)
    } finally { setSaving(false) }
  }

  function cancelEdit() {
    setNodes(toFlowNodes(initialNodes, false))
    setEdges(toFlowEdges(initialEdges))
    setEditing(false); setDirty(false); setSelEdge(null)
    historyRef.current = []
  }

  const btn = (extra) => ({
    display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 10px',
    borderRadius: 6, border: '1px solid var(--color-border)', background: '#fff',
    fontSize: 12, fontWeight: 600, cursor: 'pointer', ...extra,
  })

  const shell = full
    ? { position: 'fixed', inset: 0, zIndex: 1000, background: '#fff', borderRadius: 0 }
    : { height: 560, borderRadius: 10, border: '1px solid var(--color-border)' }

  return (
    <div ref={wrapRef} style={{ ...shell, overflow: 'hidden' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={editing ? onNodesChange : undefined}
        onEdgesChange={editing ? onEdgesChange : undefined}
        onConnect={editing ? onConnect : undefined}
        onEdgeClick={(_, e) => setSelEdge(e)}
        onPaneClick={() => setSelEdge(null)}
        onNodeDragStop={() => setDirty(true)}
        onNodesDelete={() => setDirty(true)}
        onEdgesDelete={() => setDirty(true)}
        nodeTypes={nodeTypes}
        nodesDraggable={editing}
        nodesConnectable={editing}
        elementsSelectable={editing}
        deleteKeyCode={editing ? ['Delete', 'Backspace'] : null}
        /* ĐIỀU HƯỚNG CANVAS — trước đây chỉ kéo được bằng chuột giữa/phải nên rất khó dùng.
           Nay: kéo chuột TRÁI trên nền = di chuyển; giữ Shift + kéo = khoanh chọn nhiều hình;
           giữ Space = tạm thời di chuyển; luôn kéo được bằng chuột giữa/phải. */
        panOnDrag={panWithLeftDrag ? [0, 1, 2] : [1, 2]}
        selectionOnDrag={editing && !panWithLeftDrag}
        selectionKeyCode={['Shift']}
        multiSelectionKeyCode={['Control', 'Meta']}
        panOnScroll={false}
        zoomOnScroll
        zoomOnDoubleClick={false}
        minZoom={0.15}
        maxZoom={3}
        style={{ cursor: panWithLeftDrag ? 'grab' : 'default' }}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} color="#e2e8f0" />
        <Controls showInteractive={false} />
        {/* Bản đồ thu nhỏ — kéo/bấm vào đây để nhảy nhanh tới vùng cần sửa */}
        <MiniMap pannable zoomable style={{ height: full ? 120 : 90 }} />

        {/* Công cụ điều hướng: Bàn tay ↔ Chọn, và Vừa khung */}
        <Panel position="bottom-left" style={{ display: 'flex', gap: 6, marginLeft: 44 }}>
          {editing && (
            <>
              <button
                onClick={() => setSelectMode(false)}
                title="Bàn tay — kéo chuột trái để di chuyển canvas (mặc định). Hoặc giữ Space bất cứ lúc nào."
                style={btn({ width: 32, justifyContent: 'center', height: 28,
                  ...(!selectMode ? { background: 'var(--color-primary-bg)', borderColor: 'var(--color-primary)', color: 'var(--color-primary-dark)' } : {}) })}
              ><Hand size={14} /></button>
              <button
                onClick={() => setSelectMode(true)}
                title="Chọn — kéo chuột trái để khoanh chọn nhiều hình (hoặc giữ Shift + kéo)"
                style={btn({ width: 32, justifyContent: 'center', height: 28,
                  ...(selectMode ? { background: 'var(--color-primary-bg)', borderColor: 'var(--color-primary)', color: 'var(--color-primary-dark)' } : {}) })}
              ><MousePointer2 size={14} /></button>
            </>
          )}
          <button onClick={() => fitView({ duration: 400, padding: 0.15 })}
            title="Thu toàn bộ sơ đồ vừa khung nhìn"
            style={btn({ height: 28 })}><Focus size={13} /> Vừa khung</button>
        </Panel>

        {/* Thanh công cụ */}
        <Panel position="top-left" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: '75%' }}>
          {!editing ? (
            <>
              {canEdit && (
                <button style={btn({ background: 'var(--color-primary)', color: '#fff', borderColor: 'transparent' })}
                  onClick={() => setEditing(true)}>✏ Chỉnh sửa</button>
              )}
              <button style={btn()} onClick={() => setFull((v) => !v)}>
                {full ? <Minimize2 size={12} /> : <Maximize2 size={12} />} {full ? 'Thu nhỏ' : 'Toàn màn hình'}
              </button>
            </>
          ) : (
            <>
              {Object.entries(SHAPES).map(([type, cfg]) => (
                <button key={type} style={btn()} onClick={() => addShape(type)} title={`Thêm ${cfg.label}`}>
                  <ShapeIcon type={type} /> {cfg.label}
                </button>
              ))}
              <span style={{ width: 1, background: 'var(--color-border)', margin: '0 2px' }} />
              <button style={btn()} onClick={copySelection} title="Ctrl+C"><Copy size={12} /> Chép</button>
              <button style={btn()} onClick={pasteClipboard} title="Ctrl+V"><ClipboardPaste size={12} /> Dán</button>
              <button style={btn()} onClick={undo} title="Ctrl+Z"><Undo2 size={12} /> Hoàn tác</button>
              <button style={btn()} onClick={() => setFull((v) => !v)}>
                {full ? <Minimize2 size={12} /> : <Maximize2 size={12} />} {full ? 'Thu nhỏ' : 'Toàn màn hình'}
              </button>
              <span style={{ width: 1, background: 'var(--color-border)', margin: '0 2px' }} />
              <button style={btn({ background: dirty ? '#16a34a' : '#94a3b8', color: '#fff', borderColor: 'transparent' })}
                onClick={save} disabled={saving || !dirty}>
                <Save size={12} /> {saving ? 'Đang lưu…' : 'Lưu'}
              </button>
              <button style={btn()} onClick={cancelEdit}><X size={12} /> Huỷ</button>
            </>
          )}
        </Panel>

        {/* Bảng ĐỊNH DẠNG hình đang chọn */}
        {editing && selNode && !selEdge && (() => {
          const st = selNode.data.style || {}
          const set = (patch) => patchNodeStyle(selNode.id, patch)
          const swatch = (val, cur, onPick) => (
            <button key={val} onClick={() => onPick(val)} title={val}
              style={{
                width: 20, height: 20, borderRadius: 4, cursor: 'pointer', flexShrink: 0,
                background: val === 'transparent' ? 'repeating-conic-gradient(#e2e8f0 0% 25%, #fff 0% 50%) 50%/8px 8px' : val,
                border: cur === val ? '2px solid #0f172a' : '1px solid #cbd5e1',
              }} />
          )
          return (
            <Panel position="top-right" style={{
              width: 224, background: '#fff', border: '1px solid var(--color-border)',
              borderRadius: 8, padding: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
              maxHeight: '78%', overflowY: 'auto',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                {SHAPES[selNode.type]?.label ?? 'Hình'}
              </div>

              {!selIsLine && (
                <>
                  <Lbl>Cỡ chữ &amp; kiểu</Lbl>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                    <select value={st.fontSize || 13} onChange={(e) => set({ fontSize: Number(e.target.value) })}
                      style={{ flex: 1, height: 26, fontSize: 12, border: '1px solid var(--color-border)', borderRadius: 5 }}>
                      {[11, 12, 13, 15, 18, 22, 28].map((s) => <option key={s} value={s}>{s}px</option>)}
                    </select>
                    <button onClick={() => set({ bold: !st.bold })}
                      style={btn({ width: 30, justifyContent: 'center', fontWeight: 800, height: 26,
                        ...(st.bold ? { background: 'var(--color-primary-bg)', borderColor: 'var(--color-primary)' } : {}) })}>B</button>
                    <button onClick={() => set({ italic: !st.italic })}
                      style={btn({ width: 30, justifyContent: 'center', fontStyle: 'italic', height: 26,
                        ...(st.italic ? { background: 'var(--color-primary-bg)', borderColor: 'var(--color-primary)' } : {}) })}>I</button>
                  </div>

                  <Lbl>Màu chữ</Lbl>
                  <Row>{['#0f172a', '#dc2626', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#ffffff']
                    .map((c) => swatch(c, st.textColor || '#0f172a', (v) => set({ textColor: v })))}</Row>

                  <Lbl>Màu nền</Lbl>
                  <Row>{['#eff6ff', '#fee2e2', '#dcfce7', '#fef3c7', '#f3e8ff', '#f1f5f9', '#ffffff', 'transparent']
                    .map((c) => swatch(c, st.bgColor || '#eff6ff', (v) => set({ bgColor: v })))}</Row>
                </>
              )}

              <Lbl>{selIsLine ? 'Màu đường' : 'Màu viền'}</Lbl>
              <Row>{['#2563eb', '#334155', '#dc2626', '#16a34a', '#d97706', '#7c3aed']
                .map((c) => swatch(c, st.borderColor || (selIsLine ? '#334155' : '#2563eb'), (v) => set({ borderColor: v })))}</Row>

              {selIsLine && (
                <>
                  <Lbl>Kiểu nét</Lbl>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                    {[[false, '── Liền'], [true, '┄┄ Đứt']].map(([val, lb]) => (
                      <button key={String(val)} onClick={() => set({ dashed: val })}
                        style={btn({ flex: 1, fontSize: 11, height: 26, justifyContent: 'center',
                          ...(!!st.dashed === val ? { background: 'var(--color-primary-bg)', borderColor: 'var(--color-primary)' } : {}) })}>
                        {lb}
                      </button>
                    ))}
                  </div>

                  <Lbl>Độ dày</Lbl>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                    {[1, 2, 3, 5].map((t) => (
                      <button key={t} onClick={() => set({ thickness: t })}
                        style={btn({ flex: 1, fontSize: 11, height: 26, justifyContent: 'center',
                          ...((st.thickness || 2) === t ? { background: 'var(--color-primary-bg)', borderColor: 'var(--color-primary)' } : {}) })}>
                        {t}px
                      </button>
                    ))}
                  </div>

                  <Lbl>Góc xoay — đường luôn THẲNG</Lbl>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                    {[0, 45, 90, 135].map((d) => (
                      <button key={d} onClick={() => set({ rotation: d })}
                        style={btn({ flex: 1, fontSize: 11, height: 26, justifyContent: 'center',
                          ...((st.rotation || 0) === d ? { background: 'var(--color-primary-bg)', borderColor: 'var(--color-primary)' } : {}) })}>
                        {d}°
                      </button>
                    ))}
                  </div>
                  <input type="range" min="0" max="359" value={st.rotation || 0}
                    onChange={(e) => set({ rotation: Number(e.target.value) })}
                    style={{ width: '100%' }} />
                  <div style={{ fontSize: 11, color: 'var(--color-muted)', textAlign: 'center' }}>
                    {st.rotation || 0}° · kéo mép để đổi độ dài
                  </div>
                </>
              )}
            </Panel>
          )
        })()}

        {/* Bảng sửa đường nối giữa 2 hình */}
        {editing && selEdge && (
          <Panel position="top-right" style={{
            width: 235, background: '#fff', border: '1px solid var(--color-border)',
            borderRadius: 8, padding: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Đường nối</div>
            <input
              value={selEdge.label || ''}
              onChange={(e) => patchEdge(selEdge.id, { label: e.target.value })}
              placeholder="Nhãn: Hợp lệ, Thiếu chứng từ…"
              style={{ width: '100%', marginBottom: 8, padding: '6px 8px', fontSize: 12,
                       border: '1px solid var(--color-border)', borderRadius: 6 }}
            />
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {[['arrow', '→ 1 chiều'], ['double', '↔ 2 chiều'], ['line', '— Không mũi tên']].map(([k, lb]) => (
                <button key={k} onClick={() => patchEdge(selEdge.id, { edgeKind: k })}
                  style={btn({
                    flex: 1, padding: '0 4px', fontSize: 11, height: 26,
                    ...(selEdge.data?.edgeKind === k
                      ? { background: 'var(--color-primary-bg)', borderColor: 'var(--color-primary)', color: 'var(--color-primary-dark)' }
                      : {}),
                  })}>{lb}</button>
              ))}
            </div>
            <button onClick={() => patchEdge(selEdge.id, { reverse: true })}
              style={btn({ width: '100%', justifyContent: 'center', marginBottom: 8 })}>
              <ArrowLeftRight size={12} /> Đổi chiều mũi tên
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!selEdge.data?.dashed}
                onChange={(e) => patchEdge(selEdge.id, { dashed: e.target.checked })} />
              Nét đứt
            </label>
          </Panel>
        )}

        <Panel position="bottom-center" style={{ fontSize: 11, color: 'var(--color-muted)' }}>
          {editing
            ? (spaceHeld
                ? '✋ Đang giữ Space — kéo để di chuyển canvas'
                : 'Kéo nền = di chuyển · Shift+kéo = khoanh chọn · Space = tạm di chuyển · nhấp đúp sửa chữ · Delete xoá · Ctrl+C/V · Ctrl+Z')
            : 'Kéo nền để di chuyển · cuộn để phóng to'}
        </Panel>
      </ReactFlow>
    </div>
  )
}

// Nhãn nhỏ + hàng ô màu trong bảng định dạng
const Lbl = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', marginBottom: 4 }}>{children}</div>
)
const Row = ({ children }) => (
  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>{children}</div>
)

// Icon xem trước hình trên nút thêm
function ShapeIcon({ type }) {
  const base = { width: 12, height: 12, border: '1.6px solid currentColor', flexShrink: 0 }
  const map = {
    rectangle:     { ...base, borderRadius: 2 },
    square:        { ...base, width: 11, height: 11 },
    circle:        { ...base, borderRadius: '50%' },
    triangle:      { ...base, border: 'none', width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderBottom: '11px solid currentColor' },
    parallelogram: { ...base, transform: 'skewX(-18deg)' },
    diamond:       { ...base, transform: 'rotate(45deg)', width: 9, height: 9 },
    text:          null,
  }
  if (type === 'text') return <span style={{ fontWeight: 800, fontSize: 12 }}>T</span>
  if (type === 'line')  return <span style={{ width: 13, height: 0, borderTop: '2px solid currentColor', flexShrink: 0 }} />
  if (type === 'arrow') return <span style={{ fontWeight: 800, fontSize: 13, lineHeight: 1 }}>→</span>
  return <span style={map[type]} />
}

export default function ProcessFlowEditor(props) {
  return (
    <ReactFlowProvider>
      <EditorInner {...props} />
    </ReactFlowProvider>
  )
}
