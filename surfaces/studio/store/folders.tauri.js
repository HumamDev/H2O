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
 *   / bindChat / unbindChat / listChats / listForChat / count).
 *
 * Persistence: writes hit SQLite immediately. tauri-plugin-sql v2 has no
 * exposed transaction wrapper, so multi-statement writes are sequential.
 * remove() deletes bindings before the folder row; on partial failure the
 * folder row remains and a retry converges. bindChat uses INSERT OR REPLACE
 * so the existing single-folder-per-chat binding is replaced atomically.
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

  function generateFolderId() {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') {
        return 'fold_' + global.crypto.randomUUID();
      }
    } catch (_) { /* fall through */ }
    return 'fold_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
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
    var sql = 'SELECT * FROM folders ORDER BY ' + sortCol + ' ' + sortDir + ', name ASC';
    if (typeof opts.limit === 'number' && opts.limit > 0) {
      sql += ' LIMIT ' + Math.floor(opts.limit);
      if (typeof opts.offset === 'number' && opts.offset > 0) sql += ' OFFSET ' + Math.floor(opts.offset);
    }
    return sqlSelect(sql, [])
      .then(function (rows) { return (rows || []).map(rowToJs).filter(function (r) { return r != null; }); })
      .catch(function (e) { recordError('list', e); return []; });
  }

  function countFolders() {
    return sqlSelect('SELECT COUNT(*) AS n FROM folders', [])
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

  function remove(folderIdInput) {
    var id = getFolderId(folderIdInput);
    if (!id) return Promise.resolve(false);
    /* Delete bindings first so a partial failure doesn't leave orphan binding
     * rows pointing at a missing folder. The folder row delete is the
     * authoritative success indicator. */
    return sqlExecute('DELETE FROM folder_bindings WHERE folder_id = ?', [id])
      .then(function () {
        return sqlExecute('DELETE FROM folders WHERE id = ?', [id]);
      })
      .then(function (result) {
        var ok = readRowsAffected(result) > 0;
        if (ok) {
          recordWrite('remove');
          notifySubscribers({ source: 'local', op: 'remove', folderId: id });
        }
        return ok;
      })
      .catch(function (e) { recordError('remove', e); return false; });
  }

  /* ── Bindings ─────────────────────────────────────────────────────── */
  /* folder_bindings.PRIMARY KEY (chat_id) enforces one folder per chat in V1.
   * INSERT OR REPLACE handles the "move chat to a different folder" case
   * atomically — the prior binding (any folder) is replaced. */
  function bindChat(folderIdInput, chatIdInput, opts) {
    var folderId = getFolderId(folderIdInput);
    var chatId = String(chatIdInput || '').trim();
    if (!folderId) return Promise.reject(new Error('bindChat: folderId required'));
    if (!chatId) return Promise.reject(new Error('bindChat: chatId required'));
    var assignedAt = (opts && typeof opts.assignedAt === 'number' && opts.assignedAt > 0)
      ? opts.assignedAt : Date.now();
    return sqlExecute(
      'INSERT OR REPLACE INTO folder_bindings (chat_id, folder_id, assigned_at) VALUES (?, ?, ?)',
      [chatId, folderId, assignedAt]
    ).then(function () {
      recordWrite('bindChat');
      notifySubscribers({ source: 'local', op: 'bindChat', folderId: folderId, chatId: chatId });
      return true;
    }).catch(function (e) { recordError('bindChat', e); return false; });
  }

  function unbindChat(folderIdInput, chatIdInput) {
    var folderId = getFolderId(folderIdInput);
    var chatId = String(chatIdInput || '').trim();
    if (!folderId || !chatId) return Promise.resolve(false);
    return sqlExecute(
      'DELETE FROM folder_bindings WHERE chat_id = ? AND folder_id = ?',
      [chatId, folderId]
    ).then(function (result) {
      var ok = readRowsAffected(result) > 0;
      if (ok) {
        recordWrite('unbindChat');
        notifySubscribers({ source: 'local', op: 'unbindChat', folderId: folderId, chatId: chatId });
      }
      return ok;
    }).catch(function (e) { recordError('unbindChat', e); return false; });
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
      return countFolders().then(function (n) { return { rowCount: n }; });
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
    notifySubscribers({ source: 'reload' });
    return countFolders().then(function (n) { return { rowCount: n }; })
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
      backend: state.ready ? 'sqlite' : (state.initError ? 'error' : 'pending'),
      dbUrl: DB_URL,
      tables: ['folders', 'folder_bindings'],
      lastReloadedAt: state.lastReloadedAt,
      lastWriteAt: state.lastWriteAt,
      writesSinceBoot: state.writesSinceBoot,
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
    remove: remove,
    'delete': remove,
    bindChat: bindChat,
    unbindChat: unbindChat,
    listChats: listChats,
    listForChat: listForChat,
    count: countFolders,
  };
  store.__registerEntity('folders', api);

  global.setTimeout(function () {
    init().catch(function (e) { recordError('autoInit', e); });
  }, 0);
})(typeof window !== 'undefined' ? window : globalThis);
