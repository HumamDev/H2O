/* H2O Desktop Sync Kernel - F14.2.5 watermark monotonicity service
 *
 * Desktop/Tauri L0 primitive only.
 *
 * Safety invariants:
 *   - Validates caller-supplied watermark state only.
 *   - No storage reads/writes, domain state reads, publication, replay, relay,
 *     WebDAV, polling, timers, apply, convergence, or mobile behavior.
 *   - Existing domain lanes are not wired to this module in F14.2.5, so their
 *     output remains unchanged.
 *
 * Public API:
 *   H2O.Desktop.Sync.kernel.shapeWatermark(value)
 *   H2O.Desktop.Sync.kernel.compareWatermarks(current, proposed)
 *   H2O.Desktop.Sync.kernel.validateWatermarkValue(value, role?)
 *   H2O.Desktop.Sync.kernel.validateWatermarkMonotonicity(input)
 *   H2O.Desktop.Sync.kernel.validateWatermarkAdvance(input)
 *   H2O.Desktop.Sync.kernel.shapeWatermarkState(input)
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
  if (kernel.__watermarkServiceInstalled) return;

  var VERSION = '0.1.0-f14.2.5';
  var RESULT_SCHEMA = 'h2o.desktop.sync.kernel.watermark-validation.v1';
  var WATERMARK_SCHEMA = 'h2o.desktop.sync.kernel.watermark-state.v1';
  var SHA256_RE = /^[0-9a-f]{64}$/;
  var STATE_HASH_RE = /^([0-9a-f]{8}|[0-9a-f]{64})$/;

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

  function isStateHash(value) {
    return STATE_HASH_RE.test(cleanString(value));
  }

  function isIso(value) {
    var text = cleanString(value);
    return !!text && Number.isFinite(Date.parse(text));
  }

  function timestampMs(value) {
    var text = cleanString(value);
    var ms = Date.parse(text);
    return Number.isFinite(ms) ? ms : NaN;
  }

  function shapeWatermark(value) {
    var row = safeObject(value);
    return {
      schema: WATERMARK_SCHEMA,
      watermarkId: cleanString(row.watermarkId),
      peerId: cleanString(row.peerId).toLowerCase(),
      subjectId: cleanString(row.subjectId).toLowerCase(),
      lineageId: cleanString(row.lineageId),
      revisionHash: cleanString(row.revisionHash).toLowerCase(),
      watermarkAtIso: cleanString(row.watermarkAtIso),
      recordedAtIso: cleanString(row.recordedAtIso),
      dedupeKey: cleanString(row.dedupeKey).toLowerCase()
    };
  }

  function isEmptyWatermark(value) {
    var row = shapeWatermark(value);
    return !row.peerId &&
      !row.subjectId &&
      !row.lineageId &&
      !row.revisionHash &&
      !row.watermarkAtIso;
  }

  function validateWatermarkValue(value, role) {
    var watermark = shapeWatermark(value);
    var blockers = [];
    var warnings = [];
    var label = cleanString(role) || 'watermark';

    if (isEmptyWatermark(watermark)) {
      addCode(blockers, label + '-missing');
    }
    if (!isSha256Hex(watermark.peerId)) addCode(blockers, label + '-peerId-invalid');
    if (!isSha256Hex(watermark.subjectId)) addCode(blockers, label + '-subjectId-invalid');
    if (!watermark.lineageId) addCode(blockers, label + '-lineageId-missing');
    if (!isStateHash(watermark.revisionHash)) addCode(blockers, label + '-revisionHash-invalid');
    if (!isIso(watermark.watermarkAtIso)) addCode(blockers, label + '-watermarkAtIso-invalid');
    if (watermark.dedupeKey && !isSha256Hex(watermark.dedupeKey)) {
      addCode(blockers, label + '-dedupeKey-invalid');
    }
    if (watermark.recordedAtIso && !isIso(watermark.recordedAtIso)) {
      addCode(warnings, label + '-recordedAtIso-invalid');
    }

    return {
      schema: RESULT_SCHEMA,
      ok: blockers.length === 0,
      valid: blockers.length === 0,
      currentWatermark: role === 'current' ? watermark : null,
      proposedWatermark: role === 'proposed' ? watermark : null,
      watermark: watermark,
      blockers: blockers,
      warnings: warnings
    };
  }

  function compareWatermarks(current, proposed) {
    var c = shapeWatermark(current);
    var p = shapeWatermark(proposed);
    var currentTime = timestampMs(c.watermarkAtIso);
    var proposedTime = timestampMs(p.watermarkAtIso);
    var direction = 'unknown';
    var comparison = 0;

    if (!Number.isFinite(currentTime) || !Number.isFinite(proposedTime)) {
      direction = 'invalid';
      comparison = 0;
    } else if (proposedTime > currentTime) {
      direction = 'forward';
      comparison = 1;
    } else if (proposedTime < currentTime) {
      direction = 'regression';
      comparison = -1;
    } else if (p.revisionHash === c.revisionHash && p.lineageId === c.lineageId) {
      direction = 'equal';
      comparison = 0;
    } else {
      direction = 'equal-conflict';
      comparison = 0;
    }

    return {
      schema: 'h2o.desktop.sync.kernel.watermark-comparison.v1',
      comparison: comparison,
      direction: direction,
      currentWatermark: c,
      proposedWatermark: p,
      peerMatched: c.peerId === p.peerId,
      subjectMatched: c.subjectId === p.subjectId,
      lineageMatched: c.lineageId === p.lineageId,
      revisionMatched: c.revisionHash === p.revisionHash
    };
  }

  function baseResult(current, proposed, blockers, warnings, comparison, metadata) {
    return {
      schema: RESULT_SCHEMA,
      ok: blockers.length === 0,
      valid: blockers.length === 0,
      currentWatermark: current,
      proposedWatermark: proposed,
      comparison: comparison || null,
      metadata: metadata || {},
      blockers: codeList(blockers),
      warnings: codeList(warnings)
    };
  }

  function validateWatermarkMonotonicity(input) {
    var args = safeObject(input);
    var blockers = [];
    var warnings = [];
    var requireAdvance = args.requireAdvance === true;
    var allowIdempotent = args.allowIdempotent !== false;
    var current = shapeWatermark(args.currentWatermark || args.current);
    var proposed = shapeWatermark(args.proposedWatermark || args.proposed);
    var currentMissing = isEmptyWatermark(current);
    var proposedValidation = validateWatermarkValue(proposed, 'proposed');
    var currentValidation = currentMissing
      ? { blockers: [], warnings: [] }
      : validateWatermarkValue(current, 'current');

    codeList(currentValidation.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(currentValidation.warnings).forEach(function (code) { addCode(warnings, code); });
    codeList(proposedValidation.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(proposedValidation.warnings).forEach(function (code) { addCode(warnings, code); });

    if (blockers.length) {
      return baseResult(currentMissing ? null : current, proposed, blockers, warnings, null, {
        requireAdvance: requireAdvance,
        allowIdempotent: allowIdempotent,
        currentMissing: currentMissing
      });
    }

    if (currentMissing) {
      return baseResult(null, proposed, blockers, warnings, {
        direction: 'initial',
        comparison: 1,
        peerMatched: true,
        subjectMatched: true,
        lineageMatched: true,
        revisionMatched: false
      }, {
        requireAdvance: requireAdvance,
        allowIdempotent: allowIdempotent,
        currentMissing: true
      });
    }

    var comparison = compareWatermarks(current, proposed);
    if (!comparison.peerMatched) addCode(blockers, 'watermark-peer-scope-mismatch');
    if (!comparison.subjectMatched) addCode(blockers, 'watermark-subject-scope-mismatch');
    if (comparison.direction === 'invalid') addCode(blockers, 'watermark-comparison-invalid');
    if (comparison.direction === 'regression') addCode(blockers, 'watermark-regression');
    if (comparison.direction === 'equal-conflict') addCode(blockers, 'watermark-equal-conflict');
    if (comparison.direction === 'equal' && requireAdvance) addCode(blockers, 'watermark-not-forward');
    if (comparison.direction === 'equal' && !allowIdempotent) addCode(blockers, 'watermark-idempotent-not-allowed');
    if (!comparison.lineageMatched && comparison.direction === 'forward') {
      addCode(warnings, 'watermark-lineage-changed');
    }

    return baseResult(current, proposed, blockers, warnings, comparison, {
      requireAdvance: requireAdvance,
      allowIdempotent: allowIdempotent,
      currentMissing: false
    });
  }

  function validateWatermarkAdvance(input) {
    var args = Object.assign({}, safeObject(input), { requireAdvance: true });
    return validateWatermarkMonotonicity(args);
  }

  function shapeWatermarkState(input) {
    var args = safeObject(input);
    return validateWatermarkMonotonicity({
      currentWatermark: args.currentWatermark || args.current,
      proposedWatermark: args.proposedWatermark || args.proposed,
      requireAdvance: args.requireAdvance === true,
      allowIdempotent: args.allowIdempotent !== false
    });
  }

  kernel.shapeWatermark = shapeWatermark;
  kernel.compareWatermarks = compareWatermarks;
  kernel.validateWatermarkValue = validateWatermarkValue;
  kernel.validateWatermarkMonotonicity = validateWatermarkMonotonicity;
  kernel.validateWatermarkAdvance = validateWatermarkAdvance;
  kernel.shapeWatermarkState = shapeWatermarkState;
  kernel.__watermarkServiceInstalled = true;
  kernel.__watermarkServiceVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : window);
