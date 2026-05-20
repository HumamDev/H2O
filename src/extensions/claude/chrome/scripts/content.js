// H2O Claude Chrome — content script MVP (Phase 9A-4).
//
// Read-only DOM/URL probe for claude.ai. Vendors the runtime contract from
// `@h2o/host-adapter-claude` (the workspace package authored in Phase 9A-3):
//   - URL regexes (CONV_PATH_RE, PROJ_PATH_RE, NEW_PATH_RE)
//   - layered turn-boundary predicate (role="article" primary, avatar fallback)
//   - role classifier (data-role → ARIA → avatar SVG → user-initials)
//   - defensive text/HTML extraction (innerText fallback)
//
// Vendored — not imported — because the Phase 9A-4 builder is a thin file-copy
// (`tools/product/extensions/_shared/build-extension-stub.mjs`) with no bundler.
// The host-adapter package remains the source-of-truth for the contract; this
// file is a runtime instance of it. When 9A-2 live verification updates
// `packages/host-adapter/claude/src/selectors.js`, propagate the changes here
// in the same commit. A Phase 9A-5+ task will add a proper bundler so this
// vendoring becomes a real `import` of the package.
//
// MVP boundaries (per task spec):
//   - No storage writes (no chrome.storage, no localStorage, no IndexedDB)
//   - No network calls (no fetch, no XHR, no chrome.runtime.sendMessage)
//   - No DOM mutation beyond two data-attribute markers on documentElement
//   - No save button, no archive flow, no MiniMap/Highlights/Command Bar
//   - No artifacts/auto-sync
//
// Debug API exposed on the isolated-world `window`:
//   window.H2OClaudeMVP.context()    — HostContext for the current page
//   window.H2OClaudeMVP.turns()      — HostTurn[] (in document order)
//   window.H2OClaudeMVP.scan()       — quick summary { context, turnCount, ... }
//   window.H2OClaudeMVP.diagnose()   — full diagnostic incl. selector hit-rates
//
// To access from DevTools: open Chrome DevTools → Console → switch the context
// dropdown (top-left) from "top" to the H2O extension's content-script context.
// Then call e.g. `window.H2OClaudeMVP.diagnose()`.
//
// To enable verbose console logs on load, set `window.H2O_CLAUDE_DEBUG = true`
// in the extension content-script context BEFORE navigation, or reload the
// page with the flag present.

