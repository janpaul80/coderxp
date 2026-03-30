import type { CodeGenProject } from './codeGeneratorTypes'
import { getPremiumTailwindConfig, getPremiumIndexCss, type ProjectType } from './designSystem'

export function templatePackageJson(project: CodeGenProject): string {
  const hasAuth = project.features.some(f => /auth|login|register|user/i.test(f))
  const hasStripe = project.integrations.some(i => /stripe/i.test(i))
  const hasSupabase = project.integrations.some(i => /supabase/i.test(i))
  const hasDB = (project.techStack.database?.length ?? 0) > 0
  const hasServer = project.backendScope.length > 0
  const deps: Record<string, string> = {
    react: '^18.3.0',
    'react-dom': '^18.3.0',
    'react-router-dom': '^6.26.0',
    axios: '^1.7.0',
    // framer-motion: always included — all AI prompts inject motion components
    'framer-motion': '^11.3.0',
    // lucide-react: always included — templates and AI prompts use icons extensively
    'lucide-react': '^0.460.0',
  }
  if (hasServer) Object.assign(deps, { express: '^4.21.0', cors: '^2.8.5', dotenv: '^16.4.0', helmet: '^8.0.0', morgan: '^1.10.0' })
  if (hasAuth) Object.assign(deps, { jsonwebtoken: '^9.0.2', bcryptjs: '^2.4.3' })
  if (hasDB) deps['@prisma/client'] = '^5.22.0'
  if (hasStripe) deps['stripe'] = '^17.0.0'
  if (hasSupabase) deps['@supabase/supabase-js'] = '^2.45.0'
  const devDeps: Record<string, string> = { '@types/react': '^18.3.0', '@types/react-dom': '^18.3.0', '@vitejs/plugin-react': '^4.3.0', typescript: '^5.6.0', vite: '^5.4.0', esbuild: '^0.21.5', tailwindcss: '^3.4.0', autoprefixer: '^10.4.0', postcss: '^8.4.0' }
  if (hasServer) Object.assign(devDeps, { '@types/express': '^5.0.0', '@types/cors': '^2.8.17', '@types/morgan': '^1.9.9', '@types/node': '^22.0.0', tsx: '^4.19.0', concurrently: '^9.0.0' })
  if (hasAuth) Object.assign(devDeps, { '@types/jsonwebtoken': '^9.0.7', '@types/bcryptjs': '^2.4.6' })
  if (hasDB) devDeps['prisma'] = '^5.22.0'
  const scripts: Record<string, string> = { dev: hasServer ? 'concurrently "vite" "tsx watch server/index.ts"' : 'vite', build: 'tsc --noEmit && vite build', preview: 'vite preview --port 4173', 'type-check': 'tsc --noEmit' }
  if (hasServer) { scripts['server'] = 'tsx server/index.ts'; scripts['start'] = 'node dist/server/index.js' }
  if (hasDB) Object.assign(scripts, { 'db:push': 'prisma db push', 'db:migrate': 'prisma migrate dev', 'db:studio': 'prisma studio', 'db:generate': 'prisma generate' })
  return JSON.stringify({ name: project.projectName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''), version: '1.0.0', private: true, type: 'module', scripts, dependencies: deps, devDependencies: devDeps }, null, 2)
}

export function templateTsConfig(): string {
  return JSON.stringify({ compilerOptions: { target: 'ES2022', useDefineForClassFields: true, lib: ['ES2022', 'DOM', 'DOM.Iterable'], module: 'ESNext', skipLibCheck: true, moduleResolution: 'bundler', allowImportingTsExtensions: true, resolveJsonModule: true, isolatedModules: true, noEmit: true, jsx: 'react-jsx', strict: true, noUnusedLocals: false, noUnusedParameters: false, noFallthroughCasesInSwitch: true, baseUrl: '.', paths: { '@/*': ['./src/*'] } }, include: ['src'] }, null, 2)
}

export function templateViteConfig(): string {
  // NOTE: No proxy config. In preview mode, the app is served through CoderXP's
  // own reverse proxy at /api/preview/{id}/app/. A Vite proxy to localhost:3001
  // would intercept ALL /api/* requests (including the preview URL itself) and
  // forward them to a non-existent backend, causing EADDRNOTAVAIL / 503 errors.
  // The server/ folder is scaffolding for standalone deployment, not preview.
  return `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nimport path from 'path'\nexport default defineConfig({\n  plugins: [react()],\n  resolve: { alias: { '@': path.resolve(__dirname, './src') } },\n  server: { port: 5173 },\n  build: { outDir: 'dist', sourcemap: false, rollupOptions: { output: { manualChunks: { vendor: ['react', 'react-dom', 'react-router-dom'] } } } },\n})\n`
}

