/* H2O Desktop Sync - F14.6.9 execute resume on boot
 *
 * Resume coordinator for interrupted Execute Lane journal rows.
 *
 * Safety invariants:
 *   - No new adapter, dispatch type, UI, timer, or polling behavior.
 *   - Invokes only existing Execute preflight, broker, and settlement writer
 *     functions according to journal phase classification.
 *   - Every non-skipped resume action appends an Execute journal resume row
 *     with metadata before attempting the action.
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
  if (H2O.Desktop.Sync.__executeResumeOnBootInstalled) return;

  var VERSION = '0.1.0-f14.6.9';
  var RESULT_SCHEMA = 'h2o.desktop.sync.execute-resume-result.v1';
  var TERMINAL_PHASES = ['preflight-blocked', 'settled', 'bookkept', 'failed'];
  var SETTLEMENT_PHASES = [
    'confirmed',
    'settling-consumed',
    'settling-watermark',
    'settling-bookkeeping',
    'settling-publication-terminal'
  ];
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
      journalTouched: f.journalTouched === true,
      relayOutboxTouched: f.relayOutboxTouched === true,
      nativeCalled: f.nativeCalled === true,
      f5Touched: f.f5Touched === true,
      consumedOperationWritten: f.consumedOperationWritten === true,
      watermarkWritten: f.watermarkWritten === true,
      bookkeepingWritten: f.bookkeepingWritten === true,
      publicationLedgerTouched: f.publicationLedgerTouched === true
    };
  }
  function mergeSideEffects(target, source) {
    var s = safeObject(source);
    if (s.journalTouched || s.executeJournalTouched) target.journalTouched = true;
    if (s.relayOutboxTouched) target.relayOutboxTouched = true;
    if (s.nativeCalled) target.nativeCalled = true;
    if (s.f5Touched) target.f5Touched = true;
    if (s.consumedOperationWritten) target.consumedOperationWritten = true;
    if (s.watermarkWritten) target.watermarkWritten = true;
    if (s.bookkeepingWritten) target.bookkeepingWritten = true;
    if (s.publicationLedgerTouched) target.publicationLedgerTouched = true;
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
      action: cleanString(opts.action),
      skipped: opts.skipped === true,
      blocked: opts.blocked === true,
      row: opts.row || null,
      resumeJournalRow: opts.resumeJournalRow || null,
      result: opts.result || null,
      results: opts.results || [],
      counts: opts.counts || null,
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
          actionable: payload.ok && !payload.skipped,
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
      blocked: true,
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
  function domainPrivacyTag(domainId) {
    if (domainId === 'chat') return 'chat.metadata';
    if (domainId === 'snapshot') return 'snapshot.conversation';
    if (domainId === 'capture') return 'capture.artifact';
    return cleanString(domainId);
  }
  function scanPrivacyFor(domainId, target, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    var result = null;
    if (kernel && typeof kernel.scanDomainForbiddenFields === 'function') {
      try { result = kernel.scanDomainForbiddenFields(domainPrivacyTag(domainId), target); }
      catch (_) { addCode(blockers, 'execute-resume-privacy-scan-threw'); }
    } else if (kernel && typeof kernel.scanPrivacy === 'function') {
      try {
        result = kernel.scanPrivacy(target, {
          subjectType: domainPrivacyTag(domainId),
          redactionClass: 'redacted',
          allowedRedactionClasses: ['redacted', 'metadata-only'],
          forbiddenList: FOREVER_NO_FIELDS,
          foreverNoFields: FOREVER_NO_FIELDS
        });
      } catch (_) { addCode(blockers, 'execute-resume-privacy-scan-threw'); }
    }
    if (result) {
      codeList(result.blockers).forEach(function (code) { addCode(blockers, code); });
      codeList(result.warnings).forEach(function (code) { addCode(warnings, code); });
    }
    var forbidden = foreverNoKey(target);
    if (forbidden) {
      addCode(blockers, 'execute-resume-privacy-violation');
      addCode(warnings, 'blocked-forbidden-key-' + forbidden);
    }
  }
  function rowPhase(row) { return cleanString(safeObject(row).phase); }
  function rowTarget(row) { return cleanString(safeObject(row).dispatchTarget || 'none'); }
  function rowEvidence(row) { return safeObject(safeObject(row).evidence); }
  function isTerminalPhase(phase) { return TERMINAL_PHASES.indexOf(cleanString(phase)) !== -1; }
  function isSettlementPhase(phase) { return SETTLEMENT_PHASES.indexOf(cleanString(phase)) !== -1; }

  function classifyExecuteResumeAction(row, options) {
    var r = safeObject(row);
    var evidence = rowEvidence(r);
    var phase = rowPhase(r);
    var target = rowTarget(r);
    var opts = safeObject(options);
    if (!phase) return { action: 'block', blocked: true, reason: 'execute-resume-phase-missing' };
    if (isTerminalPhase(phase)) return { action: 'skip-terminal', skipped: true, reason: 'terminal-phase' };
    if (phase === 'accepted') return { action: 'preflight', reason: 'accepted-row' };
    if (phase === 'requires-f5-closure') return { action: 'f5-closure', reason: 'requires-f5-closure' };
    if (phase === 'dispatching') {
      if (target === 'relay') {
        return evidence.resumeSafe === false
          ? { action: 'safe-block', blocked: true, reason: 'relay-dispatch-not-safe-to-resume' }
          : { action: 'dispatch-relay', reason: 'relay-dispatching' };
      }
      if (target === 'native') {
        var nativeIdempotent = evidence.nativeIdempotent === true || safeObject(opts.dispatchProfile).nativeIdempotent === true;
        return nativeIdempotent
          ? { action: 'dispatch-native', reason: 'native-idempotent-dispatching' }
          : { action: 'safe-block', blocked: true, reason: 'native-dispatch-non-idempotent' };
      }
      if (target === 'f5') return { action: 'dispatch-f5', reason: 'f5-dispatching' };
      return { action: 'safe-block', blocked: true, reason: 'dispatch-target-not-resumable' };
    }
    if (phase === 'confirmed') return { action: 'settle', reason: 'confirmed-row' };
    if (phase === 'settling-consumed') return { action: 'settle-from-consumed', reason: 'settling-consumed' };
    if (phase === 'settling-watermark') return { action: 'settle-from-watermark', reason: 'settling-watermark' };
    if (phase === 'settling-bookkeeping') return { action: 'settle-from-bookkeeping', reason: 'settling-bookkeeping' };
    if (phase === 'settling-publication-terminal') return { action: 'settle-publication-terminal', reason: 'settling-publication-terminal' };
    return { action: 'safe-block', blocked: true, reason: 'execute-resume-phase-unsupported' };
  }

  async function shapeMinimalEnvelope(row, options) {
    var r = safeObject(row);
    var evidence = rowEvidence(r);
    var target = rowTarget(r);
    var profile = Object.assign({
      requiresF5: target === 'f5' || r.phase === 'requires-f5-closure',
      requiresNative: target === 'native',
      requiresRelay: target === 'relay',
      nativeCommand: target === 'native' ? cleanString(evidence.nativeCommand || 'execute.resume.native') : '',
      nativeIdempotent: evidence.nativeIdempotent === true,
      f5QueueKey: cleanLower(evidence.reviewId || evidence.f5QueueKey || ''),
      retryPolicy: { maxAttempts: 0, minDelayMs: 0, maxDelayMs: 0, backoffKind: 'none' }
    }, safeObject(options.dispatchProfile || evidence.dispatchProfile));
    if (profile.requiresF5 && !profile.f5QueueKey && isSha256Hex(evidence.reviewId)) profile.f5QueueKey = evidence.reviewId;
    if (typeof H2O.Desktop.Sync.shapeExecuteEnvelope !== 'function') return {
      envelopeKind: 'proposal-receipt',
      domainId: cleanString(r.domainId),
      operationKind: cleanString(r.operationKind),
      subjectId: cleanLower(r.subjectId),
      lineageId: cleanString(r.lineageId),
      dedupeKey: cleanLower(r.dedupeKey),
      eventDigest: cleanLower(r.eventDigest),
      dispatchProfile: profile,
      payloadShapes: { resume: { schema: 'h2o.desktop.sync.execute-resume-payload.v1', redactionClass: 'redacted' } },
      settlementShapes: { redactionClass: 'redacted', revisionHash: cleanLower(r.eventDigest), settlementDigest: cleanLower(r.eventDigest) },
      createdAtIso: cleanString(r.createdAtIso || nowIsoSeconds())
    };
    return await H2O.Desktop.Sync.shapeExecuteEnvelope({
      envelopeKind: 'proposal-receipt',
      domainId: cleanString(r.domainId),
      operationKind: cleanString(r.operationKind),
      subjectId: cleanLower(r.subjectId),
      lineageId: cleanString(r.lineageId),
      dedupeKey: cleanLower(r.dedupeKey),
      dispatchProfile: profile,
      payloadShapes: safeObject(evidence.payloadShapes || options.payloadShapes || {
        resume: { schema: 'h2o.desktop.sync.execute-resume-payload.v1', redactionClass: 'redacted' }
      }),
      settlementShapes: safeObject(evidence.settlementShapes || options.settlementShapes || {
        redactionClass: 'redacted',
        revisionHash: cleanLower(r.eventDigest),
        settlementDigest: cleanLower(r.eventDigest)
      }),
      createdAtIso: cleanString(r.createdAtIso || nowIsoSeconds())
    });
  }
  async function resolveEnvelope(row, options) {
    var opts = safeObject(options);
    var evidence = rowEvidence(row);
    if (isObject(opts.envelope)) return opts.envelope;
    if (isObject(evidence.executeEnvelope)) return evidence.executeEnvelope;
    if (isObject(opts.envelopes) && isObject(opts.envelopes[cleanLower(row.dedupeKey)])) return opts.envelopes[cleanLower(row.dedupeKey)];
    if (typeof opts.resolveExecuteEnvelope === 'function') {
      var resolved = await opts.resolveExecuteEnvelope(row);
      if (isObject(resolved)) return resolved;
    }
    return await shapeMinimalEnvelope(row, opts);
  }
  function resolveDispatchResult(row, options) {
    var opts = safeObject(options);
    var evidence = rowEvidence(row);
    if (isObject(opts.dispatchResult)) return opts.dispatchResult;
    if (isObject(evidence.dispatchResult)) return evidence.dispatchResult;
    if (isObject(opts.dispatchResults) && isObject(opts.dispatchResults[cleanLower(row.dedupeKey)])) {
      return opts.dispatchResults[cleanLower(row.dedupeKey)];
    }
    return {
      ok: true,
      confirmed: true,
      publicationRow: safeObject(evidence.publicationRow || {
        publicationId: cleanString(evidence.publicationId || 'execute-resume-publication:' + cleanLower(row.dedupeKey)),
        status: 'published',
        dedupeKey: cleanLower(row.dedupeKey),
        eventDigest: cleanLower(row.eventDigest)
      }),
      warnings: []
    };
  }
  async function appendResumeJournal(row, classification, options, blockers, warnings) {
    var opts = safeObject(options);
    var r = safeObject(row);
    var action = cleanString(classification.action);
    var atIso = cleanString(opts.nowIso || nowIsoSeconds());
    var rowInput = {
      journalRowId: await sha256Hex({
        schema: 'h2o.desktop.sync.execute-resume-journal-row-id.v1',
        sourceJournalRowId: cleanString(r.journalRowId),
        action: action,
        eventDigest: cleanLower(r.eventDigest)
      }),
      envelopeKind: cleanString(r.envelopeKind || 'proposal'),
      domainId: cleanString(r.domainId),
      operationKind: cleanString(r.operationKind),
      subjectId: cleanLower(r.subjectId),
      lineageId: cleanString(r.lineageId),
      dedupeKey: cleanLower(r.dedupeKey),
      eventDigest: cleanLower(r.eventDigest),
      phase: rowPhase(r),
      attempt: (Number.isInteger(r.attempt) ? r.attempt : 0) + 1,
      lastAttemptAtIso: atIso,
      dispatchTarget: rowTarget(r),
      evidence: {
        resume: true,
        resumeAction: action,
        resumeReason: cleanString(classification.reason),
        sourceJournalRowId: cleanString(r.journalRowId)
      },
      blockers: [],
      warnings: [],
      createdAtIso: atIso
    };
    scanPrivacyFor(r.domainId, rowInput, blockers, warnings);
    if (blockers.length) return { ok: false, blockers: blockers, warnings: warnings };
    if (Array.isArray(opts.__journalRows)) {
      var existing = opts.__journalRows.filter(function (candidate) {
        return cleanString(candidate.journalRowId) === rowInput.journalRowId &&
          cleanLower(candidate.eventDigest) === rowInput.eventDigest;
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
      return { ok: false, blockers: blockers, warnings: warnings };
    }
    var appended = await H2O.Desktop.Sync.appendExecuteJournalRow(rowInput);
    if (appended.ok === true) return appended;
    if (codeList(appended.blockers).indexOf('duplicate-execute-journal-row') !== -1) {
      return { ok: true, row: appended.row || rowInput, appended: false, idempotent: true, blockers: [], warnings: codeList(appended.warnings) };
    }
    codeList(appended.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(appended.warnings).forEach(function (code) { addCode(warnings, code); });
    return appended;
  }
  function mergeChildResult(sideEffects, blockers, warnings, child) {
    mergeSideEffects(sideEffects, safeObject(child).sideEffectSummary);
    codeList(child && child.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(child && child.warnings).forEach(function (code) { addCode(warnings, code); });
  }
  function commonOptions(options) {
    var opts = safeObject(options);
    return Object.assign({}, opts, {
      trustedPreflightResult: opts.trustedPreflightResult,
      preflightResult: opts.preflightResult,
      __publicationLedger: opts.__publicationLedger,
      __journalRows: opts.__journalRows,
      __consumedRows: opts.__consumedRows,
      __watermarkRows: opts.__watermarkRows,
      __bookkeepingLedger: opts.__bookkeepingLedger,
      nowIso: opts.nowIso
    });
  }

  async function invokeResumeAction(row, classification, envelope, dispatchResult, options) {
    var opts = commonOptions(options);
    var action = classification.action;
    if (action === 'preflight') {
      var preflight = opts.runExecutePreflightGate || H2O.Desktop.Sync.runExecutePreflightGate;
      if (typeof preflight !== 'function') return failure(['execute-preflight-gate-unavailable'], [], { action: action });
      return await preflight(envelope, safeObject(opts.preflightOptions));
    }
    if (action === 'dispatch-relay') {
      var relay = opts.dispatchExecuteRelay || H2O.Desktop.Sync.dispatchExecuteRelay;
      if (typeof relay !== 'function') return failure(['execute-relay-broker-unavailable'], [], { action: action });
      return await relay(envelope, opts);
    }
    if (action === 'dispatch-native') {
      var native = opts.dispatchExecuteNative || H2O.Desktop.Sync.dispatchExecuteNative;
      if (typeof native !== 'function') return failure(['execute-native-broker-unavailable'], [], { action: action });
      return await native(envelope, opts);
    }
    if (action === 'dispatch-f5' || action === 'f5-closure') {
      var f5 = opts.dispatchExecuteF5 || H2O.Desktop.Sync.dispatchExecuteF5;
      if (typeof f5 !== 'function') return failure(['execute-f5-broker-unavailable'], [], { action: action });
      return await f5(envelope, opts);
    }
    if (action === 'settle') {
      var settle = opts.settleExecuteEnvelope || H2O.Desktop.Sync.settleExecuteEnvelope;
      if (typeof settle !== 'function') return failure(['execute-settlement-writer-unavailable'], [], { action: action });
      return await settle(envelope, dispatchResult, opts);
    }
    if (action === 'settle-from-consumed') {
      var consumed = opts.writeExecuteConsumedOperation || H2O.Desktop.Sync.writeExecuteConsumedOperation;
      if (typeof consumed !== 'function') return failure(['execute-settlement-writer-unavailable'], [], { action: action });
      return await consumed(envelope, dispatchResult, opts);
    }
    if (action === 'settle-from-watermark') {
      var watermark = opts.advanceExecuteWatermark || H2O.Desktop.Sync.advanceExecuteWatermark;
      if (typeof watermark !== 'function') return failure(['execute-settlement-writer-unavailable'], [], { action: action });
      return await watermark(envelope, dispatchResult, opts);
    }
    if (action === 'settle-from-bookkeeping') {
      var bookkeeping = opts.appendExecuteBookkeeping || H2O.Desktop.Sync.appendExecuteBookkeeping;
      if (typeof bookkeeping !== 'function') return failure(['execute-settlement-writer-unavailable'], [], { action: action });
      return await bookkeeping(envelope, dispatchResult, opts);
    }
    if (action === 'settle-publication-terminal') {
      var publication = opts.finalizeExecutePublication || H2O.Desktop.Sync.finalizeExecutePublication;
      if (typeof publication !== 'function') return failure(['execute-settlement-writer-unavailable'], [], { action: action });
      return await publication(envelope, dispatchResult, opts);
    }
    return failure(['execute-resume-action-unsupported'], [], { action: action });
  }

  async function resumeExecuteJournalRow(row, options) {
    var opts = safeObject(options);
    var blockers = [];
    var warnings = [];
    var sideEffects = {};
    var r = safeObject(row);
    var classification = classifyExecuteResumeAction(r, opts);
    scanPrivacyFor(r.domainId, { row: r, classification: classification }, blockers, warnings);
    if (blockers.length) return failure(blockers, warnings, { row: r, action: classification.action, sideEffects: sideEffects });
    if (classification.skipped) {
      return buildResult({
        ok: true,
        skipped: true,
        action: classification.action,
        row: r,
        sideEffects: sideEffects,
        metadata: { reason: classification.reason }
      });
    }
    if (classification.blocked) {
      var blockedJournal = await appendResumeJournal(r, classification, opts, blockers, warnings);
      if (blockedJournal.appended) sideEffects.journalTouched = true;
      return failure([classification.reason || 'execute-resume-safe-block'], warnings, {
        row: r,
        action: classification.action,
        resumeJournalRow: blockedJournal.row || null,
        sideEffects: sideEffects,
        metadata: { reason: classification.reason }
      });
    }
    var resumeJournal = await appendResumeJournal(r, classification, opts, blockers, warnings);
    if (resumeJournal.appended) sideEffects.journalTouched = true;
    if (blockers.length || resumeJournal.ok !== true) {
      return failure(blockers.length ? blockers : ['execute-resume-journal-append-failed'], warnings, {
        row: r,
        action: classification.action,
        resumeJournalRow: resumeJournal.row || null,
        sideEffects: sideEffects
      });
    }
    var envelope = await resolveEnvelope(r, opts);
    var dispatchResult = isSettlementPhase(rowPhase(r)) ? resolveDispatchResult(r, opts) : null;
    scanPrivacyFor(cleanString(envelope.domainId || r.domainId), { envelope: envelope, dispatchResult: dispatchResult }, blockers, warnings);
    if (blockers.length) {
      return failure(blockers, warnings, {
        row: r,
        action: classification.action,
        resumeJournalRow: resumeJournal.row || null,
        sideEffects: sideEffects
      });
    }
    var child = await invokeResumeAction(r, classification, envelope, dispatchResult, opts);
    mergeChildResult(sideEffects, blockers, warnings, child);
    if (child.ok !== true && blockers.length === 0) addCode(blockers, 'execute-resume-action-failed');
    if (blockers.length) {
      return failure(blockers, warnings, {
        row: r,
        action: classification.action,
        resumeJournalRow: resumeJournal.row || null,
        result: child,
        sideEffects: sideEffects,
        metadata: { reason: classification.reason }
      });
    }
    return buildResult({
      ok: true,
      action: classification.action,
      row: r,
      resumeJournalRow: resumeJournal.row || null,
      result: child,
      sideEffects: sideEffects,
      warnings: warnings,
      metadata: { reason: classification.reason }
    });
  }

  async function readResumeRows(options) {
    var opts = safeObject(options);
    if (Array.isArray(opts.rows)) {
      return { ok: true, rows: opts.rows.slice(), blockers: [], warnings: [] };
    }
    var rows = [];
    if (typeof H2O.Desktop.Sync.listExecuteJournalRowsInFlight !== 'function') {
      return { ok: false, rows: [], blockers: ['execute-journal-inflight-query-unavailable'], warnings: [] };
    }
    var result = await H2O.Desktop.Sync.listExecuteJournalRowsInFlight(opts.query || {});
    if (result.ok !== true) return { ok: false, rows: [], blockers: codeList(result.blockers), warnings: codeList(result.warnings) };
    rows = asArray(result.rows).slice();
    asArray(opts.extraRows).forEach(function (row) { rows.push(row); });
    return { ok: true, rows: rows, blockers: [], warnings: codeList(result.warnings) };
  }
  async function resumeExecuteOnBoot(options) {
    var opts = safeObject(options);
    var blockers = [];
    var warnings = [];
    var sideEffects = {};
    var read = await readResumeRows(opts);
    if (read.ok !== true) return failure(read.blockers, read.warnings, { action: 'resume-on-boot', sideEffects: sideEffects });
    codeList(read.warnings).forEach(function (code) { addCode(warnings, code); });
    var results = [];
    for (var i = 0; i < read.rows.length; i += 1) {
      var result = await resumeExecuteJournalRow(read.rows[i], opts);
      results.push(result);
      mergeSideEffects(sideEffects, result.sideEffectSummary);
      codeList(result.warnings).forEach(function (code) { addCode(warnings, code); });
      if (result.ok !== true && opts.stopOnBlocker === true) {
        codeList(result.blockers).forEach(function (code) { addCode(blockers, code); });
        break;
      }
    }
    return buildResult({
      ok: blockers.length === 0,
      action: 'resume-on-boot',
      results: results,
      blockers: blockers,
      warnings: warnings,
      sideEffects: sideEffects,
      counts: {
        rows: read.rows.length,
        resumed: results.filter(function (item) { return item.ok === true && item.skipped !== true; }).length,
        skipped: results.filter(function (item) { return item.skipped === true; }).length,
        blocked: results.filter(function (item) { return item.ok !== true; }).length
      }
    });
  }

  async function proofEnvelopeForRow(row, overrides) {
    return await shapeMinimalEnvelope(row, safeObject(overrides));
  }
  async function proofRow(label, phase, target, evidence) {
    var baseHash = await sha256Hex('execute-resume-proof:' + label);
    return await H2O.Desktop.Sync.shapeExecuteJournalRow({
      journalRowId: 'execute-resume-proof-' + label,
      envelopeKind: 'proposal',
      domainId: 'snapshot',
      operationKind: 'snapshot-proof-operation',
      subjectId: await sha256Hex('execute-resume-subject:' + label),
      lineageId: 'execute-resume-lineage-' + label,
      dedupeKey: await sha256Hex('execute-resume-dedupe:' + label),
      eventDigest: baseHash,
      phase: phase,
      attempt: 1,
      lastAttemptAtIso: '2026-06-01T10:00:00Z',
      dispatchTarget: target || 'none',
      evidence: evidence || {},
      createdAtIso: '2026-06-01T10:00:00Z'
    });
  }
  function proofResult(name, side) {
    return {
      ok: true,
      name: name,
      confirmed: name === 'settle' ? true : false,
      blockers: [],
      warnings: [],
      sideEffectSummary: sideEffectSummary(side || {})
    };
  }
  async function runExecuteResumeProof() {
    var blockers = [];
    var warnings = [];
    if (typeof H2O.Desktop.Sync.shapeExecuteJournalRow !== 'function') return failure(['execute-journal-shaper-unavailable'], warnings);
    var calls = [];
    var opts = {
      __journalRows: [],
      nowIso: '2026-06-01T10:10:00Z',
      runExecutePreflightGate: async function () { calls.push('preflight'); return proofResult('preflight', {}); },
      dispatchExecuteRelay: async function () { calls.push('relay'); return proofResult('relay', { relayOutboxTouched: true, journalTouched: true }); },
      dispatchExecuteNative: async function () { calls.push('native'); return proofResult('native', { nativeCalled: true, journalTouched: true }); },
      dispatchExecuteF5: async function () { calls.push('f5'); return proofResult('f5', { f5Touched: true, nativeCalled: true, journalTouched: true }); },
      settleExecuteEnvelope: async function () { calls.push('settle'); return proofResult('settle', { consumedOperationWritten: true, watermarkWritten: true, bookkeepingWritten: true, publicationLedgerTouched: true, journalTouched: true }); },
      writeExecuteConsumedOperation: async function () { calls.push('consumed'); return proofResult('consumed', { consumedOperationWritten: true, journalTouched: true }); },
      advanceExecuteWatermark: async function () { calls.push('watermark'); return proofResult('watermark', { watermarkWritten: true, journalTouched: true }); },
      appendExecuteBookkeeping: async function () { calls.push('bookkeeping'); return proofResult('bookkeeping', { bookkeepingWritten: true, journalTouched: true }); },
      finalizeExecutePublication: async function () { calls.push('publication'); return proofResult('publication', { publicationLedgerTouched: true, journalTouched: true }); }
    };
    var accepted = await proofRow('accepted', 'accepted', 'none');
    var relay = await proofRow('relay', 'dispatching', 'relay', { resumeSafe: true });
    var nativeIdem = await proofRow('native-idem', 'dispatching', 'native', { nativeIdempotent: true, nativeCommand: 'snapshot.resume' });
    var nativeNo = await proofRow('native-no', 'dispatching', 'native', { nativeIdempotent: false });
    var confirmed = await proofRow('confirmed', 'confirmed', 'none', { publicationId: 'resume-proof-publication-confirmed' });
    var settlingConsumed = await proofRow('settling-consumed', 'settling-consumed', 'none');
    var settlingWatermark = await proofRow('settling-watermark', 'settling-watermark', 'none');
    var settlingBookkeeping = await proofRow('settling-bookkeeping', 'settling-bookkeeping', 'none');
    var settlingPublication = await proofRow('settling-publication', 'settling-publication-terminal', 'none', { publicationId: 'resume-proof-publication-terminal' });
    var f5 = await proofRow('f5', 'requires-f5-closure', 'f5', { reviewId: await sha256Hex('execute-resume-f5-review') });
    var terminal = await proofRow('terminal', 'settled', 'none');
    var rows = [accepted, relay, nativeIdem, nativeNo, confirmed, settlingConsumed, settlingWatermark, settlingBookkeeping, settlingPublication, f5, terminal];

    var acceptedResult = await resumeExecuteJournalRow(accepted, opts);
    if (acceptedResult.action !== 'preflight' || calls.indexOf('preflight') === -1) addCode(blockers, 'proof-accepted-not-preflight');
    var relayResult = await resumeExecuteJournalRow(relay, opts);
    if (relayResult.action !== 'dispatch-relay' || relayResult.sideEffectSummary.relayOutboxTouched !== true) addCode(blockers, 'proof-relay-not-resumed');
    var nativeResult = await resumeExecuteJournalRow(nativeIdem, opts);
    if (nativeResult.action !== 'dispatch-native' || nativeResult.sideEffectSummary.nativeCalled !== true) addCode(blockers, 'proof-native-idempotent-not-resumed');
    var nativeBlocked = await resumeExecuteJournalRow(nativeNo, opts);
    if (nativeBlocked.ok || nativeBlocked.action !== 'safe-block') addCode(blockers, 'proof-native-non-idempotent-not-blocked');
    var confirmedResult = await resumeExecuteJournalRow(confirmed, opts);
    if (confirmedResult.action !== 'settle' || confirmedResult.sideEffectSummary.consumedOperationWritten !== true) addCode(blockers, 'proof-confirmed-not-settled');
    var consumedResult = await resumeExecuteJournalRow(settlingConsumed, opts);
    if (consumedResult.action !== 'settle-from-consumed' || consumedResult.sideEffectSummary.consumedOperationWritten !== true) addCode(blockers, 'proof-settling-consumed-not-resumed');
    var watermarkResult = await resumeExecuteJournalRow(settlingWatermark, opts);
    if (watermarkResult.action !== 'settle-from-watermark' || watermarkResult.sideEffectSummary.watermarkWritten !== true) addCode(blockers, 'proof-settling-watermark-not-resumed');
    var bookkeepingResult = await resumeExecuteJournalRow(settlingBookkeeping, opts);
    if (bookkeepingResult.action !== 'settle-from-bookkeeping' || bookkeepingResult.sideEffectSummary.bookkeepingWritten !== true) addCode(blockers, 'proof-settling-bookkeeping-not-resumed');
    var publicationResult = await resumeExecuteJournalRow(settlingPublication, opts);
    if (publicationResult.action !== 'settle-publication-terminal' || publicationResult.sideEffectSummary.publicationLedgerTouched !== true) addCode(blockers, 'proof-settling-publication-not-resumed');
    var f5Result = await resumeExecuteJournalRow(f5, opts);
    if (f5Result.action !== 'f5-closure' || f5Result.sideEffectSummary.f5Touched !== true) addCode(blockers, 'proof-f5-closure-not-resumed');
    var terminalResult = await resumeExecuteJournalRow(terminal, opts);
    if (!terminalResult.skipped) addCode(blockers, 'proof-terminal-not-skipped');
    var beforeDuplicate = opts.__journalRows.length;
    var duplicate = await resumeExecuteJournalRow(confirmed, opts);
    if (!duplicate.ok || opts.__journalRows.length !== beforeDuplicate) addCode(blockers, 'proof-duplicate-resume-not-idempotent');
    var privacy = await resumeExecuteJournalRow(await proofRow('privacy', 'accepted', 'none', { title: 'raw title' }), opts);
    if (privacy.ok) addCode(blockers, 'proof-privacy-violation-accepted');
    var boot = await resumeExecuteOnBoot(Object.assign({}, opts, { rows: rows }));
    if (!boot.ok || !boot.counts || boot.counts.rows !== rows.length) addCode(blockers, 'proof-resume-on-boot-failed');

    return buildResult({
      ok: blockers.length === 0,
      action: 'proof',
      results: [acceptedResult, relayResult, nativeResult, nativeBlocked, confirmedResult, consumedResult, watermarkResult, bookkeepingResult, publicationResult, f5Result, terminalResult],
      blockers: blockers,
      warnings: warnings,
      sideEffects: {
        journalTouched: true,
        relayOutboxTouched: relayResult.sideEffectSummary.relayOutboxTouched === true,
        nativeCalled: nativeResult.sideEffectSummary.nativeCalled === true,
        f5Touched: f5Result.sideEffectSummary.f5Touched === true,
        consumedOperationWritten: confirmedResult.sideEffectSummary.consumedOperationWritten === true,
        watermarkWritten: watermarkResult.sideEffectSummary.watermarkWritten === true,
        bookkeepingWritten: bookkeepingResult.sideEffectSummary.bookkeepingWritten === true,
        publicationLedgerTouched: publicationResult.sideEffectSummary.publicationLedgerTouched === true
      },
      metadata: {
        proof: 'execute-resume-on-boot',
        acceptedPreflight: acceptedResult.action === 'preflight',
        relayResumeOrBlocked: relayResult.ok === true && relayResult.action === 'dispatch-relay',
        nativeIdempotentResumed: nativeResult.ok === true && nativeResult.action === 'dispatch-native',
        nativeNonIdempotentBlocked: nativeBlocked.ok !== true,
        confirmedSettled: confirmedResult.ok === true && confirmedResult.action === 'settle',
        settlingConsumedResumed: consumedResult.ok === true && consumedResult.action === 'settle-from-consumed',
        settlingWatermarkResumed: watermarkResult.ok === true && watermarkResult.action === 'settle-from-watermark',
        settlingBookkeepingResumed: bookkeepingResult.ok === true && bookkeepingResult.action === 'settle-from-bookkeeping',
        settlingPublicationResumed: publicationResult.ok === true && publicationResult.action === 'settle-publication-terminal',
        f5ClosureResumed: f5Result.ok === true && f5Result.action === 'f5-closure',
        terminalSkipped: terminalResult.skipped === true,
        duplicateIdempotent: duplicate.ok === true && opts.__journalRows.length === beforeDuplicate,
        privacyViolationBlocked: privacy.ok !== true,
        sideEffectsAccurate: relayResult.sideEffectSummary.relayOutboxTouched === true &&
          nativeResult.sideEffectSummary.nativeCalled === true &&
          f5Result.sideEffectSummary.f5Touched === true
      }
    });
  }

  H2O.Desktop.Sync.resumeExecuteOnBoot = resumeExecuteOnBoot;
  H2O.Desktop.Sync.resumeExecuteJournalRow = resumeExecuteJournalRow;
  H2O.Desktop.Sync.classifyExecuteResumeAction = classifyExecuteResumeAction;
  H2O.Desktop.Sync.runExecuteResumeProof = runExecuteResumeProof;
  H2O.Desktop.Sync.__executeResumeOnBootInstalled = true;
  H2O.Desktop.Sync.__executeResumeOnBootVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
