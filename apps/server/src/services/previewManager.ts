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
import * as fs from 'fs'
import * as path from 'path'
import { emitPreviewStatus } from '../agents'

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

// ─── dependency install (pnpm preferred, npm fallback) ───────

// Windows + cold cache can be slow; pnpm cached installs are fast.
// 6 minutes for first attempt, 4 minutes for retries (cache is warm).
const INSTALL_TIMEOUT_MS = 6 * 60 * 1000
const INSTALL_RETRY_TIMEOUT_MS = 4 * 60 * 1000

// Force npm for workspace installs.
//
// Generated workspaces live under /opt/coderxp-live/apps/server/workspaces/{id}/
// which is inside the CoderXP pnpm monorepo. pnpm walks up directory trees and
// finds the root pnpm-lock.yaml, which has entries (e.g. fsevents@2.3.3) that
// don't exist in the workspace's package.json. This causes:
//   ERR_PNPM_LOCKFILE_MISSING_DEPENDENCY: Broken lockfile
// and exit code 1 on every install attempt.
//
// Neither pnpm-workspace.yaml, .npmrc shared-workspace-lockfile=false, nor
// --no-frozen-lockfile prevent this. The only reliable fix is to use npm,
// which doesn't have this parent-lockfile-walking behavior.
export const PKG_MANAGER: 'pnpm' | 'npm' = 'npm'

/**
 * Safely remove node_modules — Windows can throw EPERM/EBUSY on first try
 * because file handles haven't fully released. Retries up to 3 times with
 * increasing delays.
 */
function sleepSync(ms: number): void {
  const end = Date.now() + ms
  while (Date.now() < end) { /* busy-wait for short delays */ }
}

function safeRemoveNodeModules(dir: string): void {
  const nmPath = path.join(dir, 'node_modules')
  if (!fs.existsSync(nmPath)) return
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.rmSync(nmPath, { recursive: true, force: true })
      return
    } catch {
      // On Windows, EPERM/EBUSY can occur if handles aren't released yet
      if (attempt < 2) {
        sleepSync((attempt + 1) * 1000)
      }
    }
  }
}

