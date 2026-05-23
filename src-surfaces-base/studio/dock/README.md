# `src-surfaces-base/studio/dock/`

Status: Phases 0B through 2B landed. Read-only Dock feature-store foundation is complete (six native engines → six Studio façades); the visible Dock UI shell (`#studioDock` container + DOM-aware `H2O.Studio.dock`) is in place; eight inert tab placeholders register against the shell (`dock/tabs/*.tab.studio.js`). Next phase: Phase 2C — render real feature data from the existing read-only stores. No write-back yet.

Audience: anyone implementing or reviewing Phase 0B and later Dock Panel work.

Companion docs:
- `docs/architecture/studio-dock-panel-plan.md` — the overall plan and phase boundaries.
- `docs/contracts/studio-dock-tab-registration.md` — the Studio-local `H2O.Studio.dock.registerTab` API contract.
- `src-surfaces-base/studio/STUDIO_DOCK_PANEL_CONTRACT.md` — ownership, conflict rules, and Capture/Smart-Highlight V1 stance.

## What lives here

- **Phase 0B (landed)**: `dock-keys.js` — passive constants module that mirrors native storage-key and event-name strings used by Dock Panel features. Studio-local. No native code touched. Exposes `H2O.Studio.DockKeys`, `H2O.Studio.DockEvents`, and `H2O.Studio.DockKeyFor`.
- **Phase 1a (landed)**: `dock-shell.studio.js` — defines `H2O.Studio.dock` and its `registerTab` API per the contract above. `mount/unmount/open/close/toggle/setView/getView` are no-op or in-memory-only state mutators; no DOM, no storage. Tabs registered through it are tracked in `H2O.Studio.dock.tabs` but not rendered yet.
- **Phase 1b (landed)**: persistence wiring — `H2O.Studio.dock.state.open` and `.view` now persist through `H2O.Studio.store.prefs` (Studio-local keys `h2o:studio:dock:open:v1` and `h2o:studio:dock:view:v1`). The prefs entity itself lives at `../store/prefs.js`. `unregisterTab(id)`, `getState()`, and `selfCheck()` are added to the shell. Still no DOM, no native keys, no feature stores. See "Phase 1b — what landed" below.
- **Phase 1c (landed)**: first read-only feature store — `H2O.Studio.store.context`. Reads native Context Engine keys (`h2o:prm:cgx:ctxeng:meta/items/ui/history`) through `H2O.Studio.platform.storage`. No write API. No Dock UI. No native edits. Lives at `../store/context.js`. See "Phase 1c — what landed" below.
- **Phase 1d (landed)**: second read-only feature store — `H2O.Studio.store.bookmarks`. Reads native Bookmarks Engine per-chat key (`h2o:prm:cgx:bkmrksngne:state:bookmarks_${chatId}:v1`) through `H2O.Studio.platform.storage`. Exposes `get(chatId)` / `list(chatId)` / `getBookmark(chatId, id)` / `keysFor(chatId)` / `subscribe(fn)` / `selfCheck()`. No write API. No Dock UI. No native edits. Lives at `../store/bookmarks.js`. See "Phase 1d — what landed" below.
- **Phase 1e (landed)**: third read-only feature store — `H2O.Studio.store.notes`. Reads native Notes Engine per-chat notes blob (`h2o:prm:cgx:ntsngn:store:notes:v1:${chatId}`) **and** scratchpad string (`…store:scratch:v1:${chatId}`) through `H2O.Studio.platform.storage`. Exposes `getNotes` / `getScratch` / `getBundle` / `getAll` / `list` / `getNote` / `keysFor` / `subscribe` / `selfCheck`. No write API, no body-version model, no conflict-resolution editing in Phase 1e. Lives at `../store/notes.js`. See "Phase 1e — what landed" below.
- **Phase 1f (landed)**: fourth read-only feature store — `H2O.Studio.store.navigator`. Reads native Navigator Engine per-chat state blob (`h2o:prm:cgx:nvgngn:state:navigator:v1:${chatId}`) through `H2O.Studio.platform.storage`. Exposes `get` / `getAll` / `getState` / `listPinned` / `listAliases` / `listCollapsed` / `keysFor` / `subscribe` / `selfCheck`. No write API, no pin/alias/collapse editing, no turn-model abstraction, no DOM-derived outline. Lives at `../store/navigator.js`. See "Phase 1f — what landed" below.
- **Phase 1g (landed)**: fifth read-only feature store — `H2O.Studio.store.capture`. Reads native Capture Engine per-chat store blob (`h2o:prm:cgx:capture:store:v1:${chatId}`) **and** UI state (`…:ui:v1:${chatId}`) through `H2O.Studio.platform.storage`. Exposes `getStore` / `getUi` / `getBundle` / `getAll` / `list` / `getItem` / `keysFor` / `subscribe` / `selfCheck`. No write API, no Capture item creation, no conversion to Notes/Bookmarks/Context, no archiving, no live selection. Capture stays inert in Studio V1 per `STUDIO_DOCK_PANEL_CONTRACT.md`. Lives at `../store/capture.js`. See "Phase 1g — what landed" below. **Read-only foundation complete.**
- **Phase 1c–1g**: per-feature read-only entity stores live in `../store/`, not here. This directory holds the Dock UI scaffolding.
- **Phase 2A (landed)**: visible Dock UI shell — `#studioDock` container in `studio.html`, route-gated CSS in `studio.css`, and DOM-aware `mount/open/close/toggle` in `dock-shell.studio.js`. Auto-mounts at `DOMContentLoaded`. No tabs yet. See "Phase 2A — what landed" below.
- **Phase 2B (landed)**: inert tab placeholders — `dock/tabs/*.tab.studio.js` registers eight tabs (Highlights, Context, Bookmarks, Notes, Navigator, Capture, Attachments, Finder) via `H2O.Studio.dock.registerTab`. The shell now renders rail buttons with active state and calls each tab's `render(container, ctx)` placeholder. NO feature-store reads, NO write-back, NO live selection, NO conversion. See "Phase 2B — what landed" below.
- **Phase 2**: `tabs/` subdirectory for individual tab modules (highlights, bookmarks, notes, …).

