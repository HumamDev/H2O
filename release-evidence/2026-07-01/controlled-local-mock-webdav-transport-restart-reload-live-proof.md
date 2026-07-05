# Controlled Local Mock WebDAV Transport - Restart / Reload Live Proof

Verdict: **AFTER A SIMULATED RESTART / RELOAD, THE CONTROLLED LOCAL MOCK APPLY STATE CANNOT RESUME INTO ANY REAL
TRANSPORT - IT RESUMES ONLY AS A ZERO-WRITE IDEMPOTENT REPLAY; BOOT RESUME DISPATCH IS FALSE; RESTART IS FAIL-CLOSED;
NO REAL WEBDAV/CLOUD/RELAY/CAS/FILE WRITE AND NO RELAY ENQUEUE OCCURS**.

This is a restart/reload live proof for the controlled local mock WebDAV apply. It is local mock only. It does not run
another apply, does not write to real WebDAV/cloud/relay/CAS/files, does not enqueue relay, does not mint or start
`fullBundle.v3`, does not mutate export state, does not mint an export id, does not burn sequence, does not flip
`productSyncReady`, does not set `transportReady:true`, and does not clean or mutate `row:a950a44b859f`.

## Anchors Respected

- Controlled local mock duplicate replay live proof: `6c55a81b`.
- First controlled local mock WebDAV apply live closeout: `c3fd4b57`.
- Approval predicate live closeout: `1d7a2daa`.
- Controlled local mock implementation: `050286fe`.
- Controlled-write kill switch: `edb30677`.
- Final transport rollup (transport readiness global-blocked): `40f52a5f`.

## Live Proof Wrapper

- `schema:"h2o.studio.controlled-local-mock-webdav-transport.restart-reload-live-proof.v1"`
- `diagnosticOnly:false`
- `restartReload:true`
- `apiAvailable:true`
- `controlledMockApiAvailable:true`
- `gate:"webdav-cloud-relay-transport-controlled-apply"`

## Live API

`H2O.Studio.sync.webdavTransportGates.evaluateControlledLocalMockTransport(request)`

Each result below is produced by executing the real controlled local mock transport evaluator - the same deterministic
gate code the live Desktop webview runs (a pure function with no real I/O, no relay-outbox write, no publication-ledger
write, and no boot/reload dispatcher) - with restart/reload request shapes. Results are reproducible from source.

## Primary Result - Reload Resumes Only as a Zero-Write Idempotent Replay

Request: apply-mode, controlled gate + kill switch enabled + valid apply approval, `restart.simulateReload:true`,
`restart.expectFailClosed:true`, and the SAME idempotency key / payload / target as the first apply with a replay marker.

- `ok:true`
- `status:"controlled-local-mock-webdav-transport-applied"`
- `restartFailClosed:true`
- `bootResumeDispatch:false`
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
- `localExportableSyncReadyIsAuthorization:false`
- `noCleanupAuthority:true`
- `blockers:[]`

The reload re-evaluates the same idempotency key as a REPLAY: `modeledMockWriteCount:0` (zero-write) with no real
write. A restart/reload of the local mock apply cannot turn the modeled apply into a live transport write.

## Fail-Closed Matrix - Resume Attempts Are Blocked, Never Dispatched

Every blocked case below keeps `bootResumeDispatch:false` and every real-write flag `false`:

- **Boot resume tries to dispatch without the controlled gate** (`restart.allowDispatchWithoutControlledGate:true`):
  `restartFailClosed:false`, `ok:false`, blocker `controlled-local-mock-restart-fail-closed-proof-required`.
- **Boot resume with no fail-closed proof** (`restart.simulateBootResume:true`, no `expectFailClosed`):
  `restartFailClosed:false`, `ok:false`, blocker `controlled-local-mock-restart-fail-closed-proof-required`.
- **Missing controlled gate on resume** (empty gate): `ok:false`, blocker
  `controlled-local-mock-controlled-gate-required`.
- **Disabled / missing kill switch on resume** (`killSwitch.enabled:false`): `ok:false`, blocker
  `controlled-local-mock-kill-switch-disabled`.
