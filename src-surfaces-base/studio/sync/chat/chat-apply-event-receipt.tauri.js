/* H2O Desktop Sync - F14.3.6b chat applyEvent receipt builder
 *
 * Receipt-only builder for successful Native-owned chat metadata operations.
 * This module never executes Native, applies, publishes, enqueues relay rows,
 * advances watermarks, records consumed operations, or mutates storage.
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
  if (H2O.Desktop.Sync.__chatApplyEventInstalled) return;

  var VERSION = '0.1.0-f14.3.6b';
  var RESULT_SCHEMA = 'h2o.desktop.sync.chat-apply-event-receipt-build.v1';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var SUBJECT_TYPE = 'chat.metadata';
  var KIND_PROPOSAL = 'proposal';
  var KIND_APPLY_EVENT = 'applyEvent';
  var OP_ARCHIVE_PROPOSED = 'chat-metadata-archive-proposed';
  var OP_RENAME_PROPOSED = 'chat-metadata-rename-proposed';
  var OP_ARCHIVE_APPLIED = 'chat-metadata-archive-applied';
  var OP_RENAME_APPLIED = 'chat-metadata-rename-applied';
  var OPERATION_INTENT = 'update';
  var REDACTED = 'redacted';
  var CAPABILITY_TAG = 'h2o.platform.capabilities.v1#f14.3.6b-desktop-chat-apply-event-v1';
  var DEFAULT_ARCHIVE_PREDICATE = 'h2o.chat.archive.predicate.v1';
  var DEFAULT_RENAME_PREDICATE = 'h2o.chat.rename.predicate.v1';
  var AUDIT_POLICY_VERSION = 'h2o.chat.native-owner-apply-receipt.v1';
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

  function isStateHash(value) {
    var text = cleanLower(value);
    return /^[0-9a-f]{64}$/.test(text);
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

  function webCryptoAvailable() {
    try {
      return !!(global.crypto && global.crypto.subtle && global.crypto.subtle.digest);
    } catch (_) {
      return false;
    }
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

  function generateUuid() {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') {
        return global.crypto.randomUUID();
      }
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

  function parseJsonObject(text) {
    if (isObject(text)) return text;
    if (typeof text !== 'string' || !text.trim()) return null;
    try {
      var parsed = JSON.parse(text);
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
    if (cleanString(source.serializedEnvelope)) return source;
    if (isObject(source.candidate)) return proposalRow(source.candidate);
    return null;
  }

  function proposalOperationDomain(operation) {
    if (operation === OP_ARCHIVE_PROPOSED) return 'archive';
    if (operation === OP_RENAME_PROPOSED) return 'rename';
    return '';
  }

  function applyOperationFor(proposalOperation) {
    if (proposalOperation === OP_ARCHIVE_PROPOSED) return OP_ARCHIVE_APPLIED;
    if (proposalOperation === OP_RENAME_PROPOSED) return OP_RENAME_APPLIED;
    return '';
  }

  function defaultPredicateFor(domain) {
    if (domain === 'archive') return DEFAULT_ARCHIVE_PREDICATE;
    if (domain === 'rename') return DEFAULT_RENAME_PREDICATE;
    return '';
  }

  function envelopeForEventDigest(envelope) {
    var clone = JSON.parse(JSON.stringify(envelope));
    delete clone.eventDigest;
    delete clone.warnings;
    delete clone.blockers;
    return clone;
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

  function validatePeer(peer) {
    return isSha256Hex(peer && peer.physicalDeviceIdHash) &&
      isSha256Hex(peer && peer.installIdHash) &&
      isSha256Hex(peer && peer.syncPeerIdHash);
  }

  function sourcePeerFromCandidate(envelope, handoffPreview, operationResult) {
    var result = safeObject(operationResult);
    var handoff = safeObject(safeObject(handoffPreview).handoffRequest);
    var peer = safeObject(result.actorPeer || result.sourcePeerEnvelope);
    if (validatePeer(peer)) return Object.assign({ surfaceKind: 'desktop-tauri' }, peer);
    peer = safeObject(handoff.requestedByPeer);
    if (validatePeer(peer)) return Object.assign({ surfaceKind: 'desktop-tauri' }, peer);
    peer = safeObject(safeObject(envelope.sourcePlatform).sourcePeerEnvelope);
    if (validatePeer(peer)) return Object.assign({ surfaceKind: 'desktop-tauri' }, peer);
    return {};
  }

  function validateSuccess(operationResult, blockers) {
    var row = safeObject(operationResult);
    if (!isObject(operationResult)) {
      addCode(blockers, 'operation-result-missing');
      return false;
    }
    if (codeList(row.blockers).length) addCode(blockers, 'operation-result-has-blockers');
    var result = cleanString(row.result || row.resultState || row.status);
    var success = row.ok === true ||
      row.applied === true ||
      row.succeeded === true ||
      result === 'applied' ||
      result === 'success' ||
      result === 'completed';
    if (!success) addCode(blockers, 'operation-result-not-successful');
    return success;
  }

  async function validateCandidate(envelope, row, blockers, warnings) {
    var env = safeObject(envelope);
    var payload = safeObject(env.payload);
    var proposed = safeObject(payload.proposedOperation);
    var expected = safeObject(payload.expectedPostState);
    var domain = proposalOperationDomain(env.operation);
    var applyOperation = applyOperationFor(env.operation);

    if (!isObject(envelope)) {
      addCode(blockers, 'proposal-candidate-missing');
      return null;
    }
    if (env.schema !== ENVELOPE_SCHEMA) addCode(blockers, 'proposal-envelope-schema-invalid');
    if (env.kind !== KIND_PROPOSAL) addCode(blockers, 'proposal-kind-invalid');
    if (env.subjectType !== SUBJECT_TYPE) addCode(blockers, 'proposal-subjectType-invalid');
    if (env.operationIntent !== OPERATION_INTENT) addCode(blockers, 'proposal-operationIntent-invalid');
    if (!domain) addCode(blockers, 'proposal-operation-unsupported');
    if (env.redactionClass !== REDACTED) addCode(blockers, 'proposal-redactionClass-invalid');
    if (!isSha256Hex(env.subjectId)) addCode(blockers, 'proposal-subjectId-invalid');
    if (!isSha256Hex(env.lineageId)) addCode(blockers, 'proposal-lineageId-invalid');
    if (!isSha256Hex(env.dedupeKey)) addCode(blockers, 'proposal-dedupeKey-invalid');
    if (!isSha256Hex(env.eventDigest)) addCode(blockers, 'proposal-eventDigest-invalid');
    if (!isSha256Hex(env.payloadHash)) addCode(blockers, 'proposal-payloadHash-invalid');
    if (!validatePeer(safeObject(safeObject(env.sourcePlatform).sourcePeerEnvelope))) {
      addCode(blockers, 'proposal-sourcePeer-invalid');
    }
    if (!isObject(payload)) addCode(blockers, 'proposal-payload-missing');
    if (!isObject(proposed)) addCode(blockers, 'proposal-proposedOperation-missing');
    if (!isObject(expected)) addCode(blockers, 'proposal-expectedPostState-missing');
    if (!Array.isArray(payload.justifyingEvidenceDigests) || payload.justifyingEvidenceDigests.length === 0) {
      addCode(blockers, 'proposal-justifyingEvidenceDigests-missing');
    }
    asArray(payload.justifyingEvidenceDigests).forEach(function (digest) {
      if (!isSha256Hex(digest)) addCode(blockers, 'proposal-justifyingEvidenceDigest-invalid');
    });
    if (!cleanString(payload.predicateVersion)) addCode(blockers, 'proposal-predicateVersion-missing');
    if (proposed.operation !== env.operation) addCode(blockers, 'proposal-operation-mismatch');
    if (proposed.operationIntent !== OPERATION_INTENT) addCode(blockers, 'proposal-proposedOperationIntent-invalid');
    if (proposed.subjectType !== SUBJECT_TYPE) addCode(blockers, 'proposal-proposedSubjectType-invalid');
    if (cleanLower(proposed.subjectId) !== cleanLower(env.subjectId)) addCode(blockers, 'proposal-proposedSubjectId-mismatch');
    if (expected.subjectType !== SUBJECT_TYPE) addCode(blockers, 'proposal-expectedSubjectType-invalid');
    if (cleanLower(expected.subjectId) !== cleanLower(env.subjectId)) addCode(blockers, 'proposal-expectedSubjectId-mismatch');
    if (!isStateHash(proposed.baseHash)) addCode(blockers, 'proposal-baseHash-invalid');
    if (!isStateHash(proposed.targetHash)) addCode(blockers, 'proposal-targetHash-invalid');
    if (!isStateHash(expected.expectedPostStateHash)) addCode(blockers, 'proposal-expectedPostStateHash-invalid');
    if (domain === 'archive' && typeof proposed.archived !== 'boolean') {
      addCode(blockers, 'proposal-archive-target-invalid');
    }
    if (domain === 'rename' && !isSha256Hex(proposed.titleHash)) {
      addCode(blockers, 'proposal-titleHash-invalid');
    }
    if (row) {
      if (cleanString(row.status) && cleanString(row.status) !== 'generated') addCode(blockers, 'proposal-row-status-invalid');
      if (cleanString(row.eventDigest) && cleanLower(row.eventDigest) !== cleanLower(env.eventDigest)) {
        addCode(blockers, 'proposal-row-eventDigest-mismatch');
      }
      if (cleanString(row.dedupeKey) && cleanLower(row.dedupeKey) !== cleanLower(env.dedupeKey)) {
        addCode(blockers, 'proposal-row-dedupeKey-mismatch');
      }
    }

    var expectedPayloadHash = await sha256Hex(payload);
    if (isSha256Hex(expectedPayloadHash) && expectedPayloadHash !== cleanLower(env.payloadHash)) {
      addCode(blockers, 'proposal-payloadHash-mismatch');
    }
    var expectedEventDigest = await sha256Hex(envelopeForEventDigest(env));
    if (isSha256Hex(expectedEventDigest) && expectedEventDigest !== cleanLower(env.eventDigest)) {
      addCode(blockers, 'proposal-eventDigest-mismatch');
    }
    scanPrivacy(env, blockers, warnings);
    if (row) scanPrivacy(row, blockers, warnings);

    return {
      proposalOperation: env.operation,
      applyOperation: applyOperation,
      domain: domain,
      subjectId: cleanLower(env.subjectId),
      lineageId: cleanLower(env.lineageId),
      proposalDedupeKey: cleanLower(env.dedupeKey),
      proposalEventDigest: cleanLower(env.eventDigest),
      proposalEnvelopeId: cleanString(env.id),
      baseHash: cleanLower(proposed.baseHash),
      targetHash: cleanLower(proposed.targetHash || expected.expectedPostStateHash),
      predicateVersion: cleanString(payload.predicateVersion) || defaultPredicateFor(domain),
      justifyingEvidenceDigests: asArray(payload.justifyingEvidenceDigests).map(cleanLower).filter(isSha256Hex),
      currentArchived: typeof proposed.currentArchived === 'boolean' ? proposed.currentArchived : null,
      archived: typeof proposed.archived === 'boolean' ? proposed.archived : null,
      currentTitleHash: isSha256Hex(proposed.currentTitleHash) ? cleanLower(proposed.currentTitleHash) : '',
      titleHash: isSha256Hex(proposed.titleHash) ? cleanLower(proposed.titleHash) : '',
      sourcePeerEnvelope: safeObject(safeObject(env.sourcePlatform).sourcePeerEnvelope)
    };
  }

  function validateHandoffPreview(handoffPreview, candidate, blockers, warnings) {
    var preview = safeObject(handoffPreview);
    var request = safeObject(preview.handoffRequest);
    if (!isObject(handoffPreview)) {
      addCode(blockers, 'handoff-preview-missing');
      return;
    }
    if (preview.ok !== true || preview.handoffReady !== true) addCode(blockers, 'handoff-preview-not-ready');
    if (cleanString(preview.operation) !== candidate.proposalOperation) addCode(blockers, 'handoff-operation-mismatch');
    if (cleanLower(preview.subjectId) !== candidate.subjectId) addCode(blockers, 'handoff-subjectId-mismatch');
    if (cleanLower(preview.lineageId) !== candidate.lineageId) addCode(blockers, 'handoff-lineageId-mismatch');
    if (cleanLower(preview.dedupeKey) !== candidate.proposalDedupeKey) addCode(blockers, 'handoff-dedupeKey-mismatch');
    if (request.operation && cleanString(request.operation) !== candidate.proposalOperation) {
      addCode(blockers, 'handoff-request-operation-mismatch');
    }
    if (request.subjectId && cleanLower(request.subjectId) !== candidate.subjectId) {
      addCode(blockers, 'handoff-request-subjectId-mismatch');
    }
    if (request.lineageId && cleanLower(request.lineageId) !== candidate.lineageId) {
      addCode(blockers, 'handoff-request-lineageId-mismatch');
    }
    scanPrivacy(preview, blockers, warnings);
  }

  function resultPreHash(operationResult, candidate) {
    var row = safeObject(operationResult);
    return cleanLower(row.preStateHash ||
      safeObject(row.preState).hash ||
      safeObject(row.auditMetadata).preStateHash ||
      candidate.baseHash);
  }

  function resultPostHash(operationResult, candidate) {
    var row = safeObject(operationResult);
    return cleanLower(row.postStateHash ||
      safeObject(row.postState).hash ||
      safeObject(row.auditMetadata).postStateHash ||
      candidate.targetHash);
  }

  function resultOperation(operationResult) {
    var row = safeObject(operationResult);
    return cleanString(row.operation || row.operationKind || row.applyOperation);
  }

  function resultAppliedAt(operationResult) {
    var row = safeObject(operationResult);
    return cleanString(row.appliedAtIso || row.completedAtIso || row.createdAtIso) || nowIsoSeconds();
  }

  function validateOperationResult(operationResult, candidate, blockers, warnings) {
    var row = safeObject(operationResult);
    validateSuccess(operationResult, blockers);
    var op = resultOperation(row);
    if (op && op !== candidate.proposalOperation &&
        op !== candidate.applyOperation &&
        op !== candidate.domain) {
      addCode(blockers, 'operation-result-operation-mismatch');
    }
    if (cleanString(row.subjectId) && cleanLower(row.subjectId) !== candidate.subjectId) {
      addCode(blockers, 'operation-result-subjectId-mismatch');
    }
    if (cleanString(row.lineageId) && cleanLower(row.lineageId) !== candidate.lineageId) {
      addCode(blockers, 'operation-result-lineageId-mismatch');
    }
    var preHash = resultPreHash(row, candidate);
    var postHash = resultPostHash(row, candidate);
    if (!isStateHash(preHash)) addCode(blockers, 'operation-result-preStateHash-invalid');
    if (!isStateHash(postHash)) addCode(blockers, 'operation-result-postStateHash-invalid');
    if (preHash !== candidate.baseHash) addCode(blockers, 'operation-result-baseHash-mismatch');
    if (postHash !== candidate.targetHash) addCode(blockers, 'operation-result-targetHash-mismatch');
    if (candidate.domain === 'archive' && typeof row.archived === 'boolean' && row.archived !== candidate.archived) {
      addCode(blockers, 'operation-result-archive-target-mismatch');
    }
    if (candidate.domain === 'rename' && cleanString(row.titleHash) && cleanLower(row.titleHash) !== candidate.titleHash) {
      addCode(blockers, 'operation-result-titleHash-mismatch');
    }
    scanPrivacy(row, blockers, warnings);
    codeList(row.warnings).forEach(function (code) { addCode(warnings, code); });
  }

  function statePayloads(candidate, preHash, postHash) {
    if (candidate.domain === 'archive') {
      return {
        preState: {
          hash: preHash,
          archived: candidate.currentArchived === true
        },
        postState: {
          hash: postHash,
          archived: candidate.archived === true
        }
      };
    }
    return {
      preState: {
        hash: preHash,
        titleHash: candidate.currentTitleHash
      },
      postState: {
        hash: postHash,
        titleHash: candidate.titleHash
      }
    };
  }

  async function operationId(operationResult, candidate, preHash, postHash) {
    var row = safeObject(operationResult);
    var existing = cleanString(row.operationId || safeObject(row.auditMetadata).operationId);
    if (existing) return existing;
    return sha256Hex({
      schema: RESULT_SCHEMA,
      purpose: 'operationId',
      operation: candidate.applyOperation,
      subjectId: candidate.subjectId,
      lineageId: candidate.lineageId,
      proposalEventDigest: candidate.proposalEventDigest,
      preStateHash: preHash,
      postStateHash: postHash
    });
  }

  async function transactionId(operationResult, operationIdValue) {
    var row = safeObject(operationResult);
    var existing = cleanString(row.transactionId || safeObject(row.auditMetadata).transactionId);
    if (existing) return existing;
    return sha256Hex({
      schema: RESULT_SCHEMA,
      purpose: 'transactionId',
      operationId: operationIdValue
    });
  }

  async function auditMaintenanceId(operationResult, candidate, operationIdValue, transactionIdValue) {
    var row = safeObject(operationResult);
    var existing = cleanString(row.auditMaintenanceId || row.auditId || safeObject(row.auditMetadata).auditId);
    if (existing) return existing;
    return sha256Hex({
      schema: RESULT_SCHEMA,
      purpose: 'auditMaintenanceId',
      operation: candidate.applyOperation,
      subjectId: candidate.subjectId,
      lineageId: candidate.lineageId,
      operationId: operationIdValue,
      transactionId: transactionIdValue
    });
  }

  function hasKernelIdentity() {
    var kernel = H2O.Desktop.Sync.kernel || null;
    return !!(kernel &&
      typeof kernel.generateSubjectId === 'function' &&
      typeof kernel.generateDedupeKey === 'function' &&
      typeof kernel.generateLineageId === 'function');
  }

  async function buildIdentity(candidate, actorPeer, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (!hasKernelIdentity()) {
      addCode(blockers, 'kernel-identity-kit-unavailable');
      return null;
    }
    var subject = await kernel.generateSubjectId({
      subjectType: SUBJECT_TYPE,
      subjectId: candidate.subjectId,
      operation: candidate.applyOperation,
      baseHash: candidate.baseHash,
      actorPeer: actorPeer
    });
    codeList(subject && subject.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(subject && subject.warnings).forEach(function (code) { addCode(warnings, code); });
    var subjectId = cleanLower(subject && subject.subjectId);
    if (subjectId !== candidate.subjectId) addCode(blockers, 'identity-subjectId-mismatch');

    var lineage = await kernel.generateLineageId({
      deterministic: true,
      subjectType: SUBJECT_TYPE,
      subjectId: candidate.subjectId,
      operation: candidate.proposalOperation,
      baseHash: candidate.baseHash,
      actorPeer: candidate.sourcePeerEnvelope
    });
    codeList(lineage && lineage.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(lineage && lineage.warnings).forEach(function (code) { addCode(warnings, code); });
    var lineageId = cleanLower(lineage && lineage.lineageId);
    if (lineageId !== candidate.lineageId) addCode(blockers, 'identity-lineageId-mismatch');

    var dedupe = await kernel.generateDedupeKey({
      subjectType: SUBJECT_TYPE,
      subjectId: candidate.subjectId,
      operation: candidate.applyOperation,
      baseHash: candidate.baseHash,
      actorPeer: actorPeer
    });
    codeList(dedupe && dedupe.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(dedupe && dedupe.warnings).forEach(function (code) { addCode(warnings, code); });
    var dedupeKey = cleanLower(dedupe && dedupe.dedupeKey);
    if (!isSha256Hex(dedupeKey)) addCode(blockers, 'identity-dedupeKey-invalid');
    return {
      subjectId: subjectId,
      lineageId: candidate.lineageId,
      dedupeKey: dedupeKey
    };
  }

  function ownerSummary(handoffPreview) {
    var owner = safeObject(safeObject(handoffPreview).owner);
    var handoffOwner = safeObject(safeObject(safeObject(handoffPreview).handoffRequest).owner);
    var source = Object.keys(owner).length ? owner : handoffOwner;
    return {
      ownerKind: cleanString(source.ownerKind || source.kind),
      platformId: cleanString(source.platformId),
      surfaceKind: cleanString(source.surfaceKind),
      authorityLevel: cleanString(source.authorityLevel),
      ownerNameHash: isSha256Hex(source.ownerNameHash) ? cleanLower(source.ownerNameHash) : ''
    };
  }

  function validateAuditMetadata(metadata, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (!kernel || typeof kernel.validateAuditMetadata !== 'function') {
      addCode(warnings, 'audit-proof-framework-unavailable');
      return metadata;
    }
    var result = null;
    try {
      result = kernel.validateAuditMetadata(metadata, {
        allowedDomains: ['chat'],
        requireAuditId: true,
        requireSubject: true,
        requireLineage: true,
        requireActorPeer: true,
        requireTimestamp: true,
        requireTransactionId: true,
        privacyPolicy: {
          subjectType: SUBJECT_TYPE,
          redactionClass: 'redacted',
          forbiddenList: FOREVER_NO_FIELDS,
          foreverNoFields: FOREVER_NO_FIELDS
        }
      });
    } catch (_) {
      addCode(warnings, 'audit-metadata-validation-threw');
      return metadata;
    }
    codeList(result && result.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(result && result.warnings).forEach(function (code) { addCode(warnings, code); });
    return safeObject(result && result.auditMetadata) || metadata;
  }

  function failure(blockers, warnings) {
    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: false,
      applyEvent: null,
      auditMetadata: null,
      blockers: codeList(blockers),
      warnings: codeList(warnings)
    };
  }

  async function buildChatApplyEventReceipt(input) {
    var args = safeObject(input);
    var blockers = [];
    var warnings = [];

    if (!isObject(input)) addCode(blockers, 'input-missing');
    if (!webCryptoAvailable()) addCode(blockers, 'web-crypto-unavailable');
    if (blockers.length) return failure(blockers, warnings);

    var envelope = proposalEnvelope(args.proposalCandidate);
    var row = proposalRow(args.proposalCandidate);
    var candidate = await validateCandidate(envelope, row, blockers, warnings);
    if (!candidate) return failure(blockers, warnings);
    validateHandoffPreview(args.handoffPreview, candidate, blockers, warnings);
    validateOperationResult(args.operationResult, candidate, blockers, warnings);

    var actorPeer = sourcePeerFromCandidate(envelope, args.handoffPreview, args.operationResult);
    if (!validatePeer(actorPeer)) addCode(blockers, 'invalid-peer-identity');
    var preHash = resultPreHash(args.operationResult, candidate);
    var postHash = resultPostHash(args.operationResult, candidate);
    var identity = await buildIdentity(candidate, actorPeer, blockers, warnings);
    scanPrivacy(args, blockers, warnings);
    if (blockers.length || !identity) return failure(blockers, warnings);

    var opId = await operationId(args.operationResult, candidate, preHash, postHash);
    var txnId = await transactionId(args.operationResult, opId);
    var auditId = await auditMaintenanceId(args.operationResult, candidate, opId, txnId);
    var appliedAt = resultAppliedAt(args.operationResult);
    if (!isIso(appliedAt)) addCode(blockers, 'appliedAtIso-invalid');
    if (!opId) addCode(blockers, 'operationId-required');
    if (!txnId) addCode(blockers, 'transactionId-required');
    if (!auditId) addCode(blockers, 'auditMaintenanceId-required');
    if (blockers.length) return failure(blockers, warnings);

    var states = statePayloads(candidate, preHash, postHash);
    var payload = {
      auditMaintenanceId: auditId,
      operationId: opId,
      subjectId: identity.subjectId,
      lineageId: identity.lineageId,
      operation: candidate.applyOperation,
      proposalOperation: candidate.proposalOperation,
      operationIntent: OPERATION_INTENT,
      preStateHash: preHash,
      postStateHash: postHash,
      preState: states.preState,
      postState: states.postState,
      actorPeer: actorPeer,
      owner: ownerSummary(args.handoffPreview),
      appliedAtIso: appliedAt,
      predicateVersion: candidate.predicateVersion,
      transactionId: txnId,
      proposalEnvelopeId: candidate.proposalEnvelopeId,
      proposalEventDigest: candidate.proposalEventDigest,
      proposalDedupeKey: candidate.proposalDedupeKey,
      justifyingEvidenceDigests: candidate.justifyingEvidenceDigests.slice(),
      result: 'applied'
    };
    if (candidate.domain === 'archive') payload.archived = candidate.archived === true;
    if (candidate.domain === 'rename') payload.titleHash = candidate.titleHash;
    scanPrivacy(payload, blockers, warnings);
    if (blockers.length) return failure(blockers, warnings);

    var capabilitySnapshotHash = await sha256Hex(CAPABILITY_TAG);
    var payloadHash = await sha256Hex(payload);
    if (!isSha256Hex(capabilitySnapshotHash)) addCode(blockers, 'capability-hash-generation-failed');
    if (!isSha256Hex(payloadHash)) addCode(blockers, 'payload-hash-generation-failed');
    if (blockers.length) return failure(blockers, warnings);

    var envelopeBase = {
      schema: ENVELOPE_SCHEMA,
      envelopeVersion: 'v1',
      envelopeKindVersion: 'v1',
      kind: KIND_APPLY_EVENT,
      id: generateUuid(),
      lineageId: identity.lineageId,
      createdAt: nowIsoSeconds(),
      sequence: null,
      exportSequence: null,
      sourcePlatform: {
        platformId: 'desktop-studio',
        surfaceKind: 'desktop-tauri',
        sourcePeerEnvelope: actorPeer
      },
      declaredAuthority: 'strong-local-authority',
      effectiveAuthority: 'strong-local-authority',
      capabilityUsed: 'apply',
      capabilitySnapshotHash: capabilitySnapshotHash,
      subjectType: SUBJECT_TYPE,
      subjectId: identity.subjectId,
      operation: candidate.applyOperation,
      operationIntent: OPERATION_INTENT,
      redactionClass: REDACTED,
      dryRun: false,
      transactional: true,
      dedupeKey: identity.dedupeKey,
      payloadHash: payloadHash,
      payload: payload
    };
    var eventDigest = await sha256Hex(envelopeForEventDigest(envelopeBase));
    if (!isSha256Hex(eventDigest)) addCode(blockers, 'event-digest-generation-failed');
    var applyEvent = Object.assign({}, envelopeBase, {
      eventDigest: eventDigest,
      warnings: warnings.slice(),
      blockers: []
    });

    var auditMetadata = {
      auditId: auditId,
      auditMaintenanceId: auditId,
      domain: 'chat',
      subjectType: SUBJECT_TYPE,
      subjectId: identity.subjectId,
      operation: candidate.applyOperation,
      operationIntent: OPERATION_INTENT,
      lineageId: identity.lineageId,
      eventDigest: eventDigest,
      dedupeKey: identity.dedupeKey,
      transactionId: txnId,
      actorPeer: actorPeer,
      policyVersion: AUDIT_POLICY_VERSION,
      predicateVersion: candidate.predicateVersion,
      createdAtIso: applyEvent.createdAt,
      metadata: {
        receiptOnly: true,
        nativeOwned: true,
        proposalOperation: candidate.proposalOperation,
        proposalEventDigest: candidate.proposalEventDigest
      }
    };
    auditMetadata = validateAuditMetadata(auditMetadata, blockers, warnings);
    scanPrivacy(applyEvent, blockers, warnings);
    scanPrivacy(auditMetadata, blockers, warnings);
    if (blockers.length) return failure(blockers, warnings);

    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: true,
      applyEvent: applyEvent,
      auditMetadata: auditMetadata,
      blockers: [],
      warnings: codeList(warnings)
    };
  }

  H2O.Desktop.Sync.buildChatApplyEventReceipt = buildChatApplyEventReceipt;
  H2O.Desktop.Sync.__chatApplyEventInstalled = true;
  H2O.Desktop.Sync.__chatApplyEventVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
