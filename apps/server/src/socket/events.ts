/**
 * Socket Events — Phase 3 / Phase 6 / Phase 7
 *
 * chat:send            → AI planner classifies intent, generates plan or response
 * plan:approve         → Validates one-active-build, queues real builder job
 * plan:reject          → Marks plan rejected, persists
 * plan:modify          → Triggers plan refinement via AI planner
 * job:cancel           → Cancels active job
 * job:repair           → Re-queues a failed job for autonomous repair
 * credentials:provide  → User provides credential values (in-memory only, never persisted)
 * credentials:skip     → User skips credential request (builder continues without)
 * browser:approve      → User approves a pending browser session
 * browser:deny         → User denies a pending browser session
 * browser:terminate    → User terminates an active browser session
 */

import { Server, Socket } from 'socket.io'
import { Prisma, MessageType } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { verifyToken } from '../middleware/auth'
import { builderQueue } from '../jobs/builderQueue'
import { selectWorker } from '../services/workerRouter'
import { resolveCredential, skipCredential } from '../services/credentialService'
import { registerBrowserEvents } from './browserEvents'
import {
  classifyIntent,
  generatePlan,
  generateClarification,
  generateGreeting,
  generateRepairResponse,
  generateConversationalResponse,
  savePlannerRun,
  PLANNER_VERSION,
  LLMUnavailableError,
  LLMParseError,
} from '../services/planner'
import { isProviderAvailable } from '../lib/providers'
import {
  getCombinedContext,
  recordPlanApproved,
} from '../services/memory'

// ─── Active job statuses (used for one-active-build + concurrent limit guards) ──

const ACTIVE_JOB_STATUSES = [
  'queued', 'initializing', 'installing',
  'generating_frontend', 'generating_backend',
  'wiring_auth', 'wiring_integrations',
  'running', 'testing',
  'installing_deps', 'starting_preview', 'repairing',
] as const

// ─── Socket user map ──────────────────────────────────────────

const userSockets = new Map<string, Set<string>>() // userId → Set<socketId>

function addUserSocket(userId: string, socketId: string) {
  if (!userSockets.has(userId)) userSockets.set(userId, new Set())
  userSockets.get(userId)!.add(socketId)
}

function removeUserSocket(userId: string, socketId: string) {
  userSockets.get(userId)?.delete(socketId)
}

export function getUserSocketIds(userId: string): string[] {
  return Array.from(userSockets.get(userId) ?? [])
}

// ─── Register events ──────────────────────────────────────────

