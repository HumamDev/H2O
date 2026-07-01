#!/usr/bin/env node
//
// Folder Sync Phase F16 — sortOrder absorption envelope + conflict-matrix validator harness
// (design-only; SYNTHETIC fixtures; no runtime; no writes).
//
// This meta-validator (a) grounds the F16 doc against the F15 contract and the standing postures, and
// (b) actually EXERCISES the F15 request/receipt contract + conflict matrix using SYNTHETIC fixtures
// embedded below. It defines a pure canonical snapshot (tokenized ids only), a request-envelope checker,
// a receipt-envelope checker, and a pure decideReorder(request, canonical, ctx) specification oracle, and
// asserts each of the eight conflict fixtures yields the specified receipt (applied, stale-basis,
// duplicate, missing-folder, tombstoned-folder, unknown-folder, folder-not-in-catalog,
// superseded-concurrent) with the safety invariants (canonicalAuthority: desktop-sqlite;
// noDestructiveMutation: true) on every receipt. It also asserts against REAL SOURCE that the proposed
// schemas are NOT minted, that F11 still blocks field-mismatch:sortOrder + binding-mismatch, that SQLite
// sort_order remains canonical, that WebDAV stays deferred and fullBundle stays v2, using a BOUNDED
// metadata-lane guard. No runtime module is loaded; no network; no write.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const f16Doc = 'release-evidence/2026-06-25/folder-sync-f16-sortorder-envelope-conflict-matrix-harness.md';
const f15Doc = 'release-evidence/2026-06-25/folder-sync-f15-sortorder-absorption-request-receipt-spec.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const F15_COMMIT = 'cc0bda9';
const F11_GATE = 'folder-sync-f11-render-only-mirror-rebuild';
const REQUEST_SCHEMA = 'h2o.studio.folder-sortorder-reorder-request.v1';
const RECEIPT_SCHEMA = 'h2o.studio.folder-sortorder-reorder-receipt.v1';
const SURFACE_KINDS = ['chrome-extension', 'native-extension', 'mobile'];
const FORBIDDEN_KEYS = ['name', 'title', 'content'];
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

// ============================================================================================
// SYNTHETIC FIXTURE HARNESS (pure; no runtime; no writes)
// ============================================================================================

// Tokenized canonical snapshot — folder ids only, no raw names/titles/content.
const H0 = 'sha256:base0000000000000000';        // current canonical ordering hash
const HA = 'sha256:applieda00000000000';          // ordering hash after concurrent request A applies
const CANON = {
  orderingHash: H0,
  knownFolderIds: new Set(['ftok_a', 'ftok_b', 'ftok_c', 'ftok_d', 'ftok_e', 'ftok_hidden']),
  presentFolderIds: new Set(['ftok_a', 'ftok_b', 'ftok_c', 'ftok_hidden']), // exist & not tombstoned
  tombstonedFolderIds: new Set(['ftok_d']),
  visibleCatalogIds: new Set(['ftok_a', 'ftok_b', 'ftok_c']),               // shown subset
};

// hash-only token guard: sha256: prefix + opaque alphanumeric body (redaction intent, not strict hex).
function isHash(v) { return typeof v === 'string' && /^sha256:[0-9a-z]+$/i.test(v); }
function hasForbiddenKeys(obj) {
  if (!obj || typeof obj !== 'object') return false;
  for (const k of Object.keys(obj)) {
    if (FORBIDDEN_KEYS.includes(k)) return true;
    const v = obj[k];
    if (v && typeof v === 'object' && hasForbiddenKeys(v)) return true;
  }
  return false;
}

