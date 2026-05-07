require('dotenv').config()

const required = [
  'POSTGRES_DB',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'CREDENTIAL_ENCRYPTION_KEY',
]

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
}

if (process.env.CREDENTIAL_ENCRYPTION_KEY.length !== 64) {
  throw new Error('CREDENTIAL_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)')
}

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  isProd: process.env.NODE_ENV === 'production',
  isDev: process.env.NODE_ENV !== 'production',

  db: {
    url:
      process.env.DATABASE_URL ||
      `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST || 'postgres'}:5432/${process.env.POSTGRES_DB}`,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },

  redis: {
    url:
      process.env.REDIS_URL ||
      `redis://:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST || 'redis'}:6379`,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  encryption: {
    credentialKey: process.env.CREDENTIAL_ENCRYPTION_KEY,
  },

  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  },

  email: {
    host: process.env.SMTP_HOST || 'smtp.office365.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || 'no-reply@ketoan-taman.vn',
  },

  microsoft: {
    tenantId: process.env.MICROSOFT_TENANT_ID,
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    driveId: process.env.MICROSOFT_DRIVE_ID,
  },

  sentry: {
    dsn: process.env.SENTRY_DSN,
  },

  log: {
    level: process.env.LOG_LEVEL || 'info',
  },
}
