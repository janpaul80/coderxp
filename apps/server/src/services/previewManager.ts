/**
 * Preview Manager — Phase 3C
 *
 * Manages the full preview lifecycle for generated workspaces:
 *   1. Port allocation (3100–3200 range)
 *   2. npm install (real child process, real stdout/stderr streamed)
 *   3. Vite dev server start (npx vite --port {port} --host)
 *   4. Health check (GET http://localhost:{port} until 200 or timeout)
 *   5. Lifecycle tracking (Map<jobId, PreviewInstance>)
 *   6. Cleanup / stop
 *
 * PROOF STANDARD:
 *   - Every log line is real stdout/stderr from the child process
 *   - preview:ready is NEVER emitted before health check passes
 *   - PID is tracked and persisted
 *   - Port is tracked and freed on stop
 */

import { spawn, execSync, ChildProcess } from 'child_process'
import net from 'net'
import http from 'http'

// ─── Types ────────────────────────────────────────────────────

export type PreviewStatus = 'installing' | 'starting' | 'ready' | 'stopped' | 'failed'

export interface PreviewInstance {
  jobId: string
  workspacePath: string
  port: number
  pid: number
  process: ChildProcess
  status: PreviewStatus
  url: string
  startedAt: Date
  installDurationMs?: number
  startDurationMs?: number
}

export interface PreviewLogEntry {
  id: string
  timestamp: string
  type: 'run' | 'info' | 'success' | 'error'
  message: string
  source?: 'stdout' | 'stderr'
}

export interface PreviewTelemetryCallbacks {
  onPhase?: (phase: 'installing' | 'starting' | 'healthcheck', meta?: Record<string, unknown>) => void | Promise<void>
  onCommandSummary?: (summary: {
    phase: 'installing' | 'starting'
    command: string
    cwd: string
    exitCode: number | null
    durationMs: number
    timedOut: boolean
    stdoutTail?: string
    stderrTail?: string
  }) => void | Promise<void>
  onFailure?: (payload: {
    phase: 'installing' | 'starting' | 'healthcheck' | 'unknown'
    error: Error
    commandSummary?: {
      phase: 'installing' | 'starting'
      command: string
      cwd: string
      exitCode: number | null
      durationMs: number
      timedOut: boolean
      stdoutTail?: string
      stderrTail?: string
    }
  }) => void | Promise<void>
  /** Called when an autonomous repair attempt is about to begin */
  onRepairAttempt?: (payload: {
    phase: 'installing' | 'healthcheck'
    attempt: number
    reason: string
    strategy: string
  }) => void | Promise<void>
}

// ─── In-memory state ──────────────────────────────────────────

const previews = new Map<string, PreviewInstance>()
const usedPorts = new Set<number>()

// ─── Port allocation ──────────────────────────────────────────

const PORT_RANGE_START = 3100
const PORT_RANGE_END   = 3200

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '127.0.0.1')
  })
}

export async function allocatePort(): Promise<number> {
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (!usedPorts.has(port) && await isPortFree(port)) {
      usedPorts.add(port)
      return port
    }
  }
  throw new Error(`No free ports available in range ${PORT_RANGE_START}–${PORT_RANGE_END}`)
}

function freePort(port: number): void {
  usedPorts.delete(port)
}

// ─── Log entry builder ────────────────────────────────────────

let logSeq = 0

function makePreviewLog(
  jobId: string,
  type: PreviewLogEntry['type'],
  message: string,
  source?: 'stdout' | 'stderr'
): PreviewLogEntry {
  logSeq++
  return {
    id: `${jobId}-preview-${logSeq}`,
    timestamp: new Date().toISOString(),
    type,
    message: message.trim(),
    source,
  }
}

// ─── npm install ──────────────────────────────────────────────

const NPM_INSTALL_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

