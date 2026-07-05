# Real-Transport B6 - Sequence / Export-Id Semantics - Implementation

Verdict: **B6 REAL SEQUENCE / EXPORT-ID SEMANTICS SUBSTRATE IMPLEMENTED AS A NON-WRITING, HASH-ONLY
EVALUATE/DIAGNOSE MODULE THAT MODELS EXPORT-ID / SEQUENCE FINALIZATION WITHOUT MUTATING EXPORT STATE, MINTING AN EXPORT
ID, BURNING SEQUENCE, WRITING THE PUBLICATION LEDGER, WRITING AN OUTBOX ROW, OR EXECUTING REAL TRANSPORT. REAL TRANSPORT
REMAINS UNAVAILABLE, REAL APPROVAL REMAINS FALSE, `productSyncReady:false` AND `transportReady:false` REMAIN
AUTHORITATIVE. THIS SLICE AUTHORIZES NO REAL WRITE, NO FLIP, AND NO CLEANUP**.

This implementation is non-writing and non-activating. It does not implement real sequence/export-id mutation, does not
mint an export id, does not burn sequence, does not mutate export state, does not write WebDAV/cloud/relay/CAS/files,
does not enqueue relay, does not write an outbox row or publication ledger row, does not add real credentials, does not
log raw endpoint/credential/path/payload values, does not mint or start `fullBundle.v3`, does not flip
`productSyncReady`, does not set `transportReady:true`, and does not clean or mutate `row:a950a44b859f`.

## Anchors Respected

- B6 real sequence / export-id semantics design: `53792911`.
- B5 real conflict / partial-write handling implementation: `334361cc`.
- B5 real conflict / partial-write handling design: `e60e00f0`.
- B4 real enqueue / outbox boundary implementation: `1117f976`.
- B3 durable idempotency store implementation: `804b6d67`.
- B2 controlled-write kill-switch lifecycle implementation: `de4aa12d`.
- B1 target config + credentials + peer identity implementation: `93eb9065`.
- Real-transport B1-B8 implementation-readiness rollup: `36e46513`.

## Source Change

- New module: `src-surfaces-base/studio/sync/real-transport-sequence-export.js`.
- Exposed API: `H2O.Studio.sync.realTransportSequenceExport.evaluateRealTransportSequenceExport(request)`.
- Diagnostic API: `H2O.Studio.sync.realTransportSequenceExport.diagnose()`.
- Result schema: `h2o.studio.transport.real-transport-b6-sequence-export-result.v1`.
- Request schema: `h2o.studio.transport.real-transport-b6-sequence-export-request.v1`.

The module follows the B1-B5 standalone pure-evaluator pattern. It is intentionally standalone and non-activating. It is
not wired into `studio.html`, `pack-studio.mjs`, or `webdav-transport-gates.js`.

## B6 Implementation Semantics

`evaluateRealTransportSequenceExport(request)` accepts hash-only references and returns a modeled B6 sequence/export
decision:

- export id is not minted during preflight: `exportIdMintedDuringPreflight:false`;
- export id is not minted during local mock: `exportIdMintedDuringLocalMock:false`;
- sequence is not burned during preflight: `sequenceBurnedDuringPreflight:false`;
- sequence is not burned before verified remote write: `sequenceBurnedBeforeVerifiedRemoteWrite:false`;
- verified remote write can model sequence/export readiness when all B1/B2/B3/B4/B5/B8 constraints are present;
- modeled sequence/export readiness does not mutate: `exportIdMinted:false`, `sequenceBurned:false`,
  `mutatesExportState:false`, `mintsExportId:false`, `burnsSequence:false`;
- failed before remote write blocks mint/burn;
- uncertain / partial write enters the blocking path;
- checksum mismatch blocks mint/burn;
- remote-newer conflict blocks mint/burn;
- B5 `explicit-recovery-required` blocks mint/burn;
- completed idempotency prevents duplicate mint/burn;
- changed payload/target/sequence constraints are not duplicates;
- export id and sequence finalize atomically in the model: both allowed together or neither.

## Required Cross-Blocker Preconditions

The evaluator blocks unless the request includes hash-only/model evidence for:

- B3 idempotency evidence and idempotency key.
- B4 outbox evidence and outbox record hash.
- B5 verified remote write evidence.
- B8 approval reference.
- B2 kill switch reference.
- B1 target hashes (`endpointRefHash`, `remoteRootRefHash`, `peerIdentityBindingHash`, `credentialRefHash`).
- B6 sequence/export constraint reference.
- candidate payload / bundle hash match.
- `exportIdRefHash` and `burnedSequenceRefHash` as hash-only placeholders for modeled finalization.

