#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const rel = {
  hub: 'src-runtime-base/0Z1a.⬛️🕹️ Control Hub 🕹️.js',
  interfaceTab: 'src-runtime-base/0Z1h.⚫️🖥️🕹️ Interface Tab (Control Hub 🔌 Plugin) 🕹️.js',
  controls: 'src-runtime-base/0Z1p.⚫️🖥️🕹️ Interface Controls (Control Hub 🔌 Plugin) 🕹️.js',
  title: 'src-runtime-base/9C1a.🟤📌 Title Under Input bar 📌.js',
};
const source = Object.fromEntries(Object.entries(rel).map(([key, file]) => [key, fs.readFileSync(path.join(root, file), 'utf8')]));

function extractFunction(text, name) {
  const marker = `function ${name}(`;
  const start = text.indexOf(marker);
  assert.ok(start >= 0, `${name} declaration missing`);
  const open = text.indexOf(') {', start) + 2;
  assert.ok(open > start + 1, `${name} body opening missing`);
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  throw new Error(`${name} body is unterminated`);
}

const subtabBlock = source.interfaceTab.match(/const INTERFACE_SUBTABS = Object\.freeze\(\[([\s\S]*?)\n\s*\]\);/)?.[1] || '';
const labels = [...subtabBlock.matchAll(/label:\s*'([^']+)'/g)].map((match) => match[1]);
assert.deepEqual(labels, ['Chat List', 'Chat Meta', 'Chat Title', 'Internal Chat Title', 'Timestamps'],
  'Interface subtabs retain their names and place Internal Chat Title between Chat Title and Timestamps');
assert.match(subtabBlock, /label:\s*'Internal Chat Title'[\s\S]*default:\s*'Control the internal chat title bar shown underneath the ChatGPT input\.'/,
  'the permanent subtab carries the requested description');

const controlsBlock = source.controls.match(/const INTERNAL_CHAT_TITLE_CONTROLS = Object\.freeze\(\[([\s\S]*?)\n\s*\]\);/)?.[1] || '';
assert.match(controlsBlock, /type:\s*'range'/, 'width is rendered with the Control Hub range component');
assert.match(controlsBlock, /label:\s*'Internal chat title width'/, 'width control has the requested label');
assert.match(controlsBlock, /group:\s*'Layout'/, 'the first extensible section is Layout');
assert.match(controlsBlock, /help:\s*'Set the minimum width of the internal title bar\. Long titles can expand it automatically up to 90%\.'/,
  'width control explains its base-width semantics and adaptive cap');
assert.match(controlsBlock, /def:\s*DEFAULT_INTERNAL_CHAT_TITLE_WIDTH[\s\S]*min:\s*60[\s\S]*max:\s*90[\s\S]*step:\s*0\.5[\s\S]*unit:\s*'%'/,
  'base-width range is 60–90%, step 0.5%, defaulted canonically');
assert.match(controlsBlock, /getOwner\(\)\?\.getInternalChatTitleSettings/, 'Control Hub reads through the Interface settings authority');
assert.match(controlsBlock, /getOwner\(\)\?\.setInternalChatTitleSetting\?\.\('widthPct',\s*value,\s*'control-hub'\)/,
  'Control Hub writes through the Interface settings authority');
assert.match(controlsBlock, /type:\s*'toggle'[\s\S]*label:\s*'Show project'[\s\S]*group:\s*'Content'[\s\S]*help:\s*'Show the current project in the internal chat title bar\.'[\s\S]*def:\s*true/,
  'Content exposes the requested default-on Show project toggle');
assert.match(controlsBlock, /setInternalChatTitleSetting\?\.\('showProject',\s*!!value,\s*'control-hub'\)/,
  'Show project writes through the canonical Internal Chat Title settings authority');
assert.match(controlsBlock, /type:\s*'toggle'[\s\S]*label:\s*'Hide ChatGPT disclaimer'[\s\S]*group:\s*'Native ChatGPT'[\s\S]*help:\s*'Hide the native “ChatGPT can make mistakes\. Check important info\.” message above the composer\.'[\s\S]*def:\s*true/,
  'Native ChatGPT exposes the requested default-on disclaimer toggle');
assert.match(controlsBlock, /setInternalChatTitleSetting\?\.\('hideNativeDisclaimer',\s*!!value,\s*'control-hub'\)/,
  'Hide disclaimer writes through the canonical Internal Chat Title settings authority');
assert.match(source.hub, /const out = parseFloat\(inp\.value\);/, 'the shared range renderer preserves fractional steps');

