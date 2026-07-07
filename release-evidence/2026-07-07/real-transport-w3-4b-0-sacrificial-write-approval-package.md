# Real Transport W3.4b-0 Sacrificial Write Approval Package

Verdict: W3.4b-0 PREPARES THE LIVE SACRIFICIAL WRITE APPROVAL PACKAGE ONLY. NO LIVE INVOCATION. NO WEBDAV WRITE.

This package is a template/checklist artifact for a future W3.4b live
sacrificial invocation. It is not a completed operator approval, does not mint a
write-grade receipt, does not generate one-shot or kill-switch token material,
and does not authorize `h2o_rt_first_write` invocation.

## Anchors

- W3.1 live read-only WebDAV closeout: `7862270237955b86d48d943263fd53947cc71f72`
- W3.1 request-shape alignment: `70e7fcc9669b939b505de96a7bb0ec61509c3370`
- W3.2 mock executor proof: `649849e7e48c7e5bc5924bc811d857f2435866ae`
- W3.3A write-grade receipt / approval gate design: `671fdc1c855b345185e5ea257b206c0a07cdab36`
- W3.3B registry storage hardening: `388a952745ab7a21ba9556531eccf5c7e0ffe1ce`
- W3.3C write-grade registry hash boundary: `aba4c70068d95ee373d157fddea06bfb31b505b0`
- W3.4a refused first-write command proof: `a830ccb6b633a9d6cee35e6db92464e870d5693d`

## Required Operator Approval Wording

The future W3.4b operator approval artifact must include this exact wording:

I approve exactly one sacrificial probe object write: at most two create-only PUT requests to a single deterministic probe path, the second expected to fail with 412, one read-back GET, nothing else. No user data. No archive or fullBundle content. Expires <UTC>.

This file is not that completed approval. The operator must complete a separate
approval artifact before W3.4b live invocation.

## Package State

- phase: `W3.4b-0`
- packageKind: `approval-template-and-checklist`
- liveInvocationPerformed:false
- writeGradeReceiptMinted:false
- writeGradeReceiptState: `not-minted`
- approvalArtifactCompleted:false
- oneShotTokenGenerated:false
- killSwitchTokenGenerated:false
- writesWebDAV:false
- productSyncReady:false
- transportReady:false

## Allowed Future Live Invocation Budget

- createOnlyPutMax:2
- readbackGetMax:1
- otherMethods:0
- payloadKind: `capability-probe-object`
- payloadCount:1
- payloadByteMax:256
- maxInvocations:1

## Allowed Future Methods

Only the following future W3.4b methods may be authorized by a completed
write-grade receipt and explicit operator approval:

- PROPFIND pre-write absence check
- PUT create-only, maximum two requests to one deterministic path
- GET read-back, maximum one request

## Forbidden Methods

The following methods remain forbidden for W3.4b sacrificial invocation:

- DELETE
- MKCOL
- PROPPATCH
- MOVE
- COPY
- LOCK
- UNLOCK
- POST

No cleanup is authorized in W3.4b. The sentinel remains as accepted residual.
Cleanup requires a separate approval/phase or external client manual cleanup.

## Explicit Non-Authorization

This package does not authorize:

- invoking `h2o_rt_first_write` against the real prepared registry
- live PUT
- live DELETE cleanup
- archive or fullBundle write
- user data write
- relay/outbox/ledger/store mutation
- token/export-id/sequence burn
- fullBundle.v3 start or mint
- `productSyncReady:true`
- `transportReady:true`

## Redaction Boundary

This package records only hash refs, method names, status expectations, booleans,
and blocker rules. It must not include raw endpoint, username, password/token,
auth header, folder/root value, raw deterministic path, listing, response body,
private registry contents, token material, or secret-derived fingerprint.

## Future W3.4b Stop Rules

W3.4b live invocation must stop immediately on:

- target already exists during in-session PROPFIND absence check
- redirect
- 401 or 403
- timeout/drop after send
- PUT #1 unexpected status
- PUT #2 returns 2xx
- read-back status mismatch
- read-back payload hash mismatch
- any method or path outside the approved request budget

Unexpected remote-write uncertainty blocks later readiness claims until resolved.

## Boundary Confirmations

- no live invocation was performed in W3.4b-0
- no WebDAV/cloud/relay/CAS/file write occurred
- no forbidden method was used
- no write-grade receipt was minted
- no real one-shot token was generated
- no real kill-switch token was generated
- no token/export-id/sequence burn occurred
- no relay/outbox/ledger/store mutation occurred
- `productSyncReady:false`
- `transportReady:false`
