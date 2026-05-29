/* H2O Desktop Sync - F11.0.5 move convergence runtime proof
 *
 * Desktop/Tauri-only dogfood validation harness for the existing move
 * convergence chain.
 *
 * Safety invariants:
 *   - Proof only. This module adds no move, apply, proposal, bookkeeping,
 *     publication, outbox/inbox, WebDAV, convergence, or mobile write-back
 *     behavior.
 *   - Positive proof calls existing APIs only:
 *       checkMoveMaterialization()
 *       runMoveConvergencePreflight()
 *       generateMoveProposalCandidate()
 *       executeMoveConvergence()
 *       buildMoveApplyEvent()
 *       finalizeMoveConvergence()
 *   - Negative proofs are validation calls only and run before the positive
 *     local move action.
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
  if (H2O.Desktop.Sync.__moveConvergenceProofInstalled) return;

  var SCHEMA = 'h2o.desktop.sync.move-convergence-proof.v1';
  var VERSION = '0.1.0-f11.0.5';
  var SUBJECT_TYPE = 'folder.metadata';
  var MAX_FOLDER_TREE_DEPTH = 32;
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

  function isSha256Hex(value) {
    return /^[0-9a-f]{64}$/.test(cleanString(value));
  }

  function nowIsoSeconds() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  function bytesToHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i += 1) {
      var part = bytes[i].toString(16);
      hex += part.length === 1 ? '0' + part : part;
    }
    return hex;
  }

  function webCryptoAvailable() {
    try {
      return !!(global.crypto && global.crypto.subtle && global.crypto.subtle.digest);
    } catch (_) {
      return false;
    }
  }

  async function sha256Hex(value) {
    if (!webCryptoAvailable()) return '';
    var text = typeof value === 'string' ? value : String(value == null ? '' : value);
    var data = new TextEncoder().encode(text);
    var buffer = await global.crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(buffer));
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
      generatedAtIso: nowIsoSeconds(),
      redacted: true,
      materializationOk: false,
      preflightOk: false,
      candidateOk: false,
      moveOk: false,
      applyEventOk: false,
      consumedOk: false,
      watermarkOk: false,
      negativeProofs: {
        cycleBlocked: false,
        orphanBlocked: false,
        duplicateSiblingBlocked: false,
        depthOverflowBlocked: false
      },
      blockers: [],
      warnings: []
    };
  }

  function finish(result) {
    result.generatedAtIso = nowIsoSeconds();
    var negative = safeObject(result.negativeProofs);
    result.ok = result.materializationOk === true &&
      result.preflightOk === true &&
      result.candidateOk === true &&
      result.moveOk === true &&
      result.applyEventOk === true &&
      result.consumedOk === true &&
      result.watermarkOk === true &&
      negative.cycleBlocked === true &&
      negative.orphanBlocked === true &&
      negative.duplicateSiblingBlocked === true &&
      negative.depthOverflowBlocked === true &&
      result.blockers.length === 0;
    var forbidden = foreverNoKey(result);
    if (forbidden) {
      result.ok = false;
      addCode(result.blockers, 'move-proof-output-contains-forbidden-field');
      addCode(result.warnings, 'blocked-forbidden-key-' + forbidden);
    }
    return result;
  }

  function changedFields(entry) {
    return asArray(safeObject(entry).changedFields).map(cleanString).filter(Boolean).sort();
  }

  function isMoveOnlyEntry(entry) {
    var fields = changedFields(entry);
    return fields.length === 1 && (fields[0] === 'parent' || fields[0] === 'parentId');
  }

  async function firstPlannerMoveEntry(warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.buildConvergencePlan !== 'function') return null;
    try {
      var plan = safeObject(await sync.buildConvergencePlan());
      var buckets = safeObject(plan.buckets);
      var order = ['proposalEligible', 'needsPreview', 'conflicted', 'blocked', 'stale', 'replay'];
      for (var i = 0; i < order.length; i += 1) {
        var rows = asArray(buckets[order[i]]);
        for (var j = 0; j < rows.length; j += 1) {
          if (isMoveOnlyEntry(rows[j])) return safeObject(rows[j]);
        }
      }
    } catch (_) {
      addCode(warnings, 'convergence-plan-read-failed');
    }
    return null;
  }

  async function sourceEntry(args, blockers, warnings) {
    var entry = safeObject(args.plannerEntry || args.entry || args.candidate);
    if (Object.keys(entry).length) return entry;
    entry = await firstPlannerMoveEntry(warnings);
    if (!entry) addCode(blockers, 'move-proof-entry-required');
    return safeObject(entry);
  }

  function blocked(output) {
    var row = safeObject(output);
    return row.ok !== true && codeList(row.blockers).length > 0;
  }

  async function runMaterialization(entry) {
    return safeObject(await H2O.Desktop.Sync.checkMoveMaterialization({
      plannerEntry: entry
    }));
  }

  async function runPreflight(entry) {
    return safeObject(await H2O.Desktop.Sync.runMoveConvergencePreflight({
      plannerEntry: entry
    }));
  }

  function withTargetParent(entry, targetParentSubjectId) {
    var clone = Object.assign({}, safeObject(entry));
    clone.changedFields = ['parent'];
    clone.targetParentSubjectId = targetParentSubjectId;
    clone.toParentSubjectId = targetParentSubjectId;
    return clone;
  }

  async function cycleProof(entry, result) {
    try {
      var subjectId = cleanString(entry.subjectId).toLowerCase();
      var output = await runMaterialization(withTargetParent(entry, subjectId));
      var blockers = codeList(output.blockers);
      result.negativeProofs.cycleBlocked = blocked(output) &&
        (blockers.indexOf('self-parent') !== -1 ||
          blockers.indexOf('descendant-parent') !== -1 ||
          blockers.indexOf('cycle-risk') !== -1);
      if (!result.negativeProofs.cycleBlocked) addCode(result.blockers, 'cycle-negative-proof-not-blocked');
    } catch (_) {
      addCode(result.blockers, 'cycle-negative-proof-failed');
    }
  }

  async function orphanProof(entry, result) {
    try {
      var output = await runMaterialization(withTargetParent(entry, 'f'.repeat(64)));
      var blockers = codeList(output.blockers);
      result.negativeProofs.orphanBlocked = blocked(output) &&
        (blockers.indexOf('target-parent-not-resolved') !== -1 ||
          blockers.indexOf('orphan-risk') !== -1);
      if (!result.negativeProofs.orphanBlocked) addCode(result.blockers, 'orphan-negative-proof-not-blocked');
    } catch (_) {
      addCode(result.blockers, 'orphan-negative-proof-failed');
    }
  }

  function firstPresent(row, keys) {
    var obj = safeObject(row);
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null) return obj[key];
    }
    return null;
  }

  function firstString(row, keys) {
    return cleanString(firstPresent(row, keys));
  }

  function rowId(row) {
    return firstString(row, ['id', 'folderId']);
  }

  function rowParentId(row) {
    return cleanString(firstPresent(row, ['parentId', 'parentFolderId', 'parent_id']));
  }

  function rowName(row) {
    return firstString(row, ['name', 'title', 'folderName']);
  }

  function normalizeName(value) {
    var raw = String(value == null ? '' : value);
    return raw.normalize ? raw.normalize('NFC').trim() : raw.trim();
  }

  function isLiveFolder(row) {
    var r = safeObject(row);
    if (r.deleted === true || r.isDeleted === true || r.tombstoned === true) return false;
    if (firstString(r, ['deletedAt', 'deleted_at', 'removedAt', 'removed_at'])) return false;
    if (firstString(r, ['tombstoneId', 'tombstone_id'])) return false;
    return true;
  }

  async function callMaybe(api, methods) {
    for (var i = 0; i < methods.length; i += 1) {
      var method = methods[i];
      if (api && typeof api[method] === 'function') {
        try {
          var value = await Promise.resolve(api[method]());
          if (Array.isArray(value)) return value;
          if (Array.isArray(value && value.folders)) return value.folders;
          if (Array.isArray(value && value.rows)) return value.rows;
        } catch (_) { /* try next source */ }
      }
    }
    return [];
  }

  async function readFolderRows(warnings) {
    var storeFolders = H2O.Studio && H2O.Studio.store && H2O.Studio.store.folders;
    var rows = await callMaybe(storeFolders, ['list', 'getAll', 'listFolders']);
    if (rows.length) return rows;
    addCode(warnings, 'folder-row-source-unavailable');
    return [];
  }

  async function folderSubjectId(id) {
    return sha256Hex(SUBJECT_TYPE + ':' + cleanString(id));
  }

  async function buildTree(rows) {
    var byId = {};
    var bySubject = {};
    var children = {};
    for (var i = 0; i < rows.length; i += 1) {
      var row = safeObject(rows[i]);
      var id = rowId(row);
      if (!id) continue;
      byId[id] = row;
      bySubject[await folderSubjectId(id)] = row;
      var parent = rowParentId(row);
      if (!children[parent]) children[parent] = [];
      children[parent].push(row);
    }
    return { byId: byId, bySubject: bySubject, children: children };
  }

  function resolveSubject(entry, tree) {
    var subjectId = cleanString(entry.subjectId).toLowerCase();
    return isSha256Hex(subjectId) ? safeObject(tree.bySubject[subjectId]) : {};
  }

  function collectDescendantIds(subjectId, tree) {
    var seen = {};
    var queue = asArray(tree.children[cleanString(subjectId)]).slice();
    while (queue.length) {
      var row = safeObject(queue.shift());
      var id = rowId(row);
      if (!id || seen[id]) continue;
      seen[id] = true;
      asArray(tree.children[id]).forEach(function (child) { queue.push(child); });
    }
    return seen;
  }

  function parentDepth(parentId, tree) {
    var current = cleanString(parentId);
    var seen = {};
    var depth = 0;
    while (current) {
      if (seen[current]) return Infinity;
      seen[current] = true;
      var row = tree.byId[current];
      if (!row || !isLiveFolder(row)) return Infinity;
      depth += 1;
      current = rowParentId(row);
    }
    return depth;
  }

  function descendantDepth(subjectId, tree) {
    var queue = asArray(tree.children[cleanString(subjectId)]).map(function (row) {
      return { row: row, depth: 1 };
    });
    var max = 0;
    var seen = {};
    while (queue.length) {
      var item = safeObject(queue.shift());
      var row = safeObject(item.row);
      var id = rowId(row);
      if (!id || seen[id]) continue;
      seen[id] = true;
      var depth = Number(item.depth || 1);
      if (depth > max) max = depth;
      asArray(tree.children[id]).forEach(function (child) {
        queue.push({ row: child, depth: depth + 1 });
      });
    }
    return max;
  }

  async function targetParentForDuplicate(entry, args, result) {
    var explicit = cleanString(args.duplicateSiblingTargetParentSubjectId);
    if (explicit) return explicit;
    var rows = await readFolderRows(result.warnings);
    var tree = await buildTree(rows);
    var subject = resolveSubject(entry, tree);
    var subjectId = rowId(subject);
    var subjectName = normalizeName(rowName(subject));
    if (!subjectId || !subjectName) return '';
    for (var i = 0; i < rows.length; i += 1) {
      var row = safeObject(rows[i]);
      var id = rowId(row);
      if (!id || id === subjectId || !isLiveFolder(row)) continue;
      if (normalizeName(rowName(row)) === subjectName) {
        var parent = rowParentId(row);
        return parent ? folderSubjectId(parent) : null;
      }
    }
    return '';
  }

  async function duplicateSiblingProof(entry, args, result) {
    try {
      var targetParent = await targetParentForDuplicate(entry, args, result);
      if (!targetParent && targetParent !== null) {
        addCode(result.blockers, 'duplicate-sibling-negative-fixture-unavailable');
        return;
      }
      var output = await runMaterialization(withTargetParent(entry, targetParent));
      result.negativeProofs.duplicateSiblingBlocked = blocked(output) &&
        codeList(output.blockers).indexOf('duplicate-folder-name') !== -1;
      if (!result.negativeProofs.duplicateSiblingBlocked) addCode(result.blockers, 'duplicate-sibling-negative-proof-not-blocked');
    } catch (_) {
      addCode(result.blockers, 'duplicate-sibling-negative-proof-failed');
    }
  }

  async function targetParentForDepthOverflow(entry, args, result) {
    var explicit = cleanString(args.depthOverflowTargetParentSubjectId);
    if (explicit) return explicit;
    var rows = await readFolderRows(result.warnings);
    var tree = await buildTree(rows);
    var subject = resolveSubject(entry, tree);
    var subjectId = rowId(subject);
    if (!subjectId) return '';
    var descendants = collectDescendantIds(subjectId, tree);
    var maxDescendantDepth = descendantDepth(subjectId, tree);
    for (var i = 0; i < rows.length; i += 1) {
      var row = safeObject(rows[i]);
      var id = rowId(row);
      if (!id || id === subjectId || descendants[id] || !isLiveFolder(row)) continue;
      var depth = parentDepth(id, tree);
      if (Number.isFinite(depth) && depth + 1 + maxDescendantDepth > MAX_FOLDER_TREE_DEPTH) {
        return folderSubjectId(id);
      }
    }
    return '';
  }

  async function depthOverflowProof(entry, args, result) {
    try {
      var targetParent = await targetParentForDepthOverflow(entry, args, result);
      if (!targetParent) {
        addCode(result.blockers, 'depth-overflow-negative-fixture-unavailable');
        return;
      }
      var output = await runMaterialization(withTargetParent(entry, targetParent));
      result.negativeProofs.depthOverflowBlocked = blocked(output) &&
        codeList(output.blockers).indexOf('tree-depth-limit-exceeded') !== -1;
      if (!result.negativeProofs.depthOverflowBlocked) addCode(result.blockers, 'depth-overflow-negative-proof-not-blocked');
    } catch (_) {
      addCode(result.blockers, 'depth-overflow-negative-proof-failed');
    }
  }

  function requireApis(result) {
    var sync = H2O.Desktop.Sync;
    [
      'checkMoveMaterialization',
      'runMoveConvergencePreflight',
      'generateMoveProposalCandidate',
      'executeMoveConvergence',
      'buildMoveApplyEvent',
      'finalizeMoveConvergence'
    ].forEach(function (name) {
      if (!sync || typeof sync[name] !== 'function') addCode(result.blockers, name + '-unavailable');
    });
  }

  async function runMoveConvergenceProof(input) {
    var args = safeObject(input);
    var result = baseResult();
    requireApis(result);
    if (!webCryptoAvailable()) addCode(result.blockers, 'web-crypto-unavailable');

    var entry = await sourceEntry(args, result.blockers, result.warnings);
    if (result.blockers.length) return finish(result);

    var materialization = null;
    var preflight = null;
    var candidate = null;
    var moveResult = null;
    var applyEventResult = null;
    var bookkeeping = null;

    try {
      materialization = await runMaterialization(entry);
      result.materializationOk = materialization.ok === true &&
        materialization.subjectResolved === true &&
        materialization.parentResolved === true &&
        materialization.cycleSafe === true &&
        materialization.orphanSafe === true &&
        materialization.depthSafe === true &&
        materialization.duplicateSiblingSafe === true;
      codeList(materialization.blockers).forEach(function (code) { addCode(result.blockers, code); });
      codeList(materialization.warnings).forEach(function (code) { addCode(result.warnings, code); });
    } catch (_) {
      addCode(result.blockers, 'move-proof-materialization-failed');
    }
    if (!result.materializationOk) return finish(result);

    try {
      preflight = await runPreflight(entry);
      result.preflightOk = preflight.ok === true && preflight.actionable === true;
      codeList(preflight.blockers).forEach(function (code) { addCode(result.blockers, code); });
      codeList(preflight.warnings).forEach(function (code) { addCode(result.warnings, code); });
    } catch (_) {
      addCode(result.blockers, 'move-proof-preflight-failed');
    }
    if (!result.preflightOk) return finish(result);

    await cycleProof(entry, result);
    await orphanProof(entry, result);
    await duplicateSiblingProof(entry, args, result);
    await depthOverflowProof(entry, args, result);
    if (result.blockers.length) return finish(result);

    try {
      candidate = safeObject(await H2O.Desktop.Sync.generateMoveProposalCandidate({
        plannerEntry: entry,
        operatorApprovalToken: cleanString(H2O.Desktop.Sync.__moveProposalCandidateApprovalToken)
      }));
      result.candidateOk = candidate.ok === true &&
        safeObject(candidate.proposalCandidate).kind === 'proposal' &&
        !!cleanString(candidate.candidateId);
      codeList(candidate.blockers).forEach(function (code) { addCode(result.blockers, code); });
      codeList(candidate.warnings).forEach(function (code) { addCode(result.warnings, code); });
    } catch (_) {
      addCode(result.blockers, 'move-proof-candidate-generation-failed');
    }
    if (!result.candidateOk) return finish(result);

    try {
      moveResult = safeObject(await H2O.Desktop.Sync.executeMoveConvergence({
        plannerEntry: entry,
        operatorApprovalToken: cleanString(H2O.Desktop.Sync.__moveConvergenceApprovalToken)
      }));
      result.moveOk = moveResult.ok === true && moveResult.moved === true;
      codeList(moveResult.blockers).forEach(function (code) { addCode(result.blockers, code); });
      codeList(moveResult.warnings).forEach(function (code) { addCode(result.warnings, code); });
    } catch (_) {
      addCode(result.blockers, 'move-proof-local-move-failed');
    }
    if (!result.moveOk) return finish(result);

    try {
      applyEventResult = safeObject(await H2O.Desktop.Sync.buildMoveApplyEvent({ moveResult: moveResult }));
      result.applyEventOk = applyEventResult.ok === true &&
        safeObject(applyEventResult.applyEvent).kind === 'applyEvent';
      codeList(applyEventResult.blockers).forEach(function (code) { addCode(result.blockers, code); });
      codeList(applyEventResult.warnings).forEach(function (code) { addCode(result.warnings, code); });
    } catch (_) {
      addCode(result.blockers, 'move-proof-applyEvent-failed');
    }
    if (!result.applyEventOk) return finish(result);

    try {
      bookkeeping = safeObject(await H2O.Desktop.Sync.finalizeMoveConvergence({ moveResult: moveResult }));
      result.consumedOk = bookkeeping.ok === true && isObject(bookkeeping.consumedRow);
      result.watermarkOk = bookkeeping.ok === true && isObject(bookkeeping.watermarkRow);
      codeList(bookkeeping.blockers).forEach(function (code) { addCode(result.blockers, code); });
      codeList(bookkeeping.warnings).forEach(function (code) { addCode(result.warnings, code); });
    } catch (_) {
      addCode(result.blockers, 'move-proof-bookkeeping-failed');
    }

    return finish(result);
  }

  H2O.Desktop.Sync.runMoveConvergenceProof = runMoveConvergenceProof;
  H2O.Desktop.Sync.__moveConvergenceProofInstalled = true;
  H2O.Desktop.Sync.__moveConvergenceProofVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
