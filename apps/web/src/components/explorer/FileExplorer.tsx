
import React, { useState, useEffect, useCallback } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  X,
  RefreshCw,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import api from '@/lib/api'
import type { FileChangePayload } from '@/types'

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
  selectedPath,
  onFileClick,
  recentChanges,
}: {
  node: FileNode
  depth?: number
  selectedPath?: string
  onFileClick?: (node: FileNode) => void
  recentChanges?: Set<string>
}) {
  const isRecentlyChanged = recentChanges?.has(node.path) ?? false
  const [expanded, setExpanded] = useState(depth < 2)

  const indent = depth * 14
  const isSelected = node.path === selectedPath

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
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onFileClick={onFileClick}
                recentChanges={recentChanges}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={() => onFileClick?.(node)}
      className={`flex items-center gap-1.5 w-full text-left px-2 py-0.5 rounded transition-colors cursor-pointer ${
        isSelected
          ? 'bg-primary/10 text-primary'
          : 'hover:bg-white/5 text-muted hover:text-primary/80'
      }`}
      style={{ paddingLeft: `${8 + indent}px` }}
      title={node.path}
    >
      <span className="flex-shrink-0 w-3 h-3" />
      <span className="text-xs flex-shrink-0">{getFileIcon(node.name)}</span>
      <span className="text-xs truncate transition-colors">
        {node.name}
      </span>
      {isRecentlyChanged && (
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0" title="Recently changed by agent" />
      )}
      {node.size !== undefined && (
        <span className="text-xs text-muted/50 ml-auto flex-shrink-0">
          {node.size < 1024
            ? `${node.size}B`
            : node.size < 1024 * 1024
            ? `${(node.size / 1024).toFixed(1)}K`
            : `${(node.size / 1024 / 1024).toFixed(1)}M`}
        </span>
      )}
    </button>
  )
}

// ─── FileViewer component ─────────────────────────────────────

interface FileViewerState {
  path: string
  content: string
  loading: boolean
  error: string | null
}

function FileViewer({
  viewer,
  onClose,
}: {
  viewer: FileViewerState
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    if (!viewer.content) return
    try {
      await navigator.clipboard.writeText(viewer.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }, [viewer.content])

  const fileName = viewer.path.split('/').pop() ?? viewer.path

  return (
    <div className="flex flex-col border-t border-border/30 min-h-0" style={{ height: '55%' }}>
      {/* Viewer header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface/40 flex-shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs flex-shrink-0">{getFileIcon(fileName)}</span>
          <span className="text-xs text-primary/80 font-mono truncate" title={viewer.path}>
            {viewer.path}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {!viewer.loading && !viewer.error && viewer.content && (
            <button
              onClick={handleCopy}
              className="p-1 rounded hover:bg-white/5 text-muted hover:text-primary transition-colors"
              title="Copy content"
            >
              {copied ? (
                <Check className="w-3 h-3 text-green-400" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/5 text-muted hover:text-primary transition-colors"
            title="Close viewer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Viewer content */}
      <div className="flex-1 overflow-auto min-h-0">
        {viewer.loading && (
          <div className="flex items-center justify-center h-16 gap-2 text-muted text-xs">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            Loading…
          </div>
        )}
        {viewer.error && (
          <div className="flex items-start gap-2 m-2 p-2 rounded bg-red-500/10 border border-red-500/20">
            <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-400">{viewer.error}</p>
          </div>
        )}
        {!viewer.loading && !viewer.error && (
          <pre className="text-xs font-mono text-primary/70 p-3 whitespace-pre-wrap break-all leading-relaxed">
            {viewer.content || <span className="text-muted italic">Empty file</span>}
          </pre>
        )}
      </div>
    </div>
  )
}

// ─── FileExplorer component ───────────────────────────────────

export function FileExplorer({ onClose }: FileExplorerProps) {
  const activeJob = useAppStore((s) => s.activeJob)
  const fileChanges = useAppStore((s) => s.fileChanges)
  const [tree, setTree] = useState<FileNode[]>([])

  // Build set of recently changed file paths for visual indicators
  const recentChanges = React.useMemo(() => {
    const paths = new Set<string>()
    // Show changes from last 60 seconds
    const cutoff = Date.now() - 60_000
    for (const change of fileChanges) {
      if (new Date(change.timestamp).getTime() > cutoff) {
        paths.add(change.filePath)
      }
    }
    return paths
  }, [fileChanges])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileCount, setFileCount] = useState(0)
  const [viewer, setViewer] = useState<FileViewerState | null>(null)

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

  const handleFileClick = useCallback(async (node: FileNode) => {
    if (!activeJob?.id) return
    // Show loading state immediately
    setViewer({ path: node.path, content: '', loading: true, error: null })
    try {
      const res = await api.get<{ content: string; path: string; truncated: boolean }>(
        `/api/workspaces/${activeJob.id}/file`,
        { params: { path: node.path } }
      )
      setViewer({ path: node.path, content: res.data.content, loading: false, error: null })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load file'
      setViewer({ path: node.path, content: '', loading: false, error: msg })
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

      {/* File tree */}
      <div className={`overflow-y-auto py-2 min-h-0 ${viewer ? 'flex-none' : 'flex-1'}`}
        style={viewer ? { height: '45%' } : undefined}
      >
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
          <TreeNode
            key={node.path}
            node={node}
            depth={0}
            selectedPath={viewer?.path}
            onFileClick={handleFileClick}
            recentChanges={recentChanges}
          />
        ))}
      </div>

      {/* Inline file viewer */}
      {viewer && (
        <FileViewer
          viewer={viewer}
          onClose={() => setViewer(null)}
        />
      )}

      {/* Footer */}
      {activeJob?.workspacePath && !viewer && (
        <div className="px-3 py-2 border-t border-border/20 flex-shrink-0">
          <p className="text-xs text-muted/50 truncate font-mono" title={activeJob.workspacePath}>
            {activeJob.workspacePath.split(/[\\/]/).slice(-2).join('/')}
          </p>
        </div>
      )}
    </div>
  )
}
