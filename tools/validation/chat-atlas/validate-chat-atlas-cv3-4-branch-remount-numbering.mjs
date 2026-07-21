#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TITLE_PATH = 'src-runtime-base/1C1a.🟥📛 Turn Title Bar 📛.js';
const TIMESTAMP_PATH = 'src-runtime-base/1Z1a.🔴⏳ Answer Timestamp ⏳.js';
const ANSWER_NUMBER_PATH = 'src-runtime-base/1X1a.🔴🧮 Answer Numbers 🧮.js';
const QUESTION_NUMBER_PATH = 'src-runtime-base/2X1a.🟡🔢 Question Numbers 🔢.js';
const TITLE_SOURCE = fs.readFileSync(path.join(ROOT, TITLE_PATH), 'utf8');
const TIMESTAMP_SOURCE = fs.readFileSync(path.join(ROOT, TIMESTAMP_PATH), 'utf8');
const ANSWER_NUMBER_SOURCE = fs.readFileSync(path.join(ROOT, ANSWER_NUMBER_PATH), 'utf8');
const QUESTION_NUMBER_SOURCE = fs.readFileSync(path.join(ROOT, QUESTION_NUMBER_PATH), 'utf8');

let assertionCount = 0;
const results = [];
const counters = {
  titleProjects: 0,
  timestampLabels: 0,
  largeNumberResolutions: 0,
  canonicalAnswerReads: 0,
  canonicalQuestionReads: 0,
  canonicalWrites: 0,
  aliasWrites: 0,
  storageWrites: 0,
  networkCalls: 0,
  reconciliationAccepts: 0,
  reconciliationGets: 0,
  confirmations: 0,
  selectedPathPublications: 0,
  primaryMutations: 0,
  timers: 0,
  mutationObservers: 0,
  observerDisconnects: 0,
  mutationCallbacks: 0,
  answerTargetsCollected: 0,
  answerTargetsScheduled: 0,
  answerTargetsRejected: 0,
  rafsScheduled: 0,
  rafsCoalesced: 0,
  rafsFlushed: 0,
  rafsCanceled: 0,
  queueTargetsCleared: 0,
  staleTargetsDiscarded: 0,
  patchReads: 0,
  suppressions: 0,
  patchApplications: 0,
  visibleLargeNumberRemovals: 0,
  visibleLargeNumberRestorations: 0,
  cacheInvalidations: 0,
  cacheRestorations: 0,
};

function equal(actual, expected, message) {
  assertionCount += 1;
  assert.deepEqual(actual, expected, message);
}

function ok(value, message) {
  assertionCount += 1;
  assert.ok(value, message);
}

async function fixture(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error?.stack || error) });
    console.error(`FAIL ${name}`);
    console.error(error?.stack || error);
  }
}

function declaration(source, name, kind = 'const') {
  const token = kind === 'function' ? `  function ${name}(` : `  const ${name} =`;
  const start = source.indexOf(token);
  if (start < 0) throw new Error(`production-declaration-missing:${name}`);
  const brace = source.indexOf('{', start);
  if (brace < 0) throw new Error(`production-declaration-body-missing:${name}`);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        if (kind === 'function') return source.slice(start, index + 1);
        const semicolon = source.indexOf(';', index);
        if (semicolon < 0) throw new Error(`production-declaration-end-missing:${name}`);
        return source.slice(start, semicolon + 1);
      }
    }
  }
  throw new Error(`production-declaration-unclosed:${name}`);
}

