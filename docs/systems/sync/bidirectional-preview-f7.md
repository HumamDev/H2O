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
  watermark inputs.
- F7.1b: Add preview-only comparator only if existing data is enough.
- F7.1c: Add stamping/watermark schema only if F7.1a proves it is required.
- F7.2: Emit F6-compatible candidate summaries from preview, with no
  ingestion.
- F7.3: Explicit manual handoff to F6 conflict queue.
- F7.4+: Gated single-entity apply prototype much later.
- F8+: Remote apply propagation gates.
- F9/F10/F11: Mobile and cloud/WebDAV/native transport later.

This roadmap does not authorize F7.1 implementation. The next step after F7.0
is inspection only.

## 11. Recommendation

The next phase should be F7.1a inspection, not bidirectional preview
implementation.

F7.1a should answer:

- Which `folder.metadata` fields are currently present in Desktop local state?
- Which `folder.metadata` fields are currently present in exported Chrome-
  importable bundles?
- Which peer identity, export sequence, per-peer mirror, and watermark evidence
  is already available to the comparator?
- Whether stable metadata digests can be computed from existing data without
  exposing names or raw IDs.
- Whether missing evidence should block preview or justify a later schema
  proposal.

Do not implement bidirectional preview until those available state and digest
inputs are inspected and documented.
