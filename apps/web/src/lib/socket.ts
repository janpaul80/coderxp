import { io, Socket } from 'socket.io-client'
import type { ServerToClientEvents, ClientToServerEvents } from '@/types'

// ─── Typed Socket ─────────────────────────────────────────────

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>

// ─── Singleton ────────────────────────────────────────────────

let socket: TypedSocket | null = null

export function getSocket(): TypedSocket {
  if (!socket) {
    const url = (import.meta as { env?: { VITE_SOCKET_URL?: string } }).env?.VITE_SOCKET_URL ?? 'http://localhost:3001'

    socket = io(url, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    }) as TypedSocket
  }
  return socket
}

export function connectSocket(token: string): TypedSocket {
  const s = getSocket()
  s.auth = { token }
  if (!s.connected) s.connect()
  return s
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect()
  }
  socket = null
}

export function joinProject(projectId: string): void {
  getSocket().emit('join:project', { projectId })
}

export function leaveProject(projectId: string): void {
  getSocket().emit('leave:project', { projectId })
}
