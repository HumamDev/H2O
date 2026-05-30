/* H2O Desktop Sync - F12.0.4d delete applyEvent receipt builder
 *
 * Desktop/Tauri-only applyEvent generation after a successful F5 reviewed
 * empty-folder delete.
 *
 * Safety invariants:
 *   - Receipt only. No delete, apply, watermark write, consumed-ledger write,
 *     publication, outbox enqueue, upload/download, WebDAV, convergence,
 *     retry, automatic merge, or mobile write-back.
 *   - Builds a past-tense applyEvent only from a successful reviewed delete
 *     result and verified local tombstone/audit evidence.
 *   - Output is redacted. Raw folder IDs, raw names, recovery snapshots, chat
 *     IDs, paths, URLs, tokens, and content are forbidden.
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
  if (H2O.Desktop.Sync.__deleteApplyEventInstalled) return;

  var RESULT_SCHEMA = 'h2o.desktop.sync.delete-apply-event-build.v1';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var VERSION = '0.1.0-f12.0.4d';
  var DB_URL = 'sqlite:studio-v1.db';
  var CAPABILITY_TAG = 'h2o.platform.capabilities.v1#f12.0.4d-desktop-delete-apply-event-v1';
  var PREDICATE_VERSION = 'h2o.folder-delete.f5-reviewed.v1';
  var OPERATION = 'folder.delete';
  var APPLY_OPERATION = 'f5-reviewed-empty-folder-delete';
  var SUBJECT_TYPE = 'folder.metadata';
  var REDACTED = 'redacted';
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'attachments',
    'name', 'title', 'folderName', 'chatTitle', 'rawId', 'chatId',
    'folderId', 'targetFolderId', 'parentId', 'targetParentId',
    'sourceParentId', 'path', 'url', 'password', 'apiKey',
    'proposedName', 'targetName', 'previousName', 'rawName',
    'recoverySnapshot', 'rawSnapshot'
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

  function validTombstoneId(value) {
    var text = cleanString(value);
    return /^tombstone:[A-Za-z0-9:_-]+$/.test(text);
  }

  function validAuditMaintenanceId(value) {
    var text = cleanString(value);
    return isSha256Hex(text) || /^maintenance:[A-Za-z0-9:_-]+$/.test(text) || /^audit-[A-Za-z0-9:_-]+$/.test(text);
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

  function deleteResult(input) {
    var args = safeObject(input);
    return safeObject(args.deleteResult || args.result || args);
  }

  function getInvoke() {
    try {
      var internals = global.__TAURI_INTERNALS__;
      if (internals && typeof internals.invoke === 'function') return internals.invoke.bind(internals);
    } catch (_) { /* ignore */ }
    try {
      var tauri = global.__TAURI__;
      if (tauri && tauri.core && typeof tauri.core.invoke === 'function') return tauri.core.invoke.bind(tauri.core);
      if (tauri && typeof tauri.invoke === 'function') return tauri.invoke.bind(tauri);
    } catch (_) { /* ignore */ }
    return null;
  }

  function sqlSelect(query, values) {
    var invoke = getInvoke();
    if (!invoke) return Promise.reject(new Error('tauri invoke unavailable'));
    return invoke('plugin:sql|select', { db: DB_URL, query: query, values: values || [] });
  }

  function parseMeta(raw) {
    if (raw == null || raw === '') return {};
    if (isObject(raw)) return raw;
    if (typeof raw !== 'string') return {};
    try {
      var parsed = JSON.parse(raw);
      return isObject(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function tombstoneStore() {
    return H2O.Studio && H2O.Studio.store && H2O.Studio.store.tombstones;
  }

  async function readTombstone(tombstoneId, blockers, warnings) {
    var api = tombstoneStore();
    if (api && typeof api.getById === 'function') {
      try {
        var viaStore = await Promise.resolve(api.getById(tombstoneId));
        if (viaStore) return safeObject(viaStore);
      } catch (_) {
        addCode(warnings, 'tombstone-store-read-failed');
      }
    }
    try {
      var rows = await sqlSelect(
        'SELECT * FROM sync_tombstones WHERE tombstone_id = ? LIMIT 1',
        [tombstoneId]
      );
      if (!Array.isArray(rows) || !rows.length) return null;
      var row = safeObject(rows[0]);
      return {
        tombstoneId: cleanString(row.tombstone_id),
        schema: cleanString(row.schema),
        recordKind: cleanString(row.record_kind),
        recordId: cleanString(row.record_id),
        deletedAt: cleanString(row.deleted_at),
        deletedBySyncPeerId: cleanString(row.deleted_by_sync_peer_id),
        deleteReason: cleanString(row.delete_reason),
        priorDigest: cleanString(row.prior_digest),
        priorUpdatedAt: cleanString(row.prior_updated_at),
        meta: parseMeta(row.meta_json),
        createdAt: cleanString(row.created_at),
        updatedAt: cleanString(row.updated_at)
      };
    } catch (_) {
      addCode(blockers, 'tombstone-read-failed');
      return null;
    }
  }

  async function readAuditRow(auditMaintenanceId, blockers) {
    try {
      var rows = await sqlSelect(
        'SELECT * FROM sync_maintenance_log WHERE maintenance_id = ? LIMIT 1',
        [auditMaintenanceId]
      );
      if (!Array.isArray(rows) || !rows.length) return null;
      var row = safeObject(rows[0]);
      return {
        maintenanceId: cleanString(row.maintenance_id),
        schema: cleanString(row.schema),
        operation: cleanString(row.operation),
        policyVersion: cleanString(row.policy_version),
        reason: cleanString(row.reason),
        requestedAt: cleanString(row.requested_at),
        requestedBySyncPeerId: cleanString(row.requested_by_sync_peer_id),
        platform: cleanString(row.platform),
        dryRun: Number(row.dry_run) || 0,
        result: parseMeta(row.result_json)
      };
    } catch (_) {
      addCode(blockers, 'audit-row-read-failed');
      return null;
    }
  }

  function preStateHashFrom(row, tombstone) {
    var result = safeObject(row);
    var audit = safeObject(result.audit || result.ledger || result.applyAuditRow);
    var tomb = safeObject(tombstone);
    var meta = safeObject(tomb.meta);
    var snapshot = safeObject(meta.recoverySnapshot);
    return cleanLower(
      result.preStateHash ||
      safeObject(result.preState).hash ||
      audit.preStateHash ||
      tomb.priorDigest ||
      snapshot.preStateHash ||
      snapshot.canonicalPreStateHash ||
      snapshot.localPreStateHash
    );
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

  function validateTombstone(row, tombstone, deleteRow, blockers) {
    if (!tombstone) {
      addCode(blockers, 'tombstone-not-found');
      return;
    }
    if (cleanString(tombstone.tombstoneId) !== cleanString(row.tombstoneId)) addCode(blockers, 'tombstone-id-mismatch');
    if (cleanString(tombstone.recordKind) !== 'folder') addCode(blockers, 'tombstone-record-kind-invalid');
    if (cleanString(tombstone.deleteReason) !== APPLY_OPERATION) addCode(blockers, 'tombstone-delete-reason-invalid');
    if (!isStateHash(preStateHashFrom(row, tombstone))) addCode(blockers, 'pre-state-hash-invalid');
    var result = safeObject(deleteRow && deleteRow.result);
    if (result.tombstoneIdPresent !== true) addCode(blockers, 'audit-tombstone-link-missing');
  }

  function validateAudit(row, audit, blockers) {
    if (!audit) {
      addCode(blockers, 'audit-row-missing');
      return;
    }
    if (cleanString(audit.maintenanceId) !== cleanString(row.auditMaintenanceId)) addCode(blockers, 'audit-row-missing');
    if (cleanString(audit.schema) !== 'h2o.studio.sync.maintenance.v1') addCode(blockers, 'audit-row-schema-invalid');
    if (cleanString(audit.operation) !== APPLY_OPERATION) addCode(blockers, 'audit-operation-invalid');
    if (cleanString(audit.policyVersion) !== PREDICATE_VERSION) addCode(blockers, 'audit-policy-version-invalid');
    if (Number(audit.dryRun) !== 0) addCode(blockers, 'audit-row-dry-run');
  }

  function validateDeleteResult(row, tombstone, audit, blockers) {
    if (!isObject(row)) {
      addCode(blockers, 'delete-result-missing');
      return;
    }
    if (row.deleted !== true) addCode(blockers, 'delete-result-not-deleted');
    if (!isSha256Hex(row.subjectId)) addCode(blockers, 'subject-id-invalid');
    if (!cleanString(row.lineageId)) addCode(blockers, 'lineage-id-required');
    if (!validTombstoneId(row.tombstoneId)) addCode(blockers, 'tombstone-id-invalid');
    if (!validAuditMaintenanceId(row.auditMaintenanceId)) addCode(blockers, 'audit-row-missing');
    if (!isStateHash(preStateHashFrom(row, tombstone))) addCode(blockers, 'pre-state-hash-invalid');
    if (codeList(row.blockers).length) addCode(blockers, 'delete-result-has-blockers');
    validateTombstone(row, tombstone, audit, blockers);
    validateAudit(row, audit, blockers);
  }

  async function operationId(row, preHash) {
    var existing = cleanString(row.operationId || safeObject(row.audit).operationId || safeObject(row.ledger).operationId);
    if (isSha256Hex(existing)) return existing;
    return sha256Hex(canonicalJson({
      schema: RESULT_SCHEMA,
      purpose: 'operationId',
      operation: OPERATION,
      subjectId: cleanString(row.subjectId),
      lineageId: cleanString(row.lineageId),
      tombstoneId: cleanString(row.tombstoneId),
      auditMaintenanceId: cleanString(row.auditMaintenanceId),
      preStateHash: preHash
    }));
  }

  async function transactionId(row, opId) {
    var existing = cleanString(row.transactionId || safeObject(row.audit).transactionId || safeObject(row.ledger).transactionId);
    if (existing) return existing;
    return sha256Hex(canonicalJson({
      schema: RESULT_SCHEMA,
      purpose: 'transactionId',
      auditMaintenanceId: cleanString(row.auditMaintenanceId),
      operationId: opId
    }));
  }

  function appliedAtIso(row, tombstone, audit) {
    return cleanString(row.appliedAtIso || row.deletedAtIso || tombstone.deletedAt || audit.requestedAt) || nowIsoSeconds();
  }

  async function buildDeleteApplyEvent(input) {
    var row = deleteResult(input);
    var blockers = [];
    var warnings = [];

    if (!webCryptoAvailable()) addCode(blockers, 'web-crypto-unavailable');
    if (!getInvoke()) addCode(blockers, 'tauri-sql-unavailable');
    codeList(row.warnings).forEach(function (code) { addCode(warnings, code); });

    var tombstone = null;
    var audit = null;
    if (validTombstoneId(row.tombstoneId)) {
      tombstone = await readTombstone(cleanString(row.tombstoneId), blockers, warnings);
    }
    if (validAuditMaintenanceId(row.auditMaintenanceId)) {
      audit = await readAuditRow(cleanString(row.auditMaintenanceId), blockers);
    }

    validateDeleteResult(row, tombstone, audit, blockers);
    var peer = await actorPeer(row, blockers);
    if (!validPeer(peer)) addCode(blockers, 'invalid-peer-identity');

    var forbiddenInputKey = foreverNoKey(row);
    if (forbiddenInputKey) {
      addCode(blockers, 'payload-contains-forever-no-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbiddenInputKey);
    }
    if (blockers.length) return failure(blockers, warnings);

    var preHash = preStateHashFrom(row, tombstone);
    var opId = await operationId(row, preHash);
    var txnId = await transactionId(row, opId);
    var lineageId = cleanString(row.lineageId);
    var appliedAt = appliedAtIso(row, tombstone, audit);
    var predicateVersion = cleanString(row.predicateVersion) || PREDICATE_VERSION;
    var payload = {
      auditMaintenanceId: cleanString(row.auditMaintenanceId),
      operationId: opId,
      subjectId: cleanString(row.subjectId),
      lineageId: lineageId,
      tombstoneId: cleanString(row.tombstoneId),
      preStateHash: preHash.toLowerCase(),
      operation: OPERATION,
      operationIntent: 'delete',
      preState: {
        hash: preHash.toLowerCase()
      },
      postState: {
        state: 'tombstoned',
        tombstoneId: cleanString(row.tombstoneId)
      },
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
      operationIntent: 'delete',
      subjectId: payload.subjectId,
      lineageId: lineageId,
      tombstoneId: payload.tombstoneId,
      auditMaintenanceId: payload.auditMaintenanceId,
      preStateHash: payload.preStateHash,
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
      capabilityUsed: 'delete',
      capabilitySnapshotHash: capabilitySnapshotHash,
      subjectType: SUBJECT_TYPE,
      subjectId: payload.subjectId,
      operation: OPERATION,
      operationIntent: 'delete',
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

  H2O.Desktop.Sync.buildDeleteApplyEvent = buildDeleteApplyEvent;
  H2O.Desktop.Sync.__deleteApplyEventInstalled = true;
  H2O.Desktop.Sync.__deleteApplyEventVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
