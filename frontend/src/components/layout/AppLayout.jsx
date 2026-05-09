import { useState } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import Footer from './Footer'
import ToastContainer from '../ui/Toast'
import s from './layout.module.css'

export default function AppLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)

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
        <ToastContainer />
      </div>
    </div>
  )
}
