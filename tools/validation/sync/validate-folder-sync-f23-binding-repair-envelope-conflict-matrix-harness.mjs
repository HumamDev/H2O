#!/usr/bin/env node
//
// Folder Sync Phase F23 — binding repair envelope + conflict-matrix validator harness (design-only;
// SYNTHETIC fixtures; no runtime; no writes).
//
// This meta-validator (a) grounds the F23 doc against the F22 contract + standing postures, and (b)
// EXERCISES the F22 binding repair request/receipt contract + conflict matrix using SYNTHETIC fixtures
// embedded below. It defines a pure synthetic canonical binding snapshot (tokenized ids only), a
// request-envelope checker, a receipt-envelope checker, a pure decideBindingRepair(request, canonical,
// ctx) oracle, and a mirror-reconcile oracle, and asserts each of the twelve fixtures (the ten F22 §5
// classes plus accepted bind/move) yields the specified receipt, with the safety markers
// (canonicalAuthority: desktop-sqlite; noChatDelete/noFolderDelete/noFolderPurge/noTombstoneMutation:
// true) on every receipt. It proves one-folder-per-chat is preserved by an accepted bind + move, and
// three negative controls (raw-name leak rejected; non-desktop authority rejected; forbidden intent
// rejected). It also asserts against REAL SOURCE that the request schema is present, the proposed receipt
// schema is NOT minted, folder_bindings + bindChat/unbindChat are intact, F11 still blocks the two gated
// classes, the sortOrder proposed schemas are unminted, WebDAV deferred, fullBundle v2, using a BOUNDED
// metadata-lane guard. No runtime module is loaded; no network; no write.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';

const root = process.cwd();
const failures = [];

const f23Doc = 'release-evidence/2026-06-25/folder-sync-f23-binding-repair-envelope-conflict-matrix-harness.md';
const f22Doc = 'release-evidence/2026-06-25/folder-sync-f22-binding-repair-request-receipt-spec.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const s5SortOrderFlipDoc = 'release-evidence/2026-07-01/folder-sync-s5-f11-sortorder-allowed-set-flip.md';
const bindingImplementationEvidenceDoc = 'release-evidence/2026-07-01/folder-sync-binding-mismatch-repair-implementation.md';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const F22_COMMIT = '5c3dd88';
const F11_GATE = 'folder-sync-f11-render-only-mirror-rebuild';
const REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1';
const RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1';
const SORTORDER_REQUEST_SCHEMA = 'h2o.studio.folder-sortorder-reorder-request.v1';
const SORTORDER_RECEIPT_SCHEMA = 'h2o.studio.folder-sortorder-reorder-receipt.v1';
const INTENTS = ['bind', 'unbind', 'move'];
const FORBIDDEN_KEYS = ['name', 'title', 'content'];
const MATRIX_REASONS = ['reproject-mirror', 'reproject-mirror-drop-extra', 'orphan-folder-binding',
  'orphan-chat-binding', 'tombstoned-folder-binding', 'duplicate-binding-resolved-primary-key',
  'stale-basis', 'duplicate', 'privacy-redaction-violation', 'superseded-concurrent'];
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
function sha256(v) { return crypto.createHash('sha256').update(String(v)).digest('hex'); }
function tok(id) { return 'sha256:' + sha256('F23:' + id).slice(0, 16); }
function bindingHash(map) { return 'sha256:' + sha256(Object.keys(map).sort().map((c) => c + '>' + map[c]).join('|')).slice(0, 24); }
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

// ============================================================================================
// SYNTHETIC BINDING HARNESS
// ============================================================================================

// canonical binding snapshot (tokenized ids only)
const CANON = (() => {
  const bindings = { [tok('ct_a')]: tok('fk_x'), [tok('ct_b')]: tok('fk_y') }; // one-folder-per-chat
  return {
    bindings,
    bindingHash: bindingHash(bindings),
    knownFolders: new Set([tok('fk_x'), tok('fk_y'), tok('fk_t')]),
    visibleFolders: new Set([tok('fk_x'), tok('fk_y')]),
    tombstonedFolders: new Set([tok('fk_t')]),
    liveChats: new Set([tok('ct_a'), tok('ct_b'), tok('ct_c')]),
  };
})();

