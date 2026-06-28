#!/usr/bin/env node
// F.1 — Saved-chat archive MATERIALIZER TRIGGER BOUNDARY validator (static).
//
// The materializer itself (D.2C) already exists and is behaviorally covered by
// validate-saved-chat-archive-materializer-v1.mjs. This validator does NOT
// re-test materializer internals. It locks the Phase F *trigger boundary*
// before any operator UI is added: it asserts the cross-module invariants that
// must hold while a validated request becomes a materialized package, and the
// F.1 phase-gates that prove no trigger has been wired prematurely.
//
// Checks are labeled [INVARIANT] (must always hold) or [F.1-GATE] (a
// point-in-time lock that a later phase, e.g. F.2's operator action, will
// intentionally flip and update here).
//
// Static only: reads source, asserts patterns. No runtime, no imports of
// runtime modules, no DB, no network.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const MATERIALIZER_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-materializer.tauri.js';
const SCANNER_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-request-inbox.tauri.js';
const DIAGNOSTICS_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-diagnostics.tauri.js';
const HEALTH_UI_REL = 'src-surfaces-base/studio/ingestion/archive-health-ui.studio.js';
const DELIVERY_MV3_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-request-delivery.mv3.js';
const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
const S0F0J_REL = 'src-surfaces-base/studio/S0F0j. 🎬 Library Actions Core - Studio.js';
const S0F1J_REL = 'src-surfaces-base/studio/S0F1j. 🎬 Library Actions - Studio.js';

