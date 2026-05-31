/* H2O Desktop Sync - F14.4.9 snapshot convergence bookkeeping
 *
 * Append-only bookkeeping for completed snapshot convergence evidence chains.
 * References proposal candidate -> owner handoff preview -> applyEvent receipt
 * output. This module never publishes, enqueues relay rows, calls Native/F5,
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
  if (H2O.Desktop.Sync.__snapshotBookkeepingInstalled) return;

  var VERSION = '0.1.0-f14.4.9';
  var RESULT_SCHEMA = 'h2o.desktop.sync.snapshot-convergence-bookkeeping.v1';
  var LEDGER_SCHEMA = 'h2o.desktop.sync.snapshot-convergence-bookkeeping-ledger.v1';
  var ROW_SCHEMA = 'h2o.desktop.sync.snapshot-convergence-bookkeeping-row.v1';
  var PROPOSAL_ROW_SCHEMA = 'h2o.desktop.sync.convergence-proposal-candidate-row.v1';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var LEDGER_KEY = 'h2o:sync:snapshot-convergence-bookkeeping:v1';
  var SUBJECT_TYPE = 'snapshot.conversation';
  var KIND_PROPOSAL = 'proposal';
  var KIND_APPLY_EVENT = 'applyEvent';
  var OP_ARCHIVE_PROPOSED = 'snapshot-lifecycle-archive-proposed';
  var OP_TOMBSTONE_PROPOSED = 'snapshot-lifecycle-tombstone-proposed';
  var OP_RESTORE_PROPOSED = 'snapshot-lifecycle-restore-proposed';
  var OP_ARCHIVE_APPLIED = 'snapshot-lifecycle-archive-applied';
  var OP_TOMBSTONE_APPLIED = 'snapshot-lifecycle-tombstone-applied';
  var OP_RESTORE_APPLIED = 'snapshot-lifecycle-restore-applied';
  var OPERATION_INTENT = 'update';
  var STATUS_RECORDED = 'recorded';
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'message_array', 'turns',
    'turn_array', 'conversation', 'transcript', 'attachments', 'files',
    'file_ids', 'image_urls', 'audio_urls', 'rawSnapshot', 'snapshotPayload',
    'rawId', 'snapshotId', 'snapshot_id', 'chatId', 'chat_id',
    'accountId', 'account_id', 'rawAccountId', 'title', 'name',
    'model', 'modelSlug', 'model_slug', 'modelVersion', 'model_version',
    'path', 'url', 'share_url', 'share_token', 'password', 'apiKey',
    'session_token', 'cookies', 'token'
  ];

  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function safeObject(value) { return isObject(value) ? value : {}; }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function cleanString(value) { return String(value == null ? '' : value).trim(); }
  function cleanLower(value) { return cleanString(value).toLowerCase(); }
  function nowIsoSeconds() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
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
  function isSha256Hex(value) { return /^[0-9a-f]{64}$/.test(cleanLower(value)); }
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
    try { if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID(); }
    catch (_) { /* fall through */ }
    var bytes = new Uint8Array(16);
    if (global.crypto && typeof global.crypto.getRandomValues === 'function') global.crypto.getRandomValues(bytes);
    else for (var i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
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
    if (operation === OP_TOMBSTONE_PROPOSED) return OP_TOMBSTONE_APPLIED;
    if (operation === OP_RESTORE_PROPOSED) return OP_RESTORE_APPLIED;
    return '';
  }
  function operationName(operation) {
    if (operation === OP_ARCHIVE_PROPOSED || operation === OP_ARCHIVE_APPLIED) return 'archive';
    if (operation === OP_TOMBSTONE_PROPOSED || operation === OP_TOMBSTONE_APPLIED) return 'tombstone';
    if (operation === OP_RESTORE_PROPOSED || operation === OP_RESTORE_APPLIED) return 'restore';
    return '';
  }
  function targetStateFor(operation) {
    if (operation === OP_ARCHIVE_PROPOSED) return 'archived';
    if (operation === OP_TOMBSTONE_PROPOSED) return 'tombstoned';
    if (operation === OP_RESTORE_PROPOSED) return 'captured';
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
    if (kernel && typeof kernel.scanDomainForbiddenFields === 'function') {
      try {
        var domainScan = kernel.scanDomainForbiddenFields(SUBJECT_TYPE, value);
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
    var expected = safeObject(payload.expectedPostState);
    var transition = safeObject(proposed.lifecycleTransition);
    var operation = cleanString(env.operation);
    var targetState = targetStateFor(operation);
    var fromState = cleanString(transition.fromState);

    if (!isObject(envelope)) addCode(blockers, 'proposal-candidate-missing');
    if (env.schema !== ENVELOPE_SCHEMA) addCode(blockers, 'proposal-schema-invalid');
    if (env.kind !== KIND_PROPOSAL) addCode(blockers, 'proposal-kind-invalid');
    if (env.subjectType !== SUBJECT_TYPE) addCode(blockers, 'proposal-subjectType-invalid');
    if (env.operationIntent !== OPERATION_INTENT) addCode(blockers, 'proposal-operationIntent-invalid');
    if (operation !== OP_ARCHIVE_PROPOSED && operation !== OP_TOMBSTONE_PROPOSED && operation !== OP_RESTORE_PROPOSED) {
      addCode(blockers, 'proposal-operation-unsupported');
    }
    if (!isSha256Hex(env.subjectId)) addCode(blockers, 'proposal-subjectId-invalid');
    if (!isSha256Hex(env.lineageId)) addCode(blockers, 'proposal-lineageId-invalid');
    if (!isSha256Hex(env.dedupeKey)) addCode(blockers, 'proposal-dedupeKey-invalid');
    if (!isSha256Hex(env.eventDigest)) addCode(blockers, 'proposal-eventDigest-invalid');
    if (!peerValid(safeObject(safeObject(env.sourcePlatform).sourcePeerEnvelope))) addCode(blockers, 'proposal-sourcePeer-invalid');
    if (!isObject(payload)) addCode(blockers, 'proposal-payload-missing');
    if (!isObject(proposed)) addCode(blockers, 'proposal-proposedOperation-missing');
    if (!isObject(expected)) addCode(blockers, 'proposal-expectedPostState-missing');
    if (!Array.isArray(payload.justifyingEvidenceDigests) || payload.justifyingEvidenceDigests.length === 0) {
      addCode(blockers, 'proposal-justifyingEvidenceDigests-missing');
    }
    if (!cleanString(payload.predicateVersion)) addCode(blockers, 'proposal-predicateVersion-missing');
    if (proposed.operation !== operation) addCode(blockers, 'proposal-operation-mismatch');
    if (proposed.operationIntent !== OPERATION_INTENT) addCode(blockers, 'proposal-proposedOperationIntent-invalid');
    if (proposed.subjectType !== SUBJECT_TYPE) addCode(blockers, 'proposal-proposedSubjectType-invalid');
    if (cleanLower(proposed.subjectId) !== cleanLower(env.subjectId)) addCode(blockers, 'proposal-proposedSubjectId-mismatch');
    if (!isSha256Hex(proposed.baseHash)) addCode(blockers, 'proposal-baseHash-invalid');
    if (!isSha256Hex(proposed.targetHash)) addCode(blockers, 'proposal-targetHash-invalid');
    if (targetState && cleanString(transition.toState) !== targetState) addCode(blockers, 'proposal-target-lifecycle-invalid');
    if (operation === OP_RESTORE_PROPOSED && fromState !== 'archived' && fromState !== 'tombstoned') {
      addCode(blockers, 'proposal-restore-source-invalid');
    }
    if (expected.subjectType !== SUBJECT_TYPE) addCode(blockers, 'proposal-expectedSubjectType-invalid');
    if (cleanLower(expected.subjectId) !== cleanLower(env.subjectId)) addCode(blockers, 'proposal-expectedSubjectId-mismatch');
    if (targetState && expected.lifecycleState !== targetState) addCode(blockers, 'proposal-expectedPostState-lifecycle-invalid');
    if (!isSha256Hex(expected.expectedPostStateHash)) addCode(blockers, 'proposal-expectedPostStateHash-invalid');
    if (row) {
      if (cleanString(row.status) && cleanString(row.status) !== 'generated') addCode(blockers, 'proposal-row-status-invalid');
      if (cleanString(row.eventDigest) && cleanLower(row.eventDigest) !== cleanLower(env.eventDigest)) addCode(blockers, 'proposal-row-eventDigest-mismatch');
      if (cleanString(row.dedupeKey) && cleanLower(row.dedupeKey) !== cleanLower(env.dedupeKey)) addCode(blockers, 'proposal-row-dedupeKey-mismatch');
    }
    scanPrivacy(env, blockers, warnings);
    if (row) scanPrivacy(row, blockers, warnings);
    return {
      operation: operation,
      operationName: operationName(operation),
      applyOperation: proposedToApplied(operation),
      subjectId: cleanLower(env.subjectId),
      lineageId: cleanLower(env.lineageId),
      dedupeKey: cleanLower(env.dedupeKey),
      eventDigest: cleanLower(env.eventDigest),
      envelopeId: cleanString(env.id),
      baseHash: cleanLower(proposed.baseHash),
      targetHash: cleanLower(proposed.targetHash),
      fromState: fromState,
      targetState: targetState,
      restoreFromTombstone: operation === OP_RESTORE_PROPOSED && fromState === 'tombstoned',
      predicateVersion: cleanString(payload.predicateVersion),
      justifyingEvidenceDigests: asArray(payload.justifyingEvidenceDigests).map(cleanLower).filter(isSha256Hex)
    };
  }
  function validateHandoff(handoffPreview, proposal, blockers, warnings) {
    var preview = safeObject(handoffPreview);
    var request = safeObject(preview.handoffRequest);
    var owner = safeObject(preview.owner);
    var requestOwner = safeObject(request.owner);
    var ownerKind = cleanString(owner.ownerKind || owner.kind || requestOwner.ownerKind || requestOwner.kind);
    var expectedOwner = proposal.operation === OP_TOMBSTONE_PROPOSED ? 'f5' : 'native';
    if (!isObject(handoffPreview)) addCode(blockers, 'handoff-preview-missing');
    if (preview.ok !== true || preview.handoffReady !== true) addCode(blockers, 'handoff-preview-not-ready');
    if (cleanString(preview.operation) !== proposal.operation) addCode(blockers, 'handoff-operation-mismatch');
    if (cleanLower(preview.subjectId) !== proposal.subjectId) addCode(blockers, 'handoff-subjectId-mismatch');
    if (cleanLower(preview.lineageId) !== proposal.lineageId) addCode(blockers, 'handoff-lineageId-mismatch');
    if (cleanLower(preview.dedupeKey) !== proposal.dedupeKey) addCode(blockers, 'handoff-dedupeKey-mismatch');
    if (!isObject(request)) addCode(blockers, 'handoff-request-missing');
    if (ownerKind !== expectedOwner) addCode(blockers, 'handoff-owner-invalid');
    if (proposal.operation === OP_TOMBSTONE_PROPOSED && !isObject(request.f5Handoff)) addCode(blockers, 'handoff-f5-metadata-missing');
    if (proposal.restoreFromTombstone && !isObject(request.f5TombstoneEvidence)) addCode(blockers, 'handoff-f5-tombstone-evidence-missing');
    if (cleanString(preview.restoreSource) && cleanString(preview.restoreSource) !== proposal.fromState) addCode(blockers, 'handoff-restoreSource-mismatch');
    scanPrivacy(preview, blockers, warnings);
    return {
      handoffId: cleanString(request.handoffId),
      ownerKind: ownerKind,
      ownerPlatformId: cleanString(owner.platformId || requestOwner.platformId),
      restoreSource: cleanString(preview.restoreSource)
    };
  }
  function validateReceipt(receipt, audit, proposal, blockers, warnings) {
    var event = safeObject(receipt);
    var payload = safeObject(event.payload);
    if (!isObject(receipt)) addCode(blockers, 'receipt-missing');
    if (event.schema !== ENVELOPE_SCHEMA) addCode(blockers, 'receipt-schema-invalid');
    if (event.kind !== KIND_APPLY_EVENT) addCode(blockers, 'receipt-kind-invalid');
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
    if (payload.postState && cleanString(safeObject(payload.postState).lifecycleState) !== proposal.targetState) addCode(blockers, 'receipt-target-lifecycle-mismatch');
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
      actorPeer: safeObject(safeObject(event.sourcePlatform).sourcePeerEnvelope),
      receiptOnly: payload.receiptOnly === true
    };
  }
  function duplicateRow(ledger, receiptInfo, blockers) {
    asArray(ledger && ledger.rows).forEach(function (row) {
      var r = safeObject(row);
      if (receiptInfo.eventDigest && cleanLower(r.applyEventDigest) === receiptInfo.eventDigest) addCode(blockers, 'snapshot-bookkeeping-duplicate-eventDigest');
      if (receiptInfo.dedupeKey && cleanLower(r.applyEventDedupeKey) === receiptInfo.dedupeKey) addCode(blockers, 'snapshot-bookkeeping-duplicate-dedupeKey');
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
        allowedDomains: ['snapshot'],
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
  function sideEffectSummary() {
    return {
      publicationTouched: false,
      relayTouched: false,
      nativeCalled: false,
      f5Touched: false,
      watermarkWritten: false,
      consumedOperationWritten: false
    };
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

  async function recordSnapshotConvergenceBookkeeping(input) {
    var args = safeObject(input);
    var blockers = [];
    var warnings = [];
    if (!isObject(input)) addCode(blockers, 'input-missing');

    var envelope = proposalEnvelope(args.proposalCandidate || args.candidate);
    var row = proposalRow(args.proposalCandidate || args.candidate);
    var proposal = validateProposal(envelope, row, blockers, warnings);
    var handoff = validateHandoff(args.handoffPreview, proposal, blockers, warnings);
    var receiptSource = args.applyEventReceipt || args.receipt;
    var receipt = receiptEnvelope(receiptSource);
    var audit = receiptAudit(receiptSource);
    var receiptInfo = validateReceipt(receipt, audit, proposal, blockers, warnings);
    if (blockers.length) return failure(blockers, warnings);

    var ledger = null;
    try {
      ledger = normalizeLedger(await storageGet(LEDGER_KEY));
    } catch (_) {
      return failure(['snapshot-bookkeeping-ledger-read-failed'], warnings);
    }
    if (!ledger) return failure(['snapshot-bookkeeping-ledger-malformed'], warnings);
    duplicateRow(ledger, receiptInfo, blockers);
    if (blockers.length) return failure(blockers, warnings);

    var recordedAtIso = nowIsoSeconds();
    var sideEffects = sideEffectSummary();
    var bookkeepingRow = {
      schema: ROW_SCHEMA,
      rowId: generateUuid(),
      bookkeepingId: generateUuid(),
      status: STATUS_RECORDED,
      domain: 'snapshot',
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
      operationName: proposal.operationName,
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
      sourceLifecycleState: proposal.fromState,
      targetLifecycleState: proposal.targetState,
      predicateVersion: proposal.predicateVersion,
      justifyingEvidenceDigests: proposal.justifyingEvidenceDigests.slice(),
      actorPeer: receiptInfo.actorPeer,
      appliedAtIso: receiptInfo.appliedAtIso,
      auditResult: 'success',
      auditAtIso: recordedAtIso,
      recordedAtIso: recordedAtIso,
      operationSummary: {
        subjectType: SUBJECT_TYPE,
        subjectId: proposal.subjectId,
        operation: proposal.applyOperation,
        operationName: proposal.operationName,
        sourceLifecycleState: proposal.fromState,
        targetLifecycleState: proposal.targetState,
        lineageId: proposal.lineageId,
        receiptOnly: receiptInfo.receiptOnly
      },
      validationSummary: Object.assign({
        proposalLinked: true,
        handoffLinked: true,
        receiptLinked: true,
        auditLinked: true,
        restoreFromTombstone: proposal.restoreFromTombstone
      }, sideEffects),
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
      return failure(['snapshot-bookkeeping-ledger-write-failed'], warnings);
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

  async function listSnapshotConvergenceBookkeeping() {
    var blockers = [];
    var warnings = [];
    var ledger = null;
    try {
      ledger = normalizeLedger(await storageGet(LEDGER_KEY));
    } catch (_) {
      addCode(blockers, 'snapshot-bookkeeping-ledger-read-failed');
    }
    if (!ledger && !blockers.length) addCode(blockers, 'snapshot-bookkeeping-ledger-malformed');
    var rows = ledger ? ledger.rows.slice() : [];
    scanPrivacy(rows, blockers, warnings);
    return {
      schema: LEDGER_SCHEMA,
      version: VERSION,
      ok: blockers.length === 0,
      rows: rows,
      counts: {
        rows: rows.length,
        archive: rows.filter(function (row) { return safeObject(row).proposalOperation === OP_ARCHIVE_PROPOSED; }).length,
        tombstone: rows.filter(function (row) { return safeObject(row).proposalOperation === OP_TOMBSTONE_PROPOSED; }).length,
        restore: rows.filter(function (row) { return safeObject(row).proposalOperation === OP_RESTORE_PROPOSED; }).length
      },
      blockers: codeList(blockers),
      warnings: codeList(warnings)
    };
  }

  H2O.Desktop.Sync.recordSnapshotConvergenceBookkeeping = recordSnapshotConvergenceBookkeeping;
  H2O.Desktop.Sync.listSnapshotConvergenceBookkeeping = listSnapshotConvergenceBookkeeping;
  H2O.Desktop.Sync.__snapshotBookkeepingInstalled = true;
  H2O.Desktop.Sync.__snapshotBookkeepingVersion = VERSION;
  H2O.Desktop.Sync.__snapshotBookkeepingLedgerKey = LEDGER_KEY;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