(function () {
  'use strict';

  // Idempotency guard — content scripts can re-execute on SPA route changes
  // depending on the manifest; do not double-install the API or markers.
  if (window.__h2oClaudeMvpLoaded) return;
  window.__h2oClaudeMvpLoaded = true;

  // ── Vendored contract constants (from packages/host-adapters/claude/src/) ─

  const H2O_CLAUDE_MVP_VERSION = '0.1.0';
  const H2O_CLAUDE_HOST = 'claude.ai';

  /** URL regexes — must stay byte-identical to packages/host-adapters/claude/src/selectors.js */
  const CONV_PATH_RE = /\/(?:chat|conversations)\/([0-9a-f-]{36})/i;
  const PROJ_PATH_RE = /\/projects\/([^/]+)/;
  const NEW_PATH_RE = /^\/new\/?$/;
  const CLAUDE_HOST_RE = /(?:^|\.)claude\.ai$/i;

  /** Turn-boundary + role + control selectors — see CLAUDE_DOM_NOTES.md §6 */
  const TURN_PRIMARY_SELECTOR = '[role="article"]';
  const ASSISTANT_AVATAR_SELECTOR =
    'svg[aria-label*="claude" i],svg[aria-label*="anthropic" i]';
  const STOP_BUTTON_SELECTOR = 'button[aria-label*="stop" i]';
  const SIDEBAR_SELECTOR = 'nav,[role="navigation"]';
  const SIDEBAR_CONV_LINK_SELECTOR =
    'a[href*="/chat/"], a[href*="/conversations/"]';
  const BREADCRUMB_SELECTOR = 'nav[aria-label*="breadcrumb" i]';
  const CONVERSATION_ROOT_SELECTOR = 'main';

  /** User-initials avatar predicate (programmatic, text-content based). */
  function isUserInitialsBlock(el) {
    if (!el || (el.children && el.children.length)) return false;
    const t = (el.textContent || '').trim();
    return /^[A-Z]{1,2}$/.test(t);
  }

  // ── URL parsing (defensive, always returns a HostContext shape) ───────────

  function classifyRoute(pathname) {
    if (!pathname) return 'unknown';
    const hasConv = CONV_PATH_RE.test(pathname);
    const hasProj = PROJ_PATH_RE.test(pathname);
    if (NEW_PATH_RE.test(pathname)) return 'new';
    if (hasConv && hasProj) return 'project-chat';
    if (hasConv) return 'chat';
    if (hasProj) return 'project';
    return 'unknown';
  }

  function detectContext() {
    const loc = window.location || { href: '', pathname: '', hostname: '' };
    const path = String(loc.pathname || '');
    const convMatch = path.match(CONV_PATH_RE);
    const projMatch = path.match(PROJ_PATH_RE);
    return {
      host: H2O_CLAUDE_HOST,
      isClaudeAi: CLAUDE_HOST_RE.test(loc.hostname || ''),
      routeKind: classifyRoute(path),
      conversationId: convMatch ? convMatch[1] : null,
      projectId: projMatch ? projMatch[1] : null,
      url: String(loc.href || ''),
    };
  }

  // ── Turn enumeration (layered predicate per CLAUDE_DOM_NOTES.md §8) ──────

  function safeQueryAll(root, selector) {
    if (!root || typeof root.querySelectorAll !== 'function') return [];
    try {
      return Array.from(root.querySelectorAll(selector));
    } catch (_) {
      return [];
    }
  }

  function nearestTurnContainer(start) {
    let node = start;
    for (let i = 0; node && i < 8; i++) {
      if (!node) break;
      const role =
        typeof node.getAttribute === 'function' ? node.getAttribute('role') : null;
      if (role === 'article') return node;
      const text = typeof node.textContent === 'string' ? node.textContent.trim() : '';
      const tag = ((node.tagName || '') + '').toLowerCase();
      if (text.length >= 8 && (tag === 'div' || tag === 'article')) {
        const parent = node.parentElement;
        const parentTag = parent ? ((parent.tagName || '') + '').toLowerCase() : '';
        if (!parent || parentTag === 'main' || parentTag === 'body' || parentTag === 'html') {
          return node;
        }
      }
      node = node.parentElement;
    }
    return null;
  }

  function compareDocumentOrder(a, b) {
    if (!a || !b) return 0;
    if (typeof a.compareDocumentPosition !== 'function') return 0;
    const pos = a.compareDocumentPosition(b);
    if (pos & 4) return -1; // DOCUMENT_POSITION_FOLLOWING
    if (pos & 2) return 1; // DOCUMENT_POSITION_PRECEDING
    return 0;
  }

  function enumerateTurnElements() {
    const root =
      (document && document.querySelector
        ? document.querySelector(CONVERSATION_ROOT_SELECTOR)
        : null) || document;

    // Layer 1: explicit role="article"
    const primary = safeQueryAll(root, TURN_PRIMARY_SELECTOR);
    if (primary.length > 0) return primary;

    // Layer 2: containers bearing an assistant SVG or user-initials block
    const candidates = new Set();
    for (const svg of safeQueryAll(root, ASSISTANT_AVATAR_SELECTOR)) {
      const c = nearestTurnContainer(svg);
      if (c) candidates.add(c);
    }
    for (const div of safeQueryAll(root, 'div')) {
      if (!isUserInitialsBlock(div)) continue;
      const c = nearestTurnContainer(div);
      if (c) candidates.add(c);
    }
    return Array.from(candidates).sort(compareDocumentOrder);
  }

  // ── Role classifier ──────────────────────────────────────────────────────

  function classifyTurnRole(el) {
    if (!el || typeof el.querySelector !== 'function') return 'unknown';

    const explicit =
      (el.getAttribute && el.getAttribute('data-role')) ||
      (el.getAttribute && el.getAttribute('data-message-role'));
    if (explicit === 'user' || explicit === 'assistant' || explicit === 'system') {
      return explicit;
    }

    const aria = (el.getAttribute && (el.getAttribute('aria-label') || '')).toLowerCase();
    if (/\b(user|you)\b/.test(aria)) return 'user';
    if (/\b(claude|assistant|anthropic)\b/.test(aria)) return 'assistant';

    if (el.querySelector(ASSISTANT_AVATAR_SELECTOR)) return 'assistant';

    try {
      const divs = el.querySelectorAll('div');
      if (divs) {
        for (const d of divs) {
          if (isUserInitialsBlock(d)) return 'user';
        }
      }
    } catch (_) {
      // fall through
    }
    return 'unknown';
  }

  // ── Text + flags extraction ──────────────────────────────────────────────

  function readText(el) {
    if (!el) return '';
    const raw = typeof el.innerText === 'string' ? el.innerText : el.textContent || '';
    return String(raw).trim();
  }

  function hasCodeBlock(el) {
    return !!(el && el.querySelector && el.querySelector('pre code, pre > code'));
  }

  function hasAttachmentRef(el) {
    if (!el || typeof el.querySelector !== 'function') return false;
    if (el.querySelector('a[href*=".pdf" i]')) return true;
    if (el.querySelector('[aria-label*="attachment" i],[aria-label*="file" i]')) return true;
    return !!el.querySelector('img:not([alt*="avatar" i])');
  }

  function hasArtifactRef(el) {
    if (!el || typeof el.querySelector !== 'function') return false;
    return !!el.querySelector('[aria-label*="artifact" i]');
  }

  function extractTurnId(el) {
    if (!el || typeof el.getAttribute !== 'function') return null;
    return (
      el.getAttribute('data-turn-id') ||
      el.getAttribute('data-message-id') ||
      el.getAttribute('id') ||
      null
    );
  }

  function buildTurn(el, order) {
    return {
      id: extractTurnId(el),
      role: classifyTurnRole(el),
      order,
      text: readText(el),
      hasCode: hasCodeBlock(el),
      hasAttachment: hasAttachmentRef(el),
      hasArtifactRef: hasArtifactRef(el),
    };
  }

  function enumerateTurns() {
    const els = enumerateTurnElements();
    return els.map((el, i) => buildTurn(el, i));
  }

  // ── Streaming + project + sidebar ────────────────────────────────────────

  function isStreaming() {
    if (!document || !document.querySelector) return false;
    const stop = document.querySelector(STOP_BUTTON_SELECTOR);
    if (!stop) return false;
    return !stop.disabled;
  }

  function getProjectContext() {
    const ctx = detectContext();
    if (!ctx.projectId) return null;
    let projectName = null;
    try {
      const breadcrumb = document.querySelector(BREADCRUMB_SELECTOR);
      if (breadcrumb) {
        const link = breadcrumb.querySelector(`a[href$="/projects/${ctx.projectId}"]`);
        const t = link && link.textContent ? link.textContent.trim() : '';
        if (t) projectName = t;
      }
    } catch (_) {
      // leave name null
    }
    return { projectId: ctx.projectId, projectName };
  }

  function getSidebarChats() {
    if (!document || !document.querySelector) return [];
    const nav = document.querySelector(SIDEBAR_SELECTOR);
    if (!nav) return [];
    const links = safeQueryAll(nav, SIDEBAR_CONV_LINK_SELECTOR);
    const out = [];
    for (const a of links) {
      const href = (a.getAttribute && a.getAttribute('href')) || '';
      const convMatch = href.match(CONV_PATH_RE);
      const projMatch = href.match(PROJ_PATH_RE);
      if (!convMatch) continue;
      out.push({
        id: convMatch[1],
        title: ((a.textContent || '') + '').trim(),
        href,
        projectId: projMatch ? projMatch[1] : null,
      });
    }
    return out;
  }

  // ── Debug API (the MVP's primary surface) ────────────────────────────────

  const SELECTOR_PROBES = {
    role_article: () => safeQueryAll(document, TURN_PRIMARY_SELECTOR).length,
    main_present: () => !!(document && document.querySelector && document.querySelector(CONVERSATION_ROOT_SELECTOR)),
    composer_present: () => !!(document && document.querySelector && document.querySelector('[contenteditable="true"]')),
    stop_button_present: () => !!(document && document.querySelector && document.querySelector(STOP_BUTTON_SELECTOR)),
    sidebar_nav_present: () => !!(document && document.querySelector && document.querySelector(SIDEBAR_SELECTOR)),
  };

  function selectorProbeReport() {
    const out = {};
    for (const [name, fn] of Object.entries(SELECTOR_PROBES)) {
      try {
        out[name] = fn();
      } catch (e) {
        out[name] = { error: String((e && e.message) || e) };
      }
    }
    return out;
  }

  function context() {
    return detectContext();
  }

  function turns() {
    return enumerateTurns();
  }

  function scan() {
    const ctx = detectContext();
    const ts = enumerateTurns();
    return {
      context: ctx,
      turnCount: ts.length,
      isStreaming: isStreaming(),
      sidebarLinkCount: getSidebarChats().length,
      project: getProjectContext(),
    };
  }

  function diagnose() {
    const ctx = detectContext();
    const ts = enumerateTurns();
    return {
      version: H2O_CLAUDE_MVP_VERSION,
      adapterPackage: '@h2o/host-adapter-claude@0.1.0 (vendored)',
      loadedAt: new Date().toISOString(),
      contextOk: ctx.isClaudeAi,
      context: ctx,
      turnCount: ts.length,
      rolesObserved: ts.reduce((acc, t) => {
        acc[t.role] = (acc[t.role] || 0) + 1;
        return acc;
      }, {}),
      isStreaming: isStreaming(),
      sidebarLinkCount: getSidebarChats().length,
      project: getProjectContext(),
      selectorProbes: selectorProbeReport(),
      debugFlag: !!window.H2O_CLAUDE_DEBUG,
      supportedActions: {
        readonlyScan: true,
        archiveTurns: false,
        saveButton: false,
        miniMap: false,
        highlights: false,
        commandBar: false,
        artifacts: false,
      },
      mvpBoundary: 'Phase 9A-4 — read-only adapter probe; no storage/network/DOM-mutation.',
    };
  }

  // ── Install API + boot marker ────────────────────────────────────────────

  const H2OClaudeMVP = Object.freeze({
    version: H2O_CLAUDE_MVP_VERSION,
    host: H2O_CLAUDE_HOST,
    context,
    turns,
    scan,
    diagnose,
  });

  window.H2OClaudeMVP = H2OClaudeMVP;

  // Boot marker (consistent with Phase 8G-5 stub for smoke-test compatibility)
  try {
    document.documentElement.dataset.h2oClaudeChromeDev = 'loaded';
    document.documentElement.dataset.h2oClaudeMvp = H2O_CLAUDE_MVP_VERSION;
  } catch (_) {
    // ignore — DOM not ready or restricted
  }

  // Gated console log
  if (window.H2O_CLAUDE_DEBUG) {
    try {
      // eslint-disable-next-line no-console
      console.log('[H2OClaudeMVP] loaded', diagnose());
    } catch (_) { /* ignore */ }
  } else {
    try {
      // eslint-disable-next-line no-console
      console.log(
        '[H2OClaudeMVP] v' +
          H2O_CLAUDE_MVP_VERSION +
          ' on ' +
          (location.host || 'unknown') +
          ' — call window.H2OClaudeMVP.diagnose() in the extension content-script context. Set window.H2O_CLAUDE_DEBUG=true for verbose logs.',
      );
    } catch (_) { /* ignore */ }
  }
})();
