// @ts-nocheck — Provider abstraction layer
import { z } from 'zod'

export type ProviderName = 'openrouter' | 'openai' | 'langdock' | 'blackbox' | 'openclaw' | 'none'
export type RoleName = 'planner' | 'openclaw' | 'maxclaw' | 'fallback'

export interface CompletionResult {
content: string
model: string
provider: string
promptTokens: number
completionTokens: number
durationMs: number
rawResponse?: string
}

export interface JSONCompletionResult<T> extends CompletionResult {
parsed: T
parseSuccess: boolean
retryCount: number
}

export class ProviderError extends Error {
public code: string
public provider: string
public statusCode?: number

constructor(message: string, code: string, provider: string, statusCode?: number) {
super(message)
this.name = 'ProviderError'
this.code = code
this.provider = provider
this.statusCode = statusCode
}
}

export interface ProviderOverrides {
forceProvider?: ProviderName
openRouterApiKey?: string
langdockApiKey?: string
langdockAgentId?: string
disableLangdock?: boolean
blackboxKeys?: string[]
blackboxEndpoint?: string
blackboxModel?: string
openclawBaseUrl?: string
openclawModel?: string
plannerProvider?: ProviderName
openclawProvider?: ProviderName
maxclawProvider?: ProviderName
fallbackProvider?: ProviderName
openrouterPlannerModel?: string
openrouterMaxclawModel?: string
langdockAgentIds?: Partial<Record<string, string>>
}

interface ProviderRuntimeConfig {
openRouterApiKey: string
langdockApiKey: string
langdockBaseUrl: string
langdockModel: string
langdockAgentId: string
disableLangdock: boolean
blackboxKeys: string[]
blackboxEndpoint: string
blackboxModel: string
openclawBaseUrl: string
openclawModel: string
plannerProvider: ProviderName
openclawProvider: ProviderName
maxclawProvider: ProviderName
fallbackProvider: ProviderName
openrouterPlannerModel: string
openrouterMaxclawModel: string
langdockAgentIds: Record<string, string>
}

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
let blackboxKeyIndex = 0

// ─── Request timeout ──────────────────────────────────────────
// All provider fetch calls go through fetchWithTimeout to prevent
// hung builds when a provider is unresponsive.

const DEFAULT_FETCH_TIMEOUT_MS = 90_000

async function fetchWithTimeout(
url: string,
init: RequestInit,
timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<Response> {
const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), timeoutMs)
try {
const response = await fetch(url, { ...init, signal: controller.signal })
return response
} catch (err) {
if ((err as Error).name === 'AbortError') {
throw new ProviderError(
`Request timed out after ${timeoutMs}ms`,
'TIMEOUT',
'unknown'
)
}
throw err
} finally {
clearTimeout(timer)
}
}

// ─── Per-provider circuit breaker ────────────────────────────
// Prevents a degraded provider from poisoning every request.
// States: closed (normal) → open (skip) → half_open (probe) → closed

type CBState = 'closed' | 'open' | 'half_open'

class CircuitBreaker {
private failures = 0
private lastFailureAt = 0
private _state: CBState = 'closed'
private readonly threshold: number
private readonly cooldownMs: number

constructor(threshold = 3, cooldownMs = 30_000) {
this.threshold = threshold
this.cooldownMs = cooldownMs
}

isOpen(): boolean {
if (this._state === 'closed') return false
if (this._state === 'open') {
const elapsed = Date.now() - this.lastFailureAt
if (elapsed >= this.cooldownMs) {
this._state = 'half_open'
return false // allow one probe request
}
return true
}
// half_open: allow one probe
return false
}

recordSuccess(): void {
this.failures = 0
this._state = 'closed'
}

recordFailure(): void {
this.failures++
this.lastFailureAt = Date.now()
if (this.failures >= this.threshold) {
this._state = 'open'
}
}

getStatus(): { state: CBState; failures: number; cooldownRemainingMs: number } {
const cooldownRemainingMs =
this._state === 'open'
? Math.max(0, this.cooldownMs - (Date.now() - this.lastFailureAt))
: 0
return { state: this._state, failures: this.failures, cooldownRemainingMs }
}
}

// One circuit breaker per provider (Blackbox has its own per-key CB below)
const cbOpenRouter = new CircuitBreaker(3, 30_000)
const cbLangdock = new CircuitBreaker(3, 30_000)
const cbOpenClaw = new CircuitBreaker(3, 30_000)

export function getCircuitBreakerStatus() {
return {
openrouter: cbOpenRouter.getStatus(),
langdock: cbLangdock.getStatus(),
openclaw: cbOpenClaw.getStatus(),
}
}

// ─── Retry with exponential backoff ──────────────────────────
// Retries on transient errors (network, 5xx, TIMEOUT).
// Does NOT retry on 401/403/404/429 — those are handled separately.

function isTransientError(err: unknown): boolean {
if (err instanceof ProviderError) {
if (err.code === 'TIMEOUT') return true
if (err.statusCode && err.statusCode >= 500) return true
return false
}
// Network-level errors (ECONNREFUSED, ENOTFOUND, etc.)
return true
}

