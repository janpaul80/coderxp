// @ts-nocheck — Prisma client requires `prisma generate` before type-checking
/**
 * Planner Routes
 *
 * POST /api/planner/generate  — Generate a plan from a user prompt
 * POST /api/planner/refine    — Refine an existing plan with modifications
 * GET  /api/planner/status    — LLM availability status
 */

import { Router, Response } from 'express'
import { z } from 'zod'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { prisma } from '../lib/prisma'
import {
  classifyIntent,
  generatePlan,
  generateClarification,
  generateGreeting,
  savePlannerRun,
  planOutputSchema,
  PLANNER_VERSION,
  LLMUnavailableError,
  LLMParseError,
  analyzeError,
} from '../services/planner'
import { getProviderStatus, ProviderError } from '../lib/providers'
import { getUserRules, getProjectRules, buildRulesBlock, getRepoSnapshot, buildRepoContext } from '../services/memory'

const router = Router()

// ─── Schemas ──────────────────────────────────────────────────

const generateSchema = z.object({
  // chatId is optional — when omitted the default chat for the project is used
  chatId: z.string().min(1).optional(),
  projectId: z.string().min(1),
  // accept both 'userRequest' (canonical) and 'message' (convenience alias)
  userRequest: z.string().min(1).max(10000).optional(),
  message: z.string().min(1).max(10000).optional(),
  chatHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional().default([]),
}).refine(d => !!(d.userRequest || d.message), {
  message: 'Either userRequest or message is required',
  path: ['userRequest'],
})

const refineSchema = z.object({
  planId: z.string().min(1),
  modifications: z.string().min(1).max(5000),
  chatHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional().default([]),
})

// ─── POST /api/planner/classify ──────────────────────────────
// Lightweight intent classification — no plan generated.
// Used by tests and the frontend to preview how a message will be routed.

router.post('/classify', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { message: msg, userRequest } = req.body ?? {}
    const text = (typeof userRequest === 'string' ? userRequest : null)
      ?? (typeof msg === 'string' ? msg : null)
    if (!text || text.trim().length === 0) {
      res.status(400).json({ error: 'message or userRequest is required' })
      return
    }
    const intent = await classifyIntent(text.trim())
    res.json({ intent })
  } catch (err) {
    console.error('[Planner] Classify error:', err)
    res.status(500).json({ error: 'Classification failed' })
  }
})

// ─── GET /api/planner/status ──────────────────────────────────

router.get('/status', (_req, res: Response) => {
  const status = getProviderStatus()
  const available = status.openrouter.available || status.openclaw.available || status.blackbox.available
  res.json({
    available,
    plannerVersion: PLANNER_VERSION,
    mode: available ? 'real' : 'fallback',
    providers: status,
  })
})

// ─── POST /api/planner/generate ───────────────────────────────

