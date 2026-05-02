// @version 1.0.0
import path from "node:path";

export function makeChromeLiveReadme({
  OUT_DIR,
  PROXY_PACK_URL,
  DEV_HAS_CONTROLS,
}) {
  const outAbs = path.resolve(OUT_DIR);
  if (!DEV_HAS_CONTROLS) {
    return `H2O Dev Loader Extension (Lean, Unpacked)
==========================================

This is the DEV-only lean loader extension button (no popup toggles).

How it works:
- Content script fetches:
  ${PROXY_PACK_URL}
- It parses the proxy pack, then merges with the local scripts catalog and loads by @run-at phase.
- It skips chrome.storage toggle reads for slightly faster startup.

IMPORTANT:
- Keep your local server running on 127.0.0.1:5500.
- Disable H2O Dev Controls if both point to the same page (avoid duplicate injection).

Install:
1) Open chrome://extensions
2) Enable Developer mode
3) Click Load unpacked
4) Select this folder:
   ${outAbs}

Daily workflow:
1) Run Common / 3
2) Run the lean DEV build task (or lean combined task)
3) Refresh chatgpt.com tab
`;
  }

  return `H2O Dev Controls Extension (Unpacked)
=====================================

This is the DEV-only extension button with per-script toggles.

How it works:
- Content script fetches:
  ${PROXY_PACK_URL}
- It reads per-script toggles from chrome.storage.local.
- It loads enabled scripts from proxy-pack + local scripts catalog (grouped by @run-at phase).
- Popup shows the visible scripts list and lets you toggle/hide per script.

IMPORTANT:
- Keep your local server running on 127.0.0.1:5500.
- Toggle changes apply on page reload.
- Disable old TM proxy scripts while using this extension.

Install:
1) Open chrome://extensions
2) Enable Developer mode
3) Click Load unpacked
4) Select this folder:
   ${outAbs}

Daily workflow:
1) Run Common / 3 (or the combined DEV workflow task)
2) Reload this extension (if loader changed)
3) Use the popup to toggle scripts
4) Refresh chatgpt.com tab
`;
}
