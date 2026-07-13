#!/usr/bin/env node
// Immutable W3.5D-R2 authenticated 207 evidence validator.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const baseCommit = 'cab9bbecaf9612208af6ab33afe446407b7b58d3';
const evidencePath = 'release-evidence/2026-07-13/real-transport-w3-5d-r2-authenticated-read-only-propfind-207.md';
const validatorPath = 'tools/validation/sync/validate-real-transport-w3-5d-r2-authenticated-read-only-propfind-207.mjs';
const allowedPaths = [evidencePath, validatorPath].sort();
const runtimeStdoutSha256 = 'sha256:181e81594a1f31e27c413a17d40ae1475f648f2b18d68516ad4ccfbc6fbca4d6';
const lineage = {
  diagnostic: 'f8905a754d1ac6f3cfc8903b138aa3277706419d',
  parentPropfindFix: '305ff023ad12f14b6a9b505dab4123cf44c7cfba',
  r5aBindingFix: 'a0695eac1b3f11d7617a4a080c54d0b82663d478',
  defaultBinaryFix: '73d15ec5e46032512e49afb144b249ca4f211593',
};
const protectedRuntimePaths = [
  'apps/studio/desktop/src-tauri/build.rs',
  'apps/studio/desktop/src-tauri/src/bin/h2o-rt-write-grade-read-only-probe.rs',
  'apps/studio/desktop/src-tauri/src/lib.rs',
  'apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs',
  'src-surfaces-base/studio/sync/webdav-transport-setup-ui.tauri.js',
];

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: Object.hasOwn(options, 'encoding') ? options.encoding : 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  });
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function statusPaths() {
  const raw = git(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const entries = raw.split('\0').filter(Boolean);
  const paths = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const state = entry.slice(0, 2);
    assert.ok(!/[RC]/.test(state), 'renames/copies are outside the E6 candidate scope');
    paths.push(entry.slice(3));
  }
  return paths.sort();
}

for (const commit of [baseCommit, ...Object.values(lineage)]) {
  git(['cat-file', '-e', `${commit}^{commit}`], { stdio: 'ignore' });
  git(['merge-base', '--is-ancestor', commit, baseCommit], { stdio: 'ignore' });
}

const head = git(['rev-parse', 'HEAD']).trim();
const committedPaths = head === baseCommit
  ? []
  : git(['diff', '--name-only', `${baseCommit}..${head}`]).trim().split('\n').filter(Boolean).sort();
const workingPaths = statusPaths();
const candidatePaths = [...new Set([...committedPaths, ...workingPaths])].sort();
assert.deepEqual(candidatePaths, allowedPaths, 'E6 candidate must contain exactly the evidence and validator');

let mode = 'candidate';
let parentCommit = baseCommit;
if (head !== baseCommit) {
  mode = 'committed';
  parentCommit = git(['rev-parse', 'HEAD^']).trim();
  assert.equal(parentCommit, baseCommit, 'E6 must be a direct child of the fixed source commit');
  assert.deepEqual(committedPaths, allowedPaths, 'committed E6 path set');
  assert.deepEqual(workingPaths, [], 'committed E6 worktree and index must be clean');
}

for (const protectedPath of protectedRuntimePaths) {
  const current = fs.readFileSync(path.join(root, protectedPath));
  const baseline = git(['show', `${baseCommit}:${protectedPath}`], { encoding: null });
  assert.deepEqual(current, baseline, `runtime/UI source delta: ${protectedPath}`);
}
for (const changedPath of candidatePaths) {
  assert.ok(!changedPath.startsWith('apps/'), `application source path changed: ${changedPath}`);
  assert.ok(!changedPath.startsWith('src-surfaces-base/'), `UI/readiness path changed: ${changedPath}`);
  assert.ok(!changedPath.startsWith('src-runtime-base/'), `runtime path changed: ${changedPath}`);
}

