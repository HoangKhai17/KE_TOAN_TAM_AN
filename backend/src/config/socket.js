'use strict'
const { Server } = require('socket.io')
const jwt = require('jsonwebtoken')
const env = require('./env')
const logger = require('./logger')

let io = null

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: env.cors.origin, // array from env.js — supports multiple origins
      credentials: true,
    },
    path: '/socket.io',
  })

  // Auth middleware — reject connections with invalid/missing token
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token
    if (!token) {
      logger.warn('[Socket] connection rejected — no token', {
        ip: socket.handshake.address,
      })
      return next(new Error('No token provided'))
    }
    try {
      const payload = jwt.verify(token, env.jwt.secret)
      socket.userId   = payload.sub
      socket.userRole = payload.role
      next()
    } catch (err) {
      logger.warn('[Socket] connection rejected — invalid token', {
        ip: socket.handshake.address,
        reason: err.message,
      })
      next(new Error('Invalid token'))
    }
  })

  io.on('connection', (socket) => {
    const room = `user:${socket.userId}`
    socket.join(room)
    logger.debug(`[Socket] connected uid=${socket.userId} role=${socket.userRole} sid=${socket.id}`)

    socket.on('disconnect', (reason) => {
      logger.debug(`[Socket] disconnected uid=${socket.userId} sid=${socket.id} reason=${reason}`)
    })

    socket.on('error', (err) => {
      logger.warn(`[Socket] socket error uid=${socket.userId} sid=${socket.id}`, { error: err.message })
    })
  })

  logger.info('[Socket] Socket.io server initialized', {
    allowedOrigins: env.cors.origin,
  })
  return io
}

function getIo() {
  return io
}

module.exports = { initSocket, getIo }
