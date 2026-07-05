# Real Transport W1a Console Aggregator Implementation

## Verdict

W1A REAL-TRANSPORT CONSOLE AGGREGATOR SUBSTRATE IMPLEMENTED AS STANDALONE, NON-WRITING, NON-ACTIVATING SOURCE.

This slice adds a console aggregator for VM/source-harness proof only. It does not wire the module into `studio.html` or `tools/product/studio/pack-studio.mjs`, and it does not edit `webdav-transport-gates.js` or any existing `real-transport-*.js` module body.

## Anchors

- Real transport dry-run proof closeout: `ba5844f7`
- Real transport dry-run implementation: `f93350d4`
- B7 readiness candidate implementation: `34356fa6`
- B8 approval acceptance implementation: `a4777528`
- B1-B6 implementation rollup: `10e1ee6c`
- B1 target config implementation: `93eb9065`
- B2 kill-switch lifecycle implementation: `de4aa12d`
- B3 idempotency implementation: `804b6d67`
- B4 enqueue/outbox boundary implementation: `1117f976`
- B5 conflict/partial-write implementation: `334361cc`
- B6 sequence/export-id implementation: `7cac0d82`

## API

New module:

`src-surfaces-base/studio/sync/real-transport-console.js`

Exposes:

- `H2O.Studio.sync.realTransportConsole.diagnose()`
- `H2O.Studio.sync.realTransportConsole.runChainedDryRun(request)`

Operator harness:

`tools/validation/sync/run-real-transport-console-dry-run.mjs`

Validator:

`tools/validation/sync/validate-real-transport-w1-console-implementation.mjs`

## Semantics

`diagnose()` fans out to the loaded standalone substrate `diagnose()` functions for:

- B1 target config
- B2 kill switch
- B3 idempotency
- B4 enqueue/outbox boundary
- B5 conflict/partial-write recovery
- B6 sequence/export-id
- B8 approval acceptance
- B7 readiness candidate
- real transport dry-run

If any namespace is absent, `diagnose()` fails closed and reports `missingSubstrates`.

`runChainedDryRun(request)` calls each substrate evaluator in dependency order and then feeds a redacted, hash-only evidence object into:

`H2O.Studio.sync.realTransportDryRun.evaluateRealTransportDryRun(request)`

The aggregator does not mutate or override substrate result objects. It preserves B8 approval acceptance as approval-contract validity only; it does not turn B8 acceptance into real transport availability or write authority. `transportReadyCandidate:true` can pass through only as candidate-only evidence from B7.

## Fail-Closed Behavior

The validator proves:

- missing substrate namespace blocks;
- local mock approval blocks through the chain;
- local mock target cannot substitute for real target evidence;
- `localExportableSyncReady:true` alone blocks;
- raw endpoint, credential, path, and payload input is rejected and not echoed;
- CAS input blocks and is not echoed;
- request attempts to coerce transport/write/readiness flags do not change the composite no-write result.

## VM / Canary Proof

The validator loads the disabled control-plane source plus the standalone real-transport modules into a single VM sandbox with throwing canary stubs for:

- `localStorage`
- `fetch`
- `XMLHttpRequest`
- `invoke`

No canary fires during module installation. The console module performs no work at load except namespace installation.

## Non-Activation Invariants

The composite result keeps these flags false:

- `realWebDAVTransportAvailable:false`
- `transportReady:false`
- `transportReadyFlipAuthorized:false`
- `productSyncReady:false`
- `writesWebDAV:false`
- `writesCloud:false`
- `writesRelay:false`
- `writesCAS:false`
- `writesFiles:false`
- `enqueuesRelay:false`
- `realOutboxRowCreated:false`
- `relayOutboxTouched:false`
- `publicationLedgerTouched:false`
- `durableStoreCreated:false`
- `mintsExportId:false`
- `burnsSequence:false`
- `mutatesExportState:false`
- `fullBundleV3Started:false`

No WebDAV/cloud/relay/CAS/file write is authorized. No relay enqueue is authorized. No outbox, publication ledger, or durable store mutation is authorized. No export id mint or sequence burn is authorized.

## Standalone Status

W1a is intentionally standalone. Loader registration is deferred to W1b until `studio.html` is clean and a separate loader/wiring slice is explicitly approved.

Files intentionally untouched by this slice:

- `src-surfaces-base/studio/studio.html`
- `tools/product/studio/pack-studio.mjs`
- `src-surfaces-base/studio/sync/webdav-transport-gates.js`
- existing real-transport substrate modules other than the new console file

## Boundaries Held

- `productSyncReady:false` remains authoritative.
- `transportReady:false` remains authoritative.
- Real WebDAV/cloud/relay transport remains unavailable.
- fullBundle.v3 remains deferred/not-started.
- Chat Saving CAS remains blocked/deferred.
- `row:a950a44b859f` remains documented/quarantined debt.
- No real credentials, raw endpoints, raw paths, payload bodies, or CAS keys are logged.
