const authService = require('./auth.service')
const env = require('../../config/env')

const COOKIE_NAME = 'refreshToken'
const DAY_MS = 24 * 60 * 60 * 1000
// sameSite 'lax': cookie vẫn chảy khi mở app từ icon PWA / điều hướng trên mobile
// (strict hay chặn → bắt đăng nhập lại), vẫn an toàn CSRF cho luồng refresh.
const COOKIE_BASE = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'lax',
  path: '/api/auth',
}

// maxAgeMs: số ms giữ cookie. undefined/null → cookie phiên (hết khi đóng trình duyệt).
function setRefreshCookie(res, token, maxAgeMs) {
  const opts = { ...COOKIE_BASE }
  if (maxAgeMs) opts.maxAge = maxAgeMs
  res.cookie(COOKIE_NAME, token, opts)
}

function clearRefreshCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/api/auth' })
}

async function postLogin(req, res, next) {
  try {
    const rememberMe = req.body.rememberMe !== false // mặc định true
    const { accessToken, rawRefreshToken, user, persistent, sessionDays } = await authService.login(
      req.body.email, req.body.password, req.ip, req.headers['user-agent'], rememberMe
    )
    // Ghi nhớ → cookie sống N ngày; bỏ tick → cookie phiên (hết khi đóng trình duyệt).
    setRefreshCookie(res, rawRefreshToken, persistent ? sessionDays * DAY_MS : undefined)
    res.json({ success: true, data: { accessToken, user } })
  } catch (err) {
    next(err)
  }
}

async function postRefresh(req, res, next) {
  try {
    const rawToken = req.cookies?.[COOKIE_NAME]
    const { accessToken, rawRefreshToken, user, sessionDays } = await authService.refreshToken(
      rawToken, req.ip, req.headers['user-agent']
    )
    setRefreshCookie(res, rawRefreshToken, (sessionDays ?? 30) * DAY_MS)
    res.json({ success: true, data: { accessToken, user } })
  } catch (err) {
    next(err)
  }
}

// Cấu hình số ngày giữ đăng nhập (admin)
async function getSessionConfig(req, res, next) {
  try {
    const sessionDays = await authService.getSessionDays()
    res.json({ success: true, data: { sessionDays } })
  } catch (err) { next(err) }
}
async function setSessionConfig(req, res, next) {
  try {
    const sessionDays = await authService.setSessionDays(req.body?.days, req.user.id)
    res.json({ success: true, data: { sessionDays } })
  } catch (err) { next(err) }
}

async function postLogout(req, res, next) {
  try {
    const rawToken = req.cookies?.[COOKIE_NAME]
    await authService.logout(
      rawToken, req.user.jti, req.user.exp,
      req.user.id, req.ip, req.headers['user-agent']
    )
    clearRefreshCookie(res)
    res.json({ success: true, message: 'Logged out successfully' })
  } catch (err) {
    next(err)
  }
}

async function postLogoutAll(req, res, next) {
  try {
    await authService.logoutAll(
      req.user.id, req.user.jti, req.user.exp,
      req.ip, req.headers['user-agent']
    )
    clearRefreshCookie(res)
    res.json({ success: true, message: 'All sessions terminated' })
  } catch (err) {
    next(err)
  }
}

async function postChangePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body
    await authService.changePassword(
      req.user.id, currentPassword, newPassword,
      req.user.jti, req.user.exp, req.ip, req.headers['user-agent']
    )
    clearRefreshCookie(res)
    res.json({ success: true, message: 'Password changed. Please log in again.' })
  } catch (err) {
    next(err)
  }
}

async function getMe(req, res, next) {
  try {
    const user = await authService.getMe(req.user.id)
    res.json({ success: true, data: { user } })
  } catch (err) {
    next(err)
  }
}

module.exports = { postLogin, postRefresh, postLogout, postLogoutAll, postChangePassword, getMe, getSessionConfig, setSessionConfig }