// ---- request envelope checker (returns array of problems) ----
function checkRequestEnvelope(req) {
  const problems = [];
  if (!req || typeof req !== 'object') return ['request-not-object'];
  if (req.schema !== REQUEST_SCHEMA) problems.push('bad-schema');
  if (!req.requestId) problems.push('missing-requestId');
  if (!req.sourcePeerId && !req.deviceId) problems.push('missing-peer-or-device-id');
  if (!SURFACE_KINDS.includes(req.surfaceKind)) problems.push('bad-surfaceKind');
  if (!Array.isArray(req.orderPayload) || !req.orderPayload.length) problems.push('bad-orderPayload');
  else {
    for (const entry of req.orderPayload) {
      if (!entry || typeof entry.folderId !== 'string' || !/^ftok_/.test(entry.folderId)) problems.push('bad-folderId-token');
      if (typeof entry.position !== 'number') problems.push('bad-position');
      if (hasForbiddenKeys(entry)) problems.push('raw-name-leak');
    }
  }
  if (!isHash(req.basisOrderingHash)) problems.push('bad-basisOrderingHash');
  if (!isHash(req.requestedOrderingHash)) problems.push('bad-requestedOrderingHash');
  if (!req.createdAt || Number.isNaN(Date.parse(req.createdAt))) problems.push('bad-createdAt');
  if (!req.idempotencyKey) problems.push('missing-idempotencyKey');
  if (hasForbiddenKeys(req)) problems.push('raw-name-leak-top');
  return problems;
}

// ---- receipt envelope checker ----
function checkReceiptEnvelope(rcpt) {
  const problems = [];
  if (!rcpt || typeof rcpt !== 'object') return ['receipt-not-object'];
  if (rcpt.schema !== RECEIPT_SCHEMA) problems.push('bad-schema');
  if (!rcpt.requestId) problems.push('missing-requestId');
  if (!['applied', 'skipped', 'rejected'].includes(rcpt.status)) problems.push('bad-status');
  if (!rcpt.reason) problems.push('missing-reason');
  if (!isHash(rcpt.resultingOrderingHash)) problems.push('bad-resultingOrderingHash');
  if (rcpt.canonicalAuthority !== 'desktop-sqlite') problems.push('bad-canonicalAuthority');
  if (rcpt.noDestructiveMutation !== true) problems.push('bad-noDestructiveMutation');
  if (!rcpt.appliedAt && !rcpt.decidedAt) problems.push('missing-timestamp');
  if (hasForbiddenKeys(rcpt)) problems.push('raw-name-leak');
  return problems;
}

// ---- pure decision oracle: models Desktop validation of a reorder request ----
function decideReorder(req, canon, ctx) {
  ctx = ctx || {};
  const appliedKeys = ctx.appliedKeys || new Set();
  const receipt = {
    schema: RECEIPT_SCHEMA,
    requestId: req.requestId,
    status: 'rejected',
    reason: 'rejected',
    resultingOrderingHash: canon.orderingHash,
    canonicalAuthority: 'desktop-sqlite',
    noDestructiveMutation: true,
    decidedAt: '2026-07-01T00:00:00.000Z',
  };
  // 1. duplicate / idempotency
  if (appliedKeys.has(req.idempotencyKey)) {
    receipt.status = 'skipped';
    receipt.reason = 'duplicate';
    return receipt;
  }
  // 2. basis mismatch (stale, or superseded by a concurrent apply in the same batch)
  if (req.basisOrderingHash !== canon.orderingHash) {
    receipt.status = 'rejected';
    receipt.reason = ctx.priorAppliedInBatch ? 'superseded-concurrent' : 'stale-basis';
    return receipt;
  }
  // 3. per-folder validation (mutually exclusive precedence)
  for (const entry of req.orderPayload) {
    const fid = entry.folderId;
    if (!canon.knownFolderIds.has(fid)) { receipt.reason = 'unknown-folder'; return receipt; }
    if (canon.tombstonedFolderIds.has(fid)) { receipt.reason = 'tombstoned-folder'; return receipt; }
    if (!canon.presentFolderIds.has(fid)) { receipt.reason = 'missing-folder'; return receipt; }
    if (!canon.visibleCatalogIds.has(fid)) { receipt.reason = 'folder-not-in-catalog'; return receipt; }
  }
  // 4. accepted -> applied (Desktop applies to SQLite sort_order; mirror re-projected)
  receipt.status = 'applied';
  receipt.reason = 'applied';
  receipt.resultingOrderingHash = req.requestedOrderingHash;
  receipt.appliedAt = '2026-07-01T00:00:00.000Z';
  return receipt;
}

