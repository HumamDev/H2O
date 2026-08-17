#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '../../..');
const ownerPath = path.join(repoRoot, 'src-runtime-base/9A1c.🟫🖥️ Chat Meta Enricher 🧾🖥️.js');
const source = fs.readFileSync(ownerPath, 'utf8');

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name} declaration missing`);
  const open = source.indexOf('{', start);
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

const meaningfulFields = source.match(/const MEANINGFUL_META_FIELDS = Object\.freeze\(\[[\s\S]*?\]\);/)?.[0];
assert.ok(meaningfulFields, 'meaningful metadata field contract missing');

const sandbox = { JSON, Map, Object, String };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext([
  extractFunction('hasUserTurnIdentity'),
  extractFunction('semanticElementId'),
  extractFunction('turnQuestionIdentity'),
  extractFunction('answerIdentity'),
  extractFunction('buildOpenChatStateSignature'),
  meaningfulFields,
  extractFunction('hasMeaningfulMetaChange'),
  extractFunction('createOpenChatMetaSyncController'),
  'globalThis.hooks = { buildOpenChatStateSignature, hasMeaningfulMetaChange, createOpenChatMetaSyncController };',
].join('\n'), sandbox, { filename: ownerPath });

const { buildOpenChatStateSignature, hasMeaningfulMetaChange, createOpenChatMetaSyncController } = sandbox.hooks;
const q = (qId, answerIds = []) => ({ qId, turnId: `turn:${qId}`, answerIds });
const answers = (...ids) => ids.map((id) => ({ id }));
const dom = { userIds: [], assistantIds: [] };

let state = {
  chatId: 'chat-1',
  turns: [q('q1', ['a1'])],
  answers: answers('a1'),
  domSnapshot: dom,
};
const sign = (value = state) => buildOpenChatStateSignature(
  value.chatId,
  value.turns,
  value.answers,
  value.domSnapshot,
);
state.signature = sign();

let nextTimerId = 1;
const timers = new Map();
const setTimer = (fn) => {
  const id = nextTimerId++;
  timers.set(id, fn);
  return id;
};
const clearTimer = (id) => timers.delete(id);
const runTimers = () => {
  const pending = [...timers.values()];
  timers.clear();
  pending.forEach((fn) => fn());
};
const settleTimers = () => {
  for (let round = 0; timers.size && round < 10; round += 1) runTimers();
};
let acquisitions = 0;
const controller = createOpenChatMetaSyncController({
  readState: () => state,
  acquire: () => { acquisitions += 1; return { ok: true }; },
  settleMs: 0,
  setTimer,
  clearTimer,
});

for (let index = 0; index < 100; index += 1) controller.request('mutation');
assert.equal(timers.size, 1, '100 same-state mutation requests collapse to one pending task');
settleTimers();
assert.equal(acquisitions, 1, '100 same-state mutation requests cause one expensive acquisition');

state = { ...state, ready: false };
state.signature = sign(state);
controller.clearSignatures();
controller.request('semantic-state-not-ready');
settleTimers();
assert.equal(acquisitions, 1, 'an unready canonical turn state defers expensive acquisition');
state = { ...state, ready: true };

for (const reason of ['route', 'answers', 'minimap', 'turn', 'mutation']) controller.request(reason);
settleTimers();
assert.equal(acquisitions, 2, 'a newly ready state produces one acquisition after deferred requests coalesce');

for (const reason of ['route', 'answers', 'minimap', 'turn', 'mutation']) controller.request(reason);
settleTimers();
assert.equal(acquisitions, 2, 'mixed identical-state triggers are rejected by the early signature');

state = { ...state, turns: [q('q1', ['a1']), q('q2', [])] };
state.signature = sign(state);
controller.request('new-unanswered-user-turn');
settleTimers();
assert.equal(acquisitions, 3, 'an unanswered new user turn produces one new acquisition');

state = { ...state, turns: [q('q1', ['a1', 'a1b']), q('q2', [])], answers: answers('a1', 'a1b') };
state.signature = sign(state);
controller.request('answer-variant');
settleTimers();
assert.equal(acquisitions, 4, 'an answer variant identity change produces one new acquisition');

const sameDomRerenderSignature = buildOpenChatStateSignature(
  state.chatId,
  state.turns.map((turn) => ({ ...turn })),
  state.answers.map((answer) => ({ ...answer })),
  { userIds: [], assistantIds: [] },
);
assert.equal(sameDomRerenderSignature, state.signature,
  'new DOM/object instances with the same semantic IDs retain one signature');

assert.equal(hasMeaningfulMetaChange({ answers: 2, metadataCapturedAt: 1 }, { answers: 2 }), false,
  'capture clocks alone never force an interface-store write');
assert.equal(hasMeaningfulMetaChange({ answers: 2 }, { answers: 3 }), true,
  'changed meaningful metadata requests exactly one interface-store write');
const truthfulReuseBody = extractFunction('reusableTruthfulOpenChatMeta');
assert.match(truthfulReuseBody, /createdAtSource[\s\S]*userTurnCountSource[\s\S]*rec\.userTurnCount[\s\S]*rec\.answers/,
  'fast reuse requires verified creation/count provenance and matching semantic counts');
assert.match(extractFunction('updateMetaFromOpenChat'), /reusableTruthfulOpenChatMeta\([\s\S]*return \{ ok: true, changed: false, reusedTruthfulMeta: true/,
  'verified unchanged metadata returns before loaded-message discovery and store writes');

const captureBody = extractFunction('captureOpenChatSemanticState');
const acquisitionBody = extractFunction('updateMetaFromOpenChat');
const messagesBody = extractFunction('getLoadedConversationMessages');
const snapshotsBody = extractFunction('getFirstLastSnapshots');
const extractTextBody = extractFunction('extractMessageText');
const requestBody = extractFunction('requestOpenChatMetaSync');
const semanticEventBody = extractFunction('requestMetaFromSemanticEvent');

assert.equal((captureBody.match(/listRuntimeTurns\(\)/g) || []).length, 1,
  'one semantic-state read takes one canonical turn snapshot');
assert.match(captureBody, /publishedTurns\.some\(hasUserTurnIdentity\)[\s\S]*domSnapshot\.userEls\.map/,
  'mounted role-bearing message elements provide a no-text fallback when Core turns are unavailable');
assert.doesNotMatch(acquisitionBody, /listRuntimeTurns\(\)/,
  'expensive acquisition reuses the supplied turn snapshot');
assert.match(acquisitionBody, /getLoadedConversationMessages\(runtimeTurns, runtimeAnswers\)/,
  'one loaded-message discovery receives the shared turn/answer snapshot');
assert.equal((acquisitionBody.match(/getLoadedConversationMessages\(/g) || []).length, 1,
  'one acquisition discovers loaded conversation messages once');
assert.doesNotMatch(messagesBody, /listRuntimeTurns\(|listRuntimeAnswers\(/,
  'loaded-message discovery never rediscovers turns or answers');
assert.doesNotMatch(snapshotsBody, /listRuntimeTurns\(|listRuntimeAnswers\(/,
  'snapshot extraction reuses the same turn/answer arrays');
assert.doesNotMatch(extractTextBody, /innerText/,
  'preview snapshots cannot force synchronous layout through innerText');
assert.doesNotMatch(source, /refreshTurnsCache/,
  'metadata owns no MiniMap forced-refresh path');
assert.match(acquisitionBody, /if \(changed\) \{\s*I\.store\.setMeta\(chatId, partial\)/,
  'interface store is written only when meaningful metadata changes');
assert.match(source, /_computeMirrorFingerprint[\s\S]*_lastMirrorFingerprintByChatId/,
  'Registry fingerprint remains defense-in-depth');
assert.match(requestBody, /_openChatMetaSyncController\.request\(reason\)/,
  'all callers converge on one acquisition controller');
assert.match(source, /setTimer: scheduleOpenChatMetaRead,[\s\S]*scheduleAcquire: scheduleOpenChatMetaIdle/,
  'cheap reads use one-shot tasks while only the graduated acquisition uses background scheduling');
assert.doesNotMatch(extractFunction('scheduleOpenChatMetaIdle'), /timeout:/,
  'metadata must never force an idle callback while the renderer remains busy');
assert.match(source, /new MessageChannel\(\)[\s\S]*scheduler\.postTask\(callback, \{ priority: 'user-visible' \}\)/,
  'production avoids timer starvation without polling or a forced idle deadline');
assert.match(extractFunction('createOpenChatMetaSyncController'), /if \(timer\) return;[\s\S]*timer = setTimer\(flush, settleMs\)/,
  'repeated requests cannot postpone the pending cheap semantic read forever');
assert.match(extractFunction('createOpenChatMetaSyncController'), /now - lastStateReadAt\) < settleMs/,
  'cheap semantic reads are rate-limited by the same settle window');
assert.match(acquisitionBody, /reusedTruthfulMeta: true[\s\S]*expensiveAcquisitionCount \+= 1[\s\S]*getLoadedConversationMessages/,
  'truthful reuse is returned before the expensive-pass counter and message discovery');
assert.match(source, /settlingSignatureByChatId\.get\(chatId\) !== signature[\s\S]*request\('verify-settled-semantic-state'\)/,
  'a signature must survive two idle-settled observations before acquisition');
assert.match(extractFunction('captureOpenChatSemanticState'), /ready: composerReady[\s\S]*canonicalUserTurnCount > 0[\s\S]*domSnapshot\.userCount >= canonicalUserTurnCount/,
  'the chat must be usable and mounted user content must catch canonical turns before full acquisition');
assert.match(source, /requestOpenChatMetaSync\('conversation-dom-mutation'\)/,
  'DOM mount churn only requests the one canonical coalescer');
const observerSchedulePrologue = source.match(/function schedule\(\)\{([\s\S]*?)if \(Date\.now\(\) < HO_META_SKIP_UNTIL\)/)?.[1] || '';
assert.ok(observerSchedulePrologue, 'MutationObserver schedule prologue missing');
assert.doesNotMatch(observerSchedulePrologue, /querySelector|querySelectorAll|updateMetaFromOpenChat/,
  'the MutationObserver callback performs no metadata or DOM discovery work');
assert.match(semanticEventBody, /requestOpenChatMetaSync\(/,
  'semantic/MiniMap events only request the canonical controller');
assert.doesNotMatch(semanticEventBody, /(?:setTimeout|requestAnimationFrame|updateMetaFromOpenChat)/,
  'semantic events cannot accumulate their own retry/timer queues');
assert.equal((source.match(/new MutationObserver\(/g) || []).length, 1,
  'no second MutationObserver was added');
assert.doesNotMatch(source, /(?:fetch\s*\(|backend-api\/conversation)/,
  'no background conversation fetch was added');

console.log('PASS validate-project-chat-metadata-phase2-1a-open-chat-performance');
console.log(JSON.stringify({
  identicalMutationRequests: 100,
  identicalMutationAcquisitions: 1,
  meaningfulStateAcquisitions: acquisitions,
  miniMapForcedRefresh: false,
  sharedTurnSnapshot: true,
  sharedMessageSnapshot: true,
  noOpStoreSuppression: true,
  registryFingerprintPreserved: true,
}, null, 2));
