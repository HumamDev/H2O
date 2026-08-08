#!/usr/bin/env node
// CV-3.31 — branch-transition Chat page-unit withdrawal (Stage 2C-2f).
//
// Live defect: switching from the coherent 39-turn branch to the 18-turn
// selected path replaced mounted content while this module's turn list, and
// therefore its page model, still described 39 turns. Page 2 stayed in-model,
// its divider was reused, and the anchor ladder fell through to stale
// sentinels that removeH2OChatPageUnitNode could never remove - so PAGE 2 was
// actively moved above Turn 17 until authority finally converged.
//
// Three proven source causes are covered here:
//   1. chatPageUnitIdentity hashed the CANONICAL fingerprint, which does not
//      change when a different path is selected through one canonical graph.
//   2. reconcileChatPageUnits had no branch-transition or coherence gate.
//   3. removeH2OChatPageUnitNode tested the boundary attribute against '1',
//      while sentinels store page-N-start / page-N-end.
//
// Every fixture below runs the real production bodies from 1A1b. The page
// model and the ordering enforcer are injected as instrumented doubles so the
// gate can be proven to run BEFORE any create/reuse/move/anchor work - that
// call count is the proof, not a pattern match. Placement mechanics
// themselves remain owned by CV-3.22 and CV-3.29.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CORE_PATH = 'src-runtime-base/1A1b.🟥🗺️ MiniMap Core 🧱🗺️.js';
const PAGE_PATH = 'src-runtime-base/1C1b.🔴📑 Thread Pages Controller 📑.js';
const TITLE_PATH = 'src-runtime-base/1C1a.🟥📛 Turn Title Bar 📛.js';
const SKIN_PATH = 'src-runtime-base/1A1e.🟥🗺️ MiniMap Skin 🖐🗺️.js';
// The chat page's structural implementation moved out of MiniMap Core into
// 0C3a Chat Page Structure Engine. This validator asserts on that
// implementation, so CORE_SOURCE is the MiniMap Core file plus the engine it
// now lives in. Nothing about what is asserted changes: positive checks and
// function extraction still find the code, and the negative checks below get
// strictly stronger, since the forbidden pattern must now be absent from both
// files rather than from MiniMap Core alone.
const STRUCTURE_PATH = 'src-runtime-base/0C3a.⬛️📐 Chat Page Structure Engine 📐.js';
const STRUCTURE_SOURCE = fs.readFileSync(path.join(ROOT, STRUCTURE_PATH), 'utf8');
const CORE_SOURCE = `${fs.readFileSync(path.join(ROOT, CORE_PATH), 'utf8')}\n${STRUCTURE_SOURCE}`;
const PAGE_SOURCE = fs.readFileSync(path.join(ROOT, PAGE_PATH), 'utf8');
const TITLE_SOURCE = fs.readFileSync(path.join(ROOT, TITLE_PATH), 'utf8');
const SKIN_SOURCE = fs.readFileSync(path.join(ROOT, SKIN_PATH), 'utf8');
const CORE0_PATH = 'src-runtime-base/0A1a.⬛️🧠 H2O Core 🧠.js';
const CORE0_SOURCE = fs.readFileSync(path.join(ROOT, CORE0_PATH), 'utf8');

const CHAT_ID = 'chat-branch-transition';
const ROUTE_KEY = '/c/chat-branch-transition';
const CANONICAL_FP = 'djb2:1yue4v7';   // one canonical graph, both branches
const FP_39 = 'djb2:2iocqu';           // effective fingerprint, 39-turn branch
const FP_18 = 'djb2:15jcf17';          // effective fingerprint, 18-turn branch

let assertions = 0;
const fixtures = [];
function ok(value, message) { assertions += 1; assert.ok(value, message); }
function equal(actual, expected, message) { assertions += 1; assert.equal(actual, expected, message); }
async function fixture(name, fn) {
  try { await fn(); fixtures.push({ name, ok: true }); console.log(`PASS ${name}`); }
  catch (error) { fixtures.push({ name, ok: false, error }); console.log(`FAIL ${name}`); }
}

function extractFunction(source, name) {
  const anchor = `  function ${name}(`;
  const start = source.indexOf(anchor);
  if (start < 0 || source.indexOf(anchor, start + anchor.length) >= 0) throw new Error(`function-anchor-invalid:${name}`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  let d = 0, q = '', esc = false, lc = false, bc = false;
  for (let i = bodyStart; i < source.length; i += 1) {
    const c = source[i], n = source[i + 1];
    if (lc) { if (c === '\n') lc = false; continue; }
    if (bc) { if (c === '*' && n === '/') { bc = false; i += 1; } continue; }
    if (q) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === q) q = ''; continue; }
    if (c === '/' && n === '/') { lc = true; i += 1; continue; }
    if (c === '/' && n === '*') { bc = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') d += 1;
    else if (c === '}' && --d === 0) return source.slice(start, i + 1);
  }
  throw new Error(`function-boundary-invalid:${name}`);
}

