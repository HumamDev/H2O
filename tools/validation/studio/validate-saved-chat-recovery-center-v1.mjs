#!/usr/bin/env node
// Validator for the Saved Chat Recovery Center timeline surface (Mission T02).
//
// The Recovery Center is a COMPOSITION. Every fact it shows was established by
// an authority that already owns it, so the only thing worth proving here is
// that the surface does not quietly acquire authority of its own on the way to
// the screen — and that it does not lose the guarantees the authorities below
// it paid for.
//
// The failure modes this file is built to catch, each of which has a real
// precedent in this lane:
//
//   - re-deriving order (a filename, an mtime, a generatedAt, an insertion
//     index) instead of consuming coverage's already-sorted populations;
//   - re-reading the trusted archive once per row, turning one bounded read
//     into an N+1 storm;
//   - presenting an INCOMPLETE scan as absence;
//   - making a damaged package selectable, or hiding it so the operator reads
//     "nothing was ever saved";
//   - inventing a universal `recoverable` bit this Task has no authority for;
//   - letting an arbitrary or absolute path become a selection target;
//   - leaving a stale chat/version selection alive across a refresh.
//
// Everything is loaded into a Node VM against a DOM stub. No DB, no filesystem,
// no Tauri, no network.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const UI_REL = 'src-surfaces-base/studio/ingestion/saved-chat-recovery-center-ui.studio.js';
const ADAPTER_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-presentation.studio.js';
const HEALTH_UI_REL = 'src-surfaces-base/studio/ingestion/archive-health-ui.studio.js';
const HTML_REL = 'src-surfaces-base/studio/studio.html';
const PACK_REL = 'tools/product/studio/pack-studio.mjs';

const PASS = [];
const FAIL = [];
function check(label, fn) {
  try { fn(); PASS.push(label); console.log(`  ✓ ${label}`); }
  catch (e) { const m = e && e.message ? e.message : String(e); FAIL.push({ label, m }); console.log(`  ✗ ${label}`); console.log(`      ${m}`); }
}
async function checkAsync(label, fn) {
  try { await fn(); PASS.push(label); console.log(`  ✓ ${label}`); }
  catch (e) { const m = e && e.message ? e.message : String(e); FAIL.push({ label, m }); console.log(`  ✗ ${label}`); console.log(`      ${m}`); }
}
function readRepo(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

/* Values built inside the VM are not reference-equal to host values, so
 * deepEqual reports "same structure, not reference-equal" on arrays that are in
 * fact identical. Compare by value. */
function sameList(actual, expected, message) {
  assert.equal(Array.from(actual).join('\u0000'), expected.join('\u0000'), message);
}

/* Source scans must read CODE. This module's header documents at length the
 * authorities it refuses to hold, so a naive substring sweep over the raw file
 * reports a violation for the very comment that promises the opposite. */
function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

const uiSrc = readRepo(UI_REL);
const uiCode = codeOnly(uiSrc);

/* ── DOM stub, just rich enough for this card ───────────────────────────── */
function domStub() {
  const make = (tag) => {
    const node = {
      tagName: String(tag).toUpperCase(),
      children: [], attributes: {}, style: {}, disabled: false,
      id: '', value: '', selected: false, parentNode: null,
      _text: '', _listeners: {},
      set textContent(v) { this._text = String(v); this.children = []; },
      get textContent() { return this._text; },
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return this.attributes[k]; },
      appendChild(c) { c.parentNode = node; this.children.push(c); return c; },
      addEventListener(kind, fn) { this._listeners[kind] = fn; },
      click() { const fn = this._listeners.click; return fn ? fn() : undefined; },
      change() { const fn = this._listeners.change; return fn ? fn() : undefined; },
      querySelector(sel) {
        const m = /^\[([^=]+)="([^"]*)"\]$/.exec(String(sel));
        if (!m) return null;
        const walk = (n) => {
          if (n !== node && n.attributes && n.attributes[m[1]] === m[2]) return n;
          for (const c of n.children || []) { const hit = walk(c); if (hit) return hit; }
          return null;
        };
        return walk(node);
      },
    };
    return node;
  };
  return { createElement: make };
}

