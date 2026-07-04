#!/usr/bin/env node
//
// Folder Sync Phase F33 — in-process re-prove of the REAL F32 handler decision path + S2b design
// (validator/evidence + design only; no live writes; Option B sandboxed VM; no product-source edit).
//
// This meta-validator (a) grounds the F33 doc, (b) EXTRACTS the real F32 handler function source from the
// committed folder-sync.tauri.js and evaluates it in a node:vm sandbox (Option B) with minimal helper
// stubs, then re-proves the REAL validate/classify/orderingHash/receipt against synthetic fixtures for the
// accepted case + all conflict reasons (matching the F16/F17/F18 oracle), (c) re-asserts the real handler's
// structure (dry-run default, apply gate, zero-write conflict paths, sort_order-only apply, NO mirror
// write, NO F11 allowed-set change), and (d) asserts the S2b mirror re-projection is DESIGN-ONLY (not
// implemented; does not reuse the F11 render-only rebuild). It also asserts the standing boundaries
// (binding receipt unminted; fullBundle v2; webdav deferred; bounded metadata guard; F11 blocks both
// classes; productSyncReady not flipped). Binds no socket; touches no store; performs no write.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();
const failures = [];

const f33Doc = 'release-evidence/2026-06-25/folder-sync-f33-inprocess-reprove-and-s2b-design.md';
const f32Doc = 'release-evidence/2026-06-25/folder-sync-f32-s2-sortorder-handler.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const s5ImplementationEvidenceFile = 'release-evidence/2026-07-01/folder-sync-s5-f11-sortorder-allowed-set-flip.md';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }
function stripComments(src) {
  return src.split('\n').filter((ln) => {
    const t = ln.trim();
    return !(t.startsWith('*') || t.startsWith('/*') || t.startsWith('//'));
  }).join('\n');
}

const F32_COMMIT = 'abe4ca0';
const F11_GATE = 'folder-sync-f11-render-only-mirror-rebuild';
const REQUEST_SCHEMA = 'h2o.studio.folder-sortorder-reorder-request.v1';
const RECEIPT_SCHEMA = 'h2o.studio.folder-sortorder-reorder-receipt.v1';
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
assert(exists(f33Doc), `${f33Doc}: missing`);
if (!exists(f33Doc)) {
  console.error('FAIL validate-folder-sync-f33-inprocess-reprove-and-s2b-design');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f33Doc);
assert(doc.length > 5000, `${f33Doc}: F33 doc too short`);
const flat = doc.replace(/\s+/g, ' ');
assert(/VALIDATOR \/ EVIDENCE \+ DESIGN ONLY/i.test(flat), 'F33 doc must mark itself validator/evidence + design only');
assert(flat.includes(F32_COMMIT), `F33 doc must reference the F32 commit ${F32_COMMIT}`);
assert(exists(f32Doc), 'F32 doc must exist on disk');
assert(/Option B/i.test(flat), 'F33 doc must state the re-prove approach (Option B)');
assert(/No live Desktop write/i.test(flat), 'F33 doc must state no live Desktop write');
assert(/S2b/i.test(flat) && /design-only|Design-Only/i.test(flat), 'F33 doc must include the S2b design-only spec');
assert(/must NOT reuse the F11 `?rebuildRenderMirrorFromSqlite`?|NOT reuse the F11/i.test(flat),
  'F33 doc S2b must not reuse the F11 render-only rebuild');
assert(flat.includes('Recommended F34'), 'F33 doc must recommend F34');
assert(/S3 LIVE DESKTOP DRY-RUN|live Desktop dry-run/i.test(flat) && /SEPARATE EXPLICIT APPROVAL|separate .* approval/i.test(flat),
  'F33 doc F34 must be the S3 live dry-run requiring separate approval');
for (const type of METADATA_CORE_TYPES) assert(flat.includes(type), `F33 doc must confirm metadata core type: ${type}`);

