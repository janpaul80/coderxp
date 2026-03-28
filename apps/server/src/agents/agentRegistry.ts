/**
 * Agent Registry — Central configuration for the CoderXP multi-agent system.
 *
 * Architecture:
 *   Layer 1 — Orchestration: MaxClaw (strategy) + OpenClaw (execution dispatch)
 *   Layer 2 — Core agents: Planner, Installer, Frontend, Backend, Fixer, QA, Deploy
 *   Layer 3 — Specialist agents: DevOps, Image, Android, iOS
 *
 * All agents share a single Langdock API key. Each has a unique agent ID.
 * Agent activation is role-based: core agents are always-on, specialists are conditional.
 */

// ─── Agent role definitions ──────────────────────────────────

export type AgentLayer = 'orchestration' | 'core' | 'specialist'

export type AgentRole =
  // Layer 1 — Orchestration
  | 'maxclaw'
  | 'openclaw'
  // Layer 2 — Core
  | 'planner'
  | 'installer'
  | 'frontend'
  | 'backend'
  | 'fixer'
  | 'qa'
  | 'deploy'
  // Layer 3 — Specialist
  | 'devops'
  | 'image'
  | 'android'
  | 'ios'
  | 'refactor'

export type ActivationMode = 'always' | 'conditional'

export type AgentProvider = 'langdock' | 'huggingface' | 'codestral' | 'local'

// ─── Agent configuration ─────────────────────────────────────

export interface AgentConfig {
  /** Unique role identifier */
  role: AgentRole
  /** Human-readable name */
  name: string
  /** Layer in the orchestration hierarchy */
  layer: AgentLayer
  /** AI provider */
  provider: AgentProvider
  /** Model to use (if applicable) */
  model: string
  /** Langdock agent ID (loaded from env) */
  agentId: string
  /** Whether this agent is always active or conditionally activated */
  activation: ActivationMode
  /** Conditions that trigger this agent (for conditional agents) */
  activationTriggers?: string[]
  /** Fallback agent role if this agent fails */
  fallbackTo?: AgentRole
  /** Tools/capabilities this agent can use */
  tools: string[]
  /** System prompt prefix for this agent's personality */
  systemPromptPrefix: string
  /** Max tokens for this agent's responses */
  maxTokens: number
  /** Temperature for this agent's responses */
  temperature: number
  /** Whether this agent can interact with the user in chat */
  canChat: boolean
  /** Priority order for dispatch (lower = higher priority) */
  priority: number
}

// ─── Environment variable mapping ────────────────────────────

function envAgentId(envKey: string, fallback: string): string {
  return process.env[envKey] ?? fallback
}

function getLangdockKey(): string {
  return process.env.LANGDOCK_API_KEY ?? ''
}

function getLangdockBaseUrl(): string {
  return process.env.LANGDOCK_BASE_URL ?? 'https://api.langdock.com/openai/eu/v1'
}

function getLangdockModel(): string {
  return process.env.LANGDOCK_MODEL_PRIMARY ?? 'gpt-5.2'
}

function getHuggingFaceToken(): string {
  return process.env.HUGGING_FACE_TOKEN ?? ''
}

function getCodestralKey(): string {
  return process.env.CODESTRAL_API ?? ''
}

// ─── Default agent ID from env ───────────────────────────────

const DEFAULT_AGENT_ID = process.env.LANGDOCK_AGENT_ID ?? ''

// ─── Build the registry ──────────────────────────────────────

