// H2O Gemini Firefox dev stub — content script.
// Phase 8G-9 (2026-05-19): minimal proof-of-chain stub. Does NOT interfere with
// the gemini.google.com UI. Logs to console + sets a single non-visible marker
// on document.documentElement so external smoke tests can detect injection.
//
// This file will be replaced by real Gemini Firefox integration logic in later
// phases. Until then, keep it as small as possible.

(function () {
  "use strict";

  if (document.documentElement.dataset.h2oGeminiFirefoxDev === "loaded") {
    return;
  }
  document.documentElement.dataset.h2oGeminiFirefoxDev = "loaded";

  // eslint-disable-next-line no-console
  console.log("[H2O Gemini Firefox dev stub] loaded on", location.host);
})();
