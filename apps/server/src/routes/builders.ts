import { Router, Response } from 'express'
import { Prisma } from '@prisma/client'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { prisma } from '../lib/prisma'
import { io } from '../index'
import { getUserSocketIds } from '../socket/events'
import {
  VALID_BUILDER_TYPES,
  BUILDER_TYPES_CONFIG,
  builderSpecSchema,
  builderSpecToPlanOutput,
  buildSpecSummary,
  type BuilderType,
  type BuilderSpec,
} from '../services/builderSpec'
import { getDifyClient } from '../services/difyClient'

export const buildersRouter: Router = Router()

function sanitizeSession(session: {
  id: string
  userId: string
  projectId: string | null
  builderType: string
  status: string
  spec: unknown
  planId: string | null
  jobId: string | null
  createdAt: Date
  updatedAt: Date
  completedAt: Date | null
}) {
  return {
    id: session.id,
    builderType: session.builderType,
    status: session.status,
    projectId: session.projectId,
    planId: session.planId,
    jobId: session.jobId,
    specSummary: session.spec ? buildSpecSummary(session.spec as BuilderSpec) : null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    completedAt: session.completedAt,
  }
}

buildersRouter.get('/types', requireAuth, (_req: AuthRequest, res: Response) => {
  return res.json({ types: BUILDER_TYPES_CONFIG })
})

buildersRouter.post('/sessions', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { builderType } = req.body as { builderType?: string }

    if (!builderType || !VALID_BUILDER_TYPES.includes(builderType as BuilderType)) {
      return res.status(400).json({
        error: `Invalid builderType. Must be one of: ${VALID_BUILDER_TYPES.join(', ')}`,
      })
    }

    const session = await prisma.builderSession.create({
      data: {
        userId: req.userId!,
        builderType,
        status: 'in_progress',
      },
    })

    return res.status(201).json({ session: sanitizeSession(session) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create builder session'
    return res.status(500).json({ error: message })
  }
})

buildersRouter.get('/sessions/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const session = await prisma.builderSession.findUnique({
      where: { id: req.params.id },
    })

    if (!session || session.userId !== req.userId) {
      return res.status(404).json({ error: 'Session not found' })
    }

    return res.json({ session: sanitizeSession(session) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get session'
    return res.status(500).json({ error: message })
  }
})

buildersRouter.post('/sessions/:id/message', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const session = await prisma.builderSession.findUnique({
      where: { id: req.params.id },
    })

    if (!session || session.userId !== req.userId) {
      return res.status(404).json({ error: 'Session not found' })
    }

    if (session.status !== 'in_progress') {
      return res.status(409).json({
        error: `Session is not in progress (status: ${session.status}). Cannot send messages.`,
        status: session.status,
      })
    }

    const { message } = req.body as { message?: string }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'message is required and must be a non-empty string' })
    }

    const client = getDifyClient(session.builderType as BuilderType)
    const turn = await client.sendMessage(message.trim(), session.difyConversationId)

    const updateData: Record<string, unknown> = {
      difyConversationId: turn.conversationId,
      updatedAt: new Date(),
    }

    let specSummary = null

    if (turn.isComplete && turn.structuredOutput) {
      const rawSpec = {
        ...turn.structuredOutput,
        builderType: session.builderType,
        builderVersion: '1.0.0',
        sessionId: session.id,
      }

      const parseResult = builderSpecSchema.safeParse(rawSpec)

      if (!parseResult.success) {
        return res.status(422).json({
          error: 'Builder spec validation failed. The workflow output did not match the expected schema.',
          details: parseResult.error.flatten(),
        })
      }

      const validatedSpec: BuilderSpec = {
        ...parseResult.data,
        _difyRaw: turn.structuredOutput,
      }

      updateData.spec = validatedSpec as unknown as Record<string, unknown>
      updateData.status = 'spec_ready'
      specSummary = buildSpecSummary(validatedSpec)
    }

    await prisma.builderSession.update({
      where: { id: session.id },
      data: updateData,
    })

    return res.json({
      reply: turn.message,
      isComplete: turn.isComplete,
      turnNumber: turn.turnNumber,
      specSummary,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to process message'
    return res.status(500).json({ error: message })
  }
})

buildersRouter.post('/sessions/:id/approve', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const session = await prisma.builderSession.findUnique({
      where: { id: req.params.id },
    })

    if (!session || session.userId !== req.userId) {
      return res.status(404).json({ error: 'Session not found' })
    }

    if (session.status !== 'spec_ready') {
      return res.status(409).json({
        error: `Session cannot be approved (status: ${session.status}). Session must be in spec_ready state.`,
        status: session.status,
      })
    }

    if (!session.spec) {
      return res.status(409).json({
        error: 'Session has no validated spec. Complete the guided workflow first.',
      })
    }

    const spec = session.spec as unknown as BuilderSpec
    const planOutput = builderSpecToPlanOutput(spec)

    const project = await prisma.project.create({
      data: {
        userId: req.userId!,
        name: spec.projectName,
        description: spec.projectGoal,
        status: 'planning',
      },
    })

    const chat = await prisma.chat.create({
      data: {
        projectId: project.id,
        title: `${spec.projectName} — Builder`,
      },
    })

    const plan = await prisma.plan.create({
      data: {
        chatId: chat.id,
        projectId: project.id,
        summary: planOutput.summary,
        features: planOutput.features,
        techStack: planOutput.techStack as Prisma.InputJsonValue,
        frontendScope: planOutput.frontendScope,
        backendScope: planOutput.backendScope,
        integrations: planOutput.integrations,
        executionSteps: planOutput.executionSteps.map(step => ({
          order: step.order,
          title: step.title,
          label: step.title,
          description: step.description,
          estimatedDuration: step.estimatedDuration ?? null,
          status: 'pending',
        })),
        estimatedComplexity: planOutput.estimatedComplexity,
        status: 'pending_approval',
      },
    })

    await prisma.message.create({
      data: {
        chatId: chat.id,
        role: 'assistant',
        type: 'plan',
        content: `Here's the implementation plan for **${spec.projectName}**, generated from your guided builder session. Review and approve to start building.`,
        metadata: { planId: plan.id, fromBuilder: true, builderType: spec.builderType },
      },
    })

    const updatedSession = await prisma.builderSession.update({
      where: { id: session.id },
      data: {
        status: 'approved',
        projectId: project.id,
        planId: plan.id,
        completedAt: new Date(),
      },
    })

    const socketIds = getUserSocketIds(req.userId!)
    for (const socketId of socketIds) {
      io.to(socketId).emit('plan:created', plan)
    }

    return res.status(201).json({
      projectId: project.id,
      chatId: chat.id,
      planId: plan.id,
      session: sanitizeSession(updatedSession),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to approve session'
    return res.status(500).json({ error: message })
  }
})

buildersRouter.delete('/sessions/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const session = await prisma.builderSession.findUnique({
      where: { id: req.params.id },
    })

    if (!session || session.userId !== req.userId) {
      return res.status(404).json({ error: 'Session not found' })
    }

    if (session.status === 'abandoned' || session.status === 'complete') {
      return res.json({ session: sanitizeSession(session) })
    }

    const updated = await prisma.builderSession.update({
      where: { id: session.id },
      data: {
        status: 'abandoned',
        completedAt: new Date(),
      },
    })

    return res.json({ session: sanitizeSession(updated) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to abandon session'
    return res.status(500).json({ error: message })
  }
})
