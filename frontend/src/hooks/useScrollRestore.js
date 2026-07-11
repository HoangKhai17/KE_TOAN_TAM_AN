import { useEffect, useRef } from 'react'

// ── Ghi nhớ & khôi phục vị trí cuộn cho các trang danh sách ─────────────────────
//
// Lưu CẢ 2 TRỤC (dọc + ngang) của một khung cuộn, khôi phục khi quay lại trang
// (vào chi tiết rồi back, hoặc đổi menu rồi quay lại).
//
// Cách thêm cho trang mới:
//   // cuộn dọc — khung chung <main id="app-scroll-root"> của AppLayout
//   useScrollRestore('client-requests', { ready: !!data })
//   // cuộn ngang — khung riêng của bảng (gắn data-scroll-x="..." vào div overflow-x)
//   useScrollRestore('client-requests:x', {
//     ready: !!data,
//     getEl: () => document.querySelector('[data-scroll-x="client-requests"]'),
//   })
//
// Vì sao phải THỬ LẠI khi khôi phục:
//   Danh sách thường render từ state (rỗng ở lần render đầu) rồi mới có dòng.
//   Nếu đặt scrollTop lúc nội dung chưa đủ cao → bị kẹp về 0 → "lúc được lúc không".
//   Nên ở đây thử lại từng khung hình cho tới khi nội dung đủ cao/rộng mới đặt.

const SCROLL_ROOT_ID = 'app-scroll-root'
const MAX_FRAMES = 60 // ~1s: đủ cho danh sách render xong, rồi bỏ cuộc

const storageKey = (id) => `scrollpos:${id}`
const defaultGetEl = () => document.getElementById(SCROLL_ROOT_ID)

function readSaved(id) {
  try {
    const raw = sessionStorage.getItem(storageKey(id))
    if (!raw) return null
    const v = JSON.parse(raw)
    if (typeof v === 'number') return { x: 0, y: v } // tương thích định dạng cũ (chỉ số dọc)
    if (v && typeof v === 'object') return { x: Number(v.x) || 0, y: Number(v.y) || 0 }
    return null
  } catch { return null }
}

export default function useScrollRestore(id, { ready = true, enabled = true, getEl = defaultGetEl } = {}) {
  const restoredRef = useRef(false)
  const getElRef = useRef(getEl)
  getElRef.current = getEl

  // ── LƯU ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !id) return

    let el = null
    let timer = null
    let raf = null
    let frames = 0
    // Khởi tạo từ giá trị ĐÃ LƯU (không phải 0): nếu vào-ra siêu nhanh trước khi
    // kịp cuộn/khôi phục, lúc rời trang chỉ ghi lại chính nó, không xoá mất vị trí tốt.
    let latest = readSaved(id) ?? { x: 0, y: 0 }

    const persist = () => {
      try { sessionStorage.setItem(storageKey(id), JSON.stringify(latest)) } catch { /* storage đầy/riêng tư */ }
    }
    // Đọc vị trí NGAY khi cuộn (chỉ gán số, rẻ). Không đọc lại DOM lúc cleanup vì
    // node có thể đã bị gỡ → scrollTop trả 0 → sẽ lưu nhầm 0.
    const onScroll = () => {
      if (!el) return
      latest = { x: el.scrollLeft, y: el.scrollTop }
      if (timer) clearTimeout(timer)
      timer = setTimeout(persist, 150)
    }
    const onHide = () => { if (document.visibilityState === 'hidden') persist() }

    // Khung cuộn có thể chưa tồn tại ở render đầu (vd bảng render sau khi có data) → chờ.
    const attach = () => {
      el = getElRef.current()
      if (!el) {
        if (++frames < MAX_FRAMES) raf = requestAnimationFrame(attach)
        return
      }
      el.addEventListener('scroll', onScroll, { passive: true })
    }
    attach()
    document.addEventListener('visibilitychange', onHide)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      if (timer) clearTimeout(timer)
      persist() // flush vị trí cuối cùng khi rời trang (không đợi debounce)
      if (el) el.removeEventListener('scroll', onScroll)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [id, enabled])

  // ── KHÔI PHỤC (một lần, có thử lại) ──────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !id || restoredRef.current || !ready) return

    const saved = readSaved(id)
    if (!saved || (saved.x <= 0 && saved.y <= 0)) { restoredRef.current = true; return }

    let raf = null
    let frames = 0

    const attempt = () => {
      const el = getElRef.current()
      if (!el) {
        if (++frames < MAX_FRAMES) { raf = requestAnimationFrame(attempt); return }
        restoredRef.current = true
        return
      }

      const maxY = el.scrollHeight - el.clientHeight
      const maxX = el.scrollWidth - el.clientWidth
      const reachable = saved.y <= maxY + 1 && saved.x <= maxX + 1

      // Nội dung chưa đủ cao/rộng để tới vị trí đã lưu → danh sách còn đang render → chờ khung sau.
      if (!reachable && ++frames < MAX_FRAMES) {
        raf = requestAnimationFrame(attempt)
        return
      }

      if (saved.y > 0) el.scrollTop = saved.y
      if (saved.x > 0) el.scrollLeft = saved.x
      restoredRef.current = true
    }

    raf = requestAnimationFrame(attempt)
    return () => { if (raf) cancelAnimationFrame(raf) }
  }, [id, ready, enabled])
}
