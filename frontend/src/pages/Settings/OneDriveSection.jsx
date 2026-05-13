import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Cloud, CheckCircle2, XCircle, Loader2, Link2, Link2Off,
  HardDrive, RefreshCw, ExternalLink, AlertTriangle,
} from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'
import * as onedriveApi from '../../api/onedrive'
import s from './settings.module.css'

function fmtBytes(bytes) {
  if (!bytes) return ''
  const gb = bytes / (1024 ** 3)
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / (1024 ** 2)).toFixed(0)} MB`
}

export default function OneDriveSection() {
  const addToast = useToastStore((st) => st.toast)
  const [searchParams, setSearchParams] = useSearchParams()

  const [status,       setStatus]       = useState(null)   // { connected, driveId }
  const [loading,      setLoading]       = useState(true)
  const [connecting,   setConnecting]   = useState(false)
  const [disconnecting,setDisconnecting]= useState(false)

  async function loadStatus() {
    try {
      const s = await onedriveApi.getStatus()
      setStatus(s)
    } catch {
      setStatus({ connected: false })
    } finally {
      setLoading(false)
    }
  }

  // Handle OAuth callback: Microsoft redirects back with ?code=xxx
  useEffect(() => {
    const code  = searchParams.get('code')
    const error = searchParams.get('error')

    if (error) {
      addToast(`Kết nối OneDrive thất bại: ${searchParams.get('error_description') ?? error}`, 'error')
      const next = new URLSearchParams(searchParams)
      next.delete('code'); next.delete('error'); next.delete('error_description'); next.delete('state')
      setSearchParams(next, { replace: true })
      loadStatus()
      return
    }

    if (code) {
      setConnecting(true)
      // Remove code from URL immediately
      const next = new URLSearchParams(searchParams)
      next.delete('code'); next.delete('state')
      setSearchParams(next, { replace: true })

      onedriveApi.exchangeCode(code)
        .then((info) => {
          addToast(`Đã kết nối OneDrive thành công!`, 'success')
          setStatus({ connected: true, driveId: info.driveId })
        })
        .catch((err) => {
          const msg = err.response?.data?.error?.message ?? err.message ?? 'Lỗi kết nối'
          addToast(msg, 'error')
          setStatus({ connected: false })
        })
        .finally(() => setConnecting(false))
      return
    }

    loadStatus()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConnect() {
    setConnecting(true)
    try {
      const url = await onedriveApi.getAuthUrl()
      window.location.href = url
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không lấy được link xác thực', 'error')
      setConnecting(false)
    }
  }

  async function handleDisconnect() {
    if (!window.confirm('Xác nhận ngắt kết nối OneDrive? Dữ liệu file hiện có không bị xoá.')) return
    setDisconnecting(true)
    try {
      await onedriveApi.disconnect()
      setStatus({ connected: false, driveId: null })
      addToast('Đã ngắt kết nối OneDrive', 'warning')
    } catch {
      addToast('Không thể ngắt kết nối', 'error')
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className={s.settingsBlock}>
      <div className={s.settingsBlockHeader}>
        <div className={s.settingsBlockTitle}>
          <Cloud size={15} />
          Kết nối Microsoft OneDrive
        </div>
        <p className={s.settingsBlockDesc}>
          Dùng để lưu trữ và quản lý tài liệu khách hàng trên OneDrive cá nhân.
          Kết nối một lần, hệ thống tự động gia hạn.
        </p>
      </div>

      {/* Status card */}
      <div className={s.onedriveCard}>
        {loading || connecting ? (
          <div className={s.onedriveStatusRow}>
            <Loader2 size={18} className={s.spin} color="#2563eb" />
            <span className={s.onedriveStatusText}>
              {connecting ? 'Đang kết nối...' : 'Đang kiểm tra...'}
            </span>
          </div>
        ) : status?.connected ? (
          <>
            <div className={s.onedriveStatusRow}>
              <CheckCircle2 size={18} color="#16a34a" />
              <span className={s.onedriveStatusConnected}>Đã kết nối</span>
              <button className={s.onedriveRefreshBtn} onClick={loadStatus} title="Kiểm tra lại">
                <RefreshCw size={13} />
              </button>
            </div>
            {status.driveId && (
              <div className={s.onedriveDriveId}>
                <HardDrive size={12} />
                Drive ID: <code>{status.driveId}</code>
              </div>
            )}
            <button
              className={s.onedriveDisconnectBtn}
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              {disconnecting ? <Loader2 size={13} className={s.spin} /> : <Link2Off size={13} />}
              Ngắt kết nối
            </button>
          </>
        ) : (
          <>
            <div className={s.onedriveStatusRow}>
              <XCircle size={18} color="#dc2626" />
              <span className={s.onedriveStatusDisconnected}>Chưa kết nối</span>
            </div>
            <p className={s.onedriveHint}>
              Nhấn bên dưới để đăng nhập Microsoft và cấp quyền truy cập OneDrive.
              Bạn sẽ được chuyển đến trang đăng nhập Microsoft và tự động quay về sau khi hoàn tất.
            </p>
            <button
              className={s.onedriveConnectBtn}
              onClick={handleConnect}
              disabled={connecting}
            >
              {connecting ? <Loader2 size={13} className={s.spin} /> : <Link2 size={13} />}
              Kết nối OneDrive
            </button>
          </>
        )}
      </div>

      {/* Setup requirements notice */}
      <div className={s.onedriveNotice}>
        <AlertTriangle size={13} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <strong>Yêu cầu trước khi kết nối:</strong> Phải có{' '}
          <code>MICROSOFT_CLIENT_ID</code>, <code>MICROSOFT_CLIENT_SECRET</code> và{' '}
          <code>MICROSOFT_REDIRECT_URI</code> trong file <code>.env</code>.{' '}
          Xem hướng dẫn đăng ký Azure App bên dưới.
        </div>
      </div>

      {/* Setup guide */}
      <details className={s.onedriveGuide}>
        <summary className={s.onedriveGuideSummary}>
          Hướng dẫn đăng ký Azure App (Personal OneDrive)
        </summary>
        <div className={s.onedriveGuideBody}>
          <ol className={s.onedriveGuideList}>
            <li>
              Vào <strong>portal.azure.com</strong> → đăng nhập bằng tài khoản Microsoft
            </li>
            <li>
              Tìm <strong>"App registrations"</strong> → <strong>"New registration"</strong>
              <ul>
                <li>Name: <code>KeToanTamAn</code></li>
                <li>Supported account types: <strong>"Personal Microsoft accounts only"</strong></li>
                <li>Redirect URI: chọn <strong>Web</strong> → nhập URL frontend của bạn<br />
                  Ví dụ: <code>http://localhost:5173/settings</code> (dev) hoặc <code>https://app.ketoan-taman.vn/settings</code> (prod)
                </li>
              </ul>
            </li>
            <li>
              Click <strong>Register</strong> → lưu lại <strong>Application (client) ID</strong>
            </li>
            <li>
              <strong>Certificates &amp; secrets</strong> → <strong>New client secret</strong>
              → Expires: 24 months → <strong>lưu giá trị Value ngay</strong> (chỉ hiện 1 lần)
            </li>
            <li>
              <strong>API permissions</strong> → <strong>Add a permission</strong> → <strong>Microsoft Graph</strong>
              → <strong>Delegated permissions</strong> → tick:
              <code> Files.ReadWrite</code>, <code>offline_access</code>, <code>User.Read</code>
              → <strong>Add permissions</strong>
            </li>
            <li>
              Cập nhật file <code>.env</code>:
              <pre className={s.onedriveCodeBlock}>{`MICROSOFT_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MICROSOFT_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MICROSOFT_REDIRECT_URI=http://localhost:5173/settings`}</pre>
            </li>
            <li>Restart backend → quay lại trang này → nhấn <strong>"Kết nối OneDrive"</strong></li>
          </ol>
        </div>
      </details>
    </div>
  )
}
