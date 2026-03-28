import type { CodeGenProject, DynamicPage } from './codeGeneratorTypes'
import type { ProjectType } from './designSystem'

// ─── Fallback generators (used when AI call fails) ────────────
// Rules: NO nested template literals. Use string arrays + join.

export function fallbackAppTsx(
  project: CodeGenProject,
  hasAuth: boolean,
  hasDashboard: boolean,
  dynamicPages: DynamicPage[] = [],
  hasSupabase: boolean = false,
): string {
  const routes: string[] = []
  routes.push("      <Route path='/' element={<HomePage />} />")
  if (hasAuth) {
    routes.push("      <Route path='/login' element={<LoginPage />} />")
    routes.push("      <Route path='/register' element={<RegisterPage />} />")
  }
  // Supabase OAuth redirects to /auth/callback — must have a route or user lands on 404
  if (hasSupabase) {
    routes.push("      <Route path='/auth/callback' element={<AuthCallbackPage />} />")
  }
  if (hasDashboard) {
    routes.push("      <Route path='/dashboard' element={<Dashboard />} />")
  }
  for (const dp of dynamicPages) {
    routes.push("      <Route path='" + dp.routePath + "' element={<" + dp.name + "Page />} />")
  }

  const imports: string[] = [
    "import React from 'react'",
    "import { BrowserRouter, Routes, Route } from 'react-router-dom'",
    // Header is always included — fallback builds previously had no navigation
    "import Header from './components/Header'",
    "import HomePage from './pages/Home'",
  ]
  if (hasAuth) {
    imports.push("import LoginPage from './pages/Login'")
    imports.push("import RegisterPage from './pages/Register'")
  }
  if (hasSupabase) {
    imports.push("import AuthCallbackPage from './pages/AuthCallback'")
  }
  if (hasDashboard) {
    imports.push("import Dashboard from './pages/Dashboard'")
  }
  for (const dp of dynamicPages) {
    // Strip src/ prefix and .tsx extension — TS imports never include the extension
    const importPath = dp.relativePath.replace('src/', '').replace(/\.tsx$/, '')
    imports.push("import " + dp.name + "Page from './" + importPath + "'")
  }

  const lines: string[] = [
    ...imports,
    '',
    'export default function App() {',
    '  return (',
    '    <BrowserRouter>',
    '      <Header />',
    '      <Routes>',
    ...routes,
    "        <Route path='*' element={<HomePage />} />",
    '      </Routes>',
    '    </BrowserRouter>',
    '  )',
    '}',
  ]
  return lines.join('\n')
}

export function fallbackGenericPage(project: CodeGenProject, page: DynamicPage): string {
  const lines: string[] = [
    "import React from 'react'",
    '',
    'export default function ' + page.name + 'Page() {',
    '  return (',
    "    <div className='min-h-screen bg-zinc-950 p-8'>",
    "      <div className='max-w-7xl mx-auto'>",
    "        <div className='mb-8'>",
    "          <h1 className='text-3xl font-bold text-white'>" + page.name + '</h1>',
    "          <p className='text-zinc-400 mt-1'>" + project.projectName + ' — ' + page.scopeItem + '</p>',
    '        </div>',
    "        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>",
    "          <div className='card'>",
    "            <h2 className='text-lg font-semibold text-white mb-3'>" + page.name + ' Overview</h2>',
    "            <p className='text-zinc-400 text-sm leading-relaxed'>",
    '              Explore everything ' + project.projectName + ' has to offer in the ' + page.name.toLowerCase() + ' section.',
    '            </p>',
    '          </div>',
    "          <div className='card'>",
    "            <h2 className='text-lg font-semibold text-white mb-3'>Get Started</h2>",
    "            <p className='text-zinc-400 text-sm leading-relaxed'>",
    '              Ready to dive in? This section is fully integrated with ' + project.projectName + '.',
    '            </p>',
    "            <a href='/register' className='btn-primary mt-4 inline-block'>",
    '              Get Started',
    '            </a>',
    '          </div>',
    '        </div>',
    '      </div>',
    '    </div>',
    '  )',
    '}',
  ]
  return lines.join('\n')
}

export function fallbackHeader(project: CodeGenProject, hasAuth: boolean, _pt: ProjectType): string {
  const navLinks = hasAuth
    ? "            <a href='/login' className='text-zinc-400 hover:text-white text-sm transition-colors'>Sign In</a>\n            <a href='/register' className='btn-primary text-sm'>Get Started</a>"
    : "            <a href='#features' className='text-zinc-400 hover:text-white text-sm transition-colors'>Features</a>"

  const lines: string[] = [
    "import React from 'react'",
    '',
    'export default function Header() {',
    '  return (',
    "    <header className='sticky top-0 z-50 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800/50'>",
    "      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>",
    "        <div className='flex items-center justify-between h-16'>",
    "          <a href='/' className='text-xl font-bold text-white'>",
    '            ' + project.projectName,
    '          </a>',
    "          <nav className='flex items-center gap-4'>",
    navLinks,
    '          </nav>',
    '        </div>',
    '      </div>',
    '    </header>',
    '  )',
    '}',
  ]
  return lines.join('\n')
}

