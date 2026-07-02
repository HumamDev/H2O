/* H2O Studio - Reader & Notes - NV1: annotation report
 *
 * Non-visual, read-only report builder over existing Reader & Notes APIs.
 * It composes annotation data and highlight resolution rows into serializable
 * per-item report data. It renders nothing and persists nothing.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.readerNotes = H2O.Studio.readerNotes || {};

  if (H2O.Studio.readerNotes.annotationReport && H2O.Studio.readerNotes.annotationReport.__installed) {
    return;
  }

  var VERSION = 1;
  var SCHEMA_VERSION = 1;
  var FLAG_KEY = 'studio.readerNotes.annotationReport.enabled';
  var OPT_IN_KEY = 'h2o.readerNotes.annotationReport.operatorOptIn';
  var DEFAULT_LIMIT = 500;
  var ERR_MAX = 20;
  var errors = [];
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

  function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
  }

  function getFlags() {
    var f = H2O && H2O.flags;
    return (f && typeof f.get === 'function') ? f : null;
  }

  function isPublicRelease() {
    try {
      var s = H2O && H2O.Studio;
      if (s && s.release && s.release.publicRelease === true) return true;
      if (s && s.config && s.config.publicRelease === true) return true;
      return false;
    } catch (e) {
      recordError('isPublicRelease', e);
      return true;
    }
  }

  function readOptIn() {
    try {
      var ls = global.localStorage;
      if (!ls || typeof ls.getItem !== 'function') return false;
      var value = ls.getItem(OPT_IN_KEY);
      return value === 'true' || value === '1';
    } catch (e) {
      recordError('readOptIn', e);
      return false;
    }
  }

  function gateReason() {
    try {
      if (isPublicRelease()) return 'public-release-disabled';
      var flags = getFlags();
      if (!flags) return 'disabled';
      if (flags.get(FLAG_KEY, false) !== true) return 'disabled';
      if (readOptIn() !== true) return 'operator-opt-in-missing';
      return null;
    } catch (e) {
      recordError('gateReason', e);
      return 'disabled';
    }
  }

  function isEnabled() {
    return gateReason() === null;
  }

  function getAnnotationsApi() {
    var api = H2O && H2O.Studio && H2O.Studio.readerNotes && H2O.Studio.readerNotes.annotations;
    return (api && typeof api.listForItem === 'function') ? api : null;
  }

  function getResolutionConsumer() {
    var api = H2O && H2O.Studio && H2O.Studio.readerNotes && H2O.Studio.readerNotes.highlightResolutionConsumer;
    return (api && typeof api.resolveForItem === 'function') ? api : null;
  }

  function apiEnabled(api) {
    try {
      return api && typeof api.isEnabled === 'function' ? api.isEnabled() === true : null;
    } catch (e) {
      recordError('upstream.isEnabled', e);
      return false;
    }
  }

  function sanitize(value) {
    if (value == null) return value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.map(sanitize);
    if (!isPlainObject(value)) return null;
    var out = {};
    Object.keys(value).forEach(function (key) {
      if (key === 'range' || key === 'annotation' || key === 'msgEl' || key === 'node' || key === 'root') return;
      var next = sanitize(value[key]);
      if (next !== undefined) out[key] = next;
    });
    return out;
  }

  function cloneList(list) {
    if (!Array.isArray(list)) return [];
    return list.map(sanitize).filter(function (value) { return value != null; });
  }

  function safeLimit(options) {
    var raw = options && options.limit;
    if (!Number.isFinite(raw)) return DEFAULT_LIMIT;
    var value = Math.floor(raw);
    if (value < 0) return 0;
    return value;
  }

  function emptyReport(itemId, rootFound, reason, details) {
    var diagnostics = {
      reason: reason,
      enabled: isEnabled(),
      publicRelease: isPublicRelease(),
      optIn: readOptIn(),
      annotationsAvailable: false,
      resolutionConsumerAvailable: false,
      annotationsEnabled: null,
      resolutionConsumerEnabled: null,
      skippedReasons: [],
      errors: errors.slice(),
    };
    if (details && details.diagnostics) {
      Object.keys(details.diagnostics).forEach(function (key) { diagnostics[key] = details.diagnostics[key]; });
    }
    lastDiagnostics = sanitize(diagnostics);
    return {
      schemaVersion: SCHEMA_VERSION,
      itemId: isNonEmptyString(itemId) ? itemId : null,
      rootFound: rootFound === true,
      highlights: { resolved: [], orphaned: [], skipped: [] },
      notes: [],
      bookmarks: [],
      counts: {
        highlightsConsidered: 0,
        highlightsResolved: 0,
        highlightsOrphaned: 0,
        highlightsSkipped: 0,
        notes: 0,
        bookmarks: 0,
      },
      diagnostics: diagnostics,
      truncated: false,
    };
  }

  function locateReaderFrame(itemId, options) {
    var root = options && options.root;
    if (root && typeof root.querySelectorAll === 'function') {
      return { frame: root, rootFound: true, itemId: isNonEmptyString(itemId) ? itemId : ((root.dataset && root.dataset.chatId) || null) };
    }
    try {
      var doc = global.document;
      if (!doc || typeof doc.getElementById !== 'function') return { frame: null, rootFound: false, itemId: itemId || null };
      var host = doc.getElementById('viewReader');
      if (!host || typeof host.querySelector !== 'function') return { frame: null, rootFound: false, itemId: itemId || null };
      var frame = host.querySelector('.cgFrame');
      if (!frame) return { frame: null, rootFound: false, itemId: itemId || null };
      var chatId = frame.dataset ? frame.dataset.chatId : null;
      return { frame: frame, rootFound: true, itemId: isNonEmptyString(itemId) ? itemId : (chatId ? String(chatId) : null) };
    } catch (e) {
      recordError('locateReaderFrame', e);
      return { frame: null, rootFound: false, itemId: itemId || null };
    }
  }

  function listKind(api, itemId, kind) {
    try {
      var out = api.listForItem(itemId, { kind: kind });
      return Array.isArray(out) ? out : [];
    } catch (e) {
      recordError('annotations.listForItem.' + kind, e);
      throw e;
    }
  }

  function pushLimited(target, row, state) {
    if (state.total >= state.limit) {
      state.truncated = true;
      return false;
    }
    target.push(sanitize(row));
    state.total += 1;
    return true;
  }

  function skippedHighlight(annotation, reason) {
    var source = isPlainObject(annotation && annotation.source) ? sanitize(annotation.source) : {};
    return {
      annotationId: annotation && annotation.id != null ? String(annotation.id) : null,
      nativeId: source && source.nativeId != null ? String(source.nativeId) : null,
      answerId: source && source.answerId != null ? String(source.answerId) : null,
      source: source || {},
      status: 'skipped',
      span: null,
      selectorUsed: null,
      confidence: 0,
      reason: reason,
      text: '',
      diagnostics: {},
    };
  }

  function delegatedOptions(options) {
    if (!isPlainObject(options)) return {};
    var out = {};
    Object.keys(options).forEach(function (key) {
      if (key === 'root') return;
      var value = sanitize(options[key]);
      if (value !== undefined) out[key] = value;
    });
    return out;
  }

  function countsFor(report) {
    report.counts.highlightsResolved = report.highlights.resolved.length;
    report.counts.highlightsOrphaned = report.highlights.orphaned.length;
    report.counts.highlightsSkipped = report.highlights.skipped.length;
    report.counts.highlightsConsidered = report.counts.highlightsResolved + report.counts.highlightsOrphaned + report.counts.highlightsSkipped;
    report.counts.notes = report.notes.length;
    report.counts.bookmarks = report.bookmarks.length;
  }

  function buildReport(itemId, options) {
    var reason = gateReason();
    if (reason) return emptyReport(itemId, false, reason);

    var resolvedRoot = locateReaderFrame(itemId, options || {});
    var effectiveItemId = isNonEmptyString(itemId) ? itemId : resolvedRoot.itemId;
    if (!isNonEmptyString(effectiveItemId)) return emptyReport(effectiveItemId, resolvedRoot.rootFound, 'missing-item');

    var annotationsApi = getAnnotationsApi();
    if (!annotationsApi) return emptyReport(effectiveItemId, resolvedRoot.rootFound, 'deps-unavailable');

    var consumerApi = getResolutionConsumer();
    var report = emptyReport(effectiveItemId, resolvedRoot.rootFound, 'ok');
    report.diagnostics.annotationsAvailable = true;
    report.diagnostics.resolutionConsumerAvailable = !!consumerApi;
    report.diagnostics.annotationsEnabled = apiEnabled(annotationsApi);
    report.diagnostics.resolutionConsumerEnabled = apiEnabled(consumerApi);

    var limitState = { limit: safeLimit(options || {}), total: 0, truncated: false };
    var highlights;
    var notes;
    var bookmarks;
    try {
      highlights = listKind(annotationsApi, effectiveItemId, 'highlight');
      notes = listKind(annotationsApi, effectiveItemId, 'note');
      bookmarks = listKind(annotationsApi, effectiveItemId, 'bookmark');
    } catch (e) {
      return emptyReport(effectiveItemId, resolvedRoot.rootFound, 'deps-unavailable', { diagnostics: { error: String((e && e.message) || e || '') } });
    }

    if (resolvedRoot.frame && consumerApi) {
      try {
        var resolved = consumerApi.resolveForItem(effectiveItemId, resolvedRoot.frame, delegatedOptions(options || {}));
        if (isPlainObject(resolved)) {
          cloneList(resolved.resolved).forEach(function (row) { pushLimited(report.highlights.resolved, row, limitState); });
          cloneList(resolved.unresolved).forEach(function (row) { pushLimited(report.highlights.orphaned, row, limitState); });
          report.diagnostics.resolutionDiagnostics = sanitize(resolved.diagnostics || {});
        } else {
          report.diagnostics.skippedReasons.push('consumer-result-invalid');
          cloneList(highlights).forEach(function (annotation) { pushLimited(report.highlights.skipped, skippedHighlight(annotation, 'consumer-result-invalid'), limitState); });
        }
      } catch (e) {
        recordError('highlightResolutionConsumer.resolveForItem', e);
        report.diagnostics.skippedReasons.push('consumer-error');
        cloneList(highlights).forEach(function (annotation) { pushLimited(report.highlights.skipped, skippedHighlight(annotation, 'consumer-error'), limitState); });
      }
    } else {
      var skipReason = resolvedRoot.frame ? 'consumer-unavailable' : 'skipped-no-reader-root';
      report.diagnostics.skippedReasons.push(skipReason);
      cloneList(highlights).forEach(function (annotation) { pushLimited(report.highlights.skipped, skippedHighlight(annotation, skipReason), limitState); });
    }

    cloneList(notes).forEach(function (note) { pushLimited(report.notes, note, limitState); });
    cloneList(bookmarks).forEach(function (bookmark) { pushLimited(report.bookmarks, bookmark, limitState); });

    report.truncated = limitState.truncated;
    report.diagnostics.limit = limitState.limit;
    report.diagnostics.truncated = report.truncated;
    countsFor(report);
    lastDiagnostics = sanitize(report.diagnostics);
    return sanitize(report);
  }

  function selfCheck() {
    var annotationsApi = getAnnotationsApi();
    var consumerApi = getResolutionConsumer();
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
      annotationsAvailable: !!annotationsApi,
      resolutionConsumerAvailable: !!consumerApi,
      annotationsEnabled: apiEnabled(annotationsApi),
      resolutionConsumerEnabled: apiEnabled(consumerApi),
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
      annotationsAvailable: base.annotationsAvailable,
      resolutionConsumerAvailable: base.resolutionConsumerAvailable,
      supported: ['buildReport'],
      reportKinds: ['highlight', 'note', 'bookmark'],
      rendersUi: false,
      mutatesDom: false,
      writesStorage: false,
      xpath: 'deferred',
      lastDiagnostics: sanitize(lastDiagnostics),
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
    buildReport: buildReport,
    selfCheck: selfCheck,
    diagnose: diagnose,
  });

  H2O.Studio.readerNotes.annotationReport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
