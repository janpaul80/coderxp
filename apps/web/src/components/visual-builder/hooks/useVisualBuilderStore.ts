/**
 * useVisualBuilderStore.ts — Zustand store for Visual Builder state
 *
 * Manages:
 *  - Visual builder mode toggle (enabled/disabled)
 *  - Component tree from iframe bridge
 *  - Selected / hovered element state
 *  - Undo stack (file-diff based)
 *  - Workspace file sync status
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { VBNodeDescriptor, VBRect } from '../lib/bridgeProtocol'

// ─── Types ────────────────────────────────────────────────────

export interface SelectedElement {
  vbId: string
  tag: string
  componentName?: string
  className: string
  textContent: string
  sectionType?: string
  rect: VBRect
  breadcrumb: Array<{ vbId: string; tag: string; componentName?: string }>
}

export interface HoveredElement {
  vbId: string
  tag: string
  componentName?: string
  className: string
  rect: VBRect
  depth: number
}

export interface UndoEntry {
  /** File path that was modified */
  filePath: string
  /** Previous content (for undo) */
  previousContent: string
  /** New content (for redo) */
  newContent: string
  /** Description of the edit */
  description: string
  /** Timestamp */
  timestamp: number
}

export interface FileSyncStatus {
  /** Relative file path */
  path: string
  /** Whether this file is syncable */
  syncable: boolean
  /** Sync score 0–100 */
  syncScore: number
  /** Component name */
  componentName: string | null
  /** Number of sections detected */
  sectionCount: number
  /** Unsyncable reason if applicable */
  unsyncableReason?: string
}

// ─── Store ────────────────────────────────────────────────────

interface VisualBuilderStore {
  // ── Mode ──
  enabled: boolean
  setEnabled: (enabled: boolean) => void
  toggleEnabled: () => void

  // ── Job context (needed for API calls) ──
  jobId: string | null
  setJobId: (jobId: string | null) => void

  // ── Bridge readiness ──
  bridgeReady: boolean
  setBridgeReady: (ready: boolean) => void

  // ── Component tree from iframe ──
  tree: VBNodeDescriptor[]
  totalNodes: number
  setTree: (tree: VBNodeDescriptor[], totalNodes: number) => void

  // ── Selection ──
  selectedElement: SelectedElement | null
  setSelectedElement: (el: SelectedElement | null) => void

  // ── Hover ──
  hoveredElement: HoveredElement | null
  setHoveredElement: (el: HoveredElement | null) => void

  // ── Active file being edited ──
  activeFile: string | null
  setActiveFile: (filePath: string | null) => void

  // ── File sync status ──
  fileSyncStatuses: FileSyncStatus[]
  setFileSyncStatuses: (statuses: FileSyncStatus[]) => void

  // ── Undo / redo ──
  undoStack: UndoEntry[]
  redoStack: UndoEntry[]
  pushUndo: (entry: UndoEntry) => void
  undo: () => UndoEntry | null
  redo: () => UndoEntry | null
  clearUndoStack: () => void

  // ── Edit state ──
  editInFlight: boolean
  setEditInFlight: (inFlight: boolean) => void

  // ── Tree expansion state (for ComponentTree panel) ──
  expandedNodes: Set<string>
  toggleNodeExpanded: (vbId: string) => void
  expandAll: () => void
  collapseAll: () => void

  // ── Panel visibility ──
  showComponentTree: boolean
  showPropertyPanel: boolean
  showComponentPalette: boolean
  toggleComponentTree: () => void
  togglePropertyPanel: () => void
  toggleComponentPalette: () => void

  // ── Reset ──
  reset: () => void
}

// ─── Store implementation ────────────────────────────────────

function collectAllIds(tree: VBNodeDescriptor[]): string[] {
  const ids: string[] = []
  for (const node of tree) {
    ids.push(node.vbId)
    ids.push(...collectAllIds(node.children))
  }
  return ids
}

