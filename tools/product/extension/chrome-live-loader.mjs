// @version 1.1.0
export function makeChromeLiveLoaderJs({
  DEV_TAG,
  DEV_TITLE,
  DEV_HAS_CONTROLS,
  PROXY_PACK_URL,
  DEV_SCRIPT_CATALOG,
  DEV_ORDER_SECTIONS_SNAPSHOT,
  LOADER_DEPS_SNAPSHOT,
  STORAGE_KEY,
  STORAGE_ORDER_OVERRIDES_KEY,
  PAGE_FOLDER_BRIDGE_FILE,
  PAGE_PILOT_OBSERVER_FILE,
}) {
  return `(() => {
  "use strict";

  const TAG = ${JSON.stringify(DEV_TAG)};
  // Loader build marker — interpolated at template build time so each rebuild gets a fresh
  // timestamp. Use H2O.archiveBoot._getExtensionBridge().__loaderInfo() from a page console
  // to confirm the active loader.js, or look at the page-archive-bridge ready log.
  const LOADER_BUILD_TS = ${Date.now()};
  const LOADER_BUILD_ISO = ${JSON.stringify(new Date().toISOString())};
  const LOADER_LIBRARY_KV_OPS = true;
  const STATUS_LABEL = ${JSON.stringify(DEV_TITLE)};
  const LOADER_INSTANCE_KEY = "__H2O_EXT_DEV_CTRL_LOADER_V1__";
  if (globalThis[LOADER_INSTANCE_KEY]?.active) {
    try { console.info(TAG, "duplicate loader ignored", location.href); } catch {}
    return;
  }
  const PAGE_STARTED_AT = Date.now();
  const loaderDiagState = {
    pageStartedAt: PAGE_STARTED_AT,
    phaseOnDemand: {},
    onDemandState: {},
    currentPageLoads: {},
  };

  // ─── Loader V2.1 diagnostics (gated on H2O_LOADER_V3_DIAG=1) ─────────────
  // Pseudo-wave recorder. Captures per-script dispatch/settle timings, lane
  // assignment, best-effort wait reasons, phase timings, and wave timings.
  // When the flag is OFF, every recordV3* helper short-circuits to a no-op
  // and zero state is allocated beyond this small object. The full
  // H2O.scheduler.report() is computed only when callers request it via the
  // postMessage __schedulerReport op (handled later in this file).
  let V3_DIAG_ENABLED = false;
  try {
    V3_DIAG_ENABLED = (typeof localStorage !== "undefined")
      && (localStorage.getItem("H2O_LOADER_V3_DIAG") === "1");
  } catch (_) { V3_DIAG_ENABLED = false; }
  // Loader V3 Phase 1 — pure-prediction wave-diag flag. When OFF,
  // v3PredictReport() returns null and the report.predictedV3 field is null.
  // When ON, v3PredictReport() simulates V3 tier/wave dispatch using
  // current metadata + V2.5 observed durations from v3Diag.scripts. Behavior
  // is read-only — no runtime dispatch change either way.
  let V3_WAVE_DIAG_ENABLED = false;
  try {
    V3_WAVE_DIAG_ENABLED = (typeof localStorage !== "undefined")
      && (localStorage.getItem("H2O_LOADER_V3_WAVE_DIAG") === "1");
  } catch (_) { V3_WAVE_DIAG_ENABLED = false; }

  // ─── Loader V3 Phase 3-pilot: shadow dispatcher observer ──────────────
  // Behind localStorage.H2O_LOADER_V3_DISPATCHER_PILOT === "1". Pure
  // observation: when the flag is OFF, this block costs only a flag read.
  //
  // Architecture: the loader runs in the content-script isolated world; H2O
  // (and H2O.events.onReady) live in the page world. We bridge by injecting
  // an inline page-world <script> that subscribes to the 10 wave-exit ready
  // events (9 required + 1 conditional) and posts the firedAtMs back to the
  // loader via window.postMessage. The loader accumulates observations and
  // synthesizes pilotPlan via computePilotPlan() from v3GetReport().
  //
  // Per P3c finding: evt:h2o:inputdock:ready is conditional/nullable. We
  // record null when it never fires; we do NOT emit a synthetic event.
  // V3.1 dispatcher flags (read once at IIFE entry; default OFF).
  // Active dispatcher implies the pilot observer must also install (we reuse
  // the WAR observer's H2O_PILOT_OBS_v1 message stream to wait for wave-exit
  // events). When MODE != "active", V2.x runs byte-identical to today.
  let V3_DISPATCHER_MODE = "off";
  let V3_DISPATCHER_TIERS = "L0L1";
  let V3_DISPATCHER_KILL = false;
  try {
    if (typeof localStorage !== "undefined") {
      V3_DISPATCHER_MODE = String(localStorage.getItem("H2O_LOADER_V3_DISPATCHER_MODE") || "off");
      V3_DISPATCHER_TIERS = String(localStorage.getItem("H2O_LOADER_V3_DISPATCHER_TIERS") || "L0L1");
      V3_DISPATCHER_KILL = (localStorage.getItem("H2O_LOADER_V3_DISPATCHER_KILL") === "1");
    }
  } catch (_) { /* keep defaults */ }
  const V3_DISPATCHER_ACTIVE = (V3_DISPATCHER_MODE === "active") && !V3_DISPATCHER_KILL;

  let V3_PILOT_ENABLED = false;
  try {
    const pilotFlag = (typeof localStorage !== "undefined")
      && (localStorage.getItem("H2O_LOADER_V3_DISPATCHER_PILOT") === "1");
    // Auto-enable observer when the dispatcher is active — the dispatcher
    // needs the WAR observer's postMessage stream to wait on wave-exit events
    // via PILOT.observedReadyEvents. When DISPATCHER_ACTIVE alone is set
    // (without the explicit pilot flag), the observer still installs and the
    // pilotPlan still populates so dispatcherWaveResult is visible.
    V3_PILOT_ENABLED = pilotFlag || V3_DISPATCHER_ACTIVE;
  } catch (_) { V3_PILOT_ENABLED = false; }

  // Required wave-exit events (Phase 3 audit; revised after L3 investigation).
  //
  // Required = the V3 dispatcher MUST gate the next wave on these. Failure to
  // fire any required event indicates a real boot regression.
  //
  // Theme excluded from L2 required: can fire very late (observed up to ~24s)
  // due to async storage + skin DOM probes. Reclassified as optionalAesthetic.
  //
  // L3 (Dock Panel + Workspace Core) excluded from required entirely after the
  // L3 investigation: both surfaces gate their own ready emission on UI/route
  // conditions. 3A1a CORE_DP_boot wraps emit inside CORE_DP_whenUiSafe(...)
  // which never resolves on pages without the expected sidebar/composer shell.
  // 3Z2a Workspace Core re-emits per-chat-route boot; non-chat URLs may not
  // produce an emit. Reclassified as optionalRouteAware. The dispatcher should
  // NOT gate L3 wave dispatch on these — they're "surface is now usable on
  // this route" signals, not foundational gates.
  const PILOT_WAVE_EXIT_REQUIRED = {
    L0: ["evt:h2o:core:ready", "evt:h2o:obs:ready"],
    L1: ["evt:h2o:data:ready", "h2o:identity:ready"],
    L2: [
      "h2o.ev:prm:cgx:cntrlhb:ready:v1",
      "evt:h2o:minimap:engine-ready",
      "h2o.ev:prm:cgx:lib:ready:v1",
      "h2o.ev:prm:cgx:sap:ready:v1",
    ],
  };
  // Aesthetic / non-blocking signals. Observed but NOT counted toward
  // wave-exit completion or "predicted dispatcher end" computations.
  const PILOT_OPTIONAL_AESTHETIC = ["evt:h2o:theme:ready"];
  // Route-aware surfaces. Their boot is gated on UI/route conditions; missing
  // them on a given page is NOT a failure. Observed for advisory reporting.
  const PILOT_OPTIONAL_ROUTE_AWARE = {
    L3: ["h2o:dpanel:ready", "h2o:wrkspc:ready"],
  };
  // Conditional surfaces (per P3c finding). Observed; nullable.
  const PILOT_WAVE_EXIT_OPTIONAL = {
    L4: ["evt:h2o:inputdock:ready"], // composer-anchored
  };
  const PILOT_SURFACE_MAP = {
    library:     "h2o.ev:prm:cgx:lib:ready:v1",
    sideActions: "h2o.ev:prm:cgx:sap:ready:v1",
    controlHub:  "h2o.ev:prm:cgx:cntrlhb:ready:v1",
    minimap:     "evt:h2o:minimap:engine-ready",
    theme:       "evt:h2o:theme:ready",
    dockPanel:   "h2o:dpanel:ready",
    workspace:   "h2o:wrkspc:ready",
    inputDock:   "evt:h2o:inputdock:ready", // nullable
  };
  const PILOT_MSG_TYPE = "H2O_PILOT_OBS_v1";
  const PILOT_INSTALL_ERROR_EV = "__pilot_install_error__";
  const PILOT_INSTALL_OK_EV = "__pilot_install_ok__";
  const PILOT_OBSERVER_FILE = ${JSON.stringify(PAGE_PILOT_OBSERVER_FILE || "")};

  const PILOT = {
    enabled: V3_PILOT_ENABLED,
    observedReadyEvents: {},
    // Lifecycle/health flags — exposed in pilotPlan so callers can distinguish
    // "no events fired" (legitimate sparse boot) from "observer never installed"
    // (CSP block, network error, missing WAR file, etc.).
    observerInstalled: false,   // true once the page-side observer posts
                                 // PILOT_INSTALL_OK_EV (proves H2O.events.onReady
                                 // was available AND subscriptions succeeded).
    observerBlocked: false,     // true if the WAR script onerror fires (CSP block,
                                 // 404, etc.) OR install timeout elapses.
    installError: null,         // string when something went wrong; null otherwise
    installStartMs: null,
    installEndMs: null,
    // Diagnostic fields (exposed in pilotPlan to investigate why the observer
    // didn't install — e.g. CSP blocks the WAR URL silently, document_start
    // is too early to append a script under <html> before <head> exists, etc.)
    injectedScriptPresent: false,    // we successfully called host.appendChild
    injectedScriptSrc: null,         // the chrome.runtime.getURL() result
    chromeRuntimeGetUrlResult: null, // separate from injectedScriptSrc to record
                                      // even when getURL throws or returns falsy
    chromeRuntimeGetUrlError: null,  // error message if getURL threw
    scriptOnloadSeen: false,         // <script>.onload fired
    scriptOnerrorSeen: false,        // <script>.onerror fired
    injectionDocReadyState: null,    // document.readyState at injection time
    injectionDeferred: false,        // true if we waited for DOMContentLoaded
    postMessageCount: 0,             // total H2O_PILOT_OBS_v1 messages received
    lastPilotMessageType: null,      // last 'ev' field seen
    installTimeoutMs: 8000,          // bumped from 3000 for diagnostic headroom
  };

  if (V3_PILOT_ENABLED) {
    // Initialize pending state for every observed event:
    //   required (L0-L2) + aesthetic (theme) + routeAware (L3) + conditional (L4 inputDock)
    const _pilotAllEvents = [];
    for (const list of Object.values(PILOT_WAVE_EXIT_REQUIRED)) {
      for (const ev of list) _pilotAllEvents.push(ev);
    }
    for (const ev of PILOT_OPTIONAL_AESTHETIC) _pilotAllEvents.push(ev);
    for (const list of Object.values(PILOT_OPTIONAL_ROUTE_AWARE)) {
      for (const ev of list) _pilotAllEvents.push(ev);
    }
    for (const list of Object.values(PILOT_WAVE_EXIT_OPTIONAL)) {
      for (const ev of list) _pilotAllEvents.push(ev);
    }
    for (const ev of _pilotAllEvents) {
      PILOT.observedReadyEvents[ev] = null;
    }

    // Loader-side listener for postMessages from the page-world observer.
    try {
      window.addEventListener("message", function (e) {
        const data = e && e.data;
        if (!data || data.type !== PILOT_MSG_TYPE) return;
        PILOT.postMessageCount += 1;
        const ev = String(data.ev || "");
        PILOT.lastPilotMessageType = ev || "(empty)";
        if (!ev) return;
        if (ev === PILOT_INSTALL_OK_EV) {
          PILOT.observerInstalled = true;
          return;
        }
        if (ev === PILOT_INSTALL_ERROR_EV) {
          if (PILOT.installError == null) {
            PILOT.installError = String(data.source || "page-observer install failed");
          }
          PILOT.observerBlocked = true;
          return;
        }
        if (!Object.prototype.hasOwnProperty.call(PILOT.observedReadyEvents, ev)) return;
        // Record only the first observation per event.
        if (PILOT.observedReadyEvents[ev] !== null) return;
        const firedAtMs = (typeof data.firedAtMs === "number" && isFinite(data.firedAtMs))
          ? Math.round(data.firedAtMs) : null;
        if (firedAtMs == null) return;
        PILOT.observedReadyEvents[ev] = {
          firedAtMs: firedAtMs,
          source: String(data.source || "page-observer"),
        };
      }, false);
    } catch (e) {
      PILOT.installError = "loader-side message listener failed: " + (e && e.message);
      PILOT.observerBlocked = true;
    }

    // Inject the page-world observer via web_accessible_resource (CSP-safe).
    //
    // Earlier failure mode (rev1): inline textContent injection blocked by
    // ChatGPT CSP. Fixed via WAR file.
    //
    // Earlier failure mode (rev2): WAR file injected at document_start, but
    // <head>/<body> didn't exist yet. Appending to documentElement before
    // head exists left the script tag in DOM-limbo — neither onload nor
    // onerror fired within the watchdog window. Fixed by deferring injection
    // until at least DOMContentLoaded (or immediately if doc already past
    // loading state).
    //
    // The two-step "appendInjection" closure also records diagnostics so a
    // future failure can be diagnosed from pilotPlan alone.
    function appendObserverScript() {
      try {
        if (!PILOT_OBSERVER_FILE) {
          throw new Error("PAGE_PILOT_OBSERVER_FILE not set in build context");
        }
        const sEl = document.createElement("script");
        sEl.type = "text/javascript";
        sEl.async = false;
        sEl.id = "h2o-ext-pilot-observer";
        try { sEl.dataset.h2oPilot = "v1"; } catch (_) {}
        try {
          const url = chrome.runtime.getURL(PILOT_OBSERVER_FILE);
          PILOT.chromeRuntimeGetUrlResult = url;
          sEl.src = url;
          PILOT.injectedScriptSrc = url;
        } catch (e) {
          PILOT.chromeRuntimeGetUrlError = "chrome.runtime.getURL failed: " + (e && e.message);
          throw new Error(PILOT.chromeRuntimeGetUrlError);
        }
        PILOT.installStartMs = (typeof performance !== "undefined" && performance.now)
          ? performance.now() : Date.now();
        sEl.addEventListener("load", function () {
          PILOT.scriptOnloadSeen = true;
          PILOT.installEndMs = (typeof performance !== "undefined" && performance.now)
            ? performance.now() : Date.now();
          // observerInstalled flips to true only when the page-world script
          // posts back PILOT_INSTALL_OK_EV. Script onload alone proves the file
          // was fetched and parsed but doesn't prove H2O.events.onReady was
          // available / subscriptions succeeded.
        }, false);
        sEl.addEventListener("error", function () {
          PILOT.scriptOnerrorSeen = true;
          PILOT.observerBlocked = true;
          if (PILOT.installError == null) {
            PILOT.installError = "WAR observer script failed to load (CSP, 404, or network error). "
              + "Check DevTools Network tab for the chrome-extension://...:" + PILOT_OBSERVER_FILE
              + " request and DevTools Console for any CSP violation.";
          }
        }, false);
        // Defer host-resolution to call time (after readyState gate, head
        // should exist for normal pages).
        const host = document.head || document.body || document.documentElement;
        if (!host) {
          PILOT.observerBlocked = true;
          PILOT.installError = "no host element for WAR observer injection (head/body/documentElement all null)";
          return;
        }
        PILOT.injectionDocReadyState = String(document.readyState || "");
        host.appendChild(sEl);
        PILOT.injectedScriptPresent = true;
        // Bounded watchdog: if neither onload nor onerror fires AND no
        // install-ok message arrives within installTimeoutMs, treat as
        // blocked. Bumped from 3000 to 8000 to leave headroom for slow
        // chrome-extension:// resolution + onReady polling on cold cache.
        setTimeout(function () {
          if (!PILOT.observerInstalled && !PILOT.observerBlocked) {
            PILOT.observerBlocked = true;
            if (PILOT.installError == null) {
              PILOT.installError = "WAR observer install timeout (" + PILOT.installTimeoutMs + "ms; "
                + "scriptOnloadSeen=" + PILOT.scriptOnloadSeen
                + ", scriptOnerrorSeen=" + PILOT.scriptOnerrorSeen
                + ", postMessageCount=" + PILOT.postMessageCount
                + ", injectedScriptPresent=" + PILOT.injectedScriptPresent
                + ", injectionDocReadyState=" + PILOT.injectionDocReadyState
                + ", injectionDeferred=" + PILOT.injectionDeferred
                + ", injectedScriptSrc=" + PILOT.injectedScriptSrc + ")";
            }
          }
        }, PILOT.installTimeoutMs);
      } catch (e) {
        PILOT.observerBlocked = true;
        PILOT.installError = "page-observer injection failed: " + (e && e.message);
      }
    }

    // Defer until at least DOMContentLoaded so <head> exists. content_scripts
    // run at document_start, so document.readyState is "loading" and only
    // <html> exists. Appending under <html> before <head>/<body> exists is
    // the silent-failure case observed in rev2.
    if (document.readyState === "loading") {
      PILOT.injectionDeferred = true;
      window.addEventListener("DOMContentLoaded", appendObserverScript, { once: true });
    } else {
      appendObserverScript();
    }
  }

  // ─── Loader V3.1 dispatcher state ─────────────────────────────────────
  // Single source of truth for "what did the dispatcher load this boot".
  // Populated by runV3Dispatcher() on successful per-script <script>.onload.
  // Read by the V2.x continuation in boot() to filter out already-loaded
  // aliases. When V3_DISPATCHER_ACTIVE is false, this set stays empty and
  // the V2.x filter short-circuits (byte-identity preserved).
  const DISPATCHER_LOADED_ALIASES = new Set();
  // dispatcherWaveResult is exposed via pilotPlan.dispatcherWaveResult for
  // visibility from H2O.scheduler.report(). null when dispatcher didn't run.
  let dispatcherWaveResult = null;

  const v3Diag = {
    enabled: V3_DIAG_ENABLED,
    bootStartMs: null,
    bootEndMs: null,
    phases: { start: null, end: null, idle: null }, // each: { startMs, endMs }
    waves: [], // each: { lane, startMs, endMs, scriptCount }
    activeWaves: new Map(), // lane -> { startMs, scripts: [] }
    scripts: {}, // aliasId -> { lane, dispatchMs, settleMs, waitedFor, waitReason, waitMs, errors, ok }
  };
  function v3Now() {
    return (typeof performance !== "undefined" && typeof performance.now === "function")
      ? performance.now() : (Date.now() - PAGE_STARTED_AT);
  }
  function v3Mark(name) {
    if (!V3_DIAG_ENABLED) return;
    try { performance.mark(name); } catch (_) {}
  }
  function v3PhaseStart(phase) {
    if (!V3_DIAG_ENABLED) return;
    const key = phase === "document-start" ? "start" : phase === "document-end" ? "end" : "idle";
    v3Diag.phases[key] = { startMs: v3Now(), endMs: null };
  }
  function v3PhaseEnd(phase) {
    if (!V3_DIAG_ENABLED) return;
    const key = phase === "document-start" ? "start" : phase === "document-end" ? "end" : "idle";
    if (v3Diag.phases[key]) v3Diag.phases[key].endMs = v3Now();
  }
  function v3WaveStart(lane) {
    if (!V3_DIAG_ENABLED) return;
    v3Mark("h2o:wave:" + lane + ":start");
    v3Diag.activeWaves.set(lane, { startMs: v3Now(), scripts: [] });
  }
  function v3WaveEnd(lane) {
    if (!V3_DIAG_ENABLED) return;
    v3Mark("h2o:wave:" + lane + ":end");
    const w = v3Diag.activeWaves.get(lane);
    if (!w) return;
    v3Diag.waves.push({
      lane,
      startMs: w.startMs,
      endMs: v3Now(),
      scriptCount: w.scripts.length,
    });
    v3Diag.activeWaves.delete(lane);
  }
  function v3Dispatch(aliasId, lane, waitedFor, waitReason) {
    if (!V3_DIAG_ENABLED || !aliasId) return;
    const id = String(aliasId);
    v3Mark("h2o:wave:" + lane + ":dispatch:" + id);
    const now = v3Now();
    const w = v3Diag.activeWaves.get(lane);
    const waveStartMs = w ? w.startMs : null;
    if (w) w.scripts.push(id);
    v3Diag.scripts[id] = {
      lane,
      dispatchMs: now,
      settleMs: null,
      waitedFor: waitedFor || null,
      waitReason: waitReason || "none",
      waitMs: (waveStartMs != null) ? Math.max(0, now - waveStartMs) : 0,
      errors: [],
      ok: null,
    };
  }
  function v3Settle(aliasId, lane, ok, errMsg) {
    if (!V3_DIAG_ENABLED || !aliasId) return;
    const id = String(aliasId);
    v3Mark("h2o:wave:" + lane + ":settle:" + id);
    const rec = v3Diag.scripts[id];
    if (!rec) return;
    rec.settleMs = v3Now();
    rec.ok = !!ok;
    if (!ok && errMsg) rec.errors.push(String(errMsg));
  }

  // ─── Loader V3.1 dispatcher ─────────────────────────────────────────────
  //
  // Behind localStorage.H2O_LOADER_V3_DISPATCHER_MODE === "active" (and not
  // killed by H2O_LOADER_V3_DISPATCHER_KILL === "1"). Dispatches L0 + L1
  // tier scripts using Kahn-ordered same-tier dependency resolution + per-
  // tier wave-exit gating via the WAR observer's H2O_PILOT_OBS_v1 stream.
  //
  // Safety properties (enforced by structure):
  //   - Pre-flight: aborts to V2.x if V3_DIAG helpers are unavailable
  //     (recordings would be silent → would violate Safeguard #1).
  //   - Cycle detection: dry-Kahn before any injection.
  //   - Per-script + wave-exit + total-budget timeouts → fallback.
  //   - Mid-flight kill flag re-checked at each tier and Kahn batch.
  //   - DISPATCHER_LOADED_ALIASES populated on <script>.onload only.
  //   - V2.x continuation (in boot()) filters dispatcher-loaded aliases out
  //     of phaseIdle/phaseStart/phaseEnd before calling loadPhase.
  //
  // Diagnostic parity (Safeguard #1): every dispatched script gets exactly
  // the same v3Dispatch + v3Settle calls V2.x makes — same v3Diag.scripts
  // record shape — only the lane string differs ("v3-dispatcher-L0" or
  // "v3-dispatcher-L1") so callers can filter by origin.
  //
  // V2.x predecessor compatibility (Safeguard #2): V2.x uses no settled
  // tracking Map — its predecessor logic is purely positional within input
  // arrays. Filtering dispatcher-loaded aliases out of those arrays IS the
  // seeding. Documented here because the prior plan's "settled-Map seeding"
  // turned out to be unnecessary after reading V2.x internals; the
  // array-filter path achieves the same guarantees with less surface area.

  // V3.1 dispatcher constants
  const V3D_PER_SCRIPT_TIMEOUT_MS = 5000;
  const V3D_WAVE_EXIT_TIMEOUT_MS = 8000;
  // V3.2 (L2 expansion): bumped from 20000ms because L2 has ~13 scripts vs
  // L1's 6, and the L2 wave includes the largest userscripts (Library Core,
  // Hub, MM Engine). Per-script timeout (5000ms) + wave-exit timeout (8000ms)
  // remain unchanged. 30000ms total preserves comfortable headroom.
  const V3D_TOTAL_BUDGET_MS = 30000;
  // Tier order is configurable via H2O_LOADER_V3_DISPATCHER_TIERS.
  //   "L0L1" (default) → V3.1 behavior, dispatch L0 + L1 only.
  //   "L0L1L2" → V3.2 behavior, also dispatch L2.
  //   Any other value → fall back to V3.1 ("L0L1") to keep behavior conservative.
  const V3D_TIER_ORDER = (V3_DISPATCHER_TIERS === "L0L1L2")
    ? ["L0", "L1", "L2"]
    : ["L0", "L1"];
  // Wave-exit events per tier. MUST be a subset of PILOT_WAVE_EXIT_REQUIRED
  // so the WAR observer is already subscribed. Defining here separately makes
  // the dispatcher's gates explicit at the call site. L2 set is included
  // unconditionally (extra map keys are harmless when V3D_TIER_ORDER excludes
  // L2). The 4 L2 wave-exit events are all replay-safe (verified by P3a/P3b/
  // V2.1 migrations + P3-pilot stability runs).
  // Theme ready (evt:h2o:theme:ready) is INTENTIONALLY EXCLUDED from L2 —
  // reclassified as optionalAesthetic per Phase 3 audit (can fire ~24s late
  // on slow pages; would block dispatcher unnecessarily).
  const V3D_WAVE_EXIT = {
    L0: PILOT_WAVE_EXIT_REQUIRED.L0.slice(),  // ["evt:h2o:core:ready", "evt:h2o:obs:ready"]
    L1: PILOT_WAVE_EXIT_REQUIRED.L1.slice(),  // ["evt:h2o:data:ready", "h2o:identity:ready"]
    L2: PILOT_WAVE_EXIT_REQUIRED.L2.slice(),  // [cntrlhb, mm-engine, lib, sap]  V3.2
  };

  // Live kill check — reads localStorage on every call. Used at tier and
  // Kahn batch boundaries so the user can flip the flag mid-boot to bail.
  function v3dKillFlagSet() {
    try {
      return (typeof localStorage !== "undefined")
        && (localStorage.getItem("H2O_LOADER_V3_DISPATCHER_KILL") === "1");
    } catch (_) { return false; }
  }

  // Promise-based wait for one or more wave-exit events. Polls
  // PILOT.observedReadyEvents (populated by the WAR observer's postMessage
  // bridge). Resolves when all required events are observed or timeout.
  // Returns { complete, fired, missing, waitedMs }.
  function v3dWaitForReadyEvents(events, timeoutMs) {
    return new Promise((resolve) => {
      const startedAt = v3Now();
      const remaining = new Set(events);
      const fired = [];
      const POLL_INTERVAL = 25;

      function tick() {
        for (const ev of [...remaining]) {
          const obs = PILOT.observedReadyEvents[ev];
          if (obs && typeof obs.firedAtMs === "number" && isFinite(obs.firedAtMs)) {
            fired.push(ev);
            remaining.delete(ev);
          }
        }
        if (remaining.size === 0) {
          resolve({ complete: true, fired: fired, missing: [], waitedMs: v3Now() - startedAt });
          return;
        }
        if (v3Now() - startedAt > timeoutMs) {
          resolve({ complete: false, fired: fired, missing: [...remaining], waitedMs: v3Now() - startedAt });
          return;
        }
        setTimeout(tick, POLL_INTERVAL);
      }

      tick();
    });
  }

  // Cycle detection (dry-Kahn). Returns null if no cycle, or an array of
  // alias IDs that participate in the cycle.
  function v3dDetectCycle(memberAliases, inDegreeIn, reverseGraph) {
    const inDegree = Object.assign({}, inDegreeIn);
    const remaining = new Set(memberAliases);
    let safety = remaining.size + 5;
    while (remaining.size > 0 && safety-- > 0) {
      let progressed = false;
      for (const a of [...remaining]) {
        if (inDegree[a] === 0) {
          remaining.delete(a);
          for (const dep of reverseGraph[a] || []) {
            inDegree[dep] -= 1;
          }
          progressed = true;
        }
      }
      if (!progressed) return [...remaining]; // cycle detected
    }
    return null;
  }

  // Main dispatcher. Returns dispatcherWaveResult.
  // Caller (boot()) is responsible for filtering eagerItems input AFTER this
  // returns to remove DISPATCHER_LOADED_ALIASES from V2.x's phase arrays.
  async function runV3Dispatcher(eagerIdleItems, runtimeSamples, progressState) {
    const result = {
      ok: false,
      fellBack: false,
      fallbackReason: null,
      fallbackAtMs: null,
      preFlightError: null,
      mode: V3_DISPATCHER_MODE,
      tiers: V3D_TIER_ORDER.slice(),
      tierResults: {},
      totalDispatchMs: null,
      v2xResumedFrom: null,
      dispatcherStartedAtMs: v3Now(),
    };
    const startMs = v3Now();

    // ─── Pre-flight gates ─────────────────────────────────────────────────
    // Safeguard #1 prerequisite: v3Dispatch / v3Settle must be operational.
    // Both no-op when V3_DIAG_ENABLED is false → would violate diagnostics
    // parity (dispatcher-loaded scripts would be invisible to v3Diag.scripts).
    if (!V3_DIAG_ENABLED) {
      result.preFlightError = "V3_DIAG_ENABLED is false; dispatcher diagnostics would be silent. "
        + "Set localStorage.H2O_LOADER_V3_DIAG = '1' before activating dispatcher mode.";
      result.fellBack = true;
      result.fallbackReason = "preflight:v3-diag-disabled";
      result.fallbackAtMs = v3Now();
      result.v2xResumedFrom = "L0";
      return result;
    }
    if (typeof v3Dispatch !== "function" || typeof v3Settle !== "function") {
      result.preFlightError = "v3Dispatch/v3Settle helpers missing";
      result.fellBack = true;
      result.fallbackReason = "preflight:v3diag-helpers-missing";
      result.fallbackAtMs = v3Now();
      result.v2xResumedFrom = "L0";
      return result;
    }
    // Safeguard #2 prerequisite: V2.x's "settled tracking" is just its input
    // array. The seeding mechanism is the array-filter applied by the caller
    // in boot(). No external helper to verify — the contract is enforced
    // structurally by the caller. Document here for clarity.

    // Index eager items by aliasId for fast lookup
    const itemsByAliasId = new Map();
    for (const it of eagerIdleItems) {
      const a = it && it.aliasId ? String(it.aliasId) : "";
      if (a) itemsByAliasId.set(a, it);
    }

    // ─── Per-tier dispatch ────────────────────────────────────────────────
    function fallback(reason, atTier) {
      result.fellBack = true;
      result.fallbackReason = reason;
      result.fallbackAtMs = v3Now();
      result.totalDispatchMs = v3Now() - startMs;
      result.v2xResumedFrom = atTier || "L0";
      return result;
    }

    for (let ti = 0; ti < V3D_TIER_ORDER.length; ti++) {
      const tier = V3D_TIER_ORDER[ti];

      if (v3dKillFlagSet()) return fallback("user-killed-mid-flight", tier);
      if (v3Now() - startMs > V3D_TOTAL_BUDGET_MS) return fallback("total-budget-exceeded:" + tier, tier);

      // Build member list: scripts in eagerIdleItems whose catalog tier matches
      const members = eagerIdleItems.filter((it) => {
        const meta = DEV_SCRIPT_CATALOG[it && it.aliasId];
        return meta && meta.tier === tier;
      });
      const memberAliases = members.map((it) => String(it.aliasId));
      const memberSet = new Set(memberAliases);

      const tierResult = {
        tier: tier,
        members: memberAliases.slice(),
        injected: [],
        settled: [],
        failed: [],
        waveExitMs: null,
        waveExitEventsObserved: [],
        waveExitMissing: [],
        startedAtMs: v3Now(),
      };

      if (memberAliases.length === 0) {
        // Empty tier — record + advance
        tierResult.note = "no eager scripts in this tier";
        result.tierResults[tier] = tierResult;
        continue;
      }

      // Build same-tier hard-dep graph
      const inDegree = {};
      const reverseGraph = {};
      for (const a of memberAliases) { inDegree[a] = 0; reverseGraph[a] = []; }
      for (const a of memberAliases) {
        const dep = LOADER_DEPS[a] || null;
        const deps = (dep && Array.isArray(dep.dependsOn)) ? dep.dependsOn : [];
        for (const d of deps) {
          if (memberSet.has(d)) {
            inDegree[a] += 1;
            reverseGraph[d].push(a);
          }
          // Cross-tier deps are auto-satisfied by previous tier completion;
          // ignored here.
        }
        // 'after' edges are soft hints, NOT counted toward inDegree.
      }

      // Cycle detection (dry-Kahn)
      const cycle = v3dDetectCycle(memberAliases, inDegree, reverseGraph);
      if (cycle) {
        result.tierResults[tier] = tierResult;
        return fallback("same-tier-dep-cycle:" + tier + ":[" + cycle.join(",") + "]", tier);
      }

      // Kahn batches
      const lane = "v3-dispatcher-" + tier;
      v3WaveStart(lane);
      const remaining = new Set(memberAliases);
      let lastIterationCount = remaining.size + 1; // force first iteration

      while (remaining.size > 0) {
        if (v3dKillFlagSet()) {
          v3WaveEnd(lane);
          result.tierResults[tier] = tierResult;
          return fallback("user-killed-mid-tier:" + tier, tier);
        }
        if (v3Now() - startMs > V3D_TOTAL_BUDGET_MS) {
          v3WaveEnd(lane);
          result.tierResults[tier] = tierResult;
          return fallback("total-budget-exceeded:" + tier, tier);
        }

        // Build batch of nodes with inDegree 0
        const batch = [];
        for (const a of remaining) {
          if (inDegree[a] === 0) batch.push(a);
        }
        if (batch.length === 0) {
          // Should never happen after cycle check; defensive.
          v3WaveEnd(lane);
          result.tierResults[tier] = tierResult;
          return fallback("kahn-deadlock:" + tier, tier);
        }
        // Sort batch using 'after' hints for stability (soft preference).
        batch.sort(function (a, b) {
          const depA = LOADER_DEPS[a] || null;
          const depB = LOADER_DEPS[b] || null;
          const afterA = (depA && Array.isArray(depA.after)) ? depA.after : [];
          const afterB = (depB && Array.isArray(depB.after)) ? depB.after : [];
          if (afterA.indexOf(b) !== -1) return 1;
          if (afterB.indexOf(a) !== -1) return -1;
          return a < b ? -1 : (a > b ? 1 : 0);
        });

        // Inject batch in parallel
        const batchPromises = [];
        for (const aliasId of batch) {
          remaining.delete(aliasId);
          const it = itemsByAliasId.get(aliasId);
          if (!it) {
            // Member alias has no proxy-pack item (e.g. disabled in dev-order
            // or not in the proxy-pack manifest). Skip; V2.x won't load it
            // either. Decrement dependents to keep Kahn moving.
            for (const dep of reverseGraph[aliasId] || []) inDegree[dep] -= 1;
            continue;
          }

          // Compute waitedFor / waitReason for v3Diag parity (Safeguard #1).
          const dep = LOADER_DEPS[aliasId] || null;
          const sameTierDeps = ((dep && Array.isArray(dep.dependsOn)) ? dep.dependsOn : [])
            .filter(function (d) { return memberSet.has(d); });
          const waitedForVal = sameTierDeps.length
            ? sameTierDeps[0]
            : ("phase:document-idle:tier:" + tier);
          const waitReasonVal = sameTierDeps.length ? "dep" : "phase";

          // SAFEGUARD #1: record dispatch via the same v3Dispatch helper V2.x
          // uses. This populates v3Diag.scripts[aliasId] with the parity shape.
          v3Dispatch(aliasId, lane, waitedForVal, waitReasonVal);
          tierResult.injected.push(aliasId);

          // Use V2.x's loadOneScript() so per-script timeout, runtime sample,
          // status panel, and heap probe instrumentation are identical between
          // dispatcher and V2.x paths.
          const idx = tierResult.injected.length - 1;
          const total = memberAliases.length;
          const p = loadOneScript(it, idx, total, "document-idle", runtimeSamples, progressState)
            .then(function (r) {
              const ok = (r === 1);
              // SAFEGUARD #1: record settle via the same v3Settle helper V2.x uses.
              v3Settle(aliasId, lane, ok, ok ? null : "dispatcher-load-failed");
              if (ok) {
                DISPATCHER_LOADED_ALIASES.add(aliasId);
                tierResult.settled.push(aliasId);
                // Decrement inDegree for same-tier dependents.
                for (const dependent of reverseGraph[aliasId] || []) {
                  inDegree[dependent] -= 1;
                }
              } else {
                tierResult.failed.push(aliasId);
                // Failed scripts NOT added to DISPATCHER_LOADED_ALIASES → V2.x
                // will pick them up in the continuation (Safeguard 5: failed
                // dispatcher scripts remain eligible for V2.x retry).
              }
              return r;
            })
            .catch(function (e) {
              // loadOneScript should not throw (it returns 0 on error), but
              // be defensive in case of an unexpected error in the chain.
              v3Settle(aliasId, lane, false, String((e && e.message) || e));
              tierResult.failed.push(aliasId);
              return 0;
            });
          batchPromises.push(p);
        }

        await Promise.all(batchPromises);

        // Bounded-progress safety
        if (remaining.size === lastIterationCount) {
          v3WaveEnd(lane);
          result.tierResults[tier] = tierResult;
          return fallback("kahn-no-progress:" + tier, tier);
        }
        lastIterationCount = remaining.size;
      }

      v3WaveEnd(lane);

      // Wait for tier wave-exit events
      const exitGate = await v3dWaitForReadyEvents(V3D_WAVE_EXIT[tier], V3D_WAVE_EXIT_TIMEOUT_MS);
      tierResult.waveExitMs = exitGate.waitedMs;
      tierResult.waveExitEventsObserved = exitGate.fired;
      tierResult.waveExitMissing = exitGate.missing;

      result.tierResults[tier] = tierResult;

      if (!exitGate.complete) {
        return fallback(
          "wave-exit-timeout:" + tier + ":[" + exitGate.missing.join(",") + "]",
          // Fall back from the NEXT tier: dispatched scripts in this tier are
          // already loaded; V2.x picks up at next tier onwards.
          (ti + 1 < V3D_TIER_ORDER.length) ? V3D_TIER_ORDER[ti + 1] : "L2"
        );
      }
    }

    // All tiers complete. v2xResumedFrom names the tier V2.x picks up at —
    // derived dynamically from V3D_TIER_ORDER so the field stays accurate as
    // the dispatcher's scope expands across V3.x versions.
    //   V3.1 (TIER_ORDER=L0L1)   → resumed from "L2"
    //   V3.2 (TIER_ORDER=L0L1L2) → resumed from "L3"
    //   future expansions follow the same map.
    const lastTier = V3D_TIER_ORDER[V3D_TIER_ORDER.length - 1];
    const nextTierAfter = { L0: "L1", L1: "L2", L2: "L3", L3: "L4", L4: "L5" }[lastTier] || "next";
    result.ok = true;
    result.fellBack = false;
    result.totalDispatchMs = v3Now() - startMs;
    result.v2xResumedFrom = nextTierAfter;
    return result;
  }

  // Loader V3 Phase 1 — pure-prediction simulator. Read-only. Computes what
  // V3 tier/wave dispatch WOULD look like given current metadata (LOADER_DEPS
  // + DEV_SCRIPT_CATALOG.tier) and observed V2.5 durations from v3Diag.
  // Returns null when V3_WAVE_DIAG flag is off. Does NOT mutate runtime
  // dispatch state.
  function v3PredictReport() {
    if (!V3_WAVE_DIAG_ENABLED) return null;

    const TIER_ORDER = ["L0", "L1", "L2", "L3", "L4", "L6"];
    const TIER_INDEX = {};
    for (let i = 0; i < TIER_ORDER.length; i++) TIER_INDEX[TIER_ORDER[i]] = i;

    // Build alias index over eager scripts (exclude DebugOnly and L5+openEvent)
    const allAliases = Object.keys(DEV_SCRIPT_CATALOG || {});
    const eagerAliases = allAliases.filter(function (a) {
      const meta = DEV_SCRIPT_CATALOG[a] || {};
      if (meta.tier === "DebugOnly") return false;
      if (meta.tier === "L5" && meta.openEvent) return false;
      return true;
    });

    // Compute median observed duration as fallback for unobserved scripts
    const observedDurations = [];
    for (let i = 0; i < eagerAliases.length; i++) {
      const a = eagerAliases[i];
      const obs = v3Diag.scripts[a];
      if (obs && obs.dispatchMs != null && obs.settleMs != null) {
        observedDurations.push(obs.settleMs - obs.dispatchMs);
      }
    }
    observedDurations.sort(function (x, y) { return x - y; });
    const medianDuration = observedDurations.length
      ? observedDurations[Math.floor(observedDurations.length / 2)]
      : 300;

    // Per-script normalized info
    const info = {};
    for (let i = 0; i < eagerAliases.length; i++) {
      const a = eagerAliases[i];
      const meta = DEV_SCRIPT_CATALOG[a] || {};
      const dep = LOADER_DEPS[a] || null;
      const obs = v3Diag.scripts[a] || null;
      const observedDur = (obs && obs.dispatchMs != null && obs.settleMs != null)
        ? (obs.settleMs - obs.dispatchMs) : null;
      info[a] = {
        tier: meta.tier || "L4",
        hasDecl: !!dep,
        dependsOn: dep ? dep.dependsOn.slice() : [],
        after: dep ? dep.after.slice() : [],
        optionalDependsOn: dep ? dep.optionalDependsOn.slice() : [],
        observedDuration: observedDur,
        effectiveDuration: observedDur != null ? observedDur : medianDuration,
        observedDispatch: obs ? obs.dispatchMs : null,
        observedSettle: obs ? obs.settleMs : null,
      };
    }

    // Tier inversions
    const inversions = [];
    for (let i = 0; i < eagerAliases.length; i++) {
      const a = eagerAliases[i];
      const myTier = info[a].tier;
      const deps = info[a].dependsOn;
      for (let j = 0; j < deps.length; j++) {
        const depAlias = deps[j];
        const depMeta = info[depAlias];
        const depTier = depMeta ? depMeta.tier : "L4";
        if (TIER_INDEX[depTier] != null && TIER_INDEX[myTier] != null
            && TIER_INDEX[depTier] > TIER_INDEX[myTier]) {
          inversions.push({ script: a, dependsOn: depAlias, scriptTier: myTier, depTier: depTier });
        }
      }
    }

    // Blockers
    const blockers = [];
    for (let i = 0; i < eagerAliases.length; i++) {
      const a = eagerAliases[i];
      if (!info[a].hasDecl) {
        blockers.push({
          script: a,
          reason: "undeclared-in-loader-deps",
          missingDeps: null,
          unsafeTopLevelReads: null,
          tierProblem: null,
        });
      } else {
        const deps = info[a].dependsOn;
        for (let j = 0; j < deps.length; j++) {
          if (!DEV_SCRIPT_CATALOG[deps[j]]) {
            blockers.push({
              script: a,
              reason: "depends-on-unknown-script",
              missingDeps: [deps[j]],
              unsafeTopLevelReads: null,
              tierProblem: null,
            });
          }
        }
      }
    }
    for (let i = 0; i < inversions.length; i++) {
      const inv = inversions[i];
      blockers.push({
        script: inv.script,
        reason: "tier-inversion",
        missingDeps: [],
        unsafeTopLevelReads: null,
        tierProblem: { scriptTier: inv.scriptTier, dependsOn: inv.dependsOn, depTier: inv.depTier },
      });
    }

    // Per-wave simulation. Anchor at first observed dispatch (or fallback).
    let firstObservedDispatch = Infinity;
    for (let i = 0; i < eagerAliases.length; i++) {
      const od = info[eagerAliases[i]].observedDispatch;
      if (od != null && od < firstObservedDispatch) firstObservedDispatch = od;
    }
    if (!isFinite(firstObservedDispatch)) {
      firstObservedDispatch = (typeof v3Diag.bootStartMs === "number" ? v3Diag.bootStartMs : 0) + 470;
    }

    const predictedScripts = {};
    const predictedWaves = [];
    let cursor = firstObservedDispatch;
    const BATCH_SIZE = 8;

    for (let ti = 0; ti < TIER_ORDER.length; ti++) {
      const tier = TIER_ORDER[ti];
      const members = eagerAliases.filter(function (a) { return info[a].tier === tier; });
      const tierStart = cursor;

      if (!members.length) {
        predictedWaves.push({
          tier: tier, scripts: [], scriptCount: 0,
          estimatedStartMs: Math.round(tierStart),
          estimatedEndMs: Math.round(tierStart),
          estimatedDurationMs: 0,
          criticalPath: [], criticalPathMs: 0,
          blockers: [], metadataWarnings: [],
        });
        continue;
      }

      // Within-wave Kahn ordering with batches of 8
      const remaining = {};
      for (let i = 0; i < members.length; i++) remaining[members[i]] = true;
      const settled = {};
      const dispatched = {};

      function isReady(a) {
        const deps = info[a].dependsOn;
        for (let j = 0; j < deps.length; j++) {
          const d = deps[j];
          if (info[d] && info[d].tier === tier && settled[d] == null) return false;
        }
        return true;
      }

      let safety = members.length + 5;
      while (Object.keys(remaining).length && safety-- > 0) {
        const ready = [];
        for (const a in remaining) {
          if (isReady(a)) ready.push(a);
        }
        if (!ready.length) {
          // Cycle/unsatisfiable — flush remaining at cursor (overestimate)
          for (const a in remaining) {
            dispatched[a] = cursor;
            settled[a] = cursor + info[a].effectiveDuration;
            delete remaining[a];
          }
          break;
        }
        const batch = ready.slice(0, BATCH_SIZE);
        let batchEnd = cursor;
        for (let i = 0; i < batch.length; i++) {
          const a = batch[i];
          dispatched[a] = cursor;
          const settleAt = cursor + info[a].effectiveDuration;
          settled[a] = settleAt;
          if (settleAt > batchEnd) batchEnd = settleAt;
          delete remaining[a];
        }
        cursor = batchEnd;
      }

      const tierEnd = cursor;
      const settleEntries = [];
      for (const a in settled) settleEntries.push([a, settled[a]]);
      settleEntries.sort(function (x, y) { return y[1] - x[1]; });
      const criticalPath = settleEntries.slice(0, 5).map(function (e) { return e[0]; });
      const criticalPathMs = settleEntries.length ? Math.round(settleEntries[0][1] - tierStart) : 0;

      for (let i = 0; i < members.length; i++) {
        const a = members[i];
        predictedScripts[a] = {
          tier: tier,
          dispatch: dispatched[a],
          settle: settled[a],
        };
      }

      const memberSet = {};
      for (let i = 0; i < members.length; i++) memberSet[members[i]] = true;
      const tierBlockerScripts = blockers
        .filter(function (b) { return memberSet[b.script]; })
        .map(function (b) { return b.script; });
      const metadataWarnings = [];
      if (tierBlockerScripts.length) {
        metadataWarnings.push(tierBlockerScripts.length + " blocker(s) in this tier");
      }

      predictedWaves.push({
        tier: tier,
        scripts: members,
        scriptCount: members.length,
        estimatedStartMs: Math.round(tierStart),
        estimatedEndMs: Math.round(tierEnd),
        estimatedDurationMs: Math.round(tierEnd - tierStart),
        criticalPath: criticalPath,
        criticalPathMs: criticalPathMs,
        blockers: tierBlockerScripts,
        metadataWarnings: metadataWarnings,
      });
    }

    // Predicted visible readiness
    const SURFACE_MAP = {
      controlHub: "0Z1a._Control_Hub_.js",
      commandBar: "0X1a._Command_Bar_.js",
      sideActions: "0X2a._Side_Actions_Panel_.js",
      library: "0F1a._Library_Core_.js",
      minimap: "1A1c._MiniMap_Engine_.js",
      dockPanel: "3A1a._Dock_Panel_.js",
    };
    const predictedVisibleReadiness = {};
    const predictedSavings = {};
    for (const surface in SURFACE_MAP) {
      const aliasId = SURFACE_MAP[surface];
      const pred = predictedScripts[aliasId];
      const predMs = (pred && pred.settle != null) ? Math.round(pred.settle) : null;
      const obs = v3Diag.scripts[aliasId];
      const actualMs = (obs && obs.settleMs != null) ? Math.round(obs.settleMs) : null;
      const delta = (predMs != null && actualMs != null) ? predMs - actualMs : null;
      predictedVisibleReadiness[surface] = { ms: predMs, vsActualDelta: delta };
      if (predMs != null && actualMs != null) {
        predictedSavings[surface + "ReadyMs"] = actualMs - predMs;
      }
    }

    // Total boot savings — robust calculation
    // (1) Predicted total: take the MAX estimatedEndMs across all waves, not
    //     just the last wave's value. The last tier (e.g. L6) may be empty,
    //     leaving its end equal to its start — that would underestimate.
    let lastWaveEnd = null;
    for (let i = 0; i < predictedWaves.length; i++) {
      const e = predictedWaves[i].estimatedEndMs;
      if (typeof e === "number" && isFinite(e)) {
        if (lastWaveEnd == null || e > lastWaveEnd) lastWaveEnd = e;
      }
    }

    // (2) Actual total: prefer v3Diag.bootEndMs - bootStartMs, but fall back
    //     to (max observed settleMs - min observed dispatchMs) when boot
    //     timestamps are not yet finite at report capture time.
    let actualTotal = null;
    if (typeof v3Diag.bootEndMs === "number" && isFinite(v3Diag.bootEndMs)
        && typeof v3Diag.bootStartMs === "number" && isFinite(v3Diag.bootStartMs)) {
      actualTotal = Math.round(v3Diag.bootEndMs - v3Diag.bootStartMs);
    } else {
      let maxSettle = -Infinity, minDispatch = Infinity;
      for (let i = 0; i < eagerAliases.length; i++) {
        const obs = v3Diag.scripts[eagerAliases[i]];
        if (!obs) continue;
        if (typeof obs.dispatchMs === "number" && isFinite(obs.dispatchMs) && obs.dispatchMs < minDispatch) {
          minDispatch = obs.dispatchMs;
        }
        if (typeof obs.settleMs === "number" && isFinite(obs.settleMs) && obs.settleMs > maxSettle) {
          maxSettle = obs.settleMs;
        }
      }
      if (isFinite(maxSettle) && isFinite(minDispatch) && maxSettle >= minDispatch) {
        actualTotal = Math.round(maxSettle - minDispatch);
      }
    }

    predictedSavings.totalBootMs = (actualTotal != null && lastWaveEnd != null)
      ? Math.round(actualTotal - lastWaveEnd) : null;

    // Recommendation policy (P3-pre, 2026-05): always compute BOTH the
    // totalBootMs bucket AND the visible-surface savings bucket, then take
    // the stronger signal. Visible-surface savings dominate when both are
    // present, because a small totalBootMs with large per-surface deferrals
    // (e.g. controlHubReadyMs >= 8000ms) is exactly the V3 win we want to
    // surface. Only return "insufficient-data" when BOTH signals are absent.
    const RECO_RANK = {
      "insufficient-data": 0,
      "stop": 1,
      "metadata-cleanup": 2,
      "continue-v3": 3,
    };

    // Bucket A — totalBootMs signal
    let totalSavBucket;
    const totalSav = predictedSavings.totalBootMs;
    if (typeof totalSav === "number" && isFinite(totalSav)) {
      if (totalSav >= 4000) totalSavBucket = "continue-v3";
      else if (totalSav >= 2000) totalSavBucket = "metadata-cleanup";
      else totalSavBucket = "stop";
    } else {
      totalSavBucket = "insufficient-data";
    }

    // Bucket B — visible-surface savings signal (always evaluated)
    let surfaceBucket;
    const surfaceSavings = [];
    for (const surface in SURFACE_MAP) {
      const v = predictedSavings[surface + "ReadyMs"];
      if (typeof v === "number" && isFinite(v)) surfaceSavings.push(v);
    }
    if (!surfaceSavings.length) {
      surfaceBucket = "insufficient-data";
    } else {
      let maxSav = -Infinity;
      let strongCount = 0;
      let anyMedium = false;
      for (let i = 0; i < surfaceSavings.length; i++) {
        const v = surfaceSavings[i];
        if (v > maxSav) maxSav = v;
        if (v >= 2500) strongCount++;
        if (v >= 2000) anyMedium = true;
      }
      if (maxSav >= 4000 || strongCount >= 3) surfaceBucket = "continue-v3";
      else if (anyMedium) surfaceBucket = "metadata-cleanup";
      else surfaceBucket = "stop";
    }

    // Final = stronger signal. "insufficient-data" only if BOTH absent.
    let recommendation;
    if (totalSavBucket === "insufficient-data" && surfaceBucket === "insufficient-data") {
      recommendation = "insufficient-data";
    } else {
      recommendation = (RECO_RANK[surfaceBucket] >= RECO_RANK[totalSavBucket])
        ? surfaceBucket : totalSavBucket;
    }

    // Metadata coverage (Phase 3: dual All vs Enabled accounting).
    //
    // "All" = every script in DEV_SCRIPT_CATALOG (i.e., every file in scripts/
    // dir, including DebugOnly and lazy L5-openEvent surfaces).
    //
    // "Enabled" = only scripts that the dispatcher would actually plan a wave
    // for. This matches the eagerAliases filter used by the blockers logic
    // (excludes DebugOnly and L5+openEvent). It is the meaningful view for
    // V3 readiness: a non-eager script that lacks a deps entry is harmless
    // because the dispatcher won't dispatch it anyway.
    //
    // "All" view stays available so the report still shows raw catalog
    // coverage — useful for catching truly orphaned files. "Enabled" view is
    // what should be compared against blockersTotal for self-consistency:
    // depsMissingEnabled === 0 IFF blockersTotal == 0 in the no-tier-inversion
    // case.
    //
    // Legacy fields depsDeclared/depsMissing remain as aliases of the "All"
    // view so existing consumers do not break.
    const totalScripts = allAliases.length;
    const enabledScripts = eagerAliases.length;
    const declaredKeySet = new Set(Object.keys(LOADER_DEPS || {}));

    // "All" coverage
    const depsDeclaredAll = declaredKeySet.size;
    const depsMissingAll = Math.max(0, totalScripts - depsDeclaredAll);

    // "Enabled" coverage (matches dispatcher eligibility = matches blockers semantics)
    let depsDeclaredEnabled = 0;
    for (let i = 0; i < eagerAliases.length; i++) {
      if (declaredKeySet.has(eagerAliases[i])) depsDeclaredEnabled++;
    }
    const depsMissingEnabled = Math.max(0, enabledScripts - depsDeclaredEnabled);

    // Legacy aliases (do not break existing consumers).
    const depsDeclared = depsDeclaredAll;
    const depsMissing = depsMissingAll;

    let tiersDeclared = 0;
    for (let i = 0; i < allAliases.length; i++) {
      const meta = DEV_SCRIPT_CATALOG[allAliases[i]];
      if (meta && meta.tier && meta.tier !== "L4") tiersDeclared++;
    }
    const defaultL4 = totalScripts - tiersDeclared;

    return {
      enabled: true,
      version: 1,
      dataSource: {
        observedScriptCount: observedDurations.length,
        diagFlagOn: V3_DIAG_ENABLED,
        medianObservedDurationMs: medianDuration,
      },
      metadataCoverage: {
        // Catalog totals
        totalScripts: totalScripts,
        enabledScripts: enabledScripts,
        // "All" view (raw catalog coverage; includes DebugOnly + L5+openEvent)
        depsDeclaredAll: depsDeclaredAll,
        depsMissingAll: depsMissingAll,
        // "Enabled" view (matches dispatcher eligibility + blockers semantics)
        depsDeclaredEnabled: depsDeclaredEnabled,
        depsMissingEnabled: depsMissingEnabled,
        // Legacy aliases (= "All" view) for backward compat
        depsDeclared: depsDeclared,
        depsMissing: depsMissing,
        tiersDeclared: tiersDeclared,
        defaultL4: defaultL4,
        readyEventEmittersDeclared: 0,
      },
      predictedWaves: predictedWaves,
      predictedVisibleReadiness: predictedVisibleReadiness,
      predictedSavings: predictedSavings,
      blockers: blockers.slice(0, 50),
      blockersTotal: blockers.length,
      recommendation: recommendation,
    };
  }

  // Loader V3 Phase 3-pilot: synthesize pilotPlan from observations gathered
  // by the inline page-world observer (see V3_PILOT_ENABLED block above).
  // Returns { enabled: false } when the pilot flag is off — no allocation
  // beyond the early return. When enabled, returns the structured shape:
  //   { enabled, flagOn, observedReadyEvents, observedWaveExits, surfaces,
  //     compareToCurrent, installError }
  // firedAtMs values are performance.now() readings (ms since navigation
  // start), matching the scale used by v3Diag.scripts[*].settleMs.
  // Visible surfaces used for the compareToCurrent.visibleSurfaces section.
  // Per Phase 3 user decision: chrome-critical visible surfaces only.
  // Excludes: theme (aesthetic), workspace (route-aware utility), inputDock
  // (composer-conditional), commandBar (also visible but not in the
  // user-listed set for the savings comparison).
  const PILOT_VISIBLE_SURFACES_FOR_COMPARE = [
    "library", "sideActions", "controlHub", "minimap", "dockPanel",
  ];

  function computePilotPlan(predictedV3Wave) {
    if (!V3_PILOT_ENABLED) return { enabled: false };

    // Count observed events for diagnostic clarity.
    let observedEventCount = 0;
    for (const ev in PILOT.observedReadyEvents) {
      if (PILOT.observedReadyEvents[ev] !== null) observedEventCount += 1;
    }

    // ─── Current observations (from PILOT-side observer) ─────────────────
    // Per-tier wave-exit = max(firedAtMs across REQUIRED events at that tier).
    // Required tiers are L0/L1/L2 only. Theme excluded from L2 (aesthetic).
    // L3 excluded entirely (route-aware; see PILOT_OPTIONAL_ROUTE_AWARE).
    const currentObservedWaveExits = {};
    for (const [tier, events] of Object.entries(PILOT_WAVE_EXIT_REQUIRED)) {
      let maxMs = -Infinity;
      let complete = true;
      const fired = [];
      const missing = [];
      for (const ev of events) {
        const obs = PILOT.observedReadyEvents[ev];
        if (obs && typeof obs.firedAtMs === "number" && isFinite(obs.firedAtMs)) {
          fired.push({ ev: ev, firedAtMs: obs.firedAtMs });
          if (obs.firedAtMs > maxMs) maxMs = obs.firedAtMs;
        } else {
          complete = false;
          missing.push(ev);
        }
      }
      currentObservedWaveExits[tier] = {
        exitMs: complete ? maxMs : null,
        signals: events.slice(),
        fired: fired,
        missing: missing,
        complete: complete,
      };
    }

    // ─── Route-aware advisory observations (NOT a hard failure) ──────────
    // L3 events (Dock Panel + Workspace Core) gate their own ready emission
    // on UI/route conditions. Missing them on a given page is normal — e.g.
    // Dock Panel's CORE_DP_whenUiSafe(...) only resolves on chat-shell pages;
    // Workspace Core re-emits per-chat-route, never on landing pages.
    // Reported as advisory only; routeAwareComplete is informational, not
    // gating any savings/dispatcher decision.
    const routeAwareObservation = {};
    for (const [tier, events] of Object.entries(PILOT_OPTIONAL_ROUTE_AWARE)) {
      let maxMs = -Infinity;
      let allFired = true;
      const fired = [];
      const missing = [];
      for (const ev of events) {
        const obs = PILOT.observedReadyEvents[ev];
        if (obs && typeof obs.firedAtMs === "number" && isFinite(obs.firedAtMs)) {
          fired.push({ ev: ev, firedAtMs: obs.firedAtMs });
          if (obs.firedAtMs > maxMs) maxMs = obs.firedAtMs;
        } else {
          allFired = false;
          missing.push(ev);
        }
      }
      routeAwareObservation[tier] = {
        // exitMs: max of fired events (null only if NO event fired); not
        // gated on "all fired" because each event is independent.
        exitMs: fired.length ? maxMs : null,
        signals: events.slice(),
        fired: fired,
        missing: missing,
        // routeAwareComplete: all listed events fired (ideal case)
        // routeAwareMissing: events that did NOT fire on this page
        routeAwareComplete: allFired,
        routeAwareMissing: missing,
      };
    }

    // L4 fallback — REPORTED ONLY for visibility, NEVER used to derive any
    // "predicted dispatcher end" value. The previous report bug used L4
    // settle as the pilot's predicted end, which made the "comparison" be
    // current-vs-current and yield savings=0 trivially.
    let currentTailObservedL4ExitMs = null;
    if (v3Diag && v3Diag.scripts) {
      let maxL4Settle = -Infinity;
      for (const a in v3Diag.scripts) {
        const meta = DEV_SCRIPT_CATALOG[a];
        if (!meta || meta.tier !== "L4") continue;
        const obs = v3Diag.scripts[a];
        if (obs && typeof obs.settleMs === "number" && isFinite(obs.settleMs)) {
          if (obs.settleMs > maxL4Settle) maxL4Settle = obs.settleMs;
        }
      }
      if (isFinite(maxL4Settle) && maxL4Settle > -Infinity) {
        currentTailObservedL4ExitMs = Math.round(maxL4Settle);
      }
    }

    // Per-surface readyMs (nullable for conditional surfaces).
    const surfaces = {};
    for (const [surface, ev] of Object.entries(PILOT_SURFACE_MAP)) {
      const obs = PILOT.observedReadyEvents[ev];
      surfaces[surface] = (obs && typeof obs.firedAtMs === "number")
        ? { readyMs: obs.firedAtMs, source: ev }
        : { readyMs: null, source: ev };
    }

    // Event classification — documents how the pilot is using each event.
    const eventClassification = {
      requiredL0: PILOT_WAVE_EXIT_REQUIRED.L0.slice(),
      requiredL1: PILOT_WAVE_EXIT_REQUIRED.L1.slice(),
      requiredL2: PILOT_WAVE_EXIT_REQUIRED.L2.slice(),
      // L3 NOT in required (was, prior to L3 investigation)
      l3Required: false,
      optionalRouteAware: [].concat.apply([], Object.values(PILOT_OPTIONAL_ROUTE_AWARE)),
      optionalAesthetic: PILOT_OPTIONAL_AESTHETIC.slice(),
      optionalConditional: [].concat.apply([], Object.values(PILOT_WAVE_EXIT_OPTIONAL)),
      notes: {
        "evt:h2o:theme:ready":
          "Reclassified from L2-required to optionalAesthetic. Theme can fire " +
          "very late (observed up to ~24s) due to async storage + skin DOM " +
          "probes; gating L3 dispatch on it would block chrome-critical " +
          "surfaces unnecessarily. Theme is observed for surfaces.theme " +
          "reporting but does NOT count toward L2 wave-exit completion.",
        "h2o:dpanel:ready":
          "Reclassified to optionalRouteAware. 3A1a Dock Panel CORE_DP_boot " +
          "wraps emit inside CORE_DP_whenUiSafe(...) which only resolves on " +
          "chat-shell pages. Non-chat URLs / project pages / share-link pages " +
          "may not produce an emit. Treated as advisory; missing-on-this-page " +
          "is NOT a failure for the dispatcher decision.",
        "h2o:wrkspc:ready":
          "Reclassified to optionalRouteAware. 3Z2a Workspace Core re-emits " +
          "per-chat-route boot. Pages without an active chat route may never " +
          "produce an emit. Treated as advisory; missing-on-this-page is NOT " +
          "a failure for the dispatcher decision. NB: this is the right-side " +
          "Workspace dock for spaces, NOT Library Workspace (different " +
          "surface, different ready event).",
        "evt:h2o:inputdock:ready":
          "Reclassified per P3c finding: composer-anchored, may legitimately " +
          "never fire on pages without an active composer. NOT treated as " +
          "failure when missing.",
      },
    };

    // ─── Health gate ─────────────────────────────────────────────────────
    const observerHealthy = PILOT.observerInstalled && !PILOT.observerBlocked;
    const observationsUsable = observerHealthy && observedEventCount > 0;

    // ─── Current observed end-times (from v3Diag + observer) ─────────────
    let currentTailEndMs = null; // entire script tail per V2.x loader
    if (v3Diag && v3Diag.scripts) {
      let maxSettle = -Infinity;
      for (const a in v3Diag.scripts) {
        const obs = v3Diag.scripts[a];
        if (obs && typeof obs.settleMs === "number" && isFinite(obs.settleMs)) {
          if (obs.settleMs > maxSettle) maxSettle = obs.settleMs;
        }
      }
      if (isFinite(maxSettle) && maxSettle > -Infinity) {
        currentTailEndMs = Math.round(maxSettle);
      }
    }

    let currentObservedWaveEndMs = null; // max L0-L2 only (REQUIRED tiers)
    if (observationsUsable) {
      for (const tier of ["L0", "L1", "L2"]) {
        const w = currentObservedWaveExits[tier];
        if (w && typeof w.exitMs === "number" && isFinite(w.exitMs)
            && (currentObservedWaveEndMs == null || w.exitMs > currentObservedWaveEndMs)) {
          currentObservedWaveEndMs = w.exitMs;
        }
      }
    }

    let currentObservedVisibleEndMs = null; // max readyMs over the 5 listed surfaces
    if (observationsUsable) {
      for (const surface of PILOT_VISIBLE_SURFACES_FOR_COMPARE) {
        const s = surfaces[surface];
        if (s && typeof s.readyMs === "number" && isFinite(s.readyMs)
            && (currentObservedVisibleEndMs == null || s.readyMs > currentObservedVisibleEndMs)) {
          currentObservedVisibleEndMs = s.readyMs;
        }
      }
    }

    // ─── Predicted end-times (from existing v3PredictReport simulation) ──
    // These come from the WAVE-DIAG predictor (chrome-live-loader.mjs ~line 285+).
    // Available only when localStorage.H2O_LOADER_V3_WAVE_DIAG === "1".
    let predictedVisibleEndMs = null;
    let predictedWaveEndMs = null;
    let waveSourceNote = null;
    if (predictedV3Wave && predictedV3Wave.predictedVisibleReadiness) {
      for (const surface of PILOT_VISIBLE_SURFACES_FOR_COMPARE) {
        const r = predictedV3Wave.predictedVisibleReadiness[surface];
        const ms = r && typeof r.ms === "number" && isFinite(r.ms) ? r.ms : null;
        if (ms != null && (predictedVisibleEndMs == null || ms > predictedVisibleEndMs)) {
          predictedVisibleEndMs = ms;
        }
      }
    }
    if (predictedV3Wave && Array.isArray(predictedV3Wave.predictedWaves)) {
      for (const w of predictedV3Wave.predictedWaves) {
        if (!w || !w.tier) continue;
        // Required dispatcher waves are L0/L1/L2 only (post L3 reclassification).
        if (w.tier !== "L0" && w.tier !== "L1" && w.tier !== "L2") continue;
        const end = (typeof w.estimatedEndMs === "number" && isFinite(w.estimatedEndMs))
          ? w.estimatedEndMs : null;
        if (end != null && (predictedWaveEndMs == null || end > predictedWaveEndMs)) {
          predictedWaveEndMs = end;
        }
      }
    }
    if (predictedV3Wave === null) {
      waveSourceNote = "predictedV3 (V3_WAVE_DIAG) is OFF — predicted* values unavailable; "
        + "set localStorage.H2O_LOADER_V3_WAVE_DIAG = '1' to enable.";
    }

    // ─── Savings (per-section; NEVER 0 when actually unmeasurable) ───────
    function delta(currentMs, predMs) {
      if (currentMs == null || predMs == null) return null;
      return Math.max(0, Math.round(currentMs - predMs));
    }

    const visibleSavingsMs = delta(currentObservedVisibleEndMs, predictedVisibleEndMs);
    const waveSavingsMs    = delta(currentObservedWaveEndMs,    predictedWaveEndMs);
    // tailSavings — compares current full tail vs predicted L0-L3 wave end.
    // Meaningful only as "if dispatcher cut off at L3, here's what would
    // remain trailing into L4". Returns null if either input is missing.
    const tailSavingsMs    = delta(currentTailEndMs,            predictedWaveEndMs);

    const compareNotes = [];
    if (waveSourceNote) compareNotes.push(waveSourceNote);
    if (!observationsUsable) compareNotes.push(
      "Observer not healthy (installed=" + PILOT.observerInstalled +
      ", blocked=" + PILOT.observerBlocked + ", events=" + observedEventCount +
      "); current* values may be partial."
    );
    if (currentTailObservedL4ExitMs != null) compareNotes.push(
      "currentTailObservedL4ExitMs=" + currentTailObservedL4ExitMs + " is reported " +
      "for visibility but is NOT used in any savings calculation — using it would " +
      "make pilotPredictedEnd === currentTailEnd (current-vs-current, savings=0 always)."
    );

    return {
      enabled: true,
      flagOn: true,
      // Observer lifecycle/health (CSP-block diagnosis hooks)
      observerInstalled: PILOT.observerInstalled,
      observerBlocked: PILOT.observerBlocked,
      observedEventCount: observedEventCount,
      installError: PILOT.installError,
      installStartMs: PILOT.installStartMs,
      installEndMs: PILOT.installEndMs,
      // Detailed transport diagnostics — exposed so a failure can be diagnosed
      // from pilotPlan alone without DevTools spelunking.
      transport: {
        injectedScriptPresent: PILOT.injectedScriptPresent,
        injectedScriptSrc: PILOT.injectedScriptSrc,
        chromeRuntimeGetUrlResult: PILOT.chromeRuntimeGetUrlResult,
        chromeRuntimeGetUrlError: PILOT.chromeRuntimeGetUrlError,
        scriptOnloadSeen: PILOT.scriptOnloadSeen,
        scriptOnerrorSeen: PILOT.scriptOnerrorSeen,
        injectionDocReadyState: PILOT.injectionDocReadyState,
        injectionDeferred: PILOT.injectionDeferred,
        postMessageCount: PILOT.postMessageCount,
        lastPilotMessageType: PILOT.lastPilotMessageType,
        installTimeoutMs: PILOT.installTimeoutMs,
      },
      // Event classification (theme reclassified, inputdock conditional)
      eventClassification: eventClassification,
      // Per-event raw observation data (firedAtMs in performance.now() scale)
      observedReadyEvents: PILOT.observedReadyEvents,
      // Per-tier wave-exit times derived from REQUIRED L0/L1/L2 events only.
      // Renamed from observedWaveExits to make it clear these reflect what
      // the CURRENT loader achieved (not a predicted dispatcher target).
      currentObservedWaveExits: currentObservedWaveExits,
      // L3 route-aware advisory observation. Includes routeAwareComplete
      // (all L3 events fired — best case) and routeAwareMissing (which L3
      // events did NOT fire on this page). Missing L3 events are NORMAL
      // for non-chat URLs / project pages / share links — NOT a failure.
      routeAwareObservation: routeAwareObservation,
      // L4 settle observed in CURRENT loader. REPORTED FOR VISIBILITY ONLY —
      // do not use to derive any "pilot predicted end" value.
      currentTailObservedL4ExitMs: currentTailObservedL4ExitMs,
      // Per-surface readyMs (nullable for conditional surfaces).
      surfaces: surfaces,
      // Comparison: current loader vs predicted V3 dispatcher (from
      // v3PredictReport simulation). Each subfield is null when unmeasurable
      // (never 0 to avoid misleading "no savings" readings).
      compareToCurrent: {
        currentTailEndMs:            currentTailEndMs,
        currentObservedWaveEndMs:    currentObservedWaveEndMs,
        currentObservedVisibleEndMs: currentObservedVisibleEndMs,
        predictedVisibleEndMs:       predictedVisibleEndMs,
        predictedWaveEndMs:          predictedWaveEndMs,
        visibleSavingsMs:            visibleSavingsMs,
        waveSavingsMs:               waveSavingsMs,
        tailSavingsMs:               tailSavingsMs,
        note: compareNotes.length ? compareNotes.join(" | ") : null,
      },
      // V3.1 dispatcher result (null when MODE != "active" OR dispatcher
      // hasn't completed yet). Exposes per-tier dispatch outcome, fallback
      // reason if any, and the loaded-alias set so callers can verify
      // Safeguard #1 (parity) and Safeguard #2 (V2.x continuation) externally.
      dispatcherWaveResult: dispatcherWaveResult,
      dispatcherMode: V3_DISPATCHER_MODE,
      dispatcherKill: V3_DISPATCHER_KILL,
      dispatcherActive: V3_DISPATCHER_ACTIVE,
      dispatcherTiers: V3_DISPATCHER_TIERS,
      dispatcherLoadedAliases: [...DISPATCHER_LOADED_ALIASES],
    };
  }

  function v3GetReport() {
    // Allow report when EITHER V3_DIAG OR V3_PILOT is on. V3_PILOT alone is
    // sufficient to populate predictedV3.pilotPlan; other report fields will
    // be empty/null when V3_DIAG is off.
    if (!V3_DIAG_ENABLED && !V3_PILOT_ENABLED) return { enabled: false };
    const report = {
      version: 3,
      buildId: LOADER_BUILD_ISO || String(LOADER_BUILD_TS || ""),
      enabled: true,
      pageStartedAt: PAGE_STARTED_AT,
      bootStartMs: v3Diag.bootStartMs,
      bootEndMs: v3Diag.bootEndMs,
      phaseTimings: {
        start: v3Diag.phases.start,
        end: v3Diag.phases.end,
        idle: v3Diag.phases.idle,
      },
      waves: v3Diag.waves.slice(),
      scripts: {},
      // surfaces are populated page-side by 0A0a Loader Bridge; the loader
      // itself cannot subscribe to page-world ready events directly via
      // H2O.events.* — only via the P3-pilot inline-injection bridge below.
      // The bridge merges its own surfaces map into the final report shown
      // to callers.
      surfaces: {},
      // Loader V3 Phase 1 + Phase 3-pilot: predictedV3 wraps both
      //   - the V3_WAVE_DIAG simulation (top-level fields, populated when
      //     localStorage.H2O_LOADER_V3_WAVE_DIAG === "1")
      //   - the P3-pilot observation report at predictedV3.pilotPlan
      //     (populated when localStorage.H2O_LOADER_V3_DISPATCHER_PILOT === "1")
      // When neither flag is on, predictedV3 is null. When only the pilot
      // flag is on, predictedV3 contains only { pilotPlan }.
      predictedV3: (function () {
        const wave = v3PredictReport();
        if (!V3_PILOT_ENABLED) return wave; // null or full simulation
        // Pass the wave simulation into computePilotPlan so it can read
        // predictedVisibleReadiness + predictedWaves for the new
        // compareToCurrent.{visible,wave,tail}SavingsMs sections. When
        // V3_WAVE_DIAG is OFF, wave is null and predicted* values come back
        // as null (with a note in compareToCurrent.note).
        const pilot = computePilotPlan(wave);
        if (wave === null) return { pilotPlan: pilot };
        return Object.assign({}, wave, { pilotPlan: pilot });
      })(),
    };
    for (const [k, v] of Object.entries(v3Diag.scripts)) {
      report.scripts[k] = {
        lane: v.lane,
        dispatchMs: v.dispatchMs,
        settleMs: v.settleMs,
        waitedFor: v.waitedFor,
        waitReason: v.waitReason,
        waitMs: v.waitMs,
        errors: v.errors.slice(),
        ok: v.ok,
      };
    }
    return report;
  }
  try {
    globalThis[LOADER_INSTANCE_KEY] = {
      active: true,
      href: String(location.href || ""),
      startedAt: PAGE_STARTED_AT,
      pageStartedAt: PAGE_STARTED_AT,
    };
  } catch {}
  const ENABLE_TOGGLES = ${JSON.stringify(DEV_HAS_CONTROLS)};
  const PROXY_PACK_URL = ${JSON.stringify(PROXY_PACK_URL)};
  const DEV_SCRIPT_CATALOG = ${JSON.stringify(DEV_SCRIPT_CATALOG)};
  const DEV_ORDER_SECTIONS = ${JSON.stringify(DEV_ORDER_SECTIONS_SNAPSHOT)};
  // Loader V3 Phase 1: declared dependency edges (read-only). Used by
  // v3PredictReport() to simulate tier/wave dispatch when
  // localStorage.H2O_LOADER_V3_WAVE_DIAG === "1". Does NOT affect runtime
  // dispatch — V2.x serial-then-parallel behavior is unchanged.
  const LOADER_DEPS = ${JSON.stringify(LOADER_DEPS_SNAPSHOT || {})};
  const STORAGE_KEY = ${JSON.stringify(STORAGE_KEY)};
  const STORAGE_SETS_KEY = "h2oExtDevToggleSetsV1";
  const STORAGE_ORDER_OVERRIDES_KEY = ${JSON.stringify(STORAGE_ORDER_OVERRIDES_KEY)};
  const STORAGE_RUNTIME_KEY = "h2oExtDevRuntimeStatsV1";
  const RUNTIME_KEEP_LIMIT = 300;
  const RUNTIME_EWMA_ALPHA = 0.35;
  const SCRIPT_LOAD_TIMEOUT_MS = 12000;
  const SCRIPT_LOAD_TIMEOUT_START_MS = 4000;
  const SCRIPT_LOAD_TIMEOUT_END_MS = 8000;
  const SCRIPT_LOAD_TIMEOUT_IDLE_MS = 20000;

  const SCRIPT_SLOWLOAD_WARN_START_MS = 1200;
  const SCRIPT_SLOWLOAD_WARN_END_MS = 2500;
  const SCRIPT_SLOWLOAD_WARN_IDLE_MS = 6000;
  const IDLE_SERIAL_SECTION_TITLES = [
    "🧠 CORE",
    "🪟 CHAT FLOW",
    "⚡ PERFORMANCE",
    "🗄️ DATA",
    "🎛️ SYSTEM SURFACES",
    "🕹️ CONTROL HUB",
    "🗺️ MINIMAP BASE",
  ];
  const IDLE_SERIAL_ALIAS_SET = new Set(collectSectionAliasIds(IDLE_SERIAL_SECTION_TITLES));
  const MSG_FETCH_TEXT = "h2o-ext-live:fetch-text";
  const MSG_HTTP = "h2o-ext-live:http";
  const MSG_PAGE_DISABLE_ONCE = "h2o-ext-live:page-disable-once";
  const MSG_PAGE_SET_LINK = "h2o-ext-live:page-set-link";
  const MSG_HTTP_REQ = "h2o-ext-live:http:req";
  const MSG_HTTP_RES = "h2o-ext-live:http:res";
  const MSG_HIGHLIGHT_REQ = "h2o-ext-live:highlight:req";
  const MSG_ARCHIVE_REQ = "h2o-ext-archive:v1:req";
  const MSG_ARCHIVE_RES = "h2o-ext-archive:v1:res";
  const MSG_ARCHIVE_SW = "h2o-ext-archive:v1";
  const MSG_ARCHIVE_PORT = "h2o-ext-archive:v1:port";
  const MSG_FOLDERS_SW = "h2o-ext-folders:v1";
  const MSG_FOLDERS_REQ = "h2o-ext-folders:v1:req";
  const MSG_FOLDERS_RES = "h2o-ext-folders:v1:res";
  const MSG_CONTROL_HUB_OPEN = "h2o-ext-live:control-hub-open";
  const MSG_CONTROL_HUB_PAGE_REQ = "h2o-ext:control-hub-open:req";
  const MSG_CONTROL_HUB_PAGE_RES = "h2o-ext:control-hub-open:res";
  const MSG_IDENTITY_REQ = "h2o-ext-identity:v1:req";
  const MSG_IDENTITY_RES = "h2o-ext-identity:v1:res";
  const MSG_IDENTITY_SW = "h2o-ext-identity:v1";
  const MSG_IDENTITY_FIRST_RUN_PROMPT = "h2o-ext-identity-first-run:v1";
  const MSG_IDENTITY_PUSH = "h2o-ext-identity:v1:push";
  const MSG_BILLING_REQ = "h2o-ext-billing:v1:req";
  const MSG_BILLING_RES = "h2o-ext-billing:v1:res";
  const MSG_BILLING_SW = "h2o-ext-billing:v1";
  const OPEN_CONTROL_HUB_PARAM = "h2o_open_control_hub";
  const CONTROL_HUB_OPEN_TIMEOUT_MS = 30000;
  const CONTROL_HUB_OPEN_RETRY_MS = 180;
  const PAGE_FOLDER_BRIDGE_FILE = ${JSON.stringify(PAGE_FOLDER_BRIDGE_FILE)};
  const DEFAULT_NS_DISK = "h2o:prm:cgx:h2odata";
  const ARCHIVE_TIMEOUT_MS = 12000;

  const HDR_RE = /\\/\\/\\s*==H2O Module==[\\s\\S]*?\\/\\/\\s*==\\/H2O Module==/g;

  function log(...args) {
    try { console.log(TAG, ...args); } catch {}
  }

  function warn(...args) {
    try { console.warn(TAG, ...args); } catch {}
  }

  function err(...args) {
    try { console.error(TAG, ...args); } catch {}
  }

  function clearPlainObject(target) {
    const obj = target && typeof target === "object" ? target : null;
    if (!obj) return;
    for (const key of Object.keys(obj)) {
      try { delete obj[key]; } catch (_) {}
    }
  }

  function cloneLoaderDiagState() {
    const phaseOnDemand = {};
    const onDemandState = {};
    const currentPageLoads = {};

    for (const entry of Object.entries(loaderDiagState.phaseOnDemand || {})) {
      const aliasId = String(entry[0] || "").trim();
      const src = entry[1] && typeof entry[1] === "object" ? entry[1] : {};
      if (!aliasId) continue;
      phaseOnDemand[aliasId] = {
        tier: String(src.tier || ""),
        openEvent: String(src.openEvent || ""),
      };
    }
    for (const entry of Object.entries(loaderDiagState.onDemandState || {})) {
      const aliasId = String(entry[0] || "").trim();
      if (!aliasId) continue;
      onDemandState[aliasId] = String(entry[1] || "");
    }
    for (const entry of Object.entries(loaderDiagState.currentPageLoads || {})) {
      const aliasId = String(entry[0] || "").trim();
      const src = entry[1] && typeof entry[1] === "object" ? entry[1] : {};
      if (!aliasId) continue;
      currentPageLoads[aliasId] = {
        phase: String(src.phase || ""),
        ok: src.ok === true ? true : (src.ok === false ? false : null),
        loadMs: Number.isFinite(Number(src.loadMs)) ? Number(src.loadMs) : null,
        ts: Number.isFinite(Number(src.ts)) ? Math.floor(Number(src.ts)) : null,
      };
    }
    return {
      pageStartedAt: Number(loaderDiagState.pageStartedAt) || PAGE_STARTED_AT,
      phaseOnDemand,
      onDemandState,
      currentPageLoads,
    };
  }

  function recordCurrentPageLoad(aliasIdRaw, sampleRaw) {
    try {
      const aliasId = String(aliasIdRaw || "").trim();
      if (!aliasId) return;
      const sample = sampleRaw && typeof sampleRaw === "object" ? sampleRaw : {};
      loaderDiagState.currentPageLoads[aliasId] = {
        phase: String(sample.phase || ""),
        ok: sample.ok === true ? true : (sample.ok === false ? false : null),
        loadMs: Number.isFinite(Number(sample.loadMs)) ? Number(sample.loadMs) : null,
        ts: Number.isFinite(Number(sample.ts)) ? Math.floor(Number(sample.ts)) : Date.now(),
      };
    } catch (_) {}
  }

  function setStatus(msg, isError = false) {
    try {
      const id = "h2o-ext-live-status";
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement("div");
        el.id = id;
        el.style.position = "fixed";
        el.style.bottom = "3px";
        el.style.right = "10px";
        el.style.zIndex = "2147483647";
        el.style.padding = "3px 6px";
        el.style.borderRadius = "7px";
        el.style.font = "10px/1.2 system-ui, -apple-system, Segoe UI, sans-serif";
        el.style.boxShadow = "0 2px 8px rgba(0,0,0,.28)";
        el.style.border = "1px solid rgba(255,255,255,.18)";
        el.style.pointerEvents = "none";
        document.documentElement.appendChild(el);
      }
      el.textContent = String(msg || "");
      el.style.background = isError ? "rgba(127,29,29,.92)" : "rgba(15,23,42,.92)";
      el.style.color = isError ? "#fecaca" : "#e2e8f0";
    } catch {}
  }

  function clearStatusLater(ms = 2200) {
    setTimeout(() => {
      try {
        const el = document.getElementById("h2o-ext-live-status");
        if (el && el.parentNode) el.parentNode.removeChild(el);
      } catch {}
    }, ms);
  }

  function hasVersionToken(url) {
    const raw = String(url || "");
    return /(?:[?&])(v|ver|version)=/.test(raw);
  }

  function stripDevCacheNoise(url) {
    const raw = String(url || "");
    if (!raw) return raw;
    try {
      const u = new URL(raw, location.href);
      u.searchParams.delete("extcb");
      u.searchParams.delete("cb");
      u.searchParams.delete("cacheBust");
      return u.toString();
    } catch {}
    return raw
      .replace(/([?&])extcb=[^&#]*(&)?/gi, (m, lead, tail) => tail ? lead : "")
      .replace(/([?&])cb=[^&#]*(&)?/gi, (m, lead, tail) => tail ? lead : "")
      .replace(/([?&])cacheBust=[^&#]*(&)?/gi, (m, lead, tail) => tail ? lead : "")
      .replace(/[?&]$/, "")
      .replace("?&", "?");
  }

  function withBuildAwareUrl(url, opts = null) {
    const raw = String(url || "");
    if (!raw) return raw;
    const mode = String(opts && opts.mode || "auto").trim().toLowerCase();
    if (mode === "none") return raw;
    if (mode === "force") {
      const sep = raw.includes("?") ? "&" : "?";
      return raw + sep + "extcb=" + encodeURIComponent(String(Date.now()) + "-" + Math.random().toString(36).slice(2));
    }
    if (hasVersionToken(raw)) return raw;
    return raw;
  }

  function sendFetchText(url) {
    return new Promise((resolve, reject) => {
      const reqUrl = withBuildAwareUrl(url, { mode: "none" });
      chrome.runtime.sendMessage({ type: MSG_FETCH_TEXT, url: reqUrl }, (resp) => {
        const le = chrome.runtime.lastError;
        if (le) {
          reject(new Error(String(le.message || le)));
          return;
        }
        if (!resp || !resp.ok) {
          reject(new Error(resp?.error || ("HTTP " + Number(resp?.status || 0))));
          return;
        }
        resolve({ text: String(resp.text || ""), url: reqUrl });
      });
    });
  }

  function sleepMs(ms = 0) {
    return new Promise((resolve) => {
      setTimeout(resolve, Math.max(0, Number(ms) || 0));
    });
  }

  function shouldOpenControlHubFromUrl() {
    try {
      const u = new URL(String(location.href || ""));
      const raw = String(u.searchParams.get(OPEN_CONTROL_HUB_PARAM) || "").trim().toLowerCase();
      return raw === "1" || raw === "true" || raw === "yes" || raw === "open";
    } catch {
      return false;
    }
  }

  function clearOpenControlHubUrlFlag() {
    try {
      const u = new URL(String(location.href || ""));
      if (!u.searchParams.has(OPEN_CONTROL_HUB_PARAM)) return;
      u.searchParams.delete(OPEN_CONTROL_HUB_PARAM);
      const next = u.pathname + (u.search ? u.search : "") + (u.hash ? u.hash : "");
      history.replaceState(history.state, "", next);
    } catch {}
  }

  function controlHubBridgeRequest(timeoutMs = 2200) {
    return new Promise((resolve, reject) => {
      const id = "chub_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        window.removeEventListener("message", onMessage, false);
        reject(new Error("control hub bridge timeout"));
      }, Math.max(300, Number(timeoutMs) || 2200));

      const onMessage = (ev) => {
        if (ev.source !== window) return;
        const data = ev.data;
        if (!data || data.type !== MSG_CONTROL_HUB_PAGE_RES || data.id !== id) return;
        if (done) return;
        done = true;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage, false);
        if (data.ok === false) {
          reject(new Error(String(data.error || "control hub bridge failed")));
          return;
        }
        resolve(data);
      };

      window.addEventListener("message", onMessage, false);
      try {
        window.postMessage({ type: MSG_CONTROL_HUB_PAGE_REQ, id }, "*");
      } catch (error) {
        done = true;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage, false);
        reject(error);
      }
    });
  }

  async function tryOpenControlHubNow(timeoutMs = CONTROL_HUB_OPEN_TIMEOUT_MS) {
    const t0 = Date.now();
    while (Date.now() - t0 < Math.max(1000, Number(timeoutMs) || CONTROL_HUB_OPEN_TIMEOUT_MS)) {
      const remainingMs = Math.max(250, Math.min(1500, Math.floor((Math.max(1000, Number(timeoutMs) || CONTROL_HUB_OPEN_TIMEOUT_MS) - (Date.now() - t0)))));
      try {
        const out = await controlHubBridgeRequest(remainingMs);
        if (out && out.ok !== false) {
          log("control hub opened via project script bridge");
          clearOpenControlHubUrlFlag();
          return true;
        }
      } catch {}
      await sleepMs(CONTROL_HUB_OPEN_RETRY_MS);
    }
    return false;
  }

  async function maybeAutoOpenControlHubFromUrl() {
    if (!shouldOpenControlHubFromUrl()) return false;
    const ok = await tryOpenControlHubNow(CONTROL_HUB_OPEN_TIMEOUT_MS);
    if (ok) {
      clearOpenControlHubUrlFlag();
      log("control hub auto-opened from URL flag");
      return true;
    }

    warn("control hub auto-open timed out");
    return false;
  }

  function directFetchText(url, timeoutMs = 10000) {
    const reqUrl = withBuildAwareUrl(url, { mode: "none" });
    return new Promise((resolve, reject) => {
      const ac = (typeof AbortController !== "undefined") ? new AbortController() : null;
      const timer = ac ? setTimeout(() => { try { ac.abort(); } catch {} }, Math.max(1000, Number(timeoutMs) || 10000)) : 0;
      fetch(reqUrl, {
        method: "GET",
        cache: "no-store",
        redirect: "follow",
        signal: ac ? ac.signal : undefined,
      }).then(async (res) => {
        const text = await res.text();
        if (!res.ok) throw new Error("HTTP " + Number(res.status || 0));
        resolve({
          text: String(text || ""),
          url: String(res.url || reqUrl),
        });
      }).catch((error) => {
        reject(error instanceof Error ? error : new Error(String(error || "fetch failed")));
      }).finally(() => {
        if (timer) {
          try { clearTimeout(timer); } catch {}
        }
      });
    });
  }

  function isTransientFetchTextError(error) {
    const msg = String(error && (error.stack || error.message || error) || "").toLowerCase();
    if (!msg) return false;
    return (
      msg.includes("could not establish connection")
      || msg.includes("receiving end does not exist")
      || msg.includes("message port closed")
      || msg.includes("user aborted a request")
      || msg.includes("the user aborted a request")
    );
  }

  async function loadProxyPackText(url) {
    let runtimeError = null;
    try {
      return await sendFetchText(url);
    } catch (error) {
      runtimeError = error;
    }

    if (isTransientFetchTextError(runtimeError)) {
      await sleepMs(180);
      try {
        return await sendFetchText(url);
      } catch (retryError) {
        runtimeError = retryError;
      }
    }

    try {
      const direct = await directFetchText(url, 10000);
      warn("proxy pack runtime fetch failed; used direct fetch fallback", {
        url: String(url || ""),
        error: String(runtimeError && (runtimeError.stack || runtimeError.message || runtimeError) || ""),
      });
      return direct;
    } catch (directError) {
      warn("proxy pack fetch failed; using catalog fallback only", {
        url: String(url || ""),
        runtimeError: String(runtimeError && (runtimeError.stack || runtimeError.message || runtimeError) || ""),
        directError: String(directError && (directError.stack || directError.message || directError) || ""),
      });
      return { text: "", url: String(url || ""), fallback: "catalog-only" };
    }
  }

  function sendHttp(req) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: MSG_HTTP, req }, (resp) => {
        const le = chrome.runtime.lastError;
        if (le) {
          reject(new Error(String(le.message || le)));
          return;
        }
        if (!resp || resp.ok === false) {
          reject(new Error(resp?.error || ("HTTP " + Number(resp?.status || 0))));
          return;
        }
        resolve(resp);
      });
    });
  }

  function consumePageDisableOnce() {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: MSG_PAGE_DISABLE_ONCE, op: "consume" }, (resp) => {
          const le = chrome.runtime.lastError;
          if (le) {
            warn("page-disable consume failed", le.message || String(le));
            resolve(false);
            return;
          }
          if (!resp || resp.ok === false) {
            if (resp && resp.error) warn("page-disable consume failed", resp.error);
            resolve(false);
            return;
          }
          resolve(resp.armed === true);
        });
      } catch (e) {
        warn("page-disable consume failed", e);
        resolve(false);
      }
    });
  }

  function getResolvedSetState(consumePreview = true) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({
          type: MSG_PAGE_SET_LINK,
          op: consumePreview ? "resolve-consume" : "resolve",
        }, (resp) => {
          const le = chrome.runtime.lastError;
          if (le) {
            warn("page-set resolve failed", le.message || String(le));
            resolve({ slot: 0, source: "global-toggles" });
            return;
          }
          if (!resp || resp.ok === false) {
            if (resp && resp.error) warn("page-set resolve failed", resp.error);
            resolve({ slot: 0, source: "global-toggles" });
            return;
          }
          const slot = Number(resp.slot);
          resolve({
            slot: Number.isFinite(slot) && slot > 0 ? Math.floor(slot) : 0,
            source: String(resp.source || resp.resolvedSource || "global-toggles"),
          });
        });
      } catch (e) {
        warn("page-set resolve failed", e);
        resolve({ slot: 0, source: "global-toggles" });
      }
    });
  }

  function isPlainObj(v) {
    return !!v && typeof v === "object" && !Array.isArray(v);
  }

  function clampTimeoutMs(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return ARCHIVE_TIMEOUT_MS;
    return Math.max(500, Math.min(120000, Math.floor(n)));
  }

  function sendArchiveReq(req, timeoutMs = ARCHIVE_TIMEOUT_MS) {
    if (String(req?.op || "") === "importBundle") return sendArchiveReqPort(req, timeoutMs);
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error("archive bridge timeout"));
      }, clampTimeoutMs(timeoutMs));

      try {
        chrome.runtime.sendMessage({ type: MSG_ARCHIVE_SW, req }, (resp) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          const le = chrome.runtime.lastError;
          if (le) {
            reject(new Error(String(le.message || le)));
            return;
          }
          if (!resp || resp.ok === false) {
            reject(new Error(String(resp?.error || "archive request failed")));
            return;
          }
          resolve(resp.result);
        });
      } catch (e) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  function sendArchiveReqPort(req, timeoutMs = ARCHIVE_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      let done = false;
      let port = null;
      const finish = (fn, value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { port?.disconnect?.(); } catch {}
        fn(value);
      };
      const timer = setTimeout(() => {
        finish(reject, new Error("archive bridge timeout"));
      }, clampTimeoutMs(timeoutMs));

      try {
        port = chrome.runtime.connect({ name: MSG_ARCHIVE_PORT });
        port.onMessage.addListener((resp) => {
          if (resp?.type === "archive-accepted" || resp?.type === "archive-keepalive") return;
          if (!resp || resp.ok === false) {
            finish(reject, new Error(String(resp?.error || "archive request failed")));
            return;
          }
          finish(resolve, resp.result);
        });
        port.onDisconnect.addListener(() => {
          if (done) return;
          const le = chrome.runtime.lastError;
          finish(reject, new Error(String(le?.message || "archive bridge disconnected before response")));
        });
        port.postMessage({ type: MSG_ARCHIVE_SW, req });
      } catch (e) {
        finish(reject, e);
      }
    });
  }

  function normalizeNsDisk(raw) {
    const ns = String(raw || DEFAULT_NS_DISK).trim();
    return ns || DEFAULT_NS_DISK;
  }

  function sendFolderReq(req, timeoutMs = 2200) {
    return new Promise((resolve, reject) => {
      const id = "folders_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        window.removeEventListener("message", onMessage, false);
        reject(new Error("folder bridge timeout"));
      }, clampTimeoutMs(timeoutMs));

      const onMessage = (ev) => {
        if (ev.source !== window) return;
        const data = ev.data;
        if (!data || data.type !== MSG_FOLDERS_RES || data.id !== id) return;
        if (done) return;
        done = true;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage, false);
        if (data.ok === false) {
          reject(new Error(String(data.error || "folder bridge failed")));
          return;
        }
        resolve(data.result);
      };

      window.addEventListener("message", onMessage, false);
      try {
        window.postMessage({
          type: MSG_FOLDERS_REQ,
          id,
          req,
        }, "*");
      } catch (error) {
        done = true;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage, false);
        reject(error);
      }
    });
  }

  let installPageFolderBridgePromise = null;

  function installPageFolderBridge(timeoutMs = 2200) {
    const scriptId = "h2o-ext-folder-bridge-page";
    const existing = document.getElementById(scriptId);
    if (existing && existing.dataset.h2oReady === "1") {
      return Promise.resolve(true);
    }
    if (installPageFolderBridgePromise) return installPageFolderBridgePromise;

    installPageFolderBridgePromise = new Promise((resolve, reject) => {
      const host = scriptHost();
      if (!host) {
        installPageFolderBridgePromise = null;
        reject(new Error("folder bridge host unavailable"));
        return;
      }

      const script = existing || document.createElement("script");
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        cleanup();
        installPageFolderBridgePromise = null;
        reject(new Error("folder bridge install timeout"));
      }, clampTimeoutMs(timeoutMs));

      const cleanup = () => {
        clearTimeout(timer);
        script.removeEventListener("load", onLoad, false);
        script.removeEventListener("error", onError, false);
      };
      const onLoad = () => {
        if (done) return;
        done = true;
        cleanup();
        script.dataset.h2oReady = "1";
        resolve(true);
      };
      const onError = () => {
        if (done) return;
        done = true;
        cleanup();
        installPageFolderBridgePromise = null;
        reject(new Error("folder bridge script load failed"));
      };

      script.addEventListener("load", onLoad, false);
      script.addEventListener("error", onError, false);

      if (!existing) {
        script.id = scriptId;
        script.async = false;
        script.dataset.h2oReady = "0";
        script.src = chrome.runtime.getURL(PAGE_FOLDER_BRIDGE_FILE);
        host.appendChild(script);
      }
    });

    return installPageFolderBridgePromise;
  }

  function installRuntimeFolderBridge() {
    if (window.__H2O_EXT_FOLDER_RUNTIME_BRIDGE_V1__) return;
    window.__H2O_EXT_FOLDER_RUNTIME_BRIDGE_V1__ = true;

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.type !== MSG_FOLDERS_SW) return undefined;
      installPageFolderBridge().then(() => sendFolderReq({
        op: String(msg.req && msg.req.op || ""),
        payload: isPlainObj(msg.req && msg.req.payload) ? msg.req.payload : {},
        nsDisk: normalizeNsDisk(msg.req && msg.req.nsDisk),
      })).then((result) => {
        sendResponse({ ok: true, result });
      }).catch((error) => {
        sendResponse({ ok: false, error: String(error && (error.stack || error.message || error)) });
      });
      return true;
    });
  }

  function installRuntimeHighlightBridge() {
    if (window.__H2O_EXT_HIGHLIGHT_RUNTIME_BRIDGE_V1__) return;
    window.__H2O_EXT_HIGHLIGHT_RUNTIME_BRIDGE_V1__ = true;

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.type !== "h2o-highlight-trigger") return undefined;
      try {
        window.postMessage({
          type: MSG_HIGHLIGHT_REQ,
          req: {
            action: String(msg.action || "popup"),
            color: String(msg.color || ""),
          },
        }, "*");
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: String(error && (error.stack || error.message || error)) });
      }
      return true;
    });
  }

  function installRuntimeControlHubBridge() {
    if (window.__H2O_EXT_CONTROL_HUB_RUNTIME_BRIDGE_V1__) return;
    window.__H2O_EXT_CONTROL_HUB_RUNTIME_BRIDGE_V1__ = true;

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.type !== MSG_CONTROL_HUB_OPEN) return undefined;
      (async () => {
        try {
          const timeoutMs = Number(msg.timeoutMs || CONTROL_HUB_OPEN_TIMEOUT_MS);
          const opened = await tryOpenControlHubNow(timeoutMs);
          sendResponse({ ok: opened, opened });
        } catch (error) {
          sendResponse({ ok: false, error: String(error && (error.stack || error.message || error)) });
        }
      })();
      return true;
    });
  }

  function installRuntimeIdentityFirstRunPromptBridge() {
    if (window.__H2O_EXT_IDENTITY_FIRST_RUN_PROMPT_BRIDGE_V1__) return;
    window.__H2O_EXT_IDENTITY_FIRST_RUN_PROMPT_BRIDGE_V1__ = true;

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.type !== MSG_IDENTITY_FIRST_RUN_PROMPT) return undefined;
      const action = String(msg.action || "force-show").trim().toLowerCase() || "force-show";
      try {
        window.postMessage({
          type: MSG_IDENTITY_FIRST_RUN_PROMPT,
          action,
          source: "ops-panel",
          at: Date.now(),
        }, "*");
        sendResponse({ ok: true, action });
      } catch (error) {
        sendResponse({ ok: false, error: String(error && (error.stack || error.message || error)) });
      }
      return true;
    });
  }

  function installRuntimeIdentityUpdateBridge() {
    if (window.__H2O_EXT_IDENTITY_UPDATE_BRIDGE_V1__) return;
    window.__H2O_EXT_IDENTITY_UPDATE_BRIDGE_V1__ = true;

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.type !== MSG_IDENTITY_PUSH) return undefined;
      try {
        window.postMessage({ type: MSG_IDENTITY_PUSH, snapshot: msg.snapshot || null, at: Date.now() }, "*");
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: String(error && (error.message || error)) });
      }
      return true;
    });
    log("identity update bridge ready");
  }

  function installPageHttpBridge() {
    window.addEventListener("message", (ev) => {
      if (ev.source !== window) return;
      const data = ev.data;
      if (!data || data.type !== MSG_HTTP_REQ || !data.id || !data.req) return;

      const id = String(data.id);
      const req = data.req;

      sendHttp(req).then((resp) => {
        try {
          window.postMessage({ type: MSG_HTTP_RES, id, ...resp }, "*");
        } catch {}
      }).catch((e) => {
        try {
          window.postMessage({
            type: MSG_HTTP_RES,
            id,
            ok: false,
            status: 0,
            error: String(e && (e.stack || e.message || e)),
          }, "*");
        } catch {}
      });
    }, false);
    log("page HTTP bridge ready");
  }

  function installPageArchiveBridge() {
    // Best-effort anti-spam gate for same-page callers. This is not a cryptographic trust boundary.
    const archiveSession = { clientId: "", token: "" };
    const AUTH_FREE_OPS = new Set(["ping", "initSession", "h2o:library-storage:diagnose", "h2o:library-storage:inspect-schema"]);
    const ALLOW_OPS = new Set([
      "ping",
      "initSession",
      "getBootMode",
      "setBootMode",
      "getMigratedFlag",
      "setMigratedFlag",
      "getChatIndex",
      "setChatIndex",
      "captureSnapshot",
      "loadLatestSnapshot",
      "loadSnapshot",
      "listSnapshots",
      "listAllChatIds",
      "listChatIds",
      "listWorkbenchRows",
      "getFoldersList",
      "resolveFolderBindings",
      "setFolderBinding",
      "upsertLatestSnapshotMeta",
      "getLabelsCatalog",
      "pinSnapshot",
      "deleteSnapshot",
      "applyRetention",
      "openWorkbench",
      "exportBundle",
      "importBundle",
      "h2o:library-storage:diagnose",
      "h2o:library-storage:create-empty-schema",
      "h2o:library-storage:inspect-schema",
      "h2o:library-storage:write-chat-registry-mirror",
      // Library KV (Phase 1.6): durable backend for H2O.Library.Store via the SW's
      // h2o_library_kv IndexedDB. Page → loader → SW. These ops go through the same
      // session-auth check as snapshot ops (they are NOT in AUTH_FREE_OPS).
      "libraryKvGet",
      "libraryKvSet",
      "libraryKvDel",
      "libraryKvListKeys",
      "libraryKvEstimate",
    ]);
    const makeToken = () => {
      const now = Date.now().toString(36);
      const rnd = Math.random().toString(36).slice(2, 14);
      return "archtok_" + now + "_" + rnd;
    };
    const reply = (id, out) => {
      try { window.postMessage({ type: MSG_ARCHIVE_RES, id, ...out }, "*"); } catch {}
    };

    window.addEventListener("message", (ev) => {
      if (ev.source !== window) return;
      const data = ev.data;
      if (!isPlainObj(data) || data.type !== MSG_ARCHIVE_REQ) return;

      const id = String(data.id || "").trim();
      const req = data.req;
      const bad = !id || !isPlainObj(req) || typeof req.op !== "string" || !req.op.trim() || (req.payload != null && !isPlainObj(req.payload));
      if (bad) {
        reply(id || ("bad-" + Date.now()), { ok: false, error: "invalid archive bridge payload" });
        return;
      }

      const op = String(req.op || "").trim();
      const payload = isPlainObj(req.payload) ? req.payload : {};

      // Privileged diagnostic op handled entirely in the loader (does NOT reach the SW).
      // Returns the loader's build info so callers can confirm which loader.js is active.
      if (op === "__loaderInfo") {
        reply(id, {
          ok: true,
          result: {
            ok: true,
            source: "page-bridge-loader",
            loaderBuildTs: LOADER_BUILD_TS,
            loaderBuildIso: LOADER_BUILD_ISO,
            libraryKvOps: LOADER_LIBRARY_KV_OPS,
            allowOps: Array.from(ALLOW_OPS).sort(),
            allowOpsCount: ALLOW_OPS.size,
            tag: TAG,
          },
        });
        return;
      }

      if (op === "__loaderRuntimeStats") {
        readRuntimeStats().then((stats) => {
          const safeStats = stats && typeof stats === "object" && !Array.isArray(stats) ? stats : {};
          reply(id, {
            ok: true,
            result: {
              ok: true,
              source: "page-bridge-loader",
              key: STORAGE_RUNTIME_KEY,
              stats: safeStats,
              count: Object.keys(safeStats).length,
              at: Date.now(),
            },
          });
        }).catch((e) => {
          reply(id, {
            ok: false,
            error: String(e && (e.message || e) || "runtime stats read failed"),
          });
        });
        return;
      }

      if (op === "__loaderDiag") {
        try {
          const diag = cloneLoaderDiagState();
          reply(id, {
            ok: true,
            result: {
              ok: true,
              source: "page-bridge-loader",
              at: Date.now(),
              diag,
              countPhaseOnDemand: Object.keys(diag.phaseOnDemand).length,
              countOnDemandState: Object.keys(diag.onDemandState).length,
              countCurrentPageLoads: Object.keys(diag.currentPageLoads).length,
            },
          });
        } catch (e) {
          reply(id, {
            ok: false,
            error: String(e && (e.message || e) || "__loaderDiag failed"),
          });
        }
        return;
      }

      // Loader V2.1: V3 diagnostics report. Returns the loader-side portion
      // (phase timings, waves, per-script timings/lane/wait reasons). The
      // page-side bridge (0A0a) merges this with its own surfaces map before
      // returning to callers via H2O.scheduler.report(). When V3_DIAG_ENABLED
      // is false, returns { enabled: false } and no real work was done.
      if (op === "__schedulerReport") {
        try {
          const report = v3GetReport();
          reply(id, { ok: true, result: { ok: true, source: "page-bridge-loader", at: Date.now(), report } });
        } catch (e) {
          reply(id, { ok: false, error: String(e && (e.message || e) || "__schedulerReport failed") });
        }
        return;
      }

      if (!ALLOW_OPS.has(op)) {
        reply(id, { ok: false, error: "unsupported archive op: " + op });
        return;
      }

      if (op === "initSession") {
        const clientId = String(payload.clientId || "").trim();
        if (!clientId) {
          reply(id, { ok: false, error: "missing clientId for initSession" });
          return;
        }
        archiveSession.clientId = clientId.slice(0, 120);
        archiveSession.token = makeToken();
        reply(id, { ok: true, result: { ok: true, source: "page-bridge", clientId: archiveSession.clientId, sessionToken: archiveSession.token } });
        return;
      }

      if (!AUTH_FREE_OPS.has(op)) {
        const clientId = String(payload.clientId || "").trim();
        const sessionToken = String(payload.sessionToken || "").trim();
        if (!archiveSession.clientId || !archiveSession.token) {
          reply(id, { ok: false, error: "archive session not initialized" });
          return;
        }
        if (!clientId || !sessionToken || clientId !== archiveSession.clientId || sessionToken !== archiveSession.token) {
          reply(id, { ok: false, error: "archive session unauthorized" });
          return;
        }
      }

      sendArchiveReq({
        op,
        payload,
        nsDisk: req.nsDisk,
      }, data.timeoutMs).then((result) => {
        reply(id, { ok: true, result });
      }).catch((e) => {
        reply(id, {
          ok: false,
          error: String(e && (e.stack || e.message || e)),
        });
      });
    }, false);
    log(
      "page archive bridge ready (session hardening active) | loaderBuildTs=" + LOADER_BUILD_TS +
      " (" + LOADER_BUILD_ISO + ") | libraryKvOps=" + (LOADER_LIBRARY_KV_OPS ? "YES" : "NO") +
      " | allowOps=" + ALLOW_OPS.size
    );
  }

  function installPageIdentityBridge() {
    const ALLOW_ACTIONS = new Set([
      "identity:get-snapshot", "identity:set-snapshot", "identity:clear-snapshot",
      "identity:get-onboarding-url", "identity:open-onboarding",
      "identity:get-derived-state",
      "identity:request-email-otp",
      "identity:verify-email-otp",
      "identity:sign-up-with-password",
      "identity:verify-signup-email-code",
      "identity:resend-signup-confirmation",
      "identity:sign-in-with-password",
      "identity:sign-in-with-google",
      "identity:request-password-reset",
      "identity:request-password-recovery-code",
      "identity:verify-password-recovery-code",
      "identity:update-password-after-recovery",
      "identity:update-profile",
      "identity:rename-workspace",
      "identity:change-password",
      "identity:create-profile",
      "identity:create-workspace",
      "identity:complete-onboarding",
      "identity:attach-local-profile",
      "identity:migrate-local-workspace",
      "identity:refresh-session",
      "identity:sign-out",
    ]);
    const reply = (id, out) => {
      try { window.postMessage({ type: MSG_IDENTITY_RES, id, ...out }, "*"); } catch {}
    };
    window.addEventListener("message", (ev) => {
      if (ev.source !== window) return;
      const data = ev.data;
      if (!data || data.type !== MSG_IDENTITY_REQ || !data.id || !data.req) return;
      const id = String(data.id);
      const action = String(data.req.action || "");
      if (!ALLOW_ACTIONS.has(action)) {
        reply(id, { ok: false, error: "unsupported identity action: " + action });
        return;
      }
      chrome.runtime.sendMessage({ type: MSG_IDENTITY_SW, req: data.req }, (resp) => {
        const le = chrome.runtime.lastError;
        if (le) { reply(id, { ok: false, error: String(le.message || le) }); return; }
        reply(id, resp || { ok: false, error: "no identity response" });
      });
    }, false);
    log("page identity bridge ready");
  }

  function installPageBillingBridge() {
    const ALLOW_ACTIONS = new Set([
      "billing:create-checkout-session",
      "billing:get-current-entitlement",
      "billing:create-customer-portal-session",
    ]);
    const reply = (id, out) => {
      try { window.postMessage({ type: MSG_BILLING_RES, id, ...out }, "*"); } catch {}
    };
    window.addEventListener("message", (ev) => {
      if (ev.source !== window) return;
      const data = ev.data;
      if (!data || data.type !== MSG_BILLING_REQ || !data.id || !data.req) return;
      const id = String(data.id);
      const action = String(data.req.action || "");
      if (!ALLOW_ACTIONS.has(action)) {
        reply(id, {
          ok: false,
          errorCode: "billing/provider-unavailable",
          errorMessage: "billing-stage/loader-action-blocked",
        });
        return;
      }
      const req = { action };
      if (action === "billing:create-checkout-session") {
        req.planKey = String(data.req.planKey || "");
      }
      chrome.runtime.sendMessage({
        type: MSG_BILLING_SW,
        req,
      }, (resp) => {
        const le = chrome.runtime.lastError;
        if (le) {
          reply(id, {
            ok: false,
            errorCode: "billing/provider-unavailable",
            errorMessage: "billing-stage/loader-runtime-last-error",
          });
          return;
        }
        reply(id, resp || {
          ok: false,
          errorCode: "billing/provider-unavailable",
          errorMessage: "billing-stage/loader-empty-background-response",
        });
      });
    }, false);
    log("page billing bridge ready");
  }

  function readTag(metaText, tag) {
    const rx = new RegExp("^\\\\s*//\\\\s*@" + tag + "\\\\s+(.+?)\\\\s*$", "mi");
    const m = String(metaText || "").match(rx);
    return m ? String(m[1]).trim() : "";
  }

  function normalizeRunAt(runAtRaw) {
    const v = String(runAtRaw || "").trim().toLowerCase().replace(/_/g, "-");
    if (v === "document-start") return "document-start";
    if (v === "document-end") return "document-end";
    return "document-idle";
  }

  function stripEmojiAndInvisibles(textRaw) {
    return String(textRaw || "")
      .replace(/[\\u{1F3FB}-\\u{1F3FF}]/gu, "")
      .replace(/[\\p{Extended_Pictographic}]/gu, "")
      .replace(/[\\uFE0E\\uFE0F\\u200D\\u200B-\\u200F\\uFEFF\\u2060\\u00AD]/g, "")
      .replace(/[\\u202A-\\u202E\\u2066-\\u2069]/g, "");
  }

  function toAliasName(filenameRaw) {
    const base = String(filenameRaw || "").replace(/(\\.user)?\\.js$/i, "");
    const firstDot = base.indexOf(".");
    if (firstDot <= 0) return "";
    const id = base.slice(0, firstDot).trim();
    let title = base.slice(firstDot + 1);
    title = stripEmojiAndInvisibles(title)
      .trim()
      .replace(/\\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!id || !title) return "";
    return id + "._" + title + "_.js";
  }

  function normalizeAliasId(aliasRaw) {
    const alias = toAliasName(aliasRaw);
    if (alias) return alias;
    const raw = String(aliasRaw || "").trim();
    return raw ? raw.replace(/\\.user\\.js$/i, ".js") : "";
  }

  function collectSectionAliasIds(sectionTitlesRaw) {
    const wanted = new Set(
      (Array.isArray(sectionTitlesRaw) ? sectionTitlesRaw : [sectionTitlesRaw])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    );
    if (!wanted.size) return [];

    const out = [];
    const seen = new Set();
    const sections = Array.isArray(DEV_ORDER_SECTIONS) ? DEV_ORDER_SECTIONS : [];
    for (const sec of sections) {
      const title = String(sec && sec.title || "").trim();
      if (!wanted.has(title)) continue;
      const items = Array.isArray(sec && sec.items) ? sec.items : [];
      for (const row of items) {
        const aliasId = normalizeAliasId(row && row.file || "");
        if (!aliasId || seen.has(aliasId)) continue;
        seen.add(aliasId);
        out.push(aliasId);
      }
    }
    return out;
  }

  function aliasIdFromRequireUrl(urlStr) {
    const raw = String(urlStr || "").trim();
    if (!raw) return "";
    try {
      const u = new URL(raw, location.href);
      const parts = String(u.pathname || "").split("/").filter(Boolean);
      const idx = parts.lastIndexOf("alias");
      const tail = idx >= 0 ? parts.slice(idx + 1).join("/") : (parts[parts.length - 1] || "");
      return normalizeAliasId(decodeURIComponent(tail || ""));
    } catch {}
    const m = raw.match(new RegExp("/alias/([^?#]+)", "i"));
    if (m) {
      try { return normalizeAliasId(decodeURIComponent(m[1])); } catch { return normalizeAliasId(m[1]); }
    }
    return normalizeAliasId(raw);
  }

  function stripDevCacheNoise(url) {
    const raw = String(url || "");
    if (!raw) return raw;
    try {
      const u = new URL(raw, location.href);
      u.searchParams.delete("extcb");
      u.searchParams.delete("cb");
      u.searchParams.delete("cacheBust");
      return u.toString();
    } catch {}
    return raw
      .replace(/([?&])extcb=[^&#]*(&)?/gi, (m, lead, tail) => tail ? lead : "")
      .replace(/([?&])cb=[^&#]*(&)?/gi, (m, lead, tail) => tail ? lead : "")
      .replace(/([?&])cacheBust=[^&#]*(&)?/gi, (m, lead, tail) => tail ? lead : "")
      .replace(/[?&]$/, "")
      .replace("?&", "?");
  }

  function parseProxyPack(packText) {
    const headers = String(packText || "").match(HDR_RE) || [];
    const out = [];

    for (const h of headers) {
      const name = readTag(h, "name") || "(unnamed)";
      const runAt = normalizeRunAt(readTag(h, "run-at") || "document-idle");
      const rawRequireUrl = readTag(h, "require");
      if (!rawRequireUrl) continue;
      const aliasId = aliasIdFromRequireUrl(rawRequireUrl) || name;
      const requireUrl = stripDevCacheNoise(rawRequireUrl);
      out.push({ name, runAt, requireUrl, aliasId });
    }

    return out;
  }

  function aliasRequireUrl(aliasIdRaw) {
    const aliasId = normalizeAliasId(aliasIdRaw);
    if (!aliasId) return "";
    const enc = encodeURIComponent(aliasId);
    // Always include a build-time cache-bust on the catalog-only fallback
    // URL. Without this, when the proxy-pack fetch fails (CORS, SW asleep,
    // network blip), the loader builds URLs here that the browser HTTP cache
    // then serves stale forever — even after the source file is edited and
    // the extension is rebuilt. LOADER_BUILD_TS changes on every chrome-live
    // rebuild, so each rebuild forces a fresh fetch of every module.
    const cacheBust = "?v=" + String(LOADER_BUILD_TS || Date.now());
    try {
      const u = new URL(PROXY_PACK_URL);
      return u.origin + "/alias/" + enc + cacheBust;
    } catch {}
    return "http://127.0.0.1:5500/alias/" + enc + cacheBust;
  }

  function normalizeCatalog(rawCatalog) {
    const map = {};
    const order = [];
    if (!rawCatalog || typeof rawCatalog !== "object") return { map, order };
    for (const [k, v] of Object.entries(rawCatalog)) {
      const aliasId = normalizeAliasId(k);
      if (!aliasId) continue;
      const meta = v && typeof v === "object" ? v : {};
      const tier = String(meta.tier || "L4").trim() || "L4";
      const openEvent = String(meta.openEvent || "").trim();
      map[aliasId] = {
        name: String(meta.name || aliasId),
        runAt: normalizeRunAt(meta.runAt || "document-idle"),
        runtimeGroup: String(meta.runtimeGroup || ""),
        runtimeOrder: Number.isFinite(Number(meta.runtimeOrder)) ? Number(meta.runtimeOrder) : null,
        tier,
        openEvent,
      };
      order.push(aliasId);
    }
    return { map, order };
  }

  function applyRuntimeOrderFix(items) {
    if (!Array.isArray(items) || !items.length) return items;
    let next = items.slice();
    const groups = new Map();

    for (const item of next) {
      const group = String(item && item.runtimeGroup || "").trim();
      const aliasId = String(item && item.aliasId || "").trim();
      const order = Number(item && item.runtimeOrder);
      if (!group || !aliasId || !Number.isFinite(order)) continue;
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push({ aliasId, order });
    }

    for (const rows of groups.values()) {
      const wanted = rows
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((row) => row.aliasId);
      if (wanted.length < 2) continue;
      const present = wanted.filter((aliasId) => next.some((item) => String(item && item.aliasId || "") === aliasId));
      if (present.length < 2) continue;
      const presentSet = new Set(present);
      const insertAt = next.findIndex((item) => presentSet.has(String(item && item.aliasId || "")));
      if (insertAt < 0) continue;
      const byAlias = new Map(next.map((item) => [String(item && item.aliasId || ""), item]));
      const rest = next.filter((item) => !presentSet.has(String(item && item.aliasId || "")));
      const reordered = present.map((aliasId) => byAlias.get(aliasId)).filter(Boolean);
      next = [...rest.slice(0, insertAt), ...reordered, ...rest.slice(insertAt)];
    }

    return next;
  }


  function mergeScriptsWithCatalog(proxyScripts, rawCatalog) {
    const fromPack = Array.isArray(proxyScripts) ? proxyScripts : [];
    const catalog = normalizeCatalog(rawCatalog);
    const byAlias = {};
    const out = [];
    const seen = new Set();

    for (const aliasId of catalog.order) {
      const meta = catalog.map[aliasId] || {};
      byAlias[aliasId] = {
        name: String(meta.name || aliasId),
        runAt: normalizeRunAt(meta.runAt || "document-idle"),
        requireUrl: aliasRequireUrl(aliasId),
        aliasId,
        tier: String(meta.tier || "L4") || "L4",
        openEvent: String(meta.openEvent || ""),
      };
    }

    for (let i = 0; i < fromPack.length; i++) {
      const item = fromPack[i] || {};
      const aliasId = normalizeAliasId(item.aliasId || "");
      if (!aliasId) continue;

      const base = byAlias[aliasId] || {
        name: aliasId,
        runAt: "document-idle",
        requireUrl: aliasRequireUrl(aliasId),
        aliasId,
        tier: "L4",
        openEvent: "",
      };
      const merged = {
        ...base,
        ...item,
        aliasId,
        name: String(item.name || base.name || aliasId),
        runAt: normalizeRunAt(item.runAt || base.runAt || "document-idle"),
        requireUrl: String(stripDevCacheNoise(item.requireUrl || base.requireUrl || aliasRequireUrl(aliasId))),
        tier: String(item.tier || base.tier || "L4").trim() || "L4",
        openEvent: String(item.openEvent || base.openEvent || "").trim(),
      };

      byAlias[aliasId] = merged;
      if (seen.has(aliasId)) {
        const idx = out.findIndex((it) => String(it && it.aliasId || "") === aliasId);
        if (idx >= 0) out[idx] = merged;
      } else {
        out.push(merged);
        seen.add(aliasId);
      }
    }

    for (const aliasId of catalog.order) {
      if (seen.has(aliasId)) continue;
      const base = byAlias[aliasId];
      if (!base) continue;
      out.push(base);
      seen.add(aliasId);
    }

    return applyRuntimeOrderFix(out);
  }

  function normalizeOrderOverrideMap(rawMap) {
    const out = {};
    if (!rawMap || typeof rawMap !== "object") return out;
    for (const [k, v] of Object.entries(rawMap)) {
      const aliasId = normalizeAliasId(k);
      if (!aliasId) continue;
      out[aliasId] = v === true;
    }
    return out;
  }

  function normalizeSetMap(rawMap) {
    const out = {};
    if (!rawMap || typeof rawMap !== "object") return out;
    for (const [k, v] of Object.entries(rawMap)) {
      const aliasId = normalizeAliasId(k);
      if (!aliasId) continue;
      out[aliasId] = v !== false;
    }
    return out;
  }

  function normalizeToggleSets(rawSets) {
    const out = {};
    if (!rawSets || typeof rawSets !== "object") return out;
    for (const [slot, rawRec] of Object.entries(rawSets)) {
      const slotNum = Number(slot);
      if (!Number.isFinite(slotNum) || slotNum <= 0) continue;
      if (!rawRec || typeof rawRec !== "object") continue;
      const maybeMap = rawRec && typeof rawRec.map === "object" ? rawRec.map : rawRec;
      out[String(slotNum)] = {
        map: normalizeSetMap(maybeMap),
      };
    }
    return out;
  }

  function resolveToggleMapForPage(globalMapRaw, toggleSetsRaw, slotRaw) {
    const slot = Number(slotRaw);
    if (!Number.isFinite(slot) || slot <= 0) return globalMapRaw || {};
    const toggleSets = normalizeToggleSets(toggleSetsRaw);
    const rec = toggleSets[String(Math.floor(slot))];
    if (!rec || !rec.map || typeof rec.map !== "object") return globalMapRaw || {};
    const out = {};
    for (const [aliasId, enabled] of Object.entries(rec.map)) {
      const key = normalizeAliasId(aliasId);
      if (!key) continue;
      if (enabled === false) out[key] = false;
    }
    return out;
  }

  function buildAllOffToggleMap(itemsRaw) {
    const out = {};
    const items = Array.isArray(itemsRaw) ? itemsRaw : [];
    for (const item of items) {
      const aliasId = normalizeAliasId(item && item.aliasId || "");
      if (!aliasId) continue;
      out[aliasId] = false;
    }
    return out;
  }

  function collectOrderEnabledMap(rawSections, overridesRaw) {
    const out = {};
    const sections = Array.isArray(rawSections) ? rawSections : [];
    for (const sec of sections) {
      const items = Array.isArray(sec && sec.items) ? sec.items : [];
      for (const row of items) {
        const aliasId = normalizeAliasId(row && row.file || "");
        if (!aliasId) continue;
        out[aliasId] = row && row.enabled === true;
      }
    }
    const overrides = normalizeOrderOverrideMap(overridesRaw);
    for (const [aliasId, enabled] of Object.entries(overrides)) {
      out[aliasId] = enabled === true;
    }
    return out;
  }

  function loadLoaderState() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([STORAGE_KEY, STORAGE_SETS_KEY, STORAGE_ORDER_OVERRIDES_KEY], (res) => {
          const le = chrome.runtime.lastError;
          if (le) {
            warn("storage get failed", le.message || String(le));
            resolve({ toggleMap: {}, toggleSets: {}, orderOverrideMap: {} });
            return;
          }
          const toggleMap = res && typeof res[STORAGE_KEY] === "object" && res[STORAGE_KEY]
            ? res[STORAGE_KEY]
            : {};
          const toggleSets = res && typeof res[STORAGE_SETS_KEY] === "object" && res[STORAGE_SETS_KEY]
            ? res[STORAGE_SETS_KEY]
            : {};
          const orderOverrideMap = res && typeof res[STORAGE_ORDER_OVERRIDES_KEY] === "object" && res[STORAGE_ORDER_OVERRIDES_KEY]
            ? res[STORAGE_ORDER_OVERRIDES_KEY]
            : {};
          resolve({
            toggleMap: normalizeSetMap(toggleMap),
            toggleSets: normalizeToggleSets(toggleSets),
            orderOverrideMap: normalizeOrderOverrideMap(orderOverrideMap),
          });
        });
      } catch (e) {
        warn("storage unavailable", e);
        resolve({ toggleMap: {}, toggleSets: {}, orderOverrideMap: {} });
      }
    });
  }

  function readRuntimeStats() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([STORAGE_RUNTIME_KEY], (res) => {
          const le = chrome.runtime.lastError;
          if (le) {
            warn("runtime storage get failed", le.message || String(le));
            resolve({});
            return;
          }
          const map = res && typeof res[STORAGE_RUNTIME_KEY] === "object" && res[STORAGE_RUNTIME_KEY]
            ? res[STORAGE_RUNTIME_KEY]
            : {};
          resolve(map);
        });
      } catch {
        resolve({});
      }
    });
  }

  function writeRuntimeStats(nextMap) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [STORAGE_RUNTIME_KEY]: nextMap }, () => resolve());
      } catch {
        resolve();
      }
    });
  }

  function heapUsedBytes() {
    try {
      const n = Number(globalThis.performance && performance.memory && performance.memory.usedJSHeapSize);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    } catch {
      return 0;
    }
  }

  function heapProbeSupported() {
    try {
      const n = Number(globalThis.performance && performance.memory && performance.memory.usedJSHeapSize);
      return Number.isFinite(n) && n >= 0;
    } catch {
      return false;
    }
  }

  function roundMs(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return 0;
    if (n > 0 && n < 0.1) return 0.1;
    return Math.round(n * 10) / 10;
  }

  function normalizeRuntimeEntry(raw) {
    const o = raw && typeof raw === "object" ? raw : {};
    const loads = Number(o.loads);
    const failures = Number(o.failures);
    const ts = Number(o.ts);
    const lastSeen = Number(o.lastSeen);
    const phase = String(o.lastPhase || o.phase || "");
    const lastLoadMs = Number(o.lastLoadMs);
    const ewmaLoadMs = Number(o.ewmaLoadMs);
    const lastHeapDeltaBytes = Number(o.lastHeapDeltaBytes);
    const heapSupported = o.heapSupported !== false;
    return {
      loads: Number.isFinite(loads) ? Math.max(0, Math.floor(loads)) : 0,
      failures: Number.isFinite(failures) ? Math.max(0, Math.floor(failures)) : 0,
      lastSeen: Number.isFinite(lastSeen) && lastSeen > 0
        ? Math.max(0, Math.floor(lastSeen))
        : (Number.isFinite(ts) ? Math.max(0, Math.floor(ts)) : 0),
      ts: Number.isFinite(ts) ? Math.max(0, Math.floor(ts)) : (Number.isFinite(lastSeen) ? Math.max(0, Math.floor(lastSeen)) : 0),
      lastPhase: phase,
      phase,
      lastLoadMs: Number.isFinite(lastLoadMs) ? roundMs(lastLoadMs) : 0,
      ewmaLoadMs: Number.isFinite(ewmaLoadMs) ? roundMs(ewmaLoadMs) : 0,
      lastHeapDeltaBytes: Number.isFinite(lastHeapDeltaBytes) ? Math.round(lastHeapDeltaBytes) : 0,
      heapSupported: !!heapSupported,
    };
  }

  function trimRuntimeStatsMap(map) {
    const entries = Object.entries(map || {}).filter(([k]) => String(k || "").trim());
    if (entries.length <= RUNTIME_KEEP_LIMIT) return map || {};
    entries.sort((a, b) => {
      const at = Number(a[1] && a[1].lastSeen) || 0;
      const bt = Number(b[1] && b[1].lastSeen) || 0;
      return bt - at;
    });
    const next = {};
    for (let i = 0; i < entries.length && i < RUNTIME_KEEP_LIMIT; i++) {
      const [k, v] = entries[i];
      next[k] = v;
    }
    return next;
  }

  function mergeRuntimeSample(prev, sample) {
    const base = normalizeRuntimeEntry(prev);
    const s = sample && typeof sample === "object" ? sample : {};
    const loadMs = roundMs(Number(s.loadMs));
    const heapDeltaBytes = Number.isFinite(Number(s.heapDeltaBytes)) ? Math.round(Number(s.heapDeltaBytes)) : 0;
    const heapSupported = typeof s.heapSupported === "boolean" ? s.heapSupported : (base.heapSupported !== false);
    const ok = !!s.ok;
    const now = Number.isFinite(Number(s.ts)) ? Math.floor(Number(s.ts)) : Date.now();

    if (ok) {
      base.loads += 1;
      base.lastLoadMs = loadMs;
      base.ewmaLoadMs = base.ewmaLoadMs > 0
        ? roundMs((base.ewmaLoadMs * (1 - RUNTIME_EWMA_ALPHA)) + (loadMs * RUNTIME_EWMA_ALPHA))
        : loadMs;
    } else {
      base.failures += 1;
    }

    base.lastSeen = now;
    base.lastPhase = String(s.phase || "");
    base.phase = base.lastPhase;
    base.ts = base.lastSeen;
    base.lastHeapDeltaBytes = heapDeltaBytes;
    base.heapSupported = !!heapSupported;
    return base;
  }

  async function flushRuntimeSamples(samples) {
    if (!Array.isArray(samples) || !samples.length) return;
    const existing = await readRuntimeStats();
    const next = { ...existing };
    for (const sample of samples) {
      const aliasId = String(sample && sample.aliasId || "").trim();
      if (!aliasId) continue;
      next[aliasId] = mergeRuntimeSample(next[aliasId], sample);
    }
    await writeRuntimeStats(trimRuntimeStatsMap(next));
  }

  function decideScriptState(item, toggleMap, orderEnabledMap) {
    const key = normalizeAliasId(item?.aliasId || item?.name || "");
    if (!key) {
      return {
        key,
        enabled: true,
        orderAllowed: true,
        toggleAllowed: true,
      };
    }
    let orderAllowed = true;
    if (orderEnabledMap && Object.prototype.hasOwnProperty.call(orderEnabledMap, key)) {
      orderAllowed = orderEnabledMap[key] === true;
    }
    const toggleAllowed = !(toggleMap && Object.prototype.hasOwnProperty.call(toggleMap, key) && toggleMap[key] === false);
    return {
      key,
      enabled: orderAllowed && toggleAllowed,
      orderAllowed,
      toggleAllowed,
    };
  }

  function scriptHost() {
    return document.head || document.documentElement || document.body || null;
  }

  function waitScriptHost(maxWaitMs = 1800) {
    const t0 = Date.now();
    return new Promise((resolve) => {
      const tick = () => {
        const host = scriptHost();
        if (host) return resolve(host);
        if (Date.now() - t0 >= maxWaitMs) return resolve(null);
        setTimeout(tick, 30);
      };
      tick();
    });
  }

  function timeoutForPhase(phase) {
    if (phase === "document-start") return SCRIPT_LOAD_TIMEOUT_START_MS;
    if (phase === "document-end") return SCRIPT_LOAD_TIMEOUT_END_MS;
    return SCRIPT_LOAD_TIMEOUT_IDLE_MS;
  }

  function slowWarnForPhase(phase) {
    if (phase === "document-start") return SCRIPT_SLOWLOAD_WARN_START_MS;
    if (phase === "document-end") return SCRIPT_SLOWLOAD_WARN_END_MS;
    return SCRIPT_SLOWLOAD_WARN_IDLE_MS;
  }

  function nextFrame() {
    return new Promise((resolve) => {
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => resolve());
      } else {
        setTimeout(resolve, 16);
      }
    });
  }

  function loadExternalScript(url, phase = "document-idle", options = null) {
    return new Promise((resolve, reject) => {
      const host = scriptHost();
      if (!host) return reject(new Error("document host unavailable"));

      const opts = options && typeof options === "object" ? options : null;
      const aliasIdRaw = opts && opts.aliasId ? String(opts.aliasId) : "";

      const s = document.createElement("script");
      s.type = "text/javascript";
      s.async = false;
      s.src = withBuildAwareUrl(url);
      if (aliasIdRaw) {
        try { s.dataset.h2oAlias = aliasIdRaw; } catch {}
      }

      const timeoutMs = Math.max(1000, Number(opts?.timeoutMs) || timeoutForPhase(phase));
      const slowWarnMs = Math.max(250, Number(opts?.slowWarnMs) || slowWarnForPhase(phase));

      let done = false;
      let hardTimer = 0;
      let slowTimer = 0;

      const cleanup = () => {
        if (hardTimer) {
          try { clearTimeout(hardTimer); } catch {}
        }
        if (slowTimer) {
          try { clearTimeout(slowTimer); } catch {}
        }
        try { if (s.parentNode) s.parentNode.removeChild(s); } catch {}
      };

      const finish = (ok, value) => {
        if (done) return;
        done = true;
        cleanup();
        if (ok) resolve(value);
        else reject(value instanceof Error ? value : new Error(String(value || "script load failed")));
      };

      s.onload = () => {
        finish(true, s.src || url);
      };
      s.onerror = () => {
        finish(false, new Error("script load blocked/failed: " + String(s.src || url)));
      };

      host.appendChild(s);

      nextFrame().then(() => {
        if (done) return;

        slowTimer = setTimeout(() => {
          if (done) return;
          try {
            log("slow-load", phase, String(s.src || url), { timeoutMs, slowWarnMs });
          } catch {}
        }, slowWarnMs);

        hardTimer = setTimeout(() => {
          if (done) return;
          finish(false, new Error("script load timeout: " + String(s.src || url)));
        }, timeoutMs);
      });
    });
  }

  function yieldToBrowser() {
    return new Promise((resolve) => {
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => resolve());
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  function waitDomContentLoaded() {
    if (document.readyState === "interactive" || document.readyState === "complete") {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      document.addEventListener("DOMContentLoaded", resolve, { once: true });
    });
  }

  async function waitDomIdle() {
    await waitDomContentLoaded();
    await new Promise((resolve) => {
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(resolve, { timeout: 180 });
      } else {
        setTimeout(resolve, 32);
      }
    });
  }

  function idleSerialAlias(aliasIdRaw) {
    const aliasId = String(aliasIdRaw || "").trim();
    if (!aliasId) return false;
    return IDLE_SERIAL_ALIAS_SET.has(aliasId);
  }

  async function loadOneScript(it, idx, total, phase, runtimeSamples = [], progressState = null) {
    const pos = progressState ? (Number(progressState.done) + 1) : (idx + 1);
    const label = String(it?.aliasId || it?.name || "script");
    setStatus(STATUS_LABEL + ": loading " + pos + "/" + total + " · " + label);
    const t0 = (globalThis.performance && typeof performance.now === "function") ? performance.now() : Date.now();
    const heapSupported = heapProbeSupported();
    const heap0 = heapUsedBytes();
    try {
      const loadedUrl = await loadExternalScript(it.requireUrl, phase, {
        timeoutMs: timeoutForPhase(phase),
        slowWarnMs: slowWarnForPhase(phase),
        aliasId: it && it.aliasId ? String(it.aliasId) : "",
      });
      const t1 = (globalThis.performance && typeof performance.now === "function") ? performance.now() : Date.now();
      const heap1 = heapUsedBytes();
      const sample = {
        aliasId: it.aliasId,
        phase,
        ok: true,
        loadMs: roundMs(t1 - t0),
        heapDeltaBytes: heap1 && heap0 ? (heap1 - heap0) : 0,
        heapSupported,
        ts: Date.now(),
      };
      runtimeSamples.push(sample);
      recordCurrentPageLoad(it && it.aliasId, sample);
      log(phase, "[" + (idx + 1) + "/" + total + "]", it.name, it.aliasId, "loaded", loadedUrl);
      return 1;
    } catch (e) {
      const t1 = (globalThis.performance && typeof performance.now === "function") ? performance.now() : Date.now();
      const heap1 = heapUsedBytes();
      const sample = {
        aliasId: it.aliasId,
        phase,
        ok: false,
        loadMs: roundMs(t1 - t0),
        heapDeltaBytes: heap1 && heap0 ? (heap1 - heap0) : 0,
        heapSupported,
        ts: Date.now(),
      };
      runtimeSamples.push(sample);
      recordCurrentPageLoad(it && it.aliasId, sample);
      err(phase, "[" + (idx + 1) + "/" + total + "]", it.name, it.aliasId, e);
      return 0;
    } finally {
      if (progressState) progressState.done = Number(progressState.done) + 1;
    }
  }

  async function loadPhase(items, phase, runtimeSamples = [], progressState = null) {
    const list = Array.isArray(items) ? items : [];
    let loaded = 0;
    const total = progressState ? Number(progressState.total) : list.length;
    const isIdle = phase === "document-idle";
    const serialList = isIdle ? list.filter((it) => idleSerialAlias(it && it.aliasId)) : list;
    const parallelList = isIdle ? list.filter((it) => !idleSerialAlias(it && it.aliasId)) : [];

    // V3 lane labels — pseudo-waves from the existing serial/parallel split.
    const serialLane = isIdle ? "idle-serial" : ("phase-" + phase);
    if (serialList.length) v3WaveStart(serialLane);

    for (let i = 0; i < serialList.length; i++) {
      const it = serialList[i];
      const aliasId = it && it.aliasId ? String(it.aliasId) : "";
      // First script in lane waits for the phase boundary; subsequent scripts
      // wait for their predecessor in the serial chain.
      const waitedFor = i === 0
        ? ("phase:" + phase)
        : (serialList[i - 1] && serialList[i - 1].aliasId ? String(serialList[i - 1].aliasId) : null);
      const waitReason = i === 0 ? "phase" : "serial_predecessor";
      v3Dispatch(aliasId, serialLane, waitedFor, waitReason);
      const r = await loadOneScript(it, i, total, phase, runtimeSamples, progressState);
      v3Settle(aliasId, serialLane, r === 1, null);
      loaded += r;
      await yieldToBrowser();
    }

    if (serialList.length) v3WaveEnd(serialLane);

    if (parallelList.length) {
      const batchSize = 6;
      let batchN = 0;
      for (let start = 0; start < parallelList.length; start += batchSize) {
        const lane = isIdle ? ("idle-parallel-batch-" + batchN) : ("phase-" + phase + "-batch-" + batchN);
        v3WaveStart(lane);
        const chunk = parallelList.slice(start, start + batchSize);
        // All scripts in a parallel batch dispatch together — none "waits for"
        // a sibling. They wait for the previous batch's completion (or the
        // phase boundary on the first batch). waitReason is best-effort.
        const batchWaitReason = (batchN === 0 && serialList.length === 0) ? "phase" : "none";
        const batchWaitedFor = (batchN === 0 && serialList.length === 0) ? ("phase:" + phase) : null;
        const tasks = chunk.map((it, localIdx) => {
          const globalIdx = serialList.length + start + localIdx;
          const aliasId = it && it.aliasId ? String(it.aliasId) : "";
          v3Dispatch(aliasId, lane, batchWaitedFor, batchWaitReason);
          return loadOneScript(it, globalIdx, total, phase, runtimeSamples, progressState).then((r) => {
            v3Settle(aliasId, lane, r === 1, null);
            return r;
          });
        });
        const results = await Promise.all(tasks);
        loaded += results.reduce((sum, n) => sum + Number(n || 0), 0);
        v3WaveEnd(lane);
        batchN += 1;
        await yieldToBrowser();
      }
    }

    return loaded;
  }

  async function boot() {
    try {
      if (typeof performance !== "undefined" && typeof performance.mark === "function") {
        performance.mark("h2o:loader:boot:start");
      }
    } catch {}
    // V3 diagnostics: capture boot start; phase timings populate as each
    // phase begins/ends. No-op when V3_DIAG_ENABLED=false.
    v3Diag.bootStartMs = v3Now();

    // Phase 4 Step 5b: V2 flag — single source of truth, captured once at
    // boot start. When OFF, every V2 branch below is dead code and the V1
    // load path runs byte-identically. localStorage access is wrapped in
    // try/catch because some sandboxed contexts can throw on access.
    let V2_ENABLED = false;
    try {
      V2_ENABLED = (typeof localStorage !== "undefined")
        && (localStorage.getItem("H2O_LOADER_V2_ENABLED") === "1");
    } catch (_) { V2_ENABLED = false; }

    setStatus(STATUS_LABEL + ": loading...");
    log("boot start", location.href);
    if (ENABLE_TOGGLES && await consumePageDisableOnce()) {
      log("page-only disable armed; skipping script load for this page", location.href);
      setStatus(STATUS_LABEL + ": disabled for this page load");
      clearStatusLater(2600);
      return;
    }
    installRuntimeFolderBridge();
    installRuntimeHighlightBridge();
    installRuntimeControlHubBridge();
    installRuntimeIdentityFirstRunPromptBridge();
    installRuntimeIdentityUpdateBridge();
    installPageHttpBridge();
    installPageArchiveBridge();
    installPageIdentityBridge();
    installPageBillingBridge();

    const packRes = await loadProxyPackText(PROXY_PACK_URL);
    const fromPack = parseProxyPack(packRes.text);
    const all = mergeScriptsWithCatalog(fromPack, DEV_SCRIPT_CATALOG);
    if (!all.length) {
      warn("no scripts available (proxy pack + catalog)", PROXY_PACK_URL);
      setStatus(STATUS_LABEL + ": no scripts parsed", true);
      return;
    }

    const enabled = [];
    const disabled = [];
    const loaderState = await loadLoaderState();
    const resolvedSetState = ENABLE_TOGGLES ? await getResolvedSetState(true) : { slot: 0, source: "global-toggles" };
    const resolvedSetSlot = Number(resolvedSetState && resolvedSetState.slot) || 0;
    const resolvedSource = String(resolvedSetState && resolvedSetState.source || "global-toggles");
    const toggleMap = ENABLE_TOGGLES
      ? (resolvedSource === "all-off"
        ? buildAllOffToggleMap(all)
        : resolveToggleMapForPage(loaderState.toggleMap, loaderState.toggleSets, resolvedSetSlot))
      : {};
    const orderEnabledMap = collectOrderEnabledMap(DEV_ORDER_SECTIONS, loaderState.orderOverrideMap);
    const disabledBy = {
      orderOnly: 0,
      toggleOnly: 0,
      both: 0,
    };
    for (const it of all) {
      const decision = decideScriptState(it, toggleMap, orderEnabledMap);
      if (decision.enabled) {
        enabled.push(it);
      } else {
        disabled.push(it);
        if (!decision.orderAllowed && !decision.toggleAllowed) disabledBy.both += 1;
        else if (!decision.orderAllowed) disabledBy.orderOnly += 1;
        else disabledBy.toggleOnly += 1;
      }
    }

    // Phase 4 Step 5b: V2-flag-gated L5 routing. When V2 is OFF, phaseOnDemand
    // stays empty and phaseInputs is the same 'enabled' array reference (no
    // copy made), so the phase-splitting loop below iterates the exact same
    // array as in V1. When V2 is ON, scripts with tier "L5" AND a non-empty
    // openEvent are diverted to phaseOnDemand instead of phaseStart/End/Idle.
    // Disabled scripts (already filtered by decideScriptState above) are
    // unaffected — their off-state always wins over tier classification.
    const phaseOnDemand = [];
    let phaseInputs = enabled;
    if (V2_ENABLED) {
      const eager = [];
      for (const it of enabled) {
        const tier = String(it && it.tier || "");
        const openEvent = String(it && it.openEvent || "");
        if (tier === "L5" && openEvent) {
          phaseOnDemand.push(it);
        } else {
          eager.push(it);
        }
      }
      phaseInputs = eager;
    }
    {
      clearPlainObject(loaderDiagState.phaseOnDemand);
      for (const it of phaseOnDemand) {
        const aliasId = String(it && it.aliasId || "").trim();
        if (!aliasId) continue;
        loaderDiagState.phaseOnDemand[aliasId] = {
          tier: String(it && it.tier || ""),
          openEvent: String(it && it.openEvent || ""),
        };
        if (!loaderDiagState.onDemandState[aliasId]) loaderDiagState.onDemandState[aliasId] = "eligible";
      }
    }

    const phaseStart = [];
    const phaseEnd = [];
    const phaseIdle = [];
    for (const it of phaseInputs) {
      if (it.runAt === "document-start") phaseStart.push(it);
      else if (it.runAt === "document-end") phaseEnd.push(it);
      else phaseIdle.push(it);
    }

    if (V2_ENABLED && phaseOnDemand.length) {
      log("v2 phaseOnDemand", phaseOnDemand.length, phaseOnDemand.map((it) => it.aliasId));
    }

    log("scripts", {
      total: all.length,
      fromPack: fromPack.length,
      fromCatalogOnly: Math.max(0, all.length - fromPack.length),
      resolvedSetSlot,
      resolvedSource,
      enabled: enabled.length,
      disabled: disabled.length,
      disabledBy,
      start: phaseStart.length,
      end: phaseEnd.length,
      idle: phaseIdle.length,
    });
    if (disabled.length) {
      log("disabled aliases", disabled.map((d) => d.aliasId));
    }

    // Defense-in-depth: publish the disabled-alias list to the page world via
    // a DOM attribute on <html>. The loader's decideScriptState gate filters
    // scripts out of the inject loop above, but that gate is a single point of
    // failure — any future code path that injects a script bypasses it. Per-
    // script runtime gates (inside each module's IIFE) read this attribute
    // before any DOM ops / observers / listeners and self-abort. The attribute
    // mechanism is CSP-safe (no inline <script>); page-world scripts read it
    // synchronously at boot. Always set the attribute (even when empty) so
    // scripts can rely on its presence to mean "loader has decided".
    try {
      const disabledAliasIds = disabled
        .map((d) => normalizeAliasId(d && d.aliasId || ""))
        .filter(Boolean);
      const html = document && document.documentElement;
      if (html) {
        html.setAttribute("data-h2o-disabled-aliases", JSON.stringify(disabledAliasIds));
      }
    } catch (err) {
      warn("publish disabled-aliases attribute failed", err && (err.message || err));
    }

    const host = await waitScriptHost();
    if (!host) {
      warn("script host not ready");
      setStatus(STATUS_LABEL + ": script host missing", true);
      return;
    }

    // Phase 4 Step 5b: install the on-demand load listener BEFORE any phase
    // load runs, so an open-event dispatched by an early-loading script can't
    // arrive before our subscription is in place. Listener is gated on V2 +
    // non-empty phaseOnDemand so V1 (and V2-with-no-L5-scripts) installs no
    // listener and pays no overhead. Loads use loadOneScript() so the timing
    // sample / status panel / heap probe instrumentation matches eager loads.
    if (V2_ENABLED && phaseOnDemand.length) {
      const onDemandByAlias = new Map();
      for (const it of phaseOnDemand) onDemandByAlias.set(String(it.aliasId), it);
      const loadedOnDemand = new Set();
      const loadingOnDemand = new Set();

      // Phase 4 Step 5d: auto-bridge openEvent → on-demand-load.
      // The Bridge's registerOnDemand (5c) creates this same wiring when
      // a script calls it — but L5 tabs can't call registerOnDemand until
      // they're loaded, and they can't load until SOMETHING dispatches the
      // on-demand-load event. The loader resolves the chicken-and-egg by
      // installing per-openEvent listeners directly from the catalog.
      // Group aliases by openEvent so each event installs ONE listener
      // that loads all subscribed L5 scripts.
      const aliasesByOpenEvent = new Map();
      for (const it of phaseOnDemand) {
        const openEv = String(it && it.openEvent || "").trim();
        if (!openEv) continue;
        if (!aliasesByOpenEvent.has(openEv)) aliasesByOpenEvent.set(openEv, []);
        aliasesByOpenEvent.get(openEv).push(String(it.aliasId));
      }
      for (const [openEv, aliases] of aliasesByOpenEvent) {
        try {
          window.addEventListener(openEv, () => {
            for (const aliasId of aliases) {
              try {
                window.dispatchEvent(new CustomEvent("evt:h2o:loader:on-demand-load", {
                  detail: { aliasId },
                }));
              } catch (_) {}
            }
          }, false);
        } catch (_) {}
      }

      window.addEventListener("evt:h2o:loader:on-demand-load", async (evt) => {
        const aliasId = String(evt && evt.detail && evt.detail.aliasId || "").trim();
        if (!aliasId) return;
        const it = onDemandByAlias.get(aliasId);
        if (!it) {
          warn("on-demand: unknown aliasId", aliasId);
          return;
        }
        if (loadedOnDemand.has(aliasId) || loadingOnDemand.has(aliasId)) return;
        loadingOnDemand.add(aliasId);
        try { loaderDiagState.onDemandState[aliasId] = "loading"; } catch (_) {}
        try {
          const samples = [];
          const ok = await loadOneScript(it, 0, 1, "document-idle", samples, null);
          if (!ok) warn("on-demand: load failed; not retrying", aliasId);
          // Mark as completed regardless of success — prevents infinite retry
          // on persistent failures. The runtime sample records the failure
          // for diagnostic visibility via H2O.loader.report().
          loadedOnDemand.add(aliasId);
          try { loaderDiagState.onDemandState[aliasId] = "loaded"; } catch (_) {}
          try { await flushRuntimeSamples(samples); } catch (_) {}
        } catch (e) {
          // NOTE: do NOT call err(...) here — 'err' is the loader's error
          // logger but 'e' is the caught Error. Use warn() to avoid the
          // shadowing/typeof bug.
          warn("on-demand: dispatch handler threw", aliasId, e);
          loadedOnDemand.add(aliasId);
          try { loaderDiagState.onDemandState[aliasId] = "loaded"; } catch (_) {}
        } finally {
          loadingOnDemand.delete(aliasId);
        }
      }, false);
    }

    const runtimeSamples = [];
    let loadedTotal = 0;
    const progressState = { total: enabled.length, done: 0 };
    try { performance.mark("h2o:phase:start:start"); } catch {}
    v3PhaseStart("document-start");
    loadedTotal += await loadPhase(phaseStart, "document-start", runtimeSamples, progressState);
    try { performance.mark("h2o:phase:start:end"); } catch {}
    v3PhaseEnd("document-start");
    await waitDomContentLoaded();
    try { performance.mark("h2o:phase:end:start"); } catch {}
    v3PhaseStart("document-end");
    loadedTotal += await loadPhase(phaseEnd, "document-end", runtimeSamples, progressState);
    try { performance.mark("h2o:phase:end:end"); } catch {}
    v3PhaseEnd("document-end");
    await waitDomIdle();
    try { performance.mark("h2o:phase:idle:start"); } catch {}
    v3PhaseStart("document-idle");

    // ─── V3.1 dispatcher (gated on H2O_LOADER_V3_DISPATCHER_MODE === "active",
    //     and not killed by H2O_LOADER_V3_DISPATCHER_KILL === "1"). When OFF,
    //     this branch is dead code and V2.x's loadPhase(phaseIdle, ...) below
    //     runs byte-identically — phaseIdle is the same array reference,
    //     DISPATCHER_LOADED_ALIASES stays empty, and the filter short-circuits.
    let phaseIdleForV2x = phaseIdle;
    if (V3_DISPATCHER_ACTIVE) {
      try {
        dispatcherWaveResult = await runV3Dispatcher(phaseIdle, runtimeSamples, progressState);
        loadedTotal += DISPATCHER_LOADED_ALIASES.size;
        if (DISPATCHER_LOADED_ALIASES.size > 0) {
          // SAFEGUARD #2: filter dispatcher-loaded aliases out of phaseIdle
          // before V2.x continuation. V2.x has no settled-tracking Map — its
          // predecessor logic is purely positional within the input array.
          // Filtering IS the seeding: V2.x simply doesn't see (or wait on)
          // scripts the dispatcher already loaded. Failed dispatcher scripts
          // are NOT in the set, so V2.x retries them as normal.
          phaseIdleForV2x = phaseIdle.filter(function (it) {
            return !(it && it.aliasId && DISPATCHER_LOADED_ALIASES.has(String(it.aliasId)));
          });
          log("v3-dispatcher", "loaded", DISPATCHER_LOADED_ALIASES.size,
            "aliases via dispatcher; v2.x will continue with",
            phaseIdleForV2x.length, "remaining (was", phaseIdle.length, ")");
        } else {
          log("v3-dispatcher", "loaded 0 aliases; V2.x continues unchanged. result=",
            dispatcherWaveResult && (dispatcherWaveResult.fallbackReason || "ok"));
        }
      } catch (e) {
        // Defensive: any uncaught dispatcher error → V2.x runs everything.
        warn("v3-dispatcher", "uncaught error; falling back to V2.x", e);
        dispatcherWaveResult = {
          ok: false, fellBack: true,
          fallbackReason: "dispatcher-uncaught:" + String((e && e.message) || e),
          fallbackAtMs: v3Now(),
          mode: V3_DISPATCHER_MODE,
          tiers: V3D_TIER_ORDER.slice(),
          tierResults: {},
          v2xResumedFrom: "L0",
        };
        phaseIdleForV2x = phaseIdle;
      }
    }

    loadedTotal += await loadPhase(phaseIdleForV2x, "document-idle", runtimeSamples, progressState);
    try { performance.mark("h2o:phase:idle:end"); } catch {}
    v3PhaseEnd("document-idle");
    await flushRuntimeSamples(runtimeSamples);
    await maybeAutoOpenControlHubFromUrl();

    try { performance.mark("h2o:loader:boot:end"); } catch {}
    v3Diag.bootEndMs = v3Now();
    log("boot done");
    setStatus(
      STATUS_LABEL +
      ": loaded " + loadedTotal + "/" + enabled.length +
      " (disabled " + disabled.length +
      " = order " + disabledBy.orderOnly +
      " + toggles " + disabledBy.toggleOnly +
      " + both " + disabledBy.both + ")"
    );
    clearStatusLater();
  }

  // ── Cross-surface sync bridge (Studio ↔ native via chrome.storage) ───────
  // 0F1h runs as a page-world userscript on chatgpt.com and therefore cannot
  // touch chrome.storage directly. This content-script slice forwards
  // onChanged events for the two known cross-surface broadcast keys to page
  // world via window.postMessage, and accepts outbound write requests so the
  // page can publish its own broadcasts. Strictly additive: only handles
  // those two keys and the postMessage types listed below.
  //
  // Source-filter note: rather than gating on ev.source identity (which
  // diverges between page main-world and content-script isolated-world
  // WindowProxy references), we gate on the uniquely-namespaced message-type
  // strings below. This matches the page-world half (0F1h) and avoids the
  // cross-world identity check that silently drops legitimate bridge frames.
  (() => {
    const MSG_CS_EVENT = "h2o-ext-cs:v1:event";
    const MSG_CS_WRITE = "h2o-ext-cs:v1:write";
    const MSG_CS_PROBE = "h2o-ext-cs:v1:probe";
    const MSG_CS_READY = "h2o-ext-cs:v1:ready";
    // CustomEvent channel names — dispatched on document (not window)
    // because document events traverse the DOM event system that IS shared
    // between page main-world and content-script isolated-world. This is
    // a transport-redundant backup for environments where the
    // window.postMessage cross-world hop is unreliable.
    const EV_PROBE = "h2o-ext-cs:probe";
    const EV_WRITE = "h2o-ext-cs:write";
    const EV_READY = "h2o-ext-cs:ready";
    const EV_EVENT = "h2o-ext-cs:event";
    const STUDIO_KEY = "h2o:library:cross-surface:broadcast:v1";
    const NATIVE_KEY = "h2o:library:cross-surface:broadcast:native:v1";
    const WATCHED = new Set([STUDIO_KEY, NATIVE_KEY]);
    const DIAG = (typeof TAG === "string" ? TAG : "[H2O cs-bridge]");
    const dlog = (...args) => { try { console.info(DIAG, "cs-bridge", ...args); } catch (_) {} };

    const hasStorage = !!(chrome && chrome.storage && chrome.storage.local);
    dlog(hasStorage ? "init" : "init.degraded", hasStorage ? "ready" : "no chrome.storage — probe-only");

    // Send READY through BOTH transports. CustomEvent on document is the
    // primary fallback because the DOM event system is shared between
    // worlds; window.postMessage is kept for symmetry with archive bridge.
    function sendReady(reason) {
      const detail = { t: Date.now(), reason: String(reason || "") };
      try { window.postMessage({ type: MSG_CS_READY, ...detail }, "*"); } catch {}
      try { document.dispatchEvent(new CustomEvent(EV_READY, { detail })); } catch {}
      dlog("ready.sent", reason || "");
    }

    function sendEvent(key, newValue, oldValue, opts = {}) {
      const detail = {
        key, newValue, oldValue,
        t: Date.now(),
        replay: !!opts.replay,
      };
      try {
        window.postMessage({ type: MSG_CS_EVENT, ...detail }, "*");
      } catch {}
      try {
        document.dispatchEvent(new CustomEvent(EV_EVENT, { detail }));
      } catch {}
    }

    function handleProbe(srcLabel, attempt) {
      dlog("probe.recv", srcLabel + " attempt=" + (attempt || 0));
      sendReady("probe-response");
      // After the handshake, push the current value of the two broadcast
      // keys so a page-world consumer that booted after the most recent
      // chrome.storage write still gets the state. No-op if storage is
      // unreachable in this context.
      if (hasStorage) replayCurrentBroadcasts();
    }

    function handleWrite(srcLabel, key, value) {
      if (!WATCHED.has(String(key || ""))) return;
      if (!hasStorage) {
        dlog("write.skip", srcLabel + " no chrome.storage");
        return;
      }
      try {
        chrome.storage.local.set({ [key]: value }, () => {
          if (chrome.runtime && chrome.runtime.lastError) {
            dlog("write.err", String(chrome.runtime.lastError.message || chrome.runtime.lastError));
          } else {
            dlog("write.ok", srcLabel + " key=" + key);
          }
        });
      } catch (e) {
        dlog("write.throw", String(e && (e.message || e)));
      }
    }

    function replayCurrentBroadcasts() {
      if (!hasStorage) return;
      try {
        chrome.storage.local.get([STUDIO_KEY, NATIVE_KEY], (items) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            dlog("replay.err", String(chrome.runtime.lastError.message || chrome.runtime.lastError));
            return;
          }
          for (const key of WATCHED) {
            const value = items && items[key];
            if (!value) continue;
            sendEvent(key, value, undefined, { replay: true });
          }
        });
      } catch (e) {
        dlog("replay.throw", String(e && (e.message || e)));
      }
    }

    // Transport 1: window.postMessage. Registered UNCONDITIONALLY so that
    // even if chrome.storage is briefly unavailable on early document_start
    // ticks, the probe→READY handshake still completes and 0F1h's
    // bridgeReady flag flips true.
    window.addEventListener("message", (ev) => {
      const data = ev && ev.data;
      if (!data || typeof data !== "object") return;
      const type = data.type;
      if (type === MSG_CS_PROBE) { handleProbe("postMessage", data.attempt); return; }
      if (type === MSG_CS_WRITE) { handleWrite("postMessage", data.key, data.value); return; }
    }, false);

    // Transport 2: CustomEvent on document. Survives some isolated-world
    // edge cases where window.postMessage cross-world hops are dropped.
    document.addEventListener(EV_PROBE, (ev) => {
      handleProbe("custom-event", ev && ev.detail && ev.detail.attempt);
    }, false);
    document.addEventListener(EV_WRITE, (ev) => {
      const d = (ev && ev.detail) || {};
      handleWrite("custom-event", d.key, d.value);
    }, false);

    if (hasStorage) {
      try {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area !== "local" || !changes) return;
          for (const key of Object.keys(changes)) {
            if (!WATCHED.has(key)) continue;
            const ch = changes[key];
            sendEvent(key, ch && ch.newValue, ch && ch.oldValue);
          }
        });
      } catch (e) {
        dlog("onChanged.bind.err", String(e && (e.message || e)));
      }
    }

    // Best-effort unsolicited READY beacons. They cover the corner case
    // where 0F1h registers its listener AFTER content-script init but
    // BEFORE 0F1h's own probe fires — the page-world listener catches
    // one of the beacons and flips bridgeReady=true with no probe needed.
    sendReady("init");
    setTimeout(() => sendReady("init+200"), 200);
    setTimeout(() => sendReady("init+800"), 800);
  })();

  boot().catch((e) => {
    err("boot fatal", e);
    setStatus(STATUS_LABEL + ": boot fatal (check console)", true);
  });
})();
`;
}
