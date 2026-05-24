# F7 Bidirectional Preview Safety Model

## 1. Executive Summary

F7 starts as bidirectional preview diagnostics only. It does not add
write-back, automatic bidirectional sync, background sync, automatic merge,
automatic apply, or local/remote overwrite behavior.

The first F7 question is not "which side wins?" The first question is:
"Given evidence from Desktop and Chrome peers, what would each side need to
change, which disagreements are safe to review, and which cases must be
blocked or routed to F5/F6?"

Remote exports are evidence, not commands. A peer export can prove that a peer
observed or produced state at a sequence boundary, but it cannot by itself
authorize overwriting another peer's local state.

F7.0 is a documentation contract only. It does not add migrations, tables,
runtime APIs, Rust commands, Chrome digest emitters, schema stamping columns,
or sync behavior changes. Any future migration must use the next available
migration number; F6 already used the migration that added `sync_conflicts`.

## 2. First Safe Entity

The recommended first F7 preview candidate is `folder.metadata`.

`folder.metadata` is safer than `folderBinding`, chat content, snapshot
content, or attachments because it is comparatively small, non-content data
and can be compared without implying membership, cascade, archive, or content
merge behavior. It is still sensitive because folder names may reveal user
intent, so default diagnostics must remain redacted and counts-only.

Initial `folder.metadata` comparison should consider only fields that already
exist in exported/local evidence and can be summarized without exposing raw
names or record identifiers. F7.0 does not authorize adding new stamping
columns, digest columns, or Chrome emitters. Those are possible later only if
F7.1a inspection proves existing state is insufficient.

Deferred first-entity candidates:

- `folderBinding` metadata: riskier because membership differences can imply
  move/delete/cascade semantics.
- `label.metadata` and `category.metadata`: possible later, but identity
  semantics may be looser than folders if names or canonical meanings collide.
- Visual metadata: possible later, but should not be first if it lacks stable
  digest or ownership evidence.

Out of scope for the first entity:

- Chat content.
- Snapshot content.
- Attachments.
- Full archive merge.
- Automatic delete apply.
- Folder apply.
- Cascade apply.

## 3. Safety Model

F7 bidirectional work must follow these rules:

- Dry-run first.
- Counts-only diagnostics by default.
- No automatic merge.
- No automatic apply.
- No local-wins or remote-wins mutation.
- No silent overwrite.
- No background write-back.
- No delete propagation beyond F5 rules.
- No automatic F6 conflict ingestion.
- No bidirectional sync behavior change until a later gated phase explicitly
  defines it.

Every disagreement becomes preview evidence, F6-compatible conflict evidence,
or an F5-owned tombstone/delete reference. The preview must be conservative:
if the inputs are incomplete, ambiguous, or not comparable, the result should
contain blockers and warnings rather than performing or recommending mutation.

Timestamp ordering is not enough to decide a winner. Timestamps may help
classify freshness, but they do not authorize overwrite. F7 must prefer peer
identity, export sequence, digests, and watermarks where available.

## 4. F5 And F6 Integration

F5 remains the owner of tombstones and delete evidence:

- Tombstone records.
- Delete-vs-edit review.
- Reviewed delete/apply flows.
- Synthetic cleanup lifecycle.
- Any future delete propagation gate.

F7 preview must not duplicate F5 tombstone review rows. If a bidirectional
comparison detects delete-vs-edit evidence, the preview should return a
redacted tombstone reference such as `delete-vs-edit-owned-by-f5` and stop
short of F7 apply behavior.

F6 remains the owner of the non-delete conflict queue:

- Same-record divergent metadata.
- Local-vs-remote freshness disagreement.
- Duplicate/identity conflicts.
- Unsupported merge kinds.
- Decision-only conflict review metadata.

F7 preview may emit F6-compatible candidate summaries in a later phase, but
it must not auto-ingest those candidates into `sync_conflicts`. Explicit manual
handoff to F6 remains a later, gated action.

## 5. Direction Model

F7 preview should describe both directions without performing either:

- Pull preview: possible remote-to-local changes.
- Push preview: possible local-to-remote changes.

Direction labels do not imply authority. A pull preview can say "the remote
peer has metadata that differs from local" without applying it. A push preview
can say "local has metadata that differs from remote" without writing it to a
remote peer.

The preview may show both directions in one report, but `writesPerformed` must
remain `0`. No later runtime should call import, export, folder sync, peer
transport, F5 apply, or F6 decision APIs as part of F7.1 preview.

## 6. Watermark And Sequence Model

F7 should use existing peer identity, export sequence, and watermark concepts:

- Peer identity exists and identifies Desktop/Chrome peers.
- Desktop export envelope and per-peer mirror/discovery concepts already
  exist.
- Broader cloud, WebDAV, mobile, and native transport remain future work.
- Peer watermarks can help distinguish "known older state" from "state that
  cannot be compared safely."

Missing watermarks must downgrade to conservative diagnostics. They must not
trigger apply, overwrite, or inferred winner behavior.

F7.0 does not require new schema. Future preview inspection may discover that
additional stamping, digest, or watermark persistence is needed. If so, that
work belongs in a later phase and must use the next available migration
number, with a separate implementation plan.

## 7. Dry-Run Preview Report Shape

Future preview shape:

```js
{
  schema: "h2o.studio.sync.bidirectional-preview.v0",
  ok: true,
  dryRun: true,
  redacted: true,
  writesPerformed: 0,
  entityKind: "folder.metadata",
  proposed: {
    pull: { total: 0, byEntityKind: {}, blocked: 0 },
    push: { total: 0, byEntityKind: {}, blocked: 0 }
  },
  conflictCandidates: {
    total: 0,
    byKind: {},
    byEntityKind: {},
    bySeverity: {}
  },
  tombstoneReferences: {
    total: 0,
    deleteVsEditOwnedByF5: 0
  },
  blockers: [],
  warnings: []
}
```

