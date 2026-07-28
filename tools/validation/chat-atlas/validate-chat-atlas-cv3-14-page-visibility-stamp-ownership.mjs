#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PAGE_PATH = 'src-runtime-base/1C1b.🔴📑 Thread Pages Controller 📑.js';
const DIVIDER_PATH = 'src-runtime-base/1A1b.🟥🗺️ MiniMap Core 🧱🗺️.js';
const VALIDATOR_PATH = 'tools/validation/chat-atlas/validate-chat-atlas-cv3-14-page-visibility-stamp-ownership.mjs';
const BASE = 'f6d948c9721b9319d1c1c6f7ac1fd037c46bb9c1';
const PAGE_SOURCE = fs.readFileSync(path.join(ROOT, PAGE_PATH), 'utf8');
const DIVIDER_SOURCE = fs.readFileSync(path.join(ROOT, DIVIDER_PATH), 'utf8');
const PARENT_PAGE_SOURCE = execFileSync('git', ['show', `${BASE}:${PAGE_PATH}`], {
  cwd: ROOT,
  encoding: 'utf8',
});

const fixtures = [];
let assertionCount = 0;
const safety = {
  storageWrites: 0,
  preferenceWrites: 0,
  canonicalWrites: 0,
  aliasWrites: 0,
  cacheWrites: 0,
  networkCalls: 0,
  polling: 0,
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

class FakeStyle {
  constructor() { this.values = new Map(); }
  setProperty(name, value) { this.values.set(name, String(value)); }
  removeProperty(name) { this.values.delete(name); }
  getPropertyValue(name) { return this.values.get(name) || ''; }
}

class FakeElement {
  constructor(tag = 'DIV', id = '') {
    this.tagName = tag.toUpperCase();
    this.nodeType = 1;
    this.id = id;
    this.attrs = new Map();
    this.style = new FakeStyle();
    this.children = [];
    this.parentElement = null;
    this.parentNode = null;
    this.isConnected = true;
    this.order = 0;
    this.unmounted = false;
  }
  get nextSibling() {
    if (!this.parentElement) return null;
    const index = this.parentElement.children.indexOf(this);
    return index >= 0 ? (this.parentElement.children[index + 1] || null) : null;
  }
  appendChild(node) {
    node.parentElement = this;
    node.parentNode = this;
    this.children.push(node);
    return node;
  }
  insertBefore(node, before) {
    node.parentElement = this;
    node.parentNode = this;
    const index = before ? this.children.indexOf(before) : -1;
    if (index < 0) this.children.push(node);
    else this.children.splice(index, 0, node);
    return node;
  }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
  hasAttribute(name) { return this.attrs.has(name); }
  removeAttribute(name) { this.attrs.delete(name); }
  contains(node) {
    if (node === this) return true;
    return this.children.some((child) => child.contains(node));
  }
  matches(selector) {
    if (selector.includes('section[data-testid^="conversation-turn"]')) {
      return this.tagName === 'SECTION' && String(this.getAttribute('data-testid') || '').startsWith('conversation-turn');
    }
    if (selector === '[data-h2o-native-ts="1"]') return this.getAttribute('data-h2o-native-ts') === '1';
    if (selector.includes('[data-h2o-title-inline-slot="1"]')) return this.getAttribute('data-h2o-title-inline-slot') === '1';
    if (selector.includes('[data-cgxui="chat-page-title-list-synth"]')) {
      return this.getAttribute('data-cgxui') === 'chat-page-title-list-synth';
    }
    return false;
  }
  querySelectorAll(selector) {
    const out = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (
          (selector.includes('section[data-testid^="conversation-turn"]') && child.matches('section[data-testid^="conversation-turn"]'))
          || (selector.includes('data-cgxui-chat-page-title-list-hidden') && child.hasAttribute('data-cgxui-chat-page-title-list-hidden'))
        ) out.push(child);
        visit(child);
      }
    };
    visit(this);
    return out;
  }
  querySelector(selector) {
    if (this.unmounted && /h2o-unmounted|unmounted-placeholder/.test(selector)) return {};
    return this.querySelectorAll(selector)[0] || null;
  }
  closest(selector) {
    let node = this;
    while (node) {
      if (selector.includes('data-cgxui-chat-page-title-list-hidden') && node.hasAttribute('data-cgxui-chat-page-title-list-hidden')) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }
}

