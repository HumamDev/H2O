# WebDAV Dry-Run Contract / Future Gate Design

Verdict: **WEBDAV DRY-RUN CONTRACT DESIGNED - NON-WRITING, NON-STARTING, AND NOT TRANSPORT READY**.

This is a design/evidence-only slice. It does not implement WebDAV writes, does not write to WebDAV/cloud/relay, does
not mint or start `fullBundle.v3`, does not touch Chat Saving WebDAV/cloud/archive CAS, does not flip
`productSyncReady`, does not set `transportReady:true`, does not clean or mutate `row:a950a44b859f`, and does not
weaken strict tombstone cleanup rules.

## Source Inventory Respected

- Transport source inventory / no-write audit: `35607afcaca0263c2105e98e13b5d20ea08e37e9`.
- Transport-readiness evaluation gate design: `c6d5eafe1b164570230088380377650467c028e1`.
- Global readiness policy fork: `b66efe02f419e3a85807f9a57a635c095fe702d9`.
- Final Operational.5 rollup: `16853425`.
- localExportableSyncReady live closeout: `82cf4aba`.

Current policy state remains:

- `localExportableSyncReady:true`.
- `transportEligibilityFromLocalExportableReady:true` is candidate-only.
- `transportReadinessEvaluationAllowed:true` is non-writing and non-starting.
- `productSyncReady:false`.
- `transportReady:false`.
- WebDAV/cloud/relay blocked.
- `fullBundle.v3` not started.
- Chat Saving CAS blocked/deferred.

## Recommended API / Command Name

Recommended dry-run command:

- `H2O.Studio.sync.webdavTransportGates.evaluateTransportReadinessDryRun(request)`

Rationale: reuse the existing WebDAV transport gate namespace while making the new command clearly narrower than a
write or apply path. The existing `dryRun(input)` guard evaluator remains a useful lower-level primitive; the future
contract command should wrap it with Operational.5/local exportable readiness inputs and stricter transport-readiness
failure modes.

## Recommended Gate Names

Dry-run evaluation gate:

- `webdav-transport-readiness-dry-run-evaluate`

Reserved future controlled transport gate:

- `webdav-cloud-relay-transport-controlled-apply`

The dry-run gate is not a write gate and must not be accepted for WebDAV/cloud/relay writes. The reserved controlled
transport gate is named here only to prevent accidental reuse of the dry-run gate for writes; it is not implemented or
authorized by this design.

## Required Dry-Run Input Contract

The future dry-run request must include:

- `schema:"h2o.studio.transport.webdav-readiness-dry-run-request.v1"`.
- `dryRun:true`.
- `apply:false`.
- `gate:"webdav-transport-readiness-dry-run-evaluate"`.
- `source:"operational5-local-exportable-ready"`.
- `reason` with an operator-readable non-empty value.
- `expectedBundleHash` or `expectedContentSha256` as `sha256:<64 hex>`.
- `expectedFileHash` as `sha256:<64 hex>` if a file image is modeled.
- `expectedSequenceNumber` and `previousSequenceNumber` with monotonic constraints, or an explicit
  `sequenceMode:"not-minted-in-dry-run"`.
- `expectedExportId` and `previousExportId` only as modeled/hash-safe values; dry-run must not mint a new export id.
- `privacyMode:"hash-only"`.
- `peerTarget` as a redacted/hash-only peer target or `localMockTarget`.
- `remoteRootRefHash` as a hash-only remote root reference when a remote target is modeled.
- `productSyncReady:false`.
- `transportReady:false`.
- `localExportableSyncReady:true`.
- `transportEligibilityFromLocalExportableReady:true`.
- `chatSavingCasBlocked:true`.
- `fullBundleV3Started:false`.
- `a950DocumentedDebtVisible:true`.

Raw endpoint URLs, credentials, account metadata, chat titles/content, folder names, raw chat IDs, raw folder IDs, raw
peer IDs, and raw path-like private strings are forbidden input.

## Required Dry-Run Output Contract

The future dry-run result may return `ok:true` only when status is exactly:

- `status:"webdav-transport-dry-run-ready"`.

Required output fields:

