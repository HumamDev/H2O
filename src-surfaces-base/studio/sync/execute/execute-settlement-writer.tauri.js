/* H2O Desktop Sync - F14.6.8 execute settlement writer
 *
 * Final post-dispatch settlement side effects for Execute Lane envelopes.
 *
 * Safety invariants:
 *   - Settlement only after a confirmed dispatch result. No relay dispatch,
 *     Native execution, F5 execution, apply, timers, or polling.
 *   - Ordered idempotent writes: consumed operation, watermark, bookkeeping,
 *     publication terminal transition, then settled/bookkept journal markers.
 *   - On failure, settlement stops and the most recent journal phase remains
 *     the in-progress phase for inspection.
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
  if (H2O.Desktop.Sync.__executeSettlementWriterInstalled) return;

  var VERSION = '0.1.0-f14.6.8';
  var RESULT_SCHEMA = 'h2o.desktop.sync.execute-settlement-result.v1';
  var BOOKKEEPING_LEDGER_KEY = 'h2o:sync:execute-bookkeeping:v1';
  var BOOKKEEPING_LEDGER_SCHEMA = 'h2o.desktop.sync.execute-bookkeeping-ledger.v1';
  var BOOKKEEPING_ROW_SCHEMA = 'h2o.desktop.sync.execute-bookkeeping-row.v1';
  var BOOKKEEPING_STATUS = 'bookkept';
  var PUBLICATION_TERMINAL_STATUS = 'published';
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'message', 'turns',
    'attachments', 'files', 'rawId', 'chatId', 'snapshotId', 'folderId',
    'accountId', 'title', 'name', 'path', 'url', 'href', 'password',
    'apiKey', 'accessToken', 'refreshToken', 'token'
  ];

  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function safeObject(value) { return isObject(value) ? value : {}; }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function cleanString(value) { return String(value == null ? '' : value).trim(); }
  function cleanLower(value) { return cleanString(value).toLowerCase(); }
  function nowIsoSeconds() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
  function isSha256Hex(value) { return /^[0-9a-f]{64}$/.test(cleanLower(value)); }
  function addCode(list, code) {
    var normalized = cleanString(code);
    if (!normalized || list.indexOf(normalized) !== -1) return;
    list.push(normalized);
  }
  function codeList(value) {
    return asArray(value).map(function (item) {
      return isObject(item) ? cleanString(item.code) : cleanString(item);
    }).filter(Boolean).filter(function (code, index, arr) { return arr.indexOf(code) === index; });
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
    for (var i = 0; i < bytes.length; i += 1) {
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
        var fromKernel = await kernel.sha256Hex(value);
        if (isSha256Hex(fromKernel)) return cleanLower(fromKernel);
      } catch (_) { /* fall through */ }
    }
    if (!webCryptoAvailable()) return '';
    var text = typeof value === 'string' ? value : canonicalJson(value);
    var data = new TextEncoder().encode(text);
    var buffer = await global.crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(buffer));
  }
  function generateUuid() {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
    } catch (_) { /* fall through */ }
    return 'execute-settlement-' + Math.random().toString(16).slice(2) + '-' + Date.now();
  }

  function sideEffectSummary(flags) {
    var f = safeObject(flags);
    return {
      consumedOperationWritten: f.consumedOperationWritten === true,
      watermarkWritten: f.watermarkWritten === true,
      bookkeepingWritten: f.bookkeepingWritten === true,
      publicationLedgerTouched: f.publicationLedgerTouched === true,
      executeJournalTouched: f.executeJournalTouched === true,
      relayOutboxTouched: false,
      relayDispatched: false,
      nativeCalled: false,
      f5Touched: false,
      f5Executed: false
    };
  }
  function forbiddenSideEffectsFalse(summary) {
    var s = safeObject(summary);
    return s.relayOutboxTouched === false &&
      s.relayDispatched === false &&
      s.nativeCalled === false &&
      s.f5Touched === false &&
      s.f5Executed === false;
  }
  function buildResult(opts) {
    opts = safeObject(opts);
    var blockers = codeList(opts.blockers);
    var warnings = codeList(opts.warnings);
    var ok = typeof opts.ok === 'boolean' ? opts.ok : blockers.length === 0;
    var payload = {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: ok,
      settled: opts.settled === true,
      step: cleanString(opts.step),
      consumedRow: opts.consumedRow || null,
      watermarkRow: opts.watermarkRow || null,
      bookkeepingRow: opts.bookkeepingRow || null,
      publicationRow: opts.publicationRow || null,
      journalRows: opts.journalRows || [],
      sideEffectSummary: sideEffectSummary(opts.sideEffects),
      blockers: blockers,
      warnings: warnings,
      metadata: opts.metadata || {}
    };
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.createResult === 'function') {
      try {
        var shaped = kernel.createResult({
          schema: RESULT_SCHEMA,
          ok: payload.ok,
          actionable: payload.ok,
          blockers: payload.blockers,
          warnings: payload.warnings,
          metadata: { domain: 'execute', version: VERSION }
        });
        if (shaped && typeof shaped === 'object') {
          payload.ok = shaped.ok === true;
          payload.blockers = codeList(shaped.blockers);
          payload.warnings = codeList(shaped.warnings);
        }
      } catch (_) { /* keep local result */ }
    }
    return payload;
  }
  function failure(blockers, warnings, extra) {
    return buildResult(Object.assign({}, safeObject(extra), {
      ok: false,
      settled: false,
      blockers: blockers,
      warnings: warnings
    }));
  }

  function storageRef() {
    try {
      var s = global.chrome && global.chrome.storage && global.chrome.storage.local;
      if (s && typeof s.get === 'function' && typeof s.set === 'function') return s;
    } catch (_) { /* ignore */ }
    return null;
  }
  function storageGet(key) {
    return new Promise(function (resolve, reject) {
      var s = storageRef();
      if (!s) { reject(new Error('storage-unavailable')); return; }
      try {
        s.get([key], function (items) {
          var lastError = global.chrome && global.chrome.runtime && global.chrome.runtime.lastError;
          if (lastError) { reject(new Error(String(lastError.message || lastError))); return; }
          resolve(items && Object.prototype.hasOwnProperty.call(items, key) ? items[key] : null);
        });
      } catch (e) { reject(e); }
    });
  }
  function storageSet(key, value) {
    return new Promise(function (resolve, reject) {
      var s = storageRef();
      if (!s) { reject(new Error('storage-unavailable')); return; }
      try {
        var payload = {};
        payload[key] = value;
        s.set(payload, function () {
          var lastError = global.chrome && global.chrome.runtime && global.chrome.runtime.lastError;
          if (lastError) { reject(new Error(String(lastError.message || lastError))); return; }
          resolve();
        });
      } catch (e) { reject(e); }
    });
  }

  function foreverNoKey(value) {
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i += 1) {
        var arrayHit = foreverNoKey(value[i]);
        if (arrayHit) return arrayHit;
      }
      return '';
    }
    if (!isObject(value)) return '';
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k += 1) {
      var key = keys[k];
      if (FOREVER_NO_FIELDS.indexOf(key) !== -1) return key;
      if (/token$/i.test(key) && key !== 'previewToken') return key;
      var childHit = foreverNoKey(value[key]);
      if (childHit) return childHit;
    }
    return '';
  }
  function domainPrivacyTag(domainId) {
    if (domainId === 'chat') return 'chat.metadata';
    if (domainId === 'snapshot') return 'snapshot.conversation';
    if (domainId === 'capture') return 'capture.artifact';
    return cleanString(domainId);
  }
  function scanPrivacyFor(domainId, target, blockers, warnings, codePrefix) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    var result = null;
    var prefix = cleanString(codePrefix || 'execute-settlement');
    if (kernel && typeof kernel.scanDomainForbiddenFields === 'function') {
      try {
        result = kernel.scanDomainForbiddenFields(domainPrivacyTag(domainId), target);
      } catch (_) {
        addCode(blockers, prefix + '-privacy-scan-threw');
      }
    } else if (kernel && typeof kernel.scanPrivacy === 'function') {
      try {
        result = kernel.scanPrivacy(target, {
          subjectType: domainPrivacyTag(domainId),
          redactionClass: 'redacted',
          allowedRedactionClasses: ['redacted', 'metadata-only'],
          forbiddenList: FOREVER_NO_FIELDS,
          foreverNoFields: FOREVER_NO_FIELDS
        });
      } catch (_) {
        addCode(blockers, prefix + '-privacy-scan-threw');
      }
    }
    if (result) {
      codeList(result.blockers).forEach(function (code) { addCode(blockers, code); });
      codeList(result.warnings).forEach(function (code) { addCode(warnings, code); });
    }
    var forbidden = foreverNoKey(target);
    if (forbidden) {
      addCode(blockers, prefix + '-privacy-violation');
      addCode(warnings, 'blocked-forbidden-key-' + forbidden);
    }
    return result || { ok: blockers.length === 0, blockers: [], warnings: [] };
  }
  function validateEnvelope(envelope, blockers, warnings) {
    if (typeof H2O.Desktop.Sync.validateExecuteEnvelope !== 'function') {
      addCode(blockers, 'execute-envelope-validator-unavailable');
      return { ok: false, envelope: safeObject(envelope), blockers: ['execute-envelope-validator-unavailable'], warnings: [] };
    }
    var result = H2O.Desktop.Sync.validateExecuteEnvelope(envelope);
    codeList(result.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(result.warnings).forEach(function (code) { addCode(warnings, code); });
    return result;
  }
  function confirmedDispatch(dispatchResult, blockers) {
    var result = safeObject(dispatchResult);
    if (result.ok !== true || result.confirmed !== true) {
      addCode(blockers, 'execute-dispatch-confirmation-required');
      return false;
    }
    return true;
  }
  async function actorPeer(options) {
    var source = safeObject(options.actorPeer);
    if (isSha256Hex(source.physicalDeviceIdHash) && isSha256Hex(source.installIdHash) && isSha256Hex(source.syncPeerIdHash)) {
      return {
        physicalDeviceIdHash: cleanLower(source.physicalDeviceIdHash),
        installIdHash: cleanLower(source.installIdHash),
        syncPeerIdHash: cleanLower(source.syncPeerIdHash),
        surfaceKind: cleanString(source.surfaceKind || 'desktop-tauri')
      };
    }
    return {
      physicalDeviceIdHash: await sha256Hex('execute-settlement-writer-device'),
      installIdHash: await sha256Hex('execute-settlement-writer-install'),
      syncPeerIdHash: await sha256Hex('execute-settlement-writer-peer'),
      surfaceKind: 'desktop-tauri'
    };
  }
  function validationSummary(dispatchResult, blockers, warnings, ok) {
    return {
      ok: ok !== false,
      checkedAtIso: nowIsoSeconds(),
      blockers: codeList(blockers),
      warnings: codeList(warnings).concat(codeList(safeObject(dispatchResult).warnings))
    };
  }
  function envelopeKindForConsumed(envelope) {
    var kind = cleanString(envelope.envelopeKind);
    if (kind === 'canonical-preview') return 'preview';
    if (kind === 'proposal-receipt') return 'proposal';
    return 'proposal';
  }
  function revisionHashFor(envelope, dispatchResult) {
    var settlement = safeObject(envelope.settlementShapes);
    var candidates = [
      settlement.revisionHash,
      safeObject(settlement.watermark).revisionHash,
      settlement.postStateHash,
      settlement.settlementDigest,
      safeObject(dispatchResult.nativeEvidence).applyEventDigest,
      safeObject(dispatchResult.nativeResult).applyEventDigest,
      envelope.eventDigest
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var text = cleanLower(candidates[i]);
      if (/^([0-9a-f]{8}|[0-9a-f]{64})$/.test(text)) return text;
    }
    return cleanLower(envelope.eventDigest);
  }
  async function settlementAtIso(options) {
    return cleanString(safeObject(options).nowIso || nowIsoSeconds());
  }

  async function appendJournalPhase(envelope, phase, dispatchTarget, evidence, options, blockers, warnings) {
    var opts = safeObject(options);
    var atIso = cleanString(opts.nowIso || nowIsoSeconds());
    var rowInput = {
      journalRowId: await sha256Hex({
        schema: 'h2o.desktop.sync.execute-settlement-journal-id.v1',
        phase: phase,
        dedupeKey: cleanLower(envelope.dedupeKey),
        eventDigest: cleanLower(envelope.eventDigest)
      }),
      envelopeKind: 'proposal',
      domainId: cleanString(envelope.domainId),
      operationKind: cleanString(envelope.operationKind),
      subjectId: cleanLower(envelope.subjectId),
      lineageId: cleanString(envelope.lineageId),
      dedupeKey: cleanLower(envelope.dedupeKey),
      eventDigest: cleanLower(envelope.eventDigest),
      phase: phase,
      attempt: Number.isInteger(opts.attempt) ? opts.attempt : 1,
      lastAttemptAtIso: atIso,
      dispatchTarget: dispatchTarget || 'none',
      evidence: safeObject(evidence),
      blockers: [],
      warnings: [],
      createdAtIso: atIso
    };
    if (Array.isArray(opts.__journalRows)) {
      var existing = opts.__journalRows.filter(function (row) {
        return cleanString(row.journalRowId) === rowInput.journalRowId &&
          cleanLower(row.eventDigest) === rowInput.eventDigest;
      })[0];
      if (existing) return { ok: true, row: existing, appended: false, idempotent: true, blockers: [], warnings: [] };
      var shaped = typeof H2O.Desktop.Sync.shapeExecuteJournalRow === 'function'
        ? await H2O.Desktop.Sync.shapeExecuteJournalRow(rowInput)
        : rowInput;
      opts.__journalRows.push(shaped);
      return { ok: true, row: shaped, appended: true, blockers: [], warnings: [] };
    }
    if (typeof H2O.Desktop.Sync.appendExecuteJournalRow !== 'function') {
      addCode(blockers, 'execute-journal-unavailable');
      return { ok: false, blockers: ['execute-journal-unavailable'], warnings: [] };
    }
    var result = await H2O.Desktop.Sync.appendExecuteJournalRow(rowInput);
    if (result.ok === true) return result;
    if (codeList(result.blockers).indexOf('duplicate-execute-journal-row') !== -1 &&
        typeof H2O.Desktop.Sync.listExecuteJournalRowsByDedupe === 'function') {
      var list = await H2O.Desktop.Sync.listExecuteJournalRowsByDedupe(envelope.dedupeKey);
      var row = asArray(list.rows).filter(function (candidate) {
        return cleanString(candidate.journalRowId) === rowInput.journalRowId &&
          cleanLower(candidate.eventDigest) === rowInput.eventDigest;
      })[0] || null;
      if (row) return { ok: true, row: row, appended: false, idempotent: true, blockers: [], warnings: [] };
    }
    codeList(result.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(result.warnings).forEach(function (code) { addCode(warnings, code); });
    return result;
  }
  function mergeStepResult(step, blockers, warnings) {
    codeList(step.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(step.warnings).forEach(function (code) { addCode(warnings, code); });
  }

  function consumedInput(envelope, dispatchResult, peer, atIso, blockers, warnings) {
    return {
      eventDigest: cleanLower(envelope.eventDigest),
      dedupeKey: cleanLower(envelope.dedupeKey),
      lineageId: cleanString(envelope.lineageId),
      subjectId: cleanLower(envelope.subjectId),
      sourcePeerId: cleanLower(peer.syncPeerIdHash),
      envelopeKind: envelopeKindForConsumed(envelope),
      operationKind: cleanString(envelope.operationKind),
      consumedStatus: 'consumed',
      consumedAtIso: atIso,
      actorPeer: peer,
      reason: 'execute-settlement-confirmed-dispatch',
      validationSummary: validationSummary(dispatchResult, blockers, warnings, true)
    };
  }
  async function writeExecuteConsumedOperation(envelope, dispatchResult, options) {
    var opts = safeObject(options);
    var blockers = [];
    var warnings = [];
    var sideEffects = {};
    var journalRows = [];
    var peer = await actorPeer(opts);
    var atIso = await settlementAtIso(opts);
    var journal = await appendJournalPhase(envelope, 'settling-consumed', 'none', {
      step: 'consumed-operation',
      dispatchConfirmed: true
    }, opts, blockers, warnings);
    if (journal.row) journalRows.push(journal.row);
    if (journal.appended) sideEffects.executeJournalTouched = true;
    if (blockers.length || journal.ok !== true) return failure(blockers, warnings, { step: 'consumed', journalRows: journalRows, sideEffects: sideEffects });
    if (opts.__failConsumedOperation === true) {
      return failure(['execute-consumed-operation-write-failed'], warnings, { step: 'consumed', journalRows: journalRows, sideEffects: sideEffects });
    }
    var input = consumedInput(envelope, dispatchResult, peer, atIso, blockers, warnings);
    scanPrivacyFor(envelope.domainId, input, blockers, warnings, 'execute-consumed');
    if (blockers.length) return failure(blockers, warnings, { step: 'consumed', journalRows: journalRows, sideEffects: sideEffects });

    if (Array.isArray(opts.__consumedRows)) {
      var existing = opts.__consumedRows.filter(function (row) {
        return cleanLower(row.eventDigest) === input.eventDigest && cleanLower(row.dedupeKey) === input.dedupeKey;
      })[0];
      if (existing) return buildResult({ ok: true, step: 'consumed', consumedRow: existing, journalRows: journalRows, sideEffects: sideEffects, metadata: { idempotent: true } });
      var row = Object.assign({ schema: 'h2o.desktop.sync.consumed-operation-ledger-row.v1', consumedId: generateUuid() }, input);
      opts.__consumedRows.push(row);
      sideEffects.consumedOperationWritten = true;
      return buildResult({ ok: true, step: 'consumed', consumedRow: row, journalRows: journalRows, sideEffects: sideEffects });
    }
    if (typeof (opts.recordConsumedOperation || H2O.Desktop.Sync.recordConsumedOperation) !== 'function') {
      return failure(['consumed-operation-ledger-unavailable'], warnings, { step: 'consumed', journalRows: journalRows, sideEffects: sideEffects });
    }
    if (typeof (opts.listConsumedOperations || H2O.Desktop.Sync.listConsumedOperations) === 'function') {
      var list = await (opts.listConsumedOperations || H2O.Desktop.Sync.listConsumedOperations)();
      var found = asArray(list.rows).filter(function (row) {
        return cleanLower(row.eventDigest) === input.eventDigest && cleanLower(row.dedupeKey) === input.dedupeKey;
      })[0];
      if (found) return buildResult({ ok: true, step: 'consumed', consumedRow: found, journalRows: journalRows, sideEffects: sideEffects, metadata: { idempotent: true } });
    }
    var recorded = await (opts.recordConsumedOperation || H2O.Desktop.Sync.recordConsumedOperation)(input);
    mergeStepResult(recorded, blockers, warnings);
    if (recorded.ok !== true || !recorded.row) {
      if (!blockers.length) addCode(blockers, 'consumed-operation-record-failed');
      return failure(blockers, warnings, { step: 'consumed', journalRows: journalRows, sideEffects: sideEffects });
    }
    sideEffects.consumedOperationWritten = recorded.appended !== false;
    return buildResult({ ok: true, step: 'consumed', consumedRow: recorded.row, journalRows: journalRows, sideEffects: sideEffects });
  }

  function watermarkInput(envelope, dispatchResult, peer, atIso) {
    return {
      peerId: cleanLower(peer.syncPeerIdHash),
      subjectId: cleanLower(envelope.subjectId),
      lineageId: cleanString(envelope.lineageId),
      revisionHash: revisionHashFor(envelope, dispatchResult),
      watermarkAtIso: atIso
    };
  }
  async function advanceExecuteWatermark(envelope, dispatchResult, options) {
    var opts = safeObject(options);
    var blockers = [];
    var warnings = [];
    var sideEffects = {};
    var journalRows = [];
    var peer = await actorPeer(opts);
    var atIso = await settlementAtIso(opts);
    var journal = await appendJournalPhase(envelope, 'settling-watermark', 'none', {
      step: 'watermark',
      dispatchConfirmed: true
    }, opts, blockers, warnings);
    if (journal.row) journalRows.push(journal.row);
    if (journal.appended) sideEffects.executeJournalTouched = true;
    if (blockers.length || journal.ok !== true) return failure(blockers, warnings, { step: 'watermark', journalRows: journalRows, sideEffects: sideEffects });
    if (opts.__failWatermark === true) {
      return failure(['execute-watermark-write-failed'], warnings, { step: 'watermark', journalRows: journalRows, sideEffects: sideEffects });
    }
    var input = watermarkInput(envelope, dispatchResult, peer, atIso);
    scanPrivacyFor(envelope.domainId, input, blockers, warnings, 'execute-watermark');
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.validateWatermarkValue === 'function') {
      var validation = kernel.validateWatermarkValue(input, 'proposed');
      mergeStepResult(validation, blockers, warnings);
    }
    if (blockers.length) return failure(blockers, warnings, { step: 'watermark', journalRows: journalRows, sideEffects: sideEffects });
    if (Array.isArray(opts.__watermarkRows)) {
      var existing = opts.__watermarkRows.filter(function (row) {
        return cleanLower(row.peerId) === input.peerId &&
          cleanLower(row.subjectId) === input.subjectId &&
          cleanString(row.lineageId) === input.lineageId &&
          cleanLower(row.revisionHash) === input.revisionHash &&
          cleanString(row.watermarkAtIso) === input.watermarkAtIso;
      })[0];
      if (existing) return buildResult({ ok: true, step: 'watermark', watermarkRow: existing, journalRows: journalRows, sideEffects: sideEffects, metadata: { idempotent: true } });
      var row = Object.assign({
        schema: 'h2o.desktop.sync.convergence-watermark-row.v1',
        watermarkId: generateUuid(),
        recordedAtIso: atIso,
        dedupeKey: await sha256Hex(input)
      }, input);
      opts.__watermarkRows.push(row);
      sideEffects.watermarkWritten = true;
      return buildResult({ ok: true, step: 'watermark', watermarkRow: row, journalRows: journalRows, sideEffects: sideEffects });
    }
    if (typeof (opts.getConvergenceWatermarks || H2O.Desktop.Sync.getConvergenceWatermarks) === 'function') {
      var list = await (opts.getConvergenceWatermarks || H2O.Desktop.Sync.getConvergenceWatermarks)();
      var found = asArray(list.rows).filter(function (row) {
        return cleanLower(row.peerId) === input.peerId &&
          cleanLower(row.subjectId) === input.subjectId &&
          cleanString(row.lineageId) === input.lineageId &&
          cleanLower(row.revisionHash) === input.revisionHash &&
          cleanString(row.watermarkAtIso) === input.watermarkAtIso;
      })[0];
      if (found) return buildResult({ ok: true, step: 'watermark', watermarkRow: found, journalRows: journalRows, sideEffects: sideEffects, metadata: { idempotent: true } });
    }
    if (typeof (opts.recordConvergenceWatermark || H2O.Desktop.Sync.recordConvergenceWatermark) !== 'function') {
      return failure(['convergence-watermark-ledger-unavailable'], warnings, { step: 'watermark', journalRows: journalRows, sideEffects: sideEffects });
    }
    var recorded = await (opts.recordConvergenceWatermark || H2O.Desktop.Sync.recordConvergenceWatermark)(input);
    mergeStepResult(recorded, blockers, warnings);
    if (recorded.ok !== true || !recorded.row) {
      if (!blockers.length) addCode(blockers, 'convergence-watermark-record-failed');
      return failure(blockers, warnings, { step: 'watermark', journalRows: journalRows, sideEffects: sideEffects });
    }
    sideEffects.watermarkWritten = recorded.appended !== false;
    return buildResult({ ok: true, step: 'watermark', watermarkRow: recorded.row, journalRows: journalRows, sideEffects: sideEffects });
  }

  function normalizeBookkeepingLedger(raw) {
    if (!raw) return { schema: BOOKKEEPING_LEDGER_SCHEMA, createdAtIso: nowIsoSeconds(), rows: [] };
    if (!isObject(raw) || raw.schema !== BOOKKEEPING_LEDGER_SCHEMA || !Array.isArray(raw.rows)) return null;
    return {
      schema: BOOKKEEPING_LEDGER_SCHEMA,
      createdAtIso: cleanString(raw.createdAtIso) || nowIsoSeconds(),
      updatedAtIso: cleanString(raw.updatedAtIso),
      rows: raw.rows.slice()
    };
  }
  async function readBookkeepingLedger(options) {
    var memory = safeObject(options).__bookkeepingLedger;
    if (memory && memory.schema === BOOKKEEPING_LEDGER_SCHEMA) return normalizeBookkeepingLedger(memory);
    return normalizeBookkeepingLedger(await storageGet(BOOKKEEPING_LEDGER_KEY));
  }
  async function writeBookkeepingLedger(ledger, options) {
    var memory = safeObject(options).__bookkeepingLedger;
    if (memory && memory.schema === BOOKKEEPING_LEDGER_SCHEMA) {
      memory.createdAtIso = ledger.createdAtIso;
      memory.updatedAtIso = ledger.updatedAtIso;
      memory.rows = ledger.rows.slice();
      return;
    }
    await storageSet(BOOKKEEPING_LEDGER_KEY, ledger);
  }
  function findBookkeepingRow(ledger, envelope) {
    return asArray(ledger && ledger.rows).filter(function (row) {
      return cleanLower(row.eventDigest) === cleanLower(envelope.eventDigest) &&
        cleanLower(row.dedupeKey) === cleanLower(envelope.dedupeKey);
    })[0] || null;
  }
  async function buildBookkeepingRow(envelope, dispatchResult, options) {
    var peer = await actorPeer(options);
    var atIso = await settlementAtIso(options);
    return {
      schema: BOOKKEEPING_ROW_SCHEMA,
      rowId: await sha256Hex({
        schema: BOOKKEEPING_ROW_SCHEMA,
        dedupeKey: cleanLower(envelope.dedupeKey),
        eventDigest: cleanLower(envelope.eventDigest)
      }),
      bookkeepingId: generateUuid(),
      status: BOOKKEEPING_STATUS,
      domainId: cleanString(envelope.domainId),
      envelopeKind: cleanString(envelope.envelopeKind),
      operationKind: cleanString(envelope.operationKind),
      subjectId: cleanLower(envelope.subjectId),
      lineageId: cleanString(envelope.lineageId),
      dedupeKey: cleanLower(envelope.dedupeKey),
      eventDigest: cleanLower(envelope.eventDigest),
      settlementShapes: safeObject(envelope.settlementShapes),
      dispatchSummary: {
        confirmed: safeObject(dispatchResult).confirmed === true,
        publicationId: cleanString(safeObject(safeObject(dispatchResult).publicationRow).publicationId),
        dispatchSchema: cleanString(safeObject(dispatchResult).schema)
      },
      actorPeer: peer,
      recordedAtIso: atIso,
      validationSummary: {
        ok: true,
        blockers: [],
        warnings: codeList(safeObject(dispatchResult).warnings)
      }
    };
  }
  async function appendExecuteBookkeeping(envelope, dispatchResult, options) {
    var opts = safeObject(options);
    var blockers = [];
    var warnings = [];
    var sideEffects = {};
    var journalRows = [];
    var journal = await appendJournalPhase(envelope, 'settling-bookkeeping', 'none', {
      step: 'bookkeeping',
      dispatchConfirmed: true
    }, opts, blockers, warnings);
    if (journal.row) journalRows.push(journal.row);
    if (journal.appended) sideEffects.executeJournalTouched = true;
    if (blockers.length || journal.ok !== true) return failure(blockers, warnings, { step: 'bookkeeping', journalRows: journalRows, sideEffects: sideEffects });
    if (opts.__failBookkeeping === true) {
      return failure(['execute-bookkeeping-write-failed'], warnings, { step: 'bookkeeping', journalRows: journalRows, sideEffects: sideEffects });
    }
    var ledger = null;
    try {
      ledger = await readBookkeepingLedger(opts);
    } catch (_) {
      return failure(['execute-bookkeeping-ledger-unavailable'], warnings, { step: 'bookkeeping', journalRows: journalRows, sideEffects: sideEffects });
    }
    if (!ledger) return failure(['execute-bookkeeping-ledger-malformed'], warnings, { step: 'bookkeeping', journalRows: journalRows, sideEffects: sideEffects });
    var existing = findBookkeepingRow(ledger, envelope);
    if (existing) return buildResult({ ok: true, step: 'bookkeeping', bookkeepingRow: existing, journalRows: journalRows, sideEffects: sideEffects, metadata: { idempotent: true } });
    var row = await buildBookkeepingRow(envelope, dispatchResult, opts);
    scanPrivacyFor(envelope.domainId, row, blockers, warnings, 'execute-bookkeeping');
    if (blockers.length) return failure(blockers, warnings, { step: 'bookkeeping', journalRows: journalRows, sideEffects: sideEffects });
    var next = {
      schema: BOOKKEEPING_LEDGER_SCHEMA,
      createdAtIso: ledger.createdAtIso,
      updatedAtIso: row.recordedAtIso,
      rows: ledger.rows.concat([row])
    };
    try {
      await writeBookkeepingLedger(next, opts);
    } catch (_) {
      return failure(['execute-bookkeeping-ledger-write-failed'], warnings, { step: 'bookkeeping', journalRows: journalRows, sideEffects: sideEffects });
    }
    sideEffects.bookkeepingWritten = true;
    return buildResult({ ok: true, step: 'bookkeeping', bookkeepingRow: row, journalRows: journalRows, sideEffects: sideEffects });
  }

  async function getPublicationRow(publicationId, options) {
    if (typeof (options.getExecutePublicationRow || H2O.Desktop.Sync.getExecutePublicationRow) === 'function') {
      try {
        return await (options.getExecutePublicationRow || H2O.Desktop.Sync.getExecutePublicationRow)(publicationId, publicationOptions(options));
      } catch (_) { return null; }
    }
    return null;
  }
  function publicationOptions(options) {
    var opts = Object.assign({}, safeObject(options.publicationOptions));
    if (options.__publicationLedger) opts.__memoryLedger = options.__publicationLedger;
    return opts;
  }
  async function finalizeExecutePublication(envelope, dispatchResult, options) {
    var opts = safeObject(options);
    var blockers = [];
    var warnings = [];
    var sideEffects = {};
    var journalRows = [];
    var publicationId = cleanString(opts.publicationId || safeObject(safeObject(dispatchResult).publicationRow).publicationId);
    var journal = await appendJournalPhase(envelope, 'settling-publication-terminal', 'none', {
      step: 'publication-terminal',
      publicationId: publicationId
    }, opts, blockers, warnings);
    if (journal.row) journalRows.push(journal.row);
    if (journal.appended) sideEffects.executeJournalTouched = true;
    if (blockers.length || journal.ok !== true) return failure(blockers, warnings, { step: 'publication-terminal', journalRows: journalRows, sideEffects: sideEffects });
    if (!publicationId) return failure(['execute-publicationId-required'], warnings, { step: 'publication-terminal', journalRows: journalRows, sideEffects: sideEffects });
    if (opts.__failPublicationFinalization === true) {
      return failure(['execute-publication-terminal-transition-failed'], warnings, { step: 'publication-terminal', journalRows: journalRows, sideEffects: sideEffects });
    }
    var current = await getPublicationRow(publicationId, opts);
    if (current && current.ok === true && safeObject(current.row).status === PUBLICATION_TERMINAL_STATUS) {
      return buildResult({ ok: true, step: 'publication-terminal', publicationRow: current.row, journalRows: journalRows, sideEffects: sideEffects, metadata: { idempotent: true } });
    }
    if (typeof (opts.transitionExecutePublicationRow || H2O.Desktop.Sync.transitionExecutePublicationRow) !== 'function') {
      return failure(['execute-publication-lifecycle-unavailable'], warnings, { step: 'publication-terminal', journalRows: journalRows, sideEffects: sideEffects });
    }
    var transitioned = await (opts.transitionExecutePublicationRow || H2O.Desktop.Sync.transitionExecutePublicationRow)(
      publicationId,
      PUBLICATION_TERMINAL_STATUS,
      Object.assign({}, publicationOptions(opts), {
        publicationEventAtIso: cleanString(opts.nowIso || nowIsoSeconds())
      })
    );
    mergeStepResult(transitioned, blockers, warnings);
    if (transitioned.ok !== true || !transitioned.row) {
      if (!blockers.length) addCode(blockers, 'execute-publication-terminal-transition-failed');
      return failure(blockers, warnings, { step: 'publication-terminal', journalRows: journalRows, sideEffects: sideEffects });
    }
    sideEffects.publicationLedgerTouched = transitioned.appended !== false;
    return buildResult({ ok: true, step: 'publication-terminal', publicationRow: transitioned.row, journalRows: journalRows, sideEffects: sideEffects });
  }

  function absorbSideEffects(into, stepSummary) {
    var s = safeObject(stepSummary);
    if (s.consumedOperationWritten) into.consumedOperationWritten = true;
    if (s.watermarkWritten) into.watermarkWritten = true;
    if (s.bookkeepingWritten) into.bookkeepingWritten = true;
    if (s.publicationLedgerTouched) into.publicationLedgerTouched = true;
    if (s.executeJournalTouched) into.executeJournalTouched = true;
  }
  function absorbRows(target, rows) {
    asArray(rows).forEach(function (row) { target.push(row); });
  }
  async function settleExecuteEnvelope(envelope, dispatchResult, options) {
    var opts = safeObject(options);
    var blockers = [];
    var warnings = [];
    var sideEffects = {};
    var journalRows = [];
    var validation = validateEnvelope(envelope, blockers, warnings);
    var shapedEnvelope = safeObject(validation.envelope || envelope);
    confirmedDispatch(dispatchResult, blockers);
    scanPrivacyFor(cleanString(shapedEnvelope.domainId), {
      envelope: shapedEnvelope,
      settlementShapes: safeObject(shapedEnvelope.settlementShapes)
    }, blockers, warnings, 'execute-settlement');
    if (blockers.length) return failure(blockers, warnings, { step: 'validation', sideEffects: sideEffects });

    var consumed = await writeExecuteConsumedOperation(shapedEnvelope, dispatchResult, opts);
    absorbSideEffects(sideEffects, consumed.sideEffectSummary);
    absorbRows(journalRows, consumed.journalRows);
    if (consumed.ok !== true) return failure(consumed.blockers, consumed.warnings, {
      step: 'consumed',
      consumedRow: consumed.consumedRow,
      journalRows: journalRows,
      sideEffects: sideEffects
    });

    var watermark = await advanceExecuteWatermark(shapedEnvelope, dispatchResult, opts);
    absorbSideEffects(sideEffects, watermark.sideEffectSummary);
    absorbRows(journalRows, watermark.journalRows);
    if (watermark.ok !== true) return failure(watermark.blockers, watermark.warnings, {
      step: 'watermark',
      consumedRow: consumed.consumedRow,
      watermarkRow: watermark.watermarkRow,
      journalRows: journalRows,
      sideEffects: sideEffects
    });

    var bookkeeping = await appendExecuteBookkeeping(shapedEnvelope, dispatchResult, opts);
    absorbSideEffects(sideEffects, bookkeeping.sideEffectSummary);
    absorbRows(journalRows, bookkeeping.journalRows);
    if (bookkeeping.ok !== true) return failure(bookkeeping.blockers, bookkeeping.warnings, {
      step: 'bookkeeping',
      consumedRow: consumed.consumedRow,
      watermarkRow: watermark.watermarkRow,
      bookkeepingRow: bookkeeping.bookkeepingRow,
      journalRows: journalRows,
      sideEffects: sideEffects
    });

    var publication = await finalizeExecutePublication(shapedEnvelope, dispatchResult, opts);
    absorbSideEffects(sideEffects, publication.sideEffectSummary);
    absorbRows(journalRows, publication.journalRows);
    if (publication.ok !== true) return failure(publication.blockers, publication.warnings, {
      step: 'publication-terminal',
      consumedRow: consumed.consumedRow,
      watermarkRow: watermark.watermarkRow,
      bookkeepingRow: bookkeeping.bookkeepingRow,
      publicationRow: publication.publicationRow,
      journalRows: journalRows,
      sideEffects: sideEffects
    });

    var settled = await appendJournalPhase(shapedEnvelope, 'settled', 'none', {
      step: 'settled',
      publicationId: cleanString(safeObject(publication.publicationRow).publicationId)
    }, opts, blockers, warnings);
    if (settled.row) journalRows.push(settled.row);
    if (settled.appended) sideEffects.executeJournalTouched = true;
    var bookkept = await appendJournalPhase(shapedEnvelope, 'bookkept', 'none', {
      step: 'bookkept',
      bookkeepingRowId: cleanString(safeObject(bookkeeping.bookkeepingRow).rowId)
    }, opts, blockers, warnings);
    if (bookkept.row) journalRows.push(bookkept.row);
    if (bookkept.appended) sideEffects.executeJournalTouched = true;
    if (blockers.length || settled.ok !== true || bookkept.ok !== true) {
      return failure(blockers.length ? blockers : ['execute-settlement-final-journal-failed'], warnings, {
        step: 'journal-final',
        consumedRow: consumed.consumedRow,
        watermarkRow: watermark.watermarkRow,
        bookkeepingRow: bookkeeping.bookkeepingRow,
        publicationRow: publication.publicationRow,
        journalRows: journalRows,
        sideEffects: sideEffects
      });
    }
    return buildResult({
      ok: true,
      settled: true,
      step: 'settled',
      consumedRow: consumed.consumedRow,
      watermarkRow: watermark.watermarkRow,
      bookkeepingRow: bookkeeping.bookkeepingRow,
      publicationRow: publication.publicationRow,
      journalRows: journalRows,
      sideEffects: sideEffects,
      metadata: {
        idempotent: consumed.metadata.idempotent === true &&
          watermark.metadata.idempotent === true &&
          bookkeeping.metadata.idempotent === true &&
          publication.metadata.idempotent === true
      }
    });
  }

  async function proofEnvelope(label, overrides) {
    var args = safeObject(overrides);
    return await H2O.Desktop.Sync.shapeExecuteEnvelope({
      envelopeKind: 'proposal-receipt',
      domainId: 'snapshot',
      operationKind: 'snapshot-proof-operation',
      subjectId: await sha256Hex('execute-settlement-proof-subject:' + label),
      lineageId: 'execute-settlement-proof-lineage-' + label,
      dedupeKey: await sha256Hex('execute-settlement-proof-dedupe:' + label),
      dispatchProfile: {
        requiresF5: false,
        requiresNative: true,
        requiresRelay: false,
        nativeCommand: 'snapshot.proof.preview',
        nativeIdempotent: true,
        f5QueueKey: '',
        retryPolicy: { maxAttempts: 0, minDelayMs: 0, maxDelayMs: 0, backoffKind: 'none' }
      },
      payloadShapes: {
        proposalReceipt: {
          schema: 'h2o.desktop.sync.execute-settlement-proof-receipt.v1',
          redactionClass: 'redacted',
          receiptDigest: await sha256Hex('execute-settlement-proof-receipt:' + label)
        }
      },
      settlementShapes: args.settlementShapes || {
        redactionClass: 'redacted',
        revisionHash: await sha256Hex('execute-settlement-proof-revision:' + label),
        settlementDigest: await sha256Hex('execute-settlement-proof-settlement:' + label)
      },
      createdAtIso: '2026-06-01T10:00:00Z'
    });
  }
  async function proofDispatch(envelope, publicationLedger, status) {
    var preflight = { ok: true, actionable: true, blockers: [], warnings: [] };
    var created = await H2O.Desktop.Sync.createExecutePublicationRow(envelope, preflight, {
      __memoryLedger: publicationLedger,
      publicationEventAtIso: '2026-06-01T10:00:00Z'
    });
    if (status === PUBLICATION_TERMINAL_STATUS) {
      var published = await H2O.Desktop.Sync.transitionExecutePublicationRow(created.row.publicationId, PUBLICATION_TERMINAL_STATUS, {
        __memoryLedger: publicationLedger,
        publicationEventAtIso: '2026-06-01T10:00:01Z'
      });
      return { ok: true, confirmed: true, publicationRow: published.row, warnings: [] };
    }
    return { ok: true, confirmed: true, publicationRow: created.row, warnings: [] };
  }
  function proofOptions(publicationLedger, extras) {
    return Object.assign({
      __publicationLedger: publicationLedger,
      __journalRows: [],
      __consumedRows: [],
      __watermarkRows: [],
      __bookkeepingLedger: {
        schema: BOOKKEEPING_LEDGER_SCHEMA,
        createdAtIso: '2026-06-01T10:00:00Z',
        rows: []
      },
      nowIso: '2026-06-01T10:10:00Z'
    }, safeObject(extras));
  }
  async function runExecuteSettlementProof() {
    var blockers = [];
    var warnings = [];
    if (typeof H2O.Desktop.Sync.shapeExecuteEnvelope !== 'function') {
      return failure(['execute-envelope-shaper-unavailable'], warnings);
    }
    var publicationLedger = {
      schema: 'h2o.desktop.sync.execute-publication-ledger.v1',
      createdAtIso: '2026-06-01T10:00:00Z',
      events: []
    };
    var envelope = await proofEnvelope('valid');
    var dispatch = await proofDispatch(envelope, publicationLedger, 'generated');
    var opts = proofOptions(publicationLedger);
    var settled = await settleExecuteEnvelope(envelope, dispatch, opts);
    if (!settled.ok || !settled.consumedRow || !settled.watermarkRow || !settled.bookkeepingRow ||
        safeObject(settled.publicationRow).status !== PUBLICATION_TERMINAL_STATUS ||
        settled.sideEffectSummary.consumedOperationWritten !== true ||
        settled.sideEffectSummary.watermarkWritten !== true ||
        settled.sideEffectSummary.bookkeepingWritten !== true ||
        settled.sideEffectSummary.publicationLedgerTouched !== true) {
      addCode(blockers, 'proof-valid-settlement-failed');
    }
    var duplicate = await settleExecuteEnvelope(envelope, dispatch, opts);
    if (!duplicate.ok || duplicate.metadata.idempotent !== true) addCode(blockers, 'proof-duplicate-settlement-not-idempotent');

    var consumedFailEnvelope = await proofEnvelope('consumed-fail');
    var consumedLedger = { schema: 'h2o.desktop.sync.execute-publication-ledger.v1', createdAtIso: '2026-06-01T10:00:00Z', events: [] };
    var consumedFail = await settleExecuteEnvelope(consumedFailEnvelope, await proofDispatch(consumedFailEnvelope, consumedLedger, 'generated'), proofOptions(consumedLedger, {
      __failConsumedOperation: true
    }));
    if (consumedFail.ok || consumedFail.step !== 'consumed' || consumedFail.sideEffectSummary.watermarkWritten === true) {
      addCode(blockers, 'proof-consumed-failure-did-not-stop');
    }

    var watermarkFailEnvelope = await proofEnvelope('watermark-fail');
    var watermarkLedger = { schema: 'h2o.desktop.sync.execute-publication-ledger.v1', createdAtIso: '2026-06-01T10:00:00Z', events: [] };
    var watermarkFail = await settleExecuteEnvelope(watermarkFailEnvelope, await proofDispatch(watermarkFailEnvelope, watermarkLedger, 'generated'), proofOptions(watermarkLedger, {
      __failWatermark: true
    }));
    if (watermarkFail.ok || watermarkFail.step !== 'watermark' ||
        watermarkFail.sideEffectSummary.consumedOperationWritten !== true ||
        watermarkFail.sideEffectSummary.bookkeepingWritten === true) {
      addCode(blockers, 'proof-watermark-failure-did-not-stop');
    }

    var bookkeepingFailEnvelope = await proofEnvelope('bookkeeping-fail');
    var bookkeepingLedger = { schema: 'h2o.desktop.sync.execute-publication-ledger.v1', createdAtIso: '2026-06-01T10:00:00Z', events: [] };
    var bookkeepingFail = await settleExecuteEnvelope(bookkeepingFailEnvelope, await proofDispatch(bookkeepingFailEnvelope, bookkeepingLedger, 'generated'), proofOptions(bookkeepingLedger, {
      __failBookkeeping: true
    }));
    if (bookkeepingFail.ok || bookkeepingFail.step !== 'bookkeeping' ||
        bookkeepingFail.sideEffectSummary.watermarkWritten !== true ||
        bookkeepingFail.sideEffectSummary.publicationLedgerTouched === true) {
      addCode(blockers, 'proof-bookkeeping-failure-did-not-stop');
    }

    var publicationFailEnvelope = await proofEnvelope('publication-fail');
    var publicationFailLedger = { schema: 'h2o.desktop.sync.execute-publication-ledger.v1', createdAtIso: '2026-06-01T10:00:00Z', events: [] };
    var publicationFail = await settleExecuteEnvelope(publicationFailEnvelope, await proofDispatch(publicationFailEnvelope, publicationFailLedger, 'generated'), proofOptions(publicationFailLedger, {
      __failPublicationFinalization: true
    }));
    if (publicationFail.ok || publicationFail.step !== 'publication-terminal' ||
        publicationFail.sideEffectSummary.bookkeepingWritten !== true ||
        publicationFail.sideEffectSummary.publicationLedgerTouched === true) {
      addCode(blockers, 'proof-publication-failure-did-not-preserve-previous');
    }

    var invalid = await settleExecuteEnvelope({ envelopeKind: 'bad' }, dispatch, proofOptions(publicationLedger));
    if (invalid.ok) addCode(blockers, 'proof-invalid-envelope-accepted');
    var unconfirmed = await settleExecuteEnvelope(await proofEnvelope('unconfirmed'), { ok: true, confirmed: false }, proofOptions(publicationLedger));
    if (unconfirmed.ok) addCode(blockers, 'proof-unconfirmed-dispatch-accepted');
    var privacyEnvelope = await proofEnvelope('privacy', {
      settlementShapes: {
        redactionClass: 'redacted',
        title: 'raw title must not settle'
      }
    });
    var privacyLedger = { schema: 'h2o.desktop.sync.execute-publication-ledger.v1', createdAtIso: '2026-06-01T10:00:00Z', events: [] };
    var privacy = await settleExecuteEnvelope(privacyEnvelope, await proofDispatch(privacyEnvelope, privacyLedger, 'generated'), proofOptions(privacyLedger));
    if (privacy.ok) addCode(blockers, 'proof-privacy-violation-accepted');
    if (!forbiddenSideEffectsFalse(settled.sideEffectSummary)) addCode(blockers, 'proof-forbidden-side-effects-not-false');

    return buildResult({
      ok: blockers.length === 0,
      settled: false,
      blockers: blockers,
      warnings: warnings,
      consumedRow: settled.consumedRow || null,
      watermarkRow: settled.watermarkRow || null,
      bookkeepingRow: settled.bookkeepingRow || null,
      publicationRow: settled.publicationRow || null,
      journalRows: settled.journalRows || [],
      sideEffects: {
        consumedOperationWritten: true,
        watermarkWritten: true,
        bookkeepingWritten: true,
        publicationLedgerTouched: true,
        executeJournalTouched: true
      },
      metadata: {
        proof: 'execute-settlement-writer',
        validConfirmedSettled: settled.ok === true,
        duplicateIdempotent: duplicate.ok === true && duplicate.metadata.idempotent === true,
        consumedFailureStopsBeforeWatermark: consumedFail.ok !== true && consumedFail.sideEffectSummary.watermarkWritten !== true,
        watermarkFailureStopsBeforeBookkeeping: watermarkFail.ok !== true && watermarkFail.sideEffectSummary.bookkeepingWritten !== true,
        bookkeepingFailureStopsBeforePublication: bookkeepingFail.ok !== true && bookkeepingFail.sideEffectSummary.publicationLedgerTouched !== true,
        publicationFailurePreservesPrevious: publicationFail.ok !== true && publicationFail.sideEffectSummary.bookkeepingWritten === true,
        invalidEnvelopeBlocked: invalid.ok !== true,
        unconfirmedDispatchBlocked: unconfirmed.ok !== true,
        privacyViolationBlocked: privacy.ok !== true,
        forbiddenSideEffectsFalse: forbiddenSideEffectsFalse(settled.sideEffectSummary)
      }
    });
  }

  H2O.Desktop.Sync.settleExecuteEnvelope = settleExecuteEnvelope;
  H2O.Desktop.Sync.writeExecuteConsumedOperation = writeExecuteConsumedOperation;
  H2O.Desktop.Sync.advanceExecuteWatermark = advanceExecuteWatermark;
  H2O.Desktop.Sync.appendExecuteBookkeeping = appendExecuteBookkeeping;
  H2O.Desktop.Sync.finalizeExecutePublication = finalizeExecutePublication;
  H2O.Desktop.Sync.runExecuteSettlementProof = runExecuteSettlementProof;
  H2O.Desktop.Sync.__executeSettlementWriterInstalled = true;
  H2O.Desktop.Sync.__executeSettlementWriterVersion = VERSION;
  H2O.Desktop.Sync.__executeSettlementBookkeepingLedgerKey = BOOKKEEPING_LEDGER_KEY;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
