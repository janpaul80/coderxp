/**
 * Agents API — Diagnostics and status endpoints for the multi-agent system.
 *
 * GET  /api/agents/status     — Full registry status (all agents, providers, keys)
 * GET  /api/agents/active     — Agents that would activate for a given query
 * GET  /api/agents/snapshot   — Current execution progress snapshot
 * POST /api/agents/chat       — Send a direct chat message to a specific agent
 */

import { Router } from 'express'
import {
  getRegistryStatus,
  resolveActiveAgents,
  chatWithAgent,
  statusEmitter,
  type AgentRole,
} from '../agents'
import { pluginRegistry } from '../services/pluginSystem'

export const agentsRouter = Router()

// ─── GET /api/agents/status ──────────────────────────────────
// Returns the full registry status for diagnostics.

agentsRouter.get('/status', (_req, res) => {
  const status = getRegistryStatus()
  res.json(status)
})

// ─── GET /api/agents/active ──────────────────────────────────
// Given a ?query= parameter, returns which agents would be activated.

agentsRouter.get('/active', (req, res) => {
  const query = req.query.query as string
  if (!query) {
    return res.status(400).json({ error: 'query parameter required' })
  }

  const activeAgents = resolveActiveAgents(query)
  res.json({
    query,
    activeAgents: activeAgents.map(a => ({
      role: a.role,
      name: a.name,
      layer: a.layer,
      activation: a.activation,
      priority: a.priority,
    })),
    totalActive: activeAgents.length,
  })
})

// ─── GET /api/agents/snapshot ────────────────────────────────
// Returns the current execution progress snapshot.

agentsRouter.get('/snapshot', (_req, res) => {
  const snapshot = statusEmitter.getSnapshot()
  res.json(snapshot)
})

// ─── POST /api/agents/chat ───────────────────────────────────
// Send a direct chat message to a specific agent.
// Body: { agent: AgentRole, message: string, context?: { chatHistory, memoryContext, taskContext } }

agentsRouter.post('/chat', async (req, res) => {
  const { agent, message, context } = req.body as {
    agent: AgentRole
    message: string
    context?: {
      chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
      memoryContext?: string
      taskContext?: string
    }
  }

  if (!agent || !message) {
    return res.status(400).json({ error: 'agent and message required' })
  }

  try {
    const result = await chatWithAgent(agent, message, context)
    res.json(result)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: errMsg })
  }
})

// ─── GET /api/agents/plugins ──────────────────────────────────
// Returns the plugin registry status and all registered plugins.

agentsRouter.get('/plugins', (_req, res) => {
  const status = pluginRegistry.getStatus()
  const plugins = pluginRegistry.getAll().map(p => ({
    id: p.manifest.id,
    name: p.manifest.name,
    version: p.manifest.version,
    category: p.manifest.category,
    builtin: p.manifest.builtin,
    enabled: p.enabled,
    activationTriggers: p.manifest.activationTriggers,
    dependencyCount: p.manifest.dependencies.length,
    hookCount: p.manifest.hooks.length,
    promptExtensionCount: p.manifest.promptExtensions.length,
  }))
  res.json({ ...status, plugins })
})

// ─── POST /api/agents/plugins/:id/enable ──────────────────────
// Enable a plugin.

agentsRouter.post('/plugins/:id/enable', (req, res) => {
  const success = pluginRegistry.enable(req.params.id)
  if (!success) return res.status(404).json({ error: 'Plugin not found' })
  res.json({ success: true, pluginId: req.params.id, enabled: true })
})

// ─── POST /api/agents/plugins/:id/disable ─────────────────────
// Disable a plugin (cannot disable builtins).

agentsRouter.post('/plugins/:id/disable', (req, res) => {
  const success = pluginRegistry.disable(req.params.id)
  if (!success) return res.status(400).json({ error: 'Plugin not found or is a builtin (cannot disable)' })
  res.json({ success: true, pluginId: req.params.id, enabled: false })
})
