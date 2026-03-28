/**
 * Status Emitter — Compact live status payloads for user-facing updates.
 *
 * Supports dual visualization:
 *   - Chat panel: status messages with agent attribution
 *   - Editor/workspace panel: file change indicators
 *
 * Payload types:
 *   - pipeline: overall build pipeline status
 *   - agent: individual agent status
 *   - preview: preview health/state
 *   - release: deployment/publish status
 *   - asset: image/resource generation status
 */

import type { AgentRole } from './agentRegistry'

// ─── Status types ────────────────────────────────────────────

export type PipelineStatus =
  | 'idle'
  | 'planning'
  | 'running'
  | 'recovering'
  | 'complete'
  | 'error'
  | 'cancelled'

export type AgentStatus =
  | 'idle'
  | 'running'
  | 'complete'
  | 'error'
  | 'waiting'
  | 'skipped'

export type PreviewStatus =
  | 'healthy'
  | 'recovering'
  | 'degraded'
  | 'blocked'
  | 'starting'
  | 'stopped'

export type ReleaseStatus =
  | 'validating'
  | 'ready'
  | 'deploying'
  | 'deployed'
  | 'failed'
  | 'idle'

export type AssetStatus =
  | 'pending'
  | 'generating'
  | 'ready'
  | 'applied'
  | 'failed'

// ─── Status payload ──────────────────────────────────────────

export interface StatusPayload {
  /** Type of status update */
  type: 'pipeline' | 'agent' | 'preview' | 'release' | 'asset'
  /** Current status */
  status: PipelineStatus | AgentStatus | PreviewStatus | ReleaseStatus | AssetStatus
  /** Which agent is reporting (if applicable) */
  agent?: AgentRole | string
  /** Human-readable message */
  message: string
  /** ISO timestamp */
  timestamp: string
  /** Additional metadata (kept compact) */
  meta?: Record<string, unknown>
}

// ─── File change payload (for editor visualization) ──────────

export interface FileChangePayload {
  /** Type of change */
  action: 'created' | 'modified' | 'deleted'
  /** File path relative to workspace */
  filePath: string
  /** Which agent made the change */
  agent: AgentRole
  /** Compact summary of what changed */
  summary: string
  /** ISO timestamp */
  timestamp: string
}

// ─── Progress snapshot ───────────────────────────────────────

export interface ProgressSnapshot {
  /** Overall pipeline status */
  pipeline: PipelineStatus
  /** Individual agent statuses */
  agents: Record<string, AgentStatus>
  /** Preview status */
  preview: PreviewStatus
  /** Release status */
  release: ReleaseStatus
  /** Active assets */
  assets: Array<{ name: string; status: AssetStatus }>
  /** Total tasks / completed tasks */
  progress: { total: number; completed: number; failed: number }
  /** Pipeline start time */
  startedAt?: string
  /** Pipeline elapsed time in ms */
  elapsedMs?: number
}

// ─── Status emitter (integrates with Socket.io) ──────────────

type StatusListener = (payload: StatusPayload) => void
type FileChangeListener = (payload: FileChangePayload) => void

class StatusEmitterService {
  private statusListeners: StatusListener[] = []
  private fileChangeListeners: FileChangeListener[] = []
  private currentSnapshot: ProgressSnapshot = {
    pipeline: 'idle',
    agents: {},
    preview: 'stopped',
    release: 'idle',
    assets: [],
    progress: { total: 0, completed: 0, failed: 0 },
  }

  /** Subscribe to status updates */
  onStatus(listener: StatusListener): () => void {
    this.statusListeners.push(listener)
    return () => {
      this.statusListeners = this.statusListeners.filter(l => l !== listener)
    }
  }

  /** Subscribe to file change updates */
  onFileChange(listener: FileChangeListener): () => void {
    this.fileChangeListeners.push(listener)
    return () => {
      this.fileChangeListeners = this.fileChangeListeners.filter(l => l !== listener)
    }
  }

  /** Emit a status update */
  emitStatus(payload: StatusPayload): void {
    // Update snapshot
    this.updateSnapshot(payload)

    // Notify listeners
    for (const listener of this.statusListeners) {
      try {
        listener(payload)
      } catch (err) {
        console.warn('[StatusEmitter] Listener error:', err)
      }
    }

    // Log for observability
    console.log(
      `[Status] [${payload.type}] ${payload.status}${payload.agent ? ` (${payload.agent})` : ''}: ${payload.message}`
    )
  }

