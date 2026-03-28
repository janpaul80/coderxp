/**
 * Agents module — Central export for CoderXP multi-agent system.
 *
 * Architecture:
 *   Layer 1 — Orchestration: MaxClaw + OpenClaw
 *   Layer 2 — Core: Planner, Installer, Frontend, Backend, Fixer, QA, Deploy
 *   Layer 3 — Specialist: DevOps, Image, Android, iOS
 */

// Agent Registry
export {
  type AgentLayer,
  type AgentRole,
  type ActivationMode,
  type AgentProvider,
  type AgentConfig,
  getAgentRegistry,
  getAgent,
  getAgentsByLayer,
  getAlwaysActiveAgents,
  getConditionalAgents,
  shouldActivateAgent,
  resolveActiveAgents,
  getAgentCredentials,
  getRegistryStatus,
} from './agentRegistry'

// Orchestrator (MaxClaw + OpenClaw)
export {
  type ExecutionStrategy,
  type ExecutionResult,
  type ConflictRecord,
  createExecutionStrategy,
  executeStrategy,
  resolveConflict,
} from './orchestrator'

// Agent Dispatch
export {
  type AgentTask,
  type AgentTaskResult,
  dispatchToAgent,
  streamAgentCompletion,
  chatWithAgent,
} from './agentDispatch'

// Status Emitter
export {
  type PipelineStatus,
  type AgentStatus,
  type PreviewStatus,
  type ReleaseStatus,
  type AssetStatus,
  type StatusPayload,
  type FileChangePayload,
  type ProgressSnapshot,
  statusEmitter,
  emitAgentStatus,
  emitPipelineStatus,
  emitPreviewStatus,
  emitReleaseStatus,
  emitAssetStatus,
  emitFileChange,
} from './statusEmitter'

// Socket Bridge
export {
  connectStatusBridge,
  disconnectStatusBridge,
  emitStatusToUser,
  emitFileChangeToUser,
  emitSnapshotToUser,
} from './socketBridge'
