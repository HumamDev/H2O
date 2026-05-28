/* H2O Desktop Sync - F10.8.9c convergence post-apply bookkeeping
 *
 * Desktop/Tauri-only finalization for one successful local color convergence
 * result.
 *
 * Safety invariants:
 *   - Bookkeeping only. No apply, no second mutation, no publication, no
 *     enqueue, no upload/download, no WebDAV, no remote mutation, no timers,
 *     no polling, and no mobile write-back.
 *   - Requires convergenceResult.applied === true, a valid subjectId,
 *     lineageId, and a valid applyEvent receipt source.
 *   - Records exactly two durable rows after receipt validation:
 *       1. consumed-operation ledger row with consumedStatus === "consumed"
 *       2. convergence watermark row for the subject/revision
 *   - applyEvent is evidence of a completed local apply, never a remote apply
 *     command.
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
  if (H2O.Desktop.Sync.__convergenceBookkeepingInstalled) return;

  var SCHEMA = 'h2o.desktop.sync.convergence-bookkeeping.v1';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var VERSION = '0.1.0-f10.8.9c';
  var SUBJECT_TYPE = 'folder.metadata';
  var OPERATION = 'folder-metadata-color-apply';
  var ENVELOPE_KIND = 'applyEvent';
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'attachments',
    'name', 'title', 'folderName', 'chatTitle', 'rawId', 'chatId',
    'folderId', 'targetFolderId', 'path', 'url', 'password', 'apiKey',
    'targetColor', 'color', 'iconColor', 'folderColor', 'accentColor'
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

  function validateConvergenceResult(result, blockers, warnings) {
    if (safeObject(result).applied !== true) addCode(blockers, 'convergence-result-not-applied');
    codeList(result.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(result.warnings).forEach(function (code) { addCode(warnings, code); });
    if (!isSha256Hex(result.subjectId)) addCode(blockers, 'subjectId-invalid');
    if (!cleanString(result.lineageId)) addCode(blockers, 'lineageId-required');
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

  async function buildApplyEventReceipt(result, blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    var existing = safeObject(result.applyEvent || result.applyEventReceipt);
    var auditRow = result.applyAuditRow || (result.applyReceiptSource && result.applyReceiptSource.applyAuditRow);
    var applyEvent = null;
    if (Object.keys(existing).length) {
      applyEvent = existing;
    } else if (isObject(auditRow)) {
      if (!sync || typeof sync.buildFolderApplyEvent !== 'function') {
        addCode(blockers, 'applyEvent-builder-unavailable');
        return null;
      }
      try {
        applyEvent = safeObject(await sync.buildFolderApplyEvent({ applyAuditRow: auditRow }));
      } catch (_) {
        addCode(blockers, 'applyEvent-build-failed');
        return null;
      }
    } else {
      addCode(blockers, 'apply-receipt-source-unavailable');
      return null;
    }
    validateApplyEvent(
      applyEvent,
      cleanString(result.subjectId).toLowerCase(),
      cleanString(result.lineageId),
      blockers,
      warnings
    );
    return applyEvent;
  }

  async function finalizeConvergenceAction(input) {
    var args = safeObject(input);
    var result = safeObject(args.convergenceResult || args.result);
    var blockers = [];
    var warnings = [];
    var sync = H2O.Desktop.Sync;

    if (!sync || typeof sync.recordConsumedOperation !== 'function') {
      addCode(blockers, 'consumed-operation-ledger-unavailable');
    }
    if (!sync || typeof sync.recordConvergenceWatermark !== 'function') {
      addCode(blockers, 'convergence-watermark-ledger-unavailable');
    }
    validateConvergenceResult(result, blockers, warnings);
    var inputForbidden = foreverNoKey(result);
    if (inputForbidden) {
      addCode(blockers, 'convergence-result-contains-forbidden-field');
      addCode(warnings, 'blocked-forbidden-key-' + inputForbidden);
    }

    var applyEvent = null;
    if (!blockers.length) {
      applyEvent = await buildApplyEventReceipt(result, blockers, warnings);
    }
    if (blockers.length) return failure(blockers, warnings, null, null, applyEvent);

    var subjectId = cleanString(result.subjectId || applyEvent.subjectId).toLowerCase();
    var lineageId = cleanString(result.lineageId || applyEvent.lineageId);
    var peerId = peerIdFromApplyEvent(applyEvent);
    var revisionHash = postStateHash(applyEvent);
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
      consumedAtIso: appliedAtIso(applyEvent),
      actorPeer: sourcePeerEnvelope(applyEvent),
      reason: 'local-color-convergence-finalized',
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
      watermarkAtIso: appliedAtIso(applyEvent)
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
    var outputForbidden = foreverNoKey(output);
    if (outputForbidden) {
      return failure(['convergence-bookkeeping-output-contains-forbidden-field'], ['blocked-forbidden-key-' + outputForbidden], consumedRow, watermarkRow, null);
    }
    return output;
  }

  H2O.Desktop.Sync.finalizeConvergenceAction = finalizeConvergenceAction;
  H2O.Desktop.Sync.__convergenceBookkeepingInstalled = true;
  H2O.Desktop.Sync.__convergenceBookkeepingVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
