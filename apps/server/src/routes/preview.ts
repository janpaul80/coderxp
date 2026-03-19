/**
 * Preview Routes — Phase 5 Slice 2
 *
 * GET  /api/preview/:jobId/status           — enriched preview status + all metadata
 * POST /api/preview/:jobId/stop             — stop the preview process
 * GET  /api/preview/:jobId/health           — live health check + failure info
 * GET  /api/preview/:jobId/logs             — structured build logs from DB
 * POST /api/preview/test/inject-failure-job — DEV ONLY: inject a job that will fail
 */

import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { prisma } from '../lib/prisma'
import { Prisma } from '@prisma/client'
import {
  getPreviewInstance,
  stopPreview,
  getActivePreviewsSummary,
} from '../services/previewManager'
import { builderQueue } from '../jobs/builderQueue'
import { selectWorker } from '../services/workerRouter'
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

previewRouter.get('/:jobId/health', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const job = await getOwnedJob(req.params.jobId, req.userId!)
    if (!job) {
      return res.status(404).json({ error: 'Job not found' })
    }

    // Failed jobs: return failure info immediately without probing
    if (job.status === 'failed') {
      return res.json({
        healthy: false,
        statusCode: 0,
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
        previewUrl: null,
        dbStatus: job.status,
        previewStatus: job.previewStatus ?? null,
        failureCategory: null,
        error: null,
        liveStatus: null,
        reason: 'No preview URL set for this job',
      })
    }

    // Probe the preview URL
    const statusCode = await new Promise<number>((resolve) => {
      const req2 = http.get(previewUrl, (r) => {
        r.resume()
        resolve(r.statusCode ?? 0)
      })
      req2.setTimeout(5000, () => { req2.destroy(); resolve(0) })
      req2.on('error', () => resolve(0))
    })

    const healthy = statusCode >= 200 && statusCode < 400
    const instance = getPreviewInstance(req.params.jobId)

    return res.json({
      healthy,
      statusCode,
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
