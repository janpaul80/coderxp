/**
 * Preview Routes — Phase 5 Slice 2
 *
 * GET  /api/preview/:jobId/status           — enriched preview status + all metadata
 * POST /api/preview/:jobId/stop             — stop the preview process
 * GET  /api/preview/:jobId/health           — live health check + failure info
 * GET  /api/preview/:jobId/logs             — structured build logs from DB
 * POST /api/preview/test/inject-failure-job — DEV ONLY: inject a job that will fail
 */

import { Router, Request, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { prisma } from '../lib/prisma'
import { Prisma } from '@prisma/client'
import {
  getPreviewInstance,
  stopPreview,
  getActivePreviewsSummary,
  checkPreviewHealth,
} from '../services/previewManager'
import { builderQueue } from '../jobs/builderQueue'
import { selectWorker, getWorkerBaseUrl } from '../services/workerRouter'
import { io } from '../index'
import { getUserSocketIds } from '../socket/events'
import http from 'http'

export const previewRouter: Router = Router()

// ─── Helper: verify job ownership ────────────────────────────

async function getOwnedJob(jobId: string, userId: string) {
  const job = await prisma.job.findFirst({
    where: { id: jobId },
    include: { project: { select: { userId: true } } },
  })
  if (!job || job.project.userId !== userId) return null
  return job
}

// ─── GET /api/preview/active ─────────────────────────────────
// Returns all currently active (in-memory) preview instances.
// Requires auth — returns only summary data (no process handles).
// Defined BEFORE /:jobId routes to avoid Express treating "active" as a jobId.

previewRouter.get('/active', requireAuth, (_req: AuthRequest, res: Response) => {
  try {
    const summaries = getActivePreviewsSummary()
    return res.json({
      count: summaries.length,
      previews: summaries,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get active previews'
    return res.status(500).json({ error: message })
  }
})

// ─── POST /api/preview/test/inject-failure-job ───────────────
// DEV/TEST ONLY — defined BEFORE /:jobId routes to avoid Express treating
// "test" as a jobId parameter.
// Creates a job with a non-existent planId in queue data so the worker
// immediately throws "Plan not found" → classified as scaffold_failure.

previewRouter.post('/test/inject-failure-job', requireAuth, async (req: AuthRequest, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' })
  }

  try {
    const { projectId, failAt } = req.body as { projectId?: string; failAt?: string }
    if (!projectId) {
      return res.status(400).json({ error: 'projectId required' })
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: req.userId! },
    })
    if (!project) {
      return res.status(404).json({ error: 'Project not found' })
    }

    if (!builderQueue) {
      return res.status(503).json({ error: 'Builder queue not available' })
    }

    // planId is nullable in schema — create job with null planId in DB
    const job = await prisma.job.create({
      data: { projectId, planId: null, status: 'queued' },
    })

    // Select worker and persist routing metadata
    const selection = selectWorker(builderQueue)
    await prisma.job.update({
      where: { id: job.id },
      data: {
        workerName: selection.workerName,
        workerSelectedReason: selection.selectedReason,
      },
    })

    // Determine planId for queue:
    // - failAt=install: need a real approved plan so worker reaches install phase
    // - default (no failAt): nonexistent planId → scaffold_failure immediately
    let planIdForQueue = 'nonexistent-plan-id-failure-test'
    if (failAt === 'install') {
      // Find or create a test chat for this project
      let chat = await prisma.chat.findFirst({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
      })
      if (!chat) {
        chat = await prisma.chat.create({
          data: { projectId, title: '[test] inject-failure chat' },
        })
      }
      // Create a minimal approved plan so worker can scaffold + reach install phase
      const plan = await prisma.plan.create({
        data: {
          chatId: chat.id,
          projectId,
          status: 'approved',
          summary: 'Minimal test plan for install failure injection',
          features: [],
          frontendScope: [],
          backendScope: [],
          integrations: [],
          techStack: { frontend: ['React'], backend: ['Node.js'] } as Prisma.InputJsonValue,
          executionSteps: [],
          estimatedComplexity: 'low',
        },
      })
      planIdForQueue = plan.id
    }

    await selection.queue.add('build', {
      jobId: job.id,
      projectId,
      planId: planIdForQueue,
      userId: req.userId!,
      injectFailAt: failAt,
    })

    const expectedCategory = failAt === 'install' ? 'install_failure' : 'scaffold_failure'
    return res.status(201).json({
      jobId: job.id,
      projectId,
      failAt: failAt ?? null,
      expectedFailureCategory: expectedCategory,
      message: `Failure job injected — worker will fail with ${expectedCategory}`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to inject failure job'
    return res.status(500).json({ error: message })
  }
})

// ─── POST /api/preview/test/inject-credential-request ────────
// DEV/TEST ONLY — creates a CredentialRequest in DB and emits credentials:requested
// to the authenticated user's socket. Used to test the credential handoff flow
// without running a full build.

previewRouter.post('/test/inject-credential-request', requireAuth, async (req: AuthRequest, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' })
  }

  try {
    const { jobId, integration, label, purpose, fields } = req.body as {
      jobId?: string
      integration?: string
      label?: string
      purpose?: string
      fields?: Array<{ key: string; label: string; type: string; placeholder?: string; required?: boolean }>
    }

    if (!jobId || !integration || !label || !purpose || !fields) {
      return res.status(400).json({ error: 'jobId, integration, label, purpose, fields required' })
    }

    const job = await getOwnedJob(jobId, req.userId!)
    if (!job) {
      return res.status(404).json({ error: 'Job not found' })
    }

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes

    const credReq = await prisma.credentialRequest.create({
      data: {
        jobId,
        userId: req.userId!,
        integration,
        label,
        purpose,
        fields: fields as Prisma.InputJsonValue,
        status: 'pending',
        expiresAt,
      },
    })

    // Emit credentials:requested to all of the user's connected sockets
    const socketIds = getUserSocketIds(req.userId!)
    const payload = {
      id: credReq.id,
      jobId,
      integration,
      label,
      purpose,
      fields,
      status: 'pending' as const,
      expiresAt: expiresAt.toISOString(),
    }
    socketIds.forEach((sid) => {
      io.to(sid).emit('credentials:requested', payload)
    })

    return res.status(201).json({
      requestId: credReq.id,
      jobId,
      integration,
      label,
      purpose,
      expiresAt: expiresAt.toISOString(),
      socketCount: socketIds.length,
      message: 'Credential request created and emitted to user socket(s)',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to inject credential request'
    return res.status(500).json({ error: message })
  }
})

// ─── POST /api/preview/test/inject-error-analysis ────────────
// S9 E2E test endpoint — emits job:error_analysis to the authenticated user's
// socket(s) with a synthetic ErrorAnalysis payload.
// Auth-gated. Works in production (read-only socket emit, no DB writes).
// Used to verify the socket event path and ErrorAnalysisCard rendering
// without triggering a real build.

previewRouter.post('/test/inject-error-analysis', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { jobId, errorAnalysis, attempt } = req.body as {
      jobId?: string
      errorAnalysis?: Record<string, unknown>
      attempt?: number
    }

    if (!jobId || !errorAnalysis) {
      return res.status(400).json({ error: 'jobId and errorAnalysis are required' })
    }

    // Verify job ownership
    const job = await getOwnedJob(jobId, req.userId!)
    if (!job) {
      return res.status(404).json({ error: 'Job not found' })
    }

    const payload = {
      jobId,
      attempt: attempt ?? 1,
      errorAnalysis,
    }

    const socketIds = getUserSocketIds(req.userId!)
    socketIds.forEach((sid) => {
      io.to(sid).emit('job:error_analysis', payload)
    })

    return res.status(200).json({
      ok: true,
      jobId,
      attempt: payload.attempt,
      socketCount: socketIds.length,
      message: `job:error_analysis emitted to ${socketIds.length} socket(s)`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to inject error analysis'
    return res.status(500).json({ error: message })
  }
})

// ─── GET /api/preview/test/credential-request/:requestId ─────
// DEV/TEST ONLY — returns the DB record for a credential request.
// NOTE: No values field — values are never persisted.

previewRouter.get('/test/credential-request/:requestId', requireAuth, async (req: AuthRequest, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' })
  }

  try {
    const credReq = await prisma.credentialRequest.findUnique({
      where: { id: req.params.requestId },
    })

    if (!credReq) {
      return res.status(404).json({ error: 'Credential request not found' })
    }

    // Verify ownership via job
    const job = await getOwnedJob(credReq.jobId, req.userId!)
    if (!job) {
      return res.status(403).json({ error: 'Access denied' })
    }

    return res.json({
      id: credReq.id,
      jobId: credReq.jobId,
      userId: credReq.userId,
      integration: credReq.integration,
      label: credReq.label,
      purpose: credReq.purpose,
      fields: credReq.fields,
      status: credReq.status,
      expiresAt: credReq.expiresAt,
      providedAt: credReq.providedAt ?? null,
      skippedAt: credReq.skippedAt ?? null,
      createdAt: credReq.createdAt,
      // NOTE: No values field — values are never persisted
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get credential request'
    return res.status(500).json({ error: message })
  }
})

// ─── GET /api/preview/:jobId/status ──────────────────────────

previewRouter.get('/:jobId/status', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const job = await getOwnedJob(req.params.jobId, req.userId!)
    if (!job) {
      return res.status(404).json({ error: 'Job not found' })
    }

    const instance = getPreviewInstance(req.params.jobId)

    return res.json({
      jobId: job.id,
      // Core status
      status: job.status,
      currentStep: job.currentStep ?? null,
      progress: job.progress,
      // Failure info
      error: job.error ?? null,
      errorDetails: job.errorDetails ?? null,
      failureCategory: job.failureCategory ?? null,
      retryCount: job.retryCount,
      // Preview state (DB-persisted)
      previewUrl: job.previewUrl ?? null,
      previewPort: job.previewPort ?? null,
      previewPid: job.previewPid ?? null,
      previewStatus: job.previewStatus ?? null,
      dbPreviewStatus: job.previewStatus ?? null,   // alias for test/client consumers
      dbPreviewPort: job.previewPort ?? null,
      dbPreviewPid: job.previewPid ?? null,
      // Workspace + file metrics
      workspacePath: job.workspacePath ?? null,
      fileCount: job.fileCount ?? null,
      totalBytes: job.totalBytes ?? null,
      generatedFileCount: job.generatedFileCount ?? null,
      generatedTotalBytes: job.generatedTotalBytes ?? null,
      generatedKeyFiles: job.generatedKeyFiles ?? null,
      // Build metadata
      scaffoldValidation: job.scaffoldValidation ?? null,
      commandSummary: job.commandSummary ?? null,
      buildMeta: job.buildMeta ?? null,
      // Timing
      startedAt: job.startedAt ?? null,
      completedAt: job.completedAt ?? null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      // In-memory live state (null if process not running in this server instance)
      live: {
        status: instance?.status ?? null,
        pid: instance?.pid ?? null,
        port: instance?.port ?? null,
        url: instance?.url ?? null,
        startedAt: instance?.startedAt ?? null,
        installDurationMs: instance?.installDurationMs ?? null,
        startDurationMs: instance?.startDurationMs ?? null,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get preview status'
    return res.status(500).json({ error: message })
  }
})

// ─── POST /api/preview/:jobId/stop ───────────────────────────

previewRouter.post('/:jobId/stop', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const job = await getOwnedJob(req.params.jobId, req.userId!)
    if (!job) {
      return res.status(404).json({ error: 'Job not found' })
    }

    const stopped = stopPreview(req.params.jobId)

    await prisma.job.update({
      where: { id: req.params.jobId },
      data: { previewStatus: 'stopped' },
    })

    return res.json({
      success: true,
      stopped,
      message: stopped ? 'Preview process stopped' : 'No active preview found (may have already stopped)',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to stop preview'
    return res.status(500).json({ error: message })
  }
})

// ─── GET /api/preview/:jobId/health ──────────────────────────
// Query params:
//   ?restart=true  — if unhealthy, attempt Vite restart via checkPreviewHealth()

previewRouter.get('/:jobId/health', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const job = await getOwnedJob(req.params.jobId, req.userId!)
    if (!job) {
      return res.status(404).json({ error: 'Job not found' })
    }

    const allowRestart = req.query.restart === 'true'

    // Failed jobs: return failure info immediately without probing
    if (job.status === 'failed') {
      return res.json({
        healthy: false,
        statusCode: 0,
        restarted: false,
        previewUrl: job.previewUrl ?? null,
        dbStatus: job.status,
        previewStatus: job.previewStatus ?? null,
        failureCategory: job.failureCategory ?? null,
        error: job.error ?? null,
        liveStatus: null,
        reason: 'Job failed',
      })
    }

    if (job.previewStatus === 'stopped') {
      return res.json({
        healthy: false,
        statusCode: 0,
        restarted: false,
        previewUrl: job.previewUrl ?? null,
        dbStatus: job.status,
        previewStatus: 'stopped',
        failureCategory: null,
        error: null,
        liveStatus: null,
        reason: 'Preview has been stopped',
      })
    }

    const previewUrl = job.previewUrl
    if (!previewUrl) {
      return res.json({
        healthy: false,
        statusCode: 0,
        restarted: false,
        previewUrl: null,
        dbStatus: job.status,
        previewStatus: job.previewStatus ?? null,
        failureCategory: null,
        error: null,
        liveStatus: null,
        reason: 'No preview URL set for this job',
      })
    }

    // Probe via internal localhost URL (from in-memory instance) — avoids HTTPS round-trip
    const instance = getPreviewInstance(req.params.jobId)
    const probeUrl = instance?.url ?? null

    if (!probeUrl) {
      return res.json({
        healthy: false,
        statusCode: 0,
        restarted: false,
        previewUrl,
        dbStatus: job.status,
        previewStatus: job.previewStatus ?? null,
        failureCategory: null,
        error: null,
        liveStatus: null,
        reason: 'Preview process not running on this server instance',
      })
    }

    // If restart=true, delegate to checkPreviewHealth() which handles probe + restart
    if (allowRestart) {
      const { healthy, restarted } = await checkPreviewHealth(req.params.jobId)
      const updatedInstance = getPreviewInstance(req.params.jobId)
      return res.json({
        healthy,
        statusCode: healthy ? 200 : 0,
        restarted,
        previewUrl,
        dbStatus: job.status,
        previewStatus: job.previewStatus ?? null,
        failureCategory: job.failureCategory ?? null,
        error: job.error ?? null,
        liveStatus: updatedInstance?.status ?? null,
        reason: healthy ? null : 'Preview unhealthy after restart attempt',
      })
    }

    // Default: passive probe only (no restart)
    const statusCode = await new Promise<number>((resolve) => {
      const req2 = http.get(probeUrl, (r) => {
        r.resume()
        resolve(r.statusCode ?? 0)
      })
      req2.setTimeout(5000, () => { req2.destroy(); resolve(0) })
      req2.on('error', () => resolve(0))
    })

    const healthy = statusCode >= 200 && statusCode < 400

    return res.json({
      healthy,
      statusCode,
      restarted: false,
      previewUrl,
      dbStatus: job.status,
      previewStatus: job.previewStatus ?? null,
      failureCategory: job.failureCategory ?? null,
      error: job.error ?? null,
      liveStatus: instance?.status ?? null,
      reason: healthy ? null : `HTTP ${statusCode}`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Health check failed'
    return res.status(500).json({ error: message })
  }
})

// ─── GET /api/preview/:jobId/logs ────────────────────────────

previewRouter.get('/:jobId/logs', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const job = await getOwnedJob(req.params.jobId, req.userId!)
    if (!job) {
      return res.status(404).json({ error: 'Job not found' })
    }

    const rawLogs = Array.isArray(job.logs) ? job.logs : []
    const level = req.query.level as string | undefined
    const step  = req.query.step  as string | undefined
    const limit = Math.min(parseInt((req.query.limit as string) ?? '500', 10), 1000)

    const filtered = rawLogs.filter((entry: unknown) => {
      if (typeof entry !== 'object' || entry === null) return false
      const e = entry as Record<string, unknown>
      if (level && e.level !== level) return false
      if (step  && e.step  !== step)  return false
      return true
    })

    const sliced = filtered.slice(-limit)

    return res.json({
      jobId: job.id,
      status: job.status,
      total: rawLogs.length,
      filtered: filtered.length,
      returned: sliced.length,
      logs: sliced,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get logs'
    return res.status(500).json({ error: message })
  }
})

// ─── GET /api/preview/:jobId/app  (root)
// ─── GET /api/preview/:jobId/app/* (all paths)
// Public — no auth required (jobId provides obscurity; iframe needs direct access)
// Proxies to the local Vite dev server running on http://localhost:PORT

// Hop-by-hop headers must NOT be forwarded by proxies (RFC 7230 §6.1).
// Forwarding them (especially `connection`, `transfer-encoding`, `upgrade`)
// causes Node's http module to misframe the response and drop the connection,
// which manifests as `fetch failed` on the client.
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade',
])

function stripHopByHop(headers: Record<string, string | string[] | undefined>): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {}
  for (const [k, v] of Object.entries(headers)) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) out[k] = v
  }
  return out
}