## Code pattern (mandatory)

`studio.html` loads scripts via plain `<script src>` tags, **not** `<script type="module">`. There is no bundler in the Studio path today. All modules in this directory therefore use the same IIFE-on-global pattern as the rest of Studio (see `src-surfaces-base/studio/store/highlights.js` for the canonical example).

### Required pattern (Phase 0B — passive constants only)

`dock-keys.js` is **passive**: loading it must have no side effects beyond attaching frozen objects to `H2O.Studio.*`. It deliberately does **not** create `H2O.Studio.dock` — that namespace is introduced by `dock-shell.studio.js` in Phase 1a, and prejudging its shape in Phase 0B would make the Phase 1a wiring harder to design.

```js
/* H2O Studio — Dock Keys (Phase 0B)
 *
 * Passive: attaches H2O.Studio.DockKeys / DockEvents / DockKeyFor.
 * No state, no DOM, no storage I/O.
 */
(function (global) {
  'use strict';

  const H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};

  /* Idempotency guard — script may be re-included by dev hot reload. */
  if (H2O.Studio.DockKeys && H2O.Studio.DockEvents && H2O.Studio.DockKeyFor) {
    return;
  }

  const DockKeys = Object.freeze({ /* canonical key strings */ });
  const DockEvents = Object.freeze({ /* event identifiers */ });
  const DockKeyFor = Object.freeze({ /* per-chat key builders */ });

  H2O.Studio.DockKeys = DockKeys;
  H2O.Studio.DockEvents = DockEvents;
  H2O.Studio.DockKeyFor = DockKeyFor;
})(globalThis);
```

### Required pattern (Phase 1a+ — modules that own `H2O.Studio.dock`)

Phase 1a introduces `H2O.Studio.dock` (the Studio Dock shell). From that point on, dock-namespace modules use the same IIFE-on-global pattern, attaching to `H2O.Studio.dock.*`:

```js
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.dock = H2O.Studio.dock || {};

  if (H2O.Studio.dock.__shellInstalled) { return; }

  // … module body …

  H2O.Studio.dock.__shellInstalled = true;
})(typeof window !== 'undefined' ? window : globalThis);
```

Both forms are valid IIFE-on-global code; the difference is **what they attach** (top-level `H2O.Studio.*` for Phase 0B; `H2O.Studio.dock.*` for Phase 1a+).

### Forbidden in this directory

- `export const`, `export default`, `export {}` — studio.html does not load module scripts.
- `import` statements — same reason.
- `require('…')` — Studio does not use CommonJS at runtime.
- Direct `chrome.storage.local.*` / `chrome.runtime.*` / `localStorage.*` calls — go through `H2O.Studio.platform.storage`, `H2O.Studio.platform.broadcast`, or `H2O.Studio.store.*`. See `src-surfaces-base/studio/STUDIO_PLATFORM_ADAPTER_GUIDE.md`.
- Direct `document.querySelector` with literal CSS strings against ChatGPT/Studio attributes — use `H2O.Studio.SELECTORS` constants from `src-surfaces-base/studio/platform/selectors.contract.js`.
- Edits to anything under `src-runtime-base/` — Studio is its own surface.

## Phase 0B — what landed

`dock-keys.js` is the only runtime file in this directory. It exposes three frozen objects:

| Global | Type | Purpose |
|---|---|---|
| `H2O.Studio.DockKeys` | frozen object | 13 canonical native storage-key strings (panel state, panel legacy, highlights, bookmarks, notes, scratch, navigator, context-meta/items/ui/history, capture, finder UI). |
| `H2O.Studio.DockEvents` | frozen object | 8 event-name identifiers (panel-bg, inline-highlights, bookmarks, notes, navigator, context, capture, message-remounted). |
| `H2O.Studio.DockKeyFor` | frozen object | 8 read-only per-chat key builders (`bookmarkKey`, `notesKey`, `scratchKey`, `navigatorKey`, `contextItemsKey`, `contextUiKey`, `contextHistoryKey`, `finderUiKey`). String-builders only; no I/O. |

Per-chat fallback sentinels in the builders match the native engines verbatim: `'unknown'` for notes/scratch/navigator/context/bookmarks, `'default'` for finder UI (per `3Y2a.…js:59`).

The file is **passive**: loading it has no side effects beyond attaching the three globals. It deliberately does **not** create `H2O.Studio.dock`.

### Why not `H2O.Studio.dock.keys`?

An earlier draft of this README showed a Phase 0B preview that attached to `H2O.Studio.dock.keys`/`.events`. That preview was superseded during Phase 0B implementation because creating `H2O.Studio.dock` here would prejudge the shape of the Studio Dock shell that Phase 1a is going to design. Keeping Phase 0B constants at the top level (`H2O.Studio.DockKeys`, etc.) lets Phase 1a own the `H2O.Studio.dock` namespace fully.

### Native source-of-truth references

Every constant in `dock-keys.js` is a duplicate string literal of a native value, with the source file:line cited inline in the dock-keys.js JSDoc header. The Phase 0B PR body should also include the spot-checked rows:

