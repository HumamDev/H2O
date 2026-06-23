/* H2O Studio — Shared HTML Sanitizer (surface-neutral)
 *
 * Chat Saving Architecture Phase C C3.1. Centralizes the interim, hardened
 * regex HTML sanitizer that was previously inlined in
 * ingestion/saved-chat-package-v1.tauri.js so the saved-chat package projector
 * (and any future renderer/import) share one allowlist contract.
 *
 * Surface-neutral: NOT Tauri-gated. Installs on both Desktop and Chrome so any
 * surface can sanitize; it performs no IO, no capture, and no platform calls.
 *
 * INTERIM IMPLEMENTATION (per ADR-0010 "C3.0" + saved-chat-package-format.md):
 * this is a hardened *regex* sanitizer, paired with the static CSP that the
 * package renderer puts on chat.html as defense-in-depth. A DOM/allowlist
 * sanitizer (and a headless-validator DOM shim) are deliberately deferred —
 * regex is chosen because the validators run headless with no DOM.
 *
 * Behavior is byte-equivalent to the Phase B projector helpers it replaces, with
 * one hardening: the dangerous-tag strip list is extended from
 * script/style/iframe/object/embed to additionally cover base/meta/form/svg/math
 * (C3.1 requirement). Fixtures without those tags are unaffected, so the existing
 * saved-chat package validator stays green.
 *
 * Public API (H2O.Studio.html.sanitize):
 *   sanitizeHtml(input)        -> sanitized HTML string
 *   escapeHtml(input)          -> HTML-escaped text
 *   extractTextFromHtml(input) -> readable plain text
 *   sanitizeUrl(input)         -> input, or '#' if unsafe
 *   isSafeUrl(input)           -> boolean
 *   diagnose()                 -> { installed, version, mode, strippedTags, ... }
 *
 * Contracts: surfaces/studio/STUDIO_PORTABILITY_CONTRACT.md
 *            docs/decisions/ADR-0010-saved-chat-asset-cas.md
 *            docs/systems/archive/saved-chat-package-format.md
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.html = H2O.Studio.html || {};
  if (H2O.Studio.html.sanitize && H2O.Studio.html.sanitize.__installed) return;

  var VERSION = '0.1.0-phase-c-c3.1';

  /* Dangerous element tags removed entirely (paired blocks and stray open/close/
   * void forms). Extended in C3.1 to add base/meta/form/svg/math. */
  var DANGEROUS_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'base', 'meta', 'form', 'svg', 'math'];
  var DANGEROUS_TAGS_RE = DANGEROUS_TAGS.join('|');
  var DANGEROUS_PAIRED_RE = new RegExp('<\\s*(' + DANGEROUS_TAGS_RE + ')\\b[\\s\\S]*?<\\s*\\/\\s*\\1\\s*>', 'gi');
  var DANGEROUS_LONE_RE = new RegExp('<\\s*\\/?\\s*(' + DANGEROUS_TAGS_RE + ')\\b[^>]*>', 'gi');

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function decodeHtmlEntities(value) {
    return String(value == null ? '' : value)
      .replace(/&#x([0-9a-f]+);?/gi, function (_, hex) {
        var code = parseInt(hex, 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : '';
      })
      .replace(/&#([0-9]+);?/g, function (_, dec) {
        var code = parseInt(dec, 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : '';
      })
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&#39;/gi, "'");
  }

  function normalizeUrlForSafety(value) {
    return decodeHtmlEntities(value).trim().replace(/\s+/g, '').toLowerCase();
  }

  function isUnsafeUrl(value) {
    var normalized = normalizeUrlForSafety(value);
    return normalized.indexOf('javascript:') === 0
      || normalized.indexOf('vbscript:') === 0
      || normalized.indexOf('data:text/html') === 0;
  }

  function isSafeUrl(value) {
    return !isUnsafeUrl(value);
  }

  function sanitizeUrl(value) {
    return isUnsafeUrl(value) ? '#' : String(value == null ? '' : value);
  }

  function stripDangerousTags(html) {
    var out = String(html == null ? '' : html);
    out = out.replace(/<!--[\s\S]*?-->/g, '');
    out = out.replace(DANGEROUS_PAIRED_RE, '');
    out = out.replace(DANGEROUS_LONE_RE, '');
    return out;
  }

  function sanitizeHtml(htmlRaw) {
    var html = cleanString(htmlRaw);
    if (!html) return '';
    var out = stripDangerousTags(html);
    out = out.replace(/\s+on[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    out = out.replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    out = out.replace(/\s+(href|src|xlink:href|formaction|action)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
      function (match, attr, rawValue) {
        var value = String(rawValue || '').trim();
        var unquoted = value;
        if ((unquoted[0] === '"' && unquoted[unquoted.length - 1] === '"')
          || (unquoted[0] === "'" && unquoted[unquoted.length - 1] === "'")) {
          unquoted = unquoted.slice(1, -1);
        }
        if (!isUnsafeUrl(unquoted)) return match;
        return ' ' + attr.toLowerCase() + '="#"';
      });
    return out.trim();
  }

  function extractTextFromHtml(htmlRaw) {
    var html = stripDangerousTags(htmlRaw);
    html = html.replace(/<\s*br\s*\/?\s*>/gi, '\n');
    html = html.replace(/<\s*\/\s*(p|div|li|h[1-6]|tr|section|article|blockquote)\s*>/gi, '\n');
    html = html.replace(/<[^>]+>/g, ' ');
    return decodeHtmlEntities(html).replace(/[ \t\r\f\v]+/g, ' ').replace(/\n\s+/g, '\n').trim();
  }

  function diagnose() {
    return {
      installed: true,
      version: VERSION,
      mode: 'regex+csp-interim',
      domSanitizer: false,
      strippedTags: DANGEROUS_TAGS.slice(),
      neutralizedUrlSchemes: ['javascript:', 'vbscript:', 'data:text/html'],
      strippedAttributes: ['on* handlers', 'srcdoc'],
      note: 'Interim hardened-regex sanitizer; DOM/allowlist sanitizer deferred. chat.html keeps a static CSP as defense-in-depth.',
    };
  }

  H2O.Studio.html.sanitize = {
    __installed: true,
    __version: VERSION,
    sanitizeHtml: sanitizeHtml,
    escapeHtml: escapeHtml,
    extractTextFromHtml: extractTextFromHtml,
    sanitizeUrl: sanitizeUrl,
    isSafeUrl: isSafeUrl,
    diagnose: diagnose,
  };
})(typeof window !== 'undefined' ? window : globalThis);
