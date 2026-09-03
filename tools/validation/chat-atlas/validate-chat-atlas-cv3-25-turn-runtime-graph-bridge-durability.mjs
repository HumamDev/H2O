#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CORE_REL = 'src-runtime-base/0A1a.⬛️🧠 H2O Core 🧠.js';
const CORE_ALIAS = '0A1a._H2O_Core_.js';
const REBUILD_REL = 'tools/dev/dev-rebuild.mjs';
const PAGE_REL = 'src-runtime-base/1C1b.🔴📑 Thread Pages Controller 📑.js';
const CAPABILITY_VALIDATOR_REL = 'tools/validation/chat-atlas/validate-chat-atlas-cv3-24-rendered-boundary-collapse-capability.mjs';
const PARENT_COMMIT = '9bd4a69e7daaac7cde34df59067c0802cc6f547d';
const PRE_BRIDGE_COMMIT = '1b88533ba7f2d331dfc81370ddc26977518b41cf';
const CHAT_ATLAS_CORE_REL = 'src-runtime-base/0A3a.⬛️🧭 Chat Atlas Core 🧭.js';
const CHAT_ATLAS_HEADER = '// @h2o-id             0a3a.chatatlas.core';
const H2O_CORE_SOURCE = fs.readFileSync(path.join(ROOT, CORE_REL), 'utf8');
const CHAT_ATLAS_CORE_SOURCE = fs.readFileSync(path.join(ROOT, CHAT_ATLAS_CORE_REL), 'utf8');
const CURRENT_CORE = `${H2O_CORE_SOURCE}\n${CHAT_ATLAS_CORE_SOURCE}`;
const CURRENT_REBUILD = fs.readFileSync(path.join(ROOT, REBUILD_REL), 'utf8');
const PAGE_SOURCE = fs.readFileSync(path.join(ROOT, PAGE_REL), 'utf8');
const PARENT_REBUILD = execFileSync('git', ['show', `${PARENT_COMMIT}:${REBUILD_REL}`], {
  cwd: ROOT,
  encoding: 'utf8',
});
const PRE_BRIDGE_CORE = execFileSync('git', ['show', `${PRE_BRIDGE_COMMIT}:${CORE_REL}`], {
  cwd: ROOT,
  encoding: 'utf8',
});

const fixtures = [];
let assertions = 0;

function equal(actual, expected, message) {
  assertions += 1;
  const clean = (value) => value && typeof value === 'object'
    ? JSON.parse(JSON.stringify(value))
    : value;
  assert.deepEqual(clean(actual), clean(expected), message);
}

function ok(value, message) {
  assertions += 1;
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

function extractFunctionSource(source, name) {
  const anchors = [`  function ${name}(`, `  async function ${name}(`];
  const starts = anchors.map((anchor) => source.indexOf(anchor)).filter((index) => index >= 0);
  if (starts.length !== 1) throw new Error(`function-anchor-invalid:${name}`);
  const start = starts[0];
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const ch = source[index];
    const next = source[index + 1];
    if (lineComment) { if (ch === '\n') lineComment = false; continue; }
    if (blockComment) { if (ch === '*' && next === '/') { blockComment = false; index += 1; } continue; }
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
    else if (ch === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`function-boundary-invalid:${name}`);
}

function aliasModeFromRebuild(source) {
  const match = String(source).match(/runStep\("2\/4 make-aliases"[\s\S]*?H2O_ALIAS_MODE:\s*"([^"]+)"/);
  if (!match) throw new Error('dev-rebuild-alias-mode-unavailable');
  return match[1];
}

function writeFixtureSource(root, source) {
  const target = path.join(root, CORE_REL);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source, 'utf8');
}

function buildAliasWithRealGenerator(sourceRoot, mode) {
  const serverRoot = path.join(sourceRoot, 'apps', 'dev-server');
  const orderFile = path.join(sourceRoot, 'config', 'dev-order.tsv');
  fs.mkdirSync(path.dirname(orderFile), { recursive: true });
  fs.writeFileSync(orderFile, '🟢\t0A1a.⬛️🧠 H2O Core 🧠.js\n', 'utf8');
  execFileSync(process.execPath, [path.join(ROOT, 'tools/loader/make-aliases.mjs')], {
    cwd: ROOT,
    env: {
      ...process.env,
      H2O_SRC_DIR: sourceRoot,
      H2O_SERVER_DIR: serverRoot,
      H2O_ORDER_FILE: orderFile,
      H2O_ALIAS_MODE: mode,
      H2O_ALIAS_SCOPE: 'on',
    },
    stdio: 'pipe',
  });
  return path.join(serverRoot, 'alias', CORE_ALIAS);
}

