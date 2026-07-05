# Real-Transport B2 - Controlled-Write Kill-Switch Lifecycle - Implementation

Verdict: **B2 REAL CONTROLLED-WRITE KILL-SWITCH LIFECYCLE SUBSTRATE IMPLEMENTED AS A NON-WRITING, HASH-ONLY
EVALUATE/DIAGNOSE MODULE - IT DOES NOT ENABLE REAL TRANSPORT, DOES NOT ENABLE OR DISABLE ANY REAL KILL-SWITCH STATE,
DOES NOT MAKE REAL WEBDAV AVAILABLE, DOES NOT ACCEPT A REAL-TRANSPORT APPROVAL, DOES NOT FLIP `productSyncReady` OR
`transportReady`, AND STORES / LOGS NO RAW ENDPOINT / CREDENTIAL / PATH VALUE. B3-B6 IMPLEMENTATION REMAINS OPEN. THIS
SLICE AUTHORIZES NO REAL WRITE, NO FLIP, AND NO CLEANUP**.

This implementation is non-writing and non-activating with respect to transport. It does not write to real
WebDAV/cloud/relay/CAS/files, does not enqueue relay, does not add real credentials, does not log raw
endpoint/credential/path values, does not mint or start a fullBundle v3 payload, does not mutate export state, does not
mint an export id, does not burn sequence, does not flip `productSyncReady`, does not set `transportReady:true`, and
does not clean or mutate `row:a950a44b859f`.

## Anchors Respected

- B2 real controlled-write kill-switch lifecycle design: `09bf7701`.
- B1 real target config + credentials + peer identity implementation: `93eb9065`.
- B1 real target config + credentials + peer identity design: `b2e10531`.
- Real-transport B1-B8 implementation-readiness rollup: `36e46513`.

## Source Change (focused, single new standalone module)

- New module: `src-surfaces-base/studio/sync/real-transport-kill-switch.js`.
- Exposed API: `H2O.Studio.sync.realTransportKillSwitch.evaluateRealTransportKillSwitch(request)` (plus `diagnose()`
  and schema/scope constants).
- The module is a self-bootstrapping IIFE that follows the B1 substrate pattern (local `safeObject` / `cleanString` /
  `hashLike` / raw-input detection helpers, a result object + `blockers[]`, an `__installed` guard). It is a PURE
  evaluator: it validates a kill-switch lifecycle request and returns a validation result; it performs no I/O, no
  persistence, no transport, and it never enables or disables any real kill-switch state.

### Wired or standalone: intentionally standalone (non-activating)

The module is present as product source but is intentionally NOT registered in the app loader (`studio.html` /
`tools/product/studio/pack-studio.mjs`) - matching B1. `studio.html` is currently modified by a concurrent Studio lane
and is not touched or staged by this slice. Wiring/activation is a later gated step; keeping B2 standalone keeps it
strictly non-transport-enabling. The B2 contract is proven by re-executing the real module directly in a Node `vm`
sandbox in the validator. The B1 module and `webdav-transport-gates.js` are unchanged.

## B2 Implementation Semantics

`evaluateRealTransportKillSwitch(request)` validates a hash-only kill-switch lifecycle request across an `operation`
selector (`enable` / `disable` / `apply` / `mid-flight`) and returns a redacted result:

- **Hash-only references only**: `endpointRefHash`, `remoteRootRefHash`, `credentialRefHash`, `peerIdentityBindingHash`,
  `localClientIdentityHash`, `killSwitchEnableTokenHash`, `b8ApprovalRefHash`, `b7ReadinessPolicyRefHash` - each accepted
  only as `sha256:<64hex>`. Credential handling is reference-only (`credentialReferenceOnly:true`).
- **Explicit enable** (`operation:'enable'`) requires: a reviewed operator marker
  (`reviewedKillSwitchEnableApproved:true`); scope exactly `real-webdav-cloud-relay-controlled-write`; the B1 target
  hashes; the B8 approval reference hash; the B7 readiness policy reference hash; a non-stale enable token hash; and
  `productSyncReady:false` / `transportReady:false` visible. A well-formed enable request returns
  `realKillSwitchLifecycleReady:true` (validation readiness ONLY - never transport enablement).
- **Explicit disable** (`operation:'disable'`) is fail-safe: emergency / normal disable model a closed switch
  (`failClosed:true`); `disableBeforeWrite` blocks a hypothetical write; `disableAfterPreflight` blocks apply.
- **Mid-flight** (`operation:'mid-flight'`): disabled before a remote write models `failClosed:true`; disabled after a
  remote write but before ledger/sequence models `killSwitchMidFlightRecoveryState:'explicit-recovery-required'` with
  `explicitRecoveryRequired:true`. `noSilentRetry:true` and `noAutoResumeIntoWrite:true` are always set.

### Valid evaluation result (enable)

