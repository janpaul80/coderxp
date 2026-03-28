/**
 * VisualBuilderToolbar.tsx — Top toolbar for Visual Builder mode
 *
 * Contains:
 *  - Visual Builder enable/disable toggle
 *  - Panel visibility toggles (tree, properties)
 *  - Undo / redo buttons
 *  - Status indicators (bridge ready, syncable file count)
 */

import {
  Undo2, Redo2,
  PanelLeft, PanelRight, PanelBottom, Layers, CheckCircle2,
  AlertTriangle, Loader2,
} from 'lucide-react'
import { useVisualBuilderStore } from './hooks/useVisualBuilderStore'
import { cn } from '@/lib/utils'

interface VisualBuilderToolbarProps {
  onUndo: () => void
  onRedo: () => void
}

export function VisualBuilderToolbar({ onUndo, onRedo }: VisualBuilderToolbarProps) {
  const enabled = useVisualBuilderStore((s) => s.enabled)
  const toggleEnabled = useVisualBuilderStore((s) => s.toggleEnabled)
  const bridgeReady = useVisualBuilderStore((s) => s.bridgeReady)
  const totalNodes = useVisualBuilderStore((s) => s.totalNodes)
  const undoStack = useVisualBuilderStore((s) => s.undoStack)
  const redoStack = useVisualBuilderStore((s) => s.redoStack)
  const editInFlight = useVisualBuilderStore((s) => s.editInFlight)
  const showComponentTree = useVisualBuilderStore((s) => s.showComponentTree)
  const showPropertyPanel = useVisualBuilderStore((s) => s.showPropertyPanel)
  const showComponentPalette = useVisualBuilderStore((s) => s.showComponentPalette)
  const toggleComponentTree = useVisualBuilderStore((s) => s.toggleComponentTree)
  const togglePropertyPanel = useVisualBuilderStore((s) => s.togglePropertyPanel)
  const toggleComponentPalette = useVisualBuilderStore((s) => s.toggleComponentPalette)

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.06] bg-base-elevated/40">
      {/* VB toggle */}
      <button
        onClick={toggleEnabled}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-2xs font-medium transition-all border',
          enabled
            ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20'
            : 'bg-white/[0.04] border-white/[0.08] text-gray-500 hover:text-gray-300 hover:border-white/[0.12]'
        )}
      >
        <Layers className="w-3 h-3" />
        {enabled ? 'Visual Builder' : 'Enable Builder'}
      </button>

      {enabled && (
        <>
          {/* Divider */}
          <div className="w-px h-4 bg-white/[0.08]" />

          {/* Bridge status */}
          <div className="flex items-center gap-1 text-2xs">
            {bridgeReady ? (
              <>
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span className="text-gray-400">{totalNodes} elements</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                <span className="text-gray-500">Connecting...</span>
              </>
            )}
          </div>

          {/* Divider */}
          <div className="w-px h-4 bg-white/[0.08]" />

          {/* Panel toggles */}
          <button
            onClick={toggleComponentTree}
            className={cn(
              'p-1 rounded transition',
              showComponentTree ? 'text-indigo-400 bg-indigo-500/10' : 'text-gray-500 hover:text-gray-300'
            )}
            title={showComponentTree ? 'Hide component tree' : 'Show component tree'}
          >
            <PanelLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={togglePropertyPanel}
            className={cn(
              'p-1 rounded transition',
              showPropertyPanel ? 'text-indigo-400 bg-indigo-500/10' : 'text-gray-500 hover:text-gray-300'
            )}
            title={showPropertyPanel ? 'Hide properties' : 'Show properties'}
          >
            <PanelRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={toggleComponentPalette}
            className={cn(
              'p-1 rounded transition',
              showComponentPalette ? 'text-indigo-400 bg-indigo-500/10' : 'text-gray-500 hover:text-gray-300'
            )}
            title={showComponentPalette ? 'Hide component palette' : 'Show component palette'}
          >
            <PanelBottom className="w-3.5 h-3.5" />
          </button>

          {/* Divider */}
          <div className="w-px h-4 bg-white/[0.08]" />

          {/* Edit in-flight indicator */}
          {editInFlight && (
            <div className="flex items-center gap-1 text-2xs text-indigo-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Saving...</span>
            </div>
          )}

          {/* Undo / redo */}
          <button
            onClick={onUndo}
            disabled={undoStack.length === 0}
            className="p-1 rounded text-gray-500 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
            title={`Undo (${undoStack.length})`}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onRedo}
            disabled={redoStack.length === 0}
            className="p-1 rounded text-gray-500 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
            title={`Redo (${redoStack.length})`}
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  )
}
