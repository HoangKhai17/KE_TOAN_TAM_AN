import { useState, useEffect, useRef, useCallback } from 'react'
import { Camera, RefreshCw, Check, X, AlertTriangle, Loader2 } from 'lucide-react'
import Modal from '../ui/Modal'
import s from './SelfieCaptureModal.module.css'

// Chụp 1 ảnh selfie xác minh chấm công (Mức A).
// Props:
//   action: 'in' | 'out' — chỉ để hiển thị tiêu đề
//   onConfirm(blob)  — xác nhận với ảnh (blob webp)
//   onSkip()         — bỏ qua ảnh nhưng vẫn chấm công (từ chối camera / máy lỗi)
//   onCancel()       — đóng, không chấm công
const MAX_W = 640            // ảnh nén tối đa 640px cạnh ngang → nhẹ (~40-120KB)
const QUALITY = 0.72

export default function SelfieCaptureModal({ action = 'in', onConfirm, onSkip, onCancel }) {
  const videoRef  = useRef(null)
  const streamRef = useRef(null)
  const [phase, setPhase]   = useState('loading') // loading | live | preview | denied
  const [shot, setShot]     = useState(null)       // { blob, url }
  const [busy, setBusy]     = useState(false)

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  const startCamera = useCallback(async () => {
    setPhase('loading')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setPhase('live')
    } catch {
      stopStream()
      setPhase('denied')
    }
  }, [stopStream])

  useEffect(() => {
    // Trình duyệt cũ / không HTTPS → không có mediaDevices
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase('denied')
      return undefined
    }
    startCamera()
    return () => stopStream()
  }, [startCamera, stopStream])

  // Dọn object URL của ảnh preview khi thay/đóng
  useEffect(() => () => { if (shot?.url) URL.revokeObjectURL(shot.url) }, [shot])

  function capture() {
    const video = videoRef.current
    if (!video) return
    const vw = video.videoWidth || 640
    const vh = video.videoHeight || 480
    const scale = Math.min(1, MAX_W / vw)
    const w = Math.round(vw * scale)
    const h = Math.round(vh * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, w, h)
    // JPEG: mọi trình duyệt (kể cả iOS Safari) đều encode được qua canvas.
    // webp bị iOS lặng lẽ fallback sang png → lệch đuôi file → backend từ chối.
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      setShot({ blob, url })
      setPhase('preview')
      stopStream()
    }, 'image/jpeg', QUALITY)
  }

  function retake() {
    if (shot?.url) URL.revokeObjectURL(shot.url)
    setShot(null)
    startCamera()
  }

  async function confirm() {
    if (!shot?.blob) return
    setBusy(true)
    await onConfirm(shot.blob)
    // cha đóng modal sau khi xong
  }

  async function skip() {
    setBusy(true)
    await onSkip()
  }

  const title = action === 'out' ? 'Chụp ảnh — Chấm công RA' : 'Chụp ảnh — Chấm công VÀO'

  return (
    <Modal title={title} onClose={busy ? () => {} : onCancel} width="min(440px, calc(100vw - 32px))">
      <div className={s.wrap}>
        {phase === 'loading' && (
          <div className={s.stage}>
            <Loader2 size={28} className={s.spin} />
            <span className={s.hint}>Đang mở camera…</span>
          </div>
        )}

        {phase === 'live' && (
          <>
            <div className={s.videoBox}>
              <video ref={videoRef} className={s.video} playsInline muted />
            </div>
            <p className={s.hint}>Đưa khuôn mặt vào khung rồi bấm chụp.</p>
            <div className={s.actions}>
              <button className={s.btnGhost} onClick={onCancel} disabled={busy}>
                <X size={15} /> Huỷ
              </button>
              <button className={s.btnPrimary} onClick={capture} disabled={busy}>
                <Camera size={15} /> Chụp
              </button>
            </div>
          </>
        )}

        {phase === 'preview' && shot && (
          <>
            <div className={s.videoBox}>
              <img src={shot.url} alt="Ảnh chấm công" className={s.video} />
            </div>
            <p className={s.hint}>Ảnh rõ mặt chưa? Chụp lại nếu cần.</p>
            <div className={s.actions}>
              <button className={s.btnGhost} onClick={retake} disabled={busy}>
                <RefreshCw size={15} /> Chụp lại
              </button>
              <button className={s.btnPrimary} onClick={confirm} disabled={busy}>
                {busy ? <Loader2 size={15} className={s.spin} /> : <Check size={15} />} Xác nhận chấm công
              </button>
            </div>
          </>
        )}

        {phase === 'denied' && (
          <>
            <div className={s.denied}>
              <AlertTriangle size={26} className={s.warnIcon} />
              <p className={s.deniedText}>
                Không truy cập được camera (bị từ chối quyền, máy không có camera, hoặc kết nối không bảo mật).
              </p>
              <p className={s.deniedSub}>
                Bạn vẫn có thể chấm công — lần chấm này sẽ được đánh dấu <strong>“thiếu ảnh”</strong> để quản lý nắm.
              </p>
            </div>
            <div className={s.actions}>
              <button className={s.btnGhost} onClick={onCancel} disabled={busy}>
                <X size={15} /> Huỷ
              </button>
              <button className={s.btnPrimary} onClick={skip} disabled={busy}>
                {busy ? <Loader2 size={15} className={s.spin} /> : null} Chấm công không ảnh
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