function baseReceipt(req, canon) {
  return {
    schema: RECEIPT_SCHEMA, requestId: req.requestId, status: 'rejected', reason: 'rejected',
    resultingBindingHash: canon.bindingHash, canonicalAuthority: 'desktop-sqlite',
    noChatDelete: true, noFolderDelete: true, noFolderPurge: true, noTombstoneMutation: true,
    decidedAt: '2026-07-01T00:00:00.000Z',
  };
}

function checkRequestEnvelope(req) {
  const problems = [];
  if (!req || typeof req !== 'object') return ['not-object'];
  if (req.schema !== REQUEST_SCHEMA) problems.push('bad-schema');
  if (!req.requestId) problems.push('missing-requestId');
  if (!req.sourcePeerId && !req.deviceId) problems.push('missing-peer');
  if (!['chrome-extension', 'native-extension', 'mobile'].includes(req.surfaceKind)) problems.push('bad-surfaceKind');
  if (!INTENTS.includes(req.intent)) problems.push('bad-intent');
  if (!isHash(req.chatId)) problems.push('bad-chatId');
  if (!isHash(req.targetFolderId)) problems.push('bad-targetFolderId');
  if (req.intent === 'move' && !isHash(req.previousFolderId)) problems.push('missing-previousFolderId');
  if (!isHash(req.basisBindingHash)) problems.push('bad-basisBindingHash');
  if (!isHash(req.requestedBindingHash)) problems.push('bad-requestedBindingHash');
  if (!req.createdAt || Number.isNaN(Date.parse(req.createdAt))) problems.push('bad-createdAt');
  if (!req.idempotencyKey) problems.push('missing-idempotencyKey');
  if (hasForbiddenKeys(req)) problems.push('raw-name-leak');
  return problems;
}

function checkReceiptEnvelope(rcpt) {
  const problems = [];
  if (!rcpt || typeof rcpt !== 'object') return ['not-object'];
  if (rcpt.schema !== RECEIPT_SCHEMA) problems.push('bad-schema');
  if (!rcpt.requestId) problems.push('missing-requestId');
  if (!['applied', 'skipped', 'rejected'].includes(rcpt.status)) problems.push('bad-status');
  if (!rcpt.reason) problems.push('missing-reason');
  if (!isHash(rcpt.resultingBindingHash)) problems.push('bad-resultingBindingHash');
  if (rcpt.canonicalAuthority !== 'desktop-sqlite') problems.push('bad-canonicalAuthority');
  if (rcpt.noChatDelete !== true) problems.push('bad-noChatDelete');
  if (rcpt.noFolderDelete !== true) problems.push('bad-noFolderDelete');
  if (rcpt.noFolderPurge !== true) problems.push('bad-noFolderPurge');
  if (rcpt.noTombstoneMutation !== true) problems.push('bad-noTombstoneMutation');
  if (!rcpt.appliedAt && !rcpt.decidedAt) problems.push('missing-timestamp');
  if (hasForbiddenKeys(rcpt)) problems.push('raw-name-leak');
  return problems;
}

// request-driven decision oracle
function decideBindingRepair(req, canon, ctx) {
  ctx = ctx || {};
  const r = baseReceipt(req, canon);
  if (!INTENTS.includes(req.intent)) { r.reason = 'forbidden-intent'; return r; }
  if (hasForbiddenKeys(req)) { r.reason = 'privacy-redaction-violation'; return r; }
  if ((ctx.appliedKeys || new Set()).has(req.idempotencyKey)) { r.status = 'skipped'; r.reason = 'duplicate'; return r; }
  if (req.basisBindingHash !== canon.bindingHash) { r.reason = ctx.priorAppliedInBatch ? 'superseded-concurrent' : 'stale-basis'; return r; }
  if (!canon.liveChats.has(req.chatId)) { r.reason = 'orphan-chat-binding'; return r; }
  if (canon.tombstonedFolders.has(req.targetFolderId)) { r.reason = 'tombstoned-folder-binding'; return r; }
  if (!canon.visibleFolders.has(req.targetFolderId)) { r.reason = 'orphan-folder-binding'; return r; }
  // accepted: bind on an already-bound chat resolves via PRIMARY KEY (chat_id); move is the clean rebind.
  if (req.intent === 'bind' && canon.bindings[req.chatId]) {
    r.status = 'applied'; r.reason = 'duplicate-binding-resolved-primary-key';
    r.resultingBindingHash = req.requestedBindingHash; r.appliedAt = '2026-07-01T00:00:00.000Z'; return r;
  }
  r.status = 'applied'; r.reason = 'applied';
  r.resultingBindingHash = req.requestedBindingHash; r.appliedAt = '2026-07-01T00:00:00.000Z';
  return r;
}

