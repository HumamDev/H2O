/* H2O Desktop Sync - F10.9.5 rename applyEvent receipt builder
 *
 * Desktop/Tauri-only applyEvent generation after a successful local rename.
 *
 * Safety invariants:
 *   - Builds applyEvent envelopes only from successful local rename results.
 *   - applyEvent is past-tense evidence, never a remote apply command.
 *   - Receipt only. No rename, apply, publication, outbox enqueue, upload,
 *     watermark write, consumed-ledger write, convergence, WebDAV, retry,
 *     automatic merge, or mobile write-back.
 *   - Output is redacted: targetNameHash is allowed, raw names, raw folder IDs,
 *     parent IDs, chat IDs, paths, URLs, tokens, and content are forbidden.
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
  if (H2O.Desktop.Sync.__renameApplyEventInstalled) return;

  var RESULT_SCHEMA = 'h2o.desktop.sync.rename-apply-event-build.v1';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var VERSION = '0.1.0-f10.9.5';
  var CAPABILITY_TAG = 'h2o.platform.capabilities.v1#f10.9.5-desktop-rename-apply-event-v1';
  var PREDICATE_VERSION = 'h2o.folder-sync.rename-predicate.v1';
  var OPERATION = 'folder.rename';
  var SUBJECT_TYPE = 'folder.metadata';
  var REDACTED = 'redacted';
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'attachments',
    'name', 'title', 'folderName', 'chatTitle', 'rawId', 'chatId',
    'folderId', 'targetFolderId', 'parentId', 'targetParentId',
    'path', 'url', 'password', 'apiKey',
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

  function preStateHash(row) {
    var result = safeObject(row);
    var audit = safeObject(result.audit || result.ledger || result.applyAuditRow);
    return cleanString(result.preStateHash || audit.preStateHash || safeObject(result.preState).hash).toLowerCase();
  }

  function postStateHash(row) {
    var result = safeObject(row);
    var audit = safeObject(result.audit || result.ledger || result.applyAuditRow);
    return cleanString(result.postStateHash || audit.postStateHash || safeObject(result.postState).hash).toLowerCase();
  }

  function targetNameHash(row) {
    var result = safeObject(row);
    var audit = safeObject(result.audit || result.ledger || result.applyAuditRow);
    var post = safeObject(result.postState || result.expectedPostState);
    var payload = safeObject(result.payload);
    return cleanString(
      result.targetNameHash ||
      audit.targetNameHash ||
      post.targetNameHash ||
      safeObject(payload.expectedPostState).targetNameHash ||
      safeObject(payload.proposedOperation).targetNameHash
    ).toLowerCase();
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

  async function operationId(row, preHash, postHash, targetHash) {
    var existing = cleanString(row.operationId || safeObject(row.audit).operationId || safeObject(row.ledger).operationId);
    if (isSha256Hex(existing)) return existing;
    return sha256Hex(canonicalJson({
      schema: RESULT_SCHEMA,
      purpose: 'operationId',
      subjectId: cleanString(row.subjectId),
      lineageId: cleanString(row.lineageId),
      preStateHash: preHash,
      postStateHash: postHash,
      targetNameHash: targetHash
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

  function validateRenameResult(row, hashes, blockers) {
    if (!isObject(row)) {
      addCode(blockers, 'rename-result-missing');
      return;
    }
    if (row.renamed !== true) addCode(blockers, 'rename-result-not-renamed');
    if (!isSha256Hex(row.subjectId)) addCode(blockers, 'subject-id-invalid');
    if (!cleanString(row.lineageId)) addCode(blockers, 'lineage-id-required');
    if (!isStateHash(hashes.preStateHash)) addCode(blockers, 'pre-state-hash-invalid');
    if (!isStateHash(hashes.postStateHash)) addCode(blockers, 'post-state-hash-invalid');
    if (!isSha256Hex(hashes.targetNameHash)) addCode(blockers, 'targetNameHash-unavailable');
    if (codeList(row.blockers).length) addCode(blockers, 'rename-result-has-blockers');
  }

  async function buildRenameApplyEvent(input) {
    var args = safeObject(input);
    var row = safeObject(args.renameResult || args.result || args);
    var blockers = [];
    var warnings = [];

    if (!webCryptoAvailable()) addCode(blockers, 'web-crypto-unavailable');
    codeList(row.warnings).forEach(function (code) { addCode(warnings, code); });

    var hashes = {
      preStateHash: preStateHash(row),
      postStateHash: postStateHash(row),
      targetNameHash: targetNameHash(row)
    };
    validateRenameResult(row, hashes, blockers);
    var peer = await actorPeer(row, blockers);
    if (!validPeer(peer)) addCode(blockers, 'invalid-peer-identity');

    var forbiddenInputKey = foreverNoKey(row);
    if (forbiddenInputKey) {
      addCode(blockers, 'payload-contains-forever-no-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbiddenInputKey);
    }
    if (blockers.length) return failure(blockers, warnings);

    var opId = await operationId(row, hashes.preStateHash, hashes.postStateHash, hashes.targetNameHash);
    var txnId = await transactionId(row, opId);
    var appliedAt = cleanString(row.appliedAtIso || row.renamedAtIso || row.generatedAtIso) || nowIsoSeconds();
    var lineageId = cleanString(row.lineageId);
    var predicateVersion = cleanString(row.predicateVersion) || PREDICATE_VERSION;
    var payload = {
      operationId: opId,
      subjectId: cleanString(row.subjectId),
      lineageId: lineageId,
      preStateHash: hashes.preStateHash.toLowerCase(),
      postStateHash: hashes.postStateHash.toLowerCase(),
      targetNameHash: hashes.targetNameHash.toLowerCase(),
      operation: OPERATION,
      operationIntent: 'update',
      actorPeer: peer,
      appliedAtIso: appliedAt,
      predicateVersion: predicateVersion,
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
      targetNameHash: payload.targetNameHash,
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

  H2O.Desktop.Sync.buildRenameApplyEvent = buildRenameApplyEvent;
  H2O.Desktop.Sync.__renameApplyEventInstalled = true;
  H2O.Desktop.Sync.__renameApplyEventVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
