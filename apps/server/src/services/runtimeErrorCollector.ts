/**
 * runtimeErrorCollector.ts — Sprint 16
 *
 * Collects and stores runtime errors from deployed applications.
 * Provides API endpoints for client-side error reporting.
 * Associates errors with projects and builds context for repair.
 */

import { prisma } from '../lib/prisma'
import type { Request, Response } from 'express'

// ─── Types ────────────────────────────────────────────────────

export interface RuntimeError {
  message: string
  stack?: string
  componentName?: string
  fileName?: string
  lineNumber?: number
  columnNumber?: number
  userAction?: string
  browserInfo?: {
    userAgent?: string
    platform?: string
    language?: string
    viewport?: {
      width: number
      height: number
    }
  }
  timestamp: string
}

export interface RuntimeErrorWithContext extends RuntimeError {
  projectId: string
  jobId?: string
  userId?: string
  occurrences: number
  firstSeen: Date
  lastSeen: Date
  status: 'new' | 'analyzing' | 'repairing' | 'resolved' | 'ignored'
}

// ─── Error Collection API ─────────────────────────────────────

/**
 * Express middleware to handle runtime error reports from clients
 */
export async function handleRuntimeErrorReport(req: Request, res: Response): Promise<void> {
  try {
    const { projectId, error } = req.body

    if (!projectId || !error || !error.message) {
      res.status(400).json({ error: 'Invalid error report. Required: projectId and error.message' })
      return
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    const normalizedError = normalizeRuntimeError(error)
    const errorHash = generateErrorHash(normalizedError)
    
    // Check if this error already exists
    const existingError = await prisma.runtimeError.findFirst({
      where: {
        projectId,
        errorHash,
      },
    })

    if (existingError) {
      // Update existing error
      await prisma.runtimeError.update({
        where: { id: existingError.id },
        data: {
          occurrences: { increment: 1 },
          lastSeen: new Date(),
          // Only update these if they weren't set before
          componentName: existingError.componentName || normalizedError.componentName,
          fileName: existingError.fileName || normalizedError.fileName,
          lineNumber: existingError.lineNumber || normalizedError.lineNumber,
          columnNumber: existingError.columnNumber || normalizedError.columnNumber,
        },
      })

      res.status(200).json({ success: true, errorId: existingError.id, new: false })
    } else {
      // Create new error
      const newError = await prisma.runtimeError.create({
        data: {
          projectId,
          userId: project.userId,
          message: normalizedError.message,
          stack: normalizedError.stack,
          componentName: normalizedError.componentName,
          fileName: normalizedError.fileName,
          lineNumber: normalizedError.lineNumber,
          columnNumber: normalizedError.columnNumber,
          userAction: normalizedError.userAction,
          browserInfo: normalizedError.browserInfo as any,
          errorHash,
          occurrences: 1,
          firstSeen: new Date(),
          lastSeen: new Date(),
          status: 'new',
        },
      })

      res.status(201).json({ success: true, errorId: newError.id, new: true })
    }
  } catch (err) {
    console.error('Error handling runtime error report:', err)
    res.status(500).json({ error: 'Failed to process error report' })
  }
}

// ─── Error Management ──────────────────────────────────────────

/**
 * Get all runtime errors for a project
 */
export async function getProjectRuntimeErrors(projectId: string) {
  return prisma.runtimeError.findMany({
    where: { projectId },
    orderBy: { lastSeen: 'desc' },
  })
}

/**
 * Get a specific runtime error by ID
 */
export async function getRuntimeError(errorId: string) {
  return prisma.runtimeError.findUnique({
    where: { id: errorId },
  })
}

/**
 * Update the status of a runtime error
 */
export async function updateRuntimeErrorStatus(
  errorId: string,
  status: 'new' | 'analyzing' | 'repairing' | 'resolved' | 'ignored'
) {
  return prisma.runtimeError.update({
    where: { id: errorId },
    data: { status },
  })
}

// ─── Helper Functions ───────────────────────────────────────────

/**
 * Normalize runtime error data to ensure consistent format
 */
function normalizeRuntimeError(error: Partial<RuntimeError>): RuntimeError {
  // Extract component name from stack trace if not provided
  let componentName = error.componentName
  if (!componentName && error.stack) {
    const componentMatch = error.stack.match(/at\s+([A-Z][a-zA-Z0-9]+)\s+\(/);
    if (componentMatch) {
      componentName = componentMatch[1]
    }
  }

  // Extract file name from stack trace if not provided
  let fileName = error.fileName
  let lineNumber = error.lineNumber
  let columnNumber = error.columnNumber
  
  if (!fileName && error.stack) {
    // Look for patterns like: at ComponentName (http://localhost:3000/static/js/main.chunk.js:42:13)
    const fileMatch = error.stack.match(/\(([^:]+):(\d+):(\d+)\)/);
    if (fileMatch) {
      fileName = fileMatch[1]
      lineNumber = parseInt(fileMatch[2], 10)
      columnNumber = parseInt(fileMatch[3], 10)
    }
  }

  return {
    message: error.message || 'Unknown error',
    stack: error.stack,
    componentName,
    fileName,
    lineNumber,
    columnNumber,
    userAction: error.userAction,
    browserInfo: error.browserInfo || {},
    timestamp: error.timestamp || new Date().toISOString(),
  }
}

/**
 * Generate a hash for the error to identify duplicates
 */
function generateErrorHash(error: RuntimeError): string {
  // Create a simplified representation for hashing
  const hashSource = {
    message: error.message,
    componentName: error.componentName,
    fileName: error.fileName,
    lineNumber: error.lineNumber,
  }
  
  // Simple string-based hash
  return Buffer.from(JSON.stringify(hashSource)).toString('base64')
}

/**
 * Generate client-side error collection script
 * This can be injected into the app to automatically report errors
 */
export function generateErrorCollectorScript(projectId: string): string {
  return `
// Runtime Error Collector
(function() {
  const projectId = "${projectId}";
  const apiEndpoint = "/api/runtime-errors";
  
  window.addEventListener('error', function(event) {
    reportError({
      message: event.error?.message || "Uncaught error",
      stack: event.error?.stack,
      fileName: event.filename,
      lineNumber: event.lineno,
      columnNumber: event.colno,
      timestamp: new Date().toISOString()
    });
    
    // Don't prevent default error handling
    return false;
  });
  
  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', function(event) {
    reportError({
      message: event.reason?.message || "Unhandled Promise rejection",
      stack: event.reason?.stack,
      timestamp: new Date().toISOString()
    });
  });
  
  // Capture React errors via error boundaries
  window.reportReactError = function(error, componentStack, componentName) {
    reportError({
      message: error?.message || "React component error",
      stack: componentStack || error?.stack,
      componentName: componentName,
      timestamp: new Date().toISOString()
    });
  };
  
  function reportError(error) {
    try {
      const browserInfo = {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      };
      
      fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          projectId: projectId,
          error: {
            ...error,
            browserInfo
          }
        }),
        // Use keepalive to ensure the request completes even if page is unloading
        keepalive: true
      }).catch(e => console.error('Failed to report error:', e));
    } catch (e) {
      console.error('Error in error reporter:', e);
    }
  }
})();
`
}
