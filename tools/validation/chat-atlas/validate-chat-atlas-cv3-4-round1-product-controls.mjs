#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const controlHubPath = 'src-runtime-base/0Z1c.⚫️🗺️🕹️ MiniMap Tab (Control Hub 🔌 Plugin) 🕹️.js';
const sideActionsPath = 'src-runtime-base/0X2a.⬛️🎛️ Side Actions Panel 🎛️.js';
const commandRuntimePath = 'src-runtime-base/0D3a.⬛️🗄️ Transcript Archive Engine 🗂️🗄️.js';
const controlHubSource = fs.readFileSync(path.join(root, controlHubPath), 'utf8');
const sideActionsSource = fs.readFileSync(path.join(root, sideActionsPath), 'utf8');
const commandRuntimeSource = fs.readFileSync(path.join(root, commandRuntimePath), 'utf8');

let assertionCount = 0;
const fixtures = [];
const totals = {
  preferenceSetters: 0,
  preferenceStorageWrites: 0,
  refreshCalls: 0,
  rebuildCalls: 0,
  resyncCalls: 0,
  reconciliationSetters: 0,
  canarySetters: 0,
  directNetworkCalls: 0,
  timers: 0,
};
const clean = (value) => value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
const equal = (actual, expected, message) => {
  assertionCount += 1;
  assert.deepEqual(clean(actual), clean(expected), message);
};
const ok = (value, message) => {
  assertionCount += 1;
  assert.ok(value, message);
};
const fixture = async (name, fn) => {
  try {
    await fn();
    fixtures.push({ name, ok: true });
  } catch (error) {
    fixtures.push({ name, ok: false, error: String(error?.stack || error) });
  }
};

