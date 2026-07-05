# Transport Source Inventory / No-Write Audit

Verdict: **TRANSPORT SOURCE INVENTORY COMPLETE - NO CURRENT OPERATIONAL.5 PATH STARTS TRANSPORT**.

This is an evidence/validator-only audit. It does not mutate product source, does not write to WebDAV/cloud/relay,
does not mint or start `fullBundle.v3`, does not touch Chat Saving WebDAV/cloud/archive CAS, does not flip
`productSyncReady`, does not clean or mutate `row:a950a44b859f`, and does not introduce cleanup or transport write
authority.

## Gate Design Respected

- Transport-readiness evaluation gate design: `c6d5eafe1b164570230088380377650467c028e1`.
- Global readiness policy fork: `b66efe02f419e3a85807f9a57a635c095fe702d9`.
- Final Operational.5 rollup: `16853425`.
- localExportableSyncReady live closeout: `82cf4aba`.

Current policy state remains:

- `transportEligibilityFromLocalExportableReady:true` is only an evaluation candidate.
- `transportReadinessEvaluationAllowed:true` is non-writing and non-starting.
- `transportReady:false`.
- `productSyncReady:false`.
- WebDAV/cloud/relay blocked.
- `fullBundle.v3` not started.
- Chat Saving CAS blocked/deferred.

## Inventory Classification

| Source area | File/function anchors | Classification | Audit finding |
| --- | --- | --- | --- |
| WebDAV control plane | `src-surfaces-base/studio/sync/webdav-transport-gates.js`; `evaluateGuards(...)`; `buildDryRunManifest(...)`; `dryRun(...)`; `diagnose(...)` | pending transport implementation / write-capable gate model but blocked | Disabled-by-default dry-run evaluator only. It reports `dryRunOnly:true`, `remoteFilesWritten:false`, `webdavWritesEnabled:false`, `productSyncReady:false`, `webdavDisabledByDefault:true`, `product-sync-ready-false-guard`, checksum, peer identity, privacy, sequence, dev-flag, and feature-gate guards. |
| Local export bundle / `fullBundle.v2` projection | `src-surfaces-base/studio/ingestion/export-bundle.tauri.js`; `diagnoseFullBundleV2ReadonlyProjection(...)`; `exportFullBundle(...)`; `exportLatestSyncBundle(...)`; `writePeerTransportMirrorSafely(...)` | read-only diagnostic plus local export/build only | The read-only projection reports `readOnlyProjection:true`, `writesFiles:false`, `writesTransport:false`, `noExportLatestSyncBundleCall:true`, `noSequenceMutation:true`, `noWebdavWrite:true`, `noCloudWrite:true`, `noRelayWrite:true`, and `noCasWrite:true`. The real export path is local sync-folder JSON and can write `latest.json`; it is not WebDAV/cloud/relay authorization. Peer mirror is a local mirror/export concern and must remain guarded in future transport design. |
| Desktop folder sync / import handlers | `src-surfaces-base/studio/sync/folder-sync.tauri.js` | local sync/import handling; transport still deferred | Source keeps WebDAV as `deferred`, keeps `productSyncReady:false`, and does not expose `fullBundle.v3`. Operational.5 readiness does not call a WebDAV writer. |
| Chrome/MV3 folder import | `src-surfaces-base/studio/sync/folder-import.mv3.js` | Chrome/MV3 import/projection side; transport still deferred | Source keeps WebDAV as `deferred`, keeps `productSyncReady:false`, and does not expose `fullBundle.v3`. Chrome remains request/import side, not Desktop canonical or WebDAV authority. |
| Operational.5 local exportable readiness | `src-surfaces-base/studio/store/folders.tauri.js`; `operational5LocalExportableSyncReadiness(...)` | read-only diagnostic/readiness flag | The function reports `readOnly:true`, `writesData:false`, no cleanup authority, no canonical/render/ledger/import/export mutations, `localExportableSyncReady:true`, `productSyncReady:false`, `transportReady:false`, and WebDAV/cloud/relay blocked. It does not authorize transport. |
| Relay broker | `src-surfaces-base/studio/sync/execute/execute-relay-broker.tauri.js`; `dispatchExecuteRelay(...)` | write-capable but guarded / not started by Operational.5 | Relay outbox staging exists, but it requires `dispatchProfile.requiresRelay === true`, preflight success, an enqueue API, and explicit dispatch. It is not entered by localExportableSyncReady or the transport evaluation gate. Future WebDAV/relay design must treat it as a guarded write-capable source area. |
| Execute lane relay UI/readback | `src-surfaces-base/studio/sync/execute/execute-lane-ui.tauri.js`; `summarizeRelay(...)` | read-only diagnostic | Summarizes relay rows and availability; does not dispatch or enqueue. |
| Execute resume-on-boot | `src-surfaces-base/studio/sync/execute/execute-resume-on-boot.tauri.js`; `invokeResumeAction(...)` | write-capable resume router but guarded | Can call relay/native/F5/settlement actions based on classification. It must remain outside transport readiness evaluation and be explicitly guarded in any future transport lane. |
| Remote envelope projector | `src-surfaces-base/studio/sync/remote-envelope-projector.tauri.js` | read-only diagnostic/projector | Reads accepted relay inbox rows as inert observation data. It declares no WebDAV changes, storage mutation, polling, network, automatic merge, or mobile write-back. |
| Convergence proposal/conflict readers | `src-surfaces-base/studio/sync/convergence-proposal-generator.tauri.js`; `src-surfaces-base/studio/sync/convergence-conflict-candidate-generator.tauri.js` | read-only/proposal diagnostics with relay-index reads | These may inspect relay index evidence and classify stale/blocked relay rows, but do not start transport. |
| Desktop latest-bundle auto-export | `src-surfaces-base/studio/sync/auto-export.tauri.js` | local export/build only, disabled by default | Opt-in layer over `exportLatestSyncBundle(...)`. It can schedule local `latest.json` export when enabled, but it is disabled by default and is not WebDAV/cloud/relay. Future transport design must keep auto-export separate from remote writes. |
| Chat Saving archive CAS boundary | `tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs`; `release-evidence/2026-06-30/saved-chat-archive-phase-l0-package-cloud-sync-contract.md` | blocked/deferred CAS-over-transport lane | Validator locks no archive package WebDAV/cloud/network transport, no remote-arrival auto-apply, no package bodies in metadata sync envelopes, no Chrome package-body authority, and no archive cloud-sync runtime namespace. |

