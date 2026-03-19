import path from 'path'
import fs from 'fs'
import { prisma } from '../lib/prisma'
import type { Server } from 'socket.io'

// Temporary cast until Prisma client is regenerated with BrowserSession/BrowserAction models.
// Migration is applied; DLL locked by running server prevents regeneration.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

// Local string literal types — mirrors Prisma enums.
// These resolve once Prisma client is regenerated; using strings avoids import errors.
type BrowserSessionStatus =
  | 'pending_approval'
  | 'active'
  | 'completed'
  | 'terminated_by_user'
  | 'terminated_timeout'
  | 'failed'

type BrowserActionType =
  | 'navigate'
  | 'click'
  | 'type_text'
  | 'screenshot'
  | 'wait'
  | 'scroll'
  | 'extract_text'

type BrowserActionStatus = 'pending' | 'executing' | 'complete' | 'failed'

// ─── Domain Whitelist ─────────────────────────────────────────
// Strict exact-host matching. No wildcards. Expand intentionally.

export const ALLOWED_DOMAINS = new Set([
  'dashboard.stripe.com',
  'app.supabase.com',
  'vercel.com',
  'railway.app',
  'github.com',
  'netlify.com',
  'app.netlify.com',
  'console.firebase.google.com',
  'planetscale.com',
])

// ─── Sensitive Field Detection ────────────────────────────────
// Aggressive: field name heuristics + input type detection.
// If ANY pattern matches, value is redacted and screenshot is skipped.

const SENSITIVE_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /auth/i,
  /credential/i,
  /private[_-]?key/i,
  /access[_-]?key/i,
  /anon[_-]?key/i,
  /service[_-]?role/i,
]

export function isSensitiveTarget(target?: string | null, value?: string | null): boolean {
  if (!target && !value) return false
  const combined = `${target ?? ''} ${value ?? ''}`.toLowerCase()
  return SENSITIVE_PATTERNS.some((p) => p.test(combined))
}

export function redactValue(
  value: string | null | undefined,
  target?: string | null
): string | null {
  if (!value) return null
  if (isSensitiveTarget(target, value)) return '[REDACTED]'
  return value
}

// ─── Screenshot Storage ───────────────────────────────────────
// Files stored at: browser-screenshots/{sessionId}/{actionId}-{before|after}.jpg
// DB stores relative path only. Cleanup on session close.

const SCREENSHOTS_DIR = path.join(process.cwd(), 'browser-screenshots')

