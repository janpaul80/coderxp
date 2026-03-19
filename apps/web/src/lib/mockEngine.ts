/**
 * CodedXP Mock Demo Engine
 *
 * Simulates the full product lifecycle when the backend is offline.
 * Demonstrates: chat → planning → plan card → approval → building → preview
 *
 * Uses the same store actions the real socket would use — so when the
 * real backend is wired, this file can simply be removed.
 */

import { useAppStore } from '@/store/appStore'
import { useChatStore } from '@/store/chatStore'
import type { Plan, Message, JobLog, BuildProgress } from '@/types'

// ─── Utilities ────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

let _idCounter = 0
function uid(prefix = 'mock') {
  return `${prefix}-${Date.now()}-${++_idCounter}`
}

// ─── Intent Classification ────────────────────────────────────

type Intent = 'vague' | 'build_request' | 'question' | 'greeting'

function classifyIntent(content: string): Intent {
  const lower = content.toLowerCase().trim()

  // Greetings / vague
  const greetings = ['hello', 'hi', 'hey', 'yo', 'sup', 'hiya']
  if (greetings.some((g) => lower === g || lower === g + '!')) return 'greeting'

  const vague = [
    'help me',
    'help',
    'build something',
    'i want an app',
    'make me an app',
    'create something',
    'test',
    'what can you do',
    'what do you do',
    'show me',
  ]
  if (vague.some((v) => lower === v || lower.startsWith(v + ' ') && lower.length < 30))
    return 'vague'

  // Build requests — must have a build verb AND enough context
  const buildVerbs = ['build', 'create', 'make', 'develop', 'generate', 'write', 'code', 'design']
  const appNouns = [
    'app', 'application', 'website', 'site', 'saas', 'dashboard', 'platform',
    'landing page', 'api', 'backend', 'frontend', 'tool', 'system', 'portal',
    'marketplace', 'store', 'shop', 'blog', 'admin', 'panel',
  ]

  const hasBuildVerb = buildVerbs.some((v) => lower.includes(v))
  const hasAppNoun = appNouns.some((n) => lower.includes(n))

  if ((hasBuildVerb || hasAppNoun) && lower.length > 15) return 'build_request'

  return 'question'
}

// ─── Plan Generator ───────────────────────────────────────────

function detectFeatures(content: string) {
  const lower = content.toLowerCase()
  return {
    hasAuth: /auth|login|sign.?in|register|user|account/.test(lower),
    hasStripe: /stripe|billing|payment|subscription|checkout/.test(lower),
    hasPayPal: /paypal/.test(lower),
    hasSupabase: /supabase/.test(lower),
    hasDatabase: /database|db|postgres|mysql|mongo|supabase/.test(lower),
    hasAPI: /api|backend|server|endpoint/.test(lower),
    hasDashboard: /dashboard|admin|panel|analytics/.test(lower),
    hasLandingPage: /landing|homepage|marketing/.test(lower),
    isSaaS: /saas|subscription|plan|tier/.test(lower),
    isBooking: /book|booking|appointment|schedule|reservation/.test(lower),
    isEcommerce: /shop|store|ecommerce|product|cart|checkout/.test(lower),
    isBlog: /blog|post|article|cms|content/.test(lower),
  }
}

