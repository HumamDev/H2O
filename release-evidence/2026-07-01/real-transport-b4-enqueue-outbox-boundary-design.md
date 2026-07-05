# Real-Transport B4 - Real Enqueue / Outbox Boundary - Design

Verdict: **B4 REAL ENQUEUE / OUTBOX / PUBLICATION-LEDGER BOUNDARY IS DESIGNED (DESIGN / SPECIFICATION ONLY) - NOTHING IS
IMPLEMENTED OR MINTED IN SOURCE, NO OUTBOX ROW OR LEDGER ENTRY IS CREATED, NO ENQUEUE / RETRY / DISPATCH RUNS, ALL
RECORDS ARE HASH-ONLY / REDACTED, AND NO RAW ENDPOINT / CREDENTIAL / PATH / PAYLOAD-BODY VALUE APPEARS ANYWHERE. B5-B6
REMAIN OPEN BLOCKERS. THIS DESIGN AUTHORIZES NO REAL WRITE, NO FLIP, AND NO CLEANUP**.

This is a design/specification evidence + validator slice only. It does not implement a real enqueue, outbox write,
publication-ledger write, retry, resume, or dispatch; does not implement real WebDAV/cloud/relay transport; does not add
real credentials; does not log raw endpoint/credential/path values; does not write to real WebDAV/cloud/relay/CAS/files;
does not enqueue relay; does not mint or start `fullBundle.v3`; does not mutate export state; does not mint an export id;
does not burn sequence; does not flip `productSyncReady`; does not set `transportReady:true`; and does not clean or
mutate `row:a950a44b859f`. No schema is minted in source.

## Anchors Respected

- B3 durable real-transport idempotency store design: `e1618571`.
- B2 real controlled-write kill-switch lifecycle design: `09bf7701`.
- B1 real target config + credentials + peer identity design: `b2e10531`.
- B8 + B7 real-transport approval contract and `transportReady` policy design: `26e6241b`.
- Real WebDAV/cloud/relay transport readiness gap review (B1-B8): `d2bea4c0`.
- Controlled local mock WebDAV transport final rollup: `15a33852`.

## Scope

This slice designs blocker B4 (the real enqueue / outbox boundary and retry/resume), building on the B3 durable
idempotency store. It does NOT design or close B5-B6, which remain open. It is a specification only: no outbox row,
ledger entry, enqueue, retry, or dispatch is created or run, and nothing is implemented in source.

## Design-Only Redaction Rule (applies to this entire design)

Every outbox row and ledger entry is hash-only / redacted. No raw endpoint URL, no raw credential, no raw remote path,
and no raw payload body is ever stored in an outbox row, ledger entry, evidence, logs, or state. This design document
itself contains ZERO raw endpoint URLs, raw credentials, raw remote paths, or raw payload bodies - only redacted
reference field names and hash-only placeholders.

## 1. Ownership and Source of Truth (design)

- **Desktop authority for real transport enqueue/outbox**: only the Desktop authority may create a real-transport outbox
  row or publication-ledger entry. A real enqueue is Desktop-owned.
- **Relationship to existing `h2o:sync:relay-outbox:v1`**: the real-transport enqueue reuses the existing durable relay
  outbox store (`h2o:sync:relay-outbox:v1`) as the outbox substrate; it does not invent a new outbox key. A
  real-transport outbox row is tagged as a real-transport row and carries the B1/B2/B3/B8 references.
- **Relationship to existing `h2o:sync:publication-ledger:v1`**: a completed real transport writes a publication-ledger
  entry (`h2o:sync:publication-ledger:v1`) only AFTER a verified remote write (below).
- **Relationship to the proposed B3 idempotency store**: the outbox row references the B3 idempotency
  `idempotencyKeyHash`; the B3 store is the source of truth for whether a key is already `completed`. The outbox never
  dispatches a key the B3 store marks `completed`.
- **Chrome/local surfaces must not own real enqueue authority**: a Chrome/local surface can never create a real-transport
  outbox row or ledger entry; `chromeOwnsRealEnqueue: false`.

## 2. Enqueue Boundary (design)

- **exact moment an outbox row may be written**: an outbox row may be written ONLY after preflight passes and an
  apply-intent is recorded in B3 - i.e. at `apply-intent-recorded` -> `queued`. The outbox row is the durable record of
  an approved, idempotency-keyed, not-yet-dispatched real write.
