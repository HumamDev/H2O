# F5H.5 Peer Watermark Lifecycle Model

## Purpose

F5H.5 defines the peer watermark model required before destructive tombstone
lifecycle actions can be considered. It is a documentation contract only. It
does not add schema, stores, migrations, cleanup, archive, purge, compaction,
or sync behavior.

Watermarks are required before operations that intentionally forget or rewrite
real user evidence, including:

- purge
- archive
- destructive compaction
- non-synthetic cleanup
- any "safe to forget" maintenance action

Synthetic cleanup remains separate. Contract-confirmed synthetic cleanup can be
gated by the synthetic marker predicate, preview token, exact confirmation, and
transaction audit, but that does not authorize cleanup of non-synthetic
tombstones or reviews.

## Definition

A watermark is durable evidence that an observing peer has processed a source
peer's sync stream through a specific export boundary.

A watermark does not mean:

- a file exists
- `latest.json` was seen in a folder
- a row appeared in a review queue
- a peer directory exists under `devices/`
- a checksum sidecar exists

A watermark means:

- the observing peer processed or imported enough of the source stream to make
  lifecycle retention decisions about that source stream
- the source export identity, sequence, and checksum are known
- the observation is durable enough to survive reload
- the observation is tied to a peer identity, not only to a file path

## Existing Inputs

Current F2-F5H work already provides inputs that a future watermark diagnostic
can combine. None of these is a complete watermark by itself.

Peer identity:

- `h2o:sync:peer-identity:v1`
- `syncPeerId`
- `surfaceKind`
- `appKind`
- `storeKind`

Desktop export log:

- `h2o:sync:export-log:v1`
- `lastExportId`
- `sequenceNumber`
- `exportHistory`

Desktop sync mirror:

- `~/H2O Studio Sync/latest.json`
- `~/H2O Studio Sync/devices/<safePeerDir>/latest.json`
- `~/H2O Studio Sync/devices/<safePeerDir>/latest.sha256`
- `~/H2O Studio Sync/devices/<safePeerDir>/state.json`

Per-peer mirror state:

- `syncPeerId`
- `safePeerDir`
- `surfaceKind`
- `appKind`
- `storeKind`
- `lastExportId`
- `sequenceNumber`
- `lastContentSha256`
- `lastFileSha256`
- `lastExportedAt`
- `updatedAt`

Chrome import state:

- `lastAppliedExportId`
- `lastAppliedAt`
- checksum
- summary signature
- file size and modified time diagnostics

Tombstone fields:

- `deleted_by_sync_peer_id`
- `source_export_id`
- `source_sequence_number`

Tombstone review fields:

- `remote_sync_peer_id`
- `remote_export_id`
- `remote_sequence_number`
- `last_seen_export_id`
- `seen_count`

Lifecycle diagnostics currently report:

```js
{
  watermarks: {
    supported: false,
    reason: "peer-watermarks-not-implemented"
  }
}
```

## Proposed Watermark Object

The common logical object should be:

```js
{
  observingPeerId,
  sourcePeerId,
  streamKind,
  lastSeenExportId,
  lastSeenSequence,
  lastSeenChecksum,
  lastSeenAt,
  lastImportedAt,
  highWatermarkSequence,
  lowWatermarkSequence,
  retentionHoldUntil,
  status
}
```

Field meanings:

- `observingPeerId`: the peer that processed or imported evidence.
- `sourcePeerId`: the peer that produced the stream.
- `streamKind`: the stream being tracked.
- `lastSeenExportId`: the latest observed source export id.
- `lastSeenSequence`: the latest observed source export sequence.
- `lastSeenChecksum`: checksum for the observed export boundary.
- `lastSeenAt`: when the observing peer saw the stream boundary.
- `lastImportedAt`: when the observing peer imported or applied enough state
  for lifecycle decisions.
- `highWatermarkSequence`: highest contiguous source sequence known observed.
- `lowWatermarkSequence`: lowest sequence still required for retention.
- `retentionHoldUntil`: optional timestamp that keeps evidence retained.
- `status`: peer lifecycle status.

Initial status values:

- `active`
- `stale`
- `retired`
- `unknown`

## Stream Kinds

Initial stream kinds:

- `export`
- `tombstone`
- `tombstone-review`
- `maintenance`

Deferred stream kind:

- `folder-state-watermark`

Folder state watermarks are deferred because current F5H lifecycle safety
concerns tombstones, reviews, maintenance evidence, and export sequences.
Folder-state parity work has a separate review and mirror-refresh model.

## Future Desktop Schema

A future Desktop migration may add a table similar to this shape. This document
does not implement it.

