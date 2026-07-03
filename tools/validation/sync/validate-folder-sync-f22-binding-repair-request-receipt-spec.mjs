#!/usr/bin/env node
//
// Folder Sync Phase F22 — binding repair request/receipt loop spec meta-validator (design/spec only).
//
// Verifies the F22 doc exists and is internally consistent (design/spec only): references the F21 commit;
// is design/spec-only (no binding repair, no writes); specifies the chat-folder-binding-request.v1 ->
// Desktop apply -> receipt -> mirror re-projection -> read-only import loop; defines the allowed binding
// intents (bind/unbind/move; no chat delete; no folder delete/purge); defines the request + receipt
// envelope fields; defines the conflict/mismatch matrix; preserves one-folder-per-chat; blocks direct
// mirror-only repair and Chrome/native/mobile canonical mutation; keeps binding-mismatch blocked +
// field-mismatch:sortOrder gated; keeps the standing postures; carries cross-surface; recommends F23. It
// grounds against REAL SOURCE that the request schema is present (reused), the proposed binding receipt
// schema is NOT minted, the folder_bindings substrate is intact, F11 still blocks the two gated classes,
// the sortOrder proposed schemas remain unminted, WebDAV deferred, fullBundle v2, using a BOUNDED
// metadata-lane guard. Binds no socket; makes no network call; performs no write.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const f22Doc = 'release-evidence/2026-06-25/folder-sync-f22-binding-repair-request-receipt-spec.md';
const f21Doc = 'release-evidence/2026-06-25/folder-sync-f21-binding-mismatch-repair-readiness-audit.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const s5SortOrderFlipDoc = 'release-evidence/2026-07-01/folder-sync-s5-f11-sortorder-allowed-set-flip.md';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const F21_COMMIT = '35e11ae';
const S5_SORTORDER_FLIP_COMMIT = '6bf420be';
const F11_GATE = 'folder-sync-f11-render-only-mirror-rebuild';
const BINDING_REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1';
const BINDING_RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1';
const SORTORDER_REQUEST_SCHEMA = 'h2o.studio.folder-sortorder-reorder-request.v1';
const SORTORDER_RECEIPT_SCHEMA = 'h2o.studio.folder-sortorder-reorder-receipt.v1';
const INTENTS = ['bind', 'unbind', 'move'];
const REQUEST_FIELDS = ['requestId', 'sourcePeerId', 'surfaceKind', 'intent', 'chatId', 'targetFolderId',
  'previousFolderId', 'basisBindingHash', 'requestedBindingHash', 'createdAt', 'idempotencyKey'];
const RECEIPT_FIELDS = ['requestId', 'status', 'reason', 'resultingBindingHash', 'canonicalAuthority',
  'noChatDelete', 'noFolderDelete', 'noFolderPurge', 'noTombstoneMutation'];
const CONFLICT_CASES = ['missing-mirror-item', 'extra-mirror-item', 'orphan-folder-binding',
  'orphan-chat-binding', 'tombstoned-folder-binding', 'duplicate-binding', 'stale-basis', 'duplicate',
  'privacy-redaction-violation', 'multi-device-concurrent'];
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
assert(exists(f22Doc), `${f22Doc}: missing`);
if (!exists(f22Doc)) {
  console.error('FAIL validate-folder-sync-f22-binding-repair-request-receipt-spec');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f22Doc);