- **preconditions before enqueue** (ALL required):
  - B1 target hashes present (`endpointRefHash`, `remoteRootRefHash`, `peerIdentityBindingHash`, `credentialRefHash`);
  - B2 kill switch enabled and valid (`killSwitchEnableTokenHash` valid, not stale, matching scope/target);
  - B3 idempotency record exists / valid (and not already `completed`);
  - B8 real approval accepted (`b8ApprovalRefHash` references an accepted approval);
  - B7 readiness policy allows evaluation (per the B7 policy; `transportReady` remains `false` until its own decision);
  - B5/B6 policies available before the actual remote write (conflict/partial-write + sequence/export-id must be closed
    before a write is dispatched).
- **real outbox row must not be created from `localExportableSyncReady` alone**: `localExportableSyncReadyIsAuthorization:
  false`; eligibility never creates an outbox row.
- **real outbox row must not be created from local mock approval**: a `controlledLocalMockApplyApproved` /
  `local-mock-webdav-target-only` scope never creates a real-transport outbox row.

## 3. Outbox Row Semantics (design)

A real-transport outbox row (hash-only) carries:

- hash-only payload reference: `candidatePayloadHash` and `candidateBundleHash` (never the payload body);
- target hashes: `endpointRefHash`, `remoteRootRefHash`, `peerIdentityBindingHash`, `credentialRefHash`;
- idempotency key/reference: `idempotencyKeyHash`;
- approval reference: `b8ApprovalRefHash`;
- kill-switch token hash: `killSwitchEnableTokenHash`;
- sequence/export constraint reference: `sequenceExportConstraintRef` (from the future B6);
- status lifecycle: `queued` -> `dispatching` -> `remote-write-observed` -> `ledger-pending` -> `completed`, or
  `failed`, or `explicit-recovery-required`.

## 4. Publication Ledger Semantics (design)

- **when a ledger entry may be written**: a publication-ledger entry may be written ONLY after `remote-write-observed`
  (a verified remote write), at `ledger-pending` -> `completed`;
- **the ledger must never precede a verified remote write**: `ledgerNeverPrecedesRemoteWrite: true`; a ledger entry is
  never written for a `queued` / `dispatching` row;
- **the ledger must reference the idempotency key and payload hash**: `idempotencyKeyHash` + `candidatePayloadHash`;
- **the ledger must remain hash-only**: `ledgerHashOnly: true`; no raw endpoint/credential/path/payload body.

## 5. Retry / Resume Semantics (design)

- **boot resume never dispatches without the controlled gate**: `bootResumeDispatch: false`; a resume without the
  controlled apply gate is blocked;
- **disabled kill switch blocks dispatch**: a disabled/missing B2 kill switch blocks any dispatch/retry;
- **a completed idempotency record makes a duplicate a no-op**: if the B3 record is `completed`, the outbox resolves to
  `duplicate-replay-noop` with zero remote write;
- **`remote-write-pending` after restart enters explicit recovery**: a `dispatching` / `remote-write-observed` row after
  restart transitions to `explicit-recovery-required` for a separate reviewed reconciliation;
- **no blind retry after a partial write**: `noBlindRetryAfterPartialWrite: true`;
- **no automatic retry when target / approval / sequence mismatch**: a mismatch enters recovery / block, never an
  automatic retry.

## 6. Failure Modes (design)

- missing idempotency record -> `real-transport-b4-idempotency-record-missing`;
- duplicate with changed payload/target -> `real-transport-b4-duplicate-changed-payload-target`;
- stale kill-switch token -> `real-transport-b4-kill-switch-token-stale`;
- missing approval -> `real-transport-b4-approval-missing`;
- missing target hashes -> `real-transport-b4-target-hashes-missing`;
- sequence/export mismatch -> `real-transport-b4-sequence-constraint-mismatch`;
- peer ambiguity -> `real-transport-b4-peer-ambiguous`;
- CAS boundary violation -> `real-transport-b4-cas-boundary-violation`;
- attempted local mock target as real target -> `real-transport-b4-local-mock-target-not-real`.

## 7. Privacy (design)