```
panelState                  ←→ src-runtime-base/3A1a.…Dock Panel.js:33,72   (PID='dckpnl' + ':state:panel:v1')
panelStateLegacy            ←→ src-runtime-base/3A1a.…Dock Panel.js:73
highlightsCanonV3           ←→ src-runtime-base/3H1a.…Highlights Engine.js:75  (template via PID='nlnhghlghtr')
bookmarksPerChatPrefix      ←→ src-runtime-base/3B1a.…Bookmarks Engine.js:42,145
notesPerChatPrefix          ←→ src-runtime-base/3N1a.…Notes Engine.js:80,177
contextItemsPerChatPrefix   ←→ src-runtime-base/3W1a.…Context Engine.js:38
finderUiPerChatPrefix       ←→ src-runtime-base/3Y2a.…Finder.js:59
```

A reviewer must be able to spot-grep any 3 entries and confirm the strings match.

## Phase 1a — what landed

`dock-shell.studio.js` is the second runtime file in this directory. It publishes the `H2O.Studio.dock` namespace as a passive, mountless tab registry and state holder. Loading it has no user-visible effect.

| Surface | Type | Behavior in 1a |
|---|---|---|
| `registerTab(id, def)` | function | Adds/replaces a tab def in the registry; emits `h2o:studio:dock:tab-registered`. |
| `getTab(id)` | function | Returns the stored def or `null`. |
| `tabs` | getter | Fresh shallow copy of the registry on each read. |
| `mount(container)` | function | No-op stub. Stashes the reference, marks `state.mounted = true`, emits `h2o:studio:dock:ready`. No DOM attached. |
| `unmount()` | function | Clears the reference and `state.mounted`. |
| `open()` / `close()` / `toggle()` | functions | Mutate `state.open` in memory only; emit `h2o:studio:dock:open-changed`. |
| `setView(id)` / `getView()` | functions | Mutate `state.view` in memory only; emit `h2o:studio:dock:view-changed`. |
| `state` | frozen getter object | `state.open`, `state.view`, `state.mounted` — read-only views over the live internal state. |
| `events` | frozen constants | The four event-name strings above. |

The internal state is **in-memory only** in 1a. Reloading `studio.html` resets `state.open = false` and `state.view = null`. Phase 1b adds persistence through `H2O.Studio.store.prefs('studio:dock:*')`.

Event delivery uses `H2O.events.emit` when available and silently drops the call otherwise — the shell never throws to a caller. This keeps the file safe to load in any environment, including isolated node smoke tests.

### Why mount/open/setView are no-ops

Phase 1a explicitly avoids any side effect beyond updating the in-memory registry and state object. Concretely:
- `mount(container)` does **not** attach DOM, does **not** call `appendChild`, does **not** register listeners on the container, and does **not** read or write storage.
- `open()` / `close()` / `setView()` do **not** modify any DOM element, do **not** persist to storage, and do **not** notify any feature engine. Their only side effect is the H2O.events emit (which currently has no subscribers).
- `registerTab()` stores the def but never invokes its `render` function.

Phase 2 lands the real `mount()` (DOM container in `studio.html` + tab dispatch). Phase 3 lands the per-tab render wiring.

## Phase 1b — what landed

`store/prefs.js` is a new sibling under `../store/`. It exposes a synchronous read/write KV API backed by `H2O.Studio.platform.storage` (when a real adapter is bound) or by an in-memory `Map` (when only the fallback adapter is present). Studio Dock UI state — open flag and active view id — now persists through this store.

### `H2O.Studio.store.prefs` API

| Surface | Type | Behavior |
|---|---|---|
| `version` | string | `'0.1.0-phase-1b'`. |
| `keys` | frozen object | `{ dockOpen: 'h2o:studio:dock:open:v1', dockView: 'h2o:studio:dock:view:v1' }`. |
| `get(key, fallback)` | function | Returns the cache value or `fallback`. Synchronous. |
| `set(key, value)` | function | Writes to the cache; schedules a debounced (250 ms) async write to `H2O.Studio.platform.storage`. **Refuses keys that do not start with `h2o:studio:`** — errors are recorded but not thrown. |
| `remove(key)` | function | Removes from cache; schedules an async delete. Same Studio-prefix guard as `set`. |
| `getAll(prefix)` | function | Returns a plain object of cache entries whose key starts with `prefix` (or all entries if `prefix` is empty). Cache-only; does not hit storage. |
| `subscribe(fn)` | function | Returns an unsubscribe function. Listener receives `{ type, key, value, oldValue, at, source }`. Listener errors are caught and recorded. |
| `isReady()` | function | `true` once boot hydration has completed (or failed). |
| `selfCheck()` | function | `{ ok, version, hasPlatformStorage, fallback: 'platform' \| 'memory', keyCount, errors[] }`. |

### Dock shell ↔ prefs wiring (Phase 1b)

| Action | Persistence behavior |
|---|---|
| `H2O.Studio.dock.open()` / `close()` / `toggle()` | Updates in-memory state, calls `prefs.set('h2o:studio:dock:open:v1', boolean)`. |
| `H2O.Studio.dock.setView(id)` with registered id | Calls `prefs.set('h2o:studio:dock:view:v1', id)`. Returns `true`. |
| `H2O.Studio.dock.setView(null)` | Calls `prefs.set('h2o:studio:dock:view:v1', null)`. Returns `true`. |
| `H2O.Studio.dock.setView('missing')` for an unregistered id | Returns `false`. Does not persist. Does not emit. |
| `H2O.Studio.dock.unregisterTab(id)` removing the active view's tab | Clears the view and persists `null`. |
| Boot of `dock-shell.studio.js` | Sync hydrate from cache; subscribe to prefs `ready` event for async hydrate. Hydrated writes are suppressed so prefs is not re-written from itself. A persisted view id that is not yet registered is silently skipped (no ghost view). |

### `H2O.Studio.dock.getState()` / `selfCheck()`

