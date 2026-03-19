import type { Socket, Server } from 'socket.io'
import { approveSession, denySession, terminateSession } from '../services/browserControl'

// ─── registerBrowserEvents ────────────────────────────────────
// Called per-socket from registerSocketEvents().
// All handlers verify ownership inside the service layer.

export function registerBrowserEvents(
  socket: Socket,
  userId: string,
  io: Server
): void {
  // ── browser:approve ───────────────────────────────────────
  // Client approves a pending_approval session.
  // Payload: { sessionId: string }
  socket.on('browser:approve', async ({ sessionId }: { sessionId: string }) => {
    if (!sessionId) {
      socket.emit('error', { message: 'browser:approve requires sessionId', code: 'INVALID_PAYLOAD' })
      return
    }

    const result = await approveSession(sessionId, userId, io)
    if (result.error) {
      socket.emit('error', { message: result.error, code: 'BROWSER_APPROVE_FAILED' })
    }
    // On success: service emits browser:session_started to user room
  })

  // ── browser:deny ──────────────────────────────────────────
  // Client denies a pending_approval session.
  // Payload: { sessionId: string }
  socket.on('browser:deny', async ({ sessionId }: { sessionId: string }) => {
    if (!sessionId) {
      socket.emit('error', { message: 'browser:deny requires sessionId', code: 'INVALID_PAYLOAD' })
      return
    }

    const result = await denySession(sessionId, userId, io)
    if (result.error) {
      socket.emit('error', { message: result.error, code: 'BROWSER_DENY_FAILED' })
    }
    // On success: service emits browser:session_terminated {reason:'denied'} to user room
  })

  // ── browser:terminate ─────────────────────────────────────
  // Client terminates an active session mid-execution.
  // Payload: { sessionId: string }
  socket.on('browser:terminate', async ({ sessionId }: { sessionId: string }) => {
    if (!sessionId) {
      socket.emit('error', { message: 'browser:terminate requires sessionId', code: 'INVALID_PAYLOAD' })
      return
    }

    const result = await terminateSession(sessionId, userId, 'user_terminated', io)
    if (result.error) {
      socket.emit('error', { message: result.error, code: 'BROWSER_TERMINATE_FAILED' })
    }
    // On success: service emits browser:session_terminated {reason:'user_terminated'} to user room
  })
}
