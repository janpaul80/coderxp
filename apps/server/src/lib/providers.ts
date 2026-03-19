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

function getRuntimeConfig(overrides?: ProviderOverrides): ProviderRuntimeConfig {
  const langdockAgentId = overrides?.langdockAgentId ?? process.env.LANGDOCK_AGENT_ID ?? process.env.VITE_LANGDOCK_AGENT_ID ?? ''
  return {
    openRouterApiKey: overrides?.openRouterApiKey ?? process.env.OPEN_ROUTER_API_KEY ?? '',
    langdockApiKey: overrides?.langdockApiKey ?? process.env.LANGDOCK_API_KEY ?? process.env.VITE_LANGDOCK_API_KEY ?? '',
    langdockAgentId,
    disableLangdock: overrides?.disableLangdock ?? (process.env.DISABLE_LANGDOCK === 'true'),
    blackboxKeys: overrides?.blackboxKeys ?? (process.env.BLACKBOX_KEYS ?? process.env.VITE_BLACKBOX_KEYS ?? '').split(',').map(k => k.trim()).filter(Boolean),
    // Fixed: api.blackbox.ai is the correct OpenAI-compatible endpoint (www.blackbox.ai/api/chat was unofficial/broken)
    blackboxEndpoint: overrides?.blackboxEndpoint ?? process.env.BLACKBOX_ENDPOINT ?? process.env.VITE_BLACKBOX_ENDPOINT ?? 'https://api.blackbox.ai/v1/chat/completions',
    blackboxModel: overrides?.blackboxModel ?? process.env.BLACKBOX_MODEL ?? 'blackboxai/arcee-ai/trinity-large-preview:free',
    openclawBaseUrl: overrides?.openclawBaseUrl ?? process.env.OPENCLAW_BASE_URL ?? 'http://localhost:8080',
    openclawModel: overrides?.openclawModel ?? process.env.OPENCLAW_MODEL ?? 'qwen2.5-coder:7b',
    plannerProvider: (overrides?.plannerProvider ?? process.env.PLANNER_PROVIDER ?? 'blackbox') as ProviderName,
    openclawProvider: (overrides?.openclawProvider ?? process.env.OPENCLAW_PROVIDER ?? 'openclaw') as ProviderName,
    maxclawProvider: (overrides?.maxclawProvider ?? process.env.MAXCLAW_PROVIDER ?? 'blackbox') as ProviderName,
    fallbackProvider: (overrides?.fallbackProvider ?? process.env.FALLBACK_PROVIDER ?? 'blackbox') as ProviderName,
    openrouterPlannerModel: overrides?.openrouterPlannerModel ?? process.env.OPENROUTER_PLANNER_MODEL ?? 'qwen/qwen2.5-coder-7b-instruct',
    openrouterMaxclawModel: overrides?.openrouterMaxclawModel ?? process.env.OPENROUTER_MAXCLAW_MODEL ?? 'anthropic/claude-3.5-sonnet',
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
    langdock: { available: Boolean(cfg.langdockApiKey) && !cfg.disableLangdock, keySet: Boolean(cfg.langdockApiKey), disabled: cfg.disableLangdock },
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
    },
  }
}

function isBlackboxKeyValid(key: string): boolean {
  return Boolean(key && key.trim().length > 10)
}

