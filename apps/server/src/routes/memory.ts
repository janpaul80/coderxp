/**
 * Memory Routes — Phase 7 Slice 1
 *
 * Exposes read/write access to the persistent memory layer.
 * All routes are auth-gated.
 *
 * GET  /api/memory/project/:projectId   — read project memory context
 * GET  /api/memory/user                 — read user memory context
 * GET  /api/memory/combined/:projectId  — read combined context (project + user)
 * POST /api/memory/project/:projectId/decision — append a decision record
 * DELETE /api/memory/project/:projectId        — clear project memory (dev/admin)
 */

import { Router, Response } from 'express'
import { z } from 'zod'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { prisma } from '../lib/prisma'
import {
  getProjectContext,
  getUserContext,
  getCombinedContext,
  getUserRules,
  upsertUserRule,
  deleteUserRule,
  getProjectRules,
  upsertProjectRule,
  deleteProjectRule,
  getRepoSnapshot,
  buildRepoContext,
  type DecisionRecord,
  type FailureRecord,
  type ProjectHistoryEntry,
  type StackPreference,
  type LastBuildMeta,
  type UserRule,
} from '../services/memory'

const router: Router = Router()

// ─── GET /api/memory/project/:projectId ──────────────────────
// Returns the full ProjectMemory record + rendered context string.

router.get('/project/:projectId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params

    // Ownership check
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: req.userId },
    })
    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    const memory = await prisma.projectMemory.findUnique({ where: { projectId } })

    const context = await getProjectContext(projectId, req.userId!)

    res.json({
      memory: memory ?? null,
      context,
      hasMemory: !!memory,
    })
  } catch (err) {
    console.error('[Memory Route] GET /project/:projectId error:', err)
    res.status(500).json({ error: 'Failed to read project memory' })
  }
})

// ─── GET /api/memory/user ─────────────────────────────────────
// Returns the full UserMemory record + rendered context string.

router.get('/user', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const memory = await prisma.userMemory.findUnique({ where: { userId: req.userId } })

    const context = await getUserContext(req.userId!)

    res.json({
      memory: memory ?? null,
      context,
      hasMemory: !!memory,
    })
  } catch (err) {
    console.error('[Memory Route] GET /user error:', err)
    res.status(500).json({ error: 'Failed to read user memory' })
  }
})

// ─── GET /api/memory/combined/:projectId ─────────────────────
// Returns combined project + user context string for orchestrator injection.

router.get('/combined/:projectId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params

    // Ownership check
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: req.userId },
    })
    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    const context = await getCombinedContext(projectId, req.userId!)

    res.json({
      context,
      hasContext: context.length > 0,
      projectId,
      userId: req.userId,
    })
  } catch (err) {
    console.error('[Memory Route] GET /combined/:projectId error:', err)
    res.status(500).json({ error: 'Failed to read combined memory context' })
  }
})

// ─── POST /api/memory/project/:projectId/decision ────────────
// Append a manual decision record to project memory.
// Useful for orchestrator-driven decisions outside the build flow.

const decisionSchema = z.object({
  type: z.enum(['plan_approved', 'plan_rejected', 'plan_modified', 'stack_confirmed', 'integration_added']),
  summary: z.string().min(1).max(200),
})

router.post('/project/:projectId/decision', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params
    const body = decisionSchema.parse(req.body)

    // Ownership check
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: req.userId },
    })
    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    const existing = await prisma.projectMemory.findUnique({ where: { projectId } })
    const decisions = ((existing?.decisions as unknown as DecisionRecord[]) ?? [])

    const newDecision: DecisionRecord = {
      at:      new Date().toISOString(),
      type:    body.type,
      summary: body.summary,
    }
    decisions.push(newDecision)
    const cappedDecisions = decisions.slice(-20)

    await prisma.projectMemory.upsert({
      where: { projectId },
      create: {
        projectId,
        userId:        req.userId!,
        decisions:     cappedDecisions as unknown as import('@prisma/client').Prisma.InputJsonValue,
        failureHistory: [] as unknown as import('@prisma/client').Prisma.InputJsonValue,
        integrations:   [] as unknown as import('@prisma/client').Prisma.InputJsonValue,
      },
      update: {
        decisions: cappedDecisions as unknown as import('@prisma/client').Prisma.InputJsonValue,
        version:   { increment: 1 },
      },
    })

    console.log(`[Memory Route] Decision appended for project ${projectId}: ${body.type} — ${body.summary}`)

    res.status(201).json({
      decision: newDecision,
      totalDecisions: cappedDecisions.length,
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    console.error('[Memory Route] POST /project/:projectId/decision error:', err)
    res.status(500).json({ error: 'Failed to append decision' })
  }
})

