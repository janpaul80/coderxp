

/**
 * Builder Queue — Phase 4 hardening + Sprint 10-14 improvements
 *
 * AI-driven file generation + real preview runtime + structured telemetry
 * + integration self-healing (S14-1).
 */

import * as fs from 'fs'
import * as nodePath from 'path'
import { execSync } from 'child_process'
import { Queue, Worker, Job, ConnectionOptions } from 'bullmq'
import { JobStatus, Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { io } from '../index'
import { getUserSocketIds } from '../socket/events'
import {
  createWorkspace,
  getWorkspaceFileTree,
  getWorkspaceTotalBytes,
  validateWorkspaceFiles,
} from '../services/workspace'
import {
  generateProjectFiles,
  repairProjectFiles,
  parseDynamicPages,
  type CodeGenProject,
  type CodeGenCallbacks,
} from '../services/codeGenerator'
import { generateRepairPlan, analyzeError } from '../services/planner'
import {
  startPreview,
  PKG_MANAGER,
  type PreviewLogEntry,
  type PreviewTelemetryCallbacks,
} from '../services/previewManager'
import {
  appendJobLog,
  classifyFailure,
  setJobStep,
  sanitizeCommandSummary,
  type BuildLogStep,
  type CommandSummary,
} from '../services/buildTelemetry'
import {
  recordBuildComplete,
  recordBuildFailed,
  writeWorkspaceMemoryFile,
  getCombinedContext,
  getUserRules,
  getProjectRules,
  buildRulesBlock,
  storeRepoSnapshot,
  getRepoSnapshot,
  buildRepoContext,
} from '../services/memory'
import { indexWorkspace } from '../services/workspaceIndexer'
import {
  emitAgentStatus,
  emitPipelineStatus,
  emitFileChange,
  type AgentRole,
} from '../agents'
import {
  registerCredentialResolver,
  cancelCredentialResolver,
  CREDENTIAL_TIMEOUT_MS,
} from '../services/credentialService'
import {
  validateAllIntegrations,
  generateIntegrationErrorContext,
} from '../services/integrationValidation'
import {
  calculateQualityMetrics,
  shouldTriggerRepair,
  generateRepairContext,
} from '../services/codeQualityMetrics'
import {
  recordBuildOutcome,
  getLearningState,
  getQualityTrend,
  shouldUseAggressiveRepair,
} from '../services/buildHistory'
import {
  runAutonomousTests,
  type TestEngineReport,
} from '../services/testEngine'
import {
  runSecurityAudit,
  type SecurityAuditReport,
} from '../services/securityAudit'
import {
  generateProductIntelligence,
  buildProductIntelligenceContext,
} from '../services/productIntelligence'
import {
  designSchema,
  renderPrismaSchema,
  detectSchemaEvolution,
  generateMigrationInstructions,
  generateSeedData,
  analyzeQueries,
  generateRLSPolicies,
  buildDatabaseContext,
  type SchemaDesign,
} from '../services/databaseArchitect'

import {
  pluginRegistry,
  executeHooks,
  collectPromptExtensions,
  collectPluginDependencies,
  collectPluginFileTemplates,
  buildPluginStatusContext,
  type PluginManifest,
  type PluginHookContext,
} from '../services/pluginSystem'

import {
  detectCodeSmells,
  generateRefactorPlans,
  analyzeOutdatedDeps,
  detectApplicableMigrations,
  buildRefactorContext,
} from '../services/refactorAgent'

import {
  parsePreviewErrors,
  buildPreviewRepairContext,
  getAffectedFiles,
  hasDependencyErrors,
} from '../services/previewErrorParser'

// ─── Redis connection ─────────────────────────────────────────

const redisConnection: ConnectionOptions = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  maxRetriesPerRequest: null,  // BullMQ requires null — it manages retries internally
  enableOfflineQueue: true,    // Buffer commands during brief Redis disconnects
  connectTimeout: 10000,
  retryStrategy(times: number) {
    return Math.min(times * 500, 5000)  // Retry with backoff up to 5s
  },
}

// ─── Queue ────────────────────────────────────────────────────

let queueInstance: Queue | null = null
try {
  queueInstance = new Queue('builder', {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 1,           // No auto-retry — user must explicitly request repair
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  })
  console.log('[Builder] Queue initialized successfully')
} catch (err) {
  console.error('[Builder] Failed to initialize queue:', err)
}

export const builderQueue = queueInstance

// ─── Stale job cleanup on startup ────────────────────────────
// When the server restarts, BullMQ may still have jobs queued in Redis from a
// previous session. These orphaned jobs would auto-execute against stale/missing
// workspaces, causing builds to fire on page load with no user input.
// This function drains leftover Redis jobs and marks non-terminal Postgres jobs
// as failed so they don't auto-trigger.

export async function cleanupStaleJobsOnStartup(): Promise<void> {
  try {
    // ── Step 1: Drain leftover BullMQ jobs from Redis ──────────
    if (queueInstance) {
      const waiting = await queueInstance.getWaiting()
      const delayed = await queueInstance.getDelayed()
      const staleJobs = [...waiting, ...delayed]

      if (staleJobs.length > 0) {
        console.log(`[Builder] Cleaning up ${staleJobs.length} stale BullMQ job(s) from Redis...`)
        for (const job of staleJobs) {
          try {
            await job.remove()
          } catch {
            // Job may have already been picked up — ignore
          }
        }
        console.log(`[Builder] Stale BullMQ jobs removed`)
      }
    }

    // ── Step 2: Mark orphaned non-terminal Postgres jobs as failed ──
    // Any job stuck in a non-terminal state from a previous server session
    // will never complete. Mark them failed so useRehydrateState doesn't
    // restore a "Building" view for a dead build.
    const STALE_THRESHOLD_MS = 30 * 60 * 1000 // 30 minutes
    const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS)

    const orphanedJobs = await prisma.job.findMany({
      where: {
        status: {
          in: [
            'queued', 'initializing', 'installing',
            'generating_frontend', 'generating_backend',
            'wiring_auth', 'wiring_integrations',
            'running', 'testing', 'installing_deps',
            'starting_preview', 'repairing',
          ] as JobStatus[],
        },
        updatedAt: { lt: cutoff },
      },
      select: { id: true, status: true, projectId: true, updatedAt: true },
    })

    if (orphanedJobs.length > 0) {
      console.log(`[Builder] Marking ${orphanedJobs.length} orphaned job(s) as failed (stale > 30 min)...`)
      await prisma.job.updateMany({
        where: { id: { in: orphanedJobs.map(j => j.id) } },
        data: {
          status: 'failed' as JobStatus,
          error: 'Server restarted — build was orphaned and could not continue.',
          failureCategory: 'server_restart',
        },
      })
      console.log(`[Builder] Orphaned jobs marked as failed`)
    }
  } catch (err) {
    console.warn('[Builder] Stale job cleanup failed (non-fatal):', err instanceof Error ? err.message : err)
  }
}

// ─── Socket helpers ───────────────────────────────────────────

function emitToUser(userId: string, event: string, data: unknown) {
  const socketIds = getUserSocketIds(userId)
  socketIds.forEach((id) => io.to(id).emit(event, data))
}

function emitProgress(
  userId: string,
  jobId: string,
  status: string,
  label: string,
  progress: number,
  logs: unknown[],
  workspacePath?: string | null,
) {
  emitToUser(userId, 'job:updated', {
    id: jobId,
    status,
    currentStep: label,
    progress,
    logs,
    workspacePath: workspacePath ?? null,
  })
}

function emitLog(userId: string, jobId: string, log: unknown) {
  emitToUser(userId, 'job:log', { jobId, log })
}

// ─── Agent status bridge ─────────────────────────────────────
// Maps build phases to agent roles and emits agent:status events
// so the frontend AgentStatusPanel stays in sync with the real build.

const BUILD_STEP_TO_AGENT: Record<string, AgentRole> = {
  workspace_prepare: 'installer',
  scaffold_generate: 'installer',
  files_write: 'frontend',
  install_deps: 'installer',
  preview_start: 'deploy',
  preview_healthcheck: 'qa',
  repair: 'fixer',
  complete: 'deploy',
}

function emitBuildAgentStatus(step: string, status: 'running' | 'complete' | 'error') {
  const agent = BUILD_STEP_TO_AGENT[step]
  if (agent) {
    emitAgentStatus(agent, status, `${agent}: ${step} ${status}`)
  }
}

function emitBuildFileChange(filePath: string, agent: AgentRole, action: 'created' | 'modified') {
  emitFileChange(action, filePath, agent, `${action}: ${filePath}`)
}

// ─── Log factory ──────────────────────────────────────────────

