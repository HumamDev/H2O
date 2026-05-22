/* H2O Studio — Edit Overlay Applier (Phase 2a)
 *
 * Passive foundation only. The applier validates overlay shape and checks
 * baseDigest drift, then returns an outcome object. It does not mutate
 * snapshots, messages, or reader DOM.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};

  if (H2O.Studio.overlay && H2O.Studio.overlay.__installed) {
    return;
  }

  var VERSION = '0.1.0-phase-2a';
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
      phase: '2a',
      version: VERSION,
    }, extra || {});
  }

  function applyOverlay(a, b, c) {
    try {
      var args = resolveApplyArgs(a, b, c);
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

      var outcome = makeOutcome({
        reason: ops.length ? 'phase-2a-no-op' : 'empty-overlay',
        opCount: ops.length,
        snapshotId: String(overlay.snapshotId || snapshot.snapshotId || ''),
        baseDigest: overlayDigest || currentDigest,
      });
      if (ops.length) emit(OverlayEvents.applySkipped, outcome);
      return outcome;
    } catch (e) {
      recordError('applyOverlay', e);
      return makeOutcome({ reason: 'error', error: String((e && e.message) || e || '') });
    }
  }

  function selfCheck() {
    return {
      ok: errors.length === 0,
      version: VERSION,
      schemaVersion: SCHEMA_VERSION,
      passive: true,
      mutatesSnapshots: false,
      mutatesDom: false,
      hasKeys: !!H2O.Studio.OverlayKeys,
      errors: errors.slice(),
    };
  }

  var api = {
    __installed: true,
    version: VERSION,
    schemaVersion: SCHEMA_VERSION,
    computeBaseDigest: computeBaseDigest,
    createEmpty: createEmpty,
    applyOverlay: applyOverlay,
    selfCheck: selfCheck,
  };

  H2O.Studio.overlay = api;
  emit(OverlayEvents.ready, { version: VERSION, schemaVersion: SCHEMA_VERSION });
})(globalThis);