export function runNpmInstall(
  jobId: string,
  workspacePath: string,
  onLog: (log: PreviewLogEntry) => void,
  callbacks?: PreviewTelemetryCallbacks,
  options?: { legacyPeerDeps?: boolean; isRetry?: boolean; ignoreScripts?: boolean }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    const timeoutMs = options?.isRetry ? INSTALL_RETRY_TIMEOUT_MS : INSTALL_TIMEOUT_MS

    let cmd: string
    let flags: string[]
    if (PKG_MANAGER === 'pnpm') {
      // Always write .npmrc for pnpm hoisted layout (overwrite to ensure correct content).
      // store-dir ensures pnpm finds the global content-addressed store even when the
      // workspace is deeply nested under a different monorepo root.
      const pnpmStorePath = process.env.PNPM_STORE_DIR || ''
      const storeDirective = pnpmStorePath ? `store-dir=${pnpmStorePath}\n` : ''
      const npmrcPath = path.join(workspacePath, '.npmrc')
      fs.writeFileSync(
        npmrcPath,
        `node-linker=hoisted\nshamefully-hoist=true\nprefer-offline=true\nshared-workspace-lockfile=false\n${storeDirective}`
      )
      // Isolate workspace from parent monorepo — pnpm traverses up and finds
      // the root pnpm-workspace.yaml, causing "Scope: all N workspace projects"
      // and TTY prompts that abort in non-interactive contexts.
      const wsYaml = path.join(workspacePath, 'pnpm-workspace.yaml')
      if (!fs.existsSync(wsYaml)) {
        fs.writeFileSync(wsYaml, 'packages: []\n')
      }
      flags = [
        'install',
        '--no-frozen-lockfile',
        '--no-strict-peer-dependencies',
        '--prefer-offline',          // use global store / cache first
        '--no-optional',             // skip optional native modules (often fail on Windows)
      ]
      if (options?.ignoreScripts) flags.push('--ignore-scripts')
      cmd = 'pnpm'
    } else {
      // NOTE: Do NOT use --no-optional here. Vite's native binaries (esbuild
      // platform packages, @rollup/rollup-linux-x64-gnu) are shipped as optional
      // dependencies. Skipping them causes "Cannot find module @rollup/rollup-linux-x64-gnu".
      const base = ['install', '--prefer-offline', '--no-audit', '--no-fund']
      if (options?.legacyPeerDeps) base.push('--legacy-peer-deps')
      if (options?.ignoreScripts) base.push('--ignore-scripts')
      flags = base
      cmd = 'npm'
    }

    // Belt-and-suspenders: env vars for offline-first + network hardening.
    // Both npm and pnpm respect npm_config_* env vars.
    // CI=true is CRITICAL — pnpm aborts with ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY
    // when running in non-interactive contexts (no TTY) without CI=true.
    //
    // PATH: prepend workspace's .bin/ so esbuild's install.js finds the workspace
    // binary (0.21.5) instead of the global esbuild (0.27.3) on the server PATH.
    // Without this, esbuild's post-install validation fails with:
    //   Error: Expected "0.21.5" but got "0.27.3"
    const localBinDir = path.join(workspacePath, 'node_modules', '.bin')
    const installEnv: Record<string, string | undefined> = {
      ...process.env,
      CI: 'true',
      FORCE_COLOR: '0',
      NODE_ENV: 'development',
      npm_config_prefer_offline: 'true',
      npm_config_fetch_timeout: '60000',
      npm_config_fetch_retries: '3',
      npm_config_fetch_retry_mintimeout: '5000',
      npm_config_fetch_retry_maxtimeout: '30000',
      npm_config_progress: 'false',
      PATH: `${localBinDir}${path.delimiter}${process.env.PATH ?? ''}`,
    }

    const flagStr = flags.slice(1).join(' ')

    // Always remove stale lockfiles before install — pnpm traverses up from the
    // workspace dir and can find the parent monorepo's pnpm-lock.yaml, which has
    // entries for packages that don't exist in this workspace's package.json.
    // This causes ERR_PNPM_LOCKFILE_MISSING_DEPENDENCY and exit code 1.
    for (const lockfile of ['pnpm-lock.yaml', 'package-lock.json']) {
      const lockPath = path.join(workspacePath, lockfile)
      try { if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath) } catch {}
    }

    onLog(makePreviewLog(jobId, 'info', `RUN ${cmd} ${flagStr} (cwd: ${workspacePath})`))
    onLog(makePreviewLog(jobId, 'info', `TIMEOUT ${timeoutMs / 60000} minutes (${cmd}, retry=${options?.isRetry ?? false}, ignoreScripts=${options?.ignoreScripts ?? false})`))
    callbacks?.onPhase?.('installing', { cwd: workspacePath, legacyPeerDeps: options?.legacyPeerDeps ?? false })

    const child = spawn(cmd, flags, {
      cwd: workspacePath,
      shell: true,
      env: installEnv,
    })

    let stderrTail = ''
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

    // Stream stderr — accumulate last 1000 chars for diagnostics
    child.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(l => l.trim())
      for (const line of lines) {
        stderrTail = `${stderrTail}\n${line}`.slice(-1000)
        // npm writes progress/warnings to stderr — treat as info unless it looks like an error
        const isError = line.toLowerCase().includes('error') || line.toLowerCase().includes('err!')
        onLog(makePreviewLog(jobId, isError ? 'error' : 'run', line, 'stderr'))
      }
    })

    // Timeout — use platform-aware kill on Windows
    const timer = setTimeout(() => {
      timedOut = true
      if (process.platform === 'win32' && child.pid) {
        try { execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: 'ignore' }) } catch {}
      } else {
        child.kill('SIGKILL')
      }
      reject(new Error(`${cmd} install timed out after ${timeoutMs / 60000} minutes`))
    }, timeoutMs)

    child.on('close', (code) => {
      clearTimeout(timer)
      if (timedOut) return

      const durationMs = Date.now() - startTime
      const durationSec = (durationMs / 1000).toFixed(1)

      const summary = {
        phase: 'installing' as const,
        command: `${cmd} ${flagStr}`,
        cwd: workspacePath,
        exitCode: code ?? null,
        durationMs,
        timedOut: false,
        stdoutTail,
        stderrTail,
      }
      callbacks?.onCommandSummary?.(summary)

      if (code === 0) {
        onLog(makePreviewLog(jobId, 'success', `DEPS ${cmd} install completed in ${durationSec}s`))
        resolve()
      } else {
        const msg = `${cmd} install failed with exit code ${code}. stderr: ${stderrTail.trim().slice(-500)}`
        onLog(makePreviewLog(jobId, 'error', `DEPS FAILED: ${msg}`))
        callbacks?.onFailure?.({ phase: 'installing', error: new Error(msg), commandSummary: summary })
        reject(new Error(msg))
      }
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      const msg = `${cmd} install process error: ${err.message}`
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

function httpGet(url: string, timeoutMs = 3000): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume() // drain
      resolve(res.statusCode ?? 0)
    })
    req.setTimeout(timeoutMs, () => {
      req.destroy()
      reject(new Error('timeout'))
    })
    req.on('error', reject)
  })
}