The preview report is evidence-only. It must not include apply plans, SQL
mutation plans, import commands, export commands, resolver functions, or
local/remote winner instructions.

### F7.1b Folder Metadata Comparator

F7.1b adds a pure helper:

```js
H2O.Studio.diagnostics.previewBidirectionalFolderMetadata({
  localFolders,
  remoteFolders,
  envelope,
  options
});
```

The helper is preview-only and compares `folder.metadata` rows by stable
`id`/`folderId`. It normalizes aliases such as `sortOrder`/`index`/`position`,
`color`/`iconColor`, and `parentId`/`parentFolderId`, then computes an
ephemeral in-memory metadata hash. The hash is not persisted and is not
returned in the default report.

F7.1b classifications are counts-only:

- `same`: same folder ID and same normalized metadata hash.
- `localOnly`: local folder ID absent from remote evidence.
- `remoteOnly`: remote folder ID absent from local evidence.
- `divergentMetadata`: same folder ID with different normalized metadata.
- `localNewer`: local `updatedAt` is newer, only when both timestamps parse.
- `remoteNewer`: remote `updatedAt` is newer, only when both timestamps parse.
- `timestampUnavailable`: divergent metadata exists but one or both timestamps
  are missing or unparseable.
- `unsupported`: malformed or unsupported folder evidence, such as rows without
  a stable folder ID.

For divergent metadata, F7.1b increments F6-compatible conflict candidate
counts only. It does not call `sync_conflicts`, does not auto-ingest, and does
not create decision or preview-resolution records.

### F7.2 F6-Compatible Candidate Summaries

F7.2 keeps the helper preview-only, but can optionally return capped
F6-shaped candidate objects:

```js
H2O.Studio.diagnostics.previewBidirectionalFolderMetadata({
  localFolders,
  remoteFolders,
  options: {
    includeConflictCandidates: true,
    conflictCandidateLimit: 20
  }
});
```

Candidate counts are always populated in `conflictCandidates`. The
`conflictCandidates.candidates` array is returned only when
`includeConflictCandidates === true`, defaults to a cap of `20`, and is capped
at `50` even if a larger limit is requested. Counts include all candidates,
not just the capped returned array.

F7.2 candidate mappings:

- `divergentMetadata` emits `same-record-divergent-metadata`,
  `needs-human-review`, `medium`.
- Divergent metadata with local newer `updatedAt` emits
  `local-newer-than-remote`, `safe-review`, `low`.
- Divergent metadata with remote newer `updatedAt` emits
  `remote-newer-than-local`, `safe-review`, `low`.
- Malformed or unsupported folder evidence emits `unsupported-merge-kind`,
  `unsupported-record-kind`, `info`.

`localOnly`, `remoteOnly`, duplicate identity, folderBinding, delete evidence,
and real conflict handoff remain deferred. Presence-only folder differences
can imply create/delete semantics and must not be treated as F6 queue evidence
in F7.2.

Returned candidates use:

```js
{
  schema: "h2o.studio.sync-conflict-candidate.v1",
  entityKind: "folder",
  source: "bidirectional-folder-preview",
  dedupeKeyHash,
  localUpdatedAtPresent,
  remoteUpdatedAtPresent,
  localDigestPresent,
  remoteDigestPresent,
  warnings: []
}
```

`dedupeKeyHash` is derived from internal material only: conflict kind, F6 entity
kind, a hashed folder identity, and internal local/remote metadata hashes. The
raw folder ID, folder name, parent ID, metadata hash, raw metadata, and peer
identity are never returned. The F6 conflict store allowlists
`bidirectional-folder-preview` as a candidate source for manual dry-run
validation, but F7.2 never calls F6 ingestion.

### F7.3 Manual F6 Handoff Protocol

F7.3 is a manual protocol for taking explicitly selected folder metadata
candidates from F7 preview output and passing them to the existing F6 conflict
queue API. It is not a UI feature and not an automatic sync path.

The existing F6 API is:

```js
H2O.Studio.store.conflicts.ingestConflictCandidates(candidates, {
  source: "manual-devtools",
  reason,
  dryRun
});
```

Manual handoff flow:

1. Run F7 preview with `includeConflictCandidates: true`.
2. Manually select one or a small set of candidate objects from the latest
   preview result.
3. Run F6 dry-run ingestion.
4. Review the dry-run result.
5. Only after explicit approval, run the same call with `dryRun: false`.

No automatic ingestion is allowed.

```js
const preview = H2O.Studio.diagnostics.previewBidirectionalFolderMetadata({
  localFolders,
  remoteFolders,
  options: {
    includeConflictCandidates: true,
    conflictCandidateLimit: 5
  }
});

const candidate = preview.conflictCandidates.candidates[0];

await H2O.Studio.store.conflicts.ingestConflictCandidates([candidate], {
  source: "manual-devtools",
  reason: "manual F7 folder metadata preview handoff to F6 queue",
  dryRun: true
});
```

Only if explicitly approved later, the operator may run:

```js
await H2O.Studio.store.conflicts.ingestConflictCandidates([candidate], {
  source: "manual-devtools",
  reason: "manual F7 folder metadata preview handoff to F6 queue",
  dryRun: false
});
```

The candidate array lives under `preview.conflictCandidates.candidates`. There
is no top-level `preview.candidates` contract.