function proxyToUrl(req: Request, res: Response, targetUrl: string): void {
  const forwardHeaders = {
    ...stripHopByHop(req.headers as Record<string, string | string[] | undefined>),
    'x-forwarded-for': req.ip ?? '',
    'x-forwarded-proto': 'https',
    // Explicit connection:close so vite doesn't try to keep-alive the proxy socket
    'connection': 'close',
  }

  const proxyReq = http.request(
    targetUrl,
    {
      method: req.method,
      headers: forwardHeaders,
    },
    (proxyRes) => {
      // Strip hop-by-hop from response headers too before forwarding to client
      const responseHeaders = stripHopByHop(proxyRes.headers as Record<string, string | string[] | undefined>)
      res.writeHead(proxyRes.statusCode ?? 200, responseHeaders)
      proxyRes.pipe(res, { end: true })
    }
  )

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).send('Preview proxy error: ' + err.message)
    }
  })

  // 60s timeout: vite's first request triggers full compilation which can take 20-40s
  // on a cold workspace. The health check in startPreview() only probes the root path
  // (fast redirect), so the first real page request may still need compilation time.
  proxyReq.setTimeout(60000, () => {
    proxyReq.destroy()
    if (!res.headersSent) {
      res.status(504).send('Preview proxy timeout')
    }
  })

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    req.pipe(proxyReq, { end: true })
  } else {
    proxyReq.end()
  }
}

