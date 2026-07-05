# Real WebDAV / Cloud / Relay Transport Readiness Gap Review

Verdict: **REAL WEBDAV/CLOUD/RELAY TRANSPORT CANNOT START NOW - EIGHT OPEN BLOCKERS MUST BE DESIGNED (AND APPROVED)
FIRST, PLUS TWO BOUNDARIES THAT MUST BE PRESERVED. THIS IS A GAP REVIEW ONLY: IT IMPLEMENTS NO REAL TRANSPORT AND
AUTHORIZES NO REAL WRITE, NO FLIP, AND NO CLEANUP**.

This is evidence/validator-only. It does not implement real WebDAV/cloud/relay transport, does not write to real
WebDAV/cloud/relay/CAS/files, does not enqueue relay, does not mint or start `fullBundle.v3`, does not mutate export
state, does not mint an export id, does not burn sequence, does not flip `productSyncReady`, does not set
`transportReady:true`, and does not clean or mutate `row:a950a44b859f`.

## Anchors Respected

- Controlled local mock WebDAV transport final rollup: `15a33852`.
- Controlled local mock restart/reload proof: `942fdff6`.
- Controlled local mock duplicate replay proof: `6c55a81b`.
- First controlled local mock apply closeout: `c3fd4b57`.
- Controlled local mock approval predicate closeout: `1d7a2daa`.
- Controlled-write kill switch: `edb30677`.
- Final transport-readiness rollup (transport not started): `40f52a5f`.

## Current Baseline (what the local mock lane provides)

- Active transport is `local-sync-folder-json`; `realWebDAVTransportAvailable:false`; every real-write flag is
  hardcoded `false` in `evaluateControlledLocalMockTransport`.
- The controlled-write kill switch exists and is disabled by default
  (`controlledWriteKillSwitchDefaultEnabled:false`).
- The `fullBundle.v2` envelope is selected (`FULL_BUNDLE_V2_SCHEMA = 'h2o.studio.fullBundle.v2'`); `fullBundle.v3` is
  forbidden across all transport paths.
- The relay outbox (`h2o:sync:relay-outbox:v1`) and publication ledger (`h2o:sync:publication-ledger:v1`) durable
  stores exist, but the controlled local mock evaluator does NOT write to them
  (`relayOutboxTouched:false`, `publicationLedgerTouched:false`, `dryRunRecordsAreNotRelayOutboxRows:true`).
- `realTransportApprovalAccepted:false`, `localExportableSyncReadyIsAuthorization:false`, `noCleanupAuthority:true`,
  `productSyncReady:false`, `transportReady:false` are authoritative.

The local mock lane is a set of prerequisites and safety proofs. It is NOT real transport and NOT authorization for
real transport.

## Gap Classification

### 1. Real WebDAV target configuration - GAP (Blocker B1)

- Present: mock target `local-mock-webdav` with redacted `peerTargetHash` / `remoteRootRefHash`; envelope names
  `latest.json` / `chrome-latest.json` referenced in dry-run; `realWebDAVTransportAvailable:false`.
- Gap: no real endpoint / remote-root model, no credential handling, no peer-identity binding beyond a hash. Real
  transport needs a real endpoint + remote root config, credential storage/handling with NO raw endpoint or
  credential logging, and a peer-identity binding that ties the redacted target hash to a real verified peer.
- Blocker **B1: real-target-config-missing** (endpoint/remote-root + credentials + peer identity; no raw endpoint or
  credential logging).

### 2. Real controlled-write kill switch semantics - GAP (Blocker B2)

- Present: kill switch exists, disabled by default, gate `webdav-controlled-write-kill-switch-evaluate`; apply
  requires it enabled; a missing kill switch is modeled and blocks.
- Gap: the current kill switch only gates a MODELED apply decision. Real transport needs a real lifecycle: an explicit
  enable path (who enables it and how it is recorded), an emergency disable path (a durable kill that survives
  restart), and mid-flight disable behavior (an in-progress real upload must abort / no-op cleanly on disable).
