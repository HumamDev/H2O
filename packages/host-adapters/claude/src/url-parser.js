// @h2o/host-adapter-claude — URL parsing helpers.
//
// Stateless. Accepts either a location-shaped object {href, pathname, hostname}
// or a raw URL string. Pure functions — no DOM, no globals.

import { CONV_PATH_RE, PROJ_PATH_RE, NEW_PATH_RE, CLAUDE_HOST_RE } from './selectors.js';

/**
 * @typedef {Object} LocationShape
 * @property {string} [href]
 * @property {string} [pathname]
 * @property {string} [hostname]
 */

/**
 * Coerce any of (URL string, location-shape, Document with .location) into
 * a normalized {href, pathname, hostname} triple.
 *
 * @param {string | LocationShape | Document | null | undefined} src
 * @returns {LocationShape}
 */
export function normalizeLocation(src) {
  if (!src) return { href: '', pathname: '', hostname: '' };

  // Document with .location
  if (typeof src === 'object' && src && /** @type {Document} */ (src).location) {
    const loc = /** @type {Document} */ (src).location;
    return {
      href: String(loc.href || ''),
      pathname: String(loc.pathname || ''),
      hostname: String(loc.hostname || ''),
    };
  }

  // Location-shape (or anything with the three fields directly)
  if (typeof src === 'object'
      && (typeof /** @type {any} */ (src).href === 'string'
        || typeof /** @type {any} */ (src).pathname === 'string')) {
    /** @type {any} */ const o = src;
    return {
      href: String(o.href || ''),
      pathname: String(o.pathname || ''),
      hostname: String(o.hostname || ''),
    };
  }

  // URL string
  if (typeof src === 'string') {
    try {
      const u = new URL(src);
      return { href: u.href, pathname: u.pathname, hostname: u.hostname };
    } catch {
      return { href: src, pathname: '', hostname: '' };
    }
  }

  return { href: '', pathname: '', hostname: '' };
}

/**
 * @param {string | LocationShape | Document | null | undefined} src
 * @returns {string | null} 36-char UUID v4 from /chat/<id> or /conversations/<id>, else null
 */
export function getConversationIdFromLocation(src) {
  const { pathname } = normalizeLocation(src);
  const m = pathname.match(CONV_PATH_RE);
  return m ? m[1] : null;
}

/**
 * @param {string | LocationShape | Document | null | undefined} src
 * @returns {string | null} project segment, or null
 */
export function getProjectIdFromLocation(src) {
  const { pathname } = normalizeLocation(src);
  const m = pathname.match(PROJ_PATH_RE);
  return m ? m[1] : null;
}

/**
 * @param {string | LocationShape | Document | null | undefined} src
 * @returns {boolean}
 */
export function isClaudeAi(src) {
  const { hostname } = normalizeLocation(src);
  return CLAUDE_HOST_RE.test(hostname || '');
}

/**
 * Route classification.
 *
 * @param {string | LocationShape | Document | null | undefined} src
 * @returns {'new' | 'chat' | 'project-chat' | 'project' | 'unknown'}
 */
export function classifyRoute(src) {
  const { pathname } = normalizeLocation(src);
  if (!pathname) return 'unknown';
  const hasConv = CONV_PATH_RE.test(pathname);
  const hasProj = PROJ_PATH_RE.test(pathname);
  if (NEW_PATH_RE.test(pathname)) return 'new';
  if (hasConv && hasProj) return 'project-chat';
  if (hasConv) return 'chat';
  if (hasProj) return 'project';
  return 'unknown';
}

/**
 * Extract a project id from a relative or absolute URL string (sidebar hrefs).
 * @param {string} href
 * @returns {string | null}
 */
export function extractProjectIdFromHref(href) {
  if (!href || typeof href !== 'string') return null;
  const m = href.match(PROJ_PATH_RE);
  return m ? m[1] : null;
}

/**
 * Extract a conversation id from a relative or absolute URL string (sidebar hrefs).
 * @param {string} href
 * @returns {string | null}
 */
export function extractConversationIdFromHref(href) {
  if (!href || typeof href !== 'string') return null;
  const m = href.match(CONV_PATH_RE);
  return m ? m[1] : null;
}
