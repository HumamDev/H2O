/* H2O Studio Store — Snapshots Entity (Desktop / Tauri SQLite)
 *
 * M2a-3b — second table-aware entity store. Backs the SQLite `snapshots`
 * + `snapshot_turns` tables defined in apps/studio-desktop/src-tauri/src/lib.rs
 * (Migration v5).
 *
 * Desktop-only: gates on Tauri detection at load. On MV3 / web this file is
 * a silent no-op and registers nothing. No MV3 behavior is changed by this
 * file.
 *
 * Source-of-truth: SQLite `snapshots` + `snapshot_turns` tables on Desktop V1.
 * Per the corrected V1 ingestion model, snapshots arrive via Save-to-Folder
 * (M2b ingestion plumbing — NOT this commit). This commit is data-layer only;
 * the snapshot reader UI and Save-to-Folder ingestion are deferred.
 *
 * Contract: matches surfaces/studio/store/chats.tauri.js's standard surface
 *   (init / dispose / isReady / getAll / list / reload / saveNow / subscribe
 *   / diagnose) plus snapshot-specific methods (get / listByChat / create /
 *   upsert / patch / remove / delete / pin / count).
 *
 * Persistence model: writes hit SQLite immediately. There is no native
 * transaction wrapper for raw `invoke('plugin:sql|execute', ...)` so writes
 * are sequential, not atomic across snapshot+turns. Acceptable for V1
 * (single-window, single-writer); on partial-failure the next upsert
 * resets state because turns are full-replaced via DELETE+INSERT.
 *
 * Subscribers are in-process only — single-window V1; cross-window sync is
 * a later phase (Tauri events).
 *
 * Camel-case JS rows ↔ snake-case SQL columns via projector maps. Unknown
 * JS fields on a snapshot patch get merged into the catch-all `meta_json`
 * column rather than rejected; same for turn meta_json.
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
    try { console.warn('[H2O.Studio.store.snapshots] H2O.Studio.store not present; entity not registered'); }
    catch (_) { /* ignore */ }
    return;
  }
  if (store.snapshots && store.snapshots.__installed) return;

  /* ── Constants ────────────────────────────────────────────────────── */
  var DB_URL = 'sqlite:studio-v1.db';
  var SCHEMA_VERSION = 1;
  var READY_POLL_INTERVAL_MS = 100;
  var READY_POLL_MAX_TRIES = 100; /* ~10s upper bound */
  /* SQLite default SQLITE_LIMIT_VARIABLE_NUMBER is 999. Each turn binds 6
   * values; cap the batch so 6N stays under the limit with headroom. */
  var TURN_INSERT_BATCH_SIZE = 100;

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

  /* tauri-plugin-sql v2's execute returns the Rust tuple (u64, i64) =
   * (rows_affected, last_insert_id), serialized as JSON array
   * [rowsAffected, lastInsertId]. Tolerate object shapes for forward-compat. */
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

  /* ── Row projectors ───────────────────────────────────────────────── */
  /* Schema source: src-tauri/src/lib.rs Migration v5. Keep in sync. */
  var SNAP_COL_TO_FIELD = {
    id:            'snapshotId',
    chat_id:       'chatId',
    title:         'title',
    digest:        'digest',
    message_count: 'messageCount',
    pinned:        'pinned',
    legacy:        'legacy',
    captured_at:   'capturedAt',
    updated_at:    'updatedAt',
    meta_json:     'meta',
  };
  var SNAP_FIELD_TO_COL = (function () {
    var out = Object.create(null);
    Object.keys(SNAP_COL_TO_FIELD).forEach(function (col) { out[SNAP_COL_TO_FIELD[col]] = col; });
    /* Accept `id` as an alias for `snapshotId` on input patches. */
    out.id = 'id';
    return out;
  })();
  var SNAP_BOOL_COLS = { pinned: true, legacy: true };

  var TURN_COL_TO_FIELD = {
    snapshot_id: 'snapshotId',
    turn_idx:    'turnIdx',
    role:        'role',
    outer_html:  'outerHtml',
    text:        'text',
    meta_json:   'meta',
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

  function snapRowToJs(sqlRow) {
    if (!sqlRow || typeof sqlRow !== 'object') return null;
    var js = {};
    Object.keys(SNAP_COL_TO_FIELD).forEach(function (col) {
      var field = SNAP_COL_TO_FIELD[col];
      var val = sqlRow[col];
      if (col === META_COL) {
        js.meta = parseMeta(val);
      } else if (SNAP_BOOL_COLS[col]) {
        js[field] = !!Number(val);
      } else {
        js[field] = (val === null || typeof val === 'undefined') ? null : val;
      }
    });
    return js;
  }

  function turnRowToJs(sqlRow) {
    if (!sqlRow || typeof sqlRow !== 'object') return null;
    var js = {};
    Object.keys(TURN_COL_TO_FIELD).forEach(function (col) {
      var field = TURN_COL_TO_FIELD[col];
      var val = sqlRow[col];
      if (col === META_COL) {
        js.meta = parseMeta(val);
      } else {
        js[field] = (val === null || typeof val === 'undefined') ? null : val;
      }
    });
    return js;
  }

  function getSnapshotId(input) {
    if (input == null) return null;
    if (typeof input === 'string') return input.trim() || null;
    if (typeof input === 'object') {
      var v = (typeof input.snapshotId === 'string' && input.snapshotId)
        || (typeof input.id === 'string' && input.id)
        || null;
      return v ? v.trim() || null : null;
    }
    return null;
  }

  function generateSnapshotId() {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') {
        return 'snap_' + global.crypto.randomUUID();
      }
    } catch (_) { /* fall through */ }
    return 'snap_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }

  /* Translate a snapshot JS patch (camelCase) into { columns, mergeMeta }.
   * Unknown fields fall through to mergeMeta. */
  function snapPatchToCols(patch) {
    var columns = Object.create(null);
    var mergeMeta = null;
    if (!patch || typeof patch !== 'object') return { columns: columns, mergeMeta: mergeMeta };
    Object.keys(patch).forEach(function (field) {
      if (field === 'snapshotId' || field === 'id') return; /* PK handled separately */
      if (field === 'turns') return; /* turns are written separately */
      if (field === 'meta') {
        if (patch.meta && typeof patch.meta === 'object' && !Array.isArray(patch.meta)) {
          mergeMeta = patch.meta;
        }
        return;
      }
      var col = SNAP_FIELD_TO_COL[field];
      var val = patch[field];
      if (!col) {
        mergeMeta = mergeMeta || {};
        mergeMeta[field] = val;
        return;
      }
      if (val === undefined) return;
      if (SNAP_BOOL_COLS[col]) {
        columns[col] = val ? 1 : 0;
      } else {
        columns[col] = val;
      }
    });
    return { columns: columns, mergeMeta: mergeMeta };
  }

  /* Normalize a `turns` input array. Each item becomes
   * { turnIdx, role, outerHtml, text, meta } with sensible defaults.
   * Explicit turnIdx wins; otherwise array index is used. */
  function normalizeTurns(turns) {
    if (!Array.isArray(turns)) return [];
    return turns.map(function (t, idx) {
      if (!t || typeof t !== 'object') t = {};
      var turnIdx = (typeof t.turnIdx === 'number' && isFinite(t.turnIdx)) ? Math.floor(t.turnIdx) : idx;
      var role = typeof t.role === 'string' ? t.role : '';
      var outerHtml = typeof t.outerHtml === 'string' ? t.outerHtml : '';
      var text = typeof t.text === 'string' ? t.text : '';
      var meta = (t.meta && typeof t.meta === 'object' && !Array.isArray(t.meta)) ? t.meta : {};
      /* Capture any unknown fields (e.g. richTurns extras) into meta. */
      Object.keys(t).forEach(function (k) {
        if (k === 'turnIdx' || k === 'role' || k === 'outerHtml' || k === 'text' || k === 'meta') return;
        if (k === 'snapshotId' || k === 'snapshot_id') return;
        meta = meta === t.meta ? Object.assign({}, t.meta || {}) : meta;
        meta[k] = t[k];
      });
      return { turnIdx: turnIdx, role: role, outerHtml: outerHtml, text: text, meta: meta };
    });
  }

  /* Filter helper: { chatId?, pinned?, legacy? } → { sql, values } */
  function buildSnapWhere(filter) {
    var where = [];
    var values = [];
    var f = filter || {};
    if (typeof f.chatId === 'string' && f.chatId) { where.push('chat_id = ?'); values.push(f.chatId); }
    if (typeof f.pinned === 'boolean') { where.push('pinned = ?'); values.push(f.pinned ? 1 : 0); }
    if (typeof f.legacy === 'boolean') { where.push('legacy = ?'); values.push(f.legacy ? 1 : 0); }
    return { sql: where.length ? (' WHERE ' + where.join(' AND ')) : '', values: values };
  }

  /* ── Snapshot reads ───────────────────────────────────────────────── */
  function getSnapshotById(snapshotId) {
    return sqlSelect('SELECT * FROM snapshots WHERE id = ? LIMIT 1', [snapshotId])
      .then(function (rows) {
        if (!Array.isArray(rows) || rows.length === 0) return null;
        return snapRowToJs(rows[0]);
      });
  }

  function getTurnsForSnapshot(snapshotId) {
    return sqlSelect('SELECT * FROM snapshot_turns WHERE snapshot_id = ? ORDER BY turn_idx ASC', [snapshotId])
      .then(function (rows) {
        return (rows || []).map(turnRowToJs).filter(function (r) { return r != null; });
      });
  }

  /* Public: returns { snapshot, turns } | null */
  function getCombined(snapshotIdInput) {
    var id = getSnapshotId(snapshotIdInput);
    if (!id) return Promise.resolve(null);
    return getSnapshotById(id).then(function (snap) {
      if (!snap) return null;
      return getTurnsForSnapshot(id).then(function (turns) {
        return { snapshot: snap, turns: turns };
      });
    }).catch(function (e) { recordError('get', e); return null; });
  }

  function listSnapshots(opts) {
    opts = opts || {};
    var w = buildSnapWhere(opts.filter);
    var sql = 'SELECT * FROM snapshots' + w.sql;
    var sortCol = 'captured_at';
    var sortDir = 'DESC';
    if (opts.sort && typeof opts.sort === 'object') {
      var sf = SNAP_FIELD_TO_COL[opts.sort.field] || null;
      if (sf) sortCol = sf;
      if (opts.sort.dir === 'ASC' || opts.sort.dir === 'asc') sortDir = 'ASC';
    }
    sql += ' ORDER BY ' + sortCol + ' ' + sortDir;
    if (typeof opts.limit === 'number' && opts.limit > 0) {
      sql += ' LIMIT ' + Math.floor(opts.limit);
      if (typeof opts.offset === 'number' && opts.offset > 0) sql += ' OFFSET ' + Math.floor(opts.offset);
    }
    return sqlSelect(sql, w.values)
      .then(function (rows) { return (rows || []).map(snapRowToJs).filter(function (r) { return r != null; }); })
      .catch(function (e) { recordError('list', e); return []; });
  }

  function listByChat(chatId) {
    var safe = String(chatId || '').trim();
    if (!safe) return Promise.resolve([]);
    return listSnapshots({ filter: { chatId: safe } });
  }

  function countSnapshots(filter) {
    var w = buildSnapWhere(filter);
    return sqlSelect('SELECT COUNT(*) AS n FROM snapshots' + w.sql, w.values)
      .then(function (rows) {
        if (Array.isArray(rows) && rows.length > 0 && typeof rows[0].n === 'number') return rows[0].n;
        return 0;
      })
      .catch(function (e) { recordError('count', e); return 0; });
  }

  /* ── Snapshot writes ──────────────────────────────────────────────── */
  /* DELETE existing turns for this snapshot, then INSERT the provided list
   * in chunked batches. Resolves once all batches complete. */
  function replaceTurns(snapshotId, turns) {
    return sqlExecute('DELETE FROM snapshot_turns WHERE snapshot_id = ?', [snapshotId])
      .then(function () {
        if (!Array.isArray(turns) || turns.length === 0) return null;
        var chain = Promise.resolve();
        for (var start = 0; start < turns.length; start += TURN_INSERT_BATCH_SIZE) {
          (function (offset) {
            chain = chain.then(function () {
              var batch = turns.slice(offset, offset + TURN_INSERT_BATCH_SIZE);
              var rowSql = '(?, ?, ?, ?, ?, ?)';
              var rowsSql = batch.map(function () { return rowSql; }).join(', ');
              var values = [];
              batch.forEach(function (t) {
                values.push(snapshotId, t.turnIdx, t.role, t.outerHtml, t.text, JSON.stringify(t.meta || {}));
              });
              return sqlExecute(
                'INSERT INTO snapshot_turns (snapshot_id, turn_idx, role, outer_html, text, meta_json) VALUES ' + rowsSql,
                values
              );
            });
          })(start);
        }
        return chain;
      });
  }

  /* Accept either wrapped `{ snapshot, turns }` or flat
   * `{ chatId, title, capturedAt, turns, ... }`. Returns
   * { snapshotPatch, turns } where snapshotPatch carries snapshotId. */
  function unwrapInput(input, opts) {
    var wrapped = (input && typeof input === 'object' && input.snapshot && typeof input.snapshot === 'object');
    var snapshotPatch = wrapped ? Object.assign({}, input.snapshot) : Object.assign({}, input || {});
    var turnsInput = wrapped ? input.turns : (input && input.turns);
    if (!wrapped && snapshotPatch.turns) delete snapshotPatch.turns;
    var turns = normalizeTurns(turnsInput);
    /* If messageCount wasn't supplied, derive it from the turns array. */
    if (snapshotPatch.messageCount == null && turns.length > 0) {
      snapshotPatch.messageCount = turns.length;
    }
    /* For create: ensure a snapshotId. */
    if (opts && opts.generateId) {
      var id = getSnapshotId(snapshotPatch);
      if (!id) {
        snapshotPatch.snapshotId = generateSnapshotId();
      }
    }
    return { snapshotPatch: snapshotPatch, turns: turns };
  }

  function upsertCore(input, opts) {
    var u = unwrapInput(input, opts);
    var snapshotId = getSnapshotId(u.snapshotPatch);
    if (!snapshotId) return Promise.reject(new Error('upsert: snapshotId required'));
    var pc = snapPatchToCols(u.snapshotPatch);
    /* chat_id is NOT NULL with no default — required on INSERT. */
    return getSnapshotById(snapshotId).then(function (existing) {
      if (pc.mergeMeta) {
        var merged = Object.assign({}, (existing && existing.meta) || {}, pc.mergeMeta);
        pc.columns.meta_json = JSON.stringify(merged);
      }
      var now = Date.now();
      if (!('updated_at' in pc.columns)) pc.columns.updated_at = now;
      var doSnapshotWrite;
      if (existing) {
        var setClauses = [];
        var values = [];
        Object.keys(pc.columns).forEach(function (col) {
          setClauses.push(col + ' = ?');
          values.push(pc.columns[col]);
        });
        if (setClauses.length === 0) {
          doSnapshotWrite = Promise.resolve();
        } else {
          values.push(snapshotId);
          doSnapshotWrite = sqlExecute('UPDATE snapshots SET ' + setClauses.join(', ') + ' WHERE id = ?', values);
        }
      } else {
        if (!pc.columns.chat_id) {
          return Promise.reject(new Error('upsert: chatId required for new snapshot'));
        }
        if (!('captured_at' in pc.columns)) pc.columns.captured_at = now;
        var cols = ['id'];
        var ph = ['?'];
        var vals = [snapshotId];
        Object.keys(pc.columns).forEach(function (col) {
          cols.push(col); ph.push('?'); vals.push(pc.columns[col]);
        });
        doSnapshotWrite = sqlExecute(
          'INSERT INTO snapshots (' + cols.join(', ') + ') VALUES (' + ph.join(', ') + ')',
          vals
        );
      }
      return doSnapshotWrite
        .then(function () { return replaceTurns(snapshotId, u.turns); })
        .then(function () { return getCombined(snapshotId); })
        .then(function (combined) {
          recordWrite(existing ? 'upsert.update' : 'upsert.insert');
          notifySubscribers({
            source: 'local',
            op: existing ? 'upsert' : 'create',
            snapshotId: snapshotId,
            mode: existing ? 'update' : 'insert',
          });
          return combined;
        });
    });
  }

  function upsert(input) { return upsertCore(input, { generateId: false }); }
  function create(input) { return upsertCore(input, { generateId: true }); }

  /* patch: snapshot row only, turns untouched unless explicitly provided. */
  function patchOne(snapshotIdInput, partial) {
    var id = getSnapshotId(snapshotIdInput);
    if (!id) return Promise.reject(new Error('patch: snapshotId required'));
    if (!partial || typeof partial !== 'object') return getCombined(id);
    var merged = Object.assign({}, partial, { snapshotId: id });
    /* If caller didn't supply turns, drop the key so upsertCore leaves them. */
    if (!('turns' in merged) || !Array.isArray(merged.turns)) {
      delete merged.turns;
      /* Use a custom path that skips replaceTurns if no turns were provided. */
      var pc = snapPatchToCols(merged);
      return getSnapshotById(id).then(function (existing) {
        if (!existing) return null;
        if (pc.mergeMeta) {
          var mergedMeta = Object.assign({}, existing.meta || {}, pc.mergeMeta);
          pc.columns.meta_json = JSON.stringify(mergedMeta);
        }
        if (!('updated_at' in pc.columns)) pc.columns.updated_at = Date.now();
        var setClauses = [];
        var values = [];
        Object.keys(pc.columns).forEach(function (col) {
          setClauses.push(col + ' = ?');
          values.push(pc.columns[col]);
        });
        if (setClauses.length === 0) return getCombined(id);
        values.push(id);
        return sqlExecute('UPDATE snapshots SET ' + setClauses.join(', ') + ' WHERE id = ?', values)
          .then(function () { return getCombined(id); })
          .then(function (combined) {
            recordWrite('patch');
            notifySubscribers({ source: 'local', op: 'patch', snapshotId: id });
            return combined;
          });
      });
    }
    return upsertCore(merged, { generateId: false });
  }

  function pin(snapshotIdInput, pinned) {
    var id = getSnapshotId(snapshotIdInput);
    if (!id) return Promise.reject(new Error('pin: snapshotId required'));
    var val = pinned ? 1 : 0;
    var now = Date.now();
    return sqlExecute('UPDATE snapshots SET pinned = ?, updated_at = ? WHERE id = ?', [val, now, id])
      .then(function (result) {
        var ok = readRowsAffected(result) > 0;
        if (ok) {
          recordWrite('pin');
          notifySubscribers({ source: 'local', op: 'pin', snapshotId: id, pinned: !!pinned });
        }
        return getCombined(id);
      })
      .catch(function (e) { recordError('pin', e); return null; });
  }

  function remove(snapshotIdInput) {
    var id = getSnapshotId(snapshotIdInput);
    if (!id) return Promise.resolve(false);
    /* Delete turns first so a partial failure doesn't leave orphan turn rows
     * referencing a missing snapshot. snapshot row delete is the authoritative
     * indicator of success. */
    return sqlExecute('DELETE FROM snapshot_turns WHERE snapshot_id = ?', [id])
      .then(function () {
        return sqlExecute('DELETE FROM snapshots WHERE id = ?', [id]);
      })
      .then(function (result) {
        var ok = readRowsAffected(result) > 0;
        if (ok) {
          recordWrite('remove');
          notifySubscribers({ source: 'local', op: 'remove', snapshotId: id });
        }
        return ok;
      })
      .catch(function (e) { recordError('remove', e); return false; });
  }

  /* getAll: snapshot rows only (no turns). Use get(id) for full hydration. */
  function getAll() { return listSnapshots(); }

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
      return countSnapshots().then(function (n) { return { rowCount: n }; });
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
    return countSnapshots().then(function (n) { return { rowCount: n }; })
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
      tables: ['snapshots', 'snapshot_turns'],
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
    list: listSnapshots,
    reload: reload,
    saveNow: saveNow,
    subscribe: subscribe,
    diagnose: diagnose,
    /* snapshot-specific */
    get: getCombined,
    listByChat: listByChat,
    create: create,
    upsert: upsert,
    patch: patchOne,
    remove: remove,
    'delete': remove,
    pin: pin,
    count: countSnapshots,
  };
  store.__registerEntity('snapshots', api);

  global.setTimeout(function () {
    init().catch(function (e) { recordError('autoInit', e); });
  }, 0);
})(typeof window !== 'undefined' ? window : globalThis);