export function fallbackHomePage(project: CodeGenProject, _pt: ProjectType): string {
  const featureItems = project.features.slice(0, 6).map(f =>
    "        <div className='card'><h3 className='text-white font-semibold mb-2'>" + f + "</h3><p className='text-zinc-400 text-sm'>Powerful feature built for modern teams.</p></div>"
  )

  const lines: string[] = [
    "import React from 'react'",
    '',
    'export default function HomePage() {',
    '  return (',
    "    <main className='min-h-screen bg-zinc-950'>",
    "      <section className='hero-bg py-32 px-4 text-center'>",
    "        <div className='max-w-4xl mx-auto'>",
    "          <h1 className='text-5xl md:text-7xl font-bold mb-6 gradient-text'>",
    '            ' + project.projectName,
    '          </h1>',
    "          <p className='text-xl text-zinc-400 mb-10 max-w-2xl mx-auto'>",
    '            ' + project.summary,
    '          </p>',
    "          <div className='flex gap-4 justify-center'>",
    "            <a href='/register' className='btn-primary'>Get Started Free</a>",
    "            <a href='#features' className='btn-secondary'>Learn More</a>",
    '          </div>',
    '        </div>',
    '      </section>',
    "      <section id='features' className='py-24 px-4'>",
    "        <div className='max-w-7xl mx-auto'>",
    "          <h2 className='text-3xl font-bold text-white text-center mb-12'>Everything you need</h2>",
    "          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>",
    ...featureItems,
    '          </div>',
    '        </div>',
    '      </section>',
    '    </main>',
    '  )',
    '}',
  ]
  return lines.join('\n')
}

export function fallbackLoginPage(project: CodeGenProject): string {
  const lines: string[] = [
    "import React, { useState } from 'react'",
    "import api from '../lib/api'",
    '',
    'export default function LoginPage() {',
    "  const [email, setEmail] = useState('')",
    "  const [password, setPassword] = useState('')",
    "  const [error, setError] = useState('')",
    '  const [loading, setLoading] = useState(false)',
    '',
    '  async function handleSubmit(e: React.FormEvent) {',
    '    e.preventDefault()',
    "    setError('')",
    '    setLoading(true)',
    '    try {',
    "      const res = await api.post('/api/auth/login', { email, password })",
    "      localStorage.setItem('token', res.data.token)",
    "      window.location.href = '/dashboard'",
    '    } catch (err: any) {',
    "      setError(err.response?.data?.error ?? 'Login failed')",
    '    } finally {',
    '      setLoading(false)',
    '    }',
    '  }',
    '',
    '  return (',
    "    <div className='min-h-screen bg-zinc-950 flex items-center justify-center px-4'>",
    "      <div className='w-full max-w-md'>",
    "        <div className='card'>",
    "          <h1 className='text-2xl font-bold text-white mb-2'>Welcome back</h1>",
    "          <p className='text-zinc-400 mb-8'>Sign in to " + project.projectName + "</p>",
    "          <form onSubmit={handleSubmit} className='space-y-4'>",
    "            <div><label className='text-sm font-medium text-zinc-300 block mb-1.5'>Email</label>",
    "              <input type='email' value={email} onChange={e => setEmail(e.target.value)} className='input-field' placeholder='you@example.com' required /></div>",
    "            <div><label className='text-sm font-medium text-zinc-300 block mb-1.5'>Password</label>",
    "              <input type='password' value={password} onChange={e => setPassword(e.target.value)} className='input-field' placeholder='••••••••' required /></div>",
    "            {error && <p className='text-red-400 text-sm'>{error}</p>}",
    "            <button type='submit' disabled={loading} className='btn-primary w-full'>",
    "              {loading ? 'Signing in...' : 'Sign In'}",
    '            </button>',
    '          </form>',
    "          <p className='text-zinc-500 text-sm text-center mt-6'>",
    "            Don't have an account? <a href='/register' className='text-violet-400 hover:text-violet-300'>Sign up</a>",
    '          </p>',
    '        </div>',
    '      </div>',
    '    </div>',
    '  )',
    '}',
  ]
  return lines.join('\n')
}