#### Candidate selection rules

- Select actual candidate objects from the latest preview output.
- Default manual selection is one candidate.
- Documentation examples should use at most five candidates.
- Operators should manually hand off no more than ten candidates at once.
- Do not add or use "enqueue all" helpers.
- Do not select by array index alone unless tied to a preview hash or token.
- Do not enqueue `delete-vs-edit-reference` candidates in F7.3.

#### Allowed conflict kinds

F7.3 may manually hand off only these conflict kinds:

- `same-record-divergent-metadata`
- `folder-identity-collision`
- `local-only-folder-metadata`
- `remote-only-folder-metadata`

The one-sided folder kinds are review-only. They must not imply create, delete,
rename, or apply behavior.

#### Blocked conflict kinds

F7.3 must not manually hand off:

- `delete-vs-edit-reference`
- Any candidate implying folder delete or metadata apply.
- Malformed candidates without safe dedupe material.
- Candidates with raw folder IDs, folder names, parent IDs, peer IDs, raw
  metadata, JSON blobs, titles, hrefs, prompts, messages, or content.

#### F6 dry-run validation

Before real ingestion, F6 dry-run must validate:

- `schema === "h2o.studio.sync-conflict-candidate.v1"`
- `source === "bidirectional-folder-preview"`
- `entityKind === "folder"`
- Allowed `conflictKind`.
- Allowed `classification`.
- Allowed `severity`.
- Safe `dedupeKeyHash`.
- No raw folder IDs.
- No folder names.
- No parent IDs.
- No peer IDs.
- No raw metadata.
- No JSON blobs.
- `previewSchema === "h2o.studio.sync.folder-metadata-preview.v1"` when
  present.
- Candidate count remains within the manual limit.
- No apply behavior.

#### Confirmation and audit model

For the docs-only/manual F7.3 protocol:

- `reason` is required for real ingest.
- Recommended reason is:
  `manual F7 folder metadata preview handoff to F6 queue`
- Future UI, if ever added, must require exact confirmation:
  `ENQUEUE FOLDER METADATA CONFLICTS`
- Durable audit is the F6 queue ingestion itself through pending conflict rows
  or duplicate sightings.
- F7.3 does not add a separate F7 audit table.

#### Forbidden behavior

F7.3 explicitly forbids:

- Automatic queue writes.
- "Enqueue all" behavior.
- Runner-triggered ingestion.
- Settings or public UI ingestion.
- Folder rename, delete, or color mutation.
- Native folder-state mutation.
- Chrome folder-state mutation.
- Desktop folder-state mutation.
- Sync apply or operation apply.
- F6 decision calls from F7.
- P8 renderer changes.

F5/F6 boundary:

- F5 owns delete, tombstone, and delete-vs-edit evidence.
- F7.3 must not hand F5-owned delete evidence into F6.
- F6 owns durable non-delete conflict queue rows and decisions.
- F7.3 documents manual submission only; it does not create a new queue owner.

Safety statement: F7.3 does not apply folder metadata. It only defines how
selected preview candidates may be manually handed to F6 for review.

Rejected helper design:

```js
H2O.Studio.diagnostics.enqueuePreviewCandidates(...)
```

This helper is rejected for F7.3 because it hides the manual F6 ingestion
boundary, increases auto-ingest risk, and can pollute the conflict queue with
preview noise.

A future `prepareBidirectionalConflictHandoff(...)` helper may be considered
only if it selects candidates, validates shape, returns selected candidates
only, does not ingest, does not call F6 store writes, and does not mutate local
or remote state.

### F7.4.0 Folder Metadata Color Apply Safety Contract

F7.4.0 is a documentation contract only. It does not authorize apply code,
runtime APIs, Rust commands, migrations, schema stamping, UI, settings, Chrome
storage mutation, import/export/sync behavior changes, or F5/F6 runtime
changes.

The first possible apply target is narrowed to one existing local folder row
and one non-structural scalar color field: `color` / `iconColor`. This proves
the gated audit and transaction machinery with lower risk than folder renames,
hierarchy changes, membership changes, or content changes.

Allowed scope:

- One existing local folder row.
- One local-only color metadata update.
- One non-structural scalar field: `color` / `iconColor`.

Deferred fields:

- `name`
- `parentId`
- `sortOrder`
- `icon`
- `kind`
- `source`
- `meta`
- `createdAt`
- `updatedAt`

Forbidden behavior:

- Folder creation.
- Folder deletion.
- FolderBinding or membership mutation.
- Chat or snapshot movement.
- Cascade behavior.
- Chrome storage mutation.
- Remote write-back.
- Automatic apply.
- Automatic merge.

For this contract, "apply folder.metadata" means updating exactly one allowed
scalar field on one existing local folder row after verifying that the selected
preview baseline still matches current local state, then recording audit. It
does not mean local-wins globally, remote-wins globally, bidirectional sync,
folder merge, create/delete, membership movement, or content sync.

Future real apply must require:

- Exact dev gate:
  `I_UNDERSTAND_THIS_APPLIES_ONE_FOLDER_METADATA_CHANGE`
- `dryRun: false`
- Non-empty reason.
- Local sync peer identity.
- Selected delta from a fresh preview.
- Current baseline hash equal to the expected preview baseline hash.
- Existing target folder row.
- Only allowlisted fields present.
- F5 tombstone/delete blockers absent.
- F6 conflict blockers absent or explicitly resolved.
- Transaction and audit.
- Affected row count exactly `1`.

Future API contract, for planning only:

