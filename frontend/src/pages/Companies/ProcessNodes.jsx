import { useState, useRef, useEffect } from 'react'
import { Handle, Position, NodeResizer, useReactFlow } from '@xyflow/react'
import { makeLineNode } from './ProcessLineNode'
import { defaultPoints } from './lineGeometry'

// Bộ HÌNH HÌNH HỌC để vẽ tự do. Không ràng buộc ý nghĩa nghiệp vụ —
// người dùng tự quyết hình nào mang nghĩa gì.

export const SHAPES = {
  rectangle:     { label: 'Chữ nhật',   w: 160, h: 70 },
  square:        { label: 'Vuông',      w: 110, h: 110 },
  circle:        { label: 'Tròn',       w: 120, h: 120 },
  triangle:      { label: 'Tam giác',   w: 130, h: 110 },
  parallelogram: { label: 'Bình hành',  w: 170, h: 75 },
  diamond:       { label: 'Thoi',       w: 150, h: 110 },
  text:          { label: 'Chữ',        w: 140, h: 40 },
  // Hình vẽ độc lập (không phải đường nối 2 hình). Khung = hộp ôm các điểm + lề,
  // do lineGeometry tính ra — không phải kích thước người dùng kéo giãn.
  line:          { label: 'Đường kẻ',   w: 204, h: 24, points: defaultPoints },
  arrow:         { label: 'Mũi tên',    w: 204, h: 24, points: defaultPoints },
}

// Hình chỉ là nét vẽ — không có nền, không nhập chữ
export const LINE_SHAPES = new Set(['line', 'arrow'])

// Cổng nối ở CẢ 4 CẠNH, mỗi cạnh vừa nhận vừa phát →
// nối được theo mọi hướng, kể cả vòng ngược lại bước trước.
const DOT = { width: 9, height: 9, background: '#2563eb', border: '2px solid #fff' }
const SIDES = [
  ['top', Position.Top], ['right', Position.Right],
  ['bottom', Position.Bottom], ['left', Position.Left],
]

function Ports({ visible }) {
  const style = visible ? DOT : { ...DOT, opacity: 0 }
  return SIDES.map(([id, pos]) => (
    <span key={id}>
      <Handle id={`s-${id}`} type="source" position={pos} style={style} />
      <Handle id={`t-${id}`} type="target" position={pos} style={{ ...style, pointerEvents: 'none' }} />
    </span>
  ))
}

// Nhãn: nhấp đúp để sửa NGAY trên hình, không phải mở bảng bên cạnh
function Label({ id, data, editable }) {
  const { updateNodeData } = useReactFlow()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(data.title || '')
  const ref = useRef(null)

  useEffect(() => { setDraft(data.title || '') }, [data.title])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  function commit() {
    setEditing(false)
    if (draft !== data.title) updateNodeData(id, { title: draft })
  }

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit() }
          if (e.key === 'Escape') { setDraft(data.title || ''); setEditing(false) }
          e.stopPropagation()   // đừng để phím Delete xoá hình khi đang gõ
        }}
        className="nodrag"
        style={{
          width: '90%', border: 'none', outline: 'none', background: 'transparent',
          textAlign: 'center', font: 'inherit', color: 'inherit', resize: 'none',
        }}
      />
    )
  }

  return (
    <div
      onDoubleClick={() => editable && setEditing(true)}
      style={{ cursor: editable ? 'text' : 'default', width: '100%', wordBreak: 'break-word' }}
      title={editable ? 'Nhấp đúp để sửa chữ' : undefined}
    >
      {data.title || <span style={{ opacity: 0.4 }}>Nhấp đúp để nhập</span>}
    </div>
  )
}

// Khung chung: viền + nền + căn giữa chữ. clip quyết định hình dạng.
// Mọi định dạng (màu, cỡ chữ, đậm/nghiêng) lấy từ data.style — lưu trong JSONB.
function Shape({ id, data, selected, editable, clip, radius, extraStyle }) {
  const st     = data.style || {}
  const stroke = st.borderColor || '#2563eb'
  const bg     = st.bgColor === 'transparent' ? 'transparent' : (st.bgColor || '#eff6ff')
  return (
    <>
      <NodeResizer
        isVisible={editable && selected}
        minWidth={40}
        minHeight={30}
        lineStyle={{ borderColor: stroke }}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, background: '#fff', border: `2px solid ${stroke}` }}
      />
      <div
        style={{
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 10, lineHeight: 1.3, textAlign: 'center',
          fontSize:   st.fontSize || 13,
          fontWeight: st.bold ? 700 : 400,
          fontStyle:  st.italic ? 'italic' : 'normal',
          color:      st.textColor || '#0f172a',
          background: bg,
          border: clip ? 'none' : `2px solid ${stroke}`,
          outline: selected && clip ? `2px solid ${stroke}` : 'none',
          borderRadius: radius, clipPath: clip,
          boxShadow: selected && !clip ? `0 0 0 3px ${stroke}33` : 'none',
          ...extraStyle,
        }}
      >
        <Ports visible={editable} />
        <Label id={id} data={data} editable={editable} />
      </div>
    </>
  )
}

const mk = (opts) => function ShapeNode({ id, data, selected }) {
  return <Shape id={id} data={data} selected={selected} editable={data._editable} {...opts} />
}

export const nodeTypes = {
  rectangle:     mk({ radius: 8 }),
  square:        mk({ radius: 6 }),
  circle:        mk({ radius: '50%' }),
  triangle:      mk({ clip: 'polygon(50% 0%, 100% 100%, 0% 100%)', extraStyle: { paddingTop: 34 } }),
  parallelogram: mk({ clip: 'polygon(18% 0%, 100% 0%, 82% 100%, 0% 100%)' }),
  diamond:       mk({ clip: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }),
  text:          mk({ radius: 0, extraStyle: { background: 'transparent', border: 'none', boxShadow: 'none' } }),
  line:          makeLineNode(false),
  arrow:         makeLineNode(true),
}
