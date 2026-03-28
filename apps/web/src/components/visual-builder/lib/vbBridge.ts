/**
 * vbBridge.ts — Visual Builder iframe bridge script
 *
 * This script is injected into the preview iframe when Visual Builder mode is active.
 * It:
 *  1. Annotates all semantic elements with data-vb-id attributes
 *  2. Reports the element tree to the parent via postMessage
 *  3. Listens for hover/click events and reports them with DOMRect data
 *  4. Listens for parent commands (select, deselect, highlight, style updates)
 *  5. Uses MutationObserver to detect DOM changes (e.g., from Vite HMR)
 *
 * The script is designed to be injected as a string via contentWindow eval or <script> tag.
 * It must be self-contained — no imports.
 */

// This is exported as a string constant that gets injected into the iframe.
// The actual code runs in the iframe context, not in the React app context.

export const VB_BRIDGE_SCRIPT = `
(function() {
  // Prevent double-injection
  if (window.__vbBridgeActive) return;
  window.__vbBridgeActive = true;

  // ─── Config ──────────────────────────────────────────────
  var VB_SELECTORS = 'header, nav, main, section, footer, article, aside, div, form, ul, ol, table, h1, h2, h3, h4, h5, h6, p, a, button, input, textarea, select, img, span, label';
  var VB_SECTION_SELECTORS = 'header, nav, main, section, footer, article, aside, [data-section], [data-vb-section], [data-component]';
  var ID_COUNTER = 0;
  var ANNOTATION_ATTR = 'data-vb-id';
  var currentHoveredId = null;
  var currentSelectedId = null;

  // ─── Overlay elements ────────────────────────────────────
  var hoverOverlay = document.createElement('div');
  hoverOverlay.id = '__vb-hover-overlay';
  hoverOverlay.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #6366f1;background:rgba(99,102,241,0.06);z-index:99998;display:none;border-radius:3px;transition:top 0.1s,left 0.1s,width 0.1s,height 0.1s;';

  var selectOverlay = document.createElement('div');
  selectOverlay.id = '__vb-select-overlay';
  selectOverlay.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #f59e0b;background:rgba(245,158,11,0.08);z-index:99999;display:none;border-radius:3px;';

  var hoverLabel = document.createElement('div');
  hoverLabel.id = '__vb-hover-label';
  hoverLabel.style.cssText = 'position:fixed;z-index:100000;background:#6366f1;color:white;padding:1px 6px;border-radius:3px;font-size:10px;font-family:ui-monospace,monospace;pointer-events:none;display:none;white-space:nowrap;';

  var selectLabel = document.createElement('div');
  selectLabel.id = '__vb-select-label';
  selectLabel.style.cssText = 'position:fixed;z-index:100001;background:#f59e0b;color:#000;padding:1px 6px;border-radius:3px;font-size:10px;font-family:ui-monospace,monospace;pointer-events:none;display:none;white-space:nowrap;font-weight:600;';

  document.body.appendChild(hoverOverlay);
  document.body.appendChild(selectOverlay);
  document.body.appendChild(hoverLabel);
  document.body.appendChild(selectLabel);

  // ─── Helpers ─────────────────────────────────────────────

  function generateId() {
    return 'vb-' + (++ID_COUNTER);
  }

  function getRect(el) {
    var r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right };
  }

  function getComponentName(el) {
    // Try React fiber
    for (var key in el) {
      if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) {
        var fiber = el[key];
        while (fiber) {
          if (fiber.type && typeof fiber.type === 'function') {
            return fiber.type.displayName || fiber.type.name || null;
          }
          if (fiber.type && typeof fiber.type === 'object' && fiber.type.render) {
            return fiber.type.render.displayName || fiber.type.render.name || null;
          }
          fiber = fiber.return;
        }
      }
    }
    return null;
  }

  function getSectionType(el) {
    if (el.dataset && el.dataset.vbSection) return el.dataset.vbSection;
    if (el.dataset && el.dataset.section) return el.dataset.section;
    var tag = el.tagName.toLowerCase();
    if (tag === 'header' || tag === 'nav' || tag === 'footer' || tag === 'main' || tag === 'aside' || tag === 'article') return tag;
    var cls = (el.className || '').toLowerCase();
    var id = (el.id || '').toLowerCase();
    var hints = ['hero','nav','header','footer','features','pricing','testimonials','cta','contact','about','faq','stats','gallery','sidebar'];
    for (var i = 0; i < hints.length; i++) {
      if (cls.indexOf(hints[i]) !== -1 || id.indexOf(hints[i]) !== -1) return hints[i];
    }
    return undefined;
  }

  function isVBElement(el) {
    return el && el.nodeType === 1 && !el.id?.startsWith('__vb-') && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE';
  }

  function findVBParent(el) {
    el = el.parentElement;
    while (el && el !== document.body) {
      if (el.hasAttribute(ANNOTATION_ATTR)) return el;
      el = el.parentElement;
    }
    return null;
  }

  function getBreadcrumb(el) {
    var crumbs = [];
    var current = el;
    while (current && current !== document.body) {
      if (current.hasAttribute(ANNOTATION_ATTR)) {
        crumbs.unshift({
          vbId: current.getAttribute(ANNOTATION_ATTR),
          tag: current.tagName.toLowerCase(),
          componentName: getComponentName(current) || undefined,
        });
      }
      current = current.parentElement;
    }
    return crumbs;
  }

  // ─── Annotation ──────────────────────────────────────────

  function annotateElements() {
    var elements = document.querySelectorAll(VB_SELECTORS);
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (!isVBElement(el)) continue;
      if (!el.hasAttribute(ANNOTATION_ATTR)) {
        el.setAttribute(ANNOTATION_ATTR, generateId());
      }
    }
  }

  function buildTree() {
    var sectionElements = document.querySelectorAll(VB_SECTION_SELECTORS);
    var nodes = [];
    var seen = new Set();

    function buildNodeDescriptor(el, depth) {
      if (!isVBElement(el) || depth > 15) return null;
      var vbId = el.getAttribute(ANNOTATION_ATTR);
      if (!vbId) return null;
      if (seen.has(vbId)) return null;
      seen.add(vbId);

      var children = [];
      for (var i = 0; i < el.children.length; i++) {
        var child = el.children[i];
        if (isVBElement(child) && child.hasAttribute(ANNOTATION_ATTR)) {
          var childNode = buildNodeDescriptor(child, depth + 1);
          if (childNode) children.push(childNode);
        }
      }

      var textContent = '';
      for (var j = 0; j < el.childNodes.length; j++) {
        if (el.childNodes[j].nodeType === 3) {
          textContent += el.childNodes[j].textContent;
        }
      }
      textContent = textContent.trim().slice(0, 200);

      var isTextOnly = children.length === 0 && textContent.length > 0;
      var componentName = getComponentName(el);

      return {
        vbId: vbId,
        tag: el.tagName.toLowerCase(),
        componentName: componentName || undefined,
        className: el.className || '',
        textContent: textContent,
        sectionType: getSectionType(el),
        rect: getRect(el),
        children: children,
        isTextOnly: isTextOnly,
        depth: depth,
      };
    }

    // Build from top-level section elements
    for (var i = 0; i < sectionElements.length; i++) {
      var el = sectionElements[i];
      if (!isVBElement(el)) continue;
      // Only include top-level sections (not nested inside other sections)
      var parentSection = el.parentElement;
      var isTopLevel = true;
      while (parentSection && parentSection !== document.body) {
        if (parentSection.matches(VB_SECTION_SELECTORS)) { isTopLevel = false; break; }
        parentSection = parentSection.parentElement;
      }
      if (!isTopLevel) continue;

      var node = buildNodeDescriptor(el, 0);
      if (node) nodes.push(node);
    }

    return nodes;
  }

  function sendToParent(type, payload) {
    window.parent.postMessage({ type: type, payload: payload }, '*');
  }

  // ─── Event handlers ──────────────────────────────────────

  function showOverlay(overlay, labelEl, el, color) {
    var rect = getRect(el);
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    overlay.style.display = 'block';

    var componentName = getComponentName(el);
    var tag = el.tagName.toLowerCase();
    var section = getSectionType(el);
    var text = componentName ? componentName : tag;
    if (section) text += ' [' + section + ']';
    labelEl.textContent = text;
    labelEl.style.top = Math.max(0, rect.top - 20) + 'px';
    labelEl.style.left = rect.left + 'px';
    labelEl.style.display = 'block';
  }

  function hideOverlay(overlay, labelEl) {
    overlay.style.display = 'none';
    labelEl.style.display = 'none';
  }

  function findAnnotatedParent(el) {
    while (el && el !== document.body) {
      if (el.hasAttribute && el.hasAttribute(ANNOTATION_ATTR)) return el;
      el = el.parentElement;
    }
    return null;
  }

  document.addEventListener('mousemove', function(e) {
    var target = findAnnotatedParent(e.target);
    if (!target) {
      if (currentHoveredId) {
        sendToParent('vb:iframe:element:unhover', { vbId: currentHoveredId });
        hideOverlay(hoverOverlay, hoverLabel);
        currentHoveredId = null;
      }
      return;
    }

    var vbId = target.getAttribute(ANNOTATION_ATTR);
    if (vbId === currentHoveredId) return;
    if (vbId === currentSelectedId) return; // Don't hover-highlight selected element

    currentHoveredId = vbId;
    showOverlay(hoverOverlay, hoverLabel, target, '#6366f1');

    sendToParent('vb:iframe:element:hover', {
      vbId: vbId,
      tag: target.tagName.toLowerCase(),
      componentName: getComponentName(target) || undefined,
      className: target.className || '',
      rect: getRect(target),
      depth: getBreadcrumb(target).length,
    });
  }, true);

  document.addEventListener('click', function(e) {
    var target = findAnnotatedParent(e.target);
    if (!target) return;

    e.preventDefault();
    e.stopPropagation();

    var vbId = target.getAttribute(ANNOTATION_ATTR);
    currentSelectedId = vbId;

    showOverlay(selectOverlay, selectLabel, target, '#f59e0b');
    hideOverlay(hoverOverlay, hoverLabel);

    var textContent = '';
    for (var i = 0; i < target.childNodes.length; i++) {
      if (target.childNodes[i].nodeType === 3) {
        textContent += target.childNodes[i].textContent;
      }
    }

    sendToParent('vb:iframe:element:click', {
      vbId: vbId,
      tag: target.tagName.toLowerCase(),
      componentName: getComponentName(target) || undefined,
      className: target.className || '',
      textContent: textContent.trim().slice(0, 500),
      sectionType: getSectionType(target),
      rect: getRect(target),
      breadcrumb: getBreadcrumb(target),
    });
  }, true);

  // ─── Parent message listener ─────────────────────────────

  window.addEventListener('message', function(e) {
    var data = e.data;
    if (!data || typeof data.type !== 'string' || !data.type.startsWith('vb:parent:')) return;

    if (data.type === 'vb:parent:select') {
      var el = document.querySelector('[' + ANNOTATION_ATTR + '="' + data.payload.vbId + '"]');
      if (el) {
        currentSelectedId = data.payload.vbId;
        showOverlay(selectOverlay, selectLabel, el, '#f59e0b');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    if (data.type === 'vb:parent:deselect') {
      currentSelectedId = null;
      hideOverlay(selectOverlay, selectLabel);
    }

    if (data.type === 'vb:parent:highlight') {
      var el2 = document.querySelector('[' + ANNOTATION_ATTR + '="' + data.payload.vbId + '"]');
      if (el2) {
        showOverlay(hoverOverlay, hoverLabel, el2, '#6366f1');
        el2.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    if (data.type === 'vb:parent:update-style') {
      var el3 = document.querySelector('[' + ANNOTATION_ATTR + '="' + data.payload.vbId + '"]');
      if (el3) {
        el3.className = data.payload.className;
        // Re-show overlay with new bounds
        if (currentSelectedId === data.payload.vbId) {
          showOverlay(selectOverlay, selectLabel, el3, '#f59e0b');
        }
      }
    }

    if (data.type === 'vb:parent:update-text') {
      var el4 = document.querySelector('[' + ANNOTATION_ATTR + '="' + data.payload.vbId + '"]');
      if (el4) {
        // Update direct text nodes only (preserve child elements)
        var hasChildElements = false;
        for (var c = 0; c < el4.childNodes.length; c++) {
          if (el4.childNodes[c].nodeType === 1) { hasChildElements = true; break; }
        }
        if (!hasChildElements) {
          el4.textContent = data.payload.text;
        } else {
          // Update only the first text node
          for (var t = 0; t < el4.childNodes.length; t++) {
            if (el4.childNodes[t].nodeType === 3 && el4.childNodes[t].textContent.trim()) {
              el4.childNodes[t].textContent = data.payload.text;
              break;
            }
          }
        }
      }
    }

    if (data.type === 'vb:parent:start-text-edit') {
      var el5 = document.querySelector('[' + ANNOTATION_ATTR + '="' + data.payload.vbId + '"]');
      if (el5) {
        // Enable contentEditable for inline text editing
        el5.setAttribute('contenteditable', 'true');
        el5.style.outline = '2px solid #6366f1';
        el5.style.outlineOffset = '2px';
        el5.style.borderRadius = '2px';
        el5.focus();

        var originalText = el5.textContent || '';

        // Commit on blur or Enter
        function commitEdit() {
          el5.removeAttribute('contenteditable');
          el5.style.outline = '';
          el5.style.outlineOffset = '';
          el5.style.borderRadius = '';
          var newText = el5.textContent || '';
          if (newText !== originalText) {
            sendToParent('vb:iframe:text:committed', {
              vbId: data.payload.vbId,
              oldText: originalText,
              newText: newText,
            });
          }
          el5.removeEventListener('blur', commitEdit);
          el5.removeEventListener('keydown', handleKey);
        }

        function handleKey(ke) {
          if (ke.key === 'Enter' && !ke.shiftKey) {
            ke.preventDefault();
            commitEdit();
          }
          if (ke.key === 'Escape') {
            el5.textContent = originalText;
            commitEdit();
          }
        }

        el5.addEventListener('blur', commitEdit);
        el5.addEventListener('keydown', handleKey);
      }
    }

    if (data.type === 'vb:parent:disable') {
      cleanup();
    }
  });

  // ─── MutationObserver for DOM changes (HMR, etc.) ────────

  var mutationTimer = null;
  var observer = new MutationObserver(function() {
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(function() {
      annotateElements();
      var tree = buildTree();
      var totalNodes = document.querySelectorAll('[' + ANNOTATION_ATTR + ']').length;
      sendToParent('vb:iframe:tree:update', {
        tree: tree,
        totalNodes: totalNodes,
        reason: 'mutation',
      });

      // Reposition overlays if elements moved
      if (currentSelectedId) {
        var selEl = document.querySelector('[' + ANNOTATION_ATTR + '="' + currentSelectedId + '"]');
        if (selEl) showOverlay(selectOverlay, selectLabel, selEl, '#f59e0b');
        else hideOverlay(selectOverlay, selectLabel);
      }
    }, 200);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'className', 'style'],
  });

  // ─── Cleanup ─────────────────────────────────────────────

  function cleanup() {
    observer.disconnect();
    hoverOverlay.remove();
    selectOverlay.remove();
    hoverLabel.remove();
    selectLabel.remove();
    // Remove annotations
    var annotated = document.querySelectorAll('[' + ANNOTATION_ATTR + ']');
    for (var i = 0; i < annotated.length; i++) {
      annotated[i].removeAttribute(ANNOTATION_ATTR);
    }
    window.__vbBridgeActive = false;
    delete window.__vbBridgeCleanup;
  }

  window.__vbBridgeCleanup = cleanup;

  // ─── Initial annotation and tree report ──────────────────

  annotateElements();
  var tree = buildTree();
  var totalNodes = document.querySelectorAll('[' + ANNOTATION_ATTR + ']').length;
  sendToParent('vb:iframe:ready', { tree: tree, totalNodes: totalNodes });

})();
`;

/**
 * Cleanup script to remove the bridge from an iframe.
 */
export const VB_BRIDGE_CLEANUP_SCRIPT = `
  if (window.__vbBridgeCleanup) {
    window.__vbBridgeCleanup();
  }
`;
