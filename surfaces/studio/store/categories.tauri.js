/* H2O Studio Store — Categories Entity (Desktop / Tauri SQLite)
 *
 * M2a-3f — sixth and final M2a-3 entity store. Backs the SQLite `categories`
 * table defined in apps/studio-desktop/src-tauri/src/lib.rs (Migration v3).
 *
 * Desktop-only: gates on Tauri detection at load. On MV3 / web this file is
 * a silent no-op and registers nothing.
 *
 * Source-of-truth: SQLite `categories` table on Desktop V1. Library UI
 * wiring and Save-to-Folder / Add-to-Library ingestion are deferred —
 * this commit is data-layer only.
 *
 * Differs from folders/labels/tags: there is NO category_bindings table.
 * Categories use a primary-category model — chat ↔ category assignment
 * lives in the `chats.category_id` column. assignChat issues a direct
 * UPDATE on chats; clearChat sets it to NULL; getForChat reads it back.
 * remove(categoryId) bulk-clears chats.category_id for that category
 * before deleting the category row.
 *
 * Persistence: writes hit SQLite immediately. tauri-plugin-sql v2 has no
 * exposed transaction wrapper; multi-statement writes (in remove()) are
 * sequential. On partial failure, the category row remains and a retry
 * converges (next remove call re-clears any chats and re-attempts the
 * delete).
 *
 * Subscribers are in-process only — single-window V1.
 *
 * listChats() delegates to H2O.Studio.store.chats.get() for full row
 * hydration (matches folders/labels/tags pattern). assignChat / clearChat
 * intentionally write directly to the chats table via raw SQL rather than
 * going through store.chats.patch — that path would CREATE a ghost chat
 * row if the chatId didn't already exist. Direct UPDATE WHERE id = ?
 * gives correct "no-op if missing" semantics.
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
    try { console.warn('[H2O.Studio.store.categories] H2O.Studio.store not present; entity not registered'); }
    catch (_) { /* ignore */ }
    return;
  }
  if (store.categories && store.categories.__installed) return;

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
    id:         'categoryId',
    name:       'name',
    parent_id:  'parentId',
    source:     'source',
    created_at: 'createdAt',
    updated_at: 'updatedAt',
    meta_json:  'meta',
  };
  var FIELD_TO_COL = (function () {
    var out = Object.create(null);
    Object.keys(COL_TO_FIELD).forEach(function (col) { out[COL_TO_FIELD[col]] = col; });
    /* Accept `id` as an alias for `categoryId` on input patches. */
    out.id = 'id';
    return out;
  })();
  /* No bool columns on categories. */
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

  function getCategoryId(input) {
    if (input == null) return null;
    if (typeof input === 'string') return input.trim() || null;
    if (typeof input === 'object') {
      var v = (typeof input.categoryId === 'string' && input.categoryId)
        || (typeof input.id === 'string' && input.id)
        || null;
      return v ? v.trim() || null : null;
    }
    return null;
  }

  function generateCategoryId() {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') {
        return 'cat_' + global.crypto.randomUUID();
      }
    } catch (_) { /* fall through */ }
    return 'cat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }

  function patchToCols(patch) {
    var columns = Object.create(null);
    var mergeMeta = null;
    if (!patch || typeof patch !== 'object') return { columns: columns, mergeMeta: mergeMeta };
    Object.keys(patch).forEach(function (field) {
      if (field === 'categoryId' || field === 'id') return; /* PK handled separately */
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

  /* ── Category reads ───────────────────────────────────────────────── */
  function getById(categoryIdInput) {
    var id = getCategoryId(categoryIdInput);
    if (!id) return Promise.resolve(null);
    return sqlSelect('SELECT * FROM categories WHERE id = ? LIMIT 1', [id])
      .then(function (rows) {
        if (!Array.isArray(rows) || rows.length === 0) return null;
        return rowToJs(rows[0]);
      })
      .catch(function (e) { recordError('get', e); return null; });
  }

  function listCategories(opts) {
    opts = opts || {};
    var sortCol = 'name';
    var sortDir = 'ASC';
    if (opts.sort && typeof opts.sort === 'object') {
      var sf = FIELD_TO_COL[opts.sort.field] || null;
      if (sf) sortCol = sf;
      if (opts.sort.dir === 'DESC' || opts.sort.dir === 'desc') sortDir = 'DESC';
    }
    var sql = 'SELECT * FROM categories ORDER BY ' + sortCol + ' ' + sortDir;
    if (typeof opts.limit === 'number' && opts.limit > 0) {
      sql += ' LIMIT ' + Math.floor(opts.limit);
      if (typeof opts.offset === 'number' && opts.offset > 0) sql += ' OFFSET ' + Math.floor(opts.offset);
    }
    return sqlSelect(sql, [])
      .then(function (rows) { return (rows || []).map(rowToJs).filter(function (r) { return r != null; }); })
      .catch(function (e) { recordError('list', e); return []; });
  }

  function countCategories() {
    return sqlSelect('SELECT COUNT(*) AS n FROM categories', [])
      .then(function (rows) {
        if (Array.isArray(rows) && rows.length > 0 && typeof rows[0].n === 'number') return rows[0].n;
        return 0;
      })
      .catch(function (e) { recordError('count', e); return 0; });
  }

  /* ── Category writes ──────────────────────────────────────────────── */
  function upsertCore(input, opts) {
    var patch = (input && typeof input === 'object') ? Object.assign({}, input) : {};
    if (opts && opts.generateId && !getCategoryId(patch)) {
      patch.categoryId = generateCategoryId();
    }
    var categoryId = getCategoryId(patch);
    if (!categoryId) return Promise.reject(new Error('upsert: categoryId required'));
    var pc = patchToCols(patch);
    return getById(categoryId).then(function (existing) {
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
        values.push(categoryId);
        return sqlExecute('UPDATE categories SET ' + setClauses.join(', ') + ' WHERE id = ?', values)
          .then(function () { return getById(categoryId); })
          .then(function (row) {
            recordWrite('upsert.update');
            notifySubscribers({ source: 'local', op: 'upsert', categoryId: categoryId, mode: 'update' });
            return row;
          });
      }
      /* INSERT path: categories.name and categories.created_at are NOT NULL
       * with no default — required. */
      if (!pc.columns.name) {
        return Promise.reject(new Error('upsert: name required for new category'));
      }
      if (!('created_at' in pc.columns)) pc.columns.created_at = now;
      var cols = ['id'];
      var ph = ['?'];
      var vals = [categoryId];
      Object.keys(pc.columns).forEach(function (col) {
        cols.push(col); ph.push('?'); vals.push(pc.columns[col]);
      });
      return sqlExecute(
        'INSERT INTO categories (' + cols.join(', ') + ') VALUES (' + ph.join(', ') + ')',
        vals
      ).then(function () { return getById(categoryId); })
        .then(function (row) {
          recordWrite('upsert.insert');
          notifySubscribers({ source: 'local', op: 'upsert', categoryId: categoryId, mode: 'insert' });
          return row;
        });
    });
  }

  function upsert(input) { return upsertCore(input, { generateId: false }); }
  function create(input) { return upsertCore(input, { generateId: true }); }

  function patchOne(categoryIdInput, partial) {
    var id = getCategoryId(categoryIdInput);
    if (!id) return Promise.reject(new Error('patch: categoryId required'));
    if (!partial || typeof partial !== 'object') return getById(id);
    var merged = Object.assign({}, partial, { categoryId: id });
    return upsertCore(merged, { generateId: false });
  }

  function remove(categoryIdInput) {
    var id = getCategoryId(categoryIdInput);
    if (!id) return Promise.resolve(false);
    /* Bulk-clear the FK from chats first (sets chats.category_id = NULL
     * for all chats currently assigned to this category), then delete the
     * category row. The category row delete is the authoritative success
     * indicator. Per the no-transaction constraint, partial failure leaves
     * the category row intact and a retry converges. updated_at is bumped
     * on the affected chats so consumers can see that the rows changed. */
    var now = Date.now();
    return sqlExecute(
      'UPDATE chats SET category_id = NULL, updated_at = ? WHERE category_id = ?',
      [now, id]
    ).then(function () {
      return sqlExecute('DELETE FROM categories WHERE id = ?', [id]);
    }).then(function (result) {
      var ok = readRowsAffected(result) > 0;
      if (ok) {
        recordWrite('remove');
        notifySubscribers({ source: 'local', op: 'remove', categoryId: id });
      }
      return ok;
    }).catch(function (e) { recordError('remove', e); return false; });
  }

  /* ── Assignment (via chats.category_id, no binding table) ─────────── */
  /* Direct UPDATE on chats — only acts on existing chat rows. Prefer this
   * over store.chats.patch because patch's underlying upsert would CREATE
   * a ghost chat row if the chatId didn't already exist. */
  function assignChat(categoryIdInput, chatIdInput) {
    var categoryId = getCategoryId(categoryIdInput);
    var chatId = String(chatIdInput || '').trim();
    if (!categoryId) return Promise.reject(new Error('assignChat: categoryId required'));
    if (!chatId) return Promise.reject(new Error('assignChat: chatId required'));
    var now = Date.now();
    return sqlExecute(
      'UPDATE chats SET category_id = ?, updated_at = ? WHERE id = ?',
      [categoryId, now, chatId]
    ).then(function (result) {
      var ok = readRowsAffected(result) > 0;
      if (ok) {
        recordWrite('assignChat');
        notifySubscribers({ source: 'local', op: 'assignChat', categoryId: categoryId, chatId: chatId });
      }
      return ok;
    }).catch(function (e) { recordError('assignChat', e); return false; });
  }

  function clearChat(chatIdInput) {
    var chatId = String(chatIdInput || '').trim();
    if (!chatId) return Promise.resolve(false);
    var now = Date.now();
    return sqlExecute(
      'UPDATE chats SET category_id = NULL, updated_at = ? WHERE id = ?',
      [now, chatId]
    ).then(function (result) {
      var ok = readRowsAffected(result) > 0;
      if (ok) {
        recordWrite('clearChat');
        notifySubscribers({ source: 'local', op: 'clearChat', chatId: chatId });
      }
      return ok;
    }).catch(function (e) { recordError('clearChat', e); return false; });
  }

  /* getForChat: returns the full category row for the chat's primary
   * category, or null if the chat doesn't exist OR has no category_id. */
  function getForChat(chatIdInput) {
    var chatId = String(chatIdInput || '').trim();
    if (!chatId) return Promise.resolve(null);
    return sqlSelect('SELECT category_id FROM chats WHERE id = ? LIMIT 1', [chatId])
      .then(function (rows) {
        if (!Array.isArray(rows) || rows.length === 0) return null;
        var catId = rows[0] && rows[0].category_id;
        if (!catId) return null;
        return getById(catId);
      })
      .catch(function (e) { recordError('getForChat', e); return null; });
  }

  /* listChats(categoryId): hydrate full chat rows via store.chats (matches
   * the folders/labels/tags pattern). Returns [] if store.chats is missing.
   * Sorted by chats.updated_at DESC at the SQL level for stable order. */
  function listChats(categoryIdInput) {
    var categoryId = getCategoryId(categoryIdInput);
    if (!categoryId) return Promise.resolve([]);
    return sqlSelect(
      'SELECT id FROM chats WHERE category_id = ? ORDER BY updated_at DESC',
      [categoryId]
    ).then(function (rows) {
      var chatIds = (rows || []).map(function (r) { return r && r.id; }).filter(function (id) { return !!id; });
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

  function getAll() { return listCategories(); }

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
      return countCategories().then(function (n) { return { rowCount: n }; });
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
    return countCategories().then(function (n) { return { rowCount: n }; })
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
      tables: ['categories'], /* assignment lives in chats.category_id; no bindings table */
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
    list: listCategories,
    reload: reload,
    saveNow: saveNow,
    subscribe: subscribe,
    diagnose: diagnose,
    /* category-specific */
    get: getById,
    create: create,
    upsert: upsert,
    patch: patchOne,
    remove: remove,
    'delete': remove,
    assignChat: assignChat,
    clearChat: clearChat,
    getForChat: getForChat,
    listChats: listChats,
    count: countCategories,
  };
  store.__registerEntity('categories', api);

  global.setTimeout(function () {
    init().catch(function (e) { recordError('autoInit', e); });
  }, 0);
})(typeof window !== 'undefined' ? window : globalThis);
