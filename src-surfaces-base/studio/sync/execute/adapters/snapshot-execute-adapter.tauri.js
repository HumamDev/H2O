/* H2O Desktop Sync - F14.6.14 snapshot execute adapter
 *
 * Snapshot domain adapter for Execute Lane proposal-receipt envelopes.
 *
 * Safety invariants:
 *   - Adapter registration and envelope shaping only.
 *   - Supports archive and restore proposal receipts. Tombstone/F5 execute
 *     adapter work is explicitly deferred to F14.6.15.
 *   - Does not call Snapshot generators, handoff previews, receipt builders,
 *     bookkeeping, Native, F5, brokers, publication, settlement, storage,
 *     timers, polling, or UI.
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
  if (H2O.Desktop.Sync.__snapshotExecuteAdapterInstalled) return;

  var VERSION = '0.1.0-f14.6.14';
  var RESULT_SCHEMA = 'h2o.desktop.sync.snapshot-execute-adapter-result.v1';
  var ADAPTER_ID = 'snapshot-execute-adapter';
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
  function isIso(value) {
    var text = cleanString(value);
    return !!text && Number.isFinite(Date.parse(text));
  }
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
      } catch (_) { addCode(warnings, 'snapshot-execute-domain-forbidden-field-scan-threw'); }
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
      } catch (_) { addCode(warnings, 'snapshot-execute-privacy-scan-threw'); }
    }
    var forbidden = foreverNoKey(value);
    if (forbidden) {
      addCode(blockers, 'snapshot-execute-output-contains-forbidden-field');
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
    if (isObject(source.nativeHandoffPreview)) return source.nativeHandoffPreview;
    if (isObject(source.archiveHandoffPreview)) return source.archiveHandoffPreview;
    if (isObject(source.restoreHandoffPreview)) return source.restoreHandoffPreview;
    if (isObject(source.preview)) return source.preview;
    if (cleanString(source.handoffRequest && source.handoffRequest.previewSchema) || source.handoffReady === true) return source;
    return null;
  }
  function receiptWrapper(input) {
    var source = safeObject(input);
    if (isObject(source.applyEventReceipt)) return source.applyEventReceipt;
    if (isObject(source.snapshotApplyEventReceipt)) return source.snapshotApplyEventReceipt;
    if (isObject(source.receipt)) return source.receipt;
    if (isObject(source.archiveApplyEventReceipt)) return source.archiveApplyEventReceipt;
    if (isObject(source.restoreApplyEventReceipt)) return source.restoreApplyEventReceipt;
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
  function appliedOperationFor(kind) {
    if (kind === 'archive') return OP_ARCHIVE_APPLIED;
    if (kind === 'restore') return OP_RESTORE_APPLIED;
    return '';
  }
  function proposedOperationFor(kind) {
    if (kind === 'archive') return OP_ARCHIVE_PROPOSED;
    if (kind === 'restore') return OP_RESTORE_PROPOSED;
    return '';
  }
  function defaultNativeCommand(kind) {
    if (kind === 'archive') return 'snapshot.archive';
    if (kind === 'restore') return 'snapshot.restore';
    return '';
  }
  function nativeCommandFrom(handoff, kind, options) {
    var opts = safeObject(options);
    var request = safeObject(safeObject(handoff).handoffRequest);
    return cleanString(opts.nativeCommand ||
      request.nativeCommand ||
      request.command ||
      request.operationCommand ||
      safeObject(safeObject(handoff).dispatchProfile).nativeCommand ||
      defaultNativeCommand(kind));
  }

  function validateOptionalProposal(proposal, row, receiptSummary, blockers, warnings) {
    if (!isObject(proposal)) return null;
    var p = safeObject(proposal);
    var payload = safeObject(p.payload);
    var proposed = safeObject(payload.proposedOperation);
    var expected = safeObject(payload.expectedPostState);
    var transition = safeObject(proposed.lifecycleTransition);
    var kind = operationKindForProposal(p.operation);
    if (p.schema !== ENVELOPE_SCHEMA) addCode(blockers, 'snapshot-execute-proposal-schema-invalid');
    if (p.kind !== PROPOSAL_KIND) addCode(blockers, 'snapshot-execute-proposal-kind-invalid');
    if (p.subjectType !== SUBJECT_TYPE) addCode(blockers, 'snapshot-execute-proposal-domain-invalid');
    if (p.operationIntent !== OPERATION_INTENT) addCode(blockers, 'snapshot-execute-proposal-intent-invalid');
    if (kind === 'tombstone') addCode(blockers, 'snapshot-execute-tombstone-deferred');
    if (kind && kind !== receiptSummary.operationKind) addCode(blockers, 'snapshot-execute-proposal-operation-mismatch');
    if (!isSha256Hex(p.subjectId)) addCode(blockers, 'snapshot-execute-proposal-subjectId-invalid');
    if (!isSha256Hex(p.lineageId)) addCode(blockers, 'snapshot-execute-proposal-lineageId-invalid');
    if (!isSha256Hex(p.dedupeKey)) addCode(blockers, 'snapshot-execute-proposal-dedupeKey-invalid');
    if (!isSha256Hex(p.eventDigest)) addCode(blockers, 'snapshot-execute-proposal-eventDigest-invalid');
    if (cleanLower(p.subjectId) !== receiptSummary.subjectId) addCode(blockers, 'snapshot-execute-proposal-subjectId-mismatch');
    if (cleanLower(p.lineageId) !== receiptSummary.lineageId) addCode(blockers, 'snapshot-execute-proposal-lineageId-mismatch');
    if (receiptSummary.proposalEventDigest && cleanLower(p.eventDigest) !== receiptSummary.proposalEventDigest) {
      addCode(blockers, 'snapshot-execute-proposal-eventDigest-mismatch');
    }
    if (receiptSummary.proposalDedupeKey && cleanLower(p.dedupeKey) !== receiptSummary.proposalDedupeKey) {
      addCode(blockers, 'snapshot-execute-proposal-dedupeKey-mismatch');
    }
    if (!isObject(payload)) addCode(blockers, 'snapshot-execute-proposal-payload-required');
    if (!isObject(proposed)) addCode(blockers, 'snapshot-execute-proposal-operation-required');
    if (proposed.operation && proposed.operation !== p.operation) addCode(blockers, 'snapshot-execute-proposal-operation-field-mismatch');
    if (cleanString(payload.predicateVersion) && receiptSummary.predicateVersion &&
        cleanString(payload.predicateVersion) !== receiptSummary.predicateVersion) {
      addCode(blockers, 'snapshot-execute-proposal-predicateVersion-mismatch');
    }
    if (cleanString(proposed.baseHash) && cleanLower(proposed.baseHash) !== receiptSummary.baseHash) {
      addCode(blockers, 'snapshot-execute-proposal-baseHash-mismatch');
    }
    if (cleanString(proposed.targetHash) && cleanLower(proposed.targetHash) !== receiptSummary.targetHash) {
      addCode(blockers, 'snapshot-execute-proposal-targetHash-mismatch');
    }
    if (receiptSummary.operationKind === 'archive' && cleanString(transition.toState) &&
        cleanString(transition.toState) !== 'archived') {
      addCode(blockers, 'snapshot-execute-proposal-archive-target-invalid');
    }
    if (receiptSummary.operationKind === 'restore' && cleanString(transition.toState) &&
        cleanString(transition.toState) !== 'captured') {
      addCode(blockers, 'snapshot-execute-proposal-restore-target-invalid');
    }
    if (isObject(expected) && cleanString(expected.lifecycleState)) {
      var expectedTarget = receiptSummary.operationKind === 'archive' ? 'archived' : 'captured';
      if (cleanString(expected.lifecycleState) !== expectedTarget) {
        addCode(blockers, 'snapshot-execute-proposal-expected-target-mismatch');
      }
    }
    if (row) {
      if (cleanString(row.status) && cleanString(row.status) !== 'generated') addCode(blockers, 'snapshot-execute-proposal-row-status-invalid');
      if (cleanString(row.eventDigest) && cleanLower(row.eventDigest) !== cleanLower(p.eventDigest)) {
        addCode(blockers, 'snapshot-execute-proposal-row-eventDigest-mismatch');
      }
      if (cleanString(row.dedupeKey) && cleanLower(row.dedupeKey) !== cleanLower(p.dedupeKey)) {
        addCode(blockers, 'snapshot-execute-proposal-row-dedupeKey-mismatch');
      }
    }
    scanPrivacy({ proposal: proposal, row: row || null }, blockers, warnings);
    return {
      operationKind: kind,
      proposalOperation: cleanString(p.operation),
      proposalEventDigest: cleanLower(p.eventDigest),
      proposalDedupeKey: cleanLower(p.dedupeKey),
      justifyingEvidenceDigests: asArray(payload.justifyingEvidenceDigests).map(cleanLower).filter(isSha256Hex)
    };
  }

  function validateOptionalHandoff(handoff, receiptSummary, blockers, warnings) {
    if (!isObject(handoff)) return null;
    var h = safeObject(handoff);
    var request = safeObject(h.handoffRequest);
    if (h.ok !== true || h.handoffReady !== true) addCode(blockers, 'snapshot-execute-handoff-not-ready');
    if (cleanString(h.operation) && cleanString(h.operation) !== receiptSummary.proposalOperation) {
      addCode(blockers, 'snapshot-execute-handoff-operation-mismatch');
    }
    if (cleanString(h.subjectId) && cleanLower(h.subjectId) !== receiptSummary.subjectId) {
      addCode(blockers, 'snapshot-execute-handoff-subjectId-mismatch');
    }
    if (cleanString(h.lineageId) && cleanLower(h.lineageId) !== receiptSummary.lineageId) {
      addCode(blockers, 'snapshot-execute-handoff-lineageId-mismatch');
    }
    if (cleanString(h.dedupeKey) && cleanLower(h.dedupeKey) !== receiptSummary.proposalDedupeKey) {
      addCode(blockers, 'snapshot-execute-handoff-dedupeKey-mismatch');
    }
    if (request.operation && cleanString(request.operation) !== receiptSummary.proposalOperation) {
      addCode(blockers, 'snapshot-execute-handoff-request-operation-mismatch');
    }
    if (request.subjectId && cleanLower(request.subjectId) !== receiptSummary.subjectId) {
      addCode(blockers, 'snapshot-execute-handoff-request-subjectId-mismatch');
    }
    scanPrivacy(handoff, blockers, warnings);
    return {
      handoffRequest: request,
      handoffDigestInput: request,
      owner: safeObject(h.owner || request.owner)
    };
  }

  function validateReceipt(receipt, blockers, warnings) {
    var r = safeObject(receipt);
    var event = safeObject(r.applyEvent);
    var payload = safeObject(event.payload);
    var kind = operationKindForApply(event.operation);
    var proposalKind = operationKindForProposal(payload.proposalOperation);
    if (!isObject(receipt)) {
      addCode(blockers, 'snapshot-execute-applyEvent-receipt-required');
      return null;
    }
    if (r.ok !== true) addCode(blockers, 'snapshot-execute-applyEvent-receipt-not-ok');
    if (!isObject(r.applyEvent)) addCode(blockers, 'snapshot-execute-applyEvent-required');
    if (event.schema !== ENVELOPE_SCHEMA) addCode(blockers, 'snapshot-execute-applyEvent-schema-invalid');
    if (event.kind !== APPLY_EVENT_KIND) addCode(blockers, 'snapshot-execute-applyEvent-kind-invalid');
    if (event.subjectType !== SUBJECT_TYPE) addCode(blockers, 'snapshot-execute-applyEvent-domain-invalid');
    if (event.operationIntent !== OPERATION_INTENT) addCode(blockers, 'snapshot-execute-applyEvent-intent-invalid');
    if (event.redactionClass && event.redactionClass !== 'redacted') addCode(blockers, 'snapshot-execute-redactionClass-invalid');
    if (event.dryRun !== false) addCode(blockers, 'snapshot-execute-applyEvent-dryRun-invalid');
    if (event.transactional !== true) addCode(blockers, 'snapshot-execute-applyEvent-transactional-required');
    if (kind === 'tombstone' || proposalKind === 'tombstone') addCode(blockers, 'snapshot-execute-tombstone-deferred');
    if (kind !== 'archive' && kind !== 'restore') addCode(blockers, 'snapshot-execute-operation-unsupported');
    if (proposalKind && proposalKind !== kind) addCode(blockers, 'snapshot-execute-proposal-apply-operation-mismatch');
    if (!isSha256Hex(event.subjectId)) addCode(blockers, 'snapshot-execute-applyEvent-subjectId-invalid');
    if (!isSha256Hex(event.lineageId)) addCode(blockers, 'snapshot-execute-applyEvent-lineageId-invalid');
    if (!isSha256Hex(event.dedupeKey)) addCode(blockers, 'snapshot-execute-applyEvent-dedupeKey-invalid');
    if (!isSha256Hex(event.eventDigest)) addCode(blockers, 'snapshot-execute-applyEvent-eventDigest-invalid');
    if (!isObject(r.auditMetadata)) addCode(blockers, 'snapshot-execute-auditMetadata-required');
    if (!isObject(r.auditRecord)) addCode(blockers, 'snapshot-execute-auditRecord-required');
    if (!isObject(r.lifecycleState)) addCode(blockers, 'snapshot-execute-lifecycleState-required');
    if (!isObject(r.lifecycleTransition)) addCode(blockers, 'snapshot-execute-lifecycleTransition-required');
    if (!isObject(r.proposedConsumedOperation)) addCode(blockers, 'snapshot-execute-consumed-operation-required');
    if (!isObject(r.proposedWatermarkTarget)) addCode(blockers, 'snapshot-execute-watermark-target-required');
    if (!isSha256Hex(payload.preStateHash)) addCode(blockers, 'snapshot-execute-preStateHash-invalid');
    if (!isSha256Hex(payload.postStateHash)) addCode(blockers, 'snapshot-execute-postStateHash-invalid');
    if (payload.proposalEventDigest && !isSha256Hex(payload.proposalEventDigest)) {
      addCode(blockers, 'snapshot-execute-proposalEventDigest-invalid');
    }
    if (payload.proposalDedupeKey && !isSha256Hex(payload.proposalDedupeKey)) {
      addCode(blockers, 'snapshot-execute-proposalDedupeKey-invalid');
    }
    if (payload.subjectId && cleanLower(payload.subjectId) !== cleanLower(event.subjectId)) {
      addCode(blockers, 'snapshot-execute-payload-subjectId-mismatch');
    }
    if (payload.lineageId && cleanLower(payload.lineageId) !== cleanLower(event.lineageId)) {
      addCode(blockers, 'snapshot-execute-payload-lineageId-mismatch');
    }
    if (kind === 'archive' && cleanString(safeObject(payload.lifecycleTransition).toState) &&
        cleanString(safeObject(payload.lifecycleTransition).toState) !== 'archived') {
      addCode(blockers, 'snapshot-execute-archive-target-invalid');
    }
    if (kind === 'restore' && cleanString(safeObject(payload.lifecycleTransition).toState) &&
        cleanString(safeObject(payload.lifecycleTransition).toState) !== 'captured') {
      addCode(blockers, 'snapshot-execute-restore-target-invalid');
    }
    scanPrivacy(receipt, blockers, warnings);
    return {
      applyEvent: event,
      payload: payload,
      operationKind: kind,
      proposalOperation: cleanString(payload.proposalOperation) || proposedOperationFor(kind),
      applyOperation: cleanString(event.operation) || appliedOperationFor(kind),
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

  function snapshotAdapterMetadata(replaceExisting) {
    return {
      adapterId: ADAPTER_ID,
      domainId: 'snapshot',
      version: VERSION,
      envelopeKinds: ['proposal-receipt'],
      operationKinds: ['archive', 'restore'],
      dispatchTargets: ['native'],
      replaceExisting: replaceExisting === true
    };
  }
  function registerSnapshotExecuteAdapter(options) {
    var opts = safeObject(options);
    if (typeof H2O.Desktop.Sync.registerExecuteAdapter !== 'function') {
      return failure(['execute-adapter-registry-unavailable'], [], { adapterId: ADAPTER_ID });
    }
    var registered = H2O.Desktop.Sync.registerExecuteAdapter(snapshotAdapterMetadata(opts.replaceExisting === true));
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

  async function shapeNativeRequest(parts, receiptSummary, nativeCommand) {
    var proposal = safeObject(parts.proposal);
    var handoff = safeObject(parts.handoff);
    var request = safeObject(handoff.handoffRequest);
    return {
      schema: 'h2o.desktop.sync.snapshot-execute-native-request.v1',
      command: nativeCommand,
      idempotent: true,
      domainId: 'snapshot',
      operationKind: receiptSummary.operationKind,
      proposalOperation: receiptSummary.proposalOperation,
      applyOperation: receiptSummary.applyOperation,
      subjectId: receiptSummary.subjectId,
      lineageId: receiptSummary.lineageId,
      dedupeKey: receiptSummary.dedupeKey,
      eventDigest: receiptSummary.eventDigest,
      proposalEventDigest: receiptSummary.proposalEventDigest || cleanLower(proposal.eventDigest),
      proposalDedupeKey: receiptSummary.proposalDedupeKey || cleanLower(proposal.dedupeKey),
      baseHash: receiptSummary.baseHash,
      targetHash: receiptSummary.targetHash,
      fromState: receiptSummary.fromState,
      toState: receiptSummary.toState,
      predicateVersion: receiptSummary.predicateVersion,
      handoffDigest: await sha256Hex(request),
      receiptDigest: await sha256Hex(parts.receipt)
    };
  }
  async function settlementShapes(parts, receiptSummary) {
    var receipt = safeObject(parts.receipt);
    var event = safeObject(receipt.applyEvent);
    var publicationId = await sha256Hex({
      schema: 'h2o.desktop.sync.snapshot-execute-publication-row.v1',
      dedupeKey: receiptSummary.dedupeKey,
      eventDigest: receiptSummary.eventDigest
    });
    return {
      consumedOperationRow: safeObject(receipt.proposedConsumedOperation),
      watermarkAdvance: safeObject(receipt.proposedWatermarkTarget),
      bookkeepingRow: {
        schema: 'h2o.desktop.sync.snapshot-execute-bookkeeping-row.v1',
        domainId: 'snapshot',
        operationKind: receiptSummary.operationKind,
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
        predicateVersion: receiptSummary.predicateVersion
      },
      publicationRow: {
        schema: 'h2o.desktop.sync.snapshot-execute-publication-row.v1',
        publicationId: publicationId,
        status: 'generated',
        domainId: 'snapshot',
        operationKind: receiptSummary.operationKind,
        dedupeKey: receiptSummary.dedupeKey,
        eventDigest: receiptSummary.eventDigest
      }
    };
  }

  async function buildSnapshotExecuteEnvelope(input, options) {
    var args = safeObject(input);
    var opts = safeObject(options);
    var blockers = [];
    var warnings = [];
    if (!isObject(input)) addCode(blockers, 'snapshot-execute-input-required');
    if (typeof H2O.Desktop.Sync.shapeExecuteEnvelope !== 'function' ||
        typeof H2O.Desktop.Sync.validateExecuteEnvelope !== 'function') {
      addCode(blockers, 'execute-envelope-contract-unavailable');
    }
    var parts = {
      proposal: proposalEnvelope(args.proposalCandidate || args.proposal || args.candidate || args),
      proposalRow: proposalRow(args.proposalCandidate || args.proposal || args.candidate || args),
      handoff: handoffPreview(args.handoffPreview || args.nativeHandoffPreview || args.archiveHandoffPreview || args.restoreHandoffPreview || args),
      receipt: receiptWrapper(args.applyEventReceipt || args.receipt || args.snapshotApplyEventReceipt || args)
    };
    var receiptSummary = validateReceipt(parts.receipt, blockers, warnings);
    if (receiptSummary) {
      validateOptionalProposal(parts.proposal, parts.proposalRow, receiptSummary, blockers, warnings);
      validateOptionalHandoff(parts.handoff, receiptSummary, blockers, warnings);
    }
    if (blockers.length || !receiptSummary) return failure(blockers, warnings, { stage: 'validation' });

    var nativeCommand = nativeCommandFrom(parts.handoff, receiptSummary.operationKind, opts);
    if (!nativeCommand) addCode(blockers, 'snapshot-execute-nativeCommand-required');
    var nativeRequest = await shapeNativeRequest(parts, receiptSummary, nativeCommand);
    var payloadShapes = {
      proposalReceipt: {
        schema: 'h2o.desktop.sync.snapshot-execute-proposal-receipt.v1',
        domainId: 'snapshot',
        operationKind: receiptSummary.operationKind,
        proposalOperation: receiptSummary.proposalOperation,
        applyOperation: receiptSummary.applyOperation,
        proposalEventDigest: receiptSummary.proposalEventDigest,
        receiptEventDigest: receiptSummary.eventDigest,
        proposalDedupeKey: receiptSummary.proposalDedupeKey,
        receiptDedupeKey: receiptSummary.dedupeKey,
        nativeRequest: nativeRequest,
        auditRecord: safeObject(parts.receipt.auditRecord),
        lifecycleState: safeObject(parts.receipt.lifecycleState),
        lifecycleTransition: safeObject(parts.receipt.lifecycleTransition),
        justifyingEvidenceDigests: receiptSummary.justifyingEvidenceDigests.slice()
      }
    };
    var settlement = await settlementShapes(parts, receiptSummary);
    var envelope = await H2O.Desktop.Sync.shapeExecuteEnvelope({
      envelopeKind: 'proposal-receipt',
      domainId: 'snapshot',
      operationKind: receiptSummary.operationKind,
      subjectId: receiptSummary.subjectId,
      lineageId: receiptSummary.lineageId,
      dedupeKey: receiptSummary.dedupeKey,
      eventDigest: receiptSummary.eventDigest,
      dispatchProfile: {
        requiresF5: false,
        requiresNative: true,
        requiresRelay: false,
        nativeCommand: nativeCommand,
        nativeIdempotent: true,
        f5QueueKey: '',
        retryPolicy: safeObject(opts.retryPolicy || { maxAttempts: 0, minDelayMs: 0, maxDelayMs: 0, backoffKind: 'none' })
      },
      payloadShapes: payloadShapes,
      settlementShapes: settlement,
      createdAtIso: cleanString(opts.createdAtIso || receiptSummary.appliedAtIso || nowIsoSeconds())
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
    return buildResult({
      ok: true,
      envelope: validation.envelope || envelope,
      warnings: warnings,
      metadata: {
        domainId: 'snapshot',
        operationKind: receiptSummary.operationKind,
        adapterId: ADAPTER_ID,
        tombstoneF5Deferred: true
      }
    });
  }

  async function proofFixture(kind) {
    var subjectId = await sha256Hex('snapshot-execute-proof:subject:' + kind);
    var lineageId = await sha256Hex('snapshot-execute-proof:lineage:' + kind);
    var proposalDedupe = await sha256Hex('snapshot-execute-proof:proposal-dedupe:' + kind);
    var receiptDedupe = await sha256Hex('snapshot-execute-proof:receipt-dedupe:' + kind);
    var baseHash = await sha256Hex('snapshot-execute-proof:base:' + kind);
    var targetHash = await sha256Hex('snapshot-execute-proof:target:' + kind);
    var evidenceDigest = await sha256Hex('snapshot-execute-proof:evidence:' + kind);
    var proposalOperation = kind === 'archive' ? OP_ARCHIVE_PROPOSED : kind === 'restore' ? OP_RESTORE_PROPOSED : OP_TOMBSTONE_PROPOSED;
    var applyOperation = kind === 'archive' ? OP_ARCHIVE_APPLIED : kind === 'restore' ? OP_RESTORE_APPLIED : OP_TOMBSTONE_APPLIED;
    var targetState = kind === 'archive' ? 'archived' : kind === 'restore' ? 'captured' : 'tombstoned';
    var fromState = kind === 'restore' ? 'archived' : 'captured';
    var proposedOperation = {
      operation: proposalOperation,
      operationIntent: OPERATION_INTENT,
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      baseHash: baseHash,
      targetHash: targetHash,
      lifecycleTransition: { fromState: fromState, toState: targetState }
    };
    var proposalPayload = {
      proposedOperation: proposedOperation,
      expectedPostState: {
        subjectType: SUBJECT_TYPE,
        subjectId: subjectId,
        expectedPostStateHash: targetHash,
        lifecycleState: targetState
      },
      predicateVersion: 'h2o.snapshot.' + (kind === 'tombstone' ? 'tombstone' : kind) + '.predicate.v1',
      justifyingEvidenceDigests: [evidenceDigest]
    };
    var actorPeer = {
      physicalDeviceIdHash: await sha256Hex('snapshot-execute-proof:device:' + kind),
      installIdHash: await sha256Hex('snapshot-execute-proof:install:' + kind),
      syncPeerIdHash: await sha256Hex('snapshot-execute-proof:peer:' + kind)
    };
    var proposal = {
      schema: ENVELOPE_SCHEMA,
      kind: PROPOSAL_KIND,
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      lineageId: lineageId,
      dedupeKey: proposalDedupe,
      eventDigest: await sha256Hex('snapshot-execute-proof:proposal-event:' + kind),
      payloadHash: await sha256Hex(proposalPayload),
      operation: proposalOperation,
      operationIntent: OPERATION_INTENT,
      redactionClass: 'redacted',
      sourcePlatform: {
        platformId: 'desktop-studio',
        surfaceKind: 'desktop-tauri',
        sourcePeerEnvelope: actorPeer
      },
      createdAt: '2026-06-01T10:00:00Z',
      expiresAt: '2026-06-01T10:20:00Z',
      payload: proposalPayload
    };
    var handoff = {
      schema: kind === 'archive'
        ? 'h2o.desktop.sync.snapshot-native-archive-handoff-preview.v1'
        : 'h2o.desktop.sync.snapshot-restore-handoff-preview.v1',
      ok: true,
      handoffReady: true,
      operation: proposalOperation,
      subjectId: subjectId,
      lineageId: lineageId,
      dedupeKey: proposalDedupe,
      owner: {
        ownerKind: 'native',
        platformId: 'desktop-studio',
        surfaceKind: 'desktop-tauri',
        authorityLevel: 'audited-apply-authority'
      },
      handoffRequest: {
        previewSchema: kind === 'archive'
          ? 'h2o.desktop.sync.snapshot-native-archive-handoff-request.v1'
          : 'h2o.desktop.sync.snapshot-restore-handoff-request.v1',
        previewOnly: true,
        operation: proposalOperation,
        subjectId: subjectId,
        lineageId: lineageId,
        dedupeKey: proposalDedupe,
        command: defaultNativeCommand(kind),
        requestedByPeer: actorPeer
      }
    };
    var receiptPayload = {
      auditMaintenanceId: await sha256Hex('snapshot-execute-proof:audit:' + kind),
      operationId: await sha256Hex('snapshot-execute-proof:operation-id:' + kind),
      transactionId: await sha256Hex('snapshot-execute-proof:transaction-id:' + kind),
      subjectId: subjectId,
      lineageId: lineageId,
      operation: applyOperation,
      proposalOperation: proposalOperation,
      operationIntent: OPERATION_INTENT,
      preStateHash: baseHash,
      postStateHash: targetHash,
      preState: { hash: baseHash, lifecycleState: fromState },
      postState: { hash: targetHash, lifecycleState: targetState },
      lifecycleTransition: { fromState: fromState, toState: targetState },
      actorPeer: actorPeer,
      appliedAtIso: '2026-06-01T10:01:00Z',
      predicateVersion: proposalPayload.predicateVersion,
      proposalEventDigest: proposal.eventDigest,
      proposalDedupeKey: proposal.dedupeKey,
      justifyingEvidenceDigests: [evidenceDigest],
      result: 'applied',
      receiptOnly: true
    };
    if (kind === 'archive') receiptPayload.archived = true;
    if (kind === 'restore') receiptPayload.restored = true;
    var applyEvent = {
      schema: ENVELOPE_SCHEMA,
      kind: APPLY_EVENT_KIND,
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      lineageId: lineageId,
      dedupeKey: receiptDedupe,
      eventDigest: await sha256Hex('snapshot-execute-proof:receipt-event:' + kind),
      payloadHash: await sha256Hex(receiptPayload),
      operation: applyOperation,
      operationIntent: OPERATION_INTENT,
      redactionClass: 'redacted',
      dryRun: false,
      transactional: true,
      createdAt: '2026-06-01T10:01:00Z',
      payload: receiptPayload
    };
    return {
      proposalCandidate: {
        proposalCandidate: proposal,
        candidateRow: {
          status: 'generated',
          eventDigest: proposal.eventDigest,
          dedupeKey: proposal.dedupeKey
        }
      },
      handoffPreview: handoff,
      applyEventReceipt: {
        schema: 'h2o.desktop.sync.snapshot-' + kind + '-apply-event-receipt.v1',
        ok: true,
        applyEvent: applyEvent,
        auditMetadata: {
          schema: 'h2o.desktop.sync.snapshot-audit-metadata.v1',
          auditMaintenanceId: receiptPayload.auditMaintenanceId,
          operation: applyOperation,
          subjectId: subjectId,
          lineageId: lineageId,
          eventDigest: applyEvent.eventDigest,
          dedupeKey: applyEvent.dedupeKey,
          createdAtIso: applyEvent.createdAt
        },
        auditRecord: {
          schema: 'h2o.desktop.sync.kernel.audit-record.v1',
          operation: applyOperation,
          subjectId: subjectId,
          lineageId: lineageId,
          eventDigest: applyEvent.eventDigest,
          preStateHash: baseHash,
          postStateHash: targetHash,
          auditResult: 'success',
          auditAtIso: receiptPayload.appliedAtIso
        },
        lifecycleState: {
          schema: 'h2o.desktop.sync.kernel.lifecycle-state.v1',
          subjectType: SUBJECT_TYPE,
          subjectId: subjectId,
          lifecycleState: targetState,
          lifecycleAtIso: receiptPayload.appliedAtIso
        },
        lifecycleTransition: {
          schema: 'h2o.desktop.sync.kernel.lifecycle-transition.v1',
          subjectType: SUBJECT_TYPE,
          subjectId: subjectId,
          fromState: fromState,
          toState: targetState,
          eventDigest: applyEvent.eventDigest
        },
        proposedConsumedOperation: {
          schema: 'h2o.desktop.sync.snapshot-' + kind + '-consumed-operation-preview.v1',
          consumedId: receiptPayload.operationId,
          eventDigest: applyEvent.eventDigest,
          dedupeKey: applyEvent.dedupeKey,
          lineageId: lineageId,
          subjectId: subjectId,
          envelopeKind: APPLY_EVENT_KIND,
          operationKind: 'snapshot.' + kind + '.applyEvent',
          consumedStatus: 'consumed',
          consumedAtIso: receiptPayload.appliedAtIso
        },
        proposedWatermarkTarget: {
          schema: 'h2o.desktop.sync.snapshot-' + kind + '-watermark-target-preview.v1',
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
  }

  async function runSnapshotExecuteAdapterProof() {
    var blockers = [];
    var warnings = [];
    var registered = registerSnapshotExecuteAdapter({ replaceExisting: true });
    if (!registered.ok) codeList(registered.blockers).forEach(function (code) { addCode(blockers, code); });
    var archive = await buildSnapshotExecuteEnvelope(await proofFixture('archive'));
    if (!archive.ok || safeObject(archive.envelope).operationKind !== 'archive') addCode(blockers, 'proof-archive-envelope-invalid');
    var restore = await buildSnapshotExecuteEnvelope(await proofFixture('restore'));
    if (!restore.ok || safeObject(restore.envelope).operationKind !== 'restore') addCode(blockers, 'proof-restore-envelope-invalid');
    var tombstone = await buildSnapshotExecuteEnvelope(await proofFixture('tombstone'));
    if (tombstone.ok) addCode(blockers, 'proof-tombstone-receipt-accepted');
    var invalidInput = await proofFixture('archive');
    invalidInput.applyEventReceipt.ok = false;
    var invalid = await buildSnapshotExecuteEnvelope(invalidInput);
    if (invalid.ok) addCode(blockers, 'proof-invalid-receipt-accepted');
    var wrongDomainInput = await proofFixture('archive');
    wrongDomainInput.applyEventReceipt.applyEvent.subjectType = 'chat.metadata';
    var wrongDomain = await buildSnapshotExecuteEnvelope(wrongDomainInput);
    if (wrongDomain.ok) addCode(blockers, 'proof-wrong-domain-accepted');
    var rawLeakInput = await proofFixture('restore');
    rawLeakInput.applyEventReceipt.applyEvent.payload.snapshotId = 'raw-snapshot-id';
    var rawLeak = await buildSnapshotExecuteEnvelope(rawLeakInput);
    if (rawLeak.ok) addCode(blockers, 'proof-raw-leak-accepted');
    var listed = typeof H2O.Desktop.Sync.listExecuteAdapters === 'function' ? H2O.Desktop.Sync.listExecuteAdapters() : null;
    var got = typeof H2O.Desktop.Sync.getExecuteAdapter === 'function' ? H2O.Desktop.Sync.getExecuteAdapter('snapshot') : null;
    var listedHasSnapshot = asArray(listed && listed.adapters).some(function (adapter) {
      return safeObject(adapter).domainId === 'snapshot' && safeObject(adapter).adapterId === ADAPTER_ID;
    });
    if (!listed || listed.ok !== true || !listedHasSnapshot || !got || got.ok !== true || safeObject(got.adapter).adapterId !== ADAPTER_ID) {
      addCode(blockers, 'proof-adapter-registry-failed');
    }
    if (!allSideEffectsFalse(archive.sideEffectSummary) ||
        !allSideEffectsFalse(restore.sideEffectSummary) ||
        !allSideEffectsFalse(tombstone.sideEffectSummary) ||
        !allSideEffectsFalse(invalid.sideEffectSummary)) {
      addCode(blockers, 'proof-side-effects-not-false');
    }
    return buildResult({
      ok: blockers.length === 0,
      envelope: archive.envelope,
      adapter: got && got.adapter,
      adapters: listed && listed.adapters,
      blockers: blockers,
      warnings: warnings,
      metadata: {
        proof: 'snapshot-execute-adapter',
        archiveEnvelopeValid: archive.ok === true,
        restoreEnvelopeValid: restore.ok === true,
        tombstoneReceiptBlocked: tombstone.ok !== true,
        invalidReceiptBlocked: invalid.ok !== true,
        wrongDomainBlocked: wrongDomain.ok !== true,
        rawLeakBlocked: rawLeak.ok !== true,
        adapterRegistryWorks: listedHasSnapshot && got && got.ok === true,
        sideEffectsFalse: allSideEffectsFalse(archive.sideEffectSummary) &&
          allSideEffectsFalse(restore.sideEffectSummary) &&
          allSideEffectsFalse(tombstone.sideEffectSummary) &&
          allSideEffectsFalse(invalid.sideEffectSummary)
      }
    });
  }

  H2O.Desktop.Sync.registerSnapshotExecuteAdapter = registerSnapshotExecuteAdapter;
  H2O.Desktop.Sync.buildSnapshotExecuteEnvelope = buildSnapshotExecuteEnvelope;
  H2O.Desktop.Sync.runSnapshotExecuteAdapterProof = runSnapshotExecuteAdapterProof;
  H2O.Desktop.Sync.__snapshotExecuteAdapterInstalled = true;
  H2O.Desktop.Sync.__snapshotExecuteAdapterVersion = VERSION;
  if (typeof H2O.Desktop.Sync.registerExecuteAdapter === 'function') {
    try { registerSnapshotExecuteAdapter({ replaceExisting: true }); } catch (_) { /* proof covers registration */ }
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
