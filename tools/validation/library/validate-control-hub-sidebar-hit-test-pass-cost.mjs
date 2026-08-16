#!/usr/bin/env node
// Control Hub sidebar hit-test pass cost contract (Gate B — expected RED).
//
// Proven live (Atlas visible long-chat browser trace, 14.54 s, renderer pid
// 27970): 43,834 HitTest events against 44,122 PrePaint events (1.007:1),
// ~2,500 ms of native document.elementFromPoint self-time, ~2,466 ms of it
// through the 0Z1a chain below, and 43,812 of the 43,834 hit tests
// concentrated inside only 14 burst tasks. 99.8% of HitTest time sat inside
// rAF callbacks. The page had already reached firstContentfulPaint at +0.803 s,
// so this is sustained post-render saturation, not a boot stall.
//
// The structural waste behind those numbers:
//
//   CHUB_scheduleTopBtnLayout()            -> one rAF callback
//     CHUB_layoutTopButton()
//       CHUB_resolveVisibleSidebarEdge()
//         CHUB_collectSidebarCandidates()  <- pass 1 (full sweep)
//     CHUB_ensureTopBtnSidebarObserver()
//       CHUB_collectSidebarCandidates()    <- pass 2 (full sweep, again)
//
// Between the two calls the only writes are the top button's own left /
// transform / top / data-h2o-topbtn-mode. Pass 2 exists solely to recover
// candidate.element values that pass 1 already returned in `candidates`.
//
// Inside one pass, CHUB_getHitTestedSidebarEdge sweeps
//
//   for (let x = right - 1; x >= left; x -= 2)   // 2px step
//     for (const y of ys)                        // 5 y-probes
//       CHUB_hitBelongsToCandidate(el, x, y)     // one elementFromPoint each
//
// with an early exit only once >= 2 of the 5 probes belong to the candidate.
// A mounted-but-occluded 260px stage shell therefore never exits early and
// pays 130 x-positions * 5 probes = 650 elementFromPoint calls before
// returning 0; a candidate at the 460px filter cap pays 1150. Broad selectors
// ([class*="sidebar" i], [id*="sidebar" i], [class*="slideover" i]) admit
// nested wrappers that share a left edge, x-range and y-ratios, so the SAME
// coordinates are re-probed once per candidate.
//
// The whole pass is read-only — CHUB_collectSidebarCandidates,
// CHUB_evaluateSidebarCandidate, CHUB_getHitTestedSidebarEdge and
// CHUB_hitBelongsToCandidate perform no writes — so document.elementFromPoint
// is invariant per coordinate for the duration of a pass.
//
// This validator pins two SAFE contracts only:
//
//   1. one scheduled layout frame performs at most one candidate collection
//   2. within one collection pass, elementFromPoint runs at most once per
//      distinct (x,y); the per-candidate hit === el / el.contains(hit) test
//      must still be evaluated independently for every candidate
//
// Deliberately NOT required here: a different x-step, a different y-probe set,
// a different early-exit rule, narrower selectors, dropping the hit-test
// discovery loop, dropping the stage-shell fallback, persistent or cross-frame
// caching, observer-scope changes, debouncing, or any change to which
// candidate wins. Those are separate decisions and must not be smuggled in
// through this gate. Contract 4 exists precisely to block cross-frame reuse.
//
// The REAL production implementations are extracted by name and executed
// against an instrumented DOM. No production source is modified.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HUB_PATH = 'src-runtime-base/0Z1a.⬛️🕹️ Control Hub 🕹️.js';
const SOURCE = fs.readFileSync(path.join(ROOT, HUB_PATH), 'utf8');

// ── Result collection ─────────────────────────────────────────────────────
// Cost contracts and semantic/integrity fixtures are collected into separate
// buckets so a RED cost contract never masks a semantic regression, and so
// contract 1 failing can never prevent contract 2 from being evaluated.
const semantic = [];
const invalidation = [];
const integrity = [];
const contracts = [];
let assertions = 0;

const eq = (a, b, m) => { assertions += 1; assert.deepEqual(a, b, m); };
const ok = (v, m) => { assertions += 1; assert.ok(v, m); };
const atMost = (a, b, m) => { assertions += 1; assert.ok(a <= b, `${m} (got ${a}, allowed <= ${b})`); };
const atLeast = (a, b, m) => { assertions += 1; assert.ok(a >= b, `${m} (got ${a}, required >= ${b})`); };

function into(bucket, name, run) {
  try { run(); bucket.push({ name, ok: true }); }
  catch (e) { bucket.push({ name, ok: false, error: String(e?.stack || e) }); }
}
const fixture = (n, r) => into(semantic, n, r);
const control = (n, r) => into(invalidation, n, r);
const mutation = (n, r) => into(integrity, n, r);
function contract(id, run) {
  try { run(); contracts.push({ id, ok: true }); }
  catch (e) { contracts.push({ id, ok: false, error: String(e?.stack || e) }); }
}

// ── Real-source extraction ────────────────────────────────────────────────
// 0Z1a is a 219KB self-booting IIFE owning the whole Control Hub UI.
// Executing it whole would require a materially fake environment for systems
// unrelated to this contract, so the REAL implementations on the cost path are
// extracted by name and run together in one VM scope. Every function named on
// the hit-test path is real production code; nothing on the path is
// re-implemented. Extraction fails closed.
function extractFunction(name) {
  const anchor = `  function ${name}(`;
  const start = SOURCE.indexOf(anchor);
  if (start < 0 || SOURCE.indexOf(anchor, start + anchor.length) >= 0) {
    throw new Error(`TEST_HARNESS_BLOCKED:function-anchor-invalid:${name}`);
  }
  const bodyStart = SOURCE.indexOf('{', SOURCE.indexOf(')', start));
  let d = 0, q = '', esc = false, lc = false, bc = false;
  for (let i = bodyStart; i < SOURCE.length; i += 1) {
    const c = SOURCE[i], n = SOURCE[i + 1];
    if (lc) { if (c === '\n') lc = false; continue; }
    if (bc) { if (c === '*' && n === '/') { bc = false; i += 1; } continue; }
    if (q) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === q) q = ''; continue; }
    if (c === '/' && n === '/') { lc = true; i += 1; continue; }
    if (c === '/' && n === '*') { bc = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') d += 1;
    else if (c === '}' && --d === 0) return SOURCE.slice(start, i + 1);
  }
  throw new Error(`TEST_HARNESS_BLOCKED:function-boundary-invalid:${name}`);
}

function extractStatement(anchorText, endToken) {
  const start = SOURCE.indexOf(anchorText);
  if (start < 0) throw new Error(`TEST_HARNESS_BLOCKED:statement-anchor-missing:${anchorText.slice(0, 44)}`);
  if (SOURCE.indexOf(anchorText, start + anchorText.length) >= 0) {
    throw new Error(`TEST_HARNESS_BLOCKED:statement-anchor-ambiguous:${anchorText.slice(0, 44)}`);
  }
  const end = SOURCE.indexOf(endToken, start);
  if (end < 0) throw new Error(`TEST_HARNESS_BLOCKED:statement-end-missing:${anchorText.slice(0, 44)}`);
  return SOURCE.slice(start, end + endToken.length);
}

// Hit-test cost path — every one of these is real production code.
const COST_PATH_FUNCTIONS = [
  'CHUB_rectSnapshot',
  'CHUB_sidebarElementLabel',
  'CHUB_hitBelongsToCandidate',
  'CHUB_getHitTestedSidebarEdge',
  'CHUB_evaluateSidebarCandidate',
  'CHUB_collectSidebarCandidates',
  'CHUB_resolveVisibleSidebarEdge',
];
// The two real call sites plus the real scheduler that binds them into one frame.
const FRAME_PATH_FUNCTIONS = [
  'CHUB_getSidebarRightEdge',
  'CHUB_getVisibleAnchorRect',
  'CHUB_pickVisibleAnchor',
  'CHUB_getPageDividerAnchor',
  'CHUB_getTitleListAnchor',
  'CHUB_getComposerAnchor',
  'CHUB_getMainColumnAnchor',
  'CHUB_resolveChatColumnAnchor',
  'CHUB_getTopBtnPlacement',
  'CHUB_layoutTopButton',
  'CHUB_scheduleTopBtnLayout',
  'CHUB_ensureTopBtnSidebarObserver',
  'CHUB_bindTopBtnLayoutOnce',
  'UTIL_q',
  'UTIL_qAll',
];

