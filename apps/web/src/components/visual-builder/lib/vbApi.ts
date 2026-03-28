/**
 * vbApi.ts — Visual Builder API client
 *
 * Provides typed functions for calling the server-side Visual Builder endpoints.
 * All edits flow through this layer: UI → vbApi → server → AST → file write → HMR.
 *
 * Edit tracking: Every successful transform returns the edit record
 * so the caller can push it onto the undo stack.
 */

const API_BASE = ((import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? 'http://localhost:3001') + '/api/vb'

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('coderxp_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

// ─── Types ────────────────────────────────────────────────────

export interface VBFileAnalysis {
  filePath: string
  syncable: boolean
  unsyncableReason?: string
  syncScore: number
  componentName: string | null
  tree: unknown[]
  imports: unknown[]
  sourceLength: number
}

export interface VBWorkspaceReport {
  syncable: Array<{ path: string; componentName: string | null; score: number; sectionCount: number }>
  unsyncable: Array<{ path: string; reason: string; score: number }>
  totalFiles: number
  syncableCount: number
}

export interface VBTransformResult {
  success: boolean
  previousLength: number
  newLength: number
  analysis: VBFileAnalysis
  error?: string
}

export interface VBEditRecord {
  filePath: string
  operation: VBTransformOp
  previousLength: number
  newLength: number
  timestamp: number
}

export type VBTransformOp =
  | { type: 'replaceText'; vbId: string; newText: string }
  | { type: 'replaceClassName'; vbId: string; newClassName: string }
  | { type: 'updateProp'; vbId: string; propName: string; propValue: string }
  | { type: 'delete'; vbId: string }
  | { type: 'insert'; parentVbId: string; index: number; jsx: string; importNeeded?: { source: string; specifier: string } }
  | { type: 'reorder'; parentVbId: string; childVbId: string; newIndex: number }

// ─── API functions ───────────────────────────────────────────

/**
 * Analyze a single file for visual builder compatibility.
 */
export async function analyzeFile(jobId: string, filePath: string): Promise<VBFileAnalysis> {
  const res = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ jobId, filePath }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Analysis failed')
  return data.analysis
}

/**
 * Analyze all tsx/jsx files in a workspace.
 */
export async function analyzeWorkspace(jobId: string): Promise<VBWorkspaceReport> {
  const res = await fetch(`${API_BASE}/analyze-workspace`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ jobId }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Workspace analysis failed')
  return data.report
}

/**
 * Apply a single transform operation to a file.
 * Returns the edit record for undo tracking.
 */
export async function applyTransform(
  jobId: string,
  filePath: string,
  operation: VBTransformOp,
): Promise<VBEditRecord> {
  const res = await fetch(`${API_BASE}/transform`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ jobId, filePath, operation }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error ?? 'Transform failed')
  }
  return {
    filePath,
    operation,
    previousLength: data.previousLength,
    newLength: data.newLength,
    timestamp: Date.now(),
  }
}

/**
 * Apply a batch of transforms to the same file, in order.
 * Stops on first failure. Returns all successful edit records.
 */
export async function applyBatchTransforms(
  jobId: string,
  filePath: string,
  operations: VBTransformOp[],
): Promise<{ edits: VBEditRecord[]; failedAt?: number; error?: string }> {
  const edits: VBEditRecord[] = []
  for (let i = 0; i < operations.length; i++) {
    try {
      const edit = await applyTransform(jobId, filePath, operations[i])
      edits.push(edit)
    } catch (err) {
      return {
        edits,
        failedAt: i,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }
  return { edits }
}

/**
 * Insert a component/section from the registry into a target location.
 */
export async function insertComponent(
  jobId: string,
  filePath: string,
  parentVbId: string,
  index: number,
  jsx: string,
  importNeeded?: { source: string; specifier: string },
): Promise<VBEditRecord> {
  return applyTransform(jobId, filePath, {
    type: 'insert',
    parentVbId,
    index,
    jsx,
    importNeeded,
  })
}

/**
 * Read a file's current source from the workspace.
 */
export async function readFile(jobId: string, filePath: string): Promise<string> {
  const res = await fetch(`${API_BASE}/read-file`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ jobId, filePath }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Read failed')
  return data.content
}

/**
 * Write full file content (for undo/redo — replaces entire file).
 */
export async function writeFile(jobId: string, filePath: string, content: string): Promise<void> {
  const res = await fetch(`${API_BASE}/write-file`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ jobId, filePath, content }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Write failed')
}
