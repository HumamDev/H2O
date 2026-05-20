# Host Adapter Contract

> Authoritative cross-host adapter contract for H2O extensions. Every
> per-host adapter (`@h2o/host-adapter-chatgpt`, `@h2o/host-adapter-claude`,
> `@h2o/host-adapter-gemini`, …) **must** conform.
>
> Status: ratified by Phase 9A-3 (Claude). Phase 8G-5/8G-6/8G-7 stubs and the
> ChatGPT legacy runtime predate this doc; the ChatGPT runtime is intentionally
> NOT being retrofitted (per the [9A-1 audit](../migration/MIGRATION.md)).

---

## 1. Why this contract exists

The Phase 8G multi-host scaffolding gave us a folder shape for new
host/browser combinations:

```
src/extensions/<host>/<browser>/
packages/host-adapters/<host>/
config/extensions/<host>/<browser>/
```

…but said nothing about **what** a host adapter must expose. Phase 9A-3
(Claude.ai as the first real second host) needs an explicit contract so
that:

1. Phase 9A-4's `content.js` can write against a stable interface.
2. Future Phase 9B (Gemini) can drop in a sibling adapter without
   re-litigating the surface area.
3. Studio's ingestion pipeline can ingest snapshots from multiple hosts
   uniformly (Phase 9A-5+).

The ChatGPT legacy runtime under `src-runtime-base/` does **not** conform
and never will — it is frozen per [MIGRATION.md §4](../migration/MIGRATION.md).
The contract here governs new host adapters only.

---

## 2. Package shape

Every host adapter MUST be a workspace package:

```
packages/host-adapters/<host>/
├── package.json             name: "@h2o/host-adapter-<host>"
├── README.md                status table + capability matrix
├── index.js                 barrel export
├── types.d.ts               TypeScript declarations
├── src/
│   ├── types.js             JSDoc typedefs + role/route enum constants + version
│   ├── selectors.js         all DOM/URL selectors (single source of truth)
│   ├── url-parser.js        pure URL/location helpers (no DOM)
│   ├── text-extract.js      turn text/html/flags extraction
│   └── <host>-adapter.js    main adapter — enumerateTurns, classify, etc.
└── fixtures/
    └── README.md            capture protocol (HTML samples for tests)
```

The reference implementation is `packages/host-adapters/claude/` (Phase 9A-3).

### Package.json constraints

- `"name"`: `@h2o/host-adapter-<host>` exactly.
- `"type"`: `"module"` (ESM only).
- `"private"`: `true`.
- `"main"`: `./index.js`.
- `"types"`: `./types.d.ts`.
- `"sideEffects"`: `false`.
- `"exports"` MUST expose `.` AND `./selectors` AND `./url-parser` AND
  `./text-extract` as named subpaths (for fine-grained imports).

---

## 3. Required exports

Every host adapter MUST export the following symbols from `index.js`. Names
are normative — alternative spellings are not allowed.

### 3.1 Constants

```js
export const H2O_<HOST>_ADAPTER_VERSION; // semver string
export const H2O_<HOST>_HOST;            // the host string used by Studio's `host` column
export const RouteKind;                  // frozen enum (see §4.1)
export const TurnRole;                   // frozen enum (see §4.2)
```

### 3.2 Functions (the 9 required adapter methods)

| Function | Signature | Return on no evidence |
|---|---|---|
| `detectContext` | `(doc?: Document) => HostContext` | `HostContext` with `isClaudeAi=false` etc. — never `null` |
| `getConversationId` | `(doc?: Document) => string \| null` | `null` |
| `getConversationUrl` | `(doc?: Document) => string` | `''` |
| `enumerateTurns` | `(doc?: Document) => HostTurn[]` | `[]` |
| `classifyTurnRole` | `(el: Element \| null) => 'user'\|'assistant'\|'system'\|'unknown'` | `'unknown'` |
| `extractTurnText` | `(el: Element \| null) => { text, markdown, html }` | `{ text: '', markdown: '', html: '' }` |
| `isStreaming` | `(doc?: Document) => boolean` | `false` |
| `getProjectContext` | `(doc?: Document) => ProjectContext \| null` | `null` |
| `getSidebarChats` | `(doc?: Document) => SidebarChat[]` | `[]` |