export function registerSocketEvents(io: Server) {
  // ── Auth middleware ─────────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined
    if (!token) return next(new Error('Authentication required'))
    const payload = verifyToken(token)
    if (!payload) return next(new Error('Invalid token'))
    socket.data.userId = payload.userId
    socket.data.email = payload.email
    next()
  })

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string
    addUserSocket(userId, socket.id)
    console.log(`[Socket] User ${userId} connected (${socket.id})`)
    socket.join(`user:${userId}`)

    // ── Browser control events ────────────────────────────
    registerBrowserEvents(socket, userId, io)

    // ── chat:send ─────────────────────────────────────────
    socket.on('chat:send', async ({ chatId, content, fileIds }: {
      chatId: string
      content: string
      fileIds?: string[]
    }) => {
      try {
        // Verify chat ownership
        const chat = await prisma.chat.findUnique({
          where: { id: chatId },
          include: { project: { select: { userId: true, id: true } } },
        })
        if (!chat || chat.project.userId !== userId) {
          socket.emit('error', { message: 'Chat not found', code: 'CHAT_NOT_FOUND' })
          return
        }

        // Persist user message
        const userMessage = await prisma.message.create({
          data: {
            chatId,
            role: 'user',
            type: 'text',
            content,
            metadata: fileIds?.length ? { fileIds } : undefined,
          },
        })

        // Echo user message back
        socket.emit('chat:message', userMessage)

        // Emit typing indicator
        socket.emit('chat:typing', { typing: true })

        // Fetch recent chat history for context
        const recentMessages = await prisma.message.findMany({
          where: { chatId, role: { in: ['user', 'assistant'] } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        })
        const chatHistory = recentMessages
          .reverse()
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

        // ── Real AI path ──────────────────────────────────
        // Gate on the multi-provider system (OpenRouter / OpenClaw / Blackbox / Langdock)
        // NOT on the legacy OpenAI-only isLLMAvailable() check.
        const anyProviderAvailable =
          isProviderAvailable('openrouter') ||
          isProviderAvailable('openclaw') ||
          isProviderAvailable('blackbox') ||
          isProviderAvailable('langdock')
        if (anyProviderAvailable) {
          // Load memory context (non-blocking read — empty string if no memory yet)
          const memoryContext = await getCombinedContext(chat.project.id, userId)
          await handleWithAI(socket, userId, chatId, chat.project.id, content, chatHistory, memoryContext)
        } else {
          // ── Fallback path (no API key) ────────────────
          await handleFallback(socket, chatId, content)
        }

        // Stop typing indicator
        socket.emit('chat:typing', { typing: false })

        // Update chat timestamp
        await prisma.chat.update({
          where: { id: chatId },
          data: { updatedAt: new Date() },
        })
      } catch (err) {
        socket.emit('chat:typing', { typing: false })
        console.error('[Socket] chat:send error:', err)
        socket.emit('error', { message: 'Failed to process message', code: 'CHAT_ERROR' })
      }
    })

    // ── plan:approve ──────────────────────────────────────
    socket.on('plan:approve', async ({ planId, projectId }: { planId: string; projectId: string }) => {
      try {
        // Verify plan ownership
        const plan = await prisma.plan.findUnique({
          where: { id: planId },
          include: { chat: { include: { project: { select: { userId: true } } } } },
        })
        if (!plan || plan.chat.project.userId !== userId) {
          socket.emit('error', { message: 'Plan not found', code: 'PLAN_NOT_FOUND' })
          return
        }

        // ── Enforce one active build per project ──────────
        const activeJob = await prisma.job.findFirst({
          where: { projectId, status: { in: [...ACTIVE_JOB_STATUSES] } },
        })
        if (activeJob) {
          socket.emit('error', {
            message: 'A build is already in progress for this project. Cancel it before starting a new one.',
            code: 'BUILD_ALREADY_ACTIVE',
            activeJobId: activeJob.id,
          })
          return
        }

        // ── Enforce max 2 concurrent jobs per user ────────
        const userActiveJobCount = await prisma.job.count({
          where: {
            project: { userId },
            status: { in: [...ACTIVE_JOB_STATUSES] },
          },
        })
        if (userActiveJobCount >= 2) {
          socket.emit('error', {
            message: 'You already have 2 active builds. Wait for one to complete before starting another.',
            code: 'MAX_CONCURRENT_JOBS',
          })
          return
        }

        // Mark plan approved
        await prisma.plan.update({
          where: { id: planId },
          data: { status: 'approved', approvedAt: new Date() },
        })

        // Record plan approval in memory (async/non-blocking)
        void recordPlanApproved(projectId, userId, {
          summary: typeof plan.summary === 'string' ? plan.summary : '',
          techStack: (plan.techStack as Record<string, unknown>) ?? {},
          integrations: Array.isArray(plan.integrations) ? plan.integrations as string[] : [],
        })

        // Create job record
        const job = await prisma.job.create({
          data: {
            projectId,
            planId,
            status: 'queued',
          },
        })

        // Update project status
        await prisma.project.update({
          where: { id: projectId },
          data: { status: 'building' },
        })

        // Emit job created
        socket.emit('job:created', job)

        // Select worker (primary → failover → local) and dispatch
        const selection = selectWorker(builderQueue!)
        await prisma.job.update({
          where: { id: job.id },
          data: {
            workerName: selection.workerName,
            workerSelectedReason: selection.selectedReason,
          },
        })
        await selection.queue.add('build', {
          jobId: job.id,
          projectId,
          planId,
          userId,
          socketId: socket.id,
        })

        console.log(
          `[Socket] Build job ${job.id} queued on ${selection.queueName} ` +
          `(worker: ${selection.workerName}, reason: ${selection.selectedReason})`
        )
      } catch (err) {
        console.error('[Socket] plan:approve error:', err)
        socket.emit('error', { message: 'Failed to start build', code: 'BUILD_ERROR' })
      }
    })

    // ── plan:reject ───────────────────────────────────────
    socket.on('plan:reject', async ({ planId, reason }: { planId: string; reason?: string }) => {
      try {
        const plan = await prisma.plan.findUnique({
          where: { id: planId },
          include: { chat: { include: { project: { select: { userId: true } } } } },
        })
        if (!plan || plan.chat.project.userId !== userId) return

        await prisma.plan.update({
          where: { id: planId },
          data: { status: 'rejected', rejectedAt: new Date() },
        })
        socket.emit('plan:updated', { id: planId, status: 'rejected', reason })
      } catch {
        socket.emit('error', { message: 'Failed to reject plan', code: 'PLAN_ERROR' })
      }
    })

    // ── plan:modify ───────────────────────────────────────
    socket.on('plan:modify', async ({ planId, modifications }: { planId: string; modifications: string }) => {
      try {
        const plan = await prisma.plan.findUnique({
          where: { id: planId },
          include: { chat: { include: { project: { select: { userId: true, id: true } } } } },
        })
        if (!plan || plan.chat.project.userId !== userId) return

        // Mark original as modified
        await prisma.plan.update({
          where: { id: planId },
          data: { status: 'modified', modifiedAt: new Date(), modificationNote: modifications },
        })

        socket.emit('chat:typing', { typing: true })

        const anyProviderAvailableForModify =
          isProviderAvailable('openrouter') ||
          isProviderAvailable('openclaw') ||
          isProviderAvailable('blackbox') ||
          isProviderAvailable('langdock')

        if (anyProviderAvailableForModify) {
          // Generate refined plan via AI
          try {
            const originalSummary = typeof plan.summary === 'string' ? plan.summary : ''
            const { plan: planOutput, metadata } = await generatePlan({
              userRequest: `${originalSummary}. Modifications: ${modifications}`,
            })

            const refinedPlan = await prisma.plan.create({
              data: {
                chatId: plan.chatId,
                projectId: plan.chat.project.id,
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
                  status: 'pending',
                })),
                estimatedComplexity: planOutput.estimatedComplexity,
                status: 'pending_approval',
                modificationNote: modifications,
              },
            })

            await savePlannerRun({
              chatId: plan.chatId,
              projectId: plan.chat.project.id,
              planId: refinedPlan.id,
              userRequest: modifications,
              metadata,
            })

            // Add assistant message
            const message = await prisma.message.create({
              data: {
                chatId: plan.chatId,
                role: 'assistant',
                type: 'plan',
                content: `I've revised the plan based on your feedback: "${modifications}"`,
                metadata: { planId: refinedPlan.id },
              },
            })

            socket.emit('plan:created', refinedPlan)
            socket.emit('chat:message', { ...message, metadata: { planId: refinedPlan.id, plan: refinedPlan } })
          } catch (err) {
            console.error('[Socket] plan:modify AI error:', err)
            socket.emit('plan:updated', { id: planId, status: 'modified' })
          }
        } else {
          socket.emit('plan:updated', { id: planId, status: 'modified' })
        }

        socket.emit('chat:typing', { typing: false })
      } catch {
        socket.emit('chat:typing', { typing: false })
        socket.emit('error', { message: 'Failed to modify plan', code: 'PLAN_ERROR' })
      }
    })

    // ── job:repair ────────────────────────────────────────
    // Re-queues a failed job for autonomous repair without re-approving the plan.
    // Resets error state, preserves repairAttemptCount (accumulates across re-queues).
    socket.on('job:repair', async ({ jobId }: { jobId: string }) => {
      try {
        const job = await prisma.job.findUnique({
          where: { id: jobId },
          include: { project: { select: { userId: true } } },
        })
        if (!job || job.project.userId !== userId) {
          socket.emit('error', { message: 'Job not found', code: 'JOB_NOT_FOUND' })
          return
        }
        if (job.status !== 'failed') {
          socket.emit('error', {
            message: `Job is not in a failed state (current: ${job.status})`,
            code: 'JOB_NOT_FAILED',
          })
          return
        }
        if (!builderQueue) {
          socket.emit('error', { message: 'Builder queue not available', code: 'QUEUE_UNAVAILABLE' })
          return
        }

        // Reset job to queued — clear error fields, preserve repairAttemptCount
        const updatedJob = await prisma.job.update({
          where: { id: jobId },
          data: {
            status: 'queued',
            error: null,
            errorDetails: null,
            failureCategory: null,
            previewStatus: null,
            startedAt: null,
            completedAt: null,
          },
        })

        // Select worker and re-queue
        const selection = selectWorker(builderQueue)
        await prisma.job.update({
          where: { id: jobId },
          data: {
            workerName: selection.workerName,
            workerSelectedReason: selection.selectedReason,
          },
        })
        await selection.queue.add('build', {
          jobId,
          projectId: job.projectId,
          planId: job.planId ?? '',
          userId,
          socketId: socket.id,
        })

        socket.emit('job:updated', { ...updatedJob, status: 'queued' })
        console.log(
          `[Socket] Job ${jobId} re-queued for repair by user ${userId} ` +
          `(worker: ${selection.workerName}, reason: ${selection.selectedReason})`
        )
      } catch (err) {
        console.error('[Socket] job:repair error:', err)
        socket.emit('error', { message: 'Failed to repair job', code: 'REPAIR_ERROR' })
      }
    })

    // ── credentials:provide ───────────────────────────────
    // User provides credential values for a pending request.
    // Values are passed in-memory only — never written to DB.
    socket.on('credentials:provide', async ({
      requestId,
      values,
    }: {
      requestId: string
      values: Record<string, string>
    }) => {
      try {
        // Verify ownership and pending status
        const credReq = await prisma.credentialRequest.findUnique({
          where: { id: requestId },
        })
        if (!credReq || credReq.userId !== userId) {
          socket.emit('error', { message: 'Credential request not found', code: 'CREDENTIAL_NOT_FOUND' })
          return
        }
        if (credReq.status !== 'pending') {
          socket.emit('error', {
            message: `Credential request is no longer pending (status: ${credReq.status})`,
            code: 'CREDENTIAL_NOT_PENDING',
          })
          return
        }
        if (new Date() > credReq.expiresAt) {
          await prisma.credentialRequest.update({
            where: { id: requestId },
            data: { status: 'expired' },
          })
          socket.emit('error', { message: 'Credential request has expired', code: 'CREDENTIAL_EXPIRED' })
          return
        }

        // Update DB status (metadata only — no values stored)
        await prisma.credentialRequest.update({
          where: { id: requestId },
          data: { status: 'provided', providedAt: new Date() },
        })

        // Resolve in-memory promise — values flow directly to builder
        const resolved = resolveCredential(requestId, values)
        if (!resolved) {
          // Resolver already timed out — that's OK, DB is updated
          console.warn(`[Socket] credentials:provide — resolver already gone for ${requestId}`)
        }

        socket.emit('credentials:provided', { requestId })
        console.log(`[Socket] Credentials provided for request ${requestId} by user ${userId}`)
      } catch (err) {
        console.error('[Socket] credentials:provide error:', err)
        socket.emit('error', { message: 'Failed to provide credentials', code: 'CREDENTIAL_ERROR' })
      }
    })

    // ── credentials:skip ──────────────────────────────────
    // User skips a credential request — builder continues without credentials.
    socket.on('credentials:skip', async ({ requestId }: { requestId: string }) => {
      try {
        const credReq = await prisma.credentialRequest.findUnique({
          where: { id: requestId },
        })
        if (!credReq || credReq.userId !== userId) {
          socket.emit('error', { message: 'Credential request not found', code: 'CREDENTIAL_NOT_FOUND' })
          return
        }
        if (credReq.status !== 'pending') {
          socket.emit('error', {
            message: `Credential request is no longer pending (status: ${credReq.status})`,
            code: 'CREDENTIAL_NOT_PENDING',
          })
          return
        }

        // Update DB status
        await prisma.credentialRequest.update({
          where: { id: requestId },
          data: { status: 'skipped', skippedAt: new Date() },
        })

        // Resolve with empty values — builder handles gracefully
        skipCredential(requestId)

        socket.emit('credentials:skipped', { requestId })
        console.log(`[Socket] Credentials skipped for request ${requestId} by user ${userId}`)
      } catch (err) {
        console.error('[Socket] credentials:skip error:', err)
        socket.emit('error', { message: 'Failed to skip credentials', code: 'CREDENTIAL_ERROR' })
      }
    })

    // ── job:cancel ────────────────────────────────────────
    socket.on('job:cancel', async ({ jobId }: { jobId: string }) => {
      try {
        const job = await prisma.job.findUnique({
          where: { id: jobId },
          include: { project: { select: { userId: true } } },
        })
        if (!job || job.project.userId !== userId) return

        await prisma.job.update({
          where: { id: jobId },
          data: { status: 'failed', error: 'Cancelled by user' },
        })
        await prisma.project.update({
          where: { id: job.projectId },
          data: { status: 'draft' },
        })
        socket.emit('job:failed', { jobId, error: { code: 'CANCELLED', message: 'Build cancelled' } })
      } catch {
        socket.emit('error', { message: 'Failed to cancel job', code: 'JOB_ERROR' })
      }
    })

    // ── Disconnect ────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      removeUserSocket(userId, socket.id)
      console.log(`[Socket] User ${userId} disconnected: ${reason}`)
    })
  })
}

