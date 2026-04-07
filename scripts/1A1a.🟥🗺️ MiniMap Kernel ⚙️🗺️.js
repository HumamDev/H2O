// ==UserScript==
// @h2o-id             1a1a.minimap.kernel
// @name               1A1a.🟥🗺️ MiniMap Kernel ⚙️🗺️
// @namespace          H2O.Premium.CGX.minimap.kernel
// @author             HumamDev
// @version            12.7.0
// @revision           001
// @build              260304-102754
// @description        MiniMap Kernel: lifecycle + shared bridge + foundation ownership (Phase 1B)
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none

// ==/UserScript==

/* Smoke Test Checklist
 * - Main only installed -> should work
 * - Kernel + Main installed -> should work
 * - Kernel only installed -> should not crash; should publish SHARED cleanly
 */

(() => {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const R = window;
  const TOPW = W.top || W;

  const TOK = 'MM';
  const BrID = 'mnmp';
  const KERNEL_VER = '12.7.0';

  const H2O = (W.H2O = W.H2O || {});
  H2O[TOK] = H2O[TOK] || Object.create(null);

  const VAULT = (H2O[TOK][BrID] = H2O[TOK][BrID] || {
    diag: Object.create(null),
    state: Object.create(null),
    api: Object.create(null)
  });
  const CORE_STUB = Object.freeze({
    ver: 'kernel-core-stub',
    rebuildNow: (reason = 'kernel:core-stub') => ({
      ok: false,
      status: 'not-ready',
      reason: String(reason || 'kernel:core-stub'),
      built: { ui: false, turns: 0, buttons: false },
      retry: { scheduled: false, count: 0, kind: 'stub' },
    }),
    scheduleRebuild: () => true,
    getTurns: () => [],
    getTurnIndex: () => 0,
    refreshTurnsCache: () => [],
    findMiniBtn: () => null,
    setActive: () => false,
    centerOn: () => false,
    updateCounter: () => false,
    updateToggleColor: () => false,
    syncActiveFromViewport: () => false,
  });
  VAULT.api = VAULT.api || Object.create(null);
  VAULT.api.core = VAULT.api.core || CORE_STUB;
  VAULT.api.rt = VAULT.api.rt || null;
  VAULT.api.ui = VAULT.api.ui || null;
  VAULT.api.mm = VAULT.api.mm || Object.create(null);
  VAULT.api.mm.impl = VAULT.api.mm.impl || Object.create(null);
  VAULT.state.kernelCleanup = VAULT.state.kernelCleanup || cleanupMake();

  H2O.KEYS = H2O.KEYS || {};
  H2O.EV = H2O.EV || {};
  H2O.SEL = H2O.SEL || {};
  H2O.UI = H2O.UI || {};

  function warn(msg, extra) { try { console.warn('[MiniMap Kernel]', msg, extra || ''); } catch {} }
  function err(msg, extra) { try { console.error('[MiniMap Kernel]', msg, extra || ''); } catch {} }

  function registryKeepFirst(reg, defs, regName) {
    if (!reg || !defs) return;
    Object.keys(defs).forEach((k) => {
      if (!(k in reg)) {
        reg[k] = defs[k];
        return;
      }
      if (reg[k] !== defs[k]) {
        try { console.warn('[MiniMap Kernel] registry collision keep-first', regName, k); } catch {}
      }
    });
  }

  const storage = {
    getStr(key, fallback = null) {
      try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
    },
    setStr(key, val) {
      try { localStorage.setItem(key, String(val)); return true; } catch { return false; }
    },
    del(key) {
      try { localStorage.removeItem(key); return true; } catch { return false; }
    },
    getJSON(key, fallback = null) {
      const s = this.getStr(key, null);
      if (s == null) return fallback;
      try { return JSON.parse(s); } catch { return fallback; }
    },
    setJSON(key, obj) {
      try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch { return false; }
    }
  };

  const dom = {
    q(sel, root = document) { try { return root.querySelector(sel); } catch { return null; } },
    qq(sel, root = document) { try { return Array.from(root.querySelectorAll(sel)); } catch { return []; } }
  };

  const evt = {
    on(target, type, fn, opts) {
      if (!target || typeof target.addEventListener !== 'function' || typeof fn !== 'function') return () => {};
      try { target.addEventListener(type, fn, opts); } catch {}
      return () => { try { target.removeEventListener(type, fn, opts); } catch {} };
    },
    off(target, type, fn, opts) {
      try { target?.removeEventListener?.(type, fn, opts); } catch {}
    },
    dispatchSafe(target, type, detail = undefined) {
      try {
        target?.dispatchEvent?.(new CustomEvent(type, { detail }));
        return true;
      } catch {
        return false;
      }
    },
  };

  function on(target, type, fn, opts, cleanup) {
    if (!target || typeof target.addEventListener !== 'function' || typeof fn !== 'function') return () => {};
    try { target.addEventListener(type, fn, opts); } catch {}
    const off = () => { try { target.removeEventListener(type, fn, opts); } catch {} };
    try { cleanup?.add?.(off); } catch {}
    return off;
  }

  function observe(mo, node, opts, cleanup) {
    if (!mo || !node || typeof mo.observe !== 'function') return false;
    try { mo.observe(node, opts); } catch { return false; }
    try { cleanup?.add?.(() => { try { mo.disconnect(); } catch {} }); } catch {}
    return true;
  }

  const ns = {
    disk(suite, host, dsid) { return `h2o:${suite}:${host}:${dsid}`; },
    ev(suite, host, dsid) { return `h2o.ev:${suite}:${host}:${dsid}`; },
    build({ suite, host, dsid }) {
      return { NS_DISK: this.disk(suite, host, dsid), NS_EV: this.ev(suite, host, dsid) };
    }
  };
  const EV_MM_BEHAVIOR_CHANGED = 'evt:h2o:mm:behavior-changed';
  const KEY_BEHAVIOR_MAP_SUFFIX = 'ui:behavior-map:v1';
  const BEHAVIOR_DEFAULTS = Object.freeze({
    turn: Object.freeze({
      click: Object.freeze({ kind: 'answer' }),
      dblclick: Object.freeze({ kind: 'question' }),
      mid: Object.freeze({ kind: 'palette' }),
      dmid: Object.freeze({ kind: 'titles' }),
    }),
    toggle: Object.freeze({
      click: Object.freeze({ kind: 'hideMap' }),
      dblclick: Object.freeze({ kind: 'quick' }),
      mid: Object.freeze({ kind: 'quick' }),
    }),
    dial: Object.freeze({
      click: Object.freeze({ kind: 'adjust' }),
      dblclick: Object.freeze({ kind: 'quick' }),
      mid: Object.freeze({ kind: 'export' }),
    }),
    customFallback: Object.freeze({ kind: 'quick' }),
  });
  const BEHAVIOR_ALLOWED = Object.freeze({
    turn: Object.freeze({
      click: Object.freeze(['answer', 'question', 'none', 'blocked', 'auto', 'custom']),
      dblclick: Object.freeze(['question', 'answer', 'none', 'blocked', 'auto', 'custom']),
      mid: Object.freeze(['palette', 'titles', 'none', 'blocked', 'auto', 'custom']),
      dmid: Object.freeze(['palette', 'titles', 'none', 'blocked', 'auto', 'custom']),
    }),
    toggle: Object.freeze({
      click: Object.freeze(['hideMap', 'none', 'blocked', 'auto', 'custom']),
      dblclick: Object.freeze(['quick', 'export', 'none', 'blocked', 'auto', 'custom']),
      mid: Object.freeze(['quick', 'export', 'none', 'blocked', 'auto', 'custom']),
    }),
    dial: Object.freeze({
      click: Object.freeze(['adjust', 'none', 'blocked', 'auto', 'custom']),
      dblclick: Object.freeze(['quick', 'export', 'none', 'blocked', 'auto', 'custom']),
      mid: Object.freeze(['quick', 'export', 'none', 'blocked', 'auto', 'custom']),
    }),
  });
  const behaviorState = {
    loaded: false,
    map: null,
    warned: new Set(),
  };

  function behaviorDiagOn() {
    try {
      return storage.getStr('H2O:diag:minimap') === '1' || W.H2O_DIAG === true;
    } catch {
      return false;
    }
  }

  function behaviorWarnOnce(code, msg, extra) {
    const key = String(code || 'warn');
    if (behaviorState.warned.has(key)) return;
    behaviorState.warned.add(key);
    if (!behaviorDiagOn()) return;
    try { console.warn('[MiniMap Behavior]', msg, extra || ''); } catch {}
  }

  function behaviorIsPlainObject(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    const proto = Object.getPrototypeOf(v);
    return proto === Object.prototype || proto === null;
  }

  function behaviorClone(v, fallback = null) {
    try {
      return JSON.parse(JSON.stringify(v));
    } catch {
      return fallback;
    }
  }

  function behaviorDefaultMap() {
    return behaviorClone(BEHAVIOR_DEFAULTS, {
      turn: { click: { kind: 'answer' }, dblclick: { kind: 'question' }, mid: { kind: 'palette' }, dmid: { kind: 'titles' } },
      toggle: { click: { kind: 'hideMap' }, dblclick: { kind: 'quick' }, mid: { kind: 'quick' } },
      dial: { click: { kind: 'adjust' }, dblclick: { kind: 'quick' }, mid: { kind: 'export' } },
      customFallback: { kind: 'quick' },
    });
  }

  function behaviorSanitizeFallback(entry) {
    const next = behaviorIsPlainObject(entry) ? entry : {};
    const kind = String(next.kind || '').trim();
    if (kind === 'none' || kind === 'quick') return { kind };
    return { kind: String(BEHAVIOR_DEFAULTS.customFallback.kind) };
  }

  function behaviorNormalizeGesture(surface, gesture) {
    const sf = String(surface || '').trim();
    const key = String(gesture || '').trim();
    if (!sf || !key) return '';
    const m = key.match(/^([a-z]+)(Shift|Alt|Meta)?$/);
    if (!m) return '';
    const base = String(m[1] || '').trim();
    if (!base) return '';
    const allowed = BEHAVIOR_ALLOWED?.[sf];
    if (!allowed || !Object.prototype.hasOwnProperty.call(allowed, base)) return '';
    const suffix = String(m[2] || '');
    return `${base}${suffix}`;
  }

  function behaviorSanitizeBinding(candidate, allowedKinds, fallbackBinding, ctx = {}) {
    const fb = behaviorIsPlainObject(fallbackBinding) ? fallbackBinding : { kind: 'none' };
    if (!behaviorIsPlainObject(candidate)) return behaviorClone(fb, { kind: String(fb.kind || 'none') });

    const rawKind = String(candidate.kind || '').trim();
    if (!rawKind || !Array.isArray(allowedKinds) || !allowedKinds.includes(rawKind)) {
      if (rawKind && rawKind !== String(fb.kind || 'none')) {
        behaviorWarnOnce(`kind:${ctx.surface}:${ctx.gesture}:${rawKind}`, 'Unknown behavior kind; fallback to none.', { ctx, rawKind });
      }
      return { kind: 'none' };
    }

    if (rawKind !== 'custom') return { kind: rawKind };

    const id = String(candidate.id || '').trim();
    if (!id) {
      behaviorWarnOnce(`custom-id:${ctx.surface}:${ctx.gesture}`, 'Custom behavior missing id; fallback to none.', { ctx });
      return { kind: 'none' };
    }
    const out = { kind: 'custom', id };
    if (Object.prototype.hasOwnProperty.call(candidate, 'payload')) {
      if (behaviorIsPlainObject(candidate.payload)) out.payload = behaviorClone(candidate.payload, {});
      else {
        behaviorWarnOnce(`custom-payload:${ctx.surface}:${ctx.gesture}`, 'Custom behavior payload must be a plain object; dropped.', { ctx });
      }
    }
    return out;
  }

  function behaviorValidate(input, opts = {}) {
    const out = behaviorDefaultMap();
    const src = behaviorIsPlainObject(input) ? input : {};
    const customResolvers = behaviorIsPlainObject(opts.actionsCustom) ? opts.actionsCustom : null;

    for (const surface of Object.keys(BEHAVIOR_ALLOWED)) {
      const sIn = behaviorIsPlainObject(src[surface]) ? src[surface] : null;
      if (!sIn) continue;
      for (const key of Object.keys(sIn)) {
        const norm = behaviorNormalizeGesture(surface, key);
        if (!norm) continue;
        const base = norm.replace(/(Shift|Alt|Meta)$/, '');
        const allowed = BEHAVIOR_ALLOWED[surface][base] || [];
        const fb = out[surface][base] || { kind: 'none' };
        const safe = behaviorSanitizeBinding(sIn[key], allowed, fb, { surface, gesture: norm });
        if (safe.kind === 'custom' && customResolvers && typeof customResolvers[safe.id] !== 'function') {
          const fallback = behaviorSanitizeFallback(src.customFallback);
          behaviorWarnOnce(`custom-unknown:${surface}:${norm}:${safe.id}`, 'Unknown custom action id; fallback applied.', { surface, gesture: norm, id: safe.id });
          out[surface][norm] = (fallback.kind === 'none') ? { kind: 'none' } : { kind: fallback.kind };
          continue;
        }
        out[surface][norm] = safe;
      }
    }

    out.customFallback = behaviorSanitizeFallback(src.customFallback);
    return out;
  }

  function behaviorKey() {
    return `${ns.disk('prm', 'cgx', 'mnmp')}:${KEY_BEHAVIOR_MAP_SUFFIX}`;
  }

  function behaviorGet(force = false) {
    if (behaviorState.loaded && !force) return behaviorClone(behaviorState.map, behaviorDefaultMap());
    const key = behaviorKey();
    const raw = storage.getJSON(key, null);
    const safe = behaviorValidate(raw);
    behaviorState.map = safe;
    behaviorState.loaded = true;
    return behaviorClone(safe, behaviorDefaultMap());
  }

  function behaviorSet(next, reason = '') {
    const safe = behaviorValidate(next);
    behaviorState.map = safe;
    behaviorState.loaded = true;
    const key = behaviorKey();
    storage.setJSON(key, safe);
    if (reason && behaviorDiagOn()) {
      try { console.log('[MiniMap Behavior] set', reason, safe); } catch {}
    }
    return behaviorClone(safe, behaviorDefaultMap());
  }

  function behaviorResolveBinding(surface, gesture, ev = null, map = null) {
    const sf = String(surface || '').trim();
    const base = behaviorNormalizeGesture(sf, gesture).replace(/(Shift|Alt|Meta)$/, '');
    if (!sf || !base) return { kind: 'none' };

    const source = behaviorIsPlainObject(map) ? map : behaviorGet(false);
    const s = behaviorIsPlainObject(source?.[sf]) ? source[sf] : {};
    const pick = (k) => behaviorIsPlainObject(s[k]) ? s[k] : null;

    const mods = [
      [ev?.shiftKey === true, `${base}Shift`],
      [ev?.altKey === true, `${base}Alt`],
      [ev?.metaKey === true, `${base}Meta`],
    ];
    for (const [on, mk] of mods) {
      if (!on) continue;
      const over = pick(mk);
      if (over) return behaviorClone(over, { kind: 'none' });
    }
    const direct = pick(base);
    if (direct) return behaviorClone(direct, { kind: 'none' });
    const fb = BEHAVIOR_DEFAULTS?.[sf]?.[base] || { kind: 'none' };
    return behaviorClone(fb, { kind: 'none' });
  }

  const behavior = {
    keySuffix: KEY_BEHAVIOR_MAP_SUFFIX,
    eventName: EV_MM_BEHAVIOR_CHANGED,
    defaults: () => behaviorDefaultMap(),
    validate: (obj, opts = {}) => behaviorValidate(obj, opts),
    key: () => behaviorKey(),
    get: (force = false) => behaviorGet(!!force),
    set: (next, reason = '') => behaviorSet(next, reason),
    getBinding: (surface, gesture, ev = null, map = null) => behaviorResolveBinding(surface, gesture, ev, map),
    normalizeGesture: (surface, gesture) => behaviorNormalizeGesture(surface, gesture),
    warnOnce: (code, msg, extra) => behaviorWarnOnce(code, msg, extra),
    isDiagOn: () => behaviorDiagOn(),
  };

  function stampMeta(args = {}) {
    const state = args.state || VAULT.state || Object.create(null);
    state.meta = state.meta || {
      TOK: args.TOK || 'MM',
      PID: args.PID || 'mnmp',
      CID: args.CID || 'MMAP',
      SkID: args.SkID || 'mnmp',
      BrID: args.BrID || 'mnmp',
      DsID: args.DsID || 'mnmp',
      MODTAG: args.MODTAG || 'MMap',
      MODICON: args.MODICON || '🗺️',
      EMOJI_HDR: args.EMOJI_HDR || '🟥',
      SUITE: args.SUITE || 'prm',
      HOST: args.HOST || 'cgx'
    };
    return state.meta;
  }

  function cleanupMake() {
    const fns = [];
    return {
      add(fn) { if (typeof fn === 'function') fns.push(fn); return fn; },
      run() { while (fns.length) { try { fns.pop()(); } catch {} }
      }
    };
  }

  function getAny(key, fallback) { return (R?.[key] ?? W?.[key] ?? fallback); }

  function ensureMMNamespace() {
    try {
      R.H2O = R.H2O || {};
      R.H2O.MM = R.H2O.MM || {};
      if (W && W !== R) {
        W.H2O = W.H2O || {};
        W.H2O.MM = W.H2O.MM || {};
      }
    } catch {}
  }

  function setMM(key, value) {
    try {
      R.H2O = R.H2O || {};
      R.H2O.MM = R.H2O.MM || {};
      R.H2O.MM[key] = value;
    } catch {}
    try {
      if (W && W !== R) {
        W.H2O = W.H2O || {};
        W.H2O.MM = W.H2O.MM || {};
        W.H2O.MM[key] = value;
      }
    } catch {}
    return value;
  }

  function mmHasExternalDotsOwner() {
    return !!TOPW.H2O_MM_DOTS_PLUGIN || !!(W.H2O && W.H2O.MM && W.H2O.MM.dots);
  }

  function mmDotsEnabled() {
    return !mmHasExternalDotsOwner();
  }

  function mmHasExternalWashOwner() {
    return !!TOPW.H2O_MM_WASH_PLUGIN || !!(W.H2O && W.H2O.MM && W.H2O.MM.wash);
  }

  function mmWashAPI() {
    return (W.H2O && W.H2O.MM && W.H2O.MM.wash) || null;
  }

  function mmApplyWashToBtn(primaryAId, btnEl, fallbackApplyFn) {
    const api = mmWashAPI();
    if (api && typeof api.applyToMiniBtn === 'function') {
      try { api.applyToMiniBtn(primaryAId, btnEl); return true; } catch {}
    }
    try {
      if (typeof fallbackApplyFn === 'function') return fallbackApplyFn(primaryAId, btnEl) !== false;
    } catch {}
    return false;
  }

  function mmOpenWashPalette(ev, primaryAId) {
    const api = mmWashAPI();
    if (api && typeof api.openPalette === 'function') {
      try { api.openPalette(ev, primaryAId); return true; } catch {}
    }
    return false;
  }
  function mmShellPluginPresent() {
    return TOPW.H2O_MM_UI_SHELL_PLUGIN === true;
  }
  function mmShellReady() {
    return TOPW.H2O_MM_UI_SHELL_READY === true;
  }
  function mmUIOwner() {
    return mmShellReady() ? 'shell' : 'main';
  }
  function mmEnginePluginPresent() {
    return TOPW.H2O_MM_ENGINE_PLUGIN === true;
  }
  function mmShared() {
    try { return TOPW.H2O_MM_SHARED?.get?.() || null; } catch { return null; }
  }
  function mmApi(key) {
    const k = String(key || '').trim();
    if (!k) return null;
    if (k === 'core') return mmCore();
    if (k === 'ui') return mmUi();
    if (k === 'rt') return mmRt();
    const sh = mmShared();
    const viaShared = sh?.api?.[k];
    if (viaShared && typeof viaShared === 'object') return viaShared;
    return null;
  }
  function mmCore() {
    const viaVault = VAULT?.api?.core;
    if (viaVault && typeof viaVault === 'object') return viaVault;
    const viaGlobal = TOPW.H2O_MM_SHARED_CORE;
    if (viaGlobal && typeof viaGlobal === 'object') return viaGlobal;
    const viaShared = SHARED?.api?.core;
    if (viaShared && typeof viaShared === 'object') return viaShared;
    return CORE_STUB;
  }
  function mmUi() {
    const viaVault = VAULT?.api?.ui;
    if (viaVault && typeof viaVault === 'object') return viaVault;
    const viaGlobal = TOPW.H2O_MM_SHARED_UI;
    if (viaGlobal && typeof viaGlobal === 'object') return viaGlobal;
    const viaShared = SHARED?.api?.ui;
    if (viaShared && typeof viaShared === 'object') return viaShared;
    return null;
  }
  function mmRt() {
    const viaVault = VAULT?.api?.rt;
    if (viaVault && typeof viaVault === 'object') return viaVault;
    const viaGlobal = TOPW.H2O_MM_SHARED_RT;
    if (viaGlobal && typeof viaGlobal === 'object') return viaGlobal;
    const viaShared = SHARED?.api?.rt;
    if (viaShared && typeof viaShared === 'object') return viaShared;
    return null;
  }
  function mmUiRefs() {
    try { return mmUi()?.getRefs?.() || {}; } catch { return {}; }
  }
  function mmDiagSurface() {
    const viaApi = mmApi('diag');
    if (viaApi && typeof viaApi === 'object') return viaApi;
    const sh = mmShared();
    return (sh?.diag && typeof sh.diag === 'object') ? sh.diag : null;
  }
  function mmEngineReady() {
    return TOPW.H2O_MM_ENGINE_READY === true && !!TOPW.H2O_MM_SHARED_RT;
  }

  function migrateLegacyIfNeeded(opts = {}) {
    const dotDefault = Array.isArray(opts.dotDefault) && opts.dotDefault.length
      ? opts.dotDefault.slice()
      : ['blue', 'red', 'green', 'gold', 'sky', 'pink', 'purple', 'orange'];
    const doSetTitleNoop = opts.setTitleNoop !== false;

    try {
      ensureMMNamespace();
      if (!Array.isArray(R.H2O?.MM?.DOT_ORDER) && Array.isArray(R.DOT_ORDER)) {
        R.H2O.MM.DOT_ORDER = R.DOT_ORDER.slice();
      }
      if (!Array.isArray(R.H2O?.MM?.DOT_COLOR_ORDER) && Array.isArray(R.DOT_COLOR_ORDER)) {
        R.H2O.MM.DOT_COLOR_ORDER = R.DOT_COLOR_ORDER.slice();
      }
      try { delete R.DOT_ORDER; } catch { R.DOT_ORDER = undefined; }
      try { delete R.DOT_COLOR_ORDER; } catch { R.DOT_COLOR_ORDER = undefined; }
    } catch {}

    const dots = Array.isArray(R.H2O?.MM?.DOT_ORDER) ? R.H2O.MM.DOT_ORDER : dotDefault;
    setMM('DOT_ORDER', dots);
    setMM('DOT_COLOR_ORDER', Array.isArray(R.H2O?.MM?.DOT_COLOR_ORDER) ? R.H2O.MM.DOT_COLOR_ORDER : dots);

    if (doSetTitleNoop && typeof getAny('setTitleOnMiniMap') !== 'function') {
      const noop = function setTitleOnMiniMap(){};
      try { R.setTitleOnMiniMap = noop; } catch {}
      try { W.setTitleOnMiniMap = noop; } catch {}
    }

    return {
      DOT_ORDER: (R.H2O && R.H2O.MM && R.H2O.MM.DOT_ORDER) || dotDefault,
      DOT_COLOR_ORDER: (R.H2O && R.H2O.MM && R.H2O.MM.DOT_COLOR_ORDER) || dotDefault
    };
  }

  function ensureDiag(opts = {}) {
    const name = String(opts.name || 'H2O MiniMap');
    const diagKey = String(opts.diagKey || 'H2O:diag:minimap');

    const prev =
      (W.H2O_MM_DIAG && typeof W.H2O_MM_DIAG === 'object') ? W.H2O_MM_DIAG :
      (VAULT.diag && typeof VAULT.diag === 'object') ? VAULT.diag :
      null;

    VAULT.diag = prev || {
      name,
      bootId: Math.random().toString(36).slice(2),
      t0: performance.now(),
      steps: [],
      errors: [],
      bufMax: 160,
      errMax: 30
    };

    const DIAG = VAULT.diag;
    DIAG.steps = Array.isArray(DIAG.steps) ? DIAG.steps : [];
    DIAG.errors = Array.isArray(DIAG.errors) ? DIAG.errors : [];
    DIAG.bufMax = Number.isFinite(DIAG.bufMax) ? DIAG.bufMax : 160;
    DIAG.errMax = Number.isFinite(DIAG.errMax) ? DIAG.errMax : 30;
    DIAG.t0 = Number.isFinite(DIAG.t0) ? DIAG.t0 : performance.now();
    DIAG.name = DIAG.name || name;

    const isOn = () => storage.getStr(diagKey) === '1' || W.H2O_DIAG === true;

    if (typeof DIAG.log !== 'function') {
      DIAG.log = function log(step, data) {
        const entry = { t: Math.round(performance.now() - this.t0), step, data: data ?? null };
        this.steps.push(entry);
        if (this.steps.length > this.bufMax) this.steps.shift();
        if (!isOn()) return;
        console.log('[H2O MiniMap]', step, data ?? '');
      };
    }

    if (typeof DIAG.err !== 'function') {
      DIAG.err = function diagErr(errObj, where) {
        const e = {
          t: Math.round(performance.now() - this.t0),
          where: where || 'unknown',
          msg: String(errObj?.message || errObj),
          stack: String(errObj?.stack || '')
        };
        this.errors.push(e);
        if (this.errors.length > (this.errMax || 30)) this.errors.shift();
        if (!isOn()) return;
        console.error('[H2O MiniMap]', e.where, e.msg, e.stack);
      };
    }

    if (typeof DIAG.dump !== 'function') {
      DIAG.dump = function dump() {
        const out = {
          bootId: this.bootId,
          ready: !!W.H2O_MINIMAP_READY,
          phase: W.H2O_MINIMAP_PHASE,
          steps: this.steps,
          errors: this.errors
        };
        console.log('[H2O_MM_DIAG dump]', out);
        return out;
      };
    }

    try { W.H2O_MM_DIAG = DIAG; } catch {}
    return DIAG;
  }

  const guard = {
    minimapInitGuard(args = {}) {
      const _W = args.W || W;
      const KEY_ = args.KEY_ || {};
      const SEL_ = args.SEL_ || {};
      const q = (typeof args.q === 'function') ? args.q : (sel) => dom.q(sel);
      const diagLog = (typeof args.diagLog === 'function') ? args.diagLog : () => {};

      const initKey = KEY_.INIT_GUARD;
      const legacyKey = '_' + '_H2O_MINIMAP_v10';
      const already = !!_W[initKey] || !!_W[legacyKey];
      const panel = q(SEL_.PANEL);
      const hasUI = !!panel;
      const hasBtns = !!panel?.querySelector?.(SEL_.MM_BTN);

      try { diagLog('initKey:check', { already, hasUI, hasBtns }); } catch {}

      if (already && hasUI && hasBtns) return false;
      if (already && (!hasUI || !hasBtns)) {
        try { diagLog('initKey:stale->reinit'); } catch {}
        try { delete _W[initKey]; } catch {}
        try { panel?.remove?.(); } catch {}
      }

      _W[initKey] = true;
      _W.H2O_MINIMAP_READY = false;
      _W.H2O_MINIMAP_PHASE = 'boot';
      return true;
    },
    ensureInitGuard(args = {}) { return this.minimapInitGuard(args); },
  };

  function diagEnsureHooksBound(args = {}) {
    const W0 = args.W || W;
    const ev = args.EV_ || {};
    const DIAG = args.DIAG || ensureDiag({ name: 'H2O MiniMap', diagKey: args.diagKey || 'H2O:diag:minimap' });
    const utilOn = (typeof args.on === 'function') ? args.on : on;
    const stackFn = (typeof args.stack === 'function') ? args.stack : (() => '');
    const state = args.state || VAULT.state;
    if (state.didBindDiagHooks) return true;
    state.didBindDiagHooks = true;

    try {
      const onMiniMapReady = function onMiniMapReady() {
        try { DIAG.log?.(`event:${ev.MM_READY || 'evt:h2o:minimap:ready'}`, { stack: stackFn(10, onMiniMapReady) }); } catch {}
      };
      utilOn(W0, ev.MM_READY || 'evt:h2o:minimap:ready', onMiniMapReady, undefined, args.cleanup);
    } catch {}

    try {
      const onErr = (e) => { try { DIAG.err?.(e?.error || e?.message, 'window.error'); } catch {} };
      const onRej = (e) => { try { DIAG.err?.(e?.reason, 'unhandledrejection'); } catch {} };
      utilOn(W0, 'error', onErr, undefined, args.cleanup);
      utilOn(W0, 'unhandledrejection', onRej, undefined, args.cleanup);
    } catch {}

    return true;
  }

  function registerMainImpl(impl, meta = {}) {
    void impl;
    void meta;
    // Legacy no-op: Main impl registry is retired; Kernel no longer depends on impl.main.
    return false;
  }

  function boot(ctx = {}) {
    void ctx;
    try {
      VAULT.state.kernelBooted = true;
      return !!TOPW.H2O_MM_SHARED;
    } catch (e) {
      err('Kernel boot failed.', e);
      return false;
    }
  }

  function dispose(ctx = {}) {
    void ctx;
    try {
      try { VAULT.state.kernelCleanup?.run?.(); } catch {}
      VAULT.state.kernelCleanup = cleanupMake();
      VAULT.state.kernelBooted = false;
      return true;
    } catch (e) {
      err('Kernel dispose failed.', e);
      return false;
    }
  }

  const SHARED = (TOPW.H2O_MM_SHARED = TOPW.H2O_MM_SHARED || Object.create(null));
  SHARED.ver = KERNEL_VER;
  SHARED.api = SHARED.api || Object.create(null);
  try {
    if (VAULT?.api && typeof VAULT.api === 'object') SHARED.api = VAULT.api;
  } catch {}
  SHARED.api.core = SHARED.api.core || CORE_STUB;
  SHARED.api.rt = SHARED.api.rt || null;
  SHARED.api.ui = SHARED.api.ui || null;
  SHARED.diag = SHARED.diag || { warn, err, ensure: ensureDiag, ensureHooksBound: diagEnsureHooksBound };
  SHARED.registerMainImpl = registerMainImpl;
  SHARED.boot = boot;
  SHARED.dispose = dispose;
  SHARED.get = function getSharedRefs() {
    const NS_DISK = ns.disk('prm', 'cgx', 'mnmp');
    const NS_EV = ns.ev('prm', 'cgx', 'mnmp');
    const apiRef =
      (VAULT?.api && typeof VAULT.api === 'object') ? VAULT.api :
      (SHARED?.api && typeof SHARED.api === 'object') ? SHARED.api :
      Object.create(null);
    const coreApi = (apiRef.core && typeof apiRef.core === 'object') ? apiRef.core : CORE_STUB;
    const uiApi =
      (apiRef.ui && typeof apiRef.ui === 'object') ? apiRef.ui :
      (TOPW.H2O_MM_SHARED_UI && typeof TOPW.H2O_MM_SHARED_UI === 'object') ? TOPW.H2O_MM_SHARED_UI :
      null;
    const rtApi =
      (apiRef.rt && typeof apiRef.rt === 'object') ? apiRef.rt :
      (TOPW.H2O_MM_SHARED_RT && typeof TOPW.H2O_MM_SHARED_RT === 'object') ? TOPW.H2O_MM_SHARED_RT :
      null;
    try {
      apiRef.core = coreApi;
      apiRef.ui = uiApi;
      apiRef.rt = rtApi;
    } catch {}
    const ensureStylePassthrough = (reason = '') => {
      try { return (uiApi || TOPW.H2O_MM_SHARED_UI)?.ensureStyle?.(reason); } catch { return null; }
    };
    return {
      ver: KERNEL_VER,
      realm: { W, R, TOPW },
      h2o: H2O,
      vault: VAULT,
      state: VAULT.state,
      api: apiRef,
      impl: (VAULT.api.mm && VAULT.api.mm.impl) ? VAULT.api.mm.impl : Object.create(null),
      registries: {
        KEYS: H2O.KEYS,
        EV: H2O.EV,
        SEL: H2O.SEL,
        UI: H2O.UI
      },
      KEY_: H2O.KEYS,
      EV_: H2O.EV,
      SEL_: H2O.SEL,
      UI_: H2O.UI,
      NS_DISK,
      NS_EV,
      CFG_: (VAULT.api.mm && VAULT.api.mm.cfg) || {},
      ui: {
        owner: mmUIOwner(),
        ensureStyle: ensureStylePassthrough,
        shell: {
          plugin: mmShellPluginPresent(),
          ready: mmShellReady(),
          ver: String(TOPW.H2O_MM_UI_SHELL_VER || '')
        },
        runtime: {
          owner: mmEngineReady() ? 'engine' : 'main',
          engine: {
            plugin: mmEnginePluginPresent(),
            ready: mmEngineReady(),
            ver: String(TOPW.H2O_MM_ENGINE_VER || '')
          }
        }
      },
      util: {
        dom,
        evt,
        on,
        observe,
        ns,
        stampMeta,
        storage,
        cleanupMake,
        realm: { getAny, setMM, ensureMMNamespace, getTop: () => TOPW },
        migrateLegacyIfNeeded,
        registryKeepFirst,
        ensureStyle: ensureStylePassthrough,
        mmHasExternalDotsOwner,
        mmDotsEnabled,
        mmHasExternalWashOwner,
        mmWashAPI,
        mmApplyWashToBtn,
        mmOpenWashPalette,
        mmShellPluginPresent,
        mmShellReady,
        mmUIOwner,
        mm: {
          sh: mmShared,
          api: mmApi,
          core: mmCore,
          ui: mmUi,
          rt: mmRt,
          uiRefs: mmUiRefs,
          diag: mmDiagSurface
        },
        diag: { ensure: ensureDiag, ensureHooksBound: diagEnsureHooksBound },
        guard,
        behavior
      }
    };
  };

  try {
    TOPW.H2O_MM_KERNEL_PLUGIN = true;
    TOPW.H2O_MM_KERNEL_VER = KERNEL_VER;
  } catch {}

  try { TOPW.H2O_MM_KERNEL_READY = true; } catch {}

  try {
    if (TOPW.H2O_MM_MAIN_PLUGIN === true && TOPW.H2O_MM_MAIN_READY !== true) {
      warn('Main plugin detected but not READY yet.');
    }
    if (mmShellPluginPresent() && !mmShellReady()) {
      warn('Shell plugin detected but not READY yet; waiting for UI owner readiness.');
    }
    if (mmEnginePluginPresent() && !mmEngineReady()) {
      warn('Engine plugin detected but not READY yet.');
    }
  } catch {}
})();
