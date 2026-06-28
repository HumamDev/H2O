#!/usr/bin/env node
// F.4.1 — Saved-chat archive PACKAGE-WRITTEN STATUS CONTRACT validator (static).
//
// F.4 (contract 06ea40a) decided that Chrome's "Archived" keeps meaning "Desktop
// has durably captured/accepted the archive request", and that the F.3
// package-written reality is projected to Chrome ONLY (if/when F.4.2/F.4.3 ship)
// via an additive, immutable-scan-receipt + Desktop materialization SIDECAR
// receipt (receipts/<requestId>.materialization.receipt.json), read by Chrome as
// FILES ONLY. F.4.1 statically locks that contract: it asserts the contract doc
// says what it must, and that the CURRENT runtime still matches the
// pre-implementation state (no sidecar writer anywhere, no Chrome SQL/package/CAS
// authority, scanner enqueue-only, queued-on-desktop still renders "Archived").
//
//   [F.4.1]     = the new package-written status contract (doc assertions).
//   [INVARIANT] = boundaries that must hold now and after F.4.2/F.4.3.
//
// Static only: reads source/doc text, asserts patterns. No runtime, no imports of
// runtime modules, no DB, no network. It asserts that NO sidecar is implemented
// yet — this validator must be updated alongside F.4.2/F.4.3 when the sidecar and
// the Chrome read-back actually ship.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const F4_CONTRACT_REL = 'release-evidence/2026-06-24/saved-chat-archive-phase-f4-status-contract.md';
const STATUS_MODEL_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-status.studio.js';
const STATUS_BADGE_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-status-badge.studio.js';
const DELIVERY_MV3_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-request-delivery.mv3.js';
const MATERIALIZER_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-materializer.tauri.js';
const SCANNER_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-request-inbox.tauri.js';
const S0F0J_REL = 'src-surfaces-base/studio/S0F0j. 🎬 Library Actions Core - Studio.js';
const S0F1J_REL = 'src-surfaces-base/studio/S0F1j. 🎬 Library Actions - Studio.js';
const STUDIO_DIR_REL = 'src-surfaces-base/studio';

