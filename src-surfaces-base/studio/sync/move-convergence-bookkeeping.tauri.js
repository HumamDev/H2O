/* H2O Desktop Sync - F11.0.5 move convergence bookkeeping
 *
 * Desktop/Tauri-only finalization for one successful local move convergence
 * result.
 *
 * Safety invariants:
 *   - Bookkeeping only. No move, no second mutation, no publication, no
 *     enqueue, no upload/download, no WebDAV, no remote mutation, no timers,
 *     no polling, and no mobile write-back.
 *   - Requires moveResult.moved === true, a valid subjectId, lineageId, and
 *     a valid redacted move applyEvent receipt source.
 *   - Records exactly two durable rows after receipt validation:
 *       1. consumed-operation ledger row with consumedStatus === "consumed"
 *       2. convergence watermark row for the moved subject/revision
 *   - applyEvent is evidence of a completed local move, never a remote apply
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
  if (H2O.Desktop.Sync.__moveConvergenceBookkeepingInstalled) return;

  var SCHEMA = 'h2o.desktop.sync.move-convergence-bookkeeping.v1';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var VERSION = '0.1.0-f11.0.5';
  var SUBJECT_TYPE = 'folder.metadata';
  var OPERATION = 'folder.move';
  var ENVELOPE_KIND = 'applyEvent';
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

  function postStateHash(envelope) {
    var payload = safeObject(envelope.payload);
    var postState = safeObject(payload.postState);
    return cleanString(payload.postStateHash || postState.hash).toLowerCase();
  }

  function appliedAtIso(envelope) {
    var payload = safeObject(envelope.payload);
    var candidate = cleanString(payload.appliedAtIso || envelope.createdAt);
    return isIso(candidate) ? candidate : nowIsoSeconds();
  }

  function parentSubject(value) {
    if (value === null) return null;
    var text = cleanString(value).toLowerCase();
    return text ? text : null;
  }

  function fromParentSubjectId(envelope) {
    var payload = safeObject(envelope.payload);
    var preState = safeObject(payload.preState);
    return parentSubject(payload.fromParentSubjectId || preState.fromParentSubjectId);
  }

  function toParentSubjectId(envelope) {
    var payload = safeObject(envelope.payload);
    var postState = safeObject(payload.postState);
    return parentSubject(payload.toParentSubjectId || postState.toParentSubjectId);
  }

  function validateMoveResult(result, blockers, warnings) {
    var row = safeObject(result);
    if (row.moved !== true) addCode(blockers, 'move-result-not-moved');
    codeList(row.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(row.warnings).forEach(function (code) { addCode(warnings, code); });
    if (!isSha256Hex(row.subjectId)) addCode(blockers, 'subjectId-invalid');
    if (!cleanString(row.lineageId)) addCode(blockers, 'lineageId-required');
    if (!isStateHash(row.preStateHash)) addCode(blockers, 'preStateHash-invalid');
    if (!isStateHash(row.postStateHash)) addCode(blockers, 'postStateHash-invalid');
    if (!isParentSubjectHash(row.fromParentSubjectId)) addCode(blockers, 'fromParentSubjectId-invalid');
    if (!isParentSubjectHash(row.toParentSubjectId)) addCode(blockers, 'toParentSubjectId-invalid');
    if (row.fromParentSubjectId === row.toParentSubjectId) addCode(blockers, 'move-parent-unchanged');
    var forbidden = foreverNoKey(row);
    if (forbidden) {
      addCode(blockers, 'move-result-contains-forbidden-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbidden);
    }
  }

  function validateApplyEvent(envelope, expectedSubjectId, expectedLineageId, blockers, warnings) {
    var env = safeObject(envelope);
    var payload = safeObject(env.payload);
    var peer = sourcePeerEnvelope(env);
    if (env.schema !== ENVELOPE_SCHEMA) addCode(blockers, 'applyEvent-schema-invalid');
    if (env.kind !== ENVELOPE_KIND) addCode(blockers, 'applyEvent-kind-invalid');
    if (env.dryRun !== false) addCode(blockers, 'applyEvent-dryRun-invalid');
    if (env.transactional !== true) addCode(blockers, 'applyEvent-transactional-invalid');
    if (env.subjectType !== SUBJECT_TYPE) addCode(blockers, 'subjectType-invalid');
    if (cleanString(env.operation) !== OPERATION) addCode(blockers, 'operation-invalid');
    if (cleanString(env.operationIntent) !== 'update') addCode(blockers, 'operationIntent-invalid');
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
    if (!isStateHash(postStateHash(env))) addCode(blockers, 'applyEvent-postStateHash-invalid');
    if (!isParentSubjectHash(fromParentSubjectId(env))) addCode(blockers, 'applyEvent-fromParentSubjectId-invalid');
    if (!isParentSubjectHash(toParentSubjectId(env))) addCode(blockers, 'applyEvent-toParentSubjectId-invalid');
    if (fromParentSubjectId(env) === toParentSubjectId(env)) addCode(blockers, 'applyEvent-parent-unchanged');
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

  async function buildApplyEventReceipt(moveResult, blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.buildMoveApplyEvent !== 'function') {
      addCode(blockers, 'move-applyEvent-builder-unavailable');
      return null;
    }
    var built = null;
    try {
      built = safeObject(await sync.buildMoveApplyEvent({ moveResult: moveResult }));
    } catch (_) {
      addCode(blockers, 'move-applyEvent-build-failed');
      return null;
    }
    codeList(built.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(built.warnings).forEach(function (code) { addCode(warnings, code); });
    if (built.ok !== true || !isObject(built.applyEvent)) {
      if (!blockers.length) addCode(blockers, 'move-applyEvent-build-failed');
      return safeObject(built.applyEvent);
    }
    return safeObject(built.applyEvent);
  }

  async function finalizeMoveConvergence(input) {
    var args = safeObject(input);
    var moveResult = safeObject(args.moveResult || args.result);
    var blockers = [];
    var warnings = [];
    var sync = H2O.Desktop.Sync;

    if (!sync || typeof sync.recordConsumedOperation !== 'function') {
      addCode(blockers, 'consumed-operation-ledger-unavailable');
    }
    if (!sync || typeof sync.recordConvergenceWatermark !== 'function') {
      addCode(blockers, 'convergence-watermark-ledger-unavailable');
    }
    validateMoveResult(moveResult, blockers, warnings);

    var applyEvent = null;
    if (!blockers.length) {
      applyEvent = await buildApplyEventReceipt(moveResult, blockers, warnings);
    }
    if (applyEvent && !blockers.length) {
      validateApplyEvent(
        applyEvent,
        cleanString(moveResult.subjectId).toLowerCase(),
        cleanString(moveResult.lineageId),
        blockers,
        warnings
      );
    }
    if (blockers.length) return failure(blockers, warnings, null, null, applyEvent);

    var subjectId = cleanString(moveResult.subjectId || applyEvent.subjectId).toLowerCase();
    var lineageId = cleanString(moveResult.lineageId || applyEvent.lineageId);
    var peerId = peerIdFromApplyEvent(applyEvent);
    var revisionHash = postStateHash(applyEvent);
    var atIso = appliedAtIso(applyEvent);
    var consumedRow = null;
    var watermarkRow = null;

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
      reason: 'local-move-convergence-finalized',
      validationSummary: {
        ok: true,
        checkedAtIso: nowIsoSeconds(),
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
      return failure(['move-bookkeeping-output-contains-forbidden-field'], ['blocked-forbidden-key-' + forbidden], consumedRow, watermarkRow, null);
    }
    return output;
  }

  H2O.Desktop.Sync.finalizeMoveConvergence = finalizeMoveConvergence;
  H2O.Desktop.Sync.__moveConvergenceBookkeepingInstalled = true;
  H2O.Desktop.Sync.__moveConvergenceBookkeepingVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