function ensureScreenshotDir(sessionId: string): string {
  const dir = path.join(SCREENSHOTS_DIR, sessionId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function screenshotRelPath(sessionId: string, actionId: string, side: 'before' | 'after'): string {
  return path.join('browser-screenshots', sessionId, `${actionId}-${side}.jpg`)
}

function screenshotAbsPath(relPath: string): string {
  return path.join(process.cwd(), relPath)
}

async function saveScreenshot(
  sessionId: string,
  actionId: string,
  side: 'before' | 'after',
  data: Buffer
): Promise<string> {
  ensureScreenshotDir(sessionId)
  const relPath = screenshotRelPath(sessionId, actionId, side)
  const absPath = screenshotAbsPath(relPath)
  fs.writeFileSync(absPath, data)
  return relPath
}

export function cleanupSessionScreenshots(sessionId: string): void {
  const dir = path.join(SCREENSHOTS_DIR, sessionId)
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

// ─── In-Memory Session Map ────────────────────────────────────

interface ActiveBrowserContext {
  sessionId: string
  userId: string
  lastActivityAt: Date
  inactivityTimer: NodeJS.Timeout
  // Puppeteer objects — typed as any to avoid import issues in mock mode
  browser: unknown
  page: unknown
  context: unknown
}

const activeSessions = new Map<string, ActiveBrowserContext>()

const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000  // 10 minutes
const MAX_SESSION_DURATION_MS = 30 * 60 * 1000 // 30 minutes

// ─── Mock Mode ────────────────────────────────────────────────
// Set BROWSER_MOCK_MODE=true to skip real Puppeteer (for tests).

const MOCK_MODE = process.env.BROWSER_MOCK_MODE === 'true'

// 1x1 transparent JPEG as mock screenshot
const MOCK_SCREENSHOT_BUFFER = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U' +
  'HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN' +
  'DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy' +
  'MjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAA' +
  'AAAAAAAAAAAAAAAAAP/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAA' +
  'AAAA/9oADAMBAAIRAxEAPwCwABmX/9k=',
  'base64'
)

// ─── getUserActiveSession ─────────────────────────────────────

export function getUserActiveSession(userId: string): ActiveBrowserContext | undefined {
  for (const [, ctx] of activeSessions) {
    if (ctx.userId === userId) return ctx
  }
  return undefined
}

// ─── createBrowserSession ─────────────────────────────────────

export interface CreateSessionInput {
  userId: string
  jobId?: string
  domain: string
  purpose: string
  plannedActions: string[]
  source?: string
}

export async function createBrowserSession(
  input: CreateSessionInput
): Promise<{ sessionId: string; error?: string }> {
  const { userId, jobId, domain, purpose, plannedActions, source = 'manual' } = input

  // 1. Domain whitelist check — fail closed
  if (!ALLOWED_DOMAINS.has(domain)) {
    return { sessionId: '', error: `DOMAIN_NOT_ALLOWED: '${domain}' is not in the approved domain list` }
  }

  // 2. Max 1 active session per user
  const existing = getUserActiveSession(userId)
  if (existing) {
    return { sessionId: '', error: 'MAX_SESSION_LIMIT: User already has an active browser session' }
  }

  // 3. Also check DB for pending_approval sessions (not yet in memory)
  const pendingInDb = await db.browserSession.findFirst({
    where: {
      userId,
      status: { in: ['pending_approval', 'active'] },
    },
  })
  if (pendingInDb) {
    return { sessionId: '', error: 'MAX_SESSION_LIMIT: User already has a pending or active browser session' }
  }

  // 4. Create DB record
  const session = await db.browserSession.create({
    data: {
      userId,
      jobId: jobId ?? null,
      domain,
      purpose,
      plannedActions,
      source,
      status: 'pending_approval',
    },
  })

  return { sessionId: session.id }
}

// ─── approveSession ───────────────────────────────────────────

export async function approveSession(
  sessionId: string,
  userId: string,
  io: Server
): Promise<{ error?: string }> {
  // 1. Ownership + status check
  const session = await db.browserSession.findUnique({ where: { id: sessionId } })
  if (!session) return { error: 'SESSION_NOT_FOUND' }
  if (session.userId !== userId) return { error: 'FORBIDDEN' }
  if (session.status !== 'pending_approval') return { error: `SESSION_NOT_PENDING: status is '${session.status}'` }

  // 2. Re-check max 1 active session (race condition guard)
  const existing = getUserActiveSession(userId)
  if (existing) return { error: 'MAX_SESSION_LIMIT: Another session became active during approval' }

  // 3. Update DB to active
  await db.browserSession.update({
    where: { id: sessionId },
    data: { status: 'active', grantedAt: new Date() },
  })

  // 4. Launch browser (or mock)
  let browser: unknown = null
  let page: unknown = null
  let context: unknown = null

  if (!MOCK_MODE) {
    try {
      const puppeteer = await import('puppeteer')
      const b = await puppeteer.default.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      })
      const ctx = await b.createBrowserContext()
      const p = await ctx.newPage()
      await p.setViewport({ width: 1280, height: 800 })
      browser = b
      context = ctx
      page = p
    } catch (err) {
      await db.browserSession.update({
        where: { id: sessionId },
        data: { status: 'failed', closedAt: new Date(), closedReason: `Browser launch failed: ${(err as Error).message}` },
      })
      return { error: `BROWSER_LAUNCH_FAILED: ${(err as Error).message}` }
    }
  }

  // 5. Set up inactivity timer
  const inactivityTimer = setTimeout(async () => {
    await terminateSession(sessionId, userId, 'timeout', io)
  }, INACTIVITY_TIMEOUT_MS)

  // 6. Register in memory map
  activeSessions.set(sessionId, {
    sessionId,
    userId,
    lastActivityAt: new Date(),
    inactivityTimer,
    browser,
    page,
    context,
  })

  // 7. Emit session started
  io.to(`user:${userId}`).emit('browser:session_started', {
    sessionId,
    domain: session.domain,
  })

  return {}
}

// ─── denySession ──────────────────────────────────────────────

export async function denySession(
  sessionId: string,
  userId: string,
  io: Server
): Promise<{ error?: string }> {
  const session = await db.browserSession.findUnique({ where: { id: sessionId } })
  if (!session) return { error: 'SESSION_NOT_FOUND' }
  if (session.userId !== userId) return { error: 'FORBIDDEN' }
  if (session.status !== 'pending_approval') return { error: `SESSION_NOT_PENDING: status is '${session.status}'` }

  await db.browserSession.update({
    where: { id: sessionId },
    data: { status: 'failed', closedAt: new Date(), closedReason: 'Denied by user' },
  })

  io.to(`user:${userId}`).emit('browser:session_terminated', {
    sessionId,
    reason: 'denied',
  })

  return {}
}

// ─── terminateSession ─────────────────────────────────────────

