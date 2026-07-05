# Real-Transport B6 - Sequence / Export-Id Semantics - Design

Verdict: **B6 REAL SEQUENCE / EXPORT-ID SEMANTICS IS DESIGNED (DESIGN / SPECIFICATION ONLY) - NOTHING IS IMPLEMENTED OR
MINTED IN SOURCE, NO EXPORT ID IS MINTED, NO SEQUENCE IS BURNED, NO EXPORT STATE IS MUTATED, ALL EVIDENCE IS HASH-ONLY /
REDACTED, AND NO RAW ENDPOINT / CREDENTIAL / PATH / PAYLOAD-BODY VALUE APPEARS ANYWHERE. WITH B6 DESIGNED, ALL OF
B1-B8 ARE NOW DESIGN-SPECIFIED. THIS DESIGN AUTHORIZES NO REAL WRITE, NO FLIP, AND NO CLEANUP**.

This is a design/specification evidence + validator slice only. It does not implement sequence/export-id behavior,
does not mint an export id, does not burn a sequence, does not mutate export state, does not implement real
WebDAV/cloud/relay transport, does not add real credentials, does not log raw endpoint/credential/path values, does not
write to real WebDAV/cloud/relay/CAS/files, does not enqueue relay, does not mint or start `fullBundle.v3`, does not
flip `productSyncReady`, does not set `transportReady:true`, and does not clean or mutate `row:a950a44b859f`. No schema
is minted in source.

## Anchors Respected

- B5 real conflict / partial-write handling design: `e60e00f0`.
- B4 real enqueue / outbox / publication-ledger boundary design: `0b6ed75e`.
- B3 durable real-transport idempotency store design: `e1618571`.
- B2 real controlled-write kill-switch lifecycle design: `09bf7701`.
- B1 real target config + credentials + peer identity design: `b2e10531`.
- B8 + B7 real-transport approval contract and `transportReady` policy design: `26e6241b`.
- Real WebDAV/cloud/relay transport readiness gap review (B1-B8): `d2bea4c0`.

## Scope

This slice designs blocker B6 (real sequence / export-id semantics), the last open gap-review blocker. With B6
specified, B1-B8 are all design-specified. It is a specification only: no export id is minted, no sequence is burned,
no export state is mutated, and nothing is implemented in source.

## Design-Only Redaction Rule (applies to this entire design)

All export-id / sequence evidence is hash-only / redacted where it references target/payload material. No raw endpoint
URL, no raw credential, no raw remote path, and no raw payload body is ever stored. This design document itself contains
ZERO raw endpoint URLs, raw credentials, raw remote paths, or raw payload bodies - only redacted reference field names
and hash-only placeholders.

## 1. Export-Id Lifecycle (design)

- **not minted during preflight**: `exportIdMintedDuringPreflight: false`;
- **not minted during local mock**: a `local-mock-webdav` operation never mints a real export id
  (`exportIdMintedDuringLocalMock: false`);
- **when minting is allowed for real controlled transport**: a real export id may be minted ONLY at the transition to a
  verified real controlled write - i.e. after B5 confirms `remote-write-observed-checksum-verified` and before the B4
  `ledger-pending` -> `completed`. Never earlier.
- **relationship to B8 approval, B2 kill switch, B3 idempotency, B4 outbox, and B5 conflict policy**: minting requires an
  accepted B8 approval (`b8ApprovalRefHash`), an enabled valid B2 kill switch (`killSwitchEnableTokenHash`), a valid B3
  idempotency record bound to the export constraints, a B4 outbox row past `remote-write-observed`, and a B5
  checksum-verified, non-conflicting write. If any is unsatisfied, no export id is minted.

## 2. Sequence Lifecycle (design)

- **not burned during preflight**: `sequenceBurnedDuringPreflight: false`;
- **not burned before a verified remote write**: `sequenceBurnedBeforeVerifiedRemoteWrite: false`;
- **when burn is allowed**: a sequence may be burned ONLY after B5 confirms
  `remote-write-observed-checksum-verified`, together with (and after) the export-id mint, at the same verified-write
  transition;
- **how sequence relates to the publication ledger**: the publication-ledger entry (B4) records the burned sequence and
  minted export id ONLY after the verified remote write (`ledger-pending` -> `completed`); the ledger never records a
  sequence/export id for a `queued` / `dispatching` / unverified row;
- **no burned sequence for a failed / uncertain write**: `noBurnedSequenceForFailedOrUncertainWrite: true`.

## 3. Rollback / Recovery (design)

- **failed before a remote write means no export id / no sequence burn**: `failedBeforeWriteNoMintNoBurn: true`;
- **failed after a remote write but before the ledger means explicit recovery**: transitions to
  `explicit-recovery-required` (the B5 recovery entry); no mint/burn is finalized until reconciled;
- **uncertain write outcome means explicit recovery**: `uncertainWriteEntersExplicitRecovery: true`; never a blind
  mint/burn;
- **checksum mismatch blocks sequence burn**: `checksumMismatchBlocksSequenceBurn: true`;
- **remote-newer conflict blocks sequence burn**: `remoteNewerBlocksSequenceBurn: true`;
- **partial write blocks sequence burn**: `partialWriteBlocksSequenceBurn: true`.

Rollback is atomic-on-recovery: a failed/uncertain/recovered write leaves NO burned sequence and NO minted export id
dangling; either both are finalized on a verified write or neither is.

## 4. Relationship to B3 Idempotency

- **the idempotency key binds the export constraints**: the B3 `idempotencyKeyHash` is derived over the
  `sequenceExportConstraintRef` (among the B1/B2/B8 references), so the export/sequence constraints are bound to the
  key;