interface BuildSocketLog {
  id: string
  timestamp: string
  type: 'create' | 'write' | 'validate' | 'info' | 'success' | 'error' | 'run'
  /** Normalized level for useSocket.ts normalizeLogLevel() */
  level: 'info' | 'warn' | 'error' | 'success'
  /** Build phase step for useSocket.ts */
  step: string
  message: string
  filePath?: string
  bytes?: number
  source?: string
}

let logSeq = 0
function makeLog(
  jobId: string,
  type: BuildSocketLog['type'],
  message: string,
  step: string,
  filePath?: string,
  bytes?: number,
  source?: string
): BuildSocketLog {
  logSeq++
  const level: BuildSocketLog['level'] =
    type === 'error' ? 'error'
    : type === 'success' ? 'success'
    : 'info'
  return {
    id: `${jobId}-log-${logSeq}`,
    timestamp: new Date().toISOString(),
    type,
    level,
    step,
    message,
    filePath,
    bytes,
    source,
  }
}

// ─── Section completeness validator (Gap 6) ──────────────────

const SECTION_FILE_PATTERNS: Array<{ keywords: string[]; filePatterns: string[] }> = [
  { keywords: ['pricing', 'price'],          filePatterns: ['pricing', 'Pricing'] },
  { keywords: ['footer'],                    filePatterns: ['footer', 'Footer'] },
  { keywords: ['hero'],                      filePatterns: ['hero', 'Hero', 'landing', 'Landing', 'Home', 'home'] },
  { keywords: ['features', 'feature'],       filePatterns: ['features', 'Features', 'feature', 'Feature'] },
  { keywords: ['testimonial'],               filePatterns: ['testimonial', 'Testimonial'] },
  { keywords: ['contact', 'cta'],            filePatterns: ['contact', 'Contact', 'cta', 'CTA'] },
  { keywords: ['navbar', 'navigation', 'nav bar', 'nav'],
                                             filePatterns: ['navbar', 'NavBar', 'nav', 'Nav', 'header', 'Header'] },
  { keywords: ['login', 'sign in'],          filePatterns: ['login', 'Login', 'signin', 'SignIn'] },
  { keywords: ['register', 'sign up', 'signup'],
                                             filePatterns: ['register', 'Register', 'signup', 'SignUp'] },
  { keywords: ['dashboard'],                 filePatterns: ['dashboard', 'Dashboard'] },
  { keywords: ['about'],                     filePatterns: ['about', 'About'] },
  { keywords: ['settings'],                  filePatterns: ['settings', 'Settings'] },
]

function validateSectionCompleteness(
  frontendScope: string[],
  fileTree: string[]
): string[] {
  const missing: string[] = []

  for (const scopeItem of frontendScope) {
    const lower = scopeItem.toLowerCase()

    const patternGroup = SECTION_FILE_PATTERNS.find(p =>
      p.keywords.some(k => lower.includes(k))
    )
    if (!patternGroup) continue

    const hasFile = fileTree.some(filePath =>
      patternGroup.filePatterns.some(pattern => filePath.includes(pattern))
    )

    if (!hasFile) {
      missing.push(scopeItem)
    }
  }

  return missing
}

// ─── Worker ───────────────────────────────────────────────────

