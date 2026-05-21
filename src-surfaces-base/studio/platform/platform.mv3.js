/* H2O Studio Platform — MV3 Adapter
 *
 * Self-registering MV3/Chrome-extension implementation of the platform
 * adapter surface declared in surfaces/studio/STUDIO_PLATFORM_ADAPTER_GUIDE.md.
 *
 * Detects MV3 (`chrome.runtime?.id`) at load time. If absent, this script
 * silently no-ops and leaves the fallback adapter in place.
 *
 * Conservative wrappers only. This module does NOT migrate existing call
 * sites; existing direct chrome.* usage elsewhere in Studio remains.
 *
 * Broadcast key prefix: `h2o:studio:platform:broadcast:` (intentionally
 * separate from `h2o:library:cross-surface:broadcast:*` used by S0F1h
 * Library Sync, so the legacy sync path is undisturbed).
 */
(function (global) {
  'use strict';

  var platform = global.H2O && global.H2O.Studio && global.H2O.Studio.platform;
  if (!platform || !platform.__registerAdapter) {
    /* index.js didn't load — nothing to register against. */
    return;
  }

  var chromeApi = null;
  try { chromeApi = global.chrome; } catch (e) { chromeApi = null; }

  var hasRuntime = !!(chromeApi && chromeApi.runtime && chromeApi.runtime.id);
  var hasStorage = !!(chromeApi && chromeApi.storage && chromeApi.storage.local);

  if (!hasRuntime && !hasStorage) {
    /* Not running inside an MV3 extension page. Leave fallback in place. */
    platform.__warn('platform.mv3: chrome.runtime / chrome.storage unavailable; adapter not registered');
    return;
  }

  var ADAPTER_NAME = 'mv3';
  var ADAPTER_VERSION = '0.1.0';
  var BROADCAST_PREFIX = 'h2o:studio:platform:broadcast:';

  /* ───────────────────────── messaging ───────────────────────── */

  function messagingSend(target, message) {
    return new Promise(function (resolve, reject) {
      if (!hasRuntime) return reject(new Error('chrome.runtime unavailable'));
      try {
        /* `target` is informational today (used by Tauri to pick a command).
         * In MV3 the bg.js service worker routes by message envelope. */
        chromeApi.runtime.sendMessage(message, function (response) {
          var err = chromeApi.runtime && chromeApi.runtime.lastError;
          if (err) return reject(new Error(err.message || String(err)));
          resolve(response);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function messagingOn(target, fn) {
    if (!hasRuntime || typeof fn !== 'function') return function () {};
    var listener = function (msg, sender, sendResponse) {
      try {
        var result = fn(msg, sender);
        if (result && typeof result.then === 'function') {
          result.then(function (r) { sendResponse(r); }, function () { sendResponse(undefined); });
          return true; /* async response */
        }
        if (result !== undefined) sendResponse(result);
      } catch (e) {
        /* Swallow listener errors; do not break the message pipeline. */
        platform.__warn('messaging.on handler threw: ' + (e && e.message ? e.message : String(e)));
      }
      return undefined;
    };
    chromeApi.runtime.onMessage.addListener(listener);
    return function () {
      try { chromeApi.runtime.onMessage.removeListener(listener); } catch (e) { /* ignore */ }
    };
  }

  /* ───────────────────────── broadcast ───────────────────────── */

  function broadcastKey(channel) { return BROADCAST_PREFIX + String(channel) + ':v1'; }

  function broadcastEmit(channel, payload) {
    return new Promise(function (resolve, reject) {
      if (!hasStorage) {
        try {
          global.dispatchEvent(new global.CustomEvent('h2o:studio:platform:broadcast:' + channel, { detail: payload }));
          return resolve();
        } catch (e) { return reject(e); }
      }
      var record = { ts: Date.now(), payload: payload };
      try {
        var obj = {};
        obj[broadcastKey(channel)] = record;
        chromeApi.storage.local.set(obj, function () {
          var err = chromeApi.runtime && chromeApi.runtime.lastError;
          if (err) return reject(new Error(err.message || String(err)));
          resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function broadcastOn(channel, fn) {
    if (typeof fn !== 'function') return function () {};
    var key = broadcastKey(channel);
    if (hasStorage && chromeApi.storage.onChanged && chromeApi.storage.onChanged.addListener) {
      var listener = function (changes, area) {
        if (area !== 'local') return;
        if (!Object.prototype.hasOwnProperty.call(changes, key)) return;
        var next = changes[key] && changes[key].newValue;
        if (next && typeof next === 'object') {
          try { fn(next.payload, { ts: next.ts }); } catch (e) {
            platform.__warn('broadcast.on handler threw: ' + (e && e.message ? e.message : String(e)));
          }
        }
      };
      chromeApi.storage.onChanged.addListener(listener);
      return function () {
        try { chromeApi.storage.onChanged.removeListener(listener); } catch (e) { /* ignore */ }
      };
    }
    /* Fallback to window CustomEvent. */
    var winEvent = 'h2o:studio:platform:broadcast:' + channel;
    var winHandler = function (e) {
      try { fn(e && e.detail, { ts: Date.now() }); } catch (err) { /* swallow */ }
    };
    global.addEventListener(winEvent, winHandler);
    return function () { global.removeEventListener(winEvent, winHandler); };
  }

  /* ── Legacy / interop transports ──
   * emitRaw and onAnyChange let feature code preserve wire-format
   * compatibility with non-Studio surfaces (e.g., the native chatgpt.com
   * content scripts that already write to specific chrome.storage keys).
   * Useful for migrations like S0F1h Library Sync, which broadcasts on
   * `h2o:library:cross-surface:broadcast:v1` and listens for the native
   * counterpart on `:native:v1`. The platform adapter remains the only
   * place that touches chrome.* — feature code never imports chrome.
   */

  function broadcastEmitRaw(key, payload) {
    return new Promise(function (resolve, reject) {
      if (!hasStorage) return reject(new Error('chrome.storage unavailable'));
      try {
        var obj = {};
        obj[String(key)] = payload;
        chromeApi.storage.local.set(obj, function () {
          var err = chromeApi.runtime && chromeApi.runtime.lastError;
          if (err) return reject(new Error(err.message || String(err)));
          resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function broadcastOnAnyChange(fn) {
    if (typeof fn !== 'function') return function () {};
    if (!hasStorage || !chromeApi.storage.onChanged || !chromeApi.storage.onChanged.addListener) {
      return function () {};
    }
    var listener = function (changes, area) {
      try { fn(changes, area); } catch (e) {
        platform.__warn('broadcast.onAnyChange handler threw: ' + (e && e.message ? e.message : String(e)));
      }
    };
    chromeApi.storage.onChanged.addListener(listener);
    return function () {
      try { chromeApi.storage.onChanged.removeListener(listener); } catch (e) { /* ignore */ }
    };
  }

  /* ───────────────────────── storage ─────────────────────────
   * Low-level, localStorage-backed. This is intentionally simple: it is the
   * building block under a future H2O.Studio.store façade, not a replacement
   * for S0F1e Library Store (which remains the authority for general KV).
   * Async API so the Tauri adapter (which will be truly async) can swap in.
   */

  var ls = null;
  try { ls = global.localStorage; } catch (e) { ls = null; }

  function storageGet(key) {
    return new Promise(function (resolve) {
      if (!ls) return resolve(null);
      try {
        var raw = ls.getItem(String(key));
        if (raw == null) return resolve(null);
        /* Best-effort JSON decode; fall back to raw string. */
        try { resolve(JSON.parse(raw)); } catch (e) { resolve(raw); }
      } catch (e) {
        resolve(null);
      }
    });
  }

  function storageSet(key, value) {
    return new Promise(function (resolve, reject) {
      if (!ls) return reject(new Error('localStorage unavailable'));
      try {
        var serialized = typeof value === 'string' ? value : JSON.stringify(value);
        ls.setItem(String(key), serialized);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  }

  function storageRemove(key) {
    return new Promise(function (resolve, reject) {
      if (!ls) return reject(new Error('localStorage unavailable'));
      try {
        ls.removeItem(String(key));
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  }

  /* ───────────────────────── placeholders ───────────────────────── */

  var files = {
    available: false,
    reason: 'platform.files not implemented in mv3 skeleton; add when needed',
  };

  var capture = {
    available: false,
    reason: 'platform.capture interface stub; will route to S0D3a / S0D3e in a later patch',
  };

  var auth = {
    available: false,
    reason: 'platform.auth interface stub; identity surface remains the owner of auth flows',
  };

  /* ───────────────────────── clipboard ───────────────────────── */
  /* Phase 1b — one-shot text writes for Studio Ribbon actions. MV3
   * extension pages have access to navigator.clipboard.writeText when the
   * `clipboardWrite` permission is granted. Returns a rejected Promise
   * with a clear message if navigator.clipboard is unavailable (e.g. an
   * older browser, or the page was not loaded in a secure context). */
  function clipboardWriteText(text) {
    var s = String(text == null ? '' : text);
    try {
      var nav = global.navigator;
      if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
        return nav.clipboard.writeText(s);
      }
    } catch (e) {
      return Promise.reject(e);
    }
    return Promise.reject(new Error('platform.clipboard.writeText: navigator.clipboard.writeText unavailable in this context'));
  }

  /* ───────────────────────── register ───────────────────────── */

  var adapter = {
    name: ADAPTER_NAME,
    version: ADAPTER_VERSION,
    env: {
      adapter: ADAPTER_NAME,
      version: ADAPTER_VERSION,
      bootedAt: Date.now(),
      isExtension: true,
      isTauri: false,
      isDev: !!(global.location && /[?&]h2oDev=1\b/.test(global.location.search || '')),
    },
    messaging: { send: messagingSend, on: messagingOn },
    broadcast: {
      emit: broadcastEmit,
      on: broadcastOn,
      emitRaw: broadcastEmitRaw,
      onAnyChange: broadcastOnAnyChange,
    },
    storage: { get: storageGet, set: storageSet, remove: storageRemove },
    files: files,
    capture: capture,
    auth: auth,
    clipboard: { writeText: clipboardWriteText },
  };

  platform.__registerAdapter(adapter);
})(typeof window !== 'undefined' ? window : globalThis);