export function templateIndexHtml(project: CodeGenProject): string {
  return `<!DOCTYPE html>\n<html lang="en" class="dark">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <meta name="description" content="${project.summary}" />\n    <title>${project.projectName}</title>\n    <link rel="preconnect" href="https://fonts.googleapis.com" />\n    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />\n    <style>html,body{background-color:#09090b;margin:0}</style>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n`
}

export function templateMainTsx(): string {
  return `import React from 'react'\nimport ReactDOM from 'react-dom/client'\nimport App from './App'\nimport './index.css'\nReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)\n`
}

export function templateApiClient(): string {
  return `import axios from 'axios'\nconst api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '', headers: { 'Content-Type': 'application/json' }, timeout: 30_000, withCredentials: true })\napi.interceptors.request.use((config) => { const token = localStorage.getItem('token'); if (token) config.headers.Authorization = \`Bearer \${token}\`; return config })\napi.interceptors.response.use((res) => res, (err) => { if (err.response?.status === 401) { localStorage.removeItem('token'); if (!window.location.pathname.startsWith('/login')) window.location.href = '/login' }; return Promise.reject(err) })\nexport default api\n`
}

export function templateAuthMiddleware(): string {
  return `import { Request, Response, NextFunction } from 'express'\nimport jwt from 'jsonwebtoken'\nexport interface AuthRequest extends Request { userId?: string; userEmail?: string }\nconst JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production'\nexport function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {\n  try {\n    const authHeader = req.headers.authorization\n    if (!authHeader?.startsWith('Bearer ')) { res.status(401).json({ error: 'Missing or invalid authorization header' }); return }\n    const token = authHeader.slice(7)\n    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; email: string }\n    req.userId = payload.userId; req.userEmail = payload.email; next()\n  } catch { res.status(401).json({ error: 'Invalid or expired token' }) }\n}\nexport function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction): void {\n  try { const h = req.headers.authorization; if (h?.startsWith('Bearer ')) { const p = jwt.verify(h.slice(7), JWT_SECRET) as { userId: string; email: string }; req.userId = p.userId; req.userEmail = p.email } } catch {}\n  next()\n}\n`
}

export function templateEnvExample(project: CodeGenProject): string {
  const hasDB = (project.techStack.database?.length ?? 0) > 0
  const hasStripe = project.integrations.some(i => /stripe/i.test(i))
  const hasSupabase = project.integrations.some(i => /supabase/i.test(i))
  const lines = ['# Application', 'NODE_ENV=development', 'PORT=3001', 'CLIENT_URL=http://localhost:5173', '', '# Auth', 'JWT_SECRET=change-me-in-production-use-openssl-rand-hex-32', '']
  if (hasDB) lines.push('# Database', 'DATABASE_URL=postgresql://postgres:password@localhost:5432/mydb', '')
  if (hasStripe) lines.push('# Stripe', 'STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE', 'STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE', 'STRIPE_PRICE_ID=price_YOUR_PRICE_ID_HERE', '')
  if (hasSupabase) lines.push('# Supabase', 'SUPABASE_URL=https://YOUR_PROJECT.supabase.co', 'SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY_HERE', '')
  lines.push('# Frontend (Vite)', 'VITE_API_URL=http://localhost:3001')
  if (hasSupabase) lines.push('VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co', 'VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY_HERE')
  return lines.join('\n')
}

// ─── server/lib/prisma.ts ─────────────────────────────────────
// Singleton Prisma client — imported by server/routes/auth.ts and server/routes/api.ts.
// Generated whenever the project has a database OR auth (auth routes always import prisma).

export function templatePrismaClient(): string {
  return `import { PrismaClient } from '@prisma/client'

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

// Singleton pattern: reuse the same PrismaClient instance across hot-reloads in dev.
// In production a new instance is created once and reused for the process lifetime.
export const prisma: PrismaClient =
  globalThis.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma
}
`
}

// ─── src/lib/supabase.ts ──────────────────────────────────────
// Supabase browser client singleton — used by auth pages and any component
// that needs to read/write Supabase data directly from the frontend.

