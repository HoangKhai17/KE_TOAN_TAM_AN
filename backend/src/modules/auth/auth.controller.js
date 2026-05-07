const authService = require('./auth.service')
const env = require('../../config/env')

const COOKIE_NAME = 'refreshToken'
const COOKIE_OPTS = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'strict',
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
}

function setRefreshCookie(res, token) {
  res.cookie(COOKIE_NAME, token, COOKIE_OPTS)
}

function clearRefreshCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/api/auth' })
}

async function postLogin(req, res, next) {
  try {
    const { accessToken, rawRefreshToken, user } = await authService.login(
      req.body.email, req.body.password, req.ip, req.headers['user-agent']
    )
    setRefreshCookie(res, rawRefreshToken)
    res.json({ success: true, data: { accessToken, user } })
  } catch (err) {
    next(err)
  }
}

async function postRefresh(req, res, next) {
  try {
    const rawToken = req.cookies?.[COOKIE_NAME]
    const { accessToken, rawRefreshToken, user } = await authService.refreshToken(
      rawToken, req.ip, req.headers['user-agent']
    )
    setRefreshCookie(res, rawRefreshToken)
    res.json({ success: true, data: { accessToken, user } })
  } catch (err) {
    next(err)
  }
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

module.exports = { postLogin, postRefresh, postLogout, postLogoutAll, postChangePassword, getMe }
