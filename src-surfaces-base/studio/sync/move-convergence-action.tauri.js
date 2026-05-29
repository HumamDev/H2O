/* H2O Desktop Sync - F11.0.4a local move convergence action
 *
 * Desktop/Tauri-only operator-approved convergence action for exactly one
 * move/reparent-only planner entry.
 *
 * Safety invariants:
 *   - Move only. No rename, create, delete, folderBinding changes, batch
 *     operations, publication, enqueue/upload/download, applyEvent, watermark
 *     writes, consumed-ledger writes, convergence bookkeeping, WebDAV, remote
 *     apply, automatic merge, or mobile write-back.
 *   - The action first runs F11.0.2 read-only preflight and requires
 *     actionable === true before one local parent update.
 *   - The only domain mutation is one H2O.Studio.store.folders.patch()
 *     call that changes parentId. Output is redacted: parent hashes only.
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
  if (H2O.Desktop.Sync.__moveConvergenceInstalled) return;

  var SCHEMA = 'h2o.desktop.sync.move-convergence-action.v1';
  var VERSION = '0.1.0-f11.0.4a';
  var APPROVAL_TOKEN = 'I_APPROVE_LOCAL_MOVE_CONVERGENCE';
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

  function isSha256Hex(value) {
    return /^[0-9a-f]{64}$/.test(cleanString(value));
  }

  function isStateHash(value) {
    var text = cleanString(value);
    return (text.length === 8 || text.length === 64) && /^[0-9a-fA-F]+$/.test(text);
  }

  function nowIsoSeconds() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
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

  function fnv1a32Hex(input) {
    var text = String(input || '');
    var hash = 0x811c9dc5;
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return ('00000000' + hash.toString(16)).slice(-8);
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

  function normalizeNumber(value) {
    if (value == null || value === '') return null;
    var num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function normalizeColor(value) {
    var color = cleanString(value);
    return color ? color.toLowerCase() : '';
  }

  function normalizeName(value) {
    var raw = String(value == null ? '' : value);
    return raw.normalize ? raw.normalize('NFC').trim() : raw.trim();
  }

  function localFolderHash(row) {
    if (!isObject(row)) return '';
    var metaValue = firstPresent(row, ['meta', 'meta_json']);
    var metaPresent = isObject(metaValue)
      ? Object.keys(metaValue).length > 0
      : !!cleanString(metaValue);
    return fnv1a32Hex(canonicalJson({
      name: firstString(row, ['name', 'title', 'folderName']) || null,
      parentId: cleanString(firstPresent(row, ['parentId', 'parentFolderId', 'parent_id'])),
      color: firstString(row, ['color', 'iconColor', 'folderColor', 'accentColor']) || null,
      icon: firstString(row, ['icon', 'iconKey']) || null,
      sortOrder: normalizeNumber(firstPresent(row, ['sortOrder', 'index', 'position'])),
      kind: firstString(row, ['kind']) || null,
      source: firstString(row, ['source']) || null,
      metaPresent: !!metaPresent
    }));
  }

  async function canonicalFolderHash(row) {
    if (!isObject(row)) return '';
    return sha256Hex(canonicalJson({
      name: firstString(row, ['name', 'title', 'folderName']) || null,
      parentId: cleanString(firstPresent(row, ['parentId', 'parentFolderId', 'parent_id'])) || null,
      color: normalizeColor(firstString(row, ['iconColor', 'icon_color'])) ||
        normalizeColor(firstString(row, ['color', 'folderColor', 'accentColor'])) || null,
      icon: firstString(row, ['icon', 'iconKey']) || null,
      sortOrder: normalizeNumber(firstPresent(row, ['sortOrder', 'index', 'position'])),
      kind: firstString(row, ['kind']) || null,
      source: firstString(row, ['source']) || null
    }));
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

  function isLiveFolder(row) {
    var r = safeObject(row);
    if (r.deleted === true || r.isDeleted === true || r.tombstoned === true) return false;
    if (firstString(r, ['deletedAt', 'deleted_at', 'removedAt', 'removed_at'])) return false;
    if (firstString(r, ['tombstoneId', 'tombstone_id'])) return false;
    return true;
  }

  function foldersApi() {
    return H2O.Studio && H2O.Studio.store && H2O.Studio.store.folders;
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
    var rows = await callMaybe(foldersApi(), ['list', 'getAll', 'listFolders']);
    if (rows.length) return rows;
    addCode(warnings, 'folder-row-source-unavailable');
    return [];
  }

  async function folderSubjectId(id) {
    return sha256Hex(SUBJECT_TYPE + ':' + cleanString(id));
  }

  async function parentSubjectId(parentId) {
    var id = cleanString(parentId);
    return id ? sha256Hex(SUBJECT_TYPE + ':' + id) : '';
  }

  async function buildTreeIndex(rows, blockers) {
    var byId = {};
    var bySubject = {};
    var children = {};
    for (var i = 0; i < rows.length; i += 1) {
      var row = safeObject(rows[i]);
      var id = rowId(row);
      if (!id) continue;
      if (byId[id]) addCode(blockers, 'duplicate-local-folder-id');
      byId[id] = row;
      var subjectId = await folderSubjectId(id);
      if (subjectId) bySubject[subjectId] = row;
      var parent = rowParentId(row);
      if (!children[parent]) children[parent] = [];
      children[parent].push(row);
    }
    return { byId: byId, bySubject: bySubject, children: children };
  }

  function resolveSubject(subjectId, index) {
    var id = cleanString(subjectId).toLowerCase();
    return isSha256Hex(id) ? safeObject(index.bySubject[id]) : {};
  }

  function nestedObjects(entry) {
    var row = safeObject(entry);
    var payload = safeObject(row.payload);
    var preview = safeObject(payload.proposalPreview);
    return [
      row,
      safeObject(row.expectedPostState),
      safeObject(row.proposedOperation),
      safeObject(row.moveMaterialization),
      safeObject(row.remoteState),
      safeObject(row.structural),
      safeObject(payload.expectedPostState),
      safeObject(payload.proposedOperation),
      safeObject(preview.expectedPostState),
      safeObject(preview.proposedOperation),
      safeObject(preview.moveMaterialization)
    ];
  }

  function directParentSpec(obj, keys) {
    var row = safeObject(obj);
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
      var raw = row[key];
      var text = cleanString(raw).toLowerCase();
      if (raw == null || text === '' || text === 'root' || text === 'null') {
        return { present: true, root: true, subjectId: '' };
      }
      return { present: true, root: false, subjectId: cleanString(raw).toLowerCase() };
    }
    return { present: false, root: false, subjectId: '' };
  }

  function targetParentSpec(entry) {
    var objects = nestedObjects(entry);
    var keys = [
      'toParentSubjectId',
      'targetParentSubjectId',
      'newParentSubjectId',
      'expectedParentSubjectId',
      'parentSubjectId'
    ];
    for (var i = 0; i < objects.length; i += 1) {
      var spec = directParentSpec(objects[i], keys);
      if (spec.present) return spec;
    }
    return { present: false, root: false, subjectId: '' };
  }

  function sourceParentSpec(entry) {
    var objects = [
      safeObject(entry),
      safeObject(entry.localState),
      safeObject(entry.baseState),
      safeObject(entry.localStructural),
      safeObject(entry.baseStructural)
    ];
    var keys = [
      'fromParentSubjectId',
      'sourceParentSubjectId',
      'baseParentSubjectId',
      'localParentSubjectId',
      'currentParentSubjectId'
    ];
    for (var i = 0; i < objects.length; i += 1) {
      var spec = directParentSpec(objects[i], keys);
      if (spec.present) return spec;
    }
    return { present: false, root: false, subjectId: '' };
  }

  function entryFromInput(input) {
    var args = safeObject(input);
    return safeObject(args.plannerEntry || args.entry || args.candidate);
  }

  function entrySubject(entry) {
    return cleanString(entry.subjectId).toLowerCase();
  }

  function entryLineage(entry) {
    return cleanString(entry.lineageId);
  }

  function entryBaseHash(entry) {
    return cleanString(entry.baseHash || entry.localRevisionHash).toLowerCase();
  }

  function entryTargetHash(entry) {
    return cleanString(entry.targetHash || entry.remoteRevisionHash || entry.revisionHash).toLowerCase();
  }

  function entryChangedFields(entry) {
    return asArray(entry.changedFields).map(cleanString).filter(Boolean).sort();
  }

  function moveOnly(entry) {
    var fields = entryChangedFields(entry);
    return fields.length === 1 && (fields[0] === 'parent' || fields[0] === 'parentId');
  }

  function hashMatches(expected, canonical, local) {
    var exp = cleanString(expected).toLowerCase();
    if (!exp) return false;
    return exp === cleanString(canonical).toLowerCase() || exp === cleanString(local).toLowerCase();
  }

  function walkAncestors(startId, index, blockers, codePrefix) {
    var current = cleanString(startId);
    var seen = {};
    var depth = 0;
    while (current) {
      if (seen[current]) {
        addCode(blockers, codePrefix + '-cycle-detected');
        return { complete: false, cycle: true, depth: depth };
      }
      seen[current] = true;
      var row = index.byId[current];
      if (!row) {
        addCode(blockers, codePrefix + '-ancestor-walk-incomplete');
        return { complete: false, cycle: false, depth: depth };
      }
      if (!isLiveFolder(row)) {
        addCode(blockers, codePrefix + '-ancestor-not-live');
        return { complete: false, cycle: false, depth: depth };
      }
      depth += 1;
      if (depth > MAX_FOLDER_TREE_DEPTH) {
        addCode(blockers, codePrefix + '-depth-exceeded');
        return { complete: false, cycle: false, depth: depth };
      }
      current = rowParentId(row);
    }
    return { complete: true, cycle: false, depth: depth };
  }

  function collectDescendants(subjectLocalId, index, blockers) {
    var rootId = cleanString(subjectLocalId);
    var seen = {};
    var queue = asArray(index.children[rootId]).slice();
    var maxDepth = 0;
    while (queue.length) {
      var item = safeObject(queue.shift());
      var id = rowId(item);
      var depth = Number(item.__h2oMoveDepth || 1);
      if (!id) continue;
      if (seen[id]) {
        addCode(blockers, 'descendant-cycle-detected');
        return { complete: false, set: seen, maxDepth: maxDepth };
      }
      seen[id] = true;
      if (!isLiveFolder(item)) addCode(blockers, 'descendant-not-live');
      if (depth > maxDepth) maxDepth = depth;
      if (depth > MAX_FOLDER_TREE_DEPTH) {
        addCode(blockers, 'descendant-depth-exceeded');
        return { complete: false, set: seen, maxDepth: depth };
      }
      var children = asArray(index.children[id]);
      for (var i = 0; i < children.length; i += 1) {
        queue.push(Object.assign({}, safeObject(children[i]), { __h2oMoveDepth: depth + 1 }));
      }
    }
    return { complete: true, set: seen, maxDepth: maxDepth };
  }

  async function parentStable(subjectRow, sourceSpec, blockers) {
    if (!sourceSpec.present) {
      addCode(blockers, 'source-parent-baseline-unavailable');
      return false;
    }
    var currentParentSubject = await parentSubjectId(rowParentId(subjectRow));
    if (sourceSpec.root) {
      if (currentParentSubject !== '') addCode(blockers, 'source-parent-changed');
      return currentParentSubject === '';
    }
    if (!isSha256Hex(sourceSpec.subjectId)) {
      addCode(blockers, 'source-parent-subject-invalid');
      return false;
    }
    if (currentParentSubject !== sourceSpec.subjectId) {
      addCode(blockers, 'source-parent-changed');
      return false;
    }
    return true;
  }

  function duplicateSiblingSafe(subjectRow, targetParentId, index, blockers) {
    var subjectLocalId = rowId(subjectRow);
    var subjectName = normalizeName(rowName(subjectRow));
    if (!subjectName) {
      addCode(blockers, 'subject-name-unavailable');
      return false;
    }
    var siblings = asArray(index.children[cleanString(targetParentId)]);
    for (var i = 0; i < siblings.length; i += 1) {
      var row = safeObject(siblings[i]);
      var id = rowId(row);
      if (!id || id === subjectLocalId) continue;
      if (normalizeName(rowName(row)) === subjectName) {
        addCode(blockers, 'duplicate-folder-name');
        return false;
      }
    }
    return true;
  }

  async function currentParentSubjectOutput(subjectRow) {
    var current = await parentSubjectId(rowParentId(subjectRow));
    return current ? current : null;
  }

  function targetParentSubjectOutput(targetSpec) {
    if (targetSpec.root) return null;
    return cleanString(targetSpec.subjectId).toLowerCase();
  }

  function projectedRow(row, targetParentId) {
    var out = Object.assign({}, safeObject(row));
    out.parentId = cleanString(targetParentId) || null;
    return out;
  }

  function failure(blockers, warnings) {
    return {
      schema: SCHEMA,
      ok: false,
      moved: false,
      subjectId: null,
      lineageId: null,
      preStateHash: null,
      postStateHash: null,
      fromParentSubjectId: null,
      toParentSubjectId: null,
      blockers: codeList(blockers),
      warnings: codeList(warnings)
    };
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

  async function runPreflight(entry, blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.runMoveConvergencePreflight !== 'function') {
      addCode(blockers, 'move-convergence-preflight-unavailable');
      return null;
    }
    var preflight = null;
    try {
      preflight = safeObject(await sync.runMoveConvergencePreflight({ plannerEntry: entry }));
    } catch (_) {
      addCode(blockers, 'move-convergence-preflight-failed');
      return null;
    }
    codeList(preflight.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(preflight.warnings).forEach(function (code) { addCode(warnings, code); });
    if (preflight.actionable !== true) addCode(blockers, 'move-preflight-not-actionable');
    if (preflight.cycleSafe !== true) addCode(blockers, 'cycle-risk');
    if (preflight.orphanSafe !== true) addCode(blockers, 'orphan-risk');
    if (preflight.depthSafe !== true) addCode(blockers, 'tree-depth-limit-exceeded');
    if (preflight.duplicateSiblingSafe !== true) addCode(blockers, 'duplicate-folder-name');
    if (preflight.parentStable !== true) addCode(blockers, 'parent-not-stable');
    if (preflight.watermarkSafe !== true) addCode(blockers, 'watermark-not-safe');
    if (preflight.replaySafe !== true) addCode(blockers, 'replay-not-safe');
    if (preflight.consumedSafe !== true) addCode(blockers, 'consumed-operation-not-safe');
    return preflight;
  }

  async function resolveMove(entry, rows, blockers) {
    var index = await buildTreeIndex(rows, blockers);
    var subjectRow = resolveSubject(entrySubject(entry), index);
    var subjectLocalId = rowId(subjectRow);
    var targetSpec = targetParentSpec(entry);
    var sourceSpec = sourceParentSpec(entry);
    var targetParentRow = {};
    var targetParentId = '';

    if (!subjectLocalId) addCode(blockers, 'subject-not-resolved');
    else if (!isLiveFolder(subjectRow)) addCode(blockers, 'subject-not-live');

    if (!targetSpec.present) addCode(blockers, 'target-parent-unavailable');
    if (targetSpec.present && targetSpec.root) {
      targetParentId = '';
    } else if (targetSpec.present && isSha256Hex(targetSpec.subjectId)) {
      targetParentRow = resolveSubject(targetSpec.subjectId, index);
      targetParentId = rowId(targetParentRow);
      if (!targetParentId) addCode(blockers, 'target-parent-not-resolved');
      else if (!isLiveFolder(targetParentRow)) addCode(blockers, 'target-parent-not-live');
    } else if (targetSpec.present) {
      addCode(blockers, 'target-parent-subject-invalid');
    }

    return {
      index: index,
      subjectRow: subjectRow,
      subjectLocalId: subjectLocalId,
      sourceSpec: sourceSpec,
      targetSpec: targetSpec,
      targetParentRow: targetParentRow,
      targetParentId: targetParentId
    };
  }

  async function validateTreeState(state, blockers) {
    var subjectRow = safeObject(state.subjectRow);
    var subjectLocalId = cleanString(state.subjectLocalId);
    var targetSpec = safeObject(state.targetSpec);
    var targetParentId = cleanString(state.targetParentId);
    var sourceWalk = walkAncestors(rowParentId(subjectRow), state.index, blockers, 'source-parent');
    var targetWalk = targetSpec.root
      ? { complete: true, cycle: false, depth: 0 }
      : walkAncestors(targetParentId, state.index, blockers, 'target-parent');
    var descendants = collectDescendants(subjectLocalId, state.index, blockers);

    var selfParent = targetParentId && targetParentId === subjectLocalId;
    if (selfParent) addCode(blockers, 'self-parent');
    var descendantParent = !!(targetParentId && descendants.set[targetParentId]);
    if (descendantParent) addCode(blockers, 'descendant-parent');

    var orphanSafe = isLiveFolder(subjectRow) &&
      (targetSpec.root || isLiveFolder(state.targetParentRow)) &&
      sourceWalk.complete === true &&
      targetWalk.complete === true &&
      descendants.complete === true;
    var cycleSafe = sourceWalk.cycle === false &&
      targetWalk.cycle === false &&
      descendants.complete === true &&
      selfParent === false &&
      descendantParent === false;
    var resultingDepth = targetWalk.complete ? targetWalk.depth + 1 + descendants.maxDepth : Infinity;
    var depthSafe = Number.isFinite(resultingDepth) && resultingDepth <= MAX_FOLDER_TREE_DEPTH;
    var duplicateSafe = duplicateSiblingSafe(subjectRow, targetParentId, state.index, blockers);

    if (!orphanSafe) addCode(blockers, 'orphan-risk');
    if (!cycleSafe) addCode(blockers, 'cycle-risk');
    if (!depthSafe) addCode(blockers, 'tree-depth-limit-exceeded');
    if (!duplicateSafe) addCode(blockers, 'duplicate-folder-name');

    return {
      orphanSafe: orphanSafe,
      cycleSafe: cycleSafe,
      depthSafe: depthSafe,
      duplicateSiblingSafe: duplicateSafe
    };
  }

  async function executeMoveConvergence(input) {
    var args = safeObject(input);
    var entry = entryFromInput(args);
    var blockers = [];
    var warnings = [];

    if (!webCryptoAvailable()) addCode(blockers, 'web-crypto-unavailable');
    if (cleanString(args.operatorApprovalToken) !== APPROVAL_TOKEN) {
      addCode(blockers, 'operator-approval-token-required');
    }
    if (!isSha256Hex(entrySubject(entry))) addCode(blockers, 'subjectId-invalid');
    if (!entryLineage(entry)) addCode(blockers, 'lineage-id-required');
    if (!isStateHash(entryBaseHash(entry))) addCode(blockers, 'baseHash-unavailable');
    if (!isStateHash(entryTargetHash(entry))) addCode(blockers, 'targetHash-unavailable');
    if (!moveOnly(entry)) addCode(blockers, 'field-not-allowlisted');

    await runPreflight(entry, blockers, warnings);

    var api = foldersApi();
    if (!api || typeof api.patch !== 'function' || typeof api.get !== 'function') {
      addCode(blockers, 'local-folder-move-unavailable');
    }

    var preRows = [];
    var resolved = null;
    var fromParentSubjectId = null;
    var toParentSubjectId = null;
    var preCanonicalHash = '';
    var preLocalHash = '';
    var projectedCanonicalHash = '';
    var projectedLocalHash = '';

    if (!blockers.length) {
      preRows = await readFolderRows(warnings);
      resolved = await resolveMove(entry, preRows, blockers);
    }
    if (!blockers.length) {
      fromParentSubjectId = await currentParentSubjectOutput(resolved.subjectRow);
      toParentSubjectId = targetParentSubjectOutput(resolved.targetSpec);
      var entrySourceSpec = sourceParentSpec(entry);
      if (entrySourceSpec.root && fromParentSubjectId !== null) addCode(blockers, 'source-parent-changed');
      if (!entrySourceSpec.root && cleanString(entrySourceSpec.subjectId).toLowerCase() !== cleanString(fromParentSubjectId).toLowerCase()) {
        addCode(blockers, 'source-parent-changed');
      }
      if (cleanString(rowParentId(resolved.subjectRow)) === cleanString(resolved.targetParentId)) {
        addCode(blockers, 'target-parent-already-current');
      }
      if (await parentStable(resolved.subjectRow, resolved.sourceSpec, blockers) !== true) {
        addCode(blockers, 'parent-not-stable');
      }
      await validateTreeState(resolved, blockers);
    }
    if (!blockers.length) {
      preCanonicalHash = await canonicalFolderHash(resolved.subjectRow);
      preLocalHash = localFolderHash(resolved.subjectRow);
      if (!hashMatches(entryBaseHash(entry), preCanonicalHash, preLocalHash)) {
        addCode(blockers, 'baseline-hash-mismatch');
      }

      var projected = projectedRow(resolved.subjectRow, resolved.targetParentId);
      projectedCanonicalHash = await canonicalFolderHash(projected);
      projectedLocalHash = localFolderHash(projected);
      if (!hashMatches(entryTargetHash(entry), projectedCanonicalHash, projectedLocalHash)) {
        addCode(blockers, 'target-hash-mismatch');
      }
    }

    if (blockers.length) return failure(blockers, warnings);

    var patchedRow = null;
    try {
      patchedRow = await Promise.resolve(api.patch(resolved.subjectLocalId, {
        parentId: cleanString(resolved.targetParentId) || null
      }));
    } catch (_) {
      addCode(blockers, 'local-move-failed');
      return failure(blockers, warnings);
    }
    if (!patchedRow) {
      addCode(blockers, 'local-move-failed');
      return failure(blockers, warnings);
    }

    var postRows = await readFolderRows(warnings);
    var postResolved = await resolveMove(entry, postRows, blockers);
    var postSubject = safeObject(postResolved && postResolved.subjectRow);
    if (!rowId(postSubject)) addCode(blockers, 'local-move-verification-failed');
    if (rowParentId(postSubject) !== cleanString(resolved.targetParentId)) {
      addCode(blockers, 'local-move-verification-failed');
    }
    await validateTreeState(postResolved, blockers);
    var postCanonicalHash = await canonicalFolderHash(postSubject);
    var postLocalHash = localFolderHash(postSubject);
    if (!hashMatches(entryTargetHash(entry), postCanonicalHash, postLocalHash)) {
      addCode(blockers, 'post-state-hash-mismatch');
    }
    if (blockers.length) return failure(blockers, warnings);

    var result = {
      schema: SCHEMA,
      ok: true,
      moved: true,
      subjectId: entrySubject(entry),
      lineageId: entryLineage(entry),
      preStateHash: entryBaseHash(entry),
      postStateHash: entryTargetHash(entry),
      fromParentSubjectId: fromParentSubjectId,
      toParentSubjectId: toParentSubjectId,
      generatedAtIso: nowIsoSeconds(),
      localOnly: true,
      blockers: [],
      warnings: codeList(warnings)
    };
    var forbidden = foreverNoKey(result);
    if (forbidden) {
      return failure(['move-convergence-result-contains-forbidden-field'], ['blocked-forbidden-key-' + forbidden]);
    }
    return result;
  }

  H2O.Desktop.Sync.executeMoveConvergence = executeMoveConvergence;
  H2O.Desktop.Sync.__moveConvergenceInstalled = true;
  H2O.Desktop.Sync.__moveConvergenceVersion = VERSION;
  H2O.Desktop.Sync.__moveConvergenceApprovalToken = APPROVAL_TOKEN;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
