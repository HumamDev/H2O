# @h2o/host-adapter-claude

Claude.ai DOM/URL host adapter for H2O extensions. Phase 9A-3 scaffolding —
stable contract, hypothesis-grade selectors awaiting live verification.

## What this package provides

A stateless, pure-JavaScript adapter that understands `claude.ai`'s URL space
and visible DOM structure. Consumers (Phase 9A-4's `src/extensions/claude/
chrome/scripts/content.js`) call into this package to:

- detect whether the current page is a Claude conversation
- enumerate visible turns in document order
- classify each turn as user/assistant/system/unknown
- extract turn text + HTML + flags (has-code / has-attachment / has-artifact-ref)
- check whether a generation is currently streaming
- read the project context for `/projects/<id>/conversations/<id>` pages
- enumerate sidebar conversation links

## Status

| Capability | 9A-3 status | Verified live? |
|---|---|---|
| URL parsing (`/new`, `/chat/<id>`, `/projects/<id>`, `/projects/<id>/conversations/<id>`) | ✅ implemented | ✅ regex-tested |
| `detectContext()` | ✅ implemented | ⚠️ awaits 9A-2 live verification |
| `enumerateTurns()` — primary `[role="article"]` predicate | ✅ implemented | ⚠️ awaits 9A-2 |
| `enumerateTurns()` — avatar-marker fallback predicate | ✅ implemented | ⚠️ awaits 9A-2 |
| `classifyTurnRole()` — ARIA + SVG + user-initials heuristics | ✅ implemented | ⚠️ awaits 9A-2 |
| `extractTurnText()` — text + html + flags | ✅ implemented | ⚠️ awaits 9A-2 |
| `isStreaming()` — Stop-button presence | ✅ implemented | ⚠️ awaits 9A-2 (see streaming finalizer in CLAUDE_DOM_NOTES.md §9) |
| `getProjectContext()` — URL + breadcrumb | ✅ implemented | ⚠️ awaits 9A-2 |
| `getSidebarChats()` | ✅ implemented | ⚠️ awaits 9A-2 |
| Real markdown serialization in `extractTurnText` | ❌ deferred to 9A-5 | — |
| In-content artifact ingestion | ❌ deferred to 9B | — |
| SSE / network introspection (alt to DOM scraping) | ❌ out of scope | — |

The "hypothesis-grade" caveat: every DOM selector here is derived from the
[CLAUDE_DOM_NOTES.md](../../../docs/architecture/CLAUDE_DOM_NOTES.md) §6
selector candidate table. Live operator verification of that table in
Phase 9A-2 is what graduates a selector from "candidate" to "adopted". The
adapter ships **selector fallbacks** so a redesign of claude.ai's class
fragments does not crash the adapter — `enumerateTurns()` returns `[]` and
`classifyTurnRole()` returns `'unknown'` rather than throwing.

## What's NOT here yet

- No chrome content-script wiring — 9A-4.
- No bg.js / `MSG_ARCHIVE` integration — 9A-5.
- No SQLite v6 `host` column migration — 9A-5 prerequisite.
- No save-button UI — 9A-7.
- No MiniMap / Highlights / Command Bar for Claude (NEVER planned to share
  per the 9A-1 audit — those are ChatGPT-only).

## Layout

```
packages/host-adapters/claude/
├── package.json             workspace metadata
├── README.md                this file
├── index.js                 barrel exports
├── types.d.ts               TypeScript declarations for downstream
├── src/
│   ├── types.js             JSDoc typedefs + enum constants + version
│   ├── selectors.js         all DOM selectors + URL regexes (single source)
│   ├── url-parser.js        pure URL / location helpers
│   ├── text-extract.js      turn text/html/flags extraction
│   └── claude-adapter.js    main adapter — enumerateTurns, classify, isStreaming, etc.
└── fixtures/
    └── README.md            how to capture + replay live DOM samples
```

## Importing

```js
// Whole adapter
import { createClaudeAdapter } from '@h2o/host-adapter-claude';
const adapter = createClaudeAdapter();
const ctx = adapter.detectContext(); // uses globalThis.document
const turns = adapter.enumerateTurns();

// Or import functions directly
import { detectContext, enumerateTurns, isStreaming } from '@h2o/host-adapter-claude';
const turns = enumerateTurns(document);

// Submodules (also exported via package.json)
import { CONV_PATH_RE } from '@h2o/host-adapter-claude/selectors';
import { classifyRoute } from '@h2o/host-adapter-claude/url-parser';
```

## Testing

```sh
node tools/validation/host-adapters/validate-claude-adapter-contract.mjs
```

The validator:
- Imports every public symbol from `index.js`.
- Exercises URL parsing against a fixture URL table.
- Exercises DOM logic against minimal `Document`/`Element` stubs (no jsdom
  dependency — keeps Node startup cost zero).
- Verifies the adapter never throws and never returns `undefined` for the
  documented return shapes.

Fixture HTML samples for live DOM tests live under `fixtures/` (operator
captures them via the 9A-2 Snippet B/C protocol).

## Stability promise

This package's exported names are part of the H2O multi-host contract — see
[../../../docs/architecture/HOST_ADAPTER_CONTRACT.md](../../../docs/architecture/HOST_ADAPTER_CONTRACT.md).
Adding new methods is non-breaking. Renaming / removing existing methods is
a breaking change and requires a major version bump.

## Phase history

| Phase | Date | Change |
|---|---|---|
| 8G-5 | 2026-05-19 | Placeholder README created. |
| 9A-3 | 2026-05-20 | Real adapter implementation; URL parsing live; DOM selectors hypothesis-grade. |