## No-Write Conclusions

- No current Operational.5 path starts WebDAV/cloud/relay.
- No current `localExportableSyncReady` path writes to WebDAV/cloud/relay.
- No current `localExportableSyncReady` path calls `exportLatestSyncBundle(...)`, `dispatchExecuteRelay(...)`, or a CAS writer.
- No `fullBundle.v3` mint/start path is active in the inspected runtime sources.
- Chat Saving CAS remains blocked/deferred.
- `productSyncReady:false` remains visible and authoritative.
- `transportReady:false` remains visible.
- `row:a950a44b859f` remains documented, quarantined debt and is not cleanup authority.

## Suspicious / Write-Capable Sources To Guard Later

These sources are not current transport starts, but they must be explicitly guarded in future WebDAV dry-run contract
design:

1. `src-surfaces-base/studio/sync/webdav-transport-gates.js`
   - Guard `normalizeFlags(...)`, `evaluateGuards(...)`, `buildDryRunManifest(...)`, `dryRun(...)`, and `diagnose(...)`.
   - Required future guard points: feature gate, dev-only write flag, checksum integrity, sequence monotonicity, peer
     identity, stale basis, corrupt/partial recovery, privacy rejection, productSyncReady false visibility, and
     disabled-by-default status.
2. `src-surfaces-base/studio/ingestion/export-bundle.tauri.js`
   - Keep `diagnoseFullBundleV2ReadonlyProjection(...)` separate from `exportLatestSyncBundle(...)`.
   - Guard `exportLatestSyncBundle(...)`, `recordExportEventSafely(...)`, `fsWriteTextFile(...)`, `fsRename(...)`, and
     `writePeerTransportMirrorSafely(...)` so local export cannot be confused with remote transport.
3. `src-surfaces-base/studio/sync/auto-export.tauri.js`
   - Keep disabled-by-default; future transport cannot be triggered by auto-export alone.
4. `src-surfaces-base/studio/sync/execute/execute-relay-broker.tauri.js`
   - Guard `dispatchExecuteRelay(...)`, `requiresRelay`, preflight, relay envelope privacy, outbox enqueue, duplicate
     handling, and relay status transition.
5. `src-surfaces-base/studio/sync/execute/execute-resume-on-boot.tauri.js`
   - Guard resume classification so boot cannot start relay transport from a readiness flag.
6. `src-surfaces-base/studio/sync/remote-envelope-projector.tauri.js`
   - Keep read-only observation separate from relay dispatch or convergence apply.
7. Chat Saving archive modules and capabilities
   - Keep archive package CAS out of Folder Sync transport readiness; no archive package WebDAV/cloud/network transport.

## Future WebDAV Dry-Run Contract Must Prove

- No remote write in dry-run.
- No local canonical mutation in dry-run.
- No relay enqueue in dry-run.
- No export sequence/exportId burn in dry-run.
- No `fullBundle.v3` mint/start in dry-run.
- No Chat Saving CAS package write or read.
- Redacted/hash-only endpoint, peer, and payload evidence.
- Disabled-by-default posture remains.
- Apply/write remains impossible without a future explicit gate that is not introduced by this audit.

## Final Decision

This audit authorizes only the next WebDAV dry-run contract design slice. It does not authorize WebDAV/cloud/relay,
does not start `fullBundle.v3`, does not flip `productSyncReady`, and does not introduce cleanup or mutation authority.
