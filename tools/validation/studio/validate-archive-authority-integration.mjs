#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ARCHIVE_REL = 'src-runtime-base/0D3a.⬛️🗄️ Transcript Archive Engine 🗂️🗄️.js';
const CONTROL_SHA = '31290d23b14038a3098641701f9e6b0f6fe9fef0';
const archiveSource = fs.readFileSync(path.join(ROOT, ARCHIVE_REL), 'utf8');
const controlSource = execFileSync('git', ['show', `${CONTROL_SHA}:${ARCHIVE_REL}`], {
  cwd: ROOT,
  encoding: 'utf8',
});

const CHAT_ID = 'archive-authority-fixture-chat';
const CAPTURED_AT = '2026-08-15T12:34:56.000Z';
let assertions = 0;
const pass = [];

function check(condition, message) {
  assertions += 1;
  assert.ok(condition, message);
}

function equal(actual, expected, message) {
  assertions += 1;
  const clean = (value) => value && typeof value === 'object'
    ? JSON.parse(JSON.stringify(value))
    : value;
  assert.deepEqual(clean(actual), clean(expected), message);
}

async function test(name, fn) {
  await fn();
  pass.push(name);
}

function count(source, needle) {
  return source.split(needle).length - 1;
}

function extractFunction(source, name) {
  const anchors = [`  function ${name}(`, `  async function ${name}(`];
  const matches = anchors
    .map((anchor) => ({ anchor, index: source.indexOf(anchor) }))
    .filter((entry) => entry.index >= 0);
  if (matches.length !== 1 || source.indexOf(matches[0].anchor) !== source.lastIndexOf(matches[0].anchor)) {
    throw new Error(`function-anchor-invalid:${name}`);
  }
  const start = matches[0].index;
  const signatureEnd = source.indexOf(') {', start);
  const bodyStart = signatureEnd < 0 ? -1 : signatureEnd + 2;
  if (bodyStart < 0) throw new Error(`function-signature-invalid:${name}`);
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const ch = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') { blockComment = false; index += 1; }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '/' && next === '/') { lineComment = true; index += 1; continue; }
    if (ch === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`function-boundary-invalid:${name}`);
}

function extractStatement(source, name) {
  const prefix = `  const ${name} = `;
  const start = source.indexOf(prefix);
  if (start < 0 || source.indexOf(prefix, start + 1) >= 0) throw new Error(`statement-anchor-invalid:${name}`);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const ch = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    else if (ch === ';' && depth === 0) return source.slice(start, index + 1).trimStart();
  }
  throw new Error(`statement-boundary-invalid:${name}`);
}

