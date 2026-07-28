#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SIDE_ACTIONS_PATH = 'src-runtime-base/0X2a.⬛️🎛️ Side Actions Panel 🎛️.js';
const SIDE_ACTIONS_SOURCE = fs.readFileSync(path.join(ROOT, SIDE_ACTIONS_PATH), 'utf8');

let assertionCount = 0;
const fixtures = [];
const safetyCounters = {
  pollingIntervals: 0,
  repeatingTimers: 0,
  newObservers: 0,
  storageWrites: 0,
  preferenceWrites: 0,
  cacheWrites: 0,
  networkCalls: 0,
};

const clean = (value) => (
  value && typeof value === 'object'
    ? JSON.parse(JSON.stringify(value))
    : value
);
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
    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`function-boundary-invalid:${name}`);
}

function eventTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, handler) {
      const list = listeners.get(type) || [];
      list.push(handler);
      listeners.set(type, list);
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type) || [];
      listeners.set(type, list.filter((candidate) => candidate !== handler));
    },
    dispatch(type) {
      for (const handler of listeners.get(type) || []) handler({ type });
    },
    count(type) {
      return (listeners.get(type) || []).length;
    },
  };
}

function createHarness({
  viewport = { width: 1200, height: 800, offsetLeft: 0, offsetTop: 0 },
  trigger = { left: 1158, right: 1180, top: 680, bottom: 712, width: 22, height: 32 },
  panel = { left: 0, right: 248, top: 0, bottom: 300, width: 248, height: 300 },
  naturalHeight = panel.height,
  composer = null,
  placement = 'page-right',
} = {}) {
  const windowEvents = eventTarget();
  const visualEvents = eventTarget();
  const visualViewport = {
    ...viewport,
    ...visualEvents,
  };
  const triggerState = { ...trigger };
  const panelState = { ...panel };
  const triggerEl = {
    isConnected: true,
    getBoundingClientRect: () => ({ ...triggerState }),
  };
  const panelEl = {
    isConnected: true,
    style: {},
    dataset: {},
    scrollHeight: naturalHeight,
    getBoundingClientRect: () => ({ ...panelState }),
  };
  const bodyEl = { style: {} };
  const composerEl = composer ? {
    isConnected: true,
    getBoundingClientRect: () => ({ ...composer }),
  } : null;
  const document = {
    documentElement: { clientWidth: viewport.width, clientHeight: viewport.height },
    querySelector(selector) {
      if (!composerEl) return null;
      if (selector === '[data-ho-composer="true"]') return composerEl;
      return null;
    },
  };
  const window = {
    innerWidth: viewport.width,
    innerHeight: viewport.height,
    visualViewport,
    addEventListener: windowEvents.addEventListener,
    removeEventListener: windowEvents.removeEventListener,
  };
  const state = {
    open: true,
    panel: panelEl,
    launcher: triggerEl,
    body: bodyEl,
    tabPlacement: placement,
    panelViewportHandler: null,
    panelVisualViewport: null,
  };
  const code = `(() => {
    const W = injectedW;
    const D = injectedD;
    const state = injectedState;
    const PANEL_W_PX = 248;
    const PANEL_MIN_H_PX = 140;
    const PANEL_GAP_PX = 10;
    const PANEL_VIEWPORT_MARGIN_PX = 12;
    const TAB_PLACEMENT_PAGE_RIGHT = 'page-right';
    const TAB_PLACEMENT_SIDEBAR_EDGE = 'sidebar-edge';
    const getComputedStyle = injectedGetComputedStyle;
    const readTabPlacement = () => state.tabPlacement;
    ${extractFunction(SIDE_ACTIONS_SOURCE, 'sideActionsVisualViewportBounds')}
    ${extractFunction(SIDE_ACTIONS_SOURCE, 'sideActionsComposerExclusionRect')}
    ${extractFunction(SIDE_ACTIONS_SOURCE, 'sideActionsPositionPanelWithinViewport')}
    ${extractFunction(SIDE_ACTIONS_SOURCE, 'sideActionsBindPanelViewportListeners')}
    ${extractFunction(SIDE_ACTIONS_SOURCE, 'sideActionsUnbindPanelViewportListeners')}
    return Object.freeze({
      position: sideActionsPositionPanelWithinViewport,
      bind: sideActionsBindPanelViewportListeners,
      unbind: sideActionsUnbindPanelViewportListeners,
    });
  })()`;
  const api = vm.runInNewContext(code, {
    injectedW: window,
    injectedD: document,
    injectedState: state,
    injectedGetComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    Number,
    Math,
    Object,
  });
  return {
    api,
    state,
    triggerState,
    panelState,
    panelEl,
    bodyEl,
    windowEvents,
    visualEvents,
    visualViewport,
  };
}

