/* H2O Desktop Sync - F14.5.5.2 snapshot tombstone applyEvent receipt builder
 *
 * Receipt-only builder for successful hypothetical F5-owned snapshot
 * tombstone operations. This module never executes Native/F5, applies,
 * publishes, enqueues relay outbox rows, advances watermarks, records consumed
 * operations, or mutates storage.
 *
 * F14.5.5.2 wire-through: after a successful receipt is assembled, the
 * receipt's existing `f5Handoff` envelope (verbatim, no reshape) is forwarded
 * to H2O.Desktop.Sync.ingestF5Review (the F14.5.5.1 queue). On ingest success
 * the receipt result carries `f5ReviewIngested: true` + `f5ReviewId`. On
 * ingest blockers (e.g. `f5-review-open-duplicate`) the blockers surface as
 * receipt WARNINGS — the receipt itself stays successful. On queue
 * unavailability (`__snapshotF5ReviewQueueInstalled` not set) a single
 * warning `f5-review-queue-unavailable` is added. The receipt's
 * `sideEffectSummary` semantics are unchanged: queue ingest is queue-internal
 * append-only bookkeeping, not an apply / publication / watermark /
 * consumed-op side effect.
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
  if (H2O.Desktop.Sync.__snapshotTombstoneApplyEventInstalled) return;

  var VERSION = '0.2.0-f14.5.5.2';
  var RESULT_SCHEMA = 'h2o.desktop.sync.snapshot-tombstone-apply-event-receipt.v1';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var F5_EVIDENCE_PREVIEW_SCHEMA = 'h2o.desktop.sync.snapshot-tombstone-f5-evidence-preview.v1';
  var CONSUMED_PREVIEW_SCHEMA = 'h2o.desktop.sync.snapshot-tombstone-consumed-operation-preview.v1';
  var WATERMARK_PREVIEW_SCHEMA = 'h2o.desktop.sync.snapshot-tombstone-watermark-target-preview.v1';
  var SUBJECT_TYPE = 'snapshot.conversation';
  var KIND_PROPOSAL = 'proposal';
  var KIND_APPLY_EVENT = 'applyEvent';
  var OP_TOMBSTONE_PROPOSED = 'snapshot-lifecycle-tombstone-proposed';
  var OP_TOMBSTONE_APPLIED = 'snapshot-lifecycle-tombstone-applied';
  var OPERATION_INTENT = 'update';
  var REDACTED = 'redacted';
  var CAPABILITY_TAG = 'h2o.platform.capabilities.v1#f14.4.8b-desktop-snapshot-tombstone-apply-event-v1';
  var DEFAULT_PREDICATE = 'h2o.snapshot.tombstone.predicate.v1';
  var AUDIT_POLICY_VERSION = 'h2o.snapshot.f5-owner-tombstone-receipt.v1';
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
  function isStateHash(value) { return /^[0-9a-f]{64}$/.test(cleanLower(value)); }
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
          redactionClass: REDACTED,
          allowedRedactionClasses: [REDACTED],
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
  function validatePeer(peer) {
    return isSha256Hex(peer && peer.physicalDeviceIdHash) &&
      isSha256Hex(peer && peer.installIdHash) &&
      isSha256Hex(peer && peer.syncPeerIdHash);
  }
  function sourcePeerFromInputs(envelope, handoffPreview, operationResult) {
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

  async function validateCandidate(envelope, row, blockers, warnings) {
    var env = safeObject(envelope);
    var payload = safeObject(env.payload);
    var proposed = safeObject(payload.proposedOperation);
    var expected = safeObject(payload.expectedPostState);
    var transition = safeObject(proposed.lifecycleTransition);

    if (!isObject(envelope)) {
      addCode(blockers, 'proposal-candidate-missing');
      return null;
    }
    if (env.schema !== ENVELOPE_SCHEMA) addCode(blockers, 'proposal-envelope-schema-invalid');
    if (env.kind !== KIND_PROPOSAL) addCode(blockers, 'proposal-kind-invalid');
    if (env.subjectType !== SUBJECT_TYPE) addCode(blockers, 'proposal-subjectType-invalid');
    if (env.operationIntent !== OPERATION_INTENT) addCode(blockers, 'proposal-operationIntent-invalid');
    if (env.operation !== OP_TOMBSTONE_PROPOSED) addCode(blockers, 'proposal-operation-not-tombstone');
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
    if (cleanString(transition.toState) !== 'tombstoned') addCode(blockers, 'proposal-tombstone-target-invalid');
    if (expected.lifecycleState !== 'tombstoned') addCode(blockers, 'proposal-expectedPostState-lifecycle-invalid');
    if (row) {
      if (cleanString(row.status) && cleanString(row.status) !== 'generated') addCode(blockers, 'proposal-row-status-invalid');
      if (cleanString(row.eventDigest) && cleanLower(row.eventDigest) !== cleanLower(env.eventDigest)) addCode(blockers, 'proposal-row-eventDigest-mismatch');
      if (cleanString(row.dedupeKey) && cleanLower(row.dedupeKey) !== cleanLower(env.dedupeKey)) addCode(blockers, 'proposal-row-dedupeKey-mismatch');
    }

    var expectedPayloadHash = await sha256Hex(payload);
    if (isSha256Hex(expectedPayloadHash) && expectedPayloadHash !== cleanLower(env.payloadHash)) addCode(blockers, 'proposal-payloadHash-mismatch');
    var expectedEventDigest = await sha256Hex(envelopeForEventDigest(env));
    if (isSha256Hex(expectedEventDigest) && expectedEventDigest !== cleanLower(env.eventDigest)) addCode(blockers, 'proposal-eventDigest-mismatch');
    scanPrivacy(env, blockers, warnings);
    if (row) scanPrivacy(row, blockers, warnings);

    return {
      proposalOperation: env.operation,
      applyOperation: OP_TOMBSTONE_APPLIED,
      subjectId: cleanLower(env.subjectId),
      lineageId: cleanLower(env.lineageId),
      proposalDedupeKey: cleanLower(env.dedupeKey),
      proposalEventDigest: cleanLower(env.eventDigest),
      proposalEnvelopeId: cleanString(env.id),
      baseHash: cleanLower(proposed.baseHash),
      targetHash: cleanLower(proposed.targetHash || expected.expectedPostStateHash),
      predicateVersion: cleanString(payload.predicateVersion) || DEFAULT_PREDICATE,
      justifyingEvidenceDigests: asArray(payload.justifyingEvidenceDigests).map(cleanLower).filter(isSha256Hex),
      fromState: cleanString(transition.fromState) || 'captured',
      toState: 'tombstoned',
      sourcePeerEnvelope: safeObject(safeObject(env.sourcePlatform).sourcePeerEnvelope)
    };
  }

  function ownerKindFromHandoff(handoffPreview) {
    var owner = safeObject(safeObject(handoffPreview).owner);
    var handoffOwner = safeObject(safeObject(safeObject(handoffPreview).handoffRequest).owner);
    return cleanString(owner.ownerKind || owner.kind || handoffOwner.ownerKind || handoffOwner.kind).toLowerCase();
  }
  function validateHandoffPreview(handoffPreview, candidate, blockers, warnings) {
    var preview = safeObject(handoffPreview);
    var request = safeObject(preview.handoffRequest);
    var f5Handoff = safeObject(request.f5Handoff);
    if (!isObject(handoffPreview)) {
      addCode(blockers, 'handoff-preview-missing');
      return;
    }
    if (preview.ok !== true || preview.handoffReady !== true) addCode(blockers, 'handoff-preview-not-ready');
    if (cleanString(preview.operation) !== candidate.proposalOperation) addCode(blockers, 'handoff-operation-mismatch');
    if (cleanLower(preview.subjectId) !== candidate.subjectId) addCode(blockers, 'handoff-subjectId-mismatch');
    if (cleanLower(preview.lineageId) !== candidate.lineageId) addCode(blockers, 'handoff-lineageId-mismatch');
    if (cleanLower(preview.dedupeKey) !== candidate.proposalDedupeKey) addCode(blockers, 'handoff-dedupeKey-mismatch');
    if (ownerKindFromHandoff(preview) !== 'f5') addCode(blockers, 'handoff-owner-not-f5');
    if (request.operation && cleanString(request.operation) !== candidate.proposalOperation) addCode(blockers, 'handoff-request-operation-mismatch');
    if (request.subjectId && cleanLower(request.subjectId) !== candidate.subjectId) addCode(blockers, 'handoff-request-subjectId-mismatch');
    if (!isObject(request.f5Handoff)) {
      addCode(blockers, 'handoff-f5-metadata-missing');
    } else {
      if (f5Handoff.subjectId && cleanLower(f5Handoff.subjectId) !== candidate.subjectId) addCode(blockers, 'handoff-f5-subjectId-mismatch');
      if (f5Handoff.lineageId && cleanLower(f5Handoff.lineageId) !== candidate.lineageId) addCode(blockers, 'handoff-f5-lineageId-mismatch');
    }
    scanPrivacy(preview, blockers, warnings);
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
  function resultPreHash(operationResult, candidate) {
    var row = safeObject(operationResult);
    return cleanLower(row.preStateHash || safeObject(row.preState).hash || safeObject(row.auditMetadata).preStateHash || candidate.baseHash);
  }
  function resultPostHash(operationResult, candidate) {
    var row = safeObject(operationResult);
    return cleanLower(row.postStateHash || safeObject(row.postState).hash || safeObject(row.auditMetadata).postStateHash || candidate.targetHash);
  }
  function resultOperation(operationResult) {
    var row = safeObject(operationResult);
    return cleanString(row.operation || row.operationKind || row.applyOperation);
  }
  function resultAppliedAt(operationResult) {
    var row = safeObject(operationResult);
    return cleanString(row.appliedAtIso || row.completedAtIso || row.createdAtIso || row.deletedAtIso || row.deletedAt) || nowIsoSeconds();
  }
  function validateOperationResult(operationResult, candidate, blockers, warnings) {
    var row = safeObject(operationResult);
    validateSuccess(operationResult, blockers);
    var op = resultOperation(row);
    if (op && op !== candidate.proposalOperation && op !== candidate.applyOperation && op !== 'tombstone') {
      addCode(blockers, 'operation-result-operation-mismatch');
    }
    if (cleanString(row.subjectId) && cleanLower(row.subjectId) !== candidate.subjectId) addCode(blockers, 'operation-result-subjectId-mismatch');
    if (cleanString(row.lineageId) && cleanLower(row.lineageId) !== candidate.lineageId) addCode(blockers, 'operation-result-lineageId-mismatch');
    var preHash = resultPreHash(row, candidate);
    var postHash = resultPostHash(row, candidate);
    if (!isStateHash(preHash)) addCode(blockers, 'operation-result-preStateHash-invalid');
    if (!isStateHash(postHash)) addCode(blockers, 'operation-result-postStateHash-invalid');
    if (preHash !== candidate.baseHash) addCode(blockers, 'operation-result-baseHash-mismatch');
    if (postHash !== candidate.targetHash) addCode(blockers, 'operation-result-targetHash-mismatch');
    if (typeof row.tombstoned === 'boolean' && row.tombstoned !== true) addCode(blockers, 'operation-result-tombstone-target-mismatch');
    if (cleanString(row.lifecycleState) && cleanString(row.lifecycleState) !== 'tombstoned') addCode(blockers, 'operation-result-lifecycle-target-mismatch');
    scanPrivacy(row, blockers, warnings);
    codeList(row.warnings).forEach(function (code) { addCode(warnings, code); });
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
    return sha256Hex({ schema: RESULT_SCHEMA, purpose: 'transactionId', operationId: operationIdValue });
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
  async function buildIdentity(candidate, actorPeer, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (!kernel ||
        typeof kernel.generateSubjectId !== 'function' ||
        typeof kernel.generateDedupeKey !== 'function' ||
        typeof kernel.generateLineageId !== 'function') {
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
    return { subjectId: subjectId, lineageId: candidate.lineageId, dedupeKey: dedupeKey };
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
  function canonicalLifecycleState(value) {
    var state = cleanLower(value);
    if (state === 'captured' || state === 'live') return 'active';
    if (state === 'deleted' || state === 'removed') return 'tombstoned';
    return state || 'unknown';
  }
  function shapeWithKernel(method, fallback, warnings, warningCode) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (!kernel || typeof kernel[method] !== 'function') return fallback;
    try {
      return kernel[method](fallback);
    } catch (_) {
      addCode(warnings, warningCode);
      return fallback;
    }
  }
  function buildLifecycleShapes(candidate, identity, actorPeer, eventDigest, appliedAt, warnings) {
    var fromState = canonicalLifecycleState(candidate.fromState || 'captured');
    var toState = 'retained';
    var transition = shapeWithKernel('shapeLifecycleTransition', {
      domain: 'snapshot',
      subjectType: SUBJECT_TYPE,
      subjectId: identity.subjectId,
      transitionName: candidate.applyOperation,
      fromState: fromState,
      toState: toState,
      lineageId: identity.lineageId,
      eventDigest: eventDigest,
      dedupeKey: identity.dedupeKey,
      actorPeer: actorPeer,
      reasonCode: 'snapshot-tombstone-applyEvent-receipt',
      transitionedAtIso: appliedAt,
      metadata: {
        proposalOperation: candidate.proposalOperation,
        legacyTargetState: 'tombstoned',
        receiptOnly: true
      }
    }, warnings, 'lifecycle-transition-shape-threw');
    var state = shapeWithKernel('shapeLifecycleState', {
      domain: 'snapshot',
      subjectType: SUBJECT_TYPE,
      subjectId: identity.subjectId,
      state: toState,
      lineageId: identity.lineageId,
      eventDigest: eventDigest,
      dedupeKey: identity.dedupeKey,
      ownerKind: 'f5',
      enteredAtIso: appliedAt,
      metadata: {
        sourceState: fromState,
        legacyTargetState: 'tombstoned',
        receiptOnly: true
      }
    }, warnings, 'lifecycle-state-shape-threw');
    return { lifecycleState: state, lifecycleTransition: transition };
  }
  function validateReplay(candidate, identity, actorPeer, preHash, postHash, f5Evidence, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (!kernel || typeof kernel.composeReplayDefense !== 'function') {
      addCode(warnings, 'replay-composer-unavailable');
      return null;
    }
    var replay = null;
    try {
      replay = kernel.composeReplayDefense({
        candidate: {
          subjectType: SUBJECT_TYPE,
          subjectId: identity.subjectId,
          operation: candidate.applyOperation,
          operationKind: 'snapshot.tombstone.applyEvent',
          operationIntent: OPERATION_INTENT,
          baseHash: preHash,
          targetHash: postHash,
          revisionHash: postHash,
          lineageId: identity.lineageId,
          dedupeKey: identity.dedupeKey,
          actorPeer: actorPeer,
          tombstone: f5Evidence,
          originTag: {
            originKind: 'f5-owner-handoff-result',
            sourcePeerId: actorPeer.syncPeerIdHash,
            sourcePlatform: 'desktop-tauri',
            envelopeKind: KIND_APPLY_EVENT,
            operationKind: 'snapshot.tombstone.applyEvent',
            lineageId: identity.lineageId,
            dedupeKey: identity.dedupeKey
          }
        },
        identityInput: {
          subjectType: SUBJECT_TYPE,
          subjectId: identity.subjectId,
          operation: candidate.applyOperation,
          baseHash: preHash,
          actorPeer: actorPeer
        }
      }, { requireIdentity: true });
    } catch (_) {
      addCode(warnings, 'replay-composer-threw');
      return null;
    }
    codeList(replay && replay.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(replay && replay.warnings).forEach(function (code) { addCode(warnings, code); });
    return replay;
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
        allowedDomains: ['snapshot'],
        requireAuditId: true,
        requireSubject: true,
        requireLineage: true,
        requireActorPeer: true,
        requireTimestamp: true,
        requireTransactionId: true,
        privacyPolicy: {
          subjectType: SUBJECT_TYPE,
          redactionClass: REDACTED,
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
  function rawF5Evidence(operationResult) {
    var row = safeObject(operationResult);
    var source = row.f5Evidence || row.f5Record || row.tombstoneEvidence || row.tombstoneRecord;
    if (isObject(source)) return source;
    return null;
  }
  function shapeF5Evidence(operationResult, candidate, actorPeer, appliedAt, blockers, warnings) {
    var raw = rawF5Evidence(operationResult);
    if (!raw) {
      addCode(blockers, 'f5-evidence-missing');
      return null;
    }
    var row = safeObject(raw);
    var tombstone = {
      tombstoneId: cleanString(row.tombstoneId || row.tombstone_id),
      recordKind: cleanString(row.recordKind || row.record_kind) || 'snapshot',
      recordId: cleanString(row.recordId || row.record_id) || candidate.subjectId,
      subjectId: cleanLower(row.subjectId || candidate.subjectId),
      deletedAt: cleanString(row.deletedAt || row.deleted_at || row.appliedAtIso || appliedAt),
      deletedBySyncPeerId: cleanString(row.deletedBySyncPeerId || row.deleted_by_sync_peer_id || actorPeer.syncPeerIdHash),
      deleteReason: cleanString(row.deleteReason || row.delete_reason) || 'snapshot-tombstone-applyEvent-receipt',
      priorDigest: cleanLower(row.priorDigest || row.prior_digest || candidate.baseHash),
      priorUpdatedAt: cleanString(row.priorUpdatedAt || row.prior_updated_at),
      sourceExportId: cleanString(row.sourceExportId || row.source_export_id),
      sourceSequenceNumber: row.sourceSequenceNumber || row.source_sequence_number || null,
      cascadeFrom: cleanString(row.cascadeFrom || row.cascade_from),
      restoredAt: cleanString(row.restoredAt || row.restored_at),
      restoredBySyncPeerId: cleanString(row.restoredBySyncPeerId || row.restored_by_sync_peer_id),
      createdAt: cleanString(row.createdAt || row.created_at) || appliedAt,
      updatedAt: cleanString(row.updatedAt || row.updated_at) || appliedAt
    };
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.validateTombstone === 'function') {
      try {
        var validation = kernel.validateTombstone(tombstone);
        codeList(validation && validation.blockers).forEach(function (code) { addCode(blockers, code); });
        codeList(validation && validation.warnings).forEach(function (code) { addCode(warnings, code); });
        tombstone = safeObject(validation && validation.tombstone) || tombstone;
        if (typeof kernel.isTombstoned === 'function' && !kernel.isTombstoned(tombstone)) {
          addCode(blockers, 'f5-evidence-not-tombstoned');
        }
      } catch (_) {
        addCode(blockers, 'f5-evidence-validation-threw');
      }
    } else {
      addCode(warnings, 'tombstone-reader-unavailable');
    }
    if (!cleanString(tombstone.tombstoneId)) addCode(blockers, 'f5-evidence-tombstoneId-missing');
    if (cleanLower(tombstone.subjectId) !== candidate.subjectId) addCode(blockers, 'f5-evidence-subjectId-mismatch');
    if (cleanString(tombstone.recordKind) !== 'snapshot') addCode(blockers, 'f5-evidence-recordKind-invalid');
    if (cleanLower(tombstone.priorDigest) !== candidate.baseHash) addCode(blockers, 'f5-evidence-priorDigest-mismatch');

    var kernelTombstone = shapeWithKernel('shapeTombstone', tombstone, warnings, 'tombstone-shape-threw');
    var preview = {
      schema: F5_EVIDENCE_PREVIEW_SCHEMA,
      previewOnly: true,
      tombstoneId: cleanString(tombstone.tombstoneId),
      subjectId: candidate.subjectId,
      recordKind: 'snapshot',
      deletedAt: cleanString(tombstone.deletedAt),
      deletedBySyncPeerId: cleanString(tombstone.deletedBySyncPeerId),
      deleteReason: cleanString(tombstone.deleteReason),
      priorDigest: candidate.baseHash,
      kernelTombstone: kernelTombstone,
      evidenceValid: blockers.indexOf('f5-evidence-missing') === -1 &&
        blockers.indexOf('f5-evidence-not-tombstoned') === -1 &&
        blockers.indexOf('f5-evidence-tombstoneId-missing') === -1 &&
        blockers.indexOf('f5-evidence-subjectId-mismatch') === -1 &&
        blockers.indexOf('f5-evidence-recordKind-invalid') === -1 &&
        blockers.indexOf('f5-evidence-priorDigest-mismatch') === -1
    };
    scanPrivacy(preview, blockers, warnings);
    return preview;
  }
  function proposedConsumedOperation(candidate, identity, actorPeer, eventDigest, appliedAt, validationSummary) {
    var row = {
      schema: CONSUMED_PREVIEW_SCHEMA,
      consumedId: '',
      eventDigest: eventDigest,
      dedupeKey: identity.dedupeKey,
      lineageId: identity.lineageId,
      subjectId: identity.subjectId,
      sourcePeerId: actorPeer.syncPeerIdHash,
      envelopeKind: KIND_APPLY_EVENT,
      operationKind: 'snapshot.tombstone.applyEvent',
      consumedStatus: 'consumed',
      consumedAtIso: appliedAt,
      actorPeer: actorPeer,
      originTag: {
        originKind: 'f5-owner-handoff-result',
        sourcePeerId: actorPeer.syncPeerIdHash,
        sourcePlatform: 'desktop-tauri',
        envelopeKind: KIND_APPLY_EVENT,
        operationKind: 'snapshot.tombstone.applyEvent',
        lineageId: identity.lineageId,
        eventDigest: eventDigest,
        dedupeKey: identity.dedupeKey
      },
      reason: 'snapshot tombstone applyEvent receipt generated',
      validationSummary: {
        ok: true,
        checkedAtIso: appliedAt,
        blockers: [],
        warnings: codeList(validationSummary && validationSummary.warnings)
      }
    };
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.shapeOriginTag === 'function') {
      try { row.originTag = kernel.shapeOriginTag(Object.assign({}, row.originTag, { originKind: KIND_APPLY_EVENT })); }
      catch (_) { /* keep local shape */ }
    }
    if (kernel && typeof kernel.shapeConsumedOperation === 'function') {
      try {
        row = Object.assign({}, kernel.shapeConsumedOperation(row), {
          schema: CONSUMED_PREVIEW_SCHEMA,
          previewOnly: true
        });
      } catch (_) { /* keep local shape */ }
    }
    if (kernel && typeof kernel.validateConsumedOperation === 'function') {
      try {
        var validation = kernel.validateConsumedOperation(row);
        return Object.assign({}, safeObject(validation.consumedOperation), {
          schema: CONSUMED_PREVIEW_SCHEMA,
          previewOnly: true,
          blockers: codeList(validation.blockers),
          warnings: codeList(validation.warnings)
        });
      } catch (_) { /* fall through */ }
    }
    return Object.assign({}, row, { previewOnly: true });
  }
  function proposedWatermarkTarget(identity, actorPeer, postHash, appliedAt, blockers, warnings) {
    var watermark = {
      schema: WATERMARK_PREVIEW_SCHEMA,
      watermarkId: '',
      peerId: actorPeer.syncPeerIdHash,
      subjectId: identity.subjectId,
      lineageId: identity.lineageId,
      revisionHash: postHash,
      watermarkAtIso: appliedAt,
      recordedAtIso: appliedAt,
      dedupeKey: identity.dedupeKey
    };
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.shapeWatermark === 'function') {
      try { watermark = Object.assign({}, kernel.shapeWatermark(watermark), { schema: WATERMARK_PREVIEW_SCHEMA }); }
      catch (_) { addCode(warnings, 'watermark-shape-threw'); }
    }
    if (kernel && typeof kernel.validateWatermarkValue === 'function') {
      try {
        var validation = kernel.validateWatermarkValue(watermark, 'proposed');
        codeList(validation && validation.blockers).forEach(function (code) { addCode(blockers, code); });
        codeList(validation && validation.warnings).forEach(function (code) { addCode(warnings, code); });
        var watermarkState = null;
        if (kernel && typeof kernel.shapeWatermarkState === 'function') {
          try { watermarkState = kernel.shapeWatermarkState({ proposedWatermark: validation.watermark || watermark, allowIdempotent: true }); }
          catch (_) { addCode(warnings, 'watermark-state-shape-threw'); }
        }
        return Object.assign({}, safeObject(validation && validation.watermark), {
          schema: WATERMARK_PREVIEW_SCHEMA,
          previewOnly: true,
          watermarkState: watermarkState
        });
      } catch (_) {
        addCode(warnings, 'watermark-validation-threw');
      }
    } else {
      addCode(warnings, 'watermark-service-unavailable');
    }
    return Object.assign({}, watermark, { previewOnly: true });
  }
  function failure(blockers, warnings) {
    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: false,
      applyEvent: null,
      auditMetadata: null,
      auditRecord: null,
      f5Evidence: null,
      proposedF5Record: null,
      proposedConsumedOperation: null,
      proposedWatermarkTarget: null,
      f5ReviewIngested: false,
      f5ReviewId: null,
      blockers: codeList(blockers),
      warnings: codeList(warnings)
    };
  }

  // F14.5.5.2 — wire-through from the receipt's f5Handoff to the F14.5.5.1
  // F5 review queue. Best-effort: any failure surfaces as a warning and the
  // receipt itself remains successful. Never reshapes the f5Handoff envelope.
  async function ingestIntoF5ReviewQueue(parts, warnings) {
    var sync = (H2O && H2O.Desktop && H2O.Desktop.Sync) || {};
    if (!sync.__snapshotF5ReviewQueueInstalled
        || typeof sync.ingestF5Review !== 'function') {
      addCode(warnings, 'f5-review-queue-unavailable');
      return { f5ReviewIngested: false, f5ReviewId: null };
    }
    if (!isObject(parts.f5Handoff)) {
      addCode(warnings, 'f5-review-queue-handoff-envelope-missing');
      return { f5ReviewIngested: false, f5ReviewId: null };
    }
    if (!isSha256Hex(parts.originAccountIdHash)) {
      addCode(warnings, 'f5-review-queue-originAccountIdHash-missing');
      return { f5ReviewIngested: false, f5ReviewId: null };
    }
    if (!isObject(parts.actorPeer)
        || !isSha256Hex(safeObject(parts.actorPeer).syncPeerIdHash)) {
      addCode(warnings, 'f5-review-queue-actorPeer-invalid');
      return { f5ReviewIngested: false, f5ReviewId: null };
    }
    if (!isSha256Hex(parts.snapshotBookkeepingPointer)) {
      addCode(warnings, 'f5-review-queue-snapshotBookkeepingPointer-invalid');
      return { f5ReviewIngested: false, f5ReviewId: null };
    }
    var ingest;
    try {
      ingest = await sync.ingestF5Review({
        f5Handoff: parts.f5Handoff,
        originAccountIdHash: parts.originAccountIdHash,
        actorPeer: parts.actorPeer,
        snapshotBookkeepingPointer: parts.snapshotBookkeepingPointer,
        observedAtIso: parts.observedAtIso,
        retentionStartedAtIso: parts.observedAtIso
      });
    } catch (_) {
      addCode(warnings, 'f5-review-ingest-threw');
      return { f5ReviewIngested: false, f5ReviewId: null };
    }
    if (ingest && ingest.ok === true && cleanString(ingest.reviewId)) {
      return { f5ReviewIngested: true, f5ReviewId: cleanString(ingest.reviewId) };
    }
    // Ingest blocked (e.g. f5-review-open-duplicate from a race-on-resubmit,
    // privacy violation, malformed envelope, etc.). Surface as warnings;
    // the receipt itself remains successful per F14.5.5.2 contract.
    var prefix = 'f5-review-ingest-blocked:';
    codeList(ingest && ingest.blockers).forEach(function (code) {
      addCode(warnings, prefix + code);
    });
    codeList(ingest && ingest.warnings).forEach(function (code) {
      addCode(warnings, 'f5-review-ingest-warning:' + code);
    });
    if (!codeList(ingest && ingest.blockers).length
        && !codeList(ingest && ingest.warnings).length) {
      addCode(warnings, 'f5-review-ingest-unknown-failure');
    }
    return { f5ReviewIngested: false, f5ReviewId: null };
  }

  async function buildSnapshotTombstoneApplyEventReceipt(input) {
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

    var actorPeer = sourcePeerFromInputs(envelope, args.handoffPreview, args.operationResult);
    if (!validatePeer(actorPeer)) addCode(blockers, 'invalid-peer-identity');
    var preHash = resultPreHash(args.operationResult, candidate);
    var postHash = resultPostHash(args.operationResult, candidate);
    var identity = await buildIdentity(candidate, actorPeer, blockers, warnings);
    var appliedAt = resultAppliedAt(args.operationResult);
    var f5Evidence = shapeF5Evidence(args.operationResult, candidate, actorPeer, appliedAt, blockers, warnings);
    scanPrivacy(args, blockers, warnings);
    if (blockers.length || !identity || !f5Evidence) return failure(blockers, warnings);

    validateReplay(candidate, identity, actorPeer, preHash, postHash, f5Evidence, blockers, warnings);
    if (blockers.length) return failure(blockers, warnings);

    var opId = await operationId(args.operationResult, candidate, preHash, postHash);
    var txnId = await transactionId(args.operationResult, opId);
    var auditId = await auditMaintenanceId(args.operationResult, candidate, opId, txnId);
    if (!isIso(appliedAt)) addCode(blockers, 'appliedAtIso-invalid');
    if (!opId) addCode(blockers, 'operationId-required');
    if (!txnId) addCode(blockers, 'transactionId-required');
    if (!auditId) addCode(blockers, 'auditMaintenanceId-required');
    if (blockers.length) return failure(blockers, warnings);

    var lifecycleShapes = buildLifecycleShapes(candidate, identity, actorPeer, '', appliedAt, warnings);
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
      preState: {
        hash: preHash,
        lifecycleState: candidate.fromState || 'captured'
      },
      postState: {
        hash: postHash,
        lifecycleState: 'tombstoned'
      },
      lifecycleTransition: {
        fromState: candidate.fromState || 'captured',
        toState: 'tombstoned'
      },
      kernelLifecycleState: lifecycleShapes.lifecycleState,
      kernelLifecycleTransition: lifecycleShapes.lifecycleTransition,
      actorPeer: actorPeer,
      owner: ownerSummary(args.handoffPreview),
      f5Evidence: f5Evidence,
      appliedAtIso: appliedAt,
      predicateVersion: candidate.predicateVersion,
      transactionId: txnId,
      proposalEnvelopeId: candidate.proposalEnvelopeId,
      proposalEventDigest: candidate.proposalEventDigest,
      proposalDedupeKey: candidate.proposalDedupeKey,
      justifyingEvidenceDigests: candidate.justifyingEvidenceDigests.slice(),
      tombstoned: true,
      result: 'applied',
      receiptOnly: true
    };
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
      domain: 'snapshot',
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
        f5Owned: true,
        proposalOperation: candidate.proposalOperation,
        proposalEventDigest: candidate.proposalEventDigest,
        tombstoneId: f5Evidence.tombstoneId
      }
    };
    auditMetadata = validateAuditMetadata(auditMetadata, blockers, warnings);
    var auditRecord = shapeWithKernel('shapeAuditRecord', Object.assign({
      preStateHash: preHash,
      postStateHash: postHash,
      auditResult: 'success',
      auditAtIso: appliedAt,
      validationSummary: { ok: true, blockers: [], warnings: codeList(warnings) }
    }, auditMetadata), warnings, 'audit-record-shape-threw');
    var consumedPreview = proposedConsumedOperation(candidate, identity, actorPeer, eventDigest, appliedAt, {
      warnings: warnings
    });
    var watermarkPreview = proposedWatermarkTarget(identity, actorPeer, postHash, appliedAt, blockers, warnings);

    scanPrivacy(applyEvent, blockers, warnings);
    scanPrivacy(auditMetadata, blockers, warnings);
    scanPrivacy(auditRecord, blockers, warnings);
    scanPrivacy(f5Evidence, blockers, warnings);
    scanPrivacy(consumedPreview, blockers, warnings);
    scanPrivacy(watermarkPreview, blockers, warnings);
    if (blockers.length) return failure(blockers, warnings);

    // F14.5.5.2 — forward the receipt's f5Handoff envelope (verbatim) to
    // the F5 review queue. The receipt itself is already successful at this
    // point; the wire-through is best-effort and only contributes warnings.
    var f5HandoffEnvelope = safeObject(safeObject(args.handoffPreview).handoffRequest).f5Handoff;
    var originAccountIdHash = cleanLower(
      args.originAccountIdHash
        || args.localAccountIdHash
        || safeObject(envelope.payload).originAccountIdHash
        || safeObject(envelope.payload).localAccountIdHash
    );
    var ingestOutcome = await ingestIntoF5ReviewQueue({
      f5Handoff: f5HandoffEnvelope,
      originAccountIdHash: originAccountIdHash,
      actorPeer: actorPeer,
      snapshotBookkeepingPointer: eventDigest,
      observedAtIso: appliedAt
    }, warnings);

    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: true,
      applyEvent: applyEvent,
      auditMetadata: auditMetadata,
      auditRecord: auditRecord,
      lifecycleState: lifecycleShapes.lifecycleState,
      lifecycleTransition: lifecycleShapes.lifecycleTransition,
      f5Evidence: f5Evidence,
      proposedF5Record: f5Evidence,
      proposedConsumedOperation: consumedPreview,
      proposedWatermarkTarget: watermarkPreview,
      f5ReviewIngested: ingestOutcome.f5ReviewIngested,
      f5ReviewId: ingestOutcome.f5ReviewId,
      blockers: [],
      warnings: codeList(warnings)
    };
  }

  H2O.Desktop.Sync.buildSnapshotTombstoneApplyEventReceipt = buildSnapshotTombstoneApplyEventReceipt;
  H2O.Desktop.Sync.__snapshotTombstoneApplyEventInstalled = true;
  H2O.Desktop.Sync.__snapshotTombstoneApplyEventVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
