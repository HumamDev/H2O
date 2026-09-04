#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PAGE_PATH = 'src-runtime-base/1C1b.🔴📑 Thread Pages Controller 📑.js';
const PAGINATION_PATH = 'src-runtime-base/0C1b.⚫️🪟 Pagination Windowing (Chat 🔗 Adapter) 🪟.js';
const UNMOUNT_PATH = 'src-runtime-base/0C2b.⚫️⛰️ Unmount Messages (Chat 🔗 Adapter) ⛰️.js';
const DIVIDER_PATH = 'src-runtime-base/1A1b.🟥🗺️ MiniMap Core 🧱🗺️.js';
const VALIDATOR_PATH = 'tools/validation/chat-atlas/validate-chat-atlas-cv3-13-title-list-page-hydration.mjs';
const BASE = 'ac18cc70323d5b9b7b094bcef0afd4d432787437';
const P03C_VERIFIED_HEAD = 'c40809a18675d0812186124ce77bf8f3c0b35e36';
const P03C_VERIFIED_PAGE_BLOB = '906fd4856fad632b2caf05062af309513e42d421';
const P03C_PATHS = Object.freeze([
  PAGE_PATH,
  'tools/validation/chat-atlas/validate-chat-atlas-cv3-11-effective-title-list-collapse.mjs',
  VALIDATOR_PATH,
  'tools/validation/chat-atlas/validate-chat-atlas-cv3-14-page-visibility-stamp-ownership.mjs',
  'tools/validation/chat-atlas/validate-chat-atlas-cv3-26-atomic-rendered-boundary-page-collapse.mjs',
]);

// ---------------------------------------------------------------------------
// Multi-boundary verified product ledger.
//
// Three classes are tracked, and they are never conflated:
//
//   A. The immutable historical P03C package. BASE..P03C_VERIFIED_HEAD must
//      remain the exact five-path set above, permanently. It is never
//      repointed, and it never absorbs later descendant maintenance.
//   B. The later, independently verified product correction. The product source
//      may advance only across the pinned, explicitly enumerated correction
//      package below, and only as far as the pinned
//      CURRENT_VERIFIED_PRODUCT_HEAD.
//   C. Later validator/test-only maintenance descendants of the current
//      verified product boundary. These may accumulate without a further
//      boundary rewrite, but may never carry a product-source path and may
//      never move the verified product blob.
//
// The executing HEAD is never itself product authority: it is admitted only as
// a class-C validator-only descendant of the pinned current verified boundary.
// ---------------------------------------------------------------------------
const CURRENT_VERIFIED_PRODUCT_HEAD = 'd53a98044f4ba77b525ed3ecd05c487165813d48';
const CURRENT_VERIFIED_PAGE_BLOB = '4548df7176b22e499e2aea851f8a02ed91d6e7fc';
const VERIFIED_PRODUCT_CORRECTION_PATHS = Object.freeze([
  PAGE_PATH,
  'tools/validation/chat-atlas/validate-chat-atlas-cv3-26-atomic-rendered-boundary-page-collapse.mjs',
]);
const PAGE_SOURCE = fs.readFileSync(path.join(ROOT, PAGE_PATH), 'utf8');
const PAGINATION_SOURCE = fs.readFileSync(path.join(ROOT, PAGINATION_PATH), 'utf8');
const UNMOUNT_SOURCE = fs.readFileSync(path.join(ROOT, UNMOUNT_PATH), 'utf8');
// The chat page's structural implementation moved out of MiniMap Core into
// 0C3a Chat Page Structure Engine, so the MiniMap source read here is that
// file plus the engine the code now lives in. No assertion below is altered:
// positive checks and by-name function extraction still find the code, and
// negative checks get strictly stronger, because a forbidden pattern must now
// be absent from both files instead of from MiniMap Core alone.
const STRUCTURE_PATH = 'src-runtime-base/0C3a.⬛️📐 Chat Page Structure Engine 📐.js';
const STRUCTURE_SOURCE = fs.readFileSync(path.join(ROOT, STRUCTURE_PATH), 'utf8');
const DIVIDER_SOURCE = `${fs.readFileSync(path.join(ROOT, DIVIDER_PATH), 'utf8')}\n${STRUCTURE_SOURCE}`;

const fixtures = [];
let assertionCount = 0;
const safety = {
  storageWrites: 0,
  preferenceWrites: 0,
  canonicalWrites: 0,
  aliasWrites: 0,
  cacheWrites: 0,
  networkCalls: 0,
  newPolling: 0,
  repeatingTimers: 0,
  broadObservers: 0,
  destructiveRemovals: 0,
};

