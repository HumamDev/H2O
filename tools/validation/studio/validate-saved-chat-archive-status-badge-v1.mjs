#!/usr/bin/env node
// Validator for Phase E.2.2 saved-chat archive status badge (UI shell).
//
// Static checks keep the badge a quiet, read-only renderer (no delivery/read-back/
// Desktop/timer/watcher/content). VM checks (with a minimal fake DOM) prove it
// renders the right wbBadge--archive-status for delivered/needs-snapshot rows,
// stays quiet for archive-off, and never marks link-only rows as archived.

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const BADGE_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-status-badge.studio.js';
const BADGE_FILE = 'saved-chat-archive-status-badge.studio.js';
const STATUS_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-status.studio.js';
const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
const PACK_STUDIO_REL = 'tools/product/studio/pack-studio.mjs';
const STUDIO_JS_REL = 'src-surfaces-base/studio/studio.js';

const PASS = [];
const FAIL = [];

function readRepo(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }
function check(label, fn) {
  try { fn(); PASS.push(label); console.log(`  PASS ${label}`); }
  catch (err) { const m = err && err.message ? err.message : String(err); FAIL.push({ label, message: m }); console.log(`  FAIL ${label}`); console.log(`       ${m}`); }
}
function stripComments(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/* ── Minimal fake DOM for VM render tests ─────────────────────────────── */
function makeFakeDocument() {
  function makeEl() {
    return {
      className: '',
      children: [],
      _attrs: {},
      textContent: '',
      appendChild(child) { this.children.push(child); return child; },
      setAttribute(k, v) { this._attrs[k] = String(v); },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
      remove() { if (this._parent) { const i = this._parent.children.indexOf(this); if (i >= 0) this._parent.children.splice(i, 1); } },
      querySelector(sel) { return findBySelector(this, sel); },
    };
  }
  function classList(el) { return String(el.className || '').split(/\s+/).filter(Boolean); }
  function matchesSelector(el, sel) {
    if (sel.charAt(0) === '.') return classList(el).includes(sel.slice(1));
    return false;
  }
  function findBySelector(root, sel) {
    for (const child of root.children) {
      child._parent = root;
      if (matchesSelector(child, sel)) return child;
      const deep = findBySelector(child, sel);
      if (deep) return deep;
    }
    return null;
  }
  return { createElement() { return makeEl(); }, _makeEl: makeEl };
}

function createSandbox() {
  const fakeDoc = makeFakeDocument();
  const context = {
    console, Date, JSON, Math, Number, Object, Array, Promise, RegExp, String, Map,
    document: fakeDoc,
    H2O: { Studio: { ingestion: {
      // sync flag diagnose; default enabled true (overridden per test via diagnostics arg)
      diagnoseSavedChatArchiveOnSaveToFolderV1: () => ({ enabled: true }),
      // local accessor stub (async); badge tests pass `local` directly, so this is unused there
      getSavedChatArchiveLocalDeliveryMetaV1: async () => ({ delivered: false, requestId: null, deliveredAt: null }),
    } } },
  };
  context.globalThis = context; context.window = context;
  return vm.createContext(context);
}
function loadBadge(context) {
  vm.runInContext(readRepo(STATUS_REL), context, { filename: STATUS_REL });
  vm.runInContext(readRepo(BADGE_REL), context, { filename: BADGE_REL });
  const fn = context.H2O?.Studio?.ingestion?.appendSavedChatArchiveStatusBadgeV1;
  assert.equal(typeof fn, 'function', 'appendSavedChatArchiveStatusBadgeV1 not registered');
  return { fn, context };
}
function makeArticle(context) {
  const el = context.document._makeEl();
  return el;
}
function savedRow(over = {}) {
  return { chatId: 'chat_e22', snapshotId: 'snap_e22', title: 'Saved chat', isSaved: true, displayView: 'saved', badgeKind: 'Saved', ...over };
}

const badgeSrc = readRepo(BADGE_REL);
const badgeCode = stripComments(badgeSrc);
const studioHtml = readRepo(STUDIO_HTML_REL);
const packStudio = readRepo(PACK_STUDIO_REL);
const studioJs = readRepo(STUDIO_JS_REL);

console.log('[saved-chat-archive-status-badge-v1] static checks');

check('badge module exists and registers appendSavedChatArchiveStatusBadgeV1', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, BADGE_REL)));
  assert.match(badgeSrc, /H2O\.Studio\.ingestion\.appendSavedChatArchiveStatusBadgeV1\s*=/);
});

