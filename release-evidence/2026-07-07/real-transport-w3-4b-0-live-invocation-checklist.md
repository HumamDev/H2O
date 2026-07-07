# Real Transport W3.4b-0 Live Sacrificial Invocation Checklist

Verdict: W3.4b-0 CHECKLIST ONLY. DO NOT INVOKE LIVE WRITE FROM THIS PHASE.

This checklist prepares the operator ceremony for a later W3.4b live
sacrificial invocation. All boxes must be explicitly satisfied in the later
phase before invocation. This checklist is not an approval artifact and is not a
write-grade receipt.

## Anchors

- W3.1 live read-only WebDAV closeout: `7862270237955b86d48d943263fd53947cc71f72`
- W3.1 request-shape alignment: `70e7fcc9669b939b505de96a7bb0ec61509c3370`
- W3.2 mock executor proof: `649849e7e48c7e5bc5924bc811d857f2435866ae`
- W3.3A write-grade receipt / approval gate design: `671fdc1c855b345185e5ea257b206c0a07cdab36`
- W3.3B registry storage hardening: `388a952745ab7a21ba9556531eccf5c7e0ffe1ce`
- W3.3C write-grade registry hash boundary: `aba4c70068d95ee373d157fddea06bfb31b505b0`
- W3.4a refused first-write command proof: `a830ccb6b633a9d6cee35e6db92464e870d5693d`

## Required Future Approval Wording

The later completed approval artifact must contain this exact wording:

I approve exactly one sacrificial probe object write: at most two create-only PUT requests to a single deterministic probe path, the second expected to fail with 412, one read-back GET, nothing else. No user data. No archive or fullBundle content. Expires <UTC>.

## Pre-Invocation Checklist

- [ ] Confirm app-local or eligible env registry path.
- [ ] Confirm writeGradeRegistryEligible:true.
- [ ] Confirm owner/permission checks pass.
- [ ] Confirm writeGradeRegistryRefHash available.
- [ ] Confirm saved credential present.
- [ ] Confirm W3.1 read-only closeout exists.
- [ ] Confirm W3.4a refused-by-default command exists.
- [ ] Confirm approval artifact is completed.
- [ ] Confirm receipt expiry <=72h.
- [ ] Confirm one-shot token prepared out-of-repo.
- [ ] Confirm kill-switch token prepared out-of-repo.
- [ ] Confirm deterministic sacrificial path class hash only, no raw path in evidence.
- [ ] Confirm tiny sentinel payload hash only, payload <=256 bytes.
- [ ] Confirm no archive/fullBundle/user data.
- [ ] Confirm operator has explicitly approved W3.4b live invocation.
- [ ] Confirm W3.4b must stop immediately on any unexpected status, redirect, 401/403, timeout, or read-back mismatch.

## Future Invocation Budget

- createOnlyPutMax:2
- readbackGetMax:1
- otherMethods:0
- allowed absence check: PROPFIND
- allowed create-only write: PUT to one deterministic path, maximum two requests
- allowed read-back: GET, maximum one request

## Forbidden Future Methods

- DELETE
- MKCOL
- PROPPATCH
- MOVE
- COPY
- LOCK
- UNLOCK
- POST

## No-Cleanup Policy

W3.4b does not authorize cleanup. No DELETE cleanup is allowed. The sentinel
remains as accepted residual after a successful sacrificial probe write. Cleanup
requires a separate approval/phase or external client manual cleanup.

## Phase Boundary

- liveInvocationPerformed:false
- writeGradeReceiptMinted:false
- oneShotTokenGenerated:false
- killSwitchTokenGenerated:false
- writesWebDAV:false
- productSyncReady:false
- transportReady:false

No raw endpoint, username, password/token, auth header, folder/root value, raw
path, listing, response body, private registry contents, token material, or
secret-derived fingerprint is recorded in this checklist.
