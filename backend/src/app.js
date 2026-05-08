const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const morgan = require('morgan')
const rateLimit = require('express-rate-limit')
const cookieParser = require('cookie-parser')
const swaggerUi = require('swagger-ui-express')

const env = require('./config/env')
const logger = require('./config/logger')
const swaggerSpec = require('./config/swagger')
const requestId = require('./middleware/requestId')
const errorHandler = require('./middleware/errorHandler')
const notFound = require('./middleware/notFound')

function createApp() {
  const app = express()

  // Trust proxy (for correct IP behind Nginx)
  app.set('trust proxy', 1)

  // Swagger UI — relaxed CSP for /api/docs only (dev tool, not production route)
  app.use(
    '/api/docs',
    helmet({ contentSecurityPolicy: false }),
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: 'KTTA API Docs',
      swaggerOptions: { persistAuthorization: true },
    })
  )
  app.get('/api/docs.json', (req, res) => res.json(swaggerSpec))

  // Security headers (applied to all routes except /api/docs above)
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

  // Body parsers + cookies
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: true }))
  app.use(cookieParser())

  /**
   * @openapi
   * /health:
   *   get:
   *     tags: [Health]
   *     summary: System health check
   *     security: []
   *     responses:
   *       200:
   *         description: All systems operational
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:  { type: string, example: ok }
   *                 db:      { type: string, example: ok }
   *                 redis:   { type: string, example: ok }
   *                 uptime:  { type: integer, example: 3600 }
   *                 version: { type: string, example: 1.0.0 }
   *                 env:     { type: string, example: development }
   *       503:
   *         description: One or more services degraded
   */
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

  // API routes
  app.use('/api/auth',       require('./modules/auth/auth.router'))
  app.use('/api/users',      require('./modules/users/users.router'))
  app.use('/api/companies',  require('./modules/companies/companies.router'))
  app.use('/api/task-types', require('./modules/task-types/task-types.router'))
  app.use('/api/companies/:companyId/schedules', require('./modules/schedules/company-schedules.router'))
  app.use('/api/schedules',  require('./modules/schedules/schedules.router'))
  app.use('/api/tasks',      require('./modules/tasks/tasks.router'))

  // 404 & error handlers
  app.use(notFound)
  app.use(errorHandler)

  return app
}

module.exports = createApp
