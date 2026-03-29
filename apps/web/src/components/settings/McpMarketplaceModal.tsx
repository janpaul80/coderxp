import React, { useState, useMemo } from 'react'
import { X, Search, Download, Check, ExternalLink, Tag, Folder, Github, Database, Globe, Brain, MessageSquare, Box, Map, CreditCard, AlertCircle, Plug } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── MCP Server definitions ─────────────────────────────────

interface McpServer {
  id: string
  name: string
  author: string
  description: string
  category: string
  tags: string[]
  icon: React.ReactNode
}

const MCP_CATALOG: McpServer[] = [
  {
    id: 'filesystem',
    name: 'Filesystem',
    author: '@modelcontextprotocol',
    description: 'Read, write, and manage local files and directories',
    category: 'Tools',
    tags: ['files', 'local', 'core'],
    icon: <Folder className="w-4 h-4" />,
  },
  {
    id: 'github',
    name: 'GitHub',
    author: '@modelcontextprotocol',
    description: 'GitHub repository access, PRs, issues, and code search',
    category: 'Code',
    tags: ['git', 'repos', 'ci'],
    icon: <Github className="w-4 h-4" />,
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    author: '@modelcontextprotocol',
    description: 'Query and manage PostgreSQL databases',
    category: 'Database',
    tags: ['sql', 'database', 'query'],
    icon: <Database className="w-4 h-4" />,
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    author: '@modelcontextprotocol',
    description: 'Web and local search via Brave Search API',
    category: 'Search',
    tags: ['web', 'search', 'browse'],
    icon: <Search className="w-4 h-4" />,
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    author: '@modelcontextprotocol',
    description: 'Browser automation, screenshots, and web scraping',
    category: 'Browser',
    tags: ['browser', 'automation', 'scrape'],
    icon: <Globe className="w-4 h-4" />,
  },
  {
    id: 'memory',
    name: 'Memory',
    author: '@modelcontextprotocol',
    description: 'Persistent memory storage using knowledge graph',
    category: 'Tools',
    tags: ['memory', 'storage', 'context'],
    icon: <Brain className="w-4 h-4" />,
  },
  {
    id: 'slack',
    name: 'Slack',
    author: '@modelcontextprotocol',
    description: 'Read and send messages in Slack workspaces',
    category: 'Communication',
    tags: ['chat', 'messaging', 'team'],
    icon: <MessageSquare className="w-4 h-4" />,
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    author: '@modelcontextprotocol',
    description: 'Create and query SQLite databases',
    category: 'Database',
    tags: ['sql', 'database', 'local'],
    icon: <Database className="w-4 h-4" />,
  },
  {
    id: 'docker',
    name: 'Docker',
    author: 'community',
    description: 'Manage Docker containers, images, and networks',
    category: 'DevOps',
    tags: ['containers', 'deployment', 'infra'],
    icon: <Box className="w-4 h-4" />,
  },
  {
    id: 'google-maps',
    name: 'Google Maps',
    author: '@modelcontextprotocol',
    description: 'Geocoding, directions, and place search',
    category: 'API',
    tags: ['maps', 'geo', 'location'],
    icon: <Map className="w-4 h-4" />,
  },
  {
    id: 'stripe',
    name: 'Stripe',
    author: 'community',
    description: 'Manage Stripe payments, subscriptions, and customers',
    category: 'API',
    tags: ['payments', 'billing', 'commerce'],
    icon: <CreditCard className="w-4 h-4" />,
  },
  {
    id: 'sentry',
    name: 'Sentry',
    author: 'community',
    description: 'Error tracking and performance monitoring',
    category: 'Monitoring',
    tags: ['errors', 'debug', 'observability'],
    icon: <AlertCircle className="w-4 h-4" />,
  },
]

const CATEGORIES = ['All', ...Array.from(new Set(MCP_CATALOG.map((s) => s.category))).sort()]

const STORAGE_KEY = 'coderxp_mcp_installed'

