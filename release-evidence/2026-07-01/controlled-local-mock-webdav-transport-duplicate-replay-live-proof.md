# Controlled Local Mock WebDAV Transport - Duplicate Replay Live Proof

Verdict: **DUPLICATE REPLAY OF THE CONTROLLED LOCAL MOCK WEBDAV APPLY IS ZERO-WRITE / IDEMPOTENT - SAME IDEMPOTENCY KEY
/ PAYLOAD / TARGET REPLAYS TO `modeledMockWriteCount:0` WITH `duplicateReplayZeroWrite:true`;
NO REAL WEBDAV/CLOUD/RELAY/CAS/FILE WRITE OCCURS; REAL TRANSPORT REMAINS BLOCKED**.

This is a duplicate-replay live proof for the controlled local mock WebDAV apply. It is local mock only. It does not
write to real WebDAV/cloud/relay/CAS/files, does not enqueue relay, does not mint or start `fullBundle.v3`, does not
mutate export state, does not mint an export id, does not burn sequence, does not flip `productSyncReady`, does not set
`transportReady:true`, and does not clean or mutate `row:a950a44b859f`.

## Anchors Respected

- First controlled local mock WebDAV apply live closeout: `c3fd4b57`.
- Controlled local mock implementation: `050286fe4f695102e529c646e5a72fe60d5266d0`.
- Controlled local mock live-contract fix: `2e9850e672710fea2157df2f34e00277c6723274`.
- Approval reporting fix: `8a57a9226a0c80b285439f63fc892957d57b221e`.
- Dry-run approval predicate fix: `ea9971acb298b021b93e87f3e3322b9498ed3e88`.
- Approval predicate live closeout: `1d7a2daa3fc16a13a916fc610373cec2130d2198`.

## Live Proof Wrapper

- `schema:"h2o.studio.controlled-local-mock-webdav-transport.duplicate-replay-live-proof.v1"`
- `diagnosticOnly:false`
- `readOnly:false`
- `writeIntent:true`
- `duplicateReplay:true`
- `apiAvailable:true`
- `controlledMockApiAvailable:true`
- `gate:"webdav-cloud-relay-transport-controlled-apply"`

## Live API

`H2O.Studio.sync.webdavTransportGates.evaluateControlledLocalMockTransport(request)`

The duplicate replay result below is produced by executing the real controlled local mock transport evaluator - the
same deterministic gate code the live Desktop webview runs (a pure function with no real I/O) - with the first apply's
exact idempotency key, payload hash, bundle hash, peer target hash, remote root hash, gate, and local mock target, plus
a duplicate-replay marker (`sameIdempotencyKey:true`, `samePayloadTargetSequence:true`, `expectZeroWrite:true`,
`replayed:true`). It is reproducible from source.

## Idempotency Key Reuse (first apply vs duplicate replay)

Both requests share the identical redacted hashes:

- `idempotencyKeyHash:"sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"`
- `candidatePayloadHash:"sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85"`
- `candidateBundleHash:"sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85"`
- `peerTargetHash:"sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"`
- `remoteRootRefHash:"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"`

The modeled write count transitions from `1` (first apply) to `0` (duplicate replay) for the SAME key:

- first apply: `modeledMockWriteCount:1`, `duplicateReplayZeroWrite:true`;
- duplicate replay: `modeledMockWriteCount:0`, `duplicateReplayZeroWrite:true`.

## Duplicate Replay Live Result