// Helpers a fix may or may not introduce. Loaded from real source when
// present; their absence is not an error, so this gate never mandates a
// particular decomposition — it only tests behaviour and cost.
const OPTIONAL_FUNCTIONS = [
  'CHUB_collectSidebarCandidatesCached',
  'CHUB_hitCacheGet',
  'CHUB_beginSidebarPass',
  'CHUB_endSidebarPass',
];
const optionalFn = (n) => (SOURCE.includes(`  function ${n}(`) ? extractFunction(n) : '');
const LOADED_OPTIONAL = OPTIONAL_FUNCTIONS.filter((n) => SOURCE.includes(`  function ${n}(`));

// A harness accessor block spliced into the owner scope. Top-level `const`/`let`
// in a VM script are lexical, not global-object properties, so the constants and
// module state can only be observed from inside the scope that declares them.
const EXPORT_BLOCK = `
globalThis.__CHUB = {
  get selectors(){ return CHUB_TOPBTN_SIDEBAR_SELECTORS; },
  get topBtnSelector(){ return SEL_CHUB_TOPBTN; },
  get roTargets(){ return CHUB_topBtnSidebarRoTargets; },
  get lastLayout(){ return CHUB_topBtnLastLayout; },
  get pendingRaf(){ return CHUB_topBtnLayoutRaf; },
  resolve(){ return CHUB_resolveVisibleSidebarEdge(); },
  schedule(){ return CHUB_scheduleTopBtnLayout(); },
  bindOnce(){ return CHUB_bindTopBtnLayoutOnce(); },
};`;

const REAL_PROGRAM = [
  extractStatement('  const SkID = ', ';'),
  extractStatement('  const ATTR_CGXUI      = ', ';'),
  extractStatement('  const ATTR_CGXUI_OWNER= ', ';'),
  extractStatement('  const UI_CHUB_TOPBTN   = ', ';'),
  extractStatement('  const SEL_CHUB_TOPBTN   = ', ';'),
  extractStatement('  const KEY_CHUB_TOPBTN_PLACEMENT_V1 = ', ';'),
  extractStatement('  const CHUB_TOPBTN_PLACEMENT_MODES = ', ';'),
  extractStatement('  let CHUB_topBtnLayoutRaf = ', ';'),
  extractStatement('  let CHUB_topBtnListenersBound = ', ';'),
  extractStatement('  let CHUB_topBtnSidebarRo = ', ';'),
  extractStatement('  let CHUB_topBtnSidebarRoTargets = ', ';'),
  extractStatement('  let CHUB_topBtnLastLayout = ', ';'),
  extractStatement('  const CHUB_TOPBTN_SIDEBAR_SELECTORS = [', '\n  ];'),
  ...OPTIONAL_FUNCTIONS.map(optionalFn),
  ...COST_PATH_FUNCTIONS.map(extractFunction),
  ...FRAME_PATH_FUNCTIONS.map(extractFunction),
  EXPORT_BLOCK,
].filter(Boolean).join('\n\n');

// Fail closed if the extracted program lost the two call sites this gate exists
// to measure — otherwise a refactor could silently make the contract vacuous.
for (const [needle, why] of [
  ['CHUB_resolveVisibleSidebarEdge()', 'layout-call-site'],
  ['CHUB_collectSidebarCandidates()', 'observer-call-site'],
  ['D.elementFromPoint(x, y)', 'probe-call'],
  ['x -= 2', 'sweep-step'],
]) {
  if (!REAL_PROGRAM.includes(needle)) {
    throw new Error(`TEST_HARNESS_BLOCKED:cost-path-missing:${why}`);
  }
}

