# Real Transport W2a First-Write Preflight Implementation

Verdict: W2a real-transport first-write preflight substrate implemented as
standalone, zero-write, non-activating evidence only.

## Anchors

- W1c Desktop Studio webview proof: `eebbb8745d5bf1dba3ec145009c1ba6ae5bac1a5`
- W1b loader registration: `6cb1c6ba59fcb1ecb296cb996d6c8f981d0b886b`
- W1a real transport console aggregator: `826c4153ba944bda7c59910a35705e160d167159`
- Real dry-run proof closeout: `ba5844f7637c84136a505b3025838c755b8081af`
- Real dry-run implementation: `f93350d4a8e83bf49a00e0061f98f5c52454e74d`
- B7 readiness candidate: `34356fa6a4d6fa7550de18a1605cc131d2240c9c`
- B8 approval acceptance: `a477752896cf3747b0292d619a0eef9a120bc0a3`
- B1-B6 implementation rollup: `10e1ee6c740449f2f5b804f4ed73b23c812caacf`

## API

The new standalone module is:

- `src-surfaces-base/studio/sync/real-transport-first-write-preflight.js`

It exposes:

- `H2O.Studio.sync.realTransportFirstWritePreflight.evaluateRealTransportFirstWritePreflight(request)`
- `H2O.Studio.sync.realTransportFirstWritePreflight.buildReceiptCore(result)`
- `H2O.Studio.sync.realTransportFirstWritePreflight.diagnose()`
- `SCHEMA`
- `REQUEST_SCHEMA`
- `RECEIPT_SCHEMA`
- `PREFLIGHT_GATE = "real-webdav-cloud-relay-transport-first-write-preflight-evaluate"`

## Receipt Schema And Semantics

W2a produces a deterministic First-Write Authorization Candidate Receipt core.
The receipt is candidate-only and never standing authority. It is expiring and
single-invocation scoped:

- receipt kind: `first-write-authorization-candidate`
- receipt core canonicalization: `json-sorted-keys-v1`
- operation: `preflight`
- W3 operation kind: `first-controlled-real-write`
- W3 max invocations: `1`
- target payload kind: `single-fullbundle-v2-envelope`
- target payload count: `1`

The product module emits only deterministic `receiptCore` text. It does not
compute the receipt hash. The operator harness and validator compute
`sha256(receiptCore)` externally.

The receipt is not sufficient authorization for W3. It creates no token minted
state, no real write authority, no durable state, and no standing authority.

## Required Operator Artifacts

W2a requires hash-only references for the later first-write lane:

- W1c proof receipt hash
- B8 approval artifact hash
- rollback rehearsal receipt
- remote-root initial-state statement
- partial-write recovery plan

W2c live closeout is deferred pending those four operator artifacts:

- B8 approval document
- rollback rehearsal receipt
- remote-root initial-state statement
- partial-write recovery plan

## Blocker Matrix

Every blocker is fail-closed and uses the `real-transport-w2-*` prefix:

- `real-transport-w2-wrong-gate`
- `real-transport-w2-apply-requested`
- `real-transport-w2-w1c-proof-missing`
- `real-transport-w2-b8-artifact-missing`
- `real-transport-w2-approval-missing`
- `real-transport-w2-local-mock-approval-rejected`
- `real-transport-w2-local-exportable-not-authorization`
- `real-transport-w2-target-evidence-missing`
- `real-transport-w2-kill-switch-missing-or-stale`
- `real-transport-w2-rollback-rehearsal-missing`
- `real-transport-w2-remote-root-state-missing`
- `real-transport-w2-recovery-plan-missing`
- `real-transport-w2-chain-evidence-missing`
- `real-transport-w2-payload-envelope-mismatch`
- `real-transport-w2-scope-not-single-payload`
- `real-transport-w2-invocation-scope-invalid`
- `real-transport-w2-transport-ready-claim-rejected`
- `real-transport-w2-product-sync-ready-claim-rejected`
- `real-transport-w2-sequence-constraint-mismatch`
- `real-transport-w2-peer-ambiguous`
- `real-transport-w2-raw-input-rejected`
- `real-transport-w2-cas-input-rejected`
- `real-transport-w2-fullbundle-v3-rejected`

## Standalone Status

W2a is intentionally standalone. W2b loader registration deferred. W2c live
closeout deferred. The module is not wired into `studio.html` or
`tools/product/studio/pack-studio.mjs`.

W2a does not edit any existing real-transport module body and does not edit
`webdav-transport-gates.js`.

## Boundaries Held

- `standingAuthority:false`
- `oneShotTokenMinted:false`
- `realWriteExecuted:false`
- `realWebDAVTransportAvailable:false`
- `realTransportApprovalAccepted:false`
- `productSyncReady:false`
- `transportReady:false`
- `transportReadyFlipAuthorized:false`
- no real WebDAV/cloud/relay/CAS/file write
- no relay enqueue
- no outbox/ledger/store mutation
- no fullBundle.v3 start/mint
- no export id mint
- no sequence burn
- no local storage write
- no cleanup authority
- no a950 mutation

Raw endpoint, credential, path, payload body, and CAS key inputs are rejected.
Raw markers are not echoed in the result or receipt core.

## Validation

The W2a validator re-executes the real module in a VM sandbox with throwing
canaries for `localStorage`, `fetch`, `XMLHttpRequest`, and `invoke`. It proves:

- load-time inertness
- valid fixture readiness
- receiptCore byte determinism across repeated evaluations and fresh VM sandboxes
- every blocker in the matrix
- coercion resistance for all hardcoded non-activation flags
- raw/CAS marker rejection without echo
- source contains no forbidden I/O or activation primitives
- W1 console `diagnose()` and `runChainedDryRun()` still pass with W2 loaded alongside
