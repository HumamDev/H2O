#!/usr/bin/env node
// Validator for the M05 Phase 2.2 per-chat coverage/freshness engine.
//
// Loads saved-chat-coverage.tauri.js into a Node VM with INJECTED stand-ins for
// the three authorities it composes (archive discovery, governed package
// validation, current projection probe). That isolation is the point: this
// validator proves the composition rules — what may and may not be concluded —
// not the authorities themselves, which have their own suites.
//
// The rules under test are the frozen ones (§D §E §F §G): freshness is
// recomputed-hash equality and nothing else; a negative absence conclusion
// requires a complete scan and an authoritative projection; BEST-HISTORICAL is
// presentation only.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const MODULE_REL = 'src-surfaces-base/studio/ingestion/saved-chat-coverage.tauri.js';

const PASS = [];
const FAIL = [];
function check(label, fn) {
  try { fn(); PASS.push(label); console.log(`  ✓ ${label}`); }
  catch (e) { const m = e?.message ?? String(e); FAIL.push({ label, m }); console.log(`  ✗ ${label}`); console.log(`      ${m}`); }
}
async function checkAsync(label, fn) {
  try { await fn(); PASS.push(label); console.log(`  ✓ ${label}`); }
  catch (e) { const m = e?.message ?? String(e); FAIL.push({ label, m }); console.log(`  ✗ ${label}`); console.log(`      ${m}`); }
}
function readRepo(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

const CHAT = 'chat_cov';
const HASH_A = 'sha256-' + 'a'.repeat(64);
const HASH_B = 'sha256-' + 'b'.repeat(64);

/* A verified-package fixture. `contentHash` is what the governed validator
 * RECOMPUTES; `manifestContentHash` is what the manifest merely claims — the
 * engine must never read the latter. */
function pkg({
  dir, classification = 'generation', contentHash = HASH_A, status = 'ok',
  savedAt = '2026-01-01T00:00:00.000Z', schemaVersion = 2, chatId = CHAT,
  blockers = [], manifestContentHash = 'sha256-' + 'f'.repeat(64),
  mtime = 0, generatedAt = '2099-01-01T00:00:00.000Z',
}) {
  return {
    packagePath: `archive/packages/${dir}`,
    packageDirName: dir,
    nameClassification: classification,
    chatId, snapshotId: 'snap1',
    schemaVersion, payloadVersion: schemaVersion === 2 ? 2 : null,
    status, savedAt, blockers: blockers.map((code) => ({ code })),
    hashChecks: { expectedContentHash: contentHash, actualContentHash: manifestContentHash },
    // Timestamps deliberately present so a test can prove they are ignored.
    mtimeMs: mtime, manifestGeneratedAt: generatedAt,
  };
}

function load({ packages = [], complete = true, truncated = false, blockers = [], projection }) {
  const context = { console, setTimeout, __TAURI_INTERNALS__: {}, H2O: { Studio: { ingestion: {} } } };
  context.globalThis = context;
  const sandbox = vm.createContext(context);
  const ing = sandbox.H2O.Studio.ingestion;
  ing.listSavedChatArchivePackagesV1 = async () => ({
    packages: packages.map((p) => ({ packagePath: p.packagePath })),
    complete, truncated, blockers: blockers.map((code) => ({ code })),
  });
  const byPath = new Map(packages.map((p) => [p.packagePath, p]));
  ing.validateSavedChatPackageV1 = async ({ packagePath, includeDbChecks, includeCasChecks }) => {
    // The engine must exclude mutable EXTERNAL state from package validity.
    assert.equal(includeDbChecks, false, 'DB correlation must not decide package validity');
    assert.equal(includeCasChecks, false, 'live CAS presence must not decide package validity');
    return byPath.get(packagePath);
  };
  if (projection) ing.probeCurrentSavedChatProjectionV1 = async () => projection;
  vm.runInContext(readRepo(MODULE_REL), sandbox, { filename: MODULE_REL });
  const fn = sandbox.H2O?.Studio?.ingestion?.describeSavedChatCoverageV1;
  if (typeof fn !== 'function') throw new Error('coverage engine did not register');
  return fn;
}

const okProjection = (contentHash = HASH_A, schemaVersion = 2) => ({
  status: 'ok', reason: '', contentHash, snapshotId: 'snap1', schemaVersion,
  payloadVersion: schemaVersion === 2 ? 2 : null, assetShas: [],
});

async function main() {
  console.log('── Studio saved-chat coverage engine validator (M05 P2.2) ──────');

  const CODE = readRepo(MODULE_REL);
  check('composes existing authorities: no index, no pointer, no second hash impl', () => {
    assert.doesNotMatch(CODE, /archive_package_index|current\.json|latestPointer/i);
    assert.doesNotMatch(CODE, /sha256\s*\(|createHash|canonicalJson/i, 'must not implement a second contentHash');
    assert.doesNotMatch(CODE, /plugin:fs\||plugin:sql\|/, 'must not touch fs/sql directly');
  });

  await checkAsync('1. current projection equal to a valid generation ⇒ FRESH + COVERED', async () => {
    const describe = load({ packages: [pkg({ dir: 'g1.h2ochat', contentHash: HASH_A })], projection: okProjection(HASH_A) });
    const r = await describe({ chatId: CHAT });
    assert.equal(r.covered, true);
    assert.equal(r.preserved, true);
    assert.equal(r.fresh.length, 1);
    assert.equal(r.stale.length, 0);
    assert.equal(r.selected.packagePath, 'archive/packages/g1.h2ochat');
    assert.equal(r.complete, true);
  });

  await checkAsync('2. complete scan + authoritative projection + no equal package ⇒ not covered', async () => {
    const describe = load({ packages: [pkg({ dir: 'g1.h2ochat', contentHash: HASH_B })], projection: okProjection(HASH_A) });
    const r = await describe({ chatId: CHAT });
    assert.equal(r.covered, false, 'a complete scan MAY establish absence');
    assert.equal(r.preserved, true, 'the chat is still preserved');
    assert.equal(r.stale.length, 1);
    assert.equal(r.stale[0].staleKind, 'content-stale');
  });

  await checkAsync('3. timestamps can NEVER manufacture freshness', async () => {
    // Newest possible mtime and a far-future manifest generatedAt, but the
    // recomputed hash differs — so it is stale, full stop.
    const describe = load({
      packages: [pkg({ dir: 'g1.h2ochat', contentHash: HASH_B, mtime: 9e12, generatedAt: '2099-12-31T23:59:59.000Z' })],
      projection: okProjection(HASH_A),
    });
    const r = await describe({ chatId: CHAT });
    assert.equal(r.covered, false);
    assert.equal(r.fresh.length, 0, 'no timestamp may make a differing hash fresh');
  });

  await checkAsync('4. multiple valid historical generations remain visible', async () => {
    const describe = load({
      packages: [
        pkg({ dir: 'g1.h2ochat', contentHash: HASH_B, savedAt: '2026-01-01T00:00:00.000Z' }),
        pkg({ dir: 'g2.h2ochat', contentHash: 'sha256-' + 'c'.repeat(64), savedAt: '2026-02-01T00:00:00.000Z' }),
      ],
      projection: okProjection(HASH_A),
    });
    const r = await describe({ chatId: CHAT });
    assert.equal(r.generations.length, 2, 'both remain preserved and visible');
    assert.equal(r.stale.length, 2);
  });

  await checkAsync('5. a corrupt sibling does not erase a valid FRESH sibling', async () => {
    const describe = load({
      packages: [
        pkg({ dir: 'bad.h2ochat', status: 'blocked', blockers: ['content-hash-mismatch'], contentHash: HASH_B }),
        pkg({ dir: 'good.h2ochat', contentHash: HASH_A }),
      ],
      projection: okProjection(HASH_A),
    });
    const r = await describe({ chatId: CHAT });
    assert.equal(r.covered, true, 'the corrupt sibling must not remove coverage');
    assert.equal(r.fresh.length, 1);
    assert.equal(r.unusable.length, 1, 'and the corrupt one is surfaced, not hidden');
    assert.equal(r.unusable[0].packageDirName, 'bad.h2ochat');
  });

  await checkAsync('6. manifest contentHash tampering cannot manufacture freshness', async () => {
    // The manifest CLAIMS the current hash; the recomputed value disagrees.
    const describe = load({
      packages: [pkg({ dir: 'liar.h2ochat', contentHash: HASH_B, manifestContentHash: HASH_A })],
      projection: okProjection(HASH_A),
    });
    const r = await describe({ chatId: CHAT });
    assert.equal(r.fresh.length, 0, 'comparison must use the RECOMPUTED hash');
    assert.equal(r.covered, false);
  });

  await checkAsync('7. a valid legacy package is eligible for freshness and coverage', async () => {
    const describe = load({
      packages: [pkg({ dir: `${CHAT}.h2ochat`, classification: 'legacy', contentHash: HASH_A, schemaVersion: 1 })],
      projection: okProjection(HASH_A, 1),
    });
    const r = await describe({ chatId: CHAT });
    assert.equal(r.legacy.length, 1);
    assert.equal(r.covered, true, 'legacy participates in freshness exactly like a generation');
    assert.equal(r.selected.classification, 'legacy');
  });

  await checkAsync('7b. a FRESH generation is preferred over a FRESH legacy', async () => {
    const describe = load({
      packages: [
        pkg({ dir: `${CHAT}.h2ochat`, classification: 'legacy', contentHash: HASH_A }),
        pkg({ dir: 'g1.h2ochat', classification: 'generation', contentHash: HASH_A }),
      ],
      projection: okProjection(HASH_A),
    });
    const r = await describe({ chatId: CHAT });
    assert.equal(r.selected.classification, 'generation');
  });

  await checkAsync('8. incomplete/truncated discovery cannot establish absence', async () => {
    const describe = load({
      packages: [pkg({ dir: 'g1.h2ochat', contentHash: HASH_B })],
      complete: false, truncated: true, blockers: ['archive-package-inventory-truncated'],
      projection: okProjection(HASH_A),
    });
    const r = await describe({ chatId: CHAT });
    assert.equal(r.covered, null, 'null, never false: a truncated scan is not evidence of absence');
    assert.equal(r.complete, false);
    assert.equal(r.reason, 'discovery-incomplete');
    // A positive fact from an already-verified package is still safe.
    assert.equal(r.preserved, true);
  });

  await checkAsync('8b. truncated discovery may still establish a POSITIVE fresh result', async () => {
    const describe = load({
      packages: [pkg({ dir: 'g1.h2ochat', contentHash: HASH_A })],
      complete: false, truncated: true,
      projection: okProjection(HASH_A),
    });
    const r = await describe({ chatId: CHAT });
    assert.equal(r.covered, true, 'a verified equal package is a safe positive under a partial scan');
  });

  await checkAsync('9. indeterminate projection asserts neither fresh nor stale', async () => {
    const describe = load({
      packages: [pkg({ dir: 'g1.h2ochat', contentHash: HASH_B })],
      projection: { status: 'indeterminate', reason: 'store-not-ready', contentHash: '' },
    });
    const r = await describe({ chatId: CHAT });
    assert.equal(r.covered, null, 'never false from a partial current state');
    assert.equal(r.fresh.length, 0);
    assert.equal(r.stale.length, 0, 'and never stale either');
    assert.equal(r.preserved, true, 'packages remain preserved');
    assert.equal(r.projection.contentHash, '', 'no hash may leak from a non-ok projection');
  });

  await checkAsync('10. no-current-snapshot does not mislabel historical packages stale', async () => {
    const describe = load({
      packages: [pkg({ dir: 'g1.h2ochat', contentHash: HASH_B })],
      projection: { status: 'undefined-no-snapshot', reason: 'no-current-snapshot', contentHash: '' },
    });
    const r = await describe({ chatId: CHAT });
    assert.equal(r.stale.length, 0);
    assert.equal(r.covered, null);
    assert.equal(r.preserved, true);
    assert.equal(r.reason, 'no-current-snapshot');
  });

  await checkAsync('11. BEST-HISTORICAL appears only without a fresh package and is never authority', async () => {
    const fresh = load({ packages: [pkg({ dir: 'g1.h2ochat', contentHash: HASH_A })], projection: okProjection(HASH_A) });
    const rf = await fresh({ chatId: CHAT });
    assert.equal(rf.bestHistorical, null, 'a covered chat needs no historical candidate');

    const stale = load({
      packages: [
        pkg({ dir: 'g1.h2ochat', contentHash: HASH_B, savedAt: '2026-01-01T00:00:00.000Z' }),
        pkg({ dir: 'g2.h2ochat', contentHash: 'sha256-' + 'c'.repeat(64), savedAt: '2026-03-01T00:00:00.000Z' }),
      ],
      projection: okProjection(HASH_A),
    });
    const rs = await stale({ chatId: CHAT });
    assert.equal(rs.bestHistorical.packageDirName, 'g2.h2ochat', 'highest verified savedAt');
    assert.equal(rs.covered, false, 'BEST-HISTORICAL must not imply coverage');
    assert.equal(rs.fresh.length, 0, 'nor freshness');
    assert.equal(rs.selected, null, 'nor automatic selection');
  });

  await checkAsync('12. ties are preserved as ties, deterministically ordered', async () => {
    const describe = load({
      packages: [
        pkg({ dir: 'gz.h2ochat', contentHash: 'sha256-' + 'd'.repeat(64), savedAt: '2026-05-01T00:00:00.000Z' }),
        pkg({ dir: 'ga.h2ochat', contentHash: 'sha256-' + 'c'.repeat(64), savedAt: '2026-05-01T00:00:00.000Z' }),
      ],
      projection: okProjection(HASH_A),
    });
    const r = await describe({ chatId: CHAT });
    assert.equal(r.bestHistoricalTies.length, 2, 'a tie must be reported as a tie');
    // Deterministic: equal savedAt ⇒ contentHash hex ascending.
    // Cross-realm: compare contents, not prototypes.
    assert.deepEqual([...r.bestHistoricalTies.map((e) => e.packageDirName)], ['ga.h2ochat', 'gz.h2ochat']);
  });

  await checkAsync('a mismatched name is unusable even when its manifest claims the current hash', async () => {
    const describe = load({
      packages: [pkg({ dir: 'weird.h2ochat', classification: 'mismatch', contentHash: HASH_A, status: 'blocked', blockers: ['package-name-identity-mismatch'] })],
      projection: okProjection(HASH_A),
    });
    const r = await describe({ chatId: CHAT });
    assert.equal(r.covered, false, 'a mismatched package may not provide coverage');
    assert.equal(r.unusable.length, 1);
    assert.equal(r.fresh.length, 0);
  });

  await checkAsync('a package belonging to another verified chatId is ignored', async () => {
    const describe = load({
      packages: [pkg({ dir: 'g1.h2ochat', contentHash: HASH_A, chatId: 'someone_else' })],
      projection: okProjection(HASH_A),
    });
    const r = await describe({ chatId: CHAT });
    assert.equal(r.generations.length, 0);
    assert.equal(r.covered, false, 'verified identity decides ownership, not the basename');
  });

  await checkAsync('a differing construction family is FORMAT-stale, not content-stale', async () => {
    const describe = load({
      packages: [pkg({ dir: 'g3.h2ochat', contentHash: HASH_B, schemaVersion: 3 })],
      projection: okProjection(HASH_A, 2),
    });
    const r = await describe({ chatId: CHAT });
    assert.equal(r.stale.length, 1);
    assert.equal(r.stale[0].staleKind, 'format-stale');
  });

  await checkAsync('v1 vs v2 is ordinary content drift, NOT a format transition', async () => {
    const describe = load({
      packages: [pkg({ dir: 'g1.h2ochat', contentHash: HASH_B, schemaVersion: 1 })],
      projection: okProjection(HASH_A, 2),
    });
    const r = await describe({ chatId: CHAT });
    assert.equal(r.stale[0].staleKind, 'content-stale',
      'the live writer picks v1/v2 per content; that is not a format change');
  });

  console.log('');
  if (FAIL.length) {
    console.log(`PASS ${PASS.length}`);
    console.log(`FAIL ${FAIL.length}`);
    for (const f of FAIL) console.log(`- ${f.label}: ${f.m}`);
    process.exit(1);
  }
  console.log(`PASS ${PASS.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
