import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, LogIn, LogOut, Loader2, Monitor, StickyNote } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { getToday, checkIn, checkOut } from '../../api/attendance'
import { collectDeviceInfo, detectMethod } from '../../utils/deviceInfo'
import { logout as apiLogout } from '../../api/auth'
import QuickNotes from '../../components/quicknotes/QuickNotes'
import s from './mobileHome.module.css'

// Màn hình gọn cho user dùng điện thoại: Chấm công + Ghi chú nhanh.
export default function MobileHome() {
  const navigate  = useNavigate()
  const user      = useAuthStore((st) => st.user)
  const clearAuth = useAuthStore((st) => st.logout)
  const addToast  = useToastStore((st) => st.toast)
  const [today, setToday] = useState(null)
  const [busy, setBusy]   = useState(false)

  const isAdmin = user?.role === 'admin'

  useEffect(() => { getToday().then(setToday).catch(() => {}) }, [])

  async function doCheck(kind) {
    setBusy(true)
    try {
      const deviceInfo = await collectDeviceInfo()
      const method     = detectMethod(deviceInfo.type)
      if (kind === 'in') await checkIn({ method, deviceInfo })
      else               await checkOut({ method, deviceInfo })
      setToday(await getToday())
      addToast(kind === 'in' ? 'Chấm công vào thành công!' : 'Chấm công ra thành công!', 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể chấm công', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleLogout() {
    try { await apiLogout() } catch { /* ignore */ }
    clearAuth()
    navigate('/login', { replace: true })
  }

  const fmt = (iso) => iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—'
  const canIn  = !isAdmin && today && !today.hasCheckedIn
  const canOut = !isAdmin && today?.hasCheckedIn && !today?.hasCheckedOut
  const greetHour = new Date().getHours()
  const greet = greetHour < 12 ? 'Chào buổi sáng' : greetHour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối'

  return (
    <div className={s.page}>
      <header className={s.bar}>
        <span className={s.brand}>Tâm An</span>
        <div className={s.barActions}>
          <button className={s.barBtn} onClick={() => navigate('/dashboard')} title="Mở bản đầy đủ">
            <Monitor size={14} /> Bản đầy đủ
          </button>
          <button className={s.barBtn} onClick={handleLogout} title="Đăng xuất">
            <LogOut size={14} />
          </button>
        </div>
      </header>

      <main className={s.main}>
        <div className={s.greet}>{greet},<br /><strong>{user?.name || 'bạn'}</strong></div>

        {/* Chấm công */}
        <section className={s.card}>
          <div className={s.cardTitle}><Clock size={16} /> Chấm công hôm nay</div>
          <div className={s.status}>
            <div className={s.statusItem}><span>Giờ vào</span><strong>{fmt(today?.checkInTime)}</strong></div>
            <div className={s.statusItem}><span>Giờ ra</span><strong>{fmt(today?.checkOutTime)}</strong></div>
          </div>
          {isAdmin ? (
            <div className={s.adminNote}>Tài khoản admin chấm công tự động.</div>
          ) : (
            <div className={s.actions}>
              <button className={`${s.bigBtn} ${s.in}`} onClick={() => doCheck('in')} disabled={!canIn || busy}>
                {busy ? <Loader2 className={s.spin} size={18} /> : <LogIn size={18} />} Chấm công Vào
              </button>
              <button className={`${s.bigBtn} ${s.out}`} onClick={() => doCheck('out')} disabled={!canOut || busy}>
                {busy ? <Loader2 className={s.spin} size={18} /> : <LogOut size={18} />} Chấm công Ra
              </button>
            </div>
          )}
        </section>

        {/* Ghi chú nhanh */}
        <section className={s.notesCard}>
          <div className={s.notesTitle}><StickyNote size={16} /> Ghi chú nhanh</div>
          <QuickNotes />
        </section>
      </main>
    </div>
  )
}