function buildRegistry(): Map<AgentRole, AgentConfig> {
  const registry = new Map<AgentRole, AgentConfig>()

  // ── Layer 1: Orchestration ─────────────────────────────

  registry.set('maxclaw', {
    role: 'maxclaw',
    name: 'MaxClaw',
    layer: 'orchestration',
    provider: 'langdock',
    model: getLangdockModel(),
    agentId: envAgentId('LANGDOCK_AGENT_ID', DEFAULT_AGENT_ID),
    activation: 'always',
    tools: ['plan', 'route', 'arbitrate', 'memory_read', 'memory_write', 'chat'],
    systemPromptPrefix: `You are MaxClaw, the master strategy orchestrator for CoderXP. You analyze user requests at the highest level, create execution strategies, resolve agent conflicts, and ensure quality across the entire build pipeline. You make final decisions when agents disagree. You have full visibility over all agents and their outputs.`,
    maxTokens: 8192,
    temperature: 0.3,
    canChat: true,
    priority: 0,
  })

  registry.set('openclaw', {
    role: 'openclaw',
    name: 'OpenClaw',
    layer: 'orchestration',
    provider: 'langdock',
    model: getLangdockModel(),
    agentId: envAgentId('LANGDOCK_AGENT_ID', DEFAULT_AGENT_ID),
    activation: 'always',
    fallbackTo: 'maxclaw',
    tools: ['dispatch', 'monitor', 'coordinate', 'chat'],
    systemPromptPrefix: `You are OpenClaw, the execution orchestration layer for CoderXP. You receive strategies from MaxClaw and dispatch work to specialist agents. You monitor agent progress, handle sequencing, manage dependencies between agents, and report status back to MaxClaw and the user.`,
    maxTokens: 4096,
    temperature: 0.2,
    canChat: true,
    priority: 1,
  })

  // ── Layer 2: Core Agents ───────────────────────────────

  registry.set('planner', {
    role: 'planner',
    name: 'Planner',
    layer: 'core',
    provider: 'langdock',
    model: getLangdockModel(),
    agentId: envAgentId('Planner_Agent_ID', DEFAULT_AGENT_ID),
    activation: 'always',
    tools: ['analyze', 'plan', 'classify', 'memory_read', 'chat'],
    systemPromptPrefix: `You are the Planner agent for CoderXP. You analyze user requests, classify intent, generate structured implementation plans, and refine plans based on feedback. You understand project requirements deeply and create actionable execution roadmaps.`,
    maxTokens: 4096,
    temperature: 0.4,
    canChat: true,
    priority: 10,
  })

  registry.set('installer', {
    role: 'installer',
    name: 'Installer / Environment',
    layer: 'core',
    provider: 'langdock',
    model: getLangdockModel(),
    agentId: envAgentId('Installer_Environmental_Agent_ID', DEFAULT_AGENT_ID),
    activation: 'always',
    tools: ['scaffold', 'install', 'configure', 'env_setup', 'chat'],
    systemPromptPrefix: `You are the Installer/Environment agent for CoderXP. You handle project scaffolding, dependency installation, environment configuration, and initial project structure setup. You ensure the build environment is clean and all prerequisites are met.`,
    maxTokens: 2048,
    temperature: 0.1,
    canChat: true,
    priority: 20,
  })

  registry.set('frontend', {
    role: 'frontend',
    name: 'Frontend',
    layer: 'core',
    provider: 'langdock',
    model: getLangdockModel(),
    agentId: envAgentId('Frontend_Agent_ID', DEFAULT_AGENT_ID),
    activation: 'always',
    tools: ['generate_code', 'generate_styles', 'generate_components', 'chat'],
    systemPromptPrefix: `You are the Frontend agent for CoderXP. You generate React/TypeScript components, pages, layouts, styles, and routing. You follow modern frontend best practices, use Tailwind CSS for styling, and create responsive, accessible UIs. You output structured JSON code payloads.`,
    maxTokens: 8192,
    temperature: 0.3,
    canChat: true,
    priority: 30,
  })

  registry.set('backend', {
    role: 'backend',
    name: 'Backend',
    layer: 'core',
    provider: 'langdock',
    model: getLangdockModel(),
    agentId: envAgentId('Backend_Agent_ID', DEFAULT_AGENT_ID),
    activation: 'always',
    tools: ['generate_code', 'generate_api', 'generate_models', 'chat'],
    systemPromptPrefix: `You are the Backend agent for CoderXP. You generate Node.js/Express APIs, database schemas (Prisma), authentication routes, middleware, and server-side logic. You ensure APIs are RESTful, properly validated, and follow security best practices. You output structured JSON code payloads.`,
    maxTokens: 8192,
    temperature: 0.3,
    canChat: true,
    priority: 31,
  })

  registry.set('fixer', {
    role: 'fixer',
    name: 'Fixer',
    layer: 'core',
    provider: 'langdock',
    model: getLangdockModel(),
    agentId: envAgentId('Fixer_Agent_ID', DEFAULT_AGENT_ID),
    activation: 'always',
    tools: ['analyze_error', 'repair_code', 'patch_file', 'chat'],
    systemPromptPrefix: `You are the Fixer agent for CoderXP. You analyze build errors, TypeScript errors, runtime failures, and broken previews. You diagnose root causes and generate targeted repairs. You fix problems without breaking existing working code. You are precise and surgical in your repairs.`,
    maxTokens: 4096,
    temperature: 0.1,
    canChat: true,
    priority: 40,
  })

  registry.set('qa', {
    role: 'qa',
    name: 'QA / Validation / Hardening',
    layer: 'core',
    provider: 'langdock',
    model: getLangdockModel(),
    agentId: envAgentId('QA_Validation_Hardening_Agent_ID', DEFAULT_AGENT_ID),
    activation: 'always',
    tools: ['validate', 'test', 'audit', 'harden', 'chat'],
    systemPromptPrefix: `You are the QA/Validation/Hardening agent for CoderXP. You validate generated code for correctness, check for security vulnerabilities, ensure completeness against the plan, run quality checks, and harden the output. You are thorough and exacting.`,
    maxTokens: 4096,
    temperature: 0.1,
    canChat: true,
    priority: 50,
  })

  registry.set('deploy', {
    role: 'deploy',
    name: 'Deploy',
    layer: 'core',
    provider: 'langdock',
    model: getLangdockModel(),
    agentId: DEFAULT_AGENT_ID,
    activation: 'always',
    tools: ['deploy', 'publish', 'configure_hosting', 'chat'],
    systemPromptPrefix: `You are the Deploy agent for CoderXP. You prepare projects for deployment, configure hosting settings, handle Vercel/Docker deployments, and verify that deployed builds are functional. You ensure smooth zero-downtime deployments.`,
    maxTokens: 2048,
    temperature: 0.2,
    canChat: true,
    priority: 60,
  })

  // ── Layer 3: Specialist Agents (Conditional) ───────────

  registry.set('devops', {
    role: 'devops',
    name: 'DevOps',
    layer: 'specialist',
    provider: 'langdock',
    model: getLangdockModel(),
    agentId: envAgentId('DevOps_Agent_ID', DEFAULT_AGENT_ID),
    activation: 'conditional',
    activationTriggers: [
      'docker', 'kubernetes', 'k8s', 'nginx', 'ci/cd', 'pipeline',
      'server setup', 'infra', 'infrastructure', 'ssl', 'https',
      'load balancer', 'monitoring', 'scaling', 'cluster',
    ],
    fallbackTo: 'deploy',
    tools: ['docker', 'nginx', 'cicd', 'infra', 'chat'],
    systemPromptPrefix: `You are the DevOps agent for CoderXP. You handle infrastructure complexity — Docker configurations, CI/CD pipelines, nginx configs, SSL setup, server provisioning, monitoring, and production-grade deployment automation.`,
    maxTokens: 4096,
    temperature: 0.2,
    canChat: true,
    priority: 70,
  })

  registry.set('image', {
    role: 'image',
    name: 'Image',
    layer: 'specialist',
    provider: 'huggingface',
    model: 'stabilityai/stable-diffusion-xl-base-1.0',
    agentId: envAgentId('Image_Agent_ID', DEFAULT_AGENT_ID),
    activation: 'conditional',
    activationTriggers: [
      'image', 'logo', 'icon', 'illustration', 'photo', 'picture',
      'generate image', 'create image', 'visual asset', 'banner',
      'thumbnail', 'avatar', 'graphic', 'artwork',
    ],
    tools: ['generate_image', 'refine_image', 'chat'],
    systemPromptPrefix: `You are the Image agent for CoderXP. You generate visual assets — logos, icons, illustrations, banners, and UI graphics. You understand design aesthetics, brand consistency, and create production-quality visual assets using AI image generation.`,
    maxTokens: 1024,
    temperature: 0.7,
    canChat: true,
    priority: 80,
  })

  registry.set('android', {
    role: 'android',
    name: 'Android',
    layer: 'specialist',
    provider: 'langdock',
    model: getLangdockModel(),
    agentId: envAgentId('Android_Agent_ID', DEFAULT_AGENT_ID),
    activation: 'conditional',
    activationTriggers: [
      'android', 'android app', 'mobile android', 'google play',
      'apk', 'kotlin', 'react native android', 'expo android',
    ],
    fallbackTo: 'frontend',
    tools: ['generate_code', 'mobile_build', 'chat'],
    systemPromptPrefix: `You are the Android agent for CoderXP. You generate Android-specific code, handle React Native / Expo Android configurations, and ensure mobile builds target Android correctly. You understand Android-specific constraints, permissions, and platform requirements.`,
    maxTokens: 4096,
    temperature: 0.3,
    canChat: true,
    priority: 90,
  })

  registry.set('ios', {
    role: 'ios',
    name: 'iOS',
    layer: 'specialist',
    provider: 'langdock',
    model: getLangdockModel(),
    agentId: envAgentId('iOS_Agent_ID', DEFAULT_AGENT_ID),
    activation: 'conditional',
    activationTriggers: [
      'ios', 'iphone', 'ipad', 'apple', 'app store',
      'swift', 'react native ios', 'expo ios', 'xcode',
    ],
    fallbackTo: 'frontend',
    tools: ['generate_code', 'mobile_build', 'chat'],
    systemPromptPrefix: `You are the iOS agent for CoderXP. You generate iOS-specific code, handle React Native / Expo iOS configurations, and ensure mobile builds target iOS correctly. You understand iOS-specific constraints, App Store guidelines, and platform requirements.`,
    maxTokens: 4096,
    temperature: 0.3,
    canChat: true,
    priority: 91,
  })

  registry.set('refactor', {
    role: 'refactor',
    name: 'Refactor / Migration',
    layer: 'specialist',
    provider: 'langdock',
    model: getLangdockModel(),
    agentId: envAgentId('Refactor_Agent_ID', DEFAULT_AGENT_ID),
    activation: 'conditional',
    activationTriggers: [
      'refactor', 'refactoring', 'code smell', 'code smells', 'clean up',
      'restructure', 'reorganize', 'migrate', 'migration', 'upgrade',
      'upgrade dependencies', 'update deps', 'modernize', 'convert to',
      'move to', 'switch to', 'dead code', 'technical debt', 'tech debt',
      'code quality', 'split module', 'extract component', 'extract hook',
    ],
    fallbackTo: 'fixer',
    tools: ['analyze_smells', 'plan_refactor', 'rewrite_module', 'upgrade_deps', 'migrate_framework', 'chat'],
    systemPromptPrefix: `You are the Refactor / Migration agent for CoderXP. You specialize in controlled codebase evolution — detecting code smells, planning safe refactors, rewriting modules with test verification, upgrading dependencies, and managing framework migrations. You are structural (not just patching errors), transformation-focused (evolving architecture), and safety-conscious (always verify with tests, always have a rollback plan). You work closely with the Testing Engine, QA, and Fixer agents to ensure refactors don't introduce regressions.`,
    maxTokens: 8192,
    temperature: 0.2,
    canChat: true,
    priority: 75,
  })

  return registry
}

