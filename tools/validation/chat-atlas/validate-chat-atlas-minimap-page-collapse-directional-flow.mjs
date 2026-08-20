#!/usr/bin/env node
// Chat <-> MiniMap page-collapse directional flow (Option A ordered propagation).
//
// CONTRACTS (MECHANISMS_RULES.md sec.9 + sec.9A, Chrome surface only)
//   Chat -> MiniMap propagation is allowed and required.
//   MiniMap -> Chat propagation is FORBIDDEN.
//   A later MiniMap-local action persists until a newer meaningful Chat action.
//   A refresh/rebind/remount must NOT re-assert Chat state merely because Chat
//   still holds a value; only a NEWER Chat action may override MiniMap-local.
//   A Chat action taken while MiniMap Core is unavailable must be recoverable.
//
// EXPECTED STATE AT THIS CHECKPOINT
//   Contracts 1-6 and 11 describe behavior the current runtime already has and
//   are expected GREEN. Contracts 7-10, 14 and 15 describe Option A ordering,
//   unavailable-MiniMap recovery and versioned legacy migration, none of which
//   is implemented yet, and are expected RED. That partition is the checkpoint.
//
// WHAT IS REAL AND WHAT IS HARNESS -- stated plainly so this is not overclaimed:
//   REAL, extracted and executed from 1A1b: keyCollapsedPages,
//   normalizeMiniMapCollapsedPages, readCollapsedMiniMapPages,
//   saveCollapsedMiniMapPages, normalizeMiniMapCollapseArgs,
//   setMiniMapPageCollapsed, toggleMiniMapPageCollapsed, isMiniMapPageCollapsed,
//   getMiniMapCollapsedPages, applyMiniMapPageCollapsedState,
//   setChatPageCollapsed, toggleChatPageCollapsed.
//   HARNESS: storage (a localStorage stub with real JSON semantics), the MiniMap
//   DOM primitives beneath applyMiniMapPageCollapsedState, perf counters, and
//   callChatPagesCtl -- which is instrumented so any MiniMap-origin Chat write is
//   counted at the real boundary rather than inferred.
//   The Chat side is NOT extracted: 1C1b's push is driven with the exact call
//   shape its own source uses, and the Chat-side structure is pinned by
//   source-anchored assertions against real 1C1b text. This is deliberate --
//   extracting applyPageCollapsedVisuals would require faking sections, hosts,
//   detach/restore and pagination, none of which this contract governs.
//
// This validator is intentionally RED at the specification checkpoint and is NOT
// registered in any mandatory repository-wide gate.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MM_PATH = 'src-runtime-base/1A1b.🟥🗺️ MiniMap Core 🧱🗺️.js';
const CHAT_PATH = 'src-runtime-base/1C1b.🔴📑 Thread Pages Controller 📑.js';
const STUDIO_PATH = 'src-surfaces-base/studio/S1A1b. 🎬 MiniMap Core - Studio.js';

const readSrc = (rel) => {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) throw new Error(`TEST_HARNESS_BLOCKED:source-missing:${rel}`);
  return fs.readFileSync(abs, 'utf8');
};
const MM_SRC = readSrc(MM_PATH);
const CHAT_SRC = readSrc(CHAT_PATH);
const STUDIO_SRC = readSrc(STUDIO_PATH);

// ── result buckets ────────────────────────────────────────────────────────
const contracts = [];
const negatives = [];
const harness = [];
let assertions = 0;
const eq = (a, b, m) => { assertions += 1; assert.deepEqual(a, b, m); };
const ok = (v, m) => { assertions += 1; assert.ok(v, m); };
const contract = (id, expect, run) => {
  try { run(); contracts.push({ id, expect, ok: true }); }
  catch (e) { contracts.push({ id, expect, ok: false, error: String(e?.message || e).split('\n')[0] }); }
};
const negative = (id, run) => {
  try { run(); negatives.push({ id, ok: true }); }
  catch (e) { negatives.push({ id, ok: false, error: String(e?.message || e).split('\n')[0] }); }
};
const integrity = (id, run) => {
  try { run(); harness.push({ id, ok: true }); }
  catch (e) { harness.push({ id, ok: false, error: String(e?.message || e).split('\n')[0] }); }
};

// ── real-source extraction (fails closed) ─────────────────────────────────
function extractFunction(src, name, label) {
  const anchors = [`\n  function ${name}(`, `\nfunction ${name}(`];
  let start = -1, hits = 0;
  for (const a of anchors) {
    let i = src.indexOf(a);
    while (i >= 0) { hits += 1; if (start < 0) start = i + 1; i = src.indexOf(a, i + a.length); }
  }
  if (hits !== 1) throw new Error(`TEST_HARNESS_BLOCKED:anchor:${label}:${name}:${hits}`);
  const bodyStart = src.indexOf('{', src.indexOf(')', start));
  let d = 0, q = '', esc = false, lc = false, bc = false;
  for (let i = bodyStart; i < src.length; i += 1) {
    const c = src[i], n = src[i + 1];
    if (lc) { if (c === '\n') lc = false; continue; }
    if (bc) { if (c === '*' && n === '/') { bc = false; i += 1; } continue; }
    if (q) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === q) q = ''; continue; }
    if (c === '/' && n === '/') { lc = true; i += 1; continue; }
    if (c === '/' && n === '*') { bc = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') d += 1;
    else if (c === '}' && --d === 0) return src.slice(start, i + 1);
  }
  throw new Error(`TEST_HARNESS_BLOCKED:boundary:${label}:${name}`);
}

