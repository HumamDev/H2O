# Studio Store

Status: Active (Highlights cleanup complete on both surfaces — store is the only Studio-side persistence path; native `scripts/3H1a` is also free of legacy storage)
Owns: `H2O.Studio.store` namespace and entity stores.
Contracts: `surfaces/studio/STUDIO_STORAGE_CONTRACT.md`, `surfaces/studio/STUDIO_PORTABILITY_CONTRACT.md`.

## What This Folder Is

The domain entity layer for Studio's persistent data. Feature code (S3H1a, future Highlights migrations, Library Workspace, etc.) reads and writes through `H2O.Studio.store.<entity>.*` — never directly through `chrome.storage`, `localStorage`, `indexedDB`, or `GM_*`.

```
Feature code  →  H2O.Studio.store.<entity>  →  platform.broadcast / chrome.storage / …
```

Today the store sits on top of `chrome.storage.local` as the **single active backend** (cross-tab sync via `chrome.storage.onChanged`, surfaced through `H2O.Studio.platform.broadcast.onAnyChange`). Tomorrow it sits on top of `tauri-plugin-sql` / SQLite. **Feature code is unchanged across that swap.**

The Studio side has no localStorage mirror, no GM_* fallback, no legacy-key bootstrap, and no hidden fallback storage. Backup/restore is intentionally a separate, explicit concern (JSON export / import action) — not silent multi-mirror writes.

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

## `H2O.Studio.store.highlights` (Cleanup Complete — Studio + Native)

**The store is the only Studio-side persistence path for Highlights.** S3H1a's `STORE_read` / `STORE_write` / `STORE_saveNow` are thin one-line aliases over `H2O.Studio.store.highlights.{getAll, update, saveNow}`. There is no fallback to `UTIL_storage` — `UTIL_storage` has been deleted from S3H1a. There is no legacy-key bootstrap, no migration flag, no GM_* path, and no localStorage mirror inside S3H1a's highlight code. UI prefs (`KEY_CFG_UI_V1`, `CFG_loadUiConfig`, `CFG_saveUiConfig`) remain in S3H1a as a separate, unchanged concern.

The native (chatgpt.com) `scripts/3H1a` script has also been cleaned up (Phase B1, runtime-validated): its old `UTIL_storage` IIFE, GM_* paths, legacy v1/v2/alias keys, and localStorage mirror were replaced with a slim `STORE` module that reads and writes only the canonical v3 key through `chrome.storage.local`. Studio and native interoperate through the **shared canonical chrome.storage.local key** — wire format unchanged, both surfaces see each other's writes via `chrome.storage.onChanged` events.

### Active path (Studio side)

```
S3H1a feature code  →  STORE_read / STORE_write / STORE_saveNow
                    →  H2O.Studio.store.highlights.{getAll, update, saveNow}
                    →  chrome.storage.local  ← shared key with native 3H1a
                    ↕  chrome.storage.onChanged  ← cross-context sync
```

### What is preserved

- **Canonical v3 key:** `h2o:prm:cgx:nlnhghlghtr:state:inline_highlights:v3` — unchanged. All existing user highlight data continues to load and persist.
- **Wire format:** `{ itemsByAnswer, convoId?, _meta? }` — shared with native 3H1a (both surfaces now read and write the same shape under the canonical v3 key).
- **Cross-context interop:** Studio and native still share the canonical key; both see each other's writes via `chrome.storage.onChanged`.
- **UI prefs:** `KEY_CFG_UI_V1` and its `localStorage` get/set in `CFG_loadUiConfig` / `CFG_saveUiConfig` are separate, untouched.

### What was removed (Studio side)