assert.match(source.interfaceTab, /const KEY_INTERNAL_CHAT_TITLE_SETTINGS_V1 = 'h2o:prm:cgx:interface:internal-chat-title:v1'/,
  'the Interface owner declares one canonical persisted setting key');
assert.match(source.interfaceTab, /subscribeInternalChatTitleSettings/, 'the Interface owner exposes change subscriptions');
assert.match(source.title, /W\.H2O\?\.Surface\?\.Interface/, '9C1a reads the established Interface owner API');
assert.match(source.title, /api\.getInternalChatTitleSettings\(\)/, '9C1a reads the canonical presentation preference');
assert.match(source.title, /api\.subscribeInternalChatTitleSettings\(applyInternalChatTitleSettings\)/,
  '9C1a subscribes to live presentation changes');
assert.match(source.title, /labelEl\?\.style\?\.setProperty\?\.\('--ho-internal-title-base-width',\s*`\$\{widthPct\}%`\)/,
  '9C1a applies the persisted base width only to its owned under-input title element');
assert.match(source.title, /labelEl\?\.setAttribute\?\.\('data-ho-show-project',\s*showProject \? '1' : '0'\)/,
  '9C1a applies Show project as presentation state on its owned title element');
assert.match(source.title, /\.ho-tab-title-under-input\[data-ho-show-project="0"\]\s+\.ho-title-project\s*\{[\s\S]*?display:\s*none/,
  'Show project off hides only the project presentation segment');
assert.match(source.title, /'ho-title-text ho-title-placeholder-title'\s*:\s*'ho-title-text'/,
  'chat title presentation remains present');
assert.match(source.title, /className = 'ho-title-edit-dot'/, 'three-dot control remains present');
assert.match(source.title, /querySelector\('#thread-bottom-container'\)\?\.closest\?\.\('\.composer-parent'\)/,
  'native disclaimer discovery is scoped to the active composer/footer root');
assert.match(source.title, /querySelector\?\.\('\[data-testid="thread-disclaimer"\]'\)/,
  'native disclaimer discovery uses ChatGPT’s narrow structural owner marker');
assert.match(source.title, /norm\(candidate\.textContent\) === NATIVE_DISCLAIMER_TEXT/,
  'the structural disclaimer candidate must also match the exact expected semantics');
assert.match(source.title, /nativeDisclaimerEl\.setAttribute\('data-ho-native-disclaimer-hidden',\s*'1'\)/,
  'the default-on preference hides only the scoped native disclaimer element');
assert.match(source.title, /nativeDisclaimerEl\.removeAttribute\('data-ho-native-disclaimer-hidden'\)/,
  'turning the preference off restores the native disclaimer immediately');
assert.match(source.title, /bodyObserver = new MutationObserver\(\(\) => \{[\s\S]*scheduleNativeDisclaimerVisibility\(\)/,
  'the existing 9C1a lifecycle reapplies disclaimer visibility after native rerenders');
const settingsConsumerBlock = source.title.match(/function applyInternalChatTitleSettings\(settings\)\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
assert.doesNotMatch(settingsConsumerBlock, /H2O\.Projects|moveChatToProject|projectId\s*=/,
  'content preferences cannot mutate canonical Project state');
assert.doesNotMatch(source.title, /document\.body\.textContent|D\.body\.textContent/,
  'disclaimer discovery never performs a broad document text scan');
assert.doesNotMatch(source.title, /localStorage.*internal-chat-title|internal-chat-title.*localStorage/,
  '9C1a does not own persistence');

const visibleRule = source.title.match(/\.ho-tab-title-under-input\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
assert.match(visibleRule, /position:\s*absolute/, 'the internal title is removed from composer-stack layout flow');
assert.match(visibleRule, /left:\s*50%[\s\S]*top:\s*calc\(100% \+ 3px\)[\s\S]*transform:\s*translateX\(-50%\)/,
  'the internal title is centered in the native space immediately below its composer host');
assert.match(visibleRule, /width:\s*min\(90%,\s*var\(--ho-internal-title-rendered-width,\s*var\(--ho-internal-title-base-width,\s*60%\)\)\)/,
  'the internal title uses a measured adaptive width with a hard container-relative 90% cap');
assert.match(visibleRule, /min-height:\s*18px[\s\S]*height:\s*18px[\s\S]*padding:\s*0 6px/,
  'the title uses a slimmer 18 px native-footer presentation');
assert.match(source.title, /\.ho-title-project\s*\{[\s\S]*?width:\s*var\(--ho-internal-title-project-width, auto\)[\s\S]*?flex:\s*0 0 var\(--ho-internal-title-project-width, auto\)/,
  'the project segment remains independently fixed and compact while the title drives growth');
assert.match(source.title, /function measureProjectPresentationWidth\(project, baseOuterWidth\)[\s\S]*Math\.min\(180,[\s\S]*baseOuterWidth[^\n]*\* 0\.4,[\s\S]*naturalWidth\)/,
  'project presentation width is capped from its natural size and selected base, not adaptive outer growth');
assert.match(source.title, /\.ho-title-main\s*\{[\s\S]*?flex:\s*1 1 auto[\s\S]*?overflow:\s*hidden/,
  'the title region receives the remaining adaptive width');
assert.match(source.title, /\.ho-title-text\s*\{[\s\S]*?white-space:\s*nowrap[\s\S]*?overflow:\s*hidden[\s\S]*?text-overflow:\s*clip/,
  'very long titles clip on one line without changing canonical text');
assert.match(source.title, /new W\.ResizeObserver\(\(\) => scheduleAdaptiveInternalTitleWidth\(\)\)[\s\S]*internalTitleResizeObserver\.observe\(host\)/,
  'adaptive sizing observes only the composer host and coalesces geometry updates');
assert.match(source.title, /return rangeWidth > 0 \? rangeWidth : \(element\.scrollWidth \|\| 0\)/,
  'intrinsic title measurement does not mistake allocated flex width for text demand');
assert.doesNotMatch(source.title, /internalTitleResizeObserver\.observe\((?:labelEl|titleContent)/,
  'adaptive sizing does not observe its own painted width');
assert.match(source.title, /\[data-ho-internal-title-host="1"\][\s\S]*position:\s*relative[\s\S]*overflow:\s*visible/,
  'the Title-owned host marker establishes stable composer-relative positioning');
assert.match(source.title, /let parent = getComposerContainer\(\) \|\| getDisclaimerContainer\(\)/,
  'the actual composer container is the primary native-space host');
assert.match(source.title, /titleHostEl\.setAttribute\('data-ho-internal-title-host',\s*'1'\)/,
  '9C1a marks only its current composer host for positioning');
assert.match(source.title, /function isCurrentTitleSurface\(label, host, parent\)[\s\S]*label\?\.isConnected[\s\S]*label\.parentElement === parent[\s\S]*host\?\.isConnected[\s\S]*host === parent/,
  'mounted state requires one connected title owned by the current connected composer host');
assert.match(source.title, /if \(labelEl && !isCurrentTitleSurface\(labelEl, titleHostEl, parent\)\)[\s\S]*labelEl = null/,
  'a detached or replaced composer surface is invalidated before deterministic remount');
assert.match(source.title, /bodyObserver = new MutationObserver\(\(\) => \{[\s\S]*refreshPresentationSoon\('composer-dom-mutation'\)/,
  'composer DOM readiness schedules a coalesced presentation remount instead of waiting for title-state changes');
assert.match(source.title, /if \(destroyed \|\| presentationRefreshRaf\) return[\s\S]*requestAnimationFrame\(\(\) =>/,
  'repeated SPA mutations coalesce into one lifecycle refresh');
assert.match(source.title, /W\.addEventListener\('evt:h2o:projects:changed', onProjectsChanged\)/,
  'canonical Projects readiness drives presentation refresh through the public change signal');
assert.match(source.title, /function readProjectMeta\(\)[\s\S]*resolveCanonicalProjectMeta\(projectRowsFromStore\(\), id\)/,
  'project presentation resolves exclusively from canonical Projects rows');
assert.doesNotMatch(source.title, /title:\s*title \|\| 'Project'/,
  'unresolved metadata never renders a bare Project placeholder');
assert.doesNotMatch(extractFunction(source.title, 'readProjectMeta'), /querySelector\(/,
  'project metadata resolution does not scrape sidebar labels');
assert.doesNotMatch(source.title, /(?:9B1a|9B2a|document\.title).*--ho-internal-title-width/,
  'the presentation preference does not target tab or sidebar title consumers');
assert.match(source.title, /openTitleMenu\(/, 'existing Rename/menu flow remains wired');
assert.match(source.title, /openProjectChooser\(/, 'existing project picker remains wired');
assert.match(source.title, /openMoveConfirmation\(/, 'existing move confirmation remains wired');

const storage = new Map();
const listeners = new Map();
const localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(String(key), String(value)); },
};
const window = {
  H2O: {},
  localStorage,
  addEventListener(type, listener) {
    const bucket = listeners.get(type) || [];
    bucket.push(listener);
    listeners.set(type, bucket);
  },
  dispatchEvent(event) {
    for (const listener of listeners.get(event.type) || []) listener(event);
    return true;
  },
  setTimeout() { return 1; },
  clearTimeout() {},
  setInterval() { return 1; },
  clearInterval() {},
};
window.top = window;
class CustomEvent {
  constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
}
const sandbox = {
  window,
  document: {},
  CustomEvent,
  Object,
  String,
  Number,
  Math,
  JSON,
  Set,
  console,
};
vm.createContext(sandbox);
vm.runInContext(source.interfaceTab, sandbox, { filename: rel.interfaceTab });
const api = window.H2O.Surface.Interface;
assert.equal(api.getInternalChatTitleSettings().widthPct, 60, 'missing state defaults to a 60% base width');
assert.equal(api.getInternalChatTitleSettings().showProject, true, 'missing state defaults Show project on');
assert.equal(api.getInternalChatTitleSettings().hideNativeDisclaimer, true, 'missing state defaults Hide disclaimer on');
assert.deepEqual(JSON.parse(JSON.stringify(api.internalChatTitleSettingSpec.widthPct)), { default: 60, min: 60, max: 90, step: 0.5 },
  'the public setting contract exposes its exact bounds');
assert.deepEqual(JSON.parse(JSON.stringify(api.internalChatTitleSettingSpec.showProject)), { default: true },
  'the public setting contract exposes the Show project default');
assert.deepEqual(JSON.parse(JSON.stringify(api.internalChatTitleSettingSpec.hideNativeDisclaimer)), { default: true },
  'the public setting contract exposes the Hide disclaimer default');
const observed = [];
const unsubscribe = api.subscribeInternalChatTitleSettings((settings) => observed.push(settings.widthPct));
api.setInternalChatTitleSetting('widthPct', 72.5, 'validator');
assert.equal(api.getInternalChatTitleSettings().widthPct, 72.5, 'a fractional value survives persisted-state roundtrip');
assert.equal(JSON.parse(storage.get(api.internalChatTitleSettingSpec.storageKey)).widthPct, 72.5,
  'the canonical owner persists the selected percentage');
assert.deepEqual(observed, [60, 72.5], 'subscribers receive initial and live base-width states');
unsubscribe();
api.setInternalChatTitleSetting('showProject', false, 'validator');
api.setInternalChatTitleSetting('hideNativeDisclaimer', false, 'validator');
assert.equal(api.getInternalChatTitleSettings().showProject, false, 'Show project survives persisted-state roundtrip');
assert.equal(api.getInternalChatTitleSettings().hideNativeDisclaimer, false, 'Hide disclaimer survives persisted-state roundtrip');
assert.deepEqual(JSON.parse(storage.get(api.internalChatTitleSettingSpec.storageKey)), {
  widthPct: 72.5,
  showProject: false,
  hideNativeDisclaimer: false,
}, 'one canonical record persists width and both content preferences');
storage.set(api.internalChatTitleSettingSpec.storageKey, JSON.stringify({ widthPct: 75 }));
assert.deepEqual(JSON.parse(JSON.stringify(api.getInternalChatTitleSettings())), {
  widthPct: 75,
  showProject: true,
  hideNativeDisclaimer: true,
}, 'legacy width-only v1 state additively hydrates both new defaults without losing width');
api.setInternalChatTitleSetting('widthPct', 100, 'validator');
assert.equal(api.getInternalChatTitleSettings().widthPct, 90, 'legacy 100% state clamps to the new 90% cap');
api.setInternalChatTitleSetting('widthPct', 20, 'validator');
assert.equal(api.getInternalChatTitleSettings().widthPct, 60, 'values below the base-width floor clamp to 60%');
storage.set(api.internalChatTitleSettingSpec.storageKey, JSON.stringify({
  widthPct: 'invalid',
  showProject: 'invalid',
  hideNativeDisclaimer: null,
}));
assert.equal(api.getInternalChatTitleSettings().widthPct, 60, 'invalid stored values fail closed to the accepted default');
assert.equal(api.getInternalChatTitleSettings().showProject, true, 'invalid Show project state fails closed to on');
assert.equal(api.getInternalChatTitleSettings().hideNativeDisclaimer, true, 'invalid Hide disclaimer state fails closed to on');

const adaptiveSandbox = { Math, Number };
adaptiveSandbox.globalThis = adaptiveSandbox;
vm.createContext(adaptiveSandbox);
vm.runInContext(
  `${extractFunction(source.title, 'normalizeInternalChatTitleWidth')}\n` +
  `${extractFunction(source.title, 'computeAdaptiveInternalTitleWidth')}\n` +
  'globalThis.computeAdaptive = computeAdaptiveInternalTitleWidth;',
  adaptiveSandbox,
  { filename: rel.title }
);
const computeAdaptive = adaptiveSandbox.computeAdaptive;
assert.equal(computeAdaptive({ composerWidth: 800, basePct: 60, titleIntrinsicWidth: 250, fixedWidth: 100 }), 480,
  'a short title remains at the selected base width');
assert.equal(computeAdaptive({ composerWidth: 800, basePct: 60, titleIntrinsicWidth: 430, fixedWidth: 100 }), 530,
  'a longer title expands only by the title space it needs');
assert.equal(computeAdaptive({ composerWidth: 800, basePct: 60, titleIntrinsicWidth: 900, fixedWidth: 100 }), 720,
  'a very long title stops at 90% of its composer');
assert.equal(computeAdaptive({ composerWidth: 500, basePct: 75, titleIntrinsicWidth: 600, fixedWidth: 100 }), 450,
  'a narrow composer retains the same 90% cap');
assert.equal(api.getInternalChatTitleSettings().widthPct, 60,
  'adaptive rendering never writes back over the persisted base width');

const lifecycleSandbox = { Array, Map, String };
lifecycleSandbox.globalThis = lifecycleSandbox;
vm.createContext(lifecycleSandbox);
vm.runInContext(
  `${extractFunction(source.title, 'norm')}\n` +
  `${extractFunction(source.title, 'normalizeProjectHref')}\n` +
  `${extractFunction(source.title, 'projectIdentityRoot')}\n` +
  `${extractFunction(source.title, 'resolveCanonicalProjectMeta')}\n` +
  `${extractFunction(source.title, 'isCurrentTitleSurface')}\n` +
  'globalThis.resolveProject = resolveCanonicalProjectMeta; globalThis.isCurrent = isCurrentTitleSurface;',
  lifecycleSandbox,
  { filename: rel.title }
);
const oldHost = { isConnected: false };
const oldLabel = { isConnected: false, parentElement: oldHost };
const currentHost = { isConnected: true };
const currentLabel = { isConnected: true, parentElement: currentHost };
assert.equal(lifecycleSandbox.isCurrent(oldLabel, oldHost, currentHost), false,
  'a detached old title cannot satisfy mounted state');
assert.equal(lifecycleSandbox.isCurrent(currentLabel, currentHost, currentHost), true,
  'exact current-host ownership satisfies mounted state');
assert.equal(lifecycleSandbox.isCurrent(currentLabel, currentHost, { isConnected: true }), false,
  'returning to the same chat still requires remount when the composer host changed');
const canonicalRows = [{
  id: 'g-p-694c441066b08191add4a7c3293f5e7a-2-h2o-studying',
  href: '/g/g-p-694c441066b08191add4a7c3293f5e7a-2-h2o-studying/project',
  title: '#\ufe0f\u20e3\ud83d\udd35 2. H2O Studying \ud83d\udcda',
}];
assert.equal(lifecycleSandbox.resolveProject(canonicalRows, 'g-p-694c441066b08191add4a7c3293f5e7a').title,
  '#\ufe0f\u20e3\ud83d\udd35 2. H2O Studying \ud83d\udcda',
  'stable route identity resolves the unique canonical slugged project row');
assert.equal(lifecycleSandbox.resolveProject([], 'g-p-694c441066b08191add4a7c3293f5e7a'), null,
  'unready canonical project metadata omits the segment');
assert.equal(lifecycleSandbox.resolveProject([{ ...canonicalRows[0], title: '' }], 'g-p-694c441066b08191add4a7c3293f5e7a'), null,
  'a project row without a canonical name cannot become a bare placeholder');
assert.equal(lifecycleSandbox.resolveProject([
  canonicalRows[0],
  { ...canonicalRows[0], id: `${canonicalRows[0].id}-duplicate`, href: `${canonicalRows[0].href}?duplicate=1` },
], 'g-p-694c441066b08191add4a7c3293f5e7a'), null,
  'ambiguous identity-root metadata fails closed rather than reusing a stale name');

console.log('validate-internal-chat-title-controls: ok');
