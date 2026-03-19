import React, { useState, useEffect, useCallback } from 'react'
import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  X,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import api from '@/lib/api'

// ─── Types ────────────────────────────────────────────────────

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  children?: FileNode[]
}

interface FileExplorerProps {
  onClose: () => void
}

// ─── File icon helper ─────────────────────────────────────────

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const icons: Record<string, string> = {
    ts: '🟦', tsx: '⚛️', js: '🟨', jsx: '⚛️',
    css: '🎨', scss: '🎨', html: '🌐',
    json: '📋', md: '📝', txt: '📄',
    png: '🖼️', jpg: '🖼️', jpeg: '🖼️', svg: '🖼️',
    env: '🔑', gitignore: '🚫',
  }
  return icons[ext] ?? '📄'
}

// ─── TreeNode component ───────────────────────────────────────

function TreeNode({
  node,
  depth = 0,
}: {
  node: FileNode
  depth?: number
}) {
  const [expanded, setExpanded] = useState(depth < 2)

  const indent = depth * 14

  if (node.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 w-full text-left px-2 py-0.5 rounded hover:bg-white/5 transition-colors group"
          style={{ paddingLeft: `${8 + indent}px` }}
        >
          <span className="text-muted group-hover:text-primary transition-colors flex-shrink-0">
            {expanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </span>
          <span className="flex-shrink-0">
            {expanded ? (
              <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-amber-400" />
            )}
          </span>
          <span className="text-xs text-primary/80 truncate font-medium">{node.name}</span>
        </button>
        {expanded && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeNode key={child.path} node={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-white/5 transition-colors cursor-default"
      style={{ paddingLeft: `${8 + indent}px` }}
      title={node.path}
    >
      <span className="flex-shrink-0 w-3 h-3" />
      <span className="text-xs flex-shrink-0">{getFileIcon(node.name)}</span>
      <span className="text-xs text-muted hover:text-primary/80 truncate transition-colors">
        {node.name}
      </span>
      {node.size !== undefined && (
        <span className="text-xs text-muted/50 ml-auto flex-shrink-0">
          {node.size < 1024
            ? `${node.size}B`
            : node.size < 1024 * 1024
            ? `${(node.size / 1024).toFixed(1)}K`
            : `${(node.size / 1024 / 1024).toFixed(1)}M`}
        </span>
      )}
    </div>
  )
}

// ─── FileExplorer component ───────────────────────────────────

export function FileExplorer({ onClose }: FileExplorerProps) {
  const activeJob = useAppStore((s) => s.activeJob)
  const [tree, setTree] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileCount, setFileCount] = useState(0)

  const fetchTree = useCallback(async () => {
    if (!activeJob?.id) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<{ files: FileNode[]; total: number }>(
        `/api/workspaces/${activeJob.id}/files`
      )
      setTree(res.data.files ?? [])
      setFileCount(res.data.total ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files')
    } finally {
      setLoading(false)
    }
  }, [activeJob?.id])

  useEffect(() => {
    fetchTree()
  }, [fetchTree])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 flex-shrink-0">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-primary">Generated Files</span>
          {fileCount > 0 && (
            <span className="text-xs text-muted bg-surface/60 px-1.5 py-0.5 rounded-full">
              {fileCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={fetchTree}
            disabled={loading}
            className="p-1.5 rounded hover:bg-white/5 text-muted hover:text-primary transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-white/5 text-muted hover:text-primary transition-colors"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto py-2 min-h-0">
        {loading && tree.length === 0 && (
          <div className="flex items-center justify-center h-24 gap-2 text-muted text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading files…
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 mx-3 mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-red-400 font-medium">Failed to load files</p>
              <p className="text-xs text-muted mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && tree.length === 0 && (
          <div className="flex flex-col items-center justify-center h-24 text-muted text-xs gap-1">
            <Folder className="w-6 h-6 opacity-30" />
            <span>No files yet</span>
          </div>
        )}

        {tree.map((node) => (
          <TreeNode key={node.path} node={node} depth={0} />
        ))}
      </div>

      {/* Footer */}
      {activeJob?.workspacePath && (
        <div className="px-3 py-2 border-t border-border/20 flex-shrink-0">
          <p className="text-xs text-muted/50 truncate font-mono" title={activeJob.workspacePath}>
            {activeJob.workspacePath.split(/[\\/]/).slice(-2).join('/')}
          </p>
        </div>
      )}
    </div>
  )
}
