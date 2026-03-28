

import type { CodeGenProject, DynamicPage } from './codeGeneratorTypes'
import { getDesignSystemPrompt, type ProjectType } from './designSystem'

// ─── Motion rules — injected into premium project types ───────
// Framer Motion is included in every generated project's package.json.
// These rules ensure every section has entrance animations and hover states.
const MOTION_RULES = `
MOTION & ANIMATION RULES (mandatory for this project type):
• Import: import { motion } from 'framer-motion'
• Every major section: wrap in <motion.section initial={{ opacity:0, y:30 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true }} transition={{ duration:0.6, ease:'easeOut' }}>
• Stagger children: use variants={{ container: { transition: { staggerChildren: 0.1 } }, item: { hidden:{opacity:0,y:20}, show:{opacity:1,y:0} } }}
• Cards on hover: whileHover={{ y:-4, scale:1.02 }} transition={{ duration:0.2 }}
• Buttons on hover: whileHover={{ scale:1.04 }} whileTap={{ scale:0.97 }}
• Hero elements: stagger with delays (0.1s, 0.2s, 0.3s) using transition={{ delay: N }}
• Respect prefers-reduced-motion: wrap animations in useReducedMotion() check where possible
• Do NOT use motion on every single element — use it purposefully on sections, cards, and hero elements`

function buildProjectContext(project: CodeGenProject): string {
  const stackStr = Object.entries(project.techStack)
    .map(([k, v]) => {
      // techStack values may arrive as string[] OR as a plain string from the planner
      const val = Array.isArray(v)
        ? v.join(', ')
        : (v != null ? String(v) : '')
      return `${k}: ${val}`
    })
    .join(' | ')

  const lines = [
    `Project: "${project.projectName}"`,
    `Summary: ${project.summary}`,
    `Features: ${project.features.join(', ')}`,
    `Frontend scope: ${project.frontendScope.join(', ')}`,
    `Backend scope: ${project.backendScope.join(', ')}`,
    `Tech stack: ${stackStr}`,
    `Integrations: ${project.integrations.length > 0 ? project.integrations.join(', ') : 'none'}`,
  ]

  // Inject memory context when available — informs AI of prior decisions,
  // confirmed stack choices, and user preferences from previous builds.
  if (project.memoryContext) {
    lines.push('')
    lines.push(project.memoryContext)
    lines.push('(Use the above memory context to stay consistent with prior decisions. Do not contradict confirmed stack or approved direction.)')
  }

  // Inject rules block when available — user-defined and project-defined rules
  // that MUST be followed in every generated file (e.g. "use Tailwind only",
  // "TypeScript strict mode", "no inline styles", "always use named exports").
  if (project.rulesBlock) {
    lines.push('')
    lines.push(project.rulesBlock)
    lines.push('(The above rules are mandatory. Apply them to every file you generate. Do not deviate from them.)')
  }

  // Inject repo snapshot context when available — describes what already exists
  // in the workspace so the AI does not duplicate components, routes, or endpoints.
  // Only present on repair/continuation builds where a prior snapshot was stored.
  if (project.repoContext) {
    lines.push('')
    lines.push(project.repoContext)
  }

  // Inject product intelligence context when available — branding direction,
  // user flows, page hierarchy, marketing copy, analytics blueprint.
  // Informs the AI about product-level decisions for cohesive, branded output.
  if (project.productIntelligenceContext) {
    lines.push('')
    lines.push(project.productIntelligenceContext)
  }

  // Inject database intelligence context when available — schema design,
  // relations, indexes, query patterns, RLS policies.
  // Informs backend/API generation for database-aware code.
  if (project.databaseContext) {
    lines.push('')
    lines.push(project.databaseContext)
  }

  return lines.join('\n')
}

