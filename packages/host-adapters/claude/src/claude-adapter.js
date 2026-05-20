// @h2o/host-adapter-claude — main adapter implementation.
//
// Phase 9A-3 scaffolding: stable contract; selectors hypothesis-grade per
// 9A-2 CLAUDE_DOM_NOTES.md. Methods return safe defaults (null / [] /
// 'unknown') when DOM evidence is absent. NEVER throws.
//
// Consumers: Phase 9A-4's claude+chrome content.js. Validator:
// tools/validation/host-adapters/validate-claude-adapter-contract.mjs.

import {
  CONV_PATH_RE,
  CONVERSATION_ROOT_SELECTOR,
  SIDEBAR_SELECTOR,
  TURN_PRIMARY_SELECTOR,
  ASSISTANT_AVATAR_SELECTOR,
  STOP_BUTTON_SELECTOR,
  BREADCRUMB_SELECTOR,
  SIDEBAR_CONV_LINK_SELECTOR,
  isUserInitialsBlock,
} from './selectors.js';

import {
  classifyRoute,
  extractConversationIdFromHref,
  extractProjectIdFromHref,
  getConversationIdFromLocation,
  getProjectIdFromLocation,
  isClaudeAi,
  normalizeLocation,
} from './url-parser.js';

import {
  emptyContent,
  extractTurnText as extractTurnContent,
  hasArtifactReference,
  hasAttachmentRef,
  hasCodeBlock,
} from './text-extract.js';

import {
  H2O_CLAUDE_ADAPTER_VERSION,
  H2O_CLAUDE_HOST,
  RouteKind,
  TurnRole,
} from './types.js';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Resolve the Document for an adapter call. Falls back to globalThis.document
 * if available (browser content-script case). In Node validators, callers
 * always pass an explicit doc.
 *
 * @param {Document | null | undefined} doc
 * @returns {Document | null}
 */
function resolveDoc(doc) {
  if (doc) return doc;
  /** @type {any} */ const g = globalThis;
  return g.document || null;
}

/**
 * @param {Element | null | undefined} root
 * @param {string} selector
 * @returns {Element[]}
 */
function safeQueryAll(root, selector) {
  if (!root || typeof (/** @type {any} */ (root)).querySelectorAll !== 'function') return [];
  try {
    return Array.from(/** @type {any} */ (root).querySelectorAll(selector));
  } catch {
    return [];
  }
}

// ── Detection ──────────────────────────────────────────────────────────────

/**
 * @param {Document | null | undefined} [doc]
 * @returns {import('./types.js').HostContext}
 */
export function detectContext(doc) {
  const d = resolveDoc(doc);
  const loc = normalizeLocation(d);
  return {
    host: H2O_CLAUDE_HOST,
    isClaudeAi: isClaudeAi(d),
    routeKind: /** @type {any} */ (classifyRoute(d)),
    conversationId: getConversationIdFromLocation(d),
    projectId: getProjectIdFromLocation(d),
    url: loc.href,
  };
}

/**
 * @param {Document | null | undefined} [doc]
 */
export function getConversationId(doc) {
  return getConversationIdFromLocation(resolveDoc(doc));
}

/**
 * @param {Document | null | undefined} [doc]
 */
export function getConversationUrl(doc) {
  const { href } = normalizeLocation(resolveDoc(doc));
  return href || '';
}

// ── Turn enumeration ──────────────────────────────────────────────────────

/**
 * Layered turn-boundary predicate per CLAUDE_DOM_NOTES.md §8.
 *  1. Primary: [role="article"] under main
 *  2. Fallback: avatar-bearing containers
 *  3. Fail-safe: return []
 *
 * @param {Document | null | undefined} [doc]
 * @returns {import('./types.js').HostTurn[]}
 */