function walkAll(node, out = []) {
  if (!node) return out;
  out.push(node);
  for (const c of node.children || []) walkAll(c, out);
  return out;
}
function allText(node) {
  return walkAll(node).map((n) => n._text || '').join(' ');
}
function nodesWithAttr(node, attr, value) {
  return walkAll(node).filter((n) => n.attributes && (value === undefined
    ? n.attributes[attr] !== undefined
    : n.attributes[attr] === value));
}
function findByAction(node, action) {
  return nodesWithAttr(node, 'data-h2o-action', action)[0] || null;
}

/* Load the surface + the real presentation adapter into one VM. The adapter is
 * loaded for real, not stubbed: the labels an operator reads are part of what
 * this surface promises. */
function loadUi(document) {
  const ctx = vm.createContext({ console, Promise, setTimeout });
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.document = document;
  vm.runInContext(readRepo(ADAPTER_REL), ctx, { filename: ADAPTER_REL });
  vm.runInContext(uiSrc, ctx, { filename: UI_REL });
  return { ctx, api: ctx.H2O.Studio.recoveryCenterUi, ingestion: ctx.H2O.Studio.ingestion };
}

/* ── Synthetic archive ──────────────────────────────────────────────────────
 *
 * Two chats. One of them holds several valid generations plus a damaged
 * occupant; the other holds a single legacy package. Hashes are written in the
 * representations the shipping engine actually emits: bare on the trusted
 * occupant, prefixed on the projection. */
const HASH_CUR = 'a'.repeat(64);
const HASH_OLD = 'b'.repeat(64);
const HASH_MID = 'd'.repeat(64);

const OCC = {
  aCur: { class: 'verified-generation', name: 'chat_a.g1.h2ochat', path: 'archive/packages/chat_a.g1.h2ochat', chatId: 'chat_a', snapshotId: 's1', contentHash: HASH_CUR, savedAt: '2026-08-22T00:00:00.000Z', constructionFamily: 'v3', blockers: [] },
  aMid: { class: 'verified-generation', name: 'chat_a.g2.h2ochat', path: 'archive/packages/chat_a.g2.h2ochat', chatId: 'chat_a', snapshotId: 's2', contentHash: HASH_MID, savedAt: '2026-08-21T00:00:00.000Z', constructionFamily: 'v3', blockers: [] },
  aOld: { class: 'verified-generation', name: 'chat_a.g3.h2ochat', path: 'archive/packages/chat_a.g3.h2ochat', chatId: 'chat_a', snapshotId: 's3', contentHash: HASH_OLD, savedAt: '2026-08-20T00:00:00.000Z', constructionFamily: 'v3', blockers: [] },
  aBad: { class: 'indeterminate', reason: 'corrupt', name: 'chat_a.g4.h2ochat', path: 'archive/packages/chat_a.g4.h2ochat', chatId: 'chat_a', contentHash: '', savedAt: '', blockers: [{ code: 'generation-v3-gzip-decode-failed' }] },
  bLegacy: { class: 'legacy-package', name: 'chat_b.legacy.h2ochat', path: 'archive/packages/chat_b.legacy.h2ochat', chatId: 'chat_b', snapshotId: 's9', contentHash: HASH_OLD, savedAt: '2026-07-01T00:00:00.000Z', constructionFamily: 'v1', blockers: [] },
  reserved: { class: 'reserved-infrastructure', name: 'quarantine', path: 'archive/packages/quarantine' },
  stray: { class: 'indeterminate', reason: 'not-a-package-name', name: 'notes.txt', path: 'archive/packages/notes.txt' },
};

function envelope(over) {
  return Object.assign({
    schema: 'h2o.savedChatArchiveIntegrity', schemaVersion: 1, complete: true,
    occupants: [OCC.aCur, OCC.aMid, OCC.aOld, OCC.aBad, OCC.bLegacy, OCC.reserved, OCC.stray],
    blockers: [],
  }, over || {});
}

/* The real partition, so the surface is proved against the canonical one. */
function loadPartition() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  vm.runInContext(readRepo('src-surfaces-base/studio/ingestion/saved-chat-archive-health-mapping.js'), ctx,
    { filename: 'health-mapping' });
  return ctx.H2O.Studio.archiveHealthMapping.partitionOccupants;
}
const partitionOccupants = loadPartition();

