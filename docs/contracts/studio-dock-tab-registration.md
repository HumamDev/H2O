# Studio Dock Tab Registration Contract

Status: Pending implementation (Phase 1a). This document defines the API; the implementation does not yet exist.
Audience: anyone implementing or porting a Dock Panel tab into Studio.
Companion docs:
- `src-surfaces-base/studio/STUDIO_DOCK_PANEL_CONTRACT.md` — ownership, conflict, and surface-policy rules.
- `docs/architecture/studio-dock-panel-plan.md` — the overall phased plan.
- `src-surfaces-base/studio/dock/README.md` — code-level conventions (IIFE pattern, no ES modules).

## Scope

This contract is **Studio-local only**. It defines the API for registering a tab into Studio's Dock Panel UI. It mirrors the shape of the native runtime's `H2O.Dock.registerTab` call sites observed today, so that porting a tab is mostly mechanical, but it does **not** unify with native. Native continues to own its own `H2O.Dock.registerTab`; nothing in `src-runtime-base/` is touched by this contract.

A shared cross-surface contract (`H2O.Feature.dock.register`) is **not** introduced here and is not on the near-term roadmap.

## Why mirror, not share

Three reasons:

1. **Decoupling.** If native renames or restructures, Studio is unaffected until we explicitly re-port.
2. **Surface-specific affordances.** Studio's reader has a snapshot id, an external chat id, and route context that the native page does not have (and vice versa). The `ctx` passed to tabs differs by design.
3. **Conservative scope.** Building Studio's Dock first without touching native lets us land a working read-only mirror without coordinating with native runtime changes.

## Observed native shape (the source we mirror)

Three native tab files call into the legacy bridge after resolving `H2O.Dock` (or `H2O.PanelSide`):

- `src-runtime-base/3B2a.🟠⭐ Bookmarks Tab ⭐.js:1500` — `const Dock = H2O.Dock || H2O.PanelSide || null;`
- `src-runtime-base/3V2a.🟠🧭 Navigator Tab 🧭.js:251` — same pattern.
- `src-runtime-base/3N2a.🟠🗒️ Notes Tab 🗒️.js:1926` — same pattern.

The bridge object is published at `src-runtime-base/3A1a.🟧🎖️ Dock Panel 🎖️.js:337-338`:

```js
H2O.Dock = H2O.Dock || H2O.PanelSide || {};
H2O.PanelSide = H2O.Dock;
```

