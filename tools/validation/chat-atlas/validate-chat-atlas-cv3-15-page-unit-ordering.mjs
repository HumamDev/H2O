#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CORE_PATH = 'src-runtime-base/1A1b.🟥🗺️ MiniMap Core 🧱🗺️.js';
const PAGINATION_PATH = 'src-runtime-base/0C1b.⚫️🪟 Pagination Windowing (Chat 🔗 Adapter) 🪟.js';
const PAGE_PATH = 'src-runtime-base/1C1b.🔴📑 Thread Pages Controller 📑.js';
const UNMOUNT_PATH = 'src-runtime-base/0C2b.⚫️⛰️ Unmount Messages (Chat 🔗 Adapter) ⛰️.js';
const BASE = '527e228adecb458eabf3a5e1ccdc08973149419d';
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
const PAGINATION_SOURCE = fs.readFileSync(path.join(ROOT, PAGINATION_PATH), 'utf8');
const PAGE_SOURCE = fs.readFileSync(path.join(ROOT, PAGE_PATH), 'utf8');
const UNMOUNT_SOURCE = fs.readFileSync(path.join(ROOT, UNMOUNT_PATH), 'utf8');
const PARENT_CORE_SOURCE = execFileSync('git', ['show', `${BASE}:${CORE_PATH}`], {
  cwd: ROOT,
  encoding: 'utf8',
});

const fixtures = [];
let assertionCount = 0;