### 3.3 Factory

```js
export function create<Host>Adapter(): <Host>Adapter;
```

Returns a frozen adapter object whose method set is exactly §3.2 plus
`version` and `host` properties. Useful for dependency injection in tests.

---

## 4. Required types

### 4.1 RouteKind

```js
export const RouteKind = Object.freeze({
  NEW: 'new',
  CHAT: 'chat',
  PROJECT_CHAT: 'project-chat',
  PROJECT: 'project',
  UNKNOWN: 'unknown',
});
```

Hosts that lack a "project" concept return `'chat' | 'unknown'` exclusively.
The `'project'` and `'project-chat'` values MUST be defined even if unused.

### 4.2 TurnRole

```js
export const TurnRole = Object.freeze({
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
  UNKNOWN: 'unknown',
});
```

System-level turns (rare; e.g. tool-use markers) are allowed via `SYSTEM`.
Hosts without a system-turn concept can omit the value at the data layer
but the enum MUST be present in the contract.

### 4.3 HostContext

```ts
interface HostContext {
  host: string;                          // e.g. 'claude.ai' — exact match required for Studio's host column
  isClaudeAi: boolean;                   // (or isChatGpt, isGemini, etc.)
  routeKind: RouteKindValue;
  conversationId: string | null;
  projectId: string | null;
  url: string;
}
```

The `isClaudeAi` boolean is the only naming break — each adapter exposes
its own host-named flag (`isChatGpt`, `isGemini`, …). This is intentional:
content scripts often `if (ctx.isClaudeAi)`-guard host-specific code.

### 4.4 HostTurn

```ts
interface HostTurn {
  id: string | null;                     // best-effort; null if host has no stable per-turn id
  role: TurnRoleValue;
  order: number;                         // 0-based document order
  text: string;
  markdown?: string;                     // host-best-effort; matches text if no real serializer
  html?: string;                         // outerHTML of the turn container
  element?: Element | null;
  isPartial?: boolean;                   // true if user clicked stop mid-stream
  hasCode?: boolean;
  hasAttachment?: boolean;
  hasArtifactRef?: boolean;
}
```

### 4.5 SidebarChat

```ts
interface SidebarChat {
  id: string | null;
  title: string;
  href: string;                          // relative or absolute URL
  projectId: string | null;
}
```

### 4.6 ProjectContext

```ts
interface ProjectContext {
  projectId: string;
  projectName: string | null;            // null when DOM doesn't expose a name
}
```

---

## 5. Behavioral invariants

Every adapter implementation MUST satisfy:

1. **No throws.** Every public function returns the documented "no
   evidence" default rather than throwing. Adapters that throw on malformed
   input fail the contract validator.
2. **No side effects.** No `chrome.*` calls. No `localStorage` reads or
   writes. No network requests. The adapter only reads from the passed
   `Document`/`Element` (or `globalThis.document` if none is passed).
3. **Document-optional.** Every method that takes `doc?: Document` MUST
   work when called with no argument (uses `globalThis.document`) AND when
   called with an explicit Document (for testing against fixtures).
4. **No Tailwind class dependencies.** Selectors must rely on URL / ARIA /
   role / `href` / `contenteditable` / semantic structure. Class fragments
   are allowed as **fallbacks only**, never as primary selectors.
5. **Document order.** `enumerateTurns` returns turns in document order
   (top-of-conversation first), 0-indexed via the `order` field.
6. **Stable IDs.** When `conversationId` is parseable from the URL, it
   MUST be returned identically on every call until navigation.
7. **No DOM mutation.** Adapters are read-only. Phase 9A-7 UI injection
   lives in the content script, not the adapter.
8. **Frozen factory result.** `create<Host>Adapter()` returns
   `Object.freeze`d — consumers can't accidentally monkey-patch methods.

---

## 6. Selector module conventions (`src/selectors.js`)