export function fallbackRegisterPage(project: CodeGenProject): string {
  const lines: string[] = [
    "import React, { useState } from 'react'",
    "import api from '../lib/api'",
    '',
    'export default function RegisterPage() {',
    "  const [name, setName] = useState('')",
    "  const [email, setEmail] = useState('')",
    "  const [password, setPassword] = useState('')",
    "  const [error, setError] = useState('')",
    '  const [loading, setLoading] = useState(false)',
    '',
    '  async function handleSubmit(e: React.FormEvent) {',
    '    e.preventDefault()',
    "    setError('')",
    '    setLoading(true)',
    '    try {',
    "      const res = await api.post('/api/auth/register', { name, email, password })",
    "      localStorage.setItem('token', res.data.token)",
    "      window.location.href = '/dashboard'",
    '    } catch (err: any) {',
    "      setError(err.response?.data?.error ?? 'Registration failed')",
    '    } finally {',
    '      setLoading(false)',
    '    }',
    '  }',
    '',
    '  return (',
    "    <div className='min-h-screen bg-zinc-950 flex items-center justify-center px-4'>",
    "      <div className='w-full max-w-md'>",
    "        <div className='card'>",
    "          <h1 className='text-2xl font-bold text-white mb-2'>Create your account</h1>",
    "          <p className='text-zinc-400 mb-8'>Join " + project.projectName + " today</p>",
    "          <form onSubmit={handleSubmit} className='space-y-4'>",
    "            <div><label className='text-sm font-medium text-zinc-300 block mb-1.5'>Name</label>",
    "              <input type='text' value={name} onChange={e => setName(e.target.value)} className='input-field' placeholder='Your name' required /></div>",
    "            <div><label className='text-sm font-medium text-zinc-300 block mb-1.5'>Email</label>",
    "              <input type='email' value={email} onChange={e => setEmail(e.target.value)} className='input-field' placeholder='you@example.com' required /></div>",
    "            <div><label className='text-sm font-medium text-zinc-300 block mb-1.5'>Password</label>",
    "              <input type='password' value={password} onChange={e => setPassword(e.target.value)} className='input-field' placeholder='Min 8 characters' required minLength={8} /></div>",
    "            {error && <p className='text-red-400 text-sm'>{error}</p>}",
    "            <button type='submit' disabled={loading} className='btn-primary w-full'>",
    "              {loading ? 'Creating account...' : 'Create Account'}",
    '            </button>',
    '          </form>',
    "          <p className='text-zinc-500 text-sm text-center mt-6'>",
    "            Already have an account? <a href='/login' className='text-violet-400 hover:text-violet-300'>Sign in</a>",
    '          </p>',
    '        </div>',
    '      </div>',
    '    </div>',
    '  )',
    '}',
  ]
  return lines.join('\n')
}

export function fallbackDashboard(project: CodeGenProject): string {
  const lines: string[] = [
    "import React from 'react'",
    '',
    'export default function Dashboard() {',
    '  return (',
    "    <div className='min-h-screen bg-zinc-950 p-8'>",
    "      <div className='max-w-7xl mx-auto'>",
    "        <div className='mb-8'>",
    "          <h1 className='text-3xl font-bold text-white'>Dashboard</h1>",
    "          <p className='text-zinc-400 mt-1'>Welcome to " + project.projectName + "</p>",
    '        </div>',
    "        <div className='grid grid-cols-1 md:grid-cols-3 gap-6 mb-8'>",
    "          {[{label:'Total Users',value:'1,234'},{label:'Active Sessions',value:'56'},{label:'Revenue',value:'$12,400'}].map(m => (",
    "            <div key={m.label} className='card'>",
    "              <p className='text-zinc-400 text-sm mb-1'>{m.label}</p>",
    "              <p className='text-3xl font-bold text-white'>{m.value}</p>",
    '            </div>',
    '          ))}',
    '        </div>',
    "        <div className='card'>",
    "          <h2 className='text-lg font-semibold text-white mb-4'>Recent Activity</h2>",
    "          <p className='text-zinc-500 text-sm'>No recent activity yet.</p>",
    '        </div>',
    '      </div>',
    '    </div>',
    '  )',
    '}',
  ]
  return lines.join('\n')
}

