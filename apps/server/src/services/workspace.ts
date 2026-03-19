/**
 * Workspace Service — Phase 3B
 *
 * Manages per-job workspace directories on disk.
 * Every build job gets its own isolated workspace at:
 *   {cwd}/workspaces/{jobId}/
 *
 * All file operations are synchronous to keep log ordering deterministic.
 */

import fs from 'fs'
import path from 'path'

// ─── Paths ────────────────────────────────────────────────────

export const WORKSPACES_ROOT = path.join(process.cwd(), 'workspaces')

export function getWorkspacePath(jobId: string): string {
  return path.join(WORKSPACES_ROOT, jobId)
}

// ─── Workspace lifecycle ──────────────────────────────────────

export function ensureWorkspacesRoot(): void {
  fs.mkdirSync(WORKSPACES_ROOT, { recursive: true })
}

export function createWorkspace(jobId: string): string {
  const workspacePath = getWorkspacePath(jobId)
  fs.mkdirSync(workspacePath, { recursive: true })
  return workspacePath
}

export function workspaceExists(jobId: string): boolean {
  return fs.existsSync(getWorkspacePath(jobId))
}

export function deleteWorkspace(jobId: string): void {
  const workspacePath = getWorkspacePath(jobId)
  if (fs.existsSync(workspacePath)) {
    fs.rmSync(workspacePath, { recursive: true, force: true })
  }
}

// ─── File operations ──────────────────────────────────────────

export interface WorkspaceFile {
  relativePath: string
  absolutePath: string
  bytes: number
}

/**
 * Write a file into the workspace.
 * Creates intermediate directories automatically.
 * Returns metadata about the written file.
 */
export function writeWorkspaceFile(
  workspacePath: string,
  relativePath: string,
  content: string
): WorkspaceFile {
  const absolutePath = path.join(workspacePath, relativePath)
  const dir = path.dirname(absolutePath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(absolutePath, content, 'utf-8')
  const bytes = Buffer.byteLength(content, 'utf-8')
  return { relativePath, absolutePath, bytes }
}

/**
 * Read a file from the workspace.
 */
export function readWorkspaceFile(workspacePath: string, relativePath: string): string {
  const absolutePath = path.join(workspacePath, relativePath)
  return fs.readFileSync(absolutePath, 'utf-8')
}

/**
 * Get the full file tree of a workspace as sorted relative paths.
 */
export function getWorkspaceFileTree(workspacePath: string): string[] {
  const files: string[] = []

  function walk(dir: string, prefix: string = '') {
    if (!fs.existsSync(dir)) return
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), relPath)
      } else {
        files.push(relPath)
      }
    }
  }

  walk(workspacePath)
  return files.sort()
}

/**
 * Get total byte count of all files in a workspace.
 */
export function getWorkspaceTotalBytes(workspacePath: string): number {
  const files = getWorkspaceFileTree(workspacePath)
  let total = 0
  for (const f of files) {
    try {
      const stat = fs.statSync(path.join(workspacePath, f))
      total += stat.size
    } catch {
      // ignore
    }
  }
  return total
}

/**
 * Validate that all expected files exist in the workspace.
 * Returns list of missing files.
 */
export function validateWorkspaceFiles(
  workspacePath: string,
  expectedFiles: string[]
): string[] {
  return expectedFiles.filter(
    (f) => !fs.existsSync(path.join(workspacePath, f))
  )
}
