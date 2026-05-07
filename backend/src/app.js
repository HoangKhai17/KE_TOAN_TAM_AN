const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const morgan = require('morgan')
const rateLimit = require('express-rate-limit')

const env = require('./config/env')
const logger = require('./config/logger')
const requestId = require('./middleware/requestId')
const errorHandler = require('./middleware/errorHandler')
const notFound = require('./middleware/notFound')

function createApp() {
  const app = express()

  // Trust proxy (for correct IP behind Nginx)
  app.set('trust proxy', 1)

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https://*.sharepoint.com'],
          connectSrc: ["'self'", 'https://graph.microsoft.com'],
          frameSrc: ["'none'"],
        },
      },
      hsts: { maxAge: 31536000, includeSubDomains: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    })
  )

  // CORS
  app.use(
    cors({
      origin: env.cors.origin,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    })
  )

  // Rate limiting
  app.use(
    '/api/auth/login',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false })
  )
  app.use(
    '/api/auth/refresh',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false })
  )
  app.use(
    '/api/',
    rateLimit({ windowMs: 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false })
  )

  // Request ID
  app.use(requestId)

  // HTTP logger
  app.use(
    morgan('combined', {
      stream: { write: (msg) => logger.http(msg.trim()) },
      skip: (req) => req.path === '/api/health',
    })
  )

  // Body parsers
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: true }))

  // Health check (no auth required)
  app.get('/api/health', async (req, res) => {
    const { testConnection: testDb } = require('./config/db')
    const { testConnection: testRedis } = require('./config/redis')

    let dbStatus = 'ok'
    let redisStatus = 'ok'

    try {
      await testDb()
    } catch {
      dbStatus = 'error'
    }

    try {
      await testRedis()
    } catch {
      redisStatus = 'error'
    }

    const healthy = dbStatus === 'ok' && redisStatus === 'ok'
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      db: dbStatus,
      redis: redisStatus,
      uptime: Math.floor(process.uptime()),
      version: process.env.npm_package_version || '1.0.0',
      env: env.NODE_ENV,
    })
  })

  // API routes (will be populated in later phases)
  // app.use('/api/auth', require('./modules/auth/auth.router'))
  // app.use('/api/users', require('./modules/users/users.router'))
  // ... etc

  // 404 & error handlers
  app.use(notFound)
  app.use(errorHandler)

  return app
}

module.exports = createApp
