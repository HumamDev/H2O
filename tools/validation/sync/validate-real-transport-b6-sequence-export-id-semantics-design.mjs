#!/usr/bin/env node
//
// Real-transport B6 - sequence / export-id semantics design validator.
//
// Proves the B6 design: it respects the B5 (e60e00f0), B4 (0b6ed75e), B3 (e1618571), B2 (09bf7701), B1 (b2e10531), and
// B8+B7 (26e6241b) designs and the gap review (d2bea4c0); B6 is design-only (no sequence/export-id codes are implemented
// in product source); no real transport authorization is introduced; NO raw endpoint / credential / path / payload-body
// value appears in the design; B1-B8 are confirmed all design-specified; productSyncReady:false and transportReady:false
// remain; fullBundle.v3 remains deferred/not-started; Chat Saving CAS remains blocked/deferred; and no cleanup/a950
// mutation authority is introduced. Evidence/validator-only; no product source changed.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const designPath = 'release-evidence/2026-07-01/real-transport-b6-sequence-export-id-semantics-design.md';
const b5DesignPath = 'release-evidence/2026-07-01/real-transport-b5-conflict-partial-write-handling-design.md';
const b4DesignPath = 'release-evidence/2026-07-01/real-transport-b4-enqueue-outbox-boundary-design.md';
const b3DesignPath = 'release-evidence/2026-07-01/real-transport-b3-durable-idempotency-store-design.md';
const b2DesignPath = 'release-evidence/2026-07-01/real-transport-b2-kill-switch-lifecycle-design.md';
const b1DesignPath = 'release-evidence/2026-07-01/real-transport-b1-target-config-credentials-peer-identity-design.md';
const b8b7DesignPath = 'release-evidence/2026-07-01/real-transport-approval-contract-and-readiness-policy-design.md';
const gapReviewPath = 'release-evidence/2026-07-01/real-webdav-cloud-relay-transport-readiness-gap-review.md';
const finalRollupPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-final-rollup.md';
const transportGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const relayOutboxPath = 'src-surfaces-base/studio/sync/relay-outbox.tauri.js';
const publicationLedgerPath = 'src-surfaces-base/studio/sync/publication-ledger.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const chatSavingBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

function read(rel) { const abs = path.join(root, rel); assert.ok(fs.existsSync(abs), `missing ${rel}`); return fs.readFileSync(abs, 'utf8'); }
function compact(v) { return String(v).replace(/\s+/g, ' '); }
function assertIncludes(src, tok, label) { assert.ok(String(src).includes(tok), `${label}: missing ${tok}`); }
function assertNotIncludes(src, tok, label) { assert.ok(!String(src).includes(tok), `${label}: forbidden ${tok}`); }

