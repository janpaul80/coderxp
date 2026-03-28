/**
 * PropertyPanel.tsx — Visual Builder property editor
 *
 * Shows when an element is selected in the preview or component tree.
 * Provides editing for:
 *  - Text content (inline text editing)
 *  - Tailwind classes (categorized editor)
 *  - Common props (typed based on component registry)
 *  - Section type hint
 *  - Breadcrumb path
 */

import { useCallback, useState } from 'react'
import {
  Type, Paintbrush, Settings2, ChevronDown, ChevronRight,
  Copy, Trash2, MoveUp, MoveDown, X,
} from 'lucide-react'
import { useVisualBuilderStore, type SelectedElement } from './hooks/useVisualBuilderStore'
import { cn } from '@/lib/utils'

// ─── Tailwind class categories ───────────────────────────────

interface TailwindCategory {
  id: string
  label: string
  patterns: RegExp
  icon?: string
}

const TAILWIND_CATEGORIES: TailwindCategory[] = [
  { id: 'spacing', label: 'Spacing', patterns: /^(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|space)-/ },
  { id: 'sizing', label: 'Sizing', patterns: /^(w|h|min-w|min-h|max-w|max-h)-/ },
  { id: 'typography', label: 'Typography', patterns: /^(text|font|leading|tracking|line-|truncate|uppercase|lowercase|capitalize|italic|underline|decoration-)/ },
  { id: 'colors', label: 'Colors', patterns: /^(bg|text|border|ring|outline|shadow|from|to|via)-/ },
  { id: 'layout', label: 'Layout', patterns: /^(flex|grid|block|inline|hidden|items|justify|self|place|order|col|row|gap)-/ },
  { id: 'borders', label: 'Borders', patterns: /^(border|rounded|ring|outline|divide)-/ },
  { id: 'effects', label: 'Effects', patterns: /^(shadow|opacity|blur|brightness|contrast|grayscale|invert|saturate|sepia|backdrop|mix-blend|transition|duration|ease|animate|transform|scale|rotate|translate|skew)-/ },
  { id: 'responsive', label: 'Responsive', patterns: /^(sm|md|lg|xl|2xl):/ },
  { id: 'other', label: 'Other', patterns: /.*/ },
]

function categorizeClasses(className: string): Record<string, string[]> {
  const classes = className.split(/\s+/).filter(Boolean)
  const categorized: Record<string, string[]> = {}

  for (const cls of classes) {
    let placed = false
    for (const cat of TAILWIND_CATEGORIES) {
      if (cat.id === 'other') continue
      if (cat.patterns.test(cls)) {
        if (!categorized[cat.id]) categorized[cat.id] = []
        categorized[cat.id].push(cls)
        placed = true
        break
      }
    }
    if (!placed) {
      if (!categorized['other']) categorized['other'] = []
      categorized['other'].push(cls)
    }
  }

  return categorized
}

// ─── Class editor section ────────────────────────────────────

interface ClassEditorProps {
  className: string
  onChange: (newClassName: string) => void
}

