/* H2O Studio — Edit Overlay Applier (Phase 2b)
 *
 * Message-level formatting application. The applier:
 *   - Validates overlay shape and checks baseDigest drift (refuses to
 *     render on drift; emits drift-detected).
 *   - Reduces the overlay's op log into per-message visual state
 *     (heading / quote / code / callout / clean-spacing).
 *   - Applies state to turn elements in the reader DOM by setting
 *     `data-overlay-*` attributes; CSS rules in studio.css map those
 *     attributes to the soft dark visual style.
 *
 * Strict invariants (do not relax):
 *   - NEVER mutates snapshot.messages or the captured snapshot file.
 *   - NEVER modifies captured message text content. Decorative-only
 *     `data-overlay-*` attributes on the `[data-turn]` wrapper element.
 *   - Op application is idempotent: re-running applyOverlay with the
 *     same overlay yields identical DOM attributes.
 *   - The applier never throws — all branches catch internally.
 *
 * Pure helpers (no DOM, no I/O) also exported:
 *   appendOp(overlay, opSpec) -> overlay'
 *   computeMessageState(overlay, turnIdx) -> { heading, quote, code, callout, cleanSpacing }
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};

  if (H2O.Studio.overlay && H2O.Studio.overlay.__installed) {
    return;
  }

  var VERSION = '0.1.0-phase-2b';
  var PHASE = '2b';
  var OverlayKeys = H2O.Studio.OverlayKeys || { schemaVersion: 1 };
  var OverlayEvents = H2O.Studio.OverlayEvents || {
    ready: 'evt:h2o:studio:overlay:ready',
    driftDetected: 'evt:h2o:studio:overlay:drift-detected',
    applySkipped: 'evt:h2o:studio:overlay:apply-skipped',
  };
  var SCHEMA_VERSION = Number(OverlayKeys.schemaVersion || 1);
  var errors = [];
  var errMax = 20;

  function recordError(op, e) {
    try {
      errors.push({ t: Date.now(), op: String(op), e: String((e && e.message) || (e && e.stack) || e || '') });
      if (errors.length > errMax) errors.splice(0, errors.length - errMax);
    } catch (_) { /* swallow */ }
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!isObject(value)) return value;
    var out = {};
    Object.keys(value).sort().forEach(function (key) {
      var v = value[key];
      if (typeof v === 'function') return;
      out[key] = stableValue(v);
    });
    return out;
  }

  function fnv1a(input) {
    var hash = 0x811c9dc5;
    var s = String(input || '');
    for (var i = 0; i < s.length; i += 1) {
      hash ^= s.charCodeAt(i);
      hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
    }
    return ('00000000' + hash.toString(16)).slice(-8);
  }

  function normalizeMessages(input) {
    if (Array.isArray(input)) return input;
    if (input && Array.isArray(input.messages)) return input.messages;
    return [];
  }

  function computeBaseDigest(input) {
    try {
      var messages = normalizeMessages(input);
      var normalized = messages.map(function (m, idx) {
        if (!isObject(m)) return { turnIdx: idx + 1, value: m };
        return {
          turnIdx: m.turnIdx || m.index || idx + 1,
          role: m.role || m.author || '',
          messageId: m.messageId || m.id || '',
          turnId: m.turnId || '',
          text: m.text || m.content || m.markdown || '',
        };
      });
      return 'fnv1a:' + fnv1a(JSON.stringify(stableValue(normalized)));
    } catch (e) {
      recordError('computeBaseDigest', e);
      return 'fnv1a:' + fnv1a('');
    }
  }

  function createEmpty(input) {
    var opts = isObject(input) ? input : {};
    var snapshot = opts.snapshot || opts.snap || null;
    return {
      id: String(opts.id || opts.snapshotId || (snapshot && snapshot.snapshotId) || ''),
      schemaVersion: SCHEMA_VERSION,
      snapshotId: String(opts.snapshotId || (snapshot && snapshot.snapshotId) || ''),
      chatId: String(opts.chatId || (snapshot && (snapshot.chatId || snapshot.conversationId)) || ''),
      baseDigest: String(opts.baseDigest || computeBaseDigest(snapshot || opts.messages || [])),
      createdAt: String(opts.createdAt || new Date().toISOString()),
      updatedAt: String(opts.updatedAt || opts.createdAt || new Date().toISOString()),
      ops: [],
      undoStack: [],
      redoStack: [],
    };
  }

  function emit(name, detail) {
    try {
      if (H2O.events && typeof H2O.events.emit === 'function') {
        H2O.events.emit(name, detail || {});
      } else if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
        global.dispatchEvent(new global.CustomEvent(name, { detail: detail || {} }));
      }
    } catch (e) { recordError('emit:' + name, e); }
  }

  function resolveApplyArgs(a, b, c) {
    if (isObject(b) && (Array.isArray(b.messages) || b.snapshotId || b.chatId)) {
      return { root: a || null, snapshot: b || null, overlay: c || null };
    }
    return { root: null, snapshot: a || null, overlay: b || null, options: c || null };
  }

  function makeOutcome(extra) {
    return Object.assign({
      applied: false,
      driftDetected: false,
      mutated: false,
      opCount: 0,
      reason: 'no-overlay',
      phase: PHASE,
      version: VERSION,
    }, extra || {});
  }

  /* ── Pure helpers — appendOp, computeMessageState ─────────────────────
   * Both are pure: no DOM, no I/O, no global mutation. The orchestration
   * layer (RibbonBridge.applyOverlayOp in studio.js) calls appendOp to
   * produce an updated overlay record, then passes it to the store and
   * back to applyOverlay for rendering. */

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value == null ? null : value)); }
    catch (_) { return value == null ? null : {}; }
  }

  function makeOpId() {
    return 'op_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }

  function isMessageTarget(target) {
    if (!isObject(target)) return false;
    if (target.kind !== 'message') return false;
    return Number.isFinite(Number(target.turnIdx));
  }

  /* Append an op to an overlay, returning a new overlay record.
   * - Pushes the op id onto undoStack.
   * - Clears redoStack (new actions invalidate redo history).
   * - Updates updatedAt.
   * - Never throws — returns a clone of the original overlay on bad input. */
  function appendOp(overlay, opSpec) {
    if (!isObject(overlay)) return null;
    if (!isObject(opSpec)) return clone(overlay);
    var op = {
      id: String(opSpec.id || makeOpId()),
      type: String(opSpec.type || ''),
      target: clone(opSpec.target || null),
      payload: clone(opSpec.payload || null),
      appliedAt: Number(opSpec.appliedAt || Date.now()),
    };
    if (opSpec.inverse !== undefined) op.inverse = clone(opSpec.inverse);
    var ops = Array.isArray(overlay.ops) ? overlay.ops.slice() : [];
    ops.push(op);
    var prevUndo = Array.isArray(overlay.undoStack) ? overlay.undoStack.slice() : [];
    return Object.assign({}, overlay, {
      ops: ops,
      undoStack: prevUndo.concat([op.id]),
      redoStack: [],
      updatedAt: new Date().toISOString(),
    });
  }

  /* Reduce overlay ops in-order to compute the current visual state of a
   * specific message (identified by turnIdx). Last op of each type for a
   * given target wins. Returns a stable shape even when no ops apply. */
  function computeMessageState(overlay, turnIdx) {
    var state = {
      heading: null,        /* { level: 1|2|3 } | null */
      quote: false,
      code: false,
      callout: null,        /* { kind: 'info'|'note'|'warning'|'tip' } | null */
      cleanSpacing: false,
    };
    if (!isObject(overlay)) return state;
    var ops = Array.isArray(overlay.ops) ? overlay.ops : [];
    var idx = Number(turnIdx);
    if (!isFinite(idx)) return state;

    for (var i = 0; i < ops.length; i += 1) {
      var op = ops[i];
      if (!isObject(op) || !isMessageTarget(op.target)) continue;
      if (Number(op.target.turnIdx) !== idx) continue;
      var payload = isObject(op.payload) ? op.payload : {};
      switch (String(op.type)) {
        case 'heading': {
          var lvl = Number(payload.level);
          if (lvl === 1 || lvl === 2 || lvl === 3) state.heading = { level: lvl };
          else state.heading = null;
          break;
        }
        case 'quote':
          state.quote = !!payload.enabled;
          break;
        case 'code':
        case 'code-block':
          state.code = !!payload.enabled;
          break;
        case 'callout': {
          var kind = String(payload.kind || '');
          if (kind === 'info' || kind === 'note' || kind === 'warning' || kind === 'tip') {
            state.callout = { kind: kind };
          } else {
            state.callout = null;
          }
          break;
        }
        case 'clean-spacing':
          state.cleanSpacing = !!payload.enabled;
          break;
      }
    }
    return state;
  }

  /* Apply a computed state to a single turn element by toggling
   * `data-overlay-*` attributes. CSS rules in studio.css handle the
   * visual rendering. This NEVER touches the turn element's children
   * or text content. */
  function applyMessageStateToTurnEl(turnEl, state) {
    if (!turnEl || !isObject(state)) return false;
    var changed = false;
    try {
      if (state.heading && state.heading.level) {
        var hVal = 'h' + String(state.heading.level);
        if (turnEl.getAttribute('data-overlay-heading') !== hVal) {
          turnEl.setAttribute('data-overlay-heading', hVal);
          changed = true;
        }
      } else if (turnEl.hasAttribute('data-overlay-heading')) {
        turnEl.removeAttribute('data-overlay-heading');
        changed = true;
      }

      if (state.quote) {
        if (turnEl.getAttribute('data-overlay-quote') !== 'true') {
          turnEl.setAttribute('data-overlay-quote', 'true');
          changed = true;
        }
      } else if (turnEl.hasAttribute('data-overlay-quote')) {
        turnEl.removeAttribute('data-overlay-quote');
        changed = true;
      }

      if (state.code) {
        if (turnEl.getAttribute('data-overlay-code') !== 'true') {
          turnEl.setAttribute('data-overlay-code', 'true');
          changed = true;
        }
      } else if (turnEl.hasAttribute('data-overlay-code')) {
        turnEl.removeAttribute('data-overlay-code');
        changed = true;
      }

      if (state.callout && state.callout.kind) {
        if (turnEl.getAttribute('data-overlay-callout') !== state.callout.kind) {
          turnEl.setAttribute('data-overlay-callout', state.callout.kind);
          changed = true;
        }
      } else if (turnEl.hasAttribute('data-overlay-callout')) {
        turnEl.removeAttribute('data-overlay-callout');
        changed = true;
      }

      if (state.cleanSpacing) {
        if (turnEl.getAttribute('data-overlay-clean-spacing') !== 'true') {
          turnEl.setAttribute('data-overlay-clean-spacing', 'true');
          changed = true;
        }
      } else if (turnEl.hasAttribute('data-overlay-clean-spacing')) {
        turnEl.removeAttribute('data-overlay-clean-spacing');
        changed = true;
      }
    } catch (e) { recordError('applyMessageStateToTurnEl', e); }
    return changed;
  }

  function applyOverlay(a, b, c) {
    try {
      var args = resolveApplyArgs(a, b, c);
      var root = args.root || null;
      var snapshot = args.snapshot || {};
      var overlay = args.overlay || null;
      if (!overlay || !isObject(overlay)) {
        return makeOutcome({ reason: 'missing-overlay' });
      }

      var ops = Array.isArray(overlay.ops) ? overlay.ops.slice() : [];
      var currentDigest = computeBaseDigest(snapshot);
      var overlayDigest = String(overlay.baseDigest || '');
      if (overlayDigest && overlayDigest !== currentDigest) {
        var drift = makeOutcome({
          driftDetected: true,
          reason: 'base-digest-mismatch',
          opCount: ops.length,
          snapshotId: String(overlay.snapshotId || snapshot.snapshotId || ''),
          baseDigest: overlayDigest,
          currentDigest: currentDigest,
        });
        emit(OverlayEvents.driftDetected, drift);
        return drift;
      }

      if (!ops.length) {
        return makeOutcome({
          reason: 'empty-overlay',
          opCount: 0,
          snapshotId: String(overlay.snapshotId || snapshot.snapshotId || ''),
          baseDigest: overlayDigest || currentDigest,
        });
      }

      /* Phase 2b — render. Without a DOM root we can only report what
       * would have applied (useful for headless tests and the test-tab
       * smoke harness). */
      if (!root || typeof root.querySelectorAll !== 'function') {
        return makeOutcome({
          reason: 'no-dom-root',
          opCount: ops.length,
          snapshotId: String(overlay.snapshotId || snapshot.snapshotId || ''),
          baseDigest: overlayDigest || currentDigest,
        });
      }

      var turns = Array.prototype.slice.call(root.querySelectorAll('[data-turn]'));
      var turnsTouched = 0;
      var turnsWithState = 0;
      for (var i = 0; i < turns.length; i += 1) {
        var turnEl = turns[i];
        var turnIdx = i + 1; /* 1-based ordinal across all rendered turns */
        var state = computeMessageState(overlay, turnIdx);
        var changed = applyMessageStateToTurnEl(turnEl, state);
        if (changed) turnsTouched += 1;
        if (state.heading || state.quote || state.code || state.callout || state.cleanSpacing) {
          turnsWithState += 1;
        }
      }

      return makeOutcome({
        applied: true,
        /* `mutated` here means "DOM attributes were toggled" — never refers
         * to snap.messages, which the applier never touches. */
        mutated: turnsTouched > 0,
        reason: 'applied',
        opCount: ops.length,
        turnsTouched: turnsTouched,
        turnsWithState: turnsWithState,
        snapshotId: String(overlay.snapshotId || snapshot.snapshotId || ''),
        baseDigest: overlayDigest || currentDigest,
      });
    } catch (e) {
      recordError('applyOverlay', e);
      return makeOutcome({ reason: 'error', error: String((e && e.message) || e || '') });
    }
  }

  function selfCheck() {
    return {
      ok: errors.length === 0,
      version: VERSION,
      phase: PHASE,
      schemaVersion: SCHEMA_VERSION,
      /* Phase 2b applies decorative data-overlay-* attributes to turn
       * wrappers when ops are present. mutatesSnapshots remains false. */
      passive: false,
      mutatesSnapshots: false,
      mutatesDom: true,
      mutatesCapturedContent: false,
      hasKeys: !!H2O.Studio.OverlayKeys,
      errors: errors.slice(),
    };
  }

  var api = {
    __installed: true,
    version: VERSION,
    phase: PHASE,
    schemaVersion: SCHEMA_VERSION,
    computeBaseDigest: computeBaseDigest,
    createEmpty: createEmpty,
    appendOp: appendOp,
    computeMessageState: computeMessageState,
    applyOverlay: applyOverlay,
    selfCheck: selfCheck,
  };

  H2O.Studio.overlay = api;
  emit(OverlayEvents.ready, { version: VERSION, schemaVersion: SCHEMA_VERSION });
})(globalThis);