function makeNode(attrs = {}, opts = {}) {
  const values = new Map(Object.entries(attrs));
  const classes = new Set(String(opts.className || '').split(/\s+/).filter(Boolean));
  const styleValues = new Map();
  const node = {
    nodeType: 1,
    isConnected: opts.isConnected !== false,
    hidden: opts.hidden === true,
    dataset: { ...(opts.dataset || {}) },
    textContent: opts.textContent || '',
    innerHTML: opts.innerHTML || '',
    childElementCount: opts.childElementCount || 0,
    scrollHeight: opts.scrollHeight || 300,
    parentElement: opts.parentElement || null,
    style: {
      setProperty(name, value) { styleValues.set(name, String(value)); },
      removeProperty(name) { styleValues.delete(name); },
      getPropertyValue(name) { return styleValues.get(name) || ''; },
    },
    classList: {
      contains(name) { return classes.has(name); },
      add(...names) { names.forEach((name) => classes.add(name)); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
    },
    get className() { return Array.from(classes).join(' '); },
    set className(value) {
      classes.clear();
      String(value || '').split(/\s+/).filter(Boolean).forEach((name) => classes.add(name));
    },
    getAttribute(name) { return values.has(name) ? values.get(name) : null; },
    setAttribute(name, value) { values.set(name, String(value)); },
    removeAttribute(name) { values.delete(name); },
    hasAttribute(name) { return values.has(name); },
    matches(selector) {
      if (selector.includes('data-message-author-role="user"')) {
        return values.get('data-message-author-role') === 'user';
      }
      if (selector.includes('data-message-author-role="assistant"')) {
        return values.get('data-message-author-role') === 'assistant';
      }
      if (selector.includes('data-h2o-turn-num')) return values.has('data-h2o-turn-num');
      if (selector.includes('cgxui-ats-ts')) return classes.has('cgxui-ats-ts');
      if (selector.includes('chatgpt-timestamp')) return classes.has('chatgpt-timestamp');
      return false;
    },
    querySelector(selector) { return opts.querySelector?.(selector) || null; },
    querySelectorAll(selector) { return opts.querySelectorAll?.(selector) || []; },
    closest(selector) { return opts.closest?.(selector) || null; },
    contains(other) { return opts.contains?.(other) || other === node; },
    insertBefore(child) { opts.insertBefore?.(child); return child; },
    appendChild(child) { opts.appendChild?.(child); return child; },
    _attrs: values,
    _style: styleValues,
  };
  return node;
}

function canonicalRecords() {
  const rows = Array.from({ length: 39 }, (_value, index) => {
    const turnNo = index + 1;
    return {
      turnNo,
      idx: turnNo,
      index: turnNo,
      qId: `fixture-q-${String(turnNo).padStart(2, '0')}`,
      answerIds: [`fixture-a-${String(turnNo).padStart(2, '0')}`],
      primaryAId: `fixture-a-${String(turnNo).padStart(2, '0')}`,
    };
  });
  rows[16] = {
    ...rows[16],
    qId: 'fixture-q-17',
    answerIds: ['fixture-a-17-branch-1', 'fixture-a-17-branch-2'],
    primaryAId: 'fixture-a-17-branch-1',
  };
  rows[17] = {
    ...rows[17],
    qId: 'fixture-q-18',
    answerIds: ['fixture-a-18-original'],
    primaryAId: 'fixture-a-18-original',
  };
  return rows;
}

function createRuntime(rows, enabled = true) {
  const byAId = new Map();
  const byQId = new Map();
  for (const row of rows) {
    byQId.set(row.qId, row);
    for (const answerId of row.answerIds) byAId.set(answerId, row);
  }
  return {
    getTurnRecordByAId(id) {
      counters.canonicalAnswerReads += 1;
      return byAId.get(String(id || '')) || null;
    },
    getTurnRecordByTurnId(id) {
      const raw = String(id || '').replace(/^turn:a:/, '');
      return byAId.get(raw) || byQId.get(raw.replace(/^turn:/, '')) || null;
    },
    getTurnRecordByQId(id) {
      counters.canonicalQuestionReads += 1;
      return byQId.get(String(id || '')) || null;
    },
    getCompleteTurnIndexProjectionStatus() {
      return { enabled, authoritative: enabled, count: rows.length };
    },
    getCompleteTurnIndexProjectionPreference() { return { enabled }; },
    setCompleteTurnIndexProjectionPreference() { counters.canonicalWrites += 1; },
    refreshCompleteTurnIndexProjection() { counters.networkCalls += 1; },
    rebuildCompleteTurnIndexProjection() { counters.networkCalls += 1; },
    listTurnRecords() { return rows.slice(); },
  };
}

function compileTitleRuntime(runtime, dom, legacyIndex = 0) {
  const context = vm.createContext({
    Number,
    Math,
    String,
    W: {
      H2O: {
        turnRuntime: runtime,
        msg: { getIdFromEl: (el) => el?.getAttribute?.('data-message-id') || '' },
        turn: { getTurnIndexByAEl: () => legacyIndex },
      },
    },
    ATTR_: { MSG_ID: 'data-message-id' },
    UI_: { LABEL: 'label' },
    API_AT_normalizeAnswerId: (value) => String(value || '').trim(),
    DOM_getAnswerId: (el) => el?.getAttribute?.('data-message-id') || null,
    DOM_getAnswerTurnHost: (el) => el?.closest?.('[data-testid="conversation-turn"]') || null,
    DOM_getAdjacentTurnHost: (host, direction) => direction < 0 ? (host?._previous || null) : null,
    DOM_turnHostHasRole: (host, role) => {
      const value = String(host?.getAttribute?.('data-turn') || '').trim();
      if (value) return value === role;
      return !!host?.querySelector?.(`[data-message-author-role="${role}"]`);
    },
    DOM_selScoped: (value) => value,
    UTIL_setAttr: (el, name, value) => el.setAttribute(name, value),
    UTIL_delAttr: (el, name) => el.removeAttribute(name),
  });
  const names = [
    'DOM_readCanonicalTurnNumber',
    'DOM_completeTurnIndexProjectionEnabled',
    'DOM_getCanonicalQuestionOwnerNumber',
    'DOM_getUserCandidates',
    'DOM_getCanonicalOwnerTurnNumber',
    'DOM_getTurnNumber',
    'DOM_projectTurnNumber',
  ];
  const code = names.map((name) => declaration(TITLE_SOURCE, name)).join('\n');
  vm.runInContext(`${code}\nglobalThis.__api = { ${names.join(', ')} };`, context);
  return context.__api;
}

function titleBar(initialTurnNumber = '') {
  const label = { textContent: initialTurnNumber ? `TITLE ${initialTurnNumber}` : 'TITLE' };
  const bar = makeNode(initialTurnNumber ? { 'data-h2o-turn-num': String(initialTurnNumber) } : {}, {
    querySelector: (selector) => selector === 'label' ? label : null,
  });
  bar._label = label;
  return bar;
}

function compileTimestampRuntime(runtime, root, getAIndex = () => 1, legacyIndex = 0) {
  const context = vm.createContext({
    Number,
    Math,
    String,
    Array,
    W: {
      H2O: {
        turnRuntime: runtime,
        msg: { getIdFromEl: (el) => el?.getAttribute?.('data-message-id') || '' },
        turn: { getTurnIndexByAEl: () => legacyIndex },
        time: { format: () => 'Jul 20' },
      },
    },
    DOC: root,
    SkID: 'ats',
    SEL_: {
      ASSIST_MSG: '[data-message-author-role="assistant"]',
      USER_MSG: '[data-message-author-role="user"]',
      STAMP_OURS: ':scope > .cgxui-ats-ts',
      STAMP_LEGACY: ':scope > .chatgpt-timestamp',
      CONV_TURN_ANY: '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]',
    },
    ATTR_: { OWNER: 'data-cgxui-owner', UI: 'data-cgxui' },
    CSS_: { STAMP_CLASS_OURS: 'cgxui-ats-ts', STAMP_CLASS_LEGACY: 'chatgpt-timestamp' },
    TITLE_BAR_SEL_: '[data-h2o-turn-num]',
    DOM_AT_getConversationRoot: () => root,
    DOM_AT_getPaginationTurnOffset: () => 0,
    DOM_AT_getAIndex: getAIndex,
    DOM_AT_getCreateTime: () => 1,
    UTIL_AT_formatLocal: () => 'Jul 20',
    CORE_AT_perfInc: () => {},
    DOM_AT_syncAnchorVars: () => {},
    DOM_AT_clearAnchorVars: () => {},
  });
  const declarations = [
    ['DOM_AT_readCanonicalTurnNumber', 'function'],
    ['DOM_AT_completeTurnIndexProjectionEnabled', 'function'],
    ['DOM_AT_getUserCandidates', 'function'],
    ['DOM_AT_getCanonicalQuestionOwnerNumber', 'function'],
    ['DOM_AT_getCanonicalOwnerTurnNumber', 'function'],
    ['DOM_AT_getCanonicalTurnIndexFromRuntime', 'function'],
    ['DOM_AT_getTurnIndex', 'function'],
    ['UI_AT_buildLabel', 'function'],
    ['DOM_AT_addOrUpdateOne', 'function'],
  ];
  const code = declarations.map(([name, kind]) => declaration(TIMESTAMP_SOURCE, name, kind)).join('\n');
  const names = declarations.map(([name]) => name);
  vm.runInContext(`${code}\nglobalThis.__api = { ${names.join(', ')} };`, context);
  return context.__api;
}

function compileAnswerNumberRuntime(runtime, root = null) {
  const rootRef = root && Object.prototype.hasOwnProperty.call(root, 'current')
    ? root
    : { current: root };
  const STABLE_NUMBERS = { byAnswerId: new Map(), byTurnId: new Map() };
  const PERF = { skippedBySig: 0, processed: 0, fullScans: 0, deltaUpdates: 0, ticker: 0 };
  const probe = {
    mutationObservers: 0,
    observerDisconnects: 0,
    mutationCallbacks: 0,
    answerTargetsCollected: 0,
    answerTargetsScheduled: 0,
    answerTargetsRejected: 0,
    rafsScheduled: 0,
    rafsCoalesced: 0,
    rafsFlushed: 0,
    rafsCanceled: 0,
    queueTargetsCleared: 0,
    staleTargetsDiscarded: 0,
    patchReads: 0,
    suppressions: 0,
    patchApplications: 0,
    visibleLargeNumberRemovals: 0,
    visibleLargeNumberRestorations: 0,
    cacheInvalidations: 0,
    cacheRestorations: 0,
  };
  const observerState = { instances: [] };
  const rafQueue = new Map();
  let nextRafId = 1;

  class HarnessMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.active = false;
      this.root = null;
      this.options = null;
      observerState.instances.push(this);
      probe.mutationObservers += 1;
      counters.mutationObservers += 1;
    }

    observe(target, options) {
      this.active = true;
      this.root = target;
      this.options = { ...options };
    }

    disconnect() {
      if (!this.active) return;
      this.active = false;
      probe.observerDisconnects += 1;
      counters.observerDisconnects += 1;
    }

    deliver(mutations) {
      if (!this.active) return false;
      probe.mutationCallbacks += 1;
      counters.mutationCallbacks += 1;
      this.callback(mutations);
      return true;
    }
  }

  const requestAnimationFrame = (callback) => {
    const id = nextRafId++;
    rafQueue.set(id, callback);
    probe.rafsScheduled += 1;
    counters.rafsScheduled += 1;
    return id;
  };
  const cancelAnimationFrame = (id) => {
    if (!rafQueue.delete(id)) return;
    probe.rafsCanceled += 1;
    counters.rafsCanceled += 1;
  };
  const body = makeNode();
  const DIAG = { lastIncCount: 0, lastFlushMs: 0, lastFullScanCount: 0, lastErr: null, disposeCount: 0 };
  const context = vm.createContext({
    Number,
    String,
    Math,
    Map,
    Set,
    Array,
    HTMLElement: Object,
    MutationObserver: HarnessMutationObserver,
    requestAnimationFrame,
    performance: { now: () => 1 },
    W: {
      H2O: {
        turnRuntime: runtime,
        msg: { getIdFromEl: (el) => el?.getAttribute?.('data-message-id') || '' },
      },
      CSS: { escape: (value) => value },
      location: { pathname: '/c/fixture' },
      cancelAnimationFrame,
      setTimeout: () => { counters.timers += 1; return 1; },
      clearTimeout: () => {},
      clearInterval: () => {},
    },
    D: {
      body,
      querySelector: () => null,
      querySelectorAll: (selector) => selector.includes('assistant')
        ? Array.from(rootRef.current?._answers || [])
        : [],
      createElement: () => makeNode({}, { className: 'big-number' }),
      getElementById: () => null,
    },
    ATTR: {
      OWNER: 'data-cgxui-owner',
      UNCLIP_DONE: 'data-cgxui-ansn-unclip-done',
      TURN_OVF_DONE: 'data-cgxui-ansn-turn-ovf-done',
      SIG_FAST: 'data-h2o-x1n-sig',
      SIG_NUM: 'data-cgxui-ansn-num',
      SIG_SHORT: 'data-cgxui-ansn-short',
      SIG_REGEN: 'data-cgxui-ansn-regen',
      CONTENT_SIG: 'data-h2o-x1n-csig',
      BIG_NUM_SOURCE: 'data-h2o-big-answer-num-source',
      BIG_NUM_STABLE: 'data-h2o-big-answer-num-stable',
      BIG_ANSWER_ID: 'data-h2o-big-answer-id',
      BIG_TURN_ID: 'data-h2o-big-answer-turn-id',
      BIG_NUM: 'data-h2o-big-answer-num',
    },
    CLS: {
      BIG: 'big-number',
      WRAP: 'answer-wrap',
      VFADE: 'vfade',
      UNCLIP: 'unclip',
      TURN_OVF: 'turn-overflow',
    },
    SEL: {
      ANSWER: '[data-message-author-role="assistant"]',
      USER: '[data-message-author-role="user"]',
      TURN: '[data-testid="conversation-turn"]',
      TURN_ANY: '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]',
      NUMBER_META: '[data-h2o-turn-num], .cgxui-ats-ts, .chatgpt-timestamp, [data-cgxui="ats-stamp"]',
    },
    CFG: { INC_PER_FRAME: 40, MAX_DELTA_CHILDREN: 24, BUS_DEBOUNCE_MS: 260 },
    CSS: { STYLE_ID: 'fixture-style' },
    DIAG,
    STABLE_NUMBERS,
    PERF,
    CLEAN: [],
    SkID: 'ansn',
    __probe: probe,
    UTIL_findConversationRoot: () => rootRef.current,
    UTIL_getRegenInfoForAnswer: () => null,
    UTIL_contentSig: () => 'fixture',
    UTIL_readShort: () => false,
    UTIL_ensureTurnOverflowOnce: () => {},
    UTIL_unclipAncestorsOnce: () => {},
    UTIL_buildInnerHTML: (number) => String(number),
    UTIL_digitClass: () => 'digit',
  });
  const names = [
    'UTIL_positiveInt',
    'UTIL_getAnswerId',
    'UTIL_routeKey',
    'UTIL_cacheKey',
    'UTIL_completeTurnIndexProjectionEnabled',
    'UTIL_readCanonicalTurnNumber',
    'UTIL_getUserCandidates',
    'UTIL_getUniqueCanonicalQuestionRecord',
    'UTIL_getCanonicalOwnerRecord',
    'UTIL_getRuntimeIdentity',
    'UTIL_getTitleTurnNum',
    'UTIL_getTimestampTurnNum',
    'UTIL_getCachedStableNumber',
    'UTIL_rememberStableNumber',
    'UTIL_forgetStableNumber',
    'UTIL_getStampedStableNumber',
    'resolveStableBigAnswerNumber',
    'CORE_suppressUnstableBigNumber',
    'CORE_readPatch',
    'CORE_applyPatch',
    'CORE_fullScan',
    'CORE_isCurrentAnswerTarget',
    'CORE_cancelPendingFlush',
    'CORE_clearPendingAnswers',
    'CORE_flush',
    'CORE_scheduleFlush',
    'CORE_scheduleFullScan',
    'CORE_scheduleFullScanDebounced',
    'CORE_scheduleAnswer',
    'UTIL_collectAssistantNode',
    'OBS_collectNumberMutationSignals',
    'OBS_attachMO',
    'OBS_detachMO',
    'onRouteOrPageEvent',
    'CORE_ANSNUM_dispose',
  ];
  const code = names.map((name) => declaration(ANSWER_NUMBER_SOURCE, name, 'function')).join('\n');
  const state = `
    let rafPending = false;
    let rafHandle = 0;
    let needFull = false;
    let fullDebounceT = 0;
    const pending = new Set();
    let MO = null;
    let MO_ROOT = null;
    let booted = true;
  `;
  const instrumentation = `
    const __collect = OBS_collectNumberMutationSignals;
    OBS_collectNumberMutationSignals = function(muts) {
      const signals = __collect(muts);
      __probe.answerTargetsCollected += signals.hit.size;
      return signals;
    };
    const __target = CORE_isCurrentAnswerTarget;
    CORE_isCurrentAnswerTarget = function(el, root) {
      const valid = arguments.length > 1 ? __target(el, root) : __target(el);
      if (!valid && __probe.inFlush && el) __probe.staleTargetsDiscarded += 1;
      return valid;
    };
    const __schedule = CORE_scheduleAnswer;
    CORE_scheduleAnswer = function(el) {
      const before = PERF.deltaUpdates;
      __schedule(el);
      if (PERF.deltaUpdates > before) __probe.answerTargetsScheduled += 1;
      else __probe.answerTargetsRejected += 1;
    };
    const __scheduleFlush = CORE_scheduleFlush;
    CORE_scheduleFlush = function() {
      const before = __probe.rafsScheduled;
      __scheduleFlush();
      if (__probe.rafsScheduled === before && rafPending) __probe.rafsCoalesced += 1;
    };
    const __clear = CORE_clearPendingAnswers;
    CORE_clearPendingAnswers = function(cancelFlush) {
      const before = pending.size;
      __clear(cancelFlush);
      __probe.queueTargetsCleared += Math.max(0, before - pending.size);
    };
    const __suppress = CORE_suppressUnstableBigNumber;
    CORE_suppressUnstableBigNumber = function(el, resolution) {
      const big = el?.querySelector?.(':scope > .' + CLS.BIG) || null;
      const wasVisible = !!big && !big.hidden;
      __probe.suppressions += 1;
      __suppress(el, resolution);
      if (wasVisible && big?.hidden) __probe.visibleLargeNumberRemovals += 1;
    };
    const __forget = UTIL_forgetStableNumber;
    UTIL_forgetStableNumber = function(identity) {
      __probe.cacheInvalidations += 1;
      return __forget(identity);
    };
    const __remember = UTIL_rememberStableNumber;
    UTIL_rememberStableNumber = function(identity, number) {
      __probe.cacheRestorations += 1;
      return __remember(identity, number);
    };
    const __read = CORE_readPatch;
    CORE_readPatch = function(el) {
      __probe.patchReads += 1;
      return __read(el);
    };
    const __apply = CORE_applyPatch;
    CORE_applyPatch = function(patch) {
      const big = patch?.el?.querySelector?.(':scope > .' + CLS.BIG) || null;
      const wasHidden = !big || big.hidden;
      __probe.patchApplications += 1;
      __apply(patch);
      if (wasHidden && patch?.el?.querySelector?.(':scope > .' + CLS.BIG)?.hidden === false) {
        __probe.visibleLargeNumberRestorations += 1;
      }
    };
    const __flush = CORE_flush;
    CORE_flush = function() {
      __probe.inFlush = true;
      try { return __flush(); }
      finally { __probe.inFlush = false; }
    };
    globalThis.__api = {
      ${names.join(', ')},
      __state: () => ({
        pendingSize: pending.size,
        rafPending,
        rafHandle,
        needFull,
        observer: MO,
        observerRoot: MO_ROOT,
      }),
    };
  `;
  vm.runInContext(`${state}\n${code}\n${instrumentation}`, context);

  function flushOneRaf() {
    const entry = rafQueue.entries().next().value;
    if (!entry) return false;
    const [id, callback] = entry;
    rafQueue.delete(id);
    probe.rafsFlushed += 1;
    counters.rafsFlushed += 1;
    callback();
    return true;
  }

  function deliver(mutations) {
    const observer = context.__api.__state().observer;
    return observer?.deliver?.(mutations) === true;
  }

  return {
    api: context.__api,
    stable: STABLE_NUMBERS,
    perf: PERF,
    probe,
    rootRef,
    observerState,
    deliver,
    flushOneRaf,
    flushAllRafs() {
      let count = 0;
      while (flushOneRaf()) count += 1;
      return count;
    },
    pendingRafs: () => rafQueue.size,
  };
}

