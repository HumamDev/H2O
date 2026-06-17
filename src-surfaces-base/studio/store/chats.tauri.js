/* H2O Studio Store — Chats Entity (Desktop / Tauri SQLite)
 *
 * M2a-3a — first table-aware entity store. Backs the SQLite `chats` table
 * defined in apps/studio/desktop/src-tauri/src/lib.rs (Migrations v2 + v4).
 *
 * Desktop-only: gates on Tauri detection at load. On MV3 / web this file is
 * a silent no-op and registers nothing. No MV3 behavior is changed by this
 * file.
 *
 * Source-of-truth: SQLite `chats` table on Desktop V1. ChatRegistry /
 * LibraryIndex wiring is intentionally NOT done in this commit — this is
 * the data layer only.
 *
 * Contract: matches surfaces/studio/store/libraryIndex.js's standard surface
 *   (init / dispose / isReady / getAll / list / reload / saveNow / subscribe
 *   / diagnose) plus chat-specific methods (get / getByHref / upsert / patch
 *   / archiveExisting / remove / delete / markSaved / markLinked / count).
 *
 * Persistence model: writes hit SQLite immediately; saveNow() is a no-op.
 * Subscribers are in-process only — single-window V1; cross-window sync is
 * a later phase (Tauri events).
 *
 * Camel-case JS rows ↔ snake-case SQL columns via a pair of projector maps.
 * Unknown JS fields on a patch get merged into the catch-all `meta_json`
 * column rather than rejected.
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
    try { console.warn('[H2O.Studio.store.chats] H2O.Studio.store not present; entity not registered'); }
    catch (_) { /* ignore */ }
    return;
  }
  if (store.chats && store.chats.__installed) return;

  /* ── Constants ────────────────────────────────────────────────────── */
  var DB_URL = 'sqlite:studio-v1.db';
  var SCHEMA_VERSION = 1;
  var READY_POLL_INTERVAL_MS = 100;
  var READY_POLL_MAX_TRIES = 100; /* ~10s upper bound on SQLite readiness wait */

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

  /* tauri-plugin-sql v2's execute command returns a Rust tuple (u64, i64) =
   * (rows_affected, last_insert_id), which Tauri serializes as a JSON array
   * [rowsAffected, lastInsertId]. Some build/version permutations have
   * historically surfaced object shapes too, so we tolerate both. */
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

  /* Wait for the SQLite-backed chrome.storage.local upgrade in
   * platform.tauri.js to complete before issuing queries. The upgrade is
   * async (plugin:sql|load + one-shot localStorage→SQLite copy), and our
   * init() may run before it finishes. Poll the platform diagnostic until
   * backend === 'sqlite' or we time out. */
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

  /* ── Row projector ────────────────────────────────────────────────── */
  /* Schema source: src-tauri/src/lib.rs (Migration v2 + v4). Keep this map
   * in sync with the SQL schema. Columns added in future migrations need a
   * matching entry here AND a same-named entry in FIELD_TO_COL. */
  var COL_TO_FIELD = {
    id:                   'chatId',
    source_id:            'sourceId',
    title:                'title',
    created_at:           'createdAt',
    updated_at:           'updatedAt',
    last_message_at:      'lastMessageAt',
    message_count:        'messageCount',
    user_turn_count:      'userTurnCount',
    assistant_turn_count: 'assistantTurnCount',
    is_pinned:            'isPinned',
    is_archived:          'isArchived',
    is_starred:           'isStarred',
    is_deleted:           'isDeleted',
    folder_id:            'folderId',
    category_id:          'categoryId',
    project_id:           'projectId',
    current_leaf_id:      'currentLeafId',
    import_batch_id:      'importBatchId',
    meta_json:            'meta',
    is_saved:             'isSaved',
    is_linked:            'isLinked',
    linked_at:            'linkedAt',
    linked_from:          'linkedFrom',
    link_source_href:     'linkSourceHref',
    href:                 'href',
    normalized_href:      'normalizedHref',
    snapshot_count:       'snapshotCount',
    last_snapshot_id:     'lastSnapshotId',
    last_captured_at:     'lastCapturedAt',
  };
  var FIELD_TO_COL = (function () {
    var out = Object.create(null);
    Object.keys(COL_TO_FIELD).forEach(function (col) { out[COL_TO_FIELD[col]] = col; });
    /* Accept `id` as an alias for `chatId` on input patches. */
    out.id = 'id';
    return out;
  })();
  /* INTEGER columns that semantically represent booleans. */
  var BOOL_COLS = {
    is_pinned: true, is_archived: true, is_starred: true, is_deleted: true,
    is_saved: true, is_linked: true,
  };
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

  function getChatId(input) {
    if (input == null) return null;
    if (typeof input === 'string') return input.trim() || null;
    if (typeof input === 'object') {
      var v = (typeof input.chatId === 'string' && input.chatId)
        || (typeof input.id === 'string' && input.id)
        || null;
      return v ? v.trim() || null : null;
    }
    return null;
  }

  /* Translate a JS patch (camelCase) into { columns, mergeMeta }. Unknown
   * fields fall through to mergeMeta so call sites can extend the schema
   * informally without a Rust migration. */
  function patchToCols(patch) {
    var columns = Object.create(null);
    var mergeMeta = null;
    if (!patch || typeof patch !== 'object') return { columns: columns, mergeMeta: mergeMeta };
    Object.keys(patch).forEach(function (field) {
      if (field === 'chatId' || field === 'id') return; /* PK handled separately */
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

  /* Build a WHERE clause + values array from a filter object. Returns
   * { sql: ' WHERE ...' or '', values: [...] }. */
  function buildWhere(filter) {
    var where = [];
    var values = [];
    var f = filter || {};
    function pushBool(field, col) {
      if (typeof f[field] === 'boolean') { where.push(col + ' = ?'); values.push(f[field] ? 1 : 0); }
    }
    function pushStr(field, col) {
      if (typeof f[field] === 'string' && f[field]) { where.push(col + ' = ?'); values.push(f[field]); }
    }
    pushBool('isLinked',   'is_linked');
    pushBool('isSaved',    'is_saved');
    pushBool('isPinned',   'is_pinned');
    pushBool('isArchived', 'is_archived');
    pushBool('isStarred',  'is_starred');
    pushBool('isDeleted',  'is_deleted');
    pushStr('folderId',    'folder_id');
    pushStr('categoryId',  'category_id');
    pushStr('projectId',   'project_id');
    return { sql: where.length ? (' WHERE ' + where.join(' AND ')) : '', values: values };
  }

  /* ── Hot-path queries ─────────────────────────────────────────────── */
  function getById(chatIdOrInput) {
    var id = getChatId(chatIdOrInput);
    if (!id) return Promise.resolve(null);
    return sqlSelect('SELECT * FROM chats WHERE id = ? LIMIT 1', [id])
      .then(function (rows) {
        if (!Array.isArray(rows) || rows.length === 0) return null;
        return rowToJs(rows[0]);
      })
      .catch(function (e) { recordError('get', e); return null; });
  }

  function getByHref(href) {
    var safe = String(href || '').trim();
    if (!safe) return Promise.resolve(null);
    return sqlSelect('SELECT * FROM chats WHERE href = ? OR normalized_href = ? LIMIT 1', [safe, safe])
      .then(function (rows) {
        if (!Array.isArray(rows) || rows.length === 0) return null;
        return rowToJs(rows[0]);
      })
      .catch(function (e) { recordError('getByHref', e); return null; });
  }

  function upsert(patch) {
    var chatId = getChatId(patch);
    if (!chatId) return Promise.reject(new Error('upsert: chatId required'));
    return getById(chatId).then(function (existing) {
      var pc = patchToCols(patch);
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
        values.push(chatId);
        return sqlExecute('UPDATE chats SET ' + setClauses.join(', ') + ' WHERE id = ?', values)
          .then(function () { return getById(chatId); })
          .then(function (row) {
            recordWrite('upsert.update');
            notifySubscribers({ source: 'local', op: 'upsert', chatId: chatId, mode: 'update' });
            return row;
          });
      }
      if (!('created_at' in pc.columns)) pc.columns.created_at = now;
      var cols = ['id'];
      var ph = ['?'];
      var vals = [chatId];
      Object.keys(pc.columns).forEach(function (col) {
        cols.push(col); ph.push('?'); vals.push(pc.columns[col]);
      });
      return sqlExecute(
        'INSERT INTO chats (' + cols.join(', ') + ') VALUES (' + ph.join(', ') + ')',
        vals
      ).then(function () { return getById(chatId); })
        .then(function (row) {
          recordWrite('upsert.insert');
          notifySubscribers({ source: 'local', op: 'upsert', chatId: chatId, mode: 'insert' });
          return row;
        });
    });
  }

  function patchOne(chatIdInput, partial) {
    var id = getChatId(chatIdInput);
    if (!id) return Promise.reject(new Error('patch: chatId required'));
    if (!partial || typeof partial !== 'object') return getById(id);
    var merged = Object.assign({}, partial, { chatId: id });
    return upsert(merged);
  }

  function archiveExisting(chatIdInput) {
    var id = getChatId(chatIdInput);
    if (!id) return Promise.reject(new Error('archiveExisting: chatId required'));
    return getById(id).then(function (existing) {
      if (!existing) return null;
      if (existing.isArchived === true) return existing;
      var now = Date.now();
      return sqlExecute('UPDATE chats SET is_archived = 1, updated_at = ? WHERE id = ?', [now, id])
        .then(function (result) {
          if (readRowsAffected(result) <= 0) return null;
          recordWrite('archiveExisting');
          notifySubscribers({ source: 'local', op: 'archiveExisting', chatId: id, mode: 'update' });
          return getById(id);
        });
    });
  }

  function remove(chatIdInput) {
    var id = getChatId(chatIdInput);
    if (!id) return Promise.resolve(false);
    return sqlExecute('DELETE FROM chats WHERE id = ?', [id])
      .then(function (result) {
        var ok = readRowsAffected(result) > 0;
        if (ok) {
          recordWrite('remove');
          notifySubscribers({ source: 'local', op: 'remove', chatId: id });
        }
        return ok;
      })
      .catch(function (e) { recordError('remove', e); return false; });
  }

  function markSaved(chatIdInput, opts) {
    var id = getChatId(chatIdInput);
    if (!id) return Promise.reject(new Error('markSaved: chatId required'));
    var o = opts || {};
    var savedAt = (typeof o.savedAt === 'number' && o.savedAt > 0) ? o.savedAt : Date.now();
    return upsert({
      chatId: id,
      isSaved: true,
      lastSnapshotId: o.snapshotId || null,
      lastCapturedAt: savedAt,
    });
  }

  function markLinked(chatIdInput, opts) {
    var id = getChatId(chatIdInput);
    if (!id) return Promise.reject(new Error('markLinked: chatId required'));
    var o = opts || {};
    var linkedAt = (typeof o.linkedAt === 'number' && o.linkedAt > 0) ? o.linkedAt : Date.now();
    return upsert({
      chatId: id,
      isLinked: true,
      linkSourceHref: o.linkSourceHref || '',
      linkedFrom: o.linkedFrom || '',
      linkedAt: linkedAt,
    });
  }

  function listChats(opts) {
    opts = opts || {};
    var w = buildWhere(opts.filter);
    var sql = 'SELECT * FROM chats' + w.sql;
    var sortCol = 'updated_at';
    var sortDir = 'DESC';
    if (opts.sort && typeof opts.sort === 'object') {
      var sf = FIELD_TO_COL[opts.sort.field] || null;
      if (sf) sortCol = sf;
      if (opts.sort.dir === 'ASC' || opts.sort.dir === 'asc') sortDir = 'ASC';
    }
    sql += ' ORDER BY ' + sortCol + ' ' + sortDir;
    if (typeof opts.limit === 'number' && opts.limit > 0) {
      sql += ' LIMIT ' + Math.floor(opts.limit);
      if (typeof opts.offset === 'number' && opts.offset > 0) sql += ' OFFSET ' + Math.floor(opts.offset);
    }
    return sqlSelect(sql, w.values)
      .then(function (rows) { return (rows || []).map(rowToJs).filter(function (r) { return r != null; }); })
      .catch(function (e) { recordError('list', e); return []; });
  }

  function count(filter) {
    var w = buildWhere(filter);
    return sqlSelect('SELECT COUNT(*) AS n FROM chats' + w.sql, w.values)
      .then(function (rows) {
        if (Array.isArray(rows) && rows.length > 0 && typeof rows[0].n === 'number') return rows[0].n;
        return 0;
      })
      .catch(function (e) { recordError('count', e); return 0; });
  }

  /* getAll() returns the same shape as list() with no opts. Note this is a
   * Promise on Desktop because SQLite is async — it differs from
   * libraryIndex.getAll() which returns a synchronous in-memory cache.
   * Consumers that need byte parity with libraryIndex's contract should
   * call list() explicitly. */
  function getAll() { return listChats(); }

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
      return count().then(function (n) { return { rowCount: n }; });
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
    return count().then(function (n) { return { rowCount: n }; })
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
      table: 'chats',
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
    list: listChats,
    reload: reload,
    saveNow: saveNow,
    subscribe: subscribe,
    diagnose: diagnose,
    /* chat-specific */
    get: getById,
    getByHref: getByHref,
    upsert: upsert,
    patch: patchOne,
    archiveExisting: archiveExisting,
    remove: remove,
    /* `delete` is a reserved word as a property name in legacy ES syntax;
     * it works as a string-keyed property in modern JS. Provided as an
     * alias for callers that prefer it. */
    'delete': remove,
    markSaved: markSaved,
    markLinked: markLinked,
    count: count,
  };
  store.__registerEntity('chats', api);

  /* Defer init so platform.tauri.js has time to register and start its
   * SQLite upgrade chain. waitForSqlite() then polls until the upgrade
   * completes. */
  global.setTimeout(function () {
    init().catch(function (e) { recordError('autoInit', e); });
  }, 0);
})(typeof window !== 'undefined' ? window : globalThis);
