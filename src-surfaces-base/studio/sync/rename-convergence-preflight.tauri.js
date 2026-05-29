/* H2O Desktop Sync - F10.9.2 rename convergence preflight
 *
 * Desktop/Tauri-only read-only preflight for a selected rename convergence
 * candidate.
 *
 * Safety invariants:
 *   - Diagnostics only. No rename, apply, convergence action, publication,
 *     enqueue, upload/download, WebDAV, timers, polling, or mobile write-back.
 *   - proposedName is local input only and is passed only to the F10.9.1
 *     materialization diagnostic. This module never returns, persists,
 *     enqueues, uploads, or logs the cleartext name.
 *   - Output is redacted booleans/codes and hashes from materialization only.
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
  if (H2O.Desktop.Sync.__renameConvergencePreflightInstalled) return;

  var SCHEMA = 'h2o.desktop.sync.rename-convergence-preflight.v1';
  var VERSION = '0.1.0-f10.9.2';
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'attachments',
    'name', 'title', 'folderName', 'chatTitle', 'rawId', 'chatId',
    'folderId', 'targetFolderId', 'path', 'url', 'password', 'apiKey',
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

  function changedFields(entry) {
    return asArray(entry.changedFields).map(cleanString).filter(Boolean).sort();
  }

  function entryFromInput(input) {
    var args = safeObject(input);
    return safeObject(args.plannerEntry || args.entry || args.candidate);
  }

  function collectReasonCodes(entry) {
    var row = safeObject(entry);
    var values = [];
    [
      row.reason,
      row.divergenceReason,
      row.conflictKind,
      row.suggestedAction,
      row.bucket,
      row.sourceBucket,
      row.deletedState,
      row.remoteDeletedState,
      row.localDeletedState
    ].forEach(function (value) {
      var text = cleanString(value);
      if (text) values.push(text);
    });
    [
      row.blockers,
      row.blockerCodes,
      row.warnings,
      row.warningCodes,
      row.conflictCodes
    ].forEach(function (list) {
      codeList(list).forEach(function (code) { values.push(code); });
    });
    var payload = safeObject(row.payload);
    var preview = safeObject(payload.proposalPreview);
    [
      payload.reason,
      payload.divergenceReason,
      payload.conflictKind,
      preview.reason,
      preview.divergenceReason,
      preview.conflictKind
    ].forEach(function (value) {
      var text = cleanString(value);
      if (text) values.push(text);
    });
    return values.map(function (value) { return value.toLowerCase(); });
  }

  function renameVsMoveConflict(entry) {
    var fields = changedFields(entry);
    if (fields.indexOf('name') !== -1 &&
        (fields.indexOf('parent') !== -1 || fields.indexOf('parentId') !== -1)) {
      return true;
    }
    return collectReasonCodes(entry).some(function (code) {
      return code === 'rename-vs-move' ||
        code === 'orphan-parent' ||
        code === 'parent-changed' ||
        code === 'parent-resolution-required' ||
        code.indexOf('move') !== -1 && code.indexOf('rename') !== -1;
    });
  }

  function renameVsDeleteConflict(entry) {
    var row = safeObject(entry);
    if (row.deleted === true || row.isDeleted === true || row.tombstoneReferenced === true) return true;
    return collectReasonCodes(entry).some(function (code) {
      return code === 'rename-vs-delete' ||
        code === 'delete-vs-update' ||
        code === 'delete-vs-edit-reference' ||
        code === 'f5-blocker-present' ||
        code === 'f5-folder-tombstone-present' ||
        code.indexOf('tombstone') !== -1 ||
        code.indexOf('delete') !== -1 && code.indexOf('rename') !== -1;
    });
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
      hashVerified: false,
      duplicateSiblingExists: false,
      parentStable: false,
      renameVsMoveConflict: false,
      renameVsDeleteConflict: false,
      watermarkSafe: false,
      replaySafe: false,
      consumedSafe: false,
      subjectResolved: false,
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
      out.hashVerified === true &&
      out.duplicateSiblingExists === false &&
      out.parentStable === true &&
      out.renameVsMoveConflict === false &&
      out.renameVsDeleteConflict === false &&
      out.watermarkSafe === true &&
      out.replaySafe === true &&
      out.consumedSafe === true &&
      out.subjectResolved === true;
    var forbidden = foreverNoKey(out);
    if (forbidden) {
      out.ok = false;
      out.actionable = false;
      addCode(out.blockers, 'rename-preflight-output-contains-forbidden-field');
      addCode(out.warnings, 'blocked-forbidden-key-' + forbidden);
    }
    return out;
  }

  async function runRenameConvergencePreflight(input) {
    var args = safeObject(input);
    var entry = entryFromInput(args);
    var sync = H2O.Desktop.Sync;
    var blockers = [];
    var warnings = [];
    var flags = {
      hashVerified: false,
      duplicateSiblingExists: false,
      parentStable: false,
      renameVsMoveConflict: false,
      renameVsDeleteConflict: false,
      watermarkSafe: false,
      replaySafe: false,
      consumedSafe: false,
      subjectResolved: false
    };

    if (!sync || typeof sync.checkRenameMaterialization !== 'function') {
      addCode(blockers, 'rename-materialization-diagnostic-unavailable');
      return resultFrom(flags, blockers, warnings);
    }

    var materialization = null;
    try {
      materialization = safeObject(await sync.checkRenameMaterialization({
        plannerEntry: entry,
        proposedName: args.proposedName
      }));
    } catch (_) {
      addCode(blockers, 'rename-materialization-diagnostic-failed');
      return resultFrom(flags, blockers, warnings);
    }

    codeList(materialization.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(materialization.warnings).forEach(function (code) { addCode(warnings, code); });

    flags.hashVerified = materialization.hashMatches === true;
    flags.duplicateSiblingExists = materialization.duplicateSiblingExists === true;
    flags.parentStable = materialization.parentStable === true;
    flags.watermarkSafe = materialization.watermarkSafe === true;
    flags.replaySafe = materialization.replaySafe === true;
    flags.consumedSafe = materialization.consumedSafe === true;
    flags.subjectResolved = materialization.subjectResolved === true;
    flags.renameVsMoveConflict = renameVsMoveConflict(entry);
    flags.renameVsDeleteConflict = renameVsDeleteConflict(entry);

    if (materialization.ok !== true) addCode(blockers, 'rename-materialization-not-ready');
    if (!flags.hashVerified) addCode(blockers, 'rename-hash-not-verified');
    if (flags.duplicateSiblingExists) addCode(blockers, 'duplicate-folder-name');
    if (!flags.parentStable) addCode(blockers, 'parent-not-stable');
    if (flags.renameVsMoveConflict) addCode(blockers, 'rename-vs-move');
    if (flags.renameVsDeleteConflict) addCode(blockers, 'rename-vs-delete');
    if (!flags.watermarkSafe) addCode(blockers, 'watermark-not-safe');
    if (!flags.replaySafe) addCode(blockers, 'replay-not-safe');
    if (!flags.consumedSafe) addCode(blockers, 'consumed-operation-not-safe');
    if (!flags.subjectResolved) addCode(blockers, 'subject-not-resolved');

    return resultFrom(flags, blockers, warnings);
  }

  H2O.Desktop.Sync.runRenameConvergencePreflight = runRenameConvergencePreflight;
  H2O.Desktop.Sync.__renameConvergencePreflightInstalled = true;
  H2O.Desktop.Sync.__renameConvergencePreflightVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