function compileQuestionNumberRuntime(runtime) {
  const numberNode = makeNode({ 'data-h2o-qbig-sig-num': '1||' }, {
    className: 'cgxui-qbig-number',
    innerHTML: '1',
  });
  const context = vm.createContext({
    Number,
    Math,
    String,
    HTMLElement: Object,
    W: {
      H2O: {
        turnRuntime: runtime,
        msg: { getIdFromEl: (el) => el?.getAttribute?.('data-message-id') || '' },
        index: { getQId: (el) => el?.getAttribute?.('data-message-id') || '' },
      },
      H2O_Pagination: null,
    },
    D: {},
    SEL: {
      TURN: '[data-testid="conversation-turn"]',
      TURN_ROOT: '[tabindex="-1"]',
      TURN_GROUP_HINT: '[class*="group/turn-messages"]',
    },
    ATTR: { SIG_NUM: 'data-h2o-qbig-sig-num', SIG_POS: 'data-h2o-qbig-sig-pos' },
    UI: { NUM_CLASS: 'cgxui-qbig-number' },
    MOD: { state: { scanIndexByHost: new WeakMap(), scanIndexCounter: 0 } },
    getStableQuestionIdFromElement: (el) => el?.getAttribute?.('data-message-id') || '',
    getCanonicalTurnNumFromPaginationState: () => 0,
    getCanonicalTurnNumFromTurnRoot: () => 0,
    isPaginationEnabled: () => false,
    getPaginationTurnNumFromDomWindow: () => 1,
    getDomAnsweredTurnOrdinal: () => 1,
    ensureHostFallback: () => {},
    ensureNumNode: () => numberNode,
    digitClass: () => 'digit',
    makeNumHTML: (number) => String(number),
    setAttr: (el, name, value) => el.setAttribute(name, value),
    PERF: { positionedVisibleCount: 0 },
  });
  const names = [
    'readCanonicalTurnNumFromRecord',
    'getCanonicalTurnNum',
    'isCompleteTurnIndexProjectionEnabled',
    'computeDisplayNumber',
    'applyPatch',
  ];
  const code = names.map((name) => declaration(QUESTION_NUMBER_SOURCE, name, 'function')).join('\n');
  vm.runInContext(`${code}\nglobalThis.__api = { ${names.join(', ')} };`, context);
  return { api: context.__api, numberNode };
}

