/* H2O Desktop Sync - F11.0.4b move applyEvent receipt builder
 *
 * Desktop/Tauri-only applyEvent generation after a successful local move.
 *
 * Safety invariants:
 *   - Builds applyEvent envelopes only from successful local move results.
 *   - applyEvent is past-tense evidence, never a remote apply command.
 *   - Receipt only. No move, apply, publication, outbox enqueue, upload,
 *     watermark write, consumed-ledger write, convergence, WebDAV, retry,
 *     automatic merge, or mobile write-back.
 *   - Output is redacted: parent subject hashes are allowed; raw folder IDs,
 *     raw parent IDs, names, chat IDs, paths, URLs, tokens, and content are
 *     forbidden.
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
  if (H2O.Desktop.Sync.__moveApplyEventInstalled) return;

  var RESULT_SCHEMA = 'h2o.desktop.sync.move-apply-event-build.v1';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var VERSION = '0.1.0-f11.0.4b';
  var CAPABILITY_TAG = 'h2o.platform.capabilities.v1#f11.0.4b-desktop-move-apply-event-v1';
  var PREDICATE_VERSION = 'h2o.folder-sync.move-predicate.v1';
  var TREE_PREDICATE_VERSION = 'h2o.folder-tree.move-safety.v1';
  var OPERATION = 'folder.move';
  var SUBJECT_TYPE = 'folder.metadata';
  var REDACTED = 'redacted';
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

  function isParentSubjectHash(value) {
    return value === null || isSha256Hex(value);
  }

  function nowIsoSeconds() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
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
      applyEvent: null,
      blockers: codeList(blockers),
      warnings: codeList(warnings)
    };
  }

  function moveResult(input) {
    var args = safeObject(input);
    return safeObject(args.moveResult || args.result || args);
  }

  function preStateHash(row) {
    return cleanString(row.preStateHash || safeObject(row.preState).hash).toLowerCase();
  }

  function postStateHash(row) {
    return cleanString(row.postStateHash || safeObject(row.postState).hash).toLowerCase();
  }

  function parentSubject(value) {
    if (value === null) return null;
    var text = cleanString(value).toLowerCase();
    return text ? text : null;
  }

  function fromParentSubjectId(row) {
    return parentSubject(row.fromParentSubjectId || safeObject(row.preState).fromParentSubjectId);
  }

  function toParentSubjectId(row) {
    return parentSubject(row.toParentSubjectId || safeObject(row.postState).toParentSubjectId);
  }

  function actorPeerFromResult(row) {
    return safeObject(row.actorPeer ||
      row.sourcePeerEnvelope ||
      safeObject(row.sourcePlatform).sourcePeerEnvelope ||
      safeObject(row.audit).actorPeer ||
      safeObject(row.ledger).actorPeer);
  }

  async function localActorPeer(blockers) {
    var identity = H2O.Studio && H2O.Studio.identity;
    var raw = null;
    try {
      if (identity && typeof identity.whenReady === 'function') raw = await Promise.resolve(identity.whenReady());
      else if (identity && typeof identity.get === 'function') raw = identity.get();
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

  function validPeer(peer) {
    return isSha256Hex(peer && peer.physicalDeviceIdHash)
      && isSha256Hex(peer && peer.installIdHash)
      && isSha256Hex(peer && peer.syncPeerIdHash)
      && cleanString(peer && peer.surfaceKind || 'desktop-tauri') === 'desktop-tauri';
  }

  async function actorPeer(row, blockers) {
    var fromResult = actorPeerFromResult(row);
    if (validPeer(fromResult)) return Object.assign({ surfaceKind: 'desktop-tauri' }, fromResult);
    return localActorPeer(blockers);
  }

  async function operationId(row, preHash, postHash, fromParent, toParent) {
    var existing = cleanString(row.operationId || safeObject(row.audit).operationId || safeObject(row.ledger).operationId);
    if (isSha256Hex(existing)) return existing;
    return sha256Hex(canonicalJson({
      schema: RESULT_SCHEMA,
      purpose: 'operationId',
      subjectId: cleanString(row.subjectId),
      lineageId: cleanString(row.lineageId),
      operation: OPERATION,
      preStateHash: preHash,
      postStateHash: postHash,
      fromParentSubjectId: fromParent,
      toParentSubjectId: toParent
    }));
  }

  async function transactionId(row, opId) {
    var existing = cleanString(row.transactionId || safeObject(row.audit).transactionId || safeObject(row.ledger).transactionId);
    if (existing) return existing;
    return sha256Hex(canonicalJson({
      schema: RESULT_SCHEMA,
      purpose: 'transactionId',
      operationId: opId
    }));
  }

  async function auditMaintenanceId(row, opId) {
    var existing = cleanString(row.auditMaintenanceId || row.maintenanceId || row.auditId || safeObject(row.audit).auditMaintenanceId);
    if (isSha256Hex(existing)) return existing;
    return sha256Hex(canonicalJson({
      schema: RESULT_SCHEMA,
      purpose: 'auditMaintenanceId',
      operationId: opId
    }));
  }

  function validateMoveResult(row, hashes, blockers) {
    if (!isObject(row)) {
      addCode(blockers, 'move-result-missing');
      return;
    }
    if (row.moved !== true) addCode(blockers, 'move-result-not-moved');
    if (!isSha256Hex(row.subjectId)) addCode(blockers, 'subject-id-invalid');
    if (!cleanString(row.lineageId)) addCode(blockers, 'lineage-id-required');
    if (!isStateHash(hashes.preStateHash)) addCode(blockers, 'pre-state-hash-invalid');
    if (!isStateHash(hashes.postStateHash)) addCode(blockers, 'post-state-hash-invalid');
    if (!isParentSubjectHash(hashes.fromParentSubjectId)) addCode(blockers, 'fromParentSubjectId-unavailable');
    if (!isParentSubjectHash(hashes.toParentSubjectId)) addCode(blockers, 'toParentSubjectId-unavailable');
    if (hashes.fromParentSubjectId === hashes.toParentSubjectId) addCode(blockers, 'move-parent-unchanged');
    if (codeList(row.blockers).length) addCode(blockers, 'move-result-has-blockers');
  }

  async function buildMoveApplyEvent(input) {
    var row = moveResult(input);
    var blockers = [];
    var warnings = [];

    if (!webCryptoAvailable()) addCode(blockers, 'web-crypto-unavailable');
    codeList(row.warnings).forEach(function (code) { addCode(warnings, code); });

    var hashes = {
      preStateHash: preStateHash(row),
      postStateHash: postStateHash(row),
      fromParentSubjectId: fromParentSubjectId(row),
      toParentSubjectId: toParentSubjectId(row)
    };
    validateMoveResult(row, hashes, blockers);
    var peer = await actorPeer(row, blockers);
    if (!validPeer(peer)) addCode(blockers, 'invalid-peer-identity');

    var forbiddenInputKey = foreverNoKey(row);
    if (forbiddenInputKey) {
      addCode(blockers, 'payload-contains-forever-no-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbiddenInputKey);
    }
    if (blockers.length) return failure(blockers, warnings);

    var opId = await operationId(
      row,
      hashes.preStateHash,
      hashes.postStateHash,
      hashes.fromParentSubjectId,
      hashes.toParentSubjectId
    );
    var txnId = await transactionId(row, opId);
    var auditId = await auditMaintenanceId(row, opId);
    var appliedAt = cleanString(row.appliedAtIso || row.movedAtIso || row.generatedAtIso) || nowIsoSeconds();
    var lineageId = cleanString(row.lineageId);
    var predicateVersion = cleanString(row.predicateVersion) || PREDICATE_VERSION;
    var payload = {
      auditMaintenanceId: auditId,
      operationId: opId,
      subjectId: cleanString(row.subjectId),
      lineageId: lineageId,
      preStateHash: hashes.preStateHash.toLowerCase(),
      postStateHash: hashes.postStateHash.toLowerCase(),
      fromParentSubjectId: hashes.fromParentSubjectId,
      toParentSubjectId: hashes.toParentSubjectId,
      operation: OPERATION,
      operationIntent: 'update',
      preState: {
        hash: hashes.preStateHash.toLowerCase(),
        fromParentSubjectId: hashes.fromParentSubjectId
      },
      postState: {
        hash: hashes.postStateHash.toLowerCase(),
        toParentSubjectId: hashes.toParentSubjectId
      },
      actorPeer: peer,
      appliedAtIso: appliedAt,
      predicateVersion: predicateVersion,
      treePredicateVersion: cleanString(row.treePredicateVersion) || TREE_PREDICATE_VERSION,
      transactionId: txnId,
      result: 'applied'
    };
    var forbiddenPayloadKey = foreverNoKey(payload);
    if (forbiddenPayloadKey) {
      return failure(['payload-contains-forever-no-field'], ['blocked-forbidden-key-' + forbiddenPayloadKey]);
    }

    var capabilitySnapshotHash = await sha256Hex(CAPABILITY_TAG);
    var payloadHash = await sha256Hex(canonicalJson(payload));
    var dedupeKey = await sha256Hex(canonicalJson({
      schema: ENVELOPE_SCHEMA,
      kind: 'applyEvent',
      operation: OPERATION,
      subjectId: payload.subjectId,
      lineageId: lineageId,
      preStateHash: payload.preStateHash,
      postStateHash: payload.postStateHash,
      fromParentSubjectId: payload.fromParentSubjectId,
      toParentSubjectId: payload.toParentSubjectId,
      operationId: opId,
      transactionId: txnId
    }));
    var envelopeBase = {
      schema: ENVELOPE_SCHEMA,
      envelopeVersion: 'v1',
      envelopeKindVersion: 'v1',
      kind: 'applyEvent',
      id: generateUuid(),
      lineageId: lineageId,
      createdAt: nowIsoSeconds(),
      sequence: null,
      exportSequence: null,
      sourcePlatform: {
        platformId: 'desktop-studio',
        surfaceKind: 'desktop-tauri',
        sourcePeerEnvelope: peer
      },
      declaredAuthority: 'strong-local-authority',
      effectiveAuthority: 'strong-local-authority',
      capabilityUsed: 'apply',
      capabilitySnapshotHash: capabilitySnapshotHash,
      subjectType: SUBJECT_TYPE,
      subjectId: payload.subjectId,
      operation: OPERATION,
      operationIntent: 'update',
      redactionClass: REDACTED,
      dryRun: false,
      transactional: true,
      dedupeKey: dedupeKey,
      payloadHash: payloadHash,
      payload: payload
    };
    var eventDigest = await sha256Hex(canonicalJson(envelopeBase));
    var envelope = Object.assign({}, envelopeBase, {
      eventDigest: eventDigest,
      warnings: warnings.slice(),
      blockers: []
    });

    var forbiddenEnvelopeKey = foreverNoKey(envelope);
    if (forbiddenEnvelopeKey) {
      return failure(['payload-contains-forever-no-field'], ['blocked-forbidden-key-' + forbiddenEnvelopeKey]);
    }
    return {
      schema: RESULT_SCHEMA,
      ok: true,
      applyEvent: envelope,
      blockers: [],
      warnings: warnings.slice()
    };
  }

  H2O.Desktop.Sync.buildMoveApplyEvent = buildMoveApplyEvent;
  H2O.Desktop.Sync.__moveApplyEventInstalled = true;
  H2O.Desktop.Sync.__moveApplyEventVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