export function runNpmInstall(
  jobId: string,
  workspacePath: string,
  onLog: (log: PreviewLogEntry) => void,
  callbacks?: PreviewTelemetryCallbacks,
  options?: { legacyPeerDeps?: boolean }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    const flags = options?.legacyPeerDeps
      ? ['install', '--legacy-peer-deps', '--no-audit', '--no-fund']
      : ['install', '--prefer-offline', '--no-audit', '--no-fund']
    const flagStr = flags.slice(1).join(' ')

    onLog(makePreviewLog(jobId, 'info', `RUN npm ${flagStr} (cwd: ${workspacePath})`))
    onLog(makePreviewLog(jobId, 'info', `TIMEOUT 5 minutes`))
    callbacks?.onPhase?.('installing', { cwd: workspacePath, legacyPeerDeps: options?.legacyPeerDeps ?? false })

    const child = spawn('npm', flags, {
      cwd: workspacePath,
      shell: true,
      env: { ...process.env, FORCE_COLOR: '0' },
    })

    let lastStderr = ''
    let stdoutTail = ''
    let timedOut = false

    // Stream stdout
    child.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(l => l.trim())
      for (const line of lines) {
        stdoutTail = `${stdoutTail}\n${line}`.slice(-2000)
        onLog(makePreviewLog(jobId, 'run', line, 'stdout'))
      }
    })

    // Stream stderr
    child.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(l => l.trim())
      for (const line of lines) {
        lastStderr = line
        // npm writes progress/warnings to stderr — treat as info unless it looks like an error
        const isError = line.toLowerCase().includes('error') || line.toLowerCase().includes('err!')
        onLog(makePreviewLog(jobId, isError ? 'error' : 'run', line, 'stderr'))
      }
    })

    // Timeout
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
      reject(new Error(`npm install timed out after 5 minutes`))
    }, NPM_INSTALL_TIMEOUT_MS)

    child.on('close', (code) => {
      clearTimeout(timer)
      if (timedOut) return

      const durationMs = Date.now() - startTime
      const durationSec = (durationMs / 1000).toFixed(1)

      const summary = {
        phase: 'installing' as const,
        command: `npm ${flagStr}`,
        cwd: workspacePath,
        exitCode: code ?? null,
        durationMs,
        timedOut: false,
        stdoutTail,
        stderrTail: lastStderr,
      }
      callbacks?.onCommandSummary?.(summary)

      if (code === 0) {
        onLog(makePreviewLog(jobId, 'success', `DEPS npm install completed in ${durationSec}s`))
        resolve()
      } else {
        const msg = `npm install failed with exit code ${code}. Last stderr: ${lastStderr}`
        onLog(makePreviewLog(jobId, 'error', `DEPS FAILED: ${msg}`))
        callbacks?.onFailure?.({ phase: 'installing', error: new Error(msg), commandSummary: summary })
        reject(new Error(msg))
      }
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      const msg = `npm install process error: ${err.message}`
      onLog(makePreviewLog(jobId, 'error', msg))
      callbacks?.onFailure?.({ phase: 'installing', error: new Error(msg) })
      reject(new Error(msg))
    })
  })
}

// ─── Health check ─────────────────────────────────────────────

const HEALTH_CHECK_INTERVAL_MS = 2000
const HEALTH_CHECK_TIMEOUT_MS  = 60 * 1000  // 60 seconds (default)
const HEALTH_CHECK_TIMEOUT_EXTENDED_MS = 120 * 1000 // 120 seconds (repair attempt)

function httpGet(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume() // drain
      resolve(res.statusCode ?? 0)
    })
    req.setTimeout(3000, () => {
      req.destroy()
      reject(new Error('timeout'))
    })
    req.on('error', reject)
  })
}

export async function waitForHealthy(
  jobId: string,
  url: string,
  onLog: (log: PreviewLogEntry) => void,
  callbacks?: PreviewTelemetryCallbacks,
  timeoutMs: number = HEALTH_CHECK_TIMEOUT_MS
): Promise<boolean> {
  const start = Date.now()
  let attempt = 0
  const timeoutSec = Math.round(timeoutMs / 1000)

  onLog(makePreviewLog(jobId, 'info', `HEALTH CHECK waiting for ${url} (timeout: ${timeoutSec}s)`))
  callbacks?.onPhase?.('healthcheck', { url, timeoutMs })

  while (Date.now() - start < timeoutMs) {
    attempt++
    try {
      const status = await httpGet(url)
      if (status >= 200 && status < 400) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1)
        onLog(makePreviewLog(jobId, 'success', `HEALTH CHECK passed (HTTP ${status}) after ${elapsed}s, ${attempt} attempts`))
        return true
      }
      onLog(makePreviewLog(jobId, 'run', `HEALTH CHECK attempt ${attempt}: HTTP ${status} — retrying...`))
    } catch {
      onLog(makePreviewLog(jobId, 'run', `HEALTH CHECK attempt ${attempt}: not ready — retrying in 2s...`))
    }
    await new Promise(r => setTimeout(r, HEALTH_CHECK_INTERVAL_MS))
  }

  onLog(makePreviewLog(jobId, 'error', `HEALTH CHECK timed out after ${timeoutSec}s (${attempt} attempts)`))
  // Note: onFailure is NOT called here — caller decides whether to repair or fail
  return false
}

