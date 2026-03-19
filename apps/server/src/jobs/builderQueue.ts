/**
 * Builder Queue — Phase 4 hardening
 *
 * Real file generation + real preview runtime + structured telemetry.
 */

import { Queue, Worker, Job, ConnectionOptions } from 'bullmq'
import { JobStatus, Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { io } from '../index'
import { getUserSocketIds } from '../socket/events'
import {
  createWorkspace,
  writeWorkspaceFile,
  getWorkspaceFileTree,
  getWorkspaceTotalBytes,
  validateWorkspaceFiles,
} from '../services/workspace'
import { generateScaffold, type ScaffoldInput } from '../services/scaffold'
import {
  startPreview,
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
} from '../services/memory'
import {
  registerCredentialResolver,
  cancelCredentialResolver,
  CREDENTIAL_TIMEOUT_MS,
} from '../services/credentialService'

// ─── Redis connection ─────────────────────────────────────────

const redisConnection: ConnectionOptions = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  maxRetriesPerRequest: 3,
  enableOfflineQueue: false,
  connectTimeout: 5000,
}

// ─── Queue ────────────────────────────────────────────────────

let queueInstance: Queue | null = null
try {
  queueInstance = new Queue('builder', {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  })
  console.log('[Builder] Queue initialized successfully')
} catch (err) {
  console.error('[Builder] Failed to initialize queue:', err)
}

export const builderQueue = queueInstance

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
  logs: unknown[]
) {
  emitToUser(userId, 'job:updated', {
    id: jobId,
    status,
    currentStep: label,
    progress,
    logs,
  })
}