function section(id, order, role = 'user') {
  const node = new FakeElement('SECTION', id);
  node.order = order;
  node.setAttribute('data-testid', `conversation-turn-${order}`);
  node.setAttribute('data-turn', role);
  node.setAttribute('data-turn-id', id);
  return node;
}

function modelForCount(count = 39) {
  const members = Array.from({ length: count }, (_value, index) => {
    const order = index + 1;
    return {
      id: `a-${order}`,
      questionId: `q-${order}`,
      answerId: `a-${order}`,
      turnId: `turn-${order}`,
      aliasIds: [`a-${order}`],
      turnNo: order,
      type: 'answer',
    };
  });
  const pages = [];
  for (let pageNo = 1; pageNo <= Math.ceil(count / 25); pageNo += 1) {
    pages.push({
      pageNo,
      startOrder: ((pageNo - 1) * 25) + 1,
      endOrder: Math.min(count, pageNo * 25),
      turnRecords: members.filter((member) => Math.ceil(member.turnNo / 25) === pageNo),
    });
  }
  return { source: count === 18 ? 'selected-path-overlay' : 'canonical', count, pageCount: pages.length, coherent: true, pages };
}

function createParentMisbindingHarness() {
  const mounted = Array.from({ length: 14 }, (_value, index) => section(`q-${index + 26}`, index + 26));
  const member = { id: 'a-1', answerId: 'a-1', questionId: 'q-1', turnNo: 1, type: 'answer' };
  const api = vm.runInNewContext(`(() => {
    const ATTR_TITLE_LIST_FLOW_HIDDEN = 'data-cgxui-chat-page-title-list-hidden';
    const ATTR_TITLE_STACK_INLINE = 'data-h2o-title-stack-inline';
    const document = {
      body: {},
      querySelectorAll(selector) {
        return selector.includes('[data-turn="user"]') ? injectedMounted : [];
      },
    };
    const Element = injectedElement;
    const turnRecordForTitleListIdentity = () => ({ turnNo: 1, qId: 'q-1', primaryAId: 'a-1' });
    const sectionByAnswerIdForTitleList = () => null;
    const getPreviousTurnHost = () => null;
    const getNextTurnHost = () => null;
    const getTurnHostRole = (node) => String(node?.getAttribute?.('data-turn') || '');
    const getTurnAnchorNode = (node) => node;
    const getTurnSectionForNode = (node) => node;
    const listTurnSections = () => injectedMounted;
    const sameConversationFlow = () => true;
    const restoreInlineTurnToFlow = () => true;
    const getComputedStyle = (node) => ({ display: node.style.getPropertyValue('display') || 'block' });
    ${extractFunction(PARENT_PAGE_SOURCE, 'turnNumberOfSection')}
    ${extractFunction(PARENT_PAGE_SOURCE, 'titleListMemberSections')}
    ${extractFunction(PARENT_PAGE_SOURCE, 'memberSectionCandidates')}
    ${extractFunction(PARENT_PAGE_SOURCE, 'setTitleListFlowAnchorHidden')}
    return Object.freeze({
      sections: titleListMemberSections,
      candidates: memberSectionCandidates,
      hide: setTitleListFlowAnchorHidden,
    });
  })()`, { injectedMounted: mounted, injectedElement: FakeElement });
  return { mounted, member, api };
}