// ─── Vite server start ────────────────────────────────────────

export function startViteProcess(
  jobId: string,
  workspacePath: string,
  port: number,
  onLog: (log: PreviewLogEntry) => void,
  callbacks?: PreviewTelemetryCallbacks
): ChildProcess {
  onLog(makePreviewLog(jobId, 'info', `RUN npx vite --port ${port} --host 0.0.0.0 (cwd: ${workspacePath})`))
  callbacks?.onPhase?.('starting', { port, cwd: workspacePath })

  const child = spawn('npx', ['vite', '--port', String(port), '--host', '0.0.0.0'], {
    cwd: workspacePath,
    shell: true,
    env: { ...process.env, FORCE_COLOR: '0', NODE_ENV: 'development' },
    detached: false,
  })

  child.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(l => l.trim())
    for (const line of lines) {
      onLog(makePreviewLog(jobId, 'run', line, 'stdout'))
    }
  })

  child.stderr?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(l => l.trim())
    for (const line of lines) {
      const isError = line.toLowerCase().includes('error') && !line.toLowerCase().includes('warning')
      onLog(makePreviewLog(jobId, isError ? 'error' : 'run', line, 'stderr'))
    }
  })

  child.on('error', (err) => {
    onLog(makePreviewLog(jobId, 'error', `Vite process error: ${err.message}`))
  })

  return child
}

// ─── Full preview start ───────────────────────────────────────

export async function startPreview(
  jobId: string,
  workspacePath: string,
  onLog: (log: PreviewLogEntry) => void,
  callbacks?: PreviewTelemetryCallbacks
): Promise<PreviewInstance> {
  const installStart = Date.now()

  // Step 1: npm install — with autonomous repair fallback (--legacy-peer-deps)
  try {
    await runNpmInstall(jobId, workspacePath, onLog, callbacks)
  } catch (installErr) {
    const reason = installErr instanceof Error ? installErr.message : String(installErr)
    onLog(makePreviewLog(jobId, 'info', `REPAIR: npm install failed — retrying with --legacy-peer-deps`))
    await callbacks?.onRepairAttempt?.({
      phase: 'installing',
      attempt: 1,
      reason,
      strategy: 'legacy-peer-deps',
    })
    // Repair attempt: retry with --legacy-peer-deps (no onFailure on first failure)
    await runNpmInstall(jobId, workspacePath, onLog, callbacks, { legacyPeerDeps: true })
  }
  const installDurationMs = Date.now() - installStart

  // Step 2: allocate port
  const port = await allocatePort()
  const url = `http://localhost:${port}`
  onLog(makePreviewLog(jobId, 'info', `PORT allocated: ${port}`))

  // Step 3: start Vite
  const viteStart = Date.now()
  const child = startViteProcess(jobId, workspacePath, port, onLog, callbacks)

  const pid = child.pid ?? 0
  onLog(makePreviewLog(jobId, 'info', `VITE started (PID: ${pid})`))

  // Step 4: health check — with autonomous repair fallback (extended 120s timeout)
  let healthy = await waitForHealthy(jobId, url, onLog, callbacks, HEALTH_CHECK_TIMEOUT_MS)

  if (!healthy) {
    onLog(makePreviewLog(jobId, 'info', `REPAIR: health check timed out at 60s — extending to 120s`))
    await callbacks?.onRepairAttempt?.({
      phase: 'healthcheck',
      attempt: 1,
      reason: 'Health check timed out at 60s',
      strategy: 'extended-timeout-120s',
    })
    healthy = await waitForHealthy(jobId, url, onLog, callbacks, HEALTH_CHECK_TIMEOUT_EXTENDED_MS)
  }

  if (!healthy) {
    child.kill('SIGKILL')
    freePort(port)
    const err = new Error(`Preview server at ${url} did not become healthy within 120 seconds (repair attempted)`)
    callbacks?.onFailure?.({ phase: 'healthcheck', error: err })
    throw err
  }

  const startDurationMs = Date.now() - viteStart

  const instance: PreviewInstance = {
    jobId,
    workspacePath,
    port,
    pid,
    process: child,
    status: 'ready',
    url,
    startedAt: new Date(),
    installDurationMs,
    startDurationMs,
  }

  previews.set(jobId, instance)

  // Handle unexpected process exit
  child.on('close', (code) => {
    const inst = previews.get(jobId)
    if (inst && inst.status === 'ready') {
      inst.status = 'stopped'
      onLog(makePreviewLog(jobId, 'info', `VITE process exited (code: ${code})`))
    }
  })

  onLog(makePreviewLog(jobId, 'success', `PREVIEW READY at ${url} (install: ${(installDurationMs/1000).toFixed(1)}s, start: ${(startDurationMs/1000).toFixed(1)}s)`))

  return instance
}

