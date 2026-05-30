/* H2O Desktop Sync - F13.0.5a reviewed binding-add apply
 *
 * Desktop/Tauri-only, operator-approved local apply for exactly one generated
 * folder binding-add proposal candidate.
 *
 * Safety invariants:
 *   - Binding add only. No unbind, chat move between folders, cascade
 *     membership change, applyEvent, bookkeeping, publication, outbox enqueue,
 *     upload/download, WebDAV, convergence fan-out, remote apply, automatic
 *     merge, or mobile write-back.
 *   - The action reloads the generated proposal candidate, reruns F13 binding
 *     preflight/materialization, re-resolves local chat/folder rows, then
 *     performs one local SQL transaction: insert one folder_bindings row and
 *     insert one redacted maintenance audit row.
 *   - Output is redacted: binding/chat/folder subject hashes, lineage, state
 *     hashes, audit id, transaction id, blockers, and warnings only.
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
  if (H2O.Desktop.Sync.__bindingReviewedApplyInstalled) return;

  var SCHEMA = 'h2o.desktop.sync.binding-reviewed-apply.v1';
  var VERSION = '0.1.0-f13.0.5a';
  var DB_URL = 'sqlite:studio-v1.db';
  var PROPOSAL_LEDGER_KEY = 'h2o:sync:convergence-proposal-candidates:v1';
  var PROPOSAL_LEDGER_SCHEMA = 'h2o.desktop.sync.convergence-proposal-candidate-ledger.v1';
  var MAINTENANCE_SCHEMA = 'h2o.studio.sync.maintenance.v1';
  var POLICY_VERSION = 'h2o.folder-binding.add-reviewed.v1';
  var PROPOSAL_OPERATION = 'folder-binding-add-proposal';
  var APPLY_OPERATION = 'folder-binding-add-reviewed';
  var SUBJECT_TYPE = 'folderBinding';
  var FOLDER_SUBJECT_TYPE = 'folder.metadata';
  var CHAT_SUBJECT_PREFIX = 'chat:';
  var BINDING_SUBJECT_PREFIX = 'folderBinding:';
  var PREDICATE_VERSION = 'h2o.folder-binding.add-predicate.v1';
  var IDENTITY_VERSION = 'h2o.folder-binding.identity.v1';
  var POLICY_SINGLE = 'single-folder-per-chat';
  var POLICY_MULTI = 'multi-folder';
  var APPROVAL_TOKEN = 'I_APPROVE_REVIEWED_BINDING_ADD';
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

  function isSha256Hex(value) {
    return /^[0-9a-f]{64}$/.test(cleanLower(value));
  }

  function isStateHash(value) {
    return isSha256Hex(value);
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

  function generateUuid() {
    var bytes = new Uint8Array(16);
    if (global.crypto && typeof global.crypto.getRandomValues === 'function') {
      global.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var h = bytesToHex(bytes);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' +
      h.slice(16, 20) + '-' + h.slice(20, 32);
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

  function sqlExecute(query, values) {
    var invoke = getInvoke();
    if (!invoke) return Promise.reject(new Error('tauri invoke unavailable'));
    return invoke('plugin:sql|execute', { db: DB_URL, query: query, values: values || [] });
  }

  function readRowsAffected(result) {
    if (Array.isArray(result)) return Number(result[0]) || 0;
    if (result && typeof result === 'object') {
      if (result.rowsAffected != null) return Number(result.rowsAffected) || 0;
      if (result.rows_affected != null) return Number(result.rows_affected) || 0;
      if (result.affected != null) return Number(result.affected) || 0;
    }
    if (typeof result === 'number') return result;
    return 0;
  }

  function storageRef() {
    try {
      var s = global.chrome && global.chrome.storage && global.chrome.storage.local;
      if (s && typeof s.get === 'function') return s;
    } catch (_) { /* ignore */ }
    return null;
  }

  function storageGet(key) {
    return new Promise(function (resolve, reject) {
      var s = storageRef();
      if (!s) { reject(new Error('storage-unavailable')); return; }
      try {
        s.get([key], function (items) {
          var lastError = global.chrome && global.chrome.runtime && global.chrome.runtime.lastError;
          if (lastError) { reject(new Error(String(lastError.message || lastError))); return; }
          resolve(items && Object.prototype.hasOwnProperty.call(items, key) ? items[key] : null);
        });
      } catch (e) { reject(e); }
    });
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

  function placeholders(count) {
    var out = [];
    for (var i = 0; i < count; i += 1) out.push('?');
    return out.join(', ');
  }

  function uniqueStrings(values) {
    var out = [];
    for (var i = 0; i < values.length; i += 1) {
      var value = cleanString(values[i]);
      if (value && out.indexOf(value) === -1) out.push(value);
    }
    return out;
  }

  function encodeRecordPart(value) {
    return encodeURIComponent(cleanString(value));
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
      bound: false,
      subjectId: null,
      bindingSubjectId: null,
      chatSubjectId: null,
      folderSubjectId: null,
      lineageId: null,
      preStateHash: null,
      postStateHash: null,
      auditMaintenanceId: null,
      transactionId: null,
      blockers: [],
      warnings: []
    };
  }

  function resultFrom(fields, blockers, warnings) {
    var out = baseResult();
    Object.keys(safeObject(fields)).forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(out, key)) out[key] = fields[key];
    });
    out.blockers = codeList(blockers);
    out.warnings = codeList(warnings);
    out.ok = out.blockers.length === 0 && out.bound === true;
    var forbidden = foreverNoKey(out);
    if (forbidden) {
      out.ok = false;
      out.bound = false;
      addCode(out.blockers, 'binding-reviewed-apply-output-contains-forbidden-field');
      addCode(out.warnings, 'blocked-forbidden-key-' + forbidden);
    }
    return out;
  }

  function failure(blockers, warnings, fields) {
    return resultFrom(Object.assign({ bound: false }, safeObject(fields)), blockers, warnings);
  }

  function normalizeProposalLedger(raw) {
    if (!isObject(raw) || raw.schema !== PROPOSAL_LEDGER_SCHEMA || !Array.isArray(raw.rows)) return null;
    return {
      schema: raw.schema,
      rows: raw.rows.slice()
    };
  }

  function findByIds(rows, keys, id) {
    var needle = cleanString(id);
    for (var i = 0; i < rows.length; i += 1) {
      var row = safeObject(rows[i]);
      for (var k = 0; k < keys.length; k += 1) {
        if (cleanString(row[keys[k]]) === needle) return row;
      }
    }
    return null;
  }

  async function loadProposalCandidate(candidateId, blockers) {
    var raw;
    try {
      raw = await storageGet(PROPOSAL_LEDGER_KEY);
    } catch (_) {
      addCode(blockers, 'proposal-ledger-unavailable');
      return { ledger: null, row: null };
    }
    var ledger = normalizeProposalLedger(raw);
    if (!ledger) {
      addCode(blockers, 'proposal-ledger-malformed');
      return { ledger: null, row: null };
    }
    var row = findByIds(ledger.rows, ['rowId', 'envelopeId', 'eventDigest', 'dedupeKey'], candidateId);
    if (!row) addCode(blockers, 'proposal-candidate-not-found');
    return { ledger: ledger, row: row };
  }

  function parseEnvelope(row, blockers) {
    try {
      var parsed = JSON.parse(cleanString(row && row.serializedEnvelope));
      if (!isObject(parsed)) {
        addCode(blockers, 'proposal-envelope-malformed');
        return null;
      }
      return parsed;
    } catch (_) {
      addCode(blockers, 'proposal-envelope-malformed');
      return null;
    }
  }

  function proposedOperation(envelope) {
    return safeObject(safeObject(envelope && envelope.payload).proposedOperation);
  }

  function expectedPostState(envelope) {
    return safeObject(safeObject(envelope && envelope.payload).expectedPostState);
  }

  function baseHashFor(row, envelope) {
    return cleanLower(row.baseHash || proposedOperation(envelope).baseHash || expectedPostState(envelope).baseHash);
  }

  function targetHashFor(row, envelope) {
    return cleanLower(row.targetHash ||
      proposedOperation(envelope).targetHash ||
      expectedPostState(envelope).expectedPostStateHash);
  }

  function chatSubjectFor(row, envelope) {
    return cleanLower(row.chatSubjectId ||
      proposedOperation(envelope).chatSubjectId ||
      expectedPostState(envelope).chatSubjectId);
  }

  function folderSubjectFor(row, envelope) {
    return cleanLower(row.folderSubjectId ||
      proposedOperation(envelope).folderSubjectId ||
      expectedPostState(envelope).folderSubjectId);
  }

  async function canonicalBindingSubjectId(chatSubjectId, folderSubjectId) {
    return sha256Hex(BINDING_SUBJECT_PREFIX + cleanLower(chatSubjectId) + ':' + cleanLower(folderSubjectId));
  }

  async function absentStateHash(bindingSubjectId) {
    return sha256Hex(canonicalJson({
      subjectType: SUBJECT_TYPE,
      subjectId: cleanLower(bindingSubjectId),
      state: 'absent',
      predicateVersion: PREDICATE_VERSION
    }));
  }

  async function expectedPostStateHash(chatSubjectId, folderSubjectId, bindingSubjectId) {
    return sha256Hex(canonicalJson({
      subjectType: SUBJECT_TYPE,
      subjectId: cleanLower(bindingSubjectId),
      state: 'present',
      chatSubjectId: cleanLower(chatSubjectId),
      folderSubjectId: cleanLower(folderSubjectId),
      identityVersion: IDENTITY_VERSION,
      predicateVersion: PREDICATE_VERSION
    }));
  }

  function hashEquals(a, b) {
    return cleanLower(a) === cleanLower(b) && !!cleanLower(a);
  }

  function validateCandidateRow(row, envelope, blockers) {
    if (!row || !envelope) return;
    if (cleanString(row.status) !== 'generated') addCode(blockers, 'proposal-candidate-not-generated');
    if (cleanString(row.operationIntent) !== 'create') addCode(blockers, 'operation-intent-wrong-for-kind');
    if (cleanString(row.operation) !== PROPOSAL_OPERATION) addCode(blockers, 'operation-intent-wrong-for-kind');
    if (cleanString(envelope.kind) !== 'proposal') addCode(blockers, 'proposal-kind-required');
    if (cleanString(envelope.subjectType) !== SUBJECT_TYPE) addCode(blockers, 'subject-type-invalid');
    if (cleanString(envelope.operationIntent) !== 'create') addCode(blockers, 'operation-intent-wrong-for-kind');
    if (cleanString(envelope.operation) !== PROPOSAL_OPERATION) addCode(blockers, 'operation-intent-wrong-for-kind');
    if (!isSha256Hex(envelope.subjectId)) addCode(blockers, 'subject-id-invalid');
    if (!cleanString(envelope.lineageId)) addCode(blockers, 'lineage-id-required');
    if (!isSha256Hex(envelope.eventDigest)) addCode(blockers, 'eventDigest-invalid');
    if (!isSha256Hex(envelope.dedupeKey)) addCode(blockers, 'dedupeKey-invalid');
    if (cleanString(envelope.id) !== cleanString(row.envelopeId)) addCode(blockers, 'proposal-envelope-id-mismatch');
    if (cleanString(envelope.lineageId) !== cleanString(row.lineageId)) addCode(blockers, 'proposal-lineage-mismatch');
    if (cleanLower(envelope.subjectId) !== cleanLower(row.subjectId)) addCode(blockers, 'proposal-subject-mismatch');
    if (cleanLower(envelope.eventDigest) !== cleanLower(row.eventDigest)) addCode(blockers, 'proposal-eventDigest-mismatch');
    if (cleanLower(envelope.dedupeKey) !== cleanLower(row.dedupeKey)) addCode(blockers, 'proposal-dedupeKey-mismatch');
    if (cleanString(row.expiresAt)) {
      var rowExpires = Date.parse(cleanString(row.expiresAt));
      if (!Number.isFinite(rowExpires) || rowExpires <= Date.now()) addCode(blockers, 'proposal-expired');
    }
    if (cleanString(envelope.expiresAt)) {
      var envExpires = Date.parse(cleanString(envelope.expiresAt));
      if (!Number.isFinite(envExpires) || envExpires <= Date.now()) addCode(blockers, 'proposal-expired');
    }
    if (cleanString(safeObject(envelope.payload).predicateVersion) !== PREDICATE_VERSION) {
      addCode(blockers, 'predicate-version-mismatch');
    }
  }

  function validateCandidateUniqueness(ledger, candidate, blockers) {
    if (!ledger || !candidate) return;
    var rowId = cleanString(candidate.rowId);
    var envelopeId = cleanString(candidate.envelopeId);
    var eventDigest = cleanLower(candidate.eventDigest);
    var dedupeKey = cleanLower(candidate.dedupeKey);
    var subjectId = cleanLower(candidate.subjectId);
    var baseHash = cleanLower(candidate.baseHash);
    var targetHash = cleanLower(candidate.targetHash);
    var duplicateCount = 0;
    asArray(ledger.rows).forEach(function (value) {
      var row = safeObject(value);
      var sameRow = cleanString(row.rowId) === rowId || cleanString(row.envelopeId) === envelopeId;
      var sameDigest = eventDigest && cleanLower(row.eventDigest) === eventDigest;
      var sameDedupe = dedupeKey && cleanLower(row.dedupeKey) === dedupeKey;
      var sameState = subjectId && cleanLower(row.subjectId) === subjectId &&
        cleanLower(row.baseHash) === baseHash && cleanLower(row.targetHash) === targetHash;
      if ((sameDigest || sameDedupe || sameState) && !sameRow) duplicateCount += 1;
    });
    if (duplicateCount > 0) addCode(blockers, 'duplicate-proposal-candidate');
  }

  async function consumedSafeForCandidate(row, envelope, blockers, warnings) {
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
    var subjectId = cleanLower(envelope.subjectId || row.subjectId);
    var eventDigest = cleanLower(envelope.eventDigest || row.eventDigest);
    var dedupeKey = cleanLower(envelope.dedupeKey || row.dedupeKey);
    var safe = true;
    asArray(ledger.rows).forEach(function (value) {
      var consumed = safeObject(value);
      var sameSubject = subjectId && cleanLower(consumed.subjectId) === subjectId;
      var sameEvent = eventDigest && cleanLower(consumed.eventDigest) === eventDigest;
      var sameDedupe = dedupeKey && cleanLower(consumed.dedupeKey) === dedupeKey;
      if (!sameSubject && !sameEvent && !sameDedupe) return;
      safe = false;
      addCode(blockers, 'consumed-operation-present');
      var status = cleanString(consumed.consumedStatus);
      if (status) addCode(warnings, 'consumed-status-' + status);
    });
    return safe && ledger.ok === true && codeList(ledger.blockers).length === 0;
  }

  async function replaySafeForCandidate(row, envelope, blockers, warnings) {
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
    var dedupeKey = cleanLower(envelope.dedupeKey || row.dedupeKey);
    var eventDigest = cleanLower(envelope.eventDigest || row.eventDigest);
    asArray(index.replays).forEach(function (replay) {
      if (cleanLower(replay.dedupeKey) === dedupeKey || asArray(replay.eventDigests).map(cleanLower).indexOf(eventDigest) !== -1) {
        addCode(blockers, 'replay-detected');
      }
    });
    return index.ok === true && codeList(index.blockers).length === 0 && blockers.indexOf('replay-detected') === -1;
  }

  async function runBindingPreflight(chatSubjectId, folderSubjectId, blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.runBindingConvergencePreflight !== 'function') {
      addCode(blockers, 'binding-convergence-preflight-unavailable');
      return {};
    }
    var preflight;
    try {
      preflight = safeObject(await sync.runBindingConvergencePreflight({
        chatSubjectId: chatSubjectId,
        folderSubjectId: folderSubjectId
      }));
    } catch (_) {
      addCode(blockers, 'binding-convergence-preflight-failed');
      return {};
    }
    codeList(preflight.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(preflight.warnings).forEach(function (code) { addCode(warnings, code); });
    if (preflight.actionable !== true) addCode(blockers, 'binding-preflight-not-actionable');
    if (preflight.duplicateBinding === true) addCode(blockers, 'duplicate-folder-binding');
    if (preflight.cardinalitySatisfied !== true) addCode(blockers, 'binding-cardinality-violation');
    if (preflight.tombstoneSafe !== true) addCode(blockers, 'binding-tombstone-not-safe');
    if (preflight.orphanSafe !== true) addCode(blockers, 'binding-would-be-orphaned');
    if (preflight.watermarkSafe !== true) addCode(blockers, 'watermark-not-safe');
    if (preflight.replaySafe !== true) addCode(blockers, 'replay-detected');
    if (preflight.consumedSafe !== true) addCode(blockers, 'consumed-operation-present');
    return preflight;
  }

  async function runBindingMaterialization(chatSubjectId, folderSubjectId, blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.checkBindingMaterialization !== 'function') {
      addCode(blockers, 'binding-materialization-diagnostic-unavailable');
      return {};
    }
    var materialization;
    try {
      materialization = safeObject(await sync.checkBindingMaterialization({
        chatSubjectId: chatSubjectId,
        folderSubjectId: folderSubjectId
      }));
    } catch (_) {
      addCode(blockers, 'binding-materialization-diagnostic-failed');
      return {};
    }
    codeList(materialization.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(materialization.warnings).forEach(function (code) { addCode(warnings, code); });
    if (materialization.ok !== true) addCode(blockers, 'binding-materialization-not-ready');
    if (materialization.chatLive !== true) addCode(blockers, 'chat-not-live');
    if (materialization.folderLive !== true) addCode(blockers, 'folder-not-live');
    if (materialization.duplicateBinding === true) addCode(blockers, 'duplicate-folder-binding');
    if (materialization.cardinalitySatisfied !== true) addCode(blockers, 'binding-cardinality-violation');
    if (materialization.tombstoneSafe !== true) addCode(blockers, 'binding-tombstone-not-safe');
    if (materialization.orphanSafe !== true) addCode(blockers, 'binding-would-be-orphaned');
    return materialization;
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
      var rowId = firstString(row, ['id']);
      var rawIds = uniqueStrings([
        rowId,
        firstString(row, ['source_id', 'sourceId'])
      ]);
      for (var j = 0; j < rawIds.length; j += 1) {
        var subject = await chatSubjectId(rawIds[j]);
        if (subject === target) {
          matches.push({ row: row, localIds: rawIds, matchedId: rawIds[j], bindingLocalId: rowId });
          break;
        }
      }
    }
    if (matches.length === 0) {
      addCode(blockers, 'chat-not-resolved');
      return { resolved: false, localIds: [], bindingLocalId: '', live: false };
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
      bindingLocalId: cleanString(match.bindingLocalId),
      live: live
    };
  }

  async function tableInfoPolicy() {
    var rows = await sqlSelect('PRAGMA table_info(folder_bindings)', []);
    var info = Array.isArray(rows) ? rows : [];
    if (!info.length) return '';
    var pkCols = info.map(function (row) {
      return { name: cleanLower(row.name), pk: Number(row.pk) || 0 };
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
    var sql = cleanLower(Array.isArray(rows) && rows[0] ? rows[0].sql : '');
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
    return '';
  }

  async function countExactBinding(chatIds, folderLocalId, blockers) {
    var ids = uniqueStrings(chatIds);
    if (!ids.length || !folderLocalId) return 0;
    try {
      var rows = await sqlSelect(
        'SELECT COUNT(*) AS n FROM folder_bindings WHERE folder_id = ? AND chat_id IN (' +
          placeholders(ids.length) +
          ')',
        [folderLocalId].concat(ids)
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

  async function tableExists(tableName) {
    var rows = await sqlSelect(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
      [tableName]
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

  async function validateLocalBindingCandidate(chatSubject, folderSubject, baseHash, targetHash, blockers, warnings) {
    var chat = await resolveChat(chatSubject, blockers, warnings);
    var folder = await resolveFolder(folderSubject, blockers);
    if (!chat.resolved) addCode(blockers, 'chat-not-resolved');
    if (!folder.resolved) addCode(blockers, 'folder-not-resolved');
    if (!chat.live) addCode(blockers, 'chat-not-live');
    if (!folder.live) addCode(blockers, 'folder-not-live');
    if (!chat.bindingLocalId) addCode(blockers, 'chat-local-id-unavailable');

    var exactCount = 0;
    var folderCountForChat = 0;
    var policy = '';
    if (chat.resolved && folder.resolved) {
      exactCount = await countExactBinding(chat.localIds, folder.localId, blockers);
      folderCountForChat = await countFoldersForChat(chat.localIds, blockers);
      if (exactCount !== 0) addCode(blockers, 'duplicate-folder-binding');
      policy = await determinePolicy(blockers, warnings);
      if (policy === POLICY_SINGLE && folderCountForChat !== 0) addCode(blockers, 'binding-cardinality-violation');
      if (policy === POLICY_MULTI && exactCount !== 0) addCode(blockers, 'binding-cardinality-violation');

      var folderTombstoned = await activeTombstoneExists('folder', [
        folder.localId,
        'folder:' + encodeRecordPart(folder.localId)
      ], blockers);
      var chatTombstoned = await activeTombstoneExists('chat', chat.localIds.concat(
        chat.localIds.map(function (id) { return 'chat:' + encodeRecordPart(id); })
      ), blockers);
      var bindingTombstoned = await activeTombstoneExists('folderBinding', chat.localIds.map(function (id) {
        return 'folderBinding:' + encodeRecordPart(id) + ':' + encodeRecordPart(folder.localId);
      }), blockers);
      if (folderTombstoned) addCode(blockers, 'folder-tombstoned');
      if (chatTombstoned) addCode(blockers, 'chat-tombstoned');
      if (bindingTombstoned) addCode(blockers, 'binding-tombstoned');
    }

    var computedSubject = '';
    var computedBaseHash = '';
    var computedTargetHash = '';
    if (isSha256Hex(chatSubject) && isSha256Hex(folderSubject)) {
      computedSubject = await canonicalBindingSubjectId(chatSubject, folderSubject);
      computedBaseHash = await absentStateHash(computedSubject);
      computedTargetHash = await expectedPostStateHash(chatSubject, folderSubject, computedSubject);
      if (!hashEquals(baseHash, computedBaseHash)) addCode(blockers, 'baseline-hash-mismatch');
      if (!hashEquals(targetHash, computedTargetHash)) addCode(blockers, 'target-hash-mismatch');
    }

    return {
      chat: chat,
      folder: folder,
      policy: policy,
      exactCount: exactCount,
      folderCountForChat: folderCountForChat,
      bindingSubjectId: computedSubject,
      preStateHash: computedBaseHash,
      postStateHash: computedTargetHash
    };
  }

  async function beginTransaction(blockers) {
    try {
      await sqlExecute('BEGIN IMMEDIATE', []);
      return true;
    } catch (_) {
      addCode(blockers, 'transaction-begin-failed');
      return false;
    }
  }

  async function rollbackQuietly(warnings) {
    try {
      await sqlExecute('ROLLBACK', []);
    } catch (_) {
      addCode(warnings, 'transaction-rollback-failed');
    }
  }

  async function commitTransaction(blockers) {
    try {
      await sqlExecute('COMMIT', []);
      return true;
    } catch (_) {
      addCode(blockers, 'transaction-commit-failed');
      return false;
    }
  }

  async function insertBinding(chatLocalId, folderLocalId, assignedAt, blockers) {
    try {
      var result = await sqlExecute(
        'INSERT INTO folder_bindings (chat_id, folder_id, assigned_at) VALUES (?, ?, ?)',
        [chatLocalId, folderLocalId, assignedAt]
      );
      if (readRowsAffected(result) !== 1) addCode(blockers, 'binding-insert-row-count-mismatch');
    } catch (_) {
      addCode(blockers, 'binding-insert-failed');
    }
  }

  function buildAuditResultJson(fields) {
    return canonicalJson({
      redacted: true,
      operation: APPLY_OPERATION,
      policyVersion: POLICY_VERSION,
      entityKind: SUBJECT_TYPE,
      subjectId: cleanLower(fields.subjectId),
      bindingSubjectId: cleanLower(fields.bindingSubjectId),
      chatSubjectId: cleanLower(fields.chatSubjectId),
      folderSubjectId: cleanLower(fields.folderSubjectId),
      lineageId: cleanString(fields.lineageId),
      proposalEnvelopeId: cleanString(fields.proposalEnvelopeId),
      eventDigest: cleanLower(fields.eventDigest),
      dedupeKey: cleanLower(fields.dedupeKey),
      rowsInserted: 1,
      cardinalityPolicy: cleanString(fields.cardinalityPolicy),
      duplicateBinding: false,
      cardinalitySatisfied: true,
      tombstoneSafe: true,
      orphanSafe: true,
      localOnly: true,
      syncPropagated: false,
      receiptEnvelopeEmitted: false
    });
  }

  async function readIdentityPeerId(blockers) {
    var identity = H2O.Studio && H2O.Studio.identity;
    var raw = null;
    try {
      if (identity && typeof identity.whenReady === 'function') raw = await Promise.resolve(identity.whenReady());
      else if (identity && typeof identity.get === 'function') raw = identity.get();
    } catch (_) {
      raw = null;
    }
    var peerId = cleanString(raw && raw.syncPeerId);
    if (!peerId) {
      addCode(blockers, 'invalid-peer-identity');
      return '';
    }
    return peerId;
  }

  async function insertAudit(auditId, nowIso, peerId, resultJson, blockers) {
    try {
      var result = await sqlExecute(
        'INSERT INTO sync_maintenance_log (' +
          'maintenance_id, schema, operation, policy_version, reason, requested_at, ' +
          'requested_by_sync_peer_id, platform, dry_run, affected_tombstone_count, ' +
          'affected_review_count, skipped_count, warnings_json, result_json, created_at' +
        ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?)',
        [
          auditId,
          MAINTENANCE_SCHEMA,
          APPLY_OPERATION,
          POLICY_VERSION,
          APPLY_OPERATION,
          nowIso,
          peerId,
          'desktop-tauri',
          '[]',
          resultJson,
          nowIso
        ]
      );
      if (readRowsAffected(result) !== 1) addCode(blockers, 'audit-insert-failed');
    } catch (_) {
      addCode(blockers, 'audit-insert-failed');
    }
  }

  async function executeTransaction(ctx, blockers, warnings) {
    var inTxn = await beginTransaction(blockers);
    if (!inTxn) return false;

    try {
      var pre = await validateLocalBindingCandidate(
        ctx.chatSubjectId,
        ctx.folderSubjectId,
        ctx.preStateHash,
        ctx.postStateHash,
        blockers,
        warnings
      );
      if (blockers.length) {
        await rollbackQuietly(warnings);
        return false;
      }

      await insertBinding(pre.chat.bindingLocalId, pre.folder.localId, ctx.assignedAt, blockers);
      if (blockers.length) {
        await rollbackQuietly(warnings);
        return false;
      }

      await insertAudit(ctx.auditMaintenanceId, ctx.nowIso, ctx.peerId, ctx.auditResultJson, blockers);
      if (blockers.length) {
        await rollbackQuietly(warnings);
        return false;
      }

      if (!await commitTransaction(blockers)) {
        await rollbackQuietly(warnings);
        return false;
      }
      return true;
    } catch (_) {
      addCode(blockers, 'transaction-failed');
      await rollbackQuietly(warnings);
      return false;
    }
  }

  async function verifyPostState(chat, folder, policy, blockers) {
    var exactCount = await countExactBinding(chat.localIds, folder.localId, blockers);
    var folderCount = await countFoldersForChat(chat.localIds, blockers);
    if (exactCount !== 1) addCode(blockers, 'binding-verification-failed');
    if (policy === POLICY_SINGLE && folderCount !== 1) addCode(blockers, 'binding-cardinality-violation');
    if (policy === POLICY_MULTI && folderCount < 1) addCode(blockers, 'binding-cardinality-violation');
    return exactCount === 1 && (policy !== POLICY_SINGLE || folderCount === 1);
  }

  async function executeReviewedBindingAdd(input) {
    var args = safeObject(input);
    var blockers = [];
    var warnings = [];
    var candidateId = cleanString(args.candidateId);

    if (!webCryptoAvailable()) addCode(blockers, 'web-crypto-unavailable');
    if (!getInvoke()) addCode(blockers, 'tauri-sql-unavailable');
    if (!candidateId) addCode(blockers, 'candidateId-required');
    if (cleanString(args.operatorApprovalToken) !== APPROVAL_TOKEN) {
      addCode(blockers, 'operator-approval-token-required');
    }

    var loaded = candidateId ? await loadProposalCandidate(candidateId, blockers) : { ledger: null, row: null };
    var candidate = loaded.row;
    var envelope = candidate ? parseEnvelope(candidate, blockers) : null;
    validateCandidateRow(candidate, envelope, blockers);
    validateCandidateUniqueness(loaded.ledger, candidate, blockers);
    if (candidate && envelope) {
      await consumedSafeForCandidate(candidate, envelope, blockers, warnings);
      await replaySafeForCandidate(candidate, envelope, blockers, warnings);
    }

    var subjectId = cleanLower(envelope && envelope.subjectId);
    var bindingSubjectId = cleanLower(candidate && candidate.subjectId || subjectId);
    var chatSubject = candidate && envelope ? chatSubjectFor(candidate, envelope) : '';
    var folderSubject = candidate && envelope ? folderSubjectFor(candidate, envelope) : '';
    var lineageId = cleanString(envelope && envelope.lineageId || candidate && candidate.lineageId);
    var preStateHash = candidate && envelope ? baseHashFor(candidate, envelope) : '';
    var postStateHash = candidate && envelope ? targetHashFor(candidate, envelope) : '';

    if (!isSha256Hex(bindingSubjectId)) addCode(blockers, 'binding-subject-id-unavailable');
    if (!isSha256Hex(subjectId)) addCode(blockers, 'subject-id-invalid');
    if (subjectId && bindingSubjectId && subjectId !== bindingSubjectId) addCode(blockers, 'proposal-subject-mismatch');
    if (!isSha256Hex(chatSubject)) addCode(blockers, 'invalid-chat-subject-id');
    if (!isSha256Hex(folderSubject)) addCode(blockers, 'invalid-folder-subject-id');
    if (!lineageId) addCode(blockers, 'lineage-id-required');
    if (!isStateHash(preStateHash)) addCode(blockers, 'baseline-hash-not-verified');
    if (!isStateHash(postStateHash)) addCode(blockers, 'target-hash-unavailable');

    var recomputedSubject = '';
    if (isSha256Hex(chatSubject) && isSha256Hex(folderSubject) && webCryptoAvailable()) {
      recomputedSubject = await canonicalBindingSubjectId(chatSubject, folderSubject);
      if (bindingSubjectId !== recomputedSubject) addCode(blockers, 'binding-subject-id-order-mismatch');
    }

    if (candidate && envelope) {
      await runBindingPreflight(chatSubject, folderSubject, blockers, warnings);
      await runBindingMaterialization(chatSubject, folderSubject, blockers, warnings);
    }

    var expectedPre = '';
    var expectedPost = '';
    if (isSha256Hex(bindingSubjectId) && isSha256Hex(chatSubject) && isSha256Hex(folderSubject)) {
      expectedPre = await absentStateHash(bindingSubjectId);
      expectedPost = await expectedPostStateHash(chatSubject, folderSubject, bindingSubjectId);
      if (!hashEquals(preStateHash, expectedPre)) addCode(blockers, 'baseline-hash-mismatch');
      if (!hashEquals(postStateHash, expectedPost)) addCode(blockers, 'target-hash-mismatch');
    }

    var local = null;
    if (!blockers.length) {
      local = await validateLocalBindingCandidate(
        chatSubject,
        folderSubject,
        preStateHash,
        postStateHash,
        blockers,
        warnings
      );
    }

    var peerId = await readIdentityPeerId(blockers);
    var transactionId = 'transaction:' + generateUuid();
    var auditMaintenanceId = 'maintenance:' + generateUuid();
    var nowIso = nowIsoSeconds();
    var assignedAt = Date.now();
    var auditResultJson = '';

    if (!blockers.length && local) {
      auditResultJson = buildAuditResultJson({
        subjectId: subjectId,
        bindingSubjectId: bindingSubjectId,
        chatSubjectId: chatSubject,
        folderSubjectId: folderSubject,
        lineageId: lineageId,
        proposalEnvelopeId: cleanString(envelope.id),
        eventDigest: cleanLower(envelope.eventDigest),
        dedupeKey: cleanLower(envelope.dedupeKey),
        cardinalityPolicy: local.policy
      });
      var forbiddenAudit = foreverNoKey(JSON.parse(auditResultJson));
      if (forbiddenAudit) {
        addCode(blockers, 'audit-result-contains-forbidden-field');
        addCode(warnings, 'blocked-forbidden-key-' + forbiddenAudit);
      }
    }

    if (blockers.length) {
      return failure(blockers, warnings, {
        subjectId: subjectId || null,
        bindingSubjectId: bindingSubjectId || null,
        chatSubjectId: chatSubject || null,
        folderSubjectId: folderSubject || null,
        lineageId: lineageId || null,
        preStateHash: preStateHash || null,
        postStateHash: postStateHash || null
      });
    }

    var applied = await executeTransaction({
      chatSubjectId: chatSubject,
      folderSubjectId: folderSubject,
      preStateHash: preStateHash,
      postStateHash: postStateHash,
      assignedAt: assignedAt,
      nowIso: nowIso,
      peerId: peerId,
      auditMaintenanceId: auditMaintenanceId,
      auditResultJson: auditResultJson
    }, blockers, warnings);
    if (!applied) {
      return failure(blockers.length ? blockers : ['binding-reviewed-apply-failed'], warnings, {
        subjectId: subjectId,
        bindingSubjectId: bindingSubjectId,
        chatSubjectId: chatSubject,
        folderSubjectId: folderSubject,
        lineageId: lineageId,
        preStateHash: preStateHash,
        postStateHash: postStateHash,
        transactionId: transactionId
      });
    }

    await verifyPostState(local.chat, local.folder, local.policy, blockers);
    if (blockers.length) {
      return resultFrom({
        bound: true,
        subjectId: subjectId,
        bindingSubjectId: bindingSubjectId,
        chatSubjectId: chatSubject,
        folderSubjectId: folderSubject,
        lineageId: lineageId,
        preStateHash: preStateHash,
        postStateHash: postStateHash,
        auditMaintenanceId: auditMaintenanceId,
        transactionId: transactionId
      }, blockers, warnings);
    }

    return resultFrom({
      bound: true,
      subjectId: subjectId,
      bindingSubjectId: bindingSubjectId,
      chatSubjectId: chatSubject,
      folderSubjectId: folderSubject,
      lineageId: lineageId,
      preStateHash: preStateHash,
      postStateHash: postStateHash,
      auditMaintenanceId: auditMaintenanceId,
      transactionId: transactionId
    }, blockers, warnings);
  }

  H2O.Desktop.Sync.executeReviewedBindingAdd = executeReviewedBindingAdd;
  H2O.Desktop.Sync.__bindingReviewedApplyInstalled = true;
  H2O.Desktop.Sync.__bindingReviewedApplyVersion = VERSION;
  H2O.Desktop.Sync.__bindingReviewedApplyApprovalToken = APPROVAL_TOKEN;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
