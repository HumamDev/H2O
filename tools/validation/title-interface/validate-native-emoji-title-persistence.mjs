import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const rel = Object.freeze({
  state: 'src-runtime-base/9B0a.🟤🏷️ Chat Title State 🏷️.js',
  sidebar: 'src-runtime-base/9B2a.🟤🏷️ Sidebar Title Renderer 🏷️.js',
  internal: 'src-runtime-base/9C1a.🟤📌 Title Under Input bar 📌.js',
  auto: 'src-runtime-base/9D1a.🟤📱 Auto Emoji Title 📱.js',
});
const source = Object.fromEntries(Object.entries(rel).map(([key, value]) => [key, fs.readFileSync(path.join(root, value), 'utf8')]));

function extractFunction(text, name) {
  const start = text.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} exists`);
  const brace = text.indexOf('{', text.indexOf(')', start));
  let depth = 0;
  for (let index = brace; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    if (text[index] === '}') depth -= 1;
    if (depth === 0) return text.slice(start, index + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

const parserSandbox = { Intl, String };
parserSandbox.globalThis = parserSandbox;
parserSandbox.W = parserSandbox;
vm.createContext(parserSandbox);
vm.runInContext([
  "const norm=(value)=>String(value||'').replace(/[\\s\\u00A0]+/g,' ').trim();",
  extractFunction(source.state, 'graphemes'),
  extractFunction(source.state, 'isEmojiCluster'),
  extractFunction(source.state, 'takeLeadingEmojiSlot'),
  extractFunction(source.state, 'stripLeadingOwnedSlot'),
  extractFunction(source.state, 'composeNativeTitle'),
  extractFunction(source.state, 'composeH2OAssignedTitle'),
  'globalThis.api={takeLeadingEmojiSlot,stripLeadingOwnedSlot,composeNativeTitle,composeH2OAssignedTitle};',
].join('\n'), parserSandbox, { filename: rel.state });

const parser = parserSandbox.api;
const cases = [
  ['🍋 Best Choice', '🍋', 'Best Choice'],
  ['👩🏽‍💻 Engineering Notes', '👩🏽‍💻', 'Engineering Notes'],
  ['🇦🇹 Vienna Notes', '🇦🇹', 'Vienna Notes'],
  ['👍🏽 Approval', '👍🏽', 'Approval'],
  ['🍋', '🍋', ''],
  ['🍋 🔥 Best Choice', '🍋', '🔥 Best Choice'],
  ['🍋 Best Choice 🔥', '🍋', 'Best Choice 🔥'],
];
for (const [title, emoji, remainder] of cases) {
  const parsed = parser.takeLeadingEmojiSlot(title);
  assert.equal(parsed.emoji, emoji, `one leading grapheme parsed from ${title}`);
  assert.equal(parsed.remainder, remainder, `remainder preserved for ${title}`);
  assert.equal(parser.composeNativeTitle(parsed.emoji, parsed.remainder), title, `parse/compose roundtrip is lossless for ${title}`);
}
assert.equal(parser.stripLeadingOwnedSlot('🍋 🔥 Best Choice', '🍋'), '🔥 Best Choice', 'only the proven owned slot is stripped');
assert.equal(parser.stripLeadingOwnedSlot('🔥 Best Choice', '🍋'), '🔥 Best Choice', 'an unknown native emoji is never claimed');
assert.equal(parser.composeNativeTitle('🚲', parser.stripLeadingOwnedSlot('🍋 🔥 Best Choice', '🍋')), '🚲 🔥 Best Choice', 'changing the H2O slot preserves a secondary user emoji');
assert.equal(parser.takeLeadingEmojiSlot('🚲 🔥 Title').remainder, '🔥 Title', 'explicit removal drops exactly one leading emoji cluster');
assert.equal(parser.takeLeadingEmojiSlot('👩🏽‍💻 🔥 Title').remainder, '🔥 Title', 'explicit removal treats a ZWJ skin-tone emoji as one cluster');
assert.equal(parser.takeLeadingEmojiSlot('🇦🇹 🔥 Title').remainder, '🔥 Title', 'explicit removal treats a flag as one cluster');
assert.equal(parser.takeLeadingEmojiSlot('Title 🔥').hasSlot, false, 'a title without a leading emoji is a no-op and preserves trailing emoji');

// ── Issue 2.2 — H2O may own at most ONE leading emoji slot ────────────────
// Observed live: "😅 😅 😅 H2O Item 10 M2 Canary". Reproduced from source by
// driving the previous composition pair — when a record could not PROVE it
// owned the current slot, the whole decorated title became the remainder and
// the emoji was prepended again, so each reapplication grew the run by one.
// Every H2O mutation now goes through one canonical boundary that can only
// replace the first slot or leave it alone, never insert before it.
const AUTO = Object.freeze({ explicit: false });
const PICK = Object.freeze({ explicit: true });
const assign = (title, emoji, op) => parser.composeH2OAssignedTitle(title, emoji, op);

// 1. emoji-less auto assignment establishes the single slot.
assert.equal(assign('Test', '🧠', AUTO), '🧠 Test', 'auto assignment creates the one H2O slot');

// 2/3. repeated auto application is idempotent and can never grow the title.
assert.equal(assign('🧠 Test', '🧠', AUTO), '🧠 Test', 'reapplying the same auto emoji changes nothing');
{
  let t = 'H2O Item 10 M2 Canary';
  for (let i = 0; i < 10; i += 1) t = assign(t, '😅', AUTO);
  assert.equal(t, '😅 H2O Item 10 M2 Canary', 'ten auto applications never grow the leading emoji run');
  assert.equal(t.startsWith('😅 😅'), false, 'the observed live duplication cannot be reproduced');
}

// 4/5. an existing leading emoji is never joined by a second one.
assert.equal(assign('🔥 Test', '🧠', AUTO), '🔥 Test', 'auto never adds a slot beside a user emoji');
assert.equal(assign('🔥 🧠 Test', '⭐', AUTO), '🔥 🧠 Test', 'auto leaves a user-authored multi-emoji title untouched');

// 6/7/8. explicit palette selection REPLACES the first slot, never prepends.
assert.equal(assign('🧠 Test', '🔥', PICK), '🔥 Test', 'palette selection replaces the H2O slot');
assert.equal(assign('🔥 Test', '🔥', PICK), '🔥 Test', 'reselecting the same emoji is idempotent');
{
  let t = 'Test';
  for (const e of ['🧠', '🔥', '⭐', '😅', '😅']) t = assign(t, e, PICK);
  assert.equal(t, '😅 Test', 'repeated different palette choices leave exactly one slot');
  assert.equal(parser.takeLeadingEmojiSlot(parser.takeLeadingEmojiSlot(t).remainder).hasSlot, false,
    'no second leading emoji survives repeated palette selection');
}

// Idempotency property: F(F(x,e,op),e,op) === F(x,e,op) for both operations.
for (const op of [AUTO, PICK]) {
  for (const title of ['Test', '🧠 Test', '🔥 🧠 Test', '😅 😅 😅 H2O Item', 'Test 🔥', '🍋']) {
    for (const emoji of ['🧠', '👩🏽‍💻', '🇦🇹']) {
      const once = assign(title, emoji, op);
      assert.equal(assign(once, emoji, op), once,
        `idempotent for ${op.explicit ? 'palette' : 'auto'} ${emoji} on ${title}`);
    }
  }
}

// 9. whitespace-separated leading emoji runs are handled by grapheme parsing.
assert.equal(assign('😅 😅 😅 H2O Item', '😅', AUTO), '😅 😅 😅 H2O Item',
  'auto leaves an existing run alone rather than growing it');
assert.equal(assign('😅 😅 😅 H2O Item', '🔥', PICK), '🔥 😅 😅 H2O Item',
  'palette replaces exactly the first slot of a run and never inserts before it');

// 10. multi-code-point graphemes stay intact as one slot.
assert.equal(assign('Notes', '👩🏽‍💻', AUTO), '👩🏽‍💻 Notes', 'ZWJ skin-tone emoji is one slot');
assert.equal(assign('👩🏽‍💻 Notes', '🇦🇹', PICK), '🇦🇹 Notes', 'a flag replaces a ZWJ cluster as one slot');
assert.equal(assign('👍🏽 Approval', '👍🏽', AUTO), '👍🏽 Approval', 'skin-tone modifier survives reapplication');

// 11/12. remainder is preserved losslessly, including user emoji anywhere in it.
assert.equal(assign('Best Choice 🔥', '🍋', AUTO), '🍋 Best Choice 🔥', 'a trailing user emoji is preserved');
assert.equal(assign('🍋 Best Choice 🔥', '🚲', PICK), '🚲 Best Choice 🔥', 'replacement preserves the trailing emoji');
assert.equal(assign('🔥 🧠 ⭐ Experiment', '💡', PICK), '💡 🧠 ⭐ Experiment',
  'palette replaces only the first slot of a user-authored run');

// 14. an ambiguous historical run is never silently collapsed to one emoji.
assert.equal(assign('😅 😅 😅 H2O Item', '😅', AUTO).match(/😅/gu).length, 3,
  'H2O never deletes user text it cannot prove it authored');

// 15. anti-vacuity — a genuine palette replacement must still mutate.
{
  const before = '🧠 Test';
  const after = assign(before, '🔥', PICK);
  assert.notEqual(after, before, 'the helper is not a no-op: a real replacement still changes the title');
  assert.equal(parser.takeLeadingEmojiSlot(after).emoji, '🔥', 'and the new slot is the requested emoji');
}

// The canonical boundary must be the one the persistence path actually uses.
assert.match(source.state, /const desiredNativeTitle = composeH2OAssignedTitle\(/u,
  'the native assignment path composes its title through the canonical boundary');
assert.doesNotMatch(extractFunction(source.state, 'runEmojiAssignment'), /nativeRemainderForAssignment/u,
  'the prepend-onto-decorated-title path is gone from the assignment transaction');

// ── Issue 2.1 — explicit palette replacement is owner-agnostic ────────────
// The original defect: selecting a palette emoji failed to replace a leading
// emoji the user had typed, because replacement was gated on H2O proving it
// owned that slot. The first leading slot is user-facing and owner-agnostic
// for an EXPLICIT selection; provenance stays internal, for persistence and
// destructive safety only.
//
// These four cases are the recorded Issue-2.1 contract verbatim.
assert.equal(assign('🧠 Test Title', '🔥', PICK), '🔥 Test Title',
  'Issue 2.1: a manually typed leading emoji is replaced by an explicit palette choice');
assert.equal(assign('🔥 Test Title', '⭐', PICK), '⭐ Test Title',
  'Issue 2.1: a different palette choice replaces the current slot');
assert.equal(assign('🔥 Test Title', '🔥', PICK), '🔥 Test Title',
  'Issue 2.1: reselecting the same emoji is idempotent');
assert.equal(assign('🔥 🧠 Test', '💡', PICK), '💡 🧠 Test',
  'Issue 2.1: a user-authored second emoji survives replacement of the first slot');

// Structural guards. The behavioural cases above would still pass if someone
// reintroduced an ownership gate UPSTREAM of the composer, which is exactly how
// Issue 2.1 originally manifested — so the un-gated path is asserted directly.
const composerBody = extractFunction(source.state, 'composeH2OAssignedTitle');
assert.doesNotMatch(composerBody, /emojiOwner|hasConfirmedOwnedSlot|lastNativeSubmission|normalizeEmojiOwner|\brec\b/u,
  'the canonical composer cannot consult ownership: it receives only title, emoji and intent');
assert.match(composerBody, /function composeH2OAssignedTitle\(nativeTitle, emoji, options\)/u,
  'the composer signature carries no record or ownership parameter');

const assignmentBody = extractFunction(source.state, 'runEmojiAssignment');
assert.match(assignmentBody, /const explicitSelection = opts\.userInitiated === true;/u,
  'an explicit palette selection is classified from userInitiated');
assert.match(assignmentBody, /composeH2OAssignedTitle\(nativeBefore\.title, emoji, \{ explicit: explicitSelection \}\)/u,
  'the explicit intent reaches the canonical composer');
assert.match(assignmentBody, /if \(!explicitSelection && desiredNativeTitle === nativeBefore\.title/u,
  'the leading-slot-occupied decline is restricted to automatic assignment and can never intercept the palette');
assert.doesNotMatch(assignmentBody, /nativeRemainderForAssignment|hasConfirmedOwnedSlot/u,
  'no ownership gate survives on the assignment path');
assert.match(assignmentBody, /if \(!opts\.userInitiated && currentQueue/u,
  'the supersede guard is likewise restricted to automatic assignment');
assert.doesNotMatch(extractFunction(source.state, 'setEmojiAndPersist'), /emojiOwner|hasConfirmedOwnedSlot/u,
  'the public set-and-persist entry point applies no ownership precondition');
assert.doesNotMatch(extractFunction(source.auto, 'applyNativeAutoEmoji'), /emojiOwner|hasConfirmedOwnedSlot|takeLeadingEmojiSlot/u,
  '9D1a enters the canonical transaction without pre-judging the existing slot');
// The one link the behavioural cases cannot see: if 9D1a stopped forwarding
// userInitiated, an explicit palette choice would silently become an automatic
// assignment, the leading-slot decline would swallow it, and Issue 2.1 would
// return with every other assertion here still passing.
assert.match(extractFunction(source.auto, 'applyNativeAutoEmoji'),
  /setEmojiAndPersist\(chatId, emoji, \{[\s\S]*userInitiated: options\.userInitiated === true,/u,
  '9D1a forwards explicit user intent into the canonical transaction rather than downgrading it');

// ── PERMANENT INVARIANT — H2O never grows the leading emoji run ──────────
// H2O owns at most one leading slot. For any H2O-generated emoji mutation:
//   AUTO      with an existing slot -> count unchanged AND title unchanged
//   EXPLICIT  with an existing slot -> count unchanged, first slot replaced
//   no slot                          -> count 0 -> exactly 1
// A user may still type 🔥 🧠 Test by hand; this constrains H2O, not the user.

/* Counts consecutive leading emoji graphemes using the REAL parser, applied
   recursively, so whitespace-separated runs and multi-code-point clusters are
   counted the way the product sees them rather than by code point. */
function leadingEmojiCount(title) {
  let n = 0;
  let rest = title;
  for (;;) {
    const parsed = parser.takeLeadingEmojiSlot(rest);
    if (!parsed.hasSlot) return n;
    n += 1;
    rest = parsed.remainder;
  }
}
assert.equal(leadingEmojiCount('Test'), 0, 'counter: no leading emoji');
assert.equal(leadingEmojiCount('🧠 Test'), 1, 'counter: one leading emoji');
assert.equal(leadingEmojiCount('😅 😅 😅 Test'), 3, 'counter: whitespace-separated run');
assert.equal(leadingEmojiCount('👩🏽‍💻 🇦🇹 Test'), 2, 'counter: ZWJ cluster and flag each count once');
assert.equal(leadingEmojiCount('Best Choice 🔥'), 0, 'counter: a trailing emoji is not a leading slot');

const START_TITLES = [
  'Test', '🧠 Test', '🔥 🧠 Test', '😅 😅 😅 Test',
  '👩🏽‍💻 Test', '🇦🇹 Test', '👍🏽 Test', '🍋 Best Choice 🔥',
];
const OP_EMOJI = ['🧠', '🔥', '⭐'];
const REPEATS = [1, 2, 3, 10];
let propertyChecks = 0;

for (const start of START_TITLES) {
  const startCount = leadingEmojiCount(start);
  const startRemainder = parser.takeLeadingEmojiSlot(start).remainder;
  for (const emoji of OP_EMOJI) {
    for (const explicit of [false, true]) {
      const op = explicit ? PICK : AUTO;
      const label = `${explicit ? 'palette' : 'auto'} ${emoji} on "${start}"`;
      for (const repeats of REPEATS) {
        let t = start;
        for (let i = 0; i < repeats; i += 1) t = assign(t, emoji, op);
        propertyChecks += 1;
        const count = leadingEmojiCount(t);

        if (startCount === 0) {
          assert.equal(count, 1, `${label}: an emoji-less title gains exactly one slot (x${repeats})`);
        } else {
          assert.equal(count, startCount,
            `${label}: H2O must never change the leading emoji count (x${repeats}, ${startCount} -> ${count})`);
        }
        assert.ok(count <= Math.max(1, startCount),
          `${label}: the leading emoji run can never grow (x${repeats})`);

        // Idempotence: the result after N applications equals the result after 1.
        assert.equal(t, assign(start, emoji, op), `${label}: repeated application is idempotent (x${repeats})`);

        if (startCount >= 1) {
          if (explicit) {
            // Only the first slot changes; everything after it is byte-preserved.
            assert.equal(parser.takeLeadingEmojiSlot(t).emoji, emoji, `${label}: first slot is the requested emoji`);
            assert.equal(parser.takeLeadingEmojiSlot(t).remainder, startRemainder,
              `${label}: the remainder after the replaced slot is preserved losslessly`);
          } else {
            assert.equal(t, start, `${label}: automatic assignment leaves an already-slotted title untouched`);
          }
        }
      }
    }
  }
}

// Ownership loss / mismatch / retry re-application are all the same shape to the
// boundary, because it receives no record at all: only a title, an emoji and an
// intent. Re-applying to a previously produced title is therefore the exact
// stale-record and retry case.
for (const start of ['🧠 Test', '😅 😅 😅 Test']) {
  for (const explicit of [false, true]) {
    const op = explicit ? PICK : AUTO;
    const once = assign(start, '🔥', op);
    assert.equal(assign(once, '🔥', op), once, 'retry / stale-record re-application cannot grow the run');
    assert.equal(assign(once, '⭐', op), explicit ? assign(start, '⭐', op) : once,
      'a changed emoji after a retry still owns exactly one slot');
    assert.ok(leadingEmojiCount(assign(once, '⭐', op)) <= leadingEmojiCount(start),
      'no sequence of differing operations can lengthen the run');
  }
}

// ── Structural guards: the ARCHITECTURE, not just the outputs ────────────
const boundaryBody = extractFunction(source.state, 'composeH2OAssignedTitle');
const assignBody = extractFunction(source.state, 'runEmojiAssignment');

assert.match(boundaryBody, /if \(!parsed\.hasSlot\) return composeNativeTitle\(slot, parsed\.title\);/u,
  'an emoji-less title is the only case that may gain a slot');
assert.match(boundaryBody, /if \(options && options\.explicit === true\) return composeNativeTitle\(slot, parsed\.remainder\);/u,
  'explicit selection composes from the REMAINDER, never from the decorated title');
assert.match(boundaryBody, /return parsed\.title;\s*\}\s*$/u,
  'automatic assignment with an existing slot returns the title untouched');
assert.doesNotMatch(boundaryBody, /composeNativeTitle\(slot, parsed\.title\)[\s\S]*composeNativeTitle\(slot, parsed\.title\)/u,
  'there is exactly one slot-creating composition in the boundary');

// Every title the transaction SUBMITS must come from the boundary. The one
// composeNativeTitle here rebuilds the native-owned decorated title as the
// boundary's INPUT, so it is asserted to feed provisionalBase and nothing else.
assert.equal((assignBody.match(/composeH2OAssignedTitle\(/gu) || []).length, 2,
  'both the provisional and the authoritative title come from the boundary');
assert.equal((assignBody.match(/composeNativeTitle\(/gu) || []).length, 1,
  'the transaction contains exactly one raw composition, and it is not a submitted title');
assert.match(assignBody, /const provisionalBase = [\s\S]*\?\s*composeNativeTitle\(rec\.emoji, rec\.baseTitle\)/u,
  'the raw composition only rebuilds the boundary input, never the submitted title');
assert.match(assignBody, /const provisionalTitle = composeH2OAssignedTitle\(/u,
  'the provisional submitted title comes from the boundary');
assert.match(assignBody, /const desiredNativeTitle = composeH2OAssignedTitle\(nativeBefore\.title, emoji, \{ explicit: explicitSelection \}\)/u,
  'the authoritative submitted title comes from the boundary');
assert.doesNotMatch(assignBody, /patchNativeConversationTitle\(chatId, composeNativeTitle\(/u,
  'a raw composition can never be submitted directly');
// The retry loop must reuse the once-composed title, never recompose from a mutated one.
assert.match(assignBody, /for \(let attempt = 1; attempt <= maxAttempts[\s\S]*patchNativeConversationTitle\(chatId, desiredNativeTitle/u,
  'retries resubmit the already-composed title instead of recomposing it');
assert.doesNotMatch(assignBody.slice(assignBody.indexOf('for (let attempt = 1')), /composeH2OAssignedTitle\(/u,
  'no composition happens inside the retry loop');

// No second composition authority anywhere in the module.
assert.equal((source.state.match(/composeNativeTitle\(/gu) || []).length, 5,
  'composeNativeTitle has exactly its known call sites: its definition, two inside the boundary, the provisional base, and the rename path');
assert.doesNotMatch(source.auto, /composeNativeTitle|composeH2OAssignedTitle/u,
  '9D1a composes no native title of its own and can only enter the canonical API');

assert.match(source.state, /emojiOwner:\s*''/u, 'records add explicit emoji ownership');
assert.match(source.state, /value === 'h2o' \|\| value === 'native'/u, 'emoji ownership is a closed enum');
assert.match(source.state, /lastNativeSubmission:\s*null/u, 'records retain one bounded native-submission proof');
assert.match(source.state, /pendingEmojiAssignment:\s*null/u, 'records retain durable pending assignment intent');
assert.match(source.state, /function setEmojiAndPersist\(/u, '9B0a owns the canonical set-and-persist operation');
assert.match(source.state, /function removeLeadingEmojiAndPersist\(/u, '9B0a owns the canonical explicit remove-leading-emoji operation');
assert.match(source.state, /operation === 'remove-leading-emoji'/u, 'durable pending state distinguishes removal from assignment');
assert.match(source.state, /const desiredNativeTitle = parsedBefore\.remainder/u, 'removal preserves every byte after exactly one leading grapheme');
assert.match(source.state, /patchNativeConversationTitle\(chatId, desiredNativeTitle[\s\S]*verified\.title === desiredNativeTitle/u, 'removal PATCH is confirmed by an authoritative native GET equality check');
assert.match(source.state, /status: 'empty-native-title'/u, 'an emoji-only native title fails closed instead of submitting an empty title');
assert.match(source.state, /explicit-user-action-required/u, 'native/user-owned first emoji removal requires an explicit user action');
assert.match(source.state, /record\.lastNativeSubmission = null;[\s\S]*record\.pendingEmojiAssignment = null;/u, 'verified removal clears stale H2O submission ownership and pending evidence');
assert.match(source.state, /payloadCarriesEmoji[\s\S]*nextEmoji !== rec\.emoji[\s\S]*rec\.emoji = nextEmoji/u, 'persisted empty emoji tombstones participate in backward-compatible hydration');
assert.match(source.state, /user-explicit-removal[\s\S]*EMOJI_PRIORITY\.user/u, 'verified explicit removal carries user priority so a stale persisted emoji cannot return on reload');
assert.match(source.state, /removeItem\(`h2o:prm:cgx:tmjttl:state:emoji_\$\{safeId\(rec\?\.chatId\)\}:v1`\)[\s\S]*removeItem\(`ho:autoemoji:emoji:/u, 'verified removal retires only the exact chat’s bounded pre-canonical emoji caches before they can republish stale state');
assert.match(source.state, /parsed\.hasSlot \? 'native' : ''/u, 'a surviving second emoji is reconciled as native instead of showing a placeholder beside it');
assert.match(source.state, /return enqueueEmojiMutation\(chatId,[\s\S]*runLeadingEmojiRemoval/u, 'assignment and removal share one per-chat queue, preventing double submission races');
assert.match(source.state, /patchNativeConversationTitle\(chatId, desiredNativeTitle/u, 'native PATCH includes the composed H2O emoji title');
assert.match(source.state, /const verified = await readNativeConversationTitle[\s\S]*verified\.title === desiredNativeTitle/u, 'PATCH success is followed by authoritative native GET equality');
assert.match(source.state, /status: 'persistence-unconfirmed'[\s\S]*actualTitle:/u, 'authoritative mismatch cannot report confirmed success');
assert.match(source.state, /setPendingEmojiAssignment\(rec,[\s\S]*patchNativeConversationTitle/u, 'durable pending intent is persisted before native mutation');
assert.match(source.state, /nativeRepairAttemptedThisSession\.has\(chatId\)[\s\S]*repair:\s*true/u, 'hydration permits only one bounded repair attempt per session');
assert.match(source.state, /repairAttempts:\s*Math\.max\(0, Math\.min\(1/u, 'durable pending state caps repair across reload sessions');
assert.match(source.state, /pending\.repairAttempts >= 1[\s\S]*status: 'repair-abandoned'/u, 'exhausted repair intent is retained without a rename loop');
assert.match(source.state, /native\.title === pending\.title[\s\S]*native-rehydrate-pending-confirmed/u, 'a reload can confirm a previously submitted pending title without another rename');
assert.match(source.state, /if \(!owned\) record\.lastNativeSubmission = null/u, 'external native truth clears stale H2O submission proof');
assert.match(source.state, /latestUserSequence > sequence/u, 'queued user choices supersede stale automatic assignments');
assert.match(source.state, /status: 'already-current'[\s\S]*patchCount: 0/u, 'same-emoji idempotency performs zero PATCHes');
assert.match(source.state, /const alreadyConfirmed =[\s\S]*if \(!alreadyConfirmed\)[\s\S]*confirmNativeEmojiState/u, 'an idle already-confirmed scan performs no record mutation');

const autoAssignment = extractFunction(source.auto, 'applyNativeAutoEmoji');
assert.match(autoAssignment, /api\?\.setEmojiAndPersist/u, 'automatic and manual 9D1a paths call the canonical 9B0a operation');
assert.doesNotMatch(autoAssignment, /renameNative|publishEmoji/u, '9D1a has no second native persistence or local-success fallback');
const pickerSelection = extractFunction(source.auto, 'selectEmoji');
assert.match(pickerSelection, /applyNativeAutoEmoji[\s\S]*userInitiated:\s*true/u, 'manual picker enters the same canonical transaction as a user-priority request');
assert.doesNotMatch(pickerSelection, /publishEmoji|setBadgeDisplay/u, 'manual picker does not claim optimistic persisted success');
assert.match(source.auto, /removeEmoji\.dataset\.hoRemoveEmojiAction = '1'/u, 'the canonical Title Palette exposes a dedicated Remove emoji action');
assert.match(source.auto, /api\.removeLeadingEmojiAndPersist\(chatId,[\s\S]*userInitiated:\s*true/u, 'the palette removal action enters the canonical 9B0a transaction for its exact chat');
assert.match(source.auto, /removeEmoji\.dataset\.pending === '1'/u, 'the palette removal action suppresses double-submit while native verification is pending');
assert.match(source.auto, /Could not remove emoji/u, 'failed verification stays visible and retryable instead of claiming removal success');
assert.match(source.auto, /openUnifiedTitlePanel\(\{ chatId, sourceEl: item/u, 'sidebar Set emoji still opens the shared picker for the exact chat');

assert.match(source.sidebar, /current\.visual\.textContent !== snapshot\.baseTitle/u, '9B2a renders only the title remainder');
assert.match(source.sidebar, /visual\.textContent = snapshot\.baseTitle/u, 'the sidebar title cannot duplicate 9D1a’s single emoji badge');
assert.doesNotMatch(extractFunction(source.auto, 'stripEdgeEmojiFromLeaf'), /stripEdgeEmoji\(/u, 'sidebar de-duplication no longer strips all user edge emoji');
assert.match(extractFunction(source.auto, 'stripEdgeEmojiFromLeaf'), /parsed\.emoji !== norm\(expectedEmoji\)/u, 'sidebar removes only the exact emoji represented by its badge');

assert.match(source.internal, /api\.renameNative\(nextBase/u, 'Internal Chat Title continues to submit a text remainder through 9B0a');
assert.match(source.state, /preservedEmoji \? composeNativeTitle\(preservedEmoji, nextBaseTitle\) : nextBaseTitle/u, '9B0a preserves the presented H2O or native slot when 9C1a renames the remainder');
assert.match(source.state, /const ownedEmoji = renameEmojiOwner === 'h2o'/u, 'only an H2O-owned slot receives H2O submission evidence');
assert.match(source.state, /record\.baseTitle = nextBaseTitle/u, 'confirmed internal rename retains the separate base-title model');

assert.match(extractFunction(source.auto, 'findPinnedNativeChatPlaceholder'),
  /svg\[aria-hidden="true"\] use\[href\$="#chat"\]/u,
  'the pinned ChatGPT placeholder is identified as native aria-hidden UI chrome, never title content');
assert.match(extractFunction(source.auto, 'findLeafTitleNode'),
  /entry\.querySelector\('\[data-marquee-text\]'\)[\s\S]*isSidebarChromeTextNode/u,
  '9D1a reads the actual marquee title instead of row-wide text that can contain UI chrome');
assert.match(extractFunction(source.state, 'readSidebarTitle'),
  /entry\.querySelector\(NATIVE_TITLE_SELECTOR\)[\s\S]*sanitizeTitleForState\(semanticText\)/u,
  '9B0a canonical fallback derives title text from the native title container');
assert.match(extractFunction(source.state, 'readTextExcluding'),
  /\[aria-hidden="true"\][\s\S]*\[data-ho-pinned-native-chat-placeholder="1"\]/u,
  'native pinned icon chrome is excluded even if semantic title fallback is unavailable');
assert.doesNotMatch(extractFunction(source.state, 'patchNativeConversationTitle'),
  /sidebar|placeholder|textContent/iu,
  'native PATCH payload construction has no dependency on decorated sidebar chrome');
assert.match(extractFunction(source.auto, 'activatePinnedNativePlaceholder'),
  /openUnifiedTitlePanel\(\{[\s\S]*chatId: context\.chatId/u,
  'the restored native placeholder after removal reuses the same exact-chat picker authority');
assert.doesNotMatch(extractFunction(source.auto, 'activatePinnedNativePlaceholder'),
  /setEmojiAndPersist|removeLeadingEmojiAndPersist|patchNative/u,
  'opening the pinned placeholder performs no native title mutation');

console.log('validate-native-emoji-title-persistence: ok');