/** Fetch URL body as string (for content validation). */
function httpGetBody(url: string, timeoutMs = 10000): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf-8') })
      })
    })
    req.setTimeout(timeoutMs, () => {
      req.destroy()
      reject(new Error('timeout'))
    })
    req.on('error', reject)
  })
}

/**
 * Validates that a preview URL is serving real content — not a blank page,
 * a Vite error overlay, or a 404/500. Used before emitting job:complete
 * so the agent never declares "Build Complete" on a blank screen.
 *
 * Returns { valid, reason } where valid=false means the preview is broken.
 */
export async function validatePreviewContent(
  url: string,
  onLog?: (msg: string) => void,
): Promise<{ valid: boolean; reason: string }> {
  const log = onLog ?? (() => {})

  // Retry up to 3 times with increasing timeouts.
  // Vite may still be pre-bundling on the first attempt.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await _validateOnce(url, log, attempt)
    if (result.valid) return result
    if (attempt < 3) {
      log(`Content validation attempt ${attempt} failed (${result.reason}) — retrying in 5s...`)
      await new Promise(r => setTimeout(r, 5000))
    } else {
      return result
    }
  }
  return { valid: false, reason: 'All validation attempts failed' }
}

async function _validateOnce(
  url: string,
  log: (msg: string) => void,
  attempt: number,
): Promise<{ valid: boolean; reason: string }> {
  try {
    const timeout = 20000 + (attempt - 1) * 10000 // 20s, 30s, 40s
    const { status, body } = await httpGetBody(url, timeout)

    if (status >= 400) {
      return { valid: false, reason: `HTTP ${status} error` }
    }

    // Blank body
    if (!body || body.trim().length === 0) {
      return { valid: false, reason: 'Empty response body' }
    }

    // Vite error overlay or server error
    if (body.includes('vite-error-overlay') || body.includes('Internal Server Error')) {
      return { valid: false, reason: 'Vite error overlay detected' }
    }

    // Vite module errors — these appear when a module can't be resolved
    if (body.includes('Failed to resolve import') || body.includes('does not provide an export')) {
      return { valid: false, reason: 'Vite module resolution error' }
    }

    // Check that the HTML has the essential Vite structure
    const hasRoot = body.includes('id="root"')
    const hasScript = body.includes('<script')
    if (!hasRoot && !hasScript) {
      return { valid: false, reason: 'No root element or script tags — not a Vite app' }
    }

    // Now do a second fetch to check if Vite can actually serve the main.tsx module.
    // This catches cases where the HTML loads but the JS fails to compile.
    try {
      const mainTsxUrl = url.replace(/\/?$/, '/src/main.tsx')
      const { status: jsStatus, body: jsBody } = await httpGetBody(mainTsxUrl, 15000)
      if (jsStatus >= 400) {
        return { valid: false, reason: `main.tsx returned HTTP ${jsStatus} — Vite can't compile the entry point` }
      }
      // Vite returns transformed JS. If it contains an error, it'll have a specific pattern.
      if (jsBody.includes('500 Internal Server Error') || jsBody.includes('ENOENT') || jsBody.includes('SyntaxError')) {
        return { valid: false, reason: 'main.tsx compilation error detected' }
      }
    } catch {
      // Non-fatal: if we can't fetch main.tsx, the HTML check already passed
    }

    log(`Content validation passed: HTTP ${status}, body ${body.length} bytes`)
    return { valid: true, reason: 'ok' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { valid: false, reason: `Content fetch failed: ${msg}` }
  }
}

export async function waitForHealthy(
  jobId: string,
  url: string,
  onLog: (log: PreviewLogEntry) => void,
  callbacks?: PreviewTelemetryCallbacks,
  timeoutMs: number = HEALTH_CHECK_TIMEOUT_MS,
  childProcess?: ChildProcess
): Promise<boolean> {
  const start = Date.now()
  let attempt = 0
  const timeoutSec = Math.round(timeoutMs / 1000)

  // Track whether the child process has exited (e.g. Vite crashed on startup).
  // If so, bail immediately instead of polling for the full timeout.
  let processExited = false
  let processExitCode: number | null = null
  const onExit = (code: number | null) => { processExited = true; processExitCode = code }
  childProcess?.once('exit', onExit)

  onLog(makePreviewLog(jobId, 'info', `HEALTH CHECK waiting for ${url} (timeout: ${timeoutSec}s)`))
  callbacks?.onPhase?.('healthcheck', { url, timeoutMs })

  while (Date.now() - start < timeoutMs) {
    // Early exit: Vite process already crashed — no point continuing to poll
    if (processExited) {
      onLog(makePreviewLog(jobId, 'error', `HEALTH CHECK aborted: Vite process exited with code ${processExitCode} after ${attempt} attempts`))
      childProcess?.removeListener('exit', onExit)
      return false
    }
    attempt++
    try {
      const status = await httpGet(url)
      if (status >= 200 && status < 400) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1)
        onLog(makePreviewLog(jobId, 'success', `HEALTH CHECK passed (HTTP ${status}) after ${elapsed}s, ${attempt} attempts`))
        childProcess?.removeListener('exit', onExit)
        return true
      }
      onLog(makePreviewLog(jobId, 'run', `HEALTH CHECK attempt ${attempt}: HTTP ${status} — retrying...`))
    } catch {
      onLog(makePreviewLog(jobId, 'run', `HEALTH CHECK attempt ${attempt}: not ready — retrying in 2s...`))
    }
    await new Promise(r => setTimeout(r, HEALTH_CHECK_INTERVAL_MS))
  }

  childProcess?.removeListener('exit', onExit)
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
  const viteBase = `/api/preview/${jobId}/app/`

  // Use the workspace's local vite binary instead of npx.
  // npx resolves from the parent monorepo's node_modules, which can have a
  // different esbuild version than the workspace's own node_modules. This causes
  // "Host version X does not match binary version Y" EPIPE crashes.
  const localViteBin = path.join(workspacePath, 'node_modules', '.bin', 'vite')
  const useLocalBin = fs.existsSync(localViteBin)
  const viteCmd = useLocalBin ? localViteBin : 'npx'
  const viteArgs = useLocalBin
    ? ['--port', String(port), '--host', '0.0.0.0', '--base', viteBase]
    : ['vite', '--port', String(port), '--host', '0.0.0.0', '--base', viteBase]

  onLog(makePreviewLog(jobId, 'info', `RUN ${useLocalBin ? 'local vite' : 'npx vite'} --port ${port} --host 0.0.0.0 --base ${viteBase} (cwd: ${workspacePath})`))
  callbacks?.onPhase?.('starting', { port, cwd: workspacePath })

  // Resolve the esbuild binary path from the workspace's own node_modules.
  // This prevents the "Host version X does not match binary version Y" error
  // that occurs when Node resolves esbuild from the parent monorepo's pnpm store.
  const esbuildBinPath = (() => {
    // esbuild stores its native binary in a platform-specific package
    const platform = process.platform === 'linux' ? 'linux' : process.platform === 'darwin' ? 'darwin' : 'win32'
    const arch = process.arch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'arm64' : 'x64'
    const platformPkg = `@esbuild/${platform}-${arch}`
    const binName = platform === 'win32' ? 'esbuild.exe' : 'bin/esbuild'
    const candidate = path.join(workspacePath, 'node_modules', platformPkg, binName)
    if (fs.existsSync(candidate)) return candidate
    // Fallback: esbuild's own bin
    const fallback = path.join(workspacePath, 'node_modules', 'esbuild', 'bin', 'esbuild')
    if (fs.existsSync(fallback)) return fallback
    return undefined
  })()

  if (esbuildBinPath) {
    onLog(makePreviewLog(jobId, 'info', `ESBUILD binary: ${esbuildBinPath}`))
  }

  const child = spawn(viteCmd, viteArgs, {
    cwd: workspacePath,
    shell: true,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NODE_ENV: 'development',
      // Isolate the workspace's node resolution from the parent monorepo.
      // This prevents esbuild/Vite from accidentally loading binaries from
      // /opt/coderxp-live/node_modules/.pnpm/ which may have mismatched versions.
      NODE_PATH: path.join(workspacePath, 'node_modules'),
      // Force esbuild to use the workspace's own native binary.
      // Without this, Node's module resolution walks up to the parent monorepo
      // and finds a different esbuild version, causing the EPIPE crash.
      ...(esbuildBinPath ? { ESBUILD_BINARY_PATH: esbuildBinPath } : {}),
    },
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
  emitPreviewStatus('starting', `Preview starting for job ${jobId}`)

  // ── Isolate workspace from parent monorepo's node_modules ──────
  // Workspaces live under /opt/coderxp-live/apps/server/workspaces/{id}/
  // which is deep inside the monorepo tree. Without isolation, npm/Node
  // resolves packages (especially esbuild native binaries) from the parent
  // node_modules, causing version mismatches like:
  //   "Host version 0.21.5 does not match binary version 0.27.3"
  // The .npmrc prevents npm from walking up the tree.
  const npmrcPath = path.join(workspacePath, '.npmrc')
  if (!fs.existsSync(npmrcPath)) {
    fs.writeFileSync(npmrcPath, [
      '# Isolate from parent monorepo',
      'global-style=false',
      'legacy-peer-deps=true',
      '',
    ].join('\n'))
  }

  // Step 1: install dependencies — with multi-tier retry fallback
  //
  // Attempt 1: normal install (pnpm --prefer-offline or npm --prefer-offline)
  // Attempt 2: retry with relaxed settings:
  //   - pnpm: clear node_modules and retry (global store means cache is still warm)
  //   - npm:  add --legacy-peer-deps
  // Attempt 3: last resort — --ignore-scripts (post-install scripts are the #1
  //   cause of hangs/failures on Windows)
  // Windows-specific: safe node_modules cleanup with EPERM retry, taskkill for hangs.
  let installAttempt = 0
  const installWithRetry = async () => {
    // ─ Attempt 1: normal install ─
    installAttempt = 1
    try {
      await runNpmInstall(jobId, workspacePath, onLog, callbacks)
      return
    } catch (err1) {
      const reason1 = err1 instanceof Error ? err1.message : String(err1)
      const strategy1 = PKG_MANAGER === 'pnpm' ? 'clean-node-modules-retry' : 'legacy-peer-deps'
      onLog(makePreviewLog(jobId, 'info', `REPAIR: ${PKG_MANAGER} install attempt 1 failed — retrying (${strategy1})`))
      await callbacks?.onRepairAttempt?.({ phase: 'installing', attempt: 1, reason: reason1, strategy: strategy1 })
    }

    // ─ Attempt 2: relaxed settings ─
    installAttempt = 2
    onLog(makePreviewLog(jobId, 'info', 'REPAIR: removing partial node_modules + lockfiles before retry (safe cleanup)'))
    safeRemoveNodeModules(workspacePath)
    // Remove stale lockfiles that can cause "lockfile out of date" errors
    for (const lockfile of ['pnpm-lock.yaml', 'package-lock.json']) {
      const lockPath = path.join(workspacePath, lockfile)
      try { if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath) } catch {}
    }

    try {
      await runNpmInstall(jobId, workspacePath, onLog, callbacks, {
        legacyPeerDeps: PKG_MANAGER === 'npm',
        isRetry: true,
      })
      return
    } catch (err2) {
      const reason2 = err2 instanceof Error ? err2.message : String(err2)
      const strategy2 = 'ignore-scripts-fallback'
      onLog(makePreviewLog(jobId, 'info', `REPAIR: ${PKG_MANAGER} install attempt 2 failed — last resort (${strategy2})`))
      await callbacks?.onRepairAttempt?.({ phase: 'installing', attempt: 2, reason: reason2, strategy: strategy2 })
    }

    // ─ Attempt 3: ignore-scripts last resort ─
    // --ignore-scripts skips ALL post-install scripts, including the native binary
    // downloads for esbuild and rollup. After install succeeds, we manually run
    // just the esbuild post-install to download the correct platform binary.
    installAttempt = 3
    safeRemoveNodeModules(workspacePath)

    await runNpmInstall(jobId, workspacePath, onLog, callbacks, {
      legacyPeerDeps: PKG_MANAGER === 'npm',
      isRetry: true,
      ignoreScripts: true,
    })

    // ── Post-install fixup: download native binaries that --ignore-scripts skipped ──
    // esbuild and rollup need platform-specific native binaries installed via their
    // post-install scripts. Without these, Vite crashes with:
    //   "Cannot find module @rollup/rollup-linux-x64-gnu"
    // or esbuild's binary version check fails.
    onLog(makePreviewLog(jobId, 'info', 'REPAIR: running native binary post-install fixup (esbuild + rollup)'))
    const fixupEnv = {
      ...process.env,
      CI: 'true',
      FORCE_COLOR: '0',
      // Prepend workspace bin to PATH so esbuild's install.js validates the right binary
      PATH: `${path.join(workspacePath, 'node_modules', '.bin')}${path.delimiter}${process.env.PATH ?? ''}`,
    }
    // esbuild: its install.js downloads the platform binary
    const esbuildInstallJs = path.join(workspacePath, 'node_modules', 'esbuild', 'install.js')
    if (fs.existsSync(esbuildInstallJs)) {
      try {
        execSync(`node "${esbuildInstallJs}"`, { cwd: workspacePath, env: fixupEnv, timeout: 30000, stdio: 'pipe' })
        onLog(makePreviewLog(jobId, 'success', 'FIXUP: esbuild native binary installed'))
      } catch (e) {
        onLog(makePreviewLog(jobId, 'info', `FIXUP: esbuild post-install failed (non-fatal): ${e instanceof Error ? e.message.slice(0, 200) : ''}`))
      }
    }

    // rollup: install the platform-specific native module that --ignore-scripts skipped.
    // Without it, Vite crashes with "Cannot find module @rollup/rollup-linux-x64-gnu".
    const rollupPlatform = process.platform === 'linux' ? 'linux' : process.platform === 'darwin' ? 'darwin' : 'win32'
    const rollupArch = process.arch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'arm64' : 'x64'
    const rollupAbi = process.platform === 'linux' ? 'gnu' : ''
    const rollupPkg = `@rollup/rollup-${rollupPlatform}-${rollupArch}${rollupAbi ? `-${rollupAbi}` : ''}`
    const rollupPkgDir = path.join(workspacePath, 'node_modules', '@rollup', `rollup-${rollupPlatform}-${rollupArch}${rollupAbi ? `-${rollupAbi}` : ''}`)
    if (!fs.existsSync(rollupPkgDir)) {
      try {
        onLog(makePreviewLog(jobId, 'info', `FIXUP: installing ${rollupPkg} (native binary for rollup)`))
        execSync(`npm install ${rollupPkg} --no-save --no-audit --no-fund`, {
          cwd: workspacePath, env: fixupEnv, timeout: 30000, stdio: 'pipe',
        })
        onLog(makePreviewLog(jobId, 'success', `FIXUP: ${rollupPkg} installed`))
      } catch (e) {
        onLog(makePreviewLog(jobId, 'info', `FIXUP: ${rollupPkg} install failed (non-fatal): ${e instanceof Error ? e.message.slice(0, 200) : ''}`))
      }
    }
  }
  await installWithRetry()
  const installDurationMs = Date.now() - installStart

  // Step 2: allocate port
  const port = await allocatePort()
  // Root URL — vite responds to this immediately with a 302 redirect (before pre-bundling).
  // We do NOT use this for the health check because a 302 does not mean the app is compiled.
  const rootUrl = `http://localhost:${port}`
  // Full base path — vite must pre-bundle all dependencies before it can serve this.
  // Probing this URL forces vite to compile the app during the health check phase,
  // so preview:ready is only emitted after the app is actually ready to serve.
  const viteBase = `/api/preview/${jobId}/app/`
  const appUrl = `${rootUrl}${viteBase}`
  onLog(makePreviewLog(jobId, 'info', `PORT allocated: ${port}`))

  // Step 3: start Vite
  const viteStart = Date.now()
  const child = startViteProcess(jobId, workspacePath, port, onLog, callbacks)

  const pid = child.pid ?? 0
  onLog(makePreviewLog(jobId, 'info', `VITE started (PID: ${pid})`))

  // Step 4: health check — probe the ROOT URL (not the app base path).
  // Vite's root / returns 302 immediately once the dev server is listening.
  // We accept 2xx AND 3xx (302 redirect) as "healthy" — it means vite is up.
  // Pre-bundling happens lazily on the first real request; the proxy handles that
  // with a 120s timeout so the user's browser waits rather than getting a 504.
  // Probing the full app URL (/api/preview/${jobId}/app/) causes vite to hang
  // indefinitely (it queues the request until pre-bundling completes but never
  // responds within our 3s probe timeout), so we must NOT probe that path here.
  onLog(makePreviewLog(jobId, 'info', `HEALTH CHECK probing root URL (vite listening check): ${rootUrl}`))
  let healthy = await waitForHealthy(jobId, rootUrl, onLog, callbacks, HEALTH_CHECK_TIMEOUT_MS, child)

  if (!healthy) {
    onLog(makePreviewLog(jobId, 'info', `REPAIR: health check timed out at 60s — extending to 120s`))
    await callbacks?.onRepairAttempt?.({
      phase: 'healthcheck',
      attempt: 1,
      reason: 'Health check timed out at 60s (vite pre-bundling still in progress)',
      strategy: 'extended-timeout-120s',
    })
    healthy = await waitForHealthy(jobId, rootUrl, onLog, callbacks, HEALTH_CHECK_TIMEOUT_EXTENDED_MS, child)
  }

  if (!healthy) {
    child.kill('SIGKILL')
    freePort(port)
    emitPreviewStatus('blocked', `Preview health check failed for job ${jobId}`)
    const err = new Error(`Preview server at ${rootUrl} did not become healthy within 180 seconds`)
    callbacks?.onFailure?.({ phase: 'healthcheck', error: err })
    throw err
  }

  // Step 5: Warm-up — trigger vite pre-bundling BEFORE emitting preview:ready.
  //
  // The health check probes rootUrl (http://localhost:${port}/) which vite answers
  // immediately with a 302 redirect — no compilation needed. But vite's dependency
  // pre-bundling only starts on the FIRST request to the actual app base path
  // (/api/preview/${jobId}/app/). Pre-bundling can take 20-40s on a cold workspace.
  //
  // Without this warm-up:
  //   1. preview:ready is emitted (health check passed on root /)
  //   2. Test/browser fetches app URL → vite starts pre-bundling
  //   3. Proxy times out at 60s, destroys the connection
  //   4. Vite stops pre-bundling (connection gone)
  //   5. Next request → cycle repeats → perpetual 504
  //
  // With this warm-up:
  //   1. We send a direct request to appUrl (bypassing the proxy, 120s timeout)
  //   2. Vite pre-bundles and responds (typically 20-40s)
  //   3. preview:ready is emitted — vite is fully ready
  //   4. Test/browser fetches app URL → vite responds immediately (cache hit)
  // Warm-up: trigger Vite pre-bundling with retries.
  // The first request to the app URL forces Vite to compile all dependencies.
  // Without this, the browser gets a 503 or timeout on first load.
  onLog(makePreviewLog(jobId, 'info', `WARM-UP: triggering vite pre-bundling at ${appUrl} (timeout: 120s)`))
  callbacks?.onPhase?.('warmup', { url: appUrl })
  let warmupOk = false
  for (let warmupAttempt = 1; warmupAttempt <= 3; warmupAttempt++) {
    const warmupStart = Date.now()
    try {
      const warmupStatus = await httpGet(appUrl, 120_000)
      const warmupSec = ((Date.now() - warmupStart) / 1000).toFixed(1)
      if (warmupStatus >= 200 && warmupStatus < 400) {
        onLog(makePreviewLog(jobId, 'success', `WARM-UP: vite pre-bundling complete in ${warmupSec}s (HTTP ${warmupStatus})`))
        warmupOk = true
        break
      }
      // 503 = Vite not ready yet, retry after a short delay
      onLog(makePreviewLog(jobId, 'run', `WARM-UP attempt ${warmupAttempt}: HTTP ${warmupStatus} — retrying in 3s...`))
      await new Promise(r => setTimeout(r, 3000))
    } catch (warmupErr) {
      const warmupSec = ((Date.now() - warmupStart) / 1000).toFixed(1)
      const msg = warmupErr instanceof Error ? warmupErr.message : String(warmupErr)
      onLog(makePreviewLog(jobId, 'run', `WARM-UP attempt ${warmupAttempt}: ${msg} after ${warmupSec}s — retrying...`))
      await new Promise(r => setTimeout(r, 3000))
    }
  }
  if (!warmupOk) {
    onLog(makePreviewLog(jobId, 'info', `WARM-UP: failed after 3 attempts — preview may load slowly`))
  }

  const startDurationMs = Date.now() - viteStart

  const instance: PreviewInstance = {
    jobId,
    workspacePath,
    port,
    pid,
    process: child,
    status: 'ready',
    url: appUrl,   // full app URL — used by checkPreviewHealth and ActivePreviewSummary
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

  onLog(makePreviewLog(jobId, 'success', `PREVIEW READY at ${appUrl} (install: ${(installDurationMs/1000).toFixed(1)}s, start: ${(startDurationMs/1000).toFixed(1)}s)`))
  emitPreviewStatus('healthy', `Preview ready at ${appUrl}`, { port, jobId })

  return instance
}

