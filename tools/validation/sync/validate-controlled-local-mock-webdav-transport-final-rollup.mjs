#!/usr/bin/env node
//
// Controlled local mock WebDAV transport - final rollup / handoff manifest validator.
//
// Proves the handoff manifest: it respects the restart/reload closeout (942fdff6), duplicate replay closeout
// (6c55a81b), first apply closeout (c3fd4b57), and approval predicate closeout (1d7a2daa); states the local mock lane
// is complete; keeps real WebDAV/cloud/relay writes, relay enqueue, Chat Saving CAS, fullBundle.v3, productSyncReady:true
// and transportReady:true all blocked; introduces no cleanup/a950 mutation authority and no real transport write
// authorization; and records the recommended next lane + do-not-reopen list. It cross-checks the rollup against the
// real closeout evidence and confirms the source is unmutated (real-write flags hardcoded false, no productSyncReady
// flip, WebDAV deferred, Chat Saving CAS boundary intact). Evidence/validator-only; no product source changed.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const rollupPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-final-rollup.md';
const restartReloadPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-restart-reload-live-proof.md';
const duplicateReplayPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-duplicate-replay-live-proof.md';
const firstApplyCloseoutPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-first-apply-live-closeout.md';
const approvalPredicateCloseoutPath = 'release-evidence/2026-07-01/controlled-local-mock-approval-predicate-live-closeout.md';
const implementationPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-implementation.md';
const sourcePath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const chatSavingBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

function read(rel) { const abs = path.join(root, rel); assert.ok(fs.existsSync(abs), `missing ${rel}`); return fs.readFileSync(abs, 'utf8'); }
function compact(v) { return String(v).replace(/\s+/g, ' '); }
function assertIncludes(src, tok, label) { assert.ok(String(src).includes(tok), `${label}: missing ${tok}`); }
function assertNotIncludes(src, tok, label) { assert.ok(!String(src).includes(tok), `${label}: forbidden ${tok}`); }

