# fullBundle.v3 Preflight / Payload Transport Boundary Design

Verdict: FULLBUNDLE V3 PREFLIGHT BOUNDARY DESIGNED - V3 DEFERRED / V2 TRANSPORT ENVELOPE PREFLIGHT NEXT.

This is a design/evidence-only slice. It does not mint or start `fullBundle.v3`, does not mutate export state, does not mint an export id, does not burn sequence, does not write to WebDAV/cloud/relay/CAS/files, does not enqueue relay, does not flip `productSyncReady`, does not set `transportReady:true`, does not clean or mutate `row:a950a44b859f`, and does not weaken strict tombstone cleanup rules.

## Anchors Respected

- Relay queue / idempotency / restart proof live closeout: `f8cfcff9eb18437134df4470c033f37d3cecc2fd`.
- Relay live-contract fix: `2d4091d7f2757879e7b79f66e97caaf46c0e92ae`.
- Relay proof harness implementation: `a8779f24ee8f043745ff3fe969d542bcf8bf2839`.
- WebDAV transport-readiness dry-run live closeout: `7dd54b42b5df25d76fd4a308fe1f4c7a1a694ba2`.
- WebDAV live contract fix: `d28cf0b8beb857c65ec1251030087c5229241477`.
- WebDAV dry-run API implementation: `f776e66d595de7ac80746fcd7e337d5452c2e26e`.
- Transport source inventory / no-write audit: `35607afcaca0263c2105e98e13b5d20ea08e37e9`.

## Current Source Findings

Current full-bundle authority is `fullBundle.v2`:

- `src-surfaces-base/studio/ingestion/export-bundle.tauri.js`
  - `FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'`.
  - `diagnoseFullBundleV2ReadonlyProjection(...)` is the safe read-only projection diagnostic.
  - `exportLatestSyncBundle(...)` is the local `latest.json` export writer and must remain outside transport dry-run.
  - `writePeerTransportMirrorSafely(...)` is a local mirror/export guard point, not WebDAV/cloud/relay authorization.
- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
  - retains `FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'`.
  - keeps WebDAV deferred.
- `src-surfaces-base/studio/sync/folder-import.mv3.js`
  - retains `FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'`.
  - keeps WebDAV deferred.
- `src-surfaces-base/studio/sync/webdav-transport-gates.js`
  - exposes dry-run readiness only.
  - reserves `webdav-cloud-relay-transport-controlled-apply` but does not make it usable.
- `src-surfaces-base/studio/sync/relay-idempotency-restart-proof-harness.js`
  - proves relay enqueue/idempotency/restart behavior without writing.

No inspected runtime source currently mints or starts `fullBundle.v3`.

## Decision: fullBundle.v3 Is Deferred

`fullBundle.v3` is **not required before the next controlled WebDAV/cloud/relay implementation preflight**.

The selected payload transport boundary is a **minimal v2 transport-envelope preflight** around the already-proven exportable `h2o.studio.fullBundle.v2` projection. The envelope may carry transport metadata and integrity evidence, but it must not alter the `fullBundle.v2` payload schema, must not mint `fullBundle.v3`, and must not become a transport write.

This decision is intentionally conservative:

- `localExportableSyncReady:true` proves exportable local parity against `fullBundle.v2`.
- WebDAV dry-run already proved a hash-only candidate payload/bundle hash without writes.
- Relay/idempotency/restart proof already proved duplicate zero-write and restart fail-closed without enqueue.
- Introducing `fullBundle.v3` now would expand schema and compatibility surface before transport write controls are proven.

## Selected Payload Transport Boundary

Future preflight should be named as a v2 transport-envelope boundary, for example:

- API recommendation: `H2O.Studio.sync.webdavTransportGates.evaluateFullBundleV2TransportEnvelopePreflight(request)`.
- Gate recommendation: `fullbundle-v2-transport-envelope-preflight-evaluate`.
- Reserved future controlled transport gate remains: `webdav-cloud-relay-transport-controlled-apply`.

The envelope preflight is non-writing and non-minting. It may reference:

- payload schema: `h2o.studio.fullBundle.v2`;
- payload hash/checksum;
- candidate bundle hash/checksum;
- exportable canonical count/hash;
- `localExportableSyncReady:true`;
- `productSyncReady:false`;
- `transportReady:false`;
- peer/mock target hash;
- remote root/ref hash;
- sequence/export constraints in existing-only mode;
- privacy redaction/hash-only evidence;
- a950 quarantine visibility.

