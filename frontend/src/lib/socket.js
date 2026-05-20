import { io } from 'socket.io-client'

let socket = null
let socketToken = null

export function getSocket() {
  return socket
}

export function connectSocket(accessToken) {
  if (!accessToken) return null

  if (socket && socketToken !== accessToken) {
    socket.disconnect()
    socket = null
  }

  if (socket?.active) return socket

  socketToken = accessToken
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
    socketToken = null
  }
}