async function withRetry<T>(
fn: () => Promise<T>,
maxRetries = 2,
baseDelayMs = 1000
): Promise<T> {
let lastErr: unknown
for (let attempt = 0; attempt <= maxRetries; attempt++) {
try {
return await fn()
} catch (err) {
lastErr = err
if (attempt < maxRetries && isTransientError(err)) {
const delay = baseDelayMs * Math.pow(2, attempt)
console.warn(
`[Provider] Transient error (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms: ${
err instanceof Error ? err.message : err
}`
)
await new Promise(r => setTimeout(r, delay))
continue
}
throw err
}
}
throw lastErr
}

// ─── 429 circuit breaker (Blackbox per-key) ───────────────────
const blackboxRateLimitedUntil = new Map<number, number>()
const BLACKBOX_RATE_LIMIT_COOLDOWN_MS = 60_000

function getRuntimeConfig(overrides?: ProviderOverrides): ProviderRuntimeConfig {
const langdockAgentId =
overrides?.langdockAgentId ??
process.env.LANGDOCK_AGENT_ID ??
process.env.VITE_LANGDOCK_AGENT_ID ??
''

return {
openRouterApiKey: overrides?.openRouterApiKey ?? process.env.OPEN_ROUTER_API_KEY ?? '',
langdockApiKey:
overrides?.langdockApiKey ??
process.env.LANGDOCK_API_KEY ??
process.env.VITE_LANGDOCK_API_KEY ??
'',
langdockBaseUrl:
process.env.LANGDOCK_BASE_URL ?? 'https://api.langdock.com/openai/eu/v1',
langdockModel:
process.env.LANGDOCK_MODEL_PRIMARY ?? 'GPT-5.2 Thinking',
langdockAgentId,
disableLangdock: overrides?.disableLangdock ?? (process.env.DISABLE_LANGDOCK === 'true'),
blackboxKeys:
overrides?.blackboxKeys ??
(process.env.BLACKBOX_KEYS ?? process.env.VITE_BLACKBOX_KEYS ?? '')
.split(',')
.map(k => k.trim())
.filter(Boolean),
blackboxEndpoint:
overrides?.blackboxEndpoint ??
process.env.BLACKBOX_ENDPOINT ??
process.env.VITE_BLACKBOX_ENDPOINT ??
'https://api.blackbox.ai/v1/chat/completions',
blackboxModel:
overrides?.blackboxModel ??
process.env.BLACKBOX_MODEL ??
'blackboxai/arcee-ai/trinity-large-preview:free',
openclawBaseUrl:
overrides?.openclawBaseUrl ??
process.env.OPENCLAW_BASE_URL ??
'http://localhost:8080',
openclawModel:
overrides?.openclawModel ??
process.env.OPENCLAW_MODEL ??
'qwen2.5-coder:7b',

// IMPORTANT: default all internal roles to OpenClaw, not Blackbox
plannerProvider:
(overrides?.plannerProvider ??
process.env.PLANNER_PROVIDER ??
'openclaw') as ProviderName,
openclawProvider:
(overrides?.openclawProvider ??
process.env.OPENCLAW_PROVIDER ??
'openclaw') as ProviderName,
maxclawProvider:
(overrides?.maxclawProvider ??
process.env.MAXCLAW_PROVIDER ??
'openclaw') as ProviderName,
fallbackProvider:
(overrides?.fallbackProvider ??
process.env.FALLBACK_PROVIDER ??
'openclaw') as ProviderName,

openrouterPlannerModel:
overrides?.openrouterPlannerModel ??
process.env.OPENROUTER_PLANNER_MODEL ??
'qwen/qwen2.5-coder-7b-instruct',
openrouterMaxclawModel:
overrides?.openrouterMaxclawModel ??
process.env.OPENROUTER_MAXCLAW_MODEL ??
'anthropic/claude-3.5-sonnet',

langdockAgentIds: {
planner: process.env.AGENT_ARCHITECT_ID ?? process.env.VITE_LANGDOCK_AGENT_ID ?? langdockAgentId,
openclaw: process.env.AGENT_OPENCLAW_ID ?? langdockAgentId,
maxclaw: process.env.AGENT_ASSISTANT_ARCHITECT_ID ?? langdockAgentId,
backend: process.env.AGENT_BACKEND_ID ?? langdockAgentId,
frontend: process.env.AGENT_FRONTEND_ID ?? langdockAgentId,
qa: process.env.AGENT_QA_ID ?? langdockAgentId,
devops: process.env.AGENT_DEVOPS_ID ?? langdockAgentId,
fallback: langdockAgentId,
...(overrides?.langdockAgentIds ?? {}),
},
}
}

export function getProviderStatus(overrides?: ProviderOverrides) {
const cfg = getRuntimeConfig(overrides)
return {
openrouter: { available: Boolean(cfg.openRouterApiKey), keySet: Boolean(cfg.openRouterApiKey) },
langdock: { available: Boolean(cfg.langdockApiKey) && !cfg.disableLangdock, keySet: Boolean(cfg.langdockApiKey), disabled: cfg.disableLangdock, model: cfg.langdockModel, endpoint: cfg.langdockBaseUrl },
blackbox: { available: cfg.blackboxKeys.length > 0, keyCount: cfg.blackboxKeys.length, model: cfg.blackboxModel, endpoint: cfg.blackboxEndpoint },
openclaw: { available: Boolean(cfg.openclawBaseUrl), endpoint: cfg.openclawBaseUrl, model: cfg.openclawModel },
roleRouting: {
planner: cfg.plannerProvider,
openclaw: cfg.openclawProvider,
maxclaw: cfg.maxclawProvider,
fallback: cfg.fallbackProvider,
},
models: {
planner: cfg.openrouterPlannerModel,
maxclaw: cfg.openrouterMaxclawModel,
blackbox: cfg.blackboxModel,
langdock: cfg.langdockModel,
},
circuitBreakers: getCircuitBreakerStatus(),
}
}

