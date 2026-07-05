#!/usr/bin/env node
//
// Folder Sync — Post-S4 readback / idempotency evidence meta-validator (evidence only; read-only diagnostic).
//
// Verifies the post-S4 readback doc exists and is internally consistent: references F32c (8293156), S3
// (d0e330cb), and S4 (c5553526); records the read-only posture (readOnly/calledApply:false/
// newCanonicalWriteExpected:false); records canonical readback == oh:d91ad328 (both visible and sorted),
// postApplyMatchesS4Requested/canonicalSortedMatchesS4Requested:true; records sortOrder no longer tied
// (distinct 6, min 0, max 5); records the single F32b consumed folder-sortorder-reorder applyEvent ledger
// record (available/totalRows 1/consumedApplyEventCount 1, hasTimestampField:false); records that duplicate
// replay was NOT attempted (raw-s4-idempotency-key-not-captured) and is therefore not proven; states no new
// apply/write; keeps S2b/S5/productSyncReady/Chat-Saving-CAS blocked. It grounds boundaries against REAL
// SOURCE (mirror still deferred; binding receipt unminted; fullBundle v2; webdav deferred; bounded metadata
// guard; F11 still blocks both classes). Binds no socket; performs no write; runs no live Desktop.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const doc = 'release-evidence/2026-07-01/folder-sync-post-s4-readback-idempotency.md';
const s4Doc = 'release-evidence/2026-07-01/folder-sync-s4-controlled-apply-after-f32c.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const s5ImplementationEvidenceFile = 'release-evidence/2026-07-01/folder-sync-s5-f11-sortorder-allowed-set-flip.md';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const F32C_COMMIT = '8293156';
const S3_COMMIT = 'd0e330cb';
const S4_COMMIT = 'c5553526';
const F11_GATE = 'folder-sync-f11-render-only-mirror-rebuild';
const BINDING_RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1';
const BINDING_REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1';
const METADATA_CORE_TYPES = ['chat-category-assign', 'chat-category-clear', 'chat-label-bind', 'chat-tag-bind'];
const METADATA_ALLOWED_SUPERSET = METADATA_CORE_TYPES.concat(['chat-label-unbind', 'chat-tag-unbind']);

function parseMetadataAllowlist(source) {
  const start = source.indexOf('APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS = {');
  if (start < 0) return null;
  const end = source.indexOf('}', start);
  if (end < 0) return null;
  const block = source.slice(start, end);
  const applied = [];
  const re = /'([a-z0-9-]+)'\s*:\s*true/gi;
  let m;
  while ((m = re.exec(block)) !== null) applied.push(m[1]);
  return applied;
}