const design = read(designPath);
const flat = compact(design);
const transportGates = read(transportGatesPath);
const relayOutbox = read(relayOutboxPath);
const publicationLedger = read(publicationLedgerPath);
const folderSync = read(folderSyncPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

// ---------------------------------------------------------------------------
// (1) Design content anchors: verdict, 8 areas, lifecycle, rollback, B3/B4/B5, all-blockers, next lane.
// ---------------------------------------------------------------------------
for (const token of [
  'B6 REAL SEQUENCE / EXPORT-ID SEMANTICS IS DESIGNED (DESIGN / SPECIFICATION ONLY)',
  'WITH B6 DESIGNED, ALL OF\nB1-B8 ARE NOW DESIGN-SPECIFIED'.replace(/\n\s*/g, ' '),
  'design/specification evidence + validator slice only',
  'e60e00f0', '0b6ed75e', 'e1618571', '09bf7701', 'b2e10531', '26e6241b', 'd2bea4c0',
  // 1. export-id lifecycle
  '## 1. Export-Id Lifecycle',
  'exportIdMintedDuringPreflight: false',
  'exportIdMintedDuringLocalMock: false',
  'a real export id may be minted ONLY at the transition to a\n  verified real controlled write'.replace(/\n\s*/g, ' '),
  // 2. sequence lifecycle
  '## 2. Sequence Lifecycle',
  'sequenceBurnedDuringPreflight: false',
  'sequenceBurnedBeforeVerifiedRemoteWrite: false',
  'noBurnedSequenceForFailedOrUncertainWrite: true',
  // 3. rollback / recovery
  '## 3. Rollback / Recovery',
  'failedBeforeWriteNoMintNoBurn: true',
  'uncertainWriteEntersExplicitRecovery: true',
  'checksumMismatchBlocksSequenceBurn: true',
  'remoteNewerBlocksSequenceBurn: true',
  'partialWriteBlocksSequenceBurn: true',
  'either both are finalized on a verified write or neither is',
  // 4. B3
  '## 4. Relationship to B3 Idempotency',
  'the idempotency key binds the export constraints',
  'a completed idempotency record prevents duplicate mint/burn',
  'duplicate-replay-noop',
  // 5. B4
  '## 5. Relationship to B4 Outbox / Ledger',
  'outboxCompletedRequiresSequenceExportPolicy: true',
  'ledgerNeverPrecedesVerifiedRemoteWrite: true',
  'exportIdRefHash',
  'burnedSequenceRefHash',
  // 6. B5
  '## 6. Relationship to B5',
  'explicitRecoveryBlocksMintBurn: true',
  'a B5 verified remote write is a prerequisite',
  // 7. privacy
  'rawPayloadBodyStored: false',
  'casKeysExposed: false',
  'touchChatSavingCas: false',
  // 8. a950/CAS/fullBundle
  'noCleanupAuthority: true',
  'noA950Mutation: true',
  'stays OUT of the exportable payload',
  "payloadSchema: 'h2o.studio.fullBundle.v2'",
  // all-blockers + next + start-now
  '## All Gap-Review Blockers Now Design-Specified',
  'Design-specified is NOT implemented and NOT approved',
  '## Recommended Next Lane After B6',
  'A consolidated real-transport implementation-readiness rollup',
  '## Can Real Transport Start Now?',
]) {
  assertIncludes(flat, token, `design token ${token}`);
}

// B1-B8 all listed as design-specified in the all-blockers section
for (const b of [
  '**B1** target config + credentials + peer identity - designed',
  '**B2** kill-switch real lifecycle - designed',
  '**B3** durable idempotency store - designed',
  '**B4** real enqueue / outbox boundary - designed',
  '**B5** conflict / partial-write handling - designed',
  '**B6** sequence / export-id semantics - designed',
  '**B7** `transportReady` policy - designed',
  '**B8** real-transport approval contract - designed',
]) {
  assertIncludes(flat, b, `all-blockers design-specified ${b}`);
}

for (const forbidden of [
  'realTransportApprovalAccepted: true',
  'realWebDAVTransportAvailable: true',
  'transportReady:true` remains',
  'productSyncReady:true` remains',
  'authorizes real transport',
  'real transport may start now',
  'row:a950a44b859f` was cleaned',
]) {
  assertNotIncludes(flat, forbidden, `design must not claim: ${forbidden}`);
}

// ---------------------------------------------------------------------------
// (2) NO raw endpoint / credential / path / payload-body values anywhere in the design.
// ---------------------------------------------------------------------------
assert.doesNotMatch(design, /https?:\/\//i, 'design must contain no raw endpoint URL');
assert.doesNotMatch(design, /\b(?:ftp|webdav|dav|smb|s3):\/\//i, 'design must contain no raw remote scheme URL');
assert.doesNotMatch(design, /\b(?:password|passwd|secret|apikey|api_key|access[_-]?key|token)\s*[:=]\s*\S/i,
  'design must contain no raw credential assignment');
assert.doesNotMatch(design, /\bBearer\s+[A-Za-z0-9._-]{6,}|\bBasic\s+[A-Za-z0-9+/=]{6,}/,
  'design must contain no raw auth header value');

// ---------------------------------------------------------------------------
// (3) Chain evidence retained.
// ---------------------------------------------------------------------------
assertIncludes(read(b5DesignPath), 'B5 REAL CONFLICT / PARTIAL-WRITE HANDLING IS DESIGNED', 'B5 design respected');
assertIncludes(read(b4DesignPath), 'B4 REAL ENQUEUE / OUTBOX / PUBLICATION-LEDGER BOUNDARY IS DESIGNED', 'B4 design respected');
assertIncludes(read(b3DesignPath), 'B3 DURABLE REAL-TRANSPORT IDEMPOTENCY STORE IS DESIGNED', 'B3 design respected');
assertIncludes(read(b2DesignPath), 'B2 REAL CONTROLLED-WRITE KILL-SWITCH LIFECYCLE IS DESIGNED', 'B2 design respected');
assertIncludes(read(b1DesignPath), 'B1 REAL WEBDAV/CLOUD/RELAY TARGET CONFIG + CREDENTIAL HANDLING + PEER IDENTITY IS DESIGNED',
  'B1 design respected');
assertIncludes(read(b8b7DesignPath), 'B8 REAL-TRANSPORT APPROVAL CONTRACT AND B7 `transportReady` POLICY ARE DESIGNED',
  'B8+B7 design respected');
assertIncludes(read(gapReviewPath), 'REAL WEBDAV/CLOUD/RELAY TRANSPORT CANNOT START NOW', 'gap review respected');
assertIncludes(read(finalRollupPath), 'THE CONTROLLED LOCAL MOCK WEBDAV TRANSPORT LANE IS COMPLETE AND AT A STABLE HANDOFF POINT',
  'final local mock rollup respected');

// ---------------------------------------------------------------------------
// (4) DESIGN-ONLY: no B6 sequence/export codes implemented in source; invariants intact.
// ---------------------------------------------------------------------------
assertNotIncludes(transportGates, 'real-transport-b6-', 'B6 codes must not be implemented in source (design-only)');
assertNotIncludes(transportGates, 'exportIdRefHash', 'B6 export-id mint must not be implemented in source (design-only)');
assertNotIncludes(publicationLedger, 'exportIdRefHash', 'B6 export id must not be minted into the publication ledger (design-only)');
assertNotIncludes(relayOutbox, 'real-transport-b6-', 'B6 codes must not be minted into the relay outbox (design-only)');
for (const token of [
  'realTransportApprovalAccepted: false',
  'realWebDAVTransportAvailable: false',
  'transportReady: false',
  'realWebDAVWrite: false',
]) {
  assertIncludes(transportGates, token, `source invariant ${token}`);
}
assert.ok(!transportGates.includes('realWebDAVTransportAvailable: true'), 'source must not make real WebDAV available');
assert.ok(!transportGates.includes('productSyncReady: true') && !transportGates.includes('productSyncReady = true'),
  'source must not flip productSyncReady true');
assert.doesNotMatch(`${transportGates}\n${folderSync}`, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'no fullBundle.v3 in source');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(chatSavingBoundary, 'deferred encrypted', 'Chat Saving CAS deferred lane retained');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.real-transport-b6-sequence-export-id-semantics-design.validator.v1',
  lane: 'real-webdav-cloud-relay-transport',
  phase: 'b6-sequence-export-id-semantics-design',
  evidence: designPath,
  verdict: 'B6_DESIGNED_ALL_B1_B8_DESIGN_SPECIFIED_REAL_TRANSPORT_STILL_BLOCKED',
  b5DesignRespected: 'e60e00f0',
  b4DesignRespected: '0b6ed75e',
  b3DesignRespected: 'e1618571',
  b2DesignRespected: '09bf7701',
  b1DesignRespected: 'b2e10531',
  b8b7DesignRespected: '26e6241b',
  gapReviewRespected: 'd2bea4c0',
  designOnly: true,
  sequenceExportIdImplemented: false,
  realTransportAuthorizationIntroduced: false,
  rawEndpointCredentialPathPayloadPresent: false,
  allBlockersDesignSpecified: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8'],
  realTransportApprovalAccepted: false,
  transportReady: false,
  productSyncReady: false,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
  cleanupAuthorityIntroduced: false,
  recommendedNextLane: 'consolidated-real-transport-implementation-readiness-rollup-design-only',
}, null, 2));
console.log('PASS validate-real-transport-b6-sequence-export-id-semantics-design');
