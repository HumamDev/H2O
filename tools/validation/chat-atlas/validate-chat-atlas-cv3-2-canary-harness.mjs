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
const context = vm.createContext({
  console: Object.freeze({ info() {}, log() {}, warn() {}, error() {} }),
  H2O: Object.freeze({
    turnRuntime: Object.freeze({
      setChatAtlasCanonicalSource() {
        sourceSetterCalls += 1;
        throw new Error('source setter must not run while installing the harness');
      },
    }),
  }),
});

vm.runInContext(source, context, { filename: harnessPath });
assert.equal(sourceSetterCalls, 0, 'harness evaluation invoked the canonical source setter');

const evaluate = context.H2O_CV3_CANARY?.evaluateStreamingIdentityContinuity;
assert.equal(typeof evaluate, 'function', 'streaming continuity evaluator was not exported');

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
    'originalUnchangedTurnsEquivalent',
  ]) {
    assert.match(source, new RegExp(`\\b${gate}:`), `missing P8 gate: ${gate}`);
  }
  assert.match(source, /const SOURCE_LEGACY = 'legacy-durable-cache'/);
  assert.match(source, /persisted:\s*source\.persisted/);
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

let failures = 0;
for (const { name, fn } of tests) {
  try {
    fn();
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