function covEntry(occ, over) {
  return Object.assign({
    packagePath: occ.path,
    packageDirName: occ.name,
    classification: occ.class === 'verified-generation' ? 'generation'
      : (occ.class === 'legacy-package' ? 'legacy' : 'unclassified'),
    chatId: occ.chatId || '',
    snapshotId: occ.snapshotId || '',
    schemaVersion: occ.constructionFamily === 'v3' ? 3 : 1,
    payloadVersion: occ.constructionFamily === 'v3' ? 3 : null,
    contentHash: occ.contentHash || '',
    savedAt: occ.savedAt || '',
    status: (occ.class === 'verified-generation' || occ.class === 'legacy-package') ? 'ok' : 'blocked',
    blockers: (occ.blockers || []).map((b) => b.code),
  }, over || {});
}

/* Coverage's real output shape for chat_a: newest-first, exactly as
 * compareHistorical produced it. */
function coverageA(over) {
  const cur = covEntry(OCC.aCur);
  const mid = covEntry(OCC.aMid);
  const old = covEntry(OCC.aOld);
  return Object.assign({
    chatId: 'chat_a', complete: true, preserved: true, covered: true,
    projection: { status: 'ok', contentHash: 'sha256-' + HASH_CUR, schemaVersion: 3 },
    generations: [cur, mid, old], legacy: [], unusable: [covEntry(OCC.aBad)],
    fresh: [cur],
    stale: [Object.assign({}, mid, { staleKind: 'content-stale' }), Object.assign({}, old, { staleKind: 'content-stale' })],
    selected: cur, bestHistorical: null, bestHistoricalTies: [], reason: '',
  }, over || {});
}

function harness(overrides) {
  const o = overrides || {};
  const calls = { integrity: 0, coverage: 0, inspect: 0, coverageChats: [], inspectPaths: [] };
  const document = domStub();
  const { api, ingestion } = loadUi(document);
  const container = document.createElement('div');
  const card = api.renderRecoveryCenterCard(container, Object.assign({
    capable: true,
    autoLoad: false,
    readIntegrity: () => { calls.integrity += 1; return Promise.resolve(o.envelope || envelope()); },
    partitionOccupants,
    describeCoverage: ({ chatId }) => {
      calls.coverage += 1; calls.coverageChats.push(chatId);
      if (o.coverageFor) return Promise.resolve(o.coverageFor(chatId));
      return Promise.resolve(chatId === 'chat_a' ? coverageA() : coverageA({ chatId }));
    },
    describeState: ingestion.describeSavedChatArchiveStateV1,
    entryPresentation: ingestion.savedChatArchivePresentationV1.entryPresentation,
    inspectPackage: ({ packagePath }) => {
      calls.inspect += 1; calls.inspectPaths.push(packagePath);
      return Promise.resolve({
        ok: true, status: 'verified', packagePath, packageDirName: packagePath.split('/').pop(),
        identity: { chatId: 'chat_a', snapshotId: 's1', title: 'A chat', contentHash: 'sha256-' + HASH_CUR, schemaVersion: 3, messageCount: 4 },
        checks: { archiveEnumerationComplete: true }, blockers: [], preview: '', error: null,
      });
    },
  }, o.options || {}));
  return { api, ingestion, document, container, card, calls };
}

console.log('── Saved Chat Recovery Center validator (T02) ─────────────────');

/* ── Property 1 — one trusted read per open/refresh, never per row ───────── */
await checkAsync('1. the trusted archive is read ONCE per open and ONCE per refresh, never per row', async () => {
  const h = harness();
  await h.card.load();
  assert.equal(h.calls.integrity, 1, 'open did not read the trusted archive exactly once');
  await h.card.selectChat('chat_a');
  const rows = nodesWithAttr(h.container, 'data-h2o-row', 'recovery-center-version');
  assert.ok(rows.length >= 4, `expected the chat's rows to render, saw ${rows.length}`);
  assert.equal(h.calls.integrity, 1, `rendering ${rows.length} rows triggered ${h.calls.integrity - 1} extra trusted reads (N+1)`);
  assert.equal(h.calls.coverage, 1, 'coverage was called more than once for one chat selection');
  await h.card.load();
  assert.equal(h.calls.integrity, 2, 'refresh did not re-read the trusted archive');
});