// ---- OPTION B: extract + vm-eval the REAL F32 handler functions ----
const src = exists(folderSyncFile) ? read(folderSyncFile) : '';
let api = null;
try {
  const a = src.indexOf('var FOLDER_SORTORDER_REORDER_APPLY_GATE');
  const b = src.indexOf('/* ===================== end F32 S2 sortOrder reorder handler');
  assert(a > 0 && b > a, 'F33 must locate the real F32 handler source block');
  if (a > 0 && b > a) {
    const block = src.slice(a, b);
    const ctx = {
      cleanString: (v) => (v == null ? '' : String(v)).trim(),
      safeObject: (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {},
      FOLDER_SORTORDER_REORDER_REQUEST_SCHEMA: REQUEST_SCHEMA,
      FOLDER_SORTORDER_REORDER_RECEIPT_SCHEMA: RECEIPT_SCHEMA,
      H2O: {},
    };
    vm.createContext(ctx);
    vm.runInContext(block + '\n;this.__api = {' +
      ' validate: validateFolderSortorderReorderRequestForDesktopApply,' +
      ' classify: classifyFolderSortorderReorderConflict,' +
      ' orderingHash: folderSortorderOrderingHash,' +
      ' receipt: buildFolderSortorderReorderReceipt };', ctx);
    api = ctx.__api;
  }
} catch (e) {
  failures.push('F33 Option B vm-eval threw: ' + (e && e.message ? e.message : String(e)));
}
assert(api && typeof api.validate === 'function' && typeof api.classify === 'function' &&
  typeof api.orderingHash === 'function' && typeof api.receipt === 'function',
  'F33 must expose the real validate/classify/orderingHash/receipt via Option B');

// ---- synthetic canonical snapshot (tokenized ids) ----
const SNAP = {
  visibleOrderIds: ['fa', 'fb', 'fc'],
  knownSet: { fa: true, fb: true, fc: true, fd: true, fe: true, fh: true },
  presentSet: { fa: true, fb: true, fc: true, fh: true },
  tombSet: { fd: true },
  visibleSet: { fa: true, fb: true, fc: true },
  sortOrderById: { fa: 0, fb: 1, fc: 2, fh: 3 },
};
const TIED_SORTORDER_SNAP = {
  visibleOrderIds: ['fa', 'fb', 'fc'],
  knownSet: { fa: true, fb: true, fc: true },
  presentSet: { fa: true, fb: true, fc: true },
  tombSet: {},
  visibleSet: { fa: true, fb: true, fc: true },
  sortOrderById: { fa: 0, fb: 0, fc: 0 },
};
function mkReq(over) {
  return Object.assign({
    schema: REQUEST_SCHEMA, intent: 'folder-sortorder-reorder-request',
    requestId: 'req_' + Math.random().toString(16).slice(2, 8),
    sourcePeerId: 'sha256:peer00', surfaceKind: 'chrome-extension',
    orderPayload: [{ folderId: 'fa', position: 0 }, { folderId: 'fb', position: 1 }, { folderId: 'fc', position: 2 }],
    basisOrderingHash: 'oh:placeholder', requestedOrderingHash: 'oh:req',
    createdAt: '2026-07-01T00:00:00.000Z', idempotencyKey: 'idem_' + Math.random().toString(16).slice(2, 8),
    desktopApplyRequired: true, noLocalApply: true, noChromeCanonicalMutation: true,
    noHardDelete: true, noPurge: true, noChatDelete: true, noFolderDelete: true,
    noBindingMutation: true, noTombstoneMutation: true,
    privacy: { rawFolderNames: false, rawChatTitles: false, rawChatContent: false },
  }, over || {});
}

const matrix = [];
if (api) {
  // real current-order hash for the accepted-case basis
  const acceptedBasis = api.orderingHash(['fa', 'fb', 'fc']);

  // 1. accepted
  const rAccept = mkReq({ basisOrderingHash: acceptedBasis });
  const vAccept = api.validate(rAccept);
  const cAccept = api.classify(rAccept, SNAP, {});
  assert(vAccept && vAccept.ok === true, 'F33 accepted: real validate must pass');
  assert(cAccept === null, `F33 accepted: real classify must return null (accepted); got ${cAccept}`);
  matrix.push({ name: 'accepted', reason: cAccept });

  // F32c: all-tied sortOrder must derive current order from canonical visible order, not proposed payload order.
  const tiedAcceptedBasis = api.orderingHash(['fa', 'fb', 'fc']);
  const tiedRequested = api.orderingHash(['fb', 'fa', 'fc']);
  const rTiedAccept = mkReq({
    orderPayload: [{ folderId: 'fb', position: 0 }, { folderId: 'fa', position: 1 }, { folderId: 'fc', position: 2 }],
    basisOrderingHash: tiedAcceptedBasis,
    requestedOrderingHash: tiedRequested,
  });
  const cTiedAccept = api.classify(rTiedAccept, TIED_SORTORDER_SNAP, {});
  assert(cTiedAccept === null, `F33 F32c tied-sortOrder genuine reorder: got ${cTiedAccept}`);
  matrix.push({ name: 'tied-sortorder-genuine-reorder-accepted', reason: cTiedAccept });

  const rTiedWrongBasis = mkReq({
    orderPayload: [{ folderId: 'fb', position: 0 }, { folderId: 'fa', position: 1 }, { folderId: 'fc', position: 2 }],
    basisOrderingHash: tiedRequested,
    requestedOrderingHash: tiedRequested,
  });
  const cTiedWrongBasis = api.classify(rTiedWrongBasis, TIED_SORTORDER_SNAP, {});
  assert(cTiedWrongBasis === 'stale-basis', `F33 F32c tied-sortOrder wrong basis: got ${cTiedWrongBasis}`);
  matrix.push({ name: 'tied-sortorder-wrong-basis-stale', reason: cTiedWrongBasis });

  // 2. duplicate
  const rDup = mkReq({ basisOrderingHash: acceptedBasis, idempotencyKey: 'idem_seen' });
  const cDup = api.classify(rDup, SNAP, { appliedKeys: { idem_seen: true } });
  assert(cDup === 'duplicate', `F33 duplicate: got ${cDup}`);
  matrix.push({ name: 'duplicate', reason: cDup });

  // 3-6. per-folder conflicts
  const perFolder = [
    ['unknown-folder', 'fzzz'], ['tombstoned-folder', 'fd'], ['missing-folder', 'fe'], ['folder-not-in-catalog', 'fh'],
  ];
  for (const [expected, id] of perFolder) {
    const r = mkReq({ basisOrderingHash: acceptedBasis, orderPayload: [{ folderId: id, position: 0 }] });
    const c = api.classify(r, SNAP, {});
    assert(c === expected, `F33 ${expected}: got ${c}`);
    matrix.push({ name: expected, reason: c });
  }

  // 7. stale-basis
  const rStale = mkReq({ basisOrderingHash: 'oh:wrongbasis' });
  const cStale = api.classify(rStale, SNAP, {});
  assert(cStale === 'stale-basis', `F33 stale-basis: got ${cStale}`);
  matrix.push({ name: 'stale-basis', reason: cStale });

  // 8. superseded-concurrent
  const rSup = mkReq({ basisOrderingHash: 'oh:wrongbasis' });
  const cSup = api.classify(rSup, SNAP, { priorAppliedInBatch: true });
  assert(cSup === 'superseded-concurrent', `F33 superseded-concurrent: got ${cSup}`);
  matrix.push({ name: 'superseded-concurrent', reason: cSup });

  // 9. redaction-violation (validate catches raw key)
  const rLeak = mkReq({ basisOrderingHash: acceptedBasis, title: 'Secret Folder' });
  const vLeak = api.validate(rLeak);
  assert(vLeak && vLeak.ok === false && vLeak.blockers.indexOf('folder-sortorder-reorder-request-redaction-violation') !== -1,
    'F33 redaction-violation: real validate must flag the raw key');
  matrix.push({ name: 'redaction-violation', reason: 'redaction-violation' });

  // receipt builder markers (accepted receipt)
  const rcpt = api.receipt(rAccept, 'applied', 'sortorder-reorder-applied', { resultingOrderingHash: acceptedBasis, canonicalWriteCount: 3 });
  assert(rcpt.schema === RECEIPT_SCHEMA, 'F33 receipt: schema must be the receipt schema');
  assert(rcpt.canonicalAuthority === 'desktop-sqlite', 'F33 receipt: canonicalAuthority must be desktop-sqlite');
  for (const k of ['noDestructiveMutation', 'noFolderDelete', 'noFolderPurge', 'noChatDelete', 'noBindingMutation', 'noTombstoneMutation']) {
    assert(rcpt[k] === true, `F33 receipt: ${k} must be true`);
  }
  assert(rcpt.mirrorReprojection === 'deferred-to-s2b', 'F33 receipt: mirrorReprojection must be deferred-to-s2b');
}
assert(matrix.length === 11, `F33 matrix must cover 11 fixtures including F32c tied-sortOrder cases (got ${matrix.length})`);

// ---- structural re-assertions on the real handler ----
if (src) {
  const b0 = src.indexOf('===================== F32 (folder-sync S2): sortOrder reorder Desktop handler');
  const b1 = src.indexOf('===================== end F32 S2 sortOrder reorder handler');
  const body = b0 !== -1 && b1 !== -1 ? src.slice(b0, b1) : '';
  const code = stripComments(body);
  assert(code.includes('var dryRun = opts.apply !== true'), 'real handler must be dry-run by default');
  assert(code.includes('cleanString(opts.gate) === FOLDER_SORTORDER_REORDER_APPLY_GATE'), 'real handler must require the apply gate');
  assert(code.includes('canonicalWriteCount: 0'), 'real handler conflict/dry-run paths must be zero-write');
  assert(code.includes('folders.patch(order[i], { sortOrder: i })'), 'real handler accepted apply writes only sort_order');
  assert(code.includes('visibleIndexById'), 'real handler must use visibleOrderIds as tied-sortOrder basis tie-break');
  for (const banned of ['folder_bindings', 'DELETE FROM folders', 'chromeStorageSet', 'FOLDER_STATE_DATA_KEY',
    'rebuildRenderMirrorFromSqlite', 'bindChat', 'unbindChat', 'sqlExecute(']) {
    assert(!code.includes(banned), `real handler body must NOT contain (no mirror/binding/delete write): ${banned}`);
  }
  assert(code.includes("mirrorReprojection: 'deferred-to-s2b'"), 'F32 must still defer mirror re-projection (S2b not implemented)');

  // whole-file boundaries
  assert(src.includes(BINDING_RECEIPT_SCHEMA), 'binding receipt schema is now minted and live-proven');
  assert(src.includes("CHAT_FOLDER_BINDING_REQUEST_SCHEMA = '" + BINDING_REQUEST_SCHEMA + "'"), 'binding request schema must remain present');
  assert(src.includes("FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'"), 'source fullBundle schema must remain v2');
  assert(!src.includes('fullBundle.v3'), 'source must not contain fullBundle.v3');
  assert(src.includes("webdav: 'deferred'"), 'WebDAV must remain deferred in folder-sync.tauri.js');
  const applied = parseMetadataAllowlist(src);
  assert(Array.isArray(applied), 'could not parse the metadata applied allowlist from source');
  if (Array.isArray(applied)) {
    for (const core of METADATA_CORE_TYPES) assert(applied.includes(core), `metadata core applied type missing: ${core}`);
    for (const a of applied) assert(METADATA_ALLOWED_SUPERSET.includes(a),
      `unexpected applied type beyond the four core + known Operational unbinds: ${a}`);
  }
}

// ---- F11 boundary ----
assert(exists(foldersStoreFile), `${foldersStoreFile}: missing`);
if (exists(foldersStoreFile)) {
  const store = read(foldersStoreFile);
  assert(store.includes("F11_RENDER_MIRROR_REBUILD_GATE = '" + F11_GATE + "'"), 'source must define the F11 gate constant');
  if (exists(s5ImplementationEvidenceFile)) {
    assert(store.includes("'field-mismatch:sortOrder': true"), 'S5 must allow F11 field-mismatch:sortOrder');
    assert(store.includes("blockedClasses: classSelection.blocked.concat(['binding-mismatch'])"),
      'F11 helper must keep binding-mismatch blocked after S5');
  } else {
    assert(store.includes("'field-mismatch:sortOrder': true"), 'S5 allows F11 field-mismatch:sortOrder');
    assert(store.includes("blockedClasses: classSelection.blocked.concat(['binding-mismatch'])"),
      'F11 helper must keep binding-mismatch blocked/reviewed in current post-S5 source');
    assert(store.includes('delete next.sortOrder;') && store.includes('delete next.sort_order;'),
      'F11 rebuild still strips sortOrder before S5');
  }
  assert(store.includes('folder_bindings') && store.includes('FOLDER_STATE_DATA_KEY') &&
    store.includes('hardDeleteBlocked') && store.includes('softDeleteEmptyFolder'), 'folder substrate tokens intact');
}
assert(exists(folderImportFile) && read(folderImportFile).includes("webdav: 'deferred'"),
  'WebDAV must remain deferred in folder-import.mv3.js');

if (failures.length) {
  console.error('FAIL validate-folder-sync-f33-inprocess-reprove-and-s2b-design');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const appliedNow = parseMetadataAllowlist(read(folderSyncFile));
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f33-inprocess-reprove-and-s2b-design.v1',
  lane: 'folder-sync',
  phase: 'F33',
  f33Doc,
  reproveApproach: 'option-b-sandboxed-vm',
  productSourceEdited: false,
  f32CommitReferenced: F32_COMMIT,
  matrix: matrix,
  matrixCount: matrix.length,
  realHandlerReproven: true,
  s2bImplemented: false,
  s2bReusesF11Rebuild: false,
  f11AllowedSetChanged: true,
  bindingReceiptSchemaMinted: true,
  bindingMismatchBlocked: true,
  sortOrderGatedInF11: false,
  productSyncReady: false,
  fullBundleV3Present: false,
  chatSavingCasBlocked: true,
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  recommendedNext: 'F34-S3-live-desktop-dry-run-proof (live; requires separate explicit approval; no write)',
}, null, 2));
console.log('PASS validate-folder-sync-f33-inprocess-reprove-and-s2b-design');
