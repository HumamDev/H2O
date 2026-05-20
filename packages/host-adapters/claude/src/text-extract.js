// @h2o/host-adapter-claude — turn text/HTML extraction.
//
// Phase 9A-3 MVP: extract three views of a turn's content.
// - text: plain visible text (innerText fallback to textContent)
// - markdown: same as text in 9A-3; real markdown serializer is 9A-5
// - html: outerHTML of the turn container
//
// All functions are defensive: missing elements return safe defaults.

/**
 * @typedef {Object} ExtractedTurnContent
 * @property {string} text
 * @property {string} markdown
 * @property {string} html
 * @property {boolean} hasCode
 * @property {boolean} hasAttachment
 * @property {boolean} hasArtifactRef
 */

/**
 * @param {Element | null | undefined} el
 * @returns {ExtractedTurnContent}
 */
export function extractTurnText(el) {
  if (!el) return emptyContent();

  const text = readTextContent(el);
  const html = readOuterHtml(el);

  return {
    text,
    markdown: text, // 9A-3 MVP — defer real markdown serialization
    html,
    hasCode: hasCodeBlock(el),
    hasAttachment: hasAttachmentRef(el),
    hasArtifactRef: hasArtifactReference(el),
  };
}

/**
 * @returns {ExtractedTurnContent}
 */
export function emptyContent() {
  return {
    text: '',
    markdown: '',
    html: '',
    hasCode: false,
    hasAttachment: false,
    hasArtifactRef: false,
  };
}

/**
 * Prefer innerText (respects display:none / hidden). Fall back to textContent.
 * @param {Element} el
 */
function readTextContent(el) {
  /** @type {any} */ const e = el;
  const raw = typeof e.innerText === 'string' ? e.innerText : (e.textContent || '');
  return String(raw).trim();
}

/**
 * @param {Element} el
 */
function readOuterHtml(el) {
  /** @type {any} */ const e = el;
  return typeof e.outerHTML === 'string' ? e.outerHTML : '';
}

/**
 * @param {Element} el
 */
export function hasCodeBlock(el) {
  /** @type {any} */ const e = el;
  if (typeof e.querySelector !== 'function') return false;
  return !!e.querySelector('pre code, pre > code');
}

/**
 * @param {Element} el
 */
export function hasAttachmentRef(el) {
  /** @type {any} */ const e = el;
  if (typeof e.querySelector !== 'function') return false;
  if (e.querySelector('a[href*=".pdf" i]')) return true;
  if (e.querySelector('[aria-label*="attachment" i],[aria-label*="file" i]')) return true;
  const img = e.querySelector('img:not([alt*="avatar" i])');
  return !!img;
}

/**
 * Conservative detector for in-message artifact references. Phase 9A-3 returns
 * `false` unless an explicit aria hint is present (Claude.ai redesigns often
 * change artifact UI; verify in 9A-2 fixtures before tightening).
 *
 * @param {Element} el
 */
export function hasArtifactReference(el) {
  /** @type {any} */ const e = el;
  if (typeof e.querySelector !== 'function') return false;
  if (e.querySelector('[aria-label*="artifact" i]')) return true;
  return false;
}