The selectors module is the **single source of truth** for every selector
the adapter uses. The main adapter file imports from it; it does not embed
inline selectors. Convention:

- URL regex constants: `<CONCEPT>_PATH_RE`, e.g. `CONV_PATH_RE`.
- CSS selectors: `<CONCEPT>_SELECTOR`, e.g. `TURN_PRIMARY_SELECTOR`.
- Predicate functions (when CSS isn't enough): `is<Concept>` / `has<Concept>`.
- Each selector MUST carry a `CLAUDE_DOM_NOTES.md §6 row N` (or equivalent
  per-host) annotation in a JSDoc comment so it's traceable to its live-
  verification source.

---

## 7. Validator contract

Every host adapter MUST ship a Node-runnable validator at:

```
tools/validation/host-adapters/validate-<host>-adapter-contract.mjs
```

The validator MUST:

1. Import every public symbol from the package's `index.js`.
2. Verify every required §3 export exists and is the right kind (function /
   constant / frozen object).
3. Run URL-parsing tests against a per-host fixture URL table.
4. Run DOM-operation tests against minimal `Document`/`Element` stubs (no
   jsdom dependency — Node-only).
5. Verify behavioral invariants §5.1 (no throws), §5.7 (no DOM mutation),
   §5.8 (frozen factory result).
6. Exit non-zero on any failure with a clear message.

Returning success means: the adapter conforms to this contract. It does
NOT mean: the adapter works against the live host (that's the
`CLAUDE_DOM_NOTES.md` live verification pass).

---

## 8. Host discriminator semantics

H2O Studio's data model uses a `host` column (planned 9A-5 SQLite v6
migration — not yet shipped) to distinguish ChatGPT vs Claude vs future-host
data. Adapter responsibilities:

- The `H2O_<HOST>_HOST` constant is the **exact string value** Studio stores
  in the `host` column.
- Examples: `'chatgpt.com'`, `'claude.ai'`, `'gemini.google.com'`.
- The `HostContext.host` field returns the same string.
- Adapters MUST NOT mint their own hostnames or aliases.

---

## 9. Versioning

Each adapter ships an `H2O_<HOST>_ADAPTER_VERSION` semver string. The
contract version is encoded in **this document's** §3 export list. Compat
matrix:

| Change | Adapter semver | Contract change required |
|---|---|---|
| Bug fix (selector hypothesis verified, no API change) | patch | no |
| Add a new exported function | minor | no (additive) |
| Tighten a return-type constraint | minor | optional minor doc update |
| Rename / remove an export | major | yes |
| Add a new required method to §3.2 | n/a | major contract bump |

---

## 10. What is intentionally NOT in the contract

- **Save/archive flow.** That's the content script's responsibility
  (Phase 9A-5+), driven by adapter outputs but distinct from them.
- **In-page UI injection.** Per §5.7, adapters are read-only. UI lives
  in content-script code under `src/extensions/<host>/<browser>/`.
- **MiniMap / Highlights / Command Bar.** These are ChatGPT-only systems
  that intentionally never share across hosts (per [9A-1 audit](../migration/MIGRATION.md)).
- **Streaming finalization orchestration.** The adapter exposes the
  `isStreaming()` signal; the orchestration (debounce, mutation idle,
  Stop-button-vanished) lives in the content script.
- **Markdown serialization quality.** MVP adapters can return plain text
  for the `markdown` field. A real serializer is a Phase 9A-5 concern.
- **API ingestion.** All adapters scrape rendered DOM. Direct backend
  API ingestion (e.g. claude.ai/api/...) is Phase 9B+.

---

## 11. Reference implementation

[packages/host-adapters/claude/](../../packages/host-adapters/claude/) —
Phase 9A-3 scaffolding. URL parsing live; DOM selectors hypothesis-grade
pending Phase 9A-2 operator verification.

## 12. Doc version

| Phase | Date | Change |
|---|---|---|
| 9A-3 | 2026-05-20 | Contract ratified. Reference implementation under `packages/host-adapters/claude/`. |
