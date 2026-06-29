#!/usr/bin/env node
// H.1 — Saved-chat archive RECOVERY / IMPORT / EXPORT CONTRACT validator (static).
//
// H.0 (contract e8e2ca1) defined inspection / verification / open / import / export
// of .h2ochat packages, and decided to ship a READ-ONLY package inspector first
// (H.2/H.3) before any import/write recovery (H.4/H.5). H.1 statically locks that
// contract and asserts the current runtime is still pre-implementation: no
// .h2ochat reader/importer/inspector exists, the diagnostics stay read-only, the
// writer stays a projection writer (not an importer), and Chrome has no package
// authority.
//
//   [H.1]       = the recovery/import/export contract (H.0 doc assertions).
//   [INVARIANT] = boundaries that must hold now and after H.2/H.4.
//
// Static only: reads source/doc text, asserts patterns. No runtime, no imports of
// runtime modules, no DB, no network. It asserts NO inspector/importer is
// implemented yet — this validator must be updated alongside H.2/H.4.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const H0_CONTRACT_REL = 'release-evidence/2026-06-24/saved-chat-archive-phase-h0-recovery-import-export-contract.md';
const DIAGNOSTICS_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-diagnostics.tauri.js';
const WRITER_REL = 'src-surfaces-base/studio/ingestion/saved-chat-package-v1.tauri.js';
const SCANNER_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-request-inbox.tauri.js';
const MATERIALIZER_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-materializer.tauri.js';
const DELIVERY_MV3_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-request-delivery.mv3.js';
const IMPORT_BUNDLE_REL = 'src-surfaces-base/studio/ingestion/import-bundle.tauri.js';
const EXPORT_BUNDLE_REL = 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js';
const STUDIO_DIR_REL = 'src-surfaces-base/studio';

const MATERIALIZE_API = 'materializeSavedChatArchiveRequestV1';
const PACKAGE_EXT = '.h2ochat';
// Files that legitimately reference .h2ochat today: the WRITER and the read-only
// DIAGNOSTICS. No reader/importer/inspector may reference it yet.
const ALLOWED_H2OCHAT = new Set([
  'src-surfaces-base/studio/ingestion/saved-chat-package-v1.tauri.js',
  'src-surfaces-base/studio/ingestion/saved-chat-archive-diagnostics.tauri.js',
]);
// Importer/reader/inspector entry-point names that must NOT exist yet.
const IMPORTER_NAMES = [
  'importSavedChatPackage', 'readSavedChatPackageV1', 'inspectSavedChatPackage',
  'recoverSavedChat', 'openSavedChatPackage', 'importSavedChatArchivePackage',
];