// ─── AI message handler ───────────────────────────────────────

async function handleWithAI(
  socket: Socket,
  userId: string,
  chatId: string,
  projectId: string,
  content: string,
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  memoryContext: string = ''
) {
  const intent = await classifyIntent(content)

  switch (intent) {
    case 'greeting': {
      const response = await generateGreeting()
      await persistAndEmitAssistantMessage(socket, chatId, response, 'text')
      return
    }

    case 'clarification_needed': {
      const response = await generateClarification(content)
      await persistAndEmitAssistantMessage(socket, chatId, response, 'text')
      return
    }

    // Gap 5: conversational questions get a direct answer — no plan generated
    case 'question': {
      const response = await generateConversationalResponse(content, chatHistory)
      await persistAndEmitAssistantMessage(socket, chatId, response, 'text')
      return
    }

    // Gap 4: complaint/fix request — check for existing job context, route to repair
    case 'fix_request': {
      const recentJob = await prisma.job.findFirst({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true },
      })

      const jobStatus = recentJob?.status ?? undefined
      const response = await generateRepairResponse(content, jobStatus)
      await persistAndEmitAssistantMessage(socket, chatId, response, 'text')

      // If the most recent job failed, suggest a repair so the UI can show the Repair button
      if (recentJob && recentJob.status === 'failed') {
        socket.emit('job:repair_suggested', { jobId: recentJob.id, reason: content })
      }
      return
    }

    default:
      break
  }

  if (intent === 'build_request' || intent === 'modification') {
    try {
      const { plan: planOutput, metadata } = await generatePlan({
        userRequest: content,
        chatHistory,
        memoryContext: memoryContext || undefined,
      })

      const plan = await prisma.plan.create({
        data: {
          chatId,
          projectId,
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

      await savePlannerRun({
        chatId,
        projectId,
        planId: plan.id,
        userRequest: content,
        metadata,
      })

      const message = await prisma.message.create({
        data: {
          chatId,
          role: 'assistant',
          type: 'plan',
          content: "Here's the implementation plan I've created for your project. Review it carefully and approve to start building.",
          metadata: { planId: plan.id },
        },
      })

      // Emit plan:created so frontend transitions to awaiting_approval
      socket.emit('plan:created', plan)
      // Include full plan in message metadata so PlanCard can render without a fetch
      socket.emit('chat:message', { ...message, metadata: { planId: plan.id, plan } })

      console.log(`[Socket] AI plan ${plan.id} created for chat ${chatId} (${metadata.durationMs}ms, model=${metadata.model})`)
    } catch (err) {
      if (err instanceof LLMUnavailableError) {
        await persistAndEmitAssistantMessage(socket, chatId,
          "I'm unable to generate a plan right now — the AI service is not configured. Please contact support.",
          'text'
        )
      } else if (err instanceof LLMParseError) {
        await persistAndEmitAssistantMessage(socket, chatId,
          "I had trouble generating a plan for that request. Could you rephrase or add more detail?",
          'text'
        )
      } else {
        throw err
      }
    }
  }
}

// ─── Fallback handler (no LLM key) ───────────────────────────

async function handleFallback(socket: Socket, chatId: string, content: string) {
  const lower = content.toLowerCase().trim()

  // Simple heuristic responses when no AI key is configured
  let response: string

  const greetings = ['hello', 'hi', 'hey', 'yo', 'sup']
  if (greetings.some(g => lower === g || lower === g + '!')) {
    response = "Hey! I'm CodedXP — your autonomous app builder. Tell me what you want to build and I'll plan, code, and deploy it for you.\n\n*Note: AI planning is in fallback mode. Set OPENAI_API_KEY to enable real AI planning.*"
  } else {
    response = "I received your message. To enable real AI-powered planning, please configure the OPENAI_API_KEY environment variable on the server.\n\nIn the meantime, you can use the demo mode in the browser without a backend connection."
  }

  await persistAndEmitAssistantMessage(socket, chatId, response, 'text')
}

// ─── Helper: persist + emit assistant message ─────────────────

async function persistAndEmitAssistantMessage(
  socket: Socket,
  chatId: string,
  content: string,
  type: string
) {
  const message = await prisma.message.create({
    data: {
      chatId,
      role: 'assistant',
      type: type as MessageType,
      content,
    },
  })
  socket.emit('chat:message', message)
  return message
}