function normalize(value) {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

function equal(actual, expected, message) {
  assertionCount += 1;
  assert.deepEqual(normalize(actual), normalize(expected), message);
}

function ok(value, message) {
  assertionCount += 1;
  assert.ok(value, message);
}

async function fixture(name, run) {
  try {
    await run();
    fixtures.push({ name, ok: true });
  } catch (error) {
    fixtures.push({ name, ok: false, error: String(error?.stack || error) });
  }
}

function exactPathSet(actual = [], expected = []) {
  const left = Array.from(new Set(actual.map(String))).sort();
  const right = Array.from(new Set(expected.map(String))).sort();
  return left.length === right.length && left.every((file, index) => file === right[index]);
}

function isValidatorMaintenancePath(file = '') {
  const value = String(file || '');
  return value.startsWith('tools/validation/')
    && value.endsWith('.mjs')
    && !value.includes('/../')
    && !value.includes('//');
}

function isProductSourcePath(file = '') {
  return !isValidatorMaintenancePath(file);
}

// Class A. The immutable historical P03C package: exact five-path set equality
// against pinned literal endpoints, plus the pinned historical product blob.
function historicalPackageExact({ historicalPaths = [], historicalVerifiedBlob = '' } = {}) {
  return exactPathSet(historicalPaths, P03C_PATHS)
    && historicalVerifiedBlob === P03C_VERIFIED_PAGE_BLOB;
}

// Class B. The independently verified product correction segment. Every changed
// path must be either explicitly enumerated in the pinned correction package or
// validator/test maintenance, and every product-source path in the range must
// be explicitly enumerated. No arbitrary product path is admitted, and valid
// ancestry alone never admits a product change.
function correctionSegmentValid({ correctionAncestor = false, correctionPaths = [] } = {}) {
  return correctionAncestor === true
    && correctionPaths.every((file) => VERIFIED_PRODUCT_CORRECTION_PATHS.includes(file)
      || isValidatorMaintenancePath(file))
    && correctionPaths
      .filter((file) => isProductSourcePath(file))
      .every((file) => VERIFIED_PRODUCT_CORRECTION_PATHS.includes(file));
}

// Class C. Validator/test-only maintenance descendants of the current verified
// product boundary. The correction package is NOT admissible here: a product
// path that was legitimate inside class B is still rejected in class C.
function currentDescendantValid({ currentAncestor = false, descendantPaths = [] } = {}) {
  return currentAncestor === true
    && descendantPaths.every(isValidatorMaintenancePath);
}

// The pinned current verified product blob must be intact at the boundary
// commit, at the executing HEAD, and in the worktree, with no dirty or
// untracked product-source path anywhere.
function currentProductBlobSafe({
  currentVerifiedBlob = '',
  currentBlob = '',
  workingBlob = '',
  dirtyNonValidatorPaths = [],
} = {}) {
  return currentVerifiedBlob === CURRENT_VERIFIED_PAGE_BLOB
    && currentBlob === CURRENT_VERIFIED_PAGE_BLOB
    && workingBlob === CURRENT_VERIFIED_PAGE_BLOB
    && dirtyNonValidatorPaths.length === 0;
}

function verifiedProductBoundaryValid(evidence = {}) {
  return historicalPackageExact(evidence)
    && correctionSegmentValid(evidence)
    && currentDescendantValid(evidence)
    && currentProductBlobSafe(evidence);
}

function blobAt(rev, file = PAGE_PATH) {
  return execFileSync('git', ['rev-parse', `${rev}:${file}`], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
}

function gitPathList(args = []) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
}

function isAncestor(ancestor, descendant = 'HEAD') {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: ROOT,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function extractFunction(source, name) {
  const anchor = `  function ${name}(`;
  const start = source.indexOf(anchor);
  if (start < 0 || source.indexOf(anchor, start + anchor.length) >= 0) {
    throw new Error(`function-anchor-invalid:${name}`);
  }
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`function-boundary-invalid:${name}`);
}

function canonicalRecords(count = 39) {
  return Array.from({ length: count }, (_value, index) => {
    const order = index + 1;
    return {
      order,
      turnNo: order,
      idx: order,
      qId: `q-${order}`,
      turnId: `turn:q-${order}`,
      primaryAId: `a-${order}`,
      answerIds: [`a-${order}`],
      answerVariants: [`a-${order}`],
      noAnswer: false,
    };
  });
}

function createAuthorityHarness() {
  const canonical = canonicalRecords();
  const selected = canonicalRecords(18);
  const state = { overlay: false, invalid: false, drift: false };
  let statusReads = 0;
  const current = () => (state.overlay ? selected : canonical);
  const runtime = {
    listTurnRecords: () => canonical,
    getEffectivePresentationStatus() {
      statusReads += 1;
      const count = state.overlay ? 18 : 39;
      return {
        source: state.overlay ? 'selected-path-overlay' : 'canonical',
        overlayActive: state.overlay,
        count: state.drift && statusReads % 2 === 0 ? count + 1 : count,
        canonicalFingerprint: 'canonical-39',
        anchorQId: state.overlay ? 'q-17' : '',
        pathLength: state.overlay ? 18 : 0,
        chatId: 'chat',
        routeKey: '/c/chat',
        generation: 4,
      };
    },
    getEffectivePresentationIndex() {
      return {
        complete: !state.invalid,
        proof: state.overlay ? 'selected-path-overlay' : 'host-payload-full-graph',
        turns: current(),
      };
    },
    getEffectiveTurnRecordByQId(id) {
      return current().find((record) => record.qId === id) || null;
    },
    getEffectiveTurnRecordByAId(id) {
      return current().find((record) => record.primaryAId === id) || null;
    },
  };
  const api = vm.runInNewContext(`(() => {
    const TURN_RUNTIME = () => injectedRuntime;
    const MM_CORE_API = () => null;
    const TITLE_LIST_PAGE_SIZE = 25;
    const TITLE_LIST_EFFECTIVE_METHOD = Object.freeze({
      STATUS: ['get', 'Effective', 'PresentationStatus'].join(''),
      INDEX: ['get', 'Effective', 'PresentationIndex'].join(''),
      BY_QID: ['get', 'Effective', 'TurnRecordByQId'].join(''),
      BY_AID: ['get', 'Effective', 'TurnRecordByAId'].join(''),
    });
    ${extractFunction(PAGE_SOURCE, 'pureCanonicalPageMemberDetails')}
    ${extractFunction(PAGE_SOURCE, 'titleListEffectiveStatusIdentity')}
    ${extractFunction(PAGE_SOURCE, 'titleListMemberFromPresentationRecord')}
    ${extractFunction(PAGE_SOURCE, 'readEffectiveTitleListAuthority')}
    ${extractFunction(PAGE_SOURCE, 'readTitleListPresentationAuthority')}
    ${extractFunction(PAGE_SOURCE, 'buildTitleListPresentationPageModel')}
    return Object.freeze({
      authority: readTitleListPresentationAuthority,
      model: buildTitleListPresentationPageModel,
    });
  })()`, { injectedRuntime: runtime });
  return {
    api,
    state,
    resetReads() { statusReads = 0; },
  };
}

function createHydrationHarness() {
  const authority = createAuthorityHarness();
  const activePages = new Set([1]);
  const log = [];
  const pgState = { held: false, restored: false };
  const umState = { ids: [], active: false };
  const S = { titleListPageHydration: null };
  const api = vm.runInNewContext(`(() => {
    const TITLE_LIST_PAGE_HYDRATION_OWNER = 'chat-pages:title-list';
    const S = injectedState;
    const resolveChatId = () => 'chat';
    const buildTitleListPresentationPageModel = () => injectedAuthority.model();
    const readTitleListPages = () => injectedActivePages;
    const PG_ADAPTER = () => ({
      setPresentationFullFlowHold(owner, active) {
        injectedLog.push(active ? 'pagination-hold' : 'pagination-release');
        injectedPg.held = !!active;
        if (active) injectedPg.restored = true;
        return { ok: true, active: !!active, owners: active ? 1 : 0 };
      },
    });
    const UM_ADAPTER = () => ({
      setPresentationMountGuard(owner, ids) {
        injectedLog.push(ids.length ? 'unmount-guard' : 'unmount-release');
        injectedUm.ids = ids.slice();
        injectedUm.active = ids.length > 0;
        return { ok: true, ids: ids.length, requested: ids.length };
      },
    });
    const MM_CORE_PAGES = () => ({
      renderDividers() {
        injectedLog.push('divider-render');
        if (!injectedPg.restored) throw new Error('divider-before-full-flow');
        return true;
      },
    });
    const syncTitleListNativeTimestampVisibility = () => {
      injectedLog.push('timestamp-sync');
      return { hidden: 0, shown: 1, orphanHidden: 0, scanned: 2 };
    };
    ${extractFunction(PAGE_SOURCE, 'titleListPageHydrationIds')}
    ${extractFunction(PAGE_SOURCE, 'reconcileTitleListPageHydration')}
    return Object.freeze({ reconcile: reconcileTitleListPageHydration });
  })()`, {
    injectedAuthority: authority.api,
    injectedActivePages: activePages,
    injectedLog: log,
    injectedPg: pgState,
    injectedUm: umState,
    injectedState: S,
  });
  return { authority, activePages, log, pgState, umState, state: S, api };
}

function createPaginationHoldHarness() {
  const S = {
    booted: true,
    renderedOnce: true,
    presentationFullFlowOwners: new Set(),
    presentationFullFlowResumeRequested: false,
  };
  const log = [];
  const api = vm.runInNewContext(`(() => {
    const S = injectedState;
    const isFeatureEnabled = () => true;
    const teardownRuntimeSession = (reason, opts) => {
      injectedLog.push(['teardown', reason, opts.preserveApi, opts.preservePresentationFullFlowHold]);
      S.booted = false;
      S.renderedOnce = false;
      return { ok: true };
    };
    const boot = (reason) => {
      injectedLog.push(['boot', reason]);
      S.booted = true;
      S.renderedOnce = true;
      return true;
    };
    ${extractFunction(PAGINATION_SOURCE, 'API_PG_setPresentationFullFlowHold')}
    ${extractFunction(PAGINATION_SOURCE, 'API_PG_getPresentationFullFlowHoldStatus')}
    return Object.freeze({
      set: API_PG_setPresentationFullFlowHold,
      get: API_PG_getPresentationFullFlowHoldStatus,
    });
  })()`, { injectedState: S, injectedLog: log });
  return { S, log, api };
}

function createUnmountGuardHarness() {
  const S = {
    presentationMountGuardsByOwner: new Map(),
    protectUntil: new Map(),
  };
  const requested = [];
  const api = vm.runInNewContext(`(() => {
    const S = injectedState;
    const UTIL_UM_normalizeId = (value) => String(value || '').replace(/^conversation-turn-/, '').trim();
    const API_UM_requestMountByUid = (id, reason) => {
      injectedRequested.push([id, reason]);
      return true;
    };
    ${extractFunction(UNMOUNT_SOURCE, 'CORE_UM_isTurnGroupProtected')}
    ${extractFunction(UNMOUNT_SOURCE, 'API_UM_setPresentationMountGuard')}
    ${extractFunction(UNMOUNT_SOURCE, 'API_UM_getPresentationMountGuardStatus')}
    return Object.freeze({
      set: API_UM_setPresentationMountGuard,
      get: API_UM_getPresentationMountGuardStatus,
      protected: CORE_UM_isTurnGroupProtected,
    });
  })()`, { injectedState: S, injectedRequested: requested });
  return { S, requested, api };
}

function createDividerParkingHarness() {
  const parent = { name: 'conversation-flow' };
  const before = { name: 'after-page-1-tail' };
  const anchor = { parentNode: parent, nextSibling: before };
  const turns = canonicalRecords().map((record) => ({
    ...record,
    questionId: record.qId,
    answerId: record.primaryAId,
  }));
  const api = vm.runInNewContext(`(() => {
    const S = { turnList: injectedTurns };
    const getChatPageTurnHost = (turn) => turn?.answerId === 'a-25' ? injectedAnchor : null;
    const sectionByStableId = () => null;
    const getChatPagePairAnchorNode = (host) => host;
    ${extractFunction(DIVIDER_SOURCE, 'getAuthorityDividerParkingPosition')}
    return Object.freeze({ park: getAuthorityDividerParkingPosition });
  })()`, { injectedTurns: turns, injectedAnchor: anchor });
  return { parent, before, anchor, api };
}

class FakeStyle {
  constructor() { this.values = new Map(); }
  setProperty(name, value) { this.values.set(name, String(value)); }
  removeProperty(name) { this.values.delete(name); }
  getPropertyValue(name) { return this.values.get(name) || ''; }
}

class FakeElement {
  constructor(name, order = 0) {
    this.name = name;
    this.order = order;
    this.nodeType = 1;
    this.attrs = new Map();
    this.style = new FakeStyle();
    this.isConnected = true;
    this.hiddenAncestor = null;
    this.unmounted = false;
  }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.get(name) || null; }
  hasAttribute(name) { return this.attrs.has(name); }
  removeAttribute(name) { this.attrs.delete(name); }
  closest(selector) {
    if (selector.includes('data-cgxui-chat-page-title-list-hidden') && this.hiddenAncestor) return this.hiddenAncestor;
    return null;
  }
  querySelector(selector) {
    if (this.unmounted && /h2o-unmounted|unmounted-placeholder/.test(selector)) return {};
    return null;
  }
}

