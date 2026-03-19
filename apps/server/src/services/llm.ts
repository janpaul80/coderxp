/**
 * LLM Service — Unified wrapper for AI completions
 *
 * Supports OpenAI (primary) with graceful fallback messaging.
 * Designed to be provider-swappable: replace the client here
 * without touching planner logic.
 */

import OpenAI from 'openai'
import { z } from 'zod'

// ─── Provider config ──────────────────────────────────────────

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? ''
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
const LLM_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS ?? '30000', 10)
const LLM_MAX_RETRIES = parseInt(process.env.LLM_MAX_RETRIES ?? '2', 10)

export const LLM_PROVIDER = OPENAI_API_KEY ? 'openai' : 'none'
export const LLM_MODEL = OPENAI_MODEL

let openaiClient: OpenAI | null = null

function getClient(): OpenAI {
  if (!openaiClient) {
    if (!OPENAI_API_KEY) {
      throw new LLMUnavailableError('No LLM API key configured. Set OPENAI_API_KEY in .env')
    }
    openaiClient = new OpenAI({
      apiKey: OPENAI_API_KEY,
      timeout: LLM_TIMEOUT_MS,
      maxRetries: 0, // We handle retries ourselves for better control
    })
  }
  return openaiClient
}

// ─── Errors ───────────────────────────────────────────────────

export class LLMUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LLMUnavailableError'
  }
}

export class LLMParseError extends Error {
  public rawResponse: string
  constructor(message: string, rawResponse: string) {
    super(message)
    this.name = 'LLMParseError'
    this.rawResponse = rawResponse
  }
}

// ─── Core completion ──────────────────────────────────────────

export interface CompletionOptions {
  systemPrompt: string
  userPrompt: string
  temperature?: number
  maxTokens?: number
}

export interface CompletionResult {
  content: string
  model: string
  provider: string
  promptTokens: number
  completionTokens: number
  durationMs: number
}

export async function complete(opts: CompletionOptions): Promise<CompletionResult> {
  const client = getClient()
  const start = Date.now()

  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 2000,
    messages: [
      { role: 'system', content: opts.systemPrompt },
      { role: 'user', content: opts.userPrompt },
    ],
  })

  const choice = response.choices[0]
  if (!choice?.message?.content) {
    throw new LLMParseError('LLM returned empty response', '')
  }

  return {
    content: choice.message.content,
    model: response.model,
    provider: 'openai',
    promptTokens: response.usage?.prompt_tokens ?? 0,
    completionTokens: response.usage?.completion_tokens ?? 0,
    durationMs: Date.now() - start,
  }
}

// ─── JSON completion with schema validation + retry ───────────

export interface JSONCompletionOptions<T> extends CompletionOptions {
  schema: z.ZodSchema<T>
  retries?: number
}

export interface JSONCompletionResult<T> extends CompletionResult {
  parsed: T
  parseSuccess: boolean
  retryCount: number
  rawResponse: string
}

export async function completeJSON<T>(
  opts: JSONCompletionOptions<T>
): Promise<JSONCompletionResult<T>> {
  const maxRetries = opts.retries ?? LLM_MAX_RETRIES
  let lastError: Error | null = null
  let lastRaw = ''

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await complete({
        ...opts,
        // On retry, add explicit JSON reminder
        userPrompt: attempt === 0
          ? opts.userPrompt
          : `${opts.userPrompt}\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY a valid JSON object, no markdown, no explanation.`,
        temperature: attempt === 0 ? (opts.temperature ?? 0.3) : 0.1,
      })

      lastRaw = result.content

      // Strip markdown code fences if present
      const cleaned = lastRaw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim()

      const parsed = JSON.parse(cleaned)
      const validated = opts.schema.parse(parsed)

      return {
        ...result,
        rawResponse: lastRaw,
        parsed: validated,
        parseSuccess: true,
        retryCount: attempt,
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      console.warn(`[LLM] JSON parse attempt ${attempt + 1}/${maxRetries + 1} failed:`, lastError.message)
    }
  }

  throw new LLMParseError(
    `Failed to parse LLM JSON response after ${maxRetries + 1} attempts: ${lastError?.message}`,
    lastRaw
  )
}

// ─── Health check ─────────────────────────────────────────────

export function isLLMAvailable(): boolean {
  return Boolean(OPENAI_API_KEY)
}

export function getLLMStatus(): { available: boolean; provider: string; model: string } {
  return {
    available: isLLMAvailable(),
    provider: LLM_PROVIDER,
    model: LLM_MODEL,
  }
}
