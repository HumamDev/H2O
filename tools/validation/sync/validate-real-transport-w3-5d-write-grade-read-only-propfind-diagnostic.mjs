#!/usr/bin/env node
// W3.5D write-grade executor-path read-only PROPFIND diagnostic validator.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-12/real-transport-w3-5d-write-grade-read-only-propfind-diagnostic.md';
const rustPath = 'apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs';
const buildPath = 'apps/studio/desktop/src-tauri/build.rs';
const binPath = 'apps/studio/desktop/src-tauri/src/bin/h2o-rt-write-grade-read-only-probe.rs';

const commits = {
  w31Alignment: '70e7fcc9669b939b505de96a7bb0ec61509c3370',
  w31Closeout: '7862270237955b86d48d943263fd53947cc71f72',
  w35b: '305ff023ad12f14b6a9b505dab4123cf44c7cfba',
  r5a: 'a0695eac1b3f11d7617a4a080c54d0b82663d478',
  consumedR5: 'd31fb2f9fd1ca80202da18f6240177cb1653ca4d',
  implementation: 'f8905a754d1ac6f3cfc8903b138aa3277706419d',
};

function read(rel) {
  const abs = path.join(root, rel);
  assert.ok(fs.existsSync(abs), `missing ${rel}`);
  return fs.readFileSync(abs, 'utf8');
}

function compact(value) {
  return String(value).replace(/\s+/g, ' ');
}

for (const [label, commit] of Object.entries(commits)) {
  execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], { cwd: root, stdio: 'ignore' });
  assert.equal(commit.length, 40, `${label} commit length`);
}

const evidence = read(evidencePath);
const rust = read(rustPath);
const build = read(buildPath);
const bin = read(binPath);
const flat = compact(evidence);

for (const commit of Object.values(commits)) {
  assert.ok(flat.includes(commit), `evidence missing commit ${commit}`);
}

for (const token of [
  `buildGitSha: \`${commits.implementation}\``,
  'implementationCommitMatchesRuntime:true',
  'buildProfile: `debug`',
  'buildDirty:false',
  'parentPropfindFixPresent:true',
  'r5aBindingFixPresent:true',
  'cleanWorktreeBuild:true',
  'temporaryCleanWorktreeRemoved:true',
  'normalProbeRegistryPathSource: `app-local`',
  'writeGradeRegistryPathSource: `app-local`',
  'legacyRegistryUsedByDiagnostic:false',
  'registrySelectionEquivalent:true',
  'endpointMaterialEquivalent:true',
  'remoteRootMaterialEquivalent:true',
  'credentialMaterialEquivalent:true',
  'writeGradeRegistryEligible:true',
  'credentialMaterialPresent:true',
  'networkAttempted:true',
  'writeGradeReadOnlyProbePassed:false',
  'likelyCause: `app-local-credential-or-registry-material`',
  'receiptAcceptedByDiagnostic:false',
  'tokenAcceptedByDiagnostic:false',
  'receiptConsumed:false',
  'consumedMarkerCreated:false',
  'writesWebDAV:false',
  'productSyncReady:false',
  'transportReady:false',
  'write-grade-read-only-propfind-401-app-local-credential-or-registry-material',
]) {
  assert.ok(flat.includes(token), `evidence missing ${token}`);
}

const methodRows = [...evidence.matchAll(/^\| (PROPFIND|OPTIONS|PUT|GET|DELETE|other) \| (\d+) \| ([^|]+) \| ([^|]+) \|$/gm)];
assert.equal(methodRows.length, 6, 'expected complete method budget table');
const methodCounts = Object.fromEntries(methodRows.map((row) => [row[1], Number(row[2])]));
assert.deepEqual(methodCounts, { PROPFIND: 1, OPTIONS: 0, PUT: 0, GET: 0, DELETE: 0, other: 0 });
assert.ok(methodRows.some((row) => row[1] === 'PROPFIND' && row[3].trim() === '401' && row[4].trim() === '4xx'));