// ─── Preview lifecycle manager ────────────────────────────────

const PREVIEW_MAX_AGE_MS = 2 * 60 * 60 * 1000  // 2 hours
const LIFECYCLE_CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

let lifecycleInterval: ReturnType<typeof setInterval> | null = null

export function startPreviewLifecycleManager(): void {
  if (lifecycleInterval) return
  lifecycleInterval = setInterval(() => {
    const now = Date.now()
    for (const [jobId, instance] of previews) {
      if (instance.status !== 'ready') continue
      const ageMs = now - instance.startedAt.getTime()
      if (ageMs > PREVIEW_MAX_AGE_MS) {
        const ageHr = (ageMs / 3_600_000).toFixed(1)
        console.log(`[PreviewManager] Auto-killing preview for job ${jobId} (age: ${ageHr}h, port: ${instance.port})`)
        try {
          killProcess(instance.process, instance.pid)
        } catch {}
        freePort(instance.port)
        instance.status = 'stopped'
        previews.delete(jobId)
      }
    }
  }, LIFECYCLE_CHECK_INTERVAL_MS)
  console.log('[PreviewManager] Lifecycle manager started (auto-kill after 2h, check every 5min)')
}

export function stopPreviewLifecycleManager(): void {
  if (lifecycleInterval) {
    clearInterval(lifecycleInterval)
    lifecycleInterval = null
    console.log('[PreviewManager] Lifecycle manager stopped')
  }
}

export interface ActivePreviewSummary {
  jobId: string
  port: number
  pid: number
  status: PreviewStatus
  url: string
  startedAt: Date
  ageMs: number
  installDurationMs?: number
  startDurationMs?: number
}

export function getActivePreviewsSummary(): ActivePreviewSummary[] {
  const now = Date.now()
  return Array.from(previews.values()).map(inst => ({
    jobId: inst.jobId,
    port: inst.port,
    pid: inst.pid,
    status: inst.status,
    url: inst.url,
    startedAt: inst.startedAt,
    ageMs: now - inst.startedAt.getTime(),
    installDurationMs: inst.installDurationMs,
    startDurationMs: inst.startDurationMs,
  }))
}

// ─── Kill process (cross-platform) ───────────────────────────

function killProcess(child: ChildProcess, pid: number): void {
  if (process.platform === 'win32') {
    // On Windows, shell:true spawns cmd.exe; SIGTERM doesn't propagate.
    // Use taskkill /F /T to force-kill the entire process tree.
    try {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' })
    } catch {
      // Process may have already exited
      try { child.kill() } catch {}
    }
  } else {
    try { child.kill('SIGTERM') } catch {}
    setTimeout(() => {
      try { child.kill('SIGKILL') } catch {}
    }, 3000)
  }
}

// ─── Stop preview ─────────────────────────────────────────────

export function stopPreview(jobId: string): boolean {
  const instance = previews.get(jobId)
  if (!instance) return false

  killProcess(instance.process, instance.pid)

  instance.status = 'stopped'
  freePort(instance.port)
  previews.delete(jobId)

  return true
}

// ─── Get preview status ───────────────────────────────────────

export function getPreviewInstance(jobId: string): PreviewInstance | null {
  return previews.get(jobId) ?? null
}

export function getAllPreviews(): PreviewInstance[] {
  return Array.from(previews.values())
}

// ─── Cleanup all (called on server shutdown) ──────────────────

export function cleanupAllPreviews(): void {
  console.log(`[PreviewManager] Cleaning up ${previews.size} preview(s)...`)
  for (const [jobId, instance] of previews) {
    try {
      killProcess(instance.process, instance.pid)
      freePort(instance.port)
      console.log(`[PreviewManager] Stopped preview for job ${jobId} (PID: ${instance.pid})`)
    } catch (err) {
      console.error(`[PreviewManager] Error stopping preview ${jobId}:`, err)
    }
  }
  previews.clear()
  usedPorts.clear()
}
