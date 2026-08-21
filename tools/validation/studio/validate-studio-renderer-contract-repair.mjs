#!/usr/bin/env node
// Focused regression coverage for the Phase 2 Studio renderer contract repair.
// Uses small DOM seams around the real renderer functions so the validator stays
// dependency-free while exercising role fidelity, rich success/fallback state,
// shared sanitization order, and assistant-only collection.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const STUDIO_REL = 'src-surfaces-base/studio/studio.js';
const ARCHIVE_REL = 'src-surfaces-base/studio/S0D3a. 🎬 Transcript Archive Engine - Studio.js';
const SANITIZER_REL = 'src-surfaces-base/studio/platform/html-sanitizer.js';

function readRepo(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

function extractFunction(source, name) {
  const match = new RegExp(`\\bfunction\\s+${name}\\s*\\(`).exec(source);
  if (!match) throw new Error(`extractFunction: '${name}' not found`);
  const start = match.index;
  const braceOpen = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceOpen; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`extractFunction: unterminated '${name}'`);
}

const studioSource = readRepo(STUDIO_REL);
const archiveSource = readRepo(ARCHIVE_REL);
const roleContract = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
  TOOL: 'tool',
};

function loadFunction(source, name, globals = {}) {
  const context = vm.createContext({ ...globals });
  vm.runInContext(`${extractFunction(source, name)}\nthis.result = ${name};`, context);
  return { fn: context.result, context };
}

function validateRoleFidelity() {
  const studio = loadFunction(studioSource, 'normalizeRole', {
    W: { H2O: { Studio: { SELECTORS: { ROLES: roleContract } } } },
  }).fn;
  const archive = loadFunction(archiveSource, 'normalizeRole', {
    H2O: { Studio: { SELECTORS: { ROLES: roleContract } } },
  }).fn;

  for (const role of ['user', 'assistant', 'system', 'tool']) {
    assert.equal(studio(role), role, `Studio renderer collapsed ${role}`);
    assert.equal(archive(role), role, `S0D3a adapter collapsed ${role}`);
  }
  assert.equal(studio('SYSTEM'), 'system', 'Studio role normalization must remain case-insensitive');
  assert.equal(archive('TOOL'), 'tool', 'S0D3a role normalization must remain case-insensitive');
  assert.equal(studio('unknown'), 'assistant', 'unknown Studio roles retain the legacy assistant fallback');
  assert.equal(archive('unknown'), 'assistant', 'unknown S0D3a roles retain the legacy assistant fallback');
}

class FakeElement {
  constructor(role = '') {
    this.role = role;
    this.message = null;
    this.removed = false;
    this.classList = { add() {} };
  }
  remove() { this.removed = true; }
}

function createRichMountHarness() {
  const decorated = [];
  const attachedUsers = [];
  const globals = {
    Element: FakeElement,
    normalizeRichTurns: (rows) => Array.isArray(rows) ? rows : [],
    resolveSnapshotTurnCreateTime: () => 0,
    normalizeAttachments: () => [],
    sanitizeRichTurnElement: (html) => {
      if (html === 'INVALID') return null;
      const host = new FakeElement(String(html));
      host.message = new FakeElement(String(html));
      return host;
    },
    normalizeRole: (raw) => ['user', 'assistant', 'system', 'tool'].includes(String(raw).toLowerCase())
      ? String(raw).toLowerCase() : 'assistant',
    findRoleHostInTurn: (host) => host.message,
    inferTurnRole: (host, fallback) => host.role || fallback,
    decorateReplayTurn: (_host, _message, role, meta) => decorated.push({ role, answerIdx: meta.answerIdx }),
    cleanReaderUserTextNodeLeaks() {},
    getEditOverride: () => null,
    applyEditedMessageBody() {},
    attachUserAttachmentsToTurn: (host) => attachedUsers.push(host),
  };
  const { fn } = loadFunction(studioSource, 'mountRichTurns', globals);
  return { fn, decorated, attachedUsers };
}

function runRichMount(fn, rows) {
  const appended = [];
  const container = { appendChild: (host) => appended.push(host) };
  const result = fn(container, rows, '', { messages: [] });
  return { result, appended };
}

