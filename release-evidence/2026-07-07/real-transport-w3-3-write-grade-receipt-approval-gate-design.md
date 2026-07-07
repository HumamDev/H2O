# Real Transport W3.3A Write-Grade Receipt and Approval Gate Design

Verdict: W3.3A DESIGN / EVIDENCE ONLY. NO WRITE AUTHORIZATION.

This evidence records the W3.3 write-grade receipt and explicit approval gate
design after W3.1 read-only WebDAV readiness and W3.2 mock executor proof. It
does not implement runtime source, Rust commands, loader changes, capability
changes, write-grade receipt minting, token minting, approval artifacts, or
real transport execution.

## Anchors

- W3.1 live read-only WebDAV closeout: `7862270237955b86d48d943263fd53947cc71f72`
- W3.1 request-shape alignment: `70e7fcc9669b939b505de96a7bb0ec61509c3370`
- W3.2 mock executor proof: `649849e7e48c7e5bc5924bc811d857f2435866ae`

## Critical Findings Preserved

### F1 - Current live descriptor registry is not write-grade safe

The current live descriptor registry under `/private/tmp` is not acceptable for
write-grade registry material.

Write-grade registry material must move to an app-owned local data path or an
equivalent owner-controlled private store. The file must be owner-checked and
permission-checked, preferably `0600`. The descriptor registry content hash must
be bound in the write-grade receipt and re-verified immediately before the
future PUT.

W3.4a is blocked until registry relocation and permission/owner verification are
resolved, or until the registry is explicitly re-provisioned inside the
invocation ceremony. The executor must not silently inherit `/private/tmp` into
write-grade execution.

### F2 - Exactly one sacrificial object must authorize the create-only PUT pair

The operator approval must explicitly authorize exactly one sacrificial probe
object. The request budget must be encoded, not hidden:

- `createOnlyPutMax:2`
- first create-only PUT: expected `201` or another explicitly acceptable created status
- second create-only PUT to the same object/path: expected `412`
- `readbackGetMax:1`
- `otherMethods:0`
- no other object
- no user data
- no archive or fullBundle content
- no cleanup or DELETE

### F3 - Consumed-marker gap must be stated honestly

Before live invocation, a durable consumed marker may not exist. Replay
prevention before invocation relies on short expiry and operator custody.

At invocation, the first durable action must be apply-intent / consumed marker
before network. Receipt scope must be `maxInvocations:1`. The one-shot token
burns on first presentation regardless of outcome.

## Write-Grade Receipt Schema

The future write-grade receipt core must include:

```yaml
schema: h2o.sync.real-transport.write-grade-receipt.v1
receiptGrade: write-grade
mintUtc: <UTC>
expiryUtc: <UTC>
operationKind: first-sacrificial-probe-write
payloadKind: capability-probe-object
payloadCount: 1
maxInvocations: 1
requestBudget:
  createOnlyPutMax: 2
  readbackGetMax: 1
  otherMethods: 0
sacrificialObject:
  pathClassRefHash: sha256:<hash>
  payloadHash: sha256:<hash>
  payloadByteMax: 256
bindings:
  endpointRefHash: sha256:<hash>
  remoteRootRefHash: sha256:<hash>
  credentialRefHash: sha256:<hash>
  descriptorRegistryRefHash: sha256:<hash>
  w31CloseoutCommit: 7862270237955b86d48d943263fd53947cc71f72
  w31AlignmentCommit: 70e7fcc9669b939b505de96a7bb0ec61509c3370
  w32MockProofCommit: 649849e7e48c7e5bc5924bc811d857f2435866ae
  operatorApprovalArtifactHash: sha256:<hash>
  oneShotTokenHash: sha256:<hash>
  killSwitchTokenHash: sha256:<hash>
```

Grade rule: fixture/mock-grade material can never become write-grade by
inference. `receiptGrade: write-grade` must be explicit in the canonical core.

Expiry rule:

- maximum receipt expiry window: `<=7 days`
- first sacrificial write recommended window: `<=72h`
- executor-enforced maximum receipt age is required independent of receipt expiry
- future-dated `mintUtc` is refused
- git timestamp cross-check is required where practical

## Approval Artifact Wording

Template-only wording, not an approval:

> I approve exactly one sacrificial probe object write: at most two create-only PUT requests to a single deterministic probe path, the second expected to fail with 412, one read-back GET, nothing else. No user data. No archive or fullBundle content. Expires <UTC>.

This wording must not be treated as a live approval artifact in W3.3A.

## W3.4 Live Invocation Method Budget

Allowed only after separate W3.4 approval:

- `PROPFIND` pre-write absence check
- `PUT` create-only max 2 to the same object/path
- `GET` read-back max 1

Forbidden:

- `DELETE`
- `MKCOL`
- `PROPPATCH`
- `MOVE`
- `COPY`
- `LOCK`
- `UNLOCK`
- `POST`
- any second path
- any payload except tiny sentinel
- any user data
- any archive/fullBundle content

No-cleanup policy:

- no DELETE cleanup in W3.4
- sentinel remains as accepted residual
- cleanup requires separate approval/phase or external client manual cleanup

## Fail-Closed Matrix

The future executor must fail closed for:

- binding mismatch
- grade mismatch
- fixture/mock-grade receipt
- stale receipt
- future receipt
- clock disagreement
- missing approval
- expired approval
- missing token hash
- token hash mismatch
- kill switch absent
- kill switch disabled
- kill switch stale
- registry wrong location
- registry wrong permissions
- registry wrong owner
- in-session PROPFIND target exists
- PUT #1 unexpected status
- PUT #2 `2xx`, which means createOnlyBehavior is not enforced and W3.5 is blocked
- redirect
- `401`
- `403`
- timeout/drop after send as remote-write-uncertain
- read-back hash mismatch

## Redaction Rules

Evidence may record only:

- hash refs
- status codes
- booleans
- blocker codes

Evidence must not record:

- raw endpoint
- raw path
- raw listing
- credential
- auth header
- response body
- private registry contents
- secret-derived fingerprint

The `descriptorRegistryRefHash` preimage used for evidence must not include
secret material or a secret-derived fingerprint.

## UI / UX Boundary

The first sacrificial write should not be one-click-triggerable from normal UI.

Future UI may display gate status and assemble a request only. If a UI is later
added, it must require a scary warning and typed confirmation phrase. The raw
one-shot token is never stored or remembered by UI.

DevTools/manual invocation is acceptable for W3.4 if safer.

## W3.4 Split

- W3.4a may implement refused-by-default command/validator/loopback tests only after F1 is resolved.
- W3.4b may perform one live sacrificial invocation only after separate operator go.

W3.4 may not:

- cleanup or DELETE
- archive/fullBundle write
- UI-triggered write without constraints
- auto-retry
- second object
- background/boot dispatch
- `productSyncReady:true`
- `transportReady:true`
- fullBundle.v3
- Chat Saving CAS
- a950

## Boundary Confirmations

- W3.3A is evidence/design-only
- W3.3A does not authorize writes
- no write-grade receipt was minted
- no one-shot token was generated
- no kill-switch token was generated
- no approval artifact was created beyond template-only wording
- `h2o_rt_first_write` remains absent / not implemented in this phase
- no write command was added
- no live WebDAV probe was performed
- no WebDAV/cloud/relay/CAS/file write occurred
- no forbidden method was used
- no token/export-id/sequence burn occurred
- no relay/outbox/ledger/store mutation occurred
- no fullBundle.v3 start or mint occurred
- `productSyncReady:false`
- `transportReady:false`
