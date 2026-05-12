/* H2O Studio Platform — Namespace Entry
 *
 * Creates `H2O.Studio.platform` with safe defaults and a registration helper.
 * Adapter modules (platform.mv3.js, future platform.tauri.js) self-register
 * by calling `H2O.Studio.platform.__registerAdapter(impl)`.
 *
 * Idempotent: re-loading this script does not overwrite an already-installed
 * platform or adapter.
 *
 * Contract: see surfaces/studio/STUDIO_PLATFORM_ADAPTER_GUIDE.md.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};

  if (H2O.Studio.platform && H2O.Studio.platform.__installed) {
    return;
  }

  var BOOT_AT = Date.now();
  var WARNINGS = [];

  function noopAsync() { return Promise.resolve(); }
  function noopUnsub() { return function () {}; }
  function unavailableAsync(name) {
    return function () {
      return Promise.reject(new Error('H2O.Studio.platform.' + name + ' unavailable (no adapter bound)'));
    };
  }

  /* Fallback adapter: present from the moment index.js loads so feature code
   * never sees `undefined` on the platform surface. Each method either no-ops
   * (broadcast.emit, storage.set with same value) or returns a rejected
   * Promise with a clear message. Replaced when a real adapter registers.
   */
  var fallback = {
    name: 'fallback',
    version: '0.1.0',
    env: {
      adapter: 'fallback',
      version: '0.1.0',
      bootedAt: BOOT_AT,
      isExtension: false,
      isTauri: false,
      isDev: false,
    },
    messaging: {
      send: unavailableAsync('messaging.send'),
      on: noopUnsub,
    },
    broadcast: {
      emit: unavailableAsync('broadcast.emit'),
      on: noopUnsub,
    },
    storage: {
      get: function () { return Promise.resolve(null); },
      set: unavailableAsync('storage.set'),
      remove: unavailableAsync('storage.remove'),
    },
    files: { available: false },
    capture: { available: false },
    auth: { available: false },
  };

  var current = fallback;

  function registerAdapter(impl) {
    if (!impl || typeof impl !== 'object') {
      WARNINGS.push('registerAdapter called with non-object');
      return false;
    }
    if (current && current.name !== 'fallback') {
      WARNINGS.push('adapter "' + current.name + '" already registered; ignoring "' + (impl.name || 'unknown') + '"');
      return false;
    }
    current = Object.assign({}, fallback, impl);
    current.env = Object.assign({}, fallback.env, impl.env || {});
    /* Re-bind the public surface so existing references keep working. */
    platform.env = current.env;
    platform.messaging = current.messaging;
    platform.broadcast = current.broadcast;
    platform.storage = current.storage;
    platform.files = current.files;
    platform.capture = current.capture;
    platform.auth = current.auth;
    /* Notify listeners that a real adapter is now bound. */
    try {
      if (H2O.events && typeof H2O.events.emit === 'function') {
        H2O.events.emit('evt:h2o:studio:platform:ready', { adapter: current.name, version: current.version });
      } else if (typeof global.dispatchEvent === 'function') {
        global.dispatchEvent(new global.CustomEvent('h2o:studio:platform:ready', { detail: { adapter: current.name, version: current.version } }));
      }
    } catch (e) {
      WARNINGS.push('platform:ready emit failed: ' + (e && e.message ? e.message : String(e)));
    }
    return true;
  }

  function diagnose() {
    var chromeRuntime = false;
    var chromeStorage = false;
    try { chromeRuntime = !!(global.chrome && global.chrome.runtime && global.chrome.runtime.id); } catch (e) { chromeRuntime = false; }
    try { chromeStorage = !!(global.chrome && global.chrome.storage && global.chrome.storage.local); } catch (e) { chromeStorage = false; }

    var broadcastReady = !!(platform.broadcast && platform.broadcast.emit && platform.broadcast.emit !== fallback.broadcast.emit);
    var storageReady = !!(platform.storage && platform.storage.set && platform.storage.set !== fallback.storage.set);
    var messagingReady = !!(platform.messaging && platform.messaging.send && platform.messaging.send !== fallback.messaging.send);
    var selectorsLoaded = !!(H2O.Studio && H2O.Studio.SELECTORS && typeof H2O.Studio.SELECTORS === 'object');

    return {
      adapter: current.name,
      adapterVersion: current.version,
      bootedAt: BOOT_AT,
      ageMs: Date.now() - BOOT_AT,
      chromeRuntime: chromeRuntime,
      chromeStorage: chromeStorage,
      broadcastReady: broadcastReady,
      storageReady: storageReady,
      messagingReady: messagingReady,
      selectorsLoaded: selectorsLoaded,
      warnings: WARNINGS.slice(),
    };
  }

  var platform = {
    __installed: true,
    __registerAdapter: registerAdapter,
    __warn: function (msg) { WARNINGS.push(String(msg)); },
    env: fallback.env,
    messaging: fallback.messaging,
    broadcast: fallback.broadcast,
    storage: fallback.storage,
    files: fallback.files,
    capture: fallback.capture,
    auth: fallback.auth,
    diagnose: diagnose,
  };

  H2O.Studio.platform = platform;
})(typeof window !== 'undefined' ? window : globalThis);