```sql
sync_peer_watermarks (
  watermark_id TEXT PRIMARY KEY,
  schema TEXT NOT NULL,
  observing_peer_id TEXT NOT NULL,
  source_peer_id TEXT NOT NULL,
  stream_kind TEXT NOT NULL,
  last_seen_export_id TEXT,
  last_seen_sequence INTEGER,
  last_seen_checksum TEXT,
  last_seen_at TEXT NOT NULL,
  last_imported_at TEXT,
  high_watermark_sequence INTEGER,
  low_watermark_sequence INTEGER,
  retention_hold_until TEXT,
  status TEXT NOT NULL,
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
```

Recommended future indexes:

```sql
CREATE INDEX idx_sync_peer_watermarks_observing_source
  ON sync_peer_watermarks(observing_peer_id, source_peer_id, stream_kind);

CREATE INDEX idx_sync_peer_watermarks_source_sequence
  ON sync_peer_watermarks(source_peer_id, stream_kind, high_watermark_sequence);

CREATE INDEX idx_sync_peer_watermarks_status
  ON sync_peer_watermarks(status, retention_hold_until);
```

## Chrome/MV3 Policy

Chrome can mirror equivalent watermark objects later in IndexedDB or
`chrome.storage.local`. Chrome remains read-only for destructive lifecycle
cleanup until Desktop policies are proven.

Chrome may report:

- what source export it imported
- what source sequence it processed
- import checksum and summary signature
- review queue sightings for remote tombstones

Chrome must not use that report to run destructive cleanup. Chrome lifecycle
cleanup remains review-only until a later explicitly approved phase.

## Safety Rules

- No purge until every required active peer has seen the relevant source
  sequence.
- Unknown peer state blocks destructive lifecycle actions.
- Stale or offline peers create retention holds.
- Retired peers require explicit operator or admin review.
- Duplicate sighting compaction may preview without watermarks, but real
  destructive compaction is blocked.
- Tombstone purge is blocked until active peers are past the tombstone source
  sequence and the restore risk window.
- Pending review rows remain blocked regardless of watermark.
- Accepted-later review rows remain blocked regardless of watermark.
- Apply-linked review rows remain blocked regardless of watermark.
- Cascade-linked review rows remain blocked regardless of watermark.
- Synthetic cleanup remains separate and does not replace watermark
  requirements for non-synthetic lifecycle work.
- Prefix-only or heuristic rows are never cleanup authority.
- A file checksum is integrity evidence, not a lifecycle watermark by itself.
- A peer directory is discovery evidence, not a lifecycle watermark by itself.

## Operations Blocked Until Watermarks Exist

These operations remain blocked for real user evidence until watermarks are
implemented and runtime-proven:

- general tombstone purge
- restored tombstone compaction
- duplicate sighting destructive compaction
- review archive/delete for non-synthetic rows
- maintenance log trimming
- any "safe to forget" operation involving real user evidence

Preview-only diagnostics may run without watermarks as long as they perform no
writes and do not imply cleanup eligibility.

## Diagnostics Plan

A future read-only API should be introduced before schema or mutation:

```js
await H2O.Studio.sync.peerWatermarks?.diagnose()
```

The report should include:

- known peers from identity
- known peers from export log
- known peers from peer discovery
- known peers from import state
- known peers from tombstone and review rows
- missing watermark classes
- active peer count
- stale peer count
- unknown peer count
- minimum observed sequence by source peer
- purge blockers
- compaction blockers
- retention holds
- redacted output by default
- identifiers only behind an explicit debug flag

Suggested diagnostic shape:

```js
{
  schema: "h2o.studio.sync.peer-watermark-diagnostic.v1",
  readOnly: true,
  noMutation: true,
  generatedAt,
  redacted: true,
  supported: false,
  knownPeers: {
    fromIdentity,
    fromExportLog,
    fromPeerDiscovery,
    fromImportState,
    fromTombstones,
    fromReviews
  },
  watermarks: {
    present,
    missingClasses,
    activePeers,
    stalePeers,
    unknownPeers,
    retiredPeers
  },
  sourceStreams: [],
  blockers: [],
  warnings: []
}
```

## Implementation Phases

Recommended sequence:

1. `F5H.5-a`: docs contract.
2. `F5H.5-b`: read-only diagnostics.
3. `F5H.5-c`: Desktop schema proposal and guarded migration.
4. `F5H.5-d`: Chrome mirror diagnostics.
5. `F5H.6`: archive/purge policy after watermarks.

No phase should add purge, archive, destructive compaction, or non-synthetic
cleanup until diagnostics show which peers and streams can safely be evaluated.

## Validation

Docs-only validation:

```bash
git diff --check
git diff --cached --check
```

Future source validation, if JavaScript diagnostics are added:

```bash
node --check <touched-js-files>
node tools/loader/validate-loader-order.mjs
npm run dev:check
git diff --check
git diff --cached --check
```

Future source validation, if Desktop Rust schema or commands are added:

```bash
cd apps/studio/desktop/src-tauri
cargo check
cargo test f5h
```