const PASS = [];
const FAIL = [];
function check(label, fn) {
  try { fn(); PASS.push(label); console.log(`  ✓ ${label}`); }
  catch (e) { const m = e && e.message ? e.message : String(e); FAIL.push({ label, m }); console.log(`  ✗ ${label}`); console.log(`      ${m}`); }
}
function readRepo(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(REPO_ROOT, rel)); }
function stripComments(srcText) {
  return String(srcText).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
function walkJs(absDir) {
  const out = [];
  for (const e of fs.readdirSync(absDir, { withFileTypes: true })) {
    const p = path.join(absDir, e.name);
    if (e.isDirectory()) out.push(...walkJs(p));
    else if (/\.js$/.test(e.name)) out.push(p);
  }
  return out;
}

const h0 = exists(H0_CONTRACT_REL) ? readRepo(H0_CONTRACT_REL) : '';
const diagCode = stripComments(readRepo(DIAGNOSTICS_REL));
const writerCode = stripComments(readRepo(WRITER_REL));
const scannerCode = stripComments(readRepo(SCANNER_REL));
const matCode = stripComments(readRepo(MATERIALIZER_REL));
const readerCode = stripComments(readRepo(DELIVERY_MV3_REL));
const importBundle = stripComments(readRepo(IMPORT_BUNDLE_REL));
const exportBundle = stripComments(readRepo(EXPORT_BUNDLE_REL));

console.log('[archive-recovery-import-export] H.1 contract checks');

// --- A. H.0 contract (recovery / import / export) ----------------------------

check('[H.1] H.0 contract evidence file exists', () => {
  assert.ok(exists(H0_CONTRACT_REL), 'missing ' + H0_CONTRACT_REL);
});

check('[H.1] H.0 is marked PHASE H.0 CONTRACT — NOT IMPLEMENTED', () => {
  assert.match(h0, /PHASE H\.0 CONTRACT\s*[—-]\s*NOT IMPLEMENTED/);
});

check('[H.1] H.0 states no .h2ochat reader/importer/inspector exists yet', () => {
  assert.ok(h0.includes('reader / importer / inspector exists yet'),
    'H.0 must state no reader/importer/inspector exists yet');
});

check('[H.1] H.0 recommends a read-only inspector first (before import/write recovery)', () => {
  assert.ok(h0.includes('read-only package inspector first'), 'H.0 must recommend inspector-first');
});

check('[H.1] H.0 defines the product goals (inspect / verify / open / import-if-safe / export)', () => {
  for (const g of ['Inspect', 'Verify integrity', 'Open / read', 'Import into Desktop store', 'Export / share']) {
    assert.ok(h0.includes(g), 'H.0 product goal missing: ' + g);
  }
});

check('[H.1] H.0 preserves the authority model (Desktop owns import; Chrome no import / no package body; projection)', () => {
  assert.ok(h0.includes('Desktop owns import'), 'Desktop owns import');
  assert.match(h0, /Chrome does not import packages/i);
  assert.ok(h0.includes('does not read the package/CAS body'), 'Chrome does not read package/CAS body');
  assert.ok(h0.includes('projection, not the primary source of truth'), 'package is a projection, not primary truth');
});

check('[H.1] H.0 defines the recovery modes (inspector / import-as-new / restore-relink / reject)', () => {
  assert.ok(h0.includes('Read-only inspector'), 'mode: read-only inspector');
  assert.ok(h0.includes('Import as new recovered'), 'mode: import as new recovered');
  assert.ok(h0.includes('Restore / relink'), 'mode: restore / relink');
  assert.ok(h0.includes('Reject unsafe'), 'mode: reject unsafe/corrupted');
});

check('[H.1] H.0 defines the validation gate (required files + hashes + contentHash + schema + assets + no partial)', () => {
  for (const f of ['manifest.json', 'snapshot.json', 'chat.md', 'chat.html']) {
    assert.ok(h0.includes(f), 'validation gate missing required file: ' + f);
  }
  assert.ok(h0.includes('manifest.files'), 'hashes must match the manifest descriptors');
  assert.ok(h0.includes('sha256(snapshot.json)'), 'contentHash = sha256(snapshot.json) semantics');
  assert.ok(h0.includes('schemaVersion') && h0.includes('payloadVersion'), 'schema/payload version compatibility');
  assert.match(h0, /assets checked if present/i);
  assert.ok(h0.includes('No silent partial import'), 'no silent partial import');
});

check('[H.1] H.0 defines conflict handling (chatId / snapshotId / contentHash / title / foreign machine)', () => {
  assert.match(h0, /`chatId` already exists/);
  assert.match(h0, /`snapshotId` already exists/);
  assert.match(h0, /`contentHash` already exists/);
  assert.ok(h0.includes('title/name collision'), 'title/name collision');
  assert.ok(h0.includes('another machine/profile'), 'foreign package/profile/machine');
});

check('[H.1] H.0 defines the UX boundary (Desktop-only / inspector area / explicit / no global button / clear states)', () => {
  assert.ok(h0.includes('Desktop-only'), 'Desktop-only');
  assert.match(h0, /Archive Inspector|Archive Health/);
  assert.match(h0, /explicit operator action/i);
  assert.match(h0, /no global floating button/i);
  for (const st of ['verified', 'corrupted', 'already-exists', 'imported', 'rejected']) {
    assert.ok(h0.includes(st), 'clear state missing: ' + st);
  }
});

check('[H.1] H.0 defines the safety boundaries (no Chrome package authority / no scanner-materializer-watcher / no sync / no overwrite)', () => {
  assert.match(h0, /Chrome package write\/read authority/i);
  assert.match(h0, /No scanner changes/i);
  assert.match(h0, /No materializer changes/i);
  assert.match(h0, /No watcher\/daemon/i);
  assert.match(h0, /No sync \/ WebDAV \/ cloud propagation/i);
  assert.match(h0, /`?S0F0j`? \/ `?S0F1j`? edits/);
  assert.match(h0, /no package overwrite by default/i);
});

// --- B. Current runtime is pre-implementation (no inspector/importer yet) -----

check('[INVARIANT] no .h2ochat reader/importer/inspector implementation exists (only writer + diagnostics reference it)', () => {
  const offenders = [];
  for (const abs of walkJs(path.join(REPO_ROOT, STUDIO_DIR_REL))) {
    if (stripComments(fs.readFileSync(abs, 'utf8')).includes(PACKAGE_EXT)) {
      const rel = path.relative(REPO_ROOT, abs);
      if (!ALLOWED_H2OCHAT.has(rel)) offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, [], '.h2ochat referenced outside writer/diagnostics (new reader/importer?): ' + offenders.join(', '));
  for (const abs of walkJs(path.join(REPO_ROOT, STUDIO_DIR_REL))) {
    const code = stripComments(fs.readFileSync(abs, 'utf8'));
    for (const name of IMPORTER_NAMES) {
      assert.ok(!code.includes(name), 'importer/inspector entry point already exists: ' + name + ' in ' + path.relative(REPO_ROOT, abs));
    }
  }
});

check('[INVARIANT] Chrome runtime (mv3 reader) has no package/CAS body or SQLite authority', () => {
  for (const banned of [PACKAGE_EXT, 'archive/packages', 'archive/assets', 'plugin:sql|',
    'writeSavedChatPackageV1', MATERIALIZE_API]) {
    assert.ok(!readerCode.includes(banned), 'Chrome reader must not reference: ' + banned);
  }
});

check('[INVARIANT] scanner/materializer/writer behavior unchanged for H.1', () => {
  assert.ok(!scannerCode.includes(MATERIALIZE_API), 'scanner stays enqueue-only (no materializer call)');
  assert.match(matCode, /if \(!detectTauri\(\)\) return;/); // materializer Desktop/Tauri-only
  assert.ok(writerCode.includes('writeSavedChatPackageV1'), 'writer still defines the package writer');
});

check('[INVARIANT] diagnostics still validates required files + hashes/assets, read-only', () => {
  assert.match(diagCode, /REQUIRED_FILES/);
  assert.match(diagCode, /sha256/);
  for (const banned of ['plugin:fs|write', 'plugin:sql|execute', MATERIALIZE_API, 'snapshots.create', 'snapshots.upsert']) {
    assert.ok(!diagCode.includes(banned), 'diagnostics must stay read-only (found: ' + banned + ')');
  }
});

check('[INVARIANT] package writer still writes projection packages and is NOT an importer', () => {
  assert.ok(writerCode.includes('writeSavedChatPackageV1'), 'writer present');
  assert.ok(writerCode.includes('projectionOnly'), 'writer emits projectionOnly provenance');
  for (const banned of IMPORTER_NAMES.concat(['snapshots.create', 'snapshots.upsert'])) {
    assert.ok(!writerCode.includes(banned), 'writer must not become an importer (found: ' + banned + ')');
  }
});

check('[INVARIANT] import-bundle / export-bundle are full-bundle artifacts, not .h2ochat package import/export', () => {
  assert.ok(importBundle.includes('h2o.studio.fullBundle'), 'import-bundle is the full-bundle importer');
  assert.ok(!importBundle.includes(PACKAGE_EXT), 'import-bundle must not touch .h2ochat packages');
  assert.ok(exportBundle.includes('h2o.studio.fullBundle'), 'export-bundle is the full-bundle exporter');
  assert.ok(!exportBundle.includes(PACKAGE_EXT), 'export-bundle must not touch .h2ochat packages');
});

console.log('');
if (FAIL.length) {
  console.error(`[archive-recovery-import-export] ${FAIL.length} failed, ${PASS.length} passed`);
  process.exitCode = 1;
} else {
  console.log(`[archive-recovery-import-export] PASS ${PASS.length} checks`);
}
