import React, { useState, useEffect } from 'react'
import { X, Check, Eye, EyeOff, Shield, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Provider definitions ────────────────────────────────────

type ProviderId = 'openrouter' | 'anthropic' | 'aws_bedrock' | 'openai_compat' | 'gcp_vertex' | 'google_gemini' | 'deepseek'

interface ProviderDef {
  id: ProviderId
  name: string
  description: string
  color: string
  models: string[]
}

const PROVIDERS: ProviderDef[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Access 100+ models through one API',
    color: 'text-purple-400 border-purple-400/25 bg-purple-400/[0.06]',
    models: ['claude-3.5-sonnet', 'gpt-4o', 'gemini-2.0-flash', 'llama-3.1-70b', 'mixtral-8x22b'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude models direct from Anthropic',
    color: 'text-orange-400 border-orange-400/25 bg-orange-400/[0.06]',
    models: ['claude-opus-4', 'claude-sonnet-4', 'claude-3.5-sonnet', 'claude-3.5-haiku'],
  },
  {
    id: 'aws_bedrock',
    name: 'AWS Bedrock',
    description: 'Managed AI via your AWS account',
    color: 'text-amber-400 border-amber-400/25 bg-amber-400/[0.06]',
    models: ['anthropic.claude-3-5-sonnet', 'anthropic.claude-3-haiku', 'amazon.titan-text-express'],
  },
  {
    id: 'openai_compat',
    name: 'OpenAI Compatible',
    description: 'Any OpenAI-compatible endpoint',
    color: 'text-green-400 border-green-400/25 bg-green-400/[0.06]',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'custom'],
  },
  {
    id: 'gcp_vertex',
    name: 'GCP Vertex AI',
    description: 'Google Cloud Vertex AI models',
    color: 'text-blue-400 border-blue-400/25 bg-blue-400/[0.06]',
    models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'claude-3.5-sonnet-v2'],
  },
  {
    id: 'google_gemini',
    name: 'Google Gemini',
    description: 'Gemini models via Google AI Studio',
    color: 'text-sky-400 border-sky-400/25 bg-sky-400/[0.06]',
    models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek reasoning and chat models',
    color: 'text-teal-400 border-teal-400/25 bg-teal-400/[0.06]',
    models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
  },
]

// ─── Storage helpers ─────────────────────────────────────────

const STORAGE_KEY = 'coderxp_api_config'

interface ApiConfig {
  providerId: ProviderId | null
  model: string
  fields: Record<string, string>
}

function loadConfig(): ApiConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { providerId: null, model: '', fields: {} }
}