function generatePlan(content: string, chatId: string): Plan {
  const f = detectFeatures(content)
  const now = new Date().toISOString()
  const planId = uid('plan')

  // Derive app name from content
  const appName = content.length > 60 ? content.slice(0, 57) + '...' : content

  const features: string[] = []
  const frontendScope: string[] = ['Landing page', 'Responsive layout', 'Dark/light theme toggle']
  const backendScope: string[] = ['REST API', 'Environment configuration']
  const integrations: string[] = []

  if (f.hasAuth || f.isSaaS) {
    features.push('User authentication (email + password)')
    frontendScope.push('Login page', 'Register page', 'Protected routes')
    backendScope.push('JWT auth middleware', 'User model & routes')
  }

  if (f.hasDashboard || f.isSaaS) {
    features.push('User dashboard')
    frontendScope.push('Dashboard layout', 'Stats cards', 'Activity feed')
  }

  if (f.isBooking) {
    features.push('Booking / scheduling system')
    frontendScope.push('Booking calendar', 'Service selection', 'Confirmation flow')
    backendScope.push('Booking model', 'Availability logic', 'Booking routes')
  }

  if (f.isEcommerce) {
    features.push('Product catalog', 'Shopping cart')
    frontendScope.push('Product listing', 'Product detail', 'Cart sidebar')
    backendScope.push('Product model', 'Cart logic')
  }

  if (f.hasStripe) {
    features.push('Stripe billing & subscriptions')
    integrations.push('Stripe (checkout, webhooks, portal)')
    backendScope.push('Stripe webhook handler', 'Subscription management')
  }

  if (f.hasPayPal) {
    features.push('PayPal payments')
    integrations.push('PayPal SDK')
  }

  if (f.hasSupabase) {
    features.push('Supabase backend (database + auth)')
    integrations.push('Supabase (PostgreSQL + Auth + Storage)')
    backendScope.push('Supabase client setup', 'Row-level security policies')
  }

  if (f.isSaaS) {
    features.push('Subscription tiers', 'Usage tracking')
    frontendScope.push('Pricing page', 'Plan upgrade flow')
  }

  if (f.isBlog) {
    features.push('Blog / CMS')
    frontendScope.push('Blog listing', 'Post detail', 'Rich text editor')
    backendScope.push('Post model', 'CMS routes')
  }

  // Defaults if nothing detected
  if (features.length === 0) {
    features.push('Core application functionality', 'Responsive UI', 'Clean navigation')
  }

  const executionSteps = [
    { id: uid('step'), order: 1, title: 'Initialize project', description: 'Set up monorepo, install dependencies, configure TypeScript and Tailwind', status: 'pending' as const, estimatedDuration: '1 min' },
    { id: uid('step'), order: 2, title: 'Build frontend shell', description: 'Create layout, routing, and core UI components', status: 'pending' as const, estimatedDuration: '3 min' },
    ...(f.hasAuth || f.isSaaS ? [{ id: uid('step'), order: 3, title: 'Wire authentication', description: 'Implement login, register, session management, and protected routes', status: 'pending' as const, estimatedDuration: '2 min' }] : []),
    ...(f.isBooking ? [{ id: uid('step'), order: 4, title: 'Build booking system', description: 'Create booking calendar, service selection, and confirmation flow', status: 'pending' as const, estimatedDuration: '3 min' }] : []),
    ...(f.hasDashboard ? [{ id: uid('step'), order: 5, title: 'Build dashboard', description: 'Create dashboard layout with stats, charts, and activity feed', status: 'pending' as const, estimatedDuration: '2 min' }] : []),
    ...(f.hasStripe ? [{ id: uid('step'), order: 6, title: 'Integrate Stripe', description: 'Set up checkout, webhooks, subscription management, and billing portal', status: 'pending' as const, estimatedDuration: '2 min' }] : []),
    ...(f.hasSupabase ? [{ id: uid('step'), order: 7, title: 'Configure Supabase', description: 'Set up database schema, RLS policies, and Supabase auth', status: 'pending' as const, estimatedDuration: '2 min' }] : []),
    { id: uid('step'), order: 8, title: 'Run & validate', description: 'Start the app, run health checks, and verify all routes load correctly', status: 'pending' as const, estimatedDuration: '1 min' },
  ]

  const techStack = {
    frontend: ['React 18', 'TypeScript', 'Vite', 'Tailwind CSS', 'Framer Motion'],
    backend: f.hasSupabase ? ['Supabase'] : ['Node.js', 'Express', 'TypeScript'],
    database: f.hasSupabase ? ['Supabase PostgreSQL'] : f.hasDatabase ? ['PostgreSQL', 'Prisma'] : undefined,
    auth: f.hasAuth || f.isSaaS ? (f.hasSupabase ? ['Supabase Auth'] : ['JWT', 'bcrypt']) : undefined,
    integrations: integrations.length > 0 ? integrations : undefined,
    deployment: ['Vercel (frontend)', 'Railway (backend)'],
  }

  const complexity = features.length > 5 ? 'high' : features.length > 2 ? 'medium' : 'low'

  return {
    id: planId,
    chatId,
    projectId: uid('proj'),
    status: 'pending_approval',
    summary: `Build ${appName}`,
    features,
    frontendScope,
    backendScope,
    integrations,
    techStack,
    executionSteps,
    estimatedComplexity: complexity,
    createdAt: now,
    updatedAt: now,
  }
}