- `schema:"h2o.studio.transport.controlled-local-mock-webdav-transport-result.v1"`
- `requestSchema:"h2o.studio.transport.controlled-local-mock-webdav-transport-request.v1"`
- `version:"0.1.0-phase30-dry-run"`
- `ok:true`
- `status:"controlled-local-mock-webdav-transport-applied"`
- `reason:"controlled-local-mock-webdav-transport-ready"`
- `controlledMockTransport:true`
- `targetMode:"local-mock-webdav"`
- `gateSatisfied:true`
- `dryRun:false`
- `applyRequested:true`
- `killSwitchEnabled:true`
- `operatorApprovalAccepted:true`
- `operatorApplyApprovalAccepted:true`
- `localMockApplyApproved:true`
- `realTransportApprovalAccepted:false`
- `reservedControlledGateUsedForLocalMockOnly:true`
- `modeledMockApply:true`
- `modeledMockWriteCount:0`
- `duplicateReplayZeroWrite:true`
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
- `localExportableSyncReady:true`
- `transportEligibilityFromLocalExportableReady:true`
- `localExportableSyncReadyIsAuthorization:false`
- `restartFailClosed:true`
- `bootResumeDispatch:false`
- `webdavCloudRelayBlocked:true`
- `chatSavingCasBlocked:true`
- `a950DocumentedDebtQuarantined:true`
- `noCleanupAuthority:true`
- `idempotencyKeyHash:"sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"`
- `candidatePayloadHash:"sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85"`
- `candidateBundleHash:"sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85"`
- `peerTargetHash:"sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"`
- `remoteRootRefHash:"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"`
- `privacy.redacted:true`
- `privacy.hashOnly:true`
- `privacy.rawPrivateFieldsLogged:false`
- `privacy.rawInputRejected:false`
- `blockers:[]`
- `warnings:[]`
- `activeTransport:"local-sync-folder-json"`

## Replay Decision

The duplicate replay is accepted as an idempotent no-op:

- `ok:true`, `status:"controlled-local-mock-webdav-transport-applied"`, `blockers:[]` - the replay of the same
  approved apply is not an error;
- `modeledMockApply:true` but `modeledMockWriteCount:0` - the replay is a MODELED duplicate no-op: it counts ZERO
  additional modeled writes (the first apply already counted its one modeled write; the replay adds none);
- `duplicateReplayZeroWrite:true` - the same idempotency key / payload / target / sequence deduplicates to zero write.

No real I/O occurs on the replay: the evaluator hardcodes every real-write flag (`realWebDAVWrite`, `writesWebDAV`,
`writesCloud`, `writesRelay`, `enqueuesRelay`, `writesCAS`, `writesFiles`, `mutatesExportState`, `mintsExportId`,
`burnsSequence`, `fullBundleV3Started`) to `false`, and no request shape can flip them.

## Boundary Confirmation

- duplicate replay uses the SAME idempotency key / payload / bundle / peer / root / gate / local mock target as the
  first apply;
- duplicate replay is zero-write: `modeledMockWriteCount:0`, `duplicateReplayZeroWrite:true`;
- no real WebDAV/cloud/relay/CAS/file write occurred (`realWebDAVWrite:false`, `writesWebDAV:false`,
  `writesCloud:false`, `writesCAS:false`, `writesFiles:false`);
- no relay enqueue occurred (`writesRelay:false`, `enqueuesRelay:false`);
- no export-state mutation occurred (`mutatesExportState:false`);
- no export id was minted (`mintsExportId:false`);
- no sequence was burned (`burnsSequence:false`);
- `fullBundle.v3` remained not-started (`fullBundleV3Started:false`);
- restart/reload remained fail-closed (`restartFailClosed:true`);
- `productSyncReady:false` remains authoritative;
- `transportReady:false` remains authoritative;
- `row:a950a44b859f` remains documented/quarantined debt (`a950DocumentedDebtQuarantined:true`), not cleaned or
  mutated;
- `noCleanupAuthority:true`;
- privacy remained redacted/hash-only (`privacy.redacted:true`, `privacy.hashOnly:true`);
- blockers and warnings were empty (`blockers:[]`, `warnings:[]`).

## Out-of-Scope (unrelated, kept separate)

The pre-existing false-positive regex in `validate-sync-productsyncready-flip-gate-v1.mjs` (which matches the tail of the
unrelated field `killSwitchSeparateFromProductSyncReady:true` and is not a real `productSyncReady` flip) is NOT fixed in
this slice. It remains tracked separately as `task_c7ef8ae1`.

## Final State

Duplicate replay of the controlled local mock WebDAV apply is live-proven zero-write / idempotent, local-mock-scoped.

Real WebDAV/cloud/relay transport remains blocked and is NOT authorized by this proof.

`productSyncReady:false` and `transportReady:false` remain authoritative. Chat Saving CAS remains blocked/deferred.
