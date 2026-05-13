'use strict'
const { Server } = require('socket.io')
const jwt = require('jsonwebtoken')
const env = require('./env')
const logger = require('./logger')

let io = null

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: env.cors.origin,
      credentials: true,
    },
    path: '/socket.io',
  })

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token
    if (!token) return next(new Error('No token provided'))
    try {
      const payload = jwt.verify(token, env.jwt.secret)
      socket.userId   = payload.sub
      socket.userRole = payload.role
      next()
    } catch {
      next(new Error('Invalid token'))
    }
  })

  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`)
    logger.debug(`[Socket] user ${socket.userId} connected — socket ${socket.id}`)
    socket.on('disconnect', () => {
      logger.debug(`[Socket] user ${socket.userId} disconnected — socket ${socket.id}`)
    })
  })

  logger.info('[Socket] Socket.io server initialized')
  return io
}

function getIo() {
  return io
}

module.exports = { initSocket, getIo }
