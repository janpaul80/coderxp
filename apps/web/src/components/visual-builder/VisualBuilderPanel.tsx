/**
 * VisualBuilderPanel.tsx — Main Visual Builder container
 *
 * Orchestrates the visual builder experience by composing:
 *  - VisualBuilderToolbar (top bar)
 *  - ComponentTree (left panel)
 *  - Preview iframe (center, passed via prop)
 *  - PropertyPanel (right panel)
 *  - ComponentPalette (bottom drawer)
 *
 * All visual edits flow through vbApi for real server-side persistence:
 *   UI action → vbApi.applyTransform() → server AST transform → file write → HMR → preview update
 *
 * Undo/redo uses file-level snapshots via readFile/writeFile.
 */

import { useCallback, useMemo, useRef } from 'react'
import { useVisualBuilderStore } from './hooks/useVisualBuilderStore'
import { useIframeBridge, type IframeBridgeCallbacks } from './hooks/useIframeBridge'
import { VisualBuilderToolbar } from './VisualBuilderToolbar'
import { ComponentTree } from './ComponentTree'
import { PropertyPanel } from './PropertyPanel'
import { ComponentPalette } from './ComponentPalette'
import * as vbApi from './lib/vbApi'

// ─── Props ────────────────────────────────────────────────────

interface VisualBuilderPanelProps {
  /** The preview iframe ref */
  iframeRef: React.RefObject<HTMLIFrameElement | null>
  /** The preview content (rendered by parent) */
  children: React.ReactNode
}

// ─── Component ───────────────────────────────────────────────