// ─── GET /api/memory/project/:projectId/summary ──────────────
// Returns a structured summary of what the system remembers about this project.
// Designed for orchestrator/UI consumption.

router.get('/project/:projectId/summary', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: req.userId },
      select: { id: true, name: true, status: true },
    })
    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    const memory = await prisma.projectMemory.findUnique({ where: { projectId } })

    if (!memory) {
      res.json({
        projectId,
        projectName: project.name,
        hasMemory: false,
        summary: null,
      })
      return
    }

    const decisions  = (memory.decisions     as unknown as DecisionRecord[])     ?? []
    const failures   = (memory.failureHistory as unknown as FailureRecord[])     ?? []
    const integrations = (memory.integrations as unknown as string[])            ?? []
    const stack      = (memory.preferredStack as unknown as StackPreference)     ?? null
    const lastBuild  = (memory.lastBuildMeta  as unknown as LastBuildMeta)       ?? null

    res.json({
      projectId,
      projectName:      project.name,
      hasMemory:        true,
      version:          memory.version,
      updatedAt:        memory.updatedAt,
      approvedDirection: memory.approvedDirection,
      authProvider:     memory.authProvider,
      integrations,
      preferredStack:   stack,
      lastBuildStatus:  memory.lastBuildStatus,
      lastBuildMeta:    lastBuild,
      decisionCount:    decisions.length,
      recentDecisions:  decisions.slice(-5),
      failureCount:     failures.length,
      unresolvedFailures: failures.filter(f => !f.fixed).length,
      recentFailures:   failures.slice(-3),
      summary:          memory.summary,
    })
  } catch (err) {
    console.error('[Memory Route] GET /project/:projectId/summary error:', err)
    res.status(500).json({ error: 'Failed to read project memory summary' })
  }
})

// ─── GET /api/memory/user/summary ────────────────────────────
// Returns a structured summary of what the system remembers about this user.

router.get('/user/summary', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const memory = await prisma.userMemory.findUnique({ where: { userId: req.userId } })

    if (!memory) {
      res.json({
        userId: req.userId,
        hasMemory: false,
        summary: null,
      })
      return
    }

    const history      = (memory.projectHistory    as unknown as ProjectHistoryEntry[]) ?? []
    const integrations = (memory.knownIntegrations as unknown as string[])              ?? []
    const stack        = (memory.preferredStack    as unknown as StackPreference)       ?? null

    res.json({
      userId:           req.userId,
      hasMemory:        true,
      version:          memory.version,
      updatedAt:        memory.updatedAt,
      preferredStack:   stack,
      knownIntegrations: integrations,
      projectCount:     history.length,
      completedProjects: history.filter(p => p.status === 'complete').length,
      failedProjects:   history.filter(p => p.status === 'failed').length,
      recentProjects:   history.slice(-5),
      summary:          memory.summary,
    })
  } catch (err) {
    console.error('[Memory Route] GET /user/summary error:', err)
    res.status(500).json({ error: 'Failed to read user memory summary' })
  }
})

// ─── DELETE /api/memory/project/:projectId ───────────────────
// Clear project memory. Dev/admin use only.

router.delete('/project/:projectId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: req.userId },
    })
    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    await prisma.projectMemory.deleteMany({ where: { projectId } })

    console.log(`[Memory Route] Cleared ProjectMemory for ${projectId}`)
    res.json({ success: true, projectId })
  } catch (err) {
    console.error('[Memory Route] DELETE /project/:projectId error:', err)
    res.status(500).json({ error: 'Failed to clear project memory' })
  }
})

