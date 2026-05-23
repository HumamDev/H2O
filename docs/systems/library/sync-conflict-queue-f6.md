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

## 4. Candidate Data Model

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
)
```

This is future schema only. F6.0 does not add a table, migration, store, API,
or analyzer hook.

## 5. Conflict Kinds

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

## 6. Entity Kinds

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

## 7. Status And Decision Model

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

## 8. Detection Strategy

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

## 9. Dedupe Strategy

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

## 10. Redaction Policy

Default diagnostics must not expose:

- Full chat, folder, or record IDs.
- Peer IDs.
- Raw content.
- Prompt or answer text.
- Folder names.
- Chat titles.
- Raw JSON payloads.

Use counts, classifications, severities, and code-level summaries only. Any
future sensitive mode must be explicit, dev-only, and excluded from default
diagnostics.

## 11. Future APIs

Possible future APIs:

```js
H2O.Studio.store.conflicts.diagnose()
H2O.Studio.store.conflicts.listConflicts(filters)
H2O.Studio.store.conflicts.getConflict(conflictId)
H2O.Studio.store.conflicts.ingestConflictCandidates(candidates, sourceContext)
H2O.Studio.store.conflicts.markIgnored(conflictId, reason)
H2O.Studio.store.conflicts.markResolved(conflictId, decision, reason)
H2O.Studio.store.conflicts.previewResolution(conflictId, options)
```

Avoid dangerous or premature APIs:

- `applyConflict()`
- `resolveAll()`
- `autoMerge()`
- `forceRemoteWins()`
- `deleteLocal()`

## 12. Diagnostics Model

Future counts-only diagnostic shape:

```js
{
  schema: "h2o.studio.sync-conflict.diagnostic.v1",
  generatedAt,
  redacted: true,
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

## 13. Desktop Vs Chrome

Recommended sequence:

- Desktop SQLite first in a later phase.
- Chrome IndexedDB later only if review queue parity is needed.
- No Chrome sync integration in early F6.
- No conflict queue writes from current one-way `latest.json` sync.

Desktop-first keeps the model anchored to the durable local database while
avoiding premature Chrome/Desktop parity work before conflict semantics are
stable.

## 14. Validation Strategy For Future Phases

Future validation must prove:

- Rows are created only from explicit candidate ingestion.
- No automatic merge or apply occurs.
- Duplicate candidates dedupe.
- Status transitions are decision-only.
- Diagnostics are redacted.
- Malformed records become conflict evidence, not crashes.
- Import/export/sync behavior remains unchanged.

## 15. Risks And Mitigations

- Auto-merge pressure: keep early APIs diagnostic and decision-only.
- F5 overlap: reference delete evidence by code and leave actionable delete
  review in F5.
- ID/content leakage: use redacted counts and code-level summaries by default.
- Duplicate noise: require stable dedupe keys and sighting counters.
- Overbroad schema: start docs-only, then inert scaffold.
- Chrome/Desktop drift: settle Desktop semantics before Chrome implementation.
- Folder parity lane conflict: do not touch renderer, Ribbon, Dock, Overlay,
  or FolderParity files during F6 model work.

## 16. Phased Roadmap

- F6.0: Conflict queue model docs only.
- F6.1: Desktop conflict table/store scaffold, inert.
- F6.2: Analyzer-only conflict candidate detection.
- F6.3: Hidden runner counts-only display.
- F6.4: Manual conflict candidate ingestion.
- F6.5: Decision-only actions.
- F6.6: `previewResolution()` only, no mutation.
- F6.7: Chrome conflict store scaffold if needed.
- F7: First gated bidirectional prototype.

## 17. Recommendation

The next implementation after this document should still be conservative:
F6.1 may add an inert Desktop table/store scaffold only after the schema and
file ownership are accepted. Do not build conflict tables or stores in F6.0.
Do not touch FolderParity renderer work from the other lane.