```js
await H2O.Studio.diagnostics.applyBidirectionalFolderMetadata({
  dryRun: false,
  devGate: "I_UNDERSTAND_THIS_APPLIES_ONE_FOLDER_METADATA_CHANGE",
  reason: "operator approved one folder color update",
  previewToken,
  selectedDelta,
  expectedBaselineHash,
  expectedTargetHash
});
```

Implementation must be split into later phases:

- F7.4.1: dry-run apply plan only, zero writes.
- F7.4.2: audit/transaction proof.
- F7.4.3: real exact-gated color apply only.
- F7.4.4: consider `icon`, then `sortOrder`, then much later `name`.
- Keep `parentId` deferred until hierarchy and cycle validation exists.

Audit model:

- Prefer existing maintenance/audit infrastructure if it can record this safely.
- Record operation `folder-metadata-apply`.
- Record policy version.
- Record reason.
- Record operator sync peer identity presence.
- Record selected field names.
- Record before/after hashes.
- Record preview token/hash.
- Record rows updated.
- Record blockers/warnings.
- Do not return raw folder names, raw IDs, raw metadata, or raw peer IDs.

Future real apply must be one transaction:

```sql
BEGIN;
  INSERT audit pending row;
  SELECT current folder row;
  verify current hash == expectedBaselineHash;
  verify F5 blockers absent;
  verify F6 blockers absent or resolved;
  UPDATE folders SET color = ? WHERE id = ?;
  verify affected rows == 1;
  UPDATE audit row success;
COMMIT;
```

Rollback on audit failure, stale baseline, tombstone blocker, F6 blocker, SQL
failure, or affected-row mismatch.

F5 must block apply for active folder tombstones, delete-vs-edit evidence,
cascade delete evidence, or unresolved delete review. F7 must not override F5.

F6 must block apply for matching pending conflicts, accepted-later conflicts,
unresolved preview candidates, or cases where an explicit resolved decision is
required but absent. F7 must not bypass F6.

Schema and stamping decision:

- Fresh baseline hash is enough for dry-run planning.
- Fresh baseline hash may be enough for a tightly gated local-only color apply.
- Fresh baseline hash is not enough for broader metadata apply or remote
  propagation.
- Do not add general watermark or stamping columns yet.
- Decide audit/stamping requirements before F7.4.3 real apply.

Planned result shape:

```js
{
  schema: "h2o.studio.sync.folder-metadata-apply.v0",
  ok: true,
  dryRun: false,
  redacted: true,
  applied: true,
  entityKind: "folder.metadata",
  fieldsUpdated: ["color"],
  audit: {
    recorded: true,
    operatorPeerRecorded: true
  },
  counts: {
    rowsUpdated: 1
  },
  blockers: [],
  warnings: []
}
```

Redaction policy for apply results:

- Never return folder name, folder ID, parent ID, raw metadata, raw JSON, peer
  IDs, or unsafe raw hashes.
- Treat raw color/icon values as sensitive unless a later exact-gated
  diagnostic mode authorizes them.
- Return only field names, booleans, counts, code-level blockers, and audit
  presence.

Future validation must prove wrong gate blocks, missing reason blocks, dry-run
writes zero rows, stale preview hash blocks, tombstone evidence blocks, pending
F6 conflict blocks, forbidden fields reject, single color update succeeds,
folderBinding rows remain unchanged, chat/snapshot rows remain unchanged, audit
persists, rollback works, no Chrome storage mutation occurs, no
import/export/sync behavior changes, and redaction passes.

F7.4.0 risk table:

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Silent overwrite | High | Fresh baseline hash, exact gate, transaction |
| Hierarchy corruption | High | Defer `parentId` until hierarchy validation exists |
| Semantic rename mistake | Medium | Defer `name` until later validated phase |
| F5 delete bypass | High | Mandatory tombstone/delete blocker checks |
| F6 conflict bypass | High | Require no pending/accepted-later conflict or explicit resolved state |
| Audit gap | High | Require audit before real apply |
| Operator confusion | Medium | Dry-run-first split, exact gate, field-limited result |

The next phase should be F7.4.1 dry-run apply plan only. Do not implement real
apply yet, and do not add schema/stamping unless F7.4.1 proves it is needed.

### F7.4.1b Folder Metadata Apply Dry-Run Plan

F7.4.1b adds a pure dry-run helper:

```js
H2O.Studio.diagnostics.planBidirectionalFolderMetadataApply({
  dryRun: true,
  entityKind: "folder.metadata",
  field: "color",
  selectedDelta,
  expectedBaselineHash,
  expectedTargetHash,
  reason: "operator wants to preview one folder color apply",
  checks: {
    targetFolderExists: true,
    baselineHashMatches: true,
    f5BlockersAbsent: true,
    f6BlockersAbsent: true
  }
});
```

This helper performs no live local folder reads, no F5 reads, no F6 reads, no
audit commit, and no folder mutation. It uses only simulated or caller-provided
checks. If any required check is missing or false, `applyable` is `false`.

F7.4.1b input requirements:

- `dryRun` must be `true`; otherwise `dry-run-required` blocks.
- `entityKind` must be `folder.metadata`.
- `field` must be `color` or `iconColor`.
- `selectedDelta` must be present, but is never returned.
- `expectedBaselineHash` must be present.
- `expectedTargetHash` must be present.
- `reason` is optional for dry-run, but if provided must be a safe string.

F7.4.1b allowlists only `color` and `iconColor`. `name`, `parentId`,
`sortOrder`, `icon`, `kind`, `source`, `meta`, `createdAt`, `updatedAt`, and
all other fields return `field-not-allowlisted`.

Required simulated checks:

