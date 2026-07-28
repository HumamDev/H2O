#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FILES = Object.freeze({
  core: 'src-runtime-base/0A1a.⬛️🧠 H2O Core 🧠.js',
  miniCore: 'src-runtime-base/1A1b.🟥🗺️ MiniMap Core 🧱🗺️.js',
  miniEngine: 'src-runtime-base/1A1c.🟥🗺️ MiniMap Engine 🚀🗺️.js',
  question: 'src-runtime-base/2X1a.🟡🔢 Question Numbers 🔢.js',
  title: 'src-runtime-base/1C1a.🟥📛 Turn Title Bar 📛.js',
  answer: 'src-runtime-base/1X1a.🔴🧮 Answer Numbers 🧮.js',
  timestamp: 'src-runtime-base/1Z1a.🔴⏳ Answer Timestamp ⏳.js',
});
const SOURCE = Object.freeze(Object.fromEntries(
  Object.entries(FILES).map(([key, relative]) => [
    key,
    fs.readFileSync(path.join(ROOT, relative), 'utf8'),
  ]),
));
const Q17 = '8a2afe19-c39b-4e29-8c5f-74043a2e0c4c';
const A17_SELECTED = '7b695490-e7a4-4af6-8ad9-4e15977917bb';
const Q18 = 'e9aeedf5-f75b-488c-8527-21d9ef155539';
const A18 = 'ac657e57-7d6b-4379-bf50-07158d192924';
const fixtures = [];
let assertionCount = 0;
const safety = {
  storageWrites: 0,
  preferenceWrites: 0,
  canonicalWrites: 0,
  aliasWrites: 0,
  reconciliationAccepts: 0,
  networkCalls: 0,
  cacheWritesWhileOverlayActive: 0,
  canonicalDomIdentityWrites: 0,
  pollingIntervals: 0,
  generalTimers: 0,
  newObservers: 0,
};

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

function declaration(source, name, kind = 'function') {
  const token = kind === 'function' ? `  function ${name}(` : `  const ${name} =`;
  const start = source.indexOf(token);
  if (start < 0) throw new Error(`production-declaration-missing:${name}`);
  let brace = source.indexOf('{', start);
  if (kind === 'function') {
    const open = source.indexOf('(', start);
    let parenDepth = 0;
    let quote = '';
    let escaped = false;
    for (let index = open; index < source.length; index += 1) {
      const char = source[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) quote = '';
        continue;
      }
      if (char === '"' || char === "'" || char === '`') {
        quote = char;
        continue;
      }
      if (char === '(') parenDepth += 1;
      else if (char === ')') {
        parenDepth -= 1;
        if (parenDepth === 0) {
          brace = source.indexOf('{', index);
          break;
        }
      }
    }
  }
  if (brace < 0) throw new Error(`production-declaration-body-missing:${name}`);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        if (kind === 'function') return source.slice(start, index + 1);
        const semicolon = source.indexOf(';', index);
        if (semicolon < 0) throw new Error(`production-declaration-end-missing:${name}`);
        return source.slice(start, semicolon + 1);
      }
    }
  }
  throw new Error(`production-declaration-unclosed:${name}`);
}

function canonicalRows() {
  return Array.from({ length: 39 }, (_value, index) => {
    const order = index + 1;
    const qId = order === 17 ? Q17 : `canonical-q-${order}`;
    const primaryAId = order === 17 ? 'canonical-a17-branch-1' : `canonical-a-${order}`;
    return Object.freeze({
      order,
      turnNo: order,
      idx: order,
      index: order,
      qId,
      turnId: `turn:${qId}`,
      primaryAId,
      answerVariants: Object.freeze(order === 17
        ? ['canonical-a17-branch-1', A17_SELECTED]
        : [primaryAId]),
      answerIds: Object.freeze(order === 17
        ? ['canonical-a17-branch-1', A17_SELECTED]
        : [primaryAId]),
      noAnswer: false,
      stopped: false,
      completeIndexAuthority: true,
    });
  });
}

