/* H2O Desktop Sync - F14.6.15 snapshot tombstone execute adapter
 *
 * Snapshot tombstone domain adapter for Execute Lane proposal-receipt
 * envelopes.
 *
 * Safety invariants:
 *   - Adapter registration and envelope shaping only.
 *   - Requires a tombstone applyEvent receipt plus an F5 review reference.
 *   - Does not call Native, close F5, dispatch, publish, settle, mutate
 *     Snapshot, write storage, start timers, poll, or touch UI.
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
  if (H2O.Desktop.Sync.__snapshotTombstoneExecuteAdapterInstalled) return;

  var VERSION = '0.1.0-f14.6.15';
  var RESULT_SCHEMA = 'h2o.desktop.sync.snapshot-tombstone-execute-adapter-result.v1';
  var ADAPTER_ID = 'snapshot-tombstone-execute-adapter';
  var SUBJECT_TYPE = 'snapshot.conversation';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var PROPOSAL_KIND = 'proposal';
  var APPLY_EVENT_KIND = 'applyEvent';
  var OP_ARCHIVE_PROPOSED = 'snapshot-lifecycle-archive-proposed';
  var OP_RESTORE_PROPOSED = 'snapshot-lifecycle-restore-proposed';
  var OP_TOMBSTONE_PROPOSED = 'snapshot-lifecycle-tombstone-proposed';
  var OP_ARCHIVE_APPLIED = 'snapshot-lifecycle-archive-applied';
  var OP_RESTORE_APPLIED = 'snapshot-lifecycle-restore-applied';
  var OP_TOMBSTONE_APPLIED = 'snapshot-lifecycle-tombstone-applied';
  var OPERATION_INTENT = 'update';
  var F5_NATIVE_COMMAND = 'snapshot.f5.terminalSeal';
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'message', 'message_array',
    'turns', 'turn_array', 'conversation', 'transcript', 'attachments',
    'files', 'file_ids', 'image_urls', 'audio_urls', 'rawSnapshot',
    'snapshotPayload', 'rawId', 'snapshotId', 'snapshot_id', 'chatId',
    'chat_id', 'accountId', 'account_id', 'rawAccountId', 'title', 'name',
    'rawTitle', 'model', 'modelSlug', 'model_slug', 'modelVersion',
    'model_version', 'path', 'url', 'href', 'share_url', 'share_token',
    'password', 'apiKey', 'accessToken', 'refreshToken', 'session_token',
    'cookies', 'token'
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

  function sideEffectSummary() {
    return {
      dispatchAttempted: false,
      publicationTouched: false,
      publicationLedgerTouched: false,
      relayTouched: false,
      relayOutboxTouched: false,
      nativeCalled: false,
      f5Touched: false,
      f5Closed: false,
      applyExecuted: false,
      snapshotMutated: false,
      watermarkWritten: false,
      consumedOperationWritten: false,
      bookkeepingWritten: false,
      executeJournalTouched: false,
      storageWritten: false,
      uiTouched: false
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
      envelope: opts.envelope || null,
      adapter: opts.adapter || null,
      adapters: opts.adapters || [],
      sideEffectSummary: sideEffectSummary(),
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
          metadata: { domain: 'snapshot', version: VERSION }
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
  function failure(blockers, warnings, metadata) {
    return buildResult({ ok: false, blockers: blockers, warnings: warnings, metadata: metadata || {} });
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
  function scanPrivacy(value, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.scanDomainForbiddenFields === 'function') {
      try {
        var domainScan = kernel.scanDomainForbiddenFields(SUBJECT_TYPE, value);
        codeList(domainScan && domainScan.blockers).forEach(function (code) { addCode(blockers, code); });
        codeList(domainScan && domainScan.warnings).forEach(function (code) { addCode(warnings, code); });
      } catch (_) { addCode(warnings, 'snapshot-tombstone-execute-domain-forbidden-field-scan-threw'); }
    }
    if (kernel && typeof kernel.scanPrivacy === 'function') {
      try {
        var scan = kernel.scanPrivacy(value, {
          subjectType: SUBJECT_TYPE,
          redactionClass: 'redacted',
          allowedRedactionClasses: ['redacted'],
          forbiddenList: FOREVER_NO_FIELDS,
          foreverNoFields: FOREVER_NO_FIELDS
        });
        codeList(scan && scan.blockers).forEach(function (code) { addCode(blockers, code); });
        codeList(scan && scan.warnings).forEach(function (code) { addCode(warnings, code); });
      } catch (_) { addCode(warnings, 'snapshot-tombstone-execute-privacy-scan-threw'); }
    }
    var forbidden = foreverNoKey(value);
    if (forbidden) {
      addCode(blockers, 'snapshot-tombstone-execute-output-contains-forbidden-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbidden);
    }
  }

  function parseJsonObject(text) {
    if (isObject(text)) return text;
    if (typeof text !== 'string' || !text.trim()) return null;
    try {
      var parsed = JSON.parse(text);
      return isObject(parsed) ? parsed : null;
    } catch (_) { return null; }
  }
  function proposalEnvelope(input) {
    var source = safeObject(input);
    if (isObject(source.proposalCandidate)) return proposalEnvelope(source.proposalCandidate);
    if (isObject(source.proposal)) return proposalEnvelope(source.proposal);
    if (isObject(source.candidate)) return proposalEnvelope(source.candidate);
    if (isObject(source.envelope)) return source.envelope;
    if (cleanString(source.serializedEnvelope)) return parseJsonObject(source.serializedEnvelope);
    if (source.kind === PROPOSAL_KIND || source.schema === ENVELOPE_SCHEMA) return source;
    return null;
  }
  function proposalRow(input) {
    var source = safeObject(input);
    if (isObject(source.candidateRow)) return source.candidateRow;
    if (isObject(source.row)) return source.row;
    if (isObject(source.candidate)) return proposalRow(source.candidate);
    if (cleanString(source.serializedEnvelope)) return source;
    return null;
  }
  function handoffPreview(input) {
    var source = safeObject(input);
    if (isObject(source.handoffPreview)) return source.handoffPreview;
    if (isObject(source.f5HandoffPreview)) return source.f5HandoffPreview;
    if (isObject(source.tombstoneHandoffPreview)) return source.tombstoneHandoffPreview;
    if (isObject(source.preview)) return source.preview;
    if (cleanString(source.handoffRequest && source.handoffRequest.previewSchema) || source.handoffReady === true) return source;
    return null;
  }
  function receiptWrapper(input) {
    var source = safeObject(input);
    if (isObject(source.applyEventReceipt)) return source.applyEventReceipt;
    if (isObject(source.snapshotApplyEventReceipt)) return source.snapshotApplyEventReceipt;
    if (isObject(source.receipt)) return source.receipt;
    if (isObject(source.tombstoneApplyEventReceipt)) return source.tombstoneApplyEventReceipt;
    if (isObject(source.applyEvent)) return source;
    if (source.kind === APPLY_EVENT_KIND) return { ok: true, applyEvent: source };
    return null;
  }
  function operationKindForProposal(operation) {
    if (operation === OP_ARCHIVE_PROPOSED) return 'archive';
    if (operation === OP_RESTORE_PROPOSED) return 'restore';
    if (operation === OP_TOMBSTONE_PROPOSED) return 'tombstone';
    return '';
  }
  function operationKindForApply(operation) {
    if (operation === OP_ARCHIVE_APPLIED) return 'archive';
    if (operation === OP_RESTORE_APPLIED) return 'restore';
    if (operation === OP_TOMBSTONE_APPLIED) return 'tombstone';
    return '';
  }

  function f5EvidenceFrom(receipt) {
    var r = safeObject(receipt);
    var payload = safeObject(safeObject(r.applyEvent).payload);
    return safeObject(r.proposedF5Record || r.f5Evidence || payload.f5Evidence || payload.proposedF5Record);
  }
  function reviewSource(input, receipt, options) {
    var args = safeObject(input);
    var opts = safeObject(options);
    return safeObject(opts.f5ReviewRow || opts.f5Review || opts.reviewRow ||
      args.f5ReviewRow || args.f5Review || args.reviewRow || args.review ||
      safeObject(receipt).f5ReviewReference || safeObject(safeObject(receipt).applyEvent).f5ReviewReference);
  }
  function resolveReviewReference(input, receipt, options, blockers, warnings) {
    var args = safeObject(input);
    var opts = safeObject(options);
    var review = reviewSource(input, receipt, options);
    var evidence = f5EvidenceFrom(receipt);
    var reviewId = cleanLower(opts.f5ReviewId || opts.reviewId ||
      args.f5ReviewId || args.reviewId ||
      review.reviewId || review.f5QueueKey ||
      evidence.reviewId || evidence.f5QueueKey);
    if (!isSha256Hex(reviewId)) {
      addCode(blockers, 'snapshot-tombstone-execute-f5-review-reference-required');
    }
    scanPrivacy({ review: review, reviewId: reviewId }, blockers, warnings);
    return {
      schema: 'h2o.desktop.sync.snapshot-tombstone-execute-f5-review-reference.v1',
      reviewId: reviewId,
      f5QueueKey: reviewId,
      currentState: cleanString(review.currentState || review.reviewState || review.status),
      reviewStatusVersion: Number.isInteger(review.reviewStatusVersion) ? review.reviewStatusVersion : null,
      candidateId: cleanString(review.candidateId),
      proposalEnvelopeId: cleanString(review.proposalEnvelopeId),
      retentionExpiresAtIso: cleanString(review.retentionExpiresAtIso)
    };
  }

  function validateProposal(proposal, row, receiptSummary, blockers, warnings) {
    if (!isObject(proposal)) return null;
    var p = safeObject(proposal);
    var payload = safeObject(p.payload);
    var proposed = safeObject(payload.proposedOperation);
    var expected = safeObject(payload.expectedPostState);
    var transition = safeObject(proposed.lifecycleTransition);
    var kind = operationKindForProposal(p.operation);
    if (p.schema !== ENVELOPE_SCHEMA) addCode(blockers, 'snapshot-tombstone-execute-proposal-schema-invalid');
    if (p.kind !== PROPOSAL_KIND) addCode(blockers, 'snapshot-tombstone-execute-proposal-kind-invalid');
    if (p.subjectType !== SUBJECT_TYPE) addCode(blockers, 'snapshot-tombstone-execute-proposal-domain-invalid');
    if (p.operationIntent !== OPERATION_INTENT) addCode(blockers, 'snapshot-tombstone-execute-proposal-intent-invalid');
    if (kind !== 'tombstone') addCode(blockers, 'snapshot-tombstone-execute-proposal-operation-invalid');
    if (!isSha256Hex(p.subjectId)) addCode(blockers, 'snapshot-tombstone-execute-proposal-subjectId-invalid');
    if (!isSha256Hex(p.lineageId)) addCode(blockers, 'snapshot-tombstone-execute-proposal-lineageId-invalid');
    if (!isSha256Hex(p.dedupeKey)) addCode(blockers, 'snapshot-tombstone-execute-proposal-dedupeKey-invalid');
    if (!isSha256Hex(p.eventDigest)) addCode(blockers, 'snapshot-tombstone-execute-proposal-eventDigest-invalid');
    if (cleanLower(p.subjectId) !== receiptSummary.subjectId) addCode(blockers, 'snapshot-tombstone-execute-proposal-subjectId-mismatch');
    if (cleanLower(p.lineageId) !== receiptSummary.lineageId) addCode(blockers, 'snapshot-tombstone-execute-proposal-lineageId-mismatch');
    if (receiptSummary.proposalEventDigest && cleanLower(p.eventDigest) !== receiptSummary.proposalEventDigest) {
      addCode(blockers, 'snapshot-tombstone-execute-proposal-eventDigest-mismatch');
    }
    if (receiptSummary.proposalDedupeKey && cleanLower(p.dedupeKey) !== receiptSummary.proposalDedupeKey) {
      addCode(blockers, 'snapshot-tombstone-execute-proposal-dedupeKey-mismatch');
    }
    if (!isObject(payload)) addCode(blockers, 'snapshot-tombstone-execute-proposal-payload-required');
    if (!isObject(proposed)) addCode(blockers, 'snapshot-tombstone-execute-proposal-operation-required');
    if (proposed.operation && proposed.operation !== p.operation) addCode(blockers, 'snapshot-tombstone-execute-proposal-operation-mismatch');
    if (cleanString(payload.predicateVersion) && receiptSummary.predicateVersion &&
        cleanString(payload.predicateVersion) !== receiptSummary.predicateVersion) {
      addCode(blockers, 'snapshot-tombstone-execute-proposal-predicateVersion-mismatch');
    }
    if (cleanString(proposed.baseHash) && cleanLower(proposed.baseHash) !== receiptSummary.baseHash) {
      addCode(blockers, 'snapshot-tombstone-execute-proposal-baseHash-mismatch');
    }
    if (cleanString(proposed.targetHash) && cleanLower(proposed.targetHash) !== receiptSummary.targetHash) {
      addCode(blockers, 'snapshot-tombstone-execute-proposal-targetHash-mismatch');
    }
    if (cleanString(transition.toState) && cleanString(transition.toState) !== 'tombstoned') {
      addCode(blockers, 'snapshot-tombstone-execute-proposal-target-invalid');
    }
    if (isObject(expected) && cleanString(expected.lifecycleState) && cleanString(expected.lifecycleState) !== 'tombstoned') {
      addCode(blockers, 'snapshot-tombstone-execute-proposal-expected-target-mismatch');
    }
    if (row) {
      if (cleanString(row.status) && cleanString(row.status) !== 'generated') addCode(blockers, 'snapshot-tombstone-execute-proposal-row-status-invalid');
      if (cleanString(row.eventDigest) && cleanLower(row.eventDigest) !== cleanLower(p.eventDigest)) {
        addCode(blockers, 'snapshot-tombstone-execute-proposal-row-eventDigest-mismatch');
      }
    }
    scanPrivacy({ proposal: proposal, row: row || null }, blockers, warnings);
    return {
      proposalOperation: cleanString(p.operation),
      proposalEventDigest: cleanLower(p.eventDigest),
      proposalDedupeKey: cleanLower(p.dedupeKey),
      justifyingEvidenceDigests: asArray(payload.justifyingEvidenceDigests).map(cleanLower).filter(isSha256Hex)
    };
  }

  function validateHandoff(handoff, receiptSummary, blockers, warnings) {
    if (!isObject(handoff)) return null;
    var h = safeObject(handoff);
    var request = safeObject(h.handoffRequest);
    if (h.ok !== true || h.handoffReady !== true) addCode(blockers, 'snapshot-tombstone-execute-handoff-not-ready');
    if (cleanString(h.operation) && cleanString(h.operation) !== OP_TOMBSTONE_PROPOSED) {
      addCode(blockers, 'snapshot-tombstone-execute-handoff-operation-mismatch');
    }
    if (cleanString(h.subjectId) && cleanLower(h.subjectId) !== receiptSummary.subjectId) {
      addCode(blockers, 'snapshot-tombstone-execute-handoff-subjectId-mismatch');
    }
    if (cleanString(h.lineageId) && cleanLower(h.lineageId) !== receiptSummary.lineageId) {
      addCode(blockers, 'snapshot-tombstone-execute-handoff-lineageId-mismatch');
    }
    if (request.operation && cleanString(request.operation) !== OP_TOMBSTONE_PROPOSED) {
      addCode(blockers, 'snapshot-tombstone-execute-handoff-request-operation-mismatch');
    }
    scanPrivacy(handoff, blockers, warnings);
    return { handoffRequest: request, owner: safeObject(h.owner || request.owner) };
  }

  function validateReceipt(receipt, blockers, warnings) {
    var r = safeObject(receipt);
    var event = safeObject(r.applyEvent);
    var payload = safeObject(event.payload);
    var kind = operationKindForApply(event.operation);
    var proposalKind = operationKindForProposal(payload.proposalOperation);
    var f5Evidence = f5EvidenceFrom(receipt);
    if (!isObject(receipt)) {
      addCode(blockers, 'snapshot-tombstone-execute-applyEvent-receipt-required');
      return null;
    }
    if (r.ok !== true) addCode(blockers, 'snapshot-tombstone-execute-applyEvent-receipt-not-ok');
    if (!isObject(r.applyEvent)) addCode(blockers, 'snapshot-tombstone-execute-applyEvent-required');
    if (event.schema !== ENVELOPE_SCHEMA) addCode(blockers, 'snapshot-tombstone-execute-applyEvent-schema-invalid');
    if (event.kind !== APPLY_EVENT_KIND) addCode(blockers, 'snapshot-tombstone-execute-applyEvent-kind-invalid');
    if (event.subjectType !== SUBJECT_TYPE) addCode(blockers, 'snapshot-tombstone-execute-applyEvent-domain-invalid');
    if (event.operationIntent !== OPERATION_INTENT) addCode(blockers, 'snapshot-tombstone-execute-applyEvent-intent-invalid');
    if (event.redactionClass && event.redactionClass !== 'redacted') addCode(blockers, 'snapshot-tombstone-execute-redactionClass-invalid');
    if (event.dryRun !== false) addCode(blockers, 'snapshot-tombstone-execute-applyEvent-dryRun-invalid');
    if (event.transactional !== true) addCode(blockers, 'snapshot-tombstone-execute-applyEvent-transactional-required');
    if (kind !== 'tombstone' || proposalKind && proposalKind !== 'tombstone') {
      addCode(blockers, 'snapshot-tombstone-execute-operation-required');
    }
    if (!isSha256Hex(event.subjectId)) addCode(blockers, 'snapshot-tombstone-execute-applyEvent-subjectId-invalid');
    if (!isSha256Hex(event.lineageId)) addCode(blockers, 'snapshot-tombstone-execute-applyEvent-lineageId-invalid');
    if (!isSha256Hex(event.dedupeKey)) addCode(blockers, 'snapshot-tombstone-execute-applyEvent-dedupeKey-invalid');
    if (!isSha256Hex(event.eventDigest)) addCode(blockers, 'snapshot-tombstone-execute-applyEvent-eventDigest-invalid');
    if (!isObject(r.auditMetadata)) addCode(blockers, 'snapshot-tombstone-execute-auditMetadata-required');
    if (!isObject(r.auditRecord)) addCode(blockers, 'snapshot-tombstone-execute-auditRecord-required');
    if (!isObject(r.lifecycleState)) addCode(blockers, 'snapshot-tombstone-execute-lifecycleState-required');
    if (!isObject(r.lifecycleTransition)) addCode(blockers, 'snapshot-tombstone-execute-lifecycleTransition-required');
    if (!isObject(r.proposedConsumedOperation)) addCode(blockers, 'snapshot-tombstone-execute-consumed-operation-required');
    if (!isObject(r.proposedWatermarkTarget)) addCode(blockers, 'snapshot-tombstone-execute-watermark-target-required');
    if (!isObject(f5Evidence)) addCode(blockers, 'snapshot-tombstone-execute-f5-evidence-required');
    if (!isSha256Hex(payload.preStateHash)) addCode(blockers, 'snapshot-tombstone-execute-preStateHash-invalid');
    if (!isSha256Hex(payload.postStateHash)) addCode(blockers, 'snapshot-tombstone-execute-postStateHash-invalid');
    if (payload.proposalEventDigest && !isSha256Hex(payload.proposalEventDigest)) {
      addCode(blockers, 'snapshot-tombstone-execute-proposalEventDigest-invalid');
    }
    if (payload.proposalDedupeKey && !isSha256Hex(payload.proposalDedupeKey)) {
      addCode(blockers, 'snapshot-tombstone-execute-proposalDedupeKey-invalid');
    }
    if (cleanString(safeObject(payload.lifecycleTransition).toState) &&
        cleanString(safeObject(payload.lifecycleTransition).toState) !== 'tombstoned') {
      addCode(blockers, 'snapshot-tombstone-execute-target-invalid');
    }
    if (isObject(f5Evidence)) {
      if (f5Evidence.subjectId && cleanLower(f5Evidence.subjectId) !== cleanLower(event.subjectId)) {
        addCode(blockers, 'snapshot-tombstone-execute-f5-subjectId-mismatch');
      }
      if (f5Evidence.priorDigest && cleanLower(f5Evidence.priorDigest) !== cleanLower(payload.preStateHash)) {
        addCode(blockers, 'snapshot-tombstone-execute-f5-priorDigest-mismatch');
      }
    }
    scanPrivacy(receipt, blockers, warnings);
    return {
      applyEvent: event,
      payload: payload,
      f5Evidence: f5Evidence,
      operationKind: 'tombstone',
      proposalOperation: cleanString(payload.proposalOperation) || OP_TOMBSTONE_PROPOSED,
      applyOperation: cleanString(event.operation) || OP_TOMBSTONE_APPLIED,
      subjectId: cleanLower(event.subjectId),
      lineageId: cleanLower(event.lineageId),
      dedupeKey: cleanLower(event.dedupeKey),
      eventDigest: cleanLower(event.eventDigest),
      proposalEventDigest: cleanLower(payload.proposalEventDigest),
      proposalDedupeKey: cleanLower(payload.proposalDedupeKey),
      baseHash: cleanLower(payload.preStateHash),
      targetHash: cleanLower(payload.postStateHash),
      predicateVersion: cleanString(payload.predicateVersion),
      fromState: cleanString(safeObject(payload.lifecycleTransition).fromState || safeObject(payload.preState).lifecycleState),
      toState: cleanString(safeObject(payload.lifecycleTransition).toState || safeObject(payload.postState).lifecycleState),
      appliedAtIso: cleanString(payload.appliedAtIso || event.createdAt || nowIsoSeconds()),
      justifyingEvidenceDigests: asArray(payload.justifyingEvidenceDigests).map(cleanLower).filter(isSha256Hex)
    };
  }

  function tombstoneAdapterMetadata(replaceExisting) {
    return {
      adapterId: ADAPTER_ID,
      domainId: 'snapshot',
      version: VERSION,
      envelopeKinds: ['proposal-receipt'],
      operationKinds: ['tombstone'],
      dispatchTargets: ['f5'],
      replaceExisting: replaceExisting === true
    };
  }
  function registerSnapshotTombstoneExecuteAdapter(options) {
    var opts = safeObject(options);
    if (typeof H2O.Desktop.Sync.registerExecuteAdapter !== 'function') {
      return failure(['execute-adapter-registry-unavailable'], [], { adapterId: ADAPTER_ID });
    }
    var registered = H2O.Desktop.Sync.registerExecuteAdapter(tombstoneAdapterMetadata(opts.replaceExisting !== false));
    if (registered && registered.ok === true) {
      return buildResult({
        ok: true,
        adapter: registered.adapter,
        adapters: registered.adapters,
        warnings: registered.warnings,
        metadata: { registered: true }
      });
    }
    return failure(codeList(registered && registered.blockers), codeList(registered && registered.warnings), {
      adapterId: ADAPTER_ID
    });
  }

  async function shapeNativeHint(receiptSummary, reviewRef, handoff) {
    var request = safeObject(safeObject(handoff).handoffRequest);
    return {
      schema: 'h2o.desktop.sync.snapshot-tombstone-execute-f5-native-hint.v1',
      command: F5_NATIVE_COMMAND,
      requestKind: 'terminal-seal',
      closureKind: 'closed-sealed',
      idempotent: true,
      reviewId: reviewRef.reviewId,
      subjectId: receiptSummary.subjectId,
      lineageId: receiptSummary.lineageId,
      dedupeKey: receiptSummary.dedupeKey,
      eventDigest: receiptSummary.eventDigest,
      proposalEventDigest: receiptSummary.proposalEventDigest,
      baseHash: receiptSummary.baseHash,
      targetHash: receiptSummary.targetHash,
      tombstoneId: cleanString(receiptSummary.f5Evidence.tombstoneId),
      handoffDigest: await sha256Hex(request),
      receiptDigest: await sha256Hex(receiptSummary.applyEvent)
    };
  }
  async function settlementShapes(parts, receiptSummary) {
    var receipt = safeObject(parts.receipt);
    var publicationId = await sha256Hex({
      schema: 'h2o.desktop.sync.snapshot-tombstone-execute-publication-row.v1',
      dedupeKey: receiptSummary.dedupeKey,
      eventDigest: receiptSummary.eventDigest
    });
    return {
      consumedOperationRow: safeObject(receipt.proposedConsumedOperation),
      watermarkAdvance: safeObject(receipt.proposedWatermarkTarget),
      bookkeepingRow: {
        schema: 'h2o.desktop.sync.snapshot-tombstone-execute-bookkeeping-row.v1',
        domainId: 'snapshot',
        operationKind: 'tombstone',
        subjectId: receiptSummary.subjectId,
        lineageId: receiptSummary.lineageId,
        dedupeKey: receiptSummary.dedupeKey,
        eventDigest: receiptSummary.eventDigest,
        proposalEventDigest: receiptSummary.proposalEventDigest || cleanLower(safeObject(parts.proposal).eventDigest),
        receiptEventDigest: receiptSummary.eventDigest,
        baseHash: receiptSummary.baseHash,
        targetHash: receiptSummary.targetHash,
        fromState: receiptSummary.fromState,
        toState: receiptSummary.toState,
        predicateVersion: receiptSummary.predicateVersion,
        tombstoneId: cleanString(receiptSummary.f5Evidence.tombstoneId)
      },
      publicationRow: {
        schema: 'h2o.desktop.sync.snapshot-tombstone-execute-publication-row.v1',
        publicationId: publicationId,
        status: 'generated',
        domainId: 'snapshot',
        operationKind: 'tombstone',
        dedupeKey: receiptSummary.dedupeKey,
        eventDigest: receiptSummary.eventDigest
      }
    };
  }

  async function buildSnapshotTombstoneExecuteEnvelope(input, options) {
    var args = safeObject(input);
    var opts = safeObject(options);
    var blockers = [];
    var warnings = [];
    if (!isObject(input)) addCode(blockers, 'snapshot-tombstone-execute-input-required');
    if (typeof H2O.Desktop.Sync.shapeExecuteEnvelope !== 'function' ||
        typeof H2O.Desktop.Sync.validateExecuteEnvelope !== 'function') {
      addCode(blockers, 'execute-envelope-contract-unavailable');
    }
    var parts = {
      proposal: proposalEnvelope(args.proposalCandidate || args.proposal || args.candidate || args),
      proposalRow: proposalRow(args.proposalCandidate || args.proposal || args.candidate || args),
      handoff: handoffPreview(args.handoffPreview || args.f5HandoffPreview || args.tombstoneHandoffPreview || args),
      receipt: receiptWrapper(args.applyEventReceipt || args.receipt || args.snapshotApplyEventReceipt || args)
    };
    var receiptSummary = validateReceipt(parts.receipt, blockers, warnings);
    if (receiptSummary) {
      validateProposal(parts.proposal, parts.proposalRow, receiptSummary, blockers, warnings);
      validateHandoff(parts.handoff, receiptSummary, blockers, warnings);
    }
    var reviewRef = receiptSummary ? resolveReviewReference(args, parts.receipt, opts, blockers, warnings) : null;
    if (blockers.length || !receiptSummary || !reviewRef) return failure(blockers, warnings, { stage: 'validation' });

    var nativeHint = await shapeNativeHint(receiptSummary, reviewRef, parts.handoff);
    var payloadShapes = {
      proposalReceipt: {
        schema: 'h2o.desktop.sync.snapshot-tombstone-execute-proposal-receipt.v1',
        domainId: 'snapshot',
        operationKind: 'tombstone',
        proposalOperation: receiptSummary.proposalOperation,
        applyOperation: receiptSummary.applyOperation,
        proposalEventDigest: receiptSummary.proposalEventDigest,
        receiptEventDigest: receiptSummary.eventDigest,
        proposalDedupeKey: receiptSummary.proposalDedupeKey,
        receiptDedupeKey: receiptSummary.dedupeKey,
        f5ReviewReference: reviewRef,
        f5Evidence: safeObject(receiptSummary.f5Evidence),
        nativeRequestHint: nativeHint,
        auditRecord: safeObject(parts.receipt.auditRecord),
        lifecycleState: safeObject(parts.receipt.lifecycleState),
        lifecycleTransition: safeObject(parts.receipt.lifecycleTransition),
        justifyingEvidenceDigests: receiptSummary.justifyingEvidenceDigests.slice()
      }
    };
    var settlement = await settlementShapes(parts, receiptSummary);
    var shaped = await H2O.Desktop.Sync.shapeExecuteEnvelope({
      envelopeKind: 'proposal-receipt',
      domainId: 'snapshot',
      operationKind: 'tombstone',
      subjectId: receiptSummary.subjectId,
      lineageId: receiptSummary.lineageId,
      dedupeKey: receiptSummary.dedupeKey,
      eventDigest: receiptSummary.eventDigest,
      dispatchProfile: {
        requiresF5: true,
        requiresNative: true,
        requiresRelay: false,
        dispatchTarget: 'f5',
        nativeCommand: F5_NATIVE_COMMAND,
        nativeIdempotent: true,
        f5QueueKey: reviewRef.reviewId,
        retryPolicy: safeObject(opts.retryPolicy || { maxAttempts: 0, minDelayMs: 0, maxDelayMs: 0, backoffKind: 'none' })
      },
      payloadShapes: payloadShapes,
      settlementShapes: settlement,
      createdAtIso: cleanString(opts.createdAtIso || receiptSummary.appliedAtIso || nowIsoSeconds())
    });
    var envelope = Object.assign({}, shaped, {
      dispatchProfile: Object.assign({}, safeObject(shaped.dispatchProfile), { dispatchTarget: 'f5' })
    });
    scanPrivacy(envelope, blockers, warnings);
    if (blockers.length) return failure(blockers, warnings, { stage: 'privacy' });
    var validation = H2O.Desktop.Sync.validateExecuteEnvelope(envelope);
    codeList(validation && validation.warnings).forEach(function (code) { addCode(warnings, code); });
    if (!validation || validation.ok !== true) {
      codeList(validation && validation.blockers).forEach(function (code) { addCode(blockers, code); });
      if (!blockers.length) addCode(blockers, 'execute-envelope-validation-failed');
      return failure(blockers, warnings, { stage: 'execute-envelope-validation' });
    }
    var validated = Object.assign({}, validation.envelope || envelope, {
      dispatchProfile: Object.assign({}, safeObject(validation.envelope && validation.envelope.dispatchProfile), {
        dispatchTarget: 'f5'
      })
    });
    return buildResult({
      ok: true,
      envelope: validated,
      warnings: warnings,
      metadata: {
        domainId: 'snapshot',
        operationKind: 'tombstone',
        adapterId: ADAPTER_ID,
        reviewId: reviewRef.reviewId
      }
    });
  }

  async function proofFixture(kind, withReview) {
    var subjectId = await sha256Hex('snapshot-tombstone-execute-proof:subject:' + kind);
    var lineageId = await sha256Hex('snapshot-tombstone-execute-proof:lineage:' + kind);
    var proposalDedupe = await sha256Hex('snapshot-tombstone-execute-proof:proposal-dedupe:' + kind);
    var receiptDedupe = await sha256Hex('snapshot-tombstone-execute-proof:receipt-dedupe:' + kind);
    var baseHash = await sha256Hex('snapshot-tombstone-execute-proof:base:' + kind);
    var targetHash = await sha256Hex('snapshot-tombstone-execute-proof:target:' + kind);
    var evidenceDigest = await sha256Hex('snapshot-tombstone-execute-proof:evidence:' + kind);
    var reviewId = await sha256Hex('snapshot-tombstone-execute-proof:review:' + kind);
    var proposalOperation = kind === 'archive' ? OP_ARCHIVE_PROPOSED : kind === 'restore' ? OP_RESTORE_PROPOSED : OP_TOMBSTONE_PROPOSED;
    var applyOperation = kind === 'archive' ? OP_ARCHIVE_APPLIED : kind === 'restore' ? OP_RESTORE_APPLIED : OP_TOMBSTONE_APPLIED;
    var targetState = kind === 'archive' ? 'archived' : kind === 'restore' ? 'captured' : 'tombstoned';
    var actorPeer = {
      physicalDeviceIdHash: await sha256Hex('snapshot-tombstone-execute-proof:device:' + kind),
      installIdHash: await sha256Hex('snapshot-tombstone-execute-proof:install:' + kind),
      syncPeerIdHash: await sha256Hex('snapshot-tombstone-execute-proof:peer:' + kind)
    };
    var proposalPayload = {
      proposedOperation: {
        operation: proposalOperation,
        operationIntent: OPERATION_INTENT,
        subjectType: SUBJECT_TYPE,
        subjectId: subjectId,
        baseHash: baseHash,
        targetHash: targetHash,
        lifecycleTransition: { fromState: 'captured', toState: targetState }
      },
      expectedPostState: {
        subjectType: SUBJECT_TYPE,
        subjectId: subjectId,
        expectedPostStateHash: targetHash,
        lifecycleState: targetState
      },
      predicateVersion: 'h2o.snapshot.' + kind + '.predicate.v1',
      justifyingEvidenceDigests: [evidenceDigest]
    };
    var proposal = {
      schema: ENVELOPE_SCHEMA,
      kind: PROPOSAL_KIND,
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      lineageId: lineageId,
      dedupeKey: proposalDedupe,
      eventDigest: await sha256Hex('snapshot-tombstone-execute-proof:proposal-event:' + kind),
      payloadHash: await sha256Hex(proposalPayload),
      operation: proposalOperation,
      operationIntent: OPERATION_INTENT,
      redactionClass: 'redacted',
      sourcePlatform: { platformId: 'desktop-studio', surfaceKind: 'desktop-tauri', sourcePeerEnvelope: actorPeer },
      createdAt: '2026-06-01T10:00:00Z',
      expiresAt: '2026-06-01T10:20:00Z',
      payload: proposalPayload
    };
    var f5Evidence = {
      schema: 'h2o.desktop.sync.snapshot-tombstone-f5-evidence-preview.v1',
      previewOnly: true,
      tombstoneId: await sha256Hex('snapshot-tombstone-execute-proof:tombstone:' + kind),
      subjectId: subjectId,
      recordKind: 'snapshot',
      deletedAt: '2026-06-01T10:01:00Z',
      deletedBySyncPeerId: actorPeer.syncPeerIdHash,
      deleteReason: 'snapshot-tombstone-applyEvent-receipt',
      priorDigest: baseHash,
      evidenceValid: true
    };
    var receiptPayload = {
      auditMaintenanceId: await sha256Hex('snapshot-tombstone-execute-proof:audit:' + kind),
      operationId: await sha256Hex('snapshot-tombstone-execute-proof:operation-id:' + kind),
      transactionId: await sha256Hex('snapshot-tombstone-execute-proof:transaction-id:' + kind),
      subjectId: subjectId,
      lineageId: lineageId,
      operation: applyOperation,
      proposalOperation: proposalOperation,
      operationIntent: OPERATION_INTENT,
      preStateHash: baseHash,
      postStateHash: targetHash,
      preState: { hash: baseHash, lifecycleState: 'captured' },
      postState: { hash: targetHash, lifecycleState: targetState },
      lifecycleTransition: { fromState: 'captured', toState: targetState },
      actorPeer: actorPeer,
      owner: { ownerKind: 'f5', authorityLevel: 'f5-review-authority' },
      f5Evidence: f5Evidence,
      appliedAtIso: '2026-06-01T10:01:00Z',
      predicateVersion: proposalPayload.predicateVersion,
      proposalEventDigest: proposal.eventDigest,
      proposalDedupeKey: proposal.dedupeKey,
      justifyingEvidenceDigests: [evidenceDigest],
      tombstoned: kind === 'tombstone',
      result: 'applied',
      receiptOnly: true
    };
    var applyEvent = {
      schema: ENVELOPE_SCHEMA,
      kind: APPLY_EVENT_KIND,
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      lineageId: lineageId,
      dedupeKey: receiptDedupe,
      eventDigest: await sha256Hex('snapshot-tombstone-execute-proof:receipt-event:' + kind),
      payloadHash: await sha256Hex(receiptPayload),
      operation: applyOperation,
      operationIntent: OPERATION_INTENT,
      redactionClass: 'redacted',
      dryRun: false,
      transactional: true,
      createdAt: '2026-06-01T10:01:00Z',
      payload: receiptPayload
    };
    var fixture = {
      proposalCandidate: {
        proposalCandidate: proposal,
        candidateRow: { status: 'generated', eventDigest: proposal.eventDigest, dedupeKey: proposal.dedupeKey }
      },
      handoffPreview: {
        schema: 'h2o.desktop.sync.snapshot-f5-tombstone-handoff-preview.v1',
        ok: true,
        handoffReady: true,
        operation: proposalOperation,
        subjectId: subjectId,
        lineageId: lineageId,
        dedupeKey: proposalDedupe,
        owner: { ownerKind: 'f5', authorityLevel: 'f5-review-authority' },
        handoffRequest: { previewSchema: 'h2o.desktop.sync.snapshot-f5-tombstone-handoff-request.v1', operation: proposalOperation }
      },
      applyEventReceipt: {
        schema: 'h2o.desktop.sync.snapshot-tombstone-apply-event-receipt.v1',
        ok: true,
        applyEvent: applyEvent,
        auditMetadata: { schema: 'h2o.desktop.sync.snapshot-audit-metadata.v1', eventDigest: applyEvent.eventDigest },
        auditRecord: { schema: 'h2o.desktop.sync.kernel.audit-record.v1', eventDigest: applyEvent.eventDigest, auditResult: 'success' },
        lifecycleState: { schema: 'h2o.desktop.sync.kernel.lifecycle-state.v1', subjectId: subjectId, state: 'retained' },
        lifecycleTransition: { schema: 'h2o.desktop.sync.kernel.lifecycle-transition.v1', fromState: 'active', toState: 'retained' },
        f5Evidence: f5Evidence,
        proposedF5Record: f5Evidence,
        proposedConsumedOperation: {
          schema: 'h2o.desktop.sync.snapshot-tombstone-consumed-operation-preview.v1',
          consumedId: receiptPayload.operationId,
          eventDigest: applyEvent.eventDigest,
          dedupeKey: applyEvent.dedupeKey,
          lineageId: lineageId,
          subjectId: subjectId,
          envelopeKind: APPLY_EVENT_KIND,
          operationKind: 'snapshot.tombstone.applyEvent',
          consumedStatus: 'consumed',
          consumedAtIso: receiptPayload.appliedAtIso
        },
        proposedWatermarkTarget: {
          schema: 'h2o.desktop.sync.snapshot-tombstone-watermark-target-preview.v1',
          peerId: actorPeer.syncPeerIdHash,
          subjectId: subjectId,
          lineageId: lineageId,
          revisionHash: targetHash,
          watermarkAtIso: receiptPayload.appliedAtIso,
          dedupeKey: applyEvent.dedupeKey
        },
        blockers: [],
        warnings: []
      }
    };
    if (withReview !== false) {
      fixture.f5Review = {
        reviewId: reviewId,
        currentState: 'approved-seal',
        subjectId: subjectId,
        lineageId: lineageId,
        candidateId: 'snapshot-tombstone-proof-candidate',
        proposalEnvelopeId: proposal.id || ''
      };
    }
    return fixture;
  }

  async function runSnapshotTombstoneExecuteAdapterProof() {
    var blockers = [];
    var warnings = [];
    var registered = registerSnapshotTombstoneExecuteAdapter({ replaceExisting: true });
    if (!registered.ok) codeList(registered.blockers).forEach(function (code) { addCode(blockers, code); });
    var valid = await buildSnapshotTombstoneExecuteEnvelope(await proofFixture('tombstone', true));
    if (!valid.ok || safeObject(valid.envelope).operationKind !== 'tombstone' ||
        safeObject(safeObject(valid.envelope).dispatchProfile).requiresF5 !== true ||
        safeObject(safeObject(valid.envelope).dispatchProfile).dispatchTarget !== 'f5') {
      addCode(blockers, 'proof-tombstone-envelope-invalid');
    }
    var missingReview = await buildSnapshotTombstoneExecuteEnvelope(await proofFixture('tombstone', false));
    if (missingReview.ok) addCode(blockers, 'proof-missing-f5-review-accepted');
    var wrongOperation = await proofFixture('tombstone', true);
    wrongOperation.applyEventReceipt.applyEvent.operation = 'snapshot-lifecycle-delete-applied';
    var wrong = await buildSnapshotTombstoneExecuteEnvelope(wrongOperation);
    if (wrong.ok) addCode(blockers, 'proof-wrong-operation-accepted');
    var invalidInput = await proofFixture('tombstone', true);
    invalidInput.applyEventReceipt.ok = false;
    var invalid = await buildSnapshotTombstoneExecuteEnvelope(invalidInput);
    if (invalid.ok) addCode(blockers, 'proof-invalid-receipt-accepted');
    var archive = await buildSnapshotTombstoneExecuteEnvelope(await proofFixture('archive', true));
    var restore = await buildSnapshotTombstoneExecuteEnvelope(await proofFixture('restore', true));
    if (archive.ok || restore.ok) addCode(blockers, 'proof-archive-restore-accepted');
    var rawLeakInput = await proofFixture('tombstone', true);
    rawLeakInput.applyEventReceipt.applyEvent.payload.snapshotId = 'raw-snapshot-id';
    var rawLeak = await buildSnapshotTombstoneExecuteEnvelope(rawLeakInput);
    if (rawLeak.ok) addCode(blockers, 'proof-raw-leak-accepted');
    var listed = typeof H2O.Desktop.Sync.listExecuteAdapters === 'function' ? H2O.Desktop.Sync.listExecuteAdapters() : null;
    var got = typeof H2O.Desktop.Sync.getExecuteAdapter === 'function' ? H2O.Desktop.Sync.getExecuteAdapter('snapshot') : null;
    var listedHasSnapshot = asArray(listed && listed.adapters).some(function (adapter) {
      return safeObject(adapter).domainId === 'snapshot' && safeObject(adapter).adapterId === ADAPTER_ID;
    });
    if (!listed || listed.ok !== true || !listedHasSnapshot || !got || got.ok !== true || safeObject(got.adapter).adapterId !== ADAPTER_ID) {
      addCode(blockers, 'proof-adapter-registry-failed');
    }
    if (!allSideEffectsFalse(valid.sideEffectSummary) ||
        !allSideEffectsFalse(missingReview.sideEffectSummary) ||
        !allSideEffectsFalse(invalid.sideEffectSummary)) {
      addCode(blockers, 'proof-side-effects-not-false');
    }
    return buildResult({
      ok: blockers.length === 0,
      envelope: valid.envelope,
      adapter: got && got.adapter,
      adapters: listed && listed.adapters,
      blockers: blockers,
      warnings: warnings,
      metadata: {
        proof: 'snapshot-tombstone-execute-adapter',
        tombstoneEnvelopeValid: valid.ok === true,
        missingF5ReviewBlocked: missingReview.ok !== true,
        wrongOperationBlocked: wrong.ok !== true,
        invalidReceiptBlocked: invalid.ok !== true,
        archiveRestoreBlocked: archive.ok !== true && restore.ok !== true,
        rawLeakBlocked: rawLeak.ok !== true,
        adapterRegistryWorks: listedHasSnapshot && got && got.ok === true,
        sideEffectsFalse: allSideEffectsFalse(valid.sideEffectSummary) &&
          allSideEffectsFalse(missingReview.sideEffectSummary) &&
          allSideEffectsFalse(invalid.sideEffectSummary)
      }
    });
  }

  H2O.Desktop.Sync.registerSnapshotTombstoneExecuteAdapter = registerSnapshotTombstoneExecuteAdapter;
  H2O.Desktop.Sync.buildSnapshotTombstoneExecuteEnvelope = buildSnapshotTombstoneExecuteEnvelope;
  H2O.Desktop.Sync.runSnapshotTombstoneExecuteAdapterProof = runSnapshotTombstoneExecuteAdapterProof;
  H2O.Desktop.Sync.__snapshotTombstoneExecuteAdapterInstalled = true;
  H2O.Desktop.Sync.__snapshotTombstoneExecuteAdapterVersion = VERSION;
  if (typeof H2O.Desktop.Sync.registerExecuteAdapter === 'function') {
    try { registerSnapshotTombstoneExecuteAdapter({ replaceExisting: true }); } catch (_) { /* proof covers registration */ }
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