function isBlackboxKeyValid(key: string): boolean {
return Boolean(key && key.trim().length > 10)
}

function getNextAvailableBlackboxKey(cfg: ProviderRuntimeConfig): {
key: string | null
keyNumber: number
total: number
keyIndex: number
} {
const total = cfg.blackboxKeys.length
if (total === 0) return { key: null, keyNumber: 0, total, keyIndex: -1 }

const now = Date.now()
for (let i = 0; i < total; i++) {
const idx = (blackboxKeyIndex + i) % total
const availableAt = blackboxRateLimitedUntil.get(idx) ?? 0
if (now >= availableAt) {
blackboxKeyIndex = (idx + 1) % total
const key = cfg.blackboxKeys[idx]
const keyNumber = idx + 1
console.log(`[Provider][Blackbox] Attempting key ${keyNumber}/${total}`)
return { key, keyNumber, total, keyIndex: idx }
}
}

const soonestMs = Math.min(...[...blackboxRateLimitedUntil.values()])
const waitSec = Math.ceil((soonestMs - now) / 1000)
console.warn(`[Provider][Blackbox] All ${total} keys rate-limited; soonest available in ~${waitSec}s — using fallback`)
return { key: null, keyNumber: 0, total, keyIndex: -1 }
}

// ─── Non-streaming provider implementations ───────────────────

async function completeWithOpenRouter(
cfg: ProviderRuntimeConfig,
model: string,
messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
options?: { temperature?: number; maxTokens?: number }
): Promise<CompletionResult> {
if (!cfg.openRouterApiKey) {
throw new ProviderError('OpenRouter API key not configured', 'NO_API_KEY', 'openrouter')
}

const start = Date.now()
const response = await withRetry(() =>
fetchWithTimeout(`${OPENROUTER_BASE_URL}/chat/completions`, {
method: 'POST',
headers: {
Authorization: `Bearer ${cfg.openRouterApiKey}`,
'Content-Type': 'application/json',
'HTTP-Referer': 'https://codedxp.local',
'X-Title': 'CodedXP',
},
body: JSON.stringify({
model,
messages,
temperature: options?.temperature ?? 0.3,
max_tokens: options?.maxTokens ?? 2000,
}),
})
)

if (!response.ok) {
throw new ProviderError(`OpenRouter error: ${response.status}`, 'PROVIDER_ERROR', 'openrouter', response.status)
}

const data = await response.json()
const choice = data.choices?.[0]?.message
if (!choice?.content) {
throw new ProviderError('OpenRouter returned empty response', 'EMPTY_RESPONSE', 'openrouter')
}

cbOpenRouter.recordSuccess()
return {
content: choice.content,
model: data.model ?? model,
provider: 'openrouter',
promptTokens: data.usage?.prompt_tokens ?? 0,
completionTokens: data.usage?.completion_tokens ?? 0,
durationMs: Date.now() - start,
rawResponse: JSON.stringify(data),
}
}

async function completeWithOpenClaw(
cfg: ProviderRuntimeConfig,
prompt: string,
options?: { temperature?: number; maxTokens?: number }
): Promise<CompletionResult> {
const start = Date.now()
const response = await withRetry(() =>
fetchWithTimeout(`${cfg.openclawBaseUrl}/api/generate`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
model: cfg.openclawModel,
prompt,
stream: false,
options: {
temperature: options?.temperature ?? 0.3,
num_predict: options?.maxTokens ?? 2000,
},
}),
})
)

if (!response.ok) {
const error = await response.text()
throw new ProviderError(`OpenClaw error: ${response.status} - ${error}`, 'PROVIDER_ERROR', 'openclaw', response.status)
}

const data = await response.json()
if (!data.response) {
throw new ProviderError('OpenClaw returned empty response', 'EMPTY_RESPONSE', 'openclaw')
}

cbOpenClaw.recordSuccess()
return {
content: data.response,
model: cfg.openclawModel,
provider: 'openclaw',
promptTokens: 0,
completionTokens: 0,
durationMs: Date.now() - start,
rawResponse: JSON.stringify(data),
}
}