function createTimestampHarness() {
  const p1 = new FakeElement('page-1-timestamp', 25);
  const p2 = new FakeElement('page-2-timestamp', 26);
  const orphan = new FakeElement('orphan-timestamp', 0);
  for (const node of [p1, p2, orphan]) node.setAttribute('data-h2o-native-ts', '1');
  const sections = new Map();
  for (const order of [25, 26]) {
    sections.set(order, {
      questionSection: new FakeElement(`q-${order}`),
      answerSection: new FakeElement(`a-${order}`),
    });
  }
  const activePages = new Set([1]);
  const model = {
    source: 'canonical',
    count: 39,
    pageCount: 2,
    pages: [
      { pageNo: 1, startOrder: 1, endOrder: 25, turnRecords: [{ turnNo: 25, type: 'answer' }] },
      { pageNo: 2, startOrder: 26, endOrder: 39, turnRecords: [{ turnNo: 26, type: 'answer' }] },
    ],
  };
  const api = vm.runInNewContext(`(() => {
    const ATTR_TITLE_LIST_FLOW_HIDDEN = 'data-cgxui-chat-page-title-list-hidden';
    const ATTR_TITLE_LIST_ORPHAN_TIMESTAMP_HIDDEN = 'data-cgxui-chat-page-title-list-orphan-timestamp-hidden';
    const ATTR_TITLE_STACK_INLINE = 'data-h2o-title-stack-inline';
    const TITLE_LIST_PAGE_SIZE = 25;
    const TOPW = { H2O: { NativeTimestamps: { scan() { return 3; } } } };
    const W = TOPW;
    const document = {
      querySelectorAll(selector) {
        return selector === '[data-h2o-native-ts="1"]' ? injectedTimestamps : [];
      },
    };
    const resolveChatId = () => 'chat';
    const readTitleListPages = () => injectedActivePages;
    const buildTitleListPresentationPageModel = () => injectedModel;
    const restoreInlineTurnToFlow = () => true;
    const getComputedStyle = (node) => ({ display: node.style.getPropertyValue('display') || 'block' });
    const titleListMemberSections = (member) => injectedSections.get(Number(member?.turnNo || 0)) || {};
    const titleListAdjacentTurnOrders = (node) => node.order ? [node.order] : [];
    ${extractFunction(PAGE_SOURCE, 'setTitleListFlowAnchorHidden')}
    ${extractFunction(PAGE_SOURCE, 'titleListMemberMateriallyPresent')}
    ${extractFunction(PAGE_SOURCE, 'setOrphanTitleListTimestampHidden')}
    ${extractFunction(PAGE_SOURCE, 'syncTitleListNativeTimestampVisibility')}
    return Object.freeze({ sync: syncTitleListNativeTimestampVisibility });
  })()`, {
    injectedTimestamps: [p1, p2, orphan],
    injectedActivePages: activePages,
    injectedModel: model,
    injectedSections: sections,
  });
  return { p1, p2, orphan, sections, activePages, model, api };
}