function getNextBlackboxKey(cfg: ProviderRuntimeConfig): { key: string | null; keyNumber: number; total: number } {
  const total = cfg.blackboxKeys.length
  if (total === 0) return { key: null, keyNumber: 0, total }
  const idx = blackboxKeyIndex % total
  const key = cfg.blackboxKeys[idx]
  const keyNumber = idx + 1
  blackboxKeyIndex++
  console.log(`[Provider][Blackbox] Attempting key ${keyNumber}/${total}`)
  return { key, keyNumber, total }
}

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
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
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

  if (!response.ok) {
    throw new ProviderError(`OpenRouter error: ${response.status}`, 'PROVIDER_ERROR', 'openrouter', response.status)
  }

  const data = await response.json()
  const choice = data.choices?.[0]?.message
  if (!choice?.content) {
    throw new ProviderError('OpenRouter returned empty response', 'EMPTY_RESPONSE', 'openrouter')
  }

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
  const response = await fetch(`${cfg.openclawBaseUrl}/api/generate`, {
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

  if (!response.ok) {
    const error = await response.text()
    throw new ProviderError(`OpenClaw error: ${response.status} - ${error}`, 'PROVIDER_ERROR', 'openclaw', response.status)
  }

  const data = await response.json()
  if (!data.response) {
    throw new ProviderError('OpenClaw returned empty response', 'EMPTY_RESPONSE', 'openclaw')
  }

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
  const { key, keyNumber, total } = getNextBlackboxKey(cfg)
  if (!key) {
    throw new ProviderError('No Blackbox API keys available', 'NO_API_KEY', 'blackbox')
  }

  if (!isBlackboxKeyValid(key)) {
    console.warn(`[Provider][Blackbox] Key ${keyNumber}/${total} invalid format; rotating`)
    if (attempt >= total) throw new ProviderError('No valid Blackbox API keys available', 'NO_API_KEY', 'blackbox')
    return completeWithBlackbox(cfg, messages, options, attempt + 1)
  }

  const start = Date.now()

  // api.blackbox.ai uses standard OpenAI-compatible format.
  // System message is included as the first message with role 'system'.
  const openAiMessages = messages.map(m => ({ role: m.role, content: m.content }))

  const response = await fetch(cfg.blackboxEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: cfg.blackboxModel,
      messages: openAiMessages,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 2000,
    }),
  })

  if (response.status === 429 || response.status === 401 || response.status === 403) {
    console.warn(`[Provider][Blackbox] Key ${keyNumber}/${total} failed with status ${response.status}; rotating`)
    if (attempt >= total) throw new ProviderError(`Blackbox all keys failed (last status ${response.status})`, 'PROVIDER_ERROR', 'blackbox', response.status)
    return completeWithBlackbox(cfg, messages, options, attempt + 1)
  }

  if (!response.ok) {
    const error = await response.text()
    console.warn(`[Provider][Blackbox] Key ${keyNumber}/${total} failed with status ${response.status}: ${error.slice(0, 120)}`)
    if (attempt >= total) throw new ProviderError(`Blackbox error: ${response.status}`, 'PROVIDER_ERROR', 'blackbox', response.status)
    console.warn(`[Provider][Blackbox] Rotating to next key after failure`)
    return completeWithBlackbox(cfg, messages, options, attempt + 1)
  }

  const raw = await response.text()
  let data: any = {}
  try {
    data = JSON.parse(raw)
  } catch {
    console.warn(`[Provider][Blackbox] Key ${keyNumber}/${total} returned non-JSON payload; rotating`)
    if (attempt >= total) {
      throw new ProviderError('Blackbox non-JSON response for all keys', 'PROVIDER_ERROR', 'blackbox')
    }
    console.warn(`[Provider][Blackbox] Rotating to next key after non-JSON response`)
    return completeWithBlackbox(cfg, messages, options, attempt + 1)
  }

  // OpenAI-compatible response: choices[0].message.content
  // Fallback to legacy data.content for any older response shapes
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
  agentId: string,
  userMessage: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<CompletionResult> {
  if (!cfg.langdockApiKey || cfg.disableLangdock) {
    throw new ProviderError('Langdock is disabled', 'DISABLED', 'langdock')
  }

  const start = Date.now()

  // Langdock API: https://api.langdock.com/agent/v1/chat/completions
  // Request: { agentId, messages: [{id, role, parts: [{type: 'text', text}]}] }
  // Response: OpenAI-compatible { choices: [{message: {content}}] }
  const msgId = `msg-${Date.now()}`
  const response = await fetch('https://api.langdock.com/agent/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.langdockApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agentId,
      messages: [
        {
          id: msgId,
          role: 'user',
          parts: [{ type: 'text', text: userMessage }],
        },
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new ProviderError(`Langdock error: ${response.status} - ${error.slice(0, 200)}`, 'PROVIDER_ERROR', 'langdock', response.status)
  }

  const data = await response.json()
  // Support OpenAI-compatible and legacy response shapes
  const content = data.choices?.[0]?.message?.content ?? data.content ?? data.response ?? null
  if (!content) {
    throw new ProviderError('Langdock returned empty response', 'EMPTY_RESPONSE', 'langdock')
  }

  return {
    content,
    model: agentId,
    provider: 'langdock',
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
    durationMs: Date.now() - start,
    rawResponse: JSON.stringify(data),
  }
}

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
        return await completeWithOpenRouter(cfg, model || cfg.openrouterPlannerModel, messages, { temperature, maxTokens })
      case 'openclaw':
        return await completeWithOpenClaw(cfg, userPrompt, { temperature, maxTokens })
      case 'blackbox':
        return await completeWithBlackbox(cfg, messages, { temperature, maxTokens })
      case 'langdock': {
        const agentId = cfg.langdockAgentIds[role] ?? cfg.langdockAgentId
        return await completeWithLangdock(cfg, agentId, userPrompt, { temperature, maxTokens })
      }
      default:
        throw new ProviderError(`Unknown provider: ${provider}`, 'UNKNOWN_PROVIDER', provider)
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.warn(`[Provider] ${provider} failed for role=${role}: ${errMsg}`)

    // Fallback chain: try blackbox first (if not already tried), then langdock
    if (provider !== 'blackbox' && cfg.blackboxKeys.length > 0) {
      console.warn(`[Provider] Falling back to Blackbox (${cfg.blackboxKeys.length} key(s) available)`)
      try {
        return await completeWithBlackbox(cfg, messages, { temperature, maxTokens })
      } catch (bbErr) {
        console.warn(`[Provider] Blackbox fallback also failed: ${bbErr instanceof Error ? bbErr.message : bbErr}`)
      }
    }

    if (provider !== 'langdock' && !cfg.disableLangdock && cfg.langdockApiKey) {
      const agentId = cfg.langdockAgentIds[role] ?? cfg.langdockAgentId
      console.warn(`[Provider] Falling back to Langdock agent ${agentId}`)
      return await completeWithLangdock(cfg, agentId, userPrompt, { temperature, maxTokens })
    }

    throw err
  }
}

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
        userPrompt: attempt === 0
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