function createOwnershipHarness(count = 39, active = [1]) {
  const model = modelForCount(count);
  const root = new FakeElement('DIV', 'root');
  const page1 = new FakeElement('DIV', 'page-1-wrapper');
  const page2 = new FakeElement('DIV', 'page-2-wrapper');
  root.appendChild(page1);
  root.appendChild(page2);
  const q1 = section('q-1', 1);
  const q26 = section('q-26', 26);
  const q27 = section('q-27', 27);
  page1.appendChild(q1);
  page2.appendChild(q26);
  page2.appendChild(q27);
  const timestamp = new FakeElement('TIME', 'ts-26');
  timestamp.order = 26;
  timestamp.setAttribute('data-h2o-native-ts', '1');
  root.appendChild(timestamp);
  const document = {
    querySelectorAll(selector) {
      if (selector === '[data-cgxui-chat-page-title-list-hidden]') {
        return [root, page1, page2, q1, q26, q27, timestamp].filter((node) => node.hasAttribute('data-cgxui-chat-page-title-list-hidden'));
      }
      return [];
    },
  };
  const activePages = new Set(active);
  const api = vm.runInNewContext(`(() => {
    const ATTR_TITLE_LIST_FLOW_HIDDEN = 'data-cgxui-chat-page-title-list-hidden';
    const ATTR_TITLE_STACK_INLINE = 'data-h2o-title-stack-inline';
    const TURN_HOST_SEL = 'section[data-testid^="conversation-turn"]';
    const document = injectedDocument;
    const buildTitleListPresentationPageModel = () => injectedModel;
    const readTitleListPages = () => injectedActivePages;
    const resolveChatId = () => 'chat';
    const titleListAdjacentTurnOrders = (node) => node.order ? [node.order] : [];
    const restoreInlineTurnToFlow = () => true;
    const getComputedStyle = (node) => ({ display: node.style.getPropertyValue('display') || 'block' });
    ${extractFunction(PAGE_SOURCE, 'clearTitleListFlowHiddenNode')}
    ${extractFunction(PAGE_SOURCE, 'buildTitleListFlowOwnershipSnapshot')}
    ${extractFunction(PAGE_SOURCE, 'classifyTitleListFlowOwnership')}
    ${extractFunction(PAGE_SOURCE, 'reconcileTitleListFlowHiddenArtifacts')}
    ${extractFunction(PAGE_SOURCE, 'setTitleListFlowAnchorHidden')}
    return Object.freeze({
      snapshot: buildTitleListFlowOwnershipSnapshot,
      classify: classifyTitleListFlowOwnership,
      reconcile: reconcileTitleListFlowHiddenArtifacts,
      hide: setTitleListFlowAnchorHidden,
    });
  })()`, { injectedDocument: document, injectedModel: model, injectedActivePages: activePages });
  return { model, root, page1, page2, q1, q26, q27, timestamp, activePages, api };
}

function hidden(node) {
  return node.getAttribute('data-cgxui-chat-page-title-list-hidden') != null
    || node.style.getPropertyValue('display') === 'none';
}

function createRecoveryHarness() {
  const model = modelForCount(39);
  const normalPages = [model.pages[1]];
  const missing = new Set([28, 33]);
  const requested = [];
  const S = {
    titleListHydrationRecoveryIdentity: '',
    titleListHydrationRecoveryIds: new Set(),
  };
  const api = vm.runInNewContext(`(() => {
    const S = injectedState;
    const buildTitleListPresentationPageModel = () => injectedModel;
    const titleListMemberMateriallyPresent = (member) => !injectedMissing.has(Number(member?.turnNo || 0));
    const UM_ADAPTER = () => ({
      requestMountPairByUid(id, reason) {
        injectedRequested.push([id, reason]);
        return true;
      },
    });
    ${extractFunction(PAGE_SOURCE, 'recoverMissingTitleListPageMembers')}
    return Object.freeze({ recover: recoverMissingTitleListPageMembers });
  })()`, {
    injectedState: S,
    injectedModel: model,
    injectedMissing: missing,
    injectedRequested: requested,
  });
  return { model, normalPages, missing, requested, S, api };
}