const MATERIALIZE_API = 'materializeSavedChatArchiveRequestV1';
// The additive Desktop projection the contract defines but F.4.1 must NOT yet implement.
const SIDECAR_FILE = 'materialization.receipt.json';
// The immutable enqueue receipt the contract must preserve.
const SCAN_RECEIPT_FILE = '<requestId>.receipt.json';
// The package-written vocabulary the contract must define.
const VOCAB = [
  'package-written',
  'archived-package-written',
  'Archived · package written',
  'queued-on-desktop',
  'archived',
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
function hasStr(text, s) { return text.includes("'" + s + "'") || text.includes('"' + s + '"'); }
function walkJs(absDir) {
  const out = [];
  for (const e of fs.readdirSync(absDir, { withFileTypes: true })) {
    const p = path.join(absDir, e.name);
    if (e.isDirectory()) out.push(...walkJs(p));
    else if (/\.js$/.test(e.name)) out.push(p);
  }
  return out;
}

const contract = exists(F4_CONTRACT_REL) ? readRepo(F4_CONTRACT_REL) : '';
const statusModel = stripComments(readRepo(STATUS_MODEL_REL));
const badgeCode = stripComments(readRepo(STATUS_BADGE_REL));
const readerCode = stripComments(readRepo(DELIVERY_MV3_REL));
const matCode = stripComments(readRepo(MATERIALIZER_REL));
const scannerCode = stripComments(readRepo(SCANNER_REL));
const s0f0j = readRepo(S0F0J_REL);
const s0f1j = readRepo(S0F1J_REL);

console.log('[archive-package-written-status] F.4.1 contract checks');

// --- A. F.4 contract document (the new package-written status contract) ------

check('[F.4.1] F.4 contract evidence file exists', () => {
  assert.ok(exists(F4_CONTRACT_REL), 'missing ' + F4_CONTRACT_REL);
});

check('[F.4.1] contract is marked NOT IMPLEMENTED (contract-only; no runtime yet)', () => {
  assert.match(contract, /F\.4 CONTRACT\s*[—-]\s*NOT IMPLEMENTED/);
});

check('[F.4.1] contract defines "Archived" = Desktop captured/accepted, NOT package-required', () => {
  assert.ok(contract.includes('"Archived" = durably captured on Desktop'),
    'contract must define Archived = durably captured on Desktop');
  assert.ok(/require a written|not a precondition/.test(contract),
    'contract must state a written package is not required for "Archived"');
});

check('[F.4.1] contract defines the additive materialization SIDECAR receipt', () => {
  assert.ok(contract.includes(SIDECAR_FILE),
    'contract must name receipts/<requestId>.' + SIDECAR_FILE);
  assert.ok(/additive sidecar/i.test(contract), 'contract must describe the sidecar as additive');
});

check('[F.4.1] contract keeps the scan receipt IMMUTABLE (the enqueue verdict)', () => {
  assert.ok(/scan receipt is immutable/i.test(contract), 'contract must keep the scan receipt immutable');
  assert.ok(contract.includes(SCAN_RECEIPT_FILE),
    'contract must reference receipts/' + SCAN_RECEIPT_FILE + ' as the scan receipt');
});

check('[F.4.1] contract defines the package-written status vocabulary', () => {
  for (const t of VOCAB) {
    assert.ok(contract.includes(t), 'contract vocabulary missing: ' + t);
  }
});

// --- B. Current Chrome read-back model is unchanged (pre-implementation) -----

check('[INVARIANT] status model still maps queued-on-desktop -> archived (no premature package-written)', () => {
  assert.match(statusModel, /case\s*['"]queued-on-desktop['"]\s*:\s*return\s*['"]archived['"]/);
  assert.ok(!statusModel.includes('archived-package-written'),
    'status model must not implement archived-package-written yet (F.4.3)');
  assert.ok(!statusModel.includes('package-written'),
    'status model must not implement package-written yet (F.4.3)');
});

check('[INVARIANT] Chrome receipt reader reads receipt FILES only (no SQLite/native/package/CAS body)', () => {
  // positive: reads receipt files through the granted Archive Request folder handle
  assert.ok(hasStr(readerCode, '.receipt.json'), 'reader must read .receipt.json files');
  assert.match(readerCode, /getFileHandle/);
  // negative: no Desktop SQLite, no native messaging, no package/CAS body, no materializer/writer
  for (const banned of ['plugin:sql|', 'connectNative', 'sendNativeMessage', MATERIALIZE_API,
    'writeSavedChatPackageV1', 'archive/packages', 'archive/assets', '.h2ochat']) {
    assert.ok(!readerCode.includes(banned), 'Chrome reader must not reference: ' + banned);
  }
});

// --- C. Desktop materializer / scanner stay pre-sidecar ----------------------

check('[INVARIANT] materializer writes NO Chrome-visible receipt/sidecar yet (DB + meta_json only)', () => {
  for (const banned of [SIDECAR_FILE, '.receipt.json', 'RECEIPTS_DIR', 'receipts/']) {
    assert.ok(!matCode.includes(banned), 'materializer must not write receipts (found: ' + banned + ')');
  }
  assert.match(matCode, /materialization/); // it still owns the DB meta_json.materialization projection
});

check('[INVARIANT] scanner stays enqueue-only: materializeTriggered:false, no auto-materialization', () => {
  assert.match(scannerCode, /materializeTriggered:\s*false/);
  assert.ok(!scannerCode.includes(MATERIALIZE_API), 'scanner must not auto-call the materializer');
});

// --- D. No sidecar implementation exists anywhere yet ------------------------

check('[INVARIANT] no runtime file under src-surfaces-base/studio writes the materialization sidecar', () => {
  const offenders = [];
  for (const abs of walkJs(path.join(REPO_ROOT, STUDIO_DIR_REL))) {
    const code = stripComments(fs.readFileSync(abs, 'utf8'));
    if (code.includes(SIDECAR_FILE)) offenders.push(path.relative(REPO_ROOT, abs));
  }
  assert.deepEqual(offenders, [], 'sidecar must be contract-only; found writer reference(s): ' + offenders.join(', '));
});

// --- E. Hard boundaries (must hold now and after F.4.2/F.4.3) ----------------

check('[INVARIANT] no Chrome runtime SQL/package/CAS authority (reader / status model / badge)', () => {
  for (const [name, code] of [['reader', readerCode], ['status model', statusModel], ['badge', badgeCode]]) {
    for (const banned of ['plugin:sql|', 'writeSavedChatPackageV1', '.h2ochat',
      'putAssetBytes', 'getAssetBytes', 'plugin:fs|write']) {
      assert.ok(!code.includes(banned), name + ' must not have package/CAS/SQLite authority: ' + banned);
    }
  }
});

check('[INVARIANT] no polling/watcher/daemon in the status / read-back path', () => {
  for (const [name, code] of [['status model', statusModel], ['reader', readerCode], ['badge', badgeCode]]) {
    for (const banned of ['setInterval', 'setTimeout', 'MutationObserver', 'requestAnimationFrame', 'requestIdleCallback']) {
      assert.ok(!code.includes(banned), name + ' must not poll/watch: ' + banned);
    }
  }
});

check('[INVARIANT] library action mega-files (S0F0j / S0F1j) do not wire the sidecar or package-written status', () => {
  for (const [name, src] of [['S0F0j', s0f0j], ['S0F1j', s0f1j]]) {
    for (const banned of [SIDECAR_FILE, 'archived-package-written', MATERIALIZE_API]) {
      assert.ok(!src.includes(banned), name + ' must not wire: ' + banned);
    }
  }
});

check('[INVARIANT] no webdav/cloud/sync/native-messaging/localhost relay in the F.4 status path', () => {
  for (const [name, code] of [['status model', statusModel], ['reader', readerCode], ['materializer', matCode]]) {
    for (const banned of ['webdav', 'WebDAV', 'connectNative', 'sendNativeMessage',
      'H2O.Studio.sync', 'localhost', '127.0.0.1', 'ws://', 'wss://']) {
      assert.ok(!code.includes(banned), name + ' must not couple to: ' + banned);
    }
  }
});

console.log('');
if (FAIL.length) {
  console.error(`[archive-package-written-status] ${FAIL.length} failed, ${PASS.length} passed`);
  process.exitCode = 1;
} else {
  console.log(`[archive-package-written-status] PASS ${PASS.length} checks`);
}
