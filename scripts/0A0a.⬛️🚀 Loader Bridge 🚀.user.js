// ==UserScript==
// @h2o-id             0a0a.loader.bridge
// @name               0A0a.⬛️🚀 Loader Bridge 🚀
// @namespace          H2O.Premium.CGX.loader.bridge
// @author             HumamDev
// @version            1.0.0
// @revision           003
// @build              260509-012939
// @description        Phase 1 measurement infrastructure. Establishes H2O.loader namespace + install-time counters (listeners/observers/intervals/styles) + performance marks. No behavioral changes.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==
//
// 0A0a.⬛️🚀 Loader Bridge — measurement-only V2 infrastructure (Phase 1).
//
// Loaded as the first script in the CORE idle-serial section, before 0A1a H2O Core.
// Establishes window.H2O.loader so subsequent scripts can register self-checks,
// mark functional readiness, request idempotent guards, and (later phases) opt
// into on-demand loading. Wraps install-time global APIs to attribute listener /
// observer / interval / <style> creations to the script that installed them
// (via document.currentScript.dataset.h2oAlias set by the loader).
//
// What this does NOT do:
//   - Does NOT change loading order, event timing, or feature behavior.
//   - Does NOT alter dispatched events or filter listeners.
//   - Does NOT count chatgpt.com's own installs (no h2oAlias on their script tags).
//   - Does NOT interfere if `localStorage.h2oExtDevMeasurementsOff === "1"`.
//
// Devtools usage:
//   H2O.loader.report()    → per-script snapshot sorted by loadMs desc
//   H2O.loader.summary()   → totals + top-N tables
//   H2O.loader.counters()  → raw install-time counters per alias
//   performance.getEntriesByType('mark').filter(e => e.name.startsWith('h2o:'))

