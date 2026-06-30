#!/usr/bin/env node
// Operational.1 — Sync request/mutation READINESS validator (static).
//
// Operational.0 (contract) decided that v1 single-canonical readiness requires
// bind/unbind SYMMETRY: the applied request allowlist must grow from four to six
// by adding chat-label-unbind + chat-tag-unbind (category is already symmetric via
// assign/clear). Operational.1 (this validator) LOCKS that contract statically and
// asserts the current NOT-IMPLEMENTED runtime state: the runtime applied allowlist
// is still the four proven types, the two unbind types are planned/deferred (not yet
// applied), catalog CRUD stays deferred, the B8/B9 basis stays reserved/diagnostic-
// only, and productSyncReady stays false. The unbind runtime arrives in Operational.2,
// at which point this validator flips to assert the six-type implementation.
//
//   [O.0]       = the Operational.0 readiness contract (doc assertions).
//   [RUNTIME]   = the current runtime state (four applied; unbind not implemented).
//   [TARGET]    = the six-type readiness target + the deferred families.
//   [INVARIANT] = the future unbind implementation invariants (documented).
//   [BOUNDARY]  = boundaries that must hold (productSyncReady false, no v3, etc.).
//
// Static only: reads source/doc text, asserts patterns. No runtime, no node:sqlite,
// no DB, no module loads. Implements no request type.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const O0_CONTRACT_REL = 'release-evidence/2026-06-30/sync-operational-0-request-mutation-readiness-contract.md';
const O1_EVIDENCE_REL = 'release-evidence/2026-06-30/sync-operational-1-request-readiness-validator.md';
const VALIDATOR_REL = 'tools/validation/studio/validate-sync-operational-request-readiness-v1.mjs';
const GATES_REL = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const DIAG_REL = 'src-surfaces-base/studio/sync/library/library-metadata-diagnostics.js';

const FOUR_PROVEN = ['chat-category-assign', 'chat-category-clear', 'chat-label-bind', 'chat-tag-bind'];
const NEW_UNBIND = ['chat-label-unbind', 'chat-tag-unbind'];
const SIX_TYPES = FOUR_PROVEN.concat(NEW_UNBIND);
const RECEIPT_STATUSES = ['pending', 'applied', 'noop', 'rejected', 'superseded'];
const DEFERRED_CATALOG = ['label-create', 'tag-create', 'category-create', 'recolor', 'hard-delete'];