function overlayRows(canonical) {
  const rows = canonical.slice(0, 17).map((row) => ({
    order: row.order,
    qId: row.qId,
    turnId: row.turnId,
    primaryAId: row.order === 17 ? A17_SELECTED : row.primaryAId,
    answerVariants: row.answerVariants,
    noAnswer: false,
    stopped: false,
  }));
  rows.push({
    order: 18,
    qId: Q18,
    turnId: `turn:${Q18}`,
    primaryAId: A18,
    answerVariants: [A18],
    noAnswer: false,
    stopped: false,
  });
  return Object.freeze(rows.map((row) => Object.freeze({
    ...row,
    answerVariants: Object.freeze(Array.from(row.answerVariants)),
  })));
}

function createRuntime() {
  const canonical = canonicalRows();
  const overlay = overlayRows(canonical);
  let overlayActive = false;
  const canonicalByQ = new Map(canonical.map((row) => [row.qId, row]));
  const canonicalByA = new Map(canonical.flatMap((row) => row.answerIds.map((id) => [id, row])));
  const overlayByQ = new Map(overlay.map((row) => [row.qId, row]));
  const overlayByA = new Map(overlay.flatMap((row) => row.answerVariants.map((id) => [id, row])));
  const runtime = {
    listTurnRecords: () => canonical.slice(),
    listTurns: () => canonical.slice(),
    getTurnRecordByQId: (id) => canonicalByQ.get(String(id || '')) || null,
    getTurnRecordByAId: (id) => canonicalByA.get(String(id || '')) || null,
    getTurnRecordByTurnId: (id) => canonicalByQ.get(String(id || '').replace(/^turn:/, '')) || null,
    getCompleteTurnIndexProjectionStatus: () => ({
      enabled: true,
      authoritative: true,
      status: 'complete-validated',
      projectedCount: 39,
      count: 39,
      completenessProof: 'host-payload-full-graph',
      chatId: 'fixture-chat',
      fingerprint: 'canonical-39',
    }),
    getCompleteTurnIndexProjectionPreference: () => ({ enabled: true }),
    [['getEffective', 'PresentationStatus'].join('')]: () => Object.freeze({
      source: overlayActive ? 'selected-path-overlay' : 'canonical',
      overlayActive,
      count: overlayActive ? 18 : 39,
      canonicalFingerprint: 'canonical-39',
      anchorQId: overlayActive ? Q17 : null,
      pathLength: overlayActive ? 18 : 0,
    }),
    [['getEffective', 'PresentationIndex'].join('')]: () => Object.freeze({
      complete: true,
      proof: overlayActive ? 'selected-path-overlay' : 'host-payload-full-graph',
      turns: overlayActive ? overlay : Object.freeze(canonical.slice()),
    }),
    [['getEffective', 'TurnRecordByQId'].join('')]: (id) => (
      (overlayActive ? overlayByQ : canonicalByQ).get(String(id || '')) || null
    ),
    [['getEffective', 'TurnRecordByAId'].join('')]: (id) => (
      (overlayActive ? overlayByA : canonicalByA).get(String(id || '')) || null
    ),
  };
  return {
    runtime,
    canonical,
    overlay,
    activate() { overlayActive = true; },
    clear() { overlayActive = false; },
  };
}

function compileMiniMapCore(runtime) {
  const names = [
    'isCanonicalNoAnswerRecord',
    'cacheRowAnswerIds',
    'getTurnRuntimeApi',
    'callEffectiveTurnRuntime',
    'getEffectivePresentationRuntimeStatus',
    'selectedPathPresentationActive',
    'projectSharedTurnRecord',
    'getEffectiveTurnsFromSharedRuntime',
    'saveTurnCache',
    'persistPublishedTurnList',
  ];
  const context = vm.createContext({
    Number,
    String,
    Array,
    Map,
    Object,
    Math,
    TOPW: { H2O: { turnRuntime: runtime } },
    W: { H2O: { turnRuntime: runtime } },
    EFFECTIVE_TURN_RUNTIME_METHOD: Object.freeze({
      INDEX: 'getEffectivePresentationIndex',
      STATUS: 'getEffectivePresentationStatus',
      QID: 'getEffectiveTurnRecordByQId',
      AID: 'getEffectiveTurnRecordByAId',
    }),
    CURRENT_PROOF_PROVEN: 'canonical-record',
    deriveLiveCurrentProof: () => 'transient-unverified',
    getAnswerEls: () => [],
    resolveChatId: () => 'fixture-chat',
    rememberCachePersistenceDecision: (_id, result) => result,
    mergeTurnListWithCache() { safety.cacheWritesWhileOverlayActive += 1; throw new Error('merge-forbidden'); },
    saveTurnCacheSentinel() { safety.cacheWritesWhileOverlayActive += 1; },
    keyTurnCacheTurns() { safety.cacheWritesWhileOverlayActive += 1; return 'forbidden'; },
    keyTurnCacheMeta() { safety.cacheWritesWhileOverlayActive += 1; return 'forbidden'; },
    validateCurrentLayerMembership() { safety.cacheWritesWhileOverlayActive += 1; return { ok: true }; },
  });
  const code = names.map((name) => declaration(SOURCE.miniCore, name, 'function')).join('\n');
  vm.runInContext(`${code}\nglobalThis.__api = { ${names.join(', ')} };`, context);
  return context.__api;
}