/* ── Property 2 — the canonical partition is the only one ────────────────── */
check('2. reserved infrastructure and non-package strays never become chats or rows', () => {
  const h = harness();
  const index = h.api.buildChatIndex(partitionOccupants(envelope().occupants).packageOccupants);
  const labels = index.map((c) => c.label);
  assert.ok(!labels.some((l) => /quarantine|notes\.txt/.test(l)),
    'a reserved or stray occupant reached the chat index: ' + labels.join(', '));
  sameList(index.filter((c) => c.attributed).map((c) => c.chatId), ['chat_a', 'chat_b']);
});

check('2b. the module contains no second occupant partition', () => {
  assert.ok(!/reserved-infrastructure|not-a-package-name|verified-generation|legacy-package/.test(uiCode),
    'the surface re-implements trusted class handling instead of using partitionOccupants');
});

/* ── Property 3 — coverage order is consumed, never recomputed ───────────── */
check('3. the module holds no ordering authority: no comparator, no sort, no clock', () => {
  for (const token of ['.sort(', 'localeCompare', 'mtime', 'generatedAt', 'Date.now', 'new Date', 'getTime(']) {
    assert.ok(!uiCode.includes(token), `ordering/timestamp authority found in code: ${token}`);
  }
});

await checkAsync('3b. rows appear in COVERAGE order, not in any order this surface chose', async () => {
  const h = harness();
  await h.card.load();
  await h.card.selectChat('chat_a');
  const sections = h.card.getState().sections;
  const current = sections.find((s) => s.key === 'current');
  const historical = sections.find((s) => s.key === 'historical');
  sameList(current.rows.map((r) => r.packageDirName), ['chat_a.g1.h2ochat']);
  // coverage handed stale as [g2, g3]; the surface must not reorder it.
  sameList(historical.rows.map((r) => r.packageDirName), ['chat_a.g2.h2ochat', 'chat_a.g3.h2ochat']);
});

check('3c. NEGATIVE CONTROL — a scrambled coverage order is carried through unchanged', () => {
  const h = harness();
  const scrambled = coverageA();
  scrambled.stale = [scrambled.stale[1], scrambled.stale[0]];
  const sections = h.api.buildTimelineSections(scrambled, h.ingestion.savedChatArchivePresentationV1.entryPresentation);
  const historical = sections.find((s) => s.key === 'historical');
  sameList(historical.rows.map((r) => r.packageDirName), ['chat_a.g3.h2ochat', 'chat_a.g2.h2ochat'],
    'the surface re-sorted coverage output instead of consuming it');
});

/* ── Property 4 — one inspection per version selection ───────────────────── */
await checkAsync('4. the package inspector runs for the SELECTED version only', async () => {
  const h = harness();
  await h.card.load();
  await h.card.selectChat('chat_a');
  assert.equal(h.calls.inspect, 0, 'rendering rows already inspected packages');
  await h.card.selectVersion('archive/packages/chat_a.g2.h2ochat');
  assert.equal(h.calls.inspect, 1);
  sameList(h.calls.inspectPaths, ['archive/packages/chat_a.g2.h2ochat']);
});

/* ── Property 5 — an incomplete scan is stated, never read as absence ────── */
await checkAsync('5. `complete === false` is visibly communicated in the Archive Health wording', async () => {
  const h = harness({ envelope: envelope({ complete: false }) });
  await h.card.load();
  const text = allText(h.container);
  assert.ok(text.includes('Partial scan'), 'the Partial scan pill is missing');
  assert.ok(text.includes('Archive discovery was incomplete.'), 'the incomplete headline is missing');
  assert.ok(text.includes('absence cannot be concluded'), 'the absence caveat is missing');
});

await checkAsync('5b. NEGATIVE CONTROL — a complete scan does not show the partial-scan warning', async () => {
  const h = harness();
  await h.card.load();
  const text = allText(h.container);
  assert.ok(!text.includes('Partial scan'), 'a complete scan was labelled a partial scan');
});

await checkAsync('5c. a missing `complete` flag is treated as incomplete, never assumed complete', async () => {
  const h = harness({ envelope: { schema: 'x', occupants: [], blockers: [] } });
  await h.card.load();
  assert.equal(h.card.getState().complete, false, 'an unstated scan state was assumed complete');
  assert.ok(allText(h.container).includes('Partial scan'),
    'an unstated scan state was presented without the partial-scan warning');
});

