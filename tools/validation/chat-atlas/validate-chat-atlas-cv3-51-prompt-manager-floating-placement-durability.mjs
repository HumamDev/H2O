#!/usr/bin/env node
// CV-3.51 — Prompt Manager floating-placement durability.
// Executes the real 7A1a module in the established Prompt Manager lifecycle
// mini-DOM, with test-only counters injected into real function entry points.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = process.env.H2O_SRC_DIR
  ? path.resolve(process.env.H2O_SRC_DIR)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PRIMARY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MODULE_REL = 'src-runtime-base/7A1a.⬜️✍️ Prompt Manager ✍️.js';
const SOURCE = fs.readFileSync(path.join(REPO_ROOT, MODULE_REL), 'utf8');

const fixtures = [];
let assertions = 0;
const eq = (a, b, m) => { assertions += 1; assert.deepEqual(a, b, m); };
const ok = (v, m) => { assertions += 1; assert.ok(v, m); };
function fixture(group, name, fn) {
  try { fn(); fixtures.push({ group, name, ok: true }); }
  catch (error) { fixtures.push({ group, name, ok: false, error: String(error?.stack || error) }); }
}

function loadLifecycleHarness() {
  const validator = fs.readFileSync(
    path.join(PRIMARY_ROOT, 'tools/validation/prompt-manager/validate-prompt-manager-route-lifecycle.mjs'),
    'utf8',
  );
  const start = validator.indexOf("const VOID_TAGS = new Set(");
  const end = validator.indexOf('/* ══════════════════════════════ SCENARIOS');
  if (start < 0 || end <= start) throw new Error('TEST_HARNESS_BLOCKED:lifecycle-harness-boundary');
  let declarations = validator.slice(start, end);
  declarations = declarations.replace(
    'ready() { env.dock.ready++; return true; },',
    'ready() { env.dock.ready++; return opts.dockReady !== false; },',
  );
  declarations = declarations.replace(
    'ResizeObserver: class { observe() {} disconnect() {} },',
    `ResizeObserver: class {
      constructor(cb) { this.cb = cb; this.target = null; this.live = true; (env.resizeObservers ||= []).push(this); }
      observe(target) { this.target = target; }
      disconnect() { this.live = false; this.target = null; }
    },`,
  );
  declarations = declarations.replace(
    'if (opts.composer !== false) addComposer(env);',
    'if (opts.composer !== false) addComposer(env); if (typeof opts.beforeRun === "function") opts.beforeRun(env, El);',
  );
  const factory = new Function(
    'vm', 'TextEncoder', 'URL',
    `const MODULE_REL = ${JSON.stringify(MODULE_REL)}; ${declarations}; return { El, makeEnv, flushFrames, advance, settle, addComposer, roots, rootCount, modObj, pmState };`,
  );
  return factory(vm, TextEncoder, URL);
}

const H = loadLifecycleHarness();
if (!Object.getOwnPropertyDescriptor(H.El.prototype, 'nodeType')) {
  Object.defineProperty(H.El.prototype, 'nodeType', { get: () => 1 });
}
const originalRect = H.El.prototype.getBoundingClientRect;
H.El.prototype.getBoundingClientRect = function measuredRect() {
  const counters = this.env?.cv351RectCounts;
  if (counters) counters[kindOf(this)] = (counters[kindOf(this)] || 0) + 1;
  if (this.__cvRect) {
    const r = this.__cvRect;
    return { ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top };
  }
  return originalRect.call(this);
};
const originalQueryAll = H.El.prototype.querySelectorAll;
H.El.prototype.querySelectorAll = function measuredQueryAll(selector) {
  if (this.env?.cv351Queries) {
    if (String(selector) === '[data-composer-surface="true"]' && this.tagName === 'HTML') this.env.cv351Queries.surface += 1;
    if (this.tagName === 'HTML' && String(selector).includes('form[data-type="unified-composer"]')) this.env.cv351Queries.broadForm += 1;
  }
  return originalQueryAll.call(this, selector);
};

function kindOf(el) {
  if (!el) return 'other';
  if (el.tagName === 'FORM') return 'form';
  if (el.getAttribute?.('id') === 'prompt-textarea') return 'input';
  if (el.getAttribute?.('data-composer-surface') === 'true') return 'surface';
  if (el.getAttribute?.('data-cgxui') === 'prmn-btnbox') return 'buttonBox';
  if (el.getAttribute?.('data-testid') === 'send-button') return 'send';
  if (el.getAttribute?.('data-cgxui-owner') === 'nvcn') return 'nav';
  return 'other';
}

