#!/usr/bin/env node
// G.1 — Saved-chat archive AUTO-MATERIALIZATION TRIGGER CONTRACT validator (static).
//
// G.0 (contract 558a653) decided that automatic materialization, if added, is an
// explicit, Desktop-only, BOUNDED operator "Materialize validated" batch (option
// C) that keeps the scanner enqueue-only and reuses the F.2/F.3 building blocks —
// NOT a scanner-coupled flag (B), NOT a background daemon/watcher (D). G.1 locked
// that contract; G.2 then added the bounded "Materialize validated" batch action.
// This validator now asserts BOTH the G.0 contract and the G.2 batch
// implementation (bounded default 10 / cap 50, sequential, scanner-free,
// overwrite-never, result-count summary), while the standing boundaries hold
// (scanner enqueue-only, Chrome read-back only, F.4 sidecar still deferred).
//
//   [G.1]       = the auto-materialization trigger contract (G.0 doc assertions).
//   [G.2]       = the bounded "Materialize validated" batch implementation.
//   [INVARIANT] = boundaries that must hold now and after G.3.
//
// Static only: reads source/doc text, asserts patterns. No runtime, no imports of
// runtime modules, no DB, no network. When G.3 / any future change lands, update
// this validator in lock-step.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const G0_CONTRACT_REL = 'release-evidence/2026-06-24/saved-chat-archive-phase-g0-auto-materialization-trigger-contract.md';
const F41_VALIDATOR_REL = 'tools/validation/studio/validate-saved-chat-archive-package-written-status-v1.mjs';
const STATUS_MODEL_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-status.studio.js';
const DELIVERY_MV3_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-request-delivery.mv3.js';
const MATERIALIZER_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-materializer.tauri.js';
const SCANNER_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-request-inbox.tauri.js';
const ACTION_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-materializer-action.studio.js';
const S0F0J_REL = 'src-surfaces-base/studio/S0F0j. 🎬 Library Actions Core - Studio.js';
const S0F1J_REL = 'src-surfaces-base/studio/S0F1j. 🎬 Library Actions - Studio.js';
const STUDIO_DIR_REL = 'src-surfaces-base/studio';

const MATERIALIZE_API = 'materializeSavedChatArchiveRequestV1';
const SIDECAR_FILE = 'materialization.receipt.json';

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

const g0 = exists(G0_CONTRACT_REL) ? readRepo(G0_CONTRACT_REL) : '';
const statusModel = stripComments(readRepo(STATUS_MODEL_REL));
const readerCode = stripComments(readRepo(DELIVERY_MV3_REL));
const matCode = stripComments(readRepo(MATERIALIZER_REL));
const scannerCode = stripComments(readRepo(SCANNER_REL));
const actionSrc = readRepo(ACTION_REL);
const actionCode = stripComments(actionSrc);
/* The governed inbox scanner. G.0 forbids the BATCH from reaching it, not the
 * file from naming it: the explicit operator intake control calls it by design. */
const SCANNER_API = 'scanSavedChatArchiveRequestInboxV1';
const s0f0j = readRepo(S0F0J_REL);
const s0f1j = readRepo(S0F1J_REL);

console.log('[archive-auto-materialization-trigger] G.1 contract checks');

// --- A. G.0 contract (the auto-materialization trigger policy) ---------------

check('[G.1] G.0 contract evidence file exists', () => {
  assert.ok(exists(G0_CONTRACT_REL), 'missing ' + G0_CONTRACT_REL);
});

check('[G.1] G.0 is marked PHASE G.0 CONTRACT — NOT IMPLEMENTED', () => {
  assert.match(g0, /PHASE G\.0 CONTRACT\s*[—-]\s*NOT IMPLEMENTED/);
});

check('[G.1] G.0 recommends option C: bounded Desktop-only "Materialize validated" operator batch', () => {
  assert.ok(g0.includes('option C'), 'must reference option C');
  assert.ok(g0.includes('Materialize validated'), 'must name the "Materialize validated" batch');
  assert.ok(/bounded/i.test(g0) && g0.includes('Desktop-only'), 'must be a bounded Desktop-only batch');
});

check('[G.1] G.0 keeps the scanner enqueue-only', () => {
  assert.ok(g0.includes('enqueue-only'), 'must keep the scanner enqueue-only');
});

