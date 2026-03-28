/**
 * Agent Dispatch — Routes tasks to the correct agent and calls the Langdock API.
 *
 * Each agent task is dispatched to the appropriate provider (Langdock, HuggingFace, etc.)
 * with the agent's system prompt, credentials, and configuration.
 *
 * Output rules:
 *   - Code generation tasks → JSON structured output
 *   - Debugging/explaining/chat → free-text output
 *   - Image generation → binary/URL output
 */

import {
  type AgentRole,
  type AgentConfig,
  getAgent,
  getAgentCredentials,
} from './agentRegistry'
import { emitAssetStatus } from './statusEmitter'

// ─── Task types ──────────────────────────────────────────────

export interface AgentTask {
  /** Unique task identifier */
  id: string
  /** Which agent handles this task */
  agent: AgentRole
  /** What action to perform */
  action: string
  /** Input data for the task */
  input: Record<string, unknown>
  /** Execution order */
  order: number
  /** Current status */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  /** Task IDs this task depends on */
  dependsOn: string[]
}

export interface AgentTaskResult {
  /** Task ID this result belongs to */
  taskId: string
  /** Agent that executed the task */
  agent: AgentRole
  /** Whether the task succeeded */
  success: boolean
  /** Output data (JSON for code, text for chat, URL for images) */
  output: unknown
  /** Error message if failed */
  error?: string
  /** Duration in milliseconds */
  durationMs: number
  /** Token usage (if applicable) */
  tokenUsage?: { prompt: number; completion: number }
  /** Provider that handled the request */
  provider?: string
  /** Model used */
  model?: string
}

// ─── Output format detection ─────────────────────────────────

type OutputFormat = 'json' | 'text' | 'image'

/** Determine output format based on action type. */
function getOutputFormat(action: string): OutputFormat {
  const jsonActions = [
    'generate', 'generate_plan', 'generate_continuation',
    'generate_mobile', 'generate_assets', 'scaffold_and_install',
    'repair', 'validate_and_fix', 'validate_and_harden',
    'prepare', 'configure_infrastructure',
  ]
  const imageActions = ['generate_image', 'refine_image']
  const textActions = [
    'chat', 'explain', 'debug', 'report', 'validate',
    'validate_repair', 'plan_continuation',
  ]

  if (imageActions.includes(action)) return 'image'
  if (textActions.includes(action)) return 'text'
  if (jsonActions.includes(action)) return 'json'
  return 'text'
}

