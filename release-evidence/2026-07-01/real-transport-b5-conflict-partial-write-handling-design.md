# Real-Transport B5 - Conflict / Partial-Write Handling - Design

Verdict: **B5 REAL CONFLICT / PARTIAL-WRITE HANDLING IS DESIGNED (DESIGN / SPECIFICATION ONLY) - NOTHING IS IMPLEMENTED
OR MINTED IN SOURCE, NO CONFLICT / RECOVERY / RETRY CODE RUNS, NO REMOTE WRITE IS ATTEMPTED, ALL EVIDENCE IS HASH-ONLY /
REDACTED, AND NO RAW ENDPOINT / CREDENTIAL / PATH / PAYLOAD-BODY VALUE APPEARS ANYWHERE. B6 REMAINS THE LAST OPEN
BLOCKER. THIS DESIGN AUTHORIZES NO REAL WRITE, NO FLIP, AND NO CLEANUP**.

This is a design/specification evidence + validator slice only. It does not implement conflict handling, recovery,
retry, or resume; does not implement real WebDAV/cloud/relay transport; does not add real credentials; does not log raw
endpoint/credential/path values; does not write to real WebDAV/cloud/relay/CAS/files; does not enqueue relay; does not
mint or start `fullBundle.v3`; does not mutate export state; does not mint an export id; does not burn sequence; does
not flip `productSyncReady`; does not set `transportReady:true`; and does not clean or mutate `row:a950a44b859f`. No
schema is minted in source.

## Anchors Respected

- B4 real enqueue / outbox / publication-ledger boundary design: `0b6ed75e`.
- B3 durable real-transport idempotency store design: `e1618571`.
- B2 real controlled-write kill-switch lifecycle design: `09bf7701`.
- B1 real target config + credentials + peer identity design: `b2e10531`.
- B8 + B7 real-transport approval contract and `transportReady` policy design: `26e6241b`.
- Real WebDAV/cloud/relay transport readiness gap review (B1-B8): `d2bea4c0`.

## Scope

This slice designs blocker B5 (real conflict / partial-write handling), building on the B4 outbox boundary. It does NOT
design or close B6, which remains open. It is a specification only: no conflict handling, recovery, retry, or remote
write is implemented or run, and nothing is implemented in source.

## Design-Only Redaction Rule (applies to this entire design)

All conflict / recovery evidence is hash-only / redacted. No raw endpoint URL, no raw credential, no raw remote path,
and no raw payload body is ever stored in conflict evidence, logs, or state. This design document itself contains ZERO
raw endpoint URLs, raw credentials, raw remote paths, or raw payload bodies - only redacted reference field names and
hash-only placeholders.

## 1. Conflict Classes (design)

- **local payload stale before write** -> `real-transport-b5-conflict-local-payload-stale`;
- **remote already has the same payload hash** -> `real-transport-b5-conflict-remote-same-payload-hash` (no-op, no
  re-write);
- **remote already has a newer payload/package** -> `real-transport-b5-conflict-remote-newer` (block local overwrite;
  reviewed decision);
- **remote has an unknown / untrusted payload** -> `real-transport-b5-conflict-remote-untrusted`;
- **checksum mismatch before write** -> `real-transport-b5-conflict-checksum-mismatch-pre-write`;
- **checksum mismatch after observed write** -> `real-transport-b5-conflict-checksum-mismatch-post-write` (explicit
  recovery);
- **peer / target mismatch** -> `real-transport-b5-conflict-peer-target-mismatch`;
- **credential / permission failure** -> `real-transport-b5-conflict-credential-permission-failure`;
- **network timeout / uncertain write outcome** -> `real-transport-b5-conflict-uncertain-write-outcome` (explicit
  recovery; NOT a blind retry);
- **partial upload / interrupted write** -> `real-transport-b5-conflict-partial-interrupted-write` (explicit recovery).

## 2. Partial-Write States (design)

A real write's outcome is classified into explicit partial-write states:

- `no-remote-write-attempted`;
- `remote-write-attempted-unconfirmed`;
- `remote-write-observed-checksum-unverified`;
- `remote-write-observed-checksum-verified`;
- `ledger-pending`;
- `explicit-recovery-required`.

Only `remote-write-observed-checksum-verified` may progress to `ledger-pending` -> the B4 `completed`.

## 3. Recovery Behavior (design)

- **no blind retry after a partial / uncertain write**: `noBlindRetryAfterUncertainWrite: true`;
- recovery must consult the B3 idempotency record (is the key already `completed`?);
- recovery must consult the B4 outbox status (`queued` / `dispatching` / `remote-write-observed` / ...);
- recovery must revalidate the B1 target hashes (`endpointRefHash`, `remoteRootRefHash`, `peerIdentityBindingHash`,
  `credentialRefHash`);
- recovery must revalidate the B2 kill switch is still enabled (`killSwitchEnableTokenHash` valid, not stale/disabled);
- recovery must revalidate the B8 approval is still valid (`b8ApprovalRefHash` references an accepted approval);
- recovery must use the B6 sequence/export constraints (`sequenceExportConstraintRef`) - recovery never mints/burns.

## 4. Safe Retry Rules (design)

- **retry allowed only before a remote write if no remote side effect was possible**: a retry from
  `no-remote-write-attempted` is safe; any state past it is not;
- **retry after an uncertain write must enter explicit recovery first**:
  `remote-write-attempted-unconfirmed` -> `explicit-recovery-required` before any further action;
