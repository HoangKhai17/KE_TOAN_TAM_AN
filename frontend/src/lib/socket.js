import { io } from 'socket.io-client'

let socket = null
let socketToken = null

export function getSocket() {
  return socket
}

export function connectSocket(accessToken) {
  if (!accessToken) return null

  // Token changed → disconnect old socket, create fresh one with new credentials
  if (socket && socketToken !== accessToken) {
    socket.disconnect()
    socket = null
    socketToken = null
  }

  // Socket already created for this token — reuse it.
  // NOTE: we intentionally do NOT use socket.active here because in socket.io-client v4
  // a freshly-created socket that hasn't yet connected has active=false (no _timeout set),
  // which would cause a duplicate socket to be created on every call before first connect.
  if (socket) {
    // If it gave up reconnecting (active=false, connected=false), kick it to retry
    if (!socket.active && !socket.connected) socket.connect()
    return socket
  }

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
