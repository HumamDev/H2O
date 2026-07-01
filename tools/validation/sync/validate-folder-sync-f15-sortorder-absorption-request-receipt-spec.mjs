#!/usr/bin/env node
//
// Folder Sync Phase F15 — sortOrder absorption / request-receipt loop spec meta-validator (design/spec only).
//
// Verifies the F15 doc exists and is internally consistent (design/spec only): references the F14 commit;
// is design/spec-only (no implementation, no sortOrder writes); defines Desktop SQLite canonical for
// sortOrder and Chrome/native/mobile as non-canonical proposers; specifies the request -> Desktop apply ->
// receipt -> read-only projection absorption path; defines the request envelope fields and the receipt
// fields; defines the conflict matrix; defines when field-mismatch:sortOrder may join the allowed rebuild
// set; defines the validators-needed + live-proof requirements; keeps binding-mismatch blocked/separate;
// keeps productSyncReady false, public/premium blocked, real remote WebDAV deferred, Chat Saving
// WebDAV/cloud/archive CAS blocked; carries the cross-surface (Desktop + Chrome/native multi-device +
// mobile) requirement; and recommends F16. It grounds the request/receipt precedent + folder substrate
// against REAL SOURCE and uses a BOUNDED metadata-lane guard. Binds no socket; makes no network call;
// performs no write.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const f15Doc = 'release-evidence/2026-06-25/folder-sync-f15-sortorder-absorption-request-receipt-spec.md';
const f14Doc = 'release-evidence/2026-06-25/folder-sync-f14-sortorder-ownership-decision.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const F14_COMMIT = '58781a0';
const F11_GATE = 'folder-sync-f11-render-only-mirror-rebuild';
const PROPOSED_REQUEST_SCHEMA = 'h2o.studio.folder-sortorder-reorder-request.v1';
const PROPOSED_RECEIPT_SCHEMA = 'h2o.studio.folder-sortorder-reorder-receipt.v1';
const REQUEST_FIELDS = ['requestId', 'sourcePeerId', 'surfaceKind', 'orderPayload', 'basisOrderingHash',
  'requestedOrderingHash', 'createdAt', 'idempotencyKey'];
const RECEIPT_FIELDS = ['requestId', 'status', 'reason', 'resultingOrderingHash', 'canonicalAuthority',
  'noDestructiveMutation'];
const CONFLICT_CASES = ['stale-basis', 'duplicate', 'missing-folder', 'tombstoned-folder', 'unknown-folder',
  'folder-not-in-catalog', 'superseded-concurrent'];
const METADATA_CORE_TYPES = ['chat-category-assign', 'chat-category-clear', 'chat-label-bind', 'chat-tag-bind'];
const METADATA_ALLOWED_SUPERSET = METADATA_CORE_TYPES.concat(['chat-label-unbind', 'chat-tag-unbind']);
// existing request/receipt precedent that must remain in source (pattern the spec reuses)
const PRECEDENT_SCHEMAS = [
  "FOLDER_DELETE_REQUEST_SCHEMA = 'h2o.studio.folder-delete-request.v1'",
  "CHAT_FOLDER_BINDING_REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1'",
  "LIBRARY_METADATA_MUTATION_REQUEST_SCHEMA = 'h2o.studio.library-metadata-mutation-request.v1'",
  "LIBRARY_METADATA_MUTATION_RECEIPT_SCHEMA = 'h2o.studio.library-metadata-mutation-receipt.v1'",
];

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
assert(exists(f15Doc), `${f15Doc}: missing`);
if (!exists(f15Doc)) {
  console.error('FAIL validate-folder-sync-f15-sortorder-absorption-request-receipt-spec');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f15Doc);