// ─── Streaming Text ───────────────────────────────────────────

async function streamText(messageId: string, text: string, charDelay = 18) {
  const { appendStreamDelta, setStreaming } = useChatStore.getState()

  // Stream word by word for a more natural feel
  const words = text.split(' ')
  for (let i = 0; i < words.length; i++) {
    const chunk = (i === 0 ? '' : ' ') + words[i]
    appendStreamDelta(messageId, chunk)
    setStreaming(true, messageId)
    await sleep(charDelay + Math.random() * 20)
  }
}

function addStreamingMessage(chatId: string): string {
  const { addMessage, setStreaming } = useChatStore.getState()
  const messageId = uid('msg')

  addMessage({
    id: messageId,
    chatId,
    role: 'assistant',
    type: 'text',
    content: '',
    createdAt: new Date().toISOString(),
    isStreaming: true,
  })

  setStreaming(true, messageId)
  return messageId
}

function finalizeMessage(messageId: string) {
  const { finalizeStream, setAssistantTyping } = useChatStore.getState()
  finalizeStream(messageId)
  setAssistantTyping(false)
}

// ─── Build Simulation ─────────────────────────────────────────

function generateBuildLogs(plan: Plan): JobLog[] {
  const logs: JobLog[] = []
  const now = Date.now()

  const files = [
    // Project init
    { type: 'run' as const, msg: 'Initializing project with Vite + React + TypeScript', delay: 0 },
    { type: 'run' as const, msg: 'Installing dependencies...', delay: 400 },
    { type: 'create' as const, msg: 'package.json', file: 'package.json', delay: 800 },
    { type: 'create' as const, msg: 'vite.config.ts', file: 'vite.config.ts', delay: 900 },
    { type: 'create' as const, msg: 'tailwind.config.ts', file: 'tailwind.config.ts', delay: 1000 },
    { type: 'create' as const, msg: 'tsconfig.json', file: 'tsconfig.json', delay: 1100 },
    { type: 'success' as const, msg: 'Dependencies installed (react, react-dom, tailwindcss, framer-motion)', delay: 1800 },

    // Core structure
    { type: 'create' as const, msg: 'src/main.tsx', file: 'src/main.tsx', delay: 2000 },
    { type: 'create' as const, msg: 'src/App.tsx', file: 'src/App.tsx', delay: 2200 },
    { type: 'create' as const, msg: 'src/index.css', file: 'src/index.css', delay: 2400 },
    { type: 'create' as const, msg: 'src/types/index.ts', file: 'src/types/index.ts', delay: 2600 },

    // Layout
    { type: 'create' as const, msg: 'src/components/layout/Layout.tsx', file: 'src/components/layout/Layout.tsx', delay: 2900 },
    { type: 'create' as const, msg: 'src/components/layout/Navbar.tsx', file: 'src/components/layout/Navbar.tsx', delay: 3100 },
    { type: 'create' as const, msg: 'src/components/layout/Footer.tsx', file: 'src/components/layout/Footer.tsx', delay: 3300 },

    // Pages
    { type: 'create' as const, msg: 'src/pages/LandingPage.tsx', file: 'src/pages/LandingPage.tsx', delay: 3600 },
    { type: 'create' as const, msg: 'src/pages/LandingPage.tsx — Hero section', file: 'src/pages/LandingPage.tsx', delay: 3800 },
    { type: 'update' as const, msg: 'src/pages/LandingPage.tsx — Features section', file: 'src/pages/LandingPage.tsx', delay: 4000 },
    { type: 'update' as const, msg: 'src/pages/LandingPage.tsx — Pricing section', file: 'src/pages/LandingPage.tsx', delay: 4200 },
    { type: 'update' as const, msg: 'src/pages/LandingPage.tsx — CTA + Footer', file: 'src/pages/LandingPage.tsx', delay: 4400 },
  ]

  // Auth files
  if (plan.techStack.auth) {
    files.push(
      { type: 'create' as const, msg: 'src/pages/LoginPage.tsx', file: 'src/pages/LoginPage.tsx', delay: 4700 },
      { type: 'create' as const, msg: 'src/pages/RegisterPage.tsx', file: 'src/pages/RegisterPage.tsx', delay: 4900 },
      { type: 'create' as const, msg: 'src/hooks/useAuth.ts', file: 'src/hooks/useAuth.ts', delay: 5100 },
      { type: 'create' as const, msg: 'src/store/authStore.ts', file: 'src/store/authStore.ts', delay: 5300 },
      { type: 'create' as const, msg: 'src/components/auth/ProtectedRoute.tsx', file: 'src/components/auth/ProtectedRoute.tsx', delay: 5500 },
    )
  }

  // Dashboard files
  if (plan.frontendScope.includes('Dashboard layout')) {
    files.push(
      { type: 'create' as const, msg: 'src/pages/DashboardPage.tsx', file: 'src/pages/DashboardPage.tsx', delay: 5800 },
      { type: 'create' as const, msg: 'src/components/dashboard/StatsCard.tsx', file: 'src/components/dashboard/StatsCard.tsx', delay: 6000 },
      { type: 'create' as const, msg: 'src/components/dashboard/ActivityFeed.tsx', file: 'src/components/dashboard/ActivityFeed.tsx', delay: 6200 },
    )
  }

  // Booking files
  if (plan.features.some(f => f.toLowerCase().includes('booking'))) {
    files.push(
      { type: 'create' as const, msg: 'src/pages/BookingPage.tsx', file: 'src/pages/BookingPage.tsx', delay: 6400 },
      { type: 'create' as const, msg: 'src/components/booking/BookingCalendar.tsx', file: 'src/components/booking/BookingCalendar.tsx', delay: 6600 },
      { type: 'create' as const, msg: 'src/components/booking/ServiceSelector.tsx', file: 'src/components/booking/ServiceSelector.tsx', delay: 6800 },
    )
  }

  // Backend files
  if (!plan.techStack.backend.includes('Supabase')) {
    files.push(
      { type: 'create' as const, msg: 'server/src/index.ts', file: 'server/src/index.ts', delay: 7100 },
      { type: 'create' as const, msg: 'server/src/routes/auth.ts', file: 'server/src/routes/auth.ts', delay: 7300 },
      { type: 'create' as const, msg: 'server/prisma/schema.prisma', file: 'server/prisma/schema.prisma', delay: 7500 },
      { type: 'run' as const, msg: 'Running prisma migrate dev...', delay: 7700 },
      { type: 'success' as const, msg: 'Database migrations applied', delay: 8200 },
    )
  }

  // Stripe integration
  if (plan.integrations.some(i => i.toLowerCase().includes('stripe'))) {
    files.push(
      { type: 'create' as const, msg: 'server/src/routes/billing.ts', file: 'server/src/routes/billing.ts', delay: 8500 },
      { type: 'create' as const, msg: 'server/src/webhooks/stripe.ts', file: 'server/src/webhooks/stripe.ts', delay: 8700 },
      { type: 'create' as const, msg: 'src/pages/PricingPage.tsx', file: 'src/pages/PricingPage.tsx', delay: 8900 },
    )
  }

  // Supabase
  if (plan.integrations.some(i => i.toLowerCase().includes('supabase'))) {
    files.push(
      { type: 'create' as const, msg: 'src/lib/supabase.ts', file: 'src/lib/supabase.ts', delay: 8500 },
      { type: 'create' as const, msg: 'supabase/migrations/001_init.sql', file: 'supabase/migrations/001_init.sql', delay: 8700 },
      { type: 'run' as const, msg: 'Applying Supabase migrations...', delay: 8900 },
      { type: 'success' as const, msg: 'Supabase schema applied', delay: 9300 },
    )
  }

  // Final steps
  const baseDelay = 9500
  files.push(
    { type: 'create' as const, msg: '.env.example', file: '.env.example', delay: baseDelay },
    { type: 'create' as const, msg: 'README.md', file: 'README.md', delay: baseDelay + 200 },
    { type: 'run' as const, msg: 'Starting development server...', delay: baseDelay + 500 },
    { type: 'run' as const, msg: 'Vite dev server running on port 3000', delay: baseDelay + 1200 },
    { type: 'success' as const, msg: '✓ Build complete — app is running', delay: baseDelay + 1800 },
  )

  return files.map((f, i) => ({
    id: uid('log'),
    timestamp: new Date(now + f.delay).toISOString(),
    type: f.type,
    message: f.msg,
    filePath: 'file' in f ? f.file : undefined,
  }))
}

