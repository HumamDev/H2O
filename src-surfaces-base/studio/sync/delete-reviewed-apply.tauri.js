/* H2O Desktop Sync - F12.0.4c F5 reviewed empty-folder delete apply
 *
 * Desktop/Tauri-only, operator-approved destructive apply for exactly one
 * F5-reviewed empty-folder delete.
 *
 * Safety invariants:
 *   - Delete only. No receipt envelope emission, bookkeeping, publication,
 *     outbox enqueue, upload/download, WebDAV, convergence fan-out, remote
 *     apply, automatic merge, or mobile write-back.
 *   - The action requires an approved/pending-approved F5 review row, reruns
 *     F12 handoff/preflight checks, then performs one tombstone-first local
 *     SQL transaction: insert tombstone, delete one empty folder, insert audit.
 *   - Output is redacted: subject hash, lineage, tombstone id, audit id,
 *     blockers, and warnings only.
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
  if (H2O.Desktop.Sync.__deleteReviewedApplyInstalled) return;

  var SCHEMA = 'h2o.desktop.sync.delete-reviewed-apply.v1';
  var VERSION = '0.1.0-f12.0.4c';
  var DB_URL = 'sqlite:studio-v1.db';
  var REVIEW_LEDGER_KEY = 'h2o:sync:delete-f5-review-rows:v1';
  var REVIEW_LEDGER_SCHEMA = 'h2o.desktop.sync.delete-f5-review-row-ledger.v1';
  var PROPOSAL_LEDGER_KEY = 'h2o:sync:convergence-proposal-candidates:v1';
  var PROPOSAL_LEDGER_SCHEMA = 'h2o.desktop.sync.convergence-proposal-candidate-ledger.v1';
  var TOMBSTONE_SCHEMA = 'h2o.studio.tombstone.v1';
  var MAINTENANCE_SCHEMA = 'h2o.studio.sync.maintenance.v1';
  var POLICY_VERSION = 'h2o.folder-delete.f5-reviewed.v1';
  var OPERATION = 'f5-reviewed-empty-folder-delete';
  var PROPOSAL_OPERATION = 'folder-metadata-delete-proposed';
  var SUBJECT_TYPE = 'folder.metadata';
  var APPROVAL_TOKEN = 'I_APPROVE_F5_REVIEWED_EMPTY_FOLDER_DELETE';
  var ALLOWED_REVIEW_STATUS = { approved: true, 'pending-approved': true };
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

  function parseMeta(raw) {
    if (raw == null || raw === '') return {};
    if (isObject(raw)) return raw;
    if (typeof raw !== 'string') return {};
    try {
      var parsed = JSON.parse(raw);
      return isObject(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function rowToFolder(row) {
    var r = safeObject(row);
    if (!r.id) return null;
    return {
      folderId: r.id == null ? null : r.id,
      name: r.name == null ? null : r.name,
      parentId: r.parent_id == null ? null : r.parent_id,
      color: r.color == null ? null : r.color,
      sortOrder: r.sort_order == null ? null : Number(r.sort_order),
      source: r.source == null ? null : r.source,
      createdAt: r.created_at == null ? null : r.created_at,
      updatedAt: r.updated_at == null ? null : r.updated_at,
      meta: parseMeta(r.meta_json)
    };
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

  async function folderSubjectId(folderId) {
    return sha256Hex(SUBJECT_TYPE + ':' + cleanString(folderId));
  }

  async function parentSubjectId(parentId) {
    var id = cleanString(parentId);
    return id ? sha256Hex(SUBJECT_TYPE + ':' + id) : null;
  }

  function isLiveFolder(row) {
    var r = safeObject(row);
    if (!r.folderId) return false;
    if (r.deleted === true || r.isDeleted === true || r.tombstoned === true) return false;
    if (firstString(r, ['deletedAt', 'deleted_at', 'removedAt', 'removed_at'])) return false;
    if (firstString(r, ['tombstoneId', 'tombstone_id'])) return false;
    return true;
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
      deleted: false,
      subjectId: null,
      lineageId: null,
      tombstoneId: null,
      auditMaintenanceId: null,
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
    out.ok = out.blockers.length === 0 && out.deleted === true;
    var forbidden = foreverNoKey(out);
    if (forbidden) {
      out.ok = false;
      out.deleted = false;
      addCode(out.blockers, 'delete-reviewed-apply-output-contains-forbidden-field');
      addCode(out.warnings, 'blocked-forbidden-key-' + forbidden);
    }
    return out;
  }

  function failure(blockers, warnings, fields) {
    return resultFrom(Object.assign({ deleted: false }, safeObject(fields)), blockers, warnings);
  }

  function normalizeReviewLedger(raw) {
    if (!isObject(raw) || raw.schema !== REVIEW_LEDGER_SCHEMA || !Array.isArray(raw.rows)) return null;
    return { schema: raw.schema, rows: raw.rows.slice() };
  }

  function normalizeProposalLedger(raw) {
    if (!isObject(raw) || raw.schema !== PROPOSAL_LEDGER_SCHEMA || !Array.isArray(raw.rows)) return null;
    return { schema: raw.schema, rows: raw.rows.slice() };
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

  async function loadReviewRow(reviewId, blockers) {
    var raw;
    try {
      raw = await storageGet(REVIEW_LEDGER_KEY);
    } catch (_) {
      addCode(blockers, 'delete-f5-review-ledger-unavailable');
      return null;
    }
    var ledger = normalizeReviewLedger(raw);
    if (!ledger) {
      addCode(blockers, 'delete-f5-review-ledger-malformed');
      return null;
    }
    var row = findByIds(ledger.rows, ['reviewId'], reviewId);
    if (!row) addCode(blockers, 'delete-f5-review-row-not-found');
    return row;
  }

  async function loadProposalCandidate(candidateId, blockers) {
    var raw;
    try {
      raw = await storageGet(PROPOSAL_LEDGER_KEY);
    } catch (_) {
      addCode(blockers, 'proposal-ledger-unavailable');
      return null;
    }
    var ledger = normalizeProposalLedger(raw);
    if (!ledger) {
      addCode(blockers, 'proposal-ledger-malformed');
      return null;
    }
    var row = findByIds(ledger.rows, ['rowId', 'envelopeId', 'eventDigest', 'dedupeKey'], candidateId);
    if (!row) addCode(blockers, 'proposal-candidate-not-found');
    return row;
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
    return safeObject(safeObject(envelope.payload).proposedOperation);
  }

  function expectedPostState(envelope) {
    return safeObject(safeObject(envelope.payload).expectedPostState);
  }

  function baseHashFor(row, envelope) {
    return cleanLower(row.baseHash ||
      proposedOperation(envelope).baseHash ||
      expectedPostState(envelope).baseHash);
  }

  function targetHashFor(row, envelope) {
    return cleanLower(row.targetHash ||
      row.expectedPostStateHash ||
      expectedPostState(envelope).expectedPostStateHash ||
      expectedPostState(envelope).revisionHash ||
      expectedPostState(envelope).tombstoneHash);
  }

  function justifyingEvidenceDigests(envelope, row) {
    var payload = safeObject(envelope.payload);
    var payloadValues = asArray(payload.justifyingEvidenceDigests)
      .map(cleanLower)
      .filter(isSha256Hex);
    if (payloadValues.length) return payloadValues;
    return asArray(row.justifyingEvidenceDigests)
      .map(cleanLower)
      .filter(isSha256Hex);
  }

  function plannerEntryFrom(row, envelope) {
    return {
      bucket: 'delete',
      subjectId: cleanLower(envelope.subjectId),
      lineageId: cleanString(envelope.lineageId),
      eventDigest: cleanLower(envelope.eventDigest),
      dedupeKey: cleanLower(envelope.dedupeKey),
      sourcePeerId: cleanLower(safeObject(safeObject(envelope.sourcePlatform).sourcePeerEnvelope).syncPeerIdHash),
      sourcePlatform: safeObject(envelope.sourcePlatform),
      baseHash: baseHashFor(row, envelope),
      localRevisionHash: baseHashFor(row, envelope),
      targetHash: targetHashFor(row, envelope),
      operation: PROPOSAL_OPERATION,
      operationIntent: 'delete',
      justifyingEvidenceDigests: justifyingEvidenceDigests(envelope, row),
      payload: {
        proposedOperation: proposedOperation(envelope),
        expectedPostState: expectedPostState(envelope),
        predicateVersion: cleanString(safeObject(envelope.payload).predicateVersion)
      }
    };
  }

  function validateReviewRow(row, blockers) {
    if (!row) return;
    if (cleanString(row.schema) !== 'h2o.desktop.sync.delete-f5-review-row.v1') {
      addCode(blockers, 'delete-f5-review-row-schema-invalid');
    }
    if (!cleanString(row.reviewId)) addCode(blockers, 'review-id-required');
    if (!cleanString(row.candidateId)) addCode(blockers, 'candidateId-required');
    if (!cleanString(row.proposalEnvelopeId)) addCode(blockers, 'proposal-envelope-id-required');
    if (!isSha256Hex(row.subjectId)) addCode(blockers, 'subject-id-invalid');
    if (!cleanString(row.lineageId)) addCode(blockers, 'lineage-id-required');
    if (!ALLOWED_REVIEW_STATUS[cleanString(row.reviewStatus)]) addCode(blockers, 'delete-f5-review-not-approved');
    if (!cleanString(row.predicateVersion)) addCode(blockers, 'delete-proposal-missing-f5-predicate');
    if (!asArray(row.justifyingEvidenceDigests).map(cleanLower).filter(isSha256Hex).length) {
      addCode(blockers, 'delete-proposal-missing-f5-predicate');
    }
  }

  function validateCandidateRow(row, envelope, blockers) {
    if (!row || !envelope) return;
    if (cleanString(row.status) !== 'generated') addCode(blockers, 'proposal-candidate-not-generated');
    if (cleanString(row.operationIntent) !== 'delete') addCode(blockers, 'operation-intent-wrong-for-kind');
    if (cleanString(row.operation) !== PROPOSAL_OPERATION) addCode(blockers, 'operation-intent-wrong-for-kind');
    if (cleanString(envelope.kind) !== 'proposal') addCode(blockers, 'proposal-kind-required');
    if (cleanString(envelope.operationIntent) !== 'delete') addCode(blockers, 'operation-intent-wrong-for-kind');
    if (cleanString(envelope.operation) !== PROPOSAL_OPERATION) addCode(blockers, 'operation-intent-wrong-for-kind');
    if (cleanString(envelope.subjectType) !== SUBJECT_TYPE) addCode(blockers, 'subject-type-invalid');
    if (!isSha256Hex(envelope.subjectId)) addCode(blockers, 'subject-id-invalid');
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
    if (!cleanString(safeObject(envelope.payload).predicateVersion)) {
      addCode(blockers, 'delete-proposal-missing-f5-predicate');
    }
    if (!justifyingEvidenceDigests(envelope, row).length) {
      addCode(blockers, 'delete-proposal-missing-f5-predicate');
    }
    if (expectedPostState(envelope).membershipCount !== 0 ||
        expectedPostState(envelope).childFolderCount !== 0) {
      addCode(blockers, 'folder-not-empty');
    }
  }

  function validateReviewMatchesCandidate(review, row, envelope, blockers) {
    if (!review || !row || !envelope) return;
    if (cleanString(review.candidateId) !== cleanString(row.rowId)) addCode(blockers, 'review-candidate-mismatch');
    if (cleanString(review.proposalEnvelopeId) !== cleanString(envelope.id)) addCode(blockers, 'review-proposal-envelope-mismatch');
    if (cleanLower(review.subjectId) !== cleanLower(envelope.subjectId)) addCode(blockers, 'review-subject-mismatch');
    if (cleanString(review.lineageId) !== cleanString(envelope.lineageId)) addCode(blockers, 'review-lineage-mismatch');
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

  async function runHandoffPreview(candidateId, blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.previewDeleteF5Handoff !== 'function') {
      addCode(blockers, 'delete-f5-handoff-preview-unavailable');
      return null;
    }
    try {
      var preview = safeObject(await sync.previewDeleteF5Handoff({ candidateId: candidateId }));
      codeList(preview.blockers).forEach(function (code) { addCode(blockers, code); });
      codeList(preview.warnings).forEach(function (code) { addCode(warnings, code); });
      if (preview.ok !== true || preview.handoffReady !== true) addCode(blockers, 'delete-f5-handoff-not-ready');
      if (Number(preview.membershipCount) !== 0 || Number(preview.childFolderCount) !== 0) {
        addCode(blockers, 'folder-not-empty');
      }
      return preview;
    } catch (_) {
      addCode(blockers, 'delete-f5-handoff-preview-failed');
      return null;
    }
  }

  async function runDeletePreflight(entry, blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.runDeleteConvergencePreflight !== 'function') {
      addCode(blockers, 'delete-convergence-preflight-unavailable');
      return null;
    }
    try {
      var preflight = safeObject(await sync.runDeleteConvergencePreflight({ plannerEntry: entry }));
      codeList(preflight.blockers).forEach(function (code) { addCode(blockers, code); });
      codeList(preflight.warnings).forEach(function (code) { addCode(warnings, code); });
      if (preflight.actionable !== true) addCode(blockers, 'delete-preflight-not-actionable');
      if (preflight.emptyFolder !== true) addCode(blockers, 'folder-not-empty');
      if (preflight.baseFresh !== true) addCode(blockers, 'baseline-hash-not-verified');
      if (preflight.deleteVsEditConflict === true) addCode(blockers, 'delete-vs-edit-conflict');
      if (preflight.recoveryReady !== true) addCode(blockers, 'recovery-precondition-unmet');
      if (preflight.tombstoneCapable !== true) addCode(blockers, 'f5-tombstone-path-unavailable');
      return preflight;
    } catch (_) {
      addCode(blockers, 'delete-convergence-preflight-failed');
      return null;
    }
  }

  async function readFolderById(folderId) {
    var rows = await sqlSelect('SELECT * FROM folders WHERE id = ? LIMIT 1', [folderId]);
    if (!Array.isArray(rows) || !rows.length) return null;
    return rowToFolder(rows[0]);
  }

  async function readAllFolders() {
    var rows = await sqlSelect('SELECT * FROM folders ORDER BY sort_order ASC, name ASC', []);
    return (Array.isArray(rows) ? rows : []).map(rowToFolder).filter(Boolean);
  }

  async function resolveFolderBySubject(subjectId, blockers) {
    var rows;
    try {
      rows = await readAllFolders();
    } catch (_) {
      addCode(blockers, 'folder-row-source-unavailable');
      return null;
    }
    var target = cleanLower(subjectId);
    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      var hash = await folderSubjectId(row.folderId);
      if (hash === target) return row;
    }
    addCode(blockers, 'subject-not-resolved');
    return null;
  }

  async function countMemberships(folderId) {
    var rows = await sqlSelect('SELECT COUNT(*) AS n FROM folder_bindings WHERE folder_id = ?', [folderId]);
    return Array.isArray(rows) && rows.length ? Number(rows[0].n) || 0 : 0;
  }

  async function countChildren(folderId) {
    var rows = await sqlSelect('SELECT COUNT(*) AS n FROM folders WHERE parent_id = ?', [folderId]);
    return Array.isArray(rows) && rows.length ? Number(rows[0].n) || 0 : 0;
  }

  async function activeTombstoneExists(recordId) {
    var rows = await sqlSelect(
      'SELECT tombstone_id FROM sync_tombstones WHERE record_kind = ? AND record_id = ? AND restored_at IS NULL LIMIT 1',
      ['folder', recordId]
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  async function validateLiveEmptyFolder(folderId, baseHash, blockers) {
    var row = await readFolderById(folderId);
    if (!row || !isLiveFolder(row)) {
      addCode(blockers, 'folder-missing');
      return { row: null, membershipCount: null, childFolderCount: null };
    }
    var membershipCount = await countMemberships(folderId);
    var childFolderCount = await countChildren(folderId);
    if (membershipCount !== 0) addCode(blockers, 'folder-membership-present');
    if (childFolderCount !== 0) addCode(blockers, 'child-folder-present');
    if (membershipCount !== 0 || childFolderCount !== 0) addCode(blockers, 'folder-not-empty');
    var canonicalHash = await canonicalFolderHash(row);
    var localHash = normalizeFolderHash(row);
    if (!hashMatches(baseHash, canonicalHash, localHash)) addCode(blockers, 'baseline-hash-mismatch');
    return { row: row, membershipCount: membershipCount, childFolderCount: childFolderCount };
  }

  async function buildRecoverySnapshot(row, subjectId, lineageId, baseHash, membershipCount, childFolderCount) {
    var canonicalHash = await canonicalFolderHash(row);
    var localHash = normalizeFolderHash(row);
    return {
      schema: 'h2o.desktop.sync.delete-recovery-snapshot.v1',
      redacted: true,
      subjectType: SUBJECT_TYPE,
      subjectId: cleanLower(subjectId),
      lineageId: cleanString(lineageId),
      preStateHash: cleanLower(baseHash),
      canonicalPreStateHash: canonicalHash,
      localPreStateHash: localHash,
      parentSubjectId: await parentSubjectId(row.parentId),
      colorHash: row.color ? await sha256Hex('folder.color:' + cleanString(row.color)) : null,
      sortOrder: normalizeNumber(row.sortOrder),
      sourceHash: row.source ? await sha256Hex('folder.source:' + cleanString(row.source)) : null,
      metaPresent: isObject(row.meta) && Object.keys(row.meta).length > 0,
      membershipCount: Number(membershipCount) || 0,
      childFolderCount: Number(childFolderCount) || 0,
      capturedAtIso: nowIsoSeconds()
    };
  }

  function buildTombstoneRecord(tombstoneId, folderId, peerId, nowIso, baseHash, recoverySnapshot, review, row, envelope) {
    return {
      tombstoneId: tombstoneId,
      schema: TOMBSTONE_SCHEMA,
      recordKind: 'folder',
      recordId: 'folder:' + encodeURIComponent(folderId),
      deletedAt: nowIso,
      deletedBySyncPeerId: peerId,
      deleteReason: OPERATION,
      priorDigest: cleanLower(baseHash),
      priorUpdatedAt: cleanString(row.updatedAt) || null,
      sourceExportId: null,
      sourceSequenceNumber: null,
      cascadeFrom: null,
      restoredAt: null,
      restoredBySyncPeerId: null,
      metaJson: canonicalJson({
        schema: 'h2o.desktop.sync.delete-reviewed-tombstone-meta.v1',
        redacted: true,
        source: OPERATION,
        reviewId: cleanString(review.reviewId),
        candidateId: cleanString(review.candidateId),
        proposalEnvelopeId: cleanString(review.proposalEnvelopeId),
        subjectId: cleanLower(review.subjectId),
        lineageId: cleanString(review.lineageId),
        eventDigest: cleanLower(envelope.eventDigest),
        dedupeKey: cleanLower(envelope.dedupeKey),
        predicateVersion: cleanString(review.predicateVersion),
        justifyingEvidenceDigests: asArray(review.justifyingEvidenceDigests).map(cleanLower).filter(isSha256Hex),
        recoverySnapshot: recoverySnapshot,
        emptyFolderVerified: true,
        membershipCount: 0,
        childFolderCount: 0,
        localOnly: true,
        remoteApply: false
      }),
      createdAt: nowIso,
      updatedAt: nowIso
    };
  }

  function buildAuditResultJson(fields) {
    return canonicalJson({
      redacted: true,
      operation: OPERATION,
      policyVersion: POLICY_VERSION,
      entityKind: 'folder',
      subjectId: cleanLower(fields.subjectId),
      lineageId: cleanString(fields.lineageId),
      proposalEnvelopeId: cleanString(fields.proposalEnvelopeId),
      tombstoneIdPresent: !!cleanString(fields.tombstoneId),
      rowsDeleted: 1,
      membershipCount: 0,
      childFolderCount: 0,
      baseFresh: true,
      deleteVsEditConflict: false,
      recoverySnapshotCaptured: true,
      localOnly: true,
      syncPropagated: false,
      receiptEnvelopeEmitted: false
    });
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

  async function insertTombstone(record, blockers) {
    try {
      var result = await sqlExecute(
        'INSERT INTO sync_tombstones (' +
          'tombstone_id, schema, record_kind, record_id, deleted_at, deleted_by_sync_peer_id, ' +
          'delete_reason, prior_digest, prior_updated_at, source_export_id, source_sequence_number, ' +
          'cascade_from, restored_at, restored_by_sync_peer_id, meta_json, created_at, updated_at' +
        ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          record.tombstoneId,
          record.schema,
          record.recordKind,
          record.recordId,
          record.deletedAt,
          record.deletedBySyncPeerId,
          record.deleteReason,
          record.priorDigest,
          record.priorUpdatedAt,
          record.sourceExportId,
          record.sourceSequenceNumber,
          record.cascadeFrom,
          record.restoredAt,
          record.restoredBySyncPeerId,
          record.metaJson,
          record.createdAt,
          record.updatedAt
        ]
      );
      if (readRowsAffected(result) !== 1) addCode(blockers, 'tombstone-insert-failed');
    } catch (_) {
      addCode(blockers, 'tombstone-insert-failed');
    }
  }

  async function deleteFolderRow(folderId, blockers) {
    try {
      var result = await sqlExecute('DELETE FROM folders WHERE id = ?', [folderId]);
      if (readRowsAffected(result) !== 1) addCode(blockers, 'delete-affected-row-count-mismatch');
    } catch (_) {
      addCode(blockers, 'folder-delete-failed');
    }
  }

  async function insertAudit(auditId, nowIso, peerId, resultJson, blockers) {
    try {
      var result = await sqlExecute(
        'INSERT INTO sync_maintenance_log (' +
          'maintenance_id, schema, operation, policy_version, reason, requested_at, ' +
          'requested_by_sync_peer_id, platform, dry_run, affected_tombstone_count, ' +
          'affected_review_count, skipped_count, warnings_json, result_json, created_at' +
        ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 1, 0, ?, ?, ?)',
        [
          auditId,
          MAINTENANCE_SCHEMA,
          OPERATION,
          POLICY_VERSION,
          OPERATION,
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
    var folderId = ctx.folderId;
    var recordId = 'folder:' + encodeURIComponent(folderId);
    var inTxn = await beginTransaction(blockers);
    if (!inTxn) return false;

    try {
      if (await activeTombstoneExists(recordId)) addCode(blockers, 'f5-folder-tombstone-present');
      var checked = await validateLiveEmptyFolder(folderId, ctx.baseHash, blockers);
      if (checked.membershipCount !== 0 || checked.childFolderCount !== 0) addCode(blockers, 'folder-not-empty');
      if (blockers.length) {
        await rollbackQuietly(warnings);
        return false;
      }

      await insertTombstone(ctx.tombstoneRecord, blockers);
      if (blockers.length) {
        await rollbackQuietly(warnings);
        return false;
      }

      await deleteFolderRow(folderId, blockers);
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

  async function verifyFolderAbsent(folderId, blockers) {
    try {
      var row = await readFolderById(folderId);
      if (row) {
        addCode(blockers, 'delete-verification-failed');
        return false;
      }
      return true;
    } catch (_) {
      addCode(blockers, 'delete-verification-failed');
      return false;
    }
  }

  async function executeReviewedDelete(input) {
    var args = safeObject(input);
    var blockers = [];
    var warnings = [];
    var reviewId = cleanString(args.reviewId);

    if (!webCryptoAvailable()) addCode(blockers, 'web-crypto-unavailable');
    if (!getInvoke()) addCode(blockers, 'tauri-sql-unavailable');
    if (!reviewId) addCode(blockers, 'review-id-required');
    if (cleanString(args.operatorApprovalToken) !== APPROVAL_TOKEN) {
      addCode(blockers, 'operator-approval-token-required');
    }

    var review = reviewId ? await loadReviewRow(reviewId, blockers) : null;
    validateReviewRow(review, blockers);

    var candidate = review && cleanString(review.candidateId)
      ? await loadProposalCandidate(cleanString(review.candidateId), blockers)
      : null;
    var envelope = candidate ? parseEnvelope(candidate, blockers) : null;
    validateCandidateRow(candidate, envelope, blockers);
    validateReviewMatchesCandidate(review, candidate, envelope, blockers);

    var entry = candidate && envelope ? plannerEntryFrom(candidate, envelope) : {};
    if (review && envelope) {
      await runHandoffPreview(cleanString(review.candidateId), blockers, warnings);
      await runDeletePreflight(entry, blockers, warnings);
    }

    var peerId = await readIdentityPeerId(blockers);
    var subjectId = cleanLower(review && review.subjectId);
    var lineageId = cleanString(review && review.lineageId);
    var baseHash = candidate && envelope ? baseHashFor(candidate, envelope) : '';
    if (!isSha256Hex(subjectId)) addCode(blockers, 'subject-id-invalid');
    if (!lineageId) addCode(blockers, 'lineage-id-required');
    if (!isStateHash(baseHash)) addCode(blockers, 'baseline-hash-not-verified');

    var folder = null;
    var counts = { row: null, membershipCount: null, childFolderCount: null };
    if (!blockers.length) {
      folder = await resolveFolderBySubject(subjectId, blockers);
      if (folder && !isLiveFolder(folder)) addCode(blockers, 'folder-not-live');
      if (folder) counts = await validateLiveEmptyFolder(folder.folderId, baseHash, blockers);
    }

    var tombstoneId = 'tombstone:' + generateUuid();
    var auditMaintenanceId = 'maintenance:' + generateUuid();
    var nowIso = nowIsoSeconds();
    var recoverySnapshot = null;
    var tombstoneRecord = null;
    var auditResultJson = '';

    if (!blockers.length && folder) {
      recoverySnapshot = await buildRecoverySnapshot(
        folder,
        subjectId,
        lineageId,
        baseHash,
        counts.membershipCount,
        counts.childFolderCount
      );
      tombstoneRecord = buildTombstoneRecord(
        tombstoneId,
        folder.folderId,
        peerId,
        nowIso,
        baseHash,
        recoverySnapshot,
        review,
        folder,
        envelope
      );
      auditResultJson = buildAuditResultJson({
        subjectId: subjectId,
        lineageId: lineageId,
        proposalEnvelopeId: cleanString(review.proposalEnvelopeId),
        tombstoneId: tombstoneId
      });
      var forbiddenMeta = foreverNoKey(JSON.parse(tombstoneRecord.metaJson));
      if (forbiddenMeta) {
        addCode(blockers, 'tombstone-meta-contains-forbidden-field');
        addCode(warnings, 'blocked-forbidden-key-' + forbiddenMeta);
      }
    }

    if (blockers.length) {
      return failure(blockers, warnings, {
        subjectId: subjectId || null,
        lineageId: lineageId || null
      });
    }

    var applied = await executeTransaction({
      folderId: folder.folderId,
      baseHash: baseHash,
      peerId: peerId,
      nowIso: nowIso,
      tombstoneRecord: tombstoneRecord,
      auditMaintenanceId: auditMaintenanceId,
      auditResultJson: auditResultJson
    }, blockers, warnings);
    if (!applied) {
      return failure(blockers.length ? blockers : ['delete-reviewed-apply-failed'], warnings, {
        subjectId: subjectId,
        lineageId: lineageId
      });
    }

    await verifyFolderAbsent(folder.folderId, blockers);
    if (blockers.length) {
      return resultFrom({
        deleted: true,
        subjectId: subjectId,
        lineageId: lineageId,
        tombstoneId: tombstoneId,
        auditMaintenanceId: auditMaintenanceId
      }, blockers, warnings);
    }

    return resultFrom({
      deleted: true,
      subjectId: subjectId,
      lineageId: lineageId,
      tombstoneId: tombstoneId,
      auditMaintenanceId: auditMaintenanceId
    }, blockers, warnings);
  }

  H2O.Desktop.Sync.executeReviewedDelete = executeReviewedDelete;
  H2O.Desktop.Sync.__deleteReviewedApplyInstalled = true;
  H2O.Desktop.Sync.__deleteReviewedApplyVersion = VERSION;
  H2O.Desktop.Sync.__deleteReviewedApplyApprovalToken = APPROVAL_TOKEN;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