export const useVisualBuilderStore = create<VisualBuilderStore>()(
  devtools(
    (set, get) => ({
      // ── Mode ──
      enabled: false,
      setEnabled: (enabled) => set({ enabled, ...(enabled ? {} : { bridgeReady: false, selectedElement: null, hoveredElement: null }) }, false, 'setEnabled'),
      toggleEnabled: () => {
        const current = get().enabled
        set({ enabled: !current, ...(current ? { bridgeReady: false, selectedElement: null, hoveredElement: null } : {}) }, false, 'toggleEnabled')
      },

      // ── Job context ──
      jobId: null,
      setJobId: (jobId) => set({ jobId }, false, 'setJobId'),

      // ── Bridge readiness ──
      bridgeReady: false,
      setBridgeReady: (ready) => set({ bridgeReady: ready }, false, 'setBridgeReady'),

      // ── Component tree ──
      tree: [],
      totalNodes: 0,
      setTree: (tree, totalNodes) => set({ tree, totalNodes }, false, 'setTree'),

      // ── Selection ──
      selectedElement: null,
      setSelectedElement: (el) => set({ selectedElement: el }, false, 'setSelectedElement'),

      // ── Hover ──
      hoveredElement: null,
      setHoveredElement: (el) => set({ hoveredElement: el }, false, 'setHoveredElement'),

      // ── Active file ──
      activeFile: null,
      setActiveFile: (filePath) => set({ activeFile: filePath }, false, 'setActiveFile'),

      // ── File sync statuses ──
      fileSyncStatuses: [],
      setFileSyncStatuses: (statuses) => set({ fileSyncStatuses: statuses }, false, 'setFileSyncStatuses'),

      // ── Undo / redo ──
      undoStack: [],
      redoStack: [],
      pushUndo: (entry) => set((s) => ({
        undoStack: [...s.undoStack.slice(-49), entry], // Keep last 50
        redoStack: [], // Clear redo on new action
      }), false, 'pushUndo'),
      undo: () => {
        const { undoStack, redoStack } = get()
        if (undoStack.length === 0) return null
        const entry = undoStack[undoStack.length - 1]
        set({
          undoStack: undoStack.slice(0, -1),
          redoStack: [...redoStack, entry],
        }, false, 'undo')
        return entry
      },
      redo: () => {
        const { undoStack, redoStack } = get()
        if (redoStack.length === 0) return null
        const entry = redoStack[redoStack.length - 1]
        set({
          redoStack: redoStack.slice(0, -1),
          undoStack: [...undoStack, entry],
        }, false, 'redo')
        return entry
      },
      clearUndoStack: () => set({ undoStack: [], redoStack: [] }, false, 'clearUndoStack'),

      // ── Edit state ──
      editInFlight: false,
      setEditInFlight: (inFlight) => set({ editInFlight: inFlight }, false, 'setEditInFlight'),

      // ── Tree expansion ──
      expandedNodes: new Set<string>(),
      toggleNodeExpanded: (vbId) => set((s) => {
        const next = new Set(s.expandedNodes)
        if (next.has(vbId)) next.delete(vbId)
        else next.add(vbId)
        return { expandedNodes: next }
      }, false, 'toggleNodeExpanded'),
      expandAll: () => set((s) => ({
        expandedNodes: new Set(collectAllIds(s.tree)),
      }), false, 'expandAll'),
      collapseAll: () => set({ expandedNodes: new Set<string>() }, false, 'collapseAll'),

      // ── Panel visibility ──
      showComponentTree: true,
      showPropertyPanel: true,
      showComponentPalette: false,
      toggleComponentTree: () => set((s) => ({ showComponentTree: !s.showComponentTree }), false, 'toggleComponentTree'),
      togglePropertyPanel: () => set((s) => ({ showPropertyPanel: !s.showPropertyPanel }), false, 'togglePropertyPanel'),
      toggleComponentPalette: () => set((s) => ({ showComponentPalette: !s.showComponentPalette }), false, 'toggleComponentPalette'),

      // ── Reset ──
      reset: () => set({
        enabled: false,
        jobId: null,
        bridgeReady: false,
        tree: [],
        totalNodes: 0,
        selectedElement: null,
        hoveredElement: null,
        activeFile: null,
        fileSyncStatuses: [],
        undoStack: [],
        redoStack: [],
        editInFlight: false,
        expandedNodes: new Set<string>(),
        showComponentTree: true,
        showPropertyPanel: true,
        showComponentPalette: false,
      }, false, 'reset'),
    }),
    { name: 'CodedXP/VisualBuilder' }
  )
)