// ─── Response Templates ───────────────────────────────────────

const GREETING_RESPONSES = [
  "Hey! I'm CodedXP — your autonomous app builder. Tell me what you want to build and I'll plan, code, and deploy it for you.\n\nFor example: *\"Build me a SaaS app for booking cleaning services with Stripe billing and Supabase backend\"*",
  "Hi there! I'm ready to build your next product. Describe what you have in mind — the more detail you give me, the better the result.\n\nTry something like: *\"Create a dashboard app with user auth, analytics, and a REST API\"*",
]

const VAGUE_RESPONSES = [
  "I'd love to help you build something! To get started, I need a bit more context:\n\n• **What type of app** are you building? (SaaS, landing page, dashboard, marketplace...)\n• **Who is it for?** (customers, internal team, public users...)\n• **What are the core features?** (auth, payments, bookings, content...)\n• **Any specific integrations?** (Stripe, Supabase, PayPal...)\n\nThe more you tell me, the better I can plan and build it.",
  "Happy to build that for you! Before I start planning, let me ask a few quick questions:\n\n1. What problem does this app solve?\n2. Do you need user authentication?\n3. Will there be payments or subscriptions?\n4. Do you have a preferred tech stack, or should I choose?\n\nOnce I understand the scope, I'll create a detailed plan for your approval.",
]

