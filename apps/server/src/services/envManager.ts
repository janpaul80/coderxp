/**
 * Sprint 19: Environment Manager
 * 
 * Intelligent env var detection, credential handling, preview recovery
 */

import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import { prisma } from '../lib/prisma'

export interface MissingEnv {
  key: string
  purpose: string
  integration: string
  docsUrl?: string
  isRequired: boolean
}

export interface IntegrationConfig {
  name: string
  envVars: MissingEnv[]
  description: string
  autoRecovery?: boolean
}

// Env vars that are always set by Node/Vite or are platform internals — never flag these
const IGNORED_ENV_KEYS = new Set([
  'NODE_ENV', 'PORT', 'HOST', 'VITE_PORT', 'FORCE_COLOR', 'HOME', 'PATH',
  'SHELL', 'USER', 'LANG', 'TZ', 'CI', 'PWD', 'TERM', 'EDITOR',
  'BASE_URL', 'DEV', 'PROD', 'SSR', 'MODE',
])

/**
 * Detect missing env vars from workspace files.
 * Scans .env.example, process.env.*, and import.meta.env.* references.
 * Ignores platform-internal vars (NODE_ENV, PORT, etc.).
 */
export async function detectMissingEnv(workspacePath: string): Promise<MissingEnv[]> {
  let allFiles: string[]
  try {
    allFiles = fs.readdirSync(workspacePath, { recursive: true })
      .map(f => String(f))
      .filter(f => {
        // Skip node_modules, .git, dist
        if (f.includes('node_modules') || f.includes('.git') || f.includes('dist')) return false
        const full = path.join(workspacePath, f)
        try { return fs.statSync(full).isFile() } catch { return false }
      })
      .map(f => path.join(workspacePath, f))
  } catch {
    return []
  }

  const missing: MissingEnv[] = []
  const seen = new Set<string>()

  function addMissing(env: MissingEnv) {
    if (seen.has(env.key) || IGNORED_ENV_KEYS.has(env.key)) return
    seen.add(env.key)
    missing.push(env)
  }

  // 1. Parse .env.example for expected vars
  const envExample = allFiles.find(f => f.endsWith('.env.example'))
  if (envExample) {
    const content = fs.readFileSync(envExample, 'utf8')
    content.split('\n').forEach(line => {
      const match = line.match(/^([A-Z][A-Z0-9_]+)=/)
      if (match) {
        addMissing({
          key: match[1],
          purpose: 'Listed in .env.example',
          integration: classifyEnvKey(match[1]),
          isRequired: !line.startsWith('#'),
        })
      }
    })
  }

  // 2. Code scanning for process.env.* and import.meta.env.*
  const codeFiles = allFiles.filter(f => /\.(ts|tsx|js|jsx|mjs)$/.test(f))
  for (const file of codeFiles) {
    let content: string
    try { content = fs.readFileSync(file, 'utf8') } catch { continue }
    const relPath = path.relative(workspacePath, file).replace(/\\/g, '/')

    // process.env.KEY
    const processEnvMatches = content.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)
    for (const m of processEnvMatches) {
      addMissing({
        key: m[1],
        purpose: `Referenced in ${relPath}`,
        integration: classifyEnvKey(m[1]),
        isRequired: true,
      })
    }

    // import.meta.env.VITE_KEY (Vite apps)
    const viteEnvMatches = content.matchAll(/import\.meta\.env\.([A-Z][A-Z0-9_]+)/g)
    for (const m of viteEnvMatches) {
      addMissing({
        key: m[1],
        purpose: `Referenced in ${relPath}`,
        integration: classifyEnvKey(m[1]),
        isRequired: true,
      })
    }
  }

  // 3. Integration-specific detection (adds known env vars for detected SDKs)
  const integrations = await detectRequiredIntegrations(workspacePath)
  integrations.forEach(int => {
    int.envVars.forEach(env => addMissing(env))
  })

  return missing
}

/** Classify an env key into an integration name for UI grouping */
function classifyEnvKey(key: string): string {
  const k = key.toLowerCase()
  if (k.includes('supabase')) return 'supabase'
  if (k.includes('stripe')) return 'stripe'
  if (k.includes('database_url') || k.includes('prisma')) return 'database'
  if (k.includes('openai')) return 'openai'
  if (k.includes('firebase')) return 'firebase'
  if (k.includes('auth') || k.includes('jwt') || k.includes('secret')) return 'auth'
  if (k.includes('aws') || k.includes('s3')) return 'aws'
  if (k.includes('redis')) return 'redis'
  if (k.startsWith('vite_')) return 'vite'
  if (k.startsWith('next_public_')) return 'next'
  return 'generic'
}

