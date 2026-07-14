#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const harnessPath = path.join(here, 'chat-atlas-cv3-2-canary-console.js');
const source = fs.readFileSync(harnessPath, 'utf8');

let sourceSetterCalls = 0;
let contextSequence = 0;

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  return {
    get length() { return values.size; },
    key(index) { return Array.from(values.keys())[index] ?? null; },
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    clear() { values.clear(); },
    dump() { return Object.fromEntries(values); },
  };
}

function createHarnessContext(options = {}) {
  contextSequence += 1;
  const chatKey = options.chatKey || 'fixture-chat-a';
  const activeSource = options.activeSource || 'legacy-durable-cache';
  const sessionStorage = options.sessionStorage || createStorage();
  const localStorage = options.localStorage || createStorage();
  const document = Object.freeze({
    querySelector() { return null; },
    querySelectorAll() { return []; },
  });
  const runtime = Object.freeze({
    getChatAtlasCanonicalSource() { return activeSource; },
    setChatAtlasCanonicalSource() {
      sourceSetterCalls += 1;
      throw new Error('source setter must not run in validator execution');
    },
    listTurnRecords() { return []; },
    getChatAtlasLedgerSnapshot() {
      return {
        ledgerReady: true,
        chatKey,
        version: 1,
        memberCount: 0,
        completeShellMap: true,
        members: [],
        quarantinedAliases: [],
      };
    },
    getChatAtlasLedgerDiagnostics() {
      return {
        ledgerReady: true,
        canonicalSource: {
          activeSource,
          effectiveSource: activeSource,
          defaultSource: 'legacy-durable-cache',
          supportedSources: ['legacy-durable-cache', 'chat-atlas-ledger'],
          switchCount: 0,
          persisted: false,
        },
        dualRun: {
          ready: true,
          exactParity: true,
          currentMismatchCount: 0,
          totalMismatchCount: 0,
          missingInLegacyCount: 0,
          missingInAdapterCount: 0,
          duplicateIdentityCount: 0,
          duplicateAliasCount: 0,
          primaryRekeyCount: 0,
          instrumentationErrorCount: 0,
        },
      };
    },
    getChatAtlasConvergenceParity() { return { parityStatus: 'exact', blockers: [] }; },
  });
  const context = vm.createContext({
    console: Object.freeze({ info() {}, log() {}, warn() {}, error() {} }),
    document,
    location: Object.freeze({ href: `https://chatgpt.com/c/${chatKey}`, pathname: `/c/${chatKey}` }),
    navigator: Object.freeze({}),
    history: Object.freeze({}),
    sessionStorage,
    localStorage,
    crypto: Object.freeze({
      randomUUID() { return `00000000-0000-4000-8000-${String(contextSequence).padStart(12, '0')}`; },
    }),
    performance: Object.freeze({ now() { return contextSequence; } }),
    setTimeout,
    clearTimeout,
    addEventListener() {},
    removeEventListener() {},
    H2O: Object.freeze({
      surface: Object.freeze({ chatId() { return chatKey; } }),
      turn: Object.freeze({ version() { return 1; } }),
      turnRuntime: runtime,
    }),
  });
  vm.runInContext(source, context, { filename: harnessPath });
  return { context, api: context.H2O_CV3_CANARY, sessionStorage, localStorage };
}

const primaryHarness = createHarnessContext();
const evaluate = primaryHarness.api?.evaluateStreamingIdentityContinuity;
const evaluateRollback = primaryHarness.api?.evaluateRollbackEquivalence;
assert.equal(typeof evaluate, 'function', 'streaming continuity evaluator was not exported');
assert.equal(typeof evaluateRollback, 'function', 'rollback equivalence evaluator was not exported');
assert.equal(sourceSetterCalls, 0, 'harness evaluation invoked the canonical source setter');

const placeholder = 'request-placeholder-request-fixture-stream-0';
const finalAnswerId = 'fixture-answer-final';
const qId = 'fixture-question-10';
const logicalMemberKey = 'atlas:10';

const cleanAliasDiagnostics = Object.freeze({
  currentCrossMemberDuplicateCount: 0,
  crossMemberAliasConflictCount: 0,
  currentAliasConflictCount: 0,
  historicalAliasConflictCount: 0,
  duplicateAliasCount: 0,
  quarantinedAliasCount: 0,
  quarantinedAliases: [],
});

function duringRow(primaryAId = placeholder) {
  return {
    logicalMemberKey,
    turnNo: 10,
    qId,
    primaryAId,
  };
}