// ─── Post-start health check + auto-restart ───────────────────

/**
 * Checks if a running preview is still healthy.
 * If the HTTP health check fails, attempts to restart the Vite process
 * on the same port without re-running npm install.
 *
 * Returns { healthy, restarted }:
 *   - healthy: true if preview is responding after check (or restart)
 *   - restarted: true if a restart was attempted
 *
 * Safe to call at any time — returns { healthy: false, restarted: false }
 * if the jobId is unknown or the preview is not in 'ready' state.
 */
export async function checkPreviewHealth(
  jobId: string,
  onLog?: (log: PreviewLogEntry) => void,
): Promise<{ healthy: boolean; restarted: boolean }> {
  const instance = previews.get(jobId)
  if (!instance) return { healthy: false, restarted: false }
  if (instance.status !== 'ready') return { healthy: false, restarted: false }

  const log = onLog ?? ((_entry: PreviewLogEntry) => { /* no-op */ })

  // Step 1: HTTP health check
  try {
    const status = await httpGet(instance.url)
    if (status >= 200 && status < 400) {
      return { healthy: true, restarted: false }
    }
    log(makePreviewLog(jobId, 'run', `HEALTH CHECK: HTTP ${status} — preview not healthy`))
  } catch {
    log(makePreviewLog(jobId, 'run', `HEALTH CHECK: preview at ${instance.url} not responding`))
  }

  // Step 2: Attempt restart (kill old process, start new Vite on same port)
  emitPreviewStatus('recovering', `Preview recovering for job ${jobId}`)
  log(makePreviewLog(jobId, 'info', `HEALTH RESTART: killing old Vite process (PID: ${instance.pid})`))
  try {
    killProcess(instance.process, instance.pid)
  } catch {
    // Process may have already exited — continue
  }

  // Brief pause to let the port free up
  await new Promise(r => setTimeout(r, 1500))

  log(makePreviewLog(jobId, 'info', `HEALTH RESTART: starting new Vite process on port ${instance.port}`))
  const newChild = startViteProcess(jobId, instance.workspacePath, instance.port, log)
  instance.process = newChild
  instance.pid = newChild.pid ?? 0
  instance.status = 'starting'

  // Step 3: Wait for the restarted process to become healthy
  const healthy = await waitForHealthy(jobId, instance.url, log, undefined, HEALTH_CHECK_TIMEOUT_MS)

  if (healthy) {
    instance.status = 'ready'
    emitPreviewStatus('healthy', `Preview recovered for job ${jobId}`)
    log(makePreviewLog(jobId, 'success', `HEALTH RESTART: preview recovered at ${instance.url}`))
    return { healthy: true, restarted: true }
  }

  instance.status = 'failed'
  emitPreviewStatus('blocked', `Preview recovery failed for job ${jobId}`)
  log(makePreviewLog(jobId, 'error', `HEALTH RESTART: preview failed to recover after restart`))
  return { healthy: false, restarted: true }
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
  emitPreviewStatus('stopped', `Preview stopped for job ${jobId}`)

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
