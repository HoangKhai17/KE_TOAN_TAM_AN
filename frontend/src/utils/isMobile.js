// Quyết định có dùng màn hình mobile cho LANDING không (yêu cầu: rộng < 768px).
// Dùng cho điều hướng sau đăng nhập / khi vào trang gốc.
export function isMobileViewport() {
  if (typeof window === 'undefined') return false
  const narrow   = window.matchMedia?.('(max-width: 767px)')?.matches
  const uaMobile = /Mobi|Android(?!.*Tablet)|iPhone/i.test(navigator.userAgent || '')
  return Boolean(narrow || uaMobile)
}

// Trang đích sau đăng nhập / khi vào "/".
export function homePath() {
  return isMobileViewport() ? '/m' : '/dashboard'
}