router.post('/generate', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = generateSchema.parse(req.body)

    // Resolve the effective user request (canonical field or alias)
    const userRequest = (body.userRequest ?? body.message)!

    // Resolve chatId — use provided value or fall back to the project's default chat
    let resolvedChatId = body.chatId
    if (!resolvedChatId) {
      const defaultChat = await prisma.chat.findFirst({
        where: { projectId: body.projectId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, project: { select: { userId: true } } },
      })
      if (!defaultChat) {
        res.status(404).json({ error: 'No chat found for project — create one first' })
        return
      }
      if (defaultChat.project.userId !== req.userId) {
        res.status(404).json({ error: 'Chat not found' })
        return
      }
      resolvedChatId = defaultChat.id
    } else {
      // Verify chat ownership when chatId is explicitly provided
      const chat = await prisma.chat.findUnique({
        where: { id: resolvedChatId },
        include: { project: { select: { userId: true, id: true } } },
      })
      if (!chat || chat.project.userId !== req.userId) {
        res.status(404).json({ error: 'Chat not found' })
        return
      }
    }

    // Classify intent first
    const intent = await classifyIntent(userRequest)

    // Handle non-build intents
    if (intent === 'greeting') {
      const response = await generateGreeting()
      const message = await prisma.message.create({
        data: {
          chatId: resolvedChatId,
          role: 'assistant',
          type: 'text',
          content: response,
        },
      })
      res.json({ intent, message, plan: null })
      return
    }

    if (intent === 'clarification_needed' || intent === 'question') {
      const response = await generateClarification(userRequest)
      const message = await prisma.message.create({
        data: {
          chatId: resolvedChatId,
          role: 'assistant',
          type: 'text',
          content: response,
        },
      })
      res.json({ intent, message, plan: null })
      return
    }

    // Fetch rules and build rulesContext for system prompt injection
    const [userRules, projectRules] = await Promise.all([
      getUserRules(req.userId!),
      getProjectRules(body.projectId),
    ])
    const rulesContext = buildRulesBlock(userRules, projectRules) || undefined

    // Build request — generate plan
    // S8-6: Fetch repo snapshot to inject workspace awareness into planning.
    // Non-fatal — if no snapshot exists yet, repoContext is simply omitted.
    let planRepoContext: string | undefined
    try {
      const planSnapshot = await getRepoSnapshot(body.projectId)
      if (planSnapshot) planRepoContext = buildRepoContext(planSnapshot)
    } catch { /* non-fatal */ }

    const { plan: planOutput, metadata } = await generatePlan({
      userRequest,
      repoContext: planRepoContext,
      chatHistory: body.chatHistory,
      rulesContext,
    })

    // Persist the plan
    const plan = await prisma.plan.create({
      data: {
        chatId: resolvedChatId,
        projectId: body.projectId,
        summary: planOutput.summary,
        features: planOutput.features,
        techStack: planOutput.techStack as any,
        frontendScope: planOutput.frontendScope,
        backendScope: planOutput.backendScope,
        integrations: planOutput.integrations,
        executionSteps: planOutput.executionSteps.map(step => ({
          order: step.order,
          title: step.title,
          label: step.title,
          description: step.description,
          estimatedDuration: step.estimatedDuration,
          status: 'pending',
        })),
        estimatedComplexity: planOutput.estimatedComplexity,
        status: 'pending_approval',
      },
    })

    // Persist planner metadata
    await savePlannerRun({
      chatId: resolvedChatId,
      projectId: body.projectId,
      planId: plan.id,
      userRequest,
      metadata,
    })

    // Add assistant message referencing the plan
    const message = await prisma.message.create({
      data: {
        chatId: resolvedChatId,
        role: 'assistant',
        type: 'plan',
        content: "Here's the implementation plan I've created for your project. Review it carefully and approve to start building.",
        metadata: { planId: plan.id },
      },
    })

    // Update chat timestamp
    await prisma.chat.update({
      where: { id: resolvedChatId },
      data: { updatedAt: new Date() },
    })

    res.status(201).json({
      intent,
      plan,
      message,
      metadata: {
        plannerVersion: metadata.plannerVersion,
        provider: metadata.provider,
        model: metadata.model,
        durationMs: metadata.durationMs,
        parseSuccess: metadata.parseSuccess,
      },
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    if (err instanceof ProviderError) {
      if (err.code === 'NO_PROVIDER' || err.code === 'NO_API_KEY' || err.code === 'DISABLED') {
        res.status(503).json({
          error: 'AI planner not available',
          message: err.message,
          mode: 'fallback',
          hint: 'Set OPEN_ROUTER_API_KEY in .env.local to enable real AI planning',
        })
        return
      }
      if (err.code === 'PARSE_ERROR') {
        res.status(502).json({
          error: 'AI planner returned invalid response',
          message: 'The AI model returned a response that could not be parsed. Please try again.',
        })
        return
      }
    }
    console.error('[Planner] Generate error:', err)
    res.status(500).json({ error: 'Plan generation failed' })
  }
})

// ─── POST /api/planner/refine ─────────────────────────────────

router.post('/refine', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = refineSchema.parse(req.body)

    // Verify plan ownership
    const existingPlan = await prisma.plan.findUnique({
      where: { id: body.planId },
      include: { chat: { include: { project: { select: { userId: true } } } } },
    })
    if (!existingPlan || existingPlan.chat.project.userId !== req.userId) {
      res.status(404).json({ error: 'Plan not found' })
      return
    }

    // Generate refined plan
    const originalSummary = typeof existingPlan.summary === 'string' ? existingPlan.summary : ''
    const { plan: planOutput, metadata } = await generatePlan({
      userRequest: `${originalSummary}. Modifications requested: ${body.modifications}`,
      chatHistory: body.chatHistory,
    })

    // Create new plan version
    const refinedPlan = await prisma.plan.create({
      data: {
        chatId: existingPlan.chatId,
        projectId: existingPlan.projectId,
        summary: planOutput.summary,
        features: planOutput.features,
        techStack: planOutput.techStack as any,
        frontendScope: planOutput.frontendScope,
        backendScope: planOutput.backendScope,
        integrations: planOutput.integrations,
        executionSteps: planOutput.executionSteps.map(step => ({
          order: step.order,
          title: step.title,
          label: step.title,
          description: step.description,
          estimatedDuration: step.estimatedDuration,
          status: 'pending',
        })),
        estimatedComplexity: planOutput.estimatedComplexity,
        status: 'pending_approval',
        modificationNote: body.modifications,
      },
    })

    // Mark original as modified
    await prisma.plan.update({
      where: { id: body.planId },
      data: { status: 'modified', modifiedAt: new Date(), modificationNote: body.modifications },
    })

    // Persist metadata
    await savePlannerRun({
      chatId: existingPlan.chatId,
      projectId: existingPlan.projectId,
      planId: refinedPlan.id,
      userRequest: body.modifications,
      metadata,
    })

    res.status(201).json({
      plan: refinedPlan,
      metadata: {
        plannerVersion: metadata.plannerVersion,
        provider: metadata.provider,
        model: metadata.model,
        durationMs: metadata.durationMs,
        parseSuccess: metadata.parseSuccess,
      },
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    if (err instanceof ProviderError && (err.code === 'NO_PROVIDER' || err.code === 'NO_API_KEY')) {
      res.status(503).json({ error: 'AI planner not available', message: err.message })
      return
    }
    console.error('[Planner] Refine error:', err)
    res.status(500).json({ error: 'Plan refinement failed' })
  }
})