// ── Selector engine ───────────────────────────────────────────────────────
// Supports exactly what the production selector table uses: tag, #id, .class
// and [attr op "value" i]. Anything else is recorded and treated as no-match
// rather than silently matching everything.
const unesc = (s) => s.replace(/\\(.)/g, '$1');
function splitTop(sel, sep) {
  const out = []; let depth = 0, quote = '', buf = '';
  for (const c of sel) {
    if (quote) { buf += c; if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") { quote = c; buf += c; continue; }
    if (c === '[') depth += 1;
    if (c === ']') depth -= 1;
    if (depth === 0 && ((sep === ',' && c === ',') || (sep === ' ' && /\s/.test(c)))) {
      if (buf.trim()) out.push(buf.trim());
      buf = ''; continue;
    }
    buf += c;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}
function parseCompound(sel) {
  const out = { tag: null, id: null, classes: [], attrs: [] };
  let i = 0;
  const tag = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(sel);
  if (tag) { out.tag = tag[0].toLowerCase(); i = tag[0].length; }
  while (i < sel.length) {
    const c = sel[i];
    if (c === '#' || c === '.') {
      let j = i + 1, buf = '';
      while (j < sel.length) {
        if (sel[j] === '\\') { buf += sel[j] + sel[j + 1]; j += 2; continue; }
        if ('.#['.includes(sel[j])) break;
        buf += sel[j]; j += 1;
      }
      if (c === '#') out.id = unesc(buf); else out.classes.push(unesc(buf));
      i = j; continue;
    }
    if (c === '[') {
      const end = sel.indexOf(']', i);
      if (end < 0) throw new Error('unsupported-selector');
      const m = /^([a-zA-Z0-9_:-]+)(?:([*^$|~]?=)\s*"([^"]*)"|([*^$|~]?=)\s*'([^']*)')?\s*(i)?$/
        .exec(sel.slice(i + 1, end).trim());
      if (!m) throw new Error('unsupported-selector');
      out.attrs.push({ name: m[1], op: m[2] || m[4] || null, value: m[3] !== undefined ? m[3] : m[5], ci: !!m[6] });
      i = end + 1; continue;
    }
    throw new Error('unsupported-selector');
  }
  return out;
}
const selCache = new Map();
const unsupported = new Set();
function parseSelector(sel) {
  if (selCache.has(sel)) return selCache.get(sel);
  let parsed = null;
  try { parsed = splitTop(sel, ',').map((g) => splitTop(g, ' ').map(parseCompound)); }
  catch { unsupported.add(sel); }
  selCache.set(sel, parsed);
  return parsed;
}
function matchesCompound(el, c) {
  if (c.tag && el.tagName.toLowerCase() !== c.tag) return false;
  if (c.id !== null && el.getAttribute('id') !== c.id) return false;
  for (const cls of c.classes) {
    if (!String(el.getAttribute('class') || '').split(/\s+/).filter(Boolean).includes(cls)) return false;
  }
  for (const a of c.attrs) {
    const raw = el.getAttribute(a.name);
    if (raw === null) return false;
    if (!a.op) continue;
    const hay = a.ci ? String(raw).toLowerCase() : String(raw);
    const nee = a.ci ? String(a.value).toLowerCase() : String(a.value);
    if (a.op === '=' && hay !== nee) return false;
    if (a.op === '*=' && !hay.includes(nee)) return false;
    if (a.op === '^=' && !hay.startsWith(nee)) return false;
    if (a.op === '$=' && !hay.endsWith(nee)) return false;
    if (a.op === '~=' && !hay.split(/\s+/).includes(nee)) return false;
    if (a.op === '|=' && hay !== nee && !hay.startsWith(`${nee}-`)) return false;
  }
  return true;
}
function matchesGroup(el, group) {
  if (!matchesCompound(el, group[group.length - 1])) return false;
  let node = el.parentElement, i = group.length - 2;
  while (i >= 0) {
    if (!node) return false;
    if (matchesCompound(node, group[i])) i -= 1;
    node = node.parentElement;
  }
  return true;
}
function elMatches(el, sel) {
  const parsed = parseSelector(sel);
  if (!parsed) return false;
  return parsed.some((g) => matchesGroup(el, g));
}

// ── Instrumented DOM ──────────────────────────────────────────────────────
// Every counted boundary is counted directly on the real external API the
// production code calls — never inferred from a re-implementation.
function newMetrics() {
  return {
    rafScheduled: 0, rafExecuted: 0,
    collectPasses: 0, passes: [],
    efpRequests: 0, efpReal: 0, efpOutsidePass: 0,
    gbcr: 0, gcs: 0, getClientRects: 0,
    layoutTopButtonCalls: 0,
    roConstructed: 0, roObserve: 0, roDisconnect: 0,
    styleWrites: 0, modeWrites: 0, attrWrites: 0,
    windowListeners: [], documentListeners: [], timeouts: [],
  };
}

function buildScene(spec) {
  const m = newMetrics();
  const vw = spec.vw, vh = spec.vh;
  const all = [];
  let currentPass = null;

  // LOGICAL probe accounting. A logical request is one (x,y) the algorithm
  // asks about; a real call is one that reaches document.elementFromPoint.
  // The outermost probe site records it, whichever site that is in the
  // version under test, so the count is identical whether or not the module
  // de-duplicates internally. This is what makes non-vacuity version-agnostic:
  // the FIXTURE's duplicate requests are provable even when the product
  // collapses them before the DOM boundary.
  const probe = {
    depth: 0,
    enter(x, y) {
      if (probe.depth === 0 && currentPass) {
        currentPass.logicalRaw += 1;
        currentPass.logicalCoords.add(`${x}|${y}`);
      }
      probe.depth += 1;
    },
    exit() { probe.depth -= 1; },
  };

  class El {
    constructor(tag, id) {
      this.tagName = String(tag || 'div').toUpperCase();
      this.__attrs = new Map();
      this.__children = [];
      this.parentElement = null;
      this.__rect = { left: 0, top: 0, width: 0, height: 0 };
      this.__css = { display: 'block', visibility: 'visible', opacity: '1', pointerEvents: 'auto' };
      this.__z = 0;
      this.__connected = true;
      this.__styleWrites = [];
      if (id) this.__attrs.set('id', id);
      all.push(this);
    }
    get id() { return this.__attrs.get('id') || ''; }
    get className() { return this.__attrs.get('class') || ''; }
    get isConnected() {
      let n = this; while (n) { if (!n.__connected) return false; if (n === docEl) return true; n = n.parentElement; }
      return false;
    }
    get children() { return this.__children.slice(); }
    get firstElementChild() { return this.__children[0] || null; }
    getAttribute(n) { return this.__attrs.has(n) ? this.__attrs.get(n) : null; }
    hasAttribute(n) { return this.__attrs.has(n); }
    setAttribute(n, v) {
      m.attrWrites += 1;
      if (n === 'data-h2o-topbtn-mode') m.modeWrites += 1;
      this.__attrs.set(n, String(v));
    }
    removeAttribute(n) { this.__attrs.delete(n); }
    get classList() {
      const self = this;
      return {
        contains: (c) => String(self.className).split(/\s+/).includes(c),
        add(...cs) { const s = new Set(String(self.className).split(/\s+/).filter(Boolean)); cs.forEach((c) => s.add(c)); self.__attrs.set('class', [...s].join(' ')); },
        remove(...cs) { const s = new Set(String(self.className).split(/\s+/).filter(Boolean)); cs.forEach((c) => s.delete(c)); self.__attrs.set('class', [...s].join(' ')); },
      };
    }
    get style() {
      const self = this;
      return {
        setProperty(p, v) { m.styleWrites += 1; self.__styleWrites.push(`${p}=${v}`); },
        removeProperty(p) { m.styleWrites += 1; self.__styleWrites.push(`-${p}`); },
        getPropertyValue() { return ''; },
      };
    }
    appendChild(c) { c.parentElement = this; this.__children.push(c); return c; }
    contains(node) { let n = node; while (n) { if (n === this) return true; n = n.parentElement; } return false; }
    matches(sel) { return elMatches(this, sel); }
    closest(sel) { let n = this; while (n) { if (elMatches(n, sel)) return n; n = n.parentElement; } return null; }
    querySelectorAll(sel) { return descendants(this).filter((e) => elMatches(e, sel)); }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    getBoundingClientRect() {
      m.gbcr += 1;
      const r = this.__rect;
      return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top };
    }
    getClientRects() { m.getClientRects += 1; return this.__rect.width > 0 && this.__rect.height > 0 ? [this.getBoundingClientRect()] : []; }
    get offsetParent() { return this.__css.display === 'none' ? null : this.parentElement; }
    get textContent() { return this.__attrs.get('__text') || ''; }
  }

  function descendants(root) {
    const out = [];
    const walk = (n) => { for (const c of n.__children) { out.push(c); walk(c); } };
    walk(root);
    return out;
  }

  const docEl = new El('html');
  docEl.__rect = { left: 0, top: 0, width: vw, height: vh };
  const body = new El('body');
  body.__rect = { left: 0, top: 0, width: vw, height: vh };
  docEl.appendChild(body);

  const byId = new Map();
  for (const n of spec.nodes) {
    const el = new El(n.tag || 'div', n.id);
    if (n.cls) el.__attrs.set('class', n.cls);
    for (const [k, v] of Object.entries(n.attrs || {})) el.__attrs.set(k, String(v));
    el.__rect = { left: n.rect[0], top: n.rect[1], width: n.rect[2], height: n.rect[3] };
    el.__z = n.z || 0;
    Object.assign(el.__css, n.css || {});
    byId.set(n.id, el);
    (n.parent ? byId.get(n.parent) : body).appendChild(el);
  }

  // Occlusion model: topmost paintable element whose rect contains (x,y),
  // resolved by z then document order. Fixtures own the occlusion map.
  function hitAt(x, y) {
    let best = null, bestKey = -1;
    const order = descendants(docEl);
    for (let i = 0; i < order.length; i += 1) {
      const el = order[i];
      const c = el.__css;
      if (c.display === 'none' || c.visibility === 'hidden' || Number(c.opacity) === 0 || c.pointerEvents === 'none') continue;
      if (!el.isConnected) continue;
      const r = el.__rect;
      if (x < r.left || x >= r.left + r.width || y < r.top || y >= r.top + r.height) continue;
      const key = el.__z * 100000 + i;
      if (key > bestKey) { bestKey = key; best = el; }
    }
    return best || body;
  }

  const D = {
    documentElement: docEl,
    body,
    querySelectorAll: (sel) => descendants(docEl).filter((e) => elMatches(e, sel)),
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
    getElementById: (id) => descendants(docEl).find((e) => e.id === id) || null,
    createElement: (t) => new El(t),
    addEventListener: (t) => { m.documentListeners.push(t); },
    removeEventListener: () => {},
    elementFromPoint(x, y) {
      probe.enter(x, y);
      try {
        m.efpRequests += 1;
        const key = `${x}|${y}`;
        if (currentPass) {
          currentPass.requests += 1;
          currentPass.coords.add(key);
          if (currentPass.memo && currentPass.memo.has(key)) return currentPass.memo.get(key);
        } else {
          m.efpOutsidePass += 1;
        }
        m.efpReal += 1;
        if (currentPass) currentPass.real += 1;
        const hit = hitAt(x, y);
        if (currentPass && currentPass.memo) currentPass.memo.set(key, hit);
        return hit;
      } finally { probe.exit(); }
    },
  };

  const rafQueue = [];
  const W = {
    innerWidth: vw,
    innerHeight: vh,
    document: D,
    getComputedStyle(el) { m.gcs += 1; return { ...el.__css }; },
    requestAnimationFrame(fn) { m.rafScheduled += 1; rafQueue.push(fn); return rafQueue.length; },
    cancelAnimationFrame(id) { if (id > 0 && rafQueue[id - 1]) rafQueue[id - 1] = null; },
    addEventListener: (t) => { m.windowListeners.push(t); },
    removeEventListener: () => {},
    setTimeout: (fn, ms) => { m.timeouts.push(ms); return m.timeouts.length; },
    clearTimeout: () => {},
    localStorage: { getItem: () => spec.placement || null, setItem: () => {} },
    Date,
    Math,
  };

  const roInstances = [];
  class ResizeObserver {
    constructor(cb) { m.roConstructed += 1; this.cb = cb; this.targets = []; roInstances.push(this); }
    observe(el) { m.roObserve += 1; this.targets.push(el); }
    unobserve(el) { this.targets = this.targets.filter((t) => t !== el); }
    disconnect() { m.roDisconnect += 1; this.targets = []; }
  }

  return {
    m, D, W, ResizeObserver, byId, docEl, body, El,
    vw, vh,
    hitAt, probe,
    flushRaf() {
      const batch = rafQueue.splice(0, rafQueue.length);
      for (const fn of batch) { if (typeof fn === 'function') { m.rafExecuted += 1; fn(); } }
    },
    openPass(memo) {
      currentPass = { requests: 0, real: 0, coords: new Set(), memo: memo ? new Map() : null, logicalRaw: 0, logicalCoords: new Set() };
      return currentPass;
    },
    closePass() { const p = currentPass; currentPass = null; return p; },
    get pass() { return currentPass; },
    roInstances,
  };
}

