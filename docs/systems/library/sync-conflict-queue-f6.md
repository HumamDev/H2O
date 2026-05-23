# F6 Sync Conflict Queue Model

## 1. Executive Summary

F6 defines a general, evidence-only conflict queue for non-delete sync
disagreements before any bidirectional sync prototype. It covers edit-vs-edit
conflicts, metadata divergence, assignment divergence, duplicate identity, and
unsupported merge cases.

F6 does not replace F5 tombstone/delete review. Tombstones, delete evidence,
delete-vs-edit review, reviewed delete apply, and synthetic cleanup remain F5
responsibilities. F6 also does not start bidirectional sync; it stores and
diagnoses conflict evidence only.

## 2. Scope And Non-Scope

In scope:

- Non-delete conflicts.
- Divergent edits.
- Metadata and assignment disagreements.
- Duplicate identity.
- Local-vs-remote freshness disagreements.
- Redacted diagnostics and future manual review workflow.

Out of scope:

- Automatic merge.
- Automatic apply.
- Bidirectional sync.
- Chat content merge.
- Snapshot content merge.
- Delete, folder, or cascade apply.
- Import/export behavior changes.
- UI or settings.
- Cleanup, purge, archive, or compaction changes.

## 3. Relationship To F5 Tombstone Reviews

F5 owns:

- Tombstones.
- Delete evidence.
- Delete-vs-edit review.
- Desktop reviewed `folderBinding` delete apply.
- Synthetic cleanup lifecycle.

F6 must not duplicate F5 tombstone review rows. If a future non-delete
conflict intersects with delete evidence, F6 may reference F5 through redacted
diagnostic codes such as `delete-vs-edit-owned-by-f5`, but F5 remains the
source of truth for the actionable delete review.

## 4. F6.1a Purpose

F6.1a refines the conflict queue schema/store plan only. It adds no runtime
code, no SQLite migration, no JS store, no analyzer hook, no script
registration, and no UI. The purpose is to make F6.1b a narrow implementation
step: Desktop table plus read-only modular store scaffold.

F6.1a must not touch `studio.html`, `pack-studio.mjs`, `studio.js`,
`studio.css`, Dock, Ribbon, Overlay, FolderParity files, F5 tombstone/apply
files, import/export modules, or sync runtime modules.

## 5. F6.1b.0 Migration-Only Scope

F6.1b.0 is the first runtime-adjacent step, but it is migration-only. It adds
the Desktop SQLite `sync_conflicts` table and indexes so later phases can build
read-only diagnostics on a stable schema.

F6.1b.0 does not add:

- JS store files.
- Store registration or loading.
- Runtime APIs.
- Conflict ingestion.
- Analyzer hooks.
- Merge/apply behavior.
- Import/export/sync behavior changes.
- UI/settings.
- Chrome conflict storage.

F6.1b.1 will add `src-surfaces-base/studio/store/conflicts.tauri.js` later,
after Studio loader/packer ownership is clear. That store must remain modular
and must not be added to `studio.js`, `tombstone-reviews.tauri.js`, or any
F5 cleanup/apply file.

## 6. Final Table Name

The proposed table name is `sync_conflicts`.

Use `sync_conflicts` rather than `sync_conflict_reviews` because the queue is
broader than manual review rows. It can hold divergent metadata evidence,
assignment disagreement, duplicate identity evidence, unsupported merge
evidence, and delete-vs-edit references that point back to F5. The table is
still evidence-only; the broader name must not be interpreted as permission to
apply or merge conflicts.

## 7. Final Proposed Schema

Future Desktop schema candidate:

```sql
sync_conflicts (
  conflict_id TEXT PRIMARY KEY,
  schema TEXT NOT NULL,
  conflict_kind TEXT NOT NULL,
  entity_kind TEXT NOT NULL,
  entity_id TEXT,
  local_peer_id TEXT,
  remote_peer_id TEXT,
  remote_export_id TEXT,
  remote_sequence_number INTEGER,
  local_version_digest TEXT,
  remote_version_digest TEXT,
  local_updated_at TEXT,
  remote_updated_at TEXT,
  classification TEXT NOT NULL,
  status TEXT NOT NULL,
  severity TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  seen_count INTEGER NOT NULL DEFAULT 1,
  dedupe_key TEXT NOT NULL UNIQUE,
  raw_local_summary_json TEXT NOT NULL DEFAULT '{}',
  raw_remote_summary_json TEXT NOT NULL DEFAULT '{}',
  warnings_json TEXT NOT NULL DEFAULT '[]',
  decision TEXT,
  decided_at TEXT,
  decided_by_sync_peer_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

This is future schema only. F6.1a does not add the table.

F6.1b.0 implements this schema as an inert Desktop migration only.

## 8. Proposed Indexes

F6.1b should add these indexes with the table:

```sql
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_status
  ON sync_conflicts(status);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_classification
  ON sync_conflicts(classification);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_severity
  ON sync_conflicts(severity);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_conflict_kind
  ON sync_conflicts(conflict_kind);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_entity_kind
  ON sync_conflicts(entity_kind);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_entity
  ON sync_conflicts(entity_kind, entity_id);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_remote_peer
  ON sync_conflicts(remote_peer_id);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_remote_export
  ON sync_conflicts(remote_export_id);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_last_seen_at
  ON sync_conflicts(last_seen_at);
