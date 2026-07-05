# Real-Transport B1 - Target Config + Credentials + Peer Identity - Design

Verdict: **B1 REAL WEBDAV/CLOUD/RELAY TARGET CONFIG + CREDENTIAL HANDLING + PEER IDENTITY IS DESIGNED (DESIGN /
SPECIFICATION ONLY) - NOTHING IS IMPLEMENTED OR MINTED IN SOURCE, NO REAL TARGET / CREDENTIAL / ENDPOINT IS ADDED, ALL
IDENTITY IS HASH-ONLY / REDACTED, AND NO RAW ENDPOINT / CREDENTIAL / PATH VALUE APPEARS ANYWHERE. B2-B6 REMAIN OPEN
BLOCKERS. THIS DESIGN AUTHORIZES NO REAL WRITE, NO FLIP, AND NO CLEANUP**.

This is a design/specification evidence + validator slice only. It does not implement real WebDAV/cloud/relay target
config or credential handling, does not add real credentials, does not log raw endpoint/credential/path values, does
not write to real WebDAV/cloud/relay/CAS/files, does not enqueue relay, does not mint or start `fullBundle.v3`, does not
mutate export state, does not mint an export id, does not burn sequence, does not flip `productSyncReady`, does not set
`transportReady:true`, and does not clean or mutate `row:a950a44b859f`. No schema is minted in source.

## Anchors Respected

- B8 + B7 real-transport approval contract and `transportReady` policy design: `26e6241b`.
- Real WebDAV/cloud/relay transport readiness gap review (B1-B8): `d2bea4c0`.
- Controlled local mock WebDAV transport final rollup: `15a33852`.
- Final transport-readiness rollup (transport not started): `40f52a5f`.
- Controlled-write kill switch: `edb30677`.

## Scope

This slice designs blocker B1 (real target config + credentials + peer identity), the gap-review prerequisite that the
B8 approval contract references. It does NOT design or close B2-B6, which remain open. It is a specification only: no
real target, endpoint, remote root, credential, or peer binding is added, and nothing is implemented in source.

## Design-Only Redaction Rule (applies to this entire design)

Every target/credential/peer value in the real-transport model is represented ONLY by a redacted, hash-only reference
(for example `sha256:<...>`). No raw endpoint URL, no raw credential, and no raw remote path is ever stored in
evidence, logs, receipts, or approvals. This design document itself contains ZERO raw endpoint URLs, raw credentials,
or raw remote paths - only redacted reference field names and hash-only placeholders.

## 1. Real WebDAV Target Identity (design)

- **Endpoint reference model**: the real endpoint is referenced ONLY by `endpointRefHash` (a redacted, hash-only
  reference derived from the resolved endpoint). The raw endpoint URL is never stored, logged, or surfaced.
- **Remote root reference model**: the remote root (the sync folder root on the target) is referenced ONLY by
  `remoteRootRefHash`. The raw remote path is never stored, logged, or surfaced.
- **Peer identity binding model**: the target peer is bound by `peerIdentityBindingHash` - a redacted binding that ties
  the target to a verified peer identity (device/account), so a payload can only be applied to the intended peer.
- **Local device/client identity relationship**: the local device is referenced by `localClientIdentityHash` (redacted)
  and is paired with the peer via `peerIdentityBindingHash`. The local client identity is distinct from the peer
  identity; the binding records the (localClientIdentityHash, peerIdentityBindingHash) pair, never raw identifiers.

## 2. Credential Handling (design)

- **Credential reference only**: credentials are represented ONLY by `credentialRefHash` (a redacted reference to a
  credential held by the platform credential store). The raw credential is never present in this lane's evidence, logs,
  receipts, or approvals.
- **No raw credentials in evidence/logs**: `rawCredentialLogged: false` is required; any raw credential input is
  rejected.
- **No raw endpoint URLs in evidence/logs**: `rawEndpointLogged: false` is required; any raw endpoint input is rejected.
- **No raw remote paths in evidence/logs**: `rawRemotePathLogged: false` is required; any raw remote path input is
  rejected.
- **Hash-only / redacted evidence**: `privacyHashOnly: true` is required for the whole B1 target model; every
  target/credential/peer field is a hash-only reference.

## 3. Target Validation (design)

The B1 target validation (design-only) must:

- reject an ambiguous target -> `real-transport-b1-target-ambiguous`;
- reject a missing peer binding -> `real-transport-b1-peer-binding-missing`;
- reject a missing remote root -> `real-transport-b1-remote-root-missing`;
- reject a missing credential reference -> `real-transport-b1-credential-ref-missing`;
- reject a missing endpoint reference -> `real-transport-b1-endpoint-ref-missing`;
- reject any raw endpoint / credential / path input in evidence -> `real-transport-b1-raw-input-rejected`.

## 4. Boundary With Existing Local Mock

- **Local mock target is not real target**: `targetMode:'local-mock-webdav'` is NOT a real WebDAV/cloud/relay target;
  the real target requires `targetMode` in `real-webdav` / `cloud` / `relay` plus the redacted identity references
  above.
