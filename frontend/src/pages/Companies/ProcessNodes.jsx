import { Handle, Position } from '@xyflow/react'

// 5 loại nút của sơ đồ quy trình. Mỗi loại một HÌNH DẠNG riêng để nhìn là hiểu:
//   start/end = viên thuốc · step = chữ nhật · decision = hình thoi · document = góc gấp

const BASE = {
  padding: '10px 14px',
  minWidth: 150,
  maxWidth: 240,
  fontSize: 13,
  lineHeight: 1.35,
  textAlign: 'center',
  border: '2px solid',
  background: '#fff',
  wordBreak: 'break-word',
}

const TONE = {
  start:    { borderColor: '#10b981', background: '#ecfdf5', color: '#065f46' },
  end:      { borderColor: '#ef4444', background: '#fef2f2', color: '#991b1b' },
  step:     { borderColor: '#3b82f6', background: '#eff6ff', color: '#1e40af' },
  decision: { borderColor: '#f59e0b', background: '#fffbeb', color: '#92400e' },
  document: { borderColor: '#8b5cf6', background: '#f5f3ff', color: '#5b21b6' },
}

// Cổng nối: NHẬN ở trái/trên, PHÁT ở phải/dưới.
// Nhờ có cổng dưới/trên nên mũi tên "quay ngược về bước trước" vẽ gọn, không cắt ngang sơ đồ.
function Ports() {
  const dot = { width: 9, height: 9, background: '#64748b', border: '2px solid #fff' }
  return (
    <>
      <Handle id="t-left" type="target" position={Position.Left}   style={dot} />
      <Handle id="t-top"  type="target" position={Position.Top}    style={dot} />
      <Handle id="s-right"  type="source" position={Position.Right}  style={dot} />
      <Handle id="s-bottom" type="source" position={Position.Bottom} style={dot} />
    </>
  )
}

function Body({ data }) {
  return (
    <>
      {data.code && (
        <div style={{ fontSize: 10, fontWeight: 800, opacity: 0.65, marginBottom: 2 }}>{data.code}</div>
      )}
      <div style={{ fontWeight: 600 }}>{data.title || '(chưa đặt tên)'}</div>
      {data.actor && (
        <div style={{ fontSize: 11, opacity: 0.8, marginTop: 3 }}>👤 {data.actor}</div>
      )}
      {data.note && (
        <div style={{ fontSize: 10, opacity: 0.65, marginTop: 2, fontStyle: 'italic' }}>
          {data.note.length > 40 ? `${data.note.slice(0, 40)}…` : data.note}
        </div>
      )}
    </>
  )
}

const ring = (selected) => (selected ? { boxShadow: '0 0 0 3px rgba(37,99,235,0.35)' } : null)

function StepNode({ data, selected }) {
  return (
    <div style={{ ...BASE, ...TONE.step, borderRadius: 8, ...ring(selected) }}>
      <Ports /><Body data={data} />
    </div>
  )
}

function StartNode({ data, selected }) {
  return (
    <div style={{ ...BASE, ...TONE.start, borderRadius: 999, ...ring(selected) }}>
      <Ports /><Body data={data} />
    </div>
  )
}

function EndNode({ data, selected }) {
  return (
    <div style={{ ...BASE, ...TONE.end, borderRadius: 999, ...ring(selected) }}>
      <Ports /><Body data={data} />
    </div>
  )
}

// Hình thoi — dùng clip-path để chữ vẫn nằm ngang (dễ đọc hơn cách xoay 45°)
function DecisionNode({ data, selected }) {
  return (
    <div
      style={{
        ...BASE,
        ...TONE.decision,
        minWidth: 190,
        padding: '26px 30px',
        clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
        border: 'none',
        outline: selected ? '3px solid rgba(245,158,11,0.55)' : 'none',
        background: '#fef3c7',
        color: TONE.decision.color,
      }}
    >
      <Ports /><Body data={data} />
    </div>
  )
}

// Tài liệu — góc trên phải gấp lại
function DocumentNode({ data, selected }) {
  return (
    <div
      style={{
        ...BASE, ...TONE.document, borderRadius: 6,
        clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%)',
        ...ring(selected),
      }}
    >
      <Ports /><Body data={data} />
    </div>
  )
}

export const nodeTypes = {
  start:    StartNode,
  step:     StepNode,
  decision: DecisionNode,
  end:      EndNode,
  document: DocumentNode,
}

export const NODE_TYPE_LABELS = {
  start:    'Bắt đầu',
  step:     'Bước xử lý',
  decision: 'Quyết định',
  end:      'Kết thúc',
  document: 'Tài liệu',
}
