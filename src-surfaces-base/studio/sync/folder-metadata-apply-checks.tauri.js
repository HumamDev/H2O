/* H2O Studio Sync - F7.4.1c folder.metadata apply live checks
 *
 * Tauri-only read layer for the F7.4.1b dry-run planner.
 *   - No SQL execution.
 *   - No browser storage access.
 *   - No folder write methods.
 *   - No F5 lifecycle writes.
 *   - No F6 queue/review writes.
 *   - No import/export/folder-sync/peer-transport calls.
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
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.diagnostics = H2O.Studio.diagnostics || {};
  if (H2O.Studio.diagnostics.__folderMetadataApplyChecksInstalled) return;

  var originalPlan = H2O.Studio.diagnostics.planBidirectionalFolderMetadataApply;
  if (typeof originalPlan !== 'function') return;

  var VERSION = '0.1.0-f7.4.1c';
  var FOLDER_RECORD_KIND = 'folder';

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function safeObject(value) {
    return isObject(value) ? value : {};
  }

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function firstPresent(row, keys) {
    var obj = safeObject(row);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null) return obj[key];
    }
    return null;
  }

  function firstString(row, keys) {
    return cleanString(firstPresent(row, keys));
  }

  function normalizeNumber(value) {
    if (value == null || value === '') return null;
    var num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!isObject(value)) return value;
    var out = {};
    var keys = Object.keys(value).sort();
    for (var i = 0; i < keys.length; i++) out[keys[i]] = canonicalize(value[keys[i]]);
    return out;
  }

  function stableStringify(value) {
    return JSON.stringify(canonicalize(value));
  }

  function hashString(value) {
    var input = String(value || '');
    var hash = 0x811c9dc5;
    for (var i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return ('00000000' + hash.toString(16)).slice(-8);
  }

  function addBlocker(list, code) {
    var normalized = cleanString(code);
    if (!normalized) return;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].code === normalized) return;
    }
    list.push({ code: normalized });
  }

  function mergeBlockers(result, blockers) {
    result.blockers = Array.isArray(result.blockers) ? result.blockers : [];
    for (var i = 0; i < blockers.length; i++) addBlocker(result.blockers, blockers[i].code);
    result.ok = result.blockers.length === 0;
    result.applyable = result.ok === true;
    if (!result.applyable && result.plannedMutation) result.plannedMutation.rowsWouldUpdate = 0;
    return result;
  }

  function normalizeFolderHash(row) {
    if (!isObject(row)) return '';
    var metaValue = firstPresent(row, ['meta', 'meta_json']);
    var metaPresent = isObject(metaValue)
      ? Object.keys(metaValue).length > 0
      : !!cleanString(metaValue);
    var hashInput = {
      name: firstString(row, ['name', 'title', 'folderName']) || null,
      parentId: firstString(row, ['parentId', 'parentFolderId', 'parent_id']) || null,
      color: firstString(row, ['color', 'iconColor', 'folderColor', 'accentColor']) || null,
      icon: firstString(row, ['icon', 'iconKey']) || null,
      sortOrder: normalizeNumber(firstPresent(row, ['sortOrder', 'index', 'position'])),
      kind: firstString(row, ['kind']) || null,
      source: firstString(row, ['source']) || null,
      metaPresent: !!metaPresent
    };
    return hashString(stableStringify(hashInput));
  }

  function folderRecordId(folderId) {
    return 'folder:' + encodeURIComponent(folderId);
  }

  function readFolder(targetFolderId, blockers) {
    var folders = H2O.Studio.store && H2O.Studio.store.folders;
    if (!folders || typeof folders.get !== 'function') {
      addBlocker(blockers, 'local-folder-read-unavailable');
      return Promise.resolve(null);
    }
    return Promise.resolve(folders.get(targetFolderId)).catch(function () {
      addBlocker(blockers, 'local-folder-read-unavailable');
      return null;
    });
  }

  function checkLocalTombstone(targetFolderId, blockers, enabled) {
    if (enabled !== true) {
      addBlocker(blockers, 'f5-blocker-check-unavailable');
      return Promise.resolve(undefined);
    }
    var tombstones = H2O.Studio.store && H2O.Studio.store.tombstones;
    if (!tombstones || typeof tombstones.getTombstone !== 'function') {
      addBlocker(blockers, 'f5-blocker-check-unavailable');
      return Promise.resolve(undefined);
    }
    return Promise.resolve(tombstones.getTombstone(FOLDER_RECORD_KIND, folderRecordId(targetFolderId)))
      .then(function (tombstone) {
        if (tombstone) {
          addBlocker(blockers, 'f5-folder-tombstone-present');
          return false;
        }
        return true;
      })
      .catch(function () {
        addBlocker(blockers, 'f5-blocker-check-unavailable');
        return undefined;
      });
  }

  function buildLiveChecks(input) {
    var inp = safeObject(input);
    var selectedDelta = safeObject(inp.selectedDelta);
    var targetFolderId = cleanString(selectedDelta.targetFolderId);
    var blockers = [];
    var checks = {};

    if (!targetFolderId) {
      addBlocker(blockers, 'target-folder-id-required');
      checks.f6BlockersAbsent = undefined;
      return Promise.resolve({ checks: checks, blockers: blockers });
    }

    return readFolder(targetFolderId, blockers).then(function (folder) {
      checks.targetFolderExists = !!folder;
      if (folder) {
        var baselineHash = normalizeFolderHash(folder);
        if (!baselineHash) {
          checks.baselineHashMatches = undefined;
          addBlocker(blockers, 'baseline-hash-check-unavailable');
        } else if (baselineHash === cleanString(inp.expectedBaselineHash)) {
          checks.baselineHashMatches = true;
        } else {
          checks.baselineHashMatches = false;
          addBlocker(blockers, 'baseline-hash-mismatch');
        }
      }
      return checkLocalTombstone(targetFolderId, blockers, inp.checkF5Blockers === true);
    }).then(function (f5Absent) {
      checks.f5BlockersAbsent = f5Absent === true ? true : (f5Absent === false ? false : undefined);
      checks.f6BlockersAbsent = undefined;
      addBlocker(blockers, 'f6-blocker-check-unavailable');
      return { checks: checks, blockers: blockers };
    });
  }

  function planWithLiveChecks(input) {
    if (!input || input.refreshLocalState !== true) return originalPlan(input);
    return buildLiveChecks(input).then(function (live) {
      var planInput = Object.assign({}, safeObject(input), { checks: live.checks });
      var result = originalPlan(planInput);
      result.checkMode = 'live-read-only';
      return mergeBlockers(result, live.blockers);
    }).catch(function () {
      var fallback = originalPlan(Object.assign({}, safeObject(input), { checks: {} }));
      fallback.checkMode = 'live-read-only';
      return mergeBlockers(fallback, [{ code: 'live-read-check-failed' }]);
    });
  }

  H2O.Studio.diagnostics.planBidirectionalFolderMetadataApply = planWithLiveChecks;
  H2O.Studio.diagnostics.__folderMetadataApplyChecksInstalled = true;
  H2O.Studio.diagnostics.__folderMetadataApplyChecksVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