function compileMiniMapEngine(runtime) {
  const names = [
    'MINI_completeIndexStatus',
    'MINI_callEffectiveTurnRuntime',
    'MINI_effectivePresentationStatus',
    'MINI_completeIndexNavigationEnabled',
    'MINI_completeIndexRecords',
    'MINI_completeIndexDescriptor',
  ];
  const context = vm.createContext({
    Number,
    String,
    Array,
    Set,
    Object,
    W: { H2O: { turnRuntime: runtime } },
    EFFECTIVE_TURN_RUNTIME_METHOD: Object.freeze({
      INDEX: 'getEffectivePresentationIndex',
      STATUS: 'getEffectivePresentationStatus',
    }),
    COMPLETE_INDEX_INTERNAL_QIDS: new Set(),
    normalizeNavId: (value) => String(value || '').trim(),
    resolveChatId: () => 'fixture-chat',
    location: { pathname: '/c/fixture-chat' },
  });
  const code = names.map((name) => declaration(SOURCE.miniEngine, name, 'function')).join('\n');
  vm.runInContext(`${code}\nglobalThis.__api = { ${names.join(', ')} };`, context);
  return context.__api;
}

function compileNumbering(runtime) {
  const overlayActive = runtime[['getEffective', 'PresentationStatus'].join('')]?.()?.overlayActive === true;
  const activeQId = overlayActive ? Q18 : 'canonical-q-18';
  const activeAId = overlayActive ? A18 : 'canonical-a-18';
  const answerEl = {
    getAttribute: (name) => name === 'data-message-id' ? activeAId : null,
    dataset: { messageId: activeAId },
    closest: () => null,
    querySelector: () => null,
  };
  const titleContext = vm.createContext({
    Number,
    Math,
    String,
    Array,
    Map,
    W: {
      H2O: {
        turnRuntime: runtime,
        msg: { getIdFromEl: () => activeAId },
        turn: { getTurnIndexByAEl: () => 0 },
      },
    },
    ATTR_: { MSG_ID: 'data-message-id' },
    API_AT_normalizeAnswerId: (value) => String(value || '').trim(),
    DOM_getAnswerId: () => activeAId,
    DOM_getAnswerTurnHost: () => null,
    DOM_getAdjacentTurnHost: () => null,
    DOM_turnHostHasRole: () => false,
  });
  const titleNames = [
    'DOM_readCanonicalTurnNumber',
    'DOM_completeTurnIndexProjectionEnabled',
    'DOM_getCanonicalQuestionOwnerNumber',
    'DOM_getUserCandidates',
    'DOM_getCanonicalOwnerTurnNumber',
    'DOM_getTurnNumber',
  ];
  vm.runInContext(
    `${titleNames.map((name) => declaration(SOURCE.title, name, 'const')).join('\n')}
     globalThis.__api = { ${titleNames.join(', ')} };`,
    titleContext,
  );

  const timestampContext = vm.createContext({
    Number,
    Math,
    String,
    Array,
    Map,
    W: {
      H2O: {
        turnRuntime: runtime,
        msg: { getIdFromEl: () => activeAId },
        turn: { getTurnIndexByAEl: () => 0 },
      },
    },
    DOC: { querySelectorAll: () => [] },
    SEL_: {
      CONV_TURN_ANY: '[data-testid="conversation-turn"]',
      USER_MSG: '[data-message-author-role="user"]',
    },
    DOM_AT_getConversationRoot: () => ({ querySelectorAll: () => [] }),
    DOM_AT_getPaginationTurnOffset: () => 0,
  });
  const timestampNames = [
    'DOM_AT_readCanonicalTurnNumber',
    'DOM_AT_completeTurnIndexProjectionEnabled',
    'DOM_AT_getUserCandidates',
    'DOM_AT_getCanonicalQuestionOwnerNumber',
    'DOM_AT_getCanonicalOwnerTurnNumber',
    'DOM_AT_getCanonicalTurnIndexFromRuntime',
    'DOM_AT_getTurnIndex',
  ];
  vm.runInContext(
    `${timestampNames.map((name) => declaration(SOURCE.timestamp, name, 'function')).join('\n')}
     globalThis.__api = { ${timestampNames.join(', ')} };`,
    timestampContext,
  );

  const answerContext = vm.createContext({
    Number,
    Math,
    String,
    Array,
    Map,
    W: { H2O: { turnRuntime: runtime } },
    SEL: { TURN_ANY: '[data-testid="conversation-turn"]' },
    UTIL_getAnswerId: () => activeAId,
    UTIL_getCanonicalOwnerRecord: () => null,
  });
  const answerNames = ['UTIL_readCanonicalTurnNumber', 'UTIL_getRuntimeIdentity'];
  vm.runInContext(
    `${answerNames.map((name) => declaration(SOURCE.answer, name, 'function')).join('\n')}
     globalThis.__api = { ${answerNames.join(', ')} };`,
    answerContext,
  );

  const questionContext = vm.createContext({
    Number,
    String,
    Array,
    W: {
      H2O: {
        turnRuntime: runtime,
        msg: { getIdFromEl: () => activeQId },
      },
    },
    getCanonicalTurnNumFromTurnRoot: () => 0,
    getStableQuestionIdFromElement: () => activeQId,
    isCompleteTurnIndexProjectionEnabled: () => true,
    getCanonicalTurnNumFromPaginationState: () => 0,
    isPaginationEnabled: () => false,
    getPaginationTurnNumFromDomWindow: () => 0,
    getDomAnsweredTurnOrdinal: () => 0,
    MOD: { state: {} },
  });
  const questionNames = ['readCanonicalTurnNumFromRecord', 'getCanonicalTurnNum', 'computeDisplayNumber'];
  vm.runInContext(
    `${questionNames.map((name) => declaration(SOURCE.question, name, 'function')).join('\n')}
     globalThis.__api = { ${questionNames.join(', ')} };`,
    questionContext,
  );
  return {
    answerEl,
    title: titleContext.__api,
    timestamp: timestampContext.__api,
    answer: answerContext.__api,
    question: questionContext.__api,
  };
}

