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
  storageWrites: 0,
  preferenceWrites: 0,
  canonicalWrites: 0,
  cacheWrites: 0,
  reconciliationAccepts: 0,
  networkCalls: 0,
  newTimers: 0,
  newObservers: 0,
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

function fakeActionElement() {
  const label = { textContent: 'Refresh MiniMap' };
  const stale = {
    textContent: 'Branch changed — refresh MiniMap',
    hidden: true,
  };
  const selectedDetail = { textContent: '', hidden: true };
  return {
    disabled: false,
    dataset: { refreshStatus: 'idle' },
    attributes: new Map(),
    querySelector(selector) {
      if (selector === '.sa-label') return label;
      if (selector === '.sa-branch-stale') return stale;
      if (selector === '.sa-selected-path-detail') return selectedDetail;
      return null;
    },
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
    removeAttribute(name) {
      this.attributes.delete(name);
    },
    label,
    stale,
    selectedDetail,
  };
}

function createHarness({
  canonical = {},
  effective = {},
} = {}) {
  const state = {
    canonical: {
      enabled: true,
      status: 'complete-validated',
      completeCount: 39,
      branchSelectionStale: false,
      ...canonical,
    },
    effective: {
      overlayActive: false,
      source: 'canonical',
      count: 39,
      ...effective,
    },
    canonicalReads: 0,
    effectiveReads: 0,
  };
  const runtime = {
    getCompleteTurnIndexProjectionStatus() {
      state.canonicalReads += 1;
      return state.canonical;
    },
    getEffectivePresentationStatus() {
      state.effectiveReads += 1;
      return state.effective;
    },
  };
  const node = fakeActionElement();
  const code = `(() => {
    const H2O = injectedH2O;
    const COMPLETE_TURN_INDEX_REFRESH_ACTION_ID = 'minimap.complete-turn-index.refresh';
    const state = { actions: new Map([[COMPLETE_TURN_INDEX_REFRESH_ACTION_ID, { node: injectedNode }]]) };
    ${extractFunction(SIDE_ACTIONS_SOURCE, 'sideActionsCompleteTurnIndexRuntime')}
    ${extractFunction(SIDE_ACTIONS_SOURCE, 'sideActionsCompleteTurnIndexStatus')}
    ${extractFunction(SIDE_ACTIONS_SOURCE, 'sideActionsEffectivePresentationStatus')}
    ${extractFunction(SIDE_ACTIONS_SOURCE, 'sideActionsSelectedPathPresentationStatus')}
    ${extractFunction(SIDE_ACTIONS_SOURCE, 'sideActionsApplyMiniMapBranchStaleIndicator')}
    ${extractFunction(SIDE_ACTIONS_SOURCE, 'sideActionsSetMiniMapRefreshFeedback')}
    ${extractFunction(SIDE_ACTIONS_SOURCE, 'sideActionsApplyMiniMapSelectedPathStatus')}
    ${extractFunction(SIDE_ACTIONS_SOURCE, 'sideActionsSyncCompleteTurnIndexRefreshAvailability')}
    return Object.freeze({
      sync: sideActionsSyncCompleteTurnIndexRefreshAvailability,
      classify: sideActionsSelectedPathPresentationStatus,
    });
  })()`;
  const api = vm.runInNewContext(code, {
    injectedH2O: { turnRuntime: runtime },
    injectedNode: node,
    Map,
    Object,
    Number,
    String,
  });
  return { state, node, api };
}

function visibleText(node) {
  return [node.label.textContent, node.stale.textContent, node.selectedDetail.textContent]
    .filter(Boolean)
    .join(' ');
}

await fixture('canonical baseline preserves existing status', () => {
  const harness = createHarness();
  harness.api.sync();
  equal(harness.node.label.textContent, 'Refresh MiniMap', 'canonical label is unchanged');
  equal(harness.node.dataset.refreshStatus, 'idle', 'canonical status remains idle');
  equal(harness.node.selectedDetail.hidden, true, 'selected detail remains hidden');
  equal(harness.node.selectedDetail.textContent, '', 'selected detail remains empty');
  equal(harness.node.stale.hidden, true, 'stale warning remains hidden');
  equal(harness.node.disabled, false, 'enabled canonical control remains enabled');
});

