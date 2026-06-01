/* H2O Desktop Sync - F14.6.6 execute native broker
 *
 * Native dispatch branch for Execute Lane envelopes.
 *
 * Safety invariants:
 *   - Native dispatch only through an existing safe invoke wrapper supplied by
 *     the runtime or caller. No raw Tauri invoke probing in this broker.
 *   - No F5 execution, relay dispatch, apply, watermark writes,
 *     consumed-operation writes, final settlement, timers, or polling.
 *   - Confirmation only transitions publication lifecycle after caller
 *     supplies Native success evidence or a trusted dispatch result satisfies
 *     the safe default success check.
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
  if (H2O.Desktop.Sync.__executeNativeBrokerInstalled) return;

  var VERSION = '0.1.0-f14.6.6';
  var RESULT_SCHEMA = 'h2o.desktop.sync.execute-native-broker-result.v1';
  var NATIVE_PAYLOAD_SCHEMA = 'h2o.desktop.sync.execute-native-payload.v1';
  var PUBLICATION_STATUS_PUBLISHED = 'published';
  var SUCCESS_STATUSES = ['ok', 'success', 'succeeded', 'completed', 'confirmed', 'published'];
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
      nativeCalled: f.nativeCalled === true,
      executeJournalTouched: f.executeJournalTouched === true,
      relayOutboxTouched: false,
      relayDispatched: false,
      f5Touched: false,
      f5Executed: false,
      watermarkWritten: false,
      consumedOperationWritten: false,
      finalSettlementWritten: false
    };
  }
  function forbiddenSideEffectsFalse(summary) {
    var s = safeObject(summary);
    return s.relayOutboxTouched === false &&
      s.relayDispatched === false &&
      s.f5Touched === false &&
      s.f5Executed === false &&
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
      retryable: opts.retryable === true,
      terminal: opts.terminal === true,
      publicationRow: opts.publicationRow || null,
      journalRow: opts.journalRow || null,
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
  async function appendDispatchJournal(envelope, publicationRow, options, blockers, warnings) {
    var profile = safeObject(envelope.dispatchProfile);
    var rowInput = {
      journalRowId: cleanString(options.journalRowId || 'execute-native-dispatch:' + cleanString(publicationRow.publicationId)),
      envelopeKind: 'proposal',
      domainId: cleanString(envelope.domainId),
      operationKind: cleanString(envelope.operationKind),
      subjectId: cleanLower(envelope.subjectId),
      lineageId: cleanString(envelope.lineageId),
      dedupeKey: cleanLower(envelope.dedupeKey),
      eventDigest: cleanLower(envelope.eventDigest),
      phase: 'dispatching',
      attempt: Number.isInteger(options.attempt) ? options.attempt : 1,
      lastAttemptAtIso: cleanString(options.nowIso || nowIsoSeconds()),
      dispatchTarget: 'native',
      evidence: {
        publicationId: cleanString(publicationRow.publicationId),
        nativeCommand: cleanString(profile.nativeCommand),
        nativeIdempotent: profile.nativeIdempotent === true
      },
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
  function buildNativePayload(envelope, publicationRow, options) {
    var opts = safeObject(options);
    return {
      schema: NATIVE_PAYLOAD_SCHEMA,
      redactionClass: 'redacted',
      executeEnvelope: envelope,
      publicationRef: {
        publicationId: cleanString(publicationRow.publicationId),
        status: cleanString(publicationRow.status),
        dedupeKey: cleanLower(publicationRow.dedupeKey),
        eventDigest: cleanLower(publicationRow.eventDigest)
      },
      dispatch: {
        attemptedAtIso: cleanString(opts.nowIso || nowIsoSeconds()),
        nativeIdempotent: safeObject(envelope.dispatchProfile).nativeIdempotent === true
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
        errorCode: 'native-invoke-failed',
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
  function nativeSucceeded(evidence, predicate, dispatchResult) {
    if (typeof predicate === 'function') {
      try { return predicate(evidence, dispatchResult) === true; }
      catch (_) { return false; }
    }
    var ev = safeObject(evidence);
    var status = cleanString(ev.status || ev.nativeStatus || ev.resultStatus);
    return ev.ok === true ||
      ev.success === true ||
      SUCCESS_STATUSES.indexOf(status) !== -1 ||
      (Number.isInteger(ev.exitCode) && ev.exitCode === 0 && !ev.error && !ev.errorCode);
  }

  async function dispatchExecuteNative(envelope, options) {
    var opts = safeObject(options);
    var blockers = [];
    var warnings = [];
    var sideEffects = {};
    var validation = validateEnvelope(envelope, blockers, warnings);
    var shapedEnvelope = safeObject(validation.envelope || envelope);
    if (validation.ok !== true) return failure(blockers, warnings, { sideEffects: sideEffects });
    var profile = safeObject(shapedEnvelope.dispatchProfile);
    if (profile.requiresNative !== true) {
      return failure(['execute-native-required'], warnings, { sideEffects: sideEffects });
    }
    if (!cleanString(profile.nativeCommand)) {
      return failure(['execute-nativeCommand-required'], warnings, { sideEffects: sideEffects });
    }
    var forbidden = foreverNoKey(shapedEnvelope);
    if (forbidden) return failure(['execute-native-envelope-contains-forbidden-field'], ['blocked-forbidden-key-' + forbidden], { sideEffects: sideEffects });

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

    var invoke = resolveNativeInvoke(opts);
    if (typeof invoke !== 'function') {
      return failure(['native-invoke-unavailable'], warnings, { publicationRow: publicationRow, sideEffects: sideEffects });
    }

    var journalRow = await appendDispatchJournal(shapedEnvelope, publicationRow, opts, blockers, warnings);
    if (journalRow) sideEffects.executeJournalTouched = true;
    if (blockers.length || !journalRow) {
      return failure(blockers, warnings, { publicationRow: publicationRow, journalRow: journalRow, sideEffects: sideEffects });
    }

    var nativePayload = buildNativePayload(shapedEnvelope, publicationRow, opts);
    var rawNativeResult;
    var nativeResult;
    sideEffects.nativeCalled = true;
    try {
      rawNativeResult = await callNative(invoke, cleanString(profile.nativeCommand), nativePayload);
      nativeResult = normalizeNativeResult(rawNativeResult, null);
    } catch (e) {
      nativeResult = normalizeNativeResult(null, e);
    }
    if (nativeResult.ok !== true) {
      var idempotent = profile.nativeIdempotent === true;
      return failure([idempotent ? 'native-dispatch-failed' : 'native-dispatch-terminal-failed'], warnings, {
        publicationRow: publicationRow,
        journalRow: journalRow,
        nativeCommand: profile.nativeCommand,
        nativePayload: nativePayload,
        nativeResult: nativeResult,
        nativeEvidence: nativeResult,
        retryable: idempotent,
        terminal: !idempotent,
        sideEffects: sideEffects,
        metadata: {
          status: cleanString(nativeResult.status || 'failed'),
          nativeIdempotent: idempotent
        }
      });
    }
    return buildResult({
      ok: true,
      dispatched: true,
      publicationRow: publicationRow,
      journalRow: journalRow,
      nativeCommand: profile.nativeCommand,
      nativePayload: nativePayload,
      nativeResult: nativeResult,
      nativeEvidence: nativeResult,
      warnings: warnings,
      sideEffects: sideEffects,
      metadata: {
        status: cleanString(nativeResult.status || 'completed'),
        nativeIdempotent: profile.nativeIdempotent === true
      }
    });
  }

  async function confirmExecuteNative(dispatchResult, options) {
    var opts = safeObject(options);
    var result = safeObject(dispatchResult);
    var blockers = [];
    var warnings = [];
    var sideEffects = {};
    var evidence = safeObject(opts.nativeEvidence || opts.evidence || result.nativeEvidence || result.nativeResult);
    if (!nativeSucceeded(evidence, opts.successPredicate, result)) {
      return failure(['native-success-evidence-required'], warnings, { nativeEvidence: evidence, sideEffects: sideEffects });
    }
    var publicationRow = safeObject(result.publicationRow || opts.publicationRow);
    var publicationId = cleanString(opts.publicationId || publicationRow.publicationId);
    if (!publicationId) return failure(['execute-publicationId-required'], warnings, { nativeEvidence: evidence, sideEffects: sideEffects });
    if (typeof H2O.Desktop.Sync.transitionExecutePublicationRow !== 'function') {
      return failure(['execute-publication-lifecycle-unavailable'], warnings, { nativeEvidence: evidence, sideEffects: sideEffects });
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
        nativeEvidence: evidence,
        sideEffects: sideEffects
      });
    }
    return buildResult({
      ok: true,
      confirmed: true,
      publicationRow: transition.row,
      nativeCommand: cleanString(result.nativeCommand),
      nativeEvidence: evidence,
      warnings: warnings,
      sideEffects: sideEffects,
      metadata: { status: PUBLICATION_STATUS_PUBLISHED }
    });
  }

  async function proofEnvelope(label, overrides) {
    var args = safeObject(overrides);
    return await H2O.Desktop.Sync.shapeExecuteEnvelope({
      envelopeKind: 'proposal-receipt',
      domainId: 'snapshot',
      operationKind: 'snapshot-proof-operation',
      subjectId: cleanLower(args.subjectId || await sha256Hex('execute-native-proof-subject:' + label)),
      lineageId: 'execute-native-proof-lineage-' + label,
      dedupeKey: cleanLower(args.dedupeKey || await sha256Hex('execute-native-proof-dedupe:' + label)),
      dispatchProfile: {
        requiresF5: false,
        requiresNative: args.requiresNative !== false,
        requiresRelay: false,
        nativeCommand: args.nativeCommand === '' ? '' : cleanString(args.nativeCommand || 'snapshot.proof.preview'),
        nativeIdempotent: args.nativeIdempotent !== false,
        f5QueueKey: '',
        retryPolicy: { maxAttempts: 0, minDelayMs: 0, maxDelayMs: 0, backoffKind: 'none' }
      },
      payloadShapes: {
        proposalReceipt: {
          schema: 'h2o.desktop.sync.execute-native-proof-receipt.v1',
          redactionClass: 'redacted',
          receiptDigest: await sha256Hex('execute-native-proof-receipt:' + label)
        }
      },
      settlementShapes: {
        redactionClass: 'redacted',
        journalPhase: 'accepted',
        settlementDigest: await sha256Hex('execute-native-proof-settlement:' + label)
      },
      createdAtIso: '2026-06-01T10:00:00Z'
    });
  }
  function proofInvoke(resultFactory, calls) {
    return async function (command, payload) {
      calls.push({ command: command, payload: payload });
      return typeof resultFactory === 'function' ? resultFactory(command, payload) : resultFactory;
    };
  }
  async function runExecuteNativeBrokerProof() {
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
    var okPreflight = { ok: true, actionable: true, blockers: [], warnings: [] };
    var baseOpts = {
      trustedPreflightResult: true,
      preflightResult: okPreflight,
      __publicationLedger: publicationLedger,
      __journalRows: journalRows,
      safeInvokeNative: proofInvoke({ ok: true, status: 'completed', nativeReceiptId: 'proof-native-success' }, nativeCalls),
      nowIso: '2026-06-01T10:00:00Z'
    };

    var valid = await proofEnvelope('valid');
    var dispatched = await dispatchExecuteNative(valid, baseOpts);
    if (!dispatched.ok || !dispatched.journalRow ||
        dispatched.sideEffectSummary.publicationLedgerTouched !== true ||
        dispatched.sideEffectSummary.nativeCalled !== true ||
        dispatched.sideEffectSummary.executeJournalTouched !== true) {
      addCode(blockers, 'proof-valid-native-dispatch-failed');
    }

    var noNative = await dispatchExecuteNative(await proofEnvelope('no-native', { requiresNative: false }), Object.assign({}, baseOpts, {
      nowIso: '2026-06-01T10:01:00Z'
    }));
    if (noNative.ok) addCode(blockers, 'proof-missing-native-requirement-passed');

    var missingCommandRaw = await proofEnvelope('missing-command');
    missingCommandRaw.dispatchProfile.nativeCommand = '';
    var missingCommand = await dispatchExecuteNative(missingCommandRaw, Object.assign({}, baseOpts, {
      nowIso: '2026-06-01T10:02:00Z'
    }));
    if (missingCommand.ok) addCode(blockers, 'proof-missing-native-command-passed');

    var beforeBlockedCalls = nativeCalls.length;
    var blockedPreflight = await dispatchExecuteNative(await proofEnvelope('blocked-preflight'), Object.assign({}, baseOpts, {
      preflightResult: { ok: false, actionable: false, blockers: ['proof-preflight-blocked'], warnings: [] },
      nowIso: '2026-06-01T10:03:00Z'
    }));
    var blockedPreflightNoNativeInvoke = blockedPreflight.ok !== true && nativeCalls.length === beforeBlockedCalls;
    if (blockedPreflight.ok || nativeCalls.length !== beforeBlockedCalls) {
      addCode(blockers, 'proof-preflight-blocked-invoked-native');
    }

    var missingInvoke = await dispatchExecuteNative(await proofEnvelope('missing-invoke'), {
      trustedPreflightResult: true,
      preflightResult: okPreflight,
      __publicationLedger: publicationLedger,
      __journalRows: [],
      nowIso: '2026-06-01T10:04:00Z'
    });
    if (missingInvoke.ok || codeList(missingInvoke.blockers).indexOf('native-invoke-unavailable') === -1) {
      addCode(blockers, 'proof-missing-invoke-not-blocked');
    }

    var confirmed = await confirmExecuteNative(dispatched, {
      __publicationLedger: publicationLedger,
      nowIso: '2026-06-01T10:05:00Z'
    });
    if (!confirmed.ok || cleanString(safeObject(confirmed.publicationRow).status) !== 'published') {
      addCode(blockers, 'proof-native-success-confirm-failed');
    }

    var idempotentFailure = await dispatchExecuteNative(await proofEnvelope('idempotent-failure'), Object.assign({}, baseOpts, {
      safeInvokeNative: proofInvoke({ ok: false, status: 'failed', errorCode: 'proof-native-failure' }, nativeCalls),
      nowIso: '2026-06-01T10:06:00Z'
    }));
    if (idempotentFailure.ok || idempotentFailure.retryable !== true || idempotentFailure.terminal === true) {
      addCode(blockers, 'proof-idempotent-failure-not-retryable');
    }

    var nonIdempotentFailure = await dispatchExecuteNative(await proofEnvelope('non-idempotent-failure', { nativeIdempotent: false }), Object.assign({}, baseOpts, {
      safeInvokeNative: proofInvoke({ ok: false, status: 'failed', errorCode: 'proof-native-failure' }, nativeCalls),
      nowIso: '2026-06-01T10:07:00Z'
    }));
    if (nonIdempotentFailure.ok || nonIdempotentFailure.terminal !== true || nonIdempotentFailure.retryable === true) {
      addCode(blockers, 'proof-non-idempotent-failure-not-terminal');
    }

    if (!forbiddenSideEffectsFalse(dispatched.sideEffectSummary) ||
        !forbiddenSideEffectsFalse(confirmed.sideEffectSummary) ||
        dispatched.sideEffectSummary.relayOutboxTouched !== false ||
        confirmed.sideEffectSummary.relayOutboxTouched !== false) {
      addCode(blockers, 'proof-forbidden-side-effects-not-false');
    }

    return buildResult({
      ok: blockers.length === 0,
      dispatched: false,
      blockers: blockers,
      warnings: warnings,
      publicationRow: confirmed.publicationRow || dispatched.publicationRow || null,
      journalRow: dispatched.journalRow || null,
      nativeCommand: dispatched.nativeCommand,
      nativeEvidence: dispatched.nativeEvidence,
      sideEffects: {
        publicationLedgerTouched: true,
        nativeCalled: true,
        executeJournalTouched: true
      },
      metadata: {
        proof: 'execute-native-broker',
        validNativeDispatched: dispatched.ok === true,
        missingNativeRequirementBlocked: noNative.ok !== true,
        missingNativeCommandBlocked: missingCommand.ok !== true,
        blockedPreflightNoNativeInvoke: blockedPreflightNoNativeInvoke,
        missingInvokeBlocked: missingInvoke.ok !== true,
        nativeSuccessPublished: confirmed.ok === true && safeObject(confirmed.publicationRow).status === 'published',
        idempotentFailureRetryable: idempotentFailure.ok !== true && idempotentFailure.retryable === true,
        nonIdempotentFailureTerminal: nonIdempotentFailure.ok !== true && nonIdempotentFailure.terminal === true,
        forbiddenSideEffectsFalse: forbiddenSideEffectsFalse(dispatched.sideEffectSummary) && forbiddenSideEffectsFalse(confirmed.sideEffectSummary)
      }
    });
  }

  H2O.Desktop.Sync.dispatchExecuteNative = dispatchExecuteNative;
  H2O.Desktop.Sync.confirmExecuteNative = confirmExecuteNative;
  H2O.Desktop.Sync.runExecuteNativeBrokerProof = runExecuteNativeBrokerProof;
  H2O.Desktop.Sync.__executeNativeBrokerInstalled = true;
  H2O.Desktop.Sync.__executeNativeBrokerVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
