/**
 * workerInternal.ts — Phase 5 Slice 3
 *
 * POST /internal/worker/emit
 *   Called by remote worker nodes to relay socket events back to the main
 *   server's Socket.io instance. Protected by WORKER_INTERNAL_SECRET.
 *
 * GET  /internal/worker/router-health
 *   Returns current worker router health state (for ops monitoring).
 */

import { Router, Request, Response } from 'express'
import { getUserSocketIds } from '../socket/events'
import { getWorkerHealthStatus } from '../services/workerRouter'
import { io } from '../index'

export const workerInternalRouter: Router = Router()

const INTERNAL_SECRET = process.env.WORKER_INTERNAL_SECRET ?? ''

// ─── Auth middleware ──────────────────────────────────────────

function requireInternalSecret(req: Request, res: Response, next: () => void): void {
  if (!INTERNAL_SECRET) {
    // No secret configured — reject all internal calls
    res.status(503).json({ error: 'WORKER_INTERNAL_SECRET not configured on main server' })
    return
  }
  const auth = req.headers['authorization'] ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (token !== INTERNAL_SECRET) {
    res.status(401).json({ error: 'Invalid internal secret' })
    return
  }
  next()
}

// ─── POST /internal/worker/emit ──────────────────────────────

workerInternalRouter.post(
  '/worker/emit',
  (req: Request, res: Response, next: () => void) => requireInternalSecret(req, res, next),
  (req: Request, res: Response) => {
    const { userId, event, data } = req.body as {
      userId?: string
      event?: string
      data?: unknown
    }

    if (!userId || !event) {
      res.status(400).json({ error: 'userId and event are required' })
      return
    }

    const socketIds = getUserSocketIds(userId)
    if (socketIds.length === 0) {
      // User not connected — not an error, just no active socket
      res.json({ delivered: false, reason: 'no_active_socket', socketCount: 0 })
      return
    }

    socketIds.forEach((id) => io.to(id).emit(event, data))

    res.json({ delivered: true, socketCount: socketIds.length, event })
  }
)

// ─── GET /internal/worker/router-health ──────────────────────

workerInternalRouter.get(
  '/worker/router-health',
  (req: Request, res: Response, next: () => void) => requireInternalSecret(req, res, next),
  (_req: Request, res: Response) => {
    const status = getWorkerHealthStatus()
    res.json({
      timestamp: new Date().toISOString(),
      ...status,
    })
  }
)
