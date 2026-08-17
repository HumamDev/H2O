#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '../../..');
const paths = {
  enricher: path.join(repoRoot, 'src-runtime-base/9A1c.🟫🖥️ Chat Meta Enricher 🧾🖥️.js'),
  registry: path.join(repoRoot, 'src-runtime-base/0F1g.⬛️🗂️ Chat Registry 🧾🗂️.js'),
  core: path.join(repoRoot, 'shared/library/chat-registry-core.js'),
  nativeCore: path.join(repoRoot, 'src-runtime-base/0F0c.⬛️🧬 Library Registry Core 🧬.js'),
  studioCore: path.join(repoRoot, 'src-surfaces-base/studio/S0F0c. 🎬 Library Registry Core - Studio.js'),
  projects: path.join(repoRoot, 'src-runtime-base/0F2a.⬛️🗂️ Projects 🗂️.js'),
};

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name} declaration missing`);
  const open = source.indexOf('{', start);
  assert.ok(open >= 0, `${name} body missing`);
  let depth = 0;
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
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`${name} body is unterminated`);
}

function normalizedCoreBody(source) {
  const marker = source.indexOf('(() => {');
  assert.ok(marker >= 0, 'Registry Core IIFE missing');
  return source.slice(marker)
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .map((line) => line.trimEnd())
    .filter((line) => line.trim())
    .join('\n');
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const enricher = read(paths.enricher);
const registry = read(paths.registry);
const coreSource = read(paths.core);
const nativeCoreSource = read(paths.nativeCore);
const studioCoreSource = read(paths.studioCore);
const projects = read(paths.projects);

assert.equal(normalizedCoreBody(coreSource), normalizedCoreBody(nativeCoreSource),
  'native Registry Core executable body must match the canonical shared core');
assert.equal(normalizedCoreBody(coreSource), normalizedCoreBody(studioCoreSource),
  'Studio Registry Core executable body must match the canonical shared core');

const helperSandbox = { Date, JSON, Map, Math, Number, Object, Set, String };
helperSandbox.globalThis = helperSandbox;
vm.createContext(helperSandbox);
vm.runInContext([
  extractFunction(enricher, 'uniqueCountFromList'),
  extractFunction(enricher, 'listRuntimeAnswers'),
  extractFunction(enricher, 'hasUserTurnIdentity'),
  extractFunction(enricher, 'countUserTurns'),
  extractFunction(enricher, 'timestampMs'),
  extractFunction(enricher, 'chooseTruthfulCreatedAt'),
  extractFunction(enricher, 'createdAtHasObservedEvidence'),
  extractFunction(enricher, '_toIsoOrEmpty'),
  extractFunction(enricher, '_computeMirrorFingerprint'),
  extractFunction(enricher, 'buildRegistryMirrorInput'),
  'globalThis.testHooks = { listRuntimeAnswers, countUserTurns, chooseTruthfulCreatedAt, createdAtHasObservedEvidence, _computeMirrorFingerprint, buildRegistryMirrorInput };',
].join('\n'), helperSandbox, { filename: paths.enricher });

const hooks = helperSandbox.testHooks;
const q = (qId, answers = [], extra = {}) => ({ qId, turnId: `turn:${qId}`, answers, ...extra });

assert.equal(hooks.countUserTurns([q('q1', [{ id: 'a1' }])]), 1, 'U,A counts as one user turn');
assert.equal(hooks.countUserTurns([
  q('q1', [{ id: 'a1' }]),
  q('q2', [], { noAnswer: true }),
]), 2, 'an unanswered trailing user turn still counts');
assert.equal(hooks.countUserTurns([q('q1', [{ id: 'a1' }, { id: 'a2' }])]), 1,
  'regenerated/alternate assistant answers do not increase userTurnCount');
assert.equal(hooks.countUserTurns([
  { role: 'assistant', id: 'a1' },
  { role: 'tool', id: 'tool1' },
  { role: 'system', id: 'sys1' },
]), 0, 'assistant/tool/system continuations do not create user turns');
assert.equal(hooks.listRuntimeAnswers([q('q1', [{ id: 'a1' }, { id: 'a2' }])]).length, 2,
  'answerCount source semantics continue to count assistant answer variants');
assert.equal(hooks.countUserTurns([q('q1', [{ id: 'a1' }]), q('q1', [{ id: 'a1' }])]), 1,
  'a re-rendered duplicate of the same question turn counts once');
assert.equal(hooks.countUserTurns([
  { role: 'user', id: 'm1' },
  { role: 'assistant', id: 'm2' },
  { role: 'user', id: 'm3' },
]), 2, 'the H2O.turn.getTurns() fallback shape counts user-role turns by identity');

const oldCreated = 1_700_000_000_000;
const earlierCreated = 1_600_000_000_000;
assert.equal(hooks.chooseTruthfulCreatedAt(null, null), null, 'unknown createdAt remains unknown');
assert.equal(hooks.chooseTruthfulCreatedAt(oldCreated, null), oldCreated,
  'existing createdAt is preserved without stronger evidence');
assert.equal(hooks.chooseTruthfulCreatedAt(oldCreated, earlierCreated), earlierCreated,
  'true earlier creation evidence may correct through normal older-date semantics');

// Field-specific creation evidence. Only an observed creation timestamp that is
// also the accepted value may certify createdAt.
assert.equal(hooks.createdAtHasObservedEvidence(earlierCreated, earlierCreated), true,
  'a freshly observed creation timestamp certifies the createdAt it produced');
assert.equal(hooks.createdAtHasObservedEvidence(oldCreated, null), false,
  'a preserved legacy createdAt is never certified without current evidence');
assert.equal(hooks.createdAtHasObservedEvidence(null, null), false,
  'an unknown createdAt is never certified');
assert.equal(hooks.createdAtHasObservedEvidence(oldCreated, oldCreated), true,
  'an observation that confirms the stored value certifies it');
assert.equal(hooks.createdAtHasObservedEvidence(Date.now(), null), false,
  'no current-clock value can certify createdAt');

const evidencedMirror = hooks.buildRegistryMirrorInput('chat-1', {
  createdAt: earlierCreated,
  createdAtSource: 'open-chat-message',
  updatedAt: 1_800_000_000_000,
});
assert.equal(evidencedMirror.createdAtSource, 'open-chat-message',
  'observed creation evidence reaches the Registry as createdAtSource');

const legacyOnlyMirror = hooks.buildRegistryMirrorInput('chat-1', {
  createdAt: oldCreated,
  userTurnCount: 2,
  metadataCapturedAt: 1_800_000_000_000,
  metadataSource: 'open-chat',
  updatedAt: 1_800_000_000_000,
});
assert.equal(Object.hasOwn(legacyOnlyMirror, 'createdAtSource'), false,
  'a userTurnCount-only capture never certifies a preserved legacy createdAt');
assert.equal(legacyOnlyMirror.metadataSource, 'open-chat',
  'record-level metadataSource stays independent of creation-date proof');

const sourceWithoutValue = hooks.buildRegistryMirrorInput('chat-1', {
  createdAtSource: 'open-chat-message',
  updatedAt: 1_800_000_000_000,
});
assert.equal(Object.hasOwn(sourceWithoutValue, 'createdAtSource'), false,
  'creation proof can never travel without the createdAt it certifies');

// ── userTurnCount provenance: count evidence, end to end ───────────────────
const TURN_SOURCE = 'open-chat-turn-runtime';
const capturedCount = (turns) => hooks.buildRegistryMirrorInput('chat-1', {
  updatedAt: 1_800_000_000_000,
  userTurnCount: hooks.countUserTurns(turns),
  userTurnCountSource: TURN_SOURCE,
});

const twoTurnCapture = capturedCount([q('q1', [{ id: 'a1' }]), q('q2', [{ id: 'a2' }])]);
assert.equal(twoTurnCapture.userTurnCount, 2);
assert.equal(twoTurnCapture.userTurnCountSource, TURN_SOURCE,
  'a measured two-turn chat reaches the Registry with its count proof');

const unansweredCapture = capturedCount([q('q1', [{ id: 'a1' }]), q('q2', [], { noAnswer: true })]);
assert.equal(unansweredCapture.userTurnCount, 2);
assert.equal(unansweredCapture.userTurnCountSource, TURN_SOURCE,
  'an unanswered trailing user turn is counted and certified');

const regeneratedCapture = capturedCount([q('q1', [{ id: 'a1' }, { id: 'a2' }])]);
assert.equal(regeneratedCapture.userTurnCount, 1);
assert.equal(regeneratedCapture.userTurnCountSource, TURN_SOURCE,
  'regenerated answers collapse to one certified user turn');

const noTurnEvidenceMirror = hooks.buildRegistryMirrorInput('chat-1', {
  createdAt: earlierCreated,
  createdAtSource: 'open-chat-message',
  metadataCapturedAt: 1_800_000_000_000,
  metadataSource: 'open-chat',
  updatedAt: 1_800_000_000_000,
});
assert.equal(Object.hasOwn(noTurnEvidenceMirror, 'userTurnCount'), false,
  'a capture without turn evidence sends no count');
assert.equal(Object.hasOwn(noTurnEvidenceMirror, 'userTurnCountSource'), false,
  'neither metadataSource nor createdAtSource can certify a count');

const countSourceWithoutCount = hooks.buildRegistryMirrorInput('chat-1', {
  userTurnCountSource: TURN_SOURCE,
  updatedAt: 1_800_000_000_000,
});
assert.equal(Object.hasOwn(countSourceWithoutCount, 'userTurnCountSource'), false,
  'count proof can never travel without the count it certifies');

const unknownInput = hooks.buildRegistryMirrorInput('chat-1', {
  answers: 2,
  updatedAt: 1_800_000_000_000,
  firstQ: 'Q',
});
assert.equal(Object.hasOwn(unknownInput, 'createdAt'), false,
  'observation/update time cannot fabricate createdAt');
assert.equal(Object.hasOwn(unknownInput, 'lastMessageAt'), false,
  'observation/update time cannot fabricate lastMessageAt');
assert.equal(unknownInput.answerCount, 2, 'answerCount remains bridged independently');

const capturedInput = hooks.buildRegistryMirrorInput('chat-1', {
  createdAt: earlierCreated,
  lastMessageAt: oldCreated,
  updatedAt: 1_800_000_000_000,
  metadataCapturedAt: 1_800_000_000_000,
  metadataSource: 'open-chat',
  userTurnCount: 2,
});
assert.equal(capturedInput.createdAt, new Date(earlierCreated).toISOString());
assert.equal(capturedInput.lastMessageAt, new Date(oldCreated).toISOString());
assert.equal(capturedInput.userTurnCount, 2);
assert.equal(capturedInput.metadataCapturedAt, new Date(1_800_000_000_000).toISOString());
assert.equal(capturedInput.metadataSource, 'open-chat');

const fingerprintA = hooks._computeMirrorFingerprint('chat-1', {
  createdAt: earlierCreated,
  userTurnCount: 2,
  metadataSource: 'open-chat',
  metadataCapturedAt: 1_800_000_000_000,
  updatedAt: 1_800_000_000_000,
});
const fingerprintB = hooks._computeMirrorFingerprint('chat-1', {
  createdAt: earlierCreated,
  userTurnCount: 2,
  metadataSource: 'open-chat',
  metadataCapturedAt: 1_800_000_000_999,
  updatedAt: 1_800_000_000_999,
});
assert.equal(fingerprintA, fingerprintB,
  'capture/update clocks do not cause repeated identical Registry writes');

const coreSandbox = { console };
coreSandbox.globalThis = coreSandbox;
vm.createContext(coreSandbox);
vm.runInContext(coreSource, coreSandbox, { filename: paths.core });
const core = coreSandbox.H2O?.Library?.RegistryCore;
assert.ok(core, 'canonical Chat Registry Core publishes');

const sanitized = core.sanitizeRecord({
  chatId: 'chat-1',
  metadataCapturedAt: '2026-08-13T10:00:00.000Z',
  metadataSource: ' open-chat ',
  userTurnCount: 2,
});
assert.equal(sanitized.metadataCapturedAt, '2026-08-13T10:00:00.000Z');
assert.equal(sanitized.metadataSource, 'open-chat');
assert.equal(sanitized.userTurnCount, 2);

const previous = core.sanitizeRecord({
  chatId: 'chat-1',
  createdAt: '2026-08-10T10:00:00.000Z',
  lastMessageAt: '2026-08-12T10:00:00.000Z',
  metadataCapturedAt: '2026-08-12T11:00:00.000Z',
  metadataSource: 'open-chat',
  userTurnCount: 3,
});
const noTruthIncoming = core.sanitizeRecord({
  chatId: 'chat-1',
  updatedAt: '2026-08-13T12:00:00.000Z',
  userTurnCount: 0,
});
const preserved = core.mergeRecord(previous, noTruthIncoming);
assert.equal(preserved.createdAt, previous.createdAt, 'known createdAt survives an evidence-free update');
assert.equal(preserved.lastMessageAt, previous.lastMessageAt, 'known lastMessageAt survives an evidence-free update');
assert.equal(preserved.userTurnCount, 3, 'existing max-safe count merge behavior remains unchanged');
assert.equal(preserved.metadataCapturedAt, previous.metadataCapturedAt);
assert.equal(preserved.metadataSource, 'open-chat');

// ── createdAtSource: proof follows the accepted value ──────────────────────
assert.equal(core.sanitizeRecord({ chatId: 'c', createdAtSource: ' open-chat-message ' }).createdAtSource,
  'open-chat-message', 'createdAtSource survives sanitize');

const legacyUnverified = core.sanitizeRecord({ chatId: 'chat-2', createdAt: '2026-08-01T00:00:00.000Z' });
assert.equal(legacyUnverified.createdAtSource, '', 'a historical record has no creation proof');
const legacyAfterBlindCapture = core.mergeRecord(legacyUnverified, core.sanitizeRecord({
  chatId: 'chat-2',
  userTurnCount: 4,
  metadataCapturedAt: '2026-08-13T12:00:00.000Z',
  metadataSource: 'open-chat',
}));
assert.equal(legacyAfterBlindCapture.createdAt, '2026-08-01T00:00:00.000Z',
  'an unverified legacy date is preserved, never deleted');
assert.equal(legacyAfterBlindCapture.createdAtSource, '',
  'opening a chat does not certify a date the capture never observed');

const correctedByEvidence = core.mergeRecord(legacyUnverified, core.sanitizeRecord({
  chatId: 'chat-2',
  createdAt: '2024-01-01T00:00:00.000Z',
  createdAtSource: 'open-chat-message',
}));
assert.equal(correctedByEvidence.createdAt, '2024-01-01T00:00:00.000Z',
  'true older creation evidence replaces a newer legacy value');
assert.equal(correctedByEvidence.createdAtSource, 'open-chat-message',
  'the replacing value carries its own proof');

const trustedKept = core.mergeRecord(correctedByEvidence, core.sanitizeRecord({
  chatId: 'chat-2',
  updatedAt: '2026-08-13T12:00:00.000Z',
}));
assert.equal(trustedKept.createdAt, '2024-01-01T00:00:00.000Z');
assert.equal(trustedKept.createdAtSource, 'open-chat-message',
  'an evidence-free update preserves both the trusted date and its proof');

const rejectedNewerProof = core.mergeRecord(correctedByEvidence, core.sanitizeRecord({
  chatId: 'chat-2',
  createdAt: '2026-08-01T00:00:00.000Z',
  createdAtSource: 'open-chat-message',
}));
assert.equal(rejectedNewerProof.createdAt, '2024-01-01T00:00:00.000Z');
assert.equal(rejectedNewerProof.createdAtSource, 'open-chat-message',
  'proof attached to a losing newer value cannot certify the surviving older one');

const unverifiedSurvivor = core.mergeRecord(legacyUnverified, core.sanitizeRecord({
  chatId: 'chat-2',
  createdAt: '2026-09-01T00:00:00.000Z',
  createdAtSource: 'open-chat-message',
}));
assert.equal(unverifiedSurvivor.createdAt, '2026-08-01T00:00:00.000Z');
assert.equal(unverifiedSurvivor.createdAtSource, '',
  'a preserved unverified date never inherits proof from the value it beat');

// ── userTurnCountSource: proof follows the count that won ──────────────────
const defaultCount = core.sanitizeRecord({ chatId: 'chat-3' });
assert.equal(defaultCount.userTurnCount, 0, 'an uncaptured count sanitizes to the schema default');
assert.equal(defaultCount.userTurnCountSource, '',
  'schema-default 0 is distinguishable from a measurement by its empty source');

const measuredTwo = core.sanitizeRecord({
  chatId: 'chat-3', userTurnCount: 2, userTurnCountSource: ' open-chat-turn-runtime ',
});
assert.equal(measuredTwo.userTurnCountSource, TURN_SOURCE, 'userTurnCountSource survives sanitize');
assert.notEqual(defaultCount.userTurnCountSource, measuredTwo.userTurnCountSource,
  'unknown and measured counts are demonstrably different records');

const countKeptWithoutEvidence = core.mergeRecord(measuredTwo, core.sanitizeRecord({
  chatId: 'chat-3', metadataCapturedAt: '2026-08-13T12:00:00.000Z', metadataSource: 'open-chat',
}));
assert.equal(countKeptWithoutEvidence.userTurnCount, 2);
assert.equal(countKeptWithoutEvidence.userTurnCountSource, TURN_SOURCE,
  'a trusted count and its proof both survive an evidence-free capture');

const higherCountWins = core.mergeRecord(measuredTwo, core.sanitizeRecord({
  chatId: 'chat-3', userTurnCount: 5, userTurnCountSource: TURN_SOURCE,
}));
assert.equal(higherCountWins.userTurnCount, 5);
assert.equal(higherCountWins.userTurnCountSource, TURN_SOURCE,
  'a genuinely higher captured count carries its incoming proof');

const lowerCountLoses = core.mergeRecord(measuredTwo, core.sanitizeRecord({
  chatId: 'chat-3', userTurnCount: 1, userTurnCountSource: 'some-future-source',
}));
assert.equal(lowerCountLoses.userTurnCount, 2,
  'max-safe count merge is unchanged — the branch-switch limitation stays deferred');
assert.equal(lowerCountLoses.userTurnCountSource, TURN_SOURCE,
  'a losing lower count cannot steal provenance from the retained larger count');

const unknownGainsProof = core.mergeRecord(defaultCount, measuredTwo);
assert.equal(unknownGainsProof.userTurnCount, 2);
assert.equal(unknownGainsProof.userTurnCountSource, TURN_SOURCE,
  'a first real measurement certifies a previously unknown count');

const adoptedCount = core.adoptShape({ recordsById: { 'chat-3': higherCountWins } });
assert.equal(adoptedCount.recordsById['chat-3'].userTurnCountSource, TURN_SOURCE,
  'userTurnCountSource survives load/adopt');
assert.equal(adoptedCount.recordsById['chat-3'].userTurnCount, 5,
  'the certified count survives load/adopt alongside its proof');
assert.ok(core.diffFields(defaultCount, measuredTwo).includes('userTurnCountSource'),
  'count-proof changes are observable to Registry consumers');

const newerCapture = core.mergeRecord(previous, {
  chatId: 'chat-1',
  metadataCapturedAt: '2026-08-13T12:00:00.000Z',
  metadataSource: 'open-chat',
  userTurnCount: 4,
});
assert.equal(newerCapture.metadataCapturedAt, '2026-08-13T12:00:00.000Z');
assert.equal(newerCapture.metadataSource, 'open-chat');
assert.equal(newerCapture.userTurnCount, 4);

const adopted = core.adoptShape({
  recordsById: { 'chat-1': newerCapture },
  tombstonesById: { 'chat-deleted': { chatId: 'chat-deleted', reason: 'user', deletedAt: '2026-08-12T00:00:00.000Z' } },
});
assert.equal(adopted.recordsById['chat-1'].metadataCapturedAt, newerCapture.metadataCapturedAt,
  'metadataCapturedAt survives load/adopt');
assert.equal(adopted.recordsById['chat-1'].metadataSource, 'open-chat',
  'metadataSource survives load/adopt');
assert.equal(adopted.tombstonesById['chat-deleted'].reason, 'user', 'tombstone data survives adoption unchanged');

const adoptedProof = core.adoptShape({ recordsById: { 'chat-2': correctedByEvidence } });
assert.equal(adoptedProof.recordsById['chat-2'].createdAtSource, 'open-chat-message',
  'createdAtSource survives load/adopt');
assert.equal(adoptedProof.recordsById['chat-2'].createdAt, '2024-01-01T00:00:00.000Z',
  'the certified date survives load/adopt alongside its proof');
assert.ok(core.diffFields(legacyUnverified, correctedByEvidence).includes('createdAtSource'),
  'creation-proof changes are observable to Registry consumers');

assert.match(enricher, /const publishedTurns = listRuntimeTurns\(\);[\s\S]*const turns = publishedTurns\.some\(hasUserTurnIdentity\)[\s\S]*const runtimeTurns = Array\.isArray\(state\?\.turns\)[\s\S]*countUserTurns\(runtimeTurns\)/,
  'open-chat capture takes one canonical turn snapshot and reuses it');
assert.match(enricher, /capturedMeaningfulMetadata \? \{ metadataSource: 'open-chat' \}/,
  'open-chat provenance is explicit and evidence-gated');
assert.match(enricher, /capturedMeaningfulMetadata \? \{ metadataCapturedAt: now \}/,
  'capture time is written only alongside a meaningful metadata change');
assert.doesNotMatch(enricher, /const createdAt\s*=\s*tsMs\s*\?\?[^;]*now/,
  'createdAt has no current-observation fallback');
assert.doesNotMatch(enricher, /lastMessageAt\s*:\s*updatedAtIso/,
  'lastMessageAt is never populated from record update time');
assert.doesNotMatch(enricher, /(?:fetch\s*\(|backend-api\/conversation|LibraryStore)/,
  'Phase 1 adds neither background conversation fetching nor Library Store migration');
assert.match(enricher, /\.\.\.\(createdAtEvidenced \? \{ createdAtSource: 'open-chat-message' \} : \{\}\)/,
  'createdAtSource is written only from observed creation evidence');
assert.equal((enricher.match(/createdAtSource: 'open-chat-message'/g) || []).length, 1,
  'open-chat-message provenance has exactly one writer');
assert.match(enricher, /\.\.\.\(hasUserTurnEvidence \? \{\s*userTurnCount,\s*userTurnCountSource: 'open-chat-turn-runtime',\s*\} : \{\}\)/,
  'the count and its proof are written together from the same evidence gate');
assert.equal((enricher.match(/userTurnCountSource: 'open-chat-turn-runtime'/g) || []).length, 1,
  'open-chat-turn-runtime provenance has exactly one writer');
assert.match(enricher, /const turns = window\.H2O\?\.turnRuntime\?\.listTurns\?\.\(\);[\s\S]*window\.H2O\?\.turn\?\.getTurns\?\.\(\)/,
  'count evidence still comes from the existing turn surfaces, not a new turn model');
assert.doesNotMatch(enricher, /(?:purge|migrate|backfill|cleanup)[A-Za-z]*CreatedAt|createdAt[A-Za-z]*(?:Purge|Cleanup|Backfill)/i,
  'Phase 1.1 performs no historical createdAt cleanup');
assert.match(registry, /if \(tomb && options\.allowResurrect !== true\) \{[\s\S]*return null;/,
  'Registry tombstone gate remains fail-closed');
assert.equal(projects.includes('Open once to load details'), false, 'Phase 2 Project-card wording is absent');
assert.equal(projects.includes('Q&A'), false, 'Phase 2 Project-card Q&A wording is absent');

assert.ok(core.diffFields(previous, newerCapture).includes('metadataCapturedAt'),
  'metadata capture changes are observable to Registry consumers');
assert.ok(core.diffFields(previous, newerCapture).includes('userTurnCount'),
  'userTurnCount changes are observable to Registry consumers');

console.log('PASS validate-project-chat-metadata-phase1-integrity');
console.log(JSON.stringify({
  userTurnFixtures: { answered: 1, unansweredTrailing: 2, regenerated: 1 },
  createdAtUnknown: true,
  createdAtProvenance: {
    observedEvidenceCertifies: 'open-chat-message',
    legacyPreservedButUnverified: plain({
      createdAt: legacyAfterBlindCapture.createdAt,
      createdAtSource: legacyAfterBlindCapture.createdAtSource,
    }),
    olderEvidenceCorrectsAndCertifies: plain({
      createdAt: correctedByEvidence.createdAt,
      createdAtSource: correctedByEvidence.createdAtSource,
    }),
  },
  userTurnCountProvenance: {
    measuredCertifies: TURN_SOURCE,
    schemaDefaultUnknown: plain({
      userTurnCount: defaultCount.userTurnCount,
      userTurnCountSource: defaultCount.userTurnCountSource,
    }),
    retainedMaxKeepsOwnProof: plain({
      userTurnCount: lowerCountLoses.userTurnCount,
      userTurnCountSource: lowerCountLoses.userTurnCountSource,
    }),
  },
  duplicateQIdCountsOnce: 1,
  fallbackTurnShapeUserTurns: 2,
  lastMessageAtObservationFallback: false,
  provenanceRoundtrip: plain({
    metadataCapturedAt: adopted.recordsById['chat-1'].metadataCapturedAt,
    metadataSource: adopted.recordsById['chat-1'].metadataSource,
  }),
  mirrorParity: true,
  projectUiChanged: false,
  libraryStoreMigration: false,
  backgroundFetch: false,
}, null, 2));
