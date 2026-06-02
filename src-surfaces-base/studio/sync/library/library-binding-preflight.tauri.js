/* H2O Desktop Sync - F15.3.b read-only library binding preflight
 *
 * Desktop/Tauri-only pure preflight for library.binding operations.
 *
 * Public API:
 *   H2O.Desktop.Sync.preflightLibraryBinding(input) -> Promise<result>
 *   H2O.Desktop.Sync.__libraryBindingPreflightInstalled
 *   H2O.Desktop.Sync.__libraryBindingPreflightVersion
 *
 * Safety invariants:
 *   - Tauri only (bails on non-Tauri).
 *   - Read-only: no storage reads/writes, no mutations, no fetch, no timers,
 *     no publication, no relay/outbox, no apply, no Native/F5 execution,
 *     no watermark writes, and no consumed-operation writes.
 *   - Composes F15.2.b diagnostics when a diagnostics result is not supplied.
 *   - Materialized category-cache observations are warning-only and never
 *     mutate source-of-truth binding state.
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
  if (H2O.Desktop.Sync.__libraryBindingPreflightInstalled) return;

  var VERSION = '0.2.0-f15.11.b';
  var RESULT_SCHEMA = 'h2o.desktop.sync.library-binding-preflight.v1';
  var SUBJECT_TYPE = 'library.binding';
  var CATALOG_SUBJECT_TYPE = 'library.catalog';
  var CHAT_SUBJECT_TYPE = 'chat.metadata';
  var FOLDER_SUBJECT_TYPE = 'folder.metadata';
  var SHA256_RE = /^[0-9a-f]{64}$/;
  var ALLOWED_OPERATIONS = ['bind', 'unbind'];
  var ALLOWED_BINDING_KINDS = ['chat-label', 'chat-tag', 'chat-category', 'tag-category', 'chat-folder'];
  var DUPLICATE_CODES = [
    'chat-category-conflict',
    'chat-folder-conflict',
    'chat-label-already-bound',
    'chat-tag-already-bound',
    'tag-category-already-bound'
  ];
  var ORPHAN_CODES = [
    'binding-orphaned-catalog-archived',
    'binding-orphaned-catalog-retained',
    'binding-orphaned-catalog-expired',
    'binding-orphaned-catalog-tombstoned'
  ];

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
    return typeof sync.diagnoseLibraryBinding === 'function'
      ? sync.diagnoseLibraryBinding
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

  function hasCode(entries, code) {
    return codeList(entries).indexOf(code) !== -1;
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
      bindingKindValid: false,
      endpointSubjectHashesValid: false,
      endpointTypesValid: false,
      catalogEndpointResolvable: null,
      chatEndpointResolvable: null,
      activeCatalogEndpoint: null,
      unbindOrphanPermitted: false,
      uniquenessOk: null,
      chatFolderDeferred: false,
      categoryCacheObservationSafe: true,
      crossAccountSafe: null,
      sourceMirrorFresh: null,
      replaySafe: null,
      watermarkSafe: null,
      consumedOperationSafe: null,
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
      canonicalBinding: value.canonicalBinding || null,
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
    return isObject(result.canonicalBinding)
      ? result.canonicalBinding
      : (isObject(result.canonical) ? result.canonical : null);
  }

  function diagnosticsIndicatesForbidden(result) {
    if (!isObject(result)) return false;
    var blockers = codeList(result.blockers);
    var entries = codeList(result.diagnostics && result.diagnostics.entries);
    return blockers.indexOf('library-binding-row-contains-forbidden-field') !== -1 ||
      entries.indexOf('library-binding-row-contains-forbidden-field') !== -1 ||
      result.diagnostics && result.diagnostics.privacyOk === false;
  }

  async function resolveDiagnostics(input, blockers) {
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
      addBlocker(blockers, 'library-binding-diagnostics-failed');
      return {
        result: null,
        sourceKind: 'missing-diagnostics',
        diagnosticsAvailable: false
      };
    }

    var diagnosticInput = {};
    if (isObject(source.canonicalBinding)) diagnosticInput.canonicalBinding = source.canonicalBinding;
    else if (isObject(source.canonical)) diagnosticInput.canonical = source.canonical;
    else if (isObject(source.canonicalizerResult)) diagnosticInput.canonicalizerResult = source.canonicalizerResult;
    else if (isObject(source.row)) diagnosticInput.row = source.row;
    else if (source.subjectType === SUBJECT_TYPE) diagnosticInput.canonicalBinding = source;
    else diagnosticInput = source;
    if (source.observedAtIso) diagnosticInput.observedAtIso = source.observedAtIso;
    if (source.relatedCatalogs) diagnosticInput.relatedCatalogs = source.relatedCatalogs;
    if (source.relatedChats) diagnosticInput.relatedChats = source.relatedChats;
    if (source.siblingBindings && source.operation === 'bind') diagnosticInput.siblingBindings = source.siblingBindings;
    if (source.materializedCacheObservation) diagnosticInput.materializedCacheObservation = source.materializedCacheObservation;
    if (source.operation) diagnosticInput.diagnosticIntent = source.operation;

    try {
      return {
        result: await diagnostics(diagnosticInput),
        sourceKind: 'diagnoseLibraryBinding',
        diagnosticsAvailable: true
      };
    } catch (_) {
      addBlocker(blockers, 'library-binding-diagnostics-failed');
      return {
        result: null,
        sourceKind: 'diagnoseLibraryBinding',
        diagnosticsAvailable: true
      };
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

  function catalogFromEntry(entry) {
    if (!isObject(entry)) return null;
    if (entry.subjectType === CATALOG_SUBJECT_TYPE) return entry;
    if (isObject(entry.canonicalCatalog)) return entry.canonicalCatalog;
    if (isObject(entry.catalog)) return entry.catalog;
    if (isObject(entry.canonical)) return entry.canonical;
    if (isObject(entry.canonicalizerResult)) {
      if (isObject(entry.canonicalizerResult.canonicalCatalog)) return entry.canonicalizerResult.canonicalCatalog;
      if (isObject(entry.canonicalizerResult.canonical)) return entry.canonicalizerResult.canonical;
    }
    return null;
  }

  function chatFromEntry(entry) {
    if (!isObject(entry)) return null;
    if (entry.subjectType === CHAT_SUBJECT_TYPE) return entry;
    if (isObject(entry.canonicalChat)) return entry.canonicalChat;
    if (isObject(entry.chat)) return entry.chat;
    if (isObject(entry.canonical)) return entry.canonical;
    if (isObject(entry.canonicalizerResult)) {
      if (isObject(entry.canonicalizerResult.canonicalChat)) return entry.canonicalizerResult.canonicalChat;
      if (isObject(entry.canonicalizerResult.canonical)) return entry.canonicalizerResult.canonical;
    }
    return null;
  }

  function bindingFromEntry(entry) {
    if (!isObject(entry)) return null;
    if (entry.subjectType === SUBJECT_TYPE) return entry;
    if (isObject(entry.canonicalBinding)) return entry.canonicalBinding;
    if (isObject(entry.binding)) return entry.binding;
    if (isObject(entry.canonical)) return entry.canonical;
    if (isObject(entry.canonicalizerResult)) {
      if (isObject(entry.canonicalizerResult.canonicalBinding)) return entry.canonicalizerResult.canonicalBinding;
      if (isObject(entry.canonicalizerResult.canonical)) return entry.canonicalizerResult.canonical;
    }
    return null;
  }

  function catalogEndpointIds(binding) {
    if (!binding) return [];
    if (binding.bindingKind === 'tag-category') return [binding.leftSubjectId, binding.rightSubjectId];
    if (binding.rightSubjectType === CATALOG_SUBJECT_TYPE) return [binding.rightSubjectId];
    return [];
  }

  function chatEndpointId(binding) {
    if (!binding) return '';
    return binding.leftSubjectType === CHAT_SUBJECT_TYPE ? binding.leftSubjectId : '';
  }

  function findCatalog(catalogs, subjectId) {
    for (var i = 0; i < catalogs.length; i++) {
      var catalog = catalogFromEntry(catalogs[i]);
      if (catalog && catalog.subjectId === subjectId) return catalog;
    }
    return null;
  }

  function findChat(chats, subjectId) {
    for (var i = 0; i < chats.length; i++) {
      var chat = chatFromEntry(chats[i]);
      if (chat && chat.subjectId === subjectId) return chat;
    }
    return null;
  }

  function inspectCatalogEndpoints(binding, input, operation, preflight, blockers, warnings) {
    var endpointIds = catalogEndpointIds(binding);
    if (!endpointIds.length) {
      preflight.catalogEndpointResolvable = true;
      preflight.activeCatalogEndpoint = true;
      return;
    }
    if (!supplied(input, 'relatedCatalogs')) {
      preflight.catalogEndpointResolvable = null;
      preflight.activeCatalogEndpoint = null;
      noteMissingContext(input, preflight, blockers, warnings, 'relatedCatalogs', 'context-missing');
      return;
    }
    var catalogs = asArray(input.relatedCatalogs);
    preflight.catalogEndpointResolvable = true;
    preflight.activeCatalogEndpoint = true;
    for (var i = 0; i < endpointIds.length; i++) {
      var catalog = findCatalog(catalogs, endpointIds[i]);
      if (!catalog) {
        preflight.catalogEndpointResolvable = false;
        addBlocker(blockers, 'binding-endpoint-missing');
        continue;
      }
      if (catalog.lifecycleState !== 'active') {
        preflight.activeCatalogEndpoint = false;
        var orphanCode = 'binding-orphaned-catalog-' + cleanString(catalog.lifecycleState);
        if (ORPHAN_CODES.indexOf(orphanCode) !== -1) {
          addWarning(warnings, orphanCode, catalog.lifecycleState === 'archived' ? 'info' : 'warning');
        }
        if (operation === 'bind') addBlocker(blockers, 'binding-endpoint-not-active');
        if (operation === 'unbind') preflight.unbindOrphanPermitted = true;
      }
    }
  }

  function inspectChatEndpoint(binding, input, preflight, blockers, warnings) {
    var chatId = chatEndpointId(binding);
    if (!chatId) {
      preflight.chatEndpointResolvable = true;
      return;
    }
    if (!supplied(input, 'relatedChats')) {
      preflight.chatEndpointResolvable = null;
      noteMissingContext(input, preflight, blockers, warnings, 'relatedChats', 'context-missing');
      return;
    }
    preflight.chatEndpointResolvable = !!findChat(asArray(input.relatedChats), chatId);
    if (!preflight.chatEndpointResolvable) addBlocker(blockers, 'binding-chat-endpoint-missing');
  }

  function sameEndpointBinding(a, b) {
    return !!(a && b &&
      a.leftSubjectId === b.leftSubjectId &&
      a.rightSubjectId === b.rightSubjectId);
  }

  function duplicateCodeFor(current, sibling) {
    if (!current || !sibling || current.subjectId === sibling.subjectId) return '';
    if (current.bindingKind !== sibling.bindingKind) return '';
    if (current.bindingState !== 'bound' || sibling.bindingState !== 'bound') return '';
    if (current.bindingKind === 'chat-category' && current.leftSubjectId === sibling.leftSubjectId) {
      return 'chat-category-conflict';
    }
    if (current.bindingKind === 'chat-folder' && current.leftSubjectId === sibling.leftSubjectId) {
      return 'chat-folder-conflict';
    }
    if (current.bindingKind === 'chat-label' && sameEndpointBinding(current, sibling)) {
      return 'chat-label-already-bound';
    }
    if (current.bindingKind === 'chat-tag' && sameEndpointBinding(current, sibling)) {
      return 'chat-tag-already-bound';
    }
    if (current.bindingKind === 'tag-category' && sameEndpointBinding(current, sibling)) {
      return 'tag-category-already-bound';
    }
    return '';
  }

  function inspectSiblingBindings(binding, input, operation, preflight, blockers, warnings) {
    if (operation !== 'bind') {
      preflight.uniquenessOk = true;
      return;
    }
    if (!supplied(input, 'siblingBindings')) {
      preflight.uniquenessOk = null;
      noteMissingContext(input, preflight, blockers, warnings, 'siblingBindings', 'context-missing');
      return;
    }
    preflight.uniquenessOk = true;
    var siblings = asArray(input.siblingBindings);
    for (var i = 0; i < siblings.length; i++) {
      var sibling = bindingFromEntry(siblings[i]);
      var code = duplicateCodeFor(binding, sibling);
      if (!code) continue;
      preflight.uniquenessOk = false;
      addBlocker(blockers, code);
    }
  }

  function inspectCacheObservation(input, preflight, warnings) {
    if (!supplied(input, 'materializedCacheObservation')) return;
    preflight.categoryCacheObservationSafe = true;
    var observation = isObject(input.materializedCacheObservation) ? input.materializedCacheObservation : {};
    var status = cleanString(observation.status).toLowerCase();
    var drift = observation.driftDetected === true ||
      observation.drift === true ||
      observation.isDrifted === true ||
      status === 'drift' ||
      status === 'drifted';
    var stale = observation.stale === true ||
      observation.cacheStale === true ||
      observation.categoryCacheStale === true ||
      status === 'stale';
    if (drift) addWarning(warnings, 'materialized-cache-drift-detected', 'warning');
    if (stale) addWarning(warnings, 'category-cache-stale', 'info');
  }

  function inspectCrossAccount(binding, input, operation, preflight, blockers, warnings) {
    var local = cleanString(input && input.localAccountIdHash);
    if (!local) {
      preflight.crossAccountSafe = null;
      noteMissingContext(input, preflight, blockers, warnings, 'localAccountIdHash', 'context-missing');
      return;
    }
    if (!isSha256Hex(local) || binding.originAccountIdHash !== local) {
      preflight.crossAccountSafe = false;
      addBlocker(blockers, operation === 'unbind' ? 'cross-account-unbind-attempt' : 'cross-account-binding-attempt');
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
    if (stale) addBlocker(blockers, 'library-binding-diagnostics-failed', { gate: 'sourceMirror' });
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

  function inspectReplay(input, operation, preflight, blockers, warnings) {
    if (!supplied(input, 'replayContext')) {
      preflight.replaySafe = null;
      noteMissingContext(input, preflight, blockers, warnings, 'replayContext', 'replay-context-missing');
      return;
    }
    var replay = isObject(input.replayContext) ? input.replayContext : {};
    preflight.replaySafe = !replayUnsafe(replay);
    if (!preflight.replaySafe) {
      addBlocker(blockers, operation === 'unbind' ? 'binding-unbind-replay-detected' : 'binding-replay-detected');
    }
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
    if (!preflight.watermarkSafe) addBlocker(blockers, 'library-binding-watermark-not-safe');
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
    if (!preflight.consumedOperationSafe) addBlocker(blockers, 'library-binding-consumed-operation-conflict');
  }

  function mergeSpecificDiagnosticBlockers(diagnosticsResult, blockers) {
    var resultBlockers = codeList(diagnosticsResult && diagnosticsResult.blockers);
    for (var i = 0; i < resultBlockers.length; i++) {
      var code = resultBlockers[i];
      if (code === 'binding-kind-deferred' ||
          code === 'binding-endpoint-not-active' ||
          code === 'binding-endpoint-missing' ||
          code === 'binding-chat-endpoint-missing' ||
          code === 'library-binding-row-contains-forbidden-field' ||
          DUPLICATE_CODES.indexOf(code) !== -1) {
        addBlocker(blockers, code);
      }
    }
  }

  function diagnosticsHasDeferredKind(diagnosticsResult, binding) {
    return hasCode(diagnosticsResult && diagnosticsResult.blockers, 'binding-kind-deferred') ||
      hasCode(diagnosticsResult && diagnosticsResult.diagnostics && diagnosticsResult.diagnostics.entries, 'binding-kind-deferred');
  }

  function assembleWithOutputScan(parts) {
    var result = buildResult(parts);
    var scan = scanDomain(SUBJECT_TYPE, result, 'redacted');
    if (scan.ok) return result;

    var blockers = asArray(parts.blockers).slice();
    addBlocker(blockers, 'library-binding-row-contains-forbidden-field');
    return buildResult({
      operation: parts.operation,
      preflight: parts.preflight,
      canonicalBinding: null,
      diagnostics: {},
      blockers: blockers,
      warnings: parts.warnings,
      relatedSubjects: [],
      observedAtIso: parts.observedAtIso
    });
  }

  async function preflightLibraryBinding(input) {
    var observedAtIso = observedAtFrom(input);
    var blockers = [];
    var warnings = [];
    var preflight = emptyPreflight();
    var operation = isObject(input) ? cleanString(input.operation || input.operationIntent) : '';
    var diagnostics = {};
    var canonicalBinding = null;
    var relatedSubjects = [];

    if (!isObject(input)) {
      addBlocker(blockers, 'library-binding-canonicalization-failed');
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
      addBlocker(blockers, 'library-binding-operation-not-allowed');
    } else {
      preflight.operationAllowed = true;
    }

    var resolved = await resolveDiagnostics(input, blockers);
    var diagnosticsResult = resolved.result;
    if (!diagnosticsResult || !isObject(diagnosticsResult)) {
      addBlocker(blockers, 'library-binding-diagnostics-failed');
    } else {
      diagnostics = diagnosticsResult.diagnostics || {};
      canonicalBinding = canonicalFromDiagnostics(diagnosticsResult);
      relatedSubjects = asArray(diagnosticsResult.relatedSubjects);
      mergeEntries(warnings, diagnosticsResult.warnings, 'warning');
      mergeSpecificDiagnosticBlockers(diagnosticsResult, blockers);

      if (diagnostics.canonicalizationOk === true && canonicalBinding) {
        preflight.canonicalizationOk = true;
      } else {
        addBlocker(blockers, 'library-binding-canonicalization-failed');
      }

      if (diagnosticsResult.ok === true) {
        preflight.diagnosticsOk = true;
      } else {
        addBlocker(blockers, 'library-binding-diagnostics-failed');
      }

      if (diagnostics.privacyOk === true && !diagnosticsIndicatesForbidden(diagnosticsResult)) {
        preflight.privacyOk = true;
      } else {
        addBlocker(blockers, 'library-binding-row-contains-forbidden-field');
      }
    }

    if (canonicalBinding) {
      preflight.bindingKindValid = ALLOWED_BINDING_KINDS.indexOf(canonicalBinding.bindingKind) !== -1;
      preflight.chatFolderDeferred = diagnosticsHasDeferredKind(diagnosticsResult, canonicalBinding);
      if (preflight.chatFolderDeferred) addBlocker(blockers, 'binding-kind-deferred');
      if (!preflight.bindingKindValid && !preflight.chatFolderDeferred) {
        addBlocker(blockers, 'library-binding-diagnostics-failed');
      }

      preflight.endpointSubjectHashesValid = isSha256Hex(canonicalBinding.leftSubjectId) &&
        isSha256Hex(canonicalBinding.rightSubjectId);
      if (!preflight.endpointSubjectHashesValid) addBlocker(blockers, 'library-binding-diagnostics-failed');

      preflight.endpointTypesValid = diagnostics.endpointTypeConsistent === true ||
        (canonicalBinding.leftSubjectType === CHAT_SUBJECT_TYPE && canonicalBinding.rightSubjectType === CATALOG_SUBJECT_TYPE) ||
        (canonicalBinding.leftSubjectType === CATALOG_SUBJECT_TYPE && canonicalBinding.rightSubjectType === CATALOG_SUBJECT_TYPE) ||
        (canonicalBinding.leftSubjectType === CHAT_SUBJECT_TYPE && canonicalBinding.rightSubjectType === FOLDER_SUBJECT_TYPE);
      if (!preflight.endpointTypesValid) addBlocker(blockers, 'library-binding-diagnostics-failed');

      inspectCatalogEndpoints(canonicalBinding, input, operation, preflight, blockers, warnings);
      inspectChatEndpoint(canonicalBinding, input, preflight, blockers, warnings);
      inspectSiblingBindings(canonicalBinding, input, operation, preflight, blockers, warnings);
      inspectCacheObservation(input, preflight, warnings);
      inspectCrossAccount(canonicalBinding, input, operation, preflight, blockers, warnings);
      inspectSourceMirror(input, preflight, blockers, warnings);
      inspectReplay(input, operation, preflight, blockers, warnings);
      inspectWatermark(input, preflight, blockers, warnings);
      inspectConsumedOperation(input, preflight, blockers, warnings);
    }

    return assembleWithOutputScan({
      operation: operation,
      preflight: preflight,
      canonicalBinding: canonicalBinding,
      diagnostics: diagnostics,
      blockers: blockers,
      warnings: warnings,
      relatedSubjects: relatedSubjects,
      observedAtIso: observedAtIso
    });
  }

  H2O.Desktop.Sync.preflightLibraryBinding = preflightLibraryBinding;
  H2O.Desktop.Sync.__libraryBindingPreflightInstalled = true;
  H2O.Desktop.Sync.__libraryBindingPreflightVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