  /** Emit a file change event */
  emitFileChange(payload: FileChangePayload): void {
    for (const listener of this.fileChangeListeners) {
      try {
        listener(payload)
      } catch (err) {
        console.warn('[StatusEmitter] FileChange listener error:', err)
      }
    }
  }

  /** Get current progress snapshot */
  getSnapshot(): ProgressSnapshot {
    return { ...this.currentSnapshot }
  }

  /** Reset the snapshot (e.g., at start of new build) */
  reset(): void {
    this.currentSnapshot = {
      pipeline: 'idle',
      agents: {},
      preview: 'stopped',
      release: 'idle',
      assets: [],
      progress: { total: 0, completed: 0, failed: 0 },
    }
  }

  private updateSnapshot(payload: StatusPayload): void {
    switch (payload.type) {
      case 'pipeline':
        this.currentSnapshot.pipeline = payload.status as PipelineStatus
        if (payload.meta?.totalTasks !== undefined) {
          this.currentSnapshot.progress.total = payload.meta.totalTasks as number
        }
        if (payload.meta?.completedTasks !== undefined) {
          this.currentSnapshot.progress.completed = payload.meta.completedTasks as number
        }
        if (payload.meta?.failedTasks !== undefined) {
          this.currentSnapshot.progress.failed = payload.meta.failedTasks as number
        }
        break
      case 'agent':
        if (payload.agent) {
          this.currentSnapshot.agents[payload.agent] = payload.status as AgentStatus
        }
        break
      case 'preview':
        this.currentSnapshot.preview = payload.status as PreviewStatus
        break
      case 'release':
        this.currentSnapshot.release = payload.status as ReleaseStatus
        break
      case 'asset':
        // Update or add asset
        if (payload.meta?.assetName) {
          const name = payload.meta.assetName as string
          const existing = this.currentSnapshot.assets.find(a => a.name === name)
          if (existing) {
            existing.status = payload.status as AssetStatus
          } else {
            this.currentSnapshot.assets.push({
              name,
              status: payload.status as AssetStatus,
            })
          }
        }
        break
    }
  }
}

// ─── Singleton ───────────────────────────────────────────────

export const statusEmitter = new StatusEmitterService()

// ─── Convenience functions ───────────────────────────────────

/** Emit an agent-level status update */
export function emitAgentStatus(
  agent: AgentRole,
  status: AgentStatus,
  message: string,
  meta?: Record<string, unknown>
): void {
  statusEmitter.emitStatus({
    type: 'agent',
    status,
    agent,
    message,
    timestamp: new Date().toISOString(),
    meta,
  })
}

/** Emit a pipeline-level status update */
export function emitPipelineStatus(
  status: PipelineStatus,
  message: string,
  meta?: Record<string, unknown>
): void {
  statusEmitter.emitStatus({
    type: 'pipeline',
    status,
    message,
    timestamp: new Date().toISOString(),
    meta,
  })
}

/** Emit a preview status update */
export function emitPreviewStatus(
  status: PreviewStatus,
  message: string,
  meta?: Record<string, unknown>
): void {
  statusEmitter.emitStatus({
    type: 'preview',
    status,
    message,
    timestamp: new Date().toISOString(),
    meta,
  })
}

/** Emit a release status update */
export function emitReleaseStatus(
  status: ReleaseStatus,
  message: string,
  meta?: Record<string, unknown>
): void {
  statusEmitter.emitStatus({
    type: 'release',
    status,
    message,
    timestamp: new Date().toISOString(),
    meta,
  })
}

/** Emit an asset status update */
export function emitAssetStatus(
  assetName: string,
  status: AssetStatus,
  message: string,
  meta?: Record<string, unknown>
): void {
  statusEmitter.emitStatus({
    type: 'asset',
    status,
    message,
    timestamp: new Date().toISOString(),
    meta: { ...meta, assetName },
  })
}

/** Emit a file change event */
export function emitFileChange(
  action: FileChangePayload['action'],
  filePath: string,
  agent: AgentRole,
  summary: string
): void {
  statusEmitter.emitFileChange({
    action,
    filePath,
    agent,
    summary,
    timestamp: new Date().toISOString(),
  })
}
