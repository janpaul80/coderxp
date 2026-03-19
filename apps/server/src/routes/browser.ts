import { Router, Response } from 'express'
import fs from 'fs'
import path from 'path'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { createBrowserSession, executeActions, ALLOWED_DOMAINS } from '../services/browserControl'
import { prisma } from '../lib/prisma'
import { io } from '../index'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

const router: Router = Router()

// ─── POST /api/browser/sessions ───────────────────────────────
// Create a new browser session (pending_approval).
// Emits browser:approval_required to the user's socket room.
// Body: { domain, purpose, plannedActions: string[], jobId?, source? }

router.post('/sessions', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id
  const { domain, purpose, plannedActions, jobId, source } = req.body

  if (!domain || typeof domain !== 'string') {
    return res.status(400).json({ error: 'domain is required' })
  }
  if (!purpose || typeof purpose !== 'string') {
    return res.status(400).json({ error: 'purpose is required' })
  }
  if (!Array.isArray(plannedActions) || plannedActions.length === 0) {
    return res.status(400).json({ error: 'plannedActions must be a non-empty array' })
  }

  const result = await createBrowserSession({
    userId,
    domain,
    purpose,
    plannedActions,
    jobId: jobId ?? undefined,
    source: source ?? 'manual',
  })

  if (result.error) {
    const status = result.error.startsWith('DOMAIN_NOT_ALLOWED') ? 400
      : result.error.startsWith('MAX_SESSION_LIMIT') ? 409
      : 400
    return res.status(status).json({ error: result.error })
  }

  // Fetch the created session for the response
  const session = await db.browserSession.findUnique({
    where: { id: result.sessionId },
  })

  // Emit approval_required to user's socket room
  io.to(`user:${userId}`).emit('browser:approval_required', {
    sessionId: result.sessionId,
    domain: session.domain,
    purpose: session.purpose,
    plannedActions: session.plannedActions,
    source: session.source,
  })

  return res.status(201).json({ sessionId: result.sessionId, session })
})

// ─── GET /api/browser/sessions ────────────────────────────────
// List all sessions for the authenticated user (all statuses).

router.get('/sessions', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id

  const sessions = await db.browserSession.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return res.json({ sessions })
})

// ─── GET /api/browser/sessions/:id ───────────────────────────
// Get a single session by ID (ownership enforced).

router.get('/sessions/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id
  const { id } = req.params

  const session = await db.browserSession.findUnique({
    where: { id },
    include: { actions: { orderBy: { createdAt: 'asc' } } },
  })

  if (!session) return res.status(404).json({ error: 'Session not found' })
  if (session.userId !== userId) return res.status(403).json({ error: 'Forbidden' })

  return res.json({ session })
})

// ─── GET /api/browser/sessions/:id/actions ───────────────────
// Audit log — all actions for a session (ownership enforced).

router.get('/sessions/:id/actions', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id
  const { id } = req.params

  const session = await db.browserSession.findUnique({ where: { id } })
  if (!session) return res.status(404).json({ error: 'Session not found' })
  if (session.userId !== userId) return res.status(403).json({ error: 'Forbidden' })

  const actions = await db.browserAction.findMany({
    where: { sessionId: id },
    orderBy: { createdAt: 'asc' },
  })

  return res.json({ actions })
})

// ─── GET /api/browser/sessions/:id/actions/:actionId/screenshot/:type ──
// Serve screenshot file (before|after) for an action.
// type: 'before' | 'after'

router.get('/sessions/:id/actions/:actionId/screenshot/:type', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id
  const { id, actionId, type } = req.params

  if (type !== 'before' && type !== 'after') {
    return res.status(400).json({ error: "type must be 'before' or 'after'" })
  }

  // Ownership check
  const session = await db.browserSession.findUnique({ where: { id } })
  if (!session) return res.status(404).json({ error: 'Session not found' })
  if (session.userId !== userId) return res.status(403).json({ error: 'Forbidden' })

  const action = await db.browserAction.findUnique({ where: { id: actionId } })
  if (!action || action.sessionId !== id) return res.status(404).json({ error: 'Action not found' })

  const relPath: string | null = type === 'before'
    ? action.screenshotBeforePath
    : action.screenshotAfterPath

  if (!relPath) return res.status(404).json({ error: 'Screenshot not available' })

  const absPath = path.join(process.cwd(), relPath)
  if (!fs.existsSync(absPath)) return res.status(404).json({ error: 'Screenshot file not found' })

  return res.sendFile(absPath)
})

// ─── GET /api/browser/allowed-domains ────────────────────────
// Return the whitelist for frontend display.

router.get('/allowed-domains', requireAuth, (_req: AuthRequest, res: Response) => {
  return res.json({ domains: [...ALLOWED_DOMAINS] })
})

// ─── POST /api/browser/test/execute-actions ───────────────────
// Test-only endpoint: execute actions on an active session.
// Requires BROWSER_MOCK_MODE=true on the server for deterministic results.
// Body: { sessionId, actions: Array<{ type, description, target?, value? }> }

router.post('/test/execute-actions', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id
  const { sessionId, actions } = req.body

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'sessionId is required' })
  }
  if (!Array.isArray(actions) || actions.length === 0) {
    return res.status(400).json({ error: 'actions must be a non-empty array' })
  }

  const result = await executeActions(sessionId, userId, actions, io)
  if (result.error) {
    const status = result.error.startsWith('SESSION_NOT_FOUND') ? 404
      : result.error.startsWith('FORBIDDEN') ? 403
      : result.error.startsWith('SESSION_NOT_ACTIVE') ? 409
      : 400
    return res.status(status).json({ error: result.error })
  }

  return res.json({ ok: true, sessionId })
})

export default router