async function completeWithBlackbox(
cfg: ProviderRuntimeConfig,
messages: { role: string; content: string }[],
options?: { temperature?: number; maxTokens?: number },
attempt = 1
): Promise<CompletionResult> {
const { key, keyNumber, total, keyIndex } = getNextAvailableBlackboxKey(cfg)
if (!key) {
throw new ProviderError(`Blackbox all keys failed (last status 429)`, 'RATE_LIMITED', 'blackbox', 429)
}

if (!isBlackboxKeyValid(key)) {
console.warn(`[Provider][Blackbox] Key ${keyNumber}/${total} invalid format; rotating`)
if (attempt >= total) throw new ProviderError('No valid Blackbox API keys available', 'NO_API_KEY', 'blackbox')
return completeWithBlackbox(cfg, messages, options, attempt + 1)
}

const start = Date.now()
const openAiMessages = messages.map(m => ({ role: m.role, content: m.content }))

const response = await fetchWithTimeout(cfg.blackboxEndpoint, {
method: 'POST',
headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
body: JSON.stringify({
model: cfg.blackboxModel,
messages: openAiMessages,
temperature: options?.temperature ?? 0.3,
max_tokens: options?.maxTokens ?? 2000,
}),
})

if (response.status === 429) {
blackboxRateLimitedUntil.set(keyIndex, Date.now() + BLACKBOX_RATE_LIMIT_COOLDOWN_MS)
console.warn(`[Provider][Blackbox] Key ${keyNumber}/${total} rate-limited (429); cooling down for ${BLACKBOX_RATE_LIMIT_COOLDOWN_MS / 1000}s`)
return completeWithBlackbox(cfg, messages, options, attempt + 1)
}

if (response.status === 401 || response.status === 403) {
console.warn(`[Provider][Blackbox] Key ${keyNumber}/${total} failed with status ${response.status}; rotating`)
if (attempt >= total) throw new ProviderError(`Blackbox all keys failed (last status ${response.status})`, 'PROVIDER_ERROR', 'blackbox', response.status)
return completeWithBlackbox(cfg, messages, options, attempt + 1)
}

if (!response.ok) {
const error = await response.text()
console.warn(`[Provider][Blackbox] Key ${keyNumber}/${total} failed with status ${response.status}: ${error.slice(0, 120)}`)
if (attempt >= total) throw new ProviderError(`Blackbox error: ${response.status}`, 'PROVIDER_ERROR', 'blackbox', response.status)
return completeWithBlackbox(cfg, messages, options, attempt + 1)
}

const raw = await response.text()
let data: any = {}
try {
data = JSON.parse(raw)
} catch {
console.warn(`[Provider][Blackbox] Key ${keyNumber}/${total} returned non-JSON payload; rotating`)
if (attempt >= total) throw new ProviderError('Blackbox non-JSON response for all keys', 'PROVIDER_ERROR', 'blackbox')
return completeWithBlackbox(cfg, messages, options, attempt + 1)
}

const content = data.choices?.[0]?.message?.content ?? data.content ?? null
if (!content) {
console.warn(`[Provider][Blackbox] Key ${keyNumber}/${total} returned empty content; rotating. Raw: ${raw.slice(0, 120)}`)
if (attempt >= total) throw new ProviderError('Blackbox returned empty response', 'EMPTY_RESPONSE', 'blackbox')
return completeWithBlackbox(cfg, messages, options, attempt + 1)
}

console.log(`[Provider][Blackbox] Success with key ${keyNumber}/${total} model=${cfg.blackboxModel}`)
return {
content,
model: data.model ?? cfg.blackboxModel,
provider: 'blackbox',
promptTokens: data.usage?.prompt_tokens ?? 0,
completionTokens: data.usage?.completion_tokens ?? 0,
durationMs: Date.now() - start,
rawResponse: JSON.stringify(data),
}
}

async function completeWithLangdock(
cfg: ProviderRuntimeConfig,
_agentId: string,
userMessage: string,
systemPrompt?: string,
options?: { temperature?: number; maxTokens?: number }
): Promise<CompletionResult> {
if (!cfg.langdockApiKey || cfg.disableLangdock) {
throw new ProviderError('Langdock is disabled', 'DISABLED', 'langdock')
}

const start = Date.now()
const messages: { role: string; content: string }[] = []
if (systemPrompt?.trim()) {
messages.push({ role: 'system', content: systemPrompt.trim() })
}
messages.push({ role: 'user', content: userMessage })

const url = `${cfg.langdockBaseUrl}/chat/completions`
console.log(`[Provider][Langdock] POST ${url} model=${cfg.langdockModel}`)

const response = await withRetry(() =>
fetchWithTimeout(url, {
method: 'POST',
headers: {
Authorization: `Bearer ${cfg.langdockApiKey}`,
'Content-Type': 'application/json',
},
body: JSON.stringify({
model: cfg.langdockModel,
messages,
temperature: options?.temperature ?? 0.3,
max_tokens: options?.maxTokens ?? 8192,
}),
})
)

if (!response.ok) {
const error = await response.text()
cbLangdock.recordFailure()
throw new ProviderError(`Langdock error: ${response.status} - ${error.slice(0, 200)}`, 'PROVIDER_ERROR', 'langdock', response.status)
}

const data = await response.json()
const content = data.choices?.[0]?.message?.content ?? data.content ?? data.response ?? null
if (!content) {
cbLangdock.recordFailure()
throw new ProviderError('Langdock returned empty response', 'EMPTY_RESPONSE', 'langdock')
}

cbLangdock.recordSuccess()
return {
content,
model: data.model ?? cfg.langdockModel,
provider: 'langdock',
promptTokens: data.usage?.prompt_tokens ?? 0,
completionTokens: data.usage?.completion_tokens ?? 0,
durationMs: Date.now() - start,
rawResponse: JSON.stringify(data),
}
}

// ─── Streaming provider implementations ───────────────────────
// Each returns the full accumulated content AND calls onToken per delta.
// Falls back to non-streaming if the provider doesn't support it.

