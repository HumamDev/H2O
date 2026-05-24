# F8 Remote Apply Propagation Safety Model

## Executive Summary

F8 defines how a local audited apply can become cross-peer evidence later. It
does not authorize remote mutation, Chrome mutation, automatic propagation,
merge, or expanded apply scope.

The first safe boundary is:

```txt
local audited apply row -> redacted apply-event evidence -> remote dry-run preview
```

F8 starts with evidence and preview only. A local apply is not remote authority,
and no peer should treat it as a command.

## Propagation Meaning

For F8, propagation means exporting and consuming evidence that a local
exact-gated apply occurred.

Propagation must not mean:

- Writing to another peer.
- Updating Chrome storage.
- Syncing folder color automatically.
- Treating the local apply as remote authority.
- Creating a remote mutation queue without explicit gates.
- Running background bidirectional sync.

## Source Of Truth

The source apply evidence is the persisted `sync_maintenance_log` audit row
created by F7.4.3.

The audit row proves:

- A local exact-gated apply happened.
- The local apply used the F7.4 policy version.
- The local apply was audited.

The audit row does not prove:

- Another peer should accept the change.
- The remote baseline still matches.
- The event is safe to replay.
- The event is a command.

## Export Model

Future F8.1 may export redacted apply-event evidence only. The event should be
derived from audited local apply rows, not from unaudited local state.

Proposed event shape:

```js
{
  schema: "h2o.studio.sync.apply-event.v0",
  operation: "folder-metadata-color-apply",
  entityKind: "folder.metadata",
  fieldsUpdated: ["color"],
  policyVersion: "h2o.studio.sync.folder-metadata-apply.v0",
  sourcePeerPresent: true,
  appliedAtPresent: true,
  beforeHashPresent: true,
  afterHashPresent: true,
  auditRecorded: true,
  redacted: true
}
```

Default export must not include:

- Raw folder ID.
- Folder name.
- Raw color value.
- Parent ID.
- Raw peer ID.
- Raw hashes unless separately proven safe.
- Raw audit JSON.
- Chat, snapshot, prompt, answer, transcript, or content fields.

## F8.1 Exported Apply-Event Evidence

F8.1 adds a redacted `syncApplyEvents` section to the Desktop export bundle.
It is export evidence only: importers must not treat the section as a remote
apply command.

The exporter reads `sync_maintenance_log` and exports only successful committed
F7.4.3 local folder color apply rows:

- `operation === "folder-metadata-color-apply"`.
- `policy_version === "h2o.studio.sync.folder-metadata-apply.v0"`.
- `dry_run === 0`.
- `result_json.rowsUpdated === 1`.
- `result_json.localOnly === true`.
- `result_json.syncPropagated === false`.
- `result_json.fieldsUpdated` contains only `"color"`.

The exporter skips failed rows, rollback proofs, dry-run proofs, synthetic
maintenance rows, malformed rows, and ambiguous rows.

Bundle section shape:

```js
{
  syncApplyEvents: {
    schema: "h2o.studio.sync.apply-events.v0",
    redacted: true,
    available: true,
    total: 0,
    byOperation: {},
    capped: false,
    limit: 50,
    skippedMalformed: 0,
    events: []
  }
}
```

If the audit log is unavailable, normal export continues with
`available: false`, zero events, and an
`apply-event-audit-log-unavailable` warning.

Each event is redacted and includes an `eventDigest` computed from internal
audit material for future dedupe/replay handling. The digest inputs are not
exported. F8.1 does not export raw folder IDs, folder names, parent IDs, raw
color values, peer IDs, raw before/after hashes, audit row IDs, raw audit JSON,
conflict IDs, tombstone IDs, or metadata JSON.

## F8.2 Remote Apply-Event Preview

F8.2 adds a pure preview helper:

```js
H2O.Studio.diagnostics.previewRemoteApplyEvents({
  bundle,
  includeEventSamples: false,
  eventSampleLimit: 20
});
```

The helper validates and summarizes `bundle.syncApplyEvents` only. It performs
no import behavior, remote apply, Chrome storage mutation, Desktop mutation,
F5 mutation, F6 ingestion, or F7 apply call.

Validation accepts only redacted F8.1 folder color apply events:

- `schema === "h2o.studio.sync.apply-event.v0"`.
- `operation === "folder-metadata-color-apply"`.
- `entityKind === "folder.metadata"`.
- `fieldsUpdated` is exactly `["color"]`.
- `policyVersion === "h2o.studio.sync.folder-metadata-apply.v0"`.
- `redacted === true`.
- `auditRecorded === true`.
- `eventDigest` is present as a safe digest string.

Unsupported, malformed, non-redacted, sensitive, or duplicate events are counted
only. Duplicate detection uses `eventDigest` internally; repeated digests do
not increase proposed remote apply counts.

F8.2 deliberately does not resolve a remote folder target. F8.1 events do not
carry a safe target handle, so otherwise valid events are counted as blocked
with `target-handle-unavailable` / `target-resolution-not-implemented`.

