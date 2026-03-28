/**
 * env.ts — MUST be imported first in index.ts
 *
 * Loads .env.local from the project root before any other module
 * reads process.env. TypeScript hoists all imports, so this file
 * must be the very first import in index.ts to guarantee env vars
 * are set before providers.ts / other modules read them at load time.
 */
import path from 'path'
import dotenv from 'dotenv'

// Server runs from apps/server/ → project root is two levels up
const rootDir = path.resolve(process.cwd(), '../..')
const loaded: string[] = []

const r1 = dotenv.config({ path: path.resolve(rootDir, '.env.local') })
if (!r1.error) loaded.push(path.resolve(rootDir, '.env.local'))

const r2 = dotenv.config({ path: path.resolve(rootDir, '.env') })
if (!r2.error) loaded.push(path.resolve(rootDir, '.env'))

// Fallback: one level up (in case cwd is already at apps/)
const r3 = dotenv.config({ path: path.resolve(process.cwd(), '../.env.local') })
if (!r3.error && !loaded.length) loaded.push(path.resolve(process.cwd(), '../.env.local'))

console.log('[Env] rootDir:', rootDir)
console.log('[Env] cwd:', process.cwd())
console.log('[Env] loaded from:', loaded.length ? loaded.join(', ') : 'none (already set or file missing)')
console.log('[Env] OPEN_ROUTER_API_KEY:', process.env.OPEN_ROUTER_API_KEY ? '***SET***' : 'NOT SET')
console.log('[Env] LANGDOCK_API_KEY:', (process.env.LANGDOCK_API_KEY ?? process.env.VITE_LANGDOCK_API_KEY) ? '***SET***' : 'NOT SET')
console.log('[Env] BLACKBOX_KEYS:', (process.env.BLACKBOX_KEYS ?? process.env.VITE_BLACKBOX_KEYS) ? `***SET*** (${(process.env.BLACKBOX_KEYS ?? process.env.VITE_BLACKBOX_KEYS ?? '').split(',').filter(Boolean).length} keys)` : 'NOT SET')
console.log('[Env] BLACKBOX_ENDPOINT:', process.env.BLACKBOX_ENDPOINT ?? process.env.VITE_BLACKBOX_ENDPOINT ?? 'default (api.blackbox.ai)')
console.log('[Env] BLACKBOX_MODEL:', process.env.BLACKBOX_MODEL ?? 'default (blackboxai/arcee-ai/trinity-large-preview:free)')
console.log('[Env] PLANNER_PROVIDER:', process.env.PLANNER_PROVIDER ?? 'default (blackbox)')
console.log('[Env] OPENCLAW_BASE_URL:', process.env.OPENCLAW_BASE_URL ?? 'default')
console.log('[Env] LANGDOCK_BASE_URL:', process.env.LANGDOCK_BASE_URL ?? 'default (https://api.langdock.com/openai/eu/v1)')
console.log('[Env] LANGDOCK_MODEL_PRIMARY:', process.env.LANGDOCK_MODEL_PRIMARY ?? 'default (GPT-5.2 Thinking)')
console.log('[Env] DISABLE_LANGDOCK:', process.env.DISABLE_LANGDOCK ?? 'not set')
console.log('[Env] WORKER_PRIMARY_URL:', process.env.WORKER_PRIMARY_URL ?? 'not set (local-only mode)')
console.log('[Env] WORKER_PRIMARY_NAME:', process.env.WORKER_PRIMARY_NAME ?? 'primary')
console.log('[Env] WORKER_FAILOVER_URL:', process.env.WORKER_FAILOVER_URL ?? 'not set')
console.log('[Env] WORKER_FAILOVER_NAME:', process.env.WORKER_FAILOVER_NAME ?? 'failover')
console.log('[Env] WORKER_INTERNAL_SECRET:', process.env.WORKER_INTERNAL_SECRET ? '***SET***' : 'NOT SET (internal relay disabled)')
console.log('[Env] DIFY_MOCK_MODE:', process.env.DIFY_MOCK_MODE ?? 'not set (defaults to false)')
console.log('[Env] DIFY_API_KEY:', process.env.DIFY_API_KEY ? '***SET***' : 'NOT SET')
console.log('[Env] DIFY_BASE_URL:', process.env.DIFY_BASE_URL ?? 'not set (defaults to https://api.dify.ai/v1)')
console.log('[Env] DIFY_WORKFLOW_LANDING_PAGE:', process.env.DIFY_WORKFLOW_LANDING_PAGE ?? 'not set')
console.log('[Env] DIFY_WORKFLOW_SAAS:', process.env.DIFY_WORKFLOW_SAAS ?? 'not set')
console.log('[Env] DIFY_WORKFLOW_STRIPE_AUTH_SUPABASE:', process.env.DIFY_WORKFLOW_STRIPE_AUTH_SUPABASE ?? 'not set')
console.log('[Env] SUPABASE_URL:', process.env.SUPABASE_URL ?? 'NOT SET')
console.log('[Env] SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '***SET***' : 'NOT SET')

// ─── Multi-Agent System ──────────────────────────────────────
console.log('[Env] === Multi-Agent System ===')
console.log('[Env] HUGGING_FACE_TOKEN:', process.env.HUGGING_FACE_TOKEN ? '***SET***' : 'NOT SET')
console.log('[Env] CODESTRAL_API:', process.env.CODESTRAL_API ? '***SET***' : 'NOT SET')
console.log('[Env] Planner_Agent_ID:', process.env.Planner_Agent_ID ? process.env.Planner_Agent_ID.slice(0, 8) + '...' : 'NOT SET')
console.log('[Env] Installer_Environmental_Agent_ID:', process.env.Installer_Environmental_Agent_ID ? process.env.Installer_Environmental_Agent_ID.slice(0, 8) + '...' : 'NOT SET')
console.log('[Env] Frontend_Agent_ID:', process.env.Frontend_Agent_ID ? process.env.Frontend_Agent_ID.slice(0, 8) + '...' : 'NOT SET')
console.log('[Env] Backend_Agent_ID:', process.env.Backend_Agent_ID ? process.env.Backend_Agent_ID.slice(0, 8) + '...' : 'NOT SET')
console.log('[Env] Fixer_Agent_ID:', process.env.Fixer_Agent_ID ? process.env.Fixer_Agent_ID.slice(0, 8) + '...' : 'NOT SET')
console.log('[Env] QA_Validation_Hardening_Agent_ID:', process.env.QA_Validation_Hardening_Agent_ID ? process.env.QA_Validation_Hardening_Agent_ID.slice(0, 8) + '...' : 'NOT SET')
console.log('[Env] DevOps_Agent_ID:', process.env.DevOps_Agent_ID ? process.env.DevOps_Agent_ID.slice(0, 8) + '...' : 'NOT SET')
console.log('[Env] Image_Agent_ID:', process.env.Image_Agent_ID ? process.env.Image_Agent_ID.slice(0, 8) + '...' : 'NOT SET')
console.log('[Env] Android_Agent_ID:', process.env.Android_Agent_ID ? process.env.Android_Agent_ID.slice(0, 8) + '...' : 'NOT SET')
console.log('[Env] iOS_Agent_ID:', process.env.iOS_Agent_ID ? process.env.iOS_Agent_ID.slice(0, 8) + '...' : 'NOT SET')
