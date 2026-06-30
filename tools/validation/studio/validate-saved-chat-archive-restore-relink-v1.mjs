#!/usr/bin/env node
// K.1 — Saved-chat archive RESTORE / RELINK contract validator (static).
//
// Phase K adds verified restore/relink on top of the closed H (import-as-new) /
// I (permanent harness) / J (export) phases. K.0 (contract) defined `restore-
// original-ids` (absent-only, non-destructive, Desktop-only, verification-gated,
// no overwrite) and DEFERRED relink + tombstone-override/un-delete. K.1 (this
// validator) locks the K.0 contract statically and asserts that NO restore/relink
// RUNTIME exists yet — the restore module, its registration, its UI card, and any
// relink/tombstone-override behavior are all still absent. The runtime arrives in
// K.2, at which point this validator flips to assert the implementation.
//
//   [K.0]       = the restore/relink contract (K.0 doc assertions).
//   [NOT-IMPL]  = no restore/relink runtime exists yet.
//   [DEFERRED]  = relink + tombstone-override stay deferred.
//   [INVARIANT] = the importer stays import-as-new only; the recovery validator
//                 recognizes the restore plan without allowing runtime relink.
//
// Static only: reads source/doc text, asserts patterns. No runtime, no node:sqlite,
// no DB, no module loads.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const K0_CONTRACT_REL = 'release-evidence/2026-06-24/saved-chat-archive-phase-k0-restore-relink-contract.md';
const K1_EVIDENCE_REL = 'release-evidence/2026-06-24/saved-chat-archive-phase-k1-restore-relink-validator.md';
const VALIDATOR_REL = 'tools/validation/studio/validate-saved-chat-archive-restore-relink-v1.mjs';
const RECOVERY_VALIDATOR_REL = 'tools/validation/studio/validate-saved-chat-archive-recovery-import-export-v1.mjs';
const RESTORE_MODULE_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-restore.studio.js';
const IMPORTER_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-importer.studio.js';
const STUDIO_DIR_REL = 'src-surfaces-base/studio';

// Restore/relink runtime markers that must NOT exist anywhere in the studio tree yet.
// Use the namespace-qualified registration (bare `archiveRestore` collides with
// unrelated sync-lane identifiers like archiveRestoreInstalled); the function/card
// names are already specific.
const RESTORE_RUNTIME_NAMES = ['H2O.Studio.archiveRestore', 'dryRunRestorePackage', 'restoreVerifiedPackage',
  'mountArchiveRestoreCard', 'renderArchiveRestoreCard'];
const RELINK_RUNTIME_NAMES = ['archiveRelink', 'dryRunRelinkPackage', 'relinkVerifiedPackage'];

