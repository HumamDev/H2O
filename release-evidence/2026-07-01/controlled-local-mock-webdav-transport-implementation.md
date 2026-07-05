# Controlled Local Mock WebDAV Transport Implementation

Verdict: **CONTROLLED LOCAL MOCK WEBDAV TRANSPORT IMPLEMENTED - MOCK ONLY / REAL TRANSPORT STILL BLOCKED**.

This implementation adds a focused source-level controlled mock transport path for a local mock WebDAV target only. It does not write to real WebDAV/cloud/relay/CAS/files, does not enqueue relay, does not mint or start `fullBundle.v3`, does not mutate the `fullBundle.v2` payload, does not mutate export state, does not mint an export id, does not burn sequence, does not flip `productSyncReady`, does not set `transportReady:true`, does not clean or mutate `row:a950a44b859f`, and does not weaken strict tombstone cleanup rules.

## Anchors Respected

- Controlled transport implementation design: `5d0190d54a1a62f00cbb028c94ff19d1a37f651b`.
- Controlled-write kill switch implementation: `edb306774a011f5af5fa4141ce9d85972b16283a`.
- Final transport-readiness rollup: `40f52a5f8554861a09d8cf69cc77b0c6c7740495`.
- Transport privacy/evidence contract closeout: `c3f1d8f70cb0b688268fcc814aece1e68ccb8994`.
- Rollback / disable / fail-closed proof: `b6dc031157ad7689620aed288869151bd23392c8`.
- fullBundle.v2 transport-envelope preflight live closeout: `735e9b002f8fac14e57ae0523f2dadd9a2bbe22a`.
- Relay queue / idempotency / restart proof live closeout: `f8cfcff9eb18437134df4470c033f37d3cecc2fd`.
- WebDAV transport-readiness dry-run live closeout: `7dd54b42b5df25d76fd4a308fe1f4c7a1a694ba2`.

## Source Change

Source file:

`src-surfaces-base/studio/sync/webdav-transport-gates.js`

New API:

`H2O.Studio.sync.webdavTransportGates.evaluateControlledLocalMockTransport(request)`

Request schema:

`h2o.studio.transport.controlled-local-mock-webdav-transport-request.v1`

Result schema:

`h2o.studio.transport.controlled-local-mock-webdav-transport-result.v1`

The controlled gate remains:

`webdav-cloud-relay-transport-controlled-apply`

The gate is usable only for the local mock modeled apply path. It is not real WebDAV/cloud/relay authorization.

## Required Controlled Apply Conditions

Any local mock apply requires:

- `killSwitch.enabled:true`.
- exact gate `webdav-cloud-relay-transport-controlled-apply`.
- explicit operator approval object.
- `scope:"local-mock-webdav-target-only"`.
- `controlledGate:"webdav-cloud-relay-transport-controlled-apply"`.
- fixed `idempotencyKeyHash:"sha256:<64-hex>"`.
- fixed `candidatePayloadHash:"sha256:<64-hex>"`.
- fixed `candidateBundleHash:"sha256:<64-hex>"`.
- fixed `peerTargetHash:"sha256:<64-hex>"`.
- fixed `remoteRootRefHash:"sha256:<64-hex>"`.
- `productSyncReady:false`.
- `transportReady:false`.
- `localExportableSyncReady:true`.
- `transportEligibilityFromLocalExportableReady:true`.
- `privacy.mode:"hash-only"`.
- duplicate replay proof with `duplicateReplayZeroWrite:true`.
- restart proof with `restartFailClosed:true`.

## Valid Local Mock Apply Output

A valid local mock apply returns:

- `controlledMockTransport:true`
- `targetMode:"local-mock-webdav"`
- `gateSatisfied:true`
- `killSwitchEnabled:true`
- `operatorApprovalAccepted:true`
- `controlledMockTransportImplementationPresent:true`
- `controlledTransportScope:"local-mock-webdav-target-only"`
- `modeledMockApply:true`
- `modeledMockWriteCount:1`
- `realWebDAVWrite:false`
- `writesWebDAV:false`
- `writesCloud:false`
- `writesRelay:false`
- `enqueuesRelay:false`
- `writesCAS:false`
- `writesFiles:false`
- `mutatesExportState:false`
- `mintsExportId:false`
- `burnsSequence:false`
- `fullBundleV3Started:false`
- `productSyncReady:false`
- `transportReady:false`
- `localExportableSyncReadyIsAuthorization:false`
- `duplicateReplayZeroWrite:true`
- `restartFailClosed:true`
- `bootResumeDispatch:false`
- `webdavCloudRelayBlocked:true`
- `chatSavingCasBlocked:true`
- `a950DocumentedDebtQuarantined:true`
- `noCleanupAuthority:true`

The `modeledMockWriteCount:1` value is an in-memory/model result only. It is not a filesystem, WebDAV, cloud, CAS, relay, export-state, export-id, or sequence write.

## Duplicate Replay

Duplicate replay is modeled with `duplicateReplay.replayed:true` and the same idempotency/payload/target/sequence constraints.

Expected duplicate replay output:

- `ok:true`
- `duplicateReplayZeroWrite:true`
- `modeledMockWriteCount:0`
- `realWebDAVWrite:false`
- `enqueuesRelay:false`

## Required Blocks

The API blocks:

- missing/disabled kill switch with `controlled-local-mock-kill-switch-disabled`;
- missing/wrong gate with `controlled-local-mock-controlled-gate-required`;
- missing approval with `controlled-local-mock-operator-approval-required`;
- missing idempotency key with `controlled-local-mock-idempotency-key-required`;
- hash mismatch with `controlled-local-mock-payload-hash-mismatch`;
- real WebDAV/cloud target with `controlled-local-mock-real-webdav-cloud-write-forbidden`;
- non-local mock target with `controlled-local-mock-target-required`;
- relay enqueue with `controlled-local-mock-relay-enqueue-forbidden`;
- CAS write with `controlled-local-mock-cas-write-forbidden`;
- file write with `controlled-local-mock-file-write-forbidden`;
- `fullBundle.v3` start/mint with `controlled-local-mock-fullbundle-v3-forbidden`;
- export-state mutation/export-id mint/sequence burn with `controlled-local-mock-export-mutation-forbidden`;
- cleanup or a950 mutation with `controlled-local-mock-cleanup-authority-forbidden`;
- raw/private evidence with `controlled-local-mock-private-input-rejected`;
- missing duplicate proof with `controlled-local-mock-duplicate-replay-proof-required`;
- missing restart proof with `controlled-local-mock-restart-fail-closed-proof-required`;
- `productSyncReady` mismatch with `controlled-local-mock-product-sync-ready-mismatch`;
- `transportReady` mismatch with `controlled-local-mock-transport-ready-mismatch`.

## Final State

The first controlled transport implementation remains local-mock only.

Real WebDAV/cloud/relay cannot start now.

Relay enqueue cannot start now.

Chat Saving CAS remains blocked/deferred.

`fullBundle.v3` remains deferred/not-started.

`productSyncReady:false` remains authoritative.

`transportReady:false` remains authoritative.

No cleanup or `row:a950a44b859f` mutation authority is introduced.