export function promptHomePage(project: CodeGenProject, projectType: ProjectType, errorContext?: string): string {
  const design = getDesignSystemPrompt(projectType)
  const ctx = buildProjectContext(project)
  const featureList = project.features.slice(0, 6).join(', ')

  if (projectType === 'product') {
    return `${ctx}

Generate a complete React product showcase page (src/pages/Home.tsx) for "${project.projectName}".
This must feel like an Apple product page or Vercel launch page — premium, cinematic, 3D-feel.

REQUIRED SECTIONS (each min-h-screen, full-viewport pacing):

1. STICKY NAV: logo "${project.projectName}" (gradient text), minimal links (Features, Specs), "Get Started" CTA button. bg-black/80 backdrop-blur-xl border-b border-white/5 sticky top-0 z-50.

2. HERO SECTION: mesh-bg class on wrapper. Massive product name text-6xl md:text-8xl font-black tracking-tighter text-white. Gradient subtitle. Below headline: a 3D-feel product card/mockup using:
   <div style={{ perspective: '1200px' }}>
     <div style={{ transform: 'perspective(1200px) rotateY(-12deg) rotateX(4deg)', transformStyle: 'preserve-3d' }} className="depth-shadow rounded-2xl bg-zinc-900 border border-white/10 p-8">
       [product visual content here — relevant to ${project.projectName}]
     </div>
   </div>
   Add 3 depth-layer orbs behind it (absolute, blur-3xl, violet/blue/indigo, opacity-15–20).
   Two CTAs: primary with btn-glow class, secondary ghost.
   Animate hero elements with Framer Motion stagger (delays 0.1, 0.2, 0.3, 0.4).

3. FEATURE CALLOUT SECTIONS (3 sections, alternating layout):
   Each section: min-h-screen flex items-center. Large decorative number (text-8xl font-black text-white/5) in background.
   Odd: product visual/mockup LEFT (perspective-card class), feature text RIGHT.
   Even: feature text LEFT, product visual/mockup RIGHT.
   Feature text: large heading (text-4xl font-bold), 2-sentence description, bullet list of 3 benefits.
   Use features: ${featureList}.

4. SPECS SECTION: "Technical excellence" heading. 3-col grid of spec cards: label (text-zinc-500 text-sm uppercase tracking-wider) + value (text-white text-2xl font-bold). Use realistic specs relevant to ${project.projectName}.

5. CTA SECTION: Full-width section with mesh-bg. Bold headline. Large primary button with btn-glow. Subtext.

6. FOOTER: Logo, 3 link columns, copyright.

${MOTION_RULES}

${design}

Tech: React 18 + TypeScript + Tailwind CSS + Framer Motion + react-router-dom.
No external icon libraries — use inline SVG.
Export: export default function Home()
Return ONLY the TypeScript/TSX code.`
  }

  if (projectType === 'landing') {
    return `${ctx}

Generate a complete React landing page (src/pages/Home.tsx) for "${project.projectName}".

REQUIRED — all 7 sections must be fully implemented:

1. STICKY NAVIGATION: logo "${project.projectName}", nav links (Features, Pricing, Testimonials), "Get Started" button → /register. bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800/50 sticky top-0 z-50.

2. HERO SECTION: min-h-screen flex items-center. Large gradient headline (text-5xl md:text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-purple-400 to-blue-400). Subheadline text-xl text-zinc-400. Two CTAs: "Start Building Free" (primary) → /register, "See How It Works" (secondary) → #features. Decorative gradient orbs (absolute, blur-3xl, opacity-20). Animate with Framer Motion: badge → headline → subheadline → CTAs, each with 0.1s delay stagger.

3. FEATURES SECTION: id="features". "Everything you need" heading. 6 feature cards in grid-cols-1 md:grid-cols-2 lg:grid-cols-3. Each card: glass-card style, gradient icon bg, title, 2-line description. Use features: ${featureList}. Cards animate in with whileInView stagger.

4. PRICING SECTION: id="pricing". "Simple, transparent pricing" heading. 3 tiers: Free ($0/mo), Pro ($29/mo, highlighted with ring-2 ring-violet-500 + "Most Popular" badge), Enterprise (custom). Each tier: feature list with checkmarks, CTA button. Animate tiers in with whileInView stagger.

5. TESTIMONIALS SECTION: "Loved by builders worldwide" heading. 3 testimonial cards: avatar (gradient bg with initials), name, role, company, 2-sentence quote relevant to ${project.projectName}. Animate with whileInView.

6. CTA SECTION: Bold headline "Ready to build something great?", subtext, email input + "Get Early Access" button. bg-gradient-to-r from-violet-900/30 to-blue-900/30 border border-violet-800/30 rounded-2xl. Animate with whileInView.

7. FOOTER: Logo + tagline, 4 columns (Product, Company, Resources, Legal) with 3-4 links each, copyright "© 2025 ${project.projectName}. All rights reserved."

${MOTION_RULES}

${design}

Tech: React 18 + TypeScript + Tailwind CSS + Framer Motion + react-router-dom (Link, useNavigate).
No external icon libraries — use inline SVG or Unicode symbols.
Export: export default function Home()
Return ONLY the TypeScript/TSX code.`
  }

  if (projectType === 'portfolio') {
    return `${ctx}

Generate a complete React portfolio page (src/pages/Home.tsx) for "${project.projectName}".

REQUIRED SECTIONS:

1. NAV: name/logo, anchor links (Work, About, Contact), minimal style.

2. HERO: Full name large (text-5xl md:text-7xl font-bold), role/title in gradient text, short bio (2 sentences), social links (GitHub, LinkedIn, Twitter) as icon buttons. Animate with Framer Motion stagger.

3. WORK SECTION: id="work". "Selected Work" heading. 3 project cards in grid-cols-1 md:grid-cols-2 lg:grid-cols-3. Each card: bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden, project name, tech stack badges, 1-line description, hover overlay with "View Project" link. Use features as project names: ${featureList}.

4. ABOUT SECTION: id="about". Two-column layout: gradient avatar placeholder LEFT, bio + skills RIGHT. Skills as tag badges (bg-zinc-800 text-zinc-300 rounded-full px-3 py-1 text-sm). Animate with whileInView.

5. CONTACT SECTION: id="contact". "Let's work together" heading. Email link as large styled button. Social links.

6. FOOTER: Name, copyright, social links.

${MOTION_RULES}

${design}

Tech: React 18 + TypeScript + Tailwind CSS + Framer Motion + react-router-dom.
Export: export default function Home()
Return ONLY the TypeScript/TSX code.`
  }

  return `${ctx}

Generate a complete React home page (src/pages/Home.tsx) for "${project.projectName}".

Include:
1. Hero section: headline, subheadline, 2 CTA buttons (Get Started → /register, Sign In → /login). Animate with Framer Motion: initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}.
2. Features section: 6 feature cards with icons, titles, descriptions based on: ${featureList}. Cards animate in with whileInView stagger.
3. How it works: 3-step process with numbered steps and connecting line.
4. CTA section: "Start building today" with email capture. Animate with whileInView.
5. Footer: logo, links, copyright.

${MOTION_RULES}

${design}

Tech: React 18 + TypeScript + Tailwind CSS + Framer Motion + react-router-dom.
Export: export default function Home()
Return ONLY the TypeScript/TSX code.`
}