const evidenceBytes = fs.readFileSync(path.join(root, evidencePath));
const evidence = evidenceBytes.toString('utf8');
const beginMarker = Buffer.from('<!-- exact-runtime-stdout-begin -->\n```json\n');
const endMarker = Buffer.from('```\n<!-- exact-runtime-stdout-end -->');
const begin = evidenceBytes.indexOf(beginMarker);
assert.ok(begin >= 0, 'missing exact runtime stdout begin marker');
const runtimeStart = begin + beginMarker.length;
const runtimeEnd = evidenceBytes.indexOf(endMarker, runtimeStart);
assert.ok(runtimeEnd > runtimeStart, 'missing exact runtime stdout end marker');
const runtimeBytes = evidenceBytes.subarray(runtimeStart, runtimeEnd);
assert.equal(runtimeBytes.length, 1396, 'exact runtime stdout byte length');
assert.equal(sha256(runtimeBytes), runtimeStdoutSha256, 'exact runtime stdout hash');
const runtime = JSON.parse(runtimeBytes.toString('utf8'));

assert.match(evidence, /capturedUtc: `2026-07-13T12:11:07Z`/);
assert.ok(Number.isFinite(Date.parse('2026-07-13T12:11:07Z')));
assert.ok(evidence.includes(`sourceRuntimeCommit: \`${baseCommit}\``));
assert.ok(evidence.includes(`runtimeStdoutSha256: \`${runtimeStdoutSha256}\``));
for (const commit of Object.values(lineage)) assert.ok(evidence.includes(commit));
for (const token of [
  'runtimeBuildGitShaMatchesSource:true',
  'classification: `write-grade-read-only-probe-passed`',
  'networkRequestCount:1',
  'receiptUsed:false',
  'tokenUsed:false',
  'cleanupPerformed:false',
  'R6 minting remains blocked',
]) assert.ok(evidence.includes(token), `missing evidence token: ${token}`);

const expectedTopLevelKeys = [
  'blockers', 'buildDirty', 'buildGitSha', 'buildProfile', 'command',
  'consumedMarkerCreated', 'credentialMaterialEquivalent', 'credentialMaterialPresent',
  'endpointMaterialEquivalent', 'likelyCause', 'methodStatuses', 'networkAttempted',
  'normalProbeRegistryPathSource', 'ok', 'parentPropfindFixPresent',
  'productSyncReady', 'r5aBindingFixPresent', 'rawPrivateFieldsLogged', 'reason',
  'receiptConsumed', 'registrySelectionEquivalent', 'remoteRootMaterialEquivalent',
  'schema', 'status', 'transportReady', 'writeGradeReadOnlyProbePassed',
  'writeGradeRegistryEligible', 'writeGradeRegistryPathSource', 'writesCas',
  'writesCloud', 'writesFiles', 'writesRelay', 'writesWebdav',
].sort();
assert.deepEqual(Object.keys(runtime).sort(), expectedTopLevelKeys, 'runtime stdout schema');
assert.equal(runtime.schema, 'h2o.studio.transport.write-grade-read-only-probe-result.v1');
assert.equal(runtime.command, 'h2o_rt_write_grade_read_only_probe');
assert.equal(runtime.buildGitSha, baseCommit);
assert.equal(runtime.buildProfile, 'debug');
assert.equal(runtime.buildDirty, false);
assert.equal(runtime.parentPropfindFixPresent, true);
assert.equal(runtime.r5aBindingFixPresent, true);
assert.equal(runtime.normalProbeRegistryPathSource, 'app-local');
assert.equal(runtime.writeGradeRegistryPathSource, 'app-local');
for (const field of [
  'registrySelectionEquivalent', 'endpointMaterialEquivalent',
  'remoteRootMaterialEquivalent', 'credentialMaterialEquivalent',
  'writeGradeRegistryEligible', 'credentialMaterialPresent', 'networkAttempted',
  'writeGradeReadOnlyProbePassed',
]) assert.equal(runtime[field], true, field);
assert.equal(runtime.ok, true);
assert.equal(runtime.status, 'real-transport-w3-write-grade-read-only-probe-passed');
assert.equal(runtime.reason, 'real-transport-w3-write-grade-read-only-propfind-207');
assert.deepEqual(runtime.blockers, []);
assert.equal(runtime.methodStatuses.length, 1, 'exactly one network method result');
assert.deepEqual(runtime.methodStatuses[0], {
  operation: 'PROPFIND write-grade parent readiness diagnostic',
  statusCode: 207,
  statusFamily: '2xx',
  loopbackOnly: false,
});
for (const field of [
  'receiptConsumed', 'consumedMarkerCreated', 'writesWebdav', 'writesCloud',
  'writesRelay', 'writesCas', 'writesFiles', 'productSyncReady',
  'transportReady', 'rawPrivateFieldsLogged',
]) assert.equal(runtime[field], false, field);

