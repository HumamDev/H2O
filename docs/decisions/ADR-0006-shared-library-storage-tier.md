# ADR-0006: Shared Library Storage Tier

Status: Accepted

Date: 2026-05-15

Related: [Library Migration Plan](../architecture/library-migration-plan.md), [ADR-0004 Library Index Source Model](ADR-0004-library-index-source-model.md), [ADR-0005 Linked vs Saved Library Records](ADR-0005-linked-vs-saved-library-records.md), [Library Record Shapes](../systems/library/record-shapes.md), [Library Contract](../systems/library/contract.md)

## Context

Today the canonical truth for every Library feature — Chat Registry, folder catalog + bindings, category catalog + candidate-pool + overrides, label catalog + bindings, tag auto-pool + occurrence index, project name cache, Library Index registry, scan ledger, snapshot metadata — lives in `window.localStorage` on the **chatgpt.com origin** (see the 34-key storage map in the migration plan). Studio (chrome-extension origin) cannot read these keys directly. The cross-surface bridge (`0F1h` / `S0F1h`) currently works around this by broadcasting projected snapshots through `chrome.storage.local`, which is functional but imposes:

- A one-way ceiling on payload size (each broadcast must fit in a single `chrome.storage.local` value, capped by the per-item and total quotas).
- Eventual-consistency latency between surfaces (write → broadcast → consume).
- Two diverging Chat Registry shapes (`0F1g` and `S0F1g`), because Studio reconstructs records from the broadcast payload instead of reading the source.

Phase 1 of the migration introduces a single shared business-logic layer (`shared/library/`). Pure logic alone is not enough — the surfaces also need to **agree on where the data physically lives**. Three candidate backends are available:

| Option | Backend | Owner | Origin | Capacity | Async? | Cross-surface? |
|---|---|---|---|---|---|---|
| A | `chrome.storage.local` | extension | extension | ~10 MB total, per-item limits | yes | yes (native via bridge, Studio direct) |
| B | IndexedDB owned by **background service worker** | extension | extension | tens-of-MB+ practical, hundreds-of-MB possible | yes | yes (both surfaces talk to SW) |
| C | Status quo (chatgpt.com `localStorage` + projected snapshots) | native | chatgpt.com | ~5 MB per origin | sync (native) / async (Studio) | partial — Studio reads only projection |

The migration's Phase 3+ moves the **canonical** copy of folder catalogs, category candidate pools, tag occurrence indexes, and scan ledgers into shared logic. Those datasets are **already** the largest ones in the system today, and they will grow with every chat the user adds. Whatever tier Phase 3+ adopts becomes the load-bearing store for years, so the choice has to be made before any module is rewritten.

The transport layer (`chrome.storage.local` broadcast envelope used by `0F1h` / `S0F1h`) is orthogonal to this decision and stays as-is.

## Decision

**Option B — background-service-worker-owned IndexedDB — is the canonical Library database** for all migrated shared modules.

The shared `LibrarySurfaceServices.storage` adapter routes reads and writes for migrated data through an RPC channel to the extension's background service worker, which owns the single `h2o.library.shared` IndexedDB database. Both surfaces (chatgpt.com page-world and Studio) ask the SW for data; neither stores canonical state on its own origin once a feature has been migrated.

**`chrome.storage.local` is retained for two specific uses only:**

1. **Cross-surface broadcast envelope** — the existing `h2o:library:cross-surface:broadcast:v1` and `…:broadcast:native:v1` keys used by `0F1h` / `S0F1h`. This is a transport, not a store.
2. **Tiny, hot-path, sync-friendly UI state** that is per-surface and does not need cross-origin write — folder UI prefs (`fldrs:state:ui:v1`), sidebar layout, sidebar section collapse state, page route hints. These keys are well under 1 KB each and are read on every UI render. Putting them through SW-IDB would add a round-trip to every layout pass with no benefit.