async function completeWithOpenRouterStream(
cfg: ProviderRuntimeConfig,
model: string,
messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
onToken: (delta: string) => void,
options?: { temperature?: number; maxTokens?: number }
): Promise<CompletionResult> {
if (!cfg.openRouterApiKey) {
throw new ProviderError('OpenRouter API key not configured', 'NO_API_KEY', 'openrouter')
}

const start = Date.now()
const response = await fetchWithTimeout(`${OPENROUTER_BASE_URL}/chat/completions`, {
method: 'POST',
headers: {
Authorization: `Bearer ${cfg.openRouterApiKey}`,
'Content-Type': 'application/json',
'HTTP-Referer': 'https://codedxp.local',
'X-Title': 'CodedXP',
},
body: JSON.stringify({
model,
messages,
temperature: options?.temperature ?? 0.3,
max_tokens: options?.maxTokens ?? 2000,
stream: true,
}),
}, 60_000)

if (!response.ok) {
throw new ProviderError(`OpenRouter stream error: ${response.status}`, 'PROVIDER_ERROR', 'openrouter', response.status)
}

const accumulated = await consumeOpenAIStream(response, onToken)
cbOpenRouter.recordSuccess()
return {
content: accumulated,
model,
provider: 'openrouter',
promptTokens: 0,
completionTokens: 0,
durationMs: Date.now() - start,
}
}

async function completeWithBlackboxStream(
cfg: ProviderRuntimeConfig,
messages: { role: string; content: string }[],
onToken: (delta: string) => void,
options?: { temperature?: number; maxTokens?: number },
attempt = 1
): Promise<CompletionResult> {
const { key, keyNumber, total, keyIndex } = getNextAvailableBlackboxKey(cfg)
if (!key) {
throw new ProviderError('Blackbox all keys rate-limited', 'RATE_LIMITED', 'blackbox', 429)
}

if (!isBlackboxKeyValid(key)) {
if (attempt >= total) throw new ProviderError('No valid Blackbox API keys available', 'NO_API_KEY', 'blackbox')
return completeWithBlackboxStream(cfg, messages, onToken, options, attempt + 1)
}

const start = Date.now()
const response = await fetchWithTimeout(cfg.blackboxEndpoint, {
method: 'POST',
headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
body: JSON.stringify({
model: cfg.blackboxModel,
messages,
temperature: options?.temperature ?? 0.3,
max_tokens: options?.maxTokens ?? 2000,
stream: true,
}),
}, 60_000)

if (response.status === 429) {
blackboxRateLimitedUntil.set(keyIndex, Date.now() + BLACKBOX_RATE_LIMIT_COOLDOWN_MS)
if (attempt >= total) throw new ProviderError('Blackbox all keys rate-limited', 'RATE_LIMITED', 'blackbox', 429)
return completeWithBlackboxStream(cfg, messages, onToken, options, attempt + 1)
}

if (!response.ok) {
if (attempt >= total) throw new ProviderError(`Blackbox stream error: ${response.status}`, 'PROVIDER_ERROR', 'blackbox', response.status)
return completeWithBlackboxStream(cfg, messages, onToken, options, attempt + 1)
}

const accumulated = await consumeOpenAIStream(response, onToken)
console.log(`[Provider][Blackbox] Stream success with key ${keyNumber}/${total}`)
return {
content: accumulated,
model: cfg.blackboxModel,
provider: 'blackbox',
promptTokens: 0,
completionTokens: 0,
durationMs: Date.now() - start,
}
}

async function completeWithOpenClawStream(
cfg: ProviderRuntimeConfig,
prompt: string,
onToken: (delta: string) => void,
options?: { temperature?: number; maxTokens?: number }
): Promise<CompletionResult> {
const start = Date.now()
const response = await fetchWithTimeout(`${cfg.openclawBaseUrl}/api/generate`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
model: cfg.openclawModel,
prompt,
stream: true,
options: {
temperature: options?.temperature ?? 0.3,
num_predict: options?.maxTokens ?? 8192,
},
}),
}, 120_000)

if (!response.ok) {
const error = await response.text()
throw new ProviderError(`OpenClaw stream error: ${response.status} - ${error}`, 'PROVIDER_ERROR', 'openclaw', response.status)
}

// Ollama streams newline-delimited JSON: {"response":"...","done":false}
const accumulated = await consumeOllamaStream(response, onToken)
cbOpenClaw.recordSuccess()
return {
content: accumulated,
model: cfg.openclawModel,
provider: 'openclaw',
promptTokens: 0,
completionTokens: 0,
durationMs: Date.now() - start,
}
}

async function completeWithLangdockStream(
cfg: ProviderRuntimeConfig,
messages: { role: string; content: string }[],
onToken: (delta: string) => void,
options?: { temperature?: number; maxTokens?: number }
): Promise<CompletionResult> {
if (!cfg.langdockApiKey || cfg.disableLangdock) {
throw new ProviderError('Langdock is disabled', 'DISABLED', 'langdock')
}

const start = Date.now()
const url = `${cfg.langdockBaseUrl}/chat/completions`
console.log(`[Provider][Langdock] Stream POST ${url} model=${cfg.langdockModel}`)

const response = await fetchWithTimeout(url, {
method: 'POST',
headers: {
Authorization: `Bearer ${cfg.langdockApiKey}`,
'Content-Type': 'application/json',
},
body: JSON.stringify({
model: cfg.langdockModel,
messages,
temperature: options?.temperature ?? 0.3,
max_tokens: options?.maxTokens ?? 8192,
stream: true,
}),
}, 120_000)

if (!response.ok) {
const error = await response.text()
cbLangdock.recordFailure()
throw new ProviderError(`Langdock stream error: ${response.status} - ${error.slice(0, 200)}`, 'PROVIDER_ERROR', 'langdock', response.status)
}

const accumulated = await consumeOpenAIStream(response, onToken)
cbLangdock.recordSuccess()
return {
content: accumulated,
model: cfg.langdockModel,
provider: 'langdock',
promptTokens: 0,
completionTokens: 0,
durationMs: Date.now() - start,
}
}

