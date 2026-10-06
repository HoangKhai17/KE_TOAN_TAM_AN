import { useState, useEffect } from 'react'
import { Clock, LogIn, LogOut } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { getToday, checkIn, checkOut } from '../../api/attendance'
import { collectDeviceInfo, detectMethod } from '../../utils/deviceInfo'
import SelfieCaptureModal from '../attendance/SelfieCaptureModal'
import s from './layout.module.css'

export default function CheckInWidget() {
  const user     = useAuthStore((st) => st.user)
  const addToast = useToastStore((st) => st.toast)
  const [state, setState] = useState(null)
  const [busy, setBusy]   = useState(false)
  const [capture, setCapture] = useState(null) // { action: 'in'|'out', method, deviceInfo }

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

  // Gửi 1 lần chấm công (vào/ra) kèm ảnh (có thể null).
  async function submitCheck(action, method, deviceInfo, photo) {
    setBusy(true)
    try {
      const fn = action === 'out' ? checkOut : checkIn
      await fn({ method, deviceInfo, photo })
      const fresh = await getToday()
      setState(fresh)
      addToast(action === 'out' ? 'Chấm công ra thành công!' : 'Chấm công vào thành công!', 'success')
      setCapture(null)
    } catch (err) {
      const msg = err.response?.data?.error?.message
        ?? (action === 'out' ? 'Không thể chấm công ra' : 'Không thể chấm công vào')
      addToast(msg, 'error')
    } finally {
      setBusy(false)
    }
  }

  // Mobile/tablet → mở camera chụp ảnh trước. Desktop/laptop → chấm thẳng (phải đến VP).
  async function startCheck(action) {
    const deviceInfo = await collectDeviceInfo()
    const method     = detectMethod(deviceInfo.type)
    if (method === 'mobile') {
      setCapture({ action, method, deviceInfo })
    } else {
      submitCheck(action, method, deviceInfo, null)
    }
  }

  const handleCheckIn  = () => startCheck('in')
  const handleCheckOut = () => startCheck('out')

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

      {capture && (
        <SelfieCaptureModal
          action={capture.action}
          onConfirm={(blob) => submitCheck(capture.action, capture.method, capture.deviceInfo, blob)}
          onSkip={() => submitCheck(capture.action, capture.method, capture.deviceInfo, null)}
          onCancel={() => setCapture(null)}
        />
      )}
    </div>
  )
}