assert(doc.length > 6000, `${f15Doc}: F15 doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- design/spec-only markers ----
assert(flat.includes('DESIGN / SPECIFICATION ONLY'), 'F15 doc must mark itself design/spec only');
assert(flat.includes('No product source was modified'), 'F15 doc must state no product source modified');
assert(/No sortOrder request loop was implemented|No .* was implemented/i.test(flat),
  'F15 doc must state no implementation was done');
assert(/No sortOrder writes were added/i.test(flat), 'F15 doc must state no sortOrder writes were added');

// ---- F14 commit reference + collision note ----
assert(flat.includes(F14_COMMIT), `F15 doc must reference the F14 commit ${F14_COMMIT}`);
assert(exists(f14Doc), 'F14 evidence doc must exist on disk');
assert(/validate-f15-cutover|folder-sync-f15-\*|separate from the pre-existing/i.test(flat),
  'F15 doc must note it is separate from the pre-existing validate-f15-cutover lane');

// ---- canonical model ----
assert(/Desktop SQLite (is )?canonical/i.test(flat) && flat.includes('sortOrder') || flat.includes('sort_order'),
  'F15 doc must define Desktop SQLite canonical for sortOrder');
assert(/non-canonical proposer/i.test(flat) || /non-canonical (future )?participants \(proposers/i.test(flat),
  'F15 doc must define Chrome/native/mobile as non-canonical proposers');
assert(flat.includes('FOLDER_STATE_DATA_KEY') && /derived render projection/i.test(flat),
  'F15 doc must define the mirror as a derived render projection');

// ---- absorption path request -> apply -> receipt -> read-only projection ----
assert(/reorder REQUEST|reorder request/i.test(flat), 'F15 doc must specify the reorder request');
assert(/Desktop VALIDATES|Desktop validates/i.test(flat), 'F15 doc must specify Desktop validation');
assert(/APPLIES the accepted order to canonical SQLite `?sort_order`?|applies .* SQLite `?sort_order`?/i.test(flat),
  'F15 doc must specify Desktop applies to SQLite sort_order');
assert(/emits a RECEIPT|emits a receipt/i.test(flat), 'F15 doc must specify Desktop emits a receipt');
assert(/PROJECTED FROM SQLite|projected from SQLite|write-through projection/i.test(flat),
  'F15 doc must specify the mirror is projected from SQLite');
assert(/IMPORT the read-only projection|import .* read-only projection|read-only projection/i.test(flat),
  'F15 doc must specify Chrome/native/mobile import the read-only projection');

// ---- proposed schema names ----
assert(flat.includes(PROPOSED_REQUEST_SCHEMA), `F15 doc must propose the request schema ${PROPOSED_REQUEST_SCHEMA}`);
assert(flat.includes(PROPOSED_RECEIPT_SCHEMA), `F15 doc must propose the receipt schema ${PROPOSED_RECEIPT_SCHEMA}`);

// ---- request fields ----
for (const f of REQUEST_FIELDS) assert(flat.includes(f), `F15 doc must define request field: ${f}`);
assert(/redaction requirements/i.test(flat), 'F15 doc must define request redaction requirements');

// ---- receipt fields ----
for (const f of RECEIPT_FIELDS) assert(flat.includes(f), `F15 doc must define receipt field: ${f}`);
assert(/applied.*skipped.*rejected|`applied` \| `skipped` \| `rejected`/i.test(flat),
  'F15 doc must define receipt status applied/skipped/rejected');

// ---- conflict matrix ----
for (const c of CONFLICT_CASES) assert(flat.includes(c), `F15 doc must define conflict case: ${c}`);
assert(/multi-device concurrent reorder/i.test(flat), 'F15 doc must define multi-device concurrent reorder');

// ---- safety invariants ----
for (const inv of ['no hard delete', 'no folder delete / purge', 'no chat delete', 'no binding repair',
  'no Chrome / mobile canonical mutation', 'Desktop remains canonical']) {
  assert(flat.includes(inv), `F15 doc must include safety invariant: ${inv}`);
}
assert(/TRANSPORT ONLY|transport only/i.test(flat) && /disabled-by-default|dev-only/i.test(flat),
  'F15 doc must keep WebDAV/cloud/relay transport-only and disabled-by-default/dev-only');

// ---- when sortOrder may join rebuild set + validators + live proof ----
assert(/May Join the Allowed Mirror Rebuild Set|may be added to the allowed .* rebuild set/i.test(flat),
  'F15 doc must define when field-mismatch:sortOrder may join the rebuild set');
assert(flat.includes('field-mismatch:sortOrder'), 'F15 doc must discuss field-mismatch:sortOrder');
assert(/Validators Needed Before Implementation/i.test(flat), 'F15 doc must define validators needed before implementation');
assert(/Live Proof Requirements/i.test(flat), 'F15 doc must define live proof requirements');

// ---- binding blocked ----
assert(/binding-mismatch[^.]*(BLOCKED|blocked)/i.test(flat), 'F15 doc must keep binding-mismatch blocked');
assert(/separate/i.test(flat), 'F15 doc must keep binding repair separate');

// ---- postures ----
assert(/productSyncReady` remains `false`|NOT READY TO FLIP/i.test(flat), 'F15 doc must keep productSyncReady false');
assert(/no `?fullBundle\.v3`?/i.test(flat) || flat.includes('No `fullBundle.v3` was'), 'F15 doc must state no fullBundle.v3');
assert(/Chat Saving WebDAV\/cloud\/archive CAS[^.]*(REMAINS BLOCKED|remains blocked|BLOCKED)/i.test(flat),
  'F15 doc must keep Chat Saving CAS blocked');