function emitLog(userId: string, jobId: string, log: unknown) {
  emitToUser(userId, 'job:log', { jobId, log })
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
// Checks that each item in frontendScope has a corresponding file
// in the generated workspace. Returns the list of scope items that
// appear to be missing. Does NOT fail the build — surfaces as a warning.

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
    if (!patternGroup) continue // No known pattern to check — skip

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

        // Hoisted so catch block can access for memory writes (may remain null if error is early)
        let planRecord: { summary: unknown } | null = null
        let projectRecord: { name: string } | null = null

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
          emitProgress(userId, jobId, status, currentStep, progress, allLogs)
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
        // Pauses the build, emits credentials:requested to the user,
        // and waits (up to CREDENTIAL_TIMEOUT_MS) for the user to provide or skip.
        // Returns the provided values, or null if skipped/timed out.
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

          // Emit to frontend — triggers CredentialModal
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
            // Timeout — mark expired in DB
            await prisma.credentialRequest.update({
              where: { id: credReq.id },
              data: { status: 'expired' },
            }).catch(() => {/* ignore if already updated */})
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
          // Mark job as initializing FIRST — ensures frontend always gets at least one
          // job:updated and job:log event before any lookup failures reach the catch block.
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
          await addLog('info', `WORKSPACE ${workspacePath}`, 'workspace_prepare', { workspacePath })

          const features = Array.isArray(plan.features) ? plan.features as string[] : []
          const techStack = (plan.techStack as Record<string, unknown>) ?? {}
          const frontendScope = Array.isArray(plan.frontendScope) ? plan.frontendScope as string[] : []
          const backendScope = Array.isArray(plan.backendScope) ? plan.backendScope as string[] : []
          const integrations = Array.isArray(plan.integrations) ? plan.integrations as string[] : []

          const scaffoldInput: ScaffoldInput = {
            projectName: project.name,
            summary: typeof plan.summary === 'string' ? plan.summary : 'A CodedXP generated application',
            features,
            techStack,
            frontendScope,
            backendScope,
            integrations,
          }

          currentPhase = 'scaffold'
          await addLog('info', 'Generating scaffold', 'scaffold_generate', { templateVersion: '3.x' })
          const scaffold = generateScaffold(scaffoldInput)

          currentPhase = 'files_write'
          const writeBatch = async (paths: string[]) => {
            for (const f of scaffold.files.filter(sf => paths.includes(sf.relativePath))) {
              const written = writeWorkspaceFile(workspacePath, f.relativePath, f.content)
              await addLog(
                'create',
                `CREATE ${f.relativePath} (${(written.bytes / 1024).toFixed(1)} KB)`,
                'files_write',
                { relativePath: f.relativePath, bytes: written.bytes },
                f.relativePath,
                written.bytes
              )
            }
          }

          const step1Files = ['package.json', 'README.md', '.gitignore', 'tsconfig.json', 'tsconfig.node.json']
          await writeBatch(step1Files)

          await setStep('installing', 'Writing build configuration', 15)
          const step2Files = ['vite.config.ts', 'tailwind.config.js', 'postcss.config.js', 'index.html', '.env.example']
          await writeBatch(step2Files)

          await setStep('generating_frontend', 'Generating frontend code', 35)
          const frontendPaths = [
            'src/main.tsx', 'src/App.tsx', 'src/index.css', 'src/lib/api.ts',
            'src/components/Header.tsx', 'src/components/Dashboard.tsx',
            'src/pages/Home.tsx', 'src/pages/Login.tsx', 'src/pages/Register.tsx',
          ]
          await writeBatch(frontendPaths)

          await setStep('generating_backend', 'Generating backend code', 55)
          const backendPaths = ['server/index.ts', 'server/routes/api.ts']
          await writeBatch(backendPaths)

          await setStep('wiring_auth', 'Wiring authentication', 65)
          const authPaths = ['server/routes/auth.ts', 'server/middleware/auth.ts']
          await writeBatch(authPaths)

          await setStep('wiring_integrations', 'Wiring integrations', 75)
          const integrationPaths = ['prisma/schema.prisma']
          await writeBatch(integrationPaths)

          await setStep('running', 'Finalizing workspace', 85)
          const writtenPaths = new Set([
            ...step1Files, ...step2Files, ...frontendPaths,
            ...backendPaths, ...authPaths, ...integrationPaths,
          ])
          for (const f of scaffold.files.filter(sf => !writtenPaths.has(sf.relativePath))) {
            const written = writeWorkspaceFile(workspacePath, f.relativePath, f.content)
            await addLog(
              'create',
              `CREATE ${f.relativePath} (${(written.bytes / 1024).toFixed(1)} KB)`,
              'files_write',
              { relativePath: f.relativePath, bytes: written.bytes },
              f.relativePath,
              written.bytes
            )
          }

          currentPhase = 'scaffold_validate'
          await setStep('testing', 'Validating workspace', 90)
          const fileTree = getWorkspaceFileTree(workspacePath)
          const totalBytes = getWorkspaceTotalBytes(workspacePath)
          const expectedFiles = scaffold.files.map(f => f.relativePath)
          const missingFiles = validateWorkspaceFiles(workspacePath, expectedFiles)

          await addLog('validate', `VALIDATE ${fileTree.length} files, ${(totalBytes / 1024).toFixed(1)} KB total`, 'scaffold_validate', {
            expected: expectedFiles.length,
            actual: fileTree.length,
          })

          if (missingFiles.length > 0) {
            await addLog('error', `MISSING ${missingFiles.length} files`, 'scaffold_validate', { missingFiles })
            throw new Error(`Workspace validation failed: ${missingFiles.length} missing files`)
          }

          // Gap 6: Section completeness validation — warn but never fail the build
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
            scaffoldValidation: {
              expectedCount: expectedFiles.length,
              actualCount: fileTree.length,
              missingCount: 0,
            } as Prisma.InputJsonValue,
          })

          await Promise.all(
            scaffold.files.map(async (f) => {
              const bytes = Buffer.byteLength(f.content, 'utf-8')
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
                  size: bytes,
                  path: `${workspacePath}/${f.relativePath}`,
                  url: null,
                },
              })
            })
          )

          // Persist workspace file count + total bytes (runtime-proven values)
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

          currentPhase = 'preview_start'
          const previewInstance = await startPreview(
            jobId,
            workspacePath,
            addPreviewLog,
            previewCallbacks
          )

          await addLog('success', `PREVIEW READY at ${previewInstance.url}`, 'complete', {
            previewUrl: previewInstance.url,
            previewPort: previewInstance.port,
            previewPid: previewInstance.pid,
          })

          // buildMeta: { missingSections, installDurationMs, startDurationMs } — Gap 6 completion validator
          await setJobStep(jobId, {
            status: 'complete',
            currentStep: 'Preview ready',
            progress: 100,
            previewUrl: previewInstance.url,
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
            previewUrl: previewInstance.url,
            previewPort: previewInstance.port,
            previewPid: previewInstance.pid,
          })
          emitToUser(userId, 'preview:ready', {
            jobId,
            url: previewInstance.url,
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
          // Write memory.md into workspace as supplemental artifact (synchronous, non-fatal)
          writeWorkspaceMemoryFile(workspacePath, {
            projectName: project.name,
            projectId,
            planSummary: typeof plan.summary === 'string' ? plan.summary : '',
            techStack,
            integrations,
            buildTimestamp: new Date().toISOString(),
          })
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

          // Record build failure in memory (async/non-blocking)
          void recordBuildFailed(projectId, userId, {
            phase: currentPhase,
            error: message,
            category: category ?? 'unknown',
            projectName: projectRecord?.name ?? '',
            projectSummary: typeof planRecord?.summary === 'string' ? planRecord.summary : '',
          })

          throw err
        }
      },
      {
        connection: redisConnection,
        concurrency: 3,
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