/* ── Property 6 — freshness is never asserted without an authority ───────── */
await checkAsync('6. when coverage cannot assert freshness, no row is labelled current or historical', async () => {
  const h = harness({
    coverageFor: () => coverageA({
      projection: { status: 'db-unavailable', contentHash: '' },
      covered: null, fresh: [], stale: [], selected: null,
    }),
  });
  await h.card.load();
  await h.card.selectChat('chat_a');
  const keys = h.card.getState().sections.map((s) => s.key);
  assert.ok(!keys.includes('current') && !keys.includes('historical'),
    'the surface asserted freshness the coverage authority refused to assert: ' + keys.join(', '));
  assert.ok(keys.includes('preserved-generations'), 'preserved versions were hidden instead of shown');
  const text = allText(h.container);
  assert.ok(text.includes('not marked current or historical'), 'the operator was not told freshness is unasserted');
});

/* ── Property 7 — damaged packages are visible AND non-selectable ────────── */
await checkAsync('7. an unusable occupant is shown, and cannot be selected', async () => {
  const h = harness();
  await h.card.load();
  await h.card.selectChat('chat_a');
  const unusable = h.card.getState().sections.find((s) => s.key === 'unusable');
  assert.ok(unusable && unusable.rows.length === 1, 'the damaged package was hidden — absence would be implied');
  assert.equal(unusable.rows[0].selectable, false, 'a damaged package was selectable');
  const nonSelectable = nodesWithAttr(h.container, 'data-h2o-selectable', '0');
  assert.equal(nonSelectable.length, 1, 'the damaged row is not rendered as non-selectable');
  assert.notEqual(nonSelectable[0].tagName, 'BUTTON', 'a non-selectable row was still rendered as a button');
  await h.card.selectVersion('archive/packages/chat_a.g4.h2ochat');
  assert.equal(h.calls.inspect, 0, 'selecting a damaged package was allowed through');
  assert.equal(h.card.getState().selectedPackagePath, '');
  // The trusted CLASS is what makes it non-selectable — not its section. A
  // damaged package offered in a selectable section must still be refused.
  const present = h.ingestion.savedChatArchivePresentationV1.entryPresentation;
  const cov = coverageA();
  cov.fresh = [covEntry(OCC.aBad)];
  const smuggled = h.api.buildTimelineSections(cov, present)
    .find((s2) => s2.key === 'current').rows[0];
  assert.equal(smuggled.kind, 'unusable', 'fixture no longer models a damaged package');
  assert.equal(smuggled.selectable, false,
    'a damaged package became selectable merely by appearing in a selectable section');
});

/* Coverage's `unusable` population is NOT limited to entries whose trusted
 * class is unusable: a generation that verified as a class but carries no
 * recomputed identity (blocked status, empty contentHash) lands there too. So
 * the section-level gate has to hold on its own — the trusted-class gate alone
 * would let exactly that row through. */
await checkAsync('7c. an unusable-population row is non-selectable even with a valid class', async () => {
  const h = harness();
  const present = h.ingestion.savedChatArchivePresentationV1.entryPresentation;
  const cov = coverageA();
  cov.unusable = [covEntry(OCC.aCur, { status: 'blocked', contentHash: '' })];
  const row = h.api.buildTimelineSections(cov, present)
    .find((s2) => s2.key === 'unusable').rows[0];
  assert.equal(row.kind, 'generation', 'fixture no longer models a classed-but-unusable entry');
  assert.equal(row.selectable, false,
    'a row coverage placed in `unusable` was selectable because its class looked valid');
});

check('7b. no universal recovery-eligibility bit is published', () => {
  assert.ok(!/recoverable/i.test(uiCode), 'the surface publishes a recovery-eligibility claim it has no authority for');
  assert.ok(!/\brestorable\b|\bcanRecover\b|\beligible\b/i.test(uiCode), 'an eligibility claim leaked into the row model');
});