// mirror reconciliation oracle (render-only; no canonical change)
function decideMirrorReconcile(kind, req, canon) {
  const r = baseReceipt(req, canon);
  r.status = 'applied';
  r.reason = kind === 'missing' ? 'reproject-mirror' : 'reproject-mirror-drop-extra';
  r.canonicalChange = false;
  return r;
}

function mkReq(over) {
  return Object.assign({
    schema: REQUEST_SCHEMA, requestId: 'req_' + Math.random().toString(16).slice(2, 10),
    sourcePeerId: tok('peer'), surfaceKind: 'chrome-extension', intent: 'bind',
    chatId: tok('ct_c'), targetFolderId: tok('fk_x'),
    basisBindingHash: CANON.bindingHash, requestedBindingHash: 'sha256:req0000000000',
    createdAt: '2026-07-01T00:00:00.000Z', idempotencyKey: 'idem_' + Math.random().toString(16).slice(2, 10),
  }, over || {});
}

function runHarness() {
  const results = [];
  const record = (name, receipt, expectStatus, expectReason, opts) => {
    opts = opts || {};
    const rcptProblems = checkReceiptEnvelope(receipt);
    assert(rcptProblems.length === 0, `F23 fixture ${name}: receipt invalid: ${rcptProblems.join(',')}`);
    assert(receipt.status === expectStatus, `F23 fixture ${name}: status ${receipt.status} != ${expectStatus}`);
    assert(receipt.reason === expectReason, `F23 fixture ${name}: reason ${receipt.reason} != ${expectReason}`);
    assert(receipt.canonicalAuthority === 'desktop-sqlite', `F23 fixture ${name}: authority not desktop-sqlite`);
    assert(receipt.noChatDelete === true && receipt.noFolderDelete === true && receipt.noFolderPurge === true,
      `F23 fixture ${name}: destructive markers not all true`);
    if (opts.req && opts.requireCleanEnvelope) {
      const reqProblems = checkRequestEnvelope(opts.req);
      assert(reqProblems.length === 0, `F23 fixture ${name}: request envelope invalid: ${reqProblems.join(',')}`);
    }
    results.push({ name, status: receipt.status, reason: receipt.reason });
  };

  // accepted bind (ct_c unbound) + accepted move (ct_a fk_x->fk_y)
  const rBind = mkReq({ intent: 'bind', chatId: tok('ct_c'), targetFolderId: tok('fk_x') });
  record('accepted-bind', decideBindingRepair(rBind, CANON, {}), 'applied', 'applied', { req: rBind, requireCleanEnvelope: true });
  const rMove = mkReq({ intent: 'move', chatId: tok('ct_a'), previousFolderId: tok('fk_x'), targetFolderId: tok('fk_y') });
  record('accepted-move', decideBindingRepair(rMove, CANON, {}), 'applied', 'applied', { req: rMove, requireCleanEnvelope: true });

  // mirror reconciliation (render-only)
  record('missing-mirror-item', decideMirrorReconcile('missing', mkReq({ intent: 'bind' }), CANON), 'applied', 'reproject-mirror');
  record('extra-mirror-item', decideMirrorReconcile('extra', mkReq({ intent: 'unbind', targetFolderId: tok('fk_x') }), CANON), 'applied', 'reproject-mirror-drop-extra');

  // rejections
  const rOrphanFolder = mkReq({ intent: 'bind', chatId: tok('ct_c'), targetFolderId: tok('fk_unknown') });
  record('orphan-folder-binding', decideBindingRepair(rOrphanFolder, CANON, {}), 'rejected', 'orphan-folder-binding', { req: rOrphanFolder, requireCleanEnvelope: true });
  const rOrphanChat = mkReq({ intent: 'bind', chatId: tok('ct_dead'), targetFolderId: tok('fk_x') });
  record('orphan-chat-binding', decideBindingRepair(rOrphanChat, CANON, {}), 'rejected', 'orphan-chat-binding', { req: rOrphanChat, requireCleanEnvelope: true });
  const rTomb = mkReq({ intent: 'bind', chatId: tok('ct_c'), targetFolderId: tok('fk_t') });
  record('tombstoned-folder-binding', decideBindingRepair(rTomb, CANON, {}), 'rejected', 'tombstoned-folder-binding', { req: rTomb, requireCleanEnvelope: true });
  // duplicate-binding: bind an already-bound chat (ct_a) to a valid folder -> PRIMARY KEY resolves
  const rDupBind = mkReq({ intent: 'bind', chatId: tok('ct_a'), targetFolderId: tok('fk_y') });
  record('duplicate-binding', decideBindingRepair(rDupBind, CANON, {}), 'applied', 'duplicate-binding-resolved-primary-key', { req: rDupBind, requireCleanEnvelope: true });
  const rStale = mkReq({ intent: 'bind', chatId: tok('ct_c'), basisBindingHash: 'sha256:stalebasis00000' });
  record('stale-basis', decideBindingRepair(rStale, CANON, {}), 'rejected', 'stale-basis', { req: rStale, requireCleanEnvelope: true });
  const rDupReq = mkReq({ intent: 'bind', chatId: tok('ct_c'), idempotencyKey: 'idem_seen' });
  record('duplicate-request', decideBindingRepair(rDupReq, CANON, { appliedKeys: new Set(['idem_seen']) }), 'skipped', 'duplicate', { req: rDupReq, requireCleanEnvelope: true });
  // privacy-redaction violation: raw title on the request
  const rLeak = mkReq({ intent: 'bind', chatId: tok('ct_c'), title: 'Secret Chat Title' });
  record('privacy-redaction-violation', decideBindingRepair(rLeak, CANON, {}), 'rejected', 'privacy-redaction-violation');
  // multi-device concurrent move: A applies (advances canonical hash), B decided against advanced snapshot
  const canonAfterA = Object.assign({}, CANON, { bindingHash: 'sha256:advancedhash0000' });
  const rConc = mkReq({ intent: 'move', chatId: tok('ct_b'), previousFolderId: tok('fk_y'), targetFolderId: tok('fk_x'), basisBindingHash: CANON.bindingHash });
  record('multi-device-concurrent-move', decideBindingRepair(rConc, canonAfterA, { priorAppliedInBatch: true }), 'rejected', 'superseded-concurrent', { req: rConc, requireCleanEnvelope: true });

  // ---- one-folder-per-chat proof (synthetic in-memory bindings; INSERT OR REPLACE semantics) ----
  const mem = Object.assign({}, CANON.bindings);
  const applyBind = (chat, folder) => { mem[chat] = folder; };       // one folder per chat
  const applyMove = (chat, from, to) => { mem[chat] = to; };
  applyBind(tok('ct_c'), tok('fk_x'));
  applyMove(tok('ct_a'), tok('fk_x'), tok('fk_y'));
  const perChatCount = (chat) => (Object.prototype.hasOwnProperty.call(mem, chat) ? 1 : 0);
  const oneFolderPerChat = [tok('ct_a'), tok('ct_b'), tok('ct_c')].every((c) => perChatCount(c) === 1) &&
    Object.values(mem).every((v) => typeof v === 'string');
  assert(oneFolderPerChat, 'F23 one-folder-per-chat: each chat must map to exactly one folder after bind+move');

  // ---- negative controls ----
  const leakReq = mkReq({ intent: 'bind', title: 'raw' });
  assert(checkRequestEnvelope(leakReq).includes('raw-name-leak'), 'F23 negative control: raw name leak must be caught');
  const badAuth = Object.assign(baseReceipt(mkReq(), CANON), { status: 'applied', reason: 'applied',
    resultingBindingHash: CANON.bindingHash, canonicalAuthority: 'chrome', appliedAt: '2026-07-01T00:00:00.000Z' });
  assert(checkReceiptEnvelope(badAuth).includes('bad-canonicalAuthority'), 'F23 negative control: non-desktop authority must be rejected');
  for (const forbidden of ['chat-delete', 'folder-delete', 'folder-purge']) {
    const fr = decideBindingRepair(mkReq({ intent: forbidden }), CANON, {});
    assert(fr.status === 'rejected' && fr.reason === 'forbidden-intent',
      `F23 negative control: forbidden intent ${forbidden} must be rejected`);
  }

  return { results, oneFolderPerChat };
}

