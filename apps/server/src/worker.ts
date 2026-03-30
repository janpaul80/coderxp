/**
 * worker.ts — Phase 5 Slice 3
 *
 * Standalone worker entry point for remote worker nodes (e.g. server ending in .220).
 *
 * Run on the remote worker machine:
 *   WORKER_QUEUE_NAME=builder-primary \
 *   WORKER_NAME=server-220 \
 *   WORKER_SOCKET_CALLBACK_URL=https://api.codedxp.com \
 *   WORKER_INTERNAL_SECRET=<secret> \
 *   WORKER_PORT=3002 \
 *   node dist/worker.js
 *
 * The worker:
 *   - Connects to the shared Redis + Postgres (same env vars as main server)
 *   - Listens on WORKER_QUEUE_NAME (default: 'builder-primary')
 *   - Relays socket events back to main server via WORKER_SOCKET_CALLBACK_URL
 *   - Exposes GET /worker/health on WORKER_PORT (default: 3002)
 *
 * Requires Node 18+ (uses global fetch).
 */

import './env'

import express, { Request, Response } from 'express'
import { createServer } from 'http'
import { Worker, Job, ConnectionOptions } from 'bullmq'
type JobStatus = string // Matches prisma JobStatus enum values
import { prisma } from './lib/prisma'
import {
  createWorkspace,
  getWorkspaceFileTree,
  getWorkspaceTotalBytes,
} from './services/workspace'
import { generateProjectFiles } from './services/codeGenerator'
import type { CodeGenProject, CodeGenCallbacks } from './services/codeGeneratorTypes'
import {
  startPreview,
  type PreviewLogEntry,
  type PreviewTelemetryCallbacks,
} from './services/previewManager'
import {
  appendJobLog,
  classifyFailure,
  setJobStep,
  sanitizeCommandSummary,
  type BuildLogStep,
  type CommandSummary,
} from './services/buildTelemetry'

// ─── Config ───────────────────────────────────────────────────

const QUEUE_NAME          = process.env.WORKER_QUEUE_NAME ?? 'builder-primary'
const WORKER_NAME         = process.env.WORKER_NAME ?? 'remote-worker'
const SOCKET_CALLBACK_URL = process.env.WORKER_SOCKET_CALLBACK_URL ?? ''
const INTERNAL_SECRET     = process.env.WORKER_INTERNAL_SECRET ?? ''
const WORKER_PORT         = parseInt(process.env.WORKER_PORT ?? '3002', 10)
const WORKER_CONCURRENCY  = parseInt(process.env.WORKER_CONCURRENCY ?? '3', 10)
const START_TIME          = Date.now()

// ─── Redis connection ─────────────────────────────────────────

const redisConnection: ConnectionOptions = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  maxRetriesPerRequest: 3,
  enableOfflineQueue: false,
  connectTimeout: 5000,
}

// ─── Socket relay (uses Node 18+ global fetch) ────────────────

async function emitToUser(userId: string, event: string, data: unknown): Promise<void> {
  if (!SOCKET_CALLBACK_URL || !INTERNAL_SECRET) {
    console.warn(`[Worker:${WORKER_NAME}] WORKER_SOCKET_CALLBACK_URL or WORKER_INTERNAL_SECRET not set — socket event dropped: ${event}`)
    return
  }
  try {
    await fetch(`${SOCKET_CALLBACK_URL}/internal/worker/emit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${INTERNAL_SECRET}`,
      },
      body: JSON.stringify({ userId, event, data }),
    })
  } catch (err) {
    console.error(`[Worker:${WORKER_NAME}] Socket relay failed for event ${event}:`, err)
  }
}

function emitProgress(userId: string, jobId: string, status: string, label: string, progress: number, logs: unknown[]): void {
  void emitToUser(userId, 'job:updated', { id: jobId, status, currentStep: label, progress, logs })
}

function emitLog(userId: string, jobId: string, log: unknown): void {
  void emitToUser(userId, 'job:log', { jobId, log })
}

// ─── Log factory ──────────────────────────────────────────────