// ─── Singleton registry ──────────────────────────────────────

let _registry: Map<AgentRole, AgentConfig> | null = null

export function getAgentRegistry(): Map<AgentRole, AgentConfig> {
  if (!_registry) {
    _registry = buildRegistry()
    console.log(`[AgentRegistry] Initialized ${_registry.size} agents`)
    for (const [role, config] of _registry) {
      const idPreview = config.agentId ? config.agentId.slice(0, 8) + '...' : 'NONE'
      console.log(`  [${config.layer}] ${config.name} (${role}) — provider=${config.provider}, agentId=${idPreview}, activation=${config.activation}`)
    }
  }
  return _registry
}

/**
 * Get a specific agent's configuration.
 * Returns null if the agent role doesn't exist.
 */
export function getAgent(role: AgentRole): AgentConfig | null {
  return getAgentRegistry().get(role) ?? null
}

/**
 * Get all agents in a specific layer.
 */
export function getAgentsByLayer(layer: AgentLayer): AgentConfig[] {
  const registry = getAgentRegistry()
  return Array.from(registry.values()).filter(a => a.layer === layer)
}

/**
 * Get all always-active agents (Layer 1 + Layer 2).
 */
export function getAlwaysActiveAgents(): AgentConfig[] {
  const registry = getAgentRegistry()
  return Array.from(registry.values()).filter(a => a.activation === 'always')
}

