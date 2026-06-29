#!/usr/bin/env node
// H.1/H.2 — Saved-chat archive RECOVERY / IMPORT / EXPORT validator (static).
//
// H.0 (contract e8e2ca1) defined inspection/verification/open/import/export of
// .h2ochat packages, inspector-first. H.1 locked the contract; H.2 then added the
// Desktop READ-ONLY package inspector. This validator now asserts BOTH the H.0
// contract and the H.2 read-only inspector (Desktop-only, reuses the read-only
// diagnostics validation, granular status vocabulary, no store write/import, no
// package-HTML execution), while the IMPORT/WRITE recovery entry points (H.4) still
// do not exist and the standing boundaries hold (Chrome no package authority,
// diagnostics read-only, writer a projection writer).
//
//   [H.1]       = the recovery/import/export contract (H.0 doc assertions).
//   [H.2]       = the read-only Archive Inspector implementation.
//   [INVARIANT] = boundaries that must hold now and after H.4.
//
// Static only: reads source/doc text, asserts patterns. No runtime, no imports of
// runtime modules, no DB, no network. When H.4 (importer) lands, update this
// validator in lock-step.

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
const INSPECTOR_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-inspector.studio.js';
const HEALTH_UI_REL = 'src-surfaces-base/studio/ingestion/archive-health-ui.studio.js';
// Files that legitimately reference .h2ochat: the WRITER, the read-only DIAGNOSTICS,
// and (since H.2) the read-only INSPECTOR. No other module may reference it.
const ALLOWED_H2OCHAT = new Set([
  'src-surfaces-base/studio/ingestion/saved-chat-package-v1.tauri.js',
  'src-surfaces-base/studio/ingestion/saved-chat-archive-diagnostics.tauri.js',
  'src-surfaces-base/studio/ingestion/saved-chat-archive-inspector.studio.js',
]);
// IMPORT / WRITE recovery entry-point names that must NOT exist until H.4. The
// read-only H.2 inspector is allowed; importing/recovering into the store is not.
const FORBIDDEN_IMPORTER_NAMES = [
  'importSavedChatPackage', 'recoverSavedChat', 'openSavedChatPackage', 'importSavedChatArchivePackage',
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
const inspectorSrc = exists(INSPECTOR_REL) ? readRepo(INSPECTOR_REL) : '';
const inspectorCode = stripComments(inspectorSrc);
const healthUiCode = stripComments(readRepo(HEALTH_UI_REL));

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

check('[INVARIANT] .h2ochat referenced only by writer/diagnostics/read-only-inspector; no IMPORT/WRITE entry point exists', () => {
  const offenders = [];
  for (const abs of walkJs(path.join(REPO_ROOT, STUDIO_DIR_REL))) {
    if (stripComments(fs.readFileSync(abs, 'utf8')).includes(PACKAGE_EXT)) {
      const rel = path.relative(REPO_ROOT, abs);
      if (!ALLOWED_H2OCHAT.has(rel)) offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, [], '.h2ochat referenced outside writer/diagnostics/inspector (unexpected reader/importer?): ' + offenders.join(', '));
  for (const abs of walkJs(path.join(REPO_ROOT, STUDIO_DIR_REL))) {
    const code = stripComments(fs.readFileSync(abs, 'utf8'));
    for (const name of FORBIDDEN_IMPORTER_NAMES) {
      assert.ok(!code.includes(name), 'import/write recovery entry point already exists (H.4, not yet): ' + name + ' in ' + path.relative(REPO_ROOT, abs));
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
  for (const banned of FORBIDDEN_IMPORTER_NAMES.concat(['snapshots.create', 'snapshots.upsert'])) {
    assert.ok(!writerCode.includes(banned), 'writer must not become an importer (found: ' + banned + ')');
  }
});

check('[INVARIANT] import-bundle / export-bundle are full-bundle artifacts, not .h2ochat package import/export', () => {
  assert.ok(importBundle.includes('h2o.studio.fullBundle'), 'import-bundle is the full-bundle importer');
  assert.ok(!importBundle.includes(PACKAGE_EXT), 'import-bundle must not touch .h2ochat packages');
  assert.ok(exportBundle.includes('h2o.studio.fullBundle'), 'export-bundle is the full-bundle exporter');
  assert.ok(!exportBundle.includes(PACKAGE_EXT), 'export-bundle must not touch .h2ochat packages');
});

// --- C. H.2 read-only Archive Inspector implementation -----------------------

check('[H.2] read-only Archive Inspector module exists, registers archiveInspector, and the health UI delegates to it', () => {
  assert.ok(exists(INSPECTOR_REL), 'inspector module missing');
  assert.match(inspectorSrc, /H2O\.Studio\.archiveInspector\s*=/);
  assert.match(inspectorSrc, /function inspectPackage\s*\(/);
  assert.match(inspectorSrc, /mountArchiveInspectorCard/);
  assert.match(inspectorSrc, /renderArchiveInspectorCard/);
  // mounted adjacent to Archive Health via the read-only-preserving delegation
  assert.ok(healthUiCode.includes('mountArchiveInspectorCard'), 'health UI must delegate to the inspector mount');
});

check('[H.2] inspector is Desktop-only (detectTauri + isDesktopCapable gate)', () => {
  assert.match(inspectorCode, /function detectTauri\s*\(/);
  assert.match(inspectorCode, /__TAURI_INTERNALS__|__TAURI__/);
  assert.match(inspectorCode, /isDesktopCapable/);
});

check('[H.2] inspector reuses the read-only diagnostics validation (validateSavedChatPackageV1 + listSavedChatArchivePackagesV1)', () => {
  assert.ok(inspectorCode.includes('validateSavedChatPackageV1'), 'inspector must reuse validateSavedChatPackageV1');
  assert.ok(inspectorCode.includes('listSavedChatArchivePackagesV1'), 'inspector must reuse the package inventory list');
});

check('[H.2] inspector exposes the granular status vocabulary', () => {
  for (const st of ['verified', 'corrupted', 'missing-files', 'hash-mismatch', 'unsupported-version', 'read-error']) {
    assert.ok(inspectorCode.includes("'" + st + "'"), 'inspector status missing: ' + st);
  }
});

check('[H.2] inspector does NOT import or write the store (no snapshot create/upsert, no SQL/package write, no importer)', () => {
  for (const banned of ['snapshots.create', 'snapshots.upsert', 'plugin:sql|execute', 'plugin:sql|', 'writeSavedChatPackageV1',
    'plugin:fs|write', MATERIALIZE_API].concat(FORBIDDEN_IMPORTER_NAMES)) {
    assert.ok(!inspectorCode.includes(banned), 'inspector must stay read-only (found: ' + banned + ')');
  }
  assert.doesNotMatch(inspectorCode, /\bINSERT\s+INTO\b|\bUPDATE\b[^=]/i, 'inspector must not write SQL');
});

check('[H.2] inspector does NOT execute package HTML (reads chat.md escaped; never reads/injects chat.html; no eval/Function)', () => {
  assert.doesNotMatch(inspectorCode, /\beval\s*\(/, 'no eval');
  assert.doesNotMatch(inspectorCode, /new\s+Function\s*\(/, 'no new Function');
  assert.match(inspectorCode, /readPackageTextFile\([^)]*['"]chat\.md['"]/); // preview reads chat.md
  assert.doesNotMatch(inspectorCode, /readPackageTextFile\([^)]*['"]chat\.html['"]/, 'inspector must not read chat.html');
  assert.ok(inspectorSrc.includes('escapeHtml(r.preview)'), 'preview must be HTML-escaped');
});

check('[H.2] inspector has no watcher/daemon and no scanner/Chrome/sync/native coupling', () => {
  for (const banned of ['setInterval', 'setTimeout', 'MutationObserver', 'requestAnimationFrame', 'requestIdleCallback',
    'scanSavedChatArchiveRequestInboxV1', 'chrome.runtime', 'connectNative', 'sendNativeMessage',
    'H2O.Studio.sync', 'webdav', 'WebDAV', 'localhost', '127.0.0.1', 'ws://', 'wss://']) {
    assert.ok(!inspectorCode.includes(banned), 'inspector must not couple to: ' + banned);
  }
});

console.log('');
if (FAIL.length) {
  console.error(`[archive-recovery-import-export] ${FAIL.length} failed, ${PASS.length} passed`);
  process.exitCode = 1;
} else {
  console.log(`[archive-recovery-import-export] PASS ${PASS.length} checks`);
}