function getInstalled(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function setInstalled(ids: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
}

// ─── Component ────────────────────────────────────────────────

interface McpMarketplaceModalProps {
  open: boolean
  onClose: () => void
}

export function McpMarketplaceModal({ open, onClose }: McpMarketplaceModalProps) {
  const [tab, setTab] = useState<'marketplace' | 'installed'>('marketplace')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [installed, setInstalledState] = useState<string[]>(getInstalled)

  const filteredServers = useMemo(() => {
    let list = MCP_CATALOG
    if (tab === 'installed') {
      list = list.filter((s) => installed.includes(s.id))
    }
    if (category !== 'All') {
      list = list.filter((s) => s.category === category)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.tags.some((t) => t.includes(q))
      )
    }
    return list
  }, [tab, category, search, installed])

  if (!open) return null

  function toggleInstall(id: string) {
    const next = installed.includes(id)
      ? installed.filter((i) => i !== id)
      : [...installed, id]
    setInstalledState(next)
    setInstalled(next)
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="fixed z-50 inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div className={cn(
          'pointer-events-auto w-full max-w-lg',
          'bg-[#1D1D1D] border border-white/[0.08] rounded-2xl shadow-card-lg',
          'flex flex-col max-h-[85vh]'
        )}>

          {/* ── Header ──────────────────────────────────── */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-400/15 border border-emerald-400/25 flex items-center justify-center">
                <Plug className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">MCP Servers</h2>
                <p className="text-2xs text-white/40">
                  {installed.length} installed
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ── Tabs ────────────────────────────────────── */}
          <div className="px-5 pt-3 shrink-0">
            <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              {(['marketplace', 'installed'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    'flex-1 py-2 rounded-md text-xs font-medium transition-all',
                    tab === t
                      ? 'bg-white/[0.08] text-white'
                      : 'text-white/40 hover:text-white/60'
                  )}
                >
                  {t === 'marketplace' ? 'Marketplace' : `Installed (${installed.length})`}
                </button>
              ))}
            </div>
          </div>

          {/* ── Search + filters ─────────────────────────── */}
          <div className="px-5 pt-3 pb-2 shrink-0 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search servers..."
                className={cn(
                  'w-full pl-8 pr-3 py-2 rounded-lg text-xs text-white/80 placeholder-white/20',
                  'bg-white/[0.04] border border-white/[0.08]',
                  'focus:outline-none focus:border-accent/40',
                  'transition-all'
                )}
              />
            </div>

            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-2xs font-medium whitespace-nowrap transition-all border',
                    category === c
                      ? 'bg-accent/15 border-accent/30 text-accent'
                      : 'bg-white/[0.03] border-white/[0.06] text-white/40 hover:text-white/60 hover:border-white/[0.10]'
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* ── Server list ──────────────────────────────── */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-2 space-y-2">
            {filteredServers.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-white/30">No servers found</p>
                <p className="text-2xs text-white/20 mt-1">Try adjusting your search</p>
              </div>
            ) : (
              filteredServers.map((server) => {
                const isInstalled = installed.includes(server.id)
                return (
                  <div
                    key={server.id}
                    className={cn(
                      'p-3.5 rounded-xl border transition-all',
                      isInstalled
                        ? 'border-emerald-400/20 bg-emerald-400/[0.03]'
                        : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.10]'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-base shrink-0">
                        {server.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-semibold text-white">{server.name}</span>
                          <span className="text-2xs text-white/25">{server.author}</span>
                        </div>
                        <p className="text-2xs text-white/40 leading-relaxed mb-2">{server.description}</p>
                        <div className="flex items-center gap-1.5">
                          {server.tags.map((t) => (
                            <span
                              key={t}
                              className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-white/[0.04] border border-white/[0.06] text-white/30"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => toggleInstall(server.id)}
                        className={cn(
                          'shrink-0 px-3 py-1.5 rounded-lg text-2xs font-semibold transition-all flex items-center gap-1',
                          isInstalled
                            ? 'bg-emerald-400/15 border border-emerald-400/25 text-emerald-400 hover:bg-red-400/15 hover:border-red-400/25 hover:text-red-400'
                            : 'bg-white/[0.06] border border-white/[0.08] text-white/60 hover:bg-accent/15 hover:border-accent/25 hover:text-accent'
                        )}
                      >
                        {isInstalled ? (
                          <><Check className="w-3 h-3" /> Installed</>
                        ) : (
                          <><Download className="w-3 h-3" /> Install</>
                        )}
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* ── Footer ──────────────────────────────────── */}
          <div className="px-5 py-3 border-t border-white/[0.06] shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-2xs text-white/20">
              <ExternalLink className="w-3 h-3" />
              <span>MCP Protocol</span>
            </div>
            <span className="text-2xs text-white/20">{filteredServers.length} servers</span>
          </div>
        </div>
      </div>
    </>
  )
}
