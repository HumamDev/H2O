/* H2O Desktop Sync - F12.0.1 delete materialization diagnostic
 *
 * Desktop/Tauri-only read-only diagnostic for determining whether a folder
 * delete candidate can legally enter convergence review.
 *
 * Safety invariants:
 *   - Diagnostics only. No delete, apply, convergence, publication, enqueue,
 *     upload/download, WebDAV, timers, polling, or mobile write-back.
 *   - F5 owns tombstones and destructive apply. This module only checks that
 *     the F5 tombstone capability appears available; it never mints one.
 *   - Output is redacted booleans/counts/codes only. It never returns raw
 *     folder IDs, parent IDs, folder names, chat IDs, paths, URLs, or tokens.
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
  if (H2O.Desktop.Sync.__deleteMaterializationInstalled) return;

  var SCHEMA = 'h2o.desktop.sync.delete-materialization-diagnostic.v1';
  var VERSION = '0.1.0-f12.0.1';
  var SUBJECT_TYPE = 'folder.metadata';
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

  function isStateHash(value) {
    var text = cleanString(value);
    return (text.length === 8 || text.length === 64) && /^[0-9a-fA-F]+$/.test(text);
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

  function normalizeNumber(value) {
    if (value == null || value === '') return null;
    var num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function normalizeColor(value) {
    var color = cleanString(value);
    return color ? color.toLowerCase() : '';
  }

  function normalizeFolderHash(row) {
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

  function hashMatches(expected, canonicalHash, localHash) {
    var want = cleanString(expected).toLowerCase();
    if (!isStateHash(want)) return false;
    return want === cleanString(canonicalHash).toLowerCase() ||
      want === cleanString(localHash).toLowerCase();
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

  function isLiveFolder(row) {
    var r = safeObject(row);
    if (r.deleted === true || r.isDeleted === true || r.tombstoned === true) return false;
    if (firstString(r, ['deletedAt', 'deleted_at', 'removedAt', 'removed_at'])) return false;
    if (firstString(r, ['tombstoneId', 'tombstone_id'])) return false;
    return true;
  }

  async function folderSubjectId(id) {
    return sha256Hex(SUBJECT_TYPE + ':' + cleanString(id));
  }

  async function buildFolderIndex(rows, blockers) {
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

  function entryFromInput(input) {
    var args = safeObject(input);
    return safeObject(args.plannerEntry || args.entry || args.candidate);
  }

  function entrySubject(entry) {
    return cleanString(entry.subjectId).toLowerCase();
  }

  function entryBaseHash(entry) {
    var payload = safeObject(entry.payload);
    var preview = safeObject(payload.proposalPreview);
    return cleanString(entry.baseHash ||
      entry.localRevisionHash ||
      entry.preStateHash ||
      entry.commonAncestorHash ||
      safeObject(entry.localState).revisionHash ||
      safeObject(entry.baseState).revisionHash ||
      safeObject(entry.proposedOperation).baseHash ||
      safeObject(payload.proposedOperation).baseHash ||
      preview.baseHash).toLowerCase();
  }

  function changedFields(entry) {
    return asArray(entry.changedFields).map(cleanString).filter(Boolean).sort();
  }

  function entryHasDeleteIntent(entry) {
    var bucket = cleanString(entry.bucket || entry.sourceBucket || entry.bucketName).toLowerCase();
    var reason = cleanString(entry.reason || entry.divergenceReason || entry.conflictKind).toLowerCase();
    var operation = cleanString(entry.operation || safeObject(entry.proposedOperation).operation).toLowerCase();
    var intent = cleanString(entry.operationIntent || safeObject(entry.proposedOperation).operationIntent).toLowerCase();
    var fields = changedFields(entry);
    if (bucket === 'deleted' || bucket === 'destructive' || bucket === 'delete') return true;
    if (reason.indexOf('delete') !== -1 && reason.indexOf('vs') === -1) return true;
    if (operation.indexOf('delete') !== -1 || intent === 'delete') return true;
    if (entry.deleted === true || entry.tombstoned === true) return true;
    return fields.length === 1 && (fields[0] === 'delete' || fields[0] === 'deleted' || fields[0] === 'tombstone');
  }

  function deleteVsEditConflict(entry) {
    var fields = changedFields(entry);
    var reason = cleanString(entry.reason || entry.divergenceReason || entry.conflictKind).toLowerCase();
    var blockers = codeList(entry.blockers).concat(codeList(entry.blockerCodes));
    var joinedBlockers = blockers.join(' ').toLowerCase();
    if (reason.indexOf('delete-vs') !== -1) return true;
    if (reason.indexOf('rename-vs-delete') !== -1 || reason.indexOf('move-vs-delete') !== -1) return true;
    if (joinedBlockers.indexOf('delete-vs-edit') !== -1 || joinedBlockers.indexOf('f5-blocker-present') !== -1) return true;
    return fields.some(function (field) {
      return ['name', 'parent', 'parentId', 'color', 'sortOrder', 'kind', 'source', 'binding'].indexOf(field) !== -1;
    });
  }

  async function countMemberships(folderId, blockers, warnings) {
    var storeFolders = H2O.Studio && H2O.Studio.store && H2O.Studio.store.folders;
    if (!storeFolders || typeof storeFolders.listChats !== 'function') {
      addCode(blockers, 'membership-count-unavailable');
      return null;
    }
    try {
      var rows = await Promise.resolve(storeFolders.listChats(folderId));
      if (!Array.isArray(rows)) {
        addCode(blockers, 'membership-count-unavailable');
        return null;
      }
      return rows.length;
    } catch (_) {
      addCode(blockers, 'membership-count-read-failed');
      addCode(warnings, 'membership-count-read-failed');
      return null;
    }
  }

  function countChildFolders(folderId, index) {
    var children = asArray(index.children[cleanString(folderId)]);
    var count = 0;
    for (var i = 0; i < children.length; i += 1) {
      if (isLiveFolder(children[i])) count += 1;
    }
    return count;
  }

  function tombstoneCapability() {
    var tombstones = H2O.Studio && H2O.Studio.store && H2O.Studio.store.tombstones;
    return !!(tombstones &&
      tombstones.__installed === true &&
      typeof tombstones.createTombstone === 'function' &&
      typeof tombstones.validateTombstone === 'function');
  }

  function baseResult() {
    return {
      schema: SCHEMA,
      ok: false,
      subjectResolved: false,
      folderExists: false,
      membershipCount: null,
      childFolderCount: null,
      emptyFolder: false,
      baseFresh: false,
      deleteVsEditConflict: false,
      recoveryReady: false,
      tombstoneCapable: false,
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
    out.ok = out.blockers.length === 0 &&
      out.subjectResolved === true &&
      out.folderExists === true &&
      out.emptyFolder === true &&
      out.baseFresh === true &&
      out.deleteVsEditConflict === false &&
      out.recoveryReady === true &&
      out.tombstoneCapable === true;
    var forbidden = foreverNoKey(out);
    if (forbidden) {
      out.ok = false;
      addCode(out.blockers, 'delete-materialization-output-contains-forbidden-field');
      addCode(out.warnings, 'blocked-forbidden-key-' + forbidden);
    }
    return out;
  }

  async function checkDeleteMaterialization(input) {
    var entry = entryFromInput(input);
    var blockers = [];
    var warnings = [];
    var flags = {
      subjectResolved: false,
      folderExists: false,
      membershipCount: null,
      childFolderCount: null,
      emptyFolder: false,
      baseFresh: false,
      deleteVsEditConflict: false,
      recoveryReady: false,
      tombstoneCapable: false
    };

    if (!webCryptoAvailable()) addCode(blockers, 'web-crypto-unavailable');
    if (!entryHasDeleteIntent(entry)) addCode(blockers, 'delete-intent-unavailable');
    var forbiddenInput = foreverNoKey(entry);
    if (forbiddenInput) {
      addCode(blockers, 'delete-entry-contains-forbidden-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbiddenInput);
    }

    var subjectId = entrySubject(entry);
    if (!isSha256Hex(subjectId)) addCode(blockers, 'subjectId-invalid');

    var baseHash = entryBaseHash(entry);
    if (!isStateHash(baseHash)) addCode(blockers, 'baseline-hash-not-verified');

    flags.deleteVsEditConflict = deleteVsEditConflict(entry);
    if (flags.deleteVsEditConflict) addCode(blockers, 'delete-vs-edit-conflict');

    flags.tombstoneCapable = tombstoneCapability();
    if (!flags.tombstoneCapable) addCode(blockers, 'f5-tombstone-path-unavailable');

    var rows = await readFolderRows(warnings);
    var index = await buildFolderIndex(rows, blockers);
    var subjectRow = resolveSubject(subjectId, index);
    var subjectLocalId = rowId(subjectRow);
    flags.subjectResolved = !!subjectLocalId;
    if (!flags.subjectResolved) addCode(blockers, 'subject-not-resolved');

    flags.folderExists = flags.subjectResolved === true && isLiveFolder(subjectRow);
    if (flags.subjectResolved && !flags.folderExists) addCode(blockers, 'folder-not-live');
    if (!flags.folderExists) addCode(blockers, 'folder-missing');

    if (!flags.folderExists) {
      return resultFrom(flags, blockers, warnings);
    }

    flags.membershipCount = await countMemberships(subjectLocalId, blockers, warnings);
    flags.childFolderCount = countChildFolders(subjectLocalId, index);

    if (flags.membershipCount !== 0) addCode(blockers, 'folder-membership-present');
    if (flags.childFolderCount !== 0) addCode(blockers, 'child-folder-present');
    flags.emptyFolder = flags.membershipCount === 0 && flags.childFolderCount === 0;
    if (!flags.emptyFolder) addCode(blockers, 'folder-not-empty');

    var canonicalHash = await canonicalFolderHash(subjectRow);
    var localHash = normalizeFolderHash(subjectRow);
    flags.baseFresh = hashMatches(baseHash, canonicalHash, localHash);
    if (!flags.baseFresh) addCode(blockers, 'baseline-hash-not-verified');

    flags.recoveryReady = flags.folderExists === true &&
      flags.baseFresh === true &&
      flags.tombstoneCapable === true &&
      isObject(subjectRow);
    if (!flags.recoveryReady) addCode(blockers, 'recovery-precondition-unmet');

    return resultFrom(flags, blockers, warnings);
  }

  H2O.Desktop.Sync.checkDeleteMaterialization = checkDeleteMaterialization;
  H2O.Desktop.Sync.__deleteMaterializationInstalled = true;
  H2O.Desktop.Sync.__deleteMaterializationVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