const MATERIALIZE_API = 'materializeSavedChatArchiveRequestV1';
// Chrome intent / read-back / badge APIs the Desktop materializer must never call.
const CHROME_APIS = [
  'deliverSavedChatArchiveRequestV1',
  'readSavedChatArchiveRequestReceiptV1',
  'refreshSavedChatArchiveRequestStatusV1',
  'computeSavedChatArchiveStatusV1',
  'appendSavedChatArchiveStatusBadgeV1',
  'maybeDeliverSavedChatArchiveOnSaveToFolderV1',
];
// The full materializer result-status vocabulary (the trigger result contract).
const RESULT_VOCAB = [
  'written',
  'already-written',
  'failed',
  'needs-desktop-snapshot',
  'db-unavailable',
  'not-eligible',
  'not-found',
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

const matSrc = readRepo(MATERIALIZER_REL);
const matCode = stripComments(matSrc);
const scannerCode = stripComments(readRepo(SCANNER_REL));
const diagCode = stripComments(readRepo(DIAGNOSTICS_REL));
const healthUiCode = stripComments(readRepo(HEALTH_UI_REL));
const deliveryMv3Code = stripComments(readRepo(DELIVERY_MV3_REL));
const studioHtml = readRepo(STUDIO_HTML_REL);
const s0f0j = readRepo(S0F0J_REL);
const s0f1j = readRepo(S0F1J_REL);

console.log('[archive-materializer-trigger] F.1 boundary checks');

// --- A. Trigger surface exists & is Desktop-only ----------------------------

check('[INVARIANT] materializer module exists and registers ' + MATERIALIZE_API + ' under ingestion', () => {
  assert.ok(exists(MATERIALIZER_REL), 'materializer module missing');
  assert.match(matSrc, new RegExp('H2O\\.Studio\\.ingestion\\.' + MATERIALIZE_API + '\\s*='));
  assert.ok(studioHtml.includes('./ingestion/saved-chat-archive-materializer.tauri.js'), 'studio.html does not load the materializer');
});

check('[INVARIANT] materializer is Desktop/Tauri-only (detectTauri gate, returns when not Tauri)', () => {
  assert.match(matCode, /function detectTauri\s*\(/);
  assert.match(matCode, /__TAURI_INTERNALS__|__TAURI__/);
  assert.match(matCode, /if \(!detectTauri\(\)\) return;/);
});

// --- B. Eligibility contract ------------------------------------------------

check('[INVARIANT] only `validated` is eligible; `written` -> already-written; every other state -> not-eligible; absent -> not-found', () => {
  assert.match(matCode, /STATUS_VALIDATED\s*=\s*['"]validated['"]/);
  assert.match(matCode, /STATUS_WRITTEN\s*=\s*['"]written['"]/);
  // written short-circuits to already-written (idempotent, no writer call)
  assert.match(matCode, /previousStatus\s*===\s*STATUS_WRITTEN/);
  assert.ok(hasStr(matCode, 'already-written'), 'already-written branch missing');
  // anything not validated -> not-eligible (so failed/duplicate/needs-desktop-snapshot/rejected are all rejected)
  assert.match(matCode, /previousStatus\s*!==\s*STATUS_VALIDATED/);
  assert.ok(hasStr(matCode, 'not-eligible'), 'not-eligible branch missing');
  assert.ok(hasStr(matCode, 'not-found'), 'not-found branch missing');
  // re-resolution must also re-validate before writing
  assert.match(matCode, /reStatus\s*!==\s*STATUS_VALIDATED/);
  // there must be NO branch that accepts failed/duplicate as eligible-to-write
  assert.doesNotMatch(matCode, /previousStatus\s*===\s*STATUS_FAILED/, 'failed must not be a write-eligible branch');
  assert.doesNotMatch(matCode, /===\s*['"]duplicate['"]/, 'duplicate must not be a write-eligible branch');
});

check('[INVARIANT] full materializer result-status vocabulary is present', () => {
  for (const s of RESULT_VOCAB) {
    const constName = 'STATUS_' + s.toUpperCase().replace(/-/g, '_');
    assert.ok(hasStr(matCode, s) || matCode.includes(constName), `result status missing: ${s}`);
  }
});

// --- C. Writer boundary -----------------------------------------------------

check('[INVARIANT] writeSavedChatPackageV1 is the only writer, called once, with snapshotId + overwrite:false, no content leak', () => {
  const callMatch = matCode.match(/writeSavedChatPackageV1\s*\(\s*\{[^}]*\}\s*\)/);
  assert.ok(callMatch, 'writer call not found');
  const callArgs = callMatch[0];
  assert.match(callArgs, /snapshotId\s*:/);
  assert.match(callArgs, /overwrite\s*:\s*false/);
  for (const banned of ['targetDir', 'targetFolder', 'packagePath', 'manifest', 'contentHash', 'html', 'assets', 'envelope', 'request:', 'payload', 'normalized']) {
    assert.ok(!callArgs.includes(banned), `writer call leaked a non-authoritative source field: ${banned}`);
  }
  assert.equal((matCode.match(/writeSavedChatPackageV1\s*\(/g) || []).length, 1, 'writer must be called exactly once');
});

check('[INVARIANT] overwrite defaults false in the trigger API surface', () => {
  assert.match(matSrc, new RegExp(MATERIALIZE_API + '\\([^)]*overwrite\\s*=\\s*false'));
});

check('[INVARIANT] materializer mutates ONLY saved_chat_archive_requests (no INSERT/DELETE/migration); status+meta_json.materialization patch', () => {
  assert.match(matCode, /var QUEUE_TABLE\s*=\s*['"]saved_chat_archive_requests['"]/);
  assert.doesNotMatch(matCode, /\bINSERT\s+INTO\b|\bDELETE\s+FROM\b|\bUPSERT\b/i, 'no INSERT/DELETE allowed');
  assert.doesNotMatch(matCode, /CREATE\s+TABLE|ALTER\s+TABLE|plugin:sql\|load|MigrationKind/i, 'no migration allowed');
  const updates = matCode.match(/UPDATE\b[^\n]{0,50}/gi) || [];
  assert.ok(updates.length >= 1, 'expected at least one queue UPDATE');
  for (const u of updates) {
    assert.ok(/QUEUE_TABLE/.test(u) || /saved_chat_archive_requests/i.test(u), `UPDATE targets a non-queue table: ${u}`);
  }
  assert.match(matCode, /materialization/);
});

// --- D. No Chrome / read-back coupling --------------------------------------

check('[INVARIANT] materializer does not call any Chrome delivery/read-back/status/badge API', () => {
  for (const api of CHROME_APIS) {
    assert.ok(!matCode.includes(api), `materializer must not reference Chrome API: ${api}`);
  }
});

check('[INVARIANT] materializer result marks chromeRuntime:false, syncTransport:false, packageWriteDeferred:false', () => {
  assert.match(matCode, /chromeRuntime:\s*false/);
  assert.match(matCode, /syncTransport:\s*false/);
  assert.match(matCode, /packageWriteDeferred:\s*false/);
});

check('[INVARIANT] Chrome delivery (mv3) performs no package/CAS/SQLite write and never calls the materializer', () => {
  assert.ok(!deliveryMv3Code.includes(MATERIALIZE_API), 'Chrome delivery must not call the materializer');
  assert.ok(!deliveryMv3Code.includes('writeSavedChatPackageV1'), 'Chrome delivery must not call the package writer');
  assert.doesNotMatch(deliveryMv3Code, /plugin:sql\|/, 'Chrome delivery must not touch Desktop SQLite');
  for (const banned of ['putAssetBytes', 'getAssetBytes', 'asset-cas', 'plugin:fs|write']) {
    assert.ok(!deliveryMv3Code.includes(banned), `Chrome delivery must not write: ${banned}`);
  }
});

// --- E. Scanner stays enqueue-only ------------------------------------------

check('[INVARIANT] scanner stays enqueue-only: packageWriteDeferred:true, materializeTriggered:false, never materializeTriggered:true', () => {
  assert.match(scannerCode, /packageWriteDeferred:\s*true/);
  assert.match(scannerCode, /materializeTriggered:\s*false/);
  assert.doesNotMatch(scannerCode, /materializeTriggered:\s*true/, 'scanner must not flip materializeTriggered true');
});

check('[INVARIANT] scanner does not invoke the materializer or the package writer', () => {
  assert.ok(!scannerCode.includes(MATERIALIZE_API), 'scanner must not call the materializer');
  assert.ok(!scannerCode.includes('writeSavedChatPackageV1'), 'scanner must not call the package writer');
});

// --- F. No watcher / poller / daemon ----------------------------------------

check('[INVARIANT] no automatic watcher/poller/daemon in the materializer or scanner', () => {
  for (const [name, code] of [['materializer', matCode], ['scanner', scannerCode]]) {
    for (const banned of ['setInterval', 'MutationObserver', 'requestAnimationFrame']) {
      assert.ok(!code.includes(banned), `${name} must not use ${banned}`);
    }
  }
});

// --- G. No sync / webdav / native messaging / localhost relay ----------------

check('[INVARIANT] materializer has no sync/webdav/native-messaging/localhost-relay coupling', () => {
  for (const banned of [
    'H2O.Studio.sync', 'webdav', 'WebDAV',
    'connectNative', 'sendNativeMessage', 'chrome.runtime',
    'localhost', '127.0.0.1', 'ws://', 'wss://', 'fetch(',
    'service-worker', 'serviceWorker',
  ]) {
    assert.ok(!matCode.includes(banned), `materializer must not couple to: ${banned}`);
  }
});

// --- H. No premature trigger / UI (F.1 phase-gates) -------------------------

check('[F.1-GATE] no operator trigger wired yet: Archive Health UI helper does not call the materializer', () => {
  assert.ok(!healthUiCode.includes(MATERIALIZE_API), 'Archive Health UI must not call the materializer until F.2 adds the contracted operator action');
});

check('[F.1-GATE] Archive diagnostics remains read-only: does not call the materializer', () => {
  assert.ok(!diagCode.includes(MATERIALIZE_API), 'diagnostics must not call the materializer');
});

check('[F.1-GATE] library action mega-files (S0F0j / S0F1j) do not wire the materializer', () => {
  assert.ok(!s0f0j.includes(MATERIALIZE_API), 'S0F0j must not wire the materializer');
  assert.ok(!s0f1j.includes(MATERIALIZE_API), 'S0F1j must not wire the materializer');
});

console.log('');
if (FAIL.length) {
  console.error(`[archive-materializer-trigger] ${FAIL.length} failed, ${PASS.length} passed`);
  process.exitCode = 1;
} else {
  console.log(`[archive-materializer-trigger] PASS ${PASS.length} checks`);
}