export function enumerateTurns(doc) {
  const d = resolveDoc(doc);
  if (!d) return [];

  // Layer 1: explicit role="article" inside the main column.
  const root = /** @type {any} */ (d).querySelector?.(CONVERSATION_ROOT_SELECTOR) || d;
  const primary = safeQueryAll(root, TURN_PRIMARY_SELECTOR);
  if (primary.length > 0) {
    return primary.map((el, i) => buildTurn(el, i));
  }

  // Layer 2: containers that hold an avatar marker (user-initials block OR
  // Claude assistant SVG). Deduplicate by document order.
  const candidates = new Set();
  // 2a. Claude/Anthropic assistant SVGs → walk up to nearest ancestor that
  //     looks like a turn container.
  for (const svg of safeQueryAll(root, ASSISTANT_AVATAR_SELECTOR)) {
    const container = nearestTurnContainer(svg);
    if (container) candidates.add(container);
  }
  // 2b. User-initials divs.
  for (const div of safeQueryAll(root, 'div')) {
    if (!isUserInitialsBlock(div)) continue;
    const container = nearestTurnContainer(div);
    if (container) candidates.add(container);
  }

  if (candidates.size === 0) return [];

  // Sort by document order.
  const ordered = Array.from(candidates).sort(compareDocumentOrder);
  return ordered.map((el, i) => buildTurn(/** @type {Element} */ (el), i));
}

/**
 * @param {Element} a
 * @param {Element} b
 */
function compareDocumentOrder(a, b) {
  if (!a || !b) return 0;
  /** @type {any} */ const ea = a;
  /** @type {any} */ const eb = b;
  if (typeof ea.compareDocumentPosition !== 'function') return 0;
  const pos = ea.compareDocumentPosition(eb);
  if (pos & 4 /* Node.DOCUMENT_POSITION_FOLLOWING */) return -1;
  if (pos & 2 /* Node.DOCUMENT_POSITION_PRECEDING */) return 1;
  return 0;
}

/**
 * Walk up the DOM tree looking for the most-plausible "turn container":
 * a div/article ancestor that contains visible text (length ≥ 8) and isn't
 * the conversation root itself.
 *
 * @param {Element | null} start
 * @returns {Element | null}
 */