export function templateSupabaseClient(): string {
  return `import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set. ' +
    'Add them to your .env.local file.'
  )
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})

// ─── Auth helpers ─────────────────────────────────────────────

export async function signUp(email: string, password: string, metadata?: Record<string, unknown>) {
  return supabase.auth.signUp({ email, password, options: { data: metadata } })
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signOut() {
  return supabase.auth.signOut()
}

export async function getSession() {
  return supabase.auth.getSession()
}

export async function getUser() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
}
`
}

// ─── server/routes/stripe.ts ──────────────────────────────────
// Real Stripe integration: checkout session creation + webhook handler.
// Requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in server env.

export function templateStripeRoutes(): string {
  return `import { Router, Request, Response } from 'express'
import Stripe from 'stripe'
import { prisma } from '../lib/prisma'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2024-06-20',
})

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? ''
const PRICE_ID = process.env.STRIPE_PRICE_ID ?? ''
const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:5173'

// ─── POST /api/stripe/checkout ────────────────────────────────
// Creates a Stripe Checkout Session for the authenticated user.
// Returns { url } — frontend redirects to this URL.

router.post('/checkout', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!

    // Look up or create Stripe customer
    let stripeCustomerId: string | undefined
    try {
      const sub = await prisma.subscription.findUnique({ where: { userId } })
      stripeCustomerId = sub?.stripeCustomerId ?? undefined
    } catch {
      // subscription table may not exist yet — continue without it
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: stripeCustomerId,
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      success_url: \`\${CLIENT_URL}/dashboard?checkout=success\`,
      cancel_url: \`\${CLIENT_URL}/pricing?checkout=cancelled\`,
      metadata: { userId },
    })

    res.json({ url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create checkout session'
    res.status(500).json({ error: message })
  }
})

// ─── POST /api/stripe/portal ──────────────────────────────────
// Creates a Stripe Customer Portal session for subscription management.

router.post('/portal', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!

    let stripeCustomerId: string | undefined
    try {
      const sub = await prisma.subscription.findUnique({ where: { userId } })
      stripeCustomerId = sub?.stripeCustomerId ?? undefined
    } catch {
      // subscription table may not exist yet
    }

    if (!stripeCustomerId) {
      res.status(400).json({ error: 'No active subscription found' })
      return
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: \`\${CLIENT_URL}/dashboard\`,
    })

    res.json({ url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create portal session'
    res.status(500).json({ error: message })
  }
})

// ─── POST /api/stripe/webhook ─────────────────────────────────
// Stripe webhook handler — verifies signature, processes events.
// Must be mounted BEFORE express.json() middleware (raw body required).

router.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers['stripe-signature'] as string

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook signature verification failed'
    console.error('[Stripe] Webhook error:', message)
    res.status(400).json({ error: message })
    return
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.userId
        if (!userId || !session.customer || !session.subscription) break

        await prisma.subscription.upsert({
          where: { userId },
          create: {
            userId,
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: session.subscription as string,
            status: 'active',
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
          update: {
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: session.subscription as string,
            status: 'active',
          },
        }).catch(() => {/* subscription model may not exist — non-fatal */})
        break
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const status = event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status
        await prisma.subscription.updateMany({
          where: { stripeCustomerId: sub.customer as string },
          data: {
            status,
            currentPeriodEnd: new Date((sub as any).current_period_end * 1000),
          },
        }).catch(() => {/* non-fatal */})
        break
      }

      default:
        console.log(\`[Stripe] Unhandled event type: \${event.type}\`)
    }

    res.json({ received: true })
  } catch (err) {
    console.error('[Stripe] Webhook processing error:', err)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})

export { router as stripeRouter }
`
}

// ─── src/pages/Login.tsx — Supabase variant ──────────────────
// Guaranteed to use Supabase auth + OAuth buttons.
// Used as a template (not AI) when hasSupabase is true, because the AI
// reliably ignores Supabase-specific instructions and generates JWT auth.

