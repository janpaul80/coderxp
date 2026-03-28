/**
 * ComponentTree.tsx — Visual Builder component tree sidebar panel
 *
 * Shows the hierarchical structure of the page as extracted from the preview iframe.
 * Supports:
 *  - Expand/collapse nodes
 *  - Click to select (highlights in preview)
 *  - Hover to highlight (shows overlay in preview)
 *  - Section type badges
 *  - Depth indentation
 */

import { ChevronRight, ChevronDown, Box, Type, Code2, LayoutDashboard, Hash } from 'lucide-react'
import { useVisualBuilderStore } from './hooks/useVisualBuilderStore'
import type { VBNodeDescriptor } from './lib/bridgeProtocol'
import { cn } from '@/lib/utils'

// ─── Node type icons ─────────────────────────────────────────

function NodeIcon({ node }: { node: VBNodeDescriptor }) {
  if (node.sectionType) return <LayoutDashboard className="w-3 h-3 text-amber-400 shrink-0" />
  if (node.componentName) return <Box className="w-3 h-3 text-indigo-400 shrink-0" />
  if (node.isTextOnly) return <Type className="w-3 h-3 text-emerald-400 shrink-0" />
  if (node.tag === '#expression') return <Code2 className="w-3 h-3 text-orange-400 shrink-0" />
  return <Hash className="w-3 h-3 text-gray-500 shrink-0" />
}

function nodeLabel(node: VBNodeDescriptor): string {
  if (node.componentName) return node.componentName
  if (node.sectionType) return `${node.tag} [${node.sectionType}]`
  return node.tag
}

// ─── Tree node component ────────────────────────────────────

interface TreeNodeProps {
  node: VBNodeDescriptor
  onSelect: (vbId: string) => void
  onHover: (vbId: string | null) => void
  selectedId: string | null
  hoveredId: string | null
}

function TreeNode({ node, onSelect, onHover, selectedId, hoveredId }: TreeNodeProps) {
  const { expandedNodes, toggleNodeExpanded } = useVisualBuilderStore()
  const isExpanded = expandedNodes.has(node.vbId)
  const isSelected = selectedId === node.vbId
  const isHovered = hoveredId === node.vbId
  const hasChildren = node.children.length > 0

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded cursor-pointer transition-all duration-100 text-xs',
          isSelected && 'bg-amber-500/15 text-amber-300',
          isHovered && !isSelected && 'bg-indigo-500/10 text-indigo-300',
          !isSelected && !isHovered && 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]',
        )}
        style={{ paddingLeft: `${node.depth * 12 + 8}px` }}
        onClick={() => onSelect(node.vbId)}
        onMouseEnter={() => onHover(node.vbId)}
        onMouseLeave={() => onHover(null)}
      >
        {/* Expand toggle */}
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); toggleNodeExpanded(node.vbId) }}
            className="p-0.5 rounded hover:bg-white/[0.08] transition shrink-0"
          >
            {isExpanded
              ? <ChevronDown className="w-3 h-3" />
              : <ChevronRight className="w-3 h-3" />
            }
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        <NodeIcon node={node} />
        <span className="truncate font-mono text-2xs">{nodeLabel(node)}</span>

        {/* Section badge */}
        {node.sectionType && (
          <span className="ml-auto shrink-0 px-1.5 py-0.5 rounded text-2xs bg-amber-500/10 text-amber-400 border border-amber-500/20">
            {node.sectionType}
          </span>
        )}

        {/* Text preview */}
        {node.isTextOnly && node.textContent && (
          <span className="ml-auto truncate max-w-[80px] text-2xs text-gray-600 italic">
            {node.textContent.slice(0, 30)}
          </span>
        )}
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.vbId}
              node={child}
              onSelect={onSelect}
              onHover={onHover}
              selectedId={selectedId}
              hoveredId={hoveredId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────

interface ComponentTreeProps {
  onSelectElement: (vbId: string) => void
  onHoverElement: (vbId: string | null) => void
}

export function ComponentTree({ onSelectElement, onHoverElement }: ComponentTreeProps) {
  const tree = useVisualBuilderStore((s) => s.tree)
  const totalNodes = useVisualBuilderStore((s) => s.totalNodes)
  const selectedElement = useVisualBuilderStore((s) => s.selectedElement)
  const hoveredElement = useVisualBuilderStore((s) => s.hoveredElement)
  const { expandAll, collapseAll } = useVisualBuilderStore()

  const selectedId = selectedElement?.vbId ?? null
  const hoveredId = hoveredElement?.vbId ?? null

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
        <span className="text-xs font-medium text-gray-300">Component Tree</span>
        <div className="flex items-center gap-1">
          <span className="text-2xs text-gray-600">{totalNodes} nodes</span>
          <button
            onClick={expandAll}
            className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition text-2xs"
            title="Expand all"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
          <button
            onClick={collapseAll}
            className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition text-2xs"
            title="Collapse all"
          >
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {tree.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-xs text-gray-500">No elements detected.</p>
            <p className="text-2xs text-gray-600 mt-1">The preview may still be loading.</p>
          </div>
        ) : (
          tree.map((node) => (
            <TreeNode
              key={node.vbId}
              node={node}
              onSelect={onSelectElement}
              onHover={onHoverElement}
              selectedId={selectedId}
              hoveredId={hoveredId}
            />
          ))
        )}
      </div>
    </div>
  )
}
