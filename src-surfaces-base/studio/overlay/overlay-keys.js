/* H2O Studio — Overlay Keys (Phase 2a)
 *
 * Frozen constants for the Studio edit-overlay subsystem. Passive: loading
 * this file only attaches constant namespaces under H2O.Studio.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};

  if (H2O.Studio.OverlayKeys && H2O.Studio.OverlayEvents
    && H2O.Studio.OverlayOpTypes && H2O.Studio.OverlayTargets) {
    return;
  }

  var VERSION = '0.1.0-phase-2a';
  var SCHEMA_VERSION = 1;
  var KEY_PREFIX = 'h2o:studio:edit-overlay:v1:';

  var OverlayKeys = Object.freeze({
    version: VERSION,
    schemaVersion: SCHEMA_VERSION,
    prefix: KEY_PREFIX,
    index: KEY_PREFIX + 'index',
    record: function record(snapshotId) {
      return KEY_PREFIX + encodeURIComponent(String(snapshotId || ''));
    },
  });

  var OverlayEvents = Object.freeze({
    ready: 'evt:h2o:studio:overlay:ready',
    changed: 'evt:h2o:studio:overlay:changed',
    removed: 'evt:h2o:studio:overlay:removed',
    driftDetected: 'evt:h2o:studio:overlay:drift-detected',
    applySkipped: 'evt:h2o:studio:overlay:apply-skipped',
  });

  var OverlayOpTypes = Object.freeze({
    heading: 'heading',
    quote: 'quote',
    codeBlock: 'code-block',
    callout: 'callout',
    cleanSpacing: 'clean-spacing',
    /* Phase 2c-A — explicit op-type constants used by the structure
     * pass. The historical `section`/`divider`/`toc` slots remain for
     * back-compat with any external consumer that imported them as
     * names before the structure pass shipped. */
    addSection: 'add-section',
    splitSection: 'split-section',
    collapseSection: 'collapse-section',
    pageDivider: 'page-divider',
    section: 'section',
    divider: 'divider',
    toc: 'toc',
    /* Phase 4 (slice 1) — message-level character formatting. All four
     * are simple boolean toggles on the selected turn; identical shape
     * to the Phase 2b `quote` and `code` ops. `clear-formatting` is a
     * special reset marker the reducer interprets as "drop all per-
     * message decorations for this turn at this point in op order";
     * subsequent ops on the same turn apply normally on top of the
     * cleared state. */
    bold: 'bold',
    italic: 'italic',
    underline: 'underline',
    strikethrough: 'strikethrough',
    clearFormatting: 'clear-formatting',
    /* Phase 4-2 — message-level text color. Payload kind is one of the
     * 5 semantic palette names ('red'|'green'|'blue'|'orange'|'gray')
     * or `null` to clear. Last op of (type, target) wins, same as
     * the Phase 2b `callout` precedent. Highlights (background color)
     * are NOT part of this op — they are owned by the existing
     * H2O.IHighlighter / H2O.Studio.store.highlights system and the
     * Ribbon controls that system directly through its public APIs
     * rather than duplicating it as an overlay op. */
    textColor: 'text-color',
    /* Phase 4-3 — message-level paragraph controls. All three operate on
     * the entire selected turn (no inline text selection); reducer state
     * follows the Phase 2b "last op of (type, target) wins" rule.
     *   list   — payload.kind: 'bullet'|'numbered'|null  (null clears)
     *   align  — payload.value: 'left'|'center'|'right'|null
     *   indent — payload.level: number 0..3 (absolute level; clamped)
     * clear-formatting resets all three via defaultMessageState. */
    list: 'list',
    align: 'align',
    indent: 'indent',
    /* Phase 4-4 — OneNote-style visual tags (NOT Library metadata tags).
     * Single op type with a kind-discriminator payload:
     *   payload: { kind: 'todo'|'important'|'question'|'definition'|'warning'|'idea',
     *              enabled: boolean }
     * Reducer tracks six independent booleans inside state.visualTags so
     * multiple tags can stack on one message (OneNote precedent). These
     * are visual overlay annotations rendered as a glyph row + colored
     * left-stripe on the turn wrapper — they are NEVER persisted to the
     * Library tag store (H2O.Studio.store.tags) and NEVER bind to chats. */
    visualTag: 'visual-tag',
    /* Phase 5b-1 — inline character formatting (Bold / Italic only) for a
     * selected text RANGE inside one saved-reader message. Unlike Phase
     * 4-1's message-level bold/italic (a whole-turn boolean), this op
     * carries a Phase 5a selection anchor in the target and applies to a
     * sub-range:
     *   target:  { kind: 'inline', turnIdx, messageId, anchor: {textQuote,textPos,xpath} }
     *   payload: { style: 'bold'|'italic', enabled: boolean }
     * The reducer reduces these into per-message merged integer-interval
     * sets (bold / italic) in the message's flattened-text coordinate
     * space; the studio.js render pass resolves intervals to live ranges
     * and wraps them in <strong>/<em data-overlay-inline> spans. Reader-
     * only in 5b-1 (no export). clear-formatting clears inline intervals
     * for the message alongside the message-level decorations. */
    inlineFormat: 'inline-format',
  });

  var OverlayTargets = Object.freeze({
    message: 'message',
    section: 'section',
    betweenTurns: 'between-turns',
    snapshot: 'snapshot',
  });

  function selfCheck() {
    return {
      ok: true,
      version: VERSION,
      schemaVersion: SCHEMA_VERSION,
      keyPrefix: KEY_PREFIX,
      eventCount: Object.keys(OverlayEvents).length,
      opTypeCount: Object.keys(OverlayOpTypes).length,
      targetCount: Object.keys(OverlayTargets).length,
    };
  }

  H2O.Studio.OverlayKeys = OverlayKeys;
  H2O.Studio.OverlayEvents = OverlayEvents;
  H2O.Studio.OverlayOpTypes = OverlayOpTypes;
  H2O.Studio.OverlayTargets = OverlayTargets;
  H2O.Studio.OverlayKeysSelfCheck = selfCheck;
})(globalThis);
