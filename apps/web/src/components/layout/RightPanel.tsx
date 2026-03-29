
import React, { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FolderOpen, X } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { IdleView } from '@/components/execution/IdleView'
import { PlanningView } from '@/components/execution/PlanningView'
import { BuildingView } from '@/components/execution/BuildingView'
import { PreviewView } from '@/components/execution/PreviewView'
import { ErrorView } from '@/components/execution/ErrorView'
import { BrowserView } from '@/components/execution/BrowserView'
import { FileExplorer } from '@/components/explorer/FileExplorer'
import type { PanelState } from '@/types'

// ─── Panel transition config ──────────────────────────────────

const panelVariants = {
  enter: { opacity: 0, scale: 0.98 },
  center: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
}

const transition = {
  duration: 0.4,
  ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
}

// ─── Panel renderer ───────────────────────────────────────────

function PanelContent({ mode }: { mode: PanelState }) {
  switch (mode) {
    case 'idle':
      return <IdleView />
    case 'planning':
      return <PlanningView />
    case 'building':
      return <BuildingView />
    case 'preview':
      return <PreviewView />
    case 'error':
      return <ErrorView />
    case 'browser':
      return <BrowserView />
    default:
      return <IdleView />
  }
}

// ─── Component ────────────────────────────────────────────────

export function RightPanel() {
  const panelMode = useAppStore((s) => s.rightPanel.mode)
  const activeJobId = useAppStore((s) => s.rightPanel.activeJobId)
  const [activeTab, setActiveTab] = useState<'explorer' | null>(null)

  // Show file explorer toggle when there's an active job during building or preview
  const canShowExplorer =
    (panelMode === 'building' || panelMode === 'preview') && !!activeJobId

  return (
    <div className="relative flex flex-col h-full w-full overflow-hidden bg-[#121215]">

      {/* File Explorer toggle button — shown during building/preview */}
      {canShowExplorer && (
        <div className="absolute top-3 right-3 z-20">
          <button
            onClick={() => setActiveTab((v) => v === 'explorer' ? null : 'explorer')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              activeTab === 'explorer'
                ? 'bg-accent/15 border-accent/30 text-accent'
                : 'bg-white/[0.04] border-white/[0.08] text-white/40 hover:text-white/60 hover:border-white/[0.12]'
            }`}
            title={activeTab === 'explorer' ? 'Hide file explorer' : 'View generated files'}
          >
            {activeTab === 'explorer' ? <X className="w-3.5 h-3.5" /> : <FolderOpen className="w-3.5 h-3.5" />}
            {activeTab === 'explorer' ? 'Close' : 'Files'}
          </button>
        </div>
      )}

      {/* File Explorer overlay — slides in from right */}
      <AnimatePresence>
        {activeTab === 'explorer' && canShowExplorer && (
          <motion.div
            key="file-explorer"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="absolute inset-0 z-10 bg-base/95 backdrop-blur-sm"
          >
            <FileExplorer onClose={() => setActiveTab(null)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Animated panel content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={panelMode}
          variants={panelVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={transition}
          className="relative flex flex-col h-full w-full"
        >
          <PanelContent mode={panelMode} />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
