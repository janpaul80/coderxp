/**
 * Jobs Routes — Phase 8 Slice 1
 *
 * GET /api/jobs/active — returns the authenticated user's most recent
 *                        non-terminal job for state rehydration on page refresh.
 *
 * "Non-terminal" = status NOT IN ['complete', 'failed', 'cancelled']
 * Returns { job: null } when no active job exists (not an error).
 */

import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { prisma } from '../lib/prisma'
import { JobStatus, type Prisma } from '@prisma/client'

// Prisma result type for Job with project included
type JobWithProject = Prisma.JobGetPayload<{
  include: { project: { select: { id: true; name: true; userId: true } } }
}>

export const jobsRouter: Router = Router()

// ─── Terminal statuses (job is done — no rehydration needed) ──

// Only statuses that exist in the Prisma JobStatus enum
const TERMINAL_STATUSES: JobStatus[] = [JobStatus.complete, JobStatus.failed]

// ─── GET /api/jobs/active ─────────────────────────────────────
// Returns the most recent non-terminal job across all of the user's projects.
// Used by the frontend `useRehydrateState` hook on page load to restore
// appMode / buildProgress / previewUrl without waiting for socket events.

jobsRouter.get('/active', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    // Find the most recent non-terminal job owned by this user
    const job = await prisma.job.findFirst({
      where: {
        project: { userId: req.userId! },
        status: { notIn: TERMINAL_STATUSES },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        project: { select: { id: true, name: true, userId: true } },
      },
    }) as JobWithProject | null

    if (!job) {
      return res.json({ job: null })
    }

    return res.json({
      job: {
        id: job.id,
        projectId: job.projectId,
        planId: job.planId,
        status: job.status,
        currentStep: job.currentStep ?? null,
        progress: job.progress,
        previewUrl: job.previewUrl ?? null,
        previewPort: job.previewPort ?? null,
        previewStatus: job.previewStatus ?? null,
        failureCategory: job.failureCategory ?? null,
        error: job.error ?? null,
        errorDetails: job.errorDetails ?? null,
        generatedFileCount: job.generatedFileCount ?? null,
        generatedTotalBytes: job.generatedTotalBytes ?? null,
        generatedKeyFiles: job.generatedKeyFiles ?? null,
        buildMeta: job.buildMeta ?? null,
        commandSummary: job.commandSummary ?? null,
        workspacePath: job.workspacePath ?? null,
        startedAt: job.startedAt ?? null,
        completedAt: job.completedAt ?? null,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        project: job.project,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get active job'
    return res.status(500).json({ error: message })
  }
})

// ─── GET /api/jobs/active/completed ──────────────────────────
// Returns the most recent COMPLETED job for the user.
// Used to restore PreviewView + BuildSummary after a page refresh
// when the build has already finished.

jobsRouter.get('/active/completed', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const job = await prisma.job.findFirst({
      where: {
        project: { userId: req.userId! },
        status: 'complete',
        previewUrl: { not: null },
      },
      orderBy: { completedAt: 'desc' },
      include: {
        project: { select: { id: true, name: true, userId: true } },
      },
    }) as JobWithProject | null

    if (!job) {
      return res.json({ job: null })
    }

    return res.json({
      job: {
        id: job.id,
        projectId: job.projectId,
        planId: job.planId,
        status: job.status,
        currentStep: job.currentStep ?? null,
        progress: job.progress,
        previewUrl: job.previewUrl ?? null,
        previewPort: job.previewPort ?? null,
        previewStatus: job.previewStatus ?? null,
        failureCategory: null,
        error: null,
        errorDetails: null,
        generatedFileCount: job.generatedFileCount ?? null,
        generatedTotalBytes: job.generatedTotalBytes ?? null,
        generatedKeyFiles: job.generatedKeyFiles ?? null,
        buildMeta: job.buildMeta ?? null,
        commandSummary: job.commandSummary ?? null,
        workspacePath: job.workspacePath ?? null,
        startedAt: job.startedAt ?? null,
        completedAt: job.completedAt ?? null,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        project: job.project,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get completed job'
    return res.status(500).json({ error: message })
  }
})
