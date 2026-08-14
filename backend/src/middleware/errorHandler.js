const logger = require('../config/logger')
const env = require('../config/env')

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500
  const requestId = req.requestId || 'unknown'

  logger.error('Unhandled error', {
    requestId,
    status,
    message: err.message,
    path: req.path,
    method: req.method,
    userId: req.user?.id,
    stack: env.isDev ? err.stack : undefined,
  })

  res.status(status).json({
    success: false,
    error: {
      message: status < 500 ? err.message : 'Internal server error',
      // Mã lỗi máy đọc được (vd LEAVE_BALANCE_EXCEEDED) để giao diện xử lý riêng
      // thay vì so khớp chuỗi thông báo. Chỉ trả với lỗi phía client.
      ...(status < 500 && err.code ? { code: err.code } : {}),
      ...(env.isDev && { stack: err.stack }),
    },
    requestId,
  })
}

module.exports = errorHandler