```
getState() → { open, view, mounted, tabCount, phase, version, persisted }
selfCheck() → { ok, version, phase,
                hasDockKeys, hasDockEvents, hasPrefsStore,
                persisted, tabCount, open, view, mounted, errors }
```

`persisted` is `true` only when the platform adapter is non-fallback. In Studio MV3 builds today that means `chrome.storage.local`; in node smoke tests it is `false`.

### Load order and clobber defense

`store/prefs.js` must load *before* `dock-shell.studio.js` (so the shell can hydrate at install time). It therefore loads *before* `store/index.js` in `studio.html`. To survive `store/index.js`'s unconditional `H2O.Studio.store = store;` reassignment, prefs.js installs a property accessor on `H2O.Studio` that re-attaches the `prefs` entity whenever `H2O.Studio.store` is reassigned. After `store/index.js` runs, the new store carries `prefs` alongside `__registerEntity` and any other entities register normally.

### What is still NOT in Phase 1b

- No Dock UI / DOM container in `studio.html` or `studio.css`.
- No `tabs/` subdirectory; no individual tab implementations.
- No feature stores for highlights / bookmarks / notes / navigator / context / capture (highlights remains the only entity store today, under `../store/highlights.js`).
- No cross-surface sync. The contract's "UI state never syncs" rule applies — `h2o:studio:dock:*` is Studio-only and is NOT mirrored to native chatgpt.com pages.
- No writes to native `h2o:prm:cgx:dckpnl:*` keys (prefs.js refuses them).
- No extension of `fullBundle.v2`.

## Phase 1c — what landed

`store/context.js` is the first read-only Studio Dock feature store façade. It exposes `H2O.Studio.store.context`, reading native Context Engine state (written by `src-runtime-base/3W1a.…Context Engine.js`) through `H2O.Studio.platform.storage`. No write API. No Dock UI. No native edits.

### `H2O.Studio.store.context` API

| Surface | Type | Behavior |
|---|---|---|
| `version` | string | `'0.1.0-phase-1c-readonly'`. |
| `readonly` | boolean | Always `true` — this façade has no public write methods. |
| `getMeta()` | function | Returns the cached value at `h2o:prm:cgx:ctxeng:meta:v1`, or `null`. Lazy-fetches on first call. |
| `getItems(chatId)` | function | Returns cached `h2o:prm:cgx:ctxeng:items:v1:${chatId\|'unknown'}`, or `null`. |
| `getUi(chatId)` | function | Returns cached `h2o:prm:cgx:ctxeng:ui:v1:${chatId\|'unknown'}`, or `null`. |
| `getHistory(chatId)` | function | Returns cached `h2o:prm:cgx:ctxeng:history:v1:${chatId\|'unknown'}`, or `null`. |
| `getBundle(chatId)` | function | Returns `{ chatId, meta, items, ui, history, keys, found: { meta, items, ui, history } }`. The `found` booleans indicate whether each piece was non-null in the cache. |
| `getAll(chatId)` | function | Alias of `getBundle(chatId)`. |
| `keysFor(chatId)` | function | Returns the frozen object `{ meta, items, ui, history }` of full storage keys for the given chatId. Pure string-builder; no I/O. |
| `subscribe(fn)` | function | Returns an unsubscribe function. Listener receives `{ type, key, chatId, value, oldValue, at, source }`. |
| `selfCheck()` | function | Returns `{ ok, version, readonly, hasPlatformStorage, hasDockKeys, hasDockKeyFor, registeredWithStoreIndex, errors[] }`. |

### Chat-id fallback

The native engine (3W1a.js:38-40) uses `'unknown'` as the bucket name when chatId is empty or missing. This façade matches that fallback verbatim. Passing an empty string or `null` to `getItems` / `getUi` / `getHistory` reads from the same `…:v1:unknown` bucket the native engine writes.

### Read flow (sync API, async hydrate)

`getMeta` / `getItems` / `getUi` / `getHistory` return immediately from the in-memory cache. On the first read of an unseen key, the façade kicks off an async `platform.storage.get(key)`. When it resolves, the cache is populated and any subscribers receive a `'change'` event with `source: 'fetch'`. Subsequent calls return the cached value synchronously.

### Subscription filter

`subscribe(fn)` is filtered to context keys only. The internal `platform.broadcast.onAnyChange` handler classifies each changed key and silently drops non-context keys before any subscriber is invoked. Subscribers never see Dock UI changes, highlights changes, or any other key shape.

### Registration with store index

If `H2O.Studio.store.__registerEntity` is available at load time (i.e., `store/index.js` has run), the façade registers as the entity `'context'`. Otherwise it attaches directly as `H2O.Studio.store.context = api` so callers still find it. `selfCheck().registeredWithStoreIndex` reports which path was used.

### What is still NOT in Phase 1c

- No public write API (`set` / `update` / `remove` / `saveNow` are absent).
- No Dock UI. No DOM. No CSS.
- No tabs. No `dock/tabs/` directory yet.
- No additional feature stores. Bookmarks / Notes / Navigator / Capture are deferred to later 1c-style read-only phases.
- No schema migration. The façade reads whatever shape the native engine writes; it does not normalize or upgrade.
- No write-back, no cross-surface sync beyond the existing `chrome.storage.onChanged` propagation that any reader on the same backend benefits from.
- No extension of `fullBundle.v2`.

## Phase 1d — what landed

`store/bookmarks.js` is the second read-only Studio Dock feature store façade. It exposes `H2O.Studio.store.bookmarks`, reading the per-chat Bookmarks Engine blob written by `src-runtime-base/3B1a.…Bookmarks Engine.js`. Same passive pattern as `store/context.js`: sync API, async hydrate on first read, filtered subscription via `platform.broadcast.onAnyChange`, no write API.

### `H2O.Studio.store.bookmarks` API

