import { useCallback, useRef } from 'react'
import { useReactFlow } from '@xyflow/react'
import {
  PAD, buildPath, normalizePoints, insertPoint, removePoint,
  pointsFromLegacy, distToSegment,
} from './lineGeometry'

// ĐƯỜNG KẺ & MŨI TÊN — vẽ tự do bằng cách kéo thẳng từng ĐIỂM.
//
// Mô hình cũ (khung bao + 4 hướng đặt sẵn) chỉ cho 4 tư thế cứng: không quay
// được phải→trái, không cong lên, không bẻ nhiều khúc. Nay mỗi đường là một
// danh sách điểm; kéo điểm nào tới đâu cũng được nên đặt được ở góc bất kỳ.
//
// Thao tác:  kéo chấm tròn = di chuyển điểm
//            nhấp đúp lên đường = thêm điểm gãy
//            nhấp đúp lên chấm  = xoá điểm đó
//            kéo phần thân đường = di chuyển cả hình (React Flow lo)

// Toạ độ chuột → toạ độ bên trong khung của node
function localPoint(e, svgEl) {
  const r = svgEl.getBoundingClientRect()
  const box = svgEl.viewBox.baseVal
  const sx = r.width ? box.width / r.width : 1
  const sy = r.height ? box.height / r.height : 1
  return [(e.clientX - r.left) * sx, (e.clientY - r.top) * sy]
}

export const makeLineNode = (withArrow) => function LineNode({ id, data, selected, width, height }) {
  const rf = useReactFlow()
  const svgRef = useRef(null)
  const st = data.style || {}

  const stroke = st.borderColor || '#334155'
  const thick  = st.thickness || 2
  const shape  = st.lineShape || 'straight'
  const bend   = st.bend === -1 ? -1 : 1
  const editable = !!data._editable

  // Sơ đồ vẽ trước đây không có points → quy đổi từ khung + hướng cũ ngay lúc
  // hiển thị, hình hiện lên y như cũ. Lần lưu sau sẽ ghi theo mô hình mới.
  const points = Array.isArray(st.points) && st.points.length >= 2
    ? st.points
    : pointsFromLegacy(st, width, height)

  const w = Math.max(width  ?? 200, 1)
  const h = Math.max(height ?? PAD * 2, 1)

  // Ghi lại các điểm: dồn về gốc rồi dịch node bù đúng bấy nhiêu để nhìn thấy
  // đường đứng yên. Đi qua updateNode nên React Flow phát 'replace' →
  // editor bắt được và bật cờ "có thay đổi".
  const commit = useCallback((nextPoints) => {
    const n = normalizePoints(nextPoints)
    rf.updateNode(id, (node) => ({
      position: { x: node.position.x + n.dx, y: node.position.y + n.dy },
      width: n.width,
      height: n.height,
      data: { ...node.data, style: { ...(node.data.style || {}), points: n.points } },
    }))
  }, [id, rf])

  // Kéo 1 điểm. Quy đổi dịch chuyển của chuột theo mức phóng to hiện tại,
  // nếu không thì zoom vào là điểm chạy nhanh gấp mấy lần con trỏ.
  const dragPoint = useCallback((index) => (e) => {
    if (!editable) return
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX, startY = e.clientY
    const origin = points.map((p) => [...p])
    const zoom = rf.getZoom() || 1
    let moved = false

    function move(ev) {
      const dx = (ev.clientX - startX) / zoom
      const dy = (ev.clientY - startY) / zoom
      if (!moved && Math.hypot(dx, dy) < 2) return   // lọc rung tay khi chỉ định nhấp
      moved = true
      const next = origin.map((p) => [...p])
      next[index] = [origin[index][0] + dx, origin[index][1] + dy]
      commit(next)
    }
    function up() {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [editable, points, rf, commit])

  const addPoint = useCallback((e) => {
    if (!editable || !svgRef.current) return
    e.stopPropagation()
    commit(insertPoint(points, localPoint(e, svgRef.current)))
  }, [editable, points, commit])

  const dropPoint = useCallback((index) => (e) => {
    if (!editable) return
    e.stopPropagation()
    if (points.length <= 2) return      // đường phải còn ít nhất 2 đầu
    commit(removePoint(points, index))
  }, [editable, points, commit])

  const d = buildPath(points, shape, bend)
  const mId = `ah-${id}`

  return (
    <>
      {/* overflow visible: đầu mũi tên và tay nắm không bị cắt ở mép khung */}
      <svg
        ref={svgRef}
        width={w} height={h} viewBox={`0 0 ${w} ${h}`}
        style={{ overflow: 'visible', display: 'block' }}
      >
        {withArrow && (
          <defs>
            <marker id={mId} markerWidth="10" markerHeight="10" refX="9" refY="3"
              orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,6 L9,3 z" fill={stroke} />
            </marker>
          </defs>
        )}

        <path
          d={d} fill="none"
          stroke={stroke} strokeWidth={thick}
          strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={st.dashed ? '7 5' : undefined}
          markerEnd={withArrow ? `url(#${mId})` : undefined}
        />

        {/* Dải trong suốt dày hơn: đường 1px vẫn bấm trúng dễ dàng */}
        <path
          d={d} fill="none" stroke="transparent" strokeWidth={18}
          style={{ cursor: editable ? 'move' : 'default' }}
          onDoubleClick={addPoint}
        />

        {/* Tay nắm từng điểm — chỉ hiện khi đang sửa và đã chọn đường */}
        {editable && selected && points.map(([x, y], i) => {
          const isEnd = i === 0 || i === points.length - 1
          return (
            <circle
              key={i}
              cx={x} cy={y} r={6}
              fill={isEnd ? stroke : '#fff'}
              stroke={isEnd ? '#fff' : stroke}
              strokeWidth={2}
              className="nodrag nopan"
              style={{ cursor: 'grab' }}
              onPointerDown={dragPoint(i)}
              onDoubleClick={dropPoint(i)}
            >
              <title>
                {isEnd ? 'Kéo để đổi hướng và độ dài' : 'Kéo để bẻ khúc · nhấp đúp để xoá điểm'}
              </title>
            </circle>
          )
        })}
      </svg>
    </>
  )
}

export { distToSegment }