function finalRow(overrides = {}) {
  return {
    logicalMemberKey,
    turnNo: 10,
    qId,
    primaryAId: finalAnswerId,
    currentAnswerIds: [finalAnswerId],
    currentAliases: [qId, finalAnswerId],
    answerResolverAliases: [placeholder, finalAnswerId],
    resolverAliases: [qId, placeholder, finalAnswerId],
    ...overrides,
  };
}

function state(rows, aliasDiagnostics = cleanAliasDiagnostics) {
  return { perTurn: rows, aliasDiagnostics };
}

function rollbackRow(turnNo, overrides = {}) {
  const rowQId = `fixture-question-${turnNo}`;
  const rowPrimary = `fixture-answer-${turnNo}`;
  return {
    logicalMemberKey: `atlas:${turnNo}`,
    turnNo,
    qId: rowQId,
    primaryAId: rowPrimary,
    currentAnswerIds: [rowPrimary],
    currentAliases: [rowQId, rowPrimary],
    questionCurrentAliases: [rowQId],
    answerCurrentAliases: [rowPrimary],
    questionResolverAliases: [rowQId],
    answerResolverAliases: [rowPrimary],
    resolverAliases: [rowQId, rowPrimary],
    answerCurrentShells: [{
      shellTurnId: `fixture-shell-${turnNo}`,
      messageId: rowPrimary,
      currentAnswerId: rowPrimary,
    }],
    currentProjectionSource: 'native-evidence',
    noAnswer: false,
    ...overrides,
  };
}

function rollbackState(rows, overrides = {}) {
  const final = rows.at(-1) || null;
  return {
    activeChatKey: 'fixture-chat-a',
    perTurn: rows,
    aliasDiagnostics: cleanAliasDiagnostics,
    miniMapBoxes: final ? [{ turnNo: final.turnNo, primaryAId: final.primaryAId }] : [],
    ...overrides,
  };
}

async function createValidCheckpoint(options = {}) {
  const localStorage = options.localStorage || createStorage();
  const sessionStorage = options.sessionStorage || createStorage();
  const harness = createHarnessContext({
    chatKey: options.chatKey || 'fixture-chat-a',
    activeSource: options.activeSource || 'legacy-durable-cache',
    localStorage,
    sessionStorage,
  });
  await harness.api.P0();
  const exported = harness.api.EXPORT();
  assert.equal(exported.ok, true, `unable to create checkpoint: ${exported.checkpointReason}`);
  return { ...harness, exported };
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function expectFailure(result, reason) {
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes(reason), `missing failure reason: ${reason}`);
}

test('request placeholder promotes to a real primary with same-member resolver continuity', () => {
  const final = finalRow();
  const result = evaluate(duringRow(), final, state([final]));
  assert.equal(result.ok, true);
  assert.equal(result.placeholderDuring, true);
  assert.equal(result.finalPrimaryAId, finalAnswerId);
  assert.equal(result.placeholderOwnerCount, 1);
  assert.equal(result.currentAliasesContainPlaceholder, false);
  assert.equal(result.currentAnswerIdsContainPlaceholder, false);
});

test('missing broad resolver continuity fails', () => {
  const final = finalRow({
    answerResolverAliases: [finalAnswerId],
    resolverAliases: [qId, finalAnswerId],
  });
  expectFailure(
    evaluate(duringRow(), final, state([final])),
    'placeholder-broad-resolver-continuity-missing',
  );
});

test('placeholder remaining as the settled primary fails', () => {
  const final = finalRow({ primaryAId: placeholder });
  expectFailure(
    evaluate(duringRow(), final, state([final])),
    'placeholder-remains-settled-primary',
  );
});

test('placeholder owned by another member fails', () => {
  const final = finalRow();
  const other = {
    logicalMemberKey: 'atlas:9',
    turnNo: 9,
    qId: 'fixture-question-9',
    answerResolverAliases: [placeholder],
    resolverAliases: ['fixture-question-9', placeholder],
  };
  expectFailure(
    evaluate(duringRow(), final, state([other, final])),
    'placeholder-owned-by-another-member',
  );
});

test('quarantined or conflicting placeholder fails', () => {
  const final = finalRow();
  const diagnostics = {
    ...cleanAliasDiagnostics,
    currentAliasConflictCount: 1,
    quarantinedAliasCount: 1,
    quarantinedAliases: [placeholder],
  };
  const result = evaluate(duringRow(), final, state([final], diagnostics));
  expectFailure(result, 'placeholder-quarantined');
  assert.ok(result.reasons.includes('alias-diagnostics-not-clean'));
});