| Surface | Type | Behavior |
|---|---|---|
| `version` | string | `'0.1.0-phase-1d-readonly'`. |
| `readonly` | boolean | Always `true`. |
| `get(chatId)` | function | Returns `{ chatId, raw, entries, key, found }`. `raw` is the unmodified cached blob (or `null`). `entries` is `normalizeEntries(raw)` — a shallow-copied array view of the native blob. `key` is the full storage key. `found` reflects whether the cache had a non-null value. Lazy-fetches on first call. |
| `getAll(chatId)` | function | Alias of `get(chatId)`. |
| `list(chatId)` | function | Returns just the entries array (best-effort: native shape is `Array<{msgId, primaryAId, pairNo, snapText, title, …}>`; missing or non-array values yield `[]`). |
| `getBookmark(chatId, bookmarkId)` | function | Returns the entry whose `msgId === bookmarkId`, falling back to `primaryAId === bookmarkId`. Otherwise returns `null`. |
| `keysFor(chatId)` | function | Returns the frozen object `{ bookmarks: 'h2o:prm:cgx:bkmrksngne:state:bookmarks_${chatId\|"unknown"}:v1' }`. Pure string-builder; no I/O. |
| `subscribe(fn)` | function | Returns an unsubscribe function. Listener receives `{ type, key, chatId, value, oldValue, at, source }`. |
| `selfCheck()` | function | Returns `{ ok, version, readonly, hasPlatformStorage, hasDockKeys, hasDockKeyFor, registeredWithStoreIndex, errors[] }`. |

### Chat-id fallback

The native engine (3B1a.js:97 + 144-145) uses `STR.chatUnknown = 'unknown'` as the bucket name when chatId is empty or missing. This façade matches that fallback verbatim via `H2O.Studio.DockKeyFor.bookmarkKey` (which already uses `'unknown'`). Passing an empty string or `null` to `get` / `list` / `getBookmark` reads from the same `…bookmarks_unknown:v1` bucket the native engine writes.

### Read flow (sync API, async hydrate)

Same pattern as `store/context.js`. `get` / `list` / `getBookmark` return immediately from the in-memory cache. On the first read of an unseen chatId, the façade kicks off `platform.storage.get(key)`. When it resolves, the cache is populated and any subscribers receive a `'change'` event with `source: 'fetch'`. Subsequent calls return the cached value synchronously.

### Subscription filter

`subscribe(fn)` is filtered to bookmark keys only. The internal `platform.broadcast.onAnyChange` handler checks each changed key against the bookmark prefix + `:v1` suffix; non-matching keys are silently dropped. Subscribers never see Context changes, Dock UI changes, highlights changes, or any other key shape.

### Registration with store index

If `H2O.Studio.store.__registerEntity` is available at load time, the façade registers as the entity `'bookmarks'`. Otherwise it attaches directly as `H2O.Studio.store.bookmarks = api`. `selfCheck().registeredWithStoreIndex` reports which path was used.

### What is still NOT in Phase 1d

- No public write API (`set` / `update` / `remove` / `saveNow` are absent).
- No Dock UI. No DOM. No CSS.
- No tabs. No `dock/tabs/` directory yet.
- No remaining feature stores. Notes / Navigator / Capture are deferred to later 1c-style read-only phases.
- No schema migration. The façade preserves the native blob shape; it does not normalize bookmarks or fix legacy ids.
- No write-back, no cross-surface sync beyond the existing `chrome.storage.onChanged` propagation that any reader on the same backend benefits from.
- No extension of `fullBundle.v2`.

## Phase 1e — what landed

`store/notes.js` is the third read-only Studio Dock feature store façade. It exposes `H2O.Studio.store.notes`, reading both the per-chat notes blob and the per-chat scratchpad string written by `src-runtime-base/3N1a.…Notes Engine.js`. Same passive pattern as `store/context.js` and `store/bookmarks.js`: sync API, async hydrate on first read, filtered subscription via `platform.broadcast.onAnyChange`, no write API.

### `H2O.Studio.store.notes` API

| Surface | Type | Behavior |
|---|---|---|
| `version` | string | `'0.1.0-phase-1e-readonly'`. |
| `readonly` | boolean | Always `true`. |
| `getNotes(chatId)` | function | Returns the cached notes array (or `null`). Native blob is `Array<Note>`. Lazy-fetches on first call. |
| `getScratch(chatId)` | function | Returns the cached scratchpad string (or `null`). Native blob is a plain `string`, not JSON. |
| `getBundle(chatId)` | function | Returns `{ chatId, notes, scratch, entries, keys, found: { notes, scratch } }`. `entries` is `normalizeEntries(notes)` — a shallow-copied array view. The `found` booleans reflect cache state per key. |
| `getAll(chatId)` | function | Alias of `getBundle(chatId)`. |
| `list(chatId)` | function | Returns just the entries array (best-effort: native shape is `Array<Note>`; missing or non-array values yield `[]`). |
| `getNote(chatId, noteId)` | function | Returns the entry whose `id === noteId`, or `null`. |
| `keysFor(chatId)` | function | Returns the frozen object `{ notes: '…ntsngn:store:notes:v1:${chatId\|"unknown"}', scratch: '…ntsngn:store:scratch:v1:${chatId\|"unknown"}' }`. Pure string-builder; no I/O. |
| `subscribe(fn)` | function | Returns an unsubscribe function. Listener receives `{ type, key, chatId, value, oldValue, at, source }`. |
| `selfCheck()` | function | Returns `{ ok, version, readonly, hasPlatformStorage, hasDockKeys, hasDockKeyFor, registeredWithStoreIndex, errors[] }`. |

### Native blob shapes