function hidden(node) {
  return node.style.getPropertyValue('display') === 'none';
}

await fixture('canonical 39 authority builds two exact pages', () => {
  const h = createAuthorityHarness();
  const model = h.api.model();
  equal(model.source, 'canonical', 'canonical source is selected');
  equal(model.count, 39, 'canonical count is 39');
  equal(model.pageCount, 2, 'canonical page count is two');
  equal([model.pages[0].startOrder, model.pages[0].endOrder], [1, 25], 'Page 1 is 1..25');
  equal([model.pages[1].startOrder, model.pages[1].endOrder], [26, 39], 'Page 2 is 26..39');
  equal(model.pages[1].turnRecords.length, 14, 'Page 2 owns fourteen records');
});

await fixture('selected 18 authority builds one page and no Page 2', () => {
  const h = createAuthorityHarness();
  h.state.overlay = true;
  h.resetReads();
  const model = h.api.model();
  equal(model.source, 'selected-path-overlay', 'selected authority is coherent');
  equal(model.count, 18, 'selected count is eighteen');
  equal(model.pageCount, 1, 'selected path has one page');
  equal(model.pages[0].endOrder, 18, 'selected Page 1 ends at 18');
  equal(model.pages[1], undefined, 'selected Page 2 is absent');
});

await fixture('Page 1 collapse materializes adjacent normal Page 2', () => {
  const h = createHydrationHarness();
  const result = h.api.reconcile('chat', { reason: 'collapse-page-1' });
  equal(result.status, 'materialized', 'hydration reconciles');
  equal(result.activePages, [1], 'Page 1 is the collapsed title-list page');
  equal(result.normalPages, [2], 'Page 2 is the adjacent normal page');
  equal(result.guardedIds, 42, 'all fourteen Page 2 q/a/turn identities are guarded');
  equal(h.pgState.held, true, 'pagination full-flow hold is active');
  equal(h.umState.active, true, 'Unmount mount guard is active');
});

