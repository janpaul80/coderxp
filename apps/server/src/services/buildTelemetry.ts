import { Prisma, JobStatus } from '@prisma/client'
import { prisma } from '../lib/prisma'

// For nullable Json? fields, Prisma requires Prisma.JsonNull (not plain null) to clear them
function nullableJson(
  val: Prisma.InputJsonValue | null | undefined
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (val === undefined) return undefined
  if (val === null) return Prisma.JsonNull
  return val
}

// ─── Failure / log types ──────────────────────────────────────

export type BuildFailureCategory =
  | 'scaffold_failure'
  | 'workspace_failure'
  | 'file_write_failure'
  | 'install_failure'
  | 'preview_start_failure'
  | 'preview_health_failure'
  | 'cleanup_failure'
  | 'credential_timeout'
  | 'unknown_failure'

export type BuildLogLevel = 'info' | 'warn' | 'error' | 'success'
export type BuildLogStep = 
  | 'workspace_prepare'
  | 'scaffold_generate' 
  | 'files_write'
  | 'scaffold_validate'
  | 'install_deps'
  | 'preview_start'
  | 'preview_healthcheck'
  | 'code_quality'
  | string // fallback
  | 'scaffold_generate'
  | 'scaffold_validate'
  | 'workspace_prepare'
  | 'files_write'
  | 'install_deps'
  | 'preview_start'
  | 'preview_healthcheck'
  | 'repair'
  | 'complete'
  | 'failed'

export interface BuildLogEntry {
  id: string
  timestamp: string
  level: BuildLogLevel
  step: BuildLogStep
  message: string
  meta?: Record<string, unknown>
}

export interface CommandSummary {
  command: string
  cwd: string
  exitCode: number | null
  durationMs: number
  timedOut: boolean
  stdoutTail?: string
  stderrTail?: string
}

// ─── Patch type — all fields that callers may update ─────────

export interface JobStepPatch {
  status?: JobStatus
  currentStep?: string | null
  progress?: number
  previewStatus?: string | null
  failureCategory?: BuildFailureCategory | null
  retryCount?: number
  commandSummary?: Prisma.InputJsonValue | null
  scaffoldValidation?: Prisma.InputJsonValue | null
  buildMeta?: Prisma.InputJsonValue | null
  generatedFileCount?: number | null
  generatedTotalBytes?: number | null
  generatedKeyFiles?: Prisma.InputJsonValue | null
  workspacePath?: string | null
  startedAt?: Date | null
  completedAt?: Date | null
  previewUrl?: string | null
  previewPort?: number | null
  previewPid?: number | null
  fileCount?: number | null
  totalBytes?: number | null
  error?: string | null
  errorDetails?: string | null
  workerName?: string | null
  workerSelectedReason?: string | null
  repairAttemptCount?: number
}

// ─── Helpers ──────────────────────────────────────────────────

let seq = 0
function logId(jobId: string): string {
  seq++
  return `${jobId}-telemetry-${seq}`
}

function tail(input: string, max = 1500): string {
  if (!input) return ''
  return input.length <= max ? input : input.slice(input.length - max)
}

export function sanitizeCommandSummary(summary: CommandSummary): CommandSummary {
  return {
    ...summary,
    stdoutTail: tail(summary.stdoutTail ?? ''),
    stderrTail: tail(summary.stderrTail ?? ''),
  }
}

export function classifyFailure(error: unknown, phase?: string): BuildFailureCategory {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase()
  const p = (phase ?? '').toLowerCase()

  // Phase-first classification (most reliable)
  if (p.includes('credential')) return 'credential_timeout'
  if (p.includes('scaffold')) return 'scaffold_failure'
  if (p.includes('workspace')) return 'workspace_failure'
  if (p.includes('files_write') || p.includes('file_write')) return 'file_write_failure'
  if (p.includes('install')) return 'install_failure'
  if (p.includes('preview_start') || p.includes('preview start')) return 'preview_start_failure'
  if (p.includes('health') || p.includes('healthcheck')) return 'preview_health_failure'
  if (p.includes('cleanup')) return 'cleanup_failure'

  // Message-based fallback
  if (msg.includes('plan not found') || msg.includes('project not found')) return 'scaffold_failure'
  if (msg.includes('no free ports') || msg.includes('port exhausted')) return 'preview_start_failure'
  if (msg.includes('scaffold')) return 'scaffold_failure'
  if (msg.includes('workspace') || msg.includes('missing files')) return 'workspace_failure'
  if (msg.includes('enoent') || msg.includes('eacces') || msg.includes('write')) return 'file_write_failure'
  if (msg.includes('credential request timed out') || msg.includes('credential_timeout')) return 'credential_timeout'
  if (msg.includes('npm install') || msg.includes('install failed') || msg.includes('timed out after 5 minutes')) return 'install_failure'
  if (msg.includes('vite') || msg.includes('preview start')) return 'preview_start_failure'
  if (msg.includes('health check') || msg.includes('did not become healthy')) return 'preview_health_failure'
  if (msg.includes('taskkill') || msg.includes('sigterm')) return 'cleanup_failure'
  return 'unknown_failure'
}

