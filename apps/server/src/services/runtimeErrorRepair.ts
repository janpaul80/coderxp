/**
 * runtimeErrorRepair.ts — Sprint 16
 *
 * Handles the repair process for runtime errors:
 * 1. Fetches error details and project workspace
 * 2. Parses errors to identify affected files
 * 3. Generates repair context for AI
 * 4. Creates a repair job to fix the issues
 * 5. Updates error status throughout the process
 */

import { prisma } from '../lib/prisma'
import { parseRuntimeError, buildRuntimeErrorRepairContext, getAffectedFiles } from './runtimeErrorParser'
import { repairProjectFiles } from './codeGenerator'
import { io } from '../index'
import { getUserSocketIds } from '../socket/events'
import * as fs from 'fs'
import * as path from 'path'

// ─── Types ────────────────────────────────────────────────────

interface RuntimeErrorRepairOptions {
  forceRepair?: boolean
}

// ─── Repair Process ────────────────────────────────────────────

/**
 * Start the repair process for a runtime error
 */
export async function repairRuntimeError(
  errorId: string | { id: string, projectId: string },
  options: RuntimeErrorRepairOptions = {}
) {
  // Get error details if only ID was provided
  const errorRecord = typeof errorId === 'string'
    ? await prisma.runtimeError.findUnique({ where: { id: errorId } })
    : errorId

  if (!errorRecord) {
    throw new Error('Runtime error not found')
  }

  // Get project details
  const project = await prisma.project.findUnique({
    where: { id: errorRecord.projectId },
    include: {
      jobs: {
        where: { status: 'complete' },
        orderBy: { completedAt: 'desc' },
        take: 1
      }
    }
  })

  if (!project) {
    throw new Error('Project not found')
  }

  // Find the most recent successful job with a workspace
  const latestJob = project.jobs[0]
  if (!latestJob?.workspacePath) {
    throw new Error('No workspace available for repair')
  }

  // Check if workspace exists
  if (!fs.existsSync(latestJob.workspacePath)) {
    throw new Error('Workspace directory not found')
  }

  // Update error status to analyzing
  await prisma.runtimeError.update({
    where: { id: errorRecord.id },
    data: {
      status: 'analyzing',
      repairAttempts: { increment: 1 }
    }
  })

  // Create a new repair job
  const repairJob = await prisma.job.create({
    data: {
      projectId: project.id,
      status: 'repairing',
      currentStep: 'Analyzing runtime error',
      progress: 10,
      workspacePath: latestJob.workspacePath,
      logs: [],
      previewStatus: 'stopped',
      retryCount: 0,
      repairAttemptCount: 0
    }
  })

  // Notify user that repair has started
  emitToUser(project.userId, 'job:started', {
    jobId: repairJob.id,
    projectId: project.id,
    type: 'runtime_error_repair',
    message: 'Runtime error repair started'
  })

  // Start the repair process asynchronously
  void processRuntimeErrorRepair(errorRecord, repairJob.id, project.userId)

  return repairJob
}

/**
 * Process the runtime error repair
 */
