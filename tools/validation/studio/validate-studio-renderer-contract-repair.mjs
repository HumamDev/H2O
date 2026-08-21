#!/usr/bin/env node
// Focused regression coverage for the Studio renderer contract and extracted
// Phase 3 module boundary.
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
const RENDERER_REL = 'src-surfaces-base/studio/renderer/chat-renderer.studio.js';
const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
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
const rendererSource = readRepo(RENDERER_REL);
const studioHtmlSource = readRepo(STUDIO_HTML_REL);
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
  const studio = loadFunction(rendererSource, 'normalizeRole', { ROLES: roleContract }).fn;
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

function validateRendererInputContract() {
  const sandbox = vm.createContext({
    NORMALIZED_INPUT: Symbol('renderer-input'),
    ROLES: roleContract,
    String,
    Number,
    Array,
    Object,
  });
  const helpers = [
    'resolveSnapshotTurnCreateTime',
    'normalizeRole',
    'normalizeAttachmentRecord',
    'normalizeAttachments',
    'normalizeRichTurns',
    'normalizeRendererMessage',
    'normalizeInput',
  ].map((name) => extractFunction(rendererSource, name)).join('\n');
  vm.runInContext(`${helpers}\nthis.normalizeRendererInput = normalizeInput;`, sandbox);

  const source = {
    snapshotId: 'snap-1',
    chatId: 'chat-1',
    meta: {
      title: 'Contract chat',
      projectId: 'project-1',
      turnCreateTimes: { 2: 42 },
      richTurns: [{ turnIdx: 1, role: 'system', outerHTML: '<section></section>' }],
    },
    messages: [
      { order: 4, role: 'user', text: 'u', messageId: 'm-u' },
      { order: 1, role: 'assistant', text: 'a', turnId: 't-a' },
      { order: 3, role: 'system', text: 's' },
      { order: 2, role: 'tool', text: 't' },
    ],
  };
  const before = JSON.stringify(source);
  const input = sandbox.normalizeRendererInput(source);

  assert.deepEqual(Array.from(input.messages, (row) => row.role),
    ['user', 'assistant', 'system', 'tool'],
    'normalized Renderer input must preserve all four roles and source order');
  assert.equal(input.messages[1].createTime, 42, 'metadata timestamp projection must survive normalization');
  assert.equal(input.messages[0].messageId, 'm-u');
  assert.equal(input.messages[1].turnId, 't-a');
  assert.equal(input.richTurns[0].role, 'system');
  assert.equal(input.title, 'Contract chat');
  assert.equal(input.projectId, 'project-1');
  assert.equal(JSON.stringify(source), before, 'Renderer normalization must not mutate the saved snapshot');
  assert.notEqual(input.messages, source.messages, 'Renderer input must be logically detached from platform records');

  const desktopShape = {
    snapshotId: source.snapshotId,
    chatId: source.chatId,
    metadata: source.meta,
    messages: source.messages,
  };
  const desktopInput = sandbox.normalizeRendererInput(desktopShape);
  assert.deepEqual(
    JSON.parse(JSON.stringify(desktopInput)),
    JSON.parse(JSON.stringify(input)),
    'meta and metadata source projections must converge on one logical Renderer input'
  );
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
  const { fn } = loadFunction(rendererSource, 'mountRichTurns', globals);
  return { fn, decorated, attachedUsers };
}

