/**
 * Socket Bridge — Connects the agent status emitter to Socket.io.
 *
 * Bridges the internal statusEmitter events to Socket.io rooms so that
 * real-time agent status, file changes, and progress snapshots are pushed
 * to the connected user's browser.
 *
 * Events emitted to the client:
 *   - agent:status    → StatusPayload
 *   - agent:fileChange → FileChangePayload
 *   - agent:snapshot  → ProgressSnapshot
 */

import type { Server } from 'socket.io'
import {
  statusEmitter,
  type StatusPayload,
  type FileChangePayload,
} from './statusEmitter'

let _io: Server | null = null
let _cleanupStatus: (() => void) | null = null
let _cleanupFileChange: (() => void) | null = null

/**
 * Connect the status emitter to a Socket.io server.
 * Call this once during server startup, after `registerSocketEvents(io)`.
 */
export function connectStatusBridge(io: Server): void {
  if (_io) {
    console.warn('[SocketBridge] Already connected — skipping duplicate call')
    return
  }

  _io = io

  // Forward status payloads to all connected clients
  _cleanupStatus = statusEmitter.onStatus((payload: StatusPayload) => {
    io.emit('agent:status', payload)
  })

  // Forward file change payloads
  _cleanupFileChange = statusEmitter.onFileChange((payload: FileChangePayload) => {
    io.emit('agent:fileChange', payload)
  })

  console.log('[SocketBridge] Connected status emitter → Socket.io')
}

/**
 * Send a status payload to a specific user's sockets.
 * Use this when you want to target a specific user rather than broadcast.
 */
export function emitStatusToUser(
  userId: string,
  payload: StatusPayload
): void {
  if (!_io) return
  _io.to(`user:${userId}`).emit('agent:status', payload)
}

/**
 * Send a file change payload to a specific user's sockets.
 */
export function emitFileChangeToUser(
  userId: string,
  payload: FileChangePayload
): void {
  if (!_io) return
  _io.to(`user:${userId}`).emit('agent:fileChange', payload)
}

/**
 * Send the current progress snapshot to a specific user.
 */
export function emitSnapshotToUser(userId: string): void {
  if (!_io) return
  const snapshot = statusEmitter.getSnapshot()
  _io.to(`user:${userId}`).emit('agent:snapshot', snapshot)
}

/**
 * Disconnect the bridge (for graceful shutdown).
 */
export function disconnectStatusBridge(): void {
  _cleanupStatus?.()
  _cleanupFileChange?.()
  _io = null
  console.log('[SocketBridge] Disconnected')
}
