/* H2O Studio Sync - F10.6.1 read-only folder sync canonicalizer
 *
 * Chrome Studio diagnostic only. Operator-triggered. No automatic run.
 *
 * Canonicalizes the existing Studio folder diagnostic source into the
 * F10.6 folder sync object model:
 *   - folder.metadata objects
 *   - folderBinding objects for diff/preview-only visibility
 *
 * Safety invariants:
 *   - Chrome Studio only; bails on Tauri/non-extension contexts.
 *   - No storage writes. No localStorage/chrome.storage/IndexedDB writes.
 *   - No fetch. No runtime messages. No timers or polling.
 *   - No diff engine, proposal, conflictCandidate, applyEvent, or write-back.
 *   - Raw folder names are hidden unless redactionClass is "device-local".
 *   - Raw chat IDs are never emitted.
 *   - All emitted IDs and revision hashes are Web Crypto sha256 hex strings.
 *   - Defensive forever-no key scan runs before returning.
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
  if (detectTauri()) return;

  function detectChromeExtension() {
    try {
      return !!(global.chrome && global.chrome.runtime && global.chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }
  if (!detectChromeExtension()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.diagnostics = H2O.Studio.diagnostics || {};
  if (H2O.Studio.diagnostics.__folderSyncCanonicalInstalled) return;

  var SCHEMA = 'h2o.studio.sync.folder-canonical-snapshot.v1';
  var VERSION = '0.1.0-f10.6.1';
  var SOURCE = 'chrome-studio';
  var REDACTED = 'redacted';
  var DEVICE_LOCAL = 'device-local';
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'attachments',
    'url', 'path', 'password', 'apiKey'
  ];

  function nowIso() {
    return new Date().toISOString();
  }

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
    return color ? color.toLowerCase() : null;
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!isObject(value)) return value;
    var out = {};
    var keys = Object.keys(value).sort();
    for (var i = 0; i < keys.length; i += 1) {
      out[keys[i]] = canonicalize(value[keys[i]]);
    }
    return out;
  }

  function canonicalJson(value) {
    return JSON.stringify(canonicalize(value));
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

  function addCode(list, code) {
    var normalized = cleanString(code);
    if (!normalized || list.indexOf(normalized) !== -1) return;
    list.push(normalized);
  }

  function normalizeOptions(options) {
    var opts = safeObject(options);
    return {
      redactionClass: opts.redactionClass === DEVICE_LOCAL ? DEVICE_LOCAL : REDACTED
    };
  }

  function baseResult(options) {
    return {
      schema: SCHEMA,
      ok: false,
      redactionClass: options.redactionClass,
      source: SOURCE,
      generatedAtIso: nowIso(),
      objects: [],
      bindings: [],
      counts: {
        folders: 0,
        bindings: 0,
        tombstonesReferenced: 0
      },
      warnings: [],
      blockers: []
    };
  }

  function getFoldersApi() {
    try {
      return (H2O && (H2O.folders || (H2O.Library && H2O.Library.Folders))) || null;
    } catch (_) {
      return null;
    }
  }

  function extractProvidedState(input) {
    var obj = safeObject(input);
    var stateInput = obj.folderState || obj.snapshot || obj.sourceState;
    if (!isObject(stateInput)) return null;
    var state = safeObject(stateInput);
    var folders = asArray(state.folders);
    var items = isObject(state.items) ? state.items : {};
    return {
      sourceName: 'options.folderState',
      folders: folders,
      items: items
    };
  }

  function extractLiveState(warnings, blockers) {
    var foldersApi = getFoldersApi();
    if (!foldersApi || typeof foldersApi.diagnose !== 'function') {
      addCode(blockers, 'folder-diagnostic-unavailable');
      return { sourceName: 'none', folders: [], items: {} };
    }

    var diag = null;
    try {
      diag = foldersApi.diagnose() || {};
    } catch (_) {
      addCode(blockers, 'folder-diagnostic-failed');
      return { sourceName: 'H2O.folders.diagnose', folders: [], items: {} };
    }

    var parity = safeObject(diag.folderParity);
    var folders = asArray(parity.folders);
    var items = {};
    for (var i = 0; i < folders.length; i += 1) {
      var row = safeObject(folders[i]);
      var folderId = cleanString(row.id || row.folderId);
      if (!folderId) continue;
      var chatIds = asArray(row.chatIds)
        .map(cleanString)
        .filter(Boolean);
      items[folderId] = chatIds;
    }

    if (!folders.length && parity.catalogCached !== true) {
      addCode(warnings, 'folder-catalog-cache-empty');
    }
    if (Array.isArray(parity.uncatalogedFolderIds) && parity.uncatalogedFolderIds.length) {
      addCode(warnings, 'uncataloged-folder-bindings-present');
    }
    return {
      sourceName: 'H2O.folders.diagnose.folderParity',
      folders: folders,
      items: items
    };
  }

  function readFolderState(options, warnings, blockers) {
    var provided = extractProvidedState(options);
    if (provided) return provided;
    return extractLiveState(warnings, blockers);
  }

  function normalizeFolderRow(row) {
    var id = firstString(row, ['id', 'folderId']);
    var name = firstString(row, ['name', 'title', 'folderName']);
    var parentId = firstString(row, ['parentId', 'parentFolderId', 'parent_id']);
    var iconColor = normalizeColor(firstString(row, ['iconColor', 'icon_color']));
    var color = iconColor || normalizeColor(firstString(row, ['color', 'folderColor', 'accentColor']));
    var icon = firstString(row, ['icon', 'iconKey']) || null;
    var sortOrder = normalizeNumber(firstPresent(row, ['sortOrder', 'index', 'position']));
    var kind = firstString(row, ['kind']) || null;
    var source = firstString(row, ['source']) || null;
    var deletedAt = firstString(row, ['deletedAt', 'deleted_at', 'removedAt', 'removed_at']);
    var tombstoneId = firstString(row, ['tombstoneId', 'tombstone_id']);
    return {
      id: id,
      name: name,
      parentId: parentId || null,
      color: color,
      icon: icon,
      sortOrder: sortOrder,
      kind: kind,
      source: source,
      tombstoneReferenced: !!(deletedAt || tombstoneId || row.isDeleted === true || row.deleted === true)
    };
  }

  async function folderObjectFromRow(row, options, warnings) {
    var normalized = normalizeFolderRow(row);
    if (!normalized.id) {
      addCode(warnings, 'folder-id-missing');
      return null;
    }

    var subjectId = await sha256Hex('folder.metadata:' + normalized.id);
    var parentSubjectId = normalized.parentId
      ? await sha256Hex('folder.metadata:' + normalized.parentId)
      : null;
    var revisionInput = {
      name: normalized.name || null,
      parentId: normalized.parentId,
      color: normalized.color,
      icon: normalized.icon,
      sortOrder: normalized.sortOrder,
      kind: normalized.kind,
      source: normalized.source
    };
    var object = {
      objectType: 'folder',
      subjectType: 'folder.metadata',
      subjectId: subjectId,
      revisionHash: await sha256Hex(canonicalJson(revisionInput)),
      structural: {
        parentSubjectId: parentSubjectId,
        sortOrder: normalized.sortOrder,
        color: normalized.color,
        icon: normalized.icon,
        kind: normalized.kind,
        source: normalized.source
      },
      nameHash: await sha256Hex(normalized.name || '')
    };
    if (options.redactionClass === DEVICE_LOCAL) object.name = normalized.name || '';
    object.__rawFolderId = normalized.id;
    object.__tombstoneReferenced = normalized.tombstoneReferenced;
    return object;
  }

  async function bindingObject(folderSubjectId, folderId, chatId) {
    var chatSubjectId = await sha256Hex('chat:' + cleanString(chatId));
    var subjectId = await sha256Hex('folderBinding:' + cleanString(folderId) + ':' + cleanString(chatId));
    var revisionHash = await sha256Hex(folderSubjectId + ' ' + chatSubjectId);
    return {
      objectType: 'folderBinding',
      subjectType: 'folderBinding',
      subjectId: subjectId,
      folderSubjectId: folderSubjectId,
      chatSubjectId: chatSubjectId,
      revisionHash: revisionHash
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

  function stripInternalFields(result) {
    var objects = [];
    for (var i = 0; i < result.objects.length; i += 1) {
      var row = result.objects[i];
      if (!row) continue;
      delete row.__rawFolderId;
      delete row.__tombstoneReferenced;
      objects.push(row);
    }
    result.objects = objects;
  }

  async function canonicalizeFolderSnapshot(input) {
    var options = normalizeOptions(input);
    var result = baseResult(options);
    if (!webCryptoAvailable()) {
      addCode(result.blockers, 'web-crypto-unavailable');
      return result;
    }

    var state = readFolderState(input, result.warnings, result.blockers);
    var folders = asArray(state.folders);
    var items = safeObject(state.items);
    var folderObjectsByRawId = Object.create(null);
    var seenFolders = Object.create(null);
    var tombstonesReferenced = 0;

    for (var i = 0; i < folders.length; i += 1) {
      var object = await folderObjectFromRow(folders[i], options, result.warnings);
      if (!object) continue;
      var rawFolderId = object.__rawFolderId;
      if (seenFolders[rawFolderId]) {
        addCode(result.warnings, 'duplicate-folder-id');
        continue;
      }
      seenFolders[rawFolderId] = true;
      if (object.__tombstoneReferenced) tombstonesReferenced += 1;
      folderObjectsByRawId[rawFolderId] = object;
      result.objects.push(object);
    }

    var seenBindings = Object.create(null);
    var folderIds = Object.keys(items).sort();
    for (var f = 0; f < folderIds.length; f += 1) {
      var folderId = folderIds[f];
      var folderObject = folderObjectsByRawId[folderId];
      if (!folderObject) {
        if (asArray(items[folderId]).length) addCode(result.warnings, 'orphan-folder-binding');
        continue;
      }
      var chatIds = asArray(items[folderId]).map(cleanString).filter(Boolean).sort();
      for (var c = 0; c < chatIds.length; c += 1) {
        var chatId = chatIds[c];
        var bindingKey = folderId + '\n' + chatId;
        if (seenBindings[bindingKey]) {
          addCode(result.warnings, 'duplicate-folder-binding');
          continue;
        }
        seenBindings[bindingKey] = true;
        result.bindings.push(await bindingObject(folderObject.subjectId, folderId, chatId));
      }
    }

    result.objects.sort(function (a, b) {
      return String(a.subjectId).localeCompare(String(b.subjectId));
    });
    result.bindings.sort(function (a, b) {
      return String(a.subjectId).localeCompare(String(b.subjectId));
    });
    stripInternalFields(result);

    result.counts.folders = result.objects.length;
    result.counts.bindings = result.bindings.length;
    result.counts.tombstonesReferenced = tombstonesReferenced;
    result.ok = result.blockers.length === 0;

    var forbiddenKey = foreverNoKey(result);
    if (forbiddenKey) {
      result.ok = false;
      addCode(result.blockers, 'payload-contains-forever-no-field');
      result.objects = [];
      result.bindings = [];
      result.counts.folders = 0;
      result.counts.bindings = 0;
    }
    return result;
  }

  H2O.Studio.diagnostics.canonicalizeFolderSnapshot = canonicalizeFolderSnapshot;
  H2O.Studio.diagnostics.__folderSyncCanonicalInstalled = true;
  H2O.Studio.diagnostics.__folderSyncCanonicalVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