**`window.localStorage` on the chatgpt.com origin is preserved read-only for legacy data** until Phase 9. The shared layer's storage adapter has a one-shot migration step on cold start: if the new SW-IDB store is empty for a given key family and the legacy localStorage key exists, copy the legacy data into IDB, then mark the migration complete. Legacy data is **never deleted until Phase 9** — rollback always remains possible.

### Why not Option A (chrome.storage.local for everything)

- **Quota.** `chrome.storage.local` advertises ~10 MB, but the practical ceiling per item is ~5 MB and the realistic working ceiling for many small items is well below that once the API overhead is counted. Today's tag occurrence index alone can already exceed 1 MB after a few hundred chats. Folder catalogs with many bindings, scan ledgers across thousands of rows, and the Library Index registry itself would all reach the quota within a normal user's first year.
- **No structured queries.** Every read returns the full value. Filtering, range queries, and indexed lookups all happen in memory after a full deserialize. IndexedDB gives us indexed reads.
- **Whole-value writes.** Updating one chat record in a 5000-record registry rewrites the entire value. SW-IDB writes a single object store row.
- **Change notification cost.** Every `chrome.storage` write notifies every listener with the whole object, which would mean every catalog mutation re-pushes the entire catalog through the bridge.

Option A remains a fine fit for **the two narrow cases** carved out above.

### Why not Option C (status quo)

- Native owns the source of truth, Studio reconstructs from broadcast → the two surfaces inevitably drift (and have already drifted: Studio's `S0F1g` Chat Registry uses a different record shape than native's `0F1g`).
- Studio cannot write canonical data back. Any write-from-Studio feature (folder reorder, label rename, candidate-pool review) requires routing through native, which is fragile and only works when chatgpt.com has a live tab.
- Imported / local snapshots created in Studio have no native home; they live only in the Studio mirror until the user opens chatgpt.com.

Option C is preserved as the **fallback** during phased rollout — if a phase's flag is off, the affected feature continues to use status-quo storage. Status quo is not the destination.

### Why background-service-worker-owned (not page-owned) IDB

- The background SW is the only execution context that both surfaces can reach reliably.
- A chatgpt.com-page-owned IDB would not help — Studio cannot read it.
- A Studio-page-owned IDB exists today (`h2o.library.studio`), but native cannot read it. It becomes a per-surface caching tier under Option B, not the canonical store.
- The SW survives chatgpt.com tab close, Studio close, and most extension reloads. Its lifecycle is paused-not-killed under MV3, and IDB persists across pauses.

## Consequences

### Architectural

- A new `services/library-store/` SW-side module owns the `h2o.library.shared` IDB connection, schema versioning, and the RPC surface. Native and Studio both call it through `LibrarySurfaceServices.storage`.
- The shared layer (`shared/library/`) becomes the only module that constructs IDB transactions. Surfaces never open IDB directly.
- All migrated reads become async. Today's sync `getRecord(chatId)` in native must become async or be served from a per-surface in-memory cache backed by the SW (cache invalidated by bridge broadcast).
- Cross-surface sync becomes a **cache-invalidation event** rather than a state-projection event. The bridge says "the SW updated key X, please re-read" instead of carrying the new payload.
- Studio's parallel index (`S0F1c`'s `:studio:registry:v1`) and Studio's parallel registry (`S0F1g`'s `:studio:v1`) become per-surface caches in front of the canonical SW-IDB store. They do not own data.

### Migration implications

- **Phase-by-phase opt-in.** Each shared module migrates one storage family at a time, behind its own flag. Folders first (Phase 3), then categories, labels, tags, projects.
- **One-shot legacy import on cold start.** The first boot after a phase ships reads the legacy localStorage key, writes the canonical copy to SW-IDB, sets a migration sentinel, and keeps the legacy key intact. Subsequent boots read straight from SW-IDB.
- **Legacy keys remain readable** until Phase 9. The migration is purely additive until then.
- **Studio's existing `h2o.library.studio` IDB** is retained as a per-surface cache and read fallback. It is migrated into SW-IDB on first boot the same way the localStorage keys are.
- **No record-shape changes** are forced by storage migration. The record-shapes spec defines the canonical shape; storage moves are layout-only.