function branchDom(qId = 'fixture-q-18', answerId = 'fixture-a-18-remounted', opts = {}) {
  const qIds = Array.isArray(opts.qIds) ? opts.qIds : [qId];
  const questions = qIds.map((id) => makeNode({
    'data-message-author-role': 'user',
    'data-message-id': id,
  }));
  const question = questions[0] || null;
  const questionTurn = makeNode({ 'data-turn': 'user', 'data-testid': 'conversation-turn-35' }, {
    querySelector: (selector) => selector.includes('data-message-author-role="user"') ? question : null,
    querySelectorAll: (selector) => selector.includes('data-message-author-role="user"') ? questions : [],
  });
  questions.forEach((candidate) => {
    candidate.closest = () => questionTurn;
  });
  let answerTurn = null;
  const answer = makeNode({
    'data-message-author-role': 'assistant',
    'data-message-id': answerId,
  }, {
    closest: () => answerTurn,
  });
  const sameTurnQuestions = opts.sameTurn === true ? questions : [];
  answerTurn = makeNode({ 'data-turn': 'assistant', 'data-testid': 'conversation-turn-36' }, {
    querySelector: (selector) => selector.includes('data-message-author-role="user"')
      ? (sameTurnQuestions[0] || null)
      : null,
    querySelectorAll: (selector) => selector.includes('data-message-author-role="user"')
      ? sameTurnQuestions
      : [],
  });
  answerTurn._previous = opts.systemIntermediate
    ? makeNode({ 'data-turn': 'tool', 'data-testid': 'conversation-turn-tool' })
    : questionTurn;
  const turns = opts.sameTurn === true
    ? [answerTurn]
    : (opts.systemIntermediate ? [questionTurn, answerTurn._previous, answerTurn] : [questionTurn, answerTurn]);
  const root = makeNode({}, {
    querySelectorAll: (selector) => {
      if (selector.includes('conversation-turn')) return turns;
      if (selector.includes('assistant')) return [answer];
      return [];
    },
    contains: (node) => root.isConnected !== false
      && node?.isConnected !== false
      && (node === answer || turns.includes(node) || questions.includes(node)),
  });
  root._answers = [answer];
  root._turns = turns;
  return { question, questions, questionTurn, answer, answerTurn, root };
}

function combineConversationRoots(...doms) {
  const answers = doms.map((dom) => dom.answer);
  const turns = doms.flatMap((dom) => dom.root._turns || []);
  const questions = doms.flatMap((dom) => dom.questions || []);
  const root = makeNode({}, {
    querySelectorAll: (selector) => {
      if (selector.includes('conversation-turn')) return turns;
      if (selector.includes('assistant')) return answers;
      return [];
    },
    contains: (node) => root.isConnected !== false
      && node?.isConnected !== false
      && (answers.includes(node) || turns.includes(node) || questions.includes(node)),
  });
  root._answers = answers;
  root._turns = turns;
  return root;
}

function answerNumberElement(answerId, titleNumber = 0, timestampNumber = 0) {
  const title = titleNumber ? makeNode({ 'data-h2o-turn-num': String(titleNumber) }) : null;
  const stamp = timestampNumber
    ? { dataset: { fullLabel: `Jul 20 | ${timestampNumber}` }, textContent: `Jul 20 | ${timestampNumber}` }
    : null;
  const turn = makeNode({ 'data-testid': 'conversation-turn-36' });
  return makeNode({ 'data-message-id': answerId }, {
    closest: () => turn,
    querySelector: (selector) => {
      if (selector.includes('cgxui-ats-ts') || selector.includes('chatgpt-timestamp')) return stamp;
      if (selector === '[data-h2o-turn-num]') return title;
      if (selector.includes('.big-number')) return null;
      return null;
    },
  });
}