function createDividerFallbackHarness() {
  const flow = new FakeElement('DIV', 'flow');
  const divider1 = new FakeElement('DIV', 'divider-1');
  divider1.setAttribute('data-page-num', '1');
  const stack1 = new FakeElement('DIV', 'stack-1');
  stack1.setAttribute('data-page-num', '1');
  stack1.setAttribute('data-cgxui', 'chat-page-title-list-synth');
  const tail = new FakeElement('DIV', 'after-stack');
  flow.appendChild(divider1);
  flow.appendChild(stack1);
  flow.appendChild(tail);
  const turns = Array.from({ length: 39 }, (_value, index) => ({
    questionId: `q-${index + 1}`,
    answerId: `a-${index + 1}`,
  }));
  const document = {
    querySelector(selector) {
      if (selector.includes('chat-page-title-list-synth')) return stack1;
      if (selector.includes('data-page-num="1"')) return divider1;
      return null;
    },
  };
  const api = vm.runInNewContext(`(() => {
    const S = { turnList: injectedTurns };
    const document = injectedDocument;
    const getChatPageTurnHost = () => null;
    const sectionByStableId = () => null;
    const getChatPagePairAnchorNode = (node) => node;
    ${extractFunction(DIVIDER_SOURCE, 'getAuthorityDividerParkingPosition')}
    return Object.freeze({ park: getAuthorityDividerParkingPosition });
  })()`, { injectedTurns: turns, injectedDocument: document });
  return { flow, divider1, stack1, tail, api };
}

await fixture('parent f6 reproduces the exact Page 1 to Page 2 misbinding', () => {
  const h = createParentMisbindingHarness();
  const resolved = h.api.sections(h.member);
  equal(resolved.questionSection, h.mounted[0], 'parent maps missing q-1 to mounted q-26');
  equal(resolved.questionSection.order, 26, 'misbound section is canonical order 26');
  h.api.hide(resolved.questionSection, 1, true);
  equal(resolved.questionSection.getAttribute('data-cgxui-chat-page-title-list-hidden'), '1', 'parent writes Page 1 marker on Page 2');
  equal(hidden(resolved.questionSection), true, 'parent reproduction is visibly hidden');
  equal(PAGE_SOURCE.includes('questionSections[turnNo - 1]'), false, 'current resolver removed ordinal subset fallback');
  equal(PAGE_SOURCE.includes('sorted[member.turnNo - 1]'), false, 'candidate resolver removed ordinal subset fallback');
  equal(PAGE_SOURCE.includes('Hydration must restore the exact identity instead'), true, 'source documents exact identity ownership');
});

await fixture('cleanup removes Page 1 markers directly from Page 2 sections', () => {
  const h = createOwnershipHarness();
  h.q26.setAttribute('data-cgxui-chat-page-title-list-hidden', '1');
  h.q26.style.setProperty('display', 'none');
  const result = h.api.reconcile(h.model, h.activePages);
  equal(hidden(h.q26), false, 'Page 2 section is released');
  equal(result.wrongOwnerReleased, 1, 'wrong owner release is counted');
  equal(result.released, 1, 'one stale direct marker is removed');
});

await fixture('cleanup removes Page 1 markers from mixed ancestors', () => {
  const h = createOwnershipHarness();
  h.root.setAttribute('data-cgxui-chat-page-title-list-hidden', '1');
  h.root.style.setProperty('display', 'none');
  const result = h.api.reconcile(h.model, h.activePages);
  equal(h.api.classify(h.root, h.api.snapshot(h.model)).kind, 'mixed', 'shared root is mixed');
  equal(hidden(h.root), false, 'mixed root marker is removed');
  equal(result.mixedReleased, 1, 'mixed cleanup is counted');
});

await fixture('mixed wrappers are never restamped', () => {
  const h = createOwnershipHarness();
  equal(h.api.hide(h.root, 1, true), false, 'strict writer rejects mixed root');
  equal(h.root.hasAttribute('data-cgxui-chat-page-title-list-hidden'), false, 'mixed root remains unstamped');
  equal(hidden(h.q26), false, 'Page 2 descendant remains visible');
});

await fixture('Page 1-only descendants retain valid Page 1 ownership', () => {
  const h = createOwnershipHarness();
  equal(h.api.hide(h.page1, 1, true), true, 'Page 1 wrapper accepts Page 1 marker');
  equal(h.page1.getAttribute('data-cgxui-chat-page-title-list-hidden'), '1', 'marker owner is Page 1');
  const cleanup = h.api.reconcile(h.model, h.activePages);
  equal(cleanup.kept, 1, 'valid active marker is preserved');
  equal(hidden(h.page1), true, 'Page 1 remains hidden');
});

