/* H2O Desktop Sync - F10.9.3 rename proposal candidate generation
 *
 * Desktop/Tauri-only rename proposal candidate generator.
 *
 * Safety invariants:
 *   - Candidate generation only. No rename, apply, publication, outbox enqueue,
 *     applyEvent, conflictCandidate, convergence, WebDAV, remote apply,
 *     automatic merge, or mobile write-back.
 *   - proposedName is local input only. The cleartext name is passed only to
 *     existing read-only F10.9 preflight/materialization diagnostics. It is
 *     never returned, persisted, enqueued, uploaded, or stored in the envelope.
 *   - The generated proposal stores targetNameHash only.
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
  if (H2O.Desktop.Sync.__renameProposalCandidateInstalled) return;

  var RESULT_SCHEMA = 'h2o.desktop.sync.rename-proposal-candidate.v1';
  var LEDGER_SCHEMA = 'h2o.desktop.sync.convergence-proposal-candidate-ledger.v1';
  var ROW_SCHEMA = 'h2o.desktop.sync.convergence-proposal-candidate-row.v1';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var VERSION = '0.1.0-f10.9.3';
  var LEDGER_KEY = 'h2o:sync:convergence-proposal-candidates:v1';
  var APPROVAL_TOKEN = 'I_APPROVE_RENAME_PROPOSAL_CANDIDATE';
  var PREDICATE_VERSION = 'h2o.folder-sync.rename-predicate.v1';
  var NORMALIZATION_VERSION = 'h2o.folder-name-normalization.nfc-trim.v1';
  var CAPABILITY_TAG = 'h2o.platform.capabilities.v1#f10.9.3-desktop-rename-proposal-v1';
  var OPERATION = 'folder-metadata-rename-proposal';
  var SUBJECT_TYPE = 'folder.metadata';
  var STATUS_GENERATED = 'generated';
  var EXPIRES_AFTER_MINUTES = 30;
  var OTHER_BUCKETS = ['alreadyConverged', 'needsPreview', 'conflicted', 'blocked', 'stale', 'replay'];
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'attachments',
    'name', 'title', 'folderName', 'chatTitle', 'rawId', 'chatId',
    'folderId', 'targetFolderId', 'path', 'url', 'password', 'apiKey',
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
    return cleanString(entry.baseHash || entry.localRevisionHash).toLowerCase();
  }

  function entryTargetHash(entry) {
    return cleanString(entry.targetHash || entry.remoteRevisionHash || entry.revisionHash).toLowerCase();
  }

  function entryChangedFields(entry) {
    return asArray(entry.changedFields).map(cleanString).filter(Boolean).sort();
  }

  function entryJustifyingDigests(entry) {
    var explicit = asArray(entry.justifyingEvidenceDigests)
      .map(cleanString)
      .map(function (value) { return value.toLowerCase(); })
      .filter(isSha256Hex);
    if (explicit.length) return explicit;
    var eventDigest = entryEventDigest(entry);
    return isSha256Hex(eventDigest) ? [eventDigest] : [];
  }

  function entrySourceBucket(entry) {
    return cleanString(entry.bucket || entry.sourceBucket);
  }

  function targetNameHashFromObject(value) {
    var obj = safeObject(value);
    return cleanString(obj.targetNameHash || obj.proposedNameHash || obj.expectedNameHash).toLowerCase();
  }

  function entryTargetNameHash(entry) {
    var direct = targetNameHashFromObject(entry);
    if (isSha256Hex(direct)) return direct;
    var payload = safeObject(entry.payload);
    var proposalPreview = safeObject(payload.proposalPreview);
    var candidates = [
      entry.expectedPostState,
      entry.proposedOperation,
      entry.renameMaterialization,
      entry.remoteState,
      payload.expectedPostState,
      payload.proposedOperation,
      proposalPreview.expectedPostState,
      proposalPreview.proposedOperation,
      proposalPreview.renameMaterialization
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var hash = targetNameHashFromObject(candidates[i]);
      if (isSha256Hex(hash)) return hash;
    }
    return '';
  }

  function validateSourceBucket(entry, blockers) {
    var bucket = entrySourceBucket(entry);
    if (!bucket) return;
    if (OTHER_BUCKETS.indexOf(bucket) !== -1) addCode(blockers, 'planner-entry-' + bucket);
  }

  function validateEntryFields(entry, blockers) {
    if (!entrySubject(entry)) addCode(blockers, 'subject-id-required');
    else if (!isSha256Hex(entrySubject(entry))) addCode(blockers, 'subject-id-invalid');
    if (!entryLineage(entry)) addCode(blockers, 'lineage-id-required');
    if (!isStateHash(entryBaseHash(entry))) addCode(blockers, 'baseHash-unavailable');
    if (!isStateHash(entryTargetHash(entry))) addCode(blockers, 'targetHash-unavailable');
    var fields = entryChangedFields(entry);
    if (!fields.length) addCode(blockers, 'changedFields-unavailable');
    if (fields.length !== 1 || fields[0] !== 'name') addCode(blockers, 'field-not-allowlisted');
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

  async function verifyCurrentBaseline(entry, blockers, warnings) {
    var diagnostics = H2O.Studio && H2O.Studio.diagnostics ? H2O.Studio.diagnostics : {};
    if (typeof diagnostics.canonicalizeFolderSnapshot !== 'function') {
      addCode(blockers, 'canonical-snapshot-unavailable');
      return false;
    }
    var snapshot;
    try {
      snapshot = safeObject(await diagnostics.canonicalizeFolderSnapshot({ redactionClass: 'redacted' }));
    } catch (_) {
      addCode(blockers, 'canonical-snapshot-read-failed');
      return false;
    }
    codeList(snapshot.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(snapshot.warnings).forEach(function (code) { addCode(warnings, code); });
    if (snapshot.ok !== true) {
      addCode(blockers, 'canonical-snapshot-not-ready');
      return false;
    }
    var subjectId = entrySubject(entry);
    var current = null;
    asArray(snapshot.objects).forEach(function (object) {
      var row = safeObject(object);
      if (cleanString(row.subjectId).toLowerCase() === subjectId) current = row;
    });
    if (!current) {
      addCode(blockers, 'subject-not-resolved');
      return false;
    }
    var currentHash = cleanString(current.revisionHash).toLowerCase();
    if (!currentHash || currentHash !== entryBaseHash(entry)) {
      addCode(blockers, 'baseline-hash-mismatch');
      return false;
    }
    return true;
  }

  async function runRenameChecks(entry, proposedName, blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.runRenameConvergencePreflight !== 'function') {
      addCode(blockers, 'rename-convergence-preflight-unavailable');
      return { preflight: null, materialization: null };
    }
    if (typeof sync.checkRenameMaterialization !== 'function') {
      addCode(blockers, 'rename-materialization-diagnostic-unavailable');
      return { preflight: null, materialization: null };
    }

    var preflight;
    try {
      preflight = safeObject(await sync.runRenameConvergencePreflight({
        plannerEntry: entry,
        proposedName: proposedName
      }));
    } catch (_) {
      addCode(blockers, 'rename-convergence-preflight-failed');
      return { preflight: null, materialization: null };
    }
    codeList(preflight.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(preflight.warnings).forEach(function (code) { addCode(warnings, code); });

    if (preflight.actionable !== true) addCode(blockers, 'rename-preflight-not-actionable');
    if (preflight.hashVerified !== true) addCode(blockers, 'rename-hash-not-verified');
    if (preflight.duplicateSiblingExists === true) addCode(blockers, 'duplicate-folder-name');
    if (preflight.renameVsMoveConflict === true) addCode(blockers, 'rename-vs-move');
    if (preflight.renameVsDeleteConflict === true) addCode(blockers, 'rename-vs-delete');

    var materialization = null;
    if (!blockers.length) {
      try {
        materialization = safeObject(await sync.checkRenameMaterialization({
          plannerEntry: entry,
          proposedName: proposedName
        }));
      } catch (_) {
        addCode(blockers, 'rename-materialization-diagnostic-failed');
      }
    }
    if (materialization) {
      codeList(materialization.blockers).forEach(function (code) { addCode(blockers, code); });
      codeList(materialization.warnings).forEach(function (code) { addCode(warnings, code); });
      if (materialization.hashMatches !== true) addCode(blockers, 'rename-hash-not-verified');
      if (materialization.duplicateSiblingExists === true) addCode(blockers, 'duplicate-folder-name');
    }
    return { preflight: preflight, materialization: materialization };
  }

  function existingTargetNameHash(entry, materialization) {
    var materialized = cleanString(materialization && materialization.targetNameHash).toLowerCase();
    if (isSha256Hex(materialized)) return materialized;
    return entryTargetNameHash(entry);
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

  function buildExpectedPostState(entry, targetNameHash, changedFieldsHash) {
    return {
      subjectType: SUBJECT_TYPE,
      subjectId: entrySubject(entry),
      revisionHash: entryTargetHash(entry),
      targetNameHash: targetNameHash,
      changedFieldsHash: changedFieldsHash,
      normalizationVersion: NORMALIZATION_VERSION
    };
  }

  function buildProposedOperation(entry, targetNameHash, changedFieldsHash) {
    return {
      operation: OPERATION,
      operationIntent: 'update',
      subjectType: SUBJECT_TYPE,
      subjectId: entrySubject(entry),
      baseHash: entryBaseHash(entry),
      targetHash: entryTargetHash(entry),
      changedFields: entryChangedFields(entry),
      changedFieldsHash: changedFieldsHash,
      targetNameHash: targetNameHash,
      normalizationVersion: NORMALIZATION_VERSION,
      sourceBucket: 'rename-materialized'
    };
  }

  function validateProposalEnvelope(envelope, blockers) {
    var env = safeObject(envelope);
    var payload = safeObject(env.payload);
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
    if (env.operation !== OPERATION || env.operationIntent !== 'update') addCode(blockers, 'operation-intent-wrong-for-kind');
    if (env.redactionClass !== 'redacted') addCode(blockers, 'envelope-schema-too-new');
    if (env.dryRun !== null || env.transactional !== null) addCode(blockers, 'operation-intent-wrong-for-kind');
    if (!isSha256Hex(env.dedupeKey) || !isSha256Hex(env.payloadHash) || !isSha256Hex(env.eventDigest)) addCode(blockers, 'envelope-schema-too-new');
    if (!Array.isArray(payload.justifyingEvidenceDigests) || !payload.justifyingEvidenceDigests.length) addCode(blockers, 'envelope-schema-too-new');
    asArray(payload.justifyingEvidenceDigests).forEach(function (digest) {
      if (!isSha256Hex(digest)) addCode(blockers, 'envelope-schema-too-new');
    });
    if (!isObject(payload.proposedOperation)) addCode(blockers, 'envelope-schema-too-new');
    if (!isObject(payload.expectedPostState)) addCode(blockers, 'envelope-schema-too-new');
    if (!isSha256Hex(safeObject(payload.proposedOperation).targetNameHash)) addCode(blockers, 'targetNameHash-unavailable');
    if (!isSha256Hex(safeObject(payload.expectedPostState).targetNameHash)) addCode(blockers, 'targetNameHash-unavailable');
    if (!cleanString(payload.predicateVersion)) addCode(blockers, 'envelope-schema-too-new');
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

  function duplicateCandidate(ledger, dedupeKey, eventDigest, subjectId, baseHash, targetHash, targetNameHash, blockers) {
    var rows = asArray(ledger && ledger.rows);
    for (var i = 0; i < rows.length; i += 1) {
      var row = safeObject(rows[i]);
      if (cleanString(row.dedupeKey) === dedupeKey) addCode(blockers, 'duplicate-proposal-candidate');
      if (eventDigest && cleanString(row.eventDigest) === eventDigest) addCode(blockers, 'duplicate-proposal-candidate');
      if (cleanString(row.subjectId) === subjectId &&
          cleanString(row.baseHash).toLowerCase() === baseHash &&
          cleanString(row.targetHash).toLowerCase() === targetHash &&
          cleanString(row.targetNameHash).toLowerCase() === targetNameHash) {
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
      baseHash: cleanString(row.baseHash),
      targetHash: cleanString(row.targetHash),
      targetNameHash: cleanString(row.targetNameHash),
      eventDigest: cleanString(row.eventDigest),
      dedupeKey: cleanString(row.dedupeKey),
      status: cleanString(row.status),
      generatedAtIso: cleanString(row.generatedAtIso),
      expiresAt: cleanString(row.expiresAt)
    };
  }

  async function generateRenameProposalCandidate(input) {
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

    var checkResult = await runRenameChecks(entry, args.proposedName, blockers, warnings);
    await adjustedReadiness(blockers, warnings);
    await verifyCurrentBaseline(entry, blockers, warnings);

    var targetNameHash = existingTargetNameHash(entry, checkResult.materialization);
    if (!isSha256Hex(targetNameHash)) addCode(blockers, 'targetNameHash-unavailable');

    var subjectId = entrySubject(entry);
    var baseHash = entryBaseHash(entry);
    var targetHash = entryTargetHash(entry);
    var justifyingEvidenceDigests = entryJustifyingDigests(entry);
    var changedFields = entryChangedFields(entry);
    var peer = await sourcePeerEnvelope(blockers);

    var capabilitySnapshotHash = '';
    var changedFieldsHash = '';
    var payloadHash = '';
    var dedupeKey = '';
    if (!blockers.length) {
      capabilitySnapshotHash = await sha256Hex(CAPABILITY_TAG);
      changedFieldsHash = await sha256Hex(canonicalJson(changedFields));
      dedupeKey = await sha256Hex(canonicalJson({
        schema: ENVELOPE_SCHEMA,
        kind: 'proposal',
        subjectType: SUBJECT_TYPE,
        operation: OPERATION,
        operationIntent: 'update',
        subjectId: subjectId,
        baseHash: baseHash,
        targetHash: targetHash,
        targetNameHash: targetNameHash,
        actorPeerSyncHash: cleanString(peer && peer.syncPeerIdHash)
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
        targetHash,
        targetNameHash,
        blockers
      );
    }

    if (blockers.length) return failure(blockers, warnings);

    var createdAt = nowIsoSeconds();
    var expiresAt = addMinutesIso(EXPIRES_AFTER_MINUTES);
    var proposedOperation = buildProposedOperation(entry, targetNameHash, changedFieldsHash);
    var expectedPostState = buildExpectedPostState(entry, targetNameHash, changedFieldsHash);
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
      lineageId: entryLineage(entry),
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
      operationIntent: 'update',
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
      operationIntent: 'update',
      baseHash: baseHash,
      targetHash: targetHash,
      targetNameHash: targetNameHash,
      justifyingEvidenceDigests: justifyingEvidenceDigests.slice(),
      predicateVersion: PREDICATE_VERSION,
      normalizationVersion: NORMALIZATION_VERSION,
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

  H2O.Desktop.Sync.generateRenameProposalCandidate = generateRenameProposalCandidate;
  H2O.Desktop.Sync.__renameProposalCandidateInstalled = true;
  H2O.Desktop.Sync.__renameProposalCandidateVersion = VERSION;
  H2O.Desktop.Sync.__renameProposalCandidateApprovalToken = APPROVAL_TOKEN;
  H2O.Desktop.Sync.__renameProposalCandidateLedgerKey = LEDGER_KEY;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
