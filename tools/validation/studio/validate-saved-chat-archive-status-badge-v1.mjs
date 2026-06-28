#!/usr/bin/env node
// Validator for Phase E.2.3 saved-chat archive status badge receipt check.
//
// Static checks keep the badge a gesture-only, read-only renderer (receipt
// read-back only; no delivery/Desktop writer/timer/watcher/content). VM checks
// prove thin rows hydrate once from LibraryIndex, and interactive badges read
// one receipt, stop row events, recompute through the status model, and update
// in place.

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
async function checkAsync(label, fn) {
  try { await fn(); PASS.push(label); console.log(`  PASS ${label}`); }
  catch (err) { const m = err && err.message ? err.message : String(err); FAIL.push({ label, message: m }); console.log(`  FAIL ${label}`); console.log(`       ${m}`); }
}
function stripComments(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/* ── Minimal fake DOM for VM render tests ─────────────────────────────── */
function makeFakeDocument() {
  function makeEl(tagName = 'div') {
    return {
      tagName: String(tagName).toUpperCase(),
      isConnected: false,
      className: '',
      children: [],
      _attrs: {},
      _listeners: {},
      textContent: '',
      appendChild(child) {
        child._parent = this;
        child.isConnected = this.isConnected === true;
        this.children.push(child);
        for (const grand of child.children || []) grand.isConnected = child.isConnected;
        return child;
      },
      setAttribute(k, v) { this._attrs[k] = String(v); },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
      removeAttribute(k) { delete this._attrs[k]; },
      addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); },
      async dispatchEvent(event) {
        const list = this._listeners[event.type] || [];
        for (const fn of list) await fn.call(this, event);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      },
      remove() {
        this.isConnected = false;
        for (const child of this.children || []) child.isConnected = false;
        if (this._parent) { const i = this._parent.children.indexOf(this); if (i >= 0) this._parent.children.splice(i, 1); }
      },
      querySelector(sel) { return findBySelector(this, sel); },
    };
  }
  function classList(el) { return String(el.className || '').split(/\s+/).filter(Boolean); }
  function matchesSelector(el, sel) {
    if (sel.charAt(0) === '.') return classList(el).includes(sel.slice(1));
    const articleAttr = sel.match(/^article\.([A-Za-z0-9_-]+)\[([^=]+)="([^"]*)"\]$/);
    if (articleAttr) {
      return el.tagName === 'ARTICLE'
        && classList(el).includes(articleAttr[1])
        && el.getAttribute(articleAttr[2]) === articleAttr[3];
    }
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
  const root = makeEl('body');
  root.isConnected = true;
  return {
    createElement(tagName) { return makeEl(tagName); },
    querySelector(sel) { return findBySelector(root, sel); },
    _makeEl: makeEl,
    _root: root,
  };
}

function createSandbox(options) {
  const cfg = typeof options === 'function' ? { readReceiptImpl: options } : (options || {});
  const fakeDoc = makeFakeDocument();
  const receiptCalls = [];
  const localMetaCalls = [];
  const libraryRows = Array.isArray(cfg.libraryRows) ? cfg.libraryRows : [];
  const context = {
    console, Date, JSON, Math, Number, Object, Array, Promise, RegExp, String, Map,
    document: fakeDoc,
    H2O: {},
  };
  context.H2O = { LibraryIndex: { getAll: () => libraryRows }, Studio: { ingestion: {
    // sync flag diagnose; default enabled true (overridden per test via diagnostics arg)
    diagnoseSavedChatArchiveOnSaveToFolderV1: () => ({ enabled: true }),
    getSavedChatArchiveLocalDeliveryMetaV1: async (row) => {
      localMetaCalls.push(row);
      if (typeof cfg.localMetaImpl === 'function') return cfg.localMetaImpl(row);
      return { delivered: false, requestId: null, deliveredAt: null };
    },
    readSavedChatArchiveRequestReceiptV1: async (opts) => {
      receiptCalls.push(opts);
      if (cfg.readReceiptImpl) return cfg.readReceiptImpl(opts);
      return { ok: true, status: 'queued-on-desktop', requestId: opts.requestId, receipt: { status: 'validated' } };
    },
  } } };
  context.__receiptCalls = receiptCalls;
  context.__localMetaCalls = localMetaCalls;
  context.globalThis = context; context.window = context;
  return vm.createContext(context);
}
function loadBadge(context) {
  vm.runInContext(readRepo(STATUS_REL), context, { filename: STATUS_REL });
  vm.runInContext(readRepo(BADGE_REL), context, { filename: BADGE_REL });
  const fn = context.H2O?.Studio?.ingestion?.appendSavedChatArchiveStatusBadgeV1;
  assert.equal(typeof fn, 'function', 'appendSavedChatArchiveStatusBadgeV1 not registered');
  assert.equal(typeof context.H2O?.Studio?.ingestion?.diagnoseSavedChatArchiveStatusBadgeV1, 'function', 'diagnoseSavedChatArchiveStatusBadgeV1 not registered');
  return { fn, context };
}
function makeArticle(context, attrs = {}) {
  const el = context.document._makeEl('article');
  el.className = 'wbHistoryRow';
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  context.document._root.appendChild(el);
  return el;
}
/* A renderRow()-style construction article: built with identifiers but NOT yet
 * attached to the document (isConnected stays false until attachArticle). */
