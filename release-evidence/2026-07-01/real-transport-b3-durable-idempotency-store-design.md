# Real-Transport B3 - Durable Idempotency Store - Design

Verdict: **B3 DURABLE REAL-TRANSPORT IDEMPOTENCY STORE IS DESIGNED (DESIGN / SPECIFICATION ONLY) - NOTHING IS
IMPLEMENTED OR MINTED IN SOURCE, NO DURABLE STORE / KEY / ROW IS CREATED, ALL RECORDS ARE HASH-ONLY / REDACTED, AND NO
RAW ENDPOINT / CREDENTIAL / PATH / BUNDLE-BODY VALUE APPEARS ANYWHERE. B4-B6 REMAIN OPEN BLOCKERS. THIS DESIGN
AUTHORIZES NO REAL WRITE, NO FLIP, AND NO CLEANUP**.

This is a design/specification evidence + validator slice only. It does not implement a durable idempotency store, does
not create any store/key/row, does not implement real WebDAV/cloud/relay transport, does not add real credentials, does
not log raw endpoint/credential/path values, does not write to real WebDAV/cloud/relay/CAS/files, does not enqueue
relay, does not mint or start `fullBundle.v3`, does not mutate export state, does not mint an export id, does not burn
sequence, does not flip `productSyncReady`, does not set `transportReady:true`, and does not clean or mutate
`row:a950a44b859f`. No schema is minted in source.

## Anchors Respected

- B2 real controlled-write kill-switch lifecycle design: `09bf7701`.
- B1 real target config + credentials + peer identity design: `b2e10531`.
- B8 + B7 real-transport approval contract and `transportReady` policy design: `26e6241b`.
- Real WebDAV/cloud/relay transport readiness gap review (B1-B8): `d2bea4c0`.
- Controlled local mock WebDAV transport final rollup: `15a33852`.

## Scope

This slice designs blocker B3 (the durable real-transport idempotency store), so that duplicate real WebDAV/cloud/relay
attempts are prevented across restart/reload. It does NOT design or close B4-B6, which remain open. It is a
specification only: no durable store, key, table, or row is created, and nothing is implemented in source.

## Design-Only Redaction Rule (applies to this entire design)

Every idempotency record is hash-only / redacted. No raw endpoint URL, no raw credential, no raw remote path, no raw
peer URL, and no raw bundle body is ever stored in the idempotency record, evidence, logs, or state. This design
document itself contains ZERO raw endpoint URLs, raw credentials, raw remote paths, or raw bundle bodies - only redacted
reference field names and hash-only placeholders.

## 1. Durable Idempotency Record Ownership (design)

- **Proposed store / key namespace**: `h2o:sync:real-transport-idempotency:v1` (a Desktop-authority durable KV store),
  with a proposed record schema `h2o.desktop.sync.real-transport-idempotency-record.v1`. Design-only; not created in
  source.
- **Desktop authority vs Chrome/local surface boundary**: the idempotency store is DESKTOP-authority only. Chrome/local
  surfaces never own or write real-transport idempotency records; a Chrome/local surface can never authorize or dedupe a
  real remote write.
- **Relationship to existing relay outbox / publication ledger**: the idempotency store is SEPARATE from the relay
  outbox (`h2o:sync:relay-outbox:v1`) and the publication ledger (`h2o:sync:publication-ledger:v1`). It records the
  idempotency state of a real-transport operation; it does not replace the outbox (B4) or the ledger. Its
  `idempotencyKeyHash` may be referenced by an outbox row (B4) so the outbox and the store agree on the same key.
- **Relationship to B4 real enqueue boundary**: B4 defines the durable outbox row + enqueue boundary and retry/resume;
  B3 defines the idempotency KEY and record that B4 consults so an enqueue/retry never repeats a completed remote write.
  B3 does not itself enqueue.

## 2. Idempotency Key Material (design)

The `idempotencyKeyHash` is derived (hash-only) from the tuple of:

- `candidatePayloadHash` (payload hash);
- `candidateBundleHash` (bundle / projection hash);
- the B1 target hashes: `endpointRefHash`, `remoteRootRefHash`, `peerIdentityBindingHash`, and `credentialRefHash`
  (credential REFERENCE only, never a raw credential);
- the B2 kill-switch enable token hash: `killSwitchEnableTokenHash`;
- the B8 approval reference hash: `b8ApprovalRefHash`;
- the future B6 sequence/export constraints: `sequenceExportConstraintRef` (a redacted reference; B6 remains open);
- `operationKind` (for example `real-webdav-cloud-relay-upload`);
- `activeTransport` (for example the resolved real transport mode).

Any change to payload, bundle, target, kill-switch token, approval, sequence constraint, operation kind, or active
transport yields a DIFFERENT `idempotencyKeyHash` - so a changed payload/target is never treated as a duplicate.

## 3. Record Lifecycle (design)

A real-transport idempotency record moves through explicit states (design-only):

- `preflight-observed`;
- `apply-intent-recorded`;
- `remote-write-pending`;
- `remote-write-observed`;
- `ledger-pending`;
- `completed`;
- `failed`;
- `explicit-recovery-required` (the B2 mid-flight-disable / partial-write recovery state);
- `duplicate-replay-noop`.

Transitions are forward-only per key; a `completed` record is terminal for that key and never re-enters
`remote-write-pending`.

## 4. Restart / Reload Behavior (design)

- **duplicate replay after restart must be no-op if completed**: a real attempt whose `idempotencyKeyHash` is already
  `completed` resolves to `duplicate-replay-noop` with zero additional remote write;