interface BuildSocketLog {
  id: string
  timestamp: string
  type: 'create' | 'write' | 'validate' | 'info' | 'success' | 'error' | 'run'
  message: string
  filePath?: string
  bytes?: number
  source?: string
}

let logSeq = 0
function makeLog(jobId: string, type: BuildSocketLog['type'], message: string, filePath?: string, bytes?: number, source?: string): BuildSocketLog {
  logSeq++
  return { id: `${jobId}-log-${logSeq}`, timestamp: new Date().toISOString(), type, message, filePath, bytes, source }
}

// ─── Worker ───────────────────────────────────────────────────

let activeJobs = 0

const worker = new Worker(
  QUEUE_NAME,
  async (job: Job) => {
    const { jobId, projectId, planId, userId } = job.data as {
      jobId: string
      projectId: string
      planId: string
      userId: string
    }

    activeJobs++
    logSeq = 0
    const allLogs: BuildSocketLog[] = []
    const retryCount = Math.max(job.attemptsMade ?? 0, 0)
    let currentPhase = 'initializing'

    const addLog = async (
      type: BuildSocketLog['type'],
      message: string,
      step: BuildLogStep = 'files_write',
      meta?: Record<string, unknown>,
      filePath?: string,
      bytes?: number,
      source?: string
    ) => {
      const log = makeLog(jobId, type, message, filePath, bytes, source)
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
      patch?: any
    ) => {
      await (setJobStep as any)(jobId, {
        status,
        currentStep,
        progress,
        retryCount,
        ...(patch ?? {}),
      })
      emitProgress(userId, jobId, status, currentStep, progress, allLogs)
    }

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
        await setJobStep(jobId, { commandSummary: safe as any })
      },
      onFailure: async ({ phase, error, commandSummary }) => {
        const category = classifyFailure(error, phase)
        const safeSummary = commandSummary ? sanitizeCommandSummary(commandSummary as CommandSummary) : undefined
        await setJobStep(jobId, {
          status: 'failed',
          currentStep: 'Build failed',
          previewStatus: 'failed',
          failureCategory: category,
          commandSummary: safeSummary ? (safeSummary as any) : null,
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
    }

    const addPreviewLog = async (previewLog: PreviewLogEntry) => {
      const type: BuildSocketLog['type'] =
        previewLog.type === 'error' ? 'error'
        : previewLog.type === 'success' ? 'success'
        : 'run'
      await addLog(type, previewLog.message, 'preview_start', { source: previewLog.source }, undefined, undefined, previewLog.source)
    }

    try {
      currentPhase = 'scaffold'
      const plan = await prisma.plan.findUnique({ where: { id: planId } })
      if (!plan) throw new Error('Plan not found')

      const project = await prisma.project.findUnique({ where: { id: projectId } })
      if (!project) throw new Error('Project not found')

      await setJobStep(jobId, { status: 'initializing', startedAt: new Date(), retryCount, workerName: WORKER_NAME })
      await setStep('initializing', 'Initializing project structure', 5)

      currentPhase = 'workspace'
      const workspacePath = createWorkspace(jobId)
      await addLog('info', `WORKSPACE ${workspacePath}`, 'workspace_prepare', { workspacePath })

      const features = Array.isArray(plan.features) ? plan.features as string[] : []
      const techStack = (plan.techStack as Record<string, unknown>) ?? {}
      const frontendScope = Array.isArray(plan.frontendScope) ? plan.frontendScope as string[] : []
      const backendScope = Array.isArray(plan.backendScope) ? plan.backendScope as string[] : []
      const integrations = Array.isArray(plan.integrations) ? plan.integrations as string[] : []

      // ── Build the CodeGenProject from the plan ──────────────
      const codeGenProject: CodeGenProject = {
        projectName: project.name,
        summary: typeof plan.summary === 'string' ? plan.summary : 'A CoderXP generated application',
        features,
        techStack: techStack as Record<string, string[]>,
        frontendScope,
        backendScope,
        integrations,
      }

      // ── Set up streaming callbacks ──────────────────────────
      // These wire generateProjectFiles() output directly to the frontend
      // via socket events, so users see real code being written live.
      let filesGenerated = 0
      let totalFileCount = 0

      const codeGenCallbacks: CodeGenCallbacks = {
        onPhaseStart: async (phase: string, fileCount: number) => {
          totalFileCount += fileCount
          const phaseLabel = phase === 'templates' ? 'Configuration files' : 'AI-generated code'
          await addLog('info', `── ${phaseLabel} (${fileCount} files) ──`, 'scaffold_generate', { phase, fileCount })
          if (phase === 'templates') {
            await setStep('initializing', 'Generating configuration files...', 10)
          } else {
            await setStep('generating_frontend', 'Writing application code...', 30)
          }
        },

        onFileStart: async (path: string, description: string) => {
          currentPhase = 'files_write'
          await addLog('info', `GENERATING ${path}`, 'files_write', { relativePath: path, description })
          // Emit streaming file start — frontend will show the file path in StreamingCodePanel
          void emitToUser(userId, 'job:file_token', { jobId, path, delta: '' })
        },

        onFileComplete: async (path: string, bytes: number, generatedBy: 'ai' | 'template', content: string) => {
          filesGenerated++
          const progress = Math.min(85, 10 + Math.round((filesGenerated / Math.max(totalFileCount, 1)) * 75))
          await addLog('create', `CREATE ${path} (${(bytes / 1024).toFixed(1)} KB) [${generatedBy}]`, 'files_write', {
            relativePath: path, bytes, generatedBy,
          }, path, bytes, generatedBy)
          await setStep(
            filesGenerated <= totalFileCount * 0.5 ? 'generating_frontend' : 'generating_backend',
            `Writing ${path}...`,
            progress,
          )
          void emitToUser(userId, 'job:file_token', { jobId, path, delta: content })
        },

        onFileError: async (path: string, error: string) => {
          await addLog('error', `FAILED ${path}: ${error}`, 'files_write', { relativePath: path, error })
        },

        // ── Live token streaming ──────────────────────────────
        // Each delta from the AI is emitted to the frontend in real time.
        // The frontend's StreamingCodePanel shows code appearing character
        // by character with a blinking cursor — the "ghostwriter" effect.
        onFileToken: async (path: string, delta: string) => {
          void emitToUser(userId, 'job:file_token', { jobId, path, delta })
        },

        onValidationError: async (error) => {
          await addLog('error', `VALIDATION: ${error.message} (${error.filePath ?? 'unknown'})`, 'code_quality', {
            errorType: error.type,
            filePath: error.filePath,
          })
        },
      }

      // ── Phase: AI Code Generation ───────────────────────────
      currentPhase = 'codegen'
      await addLog('info', 'Starting AI code generation...', 'scaffold_generate', {
        projectName: project.name,
        featureCount: features.length,
        hasBackend: backendScope.length > 0,
      })

      const generated = await generateProjectFiles(workspacePath, codeGenProject, codeGenCallbacks)

      // ── Phase: Validate ─────────────────────────────────────
      currentPhase = 'scaffold_validate'
      await setStep('testing', 'Validating workspace', 87)
      const fileTree = getWorkspaceFileTree(workspacePath)
      const totalBytes = getWorkspaceTotalBytes(workspacePath)
      const aiFileCount = generated.filter(f => f.generatedBy === 'ai').length
      const templateFileCount = generated.filter(f => f.generatedBy === 'template').length

      await addLog('validate', `VALIDATE ${fileTree.length} files, ${(totalBytes / 1024).toFixed(1)} KB total (${aiFileCount} AI, ${templateFileCount} template)`, 'scaffold_validate', {
        expected: generated.length,
        actual: fileTree.length,
        aiFiles: aiFileCount,
        templateFiles: templateFileCount,
      })

      const generatedKeyFiles = fileTree.filter(p => ['package.json', 'vite.config.ts', 'src/main.tsx', 'src/App.tsx', 'server/index.ts'].includes(p))

      await setJobStep(jobId, {
        workspacePath,
        generatedFileCount: fileTree.length,
        generatedTotalBytes: totalBytes,
        generatedKeyFiles: generatedKeyFiles as any,
        scaffoldValidation: { expectedCount: generated.length, actualCount: fileTree.length, missingCount: 0, aiFiles: aiFileCount, templateFiles: templateFileCount } as any,
      })

      // Persist file records in DB
      await Promise.all(
        generated.map(async (f) => {
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

      await setJobStep(jobId, { workspacePath, fileCount: fileTree.length, totalBytes })


      currentPhase = 'install'
      await addLog('info', `INSTALL starting npm install in ${workspacePath}`, 'install_deps', { workspacePath })

      currentPhase = 'preview_start'
      const previewInstance = await startPreview(jobId, workspacePath, addPreviewLog, previewCallbacks)

      // Public URL: routed through nginx → Node proxy → Vite dev server
      // Remote users access via https://domain/api/preview/:jobId/app/
      const clientUrl = (process.env.CLIENT_URL ?? 'http://localhost:3001').replace(/\/$/, '')
      const publicPreviewUrl = `${clientUrl}/api/preview/${jobId}/app/`

      await addLog('success', `PREVIEW READY at ${publicPreviewUrl}`, 'complete', {
        previewUrl: publicPreviewUrl,
        previewPort: previewInstance.port,
        previewPid: previewInstance.pid,
      })

      await setJobStep(jobId, {
        status: 'complete',
        currentStep: 'Preview ready',
        progress: 100,
        previewUrl: publicPreviewUrl,
        previewPort: previewInstance.port,
        previewPid: previewInstance.pid,
        previewStatus: 'ready',
        completedAt: new Date(),
        buildMeta: {
          installDurationMs: previewInstance.installDurationMs ?? null,
          startDurationMs: previewInstance.startDurationMs ?? null,
        } as any,
      })

      await prisma.job.update({ where: { id: jobId }, data: { logs: allLogs as any } })
      await prisma.project.update({ where: { id: projectId }, data: { status: 'ready' } })

      void emitToUser(userId, 'job:complete', { jobId, previewUrl: publicPreviewUrl, previewPort: previewInstance.port, previewPid: previewInstance.pid })
      void emitToUser(userId, 'preview:ready', { jobId, url: publicPreviewUrl, port: previewInstance.port, pid: previewInstance.pid })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Build failed'
      const errorDetails = err instanceof Error && err.stack ? err.stack.slice(0, 2000) : null
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
      await prisma.job.update({ where: { id: jobId }, data: { logs: allLogs as any } })
      await prisma.project.update({ where: { id: projectId }, data: { status: 'error' } })
      void emitToUser(userId, 'job:failed', { jobId, error: { code: 'BUILD_FAILED', message, category, retryCount } })

      throw err
    } finally {
      activeJobs--
    }
  },
  {
    connection: redisConnection,
    concurrency: WORKER_CONCURRENCY,
  }
)

worker.on('completed', (job: Job) => console.log(`[Worker:${WORKER_NAME}] Completed job ${job.id}`))
worker.on('failed', (job: Job | undefined, err: Error) => console.error(`[Worker:${WORKER_NAME}] Failed job ${job?.id}:`, err.message))
worker.on('error', (err: Error) => console.error(`[Worker:${WORKER_NAME}] Error:`, err))

console.log(`[Worker:${WORKER_NAME}] Listening on queue '${QUEUE_NAME}' (concurrency: ${WORKER_CONCURRENCY})`)

// ─── Health endpoint ──────────────────────────────────────────

const app = express()
app.use(express.json())

app.get('/worker/health', (_req: Request, res: Response) => {
  res.json({
    healthy: true,
    workerName: WORKER_NAME,
    queueName: QUEUE_NAME,
    activeJobs,
    concurrency: WORKER_CONCURRENCY,
    uptimeMs: Date.now() - START_TIME,
    version: '5.3.0',
  })
})

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', workerName: WORKER_NAME, timestamp: new Date().toISOString() })
})

const server = createServer(app)
server.listen(WORKER_PORT, () => {
  console.log(`[Worker:${WORKER_NAME}] Health endpoint running on http://0.0.0.0:${WORKER_PORT}/worker/health`)
})

// ─── Graceful shutdown ────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  console.log(`[Worker:${WORKER_NAME}] ${signal} received — shutting down...`)
  await worker.close()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10000)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT',  () => void shutdown('SIGINT'))
