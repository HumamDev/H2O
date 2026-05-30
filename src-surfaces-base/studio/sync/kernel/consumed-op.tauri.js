/* H2O Desktop Sync Kernel - F14.2.6 consumed-operation primitive
 *
 * Desktop/Tauri L0 primitive only.
 *
 * Safety invariants:
 *   - Shapes and validates caller-supplied consumed-operation records only.
 *   - No storage reads/writes, pruning, retention ownership, publication,
 *     replay policy ownership, watermark, relay, WebDAV, polling, timers,
 *     apply, convergence, domain mutation, or mobile behavior.
 *   - Existing domain lanes are not wired to this module in F14.2.6, so their
 *     output remains unchanged.
 *
 * Public API:
 *   H2O.Desktop.Sync.kernel.shapeConsumedOperation(input)
 *   H2O.Desktop.Sync.kernel.validateConsumedOperation(input)
 *   H2O.Desktop.Sync.kernel.shapeOriginTag(input)
 *   H2O.Desktop.Sync.kernel.validateOriginTag(input)
 *   H2O.Desktop.Sync.kernel.findConsumedOperation(rows, candidate)
 *   H2O.Desktop.Sync.kernel.hasConsumedOperation(rows, candidate)
 *   H2O.Desktop.Sync.kernel.validateReplayCandidate(input)
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
  H2O.Desktop.Sync.kernel = H2O.Desktop.Sync.kernel || {};

  var kernel = H2O.Desktop.Sync.kernel;
  if (kernel.__consumedOpInstalled) return;

  var VERSION = '0.1.0-f14.2.6';
  var RESULT_SCHEMA = 'h2o.desktop.sync.kernel.consumed-operation-validation.v1';
  var ROW_SCHEMA = 'h2o.desktop.sync.consumed-operation-ledger-row.v1';
  var ORIGIN_SCHEMA = 'h2o.desktop.sync.kernel.origin-tag.v1';
  var SHA256_RE = /^[0-9a-f]{64}$/;

  var CONSUMED_STATUSES = [
    'consumed',
    'ignored',
    'blocked',
    'duplicate',
    'replay',
    'expired',
    'superseded'
  ];

  var ENVELOPE_KINDS = [
    'evidence',
    'preview',
    'proposal',
    'conflictCandidate',
    'applyEvent'
  ];

  var ORIGIN_KINDS = [
    'local',
    'remote',
    'relay',
    'proposal',
    'conflictCandidate',
    'applyEvent',
    'operator',
    'unknown'
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
    }).filter(Boolean).filter(function (code, index, arr) {
      return arr.indexOf(code) === index;
    });
  }

  function isSha256Hex(value) {
    return SHA256_RE.test(cleanString(value));
  }

  function isIso(value) {
    var text = cleanString(value);
    return !!text && Number.isFinite(Date.parse(text));
  }

  function validIsoOrEmpty(value) {
    var text = cleanString(value);
    return !text || Number.isFinite(Date.parse(text));
  }

  function normalizeActorPeer(actorPeer) {
    var peer = safeObject(actorPeer);
    return {
      physicalDeviceIdHash: cleanString(peer.physicalDeviceIdHash).toLowerCase(),
      installIdHash: cleanString(peer.installIdHash).toLowerCase(),
      syncPeerIdHash: cleanString(peer.syncPeerIdHash).toLowerCase(),
      surfaceKind: cleanString(peer.surfaceKind)
    };
  }

  function validActorPeer(actorPeer) {
    var peer = normalizeActorPeer(actorPeer);
    return isSha256Hex(peer.physicalDeviceIdHash) &&
      isSha256Hex(peer.installIdHash) &&
      isSha256Hex(peer.syncPeerIdHash);
  }

  function normalizeValidationSummary(value) {
    var summary = safeObject(value);
    return {
      ok: summary.ok === true,
      checkedAtIso: cleanString(summary.checkedAtIso),
      blockers: codeList(summary.blockers),
      warnings: codeList(summary.warnings)
    };
  }

  function shapeOriginTag(input) {
    var source = safeObject(input);
    var originKind = cleanString(source.originKind || source.kind || 'unknown');
    if (ORIGIN_KINDS.indexOf(originKind) === -1) originKind = 'unknown';
    return {
      schema: ORIGIN_SCHEMA,
      originKind: originKind,
      sourcePeerId: cleanString(source.sourcePeerId).toLowerCase(),
      sourcePlatform: cleanString(source.sourcePlatform),
      envelopeKind: cleanString(source.envelopeKind),
      operationKind: cleanString(source.operationKind),
      lineageId: cleanString(source.lineageId),
      eventDigest: cleanString(source.eventDigest).toLowerCase(),
      dedupeKey: cleanString(source.dedupeKey).toLowerCase()
    };
  }

  function validateOriginTag(input) {
    var tag = shapeOriginTag(input);
    var blockers = [];
    var warnings = [];
    if (tag.originKind === 'unknown') addCode(warnings, 'origin-kind-unknown');
    if (tag.sourcePeerId && !isSha256Hex(tag.sourcePeerId)) addCode(blockers, 'origin-sourcePeerId-invalid');
    if (tag.eventDigest && !isSha256Hex(tag.eventDigest)) addCode(blockers, 'origin-eventDigest-invalid');
    if (tag.dedupeKey && !isSha256Hex(tag.dedupeKey)) addCode(blockers, 'origin-dedupeKey-invalid');
    if (tag.envelopeKind && ENVELOPE_KINDS.indexOf(tag.envelopeKind) === -1) {
      addCode(blockers, 'origin-envelope-kind-invalid');
    }
    return result(blockers, warnings, null, tag, {
      originTag: tag
    });
  }

  function shapeConsumedOperation(input) {
    var row = safeObject(input);
    return {
      schema: ROW_SCHEMA,
      consumedId: cleanString(row.consumedId),
      eventDigest: cleanString(row.eventDigest).toLowerCase(),
      dedupeKey: cleanString(row.dedupeKey).toLowerCase(),
      lineageId: cleanString(row.lineageId),
      subjectId: cleanString(row.subjectId).toLowerCase(),
      sourcePeerId: cleanString(row.sourcePeerId).toLowerCase(),
      envelopeKind: cleanString(row.envelopeKind),
      operationKind: cleanString(row.operationKind),
      consumedStatus: cleanString(row.consumedStatus || row.status),
      consumedAtIso: cleanString(row.consumedAtIso),
      actorPeer: normalizeActorPeer(row.actorPeer),
      originTag: shapeOriginTag(row.originTag || row.origin || row),
      reason: cleanString(row.reason),
      validationSummary: normalizeValidationSummary(row.validationSummary)
    };
  }

  function result(blockers, warnings, consumedOperation, originTag, extra) {
    var out = {
      schema: RESULT_SCHEMA,
      ok: blockers.length === 0,
      valid: blockers.length === 0,
      consumedOperation: consumedOperation || null,
      originTag: originTag || null,
      blockers: codeList(blockers),
      warnings: codeList(warnings)
    };
    if (isObject(extra)) {
      Object.keys(extra).forEach(function (key) {
        out[key] = extra[key];
      });
    }
    return out;
  }

  function validateConsumedOperation(input) {
    var row = shapeConsumedOperation(input);
    var blockers = [];
    var warnings = [];

    if (!isSha256Hex(row.eventDigest)) addCode(blockers, 'consumed-eventDigest-invalid');
    if (!isSha256Hex(row.dedupeKey)) addCode(blockers, 'consumed-dedupeKey-invalid');
    if (row.lineageId && row.lineageId.length > 160) addCode(blockers, 'consumed-lineageId-invalid');
    if (row.subjectId && !isSha256Hex(row.subjectId)) addCode(blockers, 'consumed-subjectId-invalid');
    if (row.sourcePeerId && !isSha256Hex(row.sourcePeerId)) addCode(blockers, 'consumed-sourcePeerId-invalid');
    if (ENVELOPE_KINDS.indexOf(row.envelopeKind) === -1) addCode(blockers, 'consumed-envelope-kind-invalid');
    if (!row.operationKind) addCode(blockers, 'consumed-operationKind-required');
    if (CONSUMED_STATUSES.indexOf(row.consumedStatus) === -1) addCode(blockers, 'consumed-status-invalid');
    if (!isIso(row.consumedAtIso)) addCode(blockers, 'consumed-consumedAtIso-invalid');
    if (!validActorPeer(row.actorPeer)) addCode(blockers, 'consumed-actor-peer-invalid');
    if (row.reason.length > 240) addCode(blockers, 'consumed-reason-too-long');
    if (!validIsoOrEmpty(row.validationSummary.checkedAtIso)) {
      addCode(blockers, 'consumed-validationSummary-checkedAtIso-invalid');
    }

    var origin = validateOriginTag(row.originTag);
    codeList(origin.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(origin.warnings).forEach(function (code) { addCode(warnings, code); });

    return result(blockers, warnings, row, row.originTag);
  }

  function matchesCandidate(row, candidate) {
    var r = shapeConsumedOperation(row);
    var c = shapeConsumedOperation(candidate);
    if (c.eventDigest && c.dedupeKey) {
      return r.eventDigest === c.eventDigest && r.dedupeKey === c.dedupeKey;
    }
    if (c.eventDigest) return r.eventDigest === c.eventDigest;
    if (c.dedupeKey) return r.dedupeKey === c.dedupeKey;
    if (c.lineageId && c.subjectId && c.operationKind) {
      return r.lineageId === c.lineageId &&
        r.subjectId === c.subjectId &&
        r.operationKind === c.operationKind;
    }
    return false;
  }

  function findConsumedOperation(rows, candidate) {
    var list = asArray(rows);
    for (var i = 0; i < list.length; i++) {
      if (matchesCandidate(list[i], candidate)) return shapeConsumedOperation(list[i]);
    }
    return null;
  }

  function hasConsumedOperation(rows, candidate) {
    return !!findConsumedOperation(rows, candidate);
  }

  function statusBlocksReplay(status) {
    return [
      'consumed',
      'duplicate',
      'replay',
      'expired',
      'superseded'
    ].indexOf(cleanString(status)) !== -1;
  }

  function validateReplayCandidate(input) {
    var args = safeObject(input);
    var rows = asArray(args.rows);
    var candidate = shapeConsumedOperation(args.candidate || args.consumedOperation || args);
    var blockers = [];
    var warnings = [];
    var validation = validateConsumedOperation(candidate);
    var existing = findConsumedOperation(rows, candidate);
    var replaySafe = true;

    codeList(validation.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(validation.warnings).forEach(function (code) { addCode(warnings, code); });

    if (existing && statusBlocksReplay(existing.consumedStatus)) {
      replaySafe = false;
      addCode(blockers, 'consumed-operation-already-processed');
    } else if (existing) {
      replaySafe = false;
      addCode(warnings, 'consumed-operation-existing-nonterminal-status');
    }

    return result(blockers, warnings, candidate, candidate.originTag, {
      replaySafe: replaySafe && blockers.length === 0,
      existingConsumedOperation: existing,
      matchFound: !!existing
    });
  }

  function assistConsumedSafe(input) {
    var replay = validateReplayCandidate(input);
    return {
      schema: RESULT_SCHEMA,
      ok: replay.ok === true,
      valid: replay.valid === true,
      consumedSafe: replay.replaySafe === true,
      consumedOperation: replay.consumedOperation,
      existingConsumedOperation: replay.existingConsumedOperation,
      blockers: replay.blockers,
      warnings: replay.warnings
    };
  }

  kernel.shapeConsumedOperation = shapeConsumedOperation;
  kernel.validateConsumedOperation = validateConsumedOperation;
  kernel.shapeOriginTag = shapeOriginTag;
  kernel.validateOriginTag = validateOriginTag;
  kernel.findConsumedOperation = findConsumedOperation;
  kernel.hasConsumedOperation = hasConsumedOperation;
  kernel.validateReplayCandidate = validateReplayCandidate;
  kernel.assistConsumedSafe = assistConsumedSafe;
  kernel.CONSUMED_OPERATION_STATUSES = CONSUMED_STATUSES.slice();
  kernel.__consumedOpInstalled = true;
  kernel.__consumedOpVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : window);
