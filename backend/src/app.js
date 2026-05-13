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
  app.use('/api/companies/:companyId/schedules',    require('./modules/schedules/company-schedules.router'))
  app.use('/api/schedules',  require('./modules/schedules/schedules.router'))
  app.use('/api/tasks',          require('./modules/tasks/tasks.router'))
  app.use('/api/system-configs', require('./modules/system-configs/system-configs.router'))

  // Phase 9 — Credential Vault (nested under company)
  app.use('/api/companies/:companyId/credentials', require('./modules/credentials/credentials.router'))

  // Phase 10 — Payroll
  app.use('/api/payroll', require('./modules/payroll/payroll.router'))

  // Phase 11 — Documents / OneDrive
  app.use('/api/companies/:companyId/documents', require('./modules/documents/documents.router'))
  app.use('/api/admin/onedrive', require('./modules/onedrive/onedrive.router'))

  // Enum metadata
  app.use('/api/enums', require('./modules/enums/enums.router'))

  // Phase 8 — Scheduler admin endpoints
  app.use('/api/admin/scheduler', require('./modules/admin/scheduler.router'))

  // Phase 13 — Dashboard & Reports
  app.use('/api/dashboard', require('./modules/dashboard/dashboard.router'))
  app.use('/api/reports',   require('./modules/reports/reports.router'))

  // Phase 14 — Attendance & Leave
  app.use('/api/attendance', require('./modules/attendance/attendance.router'))

  // Phase 12 — Notifications
  app.use('/api/notifications', require('./modules/notifications/notifications.router'))

  // Dev helper: send a test notification to the calling user
  app.post('/api/notifications/test', require('./middleware/auth').authenticate, async (req, res, next) => {
    try {
      const { createAndEmit } = require('./lib/notify')
      const types = ['task_assigned', 'deadline_reminder', 'task_status_changed', 'escalation', 'morning_summary']
      const type  = types[Math.floor(Math.random() * types.length)]
      const notif = await createAndEmit(
        req.user.id, type,
        'Thông báo test từ hệ thống',
        `Đây là notification test (${type}) — ${new Date().toLocaleTimeString('vi-VN')}`,
        null,
      )
      res.json({ success: true, data: { notification: notif } })
    } catch (err) { next(err) }
  })

  // Phase 12 — Test email endpoint
  app.post('/api/system-configs/test-email', require('./middleware/auth').authenticate, require('./middleware/rbac').requireRole('admin'), async (req, res, next) => {
    try {
      const { testSmtp } = require('./utils/mailer')
      const { host, port, user, pass, from } = req.body
      if (!host || !port || !user || !pass) {
        return res.status(422).json({ success: false, error: { message: 'Vui lòng nhập đầy đủ host, port, user, pass' } })
      }
      await testSmtp({ host, port: parseInt(port, 10), user, pass, from: from || user })
      res.json({ success: true, data: { message: 'Gửi email test thành công!' } })
    } catch (err) {
      next(Object.assign(err, { status: 400 }))
    }
  })

  // 404 & error handlers
  app.use(notFound)
  app.use(errorHandler)

  return app
}

module.exports = createApp
