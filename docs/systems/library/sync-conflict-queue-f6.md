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

F6.1b explicitly deferred write/ingest APIs:

- `createConflict()`
- `upsertConflictSighting()`
- `ingestConflictCandidates()`
- `markIgnored()`
- `markResolved()`

Avoid dangerous or premature APIs entirely:

- `applyConflict()`
- `resolveAll()`
- `autoMerge()`
- `forceRemoteWins()`
- `deleteLocal()`

Later F6 phases add only the explicitly planned manual surfaces:
`ingestConflictCandidates()` in F6.4, decision-only methods in F6.5, and
`previewResolution(conflictId, options)` in F6.6. `previewResolution()` is a
read-only diagnostic method. It returns option labels and blockers only; it
does not call the F6.5 decision methods and does not mutate conflict rows or app
entities.

## 16. F6.1b.1 Read-Only Store Registration

F6.1b.1 adds the Desktop-only read-only store module:

```txt
src-surfaces-base/studio/store/conflicts.tauri.js
```

It registers `H2O.Studio.store.conflicts` and exposes only observation helpers:

- `init()`
- `dispose()`
- `isReady()`
- `diagnose()`
- `listConflicts(filters)`
- `getConflict(conflictId)`
- `countByStatus()`
- `countByKind()`
- `countBySeverity()`
- `validateConflict(record)`
- `constants`

Rules:

- Do not bloat `studio.js`.
- Do not put conflict logic in `tombstone-reviews.tauri.js`.
- Do not touch F5 cleanup/apply modules.
- Registration/loading diffs must be minimal and limited to script/packer
  inclusion. Unrelated Studio/Ribbon/Dock/Overlay work must not be staged.
- Chrome conflict store is deferred.
- The store must remain read-only: table checks, counts, `SELECT` queries, and
  redacted row summaries only. It must not expose conflict creation, ingestion,
  merge/apply, or generic SQL helpers.

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

## 18. F6.2 Analyzer-Only Conflict Candidates

F6.2 adds in-memory conflict candidate detection to the pure
`multi-peer-diff.js` analyzer. These candidates are report evidence only:

- They are not inserted into `sync_conflicts`.
- They do not call `H2O.Studio.store.conflicts`.
- They do not create conflict records.
- They do not merge, apply, import, export, or sync anything.
- They are redacted and capped by default.

Analyzer report shape:

```js
report.conflictCandidates = {
  supported: true,
  generatedAt,
  redacted: true,
  total,
  byKind,
  byEntityKind,
  byClassification,
  bySeverity,
  deleteVsEditReferenceCount,
  unsupportedCount,
  candidates: [],
  warnings: []
}
```

Candidate summaries must not expose raw record IDs, peer IDs, folder IDs, chat
IDs, folder names, chat titles, hrefs, raw JSON, transcript content,
prompt/answer text, or raw dedupe keys. The default summaries expose only
candidate codes, presence booleans for timestamps/digests, and
`dedupeKeyHashPresent: true`.

Initial F6.2 candidate kinds:

- `same-record-divergent-metadata`
- `local-newer-than-remote`
- `remote-newer-than-local`
- `folder-membership-divergence` when both bundle and local binding inputs are
  already available.
- `unsupported-merge-kind`
- `delete-vs-edit-reference`

`delete-vs-edit-reference` is classified as `delete-vs-edit-owned-by-f5`.
F6.2 must not duplicate F5 tombstone review logic or create an F6 action path
for delete conflicts.

Deferred from F6.2:

- Conflict queue ingestion.
- Hidden runner display.
- Duplicate identity heuristics.
- Chat/snapshot content merge.
- Any resolution recommendation.

## 19. Future Failure Semantics

Future F6.1b.1 read-only store behavior:

- Missing table returns `ready: false` plus a code-level warning.
- SQL unavailable returns a warning and does not crash the caller.
- Malformed stored JSON summaries produce warnings only.
- Invalid filters are handled safely with a clear code-level error or empty
  result, not broad SQL interpolation.