```

`dedupe_key` is already unique in the table definition and does not need a
separate named index unless a later migration needs one for diagnostics.

F6.1b.0 implements these indexes with the table.

## 9. Schema Constants

Future F6.1b store constants:

```js
const CONFLICT_SCHEMA = "h2o.studio.sync-conflict.v1";
const DIAGNOSTIC_SCHEMA = "h2o.studio.sync-conflict.diagnostic.v1";
```

## 10. Enum Validation

Allowed statuses:

- `pending`
- `accepted-later`
- `ignored`
- `rejected`
- `resolved`
- `superseded`

Allowed severities:

- `info`
- `low`
- `medium`
- `high`
- `critical`

Allowed classifications:

- `safe-review`
- `needs-human-review`
- `dangerous-auto-merge`
- `unsupported-record-kind`
- `delete-vs-edit-owned-by-f5`
- `local-comparison-unavailable`
- `malformed-remote-record`
- `duplicate-candidate`

Allowed conflict kinds:

Initial `conflict_kind` values:

- `same-record-divergent-metadata`
- `local-newer-than-remote`
- `remote-newer-than-local`
- `duplicate-identity`
- `folder-membership-divergence`
- `label-binding-divergence`
- `category-binding-divergence`
- `visual-metadata-divergence`
- `unsupported-merge-kind`
- `delete-vs-edit-reference`

Allowed entity kinds:

Initial `entity_kind` values:

- `folder`
- `folderBinding`
- `chat`
- `snapshot`
- `label`
- `labelBinding`
- `category`
- `categoryBinding`
- `visualMetadata`
- `linkedOnlyChat`
- `savedSnapshot`
- `unknown`

## 11. Status And Decision Model

Statuses:

- `pending`
- `accepted-later`
- `ignored`
- `rejected`
- `resolved`
- `superseded`

Decision examples:

- `resolved-local-wins`
- `resolved-remote-wins`
- `resolved-manual-merge`
- `ignored-by-operator`
- `rejected-by-operator`
- `accepted-for-later-review`
- `blocked-unsupported`

No F6 phase should imply or perform mutation until a later phase explicitly
plans and gates mutation. Decision strings are review evidence, not merge
execution.

## 12. Detection Strategy

Future candidate sources:

- Multi-peer diff analyzer.
- Export/import dry-run.
- Peer mirror comparison.
- Local-state comparison.
- Folder parity diagnostics.
- Future bidirectional merge preview.

Preferred path:

- Analyzer reports conflict candidates first.
- Explicit candidate ingestion follows only after analyzer output is stable.
- Normal sync must not automatically ingest conflict rows until the queue is
  validated.

## 13. Dedupe Strategy

Candidate same-record dedupe form:

```txt
conflictKind + entityKind + entityId + remotePeerId + localDigest + remoteDigest
```

Candidate duplicate-identity dedupe form:

```txt
duplicate-identity + entityKind + canonicalMeaningDigest + remotePeerId
```

Repeated sightings should:

- Increment `seen_count`.
- Preserve `first_seen_at`.
- Update `last_seen_at`.
- Update latest remote export and sequence metadata.

## 14. Redaction Policy

Default diagnostics and list summaries must not expose:

- Raw chat, folder, or record IDs.
- Peer IDs.
- Raw content.
- Prompt or answer text.
- Folder names.
- Chat titles.
- Raw JSON payloads.
- Metadata blobs.

Use counts, classifications, severities, and code-level summaries only. Any
future sensitive mode must be explicit, dev-only, and excluded from default
diagnostics.

## 15. Future Store API

Future Desktop store namespace:

```js
H2O.Studio.store.conflicts
```

F6.1b should expose read-only/inert methods:

```js
H2O.Studio.store.conflicts.init()
H2O.Studio.store.conflicts.isReady()
H2O.Studio.store.conflicts.diagnose()
H2O.Studio.store.conflicts.listConflicts(filters)
H2O.Studio.store.conflicts.getConflict(conflictId)
H2O.Studio.store.conflicts.countByStatus()
H2O.Studio.store.conflicts.countByKind()
H2O.Studio.store.conflicts.countBySeverity()
H2O.Studio.store.conflicts.validateConflict(record)
```

Explicitly defer write/ingest APIs:

- `createConflict()`
- `upsertConflictSighting()`
- `ingestConflictCandidates()`
- `markIgnored()`
- `markResolved()`
- `previewResolution()`

Avoid dangerous or premature APIs entirely:

- `applyConflict()`
- `resolveAll()`
- `autoMerge()`
- `forceRemoteWins()`
- `deleteLocal()`

## 16. Registration And Loading Plan For F6.1b.1

Preferred future module:

```txt
src-surfaces-base/studio/store/conflicts.tauri.js
```

Rules:

- Do not bloat `studio.js`.
- Do not put conflict logic in `tombstone-reviews.tauri.js`.
- Do not touch F5 cleanup/apply modules.
- Avoid `studio.html` and packer touches while active Studio WIP exists.
- Coordinate with the FolderParity/Ribbon/Dock/Overlay lane before adding
  script registration.
- Chrome conflict store is deferred.

## 17. Diagnostics Model

Future counts-only diagnostic shape:

```js
{
  schema: "h2o.studio.sync-conflict.diagnostic.v1",
  generatedAt,
  installed: true,
  ready: true,
  redacted: true,
  platform: "desktop-tauri",
  table: "sync_conflicts",
  total,
  pending,
  byKind,
  byEntityKind,
  byStatus,
  bySeverity,
  unsupportedCount,
  deleteVsEditReferenceCount,
  warnings: []
}
```

Diagnostics are observation-only. They must not merge, apply, update review
state, or trigger sync writes.

## 18. Future Failure Semantics

Future F6.1b.1 read-only store behavior:

- Missing table returns `ready: false` plus a code-level warning.
- SQL unavailable returns a warning and does not crash the caller.
- Malformed stored JSON summaries produce warnings only.
- Invalid filters are handled safely with a clear code-level error or empty
  result, not broad SQL interpolation.
- All F6.1b methods are read-only. No writes are allowed.

## 19. Desktop Vs Chrome

Recommended sequence:

- Desktop SQLite first in a later phase.
- Chrome IndexedDB later only if review queue parity is needed.
- No Chrome sync integration in early F6.
- No conflict queue writes from current one-way `latest.json` sync.

Desktop-first keeps the model anchored to the durable local database while
avoiding premature Chrome/Desktop parity work before conflict semantics are
stable.

## 20. Validation Strategy For Future Phases

Future validation must prove:

- Rows are created only from explicit candidate ingestion.
- No automatic merge or apply occurs.
- Duplicate candidates dedupe.
- Status transitions are decision-only.
- Diagnostics are redacted.
- Malformed records become conflict evidence, not crashes.
- Import/export/sync behavior remains unchanged.

F6.1b.0-specific validation should prove:

- The migration defines `sync_conflicts`.
- The migration defines all planned indexes.
- The migration is idempotent by using `IF NOT EXISTS`.
- No conflict rows are seeded.
- No JS/runtime/store files are added.
- No import/export/sync/F5/FolderParity files are touched.

F6.1b.1-specific validation should prove:

- Empty-table diagnostics return `total: 0`.
- Enum validation accepts only the allowed sets listed above.
- `listConflicts()` filters cannot inject SQL and return redacted summaries.
- `getConflict()` redacts raw JSON by default.
- No import/export/sync/F5/FolderParity files are touched.

## 21. F6.1b Acceptance Criteria

F6.1b.0 is acceptable only if:

- Desktop SQLite migration only.
- `sync_conflicts` table and indexes exist.
- No store, runtime API, ingestion, analyzer hook, merge, or apply behavior.
- No import/export/sync behavior change.
- No FolderParity/Ribbon/Dock/Overlay conflict.

F6.1b.1 is acceptable only if:

- Desktop-only inert scaffold.
- No automatic conflict creation.
- No merge or apply behavior.
- No import/export/sync behavior change.
- Redacted diagnostics.
- Modular store file.
- No `studio.js` bloat.
- No FolderParity/Ribbon/Dock/Overlay conflict.
- No Chrome conflict store.

## 22. Risks And Mitigations

- Auto-merge pressure: keep early APIs diagnostic and decision-only.
- F5 overlap: reference delete evidence by code and leave actionable delete
  review in F5.
- ID/content leakage: use redacted counts and code-level summaries by default.
- Duplicate noise: require stable dedupe keys and sighting counters.
- Overbroad schema: start docs-only, then inert scaffold.
- Chrome/Desktop drift: settle Desktop semantics before Chrome implementation.
- Folder parity lane conflict: do not touch renderer, Ribbon, Dock, Overlay,
  or FolderParity files during F6 model work.

## 23. Phased Roadmap

- F6.0: Conflict queue model docs only.
- F6.1a: Schema/store refinement docs only.
- F6.1b.0: Desktop `sync_conflicts` migration only.
- F6.1b.1: Desktop read-only `conflicts.tauri.js` store registration.
- F6.2: Analyzer-only conflict candidate detection.
- F6.3: Hidden runner counts-only display.
- F6.4: Manual conflict candidate ingestion.
- F6.5: Decision-only actions.
- F6.6: `previewResolution()` only, no mutation.
- F6.7: Chrome conflict store scaffold if needed.
- F7: First gated bidirectional prototype.

## 24. Recommendation

The next implementation after this document should still be conservative:
F6.1b.0 may add only the inert Desktop SQLite migration. F6.1b.1 should wait
until Studio loader/packer ownership is clear. Do not touch FolderParity
renderer work from the other lane.