- **a completed idempotency record prevents duplicate mint/burn**: if the B3 record is `completed`, the operation is a
  `duplicate-replay-noop` - no second export id is minted and no second sequence is burned;
- **changed payload / target / sequence constraints are NOT duplicates**: a different `idempotencyKeyHash` is a new,
  separately gated operation, not a duplicate.

## 5. Relationship to B4 Outbox / Ledger

- **the outbox cannot mark `completed` before the sequence/export policy is satisfied**:
  `outboxCompletedRequiresSequenceExportPolicy: true`;
- **the ledger cannot be written before a verified remote write**: `ledgerNeverPrecedesVerifiedRemoteWrite: true`
  (consistent with B4/B5);
- **the ledger must reference the export id / sequence only after allowed**: the ledger records
  `exportIdRefHash` + `burnedSequenceRefHash` ONLY at `completed`, after the verified write.

## 6. Relationship to B5

- **the B5 `explicit-recovery-required` state blocks mint/burn**: `explicitRecoveryBlocksMintBurn: true`;
- **a B5 verified remote write is a prerequisite**: no export id / sequence burn without
  `remote-write-observed-checksum-verified`;
- **B5 remote-newer / checksum mismatch / partial write blocks the sequence burn**: each B5 conflict/partial-write class
  blocks the sequence burn and export-id mint (per section 3).

## 7. Privacy (design)

- export id and sequence evidence are hash-only / redacted where they reference target/payload material
  (`exportIdRefHash`, `burnedSequenceRefHash`, `sequenceExportConstraintRef`);
- no raw endpoint URL: `rawEndpointLogged: false`;
- no raw credential: `rawCredentialLogged: false`;
- no raw remote path: `rawRemotePathLogged: false`;
- no raw payload body: `rawPayloadBodyStored: false`;
- no CAS keys: `casKeysExposed: false`, `touchChatSavingCas: false`.

## 8. Relationship to a950 / CAS / fullBundle

- no cleanup / a950 mutation authority: `noCleanupAuthority: true`, `noA950Mutation: true`;
- `row:a950a44b859f` remains documented/quarantined debt and stays OUT of the exportable payload; the minted export id
  covers only the `fullBundle.v2` exportable projection, from which a950 is already quarantined;
- Chat Saving CAS remains SEPARATE: sequence/export-id semantics never touch the Chat Saving archive CAS;
- the `fullBundle.v2` envelope remains selected (`payloadSchema: 'h2o.studio.fullBundle.v2'`); `fullBundle.v3` remains
  deferred and is not introduced by this design.

## All Gap-Review Blockers Now Design-Specified

With B6 designed, all eight gap-review blockers plus the B7/B8 pair are design-specified:

- **B1** target config + credentials + peer identity - designed (`b2e10531`);
- **B2** kill-switch real lifecycle - designed (`09bf7701`);
- **B3** durable idempotency store - designed (`e1618571`);
- **B4** real enqueue / outbox boundary - designed (`0b6ed75e`);
- **B5** conflict / partial-write handling - designed (`e60e00f0`);
- **B6** sequence / export-id semantics - designed (this slice);
- **B7** `transportReady` policy - designed (`26e6241b`);
- **B8** real-transport approval contract - designed (`26e6241b`).

Design-specified is NOT implemented and NOT approved. No real-transport approval is accepted, `transportReady` and
`productSyncReady` stay `false`, and real transport remains blocked.

## Recommended Next Lane After B6

**A consolidated real-transport implementation-readiness rollup (design/evidence only)**: a single handoff manifest
that confirms B1-B8 are all design-specified, restates the boundaries preserved (`fullBundle.v2`-only /
`fullBundle.v3`-deferred, Chat Saving CAS separate, a950 quarantined, `productSyncReady:false`), and states the exact
gated order to a first controlled real write - which still requires (a) an accepted real-transport approval per the B8
contract, (b) the B7 readiness decision in a dedicated flip slice, and (c) a controlled real write that is dry-run
first, `fullBundle.v2` only, CAS-separate, kill-switch + gate + approval gated, and fail-closed on restart. Real
transport does not start from the rollup; it only confirms the design set is complete and re-states the approval gate.

## Can Real Transport Start Now?

**No.** B6 is a design-only specification; although B1-B8 are now all design-specified, none is implemented or approved;
no export id is minted; no sequence is burned; no real-transport approval is accepted; `transportReady` and
`productSyncReady` stay `false`. This design authorizes nothing.

## Boundaries Held

- No sequence/export-id behavior implemented; no export id minted; no sequence burned; no export state mutated; no
  schema minted in source.
- No raw endpoint URL, raw credential, raw remote path, or raw payload body stored/logged anywhere (hash-only / redacted
  references only).
- No real WebDAV/cloud/relay/CAS/file write; no relay enqueue.
- No `fullBundle.v3` start/mint.
- `productSyncReady` not flipped - remains `false`; `transportReady` not set true; `realTransportApprovalAccepted`
  remains `false`; `realWebDAVTransportAvailable` remains `false`.
- `row:a950a44b859f` not cleaned or mutated; no cleanup authority introduced; no real transport write authorization
  introduced.
- Chat Saving CAS untouched (blocked/deferred).
- No product source edited; no unrelated Studio-lane files touched.

## Final State

The B6 real sequence / export-id semantics (mint only at verified write, burn only after verified write, atomic
rollback with no dangling mint/burn on failure/uncertainty/recovery, bound to B3 idempotency and gated by B4/B5) is
designed (design-only, hash-only / redacted, no raw values). With B6 designed, B1-B8 are all design-specified. Real
transport remains blocked and cannot start now: no real-transport approval is accepted, `transportReady:false` and
`productSyncReady:false` remain authoritative, `fullBundle.v3` stays deferred, and Chat Saving CAS stays
blocked/deferred.