function assertMigratedSource(source) {
  assert.equal(count(source, 'resource: "conversation"'), 2, 'both Archive reads must use the conversation resource');
  assert.equal(count(source, 'authority.request({'), 2, 'both Archive reads must issue one logical authority operation');
  assert.match(source, /const deadline = Date\.now\(\) \+ timeoutMs;/, 'provider must compute an absolute deadline');
  assert.match(source, /const remainingBudget = Math\.max\(0, deadline - Date\.now\(\)\);/, 'provider must compute remaining budget');
  assert.match(source, /timeoutMs: remainingBudget,/, 'authority must receive only the remaining provider budget');
  assert.doesNotMatch(source, /\/api\/auth\/session/, 'Archive must not name the session endpoint');
  assert.doesNotMatch(source, /\/backend-api\/conversation/, 'Archive must not name the conversation endpoint');
  assert.doesNotMatch(source, /\b(?:W\.)?fetch\s*\(/, 'Archive must not issue a raw fetch');
  assert.doesNotMatch(source, /readChatGptAccessToken|nativeConversationHeaders|authorization\s*:|Bearer\s/, 'Archive must not construct private authentication headers');
}

function makePayload(extraNodes = 0) {
  const mapping = {
    root: {
      id: 'root',
      parent: null,
      children: ['q1'],
      message: {
        id: 'root',
        author: { role: 'system' },
        content: { content_type: 'text', parts: ['context'] },
        metadata: { is_visually_hidden_from_conversation: true },
        create_time: 1,
      },
    },
    q1: {
      id: 'q1',
      parent: 'root',
      children: ['a1'],
      message: {
        id: 'q1',
        author: { role: 'user' },
        content: { content_type: 'text', parts: ['Question'] },
        metadata: {},
        create_time: 2,
      },
    },
    a1: {
      id: 'a1',
      parent: 'q1',
      children: [],
      message: {
        id: 'a1',
        author: { role: 'assistant' },
        content: { content_type: 'text', parts: ['Answer'] },
        metadata: { finish_details: { type: 'stop' } },
        status: 'finished_successfully',
        end_turn: true,
        create_time: 3,
      },
    },
  };
  for (let index = 0; index < extraNodes; index += 1) {
    const id = `extra-${index}`;
    mapping[id] = {
      id,
      parent: null,
      children: [],
      message: {
        id,
        author: { role: 'system' },
        content: { content_type: 'text', parts: ['detached'] },
        metadata: { is_visually_hidden_from_conversation: true },
        create_time: 10 + index,
      },
    };
  }
  return {
    id: CHAT_ID,
    conversation_id: CHAT_ID,
    title: 'Authority Fixture',
    current_node: 'a1',
    update_time: 1234,
    mapping,
  };
}

const commonTurnFunctions = [
  'isObj',
  'nowIso',
  'toChatId',
  'stableHash',
  'conversationTurnIndexFailure',
  'conversationTurnIndexIdentity',
  'conversationTurnIndexMessageId',
  'conversationTurnIndexRole',
  'conversationTurnIndexProductUser',
  'conversationTurnIndexStopped',
  'conversationTurnIndexProductAnswer',
  'conversationTurnIndexPlaceholder',
  'conversationTurnIndexBranchShellAlias',
  'conversationTurnIndexIdentityFingerprint',
  'conversationTurnIndexCreateTime',
  'conversationIdentityGraphFromMapping',
  'normalizeBackendConversationTurnIndexUnsafe',
  'normalizeBackendConversationTurnIndex',
];

function createTurnRuntime(source, { authority = null, fetchImpl = null, DateImpl = Date } = {}) {
  const migrated = source.includes('backendAuthorityFailureReason(response');
  const functions = commonTurnFunctions.slice();
  if (migrated) functions.push('backendAuthorityFailureReason');
  else functions.push('readChatGptAccessToken', 'nativeConversationHeaders');
  functions.push('fetchConversationTurnIndex');
  const program = `
    'use strict';
    const W = globalThis;
    const H2O = (W.H2O = W.H2O || {});
    ${extractStatement(source, 'TURN_INDEX_SCHEMA')}
    const TURN_INDEX_FETCH_TIMEOUT_MS = 12000;
    ${migrated ? extractStatement(source, 'BACKEND_AUTHORITY_CAPABILITY_FAILURES') : ''}
    ${functions.map((name) => extractFunction(source, name)).join('\n')}
    globalThis.__api = Object.freeze({
      fetchConversationTurnIndex,
      normalizeBackendConversationTurnIndex,
    });
  `;
  const sandbox = {
    console: Object.freeze({ log() {}, warn() {}, error() {} }),
    Date: DateImpl,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    fetch: fetchImpl || (() => { throw new Error('raw-fetch-forbidden'); }),
    H2O: authority ? { BackendAuthority: authority } : {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(program, context, { filename: ARCHIVE_REL, timeout: 5_000 });
  return context.__api;
}

const captureFunctions = [
  'isObj',
  'toChatId',
  'normalizeChatIdFromUrl',
  'normalizeRole',
  'normalizeCreatedAt',
  'readSidebarConversationTitle',
  'readConversationHistoryCacheTitle',
  'targetChatHref',
  'appendConversationTextParts',
  'extractConversationMessageText',
  'normalizeBackendConversationMessages',
  'normalizeAttachmentRecord',
  'normalizeAttachments',
  'normalizeMessages',
  'countAssistantTurns',
  'countUserTurns',
  'positiveCount',
  'buildCaptureEvidence',
];

function createCaptureRuntime(source, {
  authority = null,
  fetchImpl = null,
  currentChatId = '',
  domMessages = [],
} = {}) {
  const migrated = source.includes('backendAuthorityFailureReason(res)');
  const functions = captureFunctions.slice();
  if (migrated) functions.push('backendAuthorityFailureReason');
  else functions.push('readChatGptAccessToken', 'nativeConversationHeaders');
  functions.push('fetchConversationCapture', 'captureNow');
  const program = `
    'use strict';
    const W = globalThis;
    const H2O = (W.H2O = W.H2O || {});
    const D = W.document;
    const WORKBENCH_LOCAL_ONLY_WARNING = 'Local-only fixture warning.';
    ${migrated ? extractStatement(source, 'BACKEND_AUTHORITY_CAPABILITY_FAILURES') : ''}
    let __latest = null;
    const __effects = { metaCalls: 0, writes: 0, afterWrites: 0, saveStrips: 0, writePayload: null };
    const state = { latestByChat: { get() { return __latest; } } };
    const warn = () => {};
    const getCurrentChatId = () => globalThis.__currentChatId;
    const captureDomNormalizedMessagesWithAttachments = async () => globalThis.__domMessages;
    const collectNativeTurnNodes = () => [];
    const captureDomRichTurns = async () => [];
    const captureAssistantTurnHighlights = () => [];
    function buildCaptureMeta(chatId, messages, opts = {}) {
      __effects.metaCalls += 1;
      return {
        chatId,
        href: String(opts.href || ''),
        title: String(opts.title || ''),
        source: String(opts.source || ''),
        originSource: String(opts.originSource || ''),
        messageCount: messages.length,
        richTurns: Array.isArray(opts.richTurns) ? opts.richTurns : [],
        turnHighlights: Array.isArray(opts.turnHighlights) ? opts.turnHighlights : [],
      };
    }
    const ensureExtensionBacked = async () => false;
    const getExtensionBridgeHealth = () => ({ extensionContextInvalidated: false });
    async function saveLegacyNormalized(chatId, messages, meta, opts) {
      __effects.writes += 1;
      __effects.writePayload = { chatId, messages, meta, opts };
      __latest = {
        snapshotId: 'snapshot-fixed',
        chatId,
        createdAt: '${CAPTURED_AT}',
        messageCount: messages.length,
        messages,
        meta,
      };
      return {
        ok: true,
        deduped: false,
        snapshotId: 'snapshot-fixed',
        createdAt: '${CAPTURED_AT}',
        messageCount: messages.length,
      };
    }
    const loadLatestSnapshotInternal = async () => __latest;
    const afterSnapshotCaptured = async () => { __effects.afterWrites += 1; return { ok: true }; };
    const showCaptureSaveStrip = () => { __effects.saveStrips += 1; return true; };
    ${functions.map((name) => extractFunction(source, name)).join('\n')}
    globalThis.__api = Object.freeze({
      fetchConversationCapture,
      captureNow,
      effects: () => JSON.parse(JSON.stringify(__effects)),
    });
  `;
  const sandbox = {
    console: Object.freeze({ log() {}, warn() {}, error() {} }),
    Date,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    fetch: fetchImpl || (() => { throw new Error('raw-fetch-forbidden'); }),
    H2O: authority ? { BackendAuthority: authority } : {},
    __currentChatId: currentChatId,
    __domMessages: domMessages,
    location: {
      origin: 'https://chatgpt.com',
      href: currentChatId ? `https://chatgpt.com/c/${currentChatId}` : 'https://chatgpt.com/',
    },
    localStorage: {
      get length() { return 0; },
      key() { return null; },
      getItem() { return null; },
    },
    document: {
      title: 'DOM Fixture',
      querySelectorAll() { return []; },
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(program, context, { filename: ARCHIVE_REL, timeout: 5_000 });
  return context.__api;
}

function directFetch(body, calls) {
  return async (url) => {
    calls.push(String(url));
    if (String(url) === '/api/auth/session') {
      return { ok: true, status: 200, async json() { return { accessToken: 'fixture-token' }; } };
    }
    return {
      ok: true,
      status: 200,
      async json() { return body; },
      clone() { return { async json() { return body; } }; },
    };
  };
}

function authorityReturning(result, calls) {
  return {
    async request(spec) {
      calls.push(spec);
      return typeof result === 'function' ? result(spec) : result;
    },
  };
}

function assertTurnFailureEnvelope(result, expectedCode) {
  equal(result.errorCode, expectedCode, `turn-index status must map to ${expectedCode}`);
  equal(Object.keys(result).sort(), ['chatId', 'errorCode', 'nodeCount', 'ok', 'schema'], 'turn-index failure envelope must not leak authority fields');
}

function assertCaptureNoAuthorityLeak(result) {
  for (const key of ['status', 'body', 'rateLimited', 'retryAfterMs', 'authorityUnavailable', 'beforeAcquire', 'timedOut', 'aborted']) {
    check(!Object.hasOwn(result, key), `capture envelope must not leak ${key}`);
  }
}

await test('source routing and raw transport removal', async () => {
  assertMigratedSource(archiveSource);
  assertions += 9;

  const rawMutation = `${archiveSource}\nW.fetch('/backend-api/conversation/mutation');\n`;
  assert.throws(() => assertMigratedSource(rawMutation), /conversation endpoint|raw fetch/, 'raw transport mutation must fail');
  const budgetMutation = archiveSource.replace('timeoutMs: remainingBudget,', 'timeoutMs,');
  assert.throws(() => assertMigratedSource(budgetMutation), /remaining provider budget/, 'fresh-timeout mutation must fail');
  assertions += 2;
});

const payload = makePayload();

await test('successful turn-index differential and one logical authority operation', async () => {
  const oldCalls = [];
  const newCalls = [];
  const oldApi = createTurnRuntime(controlSource, { fetchImpl: directFetch(payload, oldCalls) });
  const newApi = createTurnRuntime(archiveSource, {
    authority: authorityReturning({ ok: true, status: 'ok', statusCode: 200, body: payload }, newCalls),
  });
  const opts = { capturedAt: CAPTURED_AT, includeIdentityGraph: true };
  const oldResult = await oldApi.fetchConversationTurnIndex(CHAT_ID, opts);
  const newResult = await newApi.fetchConversationTurnIndex(CHAT_ID, opts);
  equal(newResult, oldResult, 'authority migration must preserve successful turn-index output byte-for-byte');
  equal(newCalls.length, 1, 'turn-index must issue exactly one logical authority operation');
  equal(newCalls[0].resource, 'conversation', 'turn-index resource');
  equal(newCalls[0].chatId, CHAT_ID, 'turn-index chat id');
  equal(newCalls[0].method, 'GET', 'turn-index method');
  equal(oldCalls.length, 2, 'direct control must exercise session plus conversation transport');
});

await test('turn-index status translation and no feature retry', async () => {
  const cases = [
    [{ ok: false, status: 'unauthorized-failed-closed', statusCode: 401, body: { secret: true } }, 'backend-401'],
    [{ ok: false, status: 'forbidden-failed-closed', statusCode: 403, body: { secret: true } }, 'backend-403'],
    [{ ok: false, status: 'rate-limited-cooldown', statusCode: 429, rateLimited: true, retryAfterMs: 9999 }, 'backend-429'],
    [{ ok: false, status: 'backend-503', statusCode: 503, body: { secret: true } }, 'backend-503'],
    [{ ok: false, status: 'network-error', error: 'offline' }, 'backend-request-failed'],
    [{ ok: false, status: 'authority-unavailable', reason: 'unsupported-origin', authorityUnavailable: true }, 'fetch-unavailable'],
    [{ ok: false, status: 'authority-unavailable', reason: 'fetch-unavailable', authorityUnavailable: true }, 'fetch-unavailable'],
    [{ ok: false, status: 'authority-unavailable', reason: 'web-locks-unavailable', authorityUnavailable: true }, 'fetch-unavailable'],
    [{ ok: false, status: 'authority-unavailable', reason: 'storage-unavailable', authorityUnavailable: true }, 'fetch-unavailable'],
    [{ ok: false, status: 'authority-unavailable', reason: 'lock-request-failed', authorityUnavailable: true }, 'backend-request-failed'],
    [{ ok: false, status: 'timeout', timedOut: true }, 'turn-index-timeout'],
  ];
  for (const [authorityResult, expected] of cases) {
    const calls = [];
    const api = createTurnRuntime(archiveSource, { authority: authorityReturning(authorityResult, calls) });
    const result = await api.fetchConversationTurnIndex(CHAT_ID, { capturedAt: CAPTURED_AT });
    assertTurnFailureEnvelope(result, expected);
    equal(calls.length, 1, `${authorityResult.status}/${authorityResult.reason || ''} must not feature-retry`);
  }
});

await test('caller abort reaches authority through the provider controller', async () => {
  const caller = new AbortController();
  let authoritySignal = null;
  const calls = [];
  const authority = {
    request(spec) {
      calls.push(spec);
      authoritySignal = spec.signal;
      return new Promise((resolve) => {
        const done = () => resolve({ ok: false, status: 'aborted', aborted: true, beforeAcquire: true });
        if (spec.signal.aborted) done();
        else spec.signal.addEventListener('abort', done, { once: true });
      });
    },
  };
  const api = createTurnRuntime(archiveSource, { authority });
  const pending = api.fetchConversationTurnIndex(CHAT_ID, { signal: caller.signal, timeoutMs: 2000, capturedAt: CAPTURED_AT });
  caller.abort();
  const result = await pending;
  assertTurnFailureEnvelope(result, 'turn-index-aborted');
  check(authoritySignal && authoritySignal !== caller.signal, 'authority must receive the provider-owned controller signal');
  equal(authoritySignal.aborted, true, 'caller abort must propagate to the authority signal');
  equal(calls.length, 1, 'aborted provider must issue one logical authority operation');
});

await test('provider timeout wins abort disambiguation and cancels queued authority work', async () => {
  let authoritySignal = null;
  const api = createTurnRuntime(archiveSource, {
    authority: {
      request(spec) {
        authoritySignal = spec.signal;
        return new Promise((resolve) => {
          spec.signal.addEventListener('abort', () => resolve({ ok: false, status: 'aborted', aborted: true, beforeAcquire: true }), { once: true });
        });
      },
    },
  });
  const started = Date.now();
  const result = await api.fetchConversationTurnIndex(CHAT_ID, { timeoutMs: 250, capturedAt: CAPTURED_AT });
  const elapsed = Date.now() - started;
  assertTurnFailureEnvelope(result, 'turn-index-timeout');
  equal(authoritySignal.aborted, true, 'provider timeout must abort queued authority acquisition');
  check(elapsed >= 200 && elapsed < 1500, `provider timeout must remain authoritative (elapsed ${elapsed}ms)`);
});

await test('authority receives only the remaining absolute provider deadline', async () => {
  const ticks = [1_000, 5_000];
  class DeadlineDate extends Date {
    static now() { return ticks.length ? ticks.shift() : 5_000; }
  }
  const calls = [];
  const api = createTurnRuntime(archiveSource, {
    DateImpl: DeadlineDate,
    authority: authorityReturning({ ok: false, status: 'timeout', timedOut: true }, calls),
  });
  const result = await api.fetchConversationTurnIndex(CHAT_ID, { timeoutMs: 4500, capturedAt: CAPTURED_AT });
  assertTurnFailureEnvelope(result, 'turn-index-timeout');
  equal(calls[0].timeoutMs, 500, '4000ms elapsed under a 4500ms provider deadline must leave 500ms');
});

await test('graph-too-large remains a successful provider result', async () => {
  const largePayload = makePayload(8190);
  const calls = [];
  const api = createTurnRuntime(archiveSource, {
    authority: authorityReturning({ ok: true, status: 'ok', statusCode: 200, body: largePayload }, calls),
  });
  const result = await api.fetchConversationTurnIndex(CHAT_ID, {
    capturedAt: CAPTURED_AT,
    includeIdentityGraph: true,
  });
  equal(result.ok, true, 'graph-too-large must not become a provider failure');
  equal(result.identityGraph, null, 'graph-too-large identityGraph');
  equal(result.identityGraphError, 'graph-too-large', 'graph-too-large identityGraphError');
  check(result.index?.turns?.length === 1, 'graph-too-large must retain the valid index');
  equal(calls.length, 1, 'graph-too-large path must issue one logical authority operation');
});

await test('successful capture differential preserves Archive-facing output and write payload', async () => {
  const oldCalls = [];
  const newCalls = [];
  const oldApi = createCaptureRuntime(controlSource, { fetchImpl: directFetch(payload, oldCalls) });
  const newApi = createCaptureRuntime(archiveSource, {
    authority: authorityReturning({ ok: true, status: 'ok', statusCode: 200, body: payload }, newCalls),
  });
  const opts = {
    href: `https://chatgpt.com/c/${CHAT_ID}`,
    title: 'Caller title loses to backend title',
    source: 'library-caller',
    originSource: 'library-actions',
  };
  const oldResult = await oldApi.captureNow(CHAT_ID, opts);
  const newResult = await newApi.captureNow(CHAT_ID, opts);
  equal(newResult, oldResult, 'captureNow successful public output must be byte-identical to the direct-transport control');
  equal(newApi.effects().writePayload, oldApi.effects().writePayload, 'capture storage payload must be byte-identical to the direct-transport control');
  equal(newResult.captureSource, 'backend', 'backend captureSource must be preserved');
  equal(newApi.effects().writePayload.meta.source, 'backend-conversation', 'backend metadata source must be preserved');
  equal(newApi.effects().writePayload.meta.originSource, 'library-actions', 'caller metadata overrides must be preserved');
  equal(newCalls.length, 1, 'capture must issue exactly one logical authority operation');
  equal(oldCalls.length, 2, 'direct capture control must exercise session plus conversation transport');
});

await test('capture DOM selection and DOM-empty fallback remain unchanged', async () => {
  const domCalls = [];
  const domApi = createCaptureRuntime(archiveSource, {
    currentChatId: CHAT_ID,
    domMessages: [{ role: 'user', text: 'DOM question', order: 0 }],
    authority: authorityReturning({ ok: true, body: payload }, domCalls),
  });
  const domResult = await domApi.captureNow(CHAT_ID, {});
  equal(domResult.captureSource, 'dom', 'non-empty current-chat DOM capture must remain DOM-selected');
  equal(domCalls.length, 0, 'non-empty DOM capture must not call the backend authority');

  const fallbackCalls = [];
  const fallbackApi = createCaptureRuntime(archiveSource, {
    currentChatId: CHAT_ID,
    domMessages: [],
    authority: authorityReturning({ ok: true, status: 'ok', statusCode: 200, body: payload }, fallbackCalls),
  });
  const fallbackResult = await fallbackApi.captureNow(CHAT_ID, {});
  equal(fallbackResult.captureSource, 'backend', 'DOM-empty current-chat capture must fall back to backend');
  equal(fallbackCalls.length, 1, 'DOM-empty fallback must issue at most one logical backend capture operation');
});

await test('capture failures retain vocabulary, do not retry, and fail before archive side effects', async () => {
  const cases = [
    ['429/cooldown', { ok: false, status: 'rate-limited-cooldown', statusCode: 429, rateLimited: true, retryAfterMs: 9999 }, 'backend-429', 429],
    ['authority unavailable', { ok: false, status: 'authority-unavailable', reason: 'lock-request-failed', authorityUnavailable: true }, 'backend-request-failed', 0],
    ['network error', { ok: false, status: 'network-error', error: 'offline' }, 'backend-request-failed', 0],
    ['authority timeout', { ok: false, status: 'timeout', timedOut: true }, 'backend-request-failed', 0],
    ['401', { ok: false, status: 'unauthorized-failed-closed', statusCode: 401, body: { private: true } }, 'backend-401', 401],
    ['403', { ok: false, status: 'forbidden-failed-closed', statusCode: 403, body: { private: true } }, 'backend-403', 403],
    ['backend 5xx', { ok: false, status: 'backend-503', statusCode: 503, body: { private: true } }, 'backend-503', 503],
    ['capability unavailable', { ok: false, status: 'authority-unavailable', reason: 'storage-unavailable', authorityUnavailable: true }, 'fetch-unavailable', 0],
  ];
  for (const [label, authorityResult, expectedReason, expectedStatus] of cases) {
    const calls = [];
    const api = createCaptureRuntime(archiveSource, { authority: authorityReturning(authorityResult, calls) });
    const result = await api.captureNow(CHAT_ID, { originSource: 'failure-fixture' });
    equal(result.ok, false, `${label}: capture must fail`);
    equal(result.reason, expectedReason, `${label}: public failure reason`);
    equal(result.captureSource, 'backend', `${label}: captureSource`);
    if (expectedStatus) equal(result.statusCode, expectedStatus, `${label}: existing statusCode contract`);
    assertCaptureNoAuthorityLeak(result);
    equal(calls.length, 1, `${label}: no feature-level retry`);
    equal(api.effects(), {
      metaCalls: 0,
      writes: 0,
      afterWrites: 0,
      saveStrips: 0,
      writePayload: null,
    }, `${label}: failed backend read must fail before all archive side effects`);
  }
});

console.log('PASS validate-archive-authority-integration');
console.log(`  assertions: ${assertions}`);
console.log(`  fixtures: ${pass.length}`);
for (const name of pass) console.log(`    ✓ ${name}`);
console.log('  differential normalization: none (successful outputs and write payloads are byte-identical)');
console.log('  network: mocked authority/direct-control transport only');