export function promptAppTsx(
  project: CodeGenProject,
  projectType: ProjectType,
  dynamicPages: DynamicPage[] = [],
  hasSupabase: boolean = false,
  errorContext?: string
): string {
  const hasAuth = project.features.some(f => /auth|login|register|user/i.test(f))
  const hasDashboard = project.features.some(f => /dashboard|admin|panel/i.test(f))
  const design = getDesignSystemPrompt(projectType)
  const routes = ['/ → Home']
  if (hasAuth) routes.push('/login → Login', '/register → Register')
  // Supabase OAuth redirects to /auth/callback — must be a real route or user gets 404
  if (hasSupabase) routes.push('/auth/callback → AuthCallback')
  if (hasDashboard) routes.push('/dashboard → Dashboard')
  for (const dp of dynamicPages) {
    routes.push(`${dp.routePath} → ${dp.name}`)
  }

  const dynamicImports = dynamicPages.length > 0
    ? '\n- Dynamic page imports: ' + dynamicPages.map(dp => `${dp.name}Page from ./${dp.relativePath.replace('src/', '')}`).join(', ')
    : ''

  const supabaseNote = hasSupabase
    ? '\n- IMPORTANT: Import AuthCallback from ./pages/AuthCallback and add <Route path="/auth/callback" element={<AuthCallback />} /> — Supabase OAuth redirects here after Google/GitHub login'
    : ''

  // Build explicit import block — AI must import ALL of these
  const pageImports: string[] = ["import HomePage from './pages/Home'"]
  if (hasAuth) {
    pageImports.push("import LoginPage from './pages/Login'")
    pageImports.push("import RegisterPage from './pages/Register'")
  }
  if (hasSupabase) {
    pageImports.push("import AuthCallback from './pages/AuthCallback'  // Supabase OAuth redirect handler")
  }
  if (hasDashboard) {
    pageImports.push("import Dashboard from './pages/Dashboard'")
  }
  for (const dp of dynamicPages) {
    const importPath = dp.relativePath.replace('src/', '').replace(/\.tsx$/, '')
    pageImports.push(`import ${dp.name}Page from './${importPath}'`)
  }

  return `${buildProjectContext(project)}

Generate src/App.tsx for "${project.projectName}".

REQUIRED PAGE IMPORTS (copy exactly — do not omit any):
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Header } from './components/Header'
${pageImports.join('\n')}

REQUIRED ROUTES (add ALL of these inside <Routes> — do not skip any):
${routes.map(r => {
    const [path, name] = r.split(' → ')
    if (name === 'AuthCallback') return `<Route path="${path}" element={<AuthCallback />} />`
    if (name === 'Home') return `<Route path="${path}" element={<HomePage />} />`
    if (name === 'Login') return `<Route path="${path}" element={<LoginPage />} />`
    if (name === 'Register') return `<Route path="${path}" element={<RegisterPage />} />`
    if (name === 'Dashboard') return `<Route path="${path}" element={<Dashboard />} />`
    const pageName = name + 'Page'
    return `<Route path="${path}" element={<${pageName} />} />`
  }).join('\n')}
<Route path="*" element={<Navigate to="/" replace />} />

Other requirements:
- Outer wrapper: <div className="min-h-screen bg-zinc-950 text-zinc-50">
- <Header /> rendered above <Routes> on every page
- BrowserRouter wraps everything

${design}

Tech: React 18 + TypeScript + react-router-dom v6.
Export: export default function App()
Return ONLY the TypeScript/TSX code.`
}

