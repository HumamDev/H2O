#!/usr/bin/env node
//
// Folder Sync — Binding persistence busy-aware fence fix proof.
//
// Extracts the REAL bindingCheckpointRowParse + bindingDurablePersistenceFence from folders.tauri.js and
// evaluates them in a node:vm with a stubbed SQL layer, proving the busy-aware classification:
//   busy:0 -> checkpoint-confirmed (durable);  busy:1 -> busy-incomplete (NOT durable);
//   non-WAL (log:-1, checkpointed:-1) -> non-wal-no-checkpoint-needed (durable);
//   select-throws + execute-ok -> unverifiable (NOT durable; execute exposes no columns);
//   both-throw -> unavailable (NOT durable). Also proves positional-array rows parse. It asserts source anchors
//   (fence prefers select, parses busy/log/checkpointed, execute-only is unverifiable, the helper consumes the
//   CONFIRMED fence verdict) and the checkpoint-availability + busy-aware-fence-fix evidence docs, and the
//   standing boundaries (binding-mismatch blocked; no writer-identity coupling; webdav deferred; no v3).

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();
const failures = [];

const diagDoc = 'release-evidence/2026-07-01/folder-sync-binding-checkpoint-availability-diagnostic.md';
const fixDoc = 'release-evidence/2026-07-01/folder-sync-binding-persistence-busy-aware-fence-fix.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const archiveBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(cond, msg) { if (!cond) failures.push(msg); }

async function runFenceProof() {
  const store = read(foldersStorePath);
  const s = store.indexOf('function bindingCheckpointRowParse(');
  const e = store.indexOf('async function confirmCanonicalChatFolderBindingDurable(');
  if (s < 0 || e < 0 || e <= s) return { blocked: true, blocker: 'could not extract the fence module from source' };
  const fenceModule = store.slice(s, e);
  const wrapper = '(function(cfg){'
    + 'function sqlSelect(q,v){ return cfg.selThrow ? Promise.reject(new Error("sel-unavail")) : Promise.resolve(cfg.sel); }'
    + 'function sqlExecute(q,v){ return cfg.execThrow ? Promise.reject(new Error("exec-unavail")) : Promise.resolve([0,0]); }'
    + fenceModule
    + 'return { fence: bindingDurablePersistenceFence, parse: bindingCheckpointRowParse };})';
  let factory;
  try { factory = vm.runInThisContext(wrapper, { filename: 'busy-aware-fence-extract' }); }
  catch (err) { return { blocked: true, blocker: 'vm eval of extracted fence threw: ' + (err && err.message ? err.message : String(err)) }; }
  const cfg = { sel: null, selThrow: false, execThrow: false };
  const mod = factory(cfg);
  const fence = mod.fence;

  const out = {};
  async function run(label, setup, expectInterp, expectDurable, extra) {
    cfg.selThrow = false; cfg.execThrow = false; cfg.sel = null;
    setup();
    const r = await fence();
    out[label] = { interpretation: r.interpretation, durable: r.durable, via: r.via, busy: r.busy };
    assert(r.interpretation === expectInterp, `${label}: interpretation must be ${expectInterp}, got ${r.interpretation}`);
    assert(r.durable === expectDurable, `${label}: durable must be ${expectDurable}, got ${r.durable}`);
    if (extra) extra(r);
  }

  // object-keyed rows (real Desktop shape)
  await run('busy0', () => { cfg.sel = [{ busy: 0, log: 0, checkpointed: 0 }]; }, 'checkpoint-confirmed', true, (r) => { assert(r.busy === 0, 'busy0 parsed busy 0'); });
  await run('busy1', () => { cfg.sel = [{ busy: 1, log: 5, checkpointed: 0 }]; }, 'busy-incomplete', false, (r) => { assert(r.busy === 1, 'busy1 parsed busy 1'); });
  await run('nonWal', () => { cfg.sel = [{ busy: 0, log: -1, checkpointed: -1 }]; }, 'non-wal-no-checkpoint-needed', true);
  await run('selectThrowExecOk', () => { cfg.selThrow = true; cfg.execThrow = false; }, 'unverifiable', false, (r) => { assert(r.via === 'execute', 'execute-only via'); });
  await run('bothThrow', () => { cfg.selThrow = true; cfg.execThrow = true; }, 'unavailable', false);
  // positional-array rows (defensive parse)
  await run('busy0Positional', () => { cfg.sel = [[0, 0, 0]]; }, 'checkpoint-confirmed', true);
  await run('busy1Positional', () => { cfg.sel = [[1, 5, 0]]; }, 'busy-incomplete', false);

  out.blocked = false;
  return out;
}