/**
 * Get all conditional/specialist agents (Layer 3).
 */
export function getConditionalAgents(): AgentConfig[] {
  const registry = getAgentRegistry()
  return Array.from(registry.values()).filter(a => a.activation === 'conditional')
}

/**
 * Check if a conditional agent should be activated for a given user request.
 * Matches against the agent's activation triggers (case-insensitive substring match).
 */
export function shouldActivateAgent(role: AgentRole, userRequest: string): boolean {
  const agent = getAgent(role)
  if (!agent) return false
  if (agent.activation === 'always') return true
  if (!agent.activationTriggers?.length) return false

  const lower = userRequest.toLowerCase()
  return agent.activationTriggers.some(trigger => lower.includes(trigger.toLowerCase()))
}

/**
 * Determine which agents should be activated for a given user request.
 * Returns always-active agents + any triggered conditional agents.
 */
export function resolveActiveAgents(userRequest: string): AgentConfig[] {
  const registry = getAgentRegistry()
  const active: AgentConfig[] = []

  for (const config of registry.values()) {
    if (config.activation === 'always') {
      active.push(config)
    } else if (shouldActivateAgent(config.role, userRequest)) {
      active.push(config)
    }
  }

  // Sort by priority (lower = earlier)
  return active.sort((a, b) => a.priority - b.priority)
}

