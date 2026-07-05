#!/usr/bin/env node
//
// Real-transport B1-B8 implementation-readiness rollup / handoff manifest validator.
//
// Proves the rollup: it respects the B6 (53792911), B5 (e60e00f0), B4 (0b6ed75e), B3 (e1618571), B2 (09bf7701), B1
// (b2e10531), and B8+B7 (26e6241b) designs and the gap review (d2bea4c0); B1-B8 are design-specified only; no B1-B6
// implementation is introduced; no real transport authorization is introduced; productSyncReady:false and
// transportReady:false remain; fullBundle.v3 remains deferred/not-started; Chat Saving CAS remains blocked/deferred;
// no raw endpoint/credential/path/payload value appears; and no cleanup/a950 mutation authority is introduced. It
// confirms the source is unmutated and cross-checks each B1-B8 design closeout. Evidence/validator-only; no product
// source changed.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const rollupPath = 'release-evidence/2026-07-01/real-transport-b1-b8-implementation-readiness-rollup.md';
const gapReviewPath = 'release-evidence/2026-07-01/real-webdav-cloud-relay-transport-readiness-gap-review.md';
const finalRollupPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-final-rollup.md';
const designPaths = {
  B1: 'release-evidence/2026-07-01/real-transport-b1-target-config-credentials-peer-identity-design.md',
  B2: 'release-evidence/2026-07-01/real-transport-b2-kill-switch-lifecycle-design.md',
  B3: 'release-evidence/2026-07-01/real-transport-b3-durable-idempotency-store-design.md',
  B4: 'release-evidence/2026-07-01/real-transport-b4-enqueue-outbox-boundary-design.md',
  B5: 'release-evidence/2026-07-01/real-transport-b5-conflict-partial-write-handling-design.md',
  B6: 'release-evidence/2026-07-01/real-transport-b6-sequence-export-id-semantics-design.md',
  B7B8: 'release-evidence/2026-07-01/real-transport-approval-contract-and-readiness-policy-design.md',
};
const transportGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const relayOutboxPath = 'src-surfaces-base/studio/sync/relay-outbox.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const chatSavingBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

function read(rel) { const abs = path.join(root, rel); assert.ok(fs.existsSync(abs), `missing ${rel}`); return fs.readFileSync(abs, 'utf8'); }
function compact(v) { return String(v).replace(/\s+/g, ' '); }
function assertIncludes(src, tok, label) { assert.ok(String(src).includes(tok), `${label}: missing ${tok}`); }
function assertNotIncludes(src, tok, label) { assert.ok(!String(src).includes(tok), `${label}: forbidden ${tok}`); }

