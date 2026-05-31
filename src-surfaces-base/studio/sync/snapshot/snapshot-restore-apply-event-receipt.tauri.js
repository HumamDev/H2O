/* H2O Desktop Sync - F14.4.8c snapshot restore applyEvent receipt builder
 *
 * Receipt-only builder for successful hypothetical Native-owned snapshot
 * restore operations. Tombstone restores additionally carry redacted F5
 * restore/clear evidence previews. This module never executes Native/F5,
 * applies, publishes, enqueues relay outbox rows, advances watermarks, records
 * consumed operations, or mutates storage.
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
  if (H2O.Desktop.Sync.__snapshotRestoreApplyEventInstalled) return;

  var VERSION = '0.1.0-f14.4.8c';
  var RESULT_SCHEMA = 'h2o.desktop.sync.snapshot-restore-apply-event-receipt.v1';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var F5_RESTORE_PREVIEW_SCHEMA = 'h2o.desktop.sync.snapshot-restore-f5-clear-evidence-preview.v1';
  var CONSUMED_PREVIEW_SCHEMA = 'h2o.desktop.sync.snapshot-restore-consumed-operation-preview.v1';
  var WATERMARK_PREVIEW_SCHEMA = 'h2o.desktop.sync.snapshot-restore-watermark-target-preview.v1';
  var SUBJECT_TYPE = 'snapshot.conversation';
  var KIND_PROPOSAL = 'proposal';
  var KIND_APPLY_EVENT = 'applyEvent';
  var OP_RESTORE_PROPOSED = 'snapshot-lifecycle-restore-proposed';
  var OP_RESTORE_APPLIED = 'snapshot-lifecycle-restore-applied';
  var OPERATION_INTENT = 'update';
  var REDACTED = 'redacted';
  var CAPABILITY_TAG = 'h2o.platform.capabilities.v1#f14.4.8c-desktop-snapshot-restore-apply-event-v1';
  var DEFAULT_PREDICATE = 'h2o.snapshot.restore.predicate.v1';
  var AUDIT_POLICY_VERSION = 'h2o.snapshot.native-owner-restore-receipt.v1';
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
    var fromState = cleanString(transition.fromState);

    if (!isObject(envelope)) {
      addCode(blockers, 'proposal-candidate-missing');
      return null;
    }
    if (env.schema !== ENVELOPE_SCHEMA) addCode(blockers, 'proposal-envelope-schema-invalid');
    if (env.kind !== KIND_PROPOSAL) addCode(blockers, 'proposal-kind-invalid');
    if (env.subjectType !== SUBJECT_TYPE) addCode(blockers, 'proposal-subjectType-invalid');
    if (env.operationIntent !== OPERATION_INTENT) addCode(blockers, 'proposal-operationIntent-invalid');
    if (env.operation !== OP_RESTORE_PROPOSED) addCode(blockers, 'proposal-operation-not-restore');
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
    if (cleanString(transition.toState) !== 'captured') addCode(blockers, 'proposal-restore-target-invalid');
    if (fromState !== 'archived' && fromState !== 'tombstoned') addCode(blockers, 'proposal-restore-source-invalid');
    if (expected.lifecycleState !== 'captured') addCode(blockers, 'proposal-expectedPostState-lifecycle-invalid');
    if (row) {
      if (cleanString(row.status) && cleanString(row.status) !== 'generated') addCode(blockers, 'proposal-row-status-invalid');
      if (cleanString(row.eventDigest) && cleanLower(row.eventDigest) !== cleanLower(env.eventDigest)) addCode(blockers, 'proposal-row-eventDigest-mismatch');
      if (cleanString(row.dedupeKey) && cleanLower(row.dedupeKey) !== cleanLower(env.dedupeKey)) addCode(blockers, 'proposal-row-dedupeKey-mismatch');
      var rowLifecycle = cleanString(safeObject(row.canonicalSnapshotSummary).lifecycleState);
      if (rowLifecycle && rowLifecycle !== fromState) addCode(blockers, 'proposal-row-lifecycle-mismatch');
    }

    var expectedPayloadHash = await sha256Hex(payload);
    if (isSha256Hex(expectedPayloadHash) && expectedPayloadHash !== cleanLower(env.payloadHash)) addCode(blockers, 'proposal-payloadHash-mismatch');
    var expectedEventDigest = await sha256Hex(envelopeForEventDigest(env));
    if (isSha256Hex(expectedEventDigest) && expectedEventDigest !== cleanLower(env.eventDigest)) addCode(blockers, 'proposal-eventDigest-mismatch');
    scanPrivacy(env, blockers, warnings);
    if (row) scanPrivacy(row, blockers, warnings);

    return {
      proposalOperation: env.operation,
      applyOperation: OP_RESTORE_APPLIED,
      subjectId: cleanLower(env.subjectId),
      lineageId: cleanLower(env.lineageId),
      proposalDedupeKey: cleanLower(env.dedupeKey),
      proposalEventDigest: cleanLower(env.eventDigest),
      proposalEnvelopeId: cleanString(env.id),
      baseHash: cleanLower(proposed.baseHash),
      targetHash: cleanLower(proposed.targetHash || expected.expectedPostStateHash),
      predicateVersion: cleanString(payload.predicateVersion) || DEFAULT_PREDICATE,
      justifyingEvidenceDigests: asArray(payload.justifyingEvidenceDigests).map(cleanLower).filter(isSha256Hex),
      fromState: fromState,
      toState: 'captured',
      restoreFromArchive: fromState === 'archived',
      restoreFromTombstone: fromState === 'tombstoned',
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
    var f5Evidence = safeObject(request.f5TombstoneEvidence);
    if (!isObject(handoffPreview)) {
      addCode(blockers, 'handoff-preview-missing');
      return;
    }
    if (preview.ok !== true || preview.handoffReady !== true) addCode(blockers, 'handoff-preview-not-ready');
    if (cleanString(preview.operation) !== candidate.proposalOperation) addCode(blockers, 'handoff-operation-mismatch');
    if (cleanLower(preview.subjectId) !== candidate.subjectId) addCode(blockers, 'handoff-subjectId-mismatch');
    if (cleanLower(preview.lineageId) !== candidate.lineageId) addCode(blockers, 'handoff-lineageId-mismatch');
    if (cleanLower(preview.dedupeKey) !== candidate.proposalDedupeKey) addCode(blockers, 'handoff-dedupeKey-mismatch');
    if (cleanString(preview.restoreSource) && cleanString(preview.restoreSource) !== candidate.fromState) addCode(blockers, 'handoff-restoreSource-mismatch');
    if (ownerKindFromHandoff(preview) !== 'native') addCode(blockers, 'handoff-owner-not-native');
    if (request.operation && cleanString(request.operation) !== candidate.proposalOperation) addCode(blockers, 'handoff-request-operation-mismatch');
    if (request.subjectId && cleanLower(request.subjectId) !== candidate.subjectId) addCode(blockers, 'handoff-request-subjectId-mismatch');
    if (candidate.restoreFromTombstone) {
      if (!isObject(request.f5TombstoneEvidence)) {
        addCode(blockers, 'handoff-f5-tombstone-evidence-missing');
      } else if (f5Evidence.subjectId && cleanLower(f5Evidence.subjectId) !== candidate.subjectId) {
        addCode(blockers, 'handoff-f5-tombstone-evidence-subjectId-mismatch');
      }
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
    return cleanString(row.appliedAtIso || row.completedAtIso || row.createdAtIso || row.restoredAtIso || row.restoredAt) || nowIsoSeconds();
  }
  function validateOperationResult(operationResult, candidate, blockers, warnings) {
    var row = safeObject(operationResult);
    validateSuccess(operationResult, blockers);
    var op = resultOperation(row);
    if (op && op !== candidate.proposalOperation && op !== candidate.applyOperation && op !== 'restore') {
      addCode(blockers, 'operation-result-operation-mismatch');
    }
    if (cleanString(row.subjectId) && cleanLower(row.subjectId) !== candidate.subjectId) addCode(blockers, 'operation-result-subjectId-mismatch');
    if (cleanString(row.lineageId) && cleanLower(row.lineageId) !== candidate.lineageId) addCode(blockers, 'operation-result-lineageId-mismatch');
    if (cleanString(row.restoreSource) && cleanString(row.restoreSource) !== candidate.fromState) addCode(blockers, 'operation-result-restoreSource-mismatch');
    var preHash = resultPreHash(row, candidate);
    var postHash = resultPostHash(row, candidate);
    if (!isStateHash(preHash)) addCode(blockers, 'operation-result-preStateHash-invalid');
    if (!isStateHash(postHash)) addCode(blockers, 'operation-result-postStateHash-invalid');
    if (preHash !== candidate.baseHash) addCode(blockers, 'operation-result-baseHash-mismatch');
    if (postHash !== candidate.targetHash) addCode(blockers, 'operation-result-targetHash-mismatch');
    if (typeof row.restored === 'boolean' && row.restored !== true) addCode(blockers, 'operation-result-restore-target-mismatch');
    if (cleanString(row.lifecycleState) && cleanString(row.lifecycleState) !== 'captured') addCode(blockers, 'operation-result-lifecycle-target-mismatch');
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
  function canonicalLifecycleState(value, mode) {
    var state = cleanLower(value);
    if (state === 'captured' || state === 'live') return 'active';
    if (state === 'deleted' || state === 'removed') return 'tombstoned';
    if (state === 'tombstoned' && mode === 'restorable') return 'retained';
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
    var fromState = canonicalLifecycleState(candidate.fromState, candidate.restoreFromTombstone ? 'restorable' : '');
    var toState = 'active';
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
      reasonCode: 'snapshot-restore-applyEvent-receipt',
      transitionedAtIso: appliedAt,
      metadata: {
        proposalOperation: candidate.proposalOperation,
        legacySourceState: candidate.fromState,
        legacyTargetState: 'captured',
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
      ownerKind: 'native',
      enteredAtIso: appliedAt,
      metadata: {
        sourceState: fromState,
        legacySourceState: candidate.fromState,
        legacyTargetState: 'captured',
        receiptOnly: true
      }
    }, warnings, 'lifecycle-state-shape-threw');
    return { lifecycleState: state, lifecycleTransition: transition };
  }
  function validateReplay(candidate, identity, actorPeer, preHash, postHash, f5RestoreEvidence, blockers, warnings) {
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
          operationKind: 'snapshot.restore.applyEvent',
          operationIntent: OPERATION_INTENT,
          baseHash: preHash,
          targetHash: postHash,
          revisionHash: postHash,
          lineageId: identity.lineageId,
          dedupeKey: identity.dedupeKey,
          actorPeer: actorPeer,
          tombstone: f5RestoreEvidence || null,
          originTag: {
            originKind: candidate.restoreFromTombstone ? 'native-f5-owner-handoff-result' : 'native-owner-handoff-result',
            sourcePeerId: actorPeer.syncPeerIdHash,
            sourcePlatform: 'desktop-tauri',
            envelopeKind: KIND_APPLY_EVENT,
            operationKind: 'snapshot.restore.applyEvent',
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
  function rawF5RestoreEvidence(operationResult) {
    var row = safeObject(operationResult);
    var source = row.f5RestoreEvidence ||
      row.f5ClearEvidence ||
      row.tombstoneRestoreEvidence ||
      row.tombstoneClearEvidence ||
      row.restoredTombstoneEvidence ||
      row.f5Evidence;
    return isObject(source) ? source : null;
  }
  function handoffTombstoneEvidence(handoffPreview) {
    return safeObject(safeObject(safeObject(handoffPreview).handoffRequest).f5TombstoneEvidence);
  }
  function shapeF5RestoreEvidence(operationResult, handoffPreview, candidate, actorPeer, appliedAt, blockers, warnings) {
    if (!candidate.restoreFromTombstone) return null;
    var raw = rawF5RestoreEvidence(operationResult);
    if (!raw) {
      addCode(blockers, 'f5-restore-evidence-missing');
      return null;
    }
    var handoffEvidence = handoffTombstoneEvidence(handoffPreview);
    var row = safeObject(raw);
    var subjectId = cleanLower(row.subjectId || handoffEvidence.subjectId || candidate.subjectId);
    var tombstoneId = cleanString(row.tombstoneId || row.tombstone_id || handoffEvidence.tombstoneId);
    var restoredAt = cleanString(row.restoredAt || row.restored_at || row.clearedAt || row.cleared_at || row.appliedAtIso || appliedAt);
    var restoredBy = cleanString(row.restoredBySyncPeerId || row.restored_by_sync_peer_id || row.clearedBySyncPeerId || row.cleared_by_sync_peer_id || actorPeer.syncPeerIdHash);
    var priorDigest = cleanLower(row.priorDigest || row.prior_digest || handoffEvidence.priorDigest || candidate.baseHash);
    var deletedAt = cleanString(row.deletedAt || row.deleted_at || handoffEvidence.deletedAt);

    if (!tombstoneId) addCode(blockers, 'f5-restore-evidence-tombstoneId-missing');
    if (subjectId !== candidate.subjectId) addCode(blockers, 'f5-restore-evidence-subjectId-mismatch');
    if (!isIso(restoredAt)) addCode(blockers, 'f5-restore-evidence-restoredAt-invalid');
    if (!restoredBy) addCode(blockers, 'f5-restore-evidence-restoredBy-missing');
    if (priorDigest && priorDigest !== candidate.baseHash) addCode(blockers, 'f5-restore-evidence-priorDigest-mismatch');

    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.validateTombstone === 'function' && deletedAt) {
      try {
        var validation = kernel.validateTombstone({
          tombstoneId: tombstoneId,
          recordKind: cleanString(row.recordKind || row.record_kind || handoffEvidence.recordKind) || 'snapshot',
          recordId: cleanString(row.recordId || row.record_id || candidate.subjectId),
          subjectId: subjectId,
          deletedAt: deletedAt,
          deletedBySyncPeerId: cleanString(row.deletedBySyncPeerId || row.deleted_by_sync_peer_id || actorPeer.syncPeerIdHash),
          deleteReason: cleanString(row.deleteReason || row.delete_reason) || 'snapshot-restore-applyEvent-receipt',
          priorDigest: priorDigest || candidate.baseHash,
          restoredAt: restoredAt,
          restoredBySyncPeerId: restoredBy,
          createdAt: cleanString(row.createdAt || row.created_at || deletedAt),
          updatedAt: cleanString(row.updatedAt || row.updated_at || restoredAt)
        });
        codeList(validation && validation.blockers).forEach(function (code) { addCode(blockers, code); });
        codeList(validation && validation.warnings).forEach(function (code) { addCode(warnings, code); });
        if (typeof kernel.isRestoredTombstone === 'function' && !kernel.isRestoredTombstone(safeObject(validation && validation.tombstone))) {
          addCode(blockers, 'f5-restore-evidence-not-restored');
        }
      } catch (_) {
        addCode(warnings, 'f5-restore-evidence-validation-threw');
      }
    } else if (!deletedAt) {
      addCode(warnings, 'f5-restore-evidence-original-deletedAt-not-provided');
    }

    var kernelTombstone = shapeWithKernel('shapeTombstone', {
      tombstoneId: tombstoneId,
      recordKind: cleanString(row.recordKind || row.record_kind || handoffEvidence.recordKind) || 'snapshot',
      recordId: cleanString(row.recordId || row.record_id || candidate.subjectId),
      subjectId: subjectId,
      deletedAt: deletedAt,
      deletedBySyncPeerId: cleanString(row.deletedBySyncPeerId || row.deleted_by_sync_peer_id || actorPeer.syncPeerIdHash),
      deleteReason: cleanString(row.deleteReason || row.delete_reason) || 'snapshot-restore-applyEvent-receipt',
      priorDigest: priorDigest || candidate.baseHash,
      restoredAt: restoredAt,
      restoredBySyncPeerId: restoredBy,
      createdAt: cleanString(row.createdAt || row.created_at || deletedAt),
      updatedAt: cleanString(row.updatedAt || row.updated_at || restoredAt)
    }, warnings, 'tombstone-shape-threw');
    var preview = {
      schema: F5_RESTORE_PREVIEW_SCHEMA,
      previewOnly: true,
      clearAction: 'snapshot-tombstone-restore-clear',
      tombstoneId: tombstoneId,
      subjectId: candidate.subjectId,
      recordKind: 'snapshot',
      restoredAt: restoredAt,
      restoredBySyncPeerId: restoredBy,
      priorDigest: priorDigest || candidate.baseHash,
      sourceTombstoneEvidenceDigest: isSha256Hex(row.sourceTombstoneEvidenceDigest) ? cleanLower(row.sourceTombstoneEvidenceDigest) : '',
      kernelTombstone: kernelTombstone,
      evidenceValid: blockers.indexOf('f5-restore-evidence-missing') === -1 &&
        blockers.indexOf('f5-restore-evidence-tombstoneId-missing') === -1 &&
        blockers.indexOf('f5-restore-evidence-subjectId-mismatch') === -1 &&
        blockers.indexOf('f5-restore-evidence-restoredAt-invalid') === -1 &&
        blockers.indexOf('f5-restore-evidence-restoredBy-missing') === -1 &&
        blockers.indexOf('f5-restore-evidence-priorDigest-mismatch') === -1 &&
        blockers.indexOf('f5-restore-evidence-not-restored') === -1
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
      operationKind: 'snapshot.restore.applyEvent',
      consumedStatus: 'consumed',
      consumedAtIso: appliedAt,
      actorPeer: actorPeer,
      originTag: {
        originKind: candidate.restoreFromTombstone ? 'native-f5-owner-handoff-result' : 'native-owner-handoff-result',
        sourcePeerId: actorPeer.syncPeerIdHash,
        sourcePlatform: 'desktop-tauri',
        envelopeKind: KIND_APPLY_EVENT,
        operationKind: 'snapshot.restore.applyEvent',
        lineageId: identity.lineageId,
        eventDigest: eventDigest,
        dedupeKey: identity.dedupeKey
      },
      reason: 'snapshot restore applyEvent receipt generated',
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
      f5RestoreEvidence: null,
      proposedF5RestoreRecord: null,
      proposedConsumedOperation: null,
      proposedWatermarkTarget: null,
      blockers: codeList(blockers),
      warnings: codeList(warnings)
    };
  }

  async function buildSnapshotRestoreApplyEventReceipt(input) {
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
    var f5RestoreEvidence = shapeF5RestoreEvidence(args.operationResult, args.handoffPreview, candidate, actorPeer, appliedAt, blockers, warnings);
    scanPrivacy(args, blockers, warnings);
    if (blockers.length || !identity) return failure(blockers, warnings);

    validateReplay(candidate, identity, actorPeer, preHash, postHash, f5RestoreEvidence, blockers, warnings);
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
      restoreSource: candidate.fromState,
      preStateHash: preHash,
      postStateHash: postHash,
      preState: {
        hash: preHash,
        lifecycleState: candidate.fromState
      },
      postState: {
        hash: postHash,
        lifecycleState: 'captured'
      },
      lifecycleTransition: {
        fromState: candidate.fromState,
        toState: 'captured'
      },
      kernelLifecycleState: lifecycleShapes.lifecycleState,
      kernelLifecycleTransition: lifecycleShapes.lifecycleTransition,
      actorPeer: actorPeer,
      owner: ownerSummary(args.handoffPreview),
      f5RestoreEvidence: f5RestoreEvidence,
      appliedAtIso: appliedAt,
      predicateVersion: candidate.predicateVersion,
      transactionId: txnId,
      proposalEnvelopeId: candidate.proposalEnvelopeId,
      proposalEventDigest: candidate.proposalEventDigest,
      proposalDedupeKey: candidate.proposalDedupeKey,
      justifyingEvidenceDigests: candidate.justifyingEvidenceDigests.slice(),
      restored: true,
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
        nativeOwned: true,
        f5ClearEvidenceRequired: candidate.restoreFromTombstone,
        restoreSource: candidate.fromState,
        proposalOperation: candidate.proposalOperation,
        proposalEventDigest: candidate.proposalEventDigest,
        tombstoneId: f5RestoreEvidence ? f5RestoreEvidence.tombstoneId : ''
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
    if (f5RestoreEvidence) scanPrivacy(f5RestoreEvidence, blockers, warnings);
    scanPrivacy(consumedPreview, blockers, warnings);
    scanPrivacy(watermarkPreview, blockers, warnings);
    if (blockers.length) return failure(blockers, warnings);

    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: true,
      applyEvent: applyEvent,
      auditMetadata: auditMetadata,
      auditRecord: auditRecord,
      lifecycleState: lifecycleShapes.lifecycleState,
      lifecycleTransition: lifecycleShapes.lifecycleTransition,
      f5RestoreEvidence: f5RestoreEvidence,
      proposedF5RestoreRecord: f5RestoreEvidence,
      proposedConsumedOperation: consumedPreview,
      proposedWatermarkTarget: watermarkPreview,
      blockers: [],
      warnings: codeList(warnings)
    };
  }

  H2O.Desktop.Sync.buildSnapshotRestoreApplyEventReceipt = buildSnapshotRestoreApplyEventReceipt;
  H2O.Desktop.Sync.__snapshotRestoreApplyEventInstalled = true;
  H2O.Desktop.Sync.__snapshotRestoreApplyEventVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
