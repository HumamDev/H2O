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
    /* Comments are skipped before quote handling. A prose apostrophe — as in
       "the controller's settle window" — would otherwise open a string that
       swallows the closing brace, and the extractor would silently return the
       wrong body instead of failing. */
    if (char === '/' && source[index + 1] === '/') {
      const newline = source.indexOf('\n', index);
      index = newline < 0 ? source.length : newline;
      continue;
    }
    if (char === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      index = end < 0 ? source.length : end + 1;
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

const sandbox = { Date, Math, Number, String };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext([
  extractFunction('formatDate'),
  extractFunction('isProjectPagePath'),
  extractFunction('projectCardChatId'),
  extractFunction('createPendingProjectMetaTracker'),
  extractFunction('formatProjectCardRegistryMetadata'),
  'globalThis.hooks = { formatProjectCardRegistryMetadata, isProjectPagePath, projectCardChatId, createPendingProjectMetaTracker };',
].join('\n'), sandbox, { filename: ownerPath });

const {
  formatProjectCardRegistryMetadata: format,
  isProjectPagePath,
  projectCardChatId,
  createPendingProjectMetaTracker,
} = sandbox.hooks;
const createdAt = '2026-08-13T10:30:00.000Z';
const trustedDate = { createdAt, createdAtSource: 'open-chat-message' };
const trustedCount = { userTurnCount: 2, userTurnCountSource: 'open-chat-turn-runtime' };

assert.equal(format({ ...trustedDate, ...trustedCount }), 'Created: 13 Aug 2026 · 2 Q&A',
  'trusted date + trusted count uses the exact combined card text');
assert.equal(format(trustedDate), 'Created: 13 Aug 2026',
  'trusted date + unknown count shows only the date');
assert.equal(format(trustedCount), '2 Q&A',
  'unknown date + trusted count shows only Q&A');
assert.equal(format({}), 'Open once to load details',
  'unknown date + unknown count uses exact open-once instruction');

assert.equal(format({ createdAt }), 'Open once to load details',
  'unverified legacy createdAt is not displayed');
assert.equal(format({ userTurnCount: 0, userTurnCountSource: '' }), 'Open once to load details',
  'schema-default zero without provenance remains unknown');
assert.equal(format({ userTurnCount: 0, userTurnCountSource: 'open-chat-turn-runtime' }), '0 Q&A',
  'measured zero with provenance is displayed');
assert.equal(format({
  userTurnCount: 2,
  userTurnCountSource: 'open-chat-turn-runtime',
  answerCount: 99,
  answers: 88,
}), '2 Q&A', 'captured user-turn count wins independently of assistant/legacy answer fields');
assert.equal(format({ answerCount: 9, answers: 7 }), 'Open once to load details',
  'answerCount and legacy answers cannot influence Q&A rendering');

for (const value of [
  format({ ...trustedDate, ...trustedCount }),
  format(trustedDate),
  format(trustedCount),
  format({}),
]) {
  assert.equal(value.includes('—'), false, 'no em dash placeholder is produced');
  assert.equal(/^\s*·|·\s*$/.test(value), false, 'no dangling separator is produced');
}

assert.equal(isProjectPagePath('/g/project-1/project'), true, 'canonical Project route is accepted');
assert.equal(isProjectPagePath('/g/project-1/project/'), true, 'trailing-slash Project route is accepted');
assert.equal(isProjectPagePath('/c/chat-1'), false, 'conversation route is excluded');
assert.equal(isProjectPagePath('/library'), false, 'internal Library route is excluded');
assert.equal(isProjectPagePath('/g/project-1/c/chat-1'), false, 'open Project conversation is not the Project card list');
assert.equal(projectCardChatId({ getAttribute: () => '/g/project-1/c/chat-2' }), 'chat-2',
  'Project chat identity comes from the exact conversation href');

const renderBody = extractFunction('renderMetaInProjectList');
const formatBody = extractFunction('formatProjectCardRegistryMetadata');
const subscriptionBody = extractFunction('bindRegistrySubscription');
const registryRefreshBody = extractFunction('scheduleRegistryRefresh');
const tracker = createPendingProjectMetaTracker(3);

assert.deepEqual([...tracker.retain(['chat-a', 'chat-a'])], ['chat-a'],
  'duplicate off-route changes retain one exact pending chat identity');
assert.equal(tracker.has('chat-a'), true, 'off-route Registry change remains pending');
assert.deepEqual([...tracker.consume([])], [], 'a route callback with no mounted card consumes nothing');
assert.equal(tracker.has('chat-a'), true, 'card absence cannot lose the pending identity');
assert.deepEqual([...tracker.consume(new Set(['chat-b']))], [],
  'an unrelated visible card cannot consume another chat identity');
assert.equal(tracker.has('chat-a'), true, 'Project A/B navigation cannot cross-bind pending metadata');
assert.deepEqual([...tracker.consume(new Set(['chat-a']))], ['chat-a'],
  'the matching mounted card consumes its exact pending identity');
assert.equal(tracker.has('chat-a'), false, 'successful exact-card render clears pending state');
tracker.retain(['chat-a', 'chat-b', 'chat-c', 'chat-d']);
assert.deepEqual([...tracker.snapshot()], ['chat-b', 'chat-c', 'chat-d'],
  'pending state is bounded and evicts the oldest exact identity');

assert.match(renderBody, /window\.H2O\?\.ChatRegistry\?\.getRecord\?\.\(chatId\)/,
  'Project-card second-line source is the public Chat Registry read API');
assert.match(renderBody, /formatProjectCardRegistryMetadata\(registryRecord\)/,
  'the second-line formatter receives only the Registry record');
assert.doesNotMatch(formatBody, /(?:localStorage|I\.store|answerCount|answers|metadataSource|metadataCapturedAt)/,
  'second-line truth has no raw storage, interface-store, answer, or generic metadata fallback');
assert.match(formatBody, /createdAtSource/, 'date trust requires its dedicated provenance');
assert.match(formatBody, /userTurnCountSource/, 'count trust requires its dedicated provenance');
assert.match(formatBody, /Created: /, 'exact Created: prefix is owned by the formatter');
assert.match(formatBody, /Q&A/, 'exact Q&A suffix is owned by the formatter');

assert.match(renderBody, /if \(!isProjectPagePath\(\)\)/,
  'renderer fails closed outside a native Project page');
assert.match(source, /I\.utils\?\.isInsideH2OInternalSurface\?\.\(link\)/,
  'internal H2O chat-link surfaces remain excluded');
assert.match(renderBody, /querySelectorAll\(':scope > \.ho-meta-row'\)[\s\S]*metas\.slice\(1\)\.forEach/,
  'duplicate metadata rows are removed deterministically');
assert.match(renderBody, /ho-meta-action ho-review/, 'Chat Info control remains present');
assert.match(renderBody, /ho-meta-action ho-fix/, 'Pin control remains present');
assert.match(renderBody, /I\.store\.setPinned\(chatId, nowPinned\)/,
  'Pin behavior remains wired to its established store');

assert.match(subscriptionBody, /registry\.subscribe\(scheduleRegistryRefresh\)/,
  'one canonical Registry subscription drives visible refresh');
assert.match(subscriptionBody, /unsubscribeRegistry\?\.\(\)/,
  'replacement Registry owners are unsubscribed before rebinding');
assert.match(registryRefreshBody, /_pendingProjectMetaTracker\.retain\(changedChatIds\)[\s\S]*if \(!isProjectPagePath\(\)\) return;/,
  'off-route Registry changes retain exact chat IDs before returning');
assert.match(registryRefreshBody, /if \(registryRefreshRAF\) return;/,
  'Registry refresh is coalesced');
assert.match(registryRefreshBody, /_pendingProjectMetaTracker\.snapshot\(\)[\s\S]*renderMetaInProjectList\(renderAll \? null : new Set\(pendingChatIds\)\)/,
  'same-route changes read in-memory truth through the existing exact-chat renderer');
assert.match(renderBody, /if \(exactChatIds && !exactChatIds\.has\(chatId\)\) return;/,
  'targeted refresh cannot update an unrelated visible Project card');
assert.match(renderBody, /_pendingProjectMetaTracker\.consume\(renderedChatIds\)/,
  'pending IDs clear only after their matching cards render successfully');
assert.doesNotMatch(registryRefreshBody, /(?:localStorage|sessionStorage|window\.storage|addEventListener\(['"]storage)/,
  'same-tab refresh has no storage-flush or cross-tab dependency');
assert.equal((source.match(/registry\.subscribe\(scheduleRegistryRefresh\)/g) || []).length, 1,
  'exactly one Registry subscription site exists');
assert.equal((source.match(/new MutationObserver\(/g) || []).length, 1,
  'Project-return handling reuses the existing observer');
assert.equal((source.match(/setInterval\(/g) || []).length, 1,
  'no polling was added beyond the established Project-card self-heal');

assert.doesNotMatch(source, /(?:fetch\s*\(|backend-api\/conversation)/,
  'no conversation background fetch was added');
assert.doesNotMatch(source, /LibraryStore/,
  'no Library Store migration was added');

// ── Cross-document Registry invalidation ─────────────────────────────────
// The Registry is page-origin localStorage, so a capture performed in another
// tab reaches an already-open Project list only through the storage event.
// Without this bridge a Project tab kept beside a chat tab showed "open once
// to load details" for a chat that had in fact been captured.
const storageBody = extractFunction('onRegistryStorageEvent');
const storageKeyBody = extractFunction('registryStorageKey');

/* The key this bridge filters on must be the Registry's own store. Its first
   version used 'ho:chat-meta-v1' — 9A1a's interface store — which no Registry
   write ever touches, so the listener could never fire for the change it
   exists to observe. */
assert.match(source, /const REGISTRY_STORAGE_KEY_FALLBACK = 'h2o:library:chat-registry:v1';/,
  'the cross-tab fallback constant is the canonical Chat Registry store key');
assert.doesNotMatch(source, /REGISTRY_STORAGE_KEY\s*=\s*'ho:chat-meta-v1'/,
  "9A1a's interface store is no longer treated as the Registry change key");
assert.match(storageKeyBody, /window\.H2O\?\.ChatRegistry\?\.storageKey/,
  'the public Registry storageKey is preferred over any local constant');
assert.match(storageKeyBody, /REGISTRY_STORAGE_KEY_FALLBACK/,
  'a pre-Registry-boot storage event still has a canonical key to compare');
assert.match(storageBody, /event\.key !== registryStorageKey\(\)\) return;/,
  'irrelevant storage keys are rejected before any other work');
assert.match(storageBody, /event\.newValue === event\.oldValue\) return;/,
  'a write that did not change the store does no work');
assert.match(storageBody, /!isProjectPagePath\(\)\) return;/,
  'non-Project documents do no work');
assert.match(storageBody, /scheduleRegistryRefresh\(\{ chatIds: \[\] \}\)/,
  'the bridge reuses the existing coalesced refresh path');
assert.doesNotMatch(storageBody, /JSON\.parse|localStorage\.getItem/,
  'the bridge does not parse the whole store on every storage event');

// Ordering matters for the Project page's performance budget: the key check
// must come before the route check, so unrelated writes cost one comparison.
assert.ok(storageBody.indexOf('event.key !== registryStorageKey()')
  < storageBody.indexOf('isProjectPagePath'),
  'key filtering precedes the route check');

assert.equal((source.match(/addEventListener\('storage'/g) || []).length, 1,
  'exactly one storage listener is registered');
assert.match(source, /if \(!registryStorageBridgeBound\) \{\s*registryStorageBridgeBound = true;/,
  'the storage listener is bound exactly once');

// Behavioural proof: run the real extracted function against stubs, so these
// are not merely source-shape assertions.
const CANONICAL_REGISTRY_KEY = 'h2o:library:chat-registry:v1';
const RETIRED_META_KEY = 'ho:chat-meta-v1';
{
  const calls = [];
  let onProject = true;
  let registry = { storageKey: CANONICAL_REGISTRY_KEY };
  const box = {
    REGISTRY_STORAGE_KEY_FALLBACK: CANONICAL_REGISTRY_KEY,
    isProjectPagePath: () => onProject,
    scheduleRegistryRefresh: (d) => calls.push(d),
    String,
  };
  box.window = { get H2O() { return registry ? { ChatRegistry: registry } : undefined; } };
  box.globalThis = box;
  vm.createContext(box);
  vm.runInContext(
    `${storageKeyBody}\n${storageBody}\nglobalThis.__fire = onRegistryStorageEvent;`, box);
  const fire = box.__fire;

  fire({ key: CANONICAL_REGISTRY_KEY, oldValue: 'a', newValue: 'b' });
  assert.equal(calls.length, 1, 'a real Registry change refreshes the Project list');
  // Compared field-wise rather than with deepEqual: the payload is built
  // inside the vm realm, so a strict deep comparison would fail on prototype
  // identity rather than on the value we actually care about.
  assert.ok(Array.isArray(calls[0]?.chatIds) && calls[0].chatIds.length === 0,
    'the refresh uses the full-list path');

  fire({ key: RETIRED_META_KEY, oldValue: 'a', newValue: 'b' });
  assert.equal(calls.length, 1,
    "9A1a's interface store is no longer the cross-tab Registry authority");

  fire({ key: 'some:other:key', oldValue: 'a', newValue: 'b' });
  fire({ key: 'h2o:prm:cgx:theme:state:v1', oldValue: 'x', newValue: 'y' });
  assert.equal(calls.length, 1, 'unrelated storage keys trigger no refresh');

  fire({ key: CANONICAL_REGISTRY_KEY, oldValue: 'same', newValue: 'same' });
  assert.equal(calls.length, 1, 'a no-op write triggers no refresh');

  fire(null);
  fire(undefined);
  assert.equal(calls.length, 1, 'a malformed event is ignored');

  onProject = false;
  fire({ key: CANONICAL_REGISTRY_KEY, oldValue: 'a', newValue: 'c' });
  assert.equal(calls.length, 1, 'an off-Project document does no work');

  onProject = true;
  fire({ key: CANONICAL_REGISTRY_KEY, oldValue: 'c', newValue: 'd' });
  fire({ key: CANONICAL_REGISTRY_KEY, oldValue: 'd', newValue: 'e' });
  assert.equal(calls.length, 3,
    'each real change delegates; burst coalescing is scheduleRegistryRefresh’s rAF, proven above');

  /* A storage event can arrive before 0F1g installs the Registry, and it can
     arrive after a Registry that renamed its store. Both must resolve to the
     store actually being written, which is why the key is read per event
     instead of being captured once at bind time. */
  registry = null;
  fire({ key: CANONICAL_REGISTRY_KEY, oldValue: 'e', newValue: 'f' });
  assert.equal(calls.length, 4, 'a pre-Registry-boot event still uses the canonical key');

  registry = { storageKey: 'h2o:library:chat-registry:v2' };
  fire({ key: 'h2o:library:chat-registry:v2', oldValue: 'g', newValue: 'h' });
  assert.equal(calls.length, 5, 'the installed Registry key is what is honoured');
  fire({ key: CANONICAL_REGISTRY_KEY, oldValue: 'h', newValue: 'i' });
  assert.equal(calls.length, 5,
    'the fallback constant does not override an installed Registry key');
}

// ── Bounded resync scheduling ────────────────────────────────────────────
// Live-proven 2026-08-15 on the Project route: a single harmless churn reached
// schedule() seven times, which created seven 120 ms timers, cancelled six of
// them before they could fire, fired none, and never reached resync. The card
// under test held a Registry record worth "Created: 28 Jul 2026 · 57 Q&A" and
// stayed on the pre-hydration fallback indefinitely. The mute gate and the
// internal-mutation lock were both measured innocent (0 hits), so the defect
// was the trailing-edge debounce resetting faster than it could elapse.
const scheduleBody = extractFunction('schedule');
const muteBody = extractFunction('hoMetaMute');
const FRAME_MS = 16;
// Pinned so a "just retry next frame" loop cannot be added to work around a
// scheduling bug instead of fixing it.
const RAF_SITE_COUNT = 7;
const declaredCoalesceMs = (source.match(/const META_RESYNC_COALESCE_MS = (\d+);/) || [])[1];
const COALESCE_MS = Number(declaredCoalesceMs ?? 120);

const TRUSTED_LIVE_RECORD = Object.freeze({
  createdAt: '2026-07-28T19:22:19.704Z',
  createdAtSource: 'open-chat-message',
  userTurnCount: 57,
  userTurnCountSource: 'open-chat-turn-runtime',
  metadataSource: 'open-chat',
});
const FALLBACK_ROW_TEXT = 'Open once to load details';
const liveDate = new Date(TRUSTED_LIVE_RECORD.createdAt);
const EXPECTED_LIVE_ROW = `Created: ${String(liveDate.getDate()).padStart(2, '0')} `
  + `${liveDate.toLocaleString(undefined, { month: 'short' })} ${liveDate.getFullYear()} · 57 Q&A`;

/* Drives the REAL extracted schedule() and hoMetaMute() on a virtual clock, so
   what is measured is the shipped control flow rather than a restatement of
   it. renderMetaInProjectList's Registry-to-text mapping is proven by the
   matrix at the top of this file; here the row write stands in for it, using
   the real formatter, so the scheduling contract is what is under test. */
function createSchedulerHarness({ record = TRUSTED_LIVE_RECORD } = {}) {
  const stats = {
    scheduleCalls: 0,
    timersCreated: 0,
    timersCleared: 0,
    timersFired: 0,
    maxLiveTimers: 0,
    resyncs: 0,
    firstResyncAt: null,
    rowWrites: 0,
  };
  const timers = new Map();
  const frames = new Map();
  const row = { text: FALLBACK_ROW_TEXT };
  let now = 0;
  let nextId = 1;
  let lockedFlag = false;

  class ClockDate extends Date {}
  ClockDate.now = () => now;

  const box = {
    Date: ClockDate,
    Math,
    Number,
    String,
    Boolean,
    Array,
    __stats: stats,
    __row: row,
    __record: record,
    setTimeout(fn, delay) {
      const id = nextId += 1;
      timers.set(id, { at: now + Number(delay || 0), fn });
      stats.timersCreated += 1;
      if (timers.size > stats.maxLiveTimers) stats.maxLiveTimers = timers.size;
      return id;
    },
    clearTimeout(id) {
      if (id && timers.delete(id)) stats.timersCleared += 1;
    },
    requestAnimationFrame(fn) {
      const id = nextId += 1;
      frames.set(id, { at: now + FRAME_MS, fn });
      return id;
    },
    requestOpenChatMetaSync() {},
    bindObserver() {},
    bindRegistrySubscription() {},
    I: {
      nav: { currentChatId: () => null },
      lock: {
        locked: () => lockedFlag,
        with(fn) {
          lockedFlag = true;
          try { return fn(); } finally { lockedFlag = false; }
        },
      },
    },
  };
  box.globalThis = box;
  vm.createContext(box);
  vm.runInContext([
    'var HO_META_SKIP_UNTIL = 0;',
    'var debounceTO = 0;',
    'var rafPending = false;',
    // Bound from the source's own declaration when it has one, so the fixture
    // measures the window the product actually ships.
    `var META_RESYNC_COALESCE_MS = ${COALESCE_MS};`,
    extractFunction('formatDate'),
    extractFunction('formatProjectCardRegistryMetadata'),
    muteBody,
    `var resync = () => {
       hoMetaMute(260);
       __stats.resyncs += 1;
       if (__stats.firstResyncAt === null) __stats.firstResyncAt = Date.now();
       const next = formatProjectCardRegistryMetadata(__record);
       if (__row.text !== next) { __row.text = next; __stats.rowWrites += 1; }
     };`,
    scheduleBody,
    'globalThis.__schedule = schedule;',
  ].join('\n'), box, { filename: ownerPath });

  function advanceTo(target) {
    for (;;) {
      let nextAt = Infinity;
      let kind = null;
      let id = null;
      for (const [timerId, timer] of timers) {
        if (timer.at < nextAt) { nextAt = timer.at; kind = 'timer'; id = timerId; }
      }
      for (const [frameId, frame] of frames) {
        if (frame.at < nextAt) { nextAt = frame.at; kind = 'frame'; id = frameId; }
      }
      if (!kind || nextAt > target) break;
      now = nextAt;
      if (kind === 'timer') {
        const timer = timers.get(id);
        timers.delete(id);
        stats.timersFired += 1;
        timer.fn();
      } else {
        const frame = frames.get(id);
        frames.delete(id);
        frame.fn();
      }
    }
    now = target;
  }

  function call() {
    box.__schedule();
    stats.scheduleCalls += 1;
  }

  return {
    stats,
    schedule: call,
    advanceTo,
    advanceBy: (ms) => advanceTo(now + ms),
    now: () => now,
    row: () => row.text,
    liveTimers: () => timers.size,
    liveFrames: () => frames.size,
    setLocked: (value) => { lockedFlag = !!value; },
    setMuteUntil: (value) => vm.runInContext(`HO_META_SKIP_UNTIL = ${Number(value)};`, box),
    churn({ everyMs, untilMs }) {
      call();
      while (now < untilMs) {
        advanceTo(Math.min(now + everyMs, untilMs));
        call();
      }
    },
  };
}

const starvation = createSchedulerHarness();
starvation.churn({ everyMs: 50, untilMs: 3000 });
/* Sampled while the churn is still running. Draining afterwards would let the
   last armed timer finally elapse and report a render the user never saw: the
   live defect is that the card stays stale for as long as the Project page
   keeps mutating, which on a real page is indefinitely. */
const duringChurn = { ...starvation.stats, row: starvation.row() };
starvation.advanceTo(4000);
{
  const s = starvation.stats;
  assert.ok(duringChurn.scheduleCalls >= 60,
    'the fixture must really drive schedule() faster than the coalescing window');
  assert.ok(duringChurn.resyncs > 0,
    `DEBOUNCE_STARVATION_REPRODUCED: ${duringChurn.scheduleCalls} schedule() calls spaced `
    + `under ${COALESCE_MS} ms created ${duringChurn.timersCreated} timers, `
    + `${duringChurn.timersCleared} of which were cancelled before firing; `
    + `${duringChurn.timersFired} fired and resync ran ${duringChurn.resyncs} times, `
    + `leaving the card on "${duringChurn.row}". A pending metadata pass must survive `
    + 'continuous Project churn.');
  assert.equal(duringChurn.row, EXPECTED_LIVE_ROW,
    'the card reaches truth while the page is still mutating, not only once it settles');
  assert.equal(duringChurn.timersCleared, 0,
    'a pending pass is never cancelled by a later request');
  assert.equal(duringChurn.maxLiveTimers, 1,
    'later requests coalesce into the pending pass instead of queueing their own');
  assert.ok(duringChurn.firstResyncAt >= COALESCE_MS,
    'the coalescing window is still honoured, so a burst costs one pass');
  assert.ok(duringChurn.firstResyncAt <= COALESCE_MS + 2 * FRAME_MS,
    `bounded maximum wait: the first pass ran at ${duringChurn.firstResyncAt} ms, beyond `
    + `${COALESCE_MS} ms plus one animation frame`);
  assert.equal(s.rowWrites, 1,
    'an already-correct row is not rewritten by subsequent passes');
  assert.ok(duringChurn.resyncs * 4 < duringChurn.scheduleCalls,
    `many mutations must stay coalesced: ${duringChurn.scheduleCalls} requests produced `
    + `${duringChurn.resyncs} passes`);
  assert.equal(starvation.liveTimers(), 0, 'no timer survives once the page settles');
  assert.equal(starvation.liveFrames(), 0, 'no animation frame is left permanently scheduled');
}

{
  // A pass that has fired must not block the next one.
  const h = createSchedulerHarness();
  h.schedule();
  h.advanceTo(500);
  assert.equal(h.stats.resyncs, 1, 'a single request produces exactly one pass');
  h.schedule();
  h.advanceTo(1000);
  assert.equal(h.stats.resyncs, 2,
    'a later independent mutation schedules another bounded pass');
  assert.equal(h.stats.timersCleared, 0, 'neither pass cancelled the other');
}

{
  // The two gates measured innocent on the live runtime must keep working.
  const muted = createSchedulerHarness();
  muted.setMuteUntil(5000);
  muted.churn({ everyMs: 50, untilMs: 1000 });
  assert.equal(muted.stats.timersCreated, 0,
    'an active mute suppresses scheduling entirely');
  assert.equal(muted.stats.resyncs, 0, 'an active mute renders nothing');

  const locked = createSchedulerHarness();
  locked.setLocked(true);
  locked.churn({ everyMs: 50, untilMs: 1000 });
  assert.equal(locked.stats.timersCreated, 0,
    'an internal-mutation lock suppresses scheduling while it is held');
  locked.setLocked(false);
  locked.schedule();
  locked.advanceBy(500);
  assert.equal(locked.stats.resyncs, 1, 'scheduling resumes once the lock clears');
}

{
  // The guaranteed pass must not become a way to promote untrusted data.
  const legacy = createSchedulerHarness({ record: { answers: 4 } });
  legacy.churn({ everyMs: 40, untilMs: 1000 });
  legacy.advanceTo(1500);
  assert.ok(legacy.stats.resyncs > 0, 'the legacy fixture really rendered');
  assert.equal(legacy.row(), FALLBACK_ROW_TEXT,
    'an answers-only legacy record stays on the fallback after a guaranteed pass');
  assert.equal(legacy.stats.rowWrites, 0, 'an unchanged fallback row is not rewritten');
}

assert.match(source, /const META_RESYNC_COALESCE_MS = 120;/,
  'the bounded coalescing window is an explicit pinned constant');
assert.match(scheduleBody, /if \(debounceTO\) return;/,
  'a pending pass is never replaced by a later request');
assert.match(scheduleBody, /debounceTO = setTimeout\(\(\) => \{\s*debounceTO = 0;/,
  'the pending marker clears when the pass runs so later churn can schedule again');
assert.doesNotMatch(scheduleBody, /clearTimeout\(/,
  'the unbounded trailing-edge debounce cannot be reintroduced');
assert.match(scheduleBody, /\}, META_RESYNC_COALESCE_MS\);/,
  'the pass uses the pinned window rather than an inline literal');
assert.match(scheduleBody,
  /if \(Date\.now\(\) < HO_META_SKIP_UNTIL\) return;[\s\S]*if \(I\.lock\.locked\(\)\) return;/,
  'both live-measured-innocent gates are preserved ahead of scheduling');
assert.equal((source.match(/setInterval\(/g) || []).length, 1,
  'the fix added no polling beyond the established Project-card self-heal');
assert.equal((source.match(/requestAnimationFrame\(/g) || []).length, RAF_SITE_COUNT,
  'no additional animation-frame scheduling site was introduced');

// ── One-way truthful provenance backfill ─────────────────────────────────
// Audited 2026-08-15: the Registry round-trips provenance correctly, but every
// record persisted before Phase 1 carries the value without the proof. The
// evidence survives in 9A1a's interface store, so it is promoted one way — and
// only onto the value it actually evidences.
const backfillInputBody = extractFunction('buildProvenanceBackfillInput');
const backfillRunBody = extractFunction('backfillRegistryProvenanceOnce');
const isoHelperBody = extractFunction('_toIsoOrEmpty');

const DATE_ISO = '2026-07-28T19:22:19.704Z';
const DATE_MS = Date.parse(DATE_ISO);
const CAPTURED_MS = 1786817545690;
const DATE_PROOF = 'open-chat-message';
const COUNT_PROOF = 'open-chat-turn-runtime';

/* Runs the REAL extracted backfill against a recording Registry, so what is
   asserted is the decision the shipped code makes, not a restatement of it. */
function runBackfill(interfaceStore, registryRecords, { registryApi } = {}) {
  const upserts = [];
  const box = {
    Date, Math, Number, String, Boolean, Array, Object, JSON,
    PROVENANCE_BACKFILL_SOURCE: 'chat-meta-provenance-backfill',
    I: { store: { getAllMeta: () => interfaceStore } },
  };
  const registry = registryApi || {
    getRecord: (id) => registryRecords[id] || null,
    upsertRecord: (input, options) => { upserts.push({ input, options, via: 'one' }); },
    upsertMany: (inputs, options) => { inputs.forEach((input) => upserts.push({ input, options, via: 'many' })); },
  };
  box.window = { H2O: { ChatRegistry: registry } };
  box.globalThis = box;
  vm.createContext(box);
  vm.runInContext([
    `var _provenanceBackfillDiag = { ran:false, scannedInterfaceRecords:0, candidates:0, upserts:0,
       skippedNoProvenance:0, skippedNoRegistryRecord:0, skippedAlreadyTrusted:0,
       skippedValueMismatch:0, lastRunAt:0, lastError:null };`,
    isoHelperBody,
    backfillInputBody,
    backfillRunBody,
    'globalThis.__run = backfillRegistryProvenanceOnce;',
    'globalThis.__diag = () => _provenanceBackfillDiag;',
  ].join('\n'), box, { filename: ownerPath });
  const diag = box.__run();
  return { upserts, diag, rerun: () => box.__run(), diagOf: () => box.__diag() };
}

const registryShell = (over) => ({
  chatId: 'c1', href: '/c/c1', createdAt: '', createdAtSource: '',
  userTurnCount: 0, userTurnCountSource: '', metadataCapturedAt: '', metadataSource: '',
  ...over,
});

// A — matching date AND matching count: both proofs are restored.
{
  const { upserts, diag } = runBackfill(
    { c1: { createdAt: DATE_MS, createdAtSource: DATE_PROOF, userTurnCount: 57,
            userTurnCountSource: COUNT_PROOF, metadataCapturedAt: CAPTURED_MS, metadataSource: 'open-chat' } },
    { c1: registryShell({ createdAt: DATE_ISO, userTurnCount: 57 }) },
  );
  assert.equal(upserts.length, 1, 'a repairable record is upserted exactly once');
  const { input, options } = upserts[0];
  assert.equal(input.createdAtSource, DATE_PROOF, 'a matching date recovers its proof');
  assert.equal(input.createdAt, DATE_ISO, 'the proof travels with the exact value it evidences');
  assert.equal(input.userTurnCountSource, COUNT_PROOF, 'a matching count recovers its proof');
  assert.equal(input.userTurnCount, 57, 'the restored count is the evidenced count');
  assert.equal(input.metadataSource, 'open-chat', 'capture provenance rides along with a real repair');
  assert.equal(input.metadataCapturedAt, new Date(CAPTURED_MS).toISOString(),
    'epoch-millisecond capture stamps normalize through the established helper');
  assert.equal(options.source, 'chat-meta-provenance-backfill',
    'repairs are attributable to the backfill, never to a capture that did not happen');
  assert.equal(diag.upserts, 1);
  assert.equal(format({
    createdAt: input.createdAt, createdAtSource: input.createdAtSource,
    userTurnCount: input.userTurnCount, userTurnCountSource: input.userTurnCountSource,
  }), `Created: ${new Date(DATE_ISO).getDate()} `
    + `${new Date(DATE_ISO).toLocaleString(undefined, { month: 'short' })} `
    + `${new Date(DATE_ISO).getFullYear()} · 57 Q&A`,
    'the repaired record renders the trusted Project-card line');
}

// B — matching date, diverged count: the date is repaired, the count is not.
{
  const { upserts } = runBackfill(
    { c1: { createdAt: DATE_MS, createdAtSource: DATE_PROOF, userTurnCount: 3, userTurnCountSource: COUNT_PROOF } },
    { c1: registryShell({ createdAt: DATE_ISO, userTurnCount: 9 }) },
  );
  assert.equal(upserts.length, 1, 'a partially repairable record is still repaired');
  const input = upserts[0].input;
  assert.equal(input.createdAtSource, DATE_PROOF, 'date and count are decided independently');
  assert.equal('userTurnCountSource' in input, false,
    'a count this evidence never counted cannot be certified');
  assert.equal('userTurnCount' in input, false,
    'repair never rewrites the Registry count to make its own proof fit');
  assert.equal(format({ createdAt: DATE_ISO, createdAtSource: DATE_PROOF, userTurnCount: 9, userTurnCountSource: '' }),
    'Created: 28 Jul 2026', 'the card shows the trusted date alone, never 9 Q&A as trusted');
}

// C — diverged date: the proof stays with neither value.
{
  const { upserts, diag } = runBackfill(
    { c1: { createdAt: DATE_MS, createdAtSource: DATE_PROOF } },
    { c1: registryShell({ createdAt: '2020-01-01T00:00:00.000Z' }) },
  );
  assert.equal(upserts.length, 0, 'a date this evidence never observed keeps its unverified status');
  assert.equal(diag.skippedValueMismatch, 1, 'the mismatch is counted, not silently dropped');
}

// D — no provenance in the interface record: nothing to promote.
{
  const { upserts, diag } = runBackfill(
    { c1: { createdAt: DATE_MS, userTurnCount: 57, answers: 4 } },
    { c1: registryShell({ createdAt: DATE_ISO, userTurnCount: 57 }) },
  );
  assert.equal(upserts.length, 0, 'values alone never become trusted');
  assert.equal(diag.skippedNoProvenance, 1, 'a legacy interface record is skipped by proof, not by value');
}

// E — already repaired: no write at all, and a second pass is a no-op.
{
  const store = { c1: { createdAt: DATE_MS, createdAtSource: DATE_PROOF, userTurnCount: 57, userTurnCountSource: COUNT_PROOF } };
  const { upserts, diag, rerun, diagOf } = runBackfill(store, {
    c1: registryShell({ createdAt: DATE_ISO, createdAtSource: DATE_PROOF, userTurnCount: 57, userTurnCountSource: COUNT_PROOF }),
  });
  assert.equal(upserts.length, 0, 'an already-trusted record costs no write');
  assert.equal(diag.skippedAlreadyTrusted, 1, 'already-trusted records are recognised as such');
  rerun();
  assert.equal(upserts.length, 0, 'the pass is one-shot; a second call writes nothing');
  assert.equal(diagOf().scannedInterfaceRecords, 1, 'the store is not rescanned on the second call');
}

// F — Registry holds no value: deliberately left alone (documented rule).
{
  const { upserts, diag } = runBackfill(
    { c1: { createdAt: DATE_MS, createdAtSource: DATE_PROOF, userTurnCount: 57, userTurnCountSource: COUNT_PROOF } },
    { c1: registryShell({}) },
  );
  assert.equal(upserts.length, 0,
    'repair restores proofs for values the Registry already holds; supplying a value is capture’s job');
  assert.equal(diag.skippedValueMismatch, 1, 'the empty-Registry case is accounted for');
}

// No Registry record at all — repair never invents one.
{
  const { upserts, diag } = runBackfill(
    { ghost: { createdAt: DATE_MS, createdAtSource: DATE_PROOF } }, {},
  );
  assert.equal(upserts.length, 0, 'a chat the Registry does not know is not created by repair');
  assert.equal(diag.skippedNoRegistryRecord, 1);
}

// Batching: many repairable records cost one batched call.
{
  const iface = {}; const recs = {};
  for (let i = 0; i < 12; i += 1) {
    iface[`c${i}`] = { createdAt: DATE_MS, createdAtSource: DATE_PROOF, userTurnCount: i, userTurnCountSource: COUNT_PROOF };
    recs[`c${i}`] = registryShell({ chatId: `c${i}`, href: `/c/c${i}`, createdAt: DATE_ISO, userTurnCount: i });
  }
  const calls = [];
  const { upserts } = runBackfill(iface, recs, {
    registryApi: {
      getRecord: (id) => recs[id] || null,
      upsertRecord: () => { calls.push('one'); },
      upsertMany: (inputs) => { calls.push('many'); inputs.forEach(() => {}); },
    },
  });
  assert.deepEqual(calls, ['many'], '12 repairs cost one batched Registry call, not 12');
  assert.equal(upserts.length, 0, 'the batched path is the one taken when it exists');
}

assert.match(backfillRunBody, /if \(_provenanceBackfillDiag\.ran\) return _provenanceBackfillDiag;/,
  'the pass is guarded as one-shot');
assert.match(source, /registry\.ready\?\.then\?\.\(\(\) => \{[\s\S]*backfillRegistryProvenanceOnce\(\)/,
  'the backfill is triggered from the Registry readiness authority');
assert.doesNotMatch(renderBody, /backfillRegistryProvenanceOnce/,
  'repair never runs inside Project-card rendering');
assert.equal((source.match(/setInterval\(/g) || []).length, 1,
  'the backfill added no polling');
assert.equal((source.match(/new MutationObserver\(/g) || []).length, 1,
  'the backfill added no observer');

// G — real Registry: repair, persist, rehydrate in a fresh realm.
{
  const coreSrc = fs.readFileSync(path.join(repoRoot, 'src-runtime-base/0F0c.⬛️🧬 Library Registry Core 🧬.js'), 'utf8');
  const regSrc = fs.readFileSync(path.join(repoRoot, 'src-runtime-base/0F1g.⬛️🗂️ Chat Registry 🧾🗂️.js'), 'utf8');
  const STORAGE_KEY = 'h2o:library:chat-registry:v1';

  function realRegistryRealm(seed) {
    const disk = new Map();
    if (seed) disk.set(STORAGE_KEY, seed);
    const queue = [];
    const box = {
      console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
      JSON, Date, Math, Number, String, Boolean, Array, Object, Set, Map, RegExp, Error, Promise, Symbol,
      isNaN, isFinite, parseInt, parseFloat,
      localStorage: {
        getItem: (k) => (disk.has(k) ? disk.get(k) : null),
        setItem: (k, v) => { disk.set(k, String(v)); },
        removeItem: (k) => { disk.delete(k); },
        key: (i) => [...disk.keys()][i] ?? null,
        get length() { return disk.size; },
      },
      performance: { now: () => Date.now() },
      setTimeout: (fn) => { queue.push(fn); return queue.length; },
      clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
      requestAnimationFrame: (fn) => { queue.push(fn); return queue.length; },
      cancelAnimationFrame: () => {},
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
      CustomEvent: class { constructor(t, o) { this.type = t; Object.assign(this, o); } },
      location: { pathname: '/', href: 'https://chatgpt.com/', origin: 'https://chatgpt.com' },
      document: {
        documentElement: { classList: { add() {}, remove() {}, contains: () => false } },
        addEventListener() {}, removeEventListener() {},
        querySelector: () => null, querySelectorAll: () => [], readyState: 'complete', body: null,
      },
      navigator: { userAgent: 'node' },
      MutationObserver: class { observe() {} disconnect() {} },
    };
    box.window = box; box.globalThis = box; box.self = box;
    vm.createContext(box);
    vm.runInContext('window.H2O = window.H2O || {}; window.H2O.LibraryCore = { registerOwner(){}, registerService(){} };', box);
    vm.runInContext(coreSrc, box, { filename: '0F0c' });
    vm.runInContext(regSrc, box, { filename: '0F1g' });
    const drain = () => { for (let i = 0; i < 30 && queue.length; i += 1) { queue.splice(0, queue.length).forEach((fn) => { try { fn(); } catch {} }); } };
    drain();
    return { box, disk, drain };
  }

  // Seed the exact live shape: value present, proof absent (pre-Phase-1 record).
  const seed = JSON.stringify({
    schemaVersion: 1,
    recordsById: {
      'live-chat': { chatId: 'live-chat', href: '/c/live-chat', createdAt: DATE_ISO, userTurnCount: 57 },
    },
    idByHref: {}, tombstonesById: {}, meta: { recordCount: 1 },
  });

  const A = realRegistryRealm(seed);
  const reg = A.box.H2O.ChatRegistry;
  const before = reg.getRecord('live-chat');
  assert.equal(String(before.createdAtSource || ''), '', 'the seeded record starts unverified');
  assert.equal(format(before), 'Open once to load details',
    'a pre-Phase-1 record correctly renders the fallback before repair');

  const { upserts } = runBackfill(
    { 'live-chat': { createdAt: DATE_MS, createdAtSource: DATE_PROOF, userTurnCount: 57,
                     userTurnCountSource: COUNT_PROOF, metadataCapturedAt: CAPTURED_MS, metadataSource: 'open-chat' } },
    { 'live-chat': before },
  );
  assert.equal(upserts.length, 1, 'the live-shaped record is a repair candidate');
  reg.upsertMany([upserts[0].input], upserts[0].options);
  A.drain();

  const repaired = reg.getRecord('live-chat');
  assert.equal(repaired.createdAtSource, DATE_PROOF, 'the real Registry accepts the restored date proof');
  assert.equal(repaired.userTurnCountSource, COUNT_PROOF, 'the real Registry accepts the restored count proof');
  assert.equal(repaired.userTurnCount, 57, 'the evidenced count is unchanged by repair');
  assert.equal(format(repaired), 'Created: 28 Jul 2026 · 57 Q&A',
    'the repaired Registry record renders the exact trusted Project-card line');

  const persisted = A.disk.get(STORAGE_KEY);
  assert.ok(persisted, 'the repair reaches the durable store');
  const persistedRec = JSON.parse(persisted).recordsById['live-chat'];
  assert.equal(persistedRec.createdAtSource, DATE_PROOF, 'the restored date proof is persisted');
  assert.equal(persistedRec.userTurnCountSource, COUNT_PROOF, 'the restored count proof is persisted');

  const B = realRegistryRealm(persisted);
  const reloaded = B.box.H2O.ChatRegistry.getRecord('live-chat');
  assert.equal(reloaded.createdAtSource, DATE_PROOF, 'the date proof survives a fresh hydration');
  assert.equal(reloaded.userTurnCountSource, COUNT_PROOF, 'the count proof survives a fresh hydration');
  assert.equal(reloaded.metadataSource, 'open-chat', 'capture provenance survives a fresh hydration');
  assert.equal(format(reloaded), 'Created: 28 Jul 2026 · 57 Q&A',
    'the trusted line survives reload — the repair is durable, not per-session');

  // Idempotency against the repaired durable store.
  const second = runBackfill(
    { 'live-chat': { createdAt: DATE_MS, createdAtSource: DATE_PROOF, userTurnCount: 57,
                     userTurnCountSource: COUNT_PROOF, metadataCapturedAt: CAPTURED_MS, metadataSource: 'open-chat' } },
    { 'live-chat': reloaded },
  );
  assert.equal(second.upserts.length, 0, 'a repaired store produces no further writes on the next boot');
  assert.equal(second.diag.skippedAlreadyTrusted, 1, 'the repaired record is recognised as already trusted');

  // The diverged live case, end to end against the real Registry.
  const C = realRegistryRealm(JSON.stringify({
    schemaVersion: 1,
    recordsById: { 'diverged': { chatId: 'diverged', href: '/c/diverged', createdAt: DATE_ISO, userTurnCount: 9 } },
    idByHref: {}, tombstonesById: {}, meta: { recordCount: 1 },
  }));
  const divergedBefore = C.box.H2O.ChatRegistry.getRecord('diverged');
  const divergedRun = runBackfill(
    { diverged: { createdAt: DATE_MS, createdAtSource: DATE_PROOF, userTurnCount: 3, userTurnCountSource: COUNT_PROOF } },
    { diverged: divergedBefore },
  );
  C.box.H2O.ChatRegistry.upsertMany([divergedRun.upserts[0].input], divergedRun.upserts[0].options);
  C.drain();
  const divergedAfter = C.box.H2O.ChatRegistry.getRecord('diverged');
  assert.equal(divergedAfter.createdAtSource, DATE_PROOF, 'the matching date is still repaired');
  assert.equal(divergedAfter.userTurnCount, 9, 'the Registry count is not rewritten to fit foreign proof');
  assert.equal(String(divergedAfter.userTurnCountSource || ''), '',
    'the diverged count stays uncertified through the real merge');
  assert.equal(format(divergedAfter), 'Created: 28 Jul 2026',
    'a diverged count never renders as trusted Q&A');
}

// ── Late ChatRegistry binding ────────────────────────────────────────────
// Live-measured on the composite: 9A1c boots ~t+2s, Project cards paint ~t+9s,
// 0F1g publishes H2O.ChatRegistry ~t+12s. Every path into
// bindRegistrySubscription is activity-driven, so a page whose DOM settles
// before the Registry appears never binds — 25s idle showed 0 trusted rows and
// provenanceBackfillDiag.ran false, and a single inert DOM node flipped it.
const bindBody = extractFunction('bindRegistrySubscription');
const retryBody = source.includes('function scheduleRegistryBindRetry(')
  ? extractFunction('scheduleRegistryBindRetry')
  : 'function scheduleRegistryBindRetry() {}';

/* Drives the REAL bindRegistrySubscription on a virtual clock, with the DOM
   held completely still: no mutation, no navigation, no interaction. */
async function runLateBind({ publishAtMs = 10000, runUntilMs = 60000, publishAtBoot = false } = {}) {
  const events = [];
  const timers = new Map();
  let now = 0;
  let nextId = 1;
  let subscribeCalls = 0;
  let unsubscribeCalls = 0;
  // Once the subscription is live nothing further needs waking, so any timer
  // armed after that point is retry churn the bind was supposed to stop.
  let boundSeen = false;
  let timersArmedAfterBind = 0;

  const registry = {
    storageKey: 'h2o:library:chat-registry:v1',
    ready: Promise.resolve(),
    subscribe(fn) {
      subscribeCalls += 1;
      events.push('subscribe');
      return () => { unsubscribeCalls += 1; };
    },
    getRecord: () => null,
    upsertRecord: () => {},
    upsertMany: () => {},
  };

  const box = {
    Date: { now: () => now }, Math, Number, String, Boolean, Array, Object, JSON, Promise,
    setTimeout: (fn, delay) => {
      if (boundSeen) timersArmedAfterBind += 1;
      const id = nextId += 1;
      timers.set(id, { at: now + Number(delay || 0), fn });
      events.push(`timer:${Math.round(Number(delay || 0))}`);
      return id;
    },
    clearTimeout: (id) => { timers.delete(id); },
    scheduleRegistryRefresh: () => { events.push('refresh'); },
    backfillRegistryProvenanceOnce: () => { events.push('backfill'); },
  };
  box.window = { H2O: publishAtBoot ? { ChatRegistry: registry } : {} };
  box.globalThis = box;
  vm.createContext(box);
  vm.runInContext([
    'var subscribedRegistry = null;',
    'var unsubscribeRegistry = null;',
    'var registryBindAttempts = 0;',
    'var registryBindTimer = 0;',
    'var registryBindSettled = false;',
    // Bound from the source's own declaration, so the fixture measures the cap
    // the product actually ships.
    `var REGISTRY_BIND_MAX_ATTEMPTS = ${
      Number((source.match(/const REGISTRY_BIND_MAX_ATTEMPTS = (\d+);/) || [])[1] ?? 40)};`,
    retryBody,
    bindBody,
    'globalThis.__bind = bindRegistrySubscription;',
    'globalThis.__state = () => ({ bound: !!subscribedRegistry, attempts: registryBindAttempts, settled: registryBindSettled, pending: !!registryBindTimer });',
  ].join('\n'), box, { filename: ownerPath });

  // Boot: the one existing rAF-driven bind attempt, before the Registry exists.
  box.__bind();
  await Promise.resolve();
  if (box.__state().bound) boundSeen = true;

  let published = publishAtBoot;
  // Advance the clock firing only timers. No DOM mutation is ever generated.
  for (let guard = 0; guard < 5000; guard += 1) {
    if (!published && now >= publishAtMs) { box.window.H2O.ChatRegistry = registry; published = true; }
    let nextAt = Infinity; let id = null;
    for (const [tid, t] of timers) if (t.at < nextAt) { nextAt = t.at; id = tid; }
    const target = published || nextAt <= publishAtMs ? nextAt : Math.min(nextAt, publishAtMs);
    if (id === null || target > runUntilMs) {
      if (!published && publishAtMs <= runUntilMs) { now = publishAtMs; continue; }
      break;
    }
    now = target;
    const t = timers.get(id);
    timers.delete(id);
    t.fn();
    await Promise.resolve();
    await Promise.resolve();
    if (!boundSeen && box.__state().bound) boundSeen = true;
  }
  now = Math.max(now, Math.min(runUntilMs, now));
  await Promise.resolve();

  return {
    events,
    subscribeCalls,
    unsubscribeCalls,
    boundAtMs: now,
    livePendingTimers: timers.size,
    timersArmedAfterBind,
    state: box.__state(),
  };
}

const lateBind = await runLateBind({ publishAtMs: 10000 });
const lateBindExhausted = await runLateBind({ publishAtMs: 10 ** 9, runUntilMs: 10 ** 6 });
{
  const r = lateBind;
  assert.equal(r.subscribeCalls, 1,
    `LATE_REGISTRY_BINDING: a Registry published at 10s on a completely idle page must still `
    + `be bound exactly once (subscribe calls: ${r.subscribeCalls}, attempts: ${r.state.attempts})`);
  assert.equal(r.state.bound, true, 'the subscription is live after a late publication');
  assert.ok(r.events.includes('backfill'),
    'the Registry-ready lifecycle runs, so the provenance backfill executes on a quiet page');
  assert.ok(r.events.includes('refresh'),
    'the ready lifecycle refreshes the Project cards on a quiet page');
  assert.ok(r.events.indexOf('backfill') < r.events.indexOf('refresh'),
    'repair still precedes the refresh it feeds');
  assert.equal(r.livePendingTimers, 0,
    'the retry stops for good once bound — no timer survives, so there is no steady-state cost');
  assert.equal(r.state.settled, true, 'binding marks the retry settled');
  assert.equal(r.timersArmedAfterBind, 0,
    `the retry arms nothing further once the subscription is live `
    + `(armed after bind: ${r.timersArmedAfterBind})`);
  assert.equal(r.unsubscribeCalls, 0, 'a successful first bind never unsubscribes anything');
}

{
  // Registry already present when 9A1c boots: unchanged behaviour, one subscribe.
  const r = await runLateBind({ publishAtBoot: true });
  assert.equal(r.subscribeCalls, 1, 'an already-published Registry binds exactly once at boot');
  assert.equal(r.state.attempts, 0, 'no retry is armed when the Registry is already there');
  assert.equal(r.livePendingTimers, 0, 'the already-present path arms no timer at all');
  assert.ok(r.events.includes('backfill') && r.events.includes('refresh'),
    'the ready lifecycle still runs when the Registry was present from the start');
}

{
  // Repeated availability signals stay idempotent.
  const r = await runLateBind({ publishAtMs: 4000 });
  assert.equal(r.subscribeCalls, 1, 'repeated bind opportunities do not duplicate the subscription');
}

{
  // The retry is finite: a Registry that never appears must not poll forever.
  const r = lateBindExhausted;
  assert.equal(r.subscribeCalls, 0, 'no Registry, no subscription');
  assert.equal(r.livePendingTimers, 0,
    'the retry gives up for good rather than becoming a permanent poll');
  assert.ok(r.state.attempts <= 60,
    `the retry is hard-capped (attempts: ${r.state.attempts})`);
  assert.equal(r.state.settled, true, 'exhausting the bound settles the retry permanently');
}

assert.match(bindBody, /scheduleRegistryBindRetry\(\)/,
  'a bind attempt that finds no Registry arms the bounded retry');
assert.match(retryBody, /registryBindAttempts >= REGISTRY_BIND_MAX_ATTEMPTS/,
  'the retry is bounded by an explicit pinned attempt cap');
assert.match(source, /const REGISTRY_BIND_MAX_ATTEMPTS = \d+;/,
  'the attempt cap is an explicit constant');
assert.doesNotMatch(retryBody, /setInterval\(/, 'the late bind adds no interval');
assert.doesNotMatch(retryBody, /requestAnimationFrame\(/, 'the late bind adds no animation-frame loop');
assert.doesNotMatch(retryBody, /MutationObserver/, 'the late bind adds no observer');
assert.equal((source.match(/setInterval\(/g) || []).length, 1,
  'still exactly one interval, the pre-existing Project-card self-heal');
assert.equal((source.match(/new MutationObserver\(/g) || []).length, 1,
  'still exactly one MutationObserver');

console.log('PASS validate-project-chat-metadata-phase2-card-rendering');
console.log(JSON.stringify({
  matrix: {
    trustedDateTrustedCount: format({ ...trustedDate, ...trustedCount }),
    trustedDateUnknownCount: format(trustedDate),
    unknownDateTrustedCount: format(trustedCount),
    unknownDateUnknownCount: format({}),
  },
  unverifiedDate: format({ createdAt }),
  schemaDefaultZero: format({ userTurnCount: 0, userTurnCountSource: '' }),
  measuredZero: format({ userTurnCount: 0, userTurnCountSource: 'open-chat-turn-runtime' }),
  registryOnly: true,
  boundedRefresh: true,
  projectScope: true,
  registryStorageKey: CANONICAL_REGISTRY_KEY,
  retiredStorageKey: RETIRED_META_KEY,
  scheduling: {
    coalesceWindowMs: COALESCE_MS,
    maxWaitMs: COALESCE_MS + FRAME_MS,
    duringChurn: {
      scheduleCalls: duringChurn.scheduleCalls,
      timersCreated: duringChurn.timersCreated,
      timersCancelledBeforeFiring: duringChurn.timersCleared,
      timersFired: duringChurn.timersFired,
      maxConcurrentPendingPasses: duringChurn.maxLiveTimers,
      resyncs: duringChurn.resyncs,
      firstResyncAtMs: duringChurn.firstResyncAt,
      row: duringChurn.row,
    },
    rowWritesAfterSettling: starvation.stats.rowWrites,
  },
  provenanceBackfill: {
    trigger: 'ChatRegistry.ready',
    sourceStore: 'ho:chat-meta-v1 (9A1a interface store)',
    targetStore: CANONICAL_REGISTRY_KEY,
    upsertSource: 'chat-meta-provenance-backfill',
    matchingDate: 'promoted',
    matchingCount: 'promoted',
    divergedDate: 'not promoted',
    divergedCount: 'not promoted',
    missingRegistryValue: 'left unchanged (repair restores proofs, never supplies values)',
    missingRegistryRecord: 'not created',
    alreadyTrusted: 'no write',
    batching: 'one upsertMany call per pass',
    reloadRoundTrip: 'provenance survives flush + fresh hydration',
    targetCardLine: 'Created: 28 Jul 2026 · 57 Q&A',
  },
  lateRegistryBinding: {
    scenario: 'Registry published at 10s, DOM completely idle, no navigation',
    subscribeCalls: lateBind.subscribeCalls,
    boundAtMs: lateBind.boundAtMs,
    retryAttemptsUsed: lateBind.state.attempts,
    readyLifecycle: lateBind.events.filter((e) => e === 'backfill' || e === 'refresh'),
    pendingTimersAfterBinding: lateBind.livePendingTimers,
    timersArmedAfterBinding: lateBind.timersArmedAfterBind,
    noRegistryEver: {
      subscribeCalls: lateBindExhausted.subscribeCalls,
      attemptsBeforeGivingUp: lateBindExhausted.state.attempts,
      pendingTimers: lateBindExhausted.livePendingTimers,
      settled: lateBindExhausted.state.settled,
    },
  },
}, null, 2));