- `targetFolderExists === true`
- `baselineHashMatches === true`
- `f5BlockersAbsent === true`
- `f6BlockersAbsent === true`

Missing or failed checks return conservative blockers such as
`target-folder-not-verified`, `baseline-hash-not-verified`,
`f5-blocker-check-unavailable`, `f5-blocker-present`,
`f6-blocker-check-unavailable`, or `f6-blocker-present`.

F7.4.1b result shape:

```js
{
  schema: "h2o.studio.sync.folder-metadata-apply-plan.v0",
  ok: true,
  dryRun: true,
  redacted: true,
  writesPerformed: 0,
  wouldMutateOnApply: true,
  applyable: true,
  entityKind: "folder.metadata",
  allowedFields: ["color", "iconColor"],
  selectedField: "color",
  checks: {
    targetFolderExists: true,
    baselineHashMatches: true,
    f5BlockersAbsent: true,
    f6BlockersAbsent: true,
    fieldAllowlisted: true
  },
  plannedMutation: {
    type: "folder.metadata.color",
    rowsWouldUpdate: 1
  },
  blockers: [],
  warnings: []
}
```

The dry-run output remains redacted. It never returns the folder name, folder
ID, parent ID, raw color/icon value, raw metadata, peer IDs, raw JSON, selected
delta contents, or raw hashes. It returns only field names, booleans, counts,
blocker codes, and planned mutation type.

F7.4.1c may later inspect and integrate live read-only local/F5/F6 check
surfaces. F7.4.1b intentionally does not do that.

### F7.4.1c Live Read-Only Apply Checks

F7.4.1c adds a thin Desktop/Tauri read layer around
`planBidirectionalFolderMetadataApply(...)`. The pure F7.4.1b planner remains
the authoritative planner. If `refreshLocalState !== true`, behavior is
unchanged and caller-provided simulated checks are used.

When `refreshLocalState === true`, the wrapper performs only read-only checks:

- `H2O.Studio.store.folders.get(targetFolderId)` confirms the target folder
  exists.
- The current folder row is normalized with the same folder metadata hash
  fields used by F7 preview, then compared with `expectedBaselineHash`.
- `H2O.Studio.store.tombstones.getTombstone("folder", "folder:" +
  encodeURIComponent(targetFolderId))` checks for an active local folder
  tombstone.

The wrapper accepts `selectedDelta.targetFolderId` as sensitive input only. The
target folder ID, folder name, parent ID, raw color/icon value, raw metadata,
raw hashes, tombstone IDs, conflict IDs, peer IDs, and raw JSON are never
returned.

F7.4.1c initially could not prove F6 blockers absent because the conflict store
did not expose a precise read-only lookup by candidate/dedupe hash. That gap is
closed in F7.4.1d/F7.4.1e by adding and consuming a redacted F6 dedupe
diagnostic.

Additional live-check blockers:

- `target-folder-id-required`
- `local-folder-read-unavailable`
- `baseline-hash-mismatch`
- `baseline-hash-check-unavailable`
- `f5-folder-tombstone-present`
- `f5-blocker-check-unavailable`
- `f6-blocker-check-unavailable`
- `live-read-check-failed`

Result shape remains the F7.4.1b plan shape with `checkMode:
"live-read-only"`. `writesPerformed` remains `0`. The wrapper must not call
folder mutation methods, F5 apply/cleanup methods, F6 ingest/decision methods,
Chrome storage mutation, import/export/sync mutation paths, Rust commands, or
schema migrations.

### F7.4.1d Read-Only F6 Dedupe Blocker Lookup

F7.4.1d adds the F6-owned read-only diagnostic method:

```js
await H2O.Studio.store.conflicts.diagnoseConflictByDedupeKeyHash(dedupeKeyHash);
```

The method answers whether an existing `sync_conflicts` row for a safe
candidate `dedupeKeyHash` blocks future folder color apply planning. It accepts
only the safe candidate hash and internally looks up the persisted F6 key as
`candidate-hash:` plus that hash. It never returns the input hash, stored dedupe
key, conflict ID, record ID, peer ID, summaries, folder names, raw JSON, or
content.

The lookup is diagnostic only. It performs a read-only conflict-store lookup and
returns redacted status, decision presence/code, classification, severity,
`found`, `blocksApply`, and blocker/warning codes. It does not call F6
ingestion, F6 decision actions, F5 APIs, folder mutation paths, import/export,
sync, Chrome storage, merge, apply, or write-back behavior.

Blocking policy:

- `pending` blocks with `f6-conflict-pending`.
- `accepted-later` blocks with `f6-conflict-accepted-later`.
- `ignored` and `rejected` do not block only when their expected decision code
  is present.
- F5-owned rows, including `delete-vs-edit-reference`,
  `delete-vs-edit-owned-by-f5`, and `resolved-owned-by-f5`, block with
  `f6-conflict-owned-by-f5` unless clearly ignored or rejected.
- `blocked-unsupported` blocks with `f6-conflict-blocked-unsupported`.
- Ambiguous resolved rows block with `f6-conflict-resolution-ambiguous`.
- Unknown statuses block with `f6-conflict-status-unknown`.
- `resolved-no-action-needed` and `resolved-duplicate` do not block.
- `resolved-local-wins`, `resolved-remote-wins`, and
  `resolved-manual-merge` do not block this diagnostic, but they remain labels
  only and may return a warning.
- `superseded` does not block and returns a warning.

F7.4.1d itself does not wire this lookup into
`folder-metadata-apply-checks.tauri.js`; it only adds the F6-owned diagnostic
surface.

### F7.4.1e F6 Dedupe Diagnostic Wiring

