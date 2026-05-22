/* H2O Studio Store — Edit Overlay Entity (Phase 2a)
 *
 * Per-snapshot non-destructive overlay persistence. This store only owns
 * overlay records; it never applies overlays and never mutates snapshots.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.store = H2O.Studio.store || {};

  if (H2O.Studio.store.editOverlay && H2O.Studio.store.editOverlay.__installed) {
    return;
  }

  var VERSION = '0.1.0-phase-2a';
  var OverlayKeys = H2O.Studio.OverlayKeys || {
    schemaVersion: 1,
    prefix: 'h2o:studio:edit-overlay:v1:',
    index: 'h2o:studio:edit-overlay:v1:index',
    record: function (snapshotId) { return 'h2o:studio:edit-overlay:v1:' + encodeURIComponent(String(snapshotId || '')); },
  };
  var OverlayEvents = H2O.Studio.OverlayEvents || {
    changed: 'evt:h2o:studio:overlay:changed',
    removed: 'evt:h2o:studio:overlay:removed',
  };
  var SCHEMA_VERSION = Number(OverlayKeys.schemaVersion || 1);
  var KEY_PREFIX = String(OverlayKeys.prefix || 'h2o:studio:edit-overlay:v1:');
  var KEY_INDEX = String(OverlayKeys.index || (KEY_PREFIX + 'index'));

  var cache = new Map();
  var subscribers = new Set();
  var errors = [];
  var errMax = 20;
  var registeredWithStoreIndex = false;

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value == null ? null : value)); }
    catch (_) { return value == null ? null : {}; }
  }

  function recordError(op, e) {
    try {
      errors.push({ t: Date.now(), op: String(op), e: String((e && e.message) || (e && e.stack) || e || '') });
      if (errors.length > errMax) errors.splice(0, errors.length - errMax);
    } catch (_) { /* swallow */ }
  }

  function emit(name, detail) {
    try {
      if (H2O.events && typeof H2O.events.emit === 'function') {
        H2O.events.emit(name, detail || {});
      } else if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
        global.dispatchEvent(new global.CustomEvent(name, { detail: detail || {} }));
      }
    } catch (e) { recordError('emit:' + name, e); }
  }

  function notify(event) {
    subscribers.forEach(function (fn) {
      try { fn(event); }
      catch (e) { recordError('subscriber', e); }
    });
  }

  function getPlatformStorage() {
    try {
      return H2O.Studio && H2O.Studio.platform && H2O.Studio.platform.storage;
    } catch (_) { return null; }
  }

  function storageGet(key) {
    var ps = getPlatformStorage();
    if (!ps || typeof ps.get !== 'function') return Promise.resolve(null);
    try { return Promise.resolve(ps.get(key)); }
    catch (e) { recordError('storageGet:' + key, e); return Promise.resolve(null); }
  }

  function storageSet(key, value) {
    var ps = getPlatformStorage();
    if (!ps || typeof ps.set !== 'function') return Promise.reject(new Error('platform storage unavailable'));
    if (String(key).indexOf(KEY_PREFIX) !== 0) return Promise.reject(new Error('refusing non-overlay key'));
    try { return Promise.resolve(ps.set(key, value)); }
    catch (e) { return Promise.reject(e); }
  }

  function storageRemove(key) {
    var ps = getPlatformStorage();
    if (!ps || typeof ps.remove !== 'function') return Promise.reject(new Error('platform storage unavailable'));
    if (String(key).indexOf(KEY_PREFIX) !== 0) return Promise.reject(new Error('refusing non-overlay key'));
    try { return Promise.resolve(ps.remove(key)); }
    catch (e) { return Promise.reject(e); }
  }

  function snapshotIdOf(value) {
    if (isObject(value)) return String(value.snapshotId || value.id || '').trim();
    return String(value == null ? '' : value).trim();
  }

  function keyFor(snapshotId) {
    var sid = snapshotIdOf(snapshotId);
    if (!sid) return '';
    if (OverlayKeys && typeof OverlayKeys.record === 'function') return OverlayKeys.record(sid);
    return KEY_PREFIX + encodeURIComponent(sid);
  }

  function normalizeRecord(input) {
    if (!isObject(input)) return null;
    var snapshotId = snapshotIdOf(input.snapshotId || input.id);
    if (!snapshotId) return null;
    var now = new Date().toISOString();
    var ops = Array.isArray(input.ops) ? clone(input.ops) : [];
    var undoStack = Array.isArray(input.undoStack) ? clone(input.undoStack) : [];
    var redoStack = Array.isArray(input.redoStack) ? clone(input.redoStack) : [];
    return {
      id: String(input.id || snapshotId),
      schemaVersion: Number(input.schemaVersion || SCHEMA_VERSION),
      snapshotId: snapshotId,
      chatId: String(input.chatId || ''),
      baseDigest: String(input.baseDigest || ''),
      createdAt: String(input.createdAt || now),
      updatedAt: String(input.updatedAt || now),
      ops: Array.isArray(ops) ? ops : [],
      undoStack: Array.isArray(undoStack) ? undoStack : [],
      redoStack: Array.isArray(redoStack) ? redoStack : [],
    };
  }

  function readIndex() {
    return storageGet(KEY_INDEX).then(function (value) {
      if (Array.isArray(value)) return value.map(snapshotIdOf).filter(Boolean);
      if (isObject(value) && Array.isArray(value.snapshotIds)) {
        return value.snapshotIds.map(snapshotIdOf).filter(Boolean);
      }
      return [];
    }, function (e) {
      recordError('readIndex', e);
      return [];
    });
  }

  function writeIndex(ids) {
    var unique = [];
    var seen = Object.create(null);
    (Array.isArray(ids) ? ids : []).forEach(function (id) {
      var sid = snapshotIdOf(id);
      if (!sid || seen[sid]) return;
      seen[sid] = true;
      unique.push(sid);
    });
    return storageSet(KEY_INDEX, unique);
  }

  function addToIndex(snapshotId) {
    return readIndex().then(function (ids) {
      var sid = snapshotIdOf(snapshotId);
      if (!sid) return ids;
      if (ids.indexOf(sid) === -1) ids.push(sid);
      return writeIndex(ids).then(function () { return ids; });
    });
  }

  function removeFromIndex(snapshotId) {
    return readIndex().then(function (ids) {
      var sid = snapshotIdOf(snapshotId);
      var next = ids.filter(function (id) { return id !== sid; });
      return writeIndex(next).then(function () { return next; });
    });
  }

  function get(snapshotId) {
    var sid = snapshotIdOf(snapshotId);
    if (!sid) return Promise.resolve(null);
    if (cache.has(sid)) return Promise.resolve(clone(cache.get(sid)));
    var key = keyFor(sid);
    return storageGet(key).then(function (value) {
      var rec = normalizeRecord(value);
      if (rec) cache.set(sid, rec);
      return clone(rec);
    }, function (e) {
      recordError('get:' + sid, e);
      return null;
    });
  }

  function upsert(input) {
    var rec = normalizeRecord(input);
    if (!rec) return Promise.reject(new Error('invalid edit overlay record'));
    if (!rec.baseDigest) return Promise.reject(new Error('edit overlay baseDigest is required'));
    rec.updatedAt = new Date().toISOString();
    if (!rec.createdAt) rec.createdAt = rec.updatedAt;
    var key = keyFor(rec.snapshotId);
    return storageSet(key, rec).then(function () {
      cache.set(rec.snapshotId, clone(rec));
      return addToIndex(rec.snapshotId);
    }).then(function () {
      var out = clone(rec);
      var event = { type: 'upsert', snapshotId: rec.snapshotId, key: key, value: out, at: Date.now(), source: 'local' };
      notify(event);
      emit(OverlayEvents.changed, event);
      return out;
    }, function (e) {
      recordError('upsert:' + rec.snapshotId, e);
      throw e;
    });
  }

  function remove(snapshotId) {
    var sid = snapshotIdOf(snapshotId);
    if (!sid) return Promise.resolve(false);
    var key = keyFor(sid);
    return storageRemove(key).then(function () {
      cache.delete(sid);
      return removeFromIndex(sid);
    }).then(function () {
      var event = { type: 'remove', snapshotId: sid, key: key, at: Date.now(), source: 'local' };
      notify(event);
      emit(OverlayEvents.removed, event);
      return true;
    }, function (e) {
      recordError('remove:' + sid, e);
      throw e;
    });
  }

  function list() {
    return readIndex().then(function (ids) {
      return Promise.all(ids.map(function (id) { return get(id); }));
    }).then(function (records) {
      return records.filter(Boolean);
    }, function (e) {
      recordError('list', e);
      return [];
    });
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    subscribers.add(fn);
    return function unsubscribe() { subscribers.delete(fn); };
  }

  function selfCheck() {
    var ps = getPlatformStorage();
    return {
      ok: errors.length === 0,
      version: VERSION,
      schemaVersion: SCHEMA_VERSION,
      keyPrefix: KEY_PREFIX,
      indexKey: KEY_INDEX,
      hasPlatformStorage: !!(ps && typeof ps.get === 'function' && typeof ps.set === 'function' && typeof ps.remove === 'function'),
      registeredWithStoreIndex: registeredWithStoreIndex,
      cacheSize: cache.size,
      errors: errors.slice(),
    };
  }

  var api = {
    __installed: true,
    version: VERSION,
    schemaVersion: SCHEMA_VERSION,
    get: get,
    upsert: upsert,
    remove: remove,
    list: list,
    subscribe: subscribe,
    selfCheck: selfCheck,
    keyFor: keyFor,
  };

  var store = H2O.Studio.store;
  if (store && typeof store.__registerEntity === 'function') {
    try {
      var ok = store.__registerEntity('editOverlay', api);
      registeredWithStoreIndex = !!ok;
      if (!ok) store.editOverlay = api;
    } catch (e) {
      recordError('register', e);
      store.editOverlay = api;
    }
  } else {
    store.editOverlay = api;
  }
})(globalThis);
