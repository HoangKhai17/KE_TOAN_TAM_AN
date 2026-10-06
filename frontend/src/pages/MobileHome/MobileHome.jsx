import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, LogIn, LogOut, Loader2, Monitor, StickyNote } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { getToday, checkIn, checkOut } from '../../api/attendance'
import { collectDeviceInfo, detectMethod } from '../../utils/deviceInfo'
import { logout as apiLogout } from '../../api/auth'
import QuickNotes from '../../components/quicknotes/QuickNotes'
import SelfieCaptureModal from '../../components/attendance/SelfieCaptureModal'
import s from './mobileHome.module.css'

// Màn hình gọn cho user dùng điện thoại: Chấm công + Ghi chú nhanh.
export default function MobileHome() {
  const navigate  = useNavigate()
  const user      = useAuthStore((st) => st.user)
  const clearAuth = useAuthStore((st) => st.logout)
  const addToast  = useToastStore((st) => st.toast)
  const [today, setToday] = useState(null)
  const [busy, setBusy]   = useState(false)
  const [capture, setCapture] = useState(null) // { kind:'in'|'out', method, deviceInfo }

  const isAdmin = user?.role === 'admin'

  useEffect(() => { getToday().then(setToday).catch(() => {}) }, [])

  // Gửi 1 lần chấm công kèm ảnh (có thể null nếu từ chối camera).
  async function submitCheck(kind, method, deviceInfo, photo) {
    setBusy(true)
    try {
      const res = kind === 'in'
        ? await checkIn({ method, deviceInfo, photo })
        : await checkOut({ method, deviceInfo, photo })
      setToday(await getToday())
      if (res?.held) {
        addToast('Đã chấm công — thiết bị chưa được duyệt nên đang CHỜ GHI NHẬN. Admin duyệt thiết bị sẽ tự động tính công.', 'warning', 6000)
      } else {
        addToast(kind === 'in' ? 'Chấm công vào thành công!' : 'Chấm công ra thành công!', 'success')
      }
      setCapture(null)
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể chấm công', 'error')
    } finally {
      setBusy(false)
    }
  }

  // Mobile/tablet → mở camera chụp ảnh trước; thiết bị khác → chấm thẳng.
  async function doCheck(kind) {
    const deviceInfo = await collectDeviceInfo()
    const method     = detectMethod(deviceInfo.type)
    if (method === 'mobile') {
      setCapture({ kind, method, deviceInfo })
    } else {
      submitCheck(kind, method, deviceInfo, null)
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
          {today?.heldPending && (
            <div className={s.heldNote}>
              ⏳ Đang chờ admin duyệt thiết bị — lần chấm công này chưa được ghi nhận. Khi duyệt xong sẽ tự động tính công.
            </div>
          )}
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

      {capture && (
        <SelfieCaptureModal
          action={capture.kind}
          onConfirm={(blob) => submitCheck(capture.kind, capture.method, capture.deviceInfo, blob)}
          onSkip={() => submitCheck(capture.kind, capture.method, capture.deviceInfo, null)}
          onCancel={() => setCapture(null)}
        />
      )}
    </div>
  )
}
