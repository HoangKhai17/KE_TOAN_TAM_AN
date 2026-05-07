const winston = require('winston')
const path = require('path')

const isDev = process.env.NODE_ENV !== 'production'

const formats = [
  winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  winston.format.errors({ stack: true }),
]

const devFormat = winston.format.combine(
  ...formats,
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : ''
    return `${timestamp} [${level}] ${message}${metaStr}${stack ? '\n' + stack : ''}`
  })
)

const prodFormat = winston.format.combine(...formats, winston.format.json())

const transports = [new winston.transports.Console()]

if (!isDev) {
  transports.push(
    new winston.transports.File({
      filename: path.join('logs', 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join('logs', 'combined.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10,
    })
  )
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  format: isDev ? devFormat : prodFormat,
  transports,
  silent: process.env.NODE_ENV === 'test',
})

module.exports = logger