await fixture('canonical baseline keeps the 39-turn authority and all turn-18 surfaces', () => {
  const state = createRuntime();
  const miniCore = compileMiniMapCore(state.runtime);
  const miniEngine = compileMiniMapEngine(state.runtime);
  const numbering = compileNumbering(state.runtime);
  equal(miniCore.getEffectiveTurnsFromSharedRuntime(), null, 'inactive overlay is not projected by MiniMap');
  equal(miniEngine.MINI_completeIndexRecords().length, 39, 'MiniMap navigation sees canonical 39');
  equal(numbering.question.computeDisplayNumber({}), 18, 'question surface shows canonical 18');
  equal(numbering.title.DOM_getTurnNumber(numbering.answerEl), 18, 'title surface shows canonical 18');
  equal(numbering.answer.UTIL_getRuntimeIdentity(numbering.answerEl, 'canonical-a-18').runtimeNumber, 18, 'answer surface shows canonical 18');
  equal(numbering.timestamp.DOM_AT_getTurnIndex(numbering.answerEl), 18, 'timestamp surface shows canonical 18');
});

await fixture('selected branch activation publishes one effective 18-turn MiniMap path', () => {
  const state = createRuntime();
  state.activate();
  const miniCore = compileMiniMapCore(state.runtime);
  const miniEngine = compileMiniMapEngine(state.runtime);
  const snapshot = miniCore.getEffectiveTurnsFromSharedRuntime();
  equal(snapshot.list.length, 18, 'MiniMap effective list has 18 rows');
  equal(Array.from(snapshot.list, (row) => row.index), Array.from({ length: 18 }, (_v, index) => index + 1), 'orders are contiguous');
  equal(snapshot.list[16].qId, Q17, 'anchor q17 is retained at 17');
  equal(snapshot.list[16].primaryAId, A17_SELECTED, 'anchor answer is branch 2');
  equal(snapshot.list[17].qId, Q18, 'effective item 18 owns branch q18');
  equal(snapshot.list[17].primaryAId, A18, 'effective item 18 owns branch a18');
  equal(miniEngine.MINI_completeIndexRecords().length, 18, 'navigation source has 18 rows');
  const qDescriptor = miniEngine.MINI_completeIndexDescriptor({ qId: Q18 });
  equal(qDescriptor.order, 18, 'q18 navigation order is 18');
  equal(qDescriptor.primaryAId, A18, 'q18 navigation target is a18');
});

