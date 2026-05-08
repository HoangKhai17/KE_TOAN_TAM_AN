import { useEffect, useRef } from 'react'
import { useAuthStore } from '../stores/authStore'
import { refreshSession } from '../api/session'

// Refresh 60 s before the access token expires so requests never hit an expired token
const REFRESH_BEFORE_MS = 60 * 1000

function getTokenExpiryMs(token) {
  try {
    // Decode JWT payload without verifying signature (safe — we trust the server)
    const b64     = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(b64))
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

export function useTokenRefresh() {
  const accessToken = useAuthStore((s) => s.accessToken)
  const setAuth     = useAuthStore((s) => s.setAuth)
  const logout      = useAuthStore((s) => s.logout)
  const timerRef    = useRef(null)

  useEffect(() => {
    // Clear any pending timer on every run
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    if (!accessToken) return

    const expMs = getTokenExpiryMs(accessToken)
    if (!expMs) return

    const delay = expMs - Date.now() - REFRESH_BEFORE_MS

    async function proactiveRefresh() {
      try {
        const data = await refreshSession()
        // setAuth triggers this effect again with the new token → new timer
        setAuth(data.user, data.accessToken)
      } catch {
        logout()
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
      }
    }

    if (delay <= 0) {
      // Token already expired or within the 60-s window — refresh immediately
      proactiveRefresh()
    } else {
      timerRef.current = setTimeout(proactiveRefresh, delay)
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [accessToken, setAuth, logout])
}
