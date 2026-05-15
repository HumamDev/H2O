/* H2O Studio Platform — Tauri V2 Adapter
 *
 * Self-registering Tauri implementation of the platform adapter surface
 * declared in surfaces/studio/STUDIO_PLATFORM_ADAPTER_GUIDE.md. Detects
 * Tauri context at load time via the runtime-injected globals; outside
 * Tauri this file silently no-ops and leaves whatever adapter has
 * already registered (typically platform.mv3 in the MV3 extension build,
 * or the fallback adapter in plain web contexts) in place.
 *
 * V1 Milestone scope (M1 — boot proof):
 *   - storage: localStorage-backed (per-window). Sufficient to boot Studio's
 *     entity stores. M2 swaps this for tauri-plugin-sql / SQLite.
 *   - broadcast: in-page only (single-window V1). emitRaw is a no-op; cross-
 *     tab/window sync is not part of V1.
 *   - messaging: rejects all calls. V1 Studio Desktop has no service-worker
 *     counterpart and no archive bridge; feature paths that would call
 *     messaging.send (e.g. S0F0a chat-list service) fall through their
 *     existing graceful-failure paths and Studio renders an empty library.
 *   - openUrl: invokes Tauri's `plugin:shell|open` command when the
 *     tauri-plugin-shell JS binding is available; rejects otherwise.
 *
 * Detection priority:
 *   __TAURI_INTERNALS__ → __TAURI__  (Tauri V2 exposes the former; some V1
 *   builds exposed the latter; supporting both keeps this future-flexible).
 *
 * This adapter conforms to platform/index.js's __registerAdapter contract:
 *   { name, version, env, messaging, broadcast, storage, files, capture, auth }
 * Missing fields fall through to the fallback adapter's defaults.
 *
 * Contracts: surfaces/studio/STUDIO_PLATFORM_ADAPTER_GUIDE.md
 *            surfaces/studio/STUDIO_PORTABILITY_CONTRACT.md
 */