function instrumentSource(source) {
  let out = source;
  const replaceOne = (needle, replacement) => {
    const count = out.split(needle).length - 1;
    if (count !== 1) throw new Error(`TEST_HARNESS_BLOCKED:source-shape:${needle}:${count}`);
    out = out.replace(needle, replacement);
  };
  replaceOne(
    '  const D = document;',
    `  const D = document;
  W.__CV351 = {
    calls: { getForm: 0, anchor: 0, place: 0 },
    visible: { form: 0, input: 0, surface: 0, buttonBox: 0, send: 0, nav: 0, other: 0 },
    kind(el) {
      if (!el) return 'other';
      if (el.tagName === 'FORM') return 'form';
      if (el.getAttribute?.('id') === 'prompt-textarea') return 'input';
      if (el.getAttribute?.('data-composer-surface') === 'true') return 'surface';
      if (el.getAttribute?.('data-cgxui') === 'prmn-btnbox') return 'buttonBox';
      if (el.getAttribute?.('data-testid') === 'send-button') return 'send';
      if (el.getAttribute?.('data-cgxui-owner') === 'nvcn') return 'nav';
      return 'other';
    },
  };`,
  );
  out = out.replace(
    /  const DOM_isVisible = \(([^)]*)\) => \{/u,
    '  const DOM_isVisible = ($1) => { const __k = W.__CV351.kind(el); W.__CV351.visible[__k] += 1;',
  );
  out = out.replace(/  const DOM_getForm = \(([^)]*)\) => \{/u, '  const DOM_getForm = ($1) => { W.__CV351.calls.getForm += 1;');
  out = out.replace(/  const DOM_getComposerAnchorRect = \(([^)]*)\) => \{/u, '  const DOM_getComposerAnchorRect = ($1) => { W.__CV351.calls.anchor += 1;');
  out = out.replace(
    /  function UI_PM_placeFloatingRoot\(([^)]*)\) \{/u,
    '  function UI_PM_placeFloatingRoot($1) { W.__CV351.calls.place += 1;',
  );
  replaceOne(
    '      version: MOD_VERSION,',
    `      version: MOD_VERSION,
      cv351: Object.freeze({
        get selfHealTimer() { return PM_SELF_HEAL_TIMER; },
        get layoutRaf() { return PM_LAYOUT_RAF; },
        scheduleLayout: UI_PM_scheduleFloatingLayout,
        beginOwnedAttribute: typeof CORE_PM_beginOwnedAttribute === 'function' ? CORE_PM_beginOwnedAttribute : () => null,
        finishOwnedAttribute: typeof CORE_PM_finishOwnedAttribute === 'function' ? CORE_PM_finishOwnedAttribute : () => {},
      }),`,
  );
  if (
    !out.includes('W.__CV351.visible[__k] += 1') ||
    !out.includes('W.__CV351.calls.getForm += 1') ||
    !out.includes('W.__CV351.calls.anchor += 1') ||
    !out.includes('W.__CV351.calls.place += 1')
  ) {
    throw new Error('TEST_HARNESS_BLOCKED:instrumentation-entry-point');
  }
  return out;
}

function exactComposer(env, El) {
  const form = env.document.querySelector('form[data-testid="composer"]');
  const input = env.document.getElementById('prompt-textarea');
  const send = form?.querySelector('button[data-testid="send-button"]');
  const surface = new El('div', env);
  surface.setAttribute('data-composer-surface', 'true');
  form.removeChild(input);
  surface.appendChild(input);
  form.insertBefore(surface, send);
  form.__cvRect = { left: 300, top: 650, width: 680, height: 150 };
  input.__cvRect = { left: 330, top: 690, width: 600, height: 52 };
  surface.__cvRect = { left: 310, top: 670, width: 650, height: 110 };
  send.__cvRect = { left: 920, top: 700, width: 36, height: 36 };
}

function makeEnv({ composer = true } = {}) {
  const env = H.makeEnv(instrumentSource(SOURCE), {
    pathname: '/c/cv351-chat', composer, dockReady: false,
    beforeRun: composer ? exactComposer : undefined,
  });
  H.settle(env);
  if (env.threw) throw env.threw;
  resetCounters(env);
  return env;
}

