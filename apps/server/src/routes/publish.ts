/**
 * Publish Routes — Sprint 20
 *
 * POST /api/publish/:jobId/archive    — Create a downloadable zip of the workspace
 * POST /api/publish/:jobId/github     — Push workspace to GitHub
 * POST /api/publish/:jobId/vercel     — Deploy workspace to Vercel
 *
 * All routes are auth-gated and verify job ownership.
 */

import { Router, Response } from 'express'
import path from 'path'
import fs from 'fs'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { prisma } from '../lib/prisma'
import {
  createWorkspaceArchive,
  pushToGitHub,
  deployToVercel,
} from '../services/publishService'
import { emitReleaseStatus } from '../agents'

export const publishRouter: Router = Router()

// ─── Helper: get owned completed job with workspace ──────────

async function getCompletedJob(jobId: string, userId: string) {
  const job = await prisma.job.findFirst({
    where: { id: jobId },
    include: { project: { select: { userId: true, name: true } } },
  })
  if (!job || job.project.userId !== userId) return null
  if (job.status !== 'complete') return null
  if (!job.workspacePath || !fs.existsSync(job.workspacePath)) return null
  return job
}

// ─── POST /api/publish/:jobId/archive ────────────────────────
// Creates a .tar.gz archive of the workspace and returns a download URL.

publishRouter.post('/:jobId/archive', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const job = await getCompletedJob(req.params.jobId, req.userId!)
    if (!job) {
      return res.status(404).json({ error: 'Completed job with workspace not found' })
    }

    const uploadsDir = path.join(process.cwd(), 'uploads')
    fs.mkdirSync(uploadsDir, { recursive: true })

    emitReleaseStatus('validating', 'Preparing workspace archive...', { jobId: job.id, target: 'archive' })

    const result = await createWorkspaceArchive(job.workspacePath!, job.id, uploadsDir)

    if (!result.success) {
      emitReleaseStatus('failed', `Archive failed: ${result.error}`, { jobId: job.id, target: 'archive' })
      return res.status(500).json({ error: result.error })
    }

    emitReleaseStatus('ready', 'Archive ready for download', { jobId: job.id, target: 'archive', sizeBytes: result.sizeBytes })

    return res.json({
      success: true,
      downloadUrl: result.downloadUrl,
      sizeBytes: result.sizeBytes,
      projectName: job.project.name,
      jobId: job.id,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Archive failed'
    emitReleaseStatus('failed', `Archive error: ${message}`, { target: 'archive' })
    return res.status(500).json({ error: message })
  }
})

// ─── POST /api/publish/:jobId/github ─────────────────────────
// Pushes the workspace to a GitHub repository.
// Body: { githubToken, repoName, isPrivate?, description? }

publishRouter.post('/:jobId/github', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const job = await getCompletedJob(req.params.jobId, req.userId!)
    if (!job) {
      return res.status(404).json({ error: 'Completed job with workspace not found' })
    }

    const { githubToken, repoName, isPrivate, description } = req.body as {
      githubToken?: string
      repoName?: string
      isPrivate?: boolean
      description?: string
    }

    if (!githubToken) {
      return res.status(400).json({
        error: 'GitHub personal access token is required',
        hint: 'Create a token at https://github.com/settings/tokens with "repo" scope',
      })
    }

    if (!repoName) {
      return res.status(400).json({
        error: 'Repository name is required',
        hint: 'Provide a repoName like "my-coderxp-app"',
      })
    }

    emitReleaseStatus('deploying', `Pushing to GitHub: ${repoName}...`, { jobId: job.id, target: 'github', repoName })

    const result = await pushToGitHub(job.workspacePath!, {
      githubToken,
      repoName,
      isPrivate: isPrivate ?? true,
      description: description ?? `${job.project.name} — built with CoderXP`,
    })

    if (!result.success) {
      emitReleaseStatus('failed', `GitHub push failed: ${result.error}`, { jobId: job.id, target: 'github' })
      return res.status(500).json({ error: result.error })
    }

    emitReleaseStatus('deployed', `Pushed to GitHub: ${result.repoUrl}`, { jobId: job.id, target: 'github', repoUrl: result.repoUrl, branch: result.branch })

    return res.json({
      success: true,
      repoUrl: result.repoUrl,
      branch: result.branch,
      commitSha: result.commitSha,
      projectName: job.project.name,
      jobId: job.id,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'GitHub push failed'
    emitReleaseStatus('failed', `GitHub error: ${message}`, { target: 'github' })
    return res.status(500).json({ error: message })
  }
})

// ─── POST /api/publish/:jobId/vercel ─────────────────────────
// Deploys the workspace to Vercel.
// Body: { vercelToken, projectName?, teamId? }

publishRouter.post('/:jobId/vercel', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const job = await getCompletedJob(req.params.jobId, req.userId!)
    if (!job) {
      return res.status(404).json({ error: 'Completed job with workspace not found' })
    }

    const { vercelToken, projectName, teamId } = req.body as {
      vercelToken?: string
      projectName?: string
      teamId?: string
    }

    if (!vercelToken) {
      return res.status(400).json({
        error: 'Vercel token is required',
        hint: 'Create a token at https://vercel.com/account/tokens',
      })
    }

    // Default project name from the CoderXP project name, slugified
    const slug = (projectName ?? job.project.name)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'coderxp-app'

    emitReleaseStatus('deploying', `Deploying to Vercel: ${slug}...`, { jobId: job.id, target: 'vercel', projectName: slug })

    const result = await deployToVercel(job.workspacePath!, {
      vercelToken,
      projectName: slug,
      teamId,
    })

    if (!result.success) {
      emitReleaseStatus('failed', `Vercel deploy failed: ${result.error}`, { jobId: job.id, target: 'vercel' })
      return res.status(500).json({ error: result.error })
    }

    emitReleaseStatus('deployed', `Deployed to Vercel: ${result.deploymentUrl}`, { jobId: job.id, target: 'vercel', deploymentUrl: result.deploymentUrl, deploymentId: result.deploymentId })

    return res.json({
      success: true,
      deploymentUrl: result.deploymentUrl,
      projectUrl: result.projectUrl,
      deploymentId: result.deploymentId,
      status: result.status,
      projectName: slug,
      jobId: job.id,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Vercel deploy failed'
    emitReleaseStatus('failed', `Vercel error: ${message}`, { target: 'vercel' })
    return res.status(500).json({ error: message })
  }
})
