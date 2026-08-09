import { useState, useEffect } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import Footer from './Footer'
import s from './layout.module.css'

// Trạng thái GHIM sidebar (mở luôn) — lưu sessionStorage, giữ khi F5 / chuyển trang.
// MẶC ĐỊNH là THU GỌN (false) để tối đa diện tích thao tác; rê chuột vào sidebar
// sẽ tạm bung ra, không cần ghim.
const SIDEBAR_KEY = 'sidebar_open'
function loadSidebarOpen() {
  try { return sessionStorage.getItem(SIDEBAR_KEY) === 'true' }
  catch { return false }
}

export default function AppLayout({ children, footer }) {
  const [sidebarOpen, setSidebarOpen] = useState(loadSidebarOpen)
  useEffect(() => {
    try { sessionStorage.setItem(SIDEBAR_KEY, String(sidebarOpen)) } catch { /* ignore */ }
  }, [sidebarOpen])

  return (
    <div className={s.appShell}>
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} />

      <div className={s.appBody}>
        <Header
          sidebarOpen={sidebarOpen}
          onMenuToggle={() => setSidebarOpen((v) => !v)}
        />

        {/* id ổn định để useScrollRestore tìm được khung cuộn chung của mọi trang */}
        <main id="app-scroll-root" className={s.appMain}>
          {children}
        </main>

        {footer === null ? null : (footer ?? <Footer />)}
      </div>
    </div>
  )
}
