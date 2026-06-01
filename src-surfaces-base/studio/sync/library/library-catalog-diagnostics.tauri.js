/* H2O Desktop Sync - F15.2.a read-only library catalog diagnostics
 *
 * Desktop/Tauri-only pure diagnostics for library.catalog canonical objects.
 *
 * Public API:
 *   H2O.Desktop.Sync.diagnoseLibraryCatalog(input) -> Promise<result>
 *   H2O.Desktop.Sync.__libraryCatalogDiagnosticsInstalled
 *   H2O.Desktop.Sync.__libraryCatalogDiagnosticsVersion
 *
 * Safety invariants:
 *   - Tauri only (bails on non-Tauri).
 *   - Read-only: no storage reads/writes, no mutations, no fetch, no timers,
 *     no publication, no relay/outbox, no apply, no Native/F5 execution,
 *     no watermark writes, and no consumed-operation writes.
 *   - Uses F15.1.a canonicalizer when only a raw row is supplied.
 *   - Uses the F15.1.0 library.catalog and library.binding privacy policies.
 *   - relatedSubjects are diagnostic-output only and are never written or
 *     included in canonical envelopes/revision hashes.
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
  if (H2O.Desktop.Sync.__libraryCatalogDiagnosticsInstalled) return;

  var VERSION = '0.1.0-f15.2.a';
  var RESULT_SCHEMA = 'h2o.desktop.sync.library-catalog-diagnostics.v1';
  var SUBJECT_TYPE = 'library.catalog';
  var BINDING_SUBJECT_TYPE = 'library.binding';
  var SHA256_RE = /^[0-9a-f]{64}$/;
  var ALLOWED_CATALOG_KINDS = ['label', 'tag', 'category'];
  var ALLOWED_LIFECYCLE_STATES = ['active', 'archived', 'retained', 'expired', 'tombstoned'];
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
    return typeof sync.canonicalizeLibraryCatalog === 'function'
      ? sync.canonicalizeLibraryCatalog
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
      canonicalCatalog: value.canonicalCatalog || null,
      blockers: blockers,
      warnings: warnings,
      relatedSubjects: asArray(value.relatedSubjects),
      sideEffectSummary: buildSideEffectSummary(),
      observedAtIso: value.observedAtIso || nowIsoSeconds()
    };
  }

  function canonicalFromResult(result) {
    if (!isObject(result)) return null;
    return isObject(result.canonicalCatalog)
      ? result.canonicalCatalog
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

  async function resolveCatalog(input, blockers, warnings, observedAtIso) {
    var source = isObject(input) ? input : {};
    if (isObject(source.canonicalCatalog)) {
      return {
        canonical: source.canonicalCatalog,
        sourceKind: 'canonicalCatalog',
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
      addBlocker(
        blockers,
        resultHasForbiddenFailure(result)
          ? 'library-catalog-row-contains-forbidden-field'
          : 'library-catalog-canonical-shape-invalid'
      );
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
        addBlocker(blockers, 'library-catalog-canonicalizer-unavailable');
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
        addBlocker(blockers, 'library-catalog-canonical-shape-invalid');
        return {
          canonical: null,
          sourceKind: 'row',
          canonicalizationOk: false,
          canonicalizerAvailable: true
        };
      }
      var rowCanonical = canonicalFromResult(canonicalizerResult);
      if (!canonicalizerResult || !canonicalizerResult.ok || !rowCanonical) {
        addBlocker(
          blockers,
          resultHasForbiddenFailure(canonicalizerResult)
            ? 'library-catalog-row-contains-forbidden-field'
            : 'library-catalog-canonical-shape-invalid'
        );
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

    addBlocker(blockers, 'library-catalog-canonical-shape-invalid');
    return {
      canonical: null,
      sourceKind: 'missing',
      canonicalizationOk: false,
      canonicalizerAvailable: !!getCanonicalizer()
    };
  }

  function bindingFromEntry(entry) {
    if (!isObject(entry)) return null;
    if (entry.subjectType === BINDING_SUBJECT_TYPE) return entry;
    if (isObject(entry.canonicalBinding)) return entry.canonicalBinding;
    if (isObject(entry.canonical)) return entry.canonical;
    if (isObject(entry.binding)) return entry.binding;
    if (isObject(entry.canonicalizerResult)) {
      if (isObject(entry.canonicalizerResult.canonicalBinding)) return entry.canonicalizerResult.canonicalBinding;
      if (isObject(entry.canonicalizerResult.canonical)) return entry.canonicalizerResult.canonical;
    }
    return null;
  }

  async function sha256(value) {
    var kernel = getKernel();
    if (kernel && typeof kernel.sha256Hex === 'function') {
      try { return await kernel.sha256Hex(value); } catch (_) { return ''; }
    }
    return '';
  }

  function relatedSubjectSort(a, b) {
    var rankDiff = (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0);
    if (rankDiff !== 0) return rankDiff;
    return String(b.observedAtIso || '').localeCompare(String(a.observedAtIso || ''));
  }

  function orphanCodeForLifecycle(lifecycleState) {
    return ORPHAN_CODES[lifecycleState] || null;
  }

  function isRelatedBinding(catalog, binding) {
    if (!catalog || !binding || binding.bindingState !== 'bound') return false;
    return binding.rightSubjectId === catalog.subjectId || binding.leftSubjectId === catalog.subjectId;
  }

  async function buildRelatedSubjects(catalog, input, observedAtIso, diagnostics, warnings, blockers) {
    var relation = orphanCodeForLifecycle(catalog && catalog.lifecycleState);
    var entries = [];
    if (!relation) return entries;

    var bindings = asArray(input && input.relatedBindings);
    for (var i = 0; i < bindings.length; i++) {
      var binding = bindingFromEntry(bindings[i]);
      if (!binding || !isRelatedBinding(catalog, binding) || !isSha256Hex(binding.subjectId)) continue;

      var relatedObservedAtIso = coarsenIsoToHour(observedAtIso) || observedAtIso;
      var evidenceDigest = await sha256({
        relationKind: 'orphans-binding',
        sourceSubjectType: SUBJECT_TYPE,
        sourceSubjectId: catalog.subjectId,
        targetSubjectType: BINDING_SUBJECT_TYPE,
        targetSubjectId: binding.subjectId,
        catalogLifecycleState: catalog.lifecycleState,
        bindingKind: cleanString(binding.bindingKind),
        bindingState: cleanString(binding.bindingState),
        diagnosticCode: relation.code,
        observedAtIso: relatedObservedAtIso
      });
      if (!isSha256Hex(evidenceDigest)) {
        addBlocker(blockers, 'library-catalog-canonical-shape-invalid');
        continue;
      }

      var entry = {
        relationKind: 'orphans-binding',
        sourceSubjectType: SUBJECT_TYPE,
        sourceSubjectId: catalog.subjectId,
        targetSubjectType: BINDING_SUBJECT_TYPE,
        targetSubjectId: binding.subjectId,
        impactKind: relation.severity === 'info' ? 'orphan-warning' : 'cleanup-suggested',
        severity: relation.severity,
        diagnosticCode: relation.code,
        evidenceDigest: evidenceDigest,
        observedAtIso: relatedObservedAtIso
      };

      var scan = scanDomain(BINDING_SUBJECT_TYPE, entry, 'redacted');
      if (!scan.ok) {
        addBlocker(blockers, 'library-catalog-row-contains-forbidden-field', {
          relatedSubjectIndex: i
        });
        continue;
      }
      entries.push(entry);
    }

    entries.sort(relatedSubjectSort);
    if (entries.length > 50) {
      var truncatedCount = entries.length - 50;
      entries = entries.slice(0, 50);
      addWarning(warnings, 'related-subjects-truncated', 'info', {
        truncatedCount: truncatedCount
      });
      addEntry(diagnostics.entries, 'related-subjects-truncated', 'info', {
        truncatedCount: truncatedCount
      });
    }
    if (entries.length > 0) {
      addEntry(diagnostics.entries, relation.code, relation.severity, {
        relatedSubjectCount: entries.length
      });
      if (relation.severity === 'warning') addWarning(warnings, relation.code, relation.severity);
    }
    return entries;
  }

  function validateCanonicalShape(catalog, diagnostics, blockers, warnings) {
    var hashFields = ['subjectId', 'revisionHash', 'nameHash', 'originAccountIdHash', 'sourceTagHash'];
    var hashShapeValid = true;
    for (var i = 0; i < hashFields.length; i++) {
      if (!isSha256Hex(catalog && catalog[hashFields[i]])) hashShapeValid = false;
    }
    var colorHashValid = catalog && (catalog.colorHash === null || isSha256Hex(catalog.colorHash));
    var catalogKindValid = !!(catalog && ALLOWED_CATALOG_KINDS.indexOf(catalog.catalogKind) !== -1);
    var lifecycleStateValid = !!(catalog && ALLOWED_LIFECYCLE_STATES.indexOf(catalog.lifecycleState) !== -1);
    var derivedFlagsConsistent = !!(catalog &&
      catalog.archived === (catalog.lifecycleState === 'archived') &&
      catalog.tombstoned === (catalog.lifecycleState === 'tombstoned'));
    var sourcePresent = !!(catalog && cleanString(catalog.sourceTag) && isSha256Hex(catalog.sourceTagHash));
    var archivedTimestampPresent = catalog && catalog.lifecycleState === 'archived'
      ? !!cleanString(catalog.archivedAtIso)
      : true;
    var retentionTimestampConsistent = true;
    if (catalog && (catalog.lifecycleState === 'retained' ||
        catalog.lifecycleState === 'expired' ||
        catalog.lifecycleState === 'tombstoned') &&
        catalog.retentionExpiresAtIso != null &&
        !coarsenIsoToHour(catalog.retentionExpiresAtIso)) {
      retentionTimestampConsistent = false;
    }

    diagnostics.catalogKindValid = catalogKindValid;
    diagnostics.hashShapeValid = hashShapeValid;
    diagnostics.colorHashValid = colorHashValid;
    diagnostics.lifecycleStateValid = lifecycleStateValid;
    diagnostics.derivedFlagsConsistent = derivedFlagsConsistent;
    diagnostics.archivedTimestampPresent = archivedTimestampPresent;
    diagnostics.retentionTimestampConsistent = retentionTimestampConsistent;
    diagnostics.sourceTagPresent = sourcePresent;

    if (!catalogKindValid ||
        !hashShapeValid ||
        !colorHashValid ||
        !lifecycleStateValid ||
        !derivedFlagsConsistent ||
        !sourcePresent) {
      addBlocker(blockers, 'library-catalog-canonical-shape-invalid');
    }
    if (!archivedTimestampPresent || !retentionTimestampConsistent) {
      addWarning(warnings, 'library-catalog-canonical-shape-invalid', 'warning');
      addEntry(diagnostics.entries, 'library-catalog-canonical-shape-invalid', 'warning');
    }
  }

  async function diagnoseLibraryCatalog(input) {
    var observedAtIso = observedAtFrom(input);
    var blockers = [];
    var warnings = [];
    var diagnostics = {
      canonicalizerAvailable: !!getCanonicalizer(),
      canonicalizationOk: false,
      canonicalShapeOk: false,
      privacyOk: false,
      sourceKind: 'unknown',
      catalogKindValid: false,
      hashShapeValid: false,
      colorHashValid: false,
      lifecycleStateValid: false,
      derivedFlagsConsistent: false,
      archivedTimestampPresent: true,
      retentionTimestampConsistent: true,
      sourceTagPresent: false,
      relatedBindingCount: asArray(input && input.relatedBindings).length,
      orphanRelatedSubjectCount: 0,
      entries: []
    };

    var resolved = await resolveCatalog(input, blockers, warnings, observedAtIso);
    diagnostics.canonicalizerAvailable = resolved.canonicalizerAvailable;
    diagnostics.canonicalizationOk = resolved.canonicalizationOk;
    diagnostics.sourceKind = resolved.sourceKind;
    var catalog = resolved.canonical;

    if (catalog) {
      validateCanonicalShape(catalog, diagnostics, blockers, warnings);

      var privacyScan = scanDomain(SUBJECT_TYPE, catalog, 'redacted');
      diagnostics.privacyOk = privacyScan.ok;
      if (!privacyScan.ok) {
        addBlocker(blockers, 'library-catalog-row-contains-forbidden-field', {
          hits: privacyScan.hits.slice(0, 8).join(',')
        });
      }
      diagnostics.canonicalShapeOk = diagnostics.catalogKindValid &&
        diagnostics.hashShapeValid &&
        diagnostics.colorHashValid &&
        diagnostics.lifecycleStateValid &&
        diagnostics.derivedFlagsConsistent &&
        diagnostics.sourceTagPresent;
    }

    var relatedSubjects = catalog
      ? await buildRelatedSubjects(catalog, input || {}, observedAtIso, diagnostics, warnings, blockers)
      : [];
    diagnostics.orphanRelatedSubjectCount = relatedSubjects.length;

    return buildResult({
      diagnostics: diagnostics,
      canonicalCatalog: catalog,
      blockers: blockers,
      warnings: warnings,
      relatedSubjects: relatedSubjects,
      observedAtIso: observedAtIso
    });
  }

  H2O.Desktop.Sync.diagnoseLibraryCatalog = diagnoseLibraryCatalog;
  H2O.Desktop.Sync.__libraryCatalogDiagnosticsInstalled = true;
  H2O.Desktop.Sync.__libraryCatalogDiagnosticsVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
