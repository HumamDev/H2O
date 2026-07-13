#!/usr/bin/env node
//
// Real-transport R6-TC - state-independent unsealed-gate rejection test validator.
//
// Point-in-time validator for the test-compatibility (TC) commit. Proves the ONLY change vs the
// A6 parent is a single contiguous region inside the #[cfg(test)] module (the renamed unsealed-gate
// rejection test), that no production/runtime byte changed, that the three compiled approval
// constants remain false/empty, that the ten protected request/network regions and the R4/R5
// denylist are byte-identical to the parent, and that the rewritten test now proves the fail-closed
// invariant via a synthetic unsealed R6ApprovalGateConfig (so it stays valid after S2 seals the
// production constants). It does not modify earlier point-in-time validators.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const parentCommitExpected = '892d88769c7897a9efe23e63aa2fb5a091ecaa64'; // current A6

const rustPath = 'apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs';
const validatorPath =
  'tools/validation/sync/validate-real-transport-r6-tc-state-independent-unsealed-gate-test.mjs';
const allowedPaths = [rustPath, validatorPath].sort();

const OLD_FN = 'r6_s1_unsealed_gate_rejects_before_any_post_preflight_callback';
const NEW_FN = 'r6_synthetic_unsealed_gate_rejects_before_any_callback';

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', ...opts });
}
function read(rel) {
  const abs = path.join(root, rel);
  assert.ok(fs.existsSync(abs), `missing ${rel}`);
  return fs.readFileSync(abs, 'utf8');
}
function show(commit, rel) {
  return git(['show', `${commit}:${rel}`]);
}
function assertIncludes(src, tok, label) { assert.ok(String(src).includes(tok), `${label}: missing ${tok}`); }
function assertNotIncludes(src, tok, label) { assert.ok(!String(src).includes(tok), `${label}: forbidden ${tok}`); }
function count(hay, needle) { return hay.split(needle).length - 1; }

function statusPaths() {
  const entries = git(['status', '--porcelain=v1', '-z', '--untracked-files=all']).split('\0').filter(Boolean);
  const paths = [];
  for (const entry of entries) {
    const state = entry.slice(0, 2);
    assert.ok(!/[RC]/.test(state), 'renames and copies are outside TC scope');
    paths.push(entry.slice(3));
  }
  return paths.sort();
}

// ---------------------------------------------------------------------------
// (1) Parent / candidate-path scope.
// ---------------------------------------------------------------------------
const head = git(['rev-parse', 'HEAD']).trim();
git(['cat-file', '-e', `${parentCommitExpected}^{commit}`], { stdio: 'ignore' });

const committedPaths = head === parentCommitExpected
  ? []
  : git(['diff', '--name-only', `${parentCommitExpected}..${head}`]).trim().split('\n').filter(Boolean).sort();
const workingPaths = statusPaths();
const candidatePaths = [...new Set([...committedPaths, ...workingPaths])].sort();
assert.deepEqual(candidatePaths, allowedPaths, 'TC candidate path set must be exactly the two approved paths');

let parentCommit = parentCommitExpected;
if (head !== parentCommitExpected) {
  const parents = git(['rev-list', '--parents', '-n', '1', head]).trim().split(/\s+/);
  assert.equal(parents.length, 2, 'TC must have exactly one parent');
  parentCommit = parents[1];
  assert.equal(parentCommit, parentCommitExpected, 'TC parent must be the current A6 commit');
  assert.deepEqual(committedPaths, allowedPaths, 'committed TC path set');
}

// ---------------------------------------------------------------------------
// (2) Single-contiguous-region, test-only proof for the Rust file.
// ---------------------------------------------------------------------------
const parentRust = show(parentCommitExpected, rustPath);
const candidateRust = read(rustPath); // working tree == staged == committed content for this file

assert.notEqual(candidateRust, parentRust, 'TC must change the Rust file');

