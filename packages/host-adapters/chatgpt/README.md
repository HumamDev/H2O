# packages/host-adapters/chatgpt — FUTURE PLACEHOLDER

Future ChatGPT-specific host adapter — DOM selectors, observer rules,
chat-tree parsing, and other chatgpt.com-specific glue, factored out
into a versionable package consumed by both `apps/extensions/chatgpt/chrome`
and (eventually) `apps/extensions/chatgpt/firefox`.

Not yet implemented. Today the ChatGPT host knowledge lives in:

  - `src-runtime-base/` (the 146 emoji-named userscripts — renamed from `scripts/` in Phase 8K-5)
  - `surfaces/studio/` (Studio surface running inside chrome-ext-prod)
  - `tools/product/extensions/chatgpt/chrome/chrome-live-*.mjs` (manifest + loader builders)

If/when this is extracted into a reusable package, it lives here.
Until then this README is the only tracked content; no package.json,
no source, no workspace entry.
