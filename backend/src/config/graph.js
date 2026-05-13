'use strict'
const axios    = require('axios')
const { query } = require('./db')
const logger   = require('./logger')

const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
const AUTH_URL  = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
const SCOPES    = 'Files.ReadWrite offline_access User.Read'
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

let _tokenCache = { token: null, expiresAt: 0 }

// ── DB helpers ────────────────────────────────────────────────────────────────

async function dbGet(key) {
  try {
    const { rows: [r] } = await query('SELECT value FROM system_configs WHERE key = $1', [key])
    return r?.value?.trim() || null
  } catch { return null }
}

async function dbSet(key, value) {
  await query(
    `INSERT INTO system_configs (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, value]
  )
}

async function dbDel(key) {
  await query('DELETE FROM system_configs WHERE key = $1', [key])
}

// ── Token management ──────────────────────────────────────────────────────────

async function getAccessToken() {
  if (_tokenCache.token && Date.now() < _tokenCache.expiresAt - 60_000) {
    return _tokenCache.token
  }

  const refreshToken = await dbGet('onedrive_refresh_token')
  if (!refreshToken) {
    throw Object.assign(
      new Error('OneDrive chưa được kết nối. Vui lòng xác thực trong Cài đặt → OneDrive.'),
      { status: 503, code: 'ONEDRIVE_NOT_CONNECTED' }
    )
  }

  const params = new URLSearchParams({
    client_id:     process.env.MICROSOFT_CLIENT_ID,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type:    'refresh_token',
    scope:         SCOPES,
  })

  const { data } = await axios.post(TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })

  _tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }

  if (data.refresh_token) {
    await dbSet('onedrive_refresh_token', data.refresh_token)
  }

  logger.debug('[Graph] Access token refreshed via refresh_token')
  return _tokenCache.token
}

// ── OAuth helpers (called by onedrive.controller) ─────────────────────────────

function getAuthUrl() {
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI
  if (!redirectUri) throw new Error('MICROSOFT_REDIRECT_URI not set')

  const params = new URLSearchParams({
    client_id:     process.env.MICROSOFT_CLIENT_ID,
    response_type: 'code',
    redirect_uri:  redirectUri,
    scope:         SCOPES,
    response_mode: 'query',
  })
  return `${AUTH_URL}?${params.toString()}`
}

async function exchangeCode(code) {
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI
  const params = new URLSearchParams({
    client_id:     process.env.MICROSOFT_CLIENT_ID,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET,
    code,
    redirect_uri:  redirectUri,
    grant_type:    'authorization_code',
  })

  const { data } = await axios.post(TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })

  _tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  await dbSet('onedrive_refresh_token', data.refresh_token)

  // Auto-discover and store Drive ID
  const driveRes = await axios.get(`${GRAPH_BASE}/me/drive`, {
    headers: { Authorization: `Bearer ${data.access_token}` },
  })
  await dbSet('onedrive_drive_id', driveRes.data.id)
  logger.info(`[Graph] OneDrive connected — drive: ${driveRes.data.id}`)

  return {
    driveId:   driveRes.data.id,
    driveName: driveRes.data.owner?.user?.displayName ?? '',
    quota:     driveRes.data.quota,
  }
}

async function getConnectionStatus() {
  const token = await dbGet('onedrive_refresh_token')
  const driveId = await dbGet('onedrive_drive_id') || process.env.MICROSOFT_DRIVE_ID
  return { connected: !!token, driveId }
}

async function disconnect() {
  _tokenCache = { token: null, expiresAt: 0 }
  await dbDel('onedrive_refresh_token')
  await dbDel('onedrive_drive_id')
  logger.info('[Graph] OneDrive disconnected')
}

// ── Core request ──────────────────────────────────────────────────────────────

async function graphRequest(method, relativePath, options = {}) {
  const driveId = await dbGet('onedrive_drive_id') || process.env.MICROSOFT_DRIVE_ID
  if (!driveId) {
    throw Object.assign(
      new Error('OneDrive Drive ID chưa được cấu hình. Vui lòng kết nối lại OneDrive.'),
      { status: 503 }
    )
  }

  const token = await getAccessToken()
  const url   = `${GRAPH_BASE}/drives/${driveId}${relativePath}`

  logger.debug(`[Graph] ${method} ${url}`)

  const response = await axios({
    method,
    url,
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    data:             options.data,
    maxBodyLength:    options.maxBodyLength ?? Infinity,
    maxContentLength: Infinity,
    validateStatus:   (s) => s < 400,
  })

  return response.status === 204 ? null : response.data
}

module.exports = { graphRequest, getAuthUrl, exchangeCode, getConnectionStatus, disconnect }
