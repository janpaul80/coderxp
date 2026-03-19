import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { apiRouter } from './routes/api'


const app = express()
const PORT = parseInt(process.env.PORT ?? '3001', 10)

// ─── Middleware ───────────────────────────────────────────────

app.use(helmet({ contentSecurityPolicy: false }))
app.use(cors({
  origin: process.env.CLIENT_URL ?? 'http://localhost:5173',
  credentials: true,
}))
app.use(morgan('dev'))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// ─── Routes ───────────────────────────────────────────────────


app.use('/api', apiRouter)

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
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

// ─── Start ────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🚀 Closeout Project server running on http://localhost:${PORT}`)
})