- `schema:"h2o.studio.transport.webdav-readiness-dry-run-result.v1"`.
- `ok:true` only for dry-run-ready.
- `dryRun:true`.
- `applyRequested:false`.
- `gateSatisfied:true`.
- `writesData:false`.
- `writesWebDAV:false`.
- `writesCloud:false`.
- `writesRelay:false`.
- `writesCAS:false`.
- `writesFiles:false`.
- `mutatesExportState:false`.
- `mintsExportId:false`.
- `burnsSequence:false`.
- `enqueuesRelay:false`.
- `fullBundleV3Started:false`.
- `productSyncReady:false`.
- `transportReady:false`.
- `candidatePayloadHash:"sha256:<64 hex>"`.
- `candidateBundleHash:"sha256:<64 hex>"`.
- `privacy:{redacted:true,hashOnly:true,rawPrivateFieldsLogged:false}`.
- `noCleanupAuthority:true`.
- `a950DocumentedDebtVisible:true`.
- `chatSavingCasBlocked:true`.
- `blockers:[]`.
- `warnings` may include non-authorizing dry-run notes.

The result must not log raw private names, raw IDs, raw content, raw endpoint URLs, credentials, or account-linked
metadata.

## Required Failure Modes

The future dry-run contract must fail closed for each condition below:

- missing gate -> `webdav-dry-run-gate-missing`.
- wrong gate -> `webdav-dry-run-gate-invalid`.
- `dryRun:false` -> `webdav-dry-run-required`.
- `apply:true` -> `webdav-dry-run-apply-forbidden`.
- `productSyncReady` not exactly false -> `webdav-product-sync-ready-mismatch`.
- `transportReady` not exactly false -> `webdav-transport-ready-mismatch`.
- `localExportableSyncReady` not true -> `webdav-local-exportable-not-ready`.
- `transportEligibilityFromLocalExportableReady` not true -> `webdav-transport-eligibility-missing`.
- privacy/hash-only violation -> `webdav-private-input-rejected`.
- missing or malformed checksum/hash -> `webdav-checksum-required`.
- sequence regression or unintended sequence mint -> `webdav-sequence-regression`.
- export id minted during dry-run -> `webdav-export-id-minted-in-dry-run`.
- peer target ambiguity -> `webdav-peer-target-ambiguous`.
- missing peer hash -> `webdav-peer-hash-required`.
- remote root ambiguity -> `webdav-remote-root-ambiguous`.
- relay enqueue attempted -> `webdav-dry-run-relay-enqueue-forbidden`.
- WebDAV/cloud write attempted -> `webdav-dry-run-remote-write-forbidden`.
- `fullBundle.v3` mint/start attempted -> `webdav-fullbundle-v3-start-forbidden`.
- Chat Saving CAS boundary violation -> `webdav-chat-saving-cas-boundary-violation`.
- cleanup or a950 mutation attempted -> `webdav-cleanup-authority-forbidden`.

## Guard Points Required From Source Inventory

Future implementation must explicitly guard:

- `src-surfaces-base/studio/sync/webdav-transport-gates.js`
  - `normalizeFlags(...)`
  - `evaluateGuards(...)`
  - `buildDryRunManifest(...)`
  - `dryRun(...)`
  - `diagnose(...)`
- `src-surfaces-base/studio/ingestion/export-bundle.tauri.js`
  - `diagnoseFullBundleV2ReadonlyProjection(...)`
  - `exportLatestSyncBundle(...)`
  - `recordExportEventSafely(...)`
  - `fsWriteTextFile(...)`
  - `fsRename(...)`
  - `writePeerTransportMirrorSafely(...)`
- `src-surfaces-base/studio/sync/auto-export.tauri.js`
  - disabled-by-default behavior and any future scheduling trigger.
- `src-surfaces-base/studio/sync/execute/execute-relay-broker.tauri.js`
  - `dispatchExecuteRelay(...)`, `requiresRelay`, preflight, outbox enqueue, duplicate handling, and relay status.
- `src-surfaces-base/studio/sync/execute/execute-resume-on-boot.tauri.js`
  - relay resume classification must not start transport from readiness flags.
- `src-surfaces-base/studio/sync/remote-envelope-projector.tauri.js`
  - read-only observation must remain separate from relay dispatch or convergence apply.
- Chat Saving archive modules and boundary validator
  - no archive package WebDAV/cloud/network transport and no CAS package write/read from Folder Sync transport dry-run.

## Future Implementation Order

1. Implement `evaluateTransportReadinessDryRun(...)`, still no writes.
2. Live dry-run proof with hash-only evidence and zero writes.
3. Relay queue/idempotency/restart proof, still no WebDAV writes.
4. `fullBundle.v3` preflight if a v3 envelope is required.
5. Rollback/disable/fail-closed proof.
6. Controlled transport implementation only after explicit approval and a separate write gate.

## Final Decision

WebDAV/cloud/relay cannot start now. `fullBundle.v3` cannot start now. Chat Saving CAS cannot start now.
`productSyncReady:false` and `transportReady:false` remain authoritative. This design authorizes only the next
non-writing WebDAV dry-run implementation/proof slice.
