const crypto = require('crypto')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid')
const { query } = require('../../config/db')
const { redis } = require('../../config/redis')
const env = require('../../config/env')
const audit = require('../../lib/audit')

const MAX_LOGIN_ATTEMPTS = 5
const LOCK_MINUTES = 30

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function generateAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, jti: uuidv4() },
    env.jwt.secret,
    { expiresIn: env.jwt.accessExpiresIn }
  )
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString('hex')
}

const DAY_MS = 24 * 60 * 60 * 1000
const SESSION_DAYS_KEY = 'auth.session_days'
const DEFAULT_SESSION_DAYS = 30
// Phiên "không ghi nhớ" (bỏ tick Ghi nhớ đăng nhập): sống ngắn, hết khi đóng trình duyệt.
const NONPERSISTENT_TTL_MS = 1 * DAY_MS

// Số ngày "giữ đăng nhập" — admin cấu hình, đọc từ system_configs.
async function getSessionDays() {
  try {
    const { rows: [row] } = await query('SELECT value FROM system_configs WHERE key = $1', [SESSION_DAYS_KEY])
    const n = parseInt(row?.value, 10)
    return Number.isInteger(n) && n >= 1 && n <= 365 ? n : DEFAULT_SESSION_DAYS
  } catch { return DEFAULT_SESSION_DAYS }
}

async function setSessionDays(days, adminId) {
  const n = parseInt(days, 10)
  if (!Number.isInteger(n) || n < 1 || n > 365) {
    throw Object.assign(new Error('Số ngày giữ đăng nhập phải từ 1 đến 365'), { status: 400 })
  }
  await query(
    `INSERT INTO system_configs (key, value, description, updated_by, updated_at)
     VALUES ($1, $2, 'Số ngày giữ đăng nhập (refresh token) khi tick Ghi nhớ đăng nhập.', $3, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [SESSION_DAYS_KEY, String(n), adminId ?? null]
  )
  return n
}

async function storeRefreshToken(userId, rawToken, familyId, ttlMs) {
  const tokenHash = hashToken(rawToken)
  const expiresAt = new Date(Date.now() + (ttlMs ?? DEFAULT_SESSION_DAYS * DAY_MS))
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, tokenHash, familyId, expiresAt]
  )
}

async function login(email, password, ipAddress, userAgent, rememberMe = true) {
  const { rows } = await query(
    `SELECT id, name, email, password_hash, role, status, job_title, avatar_url,
            must_change_pw, login_attempts, locked_until
     FROM users WHERE email = $1 LIMIT 1`,
    [email.toLowerCase()]
  )
  const user = rows[0]

  if (!user) {
    throw Object.assign(new Error('Invalid email or password'), { status: 401 })
  }

  if (user.status !== 'active') {
    throw Object.assign(new Error('Account is not active'), { status: 403 })
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const minutesLeft = Math.ceil((new Date(user.locked_until) - Date.now()) / 60000)
    throw Object.assign(
      new Error(`Account locked. Try again in ${minutesLeft} minute(s)`),
      { status: 423 }
    )
  }

  const passwordMatch = await bcrypt.compare(password, user.password_hash)
  if (!passwordMatch) {
    const newAttempts = user.login_attempts + 1
    const shouldLock = newAttempts >= MAX_LOGIN_ATTEMPTS
    const lockedUntil = shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null

    await query(
      `UPDATE users SET login_attempts = $1, locked_until = $2 WHERE id = $3`,
      [newAttempts, lockedUntil, user.id]
    )
    await audit.log({
      action: 'auth.login.failed',
      targetType: 'user',
      targetId: user.id,
      meta: { reason: 'wrong_password', attempts: newAttempts, locked: shouldLock },
      ipAddress,
      userAgent,
    })

    if (shouldLock) {
      throw Object.assign(
        new Error(`Too many failed attempts. Account locked for ${LOCK_MINUTES} minutes`),
        { status: 423 }
      )
    }
    throw Object.assign(new Error('Invalid email or password'), { status: 401 })
  }

  await query(
    `UPDATE users SET login_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = $1`,
    [user.id]
  )

  const accessToken = generateAccessToken(user)
  const rawRefreshToken = generateRefreshToken()
  const familyId = uuidv4()
  // Ghi nhớ → giữ N ngày (admin cấu hình); bỏ tick → phiên ngắn 1 ngày.
  const sessionDays = await getSessionDays()
  const ttlMs = rememberMe ? sessionDays * DAY_MS : NONPERSISTENT_TTL_MS
  await storeRefreshToken(user.id, rawRefreshToken, familyId, ttlMs)

  await audit.log({
    userId: user.id,
    action: 'auth.login',
    targetType: 'user',
    targetId: user.id,
    ipAddress,
    userAgent,
  })

  return {
    accessToken,
    rawRefreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      jobTitle: user.job_title,
      avatarUrl: user.avatar_url,
      mustChangePw: user.must_change_pw,
    },
    persistent: !!rememberMe,
    sessionDays,
  }
}

async function refreshToken(rawToken, ipAddress, userAgent) {
  if (!rawToken) {
    throw Object.assign(new Error('Refresh token required'), { status: 401 })
  }

  const tokenHash = hashToken(rawToken)
  const { rows } = await query(
    `SELECT rt.id, rt.user_id, rt.family_id, rt.expires_at, rt.revoked_at,
            u.role, u.status, u.name, u.email, u.job_title, u.avatar_url, u.must_change_pw
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1 LIMIT 1`,
    [tokenHash]
  )
  const rt = rows[0]

  if (!rt) {
    throw Object.assign(new Error('Invalid refresh token'), { status: 401 })
  }

  if (rt.revoked_at) {
    // Token reuse attack — revoke entire family
    await query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = $1 AND revoked_at IS NULL`,
      [rt.family_id]
    )
    await audit.log({
      userId: rt.user_id,
      action: 'auth.refresh.reuse_detected',
      targetType: 'user',
      targetId: rt.user_id,
      meta: { familyId: rt.family_id },
      ipAddress,
      userAgent,
    })
    throw Object.assign(new Error('Token reuse detected — all sessions revoked'), { status: 401 })
  }

  if (new Date(rt.expires_at) < new Date()) {
    await query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [rt.id])
    throw Object.assign(new Error('Refresh token expired'), { status: 401 })
  }

  if (rt.status !== 'active') {
    throw Object.assign(new Error('Account is not active'), { status: 403 })
  }

  await query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [rt.id])

  const user = { id: rt.user_id, role: rt.role }
  const newAccessToken = generateAccessToken(user)
  const newRawRefreshToken = generateRefreshToken()
  const sessionDays = await getSessionDays()
  await storeRefreshToken(rt.user_id, newRawRefreshToken, rt.family_id, sessionDays * DAY_MS)

  return {
    accessToken: newAccessToken,
    rawRefreshToken: newRawRefreshToken,
    sessionDays,
    user: {
      id: rt.user_id,
      name: rt.name,
      email: rt.email,
      role: rt.role,
      jobTitle: rt.job_title,
      avatarUrl: rt.avatar_url,
      mustChangePw: rt.must_change_pw,
    },
  }
}