function runRichMount(fn, rows) {
  const appended = [];
  const container = { appendChild: (host) => appended.push(host) };
  const result = fn(container, rows, '', { messages: [] }, { getEditOverride: () => null });
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
  vm.runInContext(`${extractFunction(rendererSource, 'sanitizeRichTurnElement')}\nthis.sanitizeRichTurnElementResult = sanitizeRichTurnElement;`, sandbox);

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

function createRendererBuildHarness(richResult) {
  let canonicalCalls = 0;
  const sandbox = {
    document: {
      createElement: () => new FakeRoot(),
    },
    Element: FakeScroll,
    TURNS_TESTID: 'conversation-turns',
    normalizeInput: (input) => input,
    mountRichTurns: (container) => {
      for (let i = 0; i < richResult.mountedTurnCount; i += 1) container.appendChild({ kind: 'rich' });
      return richResult;
    },
    buildCanonicalConversation: (container, snap) => {
      canonicalCalls += 1;
      for (const row of snap.messages || []) container.appendChild({ kind: 'canonical', role: row.role });
      return (snap.messages || []).filter((row) => row.role === 'assistant').map(() => ({ role: 'assistant' }));
    },
    Promise,
    String,
    Array,
    Object,
  };
  const { fn } = loadFunction(rendererSource, 'render', sandbox);
  return {
    fn,
    getCanonicalCalls: () => canonicalCalls,
  };
}

function validateBuildFallbackDecision() {
  {
    const h = createRendererBuildHarness({ mountedTurnCount: 1, assistantTurnEls: [], fallbackRequired: false });
    const result = h.fn({ chatId: 'user-only', title: 'User only', projectId: '', snapshotId: '', richTurns: [{ role: 'user' }], messages: [{ role: 'user' }] });
    assert.equal(result.turnsEl.children.length, 1, 'rich user-only build must render exactly one turn');
    assert.equal(h.getCanonicalCalls(), 0, 'rich user-only build must not enter canonical fallback');
    assert.equal(result.turnsEl.classList.contains('is-rich'), true);
    assert.equal(result.renderMode, 'rich');
  }

  {
    const h = createRendererBuildHarness({ mountedTurnCount: 2, assistantTurnEls: [], fallbackRequired: false });
    const result = h.fn({ chatId: 'zero-assistant', title: '', projectId: '', snapshotId: '', richTurns: [{ role: 'system' }, { role: 'tool' }], messages: [{ role: 'system' }, { role: 'tool' }] });
    assert.equal(result.turnsEl.children.length, 2);
    assert.equal(h.getCanonicalCalls(), 0, 'valid zero-assistant rich build must not enter canonical fallback');
  }

  {
    const h = createRendererBuildHarness({ mountedTurnCount: 0, assistantTurnEls: [], fallbackRequired: true });
    const result = h.fn({ chatId: 'fallback', title: '', projectId: '', snapshotId: '', richTurns: [{ role: 'user' }], messages: [{ role: 'user' }, { role: 'assistant' }] });
    assert.equal(h.getCanonicalCalls(), 1, 'genuine rich failure must activate canonical fallback');
    assert.equal(result.turnsEl.children.length, 2);
    assert.equal(result.turnsEl.classList.contains('is-rich'), false);
    assert.equal(result.renderMode, 'canonical');
  }

  {
    const assistant = { role: 'assistant' };
    const h = createRendererBuildHarness({ mountedTurnCount: 4, assistantTurnEls: [assistant], fallbackRequired: false });
    const result = h.fn({ chatId: 'roles', title: '', projectId: '', snapshotId: '', richTurns: [{}, {}, {}, {}], messages: [] });
    assert.equal(result.assistantTurnEls.length, 1);
    assert.equal(result.assistantTurnEls[0], assistant, 'Renderer result must expose the assistant-only collection');
  }
}

function validateExtractedRendererBoundary() {
  const sanitizerTag = '<script src="./platform/html-sanitizer.js"></script>';
  const rendererTag = '<script src="./renderer/chat-renderer.studio.js"></script>';
  const studioTag = '<script src="./studio.js?v=2.5.80"></script>';
  assert.ok(studioHtmlSource.indexOf(sanitizerTag) < studioHtmlSource.indexOf(rendererTag),
    'Renderer module must load after the shared sanitizer');
  assert.ok(studioHtmlSource.indexOf(rendererTag) < studioHtmlSource.indexOf(studioTag),
    'Renderer module must load before studio.js orchestration');
  assert.match(rendererSource, /Studio\.chatRenderer\s*=\s*Object\.freeze/,
    'Renderer module must install the canonical Studio API');
  assert.match(studioSource, /renderer\.normalizeInput\(snap\)/,
    'studio.js must normalize snapshots through the Renderer boundary');
  assert.match(studioSource, /renderer\.render\(rendererInput,\s*\{\s*getEditOverride\s*\}\)/,
    'studio.js must construct transcripts through the Renderer boundary');
  assert.doesNotMatch(studioSource, /function\s+(mountRichTurns|buildCanonicalConversation|renderTextAsChatGPTBlocks)\s*\(/,
    'studio.js must not retain extracted Renderer implementations');
}

validateRoleFidelity();
validateRendererInputContract();
validateRichMountContract();
validateSharedSanitizerOrder();
validateBuildFallbackDecision();
validateExtractedRendererBoundary();

console.log('Studio renderer contract repair validation passed');
