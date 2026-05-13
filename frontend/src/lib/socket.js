import { io } from 'socket.io-client'

let socket = null

export function getSocket() {
  return socket
}

export function connectSocket(accessToken) {
  if (socket?.connected) return socket

  socket = io(window.location.origin, {
    path: '/socket.io',
    auth: { token: accessToken },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
  })

  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