- **pending state must not auto-write**: a `remote-write-pending` or `apply-intent-recorded` record after restart does
  NOT auto-resume into a real write;
- **`remote-write-pending` after restart must enter recovery/reconcile, not blind retry**: it transitions to
  `explicit-recovery-required` for a separate reviewed reconciliation; there is no blind retry;
- **missing controlled gate blocks resume**: a resume without the controlled apply gate is blocked;
- **disabled kill switch blocks resume**: a resume with a disabled/missing B2 kill switch is blocked.

This is consistent with the local mock restart/reload proof (fail-closed, no auto-dispatch) and the B7 policy.

## 5. Failure Modes (design)

- missing idempotency record -> `real-transport-b3-idempotency-record-missing`;
- corrupted idempotency record -> `real-transport-b3-idempotency-record-corrupted`;
- target hash mismatch -> `real-transport-b3-target-hash-mismatch`;
- payload hash mismatch -> `real-transport-b3-payload-hash-mismatch`;
- approval hash mismatch -> `real-transport-b3-approval-hash-mismatch`;
- kill-switch token mismatch / stale -> `real-transport-b3-kill-switch-token-mismatch`;
- sequence / export constraint mismatch -> `real-transport-b3-sequence-constraint-mismatch`;
- duplicate with changed payload / target -> `real-transport-b3-duplicate-changed-payload-target` (NOT deduplicated;
  treated as a new, separately gated operation).

## 6. Privacy / Evidence (design)

- hash-only record: `idempotencyRecordHashOnly: true`; every field is a redacted reference / hash;
- no raw endpoint/credential/path/peer URL: `rawEndpointLogged: false`, `rawCredentialLogged: false`,
  `rawRemotePathLogged: false`, `rawPeerUrlLogged: false`;
- no raw bundle body: `rawBundleBodyStored: false` - the record stores only `candidateBundleHash`, never the bundle
  body;
- no CAS keys: `casKeysExposed: false`, `touchChatSavingCas: false` - the idempotency store is for the WebDAV/cloud/relay
  transport only and never the Chat Saving archive CAS.

## 7. Relationship to B7 / B8

- **the idempotency store alone does not make `transportReady` true**: a durable idempotency store is necessary but not
  sufficient; `transportReady:false` remains until B1-B6 and B8 are closed and a separate reviewed readiness decision is
  made;
- **the idempotency store does not replace the real approval**: a record without an accepted B8 approval reference is
  blocked; the store dedupes, it does not authorize;
- **the idempotency store does not replace the kill switch**: a record with a disabled/missing B2 kill switch is
  blocked.

## 8. Relationship to a950

- `row:a950a44b859f` remains documented/quarantined debt; the idempotency store has NO cleanup or a950 mutation
  authority (`noCleanupAuthority: true`, `noA950Mutation: true`). It never cleans or mutates a950.

## 9. Relationship to fullBundle

- the `fullBundle.v2` envelope remains selected (`payloadSchema: 'h2o.studio.fullBundle.v2'`);
- `fullBundle.v3` remains deferred and is not introduced by this design unless a later design explicitly requires it.

## Remaining Blockers (B4-B6 still open)

- **B4** real-enqueue-boundary-undesigned.
- **B5** real-conflict-partial-write-handling-missing.
- **B6** real-sequence-export-id-semantics-undesigned.

B3 (this design) is now specified as design-only; it is not implemented, minted, or created.

## Recommended Next Lane After B3

**B4 - real enqueue / outbox boundary (design-only): whether a real enqueue writes a durable outbox row, the exact
enqueue boundary, and retry/resume behavior (bounded, no duplicate remote write on resume, consulting the B3
idempotency store).** Then B5 + B6 (conflict/partial-write + sequence/export-id + rollback). Only after B1-B6 are closed
AND a real-transport approval per the B8 contract is accepted AND the B7 readiness decision is made in a dedicated flip
slice may a controlled real write be attempted - dry-run first, `fullBundle.v2` only, CAS-separate, kill-switch + gate +
approval gated, fail-closed on restart.

## Can Real Transport Start Now?

**No.** B3 is a design-only specification; B4-B6 remain open; no durable store is created; no real-transport approval is
accepted; `transportReady` and `productSyncReady` stay `false`. This design authorizes nothing.

## Boundaries Held

- No durable idempotency store implemented; no store/key/table/row created; no schema minted in source.
- No raw endpoint URL, raw credential, raw remote path, raw peer URL, or raw bundle body stored/logged anywhere
  (hash-only / redacted references only).
- No real WebDAV/cloud/relay/CAS/file write; no relay enqueue.
- No `fullBundle.v3` start/mint; no export-state mutation; no export id minted; no sequence burned.
- `productSyncReady` not flipped - remains `false`; `transportReady` not set true; `realTransportApprovalAccepted`
  remains `false`; `realWebDAVTransportAvailable` remains `false`.
- `row:a950a44b859f` not cleaned or mutated; no cleanup authority introduced; no real transport write authorization
  introduced.
- Chat Saving CAS untouched (blocked/deferred).
- No product source edited; no unrelated Studio-lane files touched.

## Final State

The B3 durable real-transport idempotency store (Desktop-authority `h2o:sync:real-transport-idempotency:v1`, hash-only
record, forward-only lifecycle, restart-safe duplicate no-op / recovery-not-blind-retry) is designed (design-only, no
raw values). Real transport remains blocked and cannot start now: B4-B6 remain open, no real-transport approval is
accepted, `transportReady:false` and `productSyncReady:false` remain authoritative, `fullBundle.v3` stays deferred, and
Chat Saving CAS stays blocked/deferred.
