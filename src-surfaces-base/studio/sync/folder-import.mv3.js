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
 *   - syncNow() defaults to Desktop -> Chrome import from latest.json
 *   - direction-specific Chrome -> Desktop export delegates to autoImport
 *     and writes only chrome-latest.json
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
  var PROPAGATION_SCHEMA = 'h2o.studio.sync.chrome-desktop-propagation.v1';
  var F19_DESKTOP_CHROME_VERSION = '0.1.0-f19.2.c';
  var LATEST_FILE = 'latest.json';
  var CHROME_LATEST_FILE = 'chrome-latest.json';
  var FOLDER_STATE_KEY_LOCAL = 'h2o:prm:cgx:fldrs:state:data:v1';
  var MSG_ARCHIVE = 'h2o-ext-archive:v1';
  var IDB_NAME = 'h2o.studio.sync.folder.mv3';
  var IDB_STORE = 'handles';
  var IDB_KEY = 'sync-folder';
  var STATE_KEY = 'h2o:sync:folder-import:state:v1';
  var AUTO_SYNC_MIN_INTERVAL_MS = 30000;
  var AUTO_SYNC_DELAY_MS = 1000;
  var AUTO_SYNC_BOOT_DELAY_MS = 1500;
  var DESKTOP_LATEST_POLL_INTERVAL_MS = 5000;
  var CHROME_EXPORT_DEBOUNCE_MS = 2000;
  var CHROME_TARGETED_REFRESH_RETRY_MS = 250;
  var MAX_ERRORS = 20;
  var DESKTOP_CHROME_SUPPORTED_FIELDS = [
    'saved-chat-records',
    'linked-chat-records',
    'folder-metadata',
    'category-metadata',
    'chat-category-bindings'
  ];
  var DESKTOP_CHROME_DEFERRED_CODES = {
    labels: 'library-propagation-labels-deferred',
    tags: 'library-propagation-tags-deferred',
    projects: 'library-propagation-projects-deferred',
    folderBindings: 'library-propagation-chat-folder-bindings-deferred',
    tombstones: 'library-propagation-tombstones-deferred',
    applyEvents: 'library-propagation-apply-events-deferred',
    unsupportedStorage: 'library-propagation-unsupported-storage-deferred',
    sourceMetadataMissing: 'library-propagation-source-metadata-missing'
  };
  var F19_SYNC_HARDENING_CODES = {
    syncFolderMissing: 'sync-folder-missing',
    permissionDenied: 'permission-denied',
    transportFileMissing: 'transport-file-missing',
    transportFileMalformed: 'transport-file-malformed',
    transportSchemaUnsupported: 'transport-schema-unsupported',
    transportStale: 'transport-stale',
    duplicateImportIdempotent: 'duplicate-import-idempotent',
    localNewerConflict: 'local-newer-conflict',
    simultaneousUpdateConflict: 'simultaneous-update-conflict',
    deferredFieldPresent: 'deferred-field-present',
    unsupportedFieldPresent: 'unsupported-field-present',
    sourceMetadataMissing: 'source-metadata-missing',
    parityPeerSnapshotRequired: 'parity-peer-snapshot-required'
  };

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
    lastAppliedExportedAt: '',
    lastAppliedAt: '',
    lastChecksum: '',
    lastSummarySignature: '',
    lastSyncStatus: '',
    lastSyncError: '',
    lastSyncResult: null,
    syncInFlight: false,
    autoSyncEnabled: true,
    autoSyncEventsBound: false,
    autoSyncTimer: null,
    desktopLatestPollTimer: null,
    desktopLatestPollRunning: false,
    desktopLatestPollSignature: '',
    lastDesktopLatestPollAt: '',
    lastDesktopLatestPollStatus: '',
    lastDesktopLatestPollError: '',
    lastDesktopLatestPollDetectedAt: '',
    lastDesktopLatestPollFileLastModified: 0,
    lastDesktopLatestPollFileSize: 0,
    autoSyncScheduledAt: 0,
    autoSyncScheduledReason: '',
    autoSyncRunning: false,
    lastAutoSyncAttemptAt: 0,
    lastAutoSyncAt: '',
    lastAutoSyncReason: '',
    lastAutoSyncStatus: '',
    lastAutoSyncError: '',
    chromeExportTimer: null,
    chromeExportPending: false,
    chromeExportInFlight: false,
    chromeExportScheduledAt: 0,
    chromeExportScheduledReason: '',
    lastChromeExportAttemptAt: 0,
    lastChromeExportAt: '',
    lastChromeExportReason: '',
    lastChromeExportStatus: '',
    lastChromeExportError: '',
    lastChromeExportFile: '',
    lastChromeExportBytes: 0,
    lastChromeExportPermission: 'unknown',
    lastChromeExportBlockers: [],
    lastTransportConflictStatus: '',
    lastTransportConflictReason: '',
    lastTransportConflictDecision: '',
    lastTransportConflictSummary: null,
    lastDesktopToChromeExportWrittenAt: '',
    lastDesktopToChromeImportStartedAt: '',
    lastDesktopToChromeImportAppliedAt: '',
    lastDesktopToChromeRenderRefreshedAt: '',
    lastDesktopToChromeTotalPropagationMs: 0,
    lastDesktopToChromeRefreshMode: '',
    lastDesktopToChromeChangedFolderCount: 0,
    lastDesktopToChromeChangedFields: [],
    lastDesktopToChromeChangedFolderIds: [],
    lastDesktopToChromePostImportRefreshError: '',
    chromePostImportRefreshRetryTimer: null,
    chromePostImportRenderRefreshCount: 0,
    lastChromePostImportRenderRefreshCount: 0,
    lastChromePostImportRefreshMode: '',
    lastChromePostImportRefreshAt: '',
    lastChromePostImportRefreshError: '',
    lastChromePostImportRefreshSuppressed: false,
    chromePostImportRefreshSuppressedCount: 0,
    lastChromePostImportChangedFolderCount: 0,
    lastChromePostImportChangedFields: [],
    lastChromePostImportChangedFolderIds: [],
    loopSuppressedCount: 0,
    duplicateSkippedCount: 0,
    selfOriginSkippedCount: 0,
    errors: [],
  };

  function nowIso() {
    try { return new Date().toISOString(); }
    catch (_) { return String(Date.now()); }
  }

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function syncFolderPath(fileName) {
    return (state.folderName ? state.folderName + '/' : '') + cleanString(fileName || '');
  }

  function looksLikeOpaqueTitle(value, id) {
    var text = cleanString(value);
    var chatId = cleanString(id);
    if (!text) return true;
    if (chatId && text === chatId) return true;
    if (/^(imported chat|linked chat|untitled chat|link|chatgpt)$/i.test(text)) return true;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return true;
    if (/^[0-9a-f][0-9a-f-]{23,}$/i.test(text)) return true;
    if (/^(imported|chat|conversation)[-_:][a-z0-9-]{12,}$/i.test(text)) return true;
    return false;
  }

  function friendlyShellTitle(primary, id, fallback) {
    var values = Array.isArray(primary) ? primary : [primary];
    for (var i = 0; i < values.length; i += 1) {
      var title = cleanString(values[i]);
      if (title && !looksLikeOpaqueTitle(title, id)) return title;
    }
    return cleanString(fallback) || 'Imported chat';
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
    state.lastAppliedExportedAt = cleanString(saved.lastAppliedExportedAt);
    state.lastAppliedAt = cleanString(saved.lastAppliedAt);
    state.lastChecksum = cleanString(saved.lastChecksum);
    state.lastSummarySignature = cleanString(saved.lastSummarySignature);
    state.lastSyncStatus = cleanString(saved.lastSyncStatus);
    state.lastSyncError = cleanString(saved.lastSyncError);
    state.lastFileLastModified = numberOrZero(saved.lastFileLastModified);
    state.lastFileSize = numberOrZero(saved.lastFileSize);
    state.desktopLatestPollSignature = state.lastFileLastModified || state.lastFileSize
      ? String(state.lastFileLastModified) + ':' + String(state.lastFileSize)
      : '';
    state.autoSyncEnabled = Object.prototype.hasOwnProperty.call(saved, 'autoSyncEnabled')
      ? saved.autoSyncEnabled !== false
      : true;
    state.lastAutoSyncAttemptAt = numberOrZero(saved.lastAutoSyncAttemptAt);
    state.lastAutoSyncAt = cleanString(saved.lastAutoSyncAt);
    state.lastAutoSyncReason = cleanString(saved.lastAutoSyncReason);
    state.lastAutoSyncStatus = cleanString(saved.lastAutoSyncStatus);
    state.lastAutoSyncError = cleanString(saved.lastAutoSyncError);
    state.lastChromeExportAttemptAt = numberOrZero(saved.lastChromeExportAttemptAt);
    state.lastChromeExportAt = cleanString(saved.lastChromeExportAt);
    state.lastChromeExportReason = cleanString(saved.lastChromeExportReason);
    state.lastChromeExportStatus = cleanString(saved.lastChromeExportStatus);
    state.lastChromeExportError = cleanString(saved.lastChromeExportError);
    state.lastChromeExportFile = cleanString(saved.lastChromeExportFile);
    state.lastChromeExportBytes = numberOrZero(saved.lastChromeExportBytes);
    state.lastChromeExportPermission = cleanString(saved.lastChromeExportPermission) || state.lastChromeExportPermission;
    state.lastChromeExportBlockers = Array.isArray(saved.lastChromeExportBlockers)
      ? saved.lastChromeExportBlockers.map(cleanString).filter(Boolean).slice(0, 8)
      : [];
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
      lastAppliedExportedAt: state.lastAppliedExportedAt,
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
      chromeExportPending: !!state.chromeExportPending,
      chromeExportInFlight: !!state.chromeExportInFlight,
      chromeExportScheduledAt: state.chromeExportScheduledAt,
      chromeExportScheduledReason: state.chromeExportScheduledReason,
      lastChromeExportAttemptAt: state.lastChromeExportAttemptAt,
      lastChromeExportAt: state.lastChromeExportAt,
      lastChromeExportReason: state.lastChromeExportReason,
      lastChromeExportStatus: state.lastChromeExportStatus,
      lastChromeExportError: state.lastChromeExportError,
      lastChromeExportFile: state.lastChromeExportFile,
      lastChromeExportBytes: state.lastChromeExportBytes,
      lastChromeExportPermission: state.lastChromeExportPermission,
      lastChromeExportBlockers: state.lastChromeExportBlockers.slice(),
      autoSyncMinIntervalMs: AUTO_SYNC_MIN_INTERVAL_MS,
      backgroundAutoImport: false,
      chromeWritesSyncFolder: state.lastChromeExportStatus === 'chrome-to-desktop-exported',
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

  async function queryReadWritePermission(handle) {
    if (!handle || typeof handle.queryPermission !== 'function') return 'unknown';
    try {
      return await handle.queryPermission({ mode: 'readwrite' });
    } catch (error) {
      pushError('query-readwrite-permission', error);
      return 'unknown';
    }
  }

  function documentIsVisible() {
    try {
      return !global.document || !global.document.visibilityState || global.document.visibilityState === 'visible';
    } catch (_) {
      return true;
    }
  }

  function desktopLatestFileSignature(file) {
    return String(numberOrZero(file && file.lastModified)) + ':' + String(numberOrZero(file && file.size));
  }

  function isFastDesktopLatestChangeReason(reason) {
    var clean = cleanString(reason).toLowerCase();
    return clean.indexOf('desktop-latest-poll') !== -1
      || clean.indexOf('desktop-latest-changed') !== -1
      || clean.indexOf('folder-metadata-fast-import') !== -1;
  }

  function clearDesktopLatestPollTimer() {
    if (!state.desktopLatestPollTimer) return;
    try { global.clearInterval(state.desktopLatestPollTimer); }
    catch (_) { /* ignore */ }
    state.desktopLatestPollTimer = null;
  }

  async function pollDesktopLatestForChanges(reason) {
    var cleanReason = cleanString(reason) || 'desktop-latest-poll';
    if (!state.autoSyncEnabled || !state.handle || !documentIsVisible()) return null;
    if (state.desktopLatestPollRunning || state.autoSyncRunning || state.syncInFlight) return null;
    state.desktopLatestPollRunning = true;
    state.lastDesktopLatestPollAt = nowIso();
    state.lastDesktopLatestPollStatus = 'polling';
    state.lastDesktopLatestPollError = '';
    try {
      var permission = await queryPermission(state.handle);
      state.permission = permission;
      if (permission !== 'granted') {
        state.lastDesktopLatestPollStatus = 'permission-required';
        state.lastDesktopLatestPollError = 'read permission not granted';
        return null;
      }
      var fileHandle;
      try {
        fileHandle = await state.handle.getFileHandle(LATEST_FILE, { create: false });
      } catch (missingError) {
        state.lastDesktopLatestPollStatus = 'latest-missing';
        state.lastDesktopLatestPollError = String(missingError && (missingError.message || missingError));
        return null;
      }
      var file = await fileHandle.getFile();
      var signature = desktopLatestFileSignature(file);
      var previous = cleanString(state.desktopLatestPollSignature);
      state.desktopLatestPollSignature = signature;
      state.lastDesktopLatestPollFileLastModified = numberOrZero(file.lastModified);
      state.lastDesktopLatestPollFileSize = numberOrZero(file.size);
      if (previous && previous === signature) {
        state.lastDesktopLatestPollStatus = 'unchanged';
        return null;
      }
      state.lastDesktopLatestPollDetectedAt = nowIso();
      state.lastDesktopLatestPollStatus = previous ? 'changed' : 'first-seen';
      return scheduleAutoSync(previous ? 'desktop-latest-poll-changed' : 'desktop-latest-poll-first-seen');
    } catch (error) {
      state.lastDesktopLatestPollStatus = 'poll-failed';
      state.lastDesktopLatestPollError = String(error && (error.message || error));
      pushError('desktop-latest-poll', error);
      return null;
    } finally {
      state.desktopLatestPollRunning = false;
    }
  }

  function startDesktopLatestPoller(reason) {
    if (state.desktopLatestPollTimer || !state.autoSyncEnabled || !state.handle) return false;
    state.desktopLatestPollTimer = global.setInterval(function () {
      pollDesktopLatestForChanges('desktop-latest-poll:' + cleanString(reason || 'interval'))
        .catch(function (error) { pushError('desktop-latest-poll.interval', error); });
    }, DESKTOP_LATEST_POLL_INTERVAL_MS);
    global.setTimeout(function () {
      pollDesktopLatestForChanges('desktop-latest-poll:' + cleanString(reason || 'start'))
        .catch(function (error) { pushError('desktop-latest-poll.start', error); });
    }, 250);
    return true;
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

  function clearChromeExportTimer() {
    if (!state.chromeExportTimer) return;
    try { global.clearTimeout(state.chromeExportTimer); }
    catch (_) { /* ignore */ }
    state.chromeExportTimer = null;
  }

  function bindAutoSyncEvents() {
    if (state.autoSyncEventsBound) return;
    state.autoSyncEventsBound = true;
    try {
      global.addEventListener('focus', function () {
        pollDesktopLatestForChanges('desktop-latest-poll:window-focus').catch(function (error) { pushError('desktop-latest-poll.focus', error); });
        scheduleAutoSync('window-focus').catch(function (error) { pushError('auto-sync.focus', error); });
      });
    } catch (error) { pushError('bind.focus', error); }
    try {
      global.document.addEventListener('visibilitychange', function () {
        if (global.document.visibilityState === 'visible') {
          startDesktopLatestPoller('document-visible');
          pollDesktopLatestForChanges('desktop-latest-poll:document-visible').catch(function (error) { pushError('desktop-latest-poll.visibility', error); });
          scheduleAutoSync('document-visible').catch(function (error) { pushError('auto-sync.visibility', error); });
        } else {
          clearDesktopLatestPollTimer();
        }
      });
    } catch (error) { pushError('bind.visibilitychange', error); }
    startDesktopLatestPoller('bind-auto-sync-events');
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

  function cloneJson(value) {
    if (typeof value === 'undefined') return undefined;
    try { return JSON.parse(JSON.stringify(value)); }
    catch (_) { return null; }
  }

  function addUnique(list, code) {
    var normalized = cleanString(code);
    if (normalized && list.indexOf(normalized) === -1) list.push(normalized);
  }

  function normalizeHardeningWarnings(warnings) {
    var out = Array.isArray(warnings) ? warnings.slice() : [];
    var legacyDeferred = [
      DESKTOP_CHROME_DEFERRED_CODES.labels,
      DESKTOP_CHROME_DEFERRED_CODES.tags,
      DESKTOP_CHROME_DEFERRED_CODES.projects,
      DESKTOP_CHROME_DEFERRED_CODES.folderBindings,
      DESKTOP_CHROME_DEFERRED_CODES.tombstones,
      DESKTOP_CHROME_DEFERRED_CODES.applyEvents
    ];
    for (var i = 0; i < legacyDeferred.length; i += 1) {
      if (out.indexOf(legacyDeferred[i]) !== -1) addUnique(out, F19_SYNC_HARDENING_CODES.deferredFieldPresent);
    }
    if (out.indexOf(DESKTOP_CHROME_DEFERRED_CODES.unsupportedStorage) !== -1) {
      addUnique(out, F19_SYNC_HARDENING_CODES.unsupportedFieldPresent);
    }
    if (out.indexOf(DESKTOP_CHROME_DEFERRED_CODES.sourceMetadataMissing) !== -1) {
      addUnique(out, F19_SYNC_HARDENING_CODES.sourceMetadataMissing);
    }
    return out;
  }

  function normalizeHardeningBlockers(blockers) {
    var out = Array.isArray(blockers) ? blockers.slice() : [];
    if (out.indexOf('library-propagation-folder-required') !== -1 ||
        out.indexOf('sync-folder-not-connected') !== -1 ||
        out.indexOf('sync-folder-missing') !== -1) {
      addUnique(out, F19_SYNC_HARDENING_CODES.syncFolderMissing);
    }
    if (out.indexOf('sync-folder-reconnect-required') !== -1 ||
        out.indexOf('sync-folder-permission-denied') !== -1 ||
        out.indexOf('permission-denied') !== -1) {
      addUnique(out, F19_SYNC_HARDENING_CODES.permissionDenied);
    }
    if (out.indexOf('library-propagation-read-failed') !== -1 ||
        out.indexOf('sync-folder-latest-missing') !== -1 ||
        out.indexOf('transport-file-missing') !== -1) {
      addUnique(out, F19_SYNC_HARDENING_CODES.transportFileMissing);
    }
    if (out.indexOf('library-propagation-json-parse-failed') !== -1 ||
        out.indexOf('sync-folder-latest-malformed') !== -1 ||
        out.indexOf('transport-file-malformed') !== -1) {
      addUnique(out, F19_SYNC_HARDENING_CODES.transportFileMalformed);
    }
    if (out.indexOf('library-propagation-schema-invalid') !== -1 ||
        out.indexOf('sync-folder-latest-schema-unsupported') !== -1 ||
        out.indexOf('transport-schema-unsupported') !== -1) {
      addUnique(out, F19_SYNC_HARDENING_CODES.transportSchemaUnsupported);
    }
    if (out.indexOf('library-propagation-transport-stale') !== -1 ||
        out.indexOf('transport-stale') !== -1) {
      addUnique(out, F19_SYNC_HARDENING_CODES.transportStale);
    }
    if (out.indexOf('library-propagation-simultaneous-update-conflict') !== -1 ||
        out.indexOf('simultaneous-update-conflict') !== -1) {
      addUnique(out, F19_SYNC_HARDENING_CODES.simultaneousUpdateConflict);
    }
    return out;
  }

  function parseTimeMs(value) {
    var clean = cleanString(value);
    if (!clean) return 0;
    var ms = Date.parse(clean);
    return isFinite(ms) ? ms : 0;
  }

  function classifyIncomingDesktopTransport(bundle, checksum) {
    var blockers = [];
    if (!bundle || typeof bundle !== 'object') return blockers;
    var incomingExportedAtMs = parseTimeMs(bundle.exportedAt);
    var lastExportedAtMs = parseTimeMs(state.lastAppliedExportedAt);
    var sameChecksum = !!(checksum && state.lastChecksum && checksum === state.lastChecksum);
    if (incomingExportedAtMs && lastExportedAtMs && incomingExportedAtMs < lastExportedAtMs && !sameChecksum) {
      addUnique(blockers, 'library-propagation-transport-stale');
    }
    var previousExportId = cleanString(bundle.previousExportId);
    if (previousExportId && state.lastAppliedExportId && previousExportId !== state.lastAppliedExportId && !sameChecksum) {
      addUnique(blockers, 'library-propagation-simultaneous-update-conflict');
    }
    return blockers;
  }

  function normalizeConflictDecision(options) {
    return cleanString(options && options.conflictDecision).toLowerCase();
  }

  function resolveOperatorApprovedTransportBlockers(blockers, options) {
    var input = Array.isArray(blockers) ? blockers.slice() : [];
    var decision = normalizeConflictDecision(options);
    var approveMerge = decision === 'approve-merge';
    var approved = [];
    var remaining = [];
    for (var i = 0; i < input.length; i += 1) {
      var code = cleanString(input[i]);
      if (approveMerge && code === 'library-propagation-simultaneous-update-conflict') {
        approved.push(code);
      } else if (code) {
        remaining.push(code);
      }
    }
    return {
      blockers: remaining,
      conflictDecision: decision,
      conflictApproved: approved.length > 0,
      approvedBlockers: approved,
      warning: approved.length > 0 ? 'library-propagation-simultaneous-conflict-approved' : ''
    };
  }

  function folderMetadataRowId(row) {
    return cleanString(row && (row.folderId || row.id || row.folder_id));
  }

  function folderMetadataRowName(row) {
    return cleanString(row && (row.name || row.title || row.label));
  }

  function folderMetadataRowColor(row) {
    var meta = row && row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta)
      ? row.meta : {};
    return cleanString(row && (row.color || row.iconColor || meta.color || meta.iconColor)).toUpperCase();
  }

  function folderMetadataRowTimestampMs(row) {
    var meta = row && row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta)
      ? row.meta : {};
    return parseTimeMs(row && (row.updatedAt || row.updated_at || meta.updatedAt || meta.updated_at));
  }

  function folderMetadataRowsFromBundle(bundle) {
    var found = readDesktopChromeFolderStateSource(bundle);
    var source = found && found.source;
    var rows = [];
    if (source && typeof source === 'object' && !Array.isArray(source) && Array.isArray(source.folders)) {
      for (var i = 0; i < source.folders.length; i += 1) {
        var folder = sanitizeFolderForDesktopChrome(source.folders[i]);
        if (folder) rows.push(folder);
      }
    }
    return {
      sourceKind: cleanString(found && found.sourceKind),
      rows: rows
    };
  }

  async function analyzeFolderMetadataAutoConflict(bundle) {
    var incoming = folderMetadataRowsFromBundle(bundle);
    if (!incoming.rows.length) {
      return { safe: false, reason: 'folder-metadata-source-missing', changedFolderCount: 0, changedFields: [] };
    }
    var localState = safeObject(await readKv(FOLDER_STATE_KEY_LOCAL));
    var localRows = Array.isArray(localState.folders) ? localState.folders : [];
    var localById = Object.create(null);
    for (var l = 0; l < localRows.length; l += 1) {
      var localId = folderMetadataRowId(localRows[l]);
      if (localId) localById[localId] = localRows[l];
    }
    var changed = [];
    var localNewer = [];
    var changedFields = [];
    for (var i = 0; i < incoming.rows.length; i += 1) {
      var row = incoming.rows[i];
      var folderId = folderMetadataRowId(row);
      if (!folderId) continue;
      var local = localById[folderId] || null;
      var fields = [];
      if (!local) {
        fields.push('create');
      } else {
        if (folderMetadataRowName(row) !== folderMetadataRowName(local)) fields.push('name');
        if (folderMetadataRowColor(row) !== folderMetadataRowColor(local)) fields.push('color');
      }
      if (!fields.length) continue;
      fields.forEach(function (field) { addUnique(changedFields, field); });
      var incomingMs = folderMetadataRowTimestampMs(row);
      var localMs = folderMetadataRowTimestampMs(local);
      if (local && localMs && incomingMs && localMs > incomingMs) {
        localNewer.push({ folderId: folderId, fields: fields.slice(), localUpdatedAtMs: localMs, incomingUpdatedAtMs: incomingMs });
      } else if (local && localMs && !incomingMs) {
        localNewer.push({ folderId: folderId, fields: fields.slice(), localUpdatedAtMs: localMs, incomingUpdatedAtMs: 0 });
      }
      changed.push({ folderId: folderId, fields: fields.slice(), incomingUpdatedAtMs: incomingMs, localUpdatedAtMs: localMs });
    }
    if (!changed.length) {
      return {
        safe: true,
        reason: 'folder-metadata-no-field-difference',
        sourceKind: incoming.sourceKind,
        changedFolderCount: 0,
        changedFields: []
      };
    }
    if (localNewer.length) {
      return {
        safe: false,
        reason: 'same-field-newer-local-folder-metadata',
        sourceKind: incoming.sourceKind,
        changedFolderCount: changed.length,
        changedFields: changedFields,
        localNewer: localNewer.slice(0, 8)
      };
    }
    return {
      safe: true,
      reason: 'safe-folder-metadata-field-merge',
      sourceKind: incoming.sourceKind,
      changedFolderCount: changed.length,
      changedFields: changedFields,
      changed: changed.slice(0, 8)
    };
  }

  async function resolveAutoSyncTransportBlockers(bundle, blockers, options) {
    var resolved = resolveOperatorApprovedTransportBlockers(blockers, options);
    state.lastTransportConflictStatus = '';
    state.lastTransportConflictReason = '';
    state.lastTransportConflictDecision = resolved.conflictDecision;
    state.lastTransportConflictSummary = null;
    if (resolved.blockers.indexOf('library-propagation-simultaneous-update-conflict') === -1) {
      return resolved;
    }
    if (!options || options.autoSync !== true) {
      state.lastTransportConflictStatus = 'conflict-approval-required';
      state.lastTransportConflictReason = 'manual-or-non-auto-sync-simultaneous-conflict';
      state.lastTransportConflictDecision = 'conflict-approval-required';
      return Object.assign({}, resolved, {
        conflictDecision: 'conflict-approval-required',
        conflictApprovalRequired: true
      });
    }
    var analysis = await analyzeFolderMetadataAutoConflict(bundle);
    state.lastTransportConflictReason = cleanString(analysis.reason);
    state.lastTransportConflictSummary = cloneJson(analysis);
    if (!analysis.safe) {
      state.lastTransportConflictStatus = 'conflict-approval-required';
      state.lastTransportConflictDecision = 'conflict-approval-required';
      return Object.assign({}, resolved, {
        conflictDecision: 'conflict-approval-required',
        conflictApprovalRequired: true,
        autoFolderMetadataConflictAnalysis: analysis
      });
    }
    var autoApproved = resolveOperatorApprovedTransportBlockers(blockers, { conflictDecision: 'approve-merge' });
    state.lastTransportConflictStatus = 'auto-approved-folder-metadata';
    state.lastTransportConflictDecision = 'auto-approve-folder-metadata';
    return Object.assign({}, autoApproved, {
      conflictDecision: 'auto-approve-folder-metadata',
      conflictApproved: true,
      autoApproved: true,
      autoFolderMetadataConflictAnalysis: analysis
    });
  }

  function hasAnyKeys(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    for (var i = 0; i < keys.length; i += 1) {
      if (Object.prototype.hasOwnProperty.call(value, keys[i])) return true;
    }
    return false;
  }

  function countSnapshots(chats) {
    var total = 0;
    (Array.isArray(chats) ? chats : []).forEach(function (chat) {
      total += Array.isArray(chat && chat.snapshots) ? chat.snapshots.length : 0;
    });
    return total;
  }

  function countChatViews(chats) {
    var counts = { saved: 0, linked: 0, pinned: 0, archived: 0 };
    (Array.isArray(chats) ? chats : []).forEach(function (chat) {
      var index = chat && chat.chatIndex && typeof chat.chatIndex === 'object' ? chat.chatIndex : {};
      var stateObj = index.state && typeof index.state === 'object' ? index.state : {};
      var view = cleanString(index.view || index.kind || index.type).toLowerCase();
      var hasSnapshots = chatSnapshots(chat).length > 0;
      if (view === 'saved' || index.isSaved === true || stateObj.isSaved === true) counts.saved += 1;
      else if (view === 'linked' || index.isLinked === true || stateObj.isLinked === true) counts.linked += 1;
      else if (hasSnapshots) counts.saved += 1;
      if (index.pinned === true || index.isPinned === true || stateObj.isPinned === true) counts.pinned += 1;
      if (index.archived === true || index.isArchived === true || stateObj.isArchived === true) counts.archived += 1;
    });
    return counts;
  }

  function chatSnapshots(chat) {
    return Array.isArray(chat && chat.snapshots) ? chat.snapshots : [];
  }

  function chatIndexForRow(chat) {
    return chat && chat.chatIndex && typeof chat.chatIndex === 'object' && !Array.isArray(chat.chatIndex)
      ? chat.chatIndex
      : {};
  }

  function chatIndexState(chat) {
    var index = chatIndexForRow(chat);
    return index.state && typeof index.state === 'object' && !Array.isArray(index.state)
      ? index.state
      : {};
  }

  function desktopShellLinkTarget(chat, index) {
    return cleanString(index && (index.href || index.normalizedHref || index.linkSourceHref)) ||
      cleanString(chat && (chat.href || chat.normalizedHref || chat.linkSourceHref));
  }

  function isDesktopShellLibraryRow(chat) {
    var chatId = cleanString(chat && chat.chatId);
    if (!chatId || chatSnapshots(chat).length > 0) return false;
    var index = chatIndexForRow(chat);
    var stateObj = chatIndexState(chat);
    var view = cleanString(index.view || index.kind || index.type).toLowerCase();
    var hasLinkTarget = !!desktopShellLinkTarget(chat, index);
    return index.f19MinimalLibraryIndexRow === true ||
      index.f19ChromeDesktopMinimalRow === true ||
      view === 'saved' ||
      view === 'linked' ||
      view === 'imported' ||
      index.isSaved === true ||
      index.isLinked === true ||
      index.isImported === true ||
      stateObj.isSaved === true ||
      stateObj.isLinked === true ||
      stateObj.isImported === true ||
      stateObj.isPinned === true ||
      stateObj.isArchived === true ||
      hasLinkTarget;
  }

  function desktopShellRowSummary(chats) {
    var summary = { shellRowCount: 0, linkedOnlyCount: 0, savedShellCount: 0, importedShellCount: 0 };
    (Array.isArray(chats) ? chats : []).forEach(function (chat) {
      if (!isDesktopShellLibraryRow(chat)) return;
      summary.shellRowCount += 1;
      var index = chatIndexForRow(chat);
      var stateObj = chatIndexState(chat);
      var view = cleanString(index.view || index.kind || index.type).toLowerCase();
      var isSaved = view === 'saved' || index.isSaved === true || stateObj.isSaved === true;
      var isLinked = view === 'linked' || index.isLinked === true || stateObj.isLinked === true;
      var isImported = !isSaved && !isLinked &&
        (view === 'imported' || index.isImported === true || stateObj.isImported === true || !!desktopShellLinkTarget(chat, index));
      if (isLinked && !isSaved) summary.linkedOnlyCount += 1;
      if (isSaved) summary.savedShellCount += 1;
      if (isImported) summary.importedShellCount += 1;
    });
    return summary;
  }

  function sanitizeChatForDesktopChrome(chat, warnings) {
    var out = cloneJson(chat) || {};
    var chatIndex = out.chatIndex && typeof out.chatIndex === 'object' && !Array.isArray(out.chatIndex)
      ? out.chatIndex : null;
    if (chatIndex) {
      var org = chatIndex.organization && typeof chatIndex.organization === 'object' && !Array.isArray(chatIndex.organization)
        ? chatIndex.organization : null;
      if (org) {
        if (hasAnyKeys(org, ['labels', 'labelIds'])) addUnique(warnings, DESKTOP_CHROME_DEFERRED_CODES.labels);
        if (hasAnyKeys(org, ['tags', 'tagIds'])) addUnique(warnings, DESKTOP_CHROME_DEFERRED_CODES.tags);
        if (hasAnyKeys(org, ['projectId', 'projectIds', 'projects', 'gizmoId', 'workspaceId'])) {
          addUnique(warnings, DESKTOP_CHROME_DEFERRED_CODES.projects);
        }
        if (hasAnyKeys(org, ['folderId', 'folderName', 'folder_id'])) {
          addUnique(warnings, DESKTOP_CHROME_DEFERRED_CODES.folderBindings);
        }
        var nextOrg = {};
        if (typeof org.categoryId !== 'undefined') nextOrg.categoryId = org.categoryId;
        if (typeof org.category_id !== 'undefined') nextOrg.category_id = org.category_id;
        chatIndex.organization = nextOrg;
      }
    }
    return out;
  }

  function isStudioFolderActionSource(row) {
    var meta = row && row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta)
      ? row.meta : {};
    var values = [
      row && row.source,
      row && row.sourceKind,
      row && row.kind,
      meta.source,
      meta.sourceKind,
      meta.kind
    ].map(function (value) { return cleanString(value).toLowerCase(); });
    return values.indexOf('studio-actions') !== -1 ||
      values.indexOf('desktop-user-folder-create') !== -1 ||
      values.indexOf('chrome-user-folder-create') !== -1;
  }

  function sanitizeFolderForDesktopChrome(row) {
    var out = cloneJson(row) || {};
    if (!out || typeof out !== 'object' || Array.isArray(out)) return null;
    var folderId = cleanString(out.id || out.folderId || out.folder_id);
    if (!folderId) return null;
    out.id = cleanString(out.id || folderId);
    out.folderId = cleanString(out.folderId || folderId);
    if (typeof out.folder_id !== 'undefined') delete out.folder_id;
    if (isStudioFolderActionSource(out)) {
      var meta = out.meta && typeof out.meta === 'object' && !Array.isArray(out.meta)
        ? Object.assign({}, out.meta)
        : {};
      var source = cleanString(out.source || meta.source || 'studio-actions') || 'studio-actions';
      var sourceKind = cleanString(out.sourceKind || out.kind || meta.sourceKind || meta.kind || source) || source;
      out.source = source;
      out.sourceKind = sourceKind;
      out.kind = sourceKind;
      out.userCreated = true;
      out.materializedUserFolder = true;
      out.trustedFolderDisplay = true;
      out.shownInNormalMode = true;
      out.meta = Object.assign({}, meta, {
        source: source,
        sourceKind: sourceKind,
        userCreated: true,
        materializedUserFolder: true,
        trustedFolderDisplay: true,
        shownInNormalMode: true
      });
    }
    return out;
  }

  function readDesktopChromeFolderStateSource(bundle) {
    var csl = bundle && bundle.chromeStorageLocal && typeof bundle.chromeStorageLocal === 'object' && !Array.isArray(bundle.chromeStorageLocal)
      ? bundle.chromeStorageLocal
      : null;
    var fromStorage = csl && csl[FOLDER_STATE_KEY_LOCAL];
    if (fromStorage && typeof fromStorage === 'object' && !Array.isArray(fromStorage)) {
      return { source: fromStorage, sourceKind: 'chromeStorageLocal' };
    }
    var direct = bundle && bundle.folderState;
    if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
      return { source: direct, sourceKind: 'folderState' };
    }
    var catalogs = bundle && bundle.chatArchive && bundle.chatArchive.catalogs &&
      typeof bundle.chatArchive.catalogs === 'object' && !Array.isArray(bundle.chatArchive.catalogs)
      ? bundle.chatArchive.catalogs
      : null;
    var catalogFolders = catalogs && catalogs.folders;
    if (Array.isArray(catalogFolders) && catalogFolders.length > 0) {
      return {
        source: {
          schemaVersion: 1,
          exportedFrom: 'chatArchive.catalogs.folders',
          exportedAt: cleanString(bundle && bundle.exportedAt),
          folders: catalogFolders,
          items: {}
        },
        sourceKind: 'chatArchive.catalogs.folders'
      };
    }
    return { source: null, sourceKind: '' };
  }

  function folderStateForDesktopChrome(bundle, warnings) {
    var found = readDesktopChromeFolderStateSource(bundle);
    var source = found.source;
    if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
    var folders = [];
    if (Array.isArray(source.folders)) {
      for (var f = 0; f < source.folders.length; f += 1) {
        var folder = sanitizeFolderForDesktopChrome(source.folders[f]);
        if (folder) folders.push(folder);
      }
    }
    var items = source.items && typeof source.items === 'object' && !Array.isArray(source.items) ? source.items : {};
    var itemKeys = Object.keys(items);
    for (var i = 0; i < itemKeys.length; i += 1) {
      if (Array.isArray(items[itemKeys[i]]) && items[itemKeys[i]].length > 0) {
        addUnique(warnings, DESKTOP_CHROME_DEFERRED_CODES.folderBindings);
        break;
      }
    }
    return {
      schemaVersion: Number(source.schemaVersion || source.version || 1) || 1,
      exportedFrom: cleanString(source.exportedFrom || source.source || 'desktop-studio'),
      exportedAt: cleanString(source.exportedAt || source.updatedAt),
      sourceKind: cleanString(found.sourceKind),
      folders: folders,
      items: {}
    };
  }

  function buildDesktopChromeSupportedBundle(bundleInput) {
    var warnings = [];
    var blockers = [];
    var bundle = bundleInput && typeof bundleInput === 'object' && !Array.isArray(bundleInput)
      ? bundleInput : null;
    if (!bundle) return { ok: false, blockers: ['library-propagation-bundle-invalid'], warnings: warnings };
    if (cleanString(bundle.schema) !== FULL_BUNDLE_SCHEMA) {
      return { ok: false, blockers: ['library-propagation-schema-invalid'], warnings: warnings };
    }
    var chatArchive = bundle.chatArchive && typeof bundle.chatArchive === 'object' && !Array.isArray(bundle.chatArchive)
      ? bundle.chatArchive : {};
    var sourceCatalogs = chatArchive.catalogs && typeof chatArchive.catalogs === 'object' && !Array.isArray(chatArchive.catalogs)
      ? chatArchive.catalogs : {};
    var sourceChats = Array.isArray(chatArchive.chats) ? chatArchive.chats : [];
    var sourceCategories = Array.isArray(sourceCatalogs.categories) ? sourceCatalogs.categories : [];
    if (Array.isArray(sourceCatalogs.labels) && sourceCatalogs.labels.length > 0) {
      addUnique(warnings, DESKTOP_CHROME_DEFERRED_CODES.labels);
    }
    if (Array.isArray(sourceCatalogs.tags) && sourceCatalogs.tags.length > 0) {
      addUnique(warnings, DESKTOP_CHROME_DEFERRED_CODES.tags);
    }
    if (Array.isArray(bundle.libraryKv) && bundle.libraryKv.length > 0) {
      addUnique(warnings, DESKTOP_CHROME_DEFERRED_CODES.labels);
      addUnique(warnings, DESKTOP_CHROME_DEFERRED_CODES.unsupportedStorage);
    }
    if (Array.isArray(bundle.tombstones) && bundle.tombstones.length > 0) {
      addUnique(warnings, DESKTOP_CHROME_DEFERRED_CODES.tombstones);
    }
    if (bundle.syncApplyEvents && Number(bundle.syncApplyEvents.total || 0) > 0) {
      addUnique(warnings, DESKTOP_CHROME_DEFERRED_CODES.applyEvents);
    }
    if (bundle.chromeStorageLocal && typeof bundle.chromeStorageLocal === 'object' && !Array.isArray(bundle.chromeStorageLocal)) {
      Object.keys(bundle.chromeStorageLocal).forEach(function (key) {
        if (key !== FOLDER_STATE_KEY_LOCAL) addUnique(warnings, DESKTOP_CHROME_DEFERRED_CODES.unsupportedStorage);
      });
    }
    if (bundle.projects || bundle.projectCatalog || bundle.workspaceProjects) {
      addUnique(warnings, DESKTOP_CHROME_DEFERRED_CODES.projects);
    }
    if (!bundle.sourcePeerEnvelope && !bundle.sourceSyncPeerId && !bundle.exportedFromSurface) {
      addUnique(warnings, DESKTOP_CHROME_DEFERRED_CODES.sourceMetadataMissing);
    }
    var chats = sourceChats.map(function (chat) {
      return sanitizeChatForDesktopChrome(chat, warnings);
    });
    var chatViewCounts = countChatViews(chats);
    var shellSummary = desktopShellRowSummary(chats);
    var categories = cloneJson(sourceCategories) || [];
    var folderState = folderStateForDesktopChrome(bundle, warnings);
    var chromeStorageLocal = {};
    if (folderState) chromeStorageLocal[FOLDER_STATE_KEY_LOCAL] = folderState;
    var supported = {
      schema: FULL_BUNDLE_SCHEMA,
      exportedAt: cleanString(bundle.exportedAt),
      exportId: cleanString(bundle.exportId),
      sequenceNumber: typeof bundle.sequenceNumber === 'number' ? bundle.sequenceNumber : null,
      previousExportId: bundle.previousExportId ? cleanString(bundle.previousExportId) : null,
      contentSha256: cleanString(bundle.contentSha256),
      sourceSurfaceKind: cleanString(bundle.sourceSurfaceKind || bundle.exportedFromSurface || 'desktop-studio'),
      sourceAppKind: cleanString(bundle.sourceAppKind || bundle.exportedFromExtensionName),
      sourceStoreKind: cleanString(bundle.sourceStoreKind || 'desktop-sqlite'),
      sourcePeerEnvelope: bundle.sourcePeerEnvelope && typeof bundle.sourcePeerEnvelope === 'object'
        ? cloneJson(bundle.sourcePeerEnvelope) : null,
      chatArchive: {
        schema: cleanString(chatArchive.schema || 'h2o.chatArchive.bundle.v1'),
        exportedAt: cleanString(chatArchive.exportedAt || bundle.exportedAt),
        chats: chats,
        catalogs: {
          categories: categories,
          labels: []
        }
      },
      chromeStorageLocal: chromeStorageLocal,
      libraryKv: []
    };
    return {
      ok: true,
      bundle: supported,
      warnings: warnings,
      blockers: blockers,
      sourceSummary: {
        schema: FULL_BUNDLE_SCHEMA,
        direction: 'desktop-to-chrome',
        transport: 'latest.json',
        chatCount: chats.length,
        savedCount: chatViewCounts.saved,
        linkedCount: chatViewCounts.linked,
        pinnedCount: chatViewCounts.pinned,
        archivedCount: chatViewCounts.archived,
        shellRowCount: shellSummary.shellRowCount,
        linkedOnlyCount: shellSummary.linkedOnlyCount,
        savedShellCount: shellSummary.savedShellCount,
        importedShellCount: shellSummary.importedShellCount,
        snapshotCount: countSnapshots(chats),
        categoryCount: categories.length,
        folderMetadataCount: folderState && Array.isArray(folderState.folders) ? folderState.folders.length : 0,
        folderStateSource: cleanString(folderState && folderState.sourceKind),
        folderFacetConvergenceRequired: false,
        folderCount: folderState && Array.isArray(folderState.folders) ? folderState.folders.length : 0,
        hasSourcePeerEnvelope: !!supported.sourcePeerEnvelope,
        hasExportId: !!supported.exportId,
        hasContentSha256: !!supported.contentSha256
      }
    };
  }

  function redactedDryRunSummary(dryRun) {
    var plan = safeObject(dryRun && dryRun.plan);
    var chats = safeObject(plan.chats);
    var storage = safeObject(plan.chromeStorageLocal);
    var kv = safeObject(plan.libraryKv);
    return {
      ok: dryRun && dryRun.ok !== false,
      incomingChats: numberOrZero(chats.incoming),
      incomingSnapshots: numberOrZero(chats.incomingSnapshots),
      willImportChats: numberOrZero(chats.willImport),
      willSkipDuplicateChats: numberOrZero(chats.willSkipDuplicates),
      storageKeysIncoming: numberOrZero(storage.incoming),
      storageKeysWillImport: numberOrZero(storage.willImport),
      storageKeysDeniedByPolicy: numberOrZero(storage.deniedByPolicy),
      libraryKvIncoming: numberOrZero(kv.incoming),
      libraryKvWillImport: numberOrZero(kv.willImport),
      libraryKvDeniedByPolicy: numberOrZero(kv.deniedByPolicy)
    };
  }

  function redactedErrorCategoryList(categories) {
    var counts = Object.create(null);
    (Array.isArray(categories) ? categories : []).forEach(function (entry) {
      var code = cleanString(entry && entry.code) || 'import-error';
      counts[code] = Number(counts[code] || 0) + Number((entry && entry.count) || 1);
    });
    return Object.keys(counts).sort().map(function (code) {
      return { code: code, count: counts[code] };
    });
  }

  function addRedactedErrorCategory(categories, code) {
    var normalized = cleanString(code) || 'import-error';
    categories.push({ code: normalized, count: 1 });
  }

  function classifyDesktopShellImportError(error) {
    var msg = String(error && (error.message || error) || '').toLowerCase();
    if (msg.indexOf('registry') !== -1 && msg.indexOf('unavailable') !== -1) return 'desktop-shell-row-registry-unavailable';
    if (msg.indexOf('chatid') !== -1 || msg.indexOf('chat id') !== -1) return 'desktop-shell-row-required-field-missing';
    if (msg.indexOf('upsert') !== -1) return 'desktop-shell-row-materialize-failed';
    return 'desktop-shell-row-materialize-failed';
  }

  function registryForDesktopShellRows() {
    return H2O.ChatRegistry ||
      (H2O.Library && H2O.Library.ChatRegistry) ||
      null;
  }

  function desktopShellRecordFromChat(chat) {
    var chatId = cleanString(chat && chat.chatId);
    if (!chatId) return null;
    var index = chatIndexForRow(chat);
    var stateObj = chatIndexState(chat);
    var org = index.organization && typeof index.organization === 'object' && !Array.isArray(index.organization)
      ? index.organization
      : {};
    var meta = chat && chat.meta && typeof chat.meta === 'object' && !Array.isArray(chat.meta) ? chat.meta : {};
    var source = chat && chat.source && typeof chat.source === 'object' && !Array.isArray(chat.source) ? chat.source : {};
    var view = cleanString(index.view || index.kind || index.type).toLowerCase();
    var saved = view === 'saved' || index.isSaved === true || stateObj.isSaved === true;
    var linked = view === 'linked' || index.isLinked === true || stateObj.isLinked === true;
    var imported = !saved && !linked &&
      (view === 'imported' || index.isImported === true || stateObj.isImported === true || !!desktopShellLinkTarget(chat, index));
    var href = desktopShellLinkTarget(chat, index)
      || ('https://chatgpt.com/c/' + chatId);
    var linkedAt = cleanString(index.linkedAt || chat.linkedAt);
    var now = nowIso();
    var title = friendlyShellTitle([
        index.title || chat.title,
        index.displayTitle,
        index.sourceTitle,
        index.pageTitle,
        index.chatTitle,
        index.originalTitle,
        index.name,
        chat.displayTitle,
        chat.sourceTitle,
        chat.pageTitle,
        chat.chatTitle,
        chat.originalTitle,
        chat.name,
        meta.title,
        meta.displayTitle,
        meta.sourceTitle,
        meta.pageTitle,
        meta.chatTitle,
        meta.originalTitle,
        source.title,
        source.displayTitle,
        source.sourceTitle,
        source.pageTitle,
        source.chatTitle,
        source.originalTitle,
        index.filename,
        index.sourceLabel,
        chat.filename,
        chat.sourceLabel,
        source.filename,
        source.label
      ], chatId, linked && !saved ? 'Link' : 'Imported chat');
    return {
      chatId: chatId,
      title: title,
      displayTitle: title,
      sourceTitle: title,
      pageTitle: title,
      chatTitle: title,
      originalTitle: title,
      href: href,
      normalizedHref: cleanString(index.normalizedHref || chat.normalizedHref) || href,
      updatedAt: cleanString(index.updatedAt || chat.updatedAt) || now,
      lastSeenAt: cleanString(index.lastSeenAt || chat.lastSeenAt) || now,
      source: {
        first: 'desktop-sync-folder',
        seenFrom: ['desktop-sync-folder']
      },
      organization: {
        categoryId: cleanString(org.categoryId || org.category_id),
        folderId: '',
        tagIds: [],
        labelIds: []
      },
      state: {
        isSaved: !!saved,
        isLinked: !!(linked || saved),
        isPinned: index.pinned === true || index.isPinned === true || stateObj.isPinned === true,
        isArchived: index.archived === true || index.isArchived === true || stateObj.isArchived === true,
        isImported: true,
        isDeleted: stateObj.isDeleted === true
      },
      linkedAt: linkedAt || now,
      linkedFrom: cleanString(index.linkedFrom || chat.linkedFrom) || 'desktop-sync-folder',
      linkSourceHref: cleanString(index.linkSourceHref || chat.linkSourceHref) || href,
      quality: {
        confidence: 'sync-shell',
        inferredFields: imported ? ['desktop-imported-shell-row'] : ['desktop-shell-row']
      }
    };
  }

  async function materializeDesktopShellRows(bundle) {
    var chats = bundle && bundle.chatArchive && Array.isArray(bundle.chatArchive.chats)
      ? bundle.chatArchive.chats
      : [];
    var rows = chats.filter(isDesktopShellLibraryRow);
    var result = {
      attempted: rows.length > 0,
      incoming: rows.length,
      materialized: 0,
      existing: 0,
      failed: 0,
      satisfied: 0,
      redactedErrorCategories: []
    };
    if (rows.length === 0) return result;
    var registry = registryForDesktopShellRows();
    if (!registry || typeof registry.upsertRecord !== 'function') {
      result.failed = rows.length;
      addRedactedErrorCategory(result.redactedErrorCategories, 'desktop-shell-row-registry-unavailable');
      return result;
    }
    try {
      if (registry.ready && typeof registry.ready.then === 'function') await registry.ready;
    } catch (_) { /* continue with in-memory API if available */ }
    for (var i = 0; i < rows.length; i += 1) {
      try {
        var record = desktopShellRecordFromChat(rows[i]);
        if (!record || !record.chatId) throw new Error('desktop shell row chatId missing');
        var existed = null;
        if (typeof registry.getRecord === 'function') {
          try { existed = registry.getRecord(record.chatId); } catch (_) { existed = null; }
        }
        var written = registry.upsertRecord(record, {
          source: 'desktop-sync-folder',
          passive: true,
          observedAt: nowIso()
        });
        if (!written) throw new Error('desktop shell row upsert failed');
        if (existed) result.existing += 1;
        else result.materialized += 1;
      } catch (error) {
        result.failed += 1;
        addRedactedErrorCategory(result.redactedErrorCategories, classifyDesktopShellImportError(error));
      }
    }
    result.satisfied = result.materialized + result.existing;
    result.redactedErrorCategories = redactedErrorCategoryList(result.redactedErrorCategories);
    return result;
  }

  function redactedChromeImportSummary(importResult, dryRun, shellRows) {
    var chats = safeObject(importResult && importResult.chats);
    var storage = safeObject(importResult && importResult.chromeStorageLocal);
    var kv = safeObject(importResult && importResult.libraryKv);
    var shell = safeObject(shellRows);
    var folderStateMergeStats = safeObject(safeObject(storage.folderStateMergeStats)[FOLDER_STATE_KEY_LOCAL]);
    return {
      ok: importResult && importResult.schema === FULL_BUNDLE_SCHEMA,
      mode: cleanString(importResult && importResult.mode) || 'merge',
      dryRun: redactedDryRunSummary(dryRun),
      importedChats: numberOrZero(chats.importedChats),
      importedSnapshots: numberOrZero(chats.importedSnapshots),
      chromeStorageWritten: numberOrZero(storage.written || storage.writtenCount || storage.imported),
      chromeStorageSkipped: numberOrZero(storage.skipped || storage.skippedCount),
      libraryKvWritten: numberOrZero(kv.written || kv.writtenCount || kv.imported),
      libraryKvSkipped: numberOrZero(kv.skipped || kv.skippedCount),
      folderMetadataFreshness: {
        incoming: numberOrZero(folderStateMergeStats.incoming),
        created: numberOrZero(folderStateMergeStats.created),
        refreshed: numberOrZero(folderStateMergeStats.refreshed),
        skippedStale: numberOrZero(folderStateMergeStats.skippedStale),
        missingIncomingUpdatedAt: numberOrZero(folderStateMergeStats.missingIncomingUpdatedAt),
        missingExistingUpdatedAt: numberOrZero(folderStateMergeStats.missingExistingUpdatedAt)
      },
      shellRowsIncoming: numberOrZero(shell.incoming),
      shellRowsMaterialized: numberOrZero(shell.materialized),
      shellRowsExisting: numberOrZero(shell.existing),
      shellRowsSatisfied: numberOrZero(shell.satisfied),
      shellRowsFailed: numberOrZero(shell.failed),
      redactedErrorCategories: redactedErrorCategoryList(shell.redactedErrorCategories)
    };
  }

  function safeCounts(value) {
    var counts = safeObject(value);
    return {
      total: numberOrZero(counts.total),
      saved: numberOrZero(counts.saved),
      linked: numberOrZero(counts.linked),
      pinned: numberOrZero(counts.pinned),
      archived: numberOrZero(counts.archived),
      folders: numberOrZero(counts.folders),
      categories: numberOrZero(counts.categories)
    };
  }

  function evaluateFolderMetadataConvergence(sourceSummary, importSummary) {
    var source = safeObject(sourceSummary);
    var summary = safeObject(importSummary);
    var freshness = safeObject(summary.folderMetadataFreshness);
    var expected = numberOrZero(source.folderMetadataCount || source.folderCount);
    var incoming = numberOrZero(freshness.incoming);
    var created = numberOrZero(freshness.created);
    var refreshed = numberOrZero(freshness.refreshed);
    var skippedStale = numberOrZero(freshness.skippedStale);
    var satisfied = created + refreshed + skippedStale;
    var storageTouched = numberOrZero(summary.chromeStorageWritten) > 0 || numberOrZero(summary.chromeStorageSkipped) > 0;
    var ok = expected === 0 || (
      summary.ok === true &&
      incoming >= expected &&
      satisfied >= expected &&
      storageTouched
    );
    return {
      ok: ok,
      expected: expected,
      incoming: incoming,
      created: created,
      refreshed: refreshed,
      skippedStale: skippedStale,
      satisfied: satisfied,
      storageTouched: storageTouched,
      source: cleanString(source.folderStateSource),
      blocker: ok ? '' : 'desktop-to-chrome-folder-metadata-convergence-not-proven'
    };
  }

  function evaluateDesktopChromeConvergence(sourceSummary, parity, importSummary) {
    var source = safeObject(sourceSummary);
    var counts = safeCounts(parity && parity.counts);
    var folderMetadata = evaluateFolderMetadataConvergence(sourceSummary, importSummary);
    var folderMetadataConvergenceApplies = folderMetadata.ok === true && folderMetadata.expected > 0;
    var expected = {
      total: numberOrZero(source.chatCount),
      saved: numberOrZero(source.savedCount),
      linked: numberOrZero(source.linkedCount),
      pinned: numberOrZero(source.pinnedCount),
      archived: numberOrZero(source.archivedCount),
      folders: numberOrZero(source.folderCount),
      folderMetadata: numberOrZero(source.folderMetadataCount || source.folderCount),
      categories: numberOrZero(source.categoryCount)
    };
    var mismatches = [];
    var nonBlockingMismatches = [];
    var activeRowFields = ['total', 'saved', 'linked', 'pinned', 'archived'];
    ['total', 'saved', 'linked'].forEach(function (key) {
      if (counts[key] !== expected[key]) {
        nonBlockingMismatches.push({ field: key, expected: expected[key], observed: counts[key], reason: 'active-row-parity-deferred' });
      }
    });
    ['categories'].forEach(function (key) {
      if (counts[key] !== expected[key]) {
        nonBlockingMismatches.push({ field: key, expected: expected[key], observed: counts[key], reason: 'active-row-parity-deferred' });
      }
    });
    if (source.folderFacetConvergenceRequired === true && counts.folders !== expected.folders) {
      mismatches.push({ field: 'folders', expected: expected.folders, observed: counts.folders });
    }
    ['pinned', 'archived'].forEach(function (key) {
      if (expected[key] > 0 && counts[key] < expected[key]) {
        nonBlockingMismatches.push({ field: key, expected: expected[key], observed: counts[key], reason: 'active-row-parity-deferred' });
      }
    });
    if (!folderMetadata.ok && expected.folderMetadata > 0) {
      mismatches.push({
        field: 'folderMetadata',
        expected: expected.folderMetadata,
        observed: folderMetadata.satisfied,
        incoming: folderMetadata.incoming,
        reason: folderMetadata.blocker
      });
    }
    if (!parity || parity.snapshotCaptured !== true) {
      mismatches.push({ field: 'paritySnapshot', expected: true, observed: false });
    }
    if (!folderMetadataConvergenceApplies && nonBlockingMismatches.length > 0) {
      for (var i = 0; i < nonBlockingMismatches.length; i += 1) {
        var entry = Object.assign({}, nonBlockingMismatches[i]);
        if (activeRowFields.indexOf(entry.field) !== -1) entry.reason = 'active-row-parity-required';
        mismatches.push(entry);
      }
      nonBlockingMismatches = [];
    }
    return {
      ok: mismatches.length === 0,
      expected: expected,
      observed: counts,
      mismatchCount: mismatches.length,
      mismatches: mismatches,
      nonBlockingMismatchCount: nonBlockingMismatches.length,
      nonBlockingMismatches: nonBlockingMismatches,
      activeRowConvergenceDeferred: folderMetadataConvergenceApplies && nonBlockingMismatches.length > 0,
      folderMetadata: folderMetadata,
      blocker: mismatches.length ? 'desktop-to-chrome-convergence-not-proven' : ''
    };
  }

  function redactedPostImportRefreshSummary(value) {
    var summary = safeObject(value);
    var changedFolderIds = Array.isArray(summary.changedFolderIds) ? summary.changedFolderIds : [];
    return {
      mode: cleanString(summary.mode),
      changedFolderCount: numberOrZero(summary.changedFolderCount),
      changedFields: Array.isArray(summary.changedFields) ? summary.changedFields.slice() : [],
      changedFolderIdCount: changedFolderIds.length,
      changedFolderIdsRedacted: changedFolderIds.length > 0,
      renderRefreshedAt: cleanString(summary.renderRefreshedAt),
      renderRefreshCount: numberOrZero(summary.renderRefreshCount),
      cumulativeRenderRefreshCount: numberOrZero(summary.cumulativeRenderRefreshCount),
      refreshSuppressed: summary.refreshSuppressed === true,
      totalPropagationMs: numberOrZero(summary.totalPropagationMs),
      error: cleanString(summary.error)
    };
  }

  function propagationResult(ok, fields) {
    var f = fields && typeof fields === 'object' ? fields : {};
    var blockers = normalizeHardeningBlockers(f.blockers);
    var warnings = normalizeHardeningWarnings(f.warnings);
    var statusValue = cleanString(f.status || (ok ? 'imported' : 'blocked'));
    return {
      schema: PROPAGATION_SCHEMA,
      version: F19_DESKTOP_CHROME_VERSION,
      ok: ok === true && blockers.length === 0,
      direction: 'desktop-to-chrome',
      transport: 'latest.json',
      status: statusValue,
      conflictDecision: cleanString(f.conflictDecision),
      conflictApproved: f.conflictApproved === true,
      conflictApproval: {
        approved: f.conflictApproved === true,
        decision: cleanString(f.conflictDecision),
        approvedBlockers: Array.isArray(f.approvedConflictBlockers) ? f.approvedConflictBlockers.slice() : [],
        staleTransportStillBlocks: true,
        duplicateIdempotencyPreserved: true
      },
      supportedFields: DESKTOP_CHROME_SUPPORTED_FIELDS.slice(),
      deferredFields: warnings.filter(function (code) {
        return code === DESKTOP_CHROME_DEFERRED_CODES.labels ||
          code === DESKTOP_CHROME_DEFERRED_CODES.tags ||
          code === DESKTOP_CHROME_DEFERRED_CODES.projects ||
          code === DESKTOP_CHROME_DEFERRED_CODES.folderBindings ||
          code === DESKTOP_CHROME_DEFERRED_CODES.tombstones ||
          code === DESKTOP_CHROME_DEFERRED_CODES.applyEvents;
      }),
      sourceSummary: f.sourceSummary || null,
      folderMetadataCount: numberOrZero(f.sourceSummary && (f.sourceSummary.folderMetadataCount || f.sourceSummary.folderCount)),
      folderStateSource: cleanString(f.sourceSummary && f.sourceSummary.folderStateSource),
      importSummary: f.importSummary || null,
      convergence: f.convergence || null,
      postImportRefresh: f.postImportRefresh ? redactedPostImportRefreshSummary(f.postImportRefresh) : null,
      redactedErrorCategories: redactedErrorCategoryList(f.redactedErrorCategories ||
        (f.importSummary && f.importSummary.redactedErrorCategories)),
      parity: f.parity || {
        snapshotCaptured: false,
        paritySnapshotHash: '',
        parityDiagnosticReady: !!(H2O.Studio && H2O.Studio.sync && H2O.Studio.sync.libraryParity)
      },
      idempotency: f.idempotency || {
        fileFingerprintChecked: false,
        mergeOnly: true,
        existingRowsSkipped: true
      },
      hardening: {
        taxonomy: F19_SYNC_HARDENING_CODES,
        duplicateImportIdempotent: warnings.indexOf(F19_SYNC_HARDENING_CODES.duplicateImportIdempotent) !== -1,
        staleBlocked: blockers.indexOf(F19_SYNC_HARDENING_CODES.transportStale) !== -1,
        simultaneousConflictBlocked: blockers.indexOf(F19_SYNC_HARDENING_CODES.simultaneousUpdateConflict) !== -1,
        simultaneousConflictApproved: f.conflictApproved === true,
        deferredFieldsExplicit: warnings.indexOf(F19_SYNC_HARDENING_CODES.deferredFieldPresent) !== -1,
        unsupportedFieldsExplicit: warnings.indexOf(F19_SYNC_HARDENING_CODES.unsupportedFieldPresent) !== -1,
        sourceMetadataChecked: warnings.indexOf(F19_SYNC_HARDENING_CODES.sourceMetadataMissing) !== -1
      },
      privacy: {
        redacted: true,
        rawIdsReturned: false,
        rawTitlesReturned: false,
        rawContentReturned: false
      },
      sideEffects: {
        chromeStorageMayWriteSupportedRows: ok === true && statusValue !== 'already-imported' && statusValue !== 'dry-run-ok',
        desktopSqliteWritten: false,
        nativeCalled: false,
        f5Touched: false,
        relayTouched: false,
        outboxTouched: false
      },
      blockers: blockers,
      warnings: warnings,
      observedAt: nowIso()
    };
  }

  async function captureParityAfterImport() {
    try {
      var parity = H2O.Studio && H2O.Studio.sync && H2O.Studio.sync.libraryParity;
      if (!parity || typeof parity.captureSnapshot !== 'function') {
        return { snapshotCaptured: false, paritySnapshotHash: '', parityDiagnosticReady: false };
      }
      var snapshot = await parity.captureSnapshot();
      return {
        snapshotCaptured: !!(snapshot && snapshot.schema),
        paritySnapshotHash: await sha256Hex(JSON.stringify(snapshot || {})),
        parityDiagnosticReady: true,
        surface: cleanString(snapshot && snapshot.surface),
        counts: safeCounts(snapshot && snapshot.counts)
      };
    } catch (_) {
      return {
        snapshotCaptured: false,
        paritySnapshotHash: '',
        parityDiagnosticReady: false,
        warning: 'library-propagation-parity-snapshot-failed'
      };
    }
  }

  async function importDesktopBundlePayload(bundleInput, options) {
    var opts = safeObject(options);
    var normalized = buildDesktopChromeSupportedBundle(bundleInput);
    if (!normalized.ok) {
      return propagationResult(false, {
        status: 'blocked',
        blockers: normalized.blockers || ['library-propagation-bundle-invalid'],
        warnings: normalized.warnings || []
      });
    }
    var warnings = normalized.warnings.slice();
    if (opts.conflictApproved === true) addUnique(warnings, 'library-propagation-simultaneous-conflict-approved');
    var folderMetadataChangeSummary = safeObject(opts.folderMetadataChangeSummary);
    if (!Object.prototype.hasOwnProperty.call(folderMetadataChangeSummary, 'changedFolderCount')) {
      folderMetadataChangeSummary = await summarizeDesktopFolderMetadataChanges(normalized.bundle);
    }
    var dryRun;
    try {
      dryRun = await callArchive('dryRunImportFullBundle', { bundle: normalized.bundle });
    } catch (_) {
      return propagationResult(false, {
        status: 'blocked',
        blockers: ['library-propagation-dry-run-failed'],
        warnings: warnings,
        sourceSummary: normalized.sourceSummary
      });
    }
    if (opts.dryRunOnly === true || opts.proofMode === true) {
      var dryParity = await captureParityAfterImport();
      if (dryParity.warning) addUnique(warnings, dryParity.warning);
      return propagationResult(true, {
        status: 'dry-run-ok',
        warnings: warnings,
        sourceSummary: normalized.sourceSummary,
        importSummary: { ok: true, mode: 'merge', dryRun: redactedDryRunSummary(dryRun), proofMode: opts.proofMode === true },
        parity: dryParity,
        conflictDecision: normalizeConflictDecision(opts),
        conflictApproved: opts.conflictApproved === true,
        approvedConflictBlockers: Array.isArray(opts.approvedConflictBlockers) ? opts.approvedConflictBlockers : [],
        idempotency: {
          fileFingerprintChecked: opts.fileFingerprint ? true : false,
          mergeOnly: true,
          existingRowsSkipped: true,
          dryRunOnly: true
        }
      });
    }
    var importResult;
    try {
      importResult = await callArchive('importFullBundle', { bundle: normalized.bundle, mode: 'merge' });
    } catch (_) {
      return propagationResult(false, {
        status: 'blocked',
        blockers: ['library-propagation-import-failed'],
        warnings: warnings,
        sourceSummary: normalized.sourceSummary,
        importSummary: { ok: false, dryRun: redactedDryRunSummary(dryRun) }
      });
    }
    var shellRows = await materializeDesktopShellRows(normalized.bundle);
    if (numberOrZero(folderMetadataChangeSummary.changedFolderCount) > 0) {
      await refreshLibraryIndex('desktop-chrome-propagation-import');
    }
    state.lastDesktopToChromeImportAppliedAt = nowIso();
    var postImportRefresh = await refreshChromeFolderUiAfterDesktopImport(
      folderMetadataChangeSummary,
      opts.reason || 'desktop-chrome-propagation-import',
      cleanString(normalized.bundle && normalized.bundle.exportedAt)
    );
    var parity = await captureParityAfterImport();
    if (parity.warning) addUnique(warnings, parity.warning);
    var importSummary = redactedChromeImportSummary(importResult, dryRun, shellRows);
    var blockers = [];
    var redactedErrors = importSummary.redactedErrorCategories;
    if (numberOrZero(importSummary.shellRowsFailed) > 0) addUnique(blockers, 'desktop-shell-row-import-unsupported');
    var convergence = evaluateDesktopChromeConvergence(normalized.sourceSummary, parity, importSummary);
    if (!convergence.ok) addUnique(blockers, convergence.blocker);
    return propagationResult(blockers.length === 0, {
      status: 'imported',
      blockers: blockers,
      warnings: warnings,
      sourceSummary: normalized.sourceSummary,
      importSummary: importSummary,
      convergence: convergence,
      postImportRefresh: postImportRefresh,
      redactedErrorCategories: redactedErrors,
      parity: parity,
      conflictDecision: normalizeConflictDecision(opts),
      conflictApproved: opts.conflictApproved === true,
      approvedConflictBlockers: Array.isArray(opts.approvedConflictBlockers) ? opts.approvedConflictBlockers : [],
      idempotency: {
        fileFingerprintChecked: opts.fileFingerprint ? true : false,
        mergeOnly: true,
        existingRowsSkipped: true,
        protectedDomainFallbackDisabled: true
      }
    });
  }

  function isBundleLikeInput(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return !!(
      cleanString(value.schema) ||
      value.chatArchive ||
      value.chromeStorageLocal ||
      value.libraryKv ||
      value.folderState
    );
  }

  function shouldTreatAsLatestJsonImportOptions(bundleInput, options, argumentCount) {
    if (argumentCount === 0) return true;
    if (typeof options !== 'undefined') return false;
    if (!bundleInput || typeof bundleInput !== 'object' || Array.isArray(bundleInput)) return false;
    if (isBundleLikeInput(bundleInput)) return false;
    return Object.prototype.hasOwnProperty.call(bundleInput, 'reason') ||
      Object.prototype.hasOwnProperty.call(bundleInput, 'dryRunOnly') ||
      Object.prototype.hasOwnProperty.call(bundleInput, 'autoSync') ||
      Object.prototype.hasOwnProperty.call(bundleInput, 'conflictDecision') ||
      Object.prototype.hasOwnProperty.call(bundleInput, 'conflictApproved') ||
      Object.prototype.hasOwnProperty.call(bundleInput, 'approvedConflictBlockers') ||
      Object.prototype.hasOwnProperty.call(bundleInput, 'direction');
  }

  async function importLatestBundle(bundleInput, options) {
    if (shouldTreatAsLatestJsonImportOptions(bundleInput, options, arguments.length)) {
      return syncNow(safeObject(bundleInput));
    }
    return importDesktopBundlePayload(bundleInput, options);
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

  function currentLibraryIndexRowCount() {
    try {
      return H2O.LibraryIndex && typeof H2O.LibraryIndex.getAll === 'function'
        ? H2O.LibraryIndex.getAll().length
        : 0;
    } catch (_) {
      return 0;
    }
  }

  async function summarizeDesktopFolderMetadataChanges(bundle) {
    var incoming = folderMetadataRowsFromBundle(bundle);
    var localState = safeObject(await readKv(FOLDER_STATE_KEY_LOCAL));
    var localRows = Array.isArray(localState.folders) ? localState.folders : [];
    var localById = Object.create(null);
    for (var i = 0; i < localRows.length; i += 1) {
      var localId = folderMetadataRowId(localRows[i]);
      if (localId) localById[localId] = localRows[i];
    }
    var changedRows = [];
    var changedFields = [];
    var changedFolderIds = [];
    for (var r = 0; r < incoming.rows.length; r += 1) {
      var row = incoming.rows[r];
      var folderId = folderMetadataRowId(row);
      if (!folderId) continue;
      var local = localById[folderId] || null;
      var fields = [];
      if (!local) fields.push('create');
      else {
        if (folderMetadataRowName(row) !== folderMetadataRowName(local)) fields.push('name');
        if (folderMetadataRowColor(row) !== folderMetadataRowColor(local)) fields.push('color');
      }
      if (!fields.length) continue;
      fields.forEach(function (field) { addUnique(changedFields, field); });
      addUnique(changedFolderIds, folderId);
      changedRows.push({ folderId: folderId, fields: fields.slice(), row: row });
    }
    return {
      sourceKind: incoming.sourceKind,
      changedFolderCount: changedRows.length,
      changedFolderIds: changedFolderIds,
      changedFields: changedFields,
      hasCreate: changedFields.indexOf('create') !== -1,
      hasOnlyVisualUpdates: changedRows.length > 0 && changedFields.every(function (field) {
        return field === 'name' || field === 'color';
      }),
      rows: changedRows,
    };
  }

  function dispatchFolderMetadataChangedEvent(summary, reason, mode) {
    try {
      global.dispatchEvent(new CustomEvent('evt:h2o:folder-metadata:changed', {
        detail: {
          source: 'desktop-to-chrome-import',
          reason: cleanString(reason) || 'sync-folder-import',
          refreshMode: cleanString(mode),
          changedFolderCount: numberOrZero(summary && summary.changedFolderCount),
          changedFolderIds: Array.isArray(summary && summary.changedFolderIds) ? summary.changedFolderIds.slice() : [],
          changedFields: Array.isArray(summary && summary.changedFields) ? summary.changedFields.slice() : [],
          t: Date.now(),
        },
      }));
    } catch (error) {
      pushError('dispatch-folder-metadata-changed', error);
    }
  }

  function recordChromePostImportRefresh(mode, summary, refreshError, bundleExportedAt, options) {
    var opts = safeObject(options);
    var safeSummary = safeObject(summary);
    var cleanMode = cleanString(mode) || 'unknown';
    var refreshSuppressed = opts.refreshSuppressed === true;
    state.lastDesktopToChromeRenderRefreshedAt = nowIso();
    state.lastDesktopToChromeRefreshMode = cleanMode;
    state.lastDesktopToChromeChangedFolderCount = numberOrZero(safeSummary.changedFolderCount);
    state.lastDesktopToChromeChangedFields = Array.isArray(safeSummary.changedFields) ? safeSummary.changedFields.slice() : [];
    state.lastDesktopToChromeChangedFolderIds = Array.isArray(safeSummary.changedFolderIds) ? safeSummary.changedFolderIds.slice() : [];
    state.lastDesktopToChromePostImportRefreshError = cleanString(refreshError);
    state.lastChromePostImportRefreshMode = cleanMode;
    state.lastChromePostImportRefreshAt = state.lastDesktopToChromeRenderRefreshedAt;
    state.lastChromePostImportRefreshError = state.lastDesktopToChromePostImportRefreshError;
    state.lastChromePostImportRenderRefreshCount = numberOrZero(opts.renderRefreshCount);
    state.lastChromePostImportRefreshSuppressed = refreshSuppressed;
    if (refreshSuppressed) state.chromePostImportRefreshSuppressedCount += 1;
    state.lastChromePostImportChangedFolderCount = state.lastDesktopToChromeChangedFolderCount;
    state.lastChromePostImportChangedFields = state.lastDesktopToChromeChangedFields.slice();
    state.lastChromePostImportChangedFolderIds = state.lastDesktopToChromeChangedFolderIds.slice();
    var exportedMs = parseTimeMs(bundleExportedAt);
    var renderMs = parseTimeMs(state.lastDesktopToChromeRenderRefreshedAt);
    state.lastDesktopToChromeTotalPropagationMs = exportedMs && renderMs ? Math.max(0, renderMs - exportedMs) : 0;
  }

  async function prepareChromeFolderDisplayModel(reason) {
    if (H2O.Library && H2O.Library.FolderParity && typeof H2O.Library.FolderParity.getDisplayModel === 'function') {
      await H2O.Library.FolderParity.getDisplayModel({
        fresh: true,
        reason: 'desktop-to-chrome-post-import-refresh:' + (cleanString(reason) || 'sync-folder-import'),
      });
    }
  }

  function updateFolderRowNode(node, row) {
    if (!node || !row) return false;
    var folderId = folderMetadataRowId(row);
    var name = folderMetadataRowName(row);
    var color = folderMetadataRowColor(row);
    if (!folderId) return false;
    if (name) {
      node.setAttribute('data-h2o-folder-name', name);
      node.setAttribute('data-h2o-folder-normalized-name', name.replace(/\s+/g, ' ').toLowerCase());
      node.setAttribute('title', name);
      node.setAttribute('aria-label', name);
      var label = node.querySelector && node.querySelector('.wbSidebarSectionItemLabel');
      if (label) {
        if (label.children && label.children.length) label.children[0].textContent = name;
        else label.textContent = name;
      }
    }
    if (color) {
      node.setAttribute('data-color', color);
      node.setAttribute('data-h2o-folder-color', color);
      try { node.style.setProperty('--wb-sidebar-item-color', color); } catch (_) { /* ignore */ }
    } else {
      node.removeAttribute('data-color');
      node.removeAttribute('data-h2o-folder-color');
      try { node.style.removeProperty('--wb-sidebar-item-color'); } catch (_) { /* ignore */ }
    }
    if (node.querySelectorAll) {
      node.querySelectorAll('.wbSidebarSectionItemMenu').forEach(function (button) {
        button.setAttribute('data-h2o-folder-id', folderId);
        if (name) button.setAttribute('data-h2o-folder-name', name);
        if (color) button.setAttribute('data-h2o-folder-color', color);
        else button.removeAttribute('data-h2o-folder-color');
      });
    }
    return true;
  }

  function applyTargetedFolderRowRefresh(summary) {
    var doc = global.document;
    if (!doc || !doc.querySelectorAll) return { attempted: false, updated: 0, missing: numberOrZero(summary && summary.changedFolderCount) };
    var rows = Array.isArray(summary && summary.rows) ? summary.rows : [];
    var nodes = Array.prototype.slice.call(doc.querySelectorAll('[data-h2o-folder-sidebar-row="1"], .wbSidebarSectionItem--folders[data-section="folders"]'));
    var updated = 0;
    var missing = 0;
    rows.forEach(function (entry) {
      var folderId = cleanString(entry && entry.folderId);
      if (!folderId) return;
      var matched = false;
      nodes.forEach(function (node) {
        var nodeId = cleanString(node.getAttribute && (node.getAttribute('data-h2o-folder-id') || node.getAttribute('data-id')));
        if (nodeId !== folderId) return;
        matched = updateFolderRowNode(node, entry.row) || matched;
      });
      if (matched) updated += 1;
      else missing += 1;
    });
    return { attempted: true, updated: updated, missing: missing };
  }

  async function applyFreshTargetedFolderRowRefresh(summary, reason) {
    await prepareChromeFolderDisplayModel(reason);
    state.chromePostImportRenderRefreshCount += 1;
    return applyTargetedFolderRowRefresh(summary);
  }

  function scheduleChromeTargetedFolderRefreshRetry(summary, reason, bundleExportedAt) {
    var safeSummary = safeObject(summary);
    if (!numberOrZero(safeSummary.changedFolderCount)) return false;
    try {
      if (state.chromePostImportRefreshRetryTimer) {
        global.clearTimeout(state.chromePostImportRefreshRetryTimer);
      }
    } catch (_) { /* ignore */ }
    state.chromePostImportRefreshRetryTimer = global.setTimeout(function () {
      state.chromePostImportRefreshRetryTimer = null;
      applyFreshTargetedFolderRowRefresh(safeSummary, (cleanString(reason) || 'sync-folder-import') + ':targeted-retry')
        .then(function (targeted) {
          var retryMode = targeted && targeted.attempted && targeted.missing === 0 && targeted.updated >= numberOrZero(safeSummary.changedFolderCount)
            ? 'targeted-folder-refresh'
            : 'targeted-folder-refresh-missing';
          recordChromePostImportRefresh(retryMode, safeSummary, '', bundleExportedAt, {
            renderRefreshCount: 1,
            refreshSuppressed: false
          });
          dispatchFolderMetadataChangedEvent(safeSummary, reason, retryMode);
        })
        .catch(function (error) {
          var refreshError = String(error && (error.message || error));
          pushError('desktop-to-chrome-post-import-refresh.retry', error);
          recordChromePostImportRefresh('targeted-folder-refresh-error', safeSummary, refreshError, bundleExportedAt, {
            renderRefreshCount: 0,
            refreshSuppressed: false
          });
          dispatchFolderMetadataChangedEvent(safeSummary, reason, 'targeted-folder-refresh-error');
        });
    }, CHROME_TARGETED_REFRESH_RETRY_MS);
    return true;
  }

  async function refreshChromeFolderUiAfterDesktopImport(summary, reason, bundleExportedAt) {
    var cleanReason = cleanString(reason) || 'sync-folder-import';
    var safeSummary = safeObject(summary);
    var changedCount = numberOrZero(safeSummary.changedFolderCount);
    var mode = changedCount ? 'targeted-folder-refresh' : 'no-folder-metadata-change';
    var refreshError = '';
    var renderCountBefore = state.chromePostImportRenderRefreshCount;
    var refreshSuppressed = changedCount === 0;
    try {
      if (changedCount && safeSummary.hasOnlyVisualUpdates === true) {
        var targeted = await applyFreshTargetedFolderRowRefresh(safeSummary, cleanReason);
        if (!targeted.attempted || targeted.missing > 0 || targeted.updated < changedCount) {
          mode = scheduleChromeTargetedFolderRefreshRetry(safeSummary, cleanReason, bundleExportedAt)
            ? 'targeted-folder-refresh-deferred'
            : 'targeted-folder-refresh-missing';
        } else {
          mode = 'targeted-folder-refresh';
        }
      } else if (changedCount) {
        await prepareChromeFolderDisplayModel(cleanReason);
        if (H2O.Library && H2O.Library.SidebarSections && typeof H2O.Library.SidebarSections.refresh === 'function') {
          await H2O.Library.SidebarSections.refresh();
          state.chromePostImportRenderRefreshCount += 1;
          mode = 'sidebar-refresh';
        } else {
          global.dispatchEvent(new CustomEvent('evt:h2o:folders:changed', {
            detail: { source: 'desktop-to-chrome-import', reason: cleanReason, t: Date.now() },
          }));
          state.chromePostImportRenderRefreshCount += 1;
          mode = 'full-refresh-fallback';
        }
      }
    } catch (error) {
      refreshError = String(error && (error.message || error));
      pushError('desktop-to-chrome-post-import-refresh', error);
      mode = mode === 'targeted-folder-refresh' ? 'targeted-folder-refresh-error' : mode;
      refreshSuppressed = false;
    }
    var renderRefreshCount = Math.max(0, state.chromePostImportRenderRefreshCount - renderCountBefore);
    recordChromePostImportRefresh(mode, safeSummary, refreshError, bundleExportedAt, {
      renderRefreshCount: renderRefreshCount,
      refreshSuppressed: refreshSuppressed
    });
    dispatchFolderMetadataChangedEvent(safeSummary, cleanReason, mode);
    return {
      mode: mode,
      changedFolderCount: changedCount,
      changedFields: state.lastDesktopToChromeChangedFields.slice(),
      changedFolderIds: state.lastDesktopToChromeChangedFolderIds.slice(),
      renderRefreshedAt: state.lastDesktopToChromeRenderRefreshedAt,
      renderRefreshCount: renderRefreshCount,
      cumulativeRenderRefreshCount: state.chromePostImportRenderRefreshCount,
      refreshSuppressed: refreshSuppressed,
      totalPropagationMs: state.lastDesktopToChromeTotalPropagationMs,
      error: refreshError,
    };
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
        startDesktopLatestPoller('folder-connected');
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
    clearDesktopLatestPollTimer();
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
    startDesktopLatestPoller('enable-auto-sync');
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
    clearDesktopLatestPollTimer();
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
      state.lastAutoSyncError = cleanString(result && (
        result.error ||
        result.reason ||
        (Array.isArray(result.blockers) ? result.blockers.join(',') : '')
      ));
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
    if (remaining > 0 && !isFastDesktopLatestChangeReason(cleanReason)) {
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
      chromeLatestFile: CHROME_LATEST_FILE,
      desktopChromePropagationSchema: PROPAGATION_SCHEMA,
      desktopChromePropagationVersion: F19_DESKTOP_CHROME_VERSION,
      /* F3.1: expose lastAppliedExportId so consumers can see which producer
       * export this peer most recently applied. The value is already read
       * from bundle.exportId at line ~969, persisted to chrome.storage.local
       * via persistState(), and restored on boot via loadState(). diagnose()
       * wraps status() with Object.assign, so it automatically picks this up. */
      lastAppliedExportId: state.lastAppliedExportId,
      lastAppliedExportedAt: state.lastAppliedExportedAt,
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
      desktopLatestPollingEnabled: !!state.desktopLatestPollTimer,
      desktopLatestPollIntervalMs: DESKTOP_LATEST_POLL_INTERVAL_MS,
      desktopLatestPollRunning: !!state.desktopLatestPollRunning,
      lastDesktopLatestPollAt: state.lastDesktopLatestPollAt,
      lastDesktopLatestPollStatus: state.lastDesktopLatestPollStatus,
      lastDesktopLatestPollError: state.lastDesktopLatestPollError,
      lastDesktopLatestPollDetectedAt: state.lastDesktopLatestPollDetectedAt,
      lastDesktopLatestPollFileLastModified: state.lastDesktopLatestPollFileLastModified,
      lastDesktopLatestPollFileSize: state.lastDesktopLatestPollFileSize,
      desktopToChromeLatency: {
        desktopMutationAt: state.lastDesktopToChromeExportWrittenAt,
        desktopExportWrittenAt: state.lastDesktopToChromeExportWrittenAt,
        chromeImportStartedAt: state.lastDesktopToChromeImportStartedAt,
        chromeImportAppliedAt: state.lastDesktopToChromeImportAppliedAt,
        chromeRenderRefreshedAt: state.lastDesktopToChromeRenderRefreshedAt,
        totalPropagationMs: state.lastDesktopToChromeTotalPropagationMs,
        postImportRefreshMode: state.lastDesktopToChromeRefreshMode,
        chromePostImportRefreshMode: state.lastChromePostImportRefreshMode,
        chromePostImportRefreshAt: state.lastChromePostImportRefreshAt,
        changedFolderCount: state.lastDesktopToChromeChangedFolderCount,
        changedFields: state.lastDesktopToChromeChangedFields.slice(),
        changedFolderIds: state.lastDesktopToChromeChangedFolderIds.slice(),
        renderRefreshCount: state.lastChromePostImportRenderRefreshCount,
        cumulativeRenderRefreshCount: state.chromePostImportRenderRefreshCount,
        refreshSuppressed: state.lastChromePostImportRefreshSuppressed,
        refreshSuppressedCount: state.chromePostImportRefreshSuppressedCount,
        postImportRefreshError: state.lastDesktopToChromePostImportRefreshError,
        loopSuppressed: state.loopSuppressedCount,
        duplicateSkipped: state.duplicateSkippedCount,
        selfOriginSkipped: state.selfOriginSkippedCount,
      },
      chromePostImportRefreshMode: state.lastChromePostImportRefreshMode,
      changedFolderCount: state.lastChromePostImportChangedFolderCount,
      renderRefreshCount: state.lastChromePostImportRenderRefreshCount,
      cumulativeRenderRefreshCount: state.chromePostImportRenderRefreshCount,
      refreshSuppressed: state.lastChromePostImportRefreshSuppressed,
      refreshSuppressedCount: state.chromePostImportRefreshSuppressedCount,
      loopSuppressed: state.loopSuppressedCount,
      duplicateSkipped: state.duplicateSkippedCount,
      selfOriginSkipped: state.selfOriginSkippedCount,
      lastAutoSyncAttemptAt: state.lastAutoSyncAttemptAt,
      lastAutoSyncAt: state.lastAutoSyncAt,
      lastAutoSyncReason: state.lastAutoSyncReason,
      lastAutoSyncStatus: state.lastAutoSyncStatus,
      lastAutoSyncError: state.lastAutoSyncError,
      chromeExportPending: !!state.chromeExportPending,
      chromeExportInFlight: !!state.chromeExportInFlight,
      chromeExportDebounceMs: CHROME_EXPORT_DEBOUNCE_MS,
      chromeExportScheduledAt: state.chromeExportScheduledAt,
      chromeExportScheduledReason: state.chromeExportScheduledReason,
      lastExportStatus: state.lastChromeExportStatus,
      lastExportedAt: state.lastChromeExportAt,
      lastExportFile: state.lastChromeExportFile,
      lastExportBytes: state.lastChromeExportBytes,
      lastExportError: state.lastChromeExportError,
      lastExportReason: state.lastChromeExportReason,
      lastExportPermission: state.lastChromeExportPermission,
      lastExportBlockers: state.lastChromeExportBlockers.slice(),
      backgroundAutoImport: false,
      chromeWritesSyncFolder: state.lastChromeExportStatus === 'chrome-to-desktop-exported',
      chromeDesktopExportApiAvailable: !!getChromeAutoImportApi(),
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

  function normalizeSyncDirection(value) {
    return cleanString(value).toLowerCase().replace(/_/g, '-');
  }

  function wantsChromeToDesktopExport(options) {
    var opts = safeObject(options);
    var direction = normalizeSyncDirection(opts.direction || opts.syncDirection || opts.transportDirection);
    return direction === 'chrome-to-desktop' || direction === 'chrome-to-desktop-export';
  }

  function getChromeAutoImportApi() {
    try {
      var sync = H2O && H2O.Studio && H2O.Studio.sync;
      var autoImport = sync && sync.autoImport;
      return autoImport && typeof autoImport.exportNow === 'function' ? autoImport : null;
    } catch (_) {
      return null;
    }
  }

  function normalizeBlockers(value) {
    return Array.isArray(value)
      ? value.map(cleanString).filter(Boolean).slice(0, 8)
      : [];
  }

  async function rememberChromeExportResult(result, reason) {
    var raw = safeObject(result);
    var blockers = normalizeBlockers(raw.blockers);
    state.chromeExportPending = false;
    state.chromeExportInFlight = false;
    state.lastChromeExportAt = cleanString(raw.exportedAt || raw.completedAt) || nowIso();
    state.lastChromeExportReason = cleanString(reason || raw.reason || state.lastChromeExportReason);
    state.lastChromeExportStatus = cleanString(raw.status) || (raw.ok === true ? 'chrome-to-desktop-exported' : 'chrome-to-desktop-export-blocked');
    state.lastChromeExportError = cleanString(raw.error || raw.reason);
    state.lastChromeExportFile = cleanString(raw.filename || (raw.ok === true ? CHROME_LATEST_FILE : ''));
    state.lastChromeExportBytes = numberOrZero(raw.bytes);
    state.lastChromeExportPermission = cleanString(raw.permission || state.lastChromeExportPermission || state.permission || 'unknown');
    state.lastChromeExportBlockers = blockers;
    try {
      await persistState({
        chromeExportPending: false,
        chromeExportInFlight: false,
        lastChromeExportAt: state.lastChromeExportAt,
        lastChromeExportReason: state.lastChromeExportReason,
        lastChromeExportStatus: state.lastChromeExportStatus,
        lastChromeExportError: state.lastChromeExportError,
        lastChromeExportFile: state.lastChromeExportFile,
        lastChromeExportBytes: state.lastChromeExportBytes,
        lastChromeExportPermission: state.lastChromeExportPermission,
        lastChromeExportBlockers: state.lastChromeExportBlockers.slice(),
      });
    } catch (error) { pushError('persist-chrome-export-result', error); }
    return raw;
  }

  async function recordChromeExportBlocked(reason, status, blockers, error, permission) {
    var result = {
      ok: false,
      phase: PHASE,
      mode: MODE,
      direction: 'chrome-to-desktop',
      transport: CHROME_LATEST_FILE,
      path: syncFolderPath(CHROME_LATEST_FILE),
      autoSync: true,
      chromeWritesSyncFolder: false,
      desktopWritesSyncFolder: false,
      permission: cleanString(permission || state.permission || 'unknown'),
      blockers: normalizeBlockers(blockers),
      error: cleanString(error),
      status: cleanString(status) || 'chrome-to-desktop-export-blocked',
    };
    await rememberChromeExportResult(result, reason);
    return result;
  }

  async function runChromeToDesktopExport(reason) {
    var cleanReason = cleanString(reason) || state.chromeExportScheduledReason || 'folder-metadata-auto-export';
    if (state.chromeExportInFlight) {
      return recordChromeExportBlocked(cleanReason, 'export-pending', ['chrome-to-desktop-export-in-flight'], 'export already in flight', state.lastChromeExportPermission);
    }
    state.chromeExportInFlight = true;
    state.chromeExportPending = false;
    state.lastChromeExportAttemptAt = Date.now();
    state.lastChromeExportReason = cleanReason;
    state.lastChromeExportStatus = 'export-pending';
    state.lastChromeExportError = '';
    state.lastChromeExportBlockers = [];
    try {
      await persistState({
        chromeExportPending: false,
        chromeExportInFlight: true,
        lastChromeExportAttemptAt: state.lastChromeExportAttemptAt,
        lastChromeExportReason: cleanReason,
        lastChromeExportStatus: state.lastChromeExportStatus,
        lastChromeExportError: '',
        lastChromeExportBlockers: [],
      });
    } catch (error) { pushError('persist-chrome-export-start', error); }

    try { await loadStoredHandle(); }
    catch (error) { pushError('chrome-auto-export.load-folder-handle', error); }
    if (!state.handle) {
      return recordChromeExportBlocked(
        cleanReason,
        'permission-required',
        ['sync-folder-not-connected', 'permission-required'],
        'sync folder not connected — use Connect Folder first',
        'unknown'
      );
    }
    var writePermission = await queryReadWritePermission(state.handle);
    state.lastChromeExportPermission = writePermission;
    if (writePermission !== 'granted') {
      return recordChromeExportBlocked(
        cleanReason,
        'permission-required',
        ['permission-required'],
        'readwrite permission not granted (got "' + writePermission + '")',
        writePermission
      );
    }
    try {
      var result = await exportChromeToSyncFolder({
        reason: cleanReason,
        autoSync: true,
        folderAutoSync: true,
        folderMutationAutoSync: true,
      });
      return result;
    } catch (error) {
      pushError('run-chrome-to-desktop-export', error);
      return recordChromeExportBlocked(
        cleanReason,
        'chrome-to-desktop-export-failed',
        ['chrome-to-desktop-export-failed'],
        String(error && (error.message || error)),
        writePermission
      );
    } finally {
      state.chromeExportInFlight = false;
    }
  }

  async function scheduleChromeToDesktopExport(options) {
    var opts = typeof options === 'string' ? { reason: options } : safeObject(options);
    var cleanReason = cleanString(opts.reason) || 'folder-metadata-auto-export';
    clearChromeExportTimer();
    state.chromeExportPending = true;
    state.chromeExportScheduledAt = Date.now();
    state.chromeExportScheduledReason = cleanReason;
    state.lastChromeExportReason = cleanReason;
    state.lastChromeExportStatus = 'export-pending';
    state.lastChromeExportError = '';
    state.lastChromeExportBlockers = [];
    try {
      await persistState({
        chromeExportPending: true,
        chromeExportScheduledAt: state.chromeExportScheduledAt,
        chromeExportScheduledReason: cleanReason,
        lastChromeExportReason: cleanReason,
        lastChromeExportStatus: state.lastChromeExportStatus,
        lastChromeExportError: '',
        lastChromeExportBlockers: [],
      });
    } catch (error) { pushError('persist-chrome-export-scheduled', error); }
    state.chromeExportTimer = global.setTimeout(function () {
      state.chromeExportTimer = null;
      runChromeToDesktopExport(cleanReason).catch(function (error) {
        pushError('scheduled-chrome-export', error);
      });
    }, CHROME_EXPORT_DEBOUNCE_MS);
    return {
      ok: true,
      phase: PHASE,
      mode: MODE,
      direction: 'chrome-to-desktop',
      transport: CHROME_LATEST_FILE,
      autoSync: true,
      chromeWritesSyncFolder: false,
      scheduled: true,
      pending: true,
      reason: cleanReason,
      delayMs: CHROME_EXPORT_DEBOUNCE_MS,
      status: 'export-pending',
    };
  }

  async function exportChromeToSyncFolder(options) {
    var startedAt = Date.now();
    var opts = safeObject(options);
    if (state.syncInFlight) {
      return rememberChromeExportResult({
        ok: false,
        phase: PHASE,
        mode: MODE,
        direction: 'chrome-to-desktop',
        transport: CHROME_LATEST_FILE,
        path: syncFolderPath(CHROME_LATEST_FILE),
        autoSync: !!opts.autoSync,
        chromeWritesSyncFolder: false,
        desktopWritesSyncFolder: false,
        status: 'sync-folder-sync-in-flight',
      }, cleanString(opts.reason) || 'chrome-to-desktop-export');
    }
    try { await loadStoredHandle(); }
    catch (error) { pushError('chrome-to-desktop.load-folder-handle', error); }

    var autoImport = getChromeAutoImportApi();
    if (!autoImport) {
      return rememberChromeExportResult({
        ok: false,
        phase: PHASE,
        mode: MODE,
        direction: 'chrome-to-desktop',
        transport: CHROME_LATEST_FILE,
        path: syncFolderPath(CHROME_LATEST_FILE),
        autoSync: !!opts.autoSync,
        chromeWritesSyncFolder: false,
        desktopWritesSyncFolder: false,
        blockers: ['chrome-to-desktop-export-unavailable'],
        status: 'chrome-to-desktop-export-unavailable',
        error: 'H2O.Studio.sync.autoImport.exportNow is unavailable',
        durationMs: Date.now() - startedAt,
      }, cleanString(opts.reason) || 'chrome-to-desktop-export');
    }

    var raw;
    try {
      raw = safeObject(await autoImport.exportNow(Object.assign({}, opts, {
        direction: 'chrome-to-desktop',
        transport: CHROME_LATEST_FILE,
      })));
    } catch (error) {
      pushError('chrome-to-desktop.exportNow', error);
      raw = {
        ok: false,
        error: String(error && (error.message || error)),
        blockers: ['chrome-to-desktop-export-failed'],
        status: 'chrome-to-desktop-export-failed',
      };
    }

    var blockers = Array.isArray(raw.blockers) ? raw.blockers.slice() : [];
    if (raw.ok !== true && blockers.length === 0) {
      blockers.push(raw.flagEnabled === false
        ? 'chrome-to-desktop-export-flag-off'
        : 'chrome-to-desktop-export-failed');
    }
    var status = raw.ok === true
      ? 'chrome-to-desktop-exported'
      : (cleanString(raw.status) || blockers[0] || 'chrome-to-desktop-export-blocked');

    var normalized = Object.assign({}, raw, {
      ok: raw.ok === true,
      phase: PHASE,
      mode: MODE,
      direction: 'chrome-to-desktop',
      transport: CHROME_LATEST_FILE,
      path: cleanString(raw.path) || syncFolderPath(CHROME_LATEST_FILE),
      filename: raw.ok === true ? CHROME_LATEST_FILE : cleanString(raw.filename),
      autoSync: !!opts.autoSync,
      backgroundAutoImport: false,
      chromeWritesSyncFolder: raw.ok === true,
      desktopWritesSyncFolder: false,
      blockers: blockers,
      status: status,
      durationMs: Date.now() - startedAt,
    });
    await rememberChromeExportResult(normalized, cleanString(opts.reason) || 'chrome-to-desktop-export');
    return normalized;
  }

  async function syncNow(options) {
    var startedAt = Date.now();
    var opts = safeObject(options);
    if (wantsChromeToDesktopExport(opts)) {
      return exportChromeToSyncFolder(opts);
    }
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
      state.lastSyncStatus = 'sync-folder-not-connected';
      state.lastSyncError = '';
      await persistState({ lastSyncStatus: state.lastSyncStatus, lastSyncError: '' });
      return {
        ok: false,
        phase: PHASE,
        mode: MODE,
        path: LATEST_FILE,
        blockers: [F19_SYNC_HARDENING_CODES.syncFolderMissing],
        hardeningCode: F19_SYNC_HARDENING_CODES.syncFolderMissing,
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
        blockers: [F19_SYNC_HARDENING_CODES.permissionDenied],
        hardeningCode: F19_SYNC_HARDENING_CODES.permissionDenied,
        status: 'sync-folder-reconnect-required',
      };
    }

    try {
      var fileHandle;
      try {
        fileHandle = await state.handle.getFileHandle(LATEST_FILE, { create: false });
      } catch (missingError) {
        state.lastSyncStatus = 'sync-folder-latest-missing';
        state.lastSyncError = String(missingError && (missingError.message || missingError));
        await persistState({ lastSyncStatus: state.lastSyncStatus, lastSyncError: state.lastSyncError });
        return {
          ok: false,
          phase: PHASE,
          mode: MODE,
          path: (state.folderName ? state.folderName + '/' : '') + LATEST_FILE,
          error: state.lastSyncError,
          blockers: [F19_SYNC_HARDENING_CODES.transportFileMissing],
          hardeningCode: F19_SYNC_HARDENING_CODES.transportFileMissing,
          status: 'sync-folder-latest-missing',
        };
      }
      var file = await fileHandle.getFile();
      var text = await file.text();
      var checksumHex = await sha256Hex(text);
      var checksum = checksumHex ? ('sha256:' + checksumHex) : '';
      var bundle;
      try {
        bundle = JSON.parse(text);
      } catch (parseError) {
        state.lastSyncStatus = 'sync-folder-latest-malformed';
        state.lastSyncError = 'latest.json parse failed: ' + String(parseError && (parseError.message || parseError));
        await persistState({
          lastSyncStatus: state.lastSyncStatus,
          lastSyncError: state.lastSyncError,
          lastChecksum: checksum,
          lastFileLastModified: numberOrZero(file.lastModified),
          lastFileSize: numberOrZero(file.size),
        });
        return {
          ok: false,
          phase: PHASE,
          mode: MODE,
          path: (state.folderName ? state.folderName + '/' : '') + LATEST_FILE,
          error: state.lastSyncError,
          checksum: checksum,
          fileLastModified: numberOrZero(file.lastModified),
          fileSize: numberOrZero(file.size),
          blockers: [F19_SYNC_HARDENING_CODES.transportFileMalformed],
          hardeningCode: F19_SYNC_HARDENING_CODES.transportFileMalformed,
          status: 'sync-folder-latest-malformed',
        };
      }
      try {
        validateBundle(bundle);
      } catch (schemaError) {
        state.lastSyncStatus = 'sync-folder-latest-schema-unsupported';
        state.lastSyncError = String(schemaError && (schemaError.message || schemaError));
        await persistState({
          lastSyncStatus: state.lastSyncStatus,
          lastSyncError: state.lastSyncError,
          lastChecksum: checksum,
          lastFileLastModified: numberOrZero(file.lastModified),
          lastFileSize: numberOrZero(file.size),
        });
        return {
          ok: false,
          phase: PHASE,
          mode: MODE,
          path: (state.folderName ? state.folderName + '/' : '') + LATEST_FILE,
          error: state.lastSyncError,
          schema: cleanString(bundle && bundle.schema),
          checksum: checksum,
          fileLastModified: numberOrZero(file.lastModified),
          fileSize: numberOrZero(file.size),
          blockers: [F19_SYNC_HARDENING_CODES.transportSchemaUnsupported],
          hardeningCode: F19_SYNC_HARDENING_CODES.transportSchemaUnsupported,
          status: 'sync-folder-latest-schema-unsupported',
        };
      }
      var folderMetadataChangeSummary = await summarizeDesktopFolderMetadataChanges(bundle);
      state.lastDesktopToChromeExportWrittenAt = cleanString(bundle.exportedAt || '');
      state.lastDesktopToChromeImportStartedAt = nowIso();
      state.lastDesktopToChromeImportAppliedAt = '';
      state.lastDesktopToChromeRenderRefreshedAt = '';
      state.lastDesktopToChromeTotalPropagationMs = 0;
      state.lastDesktopToChromeRefreshMode = '';
      state.lastDesktopToChromeChangedFolderCount = numberOrZero(folderMetadataChangeSummary.changedFolderCount);
      state.lastDesktopToChromeChangedFields = Array.isArray(folderMetadataChangeSummary.changedFields) ? folderMetadataChangeSummary.changedFields.slice() : [];
      state.lastDesktopToChromeChangedFolderIds = Array.isArray(folderMetadataChangeSummary.changedFolderIds) ? folderMetadataChangeSummary.changedFolderIds.slice() : [];
      var signature = summarySignature(bundle);
      if (opts.autoSync && checksum && state.lastChecksum && state.lastChecksum === checksum) {
        var alreadyNormalized = buildDesktopChromeSupportedBundle(bundle);
        var alreadyRowsAfter = currentLibraryIndexRowCount();
        var alreadyParity = {
          snapshotCaptured: false,
          paritySnapshotHash: '',
          parityDiagnosticReady: !!(H2O.Studio && H2O.Studio.sync && H2O.Studio.sync.libraryParity),
          refreshSuppressed: true,
          reason: 'sync-folder-auto-skip'
        };
        var alreadyConvergence = alreadyNormalized.ok
          ? {
            ok: true,
            duplicateSkipped: true,
            blocker: '',
            reason: 'duplicate-import-idempotent'
          }
          : { ok: false, blocker: 'desktop-to-chrome-convergence-not-proven' };
        if (alreadyConvergence.ok) {
          state.duplicateSkippedCount += 1;
          state.loopSuppressedCount += 1;
          recordChromePostImportRefresh('duplicate-suppressed', folderMetadataChangeSummary, '', cleanString(bundle.exportedAt || ''), {
            renderRefreshCount: 0,
            refreshSuppressed: true
          });
          var alreadyPropagation = propagationResult(true, {
            status: 'already-imported',
            sourceSummary: alreadyNormalized.sourceSummary,
            importSummary: {
              ok: true,
              mode: 'skip',
              duplicateSkipped: true,
              chromeStorageWritten: 0,
              chromeStorageSkipped: 0,
              libraryKvWritten: 0,
              libraryKvSkipped: 0,
              folderMetadataFreshness: {
                incoming: numberOrZero(folderMetadataChangeSummary.changedFolderCount),
                created: 0,
                refreshed: 0,
                skippedStale: 0,
                missingIncomingUpdatedAt: 0,
                missingExistingUpdatedAt: 0
              },
              redactedErrorCategories: []
            },
            parity: alreadyParity,
            convergence: alreadyConvergence,
            postImportRefresh: {
              mode: 'duplicate-suppressed',
              changedFolderCount: numberOrZero(folderMetadataChangeSummary.changedFolderCount),
              changedFields: Array.isArray(folderMetadataChangeSummary.changedFields) ? folderMetadataChangeSummary.changedFields.slice() : [],
              changedFolderIds: Array.isArray(folderMetadataChangeSummary.changedFolderIds) ? folderMetadataChangeSummary.changedFolderIds.slice() : [],
              renderRefreshCount: 0,
              cumulativeRenderRefreshCount: state.chromePostImportRenderRefreshCount,
              refreshSuppressed: true,
              loopSuppressed: state.loopSuppressedCount,
              duplicateSkipped: state.duplicateSkippedCount
            },
            warnings: [F19_SYNC_HARDENING_CODES.duplicateImportIdempotent],
            idempotency: {
              fileFingerprintChecked: true,
              alreadyImported: true,
              hardeningCode: F19_SYNC_HARDENING_CODES.duplicateImportIdempotent,
              mergeOnly: true,
              existingRowsSkipped: true,
              protectedDomainFallbackDisabled: true
            }
          });
          state.lastFileName = LATEST_FILE;
          state.lastFileLastModified = numberOrZero(file.lastModified);
          state.lastFileSize = numberOrZero(file.size);
          state.lastSummarySignature = signature;
          state.lastSyncStatus = 'auto-sync-latest-already-applied';
          state.lastSyncError = '';
          state.lastSyncResult = alreadyPropagation;
          state.lastChecksum = checksum;
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
            sourceSummary: alreadyPropagation.sourceSummary,
            importSummary: alreadyPropagation.importSummary,
            convergence: alreadyPropagation.convergence,
            blockers: alreadyPropagation.blockers,
            warnings: alreadyPropagation.warnings,
            redactedErrorCategories: alreadyPropagation.redactedErrorCategories,
            propagation: alreadyPropagation,
            autoSync: true,
            durationMs: Date.now() - startedAt,
            backgroundAutoImport: false,
            chromeWritesSyncFolder: false,
            status: 'auto-sync-latest-already-applied',
          };
        }
      }

      var transportBlockers = classifyIncomingDesktopTransport(bundle, checksum);
      var transportApproval = await resolveAutoSyncTransportBlockers(bundle, transportBlockers, opts);
      transportBlockers = transportApproval.blockers;
      if (transportBlockers.length > 0) {
        var transportBlockedStatus = transportApproval.conflictApprovalRequired
          ? 'conflict-approval-required'
          : 'blocked';
        var blockedPropagation = propagationResult(false, {
          status: transportBlockedStatus,
          blockers: transportBlockers,
          conflictDecision: transportApproval.conflictDecision,
          conflictApproved: transportApproval.conflictApproved,
          approvedConflictBlockers: transportApproval.approvedBlockers,
          sourceSummary: {
            schema: cleanString(bundle && bundle.schema),
            direction: 'desktop-to-chrome',
            transport: LATEST_FILE,
            hasExportId: !!(bundle && bundle.exportId),
            exportedAt: cleanString(bundle && bundle.exportedAt)
          },
          idempotency: {
            fileFingerprintChecked: true,
            alreadyImported: false,
            mergeOnly: true,
            existingRowsSkipped: true,
            protectedDomainFallbackDisabled: true
          }
        });
        state.lastFileName = LATEST_FILE;
        state.lastFileLastModified = numberOrZero(file.lastModified);
        state.lastFileSize = numberOrZero(file.size);
        state.lastSummarySignature = signature;
        state.lastSyncStatus = transportApproval.conflictApprovalRequired
          ? 'conflict-approval-required'
          : 'sync-folder-import-blocked';
        state.lastSyncError = cleanString(blockedPropagation.blockers.join(','));
        state.lastSyncResult = blockedPropagation;
        await persistState({
          lastSyncStatus: state.lastSyncStatus,
          lastSyncError: state.lastSyncError,
          lastFileLastModified: state.lastFileLastModified,
          lastFileSize: state.lastFileSize,
          lastSummarySignature: state.lastSummarySignature,
        });
        return {
          ok: false,
          phase: PHASE,
          mode: MODE,
          path: (state.folderName ? state.folderName + '/' : '') + LATEST_FILE,
          schema: bundle.schema,
          exportedAt: cleanString(bundle.exportedAt),
          checksum: checksum,
          fileLastModified: state.lastFileLastModified,
          fileSize: state.lastFileSize,
          summarySignature: signature,
          sourceSummary: blockedPropagation.sourceSummary,
          importSummary: blockedPropagation.importSummary,
          convergence: blockedPropagation.convergence,
          conflictDecision: blockedPropagation.conflictDecision,
          conflictApproved: blockedPropagation.conflictApproved,
          conflictApproval: blockedPropagation.conflictApproval,
          conflictApprovalRequired: transportApproval.conflictApprovalRequired === true,
          autoFolderMetadataConflictAnalysis: transportApproval.autoFolderMetadataConflictAnalysis || null,
          blockers: blockedPropagation.blockers,
          warnings: blockedPropagation.warnings,
          redactedErrorCategories: blockedPropagation.redactedErrorCategories,
          propagation: blockedPropagation,
          durationMs: Date.now() - startedAt,
          autoSync: !!opts.autoSync,
          backgroundAutoImport: false,
          chromeWritesSyncFolder: false,
          status: state.lastSyncStatus,
        };
      }

      var propagation = await importDesktopBundlePayload(bundle, {
        dryRunOnly: opts.dryRunOnly === true,
        fileFingerprint: checksum,
        reason: cleanString(opts.reason),
        autoSync: !!opts.autoSync,
        conflictDecision: transportApproval.conflictDecision,
        conflictApproved: transportApproval.conflictApproved,
        approvedConflictBlockers: transportApproval.approvedBlockers,
        autoFolderMetadataConflictAnalysis: transportApproval.autoFolderMetadataConflictAnalysis || null,
        folderMetadataChangeSummary: folderMetadataChangeSummary
      });
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
          propagation: propagation,
          dryRun: propagation.importSummary && propagation.importSummary.dryRun ? propagation.importSummary.dryRun : null,
          checksum: checksum,
          status: 'sync-folder-dry-run-ok',
        };
      }

      var refreshMode = cleanString(propagation && propagation.postImportRefresh && propagation.postImportRefresh.mode);
      var refreshSuppressed = refreshMode.indexOf('targeted-folder-refresh') === 0 ||
        refreshMode === 'duplicate-suppressed' ||
        refreshMode === 'no-folder-metadata-change';
      var noOpRefreshSuppressed = refreshMode === 'duplicate-suppressed' || refreshMode === 'no-folder-metadata-change';
      var rowsAfter = refreshSuppressed
        ? currentLibraryIndexRowCount()
        : await refreshLibraryIndex('sync-folder-import');
      if (!noOpRefreshSuppressed) {
        try {
          global.dispatchEvent(new CustomEvent('evt:h2o:data:backup:imported', {
            detail: { source: 'sync-folder-import', result: propagation },
          }));
        } catch (_) { /* ignore */ }
        if (refreshMode.indexOf('targeted-folder-refresh') !== 0 && refreshMode !== 'duplicate-suppressed') {
          try {
            global.dispatchEvent(new CustomEvent('evt:h2o:library:cross-surface-sync', {
              detail: { source: 'sync-folder-import', refreshMode: refreshMode, t: Date.now() },
            }));
          } catch (_) { /* ignore */ }
        }
      }

      var importSummary = safeObject(propagation && propagation.importSummary);
      var dryRunSummary = safeObject(importSummary.dryRun);
      state.lastFileName = LATEST_FILE;
      state.lastFileLastModified = numberOrZero(file.lastModified);
      state.lastFileSize = numberOrZero(file.size);
      state.lastAppliedExportId = cleanString(bundle.exportId || '');
      state.lastAppliedExportedAt = cleanString(bundle.exportedAt || '');
      state.lastAppliedAt = nowIso();
      state.lastDesktopToChromeImportAppliedAt = state.lastAppliedAt;
      state.lastChecksum = checksum || cleanString(bundle.checksum);
      state.lastSummarySignature = signature;
      state.lastSyncStatus = propagation && propagation.ok ? 'sync-folder-imported' : 'sync-folder-import-blocked';
      state.lastSyncError = propagation && propagation.ok ? '' : cleanString(propagation && propagation.blockers && propagation.blockers.join(','));
      state.lastSyncResult = propagation;
      await persistState({
        lastAppliedExportId: state.lastAppliedExportId,
        lastAppliedExportedAt: state.lastAppliedExportedAt,
        lastAppliedAt: state.lastAppliedAt,
        lastChecksum: state.lastChecksum,
        lastSummarySignature: signature,
        lastSyncStatus: state.lastSyncStatus,
        lastSyncError: state.lastSyncError,
        lastFileLastModified: state.lastFileLastModified,
        lastFileSize: state.lastFileSize,
      });

      var result = {
        ok: !!(propagation && propagation.ok),
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
        importedChats: numberOrZero(importSummary.importedChats),
        importedSnapshots: numberOrZero(importSummary.importedSnapshots),
        skipped: numberOrZero(dryRunSummary.willSkipDuplicateChats),
        skippedDetails: {
          chats: numberOrZero(dryRunSummary.willSkipDuplicateChats),
          chromeStorageLocal: numberOrZero(importSummary.chromeStorageSkipped),
          libraryKv: numberOrZero(importSummary.libraryKvSkipped),
        },
        sourceSummary: propagation && propagation.sourceSummary,
        importSummary: propagation && propagation.importSummary,
        convergence: propagation && propagation.convergence,
        postImportRefresh: propagation && propagation.postImportRefresh,
        conflictDecision: propagation && propagation.conflictDecision,
        conflictApproved: propagation && propagation.conflictApproved,
        conflictApproval: propagation && propagation.conflictApproval,
        blockers: propagation && propagation.blockers,
        warnings: propagation && propagation.warnings,
        redactedErrorCategories: propagation && propagation.redactedErrorCategories,
        rowsAfter: rowsAfter,
        dryRun: dryRunSummary,
        propagation: propagation,
        durationMs: Date.now() - startedAt,
        autoSync: !!opts.autoSync,
        backgroundAutoImport: false,
        chromeWritesSyncFolder: false,
        status: propagation && propagation.ok ? 'sync-folder-imported' : 'sync-folder-import-blocked',
      };
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
      desktopChromePropagation: {
        schema: PROPAGATION_SCHEMA,
        version: F19_DESKTOP_CHROME_VERSION,
        transport: LATEST_FILE,
        direction: 'desktop-to-chrome',
        supportedFields: DESKTOP_CHROME_SUPPORTED_FIELDS.slice(),
        deferredCodes: Object.assign({}, DESKTOP_CHROME_DEFERRED_CODES),
        hardeningTaxonomy: Object.assign({}, F19_SYNC_HARDENING_CODES),
        offlineRestartBehavior: {
          desktopOffline: 'latest.json remains pending until Chrome imports it',
          chromeOffline: 'Chrome imports latest.json after restart or focus when permission remains granted',
          repeatedImport: F19_SYNC_HARDENING_CODES.duplicateImportIdempotent,
          staleTransport: F19_SYNC_HARDENING_CODES.transportStale,
          simultaneousUpdate: F19_SYNC_HARDENING_CODES.simultaneousUpdateConflict,
          missingPermission: F19_SYNC_HARDENING_CODES.permissionDenied
        },
        guardedImportAvailable: true
      },
      importLatestBundleReadsLatestJson: true,
      importLatestBundlePayloadCompatibility: true,
      fullBundleV2ImportCompatible: true,
      chromeDesktopExport: {
        api: 'H2O.Studio.sync.folder.exportChromeToSyncFolder',
        schedulerApi: 'H2O.Studio.sync.folder.scheduleChromeToDesktopExport',
        syncNowDirection: 'H2O.Studio.sync.folder.syncNow({ direction: "chrome-to-desktop" })',
        transport: CHROME_LATEST_FILE,
        direction: 'chrome-to-desktop',
        autoImportAvailable: !!getChromeAutoImportApi(),
        chromeWritesSyncFolder: true,
        writesLatestJson: false,
        staleDesktopLatestJsonIgnored: true
      },
      desktopToChrome: {
        autoImportEnabled: !!state.autoSyncEnabled,
        autoExportEnabled: false,
        latestTransport: LATEST_FILE,
        lastImportStatus: state.lastAutoSyncStatus || state.lastSyncStatus,
        lastImportedAt: state.lastAutoSyncAt || state.lastAppliedAt,
        lastImportError: state.lastAutoSyncError || state.lastSyncError,
        desktopLatestPollingEnabled: !!state.desktopLatestPollTimer,
        desktopLatestPollIntervalMs: DESKTOP_LATEST_POLL_INTERVAL_MS,
        lastDesktopLatestPollStatus: state.lastDesktopLatestPollStatus,
        lastDesktopLatestPollDetectedAt: state.lastDesktopLatestPollDetectedAt,
        latency: {
          desktopMutationAt: state.lastDesktopToChromeExportWrittenAt,
          desktopExportWrittenAt: state.lastDesktopToChromeExportWrittenAt,
          chromeImportStartedAt: state.lastDesktopToChromeImportStartedAt,
          chromeImportAppliedAt: state.lastDesktopToChromeImportAppliedAt,
          chromeRenderRefreshedAt: state.lastDesktopToChromeRenderRefreshedAt,
          totalPropagationMs: state.lastDesktopToChromeTotalPropagationMs,
          postImportRefreshMode: state.lastDesktopToChromeRefreshMode,
          chromePostImportRefreshMode: state.lastChromePostImportRefreshMode,
          chromePostImportRefreshAt: state.lastChromePostImportRefreshAt,
          changedFolderCount: state.lastDesktopToChromeChangedFolderCount,
          changedFields: state.lastDesktopToChromeChangedFields.slice(),
          changedFolderIds: state.lastDesktopToChromeChangedFolderIds.slice(),
          renderRefreshCount: state.lastChromePostImportRenderRefreshCount,
          cumulativeRenderRefreshCount: state.chromePostImportRenderRefreshCount,
          refreshSuppressed: state.lastChromePostImportRefreshSuppressed,
          refreshSuppressedCount: state.chromePostImportRefreshSuppressedCount,
          postImportRefreshError: state.lastDesktopToChromePostImportRefreshError,
          loopSuppressed: state.loopSuppressedCount,
          duplicateSkipped: state.duplicateSkippedCount,
          selfOriginSkipped: state.selfOriginSkippedCount,
        },
        simultaneousConflictStatus: state.lastTransportConflictStatus,
        simultaneousConflictDecision: state.lastTransportConflictDecision,
        simultaneousConflictReason: state.lastTransportConflictReason,
        simultaneousConflictSummary: state.lastTransportConflictSummary,
        pending: !!state.autoSyncTimer,
        inFlight: !!state.autoSyncRunning || !!state.syncInFlight,
        permission: state.permission,
      },
      chromeToDesktop: {
        autoExportEnabled: true,
        chromeWritesSyncFolder: state.lastChromeExportStatus === 'chrome-to-desktop-exported',
        exportApiAvailable: !!getChromeAutoImportApi(),
        transport: CHROME_LATEST_FILE,
        lastExportStatus: state.lastChromeExportStatus,
        lastExportedAt: state.lastChromeExportAt,
        lastExportBytes: state.lastChromeExportBytes,
        lastExportFile: state.lastChromeExportFile,
        lastExportReason: state.lastChromeExportReason,
        lastExportError: state.lastChromeExportError,
        permission: state.lastChromeExportPermission || state.permission,
        pending: !!state.chromeExportPending,
        inFlight: !!state.chromeExportInFlight,
        blockers: state.lastChromeExportBlockers.slice(),
      },
      chromeAutoImport: {
        autoImportEnabled: !!state.autoSyncEnabled,
        lastImportStatus: state.lastAutoSyncStatus || state.lastSyncStatus,
        lastImportedAt: state.lastAutoSyncAt || state.lastAppliedAt,
        lastImportError: state.lastAutoSyncError || state.lastSyncError,
        desktopLatestPollingEnabled: !!state.desktopLatestPollTimer,
        desktopLatestPollIntervalMs: DESKTOP_LATEST_POLL_INTERVAL_MS,
        lastDesktopLatestPollStatus: state.lastDesktopLatestPollStatus,
        postImportRefreshMode: state.lastDesktopToChromeRefreshMode,
        chromePostImportRefreshMode: state.lastChromePostImportRefreshMode,
        changedFolderCount: state.lastChromePostImportChangedFolderCount,
        renderRefreshCount: state.lastChromePostImportRenderRefreshCount,
        cumulativeRenderRefreshCount: state.chromePostImportRenderRefreshCount,
        refreshSuppressed: state.lastChromePostImportRefreshSuppressed,
        refreshSuppressedCount: state.chromePostImportRefreshSuppressedCount,
        loopSuppressed: state.loopSuppressedCount,
        duplicateSkipped: state.duplicateSkippedCount,
        selfOriginSkipped: state.selfOriginSkippedCount,
        simultaneousConflictStatus: state.lastTransportConflictStatus,
        simultaneousConflictDecision: state.lastTransportConflictDecision,
        simultaneousConflictReason: state.lastTransportConflictReason,
        permission: state.permission,
        pending: !!state.autoSyncTimer,
        running: !!state.autoSyncRunning,
      },
      blockers: {
        permissionRequired: state.permission !== 'granted',
        autoImportDisabled: !state.autoSyncEnabled,
        simultaneousConflict: state.lastTransportConflictStatus === 'conflict-approval-required',
        schedulerNotFired: !state.autoSyncScheduledAt && !state.lastAutoSyncAttemptAt,
        noFolderHandle: !state.handle,
      },
      automaticPolling: !!state.desktopLatestPollTimer,
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
    exportChromeToSyncFolder: exportChromeToSyncFolder,
    syncChromeToDesktop: exportChromeToSyncFolder,
    scheduleChromeToDesktopExport: scheduleChromeToDesktopExport,
    importLatestBundle: importLatestBundle,
    desktopChromePropagationSchema: PROPAGATION_SCHEMA,
    desktopChromePropagationVersion: F19_DESKTOP_CHROME_VERSION,
    desktopChromeHardeningTaxonomy: Object.assign({}, F19_SYNC_HARDENING_CODES),
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
    startDesktopLatestPoller('studio-boot-ready');
    global.setTimeout(function () {
      scheduleAutoSync('studio-boot-ready').catch(function (error) {
        pushError('auto-sync.boot-ready', error);
      });
    }, AUTO_SYNC_BOOT_DELAY_MS);
  }).catch(function (error) {
    pushError('boot-load-folder', error);
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
