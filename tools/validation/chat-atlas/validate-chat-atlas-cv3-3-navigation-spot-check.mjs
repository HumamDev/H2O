#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const helperPath = path.join(here, 'chat-atlas-cv3-3-navigation-spot-check-console.js');
const source = fs.readFileSync(helperPath, 'utf8');
const evidenceKey = 'h2o:cv3-3:navigation:v1';

let contextSequence = 0;
let sourceSetterCalls = 0;
let navigationMutationCalls = 0;
let domMutationCalls = 0;

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  const stats = { getItem: 0, setItem: 0, removeItem: 0 };
  return {
    get length() { return values.size; },
    key(index) { return Array.from(values.keys())[index] ?? null; },
    getItem(key) {
      stats.getItem += 1;
      return values.has(String(key)) ? values.get(String(key)) : null;
    },
    setItem(key, value) {
      stats.setItem += 1;
      values.set(String(key), String(value));
    },
    removeItem(key) {
      stats.removeItem += 1;
      values.delete(String(key));
    },
    dump() { return Object.fromEntries(values); },
    stats() { return { ...stats }; },
  };
}

function createHelperContext(options = {}) {
  contextSequence += 1;
  const route = {
    href: options.href || 'https://chatgpt.com/c/fixture-chat-a',
    pathname: options.pathname || '/c/fixture-chat-a',
    chatKey: options.chatKey || 'fixture-chat-a',
  };
  const sourceState = {
    activeSource: options.activeSource || 'legacy-durable-cache',
    effectiveSource: options.effectiveSource || 'legacy-durable-cache',
    defaultSource: 'legacy-durable-cache',
    persisted: false,
    switchCount: 0,
  };
  const sessionStorage = options.sessionStorage || createStorage();
  const localStorage = options.localStorage || createStorage();
  const records = Array.from({ length: 3 }, (_, index) => ({
    turnNo: index + 1,
    qId: `fixture-question-${index + 1}`,
    primaryAId: `fixture-answer-${index + 1}`,
  }));
  const buttons = records.map((record) => ({
    dataset: {
      turnIdx: String(record.turnNo),
      questionId: record.qId,
      primaryAId: record.primaryAId,
    },
  }));
  const miniMapRoot = Object.freeze({ querySelectorAll() { return buttons; } });
  const document = Object.freeze({
    querySelector() { return miniMapRoot; },
    createElement() {
      domMutationCalls += 1;
      throw new Error('DOM mutation forbidden');
    },
    append() {
      domMutationCalls += 1;
      throw new Error('DOM mutation forbidden');
    },
  });
  const location = {};
  Object.defineProperties(location, {
    href: {
      get() { return route.href; },
      set() { navigationMutationCalls += 1; throw new Error('navigation forbidden'); },
    },
    pathname: {
      get() { return route.pathname; },
      set() { navigationMutationCalls += 1; throw new Error('navigation forbidden'); },
    },
  });
  location.assign = () => { navigationMutationCalls += 1; throw new Error('navigation forbidden'); };
  location.replace = () => { navigationMutationCalls += 1; throw new Error('navigation forbidden'); };
  location.reload = () => { navigationMutationCalls += 1; throw new Error('reload forbidden'); };

  const runtime = Object.freeze({
    getChatAtlasCanonicalSource() { return sourceState.activeSource; },
    setChatAtlasCanonicalSource() {
      sourceSetterCalls += 1;
      throw new Error('source setter forbidden');
    },
    listTurnRecords() { return records; },
    getChatAtlasLedgerSnapshot() {
      return {
        ledgerReady: true,
        chatKey: route.chatKey,
        version: 7,
        memberCount: records.length,
        members: records,
        quarantinedAliasCount: 0,
      };
    },
    getChatAtlasLedgerDiagnostics() {
      return {
        ledgerReady: true,
        canonicalSource: {
          ...sourceState,
          lastSelection: {
            legacyCount: records.length,
            selectedCount: records.length,
          },
        },
        dualRun: {
          ready: true,
          exactParity: true,
          legacyCount: records.length,
          adapterCount: records.length,
          currentMismatchCount: 0,
          totalMismatchCount: 0,
          instrumentationErrorCount: 0,
          evidenceChatKey: route.chatKey,
          ledgerChatKey: route.chatKey,
        },
        currentCrossMemberDuplicateCount: 0,
        crossMemberAliasConflictCount: 0,
        currentAliasConflictCount: 0,
        historicalAliasConflictCount: 0,
        duplicateAliasCount: 0,
        quarantinedAliasCount: 0,
      };
    },
    getChatAtlasConvergenceParity() {
      return { parityStatus: 'exact', blockers: [] };
    },
  });
  const crypto = Object.freeze({
    subtle: Object.freeze({
      async digest(algorithm, bytes) {
        assert.equal(algorithm, 'SHA-256');
        const digest = createHash('sha256').update(Buffer.from(bytes)).digest();
        return digest.buffer.slice(digest.byteOffset, digest.byteOffset + digest.byteLength);
      },
    }),
  });
  const context = vm.createContext({
    console: Object.freeze({ info() {}, log() {}, warn() {}, error() {} }),
    crypto,
    document,
    location,
    sessionStorage,
    localStorage,
    TextEncoder,
    Uint8Array,
    H2O_MM_mapButtons: Object.freeze({ size: records.length }),
    H2O_MM_turnById: Object.freeze({ size: records.length }),
    H2O_MM_CORE_API: Object.freeze({ getTurnList() { return records; } }),
    H2O: Object.freeze({
      surface: Object.freeze({ chatId() { return route.chatKey; } }),
      turnRuntime: runtime,
    }),
  });
  vm.runInContext(source, context, { filename: helperPath });
  return {
    api: context.H2O_CV3_3_NAV_SPOT_CHECK,
    sessionStorage,
    localStorage,
    route,
    sourceState,
  };
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('evaluation is inert and installs the expected API surface', () => {
  const beforeSetter = sourceSetterCalls;
  const beforeNavigation = navigationMutationCalls;
  const beforeDom = domMutationCalls;
  const harness = createHelperContext();
  assert.equal(harness.api.version, 'cv3.3-navigation-spot-check-v1');
  assert.deepEqual(Array.from(Object.keys(harness.api).sort()), [
    'CLEANUP',
    'EXPORT',
    'SNAPSHOT',
    'START',
    'limits',
    'version',
  ]);
  assert.equal(harness.sessionStorage.stats().setItem, 0);
  assert.equal(harness.localStorage.stats().setItem, 0);
  assert.equal(sourceSetterCalls, beforeSetter);
  assert.equal(navigationMutationCalls, beforeNavigation);
  assert.equal(domMutationCalls, beforeDom);
});

test('START enforces entry gates and writes bounded session evidence only', () => {
  const harness = createHelperContext();
  const result = harness.api.START({ scenarioId: 'CV3.3-S4-fixture-route-loop' });
  assert.equal(result.ok, true);
  assert.equal(result.snapshot.source.activeSource, 'legacy-durable-cache');
  assert.equal(result.snapshot.counts.canonical, 3);
  assert.equal(result.snapshot.gates.countsAligned, true);
  assert.equal(result.snapshot.miniMapAlignment.ok, true);
  assert.ok(result.bytes <= harness.api.limits.maxBytes);
  assert.ok(harness.sessionStorage.getItem(evidenceKey));
  assert.equal(harness.localStorage.stats().setItem, 0);
});

test('START fails closed when legacy entry state is not active', () => {
  const harness = createHelperContext({ activeSource: 'chat-atlas-ledger', effectiveSource: 'chat-atlas-ledger' });
  const result = harness.api.START({ scenarioId: 'CV3.3-S4-fixture-entry-fail' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'entry-gate-failed');
  assert.ok(result.failureReasons.includes('legacy-active-required'));
  assert.equal(harness.sessionStorage.getItem(evidenceKey), null);
});

test('SNAPSHOT records an A to B to C to A route loop without navigation actions', () => {
  const harness = createHelperContext();
  assert.equal(harness.api.START({ scenarioId: 'CV3.3-S4-fixture-abc-loop' }).ok, true);
  for (const [label, href, pathname, chatKey] of [
    ['A-ledger', 'https://chatgpt.com/c/fixture-chat-a', '/c/fixture-chat-a', 'fixture-chat-a'],
    ['B-ready', 'https://chatgpt.com/c/fixture-chat-b', '/c/fixture-chat-b', 'fixture-chat-b'],
    ['C-project-ready', 'https://chatgpt.com/g/fixture-gpt/c/fixture-chat-c', '/g/fixture-gpt/c/fixture-chat-c', 'fixture-chat-c'],
    ['A-return', 'https://chatgpt.com/c/fixture-chat-a', '/c/fixture-chat-a', 'fixture-chat-a'],
  ]) {
    harness.route.href = href;
    harness.route.pathname = pathname;
    harness.route.chatKey = chatKey;
    assert.equal(harness.api.SNAPSHOT(label).ok, true);
  }
  const evidence = JSON.parse(harness.sessionStorage.getItem(evidenceKey));
  assert.deepEqual(Array.from(evidence.snapshots.slice(1).map((snapshot) => snapshot.chatKey)), [
    'fixture-chat-a',
    'fixture-chat-b',
    'fixture-chat-c',
    'fixture-chat-a',
  ]);
  assert.equal(evidence.snapshots[3].routeType, 'project-or-custom-gpt');
  assert.equal(navigationMutationCalls, 0);
});

test('EXPORT returns stable bounded JSON with a verified SHA-256', async () => {
  const harness = createHelperContext();
  harness.api.START({ scenarioId: 'CV3.3-S4-fixture-export' });
  harness.api.SNAPSHOT('A-ready');
  const result = await harness.api.EXPORT();
  assert.equal(result.ok, true);
  assert.ok(result.bytes <= harness.api.limits.maxBytes);
  assert.equal(Buffer.byteLength(result.json, 'utf8'), result.bytes);
  assert.equal(createHash('sha256').update(result.json).digest('hex'), result.sha256);
  assert.match(result.fileName, /^CV3\.3-S4-fixture-export-/);
});

test('malformed evidence is rejected without throwing', () => {
  const sessionStorage = createStorage({ [evidenceKey]: '{not-json' });
  const harness = createHelperContext({ sessionStorage });
  const result = harness.api.SNAPSHOT('malformed-check');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'evidence-malformed-json');
});

test('oversized evidence is rejected before parsing or replacement', async () => {
  const raw = 'x'.repeat(64 * 1024 + 1);
  const sessionStorage = createStorage({ [evidenceKey]: raw });
  const harness = createHelperContext({ sessionStorage });
  const result = await harness.api.EXPORT();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'evidence-size-limit-exceeded');
  assert.equal(sessionStorage.getItem(evidenceKey), raw);
});