export async function terminateSession(
  sessionId: string,
  userId: string,
  reason: 'user_terminated' | 'timeout' | 'error',
  io: Server
): Promise<{ error?: string }> {
  const session = await db.browserSession.findUnique({ where: { id: sessionId } })
  if (!session) return { error: 'SESSION_NOT_FOUND' }
  if (session.userId !== userId) return { error: 'FORBIDDEN' }

  // Only terminate active sessions
  if (session.status !== 'active') {
    return { error: `SESSION_NOT_ACTIVE: status is '${session.status}'` }
  }

  // Close browser context
  const ctx = activeSessions.get(sessionId)
  if (ctx) {
    clearTimeout(ctx.inactivityTimer)
    if (!MOCK_MODE && ctx.browser) {
      try {
        const b = ctx.browser as { close: () => Promise<void> }
        await b.close()
      } catch {
        // Ignore close errors
      }
    }
    activeSessions.delete(sessionId)
  }

  const dbStatus: BrowserSessionStatus =
    reason === 'timeout' ? 'terminated_timeout' : 'terminated_by_user'

  await db.browserSession.update({
    where: { id: sessionId },
    data: {
      status: dbStatus,
      closedAt: new Date(),
      closedReason: reason === 'timeout' ? 'Inactivity timeout' : 'Terminated by user',
    },
  })

  io.to(`user:${userId}`).emit('browser:session_terminated', {
    sessionId,
    reason,
  })

  return {}
}

// ─── executeActions ───────────────────────────────────────────

export interface BrowserActionInput {
  type: BrowserActionType
  description: string
  target?: string
  value?: string
}

export async function executeActions(
  sessionId: string,
  userId: string,
  actions: BrowserActionInput[],
  io: Server
): Promise<{ error?: string }> {
  const session = await db.browserSession.findUnique({ where: { id: sessionId } })
  if (!session) return { error: 'SESSION_NOT_FOUND' }
  if (session.userId !== userId) return { error: 'FORBIDDEN' }
  if (session.status !== 'active') return { error: `SESSION_NOT_ACTIVE: status is '${session.status}'` }

  const ctx = activeSessions.get(sessionId)
  if (!ctx && !MOCK_MODE) return { error: 'SESSION_CONTEXT_NOT_FOUND' }

  // Reset inactivity timer
  if (ctx) {
    clearTimeout(ctx.inactivityTimer)
    ctx.inactivityTimer = setTimeout(async () => {
      await terminateSession(sessionId, userId, 'timeout', io)
    }, INACTIVITY_TIMEOUT_MS)
    ctx.lastActivityAt = new Date()
  }

  for (const actionInput of actions) {
    const sensitive = isSensitiveTarget(actionInput.target, actionInput.value)
    const safeValue = redactValue(actionInput.value, actionInput.target)

    // Create DB action record
    const dbAction = await db.browserAction.create({
      data: {
        sessionId,
        type: actionInput.type,
        description: actionInput.description,
        target: actionInput.target ?? null,
        value: safeValue,
        status: 'executing',
      },
    })

    // Emit action_executing (with optional before screenshot)
    let screenshotBeforePath: string | null = null

    if (!sensitive) {
      try {
        const beforeBuf = MOCK_MODE
          ? MOCK_SCREENSHOT_BUFFER
          : await capturePageScreenshot(ctx?.page)
        if (beforeBuf) {
          screenshotBeforePath = await saveScreenshot(sessionId, dbAction.id, 'before', beforeBuf)
          await db.browserAction.update({
            where: { id: dbAction.id },
            data: { screenshotBeforePath },
          })
        }
      } catch {
        // Screenshot failure is non-fatal
      }
    }

    io.to(`user:${userId}`).emit('browser:action_executing', {
      sessionId,
      actionId: dbAction.id,
      description: actionInput.description,
      screenshotBeforePath: screenshotBeforePath ?? undefined,
    })

    // Execute the action
    let actionError: string | null = null
    try {
      if (MOCK_MODE) {
        await new Promise((r) => setTimeout(r, 50)) // simulate work
      } else {
        await executePuppeteerAction(ctx?.page, actionInput)
      }
    } catch (err) {
      actionError = (err as Error).message
    }

    // Capture after screenshot (skip for sensitive or failed)
    let screenshotAfterPath: string | null = null
    if (!sensitive && !actionError) {
      try {
        const afterBuf = MOCK_MODE
          ? MOCK_SCREENSHOT_BUFFER
          : await capturePageScreenshot(ctx?.page)
        if (afterBuf) {
          screenshotAfterPath = await saveScreenshot(sessionId, dbAction.id, 'after', afterBuf)
        }
      } catch {
        // Screenshot failure is non-fatal
      }
    }

    const finalStatus: BrowserActionStatus = actionError ? 'failed' : 'complete'

    await db.browserAction.update({
      where: { id: dbAction.id },
      data: {
        status: finalStatus,
        screenshotAfterPath,
        error: actionError,
        executedAt: new Date(),
      },
    })

    if (actionError) {
      io.to(`user:${userId}`).emit('browser:action_failed', {
        sessionId,
        actionId: dbAction.id,
        description: actionInput.description,
        error: actionError,
      })
      // Stop execution on first failure
      break
    } else {
      io.to(`user:${userId}`).emit('browser:action_complete', {
        sessionId,
        actionId: dbAction.id,
        description: actionInput.description,
        screenshotAfterPath: screenshotAfterPath ?? undefined,
      })
    }
  }

  return {}
}