const QUESTION_RESPONSES = [
  "That's a great question! I can help you build full-stack applications including:\n\n• **Landing pages** — marketing sites with conversion-focused design\n• **SaaS apps** — with auth, billing, and dashboards\n• **Dashboards** — data visualization and admin panels\n• **Full-stack apps** — React frontend + Node.js/Supabase backend\n• **E-commerce** — product catalogs, carts, and Stripe checkout\n\nJust describe what you want to build and I'll handle the rest.",
]

const PLANNING_RESPONSES = [
  "I've analyzed your request. Let me create a detailed implementation plan...",
  "Great — I have enough context to plan this. Generating your build plan now...",
  "This is a solid project. Let me break it down into a structured plan...",
]

// ─── Main Engine ──────────────────────────────────────────────

class MockEngine {
  private activePlanId: string | null = null

  async handleMessage(content: string, chatId: string): Promise<void> {
    const intent = classifyIntent(content)
    const { setAssistantTyping } = useChatStore.getState()
    const { transitionToPlanning } = useAppStore.getState()

    // Small delay to feel natural
    await sleep(600)
    setAssistantTyping(false)

    switch (intent) {
      case 'greeting': {
        const msgId = addStreamingMessage(chatId)
        const response = GREETING_RESPONSES[Math.floor(Math.random() * GREETING_RESPONSES.length)]
        await streamText(msgId, response, 12)
        finalizeMessage(msgId)
        break
      }

      case 'vague': {
        const msgId = addStreamingMessage(chatId)
        const response = VAGUE_RESPONSES[Math.floor(Math.random() * VAGUE_RESPONSES.length)]
        await streamText(msgId, response, 12)
        finalizeMessage(msgId)
        break
      }

      case 'question': {
        const msgId = addStreamingMessage(chatId)
        const response = QUESTION_RESPONSES[0]
        await streamText(msgId, response, 12)
        finalizeMessage(msgId)
        break
      }

      case 'build_request': {
        await this.handleBuildRequest(content, chatId)
        break
      }
    }
  }

  private async handleBuildRequest(content: string, chatId: string): Promise<void> {
    const { addMessage } = useChatStore.getState()
    const { transitionToPlanning, transitionToAwaitingApproval } = useAppStore.getState()

    // Step 1: Acknowledge and start planning
    const ackId = addStreamingMessage(chatId)
    const ackText = PLANNING_RESPONSES[Math.floor(Math.random() * PLANNING_RESPONSES.length)]
    await streamText(ackId, ackText, 15)
    finalizeMessage(ackId)

    await sleep(400)

    // Step 2: Transition right panel to planning
    transitionToPlanning()

    await sleep(2200)

    // Step 3: Generate plan
    const plan = generatePlan(content, chatId)
    this.activePlanId = plan.id

    // Step 4: Transition to awaiting approval
    transitionToAwaitingApproval(plan)

    // Step 5: Add plan message to chat
    const planMessage: Message = {
      id: uid('msg'),
      chatId,
      role: 'assistant',
      type: 'plan',
      content: "Here's the implementation plan I've created for your project. Review it carefully and approve to start building.",
      metadata: { plan },
      createdAt: new Date().toISOString(),
    }
    addMessage(planMessage)
  }