check('[G.1] G.0 rejects background watcher/daemon materialization', () => {
  assert.ok(/reject/i.test(g0), 'must reject some option');
  assert.ok(g0.includes('daemon') && g0.includes('watcher'), 'must reject watcher/daemon');
});

check('[G.1] G.0 defers the scanner-coupled materializeValidated:true flag (option B)', () => {
  assert.ok(g0.includes('materializeValidated'), 'must reference the materializeValidated flag');
  assert.ok(/defer/i.test(g0), 'must defer option B');
});

check('[G.1] G.0 keeps Chrome intent / read-back only', () => {
  assert.ok(g0.includes('Chrome remains intent / read-back only'), 'must keep Chrome intent/read-back only');
});

check('[G.1] G.0 defines eligibility (validated; written->already-written; dup/rejected/needs-snapshot not-eligible; failed not auto-re-armed)', () => {
  assert.ok(g0.includes('validated'), 'must define validated eligibility');
  assert.ok(g0.includes('already-written'), 'must define written -> already-written idempotency');
  assert.ok(g0.includes('not-eligible'), 'must define not-eligible states');
  assert.ok(g0.includes('needs-desktop-snapshot'), 'must list needs-desktop-snapshot as not eligible');
  assert.ok(/auto-re-armed|not retried/i.test(g0), 'must state failed is not auto-re-armed / counted-not-retried');
});

check('[G.1] G.0 requires overwrite:false always', () => {
  assert.ok(/overwrite:false/i.test(g0), 'must require overwrite:false');
});

check('[G.1] G.0 requires a bounded per-run limit and hard cap', () => {
  assert.ok(g0.includes('Per-run limit'), 'must require a per-run limit');
  assert.ok(/hard-cap/i.test(g0), 'must require a hard cap');
  assert.ok(/bounded/i.test(g0), 'limit must be bounded');
});

check('[G.1] G.0 requires a result-count summary (written / already-written / failed / not-eligible)', () => {
  assert.ok(/Result summary/i.test(g0), 'must require a result summary');
  for (const t of ['written', 'already-written', 'failed', 'not-eligible']) {
    assert.ok(g0.includes(t), 'result summary must count: ' + t);
  }
});

check('[G.1] G.0 requires sequential/bounded execution with no infinite retry loop', () => {
  assert.ok(/sequential/i.test(g0), 'must require sequential/bounded execution');
  assert.ok(/no infinite retry/i.test(g0), 'must forbid an infinite retry loop');
});

// --- B. Current runtime is pre-implementation (no batch action yet) ----------

check('[INVARIANT] scanner still does NOT call the materializer', () => {
  assert.ok(!scannerCode.includes(MATERIALIZE_API), 'scanner must not call the materializer (option B is deferred)');
});

check('[INVARIANT] scanner stays enqueue-only: packageWriteDeferred:true, materializeTriggered:false, no package write', () => {
  assert.match(scannerCode, /packageWriteDeferred:\s*true/);
  assert.match(scannerCode, /materializeTriggered:\s*false/);
  assert.ok(!scannerCode.includes('writeSavedChatPackageV1'), 'scanner must not write packages');
});

