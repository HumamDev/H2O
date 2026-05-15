# Library Record Shapes

Status: Active (canonical reference for Phase 1 → Phase 9 of the migration)

Date: 2026-05-15

Related: [Library Migration Plan](../../architecture/library-migration-plan.md), [ADR-0005 Linked vs Saved Library Records](../../decisions/ADR-0005-linked-vs-saved-library-records.md), [ADR-0006 Shared Library Storage Tier](../../decisions/ADR-0006-shared-library-storage-tier.md), [Library Contract](contract.md)

## Purpose

This document is the **single source of truth for record shapes** used across the Library system. It enumerates every shape, the source-of-truth field per record, the invariants that must hold at every merge, and the dedupe rules that prevent forked records. It is normative for Phase 1 (already shipped), Phase 2 (shared registry + index logic, ends current Studio shape drift), and every later phase.

Any new field added to a Library record must be reflected here. Any field removed must be marked deprecated here with a removal phase.

## Conventions

- **`""` (empty string), `0`, `false`, `[]`, `{}`** are the explicit defaults — `undefined` is forbidden in canonical records. Normalization fills missing fields with the explicit default.
- **Timestamps** are ISO-8601 strings (`2026-05-15T13:45:21.000Z`) unless suffixed `*Ms` (epoch milliseconds for hot-path scan ledgers).
- **`view`** is a frozen enum: `'saved' | 'linked' | 'recents' | 'imported'`. The Saved tab filters on `view === 'saved'`; linked-only records carry `view === 'linked'` so they never leak in.
- **`provenance`** is an array of source markers, append-only on every merge unless already present.
- **Sticky-on-true merge:** any boolean state flag that becomes `true` cannot be unset by a subsequent merge with a missing or `false` value. Explicit `false` in an incoming patch is required to unset (and should be used only by repair tooling).

## 1. Chat Registry record (`0F1g` — canonical Phase 1 shape)

The most load-bearing shape in the system. One record per chatId (or per snapshotId when chatId is absent / imported-only). Source of truth for "does the user care about this chat."

```text
ChatRegistryRecord = {
  chatId:          string,                  // parsed from native chat URL; "" for imported-only
  href:            string,                  // last-known native URL ("" for imported-only)
  normalizedHref:  string,                  // canonical href used as a secondary key
  title:           string,                  // display title; "" when unknown
  titleSource:     'native' | 'archive' | 'user' | '',
  createdAt:       string,                  // ISO; first-seen time
  updatedAt:       string,                  // ISO; touched on every merge
  state: {
    isLinked:      boolean,                 // Phase 1 — explicit "in the Library"
    isSaved:       boolean,                 // a snapshot exists in 0D3a archive
    isArchived:    boolean,                 // user-requested archive (Library archive, not snapshot archive)
    isHidden:      boolean,                 // user-requested hide
  },
  linkedAt:        string,                  // ISO; first true transition of isLinked. Never overwritten.
  linkedFrom:      string,                  // 'add-to-library' | 'save-to-folder' | 'backfill:saved' | 'manual-api' | …
  linkSourceHref:  string,                  // exact href captured at link time
  folderId:        string,                  // primary folder binding ("" if none)
  categoryId:      string,                  // primary category id ("" if none)
  labelIds:        string[],                // ordered, deduped label IDs
  tagIds:          string[],                // ordered, deduped tag IDs (top-level — turn-level tags live elsewhere)
  projectId:       string,                  // native project id ("" if not in a native project)
  snapshotIds:     string[],                // 0D3a snapshot ids in chronological order (oldest first)
  latestSnapshotId:string,                  // convenience pointer to snapshotIds[snapshotIds.length-1]
  view:            'saved' | 'linked' | 'recents' | 'imported',
  provenance:      string[],                // ['native:recents', 'archive', 'studio:import', …]
  source:          'native' | 'studio' | 'imported',
  schemaVersion:   1,                       // bumps only on a real shape change
}
```

### Invariants (enforced in shared merge — every surface)

