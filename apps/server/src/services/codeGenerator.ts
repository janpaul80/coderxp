/**
 * codeGenerator.ts — AI-powered code generation engine
 *
 * Generates production-quality, complete code for each project file
 * using the Blackbox AI API. Falls back to enhanced templates if AI unavailable.
 */

import { complete, completeStream, isProviderAvailable } from '../lib/providers'
import { detectProjectType, type ProjectType } from './designSystem'
import { writeWorkspaceFile } from './workspace'
import { validateFile, validateTypeScript, formatValidationErrors, generateErrorContext, ValidationError } from './codeValidation'
import { validateIntegrations, validateAllIntegrations, generateIntegrationErrorContext } from './integrationValidation'

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

async function generateFileWithAI(
  userPrompt: string,
  maxTokens = 8192,
  onToken?: (delta: string) => void,
): Promise<string | null> {
  if (
    !isProviderAvailable('blackbox') &&
    !isProviderAvailable('openrouter') &&
    !isProviderAvailable('openclaw') &&
    !isProviderAvailable('langdock')
  ) {
    return null
  }
  try {
    let rawContent: string
    if (onToken) {
      const result = await completeStream({
        role: 'maxclaw',
        systemPrompt: AI_SYSTEM_PROMPT,
        userPrompt,
        onToken,
        temperature: 0.25,
        maxTokens,
      })
      rawContent = result.content.trim()
    } else {
      const result = await complete({
        role: 'maxclaw',
        systemPrompt: AI_SYSTEM_PROMPT,
        userPrompt,
        temperature: 0.25,
        maxTokens,
      })
      rawContent = result.content.trim()
    }
    return extractCode(rawContent)
  } catch (err) {
    console.warn(`[CodeGen] AI generation failed: ${err instanceof Error ? err.message : err}`)
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

export async function generateProjectFiles(
  workspaceId: string,
  project: CodeGenProject,
  callbacks: CodeGenCallbacks,
): Promise<GeneratedFile[]> {
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
  const hasSupabase = /supabase/.test(allPlanText)
  const hasStripe = /stripe/.test(allPlanText)
  const dynamicPages = parseDynamicPages(project.frontendScope)

  // Helper: returns a per-file token callback if streaming is enabled
  const tok = (filePath: string) => callbacks.onFileToken
    ? (delta: string) => callbacks.onFileToken!(filePath, delta)
    : undefined

  const specs = buildFileSpecs(project, projectType, callbacks.onFileToken
    ? (path, delta) => callbacks.onFileToken!(path, delta)
    : undefined)
  const templateSpecs = specs.filter(s => s.isTemplate)
  const aiSpecs = specs.filter(s => !s.isTemplate)

  const generated: GeneratedFile[] = []

  // Phase 1: Templates (fast, deterministic)
  await callbacks.onPhaseStart('templates', templateSpecs.length)
  for (const spec of templateSpecs) {
    await callbacks.onFileStart(spec.relativePath, spec.description)
    try {
      const content = await spec.generate()
      await writeWorkspaceFile(workspaceId, spec.relativePath, content)
      const bytes = Buffer.byteLength(content, 'utf8')
      generated.push({ relativePath: spec.relativePath, content, generatedBy: 'template', bytes })
      await callbacks.onFileComplete(spec.relativePath, bytes, 'template')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[CodeGen] Template error for ${spec.relativePath}: ${msg}`)
      await callbacks.onFileError(spec.relativePath, msg)
    }
  }

  // Phase 2: AI-generated files
  await callbacks.onPhaseStart('ai', aiSpecs.length)
  
  // Get package.json content for import validation
  const packageJsonSpec = specs.find(s => s.relativePath === 'package.json')
  let packageJson: Record<string, any> = {}
  if (packageJsonSpec) {
    try {
      const packageJsonContent = await packageJsonSpec.generate()
      packageJson = JSON.parse(packageJsonContent)
    } catch (err) {
      console.warn('[CodeGen] Failed to parse package.json for import validation:', err)
    }
  }
  
  // Get all file paths for import validation
  const allFilePaths = specs.map(s => s.relativePath)
  
  for (const spec of aiSpecs) {
    await callbacks.onFileStart(spec.relativePath, spec.description)
    try {
      // Generate file content
      const content = await spec.generate()
      
      // Validate syntax and imports
      if (spec.relativePath.endsWith('.ts') || spec.relativePath.endsWith('.tsx') || 
          spec.relativePath.endsWith('.js') || spec.relativePath.endsWith('.jsx')) {
        
        const validationResult = validateFile(content, spec.relativePath, allFilePaths, packageJson)
        
        if (!validationResult.valid) {
          // Report validation errors
          for (const error of validationResult.errors) {
            if (callbacks.onValidationError) {
              await callbacks.onValidationError(error)
            }
            console.warn(`[CodeGen] Validation error in ${spec.relativePath}: ${error.message}`)
          }
          
          // Retry generation with error context
          if (validationResult.errors.length > 0) {
            const errorContext = generateErrorContext(validationResult.errors)
            console.log(`[CodeGen] Retrying generation with error context for ${spec.relativePath}`)
            
            // Modify the prompt to include error context
            let retryPrompt = ''
            if (spec.relativePath === 'src/App.tsx') {
              retryPrompt = promptAppTsx(project, projectType, dynamicPages, hasSupabase, errorContext)
            } else if (spec.relativePath === 'src/components/Header.tsx') {
              retryPrompt = promptHeader(project, projectType, errorContext)
            } else if (spec.relativePath === 'src/pages/Home.tsx') {
              retryPrompt = promptHomePage(project, projectType, errorContext)
            } else if (spec.relativePath === 'src/pages/Login.tsx') {
              retryPrompt = promptLoginPage(project, projectType, errorContext)
            } else if (spec.relativePath === 'src/pages/Register.tsx') {
              retryPrompt = promptRegisterPage(project, projectType, errorContext)
            } else if (spec.relativePath === 'src/pages/Dashboard.tsx') {
              retryPrompt = promptDashboard(project, projectType, errorContext)
            } else if (spec.relativePath === 'server/index.ts') {
              retryPrompt = hasStripe 
                ? promptServerIndexWithStripe(project, errorContext)
                : promptServerIndex(project, errorContext)
            } else if (spec.relativePath === 'server/routes/api.ts') {
              retryPrompt = promptApiRoutes(project, errorContext)
            } else if (spec.relativePath === 'server/routes/auth.ts') {
              retryPrompt = promptAuthRoutes(project, errorContext)
            } else if (spec.relativePath === 'prisma/schema.prisma') {
              retryPrompt = promptPrismaSchema(project, errorContext)
            } else if (spec.relativePath.startsWith('src/pages/') && dynamicPages.some(dp => dp.relativePath === spec.relativePath)) {
              const dynamicPage = dynamicPages.find(dp => dp.relativePath === spec.relativePath)!
              retryPrompt = promptGenericPage(project, dynamicPage, projectType, errorContext)
            }
            
            if (retryPrompt) {
              const retryContent = await generateFileWithAI(retryPrompt, 4000, tok(spec.relativePath))
              if (retryContent) {
                // Validate the retry content
                const retryValidation = validateFile(retryContent, spec.relativePath, allFilePaths, packageJson)
                if (retryValidation.valid) {
                  // Use the retry content if it's valid
                  await writeWorkspaceFile(workspaceId, spec.relativePath, retryContent)
                  const bytes = Buffer.byteLength(retryContent, 'utf8')
                  generated.push({ relativePath: spec.relativePath, content: retryContent, generatedBy: 'ai', bytes })
                  await callbacks.onFileComplete(spec.relativePath, bytes, 'ai')
                  continue
                }
              }
            }
          }
        }
      }
      
      // If we get here, either validation passed or retry failed
      await writeWorkspaceFile(workspaceId, spec.relativePath, content)
      const bytes = Buffer.byteLength(content, 'utf8')
      const generatedBy = content.includes('// fallback') ? 'template' : 'ai'
      generated.push({ relativePath: spec.relativePath, content, generatedBy, bytes })
      await callbacks.onFileComplete(spec.relativePath, bytes, generatedBy)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[CodeGen] AI error for ${spec.relativePath}: ${msg}`)
      await callbacks.onFileError(spec.relativePath, msg)
    }
  }

  // ── Phase 3: Integration validation (cross-file) ──────────
  // After all files are generated, validate cross-file integration consistency:
  // API endpoints, data models, and database schema alignment.
  if (generated.length > 0) {
    const integrationResult = validateAllIntegrations(
      generated.map(f => ({ relativePath: f.relativePath, content: f.content })),
      project.integrations,
      workspaceId,
    )

    if (!integrationResult.valid) {
      console.log(`[CodeGen] Integration validation found ${integrationResult.errors.length} issue(s)`)
      for (const error of integrationResult.errors) {
        if (callbacks.onValidationError) {
          await callbacks.onValidationError(error)
        }
        console.warn(`[CodeGen] Integration: ${error.filePath}: ${error.message}`)
      }

      // Build error context and attempt targeted re-generation of affected files
      const integrationErrorContext = generateIntegrationErrorContext(integrationResult.errors)
      const affectedFiles = [...new Set(integrationResult.errors.map(e => e.filePath))]

      for (const affectedFile of affectedFiles) {
        // Only retry AI-generated files (not templates)
        const spec = aiSpecs.find(s => s.relativePath === affectedFile)
        if (!spec) continue

        console.log(`[CodeGen] Retrying ${affectedFile} with integration error context`)
        try {
          let retryPrompt = ''

          if (affectedFile === 'src/App.tsx') {
            retryPrompt = promptAppTsx(project, projectType, dynamicPages, hasSupabase, integrationErrorContext)
          } else if (affectedFile === 'server/index.ts') {
            retryPrompt = hasStripe
              ? promptServerIndexWithStripe(project, integrationErrorContext)
              : promptServerIndex(project, integrationErrorContext)
          } else if (affectedFile === 'server/routes/api.ts') {
            retryPrompt = promptApiRoutes(project, integrationErrorContext)
          } else if (affectedFile === 'server/routes/auth.ts') {
            retryPrompt = promptAuthRoutes(project, integrationErrorContext)
          } else if (affectedFile === 'prisma/schema.prisma') {
            retryPrompt = promptPrismaSchema(project, integrationErrorContext)
          } else if (affectedFile === 'src/pages/Dashboard.tsx') {
            retryPrompt = promptDashboard(project, projectType, integrationErrorContext)
          } else if (affectedFile.startsWith('src/pages/') && dynamicPages.some(dp => dp.relativePath === affectedFile)) {
            const dp = dynamicPages.find(d => d.relativePath === affectedFile)!
            retryPrompt = promptGenericPage(project, dp, projectType, integrationErrorContext)
          }

          if (retryPrompt) {
            const retryContent = await generateFileWithAI(retryPrompt, 4000, tok(affectedFile))
            if (retryContent) {
              await writeWorkspaceFile(workspaceId, affectedFile, retryContent)
              const bytes = Buffer.byteLength(retryContent, 'utf8')
              // Replace the existing entry in generated[]
              const idx = generated.findIndex(g => g.relativePath === affectedFile)
              if (idx >= 0) {
                generated[idx] = { relativePath: affectedFile, content: retryContent, generatedBy: 'ai', bytes }
              }
              console.log(`[CodeGen] Integration retry succeeded for ${affectedFile}`)
            }
          }
        } catch (err) {
          console.warn(`[CodeGen] Integration retry failed for ${affectedFile}: ${err instanceof Error ? err.message : err}`)
        }
      }
    }
  }

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