function resetCounters(env) {
  const hook = env.window.__CV351;
  hook.calls.getForm = 0; hook.calls.anchor = 0; hook.calls.place = 0;
  for (const key of Object.keys(hook.visible)) hook.visible[key] = 0;
  env.cv351RectCounts = { form: 0, input: 0, surface: 0, buttonBox: 0, send: 0, nav: 0, other: 0 };
  env.cv351Queries = { surface: 0, broadForm: 0 };
}

const testHook = (env) => H.modObj(env)?.__test?.cv351;
const selfHealObserver = (env) => env.observers.find((observer) =>
  observer.live && observer.targets.some(({ o }) => !!o?.childList && !!o?.attributes));
function deliver(env, records) {
  const observer = selfHealObserver(env);
  if (!observer) throw new Error('self-heal observer unavailable');
  observer.cb(records, observer);
}
function attr(target, attributeName, oldValue = null) {
  return { type: 'attributes', target, attributeName, oldValue, addedNodes: [], removedNodes: [] };
}
function child(target, addedNodes = [], removedNodes = []) {
  return { type: 'childList', target, addedNodes, removedNodes };
}
const rootOf = (env) => H.roots(env)[0] || null;
const formOf = (env) => env.document.querySelector('form[data-testid="composer"]');
const pending = (env) => ({ selfHeal: testHook(env)?.selfHealTimer || 0, layout: testHook(env)?.layoutRaf || 0 });
const calls = (env) => ({
  getForm: env.window.__CV351.calls.getForm,
  anchor: env.window.__CV351.calls.anchor,
  place: env.window.__CV351.calls.place,
});
const placementReads = (env) =>
  Object.values(env.window.__CV351.visible).reduce((sum, value) => sum + value, 0) +
  Object.values(env.cv351RectCounts).reduce((sum, value) => sum + value, 0);
const drain = (env, ms = 300) => H.advance(env, ms);
const observed = { redC: null };

fixture('RED_A', 'foreign childList, class and style churn admit nothing', () => {
  for (const mode of ['childList', 'class', 'style']) {
    const env = makeEnv();
    const noise = new H.El('div', env); noise.setAttribute('data-cv351-noise', mode); env.body.appendChild(noise);
    resetCounters(env);
    deliver(env, mode === 'childList' ? [child(env.body, [noise], [])] : [attr(noise, mode)]);
    drain(env);
    eq({ pending: pending(env), calls: calls(env) }, {
      pending: { selfHeal: 0, layout: 0 }, calls: { getForm: 0, anchor: 0, place: 0 },
    }, `${mode}: irrelevant foreign mutation stays free`);
    eq(placementReads(env), 0, `${mode}: irrelevant mutation performs no visibility or geometry reads`);
  }
});

fixture('RED_A', 'harmless owned panel/list/editor/status/tooltip output admits nothing', () => {
  const env = makeEnv();
  const root = rootOf(env);
  const panel = root.querySelector('[data-cgxui="prmn-panel"]');
  const owned = new H.El('span', env); owned.setAttribute('data-cgxui-owner', 'prmn'); panel.appendChild(owned);
  resetCounters(env);
  deliver(env, [child(panel, [owned], []), attr(panel, 'class'), attr(owned, 'style')]);
  drain(env);
  eq({ pending: pending(env), calls: calls(env) }, {
    pending: { selfHeal: 0, layout: 0 }, calls: { getForm: 0, anchor: 0, place: 0 },
  }, 'owned rendering output is outside identity and placement authority');
  eq(placementReads(env), 0, 'harmless owned output performs no visibility or geometry reads');
});

fixture('RED_A', 'sustained irrelevant batches stay quiescent across timer/frame cycles', () => {
  const env = makeEnv();
  for (let i = 0; i < 8; i += 1) {
    const node = new H.El('span', env); env.body.appendChild(node);
    deliver(env, [child(env.body, [node], [])]);
    drain(env, 180);
  }
  eq({ pending: pending(env), calls: calls(env) }, {
    pending: { selfHeal: 0, layout: 0 }, calls: { getForm: 0, anchor: 0, place: 0 },
  }, 'irrelevant churn cannot sustain recovery or placement');
  eq(placementReads(env), 0, 'sustained irrelevant churn performs no visibility or geometry reads');
});

