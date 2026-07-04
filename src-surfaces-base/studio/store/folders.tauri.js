/* H2O Studio Store — Folders Entity (Desktop / Tauri SQLite)
 *
 * M2a-3c — third table-aware entity store. Backs the SQLite `folders` +
 * `folder_bindings` tables defined in apps/studio/desktop/src-tauri/src/lib.rs
 * (Migration v3).
 *
 * Desktop-only: gates on Tauri detection at load. On MV3 / web this file is
 * a silent no-op and registers nothing.
 *
 * Source-of-truth: SQLite `folders` + `folder_bindings` tables on Desktop V1.
 * V1 enforces one-folder-per-chat via folder_bindings.PRIMARY KEY (chat_id).
 * Save-to-Folder ingestion (M2b) and Library UI wiring are deferred — this
 * commit is data-layer only.
 *
 * Contract: matches surfaces/studio/store/chats.tauri.js's standard surface
 *   plus folder-specific methods (get / create / upsert / patch / remove
 *   / softDeleteEmptyFolder / restoreTombstonedFolder / bindChat /
 *   unbindChat / listChats / listForChat / count).
 *
 * Persistence: writes hit SQLite immediately. tauri-plugin-sql v2 has no
 * exposed transaction wrapper, so multi-statement writes are sequential.
 * Phase 4A routes public remove/delete through softDeleteEmptyFolder().
 * bindChat uses INSERT OR REPLACE so the existing single-folder-per-chat
 * binding is replaced atomically.
 *
 * Subscribers are in-process only — single-window V1.
 *
 * listChats() delegates to H2O.Studio.store.chats.get() for full row
 * hydration so the chat-row projection isn't duplicated. Both stores are
 * registered in the same Desktop bundle; defensive fallback returns an
 * empty array if store.chats happens to be unavailable.
 *
 * Contracts: surfaces/studio/store/README.md
 *            surfaces/studio/STUDIO_STORAGE_CONTRACT.md
 *            surfaces/studio/STUDIO_PLATFORM_ADAPTER_GUIDE.md
 */
