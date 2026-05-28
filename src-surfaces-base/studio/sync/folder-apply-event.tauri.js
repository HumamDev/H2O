/* H2O Desktop Sync - F10.7.2 desktop folder applyEvent receipt builder
 *
 * Desktop/Tauri-only receipt generation after a completed local apply.
 *
 * Safety invariants:
 *   - Builds applyEvent envelopes only from successful committed local audit rows.
 *   - applyEvent is past-tense evidence, never a remote apply command.
 *   - No mutation, no fetch, no storage write, no runtime message, no WebDAV,
 *     no convergence, no retry, and no automatic merge.
 *   - Folder color only. No rename, move, create, delete, or binding apply.
 *   - Output is redacted: no raw folder IDs, names, chat IDs, colors, paths,
 *     URLs, tokens, or content.
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
  if (H2O.Desktop.Sync.__folderApplyEventInstalled) return;

  var FAILURE_SCHEMA = 'h2o.desktop.sync.folder-apply-event-build.v1';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var VERSION = '0.1.0-f10.7.2';
  var CAPABILITY_TAG = 'h2o.platform.capabilities.v1#f10.7.2-desktop-folder-apply-event-v1';
  var PREDICATE_VERSION = 'h2o.studio.sync.f7-color-apply.v1';
  var OPERATION = 'folder-metadata-color-apply';
  var SUBJECT_TYPE = 'folder.metadata';
  var REDACTED = 'redacted';
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'attachments',
    'url', 'path', 'password', 'apiKey'
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

  function isSha256Hex(value) {
    return /^[0-9a-f]{64}$/.test(cleanString(value));
  }

  function isLocalStateHash(value) {
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
    var keys = Object.keys(value).sort();
    for (var i = 0; i < keys.length; i += 1) out[keys[i]] = canonicalize(value[keys[i]]);
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

  function codeList(value) {
    return asArray(value).map(function (item) {
      return isObject(item) ? cleanString(item.code) : cleanString(item);
    }).filter(Boolean);
  }

  function failure(blockers, warnings) {
    return {
      schema: FAILURE_SCHEMA,
      ok: false,
      kind: 'applyEvent',
      dryRun: false,
      transactional: true,
      emitted: false,
      localOnly: true,
      remotePropagated: false,
      blockers: codeList(blockers),
      warnings: codeList(warnings)
    };
  }

  function actorPeer(row) {
    return safeObject(row.actorPeer || row.sourcePeerEnvelope || row.peerEnvelope);
  }

  function validActorPeer(peer) {
    return isSha256Hex(peer.physicalDeviceIdHash)
      && isSha256Hex(peer.installIdHash)
      && isSha256Hex(peer.syncPeerIdHash)
      && cleanString(peer.surfaceKind || 'desktop-tauri') === 'desktop-tauri';
  }

  function fieldsUpdated(row) {
    return asArray(row.fieldsUpdated || row.changedFields)
      .map(cleanString)
      .filter(Boolean)
      .sort();
  }

  function rowResult(row) {
    return cleanString(row.result || row.resultState || row.status);
  }

  function transactionComplete(row) {
    return row.transactionComplete === true
      || row.transactionCommitted === true
      || row.committed === true;
  }

  function operation(row) {
    return cleanString(row.operation) || OPERATION;
  }

  function operationIntent(row) {
    return cleanString(row.operationIntent) || 'update';
  }

  function auditMaintenanceId(row) {
    return cleanString(row.auditMaintenanceId || row.maintenanceId || row.auditId);
  }

  function appliedAtIso(row) {
    return cleanString(row.appliedAtIso || row.completedAtIso || row.createdAtIso);
  }

  function validateAuditRow(row, blockers) {
    if (!isObject(row)) {
      addCode(blockers, 'audit-row-missing');
      return;
    }
    if (rowResult(row) !== 'applied') addCode(blockers, 'apply-result-not-applied');
    if (!transactionComplete(row)) addCode(blockers, 'transaction-incomplete');
    if (!auditMaintenanceId(row)) addCode(blockers, 'audit-row-missing');
    if (!isSha256Hex(row.operationId)) addCode(blockers, 'operation-id-invalid');
    if (!isSha256Hex(row.subjectId)) addCode(blockers, 'subject-id-invalid');
    if (cleanString(row.subjectType || SUBJECT_TYPE) !== SUBJECT_TYPE) addCode(blockers, 'unsupported-entity-kind');
    if (operation(row) !== OPERATION) addCode(blockers, 'operation-outside-color-scope');
    if (operationIntent(row) !== 'update') addCode(blockers, 'operation-intent-update-required');
    var fields = fieldsUpdated(row);
    if (fields.length !== 1 || fields[0] !== 'color') addCode(blockers, 'field-not-allowlisted');
    if (!isLocalStateHash(row.preStateHash)) addCode(blockers, 'pre-state-hash-invalid');
    if (!isLocalStateHash(row.postStateHash)) addCode(blockers, 'post-state-hash-invalid');
    if (!validActorPeer(actorPeer(row))) addCode(blockers, 'invalid-peer-identity');
    if (!appliedAtIso(row)) addCode(blockers, 'applied-at-required');
    if (!cleanString(row.transactionId)) addCode(blockers, 'transaction-id-required');
    if (!cleanString(row.dedupeKey)) addCode(blockers, 'dedupe-key-required');
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

  async function buildFolderApplyEvent(input) {
    var args = safeObject(input);
    var row = safeObject(args.applyAuditRow);
    var blockers = [];
    var warnings = [];

    if (!webCryptoAvailable()) addCode(blockers, 'web-crypto-unavailable');
    validateAuditRow(row, blockers);
    codeList(row.warnings).forEach(function (code) { addCode(warnings, code); });
    if (codeList(row.blockers).length) addCode(blockers, 'apply-audit-row-has-blockers');
    if (blockers.length) return failure(blockers, warnings);

    var peer = Object.assign({ surfaceKind: 'desktop-tauri' }, actorPeer(row));
    var predicateVersion = cleanString(row.predicateVersion) || PREDICATE_VERSION;
    var lineageId = cleanString(row.proposalLineageId || row.lineageId) || generateUuid();
    var createdAt = nowIsoSeconds();
    var payload = {
      auditMaintenanceId: auditMaintenanceId(row),
      operationId: cleanString(row.operationId),
      subjectId: cleanString(row.subjectId),
      operation: OPERATION,
      operationIntent: 'update',
      preStateHash: cleanString(row.preStateHash).toLowerCase(),
      postStateHash: cleanString(row.postStateHash).toLowerCase(),
      preState: { hash: cleanString(row.preStateHash).toLowerCase() },
      postState: { hash: cleanString(row.postStateHash).toLowerCase() },
      actorPeer: peer,
      appliedAtIso: appliedAtIso(row),
      predicateVersion: predicateVersion,
      transactionId: cleanString(row.transactionId),
      dedupeKey: cleanString(row.dedupeKey),
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
      operationId: payload.operationId,
      subjectId: payload.subjectId,
      transactionId: payload.transactionId,
      payloadDedupeKey: payload.dedupeKey
    }));

    var envelopeBase = {
      schema: ENVELOPE_SCHEMA,
      envelopeVersion: 'v1',
      envelopeKindVersion: 'v1',
      kind: 'applyEvent',
      id: generateUuid(),
      lineageId: lineageId,
      createdAt: createdAt,
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
    return envelope;
  }

  H2O.Desktop.Sync.buildFolderApplyEvent = buildFolderApplyEvent;
  H2O.Desktop.Sync.__folderApplyEventInstalled = true;
  H2O.Desktop.Sync.__folderApplyEventVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
