# `src-surfaces-base/studio/dock/`

Status: **Phase 2C + D2 complete.** Phases 0B through 2C-F landed (all eight Dock tabs render real read-only data), and D2 wired the shell to the current Studio saved-chat context, added route-aware refresh, and switched the closed-state model so the rail is always visible on the reader route (native-like). Capture stays **inert in V1**; no write-back, no conversion, no editing, no scroll/navigation integration in any tab.

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

## Phase 2C-H — what landed (Highlights real read-only rendering)

The first real-data Dock tab. `tabs/highlights.tab.studio.js` no longer renders placeholder text. Instead it:

- Reads `H2O.Studio.store.highlights.getAll()` (sync, returns the live in-memory cache; never mutated).
- Flattens `blob.itemsByAnswer[answerId] = Item[]` into a single display list, newest first by `ts`.
- Renders a compact row per item: color swatch (from the native palette name map), text snippet (`item.anchors.textQuote.exact`, normalized & truncated to 240 chars), and meta line (color name • answer id • timestamp).
- Shows the empty state `No highlights found for this chat yet.` when there are 0 items.
- Subscribes via `H2O.Studio.store.highlights.subscribe(fn)` and re-renders on changes; the returned unsubscribe is handed back to `dock-shell` via the render() return value (shell honors this at `renderActiveView:cleanup` and `unmount:activeRenderCleanup`).
- Catches errors and falls back to `.wbDockError`.

`studio.css` gains generic reusable Dock list classes: `.wbDockList`, `.wbDockRow`, `.wbDockSwatch`, `.wbDockRowBody`, `.wbDockRowText`, `.wbDockMeta`, `.wbDockError`, `.wbDockLoading`. These are intentionally generic so the remaining Phase 2C tabs (Bookmarks/Notes/Navigator/Context/Capture) can reuse them without redefining styles.

### What is still NOT in Phase 2C-H

- No write-back. No `update` / `setForAnswer` / `removeForAnswer` / `saveNow` / `setCurrentColor` calls.
- No highlight creation. No deletion. No color editing.
- No Smart Highlight scoring.
- No scroll-to-message integration (no safe per-message scroll helper is currently exposed to Studio).
- No per-chat filtering yet — `ctx.chatId` is still `null`, so the tab shows all stored highlights across answer ids. Per-chat scoping arrives once the reader snapshot populates `ctx`.
- No other tab implemented — Bookmarks/Notes/Navigator/Context/Capture/Attachments/Finder remain inert Phase 2B placeholders.

## Phase 2C-B — what landed (Bookmarks real read-only rendering)

The second real-data Dock tab. `tabs/bookmarks.tab.studio.js` no longer renders placeholder text. Instead it:

- Reads `H2O.Studio.store.bookmarks.list(chatId)` (sync, lazy-fetch behind cache; first read returns `[]` and notifies via `subscribe()` when the platform fetch resolves).
- Resolves `chatId` from `ctx.chatId → ctx.externalId → ctx.snapshotId` (first non-empty wins). Does **not** invent IDs.
- Renders a "linked chat" empty state — `Open a linked chat/snapshot to view bookmarks.` — when no chat id is present. In that state the tab does **not** subscribe.
- Renders the standard empty state — `No bookmarks found for this chat yet.` — when the chat is linked but has no entries.
- Renders a compact row per entry, sorted newest-first by `createdAt` (then `pairNo`, then store order):
  - **title**: `entry.title` if set, otherwise the first line of `entry.snapText`, otherwise `(untitled bookmark)`
  - **snippet**: the rest of `snapText` if a title was used (skipped when title equals first line)
  - **meta**: `msg <id>` (msgId or primaryAId, truncated) • `pair <n>` • localized `createdAt`