- Blocker **B2: kill-switch-real-lifecycle-missing** (explicit enable / emergency disable / mid-flight disable).

### 3. Durable idempotency - GAP (Blocker B3)

- Present: `idempotencyKeyHash` is a request-level input; duplicate replay is modeled zero-write via a request
  `replayed` marker; restart/reload is modeled fail-closed.
- Gap: idempotency is REQUEST-level only, not durable. Real transport needs a durable idempotency record that survives
  an app restart so a duplicate real upload after restart is a true no-op (not just a modeled one) and never repeats a
  remote write. The durable relay-outbox / publication-ledger stores exist but the mock intentionally does not use
  them.
- Blocker **B3: durable-idempotency-store-missing** (survives restart; prevents repeated remote writes).

### 4. Relay outbox / publication ledger - GAP (Blocker B4)

- Present: durable relay-outbox (`h2o:sync:relay-outbox:v1`) and publication-ledger (`h2o:sync:publication-ledger:v1`)
  stores exist (relay lane). The controlled local mock record is deliberately NOT an outbox row.
- Gap: real transport must decide whether a real enqueue writes a durable outbox row, define the EXACT enqueue
  boundary (what turns a candidate into a durable outbox row), and define retry/resume behavior after restart
  (bounded retry, no duplicate remote write on resume).
- Blocker **B4: real-enqueue-boundary-undesigned** (outbox-row semantics + retry/resume).

### 5. Conflict and partial-write handling - GAP (Blocker B5)

- Present: `fullBundle.v2` envelope preflight has checksum-mismatch / schema-mismatch / projection-count-mismatch
  blockers (dry-run); the relay idempotency restart proof harness exists.
- Gap: real transport needs real handlers for: checksum mismatch on a real upload, stale payload (basis moved), remote
  already has a newer package (remote-wins / reviewed conflict), and partial upload/write failure (atomic-on-retry, no
  half-written remote package left behind).
- Blocker **B5: real-conflict-partial-write-handling-missing**.

### 6. Sequence / export-id semantics - GAP (Blocker B6)

- Present: mock hardcodes `mintsExportId:false`, `burnsSequence:false`, `mutatesExportState:false`; envelope preflight
  uses `sequenceMode:'not-minted-in-dry-run'`.
- Gap: real transport must define WHEN an export id may be minted, WHEN a sequence may be burned, and ROLLBACK if
  transport fails (no burned sequence or minted id left dangling on a failed upload).
- Blocker **B6: real-sequence-export-id-semantics-undesigned** (mint/burn timing + rollback on failure).

### 7. Payload boundary - BOUNDARY HELD (no new blocker)

- `fullBundle.v2` remains the selected envelope; `fullBundle.v3` stays deferred and is forbidden on every transport
  path unless a later design explicitly requires it. This is a boundary to KEEP, not a gap to open. Do NOT introduce
  `fullBundle.v3` in the real-transport design.

### 8. CAS boundary - BOUNDARY HELD (no new blocker)

- Chat Saving WebDAV/cloud/archive CAS remains a SEPARATE, deferred/blocked boundary. Real WebDAV/cloud sync must NOT
  touch the Chat Saving archive CAS. This constraint must be explicitly preserved in the real-transport design.

### 9. Readiness flags - GAP (Blocker B7)

- Present: `productSyncReady:false`, `transportReady:false`, `localExportableSyncReadyIsAuthorization:false` are
  authoritative and hardcoded.
- Gap: real transport requires a GLOBAL real-transport readiness policy that decides when `transportReady` may flip
  `true` - and that policy must be SEPARATE from `localExportableSyncReady` (which is not, and must never become, real
  transport authorization). `productSyncReady` stays governed by its own flip gate.
