const jwt = require('jsonwebtoken')
const env = require('../config/env')
const { redis } = require('../config/redis')

async function authenticate(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: { message: 'Authentication required' } })
  }
  const token = header.slice(7)

  try {
    const payload = jwt.verify(token, env.jwt.secret)

    const blacklisted = await redis.get(`blacklist:${payload.jti}`)
    if (blacklisted) {
      return res.status(401).json({ success: false, error: { message: 'Token has been revoked' } })
    }

    req.user = { id: payload.sub, role: payload.role, jti: payload.jti, exp: payload.exp }
    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: { message: 'Token expired' } })
    }
    return res.status(401).json({ success: false, error: { message: 'Invalid token' } })
  }
}

module.exports = { authenticate }
