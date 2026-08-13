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
  'globalThis.api={takeLeadingEmojiSlot,stripLeadingOwnedSlot,composeNativeTitle};',
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