- no raw endpoint URL: `rawEndpointLogged: false`;
- no raw credential: `rawCredentialLogged: false`;
- no raw remote path: `rawRemotePathLogged: false`;
- no raw payload body: `rawPayloadBodyStored: false` (outbox/ledger store only `candidatePayloadHash` /
  `candidateBundleHash`);
- no CAS keys: `casKeysExposed: false`, `touchChatSavingCas: false` - the outbox/ledger is for the WebDAV/cloud/relay
  transport only and never the Chat Saving archive CAS;
- all evidence hash-only: `outboxRowHashOnly: true`, `ledgerHashOnly: true`.

## 8. Relationship to B5 / B6 (handoff requirements)

B4 must NOT finalize conflict/partial-write (B5) or sequence/export-id (B6) semantics. Exact handoff requirements:

- **to B5**: before a `queued` row may transition to `dispatching`/write, B5 must define checksum-mismatch,
  stale-payload, remote-newer, and partial-upload-failure handling; the outbox `explicit-recovery-required` state is the
  B5 recovery entry point;
- **to B6**: before a write, B6 must define when an export id may be minted and when a sequence may be burned, and the
  rollback if transport fails; the outbox `sequenceExportConstraintRef` is the B6 binding, and no export id / sequence
  is minted/burned by B4.

## 9. Relationship to a950

- `row:a950a44b859f` remains documented/quarantined debt; B4 has NO cleanup or a950 mutation authority
  (`noCleanupAuthority: true`, `noA950Mutation: true`). a950 never enters the exportable payload; the outbox references
  only the `fullBundle.v2` exportable projection hashes, from which a950 is already quarantined.

## Remaining Blockers (B5-B6 still open)

- **B5** real-conflict-partial-write-handling-missing.
- **B6** real-sequence-export-id-semantics-undesigned.

B4 (this design) is now specified as design-only; it is not implemented, minted, enqueued, or dispatched.

## Recommended Next Lane After B4

**B5 - real conflict + partial-write handling (design-only): checksum mismatch, stale payload, remote-already-newer, and
partial upload/write failure (atomic-on-retry, no half-written remote), entered via the B4 outbox
`explicit-recovery-required` state.** Then B6 (sequence/export-id mint/burn semantics + rollback on failure). Only after
B1-B6 are closed AND a real-transport approval per the B8 contract is accepted AND the B7 readiness decision is made in a
dedicated flip slice may a controlled real write be attempted - dry-run first, `fullBundle.v2` only, CAS-separate,
kill-switch + gate + approval gated, fail-closed on restart.

## Can Real Transport Start Now?

**No.** B4 is a design-only specification; B5-B6 remain open; no outbox row / ledger entry is created; no enqueue /
retry / dispatch runs; no real-transport approval is accepted; `transportReady` and `productSyncReady` stay `false`.
This design authorizes nothing.

## Boundaries Held

- No real enqueue / outbox / publication-ledger write implemented; no outbox row or ledger entry created; no enqueue /
  retry / dispatch run; no schema minted in source.
- No raw endpoint URL, raw credential, raw remote path, or raw payload body stored/logged anywhere (hash-only / redacted
  references only).
- No real WebDAV/cloud/relay/CAS/file write; no relay enqueue.
- No `fullBundle.v3` start/mint; no export-state mutation; no export id minted; no sequence burned.
- `productSyncReady` not flipped - remains `false`; `transportReady` not set true; `realTransportApprovalAccepted`
  remains `false`; `realWebDAVTransportAvailable` remains `false`.
- `row:a950a44b859f` not cleaned or mutated; no cleanup authority introduced; no real transport write authorization
  introduced.
- Chat Saving CAS untouched (blocked/deferred).
- No product source edited; no unrelated Studio-lane files touched.

## Final State

The B4 real enqueue / outbox / publication-ledger boundary (Desktop-authority, reusing the existing durable stores,
outbox row only after apply-intent, ledger only after verified remote write, retry/resume with duplicate no-op and
explicit recovery not blind retry) is designed (design-only, hash-only / redacted, no raw values). Real transport
remains blocked and cannot start now: B5-B6 remain open, no real-transport approval is accepted, `transportReady:false`
and `productSyncReady:false` remain authoritative, `fullBundle.v3` stays deferred, and Chat Saving CAS stays
blocked/deferred.
