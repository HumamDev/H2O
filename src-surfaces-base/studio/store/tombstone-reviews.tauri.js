/* H2O Studio Store - Tombstone Reviews (Desktop / Tauri SQLite)
 *
 * F5F.0/F5F.1 - inert local review-store scaffold for future remote
 * tombstone review. This module does not ingest bundles automatically,
 * apply remote tombstones, delete Library records, or mutate entity stores.
 *
 * Desktop-only: gates on Tauri detection at load. On MV3 / web this file is
 * a silent no-op and registers nothing.
 */
(function (global) {
  'use strict';

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* swallow */ }
    return false;
  }
  if (!detectTauri()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  var store = H2O.Studio.store;
  if (!store || typeof store.__registerEntity !== 'function') {
    try { console.warn('[H2O.Studio.store.tombstoneReviews] H2O.Studio.store not present; entity not registered'); }
    catch (_) { /* ignore */ }
    return;
  }
  if (store.tombstoneReviews && store.tombstoneReviews.__installed) return;

  var DB_URL = 'sqlite:studio-v1.db';
  var TABLE = 'sync_tombstone_reviews';
  var SCHEMA_VERSION = 1;
  var REVIEW_SCHEMA = 'h2o.studio.tombstone-review.v1';
  var DIAGNOSTIC_SCHEMA = 'h2o.studio.tombstone-review.diagnostic.v1';
  var CASCADE_DIAGNOSTIC_SCHEMA = 'h2o.studio.tombstone-review-cascade-diagnostics.v1';
  var LIFECYCLE_DIAGNOSTIC_SCHEMA = 'h2o.studio.tombstone-lifecycle-diagnostic.v1';
  var FOLDER_DELETE_REQUEST_SCHEMA = 'h2o.studio.folder-delete-request.v1';
  var FOLDER_DELETE_RECEIPT_SCHEMA = 'h2o.studio.folder-delete-receipt.v1';
  var FOLDER_RESTORE_REQUEST_SCHEMA = 'h2o.studio.folder-restore-request.v1';
  var FOLDER_RESTORE_RECEIPT_SCHEMA = 'h2o.studio.folder-restore-receipt.v1';
  var CHAT_FOLDER_BINDING_REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1';
  var CHAT_FOLDER_BINDING_RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1';
  var DUPLICATE_SIGHTING_PREVIEW_SCHEMA = 'h2o.studio.tombstone-review-duplicate-sighting-preview.v1';
  var SYNTHETIC_CLEANUP_PREVIEW_SCHEMA = 'h2o.studio.synthetic-cleanup-preview.v1';
  var INGEST_SCHEMA = 'h2o.studio.tombstone-review-ingest.v1';
  var PREVIEW_SCHEMA = 'h2o.studio.tombstone-review-apply-preview.v1';
  var DECISION_SCHEMA = 'h2o.studio.tombstone-review-decision.v1';
  var APPLY_DRY_RUN_SCHEMA = 'h2o.studio.tombstone-review-apply-dry-run.v1';
  var APPLY_RESULT_SCHEMA = 'h2o.studio.tombstone-review-apply-result.v1';
  var TOMBSTONE_SCHEMA = 'h2o.studio.tombstone.v1';
  var REAL_APPLY_DEV_GATE = 'I_UNDERSTAND_THIS_MUTATES_FOLDER_BINDING';
  var SYNTHETIC_CLEANUP_COMMIT_SCHEMA = 'h2o.studio.maintenance.cleanup-synthetic.v1';
  var SYNTHETIC_CLEANUP_DEV_GATE = 'I_UNDERSTAND_THIS_DELETES_SYNTHETIC_TOMBSTONE_DATA';
  var SYNTHETIC_CLEANUP_TOKEN_RE = /^ptok1:[0-9a-f]{64}$/;
  var MAX_SYNTHETIC_CLEANUP_CANDIDATES = 10000;
  var READY_POLL_INTERVAL_MS = 100;
  var READY_POLL_MAX_TRIES = 100;
  var DEFAULT_LIST_LIMIT = 100;
  var MAX_LIST_LIMIT = 1000;
  var LOCAL_TOMBSTONE_TABLE = 'sync_tombstones';
  var SYNTHETIC_PREFIXES = ['f5c-', 'f5d-', 'f5d1-', 'f5d2-', 'f5f-', 'f5g-'];

  var CLASSIFICATIONS = {
    'safe-review': true,
    'delete-vs-edit': true,
    'already-deleted-local': true,
    'missing-local-record': true,
    'cascade-review': true,
    'duplicate-remote-tombstone': true,
    'malformed-remote-tombstone': true,
    'unsupported-record-kind': true,
    'self-originated': true,
    'local-comparison-unavailable': true,
    'delete-request': true,
    'restore-request': true,
    'binding-request': true,
  };
  var STATUSES = {
    pending: true,
    ignored: true,
    'accepted-later': true,
    rejected: true,
    superseded: true,
    resolved: true,
  };
  var DECISION_ACTIONS = {
    ignored: { status: 'ignored', decision: 'ignored-by-operator' },
    rejected: { status: 'rejected', decision: 'rejected-by-operator' },
    acceptedLater: { status: 'accepted-later', decision: 'accepted-for-later-apply' },
    resolved: { status: 'resolved', decision: 'resolved-without-apply' },
  };
  var KNOWN_TOMBSTONE_KINDS = {
    chat: true,
    snapshot: true,
    folder: true,
    folderBinding: true,
    tag: true,
    tagBinding: true,
    label: true,
    labelBinding: true,
    category: true,
    project: true,
    visualMetadata: true,
    linkedOnlyChat: true,
    savedSnapshot: true,
  };
  var SUPPORTED_INGEST_KINDS = {
    folder: true,
    folderBinding: true,
  };
  var BINDING_TOMBSTONE_KINDS = {
    folderBinding: true,
    tagBinding: true,
    labelBinding: true,
  };
  var REQUIRED_REMOTE_TOMBSTONE_FIELDS = [
    'schema',
    'tombstoneId',
    'recordKind',
    'recordId',
    'deletedAt',
    'deletedBySyncPeerId',
    'deleteReason',
  ];

  var COL_TO_FIELD = {
    review_id: 'reviewId',
    schema: 'schema',
    remote_tombstone_id: 'remoteTombstoneId',
    remote_sync_peer_id: 'remoteSyncPeerId',
    remote_export_id: 'remoteExportId',
    remote_sequence_number: 'remoteSequenceNumber',
    record_kind: 'recordKind',
    record_id: 'recordId',
    delete_reason: 'deleteReason',
    remote_deleted_at: 'remoteDeletedAt',
    received_at: 'receivedAt',
    first_seen_at: 'firstSeenAt',
    last_seen_at: 'lastSeenAt',
    seen_count: 'seenCount',
    last_seen_export_id: 'lastSeenExportId',
    local_record_exists: 'localRecordExists',
    local_record_digest: 'localRecordDigest',
    local_updated_at: 'localUpdatedAt',
    local_has_newer_edit: 'localHasNewerEdit',
    classification: 'classification',
    status: 'status',
    decision: 'decision',
    decided_at: 'decidedAt',
    decided_by_sync_peer_id: 'decidedBySyncPeerId',
    dedupe_key: 'dedupeKey',
    raw_tombstone_json: 'rawTombstoneJson',
    warnings_json: 'warnings',
    created_at: 'createdAt',
    updated_at: 'updatedAt',
  };

  var state = {
    ready: false,
    initError: null,
    lastReloadedAt: null,
    lastWriteAt: null,
    writesSinceBoot: 0,
    errors: [],
    errMax: 20,
    warnings: [],
    warnMax: 20,
    subscribers: new Set(),
    lastFolderDeleteRequestIngest: null,
    lastFolderRestoreRequestIngest: null,
    lastChatFolderBindingRequestIngest: null,
  };

  function recordError(op, e) {
    try {
      state.errors.push({ t: Date.now(), op: String(op), e: String((e && e.message) || e || '') });
      if (state.errors.length > state.errMax) state.errors.splice(0, state.errors.length - state.errMax);
    } catch (_) { /* swallow */ }
  }
  function recordWarning(msg) {
    try {
      state.warnings.push({ t: Date.now(), msg: String(msg) });
      if (state.warnings.length > state.warnMax) state.warnings.splice(0, state.warnings.length - state.warnMax);
    } catch (_) { /* swallow */ }
  }
  function recordWrite(/* op */) {
    state.writesSinceBoot += 1;
    state.lastWriteAt = Date.now();
  }
  function notifySubscribers(change) {
    state.subscribers.forEach(function (fn) {
      try { fn(change || {}); } catch (e) { recordError('notifySubscribers', e); }
    });
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

  function waitForSqlite() {
    return new Promise(function (resolve) {
      var tries = 0;
      function check() {
        var platform = global.H2O && global.H2O.Studio && global.H2O.Studio.platform;
        if (platform && typeof platform.__sqliteStatus === 'function') {
          var s = null;
          try { s = platform.__sqliteStatus(); }
          catch (_) { s = null; }
          if (s && s.backend === 'sqlite' && s.ready === true) { resolve(true); return; }
        }
        tries += 1;
        if (tries >= READY_POLL_MAX_TRIES) { resolve(false); return; }
        global.setTimeout(check, READY_POLL_INTERVAL_MS);
      }
      check();
    });
  }

  function cleanString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }
  function cleanScalar(value) {
    if (value == null) return '';
    return String(value).trim();
  }
  function isObject(value) {
    return !!(value && typeof value === 'object' && !Array.isArray(value));
  }
  function nullableString(value) {
    var s = cleanScalar(value);
    return s || null;
  }
  function nowIso() {
    return new Date().toISOString();
  }
  function generateReviewId() {
    try {
      var c = global.crypto || null;
      if (c && typeof c.randomUUID === 'function') return 'tombstone-review:' + c.randomUUID();
    } catch (_) { /* ignore */ }
    return 'tombstone-review:' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2);
  }
  function generateTombstoneId() {
    try {
      var c = global.crypto || null;
      if (c && typeof c.randomUUID === 'function') return 'tombstone:' + c.randomUUID();
    } catch (_) { /* ignore */ }
    return 'tombstone:' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2);
  }
  function encodeRecordPart(value) {
    var s = cleanScalar(value);
    try { return encodeURIComponent(s); }
    catch (_) { return s; }
  }
  function buildFolderBindingRecordId(chatId, folderId) {
    return 'folderBinding:' + encodeRecordPart(chatId) + ':' + encodeRecordPart(folderId);
  }
  function readField(input, camel, snake) {
    if (!input || typeof input !== 'object') return undefined;
    if (Object.prototype.hasOwnProperty.call(input, camel)) return input[camel];
    if (snake && Object.prototype.hasOwnProperty.call(input, snake)) return input[snake];
    return undefined;
  }
  function hasOwn(input, key) {
    return Object.prototype.hasOwnProperty.call(Object(input), key);
  }
  function isIsoLike(value) {
    var s = cleanScalar(value);
    return !!s && (/^\d{4}-\d{2}-\d{2}T/.test(s) || /^\d{10,}$/.test(s));
  }
  function parseTimeMs(value) {
    var s = cleanScalar(value);
    if (!s) return null;
    if (/^\d{10,}$/.test(s)) {
      var n = Number(s);
      return Number.isFinite(n) ? n : null;
    }
    var ms = Date.parse(s);
    return Number.isFinite(ms) ? ms : null;
  }
  function bumpCounter(map, key, amount) {
    var k = cleanScalar(key) || 'unknown';
    map[k] = Number(map[k] || 0) + (amount == null ? 1 : Number(amount));
  }
  function dbBool(value) {
    if (value == null || value === '') return null;
    return Number(value) ? true : false;
  }
  function boolToDb(value) {
    if (value == null || value === '') return null;
    return value ? 1 : 0;
  }
  function parseWarnings(raw) {
    if (raw == null || raw === '') return [];
    if (Array.isArray(raw)) return raw.slice();
    if (typeof raw !== 'string') return [];
    try {
      var v = JSON.parse(raw);
      return Array.isArray(v) ? v : [];
    } catch (_) {
      return [];
    }
  }
  function normalizeRawTombstoneJson(input) {
    var raw = readField(input, 'rawTombstoneJson', 'raw_tombstone_json');
    if (raw == null) raw = readField(input, 'rawTombstone', 'raw_tombstone');
    if (raw == null) throw new Error('raw_tombstone_json required');
    if (typeof raw === 'string') {
      JSON.parse(raw);
      return raw;
    }
    if (typeof raw === 'object') return JSON.stringify(raw);
    throw new Error('raw_tombstone_json must be valid JSON');
  }
  function normalizeWarningsJson(input) {
    var raw = readField(input, 'warningsJson', 'warnings_json');
    if (raw == null) raw = readField(input, 'warnings', null);
    if (raw == null) return '[]';
    if (typeof raw === 'string') {
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('warnings_json must be a JSON array');
      return raw;
    }
    if (Array.isArray(raw)) return JSON.stringify(raw);
    throw new Error('warnings_json must be a JSON array');
  }

  function rowToJs(row) {
    if (!row || typeof row !== 'object') return null;
    var out = {};
    Object.keys(COL_TO_FIELD).forEach(function (col) {
      var field = COL_TO_FIELD[col];
      var value = row[col];
      if (col === 'warnings_json') {
        out.warnings = parseWarnings(value);
        out.warningsJson = value == null ? '[]' : String(value);
      } else if (col === 'remote_sequence_number' || col === 'seen_count') {
        out[field] = value == null ? null : Number(value);
      } else if (col === 'local_record_exists' || col === 'local_has_newer_edit') {
        out[field] = dbBool(value);
      } else {
        out[field] = value == null ? null : value;
      }
    });
    return out;
  }

  function buildDedupeKey(input) {
    var explicit = cleanString(readField(input, 'dedupeKey', 'dedupe_key'));
    if (explicit) return explicit;
    var peer = cleanString(readField(input, 'remoteSyncPeerId', 'remote_sync_peer_id'));
    var tombstoneId = cleanString(readField(input, 'remoteTombstoneId', 'remote_tombstone_id') || readField(input, 'tombstoneId', 'tombstone_id'));
    if (peer && tombstoneId) return 'remote-tombstone:' + encodeURIComponent(peer) + ':' + encodeURIComponent(tombstoneId);
    var kind = cleanString(readField(input, 'recordKind', 'record_kind'));
    var recordId = cleanString(readField(input, 'recordId', 'record_id'));
    var deletedAt = cleanString(readField(input, 'remoteDeletedAt', 'remote_deleted_at') || readField(input, 'deletedAt', 'deleted_at'));
    if (peer && kind && recordId && deletedAt) {
      return 'remote-record:' + encodeURIComponent(peer) + ':' + encodeURIComponent(kind) + ':' +
        encodeURIComponent(recordId) + ':' + encodeURIComponent(deletedAt);
    }
    return '';
  }

  function folderDeleteRequestRecordId(folderId) {
    return cleanScalar(folderId);
  }

  function folderDeleteRequestDedupeKey(folderId, requestId) {
    return 'folder-delete-request:' + encodeURIComponent(cleanScalar(folderId)) + ':' + encodeURIComponent(cleanScalar(requestId));
  }

  function folderRestoreRequestRecordId(folderId) {
    return cleanScalar(folderId);
  }

  function folderRestoreRequestDedupeKey(folderId, requestId) {
    return 'folder-restore-request:' + encodeURIComponent(cleanScalar(folderId)) + ':' + encodeURIComponent(cleanScalar(requestId));
  }

  function chatFolderBindingRequestRecordId(chatId) {
    return cleanScalar(chatId);
  }

  function chatFolderBindingRequestDedupeKey(chatId, requestId) {
    return 'chat-folder-binding-request:' + encodeURIComponent(cleanScalar(chatId)) + ':' + encodeURIComponent(cleanScalar(requestId));
  }

  function folderDeleteReceiptId(requestId) {
    return 'folder-delete-receipt:' + encodeRecordPart(requestId);
  }

  function folderRestoreReceiptId(requestId) {
    return 'folder-restore-receipt:' + encodeRecordPart(requestId);
  }

  function chatFolderBindingReceiptId(requestId) {
    return 'chat-folder-binding-receipt:' + encodeRecordPart(requestId);
  }

  function parseFolderDeleteRequestPayload(input) {
    if (!input) return null;
    var raw = readField(input, 'rawTombstoneJson', 'raw_tombstone_json');
    if (raw == null) raw = readField(input, 'payload', null);
    if (raw == null && isObject(input)) raw = input;
    try {
      var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return isObject(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function normalizeFolderDeleteRequest(input) {
    var payload = parseFolderDeleteRequestPayload(input);
    if (!payload) return { ok: false, code: 'folder-delete-request-not-object' };
    if (cleanScalar(payload.schema) !== FOLDER_DELETE_REQUEST_SCHEMA) {
      return { ok: false, code: 'folder-delete-request-schema-invalid' };
    }
    if (cleanScalar(payload.intent) !== 'folder-soft-delete-request') {
      return { ok: false, code: 'folder-delete-request-intent-invalid' };
    }
    if (cleanScalar(payload.status) !== 'pending') {
      return { ok: false, code: 'folder-delete-request-status-not-pending' };
    }
    if (payload.desktopApplyRequired !== true) {
      return { ok: false, code: 'folder-delete-request-desktop-apply-required-missing' };
    }
    var folderId = cleanScalar(payload.folderId || payload.recordId);
    if (!folderId) return { ok: false, code: 'folder-delete-request-folder-id-missing' };
    var requestId = cleanScalar(payload.requestId || payload.reviewId);
    if (!requestId) return { ok: false, code: 'folder-delete-request-id-missing' };
    var out = {
      schema: FOLDER_DELETE_REQUEST_SCHEMA,
      requestId: requestId,
      reviewId: cleanScalar(payload.reviewId || requestId) || requestId,
      recordKind: 'folder',
      intent: 'folder-soft-delete-request',
      classification: 'delete-request',
      folderId: folderId,
      folderName: nullableString(payload.folderName || payload.folderNameAtRequest),
      folderNameAtRequest: nullableString(payload.folderNameAtRequest || payload.folderName),
      normalizedNameAtRequest: nullableString(payload.normalizedNameAtRequest),
      requestedAt: nullableString(payload.requestedAt),
      requestedBy: nullableString(payload.requestedBy || 'chrome-studio'),
      sourceSurface: nullableString(payload.sourceSurface || 'chrome-studio'),
      sourcePeerId: nullableString(payload.sourcePeerId || 'chrome-studio'),
      status: 'pending',
      reason: nullableString(payload.reason || 'user-requested-folder-delete') || 'user-requested-folder-delete',
      noHardDelete: true,
      noChatDelete: true,
      desktopApplyRequired: true,
      noLocalApply: true,
      noFolderMutation: true,
      noBindingMutation: true,
      noChatMutation: true,
      noSnapshotMutation: true,
      advisory: isObject(payload.advisory) ? JSON.parse(JSON.stringify(payload.advisory)) : null,
      transportedAt: nullableString(payload.transportedAt),
    };
    return { ok: true, request: out };
  }

  function parseFolderRestoreRequestPayload(input) {
    if (!input) return null;
    var raw = readField(input, 'rawTombstoneJson', 'raw_tombstone_json');
    if (raw == null) raw = readField(input, 'payload', null);
    if (raw == null && isObject(input)) raw = input;
    try {
      var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return isObject(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function normalizeFolderRestoreRequest(input) {
    var payload = parseFolderRestoreRequestPayload(input);
    if (!payload) return { ok: false, code: 'folder-restore-request-not-object' };
    if (cleanScalar(payload.schema) !== FOLDER_RESTORE_REQUEST_SCHEMA) {
      return { ok: false, code: 'folder-restore-request-schema-invalid' };
    }
    if (cleanScalar(payload.intent) !== 'folder-restore-request') {
      return { ok: false, code: 'folder-restore-request-intent-invalid' };
    }
    if (cleanScalar(payload.status) !== 'pending') {
      return { ok: false, code: 'folder-restore-request-status-not-pending' };
    }
    if (payload.desktopRestoreRequired !== true && payload.desktopApplyRequired !== true) {
      return { ok: false, code: 'folder-restore-request-desktop-restore-required-missing' };
    }
    var folderId = cleanScalar(payload.folderId || payload.recordId);
    if (!folderId) return { ok: false, code: 'folder-restore-request-folder-id-missing' };
    var requestId = cleanScalar(payload.requestId || payload.reviewId);
    if (!requestId) return { ok: false, code: 'folder-restore-request-id-missing' };
    var out = {
      schema: FOLDER_RESTORE_REQUEST_SCHEMA,
      requestId: requestId,
      reviewId: cleanScalar(payload.reviewId || requestId) || requestId,
      recordKind: 'folder',
      intent: 'folder-restore-request',
      classification: 'restore-request',
      folderId: folderId,
      folderName: nullableString(payload.folderName || payload.folderNameAtRequest),
      folderNameAtRequest: nullableString(payload.folderNameAtRequest || payload.folderName),
      tombstoneId: nullableString(payload.tombstoneId),
      receiptId: nullableString(payload.receiptId),
      requestedAt: nullableString(payload.requestedAt || payload.createdAt),
      createdAt: nullableString(payload.createdAt || payload.requestedAt),
      requestedBy: nullableString(payload.requestedBy || 'chrome-studio'),
      source: nullableString(payload.source || 'chrome-studio'),
      sourceSurface: nullableString(payload.sourceSurface || 'chrome-studio'),
      sourcePeerId: nullableString(payload.sourcePeerId || 'chrome-studio'),
      status: 'pending',
      reason: nullableString(payload.reason || 'user-requested-folder-restore') || 'user-requested-folder-restore',
      desktopRestoreRequired: true,
      desktopApplyRequired: true,
      noLocalApply: true,
      noChromeRestoreAuthority: true,
      noTombstoneApply: true,
      noTombstoneCreate: true,
      noHardDelete: true,
      noPurge: true,
      noChatDelete: true,
      noSnapshotDelete: true,
      noAssetDelete: true,
      noFolderMutation: true,
      noBindingMutation: true,
      noChatMutation: true,
      noSnapshotMutation: true,
      advisory: isObject(payload.advisory) ? JSON.parse(JSON.stringify(payload.advisory)) : null,
      transportedAt: nullableString(payload.transportedAt || payload.mirroredAt),
    };
    return { ok: true, request: out };
  }

  function parseChatFolderBindingRequestPayload(input) {
    if (!input) return null;
    var raw = readField(input, 'rawTombstoneJson', 'raw_tombstone_json');
    if (raw == null) raw = readField(input, 'payload', null);
    if (raw == null && isObject(input)) raw = input;
    try {
      var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return isObject(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function normalizeChatFolderBindingRequest(input) {
    var payload = parseChatFolderBindingRequestPayload(input);
    if (!payload) return { ok: false, code: 'chat-folder-binding-request-not-object' };
    if (cleanScalar(payload.schema) !== CHAT_FOLDER_BINDING_REQUEST_SCHEMA) {
      return { ok: false, code: 'chat-folder-binding-request-schema-invalid' };
    }
    if (cleanScalar(payload.recordKind) !== 'folderBinding') {
      return { ok: false, code: 'chat-folder-binding-request-record-kind-invalid' };
    }
    if (cleanScalar(payload.intent) !== 'chat-folder-binding-request') {
      return { ok: false, code: 'chat-folder-binding-request-intent-invalid' };
    }
    if (cleanScalar(payload.classification) !== 'binding-request') {
      return { ok: false, code: 'chat-folder-binding-request-classification-invalid' };
    }
    if (cleanScalar(payload.status) !== 'pending') {
      return { ok: false, code: 'chat-folder-binding-request-status-not-pending' };
    }
    if (payload.desktopApplyRequired !== true) {
      return { ok: false, code: 'chat-folder-binding-request-desktop-apply-required-missing' };
    }
    if (payload.noLocalApply !== true) {
      return { ok: false, code: 'chat-folder-binding-request-local-apply-not-blocked' };
    }
    var sourceSurface = cleanScalar(payload.sourceSurface || payload.source || 'chrome-studio') || 'chrome-studio';
    var sourcePeerId = cleanScalar(payload.sourcePeerId || 'chrome-studio') || 'chrome-studio';
    if (sourceSurface !== 'chrome-studio' && sourcePeerId !== 'chrome-studio') {
      return { ok: false, code: 'chat-folder-binding-request-source-not-chrome' };
    }
    var chatId = cleanScalar(payload.chatId || payload.conversationId || payload.recordId);
    if (!chatId) return { ok: false, code: 'chat-folder-binding-request-chat-id-missing' };
    var requestId = cleanScalar(payload.requestId || payload.reviewId);
    if (!requestId) return { ok: false, code: 'chat-folder-binding-request-id-missing' };
    var targetKind = cleanScalar(payload.targetKind || (payload.targetUnfiled === true ? 'unfiled' : 'folder')) || 'folder';
    var targetUnfiled = targetKind === 'unfiled' || payload.targetUnfiled === true;
    var targetFolderId = targetUnfiled ? '' : cleanScalar(payload.targetFolderId || payload.folderId);
    if (!targetUnfiled && !targetFolderId) {
      return { ok: false, code: 'chat-folder-binding-request-target-folder-id-missing' };
    }
    var out = {
      schema: CHAT_FOLDER_BINDING_REQUEST_SCHEMA,
      requestId: requestId,
      reviewId: cleanScalar(payload.reviewId || requestId) || requestId,
      recordKind: 'folderBinding',
      intent: 'chat-folder-binding-request',
      classification: 'binding-request',
      chatId: chatId,
      conversationId: cleanScalar(payload.conversationId || chatId) || chatId,
      expectedCurrentFolderId: nullableString(payload.expectedCurrentFolderId || payload.currentFolderId),
      targetFolderId: targetUnfiled ? null : targetFolderId,
      targetKind: targetUnfiled ? 'unfiled' : 'folder',
      targetUnfiled: targetUnfiled,
      requestedAt: nullableString(payload.requestedAt || payload.createdAt),
      createdAt: nullableString(payload.createdAt || payload.requestedAt),
      requestedBy: nullableString(payload.requestedBy || 'chrome-studio'),
      source: nullableString(payload.source || 'chrome-studio'),
      sourceSurface: nullableString(sourceSurface),
      sourcePeerId: nullableString(sourcePeerId),
      status: 'pending',
      reason: nullableString(payload.reason || 'user-requested-chat-folder-binding-change') || 'user-requested-chat-folder-binding-change',
      desktopApplyRequired: true,
      noLocalApply: true,
      noChromeBindingAuthority: true,
      noChromeDestructiveBindingApply: true,
      noDesktopCanonicalMutation: true,
      noTombstoneApply: true,
      noHardDelete: true,
      noPurge: true,
      noChatDelete: true,
      noSnapshotDelete: true,
      noAssetDelete: true,
      noFolderMutation: true,
      noBindingMutation: true,
      noChatMutation: true,
      noSnapshotMutation: true,
      advisory: isObject(payload.advisory) ? JSON.parse(JSON.stringify(payload.advisory)) : null,
      transportedAt: nullableString(payload.transportedAt || payload.mirroredAt),
    };
    return { ok: true, request: out };
  }

  function findPendingFolderDeleteRequest(folderIdInput) {
    var folderId = cleanScalar(folderIdInput);
    if (!folderId) return Promise.resolve(null);
    return listReviews({
      classification: 'delete-request',
      status: 'pending',
      recordKind: 'folder',
      recordId: folderDeleteRequestRecordId(folderId),
      limit: MAX_LIST_LIMIT,
    }).then(function (rows) {
      return (Array.isArray(rows) ? rows : []).find(function (row) {
        var parsed = normalizeFolderDeleteRequest(row);
        return parsed.ok && parsed.request.folderId === folderId;
      }) || null;
    });
  }

  function listFolderDeleteRequests(filters) {
    var f = isObject(filters) ? filters : {};
    var folderId = cleanScalar(f.folderId || f.id || f.recordId || '');
    var query = {
      classification: 'delete-request',
      recordKind: 'folder',
      limit: f.limit || DEFAULT_LIST_LIMIT,
    };
    if (cleanScalar(f.status)) query.status = cleanScalar(f.status);
    if (folderId) query.recordId = folderDeleteRequestRecordId(folderId);
    return listReviews(query).then(function (rows) {
      return (Array.isArray(rows) ? rows : []).filter(function (row) {
        var parsed = normalizeFolderDeleteRequest(row);
        if (!parsed.ok) return false;
        if (folderId && parsed.request.folderId !== folderId) return false;
        return true;
      });
    });
  }

  function findPendingFolderRestoreRequest(folderIdInput) {
    var folderId = cleanScalar(folderIdInput);
    if (!folderId) return Promise.resolve(null);
    return listReviews({
      classification: 'restore-request',
      status: 'pending',
      recordKind: 'folder',
      recordId: folderRestoreRequestRecordId(folderId),
      limit: MAX_LIST_LIMIT,
    }).then(function (rows) {
      return (Array.isArray(rows) ? rows : []).find(function (row) {
        var parsed = normalizeFolderRestoreRequest(row);
        return parsed.ok && parsed.request.folderId === folderId;
      }) || null;
    });
  }

  function listFolderRestoreRequests(filters) {
    var f = isObject(filters) ? filters : {};
    var folderId = cleanScalar(f.folderId || f.id || f.recordId || '');
    var query = {
      classification: 'restore-request',
      recordKind: 'folder',
      limit: f.limit || DEFAULT_LIST_LIMIT,
    };
    if (cleanScalar(f.status)) query.status = cleanScalar(f.status);
    if (folderId) query.recordId = folderRestoreRequestRecordId(folderId);
    return listReviews(query).then(function (rows) {
      return (Array.isArray(rows) ? rows : []).filter(function (row) {
        var parsed = normalizeFolderRestoreRequest(row);
        if (!parsed.ok) return false;
        if (folderId && parsed.request.folderId !== folderId) return false;
        return true;
      });
    });
  }

  function findPendingChatFolderBindingRequest(input) {
    var data = isObject(input) ? input : {};
    var chatId = cleanScalar(data.chatId || data.conversationId || data.recordId || input);
    if (!chatId) return Promise.resolve(null);
    return listReviews({
      classification: 'binding-request',
      status: 'pending',
      recordKind: 'folderBinding',
      recordId: chatFolderBindingRequestRecordId(chatId),
      limit: MAX_LIST_LIMIT,
    }).then(function (rows) {
      return (Array.isArray(rows) ? rows : []).find(function (row) {
        var parsed = normalizeChatFolderBindingRequest(row);
        return parsed.ok && parsed.request.chatId === chatId;
      }) || null;
    });
  }

  function listChatFolderBindingRequests(filters) {
    var f = isObject(filters) ? filters : {};
    var chatId = cleanScalar(f.chatId || f.conversationId || f.recordId || '');
    var query = {
      classification: 'binding-request',
      recordKind: 'folderBinding',
      limit: f.limit || DEFAULT_LIST_LIMIT,
    };
    if (cleanScalar(f.status)) query.status = cleanScalar(f.status);
    if (chatId) query.recordId = chatFolderBindingRequestRecordId(chatId);
    return listReviews(query).then(function (rows) {
      return (Array.isArray(rows) ? rows : []).filter(function (row) {
        var parsed = normalizeChatFolderBindingRequest(row);
        if (!parsed.ok) return false;
        if (chatId && parsed.request.chatId !== chatId) return false;
        return true;
      });
    });
  }

  function folderDeleteReceiptFromReview(review) {
    if (!review) return null;
    if (cleanScalar(review.classification) !== 'delete-request') return null;
    if (cleanScalar(review.recordKind) !== 'folder') return null;
    if (cleanScalar(review.status) !== 'resolved') return null;
    if (cleanScalar(review.decision) !== 'applied-folder-delete-request') return null;

    var parsed = normalizeFolderDeleteRequest(review);
    if (!parsed.ok) return null;
    var request = parsed.request;
    var payload = parseFolderDeleteRequestPayload(review) || {};
    var applyResult = isObject(payload.desktopApplyResult) ? payload.desktopApplyResult : {};
    if (cleanScalar(applyResult.status) !== 'applied-folder-delete-request') return null;

    var requestId = cleanScalar(request.requestId || review.reviewId);
    var reviewId = cleanScalar(review.reviewId || request.reviewId || requestId);
    var folderId = cleanScalar(request.folderId || review.recordId);
    if (!requestId || !reviewId || !folderId) return null;

    var affectedChatCount = Number(applyResult.affectedChatCount);
    var bindingCount = Number(applyResult.bindingCount);
    if (!Number.isFinite(affectedChatCount) || affectedChatCount < 0) affectedChatCount = 0;
    if (!Number.isFinite(bindingCount) || bindingCount < 0) bindingCount = 0;

    return {
      schema: FOLDER_DELETE_RECEIPT_SCHEMA,
      receiptId: folderDeleteReceiptId(requestId),
      requestId: requestId,
      reviewId: reviewId,
      folderId: folderId,
      folderName: nullableString(request.folderNameAtRequest || request.folderName),
      folderNameAtRequest: nullableString(request.folderNameAtRequest || request.folderName),
      recordKind: 'folder',
      intent: 'folder-soft-delete-request',
      decision: 'applied-folder-delete-request',
      status: 'applied',
      appliedAt: nullableString(applyResult.appliedAt || review.decidedAt),
      appliedBy: 'desktop-studio',
      appliedBySurface: 'desktop-studio',
      appliedBySyncPeerIdPresent: applyResult.appliedBySyncPeerIdPresent === true || !!cleanScalar(review.decidedBySyncPeerId),
      sourcePeerId: nullableString(request.sourcePeerId || review.remoteSyncPeerId || 'chrome-studio'),
      tombstoneId: nullableString(applyResult.tombstoneId),
      noHardDelete: true,
      noChatDelete: true,
      affectedChatCount: Math.floor(affectedChatCount),
      bindingCount: Math.floor(bindingCount),
      chromeReceipt: true,
      statusOnly: true,
      noTombstoneApply: true,
      tombstonePropagation: 'deferred',
      chromeHideDeferred: true,
    };
  }

  function listFolderDeleteReceipts(filters) {
    var f = isObject(filters) ? filters : {};
    var folderId = cleanScalar(f.folderId || f.id || f.recordId || '');
    var requestId = cleanScalar(f.requestId || '');
    var reviewId = cleanScalar(f.reviewId || '');
    var query = {
      classification: 'delete-request',
      status: 'resolved',
      recordKind: 'folder',
      limit: f.limit || DEFAULT_LIST_LIMIT,
    };
    if (folderId) query.recordId = folderDeleteRequestRecordId(folderId);
    return listReviews(query).then(function (rows) {
      return (Array.isArray(rows) ? rows : []).map(folderDeleteReceiptFromReview).filter(function (receipt) {
        if (!receipt) return false;
        if (folderId && receipt.folderId !== folderId) return false;
        if (requestId && receipt.requestId !== requestId) return false;
        if (reviewId && receipt.reviewId !== reviewId) return false;
        return true;
      });
    });
  }

  function folderRestoreReceiptFromReview(review) {
    if (!review) return null;
    if (cleanScalar(review.classification) !== 'restore-request') return null;
    if (cleanScalar(review.recordKind) !== 'folder') return null;
    if (cleanScalar(review.status) !== 'resolved') return null;
    var decision = cleanScalar(review.decision);
    if (decision !== 'applied-folder-restore-request' &&
        decision !== 'already-restored-folder-restore-request') return null;

    var parsed = normalizeFolderRestoreRequest(review);
    if (!parsed.ok) return null;
    var request = parsed.request;
    var payload = parseFolderRestoreRequestPayload(review) || {};
    var applyResult = isObject(payload.desktopApplyResult) ? payload.desktopApplyResult : {};
    var status = cleanScalar(applyResult.status);
    if (status !== 'applied-folder-restore-request' &&
        status !== 'already-restored-folder-restore-request') return null;

    var requestId = cleanScalar(request.requestId || review.reviewId);
    var reviewId = cleanScalar(review.reviewId || request.reviewId || requestId);
    var folderId = cleanScalar(request.folderId || review.recordId);
    if (!requestId || !reviewId || !folderId) return null;

    return {
      schema: FOLDER_RESTORE_RECEIPT_SCHEMA,
      receiptId: folderRestoreReceiptId(requestId),
      requestId: requestId,
      reviewId: reviewId,
      folderId: folderId,
      folderName: nullableString(request.folderNameAtRequest || request.folderName),
      folderNameAtRequest: nullableString(request.folderNameAtRequest || request.folderName),
      recordKind: 'folder',
      intent: 'folder-restore-request',
      decision: 'desktop-folder-restored',
      restoreDecision: decision,
      status: 'restored',
      result: status,
      restoredAt: nullableString(applyResult.appliedAt || review.decidedAt),
      restoredBy: 'desktop-studio',
      restoredBySurface: 'desktop-studio',
      restoredBySyncPeerIdPresent: applyResult.appliedBySyncPeerIdPresent === true || !!cleanScalar(review.decidedBySyncPeerId),
      sourcePeerId: nullableString(request.sourcePeerId || review.remoteSyncPeerId || 'chrome-studio'),
      tombstoneId: nullableString(applyResult.tombstoneId || request.tombstoneId),
      alreadyRestored: applyResult.alreadyRestored === true || decision === 'already-restored-folder-restore-request',
      bindingRestoreAttemptedCount: Number(applyResult.bindingRestoreAttemptedCount) || 0,
      bindingRestoredCount: Number(applyResult.bindingRestoredCount) || 0,
      bindingSkippedCount: Number(applyResult.bindingSkippedCount) || 0,
      chromeReceipt: true,
      statusOnly: true,
      noTombstoneApply: true,
      noTombstoneCreate: true,
      noHardDelete: true,
      noPurge: true,
      noChatDelete: true,
      noSnapshotDelete: true,
      noAssetDelete: true,
      noChromeRestoreAuthority: true,
      tombstonePropagation: 'deferred',
      chromeReShowDeferred: true,
    };
  }

  function listFolderRestoreReceipts(filters) {
    var f = isObject(filters) ? filters : {};
    var folderId = cleanScalar(f.folderId || f.id || f.recordId || '');
    var requestId = cleanScalar(f.requestId || '');
    var reviewId = cleanScalar(f.reviewId || '');
    var query = {
      classification: 'restore-request',
      status: 'resolved',
      recordKind: 'folder',
      limit: f.limit || DEFAULT_LIST_LIMIT,
    };
    if (folderId) query.recordId = folderRestoreRequestRecordId(folderId);
    return listReviews(query).then(function (rows) {
      return (Array.isArray(rows) ? rows : []).map(folderRestoreReceiptFromReview).filter(function (receipt) {
        if (!receipt) return false;
        if (folderId && receipt.folderId !== folderId) return false;
        if (requestId && receipt.requestId !== requestId) return false;
        if (reviewId && receipt.reviewId !== reviewId) return false;
        return true;
      });
    });
  }

  function chatFolderBindingReceiptFromReview(review) {
    if (!review) return null;
    if (cleanScalar(review.classification) !== 'binding-request') return null;
    if (cleanScalar(review.recordKind) !== 'folderBinding') return null;
    if (cleanScalar(review.status) !== 'resolved') return null;
    var decision = cleanScalar(review.decision);
    if (decision !== 'applied-chat-folder-binding-request' &&
        decision !== 'already-applied-chat-folder-binding-request') return null;

    var parsed = normalizeChatFolderBindingRequest(review);
    if (!parsed.ok) return null;
    var request = parsed.request;
    var payload = parseChatFolderBindingRequestPayload(review) || {};
    var applyResult = isObject(payload.desktopApplyResult) ? payload.desktopApplyResult : {};
    var status = cleanScalar(applyResult.status);
    if (status !== 'applied-chat-folder-binding-request' &&
        status !== 'already-applied-chat-folder-binding-request') return null;

    var requestId = cleanScalar(request.requestId || review.reviewId);
    var reviewId = cleanScalar(review.reviewId || request.reviewId || requestId);
    var chatId = cleanScalar(request.chatId || request.conversationId || review.recordId);
    if (!requestId || !reviewId || !chatId) return null;

    return {
      schema: CHAT_FOLDER_BINDING_RECEIPT_SCHEMA,
      receiptId: chatFolderBindingReceiptId(requestId),
      requestId: requestId,
      reviewId: reviewId,
      chatId: chatId,
      conversationId: cleanScalar(request.conversationId || chatId) || chatId,
      recordKind: 'folderBinding',
      intent: 'chat-folder-binding-request',
      decision: decision,
      status: decision === 'already-applied-chat-folder-binding-request' ? 'already-applied' : 'applied',
      result: status,
      appliedAt: nullableString(applyResult.appliedAt || review.decidedAt),
      appliedBy: 'desktop-studio',
      appliedBySurface: 'desktop-studio',
      sourceSurface: 'desktop-studio',
      authority: 'desktop',
      appliedBySyncPeerIdPresent: applyResult.appliedBySyncPeerIdPresent === true || !!cleanScalar(review.decidedBySyncPeerId),
      sourcePeerId: nullableString(request.sourcePeerId || review.remoteSyncPeerId || 'chrome-studio'),
      expectedCurrentFolderId: nullableString(request.expectedCurrentFolderId),
      beforeFolderId: nullableString(applyResult.beforeFolderId),
      afterFolderId: nullableString(applyResult.afterFolderId),
      targetFolderId: nullableString(request.targetFolderId),
      targetKind: request.targetUnfiled ? 'unfiled' : 'folder',
      targetUnfiled: request.targetUnfiled === true,
      changed: applyResult.changed === true,
      alreadyApplied: decision === 'already-applied-chat-folder-binding-request',
      validationStatus: nullableString(applyResult.validationStatus || 'accepted'),
      noChromeBindingAuthority: true,
      noChromeDestructiveBindingApply: true,
      noDesktopCanonicalMutationFromChrome: true,
      noTombstoneApply: true,
      noHardDelete: true,
      noPurge: true,
      noChatDelete: true,
      noSnapshotDelete: true,
      noAssetDelete: true,
      chromeReceipt: true,
      statusOnly: true,
    };
  }

  function listChatFolderBindingReceipts(filters) {
    var f = isObject(filters) ? filters : {};
    var chatId = cleanScalar(f.chatId || f.conversationId || f.recordId || '');
    var requestId = cleanScalar(f.requestId || '');
    var reviewId = cleanScalar(f.reviewId || '');
    var query = {
      classification: 'binding-request',
      status: 'resolved',
      recordKind: 'folderBinding',
      limit: f.limit || DEFAULT_LIST_LIMIT,
    };
    if (chatId) query.recordId = chatFolderBindingRequestRecordId(chatId);
    return listReviews(query).then(function (rows) {
      return (Array.isArray(rows) ? rows : []).map(chatFolderBindingReceiptFromReview).filter(function (receipt) {
        if (!receipt) return false;
        if (chatId && receipt.chatId !== chatId && receipt.conversationId !== chatId) return false;
        if (requestId && receipt.requestId !== requestId) return false;
        if (reviewId && receipt.reviewId !== reviewId) return false;
        return true;
      });
    });
  }

  function validateReview(record) {
    var r = record || {};
    var errors = [];
    var schema = cleanString(readField(r, 'schema', null));
    var classification = cleanString(readField(r, 'classification', null));
    var status = cleanString(readField(r, 'status', null));
    if (!cleanString(readField(r, 'reviewId', 'review_id'))) errors.push({ code: 'missing-review-id' });
    if (schema !== REVIEW_SCHEMA) errors.push({ code: 'invalid-schema' });
    if (!classification) errors.push({ code: 'missing-classification' });
    else if (!CLASSIFICATIONS[classification]) errors.push({ code: 'invalid-classification' });
    if (!status) errors.push({ code: 'missing-status' });
    else if (!STATUSES[status]) errors.push({ code: 'invalid-status' });
    if (!cleanString(readField(r, 'dedupeKey', 'dedupe_key'))) errors.push({ code: 'missing-dedupe-key' });
    try { normalizeRawTombstoneJson(r); }
    catch (e) { errors.push({ code: 'invalid-raw-tombstone-json', detail: String((e && e.message) || e) }); }
    try { normalizeWarningsJson(r); }
    catch (e2) { errors.push({ code: 'invalid-warnings-json', detail: String((e2 && e2.message) || e2) }); }
    var seq = readField(r, 'remoteSequenceNumber', 'remote_sequence_number');
    if (seq != null && seq !== '') {
      var n = Number(seq);
      if (!Number.isFinite(n) || Math.floor(n) !== n) errors.push({ code: 'invalid-remote-sequence-number' });
    }
    var seen = readField(r, 'seenCount', 'seen_count');
    if (seen != null && seen !== '') {
      var seenNumber = Number(seen);
      if (!Number.isFinite(seenNumber) || Math.floor(seenNumber) !== seenNumber || seenNumber < 1) {
        errors.push({ code: 'invalid-seen-count' });
      }
    }
    return { ok: errors.length === 0, errors: errors };
  }

  function normalizeForCreate(input) {
    var r = input || {};
    var now = nowIso();
    var rawJson = normalizeRawTombstoneJson(r);
    var warningsJson = normalizeWarningsJson(r);
    var seq = readField(r, 'remoteSequenceNumber', 'remote_sequence_number');
    var seen = Number(readField(r, 'seenCount', 'seen_count'));
    var out = {
      reviewId: cleanString(readField(r, 'reviewId', 'review_id')) || generateReviewId(),
      schema: cleanString(readField(r, 'schema', null)) || REVIEW_SCHEMA,
      remoteTombstoneId: nullableString(readField(r, 'remoteTombstoneId', 'remote_tombstone_id')),
      remoteSyncPeerId: nullableString(readField(r, 'remoteSyncPeerId', 'remote_sync_peer_id')),
      remoteExportId: nullableString(readField(r, 'remoteExportId', 'remote_export_id')),
      remoteSequenceNumber: seq == null || seq === '' ? null : Number(seq),
      recordKind: nullableString(readField(r, 'recordKind', 'record_kind')),
      recordId: nullableString(readField(r, 'recordId', 'record_id')),
      deleteReason: nullableString(readField(r, 'deleteReason', 'delete_reason')),
      remoteDeletedAt: nullableString(readField(r, 'remoteDeletedAt', 'remote_deleted_at')),
      receivedAt: cleanString(readField(r, 'receivedAt', 'received_at')) || now,
      firstSeenAt: cleanString(readField(r, 'firstSeenAt', 'first_seen_at')) || now,
      lastSeenAt: cleanString(readField(r, 'lastSeenAt', 'last_seen_at')) || now,
      seenCount: Number.isFinite(seen) && seen > 0 ? Math.floor(seen) : 1,
      lastSeenExportId: nullableString(readField(r, 'lastSeenExportId', 'last_seen_export_id')),
      localRecordExists: boolToDb(readField(r, 'localRecordExists', 'local_record_exists')),
      localRecordDigest: nullableString(readField(r, 'localRecordDigest', 'local_record_digest')),
      localUpdatedAt: nullableString(readField(r, 'localUpdatedAt', 'local_updated_at')),
      localHasNewerEdit: boolToDb(readField(r, 'localHasNewerEdit', 'local_has_newer_edit')),
      classification: cleanString(readField(r, 'classification', null)),
      status: cleanString(readField(r, 'status', null)),
      decision: nullableString(readField(r, 'decision', null)),
      decidedAt: nullableString(readField(r, 'decidedAt', 'decided_at')),
      decidedBySyncPeerId: nullableString(readField(r, 'decidedBySyncPeerId', 'decided_by_sync_peer_id')),
      dedupeKey: cleanString(readField(r, 'dedupeKey', 'dedupe_key')) || buildDedupeKey(r),
      rawTombstoneJson: rawJson,
      warningsJson: warningsJson,
      createdAt: cleanString(readField(r, 'createdAt', 'created_at')) || now,
      updatedAt: cleanString(readField(r, 'updatedAt', 'updated_at')) || now,
    };
    var v = validateReview(out);
    if (!v.ok) {
      var err = new Error('invalid tombstone review: ' + v.errors.map(function (e) { return e.code; }).join(', '));
      err.validation = v;
      throw err;
    }
    return out;
  }

  function buildWhere(filters) {
    var f = filters || {};
    var where = [];
    var values = [];
    function pushString(field, col) {
      var value = cleanString(f[field]);
      if (value) { where.push(col + ' = ?'); values.push(value); }
    }
    pushString('reviewId', 'review_id');
    pushString('dedupeKey', 'dedupe_key');
    pushString('status', 'status');
    pushString('classification', 'classification');
    pushString('recordKind', 'record_kind');
    pushString('recordId', 'record_id');
    pushString('remoteSyncPeerId', 'remote_sync_peer_id');
    pushString('remoteExportId', 'remote_export_id');
    pushString('remoteTombstoneId', 'remote_tombstone_id');
    return { sql: where.length ? (' WHERE ' + where.join(' AND ')) : '', values: values };
  }
  function readLimit(filters) {
    var raw = Number(filters && filters.limit);
    if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_LIST_LIMIT;
    return Math.min(Math.floor(raw), MAX_LIST_LIMIT);
  }

  function countRows(filters) {
    var w = buildWhere(filters);
    return sqlSelect('SELECT COUNT(*) AS n FROM ' + TABLE + w.sql, w.values)
      .then(function (rows) {
        return Array.isArray(rows) && rows.length ? Number(rows[0].n) || 0 : 0;
      });
  }

  function init() {
    if (state.ready) return Promise.resolve({ rowCount: 0 });
    return waitForSqlite().then(function (ok) {
      if (!ok) {
        state.initError = 'sqlite did not become ready in time';
        recordError('init', new Error(state.initError));
        return { rowCount: 0 };
      }
      state.ready = true;
      state.lastReloadedAt = Date.now();
      return countRows().then(function (n) { return { rowCount: n }; });
    }).catch(function (e) {
      state.ready = false;
      state.initError = String((e && e.message) || e);
      recordError('init', e);
      return { rowCount: 0 };
    });
  }
  function ensureReady() {
    if (state.ready) return Promise.resolve();
    return init().then(function () {
      if (!state.ready) throw new Error(state.initError || 'tombstone review store not ready');
    });
  }
  function dispose() { state.ready = false; }
  function isReady() { return !!state.ready; }
  function saveNow() { return Promise.resolve(); }
  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    state.subscribers.add(fn);
    return function () { state.subscribers.delete(fn); };
  }
  function reload() {
    state.lastReloadedAt = Date.now();
    notifySubscribers({ source: 'reload' });
    return countRows().then(function (n) { return { rowCount: n }; })
      .catch(function () { return { rowCount: 0 }; });
  }

  function getReview(reviewIdInput) {
    var reviewId = cleanString(reviewIdInput);
    if (!reviewId) return Promise.resolve(null);
    return ensureReady()
      .then(function () {
        return sqlSelect('SELECT * FROM ' + TABLE + ' WHERE review_id = ? LIMIT 1', [reviewId]);
      })
      .then(function (rows) { return Array.isArray(rows) && rows.length ? rowToJs(rows[0]) : null; })
      .catch(function (e) { recordError('getReview', e); return null; });
  }

  function getByDedupeKey(dedupeKeyInput) {
    var dedupeKey = cleanString(dedupeKeyInput);
    if (!dedupeKey) return Promise.resolve(null);
    return ensureReady()
      .then(function () {
        return sqlSelect('SELECT * FROM ' + TABLE + ' WHERE dedupe_key = ? LIMIT 1', [dedupeKey]);
      })
      .then(function (rows) { return Array.isArray(rows) && rows.length ? rowToJs(rows[0]) : null; })
      .catch(function (e) { recordError('getByDedupeKey', e); return null; });
  }

  function listReviews(filters) {
    return ensureReady()
      .then(function () {
        var w = buildWhere(filters);
        var limit = readLimit(filters);
        return sqlSelect(
          'SELECT * FROM ' + TABLE + w.sql + ' ORDER BY received_at DESC, created_at DESC LIMIT ?',
          w.values.concat([limit])
        );
      })
      .then(function (rows) { return Array.isArray(rows) ? rows.map(rowToJs).filter(Boolean) : []; })
      .catch(function (e) { recordError('listReviews', e); return []; });
  }

  function getAll() { return listReviews(); }

  function countByClassification(filters) {
    return ensureReady()
      .then(function () {
        var w = buildWhere(filters);
        return sqlSelect(
          'SELECT classification AS classification, COUNT(*) AS total FROM ' + TABLE +
          w.sql + ' GROUP BY classification ORDER BY classification ASC',
          w.values
        );
      })
      .then(function (rows) {
        return (Array.isArray(rows) ? rows : []).map(function (r) {
          return { classification: cleanString(r.classification), total: Number(r.total) || 0 };
        });
      })
      .catch(function (e) { recordError('countByClassification', e); return []; });
  }

  function countByStatus(filters) {
    return ensureReady()
      .then(function () {
        var w = buildWhere(filters);
        return sqlSelect(
          'SELECT status AS status, COUNT(*) AS total FROM ' + TABLE +
          w.sql + ' GROUP BY status ORDER BY status ASC',
          w.values
        );
      })
      .then(function (rows) {
        return (Array.isArray(rows) ? rows : []).map(function (r) {
          return { status: cleanString(r.status), total: Number(r.total) || 0 };
        });
      })
      .catch(function (e) { recordError('countByStatus', e); return []; });
  }

  function stablePreviewStringify(value) {
    if (value == null) return 'null';
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
      return '[' + value.map(stablePreviewStringify).join(',') + ']';
    }
    var keys = Object.keys(value).sort();
    return '{' + keys.map(function (key) {
      return JSON.stringify(key) + ':' + stablePreviewStringify(value[key]);
    }).join(',') + '}';
  }

  function previewHash(value) {
    var text = typeof value === 'string' ? value : stablePreviewStringify(value);
    var h = 2166136261;
    for (var i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }

  function previewJsonHash(raw) {
    if (raw == null || raw === '') return previewHash('');
    if (typeof raw !== 'string') return previewHash(raw);
    try {
      return previewHash(JSON.parse(raw));
    } catch (_) {
      return previewHash(raw);
    }
  }

  function previewWarningsHash(row) {
    return previewHash(parseWarnings(row && (row.warningsJson || row.warnings)));
  }

  function previewProtectedDeleteReason(reason) {
    return {
      'folder-delete': true,
      'folder-delete-cascade': true,
      'remote-review-apply': true,
      'remote-tombstone-applied': true,
    }[cleanScalar(reason)] === true;
  }

  function duplicatePreviewIdentity(row) {
    var peer = cleanScalar(row && row.remoteSyncPeerId);
    var tombstoneId = cleanScalar(row && row.remoteTombstoneId);
    if (peer && tombstoneId) {
      return {
        kind: 'remote-tombstone',
        key: peer + '\u0000' + tombstoneId,
        fingerprint: previewHash(['remote-tombstone', peer, tombstoneId]),
      };
    }
    var recordKind = cleanScalar(row && row.recordKind);
    var recordId = cleanScalar(row && row.recordId);
    var deletedAt = cleanScalar(row && row.remoteDeletedAt);
    if (peer && recordKind && recordId && deletedAt) {
      return {
        kind: 'remote-record',
        key: peer + '\u0000' + recordKind + '\u0000' + recordId + '\u0000' + deletedAt,
        fingerprint: previewHash(['remote-record', peer, recordKind, recordId, deletedAt]),
      };
    }
    return null;
  }

  function duplicatePreviewState(row) {
    return {
      classification: cleanScalar(row && row.classification),
      status: cleanScalar(row && row.status),
      decision: cleanScalar(row && row.decision),
      deleteReason: cleanScalar(row && row.deleteReason),
      warningsHash: previewWarningsHash(row),
      rawHash: previewJsonHash(row && row.rawTombstoneJson),
    };
  }

  function duplicatePreviewIds(rows) {
    return {
      reviewIds: rows.map(function (row) { return cleanScalar(row && row.reviewId); }).filter(Boolean),
      remoteTombstoneIds: rows.map(function (row) { return cleanScalar(row && row.remoteTombstoneId); }).filter(Boolean),
      recordIds: rows.map(function (row) { return cleanScalar(row && row.recordId); }).filter(Boolean),
      dedupeKeys: rows.map(function (row) { return cleanScalar(row && row.dedupeKey); }).filter(Boolean),
    };
  }

  function duplicatePreviewBlockers(rows) {
    var statuses = {};
    var decisions = {};
    var warnings = {};
    var raws = {};
    var reasons = {};
    var out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var state = duplicatePreviewState(row);
      statuses[state.status || 'unknown'] = true;
      decisions[state.decision || ''] = true;
      warnings[state.warningsHash] = true;
      raws[state.rawHash] = true;
      reasons[state.deleteReason || ''] = true;
      if (state.status === 'accepted-later') out.push('accepted-later');
      if (state.status === 'resolved' && state.decision === 'applied-folder-binding') out.push('applied-folder-binding');
      if (previewProtectedDeleteReason(state.deleteReason)) out.push('protected-delete-reason');
      if (state.classification === 'cascade-review' || state.deleteReason === 'folder-delete-cascade') out.push('cascade-linked-row');
      if (String(row && row.rawTombstoneJson || '').indexOf('tombstoneReviews.applyReview') >= 0) out.push('apply-linked-row');
    });
    var statusKeys = Object.keys(statuses);
    if (statusKeys.length > 1) out.push(statuses.pending ? 'pending-terminal-mixed' : 'different-status');
    if (Object.keys(decisions).length > 1) out.push('different-decision');
    if (Object.keys(warnings).length > 1) out.push('different-warnings');
    if (Object.keys(raws).length > 1) out.push('different-raw-tombstone');
    if (Object.keys(reasons).length > 1) out.push('different-delete-reason');
    var seen = {};
    return out.filter(function (code) {
      if (seen[code]) return false;
      seen[code] = true;
      return true;
    });
  }

  function duplicatePreviewAddLimited(list, entry, limit, counters, key) {
    if (list.length < limit) list.push(entry);
    else counters[key] = Number(counters[key] || 0) + 1;
  }

  function duplicatePreviewGroupSummary(type, identity, rows, includeIds, extra) {
    var rowCount = rows.length;
    var state = duplicatePreviewState(rows[0] || {});
    var summary = Object.assign({
      type: type,
      identityKind: identity ? identity.kind : 'single-row',
      identityFingerprint: identity ? identity.fingerprint : previewHash(cleanScalar(rows[0] && rows[0].dedupeKey) || cleanScalar(rows[0] && rows[0].reviewId)),
      rowCount: rowCount,
      retainedRows: 1,
      classification: state.classification || null,
      status: state.status || null,
      decision: state.decision || null,
      deleteReason: state.deleteReason || null,
      warningsHash: state.warningsHash,
      rawTombstoneHash: state.rawHash,
    }, extra || {});
    if (includeIds) summary.ids = duplicatePreviewIds(rows);
    return summary;
  }

  function buildDuplicateSightingPreview(rows, options, surface) {
    var opts = options || {};
    var includeIds = opts.includeIds === true;
    var limit = Number(opts.limitGroups);
    if (!Number.isFinite(limit) || limit <= 0) limit = 50;
    limit = Math.min(Math.floor(limit), 250);
    var result = {
      readOnly: true,
      noMutation: true,
      phase: 'F5H.4',
      schema: DUPLICATE_SIGHTING_PREVIEW_SCHEMA,
      surface: surface,
      generatedAt: nowIso(),
      redacted: !includeIds,
      rowsScanned: rows.length,
      groupsScanned: 0,
      duplicateGroups: [],
      wouldCompactSightings: 0,
      retainedRows: 0,
      riskGroups: [],
      blockedGroups: [],
      warnings: [],
    };
    var counters = {};
    var groups = {};
    rows.forEach(function (row) {
      var seenCount = Number(row && row.seenCount) || 1;
      if (seenCount > 1) {
        result.wouldCompactSightings += seenCount - 1;
        result.retainedRows += 1;
        duplicatePreviewAddLimited(
          result.duplicateGroups,
          duplicatePreviewGroupSummary('already-compacted-sightings', null, [row], includeIds, {
            seenCount: seenCount,
            wouldCompactSightings: seenCount - 1,
          }),
          limit,
          counters,
          'duplicateGroups'
        );
      }
      var identity = duplicatePreviewIdentity(row);
      if (!identity) return;
      if (!groups[identity.key]) groups[identity.key] = { identity: identity, rows: [] };
      groups[identity.key].rows.push(row);
    });
    Object.keys(groups).sort().forEach(function (key) {
      var group = groups[key];
      if (!group || group.rows.length < 2) return;
      result.groupsScanned += 1;
      var blockers = duplicatePreviewBlockers(group.rows);
      var wouldCompact = group.rows.length - 1;
      if (blockers.length) {
        duplicatePreviewAddLimited(
          result.blockedGroups,
          duplicatePreviewGroupSummary('blocked-cross-row-duplicates', group.identity, group.rows, includeIds, {
            blockers: blockers,
            wouldCompactSightings: 0,
          }),
          limit,
          counters,
          'blockedGroups'
        );
        return;
      }
      result.wouldCompactSightings += wouldCompact;
      result.retainedRows += 1;
      duplicatePreviewAddLimited(
        result.duplicateGroups,
        duplicatePreviewGroupSummary('strict-cross-row-duplicates', group.identity, group.rows, includeIds, {
          wouldCompactSightings: wouldCompact,
        }),
        limit,
        counters,
        'duplicateGroups'
      );
    });
    Object.keys(counters).forEach(function (key) {
      result.warnings.push({ code: key + '-truncated', count: counters[key] });
    });
    return result;
  }

  function previewDuplicateSightings(options) {
    return ensureReady()
      .then(function () {
        return sqlSelect(
          'SELECT * FROM ' + TABLE + ' ORDER BY last_seen_at DESC, received_at DESC, created_at DESC',
          []
        );
      })
      .then(function (rows) {
        return buildDuplicateSightingPreview((Array.isArray(rows) ? rows : []).map(rowToJs).filter(Boolean), options, 'desktop-tauri');
      })
      .catch(function (e) {
        recordError('previewDuplicateSightings', e);
        return {
          readOnly: true,
          noMutation: true,
          phase: 'F5H.4',
          schema: DUPLICATE_SIGHTING_PREVIEW_SCHEMA,
          surface: 'desktop-tauri',
          generatedAt: nowIso(),
          redacted: !(options && options.includeIds === true),
          rowsScanned: 0,
          groupsScanned: 0,
          duplicateGroups: [],
          wouldCompactSightings: 0,
          retainedRows: 0,
          riskGroups: [],
          blockedGroups: [],
          warnings: [{ code: 'duplicate-sighting-preview-failed' }],
        };
      });
  }

  function createReview(record) {
    return ensureReady()
      .then(function () {
        var r = normalizeForCreate(record);
        return sqlExecute(
          'INSERT INTO ' + TABLE + ' (' +
            'review_id, schema, remote_tombstone_id, remote_sync_peer_id, remote_export_id, remote_sequence_number, ' +
            'record_kind, record_id, delete_reason, remote_deleted_at, received_at, first_seen_at, last_seen_at, ' +
            'seen_count, last_seen_export_id, local_record_exists, local_record_digest, local_updated_at, ' +
            'local_has_newer_edit, classification, status, decision, decided_at, decided_by_sync_peer_id, ' +
            'dedupe_key, raw_tombstone_json, warnings_json, created_at, updated_at' +
          ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            r.reviewId, r.schema, r.remoteTombstoneId, r.remoteSyncPeerId, r.remoteExportId, r.remoteSequenceNumber,
            r.recordKind, r.recordId, r.deleteReason, r.remoteDeletedAt, r.receivedAt, r.firstSeenAt, r.lastSeenAt,
            r.seenCount, r.lastSeenExportId, r.localRecordExists, r.localRecordDigest, r.localUpdatedAt,
            r.localHasNewerEdit, r.classification, r.status, r.decision, r.decidedAt, r.decidedBySyncPeerId,
            r.dedupeKey, r.rawTombstoneJson, r.warningsJson, r.createdAt, r.updatedAt,
          ]
        ).then(function () {
          recordWrite('createReview');
          notifySubscribers({ source: 'local', op: 'createReview', reviewId: r.reviewId, classification: r.classification, status: r.status });
          return getReview(r.reviewId);
        });
      })
      .catch(function (e) { recordError('createReview', e); throw e; });
  }

  function upsertReviewSighting(record) {
    var dedupeKey = cleanString(record && (record.dedupeKey || record.dedupe_key)) || buildDedupeKey(record);
    if (!dedupeKey) return Promise.reject(new Error('upsertReviewSighting: dedupeKey required'));
    return ensureReady()
      .then(function () { return getByDedupeKey(dedupeKey); })
      .then(function (existing) {
        if (!existing) {
          var input = Object.assign({}, record || {}, { dedupeKey: dedupeKey });
          return createReview(input);
        }
        var now = nowIso();
        var lastSeenExportId = nullableString(readField(record, 'lastSeenExportId', 'last_seen_export_id')) ||
          nullableString(readField(record, 'remoteExportId', 'remote_export_id'));
        return sqlExecute(
          'UPDATE ' + TABLE + ' SET last_seen_at = ?, seen_count = seen_count + 1, ' +
          'last_seen_export_id = ?, updated_at = ? WHERE dedupe_key = ?',
          [now, lastSeenExportId, now, dedupeKey]
        ).then(function () {
          recordWrite('upsertReviewSighting');
          notifySubscribers({ source: 'local', op: 'upsertReviewSighting', dedupeKey: dedupeKey });
          return getReview(existing.reviewId);
        });
      })
      .catch(function (e) { recordError('upsertReviewSighting', e); throw e; });
  }

  function makeIngestResult(bundle, options) {
    var opts = isObject(options) ? options : {};
    var sourceProvided = cleanScalar(opts.source) !== '';
    var source = sourceProvided ? cleanScalar(opts.source) : 'manual';
    return {
      schema: INGEST_SCHEMA,
      ok: true,
      dryRun: opts.dryRun === true,
      source: source,
      sourceSyncPeerIdPresent: !!cleanScalar(bundle && bundle.sourceSyncPeerId),
      exportIdPresent: !!cleanScalar(bundle && bundle.exportId),
      sequenceNumberPresent: bundle && bundle.sequenceNumber != null && bundle.sequenceNumber !== '',
      tombstoneSchemaVersion: cleanScalar(bundle && bundle.tombstoneSchemaVersion),
      found: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      selfOriginatedIgnored: 0,
      malformed: 0,
      skippedMalformed: 0,
      unsupported: 0,
      failed: 0,
      byClassification: {},
      byStatus: {},
      warnings: sourceProvided ? [] : [{ code: 'missing-source-defaulted' }],
    };
  }

  function pushIngestWarning(result, code) {
    var c = cleanScalar(code);
    if (!c) return;
    for (var i = 0; i < result.warnings.length; i += 1) {
      if (result.warnings[i] && result.warnings[i].code === c) {
        result.warnings[i].count = Number(result.warnings[i].count || 1) + 1;
        return;
      }
    }
    result.warnings.push({ code: c });
  }

  function pushCodeWarning(warnings, code) {
    if (!Array.isArray(warnings)) return;
    var c = cleanScalar(code);
    if (!c) return;
    for (var i = 0; i < warnings.length; i += 1) {
      if (warnings[i] && warnings[i].code === c) return;
    }
    warnings.push({ code: c });
  }

  function pushBlocker(result, code) {
    var c = cleanScalar(code);
    if (!c || !result || !Array.isArray(result.blockers)) return;
    for (var i = 0; i < result.blockers.length; i += 1) {
      if (result.blockers[i] && result.blockers[i].code === c) return;
    }
    result.blockers.push({ code: c });
  }

  function makePreviewResult(review) {
    return {
      schema: PREVIEW_SCHEMA,
      ok: true,
      reviewFound: !!review,
      supported: false,
      dryRunOnly: true,
      wouldMutateOnApply: false,
      mutationType: null,
      action: 'blocked-malformed-review',
      recordKind: nullableString(review && review.recordKind),
      classification: nullableString(review && review.classification),
      status: nullableString(review && review.status),
      blockers: [],
      local: {
        exists: null,
        hasNewerEdit: null,
        targetMatches: null,
        timestampComparable: null,
      },
      auditPreview: {
        wouldCreateLocalTombstone: false,
        wouldUpdateReviewDecision: false,
        wouldRequireOperatorConfirmation: false,
        remoteTombstoneSourcePresent: false,
        remoteExportSourcePresent: false,
        localPeerIdentityAvailable: false,
      },
      warnings: [],
    };
  }

  function makeApplyDryRunResult(review, dryRun) {
    return {
      schema: APPLY_DRY_RUN_SCHEMA,
      ok: true,
      dryRun: dryRun === true,
      realApplyImplemented: false,
      reviewFound: !!review,
      supported: false,
      action: 'blocked-real-apply-not-implemented',
      mutationType: null,
      wouldMutateOnApply: false,
      writesPerformed: 0,
      blockers: [],
      preview: null,
      plannedWrites: {
        libraryMutation: {
          type: null,
          wouldRun: false,
        },
        localTombstone: {
          wouldCreate: false,
          recordKind: null,
          deleteReason: null,
        },
        reviewUpdate: {
          wouldUpdateStatus: false,
          futureStatus: null,
          futureDecision: null,
        },
      },
      auditPreview: {
        wouldRecordSourceReview: false,
        wouldRecordRemoteTombstone: false,
        wouldRecordRemotePeer: false,
        wouldRecordOperatorPeer: false,
        wouldRequireOperatorConfirmation: false,
        localPeerIdentityAvailable: false,
      },
      warnings: [],
    };
  }

  function makeApplyResult(review) {
    return {
      schema: APPLY_RESULT_SCHEMA,
      ok: false,
      applied: false,
      dryRun: false,
      recordKind: nullableString(review && review.recordKind),
      mutationType: null,
      localTombstoneCreated: false,
      reviewUpdated: false,
      writesPerformed: 0,
      status: nullableString(review && review.status),
      decision: nullableString(review && review.decision),
      audit: {
        sourceReviewLinked: false,
        remoteTombstoneLinked: false,
        remotePeerLinked: false,
        localOperatorPeerRecorded: false,
      },
      blockers: [],
      warnings: [],
    };
  }

  function makeBlockedApplyResult(review, code) {
    var result = makeApplyResult(review);
    pushBlocker(result, code);
    return result;
  }

  function copyCodeWarnings(warnings) {
    var out = [];
    (Array.isArray(warnings) ? warnings : []).forEach(function (warning) {
      var code = cleanScalar(warning && warning.code);
      if (code) pushCodeWarning(out, code);
    });
    return out;
  }

  function copyBlockers(blockers) {
    var out = [];
    (Array.isArray(blockers) ? blockers : []).forEach(function (blocker) {
      var code = cleanScalar(blocker && blocker.code);
      if (code) out.push({ code: code });
    });
    return out;
  }

  function makePreviewSummary(preview) {
    var p = preview || {};
    return {
      schema: PREVIEW_SCHEMA,
      ok: p.ok === true,
      reviewFound: p.reviewFound === true,
      supported: p.supported === true,
      action: cleanScalar(p.action) || null,
      mutationType: nullableString(p.mutationType),
      wouldMutateOnApply: p.wouldMutateOnApply === true,
      blockers: copyBlockers(p.blockers),
      warnings: copyCodeWarnings(p.warnings),
    };
  }

  function mergeCodeWarnings(target, warnings) {
    (Array.isArray(warnings) ? warnings : []).forEach(function (warning) {
      pushCodeWarning(target, warning && warning.code);
    });
  }

  function applyPreviewAudit(result, preview, review) {
    var audit = (preview && preview.auditPreview) || {};
    result.auditPreview = {
      wouldRecordSourceReview: true,
      wouldRecordRemoteTombstone: !!audit.remoteTombstoneSourcePresent,
      wouldRecordRemotePeer: !!cleanScalar(review && review.remoteSyncPeerId),
      wouldRecordOperatorPeer: !!audit.localPeerIdentityAvailable,
      wouldRequireOperatorConfirmation: true,
      localPeerIdentityAvailable: !!audit.localPeerIdentityAvailable,
    };
  }

  function setApplyDryRunPlan(result, preview, review) {
    applyPreviewAudit(result, preview, review);
    result.supported = preview && preview.supported === true;
    result.action = cleanScalar(preview && preview.action) || 'blocked-preview';
    result.mutationType = nullableString(preview && preview.mutationType);
    result.wouldMutateOnApply = preview && preview.wouldMutateOnApply === true;
    if (result.action === 'would-unbind-folder-binding') {
      result.plannedWrites = {
        libraryMutation: {
          type: 'folderBinding.unbind',
          wouldRun: true,
        },
        localTombstone: {
          wouldCreate: true,
          recordKind: 'folderBinding',
          deleteReason: 'remote-review-apply',
        },
        reviewUpdate: {
          wouldUpdateStatus: true,
          futureStatus: 'resolved',
          futureDecision: 'applied-folder-binding',
        },
      };
      return;
    }
    if (result.action === 'no-op-already-missing') {
      result.plannedWrites.reviewUpdate = {
        wouldUpdateStatus: true,
        futureStatus: 'resolved',
        futureDecision: 'already-local-missing',
      };
    }
  }

  function blockApplyDryRunFromPreview(result, preview, review) {
    result.ok = false;
    result.supported = preview && preview.supported === true;
    result.action = cleanScalar(preview && preview.action) || 'blocked-preview';
    result.mutationType = nullableString(preview && preview.mutationType);
    result.wouldMutateOnApply = false;
    applyPreviewAudit(result, preview, review);
    pushBlocker(result, 'preview-blocked');
    (Array.isArray(preview && preview.blockers) ? preview.blockers : []).forEach(function (blocker) {
      pushBlocker(result, blocker && blocker.code);
    });
    mergeCodeWarnings(result.warnings, preview && preview.warnings);
    result.preview = makePreviewSummary(preview);
    return result;
  }

  function parseReviewTombstone(review, result) {
    var raw = review && review.rawTombstoneJson;
    if (!raw) {
      pushBlocker(result, 'malformed-remote-tombstone');
      result.action = 'blocked-malformed-review';
      return null;
    }
    try {
      var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!isObject(parsed)) throw new Error('raw tombstone not object');
      return parsed;
    } catch (_) {
      pushBlocker(result, 'malformed-remote-tombstone');
      result.action = 'blocked-malformed-review';
      return null;
    }
  }

  function readLocalSyncPeerIdForPreview(result) {
    var identity = H2O && H2O.Studio && H2O.Studio.identity;
    if (!identity || typeof identity.whenReady !== 'function') {
      pushCodeWarning(result.warnings, 'local-identity-unavailable');
      return Promise.resolve('');
    }
    try {
      return Promise.resolve(identity.whenReady()).then(function (value) {
        var peerId = cleanScalar(value && value.syncPeerId);
        if (!peerId) pushCodeWarning(result.warnings, 'local-identity-unavailable');
        result.auditPreview.localPeerIdentityAvailable = !!peerId;
        return peerId;
      }).catch(function () {
        pushCodeWarning(result.warnings, 'local-identity-unavailable');
        return '';
      });
    } catch (_) {
      pushCodeWarning(result.warnings, 'local-identity-unavailable');
      return Promise.resolve('');
    }
  }

  function previewTimestampComparison(localValue, remoteDeletedAt) {
    var localMs = parseTimeMs(localValue);
    var remoteMs = parseTimeMs(remoteDeletedAt);
    return {
      comparable: localMs != null && remoteMs != null,
      newer: localMs != null && remoteMs != null && localMs > remoteMs,
    };
  }

  function readLocalSyncPeerIdForIngest(result) {
    var identity = H2O && H2O.Studio && H2O.Studio.identity;
    if (!identity || typeof identity.whenReady !== 'function') {
      pushIngestWarning(result, 'local-identity-unavailable');
      return Promise.resolve('');
    }
    try {
      return Promise.resolve(identity.whenReady()).then(function (value) {
        var peerId = cleanScalar(value && value.syncPeerId);
        if (!peerId) pushIngestWarning(result, 'local-identity-unavailable');
        return peerId;
      }).catch(function () {
        pushIngestWarning(result, 'local-identity-unavailable');
        return '';
      });
    } catch (_) {
      pushIngestWarning(result, 'local-identity-unavailable');
      return Promise.resolve('');
    }
  }

  function readLocalSyncPeerIdForDecision() {
    var identity = H2O && H2O.Studio && H2O.Studio.identity;
    if (!identity || typeof identity.whenReady !== 'function') {
      return Promise.reject(new Error('local identity unavailable for decision audit'));
    }
    try {
      return Promise.resolve(identity.whenReady()).then(function (value) {
        var peerId = cleanScalar(value && value.syncPeerId);
        if (!peerId) throw new Error('local identity unavailable for decision audit');
        return peerId;
      });
    } catch (e) {
      return Promise.reject(e);
    }
  }

  function decodePart(value) {
    var s = cleanScalar(value);
    if (!s) return '';
    try { return decodeURIComponent(s); }
    catch (_) { return s; }
  }

  function parseFolderIdFromRecordId(recordId) {
    var s = cleanScalar(recordId);
    if (!s) return '';
    if (s.indexOf('folder:') === 0) return decodePart(s.slice('folder:'.length));
    return s;
  }

  function parseFolderBindingIds(tombstone, metaObject) {
    var meta = metaObject || {};
    var chatId = cleanScalar(meta.chatId);
    var folderId = cleanScalar(meta.folderId || meta.oldFolderId);
    if (chatId && folderId) return { chatId: chatId, folderId: folderId, ok: true };
    var recordId = cleanScalar(tombstone && tombstone.recordId);
    var prefix = 'folderBinding:';
    if (recordId.indexOf(prefix) !== 0) return { chatId: chatId, folderId: folderId, ok: false };
    var parts = recordId.slice(prefix.length).split(':');
    if (parts.length < 2) return { chatId: chatId, folderId: folderId, ok: false };
    chatId = chatId || decodePart(parts[0]);
    folderId = folderId || decodePart(parts.slice(1).join(':'));
    return { chatId: chatId, folderId: folderId, ok: !!(chatId && folderId) };
  }

  function isCascadeRelated(tombstone, metaObject) {
    var deleteReason = cleanScalar(tombstone && tombstone.deleteReason);
    return !!(
      cleanScalar(tombstone && tombstone.cascadeFrom) ||
      /-cascade$/.test(deleteReason) ||
      (metaObject && metaObject.cascade === true) ||
      (metaObject && cleanScalar(metaObject.cascadeKind))
    );
  }

  function isCascadeChild(tombstone, metaObject) {
    var kind = cleanScalar(tombstone && tombstone.recordKind);
    var deleteReason = cleanScalar(tombstone && tombstone.deleteReason);
    return !!(
      cleanScalar(tombstone && tombstone.cascadeFrom) ||
      /-cascade$/.test(deleteReason) ||
      (metaObject && metaObject.cascade === true && BINDING_TOMBSTONE_KINDS[kind]) ||
      (metaObject && cleanScalar(metaObject.cascadeKind))
    );
  }

  function validateRemoteTombstone(tombstone, parentRecordIds) {
    var warnings = [];
    var errors = [];
    if (!isObject(tombstone)) {
      errors.push({ code: 'tombstone-not-object' });
      return { ok: false, malformed: true, warnings: warnings, errors: errors, metaObject: null, cascadeRelated: false, cascadeChild: false };
    }
    for (var i = 0; i < REQUIRED_REMOTE_TOMBSTONE_FIELDS.length; i += 1) {
      var field = REQUIRED_REMOTE_TOMBSTONE_FIELDS[i];
      if (!cleanScalar(tombstone[field])) errors.push({ code: 'missing-' + field });
    }
    if (cleanScalar(tombstone.schema) && cleanScalar(tombstone.schema) !== TOMBSTONE_SCHEMA) {
      errors.push({ code: 'invalid-tombstone-schema' });
    }
    var kind = cleanScalar(tombstone.recordKind);
    if (kind && !KNOWN_TOMBSTONE_KINDS[kind]) errors.push({ code: 'unknown-record-kind' });
    if (hasOwn(tombstone, 'meta') && tombstone.meta != null && !isObject(tombstone.meta)) {
      errors.push({ code: 'invalid-meta' });
    }
    if (cleanScalar(tombstone.deletedAt) && !isIsoLike(tombstone.deletedAt) && parseTimeMs(tombstone.deletedAt) == null) {
      errors.push({ code: 'invalid-deleted-at' });
    }
    var metaObject = isObject(tombstone.meta) ? tombstone.meta : null;
    var cascadeRelated = isCascadeRelated(tombstone, metaObject);
    var cascadeChild = isCascadeChild(tombstone, metaObject);
    if (cascadeChild && !cleanScalar(tombstone.cascadeFrom)) {
      warnings.push({ code: 'missing-cascade-from' });
    }
    if (cleanScalar(tombstone.cascadeFrom) && parentRecordIds && !parentRecordIds[cleanScalar(tombstone.cascadeFrom)]) {
      warnings.push({ code: 'missing-cascade-parent' });
    }
    return {
      ok: errors.length === 0,
      malformed: errors.length > 0,
      warnings: warnings,
      errors: errors,
      metaObject: metaObject,
      cascadeRelated: cascadeRelated,
      cascadeChild: cascadeChild,
    };
  }

  function compareLocalTimestamp(localValue, remoteDeletedAt) {
    var localMs = parseTimeMs(localValue);
    var remoteMs = parseTimeMs(remoteDeletedAt);
    return localMs != null && remoteMs != null && localMs > remoteMs;
  }

  function classifyFolderTombstone(tombstone) {
    var folderId = parseFolderIdFromRecordId(tombstone && tombstone.recordId);
    if (!folderId) {
      return Promise.resolve({
        classification: 'malformed-remote-tombstone',
        localRecordExists: null,
        localUpdatedAt: null,
        localHasNewerEdit: null,
        warnings: [{ code: 'folder-id-unavailable' }],
      });
    }
    return sqlSelect('SELECT id, updated_at FROM folders WHERE id = ? LIMIT 1', [folderId])
      .then(function (rows) {
        if (!Array.isArray(rows) || rows.length === 0) {
          return {
            classification: 'missing-local-record',
            localRecordExists: false,
            localUpdatedAt: null,
            localHasNewerEdit: false,
            warnings: [],
          };
        }
        var row = rows[0] || {};
        var updatedAt = row.updated_at == null ? null : row.updated_at;
        var newer = compareLocalTimestamp(updatedAt, tombstone.deletedAt);
        return {
          classification: newer ? 'delete-vs-edit' : 'safe-review',
          localRecordExists: true,
          localUpdatedAt: updatedAt,
          localHasNewerEdit: newer,
          warnings: [],
        };
      })
      .catch(function () {
        return {
          classification: 'local-comparison-unavailable',
          localRecordExists: null,
          localUpdatedAt: null,
          localHasNewerEdit: null,
          warnings: [{ code: 'folder-local-comparison-failed' }],
        };
      });
  }

  function classifyFolderBindingTombstone(tombstone, metaObject, cascadeRelated) {
    var ids = parseFolderBindingIds(tombstone, metaObject);
    if (!ids.ok) {
      return Promise.resolve({
        classification: 'malformed-remote-tombstone',
        localRecordExists: null,
        localUpdatedAt: null,
        localHasNewerEdit: null,
        warnings: [{ code: 'folder-binding-ids-unavailable' }],
      });
    }
    return sqlSelect(
      'SELECT chat_id, folder_id, assigned_at FROM folder_bindings WHERE chat_id = ? AND folder_id = ? LIMIT 1',
      [ids.chatId, ids.folderId]
    ).then(function (rows) {
      var exists = Array.isArray(rows) && rows.length > 0;
      var assignedAt = exists && rows[0] ? rows[0].assigned_at : null;
      var newer = exists ? compareLocalTimestamp(assignedAt, tombstone.deletedAt) : false;
      var classification = cascadeRelated
        ? 'cascade-review'
        : (exists ? (newer ? 'delete-vs-edit' : 'safe-review') : 'missing-local-record');
      return {
        classification: classification,
        localRecordExists: exists,
        localUpdatedAt: assignedAt,
        localHasNewerEdit: newer,
        warnings: [],
      };
    }).catch(function () {
      return {
        classification: 'local-comparison-unavailable',
        localRecordExists: null,
        localUpdatedAt: null,
        localHasNewerEdit: null,
        warnings: [{ code: 'folder-binding-local-comparison-failed' }],
      };
    });
  }

  function classifyRemoteTombstone(tombstone, validation) {
    if (validation.malformed) {
      return Promise.resolve({
        classification: 'malformed-remote-tombstone',
        localRecordExists: null,
        localUpdatedAt: null,
        localHasNewerEdit: null,
        warnings: validation.errors.concat(validation.warnings),
      });
    }
    var kind = cleanScalar(tombstone.recordKind);
    if (!SUPPORTED_INGEST_KINDS[kind]) {
      return Promise.resolve({
        classification: 'unsupported-record-kind',
        localRecordExists: null,
        localUpdatedAt: null,
        localHasNewerEdit: null,
        warnings: validation.warnings.slice(),
      });
    }
    if (kind === 'folder') {
      return classifyFolderTombstone(tombstone).then(function (result) {
        result.warnings = validation.warnings.concat(result.warnings || []);
        return result;
      });
    }
    if (kind === 'folderBinding') {
      return classifyFolderBindingTombstone(tombstone, validation.metaObject, validation.cascadeRelated).then(function (result) {
        result.warnings = validation.warnings.concat(result.warnings || []);
        return result;
      });
    }
    return Promise.resolve({
      classification: 'unsupported-record-kind',
      localRecordExists: null,
      localUpdatedAt: null,
      localHasNewerEdit: null,
      warnings: validation.warnings.slice(),
    });
  }

  function buildReviewRecordFromTombstone(tombstone, sourceInfo, classification) {
    var remoteSyncPeerId = cleanScalar(sourceInfo.sourceSyncPeerId) || cleanScalar(tombstone && tombstone.deletedBySyncPeerId);
    var record = {
      schema: REVIEW_SCHEMA,
      remoteTombstoneId: cleanScalar(tombstone && tombstone.tombstoneId),
      remoteSyncPeerId: remoteSyncPeerId,
      remoteExportId: nullableString(sourceInfo.exportId),
      remoteSequenceNumber: sourceInfo.sequenceNumber == null || sourceInfo.sequenceNumber === '' ? null : Number(sourceInfo.sequenceNumber),
      recordKind: nullableString(tombstone && tombstone.recordKind),
      recordId: nullableString(tombstone && tombstone.recordId),
      deleteReason: nullableString(tombstone && tombstone.deleteReason),
      remoteDeletedAt: nullableString(tombstone && tombstone.deletedAt),
      lastSeenExportId: nullableString(sourceInfo.exportId),
      localRecordExists: classification.localRecordExists,
      localUpdatedAt: classification.localUpdatedAt,
      localHasNewerEdit: classification.localHasNewerEdit,
      classification: classification.classification,
      status: 'pending',
      dedupeKey: '',
      rawTombstoneJson: JSON.stringify(tombstone),
      warningsJson: JSON.stringify(classification.warnings || []),
    };
    record.dedupeKey = buildDedupeKey(record);
    return record;
  }

  function buildReviewRecordFromFolderDeleteRequest(request, sourceInfo, existing) {
    var source = sourceInfo || {};
    var reviewId = cleanScalar(existing && existing.reviewId) || cleanScalar(request.reviewId || request.requestId);
    var dedupeKey = cleanScalar(existing && existing.dedupeKey) ||
      folderDeleteRequestDedupeKey(request.folderId, request.requestId);
    var warnings = [
      { code: 'desktop-apply-required' },
      { code: 'folder-delete-request-imported-not-applied' },
    ];
    return {
      schema: REVIEW_SCHEMA,
      reviewId: reviewId,
      remoteTombstoneId: null,
      remoteSyncPeerId: nullableString(request.sourcePeerId || source.sourceSyncPeerId || 'chrome-studio'),
      remoteExportId: nullableString(source.exportId),
      remoteSequenceNumber: source.sequenceNumber == null || source.sequenceNumber === '' ? null : Number(source.sequenceNumber),
      recordKind: 'folder',
      recordId: folderDeleteRequestRecordId(request.folderId),
      deleteReason: nullableString(request.reason || 'user-requested-folder-delete'),
      remoteDeletedAt: null,
      receivedAt: nowIso(),
      firstSeenAt: request.requestedAt || nowIso(),
      lastSeenAt: nowIso(),
      seenCount: 1,
      lastSeenExportId: nullableString(source.exportId),
      localRecordExists: null,
      localUpdatedAt: null,
      localHasNewerEdit: null,
      classification: 'delete-request',
      status: 'pending',
      dedupeKey: dedupeKey,
      rawTombstoneJson: JSON.stringify(request),
      warningsJson: JSON.stringify(warnings),
    };
  }

  function buildReviewRecordFromFolderRestoreRequest(request, sourceInfo, existing) {
    var source = sourceInfo || {};
    var reviewId = cleanScalar(existing && existing.reviewId) || cleanScalar(request.reviewId || request.requestId);
    var dedupeKey = cleanScalar(existing && existing.dedupeKey) ||
      folderRestoreRequestDedupeKey(request.folderId, request.requestId);
    var warnings = [
      { code: 'desktop-restore-required' },
      { code: 'folder-restore-request-imported-not-applied' },
    ];
    return {
      schema: REVIEW_SCHEMA,
      reviewId: reviewId,
      remoteTombstoneId: nullableString(request.tombstoneId),
      remoteSyncPeerId: nullableString(request.sourcePeerId || source.sourceSyncPeerId || 'chrome-studio'),
      remoteExportId: nullableString(source.exportId),
      remoteSequenceNumber: source.sequenceNumber == null || source.sequenceNumber === '' ? null : Number(source.sequenceNumber),
      recordKind: 'folder',
      recordId: folderRestoreRequestRecordId(request.folderId),
      deleteReason: nullableString(request.reason || 'user-requested-folder-restore'),
      remoteDeletedAt: null,
      receivedAt: nowIso(),
      firstSeenAt: request.requestedAt || request.createdAt || nowIso(),
      lastSeenAt: nowIso(),
      seenCount: 1,
      lastSeenExportId: nullableString(source.exportId),
      localRecordExists: null,
      localUpdatedAt: null,
      localHasNewerEdit: null,
      classification: 'restore-request',
      status: 'pending',
      dedupeKey: dedupeKey,
      rawTombstoneJson: JSON.stringify(request),
      warningsJson: JSON.stringify(warnings),
    };
  }

  function buildReviewRecordFromChatFolderBindingRequest(request, sourceInfo, existing) {
    var source = sourceInfo || {};
    var reviewId = cleanScalar(existing && existing.reviewId) || cleanScalar(request.reviewId || request.requestId);
    var dedupeKey = cleanScalar(existing && existing.dedupeKey) ||
      chatFolderBindingRequestDedupeKey(request.chatId, request.requestId);
    var warnings = [
      { code: 'desktop-binding-apply-required' },
      { code: 'chat-folder-binding-request-imported-not-applied' },
    ];
    return {
      schema: REVIEW_SCHEMA,
      reviewId: reviewId,
      remoteTombstoneId: null,
      remoteSyncPeerId: nullableString(request.sourcePeerId || source.sourceSyncPeerId || 'chrome-studio'),
      remoteExportId: nullableString(source.exportId),
      remoteSequenceNumber: source.sequenceNumber == null || source.sequenceNumber === '' ? null : Number(source.sequenceNumber),
      recordKind: 'folderBinding',
      recordId: chatFolderBindingRequestRecordId(request.chatId),
      deleteReason: nullableString(request.reason || 'user-requested-chat-folder-binding-change'),
      remoteDeletedAt: null,
      receivedAt: nowIso(),
      firstSeenAt: request.requestedAt || request.createdAt || nowIso(),
      lastSeenAt: nowIso(),
      seenCount: 1,
      lastSeenExportId: nullableString(source.exportId),
      localRecordExists: null,
      localUpdatedAt: null,
      localHasNewerEdit: null,
      classification: 'binding-request',
      status: 'pending',
      dedupeKey: dedupeKey,
      rawTombstoneJson: JSON.stringify(request),
      warningsJson: JSON.stringify(warnings),
    };
  }

  function addIngestCount(result, classification, status) {
    bumpCounter(result.byClassification, classification || 'unknown');
    bumpCounter(result.byStatus, status || 'unknown');
    if (classification === 'malformed-remote-tombstone') result.malformed += 1;
    if (classification === 'unsupported-record-kind') result.unsupported += 1;
  }

  function readSourceInfo(bundle) {
    return {
      sourceSyncPeerId: cleanScalar(bundle && bundle.sourceSyncPeerId),
      exportId: cleanScalar(bundle && bundle.exportId),
      sequenceNumber: bundle && bundle.sequenceNumber != null && bundle.sequenceNumber !== ''
        ? Number(bundle.sequenceNumber)
        : null,
      tombstoneSchemaVersion: cleanScalar(bundle && bundle.tombstoneSchemaVersion),
    };
  }

  function buildParentRecordIdSet(tombstones) {
    var parents = {};
    for (var i = 0; i < tombstones.length; i += 1) {
      var row = tombstones[i];
      if (isObject(row)) {
        var recordId = cleanScalar(row.recordId);
        if (recordId) parents[recordId] = true;
      }
    }
    return parents;
  }

  function handleIngestRow(tombstone, sourceInfo, parentRecordIds, result, dryRun) {
    var validation = validateRemoteTombstone(tombstone, parentRecordIds);
    return classifyRemoteTombstone(tombstone, validation).then(function (classification) {
      var row = isObject(tombstone) ? tombstone : {};
      var reviewRecord = null;
      (classification.warnings || []).forEach(function (warning) {
        pushIngestWarning(result, warning && warning.code);
      });
      try {
        reviewRecord = buildReviewRecordFromTombstone(row, sourceInfo, classification);
      } catch (_) {
        reviewRecord = null;
      }
      addIngestCount(result, classification.classification, 'pending');
      if (!reviewRecord || !reviewRecord.dedupeKey) {
        result.skipped += 1;
        if (classification.classification === 'malformed-remote-tombstone') result.skippedMalformed += 1;
        pushIngestWarning(result, 'review-dedupe-key-unavailable');
        return null;
      }
      if (dryRun) return null;
      return getByDedupeKey(reviewRecord.dedupeKey).then(function (existing) {
        return upsertReviewSighting(reviewRecord).then(function () {
          if (existing) result.updated += 1;
          else result.inserted += 1;
        });
      }).catch(function () {
        result.failed += 1;
        result.ok = false;
        pushIngestWarning(result, 'review-write-failed');
      });
    }).catch(function () {
      result.failed += 1;
      result.ok = false;
      pushIngestWarning(result, 'review-row-ingest-failed');
      return null;
    });
  }

  function ingestBundleTombstones(bundleInput, sourceContext) {
    var bundle = isObject(bundleInput) ? bundleInput : null;
    var result = makeIngestResult(bundle || {}, sourceContext);
    var opts = isObject(sourceContext) ? sourceContext : {};
    if (!bundle) {
      result.ok = false;
      pushIngestWarning(result, 'bundle-not-object');
      return Promise.resolve(result);
    }
    if (!hasOwn(bundle, 'tombstones')) {
      pushIngestWarning(result, 'missing-tombstone-array');
      return Promise.resolve(result);
    }
    if (!Array.isArray(bundle.tombstones)) {
      pushIngestWarning(result, 'tombstones-not-array');
      return Promise.resolve(result);
    }
    var sourceInfo = readSourceInfo(bundle);
    result.sourceSyncPeerIdPresent = !!sourceInfo.sourceSyncPeerId;
    result.exportIdPresent = !!sourceInfo.exportId;
    result.sequenceNumberPresent = sourceInfo.sequenceNumber != null;
    result.tombstoneSchemaVersion = sourceInfo.tombstoneSchemaVersion;
    result.found = bundle.tombstones.length;
    if (!sourceInfo.sourceSyncPeerId) pushIngestWarning(result, 'missing-source-sync-peer-id');
    var parentRecordIds = buildParentRecordIdSet(bundle.tombstones);
    return readLocalSyncPeerIdForIngest(result).then(function (localPeerId) {
      var selfOrigin = !!(
        sourceInfo.sourceSyncPeerId &&
        localPeerId &&
        sourceInfo.sourceSyncPeerId === localPeerId &&
        opts.allowSelfOrigin !== true
      );
      if (selfOrigin) {
        result.selfOriginatedIgnored = bundle.tombstones.length;
        result.skipped += bundle.tombstones.length;
        return result;
      }
      return ensureReady().then(function () {
        var chain = Promise.resolve();
        bundle.tombstones.forEach(function (tombstone) {
          chain = chain.then(function () {
            return handleIngestRow(tombstone, sourceInfo, parentRecordIds, result, result.dryRun);
          });
        });
        return chain.then(function () { return result; });
      });
    }).catch(function (e) {
      recordError('ingestBundleTombstones', e);
      result.ok = false;
      pushIngestWarning(result, 'ingest-failed');
      return result;
    });
  }

  function makeFolderDeleteRequestIngestResult(bundle, sourceContext) {
    var opts = isObject(sourceContext) ? sourceContext : {};
    return {
      schema: FOLDER_DELETE_REQUEST_SCHEMA + '.transport-ingest.v1',
      ok: true,
      phase: 'phase4c.3a',
      status: 'folder-delete-request-import-checked',
      noApply: true,
      noHardDelete: true,
      noChatDelete: true,
      noFolderMutation: true,
      noBindingMutation: true,
      noChatMutation: true,
      noSnapshotMutation: true,
      tombstonePropagation: 'deferred',
      desktopApplyDeferred: true,
      source: cleanScalar(opts.source || 'chrome-latest.json'),
      found: 0,
      inserted: 0,
      updated: 0,
      duplicatePending: 0,
      skipped: 0,
      invalid: 0,
      failed: 0,
      warnings: [],
      sourceExportId: cleanScalar(bundle && bundle.exportId),
      sourceSequenceNumber: bundle && bundle.sequenceNumber != null && bundle.sequenceNumber !== ''
        ? Number(bundle.sequenceNumber)
        : null,
    };
  }

  function ingestFolderDeleteRequestRow(input, sourceInfo, result, dryRun) {
    var parsed = normalizeFolderDeleteRequest(input);
    if (!parsed.ok) {
      result.skipped += 1;
      result.invalid += 1;
      if (result.warnings.indexOf(parsed.code) === -1) result.warnings.push(parsed.code);
      return Promise.resolve();
    }
    var request = parsed.request;
    if (dryRun) return Promise.resolve();
    return getByDedupeKey(folderDeleteRequestDedupeKey(request.folderId, request.requestId))
      .then(function (existingByRequest) {
        if (existingByRequest) {
          var existingRecord = buildReviewRecordFromFolderDeleteRequest(request, sourceInfo, existingByRequest);
          return upsertReviewSighting(existingRecord).then(function () {
            result.updated += 1;
          });
        }
        return findPendingFolderDeleteRequest(request.folderId).then(function (existingPending) {
          var record = buildReviewRecordFromFolderDeleteRequest(request, sourceInfo, existingPending);
          return upsertReviewSighting(record).then(function () {
            if (existingPending) {
              result.updated += 1;
              result.duplicatePending += 1;
            } else {
              result.inserted += 1;
            }
          });
        });
      })
      .catch(function (e) {
        result.failed += 1;
        result.ok = false;
        if (result.warnings.indexOf('folder-delete-request-write-failed') === -1) {
          result.warnings.push('folder-delete-request-write-failed');
        }
        recordError('ingestFolderDeleteRequestRow', e);
      });
  }

  function ingestFolderDeleteRequests(bundleInput, sourceContext) {
    var opts = isObject(sourceContext) ? sourceContext : {};
    var bundle = Array.isArray(bundleInput)
      ? { folderDeleteRequests: bundleInput }
      : (isObject(bundleInput) ? bundleInput : null);
    var result = makeFolderDeleteRequestIngestResult(bundle || {}, opts);
    if (!bundle) {
      result.ok = false;
      result.status = 'folder-delete-request-bundle-invalid';
      result.warnings.push('folder-delete-request-bundle-invalid');
      state.lastFolderDeleteRequestIngest = result;
      return Promise.resolve(result);
    }
    if (!hasOwn(bundle, 'folderDeleteRequests')) {
      result.status = 'no-folder-delete-requests';
      state.lastFolderDeleteRequestIngest = result;
      return Promise.resolve(result);
    }
    if (!Array.isArray(bundle.folderDeleteRequests)) {
      result.ok = false;
      result.status = 'folder-delete-request-section-invalid';
      result.warnings.push('folder-delete-request-section-not-array');
      state.lastFolderDeleteRequestIngest = result;
      return Promise.resolve(result);
    }
    result.found = bundle.folderDeleteRequests.length;
    if (result.found === 0) {
      result.status = 'no-folder-delete-requests';
      state.lastFolderDeleteRequestIngest = result;
      return Promise.resolve(result);
    }
    var sourceInfo = readSourceInfo(bundle);
    if (opts.exportId && !sourceInfo.exportId) sourceInfo.exportId = cleanScalar(opts.exportId);
    if (opts.sourceSyncPeerId && !sourceInfo.sourceSyncPeerId) sourceInfo.sourceSyncPeerId = cleanScalar(opts.sourceSyncPeerId);
    if (opts.sequenceNumber != null && sourceInfo.sequenceNumber == null) sourceInfo.sequenceNumber = Number(opts.sequenceNumber);
    return ensureReady().then(function () {
      var chain = Promise.resolve();
      bundle.folderDeleteRequests.forEach(function (request) {
        chain = chain.then(function () {
          return ingestFolderDeleteRequestRow(request, sourceInfo, result, opts.dryRun === true);
        });
      });
      return chain.then(function () {
        result.status = result.failed > 0
          ? 'folder-delete-request-import-partial'
          : 'folder-delete-request-imported';
        state.lastFolderDeleteRequestIngest = result;
        notifySubscribers({
          source: 'chrome-folder-delete-request-import',
          op: 'ingestFolderDeleteRequests',
          found: result.found,
          inserted: result.inserted,
          updated: result.updated,
          duplicatePending: result.duplicatePending,
          noApply: true,
        });
        return result;
      });
    }).catch(function (e) {
      result.ok = false;
      result.status = 'folder-delete-request-import-failed';
      result.failed += Math.max(1, result.found - result.inserted - result.updated - result.skipped);
      result.warnings.push('folder-delete-request-import-failed');
      state.lastFolderDeleteRequestIngest = result;
      recordError('ingestFolderDeleteRequests', e);
      return result;
    });
  }

  function makeFolderRestoreRequestIngestResult(bundle, opts) {
    return {
      schema: FOLDER_RESTORE_REQUEST_SCHEMA + '.transport-ingest.v1',
      phase: 'phase6c.3',
      ok: true,
      status: 'folder-restore-request-import-checked',
      noApply: true,
      noHardDelete: true,
      noChatDelete: true,
      noSnapshotDelete: true,
      noAssetDelete: true,
      noFolderMutation: true,
      noBindingMutation: true,
      noChatMutation: true,
      noSnapshotMutation: true,
      desktopRestoreDeferred: true,
      desktopApplyDeferred: true,
      source: cleanScalar(opts.source || 'chrome-latest.json'),
      found: 0,
      inserted: 0,
      updated: 0,
      duplicatePending: 0,
      skipped: 0,
      invalid: 0,
      failed: 0,
      warnings: [],
      sourceExportId: cleanScalar(bundle && bundle.exportId),
      sourceSequenceNumber: bundle && bundle.sequenceNumber != null && bundle.sequenceNumber !== ''
        ? Number(bundle.sequenceNumber)
        : null,
    };
  }

  function ingestFolderRestoreRequestRow(input, sourceInfo, result, dryRun) {
    var parsed = normalizeFolderRestoreRequest(input);
    if (!parsed.ok) {
      result.skipped += 1;
      result.invalid += 1;
      if (result.warnings.indexOf(parsed.code) === -1) result.warnings.push(parsed.code);
      return Promise.resolve();
    }
    var request = parsed.request;
    if (dryRun) return Promise.resolve();
    return getByDedupeKey(folderRestoreRequestDedupeKey(request.folderId, request.requestId))
      .then(function (existingByRequest) {
        if (existingByRequest) {
          var existingRecord = buildReviewRecordFromFolderRestoreRequest(request, sourceInfo, existingByRequest);
          return upsertReviewSighting(existingRecord).then(function () {
            result.updated += 1;
          });
        }
        return findPendingFolderRestoreRequest(request.folderId).then(function (existingPending) {
          var record = buildReviewRecordFromFolderRestoreRequest(request, sourceInfo, existingPending);
          return upsertReviewSighting(record).then(function () {
            if (existingPending) {
              result.updated += 1;
              result.duplicatePending += 1;
            } else {
              result.inserted += 1;
            }
          });
        });
      })
      .catch(function (e) {
        result.failed += 1;
        result.ok = false;
        if (result.warnings.indexOf('folder-restore-request-write-failed') === -1) {
          result.warnings.push('folder-restore-request-write-failed');
        }
        recordError('ingestFolderRestoreRequestRow', e);
      });
  }

  function ingestFolderRestoreRequests(bundleInput, sourceContext) {
    var opts = isObject(sourceContext) ? sourceContext : {};
    var bundle = Array.isArray(bundleInput)
      ? { folderRestoreRequests: bundleInput }
      : (isObject(bundleInput) ? bundleInput : null);
    var result = makeFolderRestoreRequestIngestResult(bundle || {}, opts);
    if (!bundle) {
      result.ok = false;
      result.status = 'folder-restore-request-bundle-invalid';
      result.warnings.push('folder-restore-request-bundle-invalid');
      state.lastFolderRestoreRequestIngest = result;
      return Promise.resolve(result);
    }
    if (!hasOwn(bundle, 'folderRestoreRequests')) {
      result.status = 'no-folder-restore-requests';
      state.lastFolderRestoreRequestIngest = result;
      return Promise.resolve(result);
    }
    if (!Array.isArray(bundle.folderRestoreRequests)) {
      result.ok = false;
      result.status = 'folder-restore-request-section-invalid';
      result.warnings.push('folder-restore-request-section-not-array');
      state.lastFolderRestoreRequestIngest = result;
      return Promise.resolve(result);
    }
    result.found = bundle.folderRestoreRequests.length;
    if (result.found === 0) {
      result.status = 'no-folder-restore-requests';
      state.lastFolderRestoreRequestIngest = result;
      return Promise.resolve(result);
    }
    var sourceInfo = readSourceInfo(bundle);
    if (opts.exportId && !sourceInfo.exportId) sourceInfo.exportId = cleanScalar(opts.exportId);
    if (opts.sourceSyncPeerId && !sourceInfo.sourceSyncPeerId) sourceInfo.sourceSyncPeerId = cleanScalar(opts.sourceSyncPeerId);
    if (opts.sequenceNumber != null && sourceInfo.sequenceNumber == null) sourceInfo.sequenceNumber = Number(opts.sequenceNumber);
    return ensureReady().then(function () {
      var chain = Promise.resolve();
      bundle.folderRestoreRequests.forEach(function (request) {
        chain = chain.then(function () {
          return ingestFolderRestoreRequestRow(request, sourceInfo, result, opts.dryRun === true);
        });
      });
      return chain.then(function () {
        result.status = result.failed > 0
          ? 'folder-restore-request-import-partial'
          : 'folder-restore-request-imported';
        state.lastFolderRestoreRequestIngest = result;
        notifySubscribers({
          source: 'chrome-folder-restore-request-import',
          op: 'ingestFolderRestoreRequests',
          found: result.found,
          inserted: result.inserted,
          updated: result.updated,
          duplicatePending: result.duplicatePending,
          noApply: true,
        });
        return result;
      });
    }).catch(function (e) {
      result.ok = false;
      result.status = 'folder-restore-request-import-failed';
      result.failed += Math.max(1, result.found - result.inserted - result.updated - result.skipped);
      result.warnings.push('folder-restore-request-import-failed');
      state.lastFolderRestoreRequestIngest = result;
      recordError('ingestFolderRestoreRequests', e);
      return result;
    });
  }

  function makeChatFolderBindingRequestIngestResult(bundle, sourceContext) {
    var opts = isObject(sourceContext) ? sourceContext : {};
    return {
      schema: CHAT_FOLDER_BINDING_REQUEST_SCHEMA + '.transport-ingest.v1',
      phase: 'phase-b9',
      ok: true,
      status: 'chat-folder-binding-request-import-checked',
      noApply: true,
      desktopApplyDeferred: true,
      source: cleanScalar(opts.source || 'chrome-latest.json'),
      found: 0,
      inserted: 0,
      updated: 0,
      duplicatePending: 0,
      skipped: 0,
      invalid: 0,
      failed: 0,
      warnings: [],
      noChromeBindingAuthority: true,
      noChromeDestructiveBindingApply: true,
      noDesktopCanonicalMutationFromChrome: true,
      noHardDelete: true,
      noPurge: true,
      noChatDelete: true,
      noSnapshotDelete: true,
      noAssetDelete: true,
      sourceExportId: cleanScalar(bundle && bundle.exportId),
      sourceSequenceNumber: bundle && bundle.sequenceNumber != null && bundle.sequenceNumber !== ''
        ? Number(bundle.sequenceNumber)
        : null,
    };
  }

  function ingestChatFolderBindingRequestRow(input, sourceInfo, result, dryRun) {
    var parsed = normalizeChatFolderBindingRequest(input);
    if (!parsed.ok) {
      result.skipped += 1;
      result.invalid += 1;
      if (result.warnings.indexOf(parsed.code) === -1) result.warnings.push(parsed.code);
      return Promise.resolve();
    }
    var request = parsed.request;
    if (dryRun) return Promise.resolve();
    return getByDedupeKey(chatFolderBindingRequestDedupeKey(request.chatId, request.requestId))
      .then(function (existingByRequest) {
        if (existingByRequest) {
          var existingRecord = buildReviewRecordFromChatFolderBindingRequest(request, sourceInfo, existingByRequest);
          return upsertReviewSighting(existingRecord).then(function () {
            result.updated += 1;
          });
        }
        return findPendingChatFolderBindingRequest({ chatId: request.chatId }).then(function (existingPending) {
          var record = buildReviewRecordFromChatFolderBindingRequest(request, sourceInfo, existingPending);
          return upsertReviewSighting(record).then(function () {
            if (existingPending) {
              result.updated += 1;
              result.duplicatePending += 1;
            } else {
              result.inserted += 1;
            }
          });
        });
      })
      .catch(function (e) {
        result.failed += 1;
        result.ok = false;
        if (result.warnings.indexOf('chat-folder-binding-request-write-failed') === -1) {
          result.warnings.push('chat-folder-binding-request-write-failed');
        }
        recordError('ingestChatFolderBindingRequestRow', e);
      });
  }

  function ingestChatFolderBindingRequests(bundleInput, sourceContext) {
    var opts = isObject(sourceContext) ? sourceContext : {};
    var bundle = Array.isArray(bundleInput)
      ? { chatFolderBindingRequests: bundleInput }
      : (isObject(bundleInput) ? bundleInput : null);
    var result = makeChatFolderBindingRequestIngestResult(bundle || {}, opts);
    if (!bundle) {
      result.ok = false;
      result.status = 'chat-folder-binding-request-bundle-invalid';
      result.warnings.push('chat-folder-binding-request-bundle-invalid');
      state.lastChatFolderBindingRequestIngest = result;
      return Promise.resolve(result);
    }
    if (!hasOwn(bundle, 'chatFolderBindingRequests')) {
      result.status = 'no-chat-folder-binding-requests';
      state.lastChatFolderBindingRequestIngest = result;
      return Promise.resolve(result);
    }
    if (!Array.isArray(bundle.chatFolderBindingRequests)) {
      result.ok = false;
      result.status = 'chat-folder-binding-request-section-invalid';
      result.warnings.push('chat-folder-binding-request-section-not-array');
      state.lastChatFolderBindingRequestIngest = result;
      return Promise.resolve(result);
    }
    result.found = bundle.chatFolderBindingRequests.length;
    if (result.found === 0) {
      result.status = 'no-chat-folder-binding-requests';
      state.lastChatFolderBindingRequestIngest = result;
      return Promise.resolve(result);
    }
    var sourceInfo = readSourceInfo(bundle);
    if (opts.exportId && !sourceInfo.exportId) sourceInfo.exportId = cleanScalar(opts.exportId);
    if (opts.sourceSyncPeerId && !sourceInfo.sourceSyncPeerId) sourceInfo.sourceSyncPeerId = cleanScalar(opts.sourceSyncPeerId);
    if (opts.sequenceNumber != null && sourceInfo.sequenceNumber == null) sourceInfo.sequenceNumber = Number(opts.sequenceNumber);
    return ensureReady().then(function () {
      var chain = Promise.resolve();
      bundle.chatFolderBindingRequests.forEach(function (request) {
        chain = chain.then(function () {
          return ingestChatFolderBindingRequestRow(request, sourceInfo, result, opts.dryRun === true);
        });
      });
      return chain.then(function () {
        result.status = result.failed > 0
          ? 'chat-folder-binding-request-import-partial'
          : 'chat-folder-binding-request-imported';
        state.lastChatFolderBindingRequestIngest = result;
        notifySubscribers({
          source: 'chrome-chat-folder-binding-request-import',
          op: 'ingestChatFolderBindingRequests',
          found: result.found,
          inserted: result.inserted,
          updated: result.updated,
          duplicatePending: result.duplicatePending,
          noApply: true,
        });
        return result;
      });
    }).catch(function (e) {
      result.ok = false;
      result.status = 'chat-folder-binding-request-import-failed';
      result.failed += Math.max(1, result.found - result.inserted - result.updated - result.skipped);
      result.warnings.push('chat-folder-binding-request-import-failed');
      state.lastChatFolderBindingRequestIngest = result;
      recordError('ingestChatFolderBindingRequests', e);
      return result;
    });
  }

  function folderDeleteRequestApplyReviewId(input) {
    if (input && typeof input === 'object') {
      return cleanScalar(input.reviewId || input.requestId || input.id);
    }
    return cleanScalar(input);
  }

  function makeFolderDeleteRequestApplyResult(review) {
    return {
      schema: APPLY_RESULT_SCHEMA,
      phase: 'phase4c.3b',
      ok: false,
      applied: false,
      requestApplyOnly: true,
      reviewFound: !!review,
      reviewId: nullableString(review && review.reviewId),
      requestId: null,
      folderId: null,
      recordKind: nullableString(review && review.recordKind),
      classification: nullableString(review && review.classification),
      reviewStatus: nullableString(review && review.status),
      status: 'not-applied',
      decision: nullableString(review && review.decision),
      mutationType: 'folder.softDelete',
      localTombstoneCreated: false,
      reviewUpdated: false,
      writesPerformed: 0,
      tombstoneId: null,
      affectedChatCount: 0,
      bindingCount: 0,
      noHardDelete: true,
      noChatDelete: true,
      chromeReceiptDeferred: true,
      chromeHidingDeferred: true,
      tombstonePropagation: 'deferred',
      blockers: [],
      warnings: [],
    };
  }

  function blockFolderDeleteRequestApply(review, code, extra) {
    var result = makeFolderDeleteRequestApplyResult(review);
    var normalized = cleanScalar(code) || 'folder-delete-request-apply-blocked';
    result.status = normalized;
    pushBlocker(result, normalized);
    if (extra && typeof extra === 'object') Object.assign(result, extra);
    return result;
  }

  function validateFolderDeleteRequestReviewForApply(review) {
    if (!review) return { ok: false, code: 'review-not-found' };
    if (cleanScalar(review.classification) !== 'delete-request') {
      return { ok: false, code: 'review-not-delete-request' };
    }
    if (cleanScalar(review.recordKind) !== 'folder') {
      return { ok: false, code: 'review-record-kind-not-folder' };
    }
    var currentStatus = cleanScalar(review.status);
    if (currentStatus !== 'pending') {
      if (currentStatus === 'resolved' && cleanScalar(review.decision) === 'applied-folder-delete-request') {
        return { ok: false, code: 'folder-delete-request-already-applied', alreadyApplied: true };
      }
      return { ok: false, code: 'folder-delete-request-not-pending' };
    }
    var parsed = normalizeFolderDeleteRequest(review);
    if (!parsed.ok) return { ok: false, code: parsed.code || 'folder-delete-request-invalid' };
    var request = parsed.request;
    if (cleanScalar(request.recordKind) !== 'folder') return { ok: false, code: 'request-record-kind-not-folder' };
    if (cleanScalar(request.intent) !== 'folder-soft-delete-request') return { ok: false, code: 'request-intent-invalid' };
    if (request.desktopApplyRequired !== true) return { ok: false, code: 'desktop-apply-required-missing' };
    if (!cleanScalar(request.folderId)) return { ok: false, code: 'folder-identity-missing' };
    var recordFolderId = folderDeleteRequestRecordId(request.folderId);
    if (cleanScalar(review.recordId) && cleanScalar(review.recordId) !== recordFolderId) {
      return { ok: false, code: 'folder-identity-mismatch' };
    }
    return { ok: true, request: request };
  }

  function folderDeleteRequestApplyWarnings(review, applyResult) {
    var warnings = parseWarnings(review && (review.warningsJson || review.warnings));
    warnings.push({
      code: 'folder-delete-request-applied-on-desktop',
      noHardDelete: true,
      noChatDelete: true,
      tombstoneIdPresent: !!(applyResult && applyResult.tombstoneId),
    });
    return JSON.stringify(warnings);
  }

  function folderDeleteRequestRawWithApplyResult(review, request, softDeleteResult, appliedAt, peerId) {
    var payload = parseFolderDeleteRequestPayload(review) || {};
    if (!isObject(payload)) payload = {};
    payload.desktopApplyResult = {
      schema: APPLY_RESULT_SCHEMA,
      phase: 'phase4c.3b',
      status: 'applied-folder-delete-request',
      appliedAt: appliedAt,
      appliedBySurface: 'desktop-studio',
      appliedBySyncPeerIdPresent: !!peerId,
      reviewId: cleanScalar(review && review.reviewId),
      requestId: cleanScalar(request && request.requestId),
      folderId: cleanScalar(request && request.folderId),
      tombstoneId: cleanScalar(softDeleteResult && softDeleteResult.tombstoneId) || null,
      affectedChatCount: Number(softDeleteResult && softDeleteResult.affectedChatCount) || 0,
      bindingCount: Number(softDeleteResult && softDeleteResult.bindingCount) || 0,
      bindingUnboundCount: Number(softDeleteResult && softDeleteResult.bindingUnboundCount) || 0,
      bindingUnbindSkippedCount: Number(softDeleteResult && softDeleteResult.bindingUnbindSkippedCount) || 0,
      noHardDelete: true,
      noChatDelete: true,
      chromeReceiptDeferred: true,
      tombstonePropagation: 'deferred',
    };
    return JSON.stringify(payload);
  }

  function markFolderDeleteRequestApplied(review, request, softDeleteResult, peerId) {
    var appliedAt = nowIso();
    var rawJson = folderDeleteRequestRawWithApplyResult(review, request, softDeleteResult, appliedAt, peerId);
    var warningsJson = folderDeleteRequestApplyWarnings(review, softDeleteResult);
    return sqlExecute(
      'UPDATE ' + TABLE + ' SET status = ?, decision = ?, decided_at = ?, decided_by_sync_peer_id = ?, raw_tombstone_json = ?, warnings_json = ?, updated_at = ? WHERE review_id = ? AND status = ?',
      [
        'resolved',
        'applied-folder-delete-request',
        appliedAt,
        peerId || null,
        rawJson,
        warningsJson,
        appliedAt,
        cleanScalar(review && review.reviewId),
        'pending',
      ]
    ).then(function (updateResult) {
      if (readRowsAffected(updateResult) <= 0) {
        return blockFolderDeleteRequestApply(review, 'review-status-update-failed');
      }
      recordWrite('applyFolderDeleteRequest');
      notifySubscribers({
        source: 'local',
        op: 'applyFolderDeleteRequest',
        reviewId: cleanScalar(review && review.reviewId),
        folderId: cleanScalar(request && request.folderId),
        status: 'resolved',
        decision: 'applied-folder-delete-request',
      });
      var result = makeFolderDeleteRequestApplyResult(review);
      result.ok = true;
      result.applied = true;
      result.status = 'folder-delete-request-applied';
      result.decision = 'applied-folder-delete-request';
      result.reviewStatus = 'resolved';
      result.reviewUpdated = true;
      result.writesPerformed = 1;
      result.requestId = cleanScalar(request && request.requestId);
      result.folderId = cleanScalar(request && request.folderId);
      result.tombstoneId = cleanScalar(softDeleteResult && softDeleteResult.tombstoneId) || null;
      result.localTombstoneCreated = !!result.tombstoneId;
      result.affectedChatCount = Number(softDeleteResult && softDeleteResult.affectedChatCount) || 0;
      result.bindingCount = Number(softDeleteResult && softDeleteResult.bindingCount) || 0;
      result.bindingUnboundCount = Number(softDeleteResult && softDeleteResult.bindingUnboundCount) || 0;
      result.bindingUnbindSkippedCount = Number(softDeleteResult && softDeleteResult.bindingUnbindSkippedCount) || 0;
      result.softDeleteStatus = cleanScalar(softDeleteResult && softDeleteResult.status);
      result.appliedAt = appliedAt;
      result.appliedBySyncPeerIdPresent = !!peerId;
      result.softDeleteResult = {
        ok: softDeleteResult && softDeleteResult.ok === true,
        status: cleanScalar(softDeleteResult && softDeleteResult.status),
        tombstoneId: result.tombstoneId,
        affectedChatCount: result.affectedChatCount,
        bindingCount: result.bindingCount,
        noHardDelete: true,
        noChatDelete: true,
      };
      return result;
    });
  }

  function applyFolderDeleteRequest(input, options) {
    var reviewId = folderDeleteRequestApplyReviewId(input);
    var opts = isObject(options) ? options : {};
    if (!reviewId) return Promise.resolve(blockFolderDeleteRequestApply(null, 'review-id-required'));
    return ensureReady()
      .then(function () { return getReview(reviewId); })
      .then(function (review) {
        var validation = validateFolderDeleteRequestReviewForApply(review);
        if (!validation.ok) {
          var existingParsed = normalizeFolderDeleteRequest(review);
          var existingRequest = existingParsed && existingParsed.ok ? existingParsed.request : null;
          return blockFolderDeleteRequestApply(review, validation.code, {
            alreadyApplied: validation.alreadyApplied === true,
            requestId: existingRequest ? existingRequest.requestId : null,
            folderId: existingRequest ? existingRequest.folderId : null,
          });
        }
        var request = validation.request;
        var folders = H2O.Studio && H2O.Studio.store && H2O.Studio.store.folders;
        if (!folders || typeof folders.get !== 'function' || typeof folders.softDeleteFolder !== 'function') {
          return blockFolderDeleteRequestApply(review, 'folder-store-unavailable', {
            requestId: request.requestId,
            folderId: request.folderId,
          });
        }
        return folders.get(request.folderId).then(function (folder) {
          if (!folder) {
            return blockFolderDeleteRequestApply(review, 'folder-identity-missing', {
              requestId: request.requestId,
              folderId: request.folderId,
            });
          }
          return readLocalSyncPeerIdForDecision().then(function (peerId) {
            return folders.softDeleteFolder({ folderId: request.folderId }, {
              deleteReason: cleanScalar(opts.deleteReason) || 'desktop-approved-chrome-folder-delete-request',
              reason: cleanScalar(opts.reason) || 'desktop-approved-chrome-folder-delete-request',
              sourceReviewId: cleanScalar(review.reviewId),
              reviewId: cleanScalar(review.reviewId),
              requestId: cleanScalar(request.requestId),
              noHardDelete: true,
              noChatDelete: true,
            }).then(function (softDeleteResult) {
              if (!softDeleteResult || softDeleteResult.ok !== true) {
                var status = cleanScalar(softDeleteResult && softDeleteResult.status) || 'soft-delete-failed';
                var blocked = blockFolderDeleteRequestApply(review, status, {
                  requestId: request.requestId,
                  folderId: request.folderId,
                  softDeleteStatus: status,
                  softDeleteResult: softDeleteResult || null,
                });
                (Array.isArray(softDeleteResult && softDeleteResult.blockers) ? softDeleteResult.blockers : []).forEach(function (code) {
                  pushBlocker(blocked, code && (code.code || code));
                });
                return blocked;
              }
              return markFolderDeleteRequestApplied(review, request, softDeleteResult, peerId);
            });
          }, function () {
            return blockFolderDeleteRequestApply(review, 'local-identity-unavailable', {
              requestId: request.requestId,
              folderId: request.folderId,
            });
          });
        });
      })
      .catch(function (e) {
        recordError('applyFolderDeleteRequest', e);
        var blocked = blockFolderDeleteRequestApply(null, 'folder-delete-request-apply-failed');
        blocked.reason = String((e && e.message) || e);
        return blocked;
      });
  }

  function folderRestoreRequestApplyReviewId(input) {
    if (input && typeof input === 'object') {
      return cleanScalar(input.reviewId || input.requestId || input.id);
    }
    return cleanScalar(input);
  }

  function makeFolderRestoreRequestApplyResult(review) {
    return {
      schema: APPLY_RESULT_SCHEMA,
      phase: 'phase6c.3',
      ok: false,
      applied: false,
      alreadyApplied: false,
      requestApplyOnly: true,
      reviewFound: !!review,
      reviewId: nullableString(review && review.reviewId),
      requestId: null,
      folderId: null,
      recordKind: nullableString(review && review.recordKind),
      classification: nullableString(review && review.classification),
      reviewStatus: nullableString(review && review.status),
      status: 'not-applied',
      decision: nullableString(review && review.decision),
      mutationType: 'folder.restore',
      localTombstoneCreated: false,
      localTombstoneRestored: false,
      reviewUpdated: false,
      writesPerformed: 0,
      tombstoneId: null,
      bindingRestoreAttemptedCount: 0,
      bindingRestoredCount: 0,
      bindingSkippedCount: 0,
      purgedBlocked: false,
      noActiveTombstoneBlocked: false,
      noChromeRestoreAuthority: true,
      noChromeTombstoneApply: true,
      noTombstoneApply: true,
      noTombstoneCreate: true,
      noHardDelete: true,
      noPurge: true,
      noChatDelete: true,
      noSnapshotDelete: true,
      noAssetDelete: true,
      blockers: [],
      warnings: [],
    };
  }

  function blockFolderRestoreRequestApply(review, code, extra) {
    var result = makeFolderRestoreRequestApplyResult(review);
    var normalized = cleanScalar(code) || 'folder-restore-request-apply-blocked';
    result.status = normalized;
    pushBlocker(result, normalized);
    if (normalized === 'folder-restore-request-blocked-purged') result.purgedBlocked = true;
    if (normalized === 'folder-restore-request-no-active-tombstone' || normalized === 'folder-identity-missing') {
      result.noActiveTombstoneBlocked = true;
    }
    if (extra && typeof extra === 'object') Object.assign(result, extra);
    return result;
  }

  function isPurgedFolderRestoreRequest(request) {
    var data = isObject(request) ? request : {};
    var advisory = isObject(data.advisory) ? data.advisory : {};
    var status = cleanScalar(data.status || advisory.status).toLowerCase();
    var source = cleanScalar(data.source || data.sourceKind || advisory.sourceKind || advisory.stateSource).toLowerCase();
    return data.phase6aPermanentlyPurged === true ||
      data.permanentlySuppressed === true ||
      advisory.phase6aPermanentlyPurged === true ||
      advisory.permanentlySuppressed === true ||
      status === 'purged' ||
      source === 'desktop-purged-folder-suppression';
  }

  function validateFolderRestoreRequestReviewForApply(review) {
    if (!review) return { ok: false, code: 'review-not-found' };
    if (cleanScalar(review.classification) !== 'restore-request') {
      return { ok: false, code: 'review-not-restore-request' };
    }
    if (cleanScalar(review.recordKind) !== 'folder') {
      return { ok: false, code: 'review-record-kind-not-folder' };
    }
    var currentStatus = cleanScalar(review.status);
    if (currentStatus !== 'pending') {
      if (currentStatus === 'resolved' && (
        cleanScalar(review.decision) === 'applied-folder-restore-request' ||
        cleanScalar(review.decision) === 'already-restored-folder-restore-request'
      )) {
        return { ok: false, code: 'folder-restore-request-already-applied', alreadyApplied: true };
      }
      return { ok: false, code: 'folder-restore-request-not-pending' };
    }
    var parsed = normalizeFolderRestoreRequest(review);
    if (!parsed.ok) return { ok: false, code: parsed.code || 'folder-restore-request-invalid' };
    var request = parsed.request;
    if (cleanScalar(request.recordKind) !== 'folder') return { ok: false, code: 'request-record-kind-not-folder' };
    if (cleanScalar(request.intent) !== 'folder-restore-request') return { ok: false, code: 'request-intent-invalid' };
    if (request.desktopRestoreRequired !== true && request.desktopApplyRequired !== true) {
      return { ok: false, code: 'desktop-restore-required-missing' };
    }
    if (!cleanScalar(request.folderId)) return { ok: false, code: 'folder-identity-missing' };
    var recordFolderId = folderRestoreRequestRecordId(request.folderId);
    if (cleanScalar(review.recordId) && cleanScalar(review.recordId) !== recordFolderId) {
      return { ok: false, code: 'folder-identity-mismatch' };
    }
    if (isPurgedFolderRestoreRequest(request)) {
      return { ok: false, code: 'folder-restore-request-blocked-purged', purgedBlocked: true, request: request };
    }
    return { ok: true, request: request };
  }

  function folderRestoreRequestApplyWarnings(review, restoreResult) {
    var warnings = parseWarnings(review && (review.warningsJson || review.warnings));
    warnings.push({
      code: restoreResult && restoreResult.alreadyRestored === true
        ? 'folder-restore-request-already-restored-on-desktop'
        : 'folder-restore-request-applied-on-desktop',
      noHardDelete: true,
      noChatDelete: true,
      noSnapshotDelete: true,
      noAssetDelete: true,
      tombstoneIdPresent: !!(restoreResult && restoreResult.tombstoneId),
    });
    return JSON.stringify(warnings);
  }

  function folderRestoreRequestRawWithApplyResult(review, request, restoreResult, appliedAt, peerId) {
    var payload = parseFolderRestoreRequestPayload(review) || {};
    if (!isObject(payload)) payload = {};
    payload.desktopApplyResult = {
      schema: APPLY_RESULT_SCHEMA,
      phase: 'phase6c.3',
      status: restoreResult && restoreResult.alreadyRestored === true
        ? 'already-restored-folder-restore-request'
        : 'applied-folder-restore-request',
      appliedAt: appliedAt,
      appliedBySurface: 'desktop-studio',
      appliedBySyncPeerIdPresent: !!peerId,
      reviewId: cleanScalar(review && review.reviewId),
      requestId: cleanScalar(request && request.requestId),
      folderId: cleanScalar(request && request.folderId),
      tombstoneId: cleanScalar(restoreResult && restoreResult.tombstoneId) || cleanScalar(request && request.tombstoneId) || null,
      alreadyRestored: restoreResult && restoreResult.alreadyRestored === true,
      bindingRestoreAttemptedCount: Number(restoreResult && restoreResult.bindingRestoreAttemptedCount) || 0,
      bindingRestoredCount: Number(restoreResult && restoreResult.bindingRestoredCount) || 0,
      bindingSkippedCount: Number(restoreResult && restoreResult.bindingSkippedCount) || 0,
      noHardDelete: true,
      noChatDelete: true,
      noSnapshotDelete: true,
      noAssetDelete: true,
      noChromeRestoreAuthority: true,
      noChromeTombstoneApply: true,
    };
    return JSON.stringify(payload);
  }

  function markFolderRestoreRequestApplied(review, request, restoreResult, peerId) {
    var appliedAt = nowIso();
    var alreadyRestored = restoreResult && restoreResult.alreadyRestored === true;
    var decision = alreadyRestored
      ? 'already-restored-folder-restore-request'
      : 'applied-folder-restore-request';
    var rawJson = folderRestoreRequestRawWithApplyResult(review, request, restoreResult, appliedAt, peerId);
    var warningsJson = folderRestoreRequestApplyWarnings(review, restoreResult);
    return sqlExecute(
      'UPDATE ' + TABLE + ' SET status = ?, decision = ?, decided_at = ?, decided_by_sync_peer_id = ?, raw_tombstone_json = ?, warnings_json = ?, updated_at = ? WHERE review_id = ? AND status = ?',
      [
        'resolved',
        decision,
        appliedAt,
        peerId || null,
        rawJson,
        warningsJson,
        appliedAt,
        cleanScalar(review && review.reviewId),
        'pending',
      ]
    ).then(function (updateResult) {
      if (readRowsAffected(updateResult) <= 0) {
        return blockFolderRestoreRequestApply(review, 'review-status-update-failed');
      }
      recordWrite('applyFolderRestoreRequest');
      notifySubscribers({
        source: 'local',
        op: 'applyFolderRestoreRequest',
        reviewId: cleanScalar(review && review.reviewId),
        folderId: cleanScalar(request && request.folderId),
        status: 'resolved',
        decision: decision,
      });
      var result = makeFolderRestoreRequestApplyResult(review);
      result.ok = true;
      result.applied = !alreadyRestored;
      result.alreadyApplied = alreadyRestored;
      result.status = alreadyRestored ? 'folder-restore-request-already-restored' : 'folder-restore-request-applied';
      result.decision = decision;
      result.reviewStatus = 'resolved';
      result.reviewUpdated = true;
      result.writesPerformed = 1;
      result.requestId = cleanScalar(request && request.requestId);
      result.folderId = cleanScalar(request && request.folderId);
      result.tombstoneId = cleanScalar(restoreResult && restoreResult.tombstoneId) || cleanScalar(request && request.tombstoneId) || null;
      result.localTombstoneRestored = true;
      result.bindingRestoreAttemptedCount = Number(restoreResult && restoreResult.bindingRestoreAttemptedCount) || 0;
      result.bindingRestoredCount = Number(restoreResult && restoreResult.bindingRestoredCount) || 0;
      result.bindingSkippedCount = Number(restoreResult && restoreResult.bindingSkippedCount) || 0;
      result.restoreStatus = cleanScalar(restoreResult && restoreResult.status);
      result.appliedAt = appliedAt;
      result.appliedBySyncPeerIdPresent = !!peerId;
      result.restoreResult = {
        ok: restoreResult && restoreResult.ok === true,
        status: cleanScalar(restoreResult && restoreResult.status),
        tombstoneId: result.tombstoneId,
        alreadyRestored: alreadyRestored,
        noHardDelete: true,
        noChatDelete: true,
        noSnapshotDelete: true,
        noAssetDelete: true,
      };
      return result;
    });
  }

  function applyFolderRestoreRequest(input, options) {
    var reviewId = folderRestoreRequestApplyReviewId(input);
    var opts = isObject(options) ? options : {};
    if (!reviewId) return Promise.resolve(blockFolderRestoreRequestApply(null, 'review-id-required'));
    return ensureReady()
      .then(function () { return getReview(reviewId); })
      .then(function (review) {
        var validation = validateFolderRestoreRequestReviewForApply(review);
        if (!validation.ok) {
          var existingParsed = normalizeFolderRestoreRequest(review);
          var existingRequest = existingParsed && existingParsed.ok ? existingParsed.request : (validation.request || null);
          return blockFolderRestoreRequestApply(review, validation.code, {
            alreadyApplied: validation.alreadyApplied === true,
            purgedBlocked: validation.purgedBlocked === true,
            requestId: existingRequest ? existingRequest.requestId : null,
            folderId: existingRequest ? existingRequest.folderId : null,
          });
        }
        var request = validation.request;
        var folders = H2O.Studio && H2O.Studio.store && H2O.Studio.store.folders;
        var restoreFn = folders && (folders.restoreTombstonedFolder || folders.restoreFolder);
        if (!folders || typeof restoreFn !== 'function') {
          return blockFolderRestoreRequestApply(review, 'folder-store-unavailable', {
            requestId: request.requestId,
            folderId: request.folderId,
          });
        }
        return readLocalSyncPeerIdForDecision().then(function (peerId) {
          return restoreFn.call(folders, {
            tombstoneId: cleanScalar(request.tombstoneId),
            folderId: request.folderId,
            id: cleanScalar(request.tombstoneId) || request.folderId,
          }, {
            reason: cleanScalar(opts.reason) || 'phase6c3-auto-apply-chrome-folder-restore',
            restoredBySyncPeerId: peerId || 'desktop-phase6c3',
            sourceReviewId: cleanScalar(review.reviewId),
            reviewId: cleanScalar(review.reviewId),
            requestId: cleanScalar(request.requestId),
            noHardDelete: true,
            noChatDelete: true,
            noSnapshotDelete: true,
            noAssetDelete: true,
          }).then(function (restoreResult) {
            if (!restoreResult || restoreResult.ok !== true) {
              var status = cleanScalar(restoreResult && restoreResult.status) || 'folder-restore-failed';
              if (status === 'folder-identity-missing' && typeof folders.get === 'function') {
                return folders.get(request.folderId).then(function (existingFolder) {
                  if (existingFolder) {
                    return markFolderRestoreRequestApplied(review, request, {
                      ok: true,
                      status: 'folder-restored',
                      folderId: request.folderId,
                      tombstoneId: cleanScalar(request.tombstoneId) || null,
                      row: existingFolder,
                      alreadyRestored: true,
                      bindingRestoreAttemptedCount: 0,
                      bindingRestoredCount: 0,
                      bindingSkippedCount: 0,
                      noHardDelete: true,
                      noChatDelete: true,
                      noSnapshotDelete: true,
                      noAssetDelete: true,
                    }, peerId);
                  }
                  var mappedMissing = 'folder-restore-request-no-active-tombstone';
                  var blockedMissing = blockFolderRestoreRequestApply(review, mappedMissing, {
                    requestId: request.requestId,
                    folderId: request.folderId,
                    restoreStatus: status,
                    restoreResult: restoreResult || null,
                  });
                  (Array.isArray(restoreResult && restoreResult.blockers) ? restoreResult.blockers : []).forEach(function (code) {
                    pushBlocker(blockedMissing, code && (code.code || code));
                  });
                  return blockedMissing;
                });
              }
              var mapped = status === 'folder-identity-missing'
                ? 'folder-restore-request-no-active-tombstone'
                : status;
              var blocked = blockFolderRestoreRequestApply(review, mapped, {
                requestId: request.requestId,
                folderId: request.folderId,
                restoreStatus: status,
                restoreResult: restoreResult || null,
              });
              (Array.isArray(restoreResult && restoreResult.blockers) ? restoreResult.blockers : []).forEach(function (code) {
                pushBlocker(blocked, code && (code.code || code));
              });
              return blocked;
            }
            return markFolderRestoreRequestApplied(review, request, restoreResult, peerId);
          });
        }, function () {
          return blockFolderRestoreRequestApply(review, 'local-identity-unavailable', {
            requestId: request.requestId,
            folderId: request.folderId,
          });
        });
      })
      .catch(function (e) {
        recordError('applyFolderRestoreRequest', e);
        var blocked = blockFolderRestoreRequestApply(null, 'folder-restore-request-apply-failed');
        blocked.reason = String((e && e.message) || e);
        return blocked;
      });
  }

  function chatFolderBindingRequestApplyReviewId(input) {
    if (input && typeof input === 'object') {
      return cleanScalar(input.reviewId || input.requestId || input.id);
    }
    return cleanScalar(input);
  }

  function makeChatFolderBindingRequestApplyResult(review) {
    return {
      schema: APPLY_RESULT_SCHEMA,
      phase: 'phase-b9',
      ok: false,
      applied: false,
      alreadyApplied: false,
      requestApplyOnly: true,
      reviewFound: !!review,
      reviewId: nullableString(review && review.reviewId),
      requestId: null,
      chatId: null,
      conversationId: null,
      recordKind: nullableString(review && review.recordKind),
      classification: nullableString(review && review.classification),
      reviewStatus: nullableString(review && review.status),
      status: 'not-applied',
      decision: nullableString(review && review.decision),
      mutationType: 'chatFolderBinding.move',
      reviewUpdated: false,
      writesPerformed: 0,
      expectedCurrentFolderId: null,
      targetFolderId: null,
      targetKind: null,
      targetUnfiled: false,
      beforeFolderId: null,
      afterFolderId: null,
      changed: false,
      validationStatus: null,
      noChromeBindingAuthority: true,
      noChromeDestructiveBindingApply: true,
      noDesktopCanonicalMutationFromChrome: true,
      noHardDelete: true,
      noPurge: true,
      noChatDelete: true,
      noSnapshotDelete: true,
      noAssetDelete: true,
      blockers: [],
      warnings: [],
    };
  }

  function blockChatFolderBindingRequestApply(review, code, extra) {
    var result = makeChatFolderBindingRequestApplyResult(review);
    var normalized = cleanScalar(code) || 'chat-folder-binding-request-apply-blocked';
    result.status = normalized;
    pushBlocker(result, normalized);
    if (extra && typeof extra === 'object') Object.assign(result, extra);
    return result;
  }

  function validateChatFolderBindingRequestReviewForApply(review) {
    if (!review) return { ok: false, code: 'review-not-found' };
    if (cleanScalar(review.classification) !== 'binding-request') {
      return { ok: false, code: 'review-not-binding-request' };
    }
    if (cleanScalar(review.recordKind) !== 'folderBinding') {
      return { ok: false, code: 'review-record-kind-not-folder-binding' };
    }
    var currentStatus = cleanScalar(review.status);
    var parsed = normalizeChatFolderBindingRequest(review);
    var request = parsed && parsed.ok ? parsed.request : null;
    if (currentStatus !== 'pending') {
      var decision = cleanScalar(review.decision);
      if (currentStatus === 'resolved' && (
        decision === 'applied-chat-folder-binding-request' ||
        decision === 'already-applied-chat-folder-binding-request'
      )) {
        return {
          ok: false,
          code: 'chat-folder-binding-request-already-applied',
          alreadyApplied: true,
          request: request,
        };
      }
      return { ok: false, code: 'chat-folder-binding-request-not-pending', request: request };
    }
    if (!parsed.ok) return { ok: false, code: parsed.code || 'chat-folder-binding-request-invalid' };
    request = parsed.request;
    if (cleanScalar(request.recordKind) !== 'folderBinding') {
      return { ok: false, code: 'request-record-kind-not-folder-binding' };
    }
    if (cleanScalar(request.intent) !== 'chat-folder-binding-request') {
      return { ok: false, code: 'request-intent-invalid' };
    }
    if (request.desktopApplyRequired !== true) {
      return { ok: false, code: 'desktop-apply-required-missing' };
    }
    if (request.noLocalApply !== true) {
      return { ok: false, code: 'chrome-local-apply-not-blocked' };
    }
    if (!cleanScalar(request.chatId)) return { ok: false, code: 'chat-identity-missing' };
    if (!request.targetUnfiled && !cleanScalar(request.targetFolderId)) {
      return { ok: false, code: 'target-folder-id-required' };
    }
    var recordChatId = chatFolderBindingRequestRecordId(request.chatId);
    if (cleanScalar(review.recordId) && cleanScalar(review.recordId) !== recordChatId) {
      return { ok: false, code: 'chat-identity-mismatch' };
    }
    return { ok: true, request: request };
  }

  function chatFolderBindingFolderIdFromRow(row) {
    return cleanScalar(row && (row.folderId || row.folder_id || row.folderID));
  }

  function chatFolderBindingRequestApplyWarnings(review, applyResult) {
    var warnings = parseWarnings(review && (review.warningsJson || review.warnings));
    warnings.push({
      code: applyResult && applyResult.alreadyApplied === true
        ? 'chat-folder-binding-request-already-applied-on-desktop'
        : 'chat-folder-binding-request-applied-on-desktop',
      noChromeBindingAuthority: true,
      noChromeDestructiveBindingApply: true,
      noHardDelete: true,
      noChatDelete: true,
      noSnapshotDelete: true,
      noAssetDelete: true,
    });
    return JSON.stringify(warnings);
  }

  function chatFolderBindingRequestRawWithApplyResult(review, request, applyResult, appliedAt, peerId, alreadyApplied) {
    var payload = parseChatFolderBindingRequestPayload(review) || {};
    if (!isObject(payload)) payload = {};
    var beforeBinding = isObject(applyResult && applyResult.beforeBinding) ? applyResult.beforeBinding : null;
    var afterBinding = isObject(applyResult && applyResult.afterBinding) ? applyResult.afterBinding : null;
    var beforeFolderId = cleanScalar(applyResult && (applyResult.beforeFolderId || chatFolderBindingFolderIdFromRow(beforeBinding)));
    var afterFolderId = cleanScalar(applyResult && (applyResult.afterFolderId || chatFolderBindingFolderIdFromRow(afterBinding)));
    payload.desktopApplyResult = {
      schema: APPLY_RESULT_SCHEMA,
      phase: 'phase-b9',
      status: alreadyApplied === true
        ? 'already-applied-chat-folder-binding-request'
        : 'applied-chat-folder-binding-request',
      appliedAt: appliedAt,
      appliedBySurface: 'desktop-studio',
      appliedBySyncPeerIdPresent: !!peerId,
      reviewId: cleanScalar(review && review.reviewId),
      requestId: cleanScalar(request && request.requestId),
      chatId: cleanScalar(request && request.chatId),
      conversationId: cleanScalar(request && request.conversationId),
      expectedCurrentFolderId: nullableString(request && request.expectedCurrentFolderId),
      targetFolderId: nullableString(request && request.targetFolderId),
      targetKind: request && request.targetUnfiled === true ? 'unfiled' : 'folder',
      targetUnfiled: !!(request && request.targetUnfiled === true),
      beforeFolderId: beforeFolderId || nullableString(request && request.expectedCurrentFolderId),
      afterFolderId: afterFolderId || (request && request.targetUnfiled === true ? null : nullableString(request && request.targetFolderId)),
      changed: applyResult && applyResult.changed === true,
      alreadyApplied: alreadyApplied === true,
      validationStatus: 'accepted',
      storeIdentity: isObject(applyResult && (applyResult.storeIdentity || applyResult.bindingStoreIdentity))
        ? (applyResult.storeIdentity || applyResult.bindingStoreIdentity)
        : null,
      sameLiveCanonicalStore: applyResult && applyResult.sameLiveCanonicalStore === true,
      rowsAffected: Number(applyResult && applyResult.rowsAffected) || 0,
      noChromeBindingAuthority: true,
      noChromeDestructiveBindingApply: true,
      noDesktopCanonicalMutationFromChrome: true,
      noHardDelete: true,
      noPurge: true,
      noChatDelete: true,
      noSnapshotDelete: true,
      noAssetDelete: true,
    };
    return JSON.stringify(payload);
  }

  function markChatFolderBindingRequestApplied(review, request, applyResult, peerId, alreadyApplied) {
    var appliedAt = nowIso();
    var decision = alreadyApplied === true
      ? 'already-applied-chat-folder-binding-request'
      : 'applied-chat-folder-binding-request';
    var rawJson = chatFolderBindingRequestRawWithApplyResult(review, request, applyResult, appliedAt, peerId, alreadyApplied);
    var warningsJson = chatFolderBindingRequestApplyWarnings(review, {
      alreadyApplied: alreadyApplied === true,
    });
    return sqlExecute(
      'UPDATE ' + TABLE + ' SET status = ?, decision = ?, decided_at = ?, decided_by_sync_peer_id = ?, raw_tombstone_json = ?, warnings_json = ?, updated_at = ? WHERE review_id = ? AND status = ?',
      [
        'resolved',
        decision,
        appliedAt,
        peerId || null,
        rawJson,
        warningsJson,
        appliedAt,
        cleanScalar(review && review.reviewId),
        'pending',
      ]
    ).then(function (updateResult) {
      if (readRowsAffected(updateResult) <= 0) {
        return blockChatFolderBindingRequestApply(review, 'review-status-update-failed', {
          requestId: request.requestId,
          chatId: request.chatId,
          targetFolderId: request.targetFolderId,
        });
      }
      recordWrite('applyChatFolderBindingRequest');
      notifySubscribers({
        source: 'local',
        op: 'applyChatFolderBindingRequest',
        reviewId: cleanScalar(review && review.reviewId),
        chatId: cleanScalar(request && request.chatId),
        targetFolderId: cleanScalar(request && request.targetFolderId),
        status: 'resolved',
        decision: decision,
      });
      var result = makeChatFolderBindingRequestApplyResult(review);
      var beforeBinding = isObject(applyResult && applyResult.beforeBinding) ? applyResult.beforeBinding : null;
      var afterBinding = isObject(applyResult && applyResult.afterBinding) ? applyResult.afterBinding : null;
      result.ok = true;
      result.applied = alreadyApplied !== true;
      result.alreadyApplied = alreadyApplied === true;
      result.status = alreadyApplied === true
        ? 'chat-folder-binding-request-already-applied'
        : 'chat-folder-binding-request-applied';
      result.decision = decision;
      result.reviewStatus = 'resolved';
      result.reviewUpdated = true;
      result.writesPerformed = 1;
      result.requestId = request.requestId;
      result.chatId = request.chatId;
      result.conversationId = request.conversationId;
      result.expectedCurrentFolderId = request.expectedCurrentFolderId || null;
      result.targetFolderId = request.targetFolderId || null;
      result.targetKind = request.targetUnfiled === true ? 'unfiled' : 'folder';
      result.targetUnfiled = request.targetUnfiled === true;
      result.beforeFolderId = cleanScalar(applyResult && (applyResult.beforeFolderId || chatFolderBindingFolderIdFromRow(beforeBinding))) ||
        request.expectedCurrentFolderId || null;
      result.afterFolderId = cleanScalar(applyResult && (applyResult.afterFolderId || chatFolderBindingFolderIdFromRow(afterBinding))) ||
        (request.targetUnfiled === true ? null : request.targetFolderId || null);
      result.changed = applyResult && applyResult.changed === true;
      result.validationStatus = 'accepted';
      result.appliedAt = appliedAt;
      result.appliedBySyncPeerIdPresent = !!peerId;
      result.storeIdentity = isObject(applyResult && (applyResult.storeIdentity || applyResult.bindingStoreIdentity))
        ? (applyResult.storeIdentity || applyResult.bindingStoreIdentity)
        : null;
      result.sameLiveCanonicalStore = applyResult && applyResult.sameLiveCanonicalStore === true;
      result.moveResult = {
        ok: applyResult && applyResult.ok === true,
        status: cleanScalar(applyResult && applyResult.status),
        changed: applyResult && applyResult.changed === true,
        beforeFolderId: result.beforeFolderId,
        afterFolderId: result.afterFolderId,
        rowsAffected: Number(applyResult && applyResult.rowsAffected) || 0,
        noHardDelete: true,
        noChatDelete: true,
        noSnapshotDelete: true,
        noAssetDelete: true,
      };
      return result;
    });
  }

  function applyChatFolderBindingUnfileRequest(folders, review, request, peerId, opts) {
    if (!request.expectedCurrentFolderId) {
      return Promise.resolve(blockChatFolderBindingRequestApply(review, 'expected-current-folder-id-required', {
        requestId: request.requestId,
        chatId: request.chatId,
      }));
    }
    if (typeof folders.unbindChat !== 'function' || typeof folders.listCanonicalChatFolderBindingsForChat !== 'function') {
      return Promise.resolve(blockChatFolderBindingRequestApply(review, 'chat-folder-binding-unfile-unavailable', {
        requestId: request.requestId,
        chatId: request.chatId,
      }));
    }
    return folders.listCanonicalChatFolderBindingsForChat(request.chatId).then(function (beforeRows) {
      var before = Array.isArray(beforeRows) && beforeRows.length ? beforeRows[0] : null;
      var actualCurrentFolderId = chatFolderBindingFolderIdFromRow(before);
      if (!actualCurrentFolderId) {
        return markChatFolderBindingRequestApplied(review, request, {
          ok: true,
          status: 'chat-folder-binding-already-unfiled',
          changed: false,
          beforeBinding: null,
          afterBinding: null,
          beforeFolderId: null,
          afterFolderId: null,
          rowsAffected: 0,
          sameLiveCanonicalStore: true,
        }, peerId, true);
      }
      if (actualCurrentFolderId !== request.expectedCurrentFolderId) {
        return blockChatFolderBindingRequestApply(review, 'expected-current-folder-mismatch', {
          requestId: request.requestId,
          chatId: request.chatId,
          expectedCurrentFolderId: request.expectedCurrentFolderId,
          actualCurrentFolderId: actualCurrentFolderId,
        });
      }
      return folders.unbindChat(request.expectedCurrentFolderId, request.chatId, {
        reason: cleanScalar(opts && opts.reason) || 'phase-b9-auto-apply-chrome-chat-folder-binding-request',
        explicitF7Fallback: true,
        noHardDelete: true,
        noChatDelete: true,
        noSnapshotDelete: true,
        noAssetDelete: true,
      }).then(function (ok) {
        return folders.listCanonicalChatFolderBindingsForChat(request.chatId).then(function (afterRows) {
          var after = Array.isArray(afterRows) && afterRows.length ? afterRows[0] : null;
          if (ok !== true || after) {
            return blockChatFolderBindingRequestApply(review, 'chat-folder-binding-unfile-failed', {
              requestId: request.requestId,
              chatId: request.chatId,
              expectedCurrentFolderId: request.expectedCurrentFolderId,
            });
          }
          return markChatFolderBindingRequestApplied(review, request, {
            ok: true,
            status: 'chat-folder-binding-unfiled',
            changed: true,
            beforeBinding: before,
            afterBinding: null,
            beforeFolderId: actualCurrentFolderId,
            afterFolderId: null,
            rowsAffected: 1,
            sameLiveCanonicalStore: true,
          }, peerId, false);
        });
      });
    });
  }

  function applyChatFolderBindingRequest(input, options) {
    var reviewId = chatFolderBindingRequestApplyReviewId(input);
    var opts = isObject(options) ? options : {};
    if (!reviewId) return Promise.resolve(blockChatFolderBindingRequestApply(null, 'review-id-required'));
    return ensureReady()
      .then(function () { return getReview(reviewId); })
      .then(function (review) {
        var validation = validateChatFolderBindingRequestReviewForApply(review);
        if (!validation.ok) {
          var existingRequest = validation.request || null;
          if (validation.alreadyApplied === true) {
            var already = makeChatFolderBindingRequestApplyResult(review);
            already.ok = true;
            already.applied = false;
            already.alreadyApplied = true;
            already.status = 'chat-folder-binding-request-already-applied';
            already.decision = cleanScalar(review && review.decision);
            already.reviewStatus = cleanScalar(review && review.status);
            already.requestId = existingRequest ? existingRequest.requestId : null;
            already.chatId = existingRequest ? existingRequest.chatId : null;
            already.conversationId = existingRequest ? existingRequest.conversationId : null;
            already.expectedCurrentFolderId = existingRequest ? existingRequest.expectedCurrentFolderId : null;
            already.targetFolderId = existingRequest ? existingRequest.targetFolderId : null;
            already.targetKind = existingRequest && existingRequest.targetUnfiled === true ? 'unfiled' : 'folder';
            already.targetUnfiled = existingRequest ? existingRequest.targetUnfiled === true : false;
            return already;
          }
          return blockChatFolderBindingRequestApply(review, validation.code, {
            requestId: existingRequest ? existingRequest.requestId : null,
            chatId: existingRequest ? existingRequest.chatId : null,
            targetFolderId: existingRequest ? existingRequest.targetFolderId : null,
          });
        }
        var request = validation.request;
        var folders = H2O.Studio && H2O.Studio.store && H2O.Studio.store.folders;
        if (!folders || typeof folders.getCanonicalChatFolderBindingForChat !== 'function') {
          return blockChatFolderBindingRequestApply(review, 'folder-binding-store-unavailable', {
            requestId: request.requestId,
            chatId: request.chatId,
          });
        }
        return readLocalSyncPeerIdForDecision().then(function (peerId) {
          if (request.targetUnfiled === true) {
            return applyChatFolderBindingUnfileRequest(folders, review, request, peerId, opts);
          }
          if (typeof folders.moveCanonicalChatFolderBinding !== 'function') {
            return blockChatFolderBindingRequestApply(review, 'canonical-folder-binding-move-unavailable', {
              requestId: request.requestId,
              chatId: request.chatId,
              targetFolderId: request.targetFolderId,
            });
          }
          return folders.getCanonicalChatFolderBindingForChat(request.chatId).then(function (currentBinding) {
            var currentFolderId = chatFolderBindingFolderIdFromRow(currentBinding);
            if (currentFolderId === request.targetFolderId) {
              return markChatFolderBindingRequestApplied(review, request, {
                ok: true,
                status: 'chat-folder-binding-already-targeted',
                changed: false,
                beforeBinding: currentBinding,
                afterBinding: currentBinding,
                beforeFolderId: currentFolderId,
                afterFolderId: currentFolderId,
                rowsAffected: 0,
                sameLiveCanonicalStore: true,
                storeIdentity: currentBinding && currentBinding.storeIdentity,
              }, peerId, true);
            }
            if (request.expectedCurrentFolderId && currentFolderId !== request.expectedCurrentFolderId) {
              return blockChatFolderBindingRequestApply(review, 'expected-current-folder-mismatch', {
                requestId: request.requestId,
                chatId: request.chatId,
                expectedCurrentFolderId: request.expectedCurrentFolderId,
                actualCurrentFolderId: currentFolderId || '',
                targetFolderId: request.targetFolderId,
              });
            }
            return folders.moveCanonicalChatFolderBinding(request.targetFolderId, request.chatId, {
              expectedCurrentFolderId: request.expectedCurrentFolderId || currentFolderId,
              reason: cleanScalar(opts.reason) || 'phase-b9-auto-apply-chrome-chat-folder-binding-request',
              sourceReviewId: cleanScalar(review.reviewId),
              reviewId: cleanScalar(review.reviewId),
              requestId: cleanScalar(request.requestId),
              skipBindingTombstone: true,
              suppressBindingSubscribers: false,
              noHardDelete: true,
              noChatDelete: true,
              noSnapshotDelete: true,
              noAssetDelete: true,
            }).then(function (moveResult) {
              if (!moveResult || moveResult.ok !== true) {
                var status = cleanScalar(moveResult && moveResult.status) || 'chat-folder-binding-move-failed';
                var blocked = blockChatFolderBindingRequestApply(review, status, {
                  requestId: request.requestId,
                  chatId: request.chatId,
                  targetFolderId: request.targetFolderId,
                  moveResult: moveResult || null,
                });
                (Array.isArray(moveResult && moveResult.blockers) ? moveResult.blockers : []).forEach(function (code) {
                  pushBlocker(blocked, code && (code.code || code));
                });
                return blocked;
              }
              return markChatFolderBindingRequestApplied(review, request, moveResult, peerId, false);
            });
          });
        }, function () {
          return blockChatFolderBindingRequestApply(review, 'local-identity-unavailable', {
            requestId: request.requestId,
            chatId: request.chatId,
            targetFolderId: request.targetFolderId,
          });
        });
      })
      .catch(function (e) {
        recordError('applyChatFolderBindingRequest', e);
        var blocked = blockChatFolderBindingRequestApply(null, 'chat-folder-binding-request-apply-failed');
        blocked.reason = String((e && e.message) || e);
        return blocked;
      });
  }

  function requireDecisionReason(reason) {
    var value = cleanString(reason);
    if (!value) throw new Error('decision reason required');
    return value;
  }

  function canApplyDecisionTransition(currentStatus, nextStatus) {
    if (currentStatus === 'pending') {
      return nextStatus === 'ignored' ||
        nextStatus === 'rejected' ||
        nextStatus === 'accepted-later' ||
        nextStatus === 'resolved';
    }
    if (currentStatus === 'accepted-later') {
      return nextStatus === 'ignored' ||
        nextStatus === 'rejected' ||
        nextStatus === 'resolved';
    }
    return false;
  }

  function appendDecisionAuditWarning(rawWarnings, decision) {
    var warnings = parseWarnings(rawWarnings);
    warnings.push({
      code: 'decision-reason-recorded',
      action: decision,
      reasonPresent: true,
    });
    return JSON.stringify(warnings);
  }

  function makeDecisionResult(status, decision, decidedAt, peerId) {
    return {
      schema: DECISION_SCHEMA,
      ok: true,
      reviewFound: true,
      status: status,
      decision: decision,
      decidedAt: decidedAt,
      decidedBySyncPeerIdPresent: !!peerId,
      warnings: [],
    };
  }

  function markDecision(reviewIdInput, action, reason) {
    var reviewId = cleanString(reviewIdInput);
    if (!reviewId) return Promise.reject(new Error('reviewId required'));
    var spec = DECISION_ACTIONS[action];
    if (!spec || !STATUSES[spec.status]) return Promise.reject(new Error('invalid decision action: ' + action));
    try { requireDecisionReason(reason); }
    catch (e) { return Promise.reject(e); }
    return ensureReady()
      .then(function () {
        return getReview(reviewId);
      })
      .then(function (review) {
        if (!review) throw new Error('review not found');
        var currentStatus = cleanScalar(review.status);
        if (!canApplyDecisionTransition(currentStatus, spec.status)) {
          throw new Error('review status not decisionable: ' + (currentStatus || 'unknown'));
        }
        return readLocalSyncPeerIdForDecision().then(function (peerId) {
          var now = nowIso();
          var warningsJson = appendDecisionAuditWarning(review.warningsJson || review.warnings, spec.decision);
          return sqlExecute(
            'UPDATE ' + TABLE + ' SET status = ?, decision = ?, decided_at = ?, decided_by_sync_peer_id = ?, warnings_json = ?, updated_at = ? WHERE review_id = ?',
            [spec.status, spec.decision, now, peerId, warningsJson, now, reviewId]
          ).then(function (result) {
            if (readRowsAffected(result) <= 0) throw new Error('review decision update failed');
            recordWrite('markDecision');
            notifySubscribers({ source: 'local', op: 'markDecision', reviewId: reviewId, status: spec.status });
            return makeDecisionResult(spec.status, spec.decision, now, peerId);
          });
        });
      })
      .catch(function (e) { recordError('markDecision', e); throw e; });
  }
  function markIgnored(reviewId, reason) { return markDecision(reviewId, 'ignored', reason); }
  function markRejected(reviewId, reason) { return markDecision(reviewId, 'rejected', reason); }
  function markAcceptedLater(reviewId, reason) { return markDecision(reviewId, 'acceptedLater', reason); }
  function markResolved(reviewId, reason) { return markDecision(reviewId, 'resolved', reason); }

  function previewFolderBindingApply(review, tombstone, validation, result) {
    var ids = parseFolderBindingIds(tombstone, validation.metaObject);
    if (!ids.ok) {
      pushBlocker(result, 'malformed-remote-tombstone');
      result.action = 'blocked-malformed-review';
      return Promise.resolve(result);
    }
    return sqlSelect(
      'SELECT chat_id, folder_id, assigned_at FROM folder_bindings WHERE chat_id = ? LIMIT 1',
      [ids.chatId]
    ).then(function (rows) {
      var row = Array.isArray(rows) && rows.length ? (rows[0] || {}) : null;
      if (!row) {
        result.supported = true;
        result.action = 'no-op-already-missing';
        result.wouldMutateOnApply = false;
        result.mutationType = null;
        result.local = {
          exists: false,
          hasNewerEdit: false,
          targetMatches: false,
          timestampComparable: false,
        };
        result.auditPreview.wouldUpdateReviewDecision = true;
        result.auditPreview.wouldRequireOperatorConfirmation = true;
        return result;
      }

      var localFolderId = cleanScalar(row.folder_id || row.folderId);
      var targetMatches = localFolderId === ids.folderId;
      result.supported = true;
      result.local.exists = true;
      result.local.targetMatches = targetMatches;

      if (!targetMatches) {
        result.action = 'blocked-target-mismatch';
        pushBlocker(result, 'local-target-mismatch');
        return result;
      }

      var assignedAt = row.assigned_at == null ? row.assignedAt : row.assigned_at;
      var compared = previewTimestampComparison(assignedAt, tombstone.deletedAt);
      result.local.timestampComparable = compared.comparable;
      result.local.hasNewerEdit = compared.newer;
      if (!compared.comparable) {
        result.action = 'blocked-local-comparison-unavailable';
        pushBlocker(result, 'local-comparison-unavailable');
        pushCodeWarning(result.warnings, 'local-timestamp-unavailable');
        return result;
      }
      if (compared.newer) {
        result.action = 'blocked-delete-vs-edit';
        pushBlocker(result, 'delete-vs-edit');
        return result;
      }

      result.action = 'would-unbind-folder-binding';
      result.wouldMutateOnApply = true;
      result.mutationType = 'folderBinding.unbind';
      result.auditPreview.wouldCreateLocalTombstone = true;
      result.auditPreview.wouldUpdateReviewDecision = true;
      result.auditPreview.wouldRequireOperatorConfirmation = true;
      return result;
    }).catch(function () {
      result.action = 'blocked-local-comparison-unavailable';
      pushBlocker(result, 'local-comparison-unavailable');
      pushCodeWarning(result.warnings, 'folder-binding-local-comparison-failed');
      return result;
    });
  }

  function makeFolderCascadePreviewSummary(summary) {
    if (!summary) {
      return {
        groupFound: false,
        childCount: 0,
        pendingChildCount: 0,
        acceptedLaterChildCount: 0,
        resolvedChildCount: 0,
        blockedChildCount: 0,
        missingParent: null,
        complete: false,
        partial: true,
        orphan: null,
        warningsCount: 0,
      };
    }
    var warnings = Array.isArray(summary.warnings) ? summary.warnings : [];
    return {
      groupFound: true,
      childCount: Number(summary.childCount) || 0,
      pendingChildCount: Number(summary.pendingChildCount) || 0,
      acceptedLaterChildCount: Number(summary.acceptedLaterChildCount) || 0,
      resolvedChildCount: Number(summary.resolvedChildCount) || 0,
      blockedChildCount: Number(summary.blockedChildCount) || 0,
      missingParent: summary.missingParent === true,
      complete: summary.rootPresent === true && Number(summary.childCount) > 0,
      partial: !(summary.rootPresent === true && Number(summary.childCount) > 0),
      orphan: summary.missingParent === true,
      warningsCount: warnings.length,
    };
  }

  function buildCascadeGroupsForPreview(rows) {
    var groups = {};
    (Array.isArray(rows) ? rows : []).forEach(function (review, index) {
      var rowWarnings = [];
      var tombstone = parseCascadeTombstone(review, rowWarnings);
      var meta = cascadeMeta(tombstone);
      var root = isCascadeRootReview(review, tombstone, meta);
      var child = isCascadeChildReview(review, tombstone, meta);
      if (!root && !child) return;
      var peer = cleanScalar(review && review.remoteSyncPeerId) ||
        cleanScalar(tombstone && tombstone.deletedBySyncPeerId) ||
        'unknown-peer';
      var rootRecordId = root
        ? cascadeRecordId(review, tombstone)
        : inferCascadeRootRecordId(review, tombstone, meta);
      if (!rootRecordId) {
        rootRecordId = 'unknown-root:' + (cleanScalar(review && review.dedupeKey) || cleanScalar(review && review.reviewId) || String(index));
      }
      var group = ensureCascadeGroup(groups, peer + '\u0000' + rootRecordId);
      var member = makeCascadeMember(review, tombstone, meta, rootRecordId);
      if (root) addCascadeMemberOnce(group, 'root', member);
      if (child) addCascadeMemberOnce(group, 'children', member);
    });
    return groups;
  }

  function readCascadePreviewForFolder(review, tombstone) {
    var peer = cleanScalar(review && review.remoteSyncPeerId) ||
      cleanScalar(tombstone && tombstone.deletedBySyncPeerId) ||
      'unknown-peer';
    var rootRecordId = cascadeRecordId(review, tombstone);
    if (!rootRecordId) return Promise.resolve(makeFolderCascadePreviewSummary(null));
    return readAllReviewsForCascadeDiagnostics()
      .then(function (rows) {
        var groups = buildCascadeGroupsForPreview(rows);
        var group = groups[peer + '\u0000' + rootRecordId] || null;
        return makeFolderCascadePreviewSummary(group ? summarizeCascadeGroup(group, 0) : null);
      })
      .catch(function () {
        return makeFolderCascadePreviewSummary(null);
      });
  }

  function applyFolderCascadePreview(result, cascade) {
    result.cascade = cascade;
    if (!cascade || !cascade.groupFound || cascade.partial || cascade.missingParent) {
      pushBlocker(result, 'cascade-group-incomplete');
    }
    if (cascade && cascade.blockedChildCount > 0) {
      pushBlocker(result, 'cascade-group-incomplete');
    }
  }

  function readDesktopFolderDiagnostics(folderId, tombstone, result) {
    var id = cleanScalar(folderId);
    if (!id) {
      result.local.exists = null;
      result.local.hasNewerEdit = null;
      result.local.timestampComparable = null;
      result.local.childFolderCount = null;
      result.local.activeBindingCount = null;
      pushBlocker(result, 'malformed-remote-tombstone');
      pushCodeWarning(result.warnings, 'local-folder-id-unavailable');
      return Promise.resolve(result);
    }
    return sqlSelect(
      'SELECT f.id, f.updated_at, ' +
        '(SELECT COUNT(*) FROM folders child WHERE child.parent_id = f.id) AS child_folder_count, ' +
        '(SELECT COUNT(*) FROM folder_bindings fb WHERE fb.folder_id = f.id) AS active_binding_count ' +
        'FROM folders f WHERE f.id = ? LIMIT 1',
      [id]
    ).then(function (rows) {
      var row = Array.isArray(rows) && rows.length ? rows[0] : null;
      if (!row) {
        result.local.exists = false;
        result.local.hasNewerEdit = false;
        result.local.timestampComparable = false;
        result.local.childFolderCount = 0;
        result.local.activeBindingCount = 0;
        pushBlocker(result, 'missing-local-record');
        return result;
      }
      var updatedAt = row.updated_at == null ? row.updatedAt : row.updated_at;
      var compared = previewTimestampComparison(updatedAt, tombstone && tombstone.deletedAt);
      var childFolderCount = Number(row.child_folder_count == null ? row.childFolderCount : row.child_folder_count) || 0;
      var activeBindingCount = Number(row.active_binding_count == null ? row.activeBindingCount : row.active_binding_count) || 0;
      result.local.exists = true;
      result.local.hasNewerEdit = compared.newer;
      result.local.timestampComparable = compared.comparable;
      result.local.childFolderCount = childFolderCount;
      result.local.activeBindingCount = activeBindingCount;
      if (!compared.comparable) {
        pushBlocker(result, 'local-comparison-unavailable');
        pushCodeWarning(result.warnings, 'local-timestamp-unavailable');
      }
      if (compared.newer) pushBlocker(result, 'local-folder-newer-edit');
      if (childFolderCount > 0) pushBlocker(result, 'local-folder-has-child-folders');
      return result;
    }).catch(function () {
      result.local.exists = null;
      result.local.hasNewerEdit = null;
      result.local.timestampComparable = null;
      result.local.childFolderCount = null;
      result.local.activeBindingCount = null;
      pushBlocker(result, 'local-comparison-unavailable');
      pushCodeWarning(result.warnings, 'local-folder-diagnostics-unavailable');
      return result;
    });
  }

  function applyFolderClassificationBlockers(review, validation, result) {
    var classification = cleanScalar(review && review.classification);
    if (validation && validation.malformed) pushBlocker(result, 'malformed-remote-tombstone');
    if (classification === 'malformed-remote-tombstone') pushBlocker(result, 'malformed-remote-tombstone');
    if (classification === 'unsupported-record-kind') pushBlocker(result, 'unsupported-record-kind');
    if (classification === 'self-originated') pushBlocker(result, 'self-originated');
    if (classification === 'delete-vs-edit') pushBlocker(result, 'local-folder-newer-edit');
    if (classification === 'local-comparison-unavailable') pushBlocker(result, 'local-comparison-unavailable');
  }

  function applyFolderCascadeBlockerDetails(result, rows, review, tombstone) {
    var peer = cleanScalar(review && review.remoteSyncPeerId) ||
      cleanScalar(tombstone && tombstone.deletedBySyncPeerId) ||
      'unknown-peer';
    var rootRecordId = cascadeRecordId(review, tombstone);
    if (!rootRecordId) return;
    var groups = buildCascadeGroupsForPreview(rows);
    var group = groups[peer + '\u0000' + rootRecordId] || null;
    if (!group) return;
    var children = group.children || [];
    children.forEach(function (child) {
      if (child.deleteVsEdit) pushBlocker(result, 'cascade-child-delete-vs-edit');
      if (child.malformed) pushBlocker(result, 'cascade-child-malformed');
      if (child.unsupported) pushBlocker(result, 'cascade-child-unsupported');
    });
  }

  function previewFolderApply(review, tombstone, validation, result) {
    result.supported = false;
    result.action = 'blocked-folder-apply-deferred';
    result.wouldMutateOnApply = false;
    result.mutationType = null;
    result.local.targetMatches = null;
    result.auditPreview.wouldCreateLocalTombstone = false;
    result.auditPreview.wouldUpdateReviewDecision = false;
    result.auditPreview.wouldRequireOperatorConfirmation = true;
    pushBlocker(result, 'folder-apply-deferred');
    applyFolderClassificationBlockers(review, validation, result);
    (validation.errors || []).concat(validation.warnings || []).forEach(function (warning) {
      pushCodeWarning(result.warnings, warning && warning.code);
    });
    var folderId = parseFolderIdFromRecordId(tombstone && tombstone.recordId);
    return readDesktopFolderDiagnostics(folderId, tombstone, result)
      .then(function () {
        return readCascadePreviewForFolder(review, tombstone).then(function (cascade) {
          applyFolderCascadePreview(result, cascade);
          return readAllReviewsForCascadeDiagnostics().then(function (rows) {
            applyFolderCascadeBlockerDetails(result, rows, review, tombstone);
            return result;
          }).catch(function () {
            pushCodeWarning(result.warnings, 'cascade-diagnostics-unavailable');
            return result;
          });
        });
      });
  }

  function previewApply(reviewIdInput, options) {
    var opts = options || {};
    var reviewId = cleanString(reviewIdInput);
    if (!reviewId) {
      var missingId = makePreviewResult(null);
      missingId.ok = false;
      missingId.reviewFound = false;
      missingId.action = 'blocked-review-not-found';
      pushBlocker(missingId, 'review-not-found');
      return Promise.resolve(missingId);
    }
    return getReview(reviewId).then(function (review) {
      var result = makePreviewResult(review);
      if (!review) {
        result.ok = false;
        result.reviewFound = false;
        result.action = 'blocked-review-not-found';
        pushBlocker(result, 'review-not-found');
        return result;
      }

      var tombstone = parseReviewTombstone(review, result);
      if (!tombstone) return result;

      var kind = cleanScalar(tombstone.recordKind || review.recordKind);
      result.recordKind = kind || null;
      if (kind === 'folderBinding') result.supported = true;
      result.classification = nullableString(review.classification);
      result.status = nullableString(review.status);
      result.auditPreview.remoteTombstoneSourcePresent = !!(cleanScalar(review.remoteTombstoneId) || cleanScalar(tombstone.tombstoneId));
      result.auditPreview.remoteExportSourcePresent = !!cleanScalar(review.remoteExportId);

      var status = cleanScalar(review.status);
      if (status !== 'pending' && status !== 'accepted-later') {
        result.action = 'blocked-review-status-not-previewable';
        pushBlocker(result, 'review-status-not-previewable');
        return result;
      }

      if (kind === 'folder') {
        var folderValidation = validateRemoteTombstone(tombstone, null);
        return previewFolderApply(review, tombstone, folderValidation, result);
      }

      var classification = cleanScalar(review.classification);
      if (classification === 'malformed-remote-tombstone') {
        result.action = 'blocked-malformed-review';
        pushBlocker(result, 'malformed-remote-tombstone');
        return result;
      }
      if (classification === 'unsupported-record-kind') {
        result.action = 'blocked-unsupported-kind';
        pushBlocker(result, 'unsupported-record-kind');
        return result;
      }
      if (classification === 'self-originated') {
        result.action = 'blocked-self-originated';
        pushBlocker(result, 'self-originated');
        return result;
      }
      if (classification === 'delete-vs-edit') {
        result.action = 'blocked-delete-vs-edit';
        pushBlocker(result, 'delete-vs-edit');
        return result;
      }
      if (classification === 'local-comparison-unavailable') {
        result.action = 'blocked-local-comparison-unavailable';
        pushBlocker(result, 'local-comparison-unavailable');
        return result;
      }

      if (kind !== 'folderBinding') {
        result.action = 'blocked-unsupported-kind';
        pushBlocker(result, 'unsupported-record-kind');
        return result;
      }

      var validation = validateRemoteTombstone(tombstone, null);
      if (validation.malformed) {
        result.action = 'blocked-malformed-review';
        pushBlocker(result, 'malformed-remote-tombstone');
        validation.errors.concat(validation.warnings).forEach(function (warning) {
          pushCodeWarning(result.warnings, warning && warning.code);
        });
        return result;
      }

      return readLocalSyncPeerIdForPreview(result).then(function (localPeerId) {
        var remotePeerId = cleanScalar(review.remoteSyncPeerId) || cleanScalar(tombstone.deletedBySyncPeerId);
        if (localPeerId && remotePeerId && localPeerId === remotePeerId) {
          result.action = 'blocked-self-originated';
          pushBlocker(result, 'self-originated');
          return result;
        }
        if (!remotePeerId) pushCodeWarning(result.warnings, 'source-peer-ambiguous');
        return previewFolderBindingApply(review, tombstone, validation, result);
      });
    }).catch(function (e) {
      recordError('previewApply', e);
      var result = makePreviewResult(null);
      result.action = 'blocked-local-comparison-unavailable';
      pushBlocker(result, 'local-comparison-unavailable');
      pushCodeWarning(result.warnings, 'preview-apply-failed');
      return result;
    }).then(function (result) {
      if (opts && opts.includeSensitive === true) {
        pushCodeWarning(result.warnings, 'include-sensitive-ignored');
      }
      return result;
    });
  }

  function applyRealFolderBindingReview(review, tombstone, validation, opts, preview) {
    var gated = cleanString(opts && opts.devGate) === REAL_APPLY_DEV_GATE;
    if (!gated) return Promise.resolve(makeBlockedApplyResult(review, 'dev-gate-required'));
    var reason = cleanString(opts && opts.reason);
    if (!reason) return Promise.resolve(makeBlockedApplyResult(review, 'apply-reason-required'));
    var status = cleanScalar(review && review.status);
    if (status !== 'accepted-later') {
      return Promise.resolve(makeBlockedApplyResult(review, 'review-status-not-accepted-later'));
    }
    if (!preview || (Array.isArray(preview.blockers) && preview.blockers.length)) {
      var blocked = makeBlockedApplyResult(review, 'preview-blocked');
      (Array.isArray(preview && preview.blockers) ? preview.blockers : []).forEach(function (blocker) {
        pushBlocker(blocked, blocker && blocker.code);
      });
      mergeCodeWarnings(blocked.warnings, preview && preview.warnings);
      return Promise.resolve(blocked);
    }
    if (preview.action !== 'would-unbind-folder-binding') {
      if (preview.action === 'no-op-already-missing') {
        return Promise.resolve(makeBlockedApplyResult(review, 'local-target-missing'));
      }
      return Promise.resolve(makeBlockedApplyResult(review, 'unsupported-record-kind'));
    }

    var kind = cleanScalar(tombstone && tombstone.recordKind);
    if (kind === 'folder') return Promise.resolve(makeBlockedApplyResult(review, 'folder-apply-deferred'));
    if (kind !== 'folderBinding') return Promise.resolve(makeBlockedApplyResult(review, 'unsupported-record-kind'));
    if (validation && validation.malformed) {
      return Promise.resolve(makeBlockedApplyResult(review, 'malformed-remote-tombstone'));
    }
    var ids = parseFolderBindingIds(tombstone, validation && validation.metaObject);
    if (!ids.ok) return Promise.resolve(makeBlockedApplyResult(review, 'malformed-remote-tombstone'));
    var remoteDeletedAtMs = parseTimeMs(tombstone && tombstone.deletedAt);
    if (remoteDeletedAtMs == null) {
      return Promise.resolve(makeBlockedApplyResult(review, 'local-comparison-unavailable'));
    }

    return readLocalSyncPeerIdForDecision().then(function (peerId) {
      var remotePeerId = cleanScalar(review && review.remoteSyncPeerId) || cleanScalar(tombstone && tombstone.deletedBySyncPeerId);
      if (!remotePeerId) return makeBlockedApplyResult(review, 'source-peer-ambiguous');
      if (remotePeerId && peerId && remotePeerId === peerId) {
        return makeBlockedApplyResult(review, 'self-originated');
      }
      var invoke = getInvoke();
      if (!invoke) return makeBlockedApplyResult(review, 'tauri-invoke-unavailable');
      var payload = {
        devGate: REAL_APPLY_DEV_GATE,
        reviewId: cleanScalar(review && review.reviewId),
        chatId: ids.chatId,
        folderId: ids.folderId,
        reviewRecordId: cleanScalar(review && review.recordId) || cleanScalar(tombstone && tombstone.recordId),
        localTombstoneRecordId: buildFolderBindingRecordId(ids.chatId, ids.folderId),
        tombstoneId: generateTombstoneId(),
        localSyncPeerId: peerId,
        remoteDeletedAtMs: remoteDeletedAtMs,
        appliedAt: nowIso(),
        reason: reason,
      };
      return invoke('f5g4_apply_reviewed_folder_binding_tombstone', { payload: payload })
        .then(function (result) {
          if (result && result.ok === true && result.applied === true) {
            recordWrite('applyReview');
            notifySubscribers({ source: 'local', op: 'applyReview', reviewId: review.reviewId, status: 'resolved' });
          }
          if (opts && opts.includeSensitive === true && result && Array.isArray(result.warnings)) {
            pushCodeWarning(result.warnings, 'include-sensitive-ignored');
          }
          return result || makeBlockedApplyResult(review, 'transaction-precondition-failed');
        }).catch(function () {
          var failed = makeBlockedApplyResult(review, 'transaction-precondition-failed');
          pushCodeWarning(failed.warnings, 'apply-command-failed');
          return failed;
        });
    }).catch(function () {
      return makeBlockedApplyResult(review, 'local-identity-unavailable');
    });
  }

  function applyReview(reviewIdInput, options) {
    var opts = options || {};
    var dryRun = opts && opts.dryRun === true;
    var realApply = opts && opts.dryRun === false;
    var reviewId = cleanString(reviewIdInput);
    if (!reviewId) {
      var missingId = realApply ? makeApplyResult(null) : makeApplyDryRunResult(null, dryRun);
      missingId.ok = false;
      missingId.reviewFound = false;
      missingId.action = 'blocked-review-not-found';
      pushBlocker(missingId, 'review-not-found');
      return Promise.resolve(missingId);
    }
    return getReview(reviewId).then(function (review) {
      var result = realApply ? makeApplyResult(review) : makeApplyDryRunResult(review, dryRun);
      if (!review) {
        result.ok = false;
        result.reviewFound = false;
        result.action = 'blocked-review-not-found';
        pushBlocker(result, 'review-not-found');
        return result;
      }
      if (!dryRun && !realApply) {
        result.ok = false;
        result.action = 'blocked-real-apply-not-implemented';
        pushBlocker(result, 'real-apply-not-implemented');
        return result;
      }
      if (realApply) {
        var tombstone = parseReviewTombstone(review, makeApplyResult(review));
        if (!tombstone) return makeBlockedApplyResult(review, 'malformed-remote-tombstone');
        var validation = validateRemoteTombstone(tombstone, null);
        if (validation.malformed) return makeBlockedApplyResult(review, 'malformed-remote-tombstone');
        return previewApply(reviewId, { refreshLocalState: true, includeSensitive: false })
          .then(function (preview) {
            return applyRealFolderBindingReview(review, tombstone, validation, opts, preview);
          });
      }
      var status = cleanScalar(review.status);
      if (status !== 'pending' && status !== 'accepted-later') {
        result.ok = false;
        result.action = 'blocked-review-status-not-previewable';
        pushBlocker(result, 'review-status-not-previewable');
        return result;
      }
      return previewApply(reviewId, { refreshLocalState: true, includeSensitive: false }).then(function (preview) {
        result.preview = makePreviewSummary(preview);
        mergeCodeWarnings(result.warnings, preview && preview.warnings);
        if (!preview || (Array.isArray(preview.blockers) && preview.blockers.length)) {
          return blockApplyDryRunFromPreview(result, preview, review);
        }
        if (preview.action !== 'would-unbind-folder-binding' && preview.action !== 'no-op-already-missing') {
          pushBlocker(preview, 'unsupported-record-kind');
          return blockApplyDryRunFromPreview(result, preview, review);
        }
        setApplyDryRunPlan(result, preview, review);
        if (opts && opts.includeSensitive === true) {
          pushCodeWarning(result.warnings, 'include-sensitive-ignored');
        }
        return result;
      });
    }).catch(function (e) {
      recordError('applyReview', e);
      var result = realApply ? makeApplyResult(null) : makeApplyDryRunResult(null, dryRun);
      result.ok = false;
      if (realApply) {
        pushBlocker(result, 'transaction-precondition-failed');
        pushCodeWarning(result.warnings, 'apply-failed');
      } else {
        result.action = 'blocked-preview';
        pushBlocker(result, 'preview-blocked');
        pushCodeWarning(result.warnings, 'apply-dry-run-failed');
      }
      return result;
    });
  }

  function proveApplyTransaction(options) {
    var invoke = getInvoke();
    if (!invoke) return Promise.reject(new Error('tauri invoke unavailable'));
    var opts = isObject(options) ? options : {};
    var failAt = cleanString(opts.failAt || opts.fail_at);
    return invoke('f5g4_prove_tombstone_review_apply_transaction', {
      failAt: failAt || null,
    });
  }

  function countMap(rows, keyField) {
    var out = {};
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var key = cleanString(row[keyField]) || 'unknown';
      out[key] = Number(row.total) || 0;
    });
    return out;
  }
  function findCount(map, key) {
    return Number(map && map[key]) || 0;
  }

  function bumpMap(map, key) {
    var k = cleanString(key) || 'unknown';
    map[k] = Number(map[k] || 0) + 1;
  }

  function lifecycleRecommendations() {
    return [
      { code: 'peer-watermarks-required-before-compaction' },
      { code: 'synthetic-cleanup-preview-available-later' },
      { code: 'no-automatic-purge' },
    ];
  }

  function makeLifecycleTombstoneSection() {
    return {
      supported: true,
      available: true,
      ready: true,
      total: 0,
      active: 0,
      restored: 0,
      syntheticCandidates: 0,
      purgeBlocked: 0,
      byKind: {},
      byDeleteReason: {},
      cascadeCount: 0,
      remoteReviewAppliedCount: 0,
      oldestDeletedAt: null,
      newestDeletedAt: null,
      warnings: [],
    };
  }

  function makeLifecycleReviewSection() {
    return {
      supported: true,
      available: true,
      ready: true,
      total: 0,
      pending: 0,
      acceptedLater: 0,
      resolved: 0,
      rejected: 0,
      ignored: 0,
      superseded: 0,
      syntheticCandidates: 0,
      purgeBlocked: 0,
      byClassification: {},
      byStatus: {},
      malformedCount: 0,
      unsupportedKindCount: 0,
      deleteVsEditCount: 0,
      cascadeReviewCount: 0,
      oldestReceivedAt: null,
      newestReceivedAt: null,
      warnings: [],
    };
  }

  function unavailableLifecycleTombstoneSection(code) {
    var section = makeLifecycleTombstoneSection();
    section.available = false;
    section.ready = false;
    pushCodeWarning(section.warnings, code);
    return section;
  }

  function unavailableLifecycleReviewSection(code) {
    var section = makeLifecycleReviewSection();
    section.available = false;
    section.ready = false;
    pushCodeWarning(section.warnings, code);
    return section;
  }

  function lifecycleString(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value.trim();
    try {
      if (typeof value === 'object') return JSON.stringify(value);
    } catch (_) { /* ignore */ }
    return String(value).trim();
  }

  function lifecycleHasSyntheticMarker(value) {
    var s = lifecycleString(value).toLowerCase();
    if (!s) return false;
    for (var i = 0; i < SYNTHETIC_PREFIXES.length; i += 1) {
      var prefix = SYNTHETIC_PREFIXES[i];
      var encoded = '';
      try { encoded = encodeURIComponent(prefix).toLowerCase(); }
      catch (_) { encoded = prefix; }
      if (s.indexOf(prefix) >= 0 || s.indexOf(encoded) >= 0) return true;
    }
    return false;
  }

  function isSyntheticLifecycleTombstone(row) {
    return lifecycleHasSyntheticMarker(readField(row, 'recordId', 'record_id')) ||
      lifecycleHasSyntheticMarker(readField(row, 'deleteReason', 'delete_reason')) ||
      lifecycleHasSyntheticMarker(readField(row, 'metaJson', 'meta_json')) ||
      lifecycleHasSyntheticMarker(readField(row, 'meta', 'meta_json'));
  }

  function isSyntheticLifecycleReview(row) {
    return lifecycleHasSyntheticMarker(readField(row, 'reviewId', 'review_id')) ||
      lifecycleHasSyntheticMarker(readField(row, 'recordId', 'record_id')) ||
      lifecycleHasSyntheticMarker(readField(row, 'deleteReason', 'delete_reason')) ||
      lifecycleHasSyntheticMarker(readField(row, 'rawTombstoneJson', 'raw_tombstone_json')) ||
      lifecycleHasSyntheticMarker(readField(row, 'remoteExportId', 'remote_export_id'));
  }

  function updateLifecycleRange(section, oldestField, newestField, stateObj, value) {
    var raw = lifecycleString(value);
    if (!raw) return;
    var ms = parseTimeMs(raw);
    if (ms == null) return;
    if (stateObj.oldestMs == null || ms < stateObj.oldestMs) {
      stateObj.oldestMs = ms;
      section[oldestField] = raw;
    }
    if (stateObj.newestMs == null || ms > stateObj.newestMs) {
      stateObj.newestMs = ms;
      section[newestField] = raw;
    }
  }

  function isLifecycleCascadeTombstone(row) {
    var reason = cleanScalar(readField(row, 'deleteReason', 'delete_reason'));
    return !!(
      cleanScalar(readField(row, 'cascadeFrom', 'cascade_from')) ||
      /-cascade$/.test(reason) ||
      lifecycleString(readField(row, 'metaJson', 'meta_json')).indexOf('cascade') >= 0 ||
      lifecycleString(readField(row, 'meta', 'meta_json')).indexOf('cascade') >= 0
    );
  }

  function isLifecycleRemoteReviewAppliedTombstone(row) {
    var reason = cleanScalar(readField(row, 'deleteReason', 'delete_reason'));
    var meta = lifecycleString(readField(row, 'metaJson', 'meta_json')) ||
      lifecycleString(readField(row, 'meta', 'meta_json'));
    return reason === 'remote-review-apply' ||
      meta.indexOf('remote-review-apply') >= 0 ||
      meta.indexOf('tombstoneReviews.applyReview') >= 0;
  }

  function buildLifecycleTombstoneSection(rows) {
    var section = makeLifecycleTombstoneSection();
    var range = {};
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var kind = cleanScalar(readField(row, 'recordKind', 'record_kind')) || 'unknown';
      var reason = cleanScalar(readField(row, 'deleteReason', 'delete_reason')) || 'unknown';
      var restoredAt = cleanScalar(readField(row, 'restoredAt', 'restored_at'));
      section.total += 1;
      if (restoredAt) section.restored += 1;
      else section.active += 1;
      bumpMap(section.byKind, kind);
      bumpMap(section.byDeleteReason, reason);
      if (isLifecycleCascadeTombstone(row)) section.cascadeCount += 1;
      if (isLifecycleRemoteReviewAppliedTombstone(row)) section.remoteReviewAppliedCount += 1;
      if (isSyntheticLifecycleTombstone(row)) section.syntheticCandidates += 1;
      updateLifecycleRange(section, 'oldestDeletedAt', 'newestDeletedAt', range, readField(row, 'deletedAt', 'deleted_at'));
    });
    section.purgeBlocked = section.total;
    return section;
  }

  function buildLifecycleReviewSection(rows) {
    var section = makeLifecycleReviewSection();
    var range = {};
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var status = cleanScalar(readField(row, 'status', null)) || 'unknown';
      var classification = cleanScalar(readField(row, 'classification', null)) || 'unknown';
      section.total += 1;
      bumpMap(section.byStatus, status);
      bumpMap(section.byClassification, classification);
      if (status === 'pending') section.pending += 1;
      if (status === 'accepted-later') section.acceptedLater += 1;
      if (status === 'resolved') section.resolved += 1;
      if (status === 'rejected') section.rejected += 1;
      if (status === 'ignored') section.ignored += 1;
      if (status === 'superseded') section.superseded += 1;
      if (classification === 'malformed-remote-tombstone') section.malformedCount += 1;
      if (classification === 'unsupported-record-kind') section.unsupportedKindCount += 1;
      if (classification === 'delete-vs-edit') section.deleteVsEditCount += 1;
      if (classification === 'cascade-review') section.cascadeReviewCount += 1;
      if (isSyntheticLifecycleReview(row)) section.syntheticCandidates += 1;
      updateLifecycleRange(
        section,
        'oldestReceivedAt',
        'newestReceivedAt',
        range,
        readField(row, 'receivedAt', 'received_at') || readField(row, 'createdAt', 'created_at')
      );
    });
    section.purgeBlocked = section.total;
    return section;
  }

  function readLifecycleTombstoneRows() {
    return ensureReady().then(function () {
      return sqlSelect(
        'SELECT record_kind, record_id, delete_reason, deleted_at, restored_at, cascade_from, meta_json FROM ' +
          LOCAL_TOMBSTONE_TABLE,
        []
      );
    });
  }

  function readLifecycleReviewRows() {
    return ensureReady().then(function () {
      return sqlSelect(
        'SELECT review_id, record_kind, record_id, delete_reason, classification, status, decision, ' +
          'received_at, created_at, remote_export_id, raw_tombstone_json FROM ' + TABLE,
        []
      );
    });
  }

  function diagnoseLifecycle() {
    var tombstonesPromise = readLifecycleTombstoneRows()
      .then(buildLifecycleTombstoneSection)
      .catch(function (e) {
        recordError('diagnoseLifecycle:tombstones', e);
        return unavailableLifecycleTombstoneSection('lifecycle-tombstone-diagnostics-failed');
      });
    var reviewsPromise = readLifecycleReviewRows()
      .then(buildLifecycleReviewSection)
      .catch(function (e) {
        recordError('diagnoseLifecycle:reviews', e);
        return unavailableLifecycleReviewSection('lifecycle-review-diagnostics-failed');
      });
    return Promise.all([tombstonesPromise, reviewsPromise]).then(function (parts) {
      return {
        schema: LIFECYCLE_DIAGNOSTIC_SCHEMA,
        generatedAt: nowIso(),
        redacted: true,
        platform: 'desktop-tauri',
        tombstones: parts[0],
        reviews: parts[1],
        watermarks: {
          supported: false,
          reason: 'peer-watermarks-not-implemented',
        },
        recommendations: lifecycleRecommendations(),
      };
    }).catch(function (e) {
      recordError('diagnoseLifecycle', e);
      return {
        schema: LIFECYCLE_DIAGNOSTIC_SCHEMA,
        generatedAt: nowIso(),
        redacted: true,
        platform: 'desktop-tauri',
        tombstones: unavailableLifecycleTombstoneSection('lifecycle-diagnostics-failed'),
        reviews: unavailableLifecycleReviewSection('lifecycle-diagnostics-failed'),
        watermarks: {
          supported: false,
          reason: 'peer-watermarks-not-implemented',
        },
        recommendations: lifecycleRecommendations(),
      };
    });
  }

  function syntheticCleanupActions() {
    return {
      wouldDeleteRows: false,
      wouldMutateRows: false,
      realCleanupImplemented: false,
    };
  }

  function makeSyntheticCleanupTombstoneSection() {
    return {
      supported: true,
      available: true,
      ready: true,
      scanned: 0,
      syntheticCandidates: 0,
      cleanupEligible: 0,
      cleanupBlocked: 0,
      byKind: {},
      byDeleteReason: {},
      warnings: [],
    };
  }

  function makeSyntheticCleanupReviewSection() {
    return {
      supported: true,
      available: true,
      ready: true,
      scanned: 0,
      syntheticCandidates: 0,
      cleanupEligible: 0,
      cleanupBlocked: 0,
      byStatus: {},
      byClassification: {},
      warnings: [],
    };
  }

  function unavailableSyntheticCleanupTombstoneSection(code) {
    var section = makeSyntheticCleanupTombstoneSection();
    section.available = false;
    section.ready = false;
    pushCodeWarning(section.warnings, code);
    return section;
  }

  function unavailableSyntheticCleanupReviewSection(code) {
    var section = makeSyntheticCleanupReviewSection();
    section.available = false;
    section.ready = false;
    pushCodeWarning(section.warnings, code);
    return section;
  }

  function notRequestedSyntheticCleanupTombstoneSection() {
    var section = makeSyntheticCleanupTombstoneSection();
    pushCodeWarning(section.warnings, 'section-not-requested');
    return section;
  }

  function notRequestedSyntheticCleanupReviewSection() {
    var section = makeSyntheticCleanupReviewSection();
    pushCodeWarning(section.warnings, 'section-not-requested');
    return section;
  }

  function syntheticCleanupBlockedResult(platform, dryRun, blockerCode, warnings) {
    var result = {
      schema: SYNTHETIC_CLEANUP_PREVIEW_SCHEMA,
      ok: false,
      generatedAt: nowIso(),
      redacted: true,
      dryRun: dryRun === true,
      platform: platform,
      tombstones: makeSyntheticCleanupTombstoneSection(),
      reviews: makeSyntheticCleanupReviewSection(),
      actions: syntheticCleanupActions(),
      blockers: [],
      warnings: Array.isArray(warnings) ? warnings.slice() : [],
    };
    pushBlocker(result, blockerCode || 'preview-blocked');
    return result;
  }

  function syntheticCleanupKnownPrefixMap() {
    var out = {};
    SYNTHETIC_PREFIXES.forEach(function (prefix) { out[prefix] = true; });
    return out;
  }

  function readSyntheticCleanupPrefixes(options, warnings, blockers) {
    var opts = options || {};
    var supplied = opts.prefixes;
    var known = syntheticCleanupKnownPrefixMap();
    if (supplied == null) return SYNTHETIC_PREFIXES.slice();
    if (!Array.isArray(supplied)) {
      pushBlocker({ blockers: blockers }, 'invalid-prefixes');
      return [];
    }
    var out = [];
    var seen = {};
    supplied.forEach(function (value) {
      var prefix = cleanScalar(value).toLowerCase();
      if (!known[prefix]) {
        pushBlocker({ blockers: blockers }, 'invalid-prefixes');
        return;
      }
      if (!seen[prefix]) {
        seen[prefix] = true;
        out.push(prefix);
      }
    });
    if (!out.length) pushCodeWarning(warnings, 'no-synthetic-prefixes-enabled');
    return out;
  }

  function cleanupHasSyntheticMarker(value, prefixes) {
    var s = lifecycleString(value).toLowerCase();
    if (!s) return false;
    var allowed = Array.isArray(prefixes) ? prefixes : SYNTHETIC_PREFIXES;
    for (var i = 0; i < allowed.length; i += 1) {
      var prefix = cleanScalar(allowed[i]).toLowerCase();
      if (!prefix) continue;
      var encoded = '';
      try { encoded = encodeURIComponent(prefix).toLowerCase(); }
      catch (_) { encoded = prefix; }
      if (s.indexOf(prefix) >= 0 || s.indexOf(encoded) >= 0) return true;
    }
    return false;
  }

  function cleanupJsonMarkerHit(raw, prefixes, section) {
    var text = lifecycleString(raw);
    if (!text) return false;
    var parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      pushCodeWarning(section.warnings, 'cleanup-json-parse-failed');
      return false;
    }
    if (!isObject(parsed)) return false;
    var fields = [
      parsed.tombstoneId,
      parsed.recordId,
      parsed.deleteReason,
      parsed.cascadeFrom,
      parsed.sourceExportId,
      parsed.schema,
      parsed.source,
      parsed.sourceReviewId,
      parsed.remoteTombstoneId,
      parsed.remoteExportId,
      parsed.applyReason,
      parsed.validation,
      parsed.testId,
      parsed.targetKind,
      parsed.originalDeleteReason,
    ];
    var meta = isObject(parsed.meta) ? parsed.meta : {};
    [
      'source',
      'sourceReviewId',
      'remoteTombstoneId',
      'remoteExportId',
      'applyReason',
      'validation',
      'testId',
      'targetKind',
      'originalDeleteReason',
    ].forEach(function (key) {
      fields.push(meta[key]);
    });
    for (var i = 0; i < fields.length; i += 1) {
      if (cleanupHasSyntheticMarker(fields[i], prefixes)) return true;
    }
    return false;
  }

  function cleanupWarningsMarkerHit(raw, prefixes, section) {
    var text = lifecycleString(raw);
    if (!text) return false;
    var parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      pushCodeWarning(section.warnings, 'cleanup-json-parse-failed');
      return false;
    }
    if (!Array.isArray(parsed)) return false;
    for (var i = 0; i < parsed.length; i += 1) {
      var warning = parsed[i];
      if (!isObject(warning)) continue;
      if (cleanupHasSyntheticMarker(warning.code, prefixes) || cleanupHasSyntheticMarker(warning.action, prefixes)) {
        return true;
      }
    }
    return false;
  }

  function isSyntheticCleanupTombstone(row, prefixes, section) {
    return cleanupHasSyntheticMarker(readField(row, 'tombstoneId', 'tombstone_id'), prefixes) ||
      cleanupHasSyntheticMarker(readField(row, 'recordId', 'record_id'), prefixes) ||
      cleanupHasSyntheticMarker(readField(row, 'deleteReason', 'delete_reason'), prefixes) ||
      cleanupJsonMarkerHit(readField(row, 'metaJson', 'meta_json'), prefixes, section);
  }

  function isSyntheticCleanupReview(row, prefixes, section) {
    return cleanupHasSyntheticMarker(readField(row, 'reviewId', 'review_id'), prefixes) ||
      cleanupHasSyntheticMarker(readField(row, 'remoteTombstoneId', 'remote_tombstone_id'), prefixes) ||
      cleanupHasSyntheticMarker(readField(row, 'recordId', 'record_id'), prefixes) ||
      cleanupHasSyntheticMarker(readField(row, 'dedupeKey', 'dedupe_key'), prefixes) ||
      cleanupJsonMarkerHit(readField(row, 'rawTombstoneJson', 'raw_tombstone_json'), prefixes, section) ||
      cleanupWarningsMarkerHit(readField(row, 'warningsJson', 'warnings_json'), prefixes, section);
  }

  // F5H.3b.0c: synthetic marker contract v1 helpers. The column gate
  // (`is_synthetic = 1`) is required for cleanup eligibility. Prefix
  // corroboration is restricted to SAFE TOP-LEVEL FIELDS only — JSON
  // content fields (metaJson / rawTombstoneJson / warningsJson) are not
  // scanned by the contract because inbound bundles can legitimately
  // carry arbitrary strings there. See synthetic-marker-contract-v1.md.
  function isMarkedSynthetic(row) {
    if (!row || typeof row !== 'object') return false;
    var v = (row.is_synthetic !== undefined) ? row.is_synthetic : row.isSynthetic;
    return v === 1 || v === '1' || v === true;
  }

  function isCleanupContractTombstone(row, prefixes) {
    if (!isMarkedSynthetic(row)) return false;
    return cleanupHasSyntheticMarker(readField(row, 'tombstoneId', 'tombstone_id'), prefixes) ||
      cleanupHasSyntheticMarker(readField(row, 'recordId', 'record_id'), prefixes) ||
      cleanupHasSyntheticMarker(readField(row, 'deleteReason', 'delete_reason'), prefixes);
  }

  function isCleanupContractReview(row, prefixes) {
    if (!isMarkedSynthetic(row)) return false;
    return cleanupHasSyntheticMarker(readField(row, 'reviewId', 'review_id'), prefixes) ||
      cleanupHasSyntheticMarker(readField(row, 'remoteTombstoneId', 'remote_tombstone_id'), prefixes) ||
      cleanupHasSyntheticMarker(readField(row, 'recordId', 'record_id'), prefixes) ||
      cleanupHasSyntheticMarker(readField(row, 'dedupeKey', 'dedupe_key'), prefixes);
  }

  function isCleanupReviewTerminal(status) {
    return status === 'ignored' || status === 'rejected' || status === 'resolved' || status === 'superseded';
  }

  function isCleanupReviewBlockedClassification(classification) {
    return classification === 'delete-vs-edit' ||
      classification === 'malformed-remote-tombstone' ||
      classification === 'unsupported-record-kind';
  }

  function buildSyntheticCleanupTombstoneSection(rows, prefixes) {
    var section = makeSyntheticCleanupTombstoneSection();
    // F5H.3b.0c: contract-aware counts. syntheticContractCount and
    // cleanupContractEligible are additive — they coexist with the
    // pre-existing prefix-heuristic counts so consumers can compare.
    section.syntheticContractCount = 0;
    section.cleanupContractEligible = 0;
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var kind = cleanScalar(readField(row, 'recordKind', 'record_kind')) || 'unknown';
      var reason = cleanScalar(readField(row, 'deleteReason', 'delete_reason')) || 'unknown';
      var synthetic = isSyntheticCleanupTombstone(row, prefixes, section);
      var auditCritical = isLifecycleRemoteReviewAppliedTombstone(row);
      var cascadeLinked = isLifecycleCascadeTombstone(row);
      var contractSynthetic = isCleanupContractTombstone(row, prefixes);
      section.scanned += 1;
      bumpMap(section.byKind, kind);
      bumpMap(section.byDeleteReason, reason);
      if (synthetic) section.syntheticCandidates += 1;
      if (synthetic && !auditCritical && !cascadeLinked) section.cleanupEligible += 1;
      if (contractSynthetic) section.syntheticContractCount += 1;
      if (contractSynthetic && !auditCritical && !cascadeLinked) {
        section.cleanupContractEligible += 1;
      }
    });
    section.cleanupBlocked = section.scanned - section.cleanupEligible;
    return section;
  }

  function buildSyntheticCleanupReviewSection(rows, prefixes) {
    var section = makeSyntheticCleanupReviewSection();
    // F5H.3b.0c: contract-aware counts (additive — see tombstone counterpart).
    section.syntheticContractCount = 0;
    section.cleanupContractEligible = 0;
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var status = cleanScalar(readField(row, 'status', null)) || 'unknown';
      var classification = cleanScalar(readField(row, 'classification', null)) || 'unknown';
      var decision = cleanScalar(readField(row, 'decision', null));
      var synthetic = isSyntheticCleanupReview(row, prefixes, section);
      var contractSynthetic = isCleanupContractReview(row, prefixes);
      var eligible = synthetic &&
        isCleanupReviewTerminal(status) &&
        !isCleanupReviewBlockedClassification(classification) &&
        decision !== 'applied-folder-binding';
      var contractEligible = contractSynthetic &&
        isCleanupReviewTerminal(status) &&
        !isCleanupReviewBlockedClassification(classification) &&
        decision !== 'applied-folder-binding';
      section.scanned += 1;
      bumpMap(section.byStatus, status);
      bumpMap(section.byClassification, classification);
      if (synthetic) section.syntheticCandidates += 1;
      if (eligible) section.cleanupEligible += 1;
      if (contractSynthetic) section.syntheticContractCount += 1;
      if (contractEligible) section.cleanupContractEligible += 1;
    });
    section.cleanupBlocked = section.scanned - section.cleanupEligible;
    return section;
  }

  function readSyntheticCleanupTombstoneRows() {
    return ensureReady().then(function () {
      return sqlSelect(
        'SELECT tombstone_id, record_kind, record_id, delete_reason, restored_at, cascade_from, meta_json FROM ' +
          LOCAL_TOMBSTONE_TABLE,
        []
      );
    });
  }

  function readSyntheticCleanupReviewRows() {
    return ensureReady().then(function () {
      return sqlSelect(
        'SELECT review_id, remote_tombstone_id, record_kind, record_id, delete_reason, classification, ' +
          'status, decision, dedupe_key, raw_tombstone_json, warnings_json FROM ' + TABLE,
        []
      );
    });
  }

  // F5H.3b.0d — bridge from JS preview to Rust transactional dry-run.
  // Always rolls back; returns a redacted counts-only envelope with its
  // own schema string. No deletes commit. No row mutates. No
  // import/export/sync/apply behavior changes.
  function invokeTransactionalCleanupDryRun(opts) {
    var invoke = getInvoke();
    if (typeof invoke !== 'function') {
      return Promise.resolve({
        schema: 'h2o.studio.synthetic-cleanup-transaction-dry-run.v1',
        ok: false,
        blocker: 'tauri-invoke-unavailable',
        redacted: true,
        dryRun: true,
        transactional: true,
        platform: 'desktop-tauri',
        predicateVersion: 'h2o.studio.sync.synthetic-marker.v1',
      });
    }
    // F5H.3b.1a — opt-in. When the caller passes includeCandidateIds: true,
    // the Rust command additionally returns:
    //   - candidateIds: { syncTombstoneIds, syncTombstoneReviewIds } (sorted, deduped)
    //   - expectedCounts: { tombstones, reviews }
    //   - previewToken: "ptok1:<sha256-hex>" deterministic over predicate
    //                   version + DB fingerprint + sorted candidate IDs +
    //                   expected counts. F5H.3b.1b will require the caller
    //                   to echo this token back; cleanup will recompute it
    //                   and reject on mismatch.
    //   - dbFingerprint: { schemaUserVersion, migrationCount }
    // Default (omitted / false) preserves the F5H.3b.0d redacted shape.
    var payload = {
      requestedBySyncPeerId: cleanScalar(opts && opts.requestedBySyncPeerId) || null,
      reason: cleanScalar(opts && opts.reason) || null,
      includeCandidateIds: !!(opts && opts.includeCandidateIds === true),
    };
    return invoke('preview_cleanup_synthetic_transactional', { payload: payload })
      .then(function (result) {
        if (!result || typeof result !== 'object') {
          return {
            schema: 'h2o.studio.synthetic-cleanup-transaction-dry-run.v1',
            ok: false,
            blocker: 'invalid-tauri-result',
            redacted: true,
            dryRun: true,
            transactional: true,
            platform: 'desktop-tauri',
            predicateVersion: 'h2o.studio.sync.synthetic-marker.v1',
          };
        }
        return result;
      })
      .catch(function (e) {
        recordError('previewCleanupSynthetic:transactional', e);
        return {
          schema: 'h2o.studio.synthetic-cleanup-transaction-dry-run.v1',
          ok: false,
          blocker: 'tauri-command-failed',
          redacted: true,
          dryRun: true,
          transactional: true,
          platform: 'desktop-tauri',
          predicateVersion: 'h2o.studio.sync.synthetic-marker.v1',
        };
      });
  }

  function previewCleanupSynthetic(options) {
    var opts = options || {};
    if (opts.dryRun !== true) {
      return Promise.resolve(syntheticCleanupBlockedResult('desktop-tauri', false, 'dry-run-required'));
    }
    // F5H.3b.0d — opt-in true transactional dry-run path. When set, route
    // to the Rust Tauri command that runs the future cleanup transaction
    // shape against the real loaded SQLite DB, then rolls back. The
    // existing heuristic-preview path is unchanged for callers without
    // this opt-in.
    if (opts.transactional === true) {
      return invokeTransactionalCleanupDryRun(opts);
    }
    var warnings = [];
    var blockers = [];
    if (opts.includeSensitive === true) pushCodeWarning(warnings, 'include-sensitive-ignored');
    var prefixes = readSyntheticCleanupPrefixes(opts, warnings, blockers);
    if (blockers.length) {
      var blocked = syntheticCleanupBlockedResult('desktop-tauri', true, 'invalid-prefixes', warnings);
      blocked.blockers = blockers;
      return Promise.resolve(blocked);
    }

    var includeTombstones = opts.includeTombstones !== false;
    var includeReviews = opts.includeReviews !== false;
    var tombstonesPromise = includeTombstones
      ? readSyntheticCleanupTombstoneRows()
        .then(function (rows) { return buildSyntheticCleanupTombstoneSection(rows, prefixes); })
        .catch(function (e) {
          recordError('previewCleanupSynthetic:tombstones', e);
          return unavailableSyntheticCleanupTombstoneSection('synthetic-cleanup-tombstone-scan-failed');
        })
      : Promise.resolve(notRequestedSyntheticCleanupTombstoneSection());
    var reviewsPromise = includeReviews
      ? readSyntheticCleanupReviewRows()
        .then(function (rows) { return buildSyntheticCleanupReviewSection(rows, prefixes); })
        .catch(function (e) {
          recordError('previewCleanupSynthetic:reviews', e);
          return unavailableSyntheticCleanupReviewSection('synthetic-cleanup-review-scan-failed');
        })
      : Promise.resolve(notRequestedSyntheticCleanupReviewSection());

    return Promise.all([tombstonesPromise, reviewsPromise]).then(function (parts) {
      return {
        schema: SYNTHETIC_CLEANUP_PREVIEW_SCHEMA,
        ok: true,
        generatedAt: nowIso(),
        redacted: true,
        dryRun: true,
        platform: 'desktop-tauri',
        // F5H.3b.0c — both predicate version strings surfaced so consumers
        // can tell which counts came from which contract. The current
        // section counts (syntheticCandidates / cleanupEligible) are the
        // prefix-heuristic numbers; the contract-aware numbers live as
        // syntheticContractCount / cleanupContractEligible inside each
        // section. predicateVersion is the v1 contract; predicateHeuristicVersion
        // identifies the prefix-only heuristic used to compute the legacy
        // count fields.
        predicateVersion: 'h2o.studio.sync.synthetic-marker.v1',
        predicateHeuristicVersion: 'h2o.studio.sync.synthetic-prefix-heuristic',
        tombstones: parts[0],
        reviews: parts[1],
        actions: syntheticCleanupActions(),
        blockers: [],
        warnings: warnings,
      };
    }).catch(function (e) {
      recordError('previewCleanupSynthetic', e);
      var failed = syntheticCleanupBlockedResult('desktop-tauri', true, 'synthetic-cleanup-preview-failed', warnings);
      failed.tombstones = unavailableSyntheticCleanupTombstoneSection('synthetic-cleanup-preview-failed');
      failed.reviews = unavailableSyntheticCleanupReviewSection('synthetic-cleanup-preview-failed');
      return failed;
    });
  }

  function cleanupSyntheticActions(deleted) {
    return {
      deletedRows: !!deleted,
      mutatedRows: !!deleted,
      realCleanupImplemented: true,
    };
  }

  function cleanupSyntheticCounts(reviews, tombstones) {
    var r = Number(reviews) || 0;
    var t = Number(tombstones) || 0;
    return {
      reviewsDeleted: r,
      tombstonesDeleted: t,
      totalDeleted: r + t,
    };
  }

  function cleanupSyntheticFailure(code, status) {
    return {
      schema: SYNTHETIC_CLEANUP_COMMIT_SCHEMA,
      status: status || 'rejected',
      ok: false,
      redacted: true,
      platform: 'desktop-tauri',
      predicateVersion: 'h2o.studio.sync.synthetic-marker.v1',
      counts: cleanupSyntheticCounts(0, 0),
      audit: {
        recorded: false,
        maintenanceIdPresent: false,
        operatorPeerRecorded: false,
      },
      actions: cleanupSyntheticActions(false),
      blockers: [{ code: String(code || 'desktop-maintenance-unavailable') }],
      warnings: [],
    };
  }

  function cleanupHasControlCharacters(value) {
    return /[\u0000-\u001f\u007f]/.test(String(value || ''));
  }

  function cleanupNormalizeCandidateArray(value) {
    if (!Array.isArray(value)) return null;
    var out = [];
    for (var i = 0; i < value.length; i += 1) {
      if (typeof value[i] !== 'string') return null;
      var id = value[i].trim();
      if (!id || cleanupHasControlCharacters(id)) return null;
      out.push(id);
    }
    return out;
  }

  function cleanupExpectedCount(value) {
    var n = Number(value);
    if (!Number.isFinite(n) || Math.floor(n) !== n || n < 0) return null;
    return n;
  }

  function cleanupSynthetic(options) {
    var opts = isObject(options) ? options : {};
    if (opts.dryRun !== false) {
      return Promise.resolve(cleanupSyntheticFailure('dry-run-false-required'));
    }
    if (opts.devGate !== SYNTHETIC_CLEANUP_DEV_GATE) {
      return Promise.resolve(cleanupSyntheticFailure('invalid-dev-gate'));
    }
    var reason = cleanString(opts.reason);
    if (reason.length < 12 || reason.length > 256 || cleanupHasControlCharacters(reason)) {
      return Promise.resolve(cleanupSyntheticFailure('invalid-reason'));
    }
    if (!isObject(opts.candidateIds)) {
      return Promise.resolve(cleanupSyntheticFailure('invalid-candidate-ids'));
    }
    var reviewIds = cleanupNormalizeCandidateArray(opts.candidateIds.syncTombstoneReviewIds);
    var tombstoneIds = cleanupNormalizeCandidateArray(opts.candidateIds.syncTombstoneIds);
    if (!reviewIds || !tombstoneIds) {
      return Promise.resolve(cleanupSyntheticFailure('invalid-candidate-ids'));
    }
    if ((reviewIds.length + tombstoneIds.length) > MAX_SYNTHETIC_CLEANUP_CANDIDATES) {
      return Promise.resolve(cleanupSyntheticFailure('invalid-candidate-ids'));
    }
    if (!isObject(opts.expectedCounts)) {
      return Promise.resolve(cleanupSyntheticFailure('expected-count-mismatch'));
    }
    var expectedReviews = cleanupExpectedCount(opts.expectedCounts.reviews);
    var expectedTombstones = cleanupExpectedCount(opts.expectedCounts.tombstones);
    if (expectedReviews == null || expectedTombstones == null ||
        expectedReviews !== reviewIds.length || expectedTombstones !== tombstoneIds.length) {
      return Promise.resolve(cleanupSyntheticFailure('expected-count-mismatch'));
    }
    if (reviewIds.length === 0 && tombstoneIds.length === 0) {
      return Promise.resolve(cleanupSyntheticFailure('no-eligible-synthetic-rows'));
    }
    var previewToken = cleanString(opts.previewToken);
    if (!SYNTHETIC_CLEANUP_TOKEN_RE.test(previewToken)) {
      return Promise.resolve(cleanupSyntheticFailure('invalid-preview-token'));
    }
    var invoke = getInvoke();
    if (typeof invoke !== 'function' || !detectTauri()) {
      return Promise.resolve(cleanupSyntheticFailure('desktop-maintenance-unavailable'));
    }

    return readLocalSyncPeerIdForDecision()
      .then(function (peerId) {
        return invoke('cleanup_synthetic_commit', {
          payload: {
            dryRun: false,
            devGate: SYNTHETIC_CLEANUP_DEV_GATE,
            reason: reason,
            requestedBySyncPeerId: peerId,
            candidateIds: {
              syncTombstoneReviewIds: reviewIds,
              syncTombstoneIds: tombstoneIds,
            },
            expectedCounts: {
              reviews: expectedReviews,
              tombstones: expectedTombstones,
            },
            previewToken: previewToken,
          },
        });
      })
      .then(function (result) {
        if (!isObject(result) || result.schema !== SYNTHETIC_CLEANUP_COMMIT_SCHEMA) {
          return cleanupSyntheticFailure('desktop-maintenance-unavailable');
        }
        if (result.ok === true && result.status === 'committed') {
          recordWrite('cleanupSynthetic');
        }
        return result;
      })
      .catch(function (e) {
        recordError('cleanupSynthetic', e);
        return cleanupSyntheticFailure('desktop-maintenance-unavailable');
      });
  }

  function readAllReviewsForCascadeDiagnostics() {
    return ensureReady()
      .then(function () {
        return sqlSelect(
          'SELECT * FROM ' + TABLE + ' ORDER BY remote_sync_peer_id ASC, record_id ASC, review_id ASC',
          []
        );
      })
      .then(function (rows) {
        return (Array.isArray(rows) ? rows : []).map(rowToJs).filter(Boolean);
      });
  }

  function parseCascadeTombstone(review, warnings) {
    var raw = review && review.rawTombstoneJson;
    if (!raw) {
      pushCodeWarning(warnings, 'cascade-raw-tombstone-unavailable');
      return null;
    }
    try {
      var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!isObject(parsed)) throw new Error('raw tombstone not object');
      return parsed;
    } catch (_) {
      pushCodeWarning(warnings, 'cascade-raw-tombstone-unparseable');
      return null;
    }
  }

  function cascadeMeta(tombstone) {
    return isObject(tombstone && tombstone.meta) ? tombstone.meta : null;
  }

  function cascadeKind(review, tombstone) {
    return cleanScalar(tombstone && tombstone.recordKind) || cleanScalar(review && review.recordKind);
  }

  function cascadeDeleteReason(review, tombstone) {
    return cleanScalar(tombstone && tombstone.deleteReason) || cleanScalar(review && review.deleteReason);
  }

  function cascadeRecordId(review, tombstone) {
    return cleanScalar(tombstone && tombstone.recordId) || cleanScalar(review && review.recordId);
  }

  function encodeCascadePart(value) {
    var s = cleanScalar(value);
    try { return encodeURIComponent(s); }
    catch (_) { return s; }
  }

  function cascadeFolderRecordId(folderId) {
    var id = cleanScalar(folderId);
    return id ? ('folder:' + encodeCascadePart(id)) : '';
  }

  function inferCascadeRootRecordId(review, tombstone, meta) {
    var explicit = cleanScalar(tombstone && tombstone.cascadeFrom);
    if (explicit) return explicit;
    var kind = cascadeKind(review, tombstone);
    if (kind === 'folder') return cascadeRecordId(review, tombstone);
    if (kind === 'folderBinding') {
      var folderId = cleanScalar(meta && (meta.folderId || meta.oldFolderId));
      if (folderId) return cascadeFolderRecordId(folderId);
      var ids = parseFolderBindingIds(tombstone || { recordId: cascadeRecordId(review, tombstone) }, meta);
      if (ids && ids.folderId) return cascadeFolderRecordId(ids.folderId);
    }
    return '';
  }

  function isCascadeRootReview(review, tombstone, meta) {
    var kind = cascadeKind(review, tombstone);
    var reason = cascadeDeleteReason(review, tombstone);
    return kind === 'folder' &&
      !cleanScalar(tombstone && tombstone.cascadeFrom) &&
      !/-cascade$/.test(reason) &&
      ((meta && meta.cascade === true) || reason === 'folder-delete');
  }

  function isCascadeChildReview(review, tombstone, meta) {
    var kind = cascadeKind(review, tombstone);
    var reason = cascadeDeleteReason(review, tombstone);
    return !!(
      cleanScalar(tombstone && tombstone.cascadeFrom) ||
      /-cascade$/.test(reason) ||
      (meta && meta.cascade === true && BINDING_TOMBSTONE_KINDS[kind]) ||
      (meta && cleanScalar(meta.cascadeKind))
    );
  }

  function makeCascadeMember(review, tombstone, meta, rootRecordId) {
    var classification = cleanScalar(review && review.classification);
    var status = cleanScalar(review && review.status);
    var kind = cascadeKind(review, tombstone);
    return {
      memberKey: cleanScalar(review && review.dedupeKey) ||
        cleanScalar(review && review.remoteTombstoneId) ||
        cleanScalar(review && review.reviewId),
      kind: kind,
      status: status,
      classification: classification,
      decision: cleanScalar(review && review.decision),
      rootRecordId: cleanScalar(rootRecordId),
      cascadeFrom: cleanScalar(tombstone && tombstone.cascadeFrom),
      seenCount: Number(review && review.seenCount) || 1,
      exportPresent: !!cleanScalar(review && review.remoteExportId),
      malformed: classification === 'malformed-remote-tombstone',
      unsupported: classification === 'unsupported-record-kind' || !KNOWN_TOMBSTONE_KINDS[kind],
      deleteVsEdit: classification === 'delete-vs-edit',
      localComparisonUnavailable: classification === 'local-comparison-unavailable',
      applied: status === 'resolved' && cleanScalar(review && review.decision) === 'applied-folder-binding',
      applyCandidate: kind === 'folderBinding' &&
        status === 'accepted-later' &&
        (classification === 'safe-review' || classification === 'cascade-review'),
      reviewWarnings: parseWarnings(review && (review.warningsJson || review.warnings)).map(function (warning) {
        return cleanScalar(warning && warning.code);
      }).filter(Boolean),
      metaCascadeKindPresent: !!(meta && cleanScalar(meta.cascadeKind)),
    };
  }

  function ensureCascadeGroup(groups, key) {
    if (!groups[key]) {
      groups[key] = {
        key: key,
        root: null,
        children: [],
        memberKeys: {},
      };
    }
    return groups[key];
  }

  function addCascadeMemberOnce(group, bucket, member) {
    var fallbackIndex = bucket === 'children' ? group.children.length : (group.root ? 1 : 0);
    var key = cleanScalar(member && member.memberKey) || (bucket + ':' + fallbackIndex);
    if (group.memberKeys[bucket + ':' + key]) return;
    group.memberKeys[bucket + ':' + key] = true;
    if (bucket === 'root') {
      if (!group.root) group.root = member;
      return;
    }
    group.children.push(member);
  }

  function addCascadeGroupWarning(warnings, code) {
    pushCodeWarning(warnings, code);
  }

  function summarizeCascadeGroup(group, index) {
    var root = group.root || null;
    var children = group.children || [];
    var warnings = [];
    var pendingChildCount = 0;
    var acceptedLaterChildCount = 0;
    var resolvedChildCount = 0;
    var rejectedChildCount = 0;
    var ignoredChildCount = 0;
    var supersededChildCount = 0;
    var appliedChildCount = 0;
    var hasDeleteVsEditChild = false;
    var hasUnsupportedChild = false;
    var hasMalformedChild = false;
    var childApplyCandidates = 0;
    var blockedChildCount = 0;

    children.forEach(function (child) {
      var status = cleanScalar(child.status) || 'unknown';
      if (status === 'pending') pendingChildCount += 1;
      if (status === 'accepted-later') acceptedLaterChildCount += 1;
      if (status === 'resolved') resolvedChildCount += 1;
      if (status === 'rejected') rejectedChildCount += 1;
      if (status === 'ignored') ignoredChildCount += 1;
      if (status === 'superseded') supersededChildCount += 1;
      if (child.applied) appliedChildCount += 1;
      if (child.deleteVsEdit) hasDeleteVsEditChild = true;
      if (child.unsupported) hasUnsupportedChild = true;
      if (child.malformed) hasMalformedChild = true;
      if (child.applyCandidate) childApplyCandidates += 1;
      if (
        child.deleteVsEdit ||
        child.localComparisonUnavailable ||
        child.unsupported ||
        child.malformed ||
        status === 'rejected' ||
        status === 'ignored' ||
        status === 'superseded'
      ) {
        blockedChildCount += 1;
      }
    });

    var rootStatus = cleanScalar(root && root.status) || null;
    if (!root) addCascadeGroupWarning(warnings, 'cascade-root-missing');
    if (root && children.length === 0) addCascadeGroupWarning(warnings, 'cascade-root-only');
    if (root && root.kind && root.kind !== 'folder') addCascadeGroupWarning(warnings, 'cascade-root-kind-unsupported');
    if (rootStatus === 'rejected' && (pendingChildCount + acceptedLaterChildCount) > 0) {
      addCascadeGroupWarning(warnings, 'cascade-root-rejected-with-pending-children');
    }
    if (rootStatus === 'pending' && resolvedChildCount > 0) {
      addCascadeGroupWarning(warnings, 'cascade-parent-pending-with-resolved-children');
    }
    if (hasDeleteVsEditChild) addCascadeGroupWarning(warnings, 'cascade-child-delete-vs-edit');
    if (hasMalformedChild) addCascadeGroupWarning(warnings, 'cascade-child-malformed');
    if (hasUnsupportedChild) addCascadeGroupWarning(warnings, 'cascade-child-unsupported');
    if (!root || children.length === 0) addCascadeGroupWarning(warnings, 'cascade-incomplete-review-set');

    return {
      groupRef: 'cascade-group-' + String(index + 1).padStart(3, '0'),
      rootKind: nullableString(root && root.kind),
      rootPresent: !!root,
      rootStatus: nullableString(rootStatus),
      rootClassification: nullableString(root && root.classification),
      childCount: children.length,
      pendingChildCount: pendingChildCount,
      acceptedLaterChildCount: acceptedLaterChildCount,
      resolvedChildCount: resolvedChildCount,
      rejectedChildCount: rejectedChildCount,
      ignoredChildCount: ignoredChildCount,
      supersededChildCount: supersededChildCount,
      appliedChildCount: appliedChildCount,
      missingParent: !root,
      hasDeleteVsEditChild: hasDeleteVsEditChild,
      hasUnsupportedChild: hasUnsupportedChild,
      hasMalformedChild: hasMalformedChild,
      childApplyCandidates: childApplyCandidates,
      applyEligibleChildCount: childApplyCandidates,
      blockedChildCount: blockedChildCount,
      warnings: warnings,
    };
  }

  function buildCascadeDiagnostics(rows, options) {
    var opts = options || {};
    var groups = {};
    var warnings = [];
    (Array.isArray(rows) ? rows : []).forEach(function (review, index) {
      var rowWarnings = [];
      var tombstone = parseCascadeTombstone(review, rowWarnings);
      var meta = cascadeMeta(tombstone);
      var root = isCascadeRootReview(review, tombstone, meta);
      var child = isCascadeChildReview(review, tombstone, meta);
      if (!root && !child) return;
      var peer = cleanScalar(review && review.remoteSyncPeerId) ||
        cleanScalar(tombstone && tombstone.deletedBySyncPeerId) ||
        'unknown-peer';
      var rootRecordId = root
        ? cascadeRecordId(review, tombstone)
        : inferCascadeRootRecordId(review, tombstone, meta);
      if (!rootRecordId) {
        rootRecordId = 'unknown-root:' + (cleanScalar(review && review.dedupeKey) || cleanScalar(review && review.reviewId) || String(index));
        pushCodeWarning(rowWarnings, 'cascade-root-missing');
      }
      var group = ensureCascadeGroup(groups, peer + '\u0000' + rootRecordId);
      var member = makeCascadeMember(review, tombstone, meta, rootRecordId);
      rowWarnings.concat(member.reviewWarnings || []).forEach(function (code) {
        if (code === 'missing-cascade-parent') addCascadeGroupWarning(warnings, 'cascade-root-missing');
      });
      if (root) addCascadeMemberOnce(group, 'root', member);
      if (child) addCascadeMemberOnce(group, 'children', member);
    });

    var keys = Object.keys(groups).sort();
    var groupSummaries = keys.map(function (key, index) {
      return summarizeCascadeGroup(groups[key], index);
    });
    var groupsByRootKind = {};
    var groupsByStatus = {};
    var completeGroups = 0;
    var orphanChildGroups = 0;
    var rootOnlyGroups = 0;
    groupSummaries.forEach(function (group) {
      if (group.rootPresent && group.childCount > 0) completeGroups += 1;
      if (!group.rootPresent) orphanChildGroups += 1;
      if (group.rootPresent && group.childCount === 0) rootOnlyGroups += 1;
      bumpMap(groupsByRootKind, group.rootKind || 'missing-root');
      bumpMap(groupsByStatus, group.rootStatus || (group.rootPresent ? 'unknown' : 'orphan'));
    });
    if (opts && opts.includeSensitive === true) {
      pushCodeWarning(warnings, 'include-sensitive-ignored');
    }
    return {
      schema: CASCADE_DIAGNOSTIC_SCHEMA,
      generatedAt: nowIso(),
      redacted: true,
      totalGroups: groupSummaries.length,
      completeGroups: completeGroups,
      partialGroups: groupSummaries.length - completeGroups,
      orphanChildGroups: orphanChildGroups,
      rootOnlyGroups: rootOnlyGroups,
      groupsByRootKind: groupsByRootKind,
      groupsByStatus: groupsByStatus,
      folderApplyDeferred: true,
      cascadeApplyImplemented: false,
      groups: groupSummaries,
      warnings: warnings,
    };
  }

  function diagnoseCascadeGroups(options) {
    return readAllReviewsForCascadeDiagnostics()
      .then(function (rows) { return buildCascadeDiagnostics(rows, options); })
      .catch(function (e) {
        recordError('diagnoseCascadeGroups', e);
        return {
          schema: CASCADE_DIAGNOSTIC_SCHEMA,
          generatedAt: nowIso(),
          redacted: true,
          totalGroups: 0,
          completeGroups: 0,
          partialGroups: 0,
          orphanChildGroups: 0,
          rootOnlyGroups: 0,
          groupsByRootKind: {},
          groupsByStatus: {},
          folderApplyDeferred: true,
          cascadeApplyImplemented: false,
          groups: [],
          warnings: [{ code: 'cascade-diagnostics-failed' }],
        };
      });
  }

  function diagnose(options) {
    var includeSensitive = !!(options && options.includeSensitive);
    return ensureReady()
      .then(function () {
        return Promise.all([
          sqlSelect(
            'SELECT COUNT(*) AS total, ' +
            'SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) AS pending FROM ' + TABLE,
            []
          ),
          countByClassification(),
          countByStatus(),
        ]);
      })
      .then(function (parts) {
        var summary = Array.isArray(parts[0]) && parts[0].length ? parts[0][0] : {};
        var byClassificationRows = parts[1] || [];
        var byStatusRows = parts[2] || [];
        var byClassification = countMap(byClassificationRows, 'classification');
        var byStatus = countMap(byStatusRows, 'status');
        return {
          schema: DIAGNOSTIC_SCHEMA,
          installed: true,
          ready: state.ready,
          generatedAt: nowIso(),
          schemaVersion: SCHEMA_VERSION,
          reviewSchema: REVIEW_SCHEMA,
          dbUrl: DB_URL,
          table: TABLE,
          redacted: !includeSensitive,
          total: Number(summary.total) || 0,
          pending: Number(summary.pending) || 0,
          byClassification: byClassificationRows,
          byStatus: byStatusRows,
          malformedCount: findCount(byClassification, 'malformed-remote-tombstone'),
          selfOriginatedIgnoredCount: findCount(byClassification, 'self-originated'),
          duplicateCount: findCount(byClassification, 'duplicate-remote-tombstone'),
          cascadeReviewCount: findCount(byClassification, 'cascade-review'),
          deleteVsEditCount: findCount(byClassification, 'delete-vs-edit'),
          unsupportedKindCount: findCount(byClassification, 'unsupported-record-kind'),
          lastReloadedAt: state.lastReloadedAt,
          lastWriteAt: state.lastWriteAt,
          writesSinceBoot: state.writesSinceBoot,
          subscribers: state.subscribers.size,
          initError: state.initError,
          warnings: state.warnings.slice(),
        };
      })
      .catch(function (e) {
        recordError('diagnose', e);
        return {
          schema: DIAGNOSTIC_SCHEMA,
          installed: true,
          ready: state.ready,
          generatedAt: nowIso(),
          schemaVersion: SCHEMA_VERSION,
          reviewSchema: REVIEW_SCHEMA,
          dbUrl: DB_URL,
          table: TABLE,
          redacted: !includeSensitive,
          total: 0,
          pending: 0,
          byClassification: [],
          byStatus: [],
          initError: state.initError || String((e && e.message) || e),
          warnings: state.warnings.slice(),
        };
      });
  }

  var api = {
    __installed: true,
    __version: '0.1.0-f5h.2',
    init: init,
    dispose: dispose,
    isReady: isReady,
    getAll: getAll,
    list: listReviews,
    reload: reload,
    saveNow: saveNow,
    subscribe: subscribe,
    createReview: createReview,
    upsertReviewSighting: upsertReviewSighting,
    findPendingFolderDeleteRequest: findPendingFolderDeleteRequest,
    listFolderDeleteRequests: listFolderDeleteRequests,
    listFolderDeleteReceipts: listFolderDeleteReceipts,
    ingestFolderDeleteRequests: ingestFolderDeleteRequests,
    applyFolderDeleteRequest: applyFolderDeleteRequest,
    findPendingFolderRestoreRequest: findPendingFolderRestoreRequest,
    listFolderRestoreRequests: listFolderRestoreRequests,
    listFolderRestoreReceipts: listFolderRestoreReceipts,
    ingestFolderRestoreRequests: ingestFolderRestoreRequests,
    applyFolderRestoreRequest: applyFolderRestoreRequest,
    findPendingChatFolderBindingRequest: findPendingChatFolderBindingRequest,
    listChatFolderBindingRequests: listChatFolderBindingRequests,
    listChatFolderBindingReceipts: listChatFolderBindingReceipts,
    ingestChatFolderBindingRequests: ingestChatFolderBindingRequests,
    applyChatFolderBindingRequest: applyChatFolderBindingRequest,
    getReview: getReview,
    getByDedupeKey: getByDedupeKey,
    listReviews: listReviews,
    countByClassification: countByClassification,
    countByStatus: countByStatus,
    markIgnored: markIgnored,
    markRejected: markRejected,
    markAcceptedLater: markAcceptedLater,
    markResolved: markResolved,
    ingestBundleTombstones: ingestBundleTombstones,
    previewApply: previewApply,
    applyReview: applyReview,
    proveApplyTransaction: proveApplyTransaction,
    diagnose: diagnose,
    diagnoseCascadeGroups: diagnoseCascadeGroups,
    diagnoseLifecycle: diagnoseLifecycle,
    previewCleanupSynthetic: previewCleanupSynthetic,
    previewDuplicateSightings: previewDuplicateSightings,
    validateReview: validateReview,
    buildDedupeKey: buildDedupeKey,
    constants: Object.freeze({
      schema: REVIEW_SCHEMA,
      folderDeleteRequestSchema: FOLDER_DELETE_REQUEST_SCHEMA,
      folderDeleteReceiptSchema: FOLDER_DELETE_RECEIPT_SCHEMA,
      folderRestoreRequestSchema: FOLDER_RESTORE_REQUEST_SCHEMA,
      folderRestoreReceiptSchema: FOLDER_RESTORE_RECEIPT_SCHEMA,
      chatFolderBindingRequestSchema: CHAT_FOLDER_BINDING_REQUEST_SCHEMA,
      chatFolderBindingReceiptSchema: CHAT_FOLDER_BINDING_RECEIPT_SCHEMA,
      diagnosticSchema: DIAGNOSTIC_SCHEMA,
      cascadeDiagnosticSchema: CASCADE_DIAGNOSTIC_SCHEMA,
      lifecycleDiagnosticSchema: LIFECYCLE_DIAGNOSTIC_SCHEMA,
      duplicateSightingPreviewSchema: DUPLICATE_SIGHTING_PREVIEW_SCHEMA,
      syntheticCleanupPreviewSchema: SYNTHETIC_CLEANUP_PREVIEW_SCHEMA,
      ingestSchema: INGEST_SCHEMA,
      previewSchema: PREVIEW_SCHEMA,
      decisionSchema: DECISION_SCHEMA,
      applyDryRunSchema: APPLY_DRY_RUN_SCHEMA,
      applyResultSchema: APPLY_RESULT_SCHEMA,
      tombstoneSchema: TOMBSTONE_SCHEMA,
      realApplyDevGate: REAL_APPLY_DEV_GATE,
      table: TABLE,
      classifications: Object.freeze(Object.keys(CLASSIFICATIONS).slice()),
      statuses: Object.freeze(Object.keys(STATUSES).slice()),
    }),
  };
  store.__registerEntity('tombstoneReviews', api);

  H2O.Studio.maintenance = H2O.Studio.maintenance || {};
  H2O.Studio.maintenance.cleanupSynthetic = cleanupSynthetic;
  H2O.Studio.maintenance.__syntheticCleanupInstalled = true;

  global.setTimeout(function () {
    init().catch(function (e) { recordError('autoInit', e); });
  }, 0);
})(typeof window !== 'undefined' ? window : globalThis);
