/* H2O Studio Sync - F7.4.1c/F7.4.1e folder.metadata apply live checks
 *
 * Tauri-only read layer for the F7.4.1b dry-run planner.
 *   - No SQL execution.
 *   - No browser storage access.
 *   - No folder write methods.
 *   - No F5 lifecycle writes.
 *   - No F6 queue/review writes; F6 dedupe checks are diagnostic-only.
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

  var VERSION = '0.2.0-f7.4.3';
  var FOLDER_RECORD_KIND = 'folder';
  var COLOR_APPLY_SCHEMA = 'h2o.studio.sync.folder-metadata-color-apply.v0';

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

  function canonicalParentId(value) {
    return cleanString(value);
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

  function addWarning(list, code) {
    var normalized = cleanString(code);
    if (!normalized) return;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].code === normalized) return;
    }
    list.push({ code: normalized });
  }

  function isSpecificF6Blocker(code) {
    var normalized = cleanString(code);
    if (!normalized || normalized === 'f6-blocker-present') return false;
    return normalized.indexOf('f6-conflict-') === 0
      || normalized.indexOf('f6-blocker-check-') === 0
      || normalized === 'f6-dedupe-key-hash-required';
  }

  function pruneGenericF6Blocker(result) {
    var blockers = Array.isArray(result.blockers) ? result.blockers : [];
    var hasSpecific = false;
    for (var i = 0; i < blockers.length; i++) {
      if (isSpecificF6Blocker(blockers[i] && blockers[i].code)) {
        hasSpecific = true;
        break;
      }
    }
    if (!hasSpecific) return;
    result.blockers = blockers.filter(function (blocker) {
      return cleanString(blocker && blocker.code) !== 'f6-blocker-present';
    });
  }

  function mergeBlockers(result, blockers, warnings) {
    result.blockers = Array.isArray(result.blockers) ? result.blockers : [];
    for (var i = 0; i < blockers.length; i++) addBlocker(result.blockers, blockers[i].code);
    result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
    for (var w = 0; w < (warnings || []).length; w++) addWarning(result.warnings, warnings[w].code);
    pruneGenericF6Blocker(result);
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
      parentId: canonicalParentId(firstPresent(row, ['parentId', 'parentFolderId', 'parent_id'])),
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

  function selectedDedupeKeyHash(selectedDelta) {
    var delta = safeObject(selectedDelta);
    var direct = cleanString(delta.dedupeKeyHash);
    if (direct) return direct;
    var conflictCandidate = safeObject(delta.conflictCandidate);
    var fromConflictCandidate = cleanString(conflictCandidate.dedupeKeyHash);
    if (fromConflictCandidate) return fromConflictCandidate;
    var candidate = safeObject(delta.candidate);
    return cleanString(candidate.dedupeKeyHash);
  }

  function applyFailure(code, dryRun) {
    return {
      schema: COLOR_APPLY_SCHEMA,
      ok: false,
      redacted: true,
      dryRun: dryRun === true,
      applied: false,
      localOnly: true,
      syncPropagated: false,
      entityKind: 'folder.metadata',
      fieldsUpdated: [],
      audit: {
        recorded: false,
        operatorPeerRecorded: false
      },
      counts: {
        rowsUpdated: 0
      },
      blockers: [{ code: cleanString(code) || 'folder-color-apply-failed' }],
      warnings: []
    };
  }

  function normalizeApplyResult(result, dryRun) {
    if (!result || typeof result !== 'object' || result.schema !== COLOR_APPLY_SCHEMA) {
      return applyFailure('folder-color-apply-failed', dryRun);
    }
    return {
      schema: COLOR_APPLY_SCHEMA,
      ok: result.ok === true,
      redacted: true,
      dryRun: result.dryRun === true,
      applied: result.applied === true,
      localOnly: result.localOnly !== false,
      syncPropagated: result.syncPropagated === true,
      entityKind: cleanString(result.entityKind) || 'folder.metadata',
      fieldsUpdated: Array.isArray(result.fieldsUpdated)
        ? result.fieldsUpdated.map(cleanString).filter(Boolean)
        : [],
      audit: {
        recorded: !!(result.audit && result.audit.recorded === true),
        operatorPeerRecorded: !!(result.audit && result.audit.operatorPeerRecorded === true)
      },
      counts: {
        rowsUpdated: Number(result.counts && result.counts.rowsUpdated) || 0
      },
      blockers: Array.isArray(result.blockers)
        ? result.blockers.map(function (b) { return { code: cleanString(b && b.code) || 'blocked' }; })
        : [],
      warnings: Array.isArray(result.warnings)
        ? result.warnings.map(function (w) { return { code: cleanString(w && w.code) || 'warning' }; })
        : []
    };
  }

  function readLocalSyncPeerIdForApply(explicitPeerId) {
    var explicit = cleanString(explicitPeerId);
    if (explicit) return Promise.resolve(explicit);
    var identity = H2O && H2O.Studio && H2O.Studio.identity;
    if (!identity || typeof identity.whenReady !== 'function') {
      return Promise.reject(new Error('local identity unavailable for folder color apply audit'));
    }
    try {
      return Promise.resolve(identity.whenReady()).then(function (value) {
        var peerId = cleanString(value && value.syncPeerId);
        if (!peerId || peerId.length > 256 || /[\u0000-\u001f\u007f]/.test(peerId)) {
          throw new Error('local identity unavailable for folder color apply audit');
        }
        return peerId;
      });
    } catch (e) {
      return Promise.reject(e);
    }
  }

  function applyDedupeKeyHash(input) {
    var inp = safeObject(input);
    var direct = cleanString(inp.dedupeKeyHash);
    if (direct) return direct;
    return selectedDedupeKeyHash(inp.selectedDelta);
  }

  function checkF6Blockers(selectedDelta, blockers, warnings, enabled) {
    if (enabled !== true) {
      addBlocker(blockers, 'f6-blocker-check-unavailable');
      return Promise.resolve(undefined);
    }
    var dedupeKeyHash = selectedDedupeKeyHash(selectedDelta);
    if (!dedupeKeyHash) {
      addBlocker(blockers, 'f6-dedupe-key-hash-required');
      return Promise.resolve(false);
    }
    var conflicts = H2O.Studio.store && H2O.Studio.store.conflicts;
    if (!conflicts || typeof conflicts.diagnoseConflictByDedupeKeyHash !== 'function') {
      addBlocker(blockers, 'f6-blocker-check-unavailable');
      return Promise.resolve(undefined);
    }
    return Promise.resolve(conflicts.diagnoseConflictByDedupeKeyHash(dedupeKeyHash))
      .then(function (diagnostic) {
        if (!diagnostic || diagnostic.ok !== true) {
          addBlocker(blockers, 'f6-blocker-check-failed');
          return false;
        }
        var f6Warnings = Array.isArray(diagnostic.warnings) ? diagnostic.warnings : [];
        for (var i = 0; i < f6Warnings.length; i++) addWarning(warnings, f6Warnings[i] && f6Warnings[i].code);
        if (diagnostic.found === false) return true;
        if (diagnostic.blocksApply === true) {
          addBlocker(blockers, cleanString(diagnostic.blocker && diagnostic.blocker.code) || 'f6-blocker-present');
          return false;
        }
        return true;
      })
      .catch(function () {
        addBlocker(blockers, 'f6-blocker-check-failed');
        return false;
      });
  }

  function buildLiveChecks(input) {
    var inp = safeObject(input);
    var selectedDelta = safeObject(inp.selectedDelta);
    var targetFolderId = cleanString(selectedDelta.targetFolderId);
    var blockers = [];
    var warnings = [];
    var checks = {};

    if (!targetFolderId) {
      addBlocker(blockers, 'target-folder-id-required');
      checks.f6BlockersAbsent = undefined;
      return Promise.resolve({ checks: checks, blockers: blockers, warnings: warnings });
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
      return checkF6Blockers(selectedDelta, blockers, warnings, inp.checkF6Blockers === true);
    }).then(function (f6Absent) {
      checks.f6BlockersAbsent = f6Absent === true ? true : (f6Absent === false ? false : undefined);
      return { checks: checks, blockers: blockers, warnings: warnings };
    });
  }

  function planWithLiveChecks(input) {
    if (!input || input.refreshLocalState !== true) return originalPlan(input);
    return buildLiveChecks(input).then(function (live) {
      var planInput = Object.assign({}, safeObject(input), { checks: live.checks });
      var result = originalPlan(planInput);
      result.checkMode = 'live-read-only';
      return mergeBlockers(result, live.blockers, live.warnings);
    }).catch(function () {
      var fallback = originalPlan(Object.assign({}, safeObject(input), { checks: {} }));
      fallback.checkMode = 'live-read-only';
      return mergeBlockers(fallback, [{ code: 'live-read-check-failed' }], []);
    });
  }

  function applyBidirectionalFolderMetadataColor(input) {
    var inp = safeObject(input);
    var invoke = getInvoke();
    if (inp.dryRun !== false) {
      return Promise.resolve(applyFailure('dry-run-must-be-false', inp.dryRun));
    }
    if (typeof invoke !== 'function' || !detectTauri()) {
      return Promise.resolve(applyFailure('tauri-invoke-unavailable', inp.dryRun));
    }
    return readLocalSyncPeerIdForApply(inp.requestedBySyncPeerId || inp.localSyncPeerId)
      .then(function (peerId) {
        return invoke('apply_folder_metadata_color', {
          payload: {
            dryRun: inp.dryRun === true,
            devGate: cleanString(inp.devGate || inp.gate),
            targetFolderId: cleanString(inp.targetFolderId),
            field: cleanString(inp.field),
            targetColor: cleanString(inp.targetColor || inp.targetValue),
            selectedDelta: safeObject(inp.selectedDelta),
            expectedBaselineHash: cleanString(inp.expectedBaselineHash),
            expectedTargetHash: cleanString(inp.expectedTargetHash) || null,
            reason: cleanString(inp.reason),
            requestedBySyncPeerId: peerId,
            dedupeKeyHash: applyDedupeKeyHash(inp),
            priorPlan: safeObject(inp.priorPlan)
          }
        });
      })
      .then(function (result) {
        return normalizeApplyResult(result, inp.dryRun);
      })
      .catch(function (err) {
        var message = cleanString(err && err.message);
        if (message.indexOf('local identity unavailable') >= 0) {
          return applyFailure('identity-unavailable', inp.dryRun);
        }
        return applyFailure('folder-color-apply-failed', inp.dryRun);
      });
  }

  H2O.Studio.diagnostics.planBidirectionalFolderMetadataApply = planWithLiveChecks;
  H2O.Studio.diagnostics.applyBidirectionalFolderMetadataColor = applyBidirectionalFolderMetadataColor;
  H2O.Studio.diagnostics.__folderMetadataApplyChecksInstalled = true;
  H2O.Studio.diagnostics.__folderMetadataApplyChecksVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