function attachPresentation(dom, initialNumber = 1) {
  const bar = titleBar(initialNumber);
  const stamp = makeNode({ 'data-full-label': `Jul 20 | ${initialNumber}` }, {
    className: 'cgxui-ats-ts chatgpt-timestamp',
    dataset: { fullLabel: `Jul 20 | ${initialNumber}` },
    textContent: `Jul 20 | ${initialNumber}`,
    closest: (selector) => selector.includes('assistant') ? dom.answer : null,
  });
  const big = makeNode({
    'data-h2o-big-answer-num-stable': '1',
    'data-h2o-big-answer-num-source': 'title-metadata',
    'data-h2o-big-answer-num': String(initialNumber),
    'data-h2o-big-answer-id': dom.answer.getAttribute('data-message-id') || '',
    'data-h2o-big-answer-turn-id': 'turn:q18',
  }, {
    className: 'big-number',
    innerHTML: String(initialNumber),
    closest: (selector) => selector.includes('assistant') ? dom.answer : null,
  });
  bar.closest = (selector) => selector.includes('assistant') ? dom.answer : null;
  const originalClosest = dom.answer.closest.bind(dom.answer);
  dom.answer.closest = (selector) => selector.includes('assistant') ? dom.answer : originalClosest(selector);
  dom.answer.querySelector = (selector) => {
    if (selector === '[data-h2o-turn-num]') return bar.hasAttribute('data-h2o-turn-num') ? bar : null;
    if (selector.includes('cgxui-ats-ts') || selector.includes('chatgpt-timestamp') || selector.includes('ats-stamp')) return stamp;
    if (selector.includes('.big-number') || selector.includes('cgxui-ansn-big-number')) return big;
    if (selector.includes('.ho-big-number') || selector.includes('.ho-small-number-box')) return null;
    return null;
  };
  dom.answer.insertBefore = () => big;
  return { bar, stamp, big };
}

const accountedPipelineProbes = new WeakSet();
function accountPipelineProbe(probe) {
  if (!probe || accountedPipelineProbes.has(probe)) return;
  accountedPipelineProbes.add(probe);
  for (const key of [
    'answerTargetsCollected',
    'answerTargetsScheduled',
    'answerTargetsRejected',
    'rafsCoalesced',
    'queueTargetsCleared',
    'staleTargetsDiscarded',
    'patchReads',
    'suppressions',
    'patchApplications',
    'visibleLargeNumberRemovals',
    'visibleLargeNumberRestorations',
    'cacheInvalidations',
    'cacheRestorations',
  ]) counters[key] += probe[key] || 0;
}

const rows = canonicalRecords();
const identitySnapshot = JSON.stringify(rows);

await fixture('normal mounted q18 resolves by accepted answer identity', () => {
  const runtime = createRuntime(rows, true);
  const dom = branchDom('fixture-q-18', 'fixture-a-18-original');
  const title = compileTitleRuntime(runtime, dom);
  const turnNo = title.DOM_getTurnNumber(dom.answer);
  equal(turnNo, 18, 'accepted answer identity resolves canonical turn 18');
  const bar = titleBar();
  title.DOM_projectTurnNumber(bar, turnNo);
  counters.titleProjects += 1;
  equal(bar._label.textContent, 'TITLE 18');
  equal(bar.getAttribute('data-h2o-turn-num'), '18');
});

await fixture('unknown remounted answer resolves all presentation surfaces through unique q18 owner', () => {
  const runtime = createRuntime(rows, true);
  const dom = branchDom();
  const presentation = attachPresentation(dom, 1);
  const title = compileTitleRuntime(runtime, dom);
  const turnNo = title.DOM_getTurnNumber(dom.answer);
  equal(turnNo, 18, 'unaccepted remounted answer binds presentation through q18');
  title.DOM_projectTurnNumber(presentation.bar, turnNo);
  counters.titleProjects += 1;
  equal(presentation.bar._label.textContent, 'TITLE 18');
  equal(presentation.bar.getAttribute('data-h2o-turn-num'), '18');

  const timestamp = compileTimestampRuntime(runtime, dom.root);
  timestamp.DOM_AT_addOrUpdateOne(dom.answer);
  counters.timestampLabels += 1;
  equal(presentation.stamp.textContent, 'Jul 20 | 18');
  equal(presentation.stamp.dataset.fullLabel, 'Jul 20 | 18');

  const numbers = compileAnswerNumberRuntime(runtime, dom.root);
  const patch = numbers.api.CORE_readPatch(dom.answer);
  ok(patch, 'canonical remount creates a real Answer Numbers patch');
  numbers.api.CORE_applyPatch(patch);
  counters.largeNumberResolutions += 1;
  equal(patch.resolution.number, 18);
  equal(presentation.big.getAttribute('data-h2o-big-answer-num'), '18');
  equal(presentation.big.hidden, false);
  equal(presentation.big.innerHTML, '18');
});

await fixture('real metadata-removal observer pipeline suppresses an existing false large 1', () => {
  const runtime = createRuntime(rows, true);
  const dom = branchDom('fixture-q-not-canonical', 'fixture-a-not-canonical');
  const presentation = attachPresentation(dom, 1);
  const title = compileTitleRuntime(runtime, dom);
  const timestamp = compileTimestampRuntime(runtime, dom.root, () => 1, 0);
  const numbers = compileAnswerNumberRuntime(runtime, dom.root);
  const identity = numbers.api.UTIL_getRuntimeIdentity(dom.answer, 'fixture-a-not-canonical');
  numbers.api.UTIL_rememberStableNumber(identity, 1);
  equal(numbers.api.UTIL_getCachedStableNumber(identity), 1, 'fixture begins with a real stable-cache 1');
  numbers.api.OBS_attachMO();
  equal(numbers.observerState.instances.length, 1);

  equal(title.DOM_getTurnNumber(dom.answer), 0);
  title.DOM_projectTurnNumber(presentation.bar, 0);
  counters.titleProjects += 1;
  equal(presentation.bar._label.textContent, 'TITLE');
  equal(presentation.bar.hasAttribute('data-h2o-turn-num'), false);

  timestamp.DOM_AT_addOrUpdateOne(dom.answer);
  equal(presentation.stamp.textContent, 'Jul 20');
  equal(presentation.stamp.dataset.fullLabel, 'Jul 20');
  counters.timestampLabels += 1;

  equal(numbers.deliver([
    { type: 'attributes', attributeName: 'data-h2o-turn-num', target: presentation.bar, addedNodes: [] },
    { type: 'attributes', attributeName: 'data-full-label', target: presentation.stamp, addedNodes: [] },
  ]), true);
  equal(numbers.probe.mutationCallbacks, 1);
  equal(numbers.probe.answerTargetsCollected, 1);
  equal(numbers.probe.answerTargetsScheduled, 1);
  equal(numbers.probe.rafsScheduled, 1);
  equal(numbers.pendingRafs(), 1);
  equal(numbers.api.__state().pendingSize, 1);
  equal(numbers.flushOneRaf(), true);
  equal(numbers.probe.rafsFlushed, 1);
  equal(numbers.probe.patchReads, 1);
  equal(numbers.probe.suppressions, 1);
  equal(numbers.probe.patchApplications, 0);
  equal(presentation.big.hidden, true);
  equal(presentation.big.style.getPropertyValue('display'), 'none');
  equal(presentation.big.hasAttribute('data-h2o-big-answer-num'), false);
  equal(presentation.big.getAttribute('data-h2o-big-answer-num-stable'), '0');
  equal(numbers.api.UTIL_getCachedStableNumber(identity), 0, 'stable cache no longer resurrects false 1');
  equal(dom.answer.hasAttribute('data-cgxui-ansn-num'), false);
  equal(numbers.api.__state().pendingSize, 0);
  equal(numbers.api.__state().rafPending, false);
  equal(numbers.pendingRafs(), 0);
  equal(numbers.probe.visibleLargeNumberRemovals, 1);
  equal(numbers.probe.cacheInvalidations, 1);
  counters.largeNumberResolutions += 1;
  numbers.api.CORE_ANSNUM_dispose();
  accountPipelineProbe(numbers.probe);
});