// ─── SSE stream consumers ─────────────────────────────────────

// If a provider sends tokens but never closes the stream, reader.read() hangs
// forever. STREAM_IDLE_TIMEOUT_MS caps each individual read so the job can
// fall back to non-streaming complete() instead of blocking until the 600s
// test timeout fires.
const STREAM_IDLE_TIMEOUT_MS = 30_000

// Absolute max time for an entire stream, regardless of token activity.
// A slow-but-steady stream (tokens every <30s) would never trigger the idle
// timeout, so this caps total wall-clock time per file generation.
const STREAM_MAX_TIMEOUT_MS = 300_000

async function consumeOpenAIStream(
response: Response,
onToken: (delta: string) => void
): Promise<string> {
const reader = response.body?.getReader()
if (!reader) throw new ProviderError('No response body for streaming', 'EMPTY_RESPONSE', 'unknown')

const decoder = new TextDecoder()
let buffer = ''
let accumulated = ''
let abortedByMax = false

// Absolute max timeout — cancels the reader after STREAM_MAX_TIMEOUT_MS
// even if tokens are still arriving.
const maxTimer = setTimeout(() => {
abortedByMax = true
reader.cancel().catch(() => {})
}, STREAM_MAX_TIMEOUT_MS)

// Wraps reader.read() with a per-read idle timeout. If the provider stalls
// without closing the stream, the timer cancels the reader and throws so
// completeStream() can fall back to non-streaming complete().
function readWithIdleTimeout(): Promise<ReadableStreamReadResult<Uint8Array>> {
return new Promise((resolve, reject) => {
const timer = setTimeout(() => {
reader.cancel().catch(() => {})
reject(new ProviderError('Stream idle timeout — provider stalled', 'TIMEOUT', 'unknown'))
}, STREAM_IDLE_TIMEOUT_MS)
reader.read().then(
(result) => { clearTimeout(timer); resolve(result) },
(err) => { clearTimeout(timer); reject(err) }
)
})
}

try {
while (true) {
const { done, value } = await readWithIdleTimeout()
if (done) break
if (abortedByMax) break
buffer += decoder.decode(value, { stream: true })
const lines = buffer.split('\n')
buffer = lines.pop() ?? ''
for (const line of lines) {
const trimmed = line.trim()
if (!trimmed || trimmed === 'data: [DONE]') continue
if (!trimmed.startsWith('data: ')) continue
try {
const parsed = JSON.parse(trimmed.slice(6))
const delta = parsed.choices?.[0]?.delta?.content ?? ''
if (delta) {
accumulated += delta
onToken(delta)
}
} catch {
// skip malformed SSE line
}
}
}
} finally {
clearTimeout(maxTimer)
reader.releaseLock()
}

// If we hit the absolute max timeout but DID accumulate content, return
// what we have rather than throwing — partial content is better than nothing.
if (abortedByMax) {
if (accumulated) {
console.warn(`[Provider] Stream hit absolute max timeout (${STREAM_MAX_TIMEOUT_MS}ms) but returning ${accumulated.length} chars of partial content`)
return accumulated
}
throw new ProviderError(`Stream exceeded absolute max timeout (${STREAM_MAX_TIMEOUT_MS}ms)`, 'TIMEOUT', 'unknown')
}

if (!accumulated) throw new ProviderError('Stream returned empty content', 'EMPTY_RESPONSE', 'unknown')
return accumulated
}

async function consumeOllamaStream(
response: Response,
onToken: (delta: string) => void
): Promise<string> {
const reader = response.body?.getReader()
if (!reader) throw new ProviderError('No response body for Ollama streaming', 'EMPTY_RESPONSE', 'openclaw')

const decoder = new TextDecoder()
let buffer = ''
let accumulated = ''
let abortedByMax = false

const maxTimer = setTimeout(() => {
abortedByMax = true
reader.cancel().catch(() => {})
}, STREAM_MAX_TIMEOUT_MS)

function readWithIdleTimeout(): Promise<ReadableStreamReadResult<Uint8Array>> {
return new Promise((resolve, reject) => {
const timer = setTimeout(() => {
reader.cancel().catch(() => {})
reject(new ProviderError('Stream idle timeout — provider stalled', 'TIMEOUT', 'openclaw'))
}, STREAM_IDLE_TIMEOUT_MS)
reader.read().then(
(result) => { clearTimeout(timer); resolve(result) },
(err) => { clearTimeout(timer); reject(err) }
)
})
}

try {
while (true) {
const { done, value } = await readWithIdleTimeout()
if (done) break
if (abortedByMax) break
buffer += decoder.decode(value, { stream: true })
const lines = buffer.split('\n')
buffer = lines.pop() ?? ''
for (const line of lines) {
const trimmed = line.trim()
if (!trimmed) continue
try {
const parsed = JSON.parse(trimmed)
const delta = parsed.response ?? ''
if (delta) {
accumulated += delta
onToken(delta)
}
if (parsed.done) break
} catch {
// skip malformed line
}
}
}
} finally {
clearTimeout(maxTimer)
reader.releaseLock()
}

if (abortedByMax) {
if (accumulated) {
console.warn(`[Provider] Ollama stream hit absolute max timeout (${STREAM_MAX_TIMEOUT_MS}ms) but returning ${accumulated.length} chars of partial content`)
return accumulated
}
throw new ProviderError(`Ollama stream exceeded absolute max timeout (${STREAM_MAX_TIMEOUT_MS}ms)`, 'TIMEOUT', 'openclaw')
}

if (!accumulated) throw new ProviderError('Ollama stream returned empty content', 'EMPTY_RESPONSE', 'openclaw')
return accumulated
}

