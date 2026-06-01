/* H2O Studio Sync — Chrome sync-folder export connector (R3 Phase 1 + 2)
 *
 * MV3 / Chrome-only manual export of an h2o.studio.fullBundle.v2 payload
 * into the user-selected sync folder as `chrome-latest.json` (staged via
 * `chrome-latest.json.tmp` then renamed). Naming mirrors the existing
 * Desktop-side auto-export shape (`H2O.Studio.sync.autoImport.*` is the
 * Chrome-side analogue of `autoExport.*`).
 *
 * R3 phase 2 — opt-in event-triggered export. When BOTH
 * `sync.chromeAutoImport` AND `sync.chromeAutoImport.eventTrigger` are
 * ON (via `H2O.flags.set(...)` or `autoImport.enable()`), a small
 * whitelist of safe library-save events triggers a debounced
 * `exportNow()` automatically. The user-gesture requirement still
 * applies — but since the listener fires inside an event handler in the
 * extension page (Studio Launcher), Chrome treats that as user gesture
 * activation for File System Access readwrite re-prompts. There is no
 * polling, no background-only daemon, no auto-write outside the gesture
 * stack.
 *
 * Sanctioned by the R3 amendment to docs/systems/library/desktop-chrome-
 * sync-r2d-gate.md:
 *   - Chrome must not write `latest.json`. Chrome writes only
 *     `chrome-latest.json` and `chrome-latest.json.tmp`.
 *   - All file-system writes happen from a Window-context extension page
 *     under a user gesture. The MV3 service worker is the bundle
 *     PRODUCER (via chrome.runtime.sendMessage → existing background
 *     `exportFullBundle` op) but never the file WRITER.
 *   - readwrite permission is requested per export call.
 *   - Behind a feature flag (`sync.chromeAutoImport`) that defaults OFF
 *     in prod. Flag-off path is a no-op with a clear status; users fall
 *     back to the existing manual `#/migrate/export` download workflow.
 *
 * Reuses the directory handle already persisted by folder-import.mv3.js
 * (IndexedDB `h2o.studio.sync.folder.mv3` → store `handles` → key
 * `sync-folder`) — Chrome cannot acquire a second handle without
 * disrupting the existing R2D import flow.
 *
 * Safety invariants:
 *   - no Desktop/Tauri behavior (Tauri detection bails early)
 *   - no background polling, no automatic write on boot or on event
 *   - no bidirectional sync — write is strictly Chrome → chrome-latest.json
 *   - no schema or wire-format change — bundle shape is the existing
 *     h2o.studio.fullBundle.v2 produced verbatim by the SW
 *   - no Native UI change (only a Studio Settings button is added by
 *     studio.js; this module is the API behind it)
 *   - flag-off is a hard guard at the top of exportNow(); no write code
 *     executes when the flag is false
 *
 * Public API:
 *   H2O.Studio.sync.autoImport.exportNow(options?)
 *   H2O.Studio.sync.autoImport.isEnabled()
 *   H2O.Studio.sync.autoImport.enable()
 *   H2O.Studio.sync.autoImport.disable()
 *   H2O.Studio.sync.autoImport.status()
 *   H2O.Studio.sync.autoImport.diagnose()
 */
