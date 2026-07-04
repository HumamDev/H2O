#!/usr/bin/env node
//
// Folder Sync - F15 ledger/journal/restart-survival audit validator (design-only).
//
// Static validator for the audit that mapped where Phase A artifacts persist and pinned the recovery-blocking behavior.
// The historical evidence still records the pre-fix posture. After the restart-survival implementation, this validator
// now accepts the fixed source posture: startup/reload convergence exists, and consumed-ledger duplicate handling is
// current-state aware instead of short-circuiting before canonical state verification.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/folder-sync-binding-f15-ledger-journal-restart-survival-preflight.md';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const executeJournalPath = 'src-surfaces-base/studio/sync/execute/execute-journal.tauri.js';
const resumeOnBootPath = 'src-surfaces-base/studio/sync/execute/execute-resume-on-boot.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

const COMMITS = ['81de3a63', '0c4c2128', 'e50db532'];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function compact(value) {
  return String(value).replace(/\s+/g, ' ');
}

function assertIncludes(source, token, label) {
  assert.ok(source.includes(token), `${label}: missing ${token}`);
}

for (const rel of [evidencePath, folderSyncPath, foldersStorePath, executeJournalPath, resumeOnBootPath, folderImportPath]) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const folderSync = read(folderSyncPath);
const foldersStore = read(foldersStorePath);
const executeJournal = read(executeJournalPath);
const resumeOnBoot = read(resumeOnBootPath);
const folderImport = read(folderImportPath);
const combinedRuntime = `${foldersStore}\n${folderSync}\n${folderImport}`;

for (const commit of COMMITS) {
  assertIncludes(evidence, commit, `evidence commit ${commit}`);
}