(function H2OLoaderBridge() {
  "use strict";

  const W = (typeof window !== "undefined" ? window : globalThis);
  const TAG = "[H2O Loader Bridge]";

  // Idempotency guard — safe even if loaded twice.
  if (W.__H2O_LOADER_BRIDGE_V2__) {
    try { console.info(TAG, "duplicate ignored"); } catch (_) {}
    return;
  }
  W.__H2O_LOADER_BRIDGE_V2__ = true;

  // Opt-out via localStorage. Wrappers stay un-installed; API surface still exposed.
  let MEASURE = true;
  try {
    if (W.localStorage && W.localStorage.getItem("h2oExtDevMeasurementsOff") === "1") {
      MEASURE = false;
    }
  } catch (_) {}

  const STATS_KEY = "h2oExtDevRuntimeStatsV1";
  const ARCHIVE_REQ = "h2o-ext-archive:v1:req";
  const ARCHIVE_RES = "h2o-ext-archive:v1:res";
  const RUNTIME_REFRESH_TIMEOUT_MS = 2000;
  const ALIAS_DATASET_KEY = "h2oAlias";
  const ALIAS_ATTR_RE = /\/([^/?#]+\._[^/?#]+_\.js)(?:\?|#|$)/;

  // ----- Counter store ------------------------------------------------------
  const counters = new Map();
  function ensureCounter(alias) {
    let c = counters.get(alias);
    if (!c) {
      c = { listeners: 0, observers: 0, intervals: 0, styles: 0 };
      counters.set(alias, c);
    }
    return c;
  }
  function inc(alias, key) {
    if (!alias) return;
    const c = ensureCounter(alias);
    c[key] = (c[key] || 0) + 1;
  }

  // Resolve which H2O script is executing right now (synchronous IIFE context).
  // Returns null for chatgpt.com's own scripts and async callbacks.
  function currentAlias() {
    try {
      const D = (typeof document !== "undefined") ? document : null;
      const cs = D && D.currentScript;
      if (!cs) return null;
      const ds = cs.dataset;
      if (ds && ds[ALIAS_DATASET_KEY]) return String(ds[ALIAS_DATASET_KEY]);
      const src = cs.src || "";
      if (src) {
        const m = src.match(ALIAS_ATTR_RE);
        if (m) return m[1];
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  // ----- Self-check + mount + on-demand registries ------------------------
  const selfChecks = new Map();           // alias -> () => { ok, ms?, notes? }
  const mounted = new Map();              // alias -> { ms, ts }
  const onDemand = new Map();             // alias -> openEvent (Phase 4 stub)

  function styleDedupId(alias) {
    return "h2o-style-" + String(alias || "anon").replace(/[^A-Za-z0-9_-]/g, "_");
  }

  // ----- Wrap addEventListener (install-time counter only) ----------------
  if (MEASURE && W.EventTarget && W.EventTarget.prototype && typeof W.EventTarget.prototype.addEventListener === "function") {
    const orig = W.EventTarget.prototype.addEventListener;
    try {
      W.EventTarget.prototype.addEventListener = function _h2oWrappedAEL() {
        try {
          const alias = currentAlias();
          if (alias) inc(alias, "listeners");
        } catch (_) {}
        return orig.apply(this, arguments);
      };
    } catch (e) {
      try { console.warn(TAG, "addEventListener wrap failed", e); } catch (_) {}
    }
  }

  // ----- Wrap MutationObserver (constructor counter) ----------------------
  if (MEASURE && typeof W.MutationObserver === "function") {
    const Orig = W.MutationObserver;
    try {
      const H2OMutationObserver = function H2OMutationObserver(cb) {
        try {
          const alias = currentAlias();
          if (alias) inc(alias, "observers");
        } catch (_) {}
        if (!new.target) {
          // MutationObserver is callable only as constructor; mirror behavior.
          throw new TypeError("Failed to construct 'MutationObserver': Please use the 'new' operator.");
        }
        return new Orig(cb);
      };
      H2OMutationObserver.prototype = Orig.prototype;
      try { Object.defineProperty(H2OMutationObserver, "name", { value: "MutationObserver" }); } catch (_) {}
      W.MutationObserver = H2OMutationObserver;
    } catch (e) {
      try { console.warn(TAG, "MutationObserver wrap failed", e); } catch (_) {}
    }
  }

  // ----- Wrap setInterval (install counter) -------------------------------
  if (MEASURE && typeof W.setInterval === "function") {
    const orig = W.setInterval;
    try {
      W.setInterval = function _h2oWrappedSI() {
        try {
          const alias = currentAlias();
          if (alias) inc(alias, "intervals");
        } catch (_) {}
        return orig.apply(W, arguments);
      };
    } catch (e) {
      try { console.warn(TAG, "setInterval wrap failed", e); } catch (_) {}
    }
  }

  // ----- Wrap document.createElement to count <style> installs -----------
  if (MEASURE && W.Document && W.Document.prototype && typeof W.Document.prototype.createElement === "function") {
    const orig = W.Document.prototype.createElement;
    try {
      W.Document.prototype.createElement = function _h2oWrappedCE(tagName) {
        try {
          if (typeof tagName === "string" && tagName.length === 5 && tagName.toLowerCase() === "style") {
            const alias = currentAlias();
            if (alias) inc(alias, "styles");
          }
        } catch (_) {}
        return orig.apply(this, arguments);
      };
    } catch (e) {
      try { console.warn(TAG, "createElement wrap failed", e); } catch (_) {}
    }
  }

  // ----- Read loader timing samples from localStorage --------------------
  function readSamples() {
    try {
      if (!W.localStorage) return [];
      const raw = W.localStorage.getItem(STATS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.samples)) return parsed.samples;
      return [];
    } catch (_) {
      return [];
    }
  }

  function latestPerAlias(samples) {
    const m = new Map();
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const a = s && s.aliasId;
      if (!a) continue;
      const prev = m.get(a);
      if (!prev || (Number(s.ts) || 0) > (Number(prev.ts) || 0)) m.set(a, s);
    }
    return m;
  }

  let runtimeStatsCache = {};
  let runtimeStatsCacheAt = 0;
  let runtimeStatsLastError = "";
  let loaderDiagCache = {
    pageStartedAt: null,
    phaseOnDemand: {},
    onDemandState: {},
    currentPageLoads: {},
  };
  let loaderDiagCacheAt = 0;
  let loaderDiagLastError = "";

  function plainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function normalizeRuntimeStatsMap(raw) {
    const out = {};
    if (!plainObject(raw)) return out;
    for (const entry of Object.entries(raw)) {
      const aliasId = String(entry[0] || "").trim();
      const src = plainObject(entry[1]) ? entry[1] : null;
      if (!aliasId || !src) continue;
      const loads = Number(src.loads);
      const failures = Number(src.failures);
      const lastSeen = Number(src.lastSeen);
      const ts = Number(src.ts);
      const lastLoadMs = Number(src.lastLoadMs);
      const ewmaLoadMs = Number(src.ewmaLoadMs);
      const lastHeapDeltaBytes = Number(src.lastHeapDeltaBytes);
      out[aliasId] = {
        loads: Number.isFinite(loads) ? Math.max(0, Math.floor(loads)) : 0,
        failures: Number.isFinite(failures) ? Math.max(0, Math.floor(failures)) : 0,
        phase: String(src.lastPhase || src.phase || ""),
        lastPhase: String(src.lastPhase || src.phase || ""),
        lastLoadMs: Number.isFinite(lastLoadMs) ? lastLoadMs : 0,
        ewmaLoadMs: Number.isFinite(ewmaLoadMs) ? ewmaLoadMs : 0,
        lastSeen: Number.isFinite(lastSeen) ? Math.max(0, Math.floor(lastSeen)) : 0,
        ts: Number.isFinite(ts) ? Math.max(0, Math.floor(ts)) : 0,
        lastHeapDeltaBytes: Number.isFinite(lastHeapDeltaBytes) ? lastHeapDeltaBytes : 0,
        heapSupported: src.heapSupported !== false,
      };
    }
    return out;
  }

  function runtimeEntryToSample(entry) {
    if (!plainObject(entry)) return null;
    const loads = Number(entry.loads) || 0;
    const failures = Number(entry.failures) || 0;
    const lastLoadMs = Number(entry.lastLoadMs);
    const ewmaLoadMs = Number(entry.ewmaLoadMs);
    const loadMs = (Number.isFinite(lastLoadMs) && lastLoadMs > 0)
      ? lastLoadMs
      : ((Number.isFinite(ewmaLoadMs) && ewmaLoadMs > 0) ? ewmaLoadMs : null);
    return {
      phase: String(entry.lastPhase || entry.phase || ""),
      ok: loads > 0 ? true : (failures > 0 ? false : null),
      loadMs,
      heapDeltaBytes: Number.isFinite(Number(entry.lastHeapDeltaBytes)) ? Number(entry.lastHeapDeltaBytes) : 0,
      heapSupported: entry.heapSupported !== false,
      ts: Number(entry.lastSeen || entry.ts) || null,
    };
  }

  function runtimeRefreshTimeoutMs(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return RUNTIME_REFRESH_TIMEOUT_MS;
    return Math.max(250, Math.min(10000, Math.floor(n)));
  }

  function normalizeLoaderDiagSnapshot(raw) {
    const src = plainObject(raw) ? raw : {};
    const phaseOnDemand = {};
    const onDemandState = {};
    const currentPageLoads = {};
    for (const entry of Object.entries(plainObject(src.phaseOnDemand) ? src.phaseOnDemand : {})) {
      const aliasId = String(entry[0] || "").trim();
      const meta = plainObject(entry[1]) ? entry[1] : {};
      if (!aliasId) continue;
      phaseOnDemand[aliasId] = {
        tier: String(meta.tier || ""),
        openEvent: String(meta.openEvent || ""),
      };
    }
    for (const entry of Object.entries(plainObject(src.onDemandState) ? src.onDemandState : {})) {
      const aliasId = String(entry[0] || "").trim();
      if (!aliasId) continue;
      onDemandState[aliasId] = String(entry[1] || "");
    }
    for (const entry of Object.entries(plainObject(src.currentPageLoads) ? src.currentPageLoads : {})) {
      const aliasId = String(entry[0] || "").trim();
      const meta = plainObject(entry[1]) ? entry[1] : {};
      if (!aliasId) continue;
      currentPageLoads[aliasId] = {
        phase: String(meta.phase || ""),
        ok: meta.ok === true ? true : (meta.ok === false ? false : null),
        loadMs: Number.isFinite(Number(meta.loadMs)) ? Number(meta.loadMs) : null,
        ts: Number.isFinite(Number(meta.ts)) ? Math.floor(Number(meta.ts)) : null,
      };
    }
    return {
      pageStartedAt: Number(src.pageStartedAt) || null,
      phaseOnDemand,
      onDemandState,
      currentPageLoads,
    };
  }

  function callLoaderDiag(timeoutMs) {
    return new Promise((resolve) => {
      const id = "h2o-loader-diag-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
      let done = false;
      let timer = 0;
      const finish = (value) => {
        if (done) return;
        done = true;
        try { if (timer) W.clearTimeout(timer); } catch (_) {}
        try { W.removeEventListener("message", onMessage, false); } catch (_) {}
        resolve(value);
      };
      const onMessage = (ev) => {
        if (ev.source !== W) return;
        const data = ev.data;
        if (!plainObject(data) || data.type !== ARCHIVE_RES || String(data.id || "") !== id) return;
        finish(data);
      };
      try {
        W.addEventListener("message", onMessage, false);
        timer = W.setTimeout(() => {
          finish({ ok: false, error: "refreshLoaderDiag timeout after " + timeoutMs + "ms" });
        }, timeoutMs);
        W.postMessage({
          type: ARCHIVE_REQ,
          id,
          req: { op: "__loaderDiag", payload: {} },
          timeoutMs,
        }, "*");
      } catch (e) {
        finish({ ok: false, error: String((e && e.message) || e || "refreshLoaderDiag bridge failed") });
      }
    });
  }

  function callLoaderRuntimeStats(timeoutMs) {
    return new Promise((resolve) => {
      const id = "h2o-loader-runtime-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
      let done = false;
      let timer = 0;
      const finish = (value) => {
        if (done) return;
        done = true;
        try { if (timer) W.clearTimeout(timer); } catch (_) {}
        try { W.removeEventListener("message", onMessage, false); } catch (_) {}
        resolve(value);
      };
      const onMessage = (ev) => {
        if (ev.source !== W) return;
        const data = ev.data;
        if (!plainObject(data) || data.type !== ARCHIVE_RES || String(data.id || "") !== id) return;
        finish(data);
      };
      try {
        W.addEventListener("message", onMessage, false);
        timer = W.setTimeout(() => {
          finish({ ok: false, error: "refreshRuntimeStats timeout after " + timeoutMs + "ms" });
        }, timeoutMs);
        W.postMessage({
          type: ARCHIVE_REQ,
          id,
          req: { op: "__loaderRuntimeStats", payload: {} },
          timeoutMs,
        }, "*");
      } catch (e) {
        finish({ ok: false, error: String((e && e.message) || e || "refreshRuntimeStats bridge failed") });
      }
    });
  }

  async function refreshRuntimeStats(options) {
    const timeoutMs = runtimeRefreshTimeoutMs(plainObject(options) ? options.timeoutMs : options);
    const res = await callLoaderRuntimeStats(timeoutMs);
    const result = plainObject(res && res.result) ? res.result : {};
    if (res && res.ok === true && result.ok === true && plainObject(result.stats)) {
      runtimeStatsCache = normalizeRuntimeStatsMap(result.stats);
      runtimeStatsCacheAt = Number(result.at) || Date.now();
      runtimeStatsLastError = "";
      return {
        ok: true,
        count: Object.keys(runtimeStatsCache).length,
        at: runtimeStatsCacheAt,
      };
    }
    runtimeStatsLastError = String((res && (res.error || result.error)) || "refreshRuntimeStats failed");
    return {
      ok: false,
      error: runtimeStatsLastError,
      count: Object.keys(runtimeStatsCache).length,
      at: runtimeStatsCacheAt,
    };
  }

  async function refreshLoaderDiag(options) {
    const timeoutMs = runtimeRefreshTimeoutMs(plainObject(options) ? options.timeoutMs : options);
    const res = await callLoaderDiag(timeoutMs);
    const result = plainObject(res && res.result) ? res.result : {};
    if (res && res.ok === true && result.ok === true && plainObject(result.diag)) {
      loaderDiagCache = normalizeLoaderDiagSnapshot(result.diag);
      loaderDiagCacheAt = Number(result.at) || Date.now();
      loaderDiagLastError = "";
      return {
        ok: true,
        at: loaderDiagCacheAt,
        countPhaseOnDemand: Object.keys(loaderDiagCache.phaseOnDemand).length,
        countOnDemandState: Object.keys(loaderDiagCache.onDemandState).length,
        countCurrentPageLoads: Object.keys(loaderDiagCache.currentPageLoads).length,
      };
    }
    loaderDiagLastError = String((res && (res.error || result.error)) || "refreshLoaderDiag failed");
    return {
      ok: false,
      error: loaderDiagLastError,
      at: loaderDiagCacheAt,
      countPhaseOnDemand: Object.keys(loaderDiagCache.phaseOnDemand).length,
      countOnDemandState: Object.keys(loaderDiagCache.onDemandState).length,
      countCurrentPageLoads: Object.keys(loaderDiagCache.currentPageLoads).length,
    };
  }

  // ----- Public H2O.loader API -------------------------------------------
  const H2O = (W.H2O = W.H2O || {});
  if (H2O.loader && Number(H2O.loader.version) === 2) {
    try { console.info(TAG, "H2O.loader v2 already present"); } catch (_) {}
    return;
  }
  H2O.loader = H2O.loader || {};

  Object.assign(H2O.loader, {
    version: 2,
    measure: MEASURE,

    registerSelfCheck(alias, fn) {
      if (!alias || typeof fn !== "function") return false;
      selfChecks.set(String(alias), fn);
      return true;
    },

    markMount(alias) {
      if (!alias) return;
      const ms = (W.performance && typeof W.performance.now === "function") ? W.performance.now() : 0;
      mounted.set(String(alias), { ms, ts: Date.now() });
      try {
        if (W.performance && typeof W.performance.mark === "function") {
          W.performance.mark("h2o:mount:" + alias);
        }
      } catch (_) {}
    },

    // Phase 3: single-flight Promise that resolves once the document is past
    // 'loading' and two requestAnimationFrame ticks have elapsed. Intended as
    // a defensive "wait for first paint to settle" hook for L2-style mounts
    // that want to avoid flicker. Not the same as "chat content is ready" —
    // for that, callers should additionally `await H2O.obs.chatRootObserved()`.
    // Memoized: every caller after the first gets the same Promise.
    firstPaintReady: (() => {
      let _promise = null;
      return function firstPaintReady() {
        if (_promise) return _promise;
        _promise = new Promise((resolve) => {
          const proceed = () => {
            const raf = (typeof W.requestAnimationFrame === "function")
              ? W.requestAnimationFrame.bind(W)
              : (cb) => setTimeout(cb, 16);
            raf(() => raf(() => {
              try {
                if (W.performance && typeof W.performance.mark === "function") {
                  W.performance.mark("h2o:firstPaintReady");
                }
              } catch (_) {}
              resolve();
            }));
          };
          if (typeof document !== "undefined" && document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", proceed, { once: true });
          } else {
            proceed();
          }
        });
        return _promise;
      };
    })(),

    registerOnDemand(alias, openEvent) {
      // Phase 4 Step 5c: Bridge-side on-demand registration.
      //
      // The Bridge does NOT inject scripts directly (that would lose the
      // content-script CSP-bypass that the loader has). Instead it:
      //   1. Records the (alias, openEvent) pair in `onDemand` for diagnostic
      //      visibility via H2O.loader.onDemandRegistry() and per-alias via
      //      H2O.loader.report() (existing behavior — preserved).
      //   2. Subscribes to `openEvent` on `window`. When fired, dispatches
      //      `evt:h2o:loader:on-demand-load` with `{ aliasId }`. The
      //      loader's V2-flag-gated listener (Phase 4 Step 5b) picks this
      //      up and runs the actual `<script>` injection in the privileged
      //      isolated-world context.
      //
      // Replay-safety: if H2O.events.onReady is available (Phase 4 Step 4),
      // we use it instead of raw addEventListener. For *:ready / *-ready
      // openEvents, this means a late `registerOnDemand` call still triggers
      // an on-demand load using the cached ready-value. For :open / generic
      // events, onReady transparently degrades to addEventListener (the
      // replay cache predicate doesn't match those names, so onReady just
      // subscribes to future fires — same as a plain listener would).
      //
      // V1 impact: this code only RUNS when a script calls registerOnDemand.
      // No tabs are migrated in this batch (loader-tiers.json has no L5
      // entries), so no script calls registerOnDemand, so no addEventListener
      // is installed at boot. V1 behavior is unchanged.
      if (!alias || !openEvent) return false;
      const aliasId = String(alias);
      const evtName = String(openEvent);

      // Idempotency. Same alias+event registered twice → no-op (succeeds).
      // Same alias with a DIFFERENT event → keep the first registration and
      // warn (avoids ambiguity about which event triggers the load).
      const existing = onDemand.get(aliasId);
      if (existing === evtName) return true;
      if (existing) {
        try { console.warn(TAG, "registerOnDemand: alias already registered for", existing, "— ignoring new event", evtName, "for", aliasId); } catch (_) {}
        return false;
      }

      onDemand.set(aliasId, evtName);

      const handler = () => {
        try {
          W.dispatchEvent(new CustomEvent("evt:h2o:loader:on-demand-load", {
            detail: { aliasId },
          }));
        } catch (e) {
          try { console.warn(TAG, "registerOnDemand: dispatch threw", aliasId, e); } catch (_) {}
        }
      };

      let installed = false;
      try {
        const onReadyFn = (W && W.H2O && W.H2O.events && W.H2O.events.onReady) || null;
        if (typeof onReadyFn === "function") {
          // onReady returns an unsubscribe fn; we don't store it because
          // there is no unregister API and the registry is module-scoped.
          onReadyFn(evtName, handler);
          installed = true;
        }
      } catch (_) {}
      if (!installed) {
        try { W.addEventListener(evtName, handler, false); installed = true; } catch (_) {}
      }
      return installed;
    },

    guard(alias, fn) {
      if (!alias || typeof fn !== "function") return false;
      const key = "__H2O_GUARD__" + String(alias);
      if (W[key]) return false;
      W[key] = true;
      try { fn(); return true; }
      catch (e) {
        try { console.error(TAG, "guard fn threw", alias, e); } catch (_) {}
        return false;
      }
    },

    mount(el, parent) {
      if (!el) return;
      const target = parent || (typeof document !== "undefined" ? (document.body || document.documentElement) : null);
      if (!target) return;
      const raf = (typeof W.requestAnimationFrame === "function")
        ? W.requestAnimationFrame.bind(W)
        : function (cb) { return setTimeout(cb, 16); };
      raf(function () {
        raf(function () {
          try { target.appendChild(el); }
          catch (e) {
            try { console.error(TAG, "mount append failed", e); } catch (_) {}
          }
        });
      });
    },

    injectStyle(alias, css) {
      try {
        const id = styleDedupId(alias);
        const existing = document.getElementById(id);
        if (existing) {
          if (existing.textContent !== String(css || "")) existing.textContent = String(css || "");
          return existing;
        }
        const s = document.createElement("style");
        s.id = id;
        if (alias) s.setAttribute("data-h2o-alias", String(alias));
        s.textContent = String(css || "");
        const head = document.head || document.documentElement;
        if (head) head.appendChild(s);
        return s;
      } catch (e) {
        try { console.error(TAG, "injectStyle failed", alias, e); } catch (_) {}
        return null;
      }
    },

    counters() {
      const out = {};
      for (const entry of counters) out[entry[0]] = Object.assign({}, entry[1]);
      return out;
    },

    onDemandRegistry() {
      const out = {};
      for (const entry of onDemand) out[entry[0]] = entry[1];
      return out;
    },

    refreshRuntimeStats,
    refreshLoaderDiag,

    runtimeStatsCacheInfo() {
      return {
        count: Object.keys(runtimeStatsCache).length,
        at: runtimeStatsCacheAt,
        lastError: runtimeStatsLastError,
      };
    },

    loaderDiagCacheInfo() {
      return {
        pageStartedAt: loaderDiagCache.pageStartedAt,
        at: loaderDiagCacheAt,
        lastError: loaderDiagLastError,
        countPhaseOnDemand: Object.keys(loaderDiagCache.phaseOnDemand).length,
        countOnDemandState: Object.keys(loaderDiagCache.onDemandState).length,
        countCurrentPageLoads: Object.keys(loaderDiagCache.currentPageLoads).length,
      };
    },

    report() {
      const samples = readSamples();
      const latest = latestPerAlias(samples);
      const loaderDiag = loaderDiagCache;
      const aliases = new Set();
      for (const a of latest.keys()) aliases.add(a);
      for (const a of Object.keys(runtimeStatsCache)) aliases.add(a);
      for (const a of counters.keys()) aliases.add(a);
      for (const a of mounted.keys()) aliases.add(a);
      for (const a of selfChecks.keys()) aliases.add(a);
      for (const a of onDemand.keys()) aliases.add(a);
      for (const a of Object.keys(loaderDiag.phaseOnDemand)) aliases.add(a);
      for (const a of Object.keys(loaderDiag.onDemandState)) aliases.add(a);
      for (const a of Object.keys(loaderDiag.currentPageLoads)) aliases.add(a);

      const out = [];
      for (const alias of aliases) {
        const cached = runtimeEntryToSample(runtimeStatsCache[alias]);
        const historical = cached || latest.get(alias) || {};
        const currentPage = plainObject(loaderDiag.currentPageLoads[alias]) ? loaderDiag.currentPageLoads[alias] : null;
        const s = currentPage || historical;
        const c = counters.get(alias) || {};
        const m = mounted.get(alias) || null;
        const bridgeOnDemandFor = onDemand.get(alias) || null;
        const catalog = plainObject(loaderDiag.phaseOnDemand[alias]) ? loaderDiag.phaseOnDemand[alias] : null;
        const currentPageOnDemandState = loaderDiag.onDemandState[alias] || null;
        let sampleSource = "none";
        if (currentPage) sampleSource = "current-page";
        else if (historical && (
          typeof historical.ok === "boolean"
          || typeof historical.loadMs === "number"
          || historical.ts
        )) sampleSource = "historical";
        let sc = null;
        const fn = selfChecks.get(alias);
        if (typeof fn === "function") {
          try { sc = fn(); }
          catch (e) { sc = { ok: false, error: String((e && e.message) || e) }; }
        }
        out.push({
          aliasId: alias,
          phase: s.phase || null,
          ok: typeof s.ok === "boolean" ? s.ok : null,
          loadMs: typeof s.loadMs === "number" ? s.loadMs : null,
          heapDeltaBytes: typeof s.heapDeltaBytes === "number" ? s.heapDeltaBytes : 0,
          heapSupported: !!s.heapSupported,
          loadedAt: s.ts || null,
          historicalOk: typeof historical.ok === "boolean" ? historical.ok : null,
          historicalLoadMs: typeof historical.loadMs === "number" ? historical.loadMs : null,
          historicalLoadedAt: historical.ts || null,
          currentPageOk: currentPage && typeof currentPage.ok === "boolean" ? currentPage.ok : null,
          currentPageLoadMs: currentPage && typeof currentPage.loadMs === "number" ? currentPage.loadMs : null,
          currentPageLoadedAt: currentPage && currentPage.ts ? currentPage.ts : null,
          currentPageLoaded: !!currentPage,
          sampleSource,
          catalogTier: catalog ? (catalog.tier || null) : null,
          catalogOpenEvent: catalog ? (catalog.openEvent || null) : null,
          catalogOnDemandEligible: !!catalog,
          bridgeOnDemandFor,
          currentPageOnDemandState,
          mountedMs: m ? m.ms : null,
          mountedAt: m ? m.ts : null,
          listeners: c.listeners || 0,
          observers: c.observers || 0,
          intervals: c.intervals || 0,
          styles: c.styles || 0,
          selfCheck: sc,
          onDemandFor: bridgeOnDemandFor,
        });
      }

      out.sort(function (a, b) {
        return (Number(b.loadMs) || 0) - (Number(a.loadMs) || 0);
      });
      return out;
    },

    summary() {
      const r = H2O.loader.report();
      const totals = {
        scripts: r.length,
        loadedOk: r.filter(function (e) { return e.ok === true; }).length,
        loadedFail: r.filter(function (e) { return e.ok === false; }).length,
        totalLoadMs: r.reduce(function (s, e) { return s + (e.loadMs || 0); }, 0),
        totalListeners: r.reduce(function (s, e) { return s + (e.listeners || 0); }, 0),
        totalObservers: r.reduce(function (s, e) { return s + (e.observers || 0); }, 0),
        totalIntervals: r.reduce(function (s, e) { return s + (e.intervals || 0); }, 0),
        totalStyles: r.reduce(function (s, e) { return s + (e.styles || 0); }, 0),
        slowest: r.slice(0, 10).map(function (e) { return { aliasId: e.aliasId, loadMs: e.loadMs }; }),
        topListeners: r.slice().sort(function (a, b) { return (b.listeners || 0) - (a.listeners || 0); }).slice(0, 10).map(function (e) { return { aliasId: e.aliasId, listeners: e.listeners }; }),
        topObservers: r.slice().sort(function (a, b) { return (b.observers || 0) - (a.observers || 0); }).slice(0, 10).map(function (e) { return { aliasId: e.aliasId, observers: e.observers }; }),
      };
      return totals;
    },
  });

  try {
    if (W.performance && typeof W.performance.mark === "function") {
      W.performance.mark("h2o:bridge:ready");
    }
  } catch (_) {}

  try { console.log(TAG, "v2 ready", { measure: MEASURE }); } catch (_) {}
})();