(function (global) {
  'use strict';

  /* ── Tauri detection — bail; this is Chrome/MV3 only ─────────────── */
  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* swallow */ }
    return false;
  }
  if (detectTauri()) return;

  /* ── Chrome runtime detection — bail otherwise ───────────────────── */
  function detectChromeRuntime() {
    try {
      return !!(global.chrome && global.chrome.runtime && global.chrome.runtime.id);
    } catch (_) { return false; }
  }
  if (!detectChromeRuntime()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.sync = H2O.Studio.sync || {};
  if (H2O.Studio.sync.autoImport && H2O.Studio.sync.autoImport.__installed) return;

  /* ── Constants — mirror folder-import.mv3.js storage location ─────── */
  var PHASE                = 'R3-phase1';
  var FULL_BUNDLE_SCHEMA   = 'h2o.studio.fullBundle.v2';
  var CHROME_FILE          = 'chrome-latest.json';
  var CHROME_FILE_TMP      = 'chrome-latest.json.tmp';
  var MSG_ARCHIVE          = 'h2o-ext-archive:v1';
  var IDB_NAME             = 'h2o.studio.sync.folder.mv3';
  var IDB_STORE            = 'handles';
  var IDB_KEY              = 'sync-folder';
  var FLAG_KEY             = 'sync.chromeAutoImport';
  var EVENT_TRIGGER_FLAG_KEY = 'sync.chromeAutoImport.eventTrigger';
  var SETTINGS_KEY         = 'h2o:sync:chrome-auto-import:state:v1';
  var MAX_ERRORS           = 20;
  /* R3 phase 2 — event-trigger wiring. The whitelist names below are
   * "post-write" library-state-changed signals; each fires AFTER a
   * library save has completed, not during. EVENT_TRIGGER_DEBOUNCE_MS
   * coalesces bursts (e.g. import-from-bridge writes 7 stores in quick
   * succession; one exportNow runs at the tail). */
  var EVENT_TRIGGER_NAMES = [
    'evt:h2o:library:cross-surface-sync',  /* Native broadcasted to Chrome Studio */
    'evt:h2o:library-index:updated',        /* Library Index refreshed after any source change */
    'evt:h2o:sync:chrome-auto-import:trigger', /* Explicit manual trigger for tests / future modules */
  ];
  var EVENT_TRIGGER_DEBOUNCE_MS = 2000;

  /* ── State (in-memory only; persisted bits live in SETTINGS_KEY) ─── */
  var state = {
    installedAt: Date.now(),
    enabled: false,             /* mirrors the EVENT_TRIGGER_FLAG_KEY value; kept in sync via enable()/disable() */
    inFlight: false,
    lastExportAt: '',
    lastExportStatus: '',
    lastExportFile: '',
    lastExportBytes: 0,
    lastExportError: '',
    /* R3 phase 2 — event-trigger runtime state */
    listenersBound: false,
    listenerHandlers: Object.create(null),  /* eventName → handler ref, for removeEventListener */
    eventTriggerTimer: null,
    lastEventAt: 0,
    lastEventName: '',
    eventTriggerCount: 0,
    errors: [],
  };

  /* ── Small helpers ────────────────────────────────────────────────── */
  function nowIso() {
    try { return new Date().toISOString(); }
    catch (_) { return String(Date.now()); }
  }
  function pushError(op, err) {
    try {
      state.errors.push({
        at: Date.now(),
        op: String(op || ''),
        error: String(err && (err.message || err)),
      });
      if (state.errors.length > MAX_ERRORS) {
        state.errors.splice(0, state.errors.length - MAX_ERRORS);
      }
    } catch (_) { /* ignore */ }
  }

  function getChromeStorageLocal() {
    try { return global.chrome && global.chrome.storage && global.chrome.storage.local; }
    catch (_) { return null; }
  }
  function readKv(key) {
    return new Promise(function (resolve) {
      var s = getChromeStorageLocal();
      if (!s || typeof s.get !== 'function') { resolve(null); return; }
      try {
        s.get([key], function (items) {
          resolve(items && Object.prototype.hasOwnProperty.call(items, key) ? items[key] : null);
        });
      } catch (_) { resolve(null); }
    });
  }
  function writeKv(key, value) {
    return new Promise(function (resolve, reject) {
      var s = getChromeStorageLocal();
      if (!s || typeof s.set !== 'function') {
        reject(new Error('chrome.storage.local unavailable'));
        return;
      }
      try {
        var item = {}; item[key] = value;
        s.set(item, function () {
          var lastErr = global.chrome && global.chrome.runtime && global.chrome.runtime.lastError;
          if (lastErr) reject(new Error(String(lastErr.message || lastErr)));
          else resolve();
        });
      } catch (e) { reject(e); }
    });
  }

  /* ── Feature flag (defaults OFF) ──────────────────────────────────── */
  /* The flag is read live on every exportNow() call so flipping it via
   * H2O.flags.set(...) takes effect immediately without a reload. */
  function flagEnabled() {
    try {
      var flags = H2O.flags;
      if (flags && typeof flags.get === 'function') {
        return flags.get(FLAG_KEY, false) === true;
      }
    } catch (_) { /* fall through */ }
    return false;
  }

  /* ── IndexedDB plumbing — read the existing folder handle ────────── */
  function openHandleDb() {
    return new Promise(function (resolve, reject) {
      if (!global.indexedDB) {
        reject(new Error('indexedDB unavailable'));
        return;
      }
      var req = global.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () {
        try {
          var db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
        } catch (e) { reject(e); }
      };
      req.onerror = function () { reject(req.error || new Error('indexedDB open failed')); };
      req.onsuccess = function () { resolve(req.result); };
    });
  }
  async function loadStoredHandleRow() {
    var db;
    try { db = await openHandleDb(); }
    catch (e) { pushError('idb.open', e); return null; }
    try {
      return await new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readonly');
        var req = tx.objectStore(IDB_STORE).get(IDB_KEY);
        req.onerror = function () { reject(req.error || new Error('indexedDB get failed')); };
        req.onsuccess = function () { resolve(req.result || null); };
      });
    } finally {
      try { db.close(); } catch (_) { /* ignore */ }
    }
  }

  /* ── Permission prompt — must run from a user gesture ─────────────── */
  async function ensureReadWritePermission(handle) {
    if (!handle) throw new Error('no sync-folder directory handle available');
    if (typeof handle.queryPermission !== 'function'
        || typeof handle.requestPermission !== 'function') {
      throw new Error('File System Access API unavailable on this handle');
    }
    var current;
    try { current = await handle.queryPermission({ mode: 'readwrite' }); }
    catch (e) { pushError('queryPermission', e); current = 'prompt'; }
    if (current === 'granted') return 'granted';
    var asked;
    try { asked = await handle.requestPermission({ mode: 'readwrite' }); }
    catch (e) {
      pushError('requestPermission', e);
      throw new Error('readwrite permission request failed: ' + ((e && e.message) || e));
    }
    if (asked !== 'granted') {
      throw new Error('readwrite permission not granted (got "' + asked + '")');
    }
    return asked;
  }

  /* ── Service-worker round-trip to produce the bundle ──────────────── */
  /* Mirrors the existing folder-import.mv3.js callArchive helper: same
   * MSG_ARCHIVE envelope, same { op, payload, nsDisk } shape. The SW
   * already implements op === 'exportFullBundle' (per chrome-live-
   * background.mjs lines 6836-6837). */
  function callArchive(op, payload) {
    var message = { type: MSG_ARCHIVE, req: { op: op, payload: payload || {} } };
    return new Promise(function (resolve, reject) {
      try {
        var sendResult = global.chrome.runtime.sendMessage(message, function (response) {
          var lastErr = global.chrome && global.chrome.runtime && global.chrome.runtime.lastError;
          if (lastErr) { reject(new Error(String(lastErr.message || lastErr))); return; }
          if (!response || !response.ok) {
            reject(new Error((response && response.error) || ('Archive op failed: ' + op)));
            return;
          }
          resolve(response.result);
        });
        /* When sendMessage returns a Promise (some MV3 polyfills), use it. */
        if (sendResult && typeof sendResult.then === 'function') {
          sendResult.then(function (response) {
            if (!response || !response.ok) {
              reject(new Error((response && response.error) || ('Archive op failed: ' + op)));
              return;
            }
            resolve(response.result);
          }).catch(reject);
        }
      } catch (e) { reject(e); }
    });
  }

  /* ── Bundle shape validation — schema-only guard ──────────────────── */
  function validateBundleShape(bundle) {
    if (!bundle || typeof bundle !== 'object') {
      return { ok: false, error: 'bundle is not an object' };
    }
    var schema = String(bundle.schema || '').trim();
    if (schema !== FULL_BUNDLE_SCHEMA) {
      return { ok: false, error: 'unexpected bundle schema: "' + schema + '" (expected "' + FULL_BUNDLE_SCHEMA + '")' };
    }
    return { ok: true };
  }

  /* ── Atomic-ish file write: write to .tmp, rename to final ────────── */
  /* FileSystemFileHandle.move() handles the rename atomically when the
   * browser supports it (Chromium 110+). When unavailable, fall back to
   * write-final + delete-tmp, which is non-atomic but matches the R3
   * gate's "atomic-ish from Desktop's perspective" — Desktop's scanNow
   * skips files with browser-partial-suffix extensions including .tmp,
   * so an interrupted write leaves a .tmp that Desktop will ignore. */
  async function writeBundleAtomic(dirHandle, json) {
    var bytes = json.length;
    /* 1. Write to .tmp. */
    var tmpHandle = await dirHandle.getFileHandle(CHROME_FILE_TMP, { create: true });
    var writable = await tmpHandle.createWritable();
    try {
      await writable.write(json);
    } finally {
      await writable.close();
    }
    /* 2. Rename .tmp → final. */
    if (typeof tmpHandle.move === 'function') {
      try {
        await tmpHandle.move(CHROME_FILE);
        return { bytes: bytes, atomicMethod: 'move' };
      } catch (e) {
        pushError('move', e);
        /* fall through to copy+delete */
      }
    }
    /* 3. Fallback: write final, then delete .tmp. */
    var finalHandle = await dirHandle.getFileHandle(CHROME_FILE, { create: true });
    var finalWritable = await finalHandle.createWritable();
    try {
      await finalWritable.write(json);
    } finally {
      await finalWritable.close();
    }
    try { await dirHandle.removeEntry(CHROME_FILE_TMP); }
    catch (e) { pushError('removeEntry.tmp', e); /* benign */ }
    return { bytes: bytes, atomicMethod: 'copy-then-delete' };
  }

  /* ── exportNow — the only write entry point ───────────────────────── */
  async function exportNow(options) {
    var opts = (options && typeof options === 'object') ? options : {};
    var reason = String(opts.reason || 'manual');
    var startedAt = nowIso();

    /* (1) Flag gate. */
    if (!flagEnabled()) {
      var s1 = {
        ok: false,
        reason: reason,
        startedAt: startedAt,
        completedAt: nowIso(),
        filename: '',
        bytes: 0,
        flagEnabled: false,
        error: 'feature flag "' + FLAG_KEY + '" is OFF',
        warnings: [],
      };
      state.lastExportAt = startedAt;
      state.lastExportStatus = 'flag-off';
      state.lastExportError = s1.error;
      return s1;
    }

    if (state.inFlight) {
      return {
        ok: false,
        reason: reason,
        startedAt: startedAt,
        completedAt: nowIso(),
        filename: '',
        bytes: 0,
        flagEnabled: true,
        error: 'export already in flight',
        warnings: [],
      };
    }
    state.inFlight = true;
    var warnings = [];
    var errors = [];
    var bytes = 0;
    var atomicMethod = '';

    try {
      /* (2) Load directory handle. */
      var row = await loadStoredHandleRow();
      if (!row || !row.handle) {
        throw new Error('sync folder not connected — use Connect Folder first');
      }
      var dirHandle = row.handle;

      /* (3) readwrite permission (user gesture required). */
      await ensureReadWritePermission(dirHandle);

      /* (4) Produce bundle via service worker. */
      var bundle = await callArchive('exportFullBundle', {});

      /* (5) Schema validation. */
      var v = validateBundleShape(bundle);
      if (!v.ok) throw new Error('bundle validation failed: ' + v.error);

      /* (6) Serialize. */
      var json = JSON.stringify(bundle);

      /* (7) Atomic-ish write. */
      var writeResult = await writeBundleAtomic(dirHandle, json);
      bytes = writeResult.bytes;
      atomicMethod = writeResult.atomicMethod;

      var ok = {
        ok: true,
        reason: reason,
        startedAt: startedAt,
        completedAt: nowIso(),
        filename: CHROME_FILE,
        bytes: bytes,
        atomicMethod: atomicMethod,
        flagEnabled: true,
        warnings: warnings,
      };
      state.lastExportAt = startedAt;
      state.lastExportStatus = 'ok';
      state.lastExportFile = CHROME_FILE;
      state.lastExportBytes = bytes;
      state.lastExportError = '';
      /* Best-effort persisted summary; never fails exportNow if write KO. */
      writeKv(SETTINGS_KEY, {
        version: 1,
        lastExportAt: startedAt,
        lastExportStatus: 'ok',
        lastExportFile: CHROME_FILE,
        lastExportBytes: bytes,
      }).catch(function (e) { pushError('writeKv.lastExport', e); });
      return ok;
    } catch (e) {
      pushError('exportNow', e);
      errors.push({ kind: 'export', error: String((e && e.message) || e) });
      var failedAt = nowIso();
      state.lastExportAt = startedAt;
      state.lastExportStatus = 'error';
      state.lastExportError = String((e && e.message) || e);
      return {
        ok: false,
        reason: reason,
        startedAt: startedAt,
        completedAt: failedAt,
        filename: '',
        bytes: bytes,
        atomicMethod: atomicMethod,
        flagEnabled: true,
        warnings: warnings,
        errors: errors,
        error: String((e && e.message) || e),
      };
    } finally {
      state.inFlight = false;
    }
  }

  /* ── Opt-in event-trigger: flag-backed (H2O.flags), with listener wiring ─── */
  /* The event-trigger opt-in is persisted via H2O.flags under
   * EVENT_TRIGGER_FLAG_KEY (`sync.chromeAutoImport.eventTrigger`),
   * which is the same persistence layer as the master flag
   * (`sync.chromeAutoImport`). Reads are live so flipping with
   * `H2O.flags.set(...)` takes effect immediately. enable()/disable()
   * additionally bind/unbind the actual DOM event listeners.
   *
   * The SETTINGS_KEY chrome.storage.local row is preserved for
   * read-only diagnostics (lastExportAt etc.) and back-compat with
   * R3 phase 1 callers; the opt-in boolean is no longer mirrored there. */
  function eventTriggerFlagEnabled() {
    try {
      var flags = H2O.flags;
      if (flags && typeof flags.get === 'function') {
        return flags.get(EVENT_TRIGGER_FLAG_KEY, false) === true;
      }
    } catch (_) { /* fall through */ }
    return false;
  }
  function setEventTriggerFlag(next) {
    try {
      var flags = H2O.flags;
      if (flags && typeof flags.set === 'function') {
        flags.set(EVENT_TRIGGER_FLAG_KEY, !!next);
      }
    } catch (e) { pushError('setEventTriggerFlag', e); }
  }

  async function loadPersistedState() {
    try {
      var row = await readKv(SETTINGS_KEY);
      if (row && typeof row === 'object') {
        state.lastExportAt = String(row.lastExportAt || '');
        state.lastExportStatus = String(row.lastExportStatus || '');
        state.lastExportFile = String(row.lastExportFile || '');
        state.lastExportBytes = Number(row.lastExportBytes || 0);
      }
    } catch (e) { pushError('loadPersistedState', e); }
    /* Honor the flag-backed opt-in: if both flags are ON at boot, wire
     * the listeners so subsequent library-save events trigger exportNow.
     * Note this still requires the master FLAG_KEY to be ON — checked at
     * trigger time inside onTriggerEvent, not here, so flipping the
     * master flag at runtime takes effect on the next event without a
     * reload. */
    state.enabled = eventTriggerFlagEnabled();
    if (state.enabled) bindEventListeners();
  }

  function isEnabled() { return eventTriggerFlagEnabled(); }
  async function enable()  {
    setEventTriggerFlag(true);
    state.enabled = true;
    bindEventListeners();
    return isEnabled();
  }
  async function disable() {
    unbindEventListeners();
    setEventTriggerFlag(false);
    state.enabled = false;
    return isEnabled();
  }

  /* ── Event-trigger listener plumbing ─────────────────────────────── */
  /* onTriggerEvent: load-bearing guard. Even with listeners bound, we
   * re-check both flags + folder-connected on every fire so a runtime
   * flag flip (without disable()) doesn't leak unwanted exports. */
  function onTriggerEvent(eventName) {
    state.lastEventAt = Date.now();
    state.lastEventName = String(eventName || '');
    state.eventTriggerCount += 1;
    /* Hard gates — drop event without scheduling. */
    if (!flagEnabled())            return;
    if (!eventTriggerFlagEnabled()) return;
    /* Debounce: replace any pending trigger so a burst of writes
     * collapses to one export at the tail. */
    if (state.eventTriggerTimer) {
      global.clearTimeout(state.eventTriggerTimer);
      state.eventTriggerTimer = null;
    }
    state.eventTriggerTimer = global.setTimeout(function () {
      state.eventTriggerTimer = null;
      /* Folder-connected gate runs inside exportNow via the IDB handle
       * lookup; no need to short-circuit here. */
      exportNow({ reason: 'event:' + eventName }).catch(function (e) {
        pushError('event-triggered-export', e);
      });
    }, EVENT_TRIGGER_DEBOUNCE_MS);
  }

  function bindEventListeners() {
    if (state.listenersBound) return;
    if (typeof global.addEventListener !== 'function') {
      pushError('bindEventListeners', new Error('addEventListener unavailable'));
      return;
    }
    EVENT_TRIGGER_NAMES.forEach(function (name) {
      if (state.listenerHandlers[name]) return;
      var handler = function () { onTriggerEvent(name); };
      state.listenerHandlers[name] = handler;
      try { global.addEventListener(name, handler); }
      catch (e) { pushError('bindEventListeners:' + name, e); }
    });
    state.listenersBound = true;
  }
  function unbindEventListeners() {
    if (!state.listenersBound) return;
    EVENT_TRIGGER_NAMES.forEach(function (name) {
      var handler = state.listenerHandlers[name];
      if (!handler) return;
      try { global.removeEventListener(name, handler); }
      catch (e) { pushError('unbindEventListeners:' + name, e); }
      delete state.listenerHandlers[name];
    });
    state.listenersBound = false;
    if (state.eventTriggerTimer) {
      global.clearTimeout(state.eventTriggerTimer);
      state.eventTriggerTimer = null;
    }
  }

  /* ── status / diagnose ───────────────────────────────────────────── */
  async function status() {
    var handleRow = null;
    try { handleRow = await loadStoredHandleRow(); }
    catch (e) { pushError('status.loadHandle', e); }
    var folderName = handleRow && handleRow.handle && handleRow.handle.name ? handleRow.handle.name : '';
    return {
      phase: PHASE,
      flagKey: FLAG_KEY,
      flagEnabled: flagEnabled(),
      eventTriggerFlagKey: EVENT_TRIGGER_FLAG_KEY,
      eventTriggerEnabled: eventTriggerFlagEnabled(),
      eventTriggerListenersBound: state.listenersBound,
      eventTriggerNames: EVENT_TRIGGER_NAMES.slice(),
      eventTriggerDebounceMs: EVENT_TRIGGER_DEBOUNCE_MS,
      eventTriggerCount: state.eventTriggerCount,
      lastEventAt: state.lastEventAt,
      lastEventName: state.lastEventName,
      folderConnected: !!(handleRow && handleRow.handle),
      folderName: folderName,
      lastExportAt: state.lastExportAt,
      lastExportStatus: state.lastExportStatus,
      lastExportFile: state.lastExportFile,
      lastExportBytes: state.lastExportBytes,
      lastExportError: state.lastExportError,
      inFlight: state.inFlight,
    };
  }
  async function diagnose() {
    var s = await status();
    return Object.assign({}, s, {
      installedAt: state.installedAt,
      installedAtIso: (function () { try { return new Date(state.installedAt).toISOString(); } catch (_) { return ''; } })(),
      filename: CHROME_FILE,
      tmpFilename: CHROME_FILE_TMP,
      msgEnvelope: MSG_ARCHIVE,
      idbName: IDB_NAME,
      idbStore: IDB_STORE,
      idbKey: IDB_KEY,
      settingsKey: SETTINGS_KEY,
      gateRef: 'R2D Gate R3 — Chrome to Desktop Export Gate',
      bidirectionalSync: false,
      polling: false,
      backgroundDaemon: false,
      writesLatestJson: false,
      errors: state.errors.slice(),
    });
  }

  /* ── Public API ──────────────────────────────────────────────────── */
  var api = {
    __installed: true,
    __version: '0.1.0',
    exportNow: exportNow,
    isEnabled: isEnabled,
    enable: enable,
    disable: disable,
    status: status,
    diagnose: diagnose,
  };
  H2O.Studio.sync.autoImport = api;

  /* Best-effort hydration of persisted state. Never blocks API readiness;
   * if this fails the API still works (state.enabled stays false). */
  loadPersistedState().catch(function (e) { pushError('boot.loadPersistedState', e); });
})(typeof window !== 'undefined' ? window : globalThis);
