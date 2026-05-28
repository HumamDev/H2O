/* H2O Desktop Sync - F10.8.6e convergence proposal candidate generation
 *
 * Desktop/Tauri-only proposal candidate generator.
 *
 * Safety invariants:
 *   - Candidate generation only. No publish, outbox enqueue, apply, applyEvent,
 *     conflictCandidate, convergence, WebDAV, remote apply, automatic merge, or
 *     mobile write-back.
 *   - Inputs must come from a currently revalidated proposalEligible planner
 *     entry. Required proposal fields must already be present in the entry or
 *     its current planner equivalent; missing values fail closed.
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
  if (H2O.Desktop.Sync.__convergenceProposalGeneratorInstalled) return;

  var RESULT_SCHEMA = 'h2o.desktop.sync.convergence-proposal-candidate.v1';
  var LEDGER_SCHEMA = 'h2o.desktop.sync.convergence-proposal-candidate-ledger.v1';
  var ROW_SCHEMA = 'h2o.desktop.sync.convergence-proposal-candidate-row.v1';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var VERSION = '0.1.0-f10.8.6e';
  var LEDGER_KEY = 'h2o:sync:convergence-proposal-candidates:v1';
  var APPROVAL_TOKEN = 'I_APPROVE_CONVERGENCE_PROPOSAL_CANDIDATE';
  var PREDICATE_VERSION = 'h2o.folder-sync.predicate.v1';
  var CAPABILITY_TAG = 'h2o.platform.capabilities.v1#f10.8.6e-desktop-convergence-proposal-v1';
  var OPERATION = 'folder-metadata-color-convergence-proposal';
  var SUBJECT_TYPE = 'folder.metadata';
  var STATUS_GENERATED = 'generated';
  var EXPIRES_AFTER_MINUTES = 30;
  var OSCILLATION_WINDOW_MS = 60 * 60 * 1000;
  var OTHER_BUCKETS = ['alreadyConverged', 'needsPreview', 'conflicted', 'blocked', 'stale', 'replay'];
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'attachments',
    'name', 'title', 'folderName', 'chatTitle', 'rawId', 'chatId',
    'folderId', 'path', 'url', 'password', 'apiKey'
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
      status: 'blocked',
      generated: false,
      candidate: null,
      ledgerRow: null,
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
    return safeObject(safeObject(input).plannerEntry || input);
  }

  function entrySubject(entry) {
    return cleanString(entry.subjectId).toLowerCase();
  }

  function entryEventDigest(entry) {
    return cleanString(entry.eventDigest);
  }

  function entryLineage(entry) {
    return cleanString(entry.lineageId);
  }

  function entryBaseHash(entry) {
    return cleanString(entry.baseHash || entry.localRevisionHash).toLowerCase();
  }

  function entryTargetHash(entry) {
    return cleanString(entry.targetHash || entry.remoteRevisionHash).toLowerCase();
  }

  function entryChangedFields(entry) {
    return asArray(entry.changedFields).map(cleanString).filter(Boolean).sort();
  }

  function entryJustifyingDigests(entry) {
    var explicit = asArray(entry.justifyingEvidenceDigests)
      .map(cleanString)
      .filter(isSha256Hex);
    if (explicit.length) return explicit;
    var eventDigest = entryEventDigest(entry);
    return isSha256Hex(eventDigest) ? [eventDigest] : [];
  }

  function matchesEntry(a, b) {
    var subject = entrySubject(a);
    if (!subject || subject !== entrySubject(b)) return false;
    var eventDigest = entryEventDigest(a);
    if (eventDigest && eventDigest === entryEventDigest(b)) return true;
    var lineage = entryLineage(a);
    if (lineage && lineage === entryLineage(b)) return true;
    var target = entryTargetHash(a);
    return !!target && target === entryTargetHash(b);
  }

  function findMatchingBucket(plan, entry, bucketName) {
    var rows = asArray(safeObject(plan && plan.buckets)[bucketName]);
    for (var i = 0; i < rows.length; i += 1) {
      if (matchesEntry(entry, safeObject(rows[i]))) return safeObject(rows[i]);
    }
    return null;
  }

  function findDisallowedBucket(plan, entry) {
    for (var i = 0; i < OTHER_BUCKETS.length; i += 1) {
      if (findMatchingBucket(plan, entry, OTHER_BUCKETS[i])) return OTHER_BUCKETS[i];
    }
    return '';
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

  async function freshPlan(readiness, blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.buildConvergencePlan !== 'function') {
      addCode(blockers, 'convergence-planner-unavailable');
      return null;
    }
    try {
      var plan = safeObject(await sync.buildConvergencePlan({ readiness: readiness }));
      codeList(plan.blockers).forEach(function (code) { addCode(blockers, code); });
      codeList(plan.warnings).forEach(function (code) { addCode(warnings, code); });
      return plan;
    } catch (_) {
      addCode(blockers, 'convergence-plan-read-failed');
      return null;
    }
  }

  async function relayIndex(blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.listRelayIndex !== 'function') {
      addCode(blockers, 'relay-index-unavailable');
      return null;
    }
    try {
      var index = safeObject(await sync.listRelayIndex());
      codeList(index.blockers).forEach(function (code) { addCode(blockers, code); });
      codeList(index.warnings).forEach(function (code) { addCode(warnings, code); });
      return index;
    } catch (_) {
      addCode(blockers, 'relay-index-read-failed');
      return null;
    }
  }

  function relayEntryForDigest(index, eventDigest) {
    if (!eventDigest) return null;
    var rows = asArray(safeObject(index).entries);
    for (var i = 0; i < rows.length; i += 1) {
      var row = safeObject(rows[i]);
      if (cleanString(row.eventDigest) === eventDigest) return row;
    }
    return null;
  }

  function validateEntryFields(entry, blockers) {
    if (entrySubject(entry) && !isSha256Hex(entrySubject(entry))) addCode(blockers, 'subject-id-invalid');
    if (!entrySubject(entry)) addCode(blockers, 'subject-id-required');
    if (!entryLineage(entry)) addCode(blockers, 'lineage-id-required');
    if (!isStateHash(entryBaseHash(entry))) addCode(blockers, 'baseHash-unavailable');
    if (!isStateHash(entryTargetHash(entry))) addCode(blockers, 'targetHash-unavailable');
    var fields = entryChangedFields(entry);
    if (!fields.length) addCode(blockers, 'changedFields-unavailable');
    if (fields.length !== 1 || fields[0] !== 'color') addCode(blockers, 'field-not-allowlisted');
    if (!entryJustifyingDigests(entry).length) addCode(blockers, 'justifyingEvidenceDigests-unavailable');
  }

  function validateFreshEligibility(inputEntry, freshEntry, blockers) {
    if (cleanString(inputEntry.bucket || inputEntry.sourceBucket) &&
        cleanString(inputEntry.bucket || inputEntry.sourceBucket) !== 'proposalEligible') {
      addCode(blockers, 'source-bucket-not-proposalEligible');
    }
    var inputBase = entryBaseHash(inputEntry);
    var freshBase = entryBaseHash(freshEntry);
    var inputTarget = entryTargetHash(inputEntry);
    var freshTarget = entryTargetHash(freshEntry);
    if (inputBase && freshBase && inputBase !== freshBase) addCode(blockers, 'baseline-hash-mismatch');
    if (inputTarget && freshTarget && inputTarget !== freshTarget) addCode(blockers, 'target-hash-mismatch');
  }

  function validateRelaySignals(index, eventDigest, blockers) {
    var relayRow = relayEntryForDigest(index, eventDigest);
    if (!relayRow) return;
    if (relayRow.replayAttempt === true) addCode(blockers, 'replay-dedupe-key');
    if (relayRow.stale === true || relayRow.expired === true) addCode(blockers, 'stale-evidence-not-revalidated');
    if (cleanString(relayRow.relayStatus) === 'blocked') addCode(blockers, 'relay-envelope-blocked');
    if (cleanString(relayRow.relayStatus) === 'expired') addCode(blockers, 'stale-evidence-not-revalidated');
  }

  function rowOscillates(row, subjectId, baseHash, targetHash, nowMs) {
    var r = safeObject(row);
    if (cleanString(r.subjectId) !== subjectId) return false;
    if (cleanString(r.baseHash).toLowerCase() !== targetHash) return false;
    if (cleanString(r.targetHash).toLowerCase() !== baseHash) return false;
    var createdMs = Date.parse(cleanString(r.generatedAtIso));
    return Number.isFinite(createdMs) && nowMs - createdMs <= OSCILLATION_WINDOW_MS;
  }

  function duplicateOrOscillation(ledger, dedupeKey, eventDigest, subjectId, baseHash, targetHash, blockers) {
    var rows = asArray(ledger && ledger.rows);
    var nowMs = Date.now();
    for (var i = 0; i < rows.length; i += 1) {
      var row = safeObject(rows[i]);
      if (cleanString(row.dedupeKey) === dedupeKey) addCode(blockers, 'duplicate-proposal-candidate');
      if (eventDigest && cleanString(row.eventDigest) === eventDigest) addCode(blockers, 'duplicate-proposal-candidate');
      if (rowOscillates(row, subjectId, baseHash, targetHash, nowMs)) {
        addCode(blockers, 'oscillation-suppression-blocked');
      }
    }
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

  function buildExpectedPostState(entry, changedFieldsHash) {
    return {
      subjectType: SUBJECT_TYPE,
      subjectId: entrySubject(entry),
      revisionHash: entryTargetHash(entry),
      changedFieldsHash: changedFieldsHash
    };
  }

  function buildProposedOperation(entry, changedFieldsHash) {
    return {
      operation: OPERATION,
      operationIntent: 'update',
      subjectType: SUBJECT_TYPE,
      subjectId: entrySubject(entry),
      baseHash: entryBaseHash(entry),
      targetHash: entryTargetHash(entry),
      changedFields: entryChangedFields(entry),
      changedFieldsHash: changedFieldsHash,
      sourceBucket: 'proposalEligible'
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

  function rowSummary(row) {
    return {
      schema: ROW_SCHEMA,
      rowId: cleanString(row.rowId),
      envelopeId: cleanString(row.envelopeId),
      lineageId: cleanString(row.lineageId),
      subjectId: cleanString(row.subjectId),
      baseHash: cleanString(row.baseHash),
      targetHash: cleanString(row.targetHash),
      eventDigest: cleanString(row.eventDigest),
      dedupeKey: cleanString(row.dedupeKey),
      status: cleanString(row.status),
      generatedAtIso: cleanString(row.generatedAtIso),
      expiresAt: cleanString(row.expiresAt)
    };
  }

  async function generateConvergenceProposalCandidate(input) {
    var args = safeObject(input);
    var inputEntry = sourceEntry(args);
    var blockers = [];
    var warnings = [];

    if (!webCryptoAvailable()) addCode(blockers, 'envelope-schema-too-new');
    if (cleanString(args.operatorApprovalToken) !== APPROVAL_TOKEN) {
      addCode(blockers, 'operator-approval-token-required');
    }
    validateEntryFields(inputEntry, blockers);

    var readiness = await adjustedReadiness(blockers, warnings);
    var plan = await freshPlan(readiness, blockers, warnings);
    var disallowedBucket = findDisallowedBucket(plan, inputEntry);
    if (disallowedBucket) addCode(blockers, 'planner-entry-' + disallowedBucket);
    var freshEntry = findMatchingBucket(plan, inputEntry, 'proposalEligible');
    if (!freshEntry) addCode(blockers, 'planner-entry-not-proposalEligible');
    else validateFreshEligibility(inputEntry, freshEntry, blockers);

    var entry = freshEntry || inputEntry;
    validateEntryFields(entry, blockers);
    var index = await relayIndex(blockers, warnings);
    validateRelaySignals(index, entryEventDigest(entry), blockers);

    var baseHash = entryBaseHash(entry);
    var targetHash = entryTargetHash(entry);
    var subjectId = entrySubject(entry);
    var justifyingEvidenceDigests = entryJustifyingDigests(entry);
    var changedFields = entryChangedFields(entry);
    var peer = await sourcePeerEnvelope(blockers);

    if (inputEntry.oscillationSuppressionVerified === false || inputEntry.oscillationBlocker === true) {
      addCode(blockers, 'oscillation-suppression-blocked');
    }

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
      else duplicateOrOscillation(ledger, dedupeKey, entryEventDigest(entry), subjectId, baseHash, targetHash, blockers);
    }

    if (blockers.length) return failure(blockers, warnings);

    var createdAt = nowIsoSeconds();
    var expiresAt = addMinutesIso(EXPIRES_AFTER_MINUTES);
    var proposedOperation = buildProposedOperation(entry, changedFieldsHash);
    var expectedPostState = buildExpectedPostState(entry, changedFieldsHash);
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
      justifyingEvidenceDigests: justifyingEvidenceDigests.slice(),
      predicateVersion: PREDICATE_VERSION,
      generatedAtIso: createdAt,
      expiresAt: expiresAt,
      dedupeKey: dedupeKey,
      eventDigest: eventDigest,
      actorPeer: peer,
      status: STATUS_GENERATED,
      serializedEnvelope: canonicalJson(envelope)
    };
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
      status: STATUS_GENERATED,
      generated: true,
      candidate: envelope,
      ledgerRow: rowSummary(row),
      blockers: [],
      warnings: warnings.slice()
    };
  }

  H2O.Desktop.Sync.generateConvergenceProposalCandidate = generateConvergenceProposalCandidate;
  H2O.Desktop.Sync.__convergenceProposalGeneratorInstalled = true;
  H2O.Desktop.Sync.__convergenceProposalGeneratorVersion = VERSION;
  H2O.Desktop.Sync.__convergenceProposalGeneratorApprovalToken = APPROVAL_TOKEN;
  H2O.Desktop.Sync.__convergenceProposalCandidateLedgerKey = LEDGER_KEY;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