- `ok:true`
- `status:"real-transport-b2-kill-switch-lifecycle-ready"`
- `realKillSwitchLifecycleReady:true`
- `realWebDAVTransportAvailable:false`
- `realTransportApprovalAccepted:false`
- `productSyncReady:false`
- `transportReady:false`
- `credentialReferenceOnly:true`
- `chatSavingCasBlocked:true`
- `fullBundleV3Started:false`
- `noCleanupAuthority:true`
- `blockers:[]`

### Non-activation invariants (hardcoded, not request-controllable)

The result always reports `realWebDAVTransportAvailable:false`, `realTransportApprovalAccepted:false`,
`productSyncReady:false`, `transportReady:false`, `writesWebDAV/writesCloud/writesRelay/enqueuesRelay/writesCAS/
writesFiles/touchChatSavingCas:false`, `mutatesExportState/mintsExportId/burnsSequence/fullBundleV3Started:false`,
`chatSavingCasBlocked:true`, `noCleanupAuthority:true`, `noA950Mutation:true` - regardless of any request field.
`realKillSwitchLifecycleReady` may be `true` ONLY as a validation readiness signal for a well-formed enable request; it
never enables real transport. A request that tries to set `realWebDAVTransportAvailable:true`,
`realTransportApprovalAccepted:true`, `productSyncReady:true`, `transportReady:true`, or any `write*` flag is IGNORED
(and a hidden `productSyncReady:true` / `transportReady:true` also blocks with
`real-transport-b2-kill-switch-readiness-mismatch-hidden`).

## Blocked Failure Modes

- missing kill switch -> `real-transport-b2-kill-switch-missing`;
- disabled kill switch (apply) -> `real-transport-b2-kill-switch-disabled`;
- wrong scope -> `real-transport-b2-kill-switch-scope-invalid`;
- missing reviewed enable marker -> `real-transport-b2-kill-switch-enable-review-missing`;
- missing B1 target hashes -> `real-transport-b2-kill-switch-target-hashes-missing`;
- missing B8 approval reference -> `real-transport-b2-kill-switch-approval-missing`;
- missing B7 policy reference -> `real-transport-b2-kill-switch-policy-missing`;
- missing enable token -> `real-transport-b2-kill-switch-enable-token-missing`;
- stale enable token -> `real-transport-b2-kill-switch-enable-token-stale`;
- target mismatch -> `real-transport-b2-kill-switch-target-mismatch`;
- disabled before write -> `real-transport-b2-kill-switch-disabled-before-write`;
- disabled after preflight -> `real-transport-b2-kill-switch-disabled-after-preflight`;
- mid-flight disable after remote write -> `real-transport-b2-kill-switch-mid-flight-disabled` (explicit recovery);
- readiness mismatch hidden -> `real-transport-b2-kill-switch-readiness-mismatch-hidden`;
- local mock kill switch / approval as real -> `real-transport-b2-kill-switch-local-mock-not-accepted`;
- raw endpoint/credential/path input -> `real-transport-b2-kill-switch-raw-input-rejected` (raw never stored/echoed).

## Boundaries Held

- B2 substrate is non-writing and never enables/disables any real kill-switch state (evaluate/validate only).
- No raw endpoint URL, raw credential, or raw remote path is stored, logged, or echoed (hash-only references; raw input
  rejected).
- B2 substrate does not make real transport available (`realWebDAVTransportAvailable:false`) and does not accept a
  real-transport approval (`realTransportApprovalAccepted:false`).
- No fullBundle v3 payload start/mint; no export-state mutation; no export id minted; no sequence burned.
- `productSyncReady` not flipped - remains `false`; `transportReady` not set true.
- `row:a950a44b859f` not cleaned or mutated; no cleanup authority introduced.
- Chat Saving CAS untouched (`chatSavingCasBlocked:true`); the B1 module and `webdav-transport-gates.js` are unchanged.
- Only the one new module file is added; `studio.html` and `pack-studio.mjs` are not touched; no unrelated Studio-lane
  files staged.

## Remaining Implementation Blockers (B3-B6)

B3 (durable idempotency store), B4 (enqueue/outbox), B5 (conflict/partial-write), B6 (sequence/export-id)
implementation, plus B8 real approval acceptance and the B7 `transportReady` flip, all remain open and unimplemented.

## Recommended Next Lane After B2

**B3 implementation - durable idempotency store** (per the B3 design `e1618571`), non-writing / non-activating, behind
the B8 approval + B7 readiness gate, only after an explicit operator go-ahead.

## Final State

The B2 real controlled-write kill-switch lifecycle substrate is implemented as a non-writing, hash-only
evaluate/diagnose module. Real transport remains blocked: `realWebDAVTransportAvailable:false`,
`realTransportApprovalAccepted:false`, `transportReady:false`, `productSyncReady:false`, fullBundle v3 deferred, Chat
Saving CAS blocked/deferred, `row:a950a44b859f` quarantined. B3-B6 implementation remains open.