## Blocked Failure Modes

- missing B3 idempotency evidence -> `real-transport-b6-b3-idempotency-evidence-missing`;
- missing B4 outbox evidence -> `real-transport-b6-b4-outbox-evidence-missing`;
- missing B5 verified write evidence -> `real-transport-b6-b5-verified-write-evidence-missing`;
- missing B8 approval reference -> `real-transport-b6-b8-approval-ref-missing`;
- missing/stale B2 kill-switch reference -> `real-transport-b6-b2-kill-switch-ref-missing-or-stale`;
- missing B1 target hashes -> `real-transport-b6-b1-target-hashes-missing`;
- missing B6 constraints -> `real-transport-b6-sequence-export-constraints-missing`;
- checksum mismatch -> `real-transport-b6-checksum-mismatch-blocks-mint-burn`;
- remote-newer conflict -> `real-transport-b6-remote-newer-blocks-mint-burn`;
- partial/uncertain write -> `real-transport-b6-partial-or-uncertain-write-blocks-mint-burn`;
- explicit recovery required -> `real-transport-b6-explicit-recovery-required-blocks-mint-burn`;
- completed idempotency duplicate -> `real-transport-b6-completed-idempotency-duplicate-noop`;
- changed payload/target/sequence constraints -> `real-transport-b6-changed-payload-target-sequence-not-duplicate`;
- request to mint export id, burn sequence, or write ledger -> `real-transport-b6-mint-burn-write-request-blocked`;
- CAS boundary violation -> `real-transport-b6-cas-boundary-violation`;
- raw endpoint / credential / path / payload body / raw export id input -> `real-transport-b6-raw-input-rejected`.

## Non-Activation Invariants

The result always hardcodes:

- `realWebDAVTransportAvailable:false`
- `realTransportApprovalAccepted:false`
- `exportIdMinted:false`
- `sequenceBurned:false`
- `publicationLedgerTouched:false`
- `relayOutboxTouched:false`
- `outboxCompleted:false`
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
- `fullBundleV3Started:false`
- `chatSavingCasBlocked:true`
- `noCleanupAuthority:true`
- `noA950Mutation:true`

`ledgerWriteAllowed:true` may appear only as a modeled boundary decision when a verified remote write and all B6
conditions are present. It does not write a ledger row; the result still reports `publicationLedgerTouched:false`,
`writesFiles:false`, `mutatesExportState:false`, `exportIdMinted:false`, and `sequenceBurned:false`.

## Privacy / Redaction

All B6 inputs and outputs are hash-only. Raw endpoint URL, raw credential, raw remote path, CAS key, raw payload body,
and raw export id input are rejected and not echoed. The result reports:

- `privacy.redacted:true`
- `privacy.hashOnly:true`
- `rawEndpointLogged:false`
- `rawCredentialLogged:false`
- `rawRemotePathLogged:false`
- `rawPayloadBodyStored:false`
- `casKeysExposed:false`

## Relationship to B3

The idempotency key binds export constraints. A completed idempotency record prevents duplicate mint/burn. Changed
payload/target/sequence constraints are not duplicates and must be treated as a separately gated operation.

## Relationship to B4

The outbox cannot be marked completed before B6 policy is satisfied. The publication ledger cannot be written before a
verified remote write. Ledger references to export id / sequence are modeled only after the sequence/export allowance,
and no real ledger row is written in this slice.

## Relationship to B5

B5 verified remote write evidence is a prerequisite for modeled sequence/export readiness. B5 checksum mismatch,
remote-newer conflict, partial write, uncertain write, and explicit recovery all block mint/burn.

## Boundaries Held

- No export id was minted.
- No sequence was burned.
- No outbox row or publication ledger row was created.
- No real cleanup/mutation/WebDAV/cloud/relay/CAS/file write occurred.
- No relay enqueue occurred.
- No fullBundle v3 start/mint occurred.
- No export-state mutation occurred.
- `productSyncReady:false` and `transportReady:false` remain.
- Chat Saving CAS remains blocked/deferred.
- `row:a950a44b859f` remains documented/quarantined debt with no cleanup authority.

## Recommended Next Lane

With B6 implemented as a non-writing sequence/export substrate, the next real-transport implementation lane is the
consolidated post-B1-B6 implementation readiness review, followed by B8 real approval acceptance and B7
`transportReady` policy implementation in separate explicit slices. This B6 substrate authorizes no real transport.