export function templateLoginPageSupabase(): string {
  return `import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Github, Chrome, Loader2 } from 'lucide-react'
import { signIn, supabase } from '@/lib/supabase'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<'google' | 'github' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const { error: signInError } = await signIn(email, password)
      if (signInError) throw signInError
      navigate('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to sign in')
    } finally {
      setLoading(false)
    }
  }

  const handleOAuth = async (provider: 'google' | 'github') => {
    setOauthLoading(provider)
    setError(null)
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin + '/dashboard' },
      })
      if (oauthError) throw oauthError
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'OAuth sign in failed')
      setOauthLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white">Welcome back</h1>
            <p className="text-zinc-400 mt-2 text-sm">Sign in to your account</p>
          </div>

          {/* OAuth Buttons */}
          <div className="space-y-3 mb-6">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleOAuth('google')}
              disabled={!!oauthLoading || loading}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white text-zinc-900 rounded-xl font-medium text-sm hover:bg-zinc-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {oauthLoading === 'google' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Chrome className="w-4 h-4" />
              )}
              Continue with Google
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleOAuth('github')}
              disabled={!!oauthLoading || loading}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-zinc-800 text-white border border-zinc-700 rounded-xl font-medium text-sm hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {oauthLoading === 'github' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Github className="w-4 h-4" />
              )}
              Continue with GitHub
            </motion.button>
          </div>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-zinc-900 px-3 text-zinc-500">or continue with email</span>
            </div>
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full px-4 py-3 pr-12 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading || !!oauthLoading}
              className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Signing in...' : 'Sign in'}
            </motion.button>
          </form>

          <p className="text-center text-zinc-500 text-sm mt-6">
            Don't have an account?{' '}
            <Link to="/register" className="text-violet-400 hover:text-violet-300 font-medium transition-colors">
              Sign up
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  )
}
`
}

// ─── src/pages/Register.tsx — Supabase variant ───────────────
// Guaranteed to use Supabase auth + OAuth buttons.

export function templateRegisterPageSupabase(): string {
  return `import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Github, Chrome, Loader2, CheckCircle } from 'lucide-react'
import { signUp, supabase } from '@/lib/supabase'

export default function Register() {
  const navigate = useNavigate()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<'google' | 'github' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const { error: signUpError } = await signUp(email, password, {
        first_name: firstName,
        last_name: lastName,
        full_name: \`\${firstName} \${lastName}\`.trim(),
      })
      if (signUpError) throw signUpError
      setConfirmed(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  const handleOAuth = async (provider: 'google' | 'github') => {
    setOauthLoading(provider)
    setError(null)
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin + '/dashboard' },
      })
      if (oauthError) throw oauthError
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'OAuth sign up failed')
      setOauthLoading(null)
    }
  }

  if (confirmed) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-md"
        >
          <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Check your email</h2>
          <p className="text-zinc-400 mb-6">
            We sent a confirmation link to <span className="text-white font-medium">{email}</span>.
            Click the link to activate your account.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-semibold text-sm transition-colors"
          >
            Back to sign in
          </Link>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white">Create your account</h1>
            <p className="text-zinc-400 mt-2 text-sm">Get started for free</p>
          </div>

          {/* OAuth Buttons */}
          <div className="space-y-3 mb-6">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleOAuth('google')}
              disabled={!!oauthLoading || loading}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white text-zinc-900 rounded-xl font-medium text-sm hover:bg-zinc-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {oauthLoading === 'google' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Chrome className="w-4 h-4" />
              )}
              Continue with Google
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleOAuth('github')}
              disabled={!!oauthLoading || loading}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-zinc-800 text-white border border-zinc-700 rounded-xl font-medium text-sm hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {oauthLoading === 'github' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Github className="w-4 h-4" />
              )}
              Continue with GitHub
            </motion.button>
          </div>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-zinc-900 px-3 text-zinc-500">or continue with email</span>
            </div>
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">First name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  required
                  placeholder="Jane"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Last name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  required
                  placeholder="Smith"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Min. 8 characters"
                  className="w-full px-4 py-3 pr-12 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading || !!oauthLoading}
              className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Creating account...' : 'Create account'}
            </motion.button>
          </form>

          <p className="text-center text-zinc-500 text-sm mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-violet-400 hover:text-violet-300 font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  )
}
`
}

// ─── src/pages/AuthCallback.tsx ──────────────────────────────
// Handles the Supabase OAuth redirect. Supabase redirects to /auth/callback
// after Google/GitHub OAuth. This page exchanges the code for a session
// and redirects the user to /dashboard.
// Without this page, OAuth login produces a blank/404 page.