check('badge uses the status model and the local delivery accessor', () => {
  assert.ok(badgeSrc.includes('computeSavedChatArchiveStatusV1'), 'must use the status model');
  assert.ok(badgeSrc.includes('getSavedChatArchiveLocalDeliveryMetaV1'), 'must use the local delivery accessor');
});

check('badge uses wbBadge conventions, the archive-status class and data attribute', () => {
  assert.ok(badgeSrc.includes('wbBadge--archive-status'), 'must use the wbBadge--archive-status class');
  assert.match(badgeSrc, /wbBadge\b/, 'must reuse wbBadge base class');
  assert.ok(badgeSrc.includes('data-h2o-archive-status'), 'must set data-h2o-archive-status');
  assert.ok(badgeSrc.includes('appendChild'), 'must append into a badge container');
});

check('badge calls no delivery / read-back / Desktop / queue APIs', () => {
  for (const token of [
    'deliverSavedChatArchiveRequestV1',
    'readSavedChatArchiveRequestReceiptV1',
    'refreshSavedChatArchiveRequestStatusV1',
    'enqueueSavedChatArchiveRequestV1',
    'materializeSavedChatArchiveRequestV1',
    'writeSavedChatPackageV1',
    'assetCas',
    'plugin:sql',
    'nativeMessaging',
  ]) {
    assert.equal(badgeCode.includes(token), false, `badge must not reference: ${token}`);
  }
  assert.doesNotMatch(badgeCode, /fetch\s*\(/, 'no network fetch');
  assert.doesNotMatch(badgeCode, /localhost|127\.0\.0\.1|WebDAV/i, 'no localhost/WebDAV');
});

check('badge uses no timers/polling/watcher and no click handlers (shell only)', () => {
  assert.doesNotMatch(badgeCode, /setInterval/, 'no setInterval');
  assert.doesNotMatch(badgeCode, /setTimeout/, 'no setTimeout');
  assert.doesNotMatch(badgeCode, /MutationObserver/, 'no MutationObserver');
  assert.doesNotMatch(badgeCode, /addEventListener/, 'no event listeners (no click handlers yet)');
});

check('badge inspects no authoritative content fields and writes no storage', () => {
  for (const token of ['transcript', 'outerHTML', 'markdown', 'contentHash', 'casPath', 'packagePath', 'chrome.storage', 'localStorage']) {
    assert.equal(badgeCode.includes(token), false, `badge must not reference: ${token}`);
  }
  assert.doesNotMatch(badgeCode, /\bmessages\b/, 'no messages content');
  assert.doesNotMatch(badgeCode, /\bassets\b/, 'no assets content');
});

check('badge module is loaded in studio.html and shipped in pack-studio (both lists)', () => {
  assert.ok(studioHtml.includes(`./ingestion/${BADGE_FILE}`), 'loader missing from studio.html');
  const occurrences = [...packStudio.matchAll(new RegExp(BADGE_FILE.replace(/\./g, '\\.'), 'g'))].length;
  assert.ok(occurrences >= 2, 'badge module must appear in pack input and output lists');
});

check('studio.js contains only the single E.2.2 delegation hunk', () => {
  assert.ok(studioJs.includes('appendSavedChatArchiveStatusBadgeV1'), 'studio.js must delegate to the badge helper');
  const calls = [...studioJs.matchAll(/appendSavedChatArchiveStatusBadgeV1/g)].length;
  assert.equal(calls, 1, 'exactly one delegation reference in studio.js');
  // The staged studio.js diff (if any) must be only the delegation line.
  let staged = '';
  try { staged = execSync('git diff --cached -- "src-surfaces-base/studio/studio.js"', { cwd: REPO_ROOT }).toString(); }
  catch (_) { staged = ''; }
  const addedLines = staged.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
  for (const line of addedLines) {
    assert.ok(/appendSavedChatArchiveStatusBadgeV1|E\.2\.2: quiet inline archive/.test(line), `unexpected staged studio.js line: ${line}`);
  }
});

check('S0F0j and S0F1j are not staged in this change set', () => {
  let staged = [];
  try { staged = execSync('git diff --cached --name-only', { cwd: REPO_ROOT }).toString().split('\n').map((l) => l.trim()).filter(Boolean); }
  catch (_) { staged = []; }
  assert.equal(staged.some((l) => /S0F0j\. /.test(l)), false, 'S0F0j must not be staged');
  assert.equal(staged.some((l) => /S0F1j\. /.test(l)), false, 'S0F1j must not be staged');
});

console.log('[saved-chat-archive-status-badge-v1] VM behavior checks');

check('delivered saved row renders a waiting-for-desktop badge', () => {
  const { fn, context } = loadBadge(createSandbox());
  const article = makeArticle(context);
  fn({ article, badgesEl: null, row: savedRow(), local: { delivered: true, requestId: 'req_e22' }, diagnostics: { enabled: true, folderConnected: true } });
  const badge = article.querySelector('.wbBadge--archive-status');
  assert.ok(badge, 'badge should be rendered');
  assert.equal(badge.getAttribute('data-h2o-archive-status'), 'waiting-for-desktop');
  assert.match(String(badge.className), /wbBadge\b/);
  assert.ok(String(badge.textContent).length > 0, 'badge has label text');
});

check('saved + snapshot-backed + isLinked:true renders a status badge', () => {
  const { fn, context } = loadBadge(createSandbox());
  const article = makeArticle(context);
  fn({ article, badgesEl: null, row: savedRow({ isLinked: true }), local: { delivered: true, requestId: 'r' }, diagnostics: { enabled: true, folderConnected: true } });
  const badge = article.querySelector('.wbBadge--archive-status');
  assert.ok(badge, 'linked saved row should still render a status');
  assert.equal(badge.getAttribute('data-h2o-archive-status'), 'waiting-for-desktop');
});

check('true link-only row renders no archived badge', () => {
  const { fn, context } = loadBadge(createSandbox());
  const article = makeArticle(context);
  fn({ article, badgesEl: null, row: { chatId: 'c', isSaved: false, isLinked: true, displayView: 'link', badgeKind: 'Link' }, local: { delivered: true, requestId: 'r' }, diagnostics: { enabled: true, folderConnected: true } });
  assert.equal(article.querySelector('.wbBadge--archive-status'), null, 'link-only row must not show an archive badge');
});

check('missing-snapshot saved row shows needs-desktop-snapshot, not archived', () => {
  const { fn, context } = loadBadge(createSandbox());
  const article = makeArticle(context);
  fn({ article, badgesEl: null, row: savedRow({ snapshotId: '', lastSnapshotId: '', latestSnapshotId: '' }), local: {}, diagnostics: { enabled: true, folderConnected: true } });
  const badge = article.querySelector('.wbBadge--archive-status');
  assert.ok(badge, 'missing-snapshot saved row renders a status');
  assert.equal(badge.getAttribute('data-h2o-archive-status'), 'needs-desktop-snapshot');
});

check('archive-off (flag off, nothing delivered) renders no badge (quiet default)', () => {
  const { fn, context } = loadBadge(createSandbox());
  const article = makeArticle(context);
  fn({ article, badgesEl: null, row: savedRow(), local: {}, diagnostics: { enabled: false, folderConnected: true } });
  assert.equal(article.querySelector('.wbBadge--archive-status'), null, 'quiet default: no badge when archive is off and nothing delivered');
});

check('re-render is idempotent (no duplicate archive badge)', () => {
  const { fn, context } = loadBadge(createSandbox());
  const article = makeArticle(context);
  const opts = { article, badgesEl: null, row: savedRow(), local: { delivered: true, requestId: 'r' }, diagnostics: { enabled: true, folderConnected: true } };
  fn(opts); fn(opts);
  const container = article.querySelector('.wbBadges');
  const count = container ? container.children.filter((c) => String(c.className).includes('wbBadge--archive-status')).length : 0;
  assert.equal(count, 1, 'must not duplicate the archive badge on re-render');
});

if (FAIL.length) {
  console.error(`[saved-chat-archive-status-badge-v1] FAIL ${FAIL.length} checks failed`);
  process.exit(1);
}
console.log(`[saved-chat-archive-status-badge-v1] PASS ${PASS.length} checks`);