  async handleApproval(planId: string, _projectId: string): Promise<void> {
    const { addMessage } = useChatStore.getState()
    const { transitionToBuilding, setPanelProgress, transitionToPreview } = useAppStore.getState()
    const { activePlan } = useAppStore.getState()

    const chatId = activePlan?.chatId ?? 'default'
    const jobId = uid('job')

    // Acknowledge approval
    const ackMessage: Message = {
      id: uid('msg'),
      chatId,
      role: 'assistant',
      type: 'build_start',
      content: '✅ Plan approved! Starting the build now. You can watch the progress on the right panel.',
      createdAt: new Date().toISOString(),
    }
    addMessage(ackMessage)

    // Transition to building
    transitionToBuilding(jobId)

    // Generate build logs
    const plan = activePlan ?? generatePlan('app', chatId)
    const logs = generateBuildLogs(plan)

    // Stream logs to the right panel
    let logIndex = 0
    const totalLogs = logs.length

    for (const log of logs) {
      await sleep(log.type === 'run' ? 600 : log.type === 'success' ? 800 : 280)

      logIndex++
      const progress = Math.round((logIndex / totalLogs) * 100)

      const buildProgress: BuildProgress = {
        jobId,
        status: progress < 30
          ? 'initializing'
          : progress < 60
          ? 'generating_frontend'
          : progress < 80
          ? 'generating_backend'
          : progress < 95
          ? 'wiring_integrations'
          : 'running',
        currentStep: log.message,
        progress,
        recentLogs: logs.slice(Math.max(0, logIndex - 8), logIndex),
      }

      setPanelProgress(buildProgress)
    }

    await sleep(800)

    // Build complete — transition to preview
    const previewUrl = 'https://demo.codedxp.app/preview'
    transitionToPreview(previewUrl)

    const completeMessage: Message = {
      id: uid('msg'),
      chatId,
      role: 'assistant',
      type: 'build_complete',
      content: '🚀 Your app has been built successfully! The live preview is now showing on the right. You can request changes or ask me to add new features.',
      createdAt: new Date().toISOString(),
    }
    addMessage(completeMessage)
  }

  async handleRejection(planId: string, reason?: string): Promise<void> {
    const { addMessage } = useChatStore.getState()
    const { resetToIdle, activePlan } = useAppStore.getState()

    const chatId = activePlan?.chatId ?? 'default'

    resetToIdle()

    const msgId = addStreamingMessage(chatId)
    const response = reason
      ? `Understood — I'll revise the plan. You mentioned: "${reason}"\n\nTell me what changes you'd like and I'll generate a new plan.`
      : "No problem! Tell me what you'd like to change about the plan and I'll revise it for you."

    await sleep(400)
    await streamText(msgId, response, 15)
    finalizeMessage(msgId)
  }

  async handleModification(planId: string, modifications: string): Promise<void> {
    const { addMessage } = useChatStore.getState()
    const { resetToIdle, activePlan } = useAppStore.getState()

    const chatId = activePlan?.chatId ?? 'default'

    resetToIdle()

    const msgId = addStreamingMessage(chatId)
    await sleep(400)
    await streamText(
      msgId,
      `Got it — I'll revise the plan with your changes: "${modifications}"\n\nGenerating an updated plan now...`,
      15
    )
    finalizeMessage(msgId)

    await sleep(800)

    // Re-run the build request with the original content + modifications
    const originalContent = activePlan?.summary ?? modifications
    await this.handleBuildRequest(`${originalContent}. Additional requirements: ${modifications}`, chatId)
  }
}

// ─── Singleton Export ─────────────────────────────────────────

export const mockEngine = new MockEngine()
