/**
 * SectionOverlay — Visual Section Selection for Preview Editing
 *
 * Injects a script into the preview iframe that:
 *  1. Highlights sections on hover (header, nav, main, section, footer, article, aside, div[data-section])
 *  2. On click, sends a postMessage to the parent with the section's tag, text preview, and outerHTML
 *  3. The parent picks up the selection and sets the chat context for targeted editing
 *
 * The overlay script is injected via srcdoc on a hidden iframe that communicates
 * with the main preview iframe via window.postMessage.
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { MousePointerClick, X, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ─────────────────────────────────────────────────────

export interface SelectedSection {
  tag: string
  textPreview: string
  outerHTMLPreview: string
  className: string
  index: number
}

interface SectionOverlayProps {
  /** Whether the overlay mode is active */
  active: boolean
  /** Called when the user toggles overlay mode */
  onToggle: () => void
  /** Called when a section is clicked in the iframe */
  onSectionSelected: (section: SelectedSection) => void
  /** The iframe element to attach to */
  iframeRef: React.RefObject<HTMLIFrameElement | null>
}

// ─── Inject script for section highlighting ────────────────────

const OVERLAY_SCRIPT = `
(function() {
  if (window.__coderxpOverlayActive) return;
  window.__coderxpOverlayActive = true;

  const SELECTORS = 'header, nav, main, section, footer, article, aside, [data-section], [data-component]';
  let currentHighlight = null;

  // Create overlay element
  const overlay = document.createElement('div');
  overlay.id = '__coderxp-section-overlay';
  overlay.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #6366f1;background:rgba(99,102,241,0.08);z-index:99999;transition:all 0.15s ease;display:none;border-radius:4px;';
  document.body.appendChild(overlay);

  // Label
  const label = document.createElement('div');
  label.style.cssText = 'position:fixed;z-index:100000;background:#6366f1;color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-family:monospace;pointer-events:none;display:none;';
  document.body.appendChild(label);

  function findSection(el) {
    while (el && el !== document.body) {
      if (el.matches(SELECTORS)) return el;
      el = el.parentElement;
    }
    return null;
  }

  function showOverlay(el) {
    const rect = el.getBoundingClientRect();
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    overlay.style.display = 'block';

    label.textContent = '<' + el.tagName.toLowerCase() + '>' + (el.className ? '.' + el.className.split(' ')[0] : '');
    label.style.top = Math.max(0, rect.top - 22) + 'px';
    label.style.left = rect.left + 'px';
    label.style.display = 'block';
  }

  function hideOverlay() {
    overlay.style.display = 'none';
    label.style.display = 'none';
  }

  document.addEventListener('mousemove', function(e) {
    const section = findSection(e.target);
    if (section) {
      if (section !== currentHighlight) {
        currentHighlight = section;
        showOverlay(section);
      }
    } else {
      currentHighlight = null;
      hideOverlay();
    }
  }, true);

  document.addEventListener('click', function(e) {
    const section = findSection(e.target);
    if (section) {
      e.preventDefault();
      e.stopPropagation();

      // Get section info
      const allSections = Array.from(document.querySelectorAll(SELECTORS));
      const index = allSections.indexOf(section);
      const textPreview = (section.textContent || '').trim().slice(0, 200);
      const outerPreview = section.outerHTML.slice(0, 500);

      window.parent.postMessage({
        type: 'coderxp:section-selected',
        payload: {
          tag: section.tagName.toLowerCase(),
          textPreview: textPreview,
          outerHTMLPreview: outerPreview,
          className: section.className || '',
          index: index,
        }
      }, '*');
    }
  }, true);

  // Cleanup function
  window.__coderxpOverlayCleanup = function() {
    overlay.remove();
    label.remove();
    window.__coderxpOverlayActive = false;
  };
})();
`;

const CLEANUP_SCRIPT = `
  if (window.__coderxpOverlayCleanup) {
    window.__coderxpOverlayCleanup();
    delete window.__coderxpOverlayCleanup;
  }
`;

// ─── Component ─────────────────────────────────────────────────

export function SectionOverlay({ active, onToggle, onSectionSelected, iframeRef }: SectionOverlayProps) {
  const [lastSelected, setLastSelected] = useState<SelectedSection | null>(null)

  // Listen for postMessage from iframe
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === 'coderxp:section-selected') {
        const section = e.data.payload as SelectedSection
        setLastSelected(section)
        onSectionSelected(section)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [onSectionSelected])

  // Inject / remove overlay script when active toggles.
  // The preview iframe is same-origin (served via /api/preview/:jobId/app/ proxy)
  // so contentWindow access works. Uses two injection strategies:
  //   1. new Function() — fastest, works for same-origin
  //   2. <script> element — fallback if Function is blocked by CSP
  // Retries on iframe load + a short delay for timing resilience.
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    function tryInject() {
      try {
        const iframeWin = iframe!.contentWindow as (Window & { __coderxpOverlayActive?: boolean; __coderxpOverlayCleanup?: () => void; Function: typeof Function }) | null
        if (!iframeWin) return false

        if (active) {
          if (iframeWin.__coderxpOverlayActive) return true // already injected

          // Strategy 1: new Function() — works for same-origin iframes
          try {
            const IframeFunction = iframeWin.Function
            const inject = new IframeFunction(OVERLAY_SCRIPT)
            inject()
            return true
          } catch {
            // Strategy 2: inject <script> element into iframe document
            try {
              const doc = iframe!.contentDocument
              if (doc) {
                const script = doc.createElement('script')
                script.textContent = OVERLAY_SCRIPT
                doc.body.appendChild(script)
                return true
              }
            } catch {
              // Both strategies failed — truly cross-origin or blocked
            }
          }
        } else {
          if (iframeWin.__coderxpOverlayCleanup) {
            iframeWin.__coderxpOverlayCleanup()
            delete iframeWin.__coderxpOverlayCleanup
          }
          return true
        }
      } catch {
        // Cross-origin or not ready
      }
      return false
    }

    function injectWithRetry() {
      if (!tryInject() && active) {
        // Retry once after 500ms — handles iframe load timing
        retryTimer = setTimeout(() => tryInject(), 500)
      }
    }

    // Inject immediately + re-inject on iframe navigation
    injectWithRetry()
    iframe.addEventListener('load', injectWithRetry)
    return () => {
      iframe.removeEventListener('load', injectWithRetry)
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [active, iframeRef])

  return (
    <div className="flex items-center gap-2">
      {/* Toggle button */}
      <button
        onClick={onToggle}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded-lg text-2xs font-medium transition-all border',
          active
            ? 'bg-accent/20 border-accent/40 text-accent'
            : 'bg-white/[0.04] border-white/[0.08] text-text-muted hover:text-text-secondary hover:border-white/[0.12]'
        )}
        title={active ? 'Exit section selection mode' : 'Click sections to edit them'}
      >
        {active ? (
          <>
            <X className="w-3 h-3" />
            Exit Edit Mode
          </>
        ) : (
          <>
            <MousePointerClick className="w-3 h-3" />
            Edit Sections
          </>
        )}
      </button>

      {/* Selected section indicator */}
      {active && lastSelected && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-accent/[0.08] border border-accent/20">
          <Pencil className="w-3 h-3 text-accent" />
          <span className="text-2xs text-accent font-mono">
            {'<'}{lastSelected.tag}{'>'}
          </span>
          <span className="text-2xs text-text-muted max-w-[120px] truncate">
            {lastSelected.textPreview.slice(0, 40)}
          </span>
        </div>
      )}
    </div>
  )
}