```
1.  chatId !== "" AND state.isSaved === true   ⟹   state.isLinked === true
2.  state.isLinked === true                    ⟹   linkedAt !== ""
3.  state.isLinked === false                   ⟹   linkedAt === "" AND linkedFrom === "" AND linkSourceHref === ""
4.  state.isSaved === true                     ⟹   latestSnapshotId !== "" (post-Phase-2; for Phase 1 records this is best-effort)
5.  view === 'saved'                           ⟺   state.isSaved === true AND chatId !== ""  OR  source === 'imported'
6.  view === 'linked'                          ⟺   state.isLinked === true AND state.isSaved === false AND chatId !== ""
7.  view === 'imported'                        ⟺   source === 'imported' AND state.isSaved === true
8.  view === 'recents'                         ⟺   state.isLinked === false AND state.isSaved === false (provenance sighting only)
9.  Sticky-on-true: every flag in state.* and isLinked once true stays true unless an incoming patch carries an explicit false.
10. linkedAt is first-write-wins. Once set, never overwritten.
```

### Merge conflict rules

| Field | Conflict rule |
|---|---|
| `chatId` | First non-empty wins. Empty stays empty until a non-empty patch arrives. |
| `href` / `normalizedHref` | Incoming patch wins when non-empty; else existing. |
| `title` | Rank by `titleSource`: `user > archive > native`. Higher rank wins. Equal rank → most recent. |
| `titleSource` | Updated alongside `title`. |
| `createdAt` | Existing wins (first-write). |
| `updatedAt` | Set to merge time on every merge. |
| `state.*` | Sticky-on-true. Incoming `true` always wins. Incoming `false` only wins when explicitly carried. |
| `linkedAt` | Existing wins (first-write). |
| `linkedFrom` | Incoming patch wins; else existing; else `'backfill:saved'` if `isLinked` becomes true via implication rule 1. |
| `linkSourceHref` | Incoming patch wins; else existing; else record `href`. |
| `folderId` | Incoming patch wins when non-empty; else existing. |
| `categoryId` | Same as `folderId`. |
| `labelIds` / `tagIds` | Set union. Order preserved by first-seen. |
| `projectId` | Incoming patch wins when non-empty; else existing. |
| `snapshotIds` | Append-only union, sorted by archive timestamp. |
| `latestSnapshotId` | Recomputed from `snapshotIds[snapshotIds.length-1]`. |
| `view` | Derived — never written by callers; computed from `state`, `chatId`, and `source` on every merge. |
| `provenance` | Set union; order preserved by first-seen. |
| `source` | Existing wins unless incoming is more authoritative (`native > studio > imported` when the same chatId; `imported` only when chatId is empty). |

### Dedupe keys