export function promptGenericPage(
  project: CodeGenProject,
  page: DynamicPage,
  projectType: ProjectType,
  errorContext?: string
): string {
  const design = getDesignSystemPrompt(projectType)
  const isPremiumType = projectType === 'landing' || projectType === 'product' || projectType === 'portfolio'
  return `${buildProjectContext(project)}

Generate ${page.relativePath} for "${project.projectName}".
Page name: ${page.name}
Triggered by scope item: "${page.scopeItem}"

Requirements:
- Full-page layout: min-h-screen bg-zinc-950
- Page header: py-16 px-8 border-b border-zinc-800, prominent heading "${page.name}" with gradient text (text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-blue-400), subheading describing the page purpose
- At least 3 content sections with cards/grids, each with a clear heading and real content
- Realistic, fully populated content relevant to "${page.name}" for a ${project.summary} product
- No empty states, no TODO comments, no placeholder text, no lorem ipsum
- Consistent dark theme (zinc-950 bg, zinc-900 cards, zinc-400 body text)
- CTA button linking to /register where appropriate
- Hover states on all interactive elements
${isPremiumType ? `- Animate sections with Framer Motion: import { motion } from 'framer-motion'; each section uses initial={{ opacity:0, y:24 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true }}` : ''}

${design}

Tech: React 18 + TypeScript + Tailwind CSS${isPremiumType ? ' + Framer Motion' : ''}.
Export: export default function ${page.name}Page()
Return ONLY the TypeScript/TSX code.`
}

export function promptHeader(project: CodeGenProject, projectType: ProjectType, errorContext?: string): string {
  const hasAuth = project.features.some(f => /auth|login|register|user/i.test(f))
  const design = getDesignSystemPrompt(projectType)
  const navExtra = projectType === 'landing' ? ', Features (#features), Pricing (#pricing)' : ''
  const authBlock = hasAuth
    ? `- Auth buttons: "Sign In" (ghost) → /login, "Get Started" (primary gradient) → /register\n- When authenticated (check localStorage token): show "Dashboard" link + "Sign Out" button`
    : ''

  return `${buildProjectContext(project)}

Generate src/components/Header.tsx for "${project.projectName}".
Requirements:
- Sticky header: sticky top-0 z-50 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800
- Logo: "${project.projectName}" with gradient text (from-violet-400 to-blue-400)
- Nav links: Home${navExtra}
${authBlock}
- Mobile: hamburger menu with slide-down nav
- Use Link from react-router-dom for internal links

${design}

Tech: React 18 + TypeScript + Tailwind CSS + react-router-dom.
Export: export function Header()
Return ONLY the TypeScript/TSX code.`
}