await fixture('real metadata-restoration observer pipeline repaints unresolved q18 to canonical 18', () => {
  let ownerAvailable = false;
  const runtime = createRuntime(rows, true);
  const readQId = runtime.getTurnRecordByQId.bind(runtime);
  runtime.getTurnRecordByQId = (qId) => ownerAvailable ? readQId(qId) : null;
  const dom = branchDom();
  const presentation = attachPresentation(dom, 1);
  const title = compileTitleRuntime(runtime, dom);
  const timestamp = compileTimestampRuntime(runtime, dom.root);
  const numbers = compileAnswerNumberRuntime(runtime, dom.root);
  numbers.api.OBS_attachMO();

  title.DOM_projectTurnNumber(presentation.bar, title.DOM_getTurnNumber(dom.answer));
  timestamp.DOM_AT_addOrUpdateOne(dom.answer);
  numbers.deliver([
    { type: 'attributes', attributeName: 'data-h2o-turn-num', target: presentation.bar, addedNodes: [] },
    { type: 'attributes', attributeName: 'data-full-label', target: presentation.stamp, addedNodes: [] },
  ]);
  equal(numbers.flushOneRaf(), true);
  equal(presentation.big.hidden, true);

  ownerAvailable = true;
  title.DOM_projectTurnNumber(presentation.bar, title.DOM_getTurnNumber(dom.answer));
  timestamp.DOM_AT_addOrUpdateOne(dom.answer);
  equal(numbers.deliver([
    { type: 'attributes', attributeName: 'data-h2o-turn-num', target: presentation.bar, addedNodes: [] },
    { type: 'attributes', attributeName: 'data-full-label', target: presentation.stamp, addedNodes: [] },
    { type: 'childList', target: presentation.stamp, addedNodes: [] },
  ]), true);
  equal(numbers.probe.mutationCallbacks, 2);
  equal(numbers.probe.answerTargetsCollected, 2, 'each mutation batch collects one distinct answer');
  equal(numbers.probe.answerTargetsScheduled, 2);
  equal(numbers.probe.rafsScheduled, 2);
  equal(numbers.api.__state().pendingSize, 1);
  equal(numbers.flushOneRaf(), true);
  equal(presentation.bar._label.textContent, 'TITLE 18');
  equal(presentation.bar.getAttribute('data-h2o-turn-num'), '18');
  equal(presentation.stamp.textContent, 'Jul 20 | 18');
  equal(presentation.big.hidden, false);
  equal(presentation.big.getAttribute('data-h2o-big-answer-num'), '18');
  equal(presentation.big.innerHTML, '18');
  const identity = numbers.api.UTIL_getRuntimeIdentity(dom.answer, 'fixture-a-18-remounted');
  equal(numbers.api.UTIL_getCachedStableNumber(identity), 18);
  equal(numbers.probe.patchReads, 2);
  equal(numbers.probe.suppressions, 1);
  equal(numbers.probe.patchApplications, 1);
  equal(numbers.probe.visibleLargeNumberRestorations, 1);
  equal(numbers.api.__state().pendingSize, 0);
  equal(numbers.api.__state().rafPending, false);
  equal(numbers.pendingRafs(), 0);
  counters.titleProjects += 2;
  counters.timestampLabels += 2;
  counters.largeNumberResolutions += 2;
  numbers.api.CORE_ANSNUM_dispose();
  accountPipelineProbe(numbers.probe);
});

await fixture('root replacement discards a queued old-route answer before patch read', () => {
  const runtime = createRuntime(rows, true);
  const oldDom = branchDom('fixture-q-not-canonical', 'fixture-a-old-route');
  const oldPresentation = attachPresentation(oldDom, 1);
  const newDom = branchDom('fixture-q-18', 'fixture-a-new-route');
  attachPresentation(newDom, 18);
  const rootRef = { current: oldDom.root };
  const numbers = compileAnswerNumberRuntime(runtime, rootRef);

  numbers.api.OBS_attachMO();
  equal(numbers.deliver([
    { type: 'attributes', attributeName: 'data-h2o-turn-num', target: oldPresentation.bar, addedNodes: [] },
  ]), true);
  equal(numbers.api.__state().pendingSize, 1);
  equal(numbers.pendingRafs(), 1);
  equal(numbers.probe.patchReads, 0);

  oldDom.answer.isConnected = false;
  oldDom.root.isConnected = false;
  rootRef.current = newDom.root;
  numbers.api.OBS_attachMO();
  equal(numbers.observerState.instances.length, 2);
  equal(numbers.probe.observerDisconnects, 1);
  equal(numbers.probe.queueTargetsCleared, 1);
  equal(numbers.probe.rafsCanceled, 1);
  equal(numbers.api.__state().pendingSize, 0);
  equal(numbers.pendingRafs(), 0);
  equal(numbers.flushAllRafs(), 0);
  equal(numbers.probe.patchReads, 0, 'old-route answer never reaches CORE_readPatch');
  equal(numbers.probe.patchApplications, 0, 'old-route answer never reaches CORE_applyPatch');
  equal(oldPresentation.big.hidden, false, 'detached evidence node is not rewritten');
  equal(oldPresentation.big.innerHTML, '1');
  equal(numbers.api.__state().observerRoot, newDom.root);
  equal(numbers.api.__state().observer.active, true);
  oldDom.answer.isConnected = true;
  numbers.api.CORE_scheduleAnswer(oldDom.answer);
  equal(numbers.probe.answerTargetsRejected, 1, 'connected foreign-root target is rejected at schedule time');
  equal(numbers.api.__state().pendingSize, 0);
  equal(numbers.pendingRafs(), 0);
  numbers.api.CORE_ANSNUM_dispose();
  accountPipelineProbe(numbers.probe);
});

await fixture('mixed current and detached targets share one RAF while only current q18 repaints', () => {
  const runtime = createRuntime(rows, true);
  const staleDom = branchDom('fixture-q-not-canonical', 'fixture-a-mixed-stale');
  const validDom = branchDom('fixture-q-18', 'fixture-a-mixed-valid');
  const stalePresentation = attachPresentation(staleDom, 1);
  const validPresentation = attachPresentation(validDom, 1);
  const root = combineConversationRoots(staleDom, validDom);
  const title = compileTitleRuntime(runtime, validDom);
  const timestamp = compileTimestampRuntime(runtime, root);
  title.DOM_projectTurnNumber(validPresentation.bar, title.DOM_getTurnNumber(validDom.answer));
  timestamp.DOM_AT_addOrUpdateOne(validDom.answer);
  const numbers = compileAnswerNumberRuntime(runtime, root);

  numbers.api.OBS_attachMO();
  equal(numbers.deliver([
    { type: 'attributes', attributeName: 'data-h2o-turn-num', target: stalePresentation.bar, addedNodes: [] },
    { type: 'attributes', attributeName: 'data-h2o-turn-num', target: validPresentation.bar, addedNodes: [] },
    { type: 'attributes', attributeName: 'data-full-label', target: validPresentation.stamp, addedNodes: [] },
  ]), true);
  equal(numbers.probe.answerTargetsCollected, 2);
  equal(numbers.probe.answerTargetsScheduled, 2);
  equal(numbers.probe.rafsScheduled, 1);
  equal(numbers.probe.rafsCoalesced, 1);
  equal(numbers.api.__state().pendingSize, 2);

  staleDom.answer.isConnected = false;
  equal(numbers.flushOneRaf(), true);
  equal(numbers.probe.staleTargetsDiscarded, 1);
  equal(numbers.probe.patchReads, 1);
  equal(numbers.probe.patchApplications, 1);
  equal(stalePresentation.big.innerHTML, '1');
  equal(stalePresentation.big.hidden, false);
  equal(validPresentation.big.innerHTML, '18');
  equal(validPresentation.big.hidden, false);
  equal(validPresentation.big.getAttribute('data-h2o-big-answer-num'), '18');
  equal(numbers.api.__state().pendingSize, 0);
  equal(numbers.pendingRafs(), 0);
  counters.titleProjects += 1;
  counters.timestampLabels += 1;
  counters.largeNumberResolutions += 1;
  numbers.api.CORE_ANSNUM_dispose();
  accountPipelineProbe(numbers.probe);
});

