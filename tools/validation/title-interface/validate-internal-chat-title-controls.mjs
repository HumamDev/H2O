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
assert.match(controlsBlock, /help:\s*'Adjust the width of the internal title bar underneath the input\.'/,
  'width control has the requested helper text');
assert.match(controlsBlock, /def:\s*DEFAULT_INTERNAL_CHAT_TITLE_WIDTH[\s\S]*min:\s*60[\s\S]*max:\s*100[\s\S]*step:\s*0\.5[\s\S]*unit:\s*'%'/,
  'width range is 60–100%, step 0.5%, defaulted canonically');
assert.match(controlsBlock, /getOwner\(\)\?\.getInternalChatTitleSettings/, 'Control Hub reads through the Interface settings authority');
assert.match(controlsBlock, /getOwner\(\)\?\.setInternalChatTitleSetting\?\.\('widthPct',\s*value,\s*'control-hub'\)/,
  'Control Hub writes through the Interface settings authority');
assert.match(source.hub, /const out = parseFloat\(inp\.value\);/, 'the shared range renderer preserves fractional steps');

assert.match(source.interfaceTab, /const KEY_INTERNAL_CHAT_TITLE_SETTINGS_V1 = 'h2o:prm:cgx:interface:internal-chat-title:v1'/,
  'the Interface owner declares one canonical persisted setting key');
assert.match(source.interfaceTab, /subscribeInternalChatTitleSettings/, 'the Interface owner exposes change subscriptions');
assert.match(source.title, /W\.H2O\?\.Surface\?\.Interface/, '9C1a reads the established Interface owner API');
assert.match(source.title, /api\.getInternalChatTitleSettings\(\)/, '9C1a reads the canonical presentation preference');
assert.match(source.title, /api\.subscribeInternalChatTitleSettings\(applyInternalChatTitleSettings\)/,
  '9C1a subscribes to live presentation changes');
assert.match(source.title, /labelEl\?\.style\?\.setProperty\?\.\('--ho-internal-title-width',\s*`\$\{widthPct\}%`\)/,
  '9C1a applies width only to its owned under-input title element');
assert.doesNotMatch(source.title, /localStorage.*internal-chat-title|internal-chat-title.*localStorage/,
  '9C1a does not own persistence');

const visibleRule = source.title.match(/\.ho-tab-title-under-input\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
assert.match(visibleRule, /position:\s*absolute/, 'the internal title is removed from composer-stack layout flow');
assert.match(visibleRule, /left:\s*50%[\s\S]*top:\s*calc\(100% \+ 1px\)[\s\S]*transform:\s*translateX\(-50%\)/,
  'the internal title is centered in the native space immediately below its composer host');
assert.match(visibleRule, /width:\s*min\(100%,\s*max\(var\(--ho-internal-title-width,\s*87\.5%\),\s*min\(320px,\s*100%\)\)\)/,
  'the internal title derives proportional width from its actual container with a safe floor');
assert.match(visibleRule, /min-height:\s*22px[\s\S]*height:\s*22px[\s\S]*padding:\s*1px 6px/,
  'the title uses a compact 22 px native-footer presentation');
assert.match(source.title, /\[data-ho-internal-title-host="1"\][\s\S]*position:\s*relative[\s\S]*overflow:\s*visible/,
  'the Title-owned host marker establishes stable composer-relative positioning');
assert.match(source.title, /let parent = getComposerContainer\(\) \|\| getDisclaimerContainer\(\)/,
  'the actual composer container is the primary native-space host');
assert.match(source.title, /titleHostEl\.setAttribute\('data-ho-internal-title-host',\s*'1'\)/,
  '9C1a marks only its current composer host for positioning');
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
assert.equal(api.getInternalChatTitleSettings().widthPct, 87.5, 'missing state defaults to 87.5%');
assert.deepEqual(JSON.parse(JSON.stringify(api.internalChatTitleSettingSpec.widthPct)), { default: 87.5, min: 60, max: 100, step: 0.5 },
  'the public setting contract exposes its exact bounds');
const observed = [];
const unsubscribe = api.subscribeInternalChatTitleSettings((settings) => observed.push(settings.widthPct));
api.setInternalChatTitleSetting('widthPct', 72.5, 'validator');
assert.equal(api.getInternalChatTitleSettings().widthPct, 72.5, 'a fractional value survives persisted-state roundtrip');
assert.equal(JSON.parse(storage.get(api.internalChatTitleSettingSpec.storageKey)).widthPct, 72.5,
  'the canonical owner persists the selected percentage');
assert.deepEqual(observed, [87.5, 72.5], 'subscribers receive initial and live states');
unsubscribe();
api.setInternalChatTitleSetting('widthPct', 100.5, 'validator');
assert.equal(api.getInternalChatTitleSettings().widthPct, 87.5, 'out-of-range writes fail closed to the accepted default');
storage.set(api.internalChatTitleSettingSpec.storageKey, JSON.stringify({ widthPct: 'invalid' }));
assert.equal(api.getInternalChatTitleSettings().widthPct, 87.5, 'invalid stored values fail closed to the accepted default');

console.log('validate-internal-chat-title-controls: ok');
