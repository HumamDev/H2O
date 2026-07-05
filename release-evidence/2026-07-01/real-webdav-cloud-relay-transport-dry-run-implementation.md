# Real WebDAV/Cloud/Relay Transport Dry-Run - Implementation

## Verdict

REAL WEBDAV/CLOUD/RELAY TRANSPORT DRY-RUN SUBSTRATE IMPLEMENTED AS A NON-WRITING, HASH-ONLY, STANDALONE EVALUATOR.

The new evaluator is:

- Source: `src-surfaces-base/studio/sync/real-transport-dry-run.js`
- API: `H2O.Studio.sync.realTransportDryRun.evaluateRealTransportDryRun(request)`
- Gate: `real-webdav-cloud-relay-transport-dry-run-evaluate`
- Result status for valid input: `real-webdav-cloud-relay-transport-dry-run-ready`

This slice does not implement real transport. It does not wire the module into `studio.html` or `pack-studio.mjs`.

## Anchors Respected

- B7 transportReady evaluation implementation: `34356fa6`
- B8 real approval acceptance implementation: `a4777528`
- B1-B6 implementation rollup: `10e1ee6c`
- B6 sequence/export-id implementation: `7cac0d82`
- B5 conflict/partial-write implementation: `334361cc`
- B4 enqueue/outbox boundary implementation: `1117f976`
- B3 durable idempotency implementation: `804b6d67`
- B2 kill-switch lifecycle implementation: `de4aa12d`
- B1 target config implementation: `93eb9065`

## Required Valid Input

The dry-run evaluator requires all of the following:

- `dryRun:true`
- `apply:false`
- `gate:"real-webdav-cloud-relay-transport-dry-run-evaluate"`
- B1 target config evidence and hash-only target references.
- B2 kill-switch lifecycle evidence.
- B3 idempotency evidence.
- B4 enqueue/outbox boundary evidence.
- B5 conflict/partial-write evidence.
- B6 sequence/export-id evidence.
- B8 approval acceptance evidence with `realTransportApprovalAccepted:true`.
- B7 readiness evidence with `transportReadyCandidate:true`, `transportReady:false`, and `transportReadyFlipAuthorized:false`.
- `productSyncReady:false`.
- fullBundle.v2 envelope hash/payload boundary.
- fullBundle.v3 deferred/not-started.
- Chat Saving CAS separate/blocked.
- `row:a950a44b859f` quarantined and absent from exportable payload.
- hash-only privacy mode.

## Valid Output Semantics

A valid request returns:

- `ok:true`
- `status:"real-webdav-cloud-relay-transport-dry-run-ready"`
- `realTransportDryRun:true`
- `dryRunOnlyAvailable:true`
- `realTransportWrite:false`
- `realWebDAVTransportAvailable:false`
- `transportReadyCandidate:true`
- `transportReady:false`
- `transportReadyFlipAuthorized:false`
- `productSyncReady:false`
- `realTransportApprovalAccepted:true`
- `privacy.hashOnly:true`
- `noCleanupAuthority:true`

`transportReadyCandidate:true` is dry-run evidence only. It is not a global/source `transportReady` mutation and is not WebDAV/cloud/relay write authorization.

## Blocked Failure Modes

The evaluator blocks:

- Missing/wrong dry-run gate.
- `dryRun:false`.
- `apply:true`.
- Missing B1-B6 evidence.
- Missing B8 approval acceptance evidence.
- Missing B7 readiness candidate evidence.
- `productSyncReady:true`.
- Caller-supplied `transportReady:true`.
- Real write request.
- WebDAV/cloud/CAS/file write flags.
- Relay enqueue request.
- fullBundle.v3 start/request.
- Export id mint request.
- Sequence burn request.
- Outbox or publication-ledger write request.
- Raw endpoint/credential/path/payload input.
- CAS key input.
- Cleanup or a950 mutation request.
- Local mock target or local mock approval substituted for real evidence.

## Non-Activation Boundary

Hardcoded side-effect flags remain false:

- `writesWebDAV:false`
- `writesCloud:false`
- `writesRelay:false`
- `enqueuesRelay:false`
- `writesCAS:false`
- `writesFiles:false`
- `mutatesExportState:false`
- `mintsExportId:false`
- `burnsSequence:false`
- `publicationLedgerTouched:false`
- `relayOutboxTouched:false`
- `fullBundleV3Started:false`

The module is intentionally standalone. It is not included in the Studio runtime pack, does not create durable records, and does not call WebDAV, relay, CAS, file, export, outbox, or ledger write APIs.

## Handoff

The next lane can run a live read-only DevTools proof of the real transport dry-run evaluator. Real controlled WebDAV/cloud/relay apply remains blocked and unimplemented.
