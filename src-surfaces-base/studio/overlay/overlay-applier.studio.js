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
      /* Phase 8d-1 — message-level font family. Null = theme default;
       * { token: ... } when the user picked one of the 4 curated typeface
       * tokens. Mirrors the textColor shape. `clear-formatting` resets to
       * null for free via defaultMessageState. */
      fontFamily: null,       /* { token: 'sans'|'serif'|'mono'|'humanist' } | null */
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
      /* Phase 4-4 — OneNote-style visual tags. Six independent booleans
       * so multiple tags can stack on one message. NOT Library metadata
       * tags — these are visual overlay annotations only and are never
       * persisted to H2O.Studio.store.tags. clear-formatting resets all
       * six to false via defaultMessageState. Canonical order (used for
       * deterministic DOM attr + export rendering) follows the keys
       * declared here exactly. */
      visualTags: {
        todo:       false,
        important:  false,
        question:   false,
        definition: false,
        warning:    false,
        idea:       false,
      },
      /* Phase 7b — full message body replacement. Null when no active
       * text-replace op targets this message; otherwise { body: string }.
       * Composes with message-level decorations (bold/quote/heading/etc.)
       * — those wrap the body returned by resolveMessageText. Composes
       * with inline ranges + highlights by SUPPRESSING them (computeInline
       * State returns empty intervals when textReplace is set) because
       * those anchor to the pre-edit character offsets. clear-formatting
       * does NOT clear textReplace — text replacement is content, not
       * decoration; an explicit reset (separate op) is required to drop
       * an edit. */
      textReplace: null,
    };
  }

  /* Phase 4-4 — canonical kind order + glyph map. The applier uses
   * VISUAL_TAG_ORDER to build the space-separated DOM attribute in a
   * deterministic order regardless of the order ops were applied. The
   * glyph map is what `data-overlay-visual-tag-glyphs` exposes to CSS
   * (single ::before rendering, no DOM injection). */
  var VISUAL_TAG_ORDER = ['todo', 'important', 'question', 'definition', 'warning', 'idea'];
  var VISUAL_TAG_GLYPHS = {
    todo:       '☐',  /* ☐  BALLOT BOX */
    important:  '❗',  /* ❗ HEAVY EXCLAMATION MARK */
    question:   '❓',  /* ❓ BLACK QUESTION MARK ORNAMENT */
    definition: '📖',  /* 📖 OPEN BOOK */
    warning:    '⚠',  /* ⚠  WARNING SIGN */
    idea:       '💡',  /* 💡 ELECTRIC LIGHT BULB */
  };
  function isVisualTagKind(k) {
    return k === 'todo' || k === 'important' || k === 'question'
        || k === 'definition' || k === 'warning' || k === 'idea';
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
        /* Phase 8d-1 — message-level font family. Last op wins; unknown /
         * empty / null token clears to theme default (defensive; never
         * throws). Mirrors the text-color case above. */
        case 'font-family': {
          var ffTok = String(payload.token || '');
          if (ffTok === 'sans' || ffTok === 'serif'
              || ffTok === 'mono' || ffTok === 'humanist') {
            state.fontFamily = { token: ffTok };
          } else {
            state.fontFamily = null;
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
        /* Phase 4-4 — visual-tag op. Per-kind boolean toggle. Unknown
         * kinds are a defensive no-op (the switch-case below skips
         * state mutation entirely). Last active op of (type, target,
         * kind) wins — same precedent as Phase 4-1 character toggles. */
        case 'visual-tag': {
          var vtKind = String(payload.kind || '');
          if (isVisualTagKind(vtKind)) {
            if (!state.visualTags || typeof state.visualTags !== 'object') {
              state.visualTags = defaultMessageState().visualTags;
            }
            state.visualTags[vtKind] = !!payload.enabled;
          }
          break;
        }
        /* Phase 4-1 — clear-formatting reset. Wipes ALL per-message
         * decoration fields (Phase 2b + Phase 4-1 + Phase 4-2 + Phase
         * 4-3 + Phase 4-4) at this point in op order. Subsequent active
         * ops apply normally on top of the cleared state. NOTE: this
         * deliberately does NOT clear Phase 7b textReplace — text
         * replacement is content, not decoration. To drop an edit the
         * caller submits a new text-replace op with the original body
         * (or undoes the existing op via the active-set machinery). */
        case 'clear-formatting': {
          var keepTextReplace = state.textReplace;
          state = defaultMessageState();
          state.textReplace = keepTextReplace;
          break;
        }
        /* Phase 7b — full message body replacement. Last active op of
         * (type, target) wins; setting payload.text to a string stores
         * the replacement, null/missing clears (legacy compatibility —
         * lets an explicit reset op clear without removing the op id
         * from the active set). Pure data; no snapshot mutation. */
        case 'text-replace': {
          if (typeof payload.text === 'string') {
            state.textReplace = { body: payload.text };
          } else if (payload.text === null) {
            state.textReplace = null;
          }
          break;
        }
      }
    }
    return state;
  }

  /* Phase 7b — resolveMessageText: composes canonical snapshot text with
   * any active text-replace op for a given turnIdx. Pure; never throws;
   * never reads or writes the legacy localStorage override (callers
   * supply a fallback string if they want one). Returns the string to
   * display / serialize / export for that message body.
   *
   *   snap     — { messages: [{ text }, ...] } or any snapshot-shaped object
   *   overlay  — overlay state (the value applyOverlay reads from)
   *   turnIdx  — 1-based turn index matching computeMessageState
   *
   * Resolution order:
   *   1. If overlay has an active text-replace op for (turnIdx), return
   *      that op's body string.
   *   2. Else return snap.messages[turnIdx - 1].text (or '' if missing).
   * Callers that need legacy-override fallback wrap the result themselves
   * with getEditOverride(...) — this helper is intentionally
   * overlay-pure so it stays a single source of truth across reader,
   * serializer, and DOCX writer. */
  function resolveMessageText(snap, overlay, turnIdx) {
    var idx = Number(turnIdx);
    var canonical = '';
    try {
      if (isObject(snap) && Array.isArray(snap.messages)) {
        var row = snap.messages[idx - 1];
        if (row && typeof row.text === 'string') canonical = row.text;
      }
    } catch (_) { /* swallow — canonical falls back to '' */ }
    if (!isObject(overlay) || !isFinite(idx)) return canonical;
    try {
      var st = computeMessageState(overlay, idx);
      if (st && st.textReplace && typeof st.textReplace.body === 'string') {
        return st.textReplace.body;
      }
    } catch (_) { /* swallow — fall back to canonical */ }
    return canonical;
  }

  /* ── Phase 5b-1 / 5c-1 — inline character formatting interval reducer ──
   *
   * Inline Bold/Italic/Underline/Strikethrough apply to a sub-RANGE of one
   * message, anchored by Phase 5a's selection anchor. Each `inline-format`
   * op carries:
   *   target:  { kind: 'inline', turnIdx, messageId, anchor: { textPos: {start,end}, ... } }
   *   payload: { style: 'bold'|'italic'|'underline'|'strikethrough', enabled: boolean }
   *          | { style: 'clear-inline' }   (Phase 5c-1 range-scoped clear)
   *
   * The reducer reduces all active inline-format ops for a turn into four
   * merged, sorted, non-overlapping integer-interval sets (bold / italic /
   * underline / strikethrough) in the message's flattened-text coordinate
   * space. These are PURE integer operations — no DOM — so they are fully
   * unit-testable. The studio.js render pass turns intervals into live
   * ranges + spans.
   *
   * enabled:true  → union the anchor's [start,end) interval into the set.
   * enabled:false → subtract [start,end) from the set (may split a span).
   *
   * Phase 5c-2 adds a fifth channel — text color — as a VALUE/paint model
   * (not a boolean interval set): `{ style:'text-color', kind }` where
   * kind ∈ {red,green,blue,orange,gray} paints (cut-then-paint, last-wins)
   * and kind===null cuts color over the range. State is an array of
   * `{ start, end, kind }` segments, sorted + non-overlapping.
   *
   * Phase 5c-1 `clear-inline` style → subtract the anchor's [start,end)
   * interval from ALL four boolean sets AND cut color segments over the
   * range (5c-2). Range-scoped; leaves intervals/segments outside the
   * range untouched. It does NOT touch message-level decorations — those
   * are a separate channel.
   *
   * clear-formatting (Phase 4-1 message reset, target kind:'message') ALSO
   * clears ALL inline interval sets + color segments for the turn at its
   * point in op order — consistent with "wipe all per-message decorations". */

  /* Merge a list of [start,end) intervals: sort by start, coalesce
   * overlapping or contiguous runs. Returns a new sorted array. */
  function mergeIntervals(list) {
    if (!Array.isArray(list) || list.length === 0) return [];
    var arr = [];
    for (var i = 0; i < list.length; i += 1) {
      var iv = list[i];
      if (!Array.isArray(iv)) continue;
      var s = Number(iv[0]);
      var e = Number(iv[1]);
      if (!isFinite(s) || !isFinite(e) || e <= s) continue;
      arr.push([s, e]);
    }
    if (!arr.length) return [];
    arr.sort(function (a, b) { return a[0] - b[0]; });
    var out = [[arr[0][0], arr[0][1]]];
    for (var j = 1; j < arr.length; j += 1) {
      var last = out[out.length - 1];
      if (arr[j][0] > last[1]) out.push([arr[j][0], arr[j][1]]);
      else if (arr[j][1] > last[1]) last[1] = arr[j][1];
    }
    return out;
  }

  /* Union a single [s,e) interval into an existing merged set. */
  function unionInterval(list, s, e) {
    var base = Array.isArray(list) ? list.slice() : [];
    base.push([Number(s), Number(e)]);
    return mergeIntervals(base);
  }

  /* Subtract [s,e) from a merged set, splitting intervals as needed.
   * Returns a new merged (already non-overlapping) array. */
  function subtractInterval(list, s, e) {
    var ss = Number(s);
    var ee = Number(e);
    var out = [];
    if (!Array.isArray(list)) return out;
    for (var i = 0; i < list.length; i += 1) {
      var iv = list[i];
      if (!Array.isArray(iv)) continue;
      var a = Number(iv[0]);
      var b = Number(iv[1]);
      if (!isFinite(a) || !isFinite(b) || b <= a) continue;
      if (!isFinite(ss) || !isFinite(ee) || ee <= ss) { out.push([a, b]); continue; }
      if (b <= ss || a >= ee) { out.push([a, b]); continue; } /* no overlap */
      if (a < ss) out.push([a, ss]);
      if (b > ee) out.push([ee, b]);
    }
    return out;
  }

  /* Returns true when the merged set fully covers [s,e). Used by the
   * ribbon to decide toggle-off vs toggle-on for a selected range. */
  function intervalsCover(list, s, e) {
    var ss = Number(s);
    var ee = Number(e);
    if (!Array.isArray(list) || !isFinite(ss) || !isFinite(ee) || ee <= ss) return false;
    for (var i = 0; i < list.length; i += 1) {
      var iv = list[i];
      if (!Array.isArray(iv)) continue;
      if (Number(iv[0]) <= ss && Number(iv[1]) >= ee) return true;
    }
    return false;
  }

  /* ── Phase 5c-2 — inline text-color segment helpers ───────────────────
   *
   * Unlike the boolean styles (which are binary union/subtract interval
   * sets), text color is a VALUE: each segment carries a `kind`, and
   * overlapping paints resolve last-wins. Segments are kept sorted by
   * `start` and non-overlapping. These are PURE — no DOM — so they are
   * fully unit-testable. */

  /* Cut [s,e) out of every color segment, splitting as needed. Segments
   * fully outside [s,e) pass through unchanged. Returns a new array. */
  function cutColorSegments(segments, s, e) {
    var ss = Number(s);
    var ee = Number(e);
    var out = [];
    if (!Array.isArray(segments)) return out;
    for (var i = 0; i < segments.length; i += 1) {
      var seg = segments[i];
      if (!isObject(seg)) continue;
      var a = Number(seg.start);
      var b = Number(seg.end);
      var kind = seg.kind;
      if (!isFinite(a) || !isFinite(b) || b <= a) continue;
      if (!isFinite(ss) || !isFinite(ee) || ee <= ss) { out.push({ start: a, end: b, kind: kind }); continue; }
      if (b <= ss || a >= ee) { out.push({ start: a, end: b, kind: kind }); continue; } /* no overlap */
      if (a < ss) out.push({ start: a, end: ss, kind: kind });
      if (b > ee) out.push({ start: ee, end: b, kind: kind });
    }
    return out;
  }

  /* Paint [s,e) with `kind` (last-wins): cut the region first, then add
   * the new segment, then sort + coalesce adjacent same-kind segments.
   * Returns a new sorted, non-overlapping array. */
  function paintColor(segments, s, e, kind) {
    var ss = Number(s);
    var ee = Number(e);
    if (!isFinite(ss) || !isFinite(ee) || ee <= ss) return Array.isArray(segments) ? segments.slice() : [];
    var base = cutColorSegments(segments, ss, ee);
    base.push({ start: ss, end: ee, kind: kind });
    base.sort(function (x, y) { return x.start - y.start; });
    /* Coalesce adjacent/overlapping same-kind segments (defensive; cut
     * guarantees non-overlap, so this only merges touching same-kind). */
    var out = [];
    for (var i = 0; i < base.length; i += 1) {
      var seg = base[i];
      var last = out.length ? out[out.length - 1] : null;
      if (last && last.kind === seg.kind && seg.start <= last.end) {
        if (seg.end > last.end) last.end = seg.end;
      } else {
        out.push({ start: seg.start, end: seg.end, kind: seg.kind });
      }
    }
    return out;
  }

  /* Returns the single kind covering [s,e) when the range is uniformly one
   * color, else null. Color analogue of intervalsCover; used by the ribbon
   * for optional active-swatch display. */
  function colorAt(segments, s, e) {
    var ss = Number(s);
    var ee = Number(e);
    if (!Array.isArray(segments) || !isFinite(ss) || !isFinite(ee) || ee <= ss) return null;
    for (var i = 0; i < segments.length; i += 1) {
      var seg = segments[i];
      if (!isObject(seg)) continue;
      if (Number(seg.start) <= ss && Number(seg.end) >= ee) return seg.kind == null ? null : String(seg.kind);
    }
    return null;
  }

  function isInlineColorKind(k) {
    return k === 'red' || k === 'green' || k === 'blue' || k === 'orange' || k === 'gray';
  }

  /* ── Phase 5d-1 — pure inline-run segmenter (export foundation) ────────
   *
   * buildInlineRuns(bodyText, messageState, inlineState, opts) ->
   *   { ok, runs: [{ text, bold, italic, underline, strikethrough, textColor }], reason? }
   *
   * Folds message-level character formatting (treated as full-range base
   * layer) + inline interval/segment state into a single ordered list of
   * non-overlapping runs over bodyText. Each run carries a flat style
   * tuple, so any consumer (Markdown 5d-1, DOCX 5d-2) emits well-formed
   * output even for overlapping/crossing inline ranges.
   *
   * Coordinate space: inlineState offsets are in the message's flattened
   * rendered-text space. The caller passes opts.offsetAdjust (typically
   * the count of leading whitespace trimmed from the raw text) so offsets
   * rebase onto bodyText. If ANY rebased endpoint falls outside
   * [0, bodyText.length], the segmenter degrades safely (ok:false,
   * reason:'inline-out-of-range') and the caller falls back to its
   * message-level path — never emitting corrupted markup.
   *
   * Pure: no DOM, no I/O, no mutation of inputs. Never throws. */
  function buildInlineRuns(bodyText, messageState, inlineState, opts) {
    try {
      var text = String(bodyText == null ? '' : bodyText);
      var len = text.length;
      var ms = isObject(messageState) ? messageState : {};
      var is = isObject(inlineState) ? inlineState : {};
      var options = isObject(opts) ? opts : {};
      var adjust = Number(options.offsetAdjust);
      if (!isFinite(adjust)) adjust = 0;

      function rebaseIntervals(list) {
        var out = [];
        if (!Array.isArray(list)) return out;
        for (var i = 0; i < list.length; i += 1) {
          var iv = list[i];
          if (!Array.isArray(iv)) continue;
          var s = Number(iv[0]) - adjust;
          var e = Number(iv[1]) - adjust;
          if (!isFinite(s) || !isFinite(e)) return null;
          if (s < 0 || e > len || e <= s) return null;
          out.push([s, e]);
        }
        return out;
      }
      function rebaseSegments(list) {
        var out = [];
        if (!Array.isArray(list)) return out;
        for (var i = 0; i < list.length; i += 1) {
          var seg = list[i];
          if (!isObject(seg)) continue;
          var s = Number(seg.start) - adjust;
          var e = Number(seg.end) - adjust;
          if (!isFinite(s) || !isFinite(e)) return null;
          if (s < 0 || e > len || e <= s) return null;
          out.push({ start: s, end: e, kind: seg.kind });
        }
        return out;
      }

      var bold = rebaseIntervals(is.bold);
      var italic = rebaseIntervals(is.italic);
      var underline = rebaseIntervals(is.underline);
      var strike = rebaseIntervals(is.strikethrough);
      var color = rebaseSegments(is.textColor);
      if (bold === null || italic === null || underline === null || strike === null || color === null) {
        return { ok: false, reason: 'inline-out-of-range' };
      }

      /* message-level full-range base layer */
      var msBold = !!ms.bold;
      var msItalic = !!ms.italic;
      var msUnderline = !!ms.underline;
      var msStrike = !!ms.strikethrough;
      var msColor = (ms.textColor && ms.textColor.kind) ? String(ms.textColor.kind) : null;

      /* boundary set */
      var bset = Object.create(null);
      bset[0] = true; bset[len] = true;
      function addIntervalBounds(list) { for (var i = 0; i < list.length; i += 1) { bset[list[i][0]] = true; bset[list[i][1]] = true; } }
      addIntervalBounds(bold); addIntervalBounds(italic); addIntervalBounds(underline); addIntervalBounds(strike);
      for (var ci = 0; ci < color.length; ci += 1) { bset[color[ci].start] = true; bset[color[ci].end] = true; }
      var bounds = Object.keys(bset).map(Number).filter(function (n) { return n >= 0 && n <= len; }).sort(function (a, b) { return a - b; });

      function covered(list, a, b) {
        for (var i = 0; i < list.length; i += 1) { if (list[i][0] <= a && list[i][1] >= b) return true; }
        return false;
      }
      function colorForRange(a, b) {
        var k = msColor; /* base layer */
        for (var i = 0; i < color.length; i += 1) {
          if (color[i].start <= a && color[i].end >= b) k = (color[i].kind == null ? null : String(color[i].kind));
        }
        return k;
      }

      var runs = [];
      for (var i2 = 0; i2 < bounds.length - 1; i2 += 1) {
        var a = bounds[i2];
        var b = bounds[i2 + 1];
        if (b <= a) continue;
        var slice = text.slice(a, b);
        if (slice === '') continue;
        runs.push({
          text: slice,
          bold: msBold || covered(bold, a, b),
          italic: msItalic || covered(italic, a, b),
          underline: msUnderline || covered(underline, a, b),
          strikethrough: msStrike || covered(strike, a, b),
          textColor: colorForRange(a, b),
        });
      }
      return { ok: true, runs: runs, inlineApplied: true };
    } catch (e) {
      recordError('buildInlineRuns', e);
      return { ok: false, reason: 'segmenter-error' };
    }
  }

  function isInlineTarget(target) {
    if (!isObject(target)) return false;
    if (target.kind !== 'inline') return false;
    return Number.isFinite(Number(target.turnIdx));
  }

  /* Reduce overlay ops into the inline interval sets for one turn.
   * Returns { bold: [[s,e],...], italic: [[s,e],...] }. Active-set aware
   * (Phase 2d). Never throws.
   *
   * Phase 7b — If an active text-replace op targets this turn, inline
   * intervals are suppressed (returned as empty). Inline ranges anchor
   * to the pre-edit character offsets, which cannot be safely rebased
   * onto a freely-replaced body. Highlights are likewise suppressed at
   * the reader render layer (studio.js) for messages with active
   * text-replace; this function is responsible for B/I/U/S + color
   * intervals only. */
  function computeInlineState(overlay, turnIdx) {
    var stateBold = [];
    var stateItalic = [];
    var stateUnderline = [];
    var stateStrikethrough = [];
    var stateColor = [];
    var emptyResult = { bold: [], italic: [], underline: [], strikethrough: [], textColor: [] };
    if (!isObject(overlay)) return emptyResult;
    var ops = Array.isArray(overlay.ops) ? overlay.ops : [];
    var idx = Number(turnIdx);
    if (!isFinite(idx)) return emptyResult;
    /* Phase 7b — short-circuit when this message has an active
     * text-replace; inline interval ranges would point at the wrong
     * characters in the replaced body. The reducer below ALSO
     * defensively never sees inline ops on a replaced turn because the
     * dispatcher submits the text-replace AFTER any prior inline ops,
     * but this guard is the canonical answer. */
    try {
      var ms = computeMessageState(overlay, idx);
      if (ms && ms.textReplace && typeof ms.textReplace.body === 'string') {
        return emptyResult;
      }
    } catch (_) { /* swallow — falls through to normal inline reduction */ }
    var active = getActiveOpIdSet(overlay);

    for (var i = 0; i < ops.length; i += 1) {
      var op = ops[i];
      if (!isObject(op)) continue;
      if (!isOpActive(active, op.id)) continue;
      var type = String(op.type);

      /* clear-formatting (message-level) wipes ALL inline intervals. */
      if (type === 'clear-formatting') {
        if (isMessageTarget(op.target) && Number(op.target.turnIdx) === idx) {
          stateBold = [];
          stateItalic = [];
          stateUnderline = [];
          stateStrikethrough = [];
          stateColor = [];
        }
        continue;
      }

      if (type !== 'inline-format') continue;
      if (!isInlineTarget(op.target)) continue;
      if (Number(op.target.turnIdx) !== idx) continue;

      var anchor = isObject(op.target.anchor) ? op.target.anchor : {};
      var pos = isObject(anchor.textPos) ? anchor.textPos : null;
      if (!pos) continue;
      var s = Number(pos.start);
      var e = Number(pos.end);
      if (!isFinite(s) || !isFinite(e) || e <= s) continue;

      var payload = isObject(op.payload) ? op.payload : {};
      var style = String(payload.style || '');
      var enabled = !!payload.enabled;
      if (style === 'bold') {
        stateBold = enabled ? unionInterval(stateBold, s, e) : subtractInterval(stateBold, s, e);
      } else if (style === 'italic') {
        stateItalic = enabled ? unionInterval(stateItalic, s, e) : subtractInterval(stateItalic, s, e);
      } else if (style === 'underline') {
        stateUnderline = enabled ? unionInterval(stateUnderline, s, e) : subtractInterval(stateUnderline, s, e);
      } else if (style === 'strikethrough') {
        stateStrikethrough = enabled ? unionInterval(stateStrikethrough, s, e) : subtractInterval(stateStrikethrough, s, e);
      } else if (style === 'text-color') {
        /* Phase 5c-2 — value/paint channel. kind paints (last-wins via
         * cut-then-paint); null cuts (clear color over range). Unknown
         * kinds are treated as a cut (defensive). */
        var ckind = payload.kind;
        if (isInlineColorKind(ckind)) {
          stateColor = paintColor(stateColor, s, e, ckind);
        } else {
          stateColor = cutColorSegments(stateColor, s, e);
        }
      } else if (style === 'clear-inline') {
        /* Phase 5c-1 / 5c-2 — range-scoped clear: subtract [s,e) from all
         * four boolean sets AND cut color segments over [s,e). Intervals/
         * segments outside [s,e) are preserved (split). */
        stateBold = subtractInterval(stateBold, s, e);
        stateItalic = subtractInterval(stateItalic, s, e);
        stateUnderline = subtractInterval(stateUnderline, s, e);
        stateStrikethrough = subtractInterval(stateStrikethrough, s, e);
        stateColor = cutColorSegments(stateColor, s, e);
      }
    }
    return { bold: stateBold, italic: stateItalic, underline: stateUnderline, strikethrough: stateStrikethrough, textColor: stateColor };
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

      /* Phase 8d-1 — font-family attribute (same value-bearing shape as
       * data-overlay-text-color; studio.css rules select on it). */
      if (state.fontFamily && state.fontFamily.token) {
        if (turnEl.getAttribute('data-overlay-font-family') !== state.fontFamily.token) {
          turnEl.setAttribute('data-overlay-font-family', state.fontFamily.token);
          changed = true;
        }
      } else if (turnEl.hasAttribute('data-overlay-font-family')) {
        turnEl.removeAttribute('data-overlay-font-family');
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

      /* Phase 4-4 — visual-tag DOM dispatch. Walk VISUAL_TAG_ORDER so the
       * attribute is built deterministically regardless of op insertion
       * order. Both attributes are set/removed atomically:
       *   data-overlay-visual-tags        — space-joined active kinds
       *   data-overlay-visual-tag-glyphs  — pre-composed glyph string
       *                                     for CSS `::before` rendering
       * Pre-composing the glyph string in the applier sidesteps the
       * "only one ::before per element" CSS limitation without DOM
       * injection. */
      var vtState = (state.visualTags && typeof state.visualTags === 'object') ? state.visualTags : null;
      if (vtState) {
        var activeKinds = [];
        var activeGlyphs = [];
        for (var vi = 0; vi < VISUAL_TAG_ORDER.length; vi += 1) {
          var vtk = VISUAL_TAG_ORDER[vi];
          if (vtState[vtk]) {
            activeKinds.push(vtk);
            activeGlyphs.push(VISUAL_TAG_GLYPHS[vtk] || '');
          }
        }
        if (activeKinds.length > 0) {
          var kindsAttr = activeKinds.join(' ');
          var glyphsAttr = activeGlyphs.join(' ');
          if (turnEl.getAttribute('data-overlay-visual-tags') !== kindsAttr) {
            turnEl.setAttribute('data-overlay-visual-tags', kindsAttr);
            changed = true;
          }
          if (turnEl.getAttribute('data-overlay-visual-tag-glyphs') !== glyphsAttr) {
            turnEl.setAttribute('data-overlay-visual-tag-glyphs', glyphsAttr);
            changed = true;
          }
        } else {
          if (turnEl.hasAttribute('data-overlay-visual-tags')) {
            turnEl.removeAttribute('data-overlay-visual-tags');
            changed = true;
          }
          if (turnEl.hasAttribute('data-overlay-visual-tag-glyphs')) {
            turnEl.removeAttribute('data-overlay-visual-tag-glyphs');
            changed = true;
          }
        }
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
        var anyVisualTag = !!(state.visualTags && (state.visualTags.todo || state.visualTags.important
          || state.visualTags.question || state.visualTags.definition
          || state.visualTags.warning || state.visualTags.idea));
        if (state.heading || state.quote || state.code || state.callout || state.cleanSpacing
            || state.bold || state.italic || state.underline || state.strikethrough
            || state.textColor || state.list || state.align || Number(state.indent) > 0
            || anyVisualTag) {
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
    /* Phase 4-4 — canonical visual-tag order + glyph map, exposed so the
     * Markdown serializer + DOCX writer can render the same deterministic
     * ordering as the DOM applier. Pure data; immutable in spirit (we do
     * not freeze for V8 perf, but consumers MUST treat as read-only). */
    visualTagOrder: VISUAL_TAG_ORDER,
    visualTagGlyphs: VISUAL_TAG_GLYPHS,
    /* Phase 5b-1 — inline interval reducer + pure interval helpers. The
     * studio.js render pass consumes computeInlineState to wrap ranges;
     * the ribbon consumes intervalsCover to decide toggle-off vs -on. */
    computeInlineState: computeInlineState,
    mergeIntervals: mergeIntervals,
    unionInterval: unionInterval,
    subtractInterval: subtractInterval,
    intervalsCover: intervalsCover,
    /* Phase 5c-2 — inline text-color segment helpers. */
    cutColorSegments: cutColorSegments,
    paintColor: paintColor,
    colorAt: colorAt,
    /* Phase 5d-1 — pure inline-run segmenter shared by export paths. */
    buildInlineRuns: buildInlineRuns,
    /* Phase 7b — full message body replacement helper. Pure: reads the
     * canonical snapshot body and overrides with any active
     * text-replace op for the requested turnIdx. Consumed by the reader
     * render in studio.js; will also be consumed by the Markdown
     * serializer / DOCX writer / print path in Phase 7d. */
    resolveMessageText: resolveMessageText,
  };

  H2O.Studio.overlay = api;
  emit(OverlayEvents.ready, { version: VERSION, schemaVersion: SCHEMA_VERSION });
})(globalThis);