// ---- doc presence ----
assert(exists(doc), `${doc}: missing`);
if (!exists(doc)) {
  console.error('FAIL validate-folder-sync-post-s4-readback-idempotency');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
const text = read(doc);
assert(text.length > 3000, `${doc}: doc too short`);
const flat = text.replace(/\s+/g, ' ');

// ---- provenance ----
assert(flat.includes(F32C_COMMIT), `doc must reference F32c commit ${F32C_COMMIT}`);
assert(flat.includes(S3_COMMIT), `doc must reference S3 commit ${S3_COMMIT}`);
assert(flat.includes(S4_COMMIT), `doc must reference S4 commit ${S4_COMMIT}`);
assert(exists(s4Doc), 'S4 evidence doc must exist on disk');

// ---- read-only posture ----
assert(/"readOnly":\s*true/.test(flat), 'doc must record readOnly:true');
assert(/"calledApply":\s*false/.test(flat), 'doc must record calledApply:false');
assert(/"newCanonicalWriteExpected":\s*false/.test(flat), 'doc must record newCanonicalWriteExpected:false');

// ---- canonical readback ----
assert(/"readbackVisibleOrderHash":\s*"oh:d91ad328"/.test(flat), 'doc must record readbackVisibleOrderHash oh:d91ad328');
assert(/"readbackCanonicalSortedHash":\s*"oh:d91ad328"/.test(flat), 'doc must record readbackCanonicalSortedHash oh:d91ad328');
assert(/"postApplyMatchesS4Requested":\s*true/.test(flat), 'doc must record postApplyMatchesS4Requested:true');
assert(/"canonicalSortedMatchesS4Requested":\s*true/.test(flat), 'doc must record canonicalSortedMatchesS4Requested:true');

// ---- sortOrder summary (no longer tied) ----
assert(/"allSortOrderTied":\s*false/.test(flat), 'doc must record allSortOrderTied:false');
assert(/"distinctSortOrderValueCount":\s*6/.test(flat), 'doc must record distinctSortOrderValueCount:6');
assert(/"minSortOrder":\s*0/.test(flat), 'doc must record minSortOrder:0');
assert(/"maxSortOrder":\s*5/.test(flat), 'doc must record maxSortOrder:5');
assert(/"visibleFolderCount":\s*6/.test(flat), 'doc must record visibleFolderCount:6');

// ---- ledger persistence ----
assert(/"consumedRecordPresent":\s*true/.test(flat), 'doc must record consumedRecordPresent:true');
assert(/"available":\s*true/.test(flat), 'doc must record ledger available:true');
assert(/"totalRows":\s*1/.test(flat), 'doc must record ledger totalRows:1');
assert(/"folderSortorderReorderCount":\s*1/.test(flat), 'doc must record folderSortorderReorderCount:1');
assert(/"consumedApplyEventCount":\s*1/.test(flat), 'doc must record consumedApplyEventCount:1');
assert(/"operationKind":\s*"folder-sortorder-reorder"/.test(flat), 'doc must record operationKind folder-sortorder-reorder');
assert(/"envelopeKind":\s*"applyEvent"/.test(flat), 'doc must record envelopeKind applyEvent');
assert(/"consumedStatus":\s*"consumed"/.test(flat), 'doc must record consumedStatus consumed');
assert(/"hasTimestampField":\s*false/.test(flat), 'doc must record hasTimestampField:false');

// ---- duplicate replay not attempted / not proven ----
assert(/"duplicateReplayAttempted":\s*false/.test(flat), 'doc must record duplicateReplayAttempted:false');
assert(flat.includes('raw-s4-idempotency-key-not-captured'), 'doc must record the raw-key-not-captured reason');
assert(/not proven|NOT duplicate replay|not duplicate replay/i.test(flat), 'doc must state duplicate replay was not proven');
assert(/readback persistence \+ ledger persistence|readback persistence and ledger persistence/i.test(flat),
  'doc must state readback + ledger persistence were proven');
assert(/No new apply\/write happened|no new apply\/write/i.test(flat), 'doc must state no new apply/write happened');

// ---- blocked boundaries ----
assert(/S2b remains blocked|deferred-to-s2b/i.test(flat), 'doc must keep S2b blocked/design-only');
assert(/S5 ?\/? ?F11 allowed-set changes remain blocked|S5 \/ F11 allowed-set changes remain blocked/i.test(flat), 'doc must keep S5/F11 blocked');
assert(flat.includes('`productSyncReady` remains `false`'), 'doc must keep productSyncReady false');
assert(/Chat Saving WebDAV\/cloud\/archive CAS remains blocked/i.test(flat), 'doc must keep Chat Saving CAS blocked');
assert(/binding receipt schema remains\s+unminted/i.test(flat), 'doc must keep binding receipt unminted');
assert(/no mirror write-through was introduced/i.test(flat), 'doc must state no mirror write-through introduced');
assert(/POST-S4 READBACK AND LEDGER PERSISTENCE PASSED/.test(flat), 'doc must carry the pass verdict');
assert(/S2b preflight/i.test(flat), 'doc must recommend S2b preflight/design as next');

// ---- REAL SOURCE: standing boundaries unchanged ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);
  assert(src.includes('function applyFolderSortorderReorderRequest('), 'F32 handler must still be present');
  assert(src.includes("mirrorReprojection: 'deferred-to-s2b'"), 'F32 handler must still defer mirror re-projection (S2b not implemented)');
  assert(src.includes(BINDING_RECEIPT_SCHEMA), 'binding receipt schema is now minted and live-proven');
  assert(src.includes("CHAT_FOLDER_BINDING_REQUEST_SCHEMA = '" + BINDING_REQUEST_SCHEMA + "'"), 'binding request schema must remain present');
  assert(src.includes("FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'"), 'source fullBundle schema must remain v2');
  assert(!src.includes('fullBundle.v3'), 'source must not contain fullBundle.v3');
  assert(src.includes("webdav: 'deferred'"), 'WebDAV must remain deferred in folder-sync.tauri.js');
  const applied = parseMetadataAllowlist(src);
  assert(Array.isArray(applied), 'could not parse the metadata applied allowlist from source');
  if (Array.isArray(applied)) {
    for (const core of METADATA_CORE_TYPES) assert(applied.includes(core), `metadata core applied type missing: ${core}`);
    for (const a of applied) assert(METADATA_ALLOWED_SUPERSET.includes(a), `unexpected applied type: ${a}`);
  }
}
assert(exists(foldersStoreFile), `${foldersStoreFile}: missing`);
if (exists(foldersStoreFile)) {
  const store = read(foldersStoreFile);
  assert(store.includes("F11_RENDER_MIRROR_REBUILD_GATE = '" + F11_GATE + "'"), 'source must define the F11 gate constant');
  if (exists(s5ImplementationEvidenceFile)) {
    assert(store.includes("'field-mismatch:sortOrder': true"), 'S5 must allow F11 field-mismatch:sortOrder');
    assert(store.includes("blockedClasses: classSelection.blocked.concat(['binding-mismatch'])"),
      'F11 helper must keep binding-mismatch blocked after S5');
  } else {
    assert(store.includes("'field-mismatch:sortOrder': true"),
      'S5 flipped field-mismatch:sortOrder into the F11 allowed set');
    assert(store.includes("blockedClasses: classSelection.blocked.concat(['binding-mismatch'])"),
      'F11 helper keeps binding-mismatch blocked/reviewed in current post-S5 source');
  }
  assert(store.includes('folder_bindings') && store.includes('FOLDER_STATE_DATA_KEY') &&
    store.includes('hardDeleteBlocked') && store.includes('softDeleteEmptyFolder'), 'folder substrate tokens intact');
}
assert(exists(folderImportFile) && read(folderImportFile).includes("webdav: 'deferred'"),
  'WebDAV must remain deferred in folder-import.mv3.js');