await fixture('observer attachment replacement cleanup and self-mutation filtering stay bounded', () => {
  const runtime = createRuntime(rows, true);
  const firstDom = branchDom('fixture-q-18', 'fixture-a-observer-first');
  const firstPresentation = attachPresentation(firstDom, 18);
  const secondDom = branchDom('fixture-q-18', 'fixture-a-observer-second');
  const secondPresentation = attachPresentation(secondDom, 18);
  const rootRef = { current: firstDom.root };
  const numbers = compileAnswerNumberRuntime(runtime, rootRef);

  numbers.api.OBS_attachMO();
  numbers.api.OBS_attachMO();
  equal(numbers.observerState.instances.length, 1, 'same-root attach is idempotent');
  equal(numbers.api.__state().observer.options.attributes, true);
  equal(numbers.api.__state().observer.options.childList, true);
  equal(numbers.api.__state().observer.options.subtree, true);
  equal(Array.from(numbers.api.__state().observer.options.attributeFilter), [
    'data-h2o-turn-num',
    'data-full-label',
  ]);

  equal(numbers.deliver([
    { type: 'childList', target: firstPresentation.big, addedNodes: [] },
  ]), true);
  equal(numbers.probe.answerTargetsCollected, 0, 'Answer Numbers output child changes do not self-schedule');
  equal(numbers.probe.answerTargetsScheduled, 0);
  equal(numbers.pendingRafs(), 0);

  rootRef.current = secondDom.root;
  firstDom.answer.isConnected = false;
  firstDom.root.isConnected = false;
  numbers.api.OBS_attachMO();
  numbers.api.OBS_attachMO();
  equal(numbers.observerState.instances.length, 2);
  equal(numbers.probe.observerDisconnects, 1);
  equal(numbers.api.__state().observerRoot, secondDom.root);

  equal(numbers.deliver([
    { type: 'attributes', attributeName: 'data-h2o-turn-num', target: secondPresentation.bar, addedNodes: [] },
  ]), true);
  equal(numbers.api.__state().pendingSize, 1);
  equal(numbers.pendingRafs(), 1);
  numbers.api.CORE_ANSNUM_dispose();
  equal(numbers.probe.observerDisconnects, 2);
  equal(numbers.probe.queueTargetsCleared, 1);
  equal(numbers.probe.rafsCanceled, 1);
  equal(numbers.api.__state().observer, null);
  equal(numbers.api.__state().pendingSize, 0);
  equal(numbers.api.__state().rafPending, false);
  equal(numbers.pendingRafs(), 0);
  numbers.api.CORE_ANSNUM_dispose();
  equal(numbers.probe.observerDisconnects, 2, 'repeated cleanup is harmless');
  accountPipelineProbe(numbers.probe);
});

await fixture('ambiguous same-turn canonical owners fail closed without first-candidate selection', () => {
  const runtime = createRuntime(rows, true);
  const dom = branchDom('fixture-q-18', 'fixture-a-18-ambiguous', {
    qIds: ['fixture-q-18', 'fixture-q-19'],
    sameTurn: true,
  });
  const presentation = attachPresentation(dom, 1);
  const title = compileTitleRuntime(runtime, dom);
  const timestamp = compileTimestampRuntime(runtime, dom.root);
  const numbers = compileAnswerNumberRuntime(runtime, dom.root);
  equal(title.DOM_getTurnNumber(dom.answer), 0);
  title.DOM_projectTurnNumber(presentation.bar, 0);
  timestamp.DOM_AT_addOrUpdateOne(dom.answer);
  equal(timestamp.DOM_AT_getCanonicalTurnIndexFromRuntime(dom.answer), null);
  equal(numbers.api.resolveStableBigAnswerNumber(dom.answer).number, null);
  equal(numbers.api.CORE_readPatch(dom.answer), null);
  equal(presentation.bar._label.textContent, 'TITLE');
  equal(presentation.bar.hasAttribute('data-h2o-turn-num'), false);
  equal(presentation.stamp.textContent, 'Jul 20');
  equal(presentation.big.hidden, true);
  equal(presentation.big.hasAttribute('data-h2o-big-answer-num'), false);
  counters.titleProjects += 1;
  counters.timestampLabels += 1;
  counters.largeNumberResolutions += 1;
});

await fixture('duplicate DOM representations of one q18 owner collapse to canonical 18', () => {
  const runtime = createRuntime(rows, true);
  const dom = branchDom('fixture-q-18', 'fixture-a-18-duplicate-owner', {
    qIds: ['fixture-q-18', 'fixture-q-18'],
    sameTurn: true,
  });
  const title = compileTitleRuntime(runtime, dom);
  const timestamp = compileTimestampRuntime(runtime, dom.root);
  const numbers = compileAnswerNumberRuntime(runtime, dom.root);
  equal(title.DOM_getTurnNumber(dom.answer), 18);
  equal(timestamp.DOM_AT_getCanonicalTurnIndexFromRuntime(dom.answer), 18);
  equal(numbers.api.resolveStableBigAnswerNumber(dom.answer).number, 18);
});

await fixture('system intermediary blocks unsafe previous-question fallback', () => {
  const runtime = createRuntime(rows, true);
  const dom = branchDom('fixture-q-18', 'fixture-a-18-system-gap', { systemIntermediate: true });
  const title = compileTitleRuntime(runtime, dom);
  const timestamp = compileTimestampRuntime(runtime, dom.root);
  const numbers = compileAnswerNumberRuntime(runtime, dom.root);
  equal(title.DOM_getTurnNumber(dom.answer), 0);
  equal(timestamp.DOM_AT_getCanonicalTurnIndexFromRuntime(dom.answer), null);
  equal(numbers.api.resolveStableBigAnswerNumber(dom.answer).number, null);
});

await fixture('repeated branch switches and virtualized fresh remounts remain canonical 18', () => {
  const runtime = createRuntime(rows, true);
  for (const answerId of ['fixture-a-18-remount-a', 'fixture-a-18-remount-b', 'fixture-a-18-virtual']) {
    const dom = branchDom('fixture-q-18', answerId);
    const presentation = attachPresentation(dom, 1);
    const title = compileTitleRuntime(runtime, dom);
    const timestamp = compileTimestampRuntime(runtime, dom.root);
    const numbers = compileAnswerNumberRuntime(runtime, dom.root);
    title.DOM_projectTurnNumber(presentation.bar, title.DOM_getTurnNumber(dom.answer));
    timestamp.DOM_AT_addOrUpdateOne(dom.answer);
    const patch = numbers.api.CORE_readPatch(dom.answer);
    ok(patch);
    numbers.api.CORE_applyPatch(patch);
    equal(presentation.bar._label.textContent, 'TITLE 18');
    equal(presentation.stamp.textContent, 'Jul 20 | 18');
    equal(presentation.big.getAttribute('data-h2o-big-answer-num'), '18');
    equal(presentation.big.hidden, false);
    counters.titleProjects += 1;
    counters.timestampLabels += 1;
    counters.largeNumberResolutions += 1;
  }
});

await fixture('Question Numbers real canonical path displays q18 and fails closed unresolved', () => {
  const runtime = createRuntime(rows, true);
  const dom = branchDom();
  const question = compileQuestionNumberRuntime(runtime);
  dom.question.querySelector = (selector) => selector.includes('cgxui-qbig-number')
    ? question.numberNode
    : null;
  equal(question.api.computeDisplayNumber(dom.question), 18);
  question.api.applyPatch({ host: dom.question, num: 18, numSig: '18||', editStr: '', pos: null });
  equal(question.numberNode.hidden, false);
  equal(question.numberNode.innerHTML, '18');

  const unknown = branchDom('fixture-q-unknown', 'fixture-a-unknown').question;
  unknown.querySelector = (selector) => selector.includes('cgxui-qbig-number')
    ? question.numberNode
    : null;
  equal(question.api.computeDisplayNumber(unknown), null);
  question.api.applyPatch({ host: unknown, num: null });
  equal(question.numberNode.hidden, true);
  equal(question.numberNode.style.getPropertyValue('display'), 'none');
  equal(question.numberNode.hasAttribute('data-h2o-qbig-sig-num'), false);
});

