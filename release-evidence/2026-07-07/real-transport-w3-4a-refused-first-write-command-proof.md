# Real Transport W3.4a Refused First-Write Command Proof

Verdict: W3.4a IMPLEMENTS A REFUSED-BY-DEFAULT FIRST-WRITE COMMAND SUBSTRATE AND LOOPBACK TESTS ONLY. NO LIVE WRITE AUTHORIZATION.

This evidence records the first appearance of `h2o_rt_first_write`. The command
exists only behind a complete write-grade ceremony validator and is refused by
default. W3.4a does not perform a live WebDAV/cloud/relay/CAS/file write and
does not authorize W3.4b live invocation.

## Anchors

- W3.1 live read-only WebDAV closeout: `7862270237955b86d48d943263fd53947cc71f72`
- W3.1 request-shape alignment: `70e7fcc9669b939b505de96a7bb0ec61509c3370`
- W3.2 mock executor proof: `649849e7e48c7e5bc5924bc811d857f2435866ae`
- W3.3A write-grade receipt / approval gate design: `671fdc1c855b345185e5ea257b206c0a07cdab36`
- W3.3B registry storage hardening: `388a952745ab7a21ba9556531eccf5c7e0ffe1ce`
- W3.3C write-grade registry hash boundary: `aba4c70068d95ee373d157fddea06bfb31b505b0`

## Command Boundary

`h2o_rt_first_write` is added as a Tauri/Rust command, but the default/no-input
path refuses with:

- `real-transport-w3-write-grade-approval-missing`

The command accepts only a W3.4a mock/loopback invocation object:

- `schema: h2o.studio.transport.first-write-request.v1`
- `gate: real-transport-w3-4a-refused-first-write-loopback`
- `mockOnly:true`
- `loopbackMock:true`

Any non-loopback or incomplete invocation is refused. The command does not
construct a real write HTTP client in W3.4a.

## Receipt Validation

The command validates a write-grade receipt core:

- `schema: h2o.sync.real-transport.write-grade-receipt.v1`
- `receiptGrade: write-grade`
- `operationKind: first-sacrificial-probe-write`
- `payloadKind: capability-probe-object`
- `payloadCount:1`
- `maxInvocations:1`
- `requestBudget.createOnlyPutMax:2`
- `requestBudget.readbackGetMax:1`
- `requestBudget.otherMethods:0`
- `payloadByteMax <= 256`
- expiry window `<=7 days`
- first-write age policy `<=72h`
- future mint refused
- expired/stale receipt refused

The validator binds:

- W3.1 closeout commit
- W3.1 alignment commit
- W3.2 mock proof commit
- W3.3A design commit
- W3.3B registry hardening commit
- W3.3C hash boundary commit
- `writeGradeRegistryRefHash`
- approval artifact hash
- one-shot token hash
- kill-switch token hash

Raw token material is accepted only for local hash comparison and is not
returned, printed, or committed.

## Registry Gate

The command requires:

- `writeGradeRegistryRefHash`
- `registryPathSource: app-local` or eligible invocation-local `env`
- `writeGradeRegistryEligible:true`
- `registryOwnerOk:true`
- `registryPermissionOk:true`

`default-private-legacy` and `invalid` registry sources are refused for
write-grade use.

## Fail-Closed Blockers

W3.4a refuses:

- missing approval
- missing receipt
- fixture/mock-grade receipt
- missing raw token
- token hash mismatch
- kill switch absent/disabled/stale
- hash mismatch
- stale/future receipt
- default-private-legacy registry
- wrong registry permissions/owner
- wrong request budget
- non-create-only intent
- payload too large
- target exists in pre-write PROPFIND
- redirect
- 401/403
- timeout/drop after send as remote-write-uncertain
- read-back hash mismatch

## Loopback Proof

Loopback/mock tests simulate the future request sequence only:

- `PROPFIND` pre-write absence check: simulated `404`
- create-only `PUT` #1: simulated `201`
- create-only `PUT` #2 to same path: simulated `412`
- read-back `GET`: simulated `200` with payload hash match

This is not a live endpoint operation. It uses no raw endpoint, credential,
auth header, folder/root, response body, listing, private registry contents, or
secret-derived fingerprint.

Loopback result invariants:

- `mockOnly:true`
- `networkAttempted:false`
- `writesWebDAV:false`
- `productSyncReady:false`
- `transportReady:false`
- no real token/export-id/sequence burn
- no relay/outbox/ledger/store mutation
- no fullBundle.v3 start or mint

## Boundary Confirmations

- no live WebDAV/cloud/relay/CAS/file write occurred
- no forbidden method was used against a real endpoint
- no real write-grade receipt was minted
- no real one-shot token was generated
- no real kill-switch token was generated
- no real token/export-id/sequence burn occurred
- no relay/outbox/ledger/store mutation occurred
- no archive/user data was written
- `productSyncReady:false`
- `transportReady:false`

## W3.4b Boundary

W3.4b live sacrificial invocation remains separate and requires explicit
operator go, a real write-grade receipt, real approval artifact, one-shot token,
kill-switch token, registry re-verification, and create-only request budget.

This evidence does not authorize live PUT and does not authorize cleanup.
