import React, { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, ToggleLeft, ToggleRight, Loader2, AlertCircle } from 'lucide-react'
import { rulesApi, type UserRule } from '@/lib/api'
import { cn } from '@/lib/utils'
// Simple ID generator — avoids adding nanoid as a dep
function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

// ─── Types ────────────────────────────────────────────────────

type Category = UserRule['category']

const CATEGORIES: { value: Category; label: string; color: string }[] = [
  { value: 'stack',   label: 'Stack',   color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  { value: 'style',   label: 'Style',   color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  { value: 'deploy',  label: 'Deploy',  color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  { value: 'install', label: 'Install', color: 'bg-green-500/20 text-green-300 border-green-500/30' },
  { value: 'general', label: 'General', color: 'bg-white/10 text-text-secondary border-white/20' },
]

function categoryStyle(cat: Category) {
  return CATEGORIES.find(c => c.value === cat)?.color ?? CATEGORIES[4].color
}

// ─── Rule row ─────────────────────────────────────────────────

function RuleRow({
  rule,
  onToggle,
  onDelete,
}: {
  rule: UserRule
  onToggle: (rule: UserRule) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className={cn(
      'flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-all',
      rule.active
        ? 'bg-white/[0.03] border-white/[0.07]'
        : 'bg-transparent border-white/[0.04] opacity-50'
    )}>
      <button
        onClick={() => onToggle(rule)}
        className="mt-0.5 shrink-0 text-text-muted hover:text-accent transition-colors"
        title={rule.active ? 'Disable rule' : 'Enable rule'}
      >
        {rule.active
          ? <ToggleRight className="w-4 h-4 text-accent" />
          : <ToggleLeft className="w-4 h-4" />
        }
      </button>

      <div className="flex-1 min-w-0">
        <p className="text-xs text-text-primary leading-relaxed break-words">{rule.content}</p>
        <span className={cn(
          'inline-block mt-1 text-2xs px-1.5 py-0.5 rounded border font-medium',
          categoryStyle(rule.category)
        )}>
          {rule.category}
        </span>
      </div>

      <button
        onClick={() => onDelete(rule.id)}
        className="mt-0.5 shrink-0 text-text-muted hover:text-error transition-colors"
        title="Delete rule"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ─── Add rule form ────────────────────────────────────────────

function AddRuleForm({ onAdd }: { onAdd: (content: string, category: Category) => Promise<void> }) {
  const [content, setContent] = useState('')
  const [category, setCategory] = useState<Category>('general')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = content.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      await onAdd(trimmed, category)
      setContent('')
      setCategory('general')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 pt-3 border-t border-white/[0.06]">
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="e.g. Always use Tailwind CSS for styling"
        rows={2}
        className={cn(
          'w-full resize-none rounded-lg px-3 py-2 text-xs',
          'bg-white/[0.04] border border-white/[0.08] text-text-primary placeholder:text-text-muted',
          'focus:outline-none focus:border-accent/40 focus:bg-white/[0.06] transition-all'
        )}
      />
      <div className="flex items-center gap-2">
        <select
          value={category}
          onChange={e => setCategory(e.target.value as Category)}
          className={cn(
            'flex-1 rounded-lg px-2.5 py-1.5 text-xs',
            'bg-white/[0.04] border border-white/[0.08] text-text-secondary',
            'focus:outline-none focus:border-accent/40 transition-all'
          )}
        >
          {CATEGORIES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!content.trim() || saving}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
            'bg-accent/15 border border-accent/25 text-accent',
            'hover:bg-accent/25 hover:border-accent/40',
            'disabled:opacity-40 disabled:cursor-not-allowed'
          )}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Add Rule
        </button>
      </div>
    </form>
  )
}

// ─── Rules list ───────────────────────────────────────────────

function RulesList({
  rules,
  loading,
  error,
  onToggle,
  onDelete,
  onAdd,
}: {
  rules: UserRule[]
  loading: boolean
  error: string | null
  onToggle: (rule: UserRule) => void
  onDelete: (id: string) => void
  onAdd: (content: string, category: Category) => Promise<void>
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 py-4 text-xs text-error">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        {error}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {rules.length === 0 ? (
        <p className="text-xs text-text-muted py-4 text-center">
          No rules yet. Add one below to guide every build.
        </p>
      ) : (
        rules.map(rule => (
          <RuleRow key={rule.id} rule={rule} onToggle={onToggle} onDelete={onDelete} />
        ))
      )}
      <AddRuleForm onAdd={onAdd} />
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────

interface RulesPanelProps {
  projectId?: string | null
}

export function RulesPanel({ projectId }: RulesPanelProps) {
  const [tab, setTab] = useState<'user' | 'project'>('user')
  const [userRules, setUserRules] = useState<UserRule[]>([])
  const [projectRules, setProjectRules] = useState<UserRule[]>([])
  const [loadingUser, setLoadingUser] = useState(false)
  const [loadingProject, setLoadingProject] = useState(false)
  const [errorUser, setErrorUser] = useState<string | null>(null)
  const [errorProject, setErrorProject] = useState<string | null>(null)

  // ── Load user rules ──────────────────────────────────────
  const loadUserRules = useCallback(async () => {
    setLoadingUser(true)
    setErrorUser(null)
    try {
      const res = await rulesApi.getUserRules()
      setUserRules(res.data.rules ?? [])
    } catch {
      setErrorUser('Failed to load rules')
    } finally {
      setLoadingUser(false)
    }
  }, [])

  // ── Load project rules ───────────────────────────────────
  const loadProjectRules = useCallback(async () => {
    if (!projectId) return
    setLoadingProject(true)
    setErrorProject(null)
    try {
      const res = await rulesApi.getProjectRules(projectId)
      setProjectRules(res.data.rules ?? [])
    } catch {
      setErrorProject('Failed to load project rules')
    } finally {
      setLoadingProject(false)
    }
  }, [projectId])

  useEffect(() => { loadUserRules() }, [loadUserRules])
  useEffect(() => { if (projectId) loadProjectRules() }, [projectId, loadProjectRules])

  // ── User rule actions ────────────────────────────────────
  const addUserRule = async (content: string, category: Category) => {
    const rule: UserRule = { id: genId(), content, category, active: true, createdAt: new Date().toISOString() }
    await rulesApi.upsertUserRule(rule)
    setUserRules(prev => [...prev, rule])
  }

  const toggleUserRule = async (rule: UserRule) => {
    const updated = { ...rule, active: !rule.active }
    await rulesApi.upsertUserRule(updated)
    setUserRules(prev => prev.map(r => r.id === rule.id ? updated : r))
  }

  const deleteUserRule = async (id: string) => {
    await rulesApi.deleteUserRule(id)
    setUserRules(prev => prev.filter(r => r.id !== id))
  }

  // ── Project rule actions ─────────────────────────────────
  const addProjectRule = async (content: string, category: Category) => {
    if (!projectId) return
    const rule: UserRule = { id: genId(), content, category, active: true, createdAt: new Date().toISOString() }
    await rulesApi.upsertProjectRule(projectId, rule)
    setProjectRules(prev => [...prev, rule])
  }

  const toggleProjectRule = async (rule: UserRule) => {
    if (!projectId) return
    const updated = { ...rule, active: !rule.active }
    await rulesApi.upsertProjectRule(projectId, updated)
    setProjectRules(prev => prev.map(r => r.id === rule.id ? updated : r))
  }

  const deleteProjectRule = async (id: string) => {
    if (!projectId) return
    await rulesApi.deleteProjectRule(projectId, id)
    setProjectRules(prev => prev.filter(r => r.id !== id))
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Description ─────────────────────────────────── */}
      <p className="text-xs text-text-muted leading-relaxed">
        Rules are always injected into the AI system prompt and take priority over defaults.
        Use them to enforce your preferred stack, style, or deployment constraints.
      </p>

      {/* ── Tabs ────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 bg-white/[0.04] rounded-lg border border-white/[0.06]">
        <button
          onClick={() => setTab('user')}
          className={cn(
            'flex-1 py-1.5 text-xs font-medium rounded-md transition-all',
            tab === 'user'
              ? 'bg-accent/15 text-accent border border-accent/25'
              : 'text-text-muted hover:text-text-secondary'
          )}
        >
          My Rules
        </button>
        <button
          onClick={() => setTab('project')}
          disabled={!projectId}
          className={cn(
            'flex-1 py-1.5 text-xs font-medium rounded-md transition-all',
            tab === 'project'
              ? 'bg-accent/15 text-accent border border-accent/25'
              : 'text-text-muted hover:text-text-secondary',
            !projectId && 'opacity-40 cursor-not-allowed'
          )}
        >
          Project Rules
          {!projectId && <span className="ml-1 text-2xs">(no project)</span>}
        </button>
      </div>

      {/* ── Content ─────────────────────────────────────── */}
      {tab === 'user' ? (
        <RulesList
          rules={userRules}
          loading={loadingUser}
          error={errorUser}
          onToggle={toggleUserRule}
          onDelete={deleteUserRule}
          onAdd={addUserRule}
        />
      ) : (
        <RulesList
          rules={projectRules}
          loading={loadingProject}
          error={errorProject}
          onToggle={toggleProjectRule}
          onDelete={deleteProjectRule}
          onAdd={addProjectRule}
        />
      )}
    </div>
  )
}