await fixture('Page 2-only descendants cannot receive Page 1 ownership', () => {
  const h = createOwnershipHarness();
  equal(h.api.hide(h.page2, 1, true), false, 'Page 2 wrapper rejects Page 1 marker');
  equal(hidden(h.page2), false, 'Page 2 wrapper remains visible');
  equal(h.api.classify(h.page2, h.api.snapshot(h.model)).pageNo, 2, 'exact ownership is Page 2');
});

await fixture('Observer remount cannot preserve a formerly single-page ancestor stamp', () => {
  const h = createOwnershipHarness();
  h.root.children = [h.page1];
  h.page1.parentElement = h.root;
  h.api.hide(h.root, 1, true);
  equal(hidden(h.root), true, 'root is initially Page 1-only and hidden');
  h.root.appendChild(h.page2);
  const repair = h.api.reconcile(h.model, h.activePages);
  equal(repair.mixedReleased, 1, 'remount repair recognizes new mixed ownership');
  equal(hidden(h.root), false, 'remount repair releases ancestor before paint');
});

await fixture('no-answer marker is boolean metadata and does not hide Page 2', () => {
  const h = createOwnershipHarness();
  h.q26.setAttribute('data-cgxui-chat-page-no-answer', '1');
  equal(hidden(h.q26), false, 'boolean no-answer metadata does not hide section');
  equal(PAGE_SOURCE.includes("setAttribute(ATTR_CHAT_PAGE_NO_ANSWER, '1')"), false, 'Thread Pages does not write MiniMap no-answer metadata');
  equal(/\[data-cgxui-chat-page-no-answer=\"1\"\]\s*\{\s*display:\s*none/i.test(DIVIDER_SOURCE), false, 'divider source has no whole-section no-answer hide rule');
  equal(h.api.hide(h.q26, 1, true), false, 'no-answer metadata cannot change exact Page 2 ownership');
});

await fixture('missing orders 28 and 33 receive one bounded recovery request', () => {
  const h = createRecoveryHarness();
  const result = h.api.recover(h.normalPages, h.model, { status: 'guarded-unchanged' });
  equal(result.missingOrders, [28, 33], 'exact missing orders are identified');
  equal(result.requested, 2, 'two recovery requests are issued');
  equal(h.requested.map(([id]) => id), ['q-28', 'q-33'], 'requests use exact qId identities');
  equal(result.pending, 2, 'two in-memory requests are pending');
  const repeated = h.api.recover(h.normalPages, h.model, { status: 'guarded-unchanged' });
  equal(repeated.requested, 0, 'same missing identities are not requested twice');
  equal(h.requested.length, 2, 'recovery request log remains bounded');
});

await fixture('all Page 2 orders become materially represented after recovery', () => {
  const h = createRecoveryHarness();
  h.api.recover(h.normalPages, h.model, { status: 'guarded-unchanged' });
  h.missing.clear();
  const result = h.api.recover(h.normalPages, h.model, { status: 'guarded-unchanged' });
  equal(result.represented, 14, 'all orders 26..39 are materially represented');
  equal(result.missing, 0, 'no Page 2 order remains missing');
  equal(result.pending, 0, 'fulfilled requests leave no pending identity');
});

await fixture('Page 2 divider parks without mounted turn 26 or Page 1 tail', () => {
  const h = createDividerFallbackHarness();
  const parking = h.api.park(2);
  ok(parking.parent === h.flow, 'parking uses the existing authority page unit');
  ok(parking.before === h.tail, 'Page 2 divider lands after Page 1 title stack');
  equal(parking.mode, 'authority-previous-page-unit', 'fallback mode is explicit');
  equal(h.api.park(3), null, 'no phantom Page 3 parking exists');
});

await fixture('turn 26 remount reanchors without duplicate divider ownership', () => {
  equal(DIVIDER_SOURCE.includes('forcePlaceDividerBeforeTurnWrapper(divider, pageNum)'), true, 'existing exact reanchor remains');
  equal(DIVIDER_SOURCE.includes('for (const d of qq(`.cgxui-chat-page-divider'), true, 'core divider dedup remains');
  equal(DIVIDER_SOURCE.includes("data-h2o-divider-authority-parked"), true, 'parked state is removed at exact reanchor');
  equal(DIVIDER_SOURCE.includes("parking.mode || 'authority-parked'"), true, 'parking identity is stamped once');
});

await fixture('Refresh cleanup precedes hydration and reprojection', () => {
  const syncAnchor = PAGE_SOURCE.indexOf("function syncActiveTitleListsNow(reason = 'presentation-updated')");
  const syncBody = PAGE_SOURCE.slice(syncAnchor, syncAnchor + 1800);
  ok(syncBody.indexOf('reconcileTitleListFlowHiddenArtifacts') < syncBody.indexOf('reconcileTitleListPageHydration'), 'stamp cleanup precedes hydration');
  ok(syncBody.indexOf('reconcileTitleListPageHydration') < syncBody.indexOf('syncSyntheticTitleList'), 'hydration precedes reprojection');
  equal(PAGE_SOURCE.includes("syncActiveTitleListsNow('observer-hub-remount')"), true, 'Observer Hub uses the same ordering');
});

await fixture('selected count 18 removes Page 2 ownership', () => {
  const h = createOwnershipHarness(18, [1]);
  h.q26.setAttribute('data-cgxui-chat-page-title-list-hidden', '1');
  h.q26.style.setProperty('display', 'none');
  const result = h.api.reconcile(h.model, h.activePages);
  equal(h.model.pageCount, 1, 'selected authority has one page');
  equal(result.foreignReleased, 1, 'out-of-authority Page 2 section is released from stale Page 1 stamp');
  equal(hidden(h.q26), false, 'stale Page 2 node is not retained by title-list ownership');
});

await fixture('canonical return restores Page 2 ownership and divider authority', () => {
  const selected = createOwnershipHarness(18, [1]);
  selected.q26.setAttribute('data-cgxui-chat-page-title-list-hidden', '1');
  selected.api.reconcile(selected.model, selected.activePages);
  const canonical = createOwnershipHarness(39, [1]);
  equal(canonical.api.classify(canonical.page2, canonical.api.snapshot(canonical.model)).pageNo, 2, 'canonical Page 2 exact ownership returns');
  equal(canonical.model.pageCount, 2, 'canonical page count returns to two');
  equal(DIVIDER_SOURCE.includes('for (let n = 1; n <= authPageCount; n += 1) renderPageNums.add(n);'), true, 'divider renderer recreates every authority page');
});

await fixture('explicit Page 2 collapse uses marker 2 only', () => {
  const h = createOwnershipHarness(39, [2]);
  equal(h.api.hide(h.page2, 2, true), true, 'Page 2 accepts its own marker');
  equal(h.page2.getAttribute('data-cgxui-chat-page-title-list-hidden'), '2', 'marker is exactly 2');
  equal(h.api.hide(h.page2, 1, true), false, 'Page 1 cannot steal the marker');
  equal(h.page2.getAttribute('data-cgxui-chat-page-title-list-hidden'), '2', 'valid independently collapsed Page 2 marker is preserved');
});

await fixture('independent Page 1 and Page 2 states never steal stamps', () => {
  const h = createOwnershipHarness(39, [1, 2]);
  h.api.hide(h.page1, 1, true);
  h.api.hide(h.page2, 2, true);
  const result = h.api.reconcile(h.model, h.activePages);
  equal(result.kept, 2, 'both valid independent markers remain');
  equal(h.page1.getAttribute('data-cgxui-chat-page-title-list-hidden'), '1', 'Page 1 retains marker 1');
  equal(h.page2.getAttribute('data-cgxui-chat-page-title-list-hidden'), '2', 'Page 2 retains marker 2');
});

await fixture('timestamp visibility follows exact visible owner page', () => {
  const h = createOwnershipHarness();
  h.timestamp.setAttribute('data-cgxui-chat-page-title-list-hidden', '1');
  h.timestamp.style.setProperty('display', 'none');
  const result = h.api.reconcile(h.model, h.activePages);
  equal(result.wrongOwnerReleased, 1, 'Page 1 timestamp marker is rejected for order 26');
  equal(hidden(h.timestamp), false, 'Page 2 timestamp is visible');
  equal(h.api.classify(h.timestamp, h.api.snapshot(h.model)).pageNo, 2, 'timestamp ownership follows order 26');
});

await fixture('repeated cleanup/projection is idempotent', () => {
  const h = createOwnershipHarness();
  h.page1.setAttribute('data-cgxui-chat-page-title-list-hidden', '1');
  h.page1.style.setProperty('display', 'none');
  h.q26.setAttribute('data-cgxui-chat-page-title-list-hidden', '1');
  h.q26.style.setProperty('display', 'none');
  const first = h.api.reconcile(h.model, h.activePages);
  const second = h.api.reconcile(h.model, h.activePages);
  equal(first.released, 1, 'first pass releases one cross-page stamp');
  equal(second.released, 0, 'second pass performs no repeated cleanup');
  equal(second.kept, 1, 'valid Page 1 marker remains stable');
  equal(hidden(h.q26), false, 'Page 2 remains visible');
});

await fixture('safety counters remain zero', () => {
  const diffs = [PAGE_PATH, DIVIDER_PATH].map((file) => execFileSync(
    'git',
    ['diff', '--unified=0', BASE, '--', file],
    { cwd: ROOT, encoding: 'utf8' },
  )).join('\n');
  const added = diffs.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')).join('\n');
  equal(/\bfetch\s*\(/.test(added), false, 'no network call');
  equal(/\bsetInterval\s*\(/.test(added), false, 'no polling interval');
  equal(/\bnew\s+MutationObserver\b/.test(added), false, 'no broad observer');
  equal(/\bsetTimeout\s*\(/.test(added), false, 'no repeating or general timer');
  equal(/localStorage\.(?:setItem|removeItem|clear)\s*\(/.test(added), false, 'no storage write');
  equal(/sessionStorage\.(?:setItem|removeItem|clear)\s*\(/.test(added), false, 'no cache write');
  equal(/canonical.*(?:set|write|mutat)/i.test(added), false, 'no canonical write');
  equal(/alias(?:es)?\.(?:set|write|delete)/i.test(added), false, 'no alias write');
  equal(/\.remove\(\)/.test(added), false, 'no destructive host removal');
  equal(/getEffectivePresentation(?:Index|Status)/.test(added), false, 'no selected-path proof redesign');
  equal(/Side Actions|side-actions/i.test(added), false, 'no Side Actions change');
});

await fixture('scope is limited to approved page and divider ownership', () => {
  const changedTracked = execFileSync('git', ['diff', '--name-only', '-z', BASE], {
    cwd: ROOT,
    encoding: 'utf8',
  }).split('\0').filter(Boolean);
  const changedUntracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).split('\0').filter(Boolean);
  const changed = Array.from(new Set([...changedTracked, ...changedUntracked])).sort();
  equal(changed, [PAGE_PATH, DIVIDER_PATH, VALIDATOR_PATH].sort(), 'only Thread Pages, divider owner, and CV-3.14 change');
  equal(PAGE_SOURCE.includes('reconcileTitleListFlowHiddenArtifacts'), true, 'cleanup owner is Thread Pages');
  equal(DIVIDER_SOURCE.includes('authority-previous-page-unit'), true, 'supporting change is divider durability only');
});

for (const key of Object.keys(safety)) equal(safety[key], 0, `safety counter ${key} remains zero`);

const failed = fixtures.filter((entry) => !entry.ok);
for (const entry of fixtures) {
  console.log(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}`);
  if (!entry.ok) console.log(entry.error);
}
console.log(`\nCV-3.14 page visibility stamp ownership: ${fixtures.length - failed.length}/${fixtures.length} fixtures passed; ${assertionCount} assertions`);
console.log(`Safety counters: ${JSON.stringify(safety)}`);

if (failed.length) process.exitCode = 1;
