import { useState, useEffect } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import Footer from './Footer'
import s from './layout.module.css'

// Lưu trạng thái đóng/mở sidebar vào sessionStorage → giữ khi F5 / chuyển trang
const SIDEBAR_KEY = 'sidebar_open'
function loadSidebarOpen() {
  try { const v = sessionStorage.getItem(SIDEBAR_KEY); return v === null ? true : v === 'true' }
  catch { return true }
}

export default function AppLayout({ children }) {
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

        <main className={s.appMain}>
          {children}
        </main>

        <Footer />
      </div>
    </div>
  )
}
