import { useState, useCallback, useEffect, useRef } from 'react'
import {
  ReactFlow, Background, BackgroundVariant, Controls, MiniMap, Panel,
  useNodesState, useEdgesState, addEdge, MarkerType, ReactFlowProvider, useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Save, X, Undo2, Copy, ClipboardPaste, Maximize2, Minimize2, ArrowLeftRight,
  Hand, MousePointer2, Focus, Grid3x3, Pencil,
  RectangleHorizontal, Square, Circle, Triangle, Diamond, Type, Minus, ArrowRight,
} from 'lucide-react'

// Bước lưới: hình sẽ "hít" vào bội số của giá trị này → các hình tự căn đều nhau
const GRID = 16

// Thang cỡ chữ — lên tới 100px để làm tiêu đề lớn trên sơ đồ
const FONT_SIZES = [11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40, 48, 56, 64, 72, 84, 100]

import { useToastStore } from '../../stores/toastStore'
import * as api from '../../api/companyProcesses'
import { nodeTypes, SHAPES, LINE_SHAPES } from './ProcessNodes'
import { pointsFromLegacy, normalizePoints } from './lineGeometry'

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

// Dáng đường nối → kiểu edge của React Flow
const EDGE_TYPE = {
  straight: 'straight',    // đường thẳng nối trực tiếp
  curved:   'default',     // đường cong (bezier) — mặc định
  elbow:    'smoothstep',  // gấp khúc vuông góc, bo góc nhẹ
}

// Icon 3 dáng đường cho bảng chỉnh đường nối
const EDGE_SHAPE_OPTS = [
  { key: 'straight', label: 'Đường thẳng', path: 'M3 13 L23 3' },
  { key: 'curved',   label: 'Đường cong',  path: 'M3 13 C3 3, 23 13, 23 3' },
  { key: 'elbow',    label: 'Gấp khúc',    path: 'M3 13 L13 13 L13 3 L23 3' },
]