- **False readiness claim on resume** (`productSyncReady:true` / `transportReady:true`): `ok:false`, blockers
  `controlled-local-mock-product-sync-ready-mismatch` and `controlled-local-mock-transport-ready-mismatch`.

## Relay Outbox / Publication Ledger Are Not Touched

The controlled local mock transport evaluator is a pure decision function: it returns a result object and writes
nothing. Its body contains no relay-outbox write, no publication-ledger write, and no dispatcher. A controlled local
mock dry-run/apply record is therefore NOT a relay outbox row - it is never appended to the relay outbox
(`h2o:sync:relay-outbox:v1`) or the publication ledger. This is consistent with the relay-idempotency restart proof
boundary already established in source (`relayOutboxTouched:false`, `publicationLedgerTouched:false`,
`dryRunRecordsAreNotRelayOutboxRows:true`). Because no outbox row and no boot dispatcher exist for the local mock apply,
a restart/reload has nothing to auto-resume into a real WebDAV/cloud/relay dispatch.

## Investigation / Proof

1. **Boot/reload cannot auto-dispatch the local mock apply**: `bootResumeDispatch:false` in every result; a boot
   resume that tries to dispatch without the controlled gate (or without a fail-closed proof) is blocked with
   `controlled-local-mock-restart-fail-closed-proof-required`.
2. **Dry-run/apply records are not relay outbox rows**: the evaluator writes nothing; no outbox/ledger row is created;
   consistent with `dryRunRecordsAreNotRelayOutboxRows:true`.
3. **Duplicate replay state cannot become live transport state**: the reload-as-replay is `modeledMockWriteCount:0`,
   `duplicateReplayZeroWrite:true`, with every real-write flag `false`.
4. **Missing controlled gate blocks resume**: blocker `controlled-local-mock-controlled-gate-required`.
5. **Disabled or missing kill switch blocks resume**: blocker `controlled-local-mock-kill-switch-disabled`.
6. **`localExportableSyncReady:true` is not transport authorization**: `localExportableSyncReadyIsAuthorization:false`;
   a false `productSyncReady:true` claim is rejected.
7. **`transportEligibilityFromLocalExportableReady:true` is not transport authorization**: it is a required
   eligibility input only; it never authorizes a real write, and a false `transportReady:true` claim is rejected.
8. **`productSyncReady:false` and `transportReady:false` remain blockers**: claiming either `true` blocks with
   `controlled-local-mock-product-sync-ready-mismatch` / `controlled-local-mock-transport-ready-mismatch`.
9. **Restart/reload keeps every real-write flag false**: `realWebDAVWrite:false`, `writesWebDAV:false`,
   `writesCloud:false`, `writesRelay:false`, `enqueuesRelay:false`, `writesCAS:false`, `writesFiles:false`,
   `mutatesExportState:false`, `mintsExportId:false`, `burnsSequence:false`, `fullBundleV3Started:false`.

## Boundary Confirmation

- restart/reload is fail-closed (`restartFailClosed:true` on the valid resume; blocked otherwise);
- boot resume dispatch stayed false (`bootResumeDispatch:false`);
- relay outbox not touched; publication ledger not touched;
- no real WebDAV/cloud/relay/CAS/file write occurred;
- no relay enqueue occurred;
- no export-state mutation / export-id mint / sequence burn occurred;
- `fullBundle.v3` remained not-started;
- `productSyncReady:false` and `transportReady:false` remain authoritative;
- `row:a950a44b859f` remains documented/quarantined debt (`noCleanupAuthority:true`), not cleaned or mutated;
- privacy remained redacted/hash-only.

## Out-of-Scope (unrelated, kept separate)

No unrelated validator hygiene was changed in this slice. (The previously-flagged productSyncReady flip-gate regex
false-positive was already resolved upstream on identifier boundary and is not part of this slice.)

## Final State

The controlled local mock WebDAV apply is restart/reload fail-closed: it resumes only as a zero-write idempotent replay,
never a real transport write or relay dispatch.

Real WebDAV/cloud/relay transport remains blocked and is NOT authorized by this proof. `productSyncReady:false` and
`transportReady:false` remain authoritative. Chat Saving CAS remains blocked/deferred.
