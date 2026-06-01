/* H2O Desktop Sync - F15.2.b read-only library binding diagnostics
 *
 * Desktop/Tauri-only pure diagnostics for library.binding canonical objects.
 *
 * Public API:
 *   H2O.Desktop.Sync.diagnoseLibraryBinding(input) -> Promise<result>
 *   H2O.Desktop.Sync.__libraryBindingDiagnosticsInstalled
 *   H2O.Desktop.Sync.__libraryBindingDiagnosticsVersion
 *
 * Safety invariants:
 *   - Tauri only (bails on non-Tauri).
 *   - Read-only: no storage reads/writes, no mutations, no fetch, no timers,
 *     no publication, no relay/outbox, no apply, no Native/F5 execution,
 *     no watermark writes, and no consumed-operation writes.
 *   - Uses F15.1.b canonicalizer when only a raw row is supplied.
 *   - Uses the F15.1.0 library.binding privacy policy.
 *   - Context diagnostics only use supplied relatedCatalogs, relatedChats,
 *     siblingBindings, and materializedCacheObservation. Missing context does
 *     not block unless the context is explicitly supplied and lacks the
 *     required endpoint.
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
  if (H2O.Desktop.Sync.__libraryBindingDiagnosticsInstalled) return;

  var VERSION = '0.1.0-f15.2.b';
  var RESULT_SCHEMA = 'h2o.desktop.sync.library-binding-diagnostics.v1';
  var SUBJECT_TYPE = 'library.binding';
  var CATALOG_SUBJECT_TYPE = 'library.catalog';
  var CHAT_SUBJECT_TYPE = 'chat.metadata';
  var SHA256_RE = /^[0-9a-f]{64}$/;
  var ALLOWED_BINDING_KINDS = ['chat-label', 'chat-tag', 'chat-category', 'tag-category'];
  var ALLOWED_BINDING_STATES = ['bound', 'unbound'];
  var ORPHAN_CODES = {
    archived: { code: 'binding-orphaned-catalog-archived', severity: 'info' },
    retained: { code: 'binding-orphaned-catalog-retained', severity: 'warning' },
    expired: { code: 'binding-orphaned-catalog-expired', severity: 'warning' },
    tombstoned: { code: 'binding-orphaned-catalog-tombstoned', severity: 'warning' }
  };
  var SEVERITY_RANK = { blocker: 3, warning: 2, info: 1 };

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

  function getKernel() {
    var sync = (H2O && H2O.Desktop && H2O.Desktop.Sync) || {};
    return sync.kernel || null;
  }

  function getCanonicalizer() {
    var sync = (H2O && H2O.Desktop && H2O.Desktop.Sync) || {};
    return typeof sync.canonicalizeLibraryBinding === 'function'
      ? sync.canonicalizeLibraryBinding
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
    var entry = {
      code: normalized,
      severity: sev
    };
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

  function buildResult(fields) {
    var value = isObject(fields) ? fields : {};
    var blockers = asArray(value.blockers);
    var warnings = asArray(value.warnings);
    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: blockers.length === 0,
      diagnostics: value.diagnostics || {},
      canonicalBinding: value.canonicalBinding || null,
      blockers: blockers,
      warnings: warnings,
      relatedSubjects: asArray(value.relatedSubjects),
      sideEffectSummary: buildSideEffectSummary(),
      observedAtIso: value.observedAtIso || nowIsoSeconds()
    };
  }

  function canonicalFromResult(result) {
    if (!isObject(result)) return null;
    return isObject(result.canonicalBinding)
      ? result.canonicalBinding
      : (isObject(result.canonical) ? result.canonical : null);
  }

  function resultHasForbiddenFailure(result) {
    if (!isObject(result)) return false;
    var codes = codeList(result.blockers);
    var reason = cleanString(result.quarantineReason);
    return reason === 'forbidden-field-detected' ||
      reason === 'forbidden-field-in-canonical' ||
      codes.indexOf('forbidden-field-detected') !== -1 ||
      codes.indexOf('forbidden-field-in-canonical') !== -1;
  }

  function resultHasDeferredBindingKind(result) {
    if (!isObject(result)) return false;
    var codes = codeList(result.blockers);
    var reason = cleanString(result.quarantineReason);
    return reason === 'binding-kind-deferred' || codes.indexOf('binding-kind-deferred') !== -1;
  }

  async function resolveBinding(input, blockers) {
    var source = isObject(input) ? input : {};
    if (isObject(source.canonicalBinding)) {
      return {
        canonical: source.canonicalBinding,
        sourceKind: 'canonicalBinding',
        canonicalizationOk: true,
        canonicalizerAvailable: !!getCanonicalizer()
      };
    }
    if (isObject(source.canonical)) {
      return {
        canonical: source.canonical,
        sourceKind: 'canonical',
        canonicalizationOk: true,
        canonicalizerAvailable: !!getCanonicalizer()
      };
    }
    if (isObject(source) && source.subjectType === SUBJECT_TYPE) {
      return {
        canonical: source,
        sourceKind: 'direct-canonical',
        canonicalizationOk: true,
        canonicalizerAvailable: !!getCanonicalizer()
      };
    }
    if (isObject(source.canonicalizerResult)) {
      var result = source.canonicalizerResult;
      var canonical = canonicalFromResult(result);
      if (result.ok && canonical) {
        return {
          canonical: canonical,
          sourceKind: 'canonicalizerResult',
          canonicalizationOk: true,
          canonicalizerAvailable: !!getCanonicalizer()
        };
      }
      if (resultHasDeferredBindingKind(result)) addBlocker(blockers, 'binding-kind-deferred');
      else {
        addBlocker(
          blockers,
          resultHasForbiddenFailure(result)
            ? 'library-binding-row-contains-forbidden-field'
            : 'library-binding-canonical-shape-invalid'
        );
      }
      return {
        canonical: null,
        sourceKind: 'canonicalizerResult',
        canonicalizationOk: false,
        canonicalizerAvailable: !!getCanonicalizer()
      };
    }
    if (isObject(source.row)) {
      var canonicalizer = getCanonicalizer();
      if (!canonicalizer) {
        addBlocker(blockers, 'library-binding-canonicalizer-unavailable');
        return {
          canonical: null,
          sourceKind: 'row',
          canonicalizationOk: false,
          canonicalizerAvailable: false
        };
      }
      var canonicalizerResult = null;
      try {
        canonicalizerResult = await canonicalizer(source.row);
      } catch (_) {
        addBlocker(blockers, 'library-binding-canonical-shape-invalid');
        return {
          canonical: null,
          sourceKind: 'row',
          canonicalizationOk: false,
          canonicalizerAvailable: true
        };
      }
      var rowCanonical = canonicalFromResult(canonicalizerResult);
      if (!canonicalizerResult || !canonicalizerResult.ok || !rowCanonical) {
        if (resultHasDeferredBindingKind(canonicalizerResult)) addBlocker(blockers, 'binding-kind-deferred');
        else {
          addBlocker(
            blockers,
            resultHasForbiddenFailure(canonicalizerResult)
              ? 'library-binding-row-contains-forbidden-field'
              : 'library-binding-canonical-shape-invalid'
          );
        }
        return {
          canonical: null,
          sourceKind: 'row',
          canonicalizationOk: false,
          canonicalizerAvailable: true
        };
      }
      return {
        canonical: rowCanonical,
        sourceKind: 'row',
        canonicalizationOk: true,
        canonicalizerAvailable: true
      };
    }

    addBlocker(blockers, 'library-binding-canonical-shape-invalid');
    return {
      canonical: null,
      sourceKind: 'missing',
      canonicalizationOk: false,
      canonicalizerAvailable: !!getCanonicalizer()
    };
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

  function supplied(input, key) {
    return isObject(input) && Object.prototype.hasOwnProperty.call(input, key);
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

  function orphanCodeForLifecycle(lifecycleState) {
    return ORPHAN_CODES[lifecycleState] || null;
  }

  async function sha256(value) {
    var kernel = getKernel();
    if (!kernel || typeof kernel.sha256Hex !== 'function') return '';
    try {
      if (typeof kernel.canonicalJSON === 'function') {
        return await kernel.sha256Hex(kernel.canonicalJSON(value));
      }
      return await kernel.sha256Hex(value);
    } catch (_) {
      return '';
    }
  }

  function relatedSubjectSort(a, b) {
    var rankDiff = (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0);
    if (rankDiff !== 0) return rankDiff;
    return String(b.observedAtIso || '').localeCompare(String(a.observedAtIso || ''));
  }

  async function buildRelatedSubject(fields, blockers, sourceIndex) {
    var entry = {
      relationKind: fields.relationKind,
      sourceSubjectType: fields.sourceSubjectType,
      sourceSubjectId: fields.sourceSubjectId,
      targetSubjectType: fields.targetSubjectType,
      targetSubjectId: fields.targetSubjectId,
      impactKind: fields.impactKind,
      severity: fields.severity,
      diagnosticCode: fields.diagnosticCode,
      evidenceDigest: '',
      observedAtIso: fields.observedAtIso
    };
    var digestInput = {
      relationKind: entry.relationKind,
      sourceSubjectType: entry.sourceSubjectType,
      sourceSubjectId: entry.sourceSubjectId,
      targetSubjectType: entry.targetSubjectType,
      targetSubjectId: entry.targetSubjectId,
      impactKind: entry.impactKind,
      severity: entry.severity,
      diagnosticCode: entry.diagnosticCode,
      observedAtIso: entry.observedAtIso
    };
    var digest = await sha256(digestInput);
    if (!isSha256Hex(digest)) {
      addBlocker(blockers, 'library-binding-canonical-shape-invalid');
      return null;
    }
    entry.evidenceDigest = digest;
    var scan = scanDomain(SUBJECT_TYPE, entry, 'redacted');
    if (!scan.ok) {
      addBlocker(blockers, 'library-binding-row-contains-forbidden-field', {
        relatedSubjectIndex: sourceIndex
      });
      return null;
    }
    return entry;
  }

  function expectedEndpointTypes(bindingKind) {
    if (bindingKind === 'chat-label' || bindingKind === 'chat-tag' || bindingKind === 'chat-category') {
      return { left: CHAT_SUBJECT_TYPE, right: CATALOG_SUBJECT_TYPE };
    }
    if (bindingKind === 'tag-category') {
      return { left: CATALOG_SUBJECT_TYPE, right: CATALOG_SUBJECT_TYPE };
    }
    return { left: '', right: '' };
  }

  function validateCanonicalShape(binding, diagnostics, blockers, warnings) {
    var hashFields = ['subjectId', 'revisionHash', 'leftSubjectId', 'rightSubjectId', 'originAccountIdHash', 'sourceTagHash'];
    var hashShapeValid = true;
    for (var i = 0; i < hashFields.length; i++) {
      if (!isSha256Hex(binding && binding[hashFields[i]])) hashShapeValid = false;
    }

    var bindingKindValid = !!(binding && ALLOWED_BINDING_KINDS.indexOf(binding.bindingKind) !== -1);
    if (binding && binding.bindingKind === 'chat-folder') {
      addBlocker(blockers, 'binding-kind-deferred');
    }
    var expected = expectedEndpointTypes(binding && binding.bindingKind);
    var endpointTypeConsistent = !!(bindingKindValid &&
      binding.leftSubjectType === expected.left &&
      binding.rightSubjectType === expected.right);
    var bindingStateValid = !!(binding && ALLOWED_BINDING_STATES.indexOf(binding.bindingState) !== -1);
    var boundTimestampPresent = binding && binding.bindingState === 'bound'
      ? !!cleanString(binding.boundAtIso)
      : true;
    var unboundTimestampPresent = binding && binding.bindingState === 'unbound'
      ? !!cleanString(binding.unboundAtIso)
      : true;
    var sourcePresent = !!(binding && cleanString(binding.sourceTag) && isSha256Hex(binding.sourceTagHash));

    diagnostics.bindingKindValid = bindingKindValid;
    diagnostics.hashShapeValid = hashShapeValid;
    diagnostics.endpointTypeConsistent = endpointTypeConsistent;
    diagnostics.bindingStateValid = bindingStateValid;
    diagnostics.boundTimestampPresent = boundTimestampPresent;
    diagnostics.unboundTimestampPresent = unboundTimestampPresent;
    diagnostics.sourceTagPresent = sourcePresent;

    if (!bindingKindValid ||
        !hashShapeValid ||
        !endpointTypeConsistent ||
        !bindingStateValid ||
        !boundTimestampPresent ||
        !unboundTimestampPresent ||
        !sourcePresent) {
      addBlocker(blockers, 'library-binding-canonical-shape-invalid');
    }
    if (!boundTimestampPresent || !unboundTimestampPresent) {
      addWarning(warnings, 'library-binding-canonical-shape-invalid', 'warning');
      addEntry(diagnostics.entries, 'library-binding-canonical-shape-invalid', 'warning');
    }
  }

  async function inspectCatalogContext(binding, input, observedAtIso, diagnostics, blockers, warnings, relatedSubjects) {
    if (!supplied(input, 'relatedCatalogs')) return;
    var catalogs = asArray(input.relatedCatalogs);
    var endpointIds = catalogEndpointIds(binding);
    diagnostics.relatedCatalogContextSupplied = true;
    diagnostics.relatedCatalogCount = catalogs.length;

    for (var i = 0; i < endpointIds.length; i++) {
      var endpointId = endpointIds[i];
      var catalog = findCatalog(catalogs, endpointId);
      if (!catalog) {
        addWarning(warnings, 'binding-endpoint-missing', 'warning');
        addEntry(diagnostics.entries, 'binding-endpoint-missing', 'warning');
        var missingEntry = await buildRelatedSubject({
          relationKind: 'binding-catalog-endpoint',
          sourceSubjectType: SUBJECT_TYPE,
          sourceSubjectId: binding.subjectId,
          targetSubjectType: CATALOG_SUBJECT_TYPE,
          targetSubjectId: endpointId,
          impactKind: 'endpoint-missing',
          severity: 'warning',
          diagnosticCode: 'binding-endpoint-missing',
          observedAtIso: observedAtIso
        }, blockers, i);
        if (missingEntry) relatedSubjects.push(missingEntry);
        continue;
      }

      if (catalog.lifecycleState === 'active') continue;
      var relation = orphanCodeForLifecycle(catalog.lifecycleState);
      if (!relation) continue;
      addEntry(diagnostics.entries, relation.code, relation.severity);
      if (relation.severity === 'warning') addWarning(warnings, relation.code, 'warning');
      else addWarning(warnings, relation.code, 'info');

      if (cleanString(input.diagnosticIntent) === 'bind') {
        addBlocker(blockers, 'binding-endpoint-not-active');
        addEntry(diagnostics.entries, 'binding-endpoint-not-active', 'blocker');
      }

      var entry = await buildRelatedSubject({
        relationKind: 'binding-catalog-endpoint',
        sourceSubjectType: SUBJECT_TYPE,
        sourceSubjectId: binding.subjectId,
        targetSubjectType: CATALOG_SUBJECT_TYPE,
        targetSubjectId: catalog.subjectId,
        impactKind: cleanString(input.diagnosticIntent) === 'bind' ? 'bind-blocked' : 'orphan-warning',
        severity: relation.severity,
        diagnosticCode: relation.code,
        observedAtIso: observedAtIso
      }, blockers, i);
      if (entry) relatedSubjects.push(entry);
    }
  }

  async function inspectChatContext(binding, input, observedAtIso, diagnostics, blockers, warnings, relatedSubjects) {
    if (!supplied(input, 'relatedChats')) return;
    var chatId = chatEndpointId(binding);
    if (!chatId) return;
    var chats = asArray(input.relatedChats);
    diagnostics.relatedChatContextSupplied = true;
    diagnostics.relatedChatCount = chats.length;
    if (findChat(chats, chatId)) return;

    addWarning(warnings, 'binding-chat-endpoint-missing', 'warning');
    addEntry(diagnostics.entries, 'binding-chat-endpoint-missing', 'warning');
    var entry = await buildRelatedSubject({
      relationKind: 'binding-chat-endpoint',
      sourceSubjectType: SUBJECT_TYPE,
      sourceSubjectId: binding.subjectId,
      targetSubjectType: CHAT_SUBJECT_TYPE,
      targetSubjectId: chatId,
      impactKind: 'endpoint-missing',
      severity: 'warning',
      diagnosticCode: 'binding-chat-endpoint-missing',
      observedAtIso: observedAtIso
    }, blockers, 0);
    if (entry) relatedSubjects.push(entry);
  }

  function isBoundSibling(binding) {
    return !!(binding &&
      binding.subjectType === SUBJECT_TYPE &&
      binding.bindingState === 'bound' &&
      isSha256Hex(binding.subjectId));
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

  async function inspectSiblingBindings(binding, input, observedAtIso, diagnostics, blockers, relatedSubjects) {
    if (!supplied(input, 'siblingBindings')) return;
    var siblings = asArray(input.siblingBindings);
    diagnostics.siblingBindingContextSupplied = true;
    diagnostics.siblingBindingCount = siblings.length;

    for (var i = 0; i < siblings.length; i++) {
      var sibling = bindingFromEntry(siblings[i]);
      if (!isBoundSibling(sibling)) continue;
      var code = duplicateCodeFor(binding, sibling);
      if (!code) continue;
      addBlocker(blockers, code);
      addEntry(diagnostics.entries, code, 'blocker');
      var entry = await buildRelatedSubject({
        relationKind: 'duplicate-binding',
        sourceSubjectType: SUBJECT_TYPE,
        sourceSubjectId: binding.subjectId,
        targetSubjectType: SUBJECT_TYPE,
        targetSubjectId: sibling.subjectId,
        impactKind: 'duplicate-binding-blocked',
        severity: 'blocker',
        diagnosticCode: code,
        observedAtIso: observedAtIso
      }, blockers, i);
      if (entry) relatedSubjects.push(entry);
    }
  }

  function isTruthy(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
  }

  function inspectCacheObservation(input, diagnostics, warnings) {
    if (!supplied(input, 'materializedCacheObservation')) return;
    var observation = isObject(input.materializedCacheObservation) ? input.materializedCacheObservation : {};
    diagnostics.materializedCacheObservationSupplied = true;
    var status = cleanString(observation.status).toLowerCase();
    var driftDetected = isTruthy(observation.driftDetected) ||
      isTruthy(observation.drift) ||
      isTruthy(observation.isDrifted) ||
      status === 'drift' ||
      status === 'drifted';
    var stale = isTruthy(observation.stale) ||
      isTruthy(observation.cacheStale) ||
      isTruthy(observation.categoryCacheStale) ||
      status === 'stale';

    diagnostics.materializedCacheDriftDetected = driftDetected;
    diagnostics.categoryCacheStale = stale;
    if (driftDetected) {
      addWarning(warnings, 'materialized-cache-drift-detected', 'warning');
      addEntry(diagnostics.entries, 'materialized-cache-drift-detected', 'warning');
    }
    if (stale) {
      addWarning(warnings, 'category-cache-stale', 'info');
      addEntry(diagnostics.entries, 'category-cache-stale', 'info');
    }
  }

  function finalizeRelatedSubjects(entries, diagnostics, warnings) {
    var relatedSubjects = asArray(entries).slice();
    relatedSubjects.sort(relatedSubjectSort);
    if (relatedSubjects.length > 50) {
      var truncatedCount = relatedSubjects.length - 50;
      relatedSubjects = relatedSubjects.slice(0, 50);
      addWarning(warnings, 'related-subjects-truncated', 'info', {
        truncatedCount: truncatedCount
      });
      addEntry(diagnostics.entries, 'related-subjects-truncated', 'info', {
        truncatedCount: truncatedCount
      });
    }
    return relatedSubjects;
  }

  async function diagnoseLibraryBinding(input) {
    var observedAtIso = observedAtFrom(input);
    var blockers = [];
    var warnings = [];
    var diagnostics = {
      canonicalizerAvailable: !!getCanonicalizer(),
      canonicalizationOk: false,
      canonicalShapeOk: false,
      privacyOk: false,
      sourceKind: 'unknown',
      bindingKindValid: false,
      endpointTypeConsistent: false,
      bindingStateValid: false,
      hashShapeValid: false,
      boundTimestampPresent: true,
      unboundTimestampPresent: true,
      sourceTagPresent: false,
      relatedCatalogContextSupplied: false,
      relatedCatalogCount: 0,
      relatedChatContextSupplied: false,
      relatedChatCount: 0,
      siblingBindingContextSupplied: false,
      siblingBindingCount: 0,
      materializedCacheObservationSupplied: false,
      materializedCacheDriftDetected: false,
      categoryCacheStale: false,
      relatedSubjectCount: 0,
      entries: []
    };

    var resolved = await resolveBinding(input, blockers);
    diagnostics.canonicalizerAvailable = resolved.canonicalizerAvailable;
    diagnostics.canonicalizationOk = resolved.canonicalizationOk;
    diagnostics.sourceKind = resolved.sourceKind;
    var binding = resolved.canonical;
    var canonicalForOutput = binding;
    var relatedSubjects = [];

    if (binding) {
      validateCanonicalShape(binding, diagnostics, blockers, warnings);

      var privacyScan = scanDomain(SUBJECT_TYPE, binding, 'redacted');
      diagnostics.privacyOk = privacyScan.ok;
      if (!privacyScan.ok) {
        addBlocker(blockers, 'library-binding-row-contains-forbidden-field');
        canonicalForOutput = null;
      }

      diagnostics.canonicalShapeOk = diagnostics.bindingKindValid &&
        diagnostics.hashShapeValid &&
        diagnostics.endpointTypeConsistent &&
        diagnostics.bindingStateValid &&
        diagnostics.boundTimestampPresent &&
        diagnostics.unboundTimestampPresent &&
        diagnostics.sourceTagPresent;

      await inspectCatalogContext(binding, input || {}, observedAtIso, diagnostics, blockers, warnings, relatedSubjects);
      await inspectChatContext(binding, input || {}, observedAtIso, diagnostics, blockers, warnings, relatedSubjects);
      await inspectSiblingBindings(binding, input || {}, observedAtIso, diagnostics, blockers, relatedSubjects);
      inspectCacheObservation(input || {}, diagnostics, warnings);

      if (blockers.length === 0 &&
          warnings.filter(function (warning) { return warning && warning.severity !== 'info'; }).length === 0) {
        addEntry(diagnostics.entries, 'binding-ok', 'info');
      }
    }

    relatedSubjects = finalizeRelatedSubjects(relatedSubjects, diagnostics, warnings);
    diagnostics.relatedSubjectCount = relatedSubjects.length;

    return buildResult({
      diagnostics: diagnostics,
      canonicalBinding: canonicalForOutput,
      blockers: blockers,
      warnings: warnings,
      relatedSubjects: relatedSubjects,
      observedAtIso: observedAtIso
    });
  }

  H2O.Desktop.Sync.diagnoseLibraryBinding = diagnoseLibraryBinding;
  H2O.Desktop.Sync.__libraryBindingDiagnosticsInstalled = true;
  H2O.Desktop.Sync.__libraryBindingDiagnosticsVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