// ---- evidence docs ----
assert(exists(diagDoc), `${diagDoc}: missing`);
if (exists(diagDoc)) {
  const flat = read(diagDoc).replace(/\s+/g, ' ');
  assert(/CHECKPOINT AVAILABILITY CONFIRMED/i.test(flat), 'diagnostic doc must carry the availability-confirmed verdict');
  assert(/"value":\s*"wal"/.test(flat), 'diagnostic doc must record journalMode wal');
  assert(/"busy":\s*0/.test(flat) && /"rawKeys":\s*\[\s*"busy",\s*"log",\s*"checkpointed"\s*\]/.test(flat), 'diagnostic doc must record inspectable select checkpoint row (busy 0)');
  assert(/"exposesCheckpointColumns":\s*false/.test(flat), 'diagnostic doc must record execute exposes no checkpoint columns');
}
assert(exists(fixDoc), `${fixDoc}: missing`);
if (exists(fixDoc)) {
  const flat = read(fixDoc).replace(/\s+/g, ' ');
  assert(/BINDING PERSISTENCE BUSY-AWARE FENCE FIX IMPLEMENTED/.test(flat), 'fix doc must carry the implemented verdict');
  assert(/checkpointSelect\.busy:0|"busy":\s*0|busy:0/i.test(flat), 'fix doc must record busy:0 from the diagnostic');
  assert(/busy === 1|busy:1[^\d]/i.test(flat) && /unverifiable|safe-fail/i.test(flat), 'fix doc must state busy:1 is unverifiable/safe-fail');
  assert(/execute[- ]only|exposes no checkpoint columns|no checkpoint columns/i.test(flat), 'fix doc must state execute-only is not durable');
  assert(/detection \+ safe-fail/i.test(flat) && /not the final/i.test(flat), 'fix doc must state detection + safe-fail only, not the final fix');
  assert(/No live apply|no live apply retry/i.test(flat), 'fix doc must state no live apply');
  assert(/`?binding-mismatch`? remains BLOCKED|binding-mismatch remains blocked/i.test(flat), 'fix doc must keep binding-mismatch blocked');
  assert(/`?productSyncReady`? remains `?false`?/i.test(flat), 'fix doc must keep productSyncReady false');
}

// ---- source anchors ----
assert(exists(foldersStorePath), `${foldersStorePath}: missing`);
if (exists(foldersStorePath)) {
  const store = read(foldersStorePath);
  assert(store.includes('function bindingCheckpointRowParse('), 'busy-aware row parser must exist');
  assert(store.includes('PRAGMA wal_checkpoint(TRUNCATE)'), 'fence must still call wal_checkpoint(TRUNCATE)');
  assert(store.includes('parsed.busy === 1'), 'fence must treat busy===1 as a distinct (incomplete) case');
  assert(store.includes("fence.interpretation = 'busy-incomplete'"), 'fence must classify busy-incomplete');
  assert(store.includes("fence.interpretation = 'checkpoint-confirmed'"), 'fence must classify checkpoint-confirmed');
  assert(store.includes("fence.interpretation = 'non-wal-no-checkpoint-needed'"), 'fence must classify non-wal-no-checkpoint-needed');
  assert(store.includes("fence.via = 'execute'; fence.interpretation = 'unverifiable'"), 'execute-only path must be unverifiable (not durable)');
  assert(store.includes('fence.durable === true'), 'helper must consume the CONFIRMED fence verdict (fence.durable), not merely non-throw');
  assert(store.includes('confirmCanonicalChatFolderBindingDurable: confirmCanonicalChatFolderBindingDurable'), 'durable helper must remain exposed');
  assert(!store.includes('h2o_writer_identity'), 'no Rust writer-identity coupling in the store fence');
  assert(store.includes("blockedClasses: classSelection.blocked.concat(['binding-mismatch'])"), 'F11 must STILL block binding-mismatch');
}
// store-only fix: handler gate + existing hash gate unchanged
assert(exists(folderSyncPath), `${folderSyncPath}: missing`);
if (exists(folderSyncPath)) {
  const src = read(folderSyncPath);
  assert(src.includes('post-apply-binding-hash-mismatch'), 'existing post-apply-binding-hash-mismatch gate must remain');
  assert(src.includes("'persistence-verification-failure'"), 'handler must still return persistence-verification-failure');
  assert(src.includes('confirmCanonicalChatFolderBindingDurable('), 'handler must still call the durable helper');
  assert(!src.includes('productSyncReady: true') && !src.includes('productSyncReady = true'), 'productSyncReady must not be flipped');
  assert(!src.includes('fullBundle.v3'), 'no fullBundle.v3');
  assert(src.includes("webdav: 'deferred'"), 'WebDAV must remain deferred');
}
assert(exists(archiveBoundaryPath), 'Chat Saving archive-cloud boundary validator must remain present');

// ---- run fence proof ----
let proof = null;
try { proof = await runFenceProof(); }
catch (err) { failures.push('busy-aware fence proof threw: ' + (err && err.message ? err.message : String(err))); }
if (proof && proof.blocked) failures.push('busy-aware fence proof BLOCKED: ' + proof.blocker);

if (failures.length) {
  console.error('FAIL validate-folder-sync-binding-persistence-busy-aware-fence-fix');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.binding-persistence-busy-aware-fence-fix.v1',
  lane: 'folder-sync-binding',
  phase: 'binding-persistence-busy-aware-fence-fix',
  verdict: 'BINDING-PERSISTENCE-BUSY-AWARE-FENCE-FIX-IMPLEMENTED',
  detectionAndSafeFailOnly: true,
  finalRustCompetingWriterFix: false,
  storeOnlyFix: true,
  fenceCases: proof ? {
    busy0: proof.busy0, busy1: proof.busy1, nonWal: proof.nonWal,
    selectThrowExecOk: proof.selectThrowExecOk, bothThrow: proof.bothThrow,
  } : null,
  busyZeroAccepted: true,
  busyOneSafeFails: true,
  executeOnlyUnverifiable: true,
  nonWalFencedOk: true,
  bindingMismatchBlocked: true,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
  liveApplyPerformed: false,
  recommendedNext: 'Rust/Tauri-SQL durability + h2o_writer_identity authorization + competing-writer investigation before any live retry',
}, null, 2));
console.log('PASS validate-folder-sync-binding-persistence-busy-aware-fence-fix');