| Blob | Type | Per-record fields (from 3N1a.js:246-256) |
|---|---|---|
| Notes | `Array<Note>` | `id, type:'note', title, text, tags[], pinned, createdAt, updatedAt, source?:{msgId,role,…}` |
| Scratch | `string` | plain text, no JSON wrapping |

### Chat-id fallback

The native engine (3N1a.js:93 + 177-178) uses `STR_NOTES.unknown = 'unknown'` as the bucket name when chatId is empty or missing. This façade matches that fallback verbatim via `H2O.Studio.DockKeyFor.notesKey` / `scratchKey` (both already use `safeId(chatId, 'unknown')`). Passing an empty string or `null` to `getNotes` / `getScratch` / `getNote` reads from the same `…notes/scratch:v1:unknown` buckets the native engine writes.

### Read flow (sync API, async hydrate)

Same pattern as `store/context.js` and `store/bookmarks.js`. `getNotes` / `getScratch` / `list` / `getNote` return immediately from the in-memory cache. On the first read of an unseen chatId, the façade kicks off `platform.storage.get(key)` for each underlying key. When each resolves, the cache is populated and any subscribers receive a `'change'` event with `source: 'fetch'`. Subsequent calls return the cached value synchronously.

### Subscription filter

`subscribe(fn)` is filtered to notes/scratch keys only. The internal `platform.broadcast.onAnyChange` handler checks each changed key against the two notes-engine prefixes; non-matching keys are silently dropped. Subscribers never see Bookmarks changes, Context changes, Dock UI changes, highlights changes, or any other key shape. Both notes and scratch changes fire under the same `subscribe(fn)`; the event's `kind` (returned in `classifyKey` internally — not exposed) is reflected by the `key` field on the event.

### Registration with store index

If `H2O.Studio.store.__registerEntity` is available at load time, the façade registers as the entity `'notes'`. Otherwise it attaches directly as `H2O.Studio.store.notes = api`. `selfCheck().registeredWithStoreIndex` reports which path was used.

### What is still NOT in Phase 1e

- No public write API (`set` / `update` / `remove` / `saveNow` are absent).
- **No body-version (`bodyVersions`) model.** The future preserve-both note-body conflict semantics described in `STUDIO_DOCK_PANEL_CONTRACT.md` are write-back-time concerns and are deferred to Phase 3e.
- No conflict-resolution UI; no editing affordance of any kind.
- No Dock UI. No DOM. No CSS.
- No tabs. No `dock/tabs/` directory yet.
- No remaining feature stores. Navigator and Capture are deferred to later 1c-style read-only phases.
- No schema migration. The façade preserves the native blob shapes; it does not normalize notes, scratchpad text, or fix legacy fields.
- No write-back, no cross-surface sync beyond the existing `chrome.storage.onChanged` propagation that any reader on the same backend benefits from.
- No extension of `fullBundle.v2`.

## Phase 1f — what landed

`store/navigator.js` is the fourth read-only Studio Dock feature store façade. It exposes `H2O.Studio.store.navigator`, reading the per-chat Navigator Engine state blob written by `src-runtime-base/3V1a.…Navigator Engine.js`. Same passive pattern as `store/context.js`, `store/bookmarks.js`, and `store/notes.js`: sync API, async hydrate on first read, filtered subscription via `platform.broadcast.onAnyChange`, no write API.

### `H2O.Studio.store.navigator` API

| Surface | Type | Behavior |
|---|---|---|
| `version` | string | `'0.1.0-phase-1f-readonly'`. |
| `readonly` | boolean | Always `true`. |
| `get(chatId)` | function | Returns the cached raw navigator blob (or `null`). Lazy-fetches on first call. |
| `getAll(chatId)` | function | Alias of `get(chatId)`. |
| `getState(chatId)` | function | Returns `{ chatId, raw, key, found }`. |
| `listPinned(chatId)` | function | Returns a shallow-copied array of `raw.pins`. Each entry preserves the native shape (`{turnId, kind:'question'\|'answer', answerId?}`). Returns `[]` if shape is missing/invalid. |
| `listAliases(chatId)` | function | Returns `Array<{ key, value }>` derived from `raw.aliases`. Alias keys may include the `::a:<answerId>` suffix for answer-level aliases — preserved verbatim. |
| `listCollapsed(chatId)` | function | Returns `Array<{ turnId, collapsed: true }>` — filtered to truthy values only, because the native engine may store `false` after a toggle. |
| `keysFor(chatId)` | function | Returns the frozen object `{ navigator: 'h2o:prm:cgx:nvgngn:state:navigator:v1:${chatId\|"unknown"}' }`. Pure string-builder; no I/O. |
| `subscribe(fn)` | function | Returns an unsubscribe function. Listener receives `{ type, key, chatId, value, oldValue, at, source }`. |
| `selfCheck()` | function | Returns `{ ok, version, readonly, hasPlatformStorage, hasDockKeys, hasDockKeyFor, registeredWithStoreIndex, errors[] }`. |

### Native blob shape (from 3V1a.js:55-56, 248-249, 431-469)

```
{
  pins:      Array<{ turnId: string,
                     kind:   'question' | 'answer',
                     answerId?: string }>,
  aliases:   { [turnId | 'turnId::a:answerId']: string },
  collapsed: { [turnId]: boolean }
}
```

### Chat-id fallback

The native engine (3V1a.js:84) uses the literal string `'unknown'` when chatId is empty or missing. This façade matches that fallback verbatim via `H2O.Studio.DockKeyFor.navigatorKey` (which uses `safeId(chatId, 'unknown')`). Passing an empty string or `null` to `get` / `getState` / `listPinned` / `listAliases` / `listCollapsed` reads from the same `…navigator:v1:unknown` bucket the native engine writes.

### Read flow (sync API, async hydrate)