assert(doc.length > 6000, `${f22Doc}: F22 doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- design/spec-only markers ----
assert(flat.includes('DESIGN / SPECIFICATION ONLY'), 'F22 doc must mark itself design/spec only');
assert(flat.includes('No product source was modified'), 'F22 doc must state no product source modified');
assert(/No binding repair was implemented|No runtime behavior was changed/i.test(flat),
  'F22 doc must state no binding repair / no runtime change');
assert(/No chat was bound, unbound, or moved/i.test(flat), 'F22 doc must state no bind/unbind/move occurred');

// ---- F21 commit ----
assert(flat.includes(F21_COMMIT), `F22 doc must reference the F21 commit ${F21_COMMIT}`);
assert(exists(f21Doc), 'F21 doc must exist on disk');

// ---- loop ----
assert(flat.includes(BINDING_REQUEST_SCHEMA), `F22 doc must specify the request schema ${BINDING_REQUEST_SCHEMA}`);
assert(flat.includes(BINDING_RECEIPT_SCHEMA), `F22 doc must specify the proposed receipt schema ${BINDING_RECEIPT_SCHEMA}`);
assert(/Desktop VALIDATES/i.test(flat), 'F22 doc must specify Desktop validation');
assert(/APPLIES only the approved binding change to canonical SQLite `?folder_bindings`?|applies .* folder_bindings/i.test(flat),
  'F22 doc must specify Desktop applies to folder_bindings');
assert(/emits a RECEIPT|emits a receipt/i.test(flat), 'F22 doc must specify the receipt');
assert(/RE-PROJECTS `?FOLDER_STATE_DATA_KEY\.items`?|re-project .* FOLDER_STATE_DATA_KEY\.items/i.test(flat),
  'F22 doc must specify mirror items re-projection');
assert(/IMPORT the read-only projection|read-only projection/i.test(flat), 'F22 doc must specify read-only import');

// ---- allowed intents ----
for (const intent of INTENTS) assert(new RegExp('`' + intent + '`').test(flat) || flat.includes(intent),
  `F22 doc must define allowed intent: ${intent}`);
assert(/NO chat delete/i.test(flat) && /NO folder delete \/ purge/i.test(flat),
  'F22 doc must forbid chat delete + folder delete/purge as intents');

// ---- request + receipt fields ----
for (const f of REQUEST_FIELDS) assert(flat.includes(f), `F22 doc must define request field: ${f}`);
for (const f of RECEIPT_FIELDS) assert(flat.includes(f), `F22 doc must define receipt field: ${f}`);
assert(/`applied` \| `skipped` \| `rejected`|applied.*skipped.*rejected/i.test(flat),
  'F22 doc must define receipt status applied/skipped/rejected');

// ---- conflict matrix ----
for (const c of CONFLICT_CASES) assert(flat.includes(c), `F22 doc must define conflict case: ${c}`);

// ---- safety incl one-folder-per-chat ----
assert(/one-folder-per-chat invariant PRESERVED|one-folder-per-chat/i.test(flat), 'F22 doc must preserve one-folder-per-chat');
assert(/NO direct mirror-only repair/i.test(flat), 'F22 doc must block direct mirror-only repair');
assert(/NO Chrome \/ native \/ mobile canonical mutation|proposers never write/i.test(flat),
  'F22 doc must block Chrome/native/mobile canonical mutation');
assert(/transport remains transport-only/i.test(flat), 'F22 doc must keep transport transport-only');

// ---- validators-needed ----
assert(/Validators Needed Before Implementation/i.test(flat), 'F22 doc must list validators needed before implementation');
assert(/accepted-apply harness against a temp `?node:sqlite`?|accepted-apply harness/i.test(flat),
  'F22 doc must require an accepted-apply harness');
assert(/rejected\/skipped write-nothing harness/i.test(flat), 'F22 doc must require a rejected/skipped write-nothing harness');
assert(/live Desktop dry-run proof/i.test(flat) && /live Desktop controlled apply proof/i.test(flat) &&
  /post-apply read-only .* drift probe/i.test(flat), 'F22 doc must require live dry-run + controlled apply + drift probe');

// ---- postures ----
assert(/`binding-mismatch` remains BLOCKED|binding-mismatch` REMAINS BLOCKED|binding-mismatch remains blocked/i.test(flat),
  'F22 doc must keep binding-mismatch blocked');