function extractStatement(src, anchor, end, label) {
  const i = src.indexOf(anchor);
  if (i < 0 || src.indexOf(anchor, i + anchor.length) >= 0) {
    throw new Error(`TEST_HARNESS_BLOCKED:statement:${label}`);
  }
  const j = src.indexOf(end, i);
  if (j < 0) throw new Error(`TEST_HARNESS_BLOCKED:statement-end:${label}`);
  return src.slice(i, j + end.length);
}

const MM_CONSTS = [
  extractStatement(MM_SRC, '  const KEY_COLLAPSED_PAGES_SUFFIX = ', ';', 'collapsed-pages-suffix'),
];

const MM_FUNCS = [
  'safeChatKeyPart', 'nsDisk',
  'keyCollapsedPages', 'normalizeMiniMapCollapsedPages', 'readCollapsedMiniMapPages',
  'saveCollapsedMiniMapPages', 'normalizeMiniMapCollapseArgs', 'setMiniMapPageCollapsed',
  'toggleMiniMapPageCollapsed', 'isMiniMapPageCollapsed', 'getMiniMapCollapsedPages',
  'applyMiniMapPageCollapsedState', 'setChatPageCollapsed', 'toggleChatPageCollapsed',
  'keyMiniMapPageState', 'normalizeMiniMapPageState', 'readMiniMapPageState',
  'writeMiniMapPageState', 'stampMiniMapPageOrder', 'miniMapPageOrderFor',
  'reconcileOnMiniMapReady',
];
const REAL_PROGRAM = [...MM_CONSTS, ...MM_FUNCS.map((n) => extractFunction(MM_SRC, n, '1A1b'))].join('\n\n');

