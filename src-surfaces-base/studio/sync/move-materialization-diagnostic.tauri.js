/* H2O Desktop Sync - F11.0.1 move materialization diagnostic
 *
 * Desktop/Tauri-only read-only diagnostic for determining whether a proposed
 * folder move/reparent can be safely materialized against the local tree.
 *
 * Safety invariants:
 *   - Diagnostics only. No move, apply, convergence, publication, enqueue,
 *     upload/download, WebDAV, timers, polling, or mobile write-back.
 *   - Raw folder IDs and parent IDs are device-local only. Output is redacted:
 *     booleans, blocker codes, and warning codes only.
 *   - The target parent must be expressed as a redacted targetParentSubjectId,
 *     or as explicit null/root for move-to-root.
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
  if (H2O.Desktop.Sync.__moveMaterializationInstalled) return;

  var SCHEMA = 'h2o.desktop.sync.move-materialization-diagnostic.v1';
  var VERSION = '0.1.0-f11.0.1';
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

  function webCryptoAvailable() {
    try {
      return !!(global.crypto && global.crypto.subtle && global.crypto.subtle.digest);
    } catch (_) {
      return false;
    }
  }

  function bytesToHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i += 1) {
      var part = bytes[i].toString(16);
      hex += part.length === 1 ? '0' + part : part;
    }
    return hex;
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
    var rows = [];
    var storeFolders = H2O.Studio && H2O.Studio.store && H2O.Studio.store.folders;
    rows = await callMaybe(storeFolders, ['list', 'getAll', 'listFolders']);
    if (rows.length) return rows;

    var h2oFolders = H2O.folders || (H2O.Library && H2O.Library.Folders);
    rows = await callMaybe(h2oFolders, ['list', 'getAll', 'listFolders']);
    if (rows.length) return rows;

    try {
      if (h2oFolders && typeof h2oFolders.diagnose === 'function') {
        var diag = safeObject(h2oFolders.diagnose());
        var parity = safeObject(diag.folderParity);
        if (Array.isArray(parity.folders)) return parity.folders;
      }
    } catch (_) {
      addCode(warnings, 'folder-diagnostic-read-failed');
    }
    addCode(warnings, 'folder-row-source-unavailable');
    return [];
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

  function changedFields(entry) {
    return asArray(entry.changedFields).map(cleanString).filter(Boolean).sort();
  }

  function moveOnly(entry) {
    var fields = changedFields(entry);
    return fields.length === 1 && (fields[0] === 'parent' || fields[0] === 'parentId');
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

  function entryFromInput(input) {
    var args = safeObject(input);
    return safeObject(args.plannerEntry || args.entry || args.candidate);
  }

  function entrySubject(entry) {
    return cleanString(entry.subjectId).toLowerCase();
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
      'sourceParentSubjectId',
      'baseParentSubjectId',
      'localParentSubjectId',
      'currentParentSubjectId',
      'fromParentSubjectId'
    ];
    for (var i = 0; i < objects.length; i += 1) {
      var spec = directParentSpec(objects[i], keys);
      if (spec.present) return spec;
    }
    return { present: false, root: false, subjectId: '' };
  }

  function resolveSubject(subjectId, index) {
    var id = cleanString(subjectId).toLowerCase();
    return isSha256Hex(id) ? safeObject(index.bySubject[id]) : {};
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

  function collectDescendants(subjectId, index, blockers) {
    var rootId = cleanString(subjectId);
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
        var child = Object.assign({}, safeObject(children[i]), { __h2oMoveDepth: depth + 1 });
        queue.push(child);
      }
    }
    return { complete: true, set: seen, maxDepth: maxDepth };
  }

  async function parentStable(entry, subjectRow, sourceSpec, blockers) {
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
    var subjectId = rowId(subjectRow);
    var subjectName = normalizeName(rowName(subjectRow));
    if (!subjectName) {
      addCode(blockers, 'subject-name-unavailable');
      return false;
    }
    var siblings = asArray(index.children[cleanString(targetParentId)]);
    for (var i = 0; i < siblings.length; i += 1) {
      var row = safeObject(siblings[i]);
      var id = rowId(row);
      if (!id || id === subjectId) continue;
      if (normalizeName(rowName(row)) === subjectName) {
        addCode(blockers, 'duplicate-folder-name');
        return false;
      }
    }
    return true;
  }

  function resultFrom(flags, blockers, warnings) {
    var out = {
      schema: SCHEMA,
      ok: false,
      subjectResolved: flags.subjectResolved === true,
      parentResolved: flags.parentResolved === true,
      parentStable: flags.parentStable === true,
      orphanSafe: flags.orphanSafe === true,
      cycleSafe: flags.cycleSafe === true,
      depthSafe: flags.depthSafe === true,
      duplicateSiblingSafe: flags.duplicateSiblingSafe === true,
      blockers: codeList(blockers),
      warnings: codeList(warnings)
    };
    out.ok = out.blockers.length === 0 &&
      out.subjectResolved === true &&
      out.parentResolved === true &&
      out.parentStable === true &&
      out.orphanSafe === true &&
      out.cycleSafe === true &&
      out.depthSafe === true &&
      out.duplicateSiblingSafe === true;
    var forbidden = foreverNoKey(out);
    if (forbidden) {
      out.ok = false;
      addCode(out.blockers, 'move-materialization-output-contains-forbidden-field');
      addCode(out.warnings, 'blocked-forbidden-key-' + forbidden);
    }
    return out;
  }

  async function checkMoveMaterialization(input) {
    var entry = entryFromInput(input);
    var blockers = [];
    var warnings = [];
    var flags = {
      subjectResolved: false,
      parentResolved: false,
      parentStable: false,
      orphanSafe: false,
      cycleSafe: false,
      depthSafe: false,
      duplicateSiblingSafe: false
    };

    if (!webCryptoAvailable()) addCode(blockers, 'web-crypto-unavailable');
    if (!moveOnly(entry)) addCode(blockers, 'field-not-allowlisted');
    var forbiddenInput = foreverNoKey(entry);
    if (forbiddenInput) {
      addCode(blockers, 'move-entry-contains-forbidden-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbiddenInput);
    }

    var subjectId = entrySubject(entry);
    if (!isSha256Hex(subjectId)) addCode(blockers, 'subjectId-invalid');

    var targetSpec = targetParentSpec(entry);
    if (!targetSpec.present) addCode(blockers, 'target-parent-unavailable');
    if (targetSpec.present && !targetSpec.root && !isSha256Hex(targetSpec.subjectId)) {
      addCode(blockers, 'target-parent-subject-invalid');
    }

    var rows = await readFolderRows(warnings);
    var index = await buildTreeIndex(rows, blockers);
    var subjectRow = resolveSubject(subjectId, index);
    flags.subjectResolved = !!rowId(subjectRow);
    if (!flags.subjectResolved) addCode(blockers, 'subject-not-resolved');
    if (flags.subjectResolved && !isLiveFolder(subjectRow)) addCode(blockers, 'subject-not-live');

    var targetParentRow = {};
    var targetParentId = '';
    if (targetSpec.present && targetSpec.root) {
      flags.parentResolved = true;
    } else if (targetSpec.present && isSha256Hex(targetSpec.subjectId)) {
      targetParentRow = resolveSubject(targetSpec.subjectId, index);
      targetParentId = rowId(targetParentRow);
      flags.parentResolved = !!targetParentId;
      if (!flags.parentResolved) addCode(blockers, 'target-parent-not-resolved');
      if (flags.parentResolved && !isLiveFolder(targetParentRow)) addCode(blockers, 'target-parent-not-live');
    }

    if (!flags.subjectResolved || !flags.parentResolved) {
      return resultFrom(flags, blockers, warnings);
    }

    var subjectLocalId = rowId(subjectRow);
    var sourceSpec = sourceParentSpec(entry);
    flags.parentStable = await parentStable(entry, subjectRow, sourceSpec, blockers);

    var sourceWalk = walkAncestors(rowParentId(subjectRow), index, blockers, 'source-parent');
    var targetWalk = targetSpec.root
      ? { complete: true, cycle: false, depth: 0 }
      : walkAncestors(targetParentId, index, blockers, 'target-parent');
    var descendants = collectDescendants(subjectLocalId, index, blockers);

    var selfParent = targetParentId && targetParentId === subjectLocalId;
    if (selfParent) addCode(blockers, 'self-parent');
    var descendantParent = !!(targetParentId && descendants.set[targetParentId]);
    if (descendantParent) addCode(blockers, 'descendant-parent');

    flags.orphanSafe = isLiveFolder(subjectRow) &&
      (targetSpec.root || isLiveFolder(targetParentRow)) &&
      sourceWalk.complete === true &&
      targetWalk.complete === true &&
      descendants.complete === true;
    if (!flags.orphanSafe) addCode(blockers, 'orphan-risk');

    flags.cycleSafe = sourceWalk.cycle === false &&
      targetWalk.cycle === false &&
      descendants.complete === true &&
      selfParent === false &&
      descendantParent === false;
    if (!flags.cycleSafe) addCode(blockers, 'cycle-risk');

    var resultingDepth = targetWalk.complete ? targetWalk.depth + 1 + descendants.maxDepth : Infinity;
    flags.depthSafe = Number.isFinite(resultingDepth) && resultingDepth <= MAX_FOLDER_TREE_DEPTH;
    if (!flags.depthSafe) addCode(blockers, 'tree-depth-limit-exceeded');

    flags.duplicateSiblingSafe = duplicateSiblingSafe(subjectRow, targetParentId, index, blockers);

    return resultFrom(flags, blockers, warnings);
  }

  H2O.Desktop.Sync.checkMoveMaterialization = checkMoveMaterialization;
  H2O.Desktop.Sync.__moveMaterializationInstalled = true;
  H2O.Desktop.Sync.__moveMaterializationVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