fixture('CONTROL', 'mixed own and foreign relevant records fail closed in either order', () => {
  for (const ownFirst of [true, false]) {
    const env = makeEnv();
    const rootRecord = attr(rootOf(env), 'style');
    const foreignRelevant = attr(formOf(env), 'class');
    resetCounters(env);
    deliver(env, ownFirst ? [rootRecord, foreignRelevant] : [foreignRelevant, rootRecord]);
    ok(testHook(env).selfHealTimer, `${ownFirst ? 'own-first' : 'foreign-first'} mixed batch admits relevant placement`);
    drain(env, 300);
    eq(env.window.__CV351.calls.place, 1, `${ownFirst ? 'own-first' : 'foreign-first'} mixed batch cannot hide foreign relevance`);
  }
});

fixture('CONTROL', 'same-target own and foreign attribute transitions fail closed in either order', () => {
  for (const ownFirst of [true, false]) {
    const env = makeEnv();
    const root = rootOf(env);
    const hook = testHook(env);
    const noise = new H.El('div', env);
    deliver(env, [attr(noise, 'class', '')]);
    root.setAttribute('style', 'initial');
    let records;
    if (ownFirst) {
      const token = hook.beginOwnedAttribute(root, 'style');
      root.setAttribute('style', 'owned');
      hook.finishOwnedAttribute(token);
      root.setAttribute('style', 'foreign');
      records = [attr(root, 'style', 'initial'), attr(root, 'style', 'owned')];
    } else {
      root.setAttribute('style', 'foreign');
      const token = hook.beginOwnedAttribute(root, 'style');
      root.setAttribute('style', 'owned');
      hook.finishOwnedAttribute(token);
      records = [attr(root, 'style', 'initial'), attr(root, 'style', 'foreign')];
    }
    resetCounters(env);
    deliver(env, records);
    ok(hook.selfHealTimer, `${ownFirst ? 'own-first' : 'foreign-first'} same-target batch admits foreign transition`);
    drain(env, 300);
    eq(env.window.__CV351.calls.place, 1, `${ownFirst ? 'own-first' : 'foreign-first'} same-target foreign evidence remains visible`);
  }
});

fixture('CONTROL', 'exact owned provenance expires with its observer delivery', () => {
  const env = makeEnv();
  const root = rootOf(env);
  resetCounters(env);
  deliver(env, [child(env.body, [root], [])]);
  eq({ pending: pending(env), place: env.window.__CV351.calls.place }, {
    pending: { selfHeal: 0, layout: 0 }, place: 0,
  }, 'exact owned added-node set is consumed once');
  testHook(env).scheduleLayout(root);
  H.flushFrames(env, 1);
  resetCounters(env);
  deliver(env, [attr(root, 'style')]);
  eq({ pending: pending(env), place: env.window.__CV351.calls.place }, {
    pending: { selfHeal: 0, layout: 0 }, place: 0,
  }, 'exact owned attribute serialization is consumed in its delivery');
  deliver(env, [attr(root, 'style')]);
  ok(testHook(env).selfHealTimer, 'the same unmatched later record is visible after provenance expiry');
  drain(env, 300);
  eq(env.window.__CV351.calls.place, 1, 'expired provenance cannot suppress later relevant evidence');
});

fixture('RED_B', 'owned root removal remains a recoverable identity event', () => {
  const env = makeEnv();
  const root = rootOf(env); root.remove();
  deliver(env, [child(env.body, [], [root])]);
  ok(testHook(env).selfHealTimer, 'root removal admits one recovery timer');
  drain(env, 800);
  eq(H.rootCount(env), 1, 'owned root remounts exactly once');
});

fixture('RED_B', 'detached composer removal remains admitted', () => {
  const env = makeEnv();
  const form = formOf(env); form.remove();
  deliver(env, [child(env.body, [], [form])]);
  ok(testHook(env).selfHealTimer, 'detached composer removal admits recovery');
  drain(env, 300);
  eq(form.parentElement, null, 'detached identity remains faithfully detached');
});

fixture('RED_B', 'composer replacement retargets the existing ResizeObserver', () => {
  const env = makeEnv();
  const oldForm = formOf(env); oldForm.remove();
  const replacement = H.addComposer(env); exactComposer(env, H.El);
  const ro = (env.resizeObservers || []).find((item) => item.live && item.target === oldForm);
  ok(ro, 'precondition: old composer is observed');
  ro.cb([{ target: oldForm }], ro);
  H.flushFrames(env, 4);
  const rebound = (env.resizeObservers || []).find((item) => item.live && item.target === replacement);
  ok(rebound, 'replacement composer receives the existing RO authority');
});

