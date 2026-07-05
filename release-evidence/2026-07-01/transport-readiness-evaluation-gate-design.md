# Transport Readiness Evaluation Gate Design

Verdict: **TRANSPORT READINESS EVALUATION GATE DESIGNED - EVALUATION ONLY; TRANSPORT NOT STARTED**.

This is a design/evidence-only slice. It does not mutate product source, does not clean or mutate
`row:a950a44b859f`, does not flip `productSyncReady`, does not start WebDAV/cloud/relay/`fullBundle.v3`, and does
not touch Chat Saving WebDAV/cloud/archive CAS.

## Policy Bridge Respected

- Global readiness policy fork after a950: `b66efe02f419e3a85807f9a57a635c095fe702d9`.
- a950 read-only investigation: `baa7718d`.
- final Operational.5 rollup: `16853425`.
- localExportableSyncReady live closeout: `82cf4aba`.
- localExportableSyncReady implementation: `9d317664111a8c18e61d237f7aba8a96b86cb723`.

Selected policy option remains Option 2: keep global `productSyncReady:false`, preserve
`localExportableSyncReady:true`, and allow only a separate non-writing transport-readiness evaluation candidate state.

## Candidate Input Condition

The transport-readiness evaluation gate may be entered only when all of these inputs are visible:

- `transportEligibilityFromLocalExportableReady:true`.
- `localExportableSyncReady:true`.
- `productSyncReady:false`.
- `transportReady:false`.
- `row:a950a44b859f` remains documented, quarantined raw canonical debt.
- raw canonical bindings: `13`.
- exportable canonical bindings: `12`.
- `fullBundle.v2` bindings: `12`.
- undocumented dangling rows: `0`.
- exportable dangling bindings: `0`.
- WebDAV/cloud/relay/`fullBundle.v3` remains blocked/not-started.
- Chat Saving WebDAV/cloud/archive CAS remains blocked/deferred.

## Gate Output State

The gate output is evaluation permission only:

- `transportReadinessEvaluationAllowed:true`.
- `transportEligibilityFromLocalExportableReady:true`.
- `localExportableSyncReady:true`.
- `productSyncReady:false`.
- `transportReady:false`.
- `webdavCloudRelayBlocked:true`.
- `fullBundleV3Started:false`.
- `chatSavingCasBlocked:true`.
- `transportWriteAuthorized:false`.
- `cleanupAuthorityIntroduced:false`.

This state is not product readiness, not transport readiness, not WebDAV/cloud/relay authorization, not
`fullBundle.v3` authorization, and not cleanup authorization.

## Source Ownership Inventory

- `src-surfaces-base/studio/sync/webdav-transport-gates.js` owns the current WebDAV dry-run/control-plane gate. It is
  disabled by default, exposes `dryRunOnly:true`, keeps `productSyncReady:false`, and reports `remoteFilesWritten:false`
  and `webdavWritesEnabled:false`.
- `src-surfaces-base/studio/ingestion/export-bundle.tauri.js` owns `fullBundle.v2` export/projection. Its read-only
  diagnostic reports `writesData:false`, `writesFiles:false`, `writesTransport:false`, `noExportLatestSyncBundleCall:true`,
  `noSequenceMutation:true`, and no WebDAV/cloud/relay writes. The real `exportLatestSyncBundle(...)` path is the
  disk-writing local export path and is not transport authorization.
- `src-surfaces-base/studio/sync/folder-sync.tauri.js` owns Desktop folder sync/import handling and still reports
  WebDAV as `deferred`.
- `src-surfaces-base/studio/sync/folder-import.mv3.js` owns the Chrome/MV3 import side and still reports WebDAV as
  `deferred`.
- `tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs` owns the Chat Saving
  WebDAV/cloud/archive CAS boundary. It remains a deferred encrypted CAS-over-transport lane.

## Transport Readiness Checklist

Future transport implementation cannot begin until a separate transport-readiness lane proves each item below without
writing transport state:

1. **WebDAV write boundary rules** - disabled by default, explicit future gate, no remote write in evaluation, no raw
   endpoint/credential evidence, checksum and monotonic sequence proof, and `productSyncReady:false` still visible.
2. **Relay queue and idempotency rules** - no relay enqueue during evaluation, future writes require deterministic
   idempotency keys, duplicate replay must be zero-write, and outbox/inbox state must be bounded and restart-safe.
3. **Conflict, retry, offline, and restart safety** - stale basis, sequence regression, partial/corrupt file recovery,
   offline queue behavior, and restart duplicate prevention must be proven before any write-capable lane.
4. **`fullBundle.v3` start rules** - `fullBundle.v3` must be a separate schema/mint preflight; it cannot be inferred
   from `fullBundle.v2` parity or `localExportableSyncReady:true`.
5. **Chat Saving CAS boundary** - Chat Saving WebDAV/cloud/archive CAS remains separate and deferred; Folder Sync
   transport readiness cannot start archive package CAS.
6. **Privacy/hash-only evidence** - transport evidence must use hashes/redacted refs only. No raw chat titles, folder
   names, content, account secrets, endpoints, credentials, or raw peer IDs.
7. **Rollback/disable switch** - transport must remain disableable, default-off, and fail-closed if gates or checks are
   missing.
8. **No mutation during evaluation** - readiness evaluation may inspect and model; it must not write WebDAV/cloud/relay,
   mutate local canonical state, mutate render mirrors, mutate ledgers, or mutate Chat Saving CAS.

## Existing Transport-Like Paths That Must Remain Blocked

- WebDAV dry-run gate output remains a guard evaluation only; it is not a write path.
- Local `latest.json` / `chrome-latest.json` export/import transport remains local sync-folder JSON, not WebDAV/cloud.
- Peer transport mirror diagnostics in `fullBundle.v2` export are local-mirror/export-surface concerns and are not
  authorization to write WebDAV/cloud/relay.
- Remote-envelope and relay projection/read helpers are read/projector concerns unless a later explicit relay write gate
  is designed and approved.
- Chat Saving archive package CAS remains blocked/deferred.

## a950 Payload Shape

`row:a950a44b859f` remains documented, quarantined raw canonical debt. It is not exported as an active dangling binding:

- raw canonical bindings: `13`.
- exportable canonical bindings: `12`.
- `fullBundle.v2` bindings: `12`.
- undocumented dangling rows: `0`.
- exportable dangling bindings: `0`.

Transport-readiness evaluation may consume the exportable payload shape only. It must keep a950 visible as documented
debt and must not hide, clean, export, or authorize cleanup of that row.

## Future Implementation Order

1. Transport source inventory / no-write audit for WebDAV, relay, local sync-folder JSON, peer mirror, and Chat Saving
   CAS boundaries.
2. WebDAV dry-run contract and future gate design, still disabled by default.
3. Relay queue/idempotency/restart proof harness with no enqueue/write.
4. `fullBundle.v3` schema/mint preflight if a v3 envelope is required.
5. Transport privacy/evidence contract using redacted/hash-only fields.
6. Rollback/disable/fail-closed proof.
7. Live read-only/dry-run transport-readiness proof.
8. Only after explicit approval: a separate controlled transport implementation/apply lane.

## Final Decision

WebDAV/cloud/relay cannot start now. `fullBundle.v3` cannot start now. Chat Saving CAS cannot start now.
`productSyncReady` remains `false`. The only authorized next step is a non-writing transport-readiness evaluation lane.