await fixture('Page 2 normal content identities are requested from real page model', () => {
  const h = createHydrationHarness();
  h.api.reconcile('chat');
  ok(h.umState.ids.includes('q-26'), 'Page 2 question 26 is guarded');
  ok(h.umState.ids.includes('a-26'), 'Page 2 answer 26 is guarded');
  ok(h.umState.ids.includes('q-39'), 'Page 2 question 39 is guarded');
  ok(h.umState.ids.includes('a-39'), 'Page 2 answer 39 is guarded');
  equal(h.umState.ids.some((id) => id === 'q-25' || id === 'a-25'), false, 'Page 1 identities are not normal-page guards');
});

await fixture('orphan timestamps hide until their owner is materialized', () => {
  const h = createTimestampHarness();
  let result = h.api.sync(h.model, h.activePages);
  equal(hidden(h.p1), true, 'collapsed Page 1 timestamp hides');
  equal(hidden(h.p2), false, 'materialized normal Page 2 timestamp remains visible');
  equal(hidden(h.orphan), true, 'timestamp without a mounted owner hides');
  equal(result.orphanHidden, 1, 'one orphan is hidden');
  h.sections.get(26).answerSection.unmounted = true;
  result = h.api.sync(h.model, h.activePages);
  equal(hidden(h.p2), true, 'Page 2 timestamp hides when its owner body is unmounted');
  equal(result.hidden >= 1, true, 'owner-missing visibility is counted');
  h.sections.get(26).answerSection.unmounted = false;
  result = h.api.sync(h.model, h.activePages);
  equal(hidden(h.p2), false, 'normal Page 2 timestamp restores with owner');
  equal(hidden(h.p1), true, 'collapsed Page 1 timestamp remains hidden');
  equal(result.shown, 1, 'one normal-page timestamp is restored');
});

await fixture('Refresh reconstruction orders full flow before divider and timestamps', () => {
  const h = createHydrationHarness();
  h.api.reconcile('chat', { reason: 'refresh' });
  equal(h.log.slice(0, 4), ['pagination-hold', 'unmount-guard', 'divider-render', 'timestamp-sync'], 'stable reconstruction order is deterministic');
  equal(h.pgState.restored, true, 'pagination restored master turns before divider render');
  equal(h.state.titleListPageHydration.pageCount, 2, 'runtime remembers authoritative page count only in memory');
  equal(h.state.titleListPageHydration.normalPages, [2], 'runtime records Page 2 as normal');
});

await fixture('divider durability is authority-owned and independent of turn 26 hydration', () => {
  const h = createDividerParkingHarness();
  const parking = h.api.park(2);
  equal(DIVIDER_SOURCE.includes('const authPageCount = authPairCount > 0 ? Math.ceil(authPairCount / 25) : 0;'), true, 'divider count comes from authoritative turn list');
  equal(DIVIDER_SOURCE.includes('for (let n = 1; n <= authPageCount; n += 1) renderPageNums.add(n);'), true, 'every authority page is scheduled');
  equal(DIVIDER_SOURCE.includes('keepPageNum <= authPageCount'), true, 'existing authority divider survives anchor churn');
  equal(parking.parent, h.parent, 'real divider helper parks Page 2 in the conversation flow');
  equal(parking.before, h.before, 'parking follows the exact authoritative Page 1 tail');
  equal(h.api.park(3), null, 'authority with two pages cannot park a phantom Page 3');
  equal(DIVIDER_SOURCE.includes("data-h2o-divider-authority-parked"), true, 'parked divider is explicitly marked until exact re-anchor');
  equal(PAGE_SOURCE.includes('MM_CORE_PAGES()?.renderDividers?.(id)'), true, 'page hydration explicitly repairs dividers');
});

await fixture('title-list hold suspends exact-page windowing without changing config', () => {
  const h = createPaginationHoldHarness();
  const result = h.api.set('chat-pages:title-list', true);
  equal(result.status, 'held', 'full-flow hold activates');
  equal(h.api.get().active, true, 'hold status is active');
  equal(h.log.length, 1, 'one teardown occurs');
  equal(h.log[0], ['teardown', 'title-list:full-flow-hold', true, true], 'established teardown preserves API and hold');
  equal(h.S.presentationFullFlowResumeRequested, true, 'configured runtime is marked for resume');
  const released = h.api.set('chat-pages:title-list', false);
  equal(released.status, 'released', 'hold releases');
  equal(released.resumed, true, 'configured runtime resumes');
  equal(h.api.get().active, false, 'no hold remains');
  equal(h.log.filter((entry) => entry[0] === 'boot').length, 1, 'one boot resumes normal windowing');
});