F7.4.1e wires the read-only F6 dedupe diagnostic into the Desktop/Tauri folder
metadata apply live-check wrapper. The pure dry-run planner remains unchanged.

When `refreshLocalState === true` and `checkF6Blockers === true`, the wrapper
extracts a safe candidate hash from:

```js
selectedDelta.dedupeKeyHash
selectedDelta.conflictCandidate?.dedupeKeyHash
selectedDelta.candidate?.dedupeKeyHash
```

If no safe hash is available, the wrapper returns
`f6-dedupe-key-hash-required`, sets `f6BlockersAbsent` false, and keeps
`applyable` false. The hash is sensitive input only and is never returned.

If a hash is present, the wrapper calls only:

```js
H2O.Studio.store.conflicts.diagnoseConflictByDedupeKeyHash(dedupeKeyHash)
```

The wrapper consumes only `found`, `blocksApply`, `blocker.code`, and code-level
warnings. It does not duplicate the F6 status/decision matrix. If the
diagnostic is unavailable or fails, applyability remains false. If the
diagnostic finds no blocking conflict and all other live checks pass,
`f6BlockersAbsent` may be true and the dry-run plan may become applyable.

F7.4.1e still performs no writes. It must not call F6 ingestion, F6 decision
actions, F5 mutation APIs, folder mutation methods, Chrome storage mutation,
import/export/sync mutation paths, merge, apply, or write-back behavior.

### F7.4.2a In-Memory Folder Color Apply Transaction Proof

F7.4.2a adds a Rust test-only transaction proof for the future local
`folder.metadata.color` apply sequence. It does not expose a Tauri command,
does not register a JavaScript API, and does not open the production Desktop
SQLite database.

The proof uses `sqlite::memory:` and synthetic tables that mirror only the
minimum future transaction shape:

- `folders(id, color, updated_at, meta_json)`
- `sync_maintenance_log(...)` matching the existing audit table columns needed
  for an audit insert and result update

The transaction shape exercised by tests is:

```txt
BEGIN
  insert redacted audit row
  read current folder row
  verify expected baseline hash
  map color/iconColor to folders.color
  simulate UPDATE folders SET color = ?, updated_at = ?
  verify affected row count == 1
  update audit result_json with redacted proof counts
ROLLBACK
  verify folder and audit snapshots match the pre-transaction state
```

Allowed field policy remains narrow:

- `color`
- `iconColor` as an alias for the same `folders.color` column

The proof rejects `name`, `parentId`, `sortOrder`, `icon`, `kind`, `source`,
`meta`, `createdAt`, `updatedAt`, and any other field. It also rejects missing
or stale baseline hashes.

F7.4.2a models only transaction mechanics. It does not call F5 APIs, F6 APIs,
folder stores, import/export/sync code, Chrome storage, or apply/write-back
paths. F5/F6 blockers are assumed to have been checked by earlier dry-run
planning; future real apply phases must re-check them immediately before or
inside the real transaction.

The proof result is redacted and test-facing only. It returns schema, booleans,
field name, proof step flags, blocker codes, and write counts. It must not
return folder IDs, folder names, parent IDs, raw color/icon values, raw hashes,
raw metadata, peer IDs, tombstone IDs, conflict IDs, raw JSON, or content.

F7.4.2a proves:

- success path rolls back with no committed writes
- `color` and `iconColor` are the only accepted fields
- stale baseline hash blocks
- audit insert failure rolls back
- affected-row mismatch rolls back
- audit update failure rolls back
- post-rollback folder/audit snapshots match the pre-transaction state
- no production apply API exists

It does not authorize a real DB rollback proof or real apply. Those remain
separate later phases.

### F7.4.2b Real DB Folder Color Apply Rollback Proof

F7.4.2b adds a narrow Rust/Tauri diagnostic command:

```txt
prove_folder_metadata_color_apply_rollback
```

The command runs the future local `folder.metadata.color` apply transaction
shape against the loaded Desktop SQLite DB, then always rolls back and verifies
that no folder or audit state persisted. It is a proof command, not an apply
command.

The command requires:

- `dryRun: true`
- exact gate:
  `I_UNDERSTAND_THIS_RUNS_A_REAL_DB_ROLLBACK_PROOF_FOR_FOLDER_METADATA`
- sensitive input `targetFolderId`
- field `color` or `iconColor`
- a planned target color value, either directly or from selected delta input
- `expectedBaselineHash` from the F7.4.1 live check hash algorithm
- non-empty `reason`
- local sync peer identity
- prior F7.4.1e plan proof showing `ok`, `applyable`, `dryRun`, and
  `writesPerformed: 0`

The command does not expose a JavaScript wrapper or UI. It is available only as
a Tauri diagnostic command and returns a redacted proof result.

The transaction shape is:

```txt
BEGIN
  insert redacted sync_maintenance_log row
  read current folder row by sensitive target ID
  verify normalized current folder hash equals expectedBaselineHash
  map color/iconColor to folders.color
  simulate UPDATE folders SET color = ?, updated_at = ?
  verify affected row count == 1
  update sync_maintenance_log.result_json with redacted proof flags
ROLLBACK
  re-read folder state
  verify target folder hash unchanged
  verify folder and audit row counts unchanged
  verify the proof audit row did not persist
```

The audit row exists only inside the rolled-back transaction:

- operation: `folder-metadata-color-apply-rollback-proof`
- policy version: `h2o.studio.sync.folder-metadata-apply.v0`
- `dry_run: 1`
- redacted result JSON only