for (const token of [
  'receiptConsumed:true',
  'consumedMarkerCreated:true',
  'writesWebDAV:true',
  'productSyncReady:true',
  'transportReady:true',
  'legacyRegistryUsedByDiagnostic:true',
]) {
  assert.ok(!flat.includes(token), `forbidden evidence claim ${token}`);
}

for (const token of [
  'pub fn h2o_rt_write_grade_read_only_probe()',
  'resolve_write_grade_live_registry("h2o_rt_write_grade_read_only_probe")',
  'descriptor_registry_path_for_probe(&RtCapabilityProbeRequest',
  'WriteGradeReadOnlyPropfindClient',
  'propfind_parent_readiness',
  'build_parent_collection_url',
  'FirstWriteLiveOperation::PropfindAbsence',
  'redirect(reqwest::redirect::Policy::none())',
  'WEBDAV_PROPFIND_BODY',
  'write_grade_read_only_probe_refuses_legacy_registry_before_network',
  'write_grade_read_only_probe_uses_one_parent_propfind_and_redacts_private_material',
]) {
  assert.ok(rust.includes(token), `Rust source missing ${token}`);
}

assert.ok(build.includes('cargo:rustc-env=H2O_BUILD_GIT_SHA='));
assert.ok(build.includes('cargo:rustc-env=H2O_BUILD_PROFILE='));
assert.ok(build.includes('cargo:rustc-env=H2O_BUILD_DIRTY='));
assert.ok(build.includes(commits.w35b));
assert.ok(build.includes(commits.r5a));
assert.ok(bin.includes('h2o_rt_write_grade_read_only_probe()'));
assert.ok(!bin.includes('h2o_rt_first_write'));

const diagnosticBlock = rust.slice(
  rust.indexOf('fn evaluate_write_grade_read_only_probe_with_client'),
  rust.indexOf('fn first_write_consumed_marker_path'),
);
for (const forbidden of [
  'write_first_write_apply_intent_marker',
  'validate_write_grade_receipt',
  'put_create_first',
  'put_create_second',
  'get_readback',
  'one_shot_token',
  'kill_switch_token',
]) {
  assert.ok(!diagnosticBlock.includes(forbidden), `diagnostic block contains ${forbidden}`);
}

for (const [pattern, label] of [
  [/https?:\/\//i, 'raw endpoint URL'],
  [/\bendpointUrlPrivate\b/i, 'private endpoint field'],
  [/\bremoteRootPathPrivate\b/i, 'private root field'],
  [/\bauthHeaderPrivate\b/i, 'private auth field'],
  [/\boneShotToken\s*[:=]/i, 'raw one-shot token'],
  [/\bkillSwitchToken\s*[:=]/i, 'raw kill-switch token'],
  [/\bpassword\s*[:=]/i, 'raw password'],
  [/\busername\s*[:=]/i, 'raw username'],
  [/\bprivateRegistryContents\s*[:=]/i, 'private registry contents'],
  [/\bcredentialRefHash\b/i, 'credential-derived fingerprint'],
  [/-----BEGIN/i, 'token-like PEM block'],
]) {
  assert.ok(!pattern.test(evidence), `evidence contains ${label}`);
}

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w3-5d-write-grade-read-only-propfind-diagnostic',
  evidencePath,
  implementationCommit: commits.implementation,
  runtimeBuildGitSha: commits.implementation,
  buildProfile: 'debug',
  buildDirty: false,
  normalProbeRegistryPathSource: 'app-local',
  writeGradeRegistryPathSource: 'app-local',
  registrySelectionEquivalent: true,
  endpointMaterialEquivalent: true,
  remoteRootMaterialEquivalent: true,
  credentialMaterialEquivalent: true,
  propfindStatus: 401,
  likelyCause: 'app-local-credential-or-registry-material',
  networkAttempted: true,
  writesWebDAV: false,
  receiptConsumed: false,
  consumedMarkerCreated: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