for (const token of [
  // verdict + framing
  'DURABLE RECORDS SURVIVED, MATERIALIZATION DID NOT',
  'SURVIVING CONSUMED LEDGER BLOCKS RECOVERY',
  'design-only preflight/audit',
  // persistence map
  "chrome.storage.local['h2o:studio:sync:ledger:v1']",
  'SQLite-backed KV shim',
  'appendExecuteJournalRow',
  'no persisted materialization-receipt table',
  'sqlite:studio-v1.db',
  // survival
  'Consumed ledger (Q3)**: SURVIVES',
  'settlement / execute journal (Q4/Q5)**: SURVIVES',
  'DID NOT survive',
  'durable RECORDS',
  // startup reconcile
  'No.',
  'never converged',
  // Q8 critical
  "return 'duplicate';` - BEFORE any current-canonical-state check",
  'permanently blocks recovery',
  'never re-materializes',
  // recovery model
  'settled F15 journal -> canonical',
  'ledger-dedup ordering fix',
  'materializeSettledCanonicalChatFolderBinding',
  // Q10 / Q11
  'both belong in the final fix',
  'Required for Phase B survival and recoverability - not merely a safety net',
  // validators + evidence
  'Journal-convergence harness',
  'Ledger-recovery ordering validator',
  'folder-sync-binding-f15-ledger-journal-restart-convergence-implementation.md',
  // boundaries
  '`binding-mismatch` remains blocked',
  '`productSyncReady` remains false',
  'WebDAV/cloud/relay remains blocked',
  'Chat Saving WebDAV/cloud/archive CAS remains blocked',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

// ---- REAL SOURCE anchors: consumed ledger persistence (SQLite-backed KV) ----
assertIncludes(folderSync, "var LEDGER_KEY = 'h2o:studio:sync:ledger:v1'", 'consumed ledger key present');
assertIncludes(folderSync, 'chrome.storage.local KV helpers (SQLite-backed on Desktop)', 'KV helpers are SQLite-backed on Desktop (durable)');
assertIncludes(folderSync, 'function getLedger', 'ledger reader present');
assertIncludes(folderSync, 'bindingRepairAlreadyConsumed', 'consumed-ledger precheck present');

// ---- REAL SOURCE anchors: execute/settlement journal persistence (SQLite-backed KV) ----
assertIncludes(executeJournal, 'global.chrome.storage.local', 'execute journal persists via SQLite-backed KV shim');

// ---- REAL SOURCE anchors: restart convergence now exists outside execute-resume-on-boot ----
assert.ok(!resumeOnBoot.includes('folder_bindings') && !resumeOnBoot.includes('bindChat'),
  'execute-resume-on-boot must not write folder_bindings directly');
assertIncludes(foldersStore, 'async function materializeSettledCanonicalChatFolderBinding', 'settled materializer present (reusable by boot convergence)');
assertIncludes(foldersStore, 'runF15SettledBindingRestartConvergence', 'store-level restart convergence now exists');
assertIncludes(foldersStore, "ensureF15SettledBindingRestartConvergenceReady('init')", 'init runs restart convergence (via one-shot ready gate)');
assertIncludes(foldersStore, "source: 'reload'", 'reload runs restart convergence');
assertIncludes(foldersStore, 'f15SettledJournalConfirmsMaterializationRecord', 'convergence verifies survived settled journal');

// ---- REAL SOURCE anchors: ledger duplicate handling is now current-state aware ----
assertIncludes(folderSync, 'function classifyChatFolderBindingRepairConflict', 'classify present');
assertIncludes(folderSync, 'var currentFolderId = cleanString(snap.bindingByChatId && snap.bindingByChatId[chatId]);',
  'classify reads current canonical state before consumed duplicate decision');
assertIncludes(folderSync, "if ((intent === 'bind' || intent === 'move') && currentFolderId === targetFolderId) return 'duplicate';",
  'consumed bind/move duplicate requires target already current');
assertIncludes(folderSync, "if (intent === 'unbind' && !currentFolderId) return 'duplicate';",
  'consumed unbind duplicate requires already unbound');
assertIncludes(folderSync, 'effCtx.appliedKeys[cleanString(safeObject(request).idempotencyKey)] = true',
  'handler sets appliedKeys from the surviving consumed ledger');
assertIncludes(folderSync, 'if (consumedBeforeApply) {', 'appliedKeys is set only when the ledger survived');
assertIncludes(folderSync, "already-consumed-before-recovery", 'consumed-but-diverged recovery keeps idempotency persisted after gates');
assert.ok(!folderSync.includes("if (appliedKeys[cleanString(req.idempotencyKey)]) return 'duplicate';"),
  'old consumed-ledger immediate duplicate short-circuit must be gone');
// structural: current-canonical-state read precedes the consumed duplicate decision.
const curStateIdx = folderSync.indexOf('var currentFolderId = cleanString(snap.bindingByChatId');
const appliedIdx = folderSync.indexOf('if (appliedKeys[cleanString(req.idempotencyKey)])', curStateIdx);
assert.ok(curStateIdx !== -1 && appliedIdx !== -1 && curStateIdx < appliedIdx,
  'current-state read must precede consumed duplicate decision');

// ---- REAL SOURCE anchors: gates + boundaries intact and unedited ----
assertIncludes(folderSync, 'post-apply-binding-hash-mismatch', 'post-apply hash gate present');
assertIncludes(folderSync, 'confirmCanonicalChatFolderBindingDurable', 'durable gate present');
assertIncludes(folderSync, 'await bindingRepairRecordConsumed(request)', 'ledger consume present');
assert.ok(!folderSync.includes('explicitF7Fallback: true'), 'no explicitF7Fallback:true');
assert.ok(!folderSync.includes('allowF7Fallback: true'), 'no allowF7Fallback:true');
assert.ok(!folderSync.includes('f15AllowF7Fallback: true'), 'no f15AllowF7Fallback:true');
assert.ok(!folderSync.includes('folders.moveCanonicalChatFolderBinding('), 'repair handler must not call bare move');
assertIncludes(foldersStore, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])", 'binding-mismatch remains blocked');
assert.ok(!combinedRuntime.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!combinedRuntime.includes('productSyncReady = true'), 'productSyncReady assignment must not flip true');
assert.doesNotMatch(combinedRuntime, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'fullBundle.v3 must not be introduced');
assertIncludes(folderImport, "webdav: 'deferred'", 'WebDAV must remain deferred');

// ---- design must remain design-only ----
for (const forbidden of [
  'RESTART CONVERGENCE IMPLEMENTED',
  'Phase B passed',
  'Phase B survived',
  'productSyncReady is true',
]) {
  assert.ok(!flat.includes(forbidden), `audit must not claim: ${forbidden}`);
}

const result = {
  schema: 'h2o.studio.folder-sync.binding-f15-ledger-journal-restart-survival-preflight.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'binding-f15-ledger-journal-restart-survival-preflight',
  evidence: evidencePath,
  consumedLedgerBacking: "chrome.storage.local['h2o:studio:sync:ledger:v1'] (SQLite-backed KV on Desktop)",
  executeJournalBacking: 'chrome.storage.local (SQLite-backed KV on Desktop)',
  materializationReceiptTable: false,
  folderBindingsBacking: 'sqlite:studio-v1.db folder_bindings',
  consumedLedgerSurvivesRestart: true,
  settlementJournalSurvivesRestart: true,
  folderBindingsSurvivedRestartInAuditedLiveRun: false,
  historicalStartupReconcilesJournalIntoBindings: false,
  currentSourceStartupConvergencePresent: true,
  historicalConsumedLedgerBlocksRecovery: true,
  currentSourceConsumedLedgerRecoveryOrderingFixed: true,
  recoveryBlockMechanismHistorical: "classify returned 'duplicate' on appliedKeys[idempotencyKey] before the current-state check; handler mapped duplicate -> skipped zero-write",
  recommendedDirection: 'boot settled-journal -> folder_bindings convergence (C/E) + ledger-dedup ordering conditioned on current-state match; merge with durable-gate hardening',
  requiredForPhaseB: true,
  mergeWithDurableGateHardening: true,
  designOnly: true,
  liveApplyPerformed: false,
  bindingMismatchBlocked: true,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
  recommendedNext: 'design boot journal-convergence + ledger-dedup ordering fix, merge with durable-gate hardening, independent review before implementation',
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-binding-f15-ledger-journal-restart-survival-preflight');