function TailwindClassEditor({ className, onChange }: ClassEditorProps) {
  const categorized = categorizeClasses(className)
  const [expandedCategory, setExpandedCategory] = useState<string | null>('spacing')
  const [rawMode, setRawMode] = useState(false)
  const [rawInput, setRawInput] = useState(className)

  const handleRemoveClass = useCallback((cls: string) => {
    const classes = className.split(/\s+/).filter(c => c !== cls)
    onChange(classes.join(' '))
  }, [className, onChange])

  const handleRawSubmit = useCallback(() => {
    onChange(rawInput.trim())
  }, [rawInput, onChange])

  return (
    <div className="space-y-2">
      {/* Toggle raw/categorized */}
      <div className="flex items-center justify-between">
        <span className="text-2xs text-gray-500 uppercase tracking-wider font-medium">Tailwind Classes</span>
        <button
          onClick={() => setRawMode(!rawMode)}
          className="text-2xs text-indigo-400 hover:text-indigo-300 transition"
        >
          {rawMode ? 'Categorized' : 'Raw Edit'}
        </button>
      </div>

      {rawMode ? (
        <div className="space-y-1">
          <textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            onBlur={handleRawSubmit}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleRawSubmit() } }}
            className="w-full px-2 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded text-xs text-gray-300 font-mono resize-none outline-none focus:border-indigo-500/40 transition"
            rows={3}
            spellCheck={false}
          />
        </div>
      ) : (
        <div className="space-y-1">
          {TAILWIND_CATEGORIES.map((cat) => {
            const classes = categorized[cat.id]
            if (!classes?.length) return null
            const isExpanded = expandedCategory === cat.id

            return (
              <div key={cat.id} className="border border-white/[0.04] rounded">
                <button
                  onClick={() => setExpandedCategory(isExpanded ? null : cat.id)}
                  className="w-full flex items-center justify-between px-2 py-1.5 text-2xs text-gray-400 hover:text-gray-200 transition"
                >
                  <span>{cat.label} ({classes.length})</span>
                  {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
                {isExpanded && (
                  <div className="px-2 pb-2 flex flex-wrap gap-1">
                    {classes.map((cls) => (
                      <span
                        key={cls}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-white/[0.05] border border-white/[0.08] rounded text-2xs text-gray-300 font-mono group hover:border-red-500/30 transition"
                      >
                        {cls}
                        <button
                          onClick={() => handleRemoveClass(cls)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 transition"
                        >
                          <X className="w-2 h-2" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Main property panel ────────────────────────────────────

interface PropertyPanelProps {
  onClassNameChange: (vbId: string, newClassName: string) => void
  onTextChange: (vbId: string, newText: string) => void
  onDelete: (vbId: string) => void
  onMoveUp: (vbId: string) => void
  onMoveDown: (vbId: string) => void
}

export function PropertyPanel({
  onClassNameChange,
  onTextChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: PropertyPanelProps) {
  const selectedElement = useVisualBuilderStore((s) => s.selectedElement)
  const [textValue, setTextValue] = useState('')
  const [activeTab, setActiveTab] = useState<'style' | 'text' | 'props'>('style')

  // Sync text value when selection changes
  const prevVbId = useState<string | null>(null)
  if (selectedElement && selectedElement.vbId !== prevVbId[0]) {
    prevVbId[1](selectedElement.vbId)
    setTextValue(selectedElement.textContent)
  }

  if (!selectedElement) {
    return (
      <div className="flex flex-col h-full">
        <div className="shrink-0 px-3 py-2 border-b border-white/[0.06]">
          <span className="text-xs font-medium text-gray-300">Properties</span>
        </div>
        <div className="flex-1 flex items-center justify-center px-4">
          <p className="text-xs text-gray-600 text-center">
            Select an element in the preview or component tree to edit its properties.
          </p>
        </div>
      </div>
    )
  }

  const el = selectedElement

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-3 py-2 border-b border-white/[0.06]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-300">Properties</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onMoveUp(el.vbId)}
              className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition"
              title="Move up"
            >
              <MoveUp className="w-3 h-3" />
            </button>
            <button
              onClick={() => onMoveDown(el.vbId)}
              className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition"
              title="Move down"
            >
              <MoveDown className="w-3 h-3" />
            </button>
            <button
              onClick={() => onDelete(el.vbId)}
              className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition"
              title="Delete element"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Element info */}
        <div className="mt-1.5 flex items-center gap-2">
          <span className="px-1.5 py-0.5 bg-indigo-500/15 text-indigo-400 rounded text-2xs font-mono">
            {'<'}{el.componentName || el.tag}{'>'}
          </span>
          {el.sectionType && (
            <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded text-2xs border border-amber-500/20">
              {el.sectionType}
            </span>
          )}
        </div>

        {/* Breadcrumb */}
        {el.breadcrumb.length > 1 && (
          <div className="mt-1 flex items-center gap-0.5 overflow-x-auto text-2xs text-gray-600">
            {el.breadcrumb.map((crumb, i) => (
              <span key={crumb.vbId} className="flex items-center gap-0.5 shrink-0">
                {i > 0 && <span className="text-gray-700">/</span>}
                <span className={cn(
                  'font-mono',
                  crumb.vbId === el.vbId ? 'text-indigo-400' : 'text-gray-500'
                )}>
                  {crumb.componentName || crumb.tag}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex border-b border-white/[0.06]">
        {[
          { id: 'style' as const, label: 'Style', icon: Paintbrush },
          { id: 'text' as const, label: 'Text', icon: Type },
          { id: 'props' as const, label: 'Props', icon: Settings2 },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-2xs transition',
              activeTab === tab.id
                ? 'text-indigo-400 border-b-2 border-indigo-400'
                : 'text-gray-500 hover:text-gray-300'
            )}
          >
            <tab.icon className="w-3 h-3" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {activeTab === 'style' && (
          <TailwindClassEditor
            className={el.className}
            onChange={(newClassName) => onClassNameChange(el.vbId, newClassName)}
          />
        )}

        {activeTab === 'text' && (
          <div className="space-y-2">
            <span className="text-2xs text-gray-500 uppercase tracking-wider font-medium">Text Content</span>
            <textarea
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onBlur={() => { if (textValue !== el.textContent) onTextChange(el.vbId, textValue) }}
              className="w-full px-2 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded text-xs text-gray-300 resize-none outline-none focus:border-indigo-500/40 transition"
              rows={4}
              placeholder="Enter text content..."
            />
          </div>
        )}

        {activeTab === 'props' && (
          <div className="space-y-2">
            <span className="text-2xs text-gray-500 uppercase tracking-wider font-medium">Element ID</span>
            <div className="flex items-center gap-1.5">
              <code className="text-2xs font-mono text-gray-400 bg-white/[0.04] px-2 py-1 rounded border border-white/[0.06] flex-1 truncate">
                {el.vbId}
              </code>
              <button
                onClick={() => navigator.clipboard?.writeText(el.vbId)}
                className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition"
                title="Copy ID"
              >
                <Copy className="w-3 h-3" />
              </button>
            </div>

            <span className="text-2xs text-gray-500 uppercase tracking-wider font-medium mt-3 block">Tag</span>
            <code className="text-xs font-mono text-gray-400">{el.tag}</code>

            {el.componentName && (
              <>
                <span className="text-2xs text-gray-500 uppercase tracking-wider font-medium mt-3 block">Component</span>
                <code className="text-xs font-mono text-indigo-400">{el.componentName}</code>
              </>
            )}

            <span className="text-2xs text-gray-500 uppercase tracking-wider font-medium mt-3 block">Position</span>
            <div className="grid grid-cols-2 gap-2 text-2xs text-gray-500">
              <div>x: {Math.round(el.rect.left)}</div>
              <div>y: {Math.round(el.rect.top)}</div>
              <div>w: {Math.round(el.rect.width)}</div>
              <div>h: {Math.round(el.rect.height)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