await fixture('all four numbering surfaces resolve branch q18/a18 through effective exact identity', () => {
  const state = createRuntime();
  state.activate();
  const numbering = compileNumbering(state.runtime);
  equal(numbering.question.computeDisplayNumber({}), 18, 'question q18 displays 18');
  equal(numbering.title.DOM_getTurnNumber(numbering.answerEl), 18, 'TITLE uses 18');
  equal(numbering.answer.UTIL_getRuntimeIdentity(numbering.answerEl, A18).runtimeNumber, 18, 'large answer number uses 18');
  equal(numbering.timestamp.DOM_AT_getTurnIndex(numbering.answerEl), 18, 'timestamp/footer uses 18');
});

await fixture('overlay-active cache guards preserve the canonical durable cache', () => {
  const state = createRuntime();
  state.activate();
  const miniCore = compileMiniMapCore(state.runtime);
  equal(miniCore.selectedPathPresentationActive(), true, 'overlay cache gate is active');
  equal(miniCore.saveTurnCache('fixture-chat', state.overlay).status, 'selected-path-overlay-skipped', 'direct cache save is skipped');
  equal(miniCore.persistPublishedTurnList('fixture-chat', state.overlay).status, 'selected-path-overlay-skipped', 'merge/persist pipeline is skipped');
  equal(safety.cacheWritesWhileOverlayActive, 0, 'no cache dependency is reached');
  const saveSource = declaration(SOURCE.miniCore, 'saveTurnCache', 'function');
  ok(saveSource.indexOf('selectedPathPresentationActive()') < saveSource.indexOf('keyTurnCacheTurns'), 'cache gate precedes durable keys');
});

await fixture('canonical return restores presentation 39 without fetch or Refresh', () => {
  const state = createRuntime();
  state.activate();
  equal(compileMiniMapEngine(state.runtime).MINI_completeIndexRecords().length, 18, 'precondition is selected 18');
  state.clear();
  equal(compileMiniMapEngine(state.runtime).MINI_completeIndexRecords().length, 39, 'return restores canonical 39');
  equal(compileMiniMapCore(state.runtime).getEffectiveTurnsFromSharedRuntime(), null, 'effective snapshot falls back to canonical');
  equal(safety.networkCalls, 0, 'return uses no network');
});

await fixture('unknown effective identities fail closed without ordinal guessing', () => {
  const state = createRuntime();
  state.activate();
  const unknown = 'unknown-product-id';
  equal(state.runtime[['getEffective', 'TurnRecordByQId'].join('')](unknown), null, 'unknown qId is null');
  equal(state.runtime[['getEffective', 'TurnRecordByAId'].join('')](unknown), null, 'unknown aId is null');
  const numbering = compileNumbering({
    ...state.runtime,
    [['getEffective', 'TurnRecordByQId'].join('')]: () => null,
    [['getEffective', 'TurnRecordByAId'].join('')]: () => null,
  });
  equal(numbering.question.computeDisplayNumber({}), null, 'question fails closed');
  equal(numbering.title.DOM_getTurnNumber(numbering.answerEl), 0, 'title omits guessed number');
  equal(numbering.answer.UTIL_getRuntimeIdentity(numbering.answerEl, A18).runtimeNumber, 0, 'answer omits guessed number');
  equal(numbering.timestamp.DOM_AT_getTurnIndex(numbering.answerEl), null, 'timestamp omits guessed number');
});