// ─── Public streaming API ─────────────────────────────────────

export interface StreamCompletionOptions {
role: RoleName
systemPrompt: string
userPrompt: string
onToken: (delta: string) => void
temperature?: number
maxTokens?: number
overrides?: ProviderOverrides
}

/**
* completeStream — streaming version of complete().
* Calls onToken for each token delta as it arrives.
* Returns the full accumulated CompletionResult.
* Falls back to non-streaming complete() if streaming fails or is unsupported.
*/
export async function completeStream(options: StreamCompletionOptions): Promise<CompletionResult> {
const { role, systemPrompt, userPrompt, onToken, temperature, maxTokens, overrides } = options
const cfg = getRuntimeConfig(overrides)

let provider: ProviderName = 'none'
let model = ''
if (overrides?.forceProvider) {
provider = overrides.forceProvider
} else {
switch (role) {
case 'planner':
provider = cfg.plannerProvider
model = cfg.openrouterPlannerModel
break
case 'openclaw':
provider = cfg.openclawProvider
model = cfg.openclawModel
break
case 'maxclaw':
provider = cfg.maxclawProvider
model = cfg.openrouterMaxclawModel
break
default:
provider = cfg.fallbackProvider
}
}

const messages = [
{ role: 'system' as const, content: systemPrompt },
{ role: 'user' as const, content: userPrompt },
]

console.log(`[Provider] Stream routing ${role} to ${provider}${model ? ` (${model})` : ''}`)

try {
switch (provider) {
case 'openrouter':
if (cbOpenRouter.isOpen()) throw new ProviderError('OpenRouter circuit open', 'CIRCUIT_OPEN', 'openrouter')
return await completeWithOpenRouterStream(cfg, model || cfg.openrouterPlannerModel, messages, onToken, { temperature, maxTokens })
case 'blackbox':
return await completeWithBlackboxStream(cfg, messages, onToken, { temperature, maxTokens })
case 'openclaw':
if (cbOpenClaw.isOpen()) throw new ProviderError('OpenClaw circuit open', 'CIRCUIT_OPEN', 'openclaw')
return await completeWithOpenClawStream(cfg, userPrompt, onToken, { temperature, maxTokens })
case 'langdock':
if (cbLangdock.isOpen()) throw new ProviderError('Langdock circuit open', 'CIRCUIT_OPEN', 'langdock')
return await completeWithLangdockStream(cfg, messages, onToken, { temperature, maxTokens })
default:
throw new ProviderError(`Unknown provider: ${provider}`, 'UNKNOWN_PROVIDER', provider)
}
} catch (err) {
const errMsg = err instanceof Error ? err.message : String(err)
console.warn(`[Provider] Stream ${provider} failed for role=${role}: ${errMsg} — falling back to non-streaming`)
// Fall back to non-streaming complete() on any streaming failure
return await complete({ role, systemPrompt, userPrompt, temperature, maxTokens, overrides })
}
}

// ─── Public non-streaming API ─────────────────────────────────

export interface CompletionOptions {
role: RoleName
systemPrompt: string
userPrompt: string
temperature?: number
maxTokens?: number
overrides?: ProviderOverrides
}

export async function complete(options: CompletionOptions): Promise<CompletionResult> {
const { role, systemPrompt, userPrompt, temperature, maxTokens, overrides } = options
const cfg = getRuntimeConfig(overrides)

let provider: ProviderName = 'none'
let model = ''
if (overrides?.forceProvider) {
provider = overrides.forceProvider
} else {
switch (role) {
case 'planner':
provider = cfg.plannerProvider
model = cfg.openrouterPlannerModel
break
case 'openclaw':
provider = cfg.openclawProvider
model = cfg.openclawModel
break
case 'maxclaw':
provider = cfg.maxclawProvider
model = cfg.openrouterMaxclawModel
break
default:
provider = cfg.fallbackProvider
}
}

const messages = [
{ role: 'system' as const, content: systemPrompt },
{ role: 'user' as const, content: userPrompt },
]

console.log(`[Provider] Routing ${role} to ${provider}${model ? ` (${model})` : ''}${overrides?.forceProvider ? ' [forced]' : ''}`)

try {
switch (provider) {
case 'openrouter':
if (cbOpenRouter.isOpen()) throw new ProviderError('OpenRouter circuit open', 'CIRCUIT_OPEN', 'openrouter')
return await completeWithOpenRouter(cfg, model || cfg.openrouterPlannerModel, messages, { temperature, maxTokens })
case 'openclaw':
if (cbOpenClaw.isOpen()) throw new ProviderError('OpenClaw circuit open', 'CIRCUIT_OPEN', 'openclaw')
return await completeWithOpenClaw(cfg, userPrompt, { temperature, maxTokens })
case 'blackbox':
return await completeWithBlackbox(cfg, messages, { temperature, maxTokens })
case 'langdock': {
if (cbLangdock.isOpen()) throw new ProviderError('Langdock circuit open', 'CIRCUIT_OPEN', 'langdock')
return await completeWithLangdock(cfg, '', userPrompt, systemPrompt, { temperature, maxTokens })
}
default:
throw new ProviderError(`Unknown provider: ${provider}`, 'UNKNOWN_PROVIDER', provider)
}
} catch (err) {
const errMsg = err instanceof Error ? err.message : String(err)
console.warn(`[Provider] ${provider} failed for role=${role}: ${errMsg}`)

// Record failure in circuit breaker
if (provider === 'openrouter') cbOpenRouter.recordFailure()
else if (provider === 'openclaw') cbOpenClaw.recordFailure()
else if (provider === 'langdock') cbLangdock.recordFailure()

// Fallback chain: try blackbox first (if not already tried), then langdock
if (provider !== 'blackbox' && cfg.blackboxKeys.length > 0) {
console.warn(`[Provider] Falling back to Blackbox (${cfg.blackboxKeys.length} key(s) available)`)
try {
return await completeWithBlackbox(cfg, messages, { temperature, maxTokens })
} catch (bbErr) {
console.warn(`[Provider] Blackbox fallback also failed: ${bbErr instanceof Error ? bbErr.message : bbErr}`)
}
}

if (provider !== 'langdock' && !cfg.disableLangdock && cfg.langdockApiKey && !cbLangdock.isOpen()) {
console.warn(`[Provider] Falling back to Langdock (${cfg.langdockModel} via ${cfg.langdockBaseUrl})`)
return await completeWithLangdock(cfg, '', userPrompt, systemPrompt, { temperature, maxTokens })
}

throw err
}
}

