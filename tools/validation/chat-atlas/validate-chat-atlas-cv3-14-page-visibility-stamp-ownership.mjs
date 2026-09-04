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
const P03C_BASE = 'ac18cc70323d5b9b7b094bcef0afd4d432787437';
const P03C_VERIFIED_HEAD = 'c40809a18675d0812186124ce77bf8f3c0b35e36';
const P03C_VERIFIED_PAGE_BLOB = '906fd4856fad632b2caf05062af309513e42d421';
const P03C_PATHS = Object.freeze([
  PAGE_PATH,
  'tools/validation/chat-atlas/validate-chat-atlas-cv3-11-effective-title-list-collapse.mjs',
  'tools/validation/chat-atlas/validate-chat-atlas-cv3-13-title-list-page-hydration.mjs',
  VALIDATOR_PATH,
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
// The chat page's structural implementation moved out of MiniMap Core into
// 0C3a Chat Page Structure Engine, so the MiniMap source read here is that
// file plus the engine the code now lives in. No assertion below is altered:
// positive checks and by-name function extraction still find the code, and
// negative checks get strictly stronger, because a forbidden pattern must now
// be absent from both files instead of from MiniMap Core alone.
const STRUCTURE_PATH = 'src-runtime-base/0C3a.⬛️📐 Chat Page Structure Engine 📐.js';
const STRUCTURE_SOURCE = fs.readFileSync(path.join(ROOT, STRUCTURE_PATH), 'utf8');
const DIVIDER_SOURCE = `${fs.readFileSync(path.join(ROOT, DIVIDER_PATH), 'utf8')}\n${STRUCTURE_SOURCE}`;
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

// The Mission-3 acceptance surface: every path class whose bytes P04A certifies
// or whose behaviour it exercises. A path here is NEVER unrelated, whatever any
// allowlist below says. This exclusion is checked FIRST so a future allowlist
// edit cannot accidentally admit an acceptance-surface path.
const MISSION3_ACCEPTANCE_SURFACE_PREFIXES = Object.freeze([
  'src-runtime-base/',
  'config/',
  'tools/loader/',
  'tools/validation/chat-atlas/',
  'tools/validation/library/',
]);

// Class D allowlist. Affirmative subsystem identity only - never "everything
// that is not Mission-3". A path qualifies solely by matching one of these
// pinned prefixes.
const UNRELATED_SUBSYSTEM_PREFIXES = Object.freeze([
  'apps/studio/',
  'src-surfaces-base/studio/',
  'tools/product/studio/',
  'tools/validation/studio/',
]);

// release-evidence/ is written by EVERY mission, so the directory alone proves
// nothing and must not be allowlisted. Only a dated evidence file whose own
// name affirmatively identifies the unrelated subsystem qualifies.
const UNRELATED_SUBSYSTEM_EVIDENCE = /^release-evidence\/[0-9]{4}-[0-9]{2}-[0-9]{2}\/saved-chat-[A-Za-z0-9._-]+\.md$/;

function isMission3AcceptanceSurfacePath(file = '') {
  const value = String(file || '');
  return MISSION3_ACCEPTANCE_SURFACE_PREFIXES.some((prefix) => value.startsWith(prefix));
}

// Class D. Unrelated-subsystem mainline advance. A shared repository means
// sibling lanes merge their own work into main while an Internal acceptance
// head is pinned; those advances are not validator maintenance and are not a
// verified product correction, so classes C and B both reject them even when
// every guarded byte is identical.
//
// This admits such a path ONLY on affirmative subsystem identity. Anything
// unknown, shared, root-level or cross-cutting - a bare filename, a new
// top-level directory, node_modules, package.json, docs/, an undated or
// differently-named evidence file - matches nothing here and fails closed,
// which routes it to GOV review rather than silently widening the boundary.
function isUnrelatedSubsystemPath(file = '') {
  const value = String(file || '');
  if (!value || value.includes('/../') || value.includes('//')) return false;
  if (isMission3AcceptanceSurfacePath(value)) return false;
  if (UNRELATED_SUBSYSTEM_PREFIXES.some((prefix) => value.startsWith(prefix))) return true;
  return UNRELATED_SUBSYSTEM_EVIDENCE.test(value);
}

function isAdmissibleDescendantPath(file = '') {
  return isValidatorMaintenancePath(file) || isUnrelatedSubsystemPath(file);
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

// Classes C and D. Descendants of the current verified product boundary are
// admissible only as validator/test maintenance (class C) or as an affirmatively
// classified unrelated-subsystem mainline advance (class D). The correction
// package is NOT admissible here: a product path that was legitimate inside
// class B is still rejected, and so is any Mission-3 acceptance-surface path.
function currentDescendantValid({ currentAncestor = false, descendantPaths = [] } = {}) {
  return currentAncestor === true
    && descendantPaths.every(isAdmissibleDescendantPath);
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
  const hydrationBody = extractFunction(PAGE_SOURCE, 'reconcileTitleListPageHydration');
  ok(hydrationBody.indexOf('reconcileTitleListFlowHiddenArtifacts') < hydrationBody.indexOf('recoverMissingTitleListPageMembers'), 'stamp cleanup precedes bounded member recovery');
  ok(hydrationBody.indexOf('recoverMissingTitleListPageMembers') < hydrationBody.lastIndexOf('syncTitleListNativeTimestampVisibility'), 'active-path recovery precedes timestamp projection');
  equal(PAGE_SOURCE.includes("syncActiveTitleListsNow('observer-hub-remount')"), true, 'Observer Hub uses the same ordering');
});

await fixture('P03C C7 scalar title-list state retains no inline native wrapper', () => {
  equal(PAGE_SOURCE.includes('titleListOpenStatesByKey: new Map()'), true, 'scalar open-state registry is present');
  equal(PAGE_SOURCE.includes('data-h2o-title-stack-inline'), false, 'inline wrapper ownership stamp is absent');
  equal(PAGE_SOURCE.includes('_h2oTitleListOrigin'), false, 'raw native origin retention is absent');
});

await fixture('P03C C8 Observer Hub reconciles native-in-place projection without re-adoption', () => {
  const observerSync = extractFunction(PAGE_SOURCE, 'syncActiveTitleListsNow');
  equal(observerSync.includes('reconcileAtomicPageCollapseTransactions'), true, 'Observer path reaches bounded transaction reconciliation');
  equal(PAGE_SOURCE.includes('reconcileTitleListNativeInPlaceProjection'), true, 'native-in-place reconciliation is source-owned');
  equal(PAGE_SOURCE.includes('adoptOpenedTurnIntoStack'), false, 'Observer cannot invoke native re-adoption');
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
  const diffs = [PAGE_PATH].map((file) => execFileSync(
    'git',
    ['diff', '--unified=0', P03C_BASE, '--', file],
    { cwd: ROOT, encoding: 'utf8' },
  )).join('\n');
  const added = diffs.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')).join('\n');
  equal(/\bfetch\s*\(/.test(added), false, 'no network call');
  equal(/\bsetInterval\s*\(/.test(added), false, 'no polling interval');
  equal(/\bnew\s+MutationObserver\b/.test(added), false, 'no broad observer');
  equal(/\bsetTimeout\s*\(/.test(added), false, 'no repeating or general timer');
  equal(/localStorage\.(?:setItem|removeItem|clear)\s*\(/.test(added), false, 'no storage write');
  equal(/sessionStorage\.(?:setItem|removeItem|clear)\s*\(/.test(added), false, 'no cache write');
  equal(/\b(?:set|write|mutate)Canonical[A-Z]\w*\s*\(/.test(added), false, 'no canonical mutation API');
  equal(/alias(?:es)?\.(?:set|write|delete)/i.test(added), false, 'no alias write');
  equal(/(?:anchor|wrapper|section)\??\.remove\(\)/i.test(added), false, 'no destructive host removal');
  equal(/getEffectivePresentation(?:Index|Status)/.test(added), false, 'no selected-path proof redesign');
  equal(/Side Actions|side-actions/i.test(added), false, 'no Side Actions change');
});

await fixture('scope is limited to approved page and divider ownership', () => {
  const historicalPaths = gitPathList([
    'diff', '--name-only', '-z', `${P03C_BASE}..${P03C_VERIFIED_HEAD}`,
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
  equal(P03C_PATHS.includes(VALIDATOR_PATH), true, 'CV-3.14 participates in the historical P03C assurance package');

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

  // Classes C and D -- admissible descendants of the current verified boundary.
  equal(currentDescendantValid(evidence), true, 'current descendant delta is admissible (validator maintenance or unrelated subsystem)');
  equal(descendantPaths.every(isAdmissibleDescendantPath), true, 'committed descendant delta is admissible');
  equal(
    descendantPaths.filter((file) => isMission3AcceptanceSurfacePath(file)
      && !isValidatorMaintenancePath(file)),
    [],
    'no Mission-3 acceptance-surface product path entered the descendant delta',
  );
  equal(
    descendantPaths.filter((file) => isUnrelatedSubsystemPath(file)
      && isMission3AcceptanceSurfacePath(file)),
    [],
    'class D never admits a Mission-3 acceptance-surface path',
  );

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

  // G2. Class D -- unrelated-subsystem mainline advance is admitted, but only
  // on affirmative subsystem identity.
  equal(verifiedProductBoundaryValid({
    ...evidence,
    descendantPaths: [...descendantPaths, 'apps/studio/desktop/src-tauri/src/lib.rs'],
  }), true, 'an unrelated Studio subsystem path is admitted');
  equal(verifiedProductBoundaryValid({
    ...evidence,
    descendantPaths: [...descendantPaths, 'release-evidence/2026-09-04/saved-chat-storage-m09-final-closure.md'],
  }), true, 'a dated saved-chat evidence file is admitted');

  // G3. Fail-closed. Unknown, shared, root-level, cross-cutting and ambiguous
  // paths must NOT be admitted merely for lying outside Mission-3. Each of
  // these is outside the acceptance surface and must still be rejected.
  for (const ambiguous of [
    'package.json',
    'README.md',
    'docs/architecture/some-note.md',
    'node_modules/left-pad/index.js',
    'apps/desktop/src/main.rs',
    'src-surfaces-base/desk/desk.js',
    'tools/product/pack-something.mjs',
    'release-evidence/saved-chat-undated.md',
    'release-evidence/2026-09-04/title-interface-note.md',
    'release-evidence/2026-09-04/saved-chat-note.txt',
    'some-new-top-level/file.js',
  ]) {
    equal(isUnrelatedSubsystemPath(ambiguous), false, `ambiguous path is not class D: ${ambiguous}`);
    equal(verifiedProductBoundaryValid({
      ...evidence,
      descendantPaths: [...descendantPaths, ambiguous],
    }), false, `ambiguous descendant path is rejected: ${ambiguous}`);
  }

  // G4. The acceptance surface is never class D, even for paths that also match
  // an allowlisted prefix shape.
  for (const surface of [
    PAGE_PATH,
    'src-runtime-base/0A2a.js',
    'config/anything.json',
    'tools/loader/make-aliases.mjs',
    'tools/validation/chat-atlas/validate-chat-atlas-cv3-26-atomic-rendered-boundary-page-collapse.mjs',
    'tools/validation/library/validate-chat-atlas-cv3-48-chat-list-decorator-write-and-read-cost.mjs',
  ]) {
    equal(isUnrelatedSubsystemPath(surface), false, `acceptance-surface path is never class D: ${surface}`);
  }
  equal(isMission3AcceptanceSurfacePath(PAGE_PATH), true, '1C1b is on the Mission-3 acceptance surface');
  equal(isUnrelatedSubsystemPath('apps/studio/../src-runtime-base/1C1b.js'), false, 'path traversal is rejected');

  // G5. Class D does not weaken class B: the correction segment still refuses a
  // product path outside the pinned package even if it is an unrelated subsystem.
  equal(correctionSegmentValid({
    ...evidence,
    correctionPaths: [...correctionPaths, 'apps/studio/desktop/src-tauri/src/lib.rs'],
  }), false, 'class D does not widen the verified correction segment');

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