await fixture('selected overlay displays exact title and count detail', () => {
  const harness = createHarness({
    effective: {
      overlayActive: true,
      source: 'selected-path-overlay',
      count: 18,
    },
  });
  harness.api.sync();
  equal(harness.node.label.textContent, 'Viewing selected branch', 'selected title is exact');
  equal(
    harness.node.selectedDetail.textContent,
    '18 turns · canonical conversation has 39 turns',
    'selected detail is exact',
  );
  equal(harness.node.selectedDetail.hidden, false, 'selected detail is visible');
  equal(harness.node.dataset.refreshStatus, 'selected-path', 'selected-path status is explicit');
  equal(harness.node.dataset.selectedPathPresentation, 'true', 'presentation mode is explicit');
  equal(harness.node.stale.hidden, true, 'stale warning is suppressed by proven presentation');
});

await fixture('canonical return removes selected status immediately', () => {
  const harness = createHarness({
    effective: {
      overlayActive: true,
      source: 'selected-path-overlay',
      count: 18,
    },
  });
  harness.api.sync();
  harness.state.effective = { overlayActive: false, source: 'canonical', count: 39 };
  harness.api.sync();
  equal(harness.node.label.textContent, 'Refresh MiniMap', 'canonical label returns');
  equal(harness.node.dataset.refreshStatus, 'idle', 'canonical idle status returns');
  equal(harness.node.selectedDetail.hidden, true, 'selected detail hides');
  equal(harness.node.selectedDetail.textContent, '', 'selected detail clears');
  equal(harness.node.dataset.selectedPathPresentation, 'false', 'selected presentation retires');
});

await fixture('inactive stale overlay preserves truthful fail-closed warning', () => {
  const harness = createHarness({
    canonical: { branchSelectionStale: true },
    effective: { overlayActive: false, source: 'canonical', count: 39 },
  });
  harness.api.sync();
  equal(harness.node.label.textContent, 'Refresh MiniMap', 'stale label remains canonical control');
  equal(harness.node.dataset.refreshStatus, 'stale', 'stale status remains');
  equal(harness.node.stale.hidden, false, 'stale warning remains visible');
  equal(harness.node.stale.textContent, 'Branch changed — refresh MiniMap', 'stale warning text is unchanged');
  equal(harness.node.selectedDetail.hidden, true, 'selected detail is not shown');
  ok(!visibleText(harness.node).includes('Viewing selected branch'), 'no false selected claim is visible');
});

await fixture('invalid effective statuses fall back to canonical behavior', () => {
  const variants = [
    { overlayActive: true, source: 'selected-path-overlay' },
    { overlayActive: true, source: 'canonical', count: 18 },
    { overlayActive: false, source: 'selected-path-overlay', count: 18 },
    { overlayActive: true, source: 'selected-path-overlay', count: 0 },
    { overlayActive: true, source: 'selected-path-overlay', count: 18.5 },
  ];
  for (const effective of variants) {
    const harness = createHarness({ effective });
    harness.api.sync();
    equal(harness.node.label.textContent, 'Refresh MiniMap', 'invalid status keeps canonical label');
    equal(harness.node.selectedDetail.hidden, true, 'invalid status hides selected detail');
    equal(harness.node.dataset.selectedPathPresentation, 'false', 'invalid status remains canonical');
  }
});

await fixture('same-count overlay anomaly does not claim selected presentation', () => {
  const harness = createHarness({
    effective: {
      overlayActive: true,
      source: 'selected-path-overlay',
      count: 39,
    },
  });
  equal(harness.api.classify(harness.state.canonical, harness.state.effective), null, 'same-count status is rejected');
  harness.api.sync();
  equal(harness.node.label.textContent, 'Refresh MiniMap', 'same-count anomaly keeps canonical label');
  equal(harness.node.selectedDetail.hidden, true, 'same-count anomaly hides detail');
  equal(harness.node.dataset.refreshStatus, 'idle', 'same-count anomaly remains idle');
});

