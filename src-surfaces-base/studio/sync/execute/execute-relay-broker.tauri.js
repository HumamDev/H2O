/* H2O Desktop Sync - F14.6.5 execute relay broker
 *
 * Relay dispatch branch for Execute Lane envelopes.
 *
 * Safety invariants:
 *   - Relay outbox staging only. No relay upload, Native execution, F5
 *     execution, apply, watermark writes, consumed-operation writes, final
 *     settlement, timers, or polling.
 *   - Confirmation only transitions publication lifecycle after caller
 *     supplies uploaded/published outbox evidence.
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
  if (H2O.Desktop.Sync.__executeRelayBrokerInstalled) return;

  var VERSION = '0.1.0-f14.6.5';
  var RESULT_SCHEMA = 'h2o.desktop.sync.execute-relay-broker-result.v1';
  var RELAY_ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var RELAY_PAYLOAD_SCHEMA = 'h2o.desktop.sync.execute-relay-payload.v1';
  var RELAY_STATUS_UPLOADED = 'uploaded';
  var PUBLICATION_STATUS_PUBLISHED = 'published';
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
      relayOutboxTouched: f.relayOutboxTouched === true,
      executeJournalTouched: f.executeJournalTouched === true,
      nativeCalled: false,
      f5Touched: false,
      f5Executed: false,
      watermarkWritten: false,
      consumedOperationWritten: false,
      finalSettlementWritten: false
    };
  }
  function forbiddenSideEffectsFalse(summary) {
    var s = safeObject(summary);
    return s.nativeCalled === false &&
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
      publicationRow: opts.publicationRow || null,
      journalRow: opts.journalRow || null,
      outboxRow: opts.outboxRow || null,
      relayEnvelope: opts.relayEnvelope || null,
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
  function relayKindFor(envelope) {
    var kind = cleanString(envelope.envelopeKind);
    if (kind === 'canonical-preview') return 'preview';
    if (kind === 'proposal-receipt') return 'proposal';
    return 'proposal';
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
      physicalDeviceIdHash: await sha256Hex('execute-relay-broker-device'),
      installIdHash: await sha256Hex('execute-relay-broker-install'),
      syncPeerIdHash: await sha256Hex('execute-relay-broker-peer'),
      surfaceKind: 'desktop-tauri'
    };
  }
  async function buildRelayEnvelope(envelope, publicationRow, options) {
    var peer = await actorPeer(options);
    var payload = {
      schema: RELAY_PAYLOAD_SCHEMA,
      redactionClass: 'redacted',
      executeEnvelope: envelope,
      publicationRef: {
        publicationId: cleanString(publicationRow.publicationId),
        status: cleanString(publicationRow.status),
        dedupeKey: cleanLower(publicationRow.dedupeKey),
        eventDigest: cleanLower(publicationRow.eventDigest)
      }
    };
    var payloadHash = await sha256Hex(canonicalJson(payload));
    var relay = {
      schema: RELAY_ENVELOPE_SCHEMA,
      envelopeVersion: 'v1',
      envelopeKindVersion: 'v1',
      kind: relayKindFor(envelope),
      operationIntent: envelope.envelopeKind === 'canonical-preview' ? 'preview' : 'apply',
      operationKind: cleanString(envelope.operationKind),
      subjectId: cleanLower(envelope.subjectId),
      lineageId: cleanString(envelope.lineageId),
      dedupeKey: cleanLower(envelope.dedupeKey),
      payloadHash: payloadHash,
      eventDigest: '',
      sourcePlatform: {
        platformId: 'desktop-studio',
        surfaceKind: 'desktop-tauri',
        sourcePeerEnvelope: peer
      },
      payload: payload,
      blockers: [],
      warnings: []
    };
    relay.eventDigest = await sha256Hex(canonicalJson((function () {
      var clone = JSON.parse(JSON.stringify(relay));
      delete clone.eventDigest;
      delete clone.warnings;
      delete clone.blockers;
      return clone;
    })()));
    return relay;
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
    var rowInput = {
      journalRowId: cleanString(options.journalRowId || 'execute-relay-dispatch:' + cleanString(publicationRow.publicationId)),
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
      dispatchTarget: 'relay',
      evidence: {
        publicationId: cleanString(publicationRow.publicationId),
        relayRequested: true
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
  async function enqueueRelay(relayEnvelope, options, blockers, warnings) {
    var enqueue = options.enqueueRelayEnvelope || H2O.Desktop.Sync.enqueueRelayEnvelope;
    if (typeof enqueue !== 'function') {
      addCode(blockers, 'relay-outbox-unavailable');
      return null;
    }
    var result;
    try {
      result = await enqueue({ envelope: relayEnvelope });
    } catch (_) {
      addCode(blockers, 'relay-outbox-enqueue-failed');
      return null;
    }
    codeList(result && result.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(result && result.warnings).forEach(function (code) { addCode(warnings, code); });
    if (!result || result.ok !== true || result.enqueued !== true) {
      addCode(blockers, 'relay-outbox-enqueue-failed');
      return null;
    }
    return safeObject(result.row);
  }

  async function dispatchExecuteRelay(envelope, options) {
    var opts = safeObject(options);
    var blockers = [];
    var warnings = [];
    var sideEffects = {};
    var validation = validateEnvelope(envelope, blockers, warnings);
    var shapedEnvelope = safeObject(validation.envelope || envelope);
    if (validation.ok !== true) return failure(blockers, warnings, { sideEffects: sideEffects });
    if (safeObject(shapedEnvelope.dispatchProfile).requiresRelay !== true) {
      return failure(['execute-relay-required'], warnings, { sideEffects: sideEffects });
    }
    var forbidden = foreverNoKey(shapedEnvelope);
    if (forbidden) return failure(['execute-relay-envelope-contains-forbidden-field'], ['blocked-forbidden-key-' + forbidden], { sideEffects: sideEffects });

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

    if (typeof (opts.enqueueRelayEnvelope || H2O.Desktop.Sync.enqueueRelayEnvelope) !== 'function') {
      return failure(['relay-outbox-unavailable'], warnings, { publicationRow: publicationRow, sideEffects: sideEffects });
    }

    var journalRow = await appendDispatchJournal(shapedEnvelope, publicationRow, opts, blockers, warnings);
    if (journalRow) sideEffects.executeJournalTouched = true;
    if (blockers.length || !journalRow) {
      return failure(blockers, warnings, { publicationRow: publicationRow, journalRow: journalRow, sideEffects: sideEffects });
    }

    var relayEnvelope = await buildRelayEnvelope(shapedEnvelope, publicationRow, opts);
    var outboxRow = await enqueueRelay(relayEnvelope, opts, blockers, warnings);
    if (outboxRow) sideEffects.relayOutboxTouched = true;
    if (blockers.length || !outboxRow) {
      return failure(blockers, warnings, {
        publicationRow: publicationRow,
        journalRow: journalRow,
        relayEnvelope: relayEnvelope,
        outboxRow: outboxRow,
        sideEffects: sideEffects
      });
    }
    return buildResult({
      ok: true,
      dispatched: true,
      publicationRow: publicationRow,
      journalRow: journalRow,
      outboxRow: outboxRow,
      relayEnvelope: relayEnvelope,
      warnings: warnings,
      sideEffects: sideEffects,
      metadata: { relayStatus: cleanString(outboxRow.relayStatus || 'pending-upload') }
    });
  }

  function uploadedEvidence(options) {
    var evidence = safeObject(options.outboxEvidence || options.relayEvidence || options.evidence);
    var relayStatus = cleanString(evidence.relayStatus || evidence.status);
    var publicationStatus = cleanString(evidence.publicationStatus);
    return relayStatus === RELAY_STATUS_UPLOADED ||
      relayStatus === PUBLICATION_STATUS_PUBLISHED ||
      publicationStatus === PUBLICATION_STATUS_PUBLISHED ||
      evidence.uploaded === true ||
      evidence.published === true;
  }
  async function confirmExecuteRelay(publicationId, options) {
    var opts = safeObject(options);
    var blockers = [];
    var warnings = [];
    var sideEffects = {};
    var lifecycleOptions = Object.assign({}, safeObject(opts.publicationOptions));
    if (opts.__publicationLedger) lifecycleOptions.__memoryLedger = opts.__publicationLedger;
    if (!uploadedEvidence(opts)) {
      return failure(['relay-outbox-upload-evidence-required'], warnings, { sideEffects: sideEffects });
    }
    if (typeof H2O.Desktop.Sync.transitionExecutePublicationRow !== 'function') {
      return failure(['execute-publication-lifecycle-unavailable'], warnings, { sideEffects: sideEffects });
    }
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
      return failure(blockers.length ? blockers : ['execute-publication-transition-failed'], warnings, { sideEffects: sideEffects });
    }
    return buildResult({
      ok: true,
      confirmed: true,
      publicationRow: transition.row,
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
      subjectId: cleanLower(args.subjectId || await sha256Hex('execute-relay-proof-subject:' + label)),
      lineageId: 'execute-relay-proof-lineage-' + label,
      dedupeKey: cleanLower(args.dedupeKey || await sha256Hex('execute-relay-proof-dedupe:' + label)),
      dispatchProfile: {
        requiresF5: false,
        requiresNative: false,
        requiresRelay: args.requiresRelay !== false,
        nativeCommand: '',
        nativeIdempotent: true,
        f5QueueKey: '',
        retryPolicy: { maxAttempts: 0, minDelayMs: 0, maxDelayMs: 0, backoffKind: 'none' }
      },
      payloadShapes: {
        proposalReceipt: {
          schema: 'h2o.desktop.sync.execute-relay-proof-receipt.v1',
          redactionClass: 'redacted',
          receiptDigest: await sha256Hex('execute-relay-proof-receipt:' + label)
        }
      },
      settlementShapes: {
        redactionClass: 'redacted',
        journalPhase: 'accepted',
        settlementDigest: await sha256Hex('execute-relay-proof-settlement:' + label)
      },
      createdAtIso: '2026-06-01T10:00:00Z'
    });
  }
  function proofOutboxHelper() {
    var rows = [];
    return {
      rows: rows,
      enqueue: async function (input) {
        var envelope = safeObject(input).envelope;
        var dedupeKey = cleanLower(envelope.dedupeKey);
        var eventDigest = cleanLower(envelope.eventDigest);
        var duplicate = rows.some(function (row) {
          return row.dedupeKey === dedupeKey || row.eventDigest === eventDigest;
        });
        if (duplicate) {
          return { ok: false, enqueued: false, blockers: ['duplicate-dedupe-key'], warnings: [] };
        }
        var row = {
          rowId: 'proof-outbox-' + (rows.length + 1),
          dedupeKey: dedupeKey,
          eventDigest: eventDigest,
          relayStatus: 'pending-upload'
        };
        rows.push(row);
        return { ok: true, enqueued: true, row: row, blockers: [], warnings: [] };
      }
    };
  }
  async function runExecuteRelayBrokerProof() {
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
    var outbox = proofOutboxHelper();
    var valid = await proofEnvelope('valid');
    var okPreflight = { ok: true, actionable: true, blockers: [], warnings: [] };
    var baseOpts = {
      trustedPreflightResult: true,
      preflightResult: okPreflight,
      __publicationLedger: publicationLedger,
      __journalRows: journalRows,
      enqueueRelayEnvelope: outbox.enqueue,
      nowIso: '2026-06-01T10:00:00Z'
    };
    var dispatched = await dispatchExecuteRelay(valid, baseOpts);
    if (!dispatched.ok || !dispatched.journalRow || !dispatched.outboxRow ||
        dispatched.sideEffectSummary.publicationLedgerTouched !== true ||
        dispatched.sideEffectSummary.relayOutboxTouched !== true ||
        dispatched.sideEffectSummary.executeJournalTouched !== true) {
      addCode(blockers, 'proof-valid-relay-dispatch-failed');
    }

    var noRelay = await dispatchExecuteRelay(await proofEnvelope('no-relay', { requiresRelay: false }), Object.assign({}, baseOpts, {
      nowIso: '2026-06-01T10:01:00Z'
    }));
    if (noRelay.ok) addCode(blockers, 'proof-missing-relay-requirement-passed');

    var blockedPreflight = await dispatchExecuteRelay(await proofEnvelope('blocked-preflight'), Object.assign({}, baseOpts, {
      preflightResult: { ok: false, actionable: false, blockers: ['proof-preflight-blocked'], warnings: [] },
      nowIso: '2026-06-01T10:02:00Z'
    }));
    if (blockedPreflight.ok || blockedPreflight.sideEffectSummary.relayOutboxTouched === true) {
      addCode(blockers, 'proof-preflight-blocked-enqueued');
    }

    var missingOutbox = await dispatchExecuteRelay(await proofEnvelope('missing-outbox'), {
      trustedPreflightResult: true,
      preflightResult: okPreflight,
      __publicationLedger: publicationLedger,
      __journalRows: [],
      nowIso: '2026-06-01T10:03:00Z'
    });
    if (missingOutbox.ok || codeList(missingOutbox.blockers).indexOf('relay-outbox-unavailable') === -1) {
      addCode(blockers, 'proof-missing-outbox-not-blocked');
    }

    var confirmed = await confirmExecuteRelay(dispatched.publicationRow.publicationId, {
      __publicationLedger: publicationLedger,
      outboxEvidence: { relayStatus: 'uploaded' },
      nowIso: '2026-06-01T10:04:00Z'
    });
    if (!confirmed.ok || cleanString(safeObject(confirmed.publicationRow).status) !== 'published') {
      addCode(blockers, 'proof-confirm-uploaded-failed');
    }

    var noEvidence = await confirmExecuteRelay(dispatched.publicationRow.publicationId, {
      __publicationLedger: publicationLedger,
      outboxEvidence: { relayStatus: 'pending-upload' },
      nowIso: '2026-06-01T10:05:00Z'
    });
    if (noEvidence.ok) addCode(blockers, 'proof-confirm-without-uploaded-evidence-passed');

    var duplicate = await dispatchExecuteRelay(valid, Object.assign({}, baseOpts, {
      nowIso: '2026-06-01T10:06:00Z'
    }));
    if (duplicate.ok) addCode(blockers, 'proof-duplicate-dispatch-accepted');
    if (!forbiddenSideEffectsFalse(dispatched.sideEffectSummary) ||
        !forbiddenSideEffectsFalse(confirmed.sideEffectSummary)) {
      addCode(blockers, 'proof-forbidden-side-effects-not-false');
    }

    return buildResult({
      ok: blockers.length === 0,
      dispatched: false,
      blockers: blockers,
      warnings: warnings,
      publicationRow: confirmed.publicationRow || dispatched.publicationRow || null,
      journalRow: dispatched.journalRow || null,
      outboxRow: dispatched.outboxRow || null,
      sideEffects: {
        publicationLedgerTouched: true,
        relayOutboxTouched: true,
        executeJournalTouched: true
      },
      metadata: {
        proof: 'execute-relay-broker',
        validRelayDispatched: dispatched.ok === true,
        missingRelayRequirementBlocked: noRelay.ok !== true,
        blockedPreflightNoRelayEnqueue: blockedPreflight.ok !== true && blockedPreflight.sideEffectSummary.relayOutboxTouched !== true,
        missingOutboxBlocked: missingOutbox.ok !== true,
        uploadedConfirmPublished: confirmed.ok === true && safeObject(confirmed.publicationRow).status === 'published',
        confirmWithoutUploadedEvidenceBlocked: noEvidence.ok !== true,
        duplicateDispatchBlockedSafely: duplicate.ok !== true,
        forbiddenSideEffectsFalse: forbiddenSideEffectsFalse(dispatched.sideEffectSummary) && forbiddenSideEffectsFalse(confirmed.sideEffectSummary)
      }
    });
  }

  H2O.Desktop.Sync.dispatchExecuteRelay = dispatchExecuteRelay;
  H2O.Desktop.Sync.confirmExecuteRelay = confirmExecuteRelay;
  H2O.Desktop.Sync.runExecuteRelayBrokerProof = runExecuteRelayBrokerProof;
  H2O.Desktop.Sync.__executeRelayBrokerInstalled = true;
  H2O.Desktop.Sync.__executeRelayBrokerVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