// ─── Fetch timeout helper ────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 120_000

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(`Agent request timed out after ${timeoutMs}ms`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// ─── Langdock completion ─────────────────────────────────────

async function completeLangdock(
  config: AgentConfig,
  userMessage: string,
  systemPrompt: string,
  options?: { temperature?: number; maxTokens?: number; format?: OutputFormat }
): Promise<{ content: string; model: string; promptTokens: number; completionTokens: number; durationMs: number }> {
  const creds = getAgentCredentials(config.role)
  if (!creds.apiKey) {
    throw new Error(`[AgentDispatch] No API key for ${config.role} (provider: ${config.provider})`)
  }

  const messages: Array<{ role: string; content: string }> = []
  if (systemPrompt.trim()) {
    messages.push({ role: 'system', content: systemPrompt.trim() })
  }
  messages.push({ role: 'user', content: userMessage })

  const url = `${creds.baseUrl}/chat/completions`
  const start = Date.now()

  console.log(`[AgentDispatch] ${config.name} (${config.role}) → Langdock POST ${url} model=${creds.model}`)

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: creds.model,
      messages,
      temperature: options?.temperature ?? config.temperature,
      max_tokens: options?.maxTokens ?? config.maxTokens,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Langdock error for ${config.role}: ${response.status} — ${error.slice(0, 200)}`)
  }

  const data: any = await response.json()
  const content = data.choices?.[0]?.message?.content ?? data.content ?? data.response ?? ''
  if (!content) {
    throw new Error(`Langdock returned empty response for ${config.role}`)
  }

  return {
    content,
    model: data.model ?? creds.model,
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
    durationMs: Date.now() - start,
  }
}

// ─── HuggingFace image generation ────────────────────────────

async function generateImageHuggingFace(
  config: AgentConfig,
  prompt: string
): Promise<{ url: string; durationMs: number }> {
  const creds = getAgentCredentials(config.role)
  if (!creds.apiKey) {
    throw new Error(`[AgentDispatch] No HuggingFace token for ${config.role}`)
  }

  const start = Date.now()
  const url = `${creds.baseUrl}/models/${creds.model}`

  console.log(`[AgentDispatch] ${config.name} → HuggingFace POST ${url}`)

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inputs: prompt }),
  }, 180_000) // image gen can be slow

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`HuggingFace error for ${config.role}: ${response.status} — ${error.slice(0, 200)}`)
  }

  // HuggingFace returns the image as binary
  const blob = await response.blob()
  const buffer = Buffer.from(await blob.arrayBuffer())
  const base64 = buffer.toString('base64')

  return {
    url: `data:image/png;base64,${base64}`,
    durationMs: Date.now() - start,
  }
}

// ─── Streaming Langdock completion ───────────────────────────

export async function streamAgentCompletion(
  role: AgentRole,
  userMessage: string,
  systemPrompt: string,
  onToken: (delta: string) => void,
  options?: { temperature?: number; maxTokens?: number }
): Promise<{ content: string; durationMs: number }> {
  const config = getAgent(role)
  if (!config) throw new Error(`Unknown agent role: ${role}`)

  const creds = getAgentCredentials(role)
  if (!creds.apiKey) throw new Error(`No API key for agent ${role}`)

  const messages: Array<{ role: string; content: string }> = []
  if (systemPrompt.trim()) {
    messages.push({ role: 'system', content: systemPrompt.trim() })
  }
  messages.push({ role: 'user', content: userMessage })

  const url = `${creds.baseUrl}/chat/completions`
  const start = Date.now()

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: creds.model,
      messages,
      temperature: options?.temperature ?? config.temperature,
      max_tokens: options?.maxTokens ?? config.maxTokens,
      stream: true,
    }),
  }, 180_000)

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Langdock stream error for ${role}: ${response.status} — ${error.slice(0, 200)}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body for streaming')

  const decoder = new TextDecoder()
  let buffer = ''
  let accumulated = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
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
    reader.releaseLock()
  }

  return {
    content: accumulated,
    durationMs: Date.now() - start,
  }
}

// ─── Main dispatch function ──────────────────────────────────

/**
 * Dispatch a task to the appropriate agent.
 * Routes to the correct provider and returns the result.
 */
export async function dispatchToAgent(task: AgentTask): Promise<AgentTaskResult> {
  const config = getAgent(task.agent)
  if (!config) {
    return {
      taskId: task.id,
      agent: task.agent,
      success: false,
      output: null,
      error: `Unknown agent role: ${task.agent}`,
      durationMs: 0,
    }
  }

  const format = getOutputFormat(task.action)
  const start = Date.now()

  console.log(
    `[AgentDispatch] Dispatching task ${task.id} → ${config.name} (${task.agent})` +
    ` action=${task.action} format=${format}`
  )

  try {
    // Build the user message from task input
    const userMessage = buildUserMessage(task)

    // Build the full system prompt
    const systemPrompt = buildSystemPrompt(config, task, format)

    // Route to provider
    if (format === 'image' && config.provider === 'huggingface') {
      const assetName = (task.input?.assetName as string) || `image-${task.id.slice(0, 8)}`
      emitAssetStatus(assetName, 'generating', `Generating image: ${assetName}`, { taskId: task.id, agent: task.agent })

      try {
        const result = await generateImageHuggingFace(config, userMessage)
        emitAssetStatus(assetName, 'ready', `Image generated: ${assetName}`, { taskId: task.id, durationMs: result.durationMs })

        return {
          taskId: task.id,
          agent: task.agent,
          success: true,
          output: { imageUrl: result.url },
          durationMs: result.durationMs,
          provider: 'huggingface',
          model: config.model,
        }
      } catch (imgErr) {
        emitAssetStatus(assetName, 'failed', `Image generation failed: ${imgErr instanceof Error ? imgErr.message : String(imgErr)}`, { taskId: task.id })
        throw imgErr
      }
    }

    // Default: Langdock text/JSON completion
    const result = await completeLangdock(config, userMessage, systemPrompt, {
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      format,
    })

    let output: unknown = result.content
    if (format === 'json') {
      try {
        const cleaned = result.content
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```\s*$/, '')
          .trim()
        output = JSON.parse(cleaned)
      } catch {
        // Return raw content if JSON parsing fails
        output = result.content
      }
    }

    return {
      taskId: task.id,
      agent: task.agent,
      success: true,
      output,
      durationMs: result.durationMs,
      tokenUsage: { prompt: result.promptTokens, completion: result.completionTokens },
      provider: config.provider,
      model: result.model,
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`[AgentDispatch] Task ${task.id} failed:`, errMsg)

    // Try fallback agent if configured
    if (config.fallbackTo) {
      console.log(`[AgentDispatch] Trying fallback: ${config.fallbackTo} for task ${task.id}`)
      const fallbackTask: AgentTask = { ...task, agent: config.fallbackTo }
      try {
        return await dispatchToAgent(fallbackTask)
      } catch (fallbackErr) {
        const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
        return {
          taskId: task.id,
          agent: task.agent,
          success: false,
          output: null,
          error: `Primary (${config.role}): ${errMsg} | Fallback (${config.fallbackTo}): ${fallbackMsg}`,
          durationMs: Date.now() - start,
        }
      }
    }

    return {
      taskId: task.id,
      agent: task.agent,
      success: false,
      output: null,
      error: errMsg,
      durationMs: Date.now() - start,
    }
  }
}