function makeDetachedArticle(context, attrs = {}) {
  const el = context.document._makeEl('article');
  el.className = 'wbHistoryRow';
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}
function attachArticle(context, el) {
  context.document._root.appendChild(el);
  return el;
}
function savedRow(over = {}) {
  return { chatId: 'chat_e22', snapshotId: 'snap_e22', title: 'Saved chat', isSaved: true, displayView: 'saved', badgeKind: 'Saved', ...over };
}
async function flushAsync(turns = 8) {
  for (let i = 0; i < turns; i += 1) await Promise.resolve();
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
  assert.match(badgeSrc, /H2O\.Studio\.ingestion\.diagnoseSavedChatArchiveStatusBadgeV1\s*=/);
});

check('badge uses the status model and the local delivery accessor', () => {
  assert.ok(badgeSrc.includes('computeSavedChatArchiveStatusV1'), 'must use the status model');
  assert.ok(badgeSrc.includes('getSavedChatArchiveLocalDeliveryMetaV1'), 'must use the local delivery accessor');
  assert.ok(badgeSrc.includes('readSavedChatArchiveRequestReceiptV1'), 'must use the receipt read-back accessor');
  assert.ok(badgeSrc.includes('H2O.LibraryIndex'), 'must hydrate thin rows from LibraryIndex');
  assert.ok(badgeSrc.includes('data-chat-id'), 'must read article data-chat-id');
  assert.ok(badgeSrc.includes('data-snapshot-id'), 'must read article data-snapshot-id');
  assert.ok(badgeSrc.includes('hydrationAttempts'), 'diagnostic should report hydration attempts');
  assert.ok(badgeSrc.includes('hydrationResolved'), 'diagnostic should report resolved hydration');
  assert.ok(badgeSrc.includes('hydrationMisses'), 'diagnostic should report hydration misses');
  assert.ok(badgeSrc.includes('lastState'), 'diagnostic should report last status state');
  assert.ok(badgeSrc.includes('staleArticleRetargeted'), 'diagnostic should report stale retargets');
  assert.ok(badgeSrc.includes('staleArticleMisses'), 'diagnostic should report stale misses');
  assert.ok(badgeSrc.includes('connectedRendered'), 'diagnostic should report connected renders');
  assert.ok(badgeSrc.includes('lastArticleConnected'), 'diagnostic should report article connectivity');
  assert.ok(badgeSrc.includes('lastRetargeted'), 'diagnostic should report last retarget');
  assert.ok(badgeSrc.includes('preservedExisting'), 'diagnostic should report preserved badges');
  assert.ok(badgeSrc.includes('fullRowCacheHits'), 'diagnostic should report full-row cache hits');
  assert.ok(badgeSrc.includes('fullRowCacheWrites'), 'diagnostic should report full-row cache writes');
  assert.ok(badgeSrc.includes('skippedQuietThinPreserved'), 'diagnostic should report thin quiet preservation');
  assert.ok(badgeSrc.includes('removed'), 'diagnostic should report confident removals');
  // E.2.4 lifecycle fix: identifier-only match + detached construction targeting.
  assert.ok(badgeSrc.includes('articleIdsMatch'), 'must split identifier match from connected match');
  assert.ok(badgeSrc.includes('detachedConstructionRendered'), 'diagnostic should report detached construction renders');
  assert.ok(badgeSrc.includes('providedArticleRendered'), 'diagnostic should report provided-article renders');
  assert.ok(badgeSrc.includes('retargetedOnlyWhenMismatched'), 'diagnostic should report mismatch-only retargets');
});