function edgeVisual(kind, dashed, shape) {
  return {
    type: EDGE_TYPE[shape] || 'default',
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

const toFlowNodes = (nodes, editable) => nodes.map((n) => {
  const type = SHAPES[n.nodeType] ? n.nodeType : 'rectangle'
  let style  = n.style || {}
  let width  = n.width  ?? SHAPES[type]?.w ?? 160
  let height = n.height ?? SHAPES[type]?.h ?? 70
  let position = { x: n.posX, y: n.posY }

  // Đường kẻ / mũi tên: quy đổi dữ liệu cũ (khung + hướng) sang mô hình điểm
  // NGAY LÚC ĐỌC, rồi dồn khung có chừa lề. Nếu không, 2 đầu đường nằm sát mép
  // khung khiến chấm tay nắm thò hẳn ra ngoài, rất khó bấm trúng.
  if (LINE_SHAPES.has(type)) {
    const pts = Array.isArray(style.points) && style.points.length >= 2
      ? style.points
      : pointsFromLegacy(style, width, height)
    const box = normalizePoints(pts)
    style = { ...style, points: box.points }
    width = box.width; height = box.height
    position = { x: position.x + box.dx, y: position.y + box.dy }
  }

  return {
    id: n.id,
    type,
    position,
    width,
    height,
    data: { title: n.title, actor: n.actor, note: n.note, code: n.code, style, _editable: editable },
  }
})

const toFlowEdges = (edges) => edges.map((e) => ({
  id: e.id,
  source: e.fromNodeId,
  target: e.toNodeId,
  sourceHandle: e.sourceHandle || undefined,
  targetHandle: e.targetHandle || undefined,
  label: e.label || undefined,
  data: { edgeKind: e.edgeKind || 'arrow', dashed: !!e.dashed, edgeShape: e.edgeShape || 'curved' },
  ...edgeVisual(e.edgeKind || 'arrow', !!e.dashed, e.edgeShape || 'curved'),
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
  edgeShape: e.data?.edgeShape || 'curved',
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
  // Lưới căn hình — nhớ lựa chọn giữa các lần mở
  const [showGrid, setShowGrid] = useState(() => {
    try { return sessionStorage.getItem('process_grid') !== 'off' } catch { return true }
  })
  useEffect(() => {
    try { sessionStorage.setItem('process_grid', showGrid ? 'on' : 'off') } catch { /* ignore */ }
  }, [showGrid])
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

  // Đánh dấu "có thay đổi" cho cả những sửa đổi đi THẲNG qua React Flow —
  // sửa chữ trong hình (updateNodeData → 'replace') và kéo giãn kích thước
  // (NodeResizer → 'dimensions' kèm cờ resizing). Trước đây hai thao tác này
  // không bật cờ nên nút Lưu vẫn xám và Ctrl+S im lặng → sửa xong mất trắng.
  // Bỏ qua 'select' và 'dimensions' lúc React Flow tự đo hình khi mới mở,
  // nếu không sơ đồ vừa tải đã bị coi là đang sửa dở.
  const isRealChange = useCallback((c) => (
    c.type === 'replace' || c.type === 'remove' || c.type === 'add'
    || (c.type === 'dimensions' && c.resizing)
    || (c.type === 'position' && c.dragging === false)
  ), [])

  const handleNodesChange = useCallback((changes) => {
    onNodesChange(changes)
    if (changes.some(isRealChange)) setDirty(true)
  }, [onNodesChange, isRealChange])

  const handleEdgesChange = useCallback((changes) => {
    onEdgesChange(changes)
    if (changes.some(isRealChange)) setDirty(true)
  }, [onEdgesChange, isRealChange])

  function patchNodeStyle(nodeId, patch) {
    setNodes((nds) => nds.map((n) => n.id === nodeId
      ? { ...n, data: { ...n.data, style: { ...(n.data.style || {}), ...patch } } }
      : n))
    setDirty(true)
  }

  // Đảo chiều mũi tên = đảo THỨ TỰ các điểm. Đường nằm y nguyên chỗ cũ, chỉ đầu
  // mũi tên nhảy sang đầu kia — nhờ vậy chiều và phía cong chỉnh độc lập nhau.
  function reverseLine(node) {
    setNodes((nds) => nds.map((n) => {
      if (n.id !== node.id) return n
      const st = n.data.style || {}
      const pts = Array.isArray(st.points) && st.points.length >= 2
        ? st.points
        : pointsFromLegacy(st, n.width, n.height)
      return { ...n, data: { ...n.data, style: { ...st, points: [...pts].reverse() } } }
    }))
    setDirty(true)
  }

  const updatedAtRef = useRef(process.updatedAt)
  const historyRef   = useRef([])
  const clipboardRef = useRef(null)
  const pasteCountRef = useRef(0)
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

  // ── Lịch sử hoàn tác: GHI TỰ ĐỘNG mọi thay đổi ─────────────────────────────
  // Trước đây chỉ ghi ở 3 chỗ (thêm hình / nối / dán) nên di chuyển, kéo giãn,
  // xoá bằng Delete, sửa chữ, đổi màu… đều không hoàn tác được.
  // Nay theo dõi luôn nodes+edges: thao tác lắng xuống 350ms thì chốt 1 mốc.
  const baselineRef  = useRef(null)   // trạng thái ổn định gần nhất
  const restoringRef = useRef(false)  // đang khôi phục → không ghi thành mốc mới

  // Chỉ giữ các trường cần thiết — KHÔNG structuredClone cả node vì bên trong
  // React Flow có dữ liệu nội bộ, clone dễ lỗi.
  const cloneGraph = useCallback((nds, eds) => ({
    nodes: nds.map((n) => ({
      id: n.id, type: n.type,
      position: { ...n.position },
      width: n.width, height: n.height,
      data: JSON.parse(JSON.stringify({ ...n.data })),
    })),
    edges: eds.map((e) => ({ ...e, data: { ...(e.data || {}) } })),
  }), [])

  useEffect(() => {
    if (editing) { baselineRef.current = cloneGraph(nodes, edges); historyRef.current = [] }
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editing) return undefined
    if (restoringRef.current) {
      restoringRef.current = false
      baselineRef.current = cloneGraph(nodes, edges)
      return undefined
    }
    const t = setTimeout(() => {
      const prev = baselineRef.current
      const cur  = cloneGraph(nodes, edges)
      if (prev && JSON.stringify(prev) !== JSON.stringify(cur)) {
        historyRef.current.push(prev)
        if (historyRef.current.length > 50) historyRef.current.shift()
        baselineRef.current = cur
      }
    }, 350)
    return () => clearTimeout(t)
  }, [nodes, edges, editing, cloneGraph])

  const undo = useCallback(() => {
    const prev = historyRef.current.pop()
    if (!prev) { addToast('Không còn thao tác để hoàn tác', 'info'); return }
    restoringRef.current = true
    setNodes(prev.nodes.map((n) => ({ ...n, data: { ...n.data, _editable: true } })))
    setEdges(prev.edges)
    setDirty(true)
  }, [setNodes, setEdges, addToast])

  const onConnect = useCallback((params) => {
    setEdges((eds) => addEdge({
      ...params, id: newId(),
      data: { edgeKind: 'arrow', dashed: false, edgeShape: 'curved' },
      ...edgeVisual('arrow', false, 'curved'), ...LABEL_STYLE,
    }, eds))
    setDirty(true)
  }, [setEdges])

  // Giữ tham chiếu mới nhất để phím tắt 1–9 luôn gọi đúng hàm (tránh closure cũ)
  const addShapeRef = useRef(null)
  addShapeRef.current = addShape

  function addShape(type) {
    const { w, h, points } = SHAPES[type]
    const k = nodes.length
    setNodes((nds) => [...nds, {
      id: newId(), type,
      position: { x: 60 + (k * 40) % 360, y: 60 + Math.floor(k / 9) * 120 + (k * 25) % 200 },
      width: w, height: h,
      // Đường kẻ / mũi tên sinh kèm 2 đầu mút để kéo được ngay, không phải
      // chờ quy đổi từ dữ liệu cũ
      data: {
        title: '', actor: '', note: '', code: '', _editable: true,
        ...(points ? { style: { points: points() } } : {}),
      },
    }])
    setDirty(true)
  }

  // ── Copy / Paste khối đang chọn ─────────────────────────────────────────────
  const copySelection = useCallback(() => {
    const sel = nodes.filter((n) => n.selected)
    if (!sel.length) { addToast('Chưa chọn hình nào để sao chép', 'info'); return }
    const ids = new Set(sel.map((n) => n.id))
    // Chép LUÔN mũi tên nằm trọn trong vùng chọn (cả 2 đầu đều được chọn) —
    // trước đây chỉ chép hình nên dán ra bị mất hết liên kết.
    const innerEdges = edges.filter((e) => ids.has(e.source) && ids.has(e.target))
    clipboardRef.current = {
      // Chỉ giữ trường cần — tránh clone dữ liệu nội bộ của React Flow
      nodes: sel.map((n) => ({
        srcId: n.id, type: n.type,
        position: { ...n.position }, width: n.width, height: n.height,
        data: JSON.parse(JSON.stringify({ ...n.data })),
      })),
      edges: innerEdges.map((e) => ({ ...e, data: { ...(e.data || {}) } })),
    }
    pasteCountRef.current = 0
    addToast(
      `Đã chép ${sel.length} hình${innerEdges.length ? ` + ${innerEdges.length} mũi tên` : ''}`,
      'success',
    )
  }, [nodes, edges, addToast])

  const pasteClipboard = useCallback(() => {
    const clip = clipboardRef.current
    if (!clip?.nodes?.length) { addToast('Chưa có gì để dán', 'info'); return }
    // Mỗi lần dán lệch thêm một nấc, tránh các bản dán chồng khít lên nhau
    pasteCountRef.current += 1
    const off = 40 * pasteCountRef.current

    const idMap = new Map()
    const newNodes = clip.nodes.map((n) => {
      const id = newId()
      idMap.set(n.srcId, id)
      return {
        id, type: n.type,
        position: { x: n.position.x + off, y: n.position.y + off },
        width: n.width, height: n.height,
        data: { ...n.data, _editable: true },
        selected: true,
      }
    })
    const newEdges = clip.edges.map((e) => ({
      ...e, id: newId(),
      source: idMap.get(e.source), target: idMap.get(e.target),
      selected: false,
    }))

    setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...newNodes])
    if (newEdges.length) setEdges((eds) => [...eds, ...newEdges])
    setDirty(true)
    addToast(`Đã dán ${newNodes.length} hình`, 'success')
  }, [setNodes, setEdges, addToast])

  // Bật/tắt đậm–nghiêng cho MỌI hình đang chọn (đường kẻ/mũi tên không có chữ nên bỏ qua)
  const toggleTextStyle = useCallback((key) => {
    const sel = nodes.filter((n) => n.selected && !LINE_SHAPES.has(n.type))
    if (!sel.length) return
    // Nếu tất cả đang bật thì tắt hết, ngược lại bật hết
    const allOn = sel.every((n) => n.data.style?.[key])
    setNodes((nds) => nds.map((n) => (n.selected && !LINE_SHAPES.has(n.type))
      ? { ...n, data: { ...n.data, style: { ...(n.data.style || {}), [key]: !allOn } } }
      : n))
    setDirty(true)
  }, [nodes, setNodes])

  // ── Phím tắt: Ctrl+B/I/C/V/Z ───────────────────────────────────────────────
  useEffect(() => {
    if (!editing) return
    function onKey(e) {
      const ctrl = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()

      // Ctrl+S = Lưu. Luôn chặn hộp thoại "Lưu trang" của trình duyệt, kể cả khi
      // chưa có thay đổi — nếu không người dùng sẽ bị bung hộp thoại lạ.
      if (ctrl && k === 's') {
        e.preventDefault()
        saveRef.current?.()
        return
      }

      // Ctrl+B / Ctrl+I áp cho cả hình đang chọn — CHO PHÉP cả khi đang gõ chữ trong hình,
      // vì đậm/nghiêng áp cho toàn bộ hình chứ không riêng đoạn chữ bôi đen.
      if (ctrl && (k === 'b' || k === 'i')) {
        e.preventDefault()
        toggleTextStyle(k === 'b' ? 'bold' : 'italic')
        return
      }

      if (['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) return
      if (ctrl && k === 'c') { e.preventDefault(); copySelection() }
      else if (ctrl && k === 'v') { e.preventDefault(); pasteClipboard() }
      else if (ctrl && k === 'z') { e.preventDefault(); undo() }
      // Phím 1–9: thêm nhanh hình tương ứng (số nhỏ hiện trên từng nút)
      else if (!ctrl && /^[1-9]$/.test(e.key)) {
        const type = Object.keys(SHAPES)[Number(e.key) - 1]
        if (type) { e.preventDefault(); addShapeRef.current(type) }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [editing, copySelection, pasteClipboard, undo, toggleTextStyle])

  useEffect(() => {
    function onEsc(e) { if (e.key === 'Escape' && full) setFull(false) }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [full])

  // ── Mũi tên: đổi chiều / kiểu / nét ─────────────────────────────────────────
  function patchEdge(id, patch) {
    setEdges((eds) => eds.map((e) => {
      if (e.id !== id) return e
      const kind   = patch.edgeKind  ?? e.data?.edgeKind  ?? 'arrow'
      const dashed = patch.dashed    ?? e.data?.dashed    ?? false
      const shape  = patch.edgeShape ?? e.data?.edgeShape ?? 'curved'
      const next = {
        ...e,
        label: patch.label !== undefined ? (patch.label || undefined) : e.label,
        data: { ...e.data, edgeKind: kind, dashed, edgeShape: shape },
        ...edgeVisual(kind, dashed, shape), ...LABEL_STYLE,
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

  // Giữ tham chiếu mới nhất cho phím tắt Ctrl+S (tránh lưu nhầm dữ liệu cũ do closure)
  const saveRef = useRef(null)
  saveRef.current = () => {
    if (saving || !dirty) return   // chưa đổi gì hoặc đang lưu → bỏ qua
    save()
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
        onNodesChange={editing ? handleNodesChange : undefined}
        onEdgesChange={editing ? handleEdgesChange : undefined}
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
        /* Hít vào lưới: khi kéo, hình tự bám vào mốc 16px → các hình thẳng hàng, đều nhau */
        snapToGrid={editing && showGrid}
        snapGrid={[GRID, GRID]}
        style={{ cursor: panWithLeftDrag ? 'grab' : 'default', background: '#ffffff' }}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        {/* Chế độ XEM: nền trắng trơn cho dễ đọc.
            Chế độ SỬA: lưới ô vuông để căn hình cho đều (kết hợp snapToGrid bên dưới). */}
        {editing && showGrid ? (
          <>
            <Background id="g-nho" variant={BackgroundVariant.Lines} gap={GRID} color="#eef2f7" />
            <Background id="g-lon" variant={BackgroundVariant.Lines} gap={GRID * 5} color="#dbe3ec" />
          </>
        ) : (
          <Background color="#ffffff" style={{ background: '#ffffff' }} />
        )}
        <Controls showInteractive={false} />
        {/* Bản đồ thu nhỏ — kéo/bấm vào đây để nhảy nhanh tới vùng cần sửa */}
        <MiniMap pannable zoomable style={{ height: full ? 120 : 90 }} />

        {/* Điều hướng canvas — cùng kiểu khung với thanh công cụ */}
        <Panel position="bottom-left" style={{ marginLeft: 44 }}>
          <div style={BAR}>
            {editing && (
              <>
                <TBtn onClick={() => setSelectMode(false)} tone={!selectMode ? 'active' : undefined}
                  title="Bàn tay — kéo chuột trái để di chuyển canvas (hoặc giữ Space)">
                  <Hand size={16} />
                </TBtn>
                <TBtn onClick={() => setSelectMode(true)} tone={selectMode ? 'active' : undefined}
                  title="Chọn — kéo để khoanh chọn nhiều hình (hoặc giữ Shift + kéo)">
                  <MousePointer2 size={16} />
                </TBtn>
                <TBtn onClick={() => setShowGrid((v) => !v)} tone={showGrid ? 'active' : undefined}
                  title={showGrid ? 'Tắt lưới — hình di chuyển tự do' : 'Bật lưới — hình tự căn thẳng hàng'}>
                  <Grid3x3 size={16} />
                </TBtn>
                <Sep />
              </>
            )}
            <TBtn onClick={() => fitView({ duration: 400, padding: 0.15 })}
              title="Thu toàn bộ sơ đồ vừa khung nhìn">
              <Focus size={16} />
            </TBtn>
          </div>
        </Panel>

        {/* Thanh công cụ — GỘP 1 KHUNG, chỉ icon; tên hiện khi rê chuột */}
        <Panel position="top-left">
          <div style={BAR}>
            {!editing ? (
              <>
                {canEdit && (
                  <TBtn onClick={() => setEditing(true)} title="Chỉnh sửa sơ đồ" tone="primary">
                    <Pencil size={16} />
                  </TBtn>
                )}
                <TBtn onClick={() => setFull((v) => !v)} title={full ? 'Thu nhỏ' : 'Toàn màn hình'}>
                  {full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </TBtn>
              </>
            ) : (
              <>
                {Object.entries(SHAPES).map(([type, cfg], i) => (
                  <TBtn key={type} onClick={() => addShape(type)}
                    title={`${cfg.label}  (phím ${i + 1})`} badge={i + 1}>
                    <ShapeIcon type={type} />
                  </TBtn>
                ))}

                <Sep />
                <TBtn onClick={copySelection}  title="Chép  (Ctrl+C)"><Copy size={16} /></TBtn>
                <TBtn onClick={pasteClipboard} title="Dán  (Ctrl+V)"><ClipboardPaste size={16} /></TBtn>
                <TBtn onClick={undo}           title="Hoàn tác  (Ctrl+Z)"><Undo2 size={16} /></TBtn>
                <TBtn onClick={() => setFull((v) => !v)} title={full ? 'Thu nhỏ' : 'Toàn màn hình'}>
                  {full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </TBtn>

                <Sep />
                <TBtn onClick={save} disabled={saving || !dirty}
                  title={dirty ? 'Lưu sơ đồ  (Ctrl+S)' : 'Chưa có thay đổi nào'} tone={dirty ? 'save' : 'muted'}>
                  <Save size={16} />
                </TBtn>
                <TBtn onClick={cancelEdit} title="Huỷ thay đổi" tone="danger"><X size={16} /></TBtn>
              </>
            )}
          </div>
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
                      {FONT_SIZES.map((s) => <option key={s} value={s}>{s}px</option>)}
                    </select>
                    <button onClick={() => set({ bold: !st.bold })} title="In đậm (Ctrl+B)"
                      style={btn({ width: 30, justifyContent: 'center', fontWeight: 800, height: 26,
                        ...(st.bold ? { background: 'var(--color-primary-bg)', borderColor: 'var(--color-primary)' } : {}) })}>B</button>
                    <button onClick={() => set({ italic: !st.italic })} title="In nghiêng (Ctrl+I)"
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

                  <Lbl>Dáng đường</Lbl>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                    {EDGE_SHAPE_OPTS.map(({ key, path, label }) => (
                      <button key={key} onClick={() => set({ lineShape: key })} title={label}
                        style={btn({ flex: 1, height: 28, padding: 0, justifyContent: 'center',
                          ...((st.lineShape || 'straight') === key
                            ? { background: 'var(--color-primary-bg)', borderColor: 'var(--color-primary)' } : {}) })}>
                        <svg width="26" height="16" viewBox="0 0 26 16" fill="none"
                          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d={path} />
                        </svg>
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                    <button onClick={() => reverseLine(selNode)}
                      title="Đổi đầu mũi tên sang đầu kia"
                      style={btn({ flex: 1, fontSize: 11, height: 26, justifyContent: 'center' })}>
                      <ArrowLeftRight size={12} /> Đảo chiều
                    </button>
                    <button onClick={() => set({ bend: st.bend === -1 ? 1 : -1 })}
                      disabled={(st.lineShape || 'straight') === 'straight'}
                      title="Lật phía cong / phía bẻ khúc sang bên kia"
                      style={btn({ flex: 1, fontSize: 11, height: 26, justifyContent: 'center',
                        ...((st.lineShape || 'straight') === 'straight'
                          ? { opacity: 0.45, cursor: 'not-allowed' } : {}) })}>
                      ⇅ Lật phía
                    </button>
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--color-muted)', lineHeight: 1.45 }}>
                    Kéo <b>chấm tròn ở 2 đầu</b> để đặt đường theo góc và chiều bất kỳ.<br />
                    Nhấp đúp lên đường để <b>thêm điểm gãy</b>, nhấp đúp lên chấm để <b>xoá</b>.
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
            <Lbl>Dáng đường</Lbl>
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {EDGE_SHAPE_OPTS.map(({ key, path, label }) => (
                <button key={key} onClick={() => patchEdge(selEdge.id, { edgeShape: key })} title={label}
                  style={btn({
                    flex: 1, height: 28, padding: 0, justifyContent: 'center',
                    ...((selEdge.data?.edgeShape || 'curved') === key
                      ? { background: 'var(--color-primary-bg)', borderColor: 'var(--color-primary)' }
                      : {}),
                  })}>
                  <svg width="26" height="16" viewBox="0 0 26 16" fill="none"
                    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={path} />
                  </svg>
                </button>
              ))}
            </div>

            <Lbl>Đầu mũi tên</Lbl>
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
                : 'Kéo nền = di chuyển · Shift+kéo = khoanh chọn · Space = tạm di chuyển · nhấp đúp sửa chữ · phím 1-9 thêm hình · Delete xoá · Ctrl+C/V · Ctrl+Z · Ctrl+B/I · Ctrl+S lưu')
            : 'Kéo nền để di chuyển · cuộn để phóng to'}
        </Panel>
      </ReactFlow>
    </div>
  )
}

// ── Thanh công cụ: 1 khung bo tròn, các nút chỉ có icon ──────────────────────
const BAR = {
  display: 'flex', alignItems: 'center', gap: 2,
  padding: 4, borderRadius: 10, background: '#fff',
  border: '1px solid #e5e7eb', boxShadow: '0 2px 10px rgba(15,23,42,0.10)',
}

const TONE_STYLE = {
  primary: { background: 'var(--color-primary)', color: '#fff' },
  save:    { background: '#16a34a', color: '#fff' },
  muted:   { background: 'transparent', color: '#94a3b8' },
  danger:  { color: '#dc2626' },
  active:  { background: 'var(--color-primary-bg)', color: 'var(--color-primary-dark)' },
}

function TBtn({ children, title, onClick, disabled, tone, badge }) {
  return (
    <button
      type="button" title={title} onClick={onClick} disabled={disabled}
      style={{
        position: 'relative',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32, padding: 0, flexShrink: 0,
        border: 'none', borderRadius: 8, background: 'transparent',
        color: '#334155', cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1, transition: 'background .12s',
        ...(tone ? TONE_STYLE[tone] : null),
      }}
      onMouseEnter={(e) => { if (!tone && !disabled) e.currentTarget.style.background = '#f1f5f9' }}
      onMouseLeave={(e) => { if (!tone && !disabled) e.currentTarget.style.background = 'transparent' }}
    >
      {children}
      {badge != null && (
        <span style={{
          position: 'absolute', right: 2, bottom: 1,
          fontSize: 8, fontWeight: 700, lineHeight: 1, color: '#94a3b8', pointerEvents: 'none',
        }}>{badge}</span>
      )}
    </button>
  )
}

const Sep = () => (
  <span style={{ width: 1, height: 20, background: '#e5e7eb', margin: '0 4px', flexShrink: 0 }} />
)

// Nhãn nhỏ + hàng ô màu trong bảng định dạng
const Lbl = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', marginBottom: 4 }}>{children}</div>
)
const Row = ({ children }) => (
  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>{children}</div>
)

// Icon của từng hình trên thanh công cụ (chỉ icon, tên hiện khi rê chuột)
function ShapeIcon({ type, size = 16 }) {
  const p = { size, strokeWidth: 1.9 }
  switch (type) {
    case 'rectangle': return <RectangleHorizontal {...p} />
    case 'square':    return <Square {...p} />
    case 'circle':    return <Circle {...p} />
    case 'triangle':  return <Triangle {...p} />
    case 'diamond':   return <Diamond {...p} />
    case 'text':      return <Type {...p} />
    case 'line':      return <Minus {...p} />
    case 'arrow':     return <ArrowRight {...p} />
    // Bình hành: lucide không có sẵn → dùng ô vuông làm nghiêng
    case 'parallelogram':
      return <span style={{ width: size - 2, height: size - 5, border: '1.9px solid currentColor',
                            transform: 'skewX(-20deg)', flexShrink: 0 }} />
    default: return <Square {...p} />
  }
}

export default function ProcessFlowEditor(props) {
  return (
    <ReactFlowProvider>
      <EditorInner {...props} />
    </ReactFlowProvider>
  )
}
