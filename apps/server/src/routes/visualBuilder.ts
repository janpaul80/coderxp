/**
 * Visual Builder Routes — Phase 1 API
 *
 * POST /api/vb/analyze         — Analyze a single file for visual builder compatibility
 * POST /api/vb/analyze-workspace — Analyze all tsx/jsx files in a workspace
 * POST /api/vb/transform       — Apply a visual edit transform to a file
 * GET  /api/vb/registry        — Get available component registry (for palette)
 *
 * All routes are auth-gated.
 */

import { Router, Response } from 'express'
import fs from 'fs'
import path from 'path'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { prisma } from '../lib/prisma'
import {
  analyzeFile,
  getWorkspaceSyncReport,
  applyTransform,
  addImport,
  removeImport,
  type TransformOp,
} from '../services/visualBuilderService'

export const visualBuilderRouter: Router = Router()

// ─── POST /api/vb/analyze ────────────────────────────────────
// Body: { jobId, filePath } — analyze a single file in a workspace

visualBuilderRouter.post('/analyze', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { jobId, filePath } = req.body as { jobId?: string; filePath?: string }

    if (!jobId || !filePath) {
      return res.status(400).json({ error: 'jobId and filePath are required' })
    }

    const job = await prisma.job.findFirst({
      where: { id: jobId },
      include: { project: { select: { userId: true } } },
    })
    if (!job || job.project.userId !== req.userId) {
      return res.status(404).json({ error: 'Job not found' })
    }
    if (!job.workspacePath || !fs.existsSync(job.workspacePath)) {
      return res.status(404).json({ error: 'Workspace not found' })
    }

    const fullPath = path.join(job.workspacePath, filePath)
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: `File not found: ${filePath}` })
    }

    const source = fs.readFileSync(fullPath, 'utf-8')
    const analysis = analyzeFile(source, filePath)

    return res.json({ success: true, analysis })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed'
    return res.status(500).json({ error: message })
  }
})

// ─── POST /api/vb/analyze-workspace ──────────────────────────
// Body: { jobId } — analyze all tsx/jsx files

visualBuilderRouter.post('/analyze-workspace', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { jobId } = req.body as { jobId?: string }

    if (!jobId) {
      return res.status(400).json({ error: 'jobId is required' })
    }

    const job = await prisma.job.findFirst({
      where: { id: jobId },
      include: { project: { select: { userId: true } } },
    })
    if (!job || job.project.userId !== req.userId) {
      return res.status(404).json({ error: 'Job not found' })
    }
    if (!job.workspacePath || !fs.existsSync(job.workspacePath)) {
      return res.status(404).json({ error: 'Workspace not found' })
    }

    // Scan workspace for tsx/jsx files (max 100 files)
    const files: Array<{ path: string; content: string }> = []
    const srcDir = path.join(job.workspacePath, 'src')
    if (fs.existsSync(srcDir)) {
      scanDir(srcDir, job.workspacePath, files, 100)
    }

    const report = getWorkspaceSyncReport(files)

    return res.json({ success: true, report })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Workspace analysis failed'
    return res.status(500).json({ error: message })
  }
})

// ─── POST /api/vb/transform ──────────────────────────────────
// Body: { jobId, filePath, operation }
// Apply a visual builder transform to a file in the workspace.

visualBuilderRouter.post('/transform', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { jobId, filePath, operation } = req.body as {
      jobId?: string
      filePath?: string
      operation?: TransformOp
    }

    if (!jobId || !filePath || !operation) {
      return res.status(400).json({ error: 'jobId, filePath, and operation are required' })
    }

    const job = await prisma.job.findFirst({
      where: { id: jobId },
      include: { project: { select: { userId: true } } },
    })
    if (!job || job.project.userId !== req.userId) {
      return res.status(404).json({ error: 'Job not found' })
    }
    if (!job.workspacePath || !fs.existsSync(job.workspacePath)) {
      return res.status(404).json({ error: 'Workspace not found' })
    }

    const fullPath = path.join(job.workspacePath, filePath)
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: `File not found: ${filePath}` })
    }

    // Read current source
    const source = fs.readFileSync(fullPath, 'utf-8')

    // Analyze to get the tree
    const analysis = analyzeFile(source, filePath)
    if (!analysis.syncable) {
      return res.status(422).json({
        error: 'File is not syncable for visual editing',
        reason: analysis.unsyncableReason,
        syncScore: analysis.syncScore,
      })
    }

    // Apply transform
    const result = applyTransform(source, analysis.tree, operation)
    if (result === null) {
      return res.status(422).json({
        error: 'Transform failed — target element not found or operation unsupported',
      })
    }

    // Write back to file
    fs.writeFileSync(fullPath, result, 'utf-8')

    // Re-analyze to return updated tree
    const updatedAnalysis = analyzeFile(result, filePath)

    return res.json({
      success: true,
      previousLength: source.length,
      newLength: result.length,
      analysis: updatedAnalysis,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transform failed'
    return res.status(500).json({ error: message })
  }
})