check('badge uses wbBadge conventions, the archive-status class and data attribute', () => {
  assert.ok(badgeSrc.includes('wbBadge--archive-status'), 'must use the wbBadge--archive-status class');
  assert.match(badgeSrc, /wbBadge\b/, 'must reuse wbBadge base class');
  assert.ok(badgeSrc.includes('data-h2o-archive-status'), 'must set data-h2o-archive-status');
  assert.ok(badgeSrc.includes('appendChild'), 'must append into a badge container');
});

check('badge reads receipts only; it calls no delivery / Desktop writer / queue APIs', () => {
  for (const token of [
    'deliverSavedChatArchiveRequestV1',
    'refreshSavedChatArchiveRequestStatusV1',
    'enqueueSavedChatArchiveRequestV1',
    'materializeSavedChatArchiveRequestV1',
    'writeSavedChatPackageV1',
    'buildSavedChatPackageV1',
    'assetCas',
    'plugin:sql',
    'nativeMessaging',
  ]) {
    assert.equal(badgeCode.includes(token), false, `badge must not reference: ${token}`);
  }
  assert.doesNotMatch(badgeCode, /fetch\s*\(/, 'no network fetch');
  assert.doesNotMatch(badgeCode, /localhost|127\.0\.0\.1|WebDAV/i, 'no localhost/WebDAV');
});

check('badge has explicit click/keyboard receipt gesture and no timers/polling/watcher', () => {
  assert.match(badgeCode, /addEventListener\('click'/, 'click handler required for interactive badge');
  assert.match(badgeCode, /addEventListener\('keydown'/, 'keyboard handler required for interactive badge');
  assert.match(badgeCode, /key\s*===\s*'Enter'/, 'Enter must trigger check');
  assert.match(badgeCode, /key\s*===\s*' '/, 'Space must trigger check');
  assert.match(badgeCode, /preventDefault/, 'gesture must prevent row open/default behavior');
  assert.match(badgeCode, /stopPropagation/, 'gesture must stop row click propagation');
  assert.match(badgeCode, /aria-busy/, 'gesture should mark in-flight read-back');
  assert.match(badgeCode, /role['"],\s*['"]button/, 'interactive badge must use button role');
  assert.match(badgeCode, /tabindex['"],\s*['"]0/, 'interactive badge must be keyboard focusable');
  assert.doesNotMatch(badgeCode, /setInterval/, 'no setInterval');
  assert.doesNotMatch(badgeCode, /setTimeout/, 'no setTimeout');
  assert.doesNotMatch(badgeCode, /MutationObserver/, 'no MutationObserver');
  assert.doesNotMatch(badgeCode, /\bwatch(?:er)?\b/i, 'no watcher loop');
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

check('studio.js contains only the single archive status badge delegation hunk', () => {
  assert.ok(studioJs.includes('appendSavedChatArchiveStatusBadgeV1'), 'studio.js must delegate to the badge helper');
  const calls = [...studioJs.matchAll(/appendSavedChatArchiveStatusBadgeV1/g)].length;
  assert.equal(calls, 1, 'exactly one delegation reference in studio.js');
  // The staged studio.js diff (if any) must be only the delegation line.
  let staged = '';
  try { staged = execSync('git diff --cached -- "src-surfaces-base/studio/studio.js"', { cwd: REPO_ROOT }).toString(); }
  catch (_) { staged = ''; }
  const addedLines = staged.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
  for (const line of addedLines) {
    assert.ok(/appendSavedChatArchiveStatusBadgeV1|E\.2\.[23]: .*archive/.test(line), `unexpected staged studio.js line: ${line}`);
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

check('delivered saved row with requestId renders an interactive waiting-for-desktop badge', () => {
  const { fn, context } = loadBadge(createSandbox());
  const article = makeArticle(context);
  fn({ article, badgesEl: null, row: savedRow(), local: { delivered: true, requestId: 'req_e22' }, diagnostics: { enabled: true, folderConnected: true } });
  const badge = article.querySelector('.wbBadge--archive-status');
  assert.ok(badge, 'badge should be rendered');
  assert.equal(badge.getAttribute('data-h2o-archive-status'), 'waiting-for-desktop');
  assert.equal(badge.getAttribute('data-h2o-archive-request-id'), 'req_e22');
  assert.equal(badge.getAttribute('role'), 'button');
  assert.equal(badge.getAttribute('tabindex'), '0');
  assert.match(String(badge.getAttribute('aria-label')), /Check archive status/i);
  assert.match(String(badge.className), /wbBadge\b/);
  assert.ok(String(badge.textContent).length > 0, 'badge has label text');
});

await checkAsync('thin row plus article ids hydrates from LibraryIndex and renders archive-requested', async () => {
  const fullRow = savedRow({ chatId: 'chat_hydrate_1', snapshotId: 'snap_hydrate_1' });
  const { fn, context } = loadBadge(createSandbox({
    libraryRows: [fullRow],
    localMetaImpl: (row) => row.chatId === 'chat_hydrate_1'
      ? { delivered: true, requestId: null, deliveredAt: '2026-06-27T00:00:00.000Z' }
      : { delivered: false, requestId: null, deliveredAt: null },
  }));
  const article = makeArticle(context, { 'data-chat-id': 'chat_hydrate_1', 'data-snapshot-id': 'snap_hydrate_1' });
  fn({ article, badgesEl: null, row: {}, diagnostics: { enabled: true, folderConnected: true } });
  await flushAsync();
  const badge = article.querySelector('.wbBadge--archive-status');
  assert.ok(badge, 'hydrated thin row should render a badge');
  assert.equal(badge.getAttribute('data-h2o-archive-status'), 'archive-requested');
  assert.equal(badge.getAttribute('role'), null, 'legacy no-requestId hydration remains passive');
  assert.equal(context.__receiptCalls.length, 0, 'passive hydration must not read receipts');
  const diag = context.H2O.Studio.ingestion.diagnoseSavedChatArchiveStatusBadgeV1();
  assert.ok(diag.hydrationAttempts > 0, 'diagnostic should count hydration attempts');
  assert.ok(diag.hydrationResolved > 0, 'diagnostic should count resolved hydration');
  assert.ok(diag.rendered > 0, 'diagnostic should count rendered badges');
  assert.ok(diag.fullRowCacheWrites > 0, 'hydration should write full-row cache');
  assert.equal(diag.lastState, 'archive-requested');
  fn({ article, badgesEl: null, row: {}, diagnostics: { enabled: true, folderConnected: true } });
  await flushAsync();
  const afterCache = context.H2O.Studio.ingestion.diagnoseSavedChatArchiveStatusBadgeV1();
  assert.ok(afterCache.fullRowCacheHits > 0, 'later thin pass should use full-row cache');
  assert.equal(article.querySelector('.wbBadge--archive-status').getAttribute('data-h2o-archive-status'), 'archive-requested');
});

await checkAsync('later thin not-eligible pass preserves existing informative badge when no full-row cache exists', async () => {
  const { fn, context } = loadBadge(createSandbox({
    libraryRows: [],
    localMetaImpl: () => ({ delivered: false, requestId: null, deliveredAt: null }),
  }));
  const article = makeArticle(context, { 'data-chat-id': 'chat_preserve_1', 'data-snapshot-id': 'snap_preserve_1' });
  fn({
    article,
    badgesEl: null,
    row: savedRow({ chatId: 'chat_preserve_1', snapshotId: 'snap_preserve_1' }),
    local: { delivered: true, requestId: null, deliveredAt: '2026-06-28T00:00:00.000Z' },
    diagnostics: { enabled: true, folderConnected: true },
  });
  assert.equal(article.querySelector('.wbBadge--archive-status').getAttribute('data-h2o-archive-status'), 'archive-requested');
  fn({ article, badgesEl: null, row: {}, diagnostics: { enabled: true, folderConnected: true } });
  await flushAsync();
  const badge = article.querySelector('.wbBadge--archive-status');
  assert.ok(badge, 'thin quiet pass must not remove existing informative badge');
  assert.equal(badge.getAttribute('data-h2o-archive-status'), 'archive-requested');
  const diag = context.H2O.Studio.ingestion.diagnoseSavedChatArchiveStatusBadgeV1();
  assert.ok(diag.preservedExisting > 0, 'diagnostic should count preserved existing badge');
  assert.ok(diag.skippedQuietThinPreserved > 0, 'diagnostic should count thin quiet preserve');
  assert.equal(context.__receiptCalls.length, 0, 'passive preserve must not read receipts');
});

await checkAsync('confident full-row link-only evaluation can remove an existing archive badge', async () => {
  const { fn, context } = loadBadge(createSandbox());
  const article = makeArticle(context, { 'data-chat-id': 'chat_remove_1', 'data-snapshot-id': 'snap_remove_1' });
  fn({
    article,
    badgesEl: null,
    row: savedRow({ chatId: 'chat_remove_1', snapshotId: 'snap_remove_1' }),
    local: { delivered: true, requestId: null, deliveredAt: '2026-06-28T00:00:00.000Z' },
    diagnostics: { enabled: true, folderConnected: true },
  });
  assert.ok(article.querySelector('.wbBadge--archive-status'), 'setup badge should render');
  fn({
    article,
    badgesEl: null,
    row: { chatId: 'chat_remove_1', snapshotId: 'snap_remove_1', isSaved: false, isLinked: true, displayView: 'link', badgeKind: 'Link' },
    local: { delivered: true, requestId: null, deliveredAt: '2026-06-28T00:00:00.000Z' },
    diagnostics: { enabled: true, folderConnected: true },
  });
  await flushAsync();
  assert.equal(article.querySelector('.wbBadge--archive-status'), null, 'full link-only evaluation may remove saved archive badge');
  const diag = context.H2O.Studio.ingestion.diagnoseSavedChatArchiveStatusBadgeV1();
  assert.ok(diag.removed > 0, 'diagnostic should count confident removal');
});

await checkAsync('detached construction article hydrates and keeps the badge after the list attaches it', async () => {
  const fullRow = savedRow({ chatId: 'chat_ctor_1', snapshotId: 'snap_ctor_1' });
  const { fn, context } = loadBadge(createSandbox({
    libraryRows: [fullRow],
    localMetaImpl: () => ({ delivered: true, requestId: null, deliveredAt: '2026-06-28T00:00:00.000Z' }),
  }));
  const article = makeDetachedArticle(context, { 'data-chat-id': 'chat_ctor_1', 'data-snapshot-id': 'snap_ctor_1' });
  assert.equal(article.isConnected, false, 'construction article starts detached');
  fn({ article, badgesEl: null, row: {}, diagnostics: { enabled: true, folderConnected: true } });
  await flushAsync();
  assert.ok(article.querySelector('.wbBadge--archive-status'), 'badge must render into the detached construction article');
  // The row list attaches the construction article later; the badge survives.
  attachArticle(context, article);
  const connected = context.document.querySelector('article.wbHistoryRow[data-chat-id="chat_ctor_1"]');
  assert.ok(connected, 'attached article is findable in the document');
  const badge = connected.querySelector('.wbBadge--archive-status');
  assert.ok(badge, 'final connected article must contain the badge');
  assert.equal(badge.getAttribute('data-h2o-archive-status'), 'archive-requested');
  const diag = context.H2O.Studio.ingestion.diagnoseSavedChatArchiveStatusBadgeV1();
  assert.ok(diag.detachedConstructionRendered > 0, 'must count detached construction renders');
  assert.ok(diag.providedArticleRendered > 0, 'must count provided-article renders');
});

check('new detached construction row receives the badge, not only the old connected row', () => {
  const ids = { 'data-chat-id': 'chat_ctor_2', 'data-snapshot-id': 'snap_ctor_2' };
  const { fn, context } = loadBadge(createSandbox());
  const oldArticle = makeArticle(context, ids);
  fn({ article: oldArticle, badgesEl: null, row: savedRow({ chatId: 'chat_ctor_2', snapshotId: 'snap_ctor_2' }), local: { delivered: true, requestId: 'r2' }, diagnostics: { enabled: true, folderConnected: true } });
  assert.ok(oldArticle.querySelector('.wbBadge--archive-status'), 'old connected row renders its badge');
  // renderRow() builds a NEW detached construction article for the same row.
  const newArticle = makeDetachedArticle(context, ids);
  fn({ article: newArticle, badgesEl: null, row: savedRow({ chatId: 'chat_ctor_2', snapshotId: 'snap_ctor_2' }), local: { delivered: true, requestId: 'r2' }, diagnostics: { enabled: true, folderConnected: true } });
  assert.ok(newArticle.querySelector('.wbBadge--archive-status'), 'new construction article must receive the badge (not only the old row)');
  attachArticle(context, newArticle);
  assert.ok(newArticle.querySelector('.wbBadge--archive-status'), 'attached new article still has the badge');
  const diag = context.H2O.Studio.ingestion.diagnoseSavedChatArchiveStatusBadgeV1();
  assert.ok(diag.providedArticleRendered > 0, 'render must target the provided construction article');
  assert.ok(diag.detachedConstructionRendered > 0, 'new construction render is detached at render time');
});

check('retarget to a connected article happens only when the provided article identifiers mismatch', () => {
  const { fn, context } = loadBadge(createSandbox());
  const connectedA = makeArticle(context, { 'data-chat-id': 'chat_A', 'data-snapshot-id': 'snap_A' });
  // Provided article belongs to a DIFFERENT row → mismatch → must retarget.
  const mismatched = makeDetachedArticle(context, { 'data-chat-id': 'chat_B', 'data-snapshot-id': 'snap_B' });
  fn({ article: mismatched, badgesEl: null, row: savedRow({ chatId: 'chat_A', snapshotId: 'snap_A' }), local: { delivered: true, requestId: 'rA' }, diagnostics: { enabled: true, folderConnected: true } });
  assert.equal(mismatched.querySelector('.wbBadge--archive-status'), null, 'mismatched provided article must not be rendered into');
  assert.ok(connectedA.querySelector('.wbBadge--archive-status'), 'retarget renders into the matching connected article');
  const diag = context.H2O.Studio.ingestion.diagnoseSavedChatArchiveStatusBadgeV1();
  assert.ok(diag.staleArticleRetargeted > 0, 'retarget counter increments on mismatch');
  assert.ok(diag.retargetedOnlyWhenMismatched > 0, 'mismatch-only retarget counter increments');
});

check('mismatched provided article with no connected match records a stale miss and stays quiet', () => {
  const { fn, context } = loadBadge(createSandbox());
  const mismatched = makeDetachedArticle(context, { 'data-chat-id': 'chat_X', 'data-snapshot-id': 'snap_X' });
  fn({ article: mismatched, badgesEl: null, row: savedRow({ chatId: 'chat_Y', snapshotId: 'snap_Y' }), local: { delivered: true, requestId: 'rY' }, diagnostics: { enabled: true, folderConnected: true } });
  assert.equal(mismatched.querySelector('.wbBadge--archive-status'), null, 'no render into a mismatched article');
  assert.equal(context.document.querySelector('article.wbHistoryRow[data-chat-id="chat_Y"]'), null, 'no connected article exists for the row');
  const diag = context.H2O.Studio.ingestion.diagnoseSavedChatArchiveStatusBadgeV1();
  assert.ok(diag.staleArticleMisses > 0, 'stale miss recorded when provided article mismatches and no connected match exists');
  assert.equal(diag.lastArticleConnected, false);
});

await checkAsync('thin row hydration remains quiet when no full LibraryIndex row is found', async () => {
  const { fn, context } = loadBadge(createSandbox({
    libraryRows: [],
    localMetaImpl: () => ({ delivered: true, requestId: null, deliveredAt: '2026-06-27T00:00:00.000Z' }),
  }));
  const article = makeArticle(context, { 'data-chat-id': 'missing_chat', 'data-snapshot-id': 'missing_snap' });
  fn({ article, badgesEl: null, row: {}, diagnostics: { enabled: true, folderConnected: true } });
  await flushAsync();
  assert.equal(article.querySelector('.wbBadge--archive-status'), null, 'missing full row should stay quiet');
  assert.equal(context.__receiptCalls.length, 0, 'missing full row must not read receipts');
  const diag = context.H2O.Studio.ingestion.diagnoseSavedChatArchiveStatusBadgeV1();
  assert.ok(diag.hydrationAttempts > 0, 'miss path should attempt hydration');
  assert.ok(diag.hydrationMisses > 0, 'miss path should increment hydrationMisses');
});

await checkAsync('repeated thin-row hydration is idempotent and does not duplicate badges', async () => {
  const fullRow = savedRow({ chatId: 'chat_hydrate_dupe', snapshotId: 'snap_hydrate_dupe' });
  const { fn, context } = loadBadge(createSandbox({
    libraryRows: [fullRow],
    localMetaImpl: () => ({ delivered: true, requestId: null, deliveredAt: '2026-06-27T00:00:00.000Z' }),
  }));
  const article = makeArticle(context, { 'data-chat-id': 'chat_hydrate_dupe', 'data-snapshot-id': 'snap_hydrate_dupe' });
  const opts = { article, badgesEl: null, row: {}, diagnostics: { enabled: true, folderConnected: true } };
  fn(opts);
  fn(opts);
  await flushAsync();
  const container = article.querySelector('.wbBadges');
  const count = container ? container.children.filter((c) => String(c.className).includes('wbBadge--archive-status')).length : 0;
  assert.equal(count, 1, 'hydration must not create duplicate badges');
});

await checkAsync('explicit link-only article row remains quiet and does not hydrate into a saved badge', async () => {
  const fullRow = savedRow({ chatId: 'chat_link_only', snapshotId: 'snap_link_only' });
  const { fn, context } = loadBadge(createSandbox({
    libraryRows: [fullRow],
    localMetaImpl: () => ({ delivered: true, requestId: null, deliveredAt: '2026-06-27T00:00:00.000Z' }),
  }));
  const article = makeArticle(context, { 'data-chat-id': 'chat_link_only', 'data-snapshot-id': 'snap_link_only' });
  fn({
    article,
    badgesEl: null,
    row: { chatId: 'chat_link_only', snapshotId: 'snap_link_only', isSaved: false, isLinked: true, displayView: 'link', badgeKind: 'Link' },
    diagnostics: { enabled: true, folderConnected: true },
  });
  await flushAsync();
  assert.equal(article.querySelector('.wbBadge--archive-status'), null, 'link-only row must stay quiet');
  assert.equal(context.__receiptCalls.length, 0, 'link-only hydration must not read receipts');
});

await checkAsync('thin row hydrates saved + snapshot-backed + isLinked:true and keeps receipt gesture', async () => {
  const fullRow = savedRow({ chatId: 'chat_hydrate_linked', snapshotId: 'snap_hydrate_linked', isLinked: true });
  const { fn, context } = loadBadge(createSandbox({
    libraryRows: [fullRow],
    localMetaImpl: () => ({ delivered: true, requestId: 'req_hydrate_linked', deliveredAt: '2026-06-27T00:00:00.000Z' }),
  }));
  const article = makeArticle(context, { 'data-chat-id': 'chat_hydrate_linked', 'data-snapshot-id': 'snap_hydrate_linked' });
  fn({ article, badgesEl: null, row: {}, diagnostics: { enabled: true, folderConnected: true } });
  await flushAsync();
  const badge = article.querySelector('.wbBadge--archive-status');
  assert.ok(badge, 'hydrated saved-linked row should render');
  assert.equal(badge.getAttribute('data-h2o-archive-status'), 'waiting-for-desktop');
  assert.equal(badge.getAttribute('role'), 'button');
  assert.equal(context.__receiptCalls.length, 0, 'passive hydration should not read receipt before gesture');
});

await checkAsync('click reads receipt, stops row propagation, and updates only that badge to archived', async () => {
  const { fn, context } = loadBadge(createSandbox());
  const article = makeArticle(context);
  fn({ article, badgesEl: null, row: savedRow(), local: { delivered: true, requestId: 'req_click' }, diagnostics: { enabled: true, folderConnected: true } });
  const badge = article.querySelector('.wbBadge--archive-status');
  let prevented = false;
  let stopped = false;
  await badge.dispatchEvent({
    type: 'click',
    preventDefault() { prevented = true; },
    stopPropagation() { stopped = true; },
  });
  assert.equal(prevented, true, 'click should prevent default row behavior');
  assert.equal(stopped, true, 'click should stop row propagation');
  assert.equal(JSON.stringify(context.__receiptCalls), JSON.stringify([{ requestId: 'req_click' }]));
  assert.equal(badge.getAttribute('data-h2o-archive-status'), 'archived');
  assert.equal(article.querySelector('.wbBadge--archive-status'), badge, 'same badge node should be updated in place');
});

await checkAsync('Enter and Space keyboard paths read the same receipt and stop row propagation', async () => {
  const { fn, context } = loadBadge(createSandbox());
  const article = makeArticle(context);
  fn({ article, badgesEl: null, row: savedRow(), local: { delivered: true, requestId: 'req_key' }, diagnostics: { enabled: true, folderConnected: true } });
  const badge = article.querySelector('.wbBadge--archive-status');
  let stopped = 0;
  let prevented = 0;
  await badge.dispatchEvent({
    type: 'keydown',
    key: 'a',
    preventDefault() { prevented += 1; },
    stopPropagation() { stopped += 1; },
  });
  assert.equal(context.__receiptCalls.length, 0, 'non-activation key should not read receipt');
  await badge.dispatchEvent({
    type: 'keydown',
    key: 'Enter',
    preventDefault() { prevented += 1; },
    stopPropagation() { stopped += 1; },
  });
  await badge.dispatchEvent({
    type: 'keydown',
    key: ' ',
    preventDefault() { prevented += 1; },
    stopPropagation() { stopped += 1; },
  });
  assert.equal(JSON.stringify(context.__receiptCalls), JSON.stringify([{ requestId: 'req_key' }, { requestId: 'req_key' }]));
  assert.equal(stopped, 2);
  assert.equal(prevented, 2);
});

await checkAsync('receipt read-back errors render unknown-check-status without throwing', async () => {
  const { fn, context } = loadBadge(createSandbox(async () => { throw new Error('receipt unavailable'); }));
  const article = makeArticle(context);
  fn({ article, badgesEl: null, row: savedRow(), local: { delivered: true, requestId: 'req_error' }, diagnostics: { enabled: true, folderConnected: true } });
  const badge = article.querySelector('.wbBadge--archive-status');
  await badge.dispatchEvent({
    type: 'click',
    preventDefault() {},
    stopPropagation() {},
  });
  assert.equal(badge.getAttribute('data-h2o-archive-status'), 'unknown-check-status');
  assert.equal(context.__receiptCalls.length, 1);
});

check('legacy delivered entry with no requestId remains passive', () => {
  const { fn, context } = loadBadge(createSandbox());
  const article = makeArticle(context);
  fn({ article, badgesEl: null, row: savedRow(), local: { delivered: true, requestId: null }, diagnostics: { enabled: true, folderConnected: true } });
  const badge = article.querySelector('.wbBadge--archive-status');
  assert.ok(badge, 'legacy delivered row should still render conservative status');
  assert.equal(badge.getAttribute('data-h2o-archive-status'), 'archive-requested');
  assert.equal(badge.getAttribute('role'), null, 'legacy row must not be interactive');
  assert.equal(badge.getAttribute('tabindex'), null, 'legacy row must not be keyboard focusable');
});

check('saved + snapshot-backed + isLinked:true renders an interactive status badge when requestId exists', () => {
  const { fn, context } = loadBadge(createSandbox());
  const article = makeArticle(context);
  fn({ article, badgesEl: null, row: savedRow({ isLinked: true }), local: { delivered: true, requestId: 'r' }, diagnostics: { enabled: true, folderConnected: true } });
  const badge = article.querySelector('.wbBadge--archive-status');
  assert.ok(badge, 'linked saved row should still render a status');
  assert.equal(badge.getAttribute('data-h2o-archive-status'), 'waiting-for-desktop');
  assert.equal(badge.getAttribute('role'), 'button');
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
