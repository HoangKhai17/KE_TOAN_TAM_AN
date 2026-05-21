import { useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useNotificationStore } from '../stores/notificationStore'
import { useToastStore } from '../stores/toastStore'
import { getUnreadCount, listNotifications } from '../api/notifications'
import { connectSocket, disconnectSocket } from '../lib/socket'

const DEV = import.meta.env.DEV

export default function SocketProvider({ children }) {
  const accessToken    = useAuthStore((s) => s.accessToken)
  const addNew         = useNotificationStore((s) => s.addNew)
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount)
  const setRecent      = useNotificationStore((s) => s.setRecent)
  const toastFn        = useToastStore((s) => s.toast)

  useEffect(() => {
    if (!accessToken) {
      disconnectSocket()
      return
    }

    let cancelled = false
    const sock = connectSocket(accessToken)

    async function syncNotifications() {
      try {
        const [count, result] = await Promise.all([
          getUnreadCount(),
          listNotifications({ limit: 10 }),
        ])
        if (cancelled) return
        setUnreadCount(count)
        setRecent(result.notifications)
      } catch {
        // Notification sync is a recovery path; keep socket listener alive.
      }
    }

    function onConnect() {
      if (DEV) console.log(`[Socket] connected sid=${sock.id}`)
      syncNotifications()
    }

    function onConnectError(err) {
      // This fires when the handshake fails (e.g. CORS, bad token, network error).
      // Most common cause in dev: FRONTEND_URL env var doesn't include the current origin.
      console.warn('[Socket] connect_error:', err.message, err.data ?? '')
    }

    function onDisconnect(reason) {
      if (DEV) console.log('[Socket] disconnected:', reason)
    }

    function onNotification(notif) {
      if (DEV) console.log('[Socket] notification received:', notif.type, notif.title)
      addNew(notif)
      toastFn(notif.body, 'notification', 7000, {
        title:     notif.title,
        notifType: notif.type,
        taskId:    notif.task_id,
      })
    }

    sock.on('connect',       onConnect)
    sock.on('connect_error', onConnectError)
    sock.on('disconnect',    onDisconnect)
    sock.on('notification',  onNotification)

    // Socket may have already been connected before this effect ran (e.g. StrictMode re-run)
    if (sock.connected) {
      syncNotifications()
    }

    return () => {
      cancelled = true
      sock.off('connect',       onConnect)
      sock.off('connect_error', onConnectError)
      sock.off('disconnect',    onDisconnect)
      sock.off('notification',  onNotification)
    }
  }, [accessToken, addNew, setRecent, setUnreadCount, toastFn])

  return children
}
