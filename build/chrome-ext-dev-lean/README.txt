H2O Dev Loader Extension (Lean, Unpacked)
==========================================

This is the DEV-only lean loader extension button (no popup toggles).

How it works:
- Content script fetches:
  http://127.0.0.1:5500/dev_output/proxy/_paste-pack.ext.txt
- It parses the proxy pack and loads all scripts by @run-at phase.
- It skips chrome.storage toggle reads for slightly faster startup.

IMPORTANT:
- Keep your local server running on 127.0.0.1:5500.
- Disable H2O Dev Controls if both point to the same page (avoid duplicate injection).

Install:
1) Open chrome://extensions
2) Enable Developer mode
3) Click Load unpacked
4) Select this folder:
   /Users/hobayda/Library/Mobile Documents/com~apple~CloudDocs/VS Code/h2o-workspace-ext/h2o-source/build/chrome-ext-dev-lean

Daily workflow:
1) Run Common / 3
2) Run the lean DEV build task (or lean combined task)
3) Refresh chatgpt.com tab
