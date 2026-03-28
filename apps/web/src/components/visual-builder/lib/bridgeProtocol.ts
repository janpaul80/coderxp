/**
 * bridgeProtocol.ts — Visual Builder iframe ↔ parent postMessage protocol
 *
 * Defines all message types exchanged between the CoderXP parent window
 * and the preview iframe when Visual Builder mode is active.
 *
 * Direction conventions:
 *   Parent → Iframe:  VB_PARENT_* prefix
 *   Iframe → Parent:  VB_IFRAME_* prefix
 */

// ─── Message type constants ──────────────────────────────────

export const VB_MSG = {
  // Iframe → Parent
  IFRAME_READY: 'vb:iframe:ready',
  IFRAME_ELEMENT_HOVER: 'vb:iframe:element:hover',
  IFRAME_ELEMENT_CLICK: 'vb:iframe:element:click',
  IFRAME_ELEMENT_UNHOVER: 'vb:iframe:element:unhover',
  IFRAME_TREE_UPDATE: 'vb:iframe:tree:update',
  IFRAME_TEXT_COMMITTED: 'vb:iframe:text:committed',

  // Parent → Iframe
  PARENT_SELECT: 'vb:parent:select',
  PARENT_DESELECT: 'vb:parent:deselect',
  PARENT_HIGHLIGHT: 'vb:parent:highlight',
  PARENT_ENABLE: 'vb:parent:enable',
  PARENT_DISABLE: 'vb:parent:disable',
  PARENT_START_TEXT_EDIT: 'vb:parent:start-text-edit',
  PARENT_UPDATE_STYLE: 'vb:parent:update-style',
  PARENT_UPDATE_TEXT: 'vb:parent:update-text',
} as const

// ─── Element rect (DOMRect-like, serializable) ───────────────

export interface VBRect {
  top: number
  left: number
  width: number
  height: number
  bottom: number
  right: number
}

// ─── Visual Node (lightweight tree descriptor from iframe) ────

export interface VBNodeDescriptor {
  /** Stable identifier: data-vb-id attribute value */
  vbId: string
  /** HTML tag name (lowercase) */
  tag: string
  /** Component name if detectable (e.g. 'Hero', 'Button') */
  componentName?: string
  /** Tailwind / CSS classes */
  className: string
  /** Direct text content (truncated to 200 chars) */
  textContent: string
  /** Section type hint from data-vb-section or semantic tag */
  sectionType?: string
  /** Bounding rect relative to viewport */
  rect: VBRect
  /** Children node descriptors */
  children: VBNodeDescriptor[]
  /** Whether this node has only text (no child elements) */
  isTextOnly: boolean
  /** Number of nested levels deep */
  depth: number
}

// ─── Iframe → Parent messages ────────────────────────────────

export interface VBIframeReadyMessage {
  type: typeof VB_MSG.IFRAME_READY
  payload: {
    /** Root-level node descriptors for the page */
    tree: VBNodeDescriptor[]
    /** Total annotated elements count */
    totalNodes: number
  }
}

export interface VBIframeElementHoverMessage {
  type: typeof VB_MSG.IFRAME_ELEMENT_HOVER
  payload: {
    vbId: string
    tag: string
    componentName?: string
    className: string
    rect: VBRect
    depth: number
  }
}

export interface VBIframeElementClickMessage {
  type: typeof VB_MSG.IFRAME_ELEMENT_CLICK
  payload: {
    vbId: string
    tag: string
    componentName?: string
    className: string
    textContent: string
    sectionType?: string
    rect: VBRect
    /** Parent chain for breadcrumb display */
    breadcrumb: Array<{ vbId: string; tag: string; componentName?: string }>
  }
}

export interface VBIframeElementUnhoverMessage {
  type: typeof VB_MSG.IFRAME_ELEMENT_UNHOVER
  payload: { vbId: string }
}

export interface VBIframeTreeUpdateMessage {
  type: typeof VB_MSG.IFRAME_TREE_UPDATE
  payload: {
    tree: VBNodeDescriptor[]
    totalNodes: number
    /** Reason for the update */
    reason: 'mutation' | 'navigation' | 'hmr'
  }
}

export interface VBIframeTextCommittedMessage {
  type: typeof VB_MSG.IFRAME_TEXT_COMMITTED
  payload: {
    vbId: string
    oldText: string
    newText: string
  }
}

// ─── Parent → Iframe messages ────────────────────────────────

export interface VBParentSelectMessage {
  type: typeof VB_MSG.PARENT_SELECT
  payload: { vbId: string }
}

export interface VBParentDeselectMessage {
  type: typeof VB_MSG.PARENT_DESELECT
  payload: Record<string, never>
}

export interface VBParentHighlightMessage {
  type: typeof VB_MSG.PARENT_HIGHLIGHT
  payload: { vbId: string }
}

export interface VBParentEnableMessage {
  type: typeof VB_MSG.PARENT_ENABLE
  payload: Record<string, never>
}

export interface VBParentDisableMessage {
  type: typeof VB_MSG.PARENT_DISABLE
  payload: Record<string, never>
}

export interface VBParentStartTextEditMessage {
  type: typeof VB_MSG.PARENT_START_TEXT_EDIT
  payload: { vbId: string }
}

export interface VBParentUpdateStyleMessage {
  type: typeof VB_MSG.PARENT_UPDATE_STYLE
  payload: {
    vbId: string
    /** Replacement className string */
    className: string
  }
}

export interface VBParentUpdateTextMessage {
  type: typeof VB_MSG.PARENT_UPDATE_TEXT
  payload: {
    vbId: string
    /** New text content */
    text: string
  }
}

// ─── Union types ─────────────────────────────────────────────

export type VBIframeMessage =
  | VBIframeReadyMessage
  | VBIframeElementHoverMessage
  | VBIframeElementClickMessage
  | VBIframeElementUnhoverMessage
  | VBIframeTreeUpdateMessage
  | VBIframeTextCommittedMessage

export type VBParentMessage =
  | VBParentSelectMessage
  | VBParentDeselectMessage
  | VBParentHighlightMessage
  | VBParentEnableMessage
  | VBParentDisableMessage
  | VBParentStartTextEditMessage
  | VBParentUpdateStyleMessage
  | VBParentUpdateTextMessage

export type VBMessage = VBIframeMessage | VBParentMessage

// ─── Type guard ──────────────────────────────────────────────

export function isVBMessage(data: unknown): data is VBMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    typeof (data as { type: unknown }).type === 'string' &&
    (data as { type: string }).type.startsWith('vb:')
  )
}