The result reports schema, proof flags, field name, row-count booleans,
`writesCommitted: 0`, blocker codes, and warnings. It must not return folder
IDs, folder names, parent IDs, raw color/icon values, raw hashes, raw metadata,
peer IDs, audit row IDs, conflict IDs, tombstone IDs, raw JSON, or content.

F7.4.2b proves:

- wrong gate blocks before a transaction
- missing reason blocks before a transaction
- non-allowlisted fields block before a transaction
- stale baseline blocks and rolls back
- missing folder blocks and rolls back
- affected-row mismatch rolls back
- audit insert and audit update failures roll back
- folder state is unchanged after proof
- audit row is not persisted
- row counts are unchanged
- no real apply API exists

F7.4.2b does not call F5 mutation APIs, F6 mutation APIs, folder stores,
Chrome storage, import/export/sync mutation paths, merge, apply, or write-back
behavior. F5/F6 blockers remain preconditions from F7.4.1e; a future real
apply phase must re-check F5/F6 immediately before or inside its transaction.

### F7.4.3 Exact-Gated Local Folder Color Apply

F7.4.3 adds the first real F7 mutation path. It is intentionally narrow:

```txt
one existing local folder -> folders.color -> one transaction -> one audit row
```

The Rust/Tauri command is:

```txt
apply_folder_metadata_color
```

The Desktop facade is narrowly named:

```js
H2O.Studio.diagnostics.applyBidirectionalFolderMetadataColor(...)
```

No generic apply, resolver, local-wins, remote-wins, merge, sync propagation, or
Chrome write-back API is introduced.

The command requires:

- `dryRun: false`
- exact gate: `I_UNDERSTAND_THIS_APPLIES_ONE_LOCAL_FOLDER_COLOR_CHANGE`
- sensitive input `targetFolderId`
- field `color` or `iconColor`; `iconColor` maps to the same `folders.color`
  column
- target color value from direct input or selected delta
- `expectedBaselineHash` from the F7.4.1 live check hash algorithm
- optional `expectedTargetHash`
- non-empty `reason`
- local sync peer identity
- safe `dedupeKeyHash` for F6 blocker re-check
- successful F7.4.1e plan proof showing `ok`, `applyable`, and
  `writesPerformed: 0`

The transaction shape is:

```txt
BEGIN
  insert sync_maintenance_log audit row
  read current folder row by sensitive target ID
  verify normalized current folder hash equals expectedBaselineHash
  verify target hash if supplied
  re-check F5 tombstone/delete blockers
  re-check F6 conflict blockers by safe dedupeKeyHash
  UPDATE folders SET color = ?, updated_at = ? WHERE id = ?
  verify affected row count == 1
  update sync_maintenance_log.result_json with redacted success flags
COMMIT
```

The command rolls back on wrong gate, `dryRun` not false, missing reason,
missing identity, unsupported field, missing folder, stale baseline hash,
target hash mismatch, F5 blocker, F6 blocker, audit insert failure, affected
row mismatch, audit update failure, SQL error, or commit failure.

F5 re-checks are read-only and block on active folder tombstone, cascade delete
evidence, or unresolved folder delete review. F6 re-checks are read-only and
use the same dedupe-key status/decision blocking matrix as the F6 diagnostic.
F7.4.3 does not mutate F5 or F6 rows.

On success, exactly one `sync_maintenance_log` row persists:

- operation: `folder-metadata-color-apply`
- policy version: `h2o.studio.sync.folder-metadata-apply.v0`
- `dry_run: 0`
- operator peer identity recorded in the audit column
- redacted result JSON with field names, hash-presence booleans, rows updated,
  F5/F6 check booleans, `localOnly: true`, and `syncPropagated: false`

The result is redacted and returns only schema, booleans, field names, audit
presence, row counts, blocker codes, and warnings. It must not return folder
IDs, folder names, parent IDs, raw color/icon values, raw hashes, raw metadata,
peer IDs, audit row IDs, conflict IDs, tombstone IDs, dedupe keys, raw JSON, or
content.

F7.4.3 remains local-only. It does not create folders, delete folders, move
folder membership, mutate folder bindings, mutate chats/snapshots/content,
write Chrome storage, export/import/sync, auto-merge, resolve conflicts, or
propagate the color change to another peer.

### F7.4.3 Live Validation Harness

Because the terminal cannot execute JavaScript inside the Tauri WebView, live
validation uses a dormant Desktop-only harness:

```js
H2O.Studio.devValidation.f7FolderColorApplyValidation.run()
H2O.Studio.devValidation.f7FolderColorApplyValidation.lastResult()
H2O.Studio.devValidation.f7FolderColorApplyValidation.clearLastResult()
```

The harness is debug validation only. It has no public UI, does not run on
boot, and is not registered for Chrome. It calls only the public Studio APIs:

- `H2O.Studio.diagnostics.planBidirectionalFolderMetadataApply(...)`
- `H2O.Studio.diagnostics.applyBidirectionalFolderMetadataColor(...)`
- read-only folder/chat/snapshot store methods where available

The harness selects a safe existing folder, computes the same F7 normalized
folder metadata hashes used by the live apply planner, runs the live dry-run
plan, verifies wrong-gate rejection, performs one exact-gated local color
apply, verifies stale-baseline rejection, and restores the original color via
the same exact-gated public apply path when the original color is non-empty and
the restore plan is applyable.

The harness output is redacted. It returns only booleans, counts, step flags,
and blocker/warning codes. It must not return folder IDs, folder names, parent
IDs, raw color values, raw hashes, peer IDs, audit IDs, conflict IDs, tombstone
IDs, dedupe keys, raw metadata, raw JSON, or content.

