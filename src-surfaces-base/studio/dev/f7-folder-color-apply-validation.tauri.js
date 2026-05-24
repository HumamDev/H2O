/* H2O Studio Dev Validation - F7.4.3 Folder Color Apply
 *
 * Desktop/Tauri-only debug harness. It validates the public F7.4.3 folder
 * color apply path from inside the Studio WebView. It intentionally does not
 * use SQL, Rust shortcuts, import/export/sync paths, F5/F6 mutation paths,
 * folderBinding/chat/snapshot mutation paths, or cleanup/delete helpers.
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
  H2O.Studio.devValidation = H2O.Studio.devValidation || {};
  if (H2O.Studio.devValidation.f7FolderColorApplyValidation &&
      H2O.Studio.devValidation.f7FolderColorApplyValidation.__installed) return;

  var SCHEMA = 'h2o.studio.f7-folder-color-apply-validation.v1';
  var APPLY_GATE = 'I_UNDERSTAND_THIS_APPLIES_ONE_LOCAL_FOLDER_COLOR_CHANGE';
  var ENTITY_KIND = 'folder.metadata';
  var TARGET_COLORS = Object.freeze(['#F97316', '#10B981', '#3B82F6', '#EAB308']);
  var VERSION = '0.1.0-f7.4.3-live-validation';

  var last = null;

  function nowIso() {
    try { return new Date().toISOString(); }
    catch (_) { return null; }
  }

  function cleanCode(value) {
    var s = String(value == null ? '' : value).trim();
    return /^[A-Za-z0-9._:-]{1,160}$/.test(s) ? s : 'validation-error';
  }

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function code(codeValue) {
    return { code: cleanCode(codeValue || 'warning') };
  }

  function addCode(list, codeValue) {
    var normalized = cleanCode(codeValue || '');
    if (!normalized) return;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].code === normalized) return;
    }
    list.push({ code: normalized });
  }

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); }
    catch (_) { return null; }
  }

  function safeObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
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
    if (!value || typeof value !== 'object') return value;
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

  function folderHash(row) {
    if (!row || typeof row !== 'object') return '';
    var metaValue = firstPresent(row, ['meta', 'meta_json']);
    var metaPresent = metaValue && typeof metaValue === 'object'
      ? Object.keys(metaValue).length > 0
      : !!cleanString(metaValue);
    var hashInput = {
      name: firstString(row, ['name', 'title', 'folderName']) || null,
      parentId: firstString(row, ['parentId', 'parentFolderId', 'parent_id']) || null,
      color: firstString(row, ['color', 'iconColor', 'folderColor', 'accentColor']) || null,
      icon: firstString(row, ['icon', 'iconKey']) || null,
      sortOrder: normalizeNumber(firstPresent(row, ['sortOrder', 'index', 'position', 'sort_order'])),
      kind: firstString(row, ['kind']) || null,
      source: firstString(row, ['source']) || null,
      metaPresent: !!metaPresent
    };
    return hashString(stableStringify(hashInput));
  }

  function makeSteps() {
    return {
      apiAvailable: false,
      safeFolderSelected: false,
      baselineCaptured: false,
      planApplyable: false,
      wrongGateBlocked: false,
      realApplyOk: false,
      afterApplyVerified: false,
      staleBaselineBlocked: false,
      restoreAttempted: false,
      restoreOk: false
    };
  }

  function makeCounts() {
    return {
      rowsUpdated: 0,
      restoreRowsUpdated: 0,
      foldersBefore: null,
      foldersAfter: null,
      selectedFolderBindingsBefore: null,
      selectedFolderBindingsAfter: null,
      chatsBefore: null,
      chatsAfter: null,
      snapshotsBefore: null,
      snapshotsAfter: null,
      maintenanceLogBefore: null,
      maintenanceLogAfter: null
    };
  }

  function baseResult() {
    return {
      schema: SCHEMA,
      ok: false,
      redacted: true,
      generatedAt: nowIso(),
      steps: makeSteps(),
      counts: makeCounts(),
      blockers: [],
      warnings: []
    };
  }

  function finish(result, ok) {
    result.ok = ok === true;
    result.generatedAt = nowIso();
    last = clone(result);
    return result;
  }

  function fail(result, step, codeValue) {
    result.ok = false;
    result.failedStep = cleanCode(step || 'unknown');
    result.blockers = [code(codeValue || 'validation-failed')];
    last = clone(result);
    return result;
  }

  function diagnostics() {
    return H2O && H2O.Studio && H2O.Studio.diagnostics;
  }

  function store() {
    return H2O && H2O.Studio && H2O.Studio.store;
  }

  function hasFunction(obj, name) {
    return !!(obj && typeof obj[name] === 'function');
  }

  function apiCheck(result) {
    var diag = diagnostics();
    var st = store();
    if (!hasFunction(diag, 'planBidirectionalFolderMetadataApply')) return null;
    if (!hasFunction(diag, 'applyBidirectionalFolderMetadataColor')) return null;
    if (!st || !st.folders || !st.conflicts) return null;
    if (!hasFunction(st.folders, 'list') || !hasFunction(st.folders, 'get')) return null;
    result.steps.apiAvailable = true;
    return {
      diagnostics: diag,
      folders: st.folders,
      chats: st.chats || null,
      snapshots: st.snapshots || null,
      conflicts: st.conflicts
    };
  }

  function folderId(row) {
    return cleanString(row && (row.folderId || row.id));
  }

  function folderName(row) {
    return cleanString(row && (row.name || row.title || row.folderName));
  }

  function folderColor(row) {
    var value = firstPresent(row, ['color', 'iconColor', 'folderColor', 'accentColor']);
    return cleanString(value);
  }

  function safeNameScore(row) {
    var combined = (folderId(row) + ' ' + folderName(row)).toLowerCase();
    if (/f7|validation|validate|test|empty|fixture|proof/.test(combined)) return 4;
    if (/demo|sample|case/.test(combined)) return 3;
    return 1;
  }

  function selectSafeFolder(rows) {
    var candidates = asArray(rows).filter(function (row) {
      return !!folderId(row);
    });
    if (!candidates.length) return null;
    candidates.sort(function (a, b) {
      var scoreA = safeNameScore(a) + (folderColor(a) ? 4 : 0);
      var scoreB = safeNameScore(b) + (folderColor(b) ? 4 : 0);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return folderColor(b).length - folderColor(a).length;
    });
    var best = candidates[0];
    return safeNameScore(best) >= 3 || !!folderColor(best) ? best : null;
  }

  function chooseTargetColor(currentColor) {
    var current = cleanString(currentColor).toLowerCase();
    for (var i = 0; i < TARGET_COLORS.length; i++) {
      if (TARGET_COLORS[i].toLowerCase() !== current) return TARGET_COLORS[i];
    }
    return '#0EA5E9';
  }

  function countMaybe(api, method, fallbackWarning, warnings) {
    if (!api || typeof api[method] !== 'function') {
      addCode(warnings, fallbackWarning);
      return Promise.resolve(null);
    }
    return Promise.resolve(api[method]()).then(function (value) {
      var count = Number(value);
      return Number.isFinite(count) ? count : null;
    }).catch(function () {
      addCode(warnings, fallbackWarning);
      return null;
    });
  }

  function countSelectedBindings(foldersApi, selectedFolderId, warnings) {
    if (!foldersApi || typeof foldersApi.listChats !== 'function') {
      addCode(warnings, 'selected-folder-binding-count-unavailable');
      return Promise.resolve(null);
    }
    return Promise.resolve(foldersApi.listChats(selectedFolderId)).then(function (rows) {
      return Array.isArray(rows) ? rows.length : null;
    }).catch(function () {
      addCode(warnings, 'selected-folder-binding-count-unavailable');
      return null;
    });
  }

  function captureCounts(apis, selectedFolderId, result, suffix) {
    var warnings = result.warnings;
    return Promise.all([
      countMaybe(apis.folders, 'count', 'folder-count-unavailable', warnings),
      countSelectedBindings(apis.folders, selectedFolderId, warnings),
      countMaybe(apis.chats, 'count', 'chat-count-unavailable', warnings),
      countMaybe(apis.snapshots, 'count', 'snapshot-count-unavailable', warnings)
    ]).then(function (counts) {
      result.counts['folders' + suffix] = counts[0];
      result.counts['selectedFolderBindings' + suffix] = counts[1];
      result.counts['chats' + suffix] = counts[2];
      result.counts['snapshots' + suffix] = counts[3];
      addCode(result.warnings, 'maintenance-log-count-unavailable');
    });
  }

  function planInput(selectedFolderId, baselineHash, targetHash, dedupeKeyHash, reason) {
    return {
      dryRun: true,
      entityKind: ENTITY_KIND,
      field: 'color',
      selectedDelta: {
        targetFolderId: selectedFolderId,
        dedupeKeyHash: dedupeKeyHash
      },
      expectedBaselineHash: baselineHash,
      expectedTargetHash: targetHash,
      reason: reason,
      refreshLocalState: true,
      checkF5Blockers: true,
      checkF6Blockers: true
    };
  }

  function applyInput(selectedFolderId, targetColor, baselineHash, targetHash, dedupeKeyHash, priorPlan, reason, gate) {
    return {
      dryRun: false,
      devGate: gate,
      reason: reason,
      targetFolderId: selectedFolderId,
      field: 'color',
      targetColor: targetColor,
      expectedBaselineHash: baselineHash,
      expectedTargetHash: targetHash,
      dedupeKeyHash: dedupeKeyHash,
      priorPlan: priorPlan,
      selectedDelta: {
        targetFolderId: selectedFolderId,
        dedupeKeyHash: dedupeKeyHash
      }
    };
  }

  function rawTokens(folder, targetColor, hashes, dedupeKeyHash) {
    var tokens = [
      folderId(folder),
      folderName(folder),
      folderColor(folder),
      cleanString(targetColor),
      cleanString(dedupeKeyHash)
    ];
    for (var i = 0; i < hashes.length; i++) tokens.push(cleanString(hashes[i]));
    return tokens.filter(function (token) { return token.length > 0; });
  }

  function assertRedacted(result, tokens) {
    var raw = '';
    try { raw = JSON.stringify(result); }
    catch (_) { return false; }
    for (var i = 0; i < tokens.length; i++) {
      if (tokens[i] && raw.indexOf(tokens[i]) >= 0) return false;
    }
    return !/folderId|targetFolderId|parentId|auditId|conflictId|tombstoneId|dedupeKeyHash|rawJson|metadata|rawHash|targetColor/i.test(raw);
  }

  function applyBlocked(output) {
    return !!(output && output.ok === false && output.applied !== true &&
      output.counts && Number(output.counts.rowsUpdated) === 0 &&
      Array.isArray(output.blockers) && output.blockers.length > 0);
  }

  function run() {
    var result = baseResult();
    var apis = apiCheck(result);
    if (!apis) return Promise.resolve(fail(result, 'apiAvailable', 'f7-folder-color-apply-api-unavailable'));

    var selected = null;
    var selectedId = '';
    var originalColor = '';
    var targetColor = '';
    var baselineHash = '';
    var targetHash = '';
    var dedupeKeyHash = 'f7-folder-color-apply-validation-' + Date.now().toString(36);
    var plan = null;
    var afterApplyFolder = null;

    return Promise.resolve()
      .then(function () {
        return apis.folders.list({ sort: { field: 'updatedAt', dir: 'DESC' }, limit: 100 });
      })
      .then(function (folders) {
        selected = selectSafeFolder(folders);
        if (!selected) throw { step: 'safeFolderSelected', code: 'safe-folder-not-found' };
        selectedId = folderId(selected);
        originalColor = folderColor(selected);
        targetColor = chooseTargetColor(originalColor);
        result.steps.safeFolderSelected = true;
        return captureCounts(apis, selectedId, result, 'Before');
      })
      .then(function () {
        return apis.folders.get(selectedId);
      })
      .then(function (freshFolder) {
        if (!freshFolder) throw { step: 'baselineCaptured', code: 'safe-folder-not-found' };
        selected = freshFolder;
        baselineHash = folderHash(freshFolder);
        var targetFolder = Object.assign({}, freshFolder, { color: targetColor });
        targetHash = folderHash(targetFolder);
        if (!baselineHash || !targetHash || baselineHash === targetHash) {
          throw { step: 'baselineCaptured', code: 'folder-hash-unavailable' };
        }
        result.steps.baselineCaptured = true;
        return apis.diagnostics.planBidirectionalFolderMetadataApply(
          planInput(selectedId, baselineHash, targetHash, dedupeKeyHash, 'f7.4.3 live validation plan')
        );
      })
      .then(function (planned) {
        plan = planned;
        if (!plan || plan.ok !== true || plan.dryRun !== true ||
            plan.writesPerformed !== 0 || plan.applyable !== true) {
          throw { step: 'planApplyable', code: 'dry-run-plan-not-applyable' };
        }
        result.steps.planApplyable = true;
        return apis.diagnostics.applyBidirectionalFolderMetadataColor(
          applyInput(selectedId, targetColor, baselineHash, targetHash, dedupeKeyHash, plan,
            'f7.4.3 wrong gate validation', 'WRONG_GATE')
        );
      })
      .then(function (wrongGate) {
        if (!applyBlocked(wrongGate)) {
          throw { step: 'wrongGateBlocked', code: 'wrong-gate-not-blocked' };
        }
        return apis.folders.get(selectedId).then(function (folderAfterWrongGate) {
          if (folderColor(folderAfterWrongGate) !== originalColor) {
            throw { step: 'wrongGateBlocked', code: 'wrong-gate-mutated-folder' };
          }
          result.steps.wrongGateBlocked = true;
          return apis.diagnostics.applyBidirectionalFolderMetadataColor(
            applyInput(selectedId, targetColor, baselineHash, targetHash, dedupeKeyHash, plan,
              'f7.4.3 live validation local folder color apply', APPLY_GATE)
          );
        });
      })
      .then(function (applyResult) {
        if (!applyResult || applyResult.ok !== true || applyResult.applied !== true ||
            applyResult.localOnly !== true || applyResult.syncPropagated !== false ||
            !applyResult.counts || Number(applyResult.counts.rowsUpdated) !== 1 ||
            !applyResult.audit || applyResult.audit.recorded !== true) {
          throw { step: 'realApplyOk', code: 'real-apply-failed' };
        }
        result.steps.realApplyOk = true;
        result.counts.rowsUpdated = 1;
        return apis.folders.get(selectedId);
      })
      .then(function (afterFolder) {
        afterApplyFolder = afterFolder;
        if (!afterFolder || folderColor(afterFolder) !== targetColor) {
          throw { step: 'afterApplyVerified', code: 'after-apply-color-not-changed' };
        }
        result.steps.afterApplyVerified = true;
        return apis.diagnostics.applyBidirectionalFolderMetadataColor(
          applyInput(selectedId, targetColor, baselineHash, targetHash, dedupeKeyHash, plan,
            'f7.4.3 stale baseline validation', APPLY_GATE)
        );
      })
      .then(function (staleResult) {
        if (!applyBlocked(staleResult)) {
          throw { step: 'staleBaselineBlocked', code: 'stale-baseline-not-blocked' };
        }
        var staleCode = staleResult.blockers && staleResult.blockers[0] && staleResult.blockers[0].code;
        if (staleCode !== 'baseline-hash-mismatch') {
          addCode(result.warnings, 'stale-baseline-blocker-was-not-baseline-hash-mismatch');
        }
        result.steps.staleBaselineBlocked = true;
        if (!originalColor) {
          addCode(result.warnings, 'restore-skipped-original-color-empty');
          return null;
        }
        result.steps.restoreAttempted = true;
        var restoreBaselineHash = folderHash(afterApplyFolder);
        var restoreTargetFolder = Object.assign({}, afterApplyFolder, { color: originalColor });
        var restoreTargetHash = folderHash(restoreTargetFolder);
        var restoreDedupe = dedupeKeyHash + '-restore';
        return apis.diagnostics.planBidirectionalFolderMetadataApply(
          planInput(selectedId, restoreBaselineHash, restoreTargetHash, restoreDedupe,
            'f7.4.3 live validation restore plan')
        ).then(function (restorePlan) {
          if (!restorePlan || restorePlan.ok !== true || restorePlan.applyable !== true) {
            addCode(result.warnings, 'restore-skipped-plan-not-applyable');
            return null;
          }
          return apis.diagnostics.applyBidirectionalFolderMetadataColor(
            applyInput(selectedId, originalColor, restoreBaselineHash, restoreTargetHash, restoreDedupe,
              restorePlan, 'f7.4.3 live validation restore original color', APPLY_GATE)
          );
        }).then(function (restoreResult) {
          if (!restoreResult) return null;
          if (restoreResult.ok === true && restoreResult.applied === true &&
              restoreResult.counts && Number(restoreResult.counts.rowsUpdated) === 1) {
            result.steps.restoreOk = true;
            result.counts.restoreRowsUpdated = 1;
          } else {
            addCode(result.warnings, 'restore-failed');
          }
          return null;
        });
      })
      .then(function () {
        return captureCounts(apis, selectedId, result, 'After');
      })
      .then(function () {
        var tokens = rawTokens(selected, targetColor, [baselineHash, targetHash], dedupeKeyHash);
        if (!assertRedacted(result, tokens)) {
          throw { step: 'redaction', code: 'validation-output-redaction-failed' };
        }
        result.blockers = [];
        return finish(result, true);
      })
      .catch(function (err) {
        var step = cleanCode(err && err.step) || 'unknown';
        var failureCode = cleanCode(err && err.code) || 'f7-folder-color-apply-validation-failed';
        return finish(fail(result, step, failureCode), false);
      });
  }

  function lastResult() {
    return clone(last);
  }

  function clearLastResult() {
    last = null;
    return true;
  }

  H2O.Studio.devValidation.f7FolderColorApplyValidation = Object.freeze({
    __installed: true,
    __version: VERSION,
    run: run,
    lastResult: lastResult,
    clearLastResult: clearLastResult,
    constants: Object.freeze({
      schema: SCHEMA
    })
  });

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
