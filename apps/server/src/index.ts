// ─── MUST BE FIRST: load env vars before any other local module ──
// providers.ts, planner.ts etc. read process.env at module load time.
// TypeScript hoists imports, so this side-effect import runs before
// any subsequent local module is required.
import './env'

import path from 'path'
import fs from 'fs'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'

import { authRouter } from './routes/auth'
import { projectsRouter } from './routes/projects'
import { chatsRouter } from './routes/chats'
import { uploadsRouter } from './routes/uploads'
import { billingRouter } from './routes/billing'
import { plannerRouter } from './routes/planner'
import { previewRouter } from './routes/preview'
import { workerInternalRouter } from './routes/workerInternal'
import { memoryRouter } from './routes/memory'
import browserRouter from './routes/browser'
import { jobsRouter } from './routes/jobs'
import { workspacesRouter } from './routes/workspaces'
import { buildersRouter } from './routes/builders'
import { publishRouter } from './routes/publish'
import { agentsRouter } from './routes/agents'
import { visualBuilderRouter } from './routes/visualBuilder'
import { apiKeysRouter } from './routes/apiKeys'
import { registerSocketEvents } from './socket/events'
import { cleanupAllPreviews, startPreviewLifecycleManager, stopPreviewLifecycleManager } from './services/previewManager'
import { cleanupStaleJobsOnStartup } from './jobs/builderQueue'
import { cleanupAllSessions } from './services/browserControl'
import { getProviderStatus } from './lib/providers'
import { getAgentRegistry } from './agents'
import { connectStatusBridge, disconnectStatusBridge } from './agents/socketBridge'
import { startHealthPolling, stopHealthPolling } from './services/workerRouter'
import { registerBuiltinPlugins, pluginRegistry } from './services/pluginSystem'

// ─── Ensure required directories exist at startup ────────────

fs.mkdirSync(path.join(process.cwd(), 'uploads'), { recursive: true })
fs.mkdirSync(path.join(process.cwd(), 'workspaces'), { recursive: true })
fs.mkdirSync(path.join(process.cwd(), 'browser-screenshots'), { recursive: true })

// ─── App setup ────────────────────────────────────────────────

const app = express()
const httpServer = createServer(app)

// ─── CORS origin list ─────────────────────────────────────────
// Supports:
//   - CLIENT_URL env var (single origin, e.g. https://yourdomain.com)
//   - CORS_ORIGINS env var (comma-separated list for multi-origin)
//   - localhost:5173 always allowed in development
//   - www.<domain> variant automatically added for any production CLIENT_URL

function buildCorsOrigins(): string | string[] | RegExp {
  // Explicit multi-origin list takes priority
  if (process.env.CORS_ORIGINS) {
    return process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  }

  const clientUrl = process.env.CLIENT_URL

  if (clientUrl && clientUrl !== 'http://localhost:5173') {
    // Production: allow apex + www variant + localhost dev
    const origins: string[] = [clientUrl]
    // Generically add www. variant for any non-localhost production domain
    // e.g. https://example.com → https://www.example.com
    if (!clientUrl.includes('localhost') && !clientUrl.includes('127.0.0.1')) {
      const wwwVariant = clientUrl.replace('://', '://www.')
      if (!origins.includes(wwwVariant)) {
        origins.push(wwwVariant)
      }
    }
    // Always allow local dev
    origins.push('http://localhost:5173', 'http://localhost:3000')
    return origins
  }

  // Development default
  return ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:4173']
}

const corsOrigins = buildCorsOrigins()

// ─── Socket.io ────────────────────────────────────────────────

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})

// ─── Middleware ───────────────────────────────────────────────

app.use(helmet({ contentSecurityPolicy: false }))
app.use(cors({
  origin: corsOrigins,
  credentials: true,
}))
app.use(morgan('dev'))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Static uploads
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')))

// ─── Routes ───────────────────────────────────────────────────

app.use('/api/auth', authRouter)
app.use('/api/projects', projectsRouter)
app.use('/api/chats', chatsRouter)
app.use('/api/uploads', uploadsRouter)
app.use('/api/billing', billingRouter)
app.use('/api/planner', plannerRouter)
app.use('/api/preview', previewRouter)
app.use('/internal', workerInternalRouter)
app.use('/api/memory', memoryRouter)
app.use('/api/browser', browserRouter)
app.use('/api/jobs', jobsRouter)
app.use('/api/workspaces', workspacesRouter)
app.use('/api/builders', buildersRouter)
app.use('/api/publish', publishRouter)
app.use('/api/agents', agentsRouter)
app.use('/api/vb', visualBuilderRouter)
app.use('/api/keys', apiKeysRouter)

// Health check — available at both /health (nginx direct) and /api/health (nginx /api/ proxy)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Provider status
app.get('/api/providers/status', (_req, res) => {
  res.json(getProviderStatus())
})

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err.message)
  res.status(500).json({ error: err.message ?? 'Internal server error' })
})

// ─── Socket events ────────────────────────────────────────────

registerSocketEvents(io)
connectStatusBridge(io)

// ─── Start ────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3001', 10)

httpServer.listen(PORT, () => {
  console.log(`\n🚀 CodedXP Server running on http://localhost:${PORT}`)
  console.log(`   Socket.io ready`)
  console.log(`   Environment: ${process.env.NODE_ENV ?? 'development'}`)
  // Initialize agent registry (logs all agent configs)
  const registry = getAgentRegistry()
  console.log(`   Agent Registry: ${registry.size} agents loaded`)
  // Initialize plugin system with built-in plugins
  registerBuiltinPlugins()
  const pluginStatus = pluginRegistry.getStatus()
  console.log(`   Plugin System: ${pluginStatus.total} plugins (${pluginStatus.enabled} enabled)\n`)
  // Start worker health polling (no-op if no remote workers configured)
  startHealthPolling()
  // Start preview lifecycle manager (auto-kill previews older than 2h)
  startPreviewLifecycleManager()
  // Clean up stale jobs from previous server sessions — prevents auto-build on page load
  cleanupStaleJobsOnStartup().catch((err) => {
    console.warn('[Server] Stale job cleanup failed (non-fatal):', err)
  })
})

// ─── Graceful shutdown ────────────────────────────────────────

function gracefulShutdown(signal: string) {
  console.log(`\n[Server] ${signal} received — cleaning up preview processes...`)
  stopHealthPolling()
  stopPreviewLifecycleManager()
  disconnectStatusBridge()
  cleanupAllPreviews()
  cleanupAllSessions()
  httpServer.close(() => {
    console.log('[Server] HTTP server closed')
    process.exit(0)
  })
  // Force exit after 5s if server doesn't close cleanly
  setTimeout(() => process.exit(1), 5000)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT',  () => gracefulShutdown('SIGINT'))

export { io }