function mkReq(over) {
  return Object.assign({
    schema: REQUEST_SCHEMA,
    requestId: 'req_' + Math.random().toString(16).slice(2, 10),
    sourcePeerId: 'sha256:peer00000000',
    surfaceKind: 'chrome-extension',
    orderPayload: [{ folderId: 'ftok_a', position: 0 }, { folderId: 'ftok_b', position: 1 }, { folderId: 'ftok_c', position: 2 }],
    basisOrderingHash: H0,
    requestedOrderingHash: 'sha256:req000000000000',
    createdAt: '2026-07-01T00:00:00.000Z',
    idempotencyKey: 'idem_' + Math.random().toString(16).slice(2, 10),
  }, over || {});
}

function runHarness() {
  const results = [];
  const record = (name, req, receipt, expectStatus, expectReason) => {
    const reqProblems = checkRequestEnvelope(req);
    const rcptProblems = checkReceiptEnvelope(receipt);
    assert(reqProblems.length === 0, `F16 fixture ${name}: request envelope invalid: ${reqProblems.join(',')}`);
    assert(rcptProblems.length === 0, `F16 fixture ${name}: receipt envelope invalid: ${rcptProblems.join(',')}`);
    assert(receipt.status === expectStatus, `F16 fixture ${name}: status ${receipt.status} != ${expectStatus}`);
    assert(receipt.reason === expectReason, `F16 fixture ${name}: reason ${receipt.reason} != ${expectReason}`);
    assert(receipt.canonicalAuthority === 'desktop-sqlite', `F16 fixture ${name}: canonicalAuthority not desktop-sqlite`);
    assert(receipt.noDestructiveMutation === true, `F16 fixture ${name}: noDestructiveMutation not true`);
    results.push({ name, status: receipt.status, reason: receipt.reason });
  };

  // 1. valid apply
  const rValid = mkReq();
  record('valid-apply', rValid, decideReorder(rValid, CANON, {}), 'applied', 'applied');

  // 2. stale basis
  const rStale = mkReq({ basisOrderingHash: 'sha256:staleeeeeeeeeeee' });
  record('stale-basis', rStale, decideReorder(rStale, CANON, {}), 'rejected', 'stale-basis');

  // 3. duplicate request (idempotency key already applied)
  const rDup = mkReq({ idempotencyKey: 'idem_alreadyseen' });
  record('duplicate', rDup, decideReorder(rDup, CANON, { appliedKeys: new Set(['idem_alreadyseen']) }), 'skipped', 'duplicate');

  // 4. missing folder (known but no longer present, not tombstoned)
  const rMissing = mkReq({ orderPayload: [{ folderId: 'ftok_e', position: 0 }] });
  record('missing-folder', rMissing, decideReorder(rMissing, CANON, {}), 'rejected', 'missing-folder');

  // 5. tombstoned folder
  const rTomb = mkReq({ orderPayload: [{ folderId: 'ftok_d', position: 0 }] });
  record('tombstoned-folder', rTomb, decideReorder(rTomb, CANON, {}), 'rejected', 'tombstoned-folder');

  // 6. unknown folder
  const rUnknown = mkReq({ orderPayload: [{ folderId: 'ftok_zzz', position: 0 }] });
  record('unknown-folder', rUnknown, decideReorder(rUnknown, CANON, {}), 'rejected', 'unknown-folder');

  // 7. folder not in visible catalog
  const rHidden = mkReq({ orderPayload: [{ folderId: 'ftok_hidden', position: 0 }] });
  record('folder-not-in-catalog', rHidden, decideReorder(rHidden, CANON, {}), 'rejected', 'folder-not-in-catalog');

  // 8. multi-device concurrent: A applies, B decided against updated canonical -> superseded-concurrent
  const reqA = mkReq({ idempotencyKey: 'idem_A', requestedOrderingHash: HA, sourcePeerId: 'sha256:peerA0000000' });
  const receiptA = decideReorder(reqA, CANON, {});
  assert(receiptA.status === 'applied', 'F16 concurrent: request A must apply first');
  const canonAfterA = Object.assign({}, CANON, { orderingHash: receiptA.resultingOrderingHash });
  const reqB = mkReq({ idempotencyKey: 'idem_B', basisOrderingHash: H0, surfaceKind: 'mobile', sourcePeerId: 'sha256:peerB0000000' });
  record('multi-device-concurrent', reqB,
    decideReorder(reqB, canonAfterA, { appliedKeys: new Set(['idem_A']), priorAppliedInBatch: true }),
    'rejected', 'superseded-concurrent');

  // negative controls: a malformed request and a bad receipt MUST be caught by the checkers
  const badReq = mkReq({ orderPayload: [{ folderId: 'ftok_a', position: 0, title: 'Secret Folder' }] });
  assert(checkRequestEnvelope(badReq).includes('raw-name-leak'), 'F16 redaction guard must catch a raw name leak in the request');
  const badReceipt = { schema: RECEIPT_SCHEMA, requestId: 'x', status: 'applied', reason: 'applied',
    resultingOrderingHash: H0, canonicalAuthority: 'chrome', noDestructiveMutation: true, appliedAt: '2026-07-01T00:00:00.000Z' };
  assert(checkReceiptEnvelope(badReceipt).includes('bad-canonicalAuthority'),
    'F16 authority guard must reject a non-desktop canonicalAuthority');

  return results;
}

