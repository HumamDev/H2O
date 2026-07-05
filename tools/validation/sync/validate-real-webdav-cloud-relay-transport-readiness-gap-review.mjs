#!/usr/bin/env node
//
// Real WebDAV / cloud / relay transport readiness gap review validator.
//
// Proves the gap review: it respects the final local mock rollup (15a33852) and the local mock proof chain; real
// transport remains blocked and cannot start now; the local mock transport is not treated as real transport;
// productSyncReady:false and transportReady:false remain; fullBundle.v3 remains deferred/not-started; Chat Saving CAS
// remains blocked/deferred; all eight remaining real-transport blockers (B1-B8) are listed; and no real transport write
// authorization and no cleanup/a950 mutation authority is introduced. It confirms the source is unmutated (real
// transport unavailable, real-write flags hardcoded false, kill switch disabled by default, fullBundle.v2 envelope,
// durable relay-outbox/publication-ledger stores exist separately). Evidence/validator-only; no product source changed.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const reviewPath = 'release-evidence/2026-07-01/real-webdav-cloud-relay-transport-readiness-gap-review.md';
const finalRollupPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-final-rollup.md';
const restartReloadPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-restart-reload-live-proof.md';
const duplicateReplayPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-duplicate-replay-live-proof.md';
const firstApplyCloseoutPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-first-apply-live-closeout.md';
const transportGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const relayOutboxPath = 'src-surfaces-base/studio/sync/relay-outbox.tauri.js';
const publicationLedgerPath = 'src-surfaces-base/studio/sync/publication-ledger.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const chatSavingBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

function read(rel) { const abs = path.join(root, rel); assert.ok(fs.existsSync(abs), `missing ${rel}`); return fs.readFileSync(abs, 'utf8'); }
function compact(v) { return String(v).replace(/\s+/g, ' '); }
function assertIncludes(src, tok, label) { assert.ok(String(src).includes(tok), `${label}: missing ${tok}`); }
function assertNotIncludes(src, tok, label) { assert.ok(!String(src).includes(tok), `${label}: forbidden ${tok}`); }

