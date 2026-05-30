/* H2O Desktop Sync - F13.0.4 binding proposal candidate generation
 *
 * Desktop/Tauri-only binding-add proposal candidate generator.
 *
 * Safety invariants:
 *   - Candidate generation only. No bind, unbind, chat move, cascade membership
 *     change, apply, publication, outbox enqueue, applyEvent, convergence,
 *     WebDAV, remote apply, automatic merge, or mobile write-back.
 *   - Inputs must pass the F13.0.3 binding convergence preflight. The generated
 *     proposal stores redacted chat/folder/binding subject hashes only.
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
  if (H2O.Desktop.Sync.__bindingProposalCandidateInstalled) return;

  var RESULT_SCHEMA = 'h2o.desktop.sync.binding-proposal-candidate.v1';
  var LEDGER_SCHEMA = 'h2o.desktop.sync.convergence-proposal-candidate-ledger.v1';
  var ROW_SCHEMA = 'h2o.desktop.sync.convergence-proposal-candidate-row.v1';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var VERSION = '0.1.0-f13.0.4';
  var LEDGER_KEY = 'h2o:sync:convergence-proposal-candidates:v1';
  var APPROVAL_TOKEN = 'I_APPROVE_BINDING_PROPOSAL_CANDIDATE';
  var PREDICATE_VERSION = 'h2o.folder-binding.add-predicate.v1';
  var IDENTITY_VERSION = 'h2o.folder-binding.identity.v1';
  var CAPABILITY_TAG = 'h2o.platform.capabilities.v1#f13.0.4-desktop-binding-proposal-v1';
  var OPERATION = 'folder-binding-add-proposal';
  var SUBJECT_TYPE = 'folderBinding';
  var STATUS_GENERATED = 'generated';
  var EXPIRES_AFTER_MINUTES = 20;
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

  function cleanLower(value) {
    return cleanString(value).toLowerCase();
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
    return /^[0-9a-f]{64}$/.test(cleanLower(value));
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

  async function runBindingPreflight(args, blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.runBindingConvergencePreflight !== 'function') {
      addCode(blockers, 'binding-convergence-preflight-unavailable');
      return {};
    }
    var preflight;
    try {
      preflight = safeObject(await sync.runBindingConvergencePreflight({
        chatSubjectId: args.chatSubjectId,
        folderSubjectId: args.folderSubjectId
      }));
    } catch (_) {
      addCode(blockers, 'binding-convergence-preflight-failed');
      return {};
    }
    codeList(preflight.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(preflight.warnings).forEach(function (code) { addCode(warnings, code); });
    if (preflight.actionable !== true) addCode(blockers, 'binding-preflight-not-actionable');
    if (preflight.duplicateBinding === true) addCode(blockers, 'duplicate-folder-binding');
    if (preflight.cardinalitySatisfied !== true) addCode(blockers, 'binding-cardinality-violation');
    if (preflight.tombstoneSafe !== true) addCode(blockers, 'binding-tombstone-not-safe');
    if (preflight.orphanSafe !== true) addCode(blockers, 'binding-would-be-orphaned');
    return preflight;
  }

  async function buildProofDigest(preflight, chatSubjectId, folderSubjectId, bindingSubjectId) {
    return sha256Hex(canonicalJson({
      schema: 'h2o.desktop.sync.binding-preflight-proof.v1',
      bindingSubjectId: bindingSubjectId,
      chatSubjectId: cleanLower(chatSubjectId),
      folderSubjectId: cleanLower(folderSubjectId),
      actionable: preflight.actionable === true,
      duplicateBinding: preflight.duplicateBinding === true,
      cardinalitySatisfied: preflight.cardinalitySatisfied === true,
      tombstoneSafe: preflight.tombstoneSafe === true,
      orphanSafe: preflight.orphanSafe === true,
      watermarkSafe: preflight.watermarkSafe === true,
      replaySafe: preflight.replaySafe === true,
      consumedSafe: preflight.consumedSafe === true
    }));
  }

  async function canonicalBindingSubjectId(chatSubjectId, folderSubjectId) {
    return sha256Hex('folderBinding:' + cleanLower(chatSubjectId) + ':' + cleanLower(folderSubjectId));
  }

  async function absentStateHash(bindingSubjectId) {
    return sha256Hex(canonicalJson({
      subjectType: SUBJECT_TYPE,
      subjectId: bindingSubjectId,
      state: 'absent',
      predicateVersion: PREDICATE_VERSION
    }));
  }

  async function expectedPostStateHash(chatSubjectId, folderSubjectId, bindingSubjectId) {
    return sha256Hex(canonicalJson({
      subjectType: SUBJECT_TYPE,
      subjectId: bindingSubjectId,
      state: 'present',
      chatSubjectId: cleanLower(chatSubjectId),
      folderSubjectId: cleanLower(folderSubjectId),
      identityVersion: IDENTITY_VERSION,
      predicateVersion: PREDICATE_VERSION
    }));
  }

  function buildExpectedPostState(chatSubjectId, folderSubjectId, bindingSubjectId, targetHash) {
    return {
      subjectType: SUBJECT_TYPE,
      subjectId: bindingSubjectId,
      state: 'present',
      chatSubjectId: cleanLower(chatSubjectId),
      folderSubjectId: cleanLower(folderSubjectId),
      expectedPostStateHash: targetHash,
      identityVersion: IDENTITY_VERSION,
      predicateVersion: PREDICATE_VERSION
    };
  }

  function buildProposedOperation(chatSubjectId, folderSubjectId, bindingSubjectId, baseHash, targetHash) {
    return {
      operation: OPERATION,
      operationIntent: 'create',
      subjectType: SUBJECT_TYPE,
      subjectId: bindingSubjectId,
      baseHash: baseHash,
      targetHash: targetHash,
      chatSubjectId: cleanLower(chatSubjectId),
      folderSubjectId: cleanLower(folderSubjectId),
      identityOrder: 'folderBinding:chatSubjectId:folderSubjectId',
      identityVersion: IDENTITY_VERSION,
      predicateVersion: PREDICATE_VERSION,
      sourceBucket: 'binding-preflight-materialized'
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
    if (env.operation !== OPERATION || env.operationIntent !== 'create') addCode(blockers, 'operation-intent-wrong-for-kind');
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
    if (op.operationIntent !== 'create' || op.operation !== OPERATION) addCode(blockers, 'operation-intent-wrong-for-kind');
    if (expected.state !== 'present') addCode(blockers, 'envelope-schema-too-new');
    if (!isSha256Hex(op.chatSubjectId) || !isSha256Hex(expected.chatSubjectId)) addCode(blockers, 'envelope-schema-too-new');
    if (!isSha256Hex(op.folderSubjectId) || !isSha256Hex(expected.folderSubjectId)) addCode(blockers, 'envelope-schema-too-new');
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

  function duplicateCandidate(ledger, dedupeKey, eventDigest, subjectId, baseHash, targetHash, blockers) {
    var rows = asArray(ledger && ledger.rows);
    for (var i = 0; i < rows.length; i += 1) {
      var row = safeObject(rows[i]);
      if (cleanString(row.dedupeKey) === dedupeKey) addCode(blockers, 'duplicate-proposal-candidate');
      if (eventDigest && cleanString(row.eventDigest) === eventDigest) addCode(blockers, 'duplicate-proposal-candidate');
      if (cleanString(row.subjectId) === subjectId &&
          cleanString(row.baseHash).toLowerCase() === baseHash &&
          cleanString(row.targetHash).toLowerCase() === targetHash) {
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
      chatSubjectId: cleanString(row.chatSubjectId),
      folderSubjectId: cleanString(row.folderSubjectId),
      baseHash: cleanString(row.baseHash),
      targetHash: cleanString(row.targetHash),
      eventDigest: cleanString(row.eventDigest),
      dedupeKey: cleanString(row.dedupeKey),
      status: cleanString(row.status),
      generatedAtIso: cleanString(row.generatedAtIso),
      expiresAt: cleanString(row.expiresAt)
    };
  }

  async function generateBindingProposalCandidate(input) {
    var args = safeObject(input);
    var blockers = [];
    var warnings = [];
    var chatSubjectId = cleanLower(args.chatSubjectId);
    var folderSubjectId = cleanLower(args.folderSubjectId);

    if (!webCryptoAvailable()) addCode(blockers, 'web-crypto-unavailable');
    if (cleanString(args.operatorApprovalToken) !== APPROVAL_TOKEN) {
      addCode(blockers, 'operator-approval-token-required');
    }
    if (!isSha256Hex(chatSubjectId)) addCode(blockers, 'invalid-chat-subject-id');
    if (!isSha256Hex(folderSubjectId)) addCode(blockers, 'invalid-folder-subject-id');

    var preflight = await runBindingPreflight(args, blockers, warnings);
    var bindingSubjectId = isSha256Hex(preflight.bindingSubjectId) ? cleanLower(preflight.bindingSubjectId) : '';
    var expectedBindingSubjectId = '';
    if (isSha256Hex(chatSubjectId) && isSha256Hex(folderSubjectId) && webCryptoAvailable()) {
      expectedBindingSubjectId = await canonicalBindingSubjectId(chatSubjectId, folderSubjectId);
    }
    if (!bindingSubjectId) addCode(blockers, 'binding-subject-id-unavailable');
    if (bindingSubjectId && expectedBindingSubjectId && bindingSubjectId !== expectedBindingSubjectId) {
      addCode(blockers, 'binding-subject-id-order-mismatch');
    }

    var peer = await sourcePeerEnvelope(blockers);
    var baseHash = '';
    var targetHash = '';
    var justifyingEvidenceDigests = [];
    var capabilitySnapshotHash = '';
    var payloadHash = '';
    var dedupeKey = '';
    var lineageId = '';
    if (!blockers.length) {
      baseHash = await absentStateHash(bindingSubjectId);
      targetHash = await expectedPostStateHash(chatSubjectId, folderSubjectId, bindingSubjectId);
      justifyingEvidenceDigests = [await buildProofDigest(preflight, chatSubjectId, folderSubjectId, bindingSubjectId)];
      capabilitySnapshotHash = await sha256Hex(CAPABILITY_TAG);
      lineageId = 'folderBinding:' + bindingSubjectId;
      dedupeKey = await sha256Hex(canonicalJson({
        schema: ENVELOPE_SCHEMA,
        kind: 'proposal',
        subjectType: SUBJECT_TYPE,
        operation: OPERATION,
        operationIntent: 'create',
        subjectId: bindingSubjectId,
        baseHash: baseHash,
        targetHash: targetHash,
        chatSubjectId: chatSubjectId,
        folderSubjectId: folderSubjectId,
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
      else duplicateCandidate(ledger, dedupeKey, '', bindingSubjectId, baseHash, targetHash, blockers);
    }

    if (blockers.length) return failure(blockers, warnings);

    var createdAt = nowIsoSeconds();
    var expiresAt = addMinutesIso(EXPIRES_AFTER_MINUTES);
    var proposedOperation = buildProposedOperation(chatSubjectId, folderSubjectId, bindingSubjectId, baseHash, targetHash);
    var expectedPostState = buildExpectedPostState(chatSubjectId, folderSubjectId, bindingSubjectId, targetHash);
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
      subjectId: bindingSubjectId,
      operation: OPERATION,
      operationIntent: 'create',
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
      subjectId: bindingSubjectId,
      chatSubjectId: chatSubjectId,
      folderSubjectId: folderSubjectId,
      operation: OPERATION,
      operationIntent: 'create',
      baseHash: baseHash,
      targetHash: targetHash,
      justifyingEvidenceDigests: justifyingEvidenceDigests.slice(),
      predicateVersion: PREDICATE_VERSION,
      identityVersion: IDENTITY_VERSION,
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

  H2O.Desktop.Sync.generateBindingProposalCandidate = generateBindingProposalCandidate;
  H2O.Desktop.Sync.__bindingProposalCandidateInstalled = true;
  H2O.Desktop.Sync.__bindingProposalCandidateVersion = VERSION;
  H2O.Desktop.Sync.__bindingProposalCandidateApprovalToken = APPROVAL_TOKEN;
  H2O.Desktop.Sync.__bindingProposalCandidateLedgerKey = LEDGER_KEY;
})(typeof window !== 'undefined' ? window : globalThis);
