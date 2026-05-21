# `src-surfaces-base/studio/dock/`

Status: Phase 0B and Phase 1a landed (`dock-keys.js`, `dock-shell.studio.js`). Further modules (`tabs/*`, persistence wiring) land in Phase 1b+.

Audience: anyone implementing or reviewing Phase 0B and later Dock Panel work.

Companion docs:
- `docs/architecture/studio-dock-panel-plan.md` — the overall plan and phase boundaries.
- `docs/contracts/studio-dock-tab-registration.md` — the Studio-local `H2O.Studio.dock.registerTab` API contract.
- `src-surfaces-base/studio/STUDIO_DOCK_PANEL_CONTRACT.md` — ownership, conflict rules, and Capture/Smart-Highlight V1 stance.

## What lives here

- **Phase 0B (landed)**: `dock-keys.js` — passive constants module that mirrors native storage-key and event-name strings used by Dock Panel features. Studio-local. No native code touched. Exposes `H2O.Studio.DockKeys`, `H2O.Studio.DockEvents`, and `H2O.Studio.DockKeyFor`.
- **Phase 1a (landed)**: `dock-shell.studio.js` — defines `H2O.Studio.dock` and its `registerTab` API per the contract above. `mount/unmount/open/close/toggle/setView/getView` are no-op or in-memory-only state mutators; no DOM, no storage. Tabs registered through it are tracked in `H2O.Studio.dock.tabs` but not rendered yet.
- **Phase 1b**: persistence wiring — `H2O.Studio.dock.state.open` and `.view` start syncing to `H2O.Studio.store.prefs('studio:dock:*')` so they survive reload.
- **Phase 1c–1f**: per-feature read-only entity stores live in `../store/`, not here. This directory holds the Dock UI scaffolding.
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