function equal(actual, expected, message) {
  assertionCount += 1;
  assert.deepEqual(actual, expected, message);
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

class FakeElement {
  constructor(tagName = 'DIV') {
    this.tagName = String(tagName).toUpperCase();
    this.nodeType = 1;
    this.children = [];
    this.parentNode = null;
    this.parentElement = null;
    this.attrs = new Map();
    this.className = '';
    this.style = {
      values: new Map(),
      setProperty: (name, value) => this.style.values.set(name, String(value)),
      removeProperty: (name) => this.style.values.delete(name),
      getPropertyValue: (name) => this.style.values.get(name) || '',
    };
    this.isConnected = true;
    this.innerHTML = '';
    this.hostOwned = false;
    this.removeGuard = null;
  }
  get classList() {
    return {
      contains: (value) => String(this.className || '').split(/\s+/).includes(String(value)),
    };
  }
  get firstChild() { return this.children[0] || null; }
  get firstElementChild() { return this.firstChild; }
  get nextSibling() {
    if (!this.parentNode) return null;
    const index = this.parentNode.children.indexOf(this);
    return index >= 0 ? (this.parentNode.children[index + 1] || null) : null;
  }
  get nextElementSibling() { return this.nextSibling; }
  get previousElementSibling() {
    if (!this.parentNode) return null;
    const index = this.parentNode.children.indexOf(this);
    return index > 0 ? this.parentNode.children[index - 1] : null;
  }
  appendChild(node) { return this.insertBefore(node, null); }
  removeChild(node) {
    if (node?.hostOwned && typeof node.removeGuard === 'function') return node.removeGuard(node);
    const index = this.children.indexOf(node);
    if (index < 0) throw new Error('NotFoundError');
    this.children.splice(index, 1);
    node.parentNode = null;
    node.parentElement = null;
    node.isConnected = false;
    return node;
  }
  insertBefore(node, before) {
    if (node.parentNode) {
      const oldIndex = node.parentNode.children.indexOf(node);
      if (oldIndex >= 0) node.parentNode.children.splice(oldIndex, 1);
    }
    const index = before ? this.children.indexOf(before) : -1;
    if (index < 0) this.children.push(node);
    else this.children.splice(index, 0, node);
    node.parentNode = this;
    node.parentElement = this;
    node.isConnected = true;
    return node;
  }
  remove() {
    if (this.hostOwned && typeof this.removeGuard === 'function') return this.removeGuard(this);
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
    this.parentElement = null;
    this.isConnected = false;
  }
  setAttribute(name, value) { this.attrs.set(String(name), String(value)); }
  getAttribute(name) { return this.attrs.has(String(name)) ? this.attrs.get(String(name)) : null; }
  hasAttribute(name) { return this.attrs.has(String(name)); }
  removeAttribute(name) { this.attrs.delete(String(name)); }
  addEventListener() {}
  removeEventListener() {}
  matches(selector) { return matchesSelector(this, selector); }
  querySelectorAll(selector) { return queryAll(this, selector, false); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) {
    let node = this;
    while (node) {
      if (node.matches?.(selector)) return node;
      node = node.parentElement;
    }
    return null;
  }
  compareDocumentPosition(other) {
    const root = topRoot(this);
    const flat = flatten(root);
    const a = flat.indexOf(this);
    const b = flat.indexOf(other);
    if (a < 0 || b < 0 || a === b) return 0;
    return a < b ? 4 : 2;
  }
}

function topRoot(node) {
  let current = node;
  while (current?.parentNode) current = current.parentNode;
  return current;
}

function flatten(root) {
  const out = [];
  const visit = (node) => {
    out.push(node);
    for (const child of node.children || []) visit(child);
  };
  if (root) visit(root);
  return out;
}

function attrConditions(selector) {
  return Array.from(String(selector).matchAll(/\[([^\]=~^$*]+)(?:([\^$*]?=)"([^"]*)")?\]/g))
    .map((match) => ({ name: match[1], op: match[2] || '', value: match[3] || '' }));
}

function matchesSimple(node, selector) {
  const text = String(selector || '').trim();
  if (!text) return false;
  const tag = text.match(/^[a-zA-Z]+/)?.[0] || '';
  if (tag && node.tagName !== tag.toUpperCase()) return false;
  const id = text.match(/#([A-Za-z0-9_-]+)/)?.[1] || '';
  if (id && String(node.getAttribute('id') || '') !== id) return false;
  for (const cls of Array.from(text.matchAll(/\.([A-Za-z0-9_-]+)/g)).map((match) => match[1])) {
    if (!node.classList.contains(cls)) return false;
  }
  for (const condition of attrConditions(text)) {
    const actual = node.getAttribute(condition.name);
    if (!condition.op && actual == null) return false;
    if (condition.op === '=' && actual !== condition.value) return false;
    if (condition.op === '^=' && !String(actual || '').startsWith(condition.value)) return false;
  }
  return true;
}

function matchesSelector(node, selector) {
  return String(selector).split(',').some((part) => matchesSimple(node, part.trim().replace(/^:scope\s*>\s*/, '')));
}

function queryAll(root, selector, includeRoot = true) {
  const out = [];
  const visit = (node, include) => {
    if (include && matchesSelector(node, selector)) out.push(node);
    for (const child of node.children || []) visit(child, true);
  };
  visit(root, includeRoot);
  return out;
}

function createParentHarness() {
  const flow = new FakeElement('DIV');
  flow.setAttribute('id', 'thread-flow');
  const turn1Wrap = new FakeElement('DIV');
  turn1Wrap.setAttribute('data-harness-node', 'turn-1-wrapper');
  const turn1 = new FakeElement('SECTION');
  turn1.setAttribute('data-testid', 'conversation-turn-1');
  turn1.setAttribute('data-turn', 'user');
  turn1Wrap.appendChild(turn1);
  flow.appendChild(turn1Wrap);

  const document = {
    documentElement: new FakeElement('HTML'),
    createElement: (tagName) => new FakeElement(tagName),
    querySelectorAll: (selector) => queryAll(flow, selector, true),
    querySelector: (selector) => queryAll(flow, selector, true)[0] || null,
  };
  const S = {
    turnList: Array.from({ length: 39 }, (_unused, index) => ({
      turnNo: index + 1,
      qId: `q-${index + 1}`,
      questionId: `q-${index + 1}`,
      primaryAId: `a-${index + 1}`,
    })),
  };
  const callbacks = [];
  const api = vm.runInNewContext(`(() => {
    const document = injectedDocument;
    const S = injectedState;
    const Node = { DOCUMENT_POSITION_FOLLOWING: 4 };
    const Element = injectedElement;
    const W = {
      setTimeout(fn) { return 1; },
      clearTimeout() {},
    };
    const UI_TOK = { OWNER: 'mm' };
    const ATTR_CHAT_PAGE_DIVIDER = 'data-cgxui-chat-page-divider';
    const ATTR_CHAT_PAGE_DIVIDERS = 'data-cgxui-page-dividers';
    const PERF = {
      paths: { renderChatPageDividers: {} },
      dividerUi: {},
    };
    let dividerRenderInFlight = false;
    const requestAnimationFrame = (fn) => { injectedCallbacks.push(fn); return injectedCallbacks.length; };
    const qq = (selector, root = document) => Array.from(root.querySelectorAll(selector));
    const escAttr = (value) => String(value);
    const resolveChatId = () => 'chat';
    const bindDividerScrollRepairOnce = () => {};
    const bindDividerOrderObserverOnce = () => {};
    const enterPerfOwner = () => false;
    const exitPerfOwner = () => {};
    const perfNow = () => 0;
    const getPaginationState = () => ({ booted: false, renderedOnce: false });
    const buildChatPageSections = () => ({ sections: new Map() });
    const syncNoAnswerTitleBars = () => {};
    const getChatPageSectionCollapsedState = () => false;
    const getTurnPageBand = () => 'normal';
    const setChatPageDividerDomState = () => {};
    const noteNodeLifecycle = () => {};
    const noteRenderUnit = () => {};
    const recordDuration = () => {};
    const noteSummaryBucket = () => {};
    const getChatPageDividersEnabled = () => true;
    const getPreviousChatPageAnchorHost = () => null;
    const applyChatPageDividerGeometry = () => {};
    const applyChatPageDividerVisuals = () => {};
    const getChatPageTurnHost = () => null;
    const sectionByStableId = () => null;
    const getChatPagePairAnchorNode = (host) => host?.parentElement || host || null;
    ${extractFunction(PARENT_CORE_SOURCE, 'createChatPageDivider')}
    ${extractFunction(PARENT_CORE_SOURCE, 'isDividerPassThroughEl')}
    ${extractFunction(PARENT_CORE_SOURCE, 'getNextTurnTestIdAfterDivider')}
    ${extractFunction(PARENT_CORE_SOURCE, 'getPageStartTurnWrapper')}
    ${extractFunction(PARENT_CORE_SOURCE, 'getAuthorityDividerParkingPosition')}
    ${extractFunction(PARENT_CORE_SOURCE, 'forcePlaceDividerBeforeTurnWrapper')}
    ${extractFunction(PARENT_CORE_SOURCE, 'renderChatPageDividers')}
    return Object.freeze({
      render: renderChatPageDividers,
      order() {
        return injectedFlow.children.map((node) => {
          if (node.classList?.contains('cgxui-chat-page-divider')) {
            return 'PAGE-' + node.getAttribute('data-page-num');
          }
          if (node.getAttribute?.('data-cgxui') === 'chat-page-title-list-synth') return 'LIST-1';
          if (node.getAttribute?.('data-harness-node') === 'turn-1-wrapper') return 'TURN-1';
          return 'OTHER';
        });
      },
    });
  })()`, {
    injectedDocument: document,
    injectedState: S,
    injectedFlow: flow,
    injectedCallbacks: callbacks,
    injectedElement: FakeElement,
  });
  return { api, flow, callbacks };
}

function createFixedHarness({
  count = 39,
  representedOrders = Array.from({ length: count }, (_unused, index) => index + 1),
} = {}) {
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
    destructiveHostRemovals: 0,
    hydrationRequests: 0,
  };
  const flow = new FakeElement('DIV');
  flow.setAttribute('id', 'thread-flow');
  const sections = new Map();
  const wrappers = new Map();
  const makeTurn = (order) => {
    const wrapper = new FakeElement('DIV');
    wrapper.setAttribute('data-harness-node', `turn-${String(order)}-wrapper`);
    wrapper.setAttribute('data-order', String(order));
    wrapper.hostOwned = true;
    wrapper.removeGuard = () => {
      safety.destructiveHostRemovals += 1;
      throw new Error('destructive-host-wrapper-remove');
    };
    const section = new FakeElement('SECTION');
    section.setAttribute('data-testid', `conversation-turn-${String(((order - 1) * 2) + 1)}`);
    section.setAttribute('data-turn', 'user');
    section.setAttribute('data-turn-id', `q-${String(order)}`);
    section.hostOwned = true;
    section.removeGuard = () => {
      safety.destructiveHostRemovals += 1;
      throw new Error('destructive-host-section-remove');
    };
    wrapper.appendChild(section);
    wrappers.set(order, wrapper);
    sections.set(`q-${String(order)}`, section);
    return wrapper;
  };
  for (const order of representedOrders) flow.appendChild(makeTurn(order));

  const document = {
    documentElement: new FakeElement('HTML'),
    createElement: (tagName) => new FakeElement(tagName),
    querySelectorAll: (selector) => queryAll(flow, selector, true),
    querySelector: (selector) => queryAll(flow, selector, true)[0] || null,
  };
  const S = {
    turnList: Array.from({ length: count }, (_unused, index) => ({
      order: index + 1,
      turnNo: index + 1,
      qId: `q-${index + 1}`,
      questionId: `q-${index + 1}`,
      primaryAId: `a-${index + 1}`,
      answerId: `a-${index + 1}`,
      turnId: `turn:q-${index + 1}`,
    })),
  };
  const callbacks = [];
  const api = vm.runInNewContext(`(() => {
    const document = injectedDocument;
    const S = injectedState;
    const Node = { DOCUMENT_POSITION_FOLLOWING: 4, DOCUMENT_POSITION_PRECEDING: 2 };
    const Element = injectedElement;
    const W = {
      location: { pathname: '/c/chat' },
      setTimeout(fn) { return 1; },
      clearTimeout() {},
    };
    const UI_TOK = { OWNER: 'mm' };
    const ATTR_CHAT_PAGE_DIVIDER = 'data-cgxui-chat-page-divider';
    const ATTR_CHAT_PAGE_DIVIDERS = 'data-cgxui-page-dividers';
    const ATTR_CHAT_PAGE_NUM = 'data-cgxui-chat-page-num';
    const CHAT_PAGE_BOUNDARY_ATTR = 'data-h2o-chat-page-boundary';
    const CHAT_PAGE_BOUNDARY_PAGE_ATTR = 'data-h2o-chat-page-boundary-page';
    const CHAT_PAGE_BOUNDARY_KIND_ATTR = 'data-h2o-chat-page-boundary-kind';
    const CHAT_PAGE_UNIT_OWNER = '1A1b:reconcileChatPageUnits';
    const PERF = {
      paths: { renderChatPageDividers: {} },
      dividerUi: {},
    };
    let dividerRenderInFlight = false;
    const requestAnimationFrame = (fn) => { injectedCallbacks.push(fn); return injectedCallbacks.length; };
    const qq = (selector, root = document) => Array.from(root.querySelectorAll(selector));
    const escAttr = (value) => String(value);
    const resolveChatId = () => 'chat';
    const bindDividerScrollRepairOnce = () => {};
    const bindDividerOrderObserverOnce = () => {};
    const enterPerfOwner = () => false;
    const exitPerfOwner = () => {};
    const perfNow = () => 0;
    const getPaginationState = () => ({ booted: false, renderedOnce: false });
    const buildChatPageSections = () => ({ sections: new Map() });
    const syncNoAnswerTitleBars = () => {};
    const getChatPageSectionCollapsedState = () => false;
    const getTurnPageBand = () => 'normal';
    const setChatPageDividerDomState = (divider, _collapsed, pageNum) => {
      divider.setAttribute('data-page-num', String(pageNum));
      divider.setAttribute('data-cgxui-chat-page-num', String(pageNum));
    };
    const noteNodeLifecycle = () => {};
    const noteRenderUnit = () => {};
    const recordDuration = () => {};
    const noteSummaryBucket = () => {};
    const getChatPageDividersEnabled = () => true;
    const getPreviousChatPageAnchorHost = () => null;
    const applyChatPageDividerGeometry = () => {};
    const applyChatPageDividerVisuals = () => {};
    const sectionByStableId = (id) => injectedSections.get(String(id || '')) || null;
    const getChatPageTurnHost = (turn) => sectionByStableId(turn?.questionId || turn?.qId || '');
    const getChatPagePairAnchorNode = (host) => host?.parentElement || host || null;
    const getEffectivePresentationRuntimeStatus = () => {
      const count = Number(S.turnList.length || 0);
      return Object.freeze({
        source: count === 18 ? 'selected-path-overlay' : 'canonical',
        overlayActive: count === 18,
        count,
        canonicalFingerprint: 'canonical-39',
        anchorQId: count === 18 ? 'q-17' : null,
        pathLength: count === 18 ? 18 : 0,
      });
    };
    const UM_PUBLIC = () => ({
      requestMountPairByUid() {
        injectedSafety.hydrationRequests += 1;
        return true;
      },
      requestMountByUid() {
        injectedSafety.hydrationRequests += 1;
        return true;
      },
    });
    ${extractFunction(CORE_SOURCE, 'createChatPageDivider')}
    ${extractFunction(CORE_SOURCE, 'isDividerPassThroughEl')}
    ${extractFunction(CORE_SOURCE, 'getNextTurnTestIdAfterDivider')}
    ${extractFunction(CORE_SOURCE, 'getPageStartTurnWrapper')}
    ${extractFunction(CORE_SOURCE, 'getChatPageUnitState')}
    ${extractFunction(CORE_SOURCE, 'chatPageUnitIdentity')}
    ${extractFunction(CORE_SOURCE, 'chatPageRecordOrder')}
    ${extractFunction(CORE_SOURCE, 'resolveChatPageExactArtifact')}
    ${extractFunction(CORE_SOURCE, 'getChatPageTitleListRoot')}
    ${extractFunction(CORE_SOURCE, 'buildChatPageUnitModel')}
    ${extractFunction(CORE_SOURCE, 'createChatPageBoundarySentinel')}
    ${extractFunction(CORE_SOURCE, 'ensureChatPageBoundarySentinels')}
    ${extractFunction(CORE_SOURCE, 'compareChatPageNodes')}
    ${CORE_SOURCE.includes('function resolveChatPageTerminalArtifact(') ? extractFunction(CORE_SOURCE, 'resolveChatPageTerminalArtifact') : ''}
    ${extractFunction(CORE_SOURCE, 'resolveChatPageBoundaryAnchor')}
    ${extractFunction(CORE_SOURCE, 'requestChatPageUnitHydration')}
    ${extractFunction(CORE_SOURCE, 'getActualThreadPageDividers')}
    ${extractFunction(CORE_SOURCE, 'pageNumberOfThreadDivider')}
    ${extractFunction(CORE_SOURCE, 'removeH2OChatPageUnitNode')}
    ${extractFunction(CORE_SOURCE, 'detachDeferredChatPageDivider')}
    ${extractFunction(CORE_SOURCE, 'enforceChatPageUnitOrder')}
    function getCompleteIndexProjectionStatus() {
      return {
        trustedSelectionIntentActive: false,
        branchSelectionStale: false,
        selectedPathRequestLeaseActive: false,
        selectedPathConfirmationLeaseActive: false,
        selectedPathConfirmationPending: false,
      };
    }
    ${CORE_SOURCE.match(/const CHAT_PAGE_BOUNDARY_SENTINEL_VALUE = .+;/) ? CORE_SOURCE.match(/const CHAT_PAGE_BOUNDARY_SENTINEL_VALUE = .+;/)[0] : ''}
    ${CORE_SOURCE.includes('function isOwnedChatPageBoundarySentinel(') ? extractFunction(CORE_SOURCE, 'isOwnedChatPageBoundarySentinel') : ''}
    ${CORE_SOURCE.includes('function chatPageUnitBranchTransitionActive(') ? extractFunction(CORE_SOURCE, 'chatPageUnitBranchTransitionActive') : ''}
    ${CORE_SOURCE.includes('function chatPageUnitPresentationCoherence(') ? extractFunction(CORE_SOURCE, 'chatPageUnitPresentationCoherence') : ''}
    ${CORE_SOURCE.includes('function withdrawChatPageUnits(') ? extractFunction(CORE_SOURCE, 'withdrawChatPageUnits') : ''}
    ${extractFunction(CORE_SOURCE, 'reconcileChatPageUnits')}
    ${extractFunction(CORE_SOURCE, 'renderChatPageDividers')}
    const meaningfulOrder = () => injectedFlow.children.map((node) => {
      if (node.classList?.contains('cgxui-chat-page-divider') || node.classList?.contains('cgxui-pgnw-page-divider')) {
        return 'PAGE-' + node.getAttribute('data-page-num');
      }
      if (node.getAttribute?.('data-cgxui') === 'chat-page-title-list-synth') {
        return 'LIST-' + node.getAttribute('data-page-num');
      }
      const order = Number(node.getAttribute?.('data-order') || 0);
      return order ? 'TURN-' + String(order) : '';
    }).filter(Boolean);
    return Object.freeze({
      render: renderChatPageDividers,
      reconcile: reconcileChatPageUnits,
      model: buildChatPageUnitModel,
      diagnostics: () => getChatPageUnitState().last,
      meaningfulOrder,
      createDivider(pageNum, family = 'core') {
        const divider = createChatPageDivider(pageNum, 'normal');
        if (family === 'pagination') divider.className = 'cgxui-pgnw-page-divider';
        injectedFlow.appendChild(divider);
        return divider;
      },
      addTitleList(pageNum) {
        const list = document.createElement('div');
        list.className = 'cgxui-chat-page-title-list-synth';
        list.setAttribute('data-cgxui', 'chat-page-title-list-synth');
        list.setAttribute('data-page-num', String(pageNum));
        injectedFlow.appendChild(list);
        return list;
      },
      setCount(nextCount) {
        const next = Math.max(0, Number(nextCount || 0) || 0);
        S.turnList = Array.from({ length: next }, (_unused, index) => ({
          order: index + 1,
          turnNo: index + 1,
          qId: 'q-' + String(index + 1),
          questionId: 'q-' + String(index + 1),
          primaryAId: 'a-' + String(index + 1),
          answerId: 'a-' + String(index + 1),
          turnId: 'turn:q-' + String(index + 1),
        }));
      },
      dividerCount(pageNum) {
        return getActualThreadPageDividers().filter((divider) => pageNumberOfThreadDivider(divider) === pageNum).length;
      },
      sentinelCount() {
        return document.querySelectorAll('[data-h2o-chat-page-boundary]').length;
      },
    });
  })()`, {
    injectedDocument: document,
    injectedState: S,
    injectedFlow: flow,
    injectedCallbacks: callbacks,
    injectedElement: FakeElement,
    injectedSections: sections,
    injectedSafety: safety,
  });
  const detach = (order) => {
    const wrapper = wrappers.get(order);
    if (!wrapper?.parentNode) return false;
    const parent = wrapper.parentNode;
    const index = parent.children.indexOf(wrapper);
    if (index >= 0) parent.children.splice(index, 1);
    wrapper.parentNode = null;
    wrapper.parentElement = null;
    wrapper.isConnected = false;
    sections.delete(`q-${String(order)}`);
    return true;
  };
  const reattach = (order) => {
    let wrapper = wrappers.get(order);
    if (!wrapper) wrapper = makeTurn(order);
    const section = wrapper.querySelector('section[data-testid^="conversation-turn"]');
    if (section) {
      section.isConnected = true;
      sections.set(`q-${String(order)}`, section);
    }
    flow.appendChild(wrapper);
    return wrapper;
  };
  const moveBefore = (node, before) => flow.insertBefore(node, before || null);
  return { api, flow, callbacks, sections, wrappers, safety, detach, reattach, moveBefore };
}

await fixture('parent reload/order inversion is produced by real render/parking/reuse/repair', () => {
  const harness = createParentHarness();
  equal(harness.api.render('chat'), true, 'initial divider render succeeds');
  equal(harness.api.order(), ['PAGE-1', 'PAGE-2', 'TURN-1'], 'Page 2 parks after Page 1');
  equal(harness.api.render('chat'), true, 'repair render succeeds');
  equal(harness.api.order(), ['PAGE-2', 'PAGE-1', 'TURN-1'], 'repair moves Page 1 past reused Page 2');
});

await fixture('parent expanded inversion remains with both dividers adjacent above Turn 1', () => {
  const harness = createParentHarness();
  harness.api.render('chat');
  harness.api.render('chat');
  equal(harness.api.order(), ['PAGE-2', 'PAGE-1', 'TURN-1'], 'expanded parent failure reproduced');
});

function assertRelative(order, labels, message) {
  const positions = labels.map((label) => order.indexOf(label));
  ok(positions.every((position) => position >= 0), `${message}: all labels exist`);
  ok(positions.every((position, index) => index === 0 || positions[index - 1] < position), `${message}: relative order`);
}

await fixture('correct canonical expanded page-unit ordering', () => {
  const harness = createFixedHarness();
  equal(harness.api.render('chat'), true, 'render succeeds');
  const order = harness.api.meaningfulOrder();
  assertRelative(order, ['PAGE-1', 'TURN-1', 'TURN-25', 'PAGE-2', 'TURN-26', 'TURN-39'], 'canonical expanded');
  equal(harness.api.diagnostics().status, 'settled', 'coordinator settles');
  equal(harness.api.diagnostics().ascending, true, 'divider order is ascending');
});

await fixture('Page 1 collapsed preserves Page 1 list before Page 2', () => {
  const harness = createFixedHarness();
  harness.api.addTitleList(1);
  harness.api.render('chat');
  const order = harness.api.meaningfulOrder();
  assertRelative(order, ['PAGE-1', 'LIST-1', 'PAGE-2', 'TURN-26'], 'Page 1 collapsed');
  equal(harness.api.dividerCount(1), 1, 'one Page 1 divider');
  equal(harness.api.dividerCount(2), 1, 'one Page 2 divider');
});

await fixture('Page 2 collapsed keeps Page 1 normal unit first', () => {
  const harness = createFixedHarness();
  harness.api.addTitleList(2);
  harness.api.render('chat');
  assertRelative(
    harness.api.meaningfulOrder(),
    ['PAGE-1', 'TURN-25', 'PAGE-2', 'LIST-2'],
    'Page 2 collapsed',
  );
  equal(harness.api.diagnostics().ascending, true, 'collapsed Page 2 remains ordered');
});

await fixture('both collapsed lists remain in ascending page units', () => {
  const harness = createFixedHarness();
  harness.api.addTitleList(1);
  harness.api.addTitleList(2);
  harness.api.render('chat');
  assertRelative(
    harness.api.meaningfulOrder(),
    ['PAGE-1', 'LIST-1', 'PAGE-2', 'LIST-2'],
    'both collapsed',
  );
  equal(harness.api.dividerCount(1), 1, 'Page 1 remains unique');
  equal(harness.api.dividerCount(2), 1, 'Page 2 remains unique');
});

await fixture('selected effective 18 exposes Page 1 only', () => {
  const harness = createFixedHarness({ count: 18 });
  harness.api.render('chat');
  equal(harness.api.model().pageCount, 1, 'effective 18 has one page');
  equal(harness.api.dividerCount(1), 1, 'Page 1 exists');
  equal(harness.api.dividerCount(2), 0, 'Page 2 is absent');
  assertRelative(harness.api.meaningfulOrder(), ['PAGE-1', 'TURN-1', 'TURN-18'], 'effective 18');
});

await fixture('missing Turn 25 uses exact remaining Page 1 boundary evidence', () => {
  const orders = Array.from({ length: 39 }, (_unused, index) => index + 1).filter((order) => order !== 25);
  const harness = createFixedHarness({ representedOrders: orders });
  harness.api.render('chat');
  assertRelative(harness.api.meaningfulOrder(), ['TURN-24', 'PAGE-2', 'TURN-26'], 'Turn 25 absent');
  equal(harness.api.diagnostics().status, 'settled', 'missing Turn 25 remains settled');
});

// Host-compatibility foundation contract: a page whose exact start pair is
// not represented PARKS — no approximate placement. Under the measured
// sparse host window, "earliest represented artifact of the page" stamped
// "Page N" above whatever turn happened to be mounted (observed live: the
// Page 1 divider drifting with the window at turns 23/25/18 while turn 1
// was never mounted). The deferral path retains connected dividers and the
// registry's mount transition re-enters reconciliation when the true start
// materializes.
await fixture('missing Turn 26 parks Page 2 instead of anchoring an approximate artifact', () => {
  const orders = Array.from({ length: 39 }, (_unused, index) => index + 1).filter((order) => order !== 26);
  const harness = createFixedHarness({ representedOrders: orders });
  harness.api.render('chat');
  const order = harness.api.meaningfulOrder();
  assertRelative(order, ['PAGE-1', 'TURN-1', 'TURN-25', 'TURN-27'], 'Turn 26 absent, flow intact');
  equal(order.includes('PAGE-2'), false, 'Page 2 is parked, never guessed');
  const page2 = harness.api.diagnostics().pages.find((page) => page.pageNum === 2);
  equal(page2.status, 'deferred', 'Page 2 defers until its exact start mounts');
});

await fixture('missing Turns 25 and 26 parks Page 2 and never uses a top-of-root fallback', () => {
  const orders = Array.from({ length: 39 }, (_unused, index) => index + 1)
    .filter((order) => order !== 25 && order !== 26);
  const harness = createFixedHarness({ representedOrders: orders });
  harness.api.render('chat');
  const order = harness.api.meaningfulOrder();
  assertRelative(order, ['PAGE-1', 'TURN-1', 'TURN-24', 'TURN-27'], 'both boundaries absent, flow intact');
  equal(order.includes('PAGE-2'), false, 'Page 2 is parked, never clustered above Turn 1');
});

await fixture('Turn 39 alone is not Page 2 placement evidence', () => {
  const harness = createFixedHarness({ representedOrders: [1, 39] });
  harness.api.render('chat');
  const order = harness.api.meaningfulOrder();
  assertRelative(order, ['PAGE-1', 'TURN-1', 'TURN-39'], 'Page 1 places exactly');
  equal(order.includes('PAGE-2'), false, 'a non-start artifact never places the divider');
  const page2 = harness.api.diagnostics().pages.find((page) => page.pageNum === 2);
  equal(page2.status, 'deferred', 'Page 2 parks until Turn 26 is represented');
});

await fixture('existing Page 2 before Page 1 is migrated', () => {
  const harness = createFixedHarness();
  const page2 = harness.api.createDivider(2);
  const page1 = harness.api.createDivider(1);
  const turn1 = harness.wrappers.get(1);
  harness.moveBefore(page2, turn1);
  harness.moveBefore(page1, turn1);
  equal(harness.api.meaningfulOrder().slice(0, 3), ['PAGE-2', 'PAGE-1', 'TURN-1'], 'bad parent order seeded');
  harness.api.reconcile('migration');
  assertRelative(harness.api.meaningfulOrder(), ['PAGE-1', 'TURN-1', 'PAGE-2', 'TURN-26'], 'migration');
  equal(harness.api.diagnostics().ascending, true, 'migration proves ascending order');
});

await fixture('both dividers adjacent above Turn 1 are separated into page units', () => {
  const harness = createFixedHarness();
  const page2 = harness.api.createDivider(2);
  const page1 = harness.api.createDivider(1);
  const turn1 = harness.wrappers.get(1);
  harness.moveBefore(page2, turn1);
  harness.moveBefore(page1, turn1);
  harness.api.reconcile('adjacent-above-turn-1');
  const order = harness.api.meaningfulOrder();
  assertRelative(order, ['PAGE-1', 'TURN-1', 'TURN-25', 'PAGE-2', 'TURN-26'], 'adjacent correction');
  ok(order.indexOf('PAGE-2') - order.indexOf('PAGE-1') > 1, 'dividers no longer remain adjacent above Turn 1');
});

await fixture('duplicate thread dividers reduce to exactly one per page', () => {
  const harness = createFixedHarness();
  harness.api.createDivider(1, 'core');
  harness.api.createDivider(1, 'pagination');
  harness.api.createDivider(2, 'core');
  harness.api.createDivider(2, 'pagination');
  harness.api.reconcile('dedupe');
  equal(harness.api.dividerCount(1), 1, 'Page 1 deduplicated');
  equal(harness.api.dividerCount(2), 1, 'Page 2 deduplicated');
  ok(harness.api.diagnostics().removed >= 2, 'duplicate removals reported');
});

await fixture('existing title-list roots retain page ownership and position', () => {
  const harness = createFixedHarness();
  const list1 = harness.api.addTitleList(1);
  const list2 = harness.api.addTitleList(2);
  harness.api.reconcile('title-list-roots');
  equal(list1.isConnected, true, 'Page 1 list remains connected');
  equal(list2.isConnected, true, 'Page 2 list remains connected');
  assertRelative(harness.api.meaningfulOrder(), ['PAGE-1', 'LIST-1', 'PAGE-2', 'LIST-2'], 'title-list ownership');
});

await fixture('refresh reconstruction from minimal mounted DOM places exactly and parks the rest', () => {
  const harness = createFixedHarness({ representedOrders: [1, 39] });
  const page2 = harness.api.createDivider(2);
  const page1 = harness.api.createDivider(1);
  const turn1 = harness.wrappers.get(1);
  harness.moveBefore(page2, turn1);
  harness.moveBefore(page1, turn1);
  harness.api.render('chat');
  const order = harness.api.meaningfulOrder();
  assertRelative(order, ['PAGE-1', 'TURN-1', 'TURN-39'], 'Page 1 reconstructs exactly');
  equal(order.includes('PAGE-2'), false, 'unproven Page 2 divider is parked out of the flow');
  const page2Stats = harness.api.diagnostics().pages.find((page) => page.pageNum === 2);
  equal(page2Stats.status, 'deferred', 'Page 2 defers until Turn 26 is represented');
});

await fixture('collapse and expand cycles remain stable', () => {
  const harness = createFixedHarness();
  const list1 = harness.api.addTitleList(1);
  harness.api.reconcile('collapse');
  assertRelative(harness.api.meaningfulOrder(), ['PAGE-1', 'LIST-1', 'PAGE-2'], 'collapsed cycle');
  list1.remove();
  harness.api.reconcile('expand');
  assertRelative(harness.api.meaningfulOrder(), ['PAGE-1', 'TURN-1', 'PAGE-2', 'TURN-26'], 'expanded cycle');
  equal(harness.api.dividerCount(1), 1, 'Page 1 not duplicated by cycle');
  equal(harness.api.dividerCount(2), 1, 'Page 2 not duplicated by cycle');
});

await fixture('virtualization remount cannot invert page units', () => {
  const harness = createFixedHarness();
  harness.api.render('chat');
  harness.detach(26);
  harness.api.reconcile('turn-26-detached');
  harness.reattach(26);
  harness.api.reconcile('turn-26-remounted');
  assertRelative(harness.api.meaningfulOrder(), ['PAGE-1', 'TURN-25', 'PAGE-2', 'TURN-26'], 'virtualization remount');
  equal(harness.api.diagnostics().ascending, true, 'remount stays ascending');
});

await fixture('effective 39 to 18 to 39 removes and restores Page 2', () => {
  const harness = createFixedHarness();
  harness.api.render('chat');
  equal(harness.api.dividerCount(2), 1, 'canonical Page 2 exists');
  harness.api.setCount(18);
  harness.api.render('chat');
  equal(harness.api.dividerCount(2), 0, 'selected Page 2 removed');
  harness.api.setCount(39);
  harness.api.render('chat');
  equal(harness.api.dividerCount(2), 1, 'canonical Page 2 restored');
  assertRelative(harness.api.meaningfulOrder(), ['PAGE-1', 'TURN-25', 'PAGE-2', 'TURN-26'], 'canonical return');
});

await fixture('shared host wrappers are never reparented', () => {
  const harness = createFixedHarness();
  const parents = new Map(Array.from(harness.wrappers.entries()).map(([order, wrapper]) => [order, wrapper.parentNode]));
  harness.api.render('chat');
  for (const [order, wrapper] of harness.wrappers.entries()) {
    equal(wrapper.parentNode, parents.get(order), `turn ${String(order)} parent is unchanged`);
  }
});

await fixture('host page content is neither removed nor lost', () => {
  const harness = createFixedHarness();
  const before = Array.from(harness.wrappers.values());
  harness.api.render('chat');
  equal(before.every((wrapper) => wrapper.isConnected), true, 'every host wrapper remains connected');
  equal(before.every((wrapper) => harness.flow.children.includes(wrapper)), true, 'every host wrapper remains in the flow');
  equal(harness.safety.destructiveHostRemovals, 0, 'no destructive host removal');
});

await fixture('single-writer source contract is enforced', () => {
  const retiredParkingSource = extractFunction(CORE_SOURCE, 'getAuthorityDividerParkingPosition');
  ok(!/insertBefore|appendChild|prepend|replaceChildren/.test(retiredParkingSource), 'retired parking compatibility query performs no writes');
  ok(CORE_SOURCE.includes('reconcileChatPageUnits remains the sole writer'), 'legacy parking contract is explicitly retired');
  const retiredMoverSource = extractFunction(CORE_SOURCE, 'forcePlaceDividerBeforeTurnWrapper');
  ok(!/insertBefore|appendChild|prepend|replaceChildren/.test(retiredMoverSource), 'legacy mover owns no insertion primitive');
  ok(retiredMoverSource.includes('reconcileChatPageUnits'), 'legacy mover delegates to the coordinator');
  const renderSource = extractFunction(CORE_SOURCE, 'renderChatPageDividers');
  ok(!/insertBefore\s*\(\s*divider\b/.test(renderSource), 'render does not insert dividers');
  const reconcileSource = extractFunction(CORE_SOURCE, 'reconcileChatPageUnits');
  ok(reconcileSource.includes('parent.insertBefore(node, before || null)'), 'coordinator owns insertion primitive');
  ok(!/insertBefore\s*\(\s*divider\b/.test(PAGE_SOURCE), 'Thread Pages does not insert a divider');
  ok(!/insertBefore\s*\(\s*divider\b/.test(UNMOUNT_SOURCE), 'Unmount does not insert a divider');
  ok(PAGINATION_SOURCE.includes('createInlinePageDivider'), 'Pagination only constructs its owned candidate');
});

await fixture('second identical reconciliation performs zero writes', () => {
  const harness = createFixedHarness();
  harness.api.render('chat');
  const second = harness.api.reconcile('idempotent-second-pass');
  equal(second.created, 0, 'second pass creates zero nodes');
  equal(second.moved, 0, 'second pass moves zero nodes');
  equal(second.removed, 0, 'second pass removes zero nodes');
  equal(second.status, 'settled', 'second pass remains settled');
});

await fixture('safe sentinels are inert, zero-size and excluded from turns', () => {
  const harness = createFixedHarness();
  harness.api.render('chat');
  const sentinels = queryAll(harness.flow, '[data-h2o-chat-page-boundary]', true);
  equal(sentinels.length, 4, 'two boundaries exist per authoritative page');
  equal(sentinels.every((node) => node.getAttribute('aria-hidden') === 'true'), true, 'sentinels are aria-hidden');
  equal(sentinels.every((node) => node.inert === true), true, 'sentinels are inert');
  equal(sentinels.every((node) => node.style.getPropertyValue('width') === '0'), true, 'sentinels are zero-width');
  equal(queryAll(harness.flow, 'section[data-testid^="conversation-turn"]', true).length, 39, 'sentinels do not enter turn enumeration');
});

await fixture('no safe anchor defers dividers and requests bounded hydration', () => {
  const harness = createFixedHarness({ representedOrders: [] });
  harness.api.render('chat');
  equal(harness.api.dividerCount(1), 0, 'Page 1 divider is deferred');
  equal(harness.api.dividerCount(2), 0, 'Page 2 divider is deferred');
  equal(harness.api.diagnostics().status, 'page-unit-anchor-unavailable', 'diagnostic is fail-closed');
  equal(harness.safety.hydrationRequests, 2, 'one bounded hydration request per page');
  equal(harness.api.meaningfulOrder().length, 0, 'no top-of-root fallback exists');
});

await fixture('pagination divider candidates are adopted by the coordinator', () => {
  const harness = createFixedHarness();
  harness.api.createDivider(2, 'pagination');
  harness.api.createDivider(1, 'pagination');
  harness.api.reconcile('pagination-candidates');
  assertRelative(harness.api.meaningfulOrder(), ['PAGE-1', 'TURN-1', 'PAGE-2', 'TURN-26'], 'pagination candidates');
  equal(harness.api.dividerCount(1), 1, 'one adopted Page 1 candidate');
  equal(harness.api.dividerCount(2), 1, 'one adopted Page 2 candidate');
});

await fixture('existing Page 2 before a Page 1 title list is repaired', () => {
  const harness = createFixedHarness();
  const page2 = harness.api.createDivider(2);
  const page1 = harness.api.createDivider(1);
  const list1 = harness.api.addTitleList(1);
  const turn1 = harness.wrappers.get(1);
  harness.moveBefore(page2, turn1);
  harness.moveBefore(page1, turn1);
  harness.moveBefore(list1, turn1);
  harness.api.reconcile('title-list-inversion');
  assertRelative(harness.api.meaningfulOrder(), ['PAGE-1', 'LIST-1', 'PAGE-2', 'TURN-26'], 'title-list inversion');
  equal(harness.api.diagnostics().ascending, true, 'title-list inversion settles');
});

await fixture('safety surfaces remain untouched', () => {
  const harness = createFixedHarness();
  harness.api.render('chat');
  equal(harness.safety.storageWrites, 0, 'storage writes');
  equal(harness.safety.preferenceWrites, 0, 'preference writes');
  equal(harness.safety.canonicalWrites, 0, 'canonical writes');
  equal(harness.safety.aliasWrites, 0, 'alias writes');
  equal(harness.safety.cacheWrites, 0, 'cache writes');
  equal(harness.safety.networkCalls, 0, 'network calls');
  equal(harness.safety.polling, 0, 'polling');
  equal(harness.safety.repeatingTimers, 0, 'repeating timers');
  equal(harness.safety.broadObservers, 0, 'broad observers');
  equal(harness.safety.destructiveHostRemovals, 0, 'destructive host removals');
});

const failed = fixtures.filter((entry) => !entry.ok);
for (const entry of fixtures) {
  console.log(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}`);
  if (!entry.ok) console.log(entry.error);
}
console.log(`Fixtures: ${fixtures.length - failed.length}/${fixtures.length}`);
console.log(`Assertions: ${assertionCount}`);
if (failed.length) process.exitCode = 1;
