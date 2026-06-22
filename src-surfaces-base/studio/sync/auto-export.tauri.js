/* H2O Studio Sync - Desktop latest-bundle auto-export (R2A-2)
 *
 * Desktop/Tauri-only opt-in layer over the R2A-1 manual exporter. When
 * enabled, it listens to SQLite-backed Studio store changes and debounces a
 * write of ~/H2O Studio Sync/latest.json through
 * H2O.Studio.ingestion.exportLatestSyncBundle().
 *
 * Safety invariants:
 *   - disabled by default
 *   - no Chrome/MV3/web/mobile behavior
 *   - no Chrome auto-import
 *   - no bundle shape changes
 *   - no Library data mutation beyond this feature's setting/diagnostics KV
 *   - no export on boot; future store changes schedule exports only if enabled
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
  H2O.Studio.sync = H2O.Studio.sync || {};

  var SETTINGS_KEY = 'h2o:sync:autoexport:enabled:v1';
  var DIAGNOSTICS_KEY = 'h2o:sync:autoexport:diagnostics:v1';
  var DEBOUNCE_MS = 2000;
  var FOLDER_METADATA_REASON_PREFIX = 'folder-metadata:';
  var STORE_NAMES = ['chats', 'snapshots', 'folders', 'labels', 'tags', 'categories'];
  var MAX_ERRORS = 20;

  var state = {
    installedAt: Date.now(),
    loaded: false,
    loadPromise: null,
    enabled: false,
    folderMutationAutoSyncEnabled: true,
    pending: false,
    debounceMs: DEBOUNCE_MS,
    timer: null,
    flushInFlight: false,
    rescheduleAfterFlush: false,
    rescheduleReason: '',
    subscribersWired: false,
    wiredStores: [],
    missingStores: [],
    unsubscribeFns: [],
    lastChange: null,
    lastScheduledAt: null,
    lastScheduledReason: '',
    lastExportAt: null,
    lastExportStatus: '',
    lastExportPath: '',
    lastExportBytes: 0,
    lastExportReason: '',
    lastExportError: '',
    lastResult: null,
    errors: [],
  };

  function nowIso() {
    try { return new Date().toISOString(); }
    catch (_) { return String(Date.now()); }
  }

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function pushError(op, error) {
    try {
      state.errors.push({
        at: Date.now(),
        op: cleanString(op),
        error: String(error && (error.message || error)),
      });
      if (state.errors.length > MAX_ERRORS) state.errors.splice(0, state.errors.length - MAX_ERRORS);
    } catch (_) { /* ignore */ }
  }

  function getChromeStorageLocal() {
    try {
      return global.chrome && global.chrome.storage && global.chrome.storage.local;
    } catch (_) {
      return null;
    }
  }

  function readKv(key) {
    return new Promise(function (resolve) {
      var storage = getChromeStorageLocal();
      if (!storage || typeof storage.get !== 'function') { resolve(null); return; }
      try {
        storage.get([key], function (items) {
          resolve(items && Object.prototype.hasOwnProperty.call(items, key) ? items[key] : null);
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  function writeKv(key, value) {
    return new Promise(function (resolve, reject) {
      var storage = getChromeStorageLocal();
      if (!storage || typeof storage.set !== 'function') {
        reject(new Error('chrome.storage.local unavailable'));
        return;
      }
      try {
        var item = {}; item[key] = value;
        storage.set(item, function () {
          var lastErr = global.chrome && global.chrome.runtime && global.chrome.runtime.lastError;
          if (lastErr) reject(new Error(String(lastErr.message || lastErr)));
          else resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function normalizeEnabledSetting(raw) {
    if (raw === true || raw === false) return !!raw;
    if (raw && typeof raw === 'object') return !!raw.enabled;
    return false;
  }

  function isFolderMutationReason(reason) {
    return cleanString(reason).indexOf(FOLDER_METADATA_REASON_PREFIX) === 0;
  }

  function canRunForReason(reason) {
    return !!state.enabled || (!!state.folderMutationAutoSyncEnabled && isFolderMutationReason(reason));
  }

  function lastExportAtIso() {
    var ms = Number(state.lastExportAt || 0);
    if (!ms) return '';
    try { return new Date(ms).toISOString(); }
    catch (_) { return String(ms); }
  }

  async function loadSetting() {
    if (state.loaded) return state.enabled;
    if (state.loadPromise) return state.loadPromise;
    state.loadPromise = readKv(SETTINGS_KEY).then(function (raw) {
      state.enabled = normalizeEnabledSetting(raw);
      state.loaded = true;
      state.loadPromise = null;
      return state.enabled;
    }).catch(function (error) {
      pushError('load-setting', error);
      state.enabled = false;
      state.loaded = true;
      state.loadPromise = null;
      return false;
    });
    return state.loadPromise;
  }

  async function persistEnabled(enabled) {
    var payload = {
      schemaVersion: 1,
      enabled: !!enabled,
      updatedAt: nowIso(),
      phase: 'R2A-2',
      mode: 'desktop-latest-sync-bundle-auto-export',
    };
    await writeKv(SETTINGS_KEY, payload);
  }

  function getStores() {
    return (H2O.Studio && H2O.Studio.store) || {};
  }

  function makeReason(storeName, change) {
    var source = cleanString(change && change.source) || 'store';
    var op = cleanString(change && change.op) || 'changed';
    return 'store:' + storeName + ':' + source + ':' + op;
  }

  function shouldIgnoreChange(change) {
    var source = cleanString(change && change.source);
    if (source === 'reload') return true;
    if (source === 'desktop-local-soft-delete') return true;
    var op = cleanString(change && change.op);
    if (op === 'softDeleteEmptyFolder' || op === 'restoreTombstonedFolder') return true;
    return false;
  }

  function wireStoreSubscriptions() {
    if (state.subscribersWired && state.missingStores.length === 0) {
      return {
        ok: true,
        status: 'auto-export-subscriptions-already-wired',
        wiredStores: state.wiredStores.slice(),
        missingStores: state.missingStores.slice(),
      };
    }
    var stores = getStores();
    var wired = state.wiredStores.slice();
    var missing = [];
    STORE_NAMES.forEach(function (storeName) {
      if (wired.indexOf(storeName) !== -1) return;
      var store = stores && stores[storeName];
      if (!store || typeof store.subscribe !== 'function') {
        missing.push(storeName);
        return;
      }
      try {
        var unsubscribe = store.subscribe(function (change) {
          if (shouldIgnoreChange(change)) return;
          state.lastChange = {
            at: Date.now(),
            store: storeName,
            source: cleanString(change && change.source),
            op: cleanString(change && change.op),
          };
          schedule(makeReason(storeName, change));
        });
        if (typeof unsubscribe === 'function') state.unsubscribeFns.push(unsubscribe);
        wired.push(storeName);
      } catch (error) {
        missing.push(storeName);
        pushError('subscribe:' + storeName, error);
      }
    });
    state.subscribersWired = true;
    state.wiredStores = wired;
    state.missingStores = missing;
    return {
      ok: true,
      status: missing.length ? 'auto-export-subscriptions-partially-wired' : 'auto-export-subscriptions-wired',
      wiredStores: wired.slice(),
      missingStores: missing.slice(),
    };
  }

  function clearPendingTimer() {
    if (!state.timer) return;
    try { global.clearTimeout(state.timer); }
    catch (_) { /* ignore */ }
    state.timer = null;
  }

  async function persistDiagnostics(result, reason) {
    var payload = {
      schemaVersion: 1,
      phase: 'R2A-2',
      mode: 'desktop-latest-sync-bundle-auto-export',
      updatedAt: nowIso(),
      lastExportAt: state.lastExportAt,
      lastExportStatus: state.lastExportStatus,
      lastExportPath: state.lastExportPath,
      lastExportBytes: state.lastExportBytes,
      lastExportReason: cleanString(reason),
      pending: !!state.pending,
      debounceMs: state.debounceMs,
      result: result ? {
        ok: !!result.ok,
        status: cleanString(result.status),
        path: cleanString(result.path),
        bytes: Number(result.bytes) || 0,
        chatCount: Number(result.chatCount) || 0,
        snapshotCount: Number(result.snapshotCount) || 0,
        turnCount: Number(result.turnCount) || 0,
        checksum: cleanString(result.checksum),
        error: cleanString(result.error || result.reason),
      } : null,
    };
    try { await writeKv(DIAGNOSTICS_KEY, payload); }
    catch (error) { pushError('persist-diagnostics', error); }
  }

  function exportFunction() {
    return H2O.Studio && H2O.Studio.ingestion && H2O.Studio.ingestion.exportLatestSyncBundle;
  }

  async function enable() {
    await loadSetting();
    state.enabled = true;
    await persistEnabled(true);
    var wiring = wireStoreSubscriptions();
    return {
      ok: true,
      phase: 'R2A-2',
      mode: 'desktop-latest-sync-bundle-auto-export',
      enabled: true,
      debounceMs: state.debounceMs,
      autoRunOnBoot: false,
      autoRunOnDataChange: true,
      chromeAutoImport: false,
      wiring: wiring,
      status: 'auto-export-enabled',
    };
  }

  async function disable() {
    await loadSetting();
    clearPendingTimer();
    state.pending = false;
    state.enabled = false;
    await persistEnabled(false);
    return {
      ok: true,
      phase: 'R2A-2',
      mode: 'desktop-latest-sync-bundle-auto-export',
      enabled: false,
      pending: false,
      autoRunOnBoot: false,
      autoRunOnDataChange: false,
      chromeAutoImport: false,
      status: 'auto-export-disabled',
    };
  }

  function isEnabled() {
    return !!state.enabled;
  }

  function schedule(reason) {
    var cleanReason = cleanString(reason) || 'library-data-change';
    if (!canRunForReason(cleanReason)) {
      return {
        ok: false,
        phase: 'R2A-2',
        mode: 'desktop-latest-sync-bundle-auto-export',
        enabled: false,
        folderMutationAutoSyncEnabled: !!state.folderMutationAutoSyncEnabled,
        scheduled: false,
        reason: cleanReason,
        status: 'auto-export-disabled',
      };
    }
    if (state.enabled) wireStoreSubscriptions();
    clearPendingTimer();
    state.pending = true;
    if (isFolderMutationReason(cleanReason)) {
      state.lastChange = {
        at: Date.now(),
        store: 'folders',
        source: 'folder-metadata-operation',
        op: cleanReason.slice(FOLDER_METADATA_REASON_PREFIX.length) || 'changed',
        reason: cleanReason,
      };
    }
    state.lastScheduledAt = Date.now();
    state.lastScheduledReason = cleanReason;
    state.timer = global.setTimeout(function () {
      state.timer = null;
      flushNow(cleanReason).catch(function (error) { pushError('debounced-flush', error); });
    }, state.debounceMs);
    return {
      ok: true,
      phase: 'R2A-2',
      mode: 'desktop-latest-sync-bundle-auto-export',
      enabled: !!state.enabled,
      folderMutationAutoSyncEnabled: !!state.folderMutationAutoSyncEnabled,
      scheduled: true,
      reason: cleanReason,
      debounceMs: state.debounceMs,
      autoRunOnFolderMutation: !!state.folderMutationAutoSyncEnabled,
      status: 'auto-export-scheduled',
    };
  }

  async function flushNow(reason) {
    var cleanReason = cleanString(reason) || state.lastScheduledReason || 'manual-flush';
    if (!canRunForReason(cleanReason)) {
      return {
        ok: false,
        phase: 'R2A-2',
        mode: 'desktop-latest-sync-bundle-auto-export',
        enabled: false,
        folderMutationAutoSyncEnabled: !!state.folderMutationAutoSyncEnabled,
        recordsWritten: 0,
        reason: cleanReason,
        status: 'auto-export-disabled',
      };
    }
    var exporter = exportFunction();
    if (typeof exporter !== 'function') {
      var missing = {
        ok: false,
        phase: 'R2A-2',
        mode: 'desktop-latest-sync-bundle-auto-export',
        enabled: !!state.enabled,
        folderMutationAutoSyncEnabled: !!state.folderMutationAutoSyncEnabled,
        recordsWritten: 0,
        reason: cleanReason,
        status: 'manual-export-unavailable',
      };
      state.lastResult = missing;
      return missing;
    }
    if (state.flushInFlight) {
      state.pending = true;
      state.rescheduleAfterFlush = true;
      state.rescheduleReason = cleanReason;
      return {
        ok: false,
        phase: 'R2A-2',
        mode: 'desktop-latest-sync-bundle-auto-export',
        enabled: !!state.enabled,
        folderMutationAutoSyncEnabled: !!state.folderMutationAutoSyncEnabled,
        pending: true,
        reason: cleanReason,
        status: 'auto-export-in-flight',
      };
    }

    clearPendingTimer();
    state.pending = false;
    state.flushInFlight = true;
    state.lastExportReason = cleanReason;
    try {
      var result = await exporter({
        reason: cleanReason,
        autoExport: true,
        autoExportPhase: 'R2A-2',
      });
      state.lastExportAt = Date.now();
      state.lastExportStatus = cleanString(result && result.status);
      state.lastExportPath = cleanString(result && result.path);
      state.lastExportBytes = Number(result && result.bytes) || 0;
      state.lastExportError = cleanString(result && (result.error || result.reason));
      state.lastResult = result || null;
      await persistDiagnostics(result, cleanReason);
      return result;
    } catch (error) {
      var failure = {
        ok: false,
        phase: 'R2A-2',
        mode: 'desktop-latest-sync-bundle-auto-export',
        enabled: !!state.enabled,
        folderMutationAutoSyncEnabled: !!state.folderMutationAutoSyncEnabled,
        recordsWritten: 0,
        reason: cleanReason,
        error: String(error && (error.message || error)),
        status: 'auto-export-flush-failed',
      };
      state.lastExportAt = Date.now();
      state.lastExportStatus = failure.status;
      state.lastExportError = failure.error;
      state.lastResult = failure;
      pushError('flush-now', error);
      await persistDiagnostics(failure, cleanReason);
      return failure;
    } finally {
      state.flushInFlight = false;
      if (state.rescheduleAfterFlush) {
        var rescheduleReason = cleanString(state.rescheduleReason) || 'post-in-flight-store-change';
        state.rescheduleAfterFlush = false;
        state.rescheduleReason = '';
        schedule(rescheduleReason);
      }
    }
  }

  function diagnose() {
    return {
      installed: true,
      phase: 'R2A-2',
      surface: 'desktop-tauri',
      mode: 'desktop-latest-sync-bundle-auto-export',
      enabled: !!state.enabled,
      folderMutationAutoSyncEnabled: !!state.folderMutationAutoSyncEnabled,
      loaded: !!state.loaded,
      pending: !!state.pending,
      debounceMs: state.debounceMs,
      settingKey: SETTINGS_KEY,
      diagnosticsKey: DIAGNOSTICS_KEY,
      subscribersWired: !!state.subscribersWired,
      wiredStoreCount: state.wiredStores.length,
      wiredStores: state.wiredStores.slice(),
      missingStores: state.missingStores.slice(),
      lastChange: state.lastChange,
      lastScheduledAt: state.lastScheduledAt,
      lastScheduledReason: state.lastScheduledReason,
      lastExportAt: state.lastExportAt,
      lastExportedAt: lastExportAtIso(),
      lastExportStatus: state.lastExportStatus,
      lastExportPath: state.lastExportPath,
      lastExportBytes: state.lastExportBytes,
      lastExportReason: state.lastExportReason,
      lastExportError: state.lastExportError,
      flushInFlight: !!state.flushInFlight,
      manualExportAvailable: typeof exportFunction() === 'function',
      autoRunOnBoot: false,
      autoRunOnDataChange: !!state.enabled,
      autoRunOnFolderMutation: !!state.folderMutationAutoSyncEnabled,
      desktopToChrome: {
        autoExportEnabled: !!state.enabled || !!state.folderMutationAutoSyncEnabled,
        storeDataChangeAutoExportEnabled: !!state.enabled,
        folderMutationAutoExportEnabled: !!state.folderMutationAutoSyncEnabled,
        pending: !!state.pending,
        flushInFlight: !!state.flushInFlight,
        lastExportStatus: state.lastExportStatus,
        lastExportedAt: lastExportAtIso(),
        lastExportBytes: state.lastExportBytes,
        lastExportPath: state.lastExportPath,
        lastExportReason: state.lastExportReason,
        lastExportError: state.lastExportError,
        lastScheduledAt: state.lastScheduledAt,
        lastScheduledReason: state.lastScheduledReason,
      },
      chromeAutoImport: false,
      bundleShapeChanged: false,
      errors: state.errors.slice(),
    };
  }

  var api = {
    enable: enable,
    disable: disable,
    isEnabled: isEnabled,
    schedule: schedule,
    flushNow: flushNow,
    diagnose: diagnose,
  };

  H2O.Studio.sync = Object.assign({}, H2O.Studio.sync || {}, {
    autoExport: api,
  });

  loadSetting().then(function (enabled) {
    if (enabled) wireStoreSubscriptions();
  }).catch(function (error) {
    pushError('boot-load-setting', error);
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
