import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const rel = Object.freeze({
  auto: 'src-runtime-base/9D1a.🟤📱 Auto Emoji Title 📱.js',
  controls: 'src-runtime-base/0Z1p.⚫️🖥️🕹️ Interface Controls (Control Hub 🔌 Plugin) 🕹️.js',
  order: 'config/dev-order.tsv',
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

assert.match(source.order, /^🟢\t9D1a\.🟤📱 Auto Emoji Title 📱\.js$/mu,
  'the established Auto Emoji owner is enabled in the runtime order');
assert.match(source.controls, /label:\s*'Automatically assign emoji'[\s\S]*group:\s*'Automation'[\s\S]*def:\s*DEFAULT_AE_AUTO_ASSIGN/,
  'Control Hub exposes automatic emoji assignment under Automation');
assert.match(source.controls, /const DEFAULT_AE_AUTO_ASSIGN = true/,
  'automatic emoji assignment defaults on');
assert.match(source.auto, /if \(!isAutomaticEmojiEligible\([\s\S]*\)\) return;[\s\S]*pickEmojiForTitle\(plain\)[\s\S]*applyNativeAutoEmoji/,
  'only eligible chats reach the canonical suggested-emoji/native-title path');
assert.match(source.auto, /chatTitleApi\(\)\?\.setEmoji\?\./,
  '9D1a publishes emoji through canonical 9B0a ChatTitle authority');
assert.match(source.auto, /localStorage\.getItem\(KEY_AE_\.DONE\(chatId\)\) === '1'/,
  'automatic completion is durable across reload and navigation');
assert.match(source.auto, /localStorage\.setItem\(KEY_AE_\.DONE\(chatId\), '1'\)/,
  'accepted automatic completion records once by canonical chat identity');

const eligibilitySandbox = { Number, String };
eligibilitySandbox.globalThis = eligibilitySandbox;
vm.createContext(eligibilitySandbox);
vm.runInContext(
  `const MIN_TITLE_LENGTH=4, STABLE_RUNS_REQUIRED=2; const norm=(value)=>String(value||'').trim();\n` +
  `${extractFunction(source.auto, 'isAutomaticEmojiEligible')}\n` +
  'globalThis.eligible=isAutomaticEmojiEligible;',
  eligibilitySandbox,
  { filename: rel.auto }
);
const eligible = { autoEnabled: true, chatId: 'chat-a', plainTitle: 'Eligible chat', hasEmoji: false, done: false, pending: false, stableRuns: 2 };
assert.equal(eligibilitySandbox.eligible(eligible), true, 'eligible emoji-less chat can auto-assign');
assert.equal(eligibilitySandbox.eligible({ ...eligible, autoEnabled: false }), false, 'off prevents automatic mutation');
assert.equal(eligibilitySandbox.eligible({ ...eligible, hasEmoji: true }), false, 'existing emoji is never overwritten');
assert.equal(eligibilitySandbox.eligible({ ...eligible, done: true }), false, 'reload/navigation completion blocks repeat assignment');
assert.equal(eligibilitySandbox.eligible({ ...eligible, pending: true }), false, 'pending assignment blocks duplicate submission');

assert.match(source.controls, /label:\s*'Show Pre-emoji Chat Icon'[\s\S]*group:\s*'Sidebar Emoji'[\s\S]*def:\s*DEFAULT_AE_SHOW_EMPTY_BADGE/,
  'Control Hub exposes pre-emoji visibility under Sidebar Emoji');
assert.match(source.controls, /const DEFAULT_AE_SHOW_EMPTY_BADGE = true/,
  'pre-emoji visibility defaults on');
assert.match(source.auto, /keepOnlyOneBadgeAny\(entry, leaf\)[\s\S]*if \(!badgeEmoji && !getShowPreEmojiChatIcon\(\)\)[\s\S]*ho-emoji-empty[\s\S]*entry\.classList\.remove\('ho-emoji-row'\)/,
  'emoji-less sidebar rows render at most one placeholder and remove its reserved lane when off');
assert.match(source.auto, /if \(!badgeEmoji && !getShowPreEmojiChatIcon\(\)\)/,
  'real emoji bypass the placeholder-visibility suppression');
assert.match(extractFunction(source.auto, 'activateEmojiBadge'), /openUnifiedTitlePanel\(\{[\s\S]*chatId[\s\S]*anchor[\s\S]*sourceEl:\s*badge/,
  'pre-emoji click opens the single canonical picker for the exact chat');
assert.doesNotMatch(extractFunction(source.auto, 'activateEmojiBadge'), /addSuggestedEmojiFromBadge|publishEmoji|applyNativeAutoEmoji/,
  'placeholder activation itself performs no emoji mutation');

assert.match(source.auto, /data-cgxui', SET_EMOJI_MENU_MARK/,
  'native Set emoji action has an H2O ownership/idempotency marker');
assert.match(extractFunction(source.auto, 'setNativeMenuItemLabel'),
  /createTreeWalker\(item, NodeFilter\.SHOW_TEXT\)[\s\S]*textNode\.nodeValue = label/,
  'native menu label replacement handles ChatGPT direct text nodes without leaving Rename visible');
assert.match(source.auto, /captureSidebarChatMenuIdentity[\s\S]*closest\('a\[href\*="\/c\/"\]'\)[\s\S]*extractChatIdFromHref/,
  'native menu context binds the exact triggering sidebar chat href');
assert.match(source.auto, /const existing = menu\.querySelector\([\s\S]*existing\.dataset\.hoAutoEmojiChatId = currentChatId/,
  'a reused native menu updates its exact chat identity without duplicate actions');
assert.match(source.auto, /setNativeMenuItemLabel\(item, 'Set emoji'\)[\s\S]*openUnifiedTitlePanel\(\{ chatId, sourceEl: item/,
  'native Set emoji uses the same canonical picker authority');
assert.match(source.auto, /labels\.includes\('Rename'\) && labels\.includes\('Share'\)[\s\S]*Archive\|Delete/,
  'menu injection fails closed outside an actual native chat menu');

assert.match(source.controls, /label:\s*'Show Heat Pill'[\s\S]*group:\s*'Sidebar Status'[\s\S]*def:\s*DEFAULT_AE_SHOW_HEAT_PILL/,
  'Control Hub exposes Heat Pill visibility under Sidebar Status');
assert.match(source.controls, /const DEFAULT_AE_SHOW_HEAT_PILL = true/,
  'Heat Pill visibility defaults on');
assert.match(source.auto, /data-ho-show-heat-pill[\s\S]*\.ho-colorbtn-side[\s\S]*display:\s*none !important/,
  'Heat Pill setting hides only the existing 9A1b sidebar presentation');
assert.doesNotMatch(extractFunction(source.auto, 'applyAutoEmojiSetting'), /setOverride|setRow|applyToBtn/,
  'Heat Pill setting path does not mutate Heat Pill scoring/state');

assert.equal((source.auto.match(/new MutationObserver\(/g) || []).length, 1,
  'Auto Emoji uses one existing lifecycle observer for badges and menu augmentation');
assert.equal((source.auto.match(/document\.addEventListener\('pointerdown', captureSidebarChatMenuIdentity, true\)/g) || []).length, 1,
  'one capture listener binds native menu identity');
assert.match(source.auto, /if \(nativeMenuAugmentRaf\) return;[\s\S]*requestAnimationFrame/,
  'native menu augmentation is coalesced and cannot form an injection loop');
assert.match(source.auto,
  /let t = null;[\s\S]*function schedule\(\)\{[\s\S]*scheduleSidebarMenuAugmentation\(\);[\s\S]*clearTimeout\(t\);[\s\S]*maybeAutoEmojiRename\(\)/,
  'short-lived native menus are augmented immediately instead of waiting for global DOM quiescence');
assert.match(source.auto, /api\.openPanel = openUnifiedTitlePanel;[\s\S]*api\.openPicker = openUnifiedTitlePanel/,
  'one existing picker function remains the public manual-entry authority');
assert.match(source.auto, /pickerEl\.dataset\.chatId = chatId;[\s\S]*pickerEl\.dataset\.hoEmojiPickerAuthority = '9D1a'/,
  'the single picker exposes its exact requested chat identity and authority for lifecycle proof');
assert.doesNotMatch(source.auto, /window\.H2O\s*=\s*\{\s*emoji/,
  'no sidebar-only emoji state is introduced');

console.log('validate-auto-emoji-title-controls: ok');