- **Primary:** `chatId` when non-empty.
- **Secondary:** `normalizedHref` when chatId is empty but normalizedHref matches an existing record (covers in-flight native URL captures where chatId hasn't been parsed yet).
- **Tertiary:** `latestSnapshotId` when both chatId and normalizedHref are empty (covers imported-only records).
- Two records with the same primary key are merged via the rules above. Two records that match only on the tertiary key are merged only when one is `source === 'imported'`.

### Native vs Studio field ownership matrix

| Field | Written by native (`0F1g`) | Written by Studio (`S0F1g`) | Notes |
|---|:--:|:--:|---|
| `chatId` | ✓ | ✓ | Studio only when chatId is parsable from a stored href |
| `href` / `normalizedHref` | ✓ | ✓ | Native is authoritative when both write |
| `title` | ✓ | ✓ | Rank decides — see rules |
| `titleSource` | ✓ | ✓ | |
| `state.isLinked` | ✓ (via `addToLibrary`) | ✓ (read; future write via cross-surface RPC) | Phase 7 RPC |
| `state.isSaved` | ✓ (via `saveToFolder`) | ✗ (Studio cannot capture transcripts) | Native-only |
| `state.isArchived` / `isHidden` | ✓ | ✓ | UI-driven on either surface |
| `linkedAt` / `linkedFrom` / `linkSourceHref` | ✓ | ✓ (only on initial transition seen on its side) | First-write wins |
| `folderId` | ✓ | partial | Until Phase 3 lands shared folder writes |
| `categoryId` | ✓ | ✗ | Until Phase 4 |
| `labelIds` | ✓ | ✗ | Until Phase 5 |
| `tagIds` | ✓ | ✗ | Until Phase 5 |
| `projectId` | ✓ | ✗ | Until Phase 6 |
| `snapshotIds` / `latestSnapshotId` | ✓ (archive engine) | ✗ | Native-only (transcript capture) |
| `view` | derived | derived | Computed, never written |
| `provenance` | append | append | |
| `source` | `'native'` | `'studio'` or `'imported'` | |
| `schemaVersion` | 1 | 1 | |

## 2. Linked-only record (projection)

A subset of the Chat Registry record used by the cross-surface broadcast snapshot. Studio currently reads this from `payload.linkedRecords` in `h2o:library:cross-surface:broadcast:native:v1` (see `0F1h` `snapshotLinkedRecords()` and `S0F1c` `normalizeLinkedOnlyRegistryRow()`).

```text
LinkedOnlyProjection = {
  chatId, href, normalizedHref, title, titleSource,
  state: { isLinked: true, isSaved: false },
  linkedAt, linkedFrom, linkSourceHref,
  view: 'linked',
  source: 'native',
  schemaVersion: 1,
}
```

- Carries no folder/category/label/tag/project/snapshot fields — those are reserved for the canonical record once it lands on the receiving surface.
- Capped at `LINKED_SNAPSHOT_MAX = 500` in `0F1h`.
- Receiving surface merges this into its own Chat Registry using the same rules as section 1 (it's strictly a partial Chat Registry record).

## 3. Saved transcript record (continued)

A Chat Registry record with `state.isSaved === true`. The transcript itself lives in `0D3a` archive, keyed by `snapshotId`. Linkage between the two is `snapshotIds` / `latestSnapshotId`.

```text
SavedTranscriptRecord = ChatRegistryRecord where:
  state.isSaved === true
  state.isLinked === true   (implied by invariant 1 when chatId !== "")
  view === 'saved'
  latestSnapshotId !== ""
```

Saved records dominate the Saved tab and Explorer's saved-only facet. The transcript content is never inlined into the registry record — only the pointer.

## 4. Imported / local saved record (no source URL)

```text
ImportedSavedRecord = ChatRegistryRecord where:
  chatId === ""
  href === ""
  normalizedHref === ""
  state.isSaved === true
  state.isLinked === false     (rule 1 does not apply when chatId is empty)
  linkedAt === ""
  linkedFrom === ""
  linkSourceHref === ""
  view === 'imported'
  source === 'imported'
  latestSnapshotId !== ""
```

These are the **only legitimate `isSaved && !isLinked` records.** They have no native chat to open — the row's "Open original ChatGPT chat" secondary action is hidden because `linkSourceHref` is empty.

## 5. Snapshot metadata (`0D3a` archive engine)

The transcript blob is stored externally; this is the per-snapshot index entry consumed by the registry's `snapshotIds`.

```text
SnapshotMeta = {
  snapshotId:      string,            // primary key
  chatId:          string,            // "" for imported
  capturedAt:      string,            // ISO; archive capture time
  titleAtCapture:  string,
  titleSourceAtCapture: 'native' | 'archive' | 'user' | '',
  folderIdAtCapture:   string,
  categoryIdAtCapture: string,
  labelIdsAtCapture:   string[],
  tagIdsAtCapture:     string[],
  projectIdAtCapture:  string,
  hrefAtCapture:       string,
  byteSize:        number,            // transcript blob size
  turnCount:       number,
  source:          'native' | 'imported',
  schemaVersion:   1,
}
```

- The capture-time copies of metadata are immutable. Renames after capture do not retroactively change the snapshot.
- Dedupe key: `snapshotId` (UUID generated at capture).
- A snapshot can outlive its registry record (a registry record can be deleted while the snapshot remains in archive). Repair uses snapshots to reconstruct missing registry records.

## 6. Folder

```text
Folder = {
  folderId:        string,            // primary key
  name:            string,
  parentId:        string,            // "" if root
  color:           string,            // CSS color or "" for default
  icon:            string,            // emoji or "" for default
  position:        number,            // sort order among siblings
  createdAt:       string,
  updatedAt:       string,
  isArchived:      boolean,           // archived folders are hidden by default
  source:          'native' | 'studio',
  schemaVersion:   1,
}
```

Dedupe key: `folderId`. Native owns writes until Phase 3.

## 7. Folder binding (chat ↔ folder)

```text
FolderBinding = {
  chatId:          string,            // "" forbidden — bindings require a chatId
  folderId:        string,            // primary folder
  pinned:          boolean,           // pinned to the top of the folder
  position:        number,            // sort order within folder
  boundAt:         string,            // ISO
  source:          'native' | 'studio',
  schemaVersion:   1,
}
```

- Today's data model permits a chat to be in one primary folder. Multi-folder bindings are tracked separately in the folder catalog if/when needed; **the canonical Chat Registry's `folderId` is the primary binding only.**
- Dedupe key: `(chatId, folderId)` pair.

## 8. Category

```text
Category = {
  categoryId:      string,            // primary key, stable ID
  name:            string,
  parentId:        string,            // "" if root; supports nested categories
  color:           string,
  icon:            string,
  appearance:      { … },              // see 0F4a; surface-specific render hints
  isAuto:          boolean,            // auto-classified by the candidate-pool
  createdAt:       string,
  updatedAt:       string,
  isArchived:      boolean,
  source:          'native' | 'studio',
  schemaVersion:   1,
}
```

- Dedupe key: `categoryId`. Name renames preserve `categoryId`.
- A Chat Registry record carries `categoryId` (primary), not a name. Renames cascade automatically.

## 9. Label

```text
Label = {
  labelId:         string,            // primary key
  name:            string,
  color:           string,
  position:        number,
  createdAt:       string,
  updatedAt:       string,
  isArchived:      boolean,
  source:          'native' | 'studio',
  schemaVersion:   1,
}
```

- Bindings are a many-to-many: each Chat Registry record carries `labelIds: string[]`. There is no separate `LabelBinding` record — the registry is the binding store.
- Dedupe key: `labelId`.

## 10. Tag (top-level)

```text
Tag = {
  tagId:           string,            // primary key
  name:            string,
  source:          'auto' | 'user',   // auto = derived from turn-level keyword extraction
  occurrences:     number,            // total occurrences across chats (cached aggregate)
  firstSeenAt:     string,
  lastSeenAt:      string,
  isArchived:      boolean,
  schemaVersion:   1,
}
```

- Top-level: `tagId` is referenced from `ChatRegistryRecord.tagIds`.
- Turn-level tags are a separate concern owned by `0F5a`'s turn occurrence index (`tag-occ-index:v1`). The turn-level structure is a per-`(chatId, turnId)` array of `tagId`s, and is not duplicated into the Chat Registry record.

## 11. Project

```text
Project = {
  projectId:       string,            // native ChatGPT project id (primary key)
  name:            string,
  protected:       boolean,           // 'organization.protected' rule — never auto-classify a protected project
  source:          'native' | 'studio-derived',
  cachedAt:        string,            // last DOM-scrape / API-intercept timestamp
  schemaVersion:   1,
}
```

- The canonical store for projects is native (intercepts `/backend-api/projects`). Studio derives the project list from Library Index facets when native isn't available, but does not own the catalog.
- Dedupe key: `projectId`.

## 12. Scan ledger (Library Index housekeeping)

```text
ScanBatch = {
  batchId:         string,
  startedAtMs:     number,            // epoch millis (hot-path)
  finishedAtMs:    number,
  source:          'native:recents' | 'native:project-list' | 'native:save-strip' | 'studio:import' | 'maintenance:repair',
  scannedCount:    number,
  upsertedCount:   number,
  durationMs:      number,
  schemaVersion:   1,
}
```

- Not a user-facing record. Lives in the shared store under the scan-ledger family.
- Dedupe key: `batchId`. Append-only.

## Cross-cutting dedupe summary

| Concern | Primary | Secondary | Tertiary |
|---|---|---|---|
| Chat Registry record | `chatId` | `normalizedHref` | `latestSnapshotId` (imported-only) |
| Snapshot | `snapshotId` | — | — |
| Folder | `folderId` | — | — |
| Folder binding | `(chatId, folderId)` | — | — |
| Category | `categoryId` | — | — |
| Label | `labelId` | — | — |
| Tag (top-level) | `tagId` | `name` (case-insensitive, only when migrating legacy data) | — |
| Project | `projectId` | — | — |
| Scan batch | `batchId` | — | — |

## Versioning policy

- `schemaVersion: 1` covers everything in this document.
- Adding a field with a documented default does **not** bump the version.
- Removing a field, narrowing an enum, or changing a merge rule **does** bump the version. The shared layer's migration helper is responsible for upgrading legacy records on read.
- Every shape has a `schemaVersion` field for forward compatibility, even if no version > 1 exists yet.

## When this document must be updated

Any of the following requires a PR that edits this file:

- Adding a new field to any record above.
- Changing a merge rule, dedupe key, or invariant.
- Adding a new record shape (e.g., a future "comment", "highlight binding", "share link").
- Changing the `view` enum.
- Bumping any `schemaVersion`.

Reviewers should reject the PR if the shape change isn't reflected here.