const PASS = [];
const FAIL = [];
function check(label, fn) {
  try { fn(); PASS.push(label); console.log(`  ✓ ${label}`); }
  catch (e) { const m = e && e.message ? e.message : String(e); FAIL.push({ label, m }); console.log(`  ✗ ${label}`); console.log(`      ${m}`); }
}
function readRepo(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(REPO_ROOT, rel)); }
function stripComments(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1'); }
function walkJs(absDir) {
  const out = [];
  for (const e of fs.readdirSync(absDir, { withFileTypes: true })) {
    const p = path.join(absDir, e.name);
    if (e.isDirectory()) out.push(...walkJs(p));
    else if (/\.js$/.test(e.name)) out.push(p);
  }
  return out;
}

const k0 = exists(K0_CONTRACT_REL) ? readRepo(K0_CONTRACT_REL) : '';
const k1 = exists(K1_EVIDENCE_REL) ? readRepo(K1_EVIDENCE_REL) : '';
const importerCode = exists(IMPORTER_REL) ? stripComments(readRepo(IMPORTER_REL)) : '';
const recoveryValidatorSrc = exists(RECOVERY_VALIDATOR_REL) ? readRepo(RECOVERY_VALIDATOR_REL) : '';
const selfSrc = readRepo(VALIDATOR_REL);

console.log('[archive-restore-relink] K.1 contract + not-implemented checks');

// --- A. K.0 contract -----------------------------------------------------------

check('[K.0] contract evidence file exists and is marked NOT IMPLEMENTED', () => {
  assert.ok(exists(K0_CONTRACT_REL), 'missing ' + K0_CONTRACT_REL);
  assert.match(k0, /PHASE K\.0 CONTRACT[\s\S]*NOT IMPLEMENTED/);
});

check('[K.0] contract states the K core decisions (restore-original-ids / absent-only / non-destructive / Desktop-only / verification-gated)', () => {
  assert.ok(k0.includes('restore-original-ids'), 'restore-original-ids');
  assert.ok(k0.includes('absent-only'), 'absent-only');
  assert.ok(k0.includes('non-destructive'), 'non-destructive');
  assert.ok(k0.includes('Desktop-only'), 'Desktop-only');
  assert.match(k0, /verification-gated/i);
  assert.ok(k0.includes('inspectPackage'), 'verification gate = inspectPackage');
});

check('[K.0] contract forbids overwrite and records the no-overwrite safety rules', () => {
  assert.match(k0, /never overwrite|Overwrite is never allowed|permanently rejected/i);
  for (const st of ['already-present', 'conflict-snapshot-id', 'conflict-chat-id', 'restore-ready']) {
    assert.ok(k0.includes(st), 'safety status missing: ' + st);
  }
  assert.match(k0, /Re-check `?snapshots\.get|immediately before insert/i);
});

check('[K.0] contract defers relink and tombstone-override/un-delete', () => {
  assert.match(k0, /Relink is deferred|relink[\s\S]{0,40}deferred/i);
  assert.ok(k0.includes('tombstoned'), 'tombstoned gate');
  assert.match(k0, /Tombstone override\/un-delete is deferred|tombstone override[\s\S]{0,40}deferred/i);
});

check('[K.0] contract scopes the writes (chats/snapshots/snapshot_turns/provenance) and forbids libraryIndex / saved_chat_archive_requests / Chrome', () => {
  for (const t of ['chats', 'snapshots', 'snapshot_turns']) assert.ok(k0.includes(t), 'write target missing: ' + t);
  assert.match(k0, /must not write `?libraryIndex`?|libraryIndex[\s\S]{0,40}not/i);
  assert.ok(k0.includes('saved_chat_archive_requests'), 'must not touch saved_chat_archive_requests');
  assert.match(k0, /no Chrome package authority|Chrome runtime\/service-worker/i);
});

check('[K.0] contract names the future reuse seams + explicit confirm (inspectPackage + buildTurnsFromPackageSnapshot + confirm)', () => {
  assert.ok(k0.includes('buildTurnsFromPackageSnapshot'), 'reuse importer turn builder');
  assert.ok(k0.includes('inspectPackage'), 'reuse inspector gate');
  assert.match(k0, /confirm/i);
});

// --- B. No restore/relink RUNTIME exists yet (K.1 is contract + validator only) -

check('[NOT-IMPL] the restore runtime module does not exist yet', () => {
  assert.ok(!exists(RESTORE_MODULE_REL), 'saved-chat-archive-restore.studio.js must not exist in K.1');
});

check('[NOT-IMPL] no restore runtime markers anywhere in the studio tree (no archiveRestore registration, API, or card)', () => {
  for (const abs of walkJs(path.join(REPO_ROOT, STUDIO_DIR_REL))) {
    const code = stripComments(fs.readFileSync(abs, 'utf8'));
    for (const name of RESTORE_RUNTIME_NAMES) {
      assert.ok(!code.includes(name), 'restore runtime marker present (K.1 must add no runtime): ' + name + ' in ' + path.relative(REPO_ROOT, abs));
    }
  }
});

check('[DEFERRED] no relink runtime markers anywhere (relink stays deferred)', () => {
  for (const abs of walkJs(path.join(REPO_ROOT, STUDIO_DIR_REL))) {
    const code = stripComments(fs.readFileSync(abs, 'utf8'));
    for (const name of RELINK_RUNTIME_NAMES) {
      assert.ok(!code.includes(name), 'relink runtime marker present (relink is deferred): ' + name + ' in ' + path.relative(REPO_ROOT, abs));
    }
  }
});

check('[DEFERRED] no archive recovery code introduces a relink pointer UPDATE or a tombstone clear/supersede in K.1', () => {
  // The chats store legitimately writes last_snapshot_id during normal capture; the
  // ban here is that no NEW restore/recovery module exists that pairs a package read
  // with such an UPDATE. With the restore module absent, this holds by construction.
  assert.ok(!exists(RESTORE_MODULE_REL), 'restore module must be absent');
  // The importer (the only existing recovery write path) must not clear tombstones.
  for (const banned of ['sync_tombstones', 'tombstones.remove', 'tombstones.delete', "tombstones['delete']", 'deleteTombstone', 'clearTombstone']) {
    assert.ok(!importerCode.includes(banned), 'importer must not touch tombstones (found: ' + banned + ')');
  }
});

// --- C. The importer stays import-as-new only ---------------------------------

check('[INVARIANT] importer is still import-as-new only (defers restore/relink; never reuses original ids for a write)', () => {
  assert.ok(importerCode.includes('restore-relink-deferred'), 'importer must defer restore/relink');
  assert.ok(!/snapStore\.upsert\(|snapshots\.upsert\(/.test(importerCode), 'importer must never call the snapshot overwrite-by-id primitive');
  assert.doesNotMatch(importerCode, /create\(\{[^}]*snapshotId/s, 'importer snapshots.create must not set a package snapshotId (import-as-new uses a fresh id)');
  assert.ok(importerCode.includes('generateRecoveredChatId'), 'importer still generates a fresh recovered chat id');
});

// --- D. Recovery validator recognizes the restore plan (the K.1 flip) ----------

check('[INVARIANT] the recovery/import/export validator now recognizes the restore module (planning allowance) without enabling relink/overwrite', () => {
  assert.ok(recoveryValidatorSrc.length > 0, 'recovery validator missing');
  assert.ok(recoveryValidatorSrc.includes('saved-chat-archive-restore.studio.js'),
    'recovery validator must pre-authorize the future restore module (ALLOWED_H2OCHAT)');
  assert.ok(/RESTORE_ENTRY_NAMES|archiveRestore/.test(recoveryValidatorSrc),
    'recovery validator must confine the restore entry points to the restore module');
  // it must still keep relink forbidden as runtime
  assert.ok(recoveryValidatorSrc.includes('relinkVerifiedPackage') || recoveryValidatorSrc.includes('archiveRelink'),
    'recovery validator must keep relink runtime forbidden');
});

check('[INVARIANT] K.1 stays static — this validator loads no runtime, no node:sqlite, no DB, no modules', () => {
  const loadLines = selfSrc.split('\n').filter((l) => /^\s*import\s/.test(l) || /\b(?:require|import)\s*\(/.test(l));
  const loaded = loadLines.join('\n');
  for (const mod of ['node:sqlite', 'saved-chat-archive-restore', 'saved-chat-archive-importer', 'store/snapshots.tauri', 'store/chats.tauri']) {
    assert.ok(!loaded.includes(mod), 'K.1 validator must not load a runtime module: ' + mod);
  }
});

check('[K.1] evidence exists and is marked NOT IMPLEMENTED with the deferrals recorded', () => {
  assert.ok(exists(K1_EVIDENCE_REL), 'K.1 evidence missing');
  assert.match(k1, /PHASE K\.1[\s\S]*RESTORE ?\/ ?RELINK VALIDATOR[\s\S]*NOT IMPLEMENTED/);
  assert.match(k1, /relink[\s\S]{0,40}defer/i);
  assert.match(k1, /tombstone[\s\S]{0,60}defer/i);
});

console.log('');
if (FAIL.length) {
  console.error(`[archive-restore-relink] ${FAIL.length} failed, ${PASS.length} passed`);
  process.exitCode = 1;
} else {
  console.log(`[archive-restore-relink] PASS ${PASS.length} checks`);
}