`H2O.Dock.registerTab` is a runtime-added property on that bridge. Its exact signature is not declared in a type or schema; it is inferred from how tabs call it. The minimum observed `def` carries `{ id, title, render(container, state), onRowClick? }`, with additional tab-specific fields. (Tab files in this repo also pass tab-specific helpers; those are not part of the API surface — they're conventions internal to each native tab.)

This contract describes the **Studio** API; native is documented here only to anchor the mirror.

## API

```text
namespace: H2O.Studio.dock
```

```text
H2O.Studio.dock.registerTab(id, def): void
H2O.Studio.dock.getTab(id): TabDef | null
H2O.Studio.dock.tabs: { [id: string]: TabDef }     // read-only view; do not mutate
H2O.Studio.dock.mount(container: HTMLElement): void
H2O.Studio.dock.unmount(): void
H2O.Studio.dock.open(): void
H2O.Studio.dock.close(): void
H2O.Studio.dock.toggle(): void
H2O.Studio.dock.setView(id: string): void
H2O.Studio.dock.getView(): string | null
H2O.Studio.dock.state: {
  open: boolean,
  view: string | null,
}
H2O.Studio.dock.events: {
  ready: 'h2o:studio:dock:ready',
  viewChanged: 'h2o:studio:dock:view-changed',
  openChanged: 'h2o:studio:dock:open-changed',
  tabRegistered: 'h2o:studio:dock:tab-registered',
}
```

### `TabDef` (required and optional fields)

```text
{
  id: string,                                       // unique key, e.g. 'highlights'
  title: string,                                    // user-visible label
  icon?: string,                                    // optional CSS/icon hint
  color?: string,                                   // optional accent
  render(container: HTMLElement, ctx: TabCtx): void | (() => void)
                                                    // ‘return a cleanup’ is allowed; called on dispose/unmount
  refresh?(ctx: TabCtx): void                       // optional re-render hook (data changed externally)
  dispose?(): void                                  // optional explicit teardown
  onRowClick?(item: unknown): void                  // legacy compat with native tabs
  surfaces?: ['studio']                             // declarative — purely documentary in V1
}
```

`render(container, ctx)` is called once when the tab becomes the active view. If it returns a function, that function is invoked as the cleanup when the user switches away from the tab or when the Dock unmounts. `refresh(ctx)` is optional and is called when shared state for the tab's entity has changed cross-tab; if a tab does not provide `refresh`, the host will dispose-and-re-render.

### `TabCtx`

```text
{
  surface: 'studio',
  chatId: string | null,                            // Studio-local id (ChatRecord.id)
  externalId: string | null,                        // canonical native chatId, if any
  snapshotId: string | null,                        // current snapshot in the reader, if any
  getAssistantTurns(): HTMLElement[],               // Studio replay DOM helper
  scrollToTurn(turnId: string): void,
  now(): number,                                    // monotonic clock (Phase 4 helper; Date.now() before)
  flags: Readonly<Record<string, boolean>>,         // e.g. flags.dockWriteBack.<feature>
}
```

`getAssistantTurns()` queries `studio.html`'s own DOM via the central selectors contract (`src-surfaces-base/studio/platform/selectors.contract.js`). Tabs must not use literal CSS strings; they go through the helper.

`externalId` is the join key for cross-surface data. A tab that needs to read shared per-chat feature state uses `externalId`. If `externalId === null`, the chat is Studio-only and feature state is local-only.

## Lifecycle

1. **Boot**: `dock-shell.studio.js` defines the namespace early in the studio.html script order — before any tab file. Tab files are loaded later and call `H2O.Studio.dock.registerTab(id, def)` at script eval time.
2. **Mount**: `studio.js` (route handler for `#/read/<snapshotId>`) calls `mount(container)` once the reader DOM is ready.
3. **Open / view change**: `open()` and `setView(id)` are user actions, persisted via `H2O.Studio.store.prefs` (Studio-local UI state — does not sync to native).
4. **Render**: when `setView(id)` selects a tab, the host calls `tab.render(container, ctx)`. Any cleanup returned by a previous `render` is invoked first.
5. **Refresh**: on cross-tab change events (e.g., `chrome.storage.onChanged` fired by another tab editing the same key), the host calls `tab.refresh(ctx)` if present; otherwise it disposes and re-renders.
6. **Unmount / route change**: leaving `#/read/...` calls `unmount()`; the active tab's cleanup is invoked.

## What this contract is **not**

- It is not a shared cross-surface contract. Native runtime is untouched.
- It is not a Plugin SDK. There is no allowlist, no versioning, no permissions — Studio Dock tabs are first-party code.
- It is not a UI framework. Tabs receive a container element and render however they like (vanilla DOM is fine; the existing Studio code is vanilla DOM).
- It does not define data ownership. See `src-surfaces-base/studio/STUDIO_DOCK_PANEL_CONTRACT.md` for ownership and conflict rules.

## Open questions (deferred)

- Whether `refresh(ctx)` should pass a diff (changed keys / item ids) instead of being a notify-only signal. Decision deferred until Phase 2 has 2+ tabs implemented.
- Whether tabs should be able to expose Command Bar entries (e.g., "Clear all highlights"). Tentative direction: **no** for V1 — system commands live in the Command Bar separately; per-tab data actions live inside the tab UI.
- Native unification (a shared contract) is intentionally out of scope until at least Phase 6.
