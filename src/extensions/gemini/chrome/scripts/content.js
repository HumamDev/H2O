// H2O Gemini Chrome dev stub — content script.
// Phase 8G-7 (2026-05-19): minimal proof-of-chain stub. Does NOT interfere with
// the gemini.google.com UI. Logs to console + sets a single non-visible marker
// on document.documentElement so external smoke tests can detect injection.
//
// This file will be replaced by real Gemini integration logic in later phases.
// Until then, keep it as small as possible.

(function () {
  "use strict";

  if (document.documentElement.dataset.h2oGeminiChromeDev === "loaded") {
    return;
  }
  document.documentElement.dataset.h2oGeminiChromeDev = "loaded";

  // eslint-disable-next-line no-console
  console.log("[H2O Gemini Chrome dev stub] loaded on", location.host);
})();
