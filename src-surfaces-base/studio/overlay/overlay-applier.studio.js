/* H2O Studio — Edit Overlay Applier (Phase 2d)
 *
 * Message-level formatting application + structure pass + undo/redo
 * via the reducer-filter active-set model.
 *
 * The applier:
 *   - Validates overlay shape and checks baseDigest drift (refuses to
 *     render on drift; emits drift-detected).
 *   - Reduces the overlay's op log into per-message visual state
 *     (heading / quote / code / callout / clean-spacing) — filtered
 *     by the active op-id set computed from overlay.undoStack.
 *   - Reduces the overlay's op log into structure state (sections,
 *     dividers, TOC) — also filtered by the active set.
 *   - Applies state to turn elements in the reader DOM by setting
 *     `data-overlay-*` attributes; CSS rules in studio.css map those
 *     attributes to the soft dark visual style.
 *
 * Phase 2d — reducer-filter active-set undo/redo:
 *   - overlay.ops is append-only history; entries are never deleted.
 *   - overlay.undoStack is the ordered active op-id set; reducers iterate
 *     overlay.ops in original order and skip any op whose id is not in
 *     the active set. This preserves "last op of (type, target) wins".
 *   - overlay.redoStack holds op ids that were undone and can be re-promoted.
 *   - popUndo / popRedo are pure helpers that produce a new overlay with
 *     the appropriate stack mutated; ops is left untouched.
 *
 * Migration rule (legacy overlays — Phase 2a/2b/2c records):
 *   - If overlay.undoStack is missing OR is not an array, treat ALL ops
 *     as active. This preserves visual continuity for any persisted
 *     overlay created before Phase 2d started populating undoStack.
 *   - If overlay.undoStack exists as an array, respect it EXACTLY —
 *     even when empty. An empty array means "undo everything", and the
 *     reducers must render no ops in that case.
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
 *   popUndo(overlay) -> overlay' | null
 *   popRedo(overlay) -> overlay' | null
 *   getActiveOpIdSet(overlay) -> { [opId]: true } | null  (null = all-active legacy)
 *   computeMessageState(overlay, turnIdx) -> { heading, quote, code, callout, cleanSpacing }
 *   computeStructureState(overlay) -> { sections, dividers, toc }
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};

  if (H2O.Studio.overlay && H2O.Studio.overlay.__installed) {
    return;
  }

  var VERSION = '0.1.0-phase-2d';
  var PHASE = '2d';
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

  /* ── Phase 2d — undo/redo via reducer-filter active-set ──────────────
   *
   * Migration rule (critical):
   *   - undoStack missing OR not an array  → ALL ops active (legacy 2a/2b/2c).
   *   - undoStack is an array (even empty) → respect it EXACTLY.
   *     An empty array means "undo everything"; renderers MUST show no ops.
   *
   * Return shape:
   *   - null     → legacy all-active sentinel; callers treat every op as active.
   *   - object   → { [opId]: true } lookup; callers consult by id.
   *
   * The plain-object lookup (vs Set) keeps this helper synchronously safe
   * to call from per-turn hot paths without churn. */
  function getActiveOpIdSet(overlay) {
    if (!isObject(overlay)) return null;
    if (!Array.isArray(overlay.undoStack)) return null;
    var set = Object.create(null);
    for (var i = 0; i < overlay.undoStack.length; i += 1) {
      var id = overlay.undoStack[i];
      if (id == null) continue;
      set[String(id)] = true;
    }
    return set;
  }

  /* Returns true when `opId` is currently active given an active-set
   * computed by getActiveOpIdSet. A null active-set means "all active"
   * (legacy migration). Tolerates missing ids. */
  function isOpActive(active, opId) {
    if (active === null) return true;
    if (opId == null) return false;
    return !!active[String(opId)];
  }

  /* Pop the most-recently-active op id off undoStack and push it onto
   * redoStack. Returns a new overlay record (never mutates input). The
   * ops array is left untouched — undo is purely a stack manipulation
   * in the reducer-filter model.
   *
   * Returns null when:
   *   - overlay is not an object
   *   - undoStack is missing / not an array / empty
   * Callers treat null as "no-undo" and surface a status string. */
  function popUndo(overlay) {
    if (!isObject(overlay)) return null;
    if (!Array.isArray(overlay.undoStack) || overlay.undoStack.length === 0) return null;
    var undo = overlay.undoStack.slice();
    var redo = Array.isArray(overlay.redoStack) ? overlay.redoStack.slice() : [];
    var moved = undo.pop();
    redo.push(moved);
    var ops = Array.isArray(overlay.ops) ? overlay.ops.slice() : [];
    return Object.assign({}, overlay, {
      ops: ops,
      undoStack: undo,
      redoStack: redo,
      updatedAt: new Date().toISOString(),
    });
  }

  /* Mirror of popUndo: pop redoStack top, push back onto undoStack.
   * Returns null when redoStack is missing/empty. */
  function popRedo(overlay) {
    if (!isObject(overlay)) return null;
    if (!Array.isArray(overlay.redoStack) || overlay.redoStack.length === 0) return null;
    var undo = Array.isArray(overlay.undoStack) ? overlay.undoStack.slice() : [];
    var redo = overlay.redoStack.slice();
    var moved = redo.pop();
    undo.push(moved);
    var ops = Array.isArray(overlay.ops) ? overlay.ops.slice() : [];
    return Object.assign({}, overlay, {
      ops: ops,
      undoStack: undo,
      redoStack: redo,
      updatedAt: new Date().toISOString(),
    });
  }

  /* Helper — fresh default per-message state. Reused by the reducer
   * initial value AND the `clear-formatting` op reset (Phase 4-1). */
  function defaultMessageState() {
    return {
      heading: null,        /* { level: 1|2|3 } | null */
      quote: false,
      code: false,
      callout: null,        /* { kind: 'info'|'note'|'warning'|'tip' } | null */
      cleanSpacing: false,
      /* Phase 4-1 — message-level character formatting. Boolean toggles;
       * shape is the proven Phase 2b `quote` / `code` pattern. */
      bold: false,
      italic: false,
      underline: false,
      strikethrough: false,
      /* Phase 4-2 — message-level text color. Null = no color (theme
       * default); { kind: ... } when the user picked one of the 5
       * semantic palette names. `clear-formatting` resets to null for
       * free via defaultMessageState. */
      textColor: null,        /* { kind: 'red'|'green'|'blue'|'orange'|'gray' } | null */
      /* Phase 4-3 — paragraph controls.
       *   list   — null when no list mode is active; otherwise
       *            { kind: 'bullet' | 'numbered' }.
       *   align  — null = default (theme inherited); 'left'|'center'|'right'.
       *   indent — integer 0..3; 0 means no indent. The op payload uses
       *            an absolute level; ribbon Indent/Outdent compute the
       *            new level by reading current state and clamping. */
      list: null,
      align: null,
      indent: 0,
    };
  }

  /* Reduce overlay ops in-order to compute the current visual state of a
   * specific message (identified by turnIdx). Last op of each type for a
   * given target wins. Returns a stable shape even when no ops apply.
   *
   * Phase 4-1 — `clear-formatting` op: when the reducer sees an active
   * clear-formatting op targeting this turn, the state resets to the
   * default at that point in op order. Subsequent active ops on the
   * same turn apply normally on top of the cleared state. This mirrors
   * OneNote's Clear Formatting behaviour and composes with the Phase 2d
   * active-set undo/redo for free (undoing the clear-formatting op
   * causes the reducer to no longer see it, so prior decorations
   * re-apply). */
  function computeMessageState(overlay, turnIdx) {
    var state = defaultMessageState();
    if (!isObject(overlay)) return state;
    var ops = Array.isArray(overlay.ops) ? overlay.ops : [];
    var idx = Number(turnIdx);
    if (!isFinite(idx)) return state;

    /* Phase 2d — active-set filter. See getActiveOpIdSet doc for the
     * migration rule. We iterate overlay.ops in original order (preserving
     * the "last op of (type, target) wins" semantics) but skip any op
     * whose id is not in the active set. */
    var active = getActiveOpIdSet(overlay);

    for (var i = 0; i < ops.length; i += 1) {
      var op = ops[i];
      if (!isObject(op) || !isMessageTarget(op.target)) continue;
      if (Number(op.target.turnIdx) !== idx) continue;
      if (!isOpActive(active, op.id)) continue;
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
        /* Phase 4-1 — character formatting toggles. */
        case 'bold':
          state.bold = !!payload.enabled;
          break;
        case 'italic':
          state.italic = !!payload.enabled;
          break;
        case 'underline':
          state.underline = !!payload.enabled;
          break;
        case 'strikethrough':
          state.strikethrough = !!payload.enabled;
          break;
        /* Phase 4-2 — message-level text color. payload.kind is one of
         * the 5 semantic palette names or null to clear. Unknown
         * values are normalized to null (defensive). */
        case 'text-color': {
          var tcKind = String(payload.kind || '');
          if (tcKind === 'red' || tcKind === 'green' || tcKind === 'blue'
              || tcKind === 'orange' || tcKind === 'gray') {
            state.textColor = { kind: tcKind };
          } else {
            state.textColor = null;
          }
          break;
        }
        /* Phase 4-3 — paragraph controls. Unknown values normalize to
         * null / 0 (defensive); the reducer never throws on bad input. */
        case 'list': {
          var listKind = String(payload.kind || '');
          if (listKind === 'bullet' || listKind === 'numbered') {
            state.list = { kind: listKind };
          } else {
            state.list = null;
          }
          break;
        }
        case 'align': {
          var av = String(payload.value || '');
          if (av === 'left' || av === 'center' || av === 'right') {
            state.align = av;
          } else {
            state.align = null;
          }
          break;
        }
        case 'indent': {
          var lvl = Number(payload.level);
          if (!isFinite(lvl)) lvl = 0;
          if (lvl < 0) lvl = 0;
          if (lvl > 3) lvl = 3;
          state.indent = Math.floor(lvl);
          break;
        }
        /* Phase 4-1 — clear-formatting reset. Wipes ALL per-message
         * decoration fields (Phase 2b + Phase 4-1 + Phase 4-2 + Phase
         * 4-3) at this point in op order. Subsequent active ops apply
         * normally on top of the cleared state. */
        case 'clear-formatting':
          state = defaultMessageState();
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

      /* Phase 4-1 — character formatting (4 boolean attributes). Pattern
       * mirrors the existing quote/code/clean-spacing branches above. */
      if (state.bold) {
        if (turnEl.getAttribute('data-overlay-bold') !== 'true') {
          turnEl.setAttribute('data-overlay-bold', 'true');
          changed = true;
        }
      } else if (turnEl.hasAttribute('data-overlay-bold')) {
        turnEl.removeAttribute('data-overlay-bold');
        changed = true;
      }

      if (state.italic) {
        if (turnEl.getAttribute('data-overlay-italic') !== 'true') {
          turnEl.setAttribute('data-overlay-italic', 'true');
          changed = true;
        }
      } else if (turnEl.hasAttribute('data-overlay-italic')) {
        turnEl.removeAttribute('data-overlay-italic');
        changed = true;
      }

      if (state.underline) {
        if (turnEl.getAttribute('data-overlay-underline') !== 'true') {
          turnEl.setAttribute('data-overlay-underline', 'true');
          changed = true;
        }
      } else if (turnEl.hasAttribute('data-overlay-underline')) {
        turnEl.removeAttribute('data-overlay-underline');
        changed = true;
      }

      if (state.strikethrough) {
        if (turnEl.getAttribute('data-overlay-strikethrough') !== 'true') {
          turnEl.setAttribute('data-overlay-strikethrough', 'true');
          changed = true;
        }
      } else if (turnEl.hasAttribute('data-overlay-strikethrough')) {
        turnEl.removeAttribute('data-overlay-strikethrough');
        changed = true;
      }

      /* Phase 4-2 — text color attribute (mirrors data-overlay-callout
       * shape: value-bearing attribute that CSS rules select on). */
      if (state.textColor && state.textColor.kind) {
        if (turnEl.getAttribute('data-overlay-text-color') !== state.textColor.kind) {
          turnEl.setAttribute('data-overlay-text-color', state.textColor.kind);
          changed = true;
        }
      } else if (turnEl.hasAttribute('data-overlay-text-color')) {
        turnEl.removeAttribute('data-overlay-text-color');
        changed = true;
      }

      /* Phase 4-3 — paragraph attributes. CSS rules in studio.css select
       * on these to render list/align/indent on screen and in print. */
      if (state.list && state.list.kind) {
        if (turnEl.getAttribute('data-overlay-list') !== state.list.kind) {
          turnEl.setAttribute('data-overlay-list', state.list.kind);
          changed = true;
        }
      } else if (turnEl.hasAttribute('data-overlay-list')) {
        turnEl.removeAttribute('data-overlay-list');
        changed = true;
      }

      if (state.align) {
        if (turnEl.getAttribute('data-overlay-align') !== state.align) {
          turnEl.setAttribute('data-overlay-align', state.align);
          changed = true;
        }
      } else if (turnEl.hasAttribute('data-overlay-align')) {
        turnEl.removeAttribute('data-overlay-align');
        changed = true;
      }

      /* Indent level 0 = no attribute (default). Levels 1/2/3 set the
       * attribute to that integer string. */
      if (Number(state.indent) > 0) {
        var indStr = String(state.indent);
        if (turnEl.getAttribute('data-overlay-indent') !== indStr) {
          turnEl.setAttribute('data-overlay-indent', indStr);
          changed = true;
        }
      } else if (turnEl.hasAttribute('data-overlay-indent')) {
        turnEl.removeAttribute('data-overlay-indent');
        changed = true;
      }
    } catch (e) { recordError('applyMessageStateToTurnEl', e); }
    return changed;
  }

  /* ── Phase 2c-A — Structure pass (sections + page dividers + TOC slot) ──
   * Sections and dividers are render-time markers inserted as siblings
   * BETWEEN turn wrappers. Turns are never reparented or reordered, so
   * MiniMap and the existing per-turn applier remain unaffected. The
   * structure pass is idempotent: every call first removes any
   * previously-injected `[data-overlay-injected="true"]` elements, then
   * re-inserts based on the current reduced state.
   *
   * `toc` state is computed for forward compatibility with Phase 2c-B
   * (TOC rendering ships there); in 2c-A the field is read but the
   * applier does not render a TOC element.
   *
   * Op handling:
   *   - 'add-section'  / 'split-section'  → upsert section by sectionId
   *   - 'collapse-section' (reserved for 2c-B) → mutates the matching
   *                                              section's `collapsed` flag
   *   - 'page-divider'                    → upsert divider by dividerId
   *   - 'toc'                             → singleton state (last op wins)
   */
  function computeStructureState(overlay) {
    var state = { sections: [], dividers: [], toc: { position: null } };
    if (!isObject(overlay)) return state;
    var ops = Array.isArray(overlay.ops) ? overlay.ops : [];

    var sectionMap = Object.create(null);   /* sectionId -> { sectionId, title, afterTurnIdx, collapsed } */
    var dividerMap = Object.create(null);   /* dividerId -> { dividerId, afterTurnIdx } */
    var tocState = { position: null };

    /* Phase 2d — active-set filter. Same semantics as computeMessageState:
     * iterate ops in original order, skip ids that are not in the
     * active set (undoStack). null active = legacy all-active. */
    var active = getActiveOpIdSet(overlay);

    for (var i = 0; i < ops.length; i += 1) {
      var op = ops[i];
      if (!isObject(op)) continue;
      if (!isOpActive(active, op.id)) continue;
      var payload = isObject(op.payload) ? op.payload : {};
      switch (String(op.type)) {
        case 'add-section':
        case 'split-section': {
          var sid = String(payload.sectionId || '');
          if (!sid) break;
          var ati = Number(payload.afterTurnIdx);
          if (!isFinite(ati) || ati < 0) break;
          var existing = sectionMap[sid];
          sectionMap[sid] = {
            sectionId: sid,
            title: String(payload.title || (existing && existing.title) || 'Section'),
            afterTurnIdx: ati,
            collapsed: !!(existing && existing.collapsed),
          };
          break;
        }
        case 'collapse-section': {
          /* Reserved for Phase 2c-B; the reducer accepts these ops now so
           * they round-trip through the overlay without being dropped. */
          var sid2 = String(payload.sectionId || '');
          if (!sid2) break;
          var sec2 = sectionMap[sid2];
          if (sec2) sec2.collapsed = !!payload.collapsed;
          break;
        }
        case 'page-divider': {
          var did = String(payload.dividerId || '');
          if (!did) break;
          var atid = Number(payload.afterTurnIdx);
          if (!isFinite(atid) || atid < 0) break;
          dividerMap[did] = { dividerId: did, afterTurnIdx: atid };
          break;
        }
        case 'toc': {
          tocState.position = (payload.position === 'top') ? 'top' : null;
          break;
        }
      }
    }

    state.sections = Object.keys(sectionMap).map(function (k) { return sectionMap[k]; })
      .sort(function (a, b) { return a.afterTurnIdx - b.afterTurnIdx; });
    state.dividers = Object.keys(dividerMap).map(function (k) { return dividerMap[k]; })
      .sort(function (a, b) { return a.afterTurnIdx - b.afterTurnIdx; });
    state.toc = tocState;

    return state;
  }

  /* Pure helper — find the latest section whose afterTurnIdx is strictly
   * less than turnIdx. Returns the section object or null when the turn
   * sits before the first section header. */
  function findSectionContaining(structureState, turnIdx) {
    if (!isObject(structureState)) return null;
    var sections = Array.isArray(structureState.sections) ? structureState.sections : [];
    var idx = Number(turnIdx);
    if (!isFinite(idx) || idx <= 0) return null;
    var match = null;
    for (var i = 0; i < sections.length; i += 1) {
      var sec = sections[i];
      if (Number(sec.afterTurnIdx) < idx) match = sec;
      else break;
    }
    return match;
  }

  /* Build a section header DOM element. The element is decorative only:
   * it carries no `data-turn-*` / `data-message-*` attributes, so MiniMap
   * and other turn-keyed consumers ignore it by construction. */
  function makeSectionHeaderEl(sec) {
    var header = document.createElement('header');
    header.className = 'wbOverlaySectionHeader';
    header.setAttribute('data-overlay-injected', 'true');
    header.setAttribute('data-section-id', String(sec.sectionId || ''));
    header.setAttribute('data-overlay-section-collapsed', sec.collapsed ? 'true' : 'false');
    /* id used by Phase 2c-B's TOC for anchor scrolling. */
    if (sec.sectionId) header.id = 'wbOverlaySection-' + String(sec.sectionId);
    var titleSpan = document.createElement('span');
    titleSpan.className = 'wbOverlaySectionTitle';
    titleSpan.textContent = String(sec.title || 'Section');
    header.appendChild(titleSpan);
    var metaSpan = document.createElement('span');
    metaSpan.className = 'wbOverlaySectionMeta';
    metaSpan.setAttribute('aria-hidden', 'true');
    /* Empty in 2c-A; 2c-B populates with collapse indicator. */
    metaSpan.textContent = '';
    header.appendChild(metaSpan);
    return header;
  }

  function makeDividerEl(div) {
    var hr = document.createElement('hr');
    hr.className = 'wbOverlayDivider';
    hr.setAttribute('data-overlay-injected', 'true');
    if (div.dividerId) hr.setAttribute('data-divider-id', String(div.dividerId));
    return hr;
  }

  /* Phase 2c-B — TOC nav element. Built from current sections at render
   * time (content is never persisted as text in the overlay). Click on
   * a link scrolls to the matching `<header id="wbOverlaySection-...">`.
   * Uses <button> rather than <a href="#..."> to avoid hash-routing
   * conflicts with the Studio router. Returns null when sections list
   * is empty so the applier can skip insertion. */
  function makeTocEl(sections) {
    if (!Array.isArray(sections) || sections.length === 0) return null;
    var nav = document.createElement('nav');
    nav.className = 'wbOverlayToc';
    nav.setAttribute('data-overlay-injected', 'true');
    nav.setAttribute('aria-label', 'Table of contents');

    var heading = document.createElement('div');
    heading.className = 'wbOverlayTocHeading';
    heading.textContent = 'Contents';
    nav.appendChild(heading);

    var list = document.createElement('ol');
    list.className = 'wbOverlayTocList';

    /* prefers-reduced-motion check is per-click rather than per-build so
     * the user can flip the OS setting without re-rendering Studio. */
    function tocLinkClick(ev) {
      try {
        if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
        var sid = this.getAttribute('data-overlay-toc-link');
        if (!sid) return;
        var target = document.getElementById('wbOverlaySection-' + sid);
        if (!target || typeof target.scrollIntoView !== 'function') return;
        var reduced = false;
        try {
          reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        } catch (_) { reduced = false; }
        target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      } catch (_) { /* swallow — TOC clicks must never throw */ }
    }

    for (var i = 0; i < sections.length; i += 1) {
      var sec = sections[i];
      if (!sec) continue;
      var li = document.createElement('li');
      li.className = 'wbOverlayTocItem';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wbOverlayTocLink';
      btn.setAttribute('data-overlay-toc-link', String(sec.sectionId || ''));
      btn.textContent = String(sec.title || 'Section');
      btn.addEventListener('click', tocLinkClick);
      li.appendChild(btn);
      list.appendChild(li);
    }

    nav.appendChild(list);
    return nav;
  }

  /* Insert `el` BEFORE the turn at 1-based position `targetTurnIdx`.
   * Returns true if inserted. If `targetTurnIdx` exceeds the turn count,
   * appends after the last turn (safe degradation when ops point past EOF
   * after a re-capture). */
  function insertBeforeTurnIdx(container, turns, targetTurnIdx, el) {
    if (!container || !el) return false;
    var idx = Number(targetTurnIdx) - 1;
    if (!isFinite(idx)) return false;
    if (idx >= 0 && idx < turns.length) {
      try { container.insertBefore(el, turns[idx]); return true; }
      catch (_) { return false; }
    }
    /* Beyond EOF — append after the last turn (next sibling of last turn,
     * to keep it inside the same parent container). */
    try {
      var last = turns[turns.length - 1];
      if (last && last.parentNode === container) {
        container.appendChild(el);
        return true;
      }
    } catch (_) { /* swallow */ }
    return false;
  }

  /* Apply structure state to the reader DOM. Idempotent: always cleans
   * existing `[data-overlay-injected="true"]` elements AND
   * `.is-in-collapsed-section` classes before re-applying.
   * Returns counts for the outcome record. */
  function applyStructureToReader(root, structureState) {
    var counts = { removed: 0, headers: 0, dividers: 0, collapsedTurns: 0, tocInserted: false };
    if (!root || typeof root.querySelectorAll !== 'function') return counts;

    try {
      /* Step 1a — remove previously-injected structure elements. */
      var injected = root.querySelectorAll('[data-overlay-injected="true"]');
      for (var i = 0; i < injected.length; i += 1) {
        try {
          var node = injected[i];
          if (node && node.parentNode) {
            node.parentNode.removeChild(node);
            counts.removed += 1;
          }
        } catch (_) { /* swallow per-node */ }
      }
      /* Step 1b (Phase 2c-B) — clear any stale collapsed-turn classes.
       * Without this, expanding a section would not visually un-hide its
       * turns because the previous-render class would linger. */
      var stale = root.querySelectorAll('[data-turn].is-in-collapsed-section');
      for (var c = 0; c < stale.length; c += 1) {
        try { stale[c].classList.remove('is-in-collapsed-section'); }
        catch (_) { /* swallow per-node */ }
      }
    } catch (e) { recordError('applyStructure:cleanup', e); }

    if (!isObject(structureState)) return counts;

    try {
      var turns = Array.prototype.slice.call(root.querySelectorAll('[data-turn]'));
      if (!turns.length) return counts;
      var container = turns[0].parentNode;
      if (!container) return counts;

      var sections = Array.isArray(structureState.sections) ? structureState.sections : [];
      for (var s = 0; s < sections.length; s += 1) {
        var sec = sections[s];
        if (!sec) continue;
        var ati = Number(sec.afterTurnIdx);
        if (!isFinite(ati) || ati < 0) continue;
        var header = makeSectionHeaderEl(sec);
        if (insertBeforeTurnIdx(container, turns, ati + 1, header)) counts.headers += 1;
      }

      var dividers = Array.isArray(structureState.dividers) ? structureState.dividers : [];
      for (var d = 0; d < dividers.length; d += 1) {
        var divv = dividers[d];
        if (!divv) continue;
        var dati = Number(divv.afterTurnIdx);
        if (!isFinite(dati) || dati < 0) continue;
        var hr = makeDividerEl(divv);
        if (insertBeforeTurnIdx(container, turns, dati + 1, hr)) counts.dividers += 1;
      }

      /* Phase 2c-B — collapse + meta pass.
       * Walk turns in render order; for each turn, look up its containing
       * section via findSectionContaining. Accumulate per-section turn
       * counts and tag collapsed-section turns with the hide class.
       * Then populate each section header's meta slot with the
       * indicator ("▾"/"▸") + count. */
      var sectionCounts = Object.create(null);   /* sectionId -> count */
      for (var t = 0; t < turns.length; t += 1) {
        var turnIdx = t + 1; /* 1-based, matches per-turn pass convention */
        var containing = findSectionContaining(structureState, turnIdx);
        if (!containing) continue;
        var sidKey = String(containing.sectionId || '');
        sectionCounts[sidKey] = (sectionCounts[sidKey] || 0) + 1;
        if (containing.collapsed) {
          try {
            turns[t].classList.add('is-in-collapsed-section');
            counts.collapsedTurns += 1;
          } catch (_) { /* swallow per-node */ }
        }
      }

      /* Populate header meta with collapse indicator + turn count. */
      for (var sm = 0; sm < sections.length; sm += 1) {
        var smSec = sections[sm];
        if (!smSec || !smSec.sectionId) continue;
        var headerEl = null;
        try {
          headerEl = root.querySelector('header.wbOverlaySectionHeader[data-section-id="' + String(smSec.sectionId).replace(/"/g, '\\"') + '"]');
        } catch (_) { headerEl = null; }
        if (!headerEl) continue;
        var metaEl = headerEl.querySelector('.wbOverlaySectionMeta');
        if (!metaEl) continue;
        var countN = sectionCounts[String(smSec.sectionId)] || 0;
        var prefix = smSec.collapsed ? '▸' : '▾'; /* ▸ collapsed, ▾ expanded */
        metaEl.textContent = prefix + '  ' + countN + ' turn' + (countN === 1 ? '' : 's');
      }

      /* Phase 2c-B — TOC. Insert as the FIRST child of the turns container
       * so it sits above all turns and any prior section header. The
       * cleanup step at the top of this function removes any previous
       * TOC, so this is idempotent. */
      if (structureState.toc && structureState.toc.position === 'top') {
        var tocEl = makeTocEl(sections);
        if (tocEl) {
          try {
            container.insertBefore(tocEl, container.firstChild || null);
            counts.tocInserted = true;
          } catch (_) { /* swallow */ }
        }
      }
    } catch (e) { recordError('applyStructure:insert', e); }

    return counts;
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

      /* Per-turn pass (Phase 2b — heading/quote/code/callout/clean-spacing). */
      var turns = Array.prototype.slice.call(root.querySelectorAll('[data-turn]'));
      var turnsTouched = 0;
      var turnsWithState = 0;
      for (var i = 0; i < turns.length; i += 1) {
        var turnEl = turns[i];
        var turnIdx = i + 1; /* 1-based ordinal across all rendered turns */
        var state = computeMessageState(overlay, turnIdx);
        var changed = applyMessageStateToTurnEl(turnEl, state);
        if (changed) turnsTouched += 1;
        if (state.heading || state.quote || state.code || state.callout || state.cleanSpacing
            || state.bold || state.italic || state.underline || state.strikethrough
            || state.textColor || state.list || state.align || Number(state.indent) > 0) {
          turnsWithState += 1;
        }
      }

      /* Structure pass (Phase 2c-A — sections + page dividers). Runs
       * after the per-turn pass because section/divider markers are
       * inserted as siblings between turns, and the per-turn pass only
       * touches `[data-turn]` wrappers (zero interaction). */
      var structureState = computeStructureState(overlay);
      var structureCounts = applyStructureToReader(root, structureState);

      return makeOutcome({
        applied: true,
        /* `mutated` here means "DOM attributes/elements were toggled" — never
         * refers to snap.messages, which the applier never touches. */
        mutated: turnsTouched > 0
              || structureCounts.headers > 0
              || structureCounts.dividers > 0
              || structureCounts.removed > 0
              || structureCounts.collapsedTurns > 0
              || structureCounts.tocInserted === true,
        reason: 'applied',
        opCount: ops.length,
        turnsTouched: turnsTouched,
        turnsWithState: turnsWithState,
        structureHeaders: structureCounts.headers,
        structureDividers: structureCounts.dividers,
        structureRemoved: structureCounts.removed,
        structureCollapsedTurns: structureCounts.collapsedTurns,
        structureTocInserted: structureCounts.tocInserted,
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
       * wrappers. Phase 2c-A additionally inserts decorative section
       * header + page divider markers as siblings between turns. None
       * of this touches captured content or snap.messages. */
      passive: false,
      mutatesSnapshots: false,
      mutatesDom: true,
      mutatesCapturedContent: false,
      hasKeys: !!H2O.Studio.OverlayKeys,
      /* Phase 2d — undo/redo support flags. Both reducers respect the
       * active-set computed from overlay.undoStack; popUndo/popRedo are
       * the pure helpers the bridge uses to manipulate stacks. The
       * legacy migration sentinel (undoStack missing → all-active) is
       * applied transparently by getActiveOpIdSet. */
      supportsUndoRedo: true,
      undoRedoModel: 'reducer-filter-active-set',
      legacyMigration: 'undoStack-missing-means-all-active',
      hasUndoRedoHelpers: typeof popUndo === 'function' && typeof popRedo === 'function' && typeof getActiveOpIdSet === 'function',
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
    /* Phase 2c-A — pure structure-state helpers exposed for ribbon
     * action handlers (split-section enable rule) and for the
     * RibbonBridge.getStructureState accessor in studio.js. */
    computeStructureState: computeStructureState,
    findSectionContaining: findSectionContaining,
    /* Phase 2d — undo/redo helpers (pure; no DOM, no I/O).
     * RibbonBridge.undo / .redo in studio.js compose these with the
     * editOverlay store + applyOverlay re-render. The active-set
     * accessor is also exposed so callers can short-circuit when
     * they need to know whether a specific op id is currently visible. */
    popUndo: popUndo,
    popRedo: popRedo,
    getActiveOpIdSet: getActiveOpIdSet,
    applyOverlay: applyOverlay,
    selfCheck: selfCheck,
  };

  H2O.Studio.overlay = api;
  emit(OverlayEvents.ready, { version: VERSION, schemaVersion: SCHEMA_VERSION });
})(globalThis);
