/* H2O Desktop Sync - F13.0.1 binding identity/cardinality diagnostic
 *
 * Desktop/Tauri-only read-only diagnostic for verifying canonical folder
 * binding identity generation and detecting the active chat-folder cardinality
 * policy before any binding convergence implementation exists.
 *
 * Safety invariants:
 *   - Diagnostics only. No binding, apply, convergence, publication, enqueue,
 *     upload/download, WebDAV, timers, polling, or mobile write-back.
 *   - Raw chat IDs, folder IDs, names, titles, paths, URLs, and tokens are
 *     device-local only. Output is redacted hashes, booleans, counts, and codes.
 *   - F13 canonical binding order is:
 *       sha256("folderBinding:" + chatSubjectId + ":" + folderSubjectId)
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
  if (H2O.Desktop.Sync.__bindingIdentityCardinalityInstalled) return;

  var SCHEMA = 'h2o.desktop.sync.binding-identity-cardinality-diagnostic.v1';
  var VERSION = '0.1.0-f13.0.1';
  var DB_URL = 'sqlite:studio-v1.db';
  var FOLDER_SUBJECT_TYPE = 'folder.metadata';
  var CHAT_SUBJECT_PREFIX = 'chat:';
  var BINDING_SUBJECT_PREFIX = 'folderBinding:';
  var POLICY_SINGLE = 'single-folder-per-chat';
  var POLICY_MULTI = 'multi-folder';
  var POLICY_UNKNOWN = 'unknown';
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

  function cleanLower(value) {
    return cleanString(value).toLowerCase();
  }

  function addCode(list, code) {
    var normalized = cleanString(code);
    if (!normalized || list.indexOf(normalized) !== -1) return;
    list.push(normalized);
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

  async function bindingSubjectId(chatHash, folderHash) {
    return sha256Hex(BINDING_SUBJECT_PREFIX + cleanLower(chatHash) + ':' + cleanLower(folderHash));
  }

  function baseResult() {
    return {
      schema: SCHEMA,
      ok: false,
      bindingSubjectId: '',
      canonicalOrderVerified: false,
      folderResolved: false,
      chatResolved: false,
      existingBindingCount: 0,
      existingFolderCountForChat: 0,
      cardinalityPolicy: POLICY_UNKNOWN,
      policySatisfied: false,
      blockers: [],
      warnings: []
    };
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
      var ids = [
        firstString(row, ['id']),
        firstString(row, ['source_id', 'sourceId'])
      ].filter(Boolean);
      for (var j = 0; j < ids.length; j += 1) {
        var subject = await chatSubjectId(ids[j]);
        if (subject === target) {
          matches.push({ row: row, localId: ids[j] });
          break;
        }
      }
    }
    if (matches.length === 0) {
      addCode(blockers, 'chat-not-resolved');
      return { resolved: false, localId: '', live: false };
    }
    if (matches.length > 1) addCode(blockers, 'chat-resolution-ambiguous');
    var match = safeObject(matches[0]);
    var chat = safeObject(match.row);
    var live = isLiveChat(chat);
    if (!live) addCode(blockers, 'chat-not-live');
    if (firstString(chat, ['source_id', 'sourceId']) && match.localId === firstString(chat, ['source_id', 'sourceId'])) {
      addCode(warnings, 'chat-resolved-by-source-id');
    }
    return {
      resolved: matches.length === 1,
      localId: cleanString(match.localId),
      live: live
    };
  }

  async function tableInfoPolicy() {
    var rows = await sqlSelect('PRAGMA table_info(folder_bindings)', []);
    var info = Array.isArray(rows) ? rows : [];
    if (!info.length) return '';
    var pkCols = info.map(function (row) {
      return {
        name: cleanLower(row.name),
        pk: Number(row.pk) || 0
      };
    }).filter(function (row) {
      return row.pk > 0;
    }).sort(function (a, b) {
      return a.pk - b.pk;
    }).map(function (row) {
      return row.name;
    });
    if (pkCols.length === 1 && pkCols[0] === 'chat_id') return POLICY_SINGLE;
    if (pkCols.length === 2 && pkCols[0] === 'chat_id' && pkCols[1] === 'folder_id') return POLICY_MULTI;
    if (pkCols.length === 2 && pkCols[0] === 'folder_id' && pkCols[1] === 'chat_id') return POLICY_MULTI;
    return '';
  }

  async function tableSqlPolicy() {
    var rows = await sqlSelect(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'folder_bindings' LIMIT 1",
      []
    );
    var sql = cleanString(Array.isArray(rows) && rows[0] ? rows[0].sql : '').toLowerCase();
    if (!sql) return '';
    var normalized = sql.replace(/\s+/g, ' ');
    if (/primary\s+key\s*\(\s*chat_id\s*,\s*folder_id\s*\)/.test(normalized)) return POLICY_MULTI;
    if (/primary\s+key\s*\(\s*folder_id\s*,\s*chat_id\s*\)/.test(normalized)) return POLICY_MULTI;
    if (/primary\s+key\s*\(\s*chat_id\s*\)/.test(normalized)) return POLICY_SINGLE;
    if (/chat_id\s+text\s+primary\s+key/.test(normalized)) return POLICY_SINGLE;
    return '';
  }

  async function determinePolicy(blockers, warnings) {
    try {
      var fromInfo = await tableInfoPolicy();
      if (fromInfo) return fromInfo;
      addCode(warnings, 'folder-bindings-table-info-unrecognized');
    } catch (_) {
      addCode(warnings, 'folder-bindings-table-info-unavailable');
    }
    try {
      var fromSql = await tableSqlPolicy();
      if (fromSql) return fromSql;
      addCode(warnings, 'folder-bindings-schema-unrecognized');
    } catch (_) {
      addCode(warnings, 'folder-bindings-schema-unavailable');
    }
    addCode(blockers, 'cardinality-policy-unverified');
    return POLICY_UNKNOWN;
  }

  async function countExactBinding(chatId, folderId, blockers) {
    if (!chatId || !folderId) return 0;
    try {
      var rows = await sqlSelect(
        'SELECT COUNT(*) AS n FROM folder_bindings WHERE chat_id = ? AND folder_id = ?',
        [chatId, folderId]
      );
      return countFromRows(rows);
    } catch (_) {
      addCode(blockers, 'binding-count-unavailable');
      return 0;
    }
  }

  async function countFoldersForChat(chatId, blockers) {
    if (!chatId) return 0;
    try {
      var rows = await sqlSelect(
        'SELECT COUNT(*) AS n FROM folder_bindings WHERE chat_id = ?',
        [chatId]
      );
      return countFromRows(rows);
    } catch (_) {
      addCode(blockers, 'chat-binding-count-unavailable');
      return 0;
    }
  }

  function evaluatePolicy(result) {
    if (!result.folderResolved || !result.chatResolved) {
      result.policySatisfied = false;
      return;
    }

    if (result.cardinalityPolicy === POLICY_UNKNOWN) {
      result.policySatisfied = false;
      return;
    }

    if (result.existingBindingCount > 0) {
      addCode(result.blockers, 'duplicate-folder-binding');
    }

    if (result.cardinalityPolicy === POLICY_SINGLE) {
      if (result.existingFolderCountForChat > 1) {
        addCode(result.blockers, 'binding-cardinality-corrupt');
      }
      if (result.existingFolderCountForChat > result.existingBindingCount) {
        result.policySatisfied = false;
        addCode(result.blockers, 'binding-cardinality-violation');
        return;
      }
      result.policySatisfied = result.existingFolderCountForChat === 0;
      return;
    }

    if (result.cardinalityPolicy === POLICY_MULTI) {
      result.policySatisfied = result.existingBindingCount === 0;
    }
  }

  async function checkBindingIdentityAndCardinality(input) {
    var args = safeObject(input);
    var result = baseResult();
    var chatHash = cleanLower(args.chatSubjectId);
    var folderHash = cleanLower(args.folderSubjectId);

    if (!webCryptoAvailable()) addCode(result.blockers, 'webcrypto-unavailable');
    if (!getInvoke()) addCode(result.blockers, 'tauri-sql-unavailable');
    if (!isSha256Hex(chatHash)) addCode(result.blockers, 'invalid-chat-subject-id');
    if (!isSha256Hex(folderHash)) addCode(result.blockers, 'invalid-folder-subject-id');
    if (chatHash && folderHash && chatHash === folderHash) addCode(result.warnings, 'subject-hashes-identical');

    if (!result.blockers.length) {
      result.bindingSubjectId = await bindingSubjectId(chatHash, folderHash);
      result.canonicalOrderVerified = isSha256Hex(result.bindingSubjectId);
      if (!result.canonicalOrderVerified) addCode(result.blockers, 'canonical-binding-subject-unverified');
    }

    if (getInvoke()) {
      result.cardinalityPolicy = await determinePolicy(result.blockers, result.warnings);
    }

    var folder = { resolved: false, localId: '', live: false };
    var chat = { resolved: false, localId: '', live: false };
    if (isSha256Hex(folderHash) && getInvoke()) {
      folder = await resolveFolder(folderHash, result.blockers);
      result.folderResolved = folder.resolved;
    }
    if (isSha256Hex(chatHash) && getInvoke()) {
      chat = await resolveChat(chatHash, result.blockers, result.warnings);
      result.chatResolved = chat.resolved;
    }

    if (folder.resolved && chat.resolved) {
      result.existingBindingCount = await countExactBinding(chat.localId, folder.localId, result.blockers);
      result.existingFolderCountForChat = await countFoldersForChat(chat.localId, result.blockers);
    }

    evaluatePolicy(result);

    var forbidden = foreverNoKey(result);
    if (forbidden) addCode(result.blockers, 'forbidden-output-field:' + forbidden);
    result.ok = result.blockers.length === 0;
    return result;
  }

  H2O.Desktop.Sync.checkBindingIdentityAndCardinality = checkBindingIdentityAndCardinality;
  H2O.Desktop.Sync.__bindingIdentityCardinalityInstalled = true;
  H2O.Desktop.Sync.__bindingIdentityCardinalityVersion = VERSION;
})(typeof window !== 'undefined' ? window : globalThis);
