/* H2O Desktop Sync - F14.4.7b snapshot F5 tombstone handoff preview
 *
 * Read-only handoff preview for generated snapshot tombstone proposal
 * candidates. This module validates and shapes an F5 owner handoff request
 * only. It never executes F5/Native work, applies, publishes, enqueues relay
 * outbox rows, advances watermarks, or records consumed operations.
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
  if (H2O.Desktop.Sync.__snapshotF5TombstoneHandoffInstalled) return;

  var VERSION = '0.1.0-f14.4.7b';
  var RESULT_SCHEMA = 'h2o.desktop.sync.snapshot-f5-tombstone-handoff-preview.v1';
  var HANDOFF_REQUEST_SCHEMA = 'h2o.desktop.sync.snapshot-f5-tombstone-handoff-request.v1';
  var LEDGER_SCHEMA = 'h2o.desktop.sync.convergence-proposal-candidate-ledger.v1';
  var ROW_SCHEMA = 'h2o.desktop.sync.convergence-proposal-candidate-row.v1';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var LEDGER_KEY = 'h2o:sync:convergence-proposal-candidates:v1';
  var SUBJECT_TYPE = 'snapshot.conversation';
  var KIND_PROPOSAL = 'proposal';
  var OP_TOMBSTONE = 'snapshot-lifecycle-tombstone-proposed';
  var OPERATION_INTENT = 'update';
  var STATUS_GENERATED = 'generated';
  var OWNER_KIND_F5 = 'f5';
  var REQUIRED_CAPABILITY = 'ownerHandoff';
  var REQUIRED_AUTHORITY = 'audited-apply-authority';
  var HANDOFF_STATUS = 'requested';
  var EXPECTED_F5_REVIEW_KIND = 'f5-reviewed-snapshot-tombstone';
  var PRIVACY_FORBIDDEN_FIELDS = [
    'content', 'body', 'text', 'messages', 'message_array', 'turns',
    'turn_array', 'conversation', 'transcript', 'attachments', 'files',
    'file_ids', 'image_urls', 'audio_urls', 'rawSnapshot', 'snapshotPayload',
    'rawId', 'snapshotId', 'snapshot_id', 'chatId', 'chat_id',
    'accountId', 'account_id', 'rawAccountId', 'title', 'name', 'path', 'url',
    'share_url', 'share_token', 'password', 'apiKey', 'session_token',
    'cookies', 'token'
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

  function storageRef() {
    try {
      var s = global.chrome && global.chrome.storage && global.chrome.storage.local;
      if (s && typeof s.get === 'function') return s;
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
  function normalizeLedger(raw) {
    if (!raw) return { schema: LEDGER_SCHEMA, rows: [] };
    if (!isObject(raw) || raw.schema !== LEDGER_SCHEMA || !Array.isArray(raw.rows)) return null;
    return {
      schema: LEDGER_SCHEMA,
      createdAtIso: cleanString(raw.createdAtIso),
      updatedAtIso: cleanString(raw.updatedAtIso),
      rows: raw.rows.slice()
    };
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
  function findLedgerRow(ledger, candidateId) {
    var id = cleanString(candidateId);
    var rows = asArray(ledger && ledger.rows);
    for (var i = 0; i < rows.length; i += 1) {
      var row = safeObject(rows[i]);
      if (cleanString(row.rowId) === id ||
          cleanString(row.candidateId) === id ||
          cleanString(row.envelopeId) === id) {
        return row;
      }
    }
    return null;
  }
  function directCandidateParts(candidate) {
    var source = safeObject(candidate);
    var row = null;
    var envelope = null;
    if (isObject(source.proposalCandidate)) {
      envelope = source.proposalCandidate;
      row = isObject(source.candidateRow) ? source.candidateRow : null;
    } else if (isObject(source.envelope)) {
      envelope = source.envelope;
      row = isObject(source.candidateRow) ? source.candidateRow : null;
    } else if (isObject(source.candidate)) {
      return directCandidateParts(source.candidate);
    } else if (source.schema === ROW_SCHEMA || cleanString(source.serializedEnvelope)) {
      row = source;
      envelope = parseJsonObject(source.serializedEnvelope);
    } else {
      envelope = source;
      row = isObject(source.candidateRow) ? source.candidateRow : null;
    }
    if (!envelope && row) envelope = parseJsonObject(row.serializedEnvelope);
    return { envelope: envelope, row: row };
  }
  async function resolveCandidate(args, blockers) {
    var candidateId = cleanString(args.candidateId);
    if (candidateId) {
      var ledger = null;
      try {
        ledger = normalizeLedger(await storageGet(LEDGER_KEY));
      } catch (_) {
        addCode(blockers, 'proposal-ledger-unavailable');
        return { envelope: null, row: null, candidateId: candidateId };
      }
      if (!ledger) {
        addCode(blockers, 'proposal-ledger-malformed');
        return { envelope: null, row: null, candidateId: candidateId };
      }
      var row = findLedgerRow(ledger, candidateId);
      if (!row) {
        addCode(blockers, 'candidate-not-found');
        return { envelope: null, row: null, candidateId: candidateId };
      }
      var envelope = parseJsonObject(row.serializedEnvelope);
      if (!envelope && isObject(args.candidate)) envelope = directCandidateParts(args.candidate).envelope;
      if (!envelope) addCode(blockers, 'candidate-envelope-unavailable');
      return { envelope: envelope, row: row, candidateId: cleanString(row.rowId) || candidateId };
    }
    if (!isObject(args.candidate)) {
      addCode(blockers, 'candidate-missing');
      return { envelope: null, row: null, candidateId: '' };
    }
    var parts = directCandidateParts(args.candidate);
    if (!parts.envelope) addCode(blockers, 'candidate-envelope-unavailable');
    return {
      envelope: parts.envelope,
      row: parts.row,
      candidateId: cleanString(safeObject(parts.row).rowId) ||
        cleanString(args.candidateId) ||
        cleanString(safeObject(args.candidate).candidateId)
    };
  }

  function foreverNoKey(value) {
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i += 1) {
        var hit = foreverNoKey(value[i]);
        if (hit) return hit;
      }
      return '';
    }
    if (!isObject(value)) return '';
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k += 1) {
      var key = keys[k];
      if (PRIVACY_FORBIDDEN_FIELDS.indexOf(key) !== -1) return key;
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
          forbiddenList: PRIVACY_FORBIDDEN_FIELDS,
          foreverNoFields: PRIVACY_FORBIDDEN_FIELDS
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
  function envelopeForEventDigest(envelope) {
    var clone = JSON.parse(JSON.stringify(envelope));
    delete clone.eventDigest;
    delete clone.warnings;
    delete clone.blockers;
    return clone;
  }
  async function validateDigest(envelope, row, blockers) {
    if (!webCryptoAvailable()) {
      addCode(blockers, 'web-crypto-unavailable');
      return;
    }
    if (!isSha256Hex(envelope.eventDigest)) {
      addCode(blockers, 'candidate-eventDigest-invalid');
      return;
    }
    var recomputed = await sha256Hex(envelopeForEventDigest(envelope));
    if (!isSha256Hex(recomputed)) addCode(blockers, 'candidate-eventDigest-recompute-failed');
    else if (recomputed !== cleanLower(envelope.eventDigest)) addCode(blockers, 'candidate-eventDigest-mismatch');
    if (row && cleanString(row.eventDigest) && cleanLower(row.eventDigest) !== cleanLower(envelope.eventDigest)) {
      addCode(blockers, 'candidate-row-eventDigest-mismatch');
    }
    if (row && cleanString(row.dedupeKey) && cleanLower(row.dedupeKey) !== cleanLower(envelope.dedupeKey)) {
      addCode(blockers, 'candidate-row-dedupeKey-mismatch');
    }
  }
  function candidateStatus(args, row, envelope) {
    var direct = safeObject(args.candidate);
    return cleanString(row && row.status) ||
      cleanString(direct.status) ||
      cleanString(envelope && envelope.status);
  }
  function justifyingEvidenceDigests(envelope, row) {
    var payload = safeObject(envelope.payload);
    var list = asArray(payload.justifyingEvidenceDigests)
      .map(cleanLower)
      .filter(isSha256Hex);
    if (list.length) return list.filter(function (digest, index, arr) { return arr.indexOf(digest) === index; });
    return asArray(row && row.justifyingEvidenceDigests)
      .map(cleanLower)
      .filter(isSha256Hex);
  }
  function validateIdentityWithKernel(summary, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (!kernel || typeof kernel.validateIdentityInput !== 'function') {
      addCode(blockers, 'kernel-identity-kit-unavailable');
      return;
    }
    try {
      var validation = kernel.validateIdentityInput({
        subjectType: SUBJECT_TYPE,
        subjectId: summary.subjectId,
        operation: summary.operation,
        baseHash: summary.baseHash,
        actorPeer: summary.sourcePeerEnvelope
      });
      codeList(validation && validation.blockers).forEach(function (code) { addCode(blockers, code); });
      codeList(validation && validation.warnings).forEach(function (code) { addCode(warnings, code); });
    } catch (_) {
      addCode(blockers, 'kernel-identity-validation-threw');
    }
  }
  function validateCandidate(args, resolved, blockers, warnings) {
    var envelope = safeObject(resolved.envelope);
    var row = resolved.row ? safeObject(resolved.row) : null;
    var payload = safeObject(envelope.payload);
    var op = safeObject(payload.proposedOperation);
    var expected = safeObject(payload.expectedPostState);
    var status = candidateStatus(args, row, envelope);

    if (!isObject(resolved.envelope)) {
      addCode(blockers, 'candidate-envelope-unavailable');
      return null;
    }
    if (status !== STATUS_GENERATED) addCode(blockers, 'candidate-status-not-generated');
    if (envelope.schema !== ENVELOPE_SCHEMA) addCode(blockers, 'candidate-envelope-schema-invalid');
    if (envelope.kind !== KIND_PROPOSAL) addCode(blockers, 'candidate-kind-not-proposal');
    if (envelope.subjectType !== SUBJECT_TYPE) addCode(blockers, 'candidate-subjectType-invalid');
    if (envelope.operationIntent !== OPERATION_INTENT) addCode(blockers, 'candidate-operationIntent-invalid');
    if (envelope.operation !== OP_TOMBSTONE) addCode(blockers, 'candidate-operation-not-tombstone');
    if (!isSha256Hex(envelope.subjectId)) addCode(blockers, 'candidate-subjectId-invalid');
    if (!isSha256Hex(envelope.lineageId)) addCode(blockers, 'candidate-lineageId-invalid');
    if (!isSha256Hex(envelope.dedupeKey)) addCode(blockers, 'candidate-dedupeKey-invalid');
    if (!isSha256Hex(envelope.payloadHash)) addCode(blockers, 'candidate-payloadHash-invalid');
    if (!validatePeer(safeObject(safeObject(envelope.sourcePlatform).sourcePeerEnvelope))) {
      addCode(blockers, 'candidate-sourcePeer-invalid');
    }
    if (envelope.redactionClass !== 'redacted') addCode(blockers, 'candidate-redactionClass-invalid');
    if (!isIso(envelope.createdAt)) addCode(blockers, 'candidate-createdAt-invalid');
    if (!isIso(envelope.expiresAt)) {
      addCode(blockers, 'candidate-expiresAt-invalid');
    } else if (Date.parse(envelope.expiresAt) <= Date.now()) {
      addCode(blockers, 'candidate-expired');
    }
    var evidenceDigests = justifyingEvidenceDigests(envelope, row);
    if (!evidenceDigests.length) addCode(blockers, 'candidate-justifyingEvidenceDigests-missing');
    if (!isObject(payload.proposedOperation)) addCode(blockers, 'candidate-proposedOperation-missing');
    if (!isObject(payload.expectedPostState)) addCode(blockers, 'candidate-expectedPostState-missing');
    if (!cleanString(payload.predicateVersion)) addCode(blockers, 'candidate-predicateVersion-missing');
    if (op.operation !== envelope.operation) addCode(blockers, 'candidate-proposedOperation-mismatch');
    if (op.operationIntent !== OPERATION_INTENT) addCode(blockers, 'candidate-proposedOperation-intent-invalid');
    if (op.subjectType !== SUBJECT_TYPE) addCode(blockers, 'candidate-proposedOperation-subjectType-invalid');
    if (op.subjectId !== envelope.subjectId) addCode(blockers, 'candidate-proposedOperation-subjectId-mismatch');
    if (cleanString(safeObject(op.lifecycleTransition).toState) !== 'tombstoned') {
      addCode(blockers, 'candidate-tombstone-target-invalid');
    }
    if (expected.subjectType !== SUBJECT_TYPE) addCode(blockers, 'candidate-expectedPostState-subjectType-invalid');
    if (expected.subjectId !== envelope.subjectId) addCode(blockers, 'candidate-expectedPostState-subjectId-mismatch');
    if (expected.lifecycleState !== 'tombstoned') addCode(blockers, 'candidate-expectedPostState-lifecycle-invalid');
    if (!isSha256Hex(op.baseHash) || !isSha256Hex(op.targetHash)) addCode(blockers, 'candidate-operation-hash-invalid');
    if (!isSha256Hex(expected.expectedPostStateHash)) addCode(blockers, 'candidate-expectedPostStateHash-invalid');
    if (row) {
      if (cleanString(row.operation) && cleanString(row.operation) !== envelope.operation) addCode(blockers, 'candidate-row-operation-mismatch');
      if (cleanString(row.operationIntent) && cleanString(row.operationIntent) !== OPERATION_INTENT) addCode(blockers, 'candidate-row-operationIntent-mismatch');
      if (cleanString(row.subjectId) && cleanLower(row.subjectId) !== cleanLower(envelope.subjectId)) addCode(blockers, 'candidate-row-subjectId-mismatch');
      if (cleanString(row.lineageId) && cleanLower(row.lineageId) !== cleanLower(envelope.lineageId)) addCode(blockers, 'candidate-row-lineageId-mismatch');
    }

    scanPrivacy(envelope, blockers, warnings);
    if (row) scanPrivacy(row, blockers, warnings);
    var summary = {
      status: status,
      operation: envelope.operation,
      operationDomain: 'tombstone',
      subjectId: cleanLower(envelope.subjectId),
      lineageId: cleanLower(envelope.lineageId),
      dedupeKey: cleanLower(envelope.dedupeKey),
      eventDigest: cleanLower(envelope.eventDigest),
      baseHash: cleanLower(op.baseHash),
      targetHash: cleanLower(op.targetHash),
      predicateVersion: cleanString(payload.predicateVersion),
      justifyingEvidenceDigests: evidenceDigests,
      expectedTarget: { lifecycleState: 'tombstoned' },
      sourcePeerEnvelope: safeObject(safeObject(envelope.sourcePlatform).sourcePeerEnvelope),
      candidateRowId: cleanString(resolved.candidateId) || cleanString(row && row.rowId),
      envelopeId: cleanString(envelope.id)
    };
    validateIdentityWithKernel(summary, blockers, warnings);
    return summary;
  }

  function ownerStatusValue(value) {
    if (typeof value === 'string') return cleanString(value);
    if (isObject(value)) return cleanString(value.status || value.availability || value.reachability || value.state);
    return '';
  }
  function ownerAvailable(value) {
    var status = ownerStatusValue(value);
    return status === 'available' || status === 'reachable' || status === 'ready';
  }
  function ownerSubjectAuthorized(owner) {
    var subjectTypes = asArray(owner && owner.subjectTypes).map(cleanString).filter(Boolean);
    if (!subjectTypes.length) return false;
    return subjectTypes.indexOf(SUBJECT_TYPE) !== -1 ||
      subjectTypes.indexOf('snapshot') !== -1 ||
      subjectTypes.indexOf('*') !== -1;
  }
  function ownerDomainAuthorized(owner) {
    var domains = asArray(owner && owner.domains).map(cleanString).filter(Boolean);
    if (!domains.length) return true;
    return domains.indexOf(SUBJECT_TYPE) !== -1 ||
      domains.indexOf('snapshot') !== -1 ||
      domains.indexOf('tombstone') !== -1 ||
      domains.indexOf('*') !== -1;
  }
  function validateOwnerBoundary(args, summary, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    var declaration = safeObject(args.ownerDeclaration);

    if (!isObject(args.ownerDeclaration)) addCode(blockers, 'owner-declaration-missing');
    if (!ownerAvailable(args.ownerStatus)) addCode(blockers, 'f5-owner-unavailable');
    else summary.ownerAvailable = true;

    if (!kernel || typeof kernel.validateOwnerDeclaration !== 'function') {
      addCode(blockers, 'kernel-owner-handoff-unavailable');
      return null;
    }

    var ownerValidation = null;
    try {
      ownerValidation = kernel.validateOwnerDeclaration(declaration, {
        allowedOwnerKinds: [OWNER_KIND_F5],
        allowedCapabilities: ['read', 'review', 'delete', REQUIRED_CAPABILITY],
        allowedAuthorityLevels: [REQUIRED_AUTHORITY],
        requireActorPeer: false,
        privacyPolicy: {
          subjectType: SUBJECT_TYPE,
          redactionClass: 'redacted',
          forbiddenList: PRIVACY_FORBIDDEN_FIELDS,
          foreverNoFields: PRIVACY_FORBIDDEN_FIELDS
        }
      });
    } catch (_) {
      addCode(blockers, 'owner-declaration-validation-threw');
    }
    codeList(ownerValidation && ownerValidation.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(ownerValidation && ownerValidation.warnings).forEach(function (code) { addCode(warnings, code); });

    var owner = safeObject(ownerValidation && ownerValidation.owner);
    if (owner.ownerKind !== OWNER_KIND_F5) addCode(blockers, 'f5-owner-kind-invalid');
    if (owner.authorityLevel !== REQUIRED_AUTHORITY) addCode(blockers, 'f5-owner-authority-insufficient');
    if (!ownerSubjectAuthorized(owner)) addCode(blockers, 'f5-owner-subjectType-not-authorized');
    if (!ownerDomainAuthorized(owner)) addCode(blockers, 'f5-owner-domain-not-authorized');
    if (asArray(owner.capabilities).indexOf(REQUIRED_CAPABILITY) === -1) addCode(blockers, 'f5-owner-handoff-capability-missing');
    scanPrivacy(owner, blockers, warnings);
    summary.ownerF5 = owner.ownerKind === OWNER_KIND_F5;
    summary.ownerAuthoritySafe = owner.authorityLevel === REQUIRED_AUTHORITY;
    return owner;
  }

  async function rerunPreflightIfPossible(args, candidateSummary, summary, blockers, warnings) {
    if (!isObject(args.snapshotRecord)) {
      addCode(warnings, 'snapshot-preflight-rerun-input-not-provided');
      return null;
    }
    if (typeof H2O.Desktop.Sync.runSnapshotConvergencePreflight !== 'function') {
      addCode(warnings, 'snapshot-preflight-unavailable');
      return null;
    }
    var preflight = null;
    var preflightOwnerDeclaration = args.preflightOwnerDeclaration ||
      args.nativeOwnerDeclaration ||
      args.snapshotOwnerDeclaration ||
      args.ownerDeclaration;
    var preflightOwnerStatus = args.preflightOwnerStatus ||
      args.nativeOwnerStatus ||
      args.snapshotOwnerStatus ||
      args.ownerStatus;
    try {
      preflight = await H2O.Desktop.Sync.runSnapshotConvergencePreflight(Object.assign({}, args, {
        ownerDeclaration: preflightOwnerDeclaration,
        ownerStatus: preflightOwnerStatus,
        status: preflightOwnerStatus || args.status,
        ownerReachable: typeof args.preflightOwnerReachable === 'boolean'
          ? args.preflightOwnerReachable
          : (typeof args.nativeOwnerReachable === 'boolean' ? args.nativeOwnerReachable : args.ownerReachable),
        operation: 'tombstone',
        expectedTarget: { lifecycleState: 'tombstoned' }
      }));
    } catch (_) {
      addCode(blockers, 'snapshot-preflight-rerun-threw');
      return null;
    }
    summary.preflightRerun = true;
    codeList(preflight && preflight.warnings).forEach(function (code) { addCode(warnings, code); });
    if (!preflight || preflight.ok !== true || preflight.actionable !== true) {
      codeList(preflight && preflight.blockers).forEach(function (code) { addCode(blockers, code); });
      addCode(blockers, 'snapshot-preflight-rerun-not-actionable');
      return preflight;
    }
    var snapshot = safeObject(preflight.canonicalSnapshot);
    if (isSha256Hex(snapshot.subjectId) && cleanLower(snapshot.subjectId) !== candidateSummary.subjectId) {
      addCode(blockers, 'snapshot-preflight-subjectId-mismatch');
    }
    if (isSha256Hex(snapshot.revisionHash) && cleanLower(snapshot.revisionHash) !== candidateSummary.baseHash) {
      addCode(blockers, 'snapshot-preflight-baseHash-mismatch');
    }
    summary.preflightSafe = blockers.indexOf('snapshot-preflight-rerun-not-actionable') === -1;
    return preflight;
  }
  function validateF5HandoffMetadata(candidateSummary, createdAtIso, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (!kernel || typeof kernel.validateF5Handoff !== 'function') {
      addCode(blockers, 'kernel-f5-handoff-unavailable');
      return null;
    }
    var handoff = {
      candidateId: candidateSummary.candidateRowId,
      proposalEnvelopeId: candidateSummary.envelopeId,
      subjectId: candidateSummary.subjectId,
      lineageId: candidateSummary.lineageId,
      baseHash: candidateSummary.baseHash,
      predicateVersion: candidateSummary.predicateVersion,
      justifyingEvidenceDigests: candidateSummary.justifyingEvidenceDigests,
      expectedF5ReviewKind: EXPECTED_F5_REVIEW_KIND,
      membershipCount: 0,
      childFolderCount: 0,
      reviewStatus: 'pending-review',
      createdAtIso: createdAtIso
    };
    var validation = null;
    try {
      validation = kernel.validateF5Handoff(handoff);
    } catch (_) {
      addCode(blockers, 'f5-handoff-validation-threw');
      return null;
    }
    codeList(validation && validation.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(validation && validation.warnings).forEach(function (code) { addCode(warnings, code); });
    return safeObject(validation && validation.handoff);
  }
  function buildAuthorityMetadata(args, owner, candidateSummary, createdAtIso) {
    var explicit = safeObject(args.authorityMetadata);
    return {
      platformId: cleanString(explicit.platformId) || cleanString(owner.platformId) || 'f5-owner',
      surfaceKind: cleanString(explicit.surfaceKind) || cleanString(owner.surfaceKind) || 'f5',
      declaredAuthority: cleanString(explicit.declaredAuthority) || cleanString(owner.authorityLevel) || REQUIRED_AUTHORITY,
      effectiveAuthority: cleanString(explicit.effectiveAuthority) || cleanString(owner.authorityLevel) || REQUIRED_AUTHORITY,
      requiredAuthority: REQUIRED_AUTHORITY,
      capability: REQUIRED_CAPABILITY,
      actorPeer: candidateSummary.sourcePeerEnvelope,
      createdAtIso: createdAtIso,
      expiresAtIso: cleanString(args.expiresAtIso),
      metadata: {
        domain: SUBJECT_TYPE,
        operation: candidateSummary.operationDomain,
        previewOnly: true
      }
    };
  }
  function buildHandoffInput(args, owner, candidateSummary, f5Handoff, createdAtIso) {
    return {
      handoffId: cleanString(args.handoffId) || generateUuid(),
      handoffStatus: HANDOFF_STATUS,
      owner: owner,
      ownerDeclaration: owner,
      authority: buildAuthorityMetadata(args, owner, candidateSummary, createdAtIso),
      subjectType: SUBJECT_TYPE,
      subjectId: candidateSummary.subjectId,
      operation: candidateSummary.operation,
      operationIntent: OPERATION_INTENT,
      requestedCapability: REQUIRED_CAPABILITY,
      lineageId: candidateSummary.lineageId,
      eventDigest: candidateSummary.eventDigest,
      dedupeKey: candidateSummary.dedupeKey,
      handoffReason: 'snapshot-f5-tombstone-owner-preview',
      createdAtIso: createdAtIso,
      expiresAtIso: cleanString(args.expiresAtIso),
      requestedByPeer: candidateSummary.sourcePeerEnvelope,
      metadata: {
        candidateId: candidateSummary.candidateRowId,
        envelopeId: candidateSummary.envelopeId,
        expectedF5ReviewKind: EXPECTED_F5_REVIEW_KIND,
        f5HandoffReady: !!f5Handoff,
        operationDomain: candidateSummary.operationDomain,
        previewOnly: true
      }
    };
  }
  function validateHandoff(handoffInput, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (!kernel || typeof kernel.validateOwnerHandoff !== 'function') {
      addCode(blockers, 'kernel-owner-handoff-unavailable');
      return null;
    }
    var result = null;
    try {
      result = kernel.validateOwnerHandoff(handoffInput, {
        allowedOwnerKinds: [OWNER_KIND_F5],
        allowedCapabilities: ['read', 'review', 'delete', REQUIRED_CAPABILITY],
        allowedAuthorityLevels: [REQUIRED_AUTHORITY],
        requiredAuthorityLevel: REQUIRED_AUTHORITY,
        requiredCapability: REQUIRED_CAPABILITY,
        requireActorPeer: false,
        requireSubject: true,
        requireLineage: true,
        requireAuthority: true,
        requireOwnerCapability: true,
        privacyPolicy: {
          subjectType: SUBJECT_TYPE,
          redactionClass: 'redacted',
          forbiddenList: PRIVACY_FORBIDDEN_FIELDS,
          foreverNoFields: PRIVACY_FORBIDDEN_FIELDS
        }
      });
    } catch (_) {
      addCode(blockers, 'owner-handoff-validation-threw');
      return null;
    }
    codeList(result && result.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(result && result.warnings).forEach(function (code) { addCode(warnings, code); });
    return result;
  }
  function outputResult(ok, handoffReady, candidateSummary, owner, handoffRequest, blockers, warnings, validationSummary) {
    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: ok,
      handoffReady: handoffReady,
      operation: cleanString(candidateSummary && candidateSummary.operation),
      subjectId: cleanString(candidateSummary && candidateSummary.subjectId),
      lineageId: cleanString(candidateSummary && candidateSummary.lineageId),
      dedupeKey: cleanString(candidateSummary && candidateSummary.dedupeKey),
      owner: owner || null,
      handoffRequest: handoffRequest || null,
      blockers: codeList(blockers),
      warnings: codeList(warnings),
      validationSummary: validationSummary || {}
    };
  }
  function blocked(blockers, warnings, validationSummary) {
    return outputResult(false, false, null, null, null, blockers, warnings, validationSummary);
  }
  function scanFinalOutput(result, warnings) {
    var blockers = [];
    scanPrivacy(result, blockers, warnings);
    if (!blockers.length) return result;
    return outputResult(false, false, null, null, null, blockers, warnings, Object.assign({}, safeObject(result.validationSummary), {
      outputPrivacySafe: false
    }));
  }

  async function previewSnapshotF5TombstoneHandoff(input) {
    var args = safeObject(input);
    var blockers = [];
    var warnings = [];
    var summary = {
      candidateResolved: false,
      candidateValid: false,
      candidatePrivacySafe: false,
      ownerF5: false,
      ownerAvailable: false,
      ownerAuthoritySafe: false,
      preflightRerun: false,
      preflightSafe: false,
      f5HandoffValidated: false,
      handoffValidated: false,
      outputPrivacySafe: true,
      storageMutated: false,
      f5Called: false,
      nativeCalled: false,
      publicationTouched: false,
      relayTouched: false,
      applyTouched: false
    };

    if (!isObject(input)) {
      addCode(blockers, 'input-missing');
      return blocked(blockers, warnings, summary);
    }

    var resolved = await resolveCandidate(args, blockers);
    summary.candidateResolved = !!resolved.envelope;
    if (blockers.length) return blocked(blockers, warnings, summary);

    var candidateSummary = validateCandidate(args, resolved, blockers, warnings);
    if (candidateSummary) await validateDigest(resolved.envelope, resolved.row, blockers);
    summary.candidatePrivacySafe = blockers.indexOf('payload-contains-forever-no-field') === -1 &&
      blockers.indexOf('payload-contains-forbidden-field') === -1 &&
      blockers.indexOf('snapshot-preflight-output-contains-forbidden-field') === -1;
    summary.candidateValid = blockers.length === 0;
    if (blockers.length || !candidateSummary) return blocked(blockers, warnings, summary);

    var owner = validateOwnerBoundary(args, summary, blockers, warnings);
    if (blockers.length || !owner) return blocked(blockers, warnings, summary);

    await rerunPreflightIfPossible(args, candidateSummary, summary, blockers, warnings);
    if (blockers.length) return blocked(blockers, warnings, summary);
    if (!summary.preflightRerun) summary.preflightSafe = true;

    var createdAtIso = nowIsoSeconds();
    var f5Handoff = validateF5HandoffMetadata(candidateSummary, createdAtIso, blockers, warnings);
    summary.f5HandoffValidated = blockers.length === 0 && !!f5Handoff;
    if (blockers.length || !f5Handoff) return blocked(blockers, warnings, summary);

    var handoffInput = buildHandoffInput(args, owner, candidateSummary, f5Handoff, createdAtIso);
    scanPrivacy(handoffInput, blockers, warnings);
    if (blockers.length) return blocked(blockers, warnings, summary);

    var handoffValidation = validateHandoff(handoffInput, blockers, warnings);
    summary.handoffValidated = blockers.length === 0 && !!(handoffValidation && handoffValidation.valid);
    if (blockers.length || !handoffValidation || handoffValidation.valid !== true) {
      return blocked(blockers, warnings, summary);
    }

    var handoffRequest = Object.assign({
      previewSchema: HANDOFF_REQUEST_SCHEMA,
      previewOnly: true,
      f5Handoff: f5Handoff
    }, safeObject(handoffValidation.handoff));
    var result = outputResult(true, true, candidateSummary, safeObject(handoffValidation.owner), handoffRequest, [], warnings, summary);
    return scanFinalOutput(result, warnings);
  }

  H2O.Desktop.Sync.previewSnapshotF5TombstoneHandoff = previewSnapshotF5TombstoneHandoff;
  H2O.Desktop.Sync.__snapshotF5TombstoneHandoffInstalled = true;
  H2O.Desktop.Sync.__snapshotF5TombstoneHandoffVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