// ---- doc presence ----
assert(exists(f16Doc), `${f16Doc}: missing`);
if (!exists(f16Doc)) {
  console.error('FAIL validate-folder-sync-f16-sortorder-envelope-conflict-matrix-harness');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f16Doc);
assert(doc.length > 5000, `${f16Doc}: F16 doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- design/harness-only markers ----
assert(flat.includes('DESIGN / VALIDATOR HARNESS ONLY') && /SYNTHETIC FIXTURES/i.test(flat),
  'F16 doc must mark itself validator-harness-only with synthetic fixtures');
assert(flat.includes('No product source was modified'), 'F16 doc must state no product source modified');
assert(/No .* was implemented|no runtime behavior was implemented/i.test(flat), 'F16 doc must state no implementation was done');
assert(/No sortOrder writes were added/i.test(flat), 'F16 doc must state no sortOrder writes were added');

// ---- F15 commit reference ----
assert(flat.includes(F15_COMMIT), `F16 doc must reference the F15 commit ${F15_COMMIT}`);
assert(exists(f15Doc), 'F15 spec doc must exist on disk');

// ---- envelopes + conflict matrix + postures in doc ----
assert(flat.includes(REQUEST_SCHEMA) && flat.includes(RECEIPT_SCHEMA), 'F16 doc must name the proposed request+receipt schemas');
for (const f of ['requestId', 'sourcePeerId', 'surfaceKind', 'orderPayload', 'basisOrderingHash',
  'requestedOrderingHash', 'createdAt', 'idempotencyKey']) {
  assert(flat.includes(f), `F16 doc must document request field: ${f}`);
}
for (const f of ['status', 'reason', 'resultingOrderingHash', 'canonicalAuthority', 'noDestructiveMutation']) {
  assert(flat.includes(f), `F16 doc must document receipt field: ${f}`);
}
for (const c of ['stale-basis', 'duplicate', 'missing-folder', 'tombstoned-folder', 'unknown-folder',
  'folder-not-in-catalog', 'superseded-concurrent']) {
  assert(flat.includes(c), `F16 doc must document conflict case: ${c}`);
}
assert(/EMBEDDED in the F16 validator|embedded directly in the F16 validator/i.test(flat),
  'F16 doc must state fixtures are embedded in the validator');
assert(/binding-mismatch[^.]*(BLOCKED|blocked)/i.test(flat), 'F16 doc must keep binding-mismatch blocked');
assert(/field-mismatch:sortOrder/.test(flat) && /gated|GATED/i.test(flat), 'F16 doc must keep field-mismatch:sortOrder gated');
assert(/productSyncReady` remains `false`|NOT READY TO FLIP/i.test(flat), 'F16 doc must keep productSyncReady false');
assert(/Chat Saving WebDAV\/cloud\/archive CAS[^.]*(REMAINS BLOCKED|remains blocked|BLOCKED)/i.test(flat),
  'F16 doc must keep Chat Saving CAS blocked');
