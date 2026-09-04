#!/usr/bin/env node
// M10 P3.5a — corrected legacy package-validation reachability.
//
// The earlier "zero production legacy verifier callers" goal was FALSE: the M08
// portable byte path legitimately delegates to the same verifier core. This
// validator states the truthful contract instead, and marks the carveout so a
// future P4 cannot mistake it for dead code.
//
//   ARCHIVE domain   -> trusted Rust only (Health, Coverage, Inspector)
//   PORTABLE domain  -> legacy JS byte-source verifier, RETAINED until P3.6

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const SRC_ROOT = path.join(REPO_ROOT, 'src-surfaces-base');
const ING = 'src-surfaces-base/studio/ingestion/';
const DEFINER = `${ING}saved-chat-archive-diagnostics.tauri.js`;
const readRepo = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

/* Production Studio source only — never validators or evidence tooling. */
function productionFiles() {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|mjs)$/.test(entry.name)) out.push(path.relative(REPO_ROOT, full));
    }
  })(SRC_ROOT);
  return out;
}
const codeOf = (rel) => readRepo(rel)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');
const callersOf = (token) => productionFiles()
  .filter((rel) => rel !== DEFINER)
  .filter((rel) => codeOf(rel).includes(token));

const PASS = [];
const FAIL = [];
function check(label, fn) {
  try { fn(); PASS.push(label); console.log(`  ✓ ${label}`); }
  catch (e) { const m = e && e.message ? e.message : String(e); FAIL.push({ label, m }); console.log(`  ✗ ${label}`); console.log(`      ${m}`); }
}

console.log('= saved-chat legacy package-validation reachability (M10 P3.5a) =');

check('CLAIM 1 — zero production callers of listSavedChatArchivePackagesV1', () => {
  assert.deepEqual(callersOf('listSavedChatArchivePackagesV1'), [],
    'archive discovery is trusted-only after P3.5a');
});

check('CLAIM 2 — the only remaining validateSavedChatPackageV1 call is the deliberate byte-path delegation', () => {
  assert.deepEqual(callersOf('validateSavedChatPackageV1'), [],
    'no production module calls the archive verifier directly');
  /* Inside the definer, exactly one internal delegation remains: the M08 byte
     adapter. It is the documented carveout, not an oversight. */
  const definer = codeOf(DEFINER);
  const bodyStart = definer.indexOf('async function validateSavedChatPackageBytesV1');
  assert.ok(bodyStart > 0, 'the byte adapter exists');
  const body = definer.slice(bodyStart, bodyStart + 1400);
  assert.ok(body.includes('validateSavedChatPackageV1('), 'the byte adapter delegates to the shared verifier core');
});

check('CLAIM 3 — Coverage and Inspector consume the trusted client and the canonical partition', () => {
  for (const rel of [`${ING}saved-chat-coverage.tauri.js`, `${ING}saved-chat-archive-inspector.studio.js`]) {
    const code = codeOf(rel);
    assert.ok(code.includes('readSavedChatArchiveIntegrityV1'), `${rel} must read trusted integrity`);
    assert.ok(code.includes('partitionOccupants'), `${rel} must reuse the canonical partition`);
    for (const legacy of ['listSavedChatArchivePackagesV1', 'validateSavedChatPackageV1']) {
      assert.ok(!code.includes(legacy), `${rel} must not reference ${legacy}`);
    }
  }
});

check('CLAIM 4 — the M08 portable carveout is exactly the importer and the exporter', () => {
  const consumers = callersOf('validateSavedChatPackageBytesV1').sort();
  assert.deepEqual(consumers, [
    `${ING}saved-chat-archive-exporter.studio.js`,
    `${ING}saved-chat-archive-importer.studio.js`,
  ], 'exactly the two M08 portable consumers — a third would widen P3.5');
  /* EXPLICIT CARVEOUT MARKER, so P4 cannot mistake this for dead code:
     portable byte-source validation stays on the JS verifier until P3.6 adds a
     trusted native byte-source command. */
});

check('CLAIM 5 — no production archive consumer reaches the filesystem package source', () => {
  assert.deepEqual(callersOf('filesystemPackageSource'), [],
    'archive-root legacy verification is no longer a production input');
});

/* ---- §13 exporter/importer compatibility, proven without touching them ---- */

check('the exporter still gates on `verified` and fails closed on every new label', () => {
  const exporter = readRepo(`${ING}saved-chat-archive-exporter.studio.js`);
  const start = exporter.indexOf('async function inspectVerifiedPackage');
  const body = exporter.slice(start, start + 1600);
  assert.ok(/inspectStatus !== 'verified'/.test(body), 'the gate is verified-or-reject');
  /* The catch-all: anything not explicitly bucketed is rejected, so the three
     new Inspector labels fail closed with no exporter change. */
  assert.ok(/status: 'rejected', reason: inspectStatus \|\| 'not-verified'/.test(body),
    'a catch-all rejection exists for unrecognised statuses');
  for (const added of ['incomplete', 'unreadable', 'identity-mismatch']) {
    assert.ok(!body.includes(`'${added}'`), `${added} is not specially bucketed, so it hits the catch-all`);
  }
  /* Version gating does not depend on the retired Inspector label. */
  assert.ok(/schemaVersion === 1 \|\| schemaVersion === 2/.test(exporter),
    'the exporter validates supported manifest versions independently');
  /* And the portable byte authority is untouched. */
  assert.ok(exporter.includes('validateSavedChatPackageBytesV1'), 'portable byte validation retained');
});

check('the importer is untouched and still uses the portable byte validator', () => {
  const importer = readRepo(`${ING}saved-chat-archive-importer.studio.js`);
  assert.ok(importer.includes('validateSavedChatPackageBytesV1'), 'portable byte validation retained');
  assert.ok(!importer.includes('readSavedChatArchiveIntegrityV1'),
    'the importer must NOT be migrated in P3.5 — that is P3.6');
});

console.log('');
if (FAIL.length) {
  console.log(`[saved-chat-legacy-integrity-reachability] ${FAIL.length} failed, ${PASS.length} passed`);
  process.exit(1);
}
console.log(`[saved-chat-legacy-integrity-reachability] all ${PASS.length} checks passed`);