test('already-final during identity passes when unchanged', () => {
  const final = finalRow({
    answerResolverAliases: [finalAnswerId],
    resolverAliases: [qId, finalAnswerId],
  });
  const result = evaluate(duringRow(finalAnswerId), final, state([final]));
  assert.equal(result.ok, true);
  assert.equal(result.placeholderDuring, false);
});

test('missing P7_DURING primary identity fails', () => {
  expectFailure(
    evaluate(duringRow(null), finalRow(), state([finalRow()])),
    'missing-p7-during-primary',
  );
});

test('missing P7_DURING turn fails', () => {
  expectFailure(
    evaluate(null, finalRow(), state([finalRow()])),
    'missing-p7-during-turn',
  );
});

test('different logical turn observations fail', () => {
  const final = finalRow({
    logicalMemberKey: 'atlas:11',
    turnNo: 11,
    qId: 'fixture-question-11',
  });
  const result = evaluate(duringRow(), final, state([final]));
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('streaming-turn-number-mismatch'));
  assert.ok(result.reasons.includes('streaming-question-id-mismatch'));
  assert.ok(result.reasons.includes('streaming-logical-member-key-mismatch'));
});

test('existing P7 consumer and safety gates remain present', () => {
  for (const gate of [
    'canonicalIncreasedOne',
    'countsAgree',
    'finalAnswerPresent',
    'finalPrimaryPublishedByMiniMap',
    'ledgerSource',
    'miniMapAligned',
    'dualRunExact',
    'convergenceClean',
    'aliasesClean',
  ]) {
    assert.match(source, new RegExp(`\\b${gate}:`), `missing P7 gate: ${gate}`);
  }
  assert.match(source, /streamingIdentityContinuity:\s*streamingIdentityContinuity\.ok/);
  assert.doesNotMatch(source, /placeholderNotCurrentPrimaryUnlessAlreadyFinal/);
  assert.doesNotMatch(source, /finalTurn\?\.currentAliases\?\.includes\(placeholder\)/);
});

test('rollback gates remain present and source selection stays memory-only', () => {
  for (const gate of [
    'setterOk',
    'legacyActive',
    'versionAdvanced',
    'sourceNotPersisted',
    'oneTurnUpdate',
    'countsAgree',
    'miniMapAligned',
    'dualRunExact',
    'convergenceClean',
    'aliasesClean',
    'rollbackEquivalent',
    'finalPrimaryNonPlaceholder',
    'finalPrimaryPublishedByMiniMap',
  ]) {
    assert.match(source, new RegExp(`\\b${gate}:`), `missing P8 gate: ${gate}`);
  }
  assert.match(source, /const SOURCE_LEGACY = 'legacy-durable-cache'/);
  assert.match(source, /persisted:\s*source\.persisted/);
  assert.match(source, /evaluateRollbackEquivalence\(baseline, after\)/);
});

test('normalized rows expose broad aliases without changing currentAliases composition', () => {
  assert.match(source, /logicalMemberKey:\s*ledger\?\.logicalMemberKey/);
  assert.match(source, /answerResolverAliases:\s*asArray\(ledger\?\.answerResolverAliases\)\.slice\(\)/);
  assert.match(source, /resolverAliases:\s*asArray\(ledger\?\.resolverAliases\)\.slice\(\)/);
  assert.match(source, /currentAliases:\s*uniqueOrdered\(\[\s*\.\.\.\(ledger\?\.questionCurrentAliases \|\| \[\]\),\s*\.\.\.\(ledger\?\.answerCurrentAliases \|\| \[\]\),\s*\]\)/);
});