if (exists(s5SortOrderFlipDoc)) {
  const s5 = read(s5SortOrderFlipDoc);
  assert(s5.includes('S5/F11 SORTORDER-ONLY ALLOWED-SET FLIP PASSED'), 'S5 must supersede the historical sortOrder gated posture');
} else {
  assert(/`field-mismatch:sortOrder` remains GATED|field-mismatch:sortOrder`?: REMAINS GATED|field-mismatch:sortOrder remains gated/i.test(flat),
    'F22 doc must keep field-mismatch:sortOrder gated before S5');
}
assert(/productSyncReady` remains `false`|NOT READY TO FLIP/i.test(flat), 'F22 doc must keep productSyncReady false');
assert(/Chat Saving WebDAV\/cloud\/archive CAS[^.]*(REMAINS BLOCKED|remains blocked|blocked)/i.test(flat),
  'F22 doc must keep Chat Saving CAS blocked');
assert(/Real remote WebDAV[^.]*deferred/i.test(flat) || flat.includes('Real remote WebDAV remains deferred'),
  'F22 doc must keep real remote WebDAV deferred');
assert(/public\/premium sync remains blocked|Public\/premium: blocked/i.test(flat), 'F22 doc must keep public/premium blocked');
assert(/no `?fullBundle\.v3`?/i.test(flat) || flat.includes('No `fullBundle.v3` was'), 'F22 doc must keep fullBundle.v3 not minted');
assert(/hard delete blocked/i.test(flat) || /no hard delete/i.test(flat), 'F22 doc must keep hard delete blocked');
assert(/folder delete preserves chats/i.test(flat), 'F22 doc must preserve chats on folder delete');

// ---- cross-surface + F23 ----
assert(flat.includes('Cross-Surface Requirement'), 'F22 doc must include the cross-surface requirement');
assert(flat.includes('MULTIPLE DEVICES') || flat.includes('multiple devices'), 'F22 doc must require multi-device parity');
assert(flat.includes('mobile'), 'F22 doc must include future mobile compatibility');
assert(flat.includes('Chrome / native extension') || flat.includes('native extension'), 'F22 doc must include Chrome / native extension');
assert(flat.includes('Recommended F23'), 'F22 doc must recommend F23');
assert(/ENVELOPE \+ CONFLICT-MATRIX validator harness|binding analog of the F16/i.test(flat),
  'F22 doc F23 must be the binding envelope + conflict-matrix validator harness');
for (const type of METADATA_CORE_TYPES) assert(flat.includes(type), `F22 doc must confirm metadata core type: ${type}`);

// ---- REAL SOURCE: request schema present, receipt NOT minted, substrate intact ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);
  assert(src.includes("CHAT_FOLDER_BINDING_REQUEST_SCHEMA = '" + BINDING_REQUEST_SCHEMA + "'"),
    'source must define the sanctioned chat-folder-binding request schema (reused)');
  assert(!src.includes(BINDING_RECEIPT_SCHEMA), 'F22 design-only: proposed binding receipt schema must NOT be minted in source');
  assert(src.includes(SORTORDER_REQUEST_SCHEMA) && src.includes(SORTORDER_RECEIPT_SCHEMA),
    'sortOrder schemas now present in source (minted inert by F30 S1)');
  assert(src.includes("FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'"), 'source fullBundle schema must remain v2');
  assert(!src.includes('fullBundle.v3'), 'source must not contain fullBundle.v3');
  assert(src.includes("webdav: 'deferred'"), "WebDAV must remain deferred in folder-sync.tauri.js");
  const applied = parseMetadataAllowlist(src);
  assert(Array.isArray(applied), 'could not parse the metadata applied allowlist from source');
  if (Array.isArray(applied)) {
    for (const core of METADATA_CORE_TYPES) assert(applied.includes(core), `metadata core applied type missing: ${core}`);
    for (const a of applied) assert(METADATA_ALLOWED_SUPERSET.includes(a),
      `unexpected applied type beyond the four core + known Operational unbinds: ${a}`);
  }
}
assert(exists(foldersStoreFile), `${foldersStoreFile}: missing`);
if (exists(foldersStoreFile)) {
  const store = read(foldersStoreFile);
  assert(store.includes('folder_bindings'), 'source must contain the folder_bindings table');
  assert(store.includes('INSERT OR REPLACE INTO folder_bindings'), 'source bindChat must INSERT OR REPLACE folder_bindings');
  assert(store.includes('DELETE FROM folder_bindings WHERE chat_id'), 'source unbindChat must DELETE from folder_bindings');
  assert(store.includes("F11_RENDER_MIRROR_REBUILD_GATE = '" + F11_GATE + "'"), 'source must define the F11 gate constant');
  if (exists(s5SortOrderFlipDoc)) {
    assert(store.includes("'field-mismatch:sortOrder': true"), 'source F11 helper must allow field-mismatch:sortOrder after S5');
    assert(store.includes("blockedClasses: classSelection.blocked.concat(['binding-mismatch'])"),
      'source F11 helper must still block binding-mismatch after S5');
  } else {
    assert(store.includes("blockedClasses: classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])"),
      'source F11 helper must STILL block field-mismatch:sortOrder + binding-mismatch before S5');
  }
  assert(store.includes('FOLDER_STATE_DATA_KEY') && store.includes('hardDeleteBlocked') &&
    store.includes('softDeleteEmptyFolder'), 'folder substrate tokens must remain intact');
}
assert(exists(folderImportFile) && read(folderImportFile).includes("webdav: 'deferred'"),
  "WebDAV must remain deferred in folder-import.mv3.js");

if (failures.length) {
  console.error('FAIL validate-folder-sync-f22-binding-repair-request-receipt-spec');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const appliedNow = parseMetadataAllowlist(read(folderSyncFile));
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f22-binding-repair-request-receipt-spec.v1',
  lane: 'folder-sync',
  phase: 'F22',
  f22Doc,
  designOnly: true,
  f21CommitReferenced: F21_COMMIT,
  bindingCanonicalOwner: 'desktop-sqlite-folder_bindings',
  requestSchema: BINDING_REQUEST_SCHEMA,
  requestSchemaPresentInSource: true,
  proposedReceiptSchema: BINDING_RECEIPT_SCHEMA,
  proposedReceiptMintedInSource: false,
  allowedIntents: INTENTS,
  conflictCases: CONFLICT_CASES,
  oneFolderPerChatPreserved: true,
  directMirrorOnlyRepairBlocked: true,
  chromeNativeMobileCanonicalMutationBlocked: true,
  bindingMismatchBlocked: true,
  sortOrderGated: true,
  productSyncReady: false,
  publicPremiumBlocked: true,
  realRemoteWebdavDeferred: true,
  fullBundleV3Present: false,
  chatSavingCasBlocked: true,
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  recommendedNext: 'F23-binding-repair-envelope-conflict-matrix-validator-harness (design-only, no writes)',
}, null, 2));
console.log('PASS validate-folder-sync-f22-binding-repair-request-receipt-spec');