// ── DOM with real connection semantics ────────────────────────────────────
function parts(sel) { return String(sel || '').split(',').map((s) => s.trim()).filter(Boolean); }
function matchOne(node, sel) {
  const t = String(sel || '').trim();
  const tag = t.match(/^([a-zA-Z]+)/);
  if (tag && String(node.tagName).toUpperCase() !== tag[1].toUpperCase()) return false;
  for (const c of Array.from(t.matchAll(/\.([A-Za-z0-9_-]+)/g)).map((m) => m[1])) {
    if (!String(node.className || '').split(/\s+/).includes(c)) return false;
  }
  for (const m of t.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g)) {
    const name = m[1].trim();
    const actual = node.getAttribute(name);
    if (actual == null) return false;
    if (m[2] != null && String(actual) !== m[2]) return false;
  }
  return true;
}
class El {
  constructor(tag = 'DIV', className = '') {
    this.tagName = String(tag).toUpperCase(); this.nodeType = 1; this.className = className;
    this.children = []; this.parentElement = null; this.attrs = new Map(); this.isConnected = false;
    this.style = { _v: new Map(), setProperty(k, v) { this._v.set(k, v); }, removeProperty(k) { this._v.delete(k); }, getPropertyValue(k) { return this._v.get(k) || ''; } };
  }
  addEventListener() {} removeEventListener() {}
  get parentNode() { return this.parentElement; }
  setAttribute(n, v) { this.attrs.set(String(n), String(v)); }
  getAttribute(n) { return this.attrs.has(String(n)) ? this.attrs.get(String(n)) : null; }
  hasAttribute(n) { return this.attrs.has(String(n)); }
  removeAttribute(n) { this.attrs.delete(String(n)); }
  get classList() { const self = this; return { contains: (c) => String(self.className || '').split(/\s+/).includes(c), add: (c) => { if (!self.classList.contains(c)) self.className = `${self.className} ${c}`.trim(); }, remove: () => {} }; }
  _conn(v) { this.isConnected = v; for (const c of this.children) c._conn(v); }
  appendChild(c) { if (c.parentElement) c.parentElement.removeChild(c); c.parentElement = this; this.children.push(c); c._conn(this.isConnected); return c; }
  insertBefore(c, ref) { if (c.parentElement) c.parentElement.removeChild(c); c.parentElement = this; const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); c._conn(this.isConnected); return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentElement = null; c._conn(false); return c; }
  remove() { if (this.parentElement) this.parentElement.removeChild(this); }
  get nextSibling() { const p = this.parentElement; if (!p) return null; return p.children[p.children.indexOf(this) + 1] || null; }
  matches(sel) { return parts(sel).some((p) => matchOne(this, p)); }
  closest(sel) { let n = this; while (n) { if (n.matches(sel)) return n; n = n.parentElement; } return null; }
  querySelectorAll(sel) { const out = []; const w = (n) => { for (const c of n.children) { if (c.matches(sel)) out.push(c); w(c); } }; w(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  contains(o) { let n = o; while (n) { if (n === this) return true; n = n.parentElement; } return false; }
}

const OWNER = 'cgxui';
const BOUNDARY_ATTR = 'data-h2o-chat-page-boundary';

// options:
//   turns          — model turn count (drives model.count / pageCount)
//   effectiveCount — authoritative effective count (mismatch => incoherent)
//   effectiveFp    — authoritative effective fingerprint
//   transition     — projection transition flags
//   units          — which page units to pre-mount (default from turns)
function makeHarness(options = {}) {
  const turns = Number(options.turns ?? 39);
  const effectiveCount = Number(options.effectiveCount ?? turns);
  const effectiveFp = String(options.effectiveFp ?? (turns === 18 ? FP_18 : FP_39));
  const transition = Object.assign({
    trustedSelectionIntentActive: false,
    branchSelectionStale: false,
    branchExpansionPending: false,
    branchExpansionFailClosed: false,
    branchExpansionState: 'idle',
    branchExpansionReason: null,
    branchExpansionPriorCount: 0,
    branchExpansionTargetCount: 0,
    branchExpansionExpectedFingerprint: null,
    branchExpansionRequiredPageNums: [],
    selectedPathRequestLeaseActive: false,
    selectedPathConfirmationLeaseActive: false,
    selectedPathConfirmationPending: false,
  }, options.transition || {});

  const root = new El('MAIN', 'thread'); root.isConnected = true;
  const document = {
    documentElement: new El('HTML'),
    createElement: (tag) => new El(tag),
    querySelectorAll: (sel) => root.querySelectorAll(sel),
    querySelector: (sel) => root.querySelector(sel),
  };
  document.documentElement.isConnected = true;

  const S = { turnList: new Array(turns).fill(null).map((_, i) => ({ order: i + 1 })), chatPageUnitState: null };
  const W = { location: { pathname: ROUTE_KEY } };

  const enforceCalls = [];
  const sandbox = {
    document, S, W, console,
    UI_TOK: { OWNER },
    CHAT_PAGE_BOUNDARY_ATTR: BOUNDARY_ATTR,
    CHAT_PAGE_BOUNDARY_PAGE_ATTR: 'data-h2o-chat-page-boundary-page',
    CHAT_PAGE_BOUNDARY_KIND_ATTR: 'data-h2o-chat-page-boundary-kind',
    resolveChatId: () => CHAT_ID,
    // Authority doubles. Only these two feed the gate.
    callEffectiveTurnRuntime: (verb) => {
      if (verb === 'STATUS') {
        return {
          source: 'canonical', overlayActive: false, count: effectiveCount,
          canonicalFingerprint: CANONICAL_FP, anchorQId: null, pathLength: 0, generation: 7,
        };
      }
      if (verb === 'INDEX') {
        return { sourceFingerprint: effectiveFp, turns: new Array(effectiveCount).fill(null) };
      }
      return null;
    },
    getTurnRuntimeApi: () => ({
      getCompleteTurnIndexProjectionStatus: () => Object.assign({
        enabled: true, authoritative: true, status: 'authoritative', chatId: CHAT_ID,
        count: effectiveCount, source: 'complete-index', fingerprint: effectiveFp, routeGeneration: 7,
      }, transition),
    }),
    // Instrumented ordering enforcer: any call proves the gate did NOT hold.
    enforceChatPageUnitOrder: (model, candidatesByPage, reason) => {
      enforceCalls.push({ pageCount: model?.pageCount, reason });
      return { reason, identity: model?.identity, source: model?.source, count: model?.count, pageCount: model?.pageCount, created: 0, moved: 0, removed: 0, deferred: 0, hydrationRequests: 0, pages: [] };
    },
    getActualThreadPageDividers: () => root.querySelectorAll('.cgxui-chat-page-divider'),
    pageNumberOfThreadDivider: (d) => Number(d.getAttribute('data-page-num') || 0),
    compareChatPageNodes: () => 0,
    getChatPagesControllerApi: () => ({
      resolveNativePageHeadCoherence: () => Object.freeze({
        state: String(options.pageHeadState || 'match'),
      }),
    }),
    setChatPageUnitAttributeIfChanged: (node, name, value) => {
      if (!node || !name) return false;
      if (value == null) { if (!node.hasAttribute(name)) return false; node.removeAttribute(name); return true; }
      if (node.getAttribute(name) === String(value)) return false;
      node.setAttribute(name, String(value));
      return true;
    },
  };
  vm.createContext(sandbox);

  const names = [
    'getChatPageUnitState', 'chatPageUnitIdentity', 'getEffectivePresentationRuntimeStatus',
    'getCompleteIndexProjectionStatus', 'isOwnedChatPageBoundarySentinel', 'removeH2OChatPageUnitNode',
    'createChatPageBoundarySentinel', 'chatPageUnitBranchTransitionActive',
    'chatPageUnitPresentationCoherence', 'withdrawChatPageUnits', 'reconcileChatPageUnits',
  ];
  const src = names.map((n) => extractFunction(CORE_SOURCE, n)).join('\n')
    + `\nconst CHAT_PAGE_BOUNDARY_SENTINEL_VALUE = ${String(CORE_SOURCE.match(/const CHAT_PAGE_BOUNDARY_SENTINEL_VALUE = (.+);/)[1])};`
    + `\nfunction buildChatPageUnitModel(){
        const count = S.turnList.length;
        const pageCount = count > 0 ? Math.ceil(count / 25) : 0;
        const pages = [];
        for (let p = 1; p <= pageCount; p += 1) {
          pages.push({ pageNum: p, startOrder: ((p - 1) * 25) + 1, endOrder: Math.min(count, p * 25) });
        }
        return Object.freeze({ identity: chatPageUnitIdentity(), chatId: '${CHAT_ID}', source: 'canonical', count, pageCount, pages });
      }`
    + `\nglobalThis.__api = { ${names.join(', ')}, buildChatPageUnitModel };`;
  new vm.Script(src, { filename: CORE_PATH }).runInContext(sandbox);

  const api = sandbox.__api;

  // Mount the page units for the CURRENT model, exactly as production does.
  const mountUnits = (pageCount) => {
    const state = api.getChatPageUnitState();
    for (let p = 1; p <= pageCount; p += 1) {
      const divider = new El('DIV', 'cgxui-chat-page-divider');
      divider.setAttribute('data-page-num', String(p));
      divider.setAttribute('data-cgxui-owner', OWNER);
      root.appendChild(divider);
      state.pendingDividers.set(p, divider);
      for (const kind of ['start', 'end']) {
        const sentinel = api.createChatPageBoundarySentinel(p, kind);
        root.appendChild(sentinel);
        state.sentinels.set(`${p}:${kind}`, sentinel);
      }
    }
    state.identity = api.chatPageUnitIdentity();
  };

  return {
    api, root, document, S, sandbox, enforceCalls, mountUnits,
    dividers: () => root.querySelectorAll('.cgxui-chat-page-divider'),
    sentinels: () => root.querySelectorAll(`[${BOUNDARY_ATTR}]`),
    unit: (page, kind) => root.querySelectorAll(`[${BOUNDARY_ATTR}="page-${page}-${kind}"]`)[0] || null,
    divider: (page) => root.querySelectorAll(`.cgxui-chat-page-divider[data-page-num="${page}"]`)[0] || null,
    setTurns: (n) => { S.turnList = new Array(n).fill(null).map((_, i) => ({ order: i + 1 })); },
  };
}

function makeRebuildCounterHarness(options = {}) {
  const turnIds = new Array(18).fill(null).map((_, index) => `turn-${index + 1}`);
  const buttons = new Map(turnIds.map((turnId) => [turnId, {
    isConnected: true,
    active: false,
    dataset: { turnId, id: turnId },
  }]));
  const oldTurn25Id = 'turn-25';
  const S = {
    turnList: turnIds.map((turnId, index) => ({ turnId, answerId: `answer-${index + 1}`, index: index + 1 })),
    lastActiveTurnIdFast: options.cachedFast === undefined ? oldTurn25Id : String(options.cachedFast || ''),
    lastActiveBtnId: options.cachedBtn === undefined ? oldTurn25Id : String(options.cachedBtn || ''),
    lastActiveBtnEl: null,
  };
  const stats = {
    setActiveCalls: [],
    counterCalls: [],
    counterText: '25/39',
  };
  const updateCounter = (anyId = '') => {
    const id = String(anyId || '').trim();
    stats.counterCalls.push(id);
    const index = Math.max(1, turnIds.indexOf(id) + 1);
    stats.counterText = `${index}/18`;
    return true;
  };
  const setActive = (anyId, reason = '') => {
    const id = String(anyId || '').trim();
    stats.setActiveCalls.push({ id, reason: String(reason || '') });
    if (options.concurrentActiveId) {
      const concurrentId = String(options.concurrentActiveId);
      S.lastActiveTurnIdFast = concurrentId;
      S.lastActiveBtnId = concurrentId;
      const concurrent = buttons.get(concurrentId);
      if (concurrent) concurrent.active = true;
    }
    const btn = buttons.get(id) || null;
    if (!btn || options.forceSetActiveFailure === true) return false;
    for (const candidate of buttons.values()) candidate.active = false;
    btn.active = true;
    S.lastActiveTurnIdFast = id;
    S.lastActiveBtnId = id;
    updateCounter(id);
    return true;
  };
  const sandbox = {
    S,
    setActive,
    updateCounter,
    getBtnById: (id) => buttons.get(String(id || '').trim()) || null,
    findTurnByAnyId: (id) => {
      const key = String(id || '').trim();
      return S.turnList.find((turn) => turn.turnId === key || turn.answerId === key) || null;
    },
    q: () => Array.from(buttons.values()).find((button) => button.active) || null,
    computeActiveFromViewport: () => ({ activeTurnId: '', activeAnswerId: '' }),
  };
  vm.createContext(sandbox);
  const sources = options.sources || {};
  const functionSources = {
    clearMissingRebuildActiveIdentity: sources.clearMissingRebuildActiveIdentity
      || extractFunction(CORE_SOURCE, 'clearMissingRebuildActiveIdentity'),
    applyRebuildActiveId: sources.applyRebuildActiveId
      || extractFunction(CORE_SOURCE, 'applyRebuildActiveId'),
    resolveRebuildActiveId: sources.resolveRebuildActiveId
      || extractFunction(CORE_SOURCE, 'resolveRebuildActiveId'),
    finalizeRebuildUi: sources.finalizeRebuildUi
      || extractFunction(CORE_SOURCE, 'finalizeRebuildUi'),
  };
  new vm.Script(
    Object.values(functionSources).join('\n')
      + '\nglobalThis.__rebuildApi = { clearMissingRebuildActiveIdentity, applyRebuildActiveId, resolveRebuildActiveId, finalizeRebuildUi };',
    { filename: `${CORE_PATH}:rebuild-counter` },
  ).runInContext(sandbox);
  return {
    api: sandbox.__rebuildApi,
    S,
    stats,
    buttons,
    oldTurn25Id,
    listIds: turnIds,
    activeMarkerIds: () => Array.from(buttons.entries()).filter(([, button]) => button.active).map(([id]) => id),
  };
}

// ══════════════════════════════════════════════════════════════════════════
// A — the transition signal and its lifecycle (0A1a, source contract)
// ══════════════════════════════════════════════════════════════════════════

await fixture('1 trusted native branch selection publishes the transition synchronously', () => {
  const capture = extractFunction(CORE0_SOURCE, 'chatAtlasRecordTrustedNativeBranchSelection');
  // Both flags are set inside the capture body itself - no await, no timer -
  // so they are live before ChatGPT can replace the mounted branch content.
  const staleIndex = capture.indexOf('completeTurnIndexAuthorityState.branchSelectionStale = true;');
  const intentIndex = capture.indexOf('completeTurnIndexAuthorityState.trustedSelectedPathIntent = Object.freeze({');
  ok(staleIndex > 0, 'capture marks the branch selection stale');
  ok(intentIndex > 0, 'capture freezes the trusted intent');
  ok(!/\bawait\b/.test(capture.slice(0, Math.max(staleIndex, intentIndex))), 'no await precedes publication');
  ok(!/setTimeout\(/.test(capture.slice(0, Math.max(staleIndex, intentIndex))), 'no timer precedes publication');
  // Published through the existing complete-index status contract.
  ok(CORE0_SOURCE.includes('branchSelectionStale: completeTurnIndexAuthorityState.branchSelectionStale === true'), 'branchSelectionStale published');
  ok(CORE0_SOURCE.includes('trustedSelectionIntentActive: !!completeTurnIndexAuthorityState.trustedSelectedPathIntent'), 'trusted intent published');
});

await fixture('2 an untrusted or unrelated click publishes nothing', () => {
  const capture = extractFunction(CORE0_SOURCE, 'chatAtlasRecordTrustedNativeBranchSelection');
  const staleIndex = capture.indexOf('completeTurnIndexAuthorityState.branchSelectionStale = true;');
  const head = capture.slice(0, staleIndex);
  // A click with no branch direction, or outside the authoritative route, or
  // whose ownership does not resolve canonically, returns before publication.
  ok(head.includes('if (\n      !direction'), 'non-branch clicks return early');
  ok(head.includes('|| route.chatId !== completeTurnIndexAuthorityState.chatId'), 'foreign chat returns early');
  ok(head.includes('if (ownership.ok !== true) {'), 'unresolved ownership returns early');
  const ownershipReturn = head.indexOf('if (ownership.ok !== true) {');
  ok(head.slice(ownershipReturn).includes('return false;'), 'unresolved ownership returns false before publication');
});

await fixture('3 no second branch-selection authority is introduced', () => {
  // 1A1b only READS the Core's published fields; it never writes them.
  for (const field of ['branchSelectionStale', 'trustedSelectionIntentActive']) {
    ok(CORE_SOURCE.includes(field), `${field} is consumed`);
    ok(!new RegExp(`${field}\\s*=[^=]`).test(CORE_SOURCE), `${field} is never assigned in MiniMap Core`);
  }
  ok(!/completeTurnIndexAuthorityState/.test(CORE_SOURCE), 'MiniMap Core owns no complete-index authority state');
});

// ══════════════════════════════════════════════════════════════════════════
// B/C — authority pass-through and effective-presentation identity
// ══════════════════════════════════════════════════════════════════════════

await fixture('4 projection status preserves the transition fields', () => {
  const h = makeHarness({ transition: { branchSelectionStale: true } });
  const status = h.api.getCompleteIndexProjectionStatus();
  equal(status.branchSelectionStale, true, 'branchSelectionStale preserved');
  equal(status.trustedSelectionIntentActive, false, 'intent flag preserved');
  for (const f of ['selectedPathRequestLeaseActive', 'selectedPathConfirmationLeaseActive', 'selectedPathConfirmationPending']) {
    equal(status[f], false, `${f} preserved`);
  }
  // The pre-existing fields are untouched.
  equal(status.enabled, true, 'enabled retained');
  equal(status.authoritative, true, 'authoritative retained');
});

await fixture('5 effective fingerprint is exposed without a third fingerprint model', () => {
  const h = makeHarness({ turns: 39 });
  const status = h.api.getEffectivePresentationRuntimeStatus();
  equal(status.canonicalFingerprint, CANONICAL_FP, 'canonical fingerprint retained');
  equal(status.effectiveFingerprint, FP_39, 'effective fingerprint exposed');
  equal(status.effectiveCount, 39, 'effective count exposed');
  // It is read through the existing INDEX verb, the same source 1C1b uses.
  const fn = extractFunction(CORE_SOURCE, 'getEffectivePresentationRuntimeStatus');
  ok(fn.includes("callEffectiveTurnRuntime('INDEX')"), 'uses the existing INDEX verb');
  ok(fn.includes('index?.sourceFingerprint'), 'reads the authoritative sourceFingerprint');
  ok(PAGE_SOURCE.includes("String(index?.sourceFingerprint || '')"), 'same field the Pages Controller calls effectiveFingerprint');
});

await fixture('6 effective fingerprint change invalidates identity while canonical is unchanged', () => {
  const a = makeHarness({ turns: 39, effectiveFp: FP_39 });
  const b = makeHarness({ turns: 39, effectiveFp: FP_18 });
  const idA = a.api.chatPageUnitIdentity();
  const idB = b.api.chatPageUnitIdentity();
  ok(idA.includes(CANONICAL_FP) && idB.includes(CANONICAL_FP), 'canonical fingerprint unchanged in both');
  ok(idA.includes(FP_39) && idB.includes(FP_18), 'effective fingerprint present in both');
  ok(idA !== idB, 'identity changes on effective fingerprint change alone');
  // Existing components are preserved.
  for (const part of [CHAT_ID, ROUTE_KEY, 'canonical', '39', '7', '2']) {
    ok(idA.split('|').includes(part), `identity retains ${part}`);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// D — the gate, withdrawal and rebuild
// ══════════════════════════════════════════════════════════════════════════

await fixture('7 coherent 39-turn branch reconciles normally with two pages', () => {
  const h = makeHarness({ turns: 39 });
  h.mountUnits(2);
  equal(h.dividers().length, 2, 'Page 1 and Page 2 dividers mounted');
  equal(h.sentinels().length, 4, 'four sentinels mounted');
  const result = h.api.reconcileChatPageUnits('test');
  equal(result.withdrawn, undefined, 'no withdrawal on a coherent branch');
  equal(h.enforceCalls.length, 1, 'ordering enforcement runs');
  equal(h.enforceCalls[0].pageCount, 2, 'enforced with two pages');
  equal(h.dividers().length, 2, 'both dividers survive');
});

await fixture('8 switching 39 to 18 withdraws every H2O page unit', () => {
  const h = makeHarness({ turns: 39 });
  h.mountUnits(2);
  const staleDivider = h.divider(2);
  const staleStart = h.unit(2, 'start');
  const staleEnd = h.unit(2, 'end');
  ok(staleDivider && staleStart && staleEnd, 'stale Page 2 units exist before the switch');
  // Trusted branch selection fires; mounted content is changing but the model
  // still describes 39 turns.
  h.sandbox.getTurnRuntimeApi = () => ({ getCompleteTurnIndexProjectionStatus: () => ({ enabled: true, authoritative: true, branchSelectionStale: true, trustedSelectionIntentActive: true }) });
  const result = h.api.reconcileChatPageUnits('branch-switch');
  equal(result.status, 'branch-transition-withdrawn', 'explicit fail-closed status');
  equal(result.withdrawn, true, 'withdrawal reported');
  equal(result.branchTransition, true, 'transition recorded');
  equal(h.enforceCalls.length, 0, 'nothing created, moved or anchored');
  equal(h.dividers().length, 0, 'no divider remains connected');
  equal(h.sentinels().length, 0, 'no sentinel remains connected');
  equal(staleDivider.isConnected, false, 'stale Page 2 divider disconnected');
  equal(staleStart.isConnected, false, 'stale page-2-start disconnected');
  equal(staleEnd.isConnected, false, 'stale page-2-end disconnected');
  equal(result.created, 0, 'created zero');
  equal(result.moved, 0, 'moved zero');
});

await fixture('9 withdrawal clears pending references so nothing can be reused', () => {
  const h = makeHarness({ turns: 39, transition: { branchSelectionStale: true } });
  h.mountUnits(2);
  const state = h.api.getChatPageUnitState();
  equal(state.pendingDividers.size, 2, 'pending dividers held before withdrawal');
  h.api.reconcileChatPageUnits('branch-switch');
  equal(state.pendingDividers.size, 0, 'pending divider references cleared');
  equal(state.sentinels.size, 0, 'sentinel references cleared');
  equal(state.hydrationRequested.size, 0, 'hydration requests cleared');
  equal(state.identity, '', 'stale identity dropped');
  equal(state.last, null, 'withdrawal never stands in as a settled layout');
});

await fixture('10 a stale Page 2 unit cannot be reused, recreated or anchored during the gate', () => {
  const h = makeHarness({ turns: 39, transition: { trustedSelectionIntentActive: true } });
  h.mountUnits(2);
  h.api.reconcileChatPageUnits('branch-switch');
  // Repeated passes during the same transition stay inert and idempotent.
  for (let i = 0; i < 3; i += 1) {
    const again = h.api.reconcileChatPageUnits(`branch-switch-${i}`);
    equal(again.status, 'branch-transition-withdrawn', `pass ${i} stays withdrawn`);
    equal(again.removed, 0, `pass ${i} removes nothing further (idempotent)`);
  }
  equal(h.enforceCalls.length, 0, 'no anchor rung was ever consulted');
  equal(h.dividers().length, 0, 'no divider recreated');
  equal(h.sentinels().length, 0, 'no sentinel recreated');
});

await fixture('11 no clickable stale control and no CSS-only hiding', () => {
  const h = makeHarness({ turns: 39, transition: { branchSelectionStale: true } });
  h.mountUnits(2);
  const staleDivider = h.divider(2);
  h.api.reconcileChatPageUnits('branch-switch');
  equal(staleDivider.parentElement, null, 'divider removed from the DOM, not hidden');
  const withdraw = extractFunction(CORE_SOURCE, 'withdrawChatPageUnits');
  ok(!/display|visibility|opacity|hidden/.test(withdraw), 'withdrawal applies no CSS visibility');
  ok(withdraw.includes('removeH2OChatPageUnitNode'), 'withdrawal removes through the owned-node predicate only');
});

await fixture('12 withdrawal never removes host conversation nodes', () => {
  const h = makeHarness({ turns: 39, transition: { branchSelectionStale: true } });
  h.mountUnits(2);
  const host = new El('ARTICLE', 'host-turn');
  host.setAttribute('data-testid', 'conversation-turn-17');
  h.root.appendChild(host);
  const foreign = new El('SPAN', 'not-ours');
  foreign.setAttribute(BOUNDARY_ATTR, 'page-2-start');   // similar text, no owner stamp
  h.root.appendChild(foreign);
  h.api.reconcileChatPageUnits('branch-switch');
  equal(host.isConnected, true, 'host turn survives');
  equal(foreign.isConnected, true, 'foreign look-alike survives');
});

await fixture('13 incoherent presentation withdraws even without a transition flag', () => {
  // Authority already reports 18 while the model still holds 39.
  const h = makeHarness({ turns: 39, effectiveCount: 18, effectiveFp: FP_18 });
  h.mountUnits(2);
  const coherence = h.api.chatPageUnitPresentationCoherence({ count: 39 });
  equal(coherence.coherent, false, 'model and authority disagree');
  equal(coherence.reason, 'effective-count-mismatch', 'explicit incoherence reason');
  const result = h.api.reconcileChatPageUnits('post-switch');
  equal(result.status, 'branch-transition-withdrawn', 'fail-closed');
  equal(result.presentationCoherent, false, 'incoherence recorded');
  equal(h.enforceCalls.length, 0, 'no placement under incoherence');
});

await fixture('14 after coherent 18-turn authority only Page 1 rebuilds', () => {
  const h = makeHarness({ turns: 39, transition: { branchSelectionStale: true } });
  h.mountUnits(2);
  h.api.reconcileChatPageUnits('branch-switch');
  equal(h.dividers().length, 0, 'withdrawn');
  // New presentation lands: turn list, authority and flags all agree on 18.
  h.setTurns(18);
  h.sandbox.callEffectiveTurnRuntime = (verb) => {
    if (verb === 'STATUS') return { source: 'canonical', overlayActive: false, count: 18, canonicalFingerprint: CANONICAL_FP, anchorQId: null, pathLength: 0, generation: 7 };
    if (verb === 'INDEX') return { sourceFingerprint: FP_18, turns: new Array(18).fill(null) };
    return null;
  };
  h.sandbox.getTurnRuntimeApi = () => ({ getCompleteTurnIndexProjectionStatus: () => ({ enabled: true, authoritative: true, branchSelectionStale: false, trustedSelectionIntentActive: false }) });
  const rebuilt = h.api.reconcileChatPageUnits('post-switch');
  equal(rebuilt.status === 'branch-transition-withdrawn', false, 'transition cleared');
  equal(h.enforceCalls.length, 1, 'placement resumes exactly once');
  equal(h.enforceCalls[0].pageCount, 1, 'only Page 1 units are built');
  equal(h.unit(2, 'start'), null, 'no page-2-start remains');
  equal(h.unit(2, 'end'), null, 'no page-2-end remains');
  equal(h.divider(2), null, 'no Page 2 divider remains');
  // Page 1 is now the final page.
  const model = h.api.buildChatPageUnitModel();
  equal(model.pageCount, 1, 'single page model');
  equal(model.pages[0].endOrder, 18, 'Page 1 ends at turn 18');
});

await fixture('15 switching back to a coherent 39-turn branch rebuilds two pages', () => {
  const h = makeHarness({ turns: 18, effectiveFp: FP_18 });
  h.mountUnits(1);
  h.setTurns(39);
  h.sandbox.callEffectiveTurnRuntime = (verb) => {
    if (verb === 'STATUS') return { source: 'canonical', overlayActive: false, count: 39, canonicalFingerprint: CANONICAL_FP, anchorQId: null, pathLength: 0, generation: 7 };
    if (verb === 'INDEX') return { sourceFingerprint: FP_39, turns: new Array(39).fill(null) };
    return null;
  };
  const rebuilt = h.api.reconcileChatPageUnits('branch-return');
  equal(rebuilt.status === 'branch-transition-withdrawn', false, 'coherent, so no withdrawal');
  equal(h.enforceCalls.length, 1, 'placement runs');
  equal(h.enforceCalls[0].pageCount, 2, 'two pages rebuilt');
});

await fixture('16 branch changes start expanded', () => {
  // Withdrawal removes units and clears state; it never writes a collapsed
  // marker, and the collapsed attribute is applied only by the Chat page
  // decorate path from authority.
  const withdraw = extractFunction(CORE_SOURCE, 'withdrawChatPageUnits');
  ok(!/COLLAPSED|collapsed/.test(withdraw), 'withdrawal writes no collapsed state');
  const reconcile = extractFunction(CORE_SOURCE, 'reconcileChatPageUnits');
  const gate = reconcile.slice(reconcile.indexOf('{'), reconcile.indexOf('const candidatesByPage'));
  ok(!/collapsed/i.test(gate), 'the gate writes no collapsed state');
});

// ══════════════════════════════════════════════════════════════════════════
// E — sentinel ownership and removal
// ══════════════════════════════════════════════════════════════════════════

await fixture('17 removeH2OChatPageUnitNode removes every owned page unit', () => {
  const h = makeHarness({ turns: 39 });
  for (const [page, kind] of [[1, 'start'], [1, 'end'], [2, 'start'], [2, 'end']]) {
    const sentinel = h.api.createChatPageBoundarySentinel(page, kind);
    h.root.appendChild(sentinel);
    equal(sentinel.getAttribute(BOUNDARY_ATTR), `page-${page}-${kind}`, `sentinel stores page-${page}-${kind}`);
    equal(h.api.removeH2OChatPageUnitNode(sentinel), true, `page-${page}-${kind} removed`);
    equal(sentinel.isConnected, false, `page-${page}-${kind} disconnected`);
  }
  const divider = new El('DIV', 'cgxui-chat-page-divider');
  h.root.appendChild(divider);
  equal(h.api.removeH2OChatPageUnitNode(divider), true, 'owned divider removed');
  const pgnw = new El('DIV', 'cgxui-pgnw-page-divider');
  h.root.appendChild(pgnw);
  equal(h.api.removeH2OChatPageUnitNode(pgnw), true, 'owned pgnw divider removed');
  const legacy = new El('SPAN');
  legacy.setAttribute(BOUNDARY_ATTR, '1');
  h.root.appendChild(legacy);
  equal(h.api.removeH2OChatPageUnitNode(legacy), true, 'legacy "1" marker still removed');
});

await fixture('18 the removal predicate refuses foreign and malformed nodes', () => {
  const h = makeHarness({ turns: 39 });
  const cases = [
    ['host span with no attributes', () => new El('SPAN', 'host-thing')],
    ['similar text, no owner stamp', () => { const n = new El('SPAN'); n.setAttribute(BOUNDARY_ATTR, 'page-2-start'); return n; }],
    ['owner stamp, wrong value form', () => { const n = new El('SPAN'); n.setAttribute(BOUNDARY_ATTR, 'page-x-start'); n.setAttribute('data-cgxui-owner', OWNER); return n; }],
    ['page zero is not a page', () => { const n = new El('SPAN'); n.setAttribute(BOUNDARY_ATTR, 'page-0-start'); n.setAttribute('data-cgxui-owner', OWNER); n.setAttribute('data-h2o-chat-page-boundary-page', '0'); n.setAttribute('data-h2o-chat-page-boundary-kind', 'start'); return n; }],
    ['page/kind attributes disagree', () => { const n = new El('SPAN'); n.setAttribute(BOUNDARY_ATTR, 'page-2-start'); n.setAttribute('data-cgxui-owner', OWNER); n.setAttribute('data-h2o-chat-page-boundary-page', '3'); n.setAttribute('data-h2o-chat-page-boundary-kind', 'start'); return n; }],
    ['unknown kind', () => { const n = new El('SPAN'); n.setAttribute(BOUNDARY_ATTR, 'page-2-middle'); n.setAttribute('data-cgxui-owner', OWNER); n.setAttribute('data-h2o-chat-page-boundary-page', '2'); n.setAttribute('data-h2o-chat-page-boundary-kind', 'middle'); return n; }],
  ];
  for (const [label, make] of cases) {
    const node = make();
    h.root.appendChild(node);
    equal(h.api.removeH2OChatPageUnitNode(node), false, `refuses: ${label}`);
    equal(node.isConnected, true, `survives: ${label}`);
  }
});

await fixture('19 sentinels remain page-unit markers, not host boundary proof', () => {
  // The repair changed only removability. Rendered-boundary authority still
  // resolves through the exact host wrapper identity.
  ok(CORE_SOURCE.includes("String(child.getAttribute?.('data-turn-id-container') || '').trim() === qId"), 'exact wrapper identity retained');
  const sentinel = extractFunction(CORE_SOURCE, 'createChatPageBoundarySentinel');
  ok(!sentinel.includes('data-turn-id-container'), 'sentinels carry no host boundary identity');
});

// ══════════════════════════════════════════════════════════════════════════
// F — same-branch deferred placement is preserved
// ══════════════════════════════════════════════════════════════════════════

await fixture('20 coherent same-branch anchor loss is deferred, never withdrawn', () => {
  const h = makeHarness({ turns: 39 });
  h.mountUnits(2);
  const divider = h.divider(2);
  // Anchors are a placement concern; the gate never consults them.
  const result = h.api.reconcileChatPageUnits('anchor-transiently-lost');
  equal(result.status === 'branch-transition-withdrawn', false, 'no withdrawal');
  equal(h.enforceCalls.length, 1, 'placement still runs and can defer');
  equal(divider.isConnected, true, 'divider retained for the deferred case');
  equal(h.sentinels().length, 4, 'sentinels retained');
});

await fixture('21 absent virtualized wrappers never trigger withdrawal', () => {
  // Coherence compares counts and fingerprints only - it must not look at
  // mounted wrappers, which virtualization removes inside one coherent branch.
  const coherence = extractFunction(CORE_SOURCE, 'chatPageUnitPresentationCoherence');
  for (const f of ['isConnected', 'querySelector', 'wrapper', 'nativeSlot', 'parentNode']) {
    ok(!coherence.includes(f), `coherence ignores ${f}`);
  }
  const h = makeHarness({ turns: 39 });
  h.mountUnits(2);
  // Strip every host wrapper: the model and authority still agree on 39.
  for (const child of h.root.children.slice()) {
    if (String(child.className).includes('host')) child.remove();
  }
  const result = h.api.reconcileChatPageUnits('virtualized');
  equal(result.status === 'branch-transition-withdrawn', false, 'no withdrawal from unmounted wrappers');
  equal(h.enforceCalls.length, 1, 'placement proceeds');
});

await fixture('22 authority that cannot be read never forces withdrawal', () => {
  const h = makeHarness({ turns: 39 });
  h.sandbox.callEffectiveTurnRuntime = () => null;
  const coherence = h.api.chatPageUnitPresentationCoherence({ count: 39 });
  equal(coherence.coherent, true, 'unreadable authority proves nothing');
  equal(coherence.reason, 'authority-unavailable', 'explicit reason');
});

// ══════════════════════════════════════════════════════════════════════════
// G — accepted work is untouched
// ══════════════════════════════════════════════════════════════════════════

await fixture('23 no recursion or observer re-entry is introduced', () => {
  const reconcile = extractFunction(CORE_SOURCE, 'reconcileChatPageUnits');
  const gate = reconcile.slice(reconcile.indexOf('{'), reconcile.indexOf('const candidatesByPage'));
  ok(!/reconcileChatPageUnits\(/.test(gate), 'the gate never re-enters reconciliation');
  ok(!/renderChatPageDividers\(/.test(gate), 'the gate schedules no render pass');
  const withdraw = extractFunction(CORE_SOURCE, 'withdrawChatPageUnits');
  for (const f of ['reconcileChatPageUnits(', 'renderChatPageDividers(', 'setTimeout(', 'requestAnimationFrame(', 'MutationObserver']) {
    ok(!withdraw.includes(f), `withdrawal does not call ${f}`);
  }
  ok(reconcile.includes('state.reconcileInFlight = true;'), 'withdrawal runs inside the in-flight guard');
});

await fixture('24 Stage 2C-2d final-page and control derivation survive', () => {
  ok(CORE_SOURCE.includes('exact-terminal-page-artifact'), 'final-page terminal-tail anchoring retained');
  ok(PAGE_SOURCE.includes('if (!explicitExpansion) {\n        applyExpandedCollapseControlState(num, id);\n      }'), 'authoritative expanded-control derivation retained');
  equal((PAGE_SOURCE.match(/typeof applyExpandedCollapseControlState/g) || []).length, 0, 'no test-harness guard leaked');
  equal((PAGE_SOURCE.match(/function executeAtomicPageCollapseTransaction\(/g) || []).length, 1, 'one collapse transaction owner');
});

await fixture('25 Stage 2C-2eA title-bar remount restoration survives', () => {
  ok(TITLE_SOURCE.includes('TIME_recoverRemountedTitleBar'), 'recovery helper retained');
  ok(TITLE_SOURCE.includes('DOM_liveAnswerTitleBar'), 'live-bar resolver retained');
  equal((TITLE_SOURCE.match(/STATE_\.seen\.clear\(/g) || []).length, 0, 'seen ledger never cleared');
  equal((TITLE_SOURCE.match(/STATE_\.seen\.delete\(/g) || []).length, 0, 'seen ledger never pruned');
});

await fixture('26 corrected Stage 2C-2eB hit target and Tags behaviour survive', () => {
  equal((SKIN_SOURCE.match(/divider-dot::before/g) || []).length, 0, 'rejected pseudo-element still absent');
  ok(SKIN_SOURCE.includes('.cgxui-chat-page-divider-dot-hit,'), 'real hit child rule retained');
  ok(CORE_SOURCE.includes('ensureChatPageDividerDotHitEl'), 'hit child still created by MiniMap Core');
  const tokens = PAGE_SOURCE.slice(PAGE_SOURCE.indexOf('const DIVIDER_VISUAL_KEYS'));
  equal(Number((tokens.match(/dotSizeExpandedPx:\s*(\d+)/) || [])[1]), 14, 'visible circle still 14');
  equal(Number((SKIN_SOURCE.match(/DOT_HIT_SIZE_PX:\s*(\d+)/) || [])[1]), 28, 'hit target still 28');
  equal((PAGE_SOURCE.match(/addEventListener\('click',\s*S\.onDivider/g) || []).length, 2, 'still two divider click listeners');
  ok(PAGE_SOURCE.includes('openTagsCloudFromDivider'), 'Tags behaviour retained');
});

await fixture('27 MiniMap synchronization ownership is unchanged', () => {
  ok(PAGE_SOURCE.includes('propagateChatPageCollapseToMiniMap'), 'Chat to MiniMap one-way propagation retained');
  const withdraw = extractFunction(CORE_SOURCE, 'withdrawChatPageUnits');
  for (const f of ['propagate', 'MiniMap', 'setPageCollapsed', 'miniMap']) {
    ok(!withdraw.includes(f), `withdrawal does not touch ${f}`);
  }
  const coherence = extractFunction(CORE_SOURCE, 'chatPageUnitPresentationCoherence');
  ok(!/propagate|setPageCollapsed/.test(coherence), 'coherence owns no collapse state');
});

await fixture('28 no persistence or canonical publication behaviour changes', () => {
  const touched = ['withdrawChatPageUnits', 'chatPageUnitPresentationCoherence', 'chatPageUnitBranchTransitionActive', 'isOwnedChatPageBoundarySentinel'];
  for (const name of touched) {
    const body = extractFunction(CORE_SOURCE, name);
    for (const f of ['localStorage', 'sessionStorage', 'storageSet', 'storageGet', 'publish', 'fetch(']) {
      ok(!body.includes(f), `${name} does not touch ${f}`);
    }
  }
});

// ══════════════════════════════════════════════════════════════════════════
// H — stale MiniMap active identity cannot preserve the previous counter
// ══════════════════════════════════════════════════════════════════════════

await fixture('29 rebuilt 18-turn list falls back from stale Turn 25 to exactly 1/18', () => {
  const h = makeRebuildCounterHarness();
  equal(h.listIds.length, 18, 'exactly 18 rebuilt buttons');
  equal(h.listIds[0], 'turn-1', 'list begins at Turn 1');
  equal(h.listIds[17], 'turn-18', 'list ends at Turn 18');
  equal(h.listIds.includes(h.oldTurn25Id), false, 'old Turn 25 button is absent');
  const activated = h.api.applyRebuildActiveId(h.oldTurn25Id, '39-to-18');
  equal(activated, false, 'stale activation reports failure');
  equal(h.stats.setActiveCalls.length, 1, 'setActive called exactly once');
  equal(h.stats.setActiveCalls[0].id, h.oldTurn25Id, 'failed identity is exact old Turn 25');
  equal(h.stats.counterCalls.length, 1, 'fallback counter written exactly once');
  equal(h.stats.counterCalls[0], '', 'fallback uses the existing empty-ID contract');
  equal(h.stats.counterText, '1/18', 'counter is exactly 1/18');
  equal(h.stats.counterText === '25/39', false, 'old complete counter is gone');
  equal(h.activeMarkerIds().length, 0, 'no stale active DOM marker remains');
  equal(h.S.lastActiveTurnIdFast, '', 'fast stale identity cleared');
  equal(h.S.lastActiveBtnId, '', 'button stale identity cleared');
});

await fixture('30 finalizeRebuildUi uses the same failed-activation fallback', () => {
  const h = makeRebuildCounterHarness();
  const activated = h.api.finalizeRebuildUi('39-to-18');
  equal(activated, false, 'finalizer returns false after failed activation');
  equal(h.stats.setActiveCalls.length, 1, 'finalizer attempts activation once');
  equal(h.stats.counterCalls.length, 1, 'finalizer writes one fallback');
  equal(h.stats.counterCalls[0], '', 'finalizer fallback uses empty ID');
  equal(h.stats.counterText, '1/18', 'finalizer reaches 1/18');
  equal(h.S.lastActiveTurnIdFast, '', 'finalizer clears stale fast identity');
  equal(h.S.lastActiveBtnId, '', 'finalizer clears stale button identity');
});

await fixture('31 successful rebuild activation writes its counter once with no fallback', () => {
  for (const method of ['applyRebuildActiveId', 'finalizeRebuildUi']) {
    const h = makeRebuildCounterHarness({ cachedFast: 'turn-18', cachedBtn: 'turn-18' });
    const activated = method === 'applyRebuildActiveId'
      ? h.api.applyRebuildActiveId('turn-18', 'success')
      : h.api.finalizeRebuildUi('success');
    equal(activated, true, `${method} reports success`);
    equal(h.stats.setActiveCalls.length, 1, `${method} activates once`);
    equal(h.stats.counterCalls.length, 1, `${method} writes the successful counter once`);
    equal(h.stats.counterCalls[0], 'turn-18', `${method} never invokes empty-ID fallback`);
    equal(h.stats.counterText, '18/18', `${method} preserves successful activation counter`);
    equal(h.activeMarkerIds().join(','), 'turn-18', `${method} has one active marker`);
  }
});

await fixture('32 absent cached identity writes one fallback without calling setActive', () => {
  const h = makeRebuildCounterHarness({ cachedFast: '', cachedBtn: '' });
  equal(h.api.applyRebuildActiveId('', 'empty'), false, 'empty identity is not activated');
  equal(h.stats.setActiveCalls.length, 0, 'setActive is not called');
  equal(h.stats.counterCalls.length, 1, 'one fallback write');
  equal(h.stats.counterCalls[0], '', 'empty fallback identity');
  equal(h.stats.counterText, '1/18', 'empty path preserves architecture fallback');
});

await fixture('33 stale clearing cannot erase a newer valid concurrent identity', () => {
  const h = makeRebuildCounterHarness({ concurrentActiveId: 'turn-18' });
  equal(h.api.applyRebuildActiveId(h.oldTurn25Id, 'concurrent'), false, 'old activation still fails');
  equal(h.S.lastActiveTurnIdFast, 'turn-18', 'newer fast identity retained');
  equal(h.S.lastActiveBtnId, 'turn-18', 'newer button identity retained');
  equal(h.activeMarkerIds().join(','), 'turn-18', 'newer active marker retained');
  equal(h.stats.counterCalls.filter((id) => id === '').length, 1, 'failed pass still performs one fallback');
});

await fixture('34 production rebuild caller uses one guarded activation path', () => {
  const rebuild = extractFunction(CORE_SOURCE, 'rebuildNow');
  equal((rebuild.match(/applyRebuildActiveId\(activeId, why\)/g) || []).length, 1, 'main caller invokes guarded helper once');
  equal((rebuild.match(/finalizeRebuildUi\(why\)/g) || []).length, 0, 'main caller cannot duplicate activation through finalizer');
  equal((rebuild.match(/setActive\(activeId, `rebuild:/g) || []).length, 0, 'main caller never ignores setActive directly');
  const apply = extractFunction(CORE_SOURCE, 'applyRebuildActiveId');
  ok(apply.includes('setActive(activeId, `rebuild:${String(reason || \'core:rebuild\')}`) === true'), 'helper consumes exact boolean success');
  ok(apply.includes("try { updateCounter(''); } catch {}"), 'failed path owns the empty-ID fallback');
  const finalize = extractFunction(CORE_SOURCE, 'finalizeRebuildUi');
  ok(finalize.includes('return applyRebuildActiveId(activeId, reason);'), 'finalizer returns guarded result without unconditional true');
});

await fixture('35 mutation ignoring setActive return is killed', () => {
  const source = extractFunction(CORE_SOURCE, 'applyRebuildActiveId');
  const needle = "        activated = setActive(activeId, `rebuild:${String(reason || 'core:rebuild')}`) === true;";
  const mutant = source.replace(needle, "        setActive(activeId, `rebuild:${String(reason || 'core:rebuild')}`);\n        activated = true;");
  ok(mutant !== source, 'ignore-return mutant applied');
  const h = makeRebuildCounterHarness({ sources: { applyRebuildActiveId: mutant } });
  equal(h.api.applyRebuildActiveId(h.oldTurn25Id, 'mutant'), true, 'mutant falsely reports success');
  equal(h.stats.counterText, '25/39', 'mutant preserves stale counter and is observable');
});

await fixture('36 mutation returning true unconditionally from finalizer is killed', () => {
  const source = extractFunction(CORE_SOURCE, 'finalizeRebuildUi');
  const mutant = source.replace(
    '    return applyRebuildActiveId(activeId, reason);',
    '    applyRebuildActiveId(activeId, reason);\n    return true;',
  );
  ok(mutant !== source, 'unconditional-true mutant applied');
  const h = makeRebuildCounterHarness({ sources: { finalizeRebuildUi: mutant } });
  equal(h.api.finalizeRebuildUi('mutant'), true, 'mutant masks failed activation');
  equal(h.stats.setActiveCalls[0].id, h.oldTurn25Id, 'masked attempt was the missing Turn 25');
});

await fixture('37 mutation omitting failed-path fallback is killed', () => {
  const source = extractFunction(CORE_SOURCE, 'applyRebuildActiveId');
  const mutant = source.replace("    try { updateCounter(''); } catch {}", '    void 0;');
  ok(mutant !== source, 'missing-fallback mutant applied');
  const h = makeRebuildCounterHarness({ sources: { applyRebuildActiveId: mutant } });
  equal(h.api.applyRebuildActiveId(h.oldTurn25Id, 'mutant'), false, 'activation still fails');
  equal(h.stats.counterCalls.length, 0, 'mutant writes no fallback');
  equal(h.stats.counterText, '25/39', 'mutant leaves stale counter visible');
});

await fixture('38 mutation retaining stale active identity is killed', () => {
  const source = extractFunction(CORE_SOURCE, 'applyRebuildActiveId');
  const mutant = source.replace('      clearMissingRebuildActiveIdentity(activeId);', '      void activeId;');
  ok(mutant !== source, 'retain-stale mutant applied');
  const h = makeRebuildCounterHarness({ sources: { applyRebuildActiveId: mutant } });
  h.api.applyRebuildActiveId(h.oldTurn25Id, 'mutant');
  equal(h.S.lastActiveTurnIdFast, h.oldTurn25Id, 'mutant retains fast stale identity');
  equal(h.S.lastActiveBtnId, h.oldTurn25Id, 'mutant retains button stale identity');
});

await fixture('39 mutation adding fallback after successful activation is killed', () => {
  const source = extractFunction(CORE_SOURCE, 'applyRebuildActiveId');
  const mutant = source.replace('      if (activated) return true;', "      if (activated) { updateCounter(''); return true; }");
  ok(mutant !== source, 'duplicate-fallback mutant applied');
  const h = makeRebuildCounterHarness({
    cachedFast: 'turn-18',
    cachedBtn: 'turn-18',
    sources: { applyRebuildActiveId: mutant },
  });
  equal(h.api.applyRebuildActiveId('turn-18', 'mutant'), true, 'activation itself succeeds');
  equal(h.stats.setActiveCalls.length, 1, 'mutant still calls setActive once');
  equal(h.stats.counterCalls.length, 2, 'mutant performs duplicate counter write');
  equal(h.stats.counterCalls[1], '', 'duplicate write is the forbidden fallback');
});

await fixture('40 conflicting reverse-expansion Page 2 head keeps page units withdrawn', () => {
  const h = makeHarness({
    turns: 39,
    effectiveCount: 39,
    effectiveFp: FP_39,
    pageHeadState: 'conflict',
    transition: {
      branchExpansionFailClosed: true,
      branchExpansionState: 'fail-closed',
      branchExpansionReason: 'native-page-head-conflict',
      branchExpansionPriorCount: 18,
      branchExpansionTargetCount: 39,
      branchExpansionExpectedFingerprint: FP_39,
      branchExpansionRequiredPageNums: [2],
    },
  });
  h.mountUnits(2);
  const result = h.api.reconcileChatPageUnits('reverse-expansion-conflict');
  equal(result.withdrawn, true, 'conflicting expansion is withdrawn');
  equal(result.withdrawalReason, 'native-page-head-conflict', 'native conflict is diagnostic reason');
  equal(result.status, 'native-page-head-conflict-withdrawn', 'precise ordering status');
  equal(result.pageCount, 0, 'withdrawn result publishes zero pages');
  equal(h.document.documentElement.getAttribute('data-h2o-page-unit-ordering-count'), '0', 'diagnostic ordering count is zero');
  equal(h.enforceCalls.length, 0, 'ordering enforcement is sealed');
  equal(h.divider(2), null, 'no Page 2 divider survives or rebuilds');
});


await fixture('29 a current selected-path overlay settles page units despite stale scope and a retained intent', () => {
  const make = (projection, effective) => {
    const sandbox = { console };
    vm.createContext(sandbox);
    const src = extractFunction(CORE_SOURCE, 'chatPageUnitBranchTransitionActive')
      + `\nfunction getCompleteIndexProjectionStatus(){ return ${JSON.stringify(projection)}; }`
      + `\nfunction getEffectivePresentationRuntimeStatus(){ return ${JSON.stringify(effective)}; }`
      + `\nglobalThis.__active = chatPageUnitBranchTransitionActive();`;
    new vm.Script(src, { filename: CORE_PATH }).runInContext(sandbox);
    return sandbox.__active;
  };
  const staleIntent = {
    trustedSelectionIntentActive: true, branchSelectionStale: true,
    branchExpansionPending: false, branchExpansionFailClosed: false,
    selectedPathRequestLeaseActive: false, selectedPathConfirmationLeaseActive: false,
    selectedPathConfirmationPending: false,
  };
  const overlayOn = { overlayActive: true, source: 'selected-path-overlay', count: 39 };
  const overlayOff = { overlayActive: false, source: 'canonical', count: 39 };
  equal(make(staleIntent, overlayOff), true, 'no overlay: stale scope keeps units withdrawn');
  equal(make(staleIntent, overlayOn), false, 'a published overlay IS the completed branch: units settle');
  equal(make({ ...staleIntent, selectedPathRequestLeaseActive: true }, overlayOn), true, 'a pending request lease still withholds settlement');
  equal(make({ ...staleIntent, branchExpansionPending: true }, overlayOn), true, 'pending expansion still withholds settlement');
  equal(make({ ...staleIntent, branchTransactionPending: true }, overlayOn), true, 'a pending branch transaction dominates every other flag');
});

// ── Stage 2C Items 1-2 — effective-path identity, badge cache, transition
// authority. Owned here because this validator already owns branch-transition
// authority and already executes the real 1A1b bodies. Every assertion below
// runs extracted production source, not a pattern match.
await fixture('stage-2c items 1-2: effective-path identity is separate, guarded and authoritative', () => {
  // (1)(3) The accessor is its own function and the pinned getter is untouched
  // by it: neither body references the other, so nothing was replaced.
  const accessorSrc = extractFunction(CORE0_SOURCE, 'getChatAtlasEffectivePathIdentity');
  const pinnedSrc = extractFunction(CORE0_SOURCE, 'getCompleteTurnIndexProjectionStatus');
  ok(accessorSrc.length > 0, 'accessor exists independently in Core');
  equal(pinnedSrc.includes('getChatAtlasEffectivePathIdentity'), false,
    'pinned projection getter does not call or wrap the new accessor');
  equal(accessorSrc.includes('function getCompleteTurnIndexProjectionStatus'), false,
    'accessor does not redefine the pinned getter');
  equal(createHash('sha256').update(pinnedSrc, 'utf8').digest('hex'),
    '5183fc701d98db7d57c544b1dfd832545d8abe66465b36a2b7d655012db8fcb7',
    'pinned projection getter body is byte-identical to its accepted bytes');

  // (2) exported on the public runtime api
  ok(/\n\s{4}getChatAtlasEffectivePathIdentity,\n/.test(CORE0_SOURCE),
    'accessor is exported on the public api surface');

  // (4)(5) Run the REAL accessor body with controlled dependencies.
  const ctx = {
    getEffectivePresentationIndex: () => ({ turns: [{ qId: 'q1' }, { qId: 'q2' }], sourceFingerprint: 'fp-eff' }),
    getEffectivePresentationStatus: () => ({ source: 'selected-path-overlay', overlayActive: true, pathLength: 2 }),
    chatAtlasPathIdentityKey: (t) => `k:${t.length}`,
    chatAtlasCompleteIndexStableHash: (v) => `h${String(v).length}`,
    chatAtlasFreeze: (o) => Object.freeze(o),
    completeTurnIndexAuthorityState: { chatId: 'c1', generation: 7 },
    JSON, String, Number, Array, Object,
  };
  vm.createContext(ctx);
  vm.runInContext(`${accessorSrc}\nglobalThis.__out = getChatAtlasEffectivePathIdentity();`, ctx);
  const out = ctx.__out;
  ok(Object.isFrozen(out), 'accessor result is frozen');
  equal(out.effectiveCount, 2, 'effectiveCount reflects the effective path length');
  equal(out.effectiveSource, 'selected-path-overlay', 'effectiveSource is exposed');
  equal(out.overlayActive, true, 'overlayActive is exposed');
  ok(typeof out.effectivePathRevision === 'string' && out.effectivePathRevision.startsWith('djb2:'),
    'effectivePathRevision is exposed as a hash');
  ok(Object.values(out).every((v) => v === null || ['string', 'number', 'boolean'].includes(typeof v)),
    'accessor result is content-free: primitives only');

  // Fail-closed: a throwing dependency must not throw out of the accessor.
  const ctx2 = { ...ctx, getEffectivePresentationIndex: () => { throw new Error('x'); },
    getEffectivePresentationStatus: () => { throw new Error('x'); } };
  vm.createContext(ctx2);
  vm.runInContext(`${accessorSrc}\nglobalThis.__out = getChatAtlasEffectivePathIdentity();`, ctx2);
  equal(ctx2.__out.effectiveCount, 0, 'accessor fails closed to zero effective count');
  equal(ctx2.__out.overlayActive, false, 'accessor fails closed to non-overlay');
});

await fixture('stage-2c item 2: badge cache follows effective-path authority', () => {
  const mapSrc = extractFunction(CORE_SOURCE, 'getBranchBadgeMap');
  let rebuilds = 0;
  const base = { effectivePathRevision: 'djb2:r1', effectiveCount: 18, effectiveSource: 'selected-path-overlay', overlayActive: true };
  let eff = { ...base };
  const ctx = {
    getCompleteIndexProjectionStatus: () => ({ enabled: true, chatId: CHAT_ID, routeGeneration: 3, fingerprint: CANONICAL_FP, count: 39 }),
    getEffectivePathIdentity: () => eff,
    branchBadgeCache: { key: '', byQId: null },
    getTurnRuntimeApi: () => ({ getChatAtlasBranchBadges: () => { rebuilds += 1; return [{ qId: 'q1', primaryAId: 'a1' }]; } }),
    Map, String, Object, Array, Number,
  };
  vm.createContext(ctx);
  const run = `${mapSrc}\nglobalThis.__m = getBranchBadgeMap();`;
  vm.runInContext(run, ctx); equal(rebuilds, 1, 'first badge map computes once');
  vm.runInContext(run, ctx); equal(rebuilds, 1, 'unchanged effective identity hits the cache');
  // (6)(7) each effective axis alone must invalidate
  for (const [field, next, label] of [
    ['effectivePathRevision', 'djb2:r2', 'effectivePathRevision'],
    ['effectiveCount', 19, 'effectiveCount'],
    ['effectiveSource', 'canonical', 'effectiveSource'],
    ['overlayActive', false, 'overlayActive'],
  ]) {
    const before = rebuilds;
    eff = { ...base, [field]: next };
    vm.runInContext(run, ctx);
    equal(rebuilds, before + 1, `${label} change alone invalidates the badge cache`);
    eff = { ...base };
    vm.runInContext(run, ctx);
  }
});

await fixture('stage-2c item 2: MiniMap authority during and outside trusted transition', () => {
  // The real presentation-count expression, evaluated with controlled inputs.
  const i = CORE_SOURCE.indexOf('const expectedPresentationCount = overlayActive');
  ok(i > 0, 'presentation-count authority expression exists in production source');
  const expr = CORE_SOURCE.slice(i, CORE_SOURCE.indexOf(';', CORE_SOURCE.indexOf('projectedCount', i)) + 1);
  const gateI = CORE_SOURCE.indexOf('const branchTransitionInFlight =');
  ok(gateI > 0, 'transition gate exists in production source');
  const gate = CORE_SOURCE.slice(gateI, CORE_SOURCE.indexOf(';', gateI) + 1);
  const evaluate = (completeIndex, effectiveIdentity, overlayActive, effectivePresentation) => {
    const ctx = { completeIndex, effectiveIdentity, overlayActive, effectivePresentation };
    vm.createContext(ctx);
    vm.runInContext(`${gate}\n${expr}\nglobalThis.__c = expectedPresentationCount;`, ctx);
    return ctx.__c;
  };
  const eff = { available: true, effectiveCount: 19 };
  const quiet = { projectedCount: 20, branchSelectionStale: false, trustedSelectionIntentActive: false, branchTransactionPending: false };
  // (9) each established transition signal alone selects effective authority
  for (const flag of ['branchSelectionStale', 'trustedSelectionIntentActive', 'branchTransactionPending']) {
    equal(evaluate({ ...quiet, [flag]: true }, eff, false, { count: 0 }), 19,
      `${flag} alone makes effectiveCount the MiniMap authority`);
  }
  // (8) projected count is not presentation authority during a transition
  equal(evaluate({ ...quiet, branchSelectionStale: true }, eff, false, { count: 0 }) === quiet.projectedCount, false,
    'projected count is not used as authority during a trusted transition');
  // (10) outside a transition the historical projected boundary stands
  equal(evaluate(quiet, eff, false, { count: 0 }), 20, 'outside a transition projectedCount remains authoritative');
  // overlay path is unchanged by the transition gate
  equal(evaluate({ ...quiet, branchSelectionStale: true }, eff, true, { count: 39 }), 39,
    'a published overlay still supplies the effective presentation count');
  // (11) accessor-unavailable fallback reproduces historical behaviour
  equal(evaluate({ ...quiet, branchSelectionStale: true }, { available: false, effectiveCount: 0 }, false, { count: 0 }), 20,
    'older Core without the accessor falls back to historical projectedCount');
});

await fixture('stage-2c items 1-2: invariant surface unchanged', () => {
  // (12)(13) The trusted-selection subsystem adds no persistence of any kind.
  for (const [label, src] of [['Core', CORE0_SOURCE], ['MiniMap', CORE_SOURCE]]) {
    for (const api of ['sessionStorage', 'indexedDB', 'chrome.storage']) {
      equal(src.includes(api), false, `${label} introduces no ${api} persistence`);
    }
    equal(/addEventListener\(\s*['"]pagehide['"]/.test(src), false, `${label} adds no pagehide persistence`);
    equal(/addEventListener\(\s*['"]visibilitychange['"]/.test(src), false, `${label} adds no visibilitychange persistence`);
  }
  const accessorSrc = extractFunction(CORE0_SOURCE, 'getChatAtlasEffectivePathIdentity');
  const bridgeSrc = extractFunction(CORE_SOURCE, 'getEffectivePathIdentity');
  for (const [label, src] of [['accessor', accessorSrc], ['MiniMap bridge', bridgeSrc]]) {
    equal(/setItem|removeItem|localStorage|sessionStorage|indexedDB/.test(src), false,
      `${label} performs zero storage writes`);
  }
});


// ── Stage 2C — acquisition-state truthfulness ────────────────────────────
// A trusted selection whose branch transaction has PUBLISHED must never be
// rewritten into a failure by a later DOM re-derivation, nor by intent expiry.
// The real chatAtlasSelectedPathPublishedForToken body is executed here.
function extractConstBlock(source, name) {
  const at = source.indexOf(`const ${name}`);
  if (at < 0) throw new Error(`const-missing:${name}`);
  return source.slice(at, source.indexOf(']))', at) + 3);
}

function truthWorld({ txState, txToken, acqToken, acqStatus,
                     published = true, acceptedCount = 39, acceptedFingerprint = 'djb2:ok',
                     graphChat = 'c', graphRoute = '/c/c', graphGeneration = 1 }) {
  const sandbox = {
    completeTurnIndexAuthorityState: {
      branchTransactionState: txState ? { state: txState, token: txToken } : null,
      chatId: 'c', routeKey: '/c/c', generation: 1,
    },
    selectedPathAcquisitionState: {
      token: acqToken, status: acqStatus,
      lastPublicationDecision: published === null ? null
        : { published, acceptedCount, acceptedFingerprint },
      graph: graphChat === null ? null
        : { chatId: graphChat, routeKey: graphRoute, generation: graphGeneration },
    },
    chatAtlasCompleteIndexIdentity: (v) => {
      const id = String(v || '').trim();
      return /^[a-z0-9._:-]{1,256}$/i.test(id) ? id : '';
    },
    String, Number, Object, Array,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(
    extractFunction(CORE0_SOURCE, 'chatAtlasSelectedPathPublishedForToken')
    + '\nglobalThis.__f = chatAtlasSelectedPathPublishedForToken;',
  ).runInContext(sandbox);
  return sandbox.__f;
}

await fixture('stage-2c A: publication ownership is enforced at the primitives', () => {
  // The rule now lives inside the two mutating primitives and the one direct
  // mutation, so it cannot be bypassed by adding another call site.
  const fail = extractFunction(CORE0_SOURCE, 'chatAtlasSelectedPathFail');
  // selectedPathFail uses the EARLIER signal — the transaction lifecycle —
  // because publication evidence does not exist yet when it can first run.
  const guardAt = fail.indexOf("transaction.state === 'pending'");
  ok(guardAt >= 0, 'selectedPathFail consults the transaction lifecycle');
  ok(fail.includes("=== 'selected-answer-not-changed'"),
    'the pending guard is scoped to the post-switch artefact only');
  ok(fail.includes('chatAtlasAcquisitionPublicationOwned()'),
    'published transactions are gated by publication ownership, not state alone');
  for (const sentinel of ["status = 'failed'", 'path = null', 'proof = null']) {
    ok(fail.indexOf(sentinel) > guardAt, `the guard precedes ${sentinel}`);
  }

  const clear = extractFunction(CORE0_SOURCE, 'chatAtlasClearSelectedPathAcquisition');
  const clearGuard = clear.indexOf('chatAtlasAcquisitionPublicationOwned()');
  ok(clearGuard >= 0, 'the clear primitive consults publication ownership');
  ok(clear.includes('chatAtlasAcquisitionResetBoundary(reason)'),
    'and exempts explicit reset boundaries');
  for (const sentinel of ["token = null", 'path = null', 'proof = null']) {
    ok(clear.indexOf(sentinel) > clearGuard, `the guard precedes ${sentinel}`);
  }

  const retain = extractFunction(CORE0_SOURCE, 'chatAtlasRetainIdentityGraph');
  ok(retain.includes('!chatAtlasAcquisitionPublicationOwned()'),
    'ordinary graph re-capture cannot destroy a published record');
  const gr = retain.indexOf("reason = 'graph-replaced'");
  ok(retain.indexOf('!chatAtlasAcquisitionPublicationOwned()') < gr,
    'the guard precedes the graph-replaced demotion');

  // Reset boundaries are classified, not string-whitelisted at call sites.
  const resets = extractConstBlock(CORE0_SOURCE, 'CHAT_ATLAS_ACQUISITION_RESET_REASONS');
  for (const r of ['route-changed', 'authority-reset', 'canonical-fingerprint-changed',
    'identity-graph-refetch-scope-drift']) {
    ok(resets.includes(r), `${r} is a genuine reset boundary`);
  }
  for (const r of ['trusted-intent-unavailable', 'trusted-intent-expired',
    'trusted-intent-superseded']) {
    ok(!resets.includes(r), `${r} is ordinary lifecycle cleanup, not a reset`);
  }

  // The compensating restores are gone: prevention, not repair.
  const hold = extractFunction(CORE0_SOURCE, 'chatAtlasSelectedPathHoldPublished');
  ok(!hold.includes("status = 'proven'"), 'the hold no longer restores status');
  const install = extractFunction(CORE0_SOURCE, 'chatAtlasInstallSelectedPathOverlay');
  ok(!install.includes("selectedPathAcquisitionState.status = 'proven'"),
    'restore-on-publish is removed');
});

await fixture('stage-2c B: an unpublished selection keeps the not-changed failure', () => {
  const f = truthWorld({ txState: 'pending', txToken: 't1', acqToken: 't1', acqStatus: 'proven' });
  equal(f('t1'), false, 'a pending transaction is not a completed selection');
  const g = truthWorld({ txState: null, txToken: '', acqToken: '', acqStatus: 'inactive' });
  equal(g('t1'), false, 'no transaction at all is never treated as published');
});

await fixture('stage-2c C: stale or ambiguous publication still fails closed', () => {
  const base = { txState: 'published', txToken: 't1', acqToken: 't1', acqStatus: 'failed' };
  equal(truthWorld(base)('t1'), true, 'a real published decision holds even from a demoted record');
  equal(truthWorld({ ...base, published: false })('t1'), false, 'an unpublished decision proves nothing');
  equal(truthWorld({ ...base, published: null })('t1'), false, 'a missing decision proves nothing');
  equal(truthWorld({ ...base, acceptedCount: 0 })('t1'), false, 'an empty accepted path proves nothing');
  equal(truthWorld({ ...base, acceptedFingerprint: '' })('t1'), false, 'no accepted fingerprint, no proof');
  equal(truthWorld({ ...base, txState: 'pending' })('t1'), false, 'a pending transaction is not complete');
  equal(truthWorld({ ...base, txState: 'fail-closed' })('t1'), false, 'a fail-closed transaction is never complete');
  equal(truthWorld({ ...base, txToken: 'other' })('t1'), false, 'a transaction for another token proves nothing');
  equal(truthWorld({ ...base, acqToken: 'other' })('t1'), false, 'an acquisition bound elsewhere proves nothing');
  equal(truthWorld({ ...base, graphChat: null })('t1'), false, 'no retained graph, no proof');
  equal(truthWorld({ ...base, graphChat: 'other' })('t1'), false, 'a graph from another chat is out of scope');
  equal(truthWorld({ ...base, graphGeneration: 2 })('t1'), false, 'a graph from another generation is stale');
  equal(truthWorld(base)(''), false, 'an empty token never matches');
});

await fixture('stage-2c D: intent expiry does not rewrite a completed selection', () => {
  const body = extractFunction(CORE0_SOURCE, 'chatAtlasCurrentTrustedNativeBranchSelection');
  ok(body.includes('&& !chatAtlasSelectedPathPublishedForToken(intent.token)'),
    'expiry clears the acquisition only when the selection did not publish');
  const guarded = body.indexOf("&& !chatAtlasSelectedPathPublishedForToken(intent.token)");
  const guardedClear = body.indexOf('chatAtlasClearSelectedPathAcquisition', guarded);
  ok(guarded >= 0 && guardedClear > guarded,
    'the expiry clear is inside the guarded branch, not before it');
  ok(body.slice(guarded, guardedClear).indexOf('}') < 0,
    'no block closes between the guard and the clear it protects');
  ok(body.includes('completeTurnIndexAuthorityState.trustedSelectedPathIntent = null'),
    'the INTENT is still retired on expiry');
});

await fixture('stage-2c E: route reset still clears acquisition normally', () => {
  const reset = extractFunction(CORE0_SOURCE, 'chatAtlasResetCompleteIndexRoute');
  ok(reset.length > 0, 'the route reset path is intact');
  const clear = extractFunction(CORE0_SOURCE, 'chatAtlasClearSelectedPathAcquisition');
  ok(!clear.includes('chatAtlasSelectedPathPublishedForToken'),
    'the clear primitive itself is unguarded, so resets still work');
});


// ── Stage 2C — selectedPathFail transaction-lifecycle guard ───────────────
// The real chatAtlasSelectedPathFail body is executed against a sandbox that
// models only what the guard reads, so the assertions are behavioural.
function failWorld({ txState, txToken, acqToken = 't1' }) {
  const acquisition = {
    token: acqToken, status: 'proven', reason: 'selected-path-proven',
    path: [1, 2, 3], proof: { ok: true }, anchorQId: 'q', anchorSelectedAId: 'a',
    provenAt: 'ts', evaluatedLedgerVersion: 0,
    lastPublicationDecision: null, graph: null,
  };
  const sandbox = {
    completeTurnIndexAuthorityState: {
      branchTransactionState: txState ? { state: txState, token: txToken } : null,
      chatId: 'c', routeKey: '/c/c', generation: 1,
    },
    selectedPathAcquisitionState: acquisition,
    chatAtlasLedgerState: { version: 7 },
    chatAtlasBranchTransactionTrace: () => {},
    chatAtlasCompleteIndexCode: (v, f) => String(v || f || ''),
    chatAtlasCompleteIndexIdentity: (v) => String(v || '').trim(),
    getSelectedPathAcquisitionStatus: () => ({
      status: acquisition.status, reason: acquisition.reason,
      pathLength: Array.isArray(acquisition.path) ? acquisition.path.length : 0,
    }),
    chatAtlasSelectedPathPublishedForToken: () => false,
    chatAtlasAcquisitionPublicationOwned: () => false,
    String, Number, Object, Array,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(
    extractFunction(CORE0_SOURCE, 'chatAtlasSelectedPathFail')
    + '\nglobalThis.__fail = chatAtlasSelectedPathFail;',
  ).runInContext(sandbox);
  return { fail: sandbox.__fail, acquisition };
}

await fixture('stage-2c F: a pending transaction blocks only the post-switch artefact', () => {
  const w = failWorld({ txState: 'pending', txToken: 't1' });
  const out = w.fail('selected-answer-not-changed', { token: 't1', qId: 'q' }, 'a');
  equal(w.acquisition.status, 'proven', 'selected-answer-not-changed leaves status untouched');
  equal(w.acquisition.path.length, 3, 'and leaves path intact');
  ok(w.acquisition.proof, 'and leaves proof intact');
  equal(out.status, 'proven', 'the caller sees the unchanged record');

  // CV-3.8 containment: genuine derivation failures must still be recorded
  // while the transaction is pending, or a 20/21 hybrid could settle.
  for (const reason of ['anchor-not-in-graph', 'fork-unresolved',
    'descent-variant-ambiguous', 'proof-ownership-invalid']) {
    const g = failWorld({ txState: 'pending', txToken: 't1' });
    g.fail(reason, { token: 't1', qId: 'q' }, 'a');
    equal(g.acquisition.status, 'failed', `${reason} is still recorded while pending`);
    equal(g.acquisition.path, null, `${reason} still clears path`);
  }

  // A published transaction alone is NOT evidence — ownership decides.
  const pub = failWorld({ txState: 'published', txToken: 't1' });
  pub.fail('selected-answer-not-changed', { token: 't1', qId: 'q' }, 'a');
  equal(pub.acquisition.status, 'failed',
    'published alone does not suppress; publication ownership does');
});

await fixture('stage-2c G: a legitimate failure is never suppressed', () => {
  const cases = [
    ['fail-closed transaction', { txState: 'fail-closed', txToken: 't1' }],
    ['wrong-token transaction', { txState: 'pending', txToken: 'other' }],
    ['no transaction at all', { txState: null, txToken: '' }],
  ];
  for (const [label, opts] of cases) {
    const w = failWorld(opts);
    w.fail('selected-answer-not-changed', { token: 't1', qId: 'q' }, 'a');
    equal(w.acquisition.status, 'failed', `${label}: the failure still lands`);
    equal(w.acquisition.path, null, `${label}: path is cleared as before`);
    equal(w.acquisition.proof, null, `${label}: proof is cleared as before`);
  }
});

await fixture('stage-2c H: the guard asserts nothing about success', () => {
  const body = extractFunction(CORE0_SOURCE, 'chatAtlasSelectedPathFail');
  const at = body.indexOf("transaction.state === 'pending'");
  ok(at >= 0, 'the transaction-lifecycle guard exists');
  const before = body.slice(0, body.indexOf('return getSelectedPathAcquisitionStatus();', at));
  const code = before.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  for (const forbidden of ["status = 'proven'", 'lastPublicationDecision =',
    'setTimeout(', 'schedule(', 'Schedule(']) {
    ok(!code.includes(forbidden), `the guard never uses ${forbidden}`);
  }
  ok(body.indexOf("status = 'failed'") > at, 'the guard precedes every mutation');
});

const failed = fixtures.filter((f) => !f.ok);
console.log(`CV-3.31 fixtures ${fixtures.length - failed.length}/${fixtures.length} assertions ${assertions}`);
if (failed.length) {
  for (const f of failed) console.error(`${f.name}: ${f.error?.message || f.error}`);
  process.exitCode = 1;
}