await fixture('legacy mounted-order fallbacks remain available only outside complete mode', () => {
  const runtime = createRuntime(rows, false);
  const dom = branchDom('fixture-q-not-canonical', 'fixture-a-not-canonical');
  const title = compileTitleRuntime(runtime, dom, 0);
  equal(title.DOM_getTurnNumber(dom.answer), 1);
  const timestamp = compileTimestampRuntime(runtime, dom.root, () => 1, 0);
  equal(timestamp.UI_AT_buildLabel(dom.answer), 'Jul 20 | 1');
  const answer = compileAnswerNumberRuntime(runtime, dom.root);
  const presentation = attachPresentation(dom, 1);
  equal(answer.api.resolveStableBigAnswerNumber(dom.answer).number, 1);
  const question = compileQuestionNumberRuntime(runtime);
  equal(question.api.computeDisplayNumber(dom.question), 1);
  equal(presentation.big.getAttribute('data-h2o-big-answer-num'), '1');
  counters.timestampLabels += 1;
});

await fixture('complete API status failures remain fail closed while old runtimes retain legacy behavior', () => {
  const runtime = createRuntime(rows, true);
  runtime.getCompleteTurnIndexProjectionStatus = () => { throw new Error('transient-status'); };
  const dom = branchDom('fixture-q-not-canonical', 'fixture-a-not-canonical');
  equal(compileTitleRuntime(runtime, dom, 0).DOM_getTurnNumber(dom.answer), 0);
  equal(compileTimestampRuntime(runtime, dom.root, () => 1, 0).DOM_AT_getTurnIndex(dom.answer), null);
  equal(compileAnswerNumberRuntime(runtime, dom.root).api.resolveStableBigAnswerNumber(dom.answer).number, null);
  equal(compileQuestionNumberRuntime(runtime).api.computeDisplayNumber(dom.question), null);

  const oldRuntime = {};
  attachPresentation(dom, 1);
  equal(compileTitleRuntime(oldRuntime, dom, 0).DOM_getTurnNumber(dom.answer), 1);
  equal(compileTimestampRuntime(oldRuntime, dom.root, () => 1, 1).DOM_AT_getTurnIndex(dom.answer), 1);
  equal(compileAnswerNumberRuntime(oldRuntime, dom.root).api.resolveStableBigAnswerNumber(dom.answer).number, 1);
  equal(compileQuestionNumberRuntime(oldRuntime).api.computeDisplayNumber(dom.question), 1);
});

await fixture('canonical membership variants and safety counters remain unchanged', () => {
  equal(rows.length, 39);
  equal(rows[16].qId, 'fixture-q-17');
  equal(rows[16].answerIds.length, 2);
  equal(rows[17].qId, 'fixture-q-18');
  equal(rows[17].turnNo, 18);
  equal(rows[17].answerIds.includes('fixture-a-18-remounted'), false,
    'presentation fallback does not add the remounted answer as a canonical alias');
  equal(JSON.stringify(rows), identitySnapshot, 'canonical records are byte-stable');
  equal(counters.canonicalWrites, 0);
  equal(counters.aliasWrites, 0);
  equal(counters.storageWrites, 0);
  equal(counters.networkCalls, 0);
  equal(counters.reconciliationAccepts, 0);
  equal(counters.reconciliationGets, 0);
  equal(counters.confirmations, 0);
  equal(counters.selectedPathPublications, 0);
  equal(counters.primaryMutations, 0);
  equal(counters.timers, 0);
  equal(counters.mutationObservers, 7);
  equal(counters.observerDisconnects, 7);
  equal(counters.mutationCallbacks, 7);
  equal(counters.answerTargetsCollected, 7);
  equal(counters.answerTargetsScheduled, 7);
  equal(counters.answerTargetsRejected, 1);
  equal(counters.rafsScheduled, 6);
  equal(counters.rafsCoalesced, 1);
  equal(counters.rafsFlushed, 4);
  equal(counters.rafsCanceled, 2);
  equal(counters.queueTargetsCleared, 2);
  equal(counters.staleTargetsDiscarded, 1);
  equal(counters.patchReads, 4);
  equal(counters.suppressions, 2);
  equal(counters.patchApplications, 2);
  equal(counters.visibleLargeNumberRemovals, 2);
  equal(counters.visibleLargeNumberRestorations, 1);
  equal(counters.cacheInvalidations, 2);
  equal(counters.cacheRestorations, 3);
});

await fixture('source contracts retain bounded presentation-only scope', () => {
  ok(!TITLE_SOURCE.includes('if (tRaw === 0) return 1;')
    || TITLE_SOURCE.includes('if (DOM_completeTurnIndexProjectionEnabled()) return 0;'),
  'legacy zero-to-one fallback is unreachable in complete mode');
  ok(TITLE_SOURCE.includes('rt.getTurnRecordByQId?.(qId)'), 'title uses owner qId runtime lookup');
  ok(TIMESTAMP_SOURCE.includes('rt?.getTurnRecordByQId?.(qId)'), 'timestamp uses owner qId runtime lookup');
  ok(TIMESTAMP_SOURCE.includes('if (DOM_AT_completeTurnIndexProjectionEnabled()) return null;'),
    'timestamp rejects mounted order in complete mode');
  ok(ANSWER_NUMBER_SOURCE.includes('if (!canonical) return { number: null, source, stable: false, ...identity };'),
    'Answer Numbers rejects stale cache without current canonical identity');
  ok(ANSWER_NUMBER_SOURCE.includes("attributeFilter: ['data-h2o-turn-num', 'data-full-label']"),
    'Answer Numbers observes only the relevant ordinal metadata');
  ok(ANSWER_NUMBER_SOURCE.includes('if (!CORE_isCurrentAnswerTarget(target)) continue;'),
    'Answer Numbers revalidates queued targets immediately before patch reads');
  ok(ANSWER_NUMBER_SOURCE.includes('if (!CORE_isCurrentAnswerTarget(patch?.el)) continue;'),
    'Answer Numbers revalidates patch ownership immediately before apply');
  ok(ANSWER_NUMBER_SOURCE.includes('CORE_clearPendingAnswers(true);'),
    'route/root lifecycle clears queued incremental targets');
  ok(QUESTION_NUMBER_SOURCE.includes('if (isCompleteTurnIndexProjectionEnabled()) return null;'),
    'Question Numbers rejects branch-local fallback in complete mode');
  for (const source of [TITLE_SOURCE, TIMESTAMP_SOURCE, ANSWER_NUMBER_SOURCE, QUESTION_NUMBER_SOURCE]) {
    equal(source.includes('setCompleteTurnIndexAutoBranchReconciliationCanary'), false);
    equal(source.includes('setCompleteTurnIndexProjectionCanary'), false);
    equal(/\.refreshCompleteTurnIndexProjection\?\.\(/.test(source), false);
    equal(source.includes('fetch('), source === TITLE_SOURCE && source.includes('ENGINE_generateApiTitle'));
  }
});

const failures = results.filter((entry) => !entry.ok);
console.log(`SUMMARY ${results.length - failures.length}/${results.length} fixtures passed; ${assertionCount} assertions; ${failures.length} failures`);
console.log(JSON.stringify({
  ok: failures.length === 0,
  fixtureCount: results.length,
  assertionCount,
  failures: failures.length,
  productionSources: [TITLE_PATH, TIMESTAMP_PATH, ANSWER_NUMBER_PATH, QUESTION_NUMBER_PATH],
  counters,
  results,
}));

if (failures.length) process.exitCode = 1;
