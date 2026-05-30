/* H2O Desktop Sync - F12.0.5 delete convergence bookkeeping
 *
 * Desktop/Tauri-only finalization for one successful F5-reviewed local delete.
 *
 * Safety invariants:
 *   - Bookkeeping only. No delete, second mutation, publication, enqueue,
 *     upload/download, WebDAV, remote mutation, timers, polling, or mobile
 *     write-back.
 *   - Requires deleteResult.deleted === true, a valid subjectId, lineageId,
 *     tombstoneId, auditMaintenanceId, and a valid redacted delete applyEvent
 *     receipt source.
 *   - Records exactly two durable rows after receipt validation:
 *       1. consumed-operation ledger row with consumedStatus === "consumed"
 *       2. convergence watermark row for the tombstoned subject revision
 *   - applyEvent is evidence of a completed local delete, never a remote apply
 *     command.
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
  if (H2O.Desktop.Sync.__deleteConvergenceBookkeepingInstalled) return;

  var SCHEMA = 'h2o.desktop.sync.delete-convergence-bookkeeping.v1';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var VERSION = '0.1.0-f12.0.5';
  var SUBJECT_TYPE = 'folder.metadata';
  var OPERATION = 'folder.delete';
  var ENVELOPE_KIND = 'applyEvent';
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

  function isIso(value) {
    var text = cleanString(value);
    if (!text) return false;
    return Number.isFinite(Date.parse(text));
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

  function bytesToHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i += 1) {
      var part = bytes[i].toString(16);
      hex += part.length === 1 ? '0' + part : part;
    }
    return hex;
  }

  function webCryptoAvailable() {
    try {
      return !!(global.crypto && global.crypto.subtle && global.crypto.subtle.digest);
    } catch (_) {
      return false;
    }
  }

  async function sha256Hex(value) {
    if (!webCryptoAvailable()) return '';
    var text = typeof value === 'string' ? value : String(value == null ? '' : value);
    var data = new TextEncoder().encode(text);
    var buffer = await global.crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(buffer));
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

  function failure(blockers, warnings, consumedRow, watermarkRow, applyEvent) {
    return {
      schema: SCHEMA,
      ok: false,
      applyEvent: applyEvent || null,
      consumedRow: consumedRow || null,
      watermarkRow: watermarkRow || null,
      blockers: codeList(blockers),
      warnings: codeList(warnings)
    };
  }

  function sourcePeerEnvelope(envelope) {
    var sourcePlatform = safeObject(envelope.sourcePlatform);
    var payload = safeObject(envelope.payload);
    return safeObject(sourcePlatform.sourcePeerEnvelope || payload.actorPeer);
  }

  function peerIdFromApplyEvent(envelope) {
    var peer = sourcePeerEnvelope(envelope);
    return cleanString(peer.syncPeerIdHash).toLowerCase();
  }

  function preStateHash(envelope) {
    var payload = safeObject(envelope.payload);
    var preState = safeObject(payload.preState);
    return cleanString(payload.preStateHash || preState.hash).toLowerCase();
  }

  function appliedAtIso(envelope) {
    var payload = safeObject(envelope.payload);
    var candidate = cleanString(payload.appliedAtIso || envelope.createdAt);
    return isIso(candidate) ? candidate : nowIsoSeconds();
  }

  function tombstoneId(envelope) {
    var payload = safeObject(envelope.payload);
    var postState = safeObject(payload.postState);
    return cleanString(payload.tombstoneId || postState.tombstoneId);
  }

  function auditMaintenanceId(envelope) {
    var payload = safeObject(envelope.payload);
    return cleanString(payload.auditMaintenanceId);
  }

  function validateDeleteResult(result, blockers, warnings) {
    var row = safeObject(result);
    if (row.deleted !== true) addCode(blockers, 'delete-result-not-deleted');
    codeList(row.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(row.warnings).forEach(function (code) { addCode(warnings, code); });
    if (!isSha256Hex(row.subjectId)) addCode(blockers, 'subjectId-invalid');
    if (!cleanString(row.lineageId)) addCode(blockers, 'lineageId-required');
    if (!validTombstoneId(row.tombstoneId)) addCode(blockers, 'tombstoneId-invalid');
    if (!validAuditMaintenanceId(row.auditMaintenanceId)) addCode(blockers, 'auditMaintenanceId-invalid');
    var forbidden = foreverNoKey(row);
    if (forbidden) {
      addCode(blockers, 'delete-result-contains-forbidden-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbidden);
    }
  }

  function validateApplyEvent(envelope, expectedSubjectId, expectedLineageId, expectedTombstoneId, expectedAuditId, blockers, warnings) {
    var env = safeObject(envelope);
    var payload = safeObject(env.payload);
    var peer = sourcePeerEnvelope(env);
    if (env.schema !== ENVELOPE_SCHEMA) addCode(blockers, 'applyEvent-schema-invalid');
    if (env.kind !== ENVELOPE_KIND) addCode(blockers, 'applyEvent-kind-invalid');
    if (env.dryRun !== false) addCode(blockers, 'applyEvent-dryRun-invalid');
    if (env.transactional !== true) addCode(blockers, 'applyEvent-transactional-invalid');
    if (env.subjectType !== SUBJECT_TYPE) addCode(blockers, 'subjectType-invalid');
    if (cleanString(env.operation) !== OPERATION) addCode(blockers, 'operation-invalid');
    if (cleanString(env.operationIntent) !== 'delete') addCode(blockers, 'operationIntent-invalid');
    if (!isSha256Hex(env.subjectId)) addCode(blockers, 'applyEvent-subjectId-invalid');
    if (expectedSubjectId && cleanString(env.subjectId).toLowerCase() !== expectedSubjectId) {
      addCode(blockers, 'applyEvent-subjectId-mismatch');
    }
    if (!cleanString(env.lineageId)) addCode(blockers, 'applyEvent-lineageId-required');
    if (expectedLineageId && cleanString(env.lineageId) !== expectedLineageId) {
      addCode(blockers, 'applyEvent-lineageId-mismatch');
    }
    if (!isSha256Hex(env.eventDigest)) addCode(blockers, 'applyEvent-eventDigest-invalid');
    if (!isSha256Hex(env.dedupeKey)) addCode(blockers, 'applyEvent-dedupeKey-invalid');
    if (!isStateHash(preStateHash(env))) addCode(blockers, 'applyEvent-preStateHash-invalid');
    if (!validTombstoneId(tombstoneId(env))) addCode(blockers, 'applyEvent-tombstoneId-invalid');
    if (expectedTombstoneId && tombstoneId(env) !== expectedTombstoneId) {
      addCode(blockers, 'applyEvent-tombstoneId-mismatch');
    }
    if (!validAuditMaintenanceId(auditMaintenanceId(env))) addCode(blockers, 'applyEvent-auditMaintenanceId-invalid');
    if (expectedAuditId && auditMaintenanceId(env) !== expectedAuditId) {
      addCode(blockers, 'applyEvent-auditMaintenanceId-mismatch');
    }
    if (!isSha256Hex(peer.syncPeerIdHash)) addCode(blockers, 'applyEvent-peer-invalid');
    if (payload.result !== 'applied') addCode(blockers, 'applyEvent-result-invalid');
    if (cleanString(payload.operationId) === '') addCode(blockers, 'applyEvent-operationId-required');
    if (cleanString(payload.transactionId) === '') addCode(blockers, 'applyEvent-transactionId-required');
    codeList(env.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(env.warnings).forEach(function (code) { addCode(warnings, code); });
    var forbidden = foreverNoKey(env);
    if (forbidden) {
      addCode(blockers, 'applyEvent-contains-forbidden-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbidden);
    }
  }

  async function buildApplyEventReceipt(deleteResult, blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.buildDeleteApplyEvent !== 'function') {
      addCode(blockers, 'delete-applyEvent-builder-unavailable');
      return null;
    }
    var built = null;
    try {
      built = safeObject(await sync.buildDeleteApplyEvent({ deleteResult: deleteResult }));
    } catch (_) {
      addCode(blockers, 'delete-applyEvent-build-failed');
      return null;
    }
    codeList(built.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(built.warnings).forEach(function (code) { addCode(warnings, code); });
    if (built.ok !== true || !isObject(built.applyEvent)) {
      if (!blockers.length) addCode(blockers, 'delete-applyEvent-build-failed');
      return safeObject(built.applyEvent);
    }
    return safeObject(built.applyEvent);
  }

  async function deleteRevisionHash(envelope) {
    var payload = safeObject(envelope.payload);
    var postState = safeObject(payload.postState);
    var existing = cleanString(payload.postStateHash || postState.hash).toLowerCase();
    if (isStateHash(existing)) return existing;
    return sha256Hex(canonicalJson({
      schema: SCHEMA,
      purpose: 'delete-watermark-revision',
      subjectId: cleanString(envelope.subjectId).toLowerCase(),
      lineageId: cleanString(envelope.lineageId),
      tombstoneId: tombstoneId(envelope),
      auditMaintenanceId: auditMaintenanceId(envelope),
      preStateHash: preStateHash(envelope),
      state: 'tombstoned'
    }));
  }

  async function finalizeDeleteConvergence(input) {
    var args = safeObject(input);
    var deleteResult = safeObject(args.deleteResult || args.result);
    var blockers = [];
    var warnings = [];
    var sync = H2O.Desktop.Sync;

    if (!webCryptoAvailable()) addCode(blockers, 'web-crypto-unavailable');
    if (!sync || typeof sync.recordConsumedOperation !== 'function') {
      addCode(blockers, 'consumed-operation-ledger-unavailable');
    }
    if (!sync || typeof sync.recordConvergenceWatermark !== 'function') {
      addCode(blockers, 'convergence-watermark-ledger-unavailable');
    }
    validateDeleteResult(deleteResult, blockers, warnings);

    var applyEvent = null;
    if (!blockers.length) {
      applyEvent = await buildApplyEventReceipt(deleteResult, blockers, warnings);
    }
    if (applyEvent && !blockers.length) {
      validateApplyEvent(
        applyEvent,
        cleanString(deleteResult.subjectId).toLowerCase(),
        cleanString(deleteResult.lineageId),
        cleanString(deleteResult.tombstoneId),
        cleanString(deleteResult.auditMaintenanceId),
        blockers,
        warnings
      );
    }
    if (blockers.length) return failure(blockers, warnings, null, null, applyEvent);

    var subjectId = cleanString(deleteResult.subjectId || applyEvent.subjectId).toLowerCase();
    var lineageId = cleanString(deleteResult.lineageId || applyEvent.lineageId);
    var peerId = peerIdFromApplyEvent(applyEvent);
    var revisionHash = await deleteRevisionHash(applyEvent);
    var atIso = appliedAtIso(applyEvent);
    var consumedRow = null;
    var watermarkRow = null;

    if (!isStateHash(revisionHash)) {
      return failure(['delete-watermark-revisionHash-invalid'], warnings, null, null, applyEvent);
    }

    var consumedResult = safeObject(await sync.recordConsumedOperation({
      eventDigest: cleanString(applyEvent.eventDigest).toLowerCase(),
      dedupeKey: cleanString(applyEvent.dedupeKey).toLowerCase(),
      lineageId: lineageId,
      subjectId: subjectId,
      sourcePeerId: peerId,
      envelopeKind: ENVELOPE_KIND,
      operationKind: OPERATION,
      consumedStatus: 'consumed',
      consumedAtIso: atIso,
      actorPeer: sourcePeerEnvelope(applyEvent),
      reason: 'local-delete-convergence-finalized',
      validationSummary: {
        ok: true,
        checkedAtIso: nowIsoSeconds(),
        tombstoneId: tombstoneId(applyEvent),
        auditMaintenanceId: auditMaintenanceId(applyEvent),
        blockers: [],
        warnings: []
      }
    }));
    codeList(consumedResult.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(consumedResult.warnings).forEach(function (code) { addCode(warnings, code); });
    if (consumedResult.ok !== true || !consumedResult.row) {
      if (!blockers.length) addCode(blockers, 'consumed-operation-record-failed');
      return failure(blockers, warnings, null, null, applyEvent);
    }
    consumedRow = consumedResult.row;

    var watermarkResult = safeObject(await sync.recordConvergenceWatermark({
      peerId: peerId,
      subjectId: subjectId,
      lineageId: lineageId,
      revisionHash: revisionHash,
      watermarkAtIso: atIso
    }));
    codeList(watermarkResult.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(watermarkResult.warnings).forEach(function (code) { addCode(warnings, code); });
    if (watermarkResult.ok !== true || !watermarkResult.row) {
      if (!blockers.length) addCode(blockers, 'convergence-watermark-record-failed');
      return failure(blockers, warnings, consumedRow, null, applyEvent);
    }
    watermarkRow = watermarkResult.row;

    var output = {
      schema: SCHEMA,
      ok: true,
      applyEvent: applyEvent,
      consumedRow: consumedRow,
      watermarkRow: watermarkRow,
      blockers: [],
      warnings: codeList(warnings)
    };
    var forbidden = foreverNoKey(output);
    if (forbidden) {
      return failure(['delete-bookkeeping-output-contains-forbidden-field'], ['blocked-forbidden-key-' + forbidden], consumedRow, watermarkRow, null);
    }
    return output;
  }

  H2O.Desktop.Sync.finalizeDeleteConvergence = finalizeDeleteConvergence;
  H2O.Desktop.Sync.__deleteConvergenceBookkeepingInstalled = true;
  H2O.Desktop.Sync.__deleteConvergenceBookkeepingVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