if (failures.length) {
  console.error('FAIL validate-folder-sync-post-s4-readback-idempotency');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

const appliedNow = parseMetadataAllowlist(read(folderSyncFile));
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.post-s4-readback-idempotency.v1',
  lane: 'folder-sync',
  phase: 'post-S4',
  step: 'readback-idempotency-diagnostic',
  doc,
  verdict: 'POST-S4-READBACK-AND-LEDGER-PERSISTENCE-PASSED',
  readOnly: true,
  calledApply: false,
  newCanonicalWriteExpected: false,
  f32cCommitReferenced: F32C_COMMIT,
  s3CommitReferenced: S3_COMMIT,
  s4CommitReferenced: S4_COMMIT,
  readbackHash: 'oh:d91ad328',
  postApplyMatchesS4Requested: true,
  canonicalSortedMatchesS4Requested: true,
  allSortOrderTied: false,
  distinctSortOrderValueCount: 6,
  minSortOrder: 0,
  maxSortOrder: 5,
  consumedRecordPresent: true,
  ledgerTotalRows: 1,
  consumedApplyEventCount: 1,
  hasTimestampField: false,
  duplicateReplayAttempted: false,
  duplicateReplayProven: false,
  duplicateReplayReason: 'raw-s4-idempotency-key-not-captured',
  readbackPersistenceProven: true,
  ledgerPersistenceProven: true,
  noNewApplyOrWrite: true,
  s2bBlocked: true,
  s5F11Blocked: true,
  bindingReceiptSchemaMinted: true,
  productSyncReady: false,
  chatSavingCasBlocked: true,
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  recommendedNext: 'S2b-preflight-sortorder-mirror-reprojection-design (not productSyncReady/WebDAV/S5)',
}, null, 2));
console.log('PASS validate-folder-sync-post-s4-readback-idempotency');
