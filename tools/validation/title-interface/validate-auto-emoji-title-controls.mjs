import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const rel = Object.freeze({
  auto: 'src-runtime-base/9D1a.🟤📱 Auto Emoji Title 📱.js',
  list: 'src-runtime-base/9A1b.🟫🖥️ Chat List Decorator 🎨🖥️.js',
  kernel: 'src-runtime-base/9A1a.🟫🖥️ Interface Kernel ⚙️🖥️.js',
  themes: 'src-runtime-base/8A1b.🟪🎨 Themes Panel 🎨.js',
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
assert.match(source.auto, /api\?\.setEmojiAndPersist/,
  '9D1a persists emoji through the canonical verified 9B0a operation');
assert.doesNotMatch(extractFunction(source.auto, 'applyNativeAutoEmoji'), /renameNative|publishEmoji/,
  '9D1a no longer owns a second native rename or local-only success fallback');
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

assert.match(source.kernel, /setRow\(id, idx\)[\s\S]*localStorage[\s\S]*mirrorInterfaceState\(id,[\s\S]*h2o:interface:row-tint-change[\s\S]*chatId: String\(id/u,
  'the existing Interface row-color store persists and publishes the exact canonical chat identity');
assert.doesNotMatch(source.auto, /function applyIntegratedRowByIndex/u,
  'the Title Palette does not maintain a second sidebar row-color renderer');
assert.match(source.auto, /mode === 'row'[\s\S]*api\.store\.setRow\?\.\(chatId, next\)/u,
  'a palette color click writes the exact picker chatId through the existing Interface authority');
assert.match(source.list, /link\.dataset\.hoRowColorOwner = "9A1b"/u,
  'the existing 9A1b renderer stamps its owner-scoped row-color presentation hook');
for (const color of ['gold', 'red', 'blue', 'green']) {
  assert.match(source.list, new RegExp(`data-ho-row-color-owner="9A1b"\\]\\.ho-row-${color}[\\s\\S]*background(?:-color)?:\\s*rgba`, 'u'),
    `the existing ${color} row tint is restored above the Themes reset without changing its palette`);
}
assert.match(source.list, /h2o:interface:row-tint-change[\s\S]*scheduleChatMetaDecorationRefresh\(event\?\.detail\?\.chatId\)/u,
  'the sidebar repaints the exact changed row immediately without reload');
assert.match(source.list, /function refreshChatMetaDecorations\(chatId\)[\s\S]*I\.store\.getRow\(id\)[\s\S]*forEachNativeChatLink\(id/u,
  'row replacement and duplicate-title chats restore color strictly by chatId');
assert.match(source.list, /if \(rowIdx >= 0\) applyRowByIndex\(link, rowIdx\)/u,
  'freshly virtualized sidebar rows rehydrate their persisted color');

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

/* Sidebar presentation while a Theme is active.
 *
 * Both owned sidebar controls are real `role="button"` elements, which places
 * them inside the Themes generic sidebar reset that blanks background, border
 * and box-shadow on those elements and on their pseudo-elements. The nodes
 * stayed in the DOM and painted nothing. The repair is owned by the controls:
 * each restates its own existing paint at a cascade rank that outranks the
 * generic reset, so Themes keeps its reset unmodified. */

function cssRuleBody(text, selectorSource) {
  const match = text.match(new RegExp(`^\\s*${selectorSource}\\s*\\{([^}]*)\\}`, 'mu'));
  assert.ok(match, `css rule present: ${selectorSource}`);
  return match[1];
}

function cssDeclaration(body, property) {
  const match = body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:([^;]*);`, 'u'));
  return match ? match[1].replace('!important', '').replace(/\s+/gu, ' ').trim() : null;
}

function compareSpecificity(a, b) {
  return (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);
}

function specificity(selector) {
  let ids = 0;
  let classes = 0;
  let elements = 0;
  let rest = selector.trim();

  rest = rest.replace(/:(?:is|not|has)\(([^()]*)\)/gu, (_, args) => {
    const strongest = args.split(',').map(specificity).sort(compareSpecificity).pop();
    ids += strongest[0];
    classes += strongest[1];
    elements += strongest[2];
    return ' ';
  });
  rest = rest.replace(/:where\([^()]*\)/gu, ' ');

  const take = (pattern) => {
    const found = rest.match(pattern) || [];
    rest = rest.replace(pattern, ' ');
    return found.length;
  };

  ids += take(/#[\w-]+/gu);
  elements += take(/::[\w-]+/gu);
  classes += take(/\[[^\]]*\]/gu);
  classes += take(/\.[\w-]+/gu);
  classes += take(/:[\w-]+/gu);
  elements += rest.split(/[\s>+~,]+/u).filter((token) => /^[a-z][\w-]*$/iu.test(token)).length;

  return [ids, classes, elements];
}

assert.deepEqual(specificity('body[a="1"] aside :is(div, a, [role="button"])::before'), [0, 2, 3],
  'the specificity model matches the CSS cascade rules this proof depends on');

assert.match(source.auto, /badge\.setAttribute\('role', 'button'\)/u,
  'the pre-emoji placeholder is a real button, which is why the Themes sidebar reset reaches it');
assert.match(source.list, /btn\.setAttribute\("role", "button"\)/u,
  'the Heat Pill is a real button, which is why the Themes sidebar reset reaches it');

const themeCss = source.themes
  .replaceAll('${ATTR_HO_THEME_ENABLED}', 'data-ho-theme-enabled')
  .replaceAll('${ATTR_HO_CHATGPT_SIDEBAR}', 'data-ho-chatgpt-sidebar');
// Every sidebar container Themes resets through, id-scoped ones included. The
// live docked "Chats" list renders inside #stage-slideover-sidebar, so the
// id-scoped branch is the one that actually governs the rows the user sees;
// excluding it here would let a restoration that never paints pass this file.
const dockedSidebarResets = (themeCss.match(/^body\[data-ho-theme-enabled="true"\][^\n{]*\[role="button"\][^\n{,]*/gmu) || [])
  .map((selector) => selector.trim())
  .filter((selector) => /aside|sidebar|nav\[aria-label/u.test(selector));
assert.ok(dockedSidebarResets.length >= 8,
  'Themes still owns its generic docked-sidebar reset over role=button controls and their pseudo-elements');

// Both reset families must be represented, or "outranks every reset" would be a
// weaker claim than it reads: the generic container branches and the id-scoped
// #stage-slideover-sidebar branch that governs the live docked Chats rows.
const genericResets = dockedSidebarResets.filter((selector) => !selector.includes('#'));
const idScopedResets = dockedSidebarResets.filter((selector) => selector.includes('#stage-slideover-sidebar'));
assert.ok(genericResets.length >= 8, 'the generic Themes sidebar reset branches are still present');
assert.ok(idScopedResets.length >= 2, 'the id-scoped Themes sidebar reset branch is still present');

const restorations = Object.freeze([
  {
    owner: '9D1a',
    control: 'pre-emoji placeholder',
    key: 'auto',
    selector: 'body[data-ho-theme-enabled="true"] :is(aside, nav[aria-label*="chat" i], #stage-slideover-sidebar) a[href*="/c/"] > .ho-emoji-badge.ho-emoji-empty[data-ho-emoji-ctx="side"]::before',
  },
  {
    owner: '9A1b',
    control: 'Heat Pill',
    key: 'list',
    selector: 'body[data-ho-theme-enabled="true"] :is(aside, nav[aria-label*="chat" i], #stage-slideover-sidebar) .ho-colorbtn-side[data-ho-heat-pill-owner="9A1b"]',
  },
]);

for (const restoration of restorations) {
  assert.ok(source[restoration.key].replace(/\s+/gu, ' ').includes(restoration.selector),
    `${restoration.owner} owns the themed restoration for its ${restoration.control}`);
  for (const reset of genericResets) {
    assert.ok(compareSpecificity(specificity(restoration.selector), specificity(reset)) > 0,
      `${restoration.owner} ${restoration.control} outranks the generic Themes reset "${reset}"`);
  }
  for (const reset of idScopedResets) {
    assert.ok(compareSpecificity(specificity(restoration.selector), specificity(reset)) > 0,
      `${restoration.owner} ${restoration.control} outranks the id-scoped Themes reset "${reset}"`);
  }
}

// Negative control: the ownership hook and the live sidebar id are both load
// bearing. Drop either and the restoration must stop outranking the reset that
// governs the docked rows, so a future "simplification" cannot silently ship a
// selector that leaves the controls transparent again.
const strongestIdReset = idScopedResets.slice().sort(compareSpecificity).pop();
for (const [label, weakened] of Object.entries({
  'without the owner hook': 'body[data-ho-theme-enabled="true"] :is(aside, nav[aria-label*="chat" i]) .ho-colorbtn-side',
  'without the live sidebar id': 'body[data-ho-theme-enabled="true"] :is(aside, nav[aria-label*="chat" i]) .ho-colorbtn-side[data-ho-heat-pill-owner="9A1b"]',
})) {
  assert.ok(compareSpecificity(specificity(weakened), specificity(strongestIdReset)) <= 0,
    `a restoration ${label} must lose to the id-scoped Themes reset (negative control)`);
}

for (const key of ['auto', 'list']) {
  assert.doesNotMatch(source[key], /\[role="button"\]\)?::(?:before|after)/u,
    'the repair restores only its own controls and never re-opens the generic Themes sidebar reset');
  assert.doesNotMatch(source[key], /(?:set|remove)Attribute\(\s*['"]data-ho-theme-enabled/u,
    'the repair reads the Themes state purely as a CSS scope and never mutates Themes');
}

assert.match(source.list, /btn\.dataset\.hoHeatPillOwner = "9A1b"/u,
  'the existing Heat Pill decoration path stamps the ownership hook the restoration selects on');
assert.equal((source.list.match(/dataset\.hoHeatPillOwner/gu) || []).length, 1,
  'exactly one Heat Pill ownership stamp exists, so no second Heat Pill implementation appears');
assert.match(source.auto, /setBadgeDisplay\(badge, badgeEmoji, 'side'\)/u,
  'sidebar placeholders carry the side context the themed restoration is scoped to');
assert.match(source.auto, /entry\.insertBefore\(badge, entry\.firstChild\)/u,
  'the sidebar placeholder stays a direct child of the chat anchor the restoration targets');

const themedPlaceholder = cssRuleBody(source.auto, 'a\\[href\\*="/c/"\\] > \\.ho-emoji-badge\\.ho-emoji-empty\\[data-ho-emoji-ctx="side"\\]::before');
assert.equal(cssDeclaration(themedPlaceholder, 'background'),
  cssDeclaration(cssRuleBody(source.auto, '\\.ho-emoji-badge\\.ho-emoji-empty::before'), 'background'),
  'the themed placeholder repaints the established glyph fill rather than inventing a new one');
assert.doesNotMatch(themedPlaceholder, /mask/iu,
  'the themed placeholder leaves the distinct empty-icon masks untouched');

for (const state of ['off', 'warm', 'hot']) {
  const baseline = cssRuleBody(source.list, `\\.ho-colorbtn\\.ho-heat-${state}`);
  const themed = cssRuleBody(source.list, `\\.ho-colorbtn-side\\[data-ho-heat-pill-owner="9A1b"\\]\\.ho-heat-${state}`);
  for (const property of ['border-color', 'box-shadow']) {
    assert.equal(cssDeclaration(themed, property), cssDeclaration(baseline, property),
      `the themed Heat Pill restores the established ${state} ${property} rather than a second heat design`);
  }
}

const themedHotCore = cssRuleBody(source.list, '\\.ho-colorbtn-side\\[data-ho-heat-pill-owner="9A1b"\\]\\.ho-heat-hot::before');
const baselineHotCore = cssRuleBody(source.list, '\\.ho-colorbtn\\.ho-heat-hot::before');
for (const property of ['background', 'box-shadow']) {
  assert.equal(cssDeclaration(themedHotCore, property), cssDeclaration(baselineHotCore, property),
    `the themed Heat Pill restores the established hot ${property} rather than a second heat design`);
}

// The whole owner restoration has to carry the live sidebar id, not just the
// one rule spot-checked above. A leftover id-less owner scope would paint in
// some presentation modes and stay invisible in others.
assert.doesNotMatch(source.list, /:is\(aside, nav\[aria-label\*="chat" i\]\)(?!\s*,)/u,
  'every 9A1b owner restoration scope names the live docked sidebar container');
assert.doesNotMatch(source.auto, /:is\(aside, nav\[aria-label\*="chat" i\]\)(?!\s*,)/u,
  'the 9D1a owner restoration scope names the live docked sidebar container');

// Heat scoring and state stay with the 9A1a kernel. 9A1b restores paint only.
assert.match(source.kernel, /btn\.classList\.add\("ho-heat-" \+ api\.heat\.getLevel\(chatId\)\)/u,
  '9A1a remains the Heat Pill state authority that assigns the heat level class');
assert.doesNotMatch(source.list, /classList\.(?:add|toggle|remove)\(\s*["'][^"']*ho-heat/u,
  '9A1b never assigns or clears a heat class, so restoring paint cannot alter heat state');
assert.doesNotMatch(source.list, /api\.heat\.(?:set|compute|score)/u,
  '9A1b never writes Heat Pill scoring');

// Fresh-load lifecycle: the badge scan must not sit behind the resettable
// debounce, and must come to rest on its own rather than re-scanning per frame.
assert.match(source.auto, /function scheduleSidebarBadgeScan\(\)\{[\s\S]*if \(sidebarBadgeScanRaf\) return;[\s\S]*requestAnimationFrame\(/u,
  'the initial sidebar scan is coalesced through one guarded animation frame');
assert.match(source.auto, /const signature = sidebarBadgeScanState\(\);\s*if \(signature === sidebarBadgeScanSignature\) return;/u,
  'a settled sidebar stops re-scanning, so the scan cannot become a per-frame loop');
assert.match(source.auto, /scheduleSidebarMenuAugmentation\(\);[\s\S]{0,320}scheduleSidebarBadgeScan\(\);\s*clearTimeout\(t\);/u,
  'the sidebar scan is queued off the debounce that unrelated mutations keep resetting');
assert.match(source.auto, /t = setTimeout\(\(\) => \{\s*maybeAutoEmojiRename\(\);\s*\}, 110\);/u,
  'automatic emoji assignment still waits behind the title-stability debounce');
assert.equal((source.auto.match(/scheduleSidebarBadgeScan\(\)/gu) || []).length, 2,
  'exactly one definition and one call site exist, so no duplicate scan path is installed');
assert.doesNotMatch(source.auto, /setInterval\(/u,
  'the lifecycle uses observers and coalesced frames, never polling');

console.log('validate-auto-emoji-title-controls: ok');