router.post('/test/maxclaw', requireAuth, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { complete } = await import('../lib/providers')
    const result = await complete({
      role: 'maxclaw',
      systemPrompt: 'You are a coding assistant. Reply briefly.',
      userPrompt: 'Return exactly MAXCLAW_OK',
      temperature: 0,
      maxTokens: 64,
    })
    res.json({ ok: true, provider: result.provider, model: result.model, content: result.content, durationMs: result.durationMs })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ ok: false, error: message })
  }
})

router.post('/test/fallback', requireAuth, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { complete } = await import('../lib/providers')
    const result = await complete({
      role: 'planner',
      systemPrompt: 'Reply briefly.',
      userPrompt: 'Return exactly FALLBACK_OK',
      temperature: 0,
      maxTokens: 64,
      overrides: {
        forceProvider: 'langdock',
        disableLangdock: false,
        openRouterApiKey: '',
        blackboxKeys: [],
      },
    })
    res.json({
      ok: true,
      provider: result.provider,
      model: result.model,
      content: result.content,
      durationMs: result.durationMs,
      forced: {
        forceProvider: 'langdock',
        openRouterDisabled: true,
        blackboxDisabled: true,
        langdockEnabled: true,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ ok: false, error: message })
  }
})

router.post('/test/blackbox-rotation', requireAuth, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { complete } = await import('../lib/providers')
    const original = process.env.BLACKBOX_KEYS ?? process.env.VITE_BLACKBOX_KEYS ?? ''
    const keys = original.split(',').map(k => k.trim()).filter(Boolean)
    if (keys.length < 2) {
      res.status(400).json({ ok: false, error: 'Need at least 2 Blackbox keys for rotation test' })
      return
    }

    const result = await complete({
      role: 'planner',
      systemPrompt: 'Reply briefly.',
      userPrompt: 'Return exactly BLACKBOX_ROTATION_OK',
      temperature: 0,
      maxTokens: 64,
      overrides: {
        forceProvider: 'blackbox',
        openRouterApiKey: '',
        disableLangdock: true,
        blackboxKeys: ['invalid-key-0001', ...keys.slice(1)],
      },
    })
    res.json({
      ok: true,
      provider: result.provider,
      model: result.model,
      content: result.content,
      durationMs: result.durationMs,
      forced: {
        forceProvider: 'blackbox',
        openRouterDisabled: true,
        langdockDisabled: true,
        forcedFirstKey: 'invalid-key-0001',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ ok: false, error: message })
  }
})

// ─── POST /api/planner/test/analyze-error ────────────────────
// S9 E2E test endpoint — calls analyzeError() with a provided error string.
// Auth-gated. Works in production (no sensitive side-effects).
// Returns the full ErrorAnalysis object + which path was used (llm | heuristic).

router.post('/test/analyze-error', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { rawError } = req.body ?? {}
    if (!rawError || typeof rawError !== 'string' || rawError.trim().length === 0) {
      res.status(400).json({ error: 'rawError (string) is required' })
      return
    }
    const t0 = Date.now()
    const analysis = await analyzeError(rawError.trim())
    const durationMs = Date.now() - t0
    res.json({
      ok: true,
      analysis,
      durationMs,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Planner] analyze-error test endpoint error:', err)
    res.status(500).json({ ok: false, error: message })
  }
})

export { router as plannerRouter }
