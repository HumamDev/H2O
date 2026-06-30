# Reader & Notes A2a.2b Real DOM Smoke

## Purpose

MVP-A2a.2b is an evidence-only smoke slice for Studio Reader & Notes anchor resolution. It proves the un-wired A2a.2a DOM wrapper against a real browser DOM/Range implementation before any Studio runtime loading, A1 integration, or XPath work is authorized.

## Baseline

- Repository: `/Users/hobayda/H2OCode/repos/h2o-platforms/cockpit-pro/h2o-cp-source`
- Baseline HEAD used for the smoke run: `08cf847ea0286dbe84e23470093e2da2ffeefbc0`
- Prior A2a.2a implementation baseline: `886c123c57cd777b506170c88965971bbf307acd`
- Prior A2a.2a validator hardening baseline: `b2b11b0`
- Working tree note: this evidence was produced in a dirty worktree. The A2a.2b files are evidence/smoke artifacts only and do not modify runtime resolver modules.

## Files / Harness

- `tools/validation/reader-notes/reader-notes-a2a2-real-dom-smoke.html`
- `tools/validation/reader-notes/validate-reader-notes-mvp-a2a_2_browser-smoke.mjs`

The smoke HTML loads the actual source modules:

- `src-surfaces-base/studio/reader-notes/anchor-resolver.studio.js`
- `src-surfaces-base/studio/reader-notes/anchor-resolver-dom.studio.js`

No package dependency was added. The Node runner uses built-in modules and Chrome DevTools Protocol.

## Commands Run

Initial sandboxed attempt:

```sh
node --check tools/validation/reader-notes/validate-reader-notes-mvp-a2a_2_browser-smoke.mjs
node tools/validation/reader-notes/validate-reader-notes-mvp-a2a_2_browser-smoke.mjs
```

Result: blocked by sandbox loopback restriction, not by smoke logic:

```txt
Chrome CDP not available on port 9338: connect EPERM 127.0.0.1:9338
```

Escalated Chrome/CDP run:

```sh
node tools/validation/reader-notes/validate-reader-notes-mvp-a2a_2_browser-smoke.mjs
```

Result:

```txt
status: real-dom-smoke-passed
assertionCount: 15
failures: []
userAgent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/151.0.0.0 Safari/537.36
chromePath: /Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev
cdp: true
```

## Smoke Assertions Covered

- A2a.1 core module loads in a real browser document.
- A2a.2a DOM wrapper module loads in a real browser document.
- Disabled `studio.readerNotes.anchorResolver.enabled` returns `orphaned` with `range: null`.
- Enabled flag allows resolution.
- `flattenRoot(root)` includes all non-empty real text nodes.
- Exact text is preserved.
- Whitespace-only text nodes are included.
- Hidden-like text (`display:none`) is included.
- No separators are inserted.
- Real `Range` inside one text node resolves and `range.toString()` returns expected text.
- Real `Range` crossing multiple text nodes resolves and `range.toString()` returns expected text.
- Returned result includes both `span` and `range`.
- Normal resolution does not mutate DOM text, node count, markup, or add mark/overlay nodes.
- Content mismatch between recovered Range text and flattened text downgrades to `status: "orphaned"`, `range: null`, `reason: "range-unavailable"`.
- XPath remains deferred and does not resolve.
- The controlled flag mock records no flag writes.

## Chrome/CDP Leg

Executed and passed.

The smoke runner launched Chrome Dev headless with CDP, opened the local smoke HTML, and read `window.__H2O_READER_NOTES_A2A2_SMOKE_RESULT` from the page.

## Tauri WebView Leg

Not executed in this slice.

Tauri proof remains pending/manual. This evidence does not claim WebView-specific proof. Before loader/pack wiring or UI integration, a later slice should either run the same smoke body inside a Tauri WebView context or record a manual WebView proof with exact commands/logs.

## Boundaries

- No runtime loading was added.
- `src-surfaces-base/studio/studio.html` was not modified.
- `tools/product/studio/pack-studio.mjs` was not modified.
- `src-surfaces-base/studio/reader-notes/anchor-resolver.studio.js` was not modified.
- `src-surfaces-base/studio/reader-notes/anchor-resolver-dom.studio.js` was not modified.
- No A1 integration was added.
- No XPath fallback was implemented.
- No sidecar, enrichment, renderer registry, native_note, storage, sync, ingestion, Tauri source, or runtime writer behavior was added.

## Decision

A2a.2b provides real Chrome DOM/Range evidence for the un-wired DOM wrapper. It does not authorize loader/pack wiring yet. Tauri WebView proof remains pending/manual and should be completed before any Studio runtime exposure is approved.
