/* H2O Desktop Sync - F10.9.8 rename convergence runtime proof
 *
 * Desktop/Tauri-only dogfood validation harness for the existing rename
 * convergence chain.
 *
 * Safety invariants:
 *   - Proof only. This module adds no rename, apply, proposal, bookkeeping,
 *     publication, outbox/inbox, WebDAV, convergence, or mobile write-back
 *     behavior.
 *   - Positive proof calls existing APIs only:
 *       checkRenameMaterialization()
 *       runRenameConvergencePreflight()
 *       generateRenameProposalCandidate()
 *       executeRenameConvergence()
 *       buildRenameApplyEvent()
 *       finalizeRenameConvergence()
 *   - Negative proofs are validation calls only and run before the positive
 *     local rename action.
 *   - proposedName is local operator input only. It is never returned,
 *     persisted by this harness, enqueued, uploaded, or logged.
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
  if (H2O.Desktop.Sync.__renameConvergenceProofInstalled) return;

  var SCHEMA = 'h2o.desktop.sync.rename-convergence-proof.v1';
  var VERSION = '0.1.0-f10.9.8';
  var SUBJECT_TYPE = 'folder.metadata';
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'attachments',
    'name', 'title', 'folderName', 'chatTitle', 'rawId', 'chatId',
    'folderId', 'targetFolderId', 'parentId', 'targetParentId',
    'path', 'url', 'password', 'apiKey',
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

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!isObject(value)) return value;
    var out = {};
    Object.keys(value).sort().forEach(function (key) {
      out[key] = canonicalize(value[key]);
    });
    return out;
  }

  function canonicalJson(value) {
    return JSON.stringify(canonicalize(value));
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
      renameOk: false,
      applyEventOk: false,
      consumedOk: false,
      watermarkOk: false,
      negativeProofs: {
        hashMismatchBlocked: false,
        duplicateSiblingBlocked: false,
        renameVsMoveBlocked: false,
        renameVsDeleteBlocked: false
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
      result.renameOk === true &&
      result.applyEventOk === true &&
      result.consumedOk === true &&
      result.watermarkOk === true &&
      negative.hashMismatchBlocked === true &&
      negative.duplicateSiblingBlocked === true &&
      negative.renameVsMoveBlocked === true &&
      negative.renameVsDeleteBlocked === true &&
      result.blockers.length === 0;
    var forbidden = foreverNoKey(result);
    if (forbidden) {
      result.ok = false;
      addCode(result.blockers, 'rename-proof-output-contains-forbidden-field');
      addCode(result.warnings, 'blocked-forbidden-key-' + forbidden);
    }
    return result;
  }

  function changedFields(entry) {
    return asArray(safeObject(entry).changedFields).map(cleanString).filter(Boolean).sort();
  }

  function isRenameOnlyEntry(entry) {
    var fields = changedFields(entry);
    return fields.length === 1 && fields[0] === 'name';
  }

  async function firstPlannerRenameEntry(warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.buildConvergencePlan !== 'function') return null;
    try {
      var plan = safeObject(await sync.buildConvergencePlan());
      var buckets = safeObject(plan.buckets);
      var order = ['proposalEligible', 'needsPreview', 'conflicted', 'blocked', 'stale', 'replay'];
      for (var i = 0; i < order.length; i += 1) {
        var rows = asArray(buckets[order[i]]);
        for (var j = 0; j < rows.length; j += 1) {
          if (isRenameOnlyEntry(rows[j])) return safeObject(rows[j]);
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
    entry = await firstPlannerRenameEntry(warnings);
    if (!entry) addCode(blockers, 'rename-proof-entry-required');
    return safeObject(entry);
  }

  function localInputName(args, blockers) {
    var value = cleanString(args.proposedName || args.localProposedName || args.localName);
    if (!value) addCode(blockers, 'rename-proof-local-name-required');
    return value;
  }

  function entryHash(row, keys) {
    var obj = safeObject(row);
    for (var i = 0; i < keys.length; i += 1) {
      var text = cleanString(obj[keys[i]]).toLowerCase();
      if (text) return text;
    }
    return '';
  }

  function targetNameHashFromMaterialization(materialization) {
    return cleanString(safeObject(materialization).targetNameHash).toLowerCase();
  }

  function enrichRenameResult(renameResult, entry, materialization) {
    var row = Object.assign({}, safeObject(renameResult));
    row.preStateHash = entryHash(entry, ['baseHash', 'localRevisionHash', 'preStateHash']);
    row.postStateHash = entryHash(entry, ['targetHash', 'remoteRevisionHash', 'revisionHash', 'postStateHash']);
    row.targetNameHash = targetNameHashFromMaterialization(materialization);
    row.predicateVersion = cleanString(row.predicateVersion) || 'h2o.folder-sync.rename-predicate.v1';
    return row;
  }

  function blocked(output) {
    var row = safeObject(output);
    return row.ok !== true && codeList(row.blockers).length > 0;
  }

  async function runMaterialization(entry, localName) {
    return safeObject(await H2O.Desktop.Sync.checkRenameMaterialization({
      plannerEntry: entry,
      proposedName: localName
    }));
  }

  async function runPreflight(entry, localName) {
    return safeObject(await H2O.Desktop.Sync.runRenameConvergencePreflight({
      plannerEntry: entry,
      proposedName: localName
    }));
  }

  function mismatchName(localName) {
    return cleanString(localName) + ' proof mismatch';
  }

  async function hashMismatchProof(entry, localName, result) {
    try {
      var output = await runMaterialization(entry, mismatchName(localName));
      result.negativeProofs.hashMismatchBlocked = blocked(output) &&
        codeList(output.blockers).indexOf('target-name-hash-mismatch') !== -1;
      if (!result.negativeProofs.hashMismatchBlocked) addCode(result.blockers, 'hash-mismatch-negative-proof-not-blocked');
    } catch (_) {
      addCode(result.blockers, 'hash-mismatch-negative-proof-failed');
    }
  }

  function withMoveConflict(entry) {
    var clone = Object.assign({}, safeObject(entry));
    clone.changedFields = ['name', 'parent'];
    clone.parentSubjectId = clone.parentSubjectId || clone.localParentSubjectId || 'proof-parent-change';
    return clone;
  }

  async function renameVsMoveProof(entry, localName, result) {
    try {
      var output = await runPreflight(withMoveConflict(entry), localName);
      result.negativeProofs.renameVsMoveBlocked = blocked(output) &&
        codeList(output.blockers).indexOf('rename-vs-move') !== -1;
      if (!result.negativeProofs.renameVsMoveBlocked) addCode(result.blockers, 'rename-vs-move-negative-proof-not-blocked');
    } catch (_) {
      addCode(result.blockers, 'rename-vs-move-negative-proof-failed');
    }
  }

  function withDeleteConflict(entry) {
    var clone = Object.assign({}, safeObject(entry));
    clone.deleted = true;
    clone.deletedState = 'deleted';
    clone.conflictKind = 'rename-vs-delete';
    return clone;
  }

  async function renameVsDeleteProof(entry, localName, result) {
    try {
      var output = await runPreflight(withDeleteConflict(entry), localName);
      result.negativeProofs.renameVsDeleteBlocked = blocked(output) &&
        codeList(output.blockers).indexOf('rename-vs-delete') !== -1;
      if (!result.negativeProofs.renameVsDeleteBlocked) addCode(result.blockers, 'rename-vs-delete-negative-proof-not-blocked');
    } catch (_) {
      addCode(result.blockers, 'rename-vs-delete-negative-proof-failed');
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

  async function resolveSubject(entry, rows) {
    var subjectId = cleanString(entry.subjectId).toLowerCase();
    if (!isSha256Hex(subjectId)) return { row: null, id: '' };
    for (var i = 0; i < rows.length; i += 1) {
      var row = safeObject(rows[i]);
      var id = rowId(row);
      if (!id) continue;
      var hashed = await sha256Hex(SUBJECT_TYPE + ':' + id);
      if (hashed === subjectId) return { row: row, id: id };
    }
    return { row: null, id: '' };
  }

  async function duplicateSiblingName(entry, options, warnings) {
    var explicit = cleanString(options.duplicateSiblingName);
    if (explicit) return explicit;
    var rows = await readFolderRows(warnings);
    var target = await resolveSubject(entry, rows);
    if (!target.row || !target.id) return '';
    var parent = rowParentId(target.row);
    for (var i = 0; i < rows.length; i += 1) {
      var row = safeObject(rows[i]);
      var id = rowId(row);
      if (!id || id === target.id) continue;
      if (rowParentId(row) !== parent) continue;
      var sibling = normalizeName(rowName(row));
      if (sibling) return sibling;
    }
    return '';
  }

  async function duplicateSiblingProof(entry, options, result) {
    try {
      var sibling = await duplicateSiblingName(entry, options, result.warnings);
      if (!sibling) {
        addCode(result.blockers, 'duplicate-sibling-negative-fixture-unavailable');
        return;
      }
      var clone = Object.assign({}, safeObject(entry));
      clone.changedFields = ['name'];
      clone.targetNameHash = await sha256Hex(normalizeName(sibling));
      var output = await runPreflight(clone, sibling);
      result.negativeProofs.duplicateSiblingBlocked = blocked(output) &&
        codeList(output.blockers).indexOf('duplicate-folder-name') !== -1;
      if (!result.negativeProofs.duplicateSiblingBlocked) addCode(result.blockers, 'duplicate-sibling-negative-proof-not-blocked');
    } catch (_) {
      addCode(result.blockers, 'duplicate-sibling-negative-proof-failed');
    }
  }

  function requireApis(result) {
    var sync = H2O.Desktop.Sync;
    [
      'checkRenameMaterialization',
      'runRenameConvergencePreflight',
      'generateRenameProposalCandidate',
      'executeRenameConvergence',
      'buildRenameApplyEvent',
      'finalizeRenameConvergence'
    ].forEach(function (name) {
      if (!sync || typeof sync[name] !== 'function') addCode(result.blockers, name + '-unavailable');
    });
  }

  async function runRenameConvergenceProof(input) {
    var args = safeObject(input);
    var result = baseResult();
    requireApis(result);
    if (!webCryptoAvailable()) addCode(result.blockers, 'web-crypto-unavailable');

    var entry = await sourceEntry(args, result.blockers, result.warnings);
    var localName = localInputName(args, result.blockers);
    if (result.blockers.length) return finish(result);

    var materialization = null;
    var preflight = null;
    var candidate = null;
    var renameResult = null;
    var applyEventResult = null;
    var bookkeeping = null;

    try {
      materialization = await runMaterialization(entry, localName);
      result.materializationOk = materialization.ok === true &&
        materialization.hashMatches === true &&
        !!targetNameHashFromMaterialization(materialization);
      codeList(materialization.blockers).forEach(function (code) { addCode(result.blockers, code); });
      codeList(materialization.warnings).forEach(function (code) { addCode(result.warnings, code); });
    } catch (_) {
      addCode(result.blockers, 'rename-proof-materialization-failed');
    }
    if (!result.materializationOk) return finish(result);

    try {
      preflight = await runPreflight(entry, localName);
      result.preflightOk = preflight.ok === true && preflight.actionable === true;
      codeList(preflight.blockers).forEach(function (code) { addCode(result.blockers, code); });
      codeList(preflight.warnings).forEach(function (code) { addCode(result.warnings, code); });
    } catch (_) {
      addCode(result.blockers, 'rename-proof-preflight-failed');
    }
    if (!result.preflightOk) return finish(result);

    await hashMismatchProof(entry, localName, result);
    await duplicateSiblingProof(entry, args, result);
    await renameVsMoveProof(entry, localName, result);
    await renameVsDeleteProof(entry, localName, result);
    if (result.blockers.length) return finish(result);

    try {
      candidate = safeObject(await H2O.Desktop.Sync.generateRenameProposalCandidate({
        plannerEntry: entry,
        proposedName: localName,
        operatorApprovalToken: cleanString(H2O.Desktop.Sync.__renameProposalCandidateApprovalToken)
      }));
      result.candidateOk = candidate.ok === true &&
        safeObject(candidate.proposalCandidate).kind === 'proposal' &&
        !!cleanString(candidate.candidateId);
      codeList(candidate.blockers).forEach(function (code) { addCode(result.blockers, code); });
      codeList(candidate.warnings).forEach(function (code) { addCode(result.warnings, code); });
    } catch (_) {
      addCode(result.blockers, 'rename-proof-candidate-generation-failed');
    }
    if (!result.candidateOk) return finish(result);

    try {
      renameResult = safeObject(await H2O.Desktop.Sync.executeRenameConvergence({
        plannerEntry: entry,
        proposedName: localName,
        operatorApprovalToken: cleanString(H2O.Desktop.Sync.__renameConvergenceApprovalToken)
      }));
      result.renameOk = renameResult.ok === true && renameResult.renamed === true;
      codeList(renameResult.blockers).forEach(function (code) { addCode(result.blockers, code); });
      codeList(renameResult.warnings).forEach(function (code) { addCode(result.warnings, code); });
    } catch (_) {
      addCode(result.blockers, 'rename-proof-local-rename-failed');
    }
    if (!result.renameOk) return finish(result);

    var enriched = enrichRenameResult(renameResult, entry, materialization);
    try {
      applyEventResult = safeObject(await H2O.Desktop.Sync.buildRenameApplyEvent({ renameResult: enriched }));
      result.applyEventOk = applyEventResult.ok === true &&
        safeObject(applyEventResult.applyEvent).kind === 'applyEvent';
      codeList(applyEventResult.blockers).forEach(function (code) { addCode(result.blockers, code); });
      codeList(applyEventResult.warnings).forEach(function (code) { addCode(result.warnings, code); });
    } catch (_) {
      addCode(result.blockers, 'rename-proof-applyEvent-failed');
    }
    if (!result.applyEventOk) return finish(result);

    try {
      bookkeeping = safeObject(await H2O.Desktop.Sync.finalizeRenameConvergence({ renameResult: enriched }));
      result.consumedOk = bookkeeping.ok === true && isObject(bookkeeping.consumedRow);
      result.watermarkOk = bookkeeping.ok === true && isObject(bookkeeping.watermarkRow);
      codeList(bookkeeping.blockers).forEach(function (code) { addCode(result.blockers, code); });
      codeList(bookkeeping.warnings).forEach(function (code) { addCode(result.warnings, code); });
    } catch (_) {
      addCode(result.blockers, 'rename-proof-bookkeeping-failed');
    }

    return finish(result);
  }

  H2O.Desktop.Sync.runRenameConvergenceProof = runRenameConvergenceProof;
  H2O.Desktop.Sync.__renameConvergenceProofInstalled = true;
  H2O.Desktop.Sync.__renameConvergenceProofVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