export function promptLoginPage(project: CodeGenProject, projectType: ProjectType, errorContext?: string): string {
  const design = getDesignSystemPrompt(projectType)
  return `${buildProjectContext(project)}

Generate src/pages/Login.tsx for "${project.projectName}".
Requirements:
- Full-page centered layout: min-h-screen bg-zinc-950 flex items-center justify-center
- Card: bg-zinc-900 border border-zinc-800 rounded-2xl p-8 w-full max-w-md
- "Welcome back" heading, subtext
- Email + password inputs (dark theme)
- "Sign In" primary button (full width, gradient)
- "Don't have an account? Register" link → /register
- POST /api/auth/login with axios, store token in localStorage, redirect to /dashboard
- Loading state on button, error message display

${design}

Tech: React 18 + TypeScript + Tailwind CSS + axios + react-router-dom.
Export: export default function Login()
Return ONLY the TypeScript/TSX code.`
}

export function promptRegisterPage(project: CodeGenProject, projectType: ProjectType, errorContext?: string): string {
  const design = getDesignSystemPrompt(projectType)
  return `${buildProjectContext(project)}

Generate src/pages/Register.tsx for "${project.projectName}".
Requirements:
- Full-page centered layout: min-h-screen bg-zinc-950 flex items-center justify-center
- Card: bg-zinc-900 border border-zinc-800 rounded-2xl p-8 w-full max-w-md
- "Create your account" heading
- Name, email, password inputs (dark theme)
- Password strength indicator (weak/medium/strong)
- "Create Account" primary button (full width, gradient)
- "Already have an account? Sign In" link → /login
- POST /api/auth/register with axios, store token in localStorage, redirect to /dashboard
- Loading state, error display

${design}

Tech: React 18 + TypeScript + Tailwind CSS + axios + react-router-dom.
Export: export default function Register()
Return ONLY the TypeScript/TSX code.`
}

export function promptDashboard(project: CodeGenProject, projectType: ProjectType, errorContext?: string): string {
  const design = getDesignSystemPrompt(projectType)
  return `${buildProjectContext(project)}

Generate src/pages/Dashboard.tsx for "${project.projectName}".
Requirements:
- Protected page (check localStorage token, redirect to /login if missing)
- Welcome header with user name
- Stats row: 4 metric cards with realistic numbers and trend indicators
- Main content grid: feature-specific cards based on: ${project.features.slice(0, 4).join(', ')}
- Quick actions panel
- Recent activity feed (5 items with timestamps)
- All data can be mock/static — but must look real and populated (no empty states)

${design}

Tech: React 18 + TypeScript + Tailwind CSS + axios.
Export: export default function Dashboard()
Return ONLY the TypeScript/TSX code.`
}

export function promptServerIndex(project: CodeGenProject, errorContext?: string): string {
  const hasAuth = project.features.some(f => /auth|login|register|user/i.test(f))
  const hasStripe = project.integrations.some(i => /stripe/i.test(i))

  // Build explicit router mount list — AI must mount ALL of these, no omissions
  const routerImports: string[] = []
  const routerMounts: string[] = []

  if (hasAuth) {
    routerImports.push("import { authRouter } from './routes/auth'")
    routerMounts.push("app.use('/api/auth', authRouter)   // POST /api/auth/register, /api/auth/login, GET /api/auth/me")
  }
  routerImports.push("import { apiRouter } from './routes/api'")
  routerMounts.push("app.use('/api', apiRouter)           // GET /api/status, feature CRUD routes")
  if (hasStripe) {
    routerImports.push("import { stripeRouter } from './routes/stripe'")
    routerMounts.push("// STRIPE: webhook MUST be mounted BEFORE express.json() for raw body access")
    routerMounts.push("app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeRouter)")
    routerMounts.push("app.use('/api/stripe', stripeRouter)  // POST /api/stripe/checkout, /api/stripe/portal")
  }

  return `${buildProjectContext(project)}

Generate server/index.ts for "${project.projectName}" — a complete Express.js server.

REQUIRED IMPORTS (copy exactly):
${routerImports.join('\n')}

REQUIRED ROUTER MOUNTS (mount ALL of these — do not skip any):
${routerMounts.join('\n')}

Other requirements:
- Import dotenv/config at top (first line)
- Express app with: helmet(), cors({ origin: process.env.CLIENT_URL, credentials: true }), morgan('dev')
${hasStripe ? '- express.json() MUST come AFTER the stripe webhook raw body mount (see above)' : '- express.json() middleware'}
- Health check: GET /api/health → { status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' }
- 404 handler: res.status(404).json({ error: 'Not found', path: req.path })
- Error handler middleware (4 args: err, req, res, next)
- Listen on process.env.PORT ?? 3001, log "Server running on port X"

Tech: Node.js + Express + TypeScript.
Return ONLY the TypeScript code.`
}

