/* H2O Desktop Sync - F13.0.2 binding materialization diagnostic
 *
 * Desktop/Tauri-only read-only diagnostic for determining whether a folder
 * binding candidate can be safely materialized against local state.
 *
 * Safety invariants:
 *   - Diagnostics only. No binding, apply, convergence, publication, enqueue,
 *     upload/download, WebDAV, timers, polling, or mobile write-back.
 *   - Raw chat IDs, folder IDs, names, titles, paths, URLs, and tokens are
 *     device-local only. Output is redacted hashes, booleans, and codes.
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
  if (H2O.Desktop.Sync.__bindingMaterializationInstalled) return;

  var SCHEMA = 'h2o.desktop.sync.binding-materialization-diagnostic.v1';
  var VERSION = '0.1.0-f13.0.2';
  var DB_URL = 'sqlite:studio-v1.db';
  var FOLDER_SUBJECT_TYPE = 'folder.metadata';
  var CHAT_SUBJECT_PREFIX = 'chat:';
  var POLICY_SINGLE = 'single-folder-per-chat';
  var POLICY_MULTI = 'multi-folder';
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

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function cleanLower(value) {
    return cleanString(value).toLowerCase();
  }

  function addCode(list, code) {
    var normalized = cleanString(code);
    if (!normalized || list.indexOf(normalized) !== -1) return;
    list.push(normalized);
  }

  function mergeCodes(target, source) {
    if (!Array.isArray(source)) return;
    for (var i = 0; i < source.length; i += 1) addCode(target, source[i]);
  }

  function isSha256Hex(value) {
    return /^[0-9a-f]{64}$/.test(cleanLower(value));
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

  function sqlSelect(query, values) {
    var invoke = getInvoke();
    if (!invoke) return Promise.reject(new Error('tauri invoke unavailable'));
    return invoke('plugin:sql|select', { db: DB_URL, query: query, values: values || [] });
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

  function firstNumber(row, keys) {
    var value = firstPresent(row, keys);
    var num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  function countFromRows(rows) {
    if (!Array.isArray(rows) || !rows.length) return 0;
    return firstNumber(rows[0], ['n', 'count', 'COUNT(*)', 'count(*)']);
  }

  function encodeRecordPart(value) {
    return encodeURIComponent(cleanString(value));
  }

  function uniqueStrings(values) {
    var out = [];
    for (var i = 0; i < values.length; i += 1) {
      var value = cleanString(values[i]);
      if (value && out.indexOf(value) === -1) out.push(value);
    }
    return out;
  }

  function isLiveFolder(row) {
    var r = safeObject(row);
    if (r.deleted === true || r.isDeleted === true || r.tombstoned === true) return false;
    if (firstString(r, ['deletedAt', 'deleted_at', 'removedAt', 'removed_at'])) return false;
    if (firstString(r, ['tombstoneId', 'tombstone_id'])) return false;
    return true;
  }

  function isLiveChat(row) {
    var r = safeObject(row);
    if (r.deleted === true || r.isDeleted === true || r.tombstoned === true) return false;
    if (firstNumber(r, ['is_deleted', 'isDeleted']) > 0) return false;
    if (firstString(r, ['deletedAt', 'deleted_at', 'removedAt', 'removed_at'])) return false;
    if (firstString(r, ['tombstoneId', 'tombstone_id'])) return false;
    return true;
  }

  async function folderSubjectId(id) {
    return sha256Hex(FOLDER_SUBJECT_TYPE + ':' + cleanString(id));
  }

  async function chatSubjectId(id) {
    return sha256Hex(CHAT_SUBJECT_PREFIX + cleanString(id));
  }

  async function readFolders(blockers) {
    try {
      var rows = await sqlSelect(
        'SELECT id, name, parent_id, color, sort_order, source, created_at, updated_at, meta_json FROM folders ORDER BY id',
        []
      );
      return Array.isArray(rows) ? rows : [];
    } catch (_) {
      addCode(blockers, 'folder-row-source-unavailable');
      return [];
    }
  }

  async function readChats(blockers) {
    try {
      var rows = await sqlSelect(
        'SELECT id, source_id, title, folder_id, is_deleted, meta_json FROM chats ORDER BY id',
        []
      );
      return Array.isArray(rows) ? rows : [];
    } catch (_) {
      addCode(blockers, 'chat-row-source-unavailable');
      return [];
    }
  }

  async function resolveFolder(folderHash, blockers) {
    var rows = await readFolders(blockers);
    var matches = [];
    var target = cleanLower(folderHash);
    for (var i = 0; i < rows.length; i += 1) {
      var row = safeObject(rows[i]);
      var id = firstString(row, ['id']);
      if (!id) continue;
      var subject = await folderSubjectId(id);
      if (subject === target) matches.push(row);
    }
    if (matches.length === 0) {
      addCode(blockers, 'folder-not-resolved');
      return { resolved: false, localId: '', live: false };
    }
    if (matches.length > 1) addCode(blockers, 'folder-resolution-ambiguous');
    var folder = safeObject(matches[0]);
    var live = isLiveFolder(folder);
    if (!live) addCode(blockers, 'folder-not-live');
    return {
      resolved: matches.length === 1,
      localId: firstString(folder, ['id']),
      live: live
    };
  }

  async function resolveChat(chatHash, blockers, warnings) {
    var rows = await readChats(blockers);
    var matches = [];
    var target = cleanLower(chatHash);
    for (var i = 0; i < rows.length; i += 1) {
      var row = safeObject(rows[i]);
      var rawIds = uniqueStrings([
        firstString(row, ['id']),
        firstString(row, ['source_id', 'sourceId'])
      ]);
      for (var j = 0; j < rawIds.length; j += 1) {
        var subject = await chatSubjectId(rawIds[j]);
        if (subject === target) {
          matches.push({ row: row, localIds: rawIds, matchedId: rawIds[j] });
          break;
        }
      }
    }
    if (matches.length === 0) {
      addCode(blockers, 'chat-not-resolved');
      return { resolved: false, localIds: [], live: false };
    }
    if (matches.length > 1) addCode(blockers, 'chat-resolution-ambiguous');
    var match = safeObject(matches[0]);
    var chat = safeObject(match.row);
    var live = isLiveChat(chat);
    if (!live) addCode(blockers, 'chat-not-live');
    if (firstString(chat, ['source_id', 'sourceId']) && match.matchedId === firstString(chat, ['source_id', 'sourceId'])) {
      addCode(warnings, 'chat-resolved-by-source-id');
    }
    return {
      resolved: matches.length === 1,
      localIds: Array.isArray(match.localIds) ? match.localIds : [],
      live: live
    };
  }

  function placeholders(count) {
    var out = [];
    for (var i = 0; i < count; i += 1) out.push('?');
    return out.join(', ');
  }

  async function tableExists(name) {
    var rows = await sqlSelect(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
      [name]
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  async function activeTombstoneExists(recordKind, recordIds, blockers) {
    var ids = uniqueStrings(recordIds);
    if (!ids.length) return true;
    try {
      if (!(await tableExists('sync_tombstones'))) {
        addCode(blockers, 'tombstone-check-unavailable');
        return true;
      }
      var rows = await sqlSelect(
        'SELECT tombstone_id FROM sync_tombstones WHERE record_kind = ? AND restored_at IS NULL AND record_id IN (' +
          placeholders(ids.length) +
          ') LIMIT 1',
        [recordKind].concat(ids)
      );
      return Array.isArray(rows) && rows.length > 0;
    } catch (_) {
      addCode(blockers, 'tombstone-check-unavailable');
      return true;
    }
  }

  async function countExactBinding(chatIds, folderId, blockers) {
    var ids = uniqueStrings(chatIds);
    if (!ids.length || !folderId) return 0;
    try {
      var rows = await sqlSelect(
        'SELECT COUNT(*) AS n FROM folder_bindings WHERE folder_id = ? AND chat_id IN (' +
          placeholders(ids.length) +
          ')',
        [folderId].concat(ids)
      );
      return countFromRows(rows);
    } catch (_) {
      addCode(blockers, 'binding-count-unavailable');
      return 0;
    }
  }

  async function countFoldersForChat(chatIds, blockers) {
    var ids = uniqueStrings(chatIds);
    if (!ids.length) return 0;
    try {
      var rows = await sqlSelect(
        'SELECT COUNT(*) AS n FROM folder_bindings WHERE chat_id IN (' + placeholders(ids.length) + ')',
        ids
      );
      return countFromRows(rows);
    } catch (_) {
      addCode(blockers, 'chat-binding-count-unavailable');
      return 0;
    }
  }

  function baseResult() {
    return {
      schema: SCHEMA,
      ok: false,
      bindingSubjectId: '',
      chatResolved: false,
      folderResolved: false,
      folderLive: false,
      chatLive: false,
      duplicateBinding: false,
      cardinalitySatisfied: false,
      tombstoneSafe: false,
      orphanSafe: false,
      blockers: [],
      warnings: []
    };
  }

  async function runIdentityDiagnostic(input, result) {
    var api = H2O.Desktop && H2O.Desktop.Sync;
    if (!api || typeof api.checkBindingIdentityAndCardinality !== 'function') {
      addCode(result.blockers, 'binding-identity-cardinality-diagnostic-unavailable');
      return {};
    }
    try {
      var identity = safeObject(await api.checkBindingIdentityAndCardinality(input));
      mergeCodes(result.blockers, identity.blockers);
      mergeCodes(result.warnings, identity.warnings);
      result.bindingSubjectId = isSha256Hex(identity.bindingSubjectId) ? cleanLower(identity.bindingSubjectId) : '';
      result.chatResolved = identity.chatResolved === true;
      result.folderResolved = identity.folderResolved === true;
      result.duplicateBinding = Number(identity.existingBindingCount) > 0;
      result.cardinalitySatisfied = identity.policySatisfied === true;
      return identity;
    } catch (_) {
      addCode(result.blockers, 'binding-identity-cardinality-diagnostic-failed');
      return {};
    }
  }

  function evaluateCardinality(identity, exactBindingCount, folderCountForChat, result) {
    var policy = cleanString(identity.cardinalityPolicy);
    result.duplicateBinding = exactBindingCount > 0 || result.duplicateBinding;
    if (result.duplicateBinding) addCode(result.blockers, 'duplicate-folder-binding');
    if (policy === POLICY_SINGLE) {
      if (folderCountForChat > 1) addCode(result.blockers, 'binding-cardinality-corrupt');
      if (folderCountForChat > exactBindingCount) {
        addCode(result.blockers, 'binding-cardinality-violation');
        result.cardinalitySatisfied = false;
        return;
      }
      result.cardinalitySatisfied = folderCountForChat === 0;
      return;
    }
    if (policy === POLICY_MULTI) {
      result.cardinalitySatisfied = exactBindingCount === 0;
      return;
    }
    result.cardinalitySatisfied = false;
    addCode(result.blockers, 'cardinality-policy-unverified');
  }

  async function checkBindingMaterialization(input) {
    var args = safeObject(input);
    var result = baseResult();
    var chatHash = cleanLower(args.chatSubjectId);
    var folderHash = cleanLower(args.folderSubjectId);

    if (!webCryptoAvailable()) addCode(result.blockers, 'webcrypto-unavailable');
    if (!getInvoke()) addCode(result.blockers, 'tauri-sql-unavailable');
    if (!isSha256Hex(chatHash)) addCode(result.blockers, 'invalid-chat-subject-id');
    if (!isSha256Hex(folderHash)) addCode(result.blockers, 'invalid-folder-subject-id');

    var identity = await runIdentityDiagnostic(args, result);

    var folder = { resolved: false, localId: '', live: false };
    var chat = { resolved: false, localIds: [], live: false };
    if (isSha256Hex(folderHash) && getInvoke()) {
      folder = await resolveFolder(folderHash, result.blockers);
      result.folderResolved = folder.resolved;
      result.folderLive = folder.resolved && folder.live;
    }
    if (isSha256Hex(chatHash) && getInvoke()) {
      chat = await resolveChat(chatHash, result.blockers, result.warnings);
      result.chatResolved = chat.resolved;
      result.chatLive = chat.resolved && chat.live;
    }

    var exactBindingCount = 0;
    var folderCountForChat = 0;
    if (folder.resolved && chat.resolved) {
      exactBindingCount = await countExactBinding(chat.localIds, folder.localId, result.blockers);
      folderCountForChat = await countFoldersForChat(chat.localIds, result.blockers);
      evaluateCardinality(identity, exactBindingCount, folderCountForChat, result);
    } else {
      result.cardinalitySatisfied = false;
    }

    var folderTombstoned = false;
    var chatTombstoned = false;
    var bindingTombstoned = false;
    if (folder.resolved && chat.resolved) {
      folderTombstoned = await activeTombstoneExists('folder', [
        folder.localId,
        'folder:' + encodeRecordPart(folder.localId)
      ], result.blockers);
      chatTombstoned = await activeTombstoneExists('chat', chat.localIds.concat(
        chat.localIds.map(function (id) { return 'chat:' + encodeRecordPart(id); })
      ), result.blockers);
      bindingTombstoned = await activeTombstoneExists('folderBinding', chat.localIds.map(function (id) {
        return 'folderBinding:' + encodeRecordPart(id) + ':' + encodeRecordPart(folder.localId);
      }), result.blockers);
    }

    if (folderTombstoned) addCode(result.blockers, 'folder-tombstoned');
    if (chatTombstoned) addCode(result.blockers, 'chat-tombstoned');
    if (bindingTombstoned) addCode(result.blockers, 'binding-tombstoned');
    result.tombstoneSafe = folder.resolved && chat.resolved &&
      !folderTombstoned && !chatTombstoned && !bindingTombstoned &&
      result.blockers.indexOf('tombstone-check-unavailable') === -1;

    result.orphanSafe = result.chatResolved && result.folderResolved &&
      result.chatLive && result.folderLive && result.tombstoneSafe;
    if (!result.orphanSafe) addCode(result.blockers, 'binding-would-be-orphaned');

    var forbidden = foreverNoKey(result);
    if (forbidden) addCode(result.blockers, 'forbidden-output-field:' + forbidden);
    result.ok = result.blockers.length === 0;
    return result;
  }

  H2O.Desktop.Sync.checkBindingMaterialization = checkBindingMaterialization;
  H2O.Desktop.Sync.__bindingMaterializationInstalled = true;
  H2O.Desktop.Sync.__bindingMaterializationVersion = VERSION;
})(typeof window !== 'undefined' ? window : globalThis);
