const axios = require('axios')

const REQUIRED_VARS = [
  'MICROSOFT_TENANT_ID',
  'MICROSOFT_CLIENT_ID',
  'MICROSOFT_CLIENT_SECRET',
  'MICROSOFT_DRIVE_ID',
]

function isConfigured() {
  return REQUIRED_VARS.every(v => process.env[v])
}

let _tokenCache = { token: null, expiresAt: 0 }

async function getAccessToken() {
  if (!isConfigured()) {
    throw Object.assign(
      new Error('Microsoft Graph not configured — set MICROSOFT_TENANT_ID, CLIENT_ID, CLIENT_SECRET, DRIVE_ID'),
      { status: 503 }
    )
  }

  if (_tokenCache.token && Date.now() < _tokenCache.expiresAt - 60_000) {
    return _tokenCache.token
  }

  const tenantId = process.env.MICROSOFT_TENANT_ID
  const url      = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`

  const params = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     process.env.MICROSOFT_CLIENT_ID,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET,
    scope:         'https://graph.microsoft.com/.default',
  })

  const { data } = await axios.post(url, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })

  _tokenCache = {
    token:     data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  return _tokenCache.token
}

async function graphRequest(method, path, options = {}) {
  const token  = await getAccessToken()
  const driveId = process.env.MICROSOFT_DRIVE_ID
  const baseUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}`

  const response = await axios({
    method,
    url: `${baseUrl}${path}`,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
    ...options,
  })
  return response.data
}

module.exports = { isConfigured, graphRequest }