- Blocker **B7: real-transport-readiness-policy-missing** (separate from localExportableSyncReady; transportReady flip
  criteria undefined).

### 10. Approval model - GAP (Blocker B8)

- Present: local mock apply approval (`controlledLocalMockApplyApproved`, scope `local-mock-webdav-target-only`);
  `realTransportApprovalAccepted:false` is hardcoded.
- Gap: real transport requires a NEW explicit operator approval contract (a real-transport approval schema + scope),
  distinct from the local mock approval. Local mock approval must never authorize real transport.
- Blocker **B8: real-transport-approval-contract-missing** (new explicit operator approval; local mock approval is not
  real transport approval).

## Consolidated Remaining Blockers Before Real Transport

- **B1** real-target-config-missing (endpoint/remote-root/credentials/peer-identity; no raw logging).
- **B2** kill-switch-real-lifecycle-missing (enable / emergency disable / mid-flight disable).
- **B3** durable-idempotency-store-missing (survives restart).
- **B4** real-enqueue-boundary-undesigned (outbox-row semantics + retry/resume).
- **B5** real-conflict-partial-write-handling-missing.
- **B6** real-sequence-export-id-semantics-undesigned (mint/burn + rollback).
- **B7** real-transport-readiness-policy-missing (separate from localExportableSyncReady).
- **B8** real-transport-approval-contract-missing (new explicit operator approval).

Boundaries that must be PRESERVED (not blockers, but constraints): `fullBundle.v2` envelope kept and `fullBundle.v3`
deferred; Chat Saving CAS remains separate and untouched by WebDAV/cloud sync.

## Recommended Implementation Order (design-only sequencing)

1. **B8 + B7 first** - a real-transport approval contract and a real-transport readiness policy. Nothing else may start
   without an explicit operator approval and an explicit readiness decision; `transportReady` stays false until then.
2. **B1** - real target config + credential handling + peer-identity binding, with no raw endpoint/credential logging.
3. **B2** - kill switch real lifecycle (enable / emergency disable / mid-flight disable) before any real write.
4. **B3 + B4** - durable idempotency store, then the real enqueue boundary / durable outbox rows + retry/resume.
5. **B5 + B6** - real conflict + partial-write handling, then sequence/export-id mint/burn semantics + rollback on
   failure.
6. **Only then** - a controlled real WebDAV/cloud/relay write behind all of the above: dry-run first, still
   `fullBundle.v2`, still CAS-separate, still kill-switch + gate + approval gated, and still fail-closed on restart.

## Can Real WebDAV/Cloud/Relay Start Now?

**No.** All eight blockers (B1-B8) are open. This review authorizes nothing: no real transport, no real write, no relay
enqueue, no `fullBundle.v3`, no export mutation / id mint / sequence burn, no `productSyncReady` flip, no
`transportReady:true`, no cleanup or a950 mutation. Real transport requires each blocker to be separately designed,
reviewed, and approved, in the order above.

## Boundaries Held

- No real transport implemented; no real WebDAV/cloud/relay/CAS/file write; no relay enqueue.
- No `fullBundle.v3` start/mint; no export-state mutation; no export id minted; no sequence burned.
- `productSyncReady` not flipped - remains `false`; `transportReady` not set true.
- `row:a950a44b859f` not cleaned or mutated; no cleanup authority introduced; no real transport write authorization
  introduced.
- Chat Saving CAS untouched (blocked/deferred); local mock transport not treated as real transport.
- No product source edited; no unrelated Studio-lane files touched.

## Final State

Real WebDAV/cloud/relay transport remains blocked and cannot start now. Eight open blockers (B1-B8) must be designed,
reviewed, and approved first; two boundaries (`fullBundle.v2`-only / `fullBundle.v3`-deferred, and Chat Saving CAS
separate) must be preserved. `productSyncReady:false` and `transportReady:false` remain authoritative. The local mock
transport lane remains complete and is not real transport.
