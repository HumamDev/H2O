/* H2O Desktop Sync - F14.6.10 chat execute adapter
 *
 * Chat domain adapter for Execute Lane proposal-receipt envelopes.
 *
 * Safety invariants:
 *   - Adapter registration and envelope shaping only.
 *   - No broker, dispatch, publication, relay/outbox, Native execution, F5
 *     execution, settlement, Chat mutation, watermark write, consumed-op
 *     write, timer, or polling behavior.
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
  if (H2O.Desktop.Sync.__chatExecuteAdapterInstalled) return;

  var VERSION = '0.1.0-f14.6.10';
  var RESULT_SCHEMA = 'h2o.desktop.sync.chat-execute-adapter-result.v1';
  var ADAPTER_ID = 'chat-execute-adapter';
  var SUBJECT_TYPE = 'chat.metadata';
  var PROPOSAL_KIND = 'proposal';
  var APPLY_EVENT_KIND = 'applyEvent';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var OP_ARCHIVE_PROPOSED = 'chat-metadata-archive-proposed';
  var OP_RENAME_PROPOSED = 'chat-metadata-rename-proposed';
  var OP_ARCHIVE_APPLIED = 'chat-metadata-archive-applied';
  var OP_RENAME_APPLIED = 'chat-metadata-rename-applied';
  var OPERATION_INTENT = 'update';
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'message', 'message_array',
    'turns', 'conversation', 'attachments', 'files', 'file_ids',
    'image_urls', 'audio_urls', 'rawId', 'chatId', 'accountId',
    'rawAccountId', 'title', 'name', 'chatTitle', 'rawTitle',
    'proposedTitle', 'path', 'url', 'href', 'share_url', 'share_token',
    'password', 'apiKey', 'accessToken', 'refreshToken', 'session_token',
    'cookies', 'token'
  ];

  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function safeObject(value) { return isObject(value) ? value : {}; }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function cleanString(value) { return String(value == null ? '' : value).trim(); }
  function cleanLower(value) { return cleanString(value).toLowerCase(); }
  function nowIsoSeconds() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
  function isIso(value) {
    var text = cleanString(value);
    return !!text && Number.isFinite(Date.parse(text));
  }
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
      applyExecuted: false,
      chatMutated: false,
      watermarkWritten: false,
      consumedOperationWritten: false,
      bookkeepingWritten: false,
      executeJournalTouched: false,
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
          metadata: { domain: 'chat', version: VERSION }
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
    var domainScanned = false;
    if (kernel && typeof kernel.scanDomainForbiddenFields === 'function') {
      try {
        var domainScan = kernel.scanDomainForbiddenFields(SUBJECT_TYPE, value);
        domainScanned = true;
        codeList(domainScan && domainScan.blockers).forEach(function (code) { addCode(blockers, code); });
        codeList(domainScan && domainScan.warnings).forEach(function (code) { addCode(warnings, code); });
      } catch (_) { addCode(warnings, 'chat-execute-domain-forbidden-field-scan-threw'); }
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
      } catch (_) { addCode(warnings, 'chat-execute-privacy-scan-threw'); }
    }
    if (!domainScanned && typeof H2O.Desktop.Sync.runChatForbiddenFieldScan === 'function') {
      try {
        var chatScan = H2O.Desktop.Sync.runChatForbiddenFieldScan(value);
        codeList(chatScan && chatScan.blockers).forEach(function (code) { addCode(blockers, code); });
        codeList(chatScan && chatScan.warnings).forEach(function (code) { addCode(warnings, code); });
      } catch (_) { addCode(warnings, 'chat-execute-chat-forbidden-field-scan-threw'); }
    }
    var forbidden = foreverNoKey(value);
    if (forbidden) {
      addCode(blockers, 'chat-execute-output-contains-forbidden-field');
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
    if (isObject(source.candidate)) return proposalEnvelope(source.candidate);
    if (isObject(source.proposal)) return proposalEnvelope(source.proposal);
    if (isObject(source.envelope)) return source.envelope;
    if (cleanString(source.serializedEnvelope)) return parseJsonObject(source.serializedEnvelope);
    if (source.kind === PROPOSAL_KIND || source.schema === ENVELOPE_SCHEMA) return source;
    return null;
  }
  function handoffPreview(input) {
    var source = safeObject(input);
    if (isObject(source.handoffPreview)) return source.handoffPreview;
    if (isObject(source.nativeHandoffPreview)) return source.nativeHandoffPreview;
    if (isObject(source.preview)) return source.preview;
    if (source.schema === 'h2o.desktop.sync.chat-native-handoff-preview.v1' || source.handoffReady === true) return source;
    return null;
  }
  function receiptWrapper(input) {
    var source = safeObject(input);
    if (isObject(source.applyEventReceipt)) return source.applyEventReceipt;
    if (isObject(source.receipt)) return source.receipt;
    if (isObject(source.chatApplyEventReceipt)) return source.chatApplyEventReceipt;
    if (isObject(source.applyEvent)) return source;
    if (source.kind === APPLY_EVENT_KIND) return { ok: true, applyEvent: source };
    return null;
  }
  function operationKindForProposal(operation) {
    if (operation === OP_ARCHIVE_PROPOSED) return 'archive';
    if (operation === OP_RENAME_PROPOSED) return 'rename';
    return '';
  }
  function operationKindForApply(operation) {
    if (operation === OP_ARCHIVE_APPLIED) return 'archive';
    if (operation === OP_RENAME_APPLIED) return 'rename';
    return '';
  }
  function appliedOperationFor(kind) {
    if (kind === 'archive') return OP_ARCHIVE_APPLIED;
    if (kind === 'rename') return OP_RENAME_APPLIED;
    return '';
  }
  function defaultNativeCommand(kind) {
    if (kind === 'archive') return 'chat.metadata.archive';
    if (kind === 'rename') return 'chat.metadata.rename';
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

  function validateProposal(proposal, blockers) {
    var p = safeObject(proposal);
    var payload = safeObject(p.payload);
    var proposed = safeObject(payload.proposedOperation);
    var kind = operationKindForProposal(p.operation);
    if (!isObject(proposal)) addCode(blockers, 'chat-execute-proposal-candidate-required');
    if (p.schema !== ENVELOPE_SCHEMA) addCode(blockers, 'chat-execute-proposal-schema-invalid');
    if (p.kind !== PROPOSAL_KIND) addCode(blockers, 'chat-execute-proposal-kind-invalid');
    if (p.subjectType !== SUBJECT_TYPE) addCode(blockers, 'chat-execute-proposal-domain-invalid');
    if (p.operationIntent !== OPERATION_INTENT) addCode(blockers, 'chat-execute-proposal-intent-invalid');
    if (!kind) addCode(blockers, 'chat-execute-proposal-operation-unsupported');
    if (!isSha256Hex(p.subjectId)) addCode(blockers, 'chat-execute-proposal-subjectId-invalid');
    if (!isSha256Hex(p.lineageId)) addCode(blockers, 'chat-execute-proposal-lineageId-invalid');
    if (!isSha256Hex(p.dedupeKey)) addCode(blockers, 'chat-execute-proposal-dedupeKey-invalid');
    if (!isSha256Hex(p.eventDigest)) addCode(blockers, 'chat-execute-proposal-eventDigest-invalid');
    if (!isObject(payload)) addCode(blockers, 'chat-execute-proposal-payload-required');
    if (!isObject(proposed)) addCode(blockers, 'chat-execute-proposal-operation-required');
    if (proposed.operation && proposed.operation !== p.operation) addCode(blockers, 'chat-execute-proposal-operation-mismatch');
    if (proposed.subjectId && cleanLower(proposed.subjectId) !== cleanLower(p.subjectId)) {
      addCode(blockers, 'chat-execute-proposal-subjectId-mismatch');
    }
    if (!isSha256Hex(proposed.baseHash)) addCode(blockers, 'chat-execute-proposal-baseHash-invalid');
    if (!isSha256Hex(proposed.targetHash)) addCode(blockers, 'chat-execute-proposal-targetHash-invalid');
    if (kind === 'archive' && typeof proposed.archived !== 'boolean') addCode(blockers, 'chat-execute-proposal-archive-target-invalid');
    if (kind === 'rename' && !isSha256Hex(proposed.titleHash)) addCode(blockers, 'chat-execute-proposal-titleHash-invalid');
    return {
      operationKind: kind,
      baseHash: cleanLower(proposed.baseHash),
      targetHash: cleanLower(proposed.targetHash),
      archived: proposed.archived === true,
      titleHash: cleanLower(proposed.titleHash),
      predicateVersion: cleanString(payload.predicateVersion),
      justifyingEvidenceDigests: asArray(payload.justifyingEvidenceDigests).map(cleanLower).filter(isSha256Hex)
    };
  }
  function validateHandoff(handoff, proposal, proposalSummary, blockers) {
    var h = safeObject(handoff);
    var request = safeObject(h.handoffRequest);
    if (!isObject(handoff)) {
      addCode(blockers, 'chat-execute-handoff-preview-required');
      return;
    }
    if (h.ok !== true || h.handoffReady !== true) addCode(blockers, 'chat-execute-handoff-not-ready');
    if (cleanString(h.operation) && cleanString(h.operation) !== cleanString(proposal.operation)) {
      addCode(blockers, 'chat-execute-handoff-operation-mismatch');
    }
    if (cleanString(h.subjectId) && cleanLower(h.subjectId) !== cleanLower(proposal.subjectId)) {
      addCode(blockers, 'chat-execute-handoff-subjectId-mismatch');
    }
    if (cleanString(h.lineageId) && cleanLower(h.lineageId) !== cleanLower(proposal.lineageId)) {
      addCode(blockers, 'chat-execute-handoff-lineageId-mismatch');
    }
    if (cleanString(h.dedupeKey) && cleanLower(h.dedupeKey) !== cleanLower(proposal.dedupeKey)) {
      addCode(blockers, 'chat-execute-handoff-dedupeKey-mismatch');
    }
    if (request.operation && cleanString(request.operation) !== cleanString(proposal.operation)) {
      addCode(blockers, 'chat-execute-handoff-request-operation-mismatch');
    }
    if (!cleanString(request.operation) && !cleanString(h.operation)) {
      addCode(blockers, 'chat-execute-handoff-operation-required');
    }
    if (!nativeCommandFrom(handoff, proposalSummary.operationKind, {})) {
      addCode(blockers, 'chat-execute-nativeCommand-required');
    }
  }
  function validateReceipt(receipt, proposal, proposalSummary, blockers) {
    var r = safeObject(receipt);
    var event = safeObject(r.applyEvent);
    var payload = safeObject(event.payload);
    var kind = operationKindForApply(event.operation);
    if (!isObject(receipt)) {
      addCode(blockers, 'chat-execute-applyEvent-receipt-required');
      return null;
    }
    if (r.ok !== true) addCode(blockers, 'chat-execute-applyEvent-receipt-not-ok');
    if (!isObject(r.applyEvent)) addCode(blockers, 'chat-execute-applyEvent-required');
    if (event.schema !== ENVELOPE_SCHEMA) addCode(blockers, 'chat-execute-applyEvent-schema-invalid');
    if (event.kind !== APPLY_EVENT_KIND) addCode(blockers, 'chat-execute-applyEvent-kind-invalid');
    if (event.subjectType !== SUBJECT_TYPE) addCode(blockers, 'chat-execute-applyEvent-domain-invalid');
    if (event.operationIntent !== OPERATION_INTENT) addCode(blockers, 'chat-execute-applyEvent-intent-invalid');
    if (event.dryRun !== false) addCode(blockers, 'chat-execute-applyEvent-dryRun-invalid');
    if (event.transactional !== true) addCode(blockers, 'chat-execute-applyEvent-transactional-required');
    if (!kind) addCode(blockers, 'chat-execute-applyEvent-operation-unsupported');
    if (kind && kind !== proposalSummary.operationKind) addCode(blockers, 'chat-execute-applyEvent-operation-mismatch');
    if (!isSha256Hex(event.subjectId)) addCode(blockers, 'chat-execute-applyEvent-subjectId-invalid');
    if (!isSha256Hex(event.lineageId)) addCode(blockers, 'chat-execute-applyEvent-lineageId-invalid');
    if (!isSha256Hex(event.dedupeKey)) addCode(blockers, 'chat-execute-applyEvent-dedupeKey-invalid');
    if (!isSha256Hex(event.eventDigest)) addCode(blockers, 'chat-execute-applyEvent-eventDigest-invalid');
    if (cleanLower(event.subjectId) !== cleanLower(proposal.subjectId)) addCode(blockers, 'chat-execute-receipt-subjectId-mismatch');
    if (cleanLower(event.lineageId) !== cleanLower(proposal.lineageId)) addCode(blockers, 'chat-execute-receipt-lineageId-mismatch');
    if (cleanString(payload.proposalOperation) && payload.proposalOperation !== cleanString(proposal.operation)) {
      addCode(blockers, 'chat-execute-receipt-proposalOperation-mismatch');
    }
    if (cleanString(payload.proposalEventDigest) && cleanLower(payload.proposalEventDigest) !== cleanLower(proposal.eventDigest)) {
      addCode(blockers, 'chat-execute-receipt-proposalEventDigest-mismatch');
    }
    if (cleanString(payload.proposalDedupeKey) && cleanLower(payload.proposalDedupeKey) !== cleanLower(proposal.dedupeKey)) {
      addCode(blockers, 'chat-execute-receipt-proposalDedupeKey-mismatch');
    }
    if (cleanString(payload.preStateHash) && cleanLower(payload.preStateHash) !== proposalSummary.baseHash) {
      addCode(blockers, 'chat-execute-receipt-baseHash-mismatch');
    }
    if (cleanString(payload.postStateHash) && cleanLower(payload.postStateHash) !== proposalSummary.targetHash) {
      addCode(blockers, 'chat-execute-receipt-targetHash-mismatch');
    }
    if (proposalSummary.operationKind === 'rename' && cleanString(payload.titleHash) &&
        cleanLower(payload.titleHash) !== proposalSummary.titleHash) {
      addCode(blockers, 'chat-execute-receipt-titleHash-mismatch');
    }
    return {
      applyEvent: event,
      payload: payload,
      operationKind: kind,
      appliedOperation: appliedOperationFor(kind)
    };
  }

  function validateParts(parts, blockers, warnings) {
    scanPrivacy(parts, blockers, warnings);
    var proposalSummary = validateProposal(parts.proposal, blockers);
    validateHandoff(parts.handoff, safeObject(parts.proposal), proposalSummary, blockers);
    var receiptSummary = validateReceipt(parts.receipt, safeObject(parts.proposal), proposalSummary, blockers);
    return { proposal: proposalSummary, receipt: receiptSummary };
  }
  async function shapeNativeRequest(parts, summaries, nativeCommand) {
    var proposal = safeObject(parts.proposal);
    var handoff = safeObject(parts.handoff);
    var request = safeObject(handoff.handoffRequest);
    var event = safeObject(safeObject(parts.receipt).applyEvent);
    var nativeRequest = {
      schema: 'h2o.desktop.sync.chat-execute-native-request.v1',
      command: nativeCommand,
      idempotent: true,
      operationKind: summaries.proposal.operationKind,
      proposalOperation: cleanString(proposal.operation),
      applyOperation: cleanString(event.operation),
      subjectId: cleanLower(event.subjectId),
      lineageId: cleanLower(event.lineageId),
      dedupeKey: cleanLower(event.dedupeKey),
      proposalEventDigest: cleanLower(proposal.eventDigest),
      receiptEventDigest: cleanLower(event.eventDigest),
      baseHash: summaries.proposal.baseHash,
      targetHash: summaries.proposal.targetHash,
      predicateVersion: summaries.proposal.predicateVersion,
      handoffDigest: await sha256Hex(request)
    };
    if (summaries.proposal.operationKind === 'archive') nativeRequest.archived = summaries.proposal.archived === true;
    if (summaries.proposal.operationKind === 'rename') nativeRequest.titleHash = summaries.proposal.titleHash;
    return nativeRequest;
  }
  async function settlementShapes(parts, summaries) {
    var receipt = safeObject(parts.receipt);
    var event = safeObject(receipt.applyEvent);
    var payload = safeObject(event.payload);
    var publicationId = await sha256Hex({
      schema: 'h2o.desktop.sync.chat-execute-publication-row.v1',
      dedupeKey: cleanLower(event.dedupeKey),
      eventDigest: cleanLower(event.eventDigest)
    });
    return {
      consumedOperationRow: safeObject(receipt.consumedOperationPreview || {
        schema: 'h2o.desktop.sync.kernel.consumed-operation.v1',
        consumedId: cleanString(payload.operationId),
        eventDigest: cleanLower(event.eventDigest),
        dedupeKey: cleanLower(event.dedupeKey),
        lineageId: cleanLower(event.lineageId),
        subjectId: cleanLower(event.subjectId),
        envelopeKind: APPLY_EVENT_KIND,
        operationKind: cleanString(event.operation),
        consumedStatus: 'consumed',
        consumedAtIso: cleanString(payload.appliedAtIso || event.createdAt)
      }),
      watermarkAdvance: safeObject(receipt.watermarkPreview || {
        schema: 'h2o.desktop.sync.kernel.watermark.v1',
        peerId: cleanLower(safeObject(payload.actorPeer).syncPeerIdHash),
        subjectId: cleanLower(event.subjectId),
        lineageId: cleanLower(event.lineageId),
        revisionHash: summaries.proposal.targetHash,
        watermarkAtIso: cleanString(payload.appliedAtIso || event.createdAt),
        dedupeKey: cleanLower(event.dedupeKey)
      }),
      bookkeepingRow: {
        schema: 'h2o.desktop.sync.chat-execute-bookkeeping-row.v1',
        domainId: 'chat',
        operationKind: summaries.proposal.operationKind,
        subjectId: cleanLower(event.subjectId),
        lineageId: cleanLower(event.lineageId),
        dedupeKey: cleanLower(event.dedupeKey),
        eventDigest: cleanLower(event.eventDigest),
        proposalEventDigest: cleanLower(parts.proposal.eventDigest),
        receiptEventDigest: cleanLower(event.eventDigest),
        targetHash: summaries.proposal.targetHash,
        predicateVersion: summaries.proposal.predicateVersion
      },
      publicationRow: {
        schema: 'h2o.desktop.sync.chat-execute-publication-row.v1',
        publicationId: publicationId,
        status: 'generated',
        domainId: 'chat',
        operationKind: summaries.proposal.operationKind,
        dedupeKey: cleanLower(event.dedupeKey),
        eventDigest: cleanLower(event.eventDigest)
      }
    };
  }

  function chatAdapterMetadata(replaceExisting) {
    return {
      adapterId: ADAPTER_ID,
      domainId: 'chat',
      version: VERSION,
      envelopeKinds: ['proposal-receipt'],
      operationKinds: ['archive', 'rename'],
      dispatchTargets: ['native'],
      replaceExisting: replaceExisting === true
    };
  }
  function registerChatExecuteAdapter(options) {
    var opts = safeObject(options);
    if (typeof H2O.Desktop.Sync.registerExecuteAdapter !== 'function') {
      return failure(['execute-adapter-registry-unavailable'], [], { adapterId: ADAPTER_ID });
    }
    var registered = H2O.Desktop.Sync.registerExecuteAdapter(chatAdapterMetadata(opts.replaceExisting === true));
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

  async function buildChatExecuteEnvelope(input, options) {
    var args = safeObject(input);
    var opts = safeObject(options);
    var blockers = [];
    var warnings = [];
    if (!isObject(input)) addCode(blockers, 'chat-execute-input-required');
    if (typeof H2O.Desktop.Sync.shapeExecuteEnvelope !== 'function' ||
        typeof H2O.Desktop.Sync.validateExecuteEnvelope !== 'function') {
      addCode(blockers, 'execute-envelope-contract-unavailable');
    }
    var parts = {
      proposal: proposalEnvelope(args.proposalCandidate || args.proposal || args.candidate || args),
      handoff: handoffPreview(args.handoffPreview || args.nativeHandoffPreview || args),
      receipt: receiptWrapper(args.applyEventReceipt || args.receipt || args)
    };
    var summaries = validateParts(parts, blockers, warnings);
    if (blockers.length) return failure(blockers, warnings, { stage: 'validation' });

    var event = safeObject(safeObject(parts.receipt).applyEvent);
    var requiresRelay = safeObject(opts.publicationPolicy).requiresRelay === true ||
      safeObject(args.publicationPolicy).requiresRelay === true ||
      safeObject(safeObject(parts.handoff).publicationPolicy).requiresRelay === true;
    var nativeCommand = nativeCommandFrom(parts.handoff, summaries.proposal.operationKind, opts);
    var nativeRequest = await shapeNativeRequest(parts, summaries, nativeCommand);
    var payloadShapes = {
      proposalReceipt: {
        schema: 'h2o.desktop.sync.chat-execute-proposal-receipt.v1',
        domainId: 'chat',
        operationKind: summaries.proposal.operationKind,
        proposalOperation: cleanString(parts.proposal.operation),
        applyOperation: cleanString(event.operation),
        proposalEventDigest: cleanLower(parts.proposal.eventDigest),
        receiptEventDigest: cleanLower(event.eventDigest),
        proposalDedupeKey: cleanLower(parts.proposal.dedupeKey),
        receiptDedupeKey: cleanLower(event.dedupeKey),
        nativeRequest: nativeRequest,
        justifyingEvidenceDigests: summaries.proposal.justifyingEvidenceDigests.slice()
      }
    };
    var settlement = await settlementShapes(parts, summaries);
    var envelope = await H2O.Desktop.Sync.shapeExecuteEnvelope({
      envelopeKind: 'proposal-receipt',
      domainId: 'chat',
      operationKind: summaries.proposal.operationKind,
      subjectId: cleanLower(event.subjectId),
      lineageId: cleanLower(event.lineageId),
      dedupeKey: cleanLower(event.dedupeKey),
      eventDigest: cleanLower(event.eventDigest),
      dispatchProfile: {
        requiresF5: false,
        requiresNative: true,
        requiresRelay: requiresRelay,
        nativeCommand: nativeCommand,
        nativeIdempotent: true,
        f5QueueKey: '',
        retryPolicy: safeObject(opts.retryPolicy || { maxAttempts: 0, minDelayMs: 0, maxDelayMs: 0, backoffKind: 'none' })
      },
      payloadShapes: payloadShapes,
      settlementShapes: settlement,
      createdAtIso: cleanString(opts.createdAtIso || event.createdAt || nowIsoSeconds())
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
        domainId: 'chat',
        operationKind: summaries.proposal.operationKind,
        adapterId: ADAPTER_ID
      }
    });
  }

  async function proofFixture(kind) {
    var subjectId = await sha256Hex('chat-execute-proof:subject:' + kind);
    var lineageId = await sha256Hex('chat-execute-proof:lineage:' + kind);
    var proposalDedupe = await sha256Hex('chat-execute-proof:proposal-dedupe:' + kind);
    var receiptDedupe = await sha256Hex('chat-execute-proof:receipt-dedupe:' + kind);
    var baseHash = await sha256Hex('chat-execute-proof:base:' + kind);
    var targetHash = await sha256Hex('chat-execute-proof:target:' + kind);
    var titleHash = await sha256Hex('chat-execute-proof:title:' + kind);
    var evidenceDigest = await sha256Hex('chat-execute-proof:evidence:' + kind);
    var proposalOperation = kind === 'archive' ? OP_ARCHIVE_PROPOSED : OP_RENAME_PROPOSED;
    var applyOperation = kind === 'archive' ? OP_ARCHIVE_APPLIED : OP_RENAME_APPLIED;
    var proposedOperation = {
      operation: proposalOperation,
      operationIntent: OPERATION_INTENT,
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      baseHash: baseHash,
      targetHash: targetHash
    };
    var expectedPostState = {
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      expectedPostStateHash: targetHash
    };
    if (kind === 'archive') {
      proposedOperation.archived = true;
      expectedPostState.archived = true;
    } else {
      proposedOperation.titleHash = titleHash;
      expectedPostState.titleHash = titleHash;
    }
    var proposalPayload = {
      proposedOperation: proposedOperation,
      expectedPostState: expectedPostState,
      predicateVersion: kind === 'archive' ? 'h2o.chat.archive.predicate.v1' : 'h2o.chat.rename.predicate.v1',
      justifyingEvidenceDigests: [evidenceDigest]
    };
    var proposal = {
      schema: ENVELOPE_SCHEMA,
      kind: PROPOSAL_KIND,
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      lineageId: lineageId,
      dedupeKey: proposalDedupe,
      eventDigest: await sha256Hex('chat-execute-proof:proposal-event:' + kind),
      payloadHash: await sha256Hex(proposalPayload),
      operation: proposalOperation,
      operationIntent: OPERATION_INTENT,
      redactionClass: 'redacted',
      sourcePlatform: {
        platformId: 'desktop-studio',
        surfaceKind: 'desktop-tauri',
        sourcePeerEnvelope: {
          physicalDeviceIdHash: await sha256Hex('chat-execute-proof:device:' + kind),
          installIdHash: await sha256Hex('chat-execute-proof:install:' + kind),
          syncPeerIdHash: await sha256Hex('chat-execute-proof:peer:' + kind)
        }
      },
      createdAt: '2026-06-01T10:00:00Z',
      expiresAt: '2026-06-01T10:20:00Z',
      payload: proposalPayload
    };
    var handoff = {
      schema: 'h2o.desktop.sync.chat-native-handoff-preview.v1',
      ok: true,
      handoffReady: true,
      operation: proposalOperation,
      subjectId: subjectId,
      lineageId: lineageId,
      dedupeKey: proposalDedupe,
      handoffRequest: {
        previewSchema: 'h2o.desktop.sync.chat-native-owner-handoff-request.v1',
        operation: proposalOperation,
        subjectId: subjectId,
        lineageId: lineageId,
        dedupeKey: proposalDedupe,
        command: defaultNativeCommand(kind),
        requestDigest: await sha256Hex('chat-execute-proof:handoff:' + kind)
      }
    };
    var actorPeer = proposal.sourcePlatform.sourcePeerEnvelope;
    var receiptPayload = {
      operationId: await sha256Hex('chat-execute-proof:operation-id:' + kind),
      transactionId: await sha256Hex('chat-execute-proof:transaction-id:' + kind),
      proposalOperation: proposalOperation,
      proposalEventDigest: proposal.eventDigest,
      proposalDedupeKey: proposal.dedupeKey,
      preStateHash: baseHash,
      postStateHash: targetHash,
      appliedAtIso: '2026-06-01T10:01:00Z',
      actorPeer: actorPeer
    };
    if (kind === 'archive') receiptPayload.archived = true;
    else receiptPayload.titleHash = titleHash;
    var applyEvent = {
      schema: ENVELOPE_SCHEMA,
      kind: APPLY_EVENT_KIND,
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      lineageId: lineageId,
      dedupeKey: receiptDedupe,
      eventDigest: await sha256Hex('chat-execute-proof:receipt-event:' + kind),
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
      proposalCandidate: { proposalCandidate: proposal, candidateRow: { status: 'generated', eventDigest: proposal.eventDigest, dedupeKey: proposal.dedupeKey } },
      handoffPreview: handoff,
      applyEventReceipt: {
        schema: 'h2o.desktop.sync.chat-apply-event-receipt-build.v1',
        ok: true,
        applyEvent: applyEvent,
        consumedOperationPreview: {
          schema: 'h2o.desktop.sync.kernel.consumed-operation.v1',
          consumedId: receiptPayload.operationId,
          eventDigest: applyEvent.eventDigest,
          dedupeKey: applyEvent.dedupeKey,
          lineageId: lineageId,
          subjectId: subjectId,
          operationKind: applyOperation,
          consumedStatus: 'consumed',
          consumedAtIso: receiptPayload.appliedAtIso
        },
        watermarkPreview: {
          schema: 'h2o.desktop.sync.kernel.watermark.v1',
          peerId: actorPeer.syncPeerIdHash,
          subjectId: subjectId,
          lineageId: lineageId,
          revisionHash: targetHash,
          watermarkAtIso: receiptPayload.appliedAtIso,
          dedupeKey: applyEvent.dedupeKey
        }
      }
    };
  }

  async function runChatExecuteAdapterProof() {
    var blockers = [];
    var warnings = [];
    var registered = registerChatExecuteAdapter({ replaceExisting: true });
    if (!registered.ok) codeList(registered.blockers).forEach(function (code) { addCode(blockers, code); });
    var archive = await buildChatExecuteEnvelope(await proofFixture('archive'));
    if (!archive.ok || safeObject(archive.envelope).operationKind !== 'archive') addCode(blockers, 'proof-archive-envelope-invalid');
    var rename = await buildChatExecuteEnvelope(await proofFixture('rename'));
    if (!rename.ok || safeObject(rename.envelope).operationKind !== 'rename') addCode(blockers, 'proof-rename-envelope-invalid');
    var invalidInput = await proofFixture('archive');
    invalidInput.applyEventReceipt.ok = false;
    var invalid = await buildChatExecuteEnvelope(invalidInput);
    if (invalid.ok) addCode(blockers, 'proof-invalid-receipt-accepted');
    var wrongDomainInput = await proofFixture('archive');
    wrongDomainInput.applyEventReceipt.applyEvent.subjectType = 'snapshot.metadata';
    var wrongDomain = await buildChatExecuteEnvelope(wrongDomainInput);
    if (wrongDomain.ok) addCode(blockers, 'proof-wrong-domain-accepted');
    var rawLeakInput = await proofFixture('rename');
    rawLeakInput.applyEventReceipt.applyEvent.payload.title = 'Leaked raw title';
    var rawLeak = await buildChatExecuteEnvelope(rawLeakInput);
    if (rawLeak.ok) addCode(blockers, 'proof-raw-title-leak-accepted');
    var listed = typeof H2O.Desktop.Sync.listExecuteAdapters === 'function' ? H2O.Desktop.Sync.listExecuteAdapters() : null;
    var got = typeof H2O.Desktop.Sync.getExecuteAdapter === 'function' ? H2O.Desktop.Sync.getExecuteAdapter('chat') : null;
    var listedHasChat = asArray(listed && listed.adapters).some(function (adapter) {
      return safeObject(adapter).domainId === 'chat' && safeObject(adapter).adapterId === ADAPTER_ID;
    });
    if (!listed || listed.ok !== true || !listedHasChat || !got || got.ok !== true || safeObject(got.adapter).adapterId !== ADAPTER_ID) {
      addCode(blockers, 'proof-adapter-registry-failed');
    }
    if (!allSideEffectsFalse(archive.sideEffectSummary) ||
        !allSideEffectsFalse(rename.sideEffectSummary) ||
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
        proof: 'chat-execute-adapter',
        archiveEnvelopeValid: archive.ok === true,
        renameEnvelopeValid: rename.ok === true,
        invalidReceiptBlocked: invalid.ok !== true,
        wrongDomainBlocked: wrongDomain.ok !== true,
        rawTitleLeakBlocked: rawLeak.ok !== true,
        adapterRegistryWorks: listedHasChat && got && got.ok === true,
        sideEffectsFalse: allSideEffectsFalse(archive.sideEffectSummary) &&
          allSideEffectsFalse(rename.sideEffectSummary) &&
          allSideEffectsFalse(invalid.sideEffectSummary)
      }
    });
  }

  H2O.Desktop.Sync.registerChatExecuteAdapter = registerChatExecuteAdapter;
  H2O.Desktop.Sync.buildChatExecuteEnvelope = buildChatExecuteEnvelope;
  H2O.Desktop.Sync.runChatExecuteAdapterProof = runChatExecuteAdapterProof;
  H2O.Desktop.Sync.__chatExecuteAdapterInstalled = true;
  H2O.Desktop.Sync.__chatExecuteAdapterVersion = VERSION;
  if (typeof H2O.Desktop.Sync.registerExecuteAdapter === 'function') {
    try { registerChatExecuteAdapter({ replaceExisting: true }); } catch (_) { /* explicit proof covers registration */ }
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