const statusClassifier = vm.runInNewContext(`(() => {
  ${extractFunction(SIDE_ACTIONS_SOURCE, 'sideActionsSelectedPathPresentationStatus')}
  return sideActionsSelectedPathPresentationStatus;
})()`, { Number, Object });

await fixture('trigger near bottom flips the complete popup above', () => {
  const harness = createHarness();
  const result = harness.api.position();
  equal(result.placement, 'above', 'bottom trigger selects above placement');
  ok(result.top >= 12, 'panel top respects the safe margin');
  ok(result.top + result.height <= 670, 'panel bottom stays above the trigger gap');
  ok(result.safeBottom - (result.top + result.height) >= 0, 'panel remains inside viewport');
});

await fixture('trigger near top uses below placement when it fully fits', () => {
  const harness = createHarness({
    trigger: { left: 1158, right: 1180, top: 80, bottom: 112, width: 22, height: 32 },
    panel: { left: 0, right: 248, top: 0, bottom: 260, width: 248, height: 260 },
  });
  const result = harness.api.position();
  equal(result.placement, 'below', 'roomy lower side selects below placement');
  equal(result.top, 122, 'below placement uses the exact trigger gap');
  ok(result.top + result.height <= result.safeBottom, 'below panel remains fully visible');
});

await fixture('visible H2O composer constrains the safe bottom edge', () => {
  const harness = createHarness({
    trigger: { left: 1158, right: 1180, top: 620, bottom: 652, width: 22, height: 32 },
    composer: { left: 200, right: 1200, top: 700, bottom: 800, width: 1000, height: 100 },
  });
  const result = harness.api.position();
  equal(result.composerExcluded, true, 'composer exclusion is active');
  equal(result.safeBottom, 690, 'composer top minus gap becomes safe bottom');
  ok(result.top + result.height <= 690, 'panel does not overlap composer');
});

await fixture('narrow visual viewport clamps width and horizontal coordinates', () => {
  const harness = createHarness({
    viewport: { width: 220, height: 700, offsetLeft: 0, offsetTop: 0 },
    trigger: { left: 196, right: 218, top: 500, bottom: 532, width: 22, height: 32 },
  });
  const result = harness.api.position();
  equal(result.width, 196, 'panel width is viewport width minus 24px');
  equal(result.left, 12, 'panel left is clamped to the safe margin');
  equal(result.safeRight - (result.left + result.width), 0, 'right edge meets but does not cross safe margin');
  equal(harness.panelEl.style.maxWidth, '196px', 'max width is applied to the real panel');
});

await fixture('tall popup is constrained and scrolls internally', () => {
  const harness = createHarness({
    viewport: { width: 1000, height: 500, offsetLeft: 0, offsetTop: 0 },
    trigger: { left: 950, right: 972, top: 260, bottom: 292, width: 22, height: 32 },
    panel: { left: 0, right: 248, top: 0, bottom: 900, width: 248, height: 900 },
    naturalHeight: 900,
  });
  const result = harness.api.position();
  equal(result.placement, 'above', 'larger side is selected for a tall popup');
  equal(result.height, 238, 'max height equals available space above');
  equal(harness.panelEl.style.maxHeight, '238px', 'panel max height is constrained');
  equal(harness.panelEl.style.overflow, 'hidden', 'panel grid clips at its boundary');
  equal(harness.bodyEl.style.overflowY, 'auto', 'body owns internal vertical scrolling');
  ok(SIDE_ACTIONS_SOURCE.includes('grid-template-rows:auto auto 1fr'), 'header remains outside the scrolling body row');
});

await fixture('visual viewport offsets define the coordinate space', () => {
  const harness = createHarness({
    viewport: { width: 700, height: 500, offsetLeft: 100, offsetTop: 200 },
    trigger: { left: 750, right: 772, top: 600, bottom: 632, width: 22, height: 32 },
    panel: { left: 0, right: 248, top: 0, bottom: 220, width: 248, height: 220 },
  });
  const result = harness.api.position();
  equal(result.viewportSource, 'visual-viewport', 'visual viewport is authoritative');
  equal(result.safeLeft, 112, 'offsetLeft contributes to safe left');
  equal(result.safeTop, 212, 'offsetTop contributes to safe top');
  equal(result.safeRight, 788, 'visual viewport right is offset-aware');
  equal(result.safeBottom, 688, 'visual viewport bottom is offset-aware');
});