// ─── JSON completion ──────────────────────────────────────────

export interface JSONCompletionOptions<T> extends CompletionOptions {
schema: z.ZodSchema<T>
retries?: number
}

export async function completeJSON<T>(options: JSONCompletionOptions<T>): Promise<JSONCompletionResult<T>> {
const maxRetries = options.retries ?? 2
let lastError: Error | null = null

for (let attempt = 0; attempt <= maxRetries; attempt++) {
try {
const result = await complete({
...options,
userPrompt:
attempt === 0
? options.userPrompt
: `${options.userPrompt}\n\nIMPORTANT: Return ONLY valid JSON, no markdown, no explanation.`,
})

const cleaned = result.content
.replace(/^```(?:json)?\s*/i, '')
.replace(/\s*```\s*$/, '')
.trim()

const parsed = options.schema.parse(JSON.parse(cleaned))
return { ...result, parsed, parseSuccess: true, retryCount: attempt }
} catch (err) {
lastError = err instanceof Error ? err : new Error(String(err))
console.warn(`[Provider] JSON parse attempt ${attempt + 1}/${maxRetries + 1} failed: ${lastError.message}`)
}
}

throw new ProviderError(
`Failed to parse JSON after ${maxRetries + 1} attempts: ${lastError?.message}`,
'PARSE_ERROR',
'unknown'
)
}

// ─── Provider availability ────────────────────────────────────

export function isProviderAvailable(provider: ProviderName, overrides?: ProviderOverrides): boolean {
const status = getProviderStatus(overrides)
switch (provider) {
case 'openrouter': return status.openrouter.available
case 'langdock': return status.langdock.available
case 'blackbox': return status.blackbox.available
case 'openclaw': return status.openclaw.available
default: return false
}
}

// ─── Agent-aware completion ───────────────────────────────────
// Bridge function: allows existing code to call complete() with an agent role
// that maps to the new multi-agent registry. Falls back to existing provider
// routing if the agents module is not loaded.

export type AgentRoleName =
  | 'maxclaw' | 'openclaw' | 'planner' | 'installer'
  | 'frontend' | 'backend' | 'fixer' | 'qa' | 'deploy'
  | 'devops' | 'image' | 'android' | 'ios'

/**
 * Complete a request through the agent registry.
 * Uses the agent's configured provider, model, and system prompt.
 * Falls back to standard complete() if agent dispatch fails.
 */
export async function agentComplete(options: {
  agentRole: AgentRoleName
  systemPrompt: string
  userPrompt: string
  temperature?: number
  maxTokens?: number
}): Promise<CompletionResult> {
  // Try agent dispatch first
  try {
    const { getAgent, getAgentCredentials } = await import('../agents/agentRegistry')
    const config = getAgent(options.agentRole as any)
    if (config) {
      const creds = getAgentCredentials(options.agentRole as any)
      if (creds.apiKey && config.provider === 'langdock') {
        // Route through Langdock with agent-specific config
        return await completeWithLangdock(
          {
            ...getRuntimeConfig(),
            langdockApiKey: creds.apiKey,
            langdockBaseUrl: creds.baseUrl,
            langdockModel: creds.model,
          },
          creds.agentId,
          options.userPrompt,
          options.systemPrompt,
          { temperature: options.temperature, maxTokens: options.maxTokens }
        )
      }
    }
  } catch {
    // Agent module not available — fall through to standard routing
  }

  // Fallback to standard role-based routing
  const role: RoleName = (options.agentRole === 'maxclaw' || options.agentRole === 'openclaw')
    ? options.agentRole as RoleName
    : options.agentRole === 'planner'
    ? 'planner'
    : 'fallback'

  return complete({
    role,
    systemPrompt: options.systemPrompt,
    userPrompt: options.userPrompt,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
  })
}