function validateRichMountContract() {
  {
    const h = createRichMountHarness();
    const { result, appended } = runRichMount(h.fn, [
      { turnIdx: 1, role: 'user', outerHTML: 'user' },
    ]);
    assert.equal(result.mountedTurnCount, 1);
    assert.equal(result.assistantTurnEls.length, 0);
    assert.equal(result.fallbackRequired, false);
    assert.equal(appended.length, 1, 'valid rich user-only turn must mount exactly once');
  }

  {
    const h = createRichMountHarness();
    const { result, appended } = runRichMount(h.fn, [
      { turnIdx: 1, role: 'system', outerHTML: 'system' },
      { turnIdx: 2, role: 'tool', outerHTML: 'tool' },
    ]);
    assert.equal(result.mountedTurnCount, 2);
    assert.equal(result.assistantTurnEls.length, 0);
    assert.equal(result.fallbackRequired, false);
    assert.equal(appended.length, 2, 'valid zero-assistant rich turns must each mount once');
  }

  {
    const h = createRichMountHarness();
    const { result, appended } = runRichMount(h.fn, [
      { turnIdx: 1, role: 'user', outerHTML: 'user' },
      { turnIdx: 2, role: 'assistant', outerHTML: 'assistant' },
      { turnIdx: 3, role: 'system', outerHTML: 'system' },
      { turnIdx: 4, role: 'tool', outerHTML: 'tool' },
    ]);
    assert.equal(result.mountedTurnCount, 4);
    assert.equal(appended.length, 4);
    assert.equal(result.assistantTurnEls.length, 1, 'assistant collection must exclude user/system/tool turns');
    assert.equal(result.assistantTurnEls[0].role, 'assistant');
    assert.deepEqual(h.decorated.map((row) => row.answerIdx), [0, 1, 0, 0], 'answer numbering must be assistant-only');
    assert.equal(h.attachedUsers.length, 1, 'user attachment decoration must remain user-only');
  }

  {
    const h = createRichMountHarness();
    const { result, appended } = runRichMount(h.fn, [
      { turnIdx: 1, role: 'user', outerHTML: 'user' },
      { turnIdx: 2, role: 'assistant', outerHTML: 'INVALID' },
    ]);
    assert.equal(result.fallbackRequired, true, 'invalid rich replay must request canonical fallback');
    assert.equal(result.mountedTurnCount, 0);
    assert.equal(result.assistantTurnEls.length, 0);
    assert.equal(appended.length, 0, 'failed rich replay must not leave a partial mount');
  }
}

function validateSharedSanitizerOrder() {
  const events = [];
  const sandbox = vm.createContext({ console });
  sandbox.globalThis = sandbox;
  vm.runInContext(readRepo(SANITIZER_REL), sandbox, { filename: SANITIZER_REL });

  const sanitizeApi = sandbox.H2O.Studio.html.sanitize;
  const realSanitizeHtml = sanitizeApi.sanitizeHtml;
  sanitizeApi.sanitizeHtml = (html) => {
    events.push('shared-sanitize');
    return realSanitizeHtml(html);
  };

  let parsedHtml = '';
  const cleanTurn = {};
  const turnEl = { cloneNode: () => cleanTurn };
  Object.assign(sandbox, {
    W: { H2O: sandbox.H2O },
    document: {
      createElement: () => ({
        content: { querySelectorAll: () => [] },
        set innerHTML(value) {
          events.push('parse');
          parsedHtml = value;
        },
      }),
    },
    findConversationTurnElement: () => turnEl,
    scrubReplayNode: () => events.push('renderer-scrub'),
    cleanReaderUserTextNodeLeaks() {},
    neutralizeExternalUseHrefs() {},
  });
  vm.runInContext(`${extractFunction(studioSource, 'sanitizeRichTurnElement')}\nthis.sanitizeRichTurnElementResult = sanitizeRichTurnElement;`, sandbox);

  const unsafe = '<section data-testid="conversation-turn" onclick="evil()">'
    + '<div data-message-author-role="user"><script>evil()</script>'
    + '<a href="javascript:evil()">safe text</a></div></section>';
  const result = sandbox.sanitizeRichTurnElementResult(unsafe);
  assert.equal(result, cleanTurn);
  assert.doesNotMatch(parsedHtml, /<script|onclick|javascript:/i, 'unsafe rich HTML reached the DOM parser');
  assert.match(parsedHtml, /href="#"/, 'unsafe rich URL was not neutralized by the shared sanitizer');
  assert.ok(events.indexOf('shared-sanitize') < events.indexOf('parse'), 'shared sanitizer must run before DOM parsing');
  assert.ok(events.indexOf('parse') < events.indexOf('renderer-scrub'), 'renderer replay cleanup must run after shared sanitization and parsing');
}

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
}

