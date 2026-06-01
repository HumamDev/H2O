/* H2O Desktop Sync - F14.6.3 execute preflight gate
 *
 * Read-only Execute Lane preflight gate for execute envelopes.
 *
 * Safety invariants:
 *   - Validation only. No broker, dispatch, publication, relay/outbox,
 *     Native execution, F5 execution, apply, watermark writes,
 *     consumed-operation writes, storage writes, timers, or polling.
 *   - F5 queue state is read only and consulted only for envelopes whose
 *     dispatch profile requires F5.
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
  if (H2O.Desktop.Sync.__executePreflightGateInstalled) return;

  var VERSION = '0.1.0-f14.6.3';
  var RESULT_SCHEMA = 'h2o.desktop.sync.execute-preflight-gate-result.v1';
  var POST_DECISION_F5_STATES = ['approved-seal', 'approved-restore', 'auto-expired'];
  var TERMINAL_JOURNAL_PHASES = ['settled', 'bookkept'];
  var DOMAIN_PRIVACY_TAGS = {
    chat: 'chat.metadata',
    snapshot: 'snapshot.conversation',
    capture: 'capture.artifact'
  };
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
  function isSha256Hex(value) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.isSha256Hex === 'function') {
      try { return !!kernel.isSha256Hex(value); } catch (_) { /* fall through */ }
    }
    return /^[0-9a-f]{64}$/.test(cleanLower(value));
  }
  function nowIsoSeconds() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
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

  function sideEffectSummary() {
    return {
      brokerInstalled: false,
      dispatchAttempted: false,
      publicationTouched: false,
      relayTouched: false,
      outboxTouched: false,
      nativeCalled: false,
      f5Executed: false,
      applyExecuted: false,
      watermarkWritten: false,
      consumedOperationWritten: false,
      storageWritten: false
    };
  }
  function allSideEffectsFalse(map) {
    var value = safeObject(map);
    return Object.keys(sideEffectSummary()).every(function (key) { return value[key] === false; });
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
      actionable: ok && opts.actionable !== false,
      blockers: blockers,
      warnings: warnings,
      validationSummary: safeObject(opts.validationSummary),
      sideEffectSummary: sideEffectSummary()
    };
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.createResult === 'function') {
      try {
        var shaped = kernel.createResult({
          schema: RESULT_SCHEMA,
          ok: payload.ok,
          actionable: payload.actionable,
          blockers: payload.blockers,
          warnings: payload.warnings,
          metadata: { domain: 'execute', version: VERSION }
        });
        if (shaped && typeof shaped === 'object') {
          payload.ok = shaped.ok === true;
          payload.actionable = shaped.actionable === true;
          payload.blockers = codeList(shaped.blockers);
          payload.warnings = codeList(shaped.warnings);
        }
      } catch (_) { /* keep local result */ }
    }
    return payload;
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
  function mergeSummaryCodes(summary, blockers, warnings) {
    codeList(summary.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(summary.warnings).forEach(function (code) { addCode(warnings, code); });
  }
  function validPeer(peer) {
    var p = safeObject(peer);
    return isSha256Hex(p.physicalDeviceIdHash) &&
      isSha256Hex(p.installIdHash) &&
      isSha256Hex(p.syncPeerIdHash);
  }
  async function defaultActorPeer() {
    return {
      physicalDeviceIdHash: await sha256Hex('execute-preflight-proof-device'),
      installIdHash: await sha256Hex('execute-preflight-proof-install'),
      syncPeerIdHash: await sha256Hex('execute-preflight-proof-peer'),
      surfaceKind: 'desktop-tauri'
    };
  }
  function envelopeSubjectType(envelope) {
    var domainId = cleanString(envelope.domainId);
    if (domainId === 'chat') return 'chat.metadata';
    if (domainId === 'snapshot') return 'snapshot.conversation';
    if (domainId === 'capture') return 'capture.artifact';
    return domainId || 'execute';
  }
  function replayEnvelopeKind(envelope) {
    var kind = cleanString(envelope.envelopeKind);
    if (kind === 'canonical-preview') return 'preview';
    if (kind === 'proposal-receipt') return 'proposal';
    return kind;
  }
  async function proposedWatermarkFromEnvelope(envelope, options, actorPeer) {
    var provided = safeObject(options.proposedWatermark || options.proposed);
    if (Object.keys(provided).length) return provided;
    return {
      peerId: cleanLower(options.peerId || actorPeer.syncPeerIdHash || await sha256Hex('execute-preflight-peer')),
      subjectId: cleanLower(envelope.subjectId),
      lineageId: cleanString(envelope.lineageId),
      revisionHash: cleanLower(options.revisionHash || envelope.eventDigest),
      watermarkAtIso: cleanString(options.watermarkAtIso || envelope.createdAtIso || nowIsoSeconds()),
      recordedAtIso: cleanString(options.recordedAtIso || ''),
      dedupeKey: cleanLower(envelope.dedupeKey)
    };
  }

  function validateEnvelope(envelope, blockers, warnings) {
    if (typeof H2O.Desktop.Sync.validateExecuteEnvelope !== 'function') {
      addCode(blockers, 'execute-envelope-validator-unavailable');
      return { ok: false, envelope: safeObject(envelope), blockers: ['execute-envelope-validator-unavailable'], warnings: [] };
    }
    var result = H2O.Desktop.Sync.validateExecuteEnvelope(envelope);
    mergeSummaryCodes(result, blockers, warnings);
    return result;
  }
  async function checkJournal(envelope, options, blockers, warnings) {
    var rows = null;
    if (Array.isArray(options.journalRows)) {
      rows = options.journalRows;
    } else if (typeof H2O.Desktop.Sync.listExecuteJournalRowsByDedupe === 'function') {
      try {
        var lookup = await H2O.Desktop.Sync.listExecuteJournalRowsByDedupe(envelope.dedupeKey);
        mergeSummaryCodes(lookup, blockers, warnings);
        rows = asArray(lookup.rows);
      } catch (_) {
        addCode(blockers, 'execute-journal-lookup-failed');
      }
    } else {
      addCode(blockers, 'execute-journal-lookup-unavailable');
    }
    var terminalRows = asArray(rows).filter(function (row) {
      return cleanLower(row.dedupeKey) === cleanLower(envelope.dedupeKey) &&
        TERMINAL_JOURNAL_PHASES.indexOf(cleanString(row.phase)) !== -1;
    });
    if (terminalRows.length) addCode(blockers, 'execute-journal-terminal-row-exists');
    return {
      ok: terminalRows.length === 0,
      rows: asArray(rows),
      terminalRows: terminalRows,
      blockers: terminalRows.length ? ['execute-journal-terminal-row-exists'] : [],
      warnings: []
    };
  }
  function checkWatermark(envelope, options, actorPeer, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (!kernel || typeof kernel.validateWatermarkMonotonicity !== 'function') {
      addCode(blockers, 'execute-watermark-validator-unavailable');
      return Promise.resolve({ ok: false, blockers: ['execute-watermark-validator-unavailable'], warnings: [] });
    }
    return proposedWatermarkFromEnvelope(envelope, options, actorPeer).then(function (proposed) {
      var input = {
        currentWatermark: options.currentWatermark || options.current || null,
        proposedWatermark: proposed,
        requireAdvance: options.requireWatermarkAdvance === true,
        allowIdempotent: options.allowWatermarkIdempotent !== false
      };
      var result = kernel.validateWatermarkMonotonicity(input);
      mergeSummaryCodes(result, blockers, warnings);
      return result;
    });
  }
  function checkReplay(envelope, options, actorPeer, watermarkResult, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (!kernel || typeof kernel.composeReplayDefense !== 'function') {
      addCode(blockers, 'execute-replay-composer-unavailable');
      return { ok: false, replaySafe: false, blockers: ['execute-replay-composer-unavailable'], warnings: [] };
    }
    var consumedAtIso = cleanString(options.consumedAtIso || envelope.createdAtIso || nowIsoSeconds());
    var candidate = {
      subjectType: envelopeSubjectType(envelope),
      subjectId: envelope.subjectId,
      operation: envelope.operationKind,
      operationKind: envelope.operationKind,
      operationIntent: envelope.envelopeKind === 'canonical-preview' ? 'preview' : 'apply',
      baseHash: cleanLower(options.baseHash || envelope.eventDigest),
      targetHash: cleanLower(options.targetHash || envelope.eventDigest),
      revisionHash: cleanLower(options.revisionHash || envelope.eventDigest),
      lineageId: envelope.lineageId,
      eventDigest: envelope.eventDigest,
      dedupeKey: envelope.dedupeKey,
      consumedStatus: cleanString(options.consumedStatus || 'consumed'),
      consumedAtIso: consumedAtIso,
      envelopeKind: replayEnvelopeKind(envelope),
      sourcePeerId: cleanLower(options.sourcePeerId || actorPeer.syncPeerIdHash),
      actorPeer: actorPeer,
      originTag: {
        originKind: replayEnvelopeKind(envelope),
        sourcePeerId: cleanLower(options.sourcePeerId || actorPeer.syncPeerIdHash),
        sourcePlatform: 'desktop-tauri',
        envelopeKind: replayEnvelopeKind(envelope),
        operationKind: envelope.operationKind,
        lineageId: envelope.lineageId,
        eventDigest: envelope.eventDigest,
        dedupeKey: envelope.dedupeKey
      },
      validationSummary: { ok: true, checkedAtIso: consumedAtIso, blockers: [], warnings: [] }
    };
    var replay = kernel.composeReplayDefense({
      candidate: candidate,
      consumed: {
        rows: asArray(options.consumedRows),
        candidate: candidate
      },
      watermark: {
        currentWatermark: options.currentWatermark || options.current || null,
        proposedWatermark: watermarkResult.proposedWatermark || watermarkResult.watermark || null,
        requireAdvance: options.requireWatermarkAdvance === true,
        allowIdempotent: options.allowWatermarkIdempotent !== false
      },
      originTag: candidate.originTag,
      policy: {
        requireConsumedOperation: true,
        requireWatermark: true,
        requireOriginTag: true,
        watermarkPolicy: {
          requireAdvance: options.requireWatermarkAdvance === true,
          allowIdempotent: options.allowWatermarkIdempotent !== false
        }
      }
    });
    mergeSummaryCodes(replay, blockers, warnings);
    return replay;
  }
  async function checkF5(envelope, options, blockers, warnings) {
    var profile = safeObject(envelope.dispatchProfile);
    if (profile.requiresF5 !== true) {
      return { ok: true, required: false, currentState: null, blockers: [], warnings: [] };
    }
    var reviewId = cleanLower(options.f5ReviewId || profile.f5QueueKey);
    var reviewResult = options.f5ReviewResult || null;
    if (!reviewResult && isObject(options.f5Review)) {
      reviewResult = {
        ok: true,
        status: 'found',
        currentState: cleanString(options.f5Review.currentState || options.f5Review.state),
        reviewId: cleanLower(options.f5Review.reviewId || reviewId),
        rows: [options.f5Review],
        blockers: [],
        warnings: []
      };
    }
    if (!reviewResult) {
      if (!isSha256Hex(reviewId)) {
        addCode(blockers, 'execute-f5-review-id-invalid');
        return { ok: false, required: true, blockers: ['execute-f5-review-id-invalid'], warnings: [] };
      }
      if (typeof H2O.Desktop.Sync.getF5ReviewById !== 'function') {
        addCode(blockers, 'execute-f5-review-lookup-unavailable');
        return { ok: false, required: true, blockers: ['execute-f5-review-lookup-unavailable'], warnings: [] };
      }
      try {
        reviewResult = await H2O.Desktop.Sync.getF5ReviewById(reviewId);
      } catch (_) {
        addCode(blockers, 'execute-f5-review-lookup-failed');
        return { ok: false, required: true, blockers: ['execute-f5-review-lookup-failed'], warnings: [] };
      }
    }
    mergeSummaryCodes(reviewResult, blockers, warnings);
    var currentState = cleanString(reviewResult.currentState || safeObject(reviewResult.metadata).currentState);
    var found = reviewResult.status === 'found' || safeObject(reviewResult.metadata).found === true || asArray(reviewResult.rows).length > 0;
    if (!found) addCode(blockers, 'execute-f5-review-missing');
    if (found && POST_DECISION_F5_STATES.indexOf(currentState) === -1) {
      addCode(blockers, 'execute-f5-review-not-post-decision');
    }
    return {
      ok: found && POST_DECISION_F5_STATES.indexOf(currentState) !== -1 && codeList(reviewResult.blockers).length === 0,
      required: true,
      reviewId: reviewId,
      currentState: currentState,
      rows: asArray(reviewResult.rows),
      blockers: [],
      warnings: []
    };
  }
  function checkPrivacy(envelope, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    var domainTag = DOMAIN_PRIVACY_TAGS[cleanString(envelope.domainId)] || cleanString(envelope.domainId);
    var result = null;
    if (kernel && typeof kernel.scanDomainForbiddenFields === 'function') {
      try {
        result = kernel.scanDomainForbiddenFields(domainTag, envelope);
      } catch (_) {
        addCode(blockers, 'execute-privacy-scan-threw');
      }
    } else if (kernel && typeof kernel.scanPrivacy === 'function') {
      try {
        result = kernel.scanPrivacy(envelope, {
          subjectType: domainTag,
          redactionClass: 'redacted',
          allowedRedactionClasses: ['redacted', 'metadata-only'],
          forbiddenList: FOREVER_NO_FIELDS,
          foreverNoFields: FOREVER_NO_FIELDS
        });
      } catch (_) {
        addCode(blockers, 'execute-privacy-scan-threw');
      }
    } else {
      addCode(blockers, 'execute-privacy-scan-unavailable');
    }
    if (result) mergeSummaryCodes(result, blockers, warnings);
    var forbidden = foreverNoKey(envelope);
    if (forbidden) {
      addCode(blockers, 'execute-preflight-privacy-violation');
      addCode(warnings, 'blocked-forbidden-key-' + forbidden);
    }
    return result || { ok: false, blockers: ['execute-privacy-scan-unavailable'], warnings: [] };
  }

  async function runExecutePreflightGate(envelope, options) {
    var opts = safeObject(options);
    var blockers = [];
    var warnings = [];
    var validationSummary = {};
    var actorPeer = safeObject(opts.actorPeer);
    if (!validPeer(actorPeer)) actorPeer = await defaultActorPeer();

    validationSummary.envelope = validateEnvelope(envelope, blockers, warnings);
    var shapedEnvelope = safeObject(validationSummary.envelope.envelope || envelope);

    validationSummary.dispatchProfile = {
      ok: validationSummary.envelope.ok === true && isObject(shapedEnvelope.dispatchProfile),
      blockers: isObject(shapedEnvelope.dispatchProfile) ? [] : ['execute-dispatchProfile-invalid'],
      warnings: []
    };
    mergeSummaryCodes(validationSummary.dispatchProfile, blockers, warnings);

    if (validationSummary.envelope.ok !== true) {
      validationSummary.replay = { ok: false, skipped: true, blockers: ['execute-envelope-invalid'], warnings: [] };
      validationSummary.journal = { ok: false, skipped: true, blockers: ['execute-envelope-invalid'], warnings: [] };
      validationSummary.watermark = { ok: false, skipped: true, blockers: ['execute-envelope-invalid'], warnings: [] };
      validationSummary.f5 = { ok: false, skipped: true, blockers: ['execute-envelope-invalid'], warnings: [] };
      validationSummary.privacy = { ok: false, skipped: true, blockers: ['execute-envelope-invalid'], warnings: [] };
      return buildResult({ ok: false, actionable: false, blockers: blockers, warnings: warnings, validationSummary: validationSummary });
    }

    validationSummary.journal = await checkJournal(shapedEnvelope, opts, blockers, warnings);
    validationSummary.watermark = await checkWatermark(shapedEnvelope, opts, actorPeer, blockers, warnings);
    validationSummary.replay = checkReplay(shapedEnvelope, opts, actorPeer, validationSummary.watermark, blockers, warnings);
    validationSummary.f5 = await checkF5(shapedEnvelope, opts, blockers, warnings);
    validationSummary.privacy = checkPrivacy(shapedEnvelope, blockers, warnings);

    return buildResult({
      ok: blockers.length === 0,
      actionable: blockers.length === 0,
      blockers: blockers,
      warnings: warnings,
      validationSummary: validationSummary
    });
  }

  async function proofEnvelope(overrides) {
    var args = safeObject(overrides);
    var domainId = cleanString(args.domainId || 'snapshot');
    var requiresF5 = args.requiresF5 === true;
    var reviewId = cleanLower(args.f5QueueKey || await sha256Hex('execute-preflight-proof-review'));
    return await H2O.Desktop.Sync.shapeExecuteEnvelope({
      envelopeKind: cleanString(args.envelopeKind || 'proposal-receipt'),
      domainId: domainId,
      operationKind: cleanString(args.operationKind || domainId + '-proof-operation'),
      subjectId: cleanLower(args.subjectId || await sha256Hex('execute-preflight-proof-subject:' + domainId)),
      lineageId: cleanString(args.lineageId || 'execute-preflight-proof-lineage'),
      dedupeKey: cleanLower(args.dedupeKey || await sha256Hex('execute-preflight-proof-dedupe:' + domainId)),
      dispatchProfile: args.dispatchProfile || {
        requiresF5: requiresF5,
        requiresNative: true,
        requiresRelay: false,
        nativeCommand: domainId + '.proof.preview',
        nativeIdempotent: true,
        f5QueueKey: requiresF5 ? reviewId : '',
        retryPolicy: { maxAttempts: 0, minDelayMs: 0, maxDelayMs: 0, backoffKind: 'none' }
      },
      payloadShapes: args.payloadShapes || {
        proposalReceipt: {
          schema: 'h2o.desktop.sync.execute-preflight-proof-receipt.v1',
          redactionClass: 'redacted',
          receiptDigest: await sha256Hex('execute-preflight-proof-receipt:' + domainId)
        }
      },
      settlementShapes: args.settlementShapes || {
        redactionClass: 'redacted',
        journalPhase: 'accepted',
        settlementDigest: await sha256Hex('execute-preflight-proof-settlement:' + domainId)
      },
      createdAtIso: cleanString(args.createdAtIso || '2026-06-01T10:00:00Z')
    });
  }
  async function proofOptions(envelope, overrides) {
    var args = safeObject(overrides);
    var actorPeer = await defaultActorPeer();
    var proposed = {
      peerId: actorPeer.syncPeerIdHash,
      subjectId: envelope.subjectId,
      lineageId: envelope.lineageId,
      revisionHash: envelope.eventDigest,
      watermarkAtIso: cleanString(args.proposedAtIso || envelope.createdAtIso),
      dedupeKey: envelope.dedupeKey
    };
    var out = {
      actorPeer: actorPeer,
      journalRows: asArray(args.journalRows),
      consumedRows: asArray(args.consumedRows),
      currentWatermark: args.currentWatermark || null,
      proposedWatermark: args.proposedWatermark || proposed,
      f5Review: args.f5Review || null
    };
    Object.keys(args).forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(out, key)) out[key] = args[key];
    });
    return out;
  }
  async function runExecutePreflightGateProof() {
    var blockers = [];
    var warnings = [];
    if (typeof H2O.Desktop.Sync.shapeExecuteEnvelope !== 'function') {
      return buildResult({ ok: false, actionable: false, blockers: ['execute-envelope-shaper-unavailable'], warnings: [] });
    }
    var valid = await proofEnvelope();
    var validResult = await runExecutePreflightGate(valid, await proofOptions(valid));
    if (!validResult.ok) addCode(blockers, 'proof-valid-envelope-blocked');

    var invalidEnvelope = Object.assign({}, valid, { domainId: 'folder' });
    var invalidResult = await runExecutePreflightGate(invalidEnvelope, await proofOptions(invalidEnvelope));
    if (invalidResult.ok) addCode(blockers, 'proof-invalid-envelope-passed');

    var actorPeer = await defaultActorPeer();
    var duplicateConsumed = {
      eventDigest: valid.eventDigest,
      dedupeKey: valid.dedupeKey,
      lineageId: valid.lineageId,
      subjectId: valid.subjectId,
      sourcePeerId: actorPeer.syncPeerIdHash,
      envelopeKind: valid.envelopeKind,
      operationKind: valid.operationKind,
      consumedStatus: 'consumed',
      consumedAtIso: valid.createdAtIso,
      actorPeer: actorPeer,
      originTag: {
        originKind: valid.envelopeKind,
        sourcePeerId: actorPeer.syncPeerIdHash,
        sourcePlatform: 'desktop-tauri',
        envelopeKind: valid.envelopeKind,
        operationKind: valid.operationKind,
        lineageId: valid.lineageId,
        eventDigest: valid.eventDigest,
        dedupeKey: valid.dedupeKey
      }
    };
    var replayDuplicate = await runExecutePreflightGate(valid, await proofOptions(valid, { consumedRows: [duplicateConsumed] }));
    if (replayDuplicate.ok) addCode(blockers, 'proof-replay-duplicate-passed');

    var settledJournal = await runExecutePreflightGate(valid, await proofOptions(valid, {
      journalRows: [{ dedupeKey: valid.dedupeKey, phase: 'settled', journalRowId: 'proof-settled' }]
    }));
    if (settledJournal.ok) addCode(blockers, 'proof-settled-journal-passed');

    var regression = await runExecutePreflightGate(valid, await proofOptions(valid, {
      currentWatermark: {
        peerId: actorPeer.syncPeerIdHash,
        subjectId: valid.subjectId,
        lineageId: valid.lineageId,
        revisionHash: valid.eventDigest,
        watermarkAtIso: '2026-06-01T11:00:00Z',
        dedupeKey: valid.dedupeKey
      }
    }));
    if (regression.ok) addCode(blockers, 'proof-watermark-regression-passed');

    var f5Envelope = await proofEnvelope({ requiresF5: true, f5QueueKey: await sha256Hex('execute-preflight-proof-review-f5') });
    var f5Missing = await runExecutePreflightGate(f5Envelope, await proofOptions(f5Envelope));
    if (f5Missing.ok) addCode(blockers, 'proof-f5-missing-passed');
    var f5Valid = await runExecutePreflightGate(f5Envelope, await proofOptions(f5Envelope, {
      f5Review: { reviewId: f5Envelope.dispatchProfile.f5QueueKey, currentState: 'approved-seal' }
    }));
    if (!f5Valid.ok) addCode(blockers, 'proof-f5-valid-post-decision-blocked');

    var privacyEnvelope = await proofEnvelope({
      payloadShapes: {
        proposalReceipt: {
          schema: 'h2o.desktop.sync.execute-preflight-proof-receipt.v1',
          redactionClass: 'redacted',
          title: 'raw title must not pass'
        }
      }
    });
    var privacyResult = await runExecutePreflightGate(privacyEnvelope, await proofOptions(privacyEnvelope));
    if (privacyResult.ok) addCode(blockers, 'proof-privacy-violation-passed');
    if (!allSideEffectsFalse(sideEffectSummary())) addCode(blockers, 'proof-side-effect-flags-not-false');

    return buildResult({
      ok: blockers.length === 0,
      actionable: blockers.length === 0,
      blockers: blockers,
      warnings: warnings,
      validationSummary: {
        proof: {
          validEnvelopePasses: validResult.ok === true,
          invalidEnvelopeBlocked: invalidResult.ok !== true,
          replayDuplicateBlocked: replayDuplicate.ok !== true,
          settledJournalBlocked: settledJournal.ok !== true,
          watermarkRegressionBlocked: regression.ok !== true,
          f5MissingBlocked: f5Missing.ok !== true,
          f5ValidPostDecisionPasses: f5Valid.ok === true,
          privacyViolationBlocked: privacyResult.ok !== true,
          sideEffectFlagsAllFalse: allSideEffectsFalse(sideEffectSummary())
        }
      }
    });
  }

  H2O.Desktop.Sync.runExecutePreflightGate = runExecutePreflightGate;
  H2O.Desktop.Sync.runExecutePreflightGateProof = runExecutePreflightGateProof;
  H2O.Desktop.Sync.__executePreflightGateInstalled = true;
  H2O.Desktop.Sync.__executePreflightGateVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