- Subscribes via `H2O.Studio.store.bookmarks.subscribe(fn)`; filters events to the current `chatId` so notifications for other chats don't repaint.
- Returns an unsubscribe cleanup function to `dock-shell` (honored at `renderActiveView:cleanup` and `unmount:activeRenderCleanup`).
- Reuses the generic Dock list CSS classes added in Phase 2C-H — no new CSS was needed. Bookmarks rows have no swatch (bookmarks aren't color-coded); the `.wbDockRowBody` simply fills the row.

### What is still NOT in Phase 2C-B

- No write-back. No `set` / `update` / `remove` / `saveNow` calls.
- No bookmark creation / deletion / editing / toggling.
- No scroll-to-message integration (no safe per-message scroll helper currently exposed to Studio).
- No multi-select. No drag-reorder.
- No other tab implemented — Notes/Navigator/Context/Capture/Attachments/Finder remain inert Phase 2B placeholders.

## Phase 2C-C — what landed (Context real read-only rendering)

The third real-data Dock tab. `tabs/context.tab.studio.js` no longer renders placeholder text. Instead it:

- Reads `H2O.Studio.store.context.getBundle(chatId)` (sync, lazy-fetch behind cache; first read may return `null` for sub-keys and notify via `subscribe()` when the platform fetch resolves).
- Resolves `chatId` from `ctx.chatId → ctx.externalId → ctx.snapshotId` (first non-empty wins). Does **not** invent IDs.
- Renders a "linked chat" empty state — `Open a linked chat/snapshot to view context.` — when no chat id is present. In that state the tab does **not** subscribe.
- Renders the standard empty state — `No context items found for this chat yet.` — when the chat is linked but has no items.
- Renders a top summary line: `<n> items • <m> history entries` (history count only shown when > 0).
- Renders a compact row per item, sorted by `order` ascending (mirroring native [3W1a `ITEM_sort` manual default](src-runtime-base/3W1a.🟧🧠%20Context%20Engine%20🧠.js:252)):
  - **title**: `item.title` if set, otherwise first line of `item.text`, otherwise `(untitled context item)`
  - **snippet**: `item.text` when distinct from title
  - **meta**: source label (`<kind> <id>` like `notes abc123`) • `id <itemId>` • `pinned` if pinned • `inactive` if `active === false` • localized `updatedAt` (or `createdAt` fallback)
- Subscribes via `H2O.Studio.store.context.subscribe(fn)`; filters events to the current `chatId` while still accepting meta-key events (singleton, no chatId) so a meta update also repaints.
- Returns an unsubscribe cleanup function to `dock-shell` (honored at `renderActiveView:cleanup` and `unmount:activeRenderCleanup`).
- Reuses generic Dock list CSS from Phase 2C-H — no new CSS was needed.

### What is still NOT in Phase 2C-C

- No write-back. No `set` / `update` / `remove` / `saveNow` / `insert` / `promote` / `demote` calls.
- No item creation / deletion / editing.
- No prompt insertion / promotion / demotion.
- No scroll-to-message integration.
- No tag/profile/scope filtering UI (the native engine has these — Studio just renders raw items).
- No other tab implemented — Notes/Navigator/Capture/Attachments/Finder remain inert Phase 2B placeholders.

## Phase 2C-N — what landed (Notes real read-only rendering)

The fourth real-data Dock tab. `tabs/notes.tab.studio.js` no longer renders placeholder text. Instead it:

- Reads `H2O.Studio.store.notes.getBundle(chatId)` (sync, lazy-fetch behind cache; first read may return `null` for either sub-key and notify via `subscribe()` when the platform fetch resolves).
- Resolves `chatId` from `ctx.chatId → ctx.externalId → ctx.snapshotId` (first non-empty wins). Does **not** invent IDs.
- Renders a "linked chat" empty state — `Open a linked chat/snapshot to view notes.` — when no chat id is present. In that state the tab does **not** subscribe.
- Renders the standard empty state — `No notes found for this chat yet.` — when the chat is linked but has neither notes nor scratchpad.
- Renders a top summary line: `<n> notes • scratchpad` (scratchpad token only shown when scratch is non-empty).
- **Scratchpad preview** (when non-empty): a single `.wbDockRow` titled `Scratchpad` with a truncated text preview. **No textarea, no input, no contenteditable, no save controls** — it is display-only.
- Renders a compact row per note, sorted with **pinned first**, then **`updatedAt` descending** (fallback `createdAt`), preserving store order on ties:
  - **title**: `note.title` if set, otherwise first line of `note.text`, otherwise `(untitled note)`
  - **snippet**: `note.text` when distinct from title
  - **meta**: source label (`<kind> <id>`) • `id <noteId>` • `pinned` badge if pinned • `#tag1 #tag2 …` if tags present • localized `updatedAt` (or `createdAt` fallback)
- Subscribes via `H2O.Studio.store.notes.subscribe(fn)`; filters events to the current `chatId` so unrelated changes don't repaint. Both `notes` and `scratch` key events fire under the same subscribe.
- Returns an unsubscribe cleanup function to `dock-shell` (honored at `renderActiveView:cleanup` and `unmount:activeRenderCleanup`).
- Reuses generic Dock list CSS from Phase 2C-H — no new CSS was needed.

### What is still NOT in Phase 2C-N

- No write-back. No `set` / `update` / `remove` / `saveNow` calls.
- No note creation / deletion / editing / pinning / unpinning.
- No editing UI (no textarea, no input, no contenteditable, no save controls — anywhere).
- No conflict-resolution UI. No `bodyVersions` handling.
- No scratchpad editing — it's a read-only preview.
- No scroll-to-message integration.
- No other tab implemented — Navigator/Capture/Attachments/Finder remain inert Phase 2B placeholders.

## Phase 2C-V — what landed (Navigator real read-only rendering)

The fifth real-data Dock tab. `tabs/navigator.tab.studio.js` no longer renders placeholder text. Instead it:

- Reads `H2O.Studio.store.navigator.getState(chatId)` + `listPinned(chatId)` + `listAliases(chatId)` + `listCollapsed(chatId)` — all synchronous, lazy-fetch behind cache; first read may return empties and notify via `subscribe()` when the platform fetch resolves.
- Resolves `chatId` from `ctx.chatId → ctx.externalId → ctx.snapshotId` (first non-empty wins). Does **not** invent IDs.
- Renders a "linked chat" empty state — `Open a linked chat/snapshot to view navigator state.` — when no chat id is present. In that state the tab does **not** subscribe.
- Renders the standard empty state — `No navigator state found for this chat yet.` — when the chat is linked but has neither a state blob nor any pinned/aliased/collapsed entries.
- Renders a top summary line: `<n> pinned • <m> aliases • <k> collapsed`.
- Renders **three read-only sections**, each with a `<title> (<count>)` header and a `.wbDockList`. Empty sections show a stub row instead of disappearing entirely:
  - **Pinned**: one row per pin entry. Title shows `turn <turnId>`; meta shows `kind` (`question`/`answer`) and, for answer pins, `answer <answerId>`.
  - **Aliases**: one row per alias. Title shows the alias value (truncated). Meta shows `turn <turnId>` and, for answer-level aliases (raw key contains `::a:<answerId>`), `answer <answerId>`. The raw key is preserved in `data-row-key`.
  - **Collapsed**: one row per currently-collapsed turn. The store's `listCollapsed()` already filters out falsy values, so we render whatever it returns.
- Subscribes via `H2O.Studio.store.navigator.subscribe(fn)`; filters events to the current `chatId` so unrelated changes don't repaint.
- Returns an unsubscribe cleanup function to `dock-shell` (honored at `renderActiveView:cleanup` and `unmount:activeRenderCleanup`).
- Reuses generic Dock list CSS from Phase 2C-H — no new CSS was needed.

### What is still NOT in Phase 2C-V

- No write-back. No `set` / `update` / `remove` / `saveNow` calls.
- No pin / unpin / alias / rename / collapse / expand editing.
- No jump-to-turn / scroll-to-message / Navigator click navigation.
- No turn-model abstraction. No outline derivation from Studio reader DOM.
- No other tab implemented — Capture/Attachments/Finder remain inert Phase 2B placeholders.

## Phase 2C-A — what landed (Attachments real read-only DOM-derived rendering)

The sixth real-data Dock tab. Unlike the H/B/C/N/V tabs, Attachments has **no persistent store** — it derives its list from the current Studio reader DOM on each render. `tabs/attachments.tab.studio.js` no longer renders placeholder text. Instead it:

- Reads `document.getElementById('viewReader')` (the Studio reader root at [studio.html:192](src-surfaces-base/studio/studio.html:192)).
- If the reader root is missing, renders `Open a saved chat reader to view attachments.` — no scan, no scrolling, no other side effects.
- Inside the reader root, performs a **single scan** for:
  - `img[src]` — all images
  - `a[href]` — links filtered by a conservative file-extension allow-list (`pdf, png, jpg, jpeg, gif, webp, svg, txt, md, doc, docx, xls, xlsx, csv, zip, json, ppt, pptx`) plus image-ish extensions (`bmp, ico, avif`).
- For each item, reads ONLY: `src`/`href`, `alt`, `textContent`, and the nearest-ancestor `data-message-id` / `data-turn-id` attributes (bounded walk that stops at the reader root).
- Renders a top summary line: `<n> attachments • <i> images • <f> files`.
- Renders a compact row per item:
  - **label**: alt text > anchor text > URL basename > URL (truncated to 240 chars)
  - **type meta**: `image`/`file` • extension display (`PDF`/`PNG`/...) • `msg <id>` (or `turn <id>` if no msgId)
  - **URL preview**: plain text only (truncated). `data:` URIs are skipped entirely.
- Renders the empty state `No attachments found in this reader.` when the reader exists but has no matches.
- Reuses generic Dock list CSS from Phase 2C-H — no new CSS was needed.

### Read-only / no-side-effects discipline

- **NO `<img>` element is ever created** by the tab. We read the source `img`'s `src` attribute as a string but never render an `<img>`, so the browser cannot re-fetch the asset through Dock content.
- **NO `<a>` element is ever created.** URLs are rendered as plain text only — a stray click cannot navigate, no `window.open`, no `target="_blank"`.
- **NO download / open / copy / delete buttons.**
- **NO clipboard / `window.open` / `fetch` / `XMLHttpRequest` calls.**
- **NO `MutationObserver`, no polling, no `setInterval`.** Single scan per render. Re-rendering happens when the user re-selects the tab; `dock-shell` already handles that.
- **NO mutation of the reader DOM.** The scan reads attributes only; nothing in `#viewReader` is added, removed, or modified.
- **NO persistence.** Items are computed fresh each render; no store is created, no key is written.

### What is still NOT in Phase 2C-A

- No live refresh while the user edits the reader (single scan per render).
- No thumbnail previews of images (text-only rows by design).
- No clickable links (text-only rows by design).
- No grouping by message or by file type.
- No filtering / search (Finder lands in its own phase).
- No other tab implemented — Capture/Finder remain inert Phase 2B placeholders.

## Phase 2C-P — what landed (Capture read-only / inert in V1)

The seventh real-data Dock tab. `tabs/capture.tab.studio.js` no longer renders only static placeholder text — it now renders the per-chat Capture items the native Capture Engine wrote. Per `STUDIO_DOCK_PANEL_CONTRACT.md`, Capture stays **inert in Studio V1**: a prominent inert-V1 notice is always shown above the list, and there is **no mutation/conversion/archive/dismiss/live-selection UI**.

What it does:

- Renders the inert-V1 notice as the first child on **every** render, regardless of state: `Capture is read-only/inert in Studio V1. Live selection and conversion are not enabled.` (marked with `data-capture-notice="inert-v1"` so smoke tests can find it).
- Reads `H2O.Studio.store.capture.getBundle(chatId)` (sync, lazy-fetch behind cache; first read may return `null` for either sub-key and notify via `subscribe()` when the platform fetch resolves).
- Resolves `chatId` from `ctx.chatId → ctx.externalId → ctx.snapshotId` (first non-empty wins). Does **not** invent IDs.
- Renders a "linked chat" hint — `Open a linked chat/snapshot to view captured items.` — when no chat id is present. The inert notice is still shown above it. In that state the tab does **not** subscribe.
- Renders the standard empty state — `No captured items found for this chat yet.` — when the chat is linked but the store has no items.
- Renders a top summary line: `<n> captured • <r> reviewed • <c> converted` (the latter two parts only appear when > 0).
- Renders a compact row per item, sorted with **pinned first**, then **`updatedAt` descending** (fallback `createdAt`), preserving store order on ties:
  - **title**: `item.title` if set, otherwise first line of `item.text`, otherwise `(untitled capture)`
  - **snippet**: `item.text` when distinct from title
  - **meta**: `kind` • `status: <s>` • `route: <routeSuggestion>` • source label (`<role> msg <msgId>`) • `id <itemId>` • `pinned` / `dismissed` badges • `#tag1 #tag2 …` • localized `updatedAt` (or `createdAt` fallback)
  - **reviewed provenance** (optional, read-only): `reviewed at <ts>` line when `reviewedAt` is set
  - **converted provenance** (optional, read-only): `converted → <kind> <id>` line when `convertedTo` is set — this is **pure metadata**, NOT an action button
- Subscribes via `H2O.Studio.store.capture.subscribe(fn)` only when a chatId is resolved; filters events to the current `chatId` so unrelated changes don't repaint.
- Returns an unsubscribe cleanup function to `dock-shell` (honored at `renderActiveView:cleanup` and `unmount:activeRenderCleanup`).
- Reuses generic Dock list CSS from Phase 2C-H — no new CSS was needed.

### Read-only / inert discipline (V1)

- **NO** `set` / `update` / `remove` / `saveNow` / `convert` / `archive` / `dismiss` / `review` / `create` / write API call.
- **NO** mutation of the items array or store/ui blobs returned by the store.
- **NO `<a>`, `<img>`, `<button>` rendered.** Plain text-only rows; a stray click cannot trigger conversion or navigation.
- **NO `getSelection` / Selection API.** Studio reads snapshots, not live chat — there is nothing to capture from a live selection here.
- **NO** `window.open` / `clipboard` / `fetch` / `XMLHttpRequest` / `MutationObserver` / `setInterval`.
- **NO** scroll-to-message integration.
- Capture **rail title remains `Capture Box`** to match the native rail item label.

### What is still NOT in Phase 2C-P

- No Capture creation, deletion, editing, archiving, dismissal, or review-flow editing.
- No conversion to Notes / Bookmarks / Context.
- No live text selection or any capture-by-click flow.
- No filtering / search / sort controls (`ui.filter` / `ui.sortBy` / `ui.query` are not exposed as controls; only the items themselves are rendered).
- No `subTab` switching (`'capture'` vs `'review'`) — V1 just shows all items with `status`/`dismissed` surfaced in meta.
- No other tab implemented — Finder remains an inert Phase 2B placeholder.

## Phase 2C-F — what landed (Finder read-only local search)

The eighth and final Phase 2C real-data Dock tab. Finder provides a local, in-memory, read-only search across the persisted-store sources already wired in Phases 2C-H/B/C/N/V/P:

- `H2O.Studio.store.highlights.getAll()` — every highlight item across `itemsByAnswer`
- `H2O.Studio.store.bookmarks.list(chatId)` — every bookmark entry for the active chat
- `H2O.Studio.store.context.getBundle(chatId)` — every context item
- `H2O.Studio.store.notes.getBundle(chatId)` — every note plus the scratchpad (rendered as a single `scratchpad` result row when non-empty)
- `H2O.Studio.store.navigator.listPinned/listAliases/listCollapsed(chatId)` — pins, aliases, and currently-collapsed turns
- `H2O.Studio.store.capture.getBundle(chatId)` — every captured item (including dismissed/converted)

**Attachments search is intentionally NOT included** in this phase. Rather than duplicating the Attachments tab's DOM scanner, Finder renders a footer line: `Attachments search lands later — use the Attachments tab for now.`

What the tab renders:

- A linked-chat empty state — `Open a linked chat/snapshot to search Dock data.` — when no chatId is present. In that state no subscriptions are created and the search input is not rendered.
- When a chatId is present:
  - A `<input type="search">` at the top (inline-styled; deliberately does not edit the externally-modified `studio.css`).
  - A summary line: `<n> items indexed (live, in-memory)` (empty query) or `<m> result(s) of <n> indexed` (non-empty query).
  - With an empty query: `Type to search Dock data.`
  - With a non-empty query: a `.wbDockList` of compact result rows, sorted by source order (H/B/N/V/C/P).
  - The Attachments-deferred footer.
- Each result row shows:
  - **Source label** (`HIGHLIGHTS` / `BOOKMARKS` / `NOTES` / `NAVIGATOR` / `CONTEXT` / `CAPTURE`) inline before the title
  - **Title** (entry-specific: highlight text / bookmark title / context title / note title / alias value / capture title / scratchpad marker)
  - **Snippet** (when distinct from title)
  - **Meta** line (kind, ids, tags, status flags, pin badges, source kind/id, etc. — same shape as the per-tab meta lines)

### Read-only / no-persistence discipline

- The query is held only in a JS variable inside the render closure. It is **NEVER** written to `localStorage`, `sessionStorage`, `chrome.storage`, `H2O.Studio.store.prefs`, or any other persistence.
- **NO** `set` / `update` / `remove` / `saveNow` / write API on any store is ever called.
- **NO** `<a>`, `<img>`, `<button>` rendered — text-only rows. The only interactive element is the local `<input type="search">`.
- **NO** click-to-open, click-to-scroll, click-to-copy. No `window.open`, no clipboard, no `fetch`, no `XMLHttpRequest`, no `MutationObserver`, no `setInterval`, no `scrollTo`, no `scrollIntoView`.
- Finder subscribes to all six stores on render and **rebuilds the in-memory cache on any change**, but never writes back to those stores.
- The `cleanup()` function returned to dock-shell unsubscribes **all** subscriptions so re-selecting the tab does not leak handlers.

### What is still NOT in Phase 2C-F

- No Attachments search (deferred — see footer note).
- No click-to-jump from a result to the source item / tab / message.
- No query persistence across tab switches (intentional read-only stance).
- No fuzzy matching / ranking — simple case-insensitive substring match for V1.
- No grouping by source in the rendered list (sorted by source order, but no group headers).
- No write-back / mutation surface anywhere in the tab.

## D2 — what landed (chat-context sync + rail-visible-when-closed)

Phase 2C shipped the 8 read-only tabs, but two behaviors were wrong:
1. Every tab render received `{ chatId: null, externalId: null, snapshotId: null }` — so chat-scoped tabs always fell to the "Open a linked chat" empty state, and Highlights leaked data across all answer ids.
2. The Dock rail was invisible when the Dock was closed — CSS hid the entire `#studioDock` container. Users on the reader route saw no affordance to open the Dock.

D2 fixes both, plus wires route-change refresh.

### What changed

**`studio.js`** — one new read-only accessor:
- `H2O.Studio.getReaderContext()` returns `{ snapshotId, chatId }` from the module-scoped `state.currentReaderSnapshot`. Empty strings when no reader is open. Never mutates. This is the minimal blocker (the shell can't reach `state` directly because it's module-scoped).

**`dock-shell.studio.js`**:
- New `resolveDockContext()` helper reads `document.body.dataset.route` + `H2O.Studio.getReaderContext()` + `document.getElementById('viewReader')` and returns `{ isReader, route, snapshotId, chatId, externalId, readerRoot }`. All read-only.
- `renderActiveView()` now builds `ctx` from `resolveDockContext()` — real `chatId` / `externalId` / `snapshotId` / `route` / `isReader` / `readerRoot` flow to every tab.
- New `bindRouteRefresh()` binds a single `hashchange` + `evt:h2o:studio:reader-refresh-requested` listener at mount. The handler defers via `setTimeout(fn, 0)` so studio.js has time to update `state.currentReaderSnapshot` before the shell re-resolves context.
- `unmount()` calls `unbindRouteRefresh()`.
- `applyOpenToDom()` no longer toggles the `hidden` HTML attribute. It strips the initial `hidden` attribute once at mount (kept in the HTML for pre-JS a11y safety), then toggles the `wbDock--open` class only.
- Rail button click handler now calls `open()` before `setView(tabId)` — clicking a rail button in the closed state expands the body.

**`studio.css`** — three-state visibility model:
- Default (non-reader route): `#studioDock { display: none; }`
- Reader route + closed: `body[data-route="reader"] #studioDock { display: flex; width: 44px; ... }` — rail-only strip on the right edge
- Reader route + open (`.wbDock--open`): `width: 340px; max-width: 96vw;`
- Body hidden when closed: `body[data-route="reader"] #studioDock:not(.wbDock--open) [data-role="dock-body"] { display: none; }`

### Read-only / no-side-effects discipline (still holds)

- No feature-store writes. Only `h2o:studio:dock*` prefs writes (open/view) from the shell.
- No new persistence surface. The reader-context accessor is a pure read.
- No `MutationObserver`, no `setInterval`, no polling. The route refresh listener is bound once at mount and unbound at unmount.
- No `<button>` / `<a>` / `<img>` / `<textarea>` / `<input>` added to Capture or any other tab's DOM.
- Capture remains inert. Finder query remains local-only.

### Acceptance criteria (met by D2)

- Opening saved chat A shows chat A's data in Bookmarks / Notes / Context / Navigator / Capture / Finder.
- Opening saved chat B (via `#/read/<B>`) refreshes the active tab to chat B's data.
- Missing `chatId` (snapshot-only chat) shows the linked-chat empty state — no `'unknown'` bucket contamination.
- Reader route + closed: 8 rail buttons visible in a 44px column on the right edge.
- Reader route + open: rail + 340px body panel visible; active tab content rendered from correct chat.
- Non-reader routes: `#studioDock` fully hidden.
- Clicking any rail button in the closed state opens the body AND switches to that tab.
- All 8 tabs remain read-only. No write-back added anywhere.

## D3.1 — Native placement parity decision record (docs only)

**Status:** Decision recorded. Not yet implemented. No code changes in this commit.

### Why D3 is needed

D2 fixed the *functional* Dock behavior (context flow, route refresh, rail visibility when closed), but the *placement* of the Dock is architecturally wrong for the product goal. Manual browser smoke confirmed:

- The Studio Dock renders as a fixed right-edge panel anchored to the right side of `.wbStage` (44px rail column when closed, 340px full panel when open).
- The native ChatGPT extension Dock renders on the **LEFT** side of the viewport.
- The user's product intent is strict visual/behavioral parity with the native extension.

D2 is therefore **functionally correct but placement-wrong** for the product goal.

### Native Dock model (evidence from `src-runtime-base/3A1a.…Dock Panel.js`)

| Aspect | Native behavior | Source |
|---|---|---|
| Rail host | `#stage-sidebar-tiny-bar` — ChatGPT's sidebar tiny-bar (the icon strip visible when the ChatGPT sidebar is collapsed) | 3A1a:185 (`SB_TINY_RAIL`), :669, :1433 |
| Rail insertion | `stack.appendChild(wrap)` — the 8 rail button wrappers are appended into a stack inside the tiny-bar; each wrapper is a clone of the existing native `a[data-sidebar-item="true"]` template so it inherits native styling | 3A1a:1451-1559 |
| Rail visibility | Rail lives inside the tiny-bar, which is **only shown when the ChatGPT sidebar is collapsed** | 3A1a:668-681 (`UI_DP_isSidebarCollapsedByRail`) |
| Panel body host | `<aside>` created and `document.body.appendChild(panel)` — body-level element, not inside sidebar | 3A1a:883-933 (`UI_DPANEL_ensurePanel`) |
| Panel positioning | `panel.style.left = <sidebar-rect.left>px; panel.style.width = <sidebar-rect.width>px;` — panel **overlays** the sidebar area using inline styles derived from the live sidebar rect. When sidebar is closed: `left = 0`, `width = 260`. | 3A1a:810-819 (`UI_DP_alignPanelToSidebar`) |
| Closed state | Only rail (inside tiny-bar) is visible; panel is absent or `[cgxui-state=""]` | 3A1a:944, 1006, 1041 |
| Open state | Rail + panel body overlays the sidebar column; does NOT push content, does NOT overlay the reader | above |

**Native model summary:**
- Rail buttons live **inside the sidebar's tiny-bar** (LEFT edge).
- Panel body **overlays the sidebar area** (LEFT side, same left/width as the sidebar).
- Panel is NOT a right-edge overlay of the main content.

### Studio target model (strict native-placement parity)

| Aspect | Studio target |
|---|---|
| Rail host | Inside `.wbRail` (Studio's tiny-bar equivalent at studio.html:35, currently a 56px left column shown when `body[data-sidebar="closed"]`) |
| Rail insertion | New `<div class="wbDockRailStack" data-role="dock-rail">` appended into `.wbRail` after `#railSidebarBtn`; contains 8 rail buttons matching native color/txt/order |
| Rail visibility | Reader route: rail buttons visible (regardless of sidebar state, or force sidebar collapse — resolved in D3.2). Non-reader route: hidden. |
| Panel body host | New `<aside id="studioDockPanel" data-role="dock-body">` at the **shell level** — child of `.wbShell`, sibling to `.wbRail` / `.wbSide--sidebar` / `.wbStage`. **NOT inside `.wbStage`.** |
| Panel positioning | `position: absolute; top: 0; bottom: 0; left: var(--wb-rail-w); width: var(--wb-side-w); z-index: 5;` — overlays the sidebar column. Closed: `display: none`. |
| Route hiding | `body:not([data-route="reader"]) .wbDockRailStack, body:not([data-route="reader"]) #studioDockPanel { display: none; }` |
| Existing `#studioDock` in `.wbStage` | **Removed.** The right-edge model does not exist in the target. |

### Explicit decisions

1. **Strict native-placement parity.** Studio Dock rail must appear at the LEFT edge, in the same position and orientation as the native ChatGPT Dock rail.
2. **Left-side rail.** Rail buttons live inside `.wbRail`, not `.wbStage`. Buttons keep the same 44×44 colored-square + single-letter-txt shape mirrored from native (H/#C7A106, B/#2C7A4A, N/#A83A3A, A/#345E9E, V/#D47A38, C/#6740A8, P/#C05C95, F/#3FA7D6).
3. **Sidebar-column overlay.** The Dock panel body overlays the `.wbSide--sidebar` column (LEFT), NOT the reader content (right). Its positioning mirrors native's `UI_DP_alignPanelToSidebar` behavior.
4. **No right-edge Dock.** The current `#studioDock` inside `.wbStage` will be removed. There is no right-side Dock host in the target model.
5. **D2 context resolver remains valid.** `H2O.Studio.getReaderContext()` (in studio.js) and `resolveDockContext()` (in dock-shell.studio.js) are unchanged by D3. The context flow, hashchange refresh, and `evt:h2o:studio:reader-refresh-requested` handler carry over verbatim.
6. **All 8 tabs stay read-only.** No tab code, no store code, no tab CSS classes change. D3 is purely structural — moving the host DOM and repositioning via CSS.
7. **Capture stays inert, Finder stays local-only.** No behavior change to either tab in D3.

### Route/state behavior (target)

| State | `.wbRail` | `.wbDockRailStack` (new) | `#studioDockPanel` (new) | `.wbSide--sidebar` |
|---|---|---|---|---|
| Non-reader route | Unchanged (Studio default: hidden when sidebar open, visible when sidebar closed) | Hidden | Hidden | Unchanged |
| Reader route + Dock closed | Visible per Studio sidebar state; rail-stack overlays if needed | Visible (8 buttons) | Hidden | Visible (default) |
| Reader route + Dock open | Visible | Visible (8 buttons; active button highlighted) | Visible — overlays sidebar column | Hidden underneath overlay |

Clicking a rail button opens the Dock body and switches to that tab (D2 behavior, preserved verbatim). Close button collapses the Dock body but keeps the rail available. Route hiding is CSS-controlled by `body[data-route]`.

### Files touched in the future D3 implementation phases

| File | Expected D3 change | Phase |
|---|---|---|
| `src-surfaces-base/studio/studio.html` | Remove `#studioDock` from `.wbStage`; add `<div class="wbDockRailStack" data-role="dock-rail">` inside `.wbRail`; add `<aside id="studioDockPanel" data-role="dock-body">` at shell level | D3.2 |
| `src-surfaces-base/studio/studio.css` | Remove D2 right-edge Dock rules; add rail-stack CSS and sidebar-overlay panel CSS with route gating | D3.3 |
| `src-surfaces-base/studio/dock/dock-shell.studio.js` | Update `mount()` to accept split rail-host + body-host DOM refs; leave all context/refresh/render logic unchanged | D3.4 |
| `src-surfaces-base/studio/dock/README.md` | Document each D3 sub-phase (2/3/4) and the browser-smoke results (5) | D3.2–D3.5 |

### Non-goals (explicitly excluded from D3)

- **No write-back.** All 8 tabs remain strictly read-only.
- **No tab code changes.** `dock/tabs/*.tab.studio.js` are untouched.
- **No store code changes.** `store/{highlights,bookmarks,notes,context,navigator,capture,prefs}.js` are untouched.
- **No native runtime edits.** `src-runtime-base/*` is not touched.
- **No Ribbon / Overlay / appearance / Tauri / sync file edits.** D3 is scoped to the Dock host + CSS + shell mount code only.
- **No feature/UX additions** beyond placement parity (no thumbnails, no click-to-scroll, no keyboard shortcuts, no persistence, no new controls).
- **No changes to `H2O.Studio.getReaderContext()`.** The D2 accessor stays as-is.
- **No changes to `dock-keys.js` or route-refresh listeners.** D2 wiring carries over verbatim.

### Open questions to resolve before D3.2 (implementation)

1. Should the Dock rail (`.wbDockRailStack`) be visible on reader route **regardless of sidebar state**, or ONLY when `body[data-sidebar="closed"]` (strict native — native rail only shows when ChatGPT sidebar is collapsed)?
2. When the user opens Dock on reader route with the sidebar open, should Studio **force sidebar collapse** (via `body.dataset.sidebar = "closed"`), or should the Dock panel simply overlay the visible sidebar?
3. Does the sidebar-column overlay use `position: absolute` (inside `.wbShell`) or `position: fixed` (with inline `left`/`width` mirroring native's `UI_DP_alignPanelToSidebar` pattern)?

These are resolved at the start of D3.2 based on visual comparison against native and user preference.

### Acceptance for D3.1 (this record)

- [x] D2 outcome (functional correctness, wrong placement) documented.
- [x] Native placement model documented with source-line references.
- [x] Studio target model documented with explicit DOM/CSS positioning.
- [x] Explicit decisions listed.
- [x] Route/state behavior table provided.
- [x] Future-phase file plan listed.
- [x] Non-goals listed.
- [x] No code files changed in this commit.

Next step: **D3.2 — split-host Dock placement** (implementation phase, blocked on the three open questions above).

## D3.2 — what landed (native-left split-host placement)

The Dock moved from the D2 right-edge overlay to native-parity left placement. The single `#studioDock` host inside `.wbStage` was split into two DOM branches:

- **Rail host** — `<div class="wbDockRailStack" data-role="dock-rail">` inside `<aside class="wbRail">` (Studio's tiny-rail; the analog of native ChatGPT's `#stage-sidebar-tiny-bar`). The dock-shell renders one `.wbDockRailBtn` per registered tab into this stack. Buttons keep their Phase 2B styling (44×44-ish colored squares with single-letter txt + per-tab `--wb-dock-rail-color`).
- **Panel host** — `<aside id="studioDockPanel" data-role="dock-panel">` at `.wbShell` level (sibling to `.wbRail` / `.wbSide--sidebar` / `.wbStage`), containing the head (`data-role="dock-head"` + close button) and view (`data-role="dock-view"`).

The old `#studioDock` right-edge host was removed from `.wbStage`.

### CSS placement (studio.css)

- `.wbShell { position: relative; }` — positioning context for the absolute panel.
- `body[data-route="reader"] .wbShell { grid-template-columns: var(--wb-rail-w) 0 minmax(0, 1fr); }` — reader route reveals the tiny-rail column and collapses the sidebar column. **This is a scoped, non-persistent CSS override — it never writes `data-sidebar`, so the saved sidebar preference is intact and restored on leaving the reader route.**
- `body[data-route="reader"] .wbRail { opacity: 1; pointer-events: auto; }` — the tiny-rail is normally faded out when the sidebar is open; on reader routes it's shown so the Dock buttons are reachable.
- `.wbDockRailStack` — hidden by default; `display: flex` (vertical) on reader routes.
- `#studioDockPanel` — `position: absolute; top: 0; bottom: 0; left: var(--wb-rail-w); width: var(--wb-side-w); z-index: 20;` — overlays the sidebar column, mirroring native's `UI_DP_alignPanelToSidebar` (panel over the sidebar area). Hidden until `.wbDock--open` is set on the reader route.

### Shell changes (dock-shell.studio.js)

- `dockRefs` gains a `panel` field. `container` and `panel` both point at `#studioDockPanel`; `rail` points at the separate `.wbDockRailStack`.
- `mount()` resolves the rail via a container-first, document-fallback chain: `container.querySelector('[data-role="dock-rail"]')` (back-compat: node smoke tests pass a single inline container) → `document.querySelector('[data-role="dock-rail"]')` (production: rail is in a different branch). Body/head/view/close resolve inside the panel; close accepts both `data-role="dock-close"` and the legacy `data-dock-action="close"`.
- `applyOpenToDom()` toggles `.wbDock--open` on the panel AND a scoped, non-persistent `wbDockPanelOpen` class on `document.body`. It never touches `body.dataset.sidebar`.
- `unmount()` clears the `wbDockPanelOpen` body class.
- `autoMount()` mounts onto `#studioDockPanel` (with a harmless `#studioDock` fallback for transition safety).
- **Preserved from D2 verbatim:** `resolveDockContext()`, real ctx passed to tabs, route refresh via `hashchange` + `evt:h2o:studio:reader-refresh-requested` with `setTimeout(fn, 0)` defer, rail-click `open()` + `setView(tabId)`, and `H2O.Studio.getReaderContext()` in studio.js.

### Behavior model (target, resolved from D3.1 open questions)

| State | `.wbDockRailStack` | `#studioDockPanel` | Sidebar column |
|---|---|---|---|
| Non-reader route | hidden | hidden | normal (per saved pref) |
| Reader route + Dock closed | visible (8 buttons) | hidden | collapsed to tiny-rail (CSS-only, non-persistent) |
| Reader route + Dock open | visible | overlays sidebar column area | covered by opaque panel |

Resolution of the three D3.1 open questions:
1. Rail visible on reader route **regardless of saved sidebar state** — achieved via the reader-route grid override (does not mutate `data-sidebar`).
2. Opening the Dock **covers** the sidebar column with the opaque panel (native "overlay" model), rather than mutating sidebar state.
3. Panel uses **`position: absolute` inside `.wbShell`** per the user decision.

### Read-only / no-side-effect discipline (still holds)

- No feature-store writes. Only the existing `h2o:studio:dock*` prefs writes (open/view) from the shell.
- No new persistence. The `wbDockPanelOpen` body class is in-memory only, cleared on unmount.
- No `MutationObserver`, `setInterval`, `fetch`, `window.open`, clipboard, or scroll behavior added.
- No tab or store code changed. Capture stays inert; Finder stays local-only.
- `studio.js` NOT edited in D3.2 (the D2 `getReaderContext` accessor already suffices; the sidebar overlay is CSS-only, so no sidebar-collapse API was needed).

### Known follow-ups (not blocking D3.2)

- The Phase 2B `.wbDockRail` rule (old in-container rail class) is now dead CSS — harmless (no element carries that class). Can be pruned in a later cleanup.
- On reader routes the full sidebar is collapsed to the tiny-rail. Re-expanding the sidebar mid-read (via `#railSidebarBtn`) while the reader-route grid override is active is a follow-up refinement.
- `aria-hidden` review of the rail region (native-parity a11y) remains a follow-up.

### Acceptance for D3.2

- [x] Rail buttons hosted inside `.wbRail` (left), not `.wbStage` (right).
- [x] Panel hosted at `.wbShell` level, overlaying the sidebar column.
- [x] Old right-edge `#studioDock` removed from `.wbStage`.
- [x] Non-reader route hides rail + panel; reader route shows rail; open shows panel.
- [x] D2 context resolver + route refresh preserved.
- [x] No write-back, no tab/store changes, no native runtime edits.
- [ ] Browser side-by-side vs native (pending manual smoke).

## D3.2.1 — what landed (native sidebar-rail integration fix)

D3.2 placed the Dock on the left but browser smoke exposed three real bugs, all caused by **one CSS mistake**: D3.2 force-overrode the shell grid and rail on every reader route —

```css
body[data-route="reader"] .wbShell { grid-template-columns: var(--wb-rail-w) 0 minmax(0,1fr); }
body[data-route="reader"] .wbRail  { opacity: 1; pointer-events: auto; }
```

**Root cause:** Studio's `.wbShell` grid and `.wbRail` are driven by `body[data-sidebar]` (open ⇒ `0 side 1fr`, rail hidden; closed ⇒ `rail 0 1fr`, rail shown — studio.css:264/272/293). The D3.2 route override ignored `data-sidebar` and forced the sidebar column to `0` on **every** reader route. Consequences:
- The sidebar half-collapsed (~20px) even when `data-sidebar="open"`.
- The hamburger (`#railSidebarBtn`) appeared broken — toggling `data-sidebar` had no visible effect because the route override always won.
- The forced-visible `.wbRail` showed the Dock buttons in a broken, clipped half-state.

**D3.2.1 fix — let Studio's own sidebar state drive everything:**
- **Removed** both forced-override rules. No grid override, no `.wbRail` opacity override. The hamburger and sidebar behave exactly as before.
- Dock buttons (`.wbDockRailStack`) are gated to `body[data-route="reader"][data-sidebar="closed"]` — they appear **only when the tiny-rail is naturally visible** (sidebar collapsed), matching native's tiny-bar behavior. No clipping (the rail has real width in that state).
- The panel is likewise gated to `[data-sidebar="closed"]`, so it never fights an open full sidebar.
- Result — native-parity states:
  - **Reader + sidebar open:** full sidebar shows, hamburger toggles normally, no Dock buttons (tiny-bar absent).
  - **Reader + sidebar closed:** tiny-rail shows the hamburger + Dock buttons below it; clicking a Dock button opens the panel over the sidebar lane.

**Button visual parity (`.wbDockRailBtn`):** changed from transparent/tint-on-hover to **solid rounded colored tiles** (filled with the tab's `--wb-dock-rail-color`) with a bold white single-letter badge, 34×34, inner shadow for depth, hover lift, and a white ring for the active/current view — mirroring the native ChatGPT Dock rail buttons. Order preserved: H/B/N/A/V/C/P/F.

**Shell unchanged:** the bug was purely CSS. `dock-shell.studio.js` (rail-click `open()`+`setView`, D2 context resolver, route refresh, the non-persistent `wbDockPanelOpen` body marker) is untouched. `studio.html` is untouched (the D3.2 hosts are already correct).

### Model note / known follow-up
- The Dock buttons live inside the existing `.wbRail` tiny-rail (below the hamburger) as **additional buttons**, not a separate competing rail. When the panel is open, the tiny-rail with the Dock buttons remains visible on the far left (at `left:0`, 44px) beside the panel (`left: var(--wb-rail-w)`), which keeps tab-switching functional. Native covers the tiny-bar and switches tabs via an in-panel dropdown; **adding that in-panel view switcher (so the panel can fully cover the rail) is a deferred follow-up (D3.3)** — it is out of scope for this placement fix.
- The dead `.wbDockRail` Phase 2B rule (old in-container rail class) remains harmless dead CSS; prune in a later cleanup.

### Acceptance for D3.2.1
- [x] Removed the forced `.wbShell` grid + `.wbRail` opacity overrides.
- [x] Hamburger / sidebar open-close behavior restored (no route override touches the grid).
- [x] Dock buttons gated to reader + sidebar-closed (native tiny-bar parity), no clipping.
- [x] Panel gated likewise; opens on the left over the sidebar lane, never the right.
- [x] Button tiles restyled to native-parity colored squares with white badges + active ring.
- [x] No write-back, no tab/store changes, no native runtime edits, sidebar preference never mutated.
- [ ] Browser side-by-side vs native (pending manual smoke).

## D3.2.2 — what landed (Dock eligibility keyed off the editor pane, not the route)

D3.2/D3.2.1 gated the Dock on `body[data-route="reader"]`. Browser smoke found a saved-chat/editor screen where `body.dataset.route` stays `"list"` (hash `#/saved`) while a chat is shown in the `#viewReader` pane — so the Dock CSS hid the panel and `H2O.Studio.getReaderContext()` returned empty (it only reads `state.currentReaderSnapshot`, which that path doesn't set).

**Root cause:** the D2/D3 route model assumed every open chat lives under `body[data-route="reader"]` + `state.currentReaderSnapshot`. That is not true — a saved chat/editor can be shown in `#viewReader` under `#/saved` (inline editor / linked placeholder) or in a route-timing window where `#viewReader` is un-hidden before the route settles.

**Fix — key eligibility off the editor pane, not the route:**
- **`H2O.Studio.getDockContext()`** (new, in studio.js; `getReaderContext()` kept for back-compat) — read-only. Returns `{ snapshotId, chatId, source, eligible }`:
  - `state.currentReaderSnapshot` present → `{ ...ids, source: "reader", eligible: true }`.
  - else `#viewReader` visible (`.hidden === false`) → `{ ids from state.selectedSnapshotId/selectedChatId, source: "saved-editor", eligible: true }`.
  - else (plain saved list / library / settings — `#viewReader` hidden) → `{ "", "", source: "none", eligible: false }`.
  - Never invents ids; never mutates state.
- **`body.dataset.dockEligible`** — set from `getDockContext().eligible` in `applyUiState()` (runs on every route/UI change) and directly in `renderLinkedReaderPlaceholder()` (the inline path with no hashchange). Read-only marker; the sidebar preference is never touched.
- **Shell refresh on no-hashchange opens:** `renderLinkedReaderPlaceholder()` and the async tail of `renderReader()` dispatch the existing `evt:h2o:studio:reader-refresh-requested` event, so the Dock shell re-renders the active tab with the resolved `chatId`.
- **Shell** — `resolveDockContext()` now consumes `getDockContext()` (falls back to `getReaderContext()` + route when absent) and surfaces `dockEligible` / `source` in the ctx.
- **CSS** — the gate changed from `body[data-route="reader"][data-sidebar="closed"]` to `body[data-dock-eligible="true"][data-sidebar="closed"]` for `.wbDockRailStack` and `#studioDockPanel.wbDock--open` (+ the narrow-viewport rule). No forced grid/rail overrides reintroduced; native tile styling unchanged.

**Exact eligibility rule:**
| Screen | `#viewReader` | `dockEligible` | Dock (sidebar closed) |
|---|---|---|---|
| Plain saved list (no chat open) | hidden | `false` | hidden |
| Saved-chat/editor open under `#/saved` | visible | `true` | visible |
| Reader route (`#/read/…`) | visible | `true` | visible |
| Library / Settings | hidden | `false` | hidden |

No write-back, no tab/store changes, no native runtime edits. Capture stays inert; Finder stays local-only.

### Acceptance for D3.2.2
- [x] Eligibility keyed off `#viewReader` visibility / `currentReaderSnapshot`, not `route === "reader"`.
- [x] `body.dataset.dockEligible` marker drives the CSS gate.
- [x] Saved-chat/editor open under `#/saved` (route "list") now shows the Dock (sidebar closed).
- [x] Plain saved list still hides the Dock.
- [x] Reader route still works; context flows to tabs; chat A→B refresh preserved.
- [x] No forced layout overrides; no write-back; no native runtime edits.
- [ ] Browser smoke on `http://127.0.0.1:1430/studio.html#/saved` (pending).