/* ── Property 8 — selection identity is the trusted, scoped path ─────────── */
await checkAsync('8. only a trusted, archive-scoped path can become a selection target', async () => {
  const h = harness();
  await h.card.load();
  await h.card.selectChat('chat_a');
  for (const hostile of [
    '/etc/passwd',
    '/Users/someone/Library/Application Support/archive/packages/x.h2ochat',
    'archive/packages/../../../etc/passwd',
    'archive/packages/chat_a.g1.h2ochat/../../evil.h2ochat',
    '../archive/packages/chat_a.g1.h2ochat',
    'archive/packages/chat_a.g9.h2ochat',
    '',
  ]) {
    await h.card.selectVersion(hostile);
    assert.equal(h.calls.inspect, 0, `an out-of-scope selector reached the inspector: ${hostile}`);
    assert.equal(h.card.getState().selectedPackagePath, '', `an out-of-scope selector was retained: ${hostile}`);
  }
  await h.card.selectVersion('archive/packages/chat_a.g1.h2ochat');
  assert.equal(h.calls.inspect, 1, 'the legitimate trusted path was refused');
});

await checkAsync('8a. an out-of-scope path on a TRUSTED-VALID row is still non-selectable', async () => {
  const h = harness();
  const present = h.ingestion.savedChatArchivePresentationV1.entryPresentation;
  for (const hostile of [
    '/Users/someone/Library/Application Support/archive/packages/x.h2ochat',
    'archive/packages/../../../etc/passwd.h2ochat',
    'somewhere/else/chat_a.g1.h2ochat',
    'archive/packages/',
    'archive/packagesX/chat_a.g1.h2ochat',
    'C:\\archive\\packages\\chat_a.g1.h2ochat',
  ]) {
    const cov = coverageA();
    cov.fresh = [covEntry(OCC.aCur, { packagePath: hostile, packageDirName: hostile.split('/').pop() })];
    const sections = h.api.buildTimelineSections(cov, present);
    const row = sections.find((s2) => s2.key === 'current').rows[0];
    assert.equal(row.kind, 'generation', 'fixture no longer models a trusted-valid row');
    assert.equal(row.selectable, false, `an out-of-scope path stayed selectable: ${hostile}`);
  }
  /* The hostile paths above are each refused by the guard's PREFIX or
   * FORWARD-SLASH condition, so none of them reaches its traversal/backslash
   * clause — deleting that clause outright leaves every one of them rejected,
   * and the assertion above stays green over a real hole.
   *
   * These selectors are shaped to land on that clause and nothing else: each
   * carries the exact package-root prefix, a non-empty leaf, and no forward
   * slash in the leaf, so the surrounding conditions all pass and only the
   * traversal/backslash rejection can refuse them. The preconditions are
   * asserted rather than assumed, so a later edit cannot quietly make these
   * fixtures vacuous again. */
  const PREFIX = 'archive/packages/';
  for (const { selector, isolates } of [
    // Leaf is exactly "..": no backslash, so ONLY the traversal condition can
    // reject it. Without that condition the archive root's own parent becomes
    // a selectable target.
    { selector: 'archive/packages/..', isolates: 'traversal' },
    // Leaf carries backslashes and no "..": ONLY the backslash condition can
    // reject it, so removing that half alone is caught here.
    { selector: 'archive/packages/a\\b', isolates: 'backslash' },
    // Both together — a Windows-style escape out of the package root.
    { selector: 'archive/packages/a\\..\\b', isolates: 'traversal + backslash' },
  ]) {
    const leaf = selector.slice(PREFIX.length);
    // Condition C: prove the case actually reaches the intended clause.
    assert.ok(selector.startsWith(PREFIX), `${selector} would be refused by the prefix condition`);
    assert.ok(leaf.length > 0, `${selector} would be refused by the empty-leaf condition`);
    assert.ok(!leaf.includes('/'), `${selector} would be refused by the forward-slash condition`);

    const cov = coverageA();
    cov.fresh = [covEntry(OCC.aCur, { packagePath: selector, packageDirName: leaf })];
    const sections = h.api.buildTimelineSections(cov, present);
    const row = sections.find((s2) => s2.key === 'current').rows[0];
    assert.equal(row.kind, 'generation', 'fixture no longer models a trusted-valid row');
    assert.equal(row.selectable, false,
      `the ${isolates} guard did not reject a selectable target: ${selector}`);
  }

  // Control: the same row with its real trusted path IS selectable.
  const ok = coverageA();
  const sections = h.api.buildTimelineSections(ok, present);
  assert.equal(sections.find((s2) => s2.key === 'current').rows[0].selectable, true,
    'the scope guard rejected a legitimate trusted path');
});