Same pattern as the other read-only stores. `get` / `getState` / `listPinned` / `listAliases` / `listCollapsed` return immediately from the in-memory cache. On the first read of an unseen chatId, the façade kicks off `platform.storage.get(key)`. When it resolves, the cache is populated and any subscribers receive a `'change'` event with `source: 'fetch'`. Subsequent calls return the cached value synchronously.

### Subscription filter

`subscribe(fn)` is filtered to navigator keys only. The internal `platform.broadcast.onAnyChange` handler checks each changed key against the navigator prefix; non-matching keys are silently dropped. Subscribers never see Notes/Bookmarks/Context/Dock-UI/highlights changes or any other key shape.

### Registration with store index

If `H2O.Studio.store.__registerEntity` is available at load time, the façade registers as the entity `'navigator'`. Otherwise it attaches directly as `H2O.Studio.store.navigator = api`. `selfCheck().registeredWithStoreIndex` reports which path was used.

### What is still NOT in Phase 1f

- No public write API (`set` / `update` / `remove` / `saveNow` are absent).
- No pin / alias / collapse editing of any kind.
- **No turn-model abstraction.** The façade reads the persisted blob only; it does not infer a turn outline from the Studio reader DOM, does not derive Q→A structure, and does not generate a navigable outline. That belongs in Phase 2 alongside the real Dock UI mount.
- No outline rendering. No Navigator tab UI.
- No Dock UI. No DOM. No CSS.
- No tabs. No `dock/tabs/` directory yet.
- No remaining feature stores. Capture is deferred to the next read-only phase.
- No schema migration. The façade preserves the native blob shape; it does not normalize pins/aliases/collapsed or fix legacy fields.
- No write-back, no cross-surface sync beyond the existing `chrome.storage.onChanged` propagation that any reader on the same backend benefits from.
- No extension of `fullBundle.v2`.

## Phase 1g — what landed

`store/capture.js` is the **fifth and final** read-only Studio Dock feature store façade. It exposes `H2O.Studio.store.capture`, reading the per-chat Capture Engine store blob and UI state written by `src-runtime-base/3X1a.…Capture Engine.js`. Same passive pattern as the sibling read-only stores: sync API, async hydrate on first read, filtered subscription via `platform.broadcast.onAnyChange`, no write API.

With Phase 1g, the read-only Studio Dock feature-store foundation is **complete**. The six native Dock-feature engines (highlights, context, bookmarks, notes, navigator, capture) each have a Studio façade. The next phase (Phase 2A) introduces the actual visible Dock UI mount that consumes them.

### `H2O.Studio.store.capture` API

| Surface | Type | Behavior |
|---|---|---|
| `version` | string | `'0.1.0-phase-1g-readonly'`. |
| `readonly` | boolean | Always `true`. |
| `getStore(chatId)` | function | Returns the cached Capture store blob (or `null`). Native shape is `{version, items:Array<Item>, meta}`. Lazy-fetches on first call. |
| `getUi(chatId)` | function | Returns the cached Capture UI state (or `null`). Native shape is `{version, subTab, sortBy, filter, query}`. |
| `getBundle(chatId)` | function | Returns `{ chatId, store, ui, items, keys, found: { store, ui } }`. `items` is `normalizeItems(store)` — a shallow-copied array view. |
| `getAll(chatId)` | function | Alias of `getBundle(chatId)`. |
| `list(chatId)` | function | Returns just the items array (best-effort: native shape is `{items:[…]}`; missing fields yield `[]`). |
| `getItem(chatId, itemId)` | function | Returns the item whose `id === itemId`, or `null`. |
| `keysFor(chatId)` | function | Returns the frozen object `{ store: '…capture:store:v1:${chatId\|"unknown"}', ui: '…capture:ui:v1:${chatId\|"unknown"}' }`. Pure string-builder; no I/O. |
| `subscribe(fn)` | function | Returns an unsubscribe function. Listener receives `{ type, key, chatId, value, oldValue, at, source }`. |
| `selfCheck()` | function | Returns `{ ok, version, readonly, hasPlatformStorage, hasDockKeys, hasCapturePrefix, registeredWithStoreIndex, errors[] }`. |

### Native blob shapes (from 3X1a.js:78, 82, 206-228)

```
store: { version: 1,
         items:   Array<Item>,
         meta:    { createdAt, updatedAt, lastReviewAt } }

Item:  { id, chatId, kind, text, title, source,
         routeSuggestion, status, tags, pinned,
         createdAt, updatedAt, reviewedAt,
         convertedTo, dismissed }

ui:    { version, subTab: 'capture'|'review',
         sortBy: 'newest'|…, filter: 'all'|…, query: string }
```

### Chat-id fallback

The native engine (3X1a.js:44, 56) uses `STR.unknownChat = 'unknown'` as the bucket name when chatId is empty or missing. This façade matches that fallback verbatim. Passing an empty string or `null` reads from the same `…capture:store:v1:unknown` and `…capture:ui:v1:unknown` buckets the native engine writes.

### Key construction (`dock-keys.js` untouched)

`DockKeys.capturePrefix = 'h2o:prm:cgx:capture'` is just the namespace root — Phase 0B did not add `captureStoreKey` / `captureUiKey` helpers to `DockKeyFor`. Rather than edit `dock-keys.js` mid-foundation, `store/capture.js` builds the full keys locally from the verified native `':store:v1:'` / `':ui:v1:'` infixes. The infix value `:v1:` matches the native engine's `CFG.storeVersion = 1` (3X1a.js:35). If the native engine bumps that version in a future migration, this façade will need to update in lock-step.

### Subscription filter

`subscribe(fn)` is filtered to Capture store + UI keys only. The internal `platform.broadcast.onAnyChange` handler classifies each changed key against the two infix prefixes; non-matching keys are silently dropped. The migration marker `h2o:prm:cgx:capture:migrate:slot8-to-slot7:v1` (3X2a.js:28) is NOT a per-chat key and is correctly filtered out.