- All F6.1b methods are read-only. No writes are allowed.

## 20. Desktop Vs Chrome

Recommended sequence:

- Desktop SQLite first in a later phase.
- Chrome IndexedDB later only if review queue parity is needed.
- No Chrome sync integration in early F6.
- No conflict queue writes from current one-way `latest.json` sync.

Desktop-first keeps the model anchored to the durable local database while
avoiding premature Chrome/Desktop parity work before conflict semantics are
stable.

## 21. Validation Strategy For Future Phases

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
- Missing-table diagnostics return `ready: false` and
  `sync-conflicts-table-missing`.
- Enum validation accepts only the allowed sets listed above.
- `listConflicts()` filters cannot inject SQL and return redacted summaries.
- `getConflict()` redacts raw JSON by default.
- The store module contains no SQL row or schema mutation statements.
- No import/export/sync/F5/FolderParity files are touched.

F6.2-specific validation should prove:

- `report.conflictCandidates.total === 0` for no-conflict fixtures.
- Local-newer and remote-newer candidates are emitted only when both timestamps
  parse cleanly.
- Same-record metadata divergence candidates are redacted.
- Folder membership divergence is emitted only when both local and bundle
  binding inputs are available.
- Delete-vs-edit references are counted as F5-owned critical candidates.
- Unsupported kinds become `unsupported-merge-kind` candidates.
- Candidate summaries contain no raw IDs, names, titles, hrefs, raw JSON, or
  content.
- No SQL, store write, import/export/sync, or F5 mutation path is called.

## 22. F6.1b Acceptance Criteria

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
- Registration is limited to the focused module entry and packer/script
  inclusion.

F6.2 is acceptable only if:

- Analyzer/report only.
- No writes to `sync_conflicts`.
- No ingestion or automatic conflict creation.
- Redacted candidate counts and capped summaries.
- No merge/apply/import/export/sync behavior change.
- No F5 tombstone/review/apply/cleanup behavior change.
- No FolderParity/Ribbon/Dock/Overlay file changes.

F6.3 is acceptable only if:

- Hidden runner display only.
- Counts only from `report.conflictCandidates`.
- No candidate rows, IDs, names, titles, hrefs, raw JSON, content, or dedupe
  keys are rendered.
- No reads from or writes to `H2O.Studio.store.conflicts`.
- No ingestion, merge, apply, import/export/sync, or F5 behavior change.

F6.4a is acceptable only if:

- `H2O.Studio.store.conflicts.ingestConflictCandidates()` exists as a manual
  dry-run validator only.
- `dryRun: true` is required.
- At this phase, `dryRun: false` returns `real-ingest-not-implemented`.
- Candidate validation rejects invalid enums, missing dedupe material, and
  content-like fields.
- Analyzer summaries that only expose `dedupeKeyHashPresent: true` remain
  insufficient for durable queue prediction and are rejected as
  `missing-dedupe-material` until a later phase exposes a safe hash/fingerprint.
- Duplicate prediction uses read-only lookup by safe dedupe material.
- `writesPerformed` is always `0`.
- No analyzer, runner, import/export/sync, UI, Chrome, or F5 path calls the API.
- No rows are inserted, updated, or deleted.

F6.4b is acceptable only if:

- `dryRun: false` is supported only through the same explicit manual
  `H2O.Studio.store.conflicts.ingestConflictCandidates()` API.
- Candidate validation remains the F6.4a validation contract; analyzer
  summaries with only `dedupeKeyHashPresent: true` are still rejected.
- Real ingestion requires a non-empty safe reason and actual durable safe
  `dedupeKeyHash`.
- JS passes only sanitized write plans to a narrow Desktop Rust command.
- Rust writes in one transaction and only inserts pending evidence rows or
  updates duplicate sighting metadata.