await fixture('one effective transition publishes one coherent existing turn-update signal', () => {
  const events = [];
  const context = vm.createContext({
    JSON,
    String,
    Number,
    Math,
    W: { H2O_MM_CORE_API: {} },
    state: { version: 7, qTotal: 39, aTotal: 39 },
    busEmit: (event, detail) => events.push({ event, detail }),
    EV_CORE_TURN_UPDATED: 'evt:h2o:core:turn:updated',
    chatAtlasCompleteIndexCode: (value) => String(value || ''),
  });
  const names = ['chatAtlasEffectivePresentationIdentity', 'chatAtlasEmitEffectivePresentationChanged'];
  vm.runInContext(
    `${names.map((name) => declaration(SOURCE.core, name, 'function')).join('\n')}
     globalThis.__api = { ${names.join(', ')} };`,
    context,
  );
  const canonical = { source: 'canonical', overlayActive: false, count: 39, canonicalFingerprint: 'fp', generation: 1 };
  const selected = { source: 'selected-path-overlay', overlayActive: true, count: 18, canonicalFingerprint: 'fp', anchorQId: Q17, pathLength: 18, generation: 1 };
  context.__api.chatAtlasEmitEffectivePresentationChanged(canonical, selected, 'activate');
  context.__api.chatAtlasEmitEffectivePresentationChanged(selected, selected, 'repeat');
  equal(events.length, 1, 'unchanged transition is idempotent');
  equal(events[0].event, 'evt:h2o:core:turn:updated', 'existing update event is reused');
  equal(events[0].detail.turnTotal, 18, 'all consumers receive one effective count');
  equal(events[0].detail.presentationSource, 'selected-path-overlay', 'all consumers receive one source');
  equal(events[0].detail.presentationAnchorQId, Q17, 'only anchor identity metadata is included');
  equal(Object.hasOwn(events[0].detail, 'token'), false, 'raw token is absent');
  equal(Object.hasOwn(events[0].detail, 'graph'), false, 'graph is absent');
});

await fixture('consumer boundaries and forbidden behavior remain presentation-only', () => {
  const productionRoots = ['src-runtime-base', 'src-surfaces-base'];
  const productionFiles = [];
  const walk = (relative) => {
    const absolute = path.join(ROOT, relative);
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile() && /\.js$/i.test(entry.name)) productionFiles.push(child);
    }
  };
  productionRoots.forEach(walk);
  const semanticConsumers = productionFiles.filter((relative) => {
    const text = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    return text.includes("['getEffective', 'Presentation")
      || text.includes("['getEffective', 'TurnRecordBy");
  }).sort();
  equal(semanticConsumers, [
    FILES.miniCore,
    FILES.miniEngine,
    FILES.title,
    FILES.answer,
    FILES.timestamp,
    FILES.question,
  ].sort(), 'only six approved consumers use effective presentation');
  const literalRefs = productionFiles.filter((relative) => {
    const text = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    return /getEffectivePresentation(Index|Status)|getEffectiveTurnRecordBy(QId|AId)/.test(text);
  });
  equal(literalRefs, [FILES.core], 'literal effective API definitions remain centralized in Core');
  ok(!SOURCE.miniCore.includes('localStorage.setItem') || SOURCE.miniCore.includes('selected-path-overlay-skipped'), 'MiniMap cache writes are guarded');
  for (const [key, value] of Object.entries(safety)) equal(value, 0, `${key} remains zero`);
});

const regressionCommands = [
  [
    'tools/validation/chat-atlas/validate-chat-atlas-cv3-6-selected-path-overlay.mjs',
    ['"total": 52', '"passed": 52', '"failed": 0'],
  ],
  [
    'tools/validation/chat-atlas/validate-chat-atlas-cv3-4-branch-remount-numbering.mjs',
    ['SUMMARY 21/21 fixtures passed', '370 assertions', '0 failures'],
  ],
];
for (const [relative, expectedParts] of regressionCommands) {
  const output = execFileSync(process.execPath, [relative], { cwd: ROOT, encoding: 'utf8' });
  ok(
    expectedParts.every((part) => output.includes(part)),
    `${relative} executes its real accepted production harness`,
  );
}

const failed = fixtures.filter((item) => !item.ok);
const report = {
  validator: 'chat-atlas-cv3-7-selected-path-presentation',
  fixtures: {
    total: fixtures.length,
    passed: fixtures.length - failed.length,
    failed: failed.length,
  },
  assertions: assertionCount,
  safetyCounters: safety,
  productionSources: Object.values(FILES),
  results: fixtures,
};
console.log(JSON.stringify(report, null, 2));
if (failed.length) process.exitCode = 1;
