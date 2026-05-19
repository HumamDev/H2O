# packages/extension-core — FUTURE PLACEHOLDER

Future shared extension utilities — cross-host (ChatGPT/Claude/Gemini)
and cross-browser (Chrome/Firefox) primitives used by the per-host
adapters under `packages/host-adapters/` and the per-browser adapters
under `packages/browser-adapters/`.

Not yet implemented. Currently the chrome-live extension pipeline lives
under `tools/product/extensions/chatgpt/chrome/` as a single-host (ChatGPT), single-
browser (Chrome MV3) bundle. When Claude/Gemini host support and/or
Firefox WebExtension support is added, the cross-cutting primitives
will be extracted here.

Until then this README is the only tracked content; no package.json,
no source, no workspace entry.