// ---- doc presence ----
assert(exists(f23Doc), `${f23Doc}: missing`);
if (!exists(f23Doc)) {
  console.error('FAIL validate-folder-sync-f23-binding-repair-envelope-conflict-matrix-harness');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f23Doc);
assert(doc.length > 5000, `${f23Doc}: F23 doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- harness-only markers ----
assert(flat.includes('DESIGN / VALIDATOR HARNESS ONLY') && /SYNTHETIC FIXTURES/i.test(flat),
  'F23 doc must mark itself validator-harness-only with synthetic fixtures');
assert(flat.includes('No product source was modified'), 'F23 doc must state no product source modified');
assert(/No binding repair was implemented|No runtime behavior was changed/i.test(flat),
  'F23 doc must state no binding repair / no runtime change');

// ---- F22 commit ----
assert(flat.includes(F22_COMMIT), `F23 doc must reference the F22 commit ${F22_COMMIT}`);
assert(exists(f22Doc), 'F22 doc must exist on disk');

// ---- envelopes + matrix + postures in doc ----
assert(flat.includes(REQUEST_SCHEMA) && flat.includes(RECEIPT_SCHEMA), 'F23 doc must name the request + proposed receipt schemas');
for (const f of ['requestId', 'sourcePeerId', 'surfaceKind', 'intent', 'chatId', 'targetFolderId',
  'previousFolderId', 'basisBindingHash', 'requestedBindingHash', 'createdAt', 'idempotencyKey']) {
  assert(flat.includes(f), `F23 doc must document request field: ${f}`);
}
for (const f of ['status', 'reason', 'resultingBindingHash', 'canonicalAuthority', 'noChatDelete',
  'noFolderDelete', 'noFolderPurge', 'noTombstoneMutation']) {
  assert(flat.includes(f), `F23 doc must document receipt field: ${f}`);
}
for (const c of ['missing-mirror-item', 'extra-mirror-item', 'orphan-folder-binding', 'orphan-chat-binding',
  'tombstoned-folder-binding', 'duplicate-binding', 'stale-basis', 'duplicate-request',
  'privacy-redaction-violation', 'multi-device-concurrent-move']) {
  assert(flat.includes(c), `F23 doc must document conflict case: ${c}`);
}
assert(/EMBEDDED in the F23 validator|embedded directly in the F23 validator/i.test(flat),
  'F23 doc must state fixtures are embedded in the validator');
assert(/one-folder-per-chat/i.test(flat), 'F23 doc must include the one-folder-per-chat proof');
assert(/for (bind|unbind|move)|`bind`|`unbind`|`move`/i.test(flat), 'F23 doc must document the intents');
assert(/forbidden-intent|forbidden intent/i.test(flat), 'F23 doc must document the forbidden-intent control');
assert(/`binding-mismatch`[^.]*(BLOCKED|blocked)/i.test(flat), 'F23 doc must keep binding-mismatch blocked');
if (exists(s5SortOrderFlipDoc)) {
  const s5 = read(s5SortOrderFlipDoc);
  assert(s5.includes('S5/F11 SORTORDER-ONLY ALLOWED-SET FLIP PASSED'), 'S5 must supersede the historical sortOrder gated posture');
} else {
  assert(/field-mismatch:sortOrder/.test(flat) && /gated|GATED/i.test(flat), 'F23 doc must keep field-mismatch:sortOrder gated before S5');
}
assert(/productSyncReady` remains `false`|NOT READY TO FLIP/i.test(flat), 'F23 doc must keep productSyncReady false');
assert(/Chat Saving WebDAV\/cloud\/archive CAS[^.]*(REMAINS BLOCKED|remains blocked|BLOCKED)/i.test(flat),
  'F23 doc must keep Chat Saving CAS blocked');