- **Local mock approval is not real transport approval**: `controlledLocalMockApplyApproved` (scope
  `local-mock-webdav-target-only`) does not satisfy the B8 real-transport approval; `realTransportApprovalAccepted`
  stays `false`.
- **Local mock idempotency target hashes are not real WebDAV identity**: the local mock `peerTargetHash` /
  `remoteRootRefHash` used in the modeled apply are mock placeholders; they are NOT a real peer identity binding or real
  remote root. Real transport requires a real `peerIdentityBindingHash` + `endpointRefHash` + `credentialRefHash`.

## 5. Relationship to B8 Approval Contract

- The B8 real-transport approval MUST reference the B1 target hashes: `peerIdentityBindingHash`, `endpointRefHash`,
  `remoteRootRefHash`, and `credentialRefHash` (all redacted).
- A real-transport approval cannot be accepted without B1 closure: if the B1 target model is not closed (a target hash
  is missing or a raw value is supplied), the B8 approval is blocked and `realTransportApprovalAccepted` stays `false`.

## 6. Relationship to B7 transportReady

- `transportReady:false` remains until B1 AND B2-B6 are closed (and the B8 approval is accepted, per the B7 policy).
- **B1 alone does not flip `transportReady`.** Closing B1 is necessary but not sufficient; `transportReady:true` still
  requires B2-B6 + B8 and a separate explicit reviewed readiness decision.

## 7. Relationship to CAS

- Chat Saving CAS remains SEPARATE. The WebDAV/cloud target config and credentials must NOT expose or touch Chat Saving
  archive CAS keys: `touchChatSavingCas: false` and `casKeysExposed: false` are required. The B1 credential reference is
  for the WebDAV/cloud transport target only and never the Chat Saving archive CAS.

## 8. Failure Modes

- missing endpoint ref -> `real-transport-b1-endpoint-ref-missing`;
- missing credential ref -> `real-transport-b1-credential-ref-missing`;
- raw endpoint logged -> `real-transport-b1-raw-endpoint-logged`;
- raw credential logged -> `real-transport-b1-raw-credential-logged`;
- peer mismatch -> `real-transport-b1-peer-mismatch`;
- remote root mismatch -> `real-transport-b1-remote-root-mismatch`;
- ambiguous target -> `real-transport-b1-target-ambiguous`;
- local mock target mistakenly supplied as real target -> `real-transport-b1-local-mock-target-not-real`.

## Remaining Blockers (B2-B6 still open)

- **B2** kill-switch-real-lifecycle-missing.
- **B3** durable-idempotency-store-missing.
- **B4** real-enqueue-boundary-undesigned.
- **B5** real-conflict-partial-write-handling-missing.
- **B6** real-sequence-export-id-semantics-undesigned.

B1 (this design) is now specified as design-only; it is not implemented, minted, or approved.

## Recommended Next Lane After B1

**B2 - real kill-switch lifecycle (design-only): explicit enable path, emergency disable path, and mid-flight disable
behavior.** Then B3 + B4 (durable idempotency + real enqueue/outbox + retry/resume), then B5 + B6 (conflict/partial-write
+ sequence/export-id + rollback). Only after B1-B6 are closed AND a real-transport approval per the B8 contract is
accepted AND the B7 readiness decision is made in a dedicated flip slice may a controlled real write be attempted -
dry-run first, `fullBundle.v2` only, CAS-separate, kill-switch + gate + approval gated, fail-closed on restart.

## Can Real Transport Start Now?

**No.** B1 is a design-only specification; B2-B6 remain open; no real target/credential is implemented; no real-transport
approval is accepted; `transportReady` and `productSyncReady` stay `false`. This design authorizes nothing.

## Boundaries Held

- No real target config or credential handling implemented; no real credential added; no schema minted in source.
- No raw endpoint URL, raw credential, or raw remote path stored/logged anywhere (hash-only / redacted references only).
- No real WebDAV/cloud/relay/CAS/file write; no relay enqueue.
- No `fullBundle.v3` start/mint; no export-state mutation; no export id minted; no sequence burned.
- `productSyncReady` not flipped - remains `false`; `transportReady` not set true; `realTransportApprovalAccepted`
  remains `false`; `realWebDAVTransportAvailable` remains `false`.
- `row:a950a44b859f` not cleaned or mutated; no cleanup authority introduced; no real transport write authorization
  introduced.
- Chat Saving CAS untouched (blocked/deferred); local mock target is not treated as real target.
- No product source edited; no unrelated Studio-lane files touched.

## Final State

The B1 real WebDAV/cloud/relay target config + credential handling + peer identity model is designed (design-only,
hash-only / redacted, no raw values). Real transport remains blocked and cannot start now: B2-B6 remain open, no
real-transport approval is accepted, `transportReady:false` and `productSyncReady:false` remain authoritative,
`fullBundle.v3` stays deferred, and Chat Saving CAS stays blocked/deferred.
