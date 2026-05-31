/* H2O Desktop Sync - F14.4.6 snapshot restore proposal candidate generator
 *
 * Candidate generation only. This module emits a redacted local proposal
 * candidate and appends one generated candidate ledger row. It never publishes,
 * enqueues relay outbox rows, applies, restores, executes F5/Native/owner
 * handoff, advances watermarks, or records consumed operations.
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
  if (H2O.Desktop.Sync.__snapshotRestoreProposalInstalled) return;

  var VERSION = '0.1.0-f14.4.6';
  var RESULT_SCHEMA = 'h2o.desktop.sync.snapshot-restore-proposal-candidate-generator.v1';
  var LEDGER_SCHEMA = 'h2o.desktop.sync.convergence-proposal-candidate-ledger.v1';
  var ROW_SCHEMA = 'h2o.desktop.sync.convergence-proposal-candidate-row.v1';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var LEDGER_KEY = 'h2o:sync:convergence-proposal-candidates:v1';
  var SUBJECT_TYPE = 'snapshot.conversation';
  var ENVELOPE_KIND = 'proposal';
  var OPERATION = 'snapshot-lifecycle-restore-proposed';
  var DOMAIN_OPERATION = 'restore';
  var OPERATION_INTENT = 'update';
  var STATUS_GENERATED = 'generated';
  var PREDICATE_VERSION = 'h2o.snapshot.restore.predicate.v1';
  var CAPABILITY_TAG = 'h2o.platform.capabilities.v1#f14.4.6-desktop-snapshot-restore-proposal-v1';
  var EXPIRES_AFTER_MINUTES = 20;
  var TARGET_LIFECYCLE_STATE = 'captured';
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
  function addMinutesIso(minutes) {
    return new Date(Date.now() + minutes * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
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
      if (PRIVACY_FORBIDDEN_FIELDS.indexOf(key) !== -1) return key;
      if (/token$/i.test(key) && key !== 'previewToken') return key;
      var childHit = foreverNoKey(value[key]);
      if (childHit) return childHit;
    }
    return '';
  }
  function failure(blockers, warnings, extra) {
    return Object.assign({
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: false,
      status: 'blocked',
      generated: false,
      noop: false,
      proposalCandidate: null,
      candidateRow: null,
      candidateId: null,
      blockers: codeList(blockers),
      warnings: codeList(warnings)
    }, isObject(extra) ? extra : {});
  }
  function rowSummary(row) {
    return {
      schema: ROW_SCHEMA,
      rowId: cleanString(row.rowId),
      envelopeId: cleanString(row.envelopeId),
      lineageId: cleanString(row.lineageId),
      subjectId: cleanString(row.subjectId),
      operation: cleanString(row.operation),
      operationIntent: cleanString(row.operationIntent),
      baseHash: cleanString(row.baseHash),
      targetHash: cleanString(row.targetHash),
      eventDigest: cleanString(row.eventDigest),
      dedupeKey: cleanString(row.dedupeKey),
      status: cleanString(row.status),
      generatedAtIso: cleanString(row.generatedAtIso),
      expiresAt: cleanString(row.expiresAt)
    };
  }
  function summarizePreflight(preflight) {
    var p = safeObject(preflight);
    var snapshot = safeObject(p.canonicalSnapshot);
    var target = safeObject(p.targetSummary);
    return {
      ok: p.ok === true,
      actionable: p.actionable === true,
      noop: p.noop === true,
      operation: cleanString(p.operation),
      subjectId: isSha256Hex(snapshot.subjectId) ? cleanLower(snapshot.subjectId) : '',
      revisionHash: isSha256Hex(snapshot.revisionHash) ? cleanLower(snapshot.revisionHash) : '',
      lifecycleState: cleanString(snapshot.lifecycleState),
      targetLifecycleState: cleanString(target.targetLifecycleState),
      blockers: codeList(p.blockers),
      warnings: codeList(p.warnings)
    };
  }

  async function sourcePeerEnvelope(input, blockers) {
    var supplied = safeObject(input.actorPeer || input.sourcePeerEnvelope);
    if (validatePeer(supplied)) {
      return {
        physicalDeviceIdHash: cleanLower(supplied.physicalDeviceIdHash),
        installIdHash: cleanLower(supplied.installIdHash),
        syncPeerIdHash: cleanLower(supplied.syncPeerIdHash)
      };
    }
    var identity = H2O.Studio && H2O.Studio.identity;
    var raw = null;
    try { if (identity && typeof identity.get === 'function') raw = identity.get(); } catch (_) { raw = null; }
    if (!isObject(raw) || (!cleanString(raw.physicalDeviceIdHash) && !cleanString(raw.physicalDeviceId)) ||
        (!cleanString(raw.installIdHash) && !cleanString(raw.installId)) ||
        (!cleanString(raw.syncPeerIdHash) && !cleanString(raw.syncPeerId))) {
      addCode(blockers, 'invalid-peer-identity');
      return null;
    }
    var peer = {
      physicalDeviceIdHash: cleanString(raw.physicalDeviceIdHash) || await sha256Hex(cleanString(raw.physicalDeviceId)),
      installIdHash: cleanString(raw.installIdHash) || await sha256Hex(cleanString(raw.installId)),
      syncPeerIdHash: cleanString(raw.syncPeerIdHash) || await sha256Hex(cleanString(raw.syncPeerId))
    };
    if (!validatePeer(peer)) addCode(blockers, 'invalid-peer-identity');
    return peer;
  }
  function validatePeer(peer) {
    return isSha256Hex(peer && peer.physicalDeviceIdHash) &&
      isSha256Hex(peer && peer.installIdHash) &&
      isSha256Hex(peer && peer.syncPeerIdHash);
  }
  async function buildIdentity(snapshot, peer, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (!kernel || typeof kernel.generateSubjectId !== 'function' ||
        typeof kernel.generateDedupeKey !== 'function' ||
        typeof kernel.generateLineageId !== 'function') {
      addCode(blockers, 'kernel-identity-kit-unavailable');
      return null;
    }
    var subject = await kernel.generateSubjectId({
      subjectType: SUBJECT_TYPE,
      subjectId: cleanLower(snapshot.subjectId),
      operation: OPERATION,
      baseHash: cleanLower(snapshot.revisionHash),
      actorPeer: peer
    });
    codeList(subject && subject.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(subject && subject.warnings).forEach(function (code) { addCode(warnings, code); });
    var subjectId = cleanLower(subject && subject.subjectId);
    if (!isSha256Hex(subjectId)) addCode(blockers, 'subject-id-generation-failed');

    var dedupe = await kernel.generateDedupeKey({
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      operation: OPERATION,
      baseHash: cleanLower(snapshot.revisionHash),
      actorPeer: peer
    });
    codeList(dedupe && dedupe.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(dedupe && dedupe.warnings).forEach(function (code) { addCode(warnings, code); });
    var dedupeKey = cleanLower(dedupe && dedupe.dedupeKey);
    if (!isSha256Hex(dedupeKey)) addCode(blockers, 'dedupe-key-generation-failed');

    var lineage = await kernel.generateLineageId({
      deterministic: true,
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      operation: OPERATION,
      baseHash: cleanLower(snapshot.revisionHash),
      actorPeer: peer
    });
    codeList(lineage && lineage.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(lineage && lineage.warnings).forEach(function (code) { addCode(warnings, code); });
    var lineageId = cleanLower(lineage && lineage.lineageId);
    if (!isSha256Hex(lineageId)) addCode(blockers, 'lineage-id-generation-failed');
    return { subjectId: subjectId, dedupeKey: dedupeKey, lineageId: lineageId };
  }

  function tombstoneMatchesSnapshot(tombstone, snapshot) {
    var row = safeObject(tombstone);
    var subjectId = cleanLower(snapshot && snapshot.subjectId);
    return cleanLower(row.subjectId) === subjectId ||
      (cleanString(row.recordKind) === 'snapshot' && cleanString(row.recordId) === subjectId) ||
      (cleanString(row.recordKind) === SUBJECT_TYPE && cleanLower(row.subjectId) === subjectId);
  }
  function explicitTombstoneEvidencePresent(snapshot, input, warnings) {
    if (input && input.tombstonePresent === true) return true;
    var log = Array.isArray(input && input.tombstoneLog) ? input.tombstoneLog : [];
    var kernel = H2O.Desktop.Sync.kernel || null;
    for (var i = 0; i < log.length; i += 1) {
      var tombstone = log[i];
      if (kernel && typeof kernel.shapeTombstone === 'function') {
        try { tombstone = kernel.shapeTombstone(tombstone); } catch (_) { addCode(warnings, 'tombstone-shape-threw'); }
      }
      if (!tombstoneMatchesSnapshot(tombstone, snapshot)) continue;
      if (kernel && typeof kernel.isTombstoned === 'function') {
        try { if (kernel.isTombstoned(tombstone)) return true; } catch (_) { addCode(warnings, 'tombstone-status-threw'); }
      } else if (cleanString(tombstone.deletedAt) && !cleanString(tombstone.restoredAt)) {
        return true;
      }
    }
    return false;
  }
  function validateLifecycleWithKernel(snapshot, subjectId, peer, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (!kernel || typeof kernel.validateLifecycleTransition !== 'function') {
      addCode(warnings, 'lifecycle-framework-unavailable');
      return;
    }
    try {
      var result = kernel.validateLifecycleTransition({
        domain: 'snapshot',
        subjectType: SUBJECT_TYPE,
        subjectId: subjectId,
        transitionName: OPERATION,
        fromState: cleanString(snapshot.lifecycleState),
        toState: TARGET_LIFECYCLE_STATE,
        actorPeer: peer,
        reasonCode: 'snapshot-restore-proposal-candidate',
        transitionedAtIso: nowIsoSeconds()
      }, {
        domain: 'snapshot',
        allowedStates: ['archived', 'tombstoned', TARGET_LIFECYCLE_STATE],
        allowedTransitions: {
          archived: [TARGET_LIFECYCLE_STATE],
          tombstoned: [TARGET_LIFECYCLE_STATE]
        },
        requireTransitionRule: true,
        enforceNoSkippedState: false,
        requireActorPeer: true,
        privacyPolicy: {
          subjectType: SUBJECT_TYPE,
          redactionClass: 'redacted',
          forbiddenList: PRIVACY_FORBIDDEN_FIELDS,
          foreverNoFields: PRIVACY_FORBIDDEN_FIELDS
        }
      });
      codeList(result && result.blockers).forEach(function (code) { addCode(blockers, code); });
      codeList(result && result.warnings).forEach(function (code) { addCode(warnings, code); });
    } catch (_) {
      addCode(warnings, 'lifecycle-framework-validation-threw');
    }
  }

  async function buildPreflightProofDigest(preflight) {
    var p = safeObject(preflight);
    var snapshot = safeObject(p.canonicalSnapshot);
    return sha256Hex({
      schema: 'h2o.desktop.sync.snapshot-restore-preflight-proof.v1',
      subjectType: SUBJECT_TYPE,
      subjectId: cleanLower(snapshot.subjectId),
      revisionHash: cleanLower(snapshot.revisionHash),
      operation: DOMAIN_OPERATION,
      actionable: p.actionable === true,
      currentLifecycleState: cleanString(snapshot.lifecycleState),
      targetLifecycleState: TARGET_LIFECYCLE_STATE,
      validationSummary: safeObject(p.validationSummary)
    });
  }
  async function justifyingDigests(input, preflight, blockers) {
    var explicit = asArray(input.justifyingEvidenceDigests).map(cleanLower).filter(isSha256Hex);
    if (explicit.length) return explicit.filter(function (digest, index, arr) { return arr.indexOf(digest) === index; });
    var proofDigest = await buildPreflightProofDigest(preflight);
    if (!isSha256Hex(proofDigest)) {
      addCode(blockers, 'justifying-evidence-digests-unavailable');
      return [];
    }
    return [proofDigest];
  }
  async function expectedPostStateHash(subjectId, baseHash) {
    return sha256Hex({
      schema: 'h2o.desktop.sync.snapshot-restore-expected-post-state.v1',
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      baseHash: baseHash,
      lifecycleState: TARGET_LIFECYCLE_STATE,
      operation: OPERATION,
      predicateVersion: PREDICATE_VERSION
    });
  }
  function buildProposedOperation(subjectId, baseHash, targetHash, currentLifecycleState) {
    return {
      operation: OPERATION,
      operationIntent: OPERATION_INTENT,
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      baseHash: baseHash,
      targetHash: targetHash,
      lifecycleTransition: {
        fromState: cleanString(currentLifecycleState),
        toState: TARGET_LIFECYCLE_STATE
      },
      predicateVersion: PREDICATE_VERSION,
      sourceGate: 'snapshot-convergence-preflight.v1'
    };
  }
  function buildExpectedPostState(subjectId, baseHash, targetHash) {
    return {
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      baseHash: baseHash,
      expectedPostStateHash: targetHash,
      lifecycleState: TARGET_LIFECYCLE_STATE,
      predicateVersion: PREDICATE_VERSION
    };
  }
  function envelopeForEventDigest(envelope) {
    var clone = JSON.parse(JSON.stringify(envelope));
    delete clone.eventDigest;
    delete clone.warnings;
    delete clone.blockers;
    return clone;
  }
  function validateProposalEnvelope(envelope, blockers) {
    var env = safeObject(envelope);
    var payload = safeObject(env.payload);
    var op = safeObject(payload.proposedOperation);
    var expected = safeObject(payload.expectedPostState);
    if (env.schema !== ENVELOPE_SCHEMA) addCode(blockers, 'envelope-schema-too-new');
    if (env.envelopeVersion !== 'v1' || env.envelopeKindVersion !== 'v1') addCode(blockers, 'envelope-schema-too-new');
    if (env.kind !== ENVELOPE_KIND) addCode(blockers, 'envelope-schema-too-new');
    if (!cleanString(env.id) || !isSha256Hex(env.lineageId)) addCode(blockers, 'envelope-schema-too-new');
    if (cleanString(safeObject(env.sourcePlatform).platformId) !== 'desktop-studio') addCode(blockers, 'platform-not-authorized-for-kind');
    if (cleanString(safeObject(env.sourcePlatform).surfaceKind) !== 'desktop-tauri') addCode(blockers, 'surface-authority-mismatch');
    if (!validatePeer(safeObject(safeObject(env.sourcePlatform).sourcePeerEnvelope))) addCode(blockers, 'envelope-schema-too-new');
    if (env.declaredAuthority !== 'strong-local-authority') addCode(blockers, 'surface-authority-mismatch');
    if (env.effectiveAuthority !== 'strong-local-authority') addCode(blockers, 'surface-authority-mismatch');
    if (env.capabilityUsed !== 'propose') addCode(blockers, 'capability-not-on-platform-allowlist');
    if (!isSha256Hex(env.capabilitySnapshotHash)) addCode(blockers, 'envelope-schema-too-new');
    if (env.subjectType !== SUBJECT_TYPE || !isSha256Hex(env.subjectId)) addCode(blockers, 'envelope-schema-too-new');
    if (env.operation !== OPERATION || env.operationIntent !== OPERATION_INTENT) addCode(blockers, 'operation-intent-wrong-for-kind');
    if (env.redactionClass !== 'redacted') addCode(blockers, 'envelope-schema-too-new');
    if (env.dryRun !== null || env.transactional !== null) addCode(blockers, 'operation-intent-wrong-for-kind');
    if (!isSha256Hex(env.dedupeKey) || !isSha256Hex(env.payloadHash) || !isSha256Hex(env.eventDigest)) addCode(blockers, 'envelope-schema-too-new');
    if (!isIso(env.createdAt) || !isIso(env.expiresAt)) addCode(blockers, 'envelope-schema-too-new');
    if (!Array.isArray(payload.justifyingEvidenceDigests) || !payload.justifyingEvidenceDigests.length) addCode(blockers, 'envelope-schema-too-new');
    asArray(payload.justifyingEvidenceDigests).forEach(function (digest) {
      if (!isSha256Hex(digest)) addCode(blockers, 'envelope-schema-too-new');
    });
    if (!isObject(payload.proposedOperation)) addCode(blockers, 'envelope-schema-too-new');
    if (!isObject(payload.expectedPostState)) addCode(blockers, 'envelope-schema-too-new');
    if (payload.predicateVersion !== PREDICATE_VERSION) addCode(blockers, 'envelope-schema-too-new');
    if (op.operation !== OPERATION || op.operationIntent !== OPERATION_INTENT) addCode(blockers, 'operation-intent-wrong-for-kind');
    if (cleanString(safeObject(op.lifecycleTransition).toState) !== TARGET_LIFECYCLE_STATE) addCode(blockers, 'operation-intent-wrong-for-kind');
    if (expected.lifecycleState !== TARGET_LIFECYCLE_STATE) addCode(blockers, 'envelope-schema-too-new');
    if (!Array.isArray(env.warnings) || !Array.isArray(env.blockers)) addCode(blockers, 'envelope-schema-too-new');
    if (foreverNoKey(envelope)) addCode(blockers, 'payload-contains-forever-no-field');
  }
  function duplicateCandidate(ledger, dedupeKey, eventDigest, subjectId, baseHash, targetHash, blockers) {
    var rows = asArray(ledger && ledger.rows);
    for (var i = 0; i < rows.length; i += 1) {
      var row = safeObject(rows[i]);
      if (cleanString(row.dedupeKey) === dedupeKey) addCode(blockers, 'duplicate-proposal-candidate');
      if (eventDigest && cleanString(row.eventDigest) === eventDigest) addCode(blockers, 'duplicate-proposal-candidate');
      if (cleanLower(row.subjectId) === subjectId &&
          cleanLower(row.baseHash) === baseHash &&
          cleanLower(row.targetHash) === targetHash) {
        addCode(blockers, 'duplicate-proposal-candidate');
      }
    }
  }
  function scanCandidatePrivacy(value, blockers, warnings) {
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
  function validatePublicationMetadata(row, peer, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (!kernel || typeof kernel.validatePublicationMetadata !== 'function') {
      addCode(warnings, 'publication-kit-unavailable');
      return;
    }
    try {
      var result = kernel.validatePublicationMetadata({
        candidateKind: 'proposal',
        candidateRowId: row.rowId,
        envelopeId: row.envelopeId,
        lineageId: row.lineageId,
        subjectId: row.subjectId,
        eventDigest: row.eventDigest,
        dedupeKey: row.dedupeKey,
        sourceLedgerKey: LEDGER_KEY,
        actorPeer: peer,
        publicationStatus: STATUS_GENERATED,
        relayStatus: '',
        createdAtIso: row.generatedAtIso,
        domain: SUBJECT_TYPE
      }, {
        allowedCandidateKinds: ['proposal'],
        allowedPublicationStatuses: [STATUS_GENERATED],
        allowedRelayStatuses: [''],
        requireActorPeer: true,
        requireKnownSourceLedgerKey: true,
        privacyPolicy: {
          subjectType: SUBJECT_TYPE,
          redactionClass: 'redacted',
          forbiddenList: PRIVACY_FORBIDDEN_FIELDS,
          foreverNoFields: PRIVACY_FORBIDDEN_FIELDS
        }
      });
      codeList(result && result.blockers).forEach(function (code) { addCode(blockers, code); });
      codeList(result && result.warnings).forEach(function (code) { addCode(warnings, code); });
    } catch (_) {
      addCode(warnings, 'publication-kit-validation-threw');
    }
  }
  function replayRecheck(input, subjectId, baseHash, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    var replayLog = Array.isArray(input.replayLog)
      ? input.replayLog
      : (Array.isArray(input.consumedOperationsLog) ? input.consumedOperationsLog : null);
    if (!Array.isArray(replayLog) || !kernel || typeof kernel.composeReplayDefense !== 'function') return;
    try {
      var replay = kernel.composeReplayDefense({
        candidate: {
          subjectType: SUBJECT_TYPE,
          subjectId: subjectId,
          operation: DOMAIN_OPERATION,
          operationKind: 'snapshot.restore',
          revisionHash: baseHash,
          eventDigest: cleanString(input.eventDigest) || baseHash,
          dedupeKey: cleanString(input.dedupeKey) || baseHash
        }
      });
      if (replay && replay.ok === false) {
        addCode(blockers, 'snapshot-replay-unsafe');
        codeList(replay.blockers).forEach(function (code) { addCode(blockers, code); });
      }
      codeList(replay && replay.warnings).forEach(function (code) { addCode(warnings, code); });
    } catch (_) {
      addCode(warnings, 'replay-composer-threw');
    }
  }

  async function generateSnapshotRestoreProposalCandidate(input) {
    var args = safeObject(input);
    var blockers = [];
    var warnings = [];
    var requestedOperation = cleanString(args.operation) || DOMAIN_OPERATION;

    if (!webCryptoAvailable()) addCode(blockers, 'web-crypto-unavailable');
    if (!isObject(input)) addCode(blockers, 'input-missing');
    if (requestedOperation !== DOMAIN_OPERATION) addCode(blockers, 'operation-not-restore');
    if (requestedOperation === 'archive') addCode(blockers, 'archive-not-supported');
    if (requestedOperation === 'tombstone') addCode(blockers, 'tombstone-not-supported');
    if (!isObject(args.snapshotRecord)) addCode(blockers, 'snapshot-record-missing');
    if (blockers.length) return failure(blockers, warnings);

    if (typeof H2O.Desktop.Sync.runSnapshotConvergencePreflight !== 'function') {
      addCode(blockers, 'snapshot-preflight-unavailable');
      return failure(blockers, warnings);
    }

    var expectedTarget = isObject(args.expectedTarget)
      ? Object.assign({}, args.expectedTarget, { lifecycleState: TARGET_LIFECYCLE_STATE })
      : { lifecycleState: TARGET_LIFECYCLE_STATE };
    var preflight;
    try {
      preflight = await H2O.Desktop.Sync.runSnapshotConvergencePreflight(Object.assign({}, args, {
        operation: DOMAIN_OPERATION,
        expectedTarget: expectedTarget
      }));
    } catch (_) {
      addCode(blockers, 'preflight-threw');
      return failure(blockers, warnings);
    }
    codeList(preflight && preflight.warnings).forEach(function (code) { addCode(warnings, code); });
    if (!preflight || preflight.ok !== true) {
      codeList(preflight && preflight.blockers).forEach(function (code) { addCode(blockers, code); });
      addCode(blockers, 'preflight-not-ok');
      return failure(blockers, warnings, { preflightSummary: summarizePreflight(preflight) });
    }
    if (preflight.actionable !== true) {
      addCode(blockers, 'preflight-not-actionable');
      return failure(blockers, warnings, { preflightSummary: summarizePreflight(preflight) });
    }
    if (preflight.operation !== DOMAIN_OPERATION) {
      addCode(blockers, 'preflight-operation-not-restore');
      return failure(blockers, warnings, { preflightSummary: summarizePreflight(preflight) });
    }

    var snapshot = safeObject(preflight.canonicalSnapshot);
    if (!isSha256Hex(snapshot.subjectId)) addCode(blockers, 'canonical-subject-id-invalid');
    if (!isSha256Hex(snapshot.revisionHash)) addCode(blockers, 'canonical-revision-hash-invalid');
    var lifecycle = cleanString(snapshot.lifecycleState);
    if (lifecycle !== 'archived' && lifecycle !== 'tombstoned') addCode(blockers, 'snapshot-restore-transition-not-supported');
    var summary = safeObject(preflight.validationSummary);
    if (lifecycle === 'tombstoned') {
      if (summary.retentionWindowValid !== true) addCode(blockers, 'snapshot-retention-window-required-for-tombstone-restore');
      if (!explicitTombstoneEvidencePresent(snapshot, args, warnings)) addCode(blockers, 'snapshot-tombstone-evidence-required-for-restore');
    }
    if (blockers.length) return failure(blockers, warnings, { preflightSummary: summarizePreflight(preflight) });

    var peer = await sourcePeerEnvelope(args, blockers);
    if (blockers.length) return failure(blockers, warnings, { preflightSummary: summarizePreflight(preflight) });

    var identity = await buildIdentity(snapshot, peer, blockers, warnings);
    if (blockers.length || !identity) return failure(blockers, warnings, { preflightSummary: summarizePreflight(preflight) });
    validateLifecycleWithKernel(snapshot, identity.subjectId, peer, blockers, warnings);

    var subjectId = identity.subjectId;
    var baseHash = cleanLower(snapshot.revisionHash);
    var targetHash = await expectedPostStateHash(subjectId, baseHash);
    if (!isSha256Hex(targetHash)) addCode(blockers, 'target-hash-generation-failed');
    var justifyingEvidenceDigests = await justifyingDigests(args, preflight, blockers);
    replayRecheck(args, subjectId, baseHash, blockers, warnings);

    var ledger = null;
    if (!blockers.length) {
      try {
        ledger = normalizeLedger(await storageGet(LEDGER_KEY));
      } catch (_) {
        addCode(blockers, 'proposal-ledger-unavailable');
      }
      if (!ledger) addCode(blockers, 'proposal-ledger-malformed');
      else duplicateCandidate(ledger, identity.dedupeKey, '', subjectId, baseHash, targetHash, blockers);
    }
    if (blockers.length) return failure(blockers, warnings, { preflightSummary: summarizePreflight(preflight) });

    var createdAt = nowIsoSeconds();
    var expiresAt = addMinutesIso(EXPIRES_AFTER_MINUTES);
    var proposedOperation = buildProposedOperation(subjectId, baseHash, targetHash, snapshot.lifecycleState);
    var expectedPostState = buildExpectedPostState(subjectId, baseHash, targetHash);
    var payload = {
      justifyingEvidenceDigests: justifyingEvidenceDigests,
      proposedOperation: proposedOperation,
      expectedPostState: expectedPostState,
      predicateVersion: PREDICATE_VERSION
    };
    var payloadHash = await sha256Hex(payload);
    var capabilitySnapshotHash = await sha256Hex(CAPABILITY_TAG);
    if (!isSha256Hex(payloadHash)) addCode(blockers, 'payload-hash-generation-failed');
    if (!isSha256Hex(capabilitySnapshotHash)) addCode(blockers, 'capability-hash-generation-failed');
    if (blockers.length) return failure(blockers, warnings, { preflightSummary: summarizePreflight(preflight) });

    var envelopeBase = {
      schema: ENVELOPE_SCHEMA,
      envelopeVersion: 'v1',
      envelopeKindVersion: 'v1',
      kind: ENVELOPE_KIND,
      id: generateUuid(),
      lineageId: identity.lineageId,
      createdAt: createdAt,
      expiresAt: expiresAt,
      sequence: null,
      exportSequence: null,
      sourcePlatform: {
        platformId: 'desktop-studio',
        surfaceKind: 'desktop-tauri',
        sourcePeerEnvelope: peer
      },
      declaredAuthority: 'strong-local-authority',
      effectiveAuthority: 'strong-local-authority',
      capabilityUsed: 'propose',
      capabilitySnapshotHash: capabilitySnapshotHash,
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      operation: OPERATION,
      operationIntent: OPERATION_INTENT,
      redactionClass: 'redacted',
      dryRun: null,
      transactional: null,
      dedupeKey: identity.dedupeKey,
      payloadHash: payloadHash,
      payload: payload
    };
    var eventDigest = await sha256Hex(envelopeForEventDigest(envelopeBase));
    if (!isSha256Hex(eventDigest)) addCode(blockers, 'event-digest-generation-failed');
    var envelope = Object.assign({}, envelopeBase, {
      eventDigest: eventDigest,
      warnings: warnings.slice(),
      blockers: []
    });
    validateProposalEnvelope(envelope, blockers);
    scanCandidatePrivacy(envelope, blockers, warnings);
    if (blockers.length) return failure(blockers, warnings, { preflightSummary: summarizePreflight(preflight) });

    var row = {
      schema: ROW_SCHEMA,
      rowId: generateUuid(),
      envelopeId: envelope.id,
      lineageId: envelope.lineageId,
      subjectId: subjectId,
      operation: OPERATION,
      operationIntent: OPERATION_INTENT,
      baseHash: baseHash,
      targetHash: targetHash,
      justifyingEvidenceDigests: justifyingEvidenceDigests.slice(),
      predicateVersion: PREDICATE_VERSION,
      generatedAtIso: createdAt,
      expiresAt: expiresAt,
      dedupeKey: identity.dedupeKey,
      eventDigest: eventDigest,
      actorPeer: peer,
      status: STATUS_GENERATED,
      sourceDomain: SUBJECT_TYPE,
      targetState: { lifecycleState: TARGET_LIFECYCLE_STATE },
      canonicalSnapshotSummary: {
        subjectId: subjectId,
        revisionHash: baseHash,
        originChatSubjectIdHash: isSha256Hex(snapshot.originChatSubjectIdHash) ? cleanLower(snapshot.originChatSubjectIdHash) : '',
        originAccountIdHash: isSha256Hex(snapshot.originAccountIdHash) ? cleanLower(snapshot.originAccountIdHash) : '',
        schemaVersion: cleanString(snapshot.schemaVersion),
        lifecycleState: cleanString(snapshot.lifecycleState)
      },
      validationSummary: summarizePreflight(preflight),
      serializedEnvelope: canonicalJson(envelope)
    };
    validatePublicationMetadata(row, peer, blockers, warnings);
    scanCandidatePrivacy(row, blockers, warnings);
    if (blockers.length) return failure(blockers, warnings, { preflightSummary: summarizePreflight(preflight) });

    duplicateCandidate(ledger, identity.dedupeKey, eventDigest, subjectId, baseHash, targetHash, blockers);
    if (blockers.length) return failure(blockers, warnings, { preflightSummary: summarizePreflight(preflight) });

    var next = {
      schema: LEDGER_SCHEMA,
      createdAtIso: ledger.createdAtIso,
      updatedAtIso: createdAt,
      rows: ledger.rows.concat([row])
    };
    try {
      await storageSet(LEDGER_KEY, next);
    } catch (_) {
      return failure(['proposal-ledger-write-failed'], warnings, { preflightSummary: summarizePreflight(preflight) });
    }

    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: true,
      status: STATUS_GENERATED,
      generated: true,
      noop: false,
      proposalCandidate: envelope,
      candidateRow: rowSummary(row),
      candidateId: row.rowId,
      preflightSummary: summarizePreflight(preflight),
      blockers: [],
      warnings: codeList(warnings)
    };
  }

  H2O.Desktop.Sync.generateSnapshotRestoreProposalCandidate = generateSnapshotRestoreProposalCandidate;
  H2O.Desktop.Sync.__snapshotRestoreProposalInstalled = true;
  H2O.Desktop.Sync.__snapshotRestoreProposalVersion = VERSION;
  H2O.Desktop.Sync.__snapshotRestoreProposalLedgerKey = LEDGER_KEY;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