export function promptAuthRoutes(project: CodeGenProject, errorContext?: string): string {
  return `${buildProjectContext(project)}

Generate server/routes/auth.ts — complete authentication routes.
ALL endpoints fully implemented (no TODO, no placeholder):

POST /register: validate name/email/password, check duplicate email, bcrypt.hash(password,12), prisma.user.create, sign JWT 7d, return 201 {user,token}
POST /login: validate email/password, findUnique, bcrypt.compare, sign JWT, return 200 {user,token}
GET /me: verify Bearer token, prisma.user.findUnique, return 200 {user}
POST /logout: return 200 {message:'Logged out successfully'}

Imports: Router/Request/Response from 'express', bcrypt from 'bcryptjs', jwt from 'jsonwebtoken', {prisma} from '../lib/prisma'
JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production'
Export: export { router as authRouter }
Return ONLY the TypeScript code.`
}

export function promptApiRoutes(project: CodeGenProject, errorContext?: string): string {
  const featureRoutes = project.features.slice(0, 4).map(f => {
    const slug = f.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    return `GET /${slug} (list), POST /${slug} (create), GET /${slug}/:id, PUT /${slug}/:id, DELETE /${slug}/:id`
  }).join('\n')

  return `${buildProjectContext(project)}

Generate server/routes/api.ts — feature API routes.
Routes:
GET /api/status → { status: 'ok', version: '1.0.0', timestamp }
${featureRoutes}

Requirements: Router from express, try/catch on each route, realistic mock data, proper HTTP status codes.
Export: export { router as apiRouter }
Return ONLY the TypeScript code.`
}

export function promptPrismaSchema(project: CodeGenProject, errorContext?: string): string {
  const hasStripe = project.integrations.some(i => /stripe/i.test(i))
  const hasDatabaseIntelligence = !!project.databaseContext

  // When database intelligence is available, the schema design entities are already
  // injected via buildProjectContext → databaseContext. The AI should follow that design.
  const intelligenceGuidance = hasDatabaseIntelligence
    ? `
IMPORTANT: A DATABASE INTELLIGENCE section is provided in the project context above.
Follow the schema design described there — implement ALL entities, relations, indexes, and enums exactly as specified.
Add proper Prisma relation syntax, @relation fields, and @@map table names.
If the DATABASE INTELLIGENCE specifies ownership fields (userId), include @relation to User with onDelete:Cascade.`
    : ''

  return `${buildProjectContext(project)}

Generate prisma/schema.prisma for "${project.projectName}".
Requirements:
- generator client: provider = "prisma-client-js"
- datasource db: provider = "postgresql", url = env("DATABASE_URL")
- Every model: @id @default(cuid()), createdAt DateTime @default(now()), updatedAt DateTime @updatedAt
- User model: id, name, email @unique, password, createdAt, updatedAt
- User-owned models: userId String + @relation(fields:[userId], references:[id], onDelete:Cascade) + @@index([userId])
${hasStripe ? '- Subscription model: userId @unique, stripeCustomerId?, stripeSubscriptionId?, status @default("inactive"), currentPeriodEnd?, @@map("subscriptions")' : ''}
- Add @@index on commonly queried fields (userId, status, email)
- Use enum types for status fields with fixed values
- @@map("lowercase_plural_table_name") on every model
- Additional models for: ${project.features.slice(0, 5).join(', ')}
${intelligenceGuidance}
Return ONLY the Prisma schema content.`
}

