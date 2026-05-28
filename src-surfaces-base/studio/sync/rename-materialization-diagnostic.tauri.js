/* H2O Desktop Sync - F10.9.1 rename materialization diagnostic
 *
 * Desktop/Tauri-only read-only diagnostic for determining whether a proposed
 * local folder rename can be safely materialized against a redacted remote
 * targetNameHash.
 *
 * Safety invariants:
 *   - Diagnostics only. No rename, apply, convergence, publication, enqueue,
 *     upload/download, WebDAV, timers, polling, or mobile write-back.
 *   - proposedName is local input only. The cleartext normalized name is never
 *     returned, persisted, enqueued, uploaded, or logged by this module.
 *   - Remote artifacts may carry targetNameHash only. Raw remote names are
 *     treated as forbidden-field blockers.
 *   - Output is redacted: hashes, booleans, blockers, and warnings only.
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
  if (H2O.Desktop.Sync.__renameMaterializationInstalled) return;

  var SCHEMA = 'h2o.desktop.sync.rename-materialization-diagnostic.v1';
  var VERSION = '0.1.0-f10.9.1';
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

  function isHash(value) {
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

  async function folderSubjectId(id) {
    return sha256Hex(SUBJECT_TYPE + ':' + cleanString(id));
  }

  async function parentSubjectId(parentId) {
    var id = cleanString(parentId);
    return id ? sha256Hex(SUBJECT_TYPE + ':' + id) : '';
  }

  async function resolveSubject(subjectId, rows) {
    for (var i = 0; i < rows.length; i += 1) {
      var row = safeObject(rows[i]);
      var id = rowId(row);
      if (!id) continue;
      var hash = await folderSubjectId(id);
      if (hash === subjectId) return { row: row, folderId: id };
    }
    return { row: null, folderId: '' };
  }

  function changedFields(entry) {
    return asArray(entry.changedFields).map(cleanString).filter(Boolean).sort();
  }

  function nameOnly(entry) {
    var fields = changedFields(entry);
    return fields.length === 1 && fields[0] === 'name';
  }

  function entryFromInput(input) {
    var args = safeObject(input);
    return safeObject(args.plannerEntry || args.entry || args.candidate);
  }

  function entrySubject(entry) {
    return cleanString(entry.subjectId).toLowerCase();
  }

  function entryEventDigest(entry) {
    return cleanString(entry.eventDigest).toLowerCase();
  }

  function entryDedupeKey(entry) {
    return cleanString(entry.dedupeKey || entry.eventDigest).toLowerCase();
  }

  function entrySourcePeerId(entry) {
    return cleanString(entry.sourcePeerId ||
      safeObject(safeObject(entry.sourcePlatform).sourcePeerEnvelope).syncPeerIdHash).toLowerCase();
  }

  function entryTargetHash(entry) {
    return cleanString(entry.remoteRevisionHash || entry.targetHash || entry.revisionHash).toLowerCase();
  }

  function nestedTargetNameHash(value) {
    var obj = safeObject(value);
    return cleanString(obj.targetNameHash || obj.nameHash || obj.proposedNameHash || obj.expectedNameHash).toLowerCase();
  }

  function targetNameHashFromEntry(entry) {
    var direct = nestedTargetNameHash(entry);
    if (isSha256Hex(direct)) return direct;
    var payload = safeObject(entry.payload);
    var proposalPreview = safeObject(payload.proposalPreview);
    var candidates = [
      entry.expectedPostState,
      entry.proposedOperation,
      entry.renameMaterialization,
      entry.remoteState,
      payload.expectedPostState,
      payload.proposedOperation,
      proposalPreview.expectedPostState,
      proposalPreview.proposedOperation,
      proposalPreview.renameMaterialization
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var hash = nestedTargetNameHash(candidates[i]);
      if (isSha256Hex(hash)) return hash;
    }
    return '';
  }

  async function matchingInboxEnvelope(entry, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.listRelayInbox !== 'function') return null;
    try {
      var inbox = safeObject(await sync.listRelayInbox({ includeSerializedEnvelope: true }));
      var rows = asArray(inbox.rows);
      var eventDigest = entryEventDigest(entry);
      for (var i = 0; i < rows.length; i += 1) {
        var row = safeObject(rows[i]);
        if (eventDigest && cleanString(row.eventDigest).toLowerCase() !== eventDigest) continue;
        if (!cleanString(row.serializedEnvelope)) continue;
        try {
          var env = JSON.parse(cleanString(row.serializedEnvelope));
          if (isObject(env)) return env;
        } catch (_) {
          addCode(warnings, 'matching-inbox-envelope-malformed');
        }
      }
    } catch (_) {
      addCode(warnings, 'relay-inbox-read-failed');
    }
    return null;
  }

  async function targetNameHash(entry, blockers, warnings) {
    var entryForbidden = foreverNoKey(entry);
    if (entryForbidden) {
      addCode(blockers, 'remote-artifact-contains-forbidden-field');
      addCode(warnings, 'blocked-forbidden-key-' + entryForbidden);
      return '';
    }
    var hash = targetNameHashFromEntry(entry);
    if (hash) return hash;
    var envelope = await matchingInboxEnvelope(entry, warnings);
    if (!envelope) return '';
    var envelopeForbidden = foreverNoKey(envelope);
    if (envelopeForbidden) {
      addCode(blockers, 'remote-artifact-contains-forbidden-field');
      addCode(warnings, 'blocked-forbidden-key-' + envelopeForbidden);
      return '';
    }
    return targetNameHashFromEntry(envelope);
  }

  async function duplicateSiblingExists(target, rows, normalizedNameHash) {
    if (!target.row || !target.folderId || !normalizedNameHash) return false;
    var parent = rowParentId(target.row);
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

  async function parentStable(entry, target, blockers, warnings) {
    if (!target.row || !target.folderId) return false;
    var fields = changedFields(entry);
    if (fields.indexOf('parent') !== -1 || fields.indexOf('parentId') !== -1) {
      addCode(blockers, 'rename-vs-move');
      return false;
    }
    var currentParentHash = await parentSubjectId(rowParentId(target.row));
    var expected = cleanString(entry.parentSubjectId || entry.localParentSubjectId ||
      entry.baseParentSubjectId || safeObject(entry.structural).parentSubjectId).toLowerCase();
    if (!expected) {
      addCode(blockers, 'parent-baseline-unavailable');
      return false;
    }
    if (expected !== currentParentHash) {
      addCode(blockers, 'parent-changed');
      return false;
    }
    return true;
  }

  async function relayIndexSafe(entry, blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.listRelayIndex !== 'function') {
      addCode(blockers, 'relay-index-unavailable');
      return false;
    }
    var index;
    try {
      index = safeObject(await sync.listRelayIndex());
    } catch (_) {
      addCode(blockers, 'relay-index-read-failed');
      return false;
    }
    codeList(index.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(index.warnings).forEach(function (code) { addCode(warnings, code); });
    var eventDigest = entryEventDigest(entry);
    var dedupeKey = entryDedupeKey(entry);
    var safe = true;
    asArray(index.entries).forEach(function (item) {
      var row = safeObject(item);
      var eventMatch = eventDigest && cleanString(row.eventDigest).toLowerCase() === eventDigest;
      var dedupeMatch = dedupeKey && cleanString(row.dedupeKey).toLowerCase() === dedupeKey;
      if (!eventMatch && !dedupeMatch) return;
      if (row.replayAttempt === true) { safe = false; addCode(blockers, 'replay-detected'); }
      if (row.stale === true) { safe = false; addCode(blockers, 'stale-evidence-not-revalidated'); }
      if (row.expired === true) { safe = false; addCode(blockers, 'envelope-expired'); }
    });
    asArray(index.replays).forEach(function (replay) {
      if (dedupeKey && cleanString(safeObject(replay).dedupeKey).toLowerCase() === dedupeKey) {
        safe = false;
        addCode(blockers, 'replay-dedupe-key');
      }
    });
    return safe && !codeList(index.blockers).length;
  }

  async function consumedLedgerSafe(entry, blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.listConsumedOperations !== 'function') {
      addCode(blockers, 'consumed-operation-ledger-unavailable');
      return false;
    }
    var ledger;
    try {
      ledger = safeObject(await sync.listConsumedOperations());
    } catch (_) {
      addCode(blockers, 'consumed-operation-ledger-read-failed');
      return false;
    }
    codeList(ledger.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(ledger.warnings).forEach(function (code) { addCode(warnings, code); });
    var eventDigest = entryEventDigest(entry);
    var dedupeKey = entryDedupeKey(entry);
    var safe = true;
    asArray(ledger.rows).forEach(function (rowValue) {
      var row = safeObject(rowValue);
      var eventMatch = eventDigest && cleanString(row.eventDigest).toLowerCase() === eventDigest;
      var dedupeMatch = dedupeKey && cleanString(row.dedupeKey).toLowerCase() === dedupeKey;
      if (!eventMatch && !dedupeMatch) return;
      safe = false;
      addCode(blockers, 'consumed-operation-present');
      var status = cleanString(row.consumedStatus);
      if (status) addCode(warnings, 'consumed-status-' + status);
    });
    return safe && !codeList(ledger.blockers).length;
  }

  async function watermarkLedgerSafe(entry, blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.getConvergenceWatermarks !== 'function') {
      addCode(blockers, 'convergence-watermark-ledger-unavailable');
      return false;
    }
    var watermarks;
    try {
      watermarks = safeObject(await sync.getConvergenceWatermarks());
    } catch (_) {
      addCode(blockers, 'convergence-watermark-ledger-read-failed');
      return false;
    }
    codeList(watermarks.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(watermarks.warnings).forEach(function (code) { addCode(warnings, code); });
    var peerId = entrySourcePeerId(entry);
    var subjectId = entrySubject(entry);
    var targetHash = entryTargetHash(entry);
    var key = peerId + ':' + subjectId;
    var latest = safeObject(safeObject(watermarks.latestByPeerSubject)[key]);
    if (latest && targetHash && cleanString(latest.revisionHash).toLowerCase() === targetHash) {
      addCode(blockers, 'target-already-watermarked');
      return false;
    }
    return !codeList(watermarks.blockers).length;
  }

  function resultFrom(flags, hashes, blockers, warnings) {
    var out = {
      schema: SCHEMA,
      ok: false,
      targetNameHash: cleanString(hashes.targetNameHash).toLowerCase() || null,
      normalizedNameHash: cleanString(hashes.normalizedNameHash).toLowerCase() || null,
      hashMatches: flags.hashMatches === true,
      duplicateSiblingExists: flags.duplicateSiblingExists === true,
      parentStable: flags.parentStable === true,
      watermarkSafe: flags.watermarkSafe === true,
      replaySafe: flags.replaySafe === true,
      consumedSafe: flags.consumedSafe === true,
      subjectResolved: flags.subjectResolved === true,
      blockers: codeList(blockers),
      warnings: codeList(warnings)
    };
    if (!out.targetNameHash) addCode(out.blockers, 'targetNameHash-unavailable');
    if (!out.normalizedNameHash) addCode(out.blockers, 'normalizedNameHash-unavailable');
    out.ok = out.blockers.length === 0 &&
      out.hashMatches === true &&
      out.duplicateSiblingExists === false &&
      out.parentStable === true &&
      out.watermarkSafe === true &&
      out.replaySafe === true &&
      out.consumedSafe === true &&
      out.subjectResolved === true;
    var forbidden = foreverNoKey(out);
    if (forbidden) {
      out.ok = false;
      addCode(out.blockers, 'rename-materialization-output-contains-forbidden-field');
      addCode(out.warnings, 'blocked-forbidden-key-' + forbidden);
    }
    return out;
  }

  async function checkRenameMaterialization(input) {
    var args = safeObject(input);
    var entry = entryFromInput(args);
    var blockers = [];
    var warnings = [];
    var flags = {
      hashMatches: false,
      duplicateSiblingExists: false,
      parentStable: false,
      watermarkSafe: false,
      replaySafe: false,
      consumedSafe: false,
      subjectResolved: false
    };

    if (!webCryptoAvailable()) addCode(blockers, 'web-crypto-unavailable');
    if (!isSha256Hex(entrySubject(entry))) addCode(blockers, 'subjectId-invalid');
    if (!nameOnly(entry)) addCode(blockers, 'field-not-allowlisted');
    if (!entryEventDigest(entry)) addCode(blockers, 'eventDigest-unavailable');
    if (!isHash(entryTargetHash(entry))) addCode(warnings, 'targetHash-unavailable');

    var normalized = normalizeProposedName(args.proposedName, blockers);
    var normalizedNameHash = normalized ? await sha256Hex(normalized) : '';
    var remoteTargetNameHash = await targetNameHash(entry, blockers, warnings);
    if (!isSha256Hex(remoteTargetNameHash)) addCode(blockers, 'targetNameHash-unavailable');
    flags.hashMatches = !!(normalizedNameHash && remoteTargetNameHash &&
      normalizedNameHash === remoteTargetNameHash);
    if (!flags.hashMatches) addCode(blockers, 'target-name-hash-mismatch');

    var rows = await readFolderRows(warnings);
    var target = { row: null, folderId: '' };
    if (isSha256Hex(entrySubject(entry))) target = await resolveSubject(entrySubject(entry), rows);
    flags.subjectResolved = !!(target.row && target.folderId);
    if (!flags.subjectResolved) addCode(blockers, 'subject-not-resolved');

    flags.duplicateSiblingExists = await duplicateSiblingExists(target, rows, normalizedNameHash);
    if (flags.duplicateSiblingExists) addCode(blockers, 'duplicate-folder-name');

    flags.parentStable = await parentStable(entry, target, blockers, warnings);
    flags.replaySafe = await relayIndexSafe(entry, blockers, warnings);
    flags.consumedSafe = await consumedLedgerSafe(entry, blockers, warnings);
    flags.watermarkSafe = await watermarkLedgerSafe(entry, blockers, warnings);

    return resultFrom(flags, {
      targetNameHash: remoteTargetNameHash,
      normalizedNameHash: normalizedNameHash
    }, blockers, warnings);
  }

  H2O.Desktop.Sync.checkRenameMaterialization = checkRenameMaterialization;
  H2O.Desktop.Sync.__renameMaterializationInstalled = true;
  H2O.Desktop.Sync.__renameMaterializationVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
