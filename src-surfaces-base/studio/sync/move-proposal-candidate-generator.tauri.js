/* H2O Desktop Sync - F11.0.3 move proposal candidate generation
 *
 * Desktop/Tauri-only move proposal candidate generator.
 *
 * Safety invariants:
 *   - Candidate generation only. No move, apply, publication, outbox enqueue,
 *     applyEvent, conflictCandidate, convergence, WebDAV, remote apply,
 *     automatic merge, or mobile write-back.
 *   - Inputs must pass the F11.0.2 move convergence preflight. The generated
 *     proposal stores redacted subject/from-parent/to-parent hashes only.
 *   - Ledger is local append-only candidate storage only, status="generated".
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
  if (H2O.Desktop.Sync.__moveProposalCandidateInstalled) return;

  var RESULT_SCHEMA = 'h2o.desktop.sync.move-proposal-candidate.v1';
  var LEDGER_SCHEMA = 'h2o.desktop.sync.convergence-proposal-candidate-ledger.v1';
  var ROW_SCHEMA = 'h2o.desktop.sync.convergence-proposal-candidate-row.v1';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var VERSION = '0.1.0-f11.0.3';
  var LEDGER_KEY = 'h2o:sync:convergence-proposal-candidates:v1';
  var APPROVAL_TOKEN = 'I_APPROVE_MOVE_PROPOSAL_CANDIDATE';
  var PREDICATE_VERSION = 'h2o.folder-sync.move-predicate.v1';
  var TREE_PREDICATE_VERSION = 'h2o.folder-tree.move-safety.v1';
  var CAPABILITY_TAG = 'h2o.platform.capabilities.v1#f11.0.3-desktop-move-proposal-v1';
  var OPERATION = 'folder-metadata-move-proposal';
  var SUBJECT_TYPE = 'folder.metadata';
  var STATUS_GENERATED = 'generated';
  var EXPIRES_AFTER_MINUTES = 30;
  var OTHER_BUCKETS = ['alreadyConverged', 'needsPreview', 'conflicted', 'blocked', 'stale', 'replay'];
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

  function nestedObjects(entry) {
    var row = safeObject(entry);
    var payload = safeObject(row.payload);
    var preview = safeObject(payload.proposalPreview);
    return [
      row,
      safeObject(row.expectedPostState),
      safeObject(row.proposedOperation),
      safeObject(row.moveMaterialization),
      safeObject(row.remoteState),
      safeObject(row.structural),
      safeObject(payload.expectedPostState),
      safeObject(payload.proposedOperation),
      safeObject(preview.expectedPostState),
      safeObject(preview.proposedOperation),
      safeObject(preview.moveMaterialization)
    ];
  }

  function directParentSpec(obj, keys) {
    var row = safeObject(obj);
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
      var raw = row[key];
      var text = cleanString(raw).toLowerCase();
      if (raw == null || text === '' || text === 'root' || text === 'null') {
        return { present: true, root: true, subjectId: null };
      }
      return { present: true, root: false, subjectId: cleanString(raw).toLowerCase() };
    }
    return { present: false, root: false, subjectId: null };
  }

  function targetParentSpec(entry) {
    var objects = nestedObjects(entry);
    var keys = [
      'toParentSubjectId',
      'targetParentSubjectId',
      'newParentSubjectId',
      'expectedParentSubjectId',
      'parentSubjectId'
    ];
    for (var i = 0; i < objects.length; i += 1) {
      var spec = directParentSpec(objects[i], keys);
      if (spec.present) return spec;
    }
    return { present: false, root: false, subjectId: null };
  }

  function sourceParentSpec(entry) {
    var objects = [
      safeObject(entry),
      safeObject(entry.localState),
      safeObject(entry.baseState),
      safeObject(entry.localStructural),
      safeObject(entry.baseStructural)
    ];
    var keys = [
      'fromParentSubjectId',
      'sourceParentSubjectId',
      'baseParentSubjectId',
      'localParentSubjectId',
      'currentParentSubjectId'
    ];
    for (var i = 0; i < objects.length; i += 1) {
      var spec = directParentSpec(objects[i], keys);
      if (spec.present) return spec;
    }
    return { present: false, root: false, subjectId: null };
  }

  function parentSubjectOrNull(spec) {
    if (!spec.present) return undefined;
    if (spec.root) return null;
    return cleanString(spec.subjectId).toLowerCase();
  }

  function isParentSubject(value) {
    return value === null || isSha256Hex(value);
  }

  function validateSourceBucket(entry, blockers) {
    var bucket = entrySourceBucket(entry);
    if (!bucket) return;
    if (OTHER_BUCKETS.indexOf(bucket) !== -1) addCode(blockers, 'planner-entry-' + bucket);
    if (bucket !== 'proposalEligible') addCode(blockers, 'source-bucket-not-proposalEligible');
  }

  function validateEntryFields(entry, blockers) {
    if (!entrySubject(entry)) addCode(blockers, 'subject-id-required');
    else if (!isSha256Hex(entrySubject(entry))) addCode(blockers, 'subject-id-invalid');
    if (!entryLineage(entry)) addCode(blockers, 'lineage-id-required');
    if (!isStateHash(entryBaseHash(entry))) addCode(blockers, 'baseHash-unavailable');
    if (!isStateHash(entryTargetHash(entry))) addCode(blockers, 'targetHash-unavailable');
    var fields = entryChangedFields(entry);
    if (!fields.length) addCode(blockers, 'changedFields-unavailable');
    if (fields.length !== 1 || (fields[0] !== 'parent' && fields[0] !== 'parentId')) {
      addCode(blockers, 'field-not-allowlisted');
    }
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

  async function runMoveChecks(entry, blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.runMoveConvergencePreflight !== 'function') {
      addCode(blockers, 'move-convergence-preflight-unavailable');
      return null;
    }
    var preflight;
    try {
      preflight = safeObject(await sync.runMoveConvergencePreflight({ plannerEntry: entry }));
    } catch (_) {
      addCode(blockers, 'move-convergence-preflight-failed');
      return null;
    }
    codeList(preflight.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(preflight.warnings).forEach(function (code) { addCode(warnings, code); });

    if (preflight.actionable !== true) addCode(blockers, 'move-preflight-not-actionable');
    if (preflight.cycleSafe !== true) addCode(blockers, 'cycle-risk');
    if (preflight.orphanSafe !== true) addCode(blockers, 'orphan-risk');
    if (preflight.depthSafe !== true) addCode(blockers, 'tree-depth-limit-exceeded');
    if (preflight.duplicateSiblingSafe !== true) addCode(blockers, 'duplicate-folder-name');
    if (preflight.parentStable !== true) addCode(blockers, 'parent-not-stable');
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

  function buildExpectedPostState(entry, fromParentSubjectId, toParentSubjectId, changedFieldsHash) {
    return {
      subjectType: SUBJECT_TYPE,
      subjectId: entrySubject(entry),
      revisionHash: entryTargetHash(entry),
      fromParentSubjectId: fromParentSubjectId,
      toParentSubjectId: toParentSubjectId,
      changedFieldsHash: changedFieldsHash,
      treePredicateVersion: TREE_PREDICATE_VERSION
    };
  }

  function buildProposedOperation(entry, fromParentSubjectId, toParentSubjectId, changedFieldsHash) {
    return {
      operation: OPERATION,
      operationIntent: 'update',
      subjectType: SUBJECT_TYPE,
      subjectId: entrySubject(entry),
      baseHash: entryBaseHash(entry),
      targetHash: entryTargetHash(entry),
      changedFields: entryChangedFields(entry),
      changedFieldsHash: changedFieldsHash,
      fromParentSubjectId: fromParentSubjectId,
      toParentSubjectId: toParentSubjectId,
      treePredicateVersion: TREE_PREDICATE_VERSION,
      sourceBucket: 'move-materialized'
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
    if (!cleanString(payload.predicateVersion)) addCode(blockers, 'envelope-schema-too-new');
    if (!isParentSubject(op.fromParentSubjectId) || !isParentSubject(expected.fromParentSubjectId)) addCode(blockers, 'fromParentSubjectId-unavailable');
    if (!isParentSubject(op.toParentSubjectId) || !isParentSubject(expected.toParentSubjectId)) addCode(blockers, 'toParentSubjectId-unavailable');
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

  function duplicateCandidate(ledger, dedupeKey, eventDigest, subjectId, baseHash, targetHash,
    fromParentSubjectId, toParentSubjectId, blockers) {
    var rows = asArray(ledger && ledger.rows);
    for (var i = 0; i < rows.length; i += 1) {
      var row = safeObject(rows[i]);
      if (cleanString(row.dedupeKey) === dedupeKey) addCode(blockers, 'duplicate-proposal-candidate');
      if (eventDigest && cleanString(row.eventDigest) === eventDigest) addCode(blockers, 'duplicate-proposal-candidate');
      if (cleanString(row.subjectId) === subjectId &&
          cleanString(row.baseHash).toLowerCase() === baseHash &&
          cleanString(row.targetHash).toLowerCase() === targetHash &&
          cleanString(row.fromParentSubjectId || null) === cleanString(fromParentSubjectId || null) &&
          cleanString(row.toParentSubjectId || null) === cleanString(toParentSubjectId || null)) {
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
      fromParentSubjectId: row.fromParentSubjectId,
      toParentSubjectId: row.toParentSubjectId,
      baseHash: cleanString(row.baseHash),
      targetHash: cleanString(row.targetHash),
      eventDigest: cleanString(row.eventDigest),
      dedupeKey: cleanString(row.dedupeKey),
      status: cleanString(row.status),
      generatedAtIso: cleanString(row.generatedAtIso),
      expiresAt: cleanString(row.expiresAt)
    };
  }

  async function generateMoveProposalCandidate(input) {
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

    var targetSpec = targetParentSpec(entry);
    var sourceSpec = sourceParentSpec(entry);
    var toParentSubjectId = parentSubjectOrNull(targetSpec);
    var fromParentSubjectId = parentSubjectOrNull(sourceSpec);
    if (!targetSpec.present) addCode(blockers, 'toParentSubjectId-unavailable');
    if (!sourceSpec.present) addCode(blockers, 'fromParentSubjectId-unavailable');
    if (targetSpec.present && !isParentSubject(toParentSubjectId)) addCode(blockers, 'toParentSubjectId-unavailable');
    if (sourceSpec.present && !isParentSubject(fromParentSubjectId)) addCode(blockers, 'fromParentSubjectId-unavailable');

    await runMoveChecks(entry, blockers, warnings);
    await adjustedReadiness(blockers, warnings);
    await verifyCurrentBaseline(entry, blockers, warnings);

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
        fromParentSubjectId: fromParentSubjectId,
        toParentSubjectId: toParentSubjectId,
        actorPeerSyncHash: cleanString(peer && peer.syncPeerIdHash),
        treePredicateVersion: TREE_PREDICATE_VERSION
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
        fromParentSubjectId,
        toParentSubjectId,
        blockers
      );
    }

    if (blockers.length) return failure(blockers, warnings);

    var createdAt = nowIsoSeconds();
    var expiresAt = addMinutesIso(EXPIRES_AFTER_MINUTES);
    var proposedOperation = buildProposedOperation(entry, fromParentSubjectId, toParentSubjectId, changedFieldsHash);
    var expectedPostState = buildExpectedPostState(entry, fromParentSubjectId, toParentSubjectId, changedFieldsHash);
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
      fromParentSubjectId: fromParentSubjectId,
      toParentSubjectId: toParentSubjectId,
      justifyingEvidenceDigests: justifyingEvidenceDigests.slice(),
      predicateVersion: PREDICATE_VERSION,
      treePredicateVersion: TREE_PREDICATE_VERSION,
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

  H2O.Desktop.Sync.generateMoveProposalCandidate = generateMoveProposalCandidate;
  H2O.Desktop.Sync.__moveProposalCandidateInstalled = true;
  H2O.Desktop.Sync.__moveProposalCandidateVersion = VERSION;
  H2O.Desktop.Sync.__moveProposalCandidateApprovalToken = APPROVAL_TOKEN;
  H2O.Desktop.Sync.__moveProposalCandidateLedgerKey = LEDGER_KEY;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