await fixture('unchanged hydration is idempotent', () => {
  const h = createPaginationHoldHarness();
  h.api.set('chat-pages:title-list', true);
  h.api.set('chat-pages:title-list', true);
  equal(h.log.filter((entry) => entry[0] === 'teardown').length, 1, 'duplicate hold does not teardown twice');
  equal(h.api.get().owners, 1, 'one owner remains');
  equal(h.S.presentationFullFlowOwners.size, 1, 'owner set does not duplicate');
});

await fixture('Unmount guard remounts and protects Page 2 identities', () => {
  const h = createUnmountGuardHarness();
  const result = h.api.set('chat-pages:title-list', ['q-26', 'a-26', 'a-26']);
  equal(result.status, 'guarded', 'mount guard activates');
  equal(result.ids, 2, 'duplicate identities are deduplicated');
  equal(h.requested.length, 2, 'each exact identity receives one mount request');
  const unchanged = h.api.set('chat-pages:title-list', ['a-26', 'q-26']);
  equal(unchanged.status, 'guarded-unchanged', 'unchanged guard does not issue duplicate hydration requests');
  equal(h.requested.length, 2, 'repeated reconciliation does not accumulate mount requests');
  equal(h.api.protected({ aliasIds: ['a-26'], uids: [] }), true, 'matching group is persistently protected');
  equal(h.api.protected({ aliasIds: ['a-25'], uids: [] }), false, 'foreign Page 1 group is not protected');
});

await fixture('Unmount guard release restores ordinary optimizer ownership', () => {
  const h = createUnmountGuardHarness();
  h.api.set('chat-pages:title-list', ['q-26', 'a-26']);
  const released = h.api.set('chat-pages:title-list', []);
  equal(released.status, 'released', 'guard releases');
  equal(h.api.get('chat-pages:title-list').active, false, 'guard is inactive');
  equal(h.api.protected({ aliasIds: ['a-26'], uids: [] }), false, 'group is again eligible for normal unmounting');
});

await fixture('selected transition removes Page 2 materialization because authority has one page', () => {
  const h = createHydrationHarness();
  h.api.reconcile('chat');
  h.authority.state.overlay = true;
  h.authority.resetReads();
  const result = h.api.reconcile('chat', { reason: 'effective-presentation' });
  equal(result.model.pageCount, 1, 'selected authority has one page');
  equal(result.normalPages, [], 'no adjacent Page 2 remains');
  equal(result.guardedIds, 0, 'Page 2 mount guard is empty');
  equal(h.umState.active, false, 'Unmount guard releases Page 2');
});

await fixture('canonical return recreates Page 2 without Refresh', () => {
  const h = createHydrationHarness();
  h.authority.state.overlay = true;
  h.authority.resetReads();
  h.api.reconcile('chat');
  h.authority.state.overlay = false;
  h.authority.resetReads();
  const result = h.api.reconcile('chat', { reason: 'canonical-return' });
  equal(result.model.count, 39, 'canonical count returns');
  equal(result.model.pageCount, 2, 'Page 2 returns from authority');
  equal(result.normalPages, [2], 'Page 2 is immediately normal');
  ok(h.log.includes('divider-render'), 'divider repair runs on return');
  ok(h.umState.ids.includes('a-39'), 'tail turn is materialized');
});

await fixture('invalid effective authority falls atomically to canonical 39', () => {
  const h = createAuthorityHarness();
  h.state.overlay = true;
  h.state.invalid = true;
  h.resetReads();
  let model = h.api.model();
  equal(model.source, 'canonical', 'invalid overlay uses canonical source');
  equal(model.count, 39, 'fallback count is 39');
  equal(model.pageCount, 2, 'fallback keeps Page 2');
  h.state.invalid = false;
  h.state.drift = true;
  h.resetReads();
  model = h.api.model();
  equal(model.source, 'canonical', 'status drift also falls back atomically');
});

await fixture('repeated refresh does not duplicate divider, title, or hydration owners', () => {
  const h = createHydrationHarness();
  h.api.reconcile('chat', { reason: 'refresh-1' });
  h.api.reconcile('chat', { reason: 'refresh-2' });
  equal(h.pgState.held, true, 'same pagination owner remains held');
  equal(h.umState.ids.length, 42, 'guard identity count stays stable');
  equal(h.state.titleListPageHydration.normalPages, [2], 'normal page model stays stable');
  equal(PAGE_SOURCE.includes("hub.onMutations('chat-pages:title-list'"), true, 'existing Observer Hub remains the sole remount delivery');
});

await fixture('atomic stable-state order cannot expose orphan timestamp before divider', () => {
  const h = createHydrationHarness();
  h.api.reconcile('chat', { reason: 'first-stable-frame' });
  const dividerIndex = h.log.indexOf('divider-render');
  const timestampIndex = h.log.indexOf('timestamp-sync');
  ok(dividerIndex > h.log.indexOf('unmount-guard'), 'divider follows materialization');
  ok(timestampIndex > dividerIndex, 'timestamp ownership follows divider/page ownership');
  equal(h.log.includes('global-hide'), false, 'no global hidden phase exists');
});

await fixture('P03C C5 host remount cannot retain an adopted stale wrapper', () => {
  equal(PAGE_SOURCE.includes('openedContentAdopted'), false, 'no adopted-wrapper transaction state remains');
  equal(PAGE_SOURCE.includes('adoptOpenedTurnIntoStack'), false, 'no native adoption helper remains');
  equal(PAGE_SOURCE.includes('data-h2o-title-stack-inline'), false, 'no native inline ownership stamp remains');
});

