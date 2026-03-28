/**
 * Workspaces Routes — Phase 9 (Gap 1: File Explorer)
 *
 * GET /api/workspaces/:jobId/files
 *   Returns a recursive file tree for the workspace associated with a job.
 *   Only the job owner can access it.
 *   Excludes node_modules, .git, and other noise directories.
 */

import { Router, Response } from 'express'
import fs from 'fs'
import path from 'path'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { prisma } from '../lib/prisma'
import { detectMissingEnv, type MissingEnv } from '../services/envManager'

export const workspacesRouter: Router = Router()

// ─── Excluded directories / files ────────────────────────────

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  '.cache',
  '.turbo',
  '__pycache__',
  '.venv',
  'venv',
])

const EXCLUDED_FILES = new Set([
  '.DS_Store',
  'Thumbs.db',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
])

// ─── Types ────────────────────────────────────────────────────

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  children?: FileNode[]
}

// ─── Recursive tree builder ───────────────────────────────────

function buildTree(dirPath: string, rootPath: string, depth = 0): FileNode[] {
  // Safety: max depth to prevent runaway recursion
  if (depth > 8) return []

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return []
  }

  const nodes: FileNode[] = []

  for (const entry of entries) {
    if (EXCLUDED_FILES.has(entry.name)) continue

    const fullPath = path.join(dirPath, entry.name)
    // Relative path from workspace root (use forward slashes for consistency)
    const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, '/')

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue
      nodes.push({
        name: entry.name,
        path: relativePath,
        type: 'directory',
        children: buildTree(fullPath, rootPath, depth + 1),
      })
    } else if (entry.isFile()) {
      let size: number | undefined
      try {
        size = fs.statSync(fullPath).size
      } catch {
        // ignore stat errors
      }
      nodes.push({
        name: entry.name,
        path: relativePath,
        type: 'file',
        size,
      })
    }
  }

  // Sort: directories first, then files, both alphabetically
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return nodes
}

// ─── Count total files recursively ───────────────────────────

function countFiles(nodes: FileNode[]): number {
  let count = 0
  for (const node of nodes) {
    if (node.type === 'file') {
      count++
    } else if (node.children) {
      count += countFiles(node.children)
    }
  }
  return count
}

// ─── GET /api/workspaces/:jobId/files ─────────────────────────

workspacesRouter.get('/:jobId/files', requireAuth, async (req: AuthRequest, res: Response) => {
  const { jobId } = req.params

  try {
    // Verify the job belongs to this user
    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        project: { userId: req.userId! },
      },
      select: {
        id: true,
        workspacePath: true,
        status: true,
      },
    })

    if (!job) {
      return res.status(404).json({ error: 'Job not found' })
    }

    if (!job.workspacePath) {
      // Job exists but workspace hasn't been created yet
      return res.json({ files: [], total: 0, workspacePath: null })
    }

    // Verify the workspace directory exists on disk
    if (!fs.existsSync(job.workspacePath)) {
      return res.json({ files: [], total: 0, workspacePath: job.workspacePath })
    }

    const files = buildTree(job.workspacePath, job.workspacePath)
    const total = countFiles(files)

    return res.json({
      files,
      total,
      workspacePath: job.workspacePath,
      jobId: job.id,
      jobStatus: job.status,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read workspace'
    return res.status(500).json({ error: message })
  }
})

// ─── GET /api/workspaces/:jobId/file?path=... ─────────────────
// Returns the text content of a single file within the workspace.
// Path traversal is prevented by resolving and checking the prefix.

const MAX_FILE_SIZE = 500 * 1024 // 500 KB

workspacesRouter.get('/:jobId/file', requireAuth, async (req: AuthRequest, res: Response) => {
  const { jobId } = req.params
  const filePath = req.query.path as string | undefined

  if (!filePath) {
    return res.status(400).json({ error: 'path query parameter is required' })
  }

  try {
    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        project: { userId: req.userId! },
      },
      select: { id: true, workspacePath: true },
    })

    if (!job) return res.status(404).json({ error: 'Job not found' })
    if (!job.workspacePath) return res.status(404).json({ error: 'Workspace not found' })

    // Path traversal protection
    const resolvedWorkspace = path.resolve(job.workspacePath)
    const resolvedFile = path.resolve(job.workspacePath, filePath)
    if (!resolvedFile.startsWith(resolvedWorkspace + path.sep)) {
      return res.status(403).json({ error: 'Access denied: path outside workspace' })
    }

    if (!fs.existsSync(resolvedFile)) {
      return res.status(404).json({ error: 'File not found' })
    }

    const stat = fs.statSync(resolvedFile)
    if (!stat.isFile()) {
      return res.status(400).json({ error: 'Path is not a file' })
    }

    if (stat.size > MAX_FILE_SIZE) {
      return res.json({
        path: filePath,
        content: `[File too large to display: ${(stat.size / 1024).toFixed(1)} KB]`,
        size: stat.size,
        truncated: true,
      })
    }

    let content: string
    try {
      content = fs.readFileSync(resolvedFile, 'utf-8')
    } catch {
      return res.json({
        path: filePath,
        content: '[Binary file — cannot display as text]',
        size: stat.size,
        truncated: true,
      })
    }

    return res.json({ path: filePath, content, size: stat.size, truncated: false })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read file'
    return res.status(500).json({ error: message })
  }
})

// ─── GET /api/workspaces/:jobId/env-check ───────────────────
// Scans the generated workspace for env vars that the app references
// but that are missing. Returns structured data so the frontend can
// show a clear "these credentials are needed" UI instead of a blank preview.

workspacesRouter.get('/:jobId/env-check', requireAuth, async (req: AuthRequest, res: Response) => {
  const { jobId } = req.params

  try {
    const job = await prisma.job.findFirst({
      where: { id: jobId, project: { userId: req.userId! } },
      select: { id: true, workspacePath: true, status: true },
    })

    if (!job) return res.status(404).json({ error: 'Job not found' })
    if (!job.workspacePath || !fs.existsSync(job.workspacePath)) {
      return res.json({ missing: [], total: 0, healthy: true })
    }

    const missing = await detectMissingEnv(job.workspacePath)

    return res.json({
      missing,
      total: missing.length,
      healthy: missing.filter(m => m.isRequired).length === 0,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to check env'
    return res.status(500).json({ error: message })
  }
})