const PASS = [];
const FAIL = [];
function check(label, fn) {
  try { fn(); PASS.push(label); console.log(`  ✓ ${label}`); }
  catch (e) { const m = e && e.message ? e.message : String(e); FAIL.push({ label, m }); console.log(`  ✗ ${label}`); console.log(`      ${m}`); }
}
function readRepo(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(REPO_ROOT, rel)); }
function stripComments(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1'); }

const o0 = exists(O0_CONTRACT_REL) ? readRepo(O0_CONTRACT_REL) : '';
const o1 = exists(O1_EVIDENCE_REL) ? readRepo(O1_EVIDENCE_REL) : '';
const gatesCode = exists(GATES_REL) ? stripComments(readRepo(GATES_REL)) : '';
const diagCode = exists(DIAG_REL) ? stripComments(readRepo(DIAG_REL)) : '';
const selfSrc = readRepo(VALIDATOR_REL);

console.log('[sync-operational-request-readiness] Operational.1 readiness checks');

// --- A. Operational.0 contract ------------------------------------------------

check('[O.0] readiness contract exists and is the single-canonical / productSyncReady:false / v3-not-minted contract', () => {
  assert.ok(exists(O0_CONTRACT_REL), 'missing Operational.0 contract');
  assert.match(o0, /OPERATIONAL\.0 READINESS/);
  assert.match(o0, /single-canonical/i);
  assert.match(o0, /productSyncReady\s*:\s*false|productSyncReady[^.\n]*false/i);
  assert.match(o0, /fullBundle\.v3[^.\n]*not minted|v3 not minted/i);
});

check('[O.0] contract names the SIX applied request types (4 proven + 2 unbind)', () => {
  for (const t of SIX_TYPES) assert.ok(o0.includes(t), 'contract missing applied type: ' + t);
  assert.match(o0, /allowlist[^.\n]*six|exactly six|four to six/i);
});

check('[O.0] contract requires bind/unbind symmetry via chat-label-unbind + chat-tag-unbind', () => {
  for (const t of NEW_UNBIND) assert.ok(o0.includes(t), 'contract missing required unbind type: ' + t);
  assert.match(o0, /symmetry/i);
});

check('[O.0] contract reuses the B8/B9 request/receipt pattern (requestId, idempotent, append-only, dedup)', () => {
  assert.ok(o0.includes('B8/B9'), 'must reuse the B8/B9 pattern');
  assert.match(o0, /requestId/);
  assert.match(o0, /idempotent/i);
  assert.match(o0, /append-only/i);
  assert.match(o0, /deduplicate|dedup/i);
});

check('[O.0] contract defers catalog CRUD + hard-delete/un-delete (NOT readiness blockers)', () => {
  for (const c of DEFERRED_CATALOG) assert.ok(o0.includes(c), 'contract must defer: ' + c);
  assert.match(o0, /deferred/i);
  assert.match(o0, /hard-delete|un-delete/i);
});

check('[O.0] contract pins the single-canonical conflict model (no multi-writer; basis reserved/diagnostic-only; noop)', () => {
  assert.match(o0, /no multi-writer|No multi-writer merge/i);
  assert.match(o0, /basis[^.\n]*reserved|reserved[^.\n]*diagnostic-only/i);
  assert.match(o0, /no[^.\n]*basis[^.\n]*enforcement|No conflict basis enforcement/i);
  assert.ok(o0.includes('noop') || /already-satisfied/.test(o0), 'must define noop / already-satisfied');
});

check('[O.0] contract defines the receipt status vocabulary (pending/applied/noop/rejected/superseded)', () => {
  for (const s of RECEIPT_STATUSES) assert.ok(o0.includes(s), 'contract missing receipt status: ' + s);
});

check('[O.0] contract keeps the gate honest (productSyncReady flips only after six-type + harness; no premature flip)', () => {
  assert.match(o0, /harness/i);
  assert.match(o0, /productSyncReady[\s\S]{0,80}(flip|after)/i);
});

// --- B. Current runtime state (Operational.1 is NOT IMPLEMENTED) ---------------

check('[RUNTIME] applied allowlist is exactly the FOUR proven types (the two unbind types are NOT yet applied)', () => {
  assert.ok(gatesCode.length > 0, 'applied-allowlist module not found');
  for (const t of FOUR_PROVEN) assert.ok(gatesCode.includes("'" + t + "'"), 'applied allowlist missing proven type: ' + t);
  for (const u of NEW_UNBIND) assert.ok(!gatesCode.includes(u), 'unbind unexpectedly present in the applied allowlist module (Operational.1 must not implement it): ' + u);
});

check('[RUNTIME] chat-label-unbind / chat-tag-unbind runtime is NOT implemented yet — tracked as planned/deferred', () => {
  // not in the applied allowlist (above) AND tracked as a deferred destructive shape in diagnostics
  assert.ok(diagCode.length > 0, 'diagnostics module not found');
  for (const u of NEW_UNBIND) assert.ok(diagCode.includes(u), 'unbind type should be tracked (as deferred/planned) in diagnostics: ' + u);
  assert.ok(/DEFERRED_DESTRUCTIVE_SHAPES|deferred/i.test(diagCode), 'diagnostics must track unbind as deferred (planned)');
});

check('[RUNTIME] productSyncReady remains false in the sync runtime (no premature flip)', () => {
  assert.ok(gatesCode.includes('productSyncReady'), 'gates must reference productSyncReady');
  assert.doesNotMatch(gatesCode, /productSyncReady\s*[:=]\s*true/, 'productSyncReady must not be flipped true');
  assert.doesNotMatch(diagCode, /productSyncReady\s*[:=]\s*true/, 'productSyncReady must not be flipped true');
});

check('[RUNTIME] no catalog-CRUD request type is in the applied allowlist (catalog CRUD stays Desktop-managed/deferred)', () => {
  for (const c of ['label-create', 'tag-create', 'category-create', 'label-rename', 'category-rename', 'recolor']) {
    assert.ok(!gatesCode.includes("'" + c + "'"), 'catalog CRUD type must not be an applied request type: ' + c);
  }
});

// --- C. Six-type readiness target + deferrals --------------------------------

check('[TARGET] readiness target = four proven + two unbind; catalog CRUD + hard-delete are NOT readiness-closed', () => {
  // the contract states the six-type set is the readiness allowlist...
  for (const t of SIX_TYPES) assert.ok(o0.includes(t), 'six-type target missing: ' + t);
  // ...and explicitly does not gate readiness on catalog CRUD / deletion
  assert.match(o0, /Catalog CRUD[\s\S]{0,60}(deferred|not[\s\S]{0,12}gating|not[\s\S]{0,12}required)/i);
});

// --- D. Future unbind implementation invariants (documented) ------------------

check('[INVARIANT] contract documents the future unbind apply invariants (idempotent noop / invalid->rejected / basis inert / canonical order / mirrors request-only)', () => {
  assert.match(o0, /already-unbound[\s\S]{0,20}noop|noop[\s\S]{0,40}zero write/i);
  assert.match(o0, /invalid[\s\S]{0,30}rejected/i);
  assert.match(o0, /reserved[\s\S]{0,30}inert|basis[\s\S]{0,30}reserved/i);
  assert.match(o0, /canonical order|canonical Desktop applies/i);
  assert.match(o0, /request-only/i);
});

// --- E. Boundaries ------------------------------------------------------------

check('[BOUNDARY] no WebDAV apply / no multi-writer / no tags.updated_at migration / no fullBundle.v3 mint claimed by this readiness slice', () => {
  assert.match(o0, /WebDAV[\s\S]{0,30}(deferred|not[\s\S]{0,8}implement)/i);
  assert.match(o0, /multi-writer/i);
  // Operational.1 must not, itself, mint v3 or flip readiness — assert the contract keeps these deferred
  assert.match(o0, /v3[\s\S]{0,30}not[\s\S]{0,8}mint|not[\s\S]{0,8}mint[\s\S]{0,30}v3/i);
});

// --- F. Operational.1 evidence + static self-check ---------------------------

check('[O.1] evidence exists and is marked NOT IMPLEMENTED', () => {
  assert.ok(exists(O1_EVIDENCE_REL), 'Operational.1 evidence missing');
  assert.match(o1, /OPERATIONAL\.1 REQUEST READINESS VALIDATOR\s*[—-]\s*NOT IMPLEMENTED/);
  assert.ok(o1.includes('chat-label-unbind') && o1.includes('chat-tag-unbind'), 'evidence must name the two planned unbind types');
});

check('[STATIC] this validator loads no runtime module / no node:sqlite / no DB (static scaffold)', () => {
  const loadLines = selfSrc.split('\n').filter((l) => /^\s*import\s/.test(l) || /\b(?:require|import)\s*\(/.test(l));
  const loaded = loadLines.join('\n');
  for (const mod of ['node:sqlite', 'webdav-transport-gates', 'library-metadata-diagnostics', 'folder-sync', 'store/']) {
    assert.ok(!loaded.includes(mod), 'Operational.1 validator must not load a runtime module: ' + mod);
  }
});

console.log('');
if (FAIL.length) {
  console.error(`[sync-operational-request-readiness] ${FAIL.length} failed, ${PASS.length} passed`);
  process.exitCode = 1;
} else {
  console.log(`[sync-operational-request-readiness] PASS ${PASS.length} checks`);
}