// ─── completeSession ──────────────────────────────────────────

export async function completeSession(
  sessionId: string,
  userId: string,
  summary: string,
  io: Server
): Promise<void> {
  const ctx = activeSessions.get(sessionId)
  if (ctx) {
    clearTimeout(ctx.inactivityTimer)
    if (!MOCK_MODE && ctx.browser) {
      try {
        const b = ctx.browser as { close: () => Promise<void> }
        await b.close()
      } catch {
        // Ignore
      }
    }
    activeSessions.delete(sessionId)
  }

  await db.browserSession.update({
    where: { id: sessionId },
    data: { status: 'completed', closedAt: new Date(), closedReason: 'Completed successfully' },
  })

  io.to(`user:${userId}`).emit('browser:session_complete', {
    sessionId,
    summary,
  })
}

// ─── getActiveSessions ────────────────────────────────────────

export async function getActiveSessions(userId: string) {
  return db.browserSession.findMany({
    where: { userId, status: { in: ['pending_approval', 'active'] } },
    include: { actions: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  })
}

// ─── cleanupAllSessions ───────────────────────────────────────
// Called on server shutdown — close all active Puppeteer browsers.

export async function cleanupAllSessions(): Promise<void> {
  const sessionIds = [...activeSessions.keys()]
  for (const sessionId of sessionIds) {
    const ctx = activeSessions.get(sessionId)
    if (!ctx) continue
    clearTimeout(ctx.inactivityTimer)
    if (!MOCK_MODE && ctx.browser) {
      try {
        const b = ctx.browser as { close: () => Promise<void> }
        await b.close()
      } catch {
        // Ignore
      }
    }
    activeSessions.delete(sessionId)
    // Mark as terminated in DB
    await db.browserSession.updateMany({
      where: { id: sessionId, status: 'active' },
      data: { status: 'terminated_timeout', closedAt: new Date(), closedReason: 'Server shutdown' },
    })
  }
}

// ─── Puppeteer Helpers ────────────────────────────────────────

async function capturePageScreenshot(page: unknown): Promise<Buffer | null> {
  if (!page) return null
  try {
    const p = page as { screenshot: (opts: object) => Promise<Buffer> }
    return await p.screenshot({ type: 'jpeg', quality: 60 })
  } catch {
    return null
  }
}

async function executePuppeteerAction(
  page: unknown,
  action: BrowserActionInput
): Promise<void> {
  if (!page) throw new Error('No active page')
  const p = page as {
    goto: (url: string, opts?: object) => Promise<unknown>
    click: (selector: string) => Promise<void>
    type: (selector: string, text: string) => Promise<void>
    screenshot: (opts: object) => Promise<Buffer>
    waitForTimeout: (ms: number) => Promise<void>
    evaluate: (fn: () => void) => Promise<void>
    $: (selector: string) => Promise<unknown>
  }

  switch (action.type) {
    case 'navigate':
      if (!action.target) throw new Error('navigate requires a target URL')
      await p.goto(action.target, { waitUntil: 'networkidle2', timeout: 30000 })
      break

    case 'click':
      if (!action.target) throw new Error('click requires a target selector')
      await p.click(action.target)
      break

    case 'type_text':
      if (!action.target) throw new Error('type_text requires a target selector')
      if (!action.value) throw new Error('type_text requires a value')
      // Use original value (not redacted) for actual typing — redaction is only for DB persistence
      await p.type(action.target, action.value)
      break

    case 'screenshot':
      // Screenshot-only action — no interaction needed
      break

    case 'wait':
      await p.waitForTimeout(action.value ? parseInt(action.value, 10) : 1000)
      break

    case 'scroll':
      // String-based evaluate runs in browser context — cast to any avoids Node.js type conflict
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (p as any).evaluate('window.scrollBy(0, 300)')
      break

    case 'extract_text':
      // Read-only — no interaction
      break

    default:
      throw new Error(`Unknown action type: ${action.type}`)
  }
}
