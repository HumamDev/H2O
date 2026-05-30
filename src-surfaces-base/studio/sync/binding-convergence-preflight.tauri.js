/* H2O Desktop Sync - F13.0.3 binding convergence preflight
 *
 * Desktop/Tauri-only read-only preflight for a selected folder binding
 * convergence candidate.
 *
 * Safety invariants:
 *   - Diagnostics only. No binding, apply, convergence action, publication,
 *     enqueue, upload/download, WebDAV, timers, polling, or mobile write-back.
 *   - Calls the F13.0.2 binding materialization diagnostic first, then layers
 *     watermark, replay, and consumed-operation checks over the binding subject.
 *   - Output is redacted booleans/codes only. It never returns raw chat IDs,
 *     folder IDs, names, paths, URLs, tokens, or content.
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
  if (H2O.Desktop.Sync.__bindingConvergencePreflightInstalled) return;

  var SCHEMA = 'h2o.desktop.sync.binding-convergence-preflight.v1';
  var VERSION = '0.1.0-f13.0.3';
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

  function cleanLower(value) {
    return cleanString(value).toLowerCase();
  }

  function isSha256Hex(value) {
    return /^[0-9a-f]{64}$/.test(cleanLower(value));
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

  function baseResult() {
    return {
      schema: SCHEMA,
      ok: false,
      actionable: false,
      bindingSubjectId: '',
      chatResolved: false,
      folderResolved: false,
      duplicateBinding: false,
      cardinalitySatisfied: false,
      tombstoneSafe: false,
      orphanSafe: false,
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
      out.chatResolved === true &&
      out.folderResolved === true &&
      out.duplicateBinding === false &&
      out.cardinalitySatisfied === true &&
      out.tombstoneSafe === true &&
      out.orphanSafe === true &&
      out.watermarkSafe === true &&
      out.replaySafe === true &&
      out.consumedSafe === true;
    var forbidden = foreverNoKey(out);
    if (forbidden) {
      out.ok = false;
      out.actionable = false;
      addCode(out.blockers, 'binding-preflight-output-contains-forbidden-field');
      addCode(out.warnings, 'blocked-forbidden-key-' + forbidden);
    }
    return out;
  }

  async function runMaterialization(args, flags, blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.checkBindingMaterialization !== 'function') {
      addCode(blockers, 'binding-materialization-diagnostic-unavailable');
      return null;
    }
    var materialization;
    try {
      materialization = safeObject(await sync.checkBindingMaterialization(args));
    } catch (_) {
      addCode(blockers, 'binding-materialization-diagnostic-failed');
      return null;
    }
    codeList(materialization.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(materialization.warnings).forEach(function (code) { addCode(warnings, code); });
    flags.bindingSubjectId = isSha256Hex(materialization.bindingSubjectId)
      ? cleanLower(materialization.bindingSubjectId)
      : '';
    flags.chatResolved = materialization.chatResolved === true;
    flags.folderResolved = materialization.folderResolved === true;
    flags.duplicateBinding = materialization.duplicateBinding === true;
    flags.cardinalitySatisfied = materialization.cardinalitySatisfied === true;
    flags.tombstoneSafe = materialization.tombstoneSafe === true;
    flags.orphanSafe = materialization.orphanSafe === true;

    if (materialization.ok !== true) addCode(blockers, 'binding-materialization-not-ready');
    if (!flags.chatResolved) addCode(blockers, 'chat-not-resolved');
    if (!flags.folderResolved) addCode(blockers, 'folder-not-resolved');
    if (flags.duplicateBinding) addCode(blockers, 'duplicate-folder-binding');
    if (!flags.cardinalitySatisfied) addCode(blockers, 'binding-cardinality-violation');
    if (!flags.tombstoneSafe) addCode(blockers, 'binding-tombstone-not-safe');
    if (!flags.orphanSafe) addCode(blockers, 'binding-would-be-orphaned');
    if (!flags.bindingSubjectId) addCode(blockers, 'binding-subject-id-unavailable');
    return materialization;
  }

  async function replaySafeForBinding(blockers, warnings) {
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
    var replayCount = Number(safeObject(index.counts).replayAttempts) || 0;
    if (replayCount > 0 || asArray(index.replays).length > 0) {
      addCode(blockers, 'replay-detected');
      return false;
    }
    return index.ok === true && codeList(index.blockers).length === 0;
  }

  async function consumedSafeForBinding(subjectId, blockers, warnings) {
    if (!isSha256Hex(subjectId)) {
      addCode(blockers, 'binding-subject-id-unavailable');
      return false;
    }
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
    var safe = true;
    var target = cleanLower(subjectId);
    asArray(ledger.rows).forEach(function (rowValue) {
      var row = safeObject(rowValue);
      if (!target || cleanLower(row.subjectId) !== target) return;
      safe = false;
      addCode(blockers, 'consumed-operation-present');
      var status = cleanString(row.consumedStatus);
      if (status) addCode(warnings, 'consumed-status-' + status);
    });
    return safe && ledger.ok === true && codeList(ledger.blockers).length === 0;
  }

  async function watermarkSafeForBinding(subjectId, blockers, warnings) {
    if (!isSha256Hex(subjectId)) {
      addCode(blockers, 'binding-subject-id-unavailable');
      return false;
    }
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
    var target = cleanLower(subjectId);
    var safe = true;
    asArray(watermarks.rows).forEach(function (rowValue) {
      var row = safeObject(rowValue);
      if (!target || cleanLower(row.subjectId) !== target) return;
      safe = false;
      addCode(blockers, 'binding-subject-already-watermarked');
    });
    return safe && watermarks.ok === true && codeList(watermarks.blockers).length === 0;
  }

  async function runBindingConvergencePreflight(input) {
    var args = safeObject(input);
    var blockers = [];
    var warnings = [];
    var flags = {
      bindingSubjectId: '',
      chatResolved: false,
      folderResolved: false,
      duplicateBinding: false,
      cardinalitySatisfied: false,
      tombstoneSafe: false,
      orphanSafe: false,
      watermarkSafe: false,
      replaySafe: false,
      consumedSafe: false
    };

    var forbiddenInput = foreverNoKey(args);
    if (forbiddenInput) {
      addCode(blockers, 'binding-preflight-input-contains-forbidden-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbiddenInput);
    }
    if (!isSha256Hex(args.chatSubjectId)) addCode(blockers, 'invalid-chat-subject-id');
    if (!isSha256Hex(args.folderSubjectId)) addCode(blockers, 'invalid-folder-subject-id');

    await runMaterialization(args, flags, blockers, warnings);

    flags.replaySafe = await replaySafeForBinding(blockers, warnings);
    flags.consumedSafe = await consumedSafeForBinding(flags.bindingSubjectId, blockers, warnings);
    flags.watermarkSafe = await watermarkSafeForBinding(flags.bindingSubjectId, blockers, warnings);

    if (!flags.replaySafe) addCode(blockers, 'replay-not-safe');
    if (!flags.consumedSafe) addCode(blockers, 'consumed-operation-not-safe');
    if (!flags.watermarkSafe) addCode(blockers, 'watermark-not-safe');

    return resultFrom(flags, blockers, warnings);
  }

  H2O.Desktop.Sync.runBindingConvergencePreflight = runBindingConvergencePreflight;
  H2O.Desktop.Sync.__bindingConvergencePreflightInstalled = true;
  H2O.Desktop.Sync.__bindingConvergencePreflightVersion = VERSION;
})(typeof window !== 'undefined' ? window : globalThis);