function nearestTurnContainer(start) {
  /** @type {any} */ let node = start;
  for (let i = 0; node && i < 8; i++) {
    if (node === null) break;
    const role = typeof node.getAttribute === 'function' ? node.getAttribute('role') : null;
    if (role === 'article') return node;
    const text = typeof node.textContent === 'string' ? node.textContent.trim() : '';
    const tag = (node.tagName || '').toLowerCase();
    if (text.length >= 8 && (tag === 'div' || tag === 'article')) {
      // Keep walking up unless the parent is main/body — in which case stop here.
      const parent = node.parentElement;
      const parentTag = (parent?.tagName || '').toLowerCase();
      if (!parent || parentTag === 'main' || parentTag === 'body' || parentTag === 'html') {
        return node;
      }
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * @param {Element} el
 * @param {number} order
 * @returns {import('./types.js').HostTurn}
 */
function buildTurn(el, order) {
  const content = extractTurnContent(el);
  return {
    id: extractTurnId(el),
    role: classifyTurnRole(el),
    order,
    text: content.text,
    markdown: content.markdown,
    html: content.html,
    element: el,
    isPartial: false,
    hasCode: content.hasCode,
    hasAttachment: content.hasAttachment,
    hasArtifactRef: content.hasArtifactRef,
  };
}

/**
 * Best-effort turn-id extraction. Claude.ai does not currently expose stable
 * per-turn ids; we look at data-* attributes as a soft anchor. Returns null
 * when no ID is discoverable (caller falls back to (snapshotId, turnIdx)).
 *
 * @param {Element} el
 * @returns {string | null}
 */
function extractTurnId(el) {
  /** @type {any} */ const e = el;
  if (typeof e.getAttribute !== 'function') return null;
  return (
    e.getAttribute('data-turn-id') ||
    e.getAttribute('data-message-id') ||
    e.getAttribute('id') ||
    null
  );
}

// ── Role classification ──────────────────────────────────────────────────

/**
 * @param {Element | null | undefined} el
 * @returns {'user'|'assistant'|'system'|'unknown'}
 */
export function classifyTurnRole(el) {
  if (!el) return TurnRole.UNKNOWN;
  /** @type {any} */ const e = el;
  if (typeof e.querySelector !== 'function') return TurnRole.UNKNOWN;

  // Hypothesis 1: explicit aria/data attribute (rare on Claude; if present, trust it).
  const explicitRole = e.getAttribute?.('data-role') || e.getAttribute?.('data-message-role');
  if (explicitRole === 'user' || explicitRole === 'assistant' || explicitRole === 'system') {
    return /** @type {any} */ (explicitRole);
  }
  const ariaLabel = (e.getAttribute?.('aria-label') || '').toLowerCase();
  if (/\b(user|you)\b/.test(ariaLabel)) return TurnRole.USER;
  if (/\b(claude|assistant|anthropic)\b/.test(ariaLabel)) return TurnRole.ASSISTANT;

  // Hypothesis 2: presence of Claude/Anthropic SVG marker → assistant.
  if (e.querySelector(ASSISTANT_AVATAR_SELECTOR)) return TurnRole.ASSISTANT;

  // Hypothesis 3: presence of a user-initials block → user.
  try {
    const divs = e.querySelectorAll?.('div');
    if (divs) {
      for (const d of divs) {
        if (isUserInitialsBlock(d)) return TurnRole.USER;
      }
    }
  } catch {
    // continue to unknown
  }

  return TurnRole.UNKNOWN;
}

// ── Text extraction ──────────────────────────────────────────────────────

/**
 * @param {Element | null | undefined} el
 * @returns {{text: string, markdown: string, html: string}}
 */
export function extractTurnText(el) {
  if (!el) return { text: '', markdown: '', html: '' };
  const content = extractTurnContent(el);
  return { text: content.text, markdown: content.markdown, html: content.html };
}

// ── Streaming ────────────────────────────────────────────────────────────

/**
 * Returns true while a generation is in progress.
 * MVP signal: an enabled Stop button is visible.
 *
 * @param {Document | null | undefined} [doc]
 * @returns {boolean}
 */
export function isStreaming(doc) {
  const d = resolveDoc(doc);
  if (!d) return false;
  /** @type {any} */ const stop = d.querySelector?.(STOP_BUTTON_SELECTOR);
  if (!stop) return false;
  return !stop.disabled;
}

// ── Project context ──────────────────────────────────────────────────────

/**
 * @param {Document | null | undefined} [doc]
 * @returns {import('./types.js').ProjectContext | null}
 */
export function getProjectContext(doc) {
  const d = resolveDoc(doc);
  const projectId = getProjectIdFromLocation(d);
  if (!projectId) return null;

  let projectName = null;
  if (d) {
    /** @type {any} */ const breadcrumb = d.querySelector?.(BREADCRUMB_SELECTOR);
    if (breadcrumb) {
      const link = breadcrumb.querySelector?.(`a[href$="/projects/${projectId}"]`);
      const t = link?.textContent?.trim();
      if (t) projectName = t;
    }
  }
  return { projectId, projectName };
}

// ── Sidebar enumeration ──────────────────────────────────────────────────

/**
 * @param {Document | null | undefined} [doc]
 * @returns {import('./types.js').SidebarChat[]}
 */
export function getSidebarChats(doc) {
  const d = resolveDoc(doc);
  if (!d) return [];
  /** @type {any} */ const nav = d.querySelector?.(SIDEBAR_SELECTOR);
  if (!nav) return [];

  const links = safeQueryAll(nav, SIDEBAR_CONV_LINK_SELECTOR);
  /** @type {import('./types.js').SidebarChat[]} */ const out = [];
  for (const a of links) {
    /** @type {any} */ const link = a;
    const href = link.getAttribute?.('href') || '';
    const id = extractConversationIdFromHref(href);
    if (!id) continue;
    out.push({
      id,
      title: (link.textContent || '').trim(),
      href,
      projectId: extractProjectIdFromHref(href),
    });
  }
  return out;
}

// ── Adapter factory ──────────────────────────────────────────────────────

/**
 * Returns a frozen adapter object exposing the stable API surface.
 * Useful for dependency injection.
 *
 * @returns {import('./types.js').ClaudeAdapter}
 */
export function createClaudeAdapter() {
  return Object.freeze({
    version: H2O_CLAUDE_ADAPTER_VERSION,
    host: H2O_CLAUDE_HOST,
    detectContext,
    getConversationId,
    getConversationUrl,
    enumerateTurns,
    classifyTurnRole,
    extractTurnText,
    isStreaming,
    getProjectContext,
    getSidebarChats,
  });
}