// ─── POST /api/vb/add-import ─────────────────────────────────
// Body: { jobId, filePath, source, specifier }

visualBuilderRouter.post('/add-import', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { jobId, filePath, source: importSource, specifier } = req.body as {
      jobId?: string
      filePath?: string
      source?: string
      specifier?: string
    }

    if (!jobId || !filePath || !importSource || !specifier) {
      return res.status(400).json({ error: 'jobId, filePath, source, and specifier are required' })
    }

    const job = await prisma.job.findFirst({
      where: { id: jobId },
      include: { project: { select: { userId: true } } },
    })
    if (!job || job.project.userId !== req.userId) {
      return res.status(404).json({ error: 'Job not found' })
    }
    if (!job.workspacePath || !fs.existsSync(job.workspacePath)) {
      return res.status(404).json({ error: 'Workspace not found' })
    }

    const fullPath = path.join(job.workspacePath, filePath)
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: `File not found: ${filePath}` })
    }

    const currentSource = fs.readFileSync(fullPath, 'utf-8')
    const result = addImport(currentSource, importSource, specifier)
    fs.writeFileSync(fullPath, result, 'utf-8')

    return res.json({ success: true, importAdded: result !== currentSource })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Add import failed'
    return res.status(500).json({ error: message })
  }
})

// ─── POST /api/vb/read-file ──────────────────────────────────
// Body: { jobId, filePath } — read a file from the workspace (for undo, code view)

visualBuilderRouter.post('/read-file', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { jobId, filePath } = req.body as { jobId?: string; filePath?: string }
    if (!jobId || !filePath) {
      return res.status(400).json({ error: 'jobId and filePath are required' })
    }

    const job = await prisma.job.findFirst({
      where: { id: jobId },
      include: { project: { select: { userId: true } } },
    })
    if (!job || job.project.userId !== req.userId) {
      return res.status(404).json({ error: 'Job not found' })
    }
    if (!job.workspacePath || !fs.existsSync(job.workspacePath)) {
      return res.status(404).json({ error: 'Workspace not found' })
    }

    const fullPath = path.join(job.workspacePath, filePath)
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: `File not found: ${filePath}` })
    }

    const content = fs.readFileSync(fullPath, 'utf-8')
    return res.json({ success: true, content, length: content.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Read failed'
    return res.status(500).json({ error: message })
  }
})

// ─── POST /api/vb/write-file ─────────────────────────────────
// Body: { jobId, filePath, content } — write full file content (for undo/redo)

visualBuilderRouter.post('/write-file', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { jobId, filePath, content } = req.body as {
      jobId?: string; filePath?: string; content?: string
    }
    if (!jobId || !filePath || content === undefined) {
      return res.status(400).json({ error: 'jobId, filePath, and content are required' })
    }

    const job = await prisma.job.findFirst({
      where: { id: jobId },
      include: { project: { select: { userId: true } } },
    })
    if (!job || job.project.userId !== req.userId) {
      return res.status(404).json({ error: 'Job not found' })
    }
    if (!job.workspacePath || !fs.existsSync(job.workspacePath)) {
      return res.status(404).json({ error: 'Workspace not found' })
    }

    const fullPath = path.join(job.workspacePath, filePath)
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: `File not found: ${filePath}` })
    }

    // Safety: verify the content is valid by parsing it
    const analysis = analyzeFile(content, filePath)
    if (!analysis.syncable && analysis.syncScore === 0 && analysis.tree.length === 0) {
      return res.status(422).json({
        error: 'Content appears to be invalid JSX/TSX — write rejected for safety',
        syncScore: analysis.syncScore,
      })
    }

    fs.writeFileSync(fullPath, content, 'utf-8')
    return res.json({ success: true, length: content.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Write failed'
    return res.status(500).json({ error: message })
  }
})

// ─── Helper: recursive directory scan ────────────────────────

function scanDir(
  dir: string,
  rootDir: string,
  files: Array<{ path: string; content: string }>,
  maxFiles: number,
): void {
  if (files.length >= maxFiles) return

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (files.length >= maxFiles) break

    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue
      scanDir(fullPath, rootDir, files, maxFiles)
    } else if (entry.isFile() && /\.(tsx|jsx)$/.test(entry.name)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8')
        const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/')
        files.push({ path: relativePath, content })
      } catch {
        // Skip unreadable files
      }
    }
  }
}
