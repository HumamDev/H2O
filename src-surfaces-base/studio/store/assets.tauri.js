/* H2O Studio Store — Assets Registry Entity (Desktop / Tauri SQLite)
 *
 * Chat Saving Architecture Phase C C2b — private/internal substrate adapter for
 * the content-addressed saved-chat asset registry. Backs the SQLite `assets`
 * + `snapshot_turn_assets` tables defined in
 * apps/studio/desktop/src-tauri/src/lib.rs (Migration v14).
 *
 * Desktop-only: gates on Tauri detection at load. On MV3 / web this file is a
 * silent no-op and registers nothing — Chrome stays light.
 *
 * SUBSTRATE ONLY. This adapter is the DB read/write surface for the registry.
 * It does NOT:
 *   - read or write any binary asset bytes / CAS file (no filesystem access),
 *   - extract images from snapshots,
 *   - materialize package assets/ directories,
 *   - perform any garbage collection.
 * Those are later Phase C slices (C3/C4/C5). See
 * docs/decisions/ADR-0010-saved-chat-asset-cas.md and
 * docs/systems/archive/saved-chat-package-format.md.
 *
 * Refcount model: `assets.refcount` is a denormalized convenience column that is
 * RECALCULATED from `snapshot_turn_assets` after every link/unlink (authoritative
 * recompute = COUNT(*) of join rows for that sha256), never maintained as an
 * incremental counter. It therefore cannot drift. No automatic GC acts on it in
 * C2b; it exists for future GC/diagnostics design.
 *
 * Persistence model: writes hit SQLite immediately through the same
 * `plugin:sql|execute` / `plugin:sql|select` path as store/snapshots.tauri.js.
 * There is no native transaction wrapper, so a link + refcount-recompute is two
 * sequential statements; because refcount is a recompute (not an increment), a
 * partial failure self-heals on the next link/unlink of that sha256.
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
    try { console.warn('[H2O.Studio.store.assets] H2O.Studio.store not present; entity not registered'); }
    catch (_) { /* ignore */ }
    return;
  }
  if (store.assets && store.assets.__installed) return;

  /* ── Constants ────────────────────────────────────────────────────── */
  var DB_URL = 'sqlite:studio-v1.db';
  var SCHEMA_VERSION = 1; /* in-record schema version; SQLite table is Migration v14 */
  var READY_POLL_INTERVAL_MS = 100;
  var READY_POLL_MAX_TRIES = 100; /* ~10s upper bound */

  /* ── State ────────────────────────────────────────────────────────── */
  var state = {
    ready: false,
    initError: null,
    lastReloadedAt: null,
    lastWriteAt: null,
    writesSinceBoot: 0,
    errors: [],
    errMax: 20,
    subscribers: new Set(),
  };

  function recordError(op, e) {
    try {
      state.errors.push({ t: Date.now(), op: String(op), e: String((e && e.stack) || e || '') });
      if (state.errors.length > state.errMax) state.errors.splice(0, state.errors.length - state.errMax);
    } catch (_) { /* swallow */ }
  }
  function recordWrite() {
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

  /* ── Helpers ──────────────────────────────────────────────────────── */
  function nowIso() {
    try { return new Date().toISOString(); }
    catch (_) { return ''; }
  }
  function cleanString(v) { return String(v == null ? '' : v).trim(); }
  function numberOrZero(v) { var n = Number(v); return Number.isFinite(n) ? n : 0; }
  function isFiniteNumber(v) { return typeof v === 'number' && Number.isFinite(v); }

  function parseMeta(raw) {
    if (raw == null) return {};
    if (typeof raw === 'object') return Array.isArray(raw) ? {} : raw;
    if (typeof raw !== 'string') return {};
    try { var v = JSON.parse(raw); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
    catch (_) { return {}; }
  }
  function stringifyMeta(meta) {
    if (meta == null) return '{}';
    if (typeof meta === 'string') return meta.trim() || '{}';
    try { return JSON.stringify(meta); } catch (_) { return '{}'; }
  }

  /* Column → camelCase field projection (schema source: lib.rs Migration v14). */
  function projectAssetRow(row) {
    if (!row || typeof row !== 'object') return null;
    var sha256 = cleanString(row.sha256);
    if (!sha256) return null;
    return {
      sha256: sha256,
      mimeType: cleanString(row.mime_type),
      ext: cleanString(row.ext),
      byteSize: numberOrZero(row.byte_size),
      createdAt: cleanString(row.created_at),
      updatedAt: cleanString(row.updated_at),
      refcount: numberOrZero(row.refcount),
      meta: parseMeta(row.meta_json),
    };
  }

  function asArray(v) { return Array.isArray(v) ? v : []; }

  /* ── Reads ────────────────────────────────────────────────────────── */
  function get(sha256Input) {
    var sha256 = cleanString(sha256Input);
    if (!sha256) return Promise.resolve(null);
    return sqlSelect('SELECT * FROM assets WHERE sha256 = ? LIMIT 1', [sha256])
      .then(function (rows) {
        var row = asArray(rows)[0];
        return row ? projectAssetRow(row) : null;
      })
      .catch(function (e) { recordError('get', e); return null; });
  }

  function listAll() {
    return sqlSelect('SELECT * FROM assets ORDER BY sha256 ASC', [])
      .then(function (rows) { return asArray(rows).map(projectAssetRow).filter(Boolean); })
      .catch(function (e) { recordError('list', e); return []; });
  }

  function count() {
    return sqlSelect('SELECT COUNT(*) AS n FROM assets', [])
      .then(function (rows) { return numberOrZero(asArray(rows)[0] && asArray(rows)[0].n); })
      .catch(function (e) { recordError('count', e); return 0; });
  }

  /* Assets linked to a snapshot (joined with their registry rows), ordered by
   * turn then sha256 for deterministic listing. */
  function listBySnapshot(snapshotIdInput) {
    var snapshotId = cleanString(snapshotIdInput);
    if (!snapshotId) return Promise.resolve([]);
    return sqlSelect(
      'SELECT a.sha256 AS sha256, a.mime_type AS mime_type, a.ext AS ext, ' +
      'a.byte_size AS byte_size, a.created_at AS created_at, a.updated_at AS updated_at, ' +
      'a.refcount AS refcount, a.meta_json AS meta_json, ' +
      'sta.turn_idx AS turn_idx, sta.relation AS relation ' +
      'FROM snapshot_turn_assets sta JOIN assets a ON a.sha256 = sta.sha256 ' +
      'WHERE sta.snapshot_id = ? ORDER BY sta.turn_idx ASC, a.sha256 ASC',
      [snapshotId]
    ).then(function (rows) {
      return asArray(rows).map(function (row) {
        var asset = projectAssetRow(row);
        if (!asset) return null;
        asset.turnIdx = numberOrZero(row.turn_idx);
        asset.relation = cleanString(row.relation) || 'inline';
        return asset;
      }).filter(Boolean);
    }).catch(function (e) { recordError('listBySnapshot', e); return []; });
  }

  /* ── Writes ───────────────────────────────────────────────────────── */
  /* Upsert a registry row. On conflict, mutable metadata is updated but
   * created_at and refcount are preserved (refcount is owned by link/unlink). */
  function upsert(input) {
    var src = (input && typeof input === 'object') ? input : {};
    var sha256 = cleanString(src.sha256);
    if (!sha256) return Promise.reject(new Error('upsert: sha256 required'));
    var ts = nowIso();
    var values = [
      sha256,
      cleanString(src.mimeType || src.mime_type),
      cleanString(src.ext),
      numberOrZero(src.byteSize != null ? src.byteSize : src.byte_size),
      ts, /* created_at (insert only) */
      ts, /* updated_at */
      stringifyMeta(src.meta != null ? src.meta : src.meta_json),
    ];
    return sqlExecute(
      'INSERT INTO assets (sha256, mime_type, ext, byte_size, created_at, updated_at, refcount, meta_json) ' +
      'VALUES (?, ?, ?, ?, ?, ?, 0, ?) ' +
      'ON CONFLICT(sha256) DO UPDATE SET ' +
      'mime_type = excluded.mime_type, ext = excluded.ext, byte_size = excluded.byte_size, ' +
      'meta_json = excluded.meta_json, updated_at = excluded.updated_at',
      values
    ).then(function () {
      recordWrite();
      notifySubscribers({ source: 'local', op: 'upsert', sha256: sha256 });
      return get(sha256);
    }).catch(function (e) { recordError('upsert', e); throw e; });
  }

  /* Recalculate assets.refcount from the join table (authoritative; never an
   * incremental counter). Returns the new refcount. */
  function recountRefs(sha256) {
    var ts = nowIso();
    return sqlExecute(
      'UPDATE assets SET refcount = (SELECT COUNT(*) FROM snapshot_turn_assets WHERE sha256 = ?), ' +
      'updated_at = ? WHERE sha256 = ?',
      [sha256, ts, sha256]
    ).then(function () {
      return sqlSelect('SELECT refcount FROM assets WHERE sha256 = ? LIMIT 1', [sha256])
        .then(function (rows) { return numberOrZero(asArray(rows)[0] && asArray(rows)[0].refcount); });
    });
  }

  function linkToTurn(input) {
    var src = (input && typeof input === 'object') ? input : {};
    var snapshotId = cleanString(src.snapshotId || src.snapshot_id);
    var sha256 = cleanString(src.sha256);
    var turnIdx = isFiniteNumber(src.turnIdx) ? Math.floor(src.turnIdx)
      : isFiniteNumber(src.turn_idx) ? Math.floor(src.turn_idx) : NaN;
    if (!snapshotId) return Promise.reject(new Error('linkToTurn: snapshotId required'));
    if (!sha256) return Promise.reject(new Error('linkToTurn: sha256 required'));
    if (!Number.isFinite(turnIdx)) return Promise.reject(new Error('linkToTurn: turnIdx required'));
    var relation = cleanString(src.relation) || 'inline';
    var ts = nowIso();
    return sqlExecute(
      'INSERT OR IGNORE INTO snapshot_turn_assets ' +
      '(snapshot_id, turn_idx, sha256, relation, created_at, meta_json) VALUES (?, ?, ?, ?, ?, ?)',
      [snapshotId, turnIdx, sha256, relation, ts, stringifyMeta(src.meta != null ? src.meta : src.meta_json)]
    ).then(function () {
      return recountRefs(sha256);
    }).then(function (refcount) {
      recordWrite();
      notifySubscribers({ source: 'local', op: 'linkToTurn', snapshotId: snapshotId, turnIdx: turnIdx, sha256: sha256 });
      return { ok: true, snapshotId: snapshotId, turnIdx: turnIdx, sha256: sha256, relation: relation, refcount: refcount };
    }).catch(function (e) { recordError('linkToTurn', e); throw e; });
  }

  function unlinkFromTurn(input) {
    var src = (input && typeof input === 'object') ? input : {};
    var snapshotId = cleanString(src.snapshotId || src.snapshot_id);
    var sha256 = cleanString(src.sha256);
    var turnIdx = isFiniteNumber(src.turnIdx) ? Math.floor(src.turnIdx)
      : isFiniteNumber(src.turn_idx) ? Math.floor(src.turn_idx) : NaN;
    if (!snapshotId) return Promise.reject(new Error('unlinkFromTurn: snapshotId required'));
    if (!sha256) return Promise.reject(new Error('unlinkFromTurn: sha256 required'));
    if (!Number.isFinite(turnIdx)) return Promise.reject(new Error('unlinkFromTurn: turnIdx required'));
    return sqlExecute(
      'DELETE FROM snapshot_turn_assets WHERE snapshot_id = ? AND turn_idx = ? AND sha256 = ?',
      [snapshotId, turnIdx, sha256]
    ).then(function (result) {
      var removed = readRowsAffected(result) > 0;
      return recountRefs(sha256).then(function (refcount) {
        if (removed) {
          recordWrite();
          notifySubscribers({ source: 'local', op: 'unlinkFromTurn', snapshotId: snapshotId, turnIdx: turnIdx, sha256: sha256 });
        }
        return { ok: true, removed: removed, snapshotId: snapshotId, turnIdx: turnIdx, sha256: sha256, refcount: refcount };
      });
    }).catch(function (e) { recordError('unlinkFromTurn', e); throw e; });
  }

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
    return count().then(function (n) { return { rowCount: n }; }).catch(function () { return { rowCount: 0 }; });
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
      tables: ['assets', 'snapshot_turn_assets'],
      refcountModel: 'recomputed-from-join (no incremental counters, no GC)',
      casImplemented: false,
      lastReloadedAt: state.lastReloadedAt,
      lastWriteAt: state.lastWriteAt,
      writesSinceBoot: state.writesSinceBoot,
      subscribers: state.subscribers.size,
      initError: state.initError,
      errors: state.errors.slice(),
    };
  }

  /* ── Register & schedule init ─────────────────────────────────────── */
  var api = {
    __installed: true,
    __version: '0.1.0-phase-c-c2b',
    init: init,
    dispose: dispose,
    isReady: isReady,
    getAll: listAll,
    list: listAll,
    reload: reload,
    saveNow: saveNow,
    subscribe: subscribe,
    diagnose: diagnose,
    /* assets-specific */
    get: get,
    upsert: upsert,
    listBySnapshot: listBySnapshot,
    linkToTurn: linkToTurn,
    unlinkFromTurn: unlinkFromTurn,
    recountRefs: recountRefs,
    count: count,
  };
  store.__registerEntity('assets', api);

  global.setTimeout(function () {
    init().catch(function (e) { recordError('autoInit', e); });
  }, 0);
})(typeof window !== 'undefined' ? window : globalThis);