check('8c. the surface holds no package-name grammar', () => {
  assert.ok(!uiCode.includes('.h2ochat'),
    'the package extension vocabulary leaked into a surface that is not a sanctioned owner of it');
});

check('8b. no hash is fabricated, derived or re-implemented in this surface', () => {
  for (const token of ['sha256(', 'createHash', 'subtle.digest', 'canonicalJson', 'contentHashV3', "'sha256-' +", 'sha256Prefixed']) {
    assert.ok(!uiCode.includes(token), `hash derivation found in code: ${token}`);
  }
});

/* ── Property 9 — no verification, discovery or mutation authority ───────── */
check('9. the surface holds no verification, filesystem or mutation authority', () => {
  for (const token of [
    'invoke(', '__TAURI__.invoke', 'readDir', 'readTextFile', 'writeTextFile', 'removeFile', 'remove(',
    'snapshots.create', 'upsert', 'DELETE ', 'INSERT ', 'UPDATE ',
    'h2o_archive_reclamation_preview', 'h2o_archive_reclamation_execute', 'h2o_archive_occupant_quarantine',
  ]) {
    assert.ok(!uiCode.includes(token), `forbidden capability found in code: ${token}`);
  }
});

check('9b. the reclamation preview is not a source for this surface', () => {
  assert.ok(!uiCode.includes('reclamation'), 'the surface reaches into the reclamation authority');
});

check('9c. no recovery, import, restore, relink or confirmation control exists', () => {
  for (const token of ['confirm(', 'archiveImporter', 'archiveExporter', 'archiveRestore', 'archiveRelink', 'importPackage', 'restorePackage']) {
    assert.ok(!uiCode.includes(token), `an out-of-boundary control leaked in: ${token}`);
  }
});

await checkAsync('9d. only Refresh and version-selection controls are rendered', async () => {
  const h = harness();
  await h.card.load();
  await h.card.selectChat('chat_a');
  const actions = nodesWithAttr(h.container, 'data-h2o-action').map((n) => n.attributes['data-h2o-action']);
  assert.ok(actions.length > 1, 'no controls rendered at all — the check would pass vacuously');
  const allowed = new Set(['recovery-center-refresh', 'recovery-center-select-version']);
  for (const a of actions) assert.ok(allowed.has(a), `an unexpected control is present: ${a}`);
});

/* ── Property 10 — refresh invalidates a stale selection ─────────────────── */
await checkAsync('10. a refresh that drops a chat clears the stale chat AND version selection', async () => {
  let env = envelope();
  const h = harness({ options: { readIntegrity: () => Promise.resolve(env) } });
  await h.card.load();
  await h.card.selectChat('chat_a');
  await h.card.selectVersion('archive/packages/chat_a.g1.h2ochat');
  assert.equal(h.card.getState().selectedChatId, 'chat_a');
  assert.equal(h.card.getState().selectedPackagePath, 'archive/packages/chat_a.g1.h2ochat');

  env = envelope({ occupants: [OCC.bLegacy] });   // chat_a is gone
  await h.card.load();
  const s = h.card.getState();
  assert.equal(s.selectedChatId, '', 'a chat that no longer exists stayed selected');
  assert.equal(s.selectedPackagePath, '', 'a version of a vanished chat stayed selected');
  assert.equal(s.sections.length, 0, 'a vanished chat left its rows on screen');
  assert.equal(s.inspection, null, 'a stale inspection survived the refresh');
});

await checkAsync('10b. changing chat clears the previous chat version selection', async () => {
  const h = harness();
  await h.card.load();
  await h.card.selectChat('chat_a');
  await h.card.selectVersion('archive/packages/chat_a.g1.h2ochat');
  await h.card.selectChat('chat_b');
  const s = h.card.getState();
  assert.equal(s.selectedPackagePath, '', 'a version selection survived a chat change');
  assert.equal(s.inspection, null, 'an inspection from the previous chat survived a chat change');
});

