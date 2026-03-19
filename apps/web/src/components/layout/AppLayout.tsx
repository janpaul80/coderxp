import React, { useState, useRef, useCallback, useEffect } from 'react'
// DEV: useAuthStore temporarily unused — guard removed for UI preview
// import { useAuthStore } from '@/store/authStore'
import { LeftPanel } from './LeftPanel'
import { RightPanel } from './RightPanel'
import { CredentialModal } from '@/components/credentials/CredentialModal'
import { BrowserApprovalModal } from '@/components/browser/BrowserApprovalModal'
import { BrowserSessionBadge } from '@/components/browser/BrowserSessionBadge'

const LEFT_MIN = 320
const LEFT_MAX = 680
const LEFT_DEFAULT = 420

export function AppLayout() {
  const [leftWidth, setLeftWidth] = useState(LEFT_DEFAULT)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(LEFT_DEFAULT)
  const containerRef = useRef<HTMLDivElement>(null)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    startX.current = e.clientX
    startWidth.current = leftWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [leftWidth])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const delta = e.clientX - startX.current
      const newWidth = Math.min(LEFT_MAX, Math.max(LEFT_MIN, startWidth.current + delta))
      setLeftWidth(newWidth)
    }
    const onMouseUp = () => {
      if (!isDragging.current) return
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  return (
    <>
      <div ref={containerRef} className="flex h-screen w-screen overflow-hidden bg-base">
        {/* ── Left panel — chat ───────────────────────────────── */}
        <div
          className="shrink-0 flex flex-col bg-base-surface overflow-hidden"
          style={{ width: leftWidth }}
        >
          <LeftPanel />
        </div>

        {/* ── Resize handle ──────────────────────────────────── */}
        <div
          onMouseDown={onMouseDown}
          className="w-1 shrink-0 relative cursor-col-resize group z-10"
          style={{ background: 'rgba(255,255,255,0.04)' }}
        >
          {/* Visual drag indicator */}
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[3px] rounded-full
            bg-white/[0.06] group-hover:bg-accent/40 transition-colors duration-150" />
        </div>

        {/* ── Right panel — execution / preview ──────────────── */}
        <div className="flex-1 min-w-0 flex flex-col bg-base overflow-hidden">
          <RightPanel />
        </div>
      </div>

      {/* ── Global credential modal — rendered above all panels ── */}
      <CredentialModal />

      {/* ── Browser control overlays — rendered above all panels ── */}
      <BrowserApprovalModal />
      <BrowserSessionBadge />
    </>
  )
}
