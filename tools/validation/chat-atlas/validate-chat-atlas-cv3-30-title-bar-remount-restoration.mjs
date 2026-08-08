#!/usr/bin/env node
// CV-3.30 — native title-bar remount restoration.
//
// STATE_.seen records that title data was already produced for an answer id.
// It is add-only: there is no delete, clear or route reset anywhere in 1C1a.
// TIME_queueProcessAnswer therefore returned immediately for any previously
// processed id, so when the host rebuilt an assistant subtree without its
// H2O title bar — a collapsed range recycled by the virtualizer, or ordinary
// scroll churn — DOM_ensureTitleBar was never reached and the bar stayed
// missing permanently. TIME_startRepairLoop cannot recover it either: it
// iterates answers that still contain an owned title-text node.
//
// These fixtures run the real production TIME_queueProcessAnswer against a
// synthetic DOM, comparing the immutable parent behaviour with the corrected
// seen-id recovery path.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TITLE_PATH = 'src-runtime-base/1C1a.🟥📛 Turn Title Bar 📛.js';
const PARENT_SHA = '2daea2fdd26f843c2ecbd0ebb1e5289468e8d29c';
const TITLE_SOURCE = fs.readFileSync(path.join(ROOT, TITLE_PATH), 'utf8');
const TITLE_PARENT = execFileSync('git', ['show', `${PARENT_SHA}:${TITLE_PATH}`], {
  cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
});

let assertions = 0;
const fixtures = [];
function equal(a, b, m) { assertions += 1; assert.deepEqual(a, b, m); }
function ok(v, m) { assertions += 1; assert.ok(v, m); }
async function fixture(name, run) {
  try { await run(); fixtures.push({ name, ok: true }); console.log(`PASS ${name}`); }
  catch (e) { fixtures.push({ name, ok: false, error: String(e?.stack || e) }); console.error(`FAIL ${name}\n${String(e?.stack || e)}`); }
}

