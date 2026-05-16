/* H2O Studio Store — Tags Entity (Desktop / Tauri SQLite)
 *
 * M2a-3e — fifth table-aware entity store. Backs the SQLite `tags` +
 * `tag_bindings` tables defined in apps/studio-desktop/src-tauri/src/lib.rs
 * (Migration v3).
 *
 * Desktop-only: gates on Tauri detection at load. On MV3 / web this file is
 * a silent no-op and registers nothing.
 *
 * Source-of-truth: SQLite `tags` + `tag_bindings` tables on Desktop V1.
 * Library UI wiring and Save-to-Folder / Add-to-Library ingestion are
 * deferred — this commit is data-layer only.
 *
 * Closely mirrors store/labels.tauri.js — same composite-PK binding shape
 * (chat_id, tag_id), so a chat can carry multiple tags. Differences from
 * labels: tags has `auto_derived` (boolean, materialized as JS bool ↔
 * INTEGER 0/1) instead of color/source, and no `updated_at` column —
 * upsert UPDATE path therefore doesn't stamp updated_at.
 *
 * bindChat is INSERT OR IGNORE (idempotent — re-binding preserves the
 * original assigned_at). replaceForChat does the full-replacement
 * DELETE+INSERT pattern with chunked batches.
 *
 * Persistence: writes hit SQLite immediately. tauri-plugin-sql v2 has no
 * exposed transaction wrapper; multi-statement writes are sequential. On
 * partial failure during replaceForChat the next call converges.
 *
 * Subscribers are in-process only — single-window V1.
 *
 * listChats() delegates to H2O.Studio.store.chats.get() (matches the
 * folders/labels pattern). listForChat() fetches multiple tags via a single
 * IN (?,?,...) query against the local tags table.
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
    try { console.warn('[H2O.Studio.store.tags] H2O.Studio.store not present; entity not registered'); }
    catch (_) { /* ignore */ }
    return;
  }
  if (store.tags && store.tags.__installed) return;

  /* ── Constants ────────────────────────────────────────────────────── */
  var DB_URL = 'sqlite:studio-v1.db';
  var SCHEMA_VERSION = 1;
  var READY_POLL_INTERVAL_MS = 100;
  var READY_POLL_MAX_TRIES = 100;
  var BINDING_INSERT_BATCH_SIZE = 100; /* 3 binds per row, well under 999 */

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
  /* Schema source: src-tauri/src/lib.rs Migration v3. Keep in sync. Note:
   * tags has no updated_at — UPDATE path therefore doesn't stamp it. */
  var COL_TO_FIELD = {
    id:           'tagId',
    name:         'name',
    auto_derived: 'autoDerived',
    created_at:   'createdAt',
    meta_json:    'meta',
  };
  var FIELD_TO_COL = (function () {
    var out = Object.create(null);
    Object.keys(COL_TO_FIELD).forEach(function (col) { out[COL_TO_FIELD[col]] = col; });
    /* Accept `id` as an alias for `tagId` on input patches. */
    out.id = 'id';
    return out;
  })();
  /* INTEGER columns stored as 0/1 boolean. */
  var BOOL_COLS = { auto_derived: true };
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
      } else if (BOOL_COLS[col]) {
        js[field] = !!Number(val);
      } else {
        js[field] = (val === null || typeof val === 'undefined') ? null : val;
      }
    });
    return js;
  }

  function getTagId(input) {
    if (input == null) return null;
    if (typeof input === 'string') return input.trim() || null;
    if (typeof input === 'object') {
      var v = (typeof input.tagId === 'string' && input.tagId)
        || (typeof input.id === 'string' && input.id)
        || null;
      return v ? v.trim() || null : null;
    }
    return null;
  }

  function generateTagId() {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') {
        return 'tag_' + global.crypto.randomUUID();
      }
    } catch (_) { /* fall through */ }
    return 'tag_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }

  function patchToCols(patch) {
    var columns = Object.create(null);
    var mergeMeta = null;
    if (!patch || typeof patch !== 'object') return { columns: columns, mergeMeta: mergeMeta };
    Object.keys(patch).forEach(function (field) {
      if (field === 'tagId' || field === 'id') return; /* PK handled separately */
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
      if (BOOL_COLS[col]) {
        columns[col] = val ? 1 : 0;
      } else {
        columns[col] = val;
      }
    });
    return { columns: columns, mergeMeta: mergeMeta };
  }

  /* ── Tag reads ────────────────────────────────────────────────────── */
  function getById(tagIdInput) {
    var id = getTagId(tagIdInput);
    if (!id) return Promise.resolve(null);
    return sqlSelect('SELECT * FROM tags WHERE id = ? LIMIT 1', [id])
      .then(function (rows) {
        if (!Array.isArray(rows) || rows.length === 0) return null;
        return rowToJs(rows[0]);
      })
      .catch(function (e) { recordError('get', e); return null; });
  }

  function listTags(opts) {
    opts = opts || {};
    var sortCol = 'name';
    var sortDir = 'ASC';
    if (opts.sort && typeof opts.sort === 'object') {
      var sf = FIELD_TO_COL[opts.sort.field] || null;
      if (sf) sortCol = sf;
      if (opts.sort.dir === 'DESC' || opts.sort.dir === 'desc') sortDir = 'DESC';
    }
    var sql = 'SELECT * FROM tags ORDER BY ' + sortCol + ' ' + sortDir;
    if (typeof opts.limit === 'number' && opts.limit > 0) {
      sql += ' LIMIT ' + Math.floor(opts.limit);
      if (typeof opts.offset === 'number' && opts.offset > 0) sql += ' OFFSET ' + Math.floor(opts.offset);
    }
    return sqlSelect(sql, [])
      .then(function (rows) { return (rows || []).map(rowToJs).filter(function (r) { return r != null; }); })
      .catch(function (e) { recordError('list', e); return []; });
  }

  function countTags() {
    return sqlSelect('SELECT COUNT(*) AS n FROM tags', [])
      .then(function (rows) {
        if (Array.isArray(rows) && rows.length > 0 && typeof rows[0].n === 'number') return rows[0].n;
        return 0;
      })
      .catch(function (e) { recordError('count', e); return 0; });
  }

  /* ── Tag writes ───────────────────────────────────────────────────── */
  function upsertCore(input, opts) {
    var patch = (input && typeof input === 'object') ? Object.assign({}, input) : {};
    if (opts && opts.generateId && !getTagId(patch)) {
      patch.tagId = generateTagId();
    }
    var tagId = getTagId(patch);
    if (!tagId) return Promise.reject(new Error('upsert: tagId required'));
    var pc = patchToCols(patch);
    return getById(tagId).then(function (existing) {
      if (pc.mergeMeta) {
        var merged = Object.assign({}, (existing && existing.meta) || {}, pc.mergeMeta);
        pc.columns.meta_json = JSON.stringify(merged);
      }
      /* tags has no updated_at column — do NOT stamp it. */
      if (existing) {
        var setClauses = [];
        var values = [];
        Object.keys(pc.columns).forEach(function (col) {
          setClauses.push(col + ' = ?');
          values.push(pc.columns[col]);
        });
        if (setClauses.length === 0) return existing;
        values.push(tagId);
        return sqlExecute('UPDATE tags SET ' + setClauses.join(', ') + ' WHERE id = ?', values)
          .then(function () { return getById(tagId); })
          .then(function (row) {
            recordWrite('upsert.update');
            notifySubscribers({ source: 'local', op: 'upsert', tagId: tagId, mode: 'update' });
            return row;
          });
      }
      /* INSERT path: tags.name and tags.created_at are NOT NULL with no
       * default — required. */
      if (!pc.columns.name) {
        return Promise.reject(new Error('upsert: name required for new tag'));
      }
      if (!('created_at' in pc.columns)) pc.columns.created_at = Date.now();
      var cols = ['id'];
      var ph = ['?'];
      var vals = [tagId];
      Object.keys(pc.columns).forEach(function (col) {
        cols.push(col); ph.push('?'); vals.push(pc.columns[col]);
      });
      return sqlExecute(
        'INSERT INTO tags (' + cols.join(', ') + ') VALUES (' + ph.join(', ') + ')',
        vals
      ).then(function () { return getById(tagId); })
        .then(function (row) {
          recordWrite('upsert.insert');
          notifySubscribers({ source: 'local', op: 'upsert', tagId: tagId, mode: 'insert' });
          return row;
        });
    });
  }

  function upsert(input) { return upsertCore(input, { generateId: false }); }
  function create(input) { return upsertCore(input, { generateId: true }); }

  function patchOne(tagIdInput, partial) {
    var id = getTagId(tagIdInput);
    if (!id) return Promise.reject(new Error('patch: tagId required'));
    if (!partial || typeof partial !== 'object') return getById(id);
    var merged = Object.assign({}, partial, { tagId: id });
    return upsertCore(merged, { generateId: false });
  }

  function remove(tagIdInput) {
    var id = getTagId(tagIdInput);
    if (!id) return Promise.resolve(false);
    /* Delete bindings first; the tag row delete is the authoritative
     * success indicator. Per the no-transaction constraint, partial failure
     * leaves the tag row intact and a retry converges. */
    return sqlExecute('DELETE FROM tag_bindings WHERE tag_id = ?', [id])
      .then(function () {
        return sqlExecute('DELETE FROM tags WHERE id = ?', [id]);
      })
      .then(function (result) {
        var ok = readRowsAffected(result) > 0;
        if (ok) {
          recordWrite('remove');
          notifySubscribers({ source: 'local', op: 'remove', tagId: id });
        }
        return ok;
      })
      .catch(function (e) { recordError('remove', e); return false; });
  }

  /* ── Bindings ─────────────────────────────────────────────────────── */
  /* tag_bindings.PRIMARY KEY (chat_id, tag_id) is composite, so multiple
   * tags per chat are allowed. bindChat uses INSERT OR IGNORE so re-binding
   * an existing pair is a no-op (preserves the original assigned_at).
   * Returns true on SQL success regardless of whether a row was actually
   * inserted (the binding now exists either way). */
  function bindChat(tagIdInput, chatIdInput, opts) {
    var tagId = getTagId(tagIdInput);
    var chatId = String(chatIdInput || '').trim();
    if (!tagId) return Promise.reject(new Error('bindChat: tagId required'));
    if (!chatId) return Promise.reject(new Error('bindChat: chatId required'));
    var assignedAt = (opts && typeof opts.assignedAt === 'number' && opts.assignedAt > 0)
      ? opts.assignedAt : Date.now();
    return sqlExecute(
      'INSERT OR IGNORE INTO tag_bindings (chat_id, tag_id, assigned_at) VALUES (?, ?, ?)',
      [chatId, tagId, assignedAt]
    ).then(function () {
      recordWrite('bindChat');
      notifySubscribers({ source: 'local', op: 'bindChat', tagId: tagId, chatId: chatId });
      return true;
    }).catch(function (e) { recordError('bindChat', e); return false; });
  }

  function unbindChat(tagIdInput, chatIdInput) {
    var tagId = getTagId(tagIdInput);
    var chatId = String(chatIdInput || '').trim();
    if (!tagId || !chatId) return Promise.resolve(false);
    return sqlExecute(
      'DELETE FROM tag_bindings WHERE chat_id = ? AND tag_id = ?',
      [chatId, tagId]
    ).then(function (result) {
      var ok = readRowsAffected(result) > 0;
      if (ok) {
        recordWrite('unbindChat');
        notifySubscribers({ source: 'local', op: 'unbindChat', tagId: tagId, chatId: chatId });
      }
      return ok;
    }).catch(function (e) { recordError('unbindChat', e); return false; });
  }

  /* replaceForChat: full replacement of the tag set for a chat. Dedupes
   * the input array, then DELETE all existing bindings for chat_id and
   * INSERT the new set in batches. */
  function replaceForChat(chatIdInput, tagIds, opts) {
    var chatId = String(chatIdInput || '').trim();
    if (!chatId) return Promise.reject(new Error('replaceForChat: chatId required'));
    var inputArr = Array.isArray(tagIds) ? tagIds : [];
    var unique = [];
    var seen = Object.create(null);
    inputArr.forEach(function (item) {
      var tid = getTagId(item);
      if (tid && !seen[tid]) { seen[tid] = true; unique.push(tid); }
    });
    var assignedAt = (opts && typeof opts.assignedAt === 'number' && opts.assignedAt > 0)
      ? opts.assignedAt : Date.now();
    return sqlExecute('DELETE FROM tag_bindings WHERE chat_id = ?', [chatId])
      .then(function () {
        if (unique.length === 0) return null;
        var chain = Promise.resolve();
        for (var start = 0; start < unique.length; start += BINDING_INSERT_BATCH_SIZE) {
          (function (offset) {
            chain = chain.then(function () {
              var batch = unique.slice(offset, offset + BINDING_INSERT_BATCH_SIZE);
              var rowsSql = batch.map(function () { return '(?, ?, ?)'; }).join(', ');
              var values = [];
              batch.forEach(function (tid) { values.push(chatId, tid, assignedAt); });
              return sqlExecute(
                'INSERT OR IGNORE INTO tag_bindings (chat_id, tag_id, assigned_at) VALUES ' + rowsSql,
                values
              );
            });
          })(start);
        }
        return chain;
      })
      .then(function () {
        recordWrite('replaceForChat');
        notifySubscribers({ source: 'local', op: 'replaceForChat', chatId: chatId, count: unique.length });
        return true;
      })
      .catch(function (e) { recordError('replaceForChat', e); return false; });
  }

  /* listChats(tagId): hydrate full chat rows via store.chats (matches the
   * folders/labels pattern). Returns [] if store.chats is missing. */
  function listChats(tagIdInput) {
    var tagId = getTagId(tagIdInput);
    if (!tagId) return Promise.resolve([]);
    return sqlSelect(
      'SELECT chat_id FROM tag_bindings WHERE tag_id = ? ORDER BY assigned_at DESC',
      [tagId]
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

  /* listForChat(chatId): may return multiple tags. Single IN (?,?,...)
   * SELECT against the tags table since the row projector lives here. */
  function listForChat(chatIdInput) {
    var chatId = String(chatIdInput || '').trim();
    if (!chatId) return Promise.resolve([]);
    return sqlSelect(
      'SELECT tag_id FROM tag_bindings WHERE chat_id = ? ORDER BY assigned_at DESC',
      [chatId]
    ).then(function (rows) {
      var tagIds = (rows || []).map(function (r) { return r && r.tag_id; }).filter(function (id) { return !!id; });
      if (tagIds.length === 0) return [];
      var placeholders = tagIds.map(function () { return '?'; }).join(',');
      return sqlSelect('SELECT * FROM tags WHERE id IN (' + placeholders + ')', tagIds)
        .then(function (rows2) {
          var byId = Object.create(null);
          (rows2 || []).forEach(function (r) { var js = rowToJs(r); if (js) byId[js.tagId] = js; });
          /* Preserve the assigned_at DESC ordering of the binding query. */
          return tagIds.map(function (id) { return byId[id]; }).filter(function (x) { return !!x; });
        });
    }).catch(function (e) { recordError('listForChat', e); return []; });
  }

  function getAll() { return listTags(); }

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
      return countTags().then(function (n) { return { rowCount: n }; });
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
    return countTags().then(function (n) { return { rowCount: n }; })
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
      tables: ['tags', 'tag_bindings'],
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
    list: listTags,
    reload: reload,
    saveNow: saveNow,
    subscribe: subscribe,
    diagnose: diagnose,
    /* tag-specific */
    get: getById,
    create: create,
    upsert: upsert,
    patch: patchOne,
    remove: remove,
    'delete': remove,
    bindChat: bindChat,
    unbindChat: unbindChat,
    replaceForChat: replaceForChat,
    listChats: listChats,
    listForChat: listForChat,
    count: countTags,
  };
  store.__registerEntity('tags', api);

  global.setTimeout(function () {
    init().catch(function (e) { recordError('autoInit', e); });
  }, 0);
})(typeof window !== 'undefined' ? window : globalThis);