const methodRows = [...evidence.matchAll(/^\| (PROPFIND|OPTIONS|PUT|GET|DELETE|other) \| (\d+) \| ([^|]+) \| ([^|]+) \|$/gm)];
assert.equal(methodRows.length, 6, 'complete request-count table');
const methodCounts = Object.fromEntries(methodRows.map((row) => [row[1], Number(row[2])]));
assert.deepEqual(methodCounts, { PROPFIND: 1, OPTIONS: 0, PUT: 0, GET: 0, DELETE: 0, other: 0 });
assert.ok(methodRows.some((row) => row[1] === 'PROPFIND' && row[3].trim() === '207' && row[4].trim() === '2xx'));

for (const [pattern, label] of [
  [/https?:\/\//i, 'raw endpoint URL'],
  [/\/(?:Users|private|var\/folders)\//, 'private filesystem path'],
  [/\b(?:Basic|Bearer)\s+[A-Za-z0-9+/=_-]+/i, 'authorization material'],
  [/endpointUrlPrivate|remoteRootPathPrivate|authHeaderPrivate/i, 'private registry field'],
  [/\b(?:username|password|oneShotToken|killSwitchToken)\s*[:=]/i, 'private identity/token field'],
  [/privateRegistryContents|responseBody|remoteListing/i, 'private response/registry field'],
  [/\.h2o-w3-sacrificial-probe/i, 'raw deterministic object path'],
]) assert.equal(pattern.test(evidence), false, `evidence contains ${label}`);

const rustPath = 'apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs';
const binPath = 'apps/studio/desktop/src-tauri/src/bin/h2o-rt-write-grade-read-only-probe.rs';
const rust = fs.readFileSync(path.join(root, rustPath), 'utf8');
const bin = fs.readFileSync(path.join(root, binPath), 'utf8');
assert.ok(bin.includes('h2o_rt_write_grade_read_only_probe()'));
assert.ok(!bin.includes('h2o_rt_first_write'));
const diagnosticBlock = rust.slice(
  rust.indexOf('fn evaluate_write_grade_read_only_probe_with_client'),
  rust.indexOf('fn first_write_consumed_marker_path'),
);
assert.ok(diagnosticBlock.includes('client.propfind_parent_readiness(&parity.target)'));
for (const forbidden of [
  'write_first_write_apply_intent_marker', 'validate_write_grade_receipt',
  'put_create_first', 'put_create_second', 'get_readback', 'one_shot_token',
  'kill_switch_token',
]) assert.ok(!diagnosticBlock.includes(forbidden), `diagnostic contains ${forbidden}`);

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w3-5d-r2-authenticated-read-only-propfind-207',
  mode,
  head,
  parentCommit,
  candidatePaths,
  evidencePath,
  evidenceSha256: sha256(evidenceBytes),
  runtimeStdoutSha256,
  runtimeBuildGitSha: runtime.buildGitSha,
  methodCounts,
  propfindStatusCode: 207,
  classification: 'write-grade-read-only-probe-passed',
  writesWebDAV: false,
  productSyncReady: false,
  transportReady: false,
  protectedRuntimePathsUnchanged: true,
}, null, 2));
