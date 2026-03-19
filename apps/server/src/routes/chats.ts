// @ts-nocheck — Prisma client requires `prisma generate` before type-checking
import { Router, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router: Router = Router()
const prisma = new PrismaClient()

const sendMessageSchema = z.object({
  content: z.string().min(1).max(10000),
  type: z.enum(['text', 'approval_response', 'credential_request']).default('text'),
  metadata: z.record(z.unknown()).optional(),
})

const planActionSchema = z.object({
  action: z.enum(['approve', 'reject', 'modify']),
  reason: z.string().optional(),
  modifications: z.string().optional(),
})

const createTestPlanSchema = z.object({
  summary: z.string().min(5).max(5000),
  features: z.array(z.string().min(1)).optional().default([]),
  techStack: z.array(z.string().min(1)).optional().default([]),
  frontendScope: z.array(z.string().min(1)).optional().default([]),
  backendScope: z.array(z.string().min(1)).optional().default([]),
  integrations: z.array(z.string().min(1)).optional().default([]),
  executionSteps: z.array(z.string().min(1)).optional().default([]),
  estimatedComplexity: z.enum(['low', 'medium', 'high']).optional().default('medium'),
})

// ─── Get chats for project ────────────────────────────────────

router.get('/project/:projectId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params['projectId'], userId: req.userId },
    })
    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    const chats = await prisma.chat.findMany({
      where: { projectId: req.params['projectId'] },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { messages: true } },
      },
    })
    res.json(chats)
  } catch {
    res.status(500).json({ error: 'Failed to fetch chats' })
  }
})

// ─── Create message in chat ───────────────────────────────────

router.post('/:chatId/messages', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = sendMessageSchema.parse(req.body)

    const chat = await prisma.chat.findUnique({
      where: { id: req.params['chatId'] },
      include: { project: { select: { userId: true } } },
    })
    if (!chat || chat.project.userId !== req.userId) {
      res.status(404).json({ error: 'Chat not found' })
      return
    }

    const message = await prisma.message.create({
      data: {
        chatId: req.params['chatId'],
        role: 'user',
        type: body.type,
        content: body.content,
        metadata: body.metadata,
      },
    })

    await prisma.chat.update({
      where: { id: req.params['chatId'] },
      data: { updatedAt: new Date() },
    })

    res.status(201).json(message)
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    res.status(500).json({ error: 'Failed to create message' })
  }
})

// ─── Get messages for chat ────────────────────────────────────

router.get('/:chatId/messages', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const chat = await prisma.chat.findUnique({
      where: { id: req.params['chatId'] },
      include: { project: { select: { userId: true } } },
    })
    if (!chat || chat.project.userId !== req.userId) {
      res.status(404).json({ error: 'Chat not found' })
      return
    }

    const messages = await prisma.message.findMany({
      where: { chatId: req.params['chatId'] },
      orderBy: { createdAt: 'asc' },
      take: 100,
    })
    res.json(messages)
  } catch {
    res.status(500).json({ error: 'Failed to fetch messages' })
  }
})

// ─── Get plans for chat ───────────────────────────────────────

router.get('/:chatId/plans', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const chat = await prisma.chat.findUnique({
      where: { id: req.params['chatId'] },
      include: { project: { select: { userId: true } } },
    })
    if (!chat || chat.project.userId !== req.userId) {
      res.status(404).json({ error: 'Chat not found' })
      return
    }

    const plans = await prisma.plan.findMany({
      where: { chatId: req.params['chatId'] },
      orderBy: { createdAt: 'desc' },
    })
    res.json(plans)
  } catch {
    res.status(500).json({ error: 'Failed to fetch plans' })
  }
})

// ─── Create plan for chat (TEST-ONLY) ─────────────────────────
//
// Temporary authenticated endpoint used to unblock full Phase 2 E2E validation.
// Production flow should create plans via planner generation pipeline.
router.post('/:chatId/plans', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = createTestPlanSchema.parse(req.body)

    const chat = await prisma.chat.findUnique({
      where: { id: req.params['chatId'] },
      include: { project: { select: { userId: true } } },
    })

    if (!chat || chat.project.userId !== req.userId) {
      res.status(404).json({ error: 'Chat not found' })
      return
    }

    const plan = await prisma.plan.create({
      data: {
        chatId: req.params['chatId'],
        projectId: chat.projectId,
        summary: body.summary,
        features: body.features,
        techStack: body.techStack,
        frontendScope: body.frontendScope,
        backendScope: body.backendScope,
        integrations: body.integrations,
        executionSteps: body.executionSteps.map((label, index) => ({
          order: index + 1,
          label,
          status: 'pending',
        })),
        estimatedComplexity: body.estimatedComplexity,
        status: 'pending_approval',
      },
    })

    await prisma.chat.update({
      where: { id: req.params['chatId'] },
      data: { updatedAt: new Date() },
    })

    res.status(201).json(plan)
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    res.status(500).json({ error: 'Failed to create test plan' })
  }
})

// ─── Approve / reject / modify plan ──────────────────────────

router.post('/plans/:planId/action', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = planActionSchema.parse(req.body)

    const plan = await prisma.plan.findUnique({
      where: { id: req.params['planId'] },
      include: { chat: { include: { project: { select: { userId: true } } } } },
    })

    if (!plan || plan.chat.project.userId !== req.userId) {
      res.status(404).json({ error: 'Plan not found' })
      return
    }

    const updateData: Record<string, unknown> = {}

    if (body.action === 'approve') {
      updateData.status = 'approved'
      updateData.approvedAt = new Date()
    } else if (body.action === 'reject') {
      updateData.status = 'rejected'
      updateData.rejectedAt = new Date()
    } else if (body.action === 'modify') {
      updateData.status = 'modified'
      updateData.modifiedAt = new Date()
      updateData.modificationNote = body.modifications
    }

    const updated = await prisma.plan.update({
      where: { id: req.params['planId'] },
      data: updateData,
    })

    res.json(updated)
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    res.status(500).json({ error: 'Failed to update plan' })
  }
})

export { router as chatsRouter }