assert(/Real remote WebDAV[^.]*deferred/i.test(flat) || flat.includes('Real remote WebDAV remains deferred'),
  'F15 doc must keep real remote WebDAV deferred');
assert(/public\/premium sync remains blocked|Public\/premium: blocked/i.test(flat),
  'F15 doc must keep public/premium blocked');
assert(/hard delete blocked/i.test(flat) || /no hard delete/i.test(flat), 'F15 doc must keep hard delete blocked');
assert(/folder delete preserves chats/i.test(flat), 'F15 doc must preserve chats on folder delete');

// ---- cross-surface ----
assert(flat.includes('Cross-Surface Requirement'), 'F15 doc must include the cross-surface requirement');
assert(flat.includes('MULTIPLE DEVICES') || flat.includes('multiple devices'), 'F15 doc must require multi-device parity');
assert(flat.includes('mobile'), 'F15 doc must include future mobile compatibility');
assert(flat.includes('Chrome / native extension') || flat.includes('native extension'),
  'F15 doc must include Chrome / native extension');

// ---- F16 recommendation ----
assert(flat.includes('Recommended F16'), 'F15 doc must recommend F16');
assert(/envelope|conflict-matrix|conflict matrix/i.test(flat), 'F15 doc F16 must be the envelope + conflict-matrix validator harness');
assert(/design-only|no writes|writes nothing|no runtime/i.test(flat), 'F15 doc F16 must be design-only / no writes');

// ---- metadata core named ----
for (const type of METADATA_CORE_TYPES) assert(flat.includes(type), `F15 doc must confirm metadata core type: ${type}`);

// ---- REAL SOURCE: request/receipt precedent intact; NOT minted the proposed schemas ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);
  for (const p of PRECEDENT_SCHEMAS) assert(src.includes(p), `request/receipt precedent must remain in source: ${p}`);
  // design-only: the proposed sortorder reorder schemas must NOT be minted in source yet
  assert(!src.includes(PROPOSED_REQUEST_SCHEMA), 'F15 is design-only: proposed request schema must NOT be minted in source');
  assert(!src.includes(PROPOSED_RECEIPT_SCHEMA), 'F15 is design-only: proposed receipt schema must NOT be minted in source');
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

// ---- REAL SOURCE: folder substrate + F11 helper still keeps sortOrder blocked ----
assert(exists(foldersStoreFile), `${foldersStoreFile}: missing`);
if (exists(foldersStoreFile)) {
  const store = read(foldersStoreFile);
  assert(store.includes("var sortCol = 'sort_order'"), 'source listFolders must order by the canonical sort_order column');
  assert(store.includes("F11_RENDER_MIRROR_REBUILD_GATE = '" + F11_GATE + "'"), 'source must define the F11 gate constant');
  assert(store.includes("blockedClasses: classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])"),
    'source F11 helper must still block field-mismatch:sortOrder + binding-mismatch');
  assert(store.includes('FOLDER_STATE_DATA_KEY') && store.includes('hardDeleteBlocked') &&
    store.includes('softDeleteEmptyFolder'), 'folder substrate tokens must remain intact');
}
assert(exists(folderImportFile) && read(folderImportFile).includes("webdav: 'deferred'"),
  "WebDAV must remain deferred in folder-import.mv3.js");

if (failures.length) {
  console.error('FAIL validate-folder-sync-f15-sortorder-absorption-request-receipt-spec');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const appliedNow = parseMetadataAllowlist(read(folderSyncFile));
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f15-sortorder-absorption-request-receipt-spec.v1',
  lane: 'folder-sync',
  phase: 'F15',
  f15Doc,
  designOnly: true,
  f14CommitReferenced: F14_COMMIT,
  sortOrderCanonicalOwner: 'desktop-sqlite',
  proposers: ['chrome-extension', 'native-extension', 'mobile'],
  absorptionPath: 'request -> desktop-validate -> apply-sqlite-sort_order -> receipt -> project-mirror -> read-only-import',
  proposedRequestSchema: PROPOSED_REQUEST_SCHEMA,
  proposedReceiptSchema: PROPOSED_RECEIPT_SCHEMA,
  proposedSchemasMintedInSource: false,
  conflictCases: CONFLICT_CASES,
  sortOrderCanJoinRebuildLater: 'conditional-after-loop-implemented-and-proven',
  bindingMismatchBlocked: true,
  productSyncReady: false,
  publicPremiumBlocked: true,
  realRemoteWebdavDeferred: true,
  chatSavingCasBlocked: true,
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  recommendedNext: 'F16-sortorder-absorption-envelope-conflict-matrix-validator-harness (design-only, no writes)',
}, null, 2));
console.log('PASS validate-folder-sync-f15-sortorder-absorption-request-receipt-spec');
