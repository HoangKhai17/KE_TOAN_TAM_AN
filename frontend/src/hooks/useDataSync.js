import { useEffect } from 'react'
import { getSocket } from '../lib/socket'
import { useAuthStore } from '../stores/authStore'

/**
 * Listen for data-sync broadcast events emitted by the backend after mutations.
 * Calls the provided handler whenever a matching event fires.
 *
 * @param {'data:task'|'data:company'|'data:comment'|Array} events  one event or array of events
 * @param {Function} handler  called with (payload, eventName)
 * @param {Array}    deps     extra dependencies that recreate the listener (e.g. IDs to filter on)
 */
export function useDataSync(events, handler, deps = []) {
  // accessToken được đưa vào deps để effect re-run sau khi socket được tạo
  // (socket được tạo bởi SocketProvider khi accessToken thay đổi từ null → có giá trị)
  const accessToken = useAuthStore((s) => s.accessToken)

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return

    const list = Array.isArray(events) ? events : [events]
    const listeners = list.map((event) => {
      const fn = (payload) => handler(payload, event)
      socket.on(event, fn)
      return { event, fn }
    })

    return () => {
      listeners.forEach(({ event, fn }) => socket.off(event, fn))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, ...deps])
}