Default output is counts-only. Optional samples are capped, redacted, and do
not include the actual `eventDigest`.

## F8.3 Remote Apply-Event Conflict Candidates

F8.3 extends the pure preview helper with optional F6-shaped conflict candidate
evidence:

```js
H2O.Studio.diagnostics.previewRemoteApplyEvents({
  bundle,
  includeConflictCandidates: true,
  conflictCandidateLimit: 20
});
```

Candidate counts are always included. The redacted `candidates` array is
returned only when `includeConflictCandidates === true`; the default cap is 20
and the hard cap is 50.

F8.3 generates candidate evidence only for valid, non-duplicate remote apply
events blocked by missing target handles. It does not generate candidates for
duplicate events, malformed events, unsupported fields or operations,
sensitive-field-rejected events, or delete/tombstone/delete-vs-edit evidence.

Candidate shape:

```js
{
  schema: "h2o.studio.sync-conflict-candidate.v1",
  conflictKind: "local-comparison-unavailable",
  entityKind: "folder",
  classification: "local-comparison-unavailable",
  severity: "info",
  source: "remote-apply-event-preview",
  dedupeKeyHash: "...",
  localUpdatedAtPresent: false,
  remoteUpdatedAtPresent: false,
  localDigestPresent: false,
  remoteDigestPresent: false,
  warnings: [{ code: "target-handle-unavailable" }]
}
```

The `dedupeKeyHash` is computed from internal redacted evidence, including the
source apply event digest, operation, entity kind, fields, and blocker code.
The raw event digest and digest inputs are never returned. F8.3 does not call
F6 ingestion, does not write `sync_conflicts`, does not resolve targets, and
does not apply remote changes.

## Remote Receive Model

When another peer sees an apply event, it must treat the event as evidence
only.

Remote receive flow:

- Validate schema, policy version, entity kind, and field allowlist.
- Confirm the event is redacted and audited.
- Recompute current remote folder metadata hash if target identity can be
  safely resolved.
- If the remote baseline matches and blockers are absent, produce a remote
  apply preview.
- If non-delete metadata diverges, produce F6-compatible conflict candidate
  counts or candidates in a later phase.
- If delete or tombstone evidence exists, route the case to F5.
- Perform zero writes.

No F8 receive path may mutate another peer.

## F5/F6 Integration

F8 must preserve existing ownership boundaries:

- F5 owns tombstone, delete, cascade-delete, and delete-vs-edit evidence.
- F6 owns non-delete conflict queue rows and decisions.
- F8 must not bypass F5 or F6.
- F8 preview may later generate F6-shaped candidate evidence.
- F8 must not auto-ingest into F6.
- F8 must not mutate F5 or F6 state.

## Gate Model

Any future remote apply must require:

- Redacted local apply event.
- Matching policy version.
- Allowed entity kind, initially `folder.metadata`.
- Allowed field, initially `color`; `iconColor` may remain an input alias to
  color if needed.
- Remote baseline hash match.
- No F5 blockers.
- No F6 blockers.
- Exact destructive gate before mutation.
- Audit on the remote peer.
- Transaction and rollback guarantees.

These gates are planning requirements only. F8.0 does not implement them.

## Preview Report Shape

Future remote propagation preview should be dry-run, redacted, and counts-first:

```js
{
  schema: "h2o.studio.sync.remote-apply-propagation-preview.v0",
  ok: true,
  dryRun: true,
  redacted: true,
  writesPerformed: 0,
  sourceApplyEvents: { total: 0 },
  proposedRemoteApplies: { total: 0, blocked: 0 },
  conflictCandidates: { total: 0 },
  tombstoneReferences: { total: 0 },
  blockers: [],
  warnings: []
}
```

The report must not expose raw folder IDs, names, colors, peer IDs, raw hashes,
raw audit JSON, or content.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Silent remote overwrite | Start with evidence and dry-run preview only; require exact gate before any future remote mutation. |
| Stale remote baseline | Recompute remote baseline and require hash match before any future apply. |
| Audit event replay | Treat events as evidence, add dedupe/replay guards before handoff or apply. |
| Duplicate propagation | Count and dedupe events before producing previews. |
| F5/F6 bypass | Route delete evidence to F5 and non-delete divergence to F6. |
| Data leakage | Export only redacted booleans, enum codes, field names, and presence flags. |
| Propagation loop | Mark apply events as evidence, not commands, and track source/direction in later phases. |
| Wrong peer or entity apply | Require policy, entity, field, identity, and baseline gates before any future mutation. |

## Roadmap

- F8.0: Docs-only remote apply propagation safety model.
- F8.1: Export redacted apply-event evidence only.
- F8.2: Remote apply-event preview only.
- F8.3: F6 candidate generation from propagation conflicts, no ingestion.
- F8.4: Exact-gated remote apply proof much later.
- F9: Mobile read-only peer after F8 basics.

## Recommendation

The next implementation after F8.0 should be F8.1 apply-event export evidence
only. Do not implement remote write-back, remote apply, background propagation,
or Chrome mutation yet.