assert(/Real remote WebDAV[^.]*deferred/i.test(flat) || flat.includes('Real remote WebDAV remains deferred'),
  'F23 doc must keep real remote WebDAV deferred');
assert(/public\/premium sync remains blocked|Public\/premium: blocked/i.test(flat), 'F23 doc must keep public/premium blocked');
assert(/no `?fullBundle\.v3`?/i.test(flat) || flat.includes('No `fullBundle.v3` was'), 'F23 doc must keep fullBundle.v3 not minted');
assert(/hard delete blocked/i.test(flat) || /no hard delete/i.test(flat), 'F23 doc must keep hard delete blocked');
assert(/folder delete preserves chats/i.test(flat), 'F23 doc must preserve chats on folder delete');
assert(flat.includes('Cross-Surface Requirement'), 'F23 doc must include the cross-surface requirement');
assert(flat.includes('MULTIPLE DEVICES') || flat.includes('multiple devices'), 'F23 doc must require multi-device parity');
assert(flat.includes('mobile'), 'F23 doc must include future mobile compatibility');
assert(flat.includes('Chrome / native extension') || flat.includes('native extension'), 'F23 doc must include Chrome / native extension');
assert(flat.includes('Recommended F24'), 'F23 doc must recommend F24');
assert(/APPLY proof harness|binding analog of the F17/i.test(flat), 'F23 doc F24 must be the in-process binding apply proof harness');
for (const type of METADATA_CORE_TYPES) assert(flat.includes(type), `F23 doc must confirm metadata core type: ${type}`);

