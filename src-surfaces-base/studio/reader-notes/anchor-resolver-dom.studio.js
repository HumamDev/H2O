/* H2O Studio - Reader & Notes - MVP-A2a.2a: anchor resolver DOM wrapper
 *
 * Read-only DOM binding around the A2a.1 text core. This file is deliberately
 * not wired into Studio runtime in A2a.2a; validators load it directly.
 *
 * Scope:
 *   - Flatten a supplied root into exact text plus an offset map.
 *   - Convert safe text spans back into Range-like objects.
 *   - Resolve highlight annotations by delegating selector matching to the
 *     existing A2a.1 resolveInText core.
 *
 * Deferred:
 *   - XPath resolution and any reader integration.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.readerNotes = H2O.Studio.readerNotes || {};

  if (H2O.Studio.readerNotes.anchorResolverDom && H2O.Studio.readerNotes.anchorResolverDom.__installed) {
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

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function getFlags() {
    var f = H2O && H2O.flags;
    return (f && typeof f.get === 'function') ? f : null;
  }

  function getCore() {
    var core = H2O && H2O.Studio && H2O.Studio.readerNotes && H2O.Studio.readerNotes.anchorResolver;
    return (core && typeof core.resolveInText === 'function') ? core : null;
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

  function isFiniteInteger(value) {
    return Number.isFinite(value) && Math.floor(value) === value;
  }

  function isTextNode(node) {
    return !!node && node.nodeType === 3 && typeof node.nodeValue === 'string';
  }

  function flattenRoot(root) {
    var out = { plain: '', map: [], length: 0 };
    try {
      Object.defineProperty(out, 'root', { value: root || null, enumerable: false });
    } catch (_) {
      out.root = root || null;
    }
    if (!root) return out;

    function visit(node) {
      if (!node) return;
      if (isTextNode(node)) {
        var text = node.nodeValue;
        if (text.length > 0) {
          var start = out.length;
          var end = start + text.length;
          out.map.push({ node: node, start: start, end: end });
          out.plain += text;
          out.length = end;
        }
        return;
      }
      var kids = node.childNodes;
      if (!kids || typeof kids.length !== 'number') return;
      for (var i = 0; i < kids.length; i += 1) visit(kids[i]);
    }

    try {
      visit(root);
    } catch (e) {
      recordError('flattenRoot', e);
      return { plain: '', map: [], length: 0 };
    }
    return out;
  }

  function isFlat(value) {
    return isPlainObject(value)
      && typeof value.plain === 'string'
      && Array.isArray(value.map)
      && Number.isFinite(value.length);
  }

  function cloneSpan(span) {
    if (!span || !isFiniteInteger(span.start) || !isFiniteInteger(span.end)) return null;
    return { start: span.start, end: span.end };
  }

  function validSpan(span, flat) {
    if (!span || !isFiniteInteger(span.start) || !isFiniteInteger(span.end)) return false;
    if (!flat || !Number.isFinite(flat.length)) return false;
    return span.start >= 0 && span.end <= flat.length && span.start < span.end;
  }

  function locate(flat, offset) {
    for (var i = 0; i < flat.map.length; i += 1) {
      var seg = flat.map[i];
      if (offset >= seg.start && offset <= seg.end) {
        return { node: seg.node, offset: offset - seg.start };
      }
    }
    return null;
  }

  function spanToRange(span, flatOrRoot) {
    try {
      var flat = isFlat(flatOrRoot) ? flatOrRoot : flattenRoot(flatOrRoot);
      var root = flat && flat.root ? flat.root : (isFlat(flatOrRoot) ? null : flatOrRoot);
      if (!root || !root.ownerDocument || typeof root.ownerDocument.createRange !== 'function') return null;
      var safeSpan = cloneSpan(span);
      if (!validSpan(safeSpan, flat)) return null;
      var start = locate(flat, safeSpan.start);
      var end = locate(flat, safeSpan.end);
      if (!start || !end || !start.node || !end.node) return null;
      var range = root.ownerDocument.createRange();
      try {
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
      } catch (_) {
        return null;
      }
      if (typeof range.toString !== 'function') return null;
      if (range.toString() !== flat.plain.slice(safeSpan.start, safeSpan.end)) return null;
      return range;
    } catch (e) {
      recordError('spanToRange', e);
      return null;
    }
  }

  function cloneDiagnostics(diag) {
    if (!isPlainObject(diag)) return {};
    var out = {};
    Object.keys(diag).forEach(function (key) {
      var value = diag[key];
      out[key] = Array.isArray(value) ? value.slice() : value;
    });
    return out;
  }

  function makeResult(status, span, range, selectorUsed, confidence, reason, diagnostics) {
    var safeSpan = cloneSpan(span);
    var out = {
      schemaVersion: SCHEMA_VERSION,
      status: status,
      range: range || null,
      span: safeSpan,
      selectorUsed: selectorUsed || null,
      confidence: Number.isFinite(confidence) ? confidence : 0,
      reason: reason || '',
      diagnostics: cloneDiagnostics(diagnostics),
    };
    lastDiagnostics = out.diagnostics;
    return out;
  }

  function orphan(reason, diagnostics, span) {
    return makeResult('orphaned', span || null, null, null, 0, reason, diagnostics || {});
  }

  function resultFromCore(coreResult, range) {
    return makeResult(
      coreResult.status || 'orphaned',
      coreResult.span || null,
      range || null,
      coreResult.selectorUsed || null,
      coreResult.confidence,
      coreResult.reason || '',
      coreResult.diagnostics || {}
    );
  }

  function resolveHighlight(annotation, root, options) {
    if (!isEnabled()) return orphan('disabled');
    try {
      if (!isPlainObject(annotation) || annotation.kind !== 'highlight') return orphan('unsupported-annotation');
      var raw = annotation.raw;
      var anchors = raw && raw.anchors;
      if (!isPlainObject(anchors)) return orphan('missing-anchors');
      if (!root) return orphan('missing-root');

      var core = getCore();
      if (!core) return orphan('core-unavailable');
      var flat = flattenRoot(root);
      var coreResult = core.resolveInText(anchors, flat.plain, options || {});
      if (!isPlainObject(coreResult)) return orphan('core-result-invalid');

      if (coreResult.status !== 'anchored' && coreResult.status !== 'reanchored') {
        return resultFromCore(coreResult, null);
      }

      var span = cloneSpan(coreResult.span);
      if (!validSpan(span, flat)) {
        return makeResult('orphaned', span, null, coreResult.selectorUsed, 0, 'invalid-span', coreResult.diagnostics || {});
      }

      var range = spanToRange(span, flat);
      if (!range) {
        return makeResult('orphaned', span, null, coreResult.selectorUsed, 0, 'range-unavailable', coreResult.diagnostics || {});
      }
      return resultFromCore(coreResult, range);
    } catch (e) {
      recordError('resolveHighlight', e);
      return orphan('resolver-error');
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
      coreAvailable: !!getCore(),
      xpath: 'deferred',
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
      coreAvailable: base.coreAvailable,
      supported: ['flattenRoot', 'spanToRange', 'resolveHighlight'],
      deferredSelectors: ['xpath'],
      statuses: ['anchored', 'reanchored', 'orphaned'],
      lastDiagnostics: lastDiagnostics ? cloneDiagnostics(lastDiagnostics) : null,
      errors: base.errors,
    };
  }

  var api = Object.freeze({
    __installed: true,
    version: VERSION,
    readonly: true,
    flagKey: FLAG_KEY,
    isEnabled: isEnabled,
    flattenRoot: flattenRoot,
    spanToRange: spanToRange,
    resolveHighlight: resolveHighlight,
    selfCheck: selfCheck,
    diagnose: diagnose,
  });

  H2O.Studio.readerNotes.anchorResolverDom = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
