#!/usr/bin/env node
//
// Real-transport B5 - conflict / partial-write handling design validator.
//
// Proves the B5 design: it respects the B4 (0b6ed75e), B3 (e1618571), B2 (09bf7701), B1 (b2e10531), and B8+B7
// (26e6241b) designs and the gap review (d2bea4c0); B5 is design-only (no conflict / recovery / retry failure codes are
// implemented in product source); no real transport authorization is introduced; NO raw endpoint / credential / path /
// payload-body value appears in the design; productSyncReady:false and transportReady:false remain; fullBundle.v3
// remains deferred/not-started; Chat Saving CAS remains blocked/deferred; and no cleanup/a950 mutation authority is
// introduced. Evidence/validator-only; no product source changed.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const designPath = 'release-evidence/2026-07-01/real-transport-b5-conflict-partial-write-handling-design.md';
const b4DesignPath = 'release-evidence/2026-07-01/real-transport-b4-enqueue-outbox-boundary-design.md';
const b3DesignPath = 'release-evidence/2026-07-01/real-transport-b3-durable-idempotency-store-design.md';
const b2DesignPath = 'release-evidence/2026-07-01/real-transport-b2-kill-switch-lifecycle-design.md';
const b1DesignPath = 'release-evidence/2026-07-01/real-transport-b1-target-config-credentials-peer-identity-design.md';
const b8b7DesignPath = 'release-evidence/2026-07-01/real-transport-approval-contract-and-readiness-policy-design.md';
const gapReviewPath = 'release-evidence/2026-07-01/real-webdav-cloud-relay-transport-readiness-gap-review.md';
const finalRollupPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-final-rollup.md';
const transportGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const relayOutboxPath = 'src-surfaces-base/studio/sync/relay-outbox.tauri.js';
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
const folderSync = read(folderSyncPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

// ---------------------------------------------------------------------------
// (1) Design content anchors: verdict, 10 areas, conflict classes, states, recovery, checksum, B4/B6, next lane.
// ---------------------------------------------------------------------------
for (const token of [
  'B5 REAL CONFLICT / PARTIAL-WRITE HANDLING IS DESIGNED (DESIGN / SPECIFICATION ONLY)',
  'design/specification evidence + validator slice only',
  '0b6ed75e', 'e1618571', '09bf7701', 'b2e10531', '26e6241b', 'd2bea4c0',
  // 1. conflict classes
  '## 1. Conflict Classes',
  'real-transport-b5-conflict-local-payload-stale',
  'real-transport-b5-conflict-remote-same-payload-hash',
  'real-transport-b5-conflict-remote-newer',
  'real-transport-b5-conflict-remote-untrusted',
  'real-transport-b5-conflict-checksum-mismatch-pre-write',
  'real-transport-b5-conflict-checksum-mismatch-post-write',
  'real-transport-b5-conflict-peer-target-mismatch',
  'real-transport-b5-conflict-credential-permission-failure',
  'real-transport-b5-conflict-uncertain-write-outcome',
  'real-transport-b5-conflict-partial-interrupted-write',
  // 2. partial-write states
  '## 2. Partial-Write States',
  '`no-remote-write-attempted`',
  '`remote-write-attempted-unconfirmed`',
  '`remote-write-observed-checksum-unverified`',
  '`remote-write-observed-checksum-verified`',
  '`explicit-recovery-required`',
  'Only `remote-write-observed-checksum-verified` may progress',
  // 3. recovery
  '## 3. Recovery Behavior',
  'noBlindRetryAfterUncertainWrite: true',
  'recovery must consult the B3 idempotency record',
  'recovery must consult the B4 outbox status',
  'recovery must revalidate the B2 kill switch is still enabled',
  'recovery must revalidate the B8 approval is still valid',
  // 4. safe retry
  '## 4. Safe Retry Rules',
  'retry from\n  `no-remote-write-attempted` is safe'.replace(/\n\s*/g, ' '),
  'real-transport-b5-changed-payload-target-not-duplicate',
  'duplicate-replay-noop',
  // 5. remote-newer
  '## 5. Remote-Newer Behavior',
  'blockLocalOverwriteOnRemoteNewer: true',
  'reviewedConflictDecisionRequired: true',
  'noLocalCanonicalMutationOnConflict: true',
  // 6. checksum
  '## 6. Checksum / Hash Behavior',
  'payloadHashMatchesFullBundleV2Envelope: true',
  'postWriteObservedHashMatchesCandidate: true',
  'checksumMismatchBlocksLedgerWrite: true',
  'checksumMismatchEntersExplicitRecovery: true',
  // 7. B4
  '## 7. Relationship to B4',
  'B5 owns the meaning of `explicit-recovery-required`',
  'outboxCompletedRequiresB5VerifiedWrite: true',
  'ledgerNeverPrecedesVerifiedRemoteWrite: true',
  // 8. B6
  '## 8. Relationship to B6',
  'b5DoesNotDecideSequenceBurn: true',
  'sequenceExportRollbackHandoffToB6',
  // 9. privacy
  'conflictEvidenceHashOnly: true',
  'rawPayloadBodyStored: false',
  'casKeysExposed: false',
  'touchChatSavingCas: false',
  // 10. a950/CAS/fullBundle
  'noCleanupAuthority: true',
  'noA950Mutation: true',
  'stays OUT of the exportable payload',
  "payloadSchema: 'h2o.studio.fullBundle.v2'",
  // remaining + next + start-now
  '## Remaining Blocker (B6 still open)',
  'B6 - real sequence / export-id semantics',
  '## Can Real Transport Start Now?',
]) {
  assertIncludes(flat, token, `design token ${token}`);
}

assertIncludes(flat, '**B6** real-sequence-export-id-semantics-undesigned', 'B6 open blocker listed');

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
// (4) DESIGN-ONLY: no B5 conflict/recovery codes implemented in source; invariants intact.
// ---------------------------------------------------------------------------
assertNotIncludes(transportGates, 'real-transport-b5-', 'B5 failure codes must not be implemented in source (design-only)');
assertNotIncludes(relayOutbox, 'real-transport-b5-', 'B5 codes must not be minted into the relay outbox (design-only)');
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
  schema: 'h2o.studio.transport.real-transport-b5-conflict-partial-write-handling-design.validator.v1',
  lane: 'real-webdav-cloud-relay-transport',
  phase: 'b5-conflict-partial-write-handling-design',
  evidence: designPath,
  verdict: 'B5_DESIGNED_DESIGN_ONLY_REAL_TRANSPORT_STILL_BLOCKED',
  b4DesignRespected: '0b6ed75e',
  b3DesignRespected: 'e1618571',
  b2DesignRespected: '09bf7701',
  b1DesignRespected: 'b2e10531',
  b8b7DesignRespected: '26e6241b',
  gapReviewRespected: 'd2bea4c0',
  designOnly: true,
  conflictRecoveryImplemented: false,
  realTransportAuthorizationIntroduced: false,
  rawEndpointCredentialPathPayloadPresent: false,
  realTransportApprovalAccepted: false,
  transportReady: false,
  productSyncReady: false,
  remainingBlockers: ['B6'],
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
  cleanupAuthorityIntroduced: false,
  recommendedNextLane: 'B6-real-sequence-export-id-semantics-design-only',
}, null, 2));
console.log('PASS validate-real-transport-b5-conflict-partial-write-handling-design');
