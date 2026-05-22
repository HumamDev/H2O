/* H2O Studio Sync - Chrome sync-folder import connector (R2B)
 *
 * MV3/Chrome Studio-only manual import bridge for ~/H2O Studio Sync/latest.json.
 * The user chooses a sync folder once through the File System Access API; this
 * module stores that directory handle in IndexedDB and exposes a manual
 * syncNow() that reads latest.json and calls the existing full-bundle import
 * flow in merge mode.
 *
 * R2C adds opt-in auto-sync triggers while Studio is open/visible. This is
 * still not a background daemon: no interval polling, no folder writes.
 *
 * Safety invariants:
 *   - no Desktop/Tauri behavior
 *   - no background polling or interval auto-import
 *   - no bidirectional sync
 *   - no Chrome writes to the sync folder
 *   - no import format or archive schema changes
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
  if (detectTauri()) return;

  function detectChromeExtension() {
    try {
      return !!(global.chrome && global.chrome.runtime && global.chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }
  if (!detectChromeExtension()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.sync = H2O.Studio.sync || {};

  var PHASE = 'R2C';
  var MODE = 'manual-sync-folder-import';
  var FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2';
  var LATEST_FILE = 'latest.json';
  var MSG_ARCHIVE = 'h2o-ext-archive:v1';
  var IDB_NAME = 'h2o.studio.sync.folder.mv3';
  var IDB_STORE = 'handles';
  var IDB_KEY = 'sync-folder';
  var STATE_KEY = 'h2o:sync:folder-import:state:v1';
  var AUTO_SYNC_MIN_INTERVAL_MS = 30000;
  var AUTO_SYNC_DELAY_MS = 1000;
  var AUTO_SYNC_BOOT_DELAY_MS = 1500;
  var MAX_ERRORS = 20;

  var state = {
    installedAt: Date.now(),
    loaded: false,
    loadPromise: null,
    handle: null,
    folderName: '',
    connectedAt: '',
    permission: 'unknown',
    lastFileName: '',
    lastFileLastModified: 0,
    lastFileSize: 0,
    lastAppliedExportId: '',
    lastAppliedAt: '',
    lastChecksum: '',
    lastSummarySignature: '',
    lastSyncStatus: '',
    lastSyncError: '',
    lastSyncResult: null,
    syncInFlight: false,
    autoSyncEnabled: false,
    autoSyncEventsBound: false,
    autoSyncTimer: null,
    autoSyncScheduledAt: 0,
    autoSyncScheduledReason: '',
    autoSyncRunning: false,
    lastAutoSyncAttemptAt: 0,
    lastAutoSyncAt: '',
    lastAutoSyncReason: '',
    lastAutoSyncStatus: '',
    lastAutoSyncError: '',
    errors: [],
  };

  function nowIso() {
    try { return new Date().toISOString(); }
    catch (_) { return String(Date.now()); }
  }

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function safeObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function numberOrZero(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
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

  function openDb() {
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
        } catch (error) { reject(error); }
      };
      req.onerror = function () { reject(req.error || new Error('indexedDB open failed')); };
      req.onsuccess = function () { resolve(req.result); };
    });
  }

  function txDone(tx) {
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error || new Error('indexedDB transaction failed')); };
      tx.onabort = function () { reject(tx.error || new Error('indexedDB transaction aborted')); };
    });
  }

  async function idbGet(key) {
    var db = await openDb();
    try {
      return await new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readonly');
        var req = tx.objectStore(IDB_STORE).get(key);
        req.onerror = function () { reject(req.error || new Error('indexedDB get failed')); };
        req.onsuccess = function () { resolve(req.result || null); };
      });
    } finally {
      try { db.close(); } catch (_) { /* ignore */ }
    }
  }

  async function idbPut(key, value) {
    var db = await openDb();
    try {
      var tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      await txDone(tx);
    } finally {
      try { db.close(); } catch (_) { /* ignore */ }
    }
  }

  async function idbDelete(key) {
    var db = await openDb();
    try {
      var tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(key);
      await txDone(tx);
    } finally {
      try { db.close(); } catch (_) { /* ignore */ }
    }
  }

  async function loadState() {
    var saved = safeObject(await readKv(STATE_KEY));
    state.connectedAt = cleanString(saved.connectedAt);
    state.folderName = cleanString(saved.folderName) || state.folderName;
    state.lastAppliedExportId = cleanString(saved.lastAppliedExportId);
    state.lastAppliedAt = cleanString(saved.lastAppliedAt);
    state.lastChecksum = cleanString(saved.lastChecksum);
    state.lastSummarySignature = cleanString(saved.lastSummarySignature);
    state.lastSyncStatus = cleanString(saved.lastSyncStatus);
    state.lastSyncError = cleanString(saved.lastSyncError);
    state.lastFileLastModified = numberOrZero(saved.lastFileLastModified);
    state.lastFileSize = numberOrZero(saved.lastFileSize);
    state.autoSyncEnabled = !!saved.autoSyncEnabled;
    state.lastAutoSyncAttemptAt = numberOrZero(saved.lastAutoSyncAttemptAt);
    state.lastAutoSyncAt = cleanString(saved.lastAutoSyncAt);
    state.lastAutoSyncReason = cleanString(saved.lastAutoSyncReason);
    state.lastAutoSyncStatus = cleanString(saved.lastAutoSyncStatus);
    state.lastAutoSyncError = cleanString(saved.lastAutoSyncError);
  }

  async function persistState(patch) {
    var next = Object.assign({
      schemaVersion: 1,
      phase: PHASE,
      mode: MODE,
      updatedAt: nowIso(),
      connected: !!state.handle,
      folderName: state.folderName,
      connectedAt: state.connectedAt,
      lastAppliedExportId: state.lastAppliedExportId,
      lastAppliedAt: state.lastAppliedAt,
      lastChecksum: state.lastChecksum,
      lastSummarySignature: state.lastSummarySignature,
      lastSyncStatus: state.lastSyncStatus,
      lastSyncError: state.lastSyncError,
      lastFileLastModified: state.lastFileLastModified,
      lastFileSize: state.lastFileSize,
      autoSyncEnabled: !!state.autoSyncEnabled,
      lastAutoSyncAttemptAt: state.lastAutoSyncAttemptAt,
      lastAutoSyncAt: state.lastAutoSyncAt,
      lastAutoSyncReason: state.lastAutoSyncReason,
      lastAutoSyncStatus: state.lastAutoSyncStatus,
      lastAutoSyncError: state.lastAutoSyncError,
      autoSyncMinIntervalMs: AUTO_SYNC_MIN_INTERVAL_MS,
      backgroundAutoImport: false,
      chromeWritesSyncFolder: false,
    }, safeObject(patch));
    await writeKv(STATE_KEY, next);
  }

  async function loadStoredHandle() {
    if (state.loaded) return state.handle;
    if (state.loadPromise) return state.loadPromise;
    state.loadPromise = (async function () {
      await loadState();
      try {
        var row = await idbGet(IDB_KEY);
        if (row && row.handle) {
          state.handle = row.handle;
          state.folderName = cleanString(row.name || row.handle.name || state.folderName);
          state.connectedAt = cleanString(row.connectedAt || state.connectedAt);
          state.permission = await queryPermission(row.handle);
        }
      } catch (error) {
        pushError('load-folder-handle', error);
      }
      state.loaded = true;
      state.loadPromise = null;
      return state.handle;
    })();
    return state.loadPromise;
  }

  async function queryPermission(handle) {
    if (!handle || typeof handle.queryPermission !== 'function') return 'unknown';
    try {
      return await handle.queryPermission({ mode: 'read' });
    } catch (error) {
      pushError('query-permission', error);
      return 'unknown';
    }
  }

  async function requestReadPermission(handle) {
    if (!handle) return 'denied';
    var current = await queryPermission(handle);
    if (current === 'granted') return 'granted';
    if (typeof handle.requestPermission !== 'function') return current || 'unknown';
    try {
      return await handle.requestPermission({ mode: 'read' });
    } catch (error) {
      pushError('request-permission', error);
      return 'denied';
    }
  }

  function clearAutoSyncTimer() {
    if (!state.autoSyncTimer) return;
    try { global.clearTimeout(state.autoSyncTimer); }
    catch (_) { /* ignore */ }
    state.autoSyncTimer = null;
  }

  function bindAutoSyncEvents() {
    if (state.autoSyncEventsBound) return;
    state.autoSyncEventsBound = true;
    try {
      global.addEventListener('focus', function () {
        scheduleAutoSync('window-focus').catch(function (error) { pushError('auto-sync.focus', error); });
      });
    } catch (error) { pushError('bind.focus', error); }
    try {
      global.document.addEventListener('visibilitychange', function () {
        if (global.document.visibilityState === 'visible') {
          scheduleAutoSync('document-visible').catch(function (error) { pushError('auto-sync.visibility', error); });
        }
      });
    } catch (error) { pushError('bind.visibilitychange', error); }
  }

  function throttleRemainingMs(nowMs) {
    var last = numberOrZero(state.lastAutoSyncAttemptAt);
    if (!last) return 0;
    return Math.max(0, AUTO_SYNC_MIN_INTERVAL_MS - (nowMs - last));
  }

  function getPlatformMessaging() {
    try {
      var p = H2O.Studio && H2O.Studio.platform && H2O.Studio.platform.messaging;
      if (!p || typeof p.send !== 'function') return null;
      var env = H2O.Studio.platform && H2O.Studio.platform.env;
      if (env && env.adapter === 'fallback') return null;
      return p;
    } catch (_) {
      return null;
    }
  }

  async function callArchive(op, payload, nsDisk) {
    var message = { type: MSG_ARCHIVE, req: { op: op, payload: payload || {}, nsDisk: nsDisk } };
    var pm = getPlatformMessaging();
    var response = pm
      ? await pm.send('archive', message)
      : await global.chrome.runtime.sendMessage(message);
    if (!response || !response.ok) throw new Error((response && response.error) || ('Archive op failed: ' + op));
    return response.result;
  }

  async function sha256Hex(text) {
    try {
      if (!global.crypto || !global.crypto.subtle || typeof TextEncoder === 'undefined') return '';
      var bytes = new TextEncoder().encode(String(text || ''));
      var digest = await global.crypto.subtle.digest('SHA-256', bytes);
      return Array.prototype.map.call(new Uint8Array(digest), function (byte) {
        return byte.toString(16).padStart(2, '0');
      }).join('');
    } catch (_) {
      return '';
    }
  }

  function summarySignature(bundle) {
    var summary = safeObject(bundle && bundle.summary);
    return [
      'exportedAt=' + cleanString(bundle && bundle.exportedAt),
      'chats=' + numberOrZero(summary.chatCount),
      'snapshots=' + numberOrZero(summary.snapshotCount),
      'turns=' + numberOrZero(summary.turnCount),
      'folders=' + numberOrZero(summary.folderCount),
      'labels=' + numberOrZero(summary.labelCount),
      'categories=' + numberOrZero(summary.categoryCount),
    ].join(';');
  }

  function validateBundle(bundle) {
    if (!bundle || typeof bundle !== 'object') throw new Error('bundle must be an object');
    if (bundle.schema !== FULL_BUNDLE_SCHEMA) {
      throw new Error('unsupported bundle schema: ' + cleanString(bundle.schema || '(missing)'));
    }
    if (!bundle.chatArchive || typeof bundle.chatArchive !== 'object') {
      throw new Error('missing chatArchive');
    }
    return bundle;
  }

  async function refreshLibraryIndex(reason) {
    try {
      if (H2O.LibraryIndex && typeof H2O.LibraryIndex.refresh === 'function') {
        await H2O.LibraryIndex.refresh(reason || 'sync-folder-import');
      } else {
        global.dispatchEvent(new CustomEvent('evt:h2o:library-index:refresh-request', {
          detail: { reason: reason || 'sync-folder-import' },
        }));
      }
    } catch (error) {
      pushError('refresh-library-index', error);
    }
    try {
      return H2O.LibraryIndex && typeof H2O.LibraryIndex.getAll === 'function'
        ? H2O.LibraryIndex.getAll().length
        : 0;
    } catch (_) {
      return 0;
    }
  }

  function importCounts(importResult, dryRun) {
    var chats = safeObject(importResult && importResult.chats);
    var planChats = safeObject(dryRun && dryRun.plan && dryRun.plan.chats);
    var planStorage = safeObject(dryRun && dryRun.plan && dryRun.plan.chromeStorageLocal);
    var planKv = safeObject(dryRun && dryRun.plan && dryRun.plan.libraryKv);
    var skippedChats = numberOrZero(planChats.willSkipDuplicates);
    var skippedStorage = numberOrZero(planStorage.willSkipDuplicates);
    var skippedKv = numberOrZero(planKv.willSkipDuplicates);
    return {
      importedChats: numberOrZero(chats.importedChats),
      importedSnapshots: numberOrZero(chats.importedSnapshots),
      skipped: skippedChats + skippedStorage + skippedKv,
      skippedDetails: {
        chats: skippedChats,
        chromeStorageLocal: skippedStorage,
        libraryKv: skippedKv,
      },
    };
  }

  async function connectFolder() {
    if (typeof global.showDirectoryPicker !== 'function') {
      return {
        ok: false,
        phase: PHASE,
        mode: MODE,
        status: 'file-system-access-unavailable',
      };
    }
    try {
      var handle = await global.showDirectoryPicker({ mode: 'read' });
      var permission = await requestReadPermission(handle);
      state.permission = permission;
      if (permission !== 'granted') {
        return {
          ok: false,
          phase: PHASE,
          mode: MODE,
          permission: permission,
          status: 'sync-folder-permission-denied',
        };
      }
      var connectedAt = nowIso();
      await idbPut(IDB_KEY, {
        handle: handle,
        name: cleanString(handle && handle.name),
        connectedAt: connectedAt,
      });
      state.handle = handle;
      state.loaded = true;
      state.folderName = cleanString(handle && handle.name);
      state.connectedAt = connectedAt;
      state.lastSyncStatus = 'sync-folder-connected';
      state.lastSyncError = '';
      await persistState({ connected: true, permission: permission });
      if (state.autoSyncEnabled) {
        scheduleAutoSync('folder-connected').catch(function (autoError) { pushError('auto-sync.folder-connected', autoError); });
      }
      return {
        ok: true,
        phase: PHASE,
        mode: MODE,
        folderName: state.folderName,
        permission: permission,
        status: 'sync-folder-connected',
      };
    } catch (error) {
      state.lastSyncStatus = 'sync-folder-connect-failed';
      state.lastSyncError = String(error && (error.message || error));
      pushError('connect-folder', error);
      try { await persistState({ connected: false, lastSyncStatus: state.lastSyncStatus, lastSyncError: state.lastSyncError }); }
      catch (_) { /* ignore */ }
      return {
        ok: false,
        phase: PHASE,
        mode: MODE,
        error: state.lastSyncError,
        status: 'sync-folder-connect-failed',
      };
    }
  }

  async function disconnectFolder() {
    clearAutoSyncTimer();
    try { await idbDelete(IDB_KEY); }
    catch (error) { pushError('disconnect-folder', error); }
    state.handle = null;
    state.loaded = true;
    state.folderName = '';
    state.connectedAt = '';
    state.permission = 'unknown';
    state.lastSyncStatus = 'sync-folder-disconnected';
    state.lastSyncError = '';
    await persistState({ connected: false, folderName: '', connectedAt: '' });
    return {
      ok: true,
      phase: PHASE,
      mode: MODE,
      connected: false,
      status: 'sync-folder-disconnected',
    };
  }

  function hasFolder() {
    return !!state.handle;
  }

  async function enableAutoSync() {
    await loadStoredHandle();
    state.autoSyncEnabled = true;
    state.lastAutoSyncStatus = 'auto-sync-enabled';
    state.lastAutoSyncError = '';
    bindAutoSyncEvents();
    await persistState({
      autoSyncEnabled: true,
      lastAutoSyncStatus: state.lastAutoSyncStatus,
      lastAutoSyncError: '',
    });
    return {
      ok: true,
      phase: PHASE,
      mode: MODE,
      enabled: true,
      connected: !!state.handle,
      minIntervalMs: AUTO_SYNC_MIN_INTERVAL_MS,
      triggerDelayMs: AUTO_SYNC_DELAY_MS,
      bootDelayMs: AUTO_SYNC_BOOT_DELAY_MS,
      backgroundAutoImport: false,
      chromeWritesSyncFolder: false,
      status: 'auto-sync-enabled',
    };
  }

  async function disableAutoSync() {
    clearAutoSyncTimer();
    state.autoSyncEnabled = false;
    state.lastAutoSyncStatus = 'auto-sync-disabled';
    state.lastAutoSyncError = '';
    await persistState({
      autoSyncEnabled: false,
      lastAutoSyncStatus: state.lastAutoSyncStatus,
      lastAutoSyncError: '',
    });
    return {
      ok: true,
      phase: PHASE,
      mode: MODE,
      enabled: false,
      scheduled: false,
      status: 'auto-sync-disabled',
    };
  }

  function isAutoSyncEnabled() {
    return !!state.autoSyncEnabled;
  }

  async function runAutoSync(reason) {
    var cleanReason = cleanString(reason) || state.autoSyncScheduledReason || 'auto-sync';
    if (!state.autoSyncEnabled) {
      return {
        ok: false,
        phase: PHASE,
        mode: MODE,
        enabled: false,
        autoSync: true,
        reason: cleanReason,
        status: 'auto-sync-disabled',
      };
    }
    await loadStoredHandle();
    if (!state.handle) {
      state.lastAutoSyncStatus = 'auto-sync-folder-not-connected';
      state.lastAutoSyncError = '';
      await persistState({ lastAutoSyncStatus: state.lastAutoSyncStatus, lastAutoSyncError: '' });
      return {
        ok: false,
        phase: PHASE,
        mode: MODE,
        enabled: true,
        connected: false,
        autoSync: true,
        reason: cleanReason,
        status: 'auto-sync-folder-not-connected',
      };
    }
    if (state.autoSyncRunning || state.syncInFlight) {
      return {
        ok: false,
        phase: PHASE,
        mode: MODE,
        enabled: true,
        autoSync: true,
        reason: cleanReason,
        status: 'auto-sync-in-flight',
      };
    }
    var permission = await queryPermission(state.handle);
    state.permission = permission;
    if (permission !== 'granted') {
      state.lastAutoSyncAttemptAt = Date.now();
      state.lastAutoSyncAt = nowIso();
      state.lastAutoSyncReason = cleanReason;
      state.lastAutoSyncStatus = 'auto-sync-reconnect-required';
      state.lastAutoSyncError = 'read permission not granted';
      await persistState({
        permission: permission,
        lastAutoSyncAttemptAt: state.lastAutoSyncAttemptAt,
        lastAutoSyncAt: state.lastAutoSyncAt,
        lastAutoSyncReason: state.lastAutoSyncReason,
        lastAutoSyncStatus: state.lastAutoSyncStatus,
        lastAutoSyncError: state.lastAutoSyncError,
      });
      return {
        ok: false,
        phase: PHASE,
        mode: MODE,
        enabled: true,
        autoSync: true,
        permission: permission,
        reason: cleanReason,
        error: state.lastAutoSyncError,
        status: 'auto-sync-reconnect-required',
      };
    }

    state.autoSyncRunning = true;
    state.lastAutoSyncAttemptAt = Date.now();
    state.lastAutoSyncReason = cleanReason;
    try {
      var result = await syncNow({ autoSync: true, reason: cleanReason });
      state.lastAutoSyncAt = nowIso();
      state.lastAutoSyncStatus = cleanString(result && result.status) || (result && result.ok ? 'auto-sync-ok' : 'auto-sync-failed');
      state.lastAutoSyncError = cleanString(result && (result.error || result.reason));
      await persistState({
        lastAutoSyncAttemptAt: state.lastAutoSyncAttemptAt,
        lastAutoSyncAt: state.lastAutoSyncAt,
        lastAutoSyncReason: state.lastAutoSyncReason,
        lastAutoSyncStatus: state.lastAutoSyncStatus,
        lastAutoSyncError: state.lastAutoSyncError,
      });
      return Object.assign({}, result || {}, {
        autoSync: true,
        autoSyncReason: cleanReason,
        lastAutoSyncAt: state.lastAutoSyncAt,
      });
    } catch (error) {
      state.lastAutoSyncAt = nowIso();
      state.lastAutoSyncStatus = 'auto-sync-failed';
      state.lastAutoSyncError = String(error && (error.message || error));
      pushError('run-auto-sync', error);
      await persistState({
        lastAutoSyncAttemptAt: state.lastAutoSyncAttemptAt,
        lastAutoSyncAt: state.lastAutoSyncAt,
        lastAutoSyncReason: state.lastAutoSyncReason,
        lastAutoSyncStatus: state.lastAutoSyncStatus,
        lastAutoSyncError: state.lastAutoSyncError,
      });
      return {
        ok: false,
        phase: PHASE,
        mode: MODE,
        enabled: true,
        autoSync: true,
        reason: cleanReason,
        error: state.lastAutoSyncError,
        status: state.lastAutoSyncStatus,
      };
    } finally {
      state.autoSyncRunning = false;
    }
  }

  async function scheduleAutoSync(reason) {
    var cleanReason = cleanString(reason) || 'auto-sync';
    await loadStoredHandle();
    if (!state.autoSyncEnabled) {
      return {
        ok: false,
        phase: PHASE,
        mode: MODE,
        enabled: false,
        scheduled: false,
        reason: cleanReason,
        status: 'auto-sync-disabled',
      };
    }
    if (!state.handle) {
      return {
        ok: false,
        phase: PHASE,
        mode: MODE,
        enabled: true,
        connected: false,
        scheduled: false,
        reason: cleanReason,
        status: 'auto-sync-folder-not-connected',
      };
    }
    if (state.autoSyncRunning || state.syncInFlight) {
      return {
        ok: false,
        phase: PHASE,
        mode: MODE,
        enabled: true,
        scheduled: false,
        reason: cleanReason,
        status: 'auto-sync-in-flight',
      };
    }
    var nowMs = Date.now();
    var remaining = throttleRemainingMs(nowMs);
    if (remaining > 0) {
      state.lastAutoSyncStatus = 'auto-sync-throttled';
      state.lastAutoSyncReason = cleanReason;
      await persistState({
        lastAutoSyncReason: state.lastAutoSyncReason,
        lastAutoSyncStatus: state.lastAutoSyncStatus,
      });
      return {
        ok: false,
        phase: PHASE,
        mode: MODE,
        enabled: true,
        scheduled: false,
        reason: cleanReason,
        throttleRemainingMs: remaining,
        minIntervalMs: AUTO_SYNC_MIN_INTERVAL_MS,
        status: 'auto-sync-throttled',
      };
    }
    if (state.autoSyncTimer) {
      state.autoSyncScheduledReason = cleanReason;
      return {
        ok: true,
        phase: PHASE,
        mode: MODE,
        enabled: true,
        scheduled: true,
        reason: cleanReason,
        status: 'auto-sync-already-scheduled',
      };
    }

    state.autoSyncScheduledAt = nowMs;
    state.autoSyncScheduledReason = cleanReason;
    state.lastAutoSyncReason = cleanReason;
    state.lastAutoSyncStatus = 'auto-sync-scheduled';
    await persistState({
      lastAutoSyncReason: cleanReason,
      lastAutoSyncStatus: state.lastAutoSyncStatus,
    });
    state.autoSyncTimer = global.setTimeout(function () {
      state.autoSyncTimer = null;
      runAutoSync(state.autoSyncScheduledReason || cleanReason).catch(function (error) {
        pushError('scheduled-auto-sync', error);
      });
    }, AUTO_SYNC_DELAY_MS);
    return {
      ok: true,
      phase: PHASE,
      mode: MODE,
      enabled: true,
      scheduled: true,
      reason: cleanReason,
      delayMs: AUTO_SYNC_DELAY_MS,
      minIntervalMs: AUTO_SYNC_MIN_INTERVAL_MS,
      status: 'auto-sync-scheduled',
    };
  }

  function status() {
    return {
      ok: true,
      phase: PHASE,
      mode: MODE,
      surface: 'chrome-mv3',
      loaded: !!state.loaded,
      connected: !!state.handle,
      folderName: state.folderName,
      permission: state.permission,
      latestFile: LATEST_FILE,
      /* F3.1: expose lastAppliedExportId so consumers can see which producer
       * export this peer most recently applied. The value is already read
       * from bundle.exportId at line ~969, persisted to chrome.storage.local
       * via persistState(), and restored on boot via loadState(). diagnose()
       * wraps status() with Object.assign, so it automatically picks this up. */
      lastAppliedExportId: state.lastAppliedExportId,
      lastAppliedAt: state.lastAppliedAt,
      lastChecksum: state.lastChecksum,
      lastSyncStatus: state.lastSyncStatus,
      lastSyncError: state.lastSyncError,
      syncInFlight: !!state.syncInFlight,
      autoSyncEnabled: !!state.autoSyncEnabled,
      autoSyncEventsBound: !!state.autoSyncEventsBound,
      autoSyncScheduled: !!state.autoSyncTimer,
      autoSyncRunning: !!state.autoSyncRunning,
      autoSyncMinIntervalMs: AUTO_SYNC_MIN_INTERVAL_MS,
      autoSyncDelayMs: AUTO_SYNC_DELAY_MS,
      lastAutoSyncAttemptAt: state.lastAutoSyncAttemptAt,
      lastAutoSyncAt: state.lastAutoSyncAt,
      lastAutoSyncReason: state.lastAutoSyncReason,
      lastAutoSyncStatus: state.lastAutoSyncStatus,
      lastAutoSyncError: state.lastAutoSyncError,
      backgroundAutoImport: false,
      chromeWritesSyncFolder: false,
    };
  }

  function tombstoneReviewIngestUnavailable(code) {
    return {
      attempted: true,
      dryRun: false,
      ok: false,
      found: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      selfOriginatedIgnored: 0,
      malformed: 0,
      unsupported: 0,
      failed: 0,
      warnings: [{ code: cleanString(code) || 'tombstone-review-store-unavailable' }],
    };
  }

  function normalizeTombstoneReviewIngestResult(raw) {
    var r = safeObject(raw);
    return {
      attempted: true,
      dryRun: false,
      ok: r.ok !== false,
      found: numberOrZero(r.found),
      inserted: numberOrZero(r.inserted),
      updated: numberOrZero(r.updated),
      skipped: numberOrZero(r.skipped),
      selfOriginatedIgnored: numberOrZero(r.selfOriginatedIgnored),
      malformed: numberOrZero(r.malformed),
      unsupported: numberOrZero(r.unsupported),
      failed: numberOrZero(r.failed),
      warnings: Array.isArray(r.warnings)
        ? r.warnings.map(function (warning) {
          var out = { code: cleanString(warning && warning.code) || 'warning' };
          if (warning && warning.count != null) out.count = numberOrZero(warning.count);
          return out;
        }).filter(function (warning) { return warning.code; })
        : [],
    };
  }

  async function maybeIngestTombstoneReviews(bundle, options) {
    var opts = safeObject(options);
    if (opts.ingestTombstoneReviews !== true) return null;
    try {
      var reviews = H2O && H2O.Studio && H2O.Studio.store && H2O.Studio.store.tombstoneReviews;
      if (!reviews || typeof reviews.ingestBundleTombstones !== 'function') {
        return tombstoneReviewIngestUnavailable('tombstone-review-store-unavailable');
      }
      var result = await reviews.ingestBundleTombstones(bundle, {
        source: 'chrome-folder-sync',
        dryRun: false,
        allowSelfOrigin: false,
        syncReason: cleanString(opts.reason),
        bundleExportId: cleanString(bundle && bundle.exportId),
        bundleSourceSyncPeerId: cleanString(bundle && bundle.sourceSyncPeerId),
      });
      return normalizeTombstoneReviewIngestResult(result);
    } catch (error) {
      pushError('tombstone-review-ingest', error);
      return tombstoneReviewIngestUnavailable('tombstone-review-ingest-failed');
    }
  }

  async function syncNow(options) {
    var startedAt = Date.now();
    var opts = safeObject(options);
    if (state.syncInFlight) {
      return {
        ok: false,
        phase: PHASE,
        mode: MODE,
        path: (state.folderName ? state.folderName + '/' : '') + LATEST_FILE,
        autoSync: !!opts.autoSync,
        status: 'sync-folder-sync-in-flight',
      };
    }
    state.syncInFlight = true;
    try {
    await loadStoredHandle();
    if (!state.handle) {
      return {
        ok: false,
        phase: PHASE,
        mode: MODE,
        path: LATEST_FILE,
        status: 'sync-folder-not-connected',
      };
    }

    var permission = await queryPermission(state.handle);
    state.permission = permission;
    if (permission !== 'granted') {
      state.lastSyncStatus = 'sync-folder-reconnect-required';
      state.lastSyncError = 'read permission not granted';
      await persistState({ permission: permission, lastSyncStatus: state.lastSyncStatus, lastSyncError: state.lastSyncError });
      return {
        ok: false,
        phase: PHASE,
        mode: MODE,
        permission: permission,
        path: (state.folderName ? state.folderName + '/' : '') + LATEST_FILE,
        error: state.lastSyncError,
        status: 'sync-folder-reconnect-required',
      };
    }

    try {
      var fileHandle = await state.handle.getFileHandle(LATEST_FILE, { create: false });
      var file = await fileHandle.getFile();
      var text = await file.text();
      var checksumHex = await sha256Hex(text);
      var checksum = checksumHex ? ('sha256:' + checksumHex) : '';
      var bundle;
      try {
        bundle = JSON.parse(text);
      } catch (parseError) {
        throw new Error('latest.json parse failed: ' + String(parseError && (parseError.message || parseError)));
      }
      validateBundle(bundle);
      var signature = summarySignature(bundle);
      if (opts.autoSync && checksum && state.lastChecksum && state.lastChecksum === checksum) {
        var alreadyRowsAfter = await refreshLibraryIndex('sync-folder-auto-skip');
        state.lastFileName = LATEST_FILE;
        state.lastFileLastModified = numberOrZero(file.lastModified);
        state.lastFileSize = numberOrZero(file.size);
        state.lastSummarySignature = signature;
        state.lastSyncStatus = 'auto-sync-latest-already-applied';
        state.lastSyncError = '';
        await persistState({
          lastSyncStatus: state.lastSyncStatus,
          lastSyncError: '',
          lastChecksum: checksum,
          lastSummarySignature: signature,
          lastFileLastModified: state.lastFileLastModified,
          lastFileSize: state.lastFileSize,
        });
        return {
          ok: true,
          phase: PHASE,
          mode: MODE,
          path: (state.folderName ? state.folderName + '/' : '') + LATEST_FILE,
          schema: bundle.schema,
          exportedAt: cleanString(bundle.exportedAt),
          checksum: checksum,
          fileLastModified: state.lastFileLastModified,
          fileSize: state.lastFileSize,
          summarySignature: signature,
          importedChats: 0,
          importedSnapshots: 0,
          skipped: 0,
          rowsAfter: alreadyRowsAfter,
          autoSync: true,
          durationMs: Date.now() - startedAt,
          backgroundAutoImport: false,
          chromeWritesSyncFolder: false,
          status: 'auto-sync-latest-already-applied',
        };
      }

      var dryRun = await callArchive('dryRunImportFullBundle', { bundle: bundle });
      if (opts.dryRunOnly) {
        state.lastSyncStatus = 'sync-folder-dry-run-ok';
        state.lastSyncError = '';
        await persistState({
          lastSyncStatus: state.lastSyncStatus,
          lastSyncError: '',
          lastChecksum: checksum,
          lastFileLastModified: numberOrZero(file.lastModified),
          lastFileSize: numberOrZero(file.size),
        });
        return {
          ok: true,
          phase: PHASE,
          mode: MODE,
          path: (state.folderName ? state.folderName + '/' : '') + LATEST_FILE,
          schema: bundle.schema,
          dryRun: dryRun,
          checksum: checksum,
          status: 'sync-folder-dry-run-ok',
        };
      }

      var importResult = await callArchive('importFullBundle', { bundle: bundle, mode: 'merge' });
      var rowsAfter = await refreshLibraryIndex('sync-folder-import');
      try {
        global.dispatchEvent(new CustomEvent('evt:h2o:data:backup:imported', {
          detail: { source: 'sync-folder-import', result: importResult },
        }));
      } catch (_) { /* ignore */ }
      try {
        global.dispatchEvent(new CustomEvent('evt:h2o:library:cross-surface-sync', {
          detail: { source: 'sync-folder-import', t: Date.now() },
        }));
      } catch (_) { /* ignore */ }

      var counts = importCounts(importResult, dryRun);
      state.lastFileName = LATEST_FILE;
      state.lastFileLastModified = numberOrZero(file.lastModified);
      state.lastFileSize = numberOrZero(file.size);
      state.lastAppliedExportId = cleanString(bundle.exportId || '');
      state.lastAppliedAt = nowIso();
      state.lastChecksum = checksum || cleanString(bundle.checksum);
      state.lastSummarySignature = signature;
      state.lastSyncStatus = 'sync-folder-imported';
      state.lastSyncError = '';
      state.lastSyncResult = importResult;
      await persistState({
        lastAppliedExportId: state.lastAppliedExportId,
        lastAppliedAt: state.lastAppliedAt,
        lastChecksum: state.lastChecksum,
        lastSummarySignature: signature,
        lastSyncStatus: state.lastSyncStatus,
        lastSyncError: '',
        lastFileLastModified: state.lastFileLastModified,
        lastFileSize: state.lastFileSize,
      });

      var tombstoneReviewIngest = await maybeIngestTombstoneReviews(bundle, opts);
      var result = {
        ok: true,
        phase: PHASE,
        mode: MODE,
        path: (state.folderName ? state.folderName + '/' : '') + LATEST_FILE,
        schema: bundle.schema,
        exportedAt: cleanString(bundle.exportedAt),
        lastAppliedExportId: state.lastAppliedExportId,
        checksum: state.lastChecksum,
        fileLastModified: state.lastFileLastModified,
        fileSize: state.lastFileSize,
        summarySignature: signature,
        importedChats: counts.importedChats,
        importedSnapshots: counts.importedSnapshots,
        skipped: counts.skipped,
        skippedDetails: counts.skippedDetails,
        rowsAfter: rowsAfter,
        dryRun: dryRun,
        importResult: importResult,
        durationMs: Date.now() - startedAt,
        autoSync: !!opts.autoSync,
        backgroundAutoImport: false,
        chromeWritesSyncFolder: false,
        status: 'sync-folder-imported',
      };
      if (tombstoneReviewIngest) result.tombstoneReviewIngest = tombstoneReviewIngest;
      return result;
    } catch (error) {
      state.lastSyncStatus = 'sync-folder-import-failed';
      state.lastSyncError = String(error && (error.message || error));
      pushError('sync-now', error);
      try {
        await persistState({
          lastSyncStatus: state.lastSyncStatus,
          lastSyncError: state.lastSyncError,
        });
      } catch (_) { /* ignore */ }
      return {
        ok: false,
        phase: PHASE,
        mode: MODE,
        path: (state.folderName ? state.folderName + '/' : '') + LATEST_FILE,
        error: state.lastSyncError,
        rowsAfter: H2O.LibraryIndex && typeof H2O.LibraryIndex.getAll === 'function' ? H2O.LibraryIndex.getAll().length : 0,
        durationMs: Date.now() - startedAt,
        status: state.lastSyncStatus,
      };
    }
    } finally {
      state.syncInFlight = false;
    }
  }

  function diagnose() {
    var storage = getChromeStorageLocal();
    return Object.assign(status(), {
      installed: true,
      api: 'H2O.Studio.sync.folder',
      idbName: IDB_NAME,
      idbStore: IDB_STORE,
      stateKey: STATE_KEY,
      fileSystemAccessAvailable: typeof global.showDirectoryPicker === 'function',
      indexedDbAvailable: !!global.indexedDB,
      chromeStorageAvailable: !!(storage && typeof storage.get === 'function' && typeof storage.set === 'function'),
      dryRunImportAvailable: true,
      mergeImportOnly: true,
      automaticPolling: false,
      focusTriggerEnabled: !!state.autoSyncEnabled,
      visibilityTriggerEnabled: !!state.autoSyncEnabled,
      bootReadyTriggerEnabled: !!state.autoSyncEnabled,
      bidirectionalSync: false,
      lastFileName: state.lastFileName,
      lastFileLastModified: state.lastFileLastModified,
      lastFileSize: state.lastFileSize,
      lastSummarySignature: state.lastSummarySignature,
      lastSyncResult: state.lastSyncResult,
      errors: state.errors.slice(),
    });
  }

  var api = {
    connectFolder: connectFolder,
    disconnectFolder: disconnectFolder,
    hasFolder: hasFolder,
    status: status,
    syncNow: syncNow,
    enableAutoSync: enableAutoSync,
    disableAutoSync: disableAutoSync,
    isAutoSyncEnabled: isAutoSyncEnabled,
    scheduleAutoSync: scheduleAutoSync,
    diagnose: diagnose,
  };

  H2O.Studio.sync = Object.assign({}, H2O.Studio.sync || {}, {
    folder: api,
  });

  loadStoredHandle().then(function () {
    if (!state.autoSyncEnabled) return;
    bindAutoSyncEvents();
    if (!state.handle) return;
    global.setTimeout(function () {
      scheduleAutoSync('studio-boot-ready').catch(function (error) {
        pushError('auto-sync.boot-ready', error);
      });
    }, AUTO_SYNC_BOOT_DELAY_MS);
  }).catch(function (error) {
    pushError('boot-load-folder', error);
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
