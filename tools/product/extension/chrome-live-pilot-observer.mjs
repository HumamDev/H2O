// @version 1.0.0
//
// P3-pilot page-world observer.
//
// Loaded via web_accessible_resources (NOT inline) to satisfy ChatGPT's
// strict CSP — see the original P3-pilot v1 attempt that used inline
// textContent injection and was blocked. This file is injected by the
// loader (chrome-live-loader.mjs) when localStorage.H2O_LOADER_V3_DISPATCHER_PILOT
// === "1" via:
//   script.src = chrome.runtime.getURL("pilot-observer-page.js");
//
// Behavior:
//   - Bounded-retries up to 3000ms for window.H2O.events.onReady availability.
//   - Subscribes (idempotently) to all 10 wave-exit events (9 required + 1
//     conditional per P3c findings).
//   - On first observation per event, postMessage's the firedAtMs back to
//     the loader (isolated world) via window.postMessage.
//   - On install timeout, posts a single __pilot_install_error__ message.
//
// Pure observation. No DOM changes. No script-loading changes. No
// userscript modifications. Idempotent — re-loading the same file in the
// same page is a no-op via the guard flag.
export function makeChromeLivePilotObserverJs() {
  return `"use strict";
(function () {
  if (window.__H2O_PILOT_OBSERVER_V1__) return;
  window.__H2O_PILOT_OBSERVER_V1__ = true;

  // Must match constants in chrome-live-loader.mjs.
  const MSG_TYPE = ${JSON.stringify("H2O_PILOT_OBS_v1")};
  const INSTALL_ERR_EV = ${JSON.stringify("__pilot_install_error__")};
  const INSTALL_OK_EV  = ${JSON.stringify("__pilot_install_ok__")};

  // 9 required wave-exit events + 1 conditional. Order matches loader's
  // PILOT_WAVE_EXIT_REQUIRED (L0/L1/L2/L3) + PILOT_WAVE_EXIT_OPTIONAL (L4).
  const EVENTS = [
    "evt:h2o:core:ready",
    "evt:h2o:obs:ready",
    "evt:h2o:data:ready",
    "h2o:identity:ready",
    "h2o.ev:prm:cgx:cntrlhb:ready:v1",
    "evt:h2o:minimap:engine-ready",
    "h2o.ev:prm:cgx:lib:ready:v1",
    "h2o.ev:prm:cgx:sap:ready:v1",
    "evt:h2o:theme:ready",
    "h2o:dpanel:ready",
    "h2o:wrkspc:ready",
    "evt:h2o:inputdock:ready"
  ];

  const startedAt = (typeof performance !== "undefined" && performance.now)
    ? performance.now() : Date.now();
  const seen = Object.create(null);

  function nowMs() {
    return (typeof performance !== "undefined" && performance.now)
      ? performance.now() : Date.now();
  }

  function postObs(ev) {
    if (seen[ev]) return;
    seen[ev] = true;
    try {
      window.postMessage({
        type: MSG_TYPE,
        ev: ev,
        firedAtMs: nowMs(),
        source: "onReady-page-observer-war",
      }, "*");
    } catch (_) {}
  }

  function postInstallOk() {
    try {
      window.postMessage({
        type: MSG_TYPE,
        ev: INSTALL_OK_EV,
        firedAtMs: nowMs(),
        source: "war-observer-installed",
      }, "*");
    } catch (_) {}
  }

  function postInstallError(reason) {
    try {
      window.postMessage({
        type: MSG_TYPE,
        ev: INSTALL_ERR_EV,
        firedAtMs: nowMs(),
        source: String(reason || "war-observer-install-failed"),
      }, "*");
    } catch (_) {}
  }

  function tryInstall() {
    const W = window;
    if (!W.H2O || !W.H2O.events || typeof W.H2O.events.onReady !== "function") {
      if (nowMs() - startedAt > 3000) {
        postInstallError("onReady-unavailable-after-3000ms");
        return;
      }
      setTimeout(tryInstall, 25);
      return;
    }
    let installedCount = 0;
    for (let i = 0; i < EVENTS.length; i++) {
      const ev = EVENTS[i];
      try {
        W.H2O.events.onReady(ev, function () { postObs(ev); });
        installedCount += 1;
      } catch (_) {}
    }
    if (installedCount === 0) {
      postInstallError("onReady-subscribe-failed-for-all-events");
    } else {
      postInstallOk();
    }
  }

  tryInstall();
})();
`;
}
