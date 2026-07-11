import { useEffect, useRef } from 'react'

// ── Ghi nhớ & khôi phục vị trí cuộn cho các trang danh sách ─────────────────────
//
// Dùng chung cho MỌI trang cuộn trong khung <main id="app-scroll-root"> của AppLayout
// (Tasks, Client Requests, Internal Assignments, Companies…).
//
// Cách hoạt động:
//   • Trong khi người dùng cuộn → lưu scrollTop (debounce) vào sessionStorage.
//   • Khi quay lại trang (vào detail rồi back, HOẶC đổi menu khác rồi quay lại) →
//     khôi phục đúng vị trí, MỘT lần, sau khi danh sách đã render xong (ready=true).
//   • sessionStorage nên vị trí sống suốt phiên tab, tự xoá khi đóng tab / mở tab mới.
//
// Cách thêm cho một trang mới (1 dòng):
//   useScrollRestore('client-requests', { ready: !isLoading })
//
// Tham số:
//   id       — khoá duy nhất cho từng danh sách (vd 'tasks', 'client-requests').
//   ready    — chỉ khôi phục khi nội dung đã render (data tải xong) để cuộn đúng chỗ.
//   enabled  — tắt tạm nếu cần (mặc định true).
//   getEl    — (tuỳ chọn) hàm trả về phần tử cuộn khác, cho trang có khung cuộn riêng.

const SCROLL_ROOT_ID = 'app-scroll-root'
const storageKey = (id) => `scrollpos:${id}`
const defaultGetEl = () => document.getElementById(SCROLL_ROOT_ID)

export default function useScrollRestore(id, { ready = true, enabled = true, getEl = defaultGetEl } = {}) {
  const restoredRef = useRef(false)

  // Lưu vị trí khi cuộn (debounce 150ms cho nhẹ) — chạy ngoài React state nên không re-render.
  // QUAN TRỌNG: khi rời trang phải FLUSH ngay vị trí cuối, nếu không thao tác nhanh
  // (cuộn xong bấm task <150ms) sẽ mất lần lưu chưa kịp → quay lại bị lệch/đầu trang.
  useEffect(() => {
    if (!enabled || !id) return
    const el = getEl()
    if (!el) return

    // Ghi vị trí mới nhất ngay khi cuộn (chỉ gán số, rẻ). KHÔNG đọc lại el.scrollTop
    // lúc cleanup vì DOM có thể đã bị gỡ (→ 0). Persist thì debounce cho nhẹ.
    // Khởi tạo từ GIÁ TRỊ ĐÃ LƯU (không phải 0): nếu vào-ra siêu nhanh trước khi restore
    // kịp chạy, cleanup chỉ ghi lại chính nó, không xoá mất vị trí tốt.
    let latestTop
    try { latestTop = Number(sessionStorage.getItem(storageKey(id))) || el.scrollTop } catch { latestTop = el.scrollTop }
    const persist = () => {
      try { sessionStorage.setItem(storageKey(id), String(latestTop)) } catch { /* storage đầy/riêng tư → bỏ qua */ }
    }

    let timer = null
    const onScroll = () => {
      latestTop = el.scrollTop
      if (timer) clearTimeout(timer)
      timer = setTimeout(persist, 150)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    // Bảo hiểm thêm: lưu ngay khi tab ẩn.
    const onHide = () => { if (document.visibilityState === 'hidden') persist() }
    document.addEventListener('visibilitychange', onHide)

    return () => {
      if (timer) clearTimeout(timer)
      persist() // ← flush vị trí cuối cùng khi rời trang (fix "lưu không kịp")
      el.removeEventListener('scroll', onScroll)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [id, enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  // Khôi phục MỘT lần, sau khi nội dung sẵn sàng.
  useEffect(() => {
    if (!enabled || !id || restoredRef.current || !ready) return
    const el = getEl()
    if (!el) return

    let saved = 0
    try { saved = Number(sessionStorage.getItem(storageKey(id))) || 0 } catch { saved = 0 }

    if (saved > 0) {
      // Chờ 2 khung hình để các dòng kịp layout xong (scrollHeight đúng) rồi mới đặt vị trí.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const node = getEl()
        if (node) node.scrollTop = saved
      }))
    }
    restoredRef.current = true
  }, [id, ready, enabled]) // eslint-disable-line react-hooks/exhaustive-deps
}
