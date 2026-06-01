/* H2O Studio Sync — Desktop focus/visibility-triggered import (R3 Phase 2)
 *
 * Tauri/Desktop-only opt-in that runs H2O.Studio.sync.scanFolderOnce()
 * when the Studio window gains focus or becomes visible. The scan
 * recognizes `latest.json` (Desktop's own export), `chrome-latest.json`
 * (Chrome's R3-phase-1 export), and the legacy `h2o-studio-full-bundle*`
 * pattern; matching files import through the existing
 * H2O.Studio.sync.importFromFile → importBundle('merge') path. Ledger
 * dedup means re-firing on every focus event is safe — only files with
 * a new SHA-256 fingerprint actually hit the importer.
 *
 * Sanctioned by R3 amendment §3 ("event-triggered import on the Desktop
 * side after explicit user opt-in") and §5 ("Manual scanNow is
 * acceptable as the first user-triggered import path under this gate.
 * No watcher and no polling is required for R3; if a watcher is added
 * later it is a separate gate").
 *
 * Safety invariants:
 *   - no polling — focus + visibilitychange are the ONLY triggers
 *   - no watcher (separate gate per R3 §5)
 *   - no bidirectional sync
 *   - no schema or wire-format change
 *   - feature flag default OFF (sync.desktopImportOnFocus)
 *   - 30-second minimum interval between scans (multi-focus debounce)
 *   - existing folder-sync ledger dedupes re-imports
 *   - no Chrome behavior
 *   - no Native UI change
 *
 * Public API: H2O.Studio.sync.focusImport.{
 *   enable, disable, isEnabled, status, diagnose, triggerNow
 * }
 *
 * Configuration prerequisite: a sync folder path must already be
 * configured via H2O.Studio.sync.setConfig({ mode, folderPath }) before
 * focusImport.enable() will produce useful scans. The trigger calls
 * scanFolderOnce() which silently no-ops when folderPath is unset.
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

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.sync = H2O.Studio.sync || {};
  if (H2O.Studio.sync.focusImport && H2O.Studio.sync.focusImport.__installed) return;

  /* ── Constants ────────────────────────────────────────────────────── */
  var PHASE                  = 'R3-phase2';
  var FLAG_KEY               = 'sync.desktopImportOnFocus';
  var SETTINGS_KEY           = 'h2o:sync:desktop-focus-import:state:v1';
  /* Focus events fire often — back-to-back tab switches, alt-tab cycles,
   * devtools open/close all generate focus blasts. 30 seconds between
   * scans is the smallest interval that won't thrash the importer and
   * still feels "automatic" to the user. Tuned to match R2C Chrome
   * auto-sync's AUTO_SYNC_MIN_INTERVAL_MS = 30000 for symmetry. */
  var MIN_INTERVAL_MS        = 30000;
  /* Initial-focus debounce: focus events at boot fire before the import
   * stack is ready. Wait this long after a focus event before scanning,
   * to coalesce rapid focus blasts AND let store/index init settle. */
  var FOCUS_DEBOUNCE_MS      = 800;
  var MAX_ERRORS             = 20;
  var FOCUS_EVENT_NAMES      = ['focus'];
  var VISIBILITY_EVENT_NAME  = 'visibilitychange';

  /* ── State (in-memory; the only persisted bit is the FLAG_KEY in H2O.flags) ── */
  var state = {
    installedAt: Date.now(),
    enabled: false,             /* mirrors FLAG_KEY value; kept in sync via enable()/disable() */
    listenersBound: false,
    focusHandler: null,
    visibilityHandler: null,
    debounceTimer: null,
    lastTriggerAt: 0,
    lastTriggerReason: '',
    lastScanAt: '',
    lastScanStatus: '',
    lastScanError: '',
    lastImportedFiles: 0,
    lastSkippedFiles: 0,
    triggerCount: 0,
    skippedTooSoonCount: 0,
    errors: [],
  };

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

  /* ── Feature flag (defaults OFF) — H2O.flags backed, same persistence
   *    as auto-import.mv3.js's eventTrigger flag for symmetry. ────────── */
  function flagEnabled() {
    try {
      var flags = H2O.flags;
      if (flags && typeof flags.get === 'function') {
        return flags.get(FLAG_KEY, false) === true;
      }
    } catch (_) { /* fall through */ }
    return false;
  }
  function setFlag(next) {
    try {
      var flags = H2O.flags;
      if (flags && typeof flags.set === 'function') {
        flags.set(FLAG_KEY, !!next);
      }
    } catch (e) { pushError('setFlag', e); }
  }

  /* ── chrome.storage.local-style KV (Tauri provides the shim) ─────── */
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
    return new Promise(function (resolve) {
      var s = getChromeStorageLocal();
      if (!s || typeof s.set !== 'function') { resolve(); return; }
      try {
        var item = {}; item[key] = value;
        s.set(item, function () { resolve(); });
      } catch (_) { resolve(); }
    });
  }

  /* ── Core scan + import call ──────────────────────────────────────── */
  /* Runs through the existing H2O.Studio.sync.scanFolderOnce — which
   * itself routes each matched file through importFromFile → dryRun →
   * importBundle('merge'), with SHA-256 ledger dedup at the file level.
   * Re-runs are no-ops on identical fingerprints, so this trigger is
   * safe to fire on every focus event. Returns the scan result for
   * diagnostics; never throws.
   *
   * After a successful scan that touched at least one new file, also
   * pokes H2O.LibraryIndex.refresh() to short-circuit the 220ms
   * subscriber debounce in S0F1c and surface imports immediately. */
  async function triggerScan(reason) {
    var startedAt = nowIso();
    state.lastTriggerAt = Date.now();
    state.lastTriggerReason = String(reason || 'unknown');
    state.triggerCount += 1;
    var sync = H2O.Studio && H2O.Studio.sync;
    if (!sync || typeof sync.scanFolderOnce !== 'function') {
      state.lastScanStatus = 'scanFolderOnce-unavailable';
      state.lastScanError  = 'H2O.Studio.sync.scanFolderOnce is not available';
      return { ok: false, reason: state.lastTriggerReason, startedAt: startedAt, error: state.lastScanError };
    }
    var scanResult;
    try {
      scanResult = await sync.scanFolderOnce();
    } catch (e) {
      pushError('triggerScan:scanFolderOnce', e);
      state.lastScanStatus = 'error';
      state.lastScanError  = String((e && e.message) || e);
      return { ok: false, reason: state.lastTriggerReason, startedAt: startedAt, error: state.lastScanError };
    }
    /* scanFolderOnce returns shape { ok, imported: [...], skipped: [...], ... }
     * — be defensive about exact shape since folder-sync may evolve. */
    var importedCount = 0;
    var skippedCount  = 0;
    try {
      if (scanResult && typeof scanResult === 'object') {
        if (Array.isArray(scanResult.imported)) importedCount = scanResult.imported.length;
        else if (typeof scanResult.importedCount === 'number') importedCount = scanResult.importedCount;
        if (Array.isArray(scanResult.skipped)) skippedCount = scanResult.skipped.length;
        else if (typeof scanResult.skippedCount === 'number') skippedCount = scanResult.skippedCount;
      }
    } catch (_) { /* visibility-only */ }
    state.lastScanAt        = startedAt;
    state.lastScanStatus    = importedCount > 0 ? 'imported' : 'no-new-files';
    state.lastScanError     = '';
    state.lastImportedFiles = importedCount;
    state.lastSkippedFiles  = skippedCount;

    /* Best-effort LibraryIndex refresh when something was imported. */
    if (importedCount > 0) {
      try {
        var idx = H2O.LibraryIndex;
        if (idx && typeof idx.refresh === 'function') {
          await idx.refresh('focus-import:' + state.lastTriggerReason);
        }
      } catch (e) { pushError('triggerScan:libraryIndex.refresh', e); }
    }
    return {
      ok: true,
      reason: state.lastTriggerReason,
      startedAt: startedAt,
      completedAt: nowIso(),
      importedFiles: importedCount,
      skippedFiles: skippedCount,
      scanResult: scanResult,
    };
  }

  /* ── Listener plumbing ────────────────────────────────────────────── */
  /* onFocusEvent: gates + debounces + interval-throttles each fire.
   * The 30s interval check happens IN ADDITION to the 800ms debounce,
   * so a focus burst within the same 30s window collapses to a single
   * scan at the tail of the burst, then quiet-period kicks in. */
  function onFocusEvent(reason) {
    /* Hard gate on the flag — runtime flips take effect immediately. */
    if (!flagEnabled()) return;
    /* Visibility-only filter for visibilitychange events. */
    if (reason === VISIBILITY_EVENT_NAME) {
      try { if (global.document && global.document.visibilityState !== 'visible') return; }
      catch (_) { return; }
    }
    /* Interval throttle: if the last successful trigger was < MIN_INTERVAL_MS
     * ago, drop this fire. Tracked at the moment of TRIGGER, not at the
     * moment of SCAN completion, so an in-flight scan still blocks. */
    var sinceLast = Date.now() - state.lastTriggerAt;
    if (state.lastTriggerAt > 0 && sinceLast < MIN_INTERVAL_MS) {
      state.skippedTooSoonCount += 1;
      return;
    }
    /* Debounce: coalesce rapid focus events (e.g. devtools focus then
     * window focus arrive ~50ms apart) into a single scan. */
    if (state.debounceTimer) {
      global.clearTimeout(state.debounceTimer);
      state.debounceTimer = null;
    }
    state.debounceTimer = global.setTimeout(function () {
      state.debounceTimer = null;
      triggerScan(reason).catch(function (e) { pushError('debouncedTrigger', e); });
    }, FOCUS_DEBOUNCE_MS);
  }

  function bindEventListeners() {
    if (state.listenersBound) return;
    if (typeof global.addEventListener !== 'function') {
      pushError('bindEventListeners', new Error('addEventListener unavailable'));
      return;
    }
    /* focus handler */
    state.focusHandler = function () { onFocusEvent('focus'); };
    FOCUS_EVENT_NAMES.forEach(function (name) {
      try { global.addEventListener(name, state.focusHandler); }
      catch (e) { pushError('bindEventListeners:' + name, e); }
    });
    /* visibilitychange handler (on document, not window) */
    if (global.document && typeof global.document.addEventListener === 'function') {
      state.visibilityHandler = function () { onFocusEvent(VISIBILITY_EVENT_NAME); };
      try { global.document.addEventListener(VISIBILITY_EVENT_NAME, state.visibilityHandler); }
      catch (e) { pushError('bindEventListeners:' + VISIBILITY_EVENT_NAME, e); }
    }
    state.listenersBound = true;
  }
  function unbindEventListeners() {
    if (!state.listenersBound) return;
    if (state.focusHandler) {
      FOCUS_EVENT_NAMES.forEach(function (name) {
        try { global.removeEventListener(name, state.focusHandler); }
        catch (e) { pushError('unbindEventListeners:' + name, e); }
      });
      state.focusHandler = null;
    }
    if (state.visibilityHandler && global.document
        && typeof global.document.removeEventListener === 'function') {
      try { global.document.removeEventListener(VISIBILITY_EVENT_NAME, state.visibilityHandler); }
      catch (e) { pushError('unbindEventListeners:' + VISIBILITY_EVENT_NAME, e); }
      state.visibilityHandler = null;
    }
    if (state.debounceTimer) {
      global.clearTimeout(state.debounceTimer);
      state.debounceTimer = null;
    }
    state.listenersBound = false;
  }

  /* ── Public API ──────────────────────────────────────────────────── */
  function isEnabled() { return flagEnabled(); }

  async function enable() {
    setFlag(true);
    state.enabled = true;
    bindEventListeners();
    /* Persist a small diagnostic row so existing tools that read
     * SETTINGS_KEY (none yet, but parity with auto-import.mv3.js) can
     * observe the opt-in. */
    await writeKv(SETTINGS_KEY, {
      version: 1, enabled: true, enabledAt: nowIso(), phase: PHASE,
    });
    return isEnabled();
  }

  async function disable() {
    unbindEventListeners();
    setFlag(false);
    state.enabled = false;
    await writeKv(SETTINGS_KEY, {
      version: 1, enabled: false, disabledAt: nowIso(), phase: PHASE,
    });
    return isEnabled();
  }

  /* triggerNow: bypasses the debounce + interval-throttle, useful for
   * manual diagnostics and the validation harness. Honors the master
   * flag so a disabled feature never imports even on explicit call. */
  async function triggerNow(opts) {
    var reason = (opts && opts.reason) || 'manual';
    if (!flagEnabled()) {
      return { ok: false, reason: reason, error: 'flag "' + FLAG_KEY + '" is OFF' };
    }
    return triggerScan(reason);
  }

  async function status() {
    return {
      phase: PHASE,
      flagKey: FLAG_KEY,
      flagEnabled: flagEnabled(),
      listenersBound: state.listenersBound,
      minIntervalMs: MIN_INTERVAL_MS,
      focusDebounceMs: FOCUS_DEBOUNCE_MS,
      triggerCount: state.triggerCount,
      skippedTooSoonCount: state.skippedTooSoonCount,
      lastTriggerAt: state.lastTriggerAt,
      lastTriggerReason: state.lastTriggerReason,
      lastScanAt: state.lastScanAt,
      lastScanStatus: state.lastScanStatus,
      lastScanError: state.lastScanError,
      lastImportedFiles: state.lastImportedFiles,
      lastSkippedFiles: state.lastSkippedFiles,
    };
  }

  async function diagnose() {
    var s = await status();
    return Object.assign({}, s, {
      installedAt: state.installedAt,
      installedAtIso: (function () { try { return new Date(state.installedAt).toISOString(); } catch (_) { return ''; } })(),
      focusEventNames: FOCUS_EVENT_NAMES.slice(),
      visibilityEventName: VISIBILITY_EVENT_NAME,
      settingsKey: SETTINGS_KEY,
      gateRef: 'R2D Gate R3 — Chrome to Desktop Export Gate, §3 event-triggered import / §5 manual scanNow',
      bidirectionalSync: false,
      polling: false,
      watcher: false,
      backgroundDaemon: false,
      errors: state.errors.slice(),
    });
  }

  /* ── Boot wiring — honor flag state ──────────────────────────────── */
  async function bootHydrate() {
    state.enabled = flagEnabled();
    if (state.enabled) bindEventListeners();
  }

  /* ── Register ────────────────────────────────────────────────────── */
  var api = {
    __installed: true,
    __version: '0.1.0',
    enable:     enable,
    disable:    disable,
    isEnabled:  isEnabled,
    triggerNow: triggerNow,
    status:     status,
    diagnose:   diagnose,
  };
  H2O.Studio.sync.focusImport = api;

  bootHydrate().catch(function (e) { pushError('boot.bootHydrate', e); });
})(typeof window !== 'undefined' ? window : globalThis);