export function templateAuthCallbackPage(): string {
  return `import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Loader2 } from 'lucide-react'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Supabase automatically handles the code exchange from the URL hash/query params.
    // We just need to wait for the session to be established, then redirect.
    const handleCallback = async () => {
      try {
        // getSession() will pick up the session from the URL fragment set by Supabase OAuth
        const { data, error: sessionError } = await supabase.auth.getSession()

        if (sessionError) {
          console.error('[AuthCallback] Session error:', sessionError.message)
          setError(sessionError.message)
          return
        }

        if (data.session) {
          // Session established — redirect to dashboard
          navigate('/dashboard', { replace: true })
        } else {
          // No session yet — listen for the auth state change
          const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) {
              subscription.unsubscribe()
              navigate('/dashboard', { replace: true })
            } else if (event === 'SIGNED_OUT' || (!session && event !== 'INITIAL_SESSION')) {
              subscription.unsubscribe()
              setError('Authentication failed. Please try again.')
            }
          })

          // Timeout fallback — if no auth event after 10s, show error
          setTimeout(() => {
            subscription.unsubscribe()
            if (!error) setError('Authentication timed out. Please try again.')
          }, 10_000)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Authentication failed'
        setError(message)
      }
    }

    void handleCallback()
  }, [navigate])

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <span className="text-red-400 text-xl">✕</span>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Authentication failed</h2>
          <p className="text-zinc-400 text-sm mb-6">{error}</p>
          <a
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-semibold text-sm transition-colors"
          >
            Back to sign in
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin mx-auto mb-4" />
        <p className="text-zinc-400 text-sm">Completing sign in...</p>
      </div>
    </div>
  )
}
`
}

// ─── server/tsconfig.json ─────────────────────────────────────
// TypeScript config for the server/ directory.
// Allows tsc to compile server code standalone and provides proper
// type checking for Node.js globals (process, Buffer, __dirname, etc.)

export function templateServerTsConfig(): string {
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      lib: ['ES2022'],
      outDir: '../dist/server',
      rootDir: '.',
      strict: true,
      skipLibCheck: true,
      esModuleInterop: true,
      resolveJsonModule: true,
      types: ['node'],
    },
    include: ['./**/*.ts'],
    exclude: ['node_modules', '../dist'],
  }, null, 2)
}

// ─── Prisma Subscription model snippet ───────────────────────
// Appended to the AI-generated schema when Stripe is detected but the AI
// forgot to include the Subscription model. Safe to append — Prisma ignores
// duplicate model names only if they're identical; this is always additive.

export function templateSubscriptionModel(): string {
  return (
    '\nmodel Subscription {\n' +
    '  id                     String    @id @default(cuid())\n' +
    '  userId                 String    @unique\n' +
    '  user                   User      @relation(fields: [userId], references: [id], onDelete: Cascade)\n' +
    '  stripeCustomerId       String?\n' +
    '  stripeSubscriptionId   String?\n' +
    '  status                 String    @default("inactive")\n' +
    '  currentPeriodEnd       DateTime?\n' +
    '  createdAt              DateTime  @default(now())\n' +
    '  updatedAt              DateTime  @updatedAt\n' +
    '\n' +
    '  @@map("subscriptions")\n' +
    '}\n'
  )
}

export function templateGitignore(): string {
  return ['node_modules/', 'dist/', 'build/', '.env', '.env.local', '.env.*.local', '*.log', '.vscode/', '.DS_Store', '*.tsbuildinfo', 'prisma/migrations/', 'coverage/'].join('\n')
}

export function templatePostcssConfig(): string {
  return `export default { plugins: { tailwindcss: {}, autoprefixer: {} } }\n`
}

export function templateReadme(project: CodeGenProject): string {
  const hasDB = (project.techStack.database?.length ?? 0) > 0
  const lines = [`# ${project.projectName}`, '', project.summary, '', '## Features', '', ...project.features.map(f => `- ${f}`), '', '## Tech Stack', '', '- **Frontend**: React 18, TypeScript, Tailwind CSS, Vite', '- **Backend**: Node.js, Express, TypeScript']
  if (hasDB) lines.push('- **Database**: PostgreSQL, Prisma ORM')
  lines.push('', '## Getting Started', '', '```bash', 'npm install', 'cp .env.example .env', 'npm run dev', '```', '', '## License', '', 'MIT')
  return lines.join('\n')
}

export function templateTailwindConfig(projectType: ProjectType): string {
  return getPremiumTailwindConfig(projectType)
}

export function templateIndexCss(projectType: ProjectType): string {
  return getPremiumIndexCss(projectType)
}