It does not use direct SQL, generic Tauri invocation shortcuts, Rust-only
validation shortcuts, import/export/sync paths, F5/F6 mutation APIs,
folderBinding/chat/snapshot mutation paths, Chrome storage, merge, resolver, or
write-back behavior.

### F7.4.3a Hash Canonicalization Parity

F7.4.3a keeps the F7.4.3 apply scope unchanged and fixes only baseline hash
parity between the JavaScript dry-run/live-check path and the Rust apply
transaction path.

Folder metadata hashes canonicalize empty parent folder identity as the empty
string `""`. These input forms must hash identically:

- missing parent field
- `parentId: null`
- `parentId: ""`
- `parentFolderId: null`
- `parentFolderId: ""`
- `parent_id: null`
- `parent_id: ""`

The rule matches the current Desktop DB shape, where root folders may persist
`parent_id` as an empty string. It does not expose parent IDs, raw hashes, or
new fields, and it does not weaken the Rust transaction baseline check.

Potential blocker codes:

- `watermark-unavailable`
- `peer-sequence-unavailable`
- `local-comparison-unavailable`
- `remote-comparison-unavailable`
- `folder-metadata-digest-unavailable`
- `delete-vs-edit-owned-by-f5`
- `conflict-queue-owned-by-f6`
- `unsupported-entity-kind`
- `schema-stamping-required`
- `preview-only-no-apply`

## 8. Redaction Policy

Default F7 diagnostics must not expose:

- Raw peer IDs.
- Raw folder IDs.
- Folder names.
- Chat titles.
- Snapshot titles.
- Hrefs or URLs.
- Raw JSON.
- Dedupe keys.
- Chat bodies.
- Snapshot bodies.
- Prompt or answer text.
- Metadata blobs.

Default output should use counts, booleans, code-level classifications, entity
kind labels, and severity buckets. If a future sensitive mode is needed, it
must be Desktop/debug-only, exact-gated, and separately planned.

## 9. Risks And Mitigations

- Silent overwrite: keep F7.1 preview-only and require explicit later apply
  phases for any mutation.
- Timestamp false confidence: use timestamps only as evidence; do not use them
  as winner authority.
- Conflict noise: start with `folder.metadata` and counts-only reporting
  before expanding entity kinds.
- F5/F6 overlap: route delete evidence to F5 and non-delete conflicts to F6.
- Chrome/Desktop drift: compare what both peers already emit before adding
  schema or Chrome digest emitters.
- Schema overreach: do not add stamping or watermark columns until F7.1a
  inspection proves they are needed.
- Accidental auto-sync: do not wire preview into boot, auto-export,
  folder-sync, import, export, peer transport, or public UI.
- Redaction leak: expose no names, IDs, content, raw JSON, or dedupe material
  by default.

## 10. Revised Roadmap

- F7.0: Docs-only bidirectional preview safety model.
- F7.1a: Inspect available folder metadata, digest, sequence, peer mirror, and
  watermark inputs. The inspection found enough existing metadata for preview
  diagnostics, but not enough durable evidence for apply/write-back.
- F7.1b: Preview-only `folder.metadata` comparator helper. It compares and
  classifies existing evidence, returns redacted counts, and performs no
  writes, apply, merge, or F6 ingestion.
- F7.1c: Add stamping/watermark schema only if F7.1a proves it is required.
- F7.2: Emit F6-compatible candidate summaries from preview, with no
  ingestion.
- F7.3: Explicit manual handoff to F6 conflict queue.
- F7.4: Exact-gated local folder color apply, live-validated.
- F8+: Remote apply propagation gates.
- F9/F10/F11: Mobile and cloud/WebDAV/native transport later.

This roadmap does not authorize schema stamping, broad write-back, merge, or
remote propagation. Those remain separate later phases.

## 11. F7.4 Closeout

F7.4 is complete and live-validated. It proves the first exact-gated local
folder metadata mutation path end-to-end:

- Dry-run live plan returned `applyable: true`.
- Wrong gate blocked.
- Real exact-gated apply succeeded with `rowsUpdated: 1`.
- Result remained `localOnly: true` and `syncPropagated: false`.
- Stale baseline retry blocked.
- Restore through the same exact-gated path succeeded.
- Audit rows persisted.
- Folder, folderBinding, chat, and snapshot counts remained unchanged.
- Redaction passed.

The validated mutation boundary is intentionally narrow:

- One existing local folder row.
- `folders.color` only.
- `iconColor` is accepted only as an input alias that maps to `folders.color`.
- Exact gate is required.
- Non-empty reason and local sync peer identity are required.
- Baseline hash is required and rechecked.
- F5 tombstone/delete blockers must be absent.
- F6 non-delete conflict blockers must be absent.
- One audit row is required for each successful local color apply.

F7.4 still forbids:

- `name`.
- `parentId`.
- `sortOrder`.
- `icon`, except the `iconColor` input alias to `folders.color`.
- `kind`, `source`, `meta`, `createdAt`, and `updatedAt`.
- FolderBinding or membership mutation.
- Folder creation or deletion.
- Chrome storage mutation.
- Remote write-back or sync propagation.
- Auto-merge, resolver behavior, or local-wins/remote-wins policy.
- Chat, snapshot, attachment, prompt, answer, transcript, or content mutation.

The next major phase is F8 planning for remote apply propagation gates. F7.4
does not authorize F8 implementation.

## 12. Recommendation

After F7.1b, the next step should be validation of the preview helper against
known local/remote folder fixtures. Do not start F7.1c stamping, F7.2 F6
candidate emission, or any apply/write-back path without a separate plan.