- Duplicate sightings preserve `status`, `decision`, `decided_at`,
  `decided_by_sync_peer_id`, and `first_seen_at`; terminal rows are not
  reopened.
- Results remain counts-only/redacted and do not expose conflict IDs, raw
  record IDs, peer IDs, raw dedupe keys, names, titles, hrefs, raw JSON, or
  content.
- No analyzer, runner, import/export/sync, UI, Chrome, or F5 path calls the API.
- No merge, apply, resolve, delete, bidirectional sync, or public UI behavior
  is added.

F6.5 is acceptable only if:

- `H2O.Studio.store.conflicts` exposes manual decision-only methods:
  `markIgnored`, `markRejected`, `markAcceptedLater`, and `markResolved`.
- Decision actions update only `sync_conflicts.status`, `decision`,
  `decided_at`, `decided_by_sync_peer_id`, and `updated_at`.
- Every decision requires a non-empty audited reason and local sync peer
  identity; unaudited decisions are blocked.
- Allowed transitions are limited to `pending -> ignored | rejected |
  accepted-later | resolved` and `accepted-later -> ignored | rejected |
  resolved`.
- Terminal statuses `ignored`, `rejected`, `resolved`, and `superseded` are not
  reopened.
- `resolved-*` decisions are labels only. They do not perform local-wins,
  remote-wins, manual merge, apply, sync writeback, or entity mutation.
- Results are redacted and do not expose raw conflict IDs, record IDs, peer IDs,
  raw JSON, names, titles, prompts, answers, transcripts, or metadata.
- No analyzer, runner, ingestion, import/export/sync, UI, Chrome, or F5 path
  calls the decision APIs.
- No merge, apply, delete, bidirectional sync, or public UI behavior is added.

F6.6 is acceptable only if:

- `H2O.Studio.store.conflicts.previewResolution(conflictId, options)` exists as
  a Desktop-only read-only method.
- The method reads existing redacted conflict row data and returns only
  conflict kind, entity kind, status, classification, severity, presence flags,
  option labels, blockers, and warnings.
- `includeSensitive: true` is ignored with a warning; raw summaries, peer IDs,
  record IDs, names, titles, prompts, answers, transcripts, metadata blobs, and
  dedupe keys are never returned.
- `refreshLocalState: true` does not perform deep local reads in F6.6 and
  returns a code-level warning such as `local-refresh-not-implemented`.
- `pending` and `accepted-later` conflicts may return preview labels.
  Terminal statuses `ignored`, `rejected`, `resolved`, and `superseded` return
  the `conflict-status-terminal` blocker and are not reopened.
- `delete-vs-edit-reference` and
  `delete-vs-edit-owned-by-f5` return the `f5-owned-delete-review` label and
  the `delete-vs-edit-owned-by-f5` blocker. F6 does not duplicate F5 tombstone
  review behavior.
- Supported preview labels are explanation-only:
  `local-wins-preview`, `remote-wins-preview`, `manual-merge-preview`,
  `ignore-preview`, `reject-preview`, `accepted-later-preview`,
  `f5-owned-delete-review`, and `unsupported-resolution`.
- The method does not call `markIgnored`, `markRejected`, `markAcceptedLater`,
  or `markResolved`.
- No SQL `INSERT`, `UPDATE`, or `DELETE`, entity mutation, import/export/sync
  mutation, F5 apply/cleanup, merge, apply, bidirectional sync, Chrome, UI, or
  settings behavior is added.

F6 manual validation access is acceptable only if:

- Default `listConflicts()` output remains redacted and exposes
  `conflictIdPresent` but not `conflictId`.
- Raw conflict row IDs are exposed only when the caller explicitly passes
  `includeIdsForManualValidation: true` and the exact gate
  `I_UNDERSTAND_THIS_EXPOSES_CONFLICT_IDS_FOR_VALIDATION`.
