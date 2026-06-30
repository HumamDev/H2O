#!/usr/bin/env node
// H.1/H.2/H.4 — Saved-chat archive RECOVERY / IMPORT / EXPORT validator (static).
//
// H.0 (contract e8e2ca1) defined inspection/verification/open/import/export of
// .h2ochat packages, inspector-first. H.1 locked the contract; H.2 added the
// Desktop READ-ONLY package inspector; H.4 now adds the FIRST import/recovery
// action — a separate, Desktop-only, verification-gated, NO-OVERWRITE importer
// module (dry-run + explicit import-as-new). This validator asserts the H.0
// contract, the H.2 read-only inspector (which STAYS read-only), and the H.4
// importer (verification-gated, dry-run non-mutating, import-as-new via a fresh
// id, never the overwrite-by-id primitive, restore/relink deferred, no package
// HTML execution, Desktop-only), while the standing boundaries hold (Chrome no
// package authority, diagnostics read-only, writer a projection writer, and as
// of Phase J.2 only the bounded Desktop archiveExporter export/share runtime is
// allowed. As of Phase K.1 the verification-gated RESTORE module
// (restore-original-ids) is pre-authorized. As of Phase K.4.1 the future
// verification-gated RELINK module is pre-authorized by filename/entry point
// only; tombstone-override/un-delete stay deferred.
//
//   [H.1]       = the recovery/import/export contract (H.0 doc assertions).
//   [H.2]       = the read-only Archive Inspector implementation (stays read-only).
//   [H.4]       = the verification-gated, no-overwrite import/recovery action.
//   [INVARIANT] = boundaries that must hold now and after H.4.
//
// Static only: reads source/doc text, asserts patterns. No runtime, no imports of
// runtime modules, no DB, no network.

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
const IMPORTER_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-importer.studio.js';
const EXPORTER_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-exporter.studio.js';
// Phase K.0/K.1 planning allowance: the future verification-gated, absent-only,
// no-overwrite RESTORE module (restore-original-ids). It does not exist yet (K.1 is
// contract + validator only); pre-authorizing it here keeps the K.2 restore module
// from tripping the .h2ochat-reference invariant. Relink + tombstone-override stay
// deferred (see RELINK_FORBIDDEN_NAMES).
const RESTORE_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-restore.studio.js';
const RELINK_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-relink.studio.js';
const HEALTH_UI_REL = 'src-surfaces-base/studio/ingestion/archive-health-ui.studio.js';
// Files that legitimately reference .h2ochat: the WRITER, the read-only DIAGNOSTICS,
// the read-only INSPECTOR (H.2), the verification-gated IMPORTER (H.4), the bounded
// Desktop EXPORTER (J.2), the verification-gated RESTORE module (K.2), and the
// planned verification-gated RELINK module (K.4).
// No other module may reference it.
const ALLOWED_H2OCHAT = new Set([
  'src-surfaces-base/studio/ingestion/saved-chat-package-v1.tauri.js',
  'src-surfaces-base/studio/ingestion/saved-chat-archive-diagnostics.tauri.js',
  'src-surfaces-base/studio/ingestion/saved-chat-archive-inspector.studio.js',
  'src-surfaces-base/studio/ingestion/saved-chat-archive-importer.studio.js',
  'src-surfaces-base/studio/ingestion/saved-chat-archive-exporter.studio.js',
  RESTORE_REL,
  RELINK_REL,
]);
// Legacy placeholder import/recovery entry-point names we deliberately did NOT use
// (H.4 uses the cleaner dryRunImportPackage / importVerifiedPackage). These must
// not appear anywhere in the studio tree.
const FORBIDDEN_IMPORTER_NAMES = [
  'importSavedChatPackage', 'recoverSavedChat', 'openSavedChatPackage', 'importSavedChatArchivePackage',
];
// The REAL H.4 import/recovery entry points. They may exist ONLY in the importer
// module — never leaked into the writer/diagnostics/inspector/scanner/materializer
// or the Chrome reader.
const IMPORTER_ENTRY_NAMES = ['dryRunImportPackage', 'importVerifiedPackage'];
// Broad/placeholder .h2ochat EXPORT / share entry points remain forbidden. J.2
// allows only the bounded Desktop archiveExporter module with these explicit
// names.
const FORBIDDEN_EXPORT_NAMES = [
  'exportSavedChatPackage', 'shareSavedChatPackage', 'exportSavedChatArchivePackage',
  'copySavedChatPackageToExport',
];
const EXPORTER_ENTRY_NAMES = ['archiveExporter', 'dryRunExportPackage', 'exportVerifiedPackage'];
// Planned K (restore-original-ids) entry points. They may exist ONLY in the restore
// module once K.2 lands — never leaked elsewhere. Absent in K.1. (Namespace-qualified
// so bare `archiveRestore` does not collide with unrelated sync-lane identifiers like
// archiveRestoreInstalled.)
const RESTORE_ENTRY_NAMES = ['H2O.Studio.archiveRestore', 'dryRunRestorePackage', 'restoreVerifiedPackage'];
// Planned K.4 relink entry points. They may exist ONLY in the future relink module.
// Tombstone override/undelete remains deferred everywhere.
const RELINK_ENTRY_NAMES = ['H2O.Studio.archiveRelink', 'dryRunRelinkPackage', 'relinkVerifiedPackage'];

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
const importerSrc = exists(IMPORTER_REL) ? readRepo(IMPORTER_REL) : '';
const importerCode = stripComments(importerSrc);
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