let workerInstance: Worker | null = null
try {
  if (queueInstance) {
    workerInstance = new Worker(
      'builder',
      async (job: Job) => {
        const { jobId, projectId, planId, userId, injectFailAt } = job.data as {
          jobId: string
          projectId: string
          planId: string
          userId: string
          injectFailAt?: string
        }

        logSeq = 0
        const allLogs: BuildSocketLog[] = []
        const retryCount = Math.max(job.attemptsMade ?? 0, 0)
        let currentPhase = 'initializing'

        // Hoisted so catch block can access for memory writes
        let planRecord: { summary: unknown } | null = null
        let projectRecord: { name: string } | null = null
        // Hoisted workspace path — set after createWorkspace(), used by emitProgress
        let jobWorkspacePath: string | null = null

        // ── Helpers ──────────────────────────────────────────

        const addLog = async (
          type: BuildSocketLog['type'],
          message: string,
          step: BuildLogStep = 'files_write',
          meta?: Record<string, unknown>,
          filePath?: string,
          bytes?: number,
          source?: string
        ) => {
          const log = makeLog(jobId, type, message, step, filePath, bytes, source)
          allLogs.push(log)
          emitLog(userId, jobId, log)
          await appendJobLog(jobId, {
            level: type === 'error' ? 'error' : type === 'success' ? 'success' : 'info',
            step,
            message,
            meta: meta ?? {},
          })
          return log
        }

        const setStep = async (
          status: JobStatus,
          currentStep: string,
          progress: number,
          patch?: Partial<Parameters<typeof setJobStep>[1]>
        ) => {
          await setJobStep(jobId, {
            status,
            currentStep,
            progress,
            retryCount,
            ...(patch ?? {}),
          })
          emitProgress(userId, jobId, status, currentStep, progress, allLogs, jobWorkspacePath)

          // ── Emit agent status based on build phase ──
          const stepToAgent: Record<string, AgentRole> = {
            initializing: 'installer',
            installing: 'installer',
            installing_deps: 'installer',
            generating_frontend: 'frontend',
            generating_backend: 'backend',
            wiring_auth: 'backend',
            wiring_integrations: 'backend',
            running: 'deploy',
            testing: 'qa',
            starting_preview: 'deploy',
            repairing: 'fixer',
            complete: 'deploy',
            failed: 'fixer',
          }
          const agentRole = stepToAgent[status]
          if (agentRole) {
            const agentStatus = status === 'complete' ? 'complete' as const
              : status === 'failed' ? 'error' as const
              : 'running' as const
            emitAgentStatus(agentRole, agentStatus, `${agentRole}: ${currentStep}`)
          }
        }

        // ── Preview telemetry callbacks ───────────────────────

        let repairAttemptCount = 0

        const previewCallbacks: PreviewTelemetryCallbacks = {
          onPhase: async (phase, meta) => {
            if (phase === 'installing') {
              await setStep('installing_deps', 'Installing dependencies', 90, { previewStatus: 'installing' })
            } else if (phase === 'starting') {
              await setStep('starting_preview', 'Starting preview server', 97, { previewStatus: 'starting' })
            } else if (phase === 'healthcheck') {
              await setStep('starting_preview', 'Waiting for preview to become ready', 98, { previewStatus: 'starting' })
            }
            const logStep: BuildLogStep =
              phase === 'installing' ? 'install_deps'
              : phase === 'starting' ? 'preview_start'
              : 'preview_healthcheck'
            await addLog('info', `phase:${phase}`, logStep, meta ?? {})
          },
          onCommandSummary: async (summary) => {
            const safe = sanitizeCommandSummary(summary as CommandSummary)
            await setJobStep(jobId, { commandSummary: safe as unknown as Prisma.InputJsonValue })
          },
          onFailure: async ({ phase, error, commandSummary }) => {
            const category = classifyFailure(error, phase)
            const safeSummary = commandSummary
              ? sanitizeCommandSummary(commandSummary as CommandSummary)
              : undefined
            await setJobStep(jobId, {
              status: 'failed',
              currentStep: 'Build failed',
              previewStatus: 'failed',
              failureCategory: category,
              commandSummary: safeSummary ? (safeSummary as unknown as Prisma.InputJsonValue) : null,
              retryCount,
            })
            const logStep: BuildLogStep =
              phase === 'installing' ? 'install_deps'
              : phase === 'starting' ? 'preview_start'
              : 'preview_healthcheck'
            await addLog('error', error.message, logStep, {
              failureCategory: category,
              ...(safeSummary ? { commandSummary: safeSummary } : {}),
            })
          },
          onRepairAttempt: async ({ phase, attempt, reason, strategy }) => {
            repairAttemptCount++
            const logStep: BuildLogStep = phase === 'installing' ? 'install_deps' : 'preview_healthcheck'
            const progress = phase === 'installing' ? 91 : 98
            await setJobStep(jobId, {
              status: 'repairing',
              currentStep: `Auto-repair: ${strategy}`,
              progress,
              repairAttemptCount,
            })
            emitProgress(userId, jobId, 'repairing', `Auto-repair: ${strategy}`, progress, allLogs)
            await addLog('info', `AUTO-REPAIR attempt ${attempt}: ${strategy} (reason: ${reason.slice(0, 200)})`, logStep, {
              phase, attempt, strategy, reason: reason.slice(0, 200),
            })
          },
        }

        // ── Credential pause/resume helper ───────────────────

        const waitForCredentials = async (params: {
          integration: string
          label: string
          purpose: string
          fields: Array<{ key: string; label: string; type: 'text' | 'password' | 'url' }>
        }): Promise<Record<string, string> | null> => {
          const expiresAt = new Date(Date.now() + CREDENTIAL_TIMEOUT_MS)
          const credReq = await prisma.credentialRequest.create({
            data: {
              jobId,
              userId,
              integration: params.integration,
              label: params.label,
              purpose: params.purpose,
              fields: params.fields as Prisma.InputJsonValue,
              status: 'pending',
              expiresAt,
            },
          })

          await addLog('info', `CREDENTIALS REQUESTED: ${params.label} (${params.integration})`, 'install_deps', {
            requestId: credReq.id,
            integration: params.integration,
            purpose: params.purpose,
          })

          emitToUser(userId, 'credentials:requested', {
            requestId: credReq.id,
            jobId,
            integration: params.integration,
            label: params.label,
            purpose: params.purpose,
            fields: params.fields,
            expiresAt: expiresAt.toISOString(),
          })

          try {
            const values = await new Promise<Record<string, string> | null>((resolve, reject) => {
              registerCredentialResolver(credReq.id, resolve, reject)
            })
            return values
          } catch {
            await prisma.credentialRequest.update({
              where: { id: credReq.id },
              data: { status: 'expired' },
            }).catch(() => {/* ignore */})
            await addLog('error', `CREDENTIALS TIMEOUT: ${params.label} — continuing without credentials`, 'install_deps', {
              requestId: credReq.id,
            })
            return null
          } finally {
            cancelCredentialResolver(credReq.id)
          }
        }

        const addPreviewLog = async (previewLog: PreviewLogEntry) => {
          const type: BuildSocketLog['type'] =
            previewLog.type === 'error' ? 'error'
            : previewLog.type === 'success' ? 'success'
            : 'run'
          await addLog(
            type,
            previewLog.message,
            'preview_start',
            { source: previewLog.source },
            undefined,
            undefined,
            previewLog.source
          )
        }

        // ── Main build flow ───────────────────────────────────

        try {
          await setJobStep(jobId, { status: 'initializing', startedAt: new Date(), retryCount })
          await setStep('initializing', 'Initializing project structure', 5)
          await addLog('info', `Build job started (attempt ${retryCount + 1})`, 'workspace_prepare', { jobId, projectId })

          currentPhase = 'scaffold'
          const plan = await prisma.plan.findUnique({ where: { id: planId } })
          if (!plan) throw new Error('Plan not found')
          planRecord = plan

          const project = await prisma.project.findUnique({ where: { id: projectId } })
          if (!project) throw new Error('Project not found')
          projectRecord = project

          currentPhase = 'workspace'
          const workspacePath = createWorkspace(jobId)
          jobWorkspacePath = workspacePath  // make available to emitProgress
          await addLog('info', `WORKSPACE ${workspacePath}`, 'workspace_prepare', { workspacePath })

          const features = Array.isArray(plan.features) ? plan.features as string[] : []
          const techStack = (plan.techStack as Record<string, string[]>) ?? {}
          const frontendScope = Array.isArray(plan.frontendScope) ? plan.frontendScope as string[] : []
          const backendScope = Array.isArray(plan.backendScope) ? plan.backendScope as string[] : []
          const integrations = Array.isArray(plan.integrations) ? plan.integrations as string[] : []

          // ── Memory context (Sprint 7+) ──────────────────────
          const memoryContext = await getCombinedContext(projectId, userId)
          const userRules = await getUserRules(userId)
          const projectRules = await getProjectRules(projectId)
          const rulesBlock = buildRulesBlock(userRules, projectRules)
          const existingSnapshot = await getRepoSnapshot(projectId)
          const repoContext = existingSnapshot ? buildRepoContext(existingSnapshot) : undefined

          // ── Product Intelligence (Roadmap #4) ─────────────────
          // Generate product intelligence in parallel with build setup.
          // Non-blocking — if it fails, the build proceeds without it.
          const planSummary = typeof plan.summary === 'string' ? plan.summary : ''
          const productIntelligence = await generateProductIntelligence(
            planSummary,
            project.name,
            memoryContext ?? undefined,
          ).catch((err) => {
            console.warn('[Builder] Product intelligence generation failed (non-blocking):', err instanceof Error ? err.message : err)
            return null
          })
          const productIntelligenceContext = productIntelligence
            ? buildProductIntelligenceContext(productIntelligence)
            : undefined

          // ── Sprint 18: Learning state for generation strategy ──
          const learningState = await getLearningState(projectId)
          let learningContext = ''
          if (learningState.qualityBaseline !== null) {
            learningContext = `\n\nBUILD HISTORY CONTEXT:\n` +
              `- Quality baseline: ${learningState.qualityBaseline}/100\n` +
              `- Aggressive repair threshold: ${learningState.aggressiveRepairThreshold}\n` +
              (learningState.preferredProvider
                ? `- Best-performing provider: ${learningState.preferredProvider}\n`
                : '') +
              `- Focus on code quality, minimize complexity and duplication.\n`
          }

          // ── Database Architect (Roadmap #5) ─────────────────
          // Design schema from product requirements. Non-blocking — if it fails
          // the build falls back to the standard AI prompt for prisma/schema.
          const hasBackend = backendScope.length > 0
          const hasSupabase = integrations.some(i => /supabase/i.test(i))
          let schemaDesign: SchemaDesign | null = null
          let databaseContext: string | undefined

          if (hasBackend) {
            const planSummaryForDB = typeof plan.summary === 'string' ? plan.summary : ''
            const existingModelNames = existingSnapshot?.prismaModels ?? []

            schemaDesign = await designSchema(
              planSummaryForDB, features, integrations, backendScope, existingModelNames,
            ).catch((err) => {
              console.warn('[Builder] Database architect schema design failed (non-blocking):', err instanceof Error ? err.message : err)
              return null
            })

            if (schemaDesign) {
              // Generate RLS policies if Supabase is detected
              const rlsReport = hasSupabase ? generateRLSPolicies(schemaDesign) : null

              // Detect schema evolution if there's an existing snapshot
              let existingSchemaContent: string | null = null
              if (workspacePath) {
                try { existingSchemaContent = fs.readFileSync(nodePath.join(workspacePath, 'prisma', 'schema.prisma'), 'utf-8') } catch { /* no existing schema */ }
              }
              const migrationPlan = existingModelNames.length > 0
                ? detectSchemaEvolution(existingModelNames, existingSchemaContent, schemaDesign)
                : null

              databaseContext = buildDatabaseContext(schemaDesign, null, rlsReport, migrationPlan) || undefined

              if (migrationPlan?.hasChanges) {
                const migrationLog = generateMigrationInstructions(migrationPlan)
                console.log(`[DatabaseArchitect] Migration plan:\n${migrationLog}`)
              }

              console.log(`[DatabaseArchitect] Schema designed: ${schemaDesign.entities.length} entities, ${schemaDesign.enums.length} enums${rlsReport ? `, ${rlsReport.totalPolicies} RLS policies` : ''}`)
            }
          }

          // ── Plugin System (Roadmap #6) ─────────────────────
          const activePlugins = pluginRegistry.resolveActivePlugins(integrations, features, techStack)
          const pluginHookCtx: PluginHookContext = {
            workspacePath,
            projectName: project.name,
            features,
            integrations,
            techStack,
            stage: 'pre:generate',
          }

          if (activePlugins.length > 0) {
            console.log(`[PluginSystem] ${activePlugins.length} plugins active: ${activePlugins.map(p => p.id).join(', ')}`)
            await addLog('info', `PLUGINS: ${activePlugins.length} active (${activePlugins.map(p => p.name).join(', ')})`, 'workspace_prepare', {})

            // Execute post:scaffold hooks
            const scaffoldResult = await executeHooks('post:scaffold', { ...pluginHookCtx, stage: 'post:scaffold' }, activePlugins)
            if (scaffoldResult.files?.length) {
              for (const file of scaffoldResult.files) {
                const filePath = nodePath.join(workspacePath, file.relativePath)
                fs.mkdirSync(nodePath.dirname(filePath), { recursive: true })
                if (file.action === 'append' && fs.existsSync(filePath)) {
                  fs.appendFileSync(filePath, file.content, 'utf-8')
                } else if (file.action === 'prepend' && fs.existsSync(filePath)) {
                  const existing = fs.readFileSync(filePath, 'utf-8')
                  fs.writeFileSync(filePath, file.content + existing, 'utf-8')
                } else {
                  fs.writeFileSync(filePath, file.content, 'utf-8')
                }
              }
            }

            // Execute pre:generate hooks (can inject prompt context and env files)
            const preGenResult = await executeHooks('pre:generate', { ...pluginHookCtx, stage: 'pre:generate' }, activePlugins)
            if (preGenResult.files?.length) {
              for (const file of preGenResult.files) {
                const filePath = nodePath.join(workspacePath, file.relativePath)
                fs.mkdirSync(nodePath.dirname(filePath), { recursive: true })
                if (file.action === 'append' && fs.existsSync(filePath)) {
                  fs.appendFileSync(filePath, file.content, 'utf-8')
                } else {
                  fs.writeFileSync(filePath, file.content, 'utf-8')
                }
              }
            }
          }

          // Collect plugin prompt extensions for injection
          const pluginPromptContext = activePlugins.length > 0
            ? collectPromptExtensions(activePlugins, 'all')
            : undefined

          // ── Build CodeGenProject ────────────────────────────
          const codeGenProject: CodeGenProject = {
            projectName: project.name,
            summary: typeof plan.summary === 'string' ? plan.summary : 'A CodedXP generated application',
            features,
            techStack,
            frontendScope,
            backendScope,
            integrations,
            memoryContext: (memoryContext ?? '') + learningContext + (pluginPromptContext ? '\n\n' + pluginPromptContext : '') || undefined,
            rulesBlock: rulesBlock ?? undefined,
            repoContext,
            productIntelligenceContext,
            databaseContext,
          }

          // ── Code generation callbacks ───────────────────────
          const generatedFiles: Array<{
            relativePath: string
            content: string
            bytes: number
            generatedBy: 'ai' | 'template'
          }> = []

          const codeGenCallbacks: CodeGenCallbacks = {
            onPhaseStart: async (phase, fileCount) => {
              if (phase === 'frontend' || phase === 'templates') {
                await setStep('generating_frontend', `Generating project files (${fileCount} files)`, 20)
              } else if (phase === 'backend' || phase === 'ai') {
                await setStep('generating_backend', `AI generating code (${fileCount} files)`, 45)
              } else if (phase === 'config') {
                await setStep('installing', `Writing configuration (${fileCount} files)`, 15)
              } else if (phase === 'integration') {
                await setStep('wiring_integrations', `Wiring integrations (${fileCount} files)`, 75)
              } else if (phase === 'repair') {
                await setStep('repairing', `Self-healing: repairing ${fileCount} file(s)`, 85)
              }
            },
            onFileStart: async (filePath, description) => {
              await addLog('create', `GENERATING ${filePath} — ${description}`, 'files_write', {}, filePath)
            },
            onFileComplete: async (filePath, bytes, generatedBy) => {
              generatedFiles.push({
                relativePath: filePath,
                content: '', // Will be read from disk if needed
                bytes,
                generatedBy,
              })
              await addLog('create',
                `CREATE ${filePath} (${(bytes / 1024).toFixed(1)} KB) [${generatedBy}]`,
                'files_write',
                { bytes, generatedBy },
                filePath, bytes, generatedBy
              )
              emitBuildFileChange(filePath, 'frontend', 'created')
            },
            onFileError: async (filePath, error) => {
              await addLog('error', `ERROR ${filePath}: ${error}`, 'files_write', { error }, filePath)
            },
            onFileToken: async (filePath, delta) => {
              emitToUser(userId, 'job:file_token', { jobId, path: filePath, delta })
            },
          }

          // ── Phase 1: AI Code Generation ─────────────────────
          currentPhase = 'scaffold'
          await addLog('info', 'Starting AI code generation', 'scaffold_generate', {})

          // Master timeout: if generateProjectFiles hasn't returned in 120s,
          // abort and proceed with whatever files were already generated.
          // This is the absolute backstop — individual file timeouts should
          // resolve much faster, but this catches any unforeseen hang.
          const MASTER_CODEGEN_TIMEOUT_MS = 120_000
          const codeGenPromise = generateProjectFiles(workspacePath, codeGenProject, codeGenCallbacks)
          const codeGenTimer = new Promise<void>((resolve) => {
            setTimeout(() => {
              console.error(`[Builder] ⚠ MASTER CODEGEN TIMEOUT (${MASTER_CODEGEN_TIMEOUT_MS / 1000}s) — proceeding with generated files so far`)
              resolve()
            }, MASTER_CODEGEN_TIMEOUT_MS)
          })
          await Promise.race([codeGenPromise, codeGenTimer])

          // Execute post:generate plugin hooks (write plugin file templates, etc.)
          if (activePlugins.length > 0) {
            const postGenResult = await executeHooks('post:generate', { ...pluginHookCtx, stage: 'post:generate' }, activePlugins)
            if (postGenResult.files?.length) {
              for (const file of postGenResult.files) {
                const filePath = nodePath.join(workspacePath, file.relativePath)
                fs.mkdirSync(nodePath.dirname(filePath), { recursive: true })
                if (file.action === 'append' && fs.existsSync(filePath)) {
                  fs.appendFileSync(filePath, file.content, 'utf-8')
                } else {
                  fs.writeFileSync(filePath, file.content, 'utf-8')
                }
              }
            }
            // Write plugin file templates that weren't already generated
            const templates = collectPluginFileTemplates(activePlugins, {
              hasAuth: features.some(f => /auth|login|register/i.test(f)),
              hasStripe: integrations.some(i => /stripe/i.test(i)),
              hasSupabase: integrations.some(i => /supabase/i.test(i)),
            })
            for (const tpl of templates) {
              const tplPath = nodePath.join(workspacePath, tpl.relativePath)
              if (!fs.existsSync(tplPath)) {
                fs.mkdirSync(nodePath.dirname(tplPath), { recursive: true })
                fs.writeFileSync(tplPath, tpl.content, 'utf-8')
              }
            }
          }

          // Read generated file contents for validation
          for (const gf of generatedFiles) {
            try {
              gf.content = fs.readFileSync(nodePath.join(workspacePath, gf.relativePath), 'utf8')
            } catch { /* non-fatal */ }
          }

          // ── Phase 2: Workspace Validation ───────────────────
          currentPhase = 'scaffold_validate'
          await setStep('testing', 'Validating workspace', 88)
          const fileTree = getWorkspaceFileTree(workspacePath)
          const totalBytes = getWorkspaceTotalBytes(workspacePath)

          await addLog('validate', `VALIDATE ${fileTree.length} files, ${(totalBytes / 1024).toFixed(1)} KB total`, 'scaffold_validate', {
            actual: fileTree.length,
            totalBytes,
          })

          // Gap 6: Section completeness validation — warn but never fail
          const missingSections = validateSectionCompleteness(frontendScope, fileTree)
          if (missingSections.length > 0) {
            await addLog(
              'validate',
              `COMPLETENESS WARNING: ${missingSections.length} planned section(s) may be missing: ${missingSections.join(', ')}`,
              'scaffold_validate',
              { missingSections, frontendScope }
            )
            emitToUser(userId, 'job:completion_warning', {
              jobId,
              missingSections,
              message: `${missingSections.length} planned section(s) may be incomplete: ${missingSections.join(', ')}`,
            })
          }

          // ── Integration validation + self-healing (S14-1) ───
          // Cross-file checks: Supabase, Stripe, API routes, route completeness,
          // import resolution. If errors found: targeted repair, re-validate.
          // Max 1 repair attempt. Never fails the build.
          try {
            const fileInputs = generatedFiles.map(gf => ({ relativePath: gf.relativePath, content: gf.content }))
            const integrationResult = validateAllIntegrations(fileInputs, integrations)

            if (integrationResult.errors.length > 0) {
              await addLog(
                'validate',
                `INTEGRATION VALIDATION: ${integrationResult.errors.length} issue(s) found — triggering self-healing repair`,
                'scaffold_validate',
                { integrationErrors: integrationResult.errors.map(e => ({ file: e.filePath, msg: e.message })) }
              )

              emitToUser(userId, 'job:integration_repair', {
                jobId,
                phase: 'started',
                errorCount: integrationResult.errors.length,
                message: `Repairing ${integrationResult.errors.length} integration issue(s)`,
              })

              // Build error context with specific fix instructions
              const errorContext = generateIntegrationErrorContext(integrationResult.errors)

              // Identify unique affected files
              const affectedFiles = [...new Set(integrationResult.errors.map(e => e.filePath))]
              await addLog('info',
                `INTEGRATION REPAIR: targeting ${affectedFiles.length} file(s): ${affectedFiles.join(', ')}`,
                'scaffold_validate',
                { affectedFiles }
              )

              // Build repair callbacks
              const integrationRepairCallbacks: CodeGenCallbacks = {
                onPhaseStart: async (_phase, fileCount) => {
                  await setStep('repairing', `Integration self-healing: repairing ${fileCount} file(s)`, 91)
                },
                onFileStart: async (fp, description) => {
                  await addLog('create', `INTEGRATION REPAIR ${fp} — ${description}`, 'scaffold_validate', {}, fp)
                },
                onFileComplete: async (fp, bytes, generatedBy) => {
                  await addLog('create',
                    `INTEGRATION REPAIRED ${fp} (${(bytes / 1024).toFixed(1)} KB) [${generatedBy}]`,
                    'scaffold_validate',
                    { bytes, generatedBy }, fp, bytes, generatedBy
                  )
                  emitBuildFileChange(fp, 'fixer', 'modified')
                  // Update generatedFiles array with repaired content for re-validation
                  const idx = generatedFiles.findIndex(g => g.relativePath === fp)
                  if (idx >= 0) {
                    try {
                      const diskPath = nodePath.join(workspacePath, fp)
                      const newContent = fs.readFileSync(diskPath, 'utf8')
                      generatedFiles[idx] = { ...generatedFiles[idx], content: newContent, bytes, generatedBy }
                    } catch { /* non-fatal */ }
                  }
                },
                onFileError: async (fp, error) => {
                  await addLog('error', `INTEGRATION REPAIR ERROR ${fp}: ${error}`, 'scaffold_validate', { error }, fp)
                },
                onFileToken: async (fp, delta) => {
                  emitToUser(userId, 'job:file_token', { jobId, path: fp, delta })
                },
              }

              // Run targeted repair with integration error context
              const integrationRepairProject: CodeGenProject = {
                ...codeGenProject,
                memoryContext: (codeGenProject.memoryContext ?? '') + '\n\n' + errorContext,
              }

              try {
                await repairProjectFiles(workspacePath, integrationRepairProject, affectedFiles, integrationRepairCallbacks)

                // Re-run install in case repair added new deps (use centralized PKG_MANAGER)
                // Ensure pnpm isolation files exist (match previewManager.runNpmInstall)
                if (PKG_MANAGER === 'pnpm') {
                  const npmrcPath = nodePath.join(workspacePath, '.npmrc')
                  fs.writeFileSync(npmrcPath, 'node-linker=hoisted\nshamefully-hoist=true\nprefer-offline=true\nshared-workspace-lockfile=false\n')
                  const wsYaml = nodePath.join(workspacePath, 'pnpm-workspace.yaml')
                  if (!fs.existsSync(wsYaml)) {
                    fs.writeFileSync(wsYaml, 'packages: []\n')
                  }
                }
                // Remove stale lockfiles before install
                for (const lf of ['pnpm-lock.yaml', 'package-lock.json']) {
                  const lfp = nodePath.join(workspacePath, lf)
                  try { if (fs.existsSync(lfp)) fs.unlinkSync(lfp) } catch {}
                }
                try {
                  const installCmd = PKG_MANAGER === 'pnpm'
                    ? 'pnpm install --no-frozen-lockfile --no-strict-peer-dependencies --prefer-offline --no-optional'
                    : 'npm install --prefer-offline --no-audit --no-fund --no-optional'
                  const installEnv: Record<string, string | undefined> = {
                    ...process.env,
                    CI: 'true',
                    NODE_ENV: 'development',
                    FORCE_COLOR: '0',
                    npm_config_prefer_offline: 'true',
                    npm_config_optional: 'false',
                    npm_config_fetch_timeout: '60000',
                    npm_config_fetch_retries: '3',
                    npm_config_fetch_retry_mintimeout: '5000',
                    npm_config_fetch_retry_maxtimeout: '30000',
                    npm_config_progress: 'false',
                  }
                  await addLog('info', `INTEGRATION REPAIR: re-running ${installCmd}`, 'install_deps', {})
                  execSync(installCmd, {
                    cwd: workspacePath,
                    stdio: 'pipe',
                    timeout: 240_000,
                    env: installEnv,
                  })
                  await addLog('info', 'INTEGRATION REPAIR: install complete', 'install_deps', {})
                } catch (installErr: unknown) {
                  const installMsg = installErr instanceof Error ? installErr.message : String(installErr)
                  await addLog('info', `INTEGRATION REPAIR: install warning (non-fatal): ${installMsg.slice(0, 300)}`, 'install_deps', {})
                }

                // Re-validate after repair
                const repairedFileInputs = generatedFiles.map(gf => ({ relativePath: gf.relativePath, content: gf.content }))
                const revalidationResult = validateAllIntegrations(repairedFileInputs, integrations)

                if (revalidationResult.errors.length === 0) {
                  await addLog('success',
                    `INTEGRATION SELF-HEALING: all ${integrationResult.errors.length} issue(s) resolved`,
                    'scaffold_validate', {}
                  )
                  emitToUser(userId, 'job:integration_repair', {
                    jobId,
                    phase: 'complete',
                    originalErrors: integrationResult.errors.length,
                    remainingErrors: 0,
                    message: `All ${integrationResult.errors.length} integration issue(s) resolved`,
                  })
                } else {
                  const resolved = integrationResult.errors.length - revalidationResult.errors.length
                  await addLog('validate',
                    `INTEGRATION SELF-HEALING: ${resolved} of ${integrationResult.errors.length} issue(s) resolved, ${revalidationResult.errors.length} remaining`,
                    'scaffold_validate',
                    { remainingWarnings: revalidationResult.errors }
                  )
                  emitToUser(userId, 'job:integration_warning', {
                    jobId,
                    warnings: revalidationResult.errors,
                    message: `${revalidationResult.errors.length} integration issue(s) remain after self-healing (${resolved} resolved)`,
                  })
                  emitToUser(userId, 'job:integration_repair', {
                    jobId,
                    phase: 'complete',
                    originalErrors: integrationResult.errors.length,
                    remainingErrors: revalidationResult.errors.length,
                    message: `${resolved} of ${integrationResult.errors.length} issue(s) resolved`,
                  })
                }
              } catch (repairErr: unknown) {
                const repairMsg = repairErr instanceof Error ? repairErr.message : String(repairErr)
                await addLog('info',
                  `INTEGRATION REPAIR: failed (${repairMsg.slice(0, 300)}) — continuing with original warnings`,
                  'scaffold_validate', {}
                )
                emitToUser(userId, 'job:integration_warning', {
                  jobId,
                  warnings: integrationResult.errors,
                  message: `${integrationResult.errors.length} integration issue(s) detected (self-healing failed)`,
                })
                emitToUser(userId, 'job:integration_repair', {
                  jobId,
                  phase: 'failed',
                  originalErrors: integrationResult.errors.length,
                  message: `Self-healing failed: ${repairMsg.slice(0, 200)}`,
                })
              }
            }
          } catch (ivErr: unknown) {
            await addLog('info',
              `INTEGRATION VALIDATION: skipped (${ivErr instanceof Error ? ivErr.message : 'unknown error'})`,
              'scaffold_validate', {}
            )
          }

// ── Code Quality Analysis (Sprint 17) ─────────────────
          const tsJsFiles = fileTree.filter(p => p.match(/\.(ts|tsx|js|jsx)$/))
          const qualityReport = calculateQualityMetrics(workspacePath, tsJsFiles)
          let qualityRepairTriggered = false

          await addLog('validate', 
            `CODE QUALITY: ${qualityReport.score}/100 | Functions: ${qualityReport.metrics.cyclomaticComplexity.functions} | Duplication: ${qualityReport.metrics.duplicationPercent.toFixed(1)}% | Warnings: ${qualityReport.metrics.warnings.length}`,
            'code_quality',
            { 
              score: qualityReport.score,
              duplication: qualityReport.metrics.duplicationPercent.toFixed(1),
              warnings: qualityReport.metrics.warnings.length 
            }
          )

          if (qualityReport.metrics.warnings.length > 0) {
            emitToUser(userId, 'job:quality_warning', {
              jobId,
              score: qualityReport.score,
              warnings: qualityReport.metrics.warnings,
              message: `${qualityReport.metrics.warnings.length} code quality issue(s) detected`
            })
          }

          // Sprint 18: check if aggressive repair should be used based on history
          const useAggressiveRepair = await shouldUseAggressiveRepair(projectId)
          const repairNeeded = useAggressiveRepair || shouldTriggerRepair(qualityReport.metrics)

          if (repairNeeded) {
            qualityRepairTriggered = true
            emitToUser(userId, 'job:quality_repair_triggered', {
              jobId,
              score: qualityReport.score,
              aggressive: useAggressiveRepair,
              message: useAggressiveRepair
                ? 'Declining quality trend detected - triggering aggressive repair'
                : 'Low code quality detected - triggering auto-repair',
            })

            const qualityRepairContext = generateRepairContext(qualityReport)
            const qualityRepairProject: CodeGenProject = {
              ...codeGenProject,
              memoryContext: (codeGenProject.memoryContext ?? '') + '\n\n' + qualityRepairContext,
            }

            // Quality-triggered repair (similar to integration repair)
            const qualityRepairCallbacks: CodeGenCallbacks = {
              onPhaseStart: async (_phase, fileCount) => {
                await setStep('repairing', `Quality repair: ${fileCount} files`, 89)
              },
              onFileStart: async (filePath, description) => {
                await addLog('create', `QUALITY REPAIR ${filePath}`, 'code_quality', {}, filePath)
              },
              onFileComplete: async (filePath, bytes, generatedBy) => {
                await addLog('create', `QUALITY REPAIRED ${filePath}`, 'code_quality', { bytes }, filePath, bytes)
                emitBuildFileChange(filePath, 'qa', 'modified')
              },
              onFileToken: async (filePath, delta) => {
                emitToUser(userId, 'job:file_token', { jobId, path: filePath, delta })
              },
              onFileError: async (filePath, error) => {
                await addLog('error', `QUALITY REPAIR ERROR ${filePath}`, 'code_quality', { error })
              }
            }

            await repairProjectFiles(workspacePath, qualityRepairProject, tsJsFiles.slice(0, 10), qualityRepairCallbacks)
          }

          // ── Persist workspace metadata ──────────────────────
          const generatedKeyFiles = fileTree.filter(p =>
            p === 'package.json' ||
            p === 'vite.config.ts' ||
            p === 'src/main.tsx' ||
            p === 'src/App.tsx' ||
            p === 'server/index.ts'
          )

          await setJobStep(jobId, {
            workspacePath,
            generatedFileCount: fileTree.length,
            generatedTotalBytes: totalBytes,
            generatedKeyFiles: generatedKeyFiles as Prisma.InputJsonValue,
          })

          await Promise.all(
            generatedFiles.map(async (f) => {
              return prisma.file.create({
                data: {
                  projectId,
                  name: f.relativePath.split('/').pop() ?? f.relativePath,
                  type: 'code',
                  mimeType: f.relativePath.endsWith('.json') ? 'application/json'
                    : f.relativePath.endsWith('.md') ? 'text/markdown'
                    : f.relativePath.endsWith('.html') ? 'text/html'
                    : f.relativePath.endsWith('.css') ? 'text/css'
                    : 'text/typescript',
                  size: f.bytes,
                  path: `${workspacePath}/${f.relativePath}`,
                  url: null,
                },
              })
            })
          )

          // Persist workspace file count + total bytes
          await setJobStep(jobId, {
            workspacePath,
            fileCount: fileTree.length,
            totalBytes,
          })

          currentPhase = 'install'
          await addLog('info', `INSTALL starting npm install in ${workspacePath}`, 'install_deps', { workspacePath })

          // DEV ONLY: inject failure at install phase for testing
          if (process.env.NODE_ENV !== 'production' && injectFailAt === 'install') {
            throw new Error('Simulated install failure for testing (injectFailAt=install)')
          }

          // ── Database Architect: Seed Data + Query Analysis (Roadmap #5) ──
          if (hasBackend && schemaDesign) {
            // Generate seed data
            try {
              const hasAuth = features.some(f => /auth|login|register|user/i.test(f))
              const modelNames = schemaDesign.entities.map(e => e.name)
              const seedPlan = await generateSeedData(modelNames, codeGenProject.summary, features, hasAuth)
              if (seedPlan) {
                const seedPath = nodePath.join(workspacePath, 'prisma', 'seed.ts')
                fs.mkdirSync(nodePath.dirname(seedPath), { recursive: true })
                fs.writeFileSync(seedPath, seedPlan.seedFile, 'utf-8')
                await addLog('success', `SEED DATA: ${seedPlan.recordCount} records across ${seedPlan.entityCount} entities`, 'files_write', { entityCount: seedPlan.entityCount })
                console.log(`[DatabaseArchitect] Seed file written: ${seedPlan.entityCount} entities, ${seedPlan.recordCount} records`)
              }
            } catch (seedErr) {
              console.warn('[DatabaseArchitect] Seed generation failed (non-blocking):', seedErr instanceof Error ? seedErr.message : seedErr)
            }

            // Run query analysis on generated code
            try {
              const queryReport = analyzeQueries(workspacePath)
              if (queryReport.issues.length > 0) {
                await addLog(
                  queryReport.score >= 70 ? 'validate' : 'error',
                  `QUERY ANALYSIS: score ${queryReport.score}/100, ${queryReport.issues.length} issues found (${queryReport.totalQueriesDetected} queries scanned)`,
                  'code_quality',
                  { queryScore: queryReport.score, issueCount: queryReport.issues.length }
                )
                // Update database context with query report for repair context
                const updatedDbContext = buildDatabaseContext(schemaDesign, queryReport, null, null)
                if (updatedDbContext) {
                  codeGenProject.databaseContext = (codeGenProject.databaseContext ?? '') + '\n\n' + updatedDbContext
                }
              } else {
                await addLog('success', `QUERY ANALYSIS: clean — ${queryReport.totalQueriesDetected} queries scanned, no issues`, 'code_quality', {})
              }
            } catch (qaErr) {
              console.warn('[DatabaseArchitect] Query analysis failed (non-blocking):', qaErr instanceof Error ? qaErr.message : qaErr)
            }

            // Write RLS policies file for Supabase projects
            if (hasSupabase && schemaDesign) {
              try {
                const rlsReport = generateRLSPolicies(schemaDesign)
                if (rlsReport.totalPolicies > 0) {
                  const rlsPath = nodePath.join(workspacePath, 'supabase', 'rls-policies.sql')
                  fs.mkdirSync(nodePath.dirname(rlsPath), { recursive: true })
                  fs.writeFileSync(rlsPath, rlsReport.sql, 'utf-8')
                  await addLog('success', `RLS POLICIES: ${rlsReport.totalPolicies} policies written to supabase/rls-policies.sql`, 'files_write', { policyCount: rlsReport.totalPolicies })
                  console.log(`[DatabaseArchitect] RLS policies written: ${rlsReport.totalPolicies} policies`)
                }
              } catch (rlsErr) {
                console.warn('[DatabaseArchitect] RLS policy generation failed (non-blocking):', rlsErr instanceof Error ? rlsErr.message : rlsErr)
              }
            }
          }

          // ── Refactor Analysis (Sprint 19) ───────────────────────
          // Detect code smells, generate refactor plans, analyze dependencies,
          // detect applicable migrations. Non-blocking — failures don't stop the build.
          currentPhase = 'refactor_analysis'
          await addLog('info', 'REFACTOR ANALYSIS: scanning for code smells and improvement opportunities...', 'code_quality', {})
          try {
            const smellReport = detectCodeSmells(workspacePath)
            const totalSmells = smellReport.reduce((sum, s) => sum + s.instances.length, 0)

            if (totalSmells > 0) {
              await addLog('info', `CODE SMELLS: ${totalSmells} issues detected across ${smellReport.length} categories`, 'code_quality', {
                smellCategories: smellReport.length,
                totalSmells,
              })

              // Generate refactor plans for detected smells
              const repoCtx = codeGenProject.repoContext ?? ''
              const refactorPlans = await generateRefactorPlans(smellReport, repoCtx).catch(() => [])
              if (refactorPlans.length > 0) {
                await addLog('info', `REFACTOR PLANS: ${refactorPlans.length} improvement plans generated`, 'code_quality', {
                  planCount: refactorPlans.length,
                  highRisk: refactorPlans.filter(p => p.risk === 'high').length,
                })
              }

              // Analyze outdated dependencies
              const depReport = analyzeOutdatedDeps(workspacePath)
              if (depReport.outdated.length > 0) {
                await addLog('info', `DEPENDENCIES: ${depReport.outdated.length} outdated (${depReport.critical.length} critical)`, 'code_quality', {
                  outdated: depReport.outdated.length,
                  critical: depReport.critical.length,
                })
              }

              // Detect applicable migrations
              const techStack = codeGenProject.techStack
              const migrations = detectApplicableMigrations(workspacePath, techStack)
              if (migrations.length > 0) {
                await addLog('info', `MIGRATIONS: ${migrations.length} applicable migration paths detected`, 'code_quality', {
                  migrationCount: migrations.length,
                  migrations: migrations.map(m => m.id),
                })
              }

              // Build refactor context and inject into CodeGenProject
              const refactorCtx = buildRefactorContext(smellReport, refactorPlans, depReport)
              if (refactorCtx) {
                codeGenProject.memoryContext = (codeGenProject.memoryContext ?? '') +
                  '\n\n' + refactorCtx
              }

              // Emit refactor results to frontend
              emitToUser(userId, 'job:refactor_analysis', {
                jobId,
                smells: smellReport.map(s => ({
                  type: s.type,
                  count: s.instances.length,
                  severity: s.severity,
                })),
                plans: refactorPlans.slice(0, 5).map(p => ({
                  id: p.id,
                  title: p.title,
                  risk: p.risk,
                  affectedFiles: p.affectedFiles.length,
                })),
                dependencies: {
                  outdated: depReport.outdated.length,
                  critical: depReport.critical.length,
                },
                migrations: migrations.map(m => ({ id: m.id, name: m.name })),
              })

              console.log(`[RefactorAgent] Analysis complete: ${totalSmells} smells, ${refactorPlans.length} plans, ${depReport.outdated.length} outdated deps, ${migrations.length} migrations`)
            } else {
              await addLog('success', 'REFACTOR ANALYSIS: code is clean — no smells detected', 'code_quality', {})
            }
          } catch (refactorErr) {
            console.warn('[RefactorAgent] Refactor analysis failed (non-blocking):', refactorErr instanceof Error ? refactorErr.message : refactorErr)
          }

          // ── Security Audit (Sprint 19) ─────────────────────────
          currentPhase = 'security_audit'
          emitBuildAgentStatus('preview_healthcheck', 'running') // QA agent handles security
          await addLog('info', 'SECURITY AUDIT: scanning for vulnerabilities...', 'code_quality', {})
          let securityReport: SecurityAuditReport | null = null
          try {
            securityReport = await runSecurityAudit(workspacePath, fileTree, async (msg) => {
              await addLog('info', `SECURITY: ${msg}`, 'code_quality', {})
            })
            await addLog(
              securityReport.securityScore >= 70 ? 'success' : 'validate',
              `SECURITY SCORE: ${securityReport.securityScore}/100 | Critical: ${securityReport.counts.critical} | High: ${securityReport.counts.high} | Medium: ${securityReport.counts.medium}`,
              'code_quality',
              {
                securityScore: securityReport.securityScore,
                critical: securityReport.counts.critical,
                high: securityReport.counts.high,
              }
            )
            emitToUser(userId, 'job:security_audit', {
              jobId,
              securityScore: securityReport.securityScore,
              counts: securityReport.counts,
              findings: securityReport.findings.slice(0, 10),
              vulnerabilities: securityReport.vulnerabilities.slice(0, 5),
            })
          } catch (secErr) {
            await addLog('error', `SECURITY AUDIT ERROR: ${secErr instanceof Error ? secErr.message : String(secErr)}`, 'code_quality', {})
          }

          // ── Autonomous Testing (Sprint 19) ─────────────────────
          currentPhase = 'testing'
          await setStep('testing', 'Running autonomous tests...', 89)
          let testReport: TestEngineReport | null = null
          try {
            testReport = await runAutonomousTests(workspacePath, fileTree, async (msg) => {
              await addLog('info', `TEST: ${msg}`, 'code_quality', {})
            })
            if (testReport.testsRun && testReport.testResults) {
              const tr = testReport.testResults
              await addLog(
                tr.success ? 'success' : 'validate',
                `TESTS: ${tr.numPassed}/${tr.numTests} passed, ${tr.numFailed} failed (${tr.durationMs}ms)`,
                'code_quality',
                {
                  passed: tr.numPassed,
                  failed: tr.numFailed,
                  total: tr.numTests,
                  durationMs: tr.durationMs,
                }
              )
              emitToUser(userId, 'job:test_results', {
                jobId,
                numTests: tr.numTests,
                numPassed: tr.numPassed,
                numFailed: tr.numFailed,
                success: tr.success,
                coverage: tr.coverage,
                failures: tr.failures.slice(0, 5),
              })
              // Feed test failures to repair context for future builds
              if (testReport.repairContext) {
                await addLog('info', `TEST REPAIR CONTEXT: ${tr.numFailed} failures recorded for Fixer`, 'code_quality', {})
              }
            }
          } catch (testErr) {
            await addLog('error', `TEST ENGINE ERROR: ${testErr instanceof Error ? testErr.message : String(testErr)}`, 'code_quality', {})
          }

          currentPhase = 'preview_start'
          let previewInstance
          try {
            previewInstance = await startPreview(
              jobId,
              workspacePath,
              addPreviewLog,
              previewCallbacks
            )
          } catch (previewErr) {
            const previewErrorMessage = previewErr instanceof Error ? previewErr.message : String(previewErr)

            await addLog(
              'error',
              `PREVIEW FAILED: ${previewErrorMessage} — starting auto-recovery`,
              'preview_start',
              {}
            )

            const previewLogLines = allLogs
              .filter((l) => l.step === 'preview_start' || l.step === 'preview_runtime')
              .map((l) => `${l.level}: ${l.message}`)

            const parsedErrors = parsePreviewErrors(previewLogLines)
            const affectedFiles = getAffectedFiles(parsedErrors)
            const dependencyIssue = hasDependencyErrors(parsedErrors)

            emitToUser(userId, 'job:preview_repair', {
              jobId,
              phase: 'started',
              errorCount: parsedErrors.length,
              affectedFiles,
              dependencyIssue,
              message: 'Preview recovery started',
            })

            if (dependencyIssue) {
              // Ensure pnpm isolation files exist (match previewManager.runNpmInstall)
              if (PKG_MANAGER === 'pnpm') {
                const npmrcPath = nodePath.join(workspacePath, '.npmrc')
                fs.writeFileSync(npmrcPath, 'node-linker=hoisted\nshamefully-hoist=true\nprefer-offline=true\nshared-workspace-lockfile=false\n')
                const wsYaml = nodePath.join(workspacePath, 'pnpm-workspace.yaml')
                if (!fs.existsSync(wsYaml)) {
                  fs.writeFileSync(wsYaml, 'packages: []\n')
                }
              }
              // Remove stale lockfiles before recovery install
              for (const lf of ['pnpm-lock.yaml', 'package-lock.json']) {
                const lfp = nodePath.join(workspacePath, lf)
                try { if (fs.existsSync(lfp)) fs.unlinkSync(lfp) } catch {}
              }
              try {
                const recoverCmd = PKG_MANAGER === 'pnpm'
                  ? 'pnpm install --no-frozen-lockfile --no-strict-peer-dependencies --prefer-offline --no-optional'
                  : 'npm install --prefer-offline --no-audit --no-fund --no-optional'
                const recoverEnv: Record<string, string | undefined> = {
                  ...process.env,
                  CI: 'true',
                  NODE_ENV: 'development',
                  FORCE_COLOR: '0',
                  npm_config_prefer_offline: 'true',
                  npm_config_optional: 'false',
                  npm_config_fetch_timeout: '60000',
                  npm_config_fetch_retries: '3',
                  npm_config_fetch_retry_mintimeout: '5000',
                  npm_config_fetch_retry_maxtimeout: '30000',
                  npm_config_progress: 'false',
                }
                await addLog('info', `PREVIEW RECOVERY: reinstalling dependencies (${recoverCmd})`, 'install_deps', {})
                execSync(recoverCmd, {
                  cwd: workspacePath,
                  stdio: 'pipe',
                  timeout: 240_000,
                  env: recoverEnv,
                })
                await addLog('success', 'PREVIEW RECOVERY: dependency install complete', 'install_deps', {})
              } catch (depErr) {
                const depErrMsg = depErr instanceof Error ? depErr.message : String(depErr)
                await addLog('info', `PREVIEW RECOVERY: dependency install warning (non-fatal): ${depErrMsg}`, 'install_deps', {})
              }
            }

            if (affectedFiles.length > 0) {
              const repairContext = buildPreviewRepairContext(parsedErrors)
              const previewRepairProject: CodeGenProject = {
                ...codeGenProject,
                memoryContext: (codeGenProject.memoryContext ?? '') + '\n\n' + repairContext,
              }

              const previewRepairCallbacks: CodeGenCallbacks = {
                onPhaseStart: async (_phase, fileCount) => {
                  await setStep('repairing', `Preview self-healing: repairing ${fileCount} file(s)`, 93)
                },
                onFileStart: async (filePath, description) => {
                  await addLog('create', `PREVIEW REPAIR ${filePath} — ${description}`, 'preview_start', {}, filePath)
                },
                onFileComplete: async (filePath, bytes, generatedBy) => {
                  await addLog(
                    'create',
                    `PREVIEW REPAIRED ${filePath} (${(bytes / 1024).toFixed(1)} KB) [${generatedBy}]`,
                    'preview_start',
                    { bytes, generatedBy },
                    filePath,
                    bytes,
                    generatedBy
                  )
                  emitBuildFileChange(filePath, 'fixer', 'modified')

                  const idx = generatedFiles.findIndex((g) => g.relativePath === filePath)
                  if (idx >= 0) {
                    try {
                      const diskPath = `${workspacePath}/${filePath}`
                      const newContent = fs.readFileSync(diskPath, 'utf8')
                      generatedFiles[idx] = {
                        ...generatedFiles[idx],
                        content: newContent,
                        bytes,
                        generatedBy: generatedBy as 'ai' | 'template',
                      }
                    } catch {
                      // non-fatal
                    }
                  }
                },
                onFileError: async (filePath, error) => {
                  await addLog('error', `PREVIEW REPAIR ERROR ${filePath}: ${error}`, 'preview_start', { error }, filePath)
                },
                onFileToken: async (filePath, delta) => {
                  emitToUser(userId, 'job:file_token', { jobId, path: filePath, delta })
                },
              }

              await repairProjectFiles(workspacePath, previewRepairProject, affectedFiles, previewRepairCallbacks)
            }

            await addLog('info', 'PREVIEW RECOVERY: retrying preview start (attempt 2/2)', 'preview_start', {})

            try {
              previewInstance = await startPreview(
                jobId,
                workspacePath,
                addPreviewLog,
                previewCallbacks
              )
              emitToUser(userId, 'job:preview_repair', {
                jobId,
                phase: 'complete',
                errorCount: parsedErrors.length,
                message: 'Preview recovery succeeded',
              })
            } catch (retryErr) {
              const retryErrMsg = retryErr instanceof Error ? retryErr.message : String(retryErr)
              emitToUser(userId, 'job:preview_repair', {
                jobId,
                phase: 'failed',
                errorCount: parsedErrors.length,
                message: `Preview recovery failed: ${retryErrMsg}`,
              })
              throw retryErr
            }
          }

          await addLog('success', `PREVIEW READY at ${previewInstance.url}`, 'complete', {
            previewUrl: previewInstance.url,
            previewPort: previewInstance.port,
            previewPid: previewInstance.pid,
          })

          // Store the browser-accessible relative URL (not localhost) in the DB
          // so that /api/preview/:jobId/status and rehydration both return a usable URL.
          const browserPreviewUrl = `/api/preview/${jobId}/app/`

          await setJobStep(jobId, {
            status: 'complete',
            currentStep: 'Preview ready',
            progress: 100,
            previewUrl: browserPreviewUrl,
            previewPort: previewInstance.port,
            previewPid: previewInstance.pid,
            previewStatus: 'ready',
            completedAt: new Date(),
            buildMeta: {
              installDurationMs: previewInstance.installDurationMs ?? null,
              startDurationMs: previewInstance.startDurationMs ?? null,
              missingSections: missingSections.length > 0 ? missingSections : null,
            } as Prisma.InputJsonValue,
          })

          // Flush final allLogs snapshot to DB
          await prisma.job.update({
            where: { id: jobId },
            data: { logs: allLogs as unknown as Prisma.InputJsonValue },
          })

          await prisma.project.update({
            where: { id: projectId },
            data: { status: 'ready' },
          })

          emitToUser(userId, 'job:complete', {
            jobId,
            previewUrl: browserPreviewUrl,
            previewPort: previewInstance.port,
            previewPid: previewInstance.pid,
            fileCount: fileTree.length,
            totalBytes,
            keyFiles: generatedKeyFiles,
          })
          emitPipelineStatus('complete', 'Build complete', {
            totalFiles: generatedFiles.length,
            previewUrl: browserPreviewUrl,
          })
          emitToUser(userId, 'preview:ready', {
            jobId,
            url: browserPreviewUrl,
            port: previewInstance.port,
            pid: previewInstance.pid,
          })

          // Record build success in memory (async/non-blocking)
          void recordBuildComplete(projectId, userId, {
            fileCount: fileTree.length,
            totalBytes,
            previewPort: previewInstance.port,
            projectName: project.name,
            projectSummary: typeof plan.summary === 'string' ? plan.summary : '',
          })

          // Sprint 18: Record build outcome for history-aware learning
          const aiFileCount = generatedFiles.filter(f => f.generatedBy === 'ai').length
          const providerUsed = aiFileCount > 0 ? 'ai-primary' : 'template-only'
          void recordBuildOutcome({
            buildId: jobId,
            qualityScore: qualityReport.score,
            complexityScore: qualityReport.metrics.cyclomaticComplexity.avg,
            duplicationScore: qualityReport.metrics.duplicationPercent,
            securityScore: Math.max(0, 100 - qualityReport.metrics.securityHotspots * 10),
            overallScore: qualityReport.score,
            repairTriggered: qualityRepairTriggered,
            repairSuccess: qualityRepairTriggered ? true : null, // success path = repair worked if triggered
            providerUsed,
            workerName: 'local',
            timestamp: new Date(),
            projectId,
          })

          // Sprint 18: Emit quality trend to frontend
          const qualityTrend = await getQualityTrend(projectId)
          if (qualityTrend) {
            emitToUser(userId, 'job:quality_trend', {
              jobId,
              trend: qualityTrend.trend,
              delta: qualityTrend.delta,
              baseline: qualityTrend.baseline,
              recentAverage: qualityTrend.recentAverage,
              buildCount: qualityTrend.buildCount,
            })
          }

          // Write memory.md into workspace
          writeWorkspaceMemoryFile(workspacePath, {
            projectName: project.name,
            projectId,
            planSummary: typeof plan.summary === 'string' ? plan.summary : '',
            techStack,
            integrations,
            buildTimestamp: new Date().toISOString(),
          })

          // Store repo snapshot for future builds (Sprint 7+)
          void storeRepoSnapshot(projectId, userId, indexWorkspace(workspacePath))

        } catch (err) {
          const message = err instanceof Error ? err.message : 'Build failed'
          const errorDetails = err instanceof Error && err.stack
            ? err.stack.slice(0, 2000)
            : null
          const category = classifyFailure(err, currentPhase)

          await setJobStep(jobId, {
            status: 'failed',
            currentStep: 'Build failed',
            failureCategory: category,
            previewStatus: 'failed',
            error: message,
            errorDetails,
            completedAt: new Date(),
            retryCount,
          })

          // Flush final log snapshot
          await prisma.job.update({
            where: { id: jobId },
            data: { logs: allLogs as unknown as Prisma.InputJsonValue },
          })

          await prisma.project.update({
            where: { id: projectId },
            data: { status: 'error' },
          })

          emitToUser(userId, 'job:failed', {
            jobId,
            error: { code: 'BUILD_FAILED', message, category, retryCount },
          })
          emitPipelineStatus('error', `Build failed: ${message}`, {
            phase: currentPhase,
            category,
          })

          // Record build failure in memory (async/non-blocking)
          void recordBuildFailed(projectId, userId, {
            phase: currentPhase,
            error: message,
            category: category ?? 'unknown',
            projectName: projectRecord?.name ?? '',
            projectSummary: typeof planRecord?.summary === 'string' ? planRecord.summary : '',
          })

          // Sprint 18: Record failed build outcome for learning
          void recordBuildOutcome({
            buildId: jobId,
            qualityScore: 0,
            complexityScore: 0,
            duplicationScore: 0,
            securityScore: 0,
            overallScore: 0,
            repairTriggered: false,
            repairSuccess: false,
            providerUsed: 'unknown',
            workerName: 'local',
            timestamp: new Date(),
            projectId,
          })

          throw err
        }
      },
      {
        connection: redisConnection,
        concurrency: 3,
        lockDuration: 900_000,       // 15 min — AI code gen + validation + retries for full project
        stalledInterval: 450_000,    // 7.5 min — check for stalled jobs
        lockRenewTime: 200_000,      // renew lock every ~3.3 min (well within 15 min lockDuration)
      }
    )
    console.log('[Builder] Worker initialized successfully')
  }
} catch (err) {
  console.error('[Builder] Failed to initialize worker:', err)
}

export const builderWorker = workerInstance

// Only attach event handlers if worker was created successfully
if (workerInstance) {
  workerInstance.on('completed', (job) => {
    console.log(`[Builder] Worker completed job ${job.id}`)
  })

  workerInstance.on('failed', (job, err) => {
    console.error(`[Builder] Worker failed job ${job?.id}:`, err.message)
  })

  workerInstance.on('error', (err) => {
    console.error('[Builder] Worker error:', err)
  })
}
