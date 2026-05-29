/* H2O Desktop Sync - F10.9.4 local rename convergence action
 *
 * Desktop/Tauri-only operator-approved convergence action for exactly one
 * rename-only planner entry.
 *
 * Safety invariants:
 *   - Rename only. No move, create, delete, folderBinding changes, batch
 *     operations, publication, enqueue/upload/download, applyEvent, watermark
 *     writes, consumed-ledger writes, convergence bookkeeping, WebDAV, remote
 *     apply, automatic merge, or mobile write-back.
 *   - The action first runs F10.9.2 read-only preflight and requires
 *     actionable === true before one local folder name update.
 *   - proposedName is local input only. It is written to the local folder row
 *     as the approved rename target, but never returned, persisted in a sync
 *     ledger, enqueued, uploaded, or exposed in this result.
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
  if (H2O.Desktop.Sync.__renameConvergenceInstalled) return;

  var SCHEMA = 'h2o.desktop.sync.rename-convergence-action.v1';
  var VERSION = '0.1.0-f10.9.4';
  var APPROVAL_TOKEN = 'I_APPROVE_LOCAL_RENAME_CONVERGENCE';
  var SUBJECT_TYPE = 'folder.metadata';
  var NAME_MAX_LENGTH = 160;
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'attachments',
    'name', 'title', 'folderName', 'chatTitle', 'rawId', 'chatId',
    'folderId', 'targetFolderId', 'path', 'url', 'password', 'apiKey',
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

  function normalizeProposedName(value, blockers) {
    var raw = String(value == null ? '' : value);
    var normalized = raw.normalize ? raw.normalize('NFC').trim() : raw.trim();
    if (!normalized) addCode(blockers, 'proposed-name-empty');
    if (/[\u0000-\u001f\u007f]/.test(normalized)) addCode(blockers, 'proposed-name-control-character');
    if (normalized.length > NAME_MAX_LENGTH) addCode(blockers, 'proposed-name-too-long');
    return normalized;
  }

  function normalizeLocalName(value) {
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

  async function resolveSubject(subjectId, rows) {
    for (var i = 0; i < rows.length; i += 1) {
      var row = safeObject(rows[i]);
      var id = rowId(row);
      if (!id) continue;
      var hash = await sha256Hex(SUBJECT_TYPE + ':' + id);
      if (hash === subjectId) return { row: row, folderId: id };
    }
    return { row: null, folderId: '' };
  }

  async function duplicateSiblingExists(target, rows, normalizedName) {
    if (!target.row || !target.folderId || !normalizedName) return false;
    var parent = rowParentId(target.row);
    var normalizedNameHash = await sha256Hex(normalizedName);
    for (var i = 0; i < rows.length; i += 1) {
      var row = safeObject(rows[i]);
      var id = rowId(row);
      if (!id || id === target.folderId) continue;
      if (rowParentId(row) !== parent) continue;
      var siblingNameHash = await sha256Hex(normalizeLocalName(rowName(row)));
      if (siblingNameHash === normalizedNameHash) return true;
    }
    return false;
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

  function nameOnly(entry) {
    var fields = entryChangedFields(entry);
    return fields.length === 1 && fields[0] === 'name';
  }

  function hashMatches(expected, canonical, local) {
    var exp = cleanString(expected).toLowerCase();
    if (!exp) return false;
    return exp === cleanString(canonical).toLowerCase() || exp === cleanString(local).toLowerCase();
  }

  function projectedRow(row, normalizedName) {
    var out = Object.assign({}, safeObject(row));
    if (Object.prototype.hasOwnProperty.call(out, 'name')) out.name = normalizedName;
    else if (Object.prototype.hasOwnProperty.call(out, 'title')) out.title = normalizedName;
    else if (Object.prototype.hasOwnProperty.call(out, 'folderName')) out.folderName = normalizedName;
    else out.name = normalizedName;
    return out;
  }

  function failure(blockers, warnings) {
    return {
      schema: SCHEMA,
      ok: false,
      renamed: false,
      subjectId: null,
      lineageId: null,
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

  async function runPreflight(entry, proposedName, blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.runRenameConvergencePreflight !== 'function') {
      addCode(blockers, 'rename-convergence-preflight-unavailable');
      return null;
    }
    var preflight = null;
    try {
      preflight = safeObject(await sync.runRenameConvergencePreflight({
        plannerEntry: entry,
        proposedName: proposedName
      }));
    } catch (_) {
      addCode(blockers, 'rename-convergence-preflight-failed');
      return null;
    }
    codeList(preflight.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(preflight.warnings).forEach(function (code) { addCode(warnings, code); });
    if (preflight.actionable !== true) addCode(blockers, 'rename-preflight-not-actionable');
    if (preflight.hashVerified !== true) addCode(blockers, 'rename-hash-not-verified');
    if (preflight.duplicateSiblingExists === true) addCode(blockers, 'duplicate-folder-name');
    if (preflight.parentStable !== true) addCode(blockers, 'parent-not-stable');
    if (preflight.subjectResolved !== true) addCode(blockers, 'subject-not-resolved');
    if (preflight.renameVsMoveConflict === true) addCode(blockers, 'rename-vs-move');
    if (preflight.renameVsDeleteConflict === true) addCode(blockers, 'rename-vs-delete');
    return preflight;
  }

  async function executeRenameConvergence(input) {
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
    if (!nameOnly(entry)) addCode(blockers, 'field-not-allowlisted');

    var normalizedName = normalizeProposedName(args.proposedName, blockers);
    await runPreflight(entry, normalizedName, blockers, warnings);

    var api = foldersApi();
    if (!api || typeof api.patch !== 'function' || typeof api.get !== 'function') {
      addCode(blockers, 'local-folder-rename-unavailable');
    }

    var rows = [];
    var target = { row: null, folderId: '' };
    if (!blockers.length) {
      rows = await readFolderRows(warnings);
      target = await resolveSubject(entrySubject(entry), rows);
      if (!target.row || !target.folderId) addCode(blockers, 'subject-not-resolved');
      else if (await duplicateSiblingExists(target, rows, normalizedName)) addCode(blockers, 'duplicate-folder-name');
    }

    if (!blockers.length) {
      var beforeCanonicalHash = await canonicalFolderHash(target.row);
      var beforeLocalHash = localFolderHash(target.row);
      if (!hashMatches(entryBaseHash(entry), beforeCanonicalHash, beforeLocalHash)) {
        addCode(blockers, 'baseline-hash-mismatch');
      }

      var projected = projectedRow(target.row, normalizedName);
      var projectedCanonicalHash = await canonicalFolderHash(projected);
      var projectedLocalHash = localFolderHash(projected);
      if (!hashMatches(entryTargetHash(entry), projectedCanonicalHash, projectedLocalHash)) {
        addCode(blockers, 'target-hash-mismatch');
      }
    }

    if (blockers.length) return failure(blockers, warnings);

    var renamedRow = null;
    try {
      renamedRow = await Promise.resolve(api.patch(target.folderId, { name: normalizedName }));
    } catch (_) {
      addCode(blockers, 'local-rename-failed');
      return failure(blockers, warnings);
    }
    if (!renamedRow) {
      addCode(blockers, 'local-rename-failed');
      return failure(blockers, warnings);
    }

    var verifiedRow = null;
    try {
      verifiedRow = await Promise.resolve(api.get(target.folderId));
    } catch (_) {
      verifiedRow = null;
    }
    if (!verifiedRow) {
      addCode(blockers, 'local-rename-verification-failed');
      return failure(blockers, warnings);
    }
    if (normalizeLocalName(rowName(verifiedRow)) !== normalizedName) {
      addCode(blockers, 'local-rename-verification-failed');
      return failure(blockers, warnings);
    }
    var postCanonicalHash = await canonicalFolderHash(verifiedRow);
    var postLocalHash = localFolderHash(verifiedRow);
    if (!hashMatches(entryTargetHash(entry), postCanonicalHash, postLocalHash)) {
      addCode(blockers, 'post-state-hash-mismatch');
      return failure(blockers, warnings);
    }

    var result = {
      schema: SCHEMA,
      ok: true,
      renamed: true,
      subjectId: entrySubject(entry),
      lineageId: entryLineage(entry),
      generatedAtIso: nowIsoSeconds(),
      localOnly: true,
      blockers: [],
      warnings: codeList(warnings)
    };
    var forbidden = foreverNoKey(result);
    if (forbidden) {
      return failure(['rename-convergence-result-contains-forbidden-field'], ['blocked-forbidden-key-' + forbidden]);
    }
    return result;
  }

  H2O.Desktop.Sync.executeRenameConvergence = executeRenameConvergence;
  H2O.Desktop.Sync.__renameConvergenceInstalled = true;
  H2O.Desktop.Sync.__renameConvergenceVersion = VERSION;
  H2O.Desktop.Sync.__renameConvergenceApprovalToken = APPROVAL_TOKEN;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