function extractFunction(source, name) {
  const anchors = [`  function ${name}(`, `  async function ${name}(`];
  const matches = anchors.map((anchor) => source.indexOf(anchor)).filter((index) => index >= 0);
  if (matches.length !== 1) throw new Error(`function-anchor-invalid:${name}`);
  const start = matches[0];
  const signatureEnd = source.indexOf(') {', start);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const ch = source[index];
    const next = source[index + 1];
    if (lineComment) { if (ch === '\n') lineComment = false; continue; }
    if (blockComment) { if (ch === '*' && next === '/') { blockComment = false; index += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '/' && next === '/') { lineComment = true; index += 1; continue; }
    if (ch === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`function-boundary-invalid:${name}`);
}

function createTurnRuntime({ storedValue = null, compiledDefault = false, available = true, refreshOutcome = 'reconciled' } = {}) {
  const state = {
    storedValue,
    compiledDefault,
    enabled: storedValue === '1' || (storedValue == null && compiledDefault === true),
    autoBranchReconciliationEnabled: false,
    branchSelectionStale: false,
    branchSelectionStaleRevision: 0,
    branchSelectionStaleQId: null,
    setterCalls: [],
    storageWrites: 0,
    refreshCalls: 0,
    rebuildCalls: 0,
    resyncCalls: 0,
    reconciliationSetterCalls: 0,
    canarySetterCalls: 0,
    networkCalls: 0,
  };
  if (!available) return { state, api: null };
  const api = {
    getCompleteTurnIndexProjectionPreference() {
      return { storedValue: state.storedValue, compiledDefault: state.compiledDefault };
    },
    getCompleteTurnIndexProjectionStatus() {
      return {
        enabled: state.enabled,
        status: state.enabled ? 'complete-validated' : 'disabled',
        autoBranchReconciliationEnabled: state.autoBranchReconciliationEnabled,
        branchSelectionStale: state.branchSelectionStale,
        branchSelectionStaleRevision: state.branchSelectionStaleRevision,
        branchSelectionStaleQId: state.branchSelectionStaleQId,
      };
    },
    setCompleteTurnIndexProjectionPreference(value) {
      state.setterCalls.push(value);
      state.storageWrites += 1;
      state.storedValue = value === true ? '1' : '0';
      state.enabled = value === true;
      return { ok: true, enabled: state.enabled, storedValue: state.storedValue };
    },
    refreshCompleteTurnIndexProjection() {
      state.refreshCalls += 1;
      if (refreshOutcome === 'reconciled') {
        state.branchSelectionStale = false;
        state.branchSelectionStaleQId = null;
      }
      return Promise.resolve({ enabled: state.enabled, status: state.enabled ? 'complete-refresh-validated' : 'disabled' });
    },
    rebuildCompleteTurnIndexProjection() { state.rebuildCalls += 1; },
    setCompleteTurnIndexProjectionCanary() { state.canarySetterCalls += 1; },
    setCompleteTurnIndexAutoBranchReconciliationCanary() {
      state.reconciliationSetterCalls += 1;
      state.autoBranchReconciliationEnabled = true;
    },
  };
  return { state, api };
}

function loadControlHubMiniMap(runtimeApi) {
  const plugins = [];
  const window = {
    H2O: {
      turnRuntime: runtimeApi,
      CH: { cntrlhb: { api: {
        registerPlugin(def) { plugins.push(def); return true; },
        invalidate() {},
      } } },
    },
  };
  window.top = window;
  window.addEventListener = () => {};
  window.removeEventListener = () => {};
  window.setInterval = () => { totals.timers += 1; return 1; };
  window.clearInterval = () => {};
  const context = vm.createContext({
    window,
    document: {},
    localStorage: {
      getItem() { throw new Error('unexpected-direct-storage-read'); },
      setItem() { throw new Error('unexpected-direct-storage-write'); },
    },
    CustomEvent: class {},
    console,
    Object,
    Array,
    JSON,
    String,
    Number,
    Boolean,
    Math,
    RegExp,
    Set,
  });
  new vm.Script(controlHubSource, { filename: controlHubPath }).runInContext(context);
  const plugin = plugins.find((entry) => entry.key === 'minimap');
  if (!plugin) throw new Error('minimap-control-hub-plugin-missing');
  const control = plugin.getControls().find((entry) => entry.key === 'mmCompleteTurnIndexProjection');
  if (!control) throw new Error('complete-turn-toggle-missing');
  return { control, plugins, window };
}

function loadSideActionsProductControl(runtimeApi) {
  const actions = [];
  const H2O = { turnRuntime: runtimeApi };
  const code = `(() => {
    const H2O = injectedH2O;
    const TAB_MINIMAP = 'minimap';
    const COMPLETE_TURN_INDEX_REFRESH_ACTION_ID = 'minimap.complete-turn-index.refresh';
    const state = { actions: new Map() };
    const registerAction = (def) => { actions.push(def); state.actions.set(def.id, { ...def, node: null }); return true; };
    ${extractFunction(sideActionsSource, 'sideActionsCompleteTurnIndexRuntime')}
    ${extractFunction(sideActionsSource, 'sideActionsCompleteTurnIndexStatus')}
    ${extractFunction(sideActionsSource, 'sideActionsCompleteTurnIndexEnabled')}
    ${extractFunction(sideActionsSource, 'sideActionsApplyMiniMapBranchStaleIndicator')}
    ${extractFunction(sideActionsSource, 'sideActionsSetMiniMapRefreshFeedback')}
    ${extractFunction(sideActionsSource, 'sideActionsRefreshCompleteTurnIndex')}
    ${extractFunction(sideActionsSource, 'registerCompleteTurnIndexRefreshAction')}
    ${extractFunction(sideActionsSource, 'sideActionsSyncCompleteTurnIndexRefreshAvailability')}
    registerCompleteTurnIndexRefreshAction();
    return {
      actions,
      bindNode(node) { state.actions.get(COMPLETE_TURN_INDEX_REFRESH_ACTION_ID).node = node; },
      sync: sideActionsSyncCompleteTurnIndexRefreshAvailability,
    };
  })()`;
  const out = vm.runInNewContext(code, {
    injectedH2O: H2O,
    actions,
    Promise,
    String,
    Object,
    Array,
  });
  const action = out.actions.find((entry) => entry.id === 'minimap.complete-turn-index.refresh');
  if (!action) throw new Error('complete-turn-refresh-action-missing');
  return { action, H2O, bindNode: out.bindNode, sync: out.sync };
}

function fakeActionElement() {
  const label = { textContent: 'Refresh MiniMap' };
  const stale = { textContent: 'Branch changed — refresh MiniMap', hidden: true };
  return {
    disabled: false,
    dataset: {},
    attributes: new Map(),
    querySelector(selector) {
      if (selector === '.sa-label') return label;
      if (selector === '.sa-branch-stale') return stale;
      return null;
    },
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
    removeAttribute(name) { this.attributes.delete(name); },
    label,
    stale,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

await fixture('toggle is placed in Control Hub MiniMap and initial render is mutation-free', () => {
  const runtime = createTurnRuntime({ storedValue: '0' });
  const { control, plugins } = loadControlHubMiniMap(runtime.api);
  equal(control.type, 'toggle');
  equal(control.label, 'Full Conversation MiniMap');
  equal(control.group, 'Conversation Coverage');
  equal(plugins.filter((entry) => entry.key === 'minimap').length, 1);
  equal(runtime.state.setterCalls.length, 0);
  equal(runtime.state.storageWrites, 0);
});

await fixture('persisted one renders enabled and reload reads it without writes', () => {
  const first = createTurnRuntime({ storedValue: '1' });
  const firstControl = loadControlHubMiniMap(first.api).control;
  equal(firstControl.getLive(), true);
  equal(first.state.setterCalls.length, 0);
  equal(first.state.storageWrites, 0);
  const reload = createTurnRuntime({ storedValue: '1' });
  equal(loadControlHubMiniMap(reload.api).control.getLive(), true);
  equal(reload.state.storageWrites, 0);
});

await fixture('persisted zero and absent preference render disabled', () => {
  const disabled = createTurnRuntime({ storedValue: '0' });
  equal(loadControlHubMiniMap(disabled.api).control.getLive(), false);
  const absent = createTurnRuntime({ storedValue: null, compiledDefault: false });
  equal(loadControlHubMiniMap(absent.api).control.getLive(), false);
  equal(disabled.state.storageWrites + absent.state.storageWrites, 0);
});

await fixture('one enable toggle uses only approved preference setter once', () => {
  const runtime = createTurnRuntime({ storedValue: '0' });
  const control = loadControlHubMiniMap(runtime.api).control;
  control.setLive(true);
  equal(runtime.state.setterCalls, [true]);
  equal(runtime.state.storageWrites, 1);
  equal(runtime.state.enabled, true);
  equal(runtime.state.storedValue, '1');
  equal(runtime.state.canarySetterCalls, 0);
  equal(runtime.state.reconciliationSetterCalls, 0);
  equal(runtime.state.autoBranchReconciliationEnabled, false);
  totals.preferenceSetters += runtime.state.setterCalls.length;
  totals.preferenceStorageWrites += runtime.state.storageWrites;
});

await fixture('one disable toggle uses only approved preference setter once', () => {
  const runtime = createTurnRuntime({ storedValue: '1' });
  const control = loadControlHubMiniMap(runtime.api).control;
  control.setLive(false);
  equal(runtime.state.setterCalls, [false]);
  equal(runtime.state.storageWrites, 1);
  equal(runtime.state.enabled, false);
  equal(runtime.state.storedValue, '0');
  equal(runtime.state.canarySetterCalls, 0);
  equal(runtime.state.reconciliationSetterCalls, 0);
  equal(runtime.state.autoBranchReconciliationEnabled, false);
  totals.preferenceSetters += runtime.state.setterCalls.length;
  totals.preferenceStorageWrites += runtime.state.storageWrites;
});

await fixture('missing toggle runtime API fails safely without mutation', () => {
  const runtime = createTurnRuntime({ available: false });
  const control = loadControlHubMiniMap(runtime.api).control;
  equal(control.getLive(), false);
  equal(control.setLive(true), undefined);
  equal(runtime.state.setterCalls.length, 0);
  equal(runtime.state.storageWrites, 0);
});

await fixture('Refresh MiniMap is registered in Side Actions MiniMap workflow', () => {
  const runtime = createTurnRuntime({ storedValue: '1' });
  const { action } = loadSideActionsProductControl(runtime.api);
  equal(action.tabId, 'minimap');
  equal(action.text, 'Refresh MiniMap');
  equal(action.owner, 'chat-atlas.complete-turn-index.product-controls');
  equal(action.disabled(), false);
});

await fixture('one deliberate refresh activation invokes only refresh once', async () => {
  const runtime = createTurnRuntime({ storedValue: '1' });
  const { action } = loadSideActionsProductControl(runtime.api);
  const el = fakeActionElement();
  const operation = action.onClick({ el });
  equal(el.label.textContent, 'Refreshing MiniMap…');
  equal(el.attributes.get('aria-busy'), 'true');
  await operation;
  equal(runtime.state.refreshCalls, 1);
  equal(runtime.state.rebuildCalls, 0);
  equal(runtime.state.resyncCalls, 0);
  equal(runtime.state.setterCalls.length, 0);
  equal(runtime.state.reconciliationSetterCalls, 0);
  equal(runtime.state.canarySetterCalls, 0);
  equal(runtime.state.networkCalls, 0);
  equal(el.label.textContent, 'MiniMap refreshed');
  equal(el.dataset.refreshStatus, 'refreshed');
  equal(el.attributes.get('aria-busy'), 'false');
  equal(el.disabled, false);
  totals.refreshCalls += runtime.state.refreshCalls;
  totals.rebuildCalls += runtime.state.rebuildCalls;
  totals.resyncCalls += runtime.state.resyncCalls;
  totals.reconciliationSetters += runtime.state.reconciliationSetterCalls;
  totals.canarySetters += runtime.state.canarySetterCalls;
  totals.directNetworkCalls += runtime.state.networkCalls;
});

await fixture('complete-index state event handler renders an accessible branch-stale indication without polling', () => {
  const runtime = createTurnRuntime({ storedValue: '1' });
  runtime.state.branchSelectionStale = true;
  runtime.state.branchSelectionStaleRevision = 1;
  runtime.state.branchSelectionStaleQId = 'fixture-branch-q';
  const { bindNode, sync } = loadSideActionsProductControl(runtime.api);
  const el = fakeActionElement();
  bindNode(el);
  sync({ type: 'evt:h2o:complete-turn-index:state' });
  equal(el.stale.hidden, false);
  equal(el.stale.textContent, 'Branch changed — refresh MiniMap');
  equal(el.dataset.branchSelectionStale, 'true');
  equal(el.attributes.get('aria-describedby'), 'h2o-side-actions-minimap-branch-stale');
  equal(el.label.textContent, 'Refresh MiniMap');
  equal(el.dataset.refreshStatus, 'stale');
  equal(runtime.state.refreshCalls, 0);
  equal(runtime.state.networkCalls, 0);
  equal(totals.timers, 0);
});

await fixture('exact canonical branch return removes stale warning without refresh feedback', () => {
  const runtime = createTurnRuntime({ storedValue: '1' });
  runtime.state.branchSelectionStale = true;
  runtime.state.branchSelectionStaleRevision = 1;
  runtime.state.branchSelectionStaleQId = 'fixture-branch-q';
  const { bindNode, sync } = loadSideActionsProductControl(runtime.api);
  const el = fakeActionElement();
  bindNode(el);
  sync({ type: 'evt:h2o:complete-turn-index:state' });
  equal(el.stale.hidden, false);
  equal(el.dataset.refreshStatus, 'stale');
  runtime.state.branchSelectionStale = false;
  runtime.state.branchSelectionStaleQId = null;
  sync({ type: 'evt:h2o:complete-turn-index:state' });
  equal(el.stale.hidden, true);
  equal(el.dataset.branchSelectionStale, 'false');
  equal(el.attributes.has('aria-describedby'), false);
  equal(el.label.textContent, 'Refresh MiniMap');
  equal(el.label.textContent.includes('Branch still differs'), false);
  equal(el.dataset.refreshStatus, 'idle');
  equal(runtime.state.refreshCalls, 0);
  equal(runtime.state.networkCalls, 0);
  equal(totals.timers, 0);
});

await fixture('successful Refresh MiniMap clears the visible stale indication after runtime success', async () => {
  const runtime = createTurnRuntime({ storedValue: '1' });
  runtime.state.branchSelectionStale = true;
  runtime.state.branchSelectionStaleRevision = 1;
  runtime.state.branchSelectionStaleQId = 'fixture-branch-q';
  const { action, bindNode, sync } = loadSideActionsProductControl(runtime.api);
  const el = fakeActionElement();
  bindNode(el);
  sync();
  equal(el.stale.hidden, false);
  await action.onClick({ el });
  equal(runtime.state.refreshCalls, 1);
  equal(runtime.state.branchSelectionStale, false);
  equal(el.stale.hidden, true);
  equal(el.dataset.branchSelectionStale, 'false');
  equal(el.label.textContent, 'MiniMap refreshed');
  equal(el.attributes.has('aria-describedby'), false);
});

await fixture('validated Refresh MiniMap keeps truthful stale feedback when branch identity is unchanged', async () => {
  const runtime = createTurnRuntime({ storedValue: '1', refreshOutcome: 'unchanged' });
  runtime.state.branchSelectionStale = true;
  runtime.state.branchSelectionStaleRevision = 7;
  runtime.state.branchSelectionStaleQId = 'fixture-branch-q';
  const { action, bindNode, sync } = loadSideActionsProductControl(runtime.api);
  const el = fakeActionElement();
  bindNode(el);
  sync();
  await action.onClick({ el });
  await action.onClick({ el });
  equal(runtime.state.refreshCalls, 2);
  equal(runtime.state.branchSelectionStale, true);
  equal(runtime.state.branchSelectionStaleRevision, 7);
  equal(runtime.state.branchSelectionStaleQId, 'fixture-branch-q');
  equal(el.stale.hidden, false);
  equal(el.dataset.branchSelectionStale, 'true');
  equal(el.label.textContent, 'Branch still differs');
  equal(el.dataset.refreshStatus, 'stale');
  equal(el.attributes.get('aria-describedby'), 'h2o-side-actions-minimap-branch-stale');
  equal(runtime.state.rebuildCalls, 0);
  equal(runtime.state.reconciliationSetterCalls, 0);
  equal(runtime.state.networkCalls, 0);
  equal(totals.timers, 0);
});

await fixture('disabled or unavailable refresh is honest and side-effect free', async () => {
  const disabledRuntime = createTurnRuntime({ storedValue: '0' });
  const disabledAction = loadSideActionsProductControl(disabledRuntime.api).action;
  equal(disabledAction.disabled(), true);
  const disabledEl = fakeActionElement();
  const result = await disabledAction.onClick({ el: disabledEl });
  equal(result.errorCode, 'complete-index-refresh-unavailable');
  equal(disabledRuntime.state.refreshCalls, 0);
  equal(disabledEl.label.textContent, 'Refresh unavailable');
  const unavailable = createTurnRuntime({ available: false });
  const unavailableAction = loadSideActionsProductControl(unavailable.api).action;
  equal(unavailableAction.disabled(), true);
  equal((await unavailableAction.onClick({ el: fakeActionElement() })).ok, false);
  equal(unavailable.state.refreshCalls, 0);
});

await fixture('refresh failure is bounded with no timer or retry fan-out', async () => {
  const runtime = createTurnRuntime({ storedValue: '1' });
  runtime.state.branchSelectionStale = true;
  runtime.state.branchSelectionStaleRevision = 1;
  runtime.state.branchSelectionStaleQId = 'fixture-branch-q';
  runtime.api.refreshCompleteTurnIndexProjection = () => {
    runtime.state.refreshCalls += 1;
    return Promise.reject(new Error('fixture-failure'));
  };
  const { action, bindNode, sync } = loadSideActionsProductControl(runtime.api);
  const el = fakeActionElement();
  bindNode(el);
  sync();
  const result = await action.onClick({ el });
  equal(result.errorCode, 'complete-index-refresh-failed');
  equal(runtime.state.refreshCalls, 1);
  equal(el.label.textContent, 'Refresh failed safely');
  equal(el.dataset.refreshStatus, 'failed');
  equal(runtime.state.branchSelectionStale, true);
  equal(el.stale.hidden, false);
  equal(el.dataset.branchSelectionStale, 'true');
  equal(totals.timers, 0);
});

await fixture('newer branch state is not overwritten by stale refresh success feedback', async () => {
  const runtime = createTurnRuntime({ storedValue: '1' });
  runtime.state.branchSelectionStale = true;
  runtime.state.branchSelectionStaleRevision = 1;
  runtime.state.branchSelectionStaleQId = 'fixture-branch-q-1';
  const pending = deferred();
  runtime.api.refreshCompleteTurnIndexProjection = () => {
    runtime.state.refreshCalls += 1;
    const acceptedRevision = runtime.state.branchSelectionStaleRevision;
    return pending.promise.then(() => {
      if (runtime.state.branchSelectionStaleRevision === acceptedRevision) {
        runtime.state.branchSelectionStale = false;
        runtime.state.branchSelectionStaleQId = null;
      }
      return { enabled: true, status: 'complete-refresh-validated' };
    });
  };
  const { action, bindNode, sync } = loadSideActionsProductControl(runtime.api);
  const el = fakeActionElement();
  bindNode(el);
  sync();
  const operation = action.onClick({ el });
  runtime.state.branchSelectionStaleRevision = 2;
  runtime.state.branchSelectionStaleQId = 'fixture-branch-q-2';
  sync();
  pending.resolve();
  await operation;
  equal(runtime.state.refreshCalls, 1);
  equal(runtime.state.branchSelectionStale, true);
  equal(runtime.state.branchSelectionStaleRevision, 2);
  equal(el.stale.hidden, false);
  equal(el.dataset.branchSelectionStale, 'true');
  equal(el.label.textContent, 'Branch still differs');
  equal(el.dataset.refreshStatus, 'stale');
});

await fixture('surface contract excludes forbidden APIs and preserves technical controls', () => {
  const settingSource = extractFunction(controlHubSource, 'setCompleteTurnIndexProjectionSetting');
  const refreshSource = [
    extractFunction(sideActionsSource, 'sideActionsApplyMiniMapBranchStaleIndicator'),
    extractFunction(sideActionsSource, 'sideActionsRefreshCompleteTurnIndex'),
    extractFunction(sideActionsSource, 'registerCompleteTurnIndexRefreshAction'),
  ].join('\n');
  equal(settingSource.includes('setCompleteTurnIndexProjectionPreference'), true);
  equal(settingSource.includes('localStorage'), false);
  equal(settingSource.includes('setCompleteTurnIndexProjectionCanary'), false);
  equal(settingSource.includes('setCompleteTurnIndexAutoBranchReconciliationCanary'), false);
  equal(refreshSource.includes('refreshCompleteTurnIndexProjection()'), true);
  equal(refreshSource.includes('rebuildCompleteTurnIndexProjection'), false);
  equal(refreshSource.includes('setCompleteTurnIndexProjectionPreference'), false);
  equal(refreshSource.includes('setCompleteTurnIndexProjectionCanary'), false);
  equal(refreshSource.includes('setCompleteTurnIndexAutoBranchReconciliationCanary'), false);
  equal(refreshSource.includes('localStorage'), false);
  equal(sideActionsSource.includes('evt:h2o:complete-turn-index:state'), true);
  equal(sideActionsSource.includes('sideActionsSyncCompleteTurnIndexRefreshAvailability'), true);
  equal(sideActionsSource.includes('Branch changed — refresh MiniMap'), true);
  equal(refreshSource.includes('Branch still differs'), true);
  equal(sideActionsSource.includes('role="status"'), true);
  equal(sideActionsSource.includes('aria-live="polite"'), true);
  equal(refreshSource.includes('fetch('), false);
  equal(refreshSource.includes('setTimeout'), false);
  equal(commandRuntimeSource.includes('id: "mm.boot"'), true);
  equal(commandRuntimeSource.includes('id: "mm.resync"'), true);
});

const failed = fixtures.filter((row) => !row.ok);
console.log(`CV-3.4 Round 1 product controls: ${fixtures.length - failed.length}/${fixtures.length} fixtures, ${assertionCount} assertions, ${failed.length} failures`);
console.log(`Counters: preference setters ${totals.preferenceSetters}, preference storage writes ${totals.preferenceStorageWrites}, refresh ${totals.refreshCalls}, rebuild ${totals.rebuildCalls}, resync ${totals.resyncCalls}, reconciliation setters ${totals.reconciliationSetters}, canary setters ${totals.canarySetters}, direct network ${totals.directNetworkCalls}, timers ${totals.timers}`);
for (const row of failed) console.error(`FAIL ${row.name}\n${row.error}`);
if (failed.length) process.exitCode = 1;
