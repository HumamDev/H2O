/* H2O Desktop Sync - F14.6.7 execute F5 broker
 *
 * F5 dispatch branch for Execute Lane envelopes.
 *
 * Safety invariants:
 *   - Reads the existing Snapshot F5 Review Queue and closes approved rows only
 *     after the required Native seal/restore request succeeds.
 *   - No relay dispatch, generic Native dispatch, watermark writes,
 *     consumed-operation writes, final settlement, timers, or polling.
 *   - Publication is transitioned to published only by confirmExecuteF5 after
 *     dispatchResult carries successful F5 close evidence.
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
  if (H2O.Desktop.Sync.__executeF5BrokerInstalled) return;

  var VERSION = '0.1.0-f14.6.7';
  var RESULT_SCHEMA = 'h2o.desktop.sync.execute-f5-broker-result.v1';
  var NATIVE_PAYLOAD_SCHEMA = 'h2o.desktop.sync.execute-f5-native-request.v1';
  var PUBLICATION_STATUS_PUBLISHED = 'published';
  var STATE_APPROVED_SEAL = 'approved-seal';
  var STATE_APPROVED_RESTORE = 'approved-restore';
  var STATE_AUTO_EXPIRED = 'auto-expired';
  var STATE_CLOSED_SEALED = 'closed-sealed';
  var STATE_CLOSED_RESTORED = 'closed-restored';
  var STATE_PENDING = 'pending';
  var CLOSURE_SEALED = 'closed-sealed';
  var CLOSURE_RESTORED = 'closed-restored';
  var REQUEST_TERMINAL_SEAL = 'terminal-seal';
  var REQUEST_RESTORE = 'restore-from-retained';
  var SUCCESS_STATUSES = ['ok', 'success', 'succeeded', 'completed', 'confirmed', 'published', 'closed'];
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

  function sideEffectSummary(flags) {
    var f = safeObject(flags);
    return {
      publicationLedgerTouched: f.publicationLedgerTouched === true,
      f5Touched: f.f5Touched === true,
      nativeCalled: f.nativeCalled === true,
      executeJournalTouched: f.executeJournalTouched === true,
      relayOutboxTouched: false,
      relayDispatched: false,
      watermarkWritten: false,
      consumedOperationWritten: false,
      finalSettlementWritten: false
    };
  }
  function forbiddenSideEffectsFalse(summary) {
    var s = safeObject(summary);
    return s.relayOutboxTouched === false &&
      s.relayDispatched === false &&
      s.watermarkWritten === false &&
      s.consumedOperationWritten === false &&
      s.finalSettlementWritten === false;
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
      dispatched: opts.dispatched === true,
      confirmed: opts.confirmed === true,
      publicationRow: opts.publicationRow || null,
      journalRow: opts.journalRow || null,
      f5Review: opts.f5Review || null,
      f5CloseResult: opts.f5CloseResult || null,
      nativeCommand: cleanString(opts.nativeCommand),
      nativePayload: opts.nativePayload || null,
      nativeResult: opts.nativeResult || null,
      nativeEvidence: opts.nativeEvidence || null,
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
      dispatched: false,
      confirmed: false,
      blockers: blockers,
      warnings: warnings
    }));
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
  async function resolvePreflight(envelope, options, blockers, warnings) {
    if (options.trustedPreflightResult === true && isObject(options.preflightResult)) {
      return options.preflightResult;
    }
    if (typeof H2O.Desktop.Sync.runExecutePreflightGate !== 'function') {
      addCode(blockers, 'execute-preflight-gate-unavailable');
      return { ok: false, actionable: false, blockers: ['execute-preflight-gate-unavailable'], warnings: [] };
    }
    var result = await H2O.Desktop.Sync.runExecutePreflightGate(envelope, safeObject(options.preflightOptions));
    codeList(result.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(result.warnings).forEach(function (code) { addCode(warnings, code); });
    return result;
  }
  async function resolvePublicationRow(envelope, preflightResult, options, blockers, warnings) {
    var lifecycleOptions = Object.assign({}, safeObject(options.publicationOptions));
    if (options.__publicationLedger) lifecycleOptions.__memoryLedger = options.__publicationLedger;
    var existing = null;
    if (typeof H2O.Desktop.Sync.listExecutePublicationRowsByDedupe === 'function') {
      try {
        var list = await H2O.Desktop.Sync.listExecutePublicationRowsByDedupe(envelope.dedupeKey, lifecycleOptions);
        codeList(list.blockers).forEach(function (code) { addCode(warnings, code); });
        existing = asArray(list.rows)[0] || null;
      } catch (_) { /* create path will report if ledger is unavailable */ }
    }
    if (existing) return existing;
    if (typeof H2O.Desktop.Sync.createExecutePublicationRow !== 'function') {
      addCode(blockers, 'execute-publication-lifecycle-unavailable');
      return null;
    }
    var created = await H2O.Desktop.Sync.createExecutePublicationRow(envelope, preflightResult, lifecycleOptions);
    codeList(created.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(created.warnings).forEach(function (code) { addCode(warnings, code); });
    return created.ok === true ? safeObject(created.row) : null;
  }
  async function appendJournal(envelope, publicationRow, phase, target, evidence, options, blockers, warnings) {
    var rowInput = {
      journalRowId: cleanString(options.journalRowId || 'execute-f5-' + phase + ':' + cleanString(publicationRow.publicationId)),
      envelopeKind: 'proposal',
      domainId: cleanString(envelope.domainId),
      operationKind: cleanString(envelope.operationKind),
      subjectId: cleanLower(envelope.subjectId),
      lineageId: cleanString(envelope.lineageId),
      dedupeKey: cleanLower(envelope.dedupeKey),
      eventDigest: cleanLower(envelope.eventDigest),
      phase: phase,
      attempt: Number.isInteger(options.attempt) ? options.attempt : 1,
      lastAttemptAtIso: cleanString(options.nowIso || nowIsoSeconds()),
      dispatchTarget: target,
      evidence: safeObject(evidence),
      blockers: [],
      warnings: [],
      createdAtIso: cleanString(options.nowIso || nowIsoSeconds())
    };
    if (Array.isArray(options.__journalRows)) {
      var duplicate = options.__journalRows.some(function (row) {
        return cleanString(row.journalRowId) === rowInput.journalRowId &&
          cleanLower(row.eventDigest) === rowInput.eventDigest;
      });
      if (duplicate) {
        addCode(blockers, 'duplicate-execute-journal-row');
        return null;
      }
      var shaped = typeof H2O.Desktop.Sync.shapeExecuteJournalRow === 'function'
        ? await H2O.Desktop.Sync.shapeExecuteJournalRow(rowInput)
        : rowInput;
      options.__journalRows.push(shaped);
      return shaped;
    }
    if (typeof H2O.Desktop.Sync.appendExecuteJournalRow !== 'function') {
      addCode(blockers, 'execute-journal-unavailable');
      return null;
    }
    var result = await H2O.Desktop.Sync.appendExecuteJournalRow(rowInput);
    codeList(result.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(result.warnings).forEach(function (code) { addCode(warnings, code); });
    return result.ok === true ? safeObject(result.row) : null;
  }
  function resolveNativeInvoke(options) {
    var opts = safeObject(options);
    var platform = safeObject(global.H2O && global.H2O.Studio && global.H2O.Studio.platform);
    var native = safeObject(platform.native);
    var candidates = [
      opts.safeInvokeNative,
      opts.invokeNativeSafely,
      opts.safeInvoke,
      H2O.Desktop.Sync.safeExecuteNativeInvoke,
      H2O.Desktop.Sync.invokeExecuteNativeSafely,
      H2O.Desktop.Sync.safeNativeInvoke,
      H2O.Desktop.Sync.safeTauriInvoke,
      H2O.Desktop.Sync.invokeTauriSafely,
      native.safeInvoke,
      native.invokeSafe
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      if (typeof candidates[i] === 'function') return candidates[i];
    }
    return null;
  }
  function resolveF5Get(options) {
    return options.getF5ReviewById || H2O.Desktop.Sync.getF5ReviewById;
  }
  function resolveF5Close(options) {
    return options.closeF5Review || H2O.Desktop.Sync.closeF5Review;
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
      physicalDeviceIdHash: await sha256Hex('execute-f5-broker-device'),
      installIdHash: await sha256Hex('execute-f5-broker-install'),
      syncPeerIdHash: await sha256Hex('execute-f5-broker-peer'),
      surfaceKind: 'desktop-tauri'
    };
  }
  async function resolveF5Review(envelope, options, blockers, warnings) {
    var reviewId = cleanLower(options.f5ReviewId || safeObject(envelope.dispatchProfile).f5QueueKey);
    if (!isSha256Hex(reviewId)) {
      addCode(blockers, 'execute-f5-review-id-invalid');
      return null;
    }
    var get = resolveF5Get(options);
    if (typeof get !== 'function') {
      addCode(blockers, 'execute-f5-review-lookup-unavailable');
      return null;
    }
    var result;
    try {
      result = await get(reviewId);
    } catch (_) {
      addCode(blockers, 'execute-f5-review-lookup-failed');
      return null;
    }
    codeList(result && result.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(result && result.warnings).forEach(function (code) { addCode(warnings, code); });
    var found = result && (result.status === 'found' || safeObject(result.metadata).found === true || asArray(result.rows).length > 0);
    if (!found) {
      addCode(blockers, 'execute-f5-review-missing');
      return {
        reviewId: reviewId,
        currentState: '',
        row: null,
        result: result || null
      };
    }
    return {
      reviewId: cleanLower(result.reviewId || reviewId),
      currentState: cleanString(result.currentState || safeObject(result.metadata).currentState),
      row: asArray(result.rows)[0] || safeObject(safeObject(result.metadata).reviewRow),
      result: result
    };
  }
  function closureForState(state) {
    if (state === STATE_APPROVED_RESTORE) {
      return {
        requestKind: REQUEST_RESTORE,
        closureKind: CLOSURE_RESTORED,
        closeState: STATE_CLOSED_RESTORED,
        command: 'snapshot.f5.restoreFromRetained'
      };
    }
    if (state === STATE_APPROVED_SEAL || state === STATE_AUTO_EXPIRED) {
      return {
        requestKind: REQUEST_TERMINAL_SEAL,
        closureKind: CLOSURE_SEALED,
        closeState: STATE_CLOSED_SEALED,
        command: 'snapshot.f5.terminalSeal'
      };
    }
    return null;
  }
  function stateBlocker(state) {
    if (!state) return 'execute-f5-review-missing';
    if (state === STATE_PENDING) return 'execute-f5-review-pending';
    if (state === STATE_CLOSED_SEALED || state === STATE_CLOSED_RESTORED) return 'execute-f5-review-closed';
    return 'execute-f5-review-not-actionable';
  }
  function buildNativePayload(envelope, publicationRow, f5Review, closure, options) {
    var row = safeObject(f5Review.row);
    return {
      schema: NATIVE_PAYLOAD_SCHEMA,
      redactionClass: 'redacted',
      requestKind: closure.requestKind,
      closureKind: closure.closureKind,
      reviewId: cleanLower(f5Review.reviewId),
      reviewState: cleanString(f5Review.currentState),
      subjectId: cleanLower(row.subjectId || envelope.subjectId),
      lineageId: cleanString(row.lineageId || envelope.lineageId),
      candidateId: cleanString(row.candidateId || ''),
      proposalEnvelopeId: cleanString(row.proposalEnvelopeId || ''),
      executeEnvelope: envelope,
      publicationRef: {
        publicationId: cleanString(publicationRow.publicationId),
        status: cleanString(publicationRow.status),
        dedupeKey: cleanLower(publicationRow.dedupeKey),
        eventDigest: cleanLower(publicationRow.eventDigest)
      },
      dispatch: {
        attemptedAtIso: cleanString(options.nowIso || nowIsoSeconds())
      }
    };
  }
  async function callNative(invoke, command, payload) {
    if (invoke.length >= 2) return await invoke(command, payload);
    return await invoke({ command: command, payload: payload });
  }
  function normalizeNativeResult(raw, caughtError) {
    var obj = safeObject(raw);
    if (caughtError) {
      return {
        ok: false,
        status: 'failed',
        errorCode: 'f5-native-invoke-failed',
        message: cleanString(caughtError && caughtError.message ? caughtError.message : caughtError)
      };
    }
    if (!isObject(raw)) {
      return { ok: raw === true, status: raw === true ? 'completed' : 'failed', value: raw };
    }
    var status = cleanString(obj.status || obj.nativeStatus || obj.resultStatus);
    var ok = obj.ok === true || obj.success === true || SUCCESS_STATUSES.indexOf(status) !== -1 ||
      (Number.isInteger(obj.exitCode) && obj.exitCode === 0 && !obj.error && !obj.errorCode);
    return Object.assign({}, obj, {
      ok: ok,
      status: status || (ok ? 'completed' : 'failed')
    });
  }
  async function applyDigestForNative(nativeResult, envelope, f5Review, closure) {
    var supplied = cleanLower(nativeResult.applyEventDigest || nativeResult.eventDigest || nativeResult.receiptDigest);
    if (isSha256Hex(supplied)) return supplied;
    return await sha256Hex(canonicalJson({
      requestKind: closure.requestKind,
      closureKind: closure.closureKind,
      reviewId: f5Review.reviewId,
      envelopeDigest: envelope.eventDigest,
      nativeStatus: nativeResult.status || '',
      nativeReceiptId: nativeResult.nativeReceiptId || nativeResult.receiptId || ''
    }));
  }
  function closeSucceeded(closeResult, expectedState) {
    return safeObject(closeResult).ok === true &&
      cleanString(closeResult.currentState) === expectedState &&
      codeList(closeResult.blockers).length === 0;
  }

  async function dispatchExecuteF5(envelope, options) {
    var opts = safeObject(options);
    var blockers = [];
    var warnings = [];
    var sideEffects = {};
    var validation = validateEnvelope(envelope, blockers, warnings);
    var shapedEnvelope = safeObject(validation.envelope || envelope);
    if (validation.ok !== true) return failure(blockers, warnings, { sideEffects: sideEffects });
    var profile = safeObject(shapedEnvelope.dispatchProfile);
    if (profile.requiresF5 !== true) {
      return failure(['execute-f5-required'], warnings, { sideEffects: sideEffects });
    }
    var forbidden = foreverNoKey(shapedEnvelope);
    if (forbidden) return failure(['execute-f5-envelope-contains-forbidden-field'], ['blocked-forbidden-key-' + forbidden], { sideEffects: sideEffects });

    var preflightBlockers = [];
    var preflight = await resolvePreflight(shapedEnvelope, opts, preflightBlockers, warnings);
    if (preflight.ok !== true || preflight.actionable !== true) {
      preflightBlockers.forEach(function (code) { addCode(blockers, code); });
      if (!blockers.length) addCode(blockers, 'execute-preflight-blocked');
      var blockedRow = await resolvePublicationRow(shapedEnvelope, preflight, opts, [], warnings);
      if (blockedRow) sideEffects.publicationLedgerTouched = true;
      return failure(blockers, warnings, { publicationRow: blockedRow, sideEffects: sideEffects });
    }
    preflightBlockers.forEach(function (code) { addCode(blockers, code); });
    if (blockers.length) return failure(blockers, warnings, { sideEffects: sideEffects });

    var publicationRow = await resolvePublicationRow(shapedEnvelope, preflight, opts, blockers, warnings);
    if (publicationRow) sideEffects.publicationLedgerTouched = true;
    if (blockers.length || !publicationRow) return failure(blockers, warnings, { publicationRow: publicationRow, sideEffects: sideEffects });

    var f5Review = await resolveF5Review(shapedEnvelope, opts, blockers, warnings);
    if (blockers.length || !f5Review) {
      var missingJournal = publicationRow ? await appendJournal(shapedEnvelope, publicationRow, 'requires-f5-closure', 'f5', {
        reviewId: cleanLower(profile.f5QueueKey),
        reason: 'f5-review-unavailable'
      }, opts, [], warnings) : null;
      if (missingJournal) sideEffects.executeJournalTouched = true;
      return failure(blockers, warnings, {
        publicationRow: publicationRow,
        journalRow: missingJournal,
        f5Review: f5Review,
        sideEffects: sideEffects
      });
    }

    var closure = closureForState(f5Review.currentState);
    if (!closure) {
      var blockedJournal = await appendJournal(shapedEnvelope, publicationRow, 'requires-f5-closure', 'f5', {
        reviewId: f5Review.reviewId,
        currentState: f5Review.currentState
      }, opts, [], warnings);
      if (blockedJournal) sideEffects.executeJournalTouched = true;
      return failure([stateBlocker(f5Review.currentState)], warnings, {
        publicationRow: publicationRow,
        journalRow: blockedJournal,
        f5Review: f5Review,
        sideEffects: sideEffects
      });
    }

    var close = resolveF5Close(opts);
    if (typeof close !== 'function') {
      var noCloseJournal = await appendJournal(shapedEnvelope, publicationRow, 'requires-f5-closure', 'f5', {
        reviewId: f5Review.reviewId,
        currentState: f5Review.currentState,
        reason: 'f5-close-unavailable'
      }, opts, [], warnings);
      if (noCloseJournal) sideEffects.executeJournalTouched = true;
      return failure(['f5-close-unavailable'], warnings, {
        publicationRow: publicationRow,
        journalRow: noCloseJournal,
        f5Review: f5Review,
        sideEffects: sideEffects
      });
    }
    var invoke = resolveNativeInvoke(opts);
    if (typeof invoke !== 'function') {
      var noInvokeJournal = await appendJournal(shapedEnvelope, publicationRow, 'requires-f5-closure', 'f5', {
        reviewId: f5Review.reviewId,
        currentState: f5Review.currentState,
        reason: 'native-invoke-unavailable'
      }, opts, [], warnings);
      if (noInvokeJournal) sideEffects.executeJournalTouched = true;
      return failure(['native-invoke-unavailable'], warnings, {
        publicationRow: publicationRow,
        journalRow: noInvokeJournal,
        f5Review: f5Review,
        sideEffects: sideEffects
      });
    }

    var nativeCommand = cleanString(opts[closure.requestKind === REQUEST_RESTORE ? 'restoreNativeCommand' : 'sealNativeCommand']) || closure.command;
    var nativePayload = buildNativePayload(shapedEnvelope, publicationRow, f5Review, closure, opts);
    var journalRow = await appendJournal(shapedEnvelope, publicationRow, 'dispatching', 'f5', {
      reviewId: f5Review.reviewId,
      currentState: f5Review.currentState,
      requestKind: closure.requestKind,
      nativeCommand: nativeCommand
    }, opts, blockers, warnings);
    if (journalRow) sideEffects.executeJournalTouched = true;
    if (blockers.length || !journalRow) {
      return failure(blockers, warnings, {
        publicationRow: publicationRow,
        journalRow: journalRow,
        f5Review: f5Review,
        nativePayload: nativePayload,
        sideEffects: sideEffects
      });
    }

    var nativeResult;
    sideEffects.nativeCalled = true;
    try {
      nativeResult = normalizeNativeResult(await callNative(invoke, nativeCommand, nativePayload), null);
    } catch (e) {
      nativeResult = normalizeNativeResult(null, e);
    }
    if (nativeResult.ok !== true) {
      return failure(['f5-native-dispatch-failed'], warnings, {
        publicationRow: publicationRow,
        journalRow: journalRow,
        f5Review: f5Review,
        nativeCommand: nativeCommand,
        nativePayload: nativePayload,
        nativeResult: nativeResult,
        nativeEvidence: nativeResult,
        sideEffects: sideEffects,
        metadata: {
          requestKind: closure.requestKind,
          closureKind: closure.closureKind,
          f5Closed: false
        }
      });
    }

    var applyEventDigest = await applyDigestForNative(nativeResult, shapedEnvelope, f5Review, closure);
    var peer = await actorPeer(opts);
    var closeResult;
    try {
      closeResult = await close({
        reviewId: f5Review.reviewId,
        closureKind: closure.closureKind,
        applyEventDigest: applyEventDigest,
        appliedAtIso: cleanString(opts.nowIso || nowIsoSeconds()),
        actorPeer: peer,
        observedAtIso: cleanString(opts.nowIso || nowIsoSeconds())
      });
    } catch (_) {
      closeResult = { ok: false, blockers: ['f5-close-failed'], warnings: [] };
    }
    sideEffects.f5Touched = true;
    codeList(closeResult && closeResult.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(closeResult && closeResult.warnings).forEach(function (code) { addCode(warnings, code); });
    if (!closeSucceeded(closeResult, closure.closeState)) {
      return failure(blockers.length ? blockers : ['f5-close-failed'], warnings, {
        publicationRow: publicationRow,
        journalRow: journalRow,
        f5Review: f5Review,
        f5CloseResult: closeResult,
        nativeCommand: nativeCommand,
        nativePayload: nativePayload,
        nativeResult: nativeResult,
        nativeEvidence: nativeResult,
        sideEffects: sideEffects,
        metadata: {
          requestKind: closure.requestKind,
          closureKind: closure.closureKind,
          f5Closed: false
        }
      });
    }
    return buildResult({
      ok: true,
      dispatched: true,
      publicationRow: publicationRow,
      journalRow: journalRow,
      f5Review: f5Review,
      f5CloseResult: closeResult,
      nativeCommand: nativeCommand,
      nativePayload: nativePayload,
      nativeResult: nativeResult,
      nativeEvidence: nativeResult,
      warnings: warnings,
      sideEffects: sideEffects,
      metadata: {
        requestKind: closure.requestKind,
        closureKind: closure.closureKind,
        f5Closed: true,
        closeState: closure.closeState
      }
    });
  }

  async function confirmExecuteF5(dispatchResult, options) {
    var opts = safeObject(options);
    var result = safeObject(dispatchResult);
    var blockers = [];
    var warnings = [];
    var sideEffects = {};
    var closeResult = safeObject(opts.f5CloseResult || result.f5CloseResult);
    var closeState = cleanString(closeResult.currentState);
    if (closeResult.ok !== true || (closeState !== STATE_CLOSED_SEALED && closeState !== STATE_CLOSED_RESTORED)) {
      return failure(['f5-close-success-evidence-required'], warnings, {
        f5CloseResult: closeResult,
        sideEffects: sideEffects
      });
    }
    var publicationRow = safeObject(result.publicationRow || opts.publicationRow);
    var publicationId = cleanString(opts.publicationId || publicationRow.publicationId);
    if (!publicationId) return failure(['execute-publicationId-required'], warnings, { f5CloseResult: closeResult, sideEffects: sideEffects });
    if (typeof H2O.Desktop.Sync.transitionExecutePublicationRow !== 'function') {
      return failure(['execute-publication-lifecycle-unavailable'], warnings, { f5CloseResult: closeResult, sideEffects: sideEffects });
    }
    var lifecycleOptions = Object.assign({}, safeObject(opts.publicationOptions));
    if (opts.__publicationLedger) lifecycleOptions.__memoryLedger = opts.__publicationLedger;
    var transition = await H2O.Desktop.Sync.transitionExecutePublicationRow(
      publicationId,
      PUBLICATION_STATUS_PUBLISHED,
      Object.assign({}, lifecycleOptions, {
        publicationEventAtIso: cleanString(opts.nowIso || nowIsoSeconds())
      })
    );
    sideEffects.publicationLedgerTouched = transition.appended === true || transition.ok === true;
    codeList(transition.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(transition.warnings).forEach(function (code) { addCode(warnings, code); });
    if (transition.ok !== true) {
      return failure(blockers.length ? blockers : ['execute-publication-transition-failed'], warnings, {
        f5CloseResult: closeResult,
        sideEffects: sideEffects
      });
    }
    return buildResult({
      ok: true,
      confirmed: true,
      publicationRow: transition.row,
      f5CloseResult: closeResult,
      warnings: warnings,
      sideEffects: sideEffects,
      metadata: { status: PUBLICATION_STATUS_PUBLISHED, f5CloseState: closeState }
    });
  }

  async function proofEnvelope(label, reviewId) {
    return await H2O.Desktop.Sync.shapeExecuteEnvelope({
      envelopeKind: 'proposal-receipt',
      domainId: 'snapshot',
      operationKind: 'snapshot-proof-operation',
      subjectId: await sha256Hex('execute-f5-proof-subject:' + label),
      lineageId: 'execute-f5-proof-lineage-' + label,
      dedupeKey: await sha256Hex('execute-f5-proof-dedupe:' + label),
      dispatchProfile: {
        requiresF5: true,
        requiresNative: false,
        requiresRelay: false,
        nativeCommand: '',
        nativeIdempotent: true,
        f5QueueKey: reviewId,
        retryPolicy: { maxAttempts: 0, minDelayMs: 0, maxDelayMs: 0, backoffKind: 'none' }
      },
      payloadShapes: {
        proposalReceipt: {
          schema: 'h2o.desktop.sync.execute-f5-proof-receipt.v1',
          redactionClass: 'redacted',
          receiptDigest: await sha256Hex('execute-f5-proof-receipt:' + label)
        }
      },
      settlementShapes: {
        redactionClass: 'redacted',
        journalPhase: 'accepted',
        settlementDigest: await sha256Hex('execute-f5-proof-settlement:' + label)
      },
      createdAtIso: '2026-06-01T10:00:00Z'
    });
  }
  function proofQueue(reviews, closed) {
    return {
      get: async function (reviewId) {
        var review = safeObject(reviews[cleanLower(reviewId)]);
        if (!review.reviewId) {
          return { ok: true, status: 'not-found', reviewId: cleanLower(reviewId), rows: [], blockers: [], warnings: [], metadata: { found: false } };
        }
        return {
          ok: true,
          status: 'found',
          reviewId: review.reviewId,
          currentState: review.currentState,
          rows: [review],
          blockers: [],
          warnings: [],
          metadata: { found: true, reviewRow: review }
        };
      },
      close: async function (input) {
        var args = safeObject(input);
        closed.push(args);
        var review = safeObject(reviews[cleanLower(args.reviewId)]);
        var next = args.closureKind === CLOSURE_RESTORED ? STATE_CLOSED_RESTORED : STATE_CLOSED_SEALED;
        review.currentState = next;
        reviews[cleanLower(args.reviewId)] = review;
        return {
          ok: true,
          status: 'closed',
          reviewId: cleanLower(args.reviewId),
          currentState: next,
          blockers: [],
          warnings: [],
          metadata: { closureKind: args.closureKind }
        };
      }
    };
  }
  function proofInvoke(resultFactory, calls) {
    return async function (command, payload) {
      calls.push({ command: command, payload: payload });
      return typeof resultFactory === 'function' ? resultFactory(command, payload) : resultFactory;
    };
  }
  function reviewRow(reviewId, currentState, subjectId, lineageId) {
    return {
      reviewId: reviewId,
      currentState: currentState,
      subjectId: subjectId,
      lineageId: lineageId,
      candidateId: 'proof-candidate-' + currentState,
      proposalEnvelopeId: 'proof-proposal-' + currentState,
      reviewStatusVersion: 2
    };
  }
  async function runExecuteF5BrokerProof() {
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
    var journalRows = [];
    var nativeCalls = [];
    var closeCalls = [];
    var ids = {
      seal: await sha256Hex('execute-f5-proof-review:seal'),
      expired: await sha256Hex('execute-f5-proof-review:expired'),
      restore: await sha256Hex('execute-f5-proof-review:restore'),
      pending: await sha256Hex('execute-f5-proof-review:pending'),
      closed: await sha256Hex('execute-f5-proof-review:closed'),
      missing: await sha256Hex('execute-f5-proof-review:missing'),
      noNative: await sha256Hex('execute-f5-proof-review:no-native'),
      failNative: await sha256Hex('execute-f5-proof-review:fail-native')
    };
    var reviews = {};
    Object.keys(ids).forEach(function (key) {
      if (key === 'missing') return;
      var state = STATE_APPROVED_SEAL;
      if (key === 'expired') state = STATE_AUTO_EXPIRED;
      if (key === 'restore') state = STATE_APPROVED_RESTORE;
      if (key === 'pending') state = STATE_PENDING;
      if (key === 'closed') state = STATE_CLOSED_SEALED;
      reviews[ids[key]] = reviewRow(ids[key], state, '', 'execute-f5-proof-lineage-' + key);
    });
    for (var rKey in reviews) {
      if (Object.prototype.hasOwnProperty.call(reviews, rKey)) {
        reviews[rKey].subjectId = await sha256Hex('execute-f5-proof-review-subject:' + rKey);
      }
    }
    var queue = proofQueue(reviews, closeCalls);
    var okPreflight = { ok: true, actionable: true, blockers: [], warnings: [] };
    var baseOpts = {
      trustedPreflightResult: true,
      preflightResult: okPreflight,
      __publicationLedger: publicationLedger,
      __journalRows: journalRows,
      getF5ReviewById: queue.get,
      closeF5Review: queue.close,
      safeInvokeNative: proofInvoke(async function () {
        return { ok: true, status: 'completed', applyEventDigest: await sha256Hex('execute-f5-proof-apply:' + nativeCalls.length) };
      }, nativeCalls),
      nowIso: '2026-06-01T10:00:00Z'
    };

    var seal = await dispatchExecuteF5(await proofEnvelope('seal', ids.seal), baseOpts);
    if (!seal.ok || safeObject(seal.f5CloseResult).currentState !== STATE_CLOSED_SEALED ||
        safeObject(seal.nativePayload).requestKind !== REQUEST_TERMINAL_SEAL) {
      addCode(blockers, 'proof-approved-seal-failed');
    }
    var sealConfirm = await confirmExecuteF5(seal, {
      __publicationLedger: publicationLedger,
      nowIso: '2026-06-01T10:01:00Z'
    });
    if (!sealConfirm.ok || safeObject(sealConfirm.publicationRow).status !== PUBLICATION_STATUS_PUBLISHED) {
      addCode(blockers, 'proof-seal-confirm-publish-failed');
    }

    var expired = await dispatchExecuteF5(await proofEnvelope('expired', ids.expired), Object.assign({}, baseOpts, {
      nowIso: '2026-06-01T10:02:00Z'
    }));
    if (!expired.ok || safeObject(expired.f5CloseResult).currentState !== STATE_CLOSED_SEALED ||
        safeObject(expired.nativePayload).requestKind !== REQUEST_TERMINAL_SEAL) {
      addCode(blockers, 'proof-auto-expired-seal-failed');
    }

    var restore = await dispatchExecuteF5(await proofEnvelope('restore', ids.restore), Object.assign({}, baseOpts, {
      nowIso: '2026-06-01T10:03:00Z'
    }));
    if (!restore.ok || safeObject(restore.f5CloseResult).currentState !== STATE_CLOSED_RESTORED ||
        safeObject(restore.nativePayload).requestKind !== REQUEST_RESTORE) {
      addCode(blockers, 'proof-approved-restore-failed');
    }

    var beforePendingNative = nativeCalls.length;
    var pending = await dispatchExecuteF5(await proofEnvelope('pending', ids.pending), Object.assign({}, baseOpts, {
      nowIso: '2026-06-01T10:04:00Z'
    }));
    if (pending.ok || codeList(pending.blockers).indexOf('execute-f5-review-pending') === -1 ||
        nativeCalls.length !== beforePendingNative) {
      addCode(blockers, 'proof-pending-not-blocked');
    }

    var closed = await dispatchExecuteF5(await proofEnvelope('closed', ids.closed), Object.assign({}, baseOpts, {
      nowIso: '2026-06-01T10:05:00Z'
    }));
    if (closed.ok || codeList(closed.blockers).indexOf('execute-f5-review-closed') === -1) {
      addCode(blockers, 'proof-closed-not-blocked');
    }

    var missing = await dispatchExecuteF5(await proofEnvelope('missing', ids.missing), Object.assign({}, baseOpts, {
      nowIso: '2026-06-01T10:06:00Z'
    }));
    if (missing.ok || codeList(missing.blockers).indexOf('execute-f5-review-missing') === -1) {
      addCode(blockers, 'proof-missing-review-not-blocked');
    }

    var noNative = await dispatchExecuteF5(await proofEnvelope('no-native', ids.noNative), {
      trustedPreflightResult: true,
      preflightResult: okPreflight,
      __publicationLedger: publicationLedger,
      __journalRows: journalRows,
      getF5ReviewById: queue.get,
      closeF5Review: queue.close,
      nowIso: '2026-06-01T10:07:00Z'
    });
    if (noNative.ok || codeList(noNative.blockers).indexOf('native-invoke-unavailable') === -1) {
      addCode(blockers, 'proof-native-unavailable-not-blocked');
    }

    var beforeFailureClose = closeCalls.length;
    var nativeFailure = await dispatchExecuteF5(await proofEnvelope('fail-native', ids.failNative), Object.assign({}, baseOpts, {
      safeInvokeNative: proofInvoke({ ok: false, status: 'failed', errorCode: 'proof-native-failure' }, nativeCalls),
      nowIso: '2026-06-01T10:08:00Z'
    }));
    if (nativeFailure.ok || closeCalls.length !== beforeFailureClose ||
        codeList(nativeFailure.blockers).indexOf('f5-native-dispatch-failed') === -1) {
      addCode(blockers, 'proof-native-failure-closed-review');
    }

    if (!forbiddenSideEffectsFalse(seal.sideEffectSummary) ||
        !forbiddenSideEffectsFalse(sealConfirm.sideEffectSummary) ||
        seal.sideEffectSummary.relayOutboxTouched !== false ||
        sealConfirm.sideEffectSummary.relayOutboxTouched !== false) {
      addCode(blockers, 'proof-forbidden-side-effects-not-false');
    }

    return buildResult({
      ok: blockers.length === 0,
      dispatched: false,
      blockers: blockers,
      warnings: warnings,
      publicationRow: sealConfirm.publicationRow || seal.publicationRow || null,
      journalRow: seal.journalRow || null,
      f5CloseResult: seal.f5CloseResult || null,
      nativeEvidence: seal.nativeEvidence || null,
      sideEffects: {
        publicationLedgerTouched: true,
        f5Touched: true,
        nativeCalled: true,
        executeJournalTouched: true
      },
      metadata: {
        proof: 'execute-f5-broker',
        approvedSealClosedSealed: seal.ok === true && safeObject(seal.f5CloseResult).currentState === STATE_CLOSED_SEALED,
        autoExpiredClosedSealed: expired.ok === true && safeObject(expired.f5CloseResult).currentState === STATE_CLOSED_SEALED,
        approvedRestoreClosedRestored: restore.ok === true && safeObject(restore.f5CloseResult).currentState === STATE_CLOSED_RESTORED,
        pendingBlocked: pending.ok !== true,
        closedBlocked: closed.ok !== true,
        missingBlocked: missing.ok !== true,
        nativeUnavailableBlocked: noNative.ok !== true,
        nativeFailureDidNotClose: nativeFailure.ok !== true && closeCalls.length === beforeFailureClose,
        forbiddenSideEffectsFalse: forbiddenSideEffectsFalse(seal.sideEffectSummary) && forbiddenSideEffectsFalse(sealConfirm.sideEffectSummary)
      }
    });
  }

  H2O.Desktop.Sync.dispatchExecuteF5 = dispatchExecuteF5;
  H2O.Desktop.Sync.confirmExecuteF5 = confirmExecuteF5;
  H2O.Desktop.Sync.runExecuteF5BrokerProof = runExecuteF5BrokerProof;
  H2O.Desktop.Sync.__executeF5BrokerInstalled = true;
  H2O.Desktop.Sync.__executeF5BrokerVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