- **a completed idempotency key means a duplicate no-op**: if the B3 record is `completed`, the operation resolves to
  `duplicate-replay-noop` with zero remote write;
- **a changed payload / target / sequence is NOT a duplicate**: a different `idempotencyKeyHash` is a new, separately
  gated operation (`real-transport-b5-changed-payload-target-not-duplicate`).

## 5. Remote-Newer Behavior (design)

- **block local overwrite**: a remote-newer package blocks the local overwrite (`blockLocalOverwriteOnRemoteNewer:
  true`);
- **require a reviewed conflict decision**: `reviewedConflictDecisionRequired: true` - remote-newer is resolved by a
  separate reviewed decision, not automatically;
- **do not mutate local canonical state**: `noLocalCanonicalMutationOnConflict: true` - a conflict never mutates local
  canonical folders/bindings/chats/tombstones;
- **do not flip `transportReady`**: a conflict / recovery never flips `transportReady`.

## 6. Checksum / Hash Behavior (design)

- the payload hash must match the `fullBundle.v2` envelope hash: `payloadHashMatchesFullBundleV2Envelope: true`;
- the post-write observed hash must match the expected candidate hash: `postWriteObservedHashMatchesCandidate: true`;
- a mismatch blocks the ledger write: `checksumMismatchBlocksLedgerWrite: true`;
- a mismatch enters explicit recovery: `checksumMismatchEntersExplicitRecovery: true`.

## 7. Relationship to B4

- **B5 owns the meaning of `explicit-recovery-required`**: the B4 outbox `explicit-recovery-required` state is defined
  by B5's recovery behavior;
- **the B4 outbox must not mark `completed` until B5 confirms a verified remote write**:
  `outboxCompletedRequiresB5VerifiedWrite: true`;
- **the ledger must not precede a verified remote write**: `ledgerNeverPrecedesVerifiedRemoteWrite: true` (consistent
  with the B4 `ledgerNeverPrecedesRemoteWrite`).

## 8. Relationship to B6

- **B5 cannot decide sequence/export-id burn timing alone**: `b5DoesNotDecideSequenceBurn: true`;
- **B5 must hand off sequence/export rollback requirements to B6**: on a failed / uncertain / recovered write, B5 hands
  the rollback requirement to B6 via `sequenceExportRollbackHandoffToB6` - no export id is minted and no sequence is
  burned by B5.

## 9. Privacy (design)

- all conflict evidence hash-only: `conflictEvidenceHashOnly: true`;
- no raw endpoint URL: `rawEndpointLogged: false`;
- no raw credential: `rawCredentialLogged: false`;
- no raw remote path: `rawRemotePathLogged: false`;
- no raw payload body: `rawPayloadBodyStored: false` (conflict evidence stores only `candidatePayloadHash` /
  `candidateBundleHash` / observed-hash references);
- no CAS keys: `casKeysExposed: false`, `touchChatSavingCas: false`.

## 10. Relationship to a950 / CAS / fullBundle

- no cleanup / a950 mutation authority: `noCleanupAuthority: true`, `noA950Mutation: true`;
- `row:a950a44b859f` remains documented/quarantined debt and stays OUT of the exportable payload (the write carries only
  the `fullBundle.v2` exportable projection, from which a950 is already quarantined);
- Chat Saving CAS remains SEPARATE: conflict/recovery never touches the Chat Saving archive CAS;
- the `fullBundle.v2` envelope remains selected (`payloadSchema: 'h2o.studio.fullBundle.v2'`); `fullBundle.v3` remains
  deferred and is not introduced by this design.

## Remaining Blocker (B6 still open)

- **B6** real-sequence-export-id-semantics-undesigned.

B5 (this design) is now specified as design-only; it is not implemented, minted, or run. B6 is the last open blocker
before a controlled real write may be designed behind all of B1-B8.

## Recommended Next Lane After B5

**B6 - real sequence / export-id semantics (design-only): when an export id may be minted, when a sequence may be
burned, and the rollback if transport fails (no burned sequence or minted id left dangling on a failed / uncertain /
recovered write, per the B5 handoff).** After B6, all of B1-B8 are design-specified; the following lane would be a
consolidated real-transport implementation-readiness rollup (still design/evidence), and only then - after a
real-transport approval per the B8 contract is accepted AND the B7 readiness decision is made in a dedicated flip slice -
may a controlled real write be attempted: dry-run first, `fullBundle.v2` only, CAS-separate, kill-switch + gate +
approval gated, fail-closed on restart.

## Can Real Transport Start Now?

**No.** B5 is a design-only specification; B6 remains open; no conflict/recovery/retry runs; no remote write is
attempted; no real-transport approval is accepted; `transportReady` and `productSyncReady` stay `false`. This design
authorizes nothing.

## Boundaries Held

- No conflict handling / recovery / retry implemented; no remote write attempted; no schema minted in source.
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

The B5 real conflict / partial-write handling (explicit conflict classes, explicit partial-write states,
recovery-not-blind-retry consulting B1/B2/B3/B4/B8, remote-newer blocks local overwrite, checksum mismatch blocks ledger
and enters recovery, sequence rollback handed off to B6) is designed (design-only, hash-only / redacted, no raw values).
Real transport remains blocked and cannot start now: B6 remains open, no real-transport approval is accepted,
`transportReady:false` and `productSyncReady:false` remain authoritative, `fullBundle.v3` stays deferred, and Chat
Saving CAS stays blocked/deferred.
