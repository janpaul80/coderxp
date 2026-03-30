// @ts-nocheck — Prisma client requires `prisma generate` before type-checking
import { Router, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { requireAuth, AuthRequest } from '../middleware/auth'

export const router: Router = Router()
const prisma = new PrismaClient()

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
})

const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
})

// ─── List projects ────────────────────────────────────────────

router.get('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const projects = await prisma.project.findMany({
      where: { userId: req.userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { chats: true, jobs: true } },
      },
    })
    res.json(projects)
  } catch {
    res.status(500).json({ error: 'Failed to fetch projects' })
  }
})

// ─── Get project ──────────────────────────────────────────────

router.get('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.userId },
      include: {
        chats: { orderBy: { updatedAt: 'desc' }, take: 10 },
        jobs: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    })
    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }
    res.json(project)
  } catch {
    res.status(500).json({ error: 'Failed to fetch project' })
  }
})

// ─── Create project ───────────────────────────────────────────

router.post('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = createProjectSchema.parse(req.body)
    const project = await prisma.project.create({
      data: {
        userId: req.userId!,
        name: body.name,
        description: body.description,
      },
    })

    // Create default chat for the project
    await prisma.chat.create({
      data: { projectId: project.id },
    })

    res.status(201).json(project)
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    res.status(500).json({ error: 'Failed to create project' })
  }
})

// ─── Update project ───────────────────────────────────────────

router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = updateProjectSchema.parse(req.body)
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.userId },
    })
    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }
    const updated = await prisma.project.update({
      where: { id: req.params.id },
      data: body,
    })
    res.json(updated)
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    res.status(500).json({ error: 'Failed to update project' })
  }
})

// ─── Create chat for project ──────────────────────────────────

router.post('/:id/chats', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.userId },
    })
    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }
    const chat = await prisma.chat.create({
      data: {
        projectId: req.params.id,
        title: typeof req.body?.title === 'string' ? req.body.title : null,
      },
    })
    res.status(201).json({ chat })
  } catch {
    res.status(500).json({ error: 'Failed to create chat' })
  }
})

// ─── Delete project ───────────────────────────────────────────

router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.userId },
    })
    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }
    await prisma.project.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: 'Failed to delete project' })
  }
})

export { router as projectsRouter }
