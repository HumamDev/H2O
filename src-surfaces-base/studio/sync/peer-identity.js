/* H2O Studio Sync — Peer Identity Scaffold (F2)
 *
 * IDENTITY-ONLY. No envelope stamping. No sequence numbers. No transport.
 * No tombstones. No bidirectional sync. No R-phase behavior change.
 *
 * Mints + persists a peer identity for the running Studio surface so future
 * multi-peer phases (F3+) can stamp outbound bundles with sourceSyncPeerId
 * and reason about per-peer state.
 *
 * Storage (single key, per surface):
 *   chrome.storage.local['h2o:sync:peer-identity:v1']
 *   On Desktop the Tauri kv_store shim backs chrome.storage.local. On Chrome
 *   MV3 it is the native chrome.storage.local. Both surfaces use the same key.
 *
 * Public API:
 *   H2O.Studio.identity.whenReady()       Promise<PeerIdentity | null>
 *   H2O.Studio.identity.get()             PeerIdentity | null   (synchronous;
 *                                           returns null until whenReady resolves)
 *   H2O.Studio.identity.diagnose()        { …UI-safe redacted view… }
 *   H2O.Studio.identity.setDisplayName(s) Promise<PeerIdentity>
 *   H2O.Studio.identity.constants         { SURFACE_KIND, APP_KIND, STORE_KIND, CAPTURE_SOURCE }
 *
 *   diagnose() omits installId, physicalDeviceId, and syncPeerId (because
 *   syncPeerId embeds installId). Full identity is available via get() for
 *   internal/dev use only.
 *
 * Capture-source rule:
 *   This module is loaded ONLY via studio.html. Native content scripts on
 *   chatgpt.com / claude.ai / gemini.com do not include studio.html and do
 *   not load this module. The runtime surface detector additionally bails
 *   out if the page is not recognized as a Studio surface — defense in depth.
 *
 * Per-record native-host attribution (e.g., 'native-chatgpt') is a separate
 * vocabulary exposed via constants.CAPTURE_SOURCE; it is NOT a peer enum.
 *
 * Idempotency:
 *   IIFE checks H2O.Studio.identity.__peerIdentityInstalled and exits if true.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.identity = H2O.Studio.identity || {};
  if (H2O.Studio.identity.__peerIdentityInstalled) return;

  /* ─── Constants ───────────────────────────────────────────────────── */

  var IDENTITY_KEY    = 'h2o:sync:peer-identity:v1';
  var IDENTITY_SCHEMA = 'h2o.studio.peer-identity.v1';
  var MODULE_VERSION  = '0.1.0-f2';
  var DISPLAY_NAME_MAX = 80;

  /* Surface enums — single source of truth. Native-host strings are
   * deliberately NOT in SURFACE_KIND; that enforces the F2 architecture
   * rule (native content scripts are capture sources, not peers) at the
   * type level. */
  var SURFACE_KIND = Object.freeze({
    STUDIO_DESKTOP: 'studio-desktop',
    STUDIO_CHROME:  'studio-chrome',
    STUDIO_MOBILE:  'studio-mobile',   // reserved
    STUDIO_FIREFOX: 'studio-firefox'   // reserved
  });
  var APP_KIND = Object.freeze({
    TAURI_DESKTOP: 'tauri-desktop',
    MV3_CHROME:    'mv3-chrome',
    MV3_FIREFOX:   'mv3-firefox',      // reserved
    EXPO_MOBILE:   'expo-mobile'       // reserved
  });
  var STORE_KIND = Object.freeze({
    SQLITE:      'sqlite',
    IDB_SHARED:  'idb-shared',
    IDB_ARCHIVE: 'idb-archive',
    EXPO_SQLITE: 'expo-sqlite',        // reserved
    EXPO_FS:     'expo-fs'             // reserved
  });
  /* CAPTURE_SOURCE is RECORD-level attribution, NOT a peer enum.
   * It exists here so other modules can use the same vocabulary without
   * inlining magic strings. */
  var CAPTURE_SOURCE = Object.freeze({
    NATIVE_CHATGPT: 'native-chatgpt',
    NATIVE_CLAUDE:  'native-claude',
    NATIVE_GEMINI:  'native-gemini',
    USER:           'user',
    IMPORT:         'import'
  });

  var SURFACE_KIND_SET = Object.freeze(Object.keys(SURFACE_KIND).map(function (k) { return SURFACE_KIND[k]; }));
  var APP_KIND_SET     = Object.freeze(Object.keys(APP_KIND).map(function (k) { return APP_KIND[k]; }));
  var STORE_KIND_SET   = Object.freeze(Object.keys(STORE_KIND).map(function (k) { return STORE_KIND[k]; }));

  /* ─── Tiny helpers ────────────────────────────────────────────────── */

  function nowIso() {
    try { return new Date().toISOString(); }
    catch (_) { return String(Date.now()); }
  }
  function isString(x) { return typeof x === 'string'; }
  function isObject(x) { return x && typeof x === 'object' && !Array.isArray(x); }

  /* UUIDv4 — prefer native, fall back to crypto.getRandomValues. */
  function uuidv4() {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
    } catch (_) { /* fall through */ }
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;  // v4
    b[8] = (b[8] & 0x3f) | 0x80;  // RFC variant
    var hex = [];
    for (var i = 0; i < 16; i++) {
      hex.push((b[i] >>> 4).toString(16));
      hex.push((b[i] & 0x0f).toString(16));
    }
    return hex.slice(0, 8).join('') + '-' +
           hex.slice(8, 12).join('') + '-' +
           hex.slice(12, 16).join('') + '-' +
           hex.slice(16, 20).join('') + '-' +
           hex.slice(20).join('');
  }
  var UUIDV4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function isUuidv4(s) { return isString(s) && UUIDV4_RE.test(s); }

  function deriveSyncPeerId(surfaceKind, appKind, storeKind, installId) {
    return surfaceKind + ':' + appKind + ':' + storeKind + ':' + installId;
  }

  function warnOnce(msg) {
    try { console.warn('[H2O F2 peer-identity] ' + msg); }
    catch (_) { /* ignore */ }
  }

  /* ─── Surface detection ───────────────────────────────────────────── */

  function detectSurface() {
    /* Desktop: Tauri webview. */
    try {
      if (global.__TAURI_INTERNALS__ || global.__TAURI__) {
        return {
          ok: true,
          surfaceKind: SURFACE_KIND.STUDIO_DESKTOP,
          appKind:     APP_KIND.TAURI_DESKTOP,
          storeKind:   STORE_KIND.SQLITE
        };
      }
    } catch (_) { /* ignore */ }

    /* Chrome Studio (MV3): must be loaded INSIDE the Studio surface page,
     * not a content script. */
    try {
      if (global.chrome && global.chrome.runtime && global.chrome.runtime.id) {
        var loc = global.location || {};
        var protocol = String(loc.protocol || '');
        var pathname = String(loc.pathname || '');
        if (protocol === 'chrome-extension:' && /\/surfaces\/studio\//.test(pathname)) {
          return {
            ok: true,
            surfaceKind: SURFACE_KIND.STUDIO_CHROME,
            appKind:     APP_KIND.MV3_CHROME,
            /* F2 picks idb-archive at first run. The Phase-3+ ADR-0006
             * idb-shared transition will need an explicit migration that
             * records previousSyncPeerId — out of F2 scope. */
            storeKind:   STORE_KIND.IDB_ARCHIVE
          };
        }
      }
    } catch (_) { /* ignore */ }

    return { ok: false };
  }

  /* ─── chrome.storage.local adapter (works on Desktop kv shim + Chrome) ─── */

  function storageGet(key) {
    return new Promise(function (resolve, reject) {
      try {
        if (!global.chrome || !global.chrome.storage || !global.chrome.storage.local
            || typeof global.chrome.storage.local.get !== 'function') {
          resolve(null);
          return;
        }
        global.chrome.storage.local.get([key], function (items) {
          var lastError = global.chrome.runtime && global.chrome.runtime.lastError;
          if (lastError) { reject(new Error(String(lastError.message || lastError))); return; }
          resolve(items && Object.prototype.hasOwnProperty.call(items, key) ? items[key] : null);
        });
      } catch (e) { reject(e); }
    });
  }
  function storageSet(key, value) {
    return new Promise(function (resolve, reject) {
      try {
        if (!global.chrome || !global.chrome.storage || !global.chrome.storage.local
            || typeof global.chrome.storage.local.set !== 'function') {
          reject(new Error('chrome.storage.local unavailable'));
          return;
        }
        var payload = {};
        payload[key] = value;
        global.chrome.storage.local.set(payload, function () {
          var lastError = global.chrome.runtime && global.chrome.runtime.lastError;
          if (lastError) { reject(new Error(String(lastError.message || lastError))); return; }
          resolve();
        });
      } catch (e) { reject(e); }
    });
  }

  /* ─── Validation / minting / reconciliation ───────────────────────── */

  function validateIdentity(raw) {
    if (!isObject(raw))                                   return { ok: false, reason: 'not-an-object' };
    if (raw.schema !== IDENTITY_SCHEMA)                   return { ok: false, reason: 'schema-mismatch' };
    if (!isUuidv4(raw.installId))                         return { ok: false, reason: 'bad-installId' };
    if (!isUuidv4(raw.physicalDeviceId))                  return { ok: false, reason: 'bad-physicalDeviceId' };
    if (SURFACE_KIND_SET.indexOf(raw.surfaceKind) < 0)    return { ok: false, reason: 'bad-surfaceKind' };
    if (APP_KIND_SET.indexOf(raw.appKind) < 0)            return { ok: false, reason: 'bad-appKind' };
    if (STORE_KIND_SET.indexOf(raw.storeKind) < 0)        return { ok: false, reason: 'bad-storeKind' };
    if (!isString(raw.syncPeerId) || !raw.syncPeerId)     return { ok: false, reason: 'missing-syncPeerId' };
    if (!isString(raw.createdAt)  || !raw.createdAt)      return { ok: false, reason: 'missing-createdAt' };
    if (!isString(raw.updatedAt)  || !raw.updatedAt)      return { ok: false, reason: 'missing-updatedAt' };
    if (!isString(raw.displayName))                       return { ok: false, reason: 'bad-displayName' };
    return { ok: true };
  }

  function mintIdentity(surface) {
    var installId        = uuidv4();
    var physicalDeviceId = uuidv4();
    var ts               = nowIso();
    return {
      schema:           IDENTITY_SCHEMA,
      installId:        installId,
      physicalDeviceId: physicalDeviceId,
      syncPeerId:       deriveSyncPeerId(surface.surfaceKind, surface.appKind, surface.storeKind, installId),
      surfaceKind:      surface.surfaceKind,
      appKind:          surface.appKind,
      storeKind:        surface.storeKind,
      displayName:      surface.surfaceKind + ' (' + surface.storeKind + ')',
      createdAt:        ts,
      updatedAt:        ts,
      surfaceHistory:   []
    };
  }

  /* Repair syncPeerId if it drifts from the derived value (mutates raw). */
  function ensureSyncPeerIdConsistent(raw) {
    var derived = deriveSyncPeerId(raw.surfaceKind, raw.appKind, raw.storeKind, raw.installId);
    if (raw.syncPeerId !== derived) {
      raw.syncPeerId = derived;
      raw.updatedAt = nowIso();
      return true;
    }
    return false;
  }

  /* Option A surface-transition reconciliation: preserve installId, update
   * current markers, append the prior surface to surfaceHistory. */
  function reconcileSurface(raw, current) {
    if (raw.surfaceKind === current.surfaceKind
        && raw.appKind === current.appKind
        && raw.storeKind === current.storeKind) {
      return false;
    }
    var history = Array.isArray(raw.surfaceHistory) ? raw.surfaceHistory.slice() : [];
    history.push({
      surfaceKind: raw.surfaceKind,
      appKind:     raw.appKind,
      storeKind:   raw.storeKind,
      observedUntil: raw.updatedAt
    });
    raw.surfaceKind = current.surfaceKind;
    raw.appKind     = current.appKind;
    raw.storeKind   = current.storeKind;
    raw.surfaceHistory = history;
    raw.syncPeerId = deriveSyncPeerId(current.surfaceKind, current.appKind, current.storeKind, raw.installId);
    raw.updatedAt  = nowIso();
    return true;
  }

  /* ─── Init state (in-memory) ──────────────────────────────────────── */

  var state = {
    initStarted: false,
    initPromise: null,
    identity:    null,
    lastWarn:    null
  };

  function init() {
    if (state.initStarted) return state.initPromise;
    state.initStarted = true;

    state.initPromise = (function () {
      var surface = detectSurface();
      if (!surface.ok) {
        state.lastWarn = 'Unable to detect a Studio surface; identity not minted.';
        warnOnce(state.lastWarn);
        return Promise.resolve(null);
      }

      return storageGet(IDENTITY_KEY)
        .then(function (raw) {
          if (raw) {
            var v = validateIdentity(raw);
            if (v.ok) {
              var reconciled = reconcileSurface(raw, surface);
              var repaired   = ensureSyncPeerIdConsistent(raw);
              if (reconciled || repaired) {
                return storageSet(IDENTITY_KEY, raw).then(function () { return raw; });
              }
              return raw;
            }
            state.lastWarn = 'Existing identity invalid (' + v.reason + '); minting new.';
            warnOnce(state.lastWarn);
          }
          var fresh = mintIdentity(surface);
          return storageSet(IDENTITY_KEY, fresh).then(function () { return fresh; });
        })
        .then(function (identity) {
          state.identity = identity;
          return identity;
        })
        .catch(function (err) {
          state.lastWarn = 'Init failed: ' + String((err && err.message) || err);
          warnOnce(state.lastWarn);
          return null;
        });
    })();

    return state.initPromise;
  }

  /* ─── Public API ──────────────────────────────────────────────────── */

  function whenReady() { return init(); }

  function get() { return state.identity; }

  /* diagnose(): UI-safe redacted view.
   *   Omitted: installId, physicalDeviceId, syncPeerId (latter embeds installId).
   *   Included: surfaceKind, appKind, storeKind, displayName, timestamps,
   *             surface-history depth (not the entries themselves).
   *   This is the surface that F1B and similar UIs should consume. */
  function diagnose() {
    var id = state.identity;
    if (!id) {
      return {
        status:         'pending',
        schema:         IDENTITY_SCHEMA,
        moduleVersion:  MODULE_VERSION,
        lastWarn:       state.lastWarn
      };
    }
    return {
      status:              'ready',
      schema:              id.schema,
      surfaceKind:         id.surfaceKind,
      appKind:             id.appKind,
      storeKind:           id.storeKind,
      displayName:         id.displayName,
      createdAt:           id.createdAt,
      updatedAt:           id.updatedAt,
      surfaceHistoryDepth: Array.isArray(id.surfaceHistory) ? id.surfaceHistory.length : 0,
      moduleVersion:       MODULE_VERSION
    };
  }

  function setDisplayName(name) {
    return whenReady().then(function (id) {
      if (!id) throw new Error('peer identity not initialized');
      var trimmed = String(name == null ? '' : name);
      if (trimmed.length > DISPLAY_NAME_MAX) trimmed = trimmed.slice(0, DISPLAY_NAME_MAX);
      if (trimmed === id.displayName) return id;
      id.displayName = trimmed;
      id.updatedAt = nowIso();
      return storageSet(IDENTITY_KEY, id).then(function () { return id; });
    });
  }

  /* ─── Registration ────────────────────────────────────────────────── */

  H2O.Studio.identity.whenReady          = whenReady;
  H2O.Studio.identity.get                = get;
  H2O.Studio.identity.diagnose           = diagnose;
  H2O.Studio.identity.setDisplayName     = setDisplayName;
  H2O.Studio.identity.constants          = Object.freeze({
    SURFACE_KIND:   SURFACE_KIND,
    APP_KIND:       APP_KIND,
    STORE_KIND:     STORE_KIND,
    CAPTURE_SOURCE: CAPTURE_SOURCE,
    KEY:            IDENTITY_KEY,
    SCHEMA:         IDENTITY_SCHEMA
  });
  H2O.Studio.identity.__peerIdentityInstalled = true;
  H2O.Studio.identity.__peerIdentityVersion   = MODULE_VERSION;

  /* Kick off init lazily — first whenReady() call still triggers it; this
   * just lets diagnose() return 'ready' on consumer load without an awaiter. */
  try { init(); } catch (_) { /* swallow — whenReady() will surface */ }

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
