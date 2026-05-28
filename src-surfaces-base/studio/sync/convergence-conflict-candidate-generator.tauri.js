/* H2O Desktop Sync - F10.8.6f convergence conflictCandidate generation
 *
 * Desktop/Tauri-only conflictCandidate generator.
 *
 * Safety invariants:
 *   - Candidate generation only. No publish, outbox enqueue, apply, proposal,
 *     applyEvent, convergence, WebDAV, remote apply, automatic merge, or mobile
 *     write-back.
 *   - Inputs must come from a currently revalidated conflicted planner entry.
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
  if (H2O.Desktop.Sync.__conflictCandidateGeneratorInstalled) return;

  var RESULT_SCHEMA = 'h2o.desktop.sync.convergence-conflict-candidate.v1';
  var LEDGER_SCHEMA = 'h2o.desktop.sync.convergence-conflict-candidate-ledger.v1';
  var ROW_SCHEMA = 'h2o.desktop.sync.convergence-conflict-candidate-row.v1';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var VERSION = '0.1.0-f10.8.6f';
  var LEDGER_KEY = 'h2o:sync:convergence-conflict-candidates:v1';
  var APPROVAL_TOKEN = 'I_APPROVE_CONFLICT_CANDIDATE_GENERATION';
  var CAPABILITY_TAG = 'h2o.platform.capabilities.v1#f10.8.6f-desktop-conflict-candidate-v1';
  var OPERATION = 'folder-metadata-conflict-candidate';
  var SUBJECT_TYPE = 'folder.metadata';
  var STATUS_GENERATED = 'generated';
  var OSCILLATION_WINDOW_MS = 60 * 60 * 1000;
  var OTHER_BUCKETS = ['alreadyConverged', 'needsPreview', 'proposalEligible', 'blocked', 'stale', 'replay'];
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
    return safeObject(safeObject(input).conflictEntry || input);
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

  function entryLocalHash(entry) {
    return cleanString(entry.localRevisionHash || entry.counterpartStateHash).toLowerCase();
  }

  function entryRemoteHash(entry) {
    return cleanString(entry.remoteRevisionHash || entry.requesterStateHash).toLowerCase();
  }

  function entryCommonAncestorHash(entry) {
    var hash = cleanString(entry.commonAncestorHash || entry.baseHash).toLowerCase();
    return isStateHash(hash) ? hash : null;
  }

  function entryReason(entry) {
    return cleanString(entry.divergenceReason || entry.reason || entry.conflictKind);
  }

  function operationIntentForReason(reason) {
    var normalized = cleanString(reason);
    if (normalized === 'unknown-remote-object') return 'create';
    if (normalized === 'delete-vs-update' || normalized.indexOf('delete') !== -1) return 'delete';
    return 'update';
  }

  function matchesEntry(a, b) {
    var subject = entrySubject(a);
    if (!subject || subject !== entrySubject(b)) return false;
    var eventDigest = entryEventDigest(a);
    if (eventDigest && eventDigest === entryEventDigest(b)) return true;
    var lineage = entryLineage(a);
    if (lineage && lineage === entryLineage(b)) return true;
    var remoteHash = entryRemoteHash(a);
    return !!remoteHash && remoteHash === entryRemoteHash(b);
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
    ready.conflictWorkflowAvailable = true;
    ready.proposalWorkflowAvailable = true;
    if (ready.relayIndexReady === true && ready.applyLedgerReadable === true) {
      ready.lineageTrackingAvailable = true;
    }
    readiness.readiness = ready;
    readiness.blockers = codeList(readiness.blockers).filter(function (code) {
      return code !== 'conflict-workflow-unavailable' &&
        code !== 'proposal-workflow-unavailable' &&
        code !== 'lineage-tracking-unavailable';
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
    if (!isStateHash(entryLocalHash(entry))) addCode(blockers, 'counterpartState-unavailable');
    if (!isStateHash(entryRemoteHash(entry))) addCode(blockers, 'requesterState-unavailable');
    if (!entryReason(entry)) addCode(blockers, 'divergenceReason-unavailable');
    if (!entryEventDigest(entry) || !isSha256Hex(entryEventDigest(entry))) addCode(blockers, 'eventDigest-unavailable');
  }

  function validateFreshEligibility(inputEntry, freshEntry, blockers) {
    if (cleanString(inputEntry.bucket || inputEntry.sourceBucket) &&
        cleanString(inputEntry.bucket || inputEntry.sourceBucket) !== 'conflicted') {
      addCode(blockers, 'source-bucket-not-conflicted');
    }
    var inputLocal = entryLocalHash(inputEntry);
    var freshLocal = entryLocalHash(freshEntry);
    var inputRemote = entryRemoteHash(inputEntry);
    var freshRemote = entryRemoteHash(freshEntry);
    if (inputLocal && freshLocal && inputLocal !== freshLocal) addCode(blockers, 'counterpartState-mismatch');
    if (inputRemote && freshRemote && inputRemote !== freshRemote) addCode(blockers, 'requesterState-mismatch');
  }

  function validateRelaySignals(index, eventDigest, blockers) {
    var relayRow = relayEntryForDigest(index, eventDigest);
    if (!relayRow) return;
    if (relayRow.replayAttempt === true) addCode(blockers, 'replay-dedupe-key');
    if (relayRow.stale === true || relayRow.expired === true) addCode(blockers, 'stale-evidence-not-revalidated');
    if (cleanString(relayRow.relayStatus) === 'blocked') addCode(blockers, 'relay-envelope-blocked');
    if (cleanString(relayRow.relayStatus) === 'expired') addCode(blockers, 'stale-evidence-not-revalidated');
  }

  function duplicateOrOscillation(ledger, dedupeKey, eventDigest, subjectId, localHash, remoteHash, blockers) {
    var rows = asArray(ledger && ledger.rows);
    var nowMs = Date.now();
    for (var i = 0; i < rows.length; i += 1) {
      var row = safeObject(rows[i]);
      if (cleanString(row.dedupeKey) === dedupeKey) addCode(blockers, 'duplicate-conflict-candidate');
      if (eventDigest && cleanString(row.eventDigest) === eventDigest) addCode(blockers, 'duplicate-conflict-candidate');
      if (cleanString(row.subjectId) !== subjectId) continue;
      if (cleanString(row.requesterStateHash).toLowerCase() !== localHash) continue;
      if (cleanString(row.counterpartStateHash).toLowerCase() !== remoteHash) continue;
      var createdMs = Date.parse(cleanString(row.generatedAtIso));
      if (Number.isFinite(createdMs) && nowMs - createdMs <= OSCILLATION_WINDOW_MS) {
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

  function requesterState(entry) {
    return {
      subjectType: SUBJECT_TYPE,
      subjectId: entrySubject(entry),
      revisionHash: entryRemoteHash(entry),
      lineageId: entryLineage(entry),
      eventDigest: entryEventDigest(entry)
    };
  }

  function counterpartState(entry) {
    return {
      subjectType: SUBJECT_TYPE,
      subjectId: entrySubject(entry),
      revisionHash: entryLocalHash(entry)
    };
  }

  function validateConflictCandidateEnvelope(envelope, blockers) {
    var env = safeObject(envelope);
    var payload = safeObject(env.payload);
    if (env.schema !== ENVELOPE_SCHEMA) addCode(blockers, 'envelope-schema-too-new');
    if (env.envelopeVersion !== 'v1' || env.envelopeKindVersion !== 'v1') addCode(blockers, 'envelope-schema-too-new');
    if (env.kind !== 'conflictCandidate') addCode(blockers, 'envelope-schema-too-new');
    if (!cleanString(env.id) || !cleanString(env.lineageId)) addCode(blockers, 'envelope-schema-too-new');
    if (env.sourcePlatform && cleanString(env.sourcePlatform.platformId) !== 'desktop-studio') addCode(blockers, 'platform-not-authorized-for-kind');
    if (env.sourcePlatform && cleanString(env.sourcePlatform.surfaceKind) !== 'desktop-tauri') addCode(blockers, 'surface-authority-mismatch');
    if (!validatePeer(safeObject(safeObject(env.sourcePlatform).sourcePeerEnvelope))) addCode(blockers, 'envelope-schema-too-new');
    if (env.declaredAuthority !== 'strong-local-authority') addCode(blockers, 'surface-authority-mismatch');
    if (env.effectiveAuthority !== 'strong-local-authority') addCode(blockers, 'surface-authority-mismatch');
    if (env.capabilityUsed !== 'conflictReview') addCode(blockers, 'capability-not-on-platform-allowlist');
    if (!isSha256Hex(env.capabilitySnapshotHash)) addCode(blockers, 'envelope-schema-too-new');
    if (env.subjectType !== SUBJECT_TYPE || !isSha256Hex(env.subjectId)) addCode(blockers, 'envelope-schema-too-new');
    if (env.operation !== OPERATION) addCode(blockers, 'envelope-schema-too-new');
    if (['create', 'update', 'delete'].indexOf(cleanString(env.operationIntent)) === -1) {
      addCode(blockers, 'operation-intent-wrong-for-kind');
    }
    if (env.redactionClass !== 'redacted') addCode(blockers, 'envelope-schema-too-new');
    if (env.dryRun !== null || env.transactional !== null) addCode(blockers, 'operation-intent-wrong-for-kind');
    if (!isSha256Hex(env.dedupeKey) || !isSha256Hex(env.payloadHash) || !isSha256Hex(env.eventDigest)) addCode(blockers, 'envelope-schema-too-new');
    if (!isObject(payload.requesterState)) addCode(blockers, 'envelope-schema-too-new');
    if (!isObject(payload.counterpartState)) addCode(blockers, 'envelope-schema-too-new');
    if (!Object.prototype.hasOwnProperty.call(payload, 'commonAncestorHash')) addCode(blockers, 'envelope-schema-too-new');
    if (payload.commonAncestorHash !== null && !isStateHash(payload.commonAncestorHash)) addCode(blockers, 'envelope-schema-too-new');
    if (!cleanString(payload.divergenceReason)) addCode(blockers, 'envelope-schema-too-new');
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
      conflictLineageId: cleanString(row.conflictLineageId),
      sourceLineageId: cleanString(row.sourceLineageId),
      subjectId: cleanString(row.subjectId),
      requesterStateHash: cleanString(row.requesterStateHash),
      counterpartStateHash: cleanString(row.counterpartStateHash),
      commonAncestorHash: row.commonAncestorHash,
      divergenceReason: cleanString(row.divergenceReason),
      eventDigest: cleanString(row.eventDigest),
      dedupeKey: cleanString(row.dedupeKey),
      status: cleanString(row.status),
      generatedAtIso: cleanString(row.generatedAtIso)
    };
  }

  async function generateConflictCandidate(input) {
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
    var freshEntry = findMatchingBucket(plan, inputEntry, 'conflicted');
    if (!freshEntry) addCode(blockers, 'planner-entry-not-conflicted');
    else validateFreshEligibility(inputEntry, freshEntry, blockers);

    var entry = freshEntry || inputEntry;
    validateEntryFields(entry, blockers);
    var index = await relayIndex(blockers, warnings);
    validateRelaySignals(index, entryEventDigest(entry), blockers);

    var subjectId = entrySubject(entry);
    var sourceLineageId = entryLineage(entry);
    var localHash = entryLocalHash(entry);
    var remoteHash = entryRemoteHash(entry);
    var reason = entryReason(entry);
    var commonAncestorHash = entryCommonAncestorHash(entry);
    var operationIntent = operationIntentForReason(reason);
    var peer = await sourcePeerEnvelope(blockers);

    if (inputEntry.oscillationSuppressionVerified === false || inputEntry.oscillationBlocker === true) {
      addCode(blockers, 'oscillation-suppression-blocked');
    }

    var capabilitySnapshotHash = '';
    var conflictLineageId = '';
    var dedupeKey = '';
    if (!blockers.length) {
      capabilitySnapshotHash = await sha256Hex(CAPABILITY_TAG);
      conflictLineageId = await sha256Hex(canonicalJson({
        schema: ENVELOPE_SCHEMA,
        kind: 'conflictCandidate',
        subjectId: subjectId,
        sourceLineageId: sourceLineageId,
        eventDigest: entryEventDigest(entry),
        divergenceReason: reason
      }));
      dedupeKey = await sha256Hex(canonicalJson({
        schema: ENVELOPE_SCHEMA,
        kind: 'conflictCandidate',
        subjectType: SUBJECT_TYPE,
        operation: OPERATION,
        operationIntent: operationIntent,
        subjectId: subjectId,
        requesterStateHash: remoteHash,
        counterpartStateHash: localHash,
        commonAncestorHash: commonAncestorHash,
        divergenceReason: reason,
        actorPeerSyncHash: cleanString(peer && peer.syncPeerIdHash)
      }));
    }

    var ledger = null;
    if (!blockers.length) {
      try {
        ledger = normalizeLedger(await storageGet(LEDGER_KEY));
      } catch (_) {
        addCode(blockers, 'conflict-candidate-ledger-unavailable');
      }
      if (!ledger) addCode(blockers, 'conflict-candidate-ledger-malformed');
      else duplicateOrOscillation(ledger, dedupeKey, entryEventDigest(entry), subjectId, localHash, remoteHash, blockers);
    }

    if (blockers.length) return failure(blockers, warnings);

    var createdAt = nowIsoSeconds();
    var payload = {
      requesterState: requesterState(entry),
      counterpartState: counterpartState(entry),
      commonAncestorHash: commonAncestorHash,
      divergenceReason: reason
    };
    var payloadHash = await sha256Hex(canonicalJson(payload));
    var envelopeBase = {
      schema: ENVELOPE_SCHEMA,
      envelopeVersion: 'v1',
      envelopeKindVersion: 'v1',
      kind: 'conflictCandidate',
      id: generateUuid(),
      lineageId: conflictLineageId,
      createdAt: createdAt,
      expiresAt: null,
      sequence: null,
      exportSequence: null,
      sourcePlatform: {
        platformId: 'desktop-studio',
        surfaceKind: 'desktop-tauri',
        sourcePeerEnvelope: peer
      },
      declaredAuthority: 'strong-local-authority',
      effectiveAuthority: 'strong-local-authority',
      capabilityUsed: 'conflictReview',
      capabilitySnapshotHash: capabilitySnapshotHash,
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      operation: OPERATION,
      operationIntent: operationIntent,
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
    validateConflictCandidateEnvelope(envelope, blockers);
    if (blockers.length) return failure(blockers, warnings);

    var row = {
      schema: ROW_SCHEMA,
      rowId: generateUuid(),
      envelopeId: envelope.id,
      conflictLineageId: conflictLineageId,
      sourceLineageId: sourceLineageId,
      subjectId: subjectId,
      operation: OPERATION,
      operationIntent: operationIntent,
      requesterStateHash: remoteHash,
      counterpartStateHash: localHash,
      commonAncestorHash: commonAncestorHash,
      divergenceReason: reason,
      generatedAtIso: createdAt,
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
      return failure(['conflict-candidate-ledger-write-failed'], warnings);
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

  H2O.Desktop.Sync.generateConflictCandidate = generateConflictCandidate;
  H2O.Desktop.Sync.__conflictCandidateGeneratorInstalled = true;
  H2O.Desktop.Sync.__conflictCandidateGeneratorVersion = VERSION;
  H2O.Desktop.Sync.__conflictCandidateGeneratorApprovalToken = APPROVAL_TOKEN;
  H2O.Desktop.Sync.__conflictCandidateLedgerKey = LEDGER_KEY;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