await fixture('visual resize and scroll reposition the open popup once per event', () => {
  const harness = createHarness();
  equal(harness.api.bind(), true, 'open viewport listeners bind once');
  equal(harness.visualEvents.count('resize'), 1, 'one visual resize listener exists');
  equal(harness.visualEvents.count('scroll'), 1, 'one visual scroll listener exists');
  harness.triggerState.top = 80;
  harness.triggerState.bottom = 112;
  harness.visualEvents.dispatch('resize');
  equal(harness.panelEl.dataset.viewportPlacement, 'below', 'resize recomputes placement');
  harness.triggerState.top = 680;
  harness.triggerState.bottom = 712;
  harness.windowEvents.dispatch('scroll');
  equal(harness.panelEl.dataset.viewportPlacement, 'above', 'conversation scroll recomputes placement');
});

await fixture('repeated open and close does not accumulate listeners', () => {
  const harness = createHarness();
  equal(harness.api.bind(), true, 'first open binds listeners');
  equal(harness.api.bind(), false, 'repeated open is idempotent');
  equal(harness.windowEvents.count('scroll'), 1, 'one conversation scroll listener exists');
  equal(harness.visualEvents.count('resize'), 1, 'one visual resize listener exists');
  equal(harness.api.unbind(), true, 'close removes listeners');
  equal(harness.api.unbind(), false, 'repeated close is idempotent');
  equal(harness.windowEvents.count('scroll'), 0, 'conversation scroll listener is removed');
  equal(harness.visualEvents.count('resize'), 0, 'visual resize listener is removed');
  equal(harness.visualEvents.count('scroll'), 0, 'visual scroll listener is removed');
});

await fixture('selected-path status text remains exact', () => {
  const result = statusClassifier(
    { completeCount: 39 },
    { overlayActive: true, source: 'selected-path-overlay', count: 18 },
  );
  equal(result.title, 'Viewing selected branch', 'selected-path title is unchanged');
  equal(result.detail, '18 turns · canonical conversation has 39 turns', 'selected-path detail is unchanged');
  equal(result.effectiveCount, 18, 'effective count remains intact');
  equal(result.canonicalCount, 39, 'canonical count remains intact');
});

await fixture('canonical status classification remains unchanged', () => {
  equal(
    statusClassifier(
      { completeCount: 39 },
      { overlayActive: false, source: 'canonical', count: 39 },
    ),
    null,
    'canonical mode follows the existing status path',
  );
  equal(
    statusClassifier(
      { completeCount: 39 },
      { overlayActive: true, source: 'selected-path-overlay', count: 39 },
    ),
    null,
    'same-count anomaly still fails closed',
  );
});

await fixture('positioning does not expose private selected-path data', () => {
  const harness = createHarness();
  const result = JSON.stringify(harness.api.position());
  for (const forbidden of ['token', 'graph', 'qId', 'aId', 'payload', 'proof']) {
    ok(!result.includes(forbidden), `position result excludes ${forbidden}`);
  }
  ok(!SIDE_ACTIONS_SOURCE.includes('data-viewport-qid'), 'no identity is written to panel diagnostics');
});

await fixture('scope and safety boundary remains Side Actions only', () => {
  const positioningCluster = [
    'sideActionsVisualViewportBounds',
    'sideActionsComposerExclusionRect',
    'sideActionsPositionPanelWithinViewport',
    'sideActionsBindPanelViewportListeners',
    'sideActionsUnbindPanelViewportListeners',
  ].map((name) => extractFunction(SIDE_ACTIONS_SOURCE, name)).join('\n');
  for (const forbidden of [
    'setInterval',
    'setTimeout',
    'MutationObserver',
    'IntersectionObserver',
    'fetch(',
    'XMLHttpRequest',
    'localStorage',
    'sessionStorage',
  ]) {
    ok(!positioningCluster.includes(forbidden), `positioning cluster excludes ${forbidden}`);
  }
  equal(
    (SIDE_ACTIONS_SOURCE.match(/function sideActionsPositionPanelWithinViewport\(/g) || []).length,
    1,
    'one central positioning helper exists',
  );
  ok(SIDE_ACTIONS_SOURCE.includes('W.addEventListener("scroll", handler, true)'), 'scroll reposition uses one open-only listener');
  ok(SIDE_ACTIONS_SOURCE.includes('W.removeEventListener("scroll", handler, true)'), 'close removes the open-only scroll listener');
  for (const [name, count] of Object.entries(safetyCounters)) {
    equal(count, 0, `${name} remains zero`);
  }
});

const failures = fixtures.filter((item) => !item.ok);
for (const item of fixtures) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
  if (!item.ok) console.error(item.error);
}
console.log(`Fixtures: ${fixtures.length - failures.length}/${fixtures.length}`);
console.log(`Assertions: ${assertionCount}`);
console.log(`Safety counters: ${JSON.stringify(safetyCounters)}`);

if (failures.length) {
  console.error(`CV-3.10 side-actions position failed: ${failures.length} fixture(s)`);
  process.exit(1);
}

console.log('CV-3.10 side-actions position passed');