test('harness remains inert and retains exactly one forward and rollback setter call', () => {
  const setterCalls = source.match(/setChatAtlasCanonicalSource\s*\(/g) || [];
  assert.equal(setterCalls.length, 2);
  assert.equal(sourceSetterCalls, 0);
  assert.doesNotMatch(source, /rebuildNow\s*\(/);
});

test('alias-equivalent primary rekey is accepted', () => {
  const previous = rollbackRow(1);
  const current = rollbackRow(1, {
    primaryAId: 'fixture-answer-1-rekeyed',
    currentAnswerIds: ['fixture-answer-1-rekeyed'],
    answerCurrentAliases: ['fixture-answer-1-rekeyed'],
    answerResolverAliases: ['fixture-answer-1', 'fixture-answer-1-rekeyed'],
    resolverAliases: ['fixture-question-1', 'fixture-answer-1', 'fixture-answer-1-rekeyed'],
    answerCurrentShells: [],
  });
  const result = evaluateRollback(rollbackState([previous]), rollbackState([current]));
  assert.equal(result.ok, true);
  assert.equal(result.perTurnEvidence[0].transition, 'alias-equivalent');
  assert.equal(result.perTurnEvidence[0].answer.ownerCount, 1);
  assert.equal(result.perTurnEvidence[0].visibleBranch.status, 'not-evaluable');
});

test('qId alias-equivalent transition is accepted', () => {
  const previous = rollbackRow(1);
  const current = rollbackRow(1, {
    qId: 'fixture-question-1-rekeyed',
    questionCurrentAliases: ['fixture-question-1-rekeyed'],
    questionResolverAliases: ['fixture-question-1', 'fixture-question-1-rekeyed'],
    resolverAliases: ['fixture-question-1', 'fixture-question-1-rekeyed', 'fixture-answer-1'],
  });
  const result = evaluateRollback(rollbackState([previous]), rollbackState([current]));
  assert.equal(result.ok, true);
  assert.equal(result.perTurnEvidence[0].question.aliasEquivalent, true);
  assert.equal(result.perTurnEvidence[0].question.ownerCount, 1);
});

test('regenerated logical member key with exact identities is accepted', () => {
  const previous = rollbackRow(1);
  const current = rollbackRow(1, { logicalMemberKey: 'atlas:regenerated-exact-1' });
  const result = evaluateRollback(rollbackState([previous]), rollbackState([current]));
  const evidence = result.perTurnEvidence[0];
  assert.equal(result.ok, true);
  assert.equal(evidence.transition, 'exact');
  assert.equal(evidence.memberKeyRelation, 'regenerated');
  assert.equal(evidence.memberKeyRegenerated, true);
  assert.equal(evidence.memberKeyCorroborates, false);
});

test('regenerated logical member key with alias-equivalent identities is accepted', () => {
  const previous = rollbackRow(1);
  const current = rollbackRow(1, {
    logicalMemberKey: 'atlas:regenerated-alias-1',
    qId: 'fixture-question-1-rekeyed',
    primaryAId: 'fixture-answer-1-rekeyed',
    currentAnswerIds: ['fixture-answer-1-rekeyed'],
    questionCurrentAliases: ['fixture-question-1-rekeyed'],
    answerCurrentAliases: ['fixture-answer-1-rekeyed'],
    questionResolverAliases: ['fixture-question-1', 'fixture-question-1-rekeyed'],
    answerResolverAliases: ['fixture-answer-1', 'fixture-answer-1-rekeyed'],
    resolverAliases: [
      'fixture-question-1',
      'fixture-question-1-rekeyed',
      'fixture-answer-1',
      'fixture-answer-1-rekeyed',
    ],
    answerCurrentShells: [],
  });
  const result = evaluateRollback(rollbackState([previous]), rollbackState([current]));
  const evidence = result.perTurnEvidence[0];
  assert.equal(result.ok, true);
  assert.equal(evidence.transition, 'alias-equivalent');
  assert.equal(evidence.memberKeyRelation, 'regenerated');
  assert.equal(evidence.memberKeyRegenerated, true);
  assert.equal(evidence.question.ownerCount, 1);
  assert.equal(evidence.answer.ownerCount, 1);
});

test('different-turn resolver ownership is rejected despite matching logical member key', () => {
  const previous = rollbackRow(1, { logicalMemberKey: 'atlas:shared-key' });
  const wrongOwner = rollbackRow(2, {
    logicalMemberKey: 'atlas:shared-key',
    questionResolverAliases: ['fixture-question-2', previous.qId],
    answerResolverAliases: ['fixture-answer-2', previous.primaryAId],
    resolverAliases: [
      'fixture-question-2',
      previous.qId,
      'fixture-answer-2',
      previous.primaryAId,
    ],
  });
  const result = evaluateRollback(rollbackState([previous]), rollbackState([wrongOwner]));
  assert.equal(result.ok, false);
  assert.equal(result.perTurnEvidence[0].question.ownerCount, 1);
  assert.equal(result.perTurnEvidence[0].answer.ownerCount, 1);
  assert.ok(result.perTurnEvidence[0].failureReasons.includes('question-owned-by-another-member'));
  assert.ok(result.perTurnEvidence[0].failureReasons.includes('answer-owned-by-another-member'));
});

test('incident replay accepts alias-equivalent turns 4 through 6', () => {
  const baselineRows = Array.from({ length: 6 }, (_, index) => rollbackRow(index + 1));
  const currentRows = baselineRows.map((previous) => {
    if (previous.turnNo < 4) return rollbackRow(previous.turnNo);
    const nextQId = `${previous.qId}-rehydrated`;
    const nextPrimary = `${previous.primaryAId}-rehydrated`;
    return rollbackRow(previous.turnNo, {
      qId: nextQId,
      primaryAId: nextPrimary,
      currentAnswerIds: [nextPrimary],
      questionCurrentAliases: [nextQId],
      answerCurrentAliases: [nextPrimary],
      questionResolverAliases: [previous.qId, nextQId],
      answerResolverAliases: [previous.primaryAId, nextPrimary],
      resolverAliases: [previous.qId, nextQId, previous.primaryAId, nextPrimary],
      answerCurrentShells: [],
    });
  });
  const result = evaluateRollback(rollbackState(baselineRows), rollbackState(currentRows));
  assert.equal(result.ok, true);
  assert.deepEqual(Array.from(result.perTurnEvidence.slice(3).map((row) => row.transition)), [
    'alias-equivalent',
    'alias-equivalent',
    'alias-equivalent',
  ]);
});

test('cross-member alias ownership is rejected', () => {
  const baselineRows = [rollbackRow(1), rollbackRow(2)];
  const currentOne = rollbackRow(1, {
    primaryAId: 'fixture-answer-1-rekeyed',
    currentAnswerIds: ['fixture-answer-1-rekeyed'],
    answerResolverAliases: ['fixture-answer-1', 'fixture-answer-1-rekeyed'],
    resolverAliases: ['fixture-question-1', 'fixture-answer-1', 'fixture-answer-1-rekeyed'],
    answerCurrentShells: [],
  });
  const currentTwo = rollbackRow(2, {
    answerResolverAliases: ['fixture-answer-2', 'fixture-answer-1'],
    resolverAliases: ['fixture-question-2', 'fixture-answer-2', 'fixture-answer-1'],
  });
  const result = evaluateRollback(rollbackState(baselineRows), rollbackState([currentOne, currentTwo]));
  assert.equal(result.ok, false);
  assert.ok(result.perTurnEvidence[0].failureReasons.includes('answer-owner-count-not-one'));
  assert.ok(result.perTurnEvidence[0].failureReasons.includes('answer-owned-by-another-member'));
});

test('quarantined rollback identity is rejected', () => {
  const previous = rollbackRow(1);
  const current = rollbackRow(1);
  const currentState = rollbackState([current], {
    aliasDiagnostics: {
      ...cleanAliasDiagnostics,
      quarantinedAliasCount: 1,
      quarantinedAliases: [previous.primaryAId],
    },
  });
  const result = evaluateRollback(rollbackState([previous]), currentState);
  assert.equal(result.ok, false);
  assert.ok(result.perTurnEvidence[0].failureReasons.includes('involved-identity-quarantined'));
  assert.ok(result.failureReasons.includes('alias-diagnostics-not-clean'));
});

test('visible branch variant change is rejected despite resolver continuity', () => {
  const previous = rollbackRow(1);
  const current = rollbackRow(1, {
    primaryAId: 'fixture-answer-1-variant-b',
    currentAnswerIds: ['fixture-answer-1-variant-b'],
    answerCurrentAliases: ['fixture-answer-1-variant-b'],
    answerResolverAliases: ['fixture-answer-1', 'fixture-answer-1-variant-b'],
    resolverAliases: ['fixture-question-1', 'fixture-answer-1', 'fixture-answer-1-variant-b'],
    answerCurrentShells: [{
      shellTurnId: 'fixture-shell-1-variant-b',
      messageId: 'fixture-answer-1-variant-b',
      currentAnswerId: 'fixture-answer-1-variant-b',
    }],
  });
  const result = evaluateRollback(rollbackState([previous]), rollbackState([current]));
  assert.equal(result.ok, false);
  assert.equal(result.perTurnEvidence[0].visibleBranch.status, 'changed');
  assert.ok(result.perTurnEvidence[0].failureReasons.includes('visible-branch-selection-changed'));
});

test('durable checkpoint survives reload and preserves the pre-reload P8 summary', async () => {
  const localStorage = createStorage();
  const first = await createValidCheckpoint({ localStorage, activeSource: 'unexpected-source' });
  const p8Failure = await first.api.P8();
  assert.equal(p8Failure.ok, false);
  const beforeReload = first.api.EXPORT();
  assert.equal(beforeReload.checkpoint.stages.P8.ok, false);
  const checkpointRaw = first.localStorage.getItem('h2o:cv3:checkpoint:v1');
  assert.ok(Buffer.byteLength(checkpointRaw, 'utf8') <= 16 * 1024);
  assert.doesNotMatch(checkpointRaw, /ledgerSnapshot|perTurn|miniMapBoxes|consumerResults/);

  const second = createHarnessContext({ localStorage, sessionStorage: createStorage() });
  const reloadResult = await second.api.P8_RELOAD_VERIFY();
  assert.equal(reloadResult.checkpointRecovery.ok, true);
  assert.equal(reloadResult.checkpointRecovery.previousP8Summary.ok, false);
  const afterReload = second.api.EXPORT();
  assert.equal(afterReload.ok, true);
  assert.equal(afterReload.checkpoint.stages.P8.ok, false);
  assert.ok(afterReload.checkpoint.stages.P8_RELOAD);
  const p10 = await second.api.P10();
  assert.equal(p10.checkpointRecovery.ok, true);
  assert.equal(p10.stageResults.P8.ok, false);
});

test('malformed checkpoint is rejected without throwing', () => {
  const localStorage = createStorage({ 'h2o:cv3:checkpoint:v1': '{not-json' });
  const harness = createHarnessContext({ localStorage });
  const exported = harness.api.EXPORT();
  assert.equal(exported.ok, false);
  assert.equal(exported.checkpointReason, 'checkpoint-malformed-json');
});

test('stale checkpoint is rejected with an explicit reason', async () => {
  const valid = await createValidCheckpoint();
  const checkpoint = JSON.parse(valid.localStorage.getItem('h2o:cv3:checkpoint:v1'));
  checkpoint.expiresAt = '2000-01-01T00:00:00.000Z';
  valid.localStorage.setItem('h2o:cv3:checkpoint:v1', JSON.stringify(checkpoint));
  const harness = createHarnessContext({ localStorage: valid.localStorage });
  const exported = harness.api.EXPORT();
  assert.equal(exported.ok, false);
  assert.equal(exported.checkpointReason, 'checkpoint-expired');
});

test('foreign chat checkpoint is rejected with an explicit reason', async () => {
  const valid = await createValidCheckpoint({ chatKey: 'fixture-chat-a' });
  const harness = createHarnessContext({ chatKey: 'fixture-chat-b', localStorage: valid.localStorage });
  const exported = harness.api.EXPORT();
  assert.equal(exported.ok, false);
  assert.equal(exported.checkpointReason, 'checkpoint-foreign-chat');
});

test('foreign run checkpoint is rejected with an explicit reason', async () => {
  const valid = await createValidCheckpoint();
  const sessionStorage = createStorage({ 'h2o:cv3:run-id': 'cv3-foreign-current-run' });
  const harness = createHarnessContext({ localStorage: valid.localStorage, sessionStorage });
  const exported = harness.api.EXPORT();
  assert.equal(exported.ok, false);
  assert.equal(exported.checkpointReason, 'checkpoint-foreign-run');
});

test('CLEANUP removes every harness-owned key from both storage areas', async () => {
  const harness = await createValidCheckpoint();
  harness.sessionStorage.setItem('h2o:cv3:test-extra', 'session');
  harness.localStorage.setItem('h2o:cv3:test-extra', 'local');
  harness.sessionStorage.setItem('fixture-unrelated', 'keep');
  harness.localStorage.setItem('fixture-unrelated', 'keep');
  const result = harness.api.CLEANUP();
  assert.equal(result.ok, true);
  assert.equal(Object.keys(harness.sessionStorage.dump()).some((key) => key.startsWith('h2o:cv3:')), false);
  assert.equal(Object.keys(harness.localStorage.dump()).some((key) => key.startsWith('h2o:cv3:')), false);
  assert.equal(harness.sessionStorage.getItem('fixture-unrelated'), 'keep');
  assert.equal(harness.localStorage.getItem('fixture-unrelated'), 'keep');
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
  harnessPath,
  testCount: tests.length,
  failures,
  sourceSetterCalls,
}));

process.exitCode = failures === 0 ? 0 : 1;
