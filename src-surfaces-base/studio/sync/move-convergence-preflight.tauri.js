/* H2O Desktop Sync - F11.0.2 move convergence preflight
 *
 * Desktop/Tauri-only read-only preflight for a selected move/reparent
 * convergence candidate.
 *
 * Safety invariants:
 *   - Diagnostics only. No move, apply, convergence action, publication,
 *     enqueue, upload/download, WebDAV, timers, polling, or mobile write-back.
 *   - Calls the F11.0.1 materialization diagnostic first, then layers replay,
 *     consumed-operation, and watermark checks over the same planner entry.
 *   - Output is redacted booleans/codes only. It never returns raw folder IDs,
 *     parent IDs, names, chat IDs, paths, URLs, tokens, or content.
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
  if (H2O.Desktop.Sync.__moveConvergencePreflightInstalled) return;

  var SCHEMA = 'h2o.desktop.sync.move-convergence-preflight.v1';
  var VERSION = '0.1.0-f11.0.2';
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

  function entryFromInput(input) {
    var args = safeObject(input);
    return safeObject(args.plannerEntry || args.entry || args.candidate);
  }

  function entrySubject(entry) {
    return cleanString(entry.subjectId).toLowerCase();
  }

  function entryEventDigest(entry) {
    return cleanString(entry.eventDigest).toLowerCase();
  }

  function entryDedupeKey(entry) {
    return cleanString(entry.dedupeKey || entry.eventDigest).toLowerCase();
  }

  function entrySourcePeerId(entry) {
    return cleanString(entry.sourcePeerId ||
      safeObject(safeObject(entry.sourcePlatform).sourcePeerEnvelope).syncPeerIdHash).toLowerCase();
  }

  function entryTargetHash(entry) {
    return cleanString(entry.remoteRevisionHash || entry.targetHash || entry.revisionHash).toLowerCase();
  }

  function baseResult() {
    return {
      schema: SCHEMA,
      ok: false,
      actionable: false,
      subjectResolved: false,
      parentResolved: false,
      parentStable: false,
      orphanSafe: false,
      cycleSafe: false,
      depthSafe: false,
      duplicateSiblingSafe: false,
      watermarkSafe: false,
      replaySafe: false,
      consumedSafe: false,
      blockers: [],
      warnings: []
    };
  }

  function resultFrom(flags, blockers, warnings) {
    var out = baseResult();
    Object.keys(safeObject(flags)).forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(out, key)) out[key] = flags[key];
    });
    out.blockers = codeList(blockers);
    out.warnings = codeList(warnings);
    out.ok = out.blockers.length === 0;
    out.actionable = out.ok === true &&
      out.subjectResolved === true &&
      out.parentResolved === true &&
      out.parentStable === true &&
      out.orphanSafe === true &&
      out.cycleSafe === true &&
      out.depthSafe === true &&
      out.duplicateSiblingSafe === true &&
      out.watermarkSafe === true &&
      out.replaySafe === true &&
      out.consumedSafe === true;
    var forbidden = foreverNoKey(out);
    if (forbidden) {
      out.ok = false;
      out.actionable = false;
      addCode(out.blockers, 'move-preflight-output-contains-forbidden-field');
      addCode(out.warnings, 'blocked-forbidden-key-' + forbidden);
    }
    return out;
  }

  async function relayIndexSafe(entry, blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.listRelayIndex !== 'function') {
      addCode(blockers, 'relay-index-unavailable');
      return false;
    }
    var index;
    try {
      index = safeObject(await sync.listRelayIndex());
    } catch (_) {
      addCode(blockers, 'relay-index-read-failed');
      return false;
    }
    codeList(index.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(index.warnings).forEach(function (code) { addCode(warnings, code); });
    var eventDigest = entryEventDigest(entry);
    var dedupeKey = entryDedupeKey(entry);
    var safe = true;
    asArray(index.entries).forEach(function (item) {
      var row = safeObject(item);
      var eventMatch = eventDigest && cleanString(row.eventDigest).toLowerCase() === eventDigest;
      var dedupeMatch = dedupeKey && cleanString(row.dedupeKey).toLowerCase() === dedupeKey;
      if (!eventMatch && !dedupeMatch) return;
      if (row.replayAttempt === true) { safe = false; addCode(blockers, 'replay-detected'); }
      if (row.stale === true) { safe = false; addCode(blockers, 'stale-evidence-not-revalidated'); }
      if (row.expired === true) { safe = false; addCode(blockers, 'envelope-expired'); }
    });
    asArray(index.replays).forEach(function (replay) {
      if (dedupeKey && cleanString(safeObject(replay).dedupeKey).toLowerCase() === dedupeKey) {
        safe = false;
        addCode(blockers, 'replay-dedupe-key');
      }
    });
    return safe && !codeList(index.blockers).length;
  }

  async function consumedLedgerSafe(entry, blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.listConsumedOperations !== 'function') {
      addCode(blockers, 'consumed-operation-ledger-unavailable');
      return false;
    }
    var ledger;
    try {
      ledger = safeObject(await sync.listConsumedOperations());
    } catch (_) {
      addCode(blockers, 'consumed-operation-ledger-read-failed');
      return false;
    }
    codeList(ledger.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(ledger.warnings).forEach(function (code) { addCode(warnings, code); });
    var eventDigest = entryEventDigest(entry);
    var dedupeKey = entryDedupeKey(entry);
    var safe = true;
    asArray(ledger.rows).forEach(function (rowValue) {
      var row = safeObject(rowValue);
      var eventMatch = eventDigest && cleanString(row.eventDigest).toLowerCase() === eventDigest;
      var dedupeMatch = dedupeKey && cleanString(row.dedupeKey).toLowerCase() === dedupeKey;
      if (!eventMatch && !dedupeMatch) return;
      safe = false;
      addCode(blockers, 'consumed-operation-present');
      var status = cleanString(row.consumedStatus);
      if (status) addCode(warnings, 'consumed-status-' + status);
    });
    return safe && !codeList(ledger.blockers).length;
  }

  async function watermarkLedgerSafe(entry, blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.getConvergenceWatermarks !== 'function') {
      addCode(blockers, 'convergence-watermark-ledger-unavailable');
      return false;
    }
    var watermarks;
    try {
      watermarks = safeObject(await sync.getConvergenceWatermarks());
    } catch (_) {
      addCode(blockers, 'convergence-watermark-ledger-read-failed');
      return false;
    }
    codeList(watermarks.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(watermarks.warnings).forEach(function (code) { addCode(warnings, code); });
    var peerId = entrySourcePeerId(entry);
    var subjectId = entrySubject(entry);
    var targetHash = entryTargetHash(entry);
    var key = peerId + ':' + subjectId;
    var latest = safeObject(safeObject(watermarks.latestByPeerSubject)[key]);
    if (latest && targetHash && cleanString(latest.revisionHash).toLowerCase() === targetHash) {
      addCode(blockers, 'target-already-watermarked');
      return false;
    }
    return !codeList(watermarks.blockers).length;
  }

  async function runMoveConvergencePreflight(input) {
    var args = safeObject(input);
    var entry = entryFromInput(args);
    var sync = H2O.Desktop.Sync;
    var blockers = [];
    var warnings = [];
    var flags = {
      subjectResolved: false,
      parentResolved: false,
      parentStable: false,
      orphanSafe: false,
      cycleSafe: false,
      depthSafe: false,
      duplicateSiblingSafe: false,
      watermarkSafe: false,
      replaySafe: false,
      consumedSafe: false
    };

    var forbiddenInput = foreverNoKey(entry);
    if (forbiddenInput) {
      addCode(blockers, 'move-entry-contains-forbidden-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbiddenInput);
    }

    if (!sync || typeof sync.checkMoveMaterialization !== 'function') {
      addCode(blockers, 'move-materialization-diagnostic-unavailable');
      return resultFrom(flags, blockers, warnings);
    }

    var materialization = null;
    try {
      materialization = safeObject(await sync.checkMoveMaterialization({ plannerEntry: entry }));
    } catch (_) {
      addCode(blockers, 'move-materialization-diagnostic-failed');
      return resultFrom(flags, blockers, warnings);
    }

    codeList(materialization.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(materialization.warnings).forEach(function (code) { addCode(warnings, code); });

    flags.subjectResolved = materialization.subjectResolved === true;
    flags.parentResolved = materialization.parentResolved === true;
    flags.parentStable = materialization.parentStable === true;
    flags.orphanSafe = materialization.orphanSafe === true;
    flags.cycleSafe = materialization.cycleSafe === true;
    flags.depthSafe = materialization.depthSafe === true;
    flags.duplicateSiblingSafe = materialization.duplicateSiblingSafe === true;

    if (materialization.ok !== true) addCode(blockers, 'move-materialization-not-ready');
    if (!flags.subjectResolved) addCode(blockers, 'subject-not-resolved');
    if (!flags.parentResolved) addCode(blockers, 'target-parent-not-resolved');
    if (!flags.parentStable) addCode(blockers, 'parent-not-stable');
    if (!flags.orphanSafe) addCode(blockers, 'orphan-risk');
    if (!flags.cycleSafe) addCode(blockers, 'cycle-risk');
    if (!flags.depthSafe) addCode(blockers, 'tree-depth-limit-exceeded');
    if (!flags.duplicateSiblingSafe) addCode(blockers, 'duplicate-folder-name');

    flags.replaySafe = await relayIndexSafe(entry, blockers, warnings);
    flags.consumedSafe = await consumedLedgerSafe(entry, blockers, warnings);
    flags.watermarkSafe = await watermarkLedgerSafe(entry, blockers, warnings);

    if (!flags.replaySafe) addCode(blockers, 'replay-not-safe');
    if (!flags.consumedSafe) addCode(blockers, 'consumed-operation-not-safe');
    if (!flags.watermarkSafe) addCode(blockers, 'watermark-not-safe');

    return resultFrom(flags, blockers, warnings);
  }

  H2O.Desktop.Sync.runMoveConvergencePreflight = runMoveConvergencePreflight;
  H2O.Desktop.Sync.__moveConvergencePreflightInstalled = true;
  H2O.Desktop.Sync.__moveConvergencePreflightVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