// ── Scene runner ──────────────────────────────────────────────────────────
// Variants are harness-level INJECTIONS, never product patches. Each knob
// forces a behaviour regardless of what the module under test already does, so
// every expectation below holds for a defective and a corrected module alike.
// Nothing here inspects which version is loaded in order to change what is
// expected of it.
//
//   collect: 'natural'    — whatever the module does
//            'force-one'  — collection memoised for one rAF callback (guarantee)
//            'force-two'  — observer step always re-collects (injected defect)
//   probe:   'natural'    — whatever the module does
//            'force-memo' — elementFromPoint memoised per pass (guarantee)
//            'force-bypass' — same-pass reuse neutralised (injected defect)
//            'stale'      — memo persists ACROSS frames (injected defect)
//   edge/targets         — degenerate outputs that must fail the oracles
const VARIANTS = {
  natural:      { collect: 'natural',   probe: 'natural' },
  guardBoth:    { collect: 'force-one', probe: 'force-memo' },
  injectDup:    { collect: 'force-two', probe: 'force-memo' },
  injectRepeat: { collect: 'force-one', probe: 'force-bypass' },
  injectBoth:   { collect: 'force-two', probe: 'force-bypass' },
  stale:        { collect: 'natural',   probe: 'stale' },
  wrongEdge:    { collect: 'natural',   probe: 'natural', edge: 'wrong' },
  wrongTargets: { collect: 'natural',   probe: 'natural', targets: 'truncate' },
};
function runScene(spec, variant = 'natural') {
  const scene = buildScene(spec);
  const sandbox = {
    W: scene.W, D: scene.D, H2O: {}, console,
    ResizeObserver: scene.ResizeObserver,
    Date, Math, JSON, Number, String, Array, Object, Map, Set, Boolean, Error,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = scene.W;
  sandbox.document = scene.D;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(REAL_PROGRAM, ctx, { filename: 'chub-cost-path.js' });

  const api = ctx.__CHUB;
  const realCollect = ctx.CHUB_collectSidebarCandidates;
  const realEdge = ctx.CHUB_getHitTestedSidebarEdge;
  const realEnsure = ctx.CHUB_ensureTopBtnSidebarObserver;
  const V = VARIANTS[variant] || VARIANTS.natural;
  const memoPass = V.probe === 'force-memo' || V.probe === 'stale';
  const dedupe = V.collect === 'force-one';
  const snap = (q) => ({ requests: q.requests, real: q.real, distinct: q.coords.size, logicalRaw: q.logicalRaw, logicalDistinct: q.logicalCoords.size });

  let frameToken = 0;
  let frameCache = null;
  let stalePass = null;

  ctx.CHUB_collectSidebarCandidates = function collectInstrumented(...a) {
    if (dedupe && frameCache && frameCache.token === frameToken) return frameCache.value;
    scene.m.collectPasses += 1;
    const stale = V.probe === 'stale';
    const p = stale ? (stalePass || (stalePass = scene.openPass(true))) : scene.openPass(memoPass);
    let out;
    try { out = realCollect.apply(this, a); }
    finally { scene.m.passes.push(snap(stale ? p : scene.closePass())); }
    if (dedupe) frameCache = { token: frameToken, value: out };
    return out;
  };

  if (V.probe === 'stale') stalePass = scene.openPass(true);

  // ── Logical-probe wrappers ──────────────────────────────────────────────
  // Both probe sites carry (…, x, y) at argument indexes 1 and 2. The outermost
  // site records the logical request, so raw/distinct request counts are
  // identical whether or not the module de-duplicates before the DOM boundary.
  const wrapProbe = (fn) => function (...a) {
    scene.probe.enter(a[1], a[2]);
    try { return fn.apply(this, a); } finally { scene.probe.exit(); }
  };
  ctx.CHUB_hitBelongsToCandidate = wrapProbe(ctx.CHUB_hitBelongsToCandidate);
  if (typeof ctx.CHUB_hitCacheGet === 'function') {
    // force-bypass neutralises same-pass reuse without touching product source.
    // A module with no such helper has nothing to bypass and already behaves as
    // bypassed — the expectation for this injection is the same either way.
    ctx.CHUB_hitCacheGet = V.probe === 'force-bypass'
      ? wrapProbe(function (_memo, x, y) { return scene.D.elementFromPoint(x, y); })
      : wrapProbe(ctx.CHUB_hitCacheGet);
  }
  if (V.collect === 'force-two') {
    // Drop any handed-over candidate list so the observer step always collects,
    // whether or not the module offers a handover parameter at all.
    ctx.CHUB_ensureTopBtnSidebarObserver = ((real) => function () {
      return real.call(this, undefined);
    })(ctx.CHUB_ensureTopBtnSidebarObserver);
  }

  ctx.CHUB_layoutTopButton = ((real) => function layoutInstrumented(...a) {
    scene.m.layoutTopButtonCalls += 1;
    return real.apply(this, a);
  })(ctx.CHUB_layoutTopButton);

  if (V.edge === 'wrong') {
    ctx.CHUB_getHitTestedSidebarEdge = function () { return 999; };
  }
  if (V.targets === 'truncate') {
    ctx.CHUB_ensureTopBtnSidebarObserver = function () {
      const list = ctx.CHUB_collectSidebarCandidates().map((c) => c.element).filter(Boolean).slice(0, 1);
      const ro = new scene.ResizeObserver(() => {});
      for (const el of list) ro.observe(el);
      scene.__forcedTargets = list;
      return undefined;
    };
  }

  const frame = () => {
    frameToken += 1;
    frameCache = null;
    api.schedule();
    scene.flushRaf();
  };

  return {
    scene, ctx, api, frame,
    realEnsure,
    resolve: () => api.resolve(),
    // Normalised onto a host array: the observer's early-return path keeps a
    // VM-realm [] literal while populated paths come back through the injected
    // Array.from, and node:assert/strict compares prototypes.
    targets: () => Array.from(scene.__forcedTargets || api.roTargets || []).map((el) => el?.id || '?'),
    edge: () => api.lastLayout?.selectedSidebarEdge ?? null,
    source: () => api.lastLayout?.selectedSidebarSource ?? null,
    m: scene.m,
  };
}

// Convenience: run exactly one scheduled layout frame and report its metrics.
function oneFrame(spec, variant = 'natural') {
  const r = runScene(spec, variant);
  r.frame();
  return r;
}

// ── Scenes ────────────────────────────────────────────────────────────────
const VW = 1440, VH = 900;
const TOPBTN = {
  id: 'topbtn', tag: 'button', rect: [600, 10, 95, 30], z: 9,
  attrs: { 'data-cgxui': 'cnhb-topbtn', 'data-cgxui-owner': 'cnhb' },
};
// A main content overlay painted above the sidebar layer from x=50 rightwards.
const OVERLAY = { id: 'main-overlay', tag: 'main', rect: [50, 0, VW - 50, VH], z: 5 };
const base = (nodes, over = {}) => ({ vw: VW, vh: VH, nodes: [TOPBTN, ...nodes], ...over });

// 1. Collapsed visible rail (50px), on top of nothing else.
const S_COLLAPSED = base([
  OVERLAY,
  { id: 'stage-sidebar-tiny-bar', rect: [0, 0, 50, VH], z: 2 },
]);
// 2. Expanded visible sidebar (260px). Overlay pushed right so it does not occlude.
const S_EXPANDED = base([
  { id: 'main-overlay', tag: 'main', rect: [260, 0, VW - 260, VH], z: 5 },
  { id: 'stage-slideover-sidebar', rect: [0, 0, 260, VH], z: 2 },
]);
// 3. Occluded 260px stage shell + separate 50px visible rail (NOT its child).
//    The shell can never satisfy the early exit and pays the full sweep.
const S_OCCLUDED = base([
  OVERLAY,
  { id: 'stage-slideover-sidebar', rect: [0, 0, 260, VH], z: 1 },
  { id: 'stage-sidebar-tiny-bar', rect: [0, 0, 50, VH], z: 2 },
]);
// 4. Candidate at the 460px width cap, fully occluded from x=50 rightwards.
const S_CAP = base([
  OVERLAY,
  { id: 'sidebar-cap', cls: 'sidebar-cap', rect: [0, 0, 460, VH], z: 1 },
  { id: 'stage-sidebar-tiny-bar', rect: [0, 0, 50, VH], z: 2 },
]);
// 5. Two nested wrappers sharing the same left edge and coordinate grid.
const S_NESTED = base([
  OVERLAY,
  { id: 'sidebar-wrap', cls: 'sidebar-wrap', rect: [0, 0, 50, VH], z: 2 },
  { id: 'sidebar-inner', cls: 'sidebar-inner', rect: [0, 0, 50, VH], z: 3, parent: 'sidebar-wrap' },
]);
// 6. Multiple candidates with overlapping probe coordinates (three siblings).
const S_OVERLAP = base([
  OVERLAY,
  { id: 'sidebar-a', cls: 'sidebar-a', rect: [0, 0, 50, VH], z: 2 },
  { id: 'sidebar-b', cls: 'sidebar-b', rect: [0, 0, 50, VH], z: 3 },
  { id: 'sidebar-c', cls: 'sidebar-c', rect: [0, 0, 50, VH], z: 4 },
]);
// 13. RTL: the sidebar sits on the right. Production rejects it via the
//     `rect.left > 16 -> not-left-anchored` filter; the gate pins current
//     behaviour and does not authorise changing it.
const S_RTL = { vw: VW, vh: VH, rtl: true, nodes: [TOPBTN,
  { id: 'main-overlay', tag: 'main', rect: [0, 0, VW - 260, VH], z: 5 },
  { id: 'stage-slideover-sidebar', rect: [VW - 260, 0, 260, VH], z: 2 }] };
// 14. Zoom-scaled / fractional geometry. The rail ends at 50.75, so the main
//     overlay begins at 51 — x=50 is still rail, which is the whole point.
const S_FRACTIONAL = base([
  { id: 'main-overlay', tag: 'main', rect: [51, 0, VW - 51, VH], z: 5 },
  { id: 'stage-sidebar-tiny-bar', rect: [0.5, 0.25, 50.25, VH - 0.5], z: 2 },
]);
// 16. No valid visible sidebar at all.
const S_NONE = base([{ id: 'main-overlay', tag: 'main', rect: [0, 0, VW, VH], z: 5 }]);
// 17. Competing candidates distinguished only by the contains() test:
//     `parent` is hit indirectly through `child`; `decoy` shares the rect but
//     contains nothing that is ever the topmost hit.
const S_CONTAINS = base([
  OVERLAY,
  { id: 'sidebar-decoy', cls: 'sidebar-decoy', rect: [0, 0, 50, VH], z: 1 },
  { id: 'sidebar-parent', cls: 'sidebar-parent', rect: [0, 0, 50, VH], z: 2 },
  { id: 'sidebar-child', cls: 'sidebar-child', rect: [0, 0, 50, VH], z: 3, parent: 'sidebar-parent' },
]);

// ══════════════════════════════════════════════════════════════════════════
// HARNESS INTEGRITY — the counters must be real before any contract is read.
// ══════════════════════════════════════════════════════════════════════════
into(semantic, 'harness: real cost-path functions extracted from production source', () => {
  eq(COST_PATH_FUNCTIONS.every((n) => REAL_PROGRAM.includes(`function ${n}(`)), true, 'all cost-path functions present');
  ok(REAL_PROGRAM.includes('const hit = D.elementFromPoint(x, y);'), 'real probe call extracted verbatim');
  ok(REAL_PROGRAM.includes('for (let x = right - 1; x >= left; x -= 2)'), 'real sweep loop extracted verbatim');
  ok(REAL_PROGRAM.length > 8000, 'extracted program is substantial');
});

into(semantic, 'harness: selector table is the real production table', () => {
  const r = runScene(S_COLLAPSED);
  const sels = r.api.selectors;
  ok(Array.isArray(sels) && sels.length === 9, `9 production sidebar selectors (got ${sels?.length})`);
  ok(sels.includes('[class*="sidebar" i]'), 'broad class selector present');
  ok(sels.includes('#stage-sidebar-tiny-bar'), 'tiny-bar selector present');
  eq(unsupported.size, 0, `every production selector is understood by the harness: ${[...unsupported].join(' | ')}`);
});

into(semantic, 'harness: elementFromPoint respects the fixture occlusion map', () => {
  const s = buildScene(S_OCCLUDED);
  eq(s.hitAt(10, 450).id, 'stage-sidebar-tiny-bar', 'rail wins below x=50');
  eq(s.hitAt(100, 450).id, 'main-overlay', 'overlay wins at x>=50');
  eq(s.byId.get('stage-slideover-sidebar').contains(s.byId.get('stage-sidebar-tiny-bar')), false,
    'occluded shell does NOT contain the rail (otherwise it would early-exit)');
});

// ══════════════════════════════════════════════════════════════════════════
// SEMANTIC ORACLES — declared from scene geometry, not from the implementation.
// ══════════════════════════════════════════════════════════════════════════
fixture('1. collapsed visible rail -> edge 50', () => {
  const r = oneFrame(S_COLLAPSED);
  eq(r.edge(), 50, 'rail occupies x in [0,50) so the visible right edge is 50');
  eq(r.targets().includes('stage-sidebar-tiny-bar'), true, 'rail is observed');
});

fixture('2. expanded visible sidebar -> edge 260', () => {
  const r = oneFrame(S_EXPANDED);
  eq(r.edge(), 260, 'expanded panel occupies x in [0,260)');
  eq(r.targets().includes('stage-slideover-sidebar'), true, 'panel is observed');
});

fixture('3. occluded 260px shell rejected, rail wins, full sweep paid', () => {
  const r = oneFrame(S_OCCLUDED);
  eq(r.edge(), 50, 'the visible rail wins, not the stale 260px shell');
  const first = r.m.passes[0];
  atLeast(first.real, 650, 'the occluded shell pays the full 130x5 sweep');
});

fixture('4. 460px cap candidate is admitted and swept in full', () => {
  const r = oneFrame(S_CAP);
  eq(r.edge(), 50, 'only the rail is genuinely visible');
  const first = r.m.passes[0];
  atLeast(first.real, 1150, 'a 460px occluded candidate pays 230x5 probes');
});

fixture('5. nested wrappers sharing one edge both resolve to 50', () => {
  const r = oneFrame(S_NESTED);
  eq(r.edge(), 50, 'wrapper and inner share the same visible edge');
  const t = r.targets();
  eq(t.includes('sidebar-wrap') && t.includes('sidebar-inner'), true, 'both nested candidates observed');
});

fixture('6. overlapping sibling candidates resolve to one edge', () => {
  const r = oneFrame(S_OVERLAP);
  eq(r.edge(), 50, 'three overlapping candidates agree on the visible edge');
  const t = r.targets();
  eq(['sidebar-a', 'sidebar-b', 'sidebar-c'].every((id) => t.includes(id)), true, 'all three observed');
});

fixture('13. RTL right-anchored sidebar is rejected (pinned current behaviour)', () => {
  const r = oneFrame(S_RTL);
  eq(r.edge(), 0, 'production rejects a right-anchored sidebar via not-left-anchored');
  eq(r.source(), 'none', 'no candidate selected');
});

fixture('14. fractional / zoom-scaled geometry resolves deterministically', () => {
  const r = oneFrame(S_FRACTIONAL);
  eq(r.edge(), 51, 'rail spans [0.5,50.75): sweep starts at x=50 and returns 51');
});

fixture('16. no visible sidebar -> edge 0, no observer targets', () => {
  const r = oneFrame(S_NONE);
  eq(r.edge(), 0, 'nothing visible');
  eq(r.source(), 'none', 'no source selected');
  eq(r.targets().length, 0, 'nothing observed');
});

fixture('17. contains() vs identity: decoy rejected, parent+child accepted', () => {
  const r = oneFrame(S_CONTAINS);
  const res = r.resolve();
  const by = Object.fromEntries(res.candidates.map((c) => [c.element?.id, c]));
  eq(by['sidebar-child'].accepted, true, 'child is the topmost hit (hit === el)');
  eq(by['sidebar-parent'].accepted, true, 'parent accepted via el.contains(hit)');
  eq(by['sidebar-decoy'].accepted, false, 'decoy contains no hit and is rejected');
  eq(by['sidebar-decoy'].reason, 'no-visible-hit-tested-occupancy', 'rejected for the right reason');
  eq(res.selectedSidebarEdge, 50, 'edge unaffected by the decoy');
});

fixture('semantic: corrected candidate preserves every oracle', () => {
  for (const [name, spec, edge] of [
    ['collapsed', S_COLLAPSED, 50], ['expanded', S_EXPANDED, 260], ['occluded', S_OCCLUDED, 50],
    ['cap', S_CAP, 50], ['nested', S_NESTED, 50], ['overlap', S_OVERLAP, 50],
    ['rtl', S_RTL, 0], ['fractional', S_FRACTIONAL, 51], ['none', S_NONE, 0], ['contains', S_CONTAINS, 50],
  ]) {
    const p = oneFrame(spec, 'natural');
    const c = oneFrame(spec, 'guardBoth');
    eq(c.edge(), edge, `${name}: corrected edge matches the geometric oracle`);
    eq(c.edge(), p.edge(), `${name}: corrected edge identical to pristine`);
    eq(c.targets(), p.targets(),
      `${name}: corrected observer targets identical to pristine (corrected ${JSON.stringify(c.targets())}, pristine ${JSON.stringify(p.targets())})`);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// POSITIVE INVALIDATION CONTROLS — a fix must not satisfy the cost contract
// by reusing results across frames.
// ══════════════════════════════════════════════════════════════════════════
function invalidationCase(name, variant, mutate, expectEdgeAfter) {
  const r = runScene(S_COLLAPSED, variant);
  r.frame();
  const before = r.edge();
  const passesBefore = r.m.collectPasses;
  mutate(r.scene);
  r.frame();
  return { r, before, after: r.edge(), passesBefore, passesAfter: r.m.collectPasses, expectEdgeAfter };
}

// The overlay is the occluder, so any scene mutation that widens the rail must
// move the overlay with it — otherwise the fixture is testing occlusion, not
// invalidation.
const widenRail = (s, id, width, vw = null) => {
  s.byId.get(id).__rect.width = width;
  s.byId.get('main-overlay').__rect = { left: width, top: 0, width: (vw ?? s.vw) - width, height: s.vh };
  if (vw !== null) s.W.innerWidth = vw;
};

control('invalidation: viewport resize forces a fresh pass and a new edge', () => {
  const c = invalidationCase('resize', 'guardBoth', (s) => widenRail(s, 'stage-sidebar-tiny-bar', 120, 800), 120);
  atLeast(c.passesAfter - c.passesBefore, 1, 'a second collection pass runs after resize');
  eq(c.after, 120, 'the new geometry produces a new edge');
});

control('invalidation: candidate rectangle change forces a fresh sweep', () => {
  const c = invalidationCase('rect', 'guardBoth', (s) => widenRail(s, 'stage-sidebar-tiny-bar', 200), 200);
  atLeast(c.passesAfter - c.passesBefore, 1, 'a second collection pass runs');
  eq(c.after, 200, 'the moved rectangle produces a new edge');
});

control('invalidation: candidate-set change is observed', () => {
  const r = runScene(S_COLLAPSED, 'guardBoth');
  r.frame();
  const before = r.targets();
  const extra = new r.scene.El('div', 'sidebar-extra');
  extra.__attrs.set('class', 'sidebar-extra');
  extra.__rect = { left: 0, top: 0, width: 50, height: VH };
  extra.__z = 3;
  r.scene.body.appendChild(extra);
  r.frame();
  const after = r.targets();
  ok(after.length > before.length, `candidate set grew (${before.length} -> ${after.length})`);
  eq(after.includes('sidebar-extra'), true, 'the new candidate is observed');
});

control('invalidation: sidebar replacement re-targets the observer', () => {
  const r = runScene(S_COLLAPSED, 'guardBoth');
  r.frame();
  const before = r.targets();
  const old = r.scene.byId.get('stage-sidebar-tiny-bar');
  old.__connected = false;
  old.__rect = { left: 0, top: 0, width: 0, height: 0 };
  const fresh = new r.scene.El('nav', 'stage-sidebar-tiny-bar-v2');
  fresh.__attrs.set('class', 'sidebar-rail-v2');
  fresh.__rect = { left: 0, top: 0, width: 64, height: VH };
  fresh.__z = 2;
  r.scene.body.appendChild(fresh);
  r.scene.byId.get('main-overlay').__rect = { left: 64, top: 0, width: VW - 64, height: VH };
  r.frame();
  eq(r.edge(), 64, 'replacement node drives the new edge');
  ok(!r.targets().includes('stage-sidebar-tiny-bar') || r.targets() !== before, 'observer re-targeted');
});

control('invalidation: collapse -> expand transition produces a new edge', () => {
  const r = runScene(S_COLLAPSED, 'guardBoth');
  r.frame();
  eq(r.edge(), 50, 'collapsed edge');
  r.scene.byId.get('stage-sidebar-tiny-bar').__rect.width = 260;
  r.scene.byId.get('main-overlay').__rect = { left: 260, top: 0, width: VW - 260, height: VH };
  r.frame();
  eq(r.edge(), 260, 'expanded edge');
});

control('invalidation: expand -> collapse transition produces a new edge', () => {
  const r = runScene(S_EXPANDED, 'guardBoth');
  r.frame();
  eq(r.edge(), 260, 'expanded edge');
  r.scene.byId.get('stage-slideover-sidebar').__rect.width = 50;
  r.scene.byId.get('main-overlay').__rect = { left: 50, top: 0, width: VW - 50, height: VH };
  r.frame();
  eq(r.edge(), 50, 'collapsed edge');
});

control('invalidation: unchanged state still re-resolves to the same edge', () => {
  const r = runScene(S_COLLAPSED, 'guardBoth');
  r.frame();
  const a = r.edge();
  r.frame();
  eq(r.edge(), a, 'a repeated unchanged frame is still correct');
});

// ══════════════════════════════════════════════════════════════════════════
// PRISTINE COST MEASUREMENT
// ══════════════════════════════════════════════════════════════════════════
const PRIMARY = S_NESTED;   // nested wrappers sharing one coordinate grid
const target = oneFrame(PRIMARY, 'natural');
const targetPasses = target.m.passes;
const targetTotals = targetPasses.reduce((acc, q) => ({
  real: acc.real + q.real, logicalRaw: acc.logicalRaw + q.logicalRaw,
  logicalDistinct: acc.logicalDistinct + q.logicalDistinct,
}), { real: 0, logicalRaw: 0, logicalDistinct: 0 });
const TARGET_REPEATED_REAL = targetPasses.reduce((w, q) => Math.max(w, q.real - q.logicalDistinct), 0);

// ══════════════════════════════════════════════════════════════════════════
// THE TWO COST CONTRACTS — evaluated independently, both always reported.
// ══════════════════════════════════════════════════════════════════════════
contract('CONTROL_HUB_TOP_BUTTON_LAYOUT_MUST_COLLECT_SIDEBAR_CANDIDATES_AT_MOST_ONCE_PER_RAF', () => {
  eq(target.m.rafScheduled, 1, 'exactly one animation frame was scheduled');
  eq(target.m.rafExecuted, 1, 'exactly one animation frame callback ran');
  eq(target.m.layoutTopButtonCalls, 1, 'the frame laid the top button out once');
  atMost(target.m.collectPasses, 1,
    'one scheduled layout frame must run at most one CHUB_collectSidebarCandidates pass');
});

contract('CONTROL_HUB_SIDEBAR_HIT_TEST_MUST_CALL_ELEMENT_FROM_POINT_AT_MOST_ONCE_PER_DISTINCT_COORDINATE_PER_PASS', () => {
  atLeast(targetPasses.length, 1, 'at least one collection pass was measured');
  // Version-agnostic non-vacuity: the SCENE must contain a real de-duplication
  // opportunity. That is a property of the fixture's LOGICAL probe requests and
  // holds whether or not the module collapses them before the DOM boundary. A
  // corrected module is required to drive the REAL repeat count to zero, so
  // asserting on real repeats here would make the contract unsatisfiable.
  ok(targetPasses.some((q) => q.logicalRaw > q.logicalDistinct),
    `the overlapping fixture must logically request duplicate coordinates (raw ${targetPasses.map((q) => q.logicalRaw).join('/')} vs distinct ${targetPasses.map((q) => q.logicalDistinct).join('/')})`);
  for (const [i, q] of targetPasses.entries()) {
    atMost(q.real, q.logicalDistinct,
      `pass ${i + 1}: elementFromPoint must run at most once per distinct (x,y) (real ${q.real}, distinct logical ${q.logicalDistinct}, raw requests ${q.logicalRaw})`);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// INTEGRITY / MUTATION CONTROLS — the harness must separate the two defects,
// and low call counts alone must never produce PASS.
// ══════════════════════════════════════════════════════════════════════════
const contract1Red = (r) => r.m.collectPasses > 1;
const contract2Red = (r) => r.m.passes.some((q) => q.real > q.logicalDistinct);
const requestsDuplicates = (r) => r.m.passes.some((q) => q.logicalRaw > q.logicalDistinct);
const MATRIX = [];
const record = (id, r, notes) => MATRIX.push({
  id, passes: r.m.collectPasses,
  real: r.m.passes.reduce((a, q) => a + q.real, 0),
  raw: r.m.passes.reduce((a, q) => a + q.logicalRaw, 0),
  distinct: r.m.passes.reduce((a, q) => a + q.logicalDistinct, 0),
  c1: contract1Red(r) ? 'RED' : 'GREEN', c2: contract2Red(r) ? 'RED' : 'GREEN',
  edge: r.edge(), notes,
});

mutation('A. injected duplicate collection + guaranteed coordinate reuse -> C1 RED, C2 GREEN', () => {
  const r = oneFrame(PRIMARY, 'injectDup');
  record('A injectDup', r, 'observer forced to re-collect; probe reuse guaranteed');
  atLeast(r.m.collectPasses, 2, 'the injection really forces a second collection pass');
  eq(contract1Red(r), true, 'contract 1 detects the injected duplicate collection');
  eq(contract2Red(r), false, 'contract 2 stays GREEN under guaranteed coordinate reuse');
  eq(r.edge(), 50, 'semantic output unaffected by the injection');
});

mutation('B. injected coordinate-memo bypass + guaranteed single collection -> C1 GREEN, C2 RED', () => {
  const r = oneFrame(PRIMARY, 'injectRepeat');
  record('B injectRepeat', r, 'same-pass reuse neutralised; one collection guaranteed');
  eq(r.m.collectPasses, 1, 'exactly one collection pass');
  eq(contract1Red(r), false, 'contract 1 GREEN');
  eq(contract2Red(r), true, 'contract 2 detects the injected repeated probing');
  ok(r.m.passes.every((q) => q.real === q.logicalRaw),
    'the bypass really removed same-pass reuse (every logical request reached the DOM)');
  eq(r.edge(), 50, 'semantic output unaffected by the injection');
});

mutation('C. no injection -> semantics correct, fixture non-vacuous, counters consistent', () => {
  const r = oneFrame(PRIMARY, 'natural');
  record('C natural', r, 'module under test, no injection');
  eq(r.edge(), 50, 'edge oracle');
  eq(r.targets(), ['sidebar-wrap', 'sidebar-inner'], 'observer target oracle');
  ok(requestsDuplicates(r), 'the scene logically requests duplicate coordinates in either version');
  for (const q of r.m.passes) {
    atMost(q.real, q.logicalRaw, 'real calls can never exceed logical requests');
    atMost(q.logicalDistinct, q.logicalRaw, 'distinct can never exceed raw requests');
  }
});

mutation('D. both defects injected -> C1 RED and C2 RED, semantics intact', () => {
  const r = oneFrame(PRIMARY, 'injectBoth');
  record('D injectBoth', r, 'both defects injected simultaneously');
  eq(contract1Red(r), true, 'contract 1 RED');
  eq(contract2Red(r), true, 'contract 2 RED');
  eq(r.edge(), 50, 'semantic output unaffected by the injections');
});

mutation('E. injected stale cross-frame reuse -> invalidation control RED', () => {
  // Occlusion changes while the candidate's own rect does not, so the ONLY way
  // to get the right answer is to re-probe. Pass-scoped reuse must see the
  // change; cross-frame reuse must not, which is exactly why it is rejected.
  const occludeFully = (sc) => { sc.byId.get('main-overlay').__rect = { left: 0, top: 0, width: VW, height: VH }; };

  const fresh = runScene(S_COLLAPSED, 'guardBoth');
  fresh.frame();
  eq(fresh.edge(), 50, 'frame 1 correct with pass-scoped reuse');
  occludeFully(fresh.scene);
  fresh.frame();
  eq(fresh.edge(), 0, 'pass-scoped reuse re-probes and sees the new occlusion');

  const stale = runScene(S_COLLAPSED, 'stale');
  stale.frame();
  eq(stale.edge(), 50, 'frame 1 correct');
  occludeFully(stale.scene);
  stale.frame();
  ok(stale.edge() !== 0,
    `cross-frame reuse returns a stale edge (got ${stale.edge()}, correct is 0) and is therefore rejected`);
});

mutation('F. injected wrong selected edge with cheap counters -> semantic oracle RED', () => {
  // The occluded-shell scene is the sharpest case: the module under test pays a
  // full sweep, the degenerate implementation pays only the discovery probes.
  const p = oneFrame(S_OCCLUDED, 'natural');
  const r = oneFrame(S_OCCLUDED, 'wrongEdge');
  ok(r.m.efpReal * 4 < p.m.efpReal, `counters are dramatically cheaper (${r.m.efpReal} vs ${p.m.efpReal})`);
  eq(p.edge(), 50, 'the module under test satisfies the oracle');
  ok(r.edge() !== 50, `but the degenerate edge oracle rejects it (got ${r.edge()})`);
});

mutation('G. injected truncated observer target set -> semantic oracle RED', () => {
  const p = oneFrame(S_OVERLAP, 'natural');
  const r = oneFrame(S_OVERLAP, 'wrongTargets');
  ok(p.targets().length > r.targets().length,
    `truncated target set detected (${p.targets().length} -> ${r.targets().length})`);
});

mutation('H. cost counters alone cannot produce PASS', () => {
  const cheapButWrong = oneFrame(S_OCCLUDED, 'wrongEdge');
  eq(contract1Red(cheapButWrong) && contract2Red(cheapButWrong), false,
    'a degenerate implementation can satisfy a cost counter');
  ok(cheapButWrong.edge() !== 50, 'yet it is still rejected by the semantic oracle');
});

// ══════════════════════════════════════════════════════════════════════════
// Listener / observer lifecycle surface (reported, not gated)
// ══════════════════════════════════════════════════════════════════════════
const lifecycle = (() => {
  const r = runScene(S_COLLAPSED, 'natural');
  r.api.bindOnce();
  r.scene.flushRaf();
  r.frame();
  return {
    windowListeners: r.m.windowListeners,
    documentListeners: r.m.documentListeners,
    settleTimers: r.m.timeouts,
    roConstructed: r.m.roConstructed,
    roObserve: r.m.roObserve,
    roDisconnect: r.m.roDisconnect,
    styleWrites: r.m.styleWrites,
    modeWrites: r.m.modeWrites,
  };
})();

// ══════════════════════════════════════════════════════════════════════════
// REPORT
// ══════════════════════════════════════════════════════════════════════════
const failedSemantic = semantic.filter((f) => !f.ok);
const failedInvalidation = invalidation.filter((f) => !f.ok);
const failedIntegrity = integrity.filter((f) => !f.ok);
const failedContracts = contracts.filter((c) => !c.ok);

console.log('Control Hub sidebar hit-test pass cost (0Z1a) — Gate B');
console.log('');
console.log(`Module under test: ${HUB_PATH}`);
console.log(`Optional helpers loaded from source: ${LOADED_OPTIONAL.length ? LOADED_OPTIONAL.join(', ') : '(none — pristine)'}`);
console.log('');
console.log('Target measurement (primary scene: two nested wrappers sharing one coordinate grid):');
console.log(`  animation frames scheduled                = ${target.m.rafScheduled}`);
console.log(`  animation frames executed                 = ${target.m.rafExecuted}`);
console.log(`  CHUB_layoutTopButton calls                = ${target.m.layoutTopButtonCalls}`);
console.log(`  CHUB_collectSidebarCandidates passes      = ${target.m.collectPasses}   (contract 1: <= 1)`);
for (const [i, q] of targetPasses.entries()) {
  console.log(`    pass ${i + 1}: raw logical requests ${q.logicalRaw}, distinct logical (x,y) ${q.logicalDistinct}, REAL elementFromPoint ${q.real}, repeated real ${q.real - q.logicalDistinct}`);
}
console.log(`  raw logical probe requests (frame total)  = ${targetTotals.logicalRaw}`);
console.log(`  distinct logical coordinates (frame)      = ${targetTotals.logicalDistinct}`);
console.log(`  REAL elementFromPoint calls (frame total) = ${target.m.efpReal}`);
console.log(`  repeated REAL coordinate calls (worst)    = ${TARGET_REPEATED_REAL}   (contract 2: 0)`);
console.log(`  de-duplication opportunity in fixture     = ${targetTotals.logicalRaw > targetTotals.logicalDistinct ? 'yes' : 'NO (vacuous)'}`);
console.log(`  elementFromPoint outside any pass         = ${target.m.efpOutsidePass}`);
console.log(`  getBoundingClientRect calls               = ${target.m.gbcr}`);
console.log(`  getComputedStyle calls                    = ${target.m.gcs}`);
console.log(`  selected sidebar edge / source            = ${target.edge()} / ${target.source()}`);
console.log(`  observer targets                          = ${JSON.stringify(target.targets())}`);
console.log('');
console.log('Worst-case sweep scenes (module under test, single frame):');
for (const [name, spec] of [['occluded 260px shell', S_OCCLUDED], ['460px cap candidate', S_CAP]]) {
  const r = oneFrame(spec, 'natural');
  console.log(`  ${name.padEnd(22)} REAL elementFromPoint ${String(r.m.efpReal).padStart(5)} over ${r.m.collectPasses} pass(es), edge ${r.edge()}`);
}
console.log('');
console.log('Injected-defect matrix (harness injections, version-agnostic):');
console.log(`  ${'case'.padEnd(16)} ${'passes'.padStart(6)} ${'raw'.padStart(5)} ${'distinct'.padStart(8)} ${'real'.padStart(5)}  C1     C2     edge`);
for (const row of MATRIX) {
  console.log(`  ${row.id.padEnd(16)} ${String(row.passes).padStart(6)} ${String(row.raw).padStart(5)} ${String(row.distinct).padStart(8)} ${String(row.real).padStart(5)}  ${row.c1.padEnd(6)} ${row.c2.padEnd(6)} ${row.edge}`);
}
console.log('');
console.log('Lifecycle surface (reported, not gated):');
console.log(`  window listeners                          = ${JSON.stringify(lifecycle.windowListeners)}`);
console.log(`  document listeners                        = ${JSON.stringify(lifecycle.documentListeners)}`);
console.log(`  settle timers (ms)                        = ${JSON.stringify(lifecycle.settleTimers)}`);
console.log(`  ResizeObserver constructed / observe / disconnect = ${lifecycle.roConstructed} / ${lifecycle.roObserve} / ${lifecycle.roDisconnect}`);
console.log(`  top-button style writes / mode writes      = ${lifecycle.styleWrites} / ${lifecycle.modeWrites}`);
if (unsupported.size) console.log(`  selectors treated as no-match: ${[...unsupported].join(' | ')}`);
console.log('');
console.log('Cost contracts:');
for (const c of contracts) {
  console.log(`  ${c.ok ? 'GREEN' : 'RED  '}  ${c.id}`);
  if (!c.ok) console.log(`         ${String(c.error).split('\n')[0]}`);
}
console.log('');
const bucket = (label, list) => {
  const bad = list.filter((f) => !f.ok);
  console.log(`${label}: ${list.length - bad.length}/${list.length}`);
  for (const f of bad) console.log(`  FAIL ${f.name}\n       ${String(f.error).split('\n')[0]}`);
};
bucket('Semantic fixtures', semantic);
bucket('Invalidation controls', invalidation);
bucket('Integrity mutations', integrity);
console.log(`Assertions: ${assertions}`);
console.log('');
console.log(`RED_CONTRACT_FAILURE_COUNT: ${failedContracts.length}`);
console.log(`OTHER_FAILURE_COUNT: ${failedSemantic.length + failedInvalidation.length + failedIntegrity.length}`);

if (failedSemantic.length || failedInvalidation.length || failedIntegrity.length) {
  console.log('Control Hub sidebar hit-test pass cost: HARNESS OR SEMANTIC FAILURE');
  process.exit(2);
}
if (failedContracts.length) {
  console.log('Control Hub sidebar hit-test pass cost: RED (expected until 0Z1a is corrected)');
  process.exit(1);
}
console.log('Control Hub sidebar hit-test pass cost passed');