// ─── Login page — Supabase variant ───────────────────────────

export function promptLoginPageSupabase(project: CodeGenProject, projectType: ProjectType, errorContext?: string): string {
  const ds = getDesignSystemPrompt(projectType)
  return `${buildProjectContext(project)}
${ds}

Generate src/pages/Login.tsx — login page using Supabase Auth.
Requirements:
- Import: import { signIn } from '@/lib/supabase' (or '../lib/supabase')
- State: email, password, loading, error
- handleSubmit: call signIn(email, password), on success navigate('/dashboard'), on error show error.message
- Google OAuth button: import { supabase } from '@/lib/supabase'; supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/auth/callback' } })
- GitHub OAuth button: same pattern with provider: 'github'
- "Or" divider between OAuth and email/password form
- Password field with show/hide toggle (Eye/EyeOff from lucide-react)
- Link to /register for new users
- Full Tailwind dark-theme styling matching the design system
- Framer Motion entrance animation on the card
Return ONLY the TypeScript/TSX code.`
}

// ─── Register page — Supabase variant ────────────────────────

export function promptRegisterPageSupabase(project: CodeGenProject, projectType: ProjectType, errorContext?: string): string {
  const ds = getDesignSystemPrompt(projectType)
  return `${buildProjectContext(project)}
${ds}

Generate src/pages/Register.tsx — registration page using Supabase Auth.
Requirements:
- Import: import { signUp } from '@/lib/supabase' (or '../lib/supabase')
- State: firstName, lastName, email, password, loading, error, confirmationMsg
- handleSubmit: call signUp(email, password, { firstName, lastName }), on success show confirmationMsg "Check your email to confirm your account", on error show error.message
- Google OAuth button: supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/auth/callback' } })
- GitHub OAuth button: same pattern with provider: 'github'
- "Or" divider between OAuth and email/password form
- Password field with show/hide toggle (Eye/EyeOff from lucide-react)
- Link to /login for existing users
- Full Tailwind dark-theme styling matching the design system
- Framer Motion entrance animation on the card
Return ONLY the TypeScript/TSX code.`
}

// ─── Stripe routes prompt ─────────────────────────────────────

export function promptStripeRoutes(project: CodeGenProject, errorContext?: string): string {
  return `${buildProjectContext(project)}

Generate server/routes/stripe.ts — complete Stripe integration routes.
ALL endpoints fully implemented (no TODO, no placeholder):

POST /checkout: requireAuth middleware, create Stripe Checkout Session (mode:'subscription', line_items with STRIPE_PRICE_ID), success_url and cancel_url using CLIENT_URL env, return { url: session.url }
POST /portal: requireAuth middleware, look up stripeCustomerId from prisma.subscription, create Stripe Customer Portal session, return { url: session.url }
POST /webhook: raw body (req.body is Buffer), stripe.webhooks.constructEvent with STRIPE_WEBHOOK_SECRET, handle checkout.session.completed (upsert subscription), customer.subscription.updated (update status), customer.subscription.deleted (set status canceled)

Imports: Router/Request/Response from 'express', Stripe from 'stripe', {prisma} from '../lib/prisma', {requireAuth, AuthRequest} from '../middleware/auth'
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2024-06-20' })
Export: export { router as stripeRouter }
Return ONLY the TypeScript code.`
}

// ─── Server index — with Stripe router wired ─────────────────

export function promptServerIndexWithStripe(project: CodeGenProject, errorContext?: string): string {
  return `${buildProjectContext(project)}

Generate server/index.ts — Express server entry point with Stripe webhook support.
Requirements:
- Import and mount stripeRouter at /api/stripe
- CRITICAL: Mount stripe webhook route BEFORE express.json() so raw body is available:
  app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeRouter)
  app.use(express.json())
  app.use('/api/stripe', stripeRouter)
- Import authRouter from './routes/auth', apiRouter from './routes/api', stripeRouter from './routes/stripe'
- CORS with CLIENT_URL env var
- helmet(), morgan('dev')
- GET /api/health → { status: 'ok', timestamp }
- Error handler middleware
- Listen on PORT env var (default 3001)
- console.log on startup
Return ONLY the TypeScript code.`
}