fixture('RED_B', 'composer late appearance completes bounded boot recovery', () => {
  const env = makeEnv({ composer: false });
  eq(H.rootCount(env), 0, 'precondition: no root without composer');
  H.addComposer(env); exactComposer(env, H.El);
  drain(env, 600);
  eq(H.rootCount(env), 1, 'late composer permits one root mount');
});

fixture('RED_C', 'one admitted floating placement meets the exact pass-local budget', () => {
  const env = makeEnv();
  testHook(env).scheduleLayout(rootOf(env));
  H.flushFrames(env, 1);
  observed.redC = {
    getForm: env.window.__CV351.calls.getForm,
    anchor: env.window.__CV351.calls.anchor,
    surfaceSweep: env.cv351Queries.surface,
    broadFormSweep: env.cv351Queries.broadForm,
    visibility: {
      form: env.window.__CV351.visible.form,
      input: env.window.__CV351.visible.input,
      surface: env.window.__CV351.visible.surface,
    },
    rect: {
      form: env.cv351RectCounts.form,
      input: env.cv351RectCounts.input,
      surface: env.cv351RectCounts.surface,
      buttonBox: env.cv351RectCounts.buttonBox,
      send: env.cv351RectCounts.send,
      nav: env.cv351RectCounts.nav,
    },
  };
  eq(observed.redC, {
    getForm: 1, anchor: 1, surfaceSweep: 1, broadFormSweep: 0,
    visibility: { form: 1, input: 1, surface: 1 },
    rect: { form: 1, input: 1, surface: 1, buttonBox: 1, send: 0, nav: 0 },
  }, 'governed placement uses one coherent form/anchor/visibility snapshot');
});

fixture('RED_D', 'recovery output does not re-arm self-heal or placement', () => {
  const env = makeEnv();
  const oldRoot = rootOf(env); oldRoot.remove();
  deliver(env, [child(env.body, [], [oldRoot])]);
  drain(env, 25000);
  const root = rootOf(env);
  ok(root && root !== oldRoot, 'precondition: a real recovery root was mounted');
  resetCounters(env);
  const panel = root.querySelector('[data-cgxui="prmn-panel"]');
  const status = root.querySelector('[data-cgxui="prmn-status"]');
  deliver(env, [attr(root, 'style'), attr(panel, 'class'), attr(status, 'style')]);
  drain(env, 400);
  eq({ pending: pending(env), place: env.window.__CV351.calls.place }, {
    pending: { selfHeal: 0, layout: 0 }, place: 0,
  }, 'harmless output after recovery reaches stable quiescence');
});

fixture('CONTROL', 'same-identity composer RO uses PM_LAYOUT_RAF without raw retarget frame', () => {
  const env = makeEnv();
  const form = formOf(env);
  const ro = (env.resizeObservers || []).find((item) => item.live && item.target === form);
  ok(ro, 'composer ResizeObserver is bound');
  const before = env.frames.length;
  ro.cb([{ target: form }], ro);
  eq(env.frames.length - before, 1, 'same identity submits exactly one placement frame');
  H.flushFrames(env, 1);
  eq(env.window.__CV351.calls.place, 1, 'the frame performs one placement');
});

fixture('CONTROL', 'one observer/frame/timer authority set and no persistent placement cache', () => {
  eq((SOURCE.match(/new MutationObserver\(/gu) || []).length, 2, 'no MutationObserver added');
  eq((SOURCE.match(/new ResizeObserver\(/gu) || []).length, 1, 'one composer ResizeObserver');
  eq((SOURCE.match(/let PM_SELF_HEAL_TIMER\s*=\s*0/gu) || []).length, 1, 'one self-heal timer authority');
  eq((SOURCE.match(/let PM_LAYOUT_RAF\s*=\s*0/gu) || []).length, 1, 'one placement frame authority');
  ok(!/PM_[A-Z_]*(FORM|ANCHOR|GEOMETRY|VISIBLE)_CACHE/u.test(SOURCE), 'no new cross-pass placement cache');
});

const failed = fixtures.filter((item) => !item.ok);
for (const item of fixtures) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} [${item.group}] ${item.name}`);
  if (!item.ok) console.log(item.error.split('\n').slice(0, 30).map((line) => `  ${line}`).join('\n'));
}
console.log(`CV3_51_RESULT=${failed.length ? 'FAIL' : 'PASS'} fixtures=${fixtures.length} assertions=${assertions} failed=${failed.length}`);
if (observed.redC) console.log(`RED_C_OBSERVED=${JSON.stringify(observed.redC)}`);
if (failed.length) process.exit(1);