export function VisualBuilderPanel({ iframeRef, children }: VisualBuilderPanelProps) {
  const enabled = useVisualBuilderStore((s) => s.enabled)
  const jobId = useVisualBuilderStore((s) => s.jobId)
  const activeFile = useVisualBuilderStore((s) => s.activeFile)
  const showComponentTree = useVisualBuilderStore((s) => s.showComponentTree)
  const showPropertyPanel = useVisualBuilderStore((s) => s.showPropertyPanel)
  const showComponentPalette = useVisualBuilderStore((s) => s.showComponentPalette)
  const setTree = useVisualBuilderStore((s) => s.setTree)
  const setBridgeReady = useVisualBuilderStore((s) => s.setBridgeReady)
  const setSelectedElement = useVisualBuilderStore((s) => s.setSelectedElement)
  const setHoveredElement = useVisualBuilderStore((s) => s.setHoveredElement)
  const pushUndo = useVisualBuilderStore((s) => s.pushUndo)
  const setEditInFlight = useVisualBuilderStore((s) => s.setEditInFlight)

  // Track file content before edits for undo snapshots
  const preEditContentRef = useRef<string | null>(null)

  // ── Snapshot: capture file content before an edit ──────────
  const capturePreEditSnapshot = useCallback(async () => {
    if (!jobId || !activeFile) return
    if (preEditContentRef.current !== null) return // Already captured
    try {
      preEditContentRef.current = await vbApi.readFile(jobId, activeFile)
    } catch {
      preEditContentRef.current = null
    }
  }, [jobId, activeFile])

  // ── Push undo entry after a successful edit ───────────────
  const pushUndoAfterEdit = useCallback(async (description: string) => {
    if (!jobId || !activeFile) return
    const previousContent = preEditContentRef.current
    if (!previousContent) return
    try {
      const newContent = await vbApi.readFile(jobId, activeFile)
      pushUndo({
        filePath: activeFile,
        previousContent,
        newContent,
        description,
        timestamp: Date.now(),
      })
    } catch {
      // Non-critical — undo just won't be available for this edit
    }
    preEditContentRef.current = null
  }, [jobId, activeFile, pushUndo])

  // ── Bridge callbacks ─────────────────────────────────────

  const bridgeCallbacks: IframeBridgeCallbacks = useMemo(() => ({
    onReady: (tree, totalNodes) => {
      setTree(tree, totalNodes)
      setBridgeReady(true)
      // Auto-expand top-level sections
      const { expandedNodes, toggleNodeExpanded } = useVisualBuilderStore.getState()
      for (const node of tree) {
        if (!expandedNodes.has(node.vbId)) {
          toggleNodeExpanded(node.vbId)
        }
      }
    },
    onElementHover: (data) => {
      setHoveredElement({
        vbId: data.vbId,
        tag: data.tag,
        componentName: data.componentName,
        className: data.className,
        rect: data.rect,
        depth: data.depth,
      })
    },
    onElementClick: (data) => {
      setSelectedElement({
        vbId: data.vbId,
        tag: data.tag,
        componentName: data.componentName,
        className: data.className,
        textContent: data.textContent,
        sectionType: data.sectionType,
        rect: data.rect,
        breadcrumb: data.breadcrumb,
      })
    },
    onElementUnhover: () => {
      setHoveredElement(null)
    },
    onTreeUpdate: (tree, totalNodes, _reason) => {
      setTree(tree, totalNodes)
    },
    onTextCommitted: async (vbId, _oldText, newText) => {
      // Inline text edit committed in iframe → persist to source file via AST
      if (!jobId || !activeFile) return
      setEditInFlight(true)
      try {
        await capturePreEditSnapshot()
        await vbApi.applyTransform(jobId, activeFile, {
          type: 'replaceText',
          vbId,
          newText,
        })
        await pushUndoAfterEdit(`Edit text on <${vbId}>`)
      } catch (err) {
        console.error('[VB] Text commit failed:', err)
      } finally {
        setEditInFlight(false)
      }
    },
  }), [setTree, setBridgeReady, setSelectedElement, setHoveredElement, jobId, activeFile, setEditInFlight, capturePreEditSnapshot, pushUndoAfterEdit])

  // ── Bridge hook ──────────────────────────────────────────

  const {
    selectElement,
    deselectElement,
    highlightElement,
    updateStyle,
    updateText,
    startTextEdit,
  } = useIframeBridge(iframeRef, enabled, bridgeCallbacks)

  // ── Event handlers ───────────────────────────────────────

  const handleSelectElement = useCallback((vbId: string) => {
    selectElement(vbId)
  }, [selectElement])

  const handleHoverElement = useCallback((vbId: string | null) => {
    if (vbId) {
      highlightElement(vbId)
    } else {
      setHoveredElement(null)
    }
  }, [highlightElement, setHoveredElement])

  const handleClassNameChange = useCallback(async (vbId: string, newClassName: string) => {
    // 1. Immediately update the preview via bridge (instant feedback)
    updateStyle(vbId, newClassName)

    // 2. Persist to source file via AST transform on server
    if (!jobId || !activeFile) return
    setEditInFlight(true)
    try {
      await capturePreEditSnapshot()
      await vbApi.applyTransform(jobId, activeFile, {
        type: 'replaceClassName',
        vbId,
        newClassName,
      })
      await pushUndoAfterEdit(`Change classes on <${vbId}>`)
    } catch (err) {
      console.error('[VB] ClassName change failed:', err)
    } finally {
      setEditInFlight(false)
    }
  }, [updateStyle, jobId, activeFile, setEditInFlight, capturePreEditSnapshot, pushUndoAfterEdit])

  const handleTextChange = useCallback(async (vbId: string, newText: string) => {
    // 1. Immediately update preview via bridge
    updateText(vbId, newText)

    // 2. Persist to source file
    if (!jobId || !activeFile) return
    setEditInFlight(true)
    try {
      await capturePreEditSnapshot()
      await vbApi.applyTransform(jobId, activeFile, {
        type: 'replaceText',
        vbId,
        newText,
      })
      await pushUndoAfterEdit(`Edit text on <${vbId}>`)
    } catch (err) {
      console.error('[VB] Text change failed:', err)
    } finally {
      setEditInFlight(false)
    }
  }, [updateText, jobId, activeFile, setEditInFlight, capturePreEditSnapshot, pushUndoAfterEdit])

  const handleDelete = useCallback(async (vbId: string) => {
    if (!jobId || !activeFile) return
    setEditInFlight(true)
    try {
      await capturePreEditSnapshot()
      await vbApi.applyTransform(jobId, activeFile, {
        type: 'delete',
        vbId,
      })
      await pushUndoAfterEdit(`Delete <${vbId}>`)
      setSelectedElement(null)
      deselectElement()
    } catch (err) {
      console.error('[VB] Delete failed:', err)
    } finally {
      setEditInFlight(false)
    }
  }, [jobId, activeFile, setEditInFlight, capturePreEditSnapshot, pushUndoAfterEdit, setSelectedElement, deselectElement])

  const handleMoveUp = useCallback(async (vbId: string) => {
    if (!jobId || !activeFile) return
    setEditInFlight(true)
    try {
      await capturePreEditSnapshot()
      // Find the element's parent and current index from the tree
      const { selectedElement } = useVisualBuilderStore.getState()
      if (!selectedElement?.breadcrumb || selectedElement.breadcrumb.length < 2) return
      const parentVbId = selectedElement.breadcrumb[selectedElement.breadcrumb.length - 2].vbId
      await vbApi.applyTransform(jobId, activeFile, {
        type: 'reorder',
        parentVbId,
        childVbId: vbId,
        newIndex: -1, // Server interprets -1 as "move up by one"
      })
      await pushUndoAfterEdit(`Move <${vbId}> up`)
    } catch (err) {
      console.error('[VB] Move up failed:', err)
    } finally {
      setEditInFlight(false)
    }
  }, [jobId, activeFile, setEditInFlight, capturePreEditSnapshot, pushUndoAfterEdit])

  const handleMoveDown = useCallback(async (vbId: string) => {
    if (!jobId || !activeFile) return
    setEditInFlight(true)
    try {
      await capturePreEditSnapshot()
      const { selectedElement } = useVisualBuilderStore.getState()
      if (!selectedElement?.breadcrumb || selectedElement.breadcrumb.length < 2) return
      const parentVbId = selectedElement.breadcrumb[selectedElement.breadcrumb.length - 2].vbId
      await vbApi.applyTransform(jobId, activeFile, {
        type: 'reorder',
        parentVbId,
        childVbId: vbId,
        newIndex: 999, // Server interprets 999 as "move down by one"
      })
      await pushUndoAfterEdit(`Move <${vbId}> down`)
    } catch (err) {
      console.error('[VB] Move down failed:', err)
    } finally {
      setEditInFlight(false)
    }
  }, [jobId, activeFile, setEditInFlight, capturePreEditSnapshot, pushUndoAfterEdit])

  // ── Undo / redo (file-level snapshot restore) ──────────

  const handleUndo = useCallback(async () => {
    const { undoStack, redoStack } = useVisualBuilderStore.getState()
    if (undoStack.length === 0 || !jobId) return

    const entry = undoStack[undoStack.length - 1]
    setEditInFlight(true)
    try {
      await vbApi.writeFile(jobId, entry.filePath, entry.previousContent)
      // Move entry from undo → redo
      useVisualBuilderStore.setState({
        undoStack: undoStack.slice(0, -1),
        redoStack: [...redoStack, entry],
      })
    } catch (err) {
      console.error('[VB] Undo failed:', err)
    } finally {
      setEditInFlight(false)
    }
  }, [jobId, setEditInFlight])

  const handleRedo = useCallback(async () => {
    const { undoStack, redoStack } = useVisualBuilderStore.getState()
    if (redoStack.length === 0 || !jobId) return

    const entry = redoStack[redoStack.length - 1]
    setEditInFlight(true)
    try {
      await vbApi.writeFile(jobId, entry.filePath, entry.newContent)
      // Move entry from redo → undo
      useVisualBuilderStore.setState({
        redoStack: redoStack.slice(0, -1),
        undoStack: [...undoStack, entry],
      })
    } catch (err) {
      console.error('[VB] Redo failed:', err)
    } finally {
      setEditInFlight(false)
    }
  }, [jobId, setEditInFlight])

  // ── Component palette insertion ────────────────────────

  const handleInsertComponent = useCallback(async (
    parentVbId: string,
    index: number,
    jsx: string,
    importNeeded?: { source: string; specifier: string },
  ) => {
    if (!jobId || !activeFile) return
    setEditInFlight(true)
    try {
      await capturePreEditSnapshot()
      await vbApi.insertComponent(jobId, activeFile, parentVbId, index, jsx, importNeeded)
      await pushUndoAfterEdit(`Insert component into <${parentVbId}>`)
    } catch (err) {
      console.error('[VB] Insert failed:', err)
    } finally {
      setEditInFlight(false)
    }
  }, [jobId, activeFile, setEditInFlight, capturePreEditSnapshot, pushUndoAfterEdit])

  // ── Render ───────────────────────────────────────────────

  // If not enabled, just render children (preview) without VB panels
  if (!enabled) {
    return (
      <div className="flex flex-col h-full">
        <VisualBuilderToolbar onUndo={handleUndo} onRedo={handleRedo} />
        <div className="flex-1 min-h-0">
          {children}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <VisualBuilderToolbar onUndo={handleUndo} onRedo={handleRedo} />

      <div className="flex-1 min-h-0 flex">
        {/* Left panel: Component Tree */}
        {showComponentTree && (
          <div className="w-56 shrink-0 border-r border-white/[0.06] bg-base-elevated/30 overflow-hidden">
            <ComponentTree
              onSelectElement={handleSelectElement}
              onHoverElement={handleHoverElement}
            />
          </div>
        )}

        {/* Center: Preview iframe */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-hidden">
            {children}
          </div>

          {/* Bottom drawer: Component Palette */}
          {showComponentPalette && (
            <div className="shrink-0 h-56 border-t border-white/[0.06] bg-base-elevated/40 overflow-hidden">
              <ComponentPalette onInsert={handleInsertComponent} />
            </div>
          )}
        </div>

        {/* Right panel: Property Panel */}
        {showPropertyPanel && (
          <div className="w-64 shrink-0 border-l border-white/[0.06] bg-base-elevated/30 overflow-hidden">
            <PropertyPanel
              onClassNameChange={handleClassNameChange}
              onTextChange={handleTextChange}
              onDelete={handleDelete}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
            />
          </div>
        )}
      </div>
    </div>
  )
}