| Removed from Studio | Reason |
|---|---|
| `UTIL_storage` IIFE in S3H1a | Replaced by `H2O.Studio.store.highlights` |
| GM_getValue / GM_setValue / GM_deleteValue paths | Runtime is the MV3 extension page, not Tampermonkey |
| `localStorage` mirror for highlight data | Single backend = chrome.storage.local; no silent multi-mirror writes |
| `LEGACY_DISK_KEYS` (v1, v2, alias keys, `ho:inlineHighlights*`) | Legacy data preservation explicitly out of scope per architecture decision |
| `KEY_MIG_DISK_V1` migration flag | No legacy import = no migration flag needed |
| `MIG_disk_legacy_to_canon_once` one-shot bootstrap | Same |
| Stage 3 fallback helpers (`_storeApi`, `_storeReady`, `_noteFallback`, `__recordFallbackWrite`) | Store is reliable per runtime validation; no fallback needed |
| `diagnose()` migration-era markers | Cleanup is complete; markers no longer informational |

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

  // Full-blob access (for migrations / diagnostics / export).
  // NOTE: returns the LIVE in-memory cache reference (not a clone) for
  // byte-parity with the legacy UTIL_storage.readSync() contract in S3H1a.
  // Feature code MUST NOT mutate the returned object directly — use
  // setForAnswer / removeForAnswer / update / setCurrentColor instead.
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

  // Diagnostics — clean shape after Studio cleanup
  diagnose(): {
    installed, ready, schemaVersion,
    backend: 'chrome.storage' | 'none',
    canonicalKey,
    crossTabBound,
    cacheAnswers, cacheItems,
    pendingSave, saveDebounceMs,
    lastSavedAt, lastFlushAt, lastReloadedAt, lastWriteAt,
    writesSinceBoot, savesSinceBoot,
    subscribers,
    errors, warnings,
  },
};
```

### Wire Format

```
key  : 'h2o:prm:cgx:nlnhghlghtr:state:inline_highlights:v3'
shape: { itemsByAnswer: { [answerId]: Item[] }, convoId?: string, _meta?: { currentColor?: string } }
schemaVersion: 3
debounce: 250ms
backing: chrome.storage.local (single backend; no localStorage mirror)
cross-tab: H2O.Studio.platform.broadcast.onAnyChange (fallback: chrome.storage.onChanged direct)
```

The wire format is **shared with native `scripts/3H1a`** so the two surfaces stay in sync at the chrome.storage.local layer. As of Phase B1 (runtime-validated), native 3H1a has also been stripped of its legacy storage internals (UTIL_storage IIFE, GM_*, localStorage mirror, legacy v1/v2/alias keys) and now reads and writes only the canonical v3 key. Both surfaces converge on a single backend (`chrome.storage.local`) with a single canonical key — no parallel paths.

Per-item conflicts are resolved by `mergeBlob`'s last-write-wins semantics on item `ts`. Cross-context writes (Studio replay highlight ↔ native chatgpt.com highlight) merge correctly because both sides use the same merge function on the same wire shape.

## Migration Status (Highlights)

| Phase | What | Status |
|---|---|---|
| Stage 1 | Add `H2O.Studio.store.highlights` as parallel infra | complete + runtime-validated |
| Stage 2 | Migrate Highlights READ path: `S3H1a STORE_read()` → store | complete + runtime-validated |
| Stage 3 | Migrate Highlights WRITE path: `S3H1a STORE_write()` + `STORE_saveNow()` → store | complete + runtime-validated |
| **A1** | Simplify store internals (drop legacy fields/fallback/mirror; clean diagnose) | complete + runtime-validated |
| **A2** | Remove `UTIL_storage` IIFE + legacy bootstrap + GM_* from S3H1a; wrappers become thin aliases | complete + runtime-validated |
| **A3** | This doc refresh | complete in this commit |
| B1 | Native `scripts/3H1a` parallel cleanup (drop UTIL_storage IIFE, GM_*, legacy keys; share canonical key) | complete + runtime-validated |

**The original Stage 4 (legacy-key bootstrap migration into the store) was deliberately replaced by Phase A1/A2's clean-architecture path.** Legacy v1/v2/alias data is no longer imported anywhere; only the current canonical v3 key is read/written. Users on legacy data who have not already been bootstrapped to v3 by a prior runtime will see an empty highlight state — that trade-off was made consciously in favor of clean architecture.

**Backup/export** is now an explicit, intentional concern (JSON export/import) rather than a side effect of having multiple fallback mirrors. If introduced, it lives as a Studio UI affordance — not as automatic dual-write to localStorage / GM_* / alias keys.

## Future: Tauri / SQLite

When the platform adapter is swapped to a Tauri implementation, only `surfaces/studio/store/<entity>.js` implementations change — feature code does not. For highlights, the future path is:

```
S3H1a feature code  →  STORE_read / STORE_write / STORE_saveNow  (unchanged)
                    →  H2O.Studio.store.highlights               (same API)
                    →  tauri-plugin-sql                          (SQLite-backed)
```

Conceptual SQLite schema (one row per answer):

```sql
CREATE TABLE highlights (
  answer_id  TEXT PRIMARY KEY,
  chat_id    TEXT,
  marks_json TEXT NOT NULL,
  meta_json  TEXT,
  updated_at INTEGER NOT NULL
);
```

`store.highlights.setForAnswer(id, items)` becomes one row write; `getForAnswer(id)` becomes a single SELECT. Wire shape changes; the entity API does not. The one-time import of any remaining chrome.storage.local canonical-key blob into SQLite is a Tauri-port-time task.

See `STUDIO_STORAGE_CONTRACT.md` §6 "Mapping: Current Storage → StudioStore → Future SQLite" for the full table across entities.
