# Real Transport W3.4b-1 Operator Sacrificial Write Approval

Verdict: W3.4b-1 RECORDS OPERATOR APPROVAL ONLY. NO LIVE INVOCATION. NO WEBDAV WRITE.

This artifact records operator approval for a future W3.4b live sacrificial
write ceremony. It does not invoke `h2o_rt_first_write`, does not mint a
write-grade receipt, does not generate one-shot or kill-switch token material,
and does not authorize any background dispatch.

## Approval Timing

- approvalUtc: `2026-07-07T16:13:08Z`
- expiryUtc: `2026-07-10T16:00:00Z`
- approvalWindow: `within-72-hours`
- liveInvocationPerformed:false
- writeGradeReceiptMinted:false
- oneShotTokenGenerated:false
- killSwitchTokenGenerated:false
- writesWebDAV:false
- productSyncReady:false
- transportReady:false

## Required Approval Wording

Exact approval wording required by W3.3A/W3.4b-0:

I approve exactly one sacrificial probe object write: at most two create-only PUT requests to a single deterministic probe path, the second expected to fail with 412, one read-back GET, nothing else. No user data. No archive or fullBundle content. Expires <UTC>.

Concrete W3.4b-1 approval instance:

I approve exactly one sacrificial probe object write: at most two create-only PUT requests to a single deterministic probe path, the second expected to fail with 412, one read-back GET, nothing else. No user data. No archive or fullBundle content. Expires 2026-07-10T16:00:00Z.

This approval is completed for the future W3.4b live sacrificial invocation
ceremony only. It is not invocation, not receipt minting, and not token
generation.

## Anchor Bindings

- W3.1 live read-only WebDAV closeout: `7862270237955b86d48d943263fd53947cc71f72`
- W3.1 request-shape alignment: `70e7fcc9669b939b505de96a7bb0ec61509c3370`
- W3.2 mock executor proof: `649849e7e48c7e5bc5924bc811d857f2435866ae`
- W3.3A write-grade receipt / approval gate design: `671fdc1c855b345185e5ea257b206c0a07cdab36`
- W3.3B registry storage hardening: `388a952745ab7a21ba9556531eccf5c7e0ffe1ce`
- W3.3C write-grade registry hash boundary: `aba4c70068d95ee373d157fddea06bfb31b505b0`
- W3.4a refused first-write command proof: `a830ccb6b633a9d6cee35e6db92464e870d5693d`
- W3.4b-0 approval package/checklist: `d196f4b26d904394c435c15dd14d12cd18f03190`

## Approved Future Request Budget

- createOnlyPutMax:2
- readbackGetMax:1
- otherMethods:0
- payloadKind: `capability-probe-object`
- payloadCount:1
- payloadByteMax:256
- maxInvocations:1

## Approved Future Methods

Only the following methods are approved for the future W3.4b live sacrificial
invocation, after separate receipt/token preparation and final operator go:

- PROPFIND pre-write absence check
- PUT create-only, maximum two requests to one deterministic path
- GET read-back, maximum one request

## Forbidden Methods

The following methods are not approved:

- DELETE
- MKCOL
- PROPPATCH
- MOVE
- COPY
- LOCK
- UNLOCK
- POST

## No-Cleanup Policy

No cleanup is authorized. No DELETE cleanup is allowed. The sentinel remains as
accepted residual after a successful future W3.4b sacrificial probe write.
Cleanup requires a separate approval/phase or external client manual cleanup.

## Explicit Non-Authorization

This approval does not authorize:

- live invocation in W3.4b-1
- write-grade receipt minting in W3.4b-1
- one-shot token generation in W3.4b-1
- kill-switch token generation in W3.4b-1
- archive/fullBundle write
- user data write
- Chat Saving CAS
- background dispatch
- relay/outbox/ledger/store mutation
- token/export-id/sequence burn
- fullBundle.v3 start or mint
- `productSyncReady:true`
- `transportReady:true`

## Approval Artifact Hash

Approval artifact hash is not recorded in this artifact to avoid self-reference.
A later W3.4b receipt-minting phase may compute and bind a hash over the
committed approval artifact bytes without including private endpoint, path,
credential, token, auth header, response body, listing, or private registry
contents.

## Boundary Confirmations

- no live invocation was performed in W3.4b-1
- no WebDAV/cloud/relay/CAS/file write occurred
- no forbidden method was used
- no write-grade receipt was minted
- no real one-shot token was generated
- no real kill-switch token was generated
- no token/export-id/sequence burn occurred
- no relay/outbox/ledger/store mutation occurred
- `productSyncReady:false`
- `transportReady:false`
