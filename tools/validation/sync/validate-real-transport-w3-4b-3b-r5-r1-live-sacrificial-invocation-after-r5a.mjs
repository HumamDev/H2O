#!/usr/bin/env node
// W3.4b-3B-R5-R1 post-R5A live invocation evidence validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-12/real-transport-w3-4b-3b-r5-r1-live-sacrificial-invocation-after-r5a.md';
const evidence = fs.readFileSync(path.join(root, evidencePath), 'utf8');
const flat = evidence.replace(/\s+/g, ' ');

const anchors = [
  '714f80a458808550dc8fd59ee937837349f416da',
  '305ff023ad12f14b6a9b505dab4123cf44c7cfba',
  'ad569f70f33c5610649e7da381045b08b6e32cd7',
  'c3d4d1160cc63c8514dcd6877e9c81e20f1dca2b',
  '6f069450c302d251a225cdba16bc305ab61a0936',
  'a0695eac1b3f11d7617a4a080c54d0b82663d478',
  '3048ab2dba3f4cbff4ec199dbb36093975659b52',
];

for (const commit of anchors) {
  assert.ok(flat.includes(commit), `missing commit anchor ${commit}`);
}

for (const token of [
  'I approve W3.4b-3B-R5 retry live sacrificial invocation after R5A binding fix.',
  'sha256:b27b6eb6ed238c15d9b687a85d2d8b98e9db4434a7c6b1d30df26e96aaddca57',
  'sha256:67b110e21148b315e5fef1acfb1c2ff39d9acc204ce47578b138a7df33af6829',
  'registryPathSource: `app-local`',
  'writeGradeRegistryEligible:true',
  'credentialMaterialPresent:true',
  'createOnlyPutMax:2',
  'readbackGetMax:1',
  'otherMethods:0',
  'h2oRtFirstWriteInvokeCount:1',
  'consumedMarkerCreated:true',
  'receiptConsumed:true',
  'receiptInvoked:true',
  'tokenBurnOccurred:true',
  'networkAttempted:true',
  'methodsAttempted: `PROPFIND`',
  'propfindAttemptCount:1',
  'putAttemptCount:0',
  'getAttemptCount:0',
  'deterministicObjectTargetClassCount:1',
  'createOnlyBehavior: `not-attempted`',
  'readBackHashMatch: `not-attempted`',
  'primaryBlocker: `real-transport-w3-first-write-auth-refused`',
  'finalClassification: `fail-closed-consumed-invoked-no-write-pre-write-parent-propfind-401`',
  'writesWebDAV:false',
  'deleteAttempted:false',
  'cleanupPerformed:false',
  'productSyncReady:false',
  'transportReady:false',
  'retryAuthorized:false',
]) {
  assert.ok(flat.includes(token), `missing evidence token ${token}`);
}

const methodRows = [...evidence.matchAll(/^\| (PROPFIND|PUT|GET)[^|]*\| (true|false) \| ([^|]+) \| ([^|]+) \|$/gm)];
assert.equal(methodRows.length, 4, 'method table must contain exactly four approved operation rows');
assert.equal(methodRows.filter((row) => row[1] === 'PROPFIND' && row[2] === 'true').length, 1);
assert.equal(methodRows.filter((row) => row[1] === 'PUT' && row[2] === 'true').length, 0);
assert.equal(methodRows.filter((row) => row[1] === 'GET' && row[2] === 'true').length, 0);
assert.ok(methodRows.some((row) => row[1] === 'PROPFIND' && row[3].trim() === '401' && row[4].trim() === '4xx'));

for (const token of [
  'writesWebDAV:true',
  'deleteAttempted:true',
  'cleanupPerformed:true',
  'productSyncReady:true',
  'transportReady:true',
  'retryAuthorized:true',
]) {
  assert.ok(!flat.includes(token), `forbidden evidence claim ${token}`);
}

for (const forbiddenMethod of ['DELETE', 'MKCOL', 'PROPPATCH', 'MOVE', 'COPY', 'LOCK', 'UNLOCK', 'POST']) {
  const attemptedPattern = new RegExp(`${forbiddenMethod}[^\\n|]*(true|[1-5]\\d\\d)`, 'i');
  assert.ok(!attemptedPattern.test(evidence), `forbidden method appears attempted: ${forbiddenMethod}`);
}

for (const [pattern, label] of [
  [/https?:\/\//i, 'raw endpoint URL'],
  [/\boneShotToken\s*[:=]/i, 'raw one-shot token key'],
  [/\bkillSwitchToken\s*[:=]/i, 'raw kill-switch token key'],
  [/\bpassword\s*[:=]/i, 'raw password key'],
  [/\bcredentialSecret\s*[:=]/i, 'raw credential secret key'],
  [/\bauthorization\s*[:=]/i, 'authorization header'],
  [/\brawPath\s*[:=]/i, 'raw object path'],
  [/\bresponseBody\s*[:=]/i, 'response body'],
  [/\bprivateRegistryContents\s*[:=]/i, 'private registry contents'],
  [/-----BEGIN/i, 'token-like PEM block'],
]) {
  assert.ok(!pattern.test(evidence), `evidence contains ${label}`);
}

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w3-4b-3b-r5-r1-live-sacrificial-invocation-after-r5a',
  evidencePath,
  invocationResult: 'fail-closed',
  receiptCoreHash: 'sha256:b27b6eb6ed238c15d9b687a85d2d8b98e9db4434a7c6b1d30df26e96aaddca57',
  methodStatuses: [{ method: 'PROPFIND', statusCode: 401, statusFamily: '4xx' }],
  networkAttempted: true,
  writesWebDAV: false,
  createOnlyBehavior: 'not-attempted',
  readBackHashMatch: 'not-attempted',
  receiptConsumed: true,
  receiptInvoked: true,
  consumedMarkerCreated: true,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