await fixture('P03C C6 route and reset paths cannot restore stale native wrappers', () => {
  const release = extractFunction(PAGE_SOURCE, 'releaseAtomicPageCollapseState');
  const reset = extractFunction(PAGE_SOURCE, 'resetAllMechanisms');
  equal(release.includes('restoreAllInlineTurns'), false, 'atomic release performs no native restore');
  equal(reset.includes('restoreAllInlineTurns'), false, 'reset performs no native restore');
  equal(PAGE_SOURCE.includes('restoreInlineTurnToFlow'), false, 'no callable native restore helper remains');
});

await fixture('safety and scope boundaries remain exact', () => {
  const paths = [PAGE_PATH];
  const diffs = paths.map((file) => execFileSync('git', ['diff', '--unified=0', BASE, '--', file], {
    cwd: ROOT,
    encoding: 'utf8',
  })).join('\n');
  const added = diffs.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')).join('\n');
  equal(/\bfetch\s*\(/.test(added), false, 'no network call');
  equal(/\bsetInterval\s*\(/.test(added), false, 'no polling or repeating timer');
  equal(/\bnew\s+MutationObserver\b/.test(added), false, 'no broad observer');
  equal(/localStorage\.(?:setItem|removeItem|clear)\s*\(/.test(added), false, 'no storage write');
  equal(/sessionStorage\.(?:setItem|removeItem|clear)\s*\(/.test(added), false, 'no session cache write');
  equal(/\b(?:set|write|mutate)Canonical[A-Z]\w*\s*\(/.test(added), false, 'no canonical mutation API');
  equal(/alias(?:es)?\.(?:set|write|delete)/i.test(added), false, 'no alias write');
  equal(/(?:anchor|wrapper|section)\??\.remove\(\)/i.test(added), false, 'no destructive host removal');
  equal(/getEffectivePresentation(?:Index|Status)/.test(added), false, 'no acquisition/overlay redesign');
  equal(/Side Actions|side-actions/i.test(added), false, 'no Side Actions change');

  const historicalPaths = gitPathList([
    'diff', '--name-only', '-z', `${BASE}..${P03C_VERIFIED_HEAD}`,
  ]);
  const correctionPaths = gitPathList([
    'diff', '--name-only', '-z', `${P03C_VERIFIED_HEAD}..${CURRENT_VERIFIED_PRODUCT_HEAD}`,
  ]);
  const descendantPaths = gitPathList([
    'diff', '--name-only', '-z', `${CURRENT_VERIFIED_PRODUCT_HEAD}..HEAD`,
  ]);
  const dirtyTracked = [
    ...gitPathList(['diff', '--name-only', '-z']),
    ...gitPathList(['diff', '--cached', '--name-only', '-z']),
  ];
  const dirtyUntracked = gitPathList(['ls-files', '--others', '--exclude-standard', '-z']);
  const dirtyNonValidatorPaths = Array.from(new Set([...dirtyTracked, ...dirtyUntracked]))
    .filter((file) => !isValidatorMaintenancePath(file));
  const historicalVerifiedBlob = blobAt(P03C_VERIFIED_HEAD);
  const currentVerifiedBlob = blobAt(CURRENT_VERIFIED_PRODUCT_HEAD);
  const currentBlob = blobAt('HEAD');
  const workingBlob = execFileSync(
    'git', ['hash-object', PAGE_PATH], { cwd: ROOT, encoding: 'utf8' },
  ).trim();
  const evidence = {
    historicalPaths,
    historicalVerifiedBlob,
    correctionAncestor: isAncestor(P03C_VERIFIED_HEAD, CURRENT_VERIFIED_PRODUCT_HEAD),
    correctionPaths,
    currentAncestor: isAncestor(CURRENT_VERIFIED_PRODUCT_HEAD),
    descendantPaths,
    currentVerifiedBlob,
    currentBlob,
    workingBlob,
    dirtyNonValidatorPaths,
  };

  // Class A -- immutable historical P03C package.
  equal(exactPathSet(historicalPaths, P03C_PATHS), true, 'historical P03C package is the exact five-path set');
  equal(historicalPaths.length, 5, 'historical P03C package is exactly five paths');
  equal(historicalVerifiedBlob, P03C_VERIFIED_PAGE_BLOB, 'historical P03C verified 1C1b blob is unchanged');
  equal(historicalPackageExact(evidence), true, 'immutable historical P03C package is intact');
  equal(P03C_PATHS.includes(VALIDATOR_PATH), true, 'CV-3.13 participates in the historical P03C assurance package');

  // Class B -- independently verified product correction segment.
  equal(correctionSegmentValid(evidence), true, 'verified product correction segment stays inside the pinned correction package');
  equal(
    correctionPaths.filter((file) => isProductSourcePath(file)),
    [PAGE_PATH],
    'the only product-source path in the verified correction segment is 1C1b',
  );
  equal(
    correctionPaths.filter((file) => isProductSourcePath(file))
      .every((file) => VERIFIED_PRODUCT_CORRECTION_PATHS.includes(file)),
    true,
    'every correction-segment product path is explicitly enumerated',
  );

  // Class C -- validator-only descendants of the current verified boundary.
  equal(currentDescendantValid(evidence), true, 'current descendant delta is validator maintenance only');
  equal(descendantPaths.every(isValidatorMaintenancePath), true, 'committed descendant delta is validator maintenance only');

  // Current verified product blob safety.
  equal(currentVerifiedBlob, CURRENT_VERIFIED_PAGE_BLOB, 'pinned current verified boundary carries the verified 1C1b blob');
  equal(currentBlob, CURRENT_VERIFIED_PAGE_BLOB, 'executing HEAD carries the verified 1C1b blob');
  equal(workingBlob, CURRENT_VERIFIED_PAGE_BLOB, 'worktree 1C1b matches the verified 1C1b blob');
  equal(dirtyNonValidatorPaths, [], 'worktree has no dirty or untracked product/source path');

  equal(verifiedProductBoundaryValid(evidence), true, 'verified product carry-forward holds across the multi-boundary ledger');

  // Preserved historical negative controls.
  equal(exactPathSet(P03C_PATHS, P03C_PATHS), true, 'exact historical set is accepted');
  equal(
    exactPathSet([...P03C_PATHS, 'src-runtime-base/unauthorized-p03c-expansion.js'], P03C_PATHS),
    false,
    'historical production-path expansion is rejected',
  );

  // G. A legitimate validator-only descendant is accepted, and stays accepted
  // for further validator-only descendants without another boundary rewrite.
  equal(verifiedProductBoundaryValid({
    ...evidence,
    descendantPaths: ['tools/validation/chat-atlas/synthetic-maintenance.mjs'],
  }), true, 'validator-only descendant is accepted');
  equal(verifiedProductBoundaryValid({
    ...evidence,
    descendantPaths: [...descendantPaths, 'tools/validation/chat-atlas/synthetic-future-maintenance.mjs'],
  }), true, 'further validator-only descendant is accepted without a boundary rewrite');

  // A. Current 1C1b blob mismatch.
  equal(verifiedProductBoundaryValid({
    ...evidence,
    currentBlob: '0000000000000000000000000000000000000000',
  }), false, 'current 1C1b blob mismatch is rejected');
  equal(verifiedProductBoundaryValid({
    ...evidence,
    currentBlob: P03C_VERIFIED_PAGE_BLOB,
  }), false, 'reverting 1C1b to the historical verified blob is still a current-boundary mismatch');
  equal(verifiedProductBoundaryValid({
    ...evidence,
    currentVerifiedBlob: '0000000000000000000000000000000000000000',
  }), false, 'a repointed current verified boundary blob is rejected');

  // B. Unauthorized product path after the current verified boundary.
  equal(verifiedProductBoundaryValid({
    ...evidence,
    descendantPaths: [...descendantPaths, 'src-runtime-base/unauthorized-descendant.js'],
  }), false, 'descendant production path is rejected');
  equal(verifiedProductBoundaryValid({
    ...evidence,
    descendantPaths: [...descendantPaths, PAGE_PATH],
  }), false, 'a further 1C1b change after the verified boundary is rejected even though 1C1b is in the correction package');
  equal(verifiedProductBoundaryValid({
    ...evidence,
    currentAncestor: false,
  }), false, 'an executing HEAD that does not descend from the current verified boundary is rejected');

  // C. Unauthorized product path inside the verified correction segment.
  equal(correctionSegmentValid({
    ...evidence,
    correctionPaths: [...correctionPaths, 'src-runtime-base/unauthorized-correction.js'],
  }), false, 'correction-segment production path outside the pinned package is rejected by the segment predicate');
  equal(verifiedProductBoundaryValid({
    ...evidence,
    correctionPaths: [...correctionPaths, 'src-runtime-base/unauthorized-correction.js'],
  }), false, 'correction-segment production path outside the pinned package is rejected');
  equal(verifiedProductBoundaryValid({
    ...evidence,
    correctionAncestor: false,
  }), false, 'a correction segment that does not descend from the historical boundary is rejected');

  // D. Altered historical P03C package.
  equal(verifiedProductBoundaryValid({
    ...evidence,
    historicalPaths: [...P03C_PATHS, 'src-runtime-base/unauthorized-p03c-expansion.js'],
  }), false, 'a six-path historical P03C package is rejected');
  equal(verifiedProductBoundaryValid({
    ...evidence,
    historicalPaths: P03C_PATHS.slice(0, 4),
  }), false, 'a shrunken historical P03C package is rejected');
  equal(verifiedProductBoundaryValid({
    ...evidence,
    historicalPaths: [...P03C_PATHS, 'tools/validation/chat-atlas/validate-chat-atlas-cv3-24-rendered-boundary-collapse-capability.mjs'],
  }), false, 'later validator maintenance cannot be absorbed into the historical P03C package');
  equal(verifiedProductBoundaryValid({
    ...evidence,
    historicalVerifiedBlob: CURRENT_VERIFIED_PAGE_BLOB,
  }), false, 'repointing the historical verified blob to the current blob is rejected');

  // E. Dirty or untracked product source.
  equal(verifiedProductBoundaryValid({
    ...evidence,
    dirtyNonValidatorPaths: [PAGE_PATH],
  }), false, 'a dirty or untracked product-source path is rejected');

  // F. Worktree 1C1b differs from the committed verified blob.
  equal(verifiedProductBoundaryValid({
    ...evidence,
    workingBlob: '0000000000000000000000000000000000000000',
  }), false, 'worktree 1C1b divergence from the verified blob is rejected');
});

for (const key of Object.keys(safety)) equal(safety[key], 0, `safety counter ${key} remains zero`);

const failed = fixtures.filter((entry) => !entry.ok);
for (const entry of fixtures) {
  console.log(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}`);
  if (!entry.ok) console.log(entry.error);
}
console.log(`\nCV-3.13 title-list page hydration: ${fixtures.length - failed.length}/${fixtures.length} fixtures passed; ${assertionCount} assertions`);
console.log(`Safety counters: ${JSON.stringify(safety)}`);

if (failed.length) process.exitCode = 1;