// ─── Helper: Build user message from task input ──────────────

function buildUserMessage(task: AgentTask): string {
  const parts: string[] = []

  if (task.input.userRequest) {
    parts.push(`User request: ${task.input.userRequest}`)
  }
  if (task.input.complaint) {
    parts.push(`User complaint: ${task.input.complaint}`)
  }
  if (task.input.memoryContext) {
    parts.push(`\n${task.input.memoryContext}`)
  }
  if (task.input.repoContext) {
    parts.push(`\n${task.input.repoContext}`)
  }

  // Add any other input fields as context
  const knownKeys = new Set(['userRequest', 'complaint', 'memoryContext', 'repoContext'])
  for (const [key, value] of Object.entries(task.input)) {
    if (!knownKeys.has(key) && value !== undefined && value !== null) {
      parts.push(`${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    }
  }

  return parts.join('\n\n') || `Execute task: ${task.action}`
}

// ─── Helper: Build system prompt ─────────────────────────────

function buildSystemPrompt(config: AgentConfig, task: AgentTask, format: OutputFormat): string {
  const parts: string[] = [config.systemPromptPrefix]

  parts.push(`\nYour current task: ${task.action}`)
  parts.push(`Task ID: ${task.id}`)

  if (format === 'json') {
    parts.push(`\nIMPORTANT: You MUST return valid JSON output. No markdown, no explanation. Only the JSON object/array.`)
  } else if (format === 'text') {
    parts.push(`\nRespond in clear, concise markdown. Be direct and actionable.`)
  }

  return parts.join('\n')
}

/**
 * Send a direct chat message to a specific agent.
 * Used when the user asks a question during a build and the active agent should respond.
 */
export async function chatWithAgent(
  role: AgentRole,
  userMessage: string,
  context?: {
    chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
    memoryContext?: string
    taskContext?: string
  }
): Promise<{ content: string; agent: AgentRole; durationMs: number }> {
  const config = getAgent(role)
  if (!config || !config.canChat) {
    throw new Error(`Agent ${role} is not available for chat`)
  }

  let systemPrompt = config.systemPromptPrefix
  if (context?.taskContext) {
    systemPrompt += `\n\nCurrent task context: ${context.taskContext}`
  }
  if (context?.memoryContext) {
    systemPrompt += `\n\n${context.memoryContext}`
  }

  let fullMessage = userMessage
  if (context?.chatHistory?.length) {
    const recent = context.chatHistory.slice(-4)
    const historyBlock = recent
      .map(m => `${m.role === 'user' ? 'User' : 'You'}: ${m.content}`)
      .join('\n')
    fullMessage = `Recent conversation:\n${historyBlock}\n\nUser: ${userMessage}`
  }

  const result = await completeLangdock(config, fullMessage, systemPrompt, {
    temperature: 0.5,
    maxTokens: 1024,
  })

  return {
    content: result.content,
    agent: role,
    durationMs: result.durationMs,
  }
}
