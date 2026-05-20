// H2O ChatGPT Firefox dev stub — content script.
// Phase 8G-6 (2026-05-19): minimal proof-of-chain stub. Does NOT interfere with
// the chatgpt.com UI. Logs to console + sets a single non-visible marker on
// document.documentElement so external smoke tests can detect injection.
//
// This file is intentionally separate from the chatgpt+chrome legacy at
// src-runtime-base/ (renamed from scripts/ in Phase 8K-5) + surfaces/. The
// chatgpt+chrome legacy runtime is frozen and lives
// at the top level; this Firefox build starts fresh and grows alongside.
// Real ChatGPT Firefox feature logic comes in later phases.

(function () {
  "use strict";

  if (document.documentElement.dataset.h2oChatgptFirefoxDev === "loaded") {
    return;
  }
  document.documentElement.dataset.h2oChatgptFirefoxDev = "loaded";

  // eslint-disable-next-line no-console
  console.log("[H2O ChatGPT Firefox dev stub] loaded on", location.host);
})();