### Rollback

- Every phase ships with a `H2O.flags.libraryMigration.phase<N>.enabled` flag, default `false` in prod, `true` in dev.
- Flag off → the affected module continues to call the legacy storage path through the same adapter; SW-IDB is bypassed.
- Legacy data is **never deleted** until Phase 9. If we have to roll back the SW-IDB tier entirely, every surface still has its pre-migration data sitting in its origin's localStorage / IDB.
- A `H2O.LibraryMaintenance.exportSharedStore()` operation lets us snapshot the SW-IDB to a downloadable JSON for ad-hoc recovery. (Diagnostic surface, not a regular path.)

### Risks

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| SW MV3 cold-start cost on first read after long idle | medium | low | Pre-warm via existing `H2O.LibrarySync` ready handshake; cache last result per-surface |
| IDB schema migration breaks a release | medium | medium | Versioned schemas; each version has an upgrade test; one-shot migration is idempotent |
| Every read becomes async, breaks sync callers in native | high (load-bearing) | medium | Per-surface in-memory cache (already exists for index reads); convert hot callers; document the contract |
| `chrome.storage.local` quota exceeded if we lean on Option A by mistake | medium | medium | Storage adapter rejects writes >32 KB to the broadcast tier; routes large payloads through SW-IDB |
| One-shot legacy migration loses data | low | high | Sentinel + checksum; migration runs through `H2O.LibraryMaintenance.runMigration()` which is restartable |
| Studio open while native writes (or vice versa) → stale per-surface cache | high | low | Existing 0F1h bridge already broadcasts on every write; SW-IDB version stamp included in broadcast envelope, cache invalidated on mismatch |
| Background SW disabled (rare, user-driven) | low | high | Surfaces detect missing SW via timeout; fall back to status-quo storage for that session; surface a diagnostic warning |
| IDB corruption on a single user's machine | low | high | `verifyHealth()` includes IDB roundtrip; `LibraryMaintenance.repairIndex()` rebuilds from legacy localStorage when present |
| Concurrent writers from two open chatgpt.com tabs | medium | medium | SW serializes writes per-key family; transactions wrap each shared mutation |

## Validation

- `H2O.LibrarySurfaceServices.storage.backend` reports `'sw-idb'` after Phase 3 lands and the flag is on, `'localStorage'` when the flag is off.
- `H2O.LibrarySurfaceServices.storage.diagnose()` returns the IDB schema version, last migration timestamp per key family, and per-call latency p95.
- `H2O.LibraryMaintenance.runMigration({ family: 'folders' })` is idempotent — running it twice produces identical SW-IDB state and a `{ scanned, migrated, alreadyMigrated }` report.
- A roundtrip test (`storage.set(k,v) → storage.get(k)`) succeeds from both surfaces and returns the same `v`.
- Bridge broadcast latency between surfaces remains under 350 ms p95 (today's measured ceiling) after the cache-invalidation envelope replaces the state-projection envelope.
- `H2O.LibraryCore.selfCheck()` includes a new `storage-tier` section reporting backend, schema version, and last-migration timestamps.

## Out of scope (deferred)

- Cross-device sync (would require a server). Out of scope until/unless H2O ships an account layer.
- Encryption at rest beyond what the browser already does for IDB.
- Multi-account scoping of records (one user with multiple ChatGPT identities). Deferred to ADR-0007 if/when it lands.
- Replacing the broadcast envelope with `postMessage`-only or `BroadcastChannel`. The current `chrome.storage.local` envelope is reliable; switching is a separate decision.
- Replacing Studio's local IDB cache. It stays as a read-through cache.