/* ── Property 11 — remount is neutral, and the surface is registered ─────── */
await checkAsync('11. remounting yields exactly one card and one set of controls', async () => {
  const document = domStub();
  const { api } = loadUi(document);
  const parent = document.createElement('div');
  const health = document.createElement('div');
  parent.appendChild(health);
  const opts = { capable: true, autoLoad: false, readIntegrity: () => Promise.resolve(envelope()), partitionOccupants };

  api.mountRecoveryCenterCard(health, opts);
  api.mountRecoveryCenterCard(health, opts);
  api.mountRecoveryCenterCard(health, opts);

  const mounts = nodesWithAttr(parent, 'data-h2o-recovery-center-mount', '1');
  assert.equal(mounts.length, 1, `remounting created ${mounts.length} mount points`);
  const cards = nodesWithAttr(parent, 'data-h2o-card', 'saved-chat-recovery-center');
  assert.equal(cards.length, 1, `remounting left ${cards.length} cards behind`);
  const refreshes = nodesWithAttr(parent, 'data-h2o-action', 'recovery-center-refresh');
  assert.equal(refreshes.length, 1, `remounting left ${refreshes.length} refresh controls behind`);
});

check('11b. the surface degrades to a Desktop-only message instead of crashing', () => {
  const document = domStub();
  const { api } = loadUi(document);
  const container = document.createElement('div');
  const card = api.renderRecoveryCenterCard(container, { capable: false });
  assert.ok(card, 'the card returned null instead of degrading');
  assert.ok(allText(container).includes('Desktop Studio only'), 'no Desktop-only message was shown');
});

check('11c. the module is registered in studio.html and in both pack lists', () => {
  const leaf = 'saved-chat-recovery-center-ui.studio.js';
  assert.ok(readRepo(HTML_REL).includes(`./ingestion/${leaf}`), 'not registered in studio.html');
  const pack = readRepo(PACK_REL);
  const occurrences = pack.split(`"ingestion/${leaf}"`).length - 1;
  assert.equal(occurrences, 2, `expected 2 pack-list registrations, found ${occurrences}`);
  assert.ok(readRepo(HEALTH_UI_REL).includes('mountRecoveryCenterCard'), 'the health card never mounts it');
});

/* ── Runtime shape: the whole surface end to end ─────────────────────────── */
await checkAsync('12. end to end: two chats, an ordered timeline, statuses and a selection', async () => {
  const h = harness();
  await h.card.load();
  const chats = h.card.getState().chats;
  sameList(chats.filter((c) => c.attributed).map((c) => c.chatId), ['chat_a', 'chat_b']);
  assert.equal(chats.find((c) => c.chatId === 'chat_a').packageCount, 4);

  await h.card.selectChat('chat_a');
  const text = allText(h.container);
  assert.ok(text.includes('Current'), 'no Current section rendered');
  assert.ok(text.includes('Earlier versions'), 'no historical section rendered');
  assert.ok(text.includes('Damaged or unreadable'), 'no damaged section rendered');
  assert.ok(text.includes('Immutable generation'), 'the trusted kind label is missing');
  assert.ok(text.includes('generation-v3-gzip-decode-failed'), 'the blocker code was hidden from the operator');

  const rows = h.card.getState().sections.flatMap((s) => s.rows);
  assert.equal(rows.filter((r) => r.isCurrent).length, 1, 'exactly one row should be current');
  assert.equal(rows.find((r) => r.isCurrent).packageDirName, 'chat_a.g1.h2ochat');

  await h.card.selectVersion('archive/packages/chat_a.g1.h2ochat');
  const detail = allText(h.container);
  assert.ok(detail.includes('Version detail'), 'the detail panel is missing');
  assert.ok(detail.includes('verified'), 'the inspected status is missing');
  assert.ok(detail.includes('sha256-' + HASH_CUR), 'the verified contentHash is missing');
  const selectedNodes = nodesWithAttr(h.container, 'data-h2o-selected', '1');
  assert.equal(selectedNodes.length, 1, 'the selected row is not marked exactly once');
});

console.log('');
if (FAIL.length) {
  console.log(`[recovery-center] ${FAIL.length} of ${PASS.length + FAIL.length} checks FAILED`);
  for (const f of FAIL) console.log(`  ✗ ${f.label}: ${f.m}`);
  process.exit(1);
}
console.log(`[recovery-center] PASS ${PASS.length}`);