function saveConfig(config: ApiConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

// ─── Field input ─────────────────────────────────────────────

function SecureField({
  label,
  value,
  onChange,
  placeholder,
  isSecret,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  isSecret?: boolean
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div>
      <label className="block text-2xs text-white/40 mb-1.5 font-medium">{label}</label>
      <div className="relative">
        <input
          type={isSecret && !visible ? 'password' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            'w-full px-3 py-2 rounded-lg text-xs text-white/80 placeholder-white/20',
            'bg-white/[0.04] border border-white/[0.08]',
            'focus:outline-none focus:border-accent/40 focus:bg-white/[0.06]',
            'transition-all'
          )}
        />
        {isSecret && (
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/20 hover:text-white/40 transition-colors"
          >
            {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Provider-specific forms ─────────────────────────────────

function ProviderForm({
  providerId,
  fields,
  model,
  models,
  onFieldChange,
  onModelChange,
}: {
  providerId: ProviderId
  fields: Record<string, string>
  model: string
  models: string[]
  onFieldChange: (key: string, val: string) => void
  onModelChange: (m: string) => void
}) {
  const f = (key: string) => fields[key] ?? ''
  const set = (key: string) => (val: string) => onFieldChange(key, val)

  return (
    <div className="space-y-3">
      {providerId === 'openrouter' && (
        <SecureField label="OpenRouter API Key" value={f('apiKey')} onChange={set('apiKey')} placeholder="sk-or-..." isSecret />
      )}

      {providerId === 'anthropic' && (
        <SecureField label="Anthropic API Key" value={f('apiKey')} onChange={set('apiKey')} placeholder="sk-ant-..." isSecret />
      )}

      {providerId === 'aws_bedrock' && (
        <>
          <SecureField label="AWS Access Key" value={f('accessKey')} onChange={set('accessKey')} placeholder="AKIA..." isSecret />
          <SecureField label="AWS Secret Key" value={f('secretKey')} onChange={set('secretKey')} placeholder="wJalr..." isSecret />
          <SecureField label="AWS Session Token" value={f('sessionToken')} onChange={set('sessionToken')} placeholder="Optional" isSecret />
          <SecureField label="AWS Region" value={f('region')} onChange={set('region')} placeholder="us-east-1" />
          <label className="flex items-center gap-2 mt-2 cursor-pointer">
            <input
              type="checkbox"
              checked={f('crossRegion') === 'true'}
              onChange={(e) => onFieldChange('crossRegion', e.target.checked ? 'true' : 'false')}
              className="w-3.5 h-3.5 rounded border-white/20 bg-white/[0.04] text-accent focus:ring-accent/30"
            />
            <span className="text-2xs text-white/50">Enable cross-region inference</span>
          </label>
        </>
      )}

      {providerId === 'openai_compat' && (
        <>
          <SecureField label="Base URL" value={f('baseUrl')} onChange={set('baseUrl')} placeholder="https://api.openai.com/v1" />
          <SecureField label="API Key" value={f('apiKey')} onChange={set('apiKey')} placeholder="sk-..." isSecret />
          <SecureField label="Model ID" value={f('modelId')} onChange={set('modelId')} placeholder="gpt-4o" />
          <label className="flex items-center gap-2 mt-2 cursor-pointer">
            <input
              type="checkbox"
              checked={f('isAzure') === 'true'}
              onChange={(e) => onFieldChange('isAzure', e.target.checked ? 'true' : 'false')}
              className="w-3.5 h-3.5 rounded border-white/20 bg-white/[0.04] text-accent focus:ring-accent/30"
            />
            <span className="text-2xs text-white/50">Azure OpenAI (requires api-version)</span>
          </label>
          {f('isAzure') === 'true' && (
            <SecureField label="Azure API Version" value={f('azureApiVersion')} onChange={set('azureApiVersion')} placeholder="2024-02-01" />
          )}
        </>
      )}

      {providerId === 'gcp_vertex' && (
        <>
          <SecureField label="Google Cloud Project ID" value={f('projectId')} onChange={set('projectId')} placeholder="my-project-123" />
          <SecureField label="Google Cloud Region" value={f('region')} onChange={set('region')} placeholder="us-central1" />
        </>
      )}

      {providerId === 'google_gemini' && (
        <SecureField label="Gemini API Key" value={f('apiKey')} onChange={set('apiKey')} placeholder="AI..." isSecret />
      )}

      {providerId === 'deepseek' && (
        <SecureField label="DeepSeek API Key" value={f('apiKey')} onChange={set('apiKey')} placeholder="sk-..." isSecret />
      )}

      {/* Model selector */}
      <div>
        <label className="block text-2xs text-white/40 mb-1.5 font-medium">Model</label>
        <div className="relative">
          <select
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            className={cn(
              'w-full px-3 py-2 rounded-lg text-xs text-white/80 appearance-none',
              'bg-white/[0.04] border border-white/[0.08]',
              'focus:outline-none focus:border-accent/40',
              'transition-all cursor-pointer'
            )}
          >
            <option value="">Select a model</option>
            {models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20 pointer-events-none" />
        </div>
      </div>
    </div>
  )
}

// ─── Main modal ──────────────────────────────────────────────

interface ApiProviderModalProps {
  open: boolean
  onClose: () => void
}

export function ApiProviderModal({ open, onClose }: ApiProviderModalProps) {
  const [config, setConfig] = useState<ApiConfig>(loadConfig)

  // Reload from storage when opening
  useEffect(() => {
    if (open) setConfig(loadConfig())
  }, [open])

  if (!open) return null

  const selectedProvider = PROVIDERS.find((p) => p.id === config.providerId) ?? null

  function handleSave() {
    saveConfig(config)
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="fixed z-50 inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div className={cn(
          'pointer-events-auto w-full max-w-md',
          'bg-[#1D1D1D] border border-white/[0.08] rounded-2xl shadow-card-lg',
          'flex flex-col max-h-[85vh]'
        )}>

          {/* ── Header ──────────────────────────────────── */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center">
                <Shield className="w-4 h-4 text-accent" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">API Settings</h2>
                <p className="text-2xs text-white/40">Connect your own AI provider</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ── Provider grid ───────────────────────────── */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
            <div>
              <p className="text-2xs text-white/30 uppercase tracking-wider mb-3 font-medium">Select Provider</p>
              <div className="grid grid-cols-2 gap-2">
                {PROVIDERS.map((p) => {
                  const isSelected = config.providerId === p.id
                  return (
                    <button
                      key={p.id}
                      onClick={() => setConfig((c) => ({
                        ...c,
                        providerId: p.id,
                        model: c.providerId === p.id ? c.model : '',
                      }))}
                      className={cn(
                        'p-3 rounded-xl border text-left transition-all',
                        isSelected
                          ? 'border-accent/40 bg-accent/[0.06]'
                          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]'
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {isSelected && <Check className="w-3 h-3 text-accent shrink-0" />}
                        <span className={cn('text-xs font-semibold', isSelected ? 'text-accent' : 'text-white/70')}>
                          {p.name}
                        </span>
                      </div>
                      <p className="text-2xs text-white/30 leading-relaxed">{p.description}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Provider form ────────────────────────── */}
            {selectedProvider && (
              <div className="pt-3 border-t border-white/[0.06]">
                <p className="text-2xs text-white/30 uppercase tracking-wider mb-3 font-medium">
                  {selectedProvider.name} Configuration
                </p>
                <ProviderForm
                  providerId={selectedProvider.id}
                  fields={config.fields}
                  model={config.model}
                  models={selectedProvider.models}
                  onFieldChange={(key, val) => setConfig((c) => ({
                    ...c,
                    fields: { ...c.fields, [key]: val },
                  }))}
                  onModelChange={(m) => setConfig((c) => ({ ...c, model: m }))}
                />
              </div>
            )}

            {/* Security notice */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
              <Shield className="w-3.5 h-3.5 text-white/20 shrink-0 mt-0.5" />
              <p className="text-2xs text-white/30 leading-relaxed">
                API keys are stored locally in your browser. They are never sent to CoderXP servers — requests go directly to your provider.
              </p>
            </div>
          </div>

          {/* ── Footer ──────────────────────────────────── */}
          <div className="px-5 py-3 border-t border-white/[0.06] shrink-0 flex items-center gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/60 hover:bg-white/[0.04] transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-accent hover:bg-accent/90 text-white transition-all"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
