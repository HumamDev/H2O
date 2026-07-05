# fullBundle.v2 Transport-Envelope Preflight Implementation

Verdict: FULLBUNDLE V2 TRANSPORT ENVELOPE PREFLIGHT IMPLEMENTED - ZERO WRITE.

This slice implements a non-writing preflight API for the selected `fullBundle.v2` transport-envelope boundary. It does not alter the `fullBundle.v2` payload, does not mint or start `fullBundle.v3`, does not mutate export state, does not mint an export id, does not burn sequence, does not write to WebDAV/cloud/relay/CAS/files, does not enqueue relay, does not flip `productSyncReady`, does not set `transportReady:true`, does not clean or mutate `row:a950a44b859f`, and does not weaken strict tombstone cleanup rules.

## Anchors Respected

- fullBundle v3 / payload transport boundary design: `cb587fa0aa9e02b3acda0678997ef118d6dd76be`.
- Relay queue / idempotency / restart proof live closeout: `f8cfcff9eb18437134df4470c033f37d3cecc2fd`.
- WebDAV transport-readiness dry-run live closeout: `7dd54b42b5df25d76fd4a308fe1f4c7a1a694ba2`.
- Transport source inventory / no-write audit: `35607afcaca0263c2105e98e13b5d20ea08e37e9`.
- localExportableSyncReady live closeout: `82cf4aba`.

## Source/API Added

Source:

- `src-surfaces-base/studio/sync/webdav-transport-gates.js`

Runtime namespace:

- `H2O.Studio.sync.fullBundleTransportEnvelope.evaluateFullBundleV2TransportEnvelopePreflight(request)`

The API is hosted in the existing loaded transport gate module to avoid touching dirty loader/package files and to keep the preflight close to the WebDAV/cloud/relay dry-run guards.

Request schema:

- `h2o.studio.transport.fullbundle-v2-transport-envelope-preflight-request.v1`

Result schema:

- `h2o.studio.transport.fullbundle-v2-transport-envelope-preflight-result.v1`

Preflight gate:

- `fullbundle-v2-transport-envelope-preflight-evaluate`

Reserved future controlled transport gate:

- `webdav-cloud-relay-transport-controlled-apply`

## Valid Preflight Contract

A valid preflight request is dry-run only:

- `dryRun:true`
- `apply:false`
- `gate:"fullbundle-v2-transport-envelope-preflight-evaluate"`
- payload schema remains `h2o.studio.fullBundle.v2`
- candidate payload / bundle hash is SHA-256
- expected checksum hash is SHA-256 and matches the candidate hash
- expected binding projection hash is SHA-256 and matches the candidate hash
- expected binding projection count equals the observed/provided `fullBundle.v2` projection count
- `privacy.mode:"hash-only"`
- peer/mock target hash is SHA-256
- sequence/export constraints are existing-only and do not mint or burn
- `a950DocumentedDebtQuarantined:true`
- `a950LeaksIntoExportablePayload:false`
- `localExportableSyncReady:true`
- `transportEligibilityFromLocalExportableReady:true`
- `productSyncReady:false`
- `transportReady:false`

## Valid Preflight Result

The valid result returns:

- `ok:true`
- `status:"fullbundle-v2-transport-envelope-preflight-ready"`
- `fullBundleV2EnvelopePreflight:true`
- `selectedPayloadBoundary:"fullBundle.v2-transport-envelope"`
- `payloadSchema:"h2o.studio.fullBundle.v2"`
- `fullBundleV3Required:false`
- `fullBundleV3Deferred:true`
- `fullBundleV3Started:false`
- `payloadUnmodified:true`
- `writesWebDAV:false`
- `writesCloud:false`
- `writesRelay:false`
- `enqueuesRelay:false`
- `writesCAS:false`
- `writesFiles:false`
- `mutatesExportState:false`
- `mintsExportId:false`
- `burnsSequence:false`
- `productSyncReady:false`
- `transportReady:false`
- `localExportableSyncReady:true`
- `localExportableSyncReadyIsAuthorization:false`
- `transportEligibilityFromLocalExportableReady:true`
- `webdavCloudRelayBlocked:true`
- `chatSavingCasBlocked:true`
- `a950DocumentedDebtQuarantined:true`
- `a950LeaksIntoExportablePayload:false`
- `noCleanupAuthority:true`
- `privacy.hashOnly:true`
- `privacy.rawPrivateFieldsLogged:false`
- `blockers:[]`
- `activeTransport:"local-sync-folder-json"`

## Blocked Failure Modes

The preflight blocks before any write/enqueue/mint/mutation for:

- missing/wrong gate,
- `dryRun:false`,
- `apply:true`,
- schema mismatch,
- checksum/hash mismatch,
- projection count mismatch,
- privacy/raw input violation,
- sequence/export-id ambiguity,
- peer target ambiguity,
- `fullBundle.v3` start/mint request,
- `fullBundle.v2` payload mutation request,
- export-state mutation / export-id mint / sequence burn request,
- WebDAV/cloud write request,
- relay enqueue request,
- CAS write request,
- file write request,
- a950 leakage into exportable payload,
- missing a950 quarantine visibility,
- `productSyncReady` mismatch,
- `transportReady` mismatch,
- `localExportableSyncReady` mismatch,
- missing transport eligibility,
- cleanup or a950 mutation request.

## Boundary Semantics

`localExportableSyncReady:true` is an input to this preflight, not transport authorization.

This preflight does not authorize WebDAV/cloud/relay.

This preflight does not authorize the reserved controlled transport gate.

This preflight does not authorize cleanup.

`row:a950a44b859f` remains documented/quarantined debt and cannot leak into the exportable payload.

Chat Saving CAS remains a separate blocked/deferred lane.

## Final State

WebDAV/cloud/relay cannot start now.

No relay enqueue is authorized now.

No real transport is implemented by this preflight.

`fullBundle.v3` remains deferred and not-started.

The `fullBundle.v2` payload remains unmodified.

No export id is minted.

No sequence is burned.

No export state is mutated.

Chat Saving CAS remains blocked/deferred.

`productSyncReady:false` remains authoritative.

`transportReady:false` remains authoritative.

a950 remains documented/quarantined debt.

No cleanup/mutation authority is introduced.
