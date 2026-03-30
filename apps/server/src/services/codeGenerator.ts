/**
 * codeGenerator.ts — AI-powered code generation engine
 *
 * Generates production-quality, complete code for each project file
 * using the Blackbox AI API. Falls back to enhanced templates if AI unavailable.
 */

import { completeStream, complete, isProviderAvailable } from '../lib/providers'
import { detectProjectType, type ProjectType } from './designSystem'
import { writeWorkspaceFile } from './workspace'
import { validateAllIntegrations } from './integrationValidation'

// ─── Types (re-exported from codeGeneratorTypes) ──────────────
export type { CodeGenProject, GeneratedFile, CodeGenCallbacks, DynamicPage } from './codeGeneratorTypes'
import type { CodeGenProject, GeneratedFile, CodeGenCallbacks, DynamicPage } from './codeGeneratorTypes'

// ─── Template generators ──────────────────────────────────────
import {
  templatePackageJson, templateTsConfig, templateViteConfig,
  templateIndexHtml, templateMainTsx, templateApiClient,
  templateAuthMiddleware, templateEnvExample, templateGitignore,
  templatePostcssConfig, templateReadme,
  templateTailwindConfig, templateIndexCss,
  templatePrismaClient, templateSupabaseClient, templateStripeRoutes,
  templateSubscriptionModel, templateLoginPageSupabase, templateRegisterPageSupabase,
  templateAuthCallbackPage, templateServerTsConfig,
} from './codeGeneratorTemplates'

// ─── Fallback generators ──────────────────────────────────────
import {
  fallbackAppTsx, fallbackHeader, fallbackHomePage,
  fallbackLoginPage, fallbackRegisterPage, fallbackDashboard,
  fallbackServerIndex, fallbackAuthRoutes, fallbackApiRoutes,
  fallbackPrismaSchema, fallbackGenericPage,
} from './codeGeneratorFallbacks'

// ─── Prompt builders ──────────────────────────────────────────
import {
  promptHomePage, promptAppTsx, promptHeader,
  promptLoginPage, promptRegisterPage, promptDashboard,
  promptServerIndex, promptAuthRoutes, promptApiRoutes,
  promptPrismaSchema, promptGenericPage,
  promptStripeRoutes, promptServerIndexWithStripe,
} from './codeGeneratorPrompts'

// ─── AI generation helpers ────────────────────────────────────

const AI_SYSTEM_PROMPT = `You are an elite full-stack developer generating production-quality code.
Rules:
- Generate ONLY the file content. No explanation. No markdown code blocks. No \`\`\` fences.
- Code must be complete, working, and production-ready.
- No TODO comments. No placeholder implementations. No "implement later" notes.
- Every function must be fully implemented.
- Use the exact imports, exports, and types specified.`

/**
 * extractCode — robust extraction of code from AI responses.
 * Handles: markdown fences, trailing explanations, multiple code blocks,
 * leading/trailing prose that LLMs sometimes add despite instructions.
 */