(function (global) {
  'use strict';

  /* ── Tauri detection — bail otherwise ─────────────────────────────── */
  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* swallow */ }
    return false;
  }
  if (!detectTauri()) return;

  /* ── Hook into store namespace ────────────────────────────────────── */
  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  var store = H2O.Studio.store;
  if (!store || typeof store.__registerEntity !== 'function') {
    try { console.warn('[H2O.Studio.store.folders] H2O.Studio.store not present; entity not registered'); }
    catch (_) { /* ignore */ }
    return;
  }
  if (store.folders && store.folders.__installed) return;

  /* ── Constants ────────────────────────────────────────────────────── */
  var DB_URL = 'sqlite:studio-v1.db';
  var SCHEMA_VERSION = 1;
  var READY_POLL_INTERVAL_MS = 100;
  var READY_POLL_MAX_TRIES = 100;
  var F5D_FOLDER_BINDING_TOMBSTONES = true;
  var F5D_FOLDER_REMOVE_TOMBSTONES = true;
  var F5D_FOLDER_BINDING_RECORD_ID_FORMAT = 'folderBinding:${encodeURIComponent(chatId)}:${encodeURIComponent(folderId)}';
  var F16_FOLDER_LEGACY_FALLBACK_IDENTITY = 'f16.folder-legacy-fallback';
  var F16_FOLDER_LEGACY_FALLBACK_VERSION = '0.1.0-f16.4.b';
  var F16_FOLDER_BINDINGS_TRIGGER_PROTECTION_GUARDED = true;
  var F16_FOLDER_BINDINGS_TRIGGER_PROTECTION_DEFAULT_ENABLED = false;
  var F15_SETTLED_BINDING_MATERIALIZATION_LEDGER_KEY = 'h2o:studio:folder-bindings:f15-settled-materialization:v1';
  var F15_SETTLED_BINDING_MATERIALIZATION_LEDGER_SCHEMA = 'h2o.studio.folder-sync.f15-settled-binding-materialization-ledger.v1';
  var F15_SETTLED_BINDING_MATERIALIZATION_RECORD_SCHEMA = 'h2o.studio.folder-sync.f15-settled-binding-materialization-record.v1';
  var F15_SETTLED_BINDING_RESTART_CONVERGENCE_SCHEMA = 'h2o.studio.folder-sync.f15-settled-binding-restart-convergence.v1';
  var F15_SETTLED_BINDING_MATERIALIZATION_LEDGER_LIMIT = 200;
  var PHASE4A_FOLDER_SOFT_DELETE_ENABLED = true;
  var PHASE4A_FOLDER_SOFT_DELETE_PHASE = 'desktop-local-soft-delete';
  var PHASE4D3_RECENTLY_DELETED_SCHEMA = 'h2o.studio.folder-recently-deleted-diagnostics.v1';
  var PHASE4D3_RETENTION_DAYS = 30;
  var PHASE6A_PURGE_PREVIEW_SCHEMA = 'h2o.studio.folder-purge-preview.v1';
  var PHASE6A_PURGE_RESULT_SCHEMA = 'h2o.studio.folder-purge-result.v1';
  var PHASE6A_RESTORED_HISTORY_CLEAR_PREVIEW_SCHEMA = 'h2o.studio.folder-restored-history-clear-preview.v1';
  var PHASE6A_RESTORED_HISTORY_CLEAR_RESULT_SCHEMA = 'h2o.studio.folder-restored-history-clear-result.v1';
  var PHASE6A_REPAIR_PREVIEW_SCHEMA = 'h2o.studio.folder-purge-resurrection-repair-preview.v1';
  var PHASE6A_REPAIR_RESULT_SCHEMA = 'h2o.studio.folder-purge-resurrection-repair-result.v1';
  var PHASE6A_PURGE_TOKEN_TTL_MS = 5 * 60 * 1000;
  var PHASE6A_PERMANENT_PURGE_META_KEY = 'phase6aPermanentlyPurged';
  var PHASE6A_PERMANENT_PURGE_SOURCE = 'desktop-recently-deleted-operator-purge';
  var PHASE6A_REPAIR_SOURCE = 'desktop-recently-deleted-resurrection-repair';
  var FOLDER_STATE_DATA_KEY = 'h2o:prm:cgx:fldrs:state:data:v1';
  var F11_RENDER_MIRROR_REBUILD_GATE = 'folder-sync-f11-render-only-mirror-rebuild';
  var F11_RENDER_MIRROR_REBUILD_SCHEMA = 'h2o.studio.folder-sync.f11-render-only-mirror-rebuild.v1';
  var F11_RENDER_MIRROR_REBUILD_ALLOWED_CLASSES = {
    'missing-mirror-folder': true,
    'field-mismatch:color': true,
    'field-mismatch:sortOrder': true,
  };
  var RESERVED_FOLDER_NAME_KEYS = {
    all: true,
    archive: true,
    archived: true,
    link: true,
    linked: true,
    links: true,
    recent: true,
    recents: true,
    saved: true,
    unfiled: true,
  };

  /* ── State ────────────────────────────────────────────────────────── */
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
    lastF15SettledBindingRestartConvergence: null,
    f15RestartConvergenceReadyPromise: null,
    phase4a: {
      installed: true,
      phase: PHASE4A_FOLDER_SOFT_DELETE_PHASE,
      lastOperationAt: null,
      lastOperation: '',
      lastStatus: '',
      lastFolderId: '',
      lastTombstoneId: '',
      activeTombstoneCount: 0,
      restoreAvailableCount: 0,
      affectedChatCount: 0,
      lastAffectedChatCount: 0,
      lastBindingRestoreAttemptedCount: 0,
      lastBindingRestoredCount: 0,
      lastBindingSkippedCount: 0,
      lastRestoreWarnings: [],
      purgeBlocked: true,
    },
    phase6a: {
      lastPreview: null,
      lastCommit: null,
      lastRestoredHistoryClearPreview: null,
      lastRestoredHistoryClearCommit: null,
      lastRepairPreview: null,
      lastRepairCommit: null,
    },
  };

  function recordError(op, e) {
    try {
      state.errors.push({ t: Date.now(), op: String(op), e: String((e && e.stack) || e || '') });
      if (state.errors.length > state.errMax) {
        state.errors.splice(0, state.errors.length - state.errMax);
      }
    } catch (_) { /* swallow */ }
  }
  function recordWarning(msg) {
    try {
      state.warnings.push({ t: Date.now(), msg: String(msg) });
      if (state.warnings.length > state.warnMax) {
        state.warnings.splice(0, state.warnings.length - state.warnMax);
      }
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

  /* ── Tauri invoke (V2) ────────────────────────────────────────────── */
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

  function chromeStorageLocal() {
    try {
      var api = global.chrome;
      return api && api.storage && api.storage.local ? api.storage.local : null;
    } catch (_) { return null; }
  }

  function chromeStorageGet(key) {
    return new Promise(function (resolve, reject) {
      var local = chromeStorageLocal();
      if (!local || typeof local.get !== 'function') {
        resolve(undefined);
        return;
      }
      try {
        local.get([key], function (items) {
          var api = global.chrome;
          var runtimeError = api && api.runtime && api.runtime.lastError;
          if (runtimeError) {
            reject(new Error(runtimeError.message || String(runtimeError)));
            return;
          }
          resolve(items ? items[key] : undefined);
        });
      } catch (e) { reject(e); }
    });
  }

  function chromeStorageSet(items) {
    return new Promise(function (resolve, reject) {
      var local = chromeStorageLocal();
      if (!local || typeof local.set !== 'function') {
        resolve(false);
        return;
      }
      try {
        local.set(items, function () {
          var api = global.chrome;
          var runtimeError = api && api.runtime && api.runtime.lastError;
          if (runtimeError) {
            reject(new Error(runtimeError.message || String(runtimeError)));
            return;
          }
          resolve(true);
        });
      } catch (e) { reject(e); }
    });
  }

  function executeFolderBindingsLegacyFallback(query, values, reason) {
    var sync = getSync();
    var statement = { query: query, values: values || [] };
    var operationReason = String(reason || 'folder-bindings-legacy-fallback').trim();
    if (sync && typeof sync.executeAuthorizedSqlite === 'function') {
      return sync.executeAuthorizedSqlite({
        identity: F16_FOLDER_LEGACY_FALLBACK_IDENTITY,
        folderLegacyFallbackEnabled: true,
        reason: 'f16.folder-legacy-fallback:' + operationReason,
        statements: [statement],
      }).then(function (result) {
        api.__lastFolderBindingsLegacyFallbackIdentityResult = result || null;
        if (result && result.ok === true && result.executed === true) return result;
        recordWarning('F16.4 folder_bindings scoped fallback identity failed: ' +
          JSON.stringify((result && result.blockers) || ['unknown']));
        if (!folderBindingsTriggerProtectionActive()) {
          return sqlExecute(query, values).then(function (fallbackResult) {
            api.__lastFolderBindingsLegacyFallbackIdentityResult = Object.assign({}, result || {}, {
              ok: true,
              executed: true,
              identity: F16_FOLDER_LEGACY_FALLBACK_IDENTITY,
              triggerProtectionInactiveRawFallbackUsed: true,
              reason: operationReason,
            });
            return fallbackResult;
          });
        }
        return Promise.reject(new Error('folder_bindings scoped fallback identity failed'));
      });
    }
    recordWarning('F16.4 folder_bindings scoped fallback identity facade unavailable; trigger protection inactive raw fallback used');
    return sqlExecute(query, values).then(function (fallbackResult) {
      api.__lastFolderBindingsLegacyFallbackIdentityResult = {
        ok: true,
        executed: true,
        identity: F16_FOLDER_LEGACY_FALLBACK_IDENTITY,
        triggerProtectionInactiveRawFallbackUsed: true,
        reason: operationReason,
        blockers: ['sqlite-writer-identity-facade-unavailable'],
        warnings: ['folder-bindings-trigger-protection-inactive'],
      };
      return fallbackResult;
    });
  }

  /* tauri-plugin-sql v2 returns execute as JSON array [rowsAffected, lastInsertId]. */
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
          try { s = platform.__sqliteStatus(); } catch (_) { s = null; }
          if (s && s.backend === 'sqlite' && s.ready === true) { resolve(true); return; }
        }
        tries += 1;
        if (tries >= READY_POLL_MAX_TRIES) { resolve(false); return; }
        global.setTimeout(check, READY_POLL_INTERVAL_MS);
      }
      check();
    });
  }

  /* ── Row projector ────────────────────────────────────────────────── */
  /* Schema source: src-tauri/src/lib.rs Migration v3. Keep in sync. */
  var COL_TO_FIELD = {
    id:         'folderId',
    name:       'name',
    parent_id:  'parentId',
    color:      'color',
    sort_order: 'sortOrder',
    source:     'source',
    created_at: 'createdAt',
    updated_at: 'updatedAt',
    meta_json:  'meta',
  };
  var FIELD_TO_COL = (function () {
    var out = Object.create(null);
    Object.keys(COL_TO_FIELD).forEach(function (col) { out[COL_TO_FIELD[col]] = col; });
    /* Accept `id` as an alias for `folderId` on input patches. */
    out.id = 'id';
    return out;
  })();
  /* No bool columns on folders. */
  var META_COL = 'meta_json';

  function parseMeta(raw) {
    if (raw == null) return {};
    if (typeof raw === 'object') return Array.isArray(raw) ? {} : raw;
    if (typeof raw !== 'string') return {};
    try {
      var v = JSON.parse(raw);
      return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    } catch (e) {
      recordWarning('meta_json parse failed: ' + ((e && e.message) || e));
      return {};
    }
  }

  function rowToJs(sqlRow) {
    if (!sqlRow || typeof sqlRow !== 'object') return null;
    var js = {};
    Object.keys(COL_TO_FIELD).forEach(function (col) {
      var field = COL_TO_FIELD[col];
      var val = sqlRow[col];
      if (col === META_COL) {
        js.meta = parseMeta(val);
      } else {
        js[field] = (val === null || typeof val === 'undefined') ? null : val;
      }
    });
    return js;
  }

  function getFolderId(input) {
    if (input == null) return null;
    if (typeof input === 'string') return input.trim() || null;
    if (typeof input === 'object') {
      var v = (typeof input.folderId === 'string' && input.folderId)
        || (typeof input.id === 'string' && input.id)
        || null;
      return v ? v.trim() || null : null;
    }
    return null;
  }

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function safeMeta(value) {
    return (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
  }

  function normalizeFolderName(value) {
    return cleanString(value).toLowerCase().replace(/\s+/g, ' ');
  }

  function folderTombstoneRecordId(folderId) {
    return 'folder:' + encodeURIComponent(cleanString(folderId));
  }

  function folderIdFromTombstoneRecordId(recordId) {
    var raw = cleanString(recordId);
    if (raw.indexOf('folder:') !== 0) return '';
    var encoded = raw.slice('folder:'.length);
    try { return decodeURIComponent(encoded); }
    catch (_) { return encoded; }
  }

  function tombstoneMeta(tombstone) {
    if (!tombstone || typeof tombstone !== 'object') return {};
    return parseMeta(Object.prototype.hasOwnProperty.call(tombstone, 'meta')
      ? tombstone.meta
      : (Object.prototype.hasOwnProperty.call(tombstone, 'metaJson') ? tombstone.metaJson : tombstone.meta_json));
  }

  function folderIdFromTombstone(tombstone) {
    var meta = tombstoneMeta(tombstone);
    var recoverySnapshot = safeMeta(meta.recoverySnapshot);
    var folder = safeMeta(recoverySnapshot.folder);
    return cleanString(folder.id || folder.folderId) || folderIdFromTombstoneRecordId(tombstone && tombstone.recordId);
  }

  function addBlocker(list, code) {
    var clean = cleanString(code);
    if (clean && list.indexOf(clean) === -1) list.push(clean);
  }

  function setPhase4aState(operation, status, folderId, tombstoneId, delta) {
    state.phase4a.lastOperationAt = Date.now();
    state.phase4a.lastOperation = cleanString(operation);
    state.phase4a.lastStatus = cleanString(status);
    state.phase4a.lastFolderId = cleanString(folderId);
    state.phase4a.lastTombstoneId = cleanString(tombstoneId);
    if (typeof delta === 'number' && Number.isFinite(delta) && delta !== 0) {
      state.phase4a.activeTombstoneCount = Math.max(0, Number(state.phase4a.activeTombstoneCount || 0) + delta);
      state.phase4a.restoreAvailableCount = Math.max(0, Number(state.phase4a.restoreAvailableCount || 0) + delta);
    }
  }

  function setPhase4bBindingState(input) {
    var data = input && typeof input === 'object' ? input : {};
    if (Object.prototype.hasOwnProperty.call(data, 'affectedChatCount')) {
      state.phase4a.lastAffectedChatCount = Math.max(0, Number(data.affectedChatCount) || 0);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'activeAffectedChatCountDelta')) {
      state.phase4a.affectedChatCount = Math.max(
        0,
        Number(state.phase4a.affectedChatCount || 0) + (Number(data.activeAffectedChatCountDelta) || 0)
      );
    }
    if (Object.prototype.hasOwnProperty.call(data, 'bindingRestoreAttemptedCount')) {
      state.phase4a.lastBindingRestoreAttemptedCount = Math.max(0, Number(data.bindingRestoreAttemptedCount) || 0);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'bindingRestoredCount')) {
      state.phase4a.lastBindingRestoredCount = Math.max(0, Number(data.bindingRestoredCount) || 0);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'bindingSkippedCount')) {
      state.phase4a.lastBindingSkippedCount = Math.max(0, Number(data.bindingSkippedCount) || 0);
    }
    if (Array.isArray(data.restoreWarnings)) {
      state.phase4a.lastRestoreWarnings = data.restoreWarnings.slice(0, 20).map(function (warning) {
        return typeof warning === 'string' ? warning : cleanString(warning && warning.code);
      }).filter(Boolean);
    }
  }

  function lifecycleSourceTokens(folder) {
    var meta = safeMeta(folder && folder.meta);
    return [
      folder && folder.folderId,
      folder && folder.id,
      folder && folder.source,
      folder && folder.sourceKind,
      folder && folder.kind,
      meta.source,
      meta.sourceKind,
      meta.kind,
      meta.reviewBucket,
      meta.lifecycleState,
    ].map(function (value) { return cleanString(value).toLowerCase(); }).filter(Boolean);
  }

  function folderPhase4aBlockers(folder, folderId) {
    var blockers = [];
    var id = cleanString(folderId || getFolderId(folder));
    var meta = safeMeta(folder && folder.meta);
    var nameKey = normalizeFolderName((folder && folder.name) || meta.name || id);
    var tokens = lifecycleSourceTokens(folder);
    if (!id) addBlocker(blockers, 'folder-identity-missing');
    if (id === 'unfiled' || nameKey === 'unfiled') addBlocker(blockers, 'unfiled-folder');
    if (RESERVED_FOLDER_NAME_KEYS[nameKey]) addBlocker(blockers, 'system-folder');
    if (folder && (folder.protectedCanonicalFallback === true || folder.protected === true ||
        folder.isProtected === true || meta.protectedCanonicalFallback === true ||
        meta.protected === true || meta.isProtected === true)) {
      addBlocker(blockers, 'protected-folder');
    }
    if (tokens.some(function (token) {
      return token.indexOf('local-review') !== -1 ||
        token.indexOf('cleanup-review') !== -1 ||
        token.indexOf('review-required') !== -1;
    }) || /^(__|local-review[:_-])/i.test(id)) {
      addBlocker(blockers, 'local-review-folder-not-editable');
    }
    return blockers;
  }

  function countKnownRowsForFolder(folderId) {
    try {
      var index = H2O && H2O.LibraryIndex;
      var rows = index && typeof index.getAll === 'function' ? index.getAll() : [];
      return (Array.isArray(rows) ? rows : []).filter(function (row) {
        return cleanString(row && (row.folderId || row.folder)) === folderId;
      }).length;
    } catch (_) {
      return 0;
    }
  }

  function countBindingRows(folderId) {
    return sqlSelect('SELECT COUNT(*) AS n FROM folder_bindings WHERE folder_id = ?', [folderId])
      .then(function (rows) {
        return Array.isArray(rows) && rows.length ? Number(rows[0].n) || 0 : 0;
      });
  }

  function getTombstoneStore() {
    try { return H2O && H2O.Studio && H2O.Studio.store && H2O.Studio.store.tombstones; }
    catch (_) { return null; }
  }

  function getActiveFolderTombstone(folderId) {
    var tombstones = getTombstoneStore();
    if (!tombstones || typeof tombstones.getTombstone !== 'function') return Promise.resolve(null);
    return tombstones.getTombstone('folder', folderTombstoneRecordId(folderId));
  }

  function removeFolderFromStateMirror(folderId, tombstoneId) {
    var fid = cleanString(folderId);
    if (!fid) return Promise.resolve({ ok: false, status: 'folder-identity-missing' });
    return chromeStorageGet(FOLDER_STATE_DATA_KEY).then(function (raw) {
      var current = safeMeta(raw);
      var folders = Array.isArray(current.folders) ? current.folders.slice() : [];
      var items = safeMeta(current.items);
      var before = folders.length;
      folders = folders.filter(function (folder) { return getFolderId(folder) !== fid; });
      var removedItems = Array.isArray(items[fid]) ? items[fid].length : 0;
      delete items[fid];
      var updatedAt = new Date().toISOString();
      var nextState = Object.assign({}, current, {
        schemaVersion: Number(current.schemaVersion || current.version || 1) || 1,
        source: cleanString(current.source || current.exportedFrom || 'stored-folder-state') || 'stored-folder-state',
        updatedAt: updatedAt,
        folders: folders,
        items: items,
        phase4aLastLocalSoftDelete: {
          folderId: fid,
          tombstoneId: cleanString(tombstoneId),
          at: updatedAt,
          syncPropagation: 'deferred',
        },
      });
      return chromeStorageSet({ [FOLDER_STATE_DATA_KEY]: nextState }).then(function (written) {
        return {
          ok: written !== false,
          status: written === false ? 'storage-unavailable' : 'removed',
          removedFolderRows: before - folders.length,
          removedItemCount: removedItems,
        };
      });
    }).catch(function (e) {
      recordWarning('Phase4A folder-state mirror soft-delete failed: ' + ((e && e.message) || e));
      return { ok: false, status: 'error', error: String((e && e.message) || e) };
    });
  }

  function restoreFolderToStateMirror(snapshot) {
    var recovery = safeMeta(snapshot);
    var folder = safeMeta(recovery.folder);
    var folderId = cleanString(folder.id || folder.folderId);
    if (!folderId) return Promise.resolve({ ok: false, status: 'folder-identity-missing' });
    return chromeStorageGet(FOLDER_STATE_DATA_KEY).then(function (raw) {
      var current = safeMeta(raw);
      var folders = Array.isArray(current.folders) ? current.folders.slice() : [];
      var items = safeMeta(current.items);
      var index = folders.findIndex(function (row) { return getFolderId(row) === folderId; });
      var updatedAt = new Date().toISOString();
      var name = cleanString(folder.name || folder.title || folderId);
      var color = cleanString(folder.iconColor || folder.color || '');
      var nextRow = Object.assign({}, index >= 0 ? folders[index] : {}, {
        id: folderId,
        folderId: folderId,
        name: name,
        title: name,
        normalizedName: normalizeFolderName(folder.normalizedName || name),
        source: cleanString(folder.source || 'desktop-sqlite'),
        stateSource: 'stored-folder-state',
        color: color,
        iconColor: color,
        updatedAt: updatedAt,
        sortOrder: Number(folder.sortOrder) || 0,
        meta: Object.assign({}, safeMeta(folder.meta), {
          updatedAt: updatedAt,
          materializedUserFolder: true,
          trustedFolderDisplay: true,
          shownInNormalMode: true,
          phase4aRestoreSource: 'recoverySnapshot',
        }),
        userCreated: true,
        materializedUserFolder: true,
        trustedFolderDisplay: true,
        shownInNormalMode: true,
      });
      if (cleanString(folder.parentId)) nextRow.parentId = cleanString(folder.parentId);
      if (cleanString(folder.icon)) nextRow.icon = cleanString(folder.icon);
      if (index >= 0) folders[index] = nextRow;
      else folders.push(nextRow);
      if (!Array.isArray(items[folderId])) items[folderId] = [];
      var nextState = Object.assign({}, current, {
        schemaVersion: Number(current.schemaVersion || current.version || 1) || 1,
        source: cleanString(current.source || current.exportedFrom || 'stored-folder-state') || 'stored-folder-state',
        updatedAt: updatedAt,
        folders: folders,
        items: items,
        phase4aLastLocalRestore: {
          folderId: folderId,
          at: updatedAt,
          syncPropagation: 'deferred',
        },
      });
      return chromeStorageSet({ [FOLDER_STATE_DATA_KEY]: nextState }).then(function (written) {
        return { ok: written !== false, status: index >= 0 ? 'updated' : 'inserted', folderCount: folders.length };
      });
    }).catch(function (e) {
      recordWarning('Phase4A folder-state mirror restore failed: ' + ((e && e.message) || e));
      return { ok: false, status: 'error', error: String((e && e.message) || e) };
    });
  }

  function f11CleanAllowedRenderMirrorClasses(classes) {
    var input = Array.isArray(classes) && classes.length
      ? classes
      : Object.keys(F11_RENDER_MIRROR_REBUILD_ALLOWED_CLASSES);
    var allowed = [];
    var blocked = [];
    input.forEach(function (entry) {
      var code = cleanString(entry);
      if (!code) return;
      if (F11_RENDER_MIRROR_REBUILD_ALLOWED_CLASSES[code]) {
        if (allowed.indexOf(code) === -1) allowed.push(code);
        return;
      }
      if (blocked.indexOf(code) === -1) blocked.push(code);
    });
    return { allowed: allowed, blocked: blocked };
  }

  function f11BuildRenderMirrorFolderRow(folder, existingRow, updatedAt) {
    var canonical = safeMeta(folder);
    var prior = safeMeta(existingRow);
    var folderId = getFolderId(canonical);
    var name = cleanString(canonical.name || canonical.title || prior.name || prior.title || folderId);
    var color = cleanString(canonical.color || canonical.iconColor || '');
    var next = Object.assign({}, prior, {
      id: folderId,
      folderId: folderId,
      name: name,
      title: name,
      normalizedName: normalizeFolderName(name),
      source: cleanString(prior.source || 'desktop-sqlite-render-mirror-rebuild') || 'desktop-sqlite-render-mirror-rebuild',
      stateSource: 'desktop-sqlite-render-mirror-rebuild',
      color: color,
      iconColor: color,
      updatedAt: updatedAt,
      meta: Object.assign({}, safeMeta(prior.meta), {
        materializedUserFolder: true,
        trustedFolderDisplay: true,
        shownInNormalMode: true,
        f11RenderOnlyMirrorRebuild: true,
      }),
      userCreated: true,
      materializedUserFolder: true,
      trustedFolderDisplay: true,
      shownInNormalMode: true,
    });
    if (cleanString(canonical.parentId || prior.parentId)) next.parentId = cleanString(canonical.parentId || prior.parentId);
    if (cleanString(canonical.icon || prior.icon)) next.icon = cleanString(canonical.icon || prior.icon);
    var sortOrder = Number(canonical.sortOrder != null ? canonical.sortOrder : canonical.sort_order);
    if (Number.isFinite(sortOrder)) {
      next.sortOrder = sortOrder;
      next.sort_order = sortOrder;
    } else {
      delete next.sortOrder;
      delete next.sort_order;
    }
    return next;
  }

  async function f11RedactedFolderToken(folderId) {
    var digest = await sha256Hex({ phase: 'F11', subject: 'folder', folderId: cleanString(folderId) });
    return digest ? ('sha256:' + digest.slice(0, 16)) : 'sha256:unavailable';
  }

  async function f11RedactedRows(rows) {
    var out = [];
    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i] || {};
      out.push({
        class: cleanString(row.class),
        folderToken: await f11RedactedFolderToken(row.folderId),
      });
    }
    return out;
  }

  async function rebuildRenderMirrorFromSqlite(options) {
    var opts = safeMeta(options);
    var classSelection = f11CleanAllowedRenderMirrorClasses(opts.classes || opts.driftClasses);
    var result = {
      schema: F11_RENDER_MIRROR_REBUILD_SCHEMA,
      ok: false,
      status: '',
      gate: F11_RENDER_MIRROR_REBUILD_GATE,
      gateSatisfied: cleanString(opts.gate) === F11_RENDER_MIRROR_REBUILD_GATE,
      applyRequested: opts.apply === true,
      dryRun: opts.apply !== true,
      source: 'desktop-sqlite-folders',
      target: 'FOLDER_STATE_DATA_KEY',
      targetKey: FOLDER_STATE_DATA_KEY,
      renderMirrorOnly: true,
      desktopSQLiteCanonical: true,
      allowedClasses: classSelection.allowed.slice(),
      blockedClasses: classSelection.blocked.concat(['binding-mismatch']),
      // F28 S10: this render-only mirror rebuild does NOT repair binding-mismatch (noBindingRepair stays true and it
      // remains a blocked render-mirror class). binding-mismatch is instead ROUTED to the reviewed, F15-settled
      // request -> apply -> receipt binding repair path (already live-proven). This declares the routing explicitly so
      // binding-mismatch is not silently dropped; it does not turn the render mirror into a binding repair writer.
      reviewedRepairPathClasses: ['binding-mismatch'],
      bindingMismatchRoutedToReviewedRepairPath: true,
      reviewedRepairRequestSchema: 'h2o.studio.chat-folder-binding-request.v1',
      reviewedRepairApplyGate: 'folder-sync-chat-folder-binding-repair-apply',
      handledClasses: [],
      rebuiltMissingMirrorFolderCount: 0,
      rebuiltColorMismatchCount: 0,
      rebuiltSortOrderMismatchCount: 0,
      skippedSortOrderRebuildCount: 0,
      skippedBindingRepairCount: 0,
      sortOrderMirrorProjectionOnly: true,
      noCanonicalSortOrderWrite: true,
      mirrorWriteAttempted: false,
      mirrorWriteOk: false,
      noSQLiteWrite: true,
      noBindingWrite: true,
      noTombstoneWrite: true,
      noFolderDelete: true,
      noFolderPurge: true,
      noSortOrderOverwrite: classSelection.allowed.indexOf('field-mismatch:sortOrder') === -1,
      noBindingRepair: true,
      noChromeCanonicalMutation: true,
      noTransportWrite: true,
      noWebdavWrite: true,
      noChatSavingCas: true,
      productSyncReady: false,
      privacy: { redacted: true, hashOnly: true },
      diagnostics: [],
    };
    if (!result.gateSatisfied) {
      result.status = 'blocked-dev-diagnostic-gate-required';
      result.blockers = ['dev-diagnostic-gate-required'];
      return result;
    }
    if (!classSelection.allowed.length) {
      result.status = 'blocked-no-approved-render-only-classes';
      result.blockers = ['no-approved-render-only-classes'];
      return result;
    }
    var canonicalFolders = await listFolders();
    var rawMirror = await chromeStorageGet(FOLDER_STATE_DATA_KEY);
    var current = safeMeta(rawMirror);
    var mirrorFolders = Array.isArray(current.folders) ? current.folders.slice() : [];
    var items = safeMeta(current.items);
    var updatedAt = new Date().toISOString();
    var byId = Object.create(null);
    mirrorFolders.forEach(function (row, index) {
      var id = getFolderId(row);
      if (id && !byId[id]) byId[id] = { row: row, index: index };
    });
    var diagnostics = [];
    canonicalFolders.forEach(function (folder) {
      var folderId = getFolderId(folder);
      if (!folderId) return;
      var found = byId[folderId];
      if (!found && classSelection.allowed.indexOf('missing-mirror-folder') !== -1) {
        var inserted = f11BuildRenderMirrorFolderRow(folder, null, updatedAt);
        mirrorFolders.push(inserted);
        if (!Array.isArray(items[folderId])) items[folderId] = [];
        diagnostics.push({ class: 'missing-mirror-folder', folderId: folderId });
        result.rebuiltMissingMirrorFolderCount += 1;
        if (result.handledClasses.indexOf('missing-mirror-folder') === -1) result.handledClasses.push('missing-mirror-folder');
        return;
      }
      if (!found || classSelection.allowed.indexOf('field-mismatch:color') === -1) return;
      var canonicalColor = cleanString(folder.color || folder.iconColor || '');
      var mirrorColor = cleanString(found.row.color || found.row.iconColor || '');
      if (canonicalColor !== mirrorColor) {
        var nextRow = Object.assign({}, found.row, {
          color: canonicalColor,
          iconColor: canonicalColor,
          updatedAt: updatedAt,
        });
        mirrorFolders[found.index] = nextRow;
        diagnostics.push({ class: 'field-mismatch:color', folderId: folderId });
        result.rebuiltColorMismatchCount += 1;
        if (result.handledClasses.indexOf('field-mismatch:color') === -1) result.handledClasses.push('field-mismatch:color');
      }
      if (classSelection.allowed.indexOf('field-mismatch:sortOrder') !== -1) {
        var canonicalSortOrder = Number(folder.sortOrder != null ? folder.sortOrder : folder.sort_order);
        var mirrorSortOrder = Number(found.row.sortOrder != null ? found.row.sortOrder : found.row.sort_order);
        if (Number.isFinite(canonicalSortOrder) && mirrorSortOrder !== canonicalSortOrder) {
          var nextSortRow = Object.assign({}, mirrorFolders[found.index], {
            sortOrder: canonicalSortOrder,
            sort_order: canonicalSortOrder,
            updatedAt: updatedAt,
          });
          mirrorFolders[found.index] = nextSortRow;
          diagnostics.push({ class: 'field-mismatch:sortOrder', folderId: folderId });
          result.rebuiltSortOrderMismatchCount += 1;
          if (result.handledClasses.indexOf('field-mismatch:sortOrder') === -1) result.handledClasses.push('field-mismatch:sortOrder');
        }
      }
    });
    result.diagnosticCount = diagnostics.length;
    result.diagnostics = await f11RedactedRows(diagnostics);
    result.skippedSortOrderRebuildCount = classSelection.blocked.indexOf('field-mismatch:sortOrder') !== -1 ? 1 : 0;
    result.skippedBindingRepairCount = classSelection.blocked.indexOf('binding-mismatch') !== -1 ? 1 : 0;
    if (!diagnostics.length) {
      result.ok = true;
      result.status = 'no-op-render-mirror-already-converged';
      return result;
    }
    if (opts.apply !== true) {
      result.ok = true;
      result.status = 'dry-run-render-mirror-rebuild-ready';
      return result;
    }
    var nextState = Object.assign({}, current, {
      schemaVersion: Number(current.schemaVersion || current.version || 1) || 1,
      source: cleanString(current.source || current.exportedFrom || 'stored-folder-state') || 'stored-folder-state',
      updatedAt: updatedAt,
      folders: mirrorFolders,
      items: items,
      f11LastRenderOnlyMirrorRebuild: {
        schema: F11_RENDER_MIRROR_REBUILD_SCHEMA,
        at: updatedAt,
        classes: result.handledClasses.slice(),
        renderMirrorOnly: true,
        noSQLiteWrite: true,
        noBindingWrite: true,
        noTombstoneWrite: true,
        noSortOrderOverwrite: true,
        noBindingRepair: true,
        productSyncReady: false,
      },
    });
    result.mirrorWriteAttempted = true;
    result.mirrorWriteOk = await chromeStorageSet({ [FOLDER_STATE_DATA_KEY]: nextState }) !== false;
    result.ok = result.mirrorWriteOk;
    result.status = result.mirrorWriteOk ? 'render-only-mirror-rebuilt' : 'mirror-storage-unavailable';
    return result;
  }

  function buildFolderBindingTombstone(folderId, chatId, opts) {
    opts = opts || {};
    var fid = String(folderId || '').trim();
    var cid = String(chatId || '').trim();
    var meta = Object.assign({
      chatId: cid,
      folderId: fid,
      recordIdFormat: F5D_FOLDER_BINDING_RECORD_ID_FORMAT,
      source: 'store.folders.unbindChat',
    }, opts.meta || {});
    return {
      recordKind: 'folderBinding',
      recordId: 'folderBinding:' + encodeURIComponent(cid) + ':' + encodeURIComponent(fid),
      deleteReason: String(opts.deleteReason || '').trim() || 'user-unbind',
      cascadeFrom: String(opts.cascadeFrom || '').trim() || undefined,
      meta: meta,
    };
  }

  function buildFolderTombstone(folderId, folder, bindingCount) {
    var fid = String(folderId || '').trim();
    var meta = {
      folderId: fid,
      source: 'store.folders.remove',
      cascade: true,
      bindingCount: Number(bindingCount) || 0,
      parentId: folder && folder.parentId != null ? folder.parentId : null,
      createdAt: folder && folder.createdAt != null ? folder.createdAt : null,
      updatedAt: folder && folder.updatedAt != null ? folder.updatedAt : null,
      folderNamePresent: !!(folder && folder.name),
    };
    return {
      recordKind: 'folder',
      recordId: 'folder:' + encodeURIComponent(fid),
      deleteReason: 'folder-delete',
      meta: meta,
    };
  }

  function writeTombstoneSafely(record, label) {
    var tombstones = H2O && H2O.Studio && H2O.Studio.store && H2O.Studio.store.tombstones;
    if (!tombstones || typeof tombstones.createTombstone !== 'function') {
      recordWarning(label + ' tombstone skipped: tombstone store unavailable');
      return Promise.resolve(null);
    }
    try {
      return tombstones.createTombstone(record)
        .catch(function (e) {
          recordWarning(label + ' tombstone failed: ' + ((e && e.message) || e));
          return null;
        });
    } catch (e) {
      recordWarning(label + ' tombstone failed: ' + ((e && e.message) || e));
      return Promise.resolve(null);
    }
  }

  function writeFolderBindingTombstoneSafely(folderId, chatId, opts) {
    if (!F5D_FOLDER_BINDING_TOMBSTONES) return Promise.resolve(null);
    return writeTombstoneSafely(
      buildFolderBindingTombstone(folderId, chatId, opts),
      'F5D folderBinding'
    );
  }

  function writeFolderRemoveTombstonesSafely(folderId, folder, bindings, bindingsReadOk) {
    if (!F5D_FOLDER_REMOVE_TOMBSTONES) return Promise.resolve(null);
    var fid = String(folderId || '').trim();
    var rows = Array.isArray(bindings) ? bindings : [];
    var cascadeFrom = 'folder:' + encodeURIComponent(fid);
    if (!bindingsReadOk) {
      recordWarning('F5D.2 folder remove binding pre-read unavailable; cascade binding tombstones skipped');
    }
    return writeTombstoneSafely(
      buildFolderTombstone(fid, folder, bindingsReadOk ? rows.length : 0),
      'F5D.2 folder remove'
    ).then(function () {
      if (!bindingsReadOk || rows.length === 0) return null;
      var failures = 0;
      var writes = rows.map(function (row) {
        var chatId = String((row && row.chatId) || '').trim();
        if (!chatId) return Promise.resolve(null);
        return writeTombstoneSafely(buildFolderBindingTombstone(fid, chatId, {
          deleteReason: 'folder-delete-cascade',
          cascadeFrom: cascadeFrom,
          meta: {
            chatId: chatId,
            folderId: fid,
            assignedAt: row.assignedAt,
            source: 'store.folders.remove',
            cascade: true,
            cascadeKind: 'folder-delete',
            recordIdFormat: F5D_FOLDER_BINDING_RECORD_ID_FORMAT,
          },
        }), 'F5D.2 folderBinding cascade').then(function (result) {
          if (!result) failures += 1;
          return result;
        });
      });
      return Promise.all(writes).then(function () {
        if (failures > 0) {
          recordWarning('F5D.2 folderBinding cascade tombstones failed: ' + failures + ' of ' + rows.length);
        }
        return null;
      });
    });
  }

  function readFolderBindingForChatSafely(chatId) {
    return sqlSelect('SELECT folder_id, assigned_at FROM folder_bindings WHERE chat_id = ? LIMIT 1', [chatId])
      .then(function (rows) {
        if (!Array.isArray(rows) || rows.length === 0) return null;
        var row = rows[0] || {};
        var folderId = String(row.folder_id || '').trim();
        if (!folderId) return null;
        return {
          folderId: folderId,
          assignedAt: row.assigned_at == null ? null : Number(row.assigned_at),
        };
      }).catch(function (e) {
        recordWarning('F5D.1 folderBinding pre-read failed: ' + ((e && e.message) || e));
        return null;
      });
  }

  function readFolderForRemoveSafely(folderId) {
    return sqlSelect('SELECT * FROM folders WHERE id = ? LIMIT 1', [folderId])
      .then(function (rows) {
        if (!Array.isArray(rows) || rows.length === 0) return null;
        return rowToJs(rows[0]);
      }).catch(function (e) {
        recordWarning('F5D.2 folder remove pre-read failed: ' + ((e && e.message) || e));
        return null;
      });
  }

  function readFolderBindingsForRemoveSafely(folderId) {
    return sqlSelect('SELECT chat_id, assigned_at FROM folder_bindings WHERE folder_id = ? ORDER BY assigned_at DESC', [folderId])
      .then(function (rows) {
        return {
          ok: true,
          bindings: (rows || []).map(function (row) {
            return {
              chatId: String((row && row.chat_id) || '').trim(),
              assignedAt: row && row.assigned_at != null ? Number(row.assigned_at) : null,
            };
          }).filter(function (row) { return !!row.chatId; }),
        };
      }).catch(function (e) {
        recordWarning('F5D.2 folder remove binding pre-read failed: ' + ((e && e.message) || e));
        return { ok: false, bindings: [] };
      });
  }

  function generateFolderId() {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') {
        return 'fold_' + global.crypto.randomUUID();
      }
    } catch (_) { /* fall through */ }
    return 'fold_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }

  function getSync() {
    return (H2O && H2O.Desktop && H2O.Desktop.Sync) || null;
  }

  function f15FolderBindingDelegationEnabled(opts) {
    if (opts && (opts.forceCanonicalFolderBindingStoreWrite === true ||
        opts.forceLegacyFolderBindingWrite === true)) return false;
    if (opts && opts.useF15FolderBindingDelegation === true) return true;
    var sync = getSync();
    if (!sync) return false;
    if (typeof sync.isF15FolderBindingDelegationEnabled === 'function') {
      try { return sync.isF15FolderBindingDelegationEnabled() === true; }
      catch (_) { /* fall through */ }
    }
    return sync.__enableF15FolderBindingDelegation === true;
  }

  function explicitF7FallbackAllowed(opts) {
    return !!(opts && (opts.f15AllowF7Fallback === true || opts.allowF7Fallback === true));
  }

  function folderBindingsTriggerProtectionActive() {
    var sync = getSync();
    return !!(sync && sync.__f16FolderBindingsTriggerProtectionActive === true);
  }

  function isSha256Hex(value) {
    return /^[0-9a-f]{64}$/.test(String(value || '').trim().toLowerCase());
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!value || typeof value !== 'object') return value;
    var out = {};
    Object.keys(value).sort().forEach(function (key) {
      if (typeof value[key] !== 'undefined') out[key] = canonicalize(value[key]);
    });
    return out;
  }

  function canonicalJSON(value) {
    var sync = getSync();
    var kernel = sync && sync.kernel;
    if (kernel && typeof kernel.canonicalJSON === 'function') {
      try { return kernel.canonicalJSON(value); } catch (_) { /* fall through */ }
    }
    return JSON.stringify(canonicalize(value));
  }

  function bytesToHex(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i++) {
      var part = bytes[i].toString(16);
      out += part.length === 1 ? '0' + part : part;
    }
    return out;
  }

  async function sha256Hex(value) {
    var sync = getSync();
    var kernel = sync && sync.kernel;
    if (kernel && typeof kernel.sha256Hex === 'function') {
      try {
        var digest = await kernel.sha256Hex(value);
        if (isSha256Hex(digest)) return String(digest).trim().toLowerCase();
      } catch (_) { /* fall through */ }
    }
    if (!global.crypto || !global.crypto.subtle || typeof global.crypto.subtle.digest !== 'function') return '';
    var text = typeof value === 'string' ? value : canonicalJSON(value);
    var data = new global.TextEncoder().encode(text);
    var buffer = await global.crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(buffer));
  }

  function nowIsoSeconds() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  async function hashLegacyEndpoint(subjectType, rawId) {
    return sha256Hex(canonicalJSON({
      subjectType: subjectType,
      legacyEndpoint: String(rawId || '').trim()
    }));
  }

  async function resolveDelegationActorPeer(opts) {
    var peer = opts && opts.actorPeer;
    if (peer && isSha256Hex(peer.physicalDeviceIdHash) &&
        isSha256Hex(peer.installIdHash) &&
        isSha256Hex(peer.syncPeerIdHash)) {
      return {
        physicalDeviceIdHash: String(peer.physicalDeviceIdHash).trim().toLowerCase(),
        installIdHash: String(peer.installIdHash).trim().toLowerCase(),
        syncPeerIdHash: String(peer.syncPeerIdHash).trim().toLowerCase()
      };
    }
    return {
      physicalDeviceIdHash: await sha256Hex('f15.folder-binding-delegation.device'),
      installIdHash: await sha256Hex('f15.folder-binding-delegation.install'),
      syncPeerIdHash: await sha256Hex('f15.folder-binding-delegation.peer')
    };
  }

  function compactF15CanonicalBinding(binding) {
    if (!binding || typeof binding !== 'object' || Array.isArray(binding)) return null;
    return {
      objectType: binding.objectType || 'libraryBinding',
      subjectType: binding.subjectType || 'library.binding',
      subjectId: String(binding.subjectId || '').trim().toLowerCase(),
      revisionHash: String(binding.revisionHash || '').trim().toLowerCase(),
      bindingKind: binding.bindingKind || 'chat-folder',
      leftSubjectId: String(binding.leftSubjectId || '').trim().toLowerCase(),
      rightSubjectId: String(binding.rightSubjectId || '').trim().toLowerCase(),
      leftSubjectType: binding.leftSubjectType || 'chat.metadata',
      rightSubjectType: binding.rightSubjectType || 'folder.metadata',
      originAccountIdHash: String(binding.originAccountIdHash || '').trim().toLowerCase(),
      schemaVersion: binding.schemaVersion || 'h2o.library.binding.v1',
      bindingState: binding.bindingState || 'bound',
      boundAtIso: binding.boundAtIso || null,
      unboundAtIso: binding.unboundAtIso || null,
      sourceTag: binding.sourceTag || 'desktop',
      sourceTagHash: String(binding.sourceTagHash || '').trim().toLowerCase(),
      observedAtIso: binding.observedAtIso || null,
      redactionClass: binding.redactionClass || 'redacted'
    };
  }

  async function buildF15CanonicalChatFolderBinding(chatSubjectId, folderSubjectId, originAccountIdHash,
                                                   perEnvelopeSalt, observedAtIso) {
    var row = {
      bindingKind: 'chat-folder',
      bindingState: 'bound',
      leftSubjectId: chatSubjectId,
      rightSubjectId: folderSubjectId,
      leftSubjectType: 'chat.metadata',
      rightSubjectType: 'folder.metadata',
      originAccountIdHash: originAccountIdHash,
      perEnvelopeSalt: perEnvelopeSalt,
      sourceTag: 'desktop',
      observedAtIso: observedAtIso,
      boundAtIso: observedAtIso
    };
    var sync = getSync();
    if (sync && typeof sync.canonicalizeLibraryBinding === 'function') {
      var result = await sync.canonicalizeLibraryBinding(row);
      var canonical = result && (result.canonicalBinding || result.canonical);
      if (result && result.ok === true && canonical) return compactF15CanonicalBinding(canonical);
      return null;
    }
    var sourceTagHash = await sha256Hex('desktop');
    var subjectId = await sha256Hex(canonicalJSON({
      subjectType: 'library.binding',
      bindingKind: 'chat-folder',
      leftSubjectId: chatSubjectId,
      rightSubjectId: folderSubjectId,
      perEnvelopeSalt: perEnvelopeSalt
    }));
    var revisionHash = await sha256Hex(canonicalJSON({
      bindingState: 'bound',
      bindingKind: 'chat-folder',
      leftSubjectId: chatSubjectId,
      rightSubjectId: folderSubjectId,
      leftSubjectType: 'chat.metadata',
      rightSubjectType: 'folder.metadata',
      originAccountIdHash: originAccountIdHash,
      schemaVersion: 'h2o.library.binding.v1',
      sourceTagHash: sourceTagHash
    }));
    if (!isSha256Hex(subjectId) || !isSha256Hex(revisionHash) || !isSha256Hex(sourceTagHash)) return null;
    return {
      objectType: 'libraryBinding',
      subjectType: 'library.binding',
      subjectId: subjectId,
      revisionHash: revisionHash,
      bindingKind: 'chat-folder',
      leftSubjectId: chatSubjectId,
      rightSubjectId: folderSubjectId,
      leftSubjectType: 'chat.metadata',
      rightSubjectType: 'folder.metadata',
      originAccountIdHash: originAccountIdHash,
      schemaVersion: 'h2o.library.binding.v1',
      bindingState: 'bound',
      boundAtIso: observedAtIso,
      unboundAtIso: null,
      sourceTag: 'desktop',
      sourceTagHash: sourceTagHash,
      observedAtIso: observedAtIso,
      redactionClass: 'redacted'
    };
  }

  function cleanF15SiblingBindings(bindings, currentSubjectId) {
    if (!Array.isArray(bindings)) return [];
    var out = [];
    bindings.forEach(function (entry) {
      var binding = entry && entry.canonicalBinding ? entry.canonicalBinding : entry;
      var compacted = compactF15CanonicalBinding(binding);
      if (!compacted || !isSha256Hex(compacted.subjectId)) return;
      if (currentSubjectId && compacted.subjectId === currentSubjectId) return;
      out.push(compacted);
    });
    return out;
  }

  async function buildF15FolderBindingDelegationInput(operation, folderId, chatId, opts) {
    opts = opts || {};
    var chatSubjectId = isSha256Hex(opts.chatSubjectId)
      ? String(opts.chatSubjectId).trim().toLowerCase()
      : await hashLegacyEndpoint('chat.metadata', chatId);
    var folderSubjectId = isSha256Hex(opts.folderSubjectId)
      ? String(opts.folderSubjectId).trim().toLowerCase()
      : await hashLegacyEndpoint('folder.metadata', folderId);
    var originAccountIdHash = isSha256Hex(opts.originAccountIdHash)
      ? String(opts.originAccountIdHash).trim().toLowerCase()
      : await sha256Hex('f15.folder-binding-delegation.local-account');
    var perEnvelopeSalt = isSha256Hex(opts.perEnvelopeSalt)
      ? String(opts.perEnvelopeSalt).trim().toLowerCase()
      : await sha256Hex(canonicalJSON({
        saltKind: 'f15.folder-binding-delegation',
        operation: operation,
        chatSubjectId: chatSubjectId,
        folderSubjectId: folderSubjectId
      }));
    var observedAtIso = (opts.observedAtIso && !Number.isNaN(Date.parse(opts.observedAtIso)))
      ? new Date(opts.observedAtIso).toISOString().replace(/\.\d{3}Z$/, 'Z')
      : nowIsoSeconds();
    var actorPeer = await resolveDelegationActorPeer(opts);
    var canonicalBinding = await buildF15CanonicalChatFolderBinding(
      chatSubjectId,
      folderSubjectId,
      originAccountIdHash,
      perEnvelopeSalt,
      observedAtIso
    );
    var siblingBindings = cleanF15SiblingBindings(opts.siblingBindings, canonicalBinding && canonicalBinding.subjectId);
    return {
      operation: operation,
      diagnosticIntent: operation,
      canonicalBinding: canonicalBinding,
      originAccountIdHash: originAccountIdHash,
      localAccountIdHash: originAccountIdHash,
      perEnvelopeSalt: perEnvelopeSalt,
      actorPeer: actorPeer,
      ownerStatus: 'reachable',
      sourceTag: 'desktop',
      relatedCatalogs: [],
      relatedChats: [{ subjectType: 'chat.metadata', subjectId: chatSubjectId }],
      siblingBindings: siblingBindings,
      existingBindings: siblingBindings,
      materializedCacheObservation: { status: 'fresh' },
      sourceMirror: { ok: true, fresh: true, mirrorFresh: true },
      replayContext: { ok: true, replaySafe: true },
      watermarkState: { ok: true, watermarkSafe: true },
      consumedOperationState: { ok: true, consumedSafe: true },
      observedAtIso: observedAtIso
    };
  }

  async function buildF15SettlementExistingBindingContext(chatId, chatSubjectId, opts) {
    opts = opts || {};
    var canonicalChatId = cleanString(chatId);
    if (!canonicalChatId) return null;
    var leftSubjectId = isSha256Hex(chatSubjectId) ? String(chatSubjectId).trim().toLowerCase() : '';
    if (!leftSubjectId) return null;
    var operation = cleanString(opts.operation);
    var plannedUnbindFolderId = operation === 'bind' ? getFolderId(opts.plannedUnbindFolderId) : '';
    var plannedUnbindSubjectId = plannedUnbindFolderId
      ? await hashLegacyEndpoint('folder.metadata', plannedUnbindFolderId)
      : '';
    if (plannedUnbindFolderId && !isSha256Hex(plannedUnbindSubjectId)) return null;
    var rows;
    try {
      rows = await listCanonicalChatFolderBindingsForChat(canonicalChatId);
    } catch (_) {
      return null;
    }
    if (!Array.isArray(rows)) return null;
    var out = [];
    var plannedUnbindEdgePresent = false;
    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i] || {};
      var folderId = getFolderId(row);
      if (!folderId) continue;
      var rightSubjectId = await hashLegacyEndpoint('folder.metadata', folderId);
      if (!isSha256Hex(rightSubjectId)) return null;
      if (plannedUnbindSubjectId && rightSubjectId === plannedUnbindSubjectId && plannedUnbindEdgePresent !== true) {
        plannedUnbindEdgePresent = true;
        continue;
      }
      out.push({
        subjectType: 'library.binding',
        bindingKind: 'chat-folder',
        bindingState: 'bound',
        leftSubjectType: 'chat.metadata',
        rightSubjectType: 'folder.metadata',
        leftSubjectId: leftSubjectId,
        rightSubjectId: rightSubjectId,
        sourceTag: 'desktop',
        observedAtIso: (opts && opts.observedAtIso) || null
      });
    }
    if (plannedUnbindFolderId && plannedUnbindEdgePresent !== true) return null;
    return out;
  }

  function executeJournalLedgerKey() {
    try {
      var d = H2O && H2O.Desktop && H2O.Desktop.Sync;
      return cleanString(d && d.__executeJournalLedgerKey) || 'h2o:sync:execute-journal:v1';
    } catch (_) {
      return 'h2o:sync:execute-journal:v1';
    }
  }

  function normalizeF15SettledBindingMaterializationLedger(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
        raw.schema !== F15_SETTLED_BINDING_MATERIALIZATION_LEDGER_SCHEMA ||
        !Array.isArray(raw.records)) {
      return {
        schema: F15_SETTLED_BINDING_MATERIALIZATION_LEDGER_SCHEMA,
        createdAtIso: nowIsoSeconds(),
        updatedAtIso: '',
        records: [],
      };
    }
    return {
      schema: F15_SETTLED_BINDING_MATERIALIZATION_LEDGER_SCHEMA,
      createdAtIso: cleanString(raw.createdAtIso) || nowIsoSeconds(),
      updatedAtIso: cleanString(raw.updatedAtIso),
      records: raw.records.slice(0, F15_SETTLED_BINDING_MATERIALIZATION_LEDGER_LIMIT),
    };
  }

  async function readF15SettledBindingMaterializationLedger() {
    var raw = await chromeStorageGet(F15_SETTLED_BINDING_MATERIALIZATION_LEDGER_KEY);
    return normalizeF15SettledBindingMaterializationLedger(raw);
  }

  async function writeF15SettledBindingMaterializationLedger(ledger) {
    var payload = {};
    payload[F15_SETTLED_BINDING_MATERIALIZATION_LEDGER_KEY] = ledger;
    return chromeStorageSet(payload);
  }

  function settledBindingJournalRowsFromLedger(raw) {
    var events = raw && typeof raw === 'object' && Array.isArray(raw.events) ? raw.events : [];
    return events.map(function (event) {
      var row = event && event.row && typeof event.row === 'object' ? event.row : {};
      return {
        phase: cleanString(row.phase),
        domainId: cleanString(row.domainId),
        operationKind: cleanString(row.operationKind),
        subjectId: cleanString(row.subjectId).toLowerCase(),
        dedupeKey: cleanString(row.dedupeKey).toLowerCase(),
        eventDigest: cleanString(row.eventDigest).toLowerCase(),
        journalRowId: cleanString(row.journalRowId),
        evidence: row.evidence && typeof row.evidence === 'object' ? row.evidence : {},
      };
    });
  }

  function f15MaterializationOperationKind(operation) {
    var op = cleanString(operation);
    return op ? 'library-binding-' + op + '-applied' : '';
  }

  async function f15SettledJournalConfirmsMaterializationRecord(record) {
    var rec = record && typeof record === 'object' ? record : {};
    if (rec.schema !== F15_SETTLED_BINDING_MATERIALIZATION_RECORD_SCHEMA) return false;
    var expectedOperationKind = f15MaterializationOperationKind(rec.operation);
    if (!expectedOperationKind || !isSha256Hex(rec.subjectId) || !isSha256Hex(rec.settlementDigest)) return false;
    var raw = await chromeStorageGet(executeJournalLedgerKey());
    var rows = settledBindingJournalRowsFromLedger(raw);
    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      var evidence = row.evidence && typeof row.evidence === 'object' ? row.evidence : {};
      if (row.phase === 'settled' &&
          row.domainId === 'library.binding' &&
          row.operationKind === expectedOperationKind &&
          row.subjectId === cleanString(rec.subjectId).toLowerCase() &&
          (!rec.dedupeKey || row.dedupeKey === cleanString(rec.dedupeKey).toLowerCase()) &&
          (!rec.eventDigest || row.eventDigest === cleanString(rec.eventDigest).toLowerCase()) &&
          cleanString(evidence.settlementDigest).toLowerCase() === cleanString(rec.settlementDigest).toLowerCase()) {
        return true;
      }
    }
    return false;
  }

  function f15MaterializationRecordIdentity(record) {
    var rec = record && typeof record === 'object' ? record : {};
    return [
      cleanString(rec.operation),
      cleanString(rec.chatId),
      cleanString(rec.folderId),
      cleanString(rec.settlementDigest) || cleanString(rec.subjectId) || cleanString(rec.dedupeKey)
    ].join('|');
  }

  async function persistF15SettledBindingMaterializationRecord(operation, folderIdInput, chatIdInput, opts, delegationResult, materialization) {
    var op = cleanString(operation);
    var folderId = getFolderId(folderIdInput);
    var chatId = cleanString(chatIdInput);
    var options = opts && typeof opts === 'object' ? opts : {};
    var result = materialization && typeof materialization === 'object' ? materialization : {};
    if (options.skipF15SettledMaterializationRecord === true) return { ok: true, skipped: true };
    if (result.ok !== true || !op || !folderId || !chatId) return { ok: false, skipped: true, reason: 'materialization-record-input-invalid' };
    var delegation = delegationResult && typeof delegationResult === 'object' ? delegationResult : {};
    var execute = delegation.execute && typeof delegation.execute === 'object' ? delegation.execute : {};
    var envelope = execute.envelope && typeof execute.envelope === 'object' ? execute.envelope : {};
    var shapes = envelope.settlementShapes && typeof envelope.settlementShapes === 'object' ? envelope.settlementShapes : {};
    var settlement = delegation.settlement && typeof delegation.settlement === 'object' ? delegation.settlement : {};
    var settlementDigest = cleanString(shapes.settlementDigest || settlement.settlementDigest).toLowerCase();
    var subjectId = cleanString(envelope.subjectId).toLowerCase();
    if (!isSha256Hex(settlementDigest) || !isSha256Hex(subjectId)) {
      return { ok: false, skipped: true, reason: 'materialization-record-settlement-identity-missing' };
    }
    var now = nowIsoSeconds();
    var record = {
      schema: F15_SETTLED_BINDING_MATERIALIZATION_RECORD_SCHEMA,
      operation: op,
      chatId: chatId,
      folderId: folderId,
      assignedAt: Number(result.assignedAt || options.assignedAt) || Date.now(),
      subjectId: subjectId,
      dedupeKey: cleanString(envelope.dedupeKey).toLowerCase(),
      eventDigest: cleanString(envelope.eventDigest).toLowerCase(),
      operationKind: cleanString(envelope.operationKind),
      settlementDigest: settlementDigest,
      createdAtIso: now,
      updatedAtIso: now,
    };
    try {
      var ledger = await readF15SettledBindingMaterializationLedger();
      var identity = f15MaterializationRecordIdentity(record);
      var records = ledger.records.filter(function (entry) {
        return f15MaterializationRecordIdentity(entry) !== identity;
      });
      records.push(record);
      if (records.length > F15_SETTLED_BINDING_MATERIALIZATION_LEDGER_LIMIT) {
        records = records.slice(records.length - F15_SETTLED_BINDING_MATERIALIZATION_LEDGER_LIMIT);
      }
      ledger.records = records;
      ledger.updatedAtIso = now;
      await writeF15SettledBindingMaterializationLedger(ledger);
      return { ok: true, recordPersisted: true, record: record };
    } catch (e) {
      recordWarning('F15 settled binding materialization record persist failed: ' + String((e && e.message) || e));
      return { ok: false, reason: 'materialization-record-persist-failed' };
    }
  }

  function syntheticF15SettledDelegationResultFromMaterializationRecord(record) {
    var rec = record && typeof record === 'object' ? record : {};
    return {
      ok: true,
      restartConvergence: true,
      execute: {
        envelope: {
          subjectId: cleanString(rec.subjectId).toLowerCase(),
          dedupeKey: cleanString(rec.dedupeKey).toLowerCase(),
          eventDigest: cleanString(rec.eventDigest).toLowerCase(),
          operationKind: cleanString(rec.operationKind) || f15MaterializationOperationKind(rec.operation),
          settlementShapes: { settlementDigest: cleanString(rec.settlementDigest).toLowerCase() },
        },
      },
      settlement: {
        ok: true,
        settled: true,
        settlementDigest: cleanString(rec.settlementDigest).toLowerCase(),
        restartConvergenceVerifiedFromJournal: true,
      },
    };
  }

  async function currentCanonicalFolderBindingForChat(chatId) {
    var rows = await listCanonicalChatFolderBindingsForChat(chatId);
    var row = Array.isArray(rows) && rows.length ? rows[0] : null;
    return getFolderId(row) || '';
  }

  async function runF15SettledBindingRestartConvergence(opts) {
    var options = opts && typeof opts === 'object' ? opts : {};
    var result = {
      schema: F15_SETTLED_BINDING_RESTART_CONVERGENCE_SCHEMA,
      source: cleanString(options.source) || 'manual',
      ok: true,
      checkedCount: 0,
      convergedCount: 0,
      alreadyCurrentCount: 0,
      skippedCount: 0,
      journalVerifiedCount: 0,
      blockers: [],
      warnings: [],
      noChatDelete: true,
      noFolderDelete: true,
      noHardDelete: true,
      noPurge: true,
      noTombstoneMutation: true,
      noWebdavWrite: true,
      productSyncReady: false,
    };
    var ledger;
    try {
      ledger = await readF15SettledBindingMaterializationLedger();
    } catch (e) {
      result.ok = false;
      result.blockers.push('f15-settled-binding-materialization-ledger-unavailable');
      state.lastF15SettledBindingRestartConvergence = result;
      try { api.__lastF15SettledBindingRestartConvergenceResult = result; } catch (_) {}
      return result;
    }
    var records = Array.isArray(ledger.records) ? ledger.records.slice() : [];
    records.sort(function (a, b) {
      return String(a && a.createdAtIso || '').localeCompare(String(b && b.createdAtIso || ''));
    });
    for (var i = 0; i < records.length; i += 1) {
      var rec = records[i] && typeof records[i] === 'object' ? records[i] : {};
      result.checkedCount += 1;
      var op = cleanString(rec.operation);
      var chatId = cleanString(rec.chatId);
      var folderId = getFolderId(rec.folderId);
      if ((op !== 'bind' && op !== 'unbind') || !chatId || !folderId) {
        result.skippedCount += 1;
        result.warnings.push('materialization-record-invalid');
        continue;
      }
      var journalOk = false;
      try { journalOk = await f15SettledJournalConfirmsMaterializationRecord(rec); }
      catch (_) { journalOk = false; }
      if (journalOk !== true) {
        result.skippedCount += 1;
        result.warnings.push('materialization-record-journal-not-confirmed');
        continue;
      }
      result.journalVerifiedCount += 1;
      var currentFolderId = '';
      try { currentFolderId = await currentCanonicalFolderBindingForChat(chatId); }
      catch (_) { currentFolderId = ''; }
      if ((op === 'bind' && currentFolderId === folderId) ||
          (op === 'unbind' && currentFolderId !== folderId)) {
        result.alreadyCurrentCount += 1;
        continue;
      }
      var materialized = await materializeSettledCanonicalChatFolderBinding(op, folderId, chatId, {
        assignedAt: Number(rec.assignedAt) || Date.now(),
        restartConvergence: true,
        skipF15SettledMaterializationRecord: true,
      }, syntheticF15SettledDelegationResultFromMaterializationRecord(rec));
      if (!materialized || materialized.ok !== true) {
        result.ok = false;
        result.skippedCount += 1;
        result.blockers.push('f15-settled-binding-restart-convergence-materialization-failed');
        continue;
      }
      result.convergedCount += 1;
    }
    state.lastF15SettledBindingRestartConvergence = result;
    try { api.__lastF15SettledBindingRestartConvergenceResult = result; } catch (_) {}
    return result;
  }

  function ensureF15SettledBindingRestartConvergenceReady(source) {
    if (!state.f15RestartConvergenceReadyPromise) {
      state.f15RestartConvergenceReadyPromise = runF15SettledBindingRestartConvergence({ source: cleanString(source) || 'ensure' })
        .catch(function (e) {
          recordError('f15SettledBindingRestartConvergence.ensure', e);
          return { ok: false, blockers: ['f15-settled-binding-restart-convergence-threw'] };
        });
    }
    return state.f15RestartConvergenceReadyPromise;
  }

  function requiredF15FolderBindingApis(sync) {
    return [
      'createLibraryFolderBindingMigrationShadow',
      'generateLibraryBindingProposalCandidate',
      'previewLibraryBindingHandoff',
      'buildLibraryBindingApplyEventReceipt',
      'recordLibraryBindingBookkeeping',
      'shapeLibraryBindingExecuteEnvelope',
      'settleLibraryExecuteEnvelope'
    ].filter(function (name) { return !sync || typeof sync[name] !== 'function'; });
  }

  async function runF15FolderBindingDelegationPipeline(operation, folderId, chatId, opts) {
    var sync = getSync();
    var missing = requiredF15FolderBindingApis(sync);
    if (missing.length > 0) {
      return { ok: false, blockers: ['f15-folder-binding-delegation-api-missing'], missingApis: missing };
    }
    var input = await buildF15FolderBindingDelegationInput(operation, folderId, chatId, opts);
    var canonicalBinding = input && input.canonicalBinding;
    if (!canonicalBinding ||
        !isSha256Hex(canonicalBinding.leftSubjectId) ||
        !isSha256Hex(canonicalBinding.rightSubjectId)) {
      return { ok: false, blockers: ['f15-folder-binding-canonical-row-invalid'], input: input };
    }
    var shadow = await sync.createLibraryFolderBindingMigrationShadow({
      chatSubjectId: canonicalBinding.leftSubjectId,
      folderSubjectId: canonicalBinding.rightSubjectId,
      perEnvelopeSalt: input.perEnvelopeSalt,
      observedAtIso: input.observedAtIso
    });
    if (!shadow || shadow.ok !== true) {
      return { ok: false, blockers: ['f15-folder-binding-shadow-failed'], shadow: shadow };
    }
    var proposal = await sync.generateLibraryBindingProposalCandidate(input);
    if (!proposal || proposal.ok !== true || proposal.generated !== true) {
      return { ok: false, blockers: ['f15-folder-binding-proposal-failed'], shadow: shadow, proposal: proposal };
    }
    var handoff = await sync.previewLibraryBindingHandoff({
      proposalCandidate: proposal,
      preflight: proposal.preflight,
      operation: operation,
      actorPeer: input.actorPeer,
      originAccountIdHash: input.originAccountIdHash,
      ownerStatus: 'reachable',
      observedAtIso: input.observedAtIso
    });
    if (!handoff || handoff.ok !== true || handoff.handoffReady !== true) {
      return { ok: false, blockers: ['f15-folder-binding-handoff-failed'], shadow: shadow, proposal: proposal, handoff: handoff };
    }
    var receipt = await sync.buildLibraryBindingApplyEventReceipt({
      handoffPreview: handoff,
      operation: operation,
      observedAtIso: input.observedAtIso
    });
    if (!receipt || receipt.ok !== true) {
      return { ok: false, blockers: ['f15-folder-binding-receipt-failed'], shadow: shadow, proposal: proposal, handoff: handoff, receipt: receipt };
    }
    var bookkeeping = await sync.recordLibraryBindingBookkeeping({
      receipt: receipt,
      observedAtIso: input.observedAtIso
    });
    if (!bookkeeping || bookkeeping.ok !== true) {
      return { ok: false, blockers: ['f15-folder-binding-bookkeeping-failed'], shadow: shadow, proposal: proposal, handoff: handoff, receipt: receipt, bookkeeping: bookkeeping };
    }
    var execute = await sync.shapeLibraryBindingExecuteEnvelope({
      bookkeepingResult: bookkeeping,
      receipt: receipt,
      observedAtIso: input.observedAtIso
    });
    if (!execute || execute.ok !== true || !execute.envelope) {
      return { ok: false, blockers: ['f15-folder-binding-execute-envelope-failed'], shadow: shadow, proposal: proposal, handoff: handoff, receipt: receipt, bookkeeping: bookkeeping, execute: execute };
    }
    var settlementExistingBindings = await buildF15SettlementExistingBindingContext(
      chatId,
      canonicalBinding.leftSubjectId,
      {
        operation: operation,
        plannedUnbindFolderId: opts && opts.plannedUnbindFolderId,
        observedAtIso: input.observedAtIso
      }
    );
    if (!Array.isArray(settlementExistingBindings)) {
      return { ok: false, blockers: ['f15-folder-binding-settlement-context-failed'], shadow: shadow, proposal: proposal, handoff: handoff, receipt: receipt, bookkeeping: bookkeeping, execute: execute };
    }
    var settlement = await sync.settleLibraryExecuteEnvelope({
      envelope: execute.envelope,
      receipt: receipt,
      dispatchResult: {
        ok: true,
        confirmed: true,
        dispatchStatus: 'confirmed',
        operationResultDigest: await sha256Hex(canonicalJSON({
          operation: operation,
          subjectId: execute.envelope.subjectId,
          observedAtIso: input.observedAtIso
        }))
      },
      existingBindings: settlementExistingBindings,
      observedAtIso: input.observedAtIso
    });
    if (!settlement || settlement.ok !== true || settlement.settled !== true) {
      return { ok: false, blockers: ['f15-folder-binding-settlement-failed'], shadow: shadow, proposal: proposal, handoff: handoff, receipt: receipt, bookkeeping: bookkeeping, execute: execute, settlement: settlement };
    }
    return {
      ok: true,
      operation: operation,
      shadow: shadow,
      proposal: proposal,
      handoff: handoff,
      receipt: receipt,
      bookkeeping: bookkeeping,
      execute: execute,
      settlement: settlement,
      sideEffectSummary: settlement.sideEffectSummary || {}
    };
  }

  async function delegateF15FolderBindingWrite(operation, folderId, chatId, opts) {
    opts = opts || {};
    var safeOpts = Object.assign({}, opts);
    delete safeOpts.plannedUnbindFolderId;
    if (operation === 'bind' && opts.skipRebindDecompose !== true) {
      var previousRows = await listForChat(chatId);
      var previous = previousRows && previousRows[0];
      var previousFolderId = previous && getFolderId(previous);
      var declaredPreviousFolderId = getFolderId(opts.previousFolderId || opts.expectedCurrentFolderId || opts.currentFolderId);
      if (declaredPreviousFolderId && declaredPreviousFolderId !== previousFolderId) {
        return { ok: false, blockers: ['f15-folder-binding-planned-unbind-mismatch'], declaredPreviousFolderId: declaredPreviousFolderId, detectedPreviousFolderId: previousFolderId || '' };
      }
      if (previousFolderId && previousFolderId !== folderId) {
        var unbound = await delegateF15FolderBindingWrite('unbind', previousFolderId, chatId,
          Object.assign({}, safeOpts, { skipRebindDecompose: true }));
        if (!unbound || unbound.ok !== true) return unbound;
        return runF15FolderBindingDelegationPipeline(operation, folderId, chatId,
          Object.assign({}, safeOpts, { plannedUnbindFolderId: previousFolderId }));
      }
    }
    return runF15FolderBindingDelegationPipeline(operation, folderId, chatId, safeOpts);
  }

  async function materializeSettledCanonicalChatFolderBinding(operation, folderIdInput, chatIdInput, opts, delegationResult) {
    var op = cleanString(operation);
    var folderId = getFolderId(folderIdInput);
    var chatId = cleanString(chatIdInput);
    var options = opts && typeof opts === 'object' ? opts : {};
    var base = {
      ok: false,
      operation: op,
      chatId: chatId,
      folderId: folderId,
      canonicalBindingWriteCount: 0,
      rowsAffected: 0,
      noChromeDestructiveBindingApply: true,
      noChatDelete: true,
      noSnapshotDelete: true,
      noHardDelete: true,
      noPurge: true,
    };
    if (!folderId || !chatId) {
      base.status = 'settled-binding-materialization-identity-missing';
      base.blockers = [base.status];
      return base;
    }
    if (!delegationResult ||
        delegationResult.ok !== true ||
        !delegationResult.settlement ||
        delegationResult.settlement.ok !== true ||
        delegationResult.settlement.settled !== true) {
      base.status = 'f15-settlement-not-confirmed';
      base.blockers = [base.status];
      return base;
    }
    var assignedAt = (typeof options.assignedAt === 'number' && options.assignedAt > 0)
      ? options.assignedAt
      : Date.now();
    try {
      if (op === 'bind') {
        var bindWrite = await sqlExecute(
          'INSERT OR REPLACE INTO folder_bindings (chat_id, folder_id, assigned_at) VALUES (?, ?, ?)',
          [chatId, folderId, assignedAt]
        );
        var bindRows = await listCanonicalChatFolderBindingsForChat(chatId);
        var bound = Array.isArray(bindRows) && bindRows.length ? bindRows[0] : null;
        var boundFolderId = getFolderId(bound);
        var bindDuplicateCount = Math.max(0, (Array.isArray(bindRows) ? bindRows.length : 0) - 1);
        var bindBlockers = [];
        base.rowsAffected = readRowsAffected(bindWrite);
        base.canonicalBindingWriteCount = base.rowsAffected > 0 ? 1 : 0;
        base.writeResult = bindWrite;
        base.canonicalRowsForChat = bindRows || [];
        base.canonicalRowsForChatCount = Array.isArray(bindRows) ? bindRows.length : 0;
        base.duplicateCanonicalBindingRowsForChatCount = bindDuplicateCount;
        base.assignedAt = assignedAt;
        if (base.rowsAffected <= 0) bindBlockers.push('settled-binding-materialization-zero-write');
        if (boundFolderId !== folderId) bindBlockers.push('settled-binding-materialization-not-visible');
        if (bindDuplicateCount > 0) bindBlockers.push('duplicate-canonical-binding-rows-for-chat');
        if (bindBlockers.length) {
          base.status = bindBlockers[0];
          base.blockers = bindBlockers;
          return base;
        }
        base.ok = true;
        base.status = 'settled-binding-materialized';
        base.blockers = [];
        base.restartConvergenceRecord = await persistF15SettledBindingMaterializationRecord(op, folderId, chatId, options, delegationResult, base);
        return base;
      }
      if (op === 'unbind') {
        var unbindWrite = await sqlExecute(
          'DELETE FROM folder_bindings WHERE chat_id = ? AND folder_id = ?',
          [chatId, folderId]
        );
        var unbindRows = await listCanonicalChatFolderBindingsForChat(chatId);
        var stillBound = (Array.isArray(unbindRows) ? unbindRows : []).some(function (row) {
          return getFolderId(row) === folderId;
        });
        base.rowsAffected = readRowsAffected(unbindWrite);
        base.canonicalBindingWriteCount = base.rowsAffected > 0 ? 1 : 0;
        base.writeResult = unbindWrite;
        base.canonicalRowsForChat = unbindRows || [];
        base.canonicalRowsForChatCount = Array.isArray(unbindRows) ? unbindRows.length : 0;
        var unbindBlockers = [];
        if (base.rowsAffected <= 0) unbindBlockers.push('settled-binding-materialization-zero-write');
        if (stillBound) unbindBlockers.push('settled-binding-materialization-not-visible');
        if (unbindBlockers.length) {
          base.status = unbindBlockers[0];
          base.blockers = unbindBlockers;
          return base;
        }
        base.ok = true;
        base.status = 'settled-binding-materialized';
        base.blockers = [];
        base.restartConvergenceRecord = await persistF15SettledBindingMaterializationRecord(op, folderId, chatId, options, delegationResult, base);
        return base;
      }
      base.status = 'settled-binding-materialization-operation-unsupported';
      base.blockers = [base.status];
      return base;
    } catch (e) {
      recordError('materializeSettledCanonicalChatFolderBinding', e);
      base.status = 'settled-binding-materialization-threw';
      base.blockers = [base.status];
      base.error = String((e && e.message) || e);
      return base;
    }
  }

  function patchToCols(patch) {
    var columns = Object.create(null);
    var mergeMeta = null;
    if (!patch || typeof patch !== 'object') return { columns: columns, mergeMeta: mergeMeta };
    Object.keys(patch).forEach(function (field) {
      if (field === 'folderId' || field === 'id') return; /* PK handled separately */
      if (field === 'meta') {
        if (patch.meta && typeof patch.meta === 'object' && !Array.isArray(patch.meta)) {
          mergeMeta = patch.meta;
        }
        return;
      }
      var col = FIELD_TO_COL[field];
      var val = patch[field];
      if (!col) {
        mergeMeta = mergeMeta || {};
        mergeMeta[field] = val;
        return;
      }
      if (val === undefined) return;
      columns[col] = val;
    });
    return { columns: columns, mergeMeta: mergeMeta };
  }

  /* ── Folder reads ─────────────────────────────────────────────────── */
  function getById(folderIdInput) {
    var id = getFolderId(folderIdInput);
    if (!id) return Promise.resolve(null);
    return sqlSelect('SELECT * FROM folders WHERE id = ? LIMIT 1', [id])
      .then(function (rows) {
        if (!Array.isArray(rows) || rows.length === 0) return null;
        return rowToJs(rows[0]);
      })
      .catch(function (e) { recordError('get', e); return null; });
  }

  function listFolders(opts) {
    opts = opts || {};
    var sortCol = 'sort_order';
    var sortDir = 'ASC';
    if (opts.sort && typeof opts.sort === 'object') {
      var sf = FIELD_TO_COL[opts.sort.field] || null;
      if (sf) sortCol = sf;
      if (opts.sort.dir === 'DESC' || opts.sort.dir === 'desc') sortDir = 'DESC';
    }
    /* Tie-break by name to keep ordering deterministic when sort_order matches. */
    var includeTombstoned = opts.includeTombstoned === true || opts.includeDeleted === true;
    var includePurged = opts.includePurged === true || opts.includePermanentlyPurged === true;
    var clauses = [];
    var values = [];
    if (!includeTombstoned) {
      clauses.push(
        'NOT EXISTS (' +
        'SELECT 1 FROM sync_tombstones t ' +
        'WHERE t.record_kind = \'folder\' ' +
        'AND t.record_id = \'folder:\' || folders.id ' +
        'AND t.restored_at IS NULL)'
      );
    }
    if (!includePurged) {
      clauses.push(phase6aPermanentPurgeWhereClause());
      values = values.concat(phase6aPermanentPurgeWhereValues());
    }
    var where = clauses.length ? (' WHERE ' + clauses.join(' AND ')) : '';
    var sql = 'SELECT * FROM folders' + where + ' ORDER BY ' + sortCol + ' ' + sortDir + ', name ASC';
    if (typeof opts.limit === 'number' && opts.limit > 0) {
      sql += ' LIMIT ' + Math.floor(opts.limit);
      if (typeof opts.offset === 'number' && opts.offset > 0) sql += ' OFFSET ' + Math.floor(opts.offset);
    }
    return sqlSelect(sql, values)
      .then(function (rows) { return (rows || []).map(rowToJs).filter(function (r) { return r != null; }); })
      .catch(function (e) { recordError('list', e); return []; });
  }

  function countFolders() {
    var values = phase6aPermanentPurgeWhereValues();
    return sqlSelect(
      'SELECT COUNT(*) AS n FROM folders ' +
      'WHERE NOT EXISTS (' +
      'SELECT 1 FROM sync_tombstones t ' +
      'WHERE t.record_kind = \'folder\' ' +
      'AND t.record_id = \'folder:\' || folders.id ' +
      'AND t.restored_at IS NULL) ' +
      'AND ' + phase6aPermanentPurgeWhereClause(),
      values
    )
      .then(function (rows) {
        if (Array.isArray(rows) && rows.length > 0 && typeof rows[0].n === 'number') return rows[0].n;
        return 0;
      })
      .catch(function (e) { recordError('count', e); return 0; });
  }

  /* ── Folder writes ────────────────────────────────────────────────── */
  function upsertCore(input, opts) {
    var patch = (input && typeof input === 'object') ? Object.assign({}, input) : {};
    if (opts && opts.generateId && !getFolderId(patch)) {
      patch.folderId = generateFolderId();
    }
    var folderId = getFolderId(patch);
    if (!folderId) return Promise.reject(new Error('upsert: folderId required'));
    var pc = patchToCols(patch);
    return getById(folderId).then(function (existing) {
      if (pc.mergeMeta) {
        var merged = Object.assign({}, (existing && existing.meta) || {}, pc.mergeMeta);
        pc.columns.meta_json = JSON.stringify(merged);
      }
      var now = Date.now();
      if (!('updated_at' in pc.columns)) pc.columns.updated_at = now;
      if (existing) {
        var setClauses = [];
        var values = [];
        Object.keys(pc.columns).forEach(function (col) {
          setClauses.push(col + ' = ?');
          values.push(pc.columns[col]);
        });
        if (setClauses.length === 0) return existing;
        values.push(folderId);
        return sqlExecute('UPDATE folders SET ' + setClauses.join(', ') + ' WHERE id = ?', values)
          .then(function () { return getById(folderId); })
          .then(function (row) {
            recordWrite('upsert.update');
            notifySubscribers({ source: 'local', op: 'upsert', folderId: folderId, mode: 'update' });
            return row;
          });
      }
      /* INSERT path: folders.name is NOT NULL with no default — required. */
      if (!pc.columns.name) {
        return Promise.reject(new Error('upsert: name required for new folder'));
      }
      if (!('created_at' in pc.columns)) pc.columns.created_at = now;
      var cols = ['id'];
      var ph = ['?'];
      var vals = [folderId];
      Object.keys(pc.columns).forEach(function (col) {
        cols.push(col); ph.push('?'); vals.push(pc.columns[col]);
      });
      return sqlExecute(
        'INSERT INTO folders (' + cols.join(', ') + ') VALUES (' + ph.join(', ') + ')',
        vals
      ).then(function () { return getById(folderId); })
        .then(function (row) {
          recordWrite('upsert.insert');
          notifySubscribers({ source: 'local', op: 'upsert', folderId: folderId, mode: 'insert' });
          return row;
        });
    });
  }

  function upsert(input) { return upsertCore(input, { generateId: false }); }
  function create(input) { return upsertCore(input, { generateId: true }); }

  function patchOne(folderIdInput, partial) {
    var id = getFolderId(folderIdInput);
    if (!id) return Promise.reject(new Error('patch: folderId required'));
    if (!partial || typeof partial !== 'object') return getById(id);
    var merged = Object.assign({}, partial, { folderId: id });
    return upsertCore(merged, { generateId: false });
  }

  function buildFolderRecoverySnapshot(folder, counts) {
    var meta = safeMeta(folder && folder.meta);
    var folderId = getFolderId(folder);
    var name = cleanString((folder && folder.name) || meta.name || folderId);
    var color = cleanString((folder && (folder.iconColor || folder.color)) || meta.iconColor || meta.color || '');
    var capturedAt = new Date().toISOString();
    var bindingRows = Array.isArray(counts && counts.bindings) ? counts.bindings : [];
    var bindingSnapshots = bindingRows.map(function (row) {
      var chatId = cleanString(row && row.chatId);
      if (!chatId) return null;
      return {
        chatId: chatId,
        folderId: folderId,
        folderName: name,
        assignedAt: row && row.assignedAt != null ? Number(row.assignedAt) : null,
        priorUpdatedAt: row && row.assignedAt != null ? Number(row.assignedAt) : null,
        priorDigest: cleanString(row && row.priorDigest) || null,
        capturedAt: capturedAt,
        source: 'folder_bindings',
        restorePolicy: 'rebind-if-currently-unfiled',
      };
    }).filter(Boolean);
    return {
      schema: 'h2o.studio.folder-recovery-snapshot.v1',
      phase: PHASE4A_FOLDER_SOFT_DELETE_PHASE,
      capturedAt: capturedAt,
      noHardDelete: true,
      noChatDelete: true,
      folder: {
        id: folderId,
        folderId: folderId,
        name: name,
        title: name,
        normalizedName: normalizeFolderName(name),
        parentId: folder && folder.parentId != null ? folder.parentId : null,
        color: color,
        iconColor: color,
        icon: cleanString(meta.icon || meta.iconKey || ''),
        sortOrder: Number(folder && folder.sortOrder) || Number(meta.sortOrder) || 0,
        source: cleanString((folder && folder.source) || meta.source || 'desktop-sqlite'),
        sourceKind: cleanString((folder && (folder.sourceKind || folder.kind)) || meta.sourceKind || meta.kind || 'desktop-sqlite'),
        createdAt: folder && folder.createdAt != null ? folder.createdAt : null,
        updatedAt: folder && folder.updatedAt != null ? folder.updatedAt : null,
        meta: Object.assign({}, meta),
      },
      counts: {
        bindingCount: bindingSnapshots.length,
        knownRowCount: Number(counts && counts.knownRowCount) || 0,
        affectedChatCount: bindingSnapshots.length,
      },
      bindings: bindingSnapshots,
      bindingCaptureOk: counts && counts.bindingCaptureOk === true,
      affectedChatCount: bindingSnapshots.length,
      restorePolicy: {
        localOnly: true,
        crossPlatformSync: 'deferred',
        purgeBlocked: true,
        bindingRestore: 'rebind-if-currently-unfiled',
      },
    };
  }

  function recoverySnapshotBindings(snapshot) {
    var recovery = safeMeta(snapshot);
    var rows = Array.isArray(recovery.bindings) ? recovery.bindings : [];
    return rows.map(function (row) {
      var chatId = cleanString(row && row.chatId);
      if (!chatId) return null;
      return {
        chatId: chatId,
        folderId: cleanString(row && row.folderId),
        folderName: cleanString(row && row.folderName),
        assignedAt: row && row.assignedAt != null ? Number(row.assignedAt) : null,
        capturedAt: cleanString(row && row.capturedAt),
      };
    }).filter(Boolean);
  }

  async function getChatForBindingRestore(chatId) {
    var cid = cleanString(chatId);
    if (!cid) return null;
    var chatsStore = (H2O.Studio && H2O.Studio.store && H2O.Studio.store.chats) || null;
    if (!chatsStore || typeof chatsStore.get !== 'function') return null;
    try { return await chatsStore.get(cid); }
    catch (e) {
      recordWarning('Phase4B restore chat lookup failed: ' + ((e && e.message) || e));
      return null;
    }
  }

  async function unbindSnapshotBindingsForSoftDelete(folderId, bindings) {
    var fid = cleanString(folderId);
    var rows = Array.isArray(bindings) ? bindings : [];
    var result = {
      attemptedCount: rows.length,
      unboundCount: 0,
      skippedCount: 0,
      warnings: [],
    };
    for (var i = 0; i < rows.length; i += 1) {
      var chatId = cleanString(rows[i] && rows[i].chatId);
      if (!chatId) {
        result.skippedCount += 1;
        result.warnings.push({ code: 'soft-delete-binding-skipped-chat-missing', chatId: '' });
        continue;
      }
      var ok = false;
      try {
        ok = await unbindChat(fid, chatId, {
          reason: 'phase4b-folder-soft-delete-move-to-unfiled',
          source: PHASE4A_FOLDER_SOFT_DELETE_PHASE,
          noChatDelete: true,
        });
      } catch (e) {
        recordWarning('Phase4B soft-delete unbind failed: ' + ((e && e.message) || e));
        ok = false;
      }
      if (ok) result.unboundCount += 1;
      else {
        result.skippedCount += 1;
        result.warnings.push({ code: 'soft-delete-binding-unbind-failed', chatId: chatId });
      }
    }
    return result;
  }

  async function restoreBindingsFromRecoverySnapshot(folderId, snapshot) {
    var fid = cleanString(folderId);
    var bindings = recoverySnapshotBindings(snapshot);
    var result = {
      bindingRestoreAttemptedCount: bindings.length,
      bindingRestoredCount: 0,
      bindingSkippedCount: 0,
      restoreWarnings: [],
    };
    for (var i = 0; i < bindings.length; i += 1) {
      var binding = bindings[i];
      var chatId = binding.chatId;
      var chat = await getChatForBindingRestore(chatId);
      if (!chat) {
        result.bindingSkippedCount += 1;
        result.restoreWarnings.push({ code: 'restore-binding-skipped-chat-missing', chatId: chatId });
        continue;
      }
      var currentRows = await listForChat(chatId);
      var current = Array.isArray(currentRows) && currentRows.length ? currentRows[0] : null;
      var currentFolderId = getFolderId(current);
      if (currentFolderId && currentFolderId !== fid) {
        result.bindingSkippedCount += 1;
        result.restoreWarnings.push({ code: 'restore-binding-skipped-rebound', chatId: chatId, currentFolderId: currentFolderId });
        continue;
      }
      if (currentFolderId === fid) {
        result.bindingRestoredCount += 1;
        continue;
      }
      var rebound = false;
      try {
        rebound = await bindChat(fid, chatId, {
          assignedAt: Number(binding.assignedAt) || Date.now(),
          reason: 'phase4b-folder-restore-rebind',
          source: PHASE4A_FOLDER_SOFT_DELETE_PHASE,
          noChatDelete: true,
          allowTombstonedFolderRebind: true,
        });
      } catch (e) {
        recordWarning('Phase4B restore bind failed: ' + ((e && e.message) || e));
        rebound = false;
      }
      if (rebound) result.bindingRestoredCount += 1;
      else {
        result.bindingSkippedCount += 1;
        result.restoreWarnings.push({ code: 'restore-binding-skipped-bind-failed', chatId: chatId });
      }
    }
    setPhase4bBindingState(result);
    return result;
  }

  function affectedChatCountFromTombstone(tombstone) {
    var meta = tombstoneMeta(tombstone);
    var recovery = safeMeta(meta.recoverySnapshot);
    var counts = safeMeta(recovery.counts);
    var bindings = recoverySnapshotBindings(recovery);
    return Math.max(
      Number(meta.bindingCount) || 0,
      Number(recovery.affectedChatCount) || 0,
      Number(counts.affectedChatCount) || 0,
      Number(counts.bindingCount) || 0,
      bindings.length
    );
  }

  function numberOrZero(value) {
    var n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function isoAddDays(value, days) {
    var at = Date.parse(cleanString(value));
    if (!Number.isFinite(at)) return '';
    try { return new Date(at + (numberOrZero(days) * 24 * 60 * 60 * 1000)).toISOString(); }
    catch (_) { return ''; }
  }

  function retentionCountdownStatus(deletedAt, restoredAt) {
    if (!cleanString(deletedAt)) return 'unknown';
    if (cleanString(restoredAt)) return 'restored';
    var expiresAt = Date.parse(isoAddDays(deletedAt, PHASE4D3_RETENTION_DAYS));
    if (!Number.isFinite(expiresAt)) return 'unknown';
    return Date.now() >= expiresAt ? 'expired' : 'active';
  }

  function restoreAvailableReasonForRetention(status, restoreAvailable, folderId) {
    if (status === 'restored') return 'already-restored';
    if (!folderId) return 'missing-folder-id';
    if (!restoreAvailable) return 'restore-blocked';
    if (status === 'expired') return 'retention-expired-but-purge-deferred';
    if (status === 'active') return 'within-retention-window';
    return 'retention-status-unknown';
  }

  function folderNameFromTombstone(tombstone) {
    var meta = tombstoneMeta(tombstone);
    var recovery = safeMeta(meta.recoverySnapshot);
    var folder = safeMeta(recovery.folder);
    return cleanString(folder.name || folder.title || meta.folderName || tombstone && tombstone.folderName);
  }

  function restoreWarningsFromMeta(meta) {
    var warnings = meta && (meta.restoreWarnings || meta.bindingRestoreWarnings || meta.warnings);
    return Array.isArray(warnings) ? warnings.slice(0, 20).map(function (warning) {
      if (typeof warning === 'string') return { code: cleanString(warning) };
      var w = safeMeta(warning);
      return { code: cleanString(w.code || w.reason || w.status || 'restore-warning') };
    }).filter(function (warning) { return !!warning.code; }) : [];
  }

  function recentlyDeletedRowFromTombstone(tombstone) {
    var t = tombstone || {};
    var meta = tombstoneMeta(t);
    var recovery = safeMeta(meta.recoverySnapshot);
    var counts = safeMeta(recovery.counts);
    var restoredAt = cleanString(t.restoredAt);
    var deletedAt = cleanString(t.deletedAt);
    var folderId = folderIdFromTombstone(t);
    var restoreAvailable = !restoredAt && !!folderId;
    var restoreStatus = restoredAt ? 'restored' : (restoreAvailable ? 'active' : 'blocked');
    var retentionExpiresAt = isoAddDays(deletedAt, PHASE4D3_RETENTION_DAYS);
    var retentionStatus = retentionCountdownStatus(deletedAt, restoredAt);
    var retentionExpired = retentionStatus === 'expired';
    return {
      tombstoneId: cleanString(t.tombstoneId),
      folderId: folderId,
      folderName: folderNameFromTombstone(t),
      recordKind: 'folder',
      deletedAt: deletedAt,
      deletedBy: cleanString(t.deletedBySyncPeerId),
      deletedBySurface: cleanString(meta.deletedBySurface || meta.sourceSurface || t.deletedBySurface),
      restoredAt: restoredAt,
      restoreAvailable: restoreAvailable,
      restoreStatus: restoreStatus,
      affectedChatCount: affectedChatCountFromTombstone(t),
      bindingRestoreAttemptedCount: numberOrZero(meta.bindingRestoreAttemptedCount || recovery.bindingRestoreAttemptedCount || counts.bindingRestoreAttemptedCount),
      bindingRestoredCount: numberOrZero(meta.bindingRestoredCount || recovery.bindingRestoredCount || counts.bindingRestoredCount),
      bindingSkippedCount: numberOrZero(meta.bindingSkippedCount || recovery.bindingSkippedCount || counts.bindingSkippedCount),
      restoreWarnings: restoreWarningsFromMeta(meta),
      purgeBlocked: true,
      hardDeleteBlocked: true,
      retentionDays: PHASE4D3_RETENTION_DAYS,
      retentionStartedAt: deletedAt,
      retentionExpiresAt: retentionExpiresAt,
      retentionExpired: retentionExpired,
      retentionCountdownStatus: retentionStatus,
      retentionEnforcement: 'deferred',
      purgeEligible: false,
      operatorPurgeAvailable: false,
      automaticPurge: false,
      restorePolicy: 'allowed-while-purge-deferred',
      restoreAvailableReason: restoreAvailableReasonForRetention(retentionStatus, restoreAvailable, folderId),
      purgeBlockedReason: 'purge-phase-deferred',
    };
  }

  function makePurgeToken() {
    try {
      var c = global.crypto || null;
      if (c && typeof c.randomUUID === 'function') return 'folder-purge-preview:' + c.randomUUID();
    } catch (_) { /* ignore */ }
    return 'folder-purge-preview:' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2);
  }

  function makePurgeBase(schema, status) {
    return {
      schema: schema,
      phase: 'phase6a.desktop-folder-purge',
      ok: false,
      status: status || 'not-run',
      observedAt: new Date().toISOString(),
      desktopOnly: true,
      chromeAuthority: false,
      automaticPurge: false,
      operatorConfirmedPurge: false,
      purgeDeletesTombstoneRecoveryRecordsOnly: false,
      purgeDeletesActiveTombstones: true,
      purgePermanentlySuppressesFolderRows: true,
      purgeDeletesFolderRows: false,
      noChromeRowsDeleted: true,
      noActiveVisibleFolderDelete: true,
      noProtectedSystemFolderDelete: true,
      permanentFolderRowSuppression: true,
      beforeCount: 0,
      candidateCount: 0,
      purgedCount: 0,
      purgedTombstoneCount: 0,
      purgedFolderRowCount: 0,
      permanentlyHiddenFolderRowCount: 0,
      folderRowAlreadyMissingCount: 0,
      folderRowAlreadySuppressedCount: 0,
      skippedCount: 0,
      protectedSkippedCount: 0,
      activeVisibleSkippedCount: 0,
      restoredSkippedCount: 0,
      alreadyPurgedSkippedCount: 0,
      chatDeletedCount: 0,
      snapshotDeletedCount: 0,
      assetDeletedCount: 0,
      hardDeletedFolderRowCount: 0,
      receiptDeletedCount: 0,
      blockers: [],
      warnings: [],
    };
  }

  function phase6aPermanentPurgeWhereClause() {
    return '(folders.meta_json IS NULL OR (folders.meta_json NOT LIKE ? AND folders.meta_json NOT LIKE ?))';
  }

  function phase6aPermanentPurgeWhereValues() {
    return [
      '%"' + PHASE6A_PERMANENT_PURGE_META_KEY + '":true%',
      '%"' + PHASE6A_PERMANENT_PURGE_META_KEY + '": true%',
    ];
  }

  function addWarning(list, code, extra) {
    var clean = cleanString(code);
    if (!clean) return;
    var item = Object.assign({ code: clean }, safeMeta(extra));
    list.push(item);
  }

  function folderPurgeProtectionCodes(folderId, folder, row) {
    var codes = [];
    var id = cleanString(folderId);
    var nameKey = normalizeFolderName((folder && folder.name) || (row && row.folderName) || id);
    if (!id) addBlocker(codes, 'folder-identity-missing');
    if (id === 'unfiled' || nameKey === 'unfiled') addBlocker(codes, 'unfiled-folder');
    if (RESERVED_FOLDER_NAME_KEYS[nameKey]) addBlocker(codes, 'system-folder');
    folderPhase4aBlockers(folder || { id: id, name: row && row.folderName }, id).forEach(function (code) {
      addBlocker(codes, code);
    });
    return codes;
  }

  function summarizePurgeRow(row, reason) {
    return {
      tombstoneId: cleanString(row && row.tombstoneId),
      folderId: cleanString(row && row.folderId),
      folderName: cleanString(row && row.folderName),
      deletedAt: cleanString(row && row.deletedAt),
      retentionCountdownStatus: cleanString(row && row.retentionCountdownStatus),
      purgeEligible: row && row.purgeEligible === true,
      operatorPurgeAvailable: row && row.operatorPurgeAvailable === true,
      skipReason: cleanString(reason),
    };
  }

  function readVisibleFolderIdSet() {
    return listFolders({ limit: 5000 }).then(function (rows) {
      var set = Object.create(null);
      (Array.isArray(rows) ? rows : []).forEach(function (folder) {
        var id = getFolderId(folder);
        if (id) set[id] = true;
      });
      return set;
    });
  }

  function isPhase6aPermanentlyPurged(folder) {
    var meta = safeMeta(folder && folder.meta);
    return meta[PHASE6A_PERMANENT_PURGE_META_KEY] === true;
  }

  async function permanentlySuppressPurgedFolderRows(candidates, opts) {
    var options = opts && typeof opts === 'object' ? opts : {};
    var rows = Array.isArray(candidates) ? candidates : [];
    var result = {
      ok: false,
      status: 'not-run',
      attemptedCount: rows.length,
      permanentlyHiddenFolderRowCount: 0,
      folderRowAlreadyMissingCount: 0,
      folderRowAlreadySuppressedCount: 0,
      activeVisibleSkippedCount: 0,
      protectedSkippedCount: 0,
      skippedCount: 0,
      hardDeletedFolderRowCount: 0,
      chatDeletedCount: 0,
      snapshotDeletedCount: 0,
      assetDeletedCount: 0,
      receiptDeletedCount: 0,
      noActiveVisibleFolderDelete: true,
      noProtectedSystemFolderDelete: true,
      noHardDelete: true,
      noPurgeOfChatsSnapshotsAssets: true,
      blockers: [],
      warnings: [],
      rows: [],
    };
    try {
      var visibleSet = await readVisibleFolderIdSet();
      for (var i = 0; i < rows.length; i += 1) {
        var candidate = rows[i] || {};
        var folderId = cleanString(candidate.folderId);
        var tombstoneId = cleanString(candidate.tombstoneId);
        var summary = {
          folderId: folderId,
          tombstoneId: tombstoneId,
          status: 'not-run',
        };
        if (!folderId || !tombstoneId) {
          result.skippedCount += 1;
          summary.status = 'folder-identity-missing';
          addBlocker(result.blockers, 'folder-identity-missing');
          result.rows.push(summary);
          continue;
        }
        if (visibleSet[folderId]) {
          result.activeVisibleSkippedCount += 1;
          result.skippedCount += 1;
          summary.status = 'active-visible-folder';
          addBlocker(result.blockers, 'active-visible-folder');
          result.rows.push(summary);
          continue;
        }
        var folder = await getById(folderId);
        if (!folder) {
          result.folderRowAlreadyMissingCount += 1;
          summary.status = 'folder-row-already-missing';
          result.rows.push(summary);
          continue;
        }
        var protectionCodes = folderPurgeProtectionCodes(folderId, folder, candidate);
        if (protectionCodes.length) {
          result.protectedSkippedCount += 1;
          result.skippedCount += 1;
          summary.status = protectionCodes[0];
          addBlocker(result.blockers, protectionCodes[0]);
          result.rows.push(summary);
          continue;
        }
        if (isPhase6aPermanentlyPurged(folder)) {
          result.folderRowAlreadySuppressedCount += 1;
          summary.status = 'folder-row-already-suppressed';
          result.rows.push(summary);
          continue;
        }
        await patchOne(folderId, {
          meta: {
            phase6aPermanentlyPurged: true,
            phase6aPurgedAt: new Date().toISOString(),
            phase6aPurgeReason: cleanString(options.reason),
            phase6aPurgeSource: PHASE6A_PERMANENT_PURGE_SOURCE,
            phase6aPurgeTombstoneId: tombstoneId,
          },
        });
        result.permanentlyHiddenFolderRowCount += 1;
        summary.status = 'folder-row-permanently-hidden';
        result.rows.push(summary);
      }
      if (result.blockers.length) {
        result.status = 'folder-row-suppression-blocked';
        return result;
      }
      result.ok = true;
      result.status = 'folder-rows-permanently-hidden';
      return result;
    } catch (e) {
      recordError('permanentlySuppressPurgedFolderRows', e);
      result.status = 'folder-row-suppression-failed';
      result.reason = String((e && e.message) || e);
      addBlocker(result.blockers, 'folder-row-suppression-failed');
      return result;
    }
  }

  function looksLikeResurrectedPurgeCandidate(folder) {
    var name = cleanString(folder && folder.name);
    return /^zz-4d4-delete-restore-/i.test(name) ||
      /^zz-5c-/i.test(name) ||
      /^zz-delete-/i.test(name) ||
      /^F5D(\.1)? Test Folder/i.test(name) ||
      /^New 9$/i.test(name);
  }

  function makeResurrectionRepairBase(schema, status) {
    return {
      schema: schema,
      phase: 'phase6a.1c.desktop-folder-purge-resurrection-repair',
      ok: false,
      status: status || 'not-run',
      observedAt: new Date().toISOString(),
      desktopOnly: true,
      chromeAuthority: false,
      automaticRepair: false,
      operatorConfirmedRepair: false,
      permanentFolderRowSuppression: true,
      noHardDelete: true,
      noPurge: true,
      noChatDelete: true,
      noSnapshotDelete: true,
      noAssetDelete: true,
      noReceiptDelete: true,
      beforeVisibleFolderCount: 0,
      candidateCount: 0,
      repairedCount: 0,
      permanentlyHiddenFolderRowCount: 0,
      skippedCount: 0,
      protectedSkippedCount: 0,
      activeRealUserSkippedCount: 0,
      alreadySuppressedSkippedCount: 0,
      chatDeletedCount: 0,
      snapshotDeletedCount: 0,
      assetDeletedCount: 0,
      hardDeletedFolderRowCount: 0,
      receiptDeletedCount: 0,
      candidates: [],
      skipped: [],
      blockers: [],
      warnings: [],
    };
  }

  function summarizeResurrectionRepairFolder(folder, reason) {
    var folderId = getFolderId(folder);
    return {
      folderId: folderId,
      id: folderId,
      folderName: cleanString(folder && folder.name),
      name: cleanString(folder && folder.name),
      color: cleanString(folder && (folder.iconColor || folder.color)),
      source: cleanString(folder && folder.source),
      sourceKind: cleanString(folder && folder.sourceKind),
      phase6aPermanentlyPurged: isPhase6aPermanentlyPurged(folder),
      skipReason: cleanString(reason),
    };
  }

  async function buildPurgedFolderResurrectionRepairPlan(opts) {
    var options = opts && typeof opts === 'object' ? opts : {};
    var limit = Math.max(1, Math.min(1000, Number(options.limit) || 500));
    var result = makeResurrectionRepairBase(PHASE6A_REPAIR_PREVIEW_SCHEMA, 'purged-folder-resurrection-repair-previewed');
    result.preview = true;
    result.reason = cleanString(options.reason);
    try {
      var rows = await listFolders({ limit: limit });
      rows = Array.isArray(rows) ? rows : [];
      result.beforeVisibleFolderCount = rows.length;
      for (var i = 0; i < rows.length; i += 1) {
        var folder = rows[i];
        if (!looksLikeResurrectedPurgeCandidate(folder)) {
          result.activeRealUserSkippedCount += 1;
          continue;
        }
        var folderId = getFolderId(folder);
        if (!folderId) {
          result.skippedCount += 1;
          result.skipped.push(summarizeResurrectionRepairFolder(folder, 'folder-identity-missing'));
          continue;
        }
        var protectionCodes = folderPurgeProtectionCodes(folderId, folder, { folderName: folder && folder.name });
        if (protectionCodes.length) {
          result.protectedSkippedCount += 1;
          result.skippedCount += 1;
          result.skipped.push(summarizeResurrectionRepairFolder(folder, protectionCodes[0]));
          continue;
        }
        if (isPhase6aPermanentlyPurged(folder)) {
          result.alreadySuppressedSkippedCount += 1;
          result.skippedCount += 1;
          result.skipped.push(summarizeResurrectionRepairFolder(folder, 'already-suppressed'));
          continue;
        }
        result.candidates.push(summarizeResurrectionRepairFolder(folder, ''));
      }
      result.candidateCount = result.candidates.length;
      result.ok = true;
      result.status = 'purged-folder-resurrection-repair-previewed';
      return result;
    } catch (e) {
      recordError('buildPurgedFolderResurrectionRepairPlan', e);
      result.status = 'purged-folder-resurrection-repair-preview-failed';
      result.reason = String((e && e.message) || e);
      addBlocker(result.blockers, 'purged-folder-resurrection-repair-preview-failed');
      return result;
    }
  }

  async function previewPurgedFolderResurrectionRepair(opts) {
    var result = await buildPurgedFolderResurrectionRepairPlan(opts);
    if (result.ok === true) {
      var token = makePurgeToken().replace('folder-purge-preview:', 'folder-resurrection-repair-preview:');
      result.previewToken = token;
      result.previewExpiresAt = new Date(Date.now() + PHASE6A_PURGE_TOKEN_TTL_MS).toISOString();
      state.phase6a.lastRepairPreview = {
        token: token,
        createdAt: Date.now(),
        candidateCount: result.candidateCount,
        candidateFolderIds: result.candidates.map(function (row) { return row.folderId; }),
      };
    }
    return result;
  }

  async function repairPurgedFolderResurrections(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var result = makeResurrectionRepairBase(PHASE6A_REPAIR_RESULT_SCHEMA, 'not-run');
    result.reason = cleanString(opts.reason);
    var previewToken = cleanString(opts.previewToken || opts.confirmationToken);
    var expectedCount = Number(opts.expectedCount ?? opts.expectedRepairCandidateCount ?? opts.expectedCandidateCount);
    if (opts.dryRun !== false) addBlocker(result.blockers, 'dry-run-false-required');
    if (!result.reason || result.reason.length < 8) addBlocker(result.blockers, 'explicit-reason-required');
    if (!previewToken) addBlocker(result.blockers, 'preview-token-required');
    if (!Number.isFinite(expectedCount) || Math.floor(expectedCount) !== expectedCount || expectedCount < 0) {
      addBlocker(result.blockers, 'expected-count-required');
    }
    var last = state.phase6a.lastRepairPreview;
    if (!last || last.token !== previewToken) addBlocker(result.blockers, 'invalid-preview-token');
    if (last && Date.now() - Number(last.createdAt || 0) > PHASE6A_PURGE_TOKEN_TTL_MS) {
      addBlocker(result.blockers, 'preview-token-expired');
    }
    if (result.blockers.length) {
      result.status = result.blockers[0];
      return result;
    }
    var plan = await buildPurgedFolderResurrectionRepairPlan({ limit: 1000, reason: result.reason });
    result.beforeVisibleFolderCount = plan.beforeVisibleFolderCount;
    result.candidateCount = plan.candidateCount;
    result.skippedCount = plan.skippedCount;
    result.protectedSkippedCount = plan.protectedSkippedCount;
    result.activeRealUserSkippedCount = plan.activeRealUserSkippedCount;
    result.alreadySuppressedSkippedCount = plan.alreadySuppressedSkippedCount;
    result.candidates = plan.candidates;
    result.skipped = plan.skipped;
    if (plan.ok !== true) {
      result.status = plan.status || 'purged-folder-resurrection-repair-preview-failed';
      plan.blockers.forEach(function (code) { addBlocker(result.blockers, code); });
      return result;
    }
    if (plan.candidateCount !== expectedCount || plan.candidateCount !== last.candidateCount) {
      result.status = 'expected-count-mismatch';
      addBlocker(result.blockers, 'expected-count-mismatch');
      return result;
    }
    var currentIds = plan.candidates.map(function (row) { return row.folderId; }).sort();
    var previewIds = last.candidateFolderIds.slice().sort();
    if (currentIds.join('\n') !== previewIds.join('\n')) {
      result.status = 'preview-candidate-set-changed';
      addBlocker(result.blockers, 'preview-candidate-set-changed');
      return result;
    }
    for (var i = 0; i < plan.candidates.length; i += 1) {
      var candidate = plan.candidates[i];
      var folderId = cleanString(candidate && candidate.folderId);
      if (!folderId) continue;
      var folder = await getById(folderId);
      if (!folder || !looksLikeResurrectedPurgeCandidate(folder)) {
        result.skippedCount += 1;
        result.skipped.push(Object.assign({}, candidate, { skipReason: 'candidate-no-longer-visible-or-safe' }));
        continue;
      }
      var protectionCodes = folderPurgeProtectionCodes(folderId, folder, { folderName: folder && folder.name });
      if (protectionCodes.length) {
        result.protectedSkippedCount += 1;
        result.skippedCount += 1;
        result.skipped.push(Object.assign({}, candidate, { skipReason: protectionCodes[0] }));
        addBlocker(result.blockers, protectionCodes[0]);
        continue;
      }
      await patchOne(folderId, {
        meta: {
          phase6aPermanentlyPurged: true,
          phase6aPurgedAt: new Date().toISOString(),
          phase6aPurgeReason: result.reason,
          phase6aPurgeSource: PHASE6A_REPAIR_SOURCE,
          phase6aPurgeRepair: true,
        },
      });
      result.repairedCount += 1;
      result.permanentlyHiddenFolderRowCount += 1;
    }
    if (result.blockers.length) {
      result.status = result.blockers[0];
      return result;
    }
    result.ok = true;
    result.status = 'purged-folder-resurrections-repaired';
    result.operatorConfirmedRepair = true;
    state.phase6a.lastRepairPreview = null;
    state.phase6a.lastRepairCommit = result;
    recordWrite('repairPurgedFolderResurrections');
    notifySubscribers({
      source: PHASE6A_REPAIR_SOURCE,
      op: 'repairPurgedFolderResurrections',
      repairedCount: result.repairedCount,
      noChatDelete: true,
      noSnapshotDelete: true,
    });
    return result;
  }

  async function diagnosePurgedFolderResurrectionCandidates(opts) {
    var options = opts && typeof opts === 'object' ? opts : {};
    var limit = Math.max(1, Math.min(1000, Number(options.limit) || 500));
    var result = {
      schema: 'h2o.studio.folder-purge-resurrection-diagnostics.v1',
      phase: 'phase6a.1b.desktop-folder-purge-resurrection',
      ok: false,
      status: 'not-run',
      observedAt: new Date().toISOString(),
      desktopOnly: true,
      chromeAuthority: false,
      readOnly: true,
      noHardDelete: true,
      noPurge: true,
      noChatDelete: true,
      noSnapshotDelete: true,
      noAssetDelete: true,
      noReceiptDelete: true,
      candidateNamePatterns: [
        'zz-4d4-delete-restore-*',
        'zz-5c-*',
        'F5D Test Folder*',
        'F5D.1 Test Folder*',
        'New 9',
        'zz-delete-*',
      ],
      visibleFolderCount: 0,
      resurrectedCandidateCount: 0,
      candidates: [],
      blockers: [],
      warnings: [],
    };
    try {
      var rows = await listFolders({ limit: limit });
      result.visibleFolderCount = Array.isArray(rows) ? rows.length : 0;
      result.candidates = (Array.isArray(rows) ? rows : []).filter(looksLikeResurrectedPurgeCandidate).map(function (folder) {
        var folderId = getFolderId(folder);
        return {
          folderId: folderId,
          id: folderId,
          name: cleanString(folder && folder.name),
          color: cleanString(folder && (folder.iconColor || folder.color)),
          source: cleanString(folder && folder.source),
          sourceKind: cleanString(folder && folder.sourceKind),
          phase6aPermanentlyPurged: isPhase6aPermanentlyPurged(folder),
        };
      });
      result.resurrectedCandidateCount = result.candidates.length;
      result.ok = true;
      result.status = 'purge-resurrection-candidates-diagnosed';
      return result;
    } catch (e) {
      recordError('diagnosePurgedFolderResurrectionCandidates', e);
      result.status = 'purge-resurrection-diagnostics-failed';
      result.reason = String((e && e.message) || e);
      addBlocker(result.blockers, 'purge-resurrection-diagnostics-failed');
      return result;
    }
  }

  async function buildRecentlyDeletedPurgePlan(opts) {
    var options = opts && typeof opts === 'object' ? opts : {};
    var tombstones = getTombstoneStore();
    var limit = Math.max(1, Math.min(1000, Number(options.limit) || 500));
    var base = makePurgeBase(PHASE6A_PURGE_PREVIEW_SCHEMA, 'folder-purge-previewed');
    base.preview = true;
    base.reason = cleanString(options.reason);
    base.candidates = [];
    base.skipped = [];
    if (!tombstones || typeof tombstones.list !== 'function') {
      addBlocker(base.blockers, 'tombstone-store-unavailable');
      base.status = 'tombstone-store-unavailable';
      return base;
    }
    try {
      var visibleSet = await readVisibleFolderIdSet();
      var rawRows = await tombstones.list({ recordKind: 'folder', includeRestored: true, limit: limit });
      var rows = (Array.isArray(rawRows) ? rawRows : [])
        .filter(function (row) { return cleanString(row && row.recordKind) === 'folder'; })
        .map(recentlyDeletedRowFromTombstone);
      base.beforeCount = rows.length;
      for (var i = 0; i < rows.length; i += 1) {
        var row = rows[i];
        var folderId = cleanString(row.folderId);
        var tombstoneId = cleanString(row.tombstoneId);
        var restored = !!cleanString(row.restoredAt) || row.restoreStatus === 'restored';
        if (restored) {
          base.restoredSkippedCount += 1;
          base.skipped.push(summarizePurgeRow(row, 'already-restored'));
          continue;
        }
        if (!folderId || !tombstoneId) {
          base.skippedCount += 1;
          base.skipped.push(summarizePurgeRow(row, 'folder-identity-missing'));
          continue;
        }
        if (visibleSet[folderId]) {
          base.activeVisibleSkippedCount += 1;
          base.skipped.push(summarizePurgeRow(row, 'active-visible-folder'));
          continue;
        }
        var folder = await getById(folderId);
        var protectionCodes = folderPurgeProtectionCodes(folderId, folder, row);
        if (protectionCodes.length) {
          base.protectedSkippedCount += 1;
          base.skipped.push(summarizePurgeRow(row, protectionCodes[0]));
          continue;
        }
        row.purgeEligible = true;
        row.operatorPurgeAvailable = true;
        row.purgeBlocked = true;
        row.automaticPurge = false;
        row.purgeBlockedReason = 'automatic-purge-deferred-operator-confirmation-required';
        base.candidates.push(summarizePurgeRow(row, ''));
      }
      base.candidateCount = base.candidates.length;
      base.skippedCount = base.skipped.length;
      base.ok = true;
      base.status = 'folder-purge-previewed';
      return base;
    } catch (e) {
      recordError('buildRecentlyDeletedPurgePlan', e);
      base.status = 'folder-purge-preview-failed';
      addBlocker(base.blockers, 'folder-purge-preview-failed');
      base.reason = String((e && e.message) || e);
      return base;
    }
  }

  async function previewRecentlyDeletedFolderPurge(opts) {
    var result = await buildRecentlyDeletedPurgePlan(opts);
    if (result.ok === true) {
      var token = makePurgeToken();
      result.previewToken = token;
      result.previewExpiresAt = new Date(Date.now() + PHASE6A_PURGE_TOKEN_TTL_MS).toISOString();
      state.phase6a.lastPreview = {
        token: token,
        createdAt: Date.now(),
        candidateCount: result.candidateCount,
        candidateTombstoneIds: result.candidates.map(function (row) { return row.tombstoneId; }),
      };
    }
    return result;
  }

  async function purgeRecentlyDeletedFolders(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var result = makePurgeBase(PHASE6A_PURGE_RESULT_SCHEMA, 'not-run');
    result.reason = cleanString(opts.reason);
    var previewToken = cleanString(opts.previewToken || opts.confirmationToken);
    var expectedCount = Number(opts.expectedCount ?? opts.expectedPurgeCandidateCount ?? opts.expectedCandidateCount);
    if (opts.dryRun !== false) addBlocker(result.blockers, 'dry-run-false-required');
    if (!result.reason || result.reason.length < 8) addBlocker(result.blockers, 'explicit-reason-required');
    if (!previewToken) addBlocker(result.blockers, 'preview-token-required');
    if (!Number.isFinite(expectedCount) || Math.floor(expectedCount) !== expectedCount || expectedCount < 0) {
      addBlocker(result.blockers, 'expected-count-required');
    }
    var last = state.phase6a.lastPreview;
    if (!last || last.token !== previewToken) addBlocker(result.blockers, 'invalid-preview-token');
    if (last && Date.now() - Number(last.createdAt || 0) > PHASE6A_PURGE_TOKEN_TTL_MS) {
      addBlocker(result.blockers, 'preview-token-expired');
    }
    if (result.blockers.length) {
      result.status = result.blockers[0];
      return result;
    }
    var plan = await buildRecentlyDeletedPurgePlan({ limit: 1000, reason: result.reason });
    result.beforeCount = plan.beforeCount;
    result.candidateCount = plan.candidateCount;
    result.skippedCount = plan.skippedCount;
    result.protectedSkippedCount = plan.protectedSkippedCount;
    result.activeVisibleSkippedCount = plan.activeVisibleSkippedCount;
    result.restoredSkippedCount = plan.restoredSkippedCount;
    result.candidates = plan.candidates;
    result.skipped = plan.skipped;
    if (plan.ok !== true) {
      result.status = plan.status || 'folder-purge-preview-failed';
      plan.blockers.forEach(function (code) { addBlocker(result.blockers, code); });
      return result;
    }
    if (plan.candidateCount !== expectedCount || plan.candidateCount !== last.candidateCount) {
      result.status = 'expected-count-mismatch';
      addBlocker(result.blockers, 'expected-count-mismatch');
      return result;
    }
    var currentIds = plan.candidates.map(function (row) { return row.tombstoneId; }).sort();
    var previewIds = last.candidateTombstoneIds.slice().sort();
    if (currentIds.join('\n') !== previewIds.join('\n')) {
      result.status = 'preview-candidate-set-changed';
      addBlocker(result.blockers, 'preview-candidate-set-changed');
      return result;
    }
    if (!currentIds.length) {
      result.ok = true;
      result.status = 'no-purge-candidates';
      result.operatorConfirmedPurge = true;
      state.phase6a.lastCommit = result;
      return result;
    }
    var suppressionResult = await permanentlySuppressPurgedFolderRows(plan.candidates, {
      reason: result.reason,
      source: PHASE6A_PERMANENT_PURGE_SOURCE,
    });
    result.folderRowSuppression = suppressionResult;
    result.permanentlyHiddenFolderRowCount = Number(suppressionResult && suppressionResult.permanentlyHiddenFolderRowCount) || 0;
    result.folderRowAlreadyMissingCount = Number(suppressionResult && suppressionResult.folderRowAlreadyMissingCount) || 0;
    result.folderRowAlreadySuppressedCount = Number(suppressionResult && suppressionResult.folderRowAlreadySuppressedCount) || 0;
    if (!suppressionResult || suppressionResult.ok !== true) {
      result.status = cleanString(suppressionResult && suppressionResult.status) || 'folder-row-suppression-failed';
      (Array.isArray(suppressionResult && suppressionResult.blockers) ? suppressionResult.blockers : []).forEach(function (code) {
        addBlocker(result.blockers, code && (code.code || code));
      });
      if (!result.blockers.length) addBlocker(result.blockers, 'folder-row-suppression-failed');
      return result;
    }
    var tombstones = getTombstoneStore();
    if (!tombstones || typeof tombstones.purgeFolderTombstonesByIds !== 'function') {
      result.status = 'tombstone-purge-api-unavailable';
      addBlocker(result.blockers, 'tombstone-purge-api-unavailable');
      return result;
    }
    var purgeResult = await tombstones.purgeFolderTombstonesByIds(currentIds, {
      dryRun: false,
      reason: result.reason,
      source: 'desktop-recently-deleted-operator-purge',
    });
    result.tombstoneStoreResult = purgeResult;
    result.purgedCount = Number(purgeResult && purgeResult.purgedCount) || 0;
    result.purgedTombstoneCount = result.purgedCount;
    result.alreadyPurgedSkippedCount = Number(purgeResult && purgeResult.alreadyPurgedSkippedCount) || 0;
    if (!purgeResult || purgeResult.ok !== true) {
      result.status = cleanString(purgeResult && purgeResult.status) || 'folder-purge-failed';
      (Array.isArray(purgeResult && purgeResult.blockers) ? purgeResult.blockers : []).forEach(function (code) {
        addBlocker(result.blockers, code && (code.code || code));
      });
      if (!result.blockers.length) addBlocker(result.blockers, 'folder-purge-failed');
      return result;
    }
    result.ok = true;
    result.status = 'folder-tombstones-purged';
    result.operatorConfirmedPurge = true;
    state.phase6a.lastPreview = null;
    state.phase6a.lastCommit = result;
    recordWrite('purgeRecentlyDeletedFolders');
    setPhase4aState('purgeRecentlyDeletedFolders', result.status, '', '', -result.purgedCount);
    notifySubscribers({
      source: 'desktop-recently-deleted-operator-purge',
      op: 'purgeRecentlyDeletedFolders',
      purgedCount: result.purgedCount,
      noChatDelete: true,
      noSnapshotDelete: true,
    });
    return result;
  }

  function makeRestoredHistoryClearBase(schema, status) {
    return {
      schema: schema,
      phase: 'phase6a.4.desktop-folder-restored-history-clear',
      ok: false,
      status: status || 'not-run',
      observedAt: new Date().toISOString(),
      desktopOnly: true,
      chromeAuthority: false,
      automaticPurge: false,
      operatorConfirmedPurge: false,
      operatorConfirmedHistoryClear: false,
      clearRestoredHistoryOnly: true,
      purgeDeletesActiveTombstones: false,
      noActiveDeletedTombstoneDelete: true,
      noActiveVisibleFolderDelete: true,
      noProtectedSystemFolderDelete: true,
      noFolderRowDelete: true,
      noChromeRowsDeleted: true,
      beforeCount: 0,
      restoredHistoryCandidateCount: 0,
      candidateCount: 0,
      clearedCount: 0,
      skippedCount: 0,
      activeDeletedSkippedCount: 0,
      protectedSkippedCount: 0,
      malformedSkippedCount: 0,
      alreadyClearedSkippedCount: 0,
      chatDeletedCount: 0,
      snapshotDeletedCount: 0,
      assetDeletedCount: 0,
      hardDeletedFolderRowCount: 0,
      receiptDeletedCount: 0,
      blockers: [],
      warnings: [],
      candidates: [],
      skipped: [],
    };
  }

  function summarizeRestoredHistoryClearRow(row, reason) {
    return {
      tombstoneId: cleanString(row && row.tombstoneId),
      folderId: cleanString(row && row.folderId),
      folderName: cleanString(row && row.folderName),
      restoredAt: cleanString(row && row.restoredAt),
      restoreStatus: cleanString(row && row.restoreStatus),
      skipReason: cleanString(reason),
    };
  }

  async function buildRecentlyDeletedRestoredHistoryClearPlan(opts) {
    var options = opts && typeof opts === 'object' ? opts : {};
    var tombstones = getTombstoneStore();
    var limit = Math.max(1, Math.min(1000, Number(options.limit) || 500));
    var base = makeRestoredHistoryClearBase(PHASE6A_RESTORED_HISTORY_CLEAR_PREVIEW_SCHEMA, 'folder-restored-history-clear-previewed');
    base.preview = true;
    base.reason = cleanString(options.reason);
    if (!tombstones || typeof tombstones.list !== 'function') {
      addBlocker(base.blockers, 'tombstone-store-unavailable');
      base.status = 'tombstone-store-unavailable';
      return base;
    }
    try {
      var rawRows = await tombstones.list({ recordKind: 'folder', includeRestored: true, limit: limit });
      var rows = (Array.isArray(rawRows) ? rawRows : [])
        .filter(function (row) { return cleanString(row && row.recordKind) === 'folder'; })
        .map(recentlyDeletedRowFromTombstone);
      base.beforeCount = rows.length;
      for (var i = 0; i < rows.length; i += 1) {
        var row = rows[i];
        var tombstoneId = cleanString(row.tombstoneId);
        var folderId = cleanString(row.folderId);
        var restored = !!cleanString(row.restoredAt) || row.restoreStatus === 'restored';
        if (!restored) {
          base.activeDeletedSkippedCount += 1;
          base.skipped.push(summarizeRestoredHistoryClearRow(row, 'active-deleted-tombstone'));
          continue;
        }
        if (!tombstoneId || !folderId) {
          base.malformedSkippedCount += 1;
          base.skipped.push(summarizeRestoredHistoryClearRow(row, 'folder-or-tombstone-identity-missing'));
          continue;
        }
        var folder = await getById(folderId);
        var protectionCodes = folderPurgeProtectionCodes(folderId, folder, row);
        if (protectionCodes.length) {
          base.protectedSkippedCount += 1;
          base.skipped.push(summarizeRestoredHistoryClearRow(row, protectionCodes[0]));
          continue;
        }
        base.candidates.push(summarizeRestoredHistoryClearRow(row, ''));
      }
      base.restoredHistoryCandidateCount = base.candidates.length;
      base.candidateCount = base.restoredHistoryCandidateCount;
      base.skippedCount = base.skipped.length;
      base.ok = true;
      base.status = 'folder-restored-history-clear-previewed';
      return base;
    } catch (e) {
      recordError('buildRecentlyDeletedRestoredHistoryClearPlan', e);
      base.status = 'folder-restored-history-clear-preview-failed';
      addBlocker(base.blockers, 'folder-restored-history-clear-preview-failed');
      base.reason = String((e && e.message) || e);
      return base;
    }
  }

  async function previewRecentlyDeletedRestoredHistoryClear(opts) {
    var result = await buildRecentlyDeletedRestoredHistoryClearPlan(opts);
    if (result.ok === true) {
      var token = makePurgeToken().replace('folder-purge-preview:', 'folder-restored-history-clear-preview:');
      result.previewToken = token;
      result.previewExpiresAt = new Date(Date.now() + PHASE6A_PURGE_TOKEN_TTL_MS).toISOString();
      state.phase6a.lastRestoredHistoryClearPreview = {
        token: token,
        createdAt: Date.now(),
        restoredHistoryCandidateCount: result.restoredHistoryCandidateCount,
        candidateTombstoneIds: result.candidates.map(function (row) { return row.tombstoneId; }),
      };
    }
    return result;
  }

  async function clearRecentlyDeletedRestoredHistory(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var result = makeRestoredHistoryClearBase(PHASE6A_RESTORED_HISTORY_CLEAR_RESULT_SCHEMA, 'not-run');
    result.reason = cleanString(opts.reason);
    var previewToken = cleanString(opts.previewToken || opts.confirmationToken);
    var expectedCount = Number(opts.expectedCount ?? opts.expectedRestoredHistoryClearCount ?? opts.expectedCandidateCount);
    var confirmationPhrase = cleanString(opts.confirmationPhrase || opts.confirmationText || opts.typedConfirmation);
    var confirmationFlag = opts.confirmRestoredHistoryClear === true || opts.confirmation === true;
    if (opts.dryRun !== false) addBlocker(result.blockers, 'dry-run-false-required');
    if (!result.reason || result.reason.length < 8) addBlocker(result.blockers, 'explicit-reason-required');
    if (!previewToken) addBlocker(result.blockers, 'preview-token-required');
    if (!Number.isFinite(expectedCount) || Math.floor(expectedCount) !== expectedCount || expectedCount < 0) {
      addBlocker(result.blockers, 'expected-count-required');
    }
    if (!confirmationFlag && confirmationPhrase !== 'CLEAR RESTORED HISTORY') {
      addBlocker(result.blockers, 'restored-history-clear-confirmation-required');
    }
    var last = state.phase6a.lastRestoredHistoryClearPreview;
    if (!last || last.token !== previewToken) addBlocker(result.blockers, 'invalid-preview-token');
    if (last && Date.now() - Number(last.createdAt || 0) > PHASE6A_PURGE_TOKEN_TTL_MS) {
      addBlocker(result.blockers, 'preview-token-expired');
    }
    if (result.blockers.length) {
      result.status = result.blockers[0];
      return result;
    }
    var plan = await buildRecentlyDeletedRestoredHistoryClearPlan({ limit: 1000, reason: result.reason });
    result.beforeCount = plan.beforeCount;
    result.restoredHistoryCandidateCount = plan.restoredHistoryCandidateCount;
    result.candidateCount = plan.candidateCount;
    result.skippedCount = plan.skippedCount;
    result.activeDeletedSkippedCount = plan.activeDeletedSkippedCount;
    result.protectedSkippedCount = plan.protectedSkippedCount;
    result.malformedSkippedCount = plan.malformedSkippedCount;
    result.candidates = plan.candidates;
    result.skipped = plan.skipped;
    if (plan.ok !== true) {
      result.status = plan.status || 'folder-restored-history-clear-preview-failed';
      plan.blockers.forEach(function (code) { addBlocker(result.blockers, code); });
      return result;
    }
    if (plan.restoredHistoryCandidateCount !== expectedCount ||
      plan.restoredHistoryCandidateCount !== last.restoredHistoryCandidateCount) {
      result.status = 'expected-count-mismatch';
      addBlocker(result.blockers, 'expected-count-mismatch');
      return result;
    }
    var currentIds = plan.candidates.map(function (row) { return row.tombstoneId; }).sort();
    var previewIds = last.candidateTombstoneIds.slice().sort();
    if (currentIds.join('\n') !== previewIds.join('\n')) {
      result.status = 'preview-candidate-set-changed';
      addBlocker(result.blockers, 'preview-candidate-set-changed');
      return result;
    }
    if (!currentIds.length) {
      result.ok = true;
      result.status = 'no-restored-history-candidates';
      result.operatorConfirmedHistoryClear = true;
      state.phase6a.lastRestoredHistoryClearCommit = result;
      return result;
    }
    var tombstones = getTombstoneStore();
    if (!tombstones || typeof tombstones.clearRestoredFolderTombstonesByIds !== 'function') {
      result.status = 'restored-history-clear-api-unavailable';
      addBlocker(result.blockers, 'restored-history-clear-api-unavailable');
      return result;
    }
    var clearResult = await tombstones.clearRestoredFolderTombstonesByIds(currentIds, {
      dryRun: false,
      reason: result.reason,
      source: 'desktop-recently-deleted-clear-restored-history',
    });
    result.tombstoneStoreResult = clearResult;
    result.clearedCount = Number(clearResult && clearResult.clearedCount) || 0;
    result.alreadyClearedSkippedCount = Number(clearResult && clearResult.alreadyClearedSkippedCount) || 0;
    if (!clearResult || clearResult.ok !== true) {
      result.status = cleanString(clearResult && clearResult.status) || 'folder-restored-history-clear-failed';
      (Array.isArray(clearResult && clearResult.blockers) ? clearResult.blockers : []).forEach(function (code) {
        addBlocker(result.blockers, code && (code.code || code));
      });
      if (!result.blockers.length) addBlocker(result.blockers, 'folder-restored-history-clear-failed');
      return result;
    }
    result.ok = true;
    result.status = 'folder-restored-history-cleared';
    result.operatorConfirmedHistoryClear = true;
    state.phase6a.lastRestoredHistoryClearPreview = null;
    state.phase6a.lastRestoredHistoryClearCommit = result;
    recordWrite('clearRecentlyDeletedRestoredHistory');
    notifySubscribers({
      source: 'desktop-recently-deleted-clear-restored-history',
      op: 'clearRecentlyDeletedRestoredHistory',
      clearedCount: result.clearedCount,
      noChatDelete: true,
      noSnapshotDelete: true,
    });
    return result;
  }

  async function listRecentlyDeletedFolders(opts) {
    var tombstones = getTombstoneStore();
    var limit = Math.max(1, Math.min(1000, Number(opts && opts.limit) || 500));
    var result = {
      schema: PHASE4D3_RECENTLY_DELETED_SCHEMA,
      phase: 'phase4d.3',
      ok: true,
      status: 'recently-deleted-folders-listed',
      observedAt: new Date().toISOString(),
      tombstoneStoreAvailable: !!(tombstones && typeof tombstones.list === 'function'),
      retentionDays: PHASE4D3_RETENTION_DAYS,
      activeTombstoneCount: 0,
      restoredTombstoneCount: 0,
      folderTombstoneCount: 0,
      activeRetentionCount: 0,
      expiredRetentionCount: 0,
      restoredRetentionCount: 0,
      unknownRetentionCount: 0,
      restoreAvailableCount: 0,
      purgeEligibleCount: 0,
      restoredHistoryClearableCount: 0,
      purgeBlockedCount: 0,
      hardDeleteBlockedCount: 0,
      retentionEnforcement: 'deferred',
      noHardDelete: true,
      noPurge: true,
      noChatDelete: true,
      noSnapshotDelete: true,
      blockers: [],
      warnings: [],
      rows: [],
    };
    if (!result.tombstoneStoreAvailable) {
      addBlocker(result.blockers, 'tombstone-store-unavailable');
      result.ok = false;
      result.status = 'tombstone-store-unavailable';
      return result;
    }
    try {
      var rows = await tombstones.list({ recordKind: 'folder', includeRestored: true, limit: limit });
      result.rows = (Array.isArray(rows) ? rows : [])
        .filter(function (row) { return cleanString(row && row.recordKind) === 'folder'; })
        .map(recentlyDeletedRowFromTombstone);
      var purgePlan = await buildRecentlyDeletedPurgePlan({ limit: limit, reason: 'recently-deleted-diagnostics' });
      var restoredHistoryClearPlan = await buildRecentlyDeletedRestoredHistoryClearPlan({ limit: limit, reason: 'recently-deleted-diagnostics' });
      var purgeCandidateSet = Object.create(null);
      (Array.isArray(purgePlan.candidates) ? purgePlan.candidates : []).forEach(function (candidate) {
        var id = cleanString(candidate && candidate.tombstoneId);
        if (id) purgeCandidateSet[id] = true;
      });
      var restoredHistoryClearCandidateSet = Object.create(null);
      (Array.isArray(restoredHistoryClearPlan.candidates) ? restoredHistoryClearPlan.candidates : []).forEach(function (candidate) {
        var id = cleanString(candidate && candidate.tombstoneId);
        if (id) restoredHistoryClearCandidateSet[id] = true;
      });
      result.rows = result.rows.map(function (row) {
        var tombstoneId = cleanString(row && row.tombstoneId);
        if (restoredHistoryClearCandidateSet[tombstoneId]) {
          row = Object.assign({}, row, {
            restoredHistoryClearable: true,
            restoredHistoryClearBlocked: false,
            restoredHistoryClearReason: 'operator-confirmed-history-clear-available',
          });
        }
        if (!purgeCandidateSet[tombstoneId]) return row;
        return Object.assign({}, row, {
          purgeEligible: true,
          operatorPurgeAvailable: true,
          automaticPurge: false,
          purgeBlocked: true,
          purgeBlockedReason: 'automatic-purge-deferred-operator-confirmation-required',
        });
      });
      result.folderTombstoneCount = result.rows.length;
      result.activeTombstoneCount = result.rows.filter(function (row) { return row.restoreStatus === 'active'; }).length;
      result.restoredTombstoneCount = result.rows.filter(function (row) { return row.restoreStatus === 'restored'; }).length;
      result.activeRetentionCount = result.rows.filter(function (row) { return row.retentionCountdownStatus === 'active'; }).length;
      result.expiredRetentionCount = result.rows.filter(function (row) { return row.retentionCountdownStatus === 'expired'; }).length;
      result.restoredRetentionCount = result.rows.filter(function (row) { return row.retentionCountdownStatus === 'restored'; }).length;
      result.unknownRetentionCount = result.rows.filter(function (row) { return row.retentionCountdownStatus === 'unknown'; }).length;
      result.restoreAvailableCount = result.rows.filter(function (row) { return row.restoreAvailable === true; }).length;
      result.purgeEligibleCount = result.rows.filter(function (row) { return row.purgeEligible === true; }).length;
      result.restoredHistoryClearableCount = result.rows.filter(function (row) { return row.restoredHistoryClearable === true; }).length;
      result.purgeBlockedCount = result.rows.filter(function (row) { return row.purgeBlocked === true; }).length;
      result.hardDeleteBlockedCount = result.rows.filter(function (row) { return row.hardDeleteBlocked === true; }).length;
      result.operatorPurgeAvailableCount = result.purgeEligibleCount;
      result.operatorRestoredHistoryClearAvailableCount = result.restoredHistoryClearableCount;
      result.automaticPurge = false;
      result.automaticPurgeBlocked = true;
      result.operatorPurgeAvailable = result.purgeEligibleCount > 0;
      result.operatorRestoredHistoryClearAvailable = result.restoredHistoryClearableCount > 0;
      result.purgePolicy = 'operator-confirmed-tombstone-recovery-record-purge';
      result.purgePreviewApi = 'previewRecentlyDeletedFolderPurge';
      result.purgeCommitApi = 'purgeRecentlyDeletedFolders';
      result.restoredHistoryClearPolicy = 'operator-confirmed-restored-history-clear';
      result.restoredHistoryClearPreviewApi = 'previewRecentlyDeletedRestoredHistoryClear';
      result.restoredHistoryClearCommitApi = 'clearRecentlyDeletedRestoredHistory';
      result.purgeDiagnostics = {
        schema: PHASE6A_PURGE_PREVIEW_SCHEMA,
        phase: 'phase6a.desktop-folder-purge',
        beforeCount: purgePlan.beforeCount,
        candidateCount: purgePlan.candidateCount,
        skippedCount: purgePlan.skippedCount,
        protectedSkippedCount: purgePlan.protectedSkippedCount,
        activeVisibleSkippedCount: purgePlan.activeVisibleSkippedCount,
        restoredSkippedCount: purgePlan.restoredSkippedCount,
        permanentFolderRowSuppression: true,
        purgedTombstoneCount: 0,
        permanentlyHiddenFolderRowCount: 0,
        purgedFolderRowCount: 0,
        folderRowAlreadyMissingCount: 0,
        folderRowAlreadySuppressedCount: 0,
        chatDeletedCount: 0,
        snapshotDeletedCount: 0,
        assetDeletedCount: 0,
        hardDeletedFolderRowCount: 0,
        receiptDeletedCount: 0,
        desktopOnly: true,
        chromeAuthority: false,
        automaticPurge: false,
      };
      result.restoredHistoryClearDiagnostics = {
        schema: PHASE6A_RESTORED_HISTORY_CLEAR_PREVIEW_SCHEMA,
        phase: 'phase6a.4.desktop-folder-restored-history-clear',
        beforeCount: restoredHistoryClearPlan.beforeCount,
        restoredHistoryCandidateCount: restoredHistoryClearPlan.restoredHistoryCandidateCount,
        candidateCount: restoredHistoryClearPlan.candidateCount,
        skippedCount: restoredHistoryClearPlan.skippedCount,
        activeDeletedSkippedCount: restoredHistoryClearPlan.activeDeletedSkippedCount,
        protectedSkippedCount: restoredHistoryClearPlan.protectedSkippedCount,
        malformedSkippedCount: restoredHistoryClearPlan.malformedSkippedCount,
        clearedCount: 0,
        chatDeletedCount: 0,
        snapshotDeletedCount: 0,
        assetDeletedCount: 0,
        hardDeletedFolderRowCount: 0,
        receiptDeletedCount: 0,
        desktopOnly: true,
        chromeAuthority: false,
      };
      return result;
    } catch (e) {
      recordWarning('Phase4D.3 recently deleted diagnose failed: ' + ((e && e.message) || e));
      result.ok = false;
      result.status = 'recently-deleted-list-failed';
      result.blockers.push('recently-deleted-list-failed');
      result.warnings.push({ code: 'recently-deleted-list-failed' });
      return result;
    }
  }

  function folderPatchFromRecoverySnapshot(snapshot) {
    var recovery = safeMeta(snapshot);
    var folder = safeMeta(recovery.folder);
    var folderId = cleanString(folder.id || folder.folderId);
    if (!folderId) return null;
    var name = cleanString(folder.name || folder.title || folderId);
    var meta = Object.assign({}, safeMeta(folder.meta), {
      name: name,
      updatedAt: new Date().toISOString(),
      phase4aRestored: true,
      phase4aRestoreSource: 'recoverySnapshot',
      materializedUserFolder: true,
      trustedFolderDisplay: true,
      shownInNormalMode: true,
    });
    var patch = {
      folderId: folderId,
      name: name,
      parentId: cleanString(folder.parentId),
      source: cleanString(folder.source || 'desktop-sqlite'),
      meta: meta,
    };
    var color = cleanString(folder.iconColor || folder.color || '');
    if (color) {
      patch.color = color;
      patch.iconColor = color;
    }
    var sortOrder = Number(folder.sortOrder);
    if (Number.isFinite(sortOrder)) patch.sortOrder = sortOrder;
    return patch;
  }

  function folderUpdatedAtIso(folder) {
    var raw = folder && folder.updatedAt;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
      try { return new Date(raw).toISOString(); }
      catch (_) { return null; }
    }
    var clean = cleanString(raw);
    if (!clean) return null;
    var parsed = Date.parse(clean);
    if (!Number.isFinite(parsed)) return null;
    try { return new Date(parsed).toISOString(); }
    catch (_) { return null; }
  }

  async function diagnosePhase4aTombstones() {
    var tombstones = getTombstoneStore();
    var available = !!(tombstones && typeof tombstones.list === 'function');
    var active = [];
    var restored = [];
    if (available) {
      try {
        active = await tombstones.list({ recordKind: 'folder', activeOnly: true, limit: 1000 });
        restored = await tombstones.list({ recordKind: 'folder', restoredOnly: true, limit: 1000 });
      } catch (e) {
        recordWarning('Phase4A tombstone diagnose failed: ' + ((e && e.message) || e));
      }
    }
    state.phase4a.activeTombstoneCount = Array.isArray(active) ? active.length : state.phase4a.activeTombstoneCount;
    state.phase4a.restoreAvailableCount = state.phase4a.activeTombstoneCount;
    state.phase4a.affectedChatCount = (Array.isArray(active) ? active : []).reduce(function (sum, tombstone) {
      return sum + affectedChatCountFromTombstone(tombstone);
    }, 0);
    return {
      phase: PHASE4A_FOLDER_SOFT_DELETE_PHASE,
      tombstoneStoreAvailable: available,
      activeTombstoneCount: Number(state.phase4a.activeTombstoneCount || 0),
      restoreAvailableCount: Number(state.phase4a.restoreAvailableCount || 0),
      affectedChatCount: Number(state.phase4a.affectedChatCount || 0),
      lastAffectedChatCount: Number(state.phase4a.lastAffectedChatCount || 0),
      lastBindingRestoreAttemptedCount: Number(state.phase4a.lastBindingRestoreAttemptedCount || 0),
      lastBindingRestoredCount: Number(state.phase4a.lastBindingRestoredCount || 0),
      lastBindingSkippedCount: Number(state.phase4a.lastBindingSkippedCount || 0),
      lastRestoreWarnings: state.phase4a.lastRestoreWarnings.slice(),
      restoredTombstoneCount: Array.isArray(restored) ? restored.length : null,
      purgeBlocked: true,
      hardDeleteBlocked: true,
      chatDeleteBlocked: true,
      chromeDeleteSync: 'deferred',
      tombstoneSync: 'deferred',
      lastOperationAt: state.phase4a.lastOperationAt,
      lastOperation: state.phase4a.lastOperation,
      lastStatus: state.phase4a.lastStatus,
      lastFolderId: state.phase4a.lastFolderId,
      lastTombstoneId: state.phase4a.lastTombstoneId,
    };
  }

  async function softDeleteEmptyFolder(folderIdInput, opts) {
    var id = getFolderId(folderIdInput);
    var options = opts && typeof opts === 'object' ? opts : {};
    var base = {
      ok: false,
      phase: PHASE4A_FOLDER_SOFT_DELETE_PHASE,
      operation: 'softDeleteEmptyFolder',
      folderId: id || '',
      noHardDelete: true,
      noChatDelete: true,
      crossPlatformSync: 'deferred',
      blockers: [],
    };
    if (!PHASE4A_FOLDER_SOFT_DELETE_ENABLED) {
      addBlocker(base.blockers, 'phase-disabled');
      base.status = 'phase-disabled';
      return base;
    }
    if (!id) {
      addBlocker(base.blockers, 'folder-identity-missing');
      base.status = 'folder-identity-missing';
      return base;
    }
    var tombstones = getTombstoneStore();
    if (!tombstones || typeof tombstones.createTombstone !== 'function' ||
        typeof tombstones.getTombstone !== 'function') {
      addBlocker(base.blockers, 'tombstone-store-unavailable');
      base.status = 'tombstone-store-unavailable';
      setPhase4aState('softDeleteEmptyFolder', base.status, id, '', 0);
      return base;
    }
    try {
      var folder = await getById(id);
      if (!folder) {
        addBlocker(base.blockers, 'folder-identity-missing');
        base.status = 'folder-identity-missing';
        setPhase4aState('softDeleteEmptyFolder', base.status, id, '', 0);
        return base;
      }
      folderPhase4aBlockers(folder, id).forEach(function (code) { addBlocker(base.blockers, code); });
      var existingTombstone = await getActiveFolderTombstone(id);
      if (existingTombstone) addBlocker(base.blockers, 'already-tombstoned');
      var bindingRead = await readFolderBindingsForRemoveSafely(id);
      if (!bindingRead || bindingRead.ok !== true) addBlocker(base.blockers, 'binding-capture-failed');
      var bindingRows = bindingRead && Array.isArray(bindingRead.bindings) ? bindingRead.bindings : [];
      var bindingCount = bindingRows.length;
      var knownRowCount = countKnownRowsForFolder(id);
      if (base.blockers.length) {
        base.status = base.blockers[0];
        base.bindingCount = bindingCount;
        base.knownRowCount = knownRowCount;
        base.affectedChatCount = bindingCount;
        setPhase4aState('softDeleteEmptyFolder', base.status, id, existingTombstone && existingTombstone.tombstoneId, 0);
        return base;
      }
      var recoverySnapshot = buildFolderRecoverySnapshot(folder, {
        bindingCount: bindingCount,
        knownRowCount: knownRowCount,
        bindingCaptureOk: bindingRead && bindingRead.ok === true,
        bindings: bindingRows,
      });
      var priorDigest = await sha256Hex(recoverySnapshot);
      var tombstone = await tombstones.createTombstone({
        recordKind: 'folder',
        recordId: folderTombstoneRecordId(id),
        deleteReason: cleanString(options.deleteReason) || (bindingCount > 0 ? 'desktop-local-folder-with-chats-soft-delete' : 'desktop-local-empty-folder-soft-delete'),
        deletedBySyncPeerId: cleanString(options.deletedBySyncPeerId) || 'desktop-local-phase4a',
        priorDigest: priorDigest || null,
        priorUpdatedAt: folderUpdatedAtIso(folder),
        meta: {
          phase: PHASE4A_FOLDER_SOFT_DELETE_PHASE,
          lifecycleState: 'tombstoned',
          localOnly: true,
          crossPlatformSync: 'deferred',
          hardDelete: false,
          purgeBlocked: true,
          noChatDelete: true,
          bindingCount: bindingCount,
          affectedChatCount: bindingCount,
          bindingCaptureOk: true,
          recoverySnapshot: recoverySnapshot,
        },
      });
      var unbindResult = await unbindSnapshotBindingsForSoftDelete(id, recoverySnapshot.bindings);
      var mirror = await removeFolderFromStateMirror(id, tombstone && tombstone.tombstoneId);
      recordWrite('softDeleteEmptyFolder');
      setPhase4aState('softDeleteEmptyFolder', 'folder-soft-deleted', id, tombstone && tombstone.tombstoneId, 1);
      setPhase4bBindingState({
        affectedChatCount: bindingCount,
        activeAffectedChatCountDelta: bindingCount,
        bindingRestoreAttemptedCount: 0,
        bindingRestoredCount: 0,
        bindingSkippedCount: 0,
        restoreWarnings: [],
      });
      notifySubscribers({
        source: PHASE4A_FOLDER_SOFT_DELETE_PHASE,
        op: 'softDeleteEmptyFolder',
        folderId: id,
        tombstoneId: tombstone && tombstone.tombstoneId,
        syncPropagation: 'deferred',
      });
      return Object.assign({}, base, {
        ok: true,
        status: 'folder-soft-deleted',
        tombstoneId: tombstone && tombstone.tombstoneId,
        bindingCount: bindingCount,
        knownRowCount: knownRowCount,
        affectedChatCount: bindingCount,
        bindingSnapshotCount: recoverySnapshot.bindings.length,
        bindingUnbindAttemptedCount: unbindResult.attemptedCount,
        bindingUnboundCount: unbindResult.unboundCount,
        bindingUnbindSkippedCount: unbindResult.skippedCount,
        bindingUnbindWarnings: unbindResult.warnings,
        recoverySnapshot: recoverySnapshot,
        folderStateMirror: mirror,
        noHardDelete: true,
        noChatDelete: true,
        blockers: [],
      });
    } catch (e) {
      recordError('softDeleteEmptyFolder', e);
      base.status = 'error';
      base.reason = String((e && e.message) || e);
      setPhase4aState('softDeleteEmptyFolder', base.status, id, '', 0);
      return base;
    }
  }

  async function resolveFolderTombstone(input, opts) {
    var tombstones = getTombstoneStore();
    if (!tombstones) return null;
    var includeRestored = opts && opts.includeRestored === true;
    var value = cleanString(input && (input.tombstoneId || input.folderId || input.id || input));
    if (!value) return null;
    if (value.indexOf('tombstone:') === 0 && typeof tombstones.getById === 'function') {
      var direct = await tombstones.getById(value);
      if (direct && (!cleanString(direct.restoredAt) || includeRestored)) return direct;
    }
    if (typeof tombstones.getTombstone === 'function') {
      return tombstones.getTombstone('folder', folderTombstoneRecordId(value));
    }
    return null;
  }

  async function restoreTombstonedFolder(input, opts) {
    var options = opts && typeof opts === 'object' ? opts : {};
    var tombstones = getTombstoneStore();
    var base = {
      ok: false,
      phase: PHASE4A_FOLDER_SOFT_DELETE_PHASE,
      operation: 'restoreTombstonedFolder',
      noHardDelete: true,
      noChatDelete: true,
      crossPlatformSync: 'deferred',
      blockers: [],
    };
    if (!tombstones || typeof tombstones.markRestored !== 'function') {
      addBlocker(base.blockers, 'tombstone-store-unavailable');
      base.status = 'tombstone-store-unavailable';
      return base;
    }
    try {
      var tombstone = await resolveFolderTombstone(input, { includeRestored: true });
      if (!tombstone) {
        addBlocker(base.blockers, 'folder-identity-missing');
        base.status = 'folder-identity-missing';
        return base;
      }
      var meta = tombstoneMeta(tombstone);
      var recoverySnapshot = safeMeta(meta.recoverySnapshot);
      var patch = folderPatchFromRecoverySnapshot(recoverySnapshot);
      if (!patch || !patch.folderId) {
        var recoveredFolderId = folderIdFromTombstone(tombstone);
        var recoveredRow = recoveredFolderId ? await getById(recoveredFolderId) : null;
        if (recoveredRow && cleanString(tombstone.restoredAt)) {
          var recoveredBindingResult = await restoreBindingsFromRecoverySnapshot(recoveredFolderId, recoverySnapshot);
          return Object.assign({}, base, {
            ok: true,
            status: 'folder-restored',
            folderId: recoveredFolderId,
            tombstoneId: tombstone.tombstoneId,
            row: recoveredRow,
            tombstone: tombstone,
            alreadyRestored: true,
            bindingRestoreAttemptedCount: recoveredBindingResult.bindingRestoreAttemptedCount,
            bindingRestoredCount: recoveredBindingResult.bindingRestoredCount,
            bindingSkippedCount: recoveredBindingResult.bindingSkippedCount,
            restoreWarnings: recoveredBindingResult.restoreWarnings,
            warnings: ['already-restored'],
            blockers: [],
          });
        }
        addBlocker(base.blockers, 'folder-identity-missing');
        base.status = 'folder-identity-missing';
        return base;
      }
      if (cleanString(tombstone.restoredAt)) {
        var alreadyRow = await getById(patch.folderId);
        if (alreadyRow) {
          var alreadyBindingResult = await restoreBindingsFromRecoverySnapshot(patch.folderId, recoverySnapshot);
          return Object.assign({}, base, {
            ok: true,
            status: 'folder-restored',
            folderId: patch.folderId,
            tombstoneId: tombstone.tombstoneId,
            row: alreadyRow,
            tombstone: tombstone,
            alreadyRestored: true,
            bindingRestoreAttemptedCount: alreadyBindingResult.bindingRestoreAttemptedCount,
            bindingRestoredCount: alreadyBindingResult.bindingRestoredCount,
            bindingSkippedCount: alreadyBindingResult.bindingSkippedCount,
            restoreWarnings: alreadyBindingResult.restoreWarnings,
            warnings: ['already-restored'],
            blockers: [],
          });
        }
      }
      var row = await upsertCore(patch, { generateId: false });
      var mirror = await restoreFolderToStateMirror(recoverySnapshot);
      var verifiedRow = await getById(patch.folderId);
      if (!verifiedRow) {
        addBlocker(base.blockers, 'folder-identity-missing');
        base.status = 'folder-identity-missing';
        return base;
      }
      var bindingRestore = await restoreBindingsFromRecoverySnapshot(patch.folderId, recoverySnapshot);
      var restored = await tombstones.markRestored(
        tombstone.tombstoneId,
        cleanString(options.restoredBySyncPeerId) || 'desktop-local-phase4a'
      );
      recordWrite('restoreTombstonedFolder');
      setPhase4aState('restoreTombstonedFolder', 'folder-restored', patch.folderId, tombstone.tombstoneId, -1);
      setPhase4bBindingState({
        activeAffectedChatCountDelta: -bindingRestore.bindingRestoreAttemptedCount,
      });
      notifySubscribers({
        source: PHASE4A_FOLDER_SOFT_DELETE_PHASE,
        op: 'restoreTombstonedFolder',
        folderId: patch.folderId,
        tombstoneId: tombstone.tombstoneId,
        syncPropagation: 'deferred',
      });
      return Object.assign({}, base, {
        ok: true,
        status: 'folder-restored',
        folderId: patch.folderId,
        tombstoneId: tombstone.tombstoneId,
        row: verifiedRow || row,
        tombstone: restored,
        folderStateMirror: mirror,
        bindingRestoreAttemptedCount: bindingRestore.bindingRestoreAttemptedCount,
        bindingRestoredCount: bindingRestore.bindingRestoredCount,
        bindingSkippedCount: bindingRestore.bindingSkippedCount,
        restoreWarnings: bindingRestore.restoreWarnings,
        blockers: [],
      });
    } catch (e) {
      recordError('restoreTombstonedFolder', e);
      base.status = 'error';
      base.reason = String((e && e.message) || e);
      return base;
    }
  }

  function remove(folderIdInput) {
    var id = getFolderId(folderIdInput);
    if (!id) return Promise.resolve(false);
    /* Delete bindings first so a partial failure doesn't leave orphan binding
     * rows pointing at a missing folder. The folder row delete is the
     * authoritative success indicator. */
    return Promise.all([
      readFolderForRemoveSafely(id),
      readFolderBindingsForRemoveSafely(id),
    ]).then(function (pre) {
      var folder = pre[0];
      var bindingRead = pre[1] || { ok: false, bindings: [] };
      return executeFolderBindingsLegacyFallback(
        'DELETE FROM folder_bindings WHERE folder_id = ?',
        [id],
        'store.folders.remove'
      )
        .then(function () {
          return sqlExecute('DELETE FROM folders WHERE id = ?', [id]);
        })
        .then(function (result) {
          var ok = readRowsAffected(result) > 0;
          if (ok) {
            recordWrite('remove');
            notifySubscribers({ source: 'local', op: 'remove', folderId: id });
            return writeFolderRemoveTombstonesSafely(id, folder, bindingRead.bindings, bindingRead.ok)
              .then(function () { return true; });
          }
          return false;
        });
    })
      .catch(function (e) { recordError('remove', e); return false; });
  }

  /* ── Bindings ─────────────────────────────────────────────────────── */
  /* folder_bindings.PRIMARY KEY (chat_id) enforces one folder per chat in V1.
   * INSERT OR REPLACE handles the "move chat to a different folder" case
   * atomically — the prior binding (any folder) is replaced. */
  function bindChatLegacy(folderIdInput, chatIdInput, opts) {
    var folderId = getFolderId(folderIdInput);
    var chatId = String(chatIdInput || '').trim();
    if (!folderId) return Promise.reject(new Error('bindChat: folderId required'));
    if (!chatId) return Promise.reject(new Error('bindChat: chatId required'));
    var assignedAt = (opts && typeof opts.assignedAt === 'number' && opts.assignedAt > 0)
      ? opts.assignedAt : Date.now();
    return readFolderBindingForChatSafely(chatId).then(function (previous) {
      return executeFolderBindingsLegacyFallback(
        'INSERT OR REPLACE INTO folder_bindings (chat_id, folder_id, assigned_at) VALUES (?, ?, ?)',
        [chatId, folderId, assignedAt],
        'store.folders.bindChat'
      ).then(function () {
        recordWrite('bindChat');
        notifySubscribers({ source: 'local', op: 'bindChat', folderId: folderId, chatId: chatId });
        if (!previous || !previous.folderId || previous.folderId === folderId) return true;
        return writeFolderBindingTombstoneSafely(previous.folderId, chatId, {
          deleteReason: 'folder-rebind',
          meta: {
            chatId: chatId,
            folderId: previous.folderId,
            oldFolderId: previous.folderId,
            newFolderId: folderId,
            assignedAt: previous.assignedAt,
            recordIdFormat: F5D_FOLDER_BINDING_RECORD_ID_FORMAT,
            source: 'store.folders.bindChat',
            replacement: true,
          },
        }).then(function () { return true; });
      });
    }).catch(function (e) { recordError('bindChat', e); return false; });
  }

  function unbindChatLegacy(folderIdInput, chatIdInput, opts) {
    var folderId = getFolderId(folderIdInput);
    var chatId = String(chatIdInput || '').trim();
    var options = opts && typeof opts === 'object' ? opts : {};
    var skipBindingTombstone = options.skipBindingTombstone === true || options.smokeSkipBindingTombstone === true;
    if (!folderId || !chatId) return Promise.resolve(false);
    return executeFolderBindingsLegacyFallback(
      'DELETE FROM folder_bindings WHERE chat_id = ? AND folder_id = ?',
      [chatId, folderId],
      'store.folders.unbindChat'
    ).then(function (result) {
      var ok = readRowsAffected(result) > 0;
      if (ok) {
        recordWrite('unbindChat');
        notifySubscribers({ source: 'local', op: 'unbindChat', folderId: folderId, chatId: chatId });
        if (skipBindingTombstone) return true;
        return writeFolderBindingTombstoneSafely(folderId, chatId).then(function () { return true; });
      }
      return false;
    }).catch(function (e) { recordError('unbindChat', e); return false; });
  }

  function bindChat(folderIdInput, chatIdInput, opts) {
    var folderId = getFolderId(folderIdInput);
    var chatId = String(chatIdInput || '').trim();
    if (!folderId) return Promise.reject(new Error('bindChat: folderId required'));
    if (!chatId) return Promise.reject(new Error('bindChat: chatId required'));
    return getActiveFolderTombstone(folderId).then(function (activeTombstone) {
      if (activeTombstone && !(opts && opts.allowTombstonedFolderRebind === true)) {
        api.__lastFolderBindingBlocked = {
          ok: false,
          code: 'folder-tombstoned',
          folderId: folderId,
          chatId: chatId,
          tombstoneId: activeTombstone.tombstoneId,
        };
        recordWarning('bindChat blocked: folder-tombstoned');
        return false;
      }
      if (!f15FolderBindingDelegationEnabled(opts)) {
        return bindChatLegacy(folderId, chatId, opts);
      }
      return delegateF15FolderBindingWrite('bind', folderId, chatId, opts).then(function (result) {
        if (result && result.ok === true) {
          return materializeSettledCanonicalChatFolderBinding('bind', folderId, chatId, opts, result)
            .then(function (materialization) {
              result.materialization = materialization;
              api.__lastF15FolderBindingDelegationResult = result;
              if (!materialization || materialization.ok !== true) {
                recordWarning('bindChat F15 settled materialization failed: ' + JSON.stringify((materialization && materialization.blockers) || ['unknown']));
                return false;
              }
              recordWrite('bindChat.f15');
              recordWrite('bindChat.f15.materialized');
              notifySubscribers({ source: 'local', op: 'bindChat', folderId: folderId, chatId: chatId, f15Delegated: true, f15Materialized: true });
              return true;
            });
        }
        recordWarning('bindChat F15 delegation failed: ' + JSON.stringify((result && result.blockers) || ['unknown']));
        api.__lastF15FolderBindingDelegationResult = result || null;
        if (explicitF7FallbackAllowed(opts)) {
          recordWarning('bindChat explicit F7 fallback after F15 delegation failure');
          return bindChatLegacy(folderId, chatId, opts);
        }
        return false;
      }).catch(function (e) {
        recordError('bindChat.f15', e);
        if (explicitF7FallbackAllowed(opts)) {
          recordWarning('bindChat explicit F7 fallback after F15 delegation exception');
          return bindChatLegacy(folderId, chatId, opts);
        }
        return false;
      });
    });
  }

  function unbindChat(folderIdInput, chatIdInput, opts) {
    var folderId = getFolderId(folderIdInput);
    var chatId = String(chatIdInput || '').trim();
    if (!folderId || !chatId) return Promise.resolve(false);
    if (!f15FolderBindingDelegationEnabled(opts)) {
      return unbindChatLegacy(folderId, chatId, opts);
    }
    return delegateF15FolderBindingWrite('unbind', folderId, chatId, opts).then(function (result) {
      if (result && result.ok === true) {
        return materializeSettledCanonicalChatFolderBinding('unbind', folderId, chatId, opts, result)
          .then(function (materialization) {
            result.materialization = materialization;
            api.__lastF15FolderBindingDelegationResult = result;
            if (!materialization || materialization.ok !== true) {
              recordWarning('unbindChat F15 settled materialization failed: ' + JSON.stringify((materialization && materialization.blockers) || ['unknown']));
              return false;
            }
            recordWrite('unbindChat.f15');
            recordWrite('unbindChat.f15.materialized');
            notifySubscribers({ source: 'local', op: 'unbindChat', folderId: folderId, chatId: chatId, f15Delegated: true, f15Materialized: true });
            return true;
          });
      }
      recordWarning('unbindChat F15 delegation failed: ' + JSON.stringify((result && result.blockers) || ['unknown']));
      api.__lastF15FolderBindingDelegationResult = result || null;
      if (explicitF7FallbackAllowed(opts)) {
        recordWarning('unbindChat explicit F7 fallback after F15 delegation failure');
        return unbindChatLegacy(folderId, chatId);
      }
      return false;
    }).catch(function (e) {
      recordError('unbindChat.f15', e);
      if (explicitF7FallbackAllowed(opts)) {
        recordWarning('unbindChat explicit F7 fallback after F15 delegation exception');
        return unbindChatLegacy(folderId, chatId);
      }
      return false;
    });
  }

  /* listChats(folderId): hydrate full chat rows via store.chats so the chat
   * row projector lives in one place. Returns [] if store.chats is missing
   * (defensive — both stores ship in the same Desktop bundle, but rather
   * fail soft than throw). */
  function listChats(folderIdInput) {
    var folderId = getFolderId(folderIdInput);
    if (!folderId) return Promise.resolve([]);
    return sqlSelect(
      'SELECT chat_id FROM folder_bindings WHERE folder_id = ? ORDER BY assigned_at DESC',
      [folderId]
    ).then(function (rows) {
      var chatIds = (rows || []).map(function (r) { return r && r.chat_id; }).filter(function (id) { return !!id; });
      if (chatIds.length === 0) return [];
      var chatsStore = (H2O.Studio.store && H2O.Studio.store.chats) || null;
      if (!chatsStore || typeof chatsStore.get !== 'function') {
        recordWarning('listChats: H2O.Studio.store.chats unavailable; returning empty');
        return [];
      }
      return Promise.all(chatIds.map(function (cid) { return chatsStore.get(cid); }))
        .then(function (arr) { return arr.filter(function (c) { return c != null; }); });
    }).catch(function (e) { recordError('listChats', e); return []; });
  }

  function listCanonicalChatFolderBindings() {
    return sqlSelect(
      'SELECT b.chat_id AS chat_id, b.folder_id AS folder_id, b.assigned_at AS assigned_at, f.name AS folder_name ' +
      'FROM folder_bindings b LEFT JOIN folders f ON f.id = b.folder_id ' +
      'ORDER BY b.folder_id ASC, b.chat_id ASC',
      []
    ).then(function (rows) {
      return (Array.isArray(rows) ? rows : []).map(function (row) {
        var chatId = cleanString(row && row.chat_id);
        var folderId = cleanString(row && row.folder_id);
        if (!chatId || !folderId) return null;
        return {
          chatId: chatId,
          conversationId: chatId,
          folderId: folderId,
          folderName: cleanString(row && row.folder_name),
          assignedAt: row && row.assigned_at,
          source: 'desktop-canonical-folder-bindings-sqlite',
          sourceSurface: 'desktop-studio',
          authority: 'desktop',
          status: 'active',
          state: 'active',
          noChromeDestructiveBindingApply: true,
          noChatDelete: true,
          noSnapshotDelete: true,
          noHardDelete: true,
          noPurge: true,
        };
      }).filter(Boolean);
    }).catch(function (e) {
      recordError('listCanonicalChatFolderBindings', e);
      return [];
    });
  }

  function canonicalBindingStoreIdentity() {
    var sqliteStatus = null;
    try {
      var platform = H2O && H2O.Studio && H2O.Studio.platform;
      sqliteStatus = platform && typeof platform.__sqliteStatus === 'function'
        ? platform.__sqliteStatus()
        : null;
    } catch (_) { sqliteStatus = null; }
    return {
      adapter: 'store.folders.tauri',
      dbUrl: DB_URL,
      tableName: 'folder_bindings',
      readerFunction: 'listCanonicalChatFolderBindings',
      rowReaderFunction: 'getCanonicalChatFolderBindingForChat',
      rowListReaderFunction: 'listCanonicalChatFolderBindingsForChat',
      writerFunction: 'moveCanonicalChatFolderBinding',
      countSource: 'sqlite:folder_bindings',
      storeReady: state.ready === true,
      lastReloadedAt: state.lastReloadedAt,
      lastWriteAt: state.lastWriteAt,
      writesSinceBoot: state.writesSinceBoot,
      sqliteStatus: sqliteStatus,
      noChromeDestructiveBindingApply: true,
      noChatDelete: true,
      noSnapshotDelete: true,
      noHardDelete: true,
      noPurge: true,
    };
  }

  function getCanonicalChatFolderBindingForChat(chatIdInput) {
    var chatId = cleanString(chatIdInput);
    if (!chatId) return Promise.resolve(null);
    return listCanonicalChatFolderBindingsForChat(chatId).then(function (rows) {
      return Array.isArray(rows) && rows.length ? rows[0] : null;
    });
  }

  function listCanonicalChatFolderBindingsForChat(chatIdInput) {
    var chatId = cleanString(chatIdInput);
    if (!chatId) return Promise.resolve([]);
    return sqlSelect(
      'SELECT b.chat_id AS chat_id, b.folder_id AS folder_id, b.assigned_at AS assigned_at, f.name AS folder_name ' +
      'FROM folder_bindings b LEFT JOIN folders f ON f.id = b.folder_id ' +
      'WHERE b.chat_id = ? ORDER BY b.assigned_at DESC, b.folder_id ASC',
      [chatId]
    ).then(function (rows) {
      if (!Array.isArray(rows) || !rows.length) return [];
      return rows.map(function (row) {
        var folderId = cleanString(row && row.folder_id);
        if (!folderId) return null;
        return {
          chatId: cleanString(row && row.chat_id),
          conversationId: cleanString(row && row.chat_id),
          folderId: folderId,
          folderName: cleanString(row && row.folder_name),
          assignedAt: row && row.assigned_at,
          source: 'desktop-canonical-folder-bindings-sqlite',
          sourceSurface: 'desktop-studio',
          authority: 'desktop',
          status: 'active',
          state: 'active',
          storeIdentity: canonicalBindingStoreIdentity(),
        };
      }).filter(Boolean);
    }).catch(function (e) {
      recordError('listCanonicalChatFolderBindingsForChat', e);
      return [];
    });
  }

  /* Binding durable-persistence confirmation (detection + safe-fail hardening; NOT a persistence fix).
   * The durable-confirmation surface for the repair path's canonical binding writes
   * (moveCanonicalChatFolderBinding / bindChat / unbindChat): it performs a best-effort JS-reachable SQLite
   * persistence fence (WAL checkpoint TRUNCATE), then a FRESH canonical re-read via the reader the sync
   * handler trusts (listCanonicalChatFolderBindings), and — when the caller injects its row-hash convention +
   * expected hash — reports whether the durably-fenced canonical state matches the requested hash. It NEVER
   * claims durable:true without a confirmed fence: if a checkpoint cannot be confirmed it returns
   * durable:false / unverifiable:true so the caller safe-fails. It does NOT rewrite transactions, does NOT
   * change binding SQL, and does NOT route through the Rust writer identity. */
  function bindingCheckpointRowParse(raw) {
    // PRAGMA wal_checkpoint returns a single row (busy, log, checkpointed) — object-keyed or positional.
    var rows = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.rows) ? raw.rows : (raw != null ? [raw] : []));
    var row = rows.length ? rows[0] : null;
    var out = { present: !!row, busy: null, log: null, checkpointed: null };
    if (!row) return out;
    if (Array.isArray(row)) {
      if (row.length > 0) out.busy = Number(row[0]);
      if (row.length > 1) out.log = Number(row[1]);
      if (row.length > 2) out.checkpointed = Number(row[2]);
    } else if (typeof row === 'object') {
      var has = function (k) { return Object.prototype.hasOwnProperty.call(row, k); };
      out.busy = has('busy') ? Number(row.busy) : null;
      out.log = has('log') ? Number(row.log) : null;
      out.checkpointed = has('checkpointed') ? Number(row.checkpointed) : null;
      var keys = Object.keys(row);
      if (out.busy === null && keys.length >= 1) out.busy = Number(row[keys[0]]);
      if (out.log === null && keys.length >= 2) out.log = Number(row[keys[1]]);
      if (out.checkpointed === null && keys.length >= 3) out.checkpointed = Number(row[keys[2]]);
    }
    return out;
  }
  async function bindingDurablePersistenceFence() {
    // Busy-aware WAL checkpoint fence. PREFER the select path — it returns the (busy, log, checkpointed) row so
    // the checkpoint can be INSPECTED. A non-throwing checkpoint is NOT enough: busy===1 means the checkpoint
    // was blocked/incomplete. The execute path is insufficient (it returns execute-metadata, not the checkpoint
    // columns), so an execute-only result is UNVERIFIABLE, never durable. Uncertainty never becomes durable.
    var fence = { ok: false, via: 'none', busy: null, log: null, checkpointed: null, interpretation: 'unavailable', durable: false, error: '' };
    var selRaw = null; var selThrew = false;
    try { selRaw = await sqlSelect('PRAGMA wal_checkpoint(TRUNCATE)', []); }
    catch (e) { selThrew = true; fence.error = String((e && e.message) || e); }
    if (!selThrew) {
      fence.ok = true; fence.via = 'select';
      var parsed = bindingCheckpointRowParse(selRaw);
      fence.busy = parsed.busy; fence.log = parsed.log; fence.checkpointed = parsed.checkpointed;
      if (parsed.busy === 1) {
        fence.interpretation = 'busy-incomplete'; fence.durable = false;               // checkpoint blocked
      } else if (parsed.log === -1 && parsed.checkpointed === -1) {
        fence.interpretation = 'non-wal-no-checkpoint-needed'; fence.durable = true;    // rollback-journal autocommit already durable
      } else if (parsed.busy === 0 &&
          Number.isFinite(parsed.log) && Number.isFinite(parsed.checkpointed) &&
          parsed.log >= 0 && parsed.checkpointed >= 0 && parsed.log === parsed.checkpointed) {
        fence.interpretation = 'checkpoint-confirmed'; fence.durable = true;            // WAL frames fully checkpointed
      } else if (parsed.busy === 0) {
        fence.interpretation = 'checkpoint-not-fully-merged'; fence.durable = false;    // no busy flag, but merge is not proven
      } else {
        fence.interpretation = 'unverifiable'; fence.durable = false;                   // present but unparseable busy column
      }
      return fence;
    }
    // select unavailable: probe execute only for reachability, but it CANNOT confirm durability (no columns).
    try {
      await sqlExecute('PRAGMA wal_checkpoint(TRUNCATE)', []);
      fence.ok = true; fence.via = 'execute'; fence.interpretation = 'unverifiable'; fence.durable = false;
    } catch (e2) {
      fence.ok = false; fence.via = 'none'; fence.interpretation = 'unavailable'; fence.durable = false;
      fence.error = fence.error || String((e2 && e2.message) || e2);
    }
    return fence;
  }
  async function confirmCanonicalChatFolderBindingDurable(opts) {
    var options = opts && typeof opts === 'object' ? opts : {};
    var identity = canonicalBindingStoreIdentity();
    var result = {
      durable: false,
      unverifiable: true,
      method: '',
      canonicalBindingHash: '',
      matchesRequested: false,
      checkpointed: false,
      storeIdentity: identity,
      reason: '',
      rows: [],
    };
    try {
      var fence = await bindingDurablePersistenceFence();
      // A CONFIRMED fence (busy===0 checkpoint, or non-WAL no-checkpoint-needed) — not merely non-throwing.
      result.checkpointed = fence && fence.durable === true;
      result.fenceInterpretation = fence ? fence.interpretation : 'unavailable';
      result.checkpointBusy = fence ? fence.busy : null;
      result.checkpointLog = fence ? fence.log : null;
      result.checkpointFrames = fence ? fence.checkpointed : null;
      result.method = (fence && fence.via ? ('wal_checkpoint(TRUNCATE):' + fence.via) : 'wal_checkpoint-unavailable') + '+fresh-canonical-reread';
      // Fresh canonical re-read AFTER the fence, via the reader the handler trusts (direct SQL; no cache).
      var rows = await listCanonicalChatFolderBindings();
      result.rows = Array.isArray(rows) ? rows : [];
      if (typeof options.hashRows === 'function') {
        try { result.canonicalBindingHash = cleanString(await options.hashRows(result.rows)); }
        catch (eh) { result.canonicalBindingHash = ''; }
        var reqHash = cleanString(options.requestedBindingHash);
        result.matchesRequested = !!result.canonicalBindingHash && !!reqHash && result.canonicalBindingHash === reqHash;
      }
      // Durable ONLY if the fence confirmed durability AND the fresh canonical re-read equals the requested
      // binding hash. A checkpointed-but-mismatched state is a verified failure, not a durable success.
      if (fence && fence.durable === true && result.matchesRequested === true) {
        result.durable = true;
        result.unverifiable = false;
        result.reason = fence.interpretation; // 'checkpoint-confirmed' | 'non-wal-no-checkpoint-needed'
      } else if (fence && fence.durable === true && result.matchesRequested !== true) {
        result.durable = false;
        result.unverifiable = false;
        result.reason = result.canonicalBindingHash
          ? 'fresh-canonical-hash-mismatch-not-durable'
          : 'fresh-canonical-hash-unavailable-not-durable';
      } else {
        result.durable = false;
        result.unverifiable = true;
        result.reason = (fence && fence.interpretation) || 'durability-fence-unavailable-js-only';
      }
      return result;
    } catch (e) {
      result.durable = false;
      result.unverifiable = true;
      result.reason = 'durable-confirmation-threw:' + String((e && e.message) || e);
      return result;
    }
  }

  function moveCanonicalChatFolderBinding(folderIdInput, chatIdInput, opts) {
    var folderId = getFolderId(folderIdInput);
    var chatId = cleanString(chatIdInput);
    var options = opts && typeof opts === 'object' ? opts : {};
    var expectedCurrentFolderId = getFolderId(options.expectedCurrentFolderId || options.fromFolderId || options.currentFolderId);
    var reason = cleanString(options.reason);
    var assignedAt = (typeof options.assignedAt === 'number' && options.assignedAt > 0)
      ? options.assignedAt
      : Date.now();
    var skipBindingTombstone = options.skipBindingTombstone === true || options.smokeSkipBindingTombstone === true;
    var suppressBindingSubscribers = options.suppressBindingSubscribers === true || options.smokeSuppressBindingSubscribers === true;
    var stabilityCheckMs = (typeof options.stabilityCheckMs === 'number' && options.stabilityCheckMs >= 0)
      ? Math.min(500, options.stabilityCheckMs)
      : 75;
    var identity = canonicalBindingStoreIdentity();
    var blockers = [];
    if (!folderId) blockers.push('target-folder-id-required');
    if (!chatId) blockers.push('chat-id-required');
    if (!expectedCurrentFolderId) blockers.push('expected-current-folder-id-required');
    if (!reason || reason.length < 8) blockers.push('explicit-reason-required');
    if (blockers.length) {
      return Promise.resolve({
        ok: false,
        status: blockers[0],
        blockers: blockers,
        warnings: [],
        storeIdentity: identity,
        noChromeDestructiveBindingApply: true,
        noChatDelete: true,
        noSnapshotDelete: true,
        noHardDelete: true,
        noPurge: true,
      });
    }
    return getById(folderId).then(function (targetFolder) {
      if (!targetFolder) {
        return {
          ok: false,
          status: 'target-folder-missing',
          blockers: ['target-folder-missing'],
          warnings: [],
          targetFolderId: folderId,
          storeIdentity: identity,
          noChromeDestructiveBindingApply: true,
          noChatDelete: true,
          noSnapshotDelete: true,
          noHardDelete: true,
          noPurge: true,
        };
      }
      return listCanonicalChatFolderBindingsForChat(chatId).then(function (beforeRows) {
        var before = Array.isArray(beforeRows) && beforeRows.length ? beforeRows[0] : null;
        var beforeFolderId = getFolderId(before);
        var beforeDuplicateCount = Math.max(0, (Array.isArray(beforeRows) ? beforeRows.length : 0) - 1);
        if (beforeFolderId !== expectedCurrentFolderId) {
          return {
            ok: false,
            status: 'expected-current-folder-mismatch',
            blockers: ['expected-current-folder-mismatch'],
            warnings: [],
            chatId: chatId,
            expectedCurrentFolderId: expectedCurrentFolderId,
            actualCurrentFolderId: beforeFolderId || '',
            beforeBinding: before,
            canonicalRowsForChatCount: Array.isArray(beforeRows) ? beforeRows.length : 0,
            canonicalRowsForChat: beforeRows || [],
            duplicateCanonicalBindingRowsForChatCount: beforeDuplicateCount,
            duplicateCanonicalBindingRowsForChatBlocked: beforeDuplicateCount > 0,
            storeIdentity: identity,
            noChromeDestructiveBindingApply: true,
            noChatDelete: true,
            noSnapshotDelete: true,
            noHardDelete: true,
            noPurge: true,
          };
        }
        if (beforeFolderId === folderId) {
          return listCanonicalChatFolderBindingsForChat(chatId).then(function (afterSameRows) {
            var afterSame = Array.isArray(afterSameRows) && afterSameRows.length ? afterSameRows[0] : null;
            var afterSameDuplicateCount = Math.max(0, (Array.isArray(afterSameRows) ? afterSameRows.length : 0) - 1);
            return {
              ok: true,
              status: 'chat-folder-binding-already-targeted',
              blockers: [],
              warnings: [],
              changed: false,
              chatId: chatId,
              targetFolderId: folderId,
              expectedCurrentFolderId: expectedCurrentFolderId,
              beforeBinding: before,
              afterBinding: afterSame,
              canonicalRowsForChatCount: Array.isArray(afterSameRows) ? afterSameRows.length : 0,
              canonicalRowsForChat: afterSameRows || [],
              duplicateCanonicalBindingRowsForChatCount: afterSameDuplicateCount,
              duplicateCanonicalBindingRowsForChatBlocked: afterSameDuplicateCount > 0,
              rowsAffected: 0,
              writeResult: null,
              storeIdentity: canonicalBindingStoreIdentity(),
              sameLiveCanonicalStore: true,
              noChromeDestructiveBindingApply: true,
              noChatDelete: true,
              noSnapshotDelete: true,
              noHardDelete: true,
              noPurge: true,
            };
          });
        }
        return sqlExecute(
          'INSERT OR REPLACE INTO folder_bindings (chat_id, folder_id, assigned_at) VALUES (?, ?, ?)',
          [chatId, folderId, assignedAt]
        ).then(function (writeResult) {
          return listCanonicalChatFolderBindingsForChat(chatId).then(function (afterRows) {
            var after = Array.isArray(afterRows) && afterRows.length ? afterRows[0] : null;
            var afterFolderId = getFolderId(after);
            var duplicateCount = Math.max(0, (Array.isArray(afterRows) ? afterRows.length : 0) - 1);
            var writeVisible = afterFolderId === folderId;
            var duplicateBlocker = duplicateCount > 0;
            var buildResult = function (stableRows) {
              var stable = Array.isArray(stableRows) && stableRows.length ? stableRows[0] : null;
              var stableFolderId = getFolderId(stable);
              var stableDuplicateCount = Math.max(0, (Array.isArray(stableRows) ? stableRows.length : 0) - 1);
              var blockers = [];
              if (!writeVisible) blockers.push('canonical-folder-binding-write-not-visible');
              if (duplicateBlocker || stableDuplicateCount > 0) blockers.push('duplicate-canonical-binding-rows-for-chat');
              if (stableFolderId !== folderId) blockers.push('canonical-folder-binding-write-not-stable');
              return {
                ok: blockers.length === 0,
                status: blockers.length ? blockers[0] : 'chat-folder-binding-moved',
                blockers: blockers,
                warnings: [],
                changed: blockers.length === 0,
                chatId: chatId,
                targetFolderId: folderId,
                expectedCurrentFolderId: expectedCurrentFolderId,
                beforeBinding: before,
                afterBinding: stable || after,
                assignedAt: assignedAt,
                rowsAffected: readRowsAffected(writeResult),
                writeResult: writeResult,
                storeIdentity: canonicalBindingStoreIdentity(),
                sameLiveCanonicalStore: true,
                canonicalRowsForChatCount: Array.isArray(stableRows) ? stableRows.length : (Array.isArray(afterRows) ? afterRows.length : 0),
                canonicalRowsForChat: stableRows || afterRows || [],
                canonicalRowsForChatBeforeCount: Array.isArray(beforeRows) ? beforeRows.length : 0,
                canonicalRowsForChatBefore: beforeRows || [],
                duplicateCanonicalBindingRowsForChatCount: Math.max(duplicateCount, stableDuplicateCount),
                duplicateCanonicalBindingRowsForChatBlocked: duplicateBlocker || stableDuplicateCount > 0,
                bindingTombstoneSkipped: skipBindingTombstone,
                subscriberNotificationSuppressed: suppressBindingSubscribers,
                postWriteStabilityCheckMs: stabilityCheckMs,
                postWriteStable: stableFolderId === folderId && stableDuplicateCount === 0,
                noChromeDestructiveBindingApply: true,
                noChatDelete: true,
                noSnapshotDelete: true,
                noHardDelete: true,
                noPurge: true,
              };
            };
            if (!writeVisible || duplicateBlocker) return buildResult(afterRows);
            recordWrite('moveCanonicalChatFolderBinding');
            if (!suppressBindingSubscribers) {
              notifySubscribers({ source: 'local', op: 'moveCanonicalChatFolderBinding', folderId: folderId, chatId: chatId });
            }
            var tombstonePromise = skipBindingTombstone
              ? Promise.resolve()
              : writeFolderBindingTombstoneSafely(beforeFolderId, chatId, {
                deleteReason: 'folder-rebind',
                meta: {
                  chatId: chatId,
                  folderId: beforeFolderId,
                  oldFolderId: beforeFolderId,
                  newFolderId: folderId,
                  assignedAt: before && before.assignedAt,
                  recordIdFormat: F5D_FOLDER_BINDING_RECORD_ID_FORMAT,
                  source: 'store.folders.moveCanonicalChatFolderBinding',
                  replacement: true,
                  reason: reason,
                },
              });
            return tombstonePromise.then(function () {
              return new Promise(function (resolve) {
                try { setTimeout(resolve, stabilityCheckMs); } catch (_) { resolve(); }
              });
            }).then(function () {
              return listCanonicalChatFolderBindingsForChat(chatId).then(buildResult);
            });
          });
        });
      });
    }).catch(function (e) {
      recordError('moveCanonicalChatFolderBinding', e);
      return {
        ok: false,
        status: 'canonical-folder-binding-write-failed',
        blockers: ['canonical-folder-binding-write-failed'],
        warnings: [String((e && e.message) || e)],
        storeIdentity: canonicalBindingStoreIdentity(),
        noChromeDestructiveBindingApply: true,
        noChatDelete: true,
        noSnapshotDelete: true,
        noHardDelete: true,
        noPurge: true,
      };
    });
  }

  /* listForChat(chatId): single binding row max (chat_id is PK). Returns
   * the bound folder as a one-element array, or [] if unbound. */
  function listForChat(chatIdInput) {
    var chatId = String(chatIdInput || '').trim();
    if (!chatId) return Promise.resolve([]);
    return sqlSelect('SELECT folder_id FROM folder_bindings WHERE chat_id = ? LIMIT 1', [chatId])
      .then(function (rows) {
        if (!Array.isArray(rows) || rows.length === 0) return [];
        var folderId = rows[0] && rows[0].folder_id;
        if (!folderId) return [];
        return getById(folderId).then(function (f) { return f ? [f] : []; });
      }).catch(function (e) { recordError('listForChat', e); return []; });
  }

  function getAll() { return listFolders(); }

  /* ── Lifecycle ────────────────────────────────────────────────────── */
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
      return ensureF15SettledBindingRestartConvergenceReady('init').then(function (convergence) {
        return countFolders().then(function (n) {
          return { rowCount: n, f15SettledBindingRestartConvergence: convergence };
        });
      });
    }).catch(function (e) {
      state.initError = String((e && e.message) || e);
      recordError('init', e);
      return { rowCount: 0 };
    });
  }

  function dispose() { state.ready = false; }
  function isReady() { return !!state.ready; }

  function reload() {
    state.lastReloadedAt = Date.now();
    state.f15RestartConvergenceReadyPromise = null;
    return ensureF15SettledBindingRestartConvergenceReady('reload').then(function (convergence) {
      notifySubscribers({ source: 'reload', f15SettledBindingRestartConvergence: convergence });
      return countFolders().then(function (n) { return { rowCount: n, f15SettledBindingRestartConvergence: convergence }; });
    })
      .catch(function () { return { rowCount: 0 }; });
  }

  function saveNow() { return Promise.resolve(); }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    state.subscribers.add(fn);
    return function () { state.subscribers.delete(fn); };
  }

  function diagnose() {
    return {
      installed: true,
      ready: state.ready,
      schemaVersion: SCHEMA_VERSION,
      phase4aLocalSoftDelete: Object.assign({}, state.phase4a, {
        tombstoneStoreAvailable: !!getTombstoneStore(),
        purgeBlocked: true,
        hardDeleteBlocked: true,
        chatDeleteBlocked: true,
        chromeDeleteSync: 'deferred',
        tombstoneSync: 'deferred',
      }),
      backend: state.ready ? 'sqlite' : (state.initError ? 'error' : 'pending'),
      dbUrl: DB_URL,
      tables: ['folders', 'folder_bindings'],
      lastReloadedAt: state.lastReloadedAt,
      lastWriteAt: state.lastWriteAt,
      writesSinceBoot: state.writesSinceBoot,
      lastF15SettledBindingRestartConvergence: state.lastF15SettledBindingRestartConvergence,
      subscribers: state.subscribers.size,
      initError: state.initError,
      errors: state.errors.slice(),
      warnings: state.warnings.slice(),
    };
  }

  /* ── Register & schedule init ─────────────────────────────────────── */
  var api = {
    __installed: true,
    __version: '0.1.0',
    __folderBindingsLegacyFallbackIdentity: F16_FOLDER_LEGACY_FALLBACK_IDENTITY,
    __folderBindingsLegacyFallbackIdentityVersion: F16_FOLDER_LEGACY_FALLBACK_VERSION,
    __folderBindingsTriggerProtectionGuarded: F16_FOLDER_BINDINGS_TRIGGER_PROTECTION_GUARDED,
    __folderBindingsTriggerProtectionDefaultEnabled: F16_FOLDER_BINDINGS_TRIGGER_PROTECTION_DEFAULT_ENABLED,
    init: init,
    dispose: dispose,
    isReady: isReady,
    getAll: getAll,
    list: listFolders,
    reload: reload,
    saveNow: saveNow,
    subscribe: subscribe,
    diagnose: diagnose,
    /* folder-specific */
    get: getById,
    create: create,
    upsert: upsert,
    patch: patchOne,
    softDeleteEmptyFolder: softDeleteEmptyFolder,
    softDeleteFolder: softDeleteEmptyFolder,
    restoreTombstonedFolder: restoreTombstonedFolder,
    restoreFolder: restoreTombstonedFolder,
    diagnosePhase4aTombstones: diagnosePhase4aTombstones,
    listRecentlyDeletedFolders: listRecentlyDeletedFolders,
    diagnoseRecentlyDeletedFolders: listRecentlyDeletedFolders,
    diagnosePurgedFolderResurrectionCandidates: diagnosePurgedFolderResurrectionCandidates,
    previewPurgedFolderResurrectionRepair: previewPurgedFolderResurrectionRepair,
    repairPurgedFolderResurrections: repairPurgedFolderResurrections,
    previewRecentlyDeletedFolderPurge: previewRecentlyDeletedFolderPurge,
    purgeRecentlyDeletedFolders: purgeRecentlyDeletedFolders,
    previewRecentlyDeletedRestoredHistoryClear: previewRecentlyDeletedRestoredHistoryClear,
    clearRecentlyDeletedRestoredHistory: clearRecentlyDeletedRestoredHistory,
    rebuildRenderMirrorFromSqlite: rebuildRenderMirrorFromSqlite,
    remove: softDeleteEmptyFolder,
    'delete': softDeleteEmptyFolder,
    bindChat: bindChat,
    unbindChat: unbindChat,
    listChats: listChats,
    listCanonicalChatFolderBindings: listCanonicalChatFolderBindings,
    getCanonicalChatFolderBindingForChat: getCanonicalChatFolderBindingForChat,
    listCanonicalChatFolderBindingsForChat: listCanonicalChatFolderBindingsForChat,
    moveCanonicalChatFolderBinding: moveCanonicalChatFolderBinding,
    canonicalBindingStoreIdentity: canonicalBindingStoreIdentity,
    confirmCanonicalChatFolderBindingDurable: confirmCanonicalChatFolderBindingDurable,
    runF15SettledBindingRestartConvergence: runF15SettledBindingRestartConvergence,
    whenF15SettledBindingRestartConvergenceReady: ensureF15SettledBindingRestartConvergenceReady,
    listForChat: listForChat,
    count: countFolders,
  };
  store.__registerEntity('folders', api);

  global.setTimeout(function () {
    init().catch(function (e) { recordError('autoInit', e); });
  }, 0);
})(typeof window !== 'undefined' ? window : globalThis);