const rollup = read(rollupPath);
const flat = compact(rollup);
const transportGates = read(transportGatesPath);
const relayOutbox = read(relayOutboxPath);
const folderSync = read(folderSyncPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

// ---------------------------------------------------------------------------
// (1) Rollup content anchors: verdict, commit chain, the 5 sections, gated order, do-not-reopen.
// ---------------------------------------------------------------------------
for (const token of [
  'ALL EIGHT REAL-TRANSPORT GAP-REVIEW BLOCKERS (B1-B8) ARE DESIGN-SPECIFIED',
  'DESIGN-SPECIFIED IS NOT IMPLEMENTED AND NOT TRANSPORT AUTHORIZATION',
  'IT IMPLEMENTS NO REAL TRANSPORT AND AUTHORIZES NO\nREAL WRITE, NO FLIP, AND NO CLEANUP'.replace(/\n\s*/g, ' '),
  // commit chain
  'd2bea4c0', '26e6241b', 'b2e10531', '09bf7701', 'e1618571', '0b6ed75e', 'e60e00f0', '53792911', '15a33852',
  // 1. complete
  '## 1. What Is Complete (design-specified)',
  '**B1** target config / credentials / peer identity design - `b2e10531`',
  '**B6** sequence / export-id semantics design - `53792911`',
  '**B8** real approval contract design - `26e6241b`',
  // 2. not implemented
  '## 2. What Remains Not Implemented',
  'real WebDAV/cloud/relay writes',
  '`transportReady` flip (B7)',
  'real approval acceptance (B8)',
  // 3. preserved boundaries
  '## 3. Preserved Boundaries',
  'the `fullBundle.v2` envelope remains selected',
  '`fullBundle.v3` remains deferred',
  'Chat Saving CAS remains SEPARATE',
  '`localExportableSyncReady` is NOT transport authorization',
  // 4. gated order
  '## 4. Exact Gated Order to a First Controlled Real Write',
  '**implementation-readiness rollup** (this manifest) - confirms B1-B8 designed; authorizes nothing',
  '**B8 real approval acceptance implementation**',
  '**B7 readiness evaluation / flip slice**',
  '**real transport dry-run only**',
  '**first controlled real write only after explicit approval**',
  'No step may be skipped or reordered',
  // 5. do-not-reopen
  '## 5. Do-Not-Reopen List',
  'Do NOT reopen Operational.5 cleanup/parity',
  'Do NOT clean `row:a950a44b859f` without NEW strict evidence',
  'Do NOT treat the local mock apply as real WebDAV transport',
  'Do NOT start Chat Saving CAS from this lane',
  'Do NOT reintroduce `fullBundle.v3`',
  // recommended first impl + start-now
  '## Recommended First Implementation Lane',
  '**B1 implementation - real target config + credentials + peer identity**',
  '## Can Real Transport Start Now?',
]) {
  assertIncludes(flat, token, `rollup token ${token}`);
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
  assertNotIncludes(flat, forbidden, `rollup must not claim: ${forbidden}`);
}

// ---------------------------------------------------------------------------
// (2) NO raw endpoint / credential / path / payload-body values anywhere in the rollup.
// ---------------------------------------------------------------------------
assert.doesNotMatch(rollup, /https?:\/\//i, 'rollup must contain no raw endpoint URL');
assert.doesNotMatch(rollup, /\b(?:ftp|webdav|dav|smb|s3):\/\//i, 'rollup must contain no raw remote scheme URL');
assert.doesNotMatch(rollup, /\b(?:password|passwd|secret|apikey|api_key|access[_-]?key|token)\s*[:=]\s*\S/i,
  'rollup must contain no raw credential assignment');
assert.doesNotMatch(rollup, /\bBearer\s+[A-Za-z0-9._-]{6,}|\bBasic\s+[A-Za-z0-9+/=]{6,}/,
  'rollup must contain no raw auth header value');

// ---------------------------------------------------------------------------
// (3) Cross-check every B1-B8 design closeout + the gap review + local mock rollup.
// ---------------------------------------------------------------------------
const designVerdicts = {
  B1: 'B1 REAL WEBDAV/CLOUD/RELAY TARGET CONFIG + CREDENTIAL HANDLING + PEER IDENTITY IS DESIGNED',
  B2: 'B2 REAL CONTROLLED-WRITE KILL-SWITCH LIFECYCLE IS DESIGNED',
  B3: 'B3 DURABLE REAL-TRANSPORT IDEMPOTENCY STORE IS DESIGNED',
  B4: 'B4 REAL ENQUEUE / OUTBOX / PUBLICATION-LEDGER BOUNDARY IS DESIGNED',
  B5: 'B5 REAL CONFLICT / PARTIAL-WRITE HANDLING IS DESIGNED',
  B6: 'B6 REAL SEQUENCE / EXPORT-ID SEMANTICS IS DESIGNED',
  B7B8: 'B8 REAL-TRANSPORT APPROVAL CONTRACT AND B7 `transportReady` POLICY ARE DESIGNED',
};
for (const [key, evPath] of Object.entries(designPaths)) {
  assertIncludes(read(evPath), designVerdicts[key], `${key} design closeout respected`);
}
assertIncludes(read(gapReviewPath), 'REAL WEBDAV/CLOUD/RELAY TRANSPORT CANNOT START NOW', 'gap review respected');
assertIncludes(read(finalRollupPath), 'THE CONTROLLED LOCAL MOCK WEBDAV TRANSPORT LANE IS COMPLETE AND AT A STABLE HANDOFF POINT',
  'controlled local mock final rollup respected');

// ---------------------------------------------------------------------------
// (4) DESIGN-ONLY: no B1-B6 implementation codes in source; source invariants unmutated.
// ---------------------------------------------------------------------------
for (const banned of ['real-transport-b1-', 'real-transport-b2-', 'real-transport-b3-', 'real-transport-b4-',
  'real-transport-b5-', 'real-transport-b6-', 'real-transport-idempotency', 'exportIdRefHash', 'killSwitchEnableTokenHash']) {
  assertNotIncludes(transportGates, banned, `B1-B6 implementation must not be in source (${banned})`);
  assertNotIncludes(relayOutbox, banned, `B1-B6 implementation must not be in the relay outbox (${banned})`);
}
for (const token of [
  'realTransportApprovalAccepted: false',
  'realWebDAVTransportAvailable: false',
  'transportReady: false',
  'realWebDAVWrite: false',
]) {
  assertIncludes(transportGates, token, `source invariant ${token}`);
}
assert.ok(!transportGates.includes('realTransportApprovalAccepted: true'), 'source must not accept real transport approval');
assert.ok(!transportGates.includes('realWebDAVTransportAvailable: true'), 'source must not make real WebDAV available');
assert.ok(!transportGates.includes('productSyncReady: true') && !transportGates.includes('productSyncReady = true'),
  'source must not flip productSyncReady true');
assert.doesNotMatch(`${transportGates}\n${folderSync}`, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'no fullBundle.v3 in source');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(chatSavingBoundary, 'deferred encrypted', 'Chat Saving CAS deferred lane retained');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.real-transport-b1-b8-implementation-readiness-rollup.validator.v1',
  lane: 'real-webdav-cloud-relay-transport',
  phase: 'b1-b8-implementation-readiness-rollup',
  evidence: rollupPath,
  verdict: 'REAL_TRANSPORT_DESIGN_PHASE_COMPLETE_ALL_B1_B8_DESIGN_SPECIFIED_STILL_BLOCKED',
  designsRespected: {
    B1: 'b2e10531', B2: '09bf7701', B3: 'e1618571', B4: '0b6ed75e',
    B5: 'e60e00f0', B6: '53792911', B7B8: '26e6241b', gapReview: 'd2bea4c0',
  },
  allB1B8DesignSpecified: true,
  b1b6ImplementationIntroduced: false,
  realTransportAuthorizationIntroduced: false,
  rawEndpointCredentialPathPayloadPresent: false,
  realTransportApprovalAccepted: false,
  transportReady: false,
  productSyncReady: false,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
  cleanupAuthorityIntroduced: false,
  recommendedFirstImplementationLane: 'B1-real-target-config-credentials-peer-identity-implementation-after-explicit-go-ahead',
}, null, 2));
console.log('PASS validate-real-transport-b1-b8-implementation-readiness-rollup');
