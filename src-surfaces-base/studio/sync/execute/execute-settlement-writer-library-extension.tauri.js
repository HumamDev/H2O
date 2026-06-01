/* H2O Desktop Sync - F15.8.c library execute settlement writer extension
 *
 * Library-domain extension for Execute Lane settlement. This module handles
 * library.catalog and library.binding envelopes shaped by F15.8.a / F15.8.b.
 *
 * Safety invariants:
 *   - Settlement only after a confirmed apply/dispatch result.
 *   - No Native call, no F5 action, no relay/outbox, no cache refresh, no
 *     store shim, and no bulk migration. F15.8.f supplies the real SQLite
 *     writer identity sentinel used by protected store/cache writes.
 *   - Ordered settlement chain: consumed operation -> watermark -> library
 *     bookkeeping mirror -> optional publication terminal -> optional journal.
 */
(function (global) {
  'use strict';

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
      if (global.H2O && global.H2O.Studio && global.H2O.Studio.platform &&
          global.H2O.Studio.platform.env && global.H2O.Studio.platform.env.isTauri === true) return true;
    } catch (_) { /* ignore */ }
    return false;
  }
  if (!detectTauri()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Desktop = H2O.Desktop || {};
  H2O.Desktop.Sync = H2O.Desktop.Sync || {};
  if (H2O.Desktop.Sync.__libraryExecuteSettlementInstalled) return;

  var VERSION = '0.1.0-f15.8.settlement';
  var RESULT_SCHEMA = 'h2o.desktop.sync.library-execute-settlement.v1';
  var ENVELOPE_SCHEMA = 'h2o.desktop.sync.execute-envelope.v1';
  var CATALOG_DOMAIN = 'library.catalog';
  var BINDING_DOMAIN = 'library.binding';
  var CATALOG_RECEIPT_SCHEMA = 'h2o.desktop.sync.library-catalog-apply-event-receipt.v1';
  var BINDING_RECEIPT_SCHEMA = 'h2o.desktop.sync.library-binding-apply-event-receipt.v1';
  var CATALOG_ADAPTER_VERSION = '0.1.0-f15.8.catalog';
  var BINDING_ADAPTER_VERSION = '0.1.0-f15.8.binding';
  var SHA256_RE = /^[0-9a-f]{64}$/;
  var SIDE_EFFECT_KEYS = [
    'consumedOperationWritten',
    'watermarkWritten',
    'bookkeepingWritten',
    'publicationTouched',
    'applyExecuted',
    'nativeCalled',
    'f5Touched',
    'relayTouched',
    'outboxTouched',
    'executeJournalTouched',
    'catalogMutated',
    'bindingMutated',
    'libraryBookkeepingMirrored',
    'sqliteSentinelUsed',
    'storeShimRouted'
  ];

  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function safeObject(value) { return isObject(value) ? value : {}; }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function cleanString(value) { return String(value == null ? '' : value).trim(); }
  function cleanLower(value) { return cleanString(value).toLowerCase(); }
  function nowIsoSeconds() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
  function isSha256Hex(value) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.isSha256Hex === 'function') {
      try { return !!kernel.isSha256Hex(value); } catch (_) { /* fall through */ }
    }
    return SHA256_RE.test(cleanLower(value));
  }
  function isIso(value) {
    var text = cleanString(value);
    return !!text && Number.isFinite(Date.parse(text));
  }
  function addCode(list, code) {
    var n = cleanString(code);
    if (!n || list.indexOf(n) !== -1) return;
    list.push(n);
  }
  function codeList(value) {
    return asArray(value).map(function (item) {
      return isObject(item) ? cleanString(item.code) : cleanString(item);
    }).filter(Boolean).filter(function (code, index, list) {
      return list.indexOf(code) === index;
    });
  }
  function mergeCodes(into, value) {
    codeList(value).forEach(function (code) { addCode(into, code); });
  }
  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!isObject(value)) return value;
    var out = {};
    Object.keys(value).sort().forEach(function (key) {
      if (typeof value[key] !== 'undefined') out[key] = canonicalize(value[key]);
    });
    return out;
  }
  function canonicalJson(value) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.canonicalJSON === 'function') {
      try { return kernel.canonicalJSON(value); } catch (_) { /* fall through */ }
    }
    return JSON.stringify(canonicalize(value));
  }
  function bytesToHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      var part = bytes[i].toString(16);
      hex += part.length === 1 ? '0' + part : part;
    }
    return hex;
  }
  function webCryptoAvailable() {
    try { return !!(global.crypto && global.crypto.subtle && global.crypto.subtle.digest); }
    catch (_) { return false; }
  }
  async function sha256Hex(value) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.sha256Hex === 'function') {
      try {
        var digest = await kernel.sha256Hex(value);
        if (isSha256Hex(digest)) return cleanLower(digest);
      } catch (_) { /* fall through */ }
    }
    if (!webCryptoAvailable()) return '';
    var text = typeof value === 'string' ? value : canonicalJson(value);
    var data = new TextEncoder().encode(text);
    var buffer = await global.crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(buffer));
  }
  function generateUuid(prefix) {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
    } catch (_) { /* fall through */ }
    return cleanString(prefix || 'library-settlement') + '-' + Math.random().toString(16).slice(2) + '-' + Date.now();
  }

  function defaultSideEffects(flags) {
    var f = safeObject(flags);
    var out = {};
    SIDE_EFFECT_KEYS.forEach(function (key) { out[key] = f[key] === true; });
    out.nativeCalled = false;
    out.f5Touched = false;
    out.relayTouched = false;
    out.outboxTouched = false;
    out.sqliteSentinelUsed = f.sqliteSentinelUsed === true;
    out.storeShimRouted = false;
    return out;
  }
  function absorbSideEffects(target, summary) {
    var source = safeObject(summary);
    SIDE_EFFECT_KEYS.forEach(function (key) {
      if (source[key] === true) target[key] = true;
    });
    target.nativeCalled = false;
    target.f5Touched = false;
    target.relayTouched = false;
    target.outboxTouched = false;
    if (source.sqliteSentinelUsed === true) target.sqliteSentinelUsed = true;
    target.storeShimRouted = false;
  }
  function buildResult(opts) {
    var o = safeObject(opts);
    var blockers = codeList(o.blockers);
    var warnings = codeList(o.warnings);
    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: blockers.length === 0 && o.ok !== false,
      settled: o.settled === true,
      domainId: cleanString(o.domainId),
      operationKind: cleanString(o.operationKind),
      envelope: o.envelope || null,
      consumedOperationResult: o.consumedOperationResult || null,
      watermarkResult: o.watermarkResult || null,
      bookkeepingResult: o.bookkeepingResult || null,
      publicationResult: o.publicationResult || null,
      journalResult: o.journalResult || null,
      settlementDigest: cleanLower(o.settlementDigest),
      blockers: blockers,
      warnings: warnings,
      sideEffectSummary: defaultSideEffects(o.sideEffectSummary),
      observedAtIso: cleanString(o.observedAtIso) || nowIsoSeconds()
    };
  }
  function failure(blockers, warnings, extra) {
    return buildResult(Object.assign({}, safeObject(extra), {
      ok: false,
      settled: false,
      blockers: blockers,
      warnings: warnings
    }));
  }
  function stepResult(ok, opts) {
    var o = safeObject(opts);
    return Object.assign({
      ok: ok === true,
      blockers: [],
      warnings: [],
      sideEffectSummary: defaultSideEffects(o.sideEffectSummary)
    }, o);
  }

  function resolveArgs(input, dispatchResultMaybe, optionsMaybe) {
    var direct = isObject(input) && cleanString(input.schema) === ENVELOPE_SCHEMA;
    var source = direct ? {} : safeObject(input);
    var options = safeObject(optionsMaybe);
    return Object.assign({}, source, options, {
      envelope: direct ? input : (source.envelope || source.executeEnvelope || safeObject(source.adapterResult).envelope || null),
      dispatchResult: dispatchResultMaybe || source.dispatchResult || source.nativeResult || source.operationResult || source.dispatch || null,
      receipt: source.receipt || source.applyEventReceipt || safeObject(source.bookkeepingResult).receipt ||
        safeObject(source.adapterResult).receipt || options.receipt || options.applyEventReceipt ||
        safeObject(options.bookkeepingResult).receipt || safeObject(options.adapterResult).receipt || null,
      observedAtIso: cleanString(source.observedAtIso || options.observedAtIso) || nowIsoSeconds()
    });
  }
  function dispatchIndicatesApplySuccess(dispatchResult) {
    var d = safeObject(dispatchResult);
    var nativeResult = safeObject(d.nativeResult || d.operationResult);
    if (d.ok === false || nativeResult.ok === false) return false;
    return d.confirmed === true || d.applied === true || d.executed === true ||
      d.success === true || nativeResult.applied === true || nativeResult.executed === true ||
      nativeResult.success === true;
  }
  function actorPeerFromEnvelope(envelope) {
    var peer = safeObject(envelope && envelope.actorPeer);
    if (isSha256Hex(peer.syncPeerIdHash) && isSha256Hex(peer.physicalDeviceIdHash) &&
        isSha256Hex(peer.installIdHash)) {
      return {
        physicalDeviceIdHash: cleanLower(peer.physicalDeviceIdHash),
        installIdHash: cleanLower(peer.installIdHash),
        syncPeerIdHash: cleanLower(peer.syncPeerIdHash),
        surfaceKind: cleanString(peer.surfaceKind) || 'desktop-tauri'
      };
    }
    return null;
  }
  function revisionHashFor(envelope) {
    var settlement = safeObject(envelope && envelope.settlementShapes);
    var candidates = [
      settlement.revisionHash,
      settlement.postStateHash,
      safeObject(settlement.watermark).revisionHash,
      settlement.settlementDigest,
      envelope && envelope.eventDigest
    ];
    for (var i = 0; i < candidates.length; i++) {
      var candidate = cleanLower(candidates[i]);
      if (isSha256Hex(candidate)) return candidate;
    }
    return '';
  }
  function privacyTag(domainId) {
    if (domainId === CATALOG_DOMAIN) return CATALOG_DOMAIN;
    if (domainId === BINDING_DOMAIN) return BINDING_DOMAIN;
    return cleanString(domainId);
  }
  function scanPrivacy(domainId, target, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (!kernel || typeof kernel.scanDomainForbiddenFields !== 'function') {
      addCode(warnings, 'library-execute-settlement-context-incomplete');
      return true;
    }
    try {
      var scan = kernel.scanDomainForbiddenFields(privacyTag(domainId), target);
      mergeCodes(blockers, scan && scan.blockers);
      mergeCodes(warnings, scan && scan.warnings);
      if (!scan || scan.ok !== true) {
        addCode(blockers, 'library-execute-settlement-privacy-failed');
        return false;
      }
      return true;
    } catch (_) {
      addCode(blockers, 'library-execute-settlement-privacy-failed');
      return false;
    }
  }

  function validateLibraryExecuteEnvelope(envelope, blockers, warnings) {
    var e = safeObject(envelope);
    if (e.schema !== ENVELOPE_SCHEMA) addCode(blockers, 'library-execute-settlement-envelope-invalid');
    if (e.domainId !== CATALOG_DOMAIN && e.domainId !== BINDING_DOMAIN) {
      addCode(blockers, 'library-execute-settlement-domain-not-supported');
    }
    var expectedVersion = e.domainId === CATALOG_DOMAIN ? CATALOG_ADAPTER_VERSION : BINDING_ADAPTER_VERSION;
    if (cleanString(e.version) !== expectedVersion) addCode(blockers, 'library-execute-settlement-envelope-invalid');
    if (e.envelopeKind !== 'proposal-receipt') addCode(blockers, 'library-execute-settlement-envelope-invalid');
    if (!isSha256Hex(e.receiptDigest)) addCode(blockers, 'library-execute-settlement-receipt-digest-invalid');
    if (!isSha256Hex(e.eventDigest)) addCode(blockers, 'library-execute-settlement-event-digest-invalid');
    if (!isSha256Hex(e.dedupeKey)) addCode(blockers, 'library-execute-settlement-dedupe-key-invalid');
    if (!isSha256Hex(e.subjectId)) addCode(blockers, 'library-execute-settlement-subject-invalid');
    if (!isSha256Hex(e.lineageId)) addCode(blockers, 'library-execute-settlement-lineage-invalid');
    if (!isIso(e.createdAtIso || e.observedAtIso)) addCode(blockers, 'library-execute-settlement-envelope-invalid');
    var settlement = safeObject(e.settlementShapes);
    if (!isObject(e.settlementShapes) || !isSha256Hex(settlement.settlementDigest)) {
      addCode(blockers, 'library-execute-settlement-settlement-shapes-invalid');
    }
    if (cleanLower(settlement.receiptDigest) && cleanLower(settlement.receiptDigest) !== cleanLower(e.receiptDigest)) {
      addCode(blockers, 'library-execute-settlement-settlement-shapes-invalid');
    }
    var payloadReceipt = safeObject(safeObject(e.payloadShapes).proposalReceipt);
    if (!isObject(payloadReceipt)) addCode(blockers, 'library-execute-settlement-envelope-invalid');
    if (cleanLower(payloadReceipt.receiptDigest) && cleanLower(payloadReceipt.receiptDigest) !== cleanLower(e.receiptDigest)) {
      addCode(blockers, 'library-execute-settlement-receipt-digest-invalid');
    }
    if (e.domainId === CATALOG_DOMAIN && cleanString(payloadReceipt.schema) !== 'h2o.desktop.sync.library-catalog-execute-proposal-receipt.v1') {
      addCode(blockers, 'library-execute-settlement-envelope-invalid');
    }
    if (e.domainId === BINDING_DOMAIN && cleanString(payloadReceipt.schema) !== 'h2o.desktop.sync.library-binding-execute-proposal-receipt.v1') {
      addCode(blockers, 'library-execute-settlement-envelope-invalid');
    }
    if (!isSha256Hex(revisionHashFor(e))) addCode(blockers, 'library-execute-settlement-settlement-shapes-invalid');
    scanPrivacy(e.domainId, {
      envelope: e,
      settlementShapes: settlement,
      payloadShapes: safeObject(e.payloadShapes)
    }, blockers, warnings);
    return blockers.length === 0;
  }

  async function withWriterIdentity(identity, fn) {
    if (typeof H2O.Desktop.Sync.withSQLiteWriterIdentity === 'function') {
      return await H2O.Desktop.Sync.withSQLiteWriterIdentity(identity, fn);
    }
    return await fn({ identity: identity });
  }

  function consumedInputFromEnvelope(envelope, observedAtIso) {
    var peer = actorPeerFromEnvelope(envelope);
    return {
      eventDigest: cleanLower(envelope.eventDigest),
      dedupeKey: cleanLower(envelope.dedupeKey),
      lineageId: cleanLower(envelope.lineageId),
      subjectId: cleanLower(envelope.subjectId),
      sourcePeerId: peer ? cleanLower(peer.syncPeerIdHash) : '',
      envelopeKind: 'proposal',
      operationKind: cleanString(envelope.operationKind),
      consumedStatus: 'consumed',
      consumedAtIso: observedAtIso,
      actorPeer: peer || {},
      reason: 'library-execute-settlement-confirmed-apply',
      validationSummary: {
        ok: true,
        domainId: cleanString(envelope.domainId),
        settlementDigest: cleanLower(safeObject(envelope.settlementShapes).settlementDigest),
        sqliteSentinelUsed: true
      }
    };
  }
  async function writeLibraryConsumedOperationForDomain(domainId, input) {
    var args = safeObject(input);
    var envelope = safeObject(args.envelope);
    var warnings = [];
    var blockers = [];
    var observedAtIso = cleanString(args.observedAtIso) || nowIsoSeconds();
    if (envelope.domainId !== domainId) addCode(blockers, 'library-execute-settlement-domain-not-supported');
    var rowInput = consumedInputFromEnvelope(envelope, observedAtIso);
    scanPrivacy(domainId, rowInput, blockers, warnings);
    if (blockers.length) return stepResult(false, {
      step: 'consumed-operation',
      blockers: blockers,
      warnings: warnings
    });
    var rows = asArray(args.__consumedRows);
    if (Array.isArray(args.__consumedRows)) {
      var existing = rows.filter(function (row) {
        return cleanLower(row.eventDigest) === rowInput.eventDigest &&
          cleanLower(row.dedupeKey) === rowInput.dedupeKey;
      })[0];
      if (existing) return stepResult(true, {
        step: 'consumed-operation',
        written: false,
        idempotent: true,
        row: existing,
        warnings: warnings,
        sideEffectSummary: { consumedOperationWritten: true }
      });
      var memoryRow = Object.assign({
        schema: 'h2o.desktop.sync.consumed-operation-ledger-row.v1',
        consumedId: generateUuid('library-consumed')
      }, rowInput);
      rows.push(memoryRow);
      return stepResult(true, {
        step: 'consumed-operation',
        written: true,
        row: memoryRow,
        warnings: warnings,
        sideEffectSummary: { consumedOperationWritten: true }
      });
    }
    var listFn = args.listConsumedOperations || H2O.Desktop.Sync.listConsumedOperations;
    if (typeof listFn === 'function') {
      try {
        var list = await listFn();
        var found = asArray(list && list.rows).filter(function (row) {
          return cleanLower(row.eventDigest) === rowInput.eventDigest &&
            cleanLower(row.dedupeKey) === rowInput.dedupeKey;
        })[0];
        if (found) return stepResult(true, {
          step: 'consumed-operation',
          written: false,
          idempotent: true,
          row: found,
          warnings: warnings,
          sideEffectSummary: { consumedOperationWritten: true }
        });
      } catch (_) { /* ignore and try write */ }
    }
    var recordFn = args.recordConsumedOperation || H2O.Desktop.Sync.recordConsumedOperation;
    if (typeof recordFn !== 'function') {
      return stepResult(false, {
        step: 'consumed-operation',
        blockers: ['library-execute-settlement-consumed-op-failed'],
        warnings: warnings.concat(['library-execute-settlement-context-incomplete'])
      });
    }
    try {
      var recorded = await recordFn(rowInput);
      mergeCodes(blockers, recorded && recorded.blockers);
      mergeCodes(warnings, recorded && recorded.warnings);
      if (recorded && recorded.ok === true) {
        return stepResult(true, {
          step: 'consumed-operation',
          written: recorded.appended !== false,
          row: recorded.row || null,
          warnings: warnings,
          sideEffectSummary: { consumedOperationWritten: true }
        });
      }
      if (codeList(recorded && recorded.blockers).indexOf('duplicate-consumed-operation') !== -1) {
        return stepResult(true, {
          step: 'consumed-operation',
          written: false,
          idempotent: true,
          row: recorded && recorded.row || null,
          warnings: warnings.concat(['duplicate-consumed-operation']),
          sideEffectSummary: { consumedOperationWritten: true }
        });
      }
    } catch (_) {
      addCode(blockers, 'library-execute-settlement-consumed-op-failed');
    }
    addCode(blockers, 'library-execute-settlement-consumed-op-failed');
    return stepResult(false, { step: 'consumed-operation', blockers: blockers, warnings: warnings });
  }
  async function writeLibraryCatalogConsumedOperation(input) {
    return await writeLibraryConsumedOperationForDomain(CATALOG_DOMAIN, input);
  }
  async function writeLibraryBindingConsumedOperation(input) {
    return await writeLibraryConsumedOperationForDomain(BINDING_DOMAIN, input);
  }

  function watermarkInputFromEnvelope(envelope, observedAtIso) {
    var peer = actorPeerFromEnvelope(envelope);
    return {
      peerId: peer ? cleanLower(peer.syncPeerIdHash) : '',
      subjectId: cleanLower(envelope.subjectId),
      lineageId: cleanLower(envelope.lineageId),
      revisionHash: revisionHashFor(envelope),
      watermarkAtIso: observedAtIso
    };
  }
  async function advanceLibraryWatermarkForDomain(domainId, input) {
    var args = safeObject(input);
    var envelope = safeObject(args.envelope);
    var warnings = [];
    var blockers = [];
    var observedAtIso = cleanString(args.observedAtIso) || nowIsoSeconds();
    if (envelope.domainId !== domainId) addCode(blockers, 'library-execute-settlement-domain-not-supported');
    var rowInput = watermarkInputFromEnvelope(envelope, observedAtIso);
    scanPrivacy(domainId, rowInput, blockers, warnings);
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.validateWatermarkValue === 'function') {
      try {
        var validation = kernel.validateWatermarkValue(rowInput, 'proposed');
        mergeCodes(blockers, validation && validation.blockers);
        mergeCodes(warnings, validation && validation.warnings);
      } catch (_) { /* local validation below */ }
    }
    if (!isSha256Hex(rowInput.peerId) || !isSha256Hex(rowInput.subjectId) ||
        !isSha256Hex(rowInput.lineageId) || !isSha256Hex(rowInput.revisionHash)) {
      addCode(blockers, 'library-execute-settlement-watermark-failed');
    }
    if (blockers.length) return stepResult(false, { step: 'watermark', blockers: blockers, warnings: warnings });
    if (Array.isArray(args.__watermarkRows)) {
      var existing = args.__watermarkRows.filter(function (row) {
        return cleanLower(row.peerId) === rowInput.peerId &&
          cleanLower(row.subjectId) === rowInput.subjectId &&
          cleanLower(row.lineageId) === rowInput.lineageId &&
          cleanLower(row.revisionHash) === rowInput.revisionHash;
      })[0];
      if (existing) return stepResult(true, {
        step: 'watermark',
        written: false,
        idempotent: true,
        row: existing,
        warnings: warnings,
        sideEffectSummary: { watermarkWritten: true }
      });
      var row = Object.assign({
        schema: 'h2o.desktop.sync.convergence-watermark-row.v1',
        watermarkId: generateUuid('library-watermark'),
        recordedAtIso: observedAtIso,
        dedupeKey: await sha256Hex(rowInput)
      }, rowInput);
      args.__watermarkRows.push(row);
      return stepResult(true, {
        step: 'watermark',
        written: true,
        row: row,
        warnings: warnings,
        sideEffectSummary: { watermarkWritten: true }
      });
    }
    var listFn = args.getConvergenceWatermarks || H2O.Desktop.Sync.getConvergenceWatermarks;
    if (typeof listFn === 'function') {
      try {
        var list = await listFn();
        var found = asArray(list && list.rows).filter(function (row) {
          return cleanLower(row.peerId) === rowInput.peerId &&
            cleanLower(row.subjectId) === rowInput.subjectId &&
            cleanLower(row.lineageId) === rowInput.lineageId &&
            cleanLower(row.revisionHash) === rowInput.revisionHash;
        })[0];
        if (found) return stepResult(true, {
          step: 'watermark',
          written: false,
          idempotent: true,
          row: found,
          warnings: warnings,
          sideEffectSummary: { watermarkWritten: true }
        });
      } catch (_) { /* ignore and try write */ }
    }
    var recordFn = args.recordConvergenceWatermark || H2O.Desktop.Sync.recordConvergenceWatermark;
    if (typeof recordFn !== 'function') {
      return stepResult(false, {
        step: 'watermark',
        blockers: ['library-execute-settlement-watermark-failed'],
        warnings: warnings.concat(['library-execute-settlement-context-incomplete'])
      });
    }
    try {
      var recorded = await recordFn(rowInput);
      mergeCodes(blockers, recorded && recorded.blockers);
      mergeCodes(warnings, recorded && recorded.warnings);
      if (recorded && recorded.ok === true) {
        return stepResult(true, {
          step: 'watermark',
          written: recorded.appended !== false,
          row: recorded.row || null,
          warnings: warnings,
          sideEffectSummary: { watermarkWritten: true }
        });
      }
      if (codeList(recorded && recorded.blockers).indexOf('duplicate-convergence-watermark') !== -1) {
        return stepResult(true, {
          step: 'watermark',
          written: false,
          idempotent: true,
          row: recorded && recorded.row || null,
          warnings: warnings.concat(['duplicate-convergence-watermark']),
          sideEffectSummary: { watermarkWritten: true }
        });
      }
    } catch (_) {
      addCode(blockers, 'library-execute-settlement-watermark-failed');
    }
    addCode(blockers, 'library-execute-settlement-watermark-failed');
    return stepResult(false, { step: 'watermark', blockers: blockers, warnings: warnings });
  }
  async function advanceLibraryCatalogWatermark(input) {
    return await advanceLibraryWatermarkForDomain(CATALOG_DOMAIN, input);
  }
  async function advanceLibraryBindingWatermark(input) {
    return await advanceLibraryWatermarkForDomain(BINDING_DOMAIN, input);
  }

  function resolveReceipt(args) {
    var source = safeObject(args);
    if (isObject(source.receipt)) return source.receipt;
    if (isObject(source.applyEventReceipt)) return source.applyEventReceipt;
    if (isObject(source.bookkeepingResult) && isObject(source.bookkeepingResult.receipt)) return source.bookkeepingResult.receipt;
    if (isObject(source.adapterResult) && isObject(source.adapterResult.receipt)) return source.adapterResult.receipt;
    return null;
  }
  async function appendLibraryBookkeepingForDomain(domainId, input) {
    var args = safeObject(input);
    var envelope = safeObject(args.envelope);
    var warnings = [];
    var blockers = [];
    var receipt = resolveReceipt(args);
    if (envelope.domainId !== domainId) addCode(blockers, 'library-execute-settlement-domain-not-supported');
    if (!receipt) {
      addCode(blockers, 'library-execute-settlement-bookkeeping-mirror-failed');
      addCode(warnings, 'library-execute-settlement-context-incomplete');
      return stepResult(false, { step: 'bookkeeping', blockers: blockers, warnings: warnings });
    }
    var expectedSchema = domainId === CATALOG_DOMAIN ? CATALOG_RECEIPT_SCHEMA : BINDING_RECEIPT_SCHEMA;
    if (cleanString(receipt.schema) !== expectedSchema) {
      addCode(blockers, 'library-execute-settlement-bookkeeping-mirror-failed');
      return stepResult(false, { step: 'bookkeeping', blockers: blockers, warnings: warnings });
    }
    scanPrivacy(domainId, receipt, blockers, warnings);
    if (blockers.length) return stepResult(false, { step: 'bookkeeping', blockers: blockers, warnings: warnings });
    var recordFn = domainId === CATALOG_DOMAIN
      ? (args.recordLibraryCatalogBookkeeping || H2O.Desktop.Sync.recordLibraryCatalogBookkeeping)
      : (args.recordLibraryBindingBookkeeping || H2O.Desktop.Sync.recordLibraryBindingBookkeeping);
    if (typeof recordFn !== 'function') {
      addCode(blockers, 'library-execute-settlement-bookkeeping-mirror-failed');
      addCode(warnings, 'library-execute-settlement-context-incomplete');
      return stepResult(false, { step: 'bookkeeping', blockers: blockers, warnings: warnings });
    }
    try {
      var result = await recordFn({
        receipt: receipt,
        observedAtIso: cleanString(args.observedAtIso) || nowIsoSeconds(),
        recordedAtIso: cleanString(args.observedAtIso) || nowIsoSeconds()
      });
      mergeCodes(blockers, result && result.blockers);
      mergeCodes(warnings, result && result.warnings);
      if (result && result.ok === true) {
        return stepResult(true, {
          step: 'bookkeeping',
          mirrored: true,
          idempotent: result.alreadyPresent === true,
          result: result,
          row: result.row || null,
          warnings: warnings,
          sideEffectSummary: {
            bookkeepingWritten: true,
            libraryBookkeepingMirrored: true
          }
        });
      }
    } catch (_) {
      addCode(blockers, 'library-execute-settlement-bookkeeping-mirror-failed');
    }
    addCode(blockers, 'library-execute-settlement-bookkeeping-mirror-failed');
    return stepResult(false, { step: 'bookkeeping', blockers: blockers, warnings: warnings });
  }
  async function appendLibraryCatalogBookkeeping(input) {
    return await appendLibraryBookkeepingForDomain(CATALOG_DOMAIN, input);
  }
  async function appendLibraryBindingBookkeeping(input) {
    return await appendLibraryBookkeepingForDomain(BINDING_DOMAIN, input);
  }

  async function finalizePublication(input) {
    var args = safeObject(input);
    var envelope = safeObject(args.envelope);
    var dispatchResult = safeObject(args.dispatchResult);
    var warnings = [];
    var blockers = [];
    var publicationId = cleanString(args.publicationId || safeObject(dispatchResult.publicationRow).publicationId);
    var transitionFn = args.transitionExecutePublicationRow || H2O.Desktop.Sync.transitionExecutePublicationRow;
    if (typeof transitionFn !== 'function') {
      return stepResult(true, {
        step: 'publication',
        skipped: true,
        warnings: ['library-execute-settlement-publication-helper-unavailable']
      });
    }
    if (!publicationId) {
      return stepResult(true, {
        step: 'publication',
        skipped: true,
        warnings: ['library-execute-settlement-context-incomplete']
      });
    }
    try {
      var result = await transitionFn(publicationId, 'published', {
        publicationEventAtIso: cleanString(args.observedAtIso) || nowIsoSeconds()
      });
      mergeCodes(blockers, result && result.blockers);
      mergeCodes(warnings, result && result.warnings);
      if (result && result.ok === true) {
        return stepResult(true, {
          step: 'publication',
          touched: result.appended !== false,
          row: result.row || null,
          result: result,
          warnings: warnings,
          sideEffectSummary: { publicationTouched: true }
        });
      }
    } catch (_) {
      addCode(blockers, 'library-execute-settlement-publication-failed');
    }
    addCode(blockers, 'library-execute-settlement-publication-failed');
    return stepResult(false, { step: 'publication', blockers: blockers, warnings: warnings });
  }

  async function appendJournal(input) {
    var args = safeObject(input);
    var envelope = safeObject(args.envelope);
    var warnings = [];
    var blockers = [];
    var appendFn = args.appendExecuteJournalRow || H2O.Desktop.Sync.appendExecuteJournalRow;
    if (typeof appendFn !== 'function') {
      return stepResult(true, {
        step: 'journal',
        skipped: true,
        warnings: ['library-execute-settlement-journal-helper-unavailable']
      });
    }
    var rowInput = {
      journalRowId: await sha256Hex({
        schema: 'h2o.desktop.sync.library-execute-settlement-journal-row-id.v1',
        domainId: cleanString(envelope.domainId),
        phase: 'settled',
        eventDigest: cleanLower(envelope.eventDigest),
        dedupeKey: cleanLower(envelope.dedupeKey)
      }),
      envelopeKind: 'proposal',
      domainId: cleanString(envelope.domainId),
      operationKind: cleanString(envelope.operationKind),
      subjectId: cleanLower(envelope.subjectId),
      lineageId: cleanLower(envelope.lineageId),
      dedupeKey: cleanLower(envelope.dedupeKey),
      eventDigest: cleanLower(envelope.eventDigest),
      phase: 'settled',
      attempt: Number.isInteger(args.attempt) ? args.attempt : 1,
      lastAttemptAtIso: cleanString(args.observedAtIso) || nowIsoSeconds(),
      dispatchTarget: 'none',
      evidence: {
        settlementDigest: cleanLower(safeObject(envelope.settlementShapes).settlementDigest),
        domainId: cleanString(envelope.domainId),
        sqliteSentinelUsed: true
      },
      blockers: [],
      warnings: [],
      createdAtIso: cleanString(args.observedAtIso) || nowIsoSeconds()
    };
    try {
      var result = await appendFn(rowInput);
      mergeCodes(blockers, result && result.blockers);
      mergeCodes(warnings, result && result.warnings);
      if (result && result.ok === true) {
        return stepResult(true, {
          step: 'journal',
          touched: result.appended !== false,
          row: result.row || null,
          result: result,
          warnings: warnings,
          sideEffectSummary: { executeJournalTouched: true }
        });
      }
      if (codeList(result && result.blockers).indexOf('duplicate-execute-journal-row') !== -1) {
        return stepResult(true, {
          step: 'journal',
          touched: false,
          idempotent: true,
          row: result && result.row || null,
          warnings: warnings.concat(['duplicate-execute-journal-row']),
          sideEffectSummary: { executeJournalTouched: true }
        });
      }
    } catch (_) {
      addCode(blockers, 'library-execute-settlement-journal-failed');
    }
    addCode(blockers, 'library-execute-settlement-journal-failed');
    return stepResult(false, { step: 'journal', blockers: blockers, warnings: warnings });
  }

  async function settleLibraryExecuteEnvelope(input, dispatchResultMaybe, optionsMaybe) {
    var args = resolveArgs(input, dispatchResultMaybe, optionsMaybe);
    var envelope = safeObject(args.envelope);
    var dispatchResult = safeObject(args.dispatchResult);
    var blockers = [];
    var warnings = [];
    var sideEffects = {};
    var observedAtIso = cleanString(args.observedAtIso) || nowIsoSeconds();
    var domainId = cleanString(envelope.domainId);
    var operationKind = cleanString(envelope.operationKind);
    var settlementDigest = cleanLower(safeObject(envelope.settlementShapes).settlementDigest);

    validateLibraryExecuteEnvelope(envelope, blockers, warnings);
    if (!dispatchIndicatesApplySuccess(dispatchResult)) {
      addCode(blockers, 'library-execute-settlement-envelope-invalid');
      addCode(warnings, 'library-execute-settlement-context-incomplete');
    }
    if (blockers.length) return failure(blockers, warnings, {
      domainId: domainId,
      operationKind: operationKind,
      envelope: isObject(args.envelope) ? args.envelope : null,
      settlementDigest: settlementDigest,
      observedAtIso: observedAtIso,
      sideEffectSummary: sideEffects
    });

    return await withWriterIdentity('f15.execute-settlement-writer', async function () {
      var stepInput = Object.assign({}, args, {
        envelope: envelope,
        dispatchResult: dispatchResult,
        observedAtIso: observedAtIso
      });
      var consumed = domainId === CATALOG_DOMAIN
        ? await writeLibraryCatalogConsumedOperation(stepInput)
        : await writeLibraryBindingConsumedOperation(stepInput);
      absorbSideEffects(sideEffects, consumed.sideEffectSummary);
      mergeCodes(warnings, consumed.warnings);
      if (consumed.ok !== true) {
        return failure(consumed.blockers.concat(['library-execute-settlement-consumed-op-failed']), warnings, {
          domainId: domainId,
          operationKind: operationKind,
          envelope: envelope,
          consumedOperationResult: consumed,
          settlementDigest: settlementDigest,
          observedAtIso: observedAtIso,
          sideEffectSummary: sideEffects
        });
      }

      var watermark = domainId === CATALOG_DOMAIN
        ? await advanceLibraryCatalogWatermark(stepInput)
        : await advanceLibraryBindingWatermark(stepInput);
      absorbSideEffects(sideEffects, watermark.sideEffectSummary);
      mergeCodes(warnings, watermark.warnings);
      if (watermark.ok !== true) {
        return failure(watermark.blockers.concat(['library-execute-settlement-watermark-failed']), warnings, {
          domainId: domainId,
          operationKind: operationKind,
          envelope: envelope,
          consumedOperationResult: consumed,
          watermarkResult: watermark,
          settlementDigest: settlementDigest,
          observedAtIso: observedAtIso,
          sideEffectSummary: sideEffects
        });
      }

      var bookkeeping = domainId === CATALOG_DOMAIN
        ? await appendLibraryCatalogBookkeeping(stepInput)
        : await appendLibraryBindingBookkeeping(stepInput);
      absorbSideEffects(sideEffects, bookkeeping.sideEffectSummary);
      mergeCodes(warnings, bookkeeping.warnings);
      if (bookkeeping.ok !== true) {
        return failure(bookkeeping.blockers.concat(['library-execute-settlement-bookkeeping-mirror-failed']), warnings, {
          domainId: domainId,
          operationKind: operationKind,
          envelope: envelope,
          consumedOperationResult: consumed,
          watermarkResult: watermark,
          bookkeepingResult: bookkeeping,
          settlementDigest: settlementDigest,
          observedAtIso: observedAtIso,
          sideEffectSummary: sideEffects
        });
      }

      var publication = await finalizePublication(stepInput);
      absorbSideEffects(sideEffects, publication.sideEffectSummary);
      mergeCodes(warnings, publication.warnings);
      if (publication.ok !== true) {
        return failure(publication.blockers.concat(['library-execute-settlement-publication-failed']), warnings, {
          domainId: domainId,
          operationKind: operationKind,
          envelope: envelope,
          consumedOperationResult: consumed,
          watermarkResult: watermark,
          bookkeepingResult: bookkeeping,
          publicationResult: publication,
          settlementDigest: settlementDigest,
          observedAtIso: observedAtIso,
          sideEffectSummary: sideEffects
        });
      }

      var journal = await appendJournal(stepInput);
      absorbSideEffects(sideEffects, journal.sideEffectSummary);
      mergeCodes(warnings, journal.warnings);
      if (journal.ok !== true) {
        return failure(journal.blockers.concat(['library-execute-settlement-journal-failed']), warnings, {
          domainId: domainId,
          operationKind: operationKind,
          envelope: envelope,
          consumedOperationResult: consumed,
          watermarkResult: watermark,
          bookkeepingResult: bookkeeping,
          publicationResult: publication,
          journalResult: journal,
          settlementDigest: settlementDigest,
          observedAtIso: observedAtIso,
          sideEffectSummary: sideEffects
        });
      }

      sideEffects.applyExecuted = true;
      sideEffects.catalogMutated = domainId === CATALOG_DOMAIN;
      sideEffects.bindingMutated = domainId === BINDING_DOMAIN;
      sideEffects.sqliteSentinelUsed = true;
      sideEffects.storeShimRouted = false;
      sideEffects.nativeCalled = false;
      sideEffects.f5Touched = false;
      sideEffects.relayTouched = false;
      sideEffects.outboxTouched = false;

      return buildResult({
        ok: true,
        settled: true,
        domainId: domainId,
        operationKind: operationKind,
        envelope: envelope,
        consumedOperationResult: consumed,
        watermarkResult: watermark,
        bookkeepingResult: bookkeeping,
        publicationResult: publication,
        journalResult: journal,
        settlementDigest: settlementDigest,
        blockers: [],
        warnings: warnings,
        sideEffectSummary: sideEffects,
        observedAtIso: observedAtIso
      });
    });
  }

  var previousSettleExecuteEnvelope = H2O.Desktop.Sync.settleExecuteEnvelope;
  if (typeof previousSettleExecuteEnvelope === 'function') {
    H2O.Desktop.Sync.__libraryExecuteSettlementPreviousSettleExecuteEnvelope = previousSettleExecuteEnvelope;
    H2O.Desktop.Sync.settleExecuteEnvelope = async function (envelope, dispatchResult, options) {
      var candidate = safeObject(envelope && envelope.envelope ? envelope.envelope : envelope);
      if (candidate.domainId === CATALOG_DOMAIN || candidate.domainId === BINDING_DOMAIN) {
        return await settleLibraryExecuteEnvelope(envelope, dispatchResult, options);
      }
      return await previousSettleExecuteEnvelope.apply(this, arguments);
    };
  }

  H2O.Desktop.Sync.settleLibraryExecuteEnvelope = settleLibraryExecuteEnvelope;
  H2O.Desktop.Sync.writeLibraryCatalogConsumedOperation = writeLibraryCatalogConsumedOperation;
  H2O.Desktop.Sync.advanceLibraryCatalogWatermark = advanceLibraryCatalogWatermark;
  H2O.Desktop.Sync.appendLibraryCatalogBookkeeping = appendLibraryCatalogBookkeeping;
  H2O.Desktop.Sync.writeLibraryBindingConsumedOperation = writeLibraryBindingConsumedOperation;
  H2O.Desktop.Sync.advanceLibraryBindingWatermark = advanceLibraryBindingWatermark;
  H2O.Desktop.Sync.appendLibraryBindingBookkeeping = appendLibraryBindingBookkeeping;
  H2O.Desktop.Sync.__libraryExecuteSettlementInstalled = true;
  H2O.Desktop.Sync.__libraryExecuteSettlementVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