const rollup = read(rollupPath);
const flat = compact(rollup);
const source = read(sourcePath);
const folderSync = read(folderSyncPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

// ---------------------------------------------------------------------------
// (1) Rollup content anchors (the required manifest claims).
// ---------------------------------------------------------------------------
for (const token of [
  'THE CONTROLLED LOCAL MOCK WEBDAV TRANSPORT LANE IS COMPLETE AND AT A STABLE HANDOFF POINT',
  'IT IMPLEMENTS NO REAL TRANSPORT AND AUTHORIZES NO REAL WRITE, NO FLIP, AND NO CLEANUP',
  // commit chain
  '5d0190d5', 'edb30677', '050286fe', '1d7a2daa', 'c3fd4b57', '6c55a81b', '942fdff6', '40f52a5f',
  // 1. complete
  '## 1. What Is Complete',
  '**Strict dry-run approval reporting**',
  '**First controlled local mock apply**',
  '**Duplicate replay zero-write proof**',
  '**Restart/reload fail-closed proof**',
  // 2. proved
  '## 2. What the Local Mock Lane Proved',
  '**Kill-switch-gated local mock path works**',
  '**Exact controlled gate is local-mock-only**',
  '**Operator apply approval can be accepted for local mock only**',
  '**Duplicate replay is idempotent / zero-write**',
  '**Restart/reload cannot auto-dispatch**',
  '**`localExportableSyncReady` is not transport authorization**',
  // 3. blocked
  '## 3. What Remains Blocked',
  '**Real WebDAV/cloud/relay writes**',
  '**Relay enqueue**',
  '**Chat Saving WebDAV/cloud/archive CAS**',
  '**`fullBundle.v3`**: not started',
  '**`productSyncReady:true`**: blocked',
  '**`transportReady:true`**: blocked',
  // 4. semantics
  '## 4. Final Semantics',
  '`targetMode:"local-mock-webdav"` is NOT real transport',
  '`realTransportApprovalAccepted:false` remains authoritative',
  '`transportReady:false` remains authoritative',
  '`productSyncReady:false` remains authoritative',
  // 5. next lane
  '## 5. Recommended Next Lane',
  'only after explicit approval',
  'real-transport readiness gap review before implementation',
  // 6. do-not-reopen
  '## 6. Do-Not-Reopen List',
  'Do NOT reopen Operational.5 cleanup/parity',
  'Do NOT clean `row:a950a44b859f` without NEW strict evidence',
  'Do NOT treat the local mock apply as real WebDAV transport',
  'Do NOT start Chat Saving CAS from this lane',
  'Do NOT reintroduce `fullBundle.v3`',
]) {
  assertIncludes(flat, token, `rollup token ${token}`);
}

for (const forbidden of [
  'realWebDAVWrite:true',
  'enqueuesRelay:true',
  'writesCAS:true',
  'fullBundleV3Started:true',
  'realTransportApprovalAccepted:true',
  'productSyncReady:true` remains',
  'transportReady:true` remains',
  'authorizes real WebDAV',
  'authorizes real transport',
  'row:a950a44b859f` was cleaned',
]) {
  assertNotIncludes(flat, forbidden, `rollup must not claim: ${forbidden}`);
}

// ---------------------------------------------------------------------------
// (2) Cross-check the rollup against the real closeout evidence.
// ---------------------------------------------------------------------------
assertIncludes(read(restartReloadPath), 'AFTER A SIMULATED RESTART / RELOAD, THE CONTROLLED LOCAL MOCK APPLY STATE CANNOT RESUME',
  'restart/reload closeout respected');
assertIncludes(read(duplicateReplayPath), 'DUPLICATE REPLAY OF THE CONTROLLED LOCAL MOCK WEBDAV APPLY IS ZERO-WRITE / IDEMPOTENT',
  'duplicate replay closeout respected');
assertIncludes(read(firstApplyCloseoutPath), 'FIRST CONTROLLED LOCAL MOCK WEBDAV TRANSPORT APPLY LIVE-PROVEN',
  'first apply closeout respected');
assertIncludes(read(approvalPredicateCloseoutPath), 'CONTROLLED LOCAL MOCK APPROVAL PREDICATE LIVE PROVEN',
  'approval predicate closeout respected');
assertIncludes(read(implementationPath), 'CONTROLLED LOCAL MOCK WEBDAV TRANSPORT IMPLEMENTED - MOCK ONLY / REAL TRANSPORT STILL BLOCKED',
  'implementation evidence respected');

// ---------------------------------------------------------------------------
// (3) REAL SOURCE unmutated: real transport blocked; no authorization introduced.
// ---------------------------------------------------------------------------
for (const token of [
  'realWebDAVWrite: false',
  'writesWebDAV: false',
  'writesCloud: false',
  'writesRelay: false',
  'enqueuesRelay: false',
  'writesCAS: false',
  'writesFiles: false',
  'mutatesExportState: false',
  'mintsExportId: false',
  'burnsSequence: false',
  'fullBundleV3Started: false',
  'productSyncReady: false',
  'transportReady: false',
  'realTransportApprovalAccepted: false',
  'localExportableSyncReadyIsAuthorization: false',
  'a950DocumentedDebtQuarantined: true',
  'noCleanupAuthority: true',
]) {
  assertIncludes(source, token, `source invariant ${token}`);
}
assert.ok(!source.includes('productSyncReady: true') && !source.includes('productSyncReady = true'),
  'source must not flip productSyncReady true');
assert.ok(!source.includes('realWebDAVWrite: true') && !source.includes('realTransportApprovalAccepted: true'),
  'source must not introduce a real transport write/approval');
assert.doesNotMatch(`${source}\n${folderSync}`, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'no fullBundle.v3 in source');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(chatSavingBoundary, 'deferred encrypted', 'Chat Saving CAS deferred lane retained');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.controlled-local-mock-webdav-transport-final-rollup.validator.v1',
  lane: 'controlled-local-mock-webdav-transport',
  phase: 'final-rollup',
  evidence: rollupPath,
  verdict: 'CONTROLLED_LOCAL_MOCK_TRANSPORT_LANE_COMPLETE_REAL_TRANSPORT_BLOCKED',
  restartReloadCloseoutRespected: '942fdff6',
  duplicateReplayCloseoutRespected: '6c55a81b',
  firstApplyCloseoutRespected: 'c3fd4b57',
  approvalPredicateCloseoutRespected: '1d7a2daa',
  localMockLaneComplete: true,
  realTransportBlocked: true,
  relayEnqueueBlocked: true,
  chatSavingCasBlocked: true,
  fullBundleV3Started: false,
  productSyncReady: false,
  transportReady: false,
  cleanupAuthorityIntroduced: false,
  realTransportWriteAuthorizationIntroduced: false,
  recommendedNextLane: 'controlled-real-webdav-cloud-relay-transport-design-after-explicit-approval-or-readiness-gap-review',
}, null, 2));
console.log('PASS validate-controlled-local-mock-webdav-transport-final-rollup');
