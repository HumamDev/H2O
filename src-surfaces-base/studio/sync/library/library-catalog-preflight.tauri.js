/* H2O Desktop Sync - F15.3.a read-only library catalog preflight
 *
 * Desktop/Tauri-only pure preflight for library.catalog operations.
 *
 * Public API:
 *   H2O.Desktop.Sync.preflightLibraryCatalog(input) -> Promise<result>
 *   H2O.Desktop.Sync.__libraryCatalogPreflightInstalled
 *   H2O.Desktop.Sync.__libraryCatalogPreflightVersion
 *
 * Safety invariants:
 *   - Tauri only (bails on non-Tauri).
 *   - Read-only: no storage reads/writes, no mutations, no fetch, no timers,
 *     no publication, no relay/outbox, no apply, no Native/F5 execution,
 *     no watermark writes, and no consumed-operation writes.
 *   - Composes F15.2.a diagnostics when a diagnostics result is not supplied.
 *   - Tombstone F5 handling is preview metadata only. It never creates F5
 *     rows, calls F5, or enqueues work.
 */
(function (global) {
  'use strict';

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* swallow */ }
    return false;
  }
  if (!detectTauri()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Desktop = H2O.Desktop || {};
  H2O.Desktop.Sync = H2O.Desktop.Sync || {};
  if (H2O.Desktop.Sync.__libraryCatalogPreflightInstalled) return;

  var VERSION = '0.1.0-f15.3.a';
  var RESULT_SCHEMA = 'h2o.desktop.sync.library-catalog-preflight.v1';
  var SUBJECT_TYPE = 'library.catalog';
  var SHA256_RE = /^[0-9a-f]{64}$/;
  var ALLOWED_OPERATIONS = [
    'create',
    'rename',
    'recolor',
    'archive',
    'restore-from-archived',
    'tombstone',
    'restore-from-retained'
  ];
  var ALLOWED_CATALOG_KINDS = ['label', 'tag', 'category'];

  function nowIsoSeconds() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function cleanString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function getSync() {
    return (H2O && H2O.Desktop && H2O.Desktop.Sync) || {};
  }

  function getKernel() {
    return getSync().kernel || null;
  }

  function getDiagnostics() {
    var sync = getSync();
    return typeof sync.diagnoseLibraryCatalog === 'function'
      ? sync.diagnoseLibraryCatalog
      : null;
  }

  function isSha256Hex(value) {
    var kernel = getKernel();
    if (kernel && typeof kernel.isSha256Hex === 'function') {
      try { return !!kernel.isSha256Hex(value); } catch (_) { /* fall through */ }
    }
    return typeof value === 'string' && SHA256_RE.test(value);
  }

  function addEntry(list, code, severity, metadata) {
    var normalized = cleanString(code);
    if (!normalized) return null;
    var sev = cleanString(severity) || 'warning';
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].code === normalized && list[i].severity === sev) {
        return list[i];
      }
    }
    var entry = { code: normalized, severity: sev };
    if (isObject(metadata)) entry.metadata = metadata;
    list.push(entry);
    return entry;
  }

  function addBlocker(list, code, metadata) {
    return addEntry(list, code, 'blocker', metadata);
  }

  function addWarning(list, code, severity, metadata) {
    return addEntry(list, code, severity || 'warning', metadata);
  }

  function mergeEntries(into, from, defaultSeverity) {
    var entries = asArray(from);
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (isObject(entry)) addEntry(into, entry.code, entry.severity || defaultSeverity || 'warning', entry.metadata);
      else addEntry(into, entry, defaultSeverity || 'warning');
    }
  }

  function codeList(entries) {
    return asArray(entries).map(function (entry) {
      return isObject(entry) ? cleanString(entry.code) : cleanString(entry);
    }).filter(Boolean);
  }

  function coarsenIsoToHour(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/T(\d{2}):\d{2}:\d{2}Z$/, 'T$1:00:00Z');
  }

  function observedAtFrom(input) {
    var value = isObject(input) ? cleanString(input.observedAtIso) : '';
    return coarsenIsoToHour(value) || coarsenIsoToHour(nowIsoSeconds()) || nowIsoSeconds();
  }

  function supplied(input, key) {
    return isObject(input) && Object.prototype.hasOwnProperty.call(input, key);
  }

  function buildSideEffectSummary() {
    return {
      storageWritten: false,
      publicationTouched: false,
      relayTouched: false,
      outboxTouched: false,
      nativeCalled: false,
      f5Touched: false,
      applyExecuted: false,
      watermarkWritten: false,
      consumedOperationWritten: false
    };
  }

  function emptyPreflight() {
    return {
      canonicalizationOk: false,
      diagnosticsOk: false,
      privacyOk: false,
      operationAllowed: false,
      catalogKindValid: false,
      lifecycleTransitionAllowed: false,
      siblingNameUnique: null,
      crossAccountSafe: null,
      sourceMirrorFresh: null,
      replaySafe: null,
      watermarkSafe: null,
      consumedOperationSafe: null,
      tombstoneF5Eligible: false,
      tombstoneF5Preview: null,
      contextBestEffort: []
    };
  }

  function buildResult(fields) {
    var value = isObject(fields) ? fields : {};
    var blockers = asArray(value.blockers);
    var warnings = asArray(value.warnings);
    var ok = blockers.length === 0;
    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: ok,
      actionable: ok,
      operation: cleanString(value.operation),
      preflight: value.preflight || emptyPreflight(),
      canonicalCatalog: value.canonicalCatalog || null,
      diagnostics: value.diagnostics || {},
      blockers: blockers,
      warnings: warnings,
      relatedSubjects: asArray(value.relatedSubjects),
      sideEffectSummary: buildSideEffectSummary(),
      observedAtIso: value.observedAtIso || nowIsoSeconds()
    };
  }

  function hitNamesFromDomainScan(scan) {
    var out = [];
    var hits = Array.isArray(scan && scan.forbiddenFields)
      ? scan.forbiddenFields
      : (Array.isArray(scan && scan.hits) ? scan.hits : []);
    for (var i = 0; i < hits.length; i++) {
      var hit = hits[i];
      var name = isObject(hit) ? cleanString(hit.fieldName || hit.fieldPath) : cleanString(hit);
      if (name && out.indexOf(name) === -1) out.push(name);
    }
    return out;
  }

  function scanDomain(domainTag, target, redactionClass) {
    var kernel = getKernel();
    if (!kernel || typeof kernel.scanDomainForbiddenFields !== 'function') {
      return { ok: true, hits: [], blockers: [], warnings: [] };
    }
    var scanTarget = isObject(target)
      ? Object.assign({}, target, { redactionClass: redactionClass || 'redacted' })
      : target;
    var result = kernel.scanDomainForbiddenFields(domainTag, scanTarget);
    return {
      ok: !!(result && result.ok),
      hits: hitNamesFromDomainScan(result),
      blockers: asArray(result && result.blockers),
      warnings: asArray(result && result.warnings)
    };
  }

  function canonicalFromDiagnostics(result) {
    if (!isObject(result)) return null;
    return isObject(result.canonicalCatalog)
      ? result.canonicalCatalog
      : (isObject(result.canonical) ? result.canonical : null);
  }

  function diagnosticsIndicatesForbidden(result) {
    if (!isObject(result)) return false;
    var blockers = codeList(result.blockers);
    var entries = codeList(result.diagnostics && result.diagnostics.entries);
    return blockers.indexOf('library-catalog-row-contains-forbidden-field') !== -1 ||
      entries.indexOf('library-catalog-row-contains-forbidden-field') !== -1 ||
      result.diagnostics && result.diagnostics.privacyOk === false;
  }

  async function resolveDiagnostics(input, blockers, warnings) {
    var source = isObject(input) ? input : {};
    if (isObject(source.diagnosticsResult)) {
      return {
        result: source.diagnosticsResult,
        sourceKind: 'diagnosticsResult',
        diagnosticsAvailable: !!getDiagnostics()
      };
    }

    var diagnostics = getDiagnostics();
    if (!diagnostics) {
      addBlocker(blockers, 'library-catalog-diagnostics-failed');
      return {
        result: null,
        sourceKind: 'missing-diagnostics',
        diagnosticsAvailable: false
      };
    }

    var diagnosticInput = {};
    if (isObject(source.canonicalCatalog)) diagnosticInput.canonicalCatalog = source.canonicalCatalog;
    else if (isObject(source.canonical)) diagnosticInput.canonical = source.canonical;
    else if (isObject(source.canonicalizerResult)) diagnosticInput.canonicalizerResult = source.canonicalizerResult;
    else if (isObject(source.row)) diagnosticInput.row = source.row;
    else if (source.subjectType === SUBJECT_TYPE) diagnosticInput.canonicalCatalog = source;
    else diagnosticInput = source;
    if (source.observedAtIso) diagnosticInput.observedAtIso = source.observedAtIso;
    if (source.relatedBindings) diagnosticInput.relatedBindings = source.relatedBindings;

    try {
      return {
        result: await diagnostics(diagnosticInput),
        sourceKind: 'diagnoseLibraryCatalog',
        diagnosticsAvailable: true
      };
    } catch (_) {
      addBlocker(blockers, 'library-catalog-diagnostics-failed');
      return {
        result: null,
        sourceKind: 'diagnoseLibraryCatalog',
        diagnosticsAvailable: true
      };
    }
  }

  function currentLifecycle(input, catalog) {
    var explicit = isObject(input) ? cleanString(input.currentLifecycleState) : '';
    return explicit || cleanString(catalog && catalog.lifecycleState);
  }

  function targetLifecycle(operation, current) {
    if (operation === 'create') return 'active';
    if (operation === 'archive') return 'archived';
    if (operation === 'restore-from-archived') return 'active';
    if (operation === 'tombstone') return 'retained';
    if (operation === 'restore-from-retained') return 'active';
    if (operation === 'rename' || operation === 'recolor') return current;
    return '';
  }

  function lifecycleTransitionAllowed(operation, fromState, toState) {
    if (operation === 'create') return toState === 'active';
    if (operation === 'rename' || operation === 'recolor') return !!fromState && fromState === toState;
    if (operation === 'archive') return fromState === 'active' && toState === 'archived';
    if (operation === 'restore-from-archived') return fromState === 'archived' && toState === 'active';
    if (operation === 'tombstone') return (fromState === 'active' || fromState === 'archived') && toState === 'retained';
    if (operation === 'restore-from-retained') return fromState === 'retained' && toState === 'active';
    return false;
  }

  function catalogFromEntry(entry) {
    if (!isObject(entry)) return null;
    if (entry.subjectType === SUBJECT_TYPE) return entry;
    if (isObject(entry.canonicalCatalog)) return entry.canonicalCatalog;
    if (isObject(entry.catalog)) return entry.catalog;
    if (isObject(entry.canonical)) return entry.canonical;
    if (isObject(entry.canonicalizerResult)) {
      if (isObject(entry.canonicalizerResult.canonicalCatalog)) return entry.canonicalizerResult.canonicalCatalog;
      if (isObject(entry.canonicalizerResult.canonical)) return entry.canonicalizerResult.canonical;
    }
    return null;
  }

  function inspectSiblingNameUniqueness(operation, catalog, input, preflight, blockers, warnings) {
    if (operation !== 'create' && operation !== 'rename') {
      preflight.siblingNameUnique = true;
      return;
    }
    if (!supplied(input, 'existingCatalogSiblings')) {
      preflight.siblingNameUnique = null;
      noteMissingContext(input, preflight, blockers, warnings, 'existingCatalogSiblings', 'context-missing');
      return;
    }
    var siblings = asArray(input.existingCatalogSiblings);
    preflight.siblingNameUnique = true;
    for (var i = 0; i < siblings.length; i++) {
      var sibling = catalogFromEntry(siblings[i]);
      if (!sibling || sibling.subjectId === catalog.subjectId) continue;
      if (sibling.lifecycleState !== 'active') continue;
      if (sibling.catalogKind === catalog.catalogKind &&
          sibling.nameHash === catalog.nameHash &&
          sibling.originAccountIdHash === catalog.originAccountIdHash) {
        preflight.siblingNameUnique = false;
        addBlocker(
          blockers,
          operation === 'create'
            ? 'library-catalog-name-collision-on-create'
            : 'library-catalog-name-collision-on-rename'
        );
        return;
      }
    }
  }

  function noteMissingContext(input, preflight, blockers, warnings, contextName, warningCode) {
    var code = cleanString(warningCode) || 'context-missing';
    preflight.contextBestEffort.push(contextName);
    addWarning(warnings, code, 'warning', { context: contextName });
    if (input && input.requireContext === true) {
      addBlocker(blockers, 'context-missing', { context: contextName });
    }
  }

  function inspectCrossAccount(catalog, input, preflight, blockers, warnings) {
    var local = cleanString(input && input.localAccountIdHash);
    if (!local) {
      preflight.crossAccountSafe = null;
      noteMissingContext(input, preflight, blockers, warnings, 'localAccountIdHash', 'context-missing');
      return;
    }
    if (!isSha256Hex(local) || catalog.originAccountIdHash !== local) {
      preflight.crossAccountSafe = false;
      addBlocker(blockers, 'library-catalog-cross-account-attempt');
      return;
    }
    preflight.crossAccountSafe = true;
  }

  function inspectSourceMirror(input, preflight, blockers, warnings) {
    if (!supplied(input, 'sourceMirror')) {
      preflight.sourceMirrorFresh = null;
      noteMissingContext(input, preflight, blockers, warnings, 'sourceMirror', 'source-mirror-context-missing');
      return;
    }
    var mirror = isObject(input.sourceMirror) ? input.sourceMirror : {};
    var stale = mirror.stale === true ||
      mirror.fresh === false ||
      mirror.mirrorFresh === false ||
      mirror.sourceFresh === false ||
      cleanString(mirror.status).toLowerCase() === 'stale';
    preflight.sourceMirrorFresh = !stale;
    if (stale) addBlocker(blockers, 'library-catalog-diagnostics-failed', { gate: 'sourceMirror' });
  }

  function replayUnsafe(context) {
    if (!isObject(context)) return false;
    return context.replaySafe === false ||
      context.safe === false ||
      context.ok === false ||
      context.conflict === true ||
      context.replayDetected === true ||
      cleanString(context.status).toLowerCase() === 'replay';
  }

  function inspectReplay(input, preflight, blockers, warnings) {
    if (!supplied(input, 'replayContext')) {
      preflight.replaySafe = null;
      noteMissingContext(input, preflight, blockers, warnings, 'replayContext', 'replay-context-missing');
      return;
    }
    var replay = isObject(input.replayContext) ? input.replayContext : {};
    preflight.replaySafe = !replayUnsafe(replay);
    if (!preflight.replaySafe) addBlocker(blockers, 'library-catalog-replay-detected');
  }

  function watermarkUnsafe(state) {
    if (!isObject(state)) return false;
    if (state.watermarkSafe === false ||
        state.safe === false ||
        state.valid === false ||
        state.ok === false ||
        state.regression === true ||
        state.notSafe === true) {
      return true;
    }
    var current = state.currentWatermark;
    var proposed = state.proposedWatermark;
    if (typeof current !== 'undefined' && typeof proposed !== 'undefined') {
      if (typeof current === 'number' && typeof proposed === 'number') return proposed < current;
      if (typeof current === 'string' && typeof proposed === 'string') return proposed < current;
      if (isObject(current) && isObject(proposed)) {
        if (typeof current.value === 'number' && typeof proposed.value === 'number') return proposed.value < current.value;
        if (typeof current.watermarkAtIso === 'string' && typeof proposed.watermarkAtIso === 'string') {
          return proposed.watermarkAtIso < current.watermarkAtIso;
        }
      }
    }
    return false;
  }

  function inspectWatermark(input, preflight, blockers, warnings) {
    if (!supplied(input, 'watermarkState')) {
      preflight.watermarkSafe = null;
      noteMissingContext(input, preflight, blockers, warnings, 'watermarkState', 'watermark-context-missing');
      return;
    }
    var watermark = isObject(input.watermarkState) ? input.watermarkState : {};
    preflight.watermarkSafe = !watermarkUnsafe(watermark);
    if (!preflight.watermarkSafe) addBlocker(blockers, 'library-catalog-watermark-not-safe');
  }

  function consumedUnsafe(state) {
    if (!isObject(state)) return false;
    return state.consumedSafe === false ||
      state.safe === false ||
      state.valid === false ||
      state.ok === false ||
      state.conflict === true ||
      state.duplicate === true ||
      cleanString(state.status).toLowerCase() === 'conflict';
  }

  function inspectConsumedOperation(input, preflight, blockers, warnings) {
    if (!supplied(input, 'consumedOperationState')) {
      preflight.consumedOperationSafe = null;
      noteMissingContext(input, preflight, blockers, warnings, 'consumedOperationState', 'consumed-operation-context-missing');
      return;
    }
    var consumed = isObject(input.consumedOperationState) ? input.consumedOperationState : {};
    preflight.consumedOperationSafe = !consumedUnsafe(consumed);
    if (!preflight.consumedOperationSafe) addBlocker(blockers, 'library-catalog-consumed-operation-conflict');
  }

  function applyTombstoneF5Preview(operation, catalog, preflight, observedAtIso) {
    if (operation !== 'tombstone') return;
    preflight.tombstoneF5Eligible = preflight.lifecycleTransitionAllowed === true;
    preflight.tombstoneF5Preview = {
      eligible: preflight.tombstoneF5Eligible,
      owner: 'f5',
      reviewKind: 'library-catalog-tombstone-review',
      subjectType: SUBJECT_TYPE,
      subjectId: catalog && catalog.subjectId,
      lifecycleTarget: 'retained',
      observedAtIso: observedAtIso,
      sideEffectSummary: buildSideEffectSummary()
    };
  }

  function assembleWithOutputScan(parts) {
    var result = buildResult(parts);
    var scan = scanDomain(SUBJECT_TYPE, result, 'redacted');
    if (scan.ok) return result;

    var blockers = asArray(parts.blockers).slice();
    addBlocker(blockers, 'library-catalog-row-contains-forbidden-field');
    return buildResult({
      operation: parts.operation,
      preflight: parts.preflight,
      canonicalCatalog: null,
      diagnostics: {},
      blockers: blockers,
      warnings: parts.warnings,
      relatedSubjects: [],
      observedAtIso: parts.observedAtIso
    });
  }

  async function preflightLibraryCatalog(input) {
    var observedAtIso = observedAtFrom(input);
    var blockers = [];
    var warnings = [];
    var preflight = emptyPreflight();
    var operation = isObject(input) ? cleanString(input.operation) : '';
    var diagnostics = {};
    var canonicalCatalog = null;
    var relatedSubjects = [];

    if (!isObject(input)) {
      addBlocker(blockers, 'library-catalog-canonicalization-failed');
      return assembleWithOutputScan({
        operation: operation,
        preflight: preflight,
        diagnostics: diagnostics,
        blockers: blockers,
        warnings: warnings,
        relatedSubjects: relatedSubjects,
        observedAtIso: observedAtIso
      });
    }

    if (ALLOWED_OPERATIONS.indexOf(operation) === -1) {
      addBlocker(blockers, 'library-catalog-operation-not-allowed');
    } else {
      preflight.operationAllowed = true;
    }

    var resolved = await resolveDiagnostics(input, blockers, warnings);
    var diagnosticsResult = resolved.result;
    if (!diagnosticsResult || !isObject(diagnosticsResult)) {
      addBlocker(blockers, 'library-catalog-diagnostics-failed');
    } else {
      diagnostics = diagnosticsResult.diagnostics || {};
      canonicalCatalog = canonicalFromDiagnostics(diagnosticsResult);
      relatedSubjects = asArray(diagnosticsResult.relatedSubjects);
      mergeEntries(warnings, diagnosticsResult.warnings, 'warning');

      if (diagnostics.canonicalizationOk === true && canonicalCatalog) {
        preflight.canonicalizationOk = true;
      } else {
        addBlocker(blockers, 'library-catalog-canonicalization-failed');
      }

      if (diagnosticsResult.ok === true) {
        preflight.diagnosticsOk = true;
      } else {
        addBlocker(blockers, 'library-catalog-diagnostics-failed');
      }

      if (diagnostics.privacyOk === true && !diagnosticsIndicatesForbidden(diagnosticsResult)) {
        preflight.privacyOk = true;
      } else {
        addBlocker(blockers, 'library-catalog-row-contains-forbidden-field');
      }
    }

    if (canonicalCatalog) {
      preflight.catalogKindValid = ALLOWED_CATALOG_KINDS.indexOf(canonicalCatalog.catalogKind) !== -1;
      if (!preflight.catalogKindValid) addBlocker(blockers, 'library-catalog-diagnostics-failed');

      var fromState = currentLifecycle(input, canonicalCatalog);
      var toState = targetLifecycle(operation, fromState);
      preflight.currentLifecycleState = fromState;
      preflight.targetLifecycleState = toState;
      preflight.lifecycleTransitionAllowed = lifecycleTransitionAllowed(operation, fromState, toState);
      if (!preflight.lifecycleTransitionAllowed) {
        addBlocker(blockers, 'library-catalog-lifecycle-transition-disallowed');
      }

      inspectSiblingNameUniqueness(operation, canonicalCatalog, input, preflight, blockers, warnings);
      inspectCrossAccount(canonicalCatalog, input, preflight, blockers, warnings);
      inspectSourceMirror(input, preflight, blockers, warnings);
      inspectReplay(input, preflight, blockers, warnings);
      inspectWatermark(input, preflight, blockers, warnings);
      inspectConsumedOperation(input, preflight, blockers, warnings);
      applyTombstoneF5Preview(operation, canonicalCatalog, preflight, observedAtIso);
    }

    return assembleWithOutputScan({
      operation: operation,
      preflight: preflight,
      canonicalCatalog: canonicalCatalog,
      diagnostics: diagnostics,
      blockers: blockers,
      warnings: warnings,
      relatedSubjects: relatedSubjects,
      observedAtIso: observedAtIso
    });
  }

  H2O.Desktop.Sync.preflightLibraryCatalog = preflightLibraryCatalog;
  H2O.Desktop.Sync.__libraryCatalogPreflightInstalled = true;
  H2O.Desktop.Sync.__libraryCatalogPreflightVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