function handlePreviewProxy(req: Request, res: Response): void {
  const { jobId } = req.params
  const subPath = (req.params as Record<string, string>)[0] ?? ''
  const queryString = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''

  const instance = getPreviewInstance(jobId)

  // ── Local instance path ───────────────────────────────────
  if (instance) {
    if (instance.status !== 'ready') {
      res.status(503).send(
        '<html><head><meta http-equiv="refresh" content="3"></head>' +
        '<body style="background:#09090b;color:#a1a1aa;font-family:monospace;padding:2rem">' +
        '<h2 style="color:#fbbf24">Preview starting...</h2>' +
        '<p>Status: ' + instance.status + '</p>' +
        '<p>This page will refresh automatically.</p>' +
        '</body></html>'
      )
      return
    }

    const port = instance.port
    // FIX: Must send the full base path to vite, not just '/'.
    // Vite is started with --base /api/preview/{jobId}/app/ so it redirects
    // any request to '/' back to the base path → infinite 302 redirect loop.
    // Sending the full path lets vite serve index.html directly.
    const targetPath = `/api/preview/${jobId}/app/${subPath}`
    const targetUrl = `http://localhost:${port}${targetPath}${queryString}`
    // Override host header for local proxy
    req.headers.host = `localhost:${port}`
    proxyToUrl(req, res, targetUrl)
    return
  }

  // ── Cross-server fallback: look up job's workerName and proxy ──
  // This handles the case where the preview is running on a different server.
  // We do a non-blocking DB lookup and proxy to the remote worker's preview endpoint.
  prisma.job.findUnique({
    where: { id: jobId },
    select: { workerName: true, previewUrl: true, previewStatus: true },
  }).then((job) => {
    if (!job) {
      res.status(503).send(
        '<html><body style="background:#09090b;color:#a1a1aa;font-family:monospace;padding:2rem">' +
        '<h2 style="color:#f87171">Preview not found</h2>' +
        '<p>The preview for this job is not running. It may have been stopped or expired.</p>' +
        '</body></html>'
      )
      return
    }

    if (job.previewStatus === 'stopped') {
      res.status(503).send(
        '<html><body style="background:#09090b;color:#a1a1aa;font-family:monospace;padding:2rem">' +
        '<h2 style="color:#f87171">Preview stopped</h2>' +
        '<p>This preview has been stopped.</p>' +
        '</body></html>'
      )
      return
    }

    const workerBaseUrl = job.workerName ? getWorkerBaseUrl(job.workerName) : null

    if (!workerBaseUrl) {
      // No remote worker URL — preview is not accessible
      res.status(503).send(
        `<html>
          <head>
            <title>Preview Unavailable | CoderXP</title>
            <style>
              body {
                background: #121215;
                color: #e8e8e8;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                margin: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
                text-align: center;
              }
              .card {
                background: #1D1D1D;
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 24px;
                padding: 40px;
                max-width: 400px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5);
              }
              .logo { height: 32px; margin-bottom: 24px; opacity: 0.8; }
              h2 { font-size: 18px; margin: 0 0 12px; color: #ffffff; }
              p { font-size: 13px; color: #a1a1aa; line-height: 1.6; margin: 0; }
              .badge { 
                display: inline-block; padding: 4px 12px; border-radius: 99px;
                background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
                font-size: 10px; font-weight: 600; text-transform: uppercase;
                letter-spacing: 0.05em; color: #71717a; margin-bottom: 20px;
              }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="badge">Builder Status</div>
              <img src="/logo-white.png" class="logo" alt="CoderXP" />
              <h2>Preview not ready</h2>
              <p>The preview environment is being prepared. ${
                job.workerName && job.workerName !== 'local'
                  ? `Routing to cluster "${job.workerName}"...`
                  : 'Starting internal worker...'
              }</p>
            </div>
          </body>
        </html>`
      )
      return
    }

    // Proxy to the remote worker's preview endpoint
    const targetPath = `/api/preview/${jobId}/app` + (subPath ? `/${subPath}` : '')
    const targetUrl = `${workerBaseUrl}${targetPath}${queryString}`
    console.log(`[Preview] Cross-server proxy: job ${jobId} → ${workerBaseUrl} (worker: ${job.workerName})`)
    proxyToUrl(req, res, targetUrl)
  }).catch((err) => {
    console.error('[Preview] Cross-server proxy DB lookup failed:', err)
    if (!res.headersSent) {
      res.status(500).send('Preview proxy error: DB lookup failed')
    }
  })
}

previewRouter.get('/:jobId/app', handlePreviewProxy)
previewRouter.get('/:jobId/app/*', handlePreviewProxy)

// ─── Backend API proxy ──────────────────────────────────────
// Proxies /api/preview/:jobId/backend/* to the Express backend server
// running on backendPort (vitePort + 1000). This lets the generated frontend
// make API calls through CoderXP's server without CORS issues.

function handleBackendProxy(req: Request, res: Response): void {
  const { jobId } = req.params
  const subPath = (req.params as Record<string, string>)[0] ?? ''
  const queryString = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''

  const instance = getPreviewInstance(jobId)
  if (!instance || !instance.backendPort) {
    res.status(503).json({ error: 'Backend not running for this preview' })
    return
  }

  const targetUrl = `http://localhost:${instance.backendPort}/${subPath}${queryString}`
  req.headers.host = `localhost:${instance.backendPort}`
  proxyToUrl(req, res, targetUrl)
}

previewRouter.all('/:jobId/backend/*', handleBackendProxy)