function declaration(source, name) {
  const token = `  const ${name} =`;
  const start = source.indexOf(token);
  if (start < 0) throw new Error(`production-declaration-missing:${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0, quote = '', escaped = false, line = false, block = false;
  for (let i = brace; i < source.length; i += 1) {
    const c = source[i], n = source[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '/' && n === '/') { line = true; i += 1; continue; }
    if (c === '/' && n === '*') { block = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`production-declaration-body-invalid:${name}`);
}

// ── Minimal DOM ───────────────────────────────────────────────────────────
class El {
  constructor(tag = 'DIV') {
    this.tagName = String(tag).toUpperCase(); this.nodeType = 1;
    this.children = []; this.parentElement = null; this.attrs = new Map();
    this.isConnected = true; this.textContent = '';
    this.style = {};
  }
  setAttribute(n, v) { this.attrs.set(String(n), String(v)); }
  getAttribute(n) { return this.attrs.has(String(n)) ? this.attrs.get(String(n)) : null; }
  hasAttribute(n) { return this.attrs.has(String(n)); }
  removeAttribute(n) { this.attrs.delete(String(n)); }
  get firstElementChild() { return this.children[0] || null; }
  appendChild(c) { if (c.parentElement) c.parentElement.removeChild(c); c.parentElement = this; this.children.push(c); return c; }
  insertBefore(c, ref) {
    if (c.parentElement) c.parentElement.removeChild(c);
    c.parentElement = this;
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
    return c;
  }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentElement = null; return c; }
  remove() { if (this.parentElement) this.parentElement.removeChild(this); }
  matches(sel) { return matchSel(this, sel); }
  closest(sel) { let n = this; while (n) { if (matchSel(n, sel)) return n; n = n.parentElement; } return null; }
  querySelectorAll(sel) { const out = []; const w = (n) => { for (const c of n.children) { if (matchSel(c, sel)) out.push(c); w(c); } }; w(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
function matchSel(node, sel) {
  for (const m of String(sel || '').matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g)) {
    const actual = node.getAttribute(m[1].trim());
    if (actual == null) return false;
    if (m[2] != null && actual !== m[2]) return false;
  }
  return true;
}

const SkID = 'atns';
const UI_ = { BAR: `${SkID}-answer-title`, TEXT: `${SkID}-answer-title-text`, LABEL: `${SkID}-answer-title-label` };
const ATTR_ = { CGXUI: 'data-cgxui', CGXUI_OWNER: 'data-cgxui-owner', CGXUI_STATE: 'data-cgxui-state' };

// Build one assistant message element with no H2O bar (a fresh host mount).
function mountAnswer(id) {
  const msgEl = new El('DIV');
  msgEl.setAttribute('data-message-author-role', 'assistant');
  msgEl.setAttribute('data-message-id', id);
  const body = new El('DIV');
  body.setAttribute('data-body', '1');
  msgEl.appendChild(body);
  return msgEl;
}

function createHarness(options = {}) {
  const source = options.source || TITLE_SOURCE;
  const STATE_ = { seen: new Set(), pendingTimers: new Map(), titles: {}, clean: {}, visitResetPending: false };
  const counters = { ensureCalls: 0, setTitleCalls: 0, generated: 0, timers: 0, observerTicks: 0 };
  const timerQueue = [];
  const stackedBars = new Map();

  const sandbox = {
    console, Object, String, Number, Math, Map, Set, Array, RegExp, JSON,
    HTMLElement: El,
    CSS: { escape: (v) => String(v) },
    SkID, UI_, ATTR_,
    SEL_: { OWNED_BAR_ANY: `[${ATTR_.CGXUI}="${UI_.BAR}"]`, ASSISTANT_MSG: '[data-message-author-role="assistant"]' },
    CFG_: { DEBOUNCE_MS: 1 },
    STATE_,
    setTimeout(cb) { counters.timers += 1; timerQueue.push(cb); return timerQueue.length; },
    clearTimeout() {},
    W: {},
    D: { querySelector: () => null, querySelectorAll: () => [] },
    UTIL_textTrim: (s) => (s == null ? '' : String(s)).trim(),
    UTIL_setAttr: (el, n, v) => el?.setAttribute?.(n, v),
    UTIL_getAttr: (el, n) => el?.getAttribute?.(n) ?? null,
    DIAG_err: () => {},
    DOM_selScoped: (token) => `[${ATTR_.CGXUI}="${token}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`,
    DOM_isNoAnswerTitleBar: (bar) => String(bar?.getAttribute?.('data-at-no-answer') || '').trim() === '1',
    DOM_getAnswerId: (el) => el?.getAttribute?.('data-message-id') || '',
    API_AT_normalizeAnswerId: (v) => String(v || '').trim(),
    DOM_findStackedBarByAnswerId: (id) => stackedBars.get(String(id || '')) || null,
    // The real ensure is large and depends on collapse/wash subsystems; this
    // stand-in reproduces its two contractual properties exactly: it creates
    // at most one owned bar per message element, and it is idempotent.
    DOM_ensureTitleBar: (msgEl) => {
      counters.ensureCalls += 1;
      const sel = `[${ATTR_.CGXUI}="${UI_.BAR}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`;
      const existing = msgEl.querySelectorAll(sel).find((b) => b.getAttribute('data-at-no-answer') !== '1') || null;
      if (existing) return existing;
      const bar = new El('DIV');
      bar.setAttribute(ATTR_.CGXUI, UI_.BAR);
      bar.setAttribute(ATTR_.CGXUI_OWNER, SkID);
      const label = new El('SPAN');
      label.setAttribute(ATTR_.CGXUI, UI_.LABEL);
      label.setAttribute(ATTR_.CGXUI_OWNER, SkID);
      const text = new El('SPAN');
      text.setAttribute(ATTR_.CGXUI, UI_.TEXT);
      text.setAttribute(ATTR_.CGXUI_OWNER, SkID);
      bar.appendChild(label); bar.appendChild(text);
      msgEl.insertBefore(bar, msgEl.firstElementChild || null);
      return bar;
    },
    DOM_setTitleOnAnswer: (msgEl, title) => {
      counters.setTitleCalls += 1;
      const bar = sandbox.DOM_ensureTitleBar(msgEl);
      const id = sandbox.DOM_getAnswerId(msgEl);
      if (id) bar.setAttribute('data-answer-id', id);
      const textEl = bar.querySelector(`[${ATTR_.CGXUI}="${UI_.TEXT}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`);
      if (textEl) textEl.textContent = String(title || '');
      return bar;
    },
    ENGINE_processAnswer: (msgEl) => {
      // Stands in for real generation: marks seen and applies a title once.
      counters.generated += 1;
      const id = sandbox.DOM_getAnswerId(msgEl);
      if (!id) return;
      STATE_.titles[id] = STATE_.titles[id] || `Title for ${id}`;
      STATE_.seen.add(id);
      sandbox.DOM_setTitleOnAnswer(msgEl, STATE_.titles[id]);
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  const names = ['DOM_liveAnswerTitleBar', 'TIME_recoverRemountedTitleBar', 'TIME_queueProcessAnswer']
    .filter((n) => source.includes(`  const ${n} =`));
  const code = names.map((n) => declaration(source, n)).join('\n')
    + `\nglobalThis.__api = { ${names.join(', ')} };`;
  new vm.Script(code, { filename: TITLE_PATH }).runInContext(sandbox);

  const flush = () => { while (timerQueue.length) { const cb = timerQueue.shift(); counters.observerTicks += 1; cb(); } };
  const barsIn = (msgEl) => msgEl.querySelectorAll(`[${ATTR_.CGXUI}="${UI_.BAR}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`)
    .filter((b) => b.getAttribute('data-at-no-answer') !== '1');
  const titleOf = (msgEl) => {
    const b = barsIn(msgEl)[0];
    const t = b && b.querySelector(`[${ATTR_.CGXUI}="${UI_.TEXT}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`);
    return t ? t.textContent : null;
  };
  return { api: sandbox.__api, STATE_, counters, flush, barsIn, titleOf, stackedBars, sandbox, hasRecovery: names.length === 3 };
}

// ── 1-2: first processing ─────────────────────────────────────────────────
await fixture('1-2 first processing creates exactly one bar and marks the id seen', () => {
  const h = createHarness();
  const msg = mountAnswer('a-1');
  equal(h.barsIn(msg).length, 0, 'no bar before processing');
  h.api.TIME_queueProcessAnswer(msg, 0);
  h.flush();
  equal(h.barsIn(msg).length, 1, 'exactly one bar created');
  equal(h.STATE_.seen.has('a-1'), true, 'id marked seen');
  equal(h.titleOf(msg), 'Title for a-1', 'title applied');
});

// ── 3-5: the corrected remount recovery ───────────────────────────────────
await fixture('3-5 a remounted subtree with a seen id recovers exactly one bar with its title', () => {
  const h = createHarness();
  const first = mountAnswer('a-1');
  h.api.TIME_queueProcessAnswer(first, 0);
  h.flush();
  equal(h.STATE_.seen.has('a-1'), true, 'seen');
  const generatedBefore = h.counters.generated;

  // Host rebuilds the subtree without the H2O bar.
  const remounted = mountAnswer('a-1');
  equal(h.barsIn(remounted).length, 0, 'remounted subtree starts bare');
  h.api.TIME_queueProcessAnswer(remounted, 0);
  h.flush();
  equal(h.barsIn(remounted).length, 1, 'exactly one bar recreated despite the id being seen');
  equal(h.titleOf(remounted), 'Title for a-1', 'established title preserved');
  equal(h.barsIn(remounted)[0].getAttribute('data-answer-id'), 'a-1', 'identity preserved');
  equal(h.counters.generated, generatedBefore, 'title content was not regenerated');
});

await fixture('parent leaves a remounted seen id permanently bare', () => {
  const h = createHarness({ source: TITLE_PARENT });
  equal(h.hasRecovery, false, 'parent has no recovery helpers');
  const first = mountAnswer('a-1');
  h.api.TIME_queueProcessAnswer(first, 0);
  h.flush();
  const remounted = mountAnswer('a-1');
  h.api.TIME_queueProcessAnswer(remounted, 0);
  h.flush();
  equal(h.barsIn(remounted).length, 0, 'parent never recreates the bar');
});

// ── 6-7: idempotence ──────────────────────────────────────────────────────
await fixture('6 repeated observer/queue calls do not duplicate the bar', () => {
  const h = createHarness();
  const msg = mountAnswer('a-1');
  h.api.TIME_queueProcessAnswer(msg, 0);
  h.flush();
  for (let i = 0; i < 6; i += 1) { h.api.TIME_queueProcessAnswer(msg, 0); h.flush(); }
  equal(h.barsIn(msg).length, 1, 'still exactly one bar');
});

await fixture('7 a connected existing bar is left untouched by the recovery path', () => {
  const h = createHarness();
  const msg = mountAnswer('a-1');
  h.api.TIME_queueProcessAnswer(msg, 0);
  h.flush();
  const bar = h.barsIn(msg)[0];
  const ensureBefore = h.counters.ensureCalls;
  const setBefore = h.counters.setTitleCalls;
  h.api.TIME_queueProcessAnswer(msg, 0);
  h.flush();
  equal(h.barsIn(msg)[0], bar, 'same node retained');
  equal(h.counters.ensureCalls, ensureBefore, 'ensure not invoked');
  equal(h.counters.setTitleCalls, setBefore, 'title not reapplied');
});

// ── 8-9: cycles and the 18-answer collapse/expand pattern ─────────────────
await fixture('8 repeated unmount/remount cycles keep the bar count stable', () => {
  const h = createHarness();
  let msg = mountAnswer('a-1');
  h.api.TIME_queueProcessAnswer(msg, 0);
  h.flush();
  for (let cycle = 0; cycle < 5; cycle += 1) {
    msg = mountAnswer('a-1');
    h.api.TIME_queueProcessAnswer(msg, 0);
    h.flush();
    equal(h.barsIn(msg).length, 1, `cycle ${cycle} recovered exactly one bar`);
    equal(h.titleOf(msg), 'Title for a-1', `cycle ${cycle} kept its title`);
  }
});

await fixture('9 an 18-answer collapse/expand remount restores every native bar', () => {
  const h = createHarness();
  const ids = Array.from({ length: 18 }, (_u, i) => `a-${i + 1}`);
  let mounted = ids.map((id) => mountAnswer(id));
  for (const m of mounted) { h.api.TIME_queueProcessAnswer(m, 0); h.flush(); }
  equal(mounted.filter((m) => h.barsIn(m).length === 1).length, 18, 'all 18 bars created initially');
  // Collapse recycles the interior; the retained window keeps its nodes.
  const retained = new Set([0, 3, 15, 16, 17]);
  mounted = mounted.map((m, i) => (retained.has(i) ? m : mountAnswer(ids[i])));
  for (const m of mounted) { h.api.TIME_queueProcessAnswer(m, 0); h.flush(); }
  equal(mounted.filter((m) => h.barsIn(m).length === 1).length, 18, 'all 18 bars present after expansion');
  equal(mounted.every((m, i) => h.titleOf(m) === `Title for ${ids[i]}`), true, 'every title preserved');
});

// ── 10-12: scope, ledger and bounding ─────────────────────────────────────
await fixture('10 NO ANSWER shells are not treated as the answer bar', () => {
  const h = createHarness();
  const msg = mountAnswer('a-1');
  h.api.TIME_queueProcessAnswer(msg, 0);
  h.flush();
  // A NO ANSWER shell alongside must not satisfy the probe on a bare remount.
  const remounted = mountAnswer('a-1');
  const shell = new El('DIV');
  shell.setAttribute(ATTR_.CGXUI, UI_.BAR);
  shell.setAttribute(ATTR_.CGXUI_OWNER, SkID);
  shell.setAttribute('data-at-no-answer', '1');
  remounted.appendChild(shell);
  h.api.TIME_queueProcessAnswer(remounted, 0);
  h.flush();
  equal(h.barsIn(remounted).length, 1, 'answer bar recovered beside the NO ANSWER shell');
  equal(remounted.querySelectorAll(`[${ATTR_.CGXUI}="${UI_.BAR}"]`).filter((b) => b.getAttribute('data-at-no-answer') === '1').length, 1, 'NO ANSWER shell untouched');
});

await fixture('10b a stack-relocated bar suppresses recovery', () => {
  const h = createHarness();
  const msg = mountAnswer('a-1');
  h.api.TIME_queueProcessAnswer(msg, 0);
  h.flush();
  const remounted = mountAnswer('a-1');
  h.stackedBars.set('a-1', new El('DIV'));
  h.api.TIME_queueProcessAnswer(remounted, 0);
  h.flush();
  equal(h.barsIn(remounted).length, 0, 'no flow bar created while the row is stacked');
  h.stackedBars.delete('a-1');
  h.api.TIME_queueProcessAnswer(remounted, 0);
  h.flush();
  equal(h.barsIn(remounted).length, 1, 'recovered once the stack released it');
});

await fixture('11 no route-wide seen clear is introduced', () => {
  const recover = declaration(TITLE_SOURCE, 'TIME_recoverRemountedTitleBar');
  const queue = declaration(TITLE_SOURCE, 'TIME_queueProcessAnswer');
  const both = `${recover}\n${queue}`;
  ok(!/seen\.clear\(/.test(both), 'no seen.clear');
  ok(!/seen\.delete\(/.test(both), 'no seen.delete');
  ok(/STATE_\.seen\.has\(id\)/.test(queue), 'seen ledger still consulted');
  ok(!/querySelectorAll\(\s*SEL_\.ASSISTANT_MSG/.test(both), 'no route-wide rescan');
  ok(!/getAssistantMessages/.test(both), 'no document-wide sweep');
});

await fixture('12 the repair is bounded and cannot loop the observer', () => {
  const recover = declaration(TITLE_SOURCE, 'TIME_recoverRemountedTitleBar');
  ok(!/setTimeout|setInterval|requestAnimationFrame/.test(recover), 'no scheduling primitive');
  ok(!/MutationObserver/.test(recover), 'no observer created');
  ok(!/TIME_queueProcessAnswer/.test(recover), 'no re-entry into the queue');
  // Behavioural: a second pass after recovery performs zero further work.
  const h = createHarness();
  const first = mountAnswer('a-1');
  h.api.TIME_queueProcessAnswer(first, 0);
  h.flush();
  const remounted = mountAnswer('a-1');
  h.api.TIME_queueProcessAnswer(remounted, 0);
  h.flush();
  const ensureAfter = h.counters.ensureCalls;
  h.api.TIME_queueProcessAnswer(remounted, 0);
  h.flush();
  equal(h.counters.ensureCalls, ensureAfter, 'converged: no further ensure work');
  equal(h.barsIn(remounted).length, 1, 'still exactly one bar');
});

// ── NO ANSWER global ordinal (Stage 2C-2o) ────────────────────────────────
// Live defect: a question-only turn at global order 19 rendered
// "TITLE 4 NO ANSWER". Every re-projection path walked assistant messages
// only, so a NO ANSWER bar kept whatever number the path that built it
// stamped — including a number minted under the previous branch.
function createOrdinalHarness(source = TITLE_SOURCE) {
  // Effective branch index: the 39-turn selected branch, order 19 unanswered.
  const rows = [];
  for (let order = 1; order <= 39; order += 1) {
    rows.push({
      order,
      qId: `q-${order}`,
      primaryAId: order === 19 ? null : `a-${order}`,
      noAnswer: order === 19,
    });
  }
  const byQId = new Map(rows.map((r) => [r.qId, r]));
  const byAId = new Map(rows.filter((r) => r.primaryAId).map((r) => [r.primaryAId, r]));
  const turnRuntime = {
    getEffectiveTurnRecordByQId: (qId) => byQId.get(String(qId || '')) || null,
    getEffectiveTurnRecordByAId: (aId) => byAId.get(String(aId || '')) || null,
    getCompleteTurnIndexProjectionStatus: () => ({ enabled: true }),
  };
  const allBars = [];
  const sandbox = {
    console, Object, String, Number, Math, Map, Set, Array, RegExp, JSON,
    SkID, UI_, ATTR_,
    SEL_: {
      OWNED_BAR_ANY: `[${ATTR_.CGXUI}="${UI_.BAR}"]`,
      ASSISTANT_MSG: '[data-message-author-role="assistant"]',
      TURN: '[data-testid]',
    },
    DIAG_err: () => {},
    W: { H2O: { turnRuntime, msg: { getIdFromEl: (el) => el?.getAttribute?.('data-message-id') || '' } } },
    D: { querySelectorAll: (sel) => allBars.filter((b) => matchSel(b, sel)) },
    UTIL_setAttr: (el, n, v) => el?.setAttribute?.(n, v),
    UTIL_delAttr: (el, n) => el?.removeAttribute?.(n),
    DOM_selScoped: (token) => `[${ATTR_.CGXUI}="${token}"]`,
    DOM_getAssistantMessages: () => [],
    DOM_getAnswerId: (el) => el?.getAttribute?.('data-message-id') || null,
    API_AT_normalizeAnswerId: (v) => String(v || '').trim(),
    API_AT_getBar: () => null,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const names = [
    'DOM_readCanonicalTurnNumber',
    'DOM_getUserCandidates',
    'DOM_getCanonicalQuestionOwnerNumber',
    'DOM_projectTurnNumber',
    'DOM_getNoAnswerBarTurnNumber',
    'DOM_refreshVisibleTurnNumbers',
  ].filter((n) => source.includes(`  const ${n} =`));
  const code = names.map((n) => declaration(source, n)).join('\n')
    + `\nglobalThis.__api = { ${names.join(', ')} };`;
  new vm.Script(code, { filename: TITLE_PATH }).runInContext(sandbox);

  // One question-only turn host at global order 19, whose bar was stamped
  // with a stale ordinal from the other branch.
  const mountNoAnswerTurn = (qId, staleNumber) => {
    const host = new El('ARTICLE');
    host.setAttribute('data-testid', 'conversation-turn-37');
    host.setAttribute('data-turn', 'user');
    const question = new El('DIV');
    question.setAttribute('data-message-author-role', 'user');
    question.setAttribute('data-message-id', qId);
    const bar = new El('DIV');
    bar.setAttribute(ATTR_.CGXUI, UI_.BAR);
    bar.setAttribute(ATTR_.CGXUI_OWNER, SkID);
    bar.setAttribute('data-at-no-answer', '1');
    if (staleNumber) bar.setAttribute('data-h2o-turn-num', String(staleNumber));
    const label = new El('SPAN');
    label.setAttribute(ATTR_.CGXUI, UI_.LABEL);
    label.setAttribute(ATTR_.CGXUI_OWNER, SkID);
    label.textContent = staleNumber ? `TITLE ${staleNumber}` : 'TITLE';
    bar.appendChild(label);
    host.appendChild(question);
    host.appendChild(bar);
    allBars.push(bar);
    return { host, bar, label };
  };
  return { api: sandbox.__api, mountNoAnswerTurn, allBars, names };
}

await fixture('13 a NO ANSWER row reports its global branch order, not a stale ordinal', () => {
  const h = createOrdinalHarness();
  ok(h.names.includes('DOM_getNoAnswerBarTurnNumber'), 'production exposes the no-answer ordinal resolver');
  const turn = h.mountNoAnswerTurn('q-19', 4);
  equal(turn.label.textContent, 'TITLE 4', 'starts with the stale cross-branch ordinal');
  equal(h.api.DOM_getNoAnswerBarTurnNumber(turn.bar), 19, 'the resolver reads the global order from the effective index');
  const changed = h.api.DOM_refreshVisibleTurnNumbers();
  equal(turn.label.textContent, 'TITLE 19', 'refresh renumbers the NO ANSWER row to its global order');
  equal(turn.bar.getAttribute('data-h2o-turn-num'), '19', 'the projected attribute matches the global order');
  ok(changed >= 1, 'the refresh reports the correction');
  // Idempotent: a second pass is a no-op, never an occurrence counter.
  equal(h.api.DOM_refreshVisibleTurnNumbers(), 0, 'a settled row is not renumbered again');
  equal(turn.label.textContent, 'TITLE 19', 'the global order is stable across passes');
});

await fixture('14 NO ANSWER ordinals never fall back to an occurrence sequence', () => {
  const h = createOrdinalHarness();
  // Three NO ANSWER-shaped rows; only order 19 is genuinely unanswered in the
  // index. An occurrence counter would number them 1,2,3 — the resolver must
  // instead give 19 to the real one and nothing to rows it cannot prove.
  const real = h.mountNoAnswerTurn('q-19', 4);
  const unknownA = h.mountNoAnswerTurn('q-not-in-index-a', 1);
  const unknownB = h.mountNoAnswerTurn('q-not-in-index-b', 2);
  h.api.DOM_refreshVisibleTurnNumbers();
  equal(real.label.textContent, 'TITLE 19', 'the proven row uses its global order');
  equal(unknownA.label.textContent, 'TITLE', 'an unprovable row shows no number rather than a guess');
  equal(unknownB.label.textContent, 'TITLE', 'no occurrence sequence is ever assigned');
  equal(unknownA.bar.getAttribute('data-h2o-turn-num'), null, 'stale attribute is cleared, not kept');
});

await fixture('15 title-stack rows keep their Pages-Controller-owned ordinal', () => {
  const h = createOrdinalHarness();
  // A detached stack row carries no live question host, so the flow resolver
  // could not prove its order and would blank it. 1C1b already built it from
  // the same effective index, so ownership must stay with the stack.
  const stacked = h.mountNoAnswerTurn('q-detached-stack-row', 19);
  stacked.bar.setAttribute('data-h2o-in-title-stack', '2');
  h.api.DOM_refreshVisibleTurnNumbers();
  equal(stacked.label.textContent, 'TITLE 19', 'stack rows are owned by 1C1b and left untouched');
  equal(stacked.bar.getAttribute('data-h2o-turn-num'), '19', 'no double ownership of the stack ordinal');
});

// ── The MiniMap-side NO ANSWER ordinal writer (Stage 2C-2p) ───────────────
// Live sequence: 1C1a's refresh wrote the correct global order 19, then
// 1A1b's ensureNoAnswerTitleBar overwrote it with 3 — the index of that
// question among the ~19 MOUNTED user sections of a 39-turn branch.
const MM_PATH = 'src-runtime-base/1A1b.🟥🗺️ MiniMap Core 🧱🗺️.js';
const MM_SOURCE = fs.readFileSync(path.join(ROOT, MM_PATH), 'utf8');
// ensureNoAnswerTitleBar and its display-number helper moved out of MiniMap
// Core into 0C3a Chat Page Structure Engine. The assertions below are
// unchanged; only the file the production text is read from follows the code.
const MM_STRUCTURE_PATH = 'src-runtime-base/0C3a.⬛️📐 Chat Page Structure Engine 📐.js';
const MM_STRUCTURE_SOURCE = fs.readFileSync(path.join(ROOT, MM_STRUCTURE_PATH), 'utf8');

function fnDeclaration(source, name) {
  const token = `  function ${name}(`;
  if (source.indexOf(token) < 0 && MM_STRUCTURE_SOURCE.indexOf(token) >= 0) source = MM_STRUCTURE_SOURCE;
  const start = source.indexOf(token);
  if (start < 0) throw new Error(`production-function-missing:${name}`);
  const brace = source.indexOf('{', source.indexOf(')', start));
  let depth = 0, quote = '', escaped = false, line = false, block = false;
  for (let i = brace; i < source.length; i += 1) {
    const c = source[i], n = source[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '/' && n === '/') { line = true; i += 1; continue; }
    if (c === '/' && n === '*') { block = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`production-function-body-invalid:${name}`);
}

// options: { record, projectionEnabled, mountedQuestionIndex }
function createDisplayNumberHarness(options = {}, source = MM_SOURCE) {
  const host = new El('ARTICLE');
  const qEl = new El('DIV');
  qEl.setAttribute('data-message-id', 'dd431d44-q19');
  host.appendChild(qEl);
  // A window of the long branch: the target question is the 3rd MOUNTED user
  // section even though its global branch order is 19.
  const mounted = [];
  for (let i = 0; i < Number(options.mountedQuestionIndex ?? 2); i += 1) mounted.push(new El('ARTICLE'));
  mounted.push(host);
  const sandbox = {
    console, Object, String, Number, Math, Map, Set, Array, JSON,
    getQuestionMessageEl: () => qEl,
    getSharedTurnRecordByAnyId: () => (options.record === undefined
      ? { order: 19, qId: 'dd431d44-q19' }
      : options.record),
    getCompleteIndexProjectionStatus: () => ({ enabled: options.projectionEnabled !== false }),
    listLiveChatTurnSections: () => mounted,
    getChatPageTurnRole: () => 'user',
    getLiveChatTurnSectionForNode: (n) => n,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const code = fnDeclaration(source, 'getChatPageTurnDisplayNumber')
    + '\nglobalThis.__num = () => getChatPageTurnDisplayNumber(host);'
    + '\nglobalThis.__host = host;';
  new vm.Script(`const host = globalThis.__hostRef;\n${code}`, { filename: MM_PATH }).runInContext(
    Object.assign(sandbox, { __hostRef: host }),
  );
  return { call: () => sandbox.__num(), host };
}

await fixture('16 the MiniMap NO ANSWER writer reads the global order, not a mounted index', () => {
  const h = createDisplayNumberHarness();
  equal(h.call(), 19, 'an effective record with order 19 resolves to 19');
});

await fixture('17 an unresolvable row refuses the mounted-position fallback under complete-index authority', () => {
  // Authority cannot answer: the positional fallback would return 3 (index
  // among mounted user sections + 1) — the exact live "TITLE 3".
  const blind = createDisplayNumberHarness({ record: null, projectionEnabled: true });
  equal(blind.call(), 0, 'refuses to publish a mounted-position ordinal');
  const legacy = createDisplayNumberHarness({ record: null, projectionEnabled: false });
  equal(legacy.call(), 3, 'the legacy projection-disabled runtime keeps its positional fallback');
});

await fixture('18 legacy record shapes still resolve', () => {
  equal(createDisplayNumberHarness({ record: { turnNo: 19 } }).call(), 19, 'turnNo still honoured');
  equal(createDisplayNumberHarness({ record: { idx: 19 } }).call(), 19, 'idx still honoured');
});

const failed = fixtures.filter((f) => !f.ok);
console.log(`\nCV-3.30 fixtures ${fixtures.length - failed.length}/${fixtures.length} assertions ${assertions}`);
if (failed.length) { for (const f of failed) console.error(`FAILED ${f.name}`); process.exit(1); }
