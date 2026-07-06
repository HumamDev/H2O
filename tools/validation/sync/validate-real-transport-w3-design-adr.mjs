#!/usr/bin/env node
//
// W3 real transport design ADR validator.
//
// Validates design-only W3 ADR evidence and proves no protected source,
// loader, capability, or transport files are modified by this slice.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-06/real-transport-w3-design-adr.md';
const receiptHash = 'sha256:a763ab0c20754b035b600df4c9e1be0bbbc938c61baa7852002e162f8e5d9b65';

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

function gitClean(rel) {
  const unstaged = execFileSync('git', ['diff', '--name-only', '--', rel], { cwd: root, encoding: 'utf8' }).trim();
  const staged = execFileSync('git', ['diff', '--cached', '--name-only', '--', rel], { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(unstaged, '', `${rel}: unstaged changes present`);
  assert.equal(staged, '', `${rel}: staged changes present`);
}

function realTransportModules() {
  const dir = path.join(root, 'src-surfaces-base/studio/sync');
  return fs.readdirSync(dir)
    .filter((name) => /^real-transport-.*\.js$/.test(name))
    .sort()
    .map((name) => `src-surfaces-base/studio/sync/${name}`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);

for (const token of [
  '678c7b95a188c9faa3133316e06a5196bf7c988e',
  '7e431b16c9f0665514eecd31dd0e0273972daed6',
  '079369002da07c80c5553cd064064960ba58ebab',
  'e3217aac1af7fe2e1d46fe86ea0025f197565d80',
  'b08bb910791bdfd89c8a823da8987154787fd0d2',
  'eebbb8745d5bf1dba3ec145009c1ba6ae5bac1a5',
  '6cb1c6ba59fcb1ecb296cb996d6c8f981d0b886b',
  '826c4153ba944bda7c59910a35705e160d167159',
  '10e1ee6c740449f2f5b804f4ed73b23c812caacf',
  'a477752896cf3747b0292d619a0eef9a120bc0a3',
  '34356fa6a4d6fa7550de18a1605cc131d2240c9c',
]) {
  assertIncludes(evidence, token, `anchor ${token}`);
}

for (const token of [
  'W3.0 DESIGN / ADR ACCEPTED AS DESIGN-ONLY',
  'W3-F1 classification',
  receiptHash,
  '2099-07-06T00:00:00.000Z',
  'fixture-grade / mock-grade only',
  'must never authorize W3.4 or W3.5 real writes',
  'Write-grade receipts require `expiryUtc <= 7 days from mint`',
  'executor-enforced maximum receipt age',
]) {
  assertIncludes(flat, token, `W3-F1 token ${token}`);
}

for (const token of [
  'W3.0: design / ADR acceptance only',
  'W3.1: Rust read-only capability probe',
  'W3.2: mock-proven executor against local-mock WebDAV / loopback harness',
  'W3.3: gate-refused write command plus loopback tests',
  'W3.4: sacrificial probe-object write',
  'W3.5: separately-approved first payload write',
]) {
  assertIncludes(evidence, token, `phase split ${token}`);
}

for (const token of [
  '## ADR-RT-1 Byte-Egress Decision',
  '`h2o_rt_capability_probe`',
  '`h2o_rt_first_write`',
  'reqwest + rustls',
  'Redirects are refused',
  'existing CSP remains unchanged',
  'must not use `tauri-plugin-http`',
  'webview fetch for remote transport',
  'local helper process',
  'egress-audit assertions',
  '`shell:allow-open`',
  '## ADR-RT-2 Credential-Resolution Decision',
  '`credentialRefHash` is the sha256 of a non-sensitive keychain descriptor',
  'never the hash of the credential material itself',
  'Credential resolution is Rust-only',
  'zeroize credential material',
  'closed IPC response schema',
  '## Read-Only Probe Spec',
  '`OPTIONS`',
  '`PROPFIND Depth 0`',
  '`PROPFIND Depth 1`',
  '`HEAD` root',
  '`GET` root',
  '`HEAD` deterministic nonexistent child',
  '`PUT`',
  '`DELETE`',
  '`MKCOL`',
  '`PROPPATCH`',
  '`MOVE`',
  '`COPY`',
  '`LOCK`',
  '`UNLOCK`',
  '`POST`',
  'redacted probe receipt',
  '`createOnlyBehavior`, `etagBehavior`, and `ifNoneMatchBehavior` remain unknown',
  '## Executor Contract',
  'The W2 receipt hash is necessary but not sufficient',
  'recompute the committed receiptCore',
  'fresh countersignature',
  'fresh one-shot token',
  'fresh kill-switch token',
  'remote capability receipt',
  'field-by-field payload, target, scope, and approval binding',
  'reject top-hash-only trust',
  '## One-Shot Token Design',
  'minted by the operator outside the system',
  'raw token stays outside the repo',
  'only the token hash',
  'consumes the token before any remote attempt',
  'durable unique `tokenHash` / idempotency record',
  'failed or uncertain attempt burns the token',
  '## Durable Ordering Model',
  'Gates verified',
  'Idempotency apply-intent / token-consumption record created',
  'Outbox row queued / dispatching',
  'Remote create-only `PUT`',
  'Read-back `GET`',
  'Hash verification',
  'Idempotency remote-write-observed',
  'Publication ledger plus sequence burn plus export-id commit',
  'Outbox completed',
  '## Failure / Recovery Table',
  '`PUT` ok / read-back fails',
  'read-back ok / ledger fails',
  '`PUT` timeout',
  'checksum mismatch',
  'retry after uncertain write',
  'no blind retry',
  '## Attack / Refusal Matrix',
]) {
  assertIncludes(flat, token, `design token ${token}`);
}

for (const token of [
  'valid W2 receipt but missing token',
  'changed payload',
  'changed target',
  'stale token',
  'reused token',
  'wrong credential ref',
  'local mock approval substitution',
  'fullBundle.v3 smuggling',
  'CAS write smuggling',
  'a950 mutation attempt',
  'productSyncReady/transportReady coercion',
  'retry after uncertain write',
  'second write attempt',
  'boot resume dispatch',
  'shell-open exfiltration path',
]) {
  assertIncludes(flat, token, `attack/refusal ${token}`);
}

for (const token of [
  'no real write in this slice',
  'no automatic sync',
  'no productSyncReady:true',
  'no transportReady:true',
  'no global realWebDAVTransportAvailable:true',
  'no fullBundle.v3',
  'no Chat Saving CAS',
  'no a950 cleanup',
  'local mock approval never substitutes',
  'W2 receipt alone never authorizes',
  'no hidden ambient authority',
  'no blind retry after uncertain remote write',
  'no WebDAV/cloud/relay/CAS/file write',
  'no relay enqueue',
  'no outbox/ledger/store mutation',
  'no fullBundle.v3 start/mint',
  'no token/export id mint',
  'no sequence burn',
  'productSyncReady:false',
  'transportReady:false',
  'realWebDAVTransportAvailable:false',
  'W3 remains blocked pending operator ADR acceptance evidence',
]) {
  assertIncludes(flat, token, `boundary ${token}`);
}

for (const forbidden of [
  'real write is now authorized',
  'transport is now available',
  'write command is enabled',
  'productSyncReady is true',
  'transportReady is true',
]) {
  assertNotIncludes(flat, forbidden, `forbidden claim ${forbidden}`);
}

for (const [pattern, label] of [
  [/https?:\/\//i, 'raw URL literal'],
  [/\bpassword\s*[:=]/i, 'password value literal'],
  [/\bsecret\s*[:=]/i, 'secret value literal'],
  [/\bcredentialValue\s*[:=]/i, 'credential value literal'],
  [/\brawCredential\s*[:=]/i, 'raw credential value literal'],
  [/\brawEndpoint\s*[:=]/i, 'raw endpoint value literal'],
  [/\brawRemotePath\s*[:=]/i, 'raw remote path value literal'],
  [/\bpayloadBody\s*[:=]/i, 'payload body value literal'],
  [/\bcasKey\s*[:=]/i, 'CAS key value literal'],
]) {
  assert.ok(!pattern.test(evidence), `${label} found`);
}

for (const rel of [
  'Cargo.toml',
  'apps/studio/desktop/src-tauri/tauri.conf.json',
  'apps/studio/desktop/src-tauri/capabilities/default.json',
  'src-surfaces-base/studio/studio.html',
  'tools/product/studio/pack-studio.mjs',
  'src-surfaces-base/studio/sync/webdav-transport-gates.js',
  ...realTransportModules(),
]) {
  gitClean(rel);
}

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w3-design-adr',
  designOnly: true,
  receiptClassification: 'fixture-grade/mock-grade-only',
  receiptHash,
  expiryUtc: '2099-07-06T00:00:00.000Z',
  w3Phases: ['W3.0', 'W3.1', 'W3.2', 'W3.3', 'W3.4', 'W3.5'],
  realTransportWrite: false,
  productSyncReady: false,
  transportReady: false,
  w3Blocked: true,
}, null, 2));
