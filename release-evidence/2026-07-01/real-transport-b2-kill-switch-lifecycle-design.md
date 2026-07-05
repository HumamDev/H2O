# Real-Transport B2 - Real Kill-Switch Lifecycle - Design

Verdict: **B2 REAL CONTROLLED-WRITE KILL-SWITCH LIFECYCLE IS DESIGNED (DESIGN / SPECIFICATION ONLY) - NOTHING IS
IMPLEMENTED OR MINTED IN SOURCE, NO REAL KILL-SWITCH STATE IS CHANGED, ALL EVIDENCE IS HASH-ONLY / REDACTED, AND NO RAW
ENDPOINT / CREDENTIAL / PATH VALUE APPEARS ANYWHERE. B3-B6 REMAIN OPEN BLOCKERS. THIS DESIGN AUTHORIZES NO REAL WRITE,
NO FLIP, AND NO CLEANUP**.

This is a design/specification evidence + validator slice only. It does not implement a real kill-switch lifecycle,
does not change any real kill-switch state, does not implement real WebDAV/cloud/relay transport, does not add real
credentials, does not log raw endpoint/credential/path values, does not write to real WebDAV/cloud/relay/CAS/files,
does not enqueue relay, does not mint or start `fullBundle.v3`, does not mutate export state, does not mint an export
id, does not burn sequence, does not flip `productSyncReady`, does not set `transportReady:true`, and does not clean or
mutate `row:a950a44b859f`. No schema is minted in source.

## Anchors Respected

- B1 real target config + credentials + peer identity design: `b2e10531`.
- B8 + B7 real-transport approval contract and `transportReady` policy design: `26e6241b`.
- Real WebDAV/cloud/relay transport readiness gap review (B1-B8): `d2bea4c0`.
- Controlled local mock WebDAV transport final rollup: `15a33852`.
- Controlled-write kill switch (existing dry-run/mock evaluator): `edb30677`.

## Scope

This slice designs blocker B2 (the real controlled-write kill-switch lifecycle). It builds on the existing dry-run/mock
kill-switch evaluator (gate `webdav-controlled-write-kill-switch-evaluate`), which today only gates a MODELED apply. It
does NOT design or close B3-B6, which remain open. It is a specification only: no real kill-switch state is created,
enabled, disabled, or persisted, and nothing is implemented in source.

## Design-Only Redaction Rule (applies to this entire design)

All kill-switch evidence is hash-only / redacted. No raw endpoint URL, no raw credential, and no raw remote path is ever
stored in kill-switch evidence, logs, receipts, or state. This design document itself contains ZERO raw endpoint URLs,
raw credentials, or raw remote paths - only redacted reference field names and hash-only placeholders.

## 1. Explicit Enable Path (design)

Enabling the real kill switch requires a reviewed operator action; it is never enabled by default and never enabled
implicitly:

- reviewed operator action required: `reviewedKillSwitchEnableApproved: true` with `operatorIdHash` / `reviewIdHash`
  (redacted);
- exact scope: `killSwitchScope: 'real-webdav-cloud-relay-controlled-write'` (NOT a local mock scope);
- target hashes from B1 required: `endpointRefHash`, `remoteRootRefHash`, `peerIdentityBindingHash`, `credentialRefHash`
  (all redacted; a missing one blocks);
- B8 approval reference required: `b8ApprovalRef` (a redacted reference to an accepted B8 real-transport approval);
- B7 readiness policy reference required: `b7ReadinessPolicyRef` (a redacted reference to the B7 `transportReady`
  policy);
- the enable produces a redacted `killSwitchEnableTokenHash` bound to the target hashes + B8 approval ref, with an
  explicit expiry (`enableTokenExpiresAtIso`) so a stale token cannot re-enable a later operation.

## 2. Explicit Disable Path (design)

- **emergency disable**: `killSwitchEmergencyDisable: true` immediately transitions the switch to disabled and is
  durable (survives restart); it takes precedence over any enable token;
- **normal disable after operation**: `killSwitchNormalDisable: true` disables after a completed operation;
- **disable before write must block**: if disabled before the remote write begins, the write is blocked
  (`real-transport-b2-kill-switch-disabled-before-write`);
- **disable after preflight must block apply**: if disabled after preflight but before apply, the apply is blocked
  (`real-transport-b2-kill-switch-disabled-after-preflight`).

## 3. Mid-Flight Disable Behavior (design)

- **if disabled before remote write, fail closed**: no remote write starts;
- **if disabled after remote write but before ledger/sequence, enter explicit recovery state**:
  `killSwitchMidFlightRecoveryState: 'explicit-recovery-required'` - the operation does NOT auto-complete; the durable
  outbox/ledger (B4) records a recovery-required marker for a separate reviewed reconciliation;
- **no silent retry**: `noSilentRetry: true` - a mid-flight disable never silently retries the remote write;
- **no automatic resume into write**: `noAutoResumeIntoWrite: true` - a restart/reload after a mid-flight disable is
  fail-closed and never auto-resumes into a real write (consistent with the local mock restart/reload proof and B7).

## 4. Missing / Invalid Kill-Switch State (design)

- missing kill switch blocks -> `real-transport-b2-kill-switch-missing`;
- disabled kill switch blocks -> `real-transport-b2-kill-switch-disabled`;
- wrong scope blocks -> `real-transport-b2-kill-switch-scope-invalid`;
- stale enable token blocks -> `real-transport-b2-kill-switch-enable-token-stale`;
- target mismatch blocks -> `real-transport-b2-kill-switch-target-mismatch`.