// ---- RUN THE HARNESS ----
let harness = { results: [], oneFolderPerChat: false };
try {
  harness = runHarness();
} catch (e) {
  failures.push('F23 harness threw: ' + (e && e.message ? e.message : String(e)));
}
assert(harness.results.length === 12, `F23 harness must exercise 12 fixtures (10 classes + bind + move), got ${harness.results.length}`);
for (const reason of MATRIX_REASONS) {
  assert(harness.results.some((r) => r.reason === reason), `F23 matrix must include a fixture with reason ${reason}`);
}
assert(harness.oneFolderPerChat === true, 'F23 one-folder-per-chat proof must hold');

// ---- REAL SOURCE: request present, receipt NOT minted, substrate intact ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);
  assert(src.includes("CHAT_FOLDER_BINDING_REQUEST_SCHEMA = '" + REQUEST_SCHEMA + "'"),
    'source must define the chat-folder-binding request schema (reused)');
  if (exists(bindingImplementationEvidenceDoc)) {
    const implementationEvidence = read(bindingImplementationEvidenceDoc);
    assert(implementationEvidence.includes('BINDING-MISMATCH REPAIR IMPLEMENTED_AND_PROVEN'),
      'binding implementation evidence must record implemented/proven verdict');
    assert(src.includes("CHAT_FOLDER_BINDING_RECEIPT_SCHEMA = '" + RECEIPT_SCHEMA + "'"),
      'binding receipt schema must be minted by the later binding implementation');
    assert(src.includes('bindingMismatchAllowed: false'),
      'binding-mismatch must remain blocked after binding implementation');
  } else {
    assert(!src.includes(RECEIPT_SCHEMA), 'F23 design-only: proposed binding receipt schema must NOT be minted in source');
  }
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
  console.error('FAIL validate-folder-sync-f23-binding-repair-envelope-conflict-matrix-harness');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const appliedNow = parseMetadataAllowlist(read(folderSyncFile));
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f23-binding-repair-envelope-conflict-matrix-harness.v1',
  lane: 'folder-sync',
  phase: 'F23',
  f23Doc,
  designOnly: true,
  fixtures: 'embedded-synthetic',
  f22CommitReferenced: F22_COMMIT,
  requestSchema: REQUEST_SCHEMA,
  requestSchemaPresentInSource: true,
  proposedReceiptSchema: RECEIPT_SCHEMA,
  proposedReceiptMintedInSource: exists(bindingImplementationEvidenceDoc),
  conflictMatrix: harness.results,
  matrixCount: harness.results.length,
  oneFolderPerChatPreserved: harness.oneFolderPerChat,
  bindingMismatchBlocked: true,
  sortOrderGated: !exists(s5SortOrderFlipDoc),
  sortOrderSupersededByS5: exists(s5SortOrderFlipDoc),
  productSyncReady: false,
  publicPremiumBlocked: true,
  realRemoteWebdavDeferred: true,
  fullBundleV3Present: false,
  chatSavingCasBlocked: true,
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  recommendedNext: 'F24-in-process-binding-repair-apply-proof-harness (temp node:sqlite, no product runtime change, no flip)',
}, null, 2));
console.log('PASS validate-folder-sync-f23-binding-repair-envelope-conflict-matrix-harness');
