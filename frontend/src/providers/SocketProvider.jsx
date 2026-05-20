import { useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useNotificationStore } from '../stores/notificationStore'
import { getUnreadCount, listNotifications } from '../api/notifications'
import { connectSocket, disconnectSocket } from '../lib/socket'

export default function SocketProvider({ children }) {
  const accessToken = useAuthStore((s) => s.accessToken)
  const addNew = useNotificationStore((s) => s.addNew)
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount)
  const setRecent = useNotificationStore((s) => s.setRecent)

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
      syncNotifications()
    }

    function onNotification(notif) {
      addNew(notif)
    }

    sock.on('connect', onConnect)
    sock.on('notification', onNotification)

    if (sock.connected) {
      syncNotifications()
    }

    return () => {
      cancelled = true
      sock.off('connect', onConnect)
      sock.off('notification', onNotification)
    }
  }, [accessToken, addNew, setRecent, setUnreadCount])

  return children
}
