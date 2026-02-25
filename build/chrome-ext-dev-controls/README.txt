H2O Dev Controls Extension (Unpacked)
=====================================

This is the DEV-only extension button with per-script toggles.

How it works:
- Content script fetches:
  http://127.0.0.1:5500/dev_output/proxy/_paste-pack.ext.txt
- It reads per-script toggles from chrome.storage.local.
- It loads only enabled scripts (grouped by @run-at phase).
- Popup shows all scripts from the proxy pack and lets you toggle them.

IMPORTANT:
- Keep your local server running on 127.0.0.1:5500.
- Toggle changes apply on page reload.
- Disable old TM proxy scripts while using this extension.

Install:
1) Open chrome://extensions
2) Enable Developer mode
3) Click Load unpacked
4) Select this folder:
   /Users/hobayda/Library/Mobile Documents/com~apple~CloudDocs/VS Code/h2o-workspace-ext/h2o-source/build/chrome-ext-dev-controls

Daily workflow:
1) Run Common / 3 (or the combined DEV workflow task)
2) Reload this extension (if loader changed)
3) Use the popup to toggle scripts
4) Refresh chatgpt.com tab
