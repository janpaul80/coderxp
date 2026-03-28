/**
 * workerRouter.ts — Phase 5 Slice 3
 *
 * Manages remote worker health state and job dispatch routing.
 *
 * Dispatch priority:
 *   1. Primary worker (WORKER_PRIMARY_URL) — if healthy
 *   2. Failover worker (WORKER_FAILOVER_URL) — if primary unhealthy
 *   3. Local queue ('builder') — if both remote workers unhealthy or not configured
 *
 * Health polling runs every WORKER_HEALTH_INTERVAL_MS (default 30s).
 * A worker is marked unhealthy after WORKER_HEALTH_FAIL_THRESHOLD (default 2)
 * consecutive failures.
 */

import http, { IncomingMessage } from 'http'
import https from 'https'
import { Queue, ConnectionOptions } from 'bullmq'

// ─── Types ────────────────────────────────────────────────────

export type WorkerName = 'primary' | 'failover' | 'local'

export interface WorkerSelection {
  queue: Queue
  queueName: string
  workerName: string
  selectedReason: WorkerSelectedReason
}

export type WorkerSelectedReason =
  | 'primary_healthy'
  | 'failover_primary_unhealthy'
  | 'local_no_remote_configured'
  | 'local_all_remote_unhealthy'

export interface WorkerHealthState {
  name: string
  url: string
  queueName: string
  healthy: boolean
  lastCheck: Date | null
  consecutiveFailures: number
  lastError: string | null
  lastResponse: WorkerHealthResponse | null
}

export interface WorkerHealthResponse {
  healthy: boolean
  workerName: string
  queueName: string
  activeJobs: number
  concurrency: number
  uptimeMs: number
  version?: string
}

// ─── Config ───────────────────────────────────────────────────

const PRIMARY_URL      = process.env.WORKER_PRIMARY_URL ?? ''
const PRIMARY_NAME     = process.env.WORKER_PRIMARY_NAME ?? 'primary'
const FAILOVER_URL     = process.env.WORKER_FAILOVER_URL ?? ''
const FAILOVER_NAME    = process.env.WORKER_FAILOVER_NAME ?? 'failover'
const HEALTH_TIMEOUT   = parseInt(process.env.WORKER_HEALTH_TIMEOUT_MS ?? '5000', 10)
const HEALTH_INTERVAL  = parseInt(process.env.WORKER_HEALTH_INTERVAL_MS ?? '30000', 10)
const FAIL_THRESHOLD   = parseInt(process.env.WORKER_HEALTH_FAIL_THRESHOLD ?? '2', 10)

// ─── Redis connection (shared with builderQueue) ──────────────

const redisConnection: ConnectionOptions = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  maxRetriesPerRequest: 3,
  enableOfflineQueue: false,
  connectTimeout: 5000,
}

// ─── Queue instances ──────────────────────────────────────────

let primaryQueue: Queue | null = null
let failoverQueue: Queue | null = null

function getOrCreateQueue(name: string): Queue {
  return new Queue(name, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  })
}

// ─── Health state ─────────────────────────────────────────────

const healthState: Record<'primary' | 'failover', WorkerHealthState> = {
  primary: {
    name: PRIMARY_NAME,
    url: PRIMARY_URL,
    queueName: 'builder-primary',
    healthy: false,
    lastCheck: null,
    consecutiveFailures: 0,
    lastError: null,
    lastResponse: null,
  },
  failover: {
    name: FAILOVER_NAME,
    url: FAILOVER_URL,
    queueName: 'builder-failover',
    healthy: false,
    lastCheck: null,
    consecutiveFailures: 0,
    lastError: null,
    lastResponse: null,
  },
}

// ─── HTTP health probe ────────────────────────────────────────

function probeWorkerHealth(workerUrl: string): Promise<WorkerHealthResponse | null> {
  return new Promise((resolve) => {
    const url = `${workerUrl}/worker/health`
    const isHttps = url.startsWith('https')
    const lib = isHttps ? https : http

    const req = lib.get(url, { timeout: HEALTH_TIMEOUT }, (res: IncomingMessage) => {
      let body = ''
      res.on('data', (chunk: Buffer) => { body += chunk.toString() })
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            resolve(null)
            return
          }
          const parsed = JSON.parse(body) as WorkerHealthResponse
          resolve(parsed)
        } catch {
          resolve(null)
        }
      })
    })

    req.setTimeout(HEALTH_TIMEOUT, () => {
      req.destroy()
      resolve(null)
    })

    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
  })
}

// ─── Poll a single worker ─────────────────────────────────────