/**
 * Get provider credentials for a specific agent.
 * Returns the API key/token and base URL based on agent's provider.
 */
export function getAgentCredentials(role: AgentRole): {
  apiKey: string
  baseUrl: string
  model: string
  agentId: string
} {
  const agent = getAgent(role)
  if (!agent) {
    return { apiKey: '', baseUrl: '', model: '', agentId: '' }
  }

  switch (agent.provider) {
    case 'langdock':
      return {
        apiKey: getLangdockKey(),
        baseUrl: getLangdockBaseUrl(),
        model: agent.model,
        agentId: agent.agentId,
      }
    case 'huggingface':
      return {
        apiKey: getHuggingFaceToken(),
        baseUrl: 'https://api-inference.huggingface.co',
        model: agent.model,
        agentId: agent.agentId,
      }
    case 'codestral':
      return {
        apiKey: getCodestralKey(),
        baseUrl: 'https://codestral.mistral.ai/v1',
        model: 'codestral-latest',
        agentId: agent.agentId,
      }
    case 'local':
      return {
        apiKey: '',
        baseUrl: process.env.OPENCLAW_BASE_URL ?? 'http://localhost:11434',
        model: process.env.OPENCLAW_MODEL ?? 'qwen2.5-coder:7b',
        agentId: '',
      }
    default:
      return { apiKey: '', baseUrl: '', model: '', agentId: '' }
  }
}

/**
 * Get the full registry status for diagnostics.
 */
export function getRegistryStatus(): {
  totalAgents: number
  layers: Record<AgentLayer, number>
  agents: Array<{
    role: AgentRole
    name: string
    layer: AgentLayer
    provider: AgentProvider
    activation: ActivationMode
    hasAgentId: boolean
    hasApiKey: boolean
  }>
} {
  const registry = getAgentRegistry()
  const layers: Record<AgentLayer, number> = { orchestration: 0, core: 0, specialist: 0 }
  const agents: Array<{
    role: AgentRole
    name: string
    layer: AgentLayer
    provider: AgentProvider
    activation: ActivationMode
    hasAgentId: boolean
    hasApiKey: boolean
  }> = []

  for (const config of registry.values()) {
    layers[config.layer]++
    const creds = getAgentCredentials(config.role)
    agents.push({
      role: config.role,
      name: config.name,
      layer: config.layer,
      provider: config.provider,
      activation: config.activation,
      hasAgentId: Boolean(creds.agentId),
      hasApiKey: Boolean(creds.apiKey),
    })
  }

  return {
    totalAgents: registry.size,
    layers,
    agents,
  }
}