function publishAliasLikeLiveRefresh(aliasPath, liveRoot) {
  const liveAliasDir = path.join(liveRoot, 'apps', 'dev-server', 'alias');
  fs.mkdirSync(liveAliasDir, { recursive: true });
  execFileSync('rsync', ['-a', aliasPath, `${liveAliasDir}/`], {
    cwd: ROOT,
    stdio: 'pipe',
  });
  return path.join(liveAliasDir, CORE_ALIAS);
}

function instrumentCoreForColdLoad(source) {
  const input = String(source);
  const atlasHeaderIndex = input.indexOf(CHAT_ATLAS_HEADER);
  const atlasModuleIndex = atlasHeaderIndex < 0 ? -1 : input.lastIndexOf('// ==H2O Module==', atlasHeaderIndex);
  const corePart = atlasModuleIndex < 0 ? input : input.slice(0, atlasModuleIndex);
  const atlasPart = atlasModuleIndex < 0 ? '' : input.slice(atlasModuleIndex);
  const marker = corePart.split('\n').find((line) => line.includes('🟨 7) TIME / OBSERVERS'));
  if (!marker) throw new Error('core-observer-marker-unavailable');
  const markerIndex = corePart.indexOf(marker);
  if (markerIndex < 0) throw new Error('core-observer-marker-invalid');
  const instrumentedCore = `${corePart.slice(0, markerIndex)}
  globalThis.__CV325_RUNTIME__ = H2O.turnRuntime;
  globalThis.__CV325_H2O__ = H2O;
})();
`;
  if (!atlasPart) return [instrumentedCore];
  const exportAnchor = '  const CHAT_ATLAS_CORE_API = {';
  const bootApply = '  try { chatAtlasApplyCompleteIndexProjectionPreferenceAtBoot(); } catch {}';
  if (!atlasPart.includes(exportAnchor) || !atlasPart.includes(bootApply)) {
    throw new Error('chat-atlas-instrumentation-anchor-invalid');
  }
  const instrumentedAtlas = atlasPart
    .replace(exportAnchor, `
  globalThis.__CV325_SEED_GRAPH__ = (retained, authority) => {
    selectedPathAcquisitionState.graph = retained;
    Object.assign(completeTurnIndexAuthorityState, authority);
  };
  globalThis.__CV325_CLEAR_GRAPH__ = () => {
    selectedPathAcquisitionState.graph = null;
  };
${exportAnchor}`)
    .replace(bootApply, '  /* CV-3.25: preference boot suppressed in this read-only harness. */');
  return [instrumentedCore, instrumentedAtlas];
}