assert(/Real remote WebDAV[^.]*deferred/i.test(flat) || flat.includes('Real remote WebDAV remains deferred'),
  'F16 doc must keep real remote WebDAV deferred');
assert(/public\/premium sync remains blocked|Public\/premium: blocked/i.test(flat), 'F16 doc must keep public/premium blocked');
assert(/hard delete blocked/i.test(flat) || /no hard delete/i.test(flat), 'F16 doc must keep hard delete blocked');
assert(/folder delete preserves chats/i.test(flat), 'F16 doc must preserve chats on folder delete');
assert(flat.includes('Cross-Surface Requirement'), 'F16 doc must include the cross-surface requirement');
assert(flat.includes('MULTIPLE DEVICES') || flat.includes('multiple devices'), 'F16 doc must require multi-device parity');
assert(flat.includes('mobile'), 'F16 doc must include future mobile compatibility');
assert(flat.includes('Chrome / native extension') || flat.includes('native extension'), 'F16 doc must include Chrome / native extension');
assert(flat.includes('Recommended F17'), 'F16 doc must recommend F17');
assert(/in-process|node:sqlite|APPLY proof/i.test(flat), 'F16 doc F17 must be the in-process apply proof harness');
for (const type of METADATA_CORE_TYPES) assert(flat.includes(type), `F16 doc must confirm metadata core type: ${type}`);

// ---- RUN THE SYNTHETIC HARNESS ----
let harnessResults = [];
try {
  harnessResults = runHarness();
} catch (e) {
  failures.push('F16 harness threw: ' + (e && e.message ? e.message : String(e)));
}
assert(harnessResults.length === 8, `F16 harness must exercise all 8 conflict fixtures (got ${harnessResults.length})`);

// ---- REAL SOURCE: proposed schemas NOT minted; F11 blocks sortOrder; sort_order canonical ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);
  assert(!src.includes(REQUEST_SCHEMA), 'F16 design-only: proposed request schema must NOT be minted in source');
  assert(!src.includes(RECEIPT_SCHEMA), 'F16 design-only: proposed receipt schema must NOT be minted in source');
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
  console.error('FAIL validate-folder-sync-f16-sortorder-envelope-conflict-matrix-harness');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const appliedNow = parseMetadataAllowlist(read(folderSyncFile));
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f16-sortorder-envelope-conflict-matrix-harness.v1',
  lane: 'folder-sync',
  phase: 'F16',
  f16Doc,
  designOnly: true,
  fixtures: 'embedded-synthetic',
  f15CommitReferenced: F15_COMMIT,
  requestSchema: REQUEST_SCHEMA,
  receiptSchema: RECEIPT_SCHEMA,
  proposedSchemasMintedInSource: false,
  conflictMatrix: harnessResults,
  conflictCaseCount: harnessResults.length,
  canonicalAuthority: 'desktop-sqlite',
  sortOrderGated: true,
  bindingMismatchBlocked: true,
  productSyncReady: false,
  publicPremiumBlocked: true,
  realRemoteWebdavDeferred: true,
  chatSavingCasBlocked: true,
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  recommendedNext: 'F17-in-process-fixture-backed-absorption-apply-proof-harness (temp node:sqlite, no product runtime change, no flip)',
}, null, 2));
console.log('PASS validate-folder-sync-f16-sortorder-envelope-conflict-matrix-harness');