It must not contain raw private IDs, names, titles, endpoint URLs, credentials, paths, or Chat Saving package contents.

## Required Preflight Output Contract

The future preflight result must include:

- `fullBundleV3Preflight:true`.
- `selectedPayloadBoundary:"fullBundle.v2-transport-envelope"`.
- `fullBundleV3RequiredNow:false`.
- `fullBundleV3Deferred:true`.
- `fullBundleV3Started:false`.
- `mintsExportId:false`.
- `burnsSequence:false`.
- `mutatesExportState:false`.
- `writesWebDAV:false`.
- `writesCloud:false`.
- `writesRelay:false`.
- `enqueuesRelay:false`.
- `writesCAS:false`.
- `writesFiles:false`.
- `productSyncReady:false`.
- `transportReady:false`.
- `localExportableSyncReady:true`.
- `a950DocumentedDebtQuarantined:true`.
- `a950ExcludedFromExportablePayload:true`.
- `chatSavingCasBlocked:true`.
- `privacy.hashOnly:true`.
- `privacy.rawPrivateFieldsLogged:false`.
- `transportControlledApplyGateReserved:"webdav-cloud-relay-transport-controlled-apply"`.

`fullBundleV3Preflight:true` means this boundary decision has been evaluated. It does **not** mean `fullBundle.v3` was minted or started.

## If fullBundle.v3 Is Needed Later

A separate future design must define `fullBundle.v3` before any mint/start:

- schema owner and compatibility contract;
- version marker and migration semantics;
- payload hash/checksum contract;
- sequence/export-id relationship;
- privacy/hash-only evidence rules;
- import compatibility and downgrade behavior;
- exclusion/quarantine behavior for `row:a950a44b859f`;
- CAS boundary with Chat Saving;
- rollback and disable switch;
- live read-only preflight proof before any controlled write.

That work is deferred and explicitly not implemented here.

## a950 Quarantine Contract

`row:a950a44b859f` remains documented/quarantined raw canonical debt.

The future v2 transport-envelope preflight must prove:

- a950 remains visible as documented debt;
- a950 is not exportable;
- a950 does not appear in the `fullBundle.v2` exportable binding projection;
- a950 does not leak into any transport envelope as an active dangling binding;
- a950 cleanup remains unauthorized.

## Chat Saving CAS Boundary

Chat Saving WebDAV/cloud/archive CAS remains a separate blocked/deferred lane.

The future payload transport envelope must not carry Chat Saving package bytes, archive CAS records, archive package bodies, package keys, or package auto-apply instructions.

## Failure Modes

The future preflight must block before any mint/write/enqueue when any of these are present:

- schema mismatch;
- checksum mismatch;
- sequence/export-id ambiguity;
- a950 leakage into exportable payload;
- raw private field logging;
- CAS boundary violation;
- WebDAV/relay write attempt;
- relay enqueue request;
- file write request;
- export-state mutation request;
- export id mint request;
- sequence burn request;
- `fullBundle.v3` mint/start request;
- `productSyncReady` mismatch;
- `transportReady` mismatch;
- missing or wrong preflight gate;
- missing reserved controlled gate marker.

## Future Implementation Order

1. Implement the `fullBundle.v2` transport-envelope preflight API, still non-writing.
2. Run live preflight proof with hash-only payload evidence.
3. Prove rollback/disable/fail-closed behavior.
4. Close out privacy/evidence contract.
5. Re-evaluate whether `fullBundle.v3` is still needed.
6. Implement controlled transport only after explicit approval, with `webdav-cloud-relay-transport-controlled-apply` still reserved until that slice.

## Final State

WebDAV/cloud/relay cannot start now.

No relay enqueue is authorized now.

No real transport is implemented by this design.

`fullBundle.v3` remains not-started.

No export id is minted.

No sequence is burned.

No export state is mutated.

Chat Saving CAS remains blocked/deferred.

`productSyncReady:false` remains authoritative.

`transportReady:false` remains authoritative.

a950 remains documented/quarantined debt and cannot leak into the exportable payload.

No cleanup/mutation authority is introduced.