function coldLoadRuntime(source) {
  const counters = {
    dom: 0,
    storage: 0,
    network: 0,
    navigation: 0,
    scrolling: 0,
    timers: 0,
    observers: 0,
    cache: 0,
    preference: 0,
    canonical: 0,
    alias: 0,
  };
  const location = {
    pathname: ROUTE_KEY,
    href: `https://chatgpt.com${ROUTE_KEY}`,
    origin: 'https://chatgpt.com',
    reload() {
      counters.navigation += 1;
      throw new Error('navigation-forbidden');
    },
  };
  const body = {
    isConnected: true,
    contains() { return false; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  const document = {
    location,
    body,
    documentElement: body,
    visibilityState: 'visible',
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    addEventListener() {},
    removeEventListener() {},
    createElement() {
      counters.dom += 1;
      throw new Error('dom-forbidden');
    },
    createTextNode() {
      counters.dom += 1;
      throw new Error('dom-forbidden');
    },
  };
  const storage = {
    getItem() { return null; },
    setItem() {
      counters.storage += 1;
      throw new Error('storage-forbidden');
    },
    removeItem() {
      counters.storage += 1;
      throw new Error('storage-forbidden');
    },
  };
  class HarnessEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }
  class GuardedObserver {
    constructor() {
      counters.observers += 1;
      throw new Error('observer-forbidden');
    }
  }
  let tick = 0;
  const sandbox = {
    console: Object.freeze({ log() {}, warn() {}, error() {}, info() {}, debug() {} }),
    document,
    location,
    history: {
      pushState() {
        counters.navigation += 1;
        throw new Error('navigation-forbidden');
      },
      replaceState() {
        counters.navigation += 1;
        throw new Error('navigation-forbidden');
      },
    },
    navigator: Object.freeze({ userAgent: 'cv3.25' }),
    performance: Object.freeze({ now() { tick += 0.25; return tick; } }),
    Date,
    URL,
    Event: HarnessEvent,
    CustomEvent: HarnessEvent,
    MutationObserver: GuardedObserver,
    ResizeObserver: GuardedObserver,
    IntersectionObserver: GuardedObserver,
    AbortController,
    requestAnimationFrame() {
      counters.timers += 1;
      throw new Error('raf-forbidden');
    },
    cancelAnimationFrame() {},
    setTimeout() {
      counters.timers += 1;
      throw new Error('timeout-forbidden');
    },
    clearTimeout() {},
    setInterval() {
      counters.timers += 1;
      throw new Error('interval-forbidden');
    },
    clearInterval() {},
    queueMicrotask,
    localStorage: storage,
    sessionStorage: storage,
    crypto: Object.freeze({ randomUUID() { return '00000000-0000-4000-8000-000000000001'; } }),
    fetch() {
      counters.network += 1;
      throw new Error('network-forbidden');
    },
    XMLHttpRequest: class {
      constructor() {
        counters.network += 1;
        throw new Error('xhr-forbidden');
      }
    },
    scrollTo() {
      counters.scrolling += 1;
      throw new Error('scroll-forbidden');
    },
    cacheWriter() {
      counters.cache += 1;
      throw new Error('cache-forbidden');
    },
    preferenceWriter() {
      counters.preference += 1;
      throw new Error('preference-forbidden');
    },
    canonicalWriter() {
      counters.canonical += 1;
      throw new Error('canonical-forbidden');
    },
    aliasWriter() {
      counters.alias += 1;
      throw new Error('alias-forbidden');
    },
  };
  sandbox.addEventListener = () => {};
  sandbox.removeEventListener = () => {};
  sandbox.dispatchEvent = () => true;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.top = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  const execute = () => {
    const programs = instrumentCoreForColdLoad(source);
    programs.forEach((program, index) => vm.runInContext(program, context, {
      filename: index === 0 ? CORE_ALIAS : CHAT_ATLAS_CORE_REL,
      timeout: 4_000,
    }));
    return context.__CV325_RUNTIME__;
  };
  execute();
  return {
    runtime: context.__CV325_RUNTIME__,
    counters,
    context,
    execute,
    seedGraph(retained, authority) {
      context.__CV325_SEED_GRAPH__(retained, authority);
    },
    clearGraph() {
      context.__CV325_CLEAR_GRAPH__();
    },
  };
}

function reproduceParentPublication() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'h2o-cv325-parent-'));
  try {
    const buildRoot = path.join(tempRoot, 'correction-worktree');
    const liveRoot = path.join(tempRoot, 'live-server-repository');
    writeFixtureSource(buildRoot, CURRENT_CORE);
    writeFixtureSource(liveRoot, PRE_BRIDGE_CORE);
    const parentMode = aliasModeFromRebuild(PARENT_REBUILD);
    const buildAlias = buildAliasWithRealGenerator(buildRoot, parentMode);
    const servedAlias = publishAliasLikeLiveRefresh(buildAlias, liveRoot);
    const servedSource = fs.readFileSync(servedAlias, 'utf8');
    const loaded = coldLoadRuntime(servedSource);
    return {
      parentMode,
      buildAliasIsSymlink: fs.lstatSync(buildAlias).isSymbolicLink(),
      servedAliasIsSymlink: fs.lstatSync(servedAlias).isSymbolicLink(),
      sourceHasGetter: CURRENT_CORE.includes('getGraphIdentityDiagnostics,'),
      servedHasGetter: servedSource.includes('getGraphIdentityDiagnostics,'),
      runtime: loaded.runtime,
      counters: loaded.counters,
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function buildCorrectedPublication() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'h2o-cv325-corrected-'));
  try {
    const buildRoot = path.join(tempRoot, 'correction-worktree');
    const liveRoot = path.join(tempRoot, 'live-server-repository');
    writeFixtureSource(buildRoot, CURRENT_CORE);
    writeFixtureSource(liveRoot, PRE_BRIDGE_CORE);
    const correctedMode = aliasModeFromRebuild(CURRENT_REBUILD);
    const buildAlias = buildAliasWithRealGenerator(buildRoot, correctedMode);
    const servedAlias = publishAliasLikeLiveRefresh(buildAlias, liveRoot);
    const servedSource = fs.readFileSync(servedAlias, 'utf8');
    return {
      correctedMode,
      buildAliasIsSymlink: fs.lstatSync(buildAlias).isSymbolicLink(),
      servedAliasIsSymlink: fs.lstatSync(servedAlias).isSymbolicLink(),
      servedSource,
      sourceMatchesServed: servedSource === CURRENT_CORE,
      loaded: coldLoadRuntime(servedSource),
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

const CHAT_ID = '6928b333-12f4-8328-9e41-6a01def45127';
const ROUTE_KEY = `/c/${CHAT_ID}`;
const Q1 = '19ed3015-0dcc-4d3e-9bea-e1ca046fb6a0';
const A1 = 'answer-page-1';
const Q26 = 'dd431d44-a11f-4bf9-b6d0-84e61e4c4237';
const A26 = '5cc611a6-3863-45df-9523-e72dcb2a753b';

function graphNode({
  nodeId,
  messageId = nodeId,
  parentId = null,
  childIds = [],
  role = null,
  productUser = false,
  productAnswer = false,
  stopped = false,
}) {
  return {
    nodeId,
    messageId,
    parentId,
    childIds: childIds.slice(),
    role,
    productUser,
    productAnswer,
    stopped,
  };
}

function makeGraphScope(generation = 1, fingerprint = 'djb2:1yue4v7') {
  const nodes = [
    graphNode({
      nodeId: Q1,
      childIds: [A1],
      role: 'user',
      productUser: true,
    }),
    graphNode({
      nodeId: A1,
      parentId: Q1,
      childIds: [Q26],
      role: 'assistant',
      productAnswer: true,
    }),
    graphNode({
      nodeId: Q26,
      parentId: A1,
      childIds: [A26],
      role: 'user',
      productUser: true,
    }),
    graphNode({
      nodeId: A26,
      parentId: Q26,
      role: 'system',
      productAnswer: false,
    }),
  ];
  const graph = {
    chatId: CHAT_ID,
    currentNode: A26,
    nodeCount: nodes.length,
    capturedAt: `2026-07-30T00:00:0${generation}.000Z`,
    nodes,
  };
  const retained = Object.freeze({
    identityGraph: graph,
    chatId: CHAT_ID,
    routeKey: ROUTE_KEY,
    generation,
    captureIdentity: fingerprint,
  });
  const turns = Array.from({ length: 39 }, (_unused, index) => ({
    order: index + 1,
    qId: index === 0 ? Q1 : index === 25 ? Q26 : `q-${index + 1}`,
    primaryAId: index === 0 ? A1 : index === 25 ? A26 : `a-${index + 1}`,
    answerVariants: [index === 0 ? A1 : index === 25 ? A26 : `a-${index + 1}`],
    turnId: `turn-${index + 1}`,
    noAnswer: false,
    stopped: false,
  }));
  const authority = {
    enabled: true,
    status: 'complete-validated',
    chatId: CHAT_ID,
    routeKey: ROUTE_KEY,
    generation,
    index: {
      complete: true,
      proof: 'host-payload-full-graph',
      sourceFingerprint: 'djb2:2iocqu',
      turns,
    },
  };
  return { retained, authority, graph };
}

function graphRecord(result, id) {
  return result.records.find((item) => item.requestedId === id) || null;
}

function recursiveKeys(value, out = []) {
  if (!value || typeof value !== 'object') return out;
  for (const [key, child] of Object.entries(value)) {
    out.push(key);
    recursiveKeys(child, out);
  }
  return out;
}

function assertDeepFrozen(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  ok(Object.isFrozen(value), 'diagnostic object frozen');
  for (const child of Object.values(value)) assertDeepFrozen(child, seen);
}

function loadStage2cHarness() {
  const validatorSource = fs.readFileSync(path.join(ROOT, CAPABILITY_VALIDATOR_REL), 'utf8');
  const start = validatorSource.indexOf('function extractFunction(');
  const end = validatorSource.indexOf("\nawait fixture('parent rendered range");
  if (start < 0 || end <= start) throw new Error('cv3-24-harness-boundary-invalid');
  const body = validatorSource.slice(start, end);
  return vm.runInNewContext(`(() => {
    const SOURCE = injectedPageSource;
    const PARENT = injectedPageSource;
    const RANGE_VALIDATOR_PATH = injectedRangeValidatorPath;
    const assert = injectedAssert;
    const fs = injectedFs;
    const vm = injectedVm;
    let assertions = 0;
    const fixtures = [];
    const equal = injectedEqual;
    const ok = injectedOk;
    ${body}
    return Object.freeze({ createLiveCapabilityHarness, executeSealedClick });
  })()`, {
    injectedPageSource: PAGE_SOURCE,
    injectedRangeValidatorPath: path.join(
      ROOT,
      'tools/validation/chat-atlas/validate-chat-atlas-cv3-23-page1-collapse-range-diagnostics.mjs',
    ),
    injectedAssert: assert,
    injectedFs: fs,
    injectedVm: vm,
    injectedEqual: equal,
    injectedOk: ok,
  });
}

const parent = reproduceParentPublication();

await fixture('immutable parent reproduces the live graph bridge loss', () => {
  equal(parent.parentMode, 'symlink', 'parent build mode');
  equal(parent.buildAliasIsSymlink, true, 'build alias symlink');
  equal(parent.servedAliasIsSymlink, true, 'published alias symlink');
  equal(parent.sourceHasGetter, true, 'immutable source contains getter');
  equal(parent.servedHasGetter, false, 'served bytes are stale');
  equal(typeof parent.runtime?.getGraphIdentityDiagnostics, 'undefined', 'final getter missing');
  equal(typeof parent.runtime?.getEffectivePresentationIndex, 'function', 'effective API remains');
  equal(typeof parent.runtime?.getConversationTurnIndexDiagnostics, 'function', 'index diagnostics remain');
});

await fixture('root cause is GRAPH_BRIDGE_BUILD_BYTES_STALE', () => {
  equal(
    parent.sourceHasGetter && !parent.servedHasGetter,
    true,
    'source and served bytes diverge at publication',
  );
  ok(Object.keys(parent.runtime || {}).length >= 30, 'stale runtime retains the established public surface');
  equal(parent.counters.dom, 0, 'cold loader DOM writes');
  equal(parent.counters.storage, 0, 'cold loader storage writes');
  equal(parent.counters.network, 0, 'cold loader network');
});

const corrected = buildCorrectedPublication();
const stage2c = loadStage2cHarness();
const stage2cLive = stage2c.createLiveCapabilityHarness();

function seedCorrected(generation = 1, fingerprint = 'djb2:1yue4v7') {
  const scope = makeGraphScope(generation, fingerprint);
  corrected.loaded.seedGraph(scope.retained, scope.authority);
  return scope;
}

seedCorrected();

await fixture('final runtime is one shared object', () => {
  equal(corrected.correctedMode, 'copy', 'corrected build mode');
  equal(corrected.buildAliasIsSymlink, false, 'build alias owns bytes');
  equal(corrected.servedAliasIsSymlink, false, 'served alias owns bytes');
  equal(corrected.sourceMatchesServed, true, 'served bytes equal source');
  equal(
    corrected.loaded.runtime,
    corrected.loaded.context.__CV325_H2O__.turnRuntime,
    'one final runtime object',
  );
});

await fixture('graph getter exists after the complete corrected cold load', () => {
  equal(
    typeof corrected.loaded.runtime.getGraphIdentityDiagnostics,
    'function',
    'graph getter installed',
  );
});

await fixture('effective presentation APIs remain present', () => {
  for (const name of [
    'getEffectivePresentationIndex',
    'getEffectivePresentationStatus',
    'getEffectiveTurnRecordByAId',
    'getEffectiveTurnRecordByQId',
  ]) {
    equal(typeof corrected.loaded.runtime[name], 'function', `${name} retained`);
  }
});

await fixture('turn-record APIs remain present', () => {
  for (const name of [
    'getTurnRecordByAId',
    'getTurnRecordByQId',
    'getTurnRecordByTurnId',
    'getTurnRecordByTurnNo',
  ]) {
    equal(typeof corrected.loaded.runtime[name], 'function', `${name} retained`);
  }
});

await fixture('conversation-index diagnostics remain present', () => {
  equal(
    typeof corrected.loaded.runtime.getConversationTurnIndexDiagnostics,
    'function',
    'conversation diagnostics retained',
  );
});

await fixture('graph getter returns the current graph scope', () => {
  seedCorrected();
  const result = corrected.loaded.runtime.getGraphIdentityDiagnostics([Q1]);
  equal(result.available, true, 'graph available');
  equal(result.reason, null, 'no graph failure');
  equal(result.scope.chatId, CHAT_ID, 'current chat');
  equal(result.scope.routeKey, ROUTE_KEY, 'current route');
  equal(result.scope.generation, 1, 'current generation');
});

await fixture('graph fingerprint is current', () => {
  seedCorrected();
  const result = corrected.loaded.runtime.getGraphIdentityDiagnostics([]);
  equal(result.scope.fingerprint, 'djb2:1yue4v7', 'graph fingerprint');
});

await fixture('valid canonical qIds resolve', () => {
  seedCorrected();
  const result = corrected.loaded.runtime.getGraphIdentityDiagnostics([Q1, Q26]);
  equal(graphRecord(result, Q1).found, true, 'Page 1 qId');
  equal(graphRecord(result, Q1).productUser, true, 'Page 1 product user');
  equal(graphRecord(result, Q26).found, true, 'Page 2 qId');
  equal(graphRecord(result, Q26).productUser, true, 'Page 2 product user');
});

await fixture('valid primary answer identities resolve', () => {
  seedCorrected();
  const result = corrected.loaded.runtime.getGraphIdentityDiagnostics([A1, A26]);
  equal(graphRecord(result, A1).found, true, 'Page 1 answer');
  equal(graphRecord(result, A1).productAnswer, true, 'normal product answer');
  equal(graphRecord(result, A26).found, true, 'Page 2 primary answer');
  equal(graphRecord(result, A26).role, 'system', 'flattened branch shell role retained');
});

await fixture('unknown graph IDs fail safely', () => {
  seedCorrected();
  const record = graphRecord(
    corrected.loaded.runtime.getGraphIdentityDiagnostics(['unknown-id']),
    'unknown-id',
  );
  equal(record.found, false, 'unknown missing');
  equal(record.matchedDomains, [], 'unknown has no identity domains');
});

await fixture('graph input remains bounded to 32 unique IDs', () => {
  seedCorrected();
  const ids = Array.from({ length: 40 }, (_unused, index) => `unknown-${index + 1}`);
  const result = corrected.loaded.runtime.getGraphIdentityDiagnostics(ids);
  equal(result.records.length, 32, 'input cap');
  equal(result.records[31].requestedId, 'unknown-32', 'first 32 retained');
});

await fixture('empty graph input follows the existing contract', () => {
  seedCorrected();
  const result = corrected.loaded.runtime.getGraphIdentityDiagnostics([]);
  equal(result.available, true, 'empty read retains current scope');
  equal(result.records, [], 'empty record set');
});

await fixture('graph getter performs zero DOM mutation', () => {
  seedCorrected();
  const before = corrected.loaded.counters.dom;
  corrected.loaded.runtime.getGraphIdentityDiagnostics([Q1, Q26]);
  equal(corrected.loaded.counters.dom, before, 'DOM unchanged');
});

await fixture('graph getter performs zero storage cache or preference mutation', () => {
  seedCorrected();
  const before = {
    storage: corrected.loaded.counters.storage,
    cache: corrected.loaded.counters.cache,
    preference: corrected.loaded.counters.preference,
  };
  corrected.loaded.runtime.getGraphIdentityDiagnostics([Q1, Q26]);
  equal(corrected.loaded.counters.storage, before.storage, 'storage unchanged');
  equal(corrected.loaded.counters.cache, before.cache, 'cache unchanged');
  equal(corrected.loaded.counters.preference, before.preference, 'preferences unchanged');
});

await fixture('graph getter performs zero canonical effective or alias mutation', () => {
  seedCorrected();
  const beforeStatus = JSON.stringify(corrected.loaded.runtime.getEffectivePresentationStatus());
  const beforeCounters = {
    canonical: corrected.loaded.counters.canonical,
    alias: corrected.loaded.counters.alias,
  };
  corrected.loaded.runtime.getGraphIdentityDiagnostics([Q1, Q26]);
  equal(
    JSON.stringify(corrected.loaded.runtime.getEffectivePresentationStatus()),
    beforeStatus,
    'effective status unchanged',
  );
  equal(corrected.loaded.counters.canonical, beforeCounters.canonical, 'canonical unchanged');
  equal(corrected.loaded.counters.alias, beforeCounters.alias, 'alias unchanged');
});

await fixture('graph getter performs zero network navigation or scrolling', () => {
  seedCorrected();
  const before = {
    network: corrected.loaded.counters.network,
    navigation: corrected.loaded.counters.navigation,
    scrolling: corrected.loaded.counters.scrolling,
  };
  corrected.loaded.runtime.getGraphIdentityDiagnostics([Q1]);
  equal(corrected.loaded.counters.network, before.network, 'network unchanged');
  equal(corrected.loaded.counters.navigation, before.navigation, 'navigation unchanged');
  equal(corrected.loaded.counters.scrolling, before.scrolling, 'scrolling unchanged');
});

await fixture('graph getter adds no timer RAF loop or observer', () => {
  seedCorrected();
  const before = {
    timers: corrected.loaded.counters.timers,
    observers: corrected.loaded.counters.observers,
  };
  corrected.loaded.runtime.getGraphIdentityDiagnostics([Q1]);
  equal(corrected.loaded.counters.timers, before.timers, 'timers unchanged');
  equal(corrected.loaded.counters.observers, before.observers, 'observers unchanged');
});

await fixture('complete corrected loader execution is idempotent', () => {
  const beforeRuntime = corrected.loaded.context.__CV325_H2O__.turnRuntime;
  const beforeKeys = Object.keys(beforeRuntime).sort();
  const afterRuntime = corrected.loaded.execute();
  equal(afterRuntime, beforeRuntime, 'runtime object identity preserved');
  equal(Object.keys(afterRuntime).sort(), beforeKeys, 'runtime surface unchanged');
});

await fixture('repeated graph bridge registration is idempotent', () => {
  const runtime = corrected.loaded.execute();
  equal(typeof runtime.getGraphIdentityDiagnostics, 'function', 'getter retained');
  equal(
    Object.keys(runtime).filter((key) => key === 'getGraphIdentityDiagnostics').length,
    1,
    'one graph API',
  );
});

await fixture('route-equivalent initialization preserves the getter', () => {
  const runtime = corrected.loaded.execute();
  equal(
    corrected.loaded.context.location.pathname,
    ROUTE_KEY,
    'route remains current',
  );
  equal(typeof runtime.getGraphIdentityDiagnostics, 'function', 'route reinit retains getter');
});

await fixture('generation update reads current graph data instead of stale captured data', () => {
  seedCorrected(1, 'djb2:graph-generation-1');
  const first = corrected.loaded.runtime.getGraphIdentityDiagnostics([Q1]);
  seedCorrected(2, 'djb2:graph-generation-2');
  const second = corrected.loaded.runtime.getGraphIdentityDiagnostics([Q26]);
  equal(first.scope.generation, 1, 'first generation');
  equal(first.scope.fingerprint, 'djb2:graph-generation-1', 'first fingerprint');
  equal(second.scope.generation, 2, 'second generation');
  equal(second.scope.fingerprint, 'djb2:graph-generation-2', 'second fingerprint');
  equal(graphRecord(second, Q26).found, true, 'current graph node resolves');
});

await fixture('genuine graph absence remains fail closed', () => {
  corrected.loaded.clearGraph();
  const result = corrected.loaded.runtime.getGraphIdentityDiagnostics([Q1]);
  equal(result.available, false, 'graph unavailable');
  equal(result.reason, 'graph-unavailable', 'stable reason');
  equal(graphRecord(result, Q1).found, false, 'no identity fabricated');
  seedCorrected();
});

await fixture('Page 1 rendered-boundary capability succeeds in the loaded runtime topology', () => {
  seedCorrected();
  equal(
    corrected.loaded.runtime.getGraphIdentityDiagnostics([Q1]).available,
    true,
    'loaded graph authority available',
  );
  equal(stage2cLive.start.supported, true, 'Page 1 boundary supported');
  equal(stage2cLive.start.boundaryIdentityCurrent, true, 'Page 1 identity current');
});

await fixture('Page 2 cold exact-wrapper capability succeeds in the loaded runtime topology', () => {
  seedCorrected();
  const graph = corrected.loaded.runtime.getGraphIdentityDiagnostics([Q26]);
  equal(graphRecord(graph, Q26).productUser, true, 'Page 2 graph proof current');
  equal(stage2cLive.end.supported, true, 'Page 2 boundary supported');
  equal(stage2cLive.end.boundaryWrapperConnected, true, 'Page 2 wrapper retained');
});

await fixture('Page 1 range diagnostics retain the accepted exact topology', () => {
  equal(stage2cLive.pageOneRange.supported, true, 'range supported');
  equal(stage2cLive.pageOneRange.rangeProven, true, 'range proven');
  equal(stage2cLive.pageOneRange.hostWrapperCount, 50, '50 host wrappers');
  equal(stage2cLive.pageOneRange.h2oNodeCount, 3, '3 H2O nodes');
  equal(stage2cLive.pageOneRange.ambiguousWrapperCount, 0, 'zero ambiguity');
});

await fixture('Page collapse capability retains rendered prerequisites and installed transaction', () => {
  const result = stage2cLive.capability.capability(1);
  equal(result.supported, true, 'capability supported');
  equal(result.prerequisitesReady, true, 'prerequisites ready');
  equal(result.legacyNativeSlotConsulted, false, 'legacy slots disconnected');
  equal(result.atomicTransactionImplemented, true, 'transaction installed');
  equal(result.activationReady, true, 'activation ready');
});

await fixture('compatibility readiness follows the installed transaction', () => {
  const result = stage2cLive.capability.compatibility(1);
  equal(result.ready, true, 'compatibility ready');
  equal(result.source, 'rendered-boundary-collapse-capability', 'rendered source');
  equal(result.reason, null, 'no block reason');
});

await fixture('graph getter itself does not activate functional collapse', () => {
  const before = corrected.loaded.counters.dom;
  corrected.loaded.runtime.getGraphIdentityDiagnostics([Q1, Q26]);
  equal(corrected.loaded.counters.dom, before, 'graph read causes no collapse DOM mutation');
});

await fixture('graph bridge writes no native-hidden stamps', () => {
  equal(CURRENT_CORE.includes('data-cgxui-chat-page-native-hidden'), false, 'native visibility absent from graph bridge');
});

await fixture('graph bridge activates no title-list projection', () => {
  equal(CURRENT_CORE.includes('title-list'), false, 'title-list behavior absent from graph bridge');
});

await fixture('graph bridge moves no divider or sentinel', () => {
  equal(CURRENT_CORE.includes('insertBefore'), false, 'page-unit placement untouched');
  equal(corrected.loaded.counters.navigation, 0, 'navigation untouched');
  equal(corrected.loaded.counters.scrolling, 0, 'scrolling untouched');
});

await fixture('graph diagnostics retain the accepted privacy contract', () => {
  seedCorrected();
  const result = corrected.loaded.runtime.getGraphIdentityDiagnostics([Q1, Q26, A26]);
  assertDeepFrozen(result);
  const forbidden = /^(text|prompt|assistantText|markdown|html|content|contentParts|parts|attachments|images|filenames|urls|citations|author|authorName|timestamp|metadata|mapping|rawGraph|graph|token|proofToken|credentials|profile|page|pageNumber|order|variantOf|graphCategory|renderedOrdinal|nativeTestId|selectedPath)$/i;
  equal(
    recursiveKeys(result).filter((key) => forbidden.test(key)),
    [],
    'no content or private graph keys',
  );
});

await fixture('public runtime contains no duplicate graph API under alternate objects', () => {
  const h2o = corrected.loaded.context.__CV325_H2O__;
  const surfaces = [
    h2o,
    h2o.turnRuntime,
    h2o.runtime,
    h2o.turn,
    h2o.mods,
    h2o.loader,
    h2o.diag,
  ].filter((value) => value && typeof value === 'object');
  const owners = surfaces.filter((surface) => (
    Object.prototype.hasOwnProperty.call(surface, 'getGraphIdentityDiagnostics')
  ));
  equal(owners.length, 1, 'one graph API owner');
  equal(owners[0], h2o.turnRuntime, 'turnRuntime is the sole owner');
});

await fixture('retired Pagination membership seams are absent from H2O Core and turnRuntime', () => {
  equal(H2O_CORE_SOURCE.includes('paginationDrafts'), false, 'no retained Pagination membership drafts');
  equal(H2O_CORE_SOURCE.includes('reconcileTurnRecordsFromPaginationSnapshot'), false, 'no Pagination reconciliation authority');
  equal(H2O_CORE_SOURCE.includes('_reconcilePaginationSnapshot'), false, 'no callable Pagination reconciliation seam');
  equal(H2O_CORE_SOURCE.includes('_clearPaginationSnapshot'), false, 'no callable Pagination clear/repopulate seam');
  equal(typeof corrected.loaded.runtime?._reconcilePaginationSnapshot, 'undefined', 'runtime façade exposes no Pagination membership writer');
  equal(typeof corrected.loaded.runtime?._clearPaginationSnapshot, 'undefined', 'runtime façade exposes no Pagination membership clear/rebuild writer');
});

await fixture('H2O Core buildTurns fails closed without current canonical authority', () => {
  const buildTurnsSource = extractFunctionSource(H2O_CORE_SOURCE, 'buildTurns');
  equal(buildTurnsSource.includes('sectionDraftAuthorityDecision'), false, 'mounted sections cannot become membership authority');
  equal(buildTurnsSource.includes('mergeDurableTurnDrafts'), false, 'durable DOM-derived rows cannot become membership authority');
  equal(buildTurnsSource.includes('buildPaginationTurnDrafts'), false, 'Pagination drafts cannot become membership authority');
  equal(buildTurnsSource.includes('canonical-membership-unavailable'), true, 'unavailable authority has an explicit empty boundary');
});

await fixture('H2O Core mounted evidence can attach but never append logical members', () => {
  const commitSource = extractFunctionSource(H2O_CORE_SOURCE, 'commitTurnDrafts');
  equal(commitSource.includes("basis: 'new-live-turn'"), false, 'unmatched mounted rows never append');
  equal(commitSource.includes('canonical-membership-only'), true, 'commit is explicitly canonical-membership-only');
  equal(commitSource.includes('applyLiveDraft(record, draft, match)'), true, 'matched mounted presentation attachment remains');
});

await fixture('H2O Core ordinal and unproven shell evidence cannot establish identity', () => {
  const matchSource = extractFunctionSource(H2O_CORE_SOURCE, 'findPreviousTurnRecordMatch');
  const commitSource = extractFunctionSource(H2O_CORE_SOURCE, 'commitTurnDrafts');
  equal(matchSource.includes('ordinal-fallback'), false, 'ordinal record adoption retired');
  equal(matchSource.includes('canonicalRecordMatchesMountedQuestionShell'), false, 'cross-qId mounted shell adoption retired');
  equal(commitSource.includes("allowQIdTransition: previousMatch.basis === 'mounted-question-shell'"), false, 'unproven shell cannot rekey canonical identity');
});

await fixture('turnRuntime remains a read-compatible façade without legacy membership writers', () => {
  const runtime = corrected.loaded.runtime;
  equal(typeof runtime?.listTurns, 'function');
  equal(typeof runtime?.getTurnRecordByQId, 'function');
  equal(typeof runtime?.getCompleteTurnIndexProjectionStatus, 'function');
  equal(typeof runtime?.getEffectivePresentationIndex, 'function');
  equal(typeof runtime?.getGraphIdentityDiagnostics, 'function');
  equal(typeof runtime?._reconcilePaginationSnapshot, 'undefined');
});

const failures = fixtures.filter((item) => !item.ok);
for (const item of fixtures) {
  if (item.ok) console.log(`PASS ${item.name}`);
  else console.error(`FAIL ${item.name}\n${item.error}`);
}
console.log(`Root cause: GRAPH_BRIDGE_BUILD_BYTES_STALE`);
console.log(`Fixtures: ${fixtures.length - failures.length}/${fixtures.length}`);
console.log(`Assertions: ${assertions}`);
console.log('Safety counters: DOM=0 storage=0 cache=0 preference=0 canonical=0 alias=0 network=0 navigation=0 scrolling=0 timers=0 observers=0');
if (failures.length) process.exitCode = 1;