(function (global) {
  'use strict';

  /* ── Detect Tauri runtime ───────────────────────────────────────── */
  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* swallow */ }
    return false;
  }
  if (!detectTauri()) return;

  /* ── Hook into the platform namespace ───────────────────────────── */
  var platform = global.H2O && global.H2O.Studio && global.H2O.Studio.platform;
  if (!platform || typeof platform.__registerAdapter !== 'function') {
    /* index.js didn't load — nothing to register against. */
    try { console.warn('[H2O.Studio.platform.tauri] platform namespace missing; adapter not registered'); }
    catch (_) { /* ignore */ }
    return;
  }

  var ADAPTER_NAME = 'tauri';
  var ADAPTER_VERSION = '0.1.0';
  var BOOT_AT = Date.now();
  var BROADCAST_PREFIX = 'h2o:studio:platform:broadcast:';

  /* ── Tauri invoke (V2) ──────────────────────────────────────────── */
  function getTauriInvoke() {
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

  /* ── messaging ──────────────────────────────────────────────────── */
  /* No SW counterpart in V1 desktop. Callers that have a platform-first
   * preference path will catch the rejection and continue; pure-direct
   * chrome.runtime.sendMessage call sites are MV3-only and will not reach
   * this adapter. */
  function messagingSend(target, message) {
    return Promise.reject(new Error(
      'platform.messaging.send: not available on Tauri (V1 import-only desktop)'
    ));
  }
  function messagingOn(target, fn) {
    /* No-op subscription. Returns an unsubscribe that does nothing. */
    return function () { /* noop */ };
  }

  /* ── broadcast ──────────────────────────────────────────────────── */
  /* In-page only. Single-window V1 — cross-window sync is a later phase
   * (Tauri events). The emit/on pair operates over an in-memory channel
   * map; onAnyChange fires for every channel emit. emitRaw is a no-op
   * (MV3's chrome.storage-backed raw broadcast has no Tauri counterpart). */
  var byChannel = Object.create(null);
  var anyChangeFns = new Set();

  function broadcastEmit(channel, payload) {
    var ch = String(channel || '');
    var listeners = byChannel[ch];
    if (listeners) {
      listeners.forEach(function (fn) {
        try { fn({ channel: ch, payload: payload, source: 'local' }); }
        catch (_) { /* swallow */ }
      });
    }
    anyChangeFns.forEach(function (fn) {
      try { fn({ channel: ch, payload: payload, source: 'local' }); }
      catch (_) { /* swallow */ }
    });
    return Promise.resolve();
  }
  function broadcastOn(channel, fn) {
    if (typeof fn !== 'function') return function () { /* noop */ };
    var ch = String(channel || '');
    var set = byChannel[ch] = byChannel[ch] || new Set();
    set.add(fn);
    return function () { set.delete(fn); };
  }
  function broadcastEmitRaw() {
    /* No raw-key broadcast on Tauri. Studio code that prefers emitRaw
     * (e.g. native interop on MV3) has graceful fallbacks. */
    return Promise.resolve();
  }
  function broadcastOnAnyChange(fn) {
    if (typeof fn !== 'function') return function () { /* noop */ };
    anyChangeFns.add(fn);
    return function () { anyChangeFns.delete(fn); };
  }

  /* ── storage ────────────────────────────────────────────────────── */
  /* M1: localStorage-backed. M2 will swap this for SQLite via
   * tauri-plugin-sql. Keys are stored as-is; values are JSON-serialized. */
  function storageGet(key) {
    try {
      var raw = global.localStorage.getItem(String(key));
      if (raw == null) return Promise.resolve(null);
      try { return Promise.resolve(JSON.parse(raw)); }
      catch (_) { return Promise.resolve(raw); }
    } catch (e) { return Promise.reject(e); }
  }
  function storageSet(key, value) {
    try {
      var encoded = (typeof value === 'string') ? value : JSON.stringify(value);
      global.localStorage.setItem(String(key), encoded);
      return Promise.resolve();
    } catch (e) { return Promise.reject(e); }
  }
  function storageRemove(key) {
    try { global.localStorage.removeItem(String(key)); return Promise.resolve(); }
    catch (e) { return Promise.reject(e); }
  }

  /* ── openUrl ────────────────────────────────────────────────────── */
  /* Wraps Tauri's tauri-plugin-shell `open` command when available.
   * Replaces the single MV3-only `chrome.tabs.create()` call at S0F1k:90. */
  function openUrl(url, _opts) {
    var safeUrl = String(url || '').trim();
    if (!safeUrl) return Promise.reject(new Error('platform.openUrl: empty url'));
    var invoke = getTauriInvoke();
    if (!invoke) return Promise.reject(new Error('platform.openUrl: tauri invoke unavailable'));
    try {
      return invoke('plugin:shell|open', { path: safeUrl });
    } catch (e) {
      return Promise.reject(e);
    }
  }

  /* ── Public adapter ─────────────────────────────────────────────── */
  var adapter = {
    name: ADAPTER_NAME,
    version: ADAPTER_VERSION,
    env: {
      adapter: ADAPTER_NAME,
      version: ADAPTER_VERSION,
      bootedAt: BOOT_AT,
      isExtension: false,
      isTauri: true,
      isDev: false,
    },
    messaging: { send: messagingSend, on: messagingOn },
    broadcast: {
      emit: broadcastEmit,
      on: broadcastOn,
      emitRaw: broadcastEmitRaw,
      onAnyChange: broadcastOnAnyChange,
    },
    storage: { get: storageGet, set: storageSet, remove: storageRemove },
    files: { available: false },
    capture: { available: false },
    auth: { available: false },
    /* Tauri-specific extension (not part of the fallback shape; callers
     * may feature-detect via `platform.openUrl` or `platform.env.isTauri`). */
    openUrl: openUrl,
  };

  try {
    platform.__registerAdapter(adapter);
    try { console.log('[H2O.Studio.platform] tauri adapter registered'); } catch (_) { /* ignore */ }
  } catch (e) {
    try { console.error('[H2O.Studio.platform.tauri] registration failed', e); } catch (_) { /* ignore */ }
  }
})(typeof window !== 'undefined' ? window : globalThis);