/**
 * Detect integrations from code and generate required env vars
 */
async function detectRequiredIntegrations(workspacePath: string): Promise<IntegrationConfig[]> {
  const required: IntegrationConfig[] = []
  const seenIntegrations = new Set<string>()

  let allFiles: string[]
  try {
    allFiles = fs.readdirSync(workspacePath, { recursive: true })
      .map(f => String(f))
      .filter(f => /\.(ts|tsx|js|jsx)$/.test(f) && !f.includes('node_modules'))
  } catch { return [] }

  for (const file of allFiles) {
    let content: string
    try { content = fs.readFileSync(path.join(workspacePath, file), 'utf8') } catch { continue }
    
    // Supabase
    if (!seenIntegrations.has('supabase') && (content.includes('supabase') || content.includes('SUPABASE_URL'))) {
      seenIntegrations.add('supabase')
      required.push({
        name: 'Supabase',
        envVars: [
          { key: 'NEXT_PUBLIC_SUPABASE_URL', purpose: 'Supabase project URL', integration: 'supabase', isRequired: true, docsUrl: 'https://supabase.com/docs/guides/auth/server-side' },
          { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', purpose: 'Supabase anon key', integration: 'supabase', isRequired: true },
        ],
        description: 'Database + Auth',
        autoRecovery: false
      })
    }

    // Prisma/PostgreSQL
    if (!seenIntegrations.has('prisma') && (content.includes('prisma') || content.includes('DATABASE_URL'))) {
      seenIntegrations.add('prisma')
      required.push({
        name: 'Prisma/PostgreSQL',
        envVars: [
          { key: 'DATABASE_URL', purpose: 'PostgreSQL connection string', integration: 'prisma', isRequired: true, docsUrl: 'https://prisma.io/docs' },
        ],
        description: 'Database ORM',
        autoRecovery: false
      })
    }

    // Stripe
    if (!seenIntegrations.has('stripe') && (content.includes('stripe') || content.includes('STRIPE_SECRET_KEY'))) {
      seenIntegrations.add('stripe')
      required.push({
        name: 'Stripe',
        envVars: [
          { key: 'STRIPE_SECRET_KEY', purpose: 'Stripe secret key', integration: 'stripe', isRequired: true },
          { key: 'STRIPE_WEBHOOK_SECRET', purpose: 'Stripe webhook secret', integration: 'stripe', isRequired: true },
        ],
        description: 'Payments',
        autoRecovery: false
      })
    }
  }

  return required
}

/**
 * Generate .env.example with detected requirements
 */
export function generateEnvExample(missingEnv: MissingEnv[]): string {
  const example = [
    '# Generated by CoderXP - Environment Configuration',
    '',
    '# Database',
    'DATABASE_URL="postgresql://user:pass@localhost:5432/dbname"',
    '',
    '# Supabase (if used)',
    '# NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"',
    '# NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"',
    '',
    '# Stripe (if used)',
    '# STRIPE_SECRET_KEY="sk_test_..."',
    '# STRIPE_WEBHOOK_SECRET="whsec_..."',
    '',
    '# Preview server (auto-configured)',
    'VITE_PORT=5173'
  ].join('\n')

  return example
}

/**
 * Auto-recover common preview issues
 */
export async function autoRecoverPreview(workspacePath: string, jobId: string): Promise<boolean> {
  const issues = await detectMissingEnv(workspacePath)
  
  if (issues.length === 0) return false

  // Generate .env.example for user
  const envExample = generateEnvExample(issues)
  fs.writeFileSync(path.join(workspacePath, '.env.example'), envExample)

  // Try common fixes (pnpm preferred for speed/reliability)
  const hasPnpm = (() => { try { execSync('pnpm --version', { stdio: 'ignore', timeout: 5000 }); return true } catch { return false } })()
  const reinstallCmd = hasPnpm
    ? 'rm -rf node_modules pnpm-lock.yaml && pnpm install --no-frozen-lockfile --no-strict-peer-dependencies'
    : 'rm -rf node_modules package-lock.json && npm install'
  const recoverySteps = [
    // Clean cache
    () => execSync(hasPnpm ? 'pnpm store prune' : 'npm cache clean --force', { cwd: workspacePath, stdio: 'ignore' }),
    // Delete node_modules + reinstall
    () => execSync(reinstallCmd, { cwd: workspacePath, stdio: 'ignore', timeout: 180000, env: { ...process.env, NODE_ENV: 'development' } }),
  ]

  let success = false
  for (let i = 0; i < recoverySteps.length; i++) {
    try {
      recoverySteps[i]()
      success = true
      break
    } catch {
      // Continue to next recovery step
    }
  }

  return success
}