// The Chat revision under test is produced by the REAL 1C1b owner. The harness
// never decides what a revision is, so the action-vs-re-assert distinction the
// contracts rely on is the product's own rule, not a restatement of it.
const CHAT_CONSTS = [
  extractStatement(CHAT_SRC, '  const CHAT_REV_REASSERT_SOURCES = new Set([', ']);', 'chat-rev-reassert-sources'),
];
const CHAT_FUNCS = [
  'safeChatKeyPart', 'nsDisk', 'keyChatPageRevs', 'readChatPageRevs',
  'writeChatPageRevs', 'isChatRevReassertSource', 'chatPageRevFor',
];
const CHAT_PROGRAM = [...CHAT_CONSTS, ...CHAT_FUNCS.map((n) => extractFunction(CHAT_SRC, n, '1C1b'))].join('\n\n');
if (!/revs\[key\] = \{ r: Math\.max\(0, Number\(prev\.r \|\| 0\) \|\| 0\) \+ 1/.test(CHAT_PROGRAM)) {
  throw new Error('TEST_HARNESS_BLOCKED:path-missing:chat-revision-advance');
}

// The contract path must survive extraction, or the gate is vacuous.
for (const [needle, why] of [
  ['saveCollapsedMiniMapPages(id, Array.from(set))', 'minimap-store-write'],
  ['applyMiniMapPageCollapsedState(num, nextCollapsed', 'minimap-dom-apply'],
]) {
  if (!REAL_PROGRAM.includes(needle)) throw new Error(`TEST_HARNESS_BLOCKED:path-missing:${why}`);
}
// Whitespace-insensitive: the Chat-writer delegation must survive extraction.
if (!/callChatPagesCtl\(\s*'setPageCollapsed'/.test(REAL_PROGRAM)) {
  throw new Error('TEST_HARNESS_BLOCKED:path-missing:chat-writer-shape');
}

// ── scene: instrumented mini-DOM + localStorage stub ──────────────────────
// `carry` reboots the modules against ALREADY-PERSISTED stores: fresh caches,
// fresh DOM, same localStorage. That is what a reload or a route rebind looks
// like to both owners, and it is the only way the reload contract below can be
// distinguished from a same-session refresh.
function buildScene(seedStorage = {}, carry = null) {
  const store = carry?.store || new Map(Object.entries(seedStorage));
  const m = {
    chatWrites: [],            // any MiniMap-origin call into a Chat writer
    miniTransitions: [],       // effective MiniMap DOM state changes
    domApplies: [],            // every applyMiniMapPageCollapsedState invocation
    storageWrites: [],
  };
  const wrapState = new Map(); // pageNum -> collapsed
  const scene = {
    m, store,
    keys: () => [...store.keys()],
    get: (k) => store.get(k),
  };
  const sandbox = {
    console, JSON, Math, Number, String, Array, Object, Set, Map, Boolean, Error,
    S: { collapsedMiniMapPagesByChat: new Map(), miniMapPageStateByChat: new Map() },
    PERF: { paths: {}, incrementalRefresh: {} },
    resolveChatId: () => 'chat-main',
    // nsDisk and safeChatKeyPart are REAL; getRegs is the only stub, and it
    // returns no shell so the real nsDisk takes its own documented fallback.
    getRegs: () => ({ SH: null }),
    storageGetJSON: (k, fb) => { if (!store.has(k)) return fb; try { return JSON.parse(store.get(k)); } catch { return fb; } },
    storageSetJSON: (k, v) => { store.set(k, JSON.stringify(v)); m.storageWrites.push(k); return true; },
    minimapCol: () => ({ __track: true }),
    ensureCol: () => ({ __track: true }),
    qq: (_sel, _root) => [{ __wrap: true }],
    getMiniMapPageDivider: () => ({ __divider: true }),
    setMiniMapPageWrapDomState: () => {},
    setMiniMapPageDividerDomState: () => {},
    noteRenderUnit: () => {},
    enterPerfOwner: () => false,
    perfNow: () => 0,
    recordDuration: () => {},
    noteSummaryBucket: () => {},
    renderMiniDividerOverlay: () => {},
    // Real external boundary for the forbidden direction.
    callChatPagesCtl: (method, args) => { m.chatWrites.push({ method, args }); return { ok: true, status: 'stub' }; },
  };
  // Count effective MiniMap DOM transitions at the real apply boundary.
  const realApplyHook = (pageNum, collapsed) => {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    m.domApplies.push({ pageNum: num, collapsed: !!collapsed });
    if (wrapState.get(num) !== !!collapsed) {
      wrapState.set(num, !!collapsed);
      m.miniTransitions.push({ pageNum: num, collapsed: !!collapsed });
    }
  };
  sandbox.setMiniMapPageWrapDomState = (_w, collapsed) => { realApplyHook(sandbox.__curPage, collapsed); };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(REAL_PROGRAM, ctx, { filename: 'minimap-directional.js' });
  // applyMiniMapPageCollapsedState is real; wrap only to carry pageNum to the hook.
  const realApply = ctx.applyMiniMapPageCollapsedState;
  ctx.applyMiniMapPageCollapsedState = function (pageNum, collapsed, col) {
    sandbox.__curPage = Math.max(1, Number(pageNum || 0) || 0);
    return realApply.call(this, pageNum, collapsed, col);
  };
  scene.ctx = ctx;
  scene.miniCollapsed = (n) => !!wrapState.get(Math.max(1, Number(n || 0) || 0));

  // 1C1b's revision store is its own private storage, kept in a separate map so
  // MiniMap key assertions stay unambiguous.
  const chatStore = carry?.chatStore || new Map();
  const chatTruth = carry?.chatTruth || new Map();
  const chatSandbox = {
    console, JSON, Math, Number, String, Array, Object, Set, Map, Boolean, Error,
    S: { chatPageRevsByChat: new Map() },
    MM_SH: () => null,
    resolveChatId: () => 'chat-main',
    isPageCollapsed: (n, id) => !!chatTruth.get(`${String(id || 'chat-main')}:${Math.max(1, Number(n || 0) || 0)}`),
    storageGetJSON: (k, fb) => { if (!chatStore.has(k)) return fb; try { return JSON.parse(chatStore.get(k)); } catch { return fb; } },
    storageSetJSON: (k, v) => { chatStore.set(k, JSON.stringify(v)); return true; },
  };
  chatSandbox.globalThis = chatSandbox;
  const chatCtx = vm.createContext(chatSandbox);
  vm.runInContext(CHAT_PROGRAM, chatCtx, { filename: 'chat-revision-owner.js' });
  scene.chatCtx = chatCtx;
  scene.reload = () => buildScene({}, { store, chatStore, chatTruth });
  scene.chatTruth = chatTruth;
  scene.chatStore = chatStore;
  return scene;
}

// The exact call shapes 1C1b uses, pinned to its real source.
const CHAT_PUSH_SHAPE = /setMiniMapPageCollapsed\?\.\(\s*num,\s*collapsed,\s*id,\s*\{\s*source:[^}]*'chat-sync'/;
// One push path for both helpers: only the source differs, exactly as in 1C1b.
// A re-assert leaves Chat's own truth alone, which is what makes it a re-assert.
function chatPush(s, page, collapsed, source, chatId = 'chat-main') {
  const num = Math.max(1, Number(page || 0) || 0);
  if (!s.chatCtx.isChatRevReassertSource(source)) s.chatTruth.set(`${chatId}:${num}`, !!collapsed);
  const chatRev = s.chatCtx.chatPageRevFor(num, chatId, { source });
  return s.ctx.setMiniMapPageCollapsed(num, collapsed, chatId,
    { source, mode: 'chat-sync', chatRev, propagate: true });
}
const chatAction = (s, page, collapsed, chatId = 'chat-main') =>
  chatPush(s, page, collapsed, 'chat-sync', chatId);

// A Chat action taken while MiniMap Core is unavailable: 1C1b's optional call
// makes no push at all, but Chat's own revision has already advanced.
const chatActionDropped = (s, page, collapsed, chatId = 'chat-main') => {
  const num = Math.max(1, Number(page || 0) || 0);
  s.chatTruth.set(`${chatId}:${num}`, !!collapsed);
  return s.chatCtx.chatPageRevFor(num, chatId, { source: 'chat-sync' });
};

// The exact snapshot 1C1b's shell-ready handler builds: current Chat value plus
// the revision READ through a re-assert source, so readiness never invents
// intent. Pinned to the real source below so drift cannot go unnoticed.
const readinessSnapshot = (s, pages, chatId = 'chat-main') => {
  const snap = {};
  for (const page of pages) {
    const num = Math.max(1, Number(page || 0) || 0);
    if (!num) continue;
    snap[String(num)] = {
      c: !!s.chatTruth.get(`${chatId}:${num}`),
      rev: s.chatCtx.chatPageRevFor(num, chatId, { source: 'chat-pages-controller:refresh' }),
    };
  }
  return snap;
};
const readinessReplay = (s, pages, chatId = 'chat-main') =>
  s.ctx.reconcileOnMiniMapReady(chatId, readinessSnapshot(s, pages, chatId), { source: 'minimap-ready' });

// Reinstates the removed refresh-time prune as an injected fault: delete the
// revision history of every page missing from a PARTIAL known-page union, which
// is what collectKnownPageNums returns during bind / route restoration.
function injectDestructivePrune(s, knownPageNums, chatId = 'chat-main') {
  const key = [...s.chatStore.keys()].find((k) => k.includes(':rev:') && k.includes(chatId));
  if (!key) return false;
  const revs = JSON.parse(s.chatStore.get(key));
  const known = new Set(knownPageNums.map((n) => String(n)));
  let changed = false;
  for (const k of Object.keys(revs)) { if (!known.has(k)) { delete revs[k]; changed = true; } }
  if (changed) s.chatStore.set(key, JSON.stringify(revs));
  return changed;
}
const chatRefresh = (s, page, collapsed, chatId = 'chat-main') =>
  chatPush(s, page, collapsed, 'chat-pages-controller:refresh', chatId);
const miniLocal = (s, page, chatId = 'chat-main') =>
  s.ctx.toggleMiniMapPageCollapsed(page, chatId, { source: 'core' });

// ══════════════════════════════════════════════════════════════════════════
// HARNESS INTEGRITY
// ══════════════════════════════════════════════════════════════════════════
integrity('real 1A1b functions extracted and executable', () => {
  const s = buildScene();
  for (const n of MM_FUNCS) ok(typeof s.ctx[n] === 'function', `${n} is a live function`);
  ok(REAL_PROGRAM.length > 3000, 'extracted program is substantial');
});
integrity('storage stub round-trips through the real store helpers', () => {
  const s = buildScene();
  chatAction(s, 2, true);
  ok(s.keys().some((k) => k.includes('chat-main')), 'a per-chat key was written');
  eq(s.ctx.isMiniMapPageCollapsed(2, 'chat-main'), true, 'real reader sees the real write');
});
integrity('1C1b push shape is present in real source', () => {
  ok(CHAT_PUSH_SHAPE.test(CHAT_SRC), "1C1b pushes setMiniMapPageCollapsed with source 'chat-sync'");
  ok(/chatRev/.test(CHAT_SRC), '1C1b carries an ordering revision on the push');
});
integrity('real 1C1b revision owner is extracted and executable', () => {
  const s = buildScene();
  for (const n of CHAT_FUNCS) ok(typeof s.chatCtx[n] === 'function', `${n} is a live function`);
  eq(s.chatCtx.isChatRevReassertSource('chat-pages-controller:refresh'), true, 'refresh is a re-assert');
  eq(s.chatCtx.isChatRevReassertSource('chat-sync'), false, 'a Chat push is not a re-assert');
  const r1 = s.chatCtx.chatPageRevFor(2, 'chat-main', { source: 'chat-sync' });
  const r2 = s.chatCtx.chatPageRevFor(2, 'chat-main', { source: 'chat-pages-controller:refresh' });
  const r3 = s.chatCtx.chatPageRevFor(2, 'chat-main', { source: 'chat-sync' });
  ok(r1 > 0 && r2 === r1 && r3 > r1, 'actions advance the revision, re-asserts do not');
});
integrity('1C1b binds a MiniMap-ready trigger for lost-push recovery', () => {
  ok(/evt:h2o:minimap:shell-ready/.test(CHAT_SRC), '1C1b binds the MiniMap readiness event');
  ok(/reconcileOnMiniMapReady/.test(CHAT_SRC), 'the readiness handler calls the recovery surface');
  // The handler must send ORDERED entries, not bare booleans, and must read the
  // revision through a re-assert source so readiness invents no Chat intent.
  ok(/c:\s*!!isPageCollapsed\(/.test(CHAT_SRC), 'readiness snapshot carries the Chat value');
  ok(/rev:\s*chatPageRevFor\([^)]*'chat-pages-controller:refresh'/.test(CHAT_SRC.replace(/\n\s*/g, ' ')),
    'readiness reads the revision through a re-assert source');
  ok(!/pruneChatPageRevs/.test(CHAT_SRC),
    'no refresh-time revision prune exists (it deleted history on a partial known-page union)');
  ok(/removeEventListener\(EV_MM_SHELL_READY/.test(CHAT_SRC), 'teardown unbinds what it installed');
  ok(/reconcileOnMiniMapReady,/.test(MM_SRC), '1A1b exports the recovery surface');
});
integrity('every Chat -> MiniMap push carries an ordering revision', () => {
  const pushes = CHAT_SRC.split('\n')
    .map((l, i) => ({ i: i + 1, l }))
    .filter((r) => /setMiniMapPageCollapsed\?\.\(/.test(r.l));
  ok(pushes.length >= 2, 'more than one Chat push site exists');
  // Ordering must be established inside the function that owns the push, so the
  // window is the enclosing function body rather than a fixed line count.
  const lines = CHAT_SRC.split('\n');
  for (const r of pushes) {
    let start = r.i - 1;
    while (start > 0 && !/^  function\s+\w+\s*\(/.test(lines[start])) start -= 1;
    const body = lines.slice(start, r.i + 8).join('\n');
    ok(/chatRev/.test(body), `push at line ${r.i} carries chatRev`);
    ok(/'chat-sync'/.test(body), `push at line ${r.i} declares chat-sync mode`);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// CONTRACTS
// ══════════════════════════════════════════════════════════════════════════
contract('1. Chat collapse propagates exactly once to MiniMap', 'PASS', () => {
  const s = buildScene();
  chatAction(s, 2, true);
  eq(s.miniCollapsed(2), true, 'MiniMap page 2 collapsed');
  eq(s.m.miniTransitions.length, 1, 'exactly one effective MiniMap transition');
  eq(s.m.chatWrites.length, 0, 'no Chat writer touched');
});

contract('2. Chat expansion propagates exactly once to MiniMap', 'PASS', () => {
  const s = buildScene();
  chatAction(s, 2, true);
  const before = s.m.miniTransitions.length;
  chatAction(s, 2, false);
  eq(s.miniCollapsed(2), false, 'MiniMap page 2 expanded');
  eq(s.m.miniTransitions.length - before, 1, 'exactly one further transition');
  eq(s.m.chatWrites.length, 0, 'no Chat writer touched');
});

contract('3. Direct MiniMap collapse writes no Chat state', 'PASS', () => {
  const s = buildScene();
  miniLocal(s, 3);
  eq(s.miniCollapsed(3), true, 'MiniMap collapsed locally');
  eq(s.m.chatWrites, [], 'zero Chat writer invocations');
});

contract('4. Direct MiniMap expansion writes no Chat state', 'PASS', () => {
  const s = buildScene();
  miniLocal(s, 3);
  miniLocal(s, 3);
  eq(s.miniCollapsed(3), false, 'MiniMap expanded locally');
  eq(s.m.chatWrites, [], 'zero Chat writer invocations');
});

contract('5. chatId and pageNum identity remain exact', 'PASS', () => {
  const s = buildScene();
  chatAction(s, 7, true, 'chat-alpha');
  chatAction(s, 7, true, 'chat-beta');
  eq(s.ctx.isMiniMapPageCollapsed(7, 'chat-alpha'), true, 'alpha page 7 collapsed');
  eq(s.ctx.isMiniMapPageCollapsed(7, 'chat-beta'), true, 'beta page 7 collapsed');
  eq(s.ctx.isMiniMapPageCollapsed(8, 'chat-alpha'), false, 'page 8 untouched');
  ok(s.keys().filter((k) => k.includes('chat-alpha')).length >= 1, 'alpha has its own key');
  ok(s.keys().filter((k) => k.includes('chat-beta')).length >= 1, 'beta has its own key');
});

contract('6. No bounce, recursion or amplification', 'PASS', () => {
  const s = buildScene();
  chatAction(s, 2, true);
  chatAction(s, 2, true);
  chatAction(s, 2, true);
  eq(s.m.miniTransitions.length, 1, 'repeated identical pushes cause one transition');
  eq(s.m.chatWrites, [], 'no reverse write, so no cycle can close');
});

contract('7. MiniMap-local state survives refresh when no newer Chat action', 'PASS', () => {
  const s = buildScene();
  chatAction(s, 2, true);                 // Chat collapses page 2
  miniLocal(s, 2);                        // user expands page 2 in MiniMap only
  eq(s.miniCollapsed(2), false, 'precondition: MiniMap-local expanded');
  chatRefresh(s, 2, true);                // refreshAll re-asserts Chat's value
  eq(s.miniCollapsed(2), false,
    'refresh must NOT re-assert Chat state over a newer MiniMap-local choice');
});

contract('8. A newer Chat action overrides via ordering, not unconditional refresh', 'PASS', () => {
  const a = buildScene();
  chatAction(a, 2, true); miniLocal(a, 2); chatRefresh(a, 2, true);
  const afterRefresh = a.miniCollapsed(2);
  const b = buildScene();
  chatAction(b, 2, true); miniLocal(b, 2); chatAction(b, 2, true);
  const afterAction = b.miniCollapsed(2);
  ok(afterRefresh !== afterAction,
    'refresh and a newer Chat action carrying the same value must be distinguishable (requires ordering state)');
});

contract('9. A Chat action dropped while MiniMap is unavailable is recovered on ready', 'PASS', () => {
  const s = buildScene();
  // MiniMap Core unavailable: 1C1b's optional call makes no push at all.
  const chatCollapsed = true;
  eq(s.miniCollapsed(4), false, 'precondition: MiniMap unaware');
  const readyReconcile = typeof s.ctx.reconcileOnMiniMapReady === 'function';
  ok(readyReconcile, 'a MiniMap-ready reconciliation entry point must exist');
  s.ctx.reconcileOnMiniMapReady('chat-main', { 4: chatCollapsed });
  eq(s.miniCollapsed(4), true, 'missed Chat collapse applied after readiness');
});

contract('10. Recovery handles both collapse and expansion', 'PASS', () => {
  const s = buildScene();
  chatAction(s, 5, true);
  const readyReconcile = typeof s.ctx.reconcileOnMiniMapReady === 'function';
  ok(readyReconcile, 'a MiniMap-ready reconciliation entry point must exist');
  s.ctx.reconcileOnMiniMapReady('chat-main', { 5: false });
  eq(s.miniCollapsed(5), false, 'missed Chat expansion applied after readiness');
});

contract('11. Reconciliation performs zero reverse Chat writes', 'PASS', () => {
  const s = buildScene();
  chatAction(s, 2, true); miniLocal(s, 2); chatRefresh(s, 2, true); chatRefresh(s, 2, false);
  eq(s.m.chatWrites, [], 'no reconciliation path invoked a Chat writer');
});

contract('14. Ordering metadata exists and governs reconciliation', 'PASS', () => {
  const s = buildScene();
  chatAction(s, 2, true);
  const key = s.keys().find((k) => k.includes('chat-main'));
  ok(key, 'a MiniMap state key exists');
  const raw = JSON.parse(s.get(key));
  ok(raw && !Array.isArray(raw) && Number(raw.v) >= 2,
    'MiniMap state must be a versioned object carrying ordering metadata, not a bare page array');
  const entry = raw?.pages?.['2'];
  ok(entry && typeof entry.ar === 'number', 'per-page appliedRev must be recorded');
});

contract('15. Legacy :v1 state migrates to :v2 PRESERVED_AS_LOCAL with appliedRev = 0', 'PASS', () => {
  const legacyKey = buildScene().ctx.keyCollapsedPages('chat-main');   // real key format
  ok(/:v1$/.test(legacyKey), 'the real key helper yields the legacy :v1 form');
  const s = buildScene({ [legacyKey]: JSON.stringify([2, 4]) });
  const set = s.ctx.getMiniMapCollapsedPages('chat-main');
  ok(set && (set.has ? set.has(2) : [...set].includes(2)), 'legacy local collapse preserved');
  const v2 = s.keys().find((k) => k.endsWith(':v2'));
  ok(v2, 'a :v2 versioned state must exist after migration');
  const raw = JSON.parse(s.get(v2));
  eq(raw?.pages?.['2']?.ar, 0, 'migrated legacy entries carry appliedRev = 0');
  eq(raw?.pages?.['2']?.c, true, 'migrated legacy entries preserve the collapsed value');
});

contract('16. Ordering history survives a reload whose known-page set is partial', 'PASS', () => {
  const s = buildScene();
  chatAction(s, 2, true);                 // rev 1 — Chat collapses page 2
  chatAction(s, 2, false);                // rev 2 — Chat expands page 2
  eq(s.ctx.miniMapPageOrderFor('chat-main', 2).ar, 2, 'MiniMap applied revision 2');

  // Reload: fresh caches and fresh DOM, same persisted storage.
  const r = s.reload();
  // Bind-time refresh with a PARTIAL known-page set — page 2 is absent because
  // the pagination ledger is empty and no divider exists yet.
  chatRefresh(r, 1, false);
  eq(r.chatCtx.chatPageRevFor(2, 'chat-main', { source: 'chat-pages-controller:refresh' }), 2,
    'rebind refresh neither advanced nor erased page 2 ordering history');

  const before = r.m.miniTransitions.length;
  const res = chatAction(r, 2, true);     // the user collapses page 2 again
  eq(res.status, 'ok', 'the newer Chat action applied, not rejected as stale');
  eq(r.ctx.isMiniMapPageCollapsed(2, 'chat-main'), true, 'MiniMap collapsed page 2');
  eq(r.m.miniTransitions.length - before, 1, 'exactly one effective MiniMap transition');
  eq(r.ctx.miniMapPageOrderFor('chat-main', 2).ar, 3, 'appliedRev advanced exactly once');
  eq(r.m.chatWrites, [], 'no reverse Chat write');
});

contract('17. Ordered readiness recovery restores a dropped Chat collapse', 'PASS', () => {
  const s = buildScene();
  const rev = chatActionDropped(s, 4, true);
  ok(rev >= 1, 'Chat advanced its revision even though the push was dropped');
  eq(s.miniCollapsed(4), false, 'precondition: MiniMap never saw the action');
  eq(readinessSnapshot(s, [4])['4'].rev, rev, 'readiness reads the existing revision without advancing it');

  readinessReplay(s, [4]);
  eq(s.miniCollapsed(4), true, 'dropped Chat collapse recovered after readiness');
  eq(s.ctx.miniMapPageOrderFor('chat-main', 4).ar, rev, 'appliedRev equals the Chat revision, not an invented one');

  const settled = s.m.miniTransitions.length;
  readinessReplay(s, [4]);
  readinessReplay(s, [4]);
  eq(s.m.miniTransitions.length, settled, 'duplicate readiness events are idempotent');
  eq(s.m.chatWrites, [], 'no reverse Chat write');
});

contract('18. Ordered readiness recovery restores a dropped Chat expansion', 'PASS', () => {
  const s = buildScene();
  chatAction(s, 5, true);                 // delivered normally
  eq(s.miniCollapsed(5), true, 'precondition: MiniMap collapsed');
  chatActionDropped(s, 5, false);         // expansion dropped while MiniMap was down
  eq(s.miniCollapsed(5), true, 'precondition: MiniMap still shows the stale collapse');
  readinessReplay(s, [5]);
  eq(s.miniCollapsed(5), false, 'dropped Chat expansion recovered after readiness');
  eq(s.m.chatWrites, [], 'no reverse Chat write');
});

contract('19. Readiness preserves MiniMap-local but yields to a newer Chat revision', 'PASS', () => {
  const s = buildScene();
  chatAction(s, 6, true);
  miniLocal(s, 6);                        // user expands page 6 in MiniMap only
  eq(s.miniCollapsed(6), false, 'precondition: MiniMap-local expanded');
  readinessReplay(s, [6]);
  eq(s.miniCollapsed(6), false, 'no newer Chat revision, so the local choice survives readiness');
  chatActionDropped(s, 6, true);          // genuinely newer Chat action, dropped
  readinessReplay(s, [6]);
  eq(s.miniCollapsed(6), true, 'the newer Chat revision overrides the local choice');
  eq(s.m.chatWrites, [], 'no reverse Chat write');
});

// ── forbidden reverse writer: BOTH surfaces, semantic not token-count ─────
function reverseWriterCallSites(src, label) {
  const defs = [];
  const calls = [];
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const L = lines[i];
    if (/^\s*function\s+(setChatPageCollapsed|toggleChatPageCollapsed)\s*\(/.test(L)) { defs.push(i + 1); continue; }
    if (/^\s*function\s+coreFallback_(setChatPageCollapsed|toggleChatPageCollapsed)\s*\(/.test(L)) { defs.push(i + 1); continue; }
    if (/^\s*(setChatPageCollapsed|toggleChatPageCollapsed)\s*,\s*$/.test(L)) continue;       // export entry
    if (/\b(setChatPageCollapsed|toggleChatPageCollapsed)\s*\(/.test(L)) {
      if (/^\s*(return\s+)?coreFallback_/.test(L)) continue;                                  // passive fallback
      calls.push({ line: i + 1, text: L.trim().slice(0, 100), label });
    }
  }
  return { defs, calls };
}
contract('CHROME forbidden reverse writer: zero MiniMap-origin call sites', 'PASS', () => {
  const r = reverseWriterCallSites(MM_SRC, '1A1b');
  ok(r.defs.length >= 2, 'definitions/compat surfaces exist (allowed)');
  eq(r.calls.map((c) => `${c.line}:${c.text}`), [], 'zero functional MiniMap-origin Chat writes');
});
contract('STUDIO forbidden reverse writer: zero MiniMap-origin call sites', 'PASS', () => {
  const r = reverseWriterCallSites(STUDIO_SRC, 'S1A1b');
  ok(r.defs.length >= 2, 'definitions/compat surfaces exist (allowed)');
  eq(r.calls.map((c) => `${c.line}:${c.text}`), [], 'zero functional MiniMap-origin Chat writes');
});

// ══════════════════════════════════════════════════════════════════════════
// NEGATIVE CONTROLS -- each must DETECT the injected fault.
// Faults targeting not-yet-implemented mechanisms report unsupported, not crash.
// ══════════════════════════════════════════════════════════════════════════
negative('NC1 injected MiniMap -> Chat reverse call is detected', () => {
  const s = buildScene();
  const real = s.ctx.setMiniMapPageCollapsed;
  s.ctx.setMiniMapPageCollapsed = function (p, c, id, o) {
    s.ctx.setChatPageCollapsed(p, c, id, 'core');       // the forbidden edge
    return real.call(this, p, c, id, o);
  };
  miniLocal(s, 2);
  ok(s.m.chatWrites.length > 0, 'reverse call reached the instrumented Chat boundary');
});

negative('NC2 removed positive Chat -> MiniMap push is detected', () => {
  const s = buildScene();
  s.ctx.setMiniMapPageCollapsed = () => ({ ok: false, status: 'suppressed' });
  chatAction(s, 2, true);
  eq(s.miniCollapsed(2), false, 'suppressed push produces no MiniMap transition (detectable)');
});

negative('NC3 missing ordering metadata is detected', () => {
  const s = buildScene();
  s.ctx.stampMiniMapPageOrder = () => true;          // fault: appliedRev is never recorded
  chatAction(s, 2, true);
  miniLocal(s, 2);
  chatRefresh(s, 2, true);
  eq(s.miniCollapsed(2), true,
    'with no appliedRev the refresh clobbers the MiniMap-local choice — contract 7 detects it');
});

negative('NC4 unconditional always-apply reconciliation is detected', () => {
  const s = buildScene();
  const real = s.ctx.setMiniMapPageCollapsed;
  // Fault: the ordered gate is bypassed, so every push applies unconditionally.
  s.ctx.setMiniMapPageCollapsed = function (p, c, id, o) {
    return real.call(this, p, c, id, Object.assign({}, o || {}, { mode: 'local' }));
  };
  chatAction(s, 2, true); miniLocal(s, 2); chatRefresh(s, 2, true);
  eq(s.miniCollapsed(2), true,
    'an always-apply refresh clobbers the MiniMap-local choice — contract 7 detects it');
});

negative('NC5 never-apply reconciliation is detected', () => {
  const s = buildScene();
  const real = s.ctx.setMiniMapPageCollapsed;
  s.ctx.setMiniMapPageCollapsed = function (p, c, id, o) {
    if (String(o?.source || '') !== 'core') return { ok: false, status: 'never-apply' };
    return real.call(this, p, c, id, o);
  };
  chatAction(s, 2, true);
  eq(s.miniCollapsed(2), false, 'never-apply suppresses Chat propagation (detectable)');
});

negative('NC6 readiness recovery that does nothing is detected', () => {
  const s = buildScene();
  ok(typeof s.ctx.reconcileOnMiniMapReady === 'function', 'entry point exists to be faulted');
  // Fault: readiness reports success but replays nothing.
  s.ctx.reconcileOnMiniMapReady = () => ({ ok: true, status: 'ok', applied: [], preserved: [] });
  s.ctx.reconcileOnMiniMapReady('chat-main', { 4: true });
  eq(s.miniCollapsed(4), false,
    'a no-op readiness path leaves the dropped Chat action unrecovered — contracts 9/10 detect it');
});

negative('NC8 destructive refresh-time revision prune is detected', () => {
  const s = buildScene();
  chatAction(s, 2, true);
  chatAction(s, 2, false);
  const r = s.reload();
  ok(injectDestructivePrune(r, [1, 3]), 'fault applied: page 2 ordering history deleted');
  const res = chatAction(r, 2, true);
  eq(res.status, 'stale-chat-revision',
    'the pruned revision restarts at 1 and loses to the persisted appliedRev');
  eq(r.ctx.isMiniMapPageCollapsed(2, 'chat-main'), false,
    'the newer Chat action is swallowed — contract 16 detects it');
});

negative('NC9 readiness recovery that ignores ordered entries is detected', () => {
  const s = buildScene();
  chatActionDropped(s, 4, true);
  const real = s.ctx.reconcileOnMiniMapReady;
  // Fault: only the bare-boolean compatibility lane is honoured, so the
  // production ordered { c, rev } snapshot recovers nothing.
  s.ctx.reconcileOnMiniMapReady = function (id, snap, o) {
    const bare = {};
    for (const k of Object.keys(snap || {})) if (typeof snap[k] !== 'object') bare[k] = snap[k];
    return real.call(this, id, bare, o);
  };
  readinessReplay(s, [4]);
  eq(s.miniCollapsed(4), false,
    'ordered entries dropped, so the dropped Chat action stays lost — contracts 17/18 detect it');
});

negative('NC7 destructive legacy migration is detected', () => {
  const legacyKey = buildScene().ctx.keyCollapsedPages('chat-main');
  const s = buildScene({ [legacyKey]: JSON.stringify([2, 4]) });
  s.ctx.normalizeMiniMapCollapsedPages = () => [];   // fault: migration reads nothing across
  eq(Array.from(s.ctx.getMiniMapCollapsedPages('chat-main')), [],
    'a migration that drops legacy local state loses it — contract 15 detects it');
});

// ══════════════════════════════════════════════════════════════════════════
// REPORT
// ══════════════════════════════════════════════════════════════════════════
const badHarness = harness.filter((h) => !h.ok);
const badNeg = negatives.filter((n) => !n.ok);
const failed = contracts.filter((c) => !c.ok);
const expectedRed = contracts.filter((c) => c.expect === 'RED');
const expectedPass = contracts.filter((c) => c.expect === 'PASS');
const redAsExpected = expectedRed.filter((c) => !c.ok);
const passAsExpected = expectedPass.filter((c) => c.ok);
const unexpected = [...expectedPass.filter((c) => !c.ok), ...expectedRed.filter((c) => c.ok)];

console.log('Chat <-> MiniMap page-collapse directional flow (Option A) — specification checkpoint');
console.log('');
console.log(`Modules under test: ${MM_PATH}`);
console.log(`                    ${CHAT_PATH} (source-anchored)`);
console.log(`                    ${STUDIO_PATH} (static reverse-writer only)`);
console.log('');
console.log('Harness integrity:');
for (const h of harness) console.log(`  ${h.ok ? 'OK  ' : 'FAIL'}  ${h.id}${h.ok ? '' : `\n        ${h.error}`}`);
console.log('');
console.log('Contracts:');
for (const c of contracts) {
  const state = c.ok ? 'GREEN' : 'RED  ';
  const tag = (c.expect === 'RED') === (!c.ok) ? 'as-expected' : '** UNEXPECTED **';
  console.log(`  ${state} [expect ${c.expect}] ${tag}  ${c.id}`);
  if (!c.ok) console.log(`         ${c.error}`);
}
console.log('');
console.log('Negative controls:');
for (const n of negatives) console.log(`  ${n.ok ? 'DETECTED   ' : 'NOT-DETECTED'}  ${n.id}${n.ok ? '' : `\n        ${n.error}`}`);
console.log('');
console.log(`Assertions: ${assertions}`);
console.log(`EXPECTED_PASS_GREEN: ${passAsExpected.length}/${expectedPass.length}`);
console.log(`EXPECTED_RED_RED:    ${redAsExpected.length}/${expectedRed.length}`);
console.log(`UNEXPECTED_RESULTS:  ${unexpected.length}`);
console.log(`NEGATIVE_CONTROLS:   ${negatives.length - badNeg.length}/${negatives.length}`);
console.log(`HARNESS_FAILURES:    ${badHarness.length}`);

if (badHarness.length) { console.log('RESULT: HARNESS FAILURE'); process.exit(2); }
if (badNeg.length) { console.log('RESULT: NEGATIVE CONTROL FAILURE'); process.exit(2); }
if (unexpected.length) { console.log('RESULT: UNEXPECTED PARTITION — architecture assumption may be wrong'); process.exit(2); }
if (failed.length) { console.log('RESULT: RED (expected until Option A ordered propagation is implemented)'); process.exit(1); }
console.log('RESULT: GREEN');