function extractCode(raw: string): string {
  let content = raw.trim()

  // 1. If the response contains a fenced code block, extract the LARGEST one
  const fenceRegex = /```(?:typescript|tsx|ts|javascript|jsx|js|prisma|json|bash|css|html|text)?\s*\n([\s\S]*?)```/gi
  const blocks: string[] = []
  let match: RegExpExecArray | null
  while ((match = fenceRegex.exec(content)) !== null) {
    blocks.push(match[1])
  }
  if (blocks.length > 0) {
    // Use the largest block (most likely the actual code)
    content = blocks.reduce((a, b) => a.length >= b.length ? a : b)
    return content.trim()
  }

  // 2. Strip a single opening/closing fence (no inner newline required)
  content = content.replace(/^```(?:typescript|tsx|ts|javascript|jsx|js|prisma|json|bash|css|html|text)?\s*/i, '')
  content = content.replace(/\s*```\s*$/, '')

  // 3. Strip common leading prose patterns LLMs add
  content = content.replace(/^(?:Here(?:'s| is) (?:the|your) .*?:\s*\n)/i, '')
  content = content.replace(/^(?:Sure[!,.].*?\n)/i, '')
  content = content.replace(/^(?:Below is .*?:\s*\n)/i, '')

  // 4. Strip trailing explanation after the last closing brace/tag/semicolon
  //    Only if the trailing text looks like prose (starts with a letter after blank line)
  const trailingProseMatch = content.match(/\n\n([A-Z][a-z].*?)$/s)
  if (trailingProseMatch && trailingProseMatch[1].length < 500) {
    content = content.slice(0, content.length - trailingProseMatch[0].length)
  }

  return content.trim()
}

// Per-file timeout: if a single AI generation takes longer than this, abort
// and fall back to the template. Reduced to 30s because if the provider can't
// respond in 30s it won't respond in 60s either, and 30s × N files is already
// too long for the user.
const PER_FILE_AI_TIMEOUT_MS = 30_000 // 30 seconds per file

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[CodeGen] ${label} timed out after ${timeoutMs / 1000}s`))
    }, timeoutMs)
    promise.then(
      (val) => { clearTimeout(timer); resolve(val) },
      (err) => { clearTimeout(timer); reject(err) },
    )
  })
}

// Module-level flag: when set to true, generateFileWithAI immediately returns null
// (template fallback) without making any provider calls. Used by the overall
// generation timeout AND by the fast-fail logic (first file timeout → skip rest).
let _forceTemplateFallback = false

// Track consecutive AI failures so the generation loop can fast-fail
let _consecutiveAiFailures = 0
const MAX_CONSECUTIVE_FAILURES = 3  // After 3 consecutive timeouts, skip remaining AI calls

async function generateFileWithAI(
  userPrompt: string,
  maxTokens = 8192,
  onToken?: (delta: string) => void,
): Promise<string | null> {
  // Fast-fail: if a previous file timed out or the overall generation timer
  // has triggered, skip AI and fall back to template immediately.
  if (_forceTemplateFallback) {
    console.log('[CodeGen] Force-template mode active — using fallback')
    return null
  }

  // Check if any provider is available at all
  if (!isProviderAvailable('blackbox') && !isProviderAvailable('openclaw') && !isProviderAvailable('langdock') && !isProviderAvailable('openrouter')) {
    console.log('[CodeGen] No AI provider available — using fallback template')
    return null
  }

  try {
    const result = await withTimeout(
      onToken
        ? completeStream({
            role: 'fallback',
            systemPrompt: AI_SYSTEM_PROMPT,
            userPrompt,
            maxTokens,
            temperature: 0.3,
            onToken: (delta) => onToken(delta),
          })
        : complete({
            role: 'fallback',
            systemPrompt: AI_SYSTEM_PROMPT,
            userPrompt,
            maxTokens,
            temperature: 0.3,
          }),
      PER_FILE_AI_TIMEOUT_MS,
      'AI file generation',
    )

    _consecutiveAiFailures = 0  // Reset on success

    const code = extractCode(result.content)
    if (!code || code.length < 20) {
      console.warn(`[CodeGen] AI returned empty/too-short response (${code.length} chars) — using fallback`)
      return null
    }

    console.log(`[CodeGen] AI generated ${code.length} chars via ${result.provider}/${result.model} in ${result.durationMs}ms`)
    return code
  } catch (err) {
    _consecutiveAiFailures++
    const errMsg = err instanceof Error ? err.message : String(err)
    console.warn(`[CodeGen] AI generation failed (attempt ${_consecutiveAiFailures}/${MAX_CONSECUTIVE_FAILURES + 1}): ${errMsg}`)

    if (_consecutiveAiFailures > MAX_CONSECUTIVE_FAILURES) {
      console.warn(`[CodeGen] ${_consecutiveAiFailures} consecutive failures — switching to template fallback for remaining files`)
      _forceTemplateFallback = true
    }

    return null
  }
}

// ─── Scope → Page mapping ─────────────────────────────────────

const SCOPE_TO_PAGE: Array<{
  keywords: string[]
  name: string
  routePath: string
}> = [
  { keywords: ['pricing', 'price', 'plan', 'subscription', 'tier'],          name: 'Pricing',      routePath: '/pricing' },
  { keywords: ['contact', 'get in touch', 'reach us'],                        name: 'Contact',      routePath: '/contact' },
  { keywords: ['about', 'our story', 'team', 'who we are'],                   name: 'About',        routePath: '/about' },
  { keywords: ['blog', 'articles', 'posts', 'news', 'updates'],               name: 'Blog',         routePath: '/blog' },
  { keywords: ['faq', 'frequently asked', 'questions'],                        name: 'FAQ',          routePath: '/faq' },
  { keywords: ['settings', 'preferences', 'account settings'],                name: 'Settings',     routePath: '/settings' },
  { keywords: ['profile', 'user profile', 'my profile'],                      name: 'Profile',      routePath: '/profile' },
  { keywords: ['analytics', 'reports', 'statistics', 'stats', 'metrics'],     name: 'Analytics',    routePath: '/analytics' },
  { keywords: ['admin', 'administration', 'admin panel'],                     name: 'Admin',        routePath: '/admin' },
  { keywords: ['terms', 'terms of service', 'tos', 'legal'],                  name: 'Terms',        routePath: '/terms' },
  { keywords: ['privacy', 'privacy policy'],                                  name: 'Privacy',      routePath: '/privacy' },
  { keywords: ['testimonial', 'review', 'social proof'],                      name: 'Testimonials', routePath: '/testimonials' },
  { keywords: ['feature', 'features'],                                        name: 'Features',     routePath: '/features' },
]

/**
 * Maps frontendScope string[] to DynamicPage[] using keyword matching.
 * Deduplicates by page name so the same page is never generated twice.
 * Exported for testing.
 */
export function parseDynamicPages(frontendScope: string[]): DynamicPage[] {
  const seen = new Set<string>()
  const pages: DynamicPage[] = []

  for (const scopeItem of frontendScope) {
    const lower = scopeItem.toLowerCase()
    for (const entry of SCOPE_TO_PAGE) {
      if (seen.has(entry.name)) continue
      const matched = entry.keywords.some(kw => lower.includes(kw))
      if (matched) {
        seen.add(entry.name)
        pages.push({
          name: entry.name,
          relativePath: `src/pages/${entry.name}.tsx`,
          routePath: entry.routePath,
          scopeItem,
        })
        break
      }
    }
  }

  return pages
}

// ─── File spec interface ──────────────────────────────────────

interface FileSpec {
  relativePath: string
  description: string
  generate: () => Promise<string>
  isTemplate: boolean
}

// ─── File spec builder ────────────────────────────────────────

/** Exported for testing — returns spec list without executing generate() */
export function buildFileSpecs(
  project: CodeGenProject,
  projectType: ProjectType,
  onFileToken?: (path: string, delta: string) => void,
): FileSpec[] {
  const hasAuth = project.features.some(f => /auth|login|register|user/i.test(f))
  const hasDashboard = project.features.some(f => /dashboard|admin|panel/i.test(f))
  const hasDB = (project.techStack.database?.length ?? 0) > 0
  const hasServer = project.backendScope.length > 0

  // ── Belt-and-suspenders integration detection ──────────────
  // The AI planner sometimes omits integrations from the integrations[] array
  // even when the user clearly mentioned them. We scan ALL plan fields so that
  // Supabase/Stripe files are always generated when the keyword appears anywhere.
  const allPlanText = [
    ...project.integrations,
    ...project.features,
    ...project.frontendScope,
    ...project.backendScope,
    project.summary,
    // techStack values may be string[] or string
    ...Object.values(project.techStack).flatMap(v =>
      Array.isArray(v) ? v : (v != null ? [String(v)] : [])
    ),
  ].join(' ').toLowerCase()

  const hasSupabase = /supabase/.test(allPlanText)
  const hasStripe = /stripe/.test(allPlanText)
  const dynamicPages = parseDynamicPages(project.frontendScope)

  // Helper: returns a per-file token callback if streaming is enabled
  const tok = (path: string) => onFileToken ? (delta: string) => onFileToken(path, delta) : undefined

  const specs: FileSpec[] = [
    // ── Config files (templates, fast) ──
    { relativePath: 'package.json', description: 'Package manifest', isTemplate: true,
      generate: async () => templatePackageJson(project) },
    { relativePath: 'tsconfig.json', description: 'TypeScript config', isTemplate: true,
      generate: async () => templateTsConfig() },
    { relativePath: 'vite.config.ts', description: 'Vite config', isTemplate: true,
      generate: async () => templateViteConfig() },
    { relativePath: 'index.html', description: 'HTML entry point', isTemplate: true,
      generate: async () => templateIndexHtml(project) },
    { relativePath: 'postcss.config.js', description: 'PostCSS config', isTemplate: true,
      generate: async () => templatePostcssConfig() },
    { relativePath: '.gitignore', description: 'Git ignore rules', isTemplate: true,
      generate: async () => templateGitignore() },
    { relativePath: '.env.example', description: 'Environment template', isTemplate: true,
      generate: async () => templateEnvExample(project) },
    { relativePath: 'README.md', description: 'Project readme', isTemplate: true,
      generate: async () => templateReadme(project) },
    { relativePath: 'tailwind.config.ts', description: 'Tailwind CSS config', isTemplate: true,
      generate: async () => templateTailwindConfig(projectType) },
    { relativePath: 'src/index.css', description: 'Global CSS', isTemplate: true,
      generate: async () => templateIndexCss(projectType) },
    // ── Frontend entry ──
    { relativePath: 'src/main.tsx', description: 'React entry point', isTemplate: true,
      generate: async () => templateMainTsx() },
    { relativePath: 'src/lib/api.ts', description: 'API client', isTemplate: true,
      generate: async () => templateApiClient() },
    // ── Supabase client + OAuth callback page (when supabase in integrations) ──
    ...(hasSupabase ? [
      {
        relativePath: 'src/lib/supabase.ts',
        description: 'Supabase browser client singleton',
        isTemplate: true as const,
        generate: async () => templateSupabaseClient(),
      },
      {
        // AuthCallback handles the /auth/callback redirect from Supabase OAuth.
        // Without this page, Google/GitHub OAuth login lands on a blank/404 page.
        relativePath: 'src/pages/AuthCallback.tsx',
        description: 'Supabase OAuth callback handler',
        isTemplate: true as const,
        generate: async () => templateAuthCallbackPage(),
      },
    ] : []),
    // ── AI-generated frontend ──
    { relativePath: 'src/App.tsx', description: 'App router', isTemplate: false,
      generate: async () => {
        const ai = await generateFileWithAI(promptAppTsx(project, projectType, dynamicPages, hasSupabase), 4096, tok('src/App.tsx'))
        // Pass hasSupabase so fallback includes /auth/callback route + AuthCallbackPage import
        return ai ?? fallbackAppTsx(project, hasAuth, hasDashboard, dynamicPages, hasSupabase)
      }},
    { relativePath: 'src/components/Header.tsx', description: 'Navigation header', isTemplate: false,
      generate: async () => {
        const ai = await generateFileWithAI(promptHeader(project, projectType), 4096, tok('src/components/Header.tsx'))
        return ai ?? fallbackHeader(project, hasAuth, projectType)
      }},
    { relativePath: 'src/pages/Home.tsx', description: 'Home/landing page', isTemplate: false,
      generate: async () => {
        const ai = await generateFileWithAI(promptHomePage(project, projectType), 8192, tok('src/pages/Home.tsx'))
        return ai ?? fallbackHomePage(project, projectType)
      }},
  ]

  if (hasAuth) {
    if (hasSupabase) {
      // Supabase projects: use deterministic templates for Login/Register.
      // The AI reliably ignores Supabase-specific instructions and generates JWT auth,
      // so templates are the only reliable way to guarantee OAuth buttons + Supabase calls.
      specs.push(
        { relativePath: 'src/pages/Login.tsx', description: 'Login page (Supabase + OAuth)', isTemplate: true,
          generate: async () => templateLoginPageSupabase() },
        { relativePath: 'src/pages/Register.tsx', description: 'Register page (Supabase + OAuth)', isTemplate: true,
          generate: async () => templateRegisterPageSupabase() },
      )
    } else {
      specs.push(
        { relativePath: 'src/pages/Login.tsx', description: 'Login page', isTemplate: false,
          generate: async () => {
            const ai = await generateFileWithAI(promptLoginPage(project, projectType), 4096, tok('src/pages/Login.tsx'))
            return ai ?? fallbackLoginPage(project)
          }},
        { relativePath: 'src/pages/Register.tsx', description: 'Register page', isTemplate: false,
          generate: async () => {
            const ai = await generateFileWithAI(promptRegisterPage(project, projectType), 4096, tok('src/pages/Register.tsx'))
            return ai ?? fallbackRegisterPage(project)
          }},
      )
    }
  }

  if (hasDashboard || hasAuth) {
    specs.push(
      { relativePath: 'src/pages/Dashboard.tsx', description: 'Dashboard page', isTemplate: false,
        generate: async () => {
          const ai = await generateFileWithAI(promptDashboard(project, projectType), 8192, tok('src/pages/Dashboard.tsx'))
          return ai ?? fallbackDashboard(project)
        }},
    )
  }

  // ── Dynamic pages from frontendScope ──
  for (const dp of dynamicPages) {
    const captured = dp
    specs.push({
      relativePath: captured.relativePath,
      description: `${captured.name} page (from scope: "${captured.scopeItem}")`,
      isTemplate: false,
      generate: async () => {
        const ai = await generateFileWithAI(promptGenericPage(project, captured, projectType), 3500, tok(captured.relativePath))
        return ai ?? fallbackGenericPage(project, captured)
      },
    })
  }

  if (hasServer) {
    specs.push(
      // server/tsconfig.json — TypeScript config for the server/ directory.
      // Provides @types/node for process, Buffer, __dirname etc.
      { relativePath: 'server/tsconfig.json', description: 'Server TypeScript config', isTemplate: true,
        generate: async () => templateServerTsConfig() },
      // Auth middleware lives at server/middleware/auth.ts so server/routes/* can import
      // from '../middleware/auth' (relative to server/routes/).
      // Previously generated at src/middleware/auth.ts — wrong path, caused import failures.
      { relativePath: 'server/middleware/auth.ts', description: 'Auth middleware', isTemplate: true,
        generate: async () => templateAuthMiddleware() },
      { relativePath: 'server/index.ts', description: 'Express server', isTemplate: false,
        generate: async () => {
          // Use Stripe-aware server index prompt when Stripe is in integrations
          const prompt = hasStripe
            ? promptServerIndexWithStripe(project)
            : promptServerIndex(project)
          const ai = await generateFileWithAI(prompt, 4096, tok('server/index.ts'))
          return ai ?? fallbackServerIndex(project)
        }},
      { relativePath: 'server/routes/api.ts', description: 'API routes', isTemplate: false,
        generate: async () => {
          const ai = await generateFileWithAI(promptApiRoutes(project), 4096, tok('server/routes/api.ts'))
          return ai ?? fallbackApiRoutes(project)
        }},
    )
    if (hasAuth) {
      specs.push(
        { relativePath: 'server/routes/auth.ts', description: 'Auth routes', isTemplate: false,
          generate: async () => {
            const ai = await generateFileWithAI(promptAuthRoutes(project), 4096, tok('server/routes/auth.ts'))
            return ai ?? fallbackAuthRoutes()
          }},
      )
    }
    // server/lib/prisma.ts — singleton Prisma client imported by all server routes.
    // Generated whenever there is a backend (auth routes always import prisma).
    if (hasDB || hasAuth) {
      specs.push(
        { relativePath: 'server/lib/prisma.ts', description: 'Prisma client singleton', isTemplate: true,
          generate: async () => templatePrismaClient() },
      )
    }
    // Stripe routes — checkout session, customer portal, webhook handler.
    // AI-generated with promptStripeRoutes; templateStripeRoutes() is the fallback.
    if (hasStripe) {
      specs.push(
        { relativePath: 'server/routes/stripe.ts', description: 'Stripe checkout + webhook routes', isTemplate: false,
          generate: async () => {
            const ai = await generateFileWithAI(promptStripeRoutes(project), 3500, tok('server/routes/stripe.ts'))
            return ai ?? templateStripeRoutes()
          }},
      )
    }
  }

  if (hasDB) {
    specs.push(
      { relativePath: 'prisma/schema.prisma', description: 'Prisma schema', isTemplate: false,
        generate: async () => {
          const ai = await generateFileWithAI(promptPrismaSchema(project), 4096, tok('prisma/schema.prisma'))
          let schema = ai ?? fallbackPrismaSchema(project)
          // Post-process: if Stripe is detected but AI forgot the Subscription model, append it.
          // This is the most reliable fix — the AI prompt already asks for it, but this is
          // a guaranteed safety net that runs regardless of what the AI returned.
          if (hasStripe && !/model\s+Subscription\s*\{/i.test(schema)) {
            schema = schema.trimEnd() + '\n' + templateSubscriptionModel()
          }
          return schema
        }},
    )
  }

  return specs
}

// ─── Main export ──────────────────────────────────────────────

// Overall generation timeout: if the entire AI generation phase exceeds this,
// remaining files use template fallbacks. Prevents the build from hanging forever.
// Reduced from 180s to 90s — if AI is working, most files generate in 5-15s each.
const OVERALL_AI_GENERATION_TIMEOUT_MS = 120_000 // 120 seconds for all AI files

export async function generateProjectFiles(
  workspaceId: string,
  project: CodeGenProject,
  callbacks: CodeGenCallbacks,
): Promise<GeneratedFile[]> {
  const genStart = Date.now()
  console.log(`[CodeGen] ═══ generateProjectFiles START ═══`)

  const projectType = detectProjectType(
    project.frontendScope,
    project.summary,
    project.features,
  )

  // Re-derive integration flags at generateProjectFiles scope so retry/validation
  // blocks can reference them. These mirror the logic inside buildFileSpecs().
  const allPlanText = [
    ...project.integrations,
    ...project.features,
    ...project.frontendScope,
    ...project.backendScope,
    project.summary,
    ...Object.values(project.techStack).flatMap(v =>
      Array.isArray(v) ? v : (v != null ? [String(v)] : [])
    ),
  ].join(' ').toLowerCase()

  const specs = buildFileSpecs(project, projectType, callbacks.onFileToken
    ? (path, delta) => callbacks.onFileToken!(path, delta)
    : undefined)
  const templateSpecs = specs.filter(s => s.isTemplate)
  const aiSpecs = specs.filter(s => !s.isTemplate)

  console.log(`[CodeGen] Specs built: ${templateSpecs.length} templates, ${aiSpecs.length} AI files`)

  const generated: GeneratedFile[] = []

  // ── Phase 1: Templates (fast, deterministic) ─────────────────
  console.log(`[CodeGen] ── Phase 1: Templates (${templateSpecs.length} files) ──`)
  await callbacks.onPhaseStart('templates', templateSpecs.length)

  for (const spec of templateSpecs) {
    await callbacks.onFileStart(spec.relativePath, spec.description)
    try {
      const content = await spec.generate()
      writeWorkspaceFile(workspaceId, spec.relativePath, content)
      const bytes = Buffer.byteLength(content, 'utf8')
      generated.push({ relativePath: spec.relativePath, content, generatedBy: 'template', bytes })
      await callbacks.onFileComplete(spec.relativePath, bytes, 'template')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[CodeGen] Template error for ${spec.relativePath}: ${msg}`)
      await callbacks.onFileError(spec.relativePath, msg)
    }
  }

  const templateMs = Date.now() - genStart
  console.log(`[CodeGen] ── Templates done in ${templateMs}ms ──`)

  // ── Phase 2: AI-generated files (with aggressive timeouts) ───
  console.log(`[CodeGen] ── Phase 2: AI files (${aiSpecs.length} files) ──`)
  await callbacks.onPhaseStart('ai', aiSpecs.length)

  // Reset the module-level flags at the start of each build
  _forceTemplateFallback = false
  _consecutiveAiFailures = 0

  const aiPhaseStart = Date.now()
  let aiTimedOut = false

  for (let i = 0; i < aiSpecs.length; i++) {
    const spec = aiSpecs[i]
    console.log(`[CodeGen] AI file ${i + 1}/${aiSpecs.length}: ${spec.relativePath} (fallback=${_forceTemplateFallback})`)
    await callbacks.onFileStart(spec.relativePath, spec.description)

    // Check overall AI budget before each file
    const aiElapsed = Date.now() - aiPhaseStart
    if (aiElapsed > OVERALL_AI_GENERATION_TIMEOUT_MS && !aiTimedOut) {
      aiTimedOut = true
      _forceTemplateFallback = true
      console.warn(`[CodeGen] Overall AI timeout (${OVERALL_AI_GENERATION_TIMEOUT_MS / 1000}s) exceeded at file ${i + 1}/${aiSpecs.length} — forcing template fallback`)
    }

    try {
      const wasFallbackBefore = _forceTemplateFallback
      const fileStart = Date.now()
      const content = await spec.generate()
      const fileMs = Date.now() - fileStart
      console.log(`[CodeGen]   → ${spec.relativePath} generated in ${fileMs}ms (${content.length} chars)`)

      writeWorkspaceFile(workspaceId, spec.relativePath, content)
      const bytes = Buffer.byteLength(content, 'utf8')
      // If fallback was already forced before generate(), this file used a template.
      const generatedBy = spec.isTemplate || wasFallbackBefore ? 'template' : 'ai'
      generated.push({ relativePath: spec.relativePath, content, generatedBy, bytes })
      await callbacks.onFileComplete(spec.relativePath, bytes, generatedBy)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[CodeGen]   ✗ ${spec.relativePath} FAILED: ${msg}`)
      await callbacks.onFileError(spec.relativePath, msg)
    }
  }

  const totalMs = Date.now() - genStart
  const aiPhaseDurationMs = Date.now() - aiPhaseStart
  const aiFileCount = generated.filter(f => f.generatedBy === 'ai').length
  const templateFallbackCount = generated.filter(f => f.generatedBy === 'template').length - templateSpecs.length
  console.log(
    `[CodeGen] ═══ generateProjectFiles DONE in ${(totalMs / 1000).toFixed(1)}s ═══\n` +
    `  Templates: ${templateSpecs.length} files in ${templateMs}ms\n` +
    `  AI phase: ${(aiPhaseDurationMs / 1000).toFixed(1)}s — ${aiFileCount} AI, ${templateFallbackCount} fell back to templates` +
    (aiTimedOut ? ' (timeout reached)' : '')
  )

  // ── Phase 3: Integration validation (cross-file, log-only) ──
  if (generated.length > 0) {
    try {
      const integrationResult = validateAllIntegrations(
        generated.map(f => ({ relativePath: f.relativePath, content: f.content })),
        project.integrations,
        workspaceId,
      )

      if (!integrationResult.valid) {
        console.log(`[CodeGen] Integration validation: ${integrationResult.errors.length} issue(s) (will be handled by builderQueue self-healing)`)
        for (const error of integrationResult.errors) {
          if (callbacks.onValidationError) {
            await callbacks.onValidationError(error)
          }
        }
      }
    } catch (ivErr) {
      console.warn(`[CodeGen] Integration validation error (non-fatal): ${ivErr instanceof Error ? ivErr.message : ivErr}`)
    }
  }

  // Reset flags so future builds (repair, continuation) can use AI again
  _forceTemplateFallback = false
  _consecutiveAiFailures = 0

  return generated
}

export async function repairProjectFiles(
  workspacePath: string,
  project: CodeGenProject,
  filesToRepair: string[],
  callbacks: CodeGenCallbacks,
): Promise<GeneratedFile[]> {
  const projectType = detectProjectType(
    project.frontendScope,
    project.summary,
    project.features,
  )

  const specs = buildFileSpecs(project, projectType, callbacks.onFileToken
    ? (path, delta) => callbacks.onFileToken!(path, delta)
    : undefined)
  const generated: GeneratedFile[] = []
  const uniqueTargets = Array.from(new Set(filesToRepair))

  await callbacks.onPhaseStart('repair', uniqueTargets.length)

  for (const target of uniqueTargets) {
    const spec = specs.find(s => s.relativePath === target)
    if (!spec) {
      await callbacks.onFileStart(target, 'Targeted repair (unmapped file)')
      await callbacks.onFileError(target, `No generator spec found for ${target}`)
      continue
    }

    await callbacks.onFileStart(spec.relativePath, `Targeted repair: ${spec.description}`)
    try {
      const content = await spec.generate()
      await writeWorkspaceFile(workspacePath, spec.relativePath, content)
      const bytes = Buffer.byteLength(content, 'utf8')
      const generatedBy = content.includes('// fallback') ? 'template' : 'ai'
      generated.push({ relativePath: spec.relativePath, content, generatedBy, bytes })
      await callbacks.onFileComplete(spec.relativePath, bytes, generatedBy)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[CodeGen] Repair error for ${spec.relativePath}: ${msg}`)
      await callbacks.onFileError(spec.relativePath, msg)
    }
  }

  return generated
}