## 5. Relationship to the Existing Mock Kill Switch

- **local mock kill switch is not real kill-switch approval**: the existing dry-run/mock kill-switch evaluator
  (`webdav-controlled-write-kill-switch-evaluate`) gates a MODELED apply only; enabling it does NOT enable a real
  controlled write, and a mock enable is not a reviewed real-transport kill-switch enable.
- **local mock target mode cannot enable real transport**: `targetMode:'local-mock-webdav'` can never enable the real
  kill switch; the real enable requires `targetMode` in `real-webdav` / `cloud` / `relay` plus the B1 target hashes.

## 6. Relationship to B8 Approval

- **real approval cannot override a disabled kill switch**: even with an accepted B8 approval, a disabled/missing kill
  switch blocks (`real-transport-b2-kill-switch-disabled`); approval does not re-enable the switch;
- **an enabled kill switch cannot replace approval**: an enabled kill switch without an accepted B8 approval is blocked
  (`real-transport-b2-kill-switch-approval-missing`);
- **both are required**: a real controlled write requires BOTH an enabled real kill switch AND an accepted B8 approval,
  bound to the same B1 target hashes.

## 7. Relationship to B7 transportReady

- **kill switch alone does not flip `transportReady`**: enabling the kill switch is necessary but not sufficient;
- **`transportReady:false` remains** until B1-B6 and B8 are closed and a separate reviewed readiness decision is made
  in a dedicated flip slice (per the B7 policy). The kill switch never flips `transportReady`.

## 8. Audit / Evidence Requirements (design)

- hash-only kill-switch evidence: `killSwitchEvidenceHashOnly: true`; every field is a redacted reference / hash;
- no raw endpoint/credential/path values: `rawEndpointLogged: false`, `rawCredentialLogged: false`,
  `rawRemotePathLogged: false`;
- no raw credential logs: the kill-switch state never stores or logs a raw credential (only `credentialRefHash`);
- no CAS keys: `casKeysExposed: false`, `touchChatSavingCas: false` - the kill switch governs the WebDAV/cloud/relay
  controlled write only and never the Chat Saving archive CAS.

## 9. Failure Modes

- enable without B1 target hashes -> `real-transport-b2-kill-switch-target-hashes-missing`;
- enable without B8 approval reference -> `real-transport-b2-kill-switch-approval-missing`;
- enable while a `productSyncReady` / `transportReady` mismatch is hidden -> `real-transport-b2-kill-switch-readiness-mismatch-hidden`;
- disable mid-flight -> `real-transport-b2-kill-switch-mid-flight-disabled` (enter explicit recovery; no silent retry);
- stale enable token -> `real-transport-b2-kill-switch-enable-token-stale`;
- wrong peer / remote root -> `real-transport-b2-kill-switch-target-mismatch`;
- local mock approval supplied as real approval -> `real-transport-b2-kill-switch-local-mock-not-accepted`.

## Remaining Blockers (B3-B6 still open)

- **B3** durable-idempotency-store-missing.
- **B4** real-enqueue-boundary-undesigned.
- **B5** real-conflict-partial-write-handling-missing.
- **B6** real-sequence-export-id-semantics-undesigned.

B2 (this design) is now specified as design-only; it is not implemented, minted, enabled, disabled, or approved.

## Recommended Next Lane After B2

**B3 - durable idempotency store (design-only): where idempotency records live, duplicate replay after app restart, and
avoiding repeated remote writes.** Then B4 (real enqueue/outbox boundary + retry/resume, which also records the B2
mid-flight recovery-required marker), then B5 + B6 (conflict/partial-write + sequence/export-id + rollback). Only after
B1-B6 are closed AND a real-transport approval per the B8 contract is accepted AND the B7 readiness decision is made in
a dedicated flip slice may a controlled real write be attempted - dry-run first, `fullBundle.v2` only, CAS-separate,
kill-switch + gate + approval gated, fail-closed on restart.

## Can Real Transport Start Now?

**No.** B2 is a design-only specification; B3-B6 remain open; no real kill-switch state is created or changed; no
real-transport approval is accepted; `transportReady` and `productSyncReady` stay `false`. This design authorizes
nothing.

## Boundaries Held

- No real kill-switch lifecycle implemented; no real kill-switch state created/enabled/disabled/persisted; no schema
  minted in source.
- No raw endpoint URL, raw credential, or raw remote path stored/logged anywhere (hash-only / redacted references only).
- No real WebDAV/cloud/relay/CAS/file write; no relay enqueue.
- No `fullBundle.v3` start/mint; no export-state mutation; no export id minted; no sequence burned.
- `productSyncReady` not flipped - remains `false`; `transportReady` not set true; `realTransportApprovalAccepted`
  remains `false`; `realWebDAVTransportAvailable` remains `false`.
- `row:a950a44b859f` not cleaned or mutated; no cleanup authority introduced; no real transport write authorization
  introduced.
- Chat Saving CAS untouched (blocked/deferred); local mock kill switch is not real kill-switch approval.
- No product source edited; no unrelated Studio-lane files touched.

## Final State

The B2 real controlled-write kill-switch lifecycle (explicit enable / explicit disable / emergency disable / mid-flight
fail-closed + explicit recovery) is designed (design-only, hash-only / redacted, no raw values). Real transport remains
blocked and cannot start now: B3-B6 remain open, no real-transport approval is accepted, `transportReady:false` and
`productSyncReady:false` remain authoritative, `fullBundle.v3` stays deferred, and Chat Saving CAS stays
blocked/deferred.
