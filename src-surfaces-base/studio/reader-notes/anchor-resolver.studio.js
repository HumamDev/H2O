/* H2O Studio - Reader & Notes - MVP-A2a.1: anchor resolver core
 *
 * Pure, read-only highlight anchor matching over plain text. This module is
 * deliberately not wired into Studio runtime in A2a.1; validators load it
 * directly. It accepts persisted highlight anchor descriptors and a plain text
 * string, then returns offset spans only.
 *
 * Scope:
 *   - Highlight anchors only.
 *   - textQuote exact matching with prefix/suffix filtering and approx
 *     tie-break.
 *   - textPos fallback, validated by normalized equality with textQuote.exact.
 *   - XPath is accepted in the input shape but deferred.
 *
 * Out of scope:
 *   - XPath resolution, fuzzy search, persisted hint layers, display
 *     dispatch, local note files, storage, mark wrapping, and A1
 *     annotation changes.
 *
 * Feature flag: studio.readerNotes.anchorResolver.enabled, default off.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.readerNotes = H2O.Studio.readerNotes || {};

  if (H2O.Studio.readerNotes.anchorResolver && H2O.Studio.readerNotes.anchorResolver.__installed) {
    return;
  }

  var VERSION = 1;
  var SCHEMA_VERSION = 1;
  var FLAG_KEY = 'studio.readerNotes.anchorResolver.enabled';
  var errors = [];
  var ERR_MAX = 20;
  var lastDiagnostics = null;

  function recordError(op, e) {
    try {
      errors.push({ t: Date.now(), op: String(op), e: String((e && e.message) || (e && e.stack) || e || '') });
      if (errors.length > ERR_MAX) errors.splice(0, errors.length - ERR_MAX);
    } catch (_) { /* swallow */ }
  }

  function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  function getFlags() {
    var f = H2O && H2O.flags;
    return (f && typeof f.get === 'function') ? f : null;
  }

  function isEnabled() {
    try {
      var flags = getFlags();
      if (!flags) return false;
      return flags.get(FLAG_KEY, false) === true;
    } catch (e) {
      recordError('isEnabled', e);
      return false;
    }
  }

  function normalizeString(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function isFiniteInteger(value) {
    return Number.isFinite(value) && Math.floor(value) === value;
  }

  function hasFiniteApprox(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function baseDiagnostics(extra) {
    var out = {
      tried: [],
      matchCount: 0,
      approx: null,
      xpathDeferred: false,
      notes: [],
    };
    if (extra && typeof extra === 'object') {
      Object.keys(extra).forEach(function (key) { out[key] = extra[key]; });
    }
    return out;
  }

  function result(status, span, selectorUsed, confidence, reason, diagnostics) {
    var diag = diagnostics || baseDiagnostics();
    var safeSpan = span ? { start: span.start, end: span.end } : null;
    var out = {
      schemaVersion: SCHEMA_VERSION,
      status: status,
      span: safeSpan,
      selectorUsed: selectorUsed || null,
      confidence: confidence,
      reason: reason,
      diagnostics: {
        tried: Array.isArray(diag.tried) ? diag.tried.slice() : [],
        matchCount: Number.isFinite(diag.matchCount) ? diag.matchCount : 0,
        approx: Number.isFinite(diag.approx) ? diag.approx : null,
        xpathDeferred: diag.xpathDeferred === true,
        notes: Array.isArray(diag.notes) ? diag.notes.slice() : [],
      },
    };
    lastDiagnostics = out.diagnostics;
    return out;
  }

  function orphan(reason, diagnostics) {
    return result('orphaned', null, null, 0, reason, diagnostics || baseDiagnostics());
  }

  function validTextQuote(quote) {
    return isPlainObject(quote) && typeof quote.exact === 'string' && quote.exact.length > 0;
  }

  function findTextQuote(quote, plainText, diagnostics) {
    diagnostics.tried.push('textQuote');
    if (!validTextQuote(quote)) {
      diagnostics.notes.push('malformed textQuote');
      return null;
    }

    var exact = quote.exact;
    var prefix = typeof quote.prefix === 'string' ? quote.prefix : '';
    var suffix = typeof quote.suffix === 'string' ? quote.suffix : '';
    var approx = hasFiniteApprox(quote.approx) ? quote.approx : null;
    diagnostics.approx = approx;

    var matches = [];
    for (var idx = plainText.indexOf(exact); idx !== -1; idx = plainText.indexOf(exact, idx + 1)) {
      var start = idx;
      var end = start + exact.length;
      var hasPrefix = !prefix || plainText.slice(Math.max(0, start - prefix.length), start).endsWith(prefix);
      if (!hasPrefix) continue;
      var hasSuffix = !suffix || plainText.slice(end, end + suffix.length).startsWith(suffix);
      if (!hasSuffix) continue;
      matches.push({ start: start, end: end, dist: approx != null ? Math.abs(start - approx) : 0 });
    }
    diagnostics.matchCount = matches.length;
    if (!matches.length) return null;

    if (matches.length === 1) {
      return { span: { start: matches[0].start, end: matches[0].end }, confidence: 1.0, reason: 'textQuote-exact' };
    }

    if (approx == null) {
      diagnostics.notes.push('ambiguous textQuote without approx');
      return { ambiguous: true };
    }

    matches.sort(function (a, b) {
      if (a.dist !== b.dist) return a.dist - b.dist;
      return a.start - b.start;
    });
    if (matches.length > 1 && matches[0].dist === matches[1].dist) {
      diagnostics.notes.push('ambiguous textQuote approx tie');
      return { ambiguous: true };
    }
    return { span: { start: matches[0].start, end: matches[0].end }, confidence: 0.9, reason: 'textQuote-approx' };
  }

  function validTextPos(pos, plainText) {
    if (!isPlainObject(pos)) return false;
    if (!isFiniteInteger(pos.start) || !isFiniteInteger(pos.end)) return false;
    if (pos.start < 0 || pos.end > plainText.length) return false;
    return pos.start < pos.end;
  }

  function resolveTextPos(pos, quote, plainText, diagnostics) {
    diagnostics.tried.push('textPos');
    if (!validTextPos(pos, plainText)) {
      diagnostics.notes.push('malformed textPos');
      return null;
    }
    if (!validTextQuote(quote)) {
      diagnostics.notes.push('textPos requires textQuote validation');
      return null;
    }
    var sliced = plainText.slice(pos.start, pos.end);
    if (sliced === quote.exact || normalizeString(sliced) === normalizeString(quote.exact)) {
      return { span: { start: pos.start, end: pos.end }, confidence: 0.75, reason: 'textPos-validated' };
    }
    diagnostics.notes.push('textPos quote mismatch');
    return null;
  }

  function resolveInText(anchors, plainText, options) {
    if (!isEnabled()) return orphan('disabled', baseDiagnostics());
    try {
      var opts = options || {};
      var diagnostics = baseDiagnostics();
      if (!isPlainObject(anchors)) return orphan('malformed-anchors', diagnostics);
      if (typeof plainText !== 'string') return orphan('malformed-text', diagnostics);
      if (anchors.xpath != null) diagnostics.xpathDeferred = true;
      if (opts && opts.note) diagnostics.notes.push(String(opts.note));

      var quoteMatch = findTextQuote(anchors.textQuote, plainText, diagnostics);
      if (quoteMatch && quoteMatch.span) {
        return result('anchored', quoteMatch.span, 'textQuote', quoteMatch.confidence, quoteMatch.reason, diagnostics);
      }
      if (quoteMatch && quoteMatch.ambiguous) {
        return orphan('ambiguous-textQuote', diagnostics);
      }

      var posMatch = resolveTextPos(anchors.textPos, anchors.textQuote, plainText, diagnostics);
      if (posMatch && posMatch.span) {
        return result('reanchored', posMatch.span, 'textPos', posMatch.confidence, posMatch.reason, diagnostics);
      }

      return orphan('no-safe-match', diagnostics);
    } catch (e) {
      recordError('resolveInText', e);
      return orphan('resolver-error', baseDiagnostics());
    }
  }

  function selfCheck() {
    return {
      ok: errors.length === 0,
      version: VERSION,
      readonly: true,
      schemaVersion: SCHEMA_VERSION,
      flagKey: FLAG_KEY,
      enabled: isEnabled(),
      xpath: 'deferred',
      fuzzy: false,
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
      enabled: base.enabled,
      supportedSelectors: ['textQuote', 'textPos'],
      deferredSelectors: ['xpath'],
      statuses: ['anchored', 'reanchored', 'orphaned'],
      lastDiagnostics: lastDiagnostics ? {
        tried: lastDiagnostics.tried.slice(),
        matchCount: lastDiagnostics.matchCount,
        approx: lastDiagnostics.approx,
        xpathDeferred: lastDiagnostics.xpathDeferred,
        notes: lastDiagnostics.notes.slice(),
      } : null,
      errors: base.errors,
    };
  }

  var api = Object.freeze({
    __installed: true,
    version: VERSION,
    readonly: true,
    flagKey: FLAG_KEY,
    isEnabled: isEnabled,
    resolveInText: resolveInText,
    selfCheck: selfCheck,
    diagnose: diagnose,
  });

  H2O.Studio.readerNotes.anchorResolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
