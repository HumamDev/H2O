#!/usr/bin/env node
//
// W1c real Desktop Studio webview proof validator.
//
// Validates the manual DevTools proof recorded for the loaded Desktop Studio
// runtime after W1b loader registration. This validator only reads evidence
// and asserts the recorded W1 console chain proof and non-activation
// boundaries.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-05/real-transport-w1c-webview-proof.md';

function read(rel) {
  const abs = path.join(root, rel);
  assert.ok(fs.existsSync(abs), `missing ${rel}`);
  return fs.readFileSync(abs, 'utf8');
}

function compact(value) {
  return String(value).replace(/\s+/g, ' ');
}

function assertIncludes(source, token, label) {
  assert.ok(String(source).includes(token), `${label}: missing ${token}`);
}

function assertNotIncludes(source, token, label) {
  assert.ok(!String(source).includes(token), `${label}: forbidden ${token}`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);

// Anchors.
for (const token of [
  'W1c Desktop Studio webview proof PASS',
  '6cb1c6ba59fcb1ecb296cb996d6c8f981d0b886b',
  '826c4153ba944bda7c59910a35705e160d167159',
  'ba5844f7637c84136a505b3025838c755b8081af',
  'f93350d4a8e83bf49a00e0061f98f5c52454e74d',
  '34356fa6a4d6fa7550de18a1605cc131d2240c9c',
  'a477752896cf3747b0292d619a0eef9a120bc0a3',
  '10e1ee6c740449f2f5b804f4ed73b23c812caacf',
]) {
  assertIncludes(evidence, token, `anchor ${token}`);
}

// Manual runtime proof method.
for (const token of [
  'The primary proof was collected from the loaded Desktop Studio runtime',
  'Automated Node/CDP access to the local DevTools endpoint was sandbox-blocked',
  'EPERM',
  'manual DevTools console proof',
  'secondary corroboration only',
  '2026-07-05T18:37:28.243Z',
  'H2O.Studio.sync.realTransportConsole.diagnose()',
  'H2O.Studio.sync.realTransportConsole.runChainedDryRun(request)',
]) {
  assertIncludes(flat, token, `runtime proof token ${token}`);
}

// Exact manual proof result fields.
for (const token of [
  '"proofName": "W1c real Studio webview W1 console proof"',
  '"timestamp": "2026-07-05T18:38:26.060Z"',
  '"diagnoseOk": true',
  '"validDryRunOk": true',
  '"failClosedOk": true',
  '"zeroWriteOk": true',
  '"readinessOk": true',
  '"rawMarkersNotEchoed": true',
  '"finalVerdict": "PASS"',
  '"apiAvailable": true',
  '"missingSubstrates": []',
  '"status": "real-transport-console-chained-dry-run-ready"',
  '"dryRunSubstrateStatus": "real-webdav-cloud-relay-transport-dry-run-ready"',
  '"failures": []',
]) {
  assertIncludes(evidence, token, `manual proof field ${token}`);
}

// Substrate fan-out keys.
for (const token of [
  '"b1"',
  '"b2"',
  '"b3"',
  '"b4"',
  '"b5"',
  '"b6"',
  '"b8"',
  '"b7"',
  '"dryRun"',
]) {
  assertIncludes(evidence, token, `substrate key ${token}`);
}

// Fail-closed cases.
for (const token of [
  '"wrongGate"',
  '"applyTrue"',
  '"missingB8"',
  '"localMockApproval"',
  '"transportReadyTrue"',
  '"rawEndpoint"',
  '"casInput"',
  'dryRun:real-transport-dry-run-gate-required',
  'dryRun:real-transport-dry-run-apply-blocked',
  '"echoed": false',
]) {
  assertIncludes(evidence, token, `fail-closed token ${token}`);
}

// Boundary claims.
for (const token of [
  'no real WebDAV/cloud/relay/CAS/file write',
  'no relay enqueue',
  'no outbox/ledger/store mutation',
  'no fullBundle.v3 start/mint',
  'no export id mint',
  'no sequence burn',
  'productSyncReady:false',
  'transportReady:false',
  'no cleanup authority',
  'no a950 mutation',
]) {
  assertIncludes(flat, token, `boundary token ${token}`);
}

for (const forbidden of [
  'real transport write occurred',
  'relay enqueue occurred',
  'outbox row was created',
  'ledger row was created',
  'durable store was created',
  'fullBundle.v3 was started',
  'export id was minted',
  'sequence was burned',
  'productSyncReady:true',
  'transportReady:true',
  'a950 was mutated',
]) {
  assertNotIncludes(flat, forbidden, `forbidden claim ${forbidden}`);
}

console.log('[real-transport-w1c] webview proof validator passed');