// longest common prefix / suffix (byte-wise over the UTF-8 string code units)
let p = 0;
while (p < parentRust.length && p < candidateRust.length && parentRust[p] === candidateRust[p]) p += 1;
let s = 0;
while (
  s < parentRust.length - p &&
  s < candidateRust.length - p &&
  parentRust[parentRust.length - 1 - s] === candidateRust[candidateRust.length - 1 - s]
) s += 1;

const oldMid = parentRust.slice(p, parentRust.length - s);
const newMid = candidateRust.slice(p, candidateRust.length - s);

// Exactly one contiguous region differs: substituting the new region back to the old reproduces the parent byte-for-byte.
const reconstructedParent = candidateRust.slice(0, p) + oldMid + candidateRust.slice(candidateRust.length - s);
assert.equal(reconstructedParent, parentRust, 'substituting the new test block with the old must reproduce the parent exactly');

// The change is inside the #[cfg(test)] module => no production byte changed.
const cfgTestOffset = parentRust.indexOf('#[cfg(test)]');
assert.ok(cfgTestOffset >= 0, 'parent must contain a #[cfg(test)] module');
assert.ok(p > cfgTestOffset, 'the changed region must begin inside the #[cfg(test)] module (no production byte changed)');

// The differing regions are exactly the old vs new test function.
// The common prefix can end mid-identifier (both fns share the `fn r6_s` prefix), so check the
// guaranteed post-divergence portion of each name rather than the full name here; full-name
// uniqueness is asserted against the whole files just below.
assert.ok(oldMid.includes('_unsealed_gate_rejects_before_any_post_preflight_callback'), 'old region is the historical test');
assert.ok(newMid.includes('ynthetic_unsealed_gate_rejects_before_any_callback'), 'new region is the renamed test');
assert.ok(parentRust.includes(OLD_FN) && !candidateRust.includes(OLD_FN), 'old fn name present only in parent');
assert.ok(candidateRust.includes(NEW_FN) && !parentRust.includes(NEW_FN), 'new fn name present only in candidate');

// ---------------------------------------------------------------------------
// (3) The rewritten test proves the invariant via a synthetic unsealed gate.
// Content is asserted against the name-extracted function block (the prefix/suffix-derived region
// can end mid-token, so it is used only for the structural single-region proof above).
// ---------------------------------------------------------------------------
function extractFnBlock(source, fnName) {
  const fnIndex = source.indexOf(`fn ${fnName}`);
  assert.ok(fnIndex >= 0, `cannot locate fn ${fnName}`);
  const closeIndex = source.indexOf('\n    }\n', fnIndex);
  assert.ok(closeIndex > fnIndex, `cannot locate close of fn ${fnName}`);
  return source.slice(fnIndex, closeIndex + '\n    }\n'.length);
}
const newFnBlock = extractFnBlock(candidateRust, NEW_FN);
assertIncludes(newFnBlock, 'dispatch_r6_execution_preflight_with_gate', 'new test uses the synthetic-gate dispatch');
assertIncludes(newFnBlock, 'R6ApprovalGateConfig {', 'new test constructs a synthetic gate config');
assertIncludes(newFnBlock, 'sealed: false', 'new test constructs an unsealed synthetic gate');
assertIncludes(newFnBlock, 'approval_commit: ""', 'new test synthetic gate has empty approval commit');
assertIncludes(newFnBlock, 'approval_artifact_hash: ""', 'new test synthetic gate has empty approval hash');
assertIncludes(newFnBlock, 'Err("real-transport-r6-approval-gate-unsealed")', 'new test asserts gate-unsealed');
assertIncludes(newFnBlock, 'assert_eq!(calls.get(), 0)', 'new test asserts zero callback calls');
// The three compiled-constant assertions must be gone from the rewritten test.
assertNotIncludes(newFnBlock, '!R6_APPROVAL_GATE_SEALED', 'no direct compiled-sealed assertion');
assertNotIncludes(newFnBlock, 'R6_APPROVAL_COMMIT.is_empty()', 'no direct compiled-commit assertion');
assertNotIncludes(newFnBlock, 'R6_APPROVAL_ARTIFACT_HASH.is_empty()', 'no direct compiled-hash assertion');

