/* H2O Desktop Sync - F13.0.6 binding convergence runtime proof
 *
 * Desktop/Tauri-only dogfood validation harness for the existing binding-add
 * convergence chain.
 *
 * Safety invariants:
 *   - Proof only. This module adds no binding, apply, proposal, bookkeeping,
 *     publication, outbox/inbox, WebDAV, convergence, or mobile write-back
 *     behavior.
 *   - Positive proof calls existing APIs only:
 *       checkBindingIdentityAndCardinality()
 *       checkBindingMaterialization()
 *       runBindingConvergencePreflight()
 *       generateBindingProposalCandidate()
 *       executeReviewedBindingAdd()
 *       buildBindingApplyEvent()
 *       finalizeBindingConvergence()
 *   - Negative proofs are validation calls only. They do not create tombstones,
 *     bindings, or repair rows.
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
  if (H2O.Desktop.Sync.__bindingConvergenceProofInstalled) return;

  var SCHEMA = 'h2o.desktop.sync.binding-convergence-proof.v1';
  var VERSION = '0.1.0-f13.0.6';
  var DB_URL = 'sqlite:studio-v1.db';
  var FOLDER_SUBJECT_TYPE = 'folder.metadata';
  var CHAT_SUBJECT_PREFIX = 'chat:';
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

  function codeList(value) {
    return asArray(value).map(function (item) {
      return isObject(item) ? cleanString(item.code) : cleanString(item);
    }).filter(Boolean);
  }

  function isSha256Hex(value) {
    return /^[0-9a-f]{64}$/.test(cleanLower(value));
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

  function isLiveFolder(row) {
    var r = safeObject(row);
    if (r.deleted === true || r.isDeleted === true || r.tombstoned === true) return false;
    if (firstString(r, ['deletedAt', 'deleted_at', 'removedAt', 'removed_at'])) return false;
    if (firstString(r, ['tombstoneId', 'tombstone_id'])) return false;
    return !!firstString(r, ['id']);
  }

  function isLiveChat(row) {
    var r = safeObject(row);
    if (r.deleted === true || r.isDeleted === true || r.tombstoned === true) return false;
    if (firstNumber(r, ['is_deleted', 'isDeleted']) > 0) return false;
    if (firstString(r, ['deletedAt', 'deleted_at', 'removedAt', 'removed_at'])) return false;
    if (firstString(r, ['tombstoneId', 'tombstone_id'])) return false;
    return !!firstString(r, ['id']);
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
      identityOk: false,
      materializationOk: false,
      preflightOk: false,
      proposalOk: false,
      bindOk: false,
      applyEventOk: false,
      consumedOk: false,
      watermarkOk: false,
      negativeProofs: {
        duplicateBindingBlocked: false,
        cardinalityViolationBlocked: false,
        folderTombstonedBlocked: false,
        chatTombstonedBlocked: false
      },
      blockers: [],
      warnings: []
    };
  }

  function finish(result) {
    result.generatedAtIso = nowIsoSeconds();
    var negative = safeObject(result.negativeProofs);
    result.ok = result.identityOk === true &&
      result.materializationOk === true &&
      result.preflightOk === true &&
      result.proposalOk === true &&
      result.bindOk === true &&
      result.applyEventOk === true &&
      result.consumedOk === true &&
      result.watermarkOk === true &&
      negative.duplicateBindingBlocked === true &&
      result.blockers.length === 0;
    var forbidden = foreverNoKey(result);
    if (forbidden) {
      result.ok = false;
      addCode(result.blockers, 'binding-proof-output-contains-forbidden-field');
      addCode(result.warnings, 'blocked-forbidden-key-' + forbidden);
    }
    return result;
  }

  async function folderSubjectId(id) {
    return sha256Hex(FOLDER_SUBJECT_TYPE + ':' + cleanString(id));
  }

  async function chatSubjectId(id) {
    return sha256Hex(CHAT_SUBJECT_PREFIX + cleanString(id));
  }

  async function readFolders() {
    var rows = await sqlSelect(
      'SELECT id, name, parent_id, color, sort_order, source, created_at, updated_at, meta_json FROM folders ORDER BY id',
      []
    );
    return Array.isArray(rows) ? rows : [];
  }

  async function readChats() {
    var rows = await sqlSelect(
      'SELECT id, source_id, title, folder_id, is_deleted, meta_json FROM chats ORDER BY id',
      []
    );
    return Array.isArray(rows) ? rows : [];
  }

  function chatLocalIds(row) {
    var out = [];
    var id = firstString(row, ['id']);
    var sourceId = firstString(row, ['source_id', 'sourceId']);
    if (id) out.push(id);
    if (sourceId && out.indexOf(sourceId) === -1) out.push(sourceId);
    return out;
  }

  async function bindingCountForChatIds(ids) {
    if (!ids.length) return 0;
    var placeholders = ids.map(function () { return '?'; }).join(', ');
    var rows = await sqlSelect(
      'SELECT COUNT(*) AS n FROM folder_bindings WHERE chat_id IN (' + placeholders + ')',
      ids
    );
    return Array.isArray(rows) && rows.length ? Number(rows[0].n) || 0 : 0;
  }

  async function exactBindingCount(chatIds, folderId) {
    if (!chatIds.length || !folderId) return 0;
    var placeholders = chatIds.map(function () { return '?'; }).join(', ');
    var rows = await sqlSelect(
      'SELECT COUNT(*) AS n FROM folder_bindings WHERE folder_id = ? AND chat_id IN (' + placeholders + ')',
      [folderId].concat(chatIds)
    );
    return Array.isArray(rows) && rows.length ? Number(rows[0].n) || 0 : 0;
  }

  async function sourcePair(args, result) {
    var explicitChat = cleanLower(args.chatSubjectId);
    var explicitFolder = cleanLower(args.folderSubjectId);
    if (isSha256Hex(explicitChat) && isSha256Hex(explicitFolder)) {
      return { chatSubjectId: explicitChat, folderSubjectId: explicitFolder };
    }
    if (!getInvoke()) {
      addCode(result.blockers, 'tauri-sql-unavailable');
      return null;
    }
    var chats = [];
    var folders = [];
    try {
      chats = await readChats();
      folders = await readFolders();
    } catch (_) {
      addCode(result.blockers, 'binding-proof-source-read-failed');
      return null;
    }
    for (var c = 0; c < chats.length; c += 1) {
      var chat = safeObject(chats[c]);
      if (!isLiveChat(chat)) continue;
      var chatIds = chatLocalIds(chat);
      if (!chatIds.length) continue;
      if (await bindingCountForChatIds(chatIds) > 0) continue;
      var chatHash = await chatSubjectId(firstString(chat, ['id']));
      for (var f = 0; f < folders.length; f += 1) {
        var folder = safeObject(folders[f]);
        if (!isLiveFolder(folder)) continue;
        var folderId = firstString(folder, ['id']);
        if (!folderId) continue;
        if (await exactBindingCount(chatIds, folderId) > 0) continue;
        var folderHash = await folderSubjectId(folderId);
        return { chatSubjectId: chatHash, folderSubjectId: folderHash };
      }
    }
    addCode(result.blockers, 'binding-proof-source-pair-required');
    return null;
  }

  function blocked(output) {
    var row = safeObject(output);
    return row.ok !== true && codeList(row.blockers).length > 0;
  }

  async function runIdentity(pair) {
    return safeObject(await H2O.Desktop.Sync.checkBindingIdentityAndCardinality({
      chatSubjectId: pair.chatSubjectId,
      folderSubjectId: pair.folderSubjectId
    }));
  }

  async function runMaterialization(pair) {
    return safeObject(await H2O.Desktop.Sync.checkBindingMaterialization({
      chatSubjectId: pair.chatSubjectId,
      folderSubjectId: pair.folderSubjectId
    }));
  }

  async function runPreflight(pair) {
    return safeObject(await H2O.Desktop.Sync.runBindingConvergencePreflight({
      chatSubjectId: pair.chatSubjectId,
      folderSubjectId: pair.folderSubjectId
    }));
  }

  async function duplicateBindingProof(pair, result) {
    try {
      var output = await runMaterialization(pair);
      var blockers = codeList(output.blockers);
      result.negativeProofs.duplicateBindingBlocked = blocked(output) &&
        blockers.indexOf('duplicate-folder-binding') !== -1;
      if (!result.negativeProofs.duplicateBindingBlocked) addCode(result.blockers, 'duplicate-binding-negative-proof-not-blocked');
    } catch (_) {
      addCode(result.blockers, 'duplicate-binding-negative-proof-failed');
    }
  }

  async function cardinalityViolationProof(pair, result) {
    try {
      var folders = await readFolders();
      var alternate = '';
      for (var i = 0; i < folders.length; i += 1) {
        var folder = safeObject(folders[i]);
        if (!isLiveFolder(folder)) continue;
        var subject = await folderSubjectId(firstString(folder, ['id']));
        if (subject && subject !== pair.folderSubjectId) {
          alternate = subject;
          break;
        }
      }
      if (!alternate) {
        addCode(result.warnings, 'cardinality-negative-fixture-unavailable');
        return;
      }
      var output = await runMaterialization({
        chatSubjectId: pair.chatSubjectId,
        folderSubjectId: alternate
      });
      var blockers = codeList(output.blockers);
      result.negativeProofs.cardinalityViolationBlocked = blocked(output) &&
        blockers.indexOf('binding-cardinality-violation') !== -1;
      if (!result.negativeProofs.cardinalityViolationBlocked) {
        addCode(result.warnings, 'cardinality-negative-proof-not-blocked');
      }
    } catch (_) {
      addCode(result.warnings, 'cardinality-negative-proof-failed');
    }
  }

  function stripRecordPrefix(value, kind) {
    var text = cleanString(value);
    var prefix = kind + ':';
    if (text.indexOf(prefix) === 0) {
      try {
        return decodeURIComponent(text.slice(prefix.length));
      } catch (_) {
        return text.slice(prefix.length);
      }
    }
    return text;
  }

  async function firstTombstonedSubject(kind) {
    try {
      var rows = await sqlSelect(
        'SELECT record_id FROM sync_tombstones WHERE record_kind = ? AND restored_at IS NULL ORDER BY deleted_at DESC LIMIT 10',
        [kind]
      );
      var list = Array.isArray(rows) ? rows : [];
      for (var i = 0; i < list.length; i += 1) {
        var localId = stripRecordPrefix(firstString(list[i], ['record_id', 'recordId']), kind);
        if (!localId) continue;
        if (kind === 'folder') return folderSubjectId(localId);
        if (kind === 'chat') return chatSubjectId(localId);
      }
    } catch (_) { /* unavailable fixture */ }
    return '';
  }

  async function folderTombstoneProof(pair, args, result) {
    try {
      var tombstonedFolder = cleanLower(args.tombstonedFolderSubjectId) || await firstTombstonedSubject('folder');
      if (!isSha256Hex(tombstonedFolder)) {
        addCode(result.warnings, 'folder-tombstone-negative-fixture-unavailable');
        return;
      }
      var output = await runMaterialization({
        chatSubjectId: pair.chatSubjectId,
        folderSubjectId: tombstonedFolder
      });
      var blockers = codeList(output.blockers);
      result.negativeProofs.folderTombstonedBlocked = blocked(output) &&
        (blockers.indexOf('folder-tombstoned') !== -1 || blockers.indexOf('binding-tombstone-not-safe') !== -1);
      if (!result.negativeProofs.folderTombstonedBlocked) addCode(result.warnings, 'folder-tombstone-negative-proof-not-blocked');
    } catch (_) {
      addCode(result.warnings, 'folder-tombstone-negative-proof-failed');
    }
  }

  async function chatTombstoneProof(pair, args, result) {
    try {
      var tombstonedChat = cleanLower(args.tombstonedChatSubjectId) || await firstTombstonedSubject('chat');
      if (!isSha256Hex(tombstonedChat)) {
        addCode(result.warnings, 'chat-tombstone-negative-fixture-unavailable');
        return;
      }
      var output = await runMaterialization({
        chatSubjectId: tombstonedChat,
        folderSubjectId: pair.folderSubjectId
      });
      var blockers = codeList(output.blockers);
      result.negativeProofs.chatTombstonedBlocked = blocked(output) &&
        (blockers.indexOf('chat-tombstoned') !== -1 || blockers.indexOf('binding-tombstone-not-safe') !== -1);
      if (!result.negativeProofs.chatTombstonedBlocked) addCode(result.warnings, 'chat-tombstone-negative-proof-not-blocked');
    } catch (_) {
      addCode(result.warnings, 'chat-tombstone-negative-proof-failed');
    }
  }

  function requireApis(result) {
    var sync = H2O.Desktop.Sync;
    [
      'checkBindingIdentityAndCardinality',
      'checkBindingMaterialization',
      'runBindingConvergencePreflight',
      'generateBindingProposalCandidate',
      'executeReviewedBindingAdd',
      'buildBindingApplyEvent',
      'finalizeBindingConvergence'
    ].forEach(function (name) {
      if (!sync || typeof sync[name] !== 'function') addCode(result.blockers, name + '-unavailable');
    });
  }

  async function runBindingConvergenceProof(input) {
    var args = safeObject(input);
    var result = baseResult();
    requireApis(result);
    if (!webCryptoAvailable()) addCode(result.blockers, 'web-crypto-unavailable');
    if (!getInvoke()) addCode(result.blockers, 'tauri-sql-unavailable');

    var pair = await sourcePair(args, result);
    if (result.blockers.length || !pair) return finish(result);

    var identity = null;
    var materialization = null;
    var preflight = null;
    var candidate = null;
    var bindingResult = null;
    var applyEventResult = null;
    var bookkeeping = null;

    try {
      identity = await runIdentity(pair);
      result.identityOk = identity.ok === true &&
        identity.canonicalOrderVerified === true &&
        identity.chatResolved === true &&
        identity.folderResolved === true &&
        identity.policySatisfied === true;
      codeList(identity.blockers).forEach(function (code) { addCode(result.blockers, code); });
      codeList(identity.warnings).forEach(function (code) { addCode(result.warnings, code); });
    } catch (_) {
      addCode(result.blockers, 'binding-proof-identity-failed');
    }
    if (!result.identityOk) return finish(result);

    try {
      materialization = await runMaterialization(pair);
      result.materializationOk = materialization.ok === true &&
        materialization.chatResolved === true &&
        materialization.folderResolved === true &&
        materialization.chatLive === true &&
        materialization.folderLive === true &&
        materialization.duplicateBinding === false &&
        materialization.cardinalitySatisfied === true &&
        materialization.tombstoneSafe === true &&
        materialization.orphanSafe === true;
      codeList(materialization.blockers).forEach(function (code) { addCode(result.blockers, code); });
      codeList(materialization.warnings).forEach(function (code) { addCode(result.warnings, code); });
    } catch (_) {
      addCode(result.blockers, 'binding-proof-materialization-failed');
    }
    if (!result.materializationOk) return finish(result);

    try {
      preflight = await runPreflight(pair);
      result.preflightOk = preflight.ok === true && preflight.actionable === true;
      codeList(preflight.blockers).forEach(function (code) { addCode(result.blockers, code); });
      codeList(preflight.warnings).forEach(function (code) { addCode(result.warnings, code); });
    } catch (_) {
      addCode(result.blockers, 'binding-proof-preflight-failed');
    }
    if (!result.preflightOk) return finish(result);

    await folderTombstoneProof(pair, args, result);
    await chatTombstoneProof(pair, args, result);

    try {
      candidate = safeObject(await H2O.Desktop.Sync.generateBindingProposalCandidate({
        chatSubjectId: pair.chatSubjectId,
        folderSubjectId: pair.folderSubjectId,
        operatorApprovalToken: cleanString(H2O.Desktop.Sync.__bindingProposalCandidateApprovalToken)
      }));
      result.proposalOk = candidate.ok === true &&
        safeObject(candidate.proposalCandidate).kind === 'proposal' &&
        !!cleanString(candidate.candidateId);
      codeList(candidate.blockers).forEach(function (code) { addCode(result.blockers, code); });
      codeList(candidate.warnings).forEach(function (code) { addCode(result.warnings, code); });
    } catch (_) {
      addCode(result.blockers, 'binding-proof-candidate-generation-failed');
    }
    if (!result.proposalOk) return finish(result);

    try {
      bindingResult = safeObject(await H2O.Desktop.Sync.executeReviewedBindingAdd({
        candidateId: cleanString(candidate.candidateId),
        operatorApprovalToken: cleanString(H2O.Desktop.Sync.__bindingReviewedApplyApprovalToken)
      }));
      result.bindOk = bindingResult.ok === true && bindingResult.bound === true;
      codeList(bindingResult.blockers).forEach(function (code) { addCode(result.blockers, code); });
      codeList(bindingResult.warnings).forEach(function (code) { addCode(result.warnings, code); });
    } catch (_) {
      addCode(result.blockers, 'binding-proof-local-bind-failed');
    }
    if (!result.bindOk) return finish(result);

    await duplicateBindingProof(pair, result);
    await cardinalityViolationProof(pair, result);
    if (result.blockers.length) return finish(result);

    try {
      applyEventResult = safeObject(await H2O.Desktop.Sync.buildBindingApplyEvent({ bindingResult: bindingResult }));
      result.applyEventOk = applyEventResult.ok === true &&
        safeObject(applyEventResult.applyEvent).kind === 'applyEvent';
      codeList(applyEventResult.blockers).forEach(function (code) { addCode(result.blockers, code); });
      codeList(applyEventResult.warnings).forEach(function (code) { addCode(result.warnings, code); });
    } catch (_) {
      addCode(result.blockers, 'binding-proof-applyEvent-failed');
    }
    if (!result.applyEventOk) return finish(result);

    try {
      bookkeeping = safeObject(await H2O.Desktop.Sync.finalizeBindingConvergence({ bindingResult: bindingResult }));
      result.consumedOk = bookkeeping.ok === true && isObject(bookkeeping.consumedRow);
      result.watermarkOk = bookkeeping.ok === true && isObject(bookkeeping.watermarkRow);
      codeList(bookkeeping.blockers).forEach(function (code) { addCode(result.blockers, code); });
      codeList(bookkeeping.warnings).forEach(function (code) { addCode(result.warnings, code); });
    } catch (_) {
      addCode(result.blockers, 'binding-proof-bookkeeping-failed');
    }

    return finish(result);
  }

  H2O.Desktop.Sync.runBindingConvergenceProof = runBindingConvergenceProof;
  H2O.Desktop.Sync.__bindingConvergenceProofInstalled = true;
  H2O.Desktop.Sync.__bindingConvergenceProofVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