await fixture('visible status excludes private proof and identity data', () => {
  const secrets = [
    'token-private-123',
    'graph-private-456',
    'qid-private-789',
    'aid-private-321',
    'payload-private-654',
    'proof-private-987',
  ];
  const harness = createHarness({
    canonical: {
      branchSelectionStaleQId: secrets[2],
      proof: secrets[5],
    },
    effective: {
      overlayActive: true,
      source: 'selected-path-overlay',
      count: 18,
      token: secrets[0],
      graph: secrets[1],
      anchorQId: secrets[2],
      anchorAId: secrets[3],
      providerPayload: secrets[4],
      proof: secrets[5],
    },
  });
  harness.api.sync();
  const visible = visibleText(harness.node);
  equal(harness.node.label.textContent, 'Viewing selected branch', 'privacy fixture still activates');
  equal(
    harness.node.selectedDetail.textContent,
    '18 turns · canonical conversation has 39 turns',
    'visible detail contains counts only',
  );
  for (const secret of secrets) ok(!visible.includes(secret), `visible status excludes ${secret}`);
});

await fixture('repeated unchanged updates are idempotent', () => {
  const harness = createHarness({
    effective: {
      overlayActive: true,
      source: 'selected-path-overlay',
      count: 18,
    },
  });
  harness.api.sync();
  const first = {
    label: harness.node.label.textContent,
    detail: harness.node.selectedDetail.textContent,
    refreshStatus: harness.node.dataset.refreshStatus,
    selectedPathPresentation: harness.node.dataset.selectedPathPresentation,
  };
  harness.api.sync();
  const second = {
    label: harness.node.label.textContent,
    detail: harness.node.selectedDetail.textContent,
    refreshStatus: harness.node.dataset.refreshStatus,
    selectedPathPresentation: harness.node.dataset.selectedPathPresentation,
  };
  equal(second, first, 'unchanged update produces the same visible state');
  equal(
    harness.node.selectedDetail.textContent.split('Viewing selected branch').length,
    1,
    'title is not duplicated into detail',
  );
  equal(
    (SIDE_ACTIONS_SOURCE.match(/addEventListener\(\s*COMPLETE_TURN_INDEX_STATE_EVENT/g) || []).length,
    1,
    'existing complete-index update listener remains singular',
  );
  equal(
    (SIDE_ACTIONS_SOURCE.match(/addEventListener\(\s*CORE_TURN_UPDATED_EVENT/g) || []).length,
    1,
    'existing Core turn-update lifecycle has one selected-status listener',
  );
});

await fixture('consumer boundary and safety invariants remain narrow', () => {
  const productionFiles = fs.readdirSync(path.join(ROOT, 'src-runtime-base'))
    .filter((name) => name.endsWith('.js'));
  const statusTextConsumers = productionFiles.filter((name) => {
    const source = fs.readFileSync(path.join(ROOT, 'src-runtime-base', name), 'utf8');
    return source.includes('Viewing selected branch')
      || source.includes('canonical conversation has ${canonicalCount} turns');
  });
  equal(statusTextConsumers, [path.basename(SIDE_ACTIONS_PATH)], 'selected-path status text exists only in Side Actions');
  equal(
    (SIDE_ACTIONS_SOURCE.match(/\["getEffective", "PresentationStatus"\]\.join\(""\)/g) || []).length,
    1,
    'Side Actions has one computed effective-status consumer matching the established boundary',
  );
  const statusCluster = [
    'sideActionsEffectivePresentationStatus',
    'sideActionsSelectedPathPresentationStatus',
    'sideActionsApplyMiniMapSelectedPathStatus',
  ].map((name) => extractFunction(SIDE_ACTIONS_SOURCE, name)).join('\n');
  for (const forbidden of [
    'localStorage',
    'sessionStorage',
    'fetch(',
    'XMLHttpRequest',
    'setTimeout',
    'setInterval',
    'requestAnimationFrame',
    'MutationObserver',
    'IntersectionObserver',
  ]) {
    ok(!statusCluster.includes(forbidden), `status cluster excludes ${forbidden}`);
  }
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
  console.error(`CV-3.9 selected-path status failed: ${failures.length} fixture(s)`);
  process.exit(1);
}

console.log('CV-3.9 selected-path status passed');
