// Standalone refresh — no imports from api/auth.js or api/axios.js to avoid circular deps.
// Uses plain axios so it never triggers our response interceptor.
import axios from 'axios'

// Single in-flight promise — concurrent callers share the same request.
let _refreshPromise = null

export function refreshSession() {
  if (_refreshPromise) return _refreshPromise
  _refreshPromise = axios
    .post('/api/auth/refresh', {}, { withCredentials: true })
    .then(({ data }) => data.data)   // → { accessToken, user }
    .finally(() => {
      _refreshPromise = null
    })
  return _refreshPromise
}
