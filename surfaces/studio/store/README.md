# Studio Store

Status: Active (Stage 1 — parallel infra)
Owns: `H2O.Studio.store` namespace and entity stores.
Contracts: `surfaces/studio/STUDIO_STORAGE_CONTRACT.md`, `surfaces/studio/STUDIO_PORTABILITY_CONTRACT.md`.

## What This Folder Is

The domain entity layer for Studio's persistent data. Feature code (S3H1a, future Highlights migrations, Library Workspace, etc.) reads and writes through `H2O.Studio.store.<entity>.*` — never directly through `chrome.storage`, `localStorage`, `indexedDB`, or `GM_*`.

```
Feature code  →  H2O.Studio.store.<entity>  →  platform.broadcast / chrome.storage / …
```

Today the store sits on top of `chrome.storage.local` (for cross-tab sync) and `localStorage` (as a mirror). Tomorrow it sits on top of `tauri-plugin-sql` / SQLite. **Feature code is unchanged across that swap.**

## `store/` vs `platform/`

| Layer | Lives in | Responsibility | Examples |
|---|---|---|---|
| Platform adapter | `surfaces/studio/platform/` | Platform/host abstraction. MV3 ↔ Tauri swap point. Speaks `chrome.*` / Tauri APIs. | `platform.messaging.send`, `platform.broadcast.emit`, `platform.broadcast.onAnyChange`, `platform.storage.{get,set}` |
| Store (this folder) | `surfaces/studio/store/` | Domain entity layer. Speaks the language of chats / highlights / folders / etc. Calls into `platform.*`. | `store.highlights.setForAnswer`, future `store.chats.upsert` |

When you build a new feature that needs persistence:

- If the persistence shape is **entity-like** (per-chat, per-turn, per-record), add a `store/<entity>.js` file with `init / getX / setX / subscribe / diagnose`.
- If you only need ephemeral key-value (UI prefs, layout state), use `platform.storage.{get,set}` for now. A future `store/prefs.js` may host generic KV.

## Files Here

| File | Role |
|---|---|
| `index.js` | Creates `H2O.Studio.store`; `__registerEntity` helper; aggregate `diagnose()`. Idempotent. |
| `highlights.js` | `H2O.Studio.store.highlights` — entity store for inline-highlight marks. **Stage 1: parallel infra only.** |
| `README.md` | This file. |

## Forbidden Patterns

In any Studio feature code (anything under `surfaces/studio/` outside `store/` and `platform/`):

- `chrome.storage.local`, `chrome.storage.sync`, `chrome.storage.session`
- `localStorage`, `sessionStorage`
- `indexedDB`, `idb-keyval`, `idb`
- `GM_getValue`, `GM_setValue`, `GM_deleteValue` (Tampermonkey legacy)
- Any persistence `fetch('/api/...')` that bypasses the store

Reads and writes go through `H2O.Studio.store.<entity>.*`. The adapter is the only place those primitives are touched.

See `STUDIO_PORTABILITY_CONTRACT.md` Rule 3 for the full rule.

## `H2O.Studio.store.highlights` (Stage 1 Status)

**Parallel infra. NOT yet wired into S3H1a's runtime path.**

The entity is installed and diagnosable, but the live Highlights workflow continues to flow through `S3H1a`'s own `UTIL_storage` IIFE. Stages 2–5 will migrate S3H1a to use this store. Until then, calling `H2O.Studio.store.highlights.setForAnswer(...)` from external code DOES write to the canonical key (and the change will be picked up by S3H1a's cross-tab listener), but no in-Studio code path does so — it's safe to inspect via `diagnose()` without side effects.

### Public API

```js
H2O.Studio.store.highlights = {
  // Lifecycle
  init(),                              // → Promise<blob>; hydrate cache from canonical key
  dispose(),                           // teardown listeners
  isReady(): boolean,

  // Per-answer entity access
  getForAnswer(answerId): Item[],      // sync read from cache
  setForAnswer(answerId, items),       // mutate + debounced persist; [] to clear
  removeForAnswer(answerId),

  // Full-blob access (for migrations / diagnostics / export)
  getAll(): { itemsByAnswer, convoId?, _meta? },
  update(updaterOrObj),                // mutate + debounced persist

  // Persistence control
  saveNow(): Promise<void>,
  reload(): Promise<blob>,

  // Global highlight meta
  getCurrentColor(): string,           // _meta.currentColor
  setCurrentColor(name),

  // Notification
  subscribe(fn): unsubscribe,          // fired on local writes AND cross-tab changes

  // Diagnostics
  diagnose(): { backend, transport, canonicalKey, legacyKeys, cacheAnswers,
                cacheItems, pendingSave, lastSavedAt, …, stage: 1 },
};
```

### Wire Format

```
key  : 'h2o:prm:cgx:nlnhghlghtr:state:inline_highlights:v3'
shape: { itemsByAnswer: { [answerId]: Item[] }, convoId?: string, _meta?: { currentColor?: string } }
debounce: 250ms
backing: chrome.storage.local (primary) + localStorage (mirror)
cross-tab: H2O.Studio.platform.broadcast.onAnyChange (fallback: chrome.storage.onChanged direct)
```

The wire format is **identical to S3H1a's UTIL_storage**. Both can coexist on the same key safely — chrome.storage.local provides cross-tab/cross-context merging, and each side's mergeBlob is non-destructive (last-write-wins per item `ts`).

## Future: Tauri / SQLite

When the platform adapter is swapped to a Tauri implementation, only `surfaces/studio/store/<entity>.js` implementations change — feature code does not. The conceptual SQLite mapping for highlights (one row per answer):

```sql
CREATE TABLE highlights (
  answer_id  TEXT PRIMARY KEY,
  chat_id    TEXT,
  marks_json TEXT NOT NULL,
  meta_json  TEXT,
  updated_at INTEGER NOT NULL
);
```

`store.highlights.setForAnswer(id, items)` becomes one row write; `getForAnswer(id)` becomes a single SELECT. Wire shape changes; the entity API does not.

See `STUDIO_STORAGE_CONTRACT.md` §6 "Mapping: Current Storage → StudioStore → Future SQLite" for the full table across entities.

## Migration Status (Highlights)

| Stage | What | Status |
|---|---|---|
| 1 | Add `H2O.Studio.store.highlights` as parallel infra | **complete in this commit** |
| 2 | Migrate Highlights READ path: `S3H1a STORE_read()` → store | not started |
| 3 | Migrate Highlights WRITE path: `S3H1a STORE_write()` → store | not started |
| 4 | Move legacy-key bootstrap into the store; centralize `KEY_MIG_DISK_V1` | not started |
| 5 | Remove obsolete `UTIL_storage` in S3H1a after baking | not started |

The migration is staged so each step can be runtime-validated independently before the next begins. See the plan attached to the Stage 1 commit for the full risk register and per-stage tests.
