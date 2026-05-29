/* H2O Desktop Sync - F12.0.3 delete proposal candidate generation
 *
 * Desktop/Tauri-only delete proposal candidate generator.
 *
 * Safety invariants:
 *   - Candidate generation only. No delete, tombstone minting, F5 handoff,
 *     publication, outbox enqueue, applyEvent, convergence action, WebDAV,
 *     remote apply, automatic merge, or mobile write-back.
 *   - Inputs must pass the F12.0.2 delete convergence preflight. Delete
 *     proposals are operator-elected; they are never auto-eligible.
 *   - The generated proposal stores redacted hashes/counts only and includes
 *     F5-required predicate data.
 */
(function (global) {
  'use strict';

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* ignore */ }
    return false;
  }
  if (!detectTauri()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Desktop = H2O.Desktop || {};
  H2O.Desktop.Sync = H2O.Desktop.Sync || {};
  if (H2O.Desktop.Sync.__deleteProposalCandidateInstalled) return;

  var RESULT_SCHEMA = 'h2o.desktop.sync.delete-proposal-candidate.v1';
  var LEDGER_SCHEMA = 'h2o.desktop.sync.convergence-proposal-candidate-ledger.v1';
  var ROW_SCHEMA = 'h2o.desktop.sync.convergence-proposal-candidate-row.v1';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var VERSION = '0.1.0-f12.0.3';
  var LEDGER_KEY = 'h2o:sync:convergence-proposal-candidates:v1';
  var APPROVAL_TOKEN = 'I_APPROVE_DELETE_PROPOSAL_CANDIDATE';
  var PREDICATE_VERSION = 'h2o.folder-delete.predicate.v1';
  var F5_PREDICATE_VERSION = 'h2o.studio.sync.f5-reviewed-delete.v1';
  var CAPABILITY_TAG = 'h2o.platform.capabilities.v1#f12.0.3-desktop-delete-proposal-v1';
  var OPERATION = 'folder-metadata-delete-proposed';
  var SUBJECT_TYPE = 'folder.metadata';
  var STATUS_GENERATED = 'generated';
  var EXPIRES_AFTER_MINUTES = 20;
  var BLOCKED_BUCKETS = ['alreadyConverged', 'needsPreview', 'conflicted', 'blocked', 'stale', 'replay', 'proposalEligible'];
  var DELETE_BUCKETS = ['deleted', 'delete', 'destructive', 'destructiveReview', 'deleteReview'];
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'attachments',
    'name', 'title', 'folderName', 'chatTitle', 'rawId', 'chatId',
    'folderId', 'targetFolderId', 'parentId', 'targetParentId',
    'sourceParentId', 'path', 'url', 'password', 'apiKey',
    'proposedName', 'targetName', 'previousName', 'rawName'
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

  function nowIsoSeconds() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

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
    }).filter(Boolean);
  }

  function isSha256Hex(value) {
    return /^[0-9a-f]{64}$/.test(cleanString(value));
  }

  function isStateHash(value) {
    var text = cleanString(value);
    return (text.length === 8 || text.length === 64) && /^[0-9a-fA-F]+$/.test(text);
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!isObject(value)) return value;
    var out = {};
    Object.keys(value).sort().forEach(function (key) {
      out[key] = canonicalize(value[key]);
    });
    return out;
  }

  function canonicalJson(value) {
    return JSON.stringify(canonicalize(value));
  }

  function webCryptoAvailable() {
    try {
      return !!(global.crypto && global.crypto.subtle && global.crypto.subtle.digest);
    } catch (_) {
      return false;
    }
  }

  function bytesToHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i += 1) {
      var part = bytes[i].toString(16);
      hex += part.length === 1 ? '0' + part : part;
    }
    return hex;
  }

  async function sha256Hex(value) {
    if (!webCryptoAvailable()) return '';
    var text = typeof value === 'string' ? value : String(value == null ? '' : value);
    var data = new TextEncoder().encode(text);
    var buffer = await global.crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(buffer));
  }

  function generateUuid() {
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
      if (/Token$/.test(key) && key !== 'previewToken') return key;
      var childHit = foreverNoKey(value[key]);
      if (childHit) return childHit;
    }
    return '';
  }

  function failure(blockers, warnings) {
    return {
      schema: RESULT_SCHEMA,
      ok: false,
      proposalCandidate: null,
      candidateId: null,
      blockers: codeList(blockers),
      warnings: codeList(warnings)
    };
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

  function sourceEntry(input) {
    var args = safeObject(input);
    return safeObject(args.plannerEntry || args.entry || args.candidate);
  }

  function entrySubject(entry) {
    return cleanString(entry.subjectId).toLowerCase();
  }

  function entryLineage(entry) {
    return cleanString(entry.lineageId);
  }

  function entryEventDigest(entry) {
    return cleanString(entry.eventDigest).toLowerCase();
  }

  function entryBaseHash(entry) {
    var payload = safeObject(entry.payload);
    var preview = safeObject(payload.proposalPreview);
    return cleanString(entry.baseHash ||
      entry.localRevisionHash ||
      entry.preStateHash ||
      entry.commonAncestorHash ||
      safeObject(entry.localState).revisionHash ||
      safeObject(entry.baseState).revisionHash ||
      safeObject(entry.proposedOperation).baseHash ||
      safeObject(payload.proposedOperation).baseHash ||
      preview.baseHash).toLowerCase();
  }

  function entryJustifyingDigests(entry) {
    var explicit = asArray(entry.justifyingEvidenceDigests)
      .map(cleanString)
      .map(function (value) { return value.toLowerCase(); })
      .filter(isSha256Hex);
    if (explicit.length) return explicit;
    var payload = safeObject(entry.payload);
    var payloadExplicit = asArray(payload.justifyingEvidenceDigests)
      .map(cleanString)
      .map(function (value) { return value.toLowerCase(); })
      .filter(isSha256Hex);
    if (payloadExplicit.length) return payloadExplicit;
    var eventDigest = entryEventDigest(entry);
    return isSha256Hex(eventDigest) ? [eventDigest] : [];
  }

  function entrySourceBucket(entry) {
    return cleanString(entry.bucket || entry.sourceBucket || entry.bucketName);
  }

  function validateSourceBucket(entry, blockers) {
    var bucket = entrySourceBucket(entry);
    if (!bucket) return;
    if (BLOCKED_BUCKETS.indexOf(bucket) !== -1) {
      addCode(blockers, 'planner-entry-' + bucket);
      addCode(blockers, 'source-bucket-not-delete-review');
      return;
    }
    if (DELETE_BUCKETS.indexOf(bucket) === -1) addCode(blockers, 'source-bucket-not-delete-review');
  }

  function validateEntryFields(entry, blockers) {
    var subjectId = entrySubject(entry);
    if (!subjectId) addCode(blockers, 'subject-id-required');
    else if (!isSha256Hex(subjectId)) addCode(blockers, 'subject-id-invalid');
    if (!entryLineage(entry)) addCode(blockers, 'lineage-id-required');
    if (!isStateHash(entryBaseHash(entry))) addCode(blockers, 'baseHash-unavailable');
    if (!entryJustifyingDigests(entry).length) addCode(blockers, 'justifyingEvidenceDigests-unavailable');
  }

  async function adjustedReadiness(blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.checkConvergenceReadiness !== 'function') {
      addCode(blockers, 'convergence-readiness-unavailable');
      return null;
    }
    var readiness;
    try {
      readiness = safeObject(await sync.checkConvergenceReadiness());
    } catch (_) {
      addCode(blockers, 'convergence-readiness-read-failed');
      return null;
    }
    var ready = safeObject(readiness.readiness);
    ready.proposalWorkflowAvailable = true;
    if (ready.relayIndexReady === true && ready.applyLedgerReadable === true) {
      ready.lineageTrackingAvailable = true;
    }
    readiness.readiness = ready;
    readiness.blockers = codeList(readiness.blockers).filter(function (code) {
      return code !== 'proposal-workflow-unavailable' && code !== 'lineage-tracking-unavailable';
    });
    readiness.ok = readiness.blockers.length === 0;
    codeList(readiness.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(readiness.warnings).forEach(function (code) { addCode(warnings, code); });
    return readiness;
  }

  async function runDeleteChecks(entry, blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.runDeleteConvergencePreflight !== 'function') {
      addCode(blockers, 'delete-convergence-preflight-unavailable');
      return null;
    }
    var preflight;
    try {
      preflight = safeObject(await sync.runDeleteConvergencePreflight({ plannerEntry: entry }));
    } catch (_) {
      addCode(blockers, 'delete-convergence-preflight-failed');
      return null;
    }
    codeList(preflight.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(preflight.warnings).forEach(function (code) { addCode(warnings, code); });

    if (preflight.actionable !== true) addCode(blockers, 'delete-preflight-not-actionable');
    if (preflight.subjectResolved !== true) addCode(blockers, 'subject-not-resolved');
    if (preflight.folderExists !== true) addCode(blockers, 'folder-missing');
    if (preflight.emptyFolder !== true) addCode(blockers, 'folder-not-empty');
    if (preflight.baseFresh !== true) addCode(blockers, 'baseline-hash-not-verified');
    if (preflight.deleteVsEditConflict === true) addCode(blockers, 'delete-vs-edit-conflict');
    if (preflight.recoveryReady !== true) addCode(blockers, 'recovery-precondition-unmet');
    if (preflight.tombstoneCapable !== true) addCode(blockers, 'f5-tombstone-path-unavailable');
    return preflight;
  }

  async function sourcePeerEnvelope(blockers) {
    var identity = H2O.Studio && H2O.Studio.identity;
    var raw = null;
    try {
      if (identity && typeof identity.get === 'function') raw = identity.get();
    } catch (_) {
      raw = null;
    }
    if (!isObject(raw) || !cleanString(raw.physicalDeviceId) ||
        !cleanString(raw.installId) || !cleanString(raw.syncPeerId)) {
      addCode(blockers, 'invalid-peer-identity');
      return null;
    }
    return {
      physicalDeviceIdHash: await sha256Hex(cleanString(raw.physicalDeviceId)),
      installIdHash: await sha256Hex(cleanString(raw.installId)),
      syncPeerIdHash: await sha256Hex(cleanString(raw.syncPeerId)),
      surfaceKind: 'desktop-tauri'
    };
  }

  function validatePeer(peer) {
    return isSha256Hex(peer && peer.physicalDeviceIdHash) &&
      isSha256Hex(peer && peer.installIdHash) &&
      isSha256Hex(peer && peer.syncPeerIdHash) &&
      cleanString(peer && peer.surfaceKind) === 'desktop-tauri';
  }

  async function buildExpectedPostState(entry, expectedPostStateHash) {
    return {
      subjectType: SUBJECT_TYPE,
      subjectId: entrySubject(entry),
      baseHash: entryBaseHash(entry),
      state: 'absent-or-tombstoned',
      membershipCount: 0,
      childFolderCount: 0,
      expectedPostStateHash: expectedPostStateHash,
      predicateVersion: PREDICATE_VERSION,
      f5PredicateVersion: F5_PREDICATE_VERSION
    };
  }

  async function expectedPostStateHash(entry) {
    return sha256Hex(canonicalJson({
      subjectType: SUBJECT_TYPE,
      subjectId: entrySubject(entry),
      baseHash: entryBaseHash(entry),
      state: 'absent-or-tombstoned',
      membershipCount: 0,
      childFolderCount: 0,
      predicateVersion: PREDICATE_VERSION,
      f5PredicateVersion: F5_PREDICATE_VERSION
    }));
  }

  function buildProposedOperation(entry, expectedHash) {
    return {
      operation: OPERATION,
      operationIntent: 'delete',
      subjectType: SUBJECT_TYPE,
      subjectId: entrySubject(entry),
      baseHash: entryBaseHash(entry),
      expectedPostStateHash: expectedHash,
      emptyFolder: true,
      membershipCount: 0,
      childFolderCount: 0,
      recoveryRequired: true,
      tombstoneRequired: true,
      predicateVersion: PREDICATE_VERSION,
      f5PredicateVersion: F5_PREDICATE_VERSION,
      sourceBucket: 'delete-materialized'
    };
  }

  function validateProposalEnvelope(envelope, blockers) {
    var env = safeObject(envelope);
    var payload = safeObject(env.payload);
    var op = safeObject(payload.proposedOperation);
    var expected = safeObject(payload.expectedPostState);
    if (env.schema !== ENVELOPE_SCHEMA) addCode(blockers, 'envelope-schema-too-new');
    if (env.envelopeVersion !== 'v1' || env.envelopeKindVersion !== 'v1') addCode(blockers, 'envelope-schema-too-new');
    if (env.kind !== 'proposal') addCode(blockers, 'envelope-schema-too-new');
    if (!cleanString(env.id) || !cleanString(env.lineageId)) addCode(blockers, 'envelope-schema-too-new');
    if (env.sourcePlatform && cleanString(env.sourcePlatform.platformId) !== 'desktop-studio') addCode(blockers, 'platform-not-authorized-for-kind');
    if (env.sourcePlatform && cleanString(env.sourcePlatform.surfaceKind) !== 'desktop-tauri') addCode(blockers, 'surface-authority-mismatch');
    if (!validatePeer(safeObject(safeObject(env.sourcePlatform).sourcePeerEnvelope))) addCode(blockers, 'envelope-schema-too-new');
    if (env.declaredAuthority !== 'strong-local-authority') addCode(blockers, 'surface-authority-mismatch');
    if (env.effectiveAuthority !== 'strong-local-authority') addCode(blockers, 'surface-authority-mismatch');
    if (env.capabilityUsed !== 'propose') addCode(blockers, 'capability-not-on-platform-allowlist');
    if (!isSha256Hex(env.capabilitySnapshotHash)) addCode(blockers, 'envelope-schema-too-new');
    if (env.subjectType !== SUBJECT_TYPE || !isSha256Hex(env.subjectId)) addCode(blockers, 'envelope-schema-too-new');
    if (env.operation !== OPERATION || env.operationIntent !== 'delete') addCode(blockers, 'operation-intent-wrong-for-kind');
    if (env.redactionClass !== 'redacted') addCode(blockers, 'envelope-schema-too-new');
    if (env.dryRun !== null || env.transactional !== null) addCode(blockers, 'operation-intent-wrong-for-kind');
    if (!isSha256Hex(env.dedupeKey) || !isSha256Hex(env.payloadHash) || !isSha256Hex(env.eventDigest)) addCode(blockers, 'envelope-schema-too-new');
    if (!Array.isArray(payload.justifyingEvidenceDigests) || !payload.justifyingEvidenceDigests.length) {
      addCode(blockers, 'delete-proposal-missing-f5-predicate');
    }
    asArray(payload.justifyingEvidenceDigests).forEach(function (digest) {
      if (!isSha256Hex(digest)) addCode(blockers, 'delete-proposal-missing-f5-predicate');
    });
    if (!isObject(payload.proposedOperation)) addCode(blockers, 'envelope-schema-too-new');
    if (!isObject(payload.expectedPostState)) addCode(blockers, 'envelope-schema-too-new');
    if (!cleanString(payload.predicateVersion)) addCode(blockers, 'delete-proposal-missing-f5-predicate');
    if (op.operationIntent !== 'delete' || op.operation !== OPERATION) addCode(blockers, 'operation-intent-wrong-for-kind');
    if (expected.state !== 'absent-or-tombstoned') addCode(blockers, 'envelope-schema-too-new');
    if (expected.membershipCount !== 0 || expected.childFolderCount !== 0) addCode(blockers, 'folder-not-empty');
    if (!Array.isArray(env.warnings) || !Array.isArray(env.blockers)) addCode(blockers, 'envelope-schema-too-new');
    var forbidden = foreverNoKey(envelope);
    if (forbidden) addCode(blockers, 'payload-contains-forever-no-field');
  }

  function envelopeForEventDigest(envelope) {
    var clone = JSON.parse(JSON.stringify(envelope));
    delete clone.eventDigest;
    delete clone.warnings;
    delete clone.blockers;
    return clone;
  }

  function duplicateCandidate(ledger, dedupeKey, eventDigest, subjectId, baseHash, expectedHash, blockers) {
    var rows = asArray(ledger && ledger.rows);
    for (var i = 0; i < rows.length; i += 1) {
      var row = safeObject(rows[i]);
      if (cleanString(row.dedupeKey) === dedupeKey) addCode(blockers, 'duplicate-proposal-candidate');
      if (eventDigest && cleanString(row.eventDigest) === eventDigest) addCode(blockers, 'duplicate-proposal-candidate');
      if (cleanString(row.subjectId) === subjectId &&
          cleanString(row.baseHash).toLowerCase() === baseHash &&
          cleanString(row.targetHash).toLowerCase() === expectedHash) {
        addCode(blockers, 'duplicate-proposal-candidate');
      }
    }
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

  async function generateDeleteProposalCandidate(input) {
    var args = safeObject(input);
    var entry = sourceEntry(args);
    var blockers = [];
    var warnings = [];

    if (!webCryptoAvailable()) addCode(blockers, 'web-crypto-unavailable');
    if (cleanString(args.operatorApprovalToken) !== APPROVAL_TOKEN) {
      addCode(blockers, 'operator-approval-token-required');
    }
    validateSourceBucket(entry, blockers);
    validateEntryFields(entry, blockers);

    var forbiddenInput = foreverNoKey(entry);
    if (forbiddenInput) {
      addCode(blockers, 'delete-entry-contains-forbidden-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbiddenInput);
    }

    await runDeleteChecks(entry, blockers, warnings);
    await adjustedReadiness(blockers, warnings);

    var subjectId = entrySubject(entry);
    var baseHash = entryBaseHash(entry);
    var lineageId = entryLineage(entry);
    var justifyingEvidenceDigests = entryJustifyingDigests(entry);
    var peer = await sourcePeerEnvelope(blockers);

    var expectedHash = '';
    var capabilitySnapshotHash = '';
    var payloadHash = '';
    var dedupeKey = '';
    if (!blockers.length) {
      expectedHash = await expectedPostStateHash(entry);
      capabilitySnapshotHash = await sha256Hex(CAPABILITY_TAG);
      dedupeKey = await sha256Hex(canonicalJson({
        schema: ENVELOPE_SCHEMA,
        kind: 'proposal',
        subjectType: SUBJECT_TYPE,
        operation: OPERATION,
        operationIntent: 'delete',
        subjectId: subjectId,
        baseHash: baseHash,
        expectedPostStateHash: expectedHash,
        actorPeerSyncHash: cleanString(peer && peer.syncPeerIdHash),
        predicateVersion: PREDICATE_VERSION
      }));
    }

    var ledger = null;
    if (!blockers.length) {
      try {
        ledger = normalizeLedger(await storageGet(LEDGER_KEY));
      } catch (_) {
        addCode(blockers, 'proposal-ledger-unavailable');
      }
      if (!ledger) addCode(blockers, 'proposal-ledger-malformed');
      else duplicateCandidate(
        ledger,
        dedupeKey,
        entryEventDigest(entry),
        subjectId,
        baseHash,
        expectedHash,
        blockers
      );
    }

    if (blockers.length) return failure(blockers, warnings);

    var createdAt = nowIsoSeconds();
    var expiresAt = addMinutesIso(EXPIRES_AFTER_MINUTES);
    var proposedOperation = buildProposedOperation(entry, expectedHash);
    var expectedPostState = await buildExpectedPostState(entry, expectedHash);
    var payload = {
      justifyingEvidenceDigests: justifyingEvidenceDigests,
      proposedOperation: proposedOperation,
      expectedPostState: expectedPostState,
      predicateVersion: PREDICATE_VERSION
    };
    payloadHash = await sha256Hex(canonicalJson(payload));
    var envelopeBase = {
      schema: ENVELOPE_SCHEMA,
      envelopeVersion: 'v1',
      envelopeKindVersion: 'v1',
      kind: 'proposal',
      id: generateUuid(),
      lineageId: lineageId,
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
      operationIntent: 'delete',
      redactionClass: 'redacted',
      dryRun: null,
      transactional: null,
      dedupeKey: dedupeKey,
      payloadHash: payloadHash,
      payload: payload
    };
    var eventDigest = await sha256Hex(canonicalJson(envelopeForEventDigest(envelopeBase)));
    var envelope = Object.assign({}, envelopeBase, {
      eventDigest: eventDigest,
      warnings: warnings.slice(),
      blockers: []
    });
    validateProposalEnvelope(envelope, blockers);
    if (blockers.length) return failure(blockers, warnings);

    var row = {
      schema: ROW_SCHEMA,
      rowId: generateUuid(),
      envelopeId: envelope.id,
      lineageId: envelope.lineageId,
      subjectId: subjectId,
      operation: OPERATION,
      operationIntent: 'delete',
      baseHash: baseHash,
      targetHash: expectedHash,
      expectedPostStateHash: expectedHash,
      justifyingEvidenceDigests: justifyingEvidenceDigests.slice(),
      predicateVersion: PREDICATE_VERSION,
      f5PredicateVersion: F5_PREDICATE_VERSION,
      generatedAtIso: createdAt,
      expiresAt: expiresAt,
      dedupeKey: dedupeKey,
      eventDigest: eventDigest,
      actorPeer: peer,
      status: STATUS_GENERATED,
      serializedEnvelope: canonicalJson(envelope)
    };
    var forbidden = foreverNoKey(row);
    if (forbidden) return failure(['proposal-ledger-row-contains-forbidden-field'], warnings);

    var next = {
      schema: LEDGER_SCHEMA,
      createdAtIso: ledger.createdAtIso,
      updatedAtIso: createdAt,
      rows: ledger.rows.concat([row])
    };
    try {
      await storageSet(LEDGER_KEY, next);
    } catch (_) {
      return failure(['proposal-ledger-write-failed'], warnings);
    }

    return {
      schema: RESULT_SCHEMA,
      ok: true,
      proposalCandidate: envelope,
      candidateId: row.rowId,
      ledgerRow: rowSummary(row),
      blockers: [],
      warnings: warnings.slice()
    };
  }

  H2O.Desktop.Sync.generateDeleteProposalCandidate = generateDeleteProposalCandidate;
  H2O.Desktop.Sync.__deleteProposalCandidateInstalled = true;
  H2O.Desktop.Sync.__deleteProposalCandidateVersion = VERSION;
  H2O.Desktop.Sync.__deleteProposalCandidateApprovalToken = APPROVAL_TOKEN;
  H2O.Desktop.Sync.__deleteProposalCandidateLedgerKey = LEDGER_KEY;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