async function processRuntimeErrorRepair(
  errorRecord: { id: string, projectId: string },
  jobId: string,
  userId: string
) {
  try {
    // Get full error details
    const error = await prisma.runtimeError.findUnique({
      where: { id: errorRecord.id }
    })

    if (!error) {
      throw new Error('Runtime error not found')
    }

    // Get job details
    const job = await prisma.job.findUnique({
      where: { id: jobId }
    })

    if (!job || !job.workspacePath) {
      throw new Error('Repair job not found')
    }

    // Update job status
    await updateJobStatus(jobId, 'Parsing runtime error', 20)

    // Parse the error
    const parsedError = parseRuntimeError({
      message: error.message,
      stack: error.stack || undefined,
      componentName: error.componentName || undefined,
      fileName: error.fileName || undefined,
      lineNumber: error.lineNumber || undefined,
      columnNumber: error.columnNumber || undefined,
      userAction: error.userAction || undefined,
      browserInfo: error.browserInfo as any,
      timestamp: error.lastSeen.toISOString()
    })

    // Generate repair context
    const repairContext = buildRuntimeErrorRepairContext([parsedError])

    // Identify affected files
    const affectedFiles = getAffectedFiles([parsedError])
    
    if (affectedFiles.length === 0) {
      throw new Error('Could not identify affected files')
    }

    // Update job status
    await updateJobStatus(jobId, `Repairing ${affectedFiles.length} affected file(s)`, 40)

    // Update error status to repairing
    await prisma.runtimeError.update({
      where: { id: error.id },
      data: { status: 'repairing' }
    })

    // Notify user about repair progress
    emitToUser(userId, 'job:runtime_error_repair', {
      jobId,
      errorId: error.id,
      phase: 'repairing',
      affectedFiles,
      message: `Repairing ${affectedFiles.length} affected file(s)`
    })

    // Set up repair callbacks
    const repairCallbacks = {
      onPhaseStart: async (_phase: string, fileCount: number) => {
        await updateJobStatus(jobId, `Repairing ${fileCount} file(s)`, 50)
      },
      onFileStart: async (filePath: string, description: string) => {
        await addJobLog(jobId, 'info', `Repairing ${filePath}: ${description}`)
      },
      onFileComplete: async (filePath: string, bytes: number, generatedBy: string) => {
        await addJobLog(jobId, 'success', `Repaired ${filePath} (${(bytes / 1024).toFixed(1)} KB) [${generatedBy}]`)
      },
      onFileError: async (filePath: string, error: string) => {
        await addJobLog(jobId, 'error', `Failed to repair ${filePath}: ${error}`)
      },
      onFileToken: async (filePath: string, delta: string) => {
        emitToUser(userId, 'job:file_token', { jobId, path: filePath, delta })
      }
    }

    // Get project memory context
    const projectMemory = await prisma.projectMemory.findUnique({
      where: { projectId: error.projectId }
    })

    // Prepare repair project
    const repairProject = {
      name: 'Runtime Error Repair',
      memoryContext: repairContext + (projectMemory?.summary ? `\n\nProject Context: ${projectMemory.summary}` : ''),
      techStack: projectMemory?.preferredStack || {},
      integrations: projectMemory?.integrations || []
    }

    // Execute repair
    await repairProjectFiles(job.workspacePath, repairProject, affectedFiles, repairCallbacks)

    // Update job status
    await updateJobStatus(jobId, 'Repair completed', 100)

    // Update job to complete
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'complete',
        completedAt: new Date()
      }
    })

    // Update error status to resolved
    await prisma.runtimeError.update({
      where: { id: error.id },
      data: {
        status: 'resolved',
        repairJobId: jobId
      }
    })

    // Notify user that repair is complete
    emitToUser(userId, 'job:runtime_error_repair', {
      jobId,
      errorId: error.id,
      phase: 'complete',
      message: 'Runtime error successfully repaired'
    })

    emitToUser(userId, 'job:complete', {
      jobId,
      message: 'Runtime error repair completed successfully'
    })

  } catch (err) {
    console.error('Error during runtime error repair:', err)

    // Update job to failed
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown error during repair',
        completedAt: new Date()
      }
    })

    // Update error status back to new
    await prisma.runtimeError.update({
      where: { id: errorRecord.id },
      data: { status: 'new' }
    })

    // Notify user that repair failed
    emitToUser(userId, 'job:runtime_error_repair', {
      jobId,
      errorId: errorRecord.id,
      phase: 'failed',
      message: err instanceof Error ? err.message : 'Unknown error during repair'
    })

    emitToUser(userId, 'job:failed', {
      jobId,
      error: {
        code: 'RUNTIME_ERROR_REPAIR_FAILED',
        message: err instanceof Error ? err.message : 'Unknown error during repair'
      }
    })
  }
}

// ─── Helper Functions ───────────────────────────────────────────

/**
 * Update job status and progress
 */
async function updateJobStatus(jobId: string, currentStep: string, progress: number) {
  await prisma.job.update({
    where: { id: jobId },
    data: { currentStep, progress }
  })
}

/**
 * Add a log entry to the job
 */
async function addJobLog(jobId: string, type: 'info' | 'success' | 'error', message: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { logs: true }
  })

  if (!job) return

  const logs = job.logs as any[]
  logs.push({
    timestamp: new Date().toISOString(),
    type,
    message
  })

  await prisma.job.update({
    where: { id: jobId },
    data: { logs: logs as any }
  })
}

/**
 * Emit a socket event to a user
 */
function emitToUser(userId: string, event: string, data: any) {
  const socketIds = getUserSocketIds(userId)
  for (const socketId of socketIds) {
    io.to(socketId).emit(event, data)
  }
}
