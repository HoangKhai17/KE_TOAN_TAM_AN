import { useState, useEffect } from 'react'
import { Clock, LogIn, LogOut } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { getToday, checkIn, checkOut } from '../../api/attendance'
import s from './layout.module.css'

export default function CheckInWidget() {
  const user     = useAuthStore((st) => st.user)
  const addToast = useToastStore((st) => st.toast)
  const [state, setState] = useState(null)
  const [busy, setBusy]   = useState(false)

  const visible = user?.role === 'staff' || user?.role === 'admin'

  useEffect(() => {
    if (!visible) return
    getToday().then(setState).catch(() => {})
  }, [visible])

  if (!visible) return null

  function fmtTime(iso) {
    if (!iso) return null
    return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  }

  async function handleCheckIn() {
    setBusy(true)
    try {
      await checkIn({ method: 'web' })
      const fresh = await getToday()
      setState(fresh)
      addToast('Chấm công vào thành công!', 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể chấm công vào', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleCheckOut() {
    setBusy(true)
    try {
      await checkOut({ method: 'web' })
      const fresh = await getToday()
      setState(fresh)
      addToast('Chấm công ra thành công!', 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể chấm công ra', 'error')
    } finally {
      setBusy(false)
    }
  }

  const isAdmin     = user?.role === 'admin'
  const canCheckIn  = !isAdmin && !state?.hasCheckedIn
  const canCheckOut = !isAdmin && state?.hasCheckedIn && !state?.hasCheckedOut

  return (
    <div className={s.checkInWidget}>
      <div className={s.checkInStatus}>
        <Clock size={13} className={s.checkInClockIcon} />
        {!state ? (
          <span className={s.checkInTextMuted}>...</span>
        ) : isAdmin ? (
          <span className={s.checkInText}>
            {state.record?.status === 'present' ? 'Đủ công' : 'Tự động'}
          </span>
        ) : state.hasCheckedOut ? (
          <span className={s.checkInText}>Ra: {fmtTime(state.checkOutTime)}</span>
        ) : state.hasCheckedIn ? (
          <span className={s.checkInText}>Vào: {fmtTime(state.checkInTime)}</span>
        ) : (
          <span className={s.checkInTextMuted}>Chưa chấm công</span>
        )}
      </div>

      {canCheckIn && (
        <button
          className={s.btnCheckIn}
          onClick={handleCheckIn}
          disabled={busy}
          title="Chấm công vào"
        >
          <LogIn size={12} /> Vào
        </button>
      )}

      {canCheckOut && (
        <button
          className={s.btnCheckOut}
          onClick={handleCheckOut}
          disabled={busy}
          title="Chấm công ra"
        >
          <LogOut size={12} /> Ra
        </button>
      )}
    </div>
  )
}