// ---------------------------------------------------------------------------
// (4) Compiled approval constants remain false/empty in the candidate.
// ---------------------------------------------------------------------------
for (const token of [
  'const R6_APPROVAL_GATE_SEALED: bool = false;',
  'const R6_APPROVAL_COMMIT: &str = "";',
  'const R6_APPROVAL_ARTIFACT_HASH: &str = "";',
]) {
  assertIncludes(candidateRust, token, `approval sentinel unchanged ${token}`);
}
assertNotIncludes(candidateRust, 'R6_APPROVAL_GATE_SEALED: bool = true', 'gate must not be sealed in TC');

// ---------------------------------------------------------------------------
// (5) Protected regions + R4/R5 denylist byte-identical to parent (defense-in-depth;
// already implied by the single-region proof, asserted explicitly here too).
// ---------------------------------------------------------------------------
const protectedAnchors = [
  'fn build_target_url',
  'impl ReqwestFirstWriteLiveClient',
  'fn run_live_readonly_probe',
  'fn resolve_first_write_live_registry',
  'fn write_first_write_apply_intent_marker',
  'fn first_write_consumed_marker_path',
  'fn build_auth_header_private',
  'fn descriptor_registry_path_for_setup_status',
  'fn build_parent_collection_url',
  'fn validate_r6_approval_gate',
  'const R6_R4_BURNED_RECEIPT_CORE_HASH',
  'const R6_R5_BURNED_RECEIPT_CORE_HASH',
  'const R6_BURNED_RECEIPT_CORE_HASHES',
  'real-transport-r6-burned-receipt-denied',
];
for (const anchor of protectedAnchors) {
  const inParent = count(parentRust, anchor);
  const inCandidate = count(candidateRust, anchor);
  assert.equal(inCandidate, inParent, `protected anchor count changed for ${anchor}`);
  // Every occurrence lies outside the single changed region, so its surrounding bytes are identical.
  assert.ok(anchor === undefined || !oldMid.includes(anchor), `protected anchor must not be inside the changed region: ${anchor}`);
}

// ---------------------------------------------------------------------------
// (6) No private material; readiness stays false.
// ---------------------------------------------------------------------------
assert.doesNotMatch(newMid, /https?:\/\//i, 'no raw URL in the changed test region');
assertNotIncludes(candidateRust, 'R6_APPROVAL_GATE_SEALED: bool = true', 'no seal introduced');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.real-transport-r6-tc-state-independent-unsealed-gate-test.validator.v1',
  lane: 'real-webdav-cloud-relay-transport',
  phase: 'r6-tc-state-independent-unsealed-gate-test',
  head,
  parentCommit,
  candidatePaths,
  changedRegionInsideCfgTest: p > cfgTestOffset,
  singleContiguousRegion: reconstructedParent === parentRust,
  oldTestName: OLD_FN,
  newTestName: NEW_FN,
  usesSyntheticGateDispatch: newMid.includes('dispatch_r6_execution_preflight_with_gate'),
  syntheticGateUnsealed: newMid.includes('sealed: false'),
  removedCompiledConstantAssertions:
    !newMid.includes('!R6_APPROVAL_GATE_SEALED') &&
    !newMid.includes('R6_APPROVAL_COMMIT.is_empty()') &&
    !newMid.includes('R6_APPROVAL_ARTIFACT_HASH.is_empty()'),
  productionBytesChanged: false,
  approvalGateSealed: false,
  approvalCommitEmpty: true,
  approvalArtifactHashEmpty: true,
  networkRequestPerformed: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
console.log('PASS validate-real-transport-r6-tc-state-independent-unsealed-gate-test');