check('[INVARIANT] .h2ochat referenced only by writer/diagnostics/inspector/importer/exporter; import entry points confined to the importer', () => {
  const offenders = [];
  for (const abs of walkJs(path.join(REPO_ROOT, STUDIO_DIR_REL))) {
    if (stripComments(fs.readFileSync(abs, 'utf8')).includes(PACKAGE_EXT)) {
      const rel = path.relative(REPO_ROOT, abs);
      if (!ALLOWED_H2OCHAT.has(rel)) offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, [], '.h2ochat referenced outside writer/diagnostics/inspector/importer/exporter (unexpected reader?): ' + offenders.join(', '));
  // Legacy placeholder names must not appear anywhere.
  for (const abs of walkJs(path.join(REPO_ROOT, STUDIO_DIR_REL))) {
    const code = stripComments(fs.readFileSync(abs, 'utf8'));
    for (const name of FORBIDDEN_IMPORTER_NAMES) {
      assert.ok(!code.includes(name), 'unexpected legacy import entry-point name: ' + name + ' in ' + path.relative(REPO_ROOT, abs));
    }
  }
  // The real H.4 import entry points may live ONLY in the importer module.
  for (const abs of walkJs(path.join(REPO_ROOT, STUDIO_DIR_REL))) {
    const rel = path.relative(REPO_ROOT, abs);
    if (rel === IMPORTER_REL) continue;
    const code = stripComments(fs.readFileSync(abs, 'utf8'));
    for (const name of IMPORTER_ENTRY_NAMES) {
      assert.ok(!code.includes(name), 'import entry point leaked outside the importer module: ' + name + ' in ' + rel);
    }
  }
  // The planned K restore/relink entry points may live ONLY in their dedicated
  // modules. This keeps importer/exporter/restore roles separated.
  for (const abs of walkJs(path.join(REPO_ROOT, STUDIO_DIR_REL))) {
    const rel = path.relative(REPO_ROOT, abs);
    const code = stripComments(fs.readFileSync(abs, 'utf8'));
    if (rel !== RESTORE_REL) {
      for (const name of RESTORE_ENTRY_NAMES) {
        assert.ok(!code.includes(name), 'restore entry point leaked outside the restore module: ' + name + ' in ' + rel);
      }
    }
    if (rel !== RELINK_REL) {
      for (const name of RELINK_ENTRY_NAMES) {
        assert.ok(!code.includes(name), 'relink entry point leaked outside the relink module: ' + name + ' in ' + rel);
      }
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

// --- D. H.4 verification-gated, no-overwrite import/recovery action ----------

console.log('[archive-recovery-import-export] H.4 importer checks');

check('[H.4] importer module exists, registers archiveImporter (dry-run + import + pure turn builder); health UI delegates the mount', () => {
  assert.ok(exists(IMPORTER_REL), 'importer module missing');
  assert.match(importerSrc, /H2O\.Studio\.archiveImporter\s*=/);
  assert.match(importerSrc, /function dryRunImportPackage\s*\(/);
  assert.match(importerSrc, /function importVerifiedPackage\s*\(/);
  assert.match(importerSrc, /function buildTurnsFromPackageSnapshot\s*\(/);
  assert.match(importerSrc, /mountArchiveImporterCard/);
  assert.ok(healthUiCode.includes('mountArchiveImporterCard'), 'health UI must delegate to the importer mount');
});

check('[H.4] importer is Desktop-only and gated on the store adapters (detectTauri + isDesktopCapable + snapshots/chats stores)', () => {
  assert.match(importerCode, /function detectTauri\s*\(/);
  assert.match(importerCode, /__TAURI_INTERNALS__|__TAURI__/);
  assert.match(importerCode, /function isDesktopCapable\s*\(/);
  assert.ok(importerCode.includes('getSnapshotsStore') && importerCode.includes('getChatsStore'),
    'importer must require the Desktop snapshots + chats store adapters');
});

check('[H.4] importer reuses the read-only inspector for verification (archiveInspector + inspectPackage)', () => {
  assert.ok(importerCode.includes('archiveInspector'), 'importer must use the inspector');
  assert.ok(importerCode.includes('inspectPackage'), 'importer must verify via inspectPackage');
});

check('[H.4] dry-run is NON-MUTATING (no create/upsert/SQL/fs-write inside dryRunImportPackage)', () => {
  const body = (importerCode.split(/function\s+dryRunImportPackage\s*\(/)[1] || '')
    .split(/function\s+generateRecoveredChatId\s*\(/)[0] || '';
  assert.ok(body.length > 0, 'could not isolate dryRunImportPackage body');
  for (const banned of ['.create(', '.upsert(', 'plugin:sql|', 'plugin:fs|write', 'INSERT INTO', 'UPDATE ']) {
    assert.ok(!body.includes(banned), 'dry-run must not write (found: ' + banned + ')');
  }
  // dry-run reads existing state only
  assert.ok(/\.get\(|\.listByChat\(/.test(body), 'dry-run must read store state (get / listByChat)');
});

check('[H.4] import is verification-gated (requires import-ready, re-verifies, refuses partial/empty)', () => {
  assert.ok(importerCode.includes('dryRunImportPackage'), 'import must consult the dry-run');
  assert.ok(importerCode.includes("'import-ready'") || importerCode.includes('import-ready'), 'import gates on import-ready');
  assert.match(importerCode, /status[^;]*!==\s*'verified'|'verified'/, 'import re-verifies the package');
  assert.ok(importerCode.includes('already-imported'), 'already-imported documented no-op');
  assert.ok(/no turns|refusing partial|partial import/i.test(importerSrc), 'import must refuse an empty/partial payload');
});

check('[H.4] NO-OVERWRITE by construction: import-as-new via snapshots.create with a fresh id; the overwrite-by-id primitive is never used; original ids never reused for a write', () => {
  assert.ok(/snapStore\.create\(|snapshots\.create\(/.test(importerCode), 'import-as-new must use snapshots.create (fresh id)');
  assert.ok(!/snapStore\.upsert\(|snapshots\.upsert\(/.test(importerCode), 'must never call the snapshot overwrite-by-id primitive');
  assert.ok(importerCode.includes('generateRecoveredChatId'), 'recovered chat id must be freshly generated');
  assert.ok(importerSrc.includes('refusing to reuse original id'), 'must guard against reusing the package original ids');
  // the snapshot create patch must not carry a snapshotId (which would route to overwrite)
  assert.doesNotMatch(importerCode, /create\(\{[^}]*snapshotId/s, 'snapshot create patch must not set snapshotId');
});

check('[H.4] importer writes ONLY through the store adapters (no raw SQL, no fs write, no package overwrite)', () => {
  for (const banned of ['plugin:sql|execute', 'plugin:sql|', 'plugin:fs|write', 'writeSavedChatPackageV1', MATERIALIZE_API]) {
    assert.ok(!importerCode.includes(banned), 'importer must not bypass the store adapters (found: ' + banned + ')');
  }
  assert.doesNotMatch(importerCode, /\bINSERT\s+INTO\b|\bUPDATE\b[^=]/i, 'importer must not write raw SQL');
});

check('[H.4] restore/relink deferred + import-as-new records provenance + full decision vocabulary present', () => {
  assert.ok(importerCode.includes('restore-relink-deferred'), 'restore/relink must be deferred');
  for (const prov of ['recovered', 'originalChatId', 'originalSnapshotId', 'recoveredAt']) {
    assert.ok(importerCode.includes(prov), 'provenance field missing: ' + prov);
  }
  for (const st of ['import-ready', 'already-imported', 'conflict-chat-id', 'conflict-snapshot-id', 'corrupted', 'unsupported-version', 'rejected', 'imported']) {
    assert.ok(importerCode.includes(st), 'decision/state missing: ' + st);
  }
});

check('[H.4] importer executes no package HTML and has no watcher/scanner/Chrome/sync coupling', () => {
  assert.doesNotMatch(importerCode, /\beval\s*\(/, 'no eval');
  assert.doesNotMatch(importerCode, /new\s+Function\s*\(/, 'no new Function');
  assert.doesNotMatch(importerCode, /readPackageTextFile\([^)]*['"]chat\.html['"]/, 'importer must not read chat.html');
  for (const banned of ['setInterval', 'MutationObserver', 'requestAnimationFrame', 'requestIdleCallback',
    'scanSavedChatArchiveRequestInboxV1', 'chrome.runtime', 'connectNative', 'sendNativeMessage',
    'H2O.Studio.sync', 'webdav', 'WebDAV', 'ws://', 'wss://']) {
    assert.ok(!importerCode.includes(banned), 'importer must not couple to: ' + banned);
  }
});

check('[INVARIANT] bounded .h2ochat export runtime exists only in archiveExporter; broad placeholders remain forbidden', () => {
  const exporterPath = path.join(REPO_ROOT, EXPORTER_REL);
  assert.ok(fs.existsSync(exporterPath), 'J.2 exporter module must exist');
  const exporter = stripComments(fs.readFileSync(exporterPath, 'utf8'));
  assert.ok(exporter.includes('H2O.Studio.archiveExporter'), 'exporter must register H2O.Studio.archiveExporter');
  for (const name of EXPORTER_ENTRY_NAMES) {
    assert.ok(exporter.includes(name), 'exporter entry point missing: ' + name);
  }
  assert.ok(exporter.includes('H2O Studio Exports'), 'exporter must use the bounded export root');
  assert.ok(exporter.includes('inspectPackage'), 'exporter must verify via inspectPackage');
  assert.ok(healthUiCode.includes('mountArchiveExporterCard'), 'health UI must delegate to the exporter mount');
  for (const abs of walkJs(path.join(REPO_ROOT, STUDIO_DIR_REL))) {
    const code = stripComments(fs.readFileSync(abs, 'utf8'));
    for (const name of FORBIDDEN_EXPORT_NAMES) {
      assert.ok(!code.includes(name), 'forbidden broad package export entry point exists: ' + name + ' in ' + path.relative(REPO_ROOT, abs));
    }
    const rel = path.relative(REPO_ROOT, abs);
    if (rel !== EXPORTER_REL) {
      for (const name of EXPORTER_ENTRY_NAMES) {
        if (rel === HEALTH_UI_REL && name === 'archiveExporter') continue;
        assert.ok(!code.includes(name), 'bounded exporter entry leaked outside exporter module: ' + name + ' in ' + rel);
      }
    }
  }
});

console.log('');
if (FAIL.length) {
  console.error(`[archive-recovery-import-export] ${FAIL.length} failed, ${PASS.length} passed`);
  process.exitCode = 1;
} else {
  console.log(`[archive-recovery-import-export] PASS ${PASS.length} checks`);
}
