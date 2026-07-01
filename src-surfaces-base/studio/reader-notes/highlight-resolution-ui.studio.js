/* H2O Studio - Reader & Notes - MVP-A2a.5: highlight resolution UI probe
 *
 * Operator-only, read-only diagnostic probe. It locates the live saved-reader
 * root (#viewReader > .cgFrame), derives the item id from its dataset.chatId,
 * and invokes the read-only highlight-resolution consumer, returning data-only
 * rows for inspection. It renders nothing, adds no marks or overlay layers,
 * mutates no DOM, and writes no storage. Visible highlight display is deferred
 * to a later slice and must respect STUDIO_OVERLAY_CONTRACT.md (never mutate
 * captured turn DOM).
 *
 * Guarding: the flag 'studio.readerNotes.highlightResolutionUi.enabled'
 * (default off) AND an operator opt-in key in localStorage AND public-release
 * being off. This module only READS the opt-in key; the operator sets it
 * manually in a dev console. This module never persists anything.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.readerNotes = H2O.Studio.readerNotes || {};

  if (H2O.Studio.readerNotes.highlightResolutionUi && H2O.Studio.readerNotes.highlightResolutionUi.__installed) {
    return;
  }

  var VERSION = 1;
  var SCHEMA_VERSION = 1;
  var FLAG_KEY = 'studio.readerNotes.highlightResolutionUi.enabled';
  var OPT_IN_KEY = 'h2o.readerNotes.highlightResolutionUi.operatorOptIn';
  var errors = [];
  var ERR_MAX = 20;
  var lastDiagnostics = null;

  function recordError(op, e) {
    try {
      errors.push({ t: Date.now(), op: String(op), e: String((e && e.message) || (e && e.stack) || e || '') });
      if (errors.length > ERR_MAX) errors.splice(0, errors.length - ERR_MAX);
    } catch (_) { /* swallow */ }
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function cloneValue(value) {
    if (value == null) return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return null;
    }
  }

  function getFlags() {
    var f = H2O && H2O.flags;
    return (f && typeof f.get === 'function') ? f : null;
  }

  function getConsumer() {
    var api = H2O && H2O.Studio && H2O.Studio.readerNotes && H2O.Studio.readerNotes.highlightResolutionConsumer;
    return (api && typeof api.resolveForItem === 'function') ? api : null;
  }

  function isPublicRelease() {
    try {
      var s = H2O && H2O.Studio;
      if (s && s.release && s.release.publicRelease === true) return true;
      if (s && s.config && s.config.publicRelease === true) return true;
      return false;
    } catch (e) {
      recordError('isPublicRelease', e);
      return true; /* fail closed: refuse when release state is unreadable */
    }
  }

  function readOptIn() {
    try {
      var ls = global.localStorage;
      if (!ls || typeof ls.getItem !== 'function') return false;
      var v = ls.getItem(OPT_IN_KEY);
      return v === 'true' || v === '1';
    } catch (e) {
      recordError('readOptIn', e);
      return false;
    }
  }

  function isEnabled() {
    try {
      if (isPublicRelease()) return false;
      var flags = getFlags();
      if (!flags) return false;
      if (flags.get(FLAG_KEY, false) !== true) return false;
      return readOptIn() === true;
    } catch (e) {
      recordError('isEnabled', e);
      return false;
    }
  }

  function makeResult(status, itemId, rootFound, consumerResult, reason) {
    var out = {
      schemaVersion: SCHEMA_VERSION,
      status: status,
      itemId: itemId != null ? String(itemId) : null,
      rootFound: rootFound === true,
      resolvedCount: 0,
      unresolvedCount: 0,
      result: null,
      diagnostics: {
        reason: reason || status,
        enabled: false,
        publicRelease: false,
        consumerAvailable: false,
        errors: errors.slice(),
      },
    };
    try { out.diagnostics.enabled = isEnabled(); } catch (_) { out.diagnostics.enabled = false; }
    try { out.diagnostics.publicRelease = isPublicRelease(); } catch (_) { out.diagnostics.publicRelease = true; }
    try { out.diagnostics.consumerAvailable = !!getConsumer(); } catch (_) { out.diagnostics.consumerAvailable = false; }
    if (isPlainObject(consumerResult)) {
      out.result = cloneValue(consumerResult);
      out.resolvedCount = Array.isArray(consumerResult.resolved) ? consumerResult.resolved.length : 0;
      out.unresolvedCount = Array.isArray(consumerResult.unresolved) ? consumerResult.unresolved.length : 0;
    }
    lastDiagnostics = cloneValue(out.diagnostics);
    return out;
  }

  function probe(options) {
    try {
      if (isPublicRelease()) return makeResult('public-release-disabled', null, false, null, 'public-release-disabled');
      if (!isEnabled()) return makeResult('disabled', null, false, null, 'disabled');

      var doc = global.document;
      if (!doc || typeof doc.getElementById !== 'function') return makeResult('no-document', null, false, null, 'no-document');

      var host = doc.getElementById('viewReader');
      if (!host) return makeResult('no-reader-view', null, false, null, 'no-reader-view');

      var frame = (typeof host.querySelector === 'function') ? host.querySelector('.cgFrame') : null;
      if (!frame) return makeResult('no-reader-frame', null, false, null, 'no-reader-frame');

      var chatId = frame.dataset ? frame.dataset.chatId : null;
      if (!chatId) return makeResult('missing-chat-id', null, true, null, 'missing-chat-id');
      var itemId = String(chatId);

      var consumer = getConsumer();
      if (!consumer) return makeResult('consumer-unavailable', itemId, true, null, 'consumer-unavailable');

      var consumerResult;
      try {
        consumerResult = consumer.resolveForItem(itemId, frame, options || {});
      } catch (e) {
        recordError('resolveForItem', e);
        return makeResult('probe-error', itemId, true, null, 'resolveForItem-threw');
      }
      if (!isPlainObject(consumerResult)) return makeResult('probe-error', itemId, true, null, 'consumer-result-invalid');

      return makeResult('ok', itemId, true, consumerResult, 'ok');
    } catch (e) {
      recordError('probe', e);
      return makeResult('probe-error', null, false, null, 'probe-error');
    }
  }

  function selfCheck() {
    return {
      ok: errors.length === 0,
      version: VERSION,
      readonly: true,
      schemaVersion: SCHEMA_VERSION,
      flagKey: FLAG_KEY,
      optInKey: OPT_IN_KEY,
      enabled: isEnabled(),
      publicRelease: isPublicRelease(),
      optIn: readOptIn(),
      consumerAvailable: !!getConsumer(),
      errors: errors.slice(),
    };
  }

  function diagnose() {
    var base = selfCheck();
    return {
      ok: base.ok,
      version: VERSION,
      readonly: true,
      flagKey: FLAG_KEY,
      optInKey: OPT_IN_KEY,
      enabled: base.enabled,
      publicRelease: base.publicRelease,
      optIn: base.optIn,
      consumerAvailable: base.consumerAvailable,
      supported: ['probe'],
      rendersUi: false,
      mutatesDom: false,
      insertsMarks: false,
      returnsLiveNodes: false,
      xpath: 'deferred',
      lastDiagnostics: cloneValue(lastDiagnostics),
      errors: base.errors,
    };
  }

  var api = Object.freeze({
    __installed: true,
    version: VERSION,
    readonly: true,
    flagKey: FLAG_KEY,
    optInKey: OPT_IN_KEY,
    isEnabled: isEnabled,
    probe: probe,
    selfCheck: selfCheck,
    diagnose: diagnose,
  });

  H2O.Studio.readerNotes.highlightResolutionUi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
