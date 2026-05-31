/* H2O Desktop Sync - F14.3.7 chat convergence bookkeeping
 *
 * Append-only bookkeeping for completed chat convergence evidence chains.
 * References proposal candidate -> Native handoff preview -> receipt builder
 * output. This module never publishes, enqueues relay rows, calls Native,
 * applies, advances watermarks, or records consumed operations.
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
  if (H2O.Desktop.Sync.__chatConvergenceBookkeepingInstalled) return;

  var VERSION = '0.1.0-f14.3.7';
  var RESULT_SCHEMA = 'h2o.desktop.sync.chat-convergence-bookkeeping.v1';
  var LEDGER_SCHEMA = 'h2o.desktop.sync.chat-convergence-bookkeeping-ledger.v1';
  var ROW_SCHEMA = 'h2o.desktop.sync.chat-convergence-bookkeeping-row.v1';
  var PROPOSAL_ROW_SCHEMA = 'h2o.desktop.sync.convergence-proposal-candidate-row.v1';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var LEDGER_KEY = 'h2o:sync:chat-convergence-bookkeeping:v1';
  var SUBJECT_TYPE = 'chat.metadata';
  var KIND_PROPOSAL = 'proposal';
  var KIND_RECEIPT = 'apply' + 'Event';
  var OP_ARCHIVE_PROPOSED = 'chat-metadata-archive-proposed';
  var OP_RENAME_PROPOSED = 'chat-metadata-rename-proposed';
  var OP_ARCHIVE_APPLIED = 'chat-metadata-archive-applied';
  var OP_RENAME_APPLIED = 'chat-metadata-rename-applied';
  var OPERATION_INTENT = 'update';
  var STATUS_RECORDED = 'recorded';
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'message_array', 'conversation',
    'attachments', 'files', 'file_ids', 'image_urls', 'audio_urls',
    'name', 'title', 'chatTitle', 'rawTitle', 'proposedTitle',
    'rawId', 'chatId', 'accountId', 'rawAccountId',
    'path', 'url', 'share_url', 'share_token', 'password', 'apiKey',
    'session_token', 'cookies', 'token'
  ];

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function safeObject(value) {
    return isObject(value) ? value : {};
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function cleanLower(value) {
    return cleanString(value).toLowerCase();
  }

  function nowIsoSeconds() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  function addCode(list, code) {
    var normalized = cleanString(code);
    if (!normalized || list.indexOf(normalized) !== -1) return;
    list.push(normalized);
  }

  function codeList(value) {
    return asArray(value).map(function (item) {
      return isObject(item) ? cleanString(item.code) : cleanString(item);
    }).filter(Boolean).filter(function (code, index, arr) {
      return arr.indexOf(code) === index;
    });
  }

  function isSha256Hex(value) {
    return /^[0-9a-f]{64}$/.test(cleanLower(value));
  }

  function isIso(value) {
    var text = cleanString(value);
    return !!text && Number.isFinite(Date.parse(text));
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

  function generateUuid() {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
    } catch (_) { /* fall through */ }
    var bytes = new Uint8Array(16);
    if (global.crypto && typeof global.crypto.getRandomValues === 'function') {
      global.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var h = bytesToHex(bytes);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' +
      h.slice(16, 20) + '-' + h.slice(20, 32);
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

  function normalizeLedger(raw) {
    if (!raw) return { schema: LEDGER_SCHEMA, createdAtIso: nowIsoSeconds(), rows: [] };
    if (!isObject(raw) || raw.schema !== LEDGER_SCHEMA || !Array.isArray(raw.rows)) return null;
    return {
      schema: LEDGER_SCHEMA,
      createdAtIso: cleanString(raw.createdAtIso) || nowIsoSeconds(),
      updatedAtIso: cleanString(raw.updatedAtIso),
      rows: raw.rows.slice()
    };
  }

  function parseJsonObject(value) {
    if (isObject(value)) return value;
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      var parsed = JSON.parse(value);
      return isObject(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function proposalEnvelope(input) {
    var source = safeObject(input);
    if (isObject(source.proposalCandidate)) return source.proposalCandidate;
    if (isObject(source.envelope)) return source.envelope;
    if (isObject(source.candidate)) return proposalEnvelope(source.candidate);
    if (cleanString(source.serializedEnvelope)) return parseJsonObject(source.serializedEnvelope);
    return source;
  }

  function proposalRow(input) {
    var source = safeObject(input);
    if (isObject(source.candidateRow)) return source.candidateRow;
    if (isObject(source.row)) return source.row;
    if (cleanString(source.serializedEnvelope) || source.schema === PROPOSAL_ROW_SCHEMA) return source;
    if (isObject(source.candidate)) return proposalRow(source.candidate);
    return null;
  }

  function receiptEnvelope(input) {
    var source = safeObject(input);
    if (isObject(source.applyEventReceipt)) return receiptEnvelope(source.applyEventReceipt);
    if (isObject(source.receipt)) return receiptEnvelope(source.receipt);
    if (isObject(source.applyEvent)) return source.applyEvent;
    return source;
  }

  function receiptAudit(input) {
    var source = safeObject(input);
    if (isObject(source.applyEventReceipt)) return receiptAudit(source.applyEventReceipt);
    if (isObject(source.receipt)) return receiptAudit(source.receipt);
    if (isObject(source.auditMetadata)) return source.auditMetadata;
    return null;
  }

  function proposedToApplied(operation) {
    if (operation === OP_ARCHIVE_PROPOSED) return OP_ARCHIVE_APPLIED;
    if (operation === OP_RENAME_PROPOSED) return OP_RENAME_APPLIED;
    return '';
  }

  function foreverNoKey(value) {
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i += 1) {
        var arrHit = foreverNoKey(value[i]);
        if (arrHit) return arrHit;
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
      } catch (_) {
        addCode(warnings, 'domain-forbidden-field-scan-threw');
      }
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
      } catch (_) {
        addCode(warnings, 'privacy-scan-threw');
      }
    }
    if (!domainScanned && typeof H2O.Desktop.Sync.runChatForbiddenFieldScan === 'function') {
      try {
        var chatScan = H2O.Desktop.Sync.runChatForbiddenFieldScan(value);
        codeList(chatScan && chatScan.blockers).forEach(function (code) { addCode(blockers, code); });
        codeList(chatScan && chatScan.warnings).forEach(function (code) { addCode(warnings, code); });
      } catch (_) {
        addCode(warnings, 'chat-forbidden-field-scan-threw');
      }
    }
    var forbidden = foreverNoKey(value);
    if (forbidden) {
      addCode(blockers, 'payload-contains-forever-no-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbidden);
    }
  }

  function peerValid(peer) {
    var p = safeObject(peer);
    return isSha256Hex(p.physicalDeviceIdHash) &&
      isSha256Hex(p.installIdHash) &&
      isSha256Hex(p.syncPeerIdHash);
  }

  function validateProposal(envelope, row, blockers, warnings) {
    var env = safeObject(envelope);
    var payload = safeObject(env.payload);
    var proposed = safeObject(payload.proposedOperation);
    if (!isObject(envelope)) addCode(blockers, 'proposal-candidate-missing');
    if (env.schema !== ENVELOPE_SCHEMA) addCode(blockers, 'proposal-schema-invalid');
    if (env.kind !== KIND_PROPOSAL) addCode(blockers, 'proposal-kind-invalid');
    if (env.subjectType !== SUBJECT_TYPE) addCode(blockers, 'proposal-subjectType-invalid');
    if (env.operationIntent !== OPERATION_INTENT) addCode(blockers, 'proposal-operationIntent-invalid');
    if (env.operation !== OP_ARCHIVE_PROPOSED && env.operation !== OP_RENAME_PROPOSED) {
      addCode(blockers, 'proposal-operation-unsupported');
    }
    if (!isSha256Hex(env.subjectId)) addCode(blockers, 'proposal-subjectId-invalid');
    if (!isSha256Hex(env.lineageId)) addCode(blockers, 'proposal-lineageId-invalid');
    if (!isSha256Hex(env.dedupeKey)) addCode(blockers, 'proposal-dedupeKey-invalid');
    if (!isSha256Hex(env.eventDigest)) addCode(blockers, 'proposal-eventDigest-invalid');
    if (!peerValid(safeObject(safeObject(env.sourcePlatform).sourcePeerEnvelope))) {
      addCode(blockers, 'proposal-sourcePeer-invalid');
    }
    if (!isObject(payload)) addCode(blockers, 'proposal-payload-missing');
    if (!isObject(proposed)) addCode(blockers, 'proposal-proposedOperation-missing');
    if (!Array.isArray(payload.justifyingEvidenceDigests) || payload.justifyingEvidenceDigests.length === 0) {
      addCode(blockers, 'proposal-justifyingEvidenceDigests-missing');
    }
    if (!cleanString(payload.predicateVersion)) addCode(blockers, 'proposal-predicateVersion-missing');
    if (!isSha256Hex(proposed.baseHash)) addCode(blockers, 'proposal-baseHash-invalid');
    if (!isSha256Hex(proposed.targetHash)) addCode(blockers, 'proposal-targetHash-invalid');
    if (env.operation === OP_ARCHIVE_PROPOSED && typeof proposed.archived !== 'boolean') {
      addCode(blockers, 'proposal-archive-target-invalid');
    }
    if (env.operation === OP_RENAME_PROPOSED && !isSha256Hex(proposed.titleHash)) {
      addCode(blockers, 'proposal-titleHash-invalid');
    }
    if (row) {
      if (cleanString(row.status) && cleanString(row.status) !== 'generated') addCode(blockers, 'proposal-row-status-invalid');
      if (cleanString(row.eventDigest) && cleanLower(row.eventDigest) !== cleanLower(env.eventDigest)) {
        addCode(blockers, 'proposal-row-eventDigest-mismatch');
      }
    }
    scanPrivacy(env, blockers, warnings);
    if (row) scanPrivacy(row, blockers, warnings);
    return {
      operation: cleanString(env.operation),
      applyOperation: proposedToApplied(env.operation),
      subjectId: cleanLower(env.subjectId),
      lineageId: cleanLower(env.lineageId),
      dedupeKey: cleanLower(env.dedupeKey),
      eventDigest: cleanLower(env.eventDigest),
      envelopeId: cleanString(env.id),
      baseHash: cleanLower(proposed.baseHash),
      targetHash: cleanLower(proposed.targetHash),
      predicateVersion: cleanString(payload.predicateVersion),
      justifyingEvidenceDigests: asArray(payload.justifyingEvidenceDigests).map(cleanLower).filter(isSha256Hex)
    };
  }

  function validateHandoff(handoffPreview, proposal, blockers, warnings) {
    var preview = safeObject(handoffPreview);
    var request = safeObject(preview.handoffRequest);
    if (!isObject(handoffPreview)) addCode(blockers, 'handoff-preview-missing');
    if (preview.ok !== true || preview.handoffReady !== true) addCode(blockers, 'handoff-preview-not-ready');
    if (cleanString(preview.operation) !== proposal.operation) addCode(blockers, 'handoff-operation-mismatch');
    if (cleanLower(preview.subjectId) !== proposal.subjectId) addCode(blockers, 'handoff-subjectId-mismatch');
    if (cleanLower(preview.lineageId) !== proposal.lineageId) addCode(blockers, 'handoff-lineageId-mismatch');
    if (cleanLower(preview.dedupeKey) !== proposal.dedupeKey) addCode(blockers, 'handoff-dedupeKey-mismatch');
    if (!isObject(request)) addCode(blockers, 'handoff-request-missing');
    if (cleanString(safeObject(preview.owner).ownerKind || safeObject(preview.owner).kind) !== 'native') {
      addCode(blockers, 'handoff-owner-not-native');
    }
    scanPrivacy(preview, blockers, warnings);
    return {
      handoffId: cleanString(request.handoffId),
      ownerKind: cleanString(safeObject(preview.owner).ownerKind || safeObject(preview.owner).kind),
      ownerPlatformId: cleanString(safeObject(preview.owner).platformId)
    };
  }

  function validateReceipt(receipt, audit, proposal, blockers, warnings) {
    var event = safeObject(receipt);
    var payload = safeObject(event.payload);
    if (!isObject(receipt)) addCode(blockers, 'receipt-missing');
    if (event.schema !== ENVELOPE_SCHEMA) addCode(blockers, 'receipt-schema-invalid');
    if (event.kind !== KIND_RECEIPT) addCode(blockers, 'receipt-kind-invalid');
    if (event.subjectType !== SUBJECT_TYPE) addCode(blockers, 'receipt-subjectType-invalid');
    if (event.operationIntent !== OPERATION_INTENT) addCode(blockers, 'receipt-operationIntent-invalid');
    if (event.operation !== proposal.applyOperation) addCode(blockers, 'receipt-operation-mismatch');
    if (event.dryRun !== false) addCode(blockers, 'receipt-dryRun-invalid');
    if (event.transactional !== true) addCode(blockers, 'receipt-transactional-invalid');
    if (cleanLower(event.subjectId) !== proposal.subjectId) addCode(blockers, 'receipt-subjectId-mismatch');
    if (cleanLower(event.lineageId) !== proposal.lineageId) addCode(blockers, 'receipt-lineageId-mismatch');
    if (!isSha256Hex(event.eventDigest)) addCode(blockers, 'receipt-eventDigest-invalid');
    if (!isSha256Hex(event.dedupeKey)) addCode(blockers, 'receipt-dedupeKey-invalid');
    if (payload.result !== 'applied') addCode(blockers, 'receipt-result-invalid');
    if (cleanLower(payload.proposalEventDigest) !== proposal.eventDigest) addCode(blockers, 'receipt-proposalEventDigest-mismatch');
    if (cleanLower(payload.proposalDedupeKey) !== proposal.dedupeKey) addCode(blockers, 'receipt-proposalDedupeKey-mismatch');
    if (!isSha256Hex(payload.preStateHash)) addCode(blockers, 'receipt-preStateHash-invalid');
    if (!isSha256Hex(payload.postStateHash)) addCode(blockers, 'receipt-postStateHash-invalid');
    if (cleanLower(payload.preStateHash) !== proposal.baseHash) addCode(blockers, 'receipt-baseHash-mismatch');
    if (cleanLower(payload.postStateHash) !== proposal.targetHash) addCode(blockers, 'receipt-targetHash-mismatch');
    if (!isIso(payload.appliedAtIso || event.createdAt)) addCode(blockers, 'receipt-appliedAtIso-invalid');
    if (!cleanString(payload.auditMaintenanceId)) addCode(blockers, 'receipt-auditMaintenanceId-missing');
    if (!cleanString(payload.transactionId)) addCode(blockers, 'receipt-transactionId-missing');
    if (!peerValid(safeObject(safeObject(event.sourcePlatform).sourcePeerEnvelope))) addCode(blockers, 'receipt-peer-invalid');
    if (audit) {
      if (cleanLower(audit.eventDigest) !== cleanLower(event.eventDigest)) addCode(blockers, 'audit-eventDigest-mismatch');
      if (cleanLower(audit.subjectId) !== proposal.subjectId) addCode(blockers, 'audit-subjectId-mismatch');
      if (cleanLower(audit.lineageId) !== proposal.lineageId) addCode(blockers, 'audit-lineageId-mismatch');
    } else {
      addCode(blockers, 'audit-metadata-missing');
    }
    scanPrivacy(event, blockers, warnings);
    if (audit) scanPrivacy(audit, blockers, warnings);
    return {
      eventDigest: cleanLower(event.eventDigest),
      dedupeKey: cleanLower(event.dedupeKey),
      envelopeId: cleanString(event.id),
      auditId: cleanString(safeObject(audit).auditId || payload.auditMaintenanceId),
      auditMaintenanceId: cleanString(safeObject(audit).auditMaintenanceId || payload.auditMaintenanceId),
      transactionId: cleanString(payload.transactionId),
      appliedAtIso: cleanString(payload.appliedAtIso || event.createdAt),
      actorPeer: safeObject(safeObject(event.sourcePlatform).sourcePeerEnvelope)
    };
  }

  function duplicateRow(ledger, receiptInfo, blockers) {
    asArray(ledger && ledger.rows).forEach(function (row) {
      var r = safeObject(row);
      if (receiptInfo.eventDigest && cleanLower(r.applyEventDigest) === receiptInfo.eventDigest) {
        addCode(blockers, 'chat-bookkeeping-duplicate-eventDigest');
      }
      if (receiptInfo.dedupeKey && cleanLower(r.applyEventDedupeKey) === receiptInfo.dedupeKey) {
        addCode(blockers, 'chat-bookkeeping-duplicate-dedupeKey');
      }
    });
  }

  function validateWithKernelAudit(row, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (!kernel || typeof kernel.validateAuditRecord !== 'function') {
      addCode(warnings, 'audit-proof-framework-unavailable');
      return;
    }
    try {
      var audit = kernel.validateAuditRecord(row, {
        allowedDomains: ['chat'],
        allowedAuditResults: ['success'],
        requireAuditId: false,
        requireSubject: true,
        requireLineage: true,
        requireActorPeer: true,
        requireTimestamp: true,
        privacyPolicy: {
          subjectType: SUBJECT_TYPE,
          redactionClass: 'redacted',
          forbiddenList: FOREVER_NO_FIELDS,
          foreverNoFields: FOREVER_NO_FIELDS
        }
      });
      codeList(audit && audit.blockers).forEach(function (code) { addCode(blockers, code); });
      codeList(audit && audit.warnings).forEach(function (code) { addCode(warnings, code); });
    } catch (_) {
      addCode(warnings, 'audit-record-validation-threw');
    }
  }

  function failure(blockers, warnings) {
    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: false,
      bookkeepingRow: null,
      rowId: null,
      blockers: codeList(blockers),
      warnings: codeList(warnings)
    };
  }

  async function recordChatConvergenceBookkeeping(input) {
    var args = safeObject(input);
    var blockers = [];
    var warnings = [];
    if (!isObject(input)) addCode(blockers, 'input-missing');

    var envelope = proposalEnvelope(args.proposalCandidate || args.candidate);
    var row = proposalRow(args.proposalCandidate || args.candidate);
    var proposal = validateProposal(envelope, row, blockers, warnings);
    var handoff = validateHandoff(args.handoffPreview, proposal, blockers, warnings);
    var receipt = receiptEnvelope(args.applyEventReceipt || args.receipt);
    var audit = receiptAudit(args.applyEventReceipt || args.receipt);
    var receiptInfo = validateReceipt(receipt, audit, proposal, blockers, warnings);
    if (blockers.length) return failure(blockers, warnings);

    var ledger = null;
    try {
      ledger = normalizeLedger(await storageGet(LEDGER_KEY));
    } catch (_) {
      return failure(['chat-bookkeeping-ledger-read-failed'], warnings);
    }
    if (!ledger) return failure(['chat-bookkeeping-ledger-malformed'], warnings);
    duplicateRow(ledger, receiptInfo, blockers);
    if (blockers.length) return failure(blockers, warnings);

    var recordedAtIso = nowIsoSeconds();
    var bookkeepingRow = {
      schema: ROW_SCHEMA,
      rowId: generateUuid(),
      bookkeepingId: generateUuid(),
      status: STATUS_RECORDED,
      domain: 'chat',
      proposalCandidateId: cleanString(row && row.rowId),
      proposalEnvelopeId: proposal.envelopeId,
      proposalOperation: proposal.operation,
      proposalEventDigest: proposal.eventDigest,
      proposalDedupeKey: proposal.dedupeKey,
      handoffId: handoff.handoffId,
      handoffReady: true,
      ownerKind: handoff.ownerKind,
      ownerPlatformId: handoff.ownerPlatformId,
      applyOperation: proposal.applyOperation,
      operation: proposal.applyOperation,
      applyEventId: receiptInfo.envelopeId,
      applyEventDigest: receiptInfo.eventDigest,
      applyEventDedupeKey: receiptInfo.dedupeKey,
      eventDigest: receiptInfo.eventDigest,
      dedupeKey: receiptInfo.dedupeKey,
      auditId: receiptInfo.auditId,
      auditMaintenanceId: receiptInfo.auditMaintenanceId,
      transactionId: receiptInfo.transactionId,
      subjectType: SUBJECT_TYPE,
      subjectId: proposal.subjectId,
      lineageId: proposal.lineageId,
      operationIntent: OPERATION_INTENT,
      baseHash: proposal.baseHash,
      targetHash: proposal.targetHash,
      preStateHash: proposal.baseHash,
      postStateHash: proposal.targetHash,
      predicateVersion: proposal.predicateVersion,
      justifyingEvidenceDigests: proposal.justifyingEvidenceDigests.slice(),
      actorPeer: receiptInfo.actorPeer,
      appliedAtIso: receiptInfo.appliedAtIso,
      auditResult: 'success',
      auditAtIso: recordedAtIso,
      recordedAtIso: recordedAtIso,
      validationSummary: {
        proposalLinked: true,
        handoffLinked: true,
        receiptLinked: true,
        auditLinked: true,
        publicationTouched: false,
        relayTouched: false,
        nativeCalled: false,
        watermarkWritten: false,
        consumedOperationWritten: false
      },
      serializedApplyReceipt: canonicalJson({
        applyEvent: receipt,
        auditMetadata: audit
      })
    };
    validateWithKernelAudit(bookkeepingRow, blockers, warnings);
    scanPrivacy(bookkeepingRow, blockers, warnings);
    if (blockers.length) return failure(blockers, warnings);

    var next = {
      schema: LEDGER_SCHEMA,
      createdAtIso: ledger.createdAtIso,
      updatedAtIso: recordedAtIso,
      rows: ledger.rows.concat([bookkeepingRow])
    };
    try {
      await storageSet(LEDGER_KEY, next);
    } catch (_) {
      return failure(['chat-bookkeeping-ledger-write-failed'], warnings);
    }

    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: true,
      bookkeepingRow: bookkeepingRow,
      rowId: bookkeepingRow.rowId,
      blockers: [],
      warnings: codeList(warnings)
    };
  }

  async function listChatConvergenceBookkeeping() {
    var blockers = [];
    var warnings = [];
    var ledger = null;
    try {
      ledger = normalizeLedger(await storageGet(LEDGER_KEY));
    } catch (_) {
      addCode(blockers, 'chat-bookkeeping-ledger-read-failed');
    }
    if (!ledger && !blockers.length) addCode(blockers, 'chat-bookkeeping-ledger-malformed');
    var rows = ledger ? ledger.rows.slice() : [];
    return {
      schema: LEDGER_SCHEMA,
      version: VERSION,
      ok: blockers.length === 0,
      rows: rows,
      counts: {
        rows: rows.length,
        archive: rows.filter(function (row) { return safeObject(row).proposalOperation === OP_ARCHIVE_PROPOSED; }).length,
        rename: rows.filter(function (row) { return safeObject(row).proposalOperation === OP_RENAME_PROPOSED; }).length
      },
      blockers: codeList(blockers),
      warnings: codeList(warnings)
    };
  }

  H2O.Desktop.Sync.recordChatConvergenceBookkeeping = recordChatConvergenceBookkeeping;
  H2O.Desktop.Sync.listChatConvergenceBookkeeping = listChatConvergenceBookkeeping;
  H2O.Desktop.Sync.__chatConvergenceBookkeepingInstalled = true;
  H2O.Desktop.Sync.__chatConvergenceBookkeepingVersion = VERSION;
  H2O.Desktop.Sync.__chatConvergenceBookkeepingLedgerKey = LEDGER_KEY;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