// ─── GET /api/memory/snapshot/:projectId ─────────────────────
// S8: Returns the stored repo snapshot for a project.
// Used by tests and the orchestrator to verify snapshot storage.

router.get('/snapshot/:projectId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: req.userId },
    })
    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    const snapshot = await getRepoSnapshot(projectId)

    if (!snapshot) {
      res.json({
        hasSnapshot: false,
        snapshot: null,
        repoContext: null,
        projectId,
      })
      return
    }

    const repoContext = buildRepoContext(snapshot)

    res.json({
      hasSnapshot: true,
      snapshot,
      repoContext,
      projectId,
    })
  } catch (err) {
    console.error('[Memory Route] GET /snapshot/:projectId error:', err)
    res.status(500).json({ error: 'Failed to read repo snapshot' })
  }
})

// ─── Rules endpoints ──────────────────────────────────────────

const ruleSchema = z.object({
  id:       z.string().optional(),
  content:  z.string().min(1).max(500),
  category: z.enum(['stack', 'style', 'deploy', 'install', 'general']),
  active:   z.boolean().default(true),
})

// GET /api/memory/rules/user
router.get('/rules/user', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rules = await getUserRules(req.userId!)
    res.json({ rules })
  } catch (err) {
    console.error('[Memory Route] GET /rules/user error:', err)
    res.status(500).json({ error: 'Failed to read user rules' })
  }
})

// POST /api/memory/rules/user
router.post('/rules/user', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = ruleSchema.parse(req.body)
    const rule: UserRule = {
      id:        body.id ?? `rule_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      content:   body.content,
      category:  body.category,
      active:    body.active,
      createdAt: new Date().toISOString(),
    }
    await upsertUserRule(req.userId!, rule)
    res.status(201).json({ rule })
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    console.error('[Memory Route] POST /rules/user error:', err)
    res.status(500).json({ error: 'Failed to save user rule' })
  }
})

// DELETE /api/memory/rules/user/:ruleId
router.delete('/rules/user/:ruleId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { ruleId } = req.params
    await deleteUserRule(req.userId!, ruleId)
    res.json({ success: true, ruleId })
  } catch (err) {
    console.error('[Memory Route] DELETE /rules/user/:ruleId error:', err)
    res.status(500).json({ error: 'Failed to delete user rule' })
  }
})

// GET /api/memory/rules/project/:projectId
router.get('/rules/project/:projectId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params
    const project = await prisma.project.findFirst({ where: { id: projectId, userId: req.userId } })
    if (!project) { res.status(404).json({ error: 'Project not found' }); return }
    const rules = await getProjectRules(projectId)
    res.json({ rules })
  } catch (err) {
    console.error('[Memory Route] GET /rules/project/:projectId error:', err)
    res.status(500).json({ error: 'Failed to read project rules' })
  }
})

// POST /api/memory/rules/project/:projectId
router.post('/rules/project/:projectId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params
    const project = await prisma.project.findFirst({ where: { id: projectId, userId: req.userId } })
    if (!project) { res.status(404).json({ error: 'Project not found' }); return }
    const body = ruleSchema.parse(req.body)
    const rule: UserRule = {
      id:        body.id ?? `rule_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      content:   body.content,
      category:  body.category,
      active:    body.active,
      createdAt: new Date().toISOString(),
    }
    await upsertProjectRule(projectId, req.userId!, rule)
    res.status(201).json({ rule })
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    console.error('[Memory Route] POST /rules/project/:projectId error:', err)
    res.status(500).json({ error: 'Failed to save project rule' })
  }
})

// DELETE /api/memory/rules/project/:projectId/:ruleId
router.delete('/rules/project/:projectId/:ruleId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId, ruleId } = req.params
    const project = await prisma.project.findFirst({ where: { id: projectId, userId: req.userId } })
    if (!project) { res.status(404).json({ error: 'Project not found' }); return }
    await deleteProjectRule(projectId, ruleId)
    res.json({ success: true, ruleId })
  } catch (err) {
    console.error('[Memory Route] DELETE /rules/project/:projectId/:ruleId error:', err)
    res.status(500).json({ error: 'Failed to delete project rule' })
  }
})

export { router as memoryRouter }
