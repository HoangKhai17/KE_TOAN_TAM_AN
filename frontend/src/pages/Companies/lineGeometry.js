// Hình học cho đường kẻ / mũi tên vẽ tự do.
//
// MÔ HÌNH: một đường = DANH SÁCH ĐIỂM, toạ độ tương đối với góc trên-trái của
// khung bao. Người dùng kéo thẳng từng điểm nên đường đặt được ở góc bất kỳ,
// chiều bất kỳ — khác hẳn mô hình cũ (khung + 4 hướng đặt sẵn) vốn chỉ cho
// 4 tư thế cứng.
//
// File này CỐ Ý không import React để test được bằng node thuần.

// Chừa lề quanh khung bao: đủ chỗ cho đầu mũi tên và tay nắm không bị cắt
export const PAD = 12

export const LINE_SHAPES_LIST = ['straight', 'curved', 'elbow']

// ── Chuẩn hoá ────────────────────────────────────────────────────────────────
// Sau khi kéo, điểm có thể âm hoặc tràn ra ngoài khung. Dồn lại về gốc (0,0)
// rồi trả kèm độ lệch để bên gọi dịch vị trí node đúng bấy nhiêu — nhìn thấy
// đường đứng yên, chỉ dữ liệu bên dưới được dọn gọn.
export function normalizePoints(points) {
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const minX = Math.min(...xs), minY = Math.min(...ys)
  const maxX = Math.max(...xs), maxY = Math.max(...ys)
  return {
    points: points.map(([x, y]) => [x - minX + PAD, y - minY + PAD]),
    dx: minX - PAD,                       // node.position phải cộng thêm bấy nhiêu
    dy: minY - PAD,
    width:  Math.max(maxX - minX, 0) + PAD * 2,
    height: Math.max(maxY - minY, 0) + PAD * 2,
  }
}

// ── Dựng path SVG ────────────────────────────────────────────────────────────

// Gấp khúc: mỗi đoạn đi theo 2 trục vuông góc, gãy ở giữa.
// bend đổi thứ tự đi-ngang-trước ↔ đi-dọc-trước → cùng 2 điểm cho ra 2 kiểu
// gấp đối xứng (bẻ lên hay bẻ xuống).
function elbowPoints(points, bend) {
  const out = [points[0]]
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i]
    const [bx, by] = points[i + 1]
    let hFirst = Math.abs(bx - ax) >= Math.abs(by - ay)
    if (bend < 0) hFirst = !hFirst
    if (hFirst) {
      const mx = (ax + bx) / 2
      out.push([mx, ay], [mx, by])
    } else {
      const my = (ay + by) / 2
      out.push([ax, my], [bx, my])
    }
    out.push([bx, by])
  }
  return out
}

const f = (n) => Math.round(n * 100) / 100
const poly = (pts) => `M${f(pts[0][0])},${f(pts[0][1])}`
  + pts.slice(1).map(([x, y]) => ` L${f(x)},${f(y)}`).join('')

// Đường cong mượt đi QUA mọi điểm (Catmull-Rom quy đổi sang Bezier bậc 3)
function smooth(pts) {
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`
  }
  return d
}

export function buildPath(points, shape = 'straight', bend = 1) {
  if (!Array.isArray(points) || points.length < 2) return ''

  if (shape === 'elbow') return poly(elbowPoints(points, bend))

  if (shape === 'curved') {
    // Chỉ 2 điểm thì không có gì để "đi qua" → phồng vuông góc một cung,
    // bend quyết định phồng lên hay phồng xuống.
    if (points.length === 2) {
      const [[x1, y1], [x2, y2]] = points
      const dx = x2 - x1, dy = y2 - y1
      const len = Math.hypot(dx, dy) || 1
      const bow = len * 0.22 * (bend < 0 ? -1 : 1)
      const cx = (x1 + x2) / 2 - (dy / len) * bow
      const cy = (y1 + y2) / 2 + (dx / len) * bow
      return `M${f(x1)},${f(y1)} Q${f(cx)},${f(cy)} ${f(x2)},${f(y2)}`
    }
    return smooth(points)
  }

  return poly(points)
}

// ── Thêm / bớt điểm gãy ──────────────────────────────────────────────────────

// Nhấp đúp lên đường → chèn điểm vào ĐÚNG đoạn gần chỗ nhấp nhất,
// không phải cứ nối vào cuối (nếu không đường sẽ nhảy lung tung).
export function insertPoint(points, at) {
  let best = 1, bestD = Infinity
  for (let i = 0; i < points.length - 1; i++) {
    const d = distToSegment(at, points[i], points[i + 1])
    if (d < bestD) { bestD = d; best = i + 1 }
  }
  const next = [...points]
  next.splice(best, 0, [at[0], at[1]])
  return next
}

// Luôn giữ tối thiểu 2 điểm — bỏ hết thì không còn là đường nữa
export function removePoint(points, index) {
  if (points.length <= 2) return points
  return points.filter((_, i) => i !== index)
}

export function distToSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  if (!len2) return Math.hypot(px - ax, py - ay)
  let t = ((px - ax) * dx + (py - ay) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

// ── Chuyển dữ liệu cũ ────────────────────────────────────────────────────────
// Sơ đồ vẽ trước đây lưu theo khung + hướng (không có points). Quy đổi khi đọc
// để hình hiện lên y như cũ, rồi lần lưu sau tự chuyển sang mô hình điểm.
// Nhờ vậy KHÔNG cần migration CSDL.
export function pointsFromLegacy(style = {}, width, height) {
  const w = Math.max(width ?? 180, 1)
  const h = Math.max(height ?? 8, 1)
  let o = style.orientation
  if (!o) {
    const r = ((style.rotation || 0) % 180 + 180) % 180
    if (r > 67 && r < 113) o = 'vertical'
    else if (r >= 23 && r <= 67) o = 'diag-down'
    else if (r >= 113 && r <= 157) o = 'diag-up'
    else o = 'horizontal'
  }
  if (o === 'vertical')  return [[w / 2, 0], [w / 2, h]]
  if (o === 'diag-down') return [[0, 0], [w, h]]
  if (o === 'diag-up')   return [[0, h], [w, 0]]
  return [[0, h / 2], [w, h / 2]]
}

// Điểm mặc định cho đường/mũi tên vừa tạo
export const defaultPoints = () => [[PAD, PAD], [180 + PAD, PAD]]
