/**
 * ComponentPalette.tsx — Visual Builder component insertion palette
 *
 * Shows available section presets, layout primitives, and UI components.
 * User selects a component → it gets inserted into the active file at
 * the selected element's parent (or at the end of the return body).
 *
 * Insertion flows through VisualBuilderPanel → vbApi.insertComponent().
 */

import { useState } from 'react'
import {
  Sparkles, LayoutGrid, CreditCard, MessageSquareQuote, Megaphone,
  PanelBottom, HelpCircle, Mail, Menu, MousePointerClick, Square,
  TextCursorInput, Tag, BoxSelect, Rows3, Grid3x3,
  AlignHorizontalDistributeCenter, Plus,
} from 'lucide-react'
import {
  getComponentRegistry,
  getCategories,
  type VBComponent,
  type ComponentCategory,
} from './lib/componentRegistry'
import { useVisualBuilderStore } from './hooks/useVisualBuilderStore'
import { cn } from '@/lib/utils'

// ─── Icon resolver ──────────────────────────────────────────

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  Sparkles, LayoutGrid, CreditCard, MessageSquareQuote, Megaphone,
  PanelBottom, HelpCircle, Mail, Menu, MousePointerClick, Square,
  TextCursorInput, Tag, BoxSelect, Rows3, Grid3x3,
  AlignHorizontalDistributeCenter,
}

function ComponentIcon({ iconName, className }: { iconName: string; className?: string }) {
  const Icon = ICON_MAP[iconName]
  if (Icon) return <Icon className={className} />
  return <Plus className={className} />
}

// ─── Props ──────────────────────────────────────────────────

interface ComponentPaletteProps {
  onInsert: (
    parentVbId: string,
    index: number,
    jsx: string,
    importNeeded?: { source: string; specifier: string },
  ) => void
}

// ─── Component ──────────────────────────────────────────────

export function ComponentPalette({ onInsert }: ComponentPaletteProps) {
  const [activeCategory, setActiveCategory] = useState<ComponentCategory>('section')
  const selectedElement = useVisualBuilderStore((s) => s.selectedElement)
  const tree = useVisualBuilderStore((s) => s.tree)

  const categories = getCategories()
  const allComponents = getComponentRegistry()
  const filteredComponents = allComponents.filter((c) => c.category === activeCategory)

  const handleInsert = (component: VBComponent) => {
    // Determine insertion target:
    // - If an element is selected and has a parent in breadcrumb, insert after that element
    // - Otherwise, insert at root level (last top-level section)
    let parentVbId: string
    let index: number

    if (selectedElement && selectedElement.breadcrumb.length >= 2) {
      // Insert as sibling after the selected element
      parentVbId = selectedElement.breadcrumb[selectedElement.breadcrumb.length - 2].vbId
      index = -1 // Server places after the sibling
    } else if (tree.length > 0) {
      // Insert at root level — use body or last section's parent
      parentVbId = tree[tree.length - 1].vbId
      index = 999 // Append at end
    } else {
      // No tree — can't determine target
      return
    }

    const importNeeded = component.importPath && component.importSpecifier
      ? { source: component.importPath, specifier: component.importSpecifier }
      : undefined

    onInsert(parentVbId, index, component.defaultJsx, importNeeded)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Category tabs */}
      <div className="shrink-0 flex items-center gap-0.5 px-3 py-1.5 border-b border-white/[0.06] overflow-x-auto">
        {categories.map((cat) => {
          const count = allComponents.filter((c) => c.category === cat.id).length
          if (count === 0) return null
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                'shrink-0 px-2.5 py-1 rounded-md text-2xs font-medium transition',
                activeCategory === cat.id
                  ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] border border-transparent'
              )}
            >
              {cat.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Component grid */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {filteredComponents.length === 0 ? (
          <p className="text-xs text-gray-600 text-center py-4">No components in this category.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {filteredComponents.map((comp) => (
              <button
                key={comp.id}
                onClick={() => handleInsert(comp)}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-indigo-500/10 hover:border-indigo-500/20 transition group text-center"
              >
                <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center group-hover:bg-indigo-500/15 transition">
                  <ComponentIcon iconName={comp.icon} className="w-4 h-4 text-gray-400 group-hover:text-indigo-400 transition" />
                </div>
                <span className="text-2xs font-medium text-gray-400 group-hover:text-gray-200 transition truncate w-full">
                  {comp.name}
                </span>
                <span className="text-2xs text-gray-600 line-clamp-2 leading-tight">
                  {comp.description}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Insertion hint */}
      <div className="shrink-0 px-3 py-1.5 border-t border-white/[0.06] text-2xs text-gray-600">
        {selectedElement ? (
          <span>Insert after: <span className="text-gray-400 font-mono">{'<'}{selectedElement.componentName || selectedElement.tag}{'>'}</span></span>
        ) : (
          <span>Select an element to set insertion point, or inserts at end of page.</span>
        )}
      </div>
    </div>
  )
}