async function logout(rawToken, jti, tokenExp, userId, ipAddress, userAgent) {
  if (rawToken) {
    const tokenHash = hashToken(rawToken)
    await query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`,
      [tokenHash]
    )
  }
  if (jti && tokenExp) {
    const ttl = tokenExp - Math.floor(Date.now() / 1000)
    if (ttl > 0) await redis.setex(`blacklist:${jti}`, ttl, '1')
  }
  await audit.log({ userId, action: 'auth.logout', targetType: 'user', targetId: userId, ipAddress, userAgent })
}

async function logoutAll(userId, jti, tokenExp, ipAddress, userAgent) {
  await query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  )
  if (jti && tokenExp) {
    const ttl = tokenExp - Math.floor(Date.now() / 1000)
    if (ttl > 0) await redis.setex(`blacklist:${jti}`, ttl, '1')
  }
  await audit.log({ userId, action: 'auth.logout_all', targetType: 'user', targetId: userId, ipAddress, userAgent })
}

async function changePassword(userId, currentPassword, newPassword, jti, tokenExp, ipAddress, userAgent) {
  const { rows } = await query(`SELECT password_hash FROM users WHERE id = $1`, [userId])
  if (!rows[0]) throw Object.assign(new Error('User not found'), { status: 404 })

  const match = await bcrypt.compare(currentPassword, rows[0].password_hash)
  if (!match) throw Object.assign(new Error('Current password is incorrect'), { status: 400 })

  const newHash = await bcrypt.hash(newPassword, 12)
  await query(
    `UPDATE users SET password_hash = $1, must_change_pw = FALSE, updated_at = NOW() WHERE id = $2`,
    [newHash, userId]
  )
  await query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  )
  if (jti && tokenExp) {
    const ttl = tokenExp - Math.floor(Date.now() / 1000)
    if (ttl > 0) await redis.setex(`blacklist:${jti}`, ttl, '1')
  }
  await audit.log({ userId, action: 'auth.change_password', targetType: 'user', targetId: userId, ipAddress, userAgent })
}

async function getMe(userId) {
  const { rows } = await query(
    `SELECT id, name, email, role, status, phone, job_title, avatar_url,
            must_change_pw, last_login_at, created_at
     FROM users WHERE id = $1`,
    [userId]
  )
  if (!rows[0]) throw Object.assign(new Error('User not found'), { status: 404 })
  const u = rows[0]
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
    phone: u.phone ?? null,
    jobTitle: u.job_title ?? null,
    avatarUrl: u.avatar_url ?? null,
    mustChangePw: u.must_change_pw,
    lastLoginAt: u.last_login_at ?? null,
    createdAt: u.created_at,
  }
}

module.exports = { login, refreshToken, logout, logoutAll, changePassword, getMe, getSessionDays, setSessionDays }
