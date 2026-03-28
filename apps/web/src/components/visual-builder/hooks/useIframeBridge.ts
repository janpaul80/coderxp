/**
 * useIframeBridge.ts — Manages postMessage communication with the preview iframe.
 *
 * Injects the VB bridge script into the iframe on enable, cleans up on disable.
 * Listens for incoming messages and dispatches them to the visual builder store.
 * Provides methods to send commands to the iframe.
 */

import { useEffect, useCallback, useRef } from 'react'
import { VB_BRIDGE_SCRIPT, VB_BRIDGE_CLEANUP_SCRIPT } from '../lib/vbBridge'
import {
  VB_MSG,
  isVBMessage,
  type VBIframeMessage,
  type VBParentMessage,
  type VBNodeDescriptor,
  type VBRect,
} from '../lib/bridgeProtocol'

// ─── Callback types ──────────────────────────────────────────

export interface IframeBridgeCallbacks {
  onReady: (tree: VBNodeDescriptor[], totalNodes: number) => void
  onElementHover: (data: {
    vbId: string; tag: string; componentName?: string
    className: string; rect: VBRect; depth: number
  }) => void
  onElementClick: (data: {
    vbId: string; tag: string; componentName?: string
    className: string; textContent: string; sectionType?: string
    rect: VBRect
    breadcrumb: Array<{ vbId: string; tag: string; componentName?: string }>
  }) => void
  onElementUnhover: (vbId: string) => void
  onTreeUpdate: (tree: VBNodeDescriptor[], totalNodes: number, reason: string) => void
  onTextCommitted: (vbId: string, oldText: string, newText: string) => void
}

// ─── Hook ────────────────────────────────────────────────────

export function useIframeBridge(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  enabled: boolean,
  callbacks: IframeBridgeCallbacks,
) {
  const callbacksRef = useRef(callbacks)
  callbacksRef.current = callbacks

  // ── Inject / remove bridge script ────────────────────────
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    let retryTimer: ReturnType<typeof setTimeout> | null = null

    function tryInject(): boolean {
      try {
        const win = iframe!.contentWindow as (
          Window & { __vbBridgeActive?: boolean; __vbBridgeCleanup?: () => void; Function: typeof Function }
        ) | null
        if (!win) return false

        if (enabled) {
          if (win.__vbBridgeActive) return true
          try {
            const IframeFunction = win.Function
            const inject = new IframeFunction(VB_BRIDGE_SCRIPT)
            inject()
            return true
          } catch {
            try {
              const doc = iframe!.contentDocument
              if (doc) {
                const script = doc.createElement('script')
                script.textContent = VB_BRIDGE_SCRIPT
                doc.body.appendChild(script)
                return true
              }
            } catch {
              // Cross-origin or blocked
            }
          }
        } else {
          if (win.__vbBridgeCleanup) {
            win.__vbBridgeCleanup()
          }
          return true
        }
      } catch {
        // Not ready or cross-origin
      }
      return false
    }

    function injectWithRetry() {
      if (!tryInject() && enabled) {
        retryTimer = setTimeout(() => tryInject(), 500)
      }
    }

    injectWithRetry()
    iframe.addEventListener('load', injectWithRetry)

    return () => {
      iframe.removeEventListener('load', injectWithRetry)
      if (retryTimer) clearTimeout(retryTimer)
      // Clean up bridge on unmount
      if (!enabled) return
      try {
        const win = iframe.contentWindow as { __vbBridgeCleanup?: () => void } | null
        if (win?.__vbBridgeCleanup) win.__vbBridgeCleanup()
      } catch { /* cross-origin */ }
    }
  }, [enabled, iframeRef])

  // ── Listen for messages from iframe ──────────────────────
  useEffect(() => {
    if (!enabled) return

    function handleMessage(e: MessageEvent) {
      if (!isVBMessage(e.data)) return
      const msg = e.data as VBIframeMessage
      const cb = callbacksRef.current

      switch (msg.type) {
        case VB_MSG.IFRAME_READY:
          cb.onReady(msg.payload.tree, msg.payload.totalNodes)
          break
        case VB_MSG.IFRAME_ELEMENT_HOVER:
          cb.onElementHover(msg.payload)
          break
        case VB_MSG.IFRAME_ELEMENT_CLICK:
          cb.onElementClick(msg.payload)
          break
        case VB_MSG.IFRAME_ELEMENT_UNHOVER:
          cb.onElementUnhover(msg.payload.vbId)
          break
        case VB_MSG.IFRAME_TREE_UPDATE:
          cb.onTreeUpdate(msg.payload.tree, msg.payload.totalNodes, msg.payload.reason)
          break
        case VB_MSG.IFRAME_TEXT_COMMITTED:
          cb.onTextCommitted(msg.payload.vbId, msg.payload.oldText, msg.payload.newText)
          break
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [enabled])

  // ── Send commands to iframe ──────────────────────────────

  const sendToIframe = useCallback((msg: VBParentMessage) => {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return
    try {
      iframe.contentWindow.postMessage(msg, '*')
    } catch {
      // Cross-origin
    }
  }, [iframeRef])

  const selectElement = useCallback((vbId: string) => {
    sendToIframe({ type: VB_MSG.PARENT_SELECT, payload: { vbId } })
  }, [sendToIframe])

  const deselectElement = useCallback(() => {
    sendToIframe({ type: VB_MSG.PARENT_DESELECT, payload: {} })
  }, [sendToIframe])

  const highlightElement = useCallback((vbId: string) => {
    sendToIframe({ type: VB_MSG.PARENT_HIGHLIGHT, payload: { vbId } })
  }, [sendToIframe])

  const updateStyle = useCallback((vbId: string, className: string) => {
    sendToIframe({ type: VB_MSG.PARENT_UPDATE_STYLE, payload: { vbId, className } })
  }, [sendToIframe])

  const updateText = useCallback((vbId: string, text: string) => {
    sendToIframe({ type: VB_MSG.PARENT_UPDATE_TEXT, payload: { vbId, text } })
  }, [sendToIframe])

  const startTextEdit = useCallback((vbId: string) => {
    sendToIframe({ type: VB_MSG.PARENT_START_TEXT_EDIT, payload: { vbId } })
  }, [sendToIframe])

  const disableBridge = useCallback(() => {
    sendToIframe({ type: VB_MSG.PARENT_DISABLE, payload: {} })
  }, [sendToIframe])

  return {
    selectElement,
    deselectElement,
    highlightElement,
    updateStyle,
    updateText,
    startTextEdit,
    disableBridge,
    sendToIframe,
  }
}