async function pollWorker(role: 'primary' | 'failover'): Promise<void> {
  const state = healthState[role]
  if (!state.url) return

  const response = await probeWorkerHealth(state.url)
  state.lastCheck = new Date()

  if (response && response.healthy) {
    const wasUnhealthy = !state.healthy
    state.healthy = true
    state.consecutiveFailures = 0
    state.lastError = null
    state.lastResponse = response
    if (wasUnhealthy) {
      console.log(`[WorkerRouter] ${role} worker (${state.name}) is now HEALTHY`)
    }
  } else {
    state.consecutiveFailures++
    state.lastError = response === null ? 'No response / timeout' : 'healthy=false in response'
    state.lastResponse = response

    if (state.consecutiveFailures >= FAIL_THRESHOLD && state.healthy) {
      state.healthy = false
      console.warn(
        `[WorkerRouter] ${role} worker (${state.name}) marked UNHEALTHY after ` +
        `${state.consecutiveFailures} consecutive failures`
      )
    } else if (!state.healthy) {
      console.debug(
        `[WorkerRouter] ${role} worker (${state.name}) still unhealthy ` +
        `(failures: ${state.consecutiveFailures})`
      )
    }
  }
}

// ─── Health polling loop ──────────────────────────────────────

let pollingInterval: ReturnType<typeof setInterval> | null = null

export function startHealthPolling(): void {
  if (!PRIMARY_URL && !FAILOVER_URL) {
    console.log('[WorkerRouter] No remote workers configured — running in local-only mode')
    return
  }

  // Initialize queues for configured workers
  if (PRIMARY_URL) {
    primaryQueue = getOrCreateQueue('builder-primary')
    console.log(`[WorkerRouter] Primary worker configured: ${PRIMARY_NAME} @ ${PRIMARY_URL}`)
  }
  if (FAILOVER_URL) {
    failoverQueue = getOrCreateQueue('builder-failover')
    console.log(`[WorkerRouter] Failover worker configured: ${FAILOVER_NAME} @ ${FAILOVER_URL}`)
  }

  // Initial probe
  void pollWorker('primary')
  void pollWorker('failover')

  // Periodic polling
  pollingInterval = setInterval(() => {
    void pollWorker('primary')
    void pollWorker('failover')
  }, HEALTH_INTERVAL)

  console.log(`[WorkerRouter] Health polling started (interval: ${HEALTH_INTERVAL}ms, threshold: ${FAIL_THRESHOLD})`)
}

export function stopHealthPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval)
    pollingInterval = null
  }
}

// ─── Worker selection ─────────────────────────────────────────

export function selectWorker(localBuilderQueue: Queue): WorkerSelection {
  // No remote workers configured → always local
  if (!PRIMARY_URL) {
    return {
      queue: localBuilderQueue,
      queueName: 'builder',
      workerName: 'local',
      selectedReason: 'local_no_remote_configured',
    }
  }

  // Primary healthy → use primary
  if (healthState.primary.healthy && primaryQueue) {
    console.log(`[WorkerRouter] Dispatching to PRIMARY worker (${PRIMARY_NAME})`)
    return {
      queue: primaryQueue,
      queueName: 'builder-primary',
      workerName: PRIMARY_NAME,
      selectedReason: 'primary_healthy',
    }
  }

  // Primary unhealthy → try failover
  if (FAILOVER_URL && healthState.failover.healthy && failoverQueue) {
    console.warn(
      `[WorkerRouter] Primary unhealthy — dispatching to FAILOVER worker (${FAILOVER_NAME}). ` +
      `Primary last error: ${healthState.primary.lastError ?? 'unknown'}`
    )
    return {
      queue: failoverQueue,
      queueName: 'builder-failover',
      workerName: FAILOVER_NAME,
      selectedReason: 'failover_primary_unhealthy',
    }
  }

  // Both unhealthy → local fallback
  console.warn(
    `[WorkerRouter] All remote workers unhealthy — falling back to LOCAL queue. ` +
    `Primary: ${healthState.primary.lastError ?? 'not configured'}, ` +
    `Failover: ${healthState.failover.lastError ?? 'not configured'}`
  )
  return {
    queue: localBuilderQueue,
    queueName: 'builder',
    workerName: 'local',
    selectedReason: 'local_all_remote_unhealthy',
  }
}

// ─── Worker base URL resolver (for cross-server preview proxy) ───

/**
 * Returns the base HTTP URL for a named worker.
 * Used by preview.ts to proxy preview requests to the correct server.
 *
 * Returns null for 'local' or unknown worker names.
 */
export function getWorkerBaseUrl(workerName: string): string | null {
  if (!workerName || workerName === 'local') return null
  if (workerName === PRIMARY_NAME && PRIMARY_URL) return PRIMARY_URL
  if (workerName === FAILOVER_NAME && FAILOVER_URL) return FAILOVER_URL
  // Tertiary / additional workers: check env pattern WORKER_<NAME>_URL
  const envKey = `WORKER_${workerName.toUpperCase()}_URL`
  const envVal = process.env[envKey]
  if (envVal) return envVal
  return null
}

// ─── Public health status (for monitoring endpoints) ─────────

export function getWorkerHealthStatus(): {
  primary: WorkerHealthState | null
  failover: WorkerHealthState | null
  localOnly: boolean
} {
  return {
    primary: PRIMARY_URL ? { ...healthState.primary } : null,
    failover: FAILOVER_URL ? { ...healthState.failover } : null,
    localOnly: !PRIMARY_URL && !FAILOVER_URL,
  }
}
