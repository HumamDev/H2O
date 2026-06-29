#!/usr/bin/env node
// I.1 — Saved-chat archive IMPORT-RECOVERY HARNESS scaffold validator (static).
//
// Phase I promotes the one-off H.5 node:sqlite import-as-new proof into a permanent
// repo harness (contract: I.0). I.1 is the SCAFFOLD: it locks the I.0 contract, the
// deterministic fixture, and the H.5 lessons that the future live harness (I.2) must
// honor — WITHOUT running the live import harness itself.
//
//   [I.0]       = the harness contract (I.0 doc assertions).
//   [SCAFFOLD]  = scaffold artifacts exist + the deterministic fixture is well-formed.
//   [LESSON]    = the H.5 lessons, locked against the real importer + documented.
//   [BOUNDARY]  = boundaries that must hold; and I.1 stays static (no live harness yet).
//
// Static only: reads source/doc/fixture text + recomputes fixture file hashes (pure
// file ops). It does NOT load node:sqlite, the Tauri runtime, or the store/importer
// modules, and it does NOT run an import. The live run is I.2.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const I0_CONTRACT_REL = 'release-evidence/2026-06-24/saved-chat-archive-phase-i0-import-harness-contract.md';
const I1_EVIDENCE_REL = 'release-evidence/2026-06-24/saved-chat-archive-phase-i1-import-harness-scaffold.md';
const VALIDATOR_REL = 'tools/validation/studio/validate-saved-chat-archive-import-recovery-harness-v1.mjs';
const FIXTURE_DIR_REL = 'tools/validation/fixtures/saved-chat-archive/import-recovery';
const FIXTURE_README_REL = FIXTURE_DIR_REL + '/README.md';
const FIXTURE_PKG_REL = FIXTURE_DIR_REL + '/i-harness-source.h2ochat';
const IMPORTER_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-importer.studio.js';
const REQUIRED_FILES = ['manifest.json', 'snapshot.json', 'chat.md', 'chat.html'];