### Registration with store index

If `H2O.Studio.store.__registerEntity` is available at load time, the façade registers as the entity `'capture'`. Otherwise it attaches directly as `H2O.Studio.store.capture = api`. `selfCheck().registeredWithStoreIndex` reports which path was used.

### What is still NOT in Phase 1g

- No public write API (`set` / `update` / `remove` / `saveNow` / `convert` / `archive` / `create` are absent).
- **No Capture item creation.** Studio cannot capture new items in V1.
- **No conversion to Notes / Bookmarks / Context.** The native engine's "Capture → Notes/Bookmarks/Context" routing logic is not mirrored.
- **No archiving / review-state mutation.**
- **No live text selection.** Studio renders snapshots, not live chat; there is no live capture surface in V1 per `STUDIO_DOCK_PANEL_CONTRACT.md`.
- No Dock UI. No DOM. No CSS. The Phase 2A Capture tab will be **inert** — it can render the cached items list but not mutate anything.
- No tabs. No `dock/tabs/` directory yet.
- No more feature stores after this — the foundation is complete.
- No schema migration. The façade preserves the native blob shape.
- No write-back, no cross-surface sync beyond `chrome.storage.onChanged` propagation.
- No extension of `fullBundle.v2`.

## Phase 2A — what landed

`dock-shell.studio.js` was upgraded from passive (Phase 1b) to DOM-aware. `mount(container)` now finds the rail / body / head / view / close children inside `#studioDock`, attaches a close-button click handler, and applies the current open state to the DOM. `unmount()` cleans up. `open()` and `close()` toggle the `wbDock--open` class and the `hidden` attribute on the container so CSS can paint/depaint the panel. `setView(id)` still validates against the tab registry.

`studio.html` now contains the `#studioDock` container as the last child of `.wbStage`, with the rail / body / head / view / close placeholders the shell looks for.

`studio.css` now route-gates the panel: it is hidden everywhere by default, and only rendered when `body[data-route="reader"]` AND the `wbDock--open` class is set on the container. The Dock auto-mounts at `DOMContentLoaded`, so no `studio.js` edits were required.

`selfCheck()` was extended with `hasContainer / hasRail / hasBody / hasView` so a quick console call can verify the mount wiring.

## Phase 2B — what landed

Eight inert tab placeholders register against the Phase 2A shell:

| Tab id | File | Icon | Placeholder text |
|---|---|---|---|
| `highlights` | `tabs/highlights.tab.studio.js` | 🌈 | "Read-only tab placeholder. Data rendering lands in Phase 2C." |
| `context` | `tabs/context.tab.studio.js` | 🧠 | same |
| `bookmarks` | `tabs/bookmarks.tab.studio.js` | ⭐ | same |
| `notes` | `tabs/notes.tab.studio.js` | 🗒️ | same |
| `navigator` | `tabs/navigator.tab.studio.js` | 🧭 | same |
| `capture` | `tabs/capture.tab.studio.js` | 🧷 | "Capture is read-only/inert in Studio V1. Live selection and conversion are not enabled." |
| `attachments` | `tabs/attachments.tab.studio.js` | 📎 | "Read-only tab placeholder. Data rendering lands in Phase 2C." |
| `finder` | `tabs/finder.tab.studio.js` | 🔎 | same |

Each tab module is a passive IIFE that calls `H2O.Studio.dock.registerTab(id, def)` and provides a minimal `render(container, ctx)` that writes static placeholder text into the supplied dock-view container. **No tab calls any feature store. No tab mutates anything. No tab touches the reader DOM.**

`dock-shell.studio.js` was extended with:

| Surface | Behavior |
|---|---|
| `listTabs()` | returns an array of registered tab ids in registration order |
| `renderRail()` | clears the rail, emits one `.wbDockRailBtn` per tab with icon + title + `aria-pressed` + active-state class; reattaches click handlers (each calls `setView(tabId)`) |
| `renderActiveView()` | runs any previous tab's cleanup, clears the dock view, and calls the active tab's `render(container, ctx)`. Falls back to the existing "Dock tabs will appear in Phase 2B." empty-state when no active view. |
| `mount(container)` hook | calls `renderRail()` + `renderActiveView()` after applying open state |
| `registerTab(id, def)` hook | if mounted, repaints rail; if the new tab matches the persisted view, paints its content |
| `setView(id)` hook | repaints rail (active state) + view |
| `unregisterTab(id)` hook | repaints rail; if the removed tab was active, clears view |
| `hydrateFromPrefs(reason)` hook | if hydration produced a real view change AND mounted, repaints rail + view |
| `unmount()` hook | removes per-rail-button listeners, runs the active tab cleanup |

`studio.css` adds minimal styling: `.wbDockRail`, `.wbDockRailBtn` (idle / hover / focus-visible / active), `.wbDockRailBtnIcon`, `.wbDockPlaceholder`. No broader layout rules, no feature-specific styling.

### What is still NOT in Phase 2B

- No feature-store data calls from tabs or shell.
- No actual highlights / bookmarks / notes / navigator / context / capture rendering.
- No click-to-scroll reader integration.
- No write-back. No `set` / `update` / `remove` / `saveNow` calls.
- No live text selection. No Capture conversion / archiving.
- No Notes editing. No Navigator pin/alias/collapse editing.
- No Attachments DOM scanning. No Finder search.
- No `fullBundle.v2` extension.

`ctx` passed to tab `render()` in Phase 2B is intentionally minimal (`{ surface, phase, chatId:null, externalId:null, snapshotId:null }`). Phase 2C will populate `chatId / externalId / snapshotId` from the active reader snapshot so feature stores can be queried per-chat.
