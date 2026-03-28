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
import { JobStatus, Prisma } from '@prisma/client'
import { prisma } from './lib/prisma'
import {
  createWorkspace,
  writeWorkspaceFile,
  getWorkspaceFileTree,
  getWorkspaceTotalBytes,
  validateWorkspaceFiles,
} from './services/workspace'
import { generateScaffold, type ScaffoldInput } from './services/scaffold'
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
      patch?: Partial<Parameters<typeof setJobStep>[1]>
    ) => {
      await setJobStep(jobId, { status, currentStep, progress, retryCount, ...(patch ?? {}) })
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
        await setJobStep(jobId, { commandSummary: safe as unknown as Prisma.InputJsonValue })
      },
      onFailure: async ({ phase, error, commandSummary }) => {
        const category = classifyFailure(error, phase)
        const safeSummary = commandSummary ? sanitizeCommandSummary(commandSummary as CommandSummary) : undefined
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

      const scaffoldInput: ScaffoldInput = {
        projectName: project.name,
        summary: typeof plan.summary === 'string' ? plan.summary : 'A CodedXP generated application',
        features, techStack, frontendScope, backendScope, integrations,
      }

      currentPhase = 'scaffold'
      await addLog('info', 'Generating scaffold', 'scaffold_generate', { templateVersion: '3.x' })
      const scaffold = generateScaffold(scaffoldInput)

      currentPhase = 'files_write'
      const writeBatch = async (paths: string[]) => {
        for (const f of scaffold.files.filter(sf => paths.includes(sf.relativePath))) {
          const written = writeWorkspaceFile(workspacePath, f.relativePath, f.content)
          await addLog('create', `CREATE ${f.relativePath} (${(written.bytes / 1024).toFixed(1)} KB)`, 'files_write', { relativePath: f.relativePath, bytes: written.bytes }, f.relativePath, written.bytes)
        }
      }

      const step1Files = ['package.json', 'README.md', '.gitignore', 'tsconfig.json', 'tsconfig.node.json']
      await writeBatch(step1Files)
      await setStep('installing', 'Writing build configuration', 15)

      const step2Files = ['vite.config.ts', 'tailwind.config.js', 'postcss.config.js', 'index.html', '.env.example']
      await writeBatch(step2Files)
      await setStep('generating_frontend', 'Generating frontend code', 35)

      const frontendPaths = ['src/main.tsx', 'src/App.tsx', 'src/index.css', 'src/lib/api.ts', 'src/components/Header.tsx', 'src/components/Dashboard.tsx', 'src/pages/Home.tsx', 'src/pages/Login.tsx', 'src/pages/Register.tsx']
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

      const writtenPaths = new Set([...step1Files, ...step2Files, ...frontendPaths, ...backendPaths, ...authPaths, ...integrationPaths])
      for (const f of scaffold.files.filter(sf => !writtenPaths.has(sf.relativePath))) {
        const written = writeWorkspaceFile(workspacePath, f.relativePath, f.content)
        await addLog('create', `CREATE ${f.relativePath} (${(written.bytes / 1024).toFixed(1)} KB)`, 'files_write', { relativePath: f.relativePath, bytes: written.bytes }, f.relativePath, written.bytes)
      }

      currentPhase = 'scaffold_validate'
      await setStep('testing', 'Validating workspace', 90)
      const fileTree = getWorkspaceFileTree(workspacePath)
      const totalBytes = getWorkspaceTotalBytes(workspacePath)
      const expectedFiles = scaffold.files.map(f => f.relativePath)
      const missingFiles = validateWorkspaceFiles(workspacePath, expectedFiles)

      await addLog('validate', `VALIDATE ${fileTree.length} files, ${(totalBytes / 1024).toFixed(1)} KB total`, 'scaffold_validate', { expected: expectedFiles.length, actual: fileTree.length })

      if (missingFiles.length > 0) {
        await addLog('error', `MISSING ${missingFiles.length} files`, 'scaffold_validate', { missingFiles })
        throw new Error(`Workspace validation failed: ${missingFiles.length} missing files`)
      }

      const generatedKeyFiles = fileTree.filter(p => ['package.json', 'vite.config.ts', 'src/main.tsx', 'src/App.tsx', 'server/index.ts'].includes(p))

      await setJobStep(jobId, {
        workspacePath,
        generatedFileCount: fileTree.length,
        generatedTotalBytes: totalBytes,
        generatedKeyFiles: generatedKeyFiles as Prisma.InputJsonValue,
        scaffoldValidation: { expectedCount: expectedFiles.length, actualCount: fileTree.length, missingCount: 0 } as Prisma.InputJsonValue,
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
        } as Prisma.InputJsonValue,
      })

      await prisma.job.update({ where: { id: jobId }, data: { logs: allLogs as unknown as Prisma.InputJsonValue } })
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
      await prisma.job.update({ where: { id: jobId }, data: { logs: allLogs as unknown as Prisma.InputJsonValue } })
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