// ─── appendJobLog ─────────────────────────────────────────────

export async function appendJobLog(
  jobId: string,
  entry: Omit<BuildLogEntry, 'id' | 'timestamp'>
): Promise<BuildLogEntry> {
  const log: BuildLogEntry = {
    id: logId(jobId),
    timestamp: new Date().toISOString(),
    ...entry,
  }

  const current = await prisma.job.findUnique({
    where: { id: jobId },
    select: { logs: true },
  })

  // logs is Json (non-nullable) in schema — always an array at runtime
  const existingLogs: Prisma.InputJsonValue[] = Array.isArray(current?.logs)
    ? (current!.logs as Prisma.JsonArray).map(l => l as Prisma.InputJsonValue)
    : []

  existingLogs.push(log as unknown as Prisma.InputJsonValue)

  await prisma.job.update({
    where: { id: jobId },
    data: { logs: existingLogs },
  })

  return log
}

// ─── setJobStep ───────────────────────────────────────────────
// Only includes fields that are explicitly set in the patch (undefined = skip).

export async function setJobStep(jobId: string, patch: JobStepPatch): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      ...(patch.status !== undefined && { status: patch.status }),
      ...(patch.currentStep !== undefined && { currentStep: patch.currentStep }),
      ...(patch.progress !== undefined && { progress: patch.progress }),
      ...(patch.previewStatus !== undefined && { previewStatus: patch.previewStatus }),
      ...(patch.failureCategory !== undefined && { failureCategory: patch.failureCategory }),
      ...(patch.retryCount !== undefined && { retryCount: patch.retryCount }),
      ...(patch.commandSummary !== undefined && { commandSummary: nullableJson(patch.commandSummary) }),
      ...(patch.scaffoldValidation !== undefined && { scaffoldValidation: nullableJson(patch.scaffoldValidation) }),
      ...(patch.buildMeta !== undefined && { buildMeta: nullableJson(patch.buildMeta) }),
      ...(patch.generatedFileCount !== undefined && { generatedFileCount: patch.generatedFileCount }),
      ...(patch.generatedTotalBytes !== undefined && { generatedTotalBytes: patch.generatedTotalBytes }),
      ...(patch.generatedKeyFiles !== undefined && { generatedKeyFiles: nullableJson(patch.generatedKeyFiles) }),
      ...(patch.workspacePath !== undefined && { workspacePath: patch.workspacePath }),
      ...(patch.startedAt !== undefined && { startedAt: patch.startedAt }),
      ...(patch.completedAt !== undefined && { completedAt: patch.completedAt }),
      ...(patch.previewUrl !== undefined && { previewUrl: patch.previewUrl }),
      ...(patch.previewPort !== undefined && { previewPort: patch.previewPort }),
      ...(patch.previewPid !== undefined && { previewPid: patch.previewPid }),
      ...(patch.fileCount !== undefined && { fileCount: patch.fileCount }),
      ...(patch.totalBytes !== undefined && { totalBytes: patch.totalBytes }),
      ...(patch.error !== undefined && { error: patch.error }),
      ...(patch.errorDetails !== undefined && { errorDetails: patch.errorDetails }),
      ...(patch.workerName !== undefined && { workerName: patch.workerName }),
      ...(patch.workerSelectedReason !== undefined && { workerSelectedReason: patch.workerSelectedReason }),
      ...(patch.repairAttemptCount !== undefined && { repairAttemptCount: patch.repairAttemptCount }),
    },
  })
}
