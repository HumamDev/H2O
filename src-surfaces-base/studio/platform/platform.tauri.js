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

  /* ── chrome.storage.local polyfill (M1 only) ────────────────────────
   * `surfaces/studio/store/highlights.js` and
   * `surfaces/studio/store/libraryIndex.js` both check `chrome.storage.local`
   * directly via their own `hasChromeStorage()` helper. They predate
   * platform.storage integration. In Tauri there is no `chrome` global,
   * so without this shim those entity stores report
   * `diagnose().backend === 'none'` and every read/write becomes a
   * silent no-op.
   *
   * This installs a localStorage-backed shim that matches
   * chrome.storage.local's callback-and-Promise contract closely enough
   * for the entity stores' `get` / `set` / `remove` calls and for
   * `chrome.storage.onChanged.addListener` (used by their cross-tab
   * binding). Also stubs `chrome.runtime` so `chrome.runtime.lastError`
   * reads return `undefined` cleanly.
   *
   * M2 will replace this with a SQLite-backed shim driven by
   * tauri-plugin-sql. The entity stores will not need to change.
   */
  (function installChromeStorageShim() {
    try {
      if (typeof global.chrome === 'undefined') {
        try { global.chrome = {}; } catch (_) { return; }
      }
      if (!global.chrome.runtime) {
        /* chrome.runtime.lastError is a getter that returns undefined when
         * there's no error. An empty object suffices: accessing
         * .lastError returns undefined, which is the success signal. */
        global.chrome.runtime = {};
      }
      if (!global.chrome.storage) global.chrome.storage = {};
      if (global.chrome.storage.local) return; /* real chrome.storage present; don't shim */

      var changeListeners = new Set();

      global.chrome.storage.local = {
        get: function (keys, cb) {
          try {
            var arr;
            if (Array.isArray(keys)) arr = keys.slice();
            else if (typeof keys === 'string') arr = [keys];
            else if (keys && typeof keys === 'object') arr = Object.keys(keys);
            else arr = [];
            var out = {};
            for (var i = 0; i < arr.length; i += 1) {
              var k = arr[i];
              var raw = global.localStorage.getItem(k);
              if (raw == null) continue;
              try { out[k] = JSON.parse(raw); }
              catch (_) { out[k] = raw; }
            }
            if (typeof cb === 'function') cb(out);
            return Promise.resolve(out);
          } catch (e) {
            if (typeof cb === 'function') cb({});
            return Promise.reject(e);
          }
        },
        set: function (items, cb) {
          try {
            var changed = {};
            var keys = Object.keys(items || {});
            for (var i = 0; i < keys.length; i += 1) {
              var k = keys[i];
              var newValue = items[k];
              var oldRaw = global.localStorage.getItem(k);
              var oldValue;
              if (oldRaw != null) {
                try { oldValue = JSON.parse(oldRaw); }
                catch (_) { oldValue = oldRaw; }
              }
              global.localStorage.setItem(k, JSON.stringify(newValue));
              changed[k] = { newValue: newValue, oldValue: oldValue };
            }
            changeListeners.forEach(function (fn) {
              try { fn(changed, 'local'); } catch (_) { /* ignore */ }
            });
            if (typeof cb === 'function') cb();
            return Promise.resolve();
          } catch (e) {
            if (typeof cb === 'function') cb();
            return Promise.reject(e);
          }
        },
        remove: function (keys, cb) {
          try {
            var arr = Array.isArray(keys) ? keys.slice() : [keys];
            var changed = {};
            for (var i = 0; i < arr.length; i += 1) {
              var k = arr[i];
              var oldRaw = global.localStorage.getItem(k);
              var oldValue;
              if (oldRaw != null) {
                try { oldValue = JSON.parse(oldRaw); }
                catch (_) { oldValue = oldRaw; }
              }
              global.localStorage.removeItem(k);
              changed[k] = { oldValue: oldValue };
            }
            changeListeners.forEach(function (fn) {
              try { fn(changed, 'local'); } catch (_) { /* ignore */ }
            });
            if (typeof cb === 'function') cb();
            return Promise.resolve();
          } catch (e) {
            if (typeof cb === 'function') cb();
            return Promise.reject(e);
          }
        },
      };

      if (!global.chrome.storage.onChanged) {
        global.chrome.storage.onChanged = {
          addListener: function (fn) { if (typeof fn === 'function') changeListeners.add(fn); },
          removeListener: function (fn) { changeListeners.delete(fn); },
          hasListener: function (fn) { return changeListeners.has(fn); },
          /* H2O-internal helper used by the M2a-1 SQLite-backed upgrade so
           * the SQLite get/set/remove implementations can fire the same
           * listener Set without needing direct access to it. NOT part of
           * the chrome.storage.onChanged spec; do not consume from feature
           * code. */
          __dispatch: function (changed) {
            changeListeners.forEach(function (fn) {
              try { fn(changed, 'local'); } catch (_) { /* ignore */ }
            });
          },
        };
      }
    } catch (e) {
      try { console.warn('[H2O.Studio.platform.tauri] chrome.storage shim install failed', e); }
      catch (_) { /* ignore */ }
    }
  })();

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

  /* ── files.exportBlob (Phase 3a) ────────────────────────────────────
   * Tries the native save flow first:
   *   1. plugin:dialog|save        — returns the chosen path (or null on
   *                                   user cancellation).
   *   2. plugin:fs|write_text_file — writes the blob contents (text mode
   *                                   for Markdown / JSON / text MIMEs).
   *
   * If either plugin is missing from this build's Tauri capabilities OR
   * an invoke rejects (typical: permission denied because the plugin
   * isn't allow-listed), falls back to the Chromium-style Blob +
   * <a download> dance. The Tauri webview is chromium-based and
   * supports this — meaning Phase 3a ships without requiring any new
   * Rust dependency / capability change. If the plugins ARE present
   * they're used; if not, the user still gets the file via the
   * browser-style download path into the Tauri webview's downloads dir.
   *
   * Return shape:
   *   { ok: true,  path?: string, suggestedName }    — native save succeeded
   *   { ok: true,  suggestedName, fallback }         — blob+anchor used
   *   { ok: false, reason: 'cancelled' }             — user dismissed dialog
   *   rejection with Error                           — both paths failed
   *                                                    (bridge translates) */
  function filesExportBlob(opts) {
    if (!opts || typeof opts !== 'object') {
      return Promise.reject(new Error('platform.files.exportBlob: missing opts'));
    }
    var blob = opts.blob;
    var suggestedName = String(opts.suggestedName || '').trim() || 'download.bin';
    if (!blob || typeof blob !== 'object' || typeof blob.size !== 'number') {
      return Promise.reject(new Error('platform.files.exportBlob: opts.blob must be a Blob'));
    }

    function blobAnchorFallback() {
      return new Promise(function (resolve, reject) {
        try {
          if (typeof global.URL === 'undefined' || typeof global.URL.createObjectURL !== 'function') {
            return reject(new Error('platform.files.exportBlob: URL.createObjectURL unavailable in webview'));
          }
          if (typeof global.document === 'undefined' || typeof global.document.createElement !== 'function') {
            return reject(new Error('platform.files.exportBlob: document unavailable in webview'));
          }
          var url = global.URL.createObjectURL(blob);
          var a = global.document.createElement('a');
          a.href = url;
          a.download = suggestedName;
          try {
            global.document.body.appendChild(a);
            a.click();
          } catch (e) {
            try { global.URL.revokeObjectURL(url); } catch (_) { /* ignore */ }
            return reject(e);
          }
          setTimeout(function () {
            try { global.document.body.removeChild(a); } catch (_) { /* ignore */ }
            try { global.URL.revokeObjectURL(url); } catch (_) { /* ignore */ }
          }, 200);
          resolve({ ok: true, suggestedName: suggestedName, fallback: 'blob-anchor' });
        } catch (e) {
          reject(e);
        }
      });
    }

    var invoke = getTauriInvoke();
    if (!invoke) {
      /* Tauri context without invoke (shouldn't happen since we only
       * register inside detectTauri() — but be defensive). */
      return blobAnchorFallback();
    }

    /* Derive an extension hint from the suggestedName tail. Markdown
     * export passes "*.md" implicitly via the suggestedName. */
    var ext = '';
    var dot = suggestedName.lastIndexOf('.');
    if (dot > -1 && dot < suggestedName.length - 1) {
      ext = suggestedName.slice(dot + 1).toLowerCase();
    }
    var dialogArgs = { defaultPath: suggestedName };
    if (ext) {
      dialogArgs.filters = [{ name: ext.toUpperCase() + ' file', extensions: [ext] }];
    }

    var savePromise;
    try {
      savePromise = invoke('plugin:dialog|save', dialogArgs);
    } catch (_) {
      /* Synchronous throw from invoke — plugin almost certainly missing. */
      return blobAnchorFallback();
    }
    if (!savePromise || typeof savePromise.then !== 'function') {
      return blobAnchorFallback();
    }

    return savePromise.then(function (chosenPath) {
      if (chosenPath == null || chosenPath === '') {
        /* User dismissed the save dialog. Return informational
         * non-error so the ribbon can surface "Export cancelled". */
        return { ok: false, reason: 'cancelled' };
      }
      var path = String(chosenPath);

      /* Phase 3c-B — binary-safe routing.
       * Text MIMEs (text/*) round-trip cleanly through .text() as UTF-8 →
       * plugin:fs|write_text_file. This preserves the Phase 3a Markdown
       * export path verbatim.
       *
       * Non-text MIMEs (e.g. DOCX, ZIP, PDF) MUST go through the binary
       * path: blob → ArrayBuffer → Uint8Array → number[] → plugin:fs|write_file.
       * The text path corrupts binary bytes because blob.text() decodes
       * invalid UTF-8 sequences as U+FFFD; re-encoding back through Rust
       * mangles the file.
       *
       * If plugin:fs|write_file is missing from capabilities OR rejects,
       * fall back to the Chromium-style Blob+<a download> path (same
       * graceful degradation the Phase 3a text path uses). No new Rust
       * dependency, no new capability change. */
      var mimeType = String((blob && blob.type) || '').toLowerCase();
      var isTextMime = mimeType.indexOf('text/') === 0;

      if (isTextMime) {
        var textPromise = (typeof blob.text === 'function') ? blob.text() : Promise.resolve('');
        return Promise.resolve(textPromise).then(function (contents) {
          var writePromise;
          try {
            writePromise = invoke('plugin:fs|write_text_file', {
              path: path,
              contents: String(contents == null ? '' : contents),
            });
          } catch (_) {
            return blobAnchorFallback();
          }
          if (!writePromise || typeof writePromise.then !== 'function') {
            return blobAnchorFallback();
          }
          return writePromise.then(function () {
            return { ok: true, path: path, suggestedName: suggestedName };
          }, function (writeErr) {
            try { console.warn('[H2O.Studio.platform.tauri] plugin:fs|write_text_file rejected; falling back to blob+anchor', writeErr); }
            catch (_) { /* ignore */ }
            return blobAnchorFallback();
          });
        });
      }

      /* Binary path — non-text MIME (Phase 3c-B). */
      var bufPromise = (typeof blob.arrayBuffer === 'function')
        ? blob.arrayBuffer()
        : Promise.resolve(new ArrayBuffer(0));
      return Promise.resolve(bufPromise).then(function (buf) {
        var byteArray;
        try { byteArray = Array.from(new Uint8Array(buf)); }
        catch (_) { byteArray = []; }
        var writePromise;
        try {
          /* plugin:fs|write_file expects a Vec<u8> on the Rust side; in
           * JS that surfaces as a number[] (or Uint8Array — both accepted
           * by tauri-plugin-fs's JSON deserializer). Sending Array form
           * for maximum compatibility across plugin versions. */
          writePromise = invoke('plugin:fs|write_file', { path: path, contents: byteArray });
        } catch (_) {
          /* fs plugin missing OR write_file not allow-listed in capabilities
           * → fall back to webview Blob+anchor download. The user still
           * gets the file; loses the native save-dialog OS placement. */
          return blobAnchorFallback();
        }
        if (!writePromise || typeof writePromise.then !== 'function') {
          return blobAnchorFallback();
        }
        return writePromise.then(function () {
          return { ok: true, path: path, suggestedName: suggestedName };
        }, function (writeErr) {
          try { console.warn('[H2O.Studio.platform.tauri] plugin:fs|write_file rejected; falling back to blob+anchor', writeErr); }
          catch (_) { /* ignore */ }
          return blobAnchorFallback();
        });
      });
    }, function (dialogErr) {
      /* dialog plugin missing or rejected. Fall back so the user still
       * gets the file. */
      try { console.warn('[H2O.Studio.platform.tauri] plugin:dialog|save rejected; falling back to blob+anchor', dialogErr); }
      catch (_) { /* ignore */ }
      return blobAnchorFallback();
    });
  }

  /* ── clipboard.writeText ────────────────────────────────────────── */
  /* Phase 1b — one-shot text write. Prefer tauri-plugin-clipboard-manager
   * if it happens to be wired into this build (no new dependency added in
   * Phase 1b — we just attempt the invoke; if the plugin isn't present
   * the promise rejects and we fall back to navigator.clipboard.writeText).
   * Final fallback rejects with a clear, descriptive error. */
  function clipboardWriteText(text) {
    var s = String(text == null ? '' : text);
    var nav = global.navigator;
    var hasNavClipboard = !!(nav && nav.clipboard && typeof nav.clipboard.writeText === 'function');

    function navFallback() {
      if (hasNavClipboard) return nav.clipboard.writeText(s);
      return Promise.reject(new Error('platform.clipboard.writeText: tauri-plugin-clipboard-manager not wired and navigator.clipboard unavailable'));
    }

    var invoke = getTauriInvoke();
    if (invoke) {
      try {
        var p = invoke('plugin:clipboard-manager|write_text', { label: s });
        if (p && typeof p.then === 'function') {
          return p.then(undefined, function () { return navFallback(); });
        }
      } catch (_) { /* fall through to navFallback */ }
    }
    return navFallback();
  }

  /* ── window.setAlwaysOnTop (Tauri V2) ──────────────────────────────
   * Owns the desktop-only "Always stay on top" toggle exposed by the
   * Appearance / View Options panel (src-surfaces-base/studio/appearance/).
   * Defense-in-depth path order:
   *   1. Tauri V2 webview API `__TAURI__.window.getCurrentWindow().setAlwaysOnTop(on)`
   *   2. Legacy V1/V2 webview API `__TAURI__.window.getCurrent().setAlwaysOnTop(on)`
   *   3. Raw invoke `plugin:window|set_always_on_top` with `{ value: on }`
   *      (matches the command name exposed by tauri-plugin-window-internals
   *      under the `core:window` permission set, which is granted by
   *      `core:default` in apps/studio/desktop/src-tauri/capabilities/default.json).
   * If every path rejects (capability missing, plugin missing, etc.) the
   * returned promise rejects so the appearance store can surface the failure
   * via H2O.Studio.appearance.selfCheck().errors. No silent fakes. */
  function windowSetAlwaysOnTop(on) {
    var desired = !!on;
    var tauri = (global.__TAURI__ || (global.__TAURI_INTERNALS__ && global.__TAURI_INTERNALS__.plugins)) || null;
    var winNs = tauri && tauri.window ? tauri.window : null;
    var current = null;
    if (winNs) {
      try {
        if (typeof winNs.getCurrentWindow === 'function') current = winNs.getCurrentWindow();
        else if (typeof winNs.getCurrent === 'function') current = winNs.getCurrent();
      } catch (_) { current = null; }
    }
    if (current && typeof current.setAlwaysOnTop === 'function') {
      try {
        var p = current.setAlwaysOnTop(desired);
        if (p && typeof p.then === 'function') return p;
        return Promise.resolve(p);
      } catch (e) { /* fall through to raw invoke */ }
    }
    var invoke = getTauriInvoke();
    if (!invoke) return Promise.reject(new Error('platform.window.setAlwaysOnTop: tauri invoke unavailable'));
    try {
      return invoke('plugin:window|set_always_on_top', { value: desired });
    } catch (e) {
      return Promise.reject(e);
    }
  }

  function windowOpenDevtools() {
    var invoke = getTauriInvoke();
    if (!invoke) return Promise.reject(new Error('platform.window.openDevtools: tauri invoke unavailable'));
    try {
      return invoke('open_studio_devtools');
    } catch (e) {
      return Promise.reject(e);
    }
  }

  function getCurrentTauriWindow() {
    var tauri = (global.__TAURI__ || (global.__TAURI_INTERNALS__ && global.__TAURI_INTERNALS__.plugins)) || null;
    var winNs = tauri && tauri.window ? tauri.window : null;
    if (!winNs) return null;
    try {
      if (typeof winNs.getCurrentWindow === 'function') return winNs.getCurrentWindow();
      if (typeof winNs.getCurrent === 'function') return winNs.getCurrent();
    } catch (_) { /* ignore */ }
    return null;
  }

  function windowStartDragging() {
    var current = getCurrentTauriWindow();
    if (current && typeof current.startDragging === 'function') {
      try {
        var p = current.startDragging();
        if (p && typeof p.then === 'function') return p;
        return Promise.resolve(p);
      } catch (e) { /* fall through to raw invoke */ }
    }
    var invoke = getTauriInvoke();
    if (!invoke) return Promise.reject(new Error('platform.window.startDragging: tauri invoke unavailable'));
    try {
      return invoke('plugin:window|start_dragging');
    } catch (e) {
      return Promise.reject(e);
    }
  }

  /* ── Desktop view zoom shortcuts ──────────────────────────────────
   * Desktop-only browser-style zoom for the entire Studio view:
   *   Cmd/Ctrl + +  => larger
   *   Cmd/Ctrl + -  => smaller
   *   Cmd/Ctrl + 0  => reset
   *
   * Prefer a native Tauri webview zoom method if the runtime exposes one.
   * Current builds usually do not expose that method to page JS, so the
   * fallback uses CSS `zoom` on <body>. This stays scoped to Tauri because
   * platform.tauri.js does not register outside the desktop runtime. */
  var DESKTOP_VIEW_ZOOM_KEY = 'h2o:studio:desktop:view-zoom:v1';
  var DESKTOP_VIEW_ZOOM_MIN = 0.75;
  var DESKTOP_VIEW_ZOOM_MAX = 1.6;
  var DESKTOP_VIEW_ZOOM_STEP = 0.1;
  var desktopViewZoomValue = 1;

  function normalizeDesktopViewZoom(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) n = 1;
    n = Math.max(DESKTOP_VIEW_ZOOM_MIN, Math.min(DESKTOP_VIEW_ZOOM_MAX, n));
    return Math.round(n * 100) / 100;
  }

  function readDesktopViewZoom() {
    try {
      return normalizeDesktopViewZoom(global.localStorage.getItem(DESKTOP_VIEW_ZOOM_KEY));
    } catch (_) {
      return 1;
    }
  }

  function saveDesktopViewZoom(value) {
    try {
      if (value === 1) global.localStorage.removeItem(DESKTOP_VIEW_ZOOM_KEY);
      else global.localStorage.setItem(DESKTOP_VIEW_ZOOM_KEY, String(value));
    } catch (_) { /* ignore */ }
  }

  function setDesktopViewZoomDataset(value, mode) {
    try {
      var doc = global.document;
      if (!doc || !doc.documentElement) return;
      var inverse = value ? (1 / value) : 1;
      doc.documentElement.setAttribute('data-h2o-desktop-view-zoom', String(Math.round(value * 100)));
      doc.documentElement.setAttribute('data-h2o-desktop-view-zoom-mode', mode || 'css');
      doc.documentElement.style.setProperty('--h2o-desktop-view-zoom', String(value));
      doc.documentElement.style.setProperty('--h2o-desktop-view-zoom-inverse', String(Math.round(inverse * 10000) / 10000));
    } catch (_) { /* ignore */ }
  }

  function applyCssDesktopViewZoom(value) {
    try {
      var doc = global.document;
      if (!doc || !doc.body) return false;
      doc.body.style.zoom = value === 1 ? '' : String(value);
      setDesktopViewZoomDataset(value, 'css');
      return true;
    } catch (_) {
      return false;
    }
  }

  function clearCssDesktopViewZoom() {
    try {
      var doc = global.document;
      if (doc && doc.body) doc.body.style.zoom = '';
    } catch (_) { /* ignore */ }
  }

  function getTauriZoomTargets() {
    var targets = [];
    var tauri = global.__TAURI__ || null;
    try {
      if (tauri && tauri.webview && typeof tauri.webview.getCurrentWebview === 'function') {
        targets.push(tauri.webview.getCurrentWebview());
      }
    } catch (_) { /* ignore */ }
    try {
      if (tauri && tauri.webviewWindow && typeof tauri.webviewWindow.getCurrentWebviewWindow === 'function') {
        targets.push(tauri.webviewWindow.getCurrentWebviewWindow());
      }
    } catch (_) { /* ignore */ }
    try {
      var currentWindow = getCurrentTauriWindow();
      if (currentWindow) targets.push(currentWindow);
    } catch (_) { /* ignore */ }
    return targets.filter(Boolean);
  }

  function tryNativeDesktopViewZoom(value) {
    var targets = getTauriZoomTargets();
    var methods = ['setZoom', 'setZoomFactor'];
    for (var i = 0; i < targets.length; i += 1) {
      for (var j = 0; j < methods.length; j += 1) {
        var target = targets[i];
        var method = methods[j];
        if (!target || typeof target[method] !== 'function') continue;
        try {
          var p = target[method](value);
          if (p && typeof p.then === 'function') {
            return p.then(function () { return true; }, function () { return false; });
          }
          return Promise.resolve(true);
        } catch (_) {
          /* Try the next candidate. */
        }
      }
    }
    return Promise.resolve(false);
  }

  function windowSetViewZoom(value, opts) {
    var next = normalizeDesktopViewZoom(value);
    desktopViewZoomValue = next;
    if (!opts || opts.persist !== false) saveDesktopViewZoom(next);
    setDesktopViewZoomDataset(next, 'pending');
    return tryNativeDesktopViewZoom(next).then(function (nativeApplied) {
      if (nativeApplied) {
        clearCssDesktopViewZoom();
        setDesktopViewZoomDataset(next, 'native');
      } else {
        applyCssDesktopViewZoom(next);
      }
      return { ok: true, zoom: next, percent: Math.round(next * 100), mode: nativeApplied ? 'native' : 'css' };
    });
  }

  function windowGetViewZoom() {
    return {
      ok: true,
      zoom: desktopViewZoomValue,
      percent: Math.round(desktopViewZoomValue * 100),
      min: DESKTOP_VIEW_ZOOM_MIN,
      max: DESKTOP_VIEW_ZOOM_MAX,
      step: DESKTOP_VIEW_ZOOM_STEP,
    };
  }

  function windowZoomIn() {
    return windowSetViewZoom(desktopViewZoomValue + DESKTOP_VIEW_ZOOM_STEP);
  }

  function windowZoomOut() {
    return windowSetViewZoom(desktopViewZoomValue - DESKTOP_VIEW_ZOOM_STEP);
  }

  function windowResetViewZoom() {
    return windowSetViewZoom(1);
  }

  function desktopViewZoomShortcutAction(ev) {
    if (!ev || ev.defaultPrevented) return '';
    if (!(ev.metaKey || ev.ctrlKey)) return '';
    if (ev.altKey) return '';
    var key = String(ev.key || '').toLowerCase();
    var code = String(ev.code || '').toLowerCase();
    if (key === '+' || key === '=' || code === 'equal' || code === 'numpadadd') return 'in';
    if (key === '-' || key === '_' || code === 'minus' || code === 'numpadsubtract') return 'out';
    if (key === '0' || code === 'digit0' || code === 'numpad0') return 'reset';
    return '';
  }

  function installDesktopViewZoomShortcuts() {
    if (global.__h2oDesktopViewZoomShortcutsInstalled) return;
    global.__h2oDesktopViewZoomShortcutsInstalled = true;

    desktopViewZoomValue = readDesktopViewZoom();
    windowSetViewZoom(desktopViewZoomValue, { persist: false }).catch(function (e) {
      try { console.warn('[H2O.Studio.platform.tauri] initial view zoom failed', e); }
      catch (_) { /* ignore */ }
    });

    global.addEventListener('keydown', function (ev) {
      var action = desktopViewZoomShortcutAction(ev);
      if (!action) return;
      try { ev.preventDefault(); } catch (_) { /* ignore */ }
      try { ev.stopPropagation(); } catch (_) { /* ignore */ }
      try { ev.stopImmediatePropagation(); } catch (_) { /* ignore */ }

      var p;
      if (action === 'in') p = windowZoomIn();
      else if (action === 'out') p = windowZoomOut();
      else p = windowResetViewZoom();
      Promise.resolve(p).catch(function (e) {
        try { console.warn('[H2O.Studio.platform.tauri] view zoom shortcut failed', e); }
        catch (_) { /* ignore */ }
      });
    }, true);
  }

  function installRibbonMenuDrag(chrome) {
    if (!chrome || chrome.__h2oRibbonMenuDragInstalled) return;
    chrome.__h2oRibbonMenuDragInstalled = true;

    var suppressClickUntil = 0;

    function eligiblePointerDown(ev) {
      if (!ev || ev.button !== 0) return null;
      var target = ev.target;
      if (!target || typeof target.closest !== 'function') return null;
      if (chrome.getAttribute('data-library-ribbon-hidden') === 'true' ||
          chrome.getAttribute('data-reader-ribbon-hidden') === 'true') {
        var hiddenHit = target.closest('.wbRibbon,.wbTauriDragStrip,.wbTauriDesktopChrome');
        if (hiddenHit && chrome.contains(hiddenHit)) return { bar: chrome, tab: null };
      }
      var bar = target.closest('.wbRibbonBar');
      if (!bar || !chrome.contains(bar)) return null;
      if (target.closest('input,select,textarea,a,[contenteditable="true"],.wbRibbonCollapse')) return null;
      var tab = target.closest('.wbRibbonTab');
      if (target.closest('button,[role="button"]') && !tab) return null;
      return { bar: bar, tab: tab };
    }

    function cleanup(list) {
      if (!list) return;
      try { global.removeEventListener('pointermove', list.move, true); } catch (_) { /* ignore */ }
      try { global.removeEventListener('pointerup', list.up, true); } catch (_) { /* ignore */ }
      try { global.removeEventListener('pointercancel', list.up, true); } catch (_) { /* ignore */ }
      try { global.clearTimeout(list.timer); } catch (_) { /* ignore */ }
    }

    chrome.addEventListener('pointerdown', function (ev) {
      var hit = eligiblePointerDown(ev);
      if (!hit) return;

      var startX = Number(ev.clientX || 0);
      var startY = Number(ev.clientY || 0);
      var active = { started: false, timer: null, move: null, up: null };

      function beginDrag(triggerEv) {
        if (active.started) return;
        active.started = true;
        suppressClickUntil = Date.now() + 600;
        if (triggerEv && typeof triggerEv.preventDefault === 'function') {
          try { triggerEv.preventDefault(); } catch (_) { /* ignore */ }
        }
        windowStartDragging().catch(function (e) {
          try { console.warn('[H2O.Studio.platform.tauri] startDragging failed', e); }
          catch (_) { /* ignore */ }
        });
      }

      active.move = function (moveEv) {
        var dx = Math.abs(Number(moveEv.clientX || 0) - startX);
        var dy = Math.abs(Number(moveEv.clientY || 0) - startY);
        if (dx > 3 || dy > 3) beginDrag(moveEv);
      };
      active.up = function () { cleanup(active); };
      active.timer = global.setTimeout(function () { beginDrag(ev); }, 260);

      try { global.addEventListener('pointermove', active.move, true); } catch (_) { /* ignore */ }
      try { global.addEventListener('pointerup', active.up, true); } catch (_) { /* ignore */ }
      try { global.addEventListener('pointercancel', active.up, true); } catch (_) { /* ignore */ }
    }, true);

    chrome.addEventListener('click', function (ev) {
      if (Date.now() > suppressClickUntil) return;
      if (!ev || !ev.target || typeof ev.target.closest !== 'function') return;
      if (!ev.target.closest('.wbRibbonBar,.wbRibbon,.wbTauriDragStrip')) return;
      try { ev.preventDefault(); } catch (_) { /* ignore */ }
      try { ev.stopPropagation(); } catch (_) { /* ignore */ }
      try { ev.stopImmediatePropagation(); } catch (_) { /* ignore */ }
    }, true);
  }

  function installTauriDesktopChrome() {
    try {
      var doc = global.document;
      if (!doc || !doc.documentElement) return;
      doc.documentElement.setAttribute('data-h2o-runtime', 'tauri');

      function mount() {
        try {
          var shell = doc.querySelector('.wbShell');
          var ribbon = doc.getElementById('studioRibbon');
          if (!shell || !ribbon || !shell.parentNode) return false;

          var chrome = doc.getElementById('studioDesktopChrome');
          if (!chrome) {
            chrome = doc.createElement('div');
            chrome.id = 'studioDesktopChrome';
            chrome.className = 'wbTauriDesktopChrome';
            chrome.setAttribute('data-h2o-tauri-desktop-chrome', '1');
            shell.parentNode.insertBefore(chrome, shell);
          }
          chrome.hidden = false;

          var strip = chrome.querySelector('.wbTauriDragStrip');
          if (!strip) {
            strip = doc.createElement('div');
            strip.className = 'wbTauriDragStrip';
            strip.setAttribute('data-tauri-drag-region', '');
            strip.setAttribute('aria-hidden', 'true');
            chrome.appendChild(strip);
          }

          if (ribbon.parentNode !== chrome) chrome.appendChild(ribbon);
          installRibbonMenuDrag(chrome);

          var controlParking = doc.getElementById('studioRibbonControlParking');
          if (controlParking && controlParking.parentNode !== chrome) chrome.appendChild(controlParking);
          var metadataParking = doc.getElementById('studioRibbonMetadataParking');
          if (metadataParking && metadataParking.parentNode !== chrome) chrome.appendChild(metadataParking);
          return true;
        } catch (_) {
          return false;
        }
      }

      if (!mount()) {
        if (doc.readyState === 'loading') {
          doc.addEventListener('DOMContentLoaded', mount, { once: true });
        }
        global.setTimeout(mount, 0);
      }
    } catch (_) { /* ignore */ }
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
    files: { available: true, exportBlob: filesExportBlob },
    capture: { available: false },
    auth: { available: false },
    clipboard: { writeText: clipboardWriteText },
    window: {
      available: true,
      setAlwaysOnTop: windowSetAlwaysOnTop,
      openDevtools: windowOpenDevtools,
      startDragging: windowStartDragging,
      setViewZoom: windowSetViewZoom,
      getViewZoom: windowGetViewZoom,
      zoomIn: windowZoomIn,
      zoomOut: windowZoomOut,
      resetViewZoom: windowResetViewZoom,
    },
    /* Tauri-specific extension (not part of the fallback shape; callers
     * may feature-detect via `platform.openUrl` or `platform.env.isTauri`). */
    openUrl: openUrl,
  };

  try {
    platform.__registerAdapter(adapter);
    try { console.log('[H2O.Studio.platform] tauri adapter registered'); } catch (_) { /* ignore */ }
    installTauriDesktopChrome();
    installDesktopViewZoomShortcuts();
  } catch (e) {
    try { console.error('[H2O.Studio.platform.tauri] registration failed', e); } catch (_) { /* ignore */ }
  }

  /* ── SQLite-backed chrome.storage.local upgrade (M2a-1) ─────────────
   * The M1 chrome.storage shim above is localStorage-backed (synchronous,
   * fast, but per-window and ephemeral). M2a-1 upgrades the backend to
   * SQLite (durable, queryable, the foundation for M2a-2 domain tables).
   *
   * Lifecycle:
   *   1. The synchronous shim above already installed chrome.storage.local
   *      with localStorage-backed get/set/remove + onChanged.addListener.
   *      Studio scripts can call them immediately at boot.
   *   2. We now async-init the SQLite database (`sqlite:studio-v1.db`).
   *      tauri-plugin-sql auto-applies the V1 migrations declared in
   *      src-tauri/src/lib.rs (currently: just kv_store).
   *   3. Once SQLite is ready, run a one-shot localStorage→SQLite copy
   *      of every `h2o:*` key. Idempotent — marker key in SQLite tracks
   *      completion. Original localStorage data is NOT deleted (rollback
   *      safety; M2a-2 cleans up).
   *   4. Atomically swap chrome.storage.local.{get,set,remove} to
   *      SQLite-backed implementations. Subsequent calls hit SQLite.
   *      Listeners (chrome.storage.onChanged) continue working via the
   *      shim's __dispatch helper.
   *
   * Failure path: if SQLite init throws (Tauri plugin missing, db locked,
   * permissions denied), the localStorage shim stays active. Diagnostics
   * surface the error via `H2O.Studio.platform.__sqliteStatus()`.
   */
  var SQLITE_DB_URL = 'sqlite:studio-v1.db';
  var SQLITE_MIGRATION_MARKER_KEY = '__h2o_v1_localstorage_migration';
  var sqliteState = {
    ready: false,
    backend: 'localStorage',     /* current active backend for chrome.storage.local */
    initError: null,             /* string | null */
    dbUrl: SQLITE_DB_URL,
    migrationCompletedAt: null,  /* epoch ms | null */
    keysMigrated: 0,
  };
  var sqliteReadyPromise = null;

  function sqliteInit() {
    if (sqliteReadyPromise) return sqliteReadyPromise;
    var invoke = getTauriInvoke();
    if (!invoke) {
      sqliteState.initError = 'tauri invoke unavailable';
      sqliteReadyPromise = Promise.resolve(false);
      return sqliteReadyPromise;
    }
    sqliteReadyPromise = (function () {
      return invoke('plugin:sql|load', { db: SQLITE_DB_URL })
        .then(function () {
          sqliteState.ready = true;
          return migrateLocalStorageToSqlite();
        })
        .then(function () {
          if (sqliteState.ready) {
            upgradeChromeStorageToSqlite();
            sqliteState.backend = 'sqlite';
            try { console.log('[H2O.Studio.platform.tauri] chrome.storage.local backend → sqlite (' + sqliteState.keysMigrated + ' keys migrated from localStorage)'); }
            catch (_) { /* ignore */ }
          }
          return sqliteState.ready;
        })
        .catch(function (e) {
          sqliteState.initError = String((e && e.message) || e);
          try { console.warn('[H2O.Studio.platform.tauri] SQLite init failed; staying on localStorage shim', e); }
          catch (_) { /* ignore */ }
          return false;
        });
    })();
    return sqliteReadyPromise;
  }

  /* One-shot copy of all `h2o:*` keys from localStorage into SQLite's
   * kv_store. Marker key in SQLite makes this idempotent across boots.
   * Stores the value bytes verbatim (no double-JSON-encoding) since the
   * shim methods JSON.stringify before put and JSON.parse after get. */
  function migrateLocalStorageToSqlite() {
    var invoke = getTauriInvoke();
    if (!invoke || !sqliteState.ready) return Promise.resolve();
    return invoke('plugin:sql|select', {
      db: SQLITE_DB_URL,
      query: 'SELECT value FROM kv_store WHERE key = ?',
      values: [SQLITE_MIGRATION_MARKER_KEY],
    }).then(function (rows) {
      if (Array.isArray(rows) && rows.length > 0) {
        try {
          var rec = JSON.parse(rows[0].value);
          sqliteState.migrationCompletedAt = rec.at || null;
          sqliteState.keysMigrated = rec.keysMigrated || 0;
        } catch (_) { /* ignore */ }
        return; /* already migrated on a prior boot */
      }
      var keys = [];
      try {
        for (var i = 0; i < global.localStorage.length; i += 1) {
          var k = global.localStorage.key(i);
          if (k && k.indexOf('h2o:') === 0) keys.push(k);
        }
      } catch (_) { /* localStorage unavailable; nothing to migrate */ }
      var now = Date.now();
      var copyChain = Promise.resolve();
      keys.forEach(function (key) {
        copyChain = copyChain.then(function () {
          var raw = global.localStorage.getItem(key);
          if (raw == null) return null;
          return invoke('plugin:sql|execute', {
            db: SQLITE_DB_URL,
            query: 'INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)',
            values: [key, raw, now],
          }).catch(function (e) {
            try { console.warn('[H2O.Studio.platform.tauri] migration: failed to copy key ' + key, e); }
            catch (_) { /* ignore */ }
          });
        });
      });
      return copyChain.then(function () {
        sqliteState.keysMigrated = keys.length;
        sqliteState.migrationCompletedAt = now;
        var marker = JSON.stringify({ at: now, keysMigrated: keys.length, schema: 'v1' });
        return invoke('plugin:sql|execute', {
          db: SQLITE_DB_URL,
          query: 'INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)',
          values: [SQLITE_MIGRATION_MARKER_KEY, marker, now],
        }).catch(function () { /* swallow; non-fatal */ });
      });
    });
  }

  /* Replace chrome.storage.local.{get,set,remove} with SQLite-backed
   * implementations. Listeners (chrome.storage.onChanged) continue
   * working via the shim's __dispatch helper. */
  function upgradeChromeStorageToSqlite() {
    if (!global.chrome || !global.chrome.storage || !global.chrome.storage.local) return;
    var invoke = getTauriInvoke();
    if (!invoke) return;

    function sqliteGet(keys, cb) {
      var arr;
      if (Array.isArray(keys)) arr = keys.slice();
      else if (typeof keys === 'string') arr = [keys];
      else if (keys && typeof keys === 'object') arr = Object.keys(keys);
      else arr = [];
      if (arr.length === 0) {
        if (typeof cb === 'function') { try { cb({}); } catch (_) { /* ignore */ } }
        return Promise.resolve({});
      }
      var placeholders = arr.map(function () { return '?'; }).join(',');
      var p = invoke('plugin:sql|select', {
        db: SQLITE_DB_URL,
        query: 'SELECT key, value FROM kv_store WHERE key IN (' + placeholders + ')',
        values: arr,
      }).then(function (rows) {
        var out = {};
        (rows || []).forEach(function (row) {
          var raw = row && row.value;
          if (raw == null) return;
          try { out[row.key] = JSON.parse(raw); }
          catch (_) { out[row.key] = raw; }
        });
        return out;
      }).catch(function () { return {}; });
      if (typeof cb === 'function') p.then(function (v) { try { cb(v); } catch (_) {} });
      return p;
    }

    function sqliteSet(items, cb) {
      var keys = Object.keys(items || {});
      var now = Date.now();
      var changed = {};
      var chain = Promise.resolve();
      /* Read existing values for the change-event payload, then upsert. */
      keys.forEach(function (k) {
        chain = chain.then(function () {
          return invoke('plugin:sql|select', {
            db: SQLITE_DB_URL,
            query: 'SELECT value FROM kv_store WHERE key = ?',
            values: [k],
          }).then(function (rows) {
            var oldValue;
            if (Array.isArray(rows) && rows.length > 0) {
              try { oldValue = JSON.parse(rows[0].value); }
              catch (_) { oldValue = rows[0].value; }
            }
            var newValue = items[k];
            changed[k] = { newValue: newValue, oldValue: oldValue };
            return invoke('plugin:sql|execute', {
              db: SQLITE_DB_URL,
              query: 'INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)',
              values: [k, JSON.stringify(newValue), now],
            });
          });
        });
      });
      var p = chain.then(function () {
        try {
          if (global.chrome.storage.onChanged && typeof global.chrome.storage.onChanged.__dispatch === 'function') {
            global.chrome.storage.onChanged.__dispatch(changed);
          }
        } catch (_) { /* ignore */ }
      }).catch(function (e) {
        try { console.warn('[H2O.Studio.platform.tauri] sqliteSet failed', e); } catch (_) {}
      });
      if (typeof cb === 'function') p.then(function () { try { cb(); } catch (_) {} });
      return p;
    }

    function sqliteRemove(keys, cb) {
      var arr = Array.isArray(keys) ? keys.slice() : [keys];
      if (arr.length === 0) {
        if (typeof cb === 'function') { try { cb(); } catch (_) {} }
        return Promise.resolve();
      }
      var changed = {};
      var chain = Promise.resolve();
      arr.forEach(function (k) {
        chain = chain.then(function () {
          return invoke('plugin:sql|select', {
            db: SQLITE_DB_URL,
            query: 'SELECT value FROM kv_store WHERE key = ?',
            values: [k],
          }).then(function (rows) {
            var oldValue;
            if (Array.isArray(rows) && rows.length > 0) {
              try { oldValue = JSON.parse(rows[0].value); }
              catch (_) { oldValue = rows[0].value; }
            }
            changed[k] = { oldValue: oldValue };
            return invoke('plugin:sql|execute', {
              db: SQLITE_DB_URL,
              query: 'DELETE FROM kv_store WHERE key = ?',
              values: [k],
            });
          });
        });
      });
      var p = chain.then(function () {
        try {
          if (global.chrome.storage.onChanged && typeof global.chrome.storage.onChanged.__dispatch === 'function') {
            global.chrome.storage.onChanged.__dispatch(changed);
          }
        } catch (_) { /* ignore */ }
      }).catch(function (e) {
        try { console.warn('[H2O.Studio.platform.tauri] sqliteRemove failed', e); } catch (_) {}
      });
      if (typeof cb === 'function') p.then(function () { try { cb(); } catch (_) {} });
      return p;
    }

    global.chrome.storage.local.get = sqliteGet;
    global.chrome.storage.local.set = sqliteSet;
    global.chrome.storage.local.remove = sqliteRemove;
  }

  /* Diagnostic probes — exposed on the platform namespace so DevTools
   * console probes can verify SQLite is actually active without needing
   * to reach into module internals. NOT part of the platform-adapter
   * contract; treat as Tauri-specific debug API. */
  try {
    platform.__sqliteStatus = function () {
      return {
        ready: sqliteState.ready,
        backend: sqliteState.backend,
        initError: sqliteState.initError,
        dbUrl: sqliteState.dbUrl,
        migrationCompletedAt: sqliteState.migrationCompletedAt,
        keysMigrated: sqliteState.keysMigrated,
      };
    };

    /* Returns a Promise<{ ready, tables, indexes, rowCounts, error? }>.
     * Use to confirm the v2+ migrations applied (`tables` includes the
     * expected names) and to spot-check row counts (all 0 in M2a-2 since
     * no JS consumers write to the new tables yet). Caller awaits. */
    platform.__sqliteTables = function () {
      if (!sqliteState.ready) {
        return Promise.resolve({
          ready: false,
          error: 'sqlite not ready: ' + (sqliteState.initError || 'still initializing'),
          tables: [],
          indexes: [],
          rowCounts: {},
        });
      }
      var invoke = getTauriInvoke();
      if (!invoke) {
        return Promise.resolve({
          ready: false,
          error: 'tauri invoke unavailable',
          tables: [],
          indexes: [],
          rowCounts: {},
        });
      }
      return invoke('plugin:sql|select', {
        db: SQLITE_DB_URL,
        query: "SELECT name, type FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' ORDER BY name",
        values: [],
      }).then(function (rows) {
        var tables = [];
        var indexes = [];
        (rows || []).forEach(function (r) {
          if (r && r.type === 'table') tables.push(r.name);
          else if (r && r.type === 'index') indexes.push(r.name);
        });
        var rowCounts = {};
        var chain = Promise.resolve();
        tables.forEach(function (t) {
          chain = chain.then(function () {
            /* Table name comes from sqlite_master with type='table' filter
             * — not user input. Identifier interpolation is safe here. */
            return invoke('plugin:sql|select', {
              db: SQLITE_DB_URL,
              query: 'SELECT COUNT(*) AS n FROM ' + t,
              values: [],
            }).then(function (c) {
              rowCounts[t] = (c && c[0] && typeof c[0].n === 'number') ? c[0].n : 0;
            }).catch(function () { rowCounts[t] = -1; });
          });
        });
        return chain.then(function () {
          return {
            ready: true,
            tables: tables,
            indexes: indexes,
            rowCounts: rowCounts,
          };
        });
      }).catch(function (e) {
        return {
          ready: false,
          error: String((e && e.message) || e),
          tables: [],
          indexes: [],
          rowCounts: {},
        };
      });
    };

    /* Returns a Promise<{ ready, table, columns: [{ cid, name, type, notnull,
     * dflt_value, pk }], error? }>. Wraps SQLite's PRAGMA table_info(...)
     * so DevTools probes can confirm ALTER TABLE columns landed (the
     * table-list-only __sqliteTables() probe can't see column-level
     * changes). Caller awaits.
     *
     * tableName must match /^[A-Za-z_][A-Za-z0-9_]*$/ — only call with
     * names returned by __sqliteTables().tables. */
    platform.__sqliteSchema = function (tableName) {
      var name = String(tableName || '').trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        return Promise.resolve({
          ready: false,
          error: 'invalid table name (must match /^[A-Za-z_][A-Za-z0-9_]*$/)',
          table: name,
          columns: [],
        });
      }
      if (!sqliteState.ready) {
        return Promise.resolve({
          ready: false,
          error: 'sqlite not ready: ' + (sqliteState.initError || 'still initializing'),
          table: name,
          columns: [],
        });
      }
      var invoke = getTauriInvoke();
      if (!invoke) {
        return Promise.resolve({
          ready: false,
          error: 'tauri invoke unavailable',
          table: name,
          columns: [],
        });
      }
      return invoke('plugin:sql|select', {
        db: SQLITE_DB_URL,
        query: 'PRAGMA table_info(' + name + ')',
        values: [],
      }).then(function (rows) {
        var columns = (rows || []).map(function (r) {
          return {
            cid: r.cid,
            name: r.name,
            type: r.type,
            notnull: r.notnull,
            dflt_value: r.dflt_value,
            pk: r.pk,
          };
        });
        return { ready: true, table: name, columns: columns };
      }).catch(function (e) {
        return {
          ready: false,
          error: String((e && e.message) || e),
          table: name,
          columns: [],
        };
      });
    };
  } catch (_) { /* ignore */ }

  /* Kick off SQLite init asynchronously. The synchronous localStorage
   * shim above remains active until init resolves; entity stores can
   * call chrome.storage.local immediately at boot without waiting. */
  sqliteInit();

})(typeof window !== 'undefined' ? window : globalThis);