class FakeScroll {
  constructor() {
    this.classList = new FakeClassList();
    this.children = [];
  }
  appendChild(value) { this.children.push(value); return value; }
  addEventListener() {}
  contains(value) { return this.children.includes(value); }
  querySelectorAll() { return []; }
}

class FakeRoot {
  constructor() {
    this.dataset = {};
    this.className = '';
    this.scroll = null;
  }
  set innerHTML(_value) { this.scroll = new FakeScroll(); }
  querySelector(selector) { return selector === '.cgScroll' ? this.scroll : null; }
}

function createBuildReaderHarness(richResult) {
  let canonicalCalls = 0;
  let hostMount = null;
  const sandbox = {
    document: {
      createElement: () => new FakeRoot(),
      querySelector: () => null,
    },
    W: {
      H2O: {
        Studio: {
          ingestion: { appendSavedChatArchiveStatusBadgeV1() {} },
        },
        studioHost: { mount: (options) => { hostMount = options; } },
      },
    },
    normalizeRichTurns: (rows) => Array.isArray(rows) ? rows : [],
    mountRichTurns: (container) => {
      for (let i = 0; i < richResult.mountedTurnCount; i += 1) container.appendChild({ kind: 'rich' });
      return richResult;
    },
    buildCanonicalConversation: (container, snap) => {
      canonicalCalls += 1;
      for (const row of snap.messages || []) container.appendChild({ kind: 'canonical', role: row.role });
      return (snap.messages || []).filter((row) => row.role === 'assistant').map(() => ({ role: 'assistant' }));
    },
    syncReaderTopOffset() {},
    setTimeout() {},
    Promise,
    String,
    Array,
    Object,
  };
  const { fn } = loadFunction(studioSource, 'buildReaderDOM', sandbox);
  return {
    fn,
    getCanonicalCalls: () => canonicalCalls,
    getHostMount: () => hostMount,
  };
}

function validateBuildFallbackDecision() {
  {
    const h = createBuildReaderHarness({ mountedTurnCount: 1, assistantTurnEls: [], fallbackRequired: false });
    const root = h.fn({ chatId: 'user-only', meta: { richTurns: [{ role: 'user' }] }, messages: [{ role: 'user' }] });
    assert.equal(root.scroll.children.length, 1, 'rich user-only build must render exactly one turn');
    assert.equal(h.getCanonicalCalls(), 0, 'rich user-only build must not enter canonical fallback');
    assert.equal(root.scroll.classList.contains('is-rich'), true);
  }

  {
    const h = createBuildReaderHarness({ mountedTurnCount: 2, assistantTurnEls: [], fallbackRequired: false });
    const root = h.fn({ chatId: 'zero-assistant', meta: { richTurns: [{ role: 'system' }, { role: 'tool' }] }, messages: [{ role: 'system' }, { role: 'tool' }] });
    assert.equal(root.scroll.children.length, 2);
    assert.equal(h.getCanonicalCalls(), 0, 'valid zero-assistant rich build must not enter canonical fallback');
  }

  {
    const h = createBuildReaderHarness({ mountedTurnCount: 0, assistantTurnEls: [], fallbackRequired: true });
    const root = h.fn({ chatId: 'fallback', meta: { richTurns: [{ role: 'user' }] }, messages: [{ role: 'user' }, { role: 'assistant' }] });
    assert.equal(h.getCanonicalCalls(), 1, 'genuine rich failure must activate canonical fallback');
    assert.equal(root.scroll.children.length, 2);
    assert.equal(root.scroll.classList.contains('is-rich'), false);
  }

  {
    const assistant = { role: 'assistant' };
    const h = createBuildReaderHarness({ mountedTurnCount: 4, assistantTurnEls: [assistant], fallbackRequired: false });
    h.fn({ chatId: 'roles', meta: { richTurns: [{}, {}, {}, {}] }, messages: [] });
    assert.equal(h.getHostMount().assistantTurnEls.length, 1);
    assert.equal(h.getHostMount().assistantTurnEls[0], assistant, 'downstream host must receive the assistant-only collection');
  }
}

validateRoleFidelity();
validateRichMountContract();
validateSharedSanitizerOrder();
validateBuildFallbackDecision();

console.log('Studio renderer contract repair validation passed');