const PASS = [];
const FAIL = [];
function check(label, fn) {
  try { fn(); PASS.push(label); console.log(`  ✓ ${label}`); }
  catch (e) { const m = e && e.message ? e.message : String(e); FAIL.push({ label, m }); console.log(`  ✗ ${label}`); console.log(`      ${m}`); }
}
function readRepo(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(REPO_ROOT, rel)); }
function stripComments(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
function sha256Prefixed(buf) { return 'sha256-' + crypto.createHash('sha256').update(buf).digest('hex'); }
function readFixtureBytes(leaf) { return fs.readFileSync(path.join(REPO_ROOT, FIXTURE_PKG_REL, leaf)); }
function readFixtureJson(leaf) { return JSON.parse(readFixtureBytes(leaf).toString('utf8')); }

const i0 = exists(I0_CONTRACT_REL) ? readRepo(I0_CONTRACT_REL) : '';
const i1 = exists(I1_EVIDENCE_REL) ? readRepo(I1_EVIDENCE_REL) : '';
const importerSrc = exists(IMPORTER_REL) ? readRepo(IMPORTER_REL) : '';
const importerCode = stripComments(importerSrc);
const selfSrc = readRepo(VALIDATOR_REL);

console.log('[archive-import-recovery-harness] I.1 scaffold checks');

// --- A. I.0 contract ---------------------------------------------------------

check('[I.0] contract evidence file exists and is marked NOT IMPLEMENTED', () => {
  assert.ok(exists(I0_CONTRACT_REL), 'missing ' + I0_CONTRACT_REL);
  assert.match(i0, /PHASE I\.0 CONTRACT\s*[—-]\s*NOT IMPLEMENTED/);
});

check('[I.0] contract states the deterministic seed strategy (deterministic preferred; live-copy dev-only; drift guard)', () => {
  assert.match(i0, /deterministic/i);
  assert.match(i0, /seed (sqlite )?db|seed schema/i);
  assert.match(i0, /dev-only/i);
  assert.match(i0, /drift (guard|check)/i);
  assert.ok(i0.includes('never') && /live (Desktop )?db/i.test(i0), 'contract must forbid live DB mutation');
});

check('[I.0] contract enumerates the harness target coverage (the H.5 assertions)', () => {
  for (const phrase of ['import-ready', 'imported', 'already-imported']) {
    assert.ok(i0.includes(phrase), 'contract missing coverage phrase: ' + phrase);
  }
  assert.match(i0, /chats \+1/);
  assert.match(i0, /snapshots \+1/);
  assert.match(i0, /turns \+N|snapshot_turns \+N/);
  assert.match(i0, /provenance/i);
  assert.match(i0, /no `?UPDATE`?/i);
  assert.ok(/live (Desktop )?db (is )?(never )?untouched|never mutates the live/i.test(i0), 'contract must assert live DB untouched');
});

check('[I.0] contract documents Tauri parity (h2o_writer_identity stub) and the deferrals', () => {
  assert.ok(i0.includes('h2o_writer_identity'), 'contract must document the writer-identity stub');
  assert.match(i0, /restore ?\/ ?relink/i);
  assert.match(i0, /export ?\/ ?share|export/i);
  assert.match(i0, /deferred/i);
});

// --- B. Scaffold artifacts ---------------------------------------------------

check('[SCAFFOLD] the I.1 validator, fixture directory, fixture package, and README all exist', () => {
  assert.ok(exists(VALIDATOR_REL), 'validator missing');
  assert.ok(exists(FIXTURE_DIR_REL), 'fixture dir missing');
  assert.ok(exists(FIXTURE_PKG_REL), 'fixture package dir missing');
  assert.ok(exists(FIXTURE_README_REL), 'fixture README missing');
  assert.ok(/\.h2ochat$/.test(FIXTURE_PKG_REL), 'fixture package dir must end in .h2ochat');
});

check('[SCAFFOLD] fixture README documents the seed strategy + Tauri parity + deferrals', () => {
  const r = readRepo(FIXTURE_README_REL);
  assert.match(r, /deterministic/i);
  assert.ok(r.includes('h2o_writer_identity'), 'README must document the writer-identity stub');
  assert.match(r, /drift guard/i);
  assert.match(r, /dev-only/i);
  assert.match(r, /restore ?\/ ?relink/i);
  assert.ok(/not user data/i.test(r), 'README must mark the fixtures as test data, not user data');
});

// --- C. Deterministic fixture well-formedness (recompute + compare) ----------

check('[SCAFFOLD] fixture package has all four required files', () => {
  for (const f of REQUIRED_FILES) {
    assert.ok(exists(FIXTURE_PKG_REL + '/' + f), 'fixture missing required file: ' + f);
  }
});

check('[SCAFFOLD] fixture file hashes recompute and match the manifest (snapshot/markdown/html)', () => {
  const manifest = readFixtureJson('manifest.json');
  const map = { snapshot: 'snapshot.json', markdown: 'chat.md', html: 'chat.html' };
  for (const key of Object.keys(map)) {
    const desc = manifest.files && manifest.files[key];
    assert.ok(desc && desc.sha256, 'manifest.files.' + key + '.sha256 missing');
    const bytes = readFixtureBytes(map[key]);
    const actual = sha256Prefixed(bytes);
    assert.equal(desc.sha256, actual, key + ' sha mismatch: manifest=' + desc.sha256 + ' actual=' + actual);
    if (typeof desc.byteLength === 'number') assert.equal(desc.byteLength, bytes.length, key + ' byteLength mismatch');
  }
});

check('[SCAFFOLD] fixture is a verifiable v1 asset-free package (contentHash = snapshot sha; schemaVersion 1; no assets)', () => {
  const manifest = readFixtureJson('manifest.json');
  assert.equal(manifest.schemaVersion, 1, 'fixture must be schemaVersion 1');
  assert.deepEqual(manifest.assets || [], [], 'fixture must have no assets (v1)');
  const snapSha = sha256Prefixed(readFixtureBytes('snapshot.json'));
  assert.equal(manifest.contentHash, snapSha, 'v1 contentHash must equal sha256(snapshot.json)');
  assert.equal(manifest.files.snapshot.sha256, snapSha, 'files.snapshot.sha256 must equal sha256(snapshot.json)');
});

check('[SCAFFOLD] fixture identity is consistent and snapshot carries messages[] (import will produce +N turns)', () => {
  const manifest = readFixtureJson('manifest.json');
  const snap = readFixtureJson('snapshot.json');
  assert.ok(manifest.chatId && manifest.snapshotId, 'manifest identity missing');
  assert.equal(manifest.chatId, snap.chatId, 'manifest/snapshot chatId mismatch');
  assert.equal(manifest.snapshotId, snap.snapshotId, 'manifest/snapshot snapshotId mismatch');
  assert.ok(Array.isArray(snap.messages) && snap.messages.length >= 1, 'snapshot must carry messages[]');
  // mark it as a fixture, not user data
  assert.ok(JSON.stringify(manifest.provenance || {}).includes('Fixture')
    || /isImportHarnessFixture/.test(JSON.stringify(manifest.provenance || {})), 'fixture must be marked as a test fixture in provenance');
});

// --- D. H.5 lessons locked against the real importer + documented ------------

check('[LESSON] store snapshot rows expose snapshotId not id — importer uses snapshotRowId()', () => {
  assert.ok(importerCode.includes('snapshotRowId'), 'importer must read the store snapshotId key via snapshotRowId()');
  // the lesson must also be written down for the harness implementer
  assert.ok(i0.includes('snapshotId') && /not `?id`?|vs `?id`?|snapshotId, not id/i.test(i0),
    'I.0 must record the snapshotId-not-id lesson');
});

check('[LESSON] import-as-new uses FRESH ids; snapshots.create omits snapshotId; the overwrite-by-id primitive is never used', () => {
  assert.ok(importerCode.includes('generateRecoveredChatId'), 'importer must generate a fresh recovered chat id');
  assert.ok(/snapStore\.create\(|snapshots\.create\(/.test(importerCode), 'importer must use snapshots.create');
  assert.ok(!/snapStore\.upsert\(|snapshots\.upsert\(/.test(importerCode), 'importer must never call the snapshot overwrite-by-id primitive');
  assert.doesNotMatch(importerCode, /create\(\{[^}]*snapshotId/s, 'snapshots.create patch must not set snapshotId');
});

check('[LESSON] importer writes no raw UPDATE SQL (no-overwrite path is INSERT-only via the store adapters)', () => {
  assert.doesNotMatch(importerCode, /\bINSERT\s+INTO\b|\bUPDATE\b[^=]/i, 'importer must not contain raw INSERT/UPDATE SQL');
});

check('[LESSON] h2o_writer_identity stub requirement is documented for the harness (node:sqlite lacks the Rust scalar)', () => {
  assert.ok(i0.includes('h2o_writer_identity'), 'I.0 must document the writer-identity stub');
  assert.ok(readRepo(FIXTURE_README_REL).includes('h2o_writer_identity'), 'fixture README must document the writer-identity stub');
});

// --- E. Boundaries + I.1 stays static ----------------------------------------

check('[BOUNDARY] importer has no Chrome/scanner/materializer/watcher/sync coupling (regression lock)', () => {
  for (const banned of ['chrome.runtime', 'scanSavedChatArchiveRequestInboxV1', 'materializeSavedChatArchiveRequestV1',
    'setInterval', 'MutationObserver', 'connectNative', 'H2O.Studio.sync', 'webdav', 'plugin:fs|write']) {
    assert.ok(!importerCode.includes(banned), 'importer must not couple to: ' + banned);
  }
});

check('[BOUNDARY] I.1 stays static — the scaffold loads no DB driver / Tauri runtime / store-importer module (it only reads + hashes files)', () => {
  // Inspect only actual module loads (static `import ...` lines + any dynamic
  // import()/require()) — a live harness MUST load these; bare mentions inside
  // assertion strings/regexes do not count.
  const loadLines = selfSrc.split('\n').filter((l) => /^\s*import\s/.test(l) || /\b(?:require|import)\s*\(/.test(l));
  const loaded = loadLines.join('\n');
  for (const mod of ['node:sqlite', 'saved-chat-archive-importer', 'saved-chat-archive-inspector',
    'saved-chat-archive-diagnostics', 'store/snapshots.tauri', 'store/chats.tauri', 'store/index']) {
    assert.ok(!loaded.includes(mod), 'I.1 scaffold must not load a live-harness module: ' + mod);
  }
  // recomputing fixture hashes via node:crypto is static + allowed
  assert.ok(selfSrc.includes("import crypto from 'node:crypto'"), 'hash recompute uses node:crypto (static)');
});

check('[BOUNDARY] I.1 evidence exists and defers restore/relink/export until Phase I closes', () => {
  assert.ok(exists(I1_EVIDENCE_REL), 'I.1 evidence missing');
  assert.match(i1, /I\.1 IMPORT RECOVERY HARNESS SCAFFOLD\s*[—-]\s*PASSED/);
  assert.match(i1, /restore ?\/ ?relink/i);
  assert.match(i1, /defer/i);
});

console.log('');
if (FAIL.length) {
  console.error(`[archive-import-recovery-harness] ${FAIL.length} failed, ${PASS.length} passed`);
  process.exitCode = 1;
} else {
  console.log(`[archive-import-recovery-harness] PASS ${PASS.length} checks`);
}