export function fallbackServerIndex(project: CodeGenProject): string {
  // Derive flags from project plan — same logic as codeGenerator.ts buildFileSpecs()
  const hasAuth = project.features.some(f => /auth|login|register|user/i.test(f))
  const hasStripe = project.integrations.some(i => /stripe/i.test(i))

  const lines: string[] = [
    "import express from 'express'",
    "import cors from 'cors'",
    "import helmet from 'helmet'",
    "import morgan from 'morgan'",
    "import dotenv from 'dotenv'",
    // Always mount the API router
    "import apiRouter from './routes/api'",
  ]
  if (hasAuth) lines.push("import authRouter from './routes/auth'")
  if (hasStripe) lines.push("import { stripeRouter } from './routes/stripe'")

  lines.push(
    '',
    'dotenv.config()',
    '',
    'const app = express()',
    'const PORT = process.env.PORT ?? 3001',
    'const CLIENT_URL = process.env.CLIENT_URL ?? "http://localhost:5173"',
    '',
    'app.use(helmet())',
    'app.use(cors({ origin: CLIENT_URL, credentials: true }))',
    'app.use(morgan("dev"))',
  )

  // Stripe webhook MUST be mounted before express.json() — it needs the raw body buffer
  if (hasStripe) {
    lines.push(
      "// Stripe webhook needs raw body — mount before JSON body parser",
      "app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeRouter)",
    )
  }

  lines.push('app.use(express.json())', '')

  if (hasAuth) lines.push("app.use('/api/auth', authRouter)")
  lines.push("app.use('/api', apiRouter)")
  if (hasStripe) lines.push("app.use('/api/stripe', stripeRouter)")

  lines.push(
    '',
    "app.get('/api/health', (_req, res) => {",
    "  res.json({ status: 'ok', service: '" + project.projectName + "', timestamp: new Date().toISOString() })",
    '})',
    '',
    "app.listen(PORT, () => {",
    "  console.log('[server] " + project.projectName + " running on port ' + PORT)",
    '})',
  )
  return lines.join('\n')
}

export function fallbackAuthRoutes(): string {
  const lines: string[] = [
    "import { Router } from 'express'",
    "import bcrypt from 'bcryptjs'",
    "import jwt from 'jsonwebtoken'",
    // Import singleton — never create new PrismaClient() directly (connection pool exhaustion)
    "import { prisma } from '../lib/prisma'",
    '',
    'const router = Router()',
    'const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret"',
    '',
    "router.post('/register', async (req, res) => {",
    '  try {',
    '    const { name, email, password } = req.body',
    "    if (!email || !password) { res.status(400).json({ error: 'Email and password required' }); return }",
    "    const existing = await prisma.user.findUnique({ where: { email } })",
    "    if (existing) { res.status(409).json({ error: 'Email already registered' }); return }",
    '    const hash = await bcrypt.hash(password, 12)',
    '    const user = await prisma.user.create({ data: { name: name ?? email.split("@")[0], email, password: hash } })',
    '    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" })',
    '    res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email } })',
    '  } catch (err) {',
    '    console.error("[auth] register error:", err)',
    "    res.status(500).json({ error: 'Registration failed' })",
    '  }',
    '})',
    '',
    "router.post('/login', async (req, res) => {",
    '  try {',
    '    const { email, password } = req.body',
    "    if (!email || !password) { res.status(400).json({ error: 'Email and password required' }); return }",
    '    const user = await prisma.user.findUnique({ where: { email } })',
    "    if (!user) { res.status(401).json({ error: 'Invalid credentials' }); return }",
    '    const valid = await bcrypt.compare(password, user.password)',
    "    if (!valid) { res.status(401).json({ error: 'Invalid credentials' }); return }",
    '    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" })',
    '    res.json({ token, user: { id: user.id, name: user.name, email: user.email } })',
    '  } catch (err) {',
    '    console.error("[auth] login error:", err)',
    "    res.status(500).json({ error: 'Login failed' })",
    '  }',
    '})',
    '',
    'export default router',
  ]
  return lines.join('\n')
}

export function fallbackApiRoutes(project: CodeGenProject): string {
  const resource = project.projectName.toLowerCase().replace(/\s+/g, '-')
  const lines: string[] = [
    "import { Router } from 'express'",
    // Import singleton — never create new PrismaClient() directly (connection pool exhaustion)
    "import { prisma } from '../lib/prisma'",
    '',
    'const router = Router()',
    '',
    "router.get('/', async (_req, res) => {",
    '  try {',
    "    res.json({ message: 'API is running', service: '" + resource + "' })",
    '  } catch (err) {',
    "    res.status(500).json({ error: 'Internal server error' })",
    '  }',
    '})',
    '',
    'export default router',
  ]
  return lines.join('\n')
}

export function fallbackPrismaSchema(project: CodeGenProject): string {
  const hasAuth = project.features.some(f => /auth|login|register|user/i.test(f))
  const lines: string[] = [
    'generator client {',
    '  provider = "prisma-client-js"',
    '}',
    '',
    'datasource db {',
    '  provider = "postgresql"',
    '  url      = env("DATABASE_URL")',
    '}',
    '',
  ]
  if (hasAuth) {
    lines.push(
      'model User {',
      '  id        String   @id @default(cuid())',
      '  name      String',
      '  email     String   @unique',
      '  password  String',
      '  createdAt DateTime @default(now())',
      '  updatedAt DateTime @updatedAt',
      '}',
      '',
    )
  }
  lines.push(
    'model Item {',
    '  id        String   @id @default(cuid())',
    '  title     String',
    '  content   String?',
    '  createdAt DateTime @default(now())',
    '  updatedAt DateTime @updatedAt',
    '}',
  )
  return lines.join('\n')
}