check('[INVARIANT] F.2 single-request operator action remains Desktop-only and explicit', () => {
  assert.match(actionSrc, /H2O\.Studio\.archiveMaterializerAction\s*=/);
  assert.match(actionCode, /function detectTauri\s*\(/);
  assert.ok(actionCode.includes('isDesktopCapable'), 'F.2 action must remain Desktop capability-gated');
  assert.ok(actionCode.includes(MATERIALIZE_API), 'F.2 action must invoke the materializer for an explicit requestId');
});

check('[INVARIANT] no Chrome runtime/service-worker references the materializer or package writer', () => {
  assert.ok(!readerCode.includes(MATERIALIZE_API), 'Chrome reader must not call the materializer');
  assert.ok(!readerCode.includes('writeSavedChatPackageV1'), 'Chrome reader must not call the package writer');
  assert.doesNotMatch(readerCode, /plugin:sql\|/, 'Chrome reader must not touch Desktop SQLite');
});

check('[INVARIANT] library action mega-files (S0F0j / S0F1j) do not reference the auto-materialization path', () => {
  for (const [name, src] of [['S0F0j', s0f0j], ['S0F1j', s0f1j]]) {
    for (const banned of [MATERIALIZE_API, 'materializeValidated', 'Materialize validated']) {
      assert.ok(!src.includes(banned), name + ' must not reference: ' + banned);
    }
  }
});

check('[INVARIANT] no webdav/cloud/sync/native-messaging/localhost relay in the trigger modules', () => {
  for (const [name, code] of [['materializer', matCode], ['scanner', scannerCode], ['F.2 action', actionCode]]) {
    for (const banned of ['webdav', 'WebDAV', 'connectNative', 'sendNativeMessage',
      'H2O.Studio.sync', 'localhost', '127.0.0.1', 'ws://', 'wss://']) {
      assert.ok(!code.includes(banned), name + ' must not couple to: ' + banned);
    }
  }
});

check('[INVARIANT] no polling/watcher/daemon tokens in the trigger modules (materializer / scanner / F.2 action)', () => {
  for (const [name, code] of [['materializer', matCode], ['scanner', scannerCode], ['F.2 action', actionCode]]) {
    for (const banned of ['setInterval', 'setTimeout', 'MutationObserver', 'requestAnimationFrame', 'requestIdleCallback']) {
      assert.ok(!code.includes(banned), name + ' must not poll/watch: ' + banned);
    }
  }
});

check('[INVARIANT] package-written Chrome sidecar/read-back remains deferred (F.4.1 lock intact)', () => {
  assert.ok(exists(F41_VALIDATOR_REL), 'F.4.1 package-written-status validator must still exist');
  // no runtime file implements the materialization sidecar
  const offenders = [];
  for (const abs of walkJs(path.join(REPO_ROOT, STUDIO_DIR_REL))) {
    if (stripComments(fs.readFileSync(abs, 'utf8')).includes(SIDECAR_FILE)) offenders.push(path.relative(REPO_ROOT, abs));
  }
  assert.deepEqual(offenders, [], 'materialization sidecar must remain unimplemented; found: ' + offenders.join(', '));
  // status model still has no package-written substate
  assert.ok(!statusModel.includes('archived-package-written'), 'status model must not implement archived-package-written yet');
});

// --- C. G.2 bounded "Materialize validated" batch implementation -------------

check('[G.2] bounded batch action materializeValidatedBatch exists and is exported', () => {
  assert.match(actionSrc, /function materializeValidatedBatch\s*\(/);
  assert.match(actionSrc, /materializeValidatedBatch:\s*materializeValidatedBatch/);
});

check('[G.2] batch limits: default 10, hard cap 50, clamped', () => {
  assert.match(actionCode, /DEFAULT_BATCH_LIMIT\s*=\s*10\b/);
  assert.match(actionCode, /MAX_BATCH_LIMIT\s*=\s*50\b/);
  assert.match(actionCode, /Math\.min\(\s*MAX_BATCH_LIMIT/); // clamped to the hard cap
});

check('[G.2] batch lists VALIDATED rows via listSavedChatArchiveRequestsV1({ status:"validated" })', () => {
  assert.ok(actionCode.includes('listSavedChatArchiveRequestsV1'), 'must use the validated-rows listing API');
  assert.match(actionCode, /status:\s*['"]validated['"]/);
});

check('[G.2] batch routes each requestId through the materializer (materializeSavedChatArchiveRequestV1({ requestId }))', () => {
  assert.match(actionCode, new RegExp(MATERIALIZE_API + '\\s*\\(\\s*\\{\\s*requestId')); // single bounded path
  assert.match(actionCode, /materialize\(\s*\{\s*requestId:\s*row\.requestId/);            // per-row in the batch
});

check('[G.2] batch is sequential (reduce-chain, no parallel fan-out)', () => {
  assert.match(actionCode, /\.reduce\(/);
  assert.ok(!actionCode.includes('Promise.all'), 'batch must not fan out with Promise.all');
});

/* Extracts one function body by brace balance, so an assertion can be made
 * about the BATCH path specifically instead of the whole file. */
function functionBody(source, header) {
  const start = source.indexOf(header);
  if (start < 0) return null;
  const open = source.indexOf('{', start);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

/* Phase 5 lock-step update, mirroring the sibling trigger validator.
 *
 * The whole-file ban on the scanner symbol was a proxy for the real G.0 rule:
 * materialization must never be scanner-COUPLED, and the scanner must never run
 * by itself. That proxy was accurate only while nothing in the product invoked
 * the inbox at all -- which was also why a producer-delivered request could not
 * reach the queue through any operator action. The action card now carries a
 * separate, explicit "Scan request inbox" control, so the file legitimately
 * mentions the scanner. What stays forbidden is the batch calling it, and any
 * automatic invocation. Both are now asserted directly. */
check('[G.2] batch does not call the scanner and never passes overwrite:true', () => {
  assert.doesNotMatch(actionCode, /overwrite\s*:\s*true/, 'batch must not force overwrite');

  // (2)(3) The batch paths themselves must contain no scanner invocation.
  for (const header of ['function doMaterializeBatch', 'function materializeValidatedBatch']) {
    const body = functionBody(actionCode, header);
    assert.ok(body, `could not locate ${header}`);
    for (const token of [SCANNER_API, 'runIntake', 'scanRequestInbox', 'doScanInbox']) {
      assert.ok(!body.includes(token),
        `${header} must not reach the scanner (found ${token}) -- G.0 forbids scanner-coupled materialization`);
    }
  }

  // (6) And the explicit intake handler must not chain into materialization.
  const intake = functionBody(actionCode, 'function doScanInbox');
  assert.ok(intake, 'could not locate doScanInbox');
  assert.ok(!/materiali/i.test(intake), 'the intake action must never chain into materialization');
});

check('[G.2] the scanner is reachable ONLY from the explicit operator control', () => {
  // (1) The explicit intake action is allowed to reference the governed scanner.
  assert.ok(actionCode.includes(SCANNER_API), 'the explicit intake action must call the governed scanner');
  assert.match(actionCode, /data-archive-materializer-intake-run/, 'no explicit intake control is rendered');
  assert.match(actionCode, /intakeBtn[^;]*addEventListener\(\s*['"]click['"]\s*,\s*doScanInbox/,
    'intake must be bound to an explicit click');

  // The seam has exactly one call site, so no other path can reach it.
  const callSites = (actionCode.match(/runIntake\s*\(/g) || []).length;
  assert.equal(callSites, 1, `intake seam must have exactly one call site, found ${callSites}`);

  // (4)(5) No startup, load, watcher or polling path may invoke anything.
  for (const re of [
    /addEventListener\(\s*['"]load['"]/,
    /DOMContentLoaded/,
    /setInterval\s*\(/,
    /MutationObserver/,
    /requestIdleCallback/,
    /setTimeout\s*\([^)]*scan/i,
  ]) {
    assert.doesNotMatch(actionCode, re, `no automatic trigger may exist: ${re}`);
  }

  // (7) Materialize validated remains its own explicit operator action.
  assert.ok(actionCode.includes('Materialize validated'), 'the batch action must remain');
  assert.match(actionCode, /data-archive-materializer-batch-run/, 'the batch control must remain');
});

check('[G.2] batch exposes a result-count summary (written/already-written/failed/not-eligible/needs-desktop-snapshot/db-unavailable)', () => {
  for (const k of ['written', 'already-written', 'failed', 'not-eligible', 'needs-desktop-snapshot', 'db-unavailable']) {
    assert.ok(actionCode.includes("'" + k + "'"), 'batch count summary missing: ' + k);
  }
  for (const f of ['limit', 'total', 'attempted', 'results']) {
    assert.ok(actionCode.includes(f), 'batch summary missing field: ' + f);
  }
});

check('[G.2] batch is Desktop-gated and returns a safe empty result (no rows -> no materializer calls)', () => {
  assert.match(actionCode, /function materializeValidatedBatch[\s\S]*?if \(!isDesktopCapable\(\)\) return Promise\.resolve\(emptyBatchResult/);
  assert.match(actionCode, /if \(!list\.length\) return summary/);
});

console.log('');
if (FAIL.length) {
  console.error(`[archive-auto-materialization-trigger] ${FAIL.length} failed, ${PASS.length} passed`);
  process.exitCode = 1;
} else {
  console.log(`[archive-auto-materialization-trigger] PASS ${PASS.length} checks`);
}