- Wrong or missing validation gates return `invalid-validation-gate`, no rows,
  and no IDs.
- The gated path adds only `conflictId` to each already-redacted row. It does
  not expose peer IDs, record IDs, dedupe keys, raw summaries, raw JSON, names,
  titles, hrefs, prompts, answers, transcripts, content, or metadata blobs.
- The path is Desktop/Tauri-only through `conflicts.tauri.js`; no Chrome,
  public UI, settings, analyzer, runner, import/export/sync, F5, merge, apply,
  or entity mutation behavior is added.
- The purpose is manual DevTools validation of `getConflict()`,
  decision-only methods, and `previewResolution()` after explicit manual
  ingestion.

F6 final validation harness is acceptable only if:

- The focused Desktop-only module
  `src-surfaces-base/studio/dev/f6-final-validation.tauri.js` registers
  `H2O.Studio.devValidation.f6FinalValidation`.
- The harness is dormant on boot and runs only when
  `H2O.Studio.devValidation.f6FinalValidation.run()` is explicitly invoked.
- The harness calls the real public conflict store APIs only:
  `diagnose`, `ingestConflictCandidates`, gated `listConflicts`,
  `getConflict`, `previewResolution`, and `markAcceptedLater`.
- The harness does not use direct SQL, Rust shortcuts, import/export/sync
  paths, F5 paths, cleanup/delete helpers, merge/apply/resolution mutators, or
  app entity mutation paths.
- The harness uses a unique validation candidate per run, ingests it manually,
  resolves the gated conflict ID internally, marks it `accepted-later`, and
  does not delete validation rows.
- The harness result is redacted and may expose only counts, step booleans,
  blocker/warning codes, and `conflictIdPresent`. It must not return raw
  conflict IDs, peer IDs, record IDs, dedupe keys, raw summaries, raw JSON,
  names, titles, hrefs, prompts, answers, transcripts, content, or metadata
  blobs.
- No Chrome implementation, public UI/settings entry, automatic boot run, F5
  behavior change, import/export/sync behavior change, or F7 behavior is added.
- No hidden runner button is required while the existing multi-peer readiness
  runner remains a counts-only/no-writes surface.

## 23. Risks And Mitigations

- Auto-merge pressure: keep early APIs diagnostic and decision-only.
- F5 overlap: reference delete evidence by code and leave actionable delete
  review in F5.
- ID/content leakage: use redacted counts and code-level summaries by default.
- Duplicate noise: require stable dedupe keys and sighting counters.
- Overbroad schema: start docs-only, then inert scaffold.
- Chrome/Desktop drift: settle Desktop semantics before Chrome implementation.
- Folder parity lane conflict: do not touch renderer, Ribbon, Dock, Overlay,
  or FolderParity files during F6 model work.

## 24. Phased Roadmap

- F6.0: Conflict queue model docs only.
- F6.1a: Schema/store refinement docs only.
- F6.1b.0: Desktop `sync_conflicts` migration only.
- F6.1b.1: Desktop read-only `conflicts.tauri.js` store registration.
- F6.2: Analyzer-only conflict candidate detection.
- F6.3: Hidden runner counts-only display.
- F6.4a: Manual conflict candidate ingestion dry-run validation.
- F6.4b: Explicit manual conflict candidate write ingestion.
- F6.5: Decision-only actions.
- F6.6: `previewResolution()` only, no mutation.
- F6 validation access: Gated manual conflict ID retrieval for DevTools
  validation only.
- F6 final validation harness: Debug-only in-app runner for the public F6
  conflict queue API path.
- F6.7: Chrome conflict store scaffold if needed.
- F7: First gated bidirectional prototype.

## 25. Recommendation

The next implementation after F6.6 should remain conservative. F6.7 may add a
Chrome conflict store scaffold only if review queue parity is needed, but it
must not merge, apply, delete, or start bidirectional sync. Do not touch
FolderParity renderer work from the other lane.