test('snapshot count is hard bounded', () => {
  const harness = createHelperContext();
  harness.api.START({ scenarioId: 'CV3.3-S7-fixture-bounded' });
  for (let index = 1; index < harness.api.limits.maxSnapshots; index += 1) {
    assert.equal(harness.api.SNAPSHOT(`snapshot-${index}`).ok, true);
  }
  const rejected = harness.api.SNAPSHOT('snapshot-over-limit');
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'snapshot-limit-exceeded');
  assert.equal(JSON.parse(harness.sessionStorage.getItem(evidenceKey)).snapshots.length, 24);
});

test('CLEANUP removes only cv3-3 evidence from both storage areas', () => {
  const harness = createHelperContext();
  harness.api.START({ scenarioId: 'CV3.3-S4-fixture-cleanup' });
  harness.sessionStorage.setItem('h2o:cv3-3:extra-session', 'owned');
  harness.localStorage.setItem('h2o:cv3-3:extra-local', 'owned');
  harness.sessionStorage.setItem('fixture-unrelated', 'keep');
  harness.localStorage.setItem('fixture-unrelated', 'keep');
  const result = harness.api.CLEANUP();
  assert.equal(result.ok, true);
  assert.equal(Object.keys(harness.sessionStorage.dump()).some((key) => key.startsWith('h2o:cv3-3:')), false);
  assert.equal(Object.keys(harness.localStorage.dump()).some((key) => key.startsWith('h2o:cv3-3:')), false);
  assert.equal(harness.sessionStorage.getItem('fixture-unrelated'), 'keep');
  assert.equal(harness.localStorage.getItem('fixture-unrelated'), 'keep');
});

test('source contains no setter, click, navigation, reload, or DOM-write call site', () => {
  assert.equal((source.match(/setChatAtlasCanonicalSource\s*\(/g) || []).length, 0);
  assert.doesNotMatch(source, /\.click\s*\(/);
  assert.doesNotMatch(source, /location\.(?:assign|replace|reload)\s*\(/);
  assert.doesNotMatch(source, /location\.(?:href|pathname)\s*=/);
  assert.doesNotMatch(source, /(?:appendChild|replaceChildren|insertBefore|removeChild|createElement)\s*\(/);
});

let failures = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

console.log(JSON.stringify({
  ok: failures === 0,
  helperPath,
  testCount: tests.length,
  failures,
  sourceSetterCalls,
  navigationMutationCalls,
  domMutationCalls,
}));

process.exitCode = failures === 0 ? 0 : 1;