const review = read(reviewPath);
const flat = compact(review);
const transportGates = read(transportGatesPath);
const relayOutbox = read(relayOutboxPath);
const publicationLedger = read(publicationLedgerPath);
const folderSync = read(folderSyncPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

// ---------------------------------------------------------------------------
// (1) Gap-review content anchors: verdict, anchors, the 10 areas, boundaries.
// ---------------------------------------------------------------------------
for (const token of [
  'REAL WEBDAV/CLOUD/RELAY TRANSPORT CANNOT START NOW',
  'IMPLEMENTS NO REAL TRANSPORT AND AUTHORIZES NO REAL WRITE, NO FLIP, AND NO CLEANUP',
  '15a33852', '942fdff6', '6c55a81b', 'c3fd4b57', '1d7a2daa', 'edb30677', '40f52a5f',
  'The local mock lane is a set of prerequisites and safety proofs',
  '### 1. Real WebDAV target configuration',
  '### 2. Real controlled-write kill switch semantics',
  '### 3. Durable idempotency',
  '### 4. Relay outbox / publication ledger',
  '### 5. Conflict and partial-write handling',
  '### 6. Sequence / export-id semantics',
  '### 7. Payload boundary - BOUNDARY HELD',
  '### 8. CAS boundary - BOUNDARY HELD',
  '### 9. Readiness flags',
  '### 10. Approval model',
  '`fullBundle.v2` remains the selected envelope',
  'Chat Saving WebDAV/cloud/archive CAS remains a SEPARATE',
  'must never authorize real transport',
  'must never become, real',
  'local mock transport not treated as real transport',
]) {
  assertIncludes(flat, token, `review token ${token}`);
}

// ---------------------------------------------------------------------------
// (2) All eight remaining real-transport blockers are listed.
// ---------------------------------------------------------------------------
for (const blocker of [
  'B1: real-target-config-missing',
  'B2: kill-switch-real-lifecycle-missing',
  'B3: durable-idempotency-store-missing',
  'B4: real-enqueue-boundary-undesigned',
  'B5: real-conflict-partial-write-handling-missing',
  'B6: real-sequence-export-id-semantics-undesigned',
  'B7: real-transport-readiness-policy-missing',
  'B8: real-transport-approval-contract-missing',
]) {
  assertIncludes(flat, blocker, `blocker listed ${blocker}`);
}
assertIncludes(flat, '## Consolidated Remaining Blockers Before Real Transport', 'consolidated blocker list present');
assertIncludes(flat, '## Recommended Implementation Order', 'recommended order present');
assertIncludes(flat, '## Can Real WebDAV/Cloud/Relay Start Now?', 'start-now question present');
assertIncludes(flat, 'All eight blockers (B1-B8) are open', 'review states all blockers open');

for (const forbidden of [
  'real transport is authorized',
  'real WebDAV write authorized',
  'real transport may start now',
  'realWebDAVWrite:true',
  'transportReady:true` remains',
  'productSyncReady:true` remains',
  'fullBundleV3Started:true',
  'authorizes real transport',
  'row:a950a44b859f` was cleaned',
]) {
  assertNotIncludes(flat, forbidden, `review must not claim: ${forbidden}`);
}

// ---------------------------------------------------------------------------
// (3) Chain evidence retained.
// ---------------------------------------------------------------------------
assertIncludes(read(finalRollupPath), 'THE CONTROLLED LOCAL MOCK WEBDAV TRANSPORT LANE IS COMPLETE AND AT A STABLE HANDOFF POINT',
  'final local mock rollup respected');
assertIncludes(read(restartReloadPath), 'CANNOT RESUME', 'restart/reload closeout respected');
assertIncludes(read(duplicateReplayPath), 'ZERO-WRITE / IDEMPOTENT', 'duplicate replay closeout respected');
assertIncludes(read(firstApplyCloseoutPath), 'FIRST CONTROLLED LOCAL MOCK WEBDAV TRANSPORT APPLY LIVE-PROVEN',
  'first apply closeout respected');

// ---------------------------------------------------------------------------
// (4) REAL SOURCE unmutated: real transport blocked; kill switch default off; envelope v2; durable stores exist.
// ---------------------------------------------------------------------------
for (const token of [
  'realWebDAVTransportAvailable: false',
  'controlledWriteKillSwitchDefaultEnabled: false',
  'realWebDAVWrite: false',
  'realTransportApprovalAccepted: false',
  'localExportableSyncReadyIsAuthorization: false',
  "FULL_BUNDLE_V2_SCHEMA = 'h2o.studio.fullBundle.v2'",
  "ACTIVE_TRANSPORT = 'local-sync-folder-json'",
]) {
  assertIncludes(transportGates, token, `transport-gates invariant ${token}`);
}
assert.ok(!transportGates.includes('productSyncReady: true') && !transportGates.includes('productSyncReady = true'),
  'transport gates must not flip productSyncReady true');
assert.ok(!transportGates.includes('realWebDAVWrite: true') && !transportGates.includes('realTransportApprovalAccepted: true'),
  'transport gates must not introduce a real transport write/approval');
assert.doesNotMatch(`${transportGates}\n${folderSync}`, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'no fullBundle.v3 in source');
// durable relay outbox / publication ledger stores exist separately (referenced by the gap review, not touched by the mock)
assertIncludes(relayOutbox, "OUTBOX_KEY = 'h2o:sync:relay-outbox:v1'", 'durable relay outbox store exists');
assertIncludes(publicationLedger, "LEDGER_KEY = 'h2o:sync:publication-ledger:v1'", 'durable publication ledger store exists');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(chatSavingBoundary, 'deferred encrypted', 'Chat Saving CAS deferred lane retained');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.real-webdav-cloud-relay-transport-readiness-gap-review.validator.v1',
  lane: 'real-webdav-cloud-relay-transport',
  phase: 'readiness-gap-review',
  evidence: reviewPath,
  verdict: 'REAL_TRANSPORT_BLOCKED_EIGHT_OPEN_BLOCKERS',
  finalLocalMockRollupRespected: '15a33852',
  realTransportCanStartNow: false,
  localMockTreatedAsRealTransport: false,
  remainingBlockers: [
    'B1-real-target-config-missing',
    'B2-kill-switch-real-lifecycle-missing',
    'B3-durable-idempotency-store-missing',
    'B4-real-enqueue-boundary-undesigned',
    'B5-real-conflict-partial-write-handling-missing',
    'B6-real-sequence-export-id-semantics-undesigned',
    'B7-real-transport-readiness-policy-missing',
    'B8-real-transport-approval-contract-missing',
  ],
  boundariesPreserved: ['fullBundle.v2-only / fullBundle.v3-deferred', 'chat-saving-cas-separate'],
  recommendedOrder: ['B8+B7', 'B1', 'B2', 'B3+B4', 'B5+B6', 'controlled-real-write-dry-run-first-behind-all'],
  productSyncReady: false,
  transportReady: false,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
  cleanupAuthorityIntroduced: false,
  realTransportWriteAuthorizationIntroduced: false,
}, null, 2));
console.log('PASS validate-real-webdav-cloud-relay-transport-readiness-gap-review');
