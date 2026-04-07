// ==UserScript==
// @h2o-id             1b1a.minimap.quick.controls
// @name               1B1a.🟥🖲🗺️ Quick Controls (MiniMap 🔌 Plugin) 🗺️
// @namespace          H2O.Premium.CGX.minimap.quick.controls
// @author             HumamDev
// @version            1.1.21
// @revision           001
// @build              260320-160800
// @description        Modern Quick Controls Popover for MiniMap: middle-click toggle opens menu; nudge position (persisted + clamped) + size presets (S/M/L) + theme presets. UI-only plugin: writes CSS vars + disk prefs.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  // Realm-safe window (TM + top)
  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const TOPW = W.top || W;
  const H2O = (TOPW.H2O = TOPW.H2O || {});
  if (W !== TOPW) W.H2O = H2O;
  H2O.perf = H2O.perf || {};
  H2O.perf.modules = H2O.perf.modules || Object.create(null);
  const PERF_MODULE = (H2O.perf.modules.miniMapQuickControls && typeof H2O.perf.modules.miniMapQuickControls === 'object')
    ? H2O.perf.modules.miniMapQuickControls
    : (H2O.perf.modules.miniMapQuickControls = Object.create(null));
  const PERF = (() => {
    const existing = PERF_MODULE.__h2oPerfState;
    if (existing && typeof existing === 'object') return existing;
    const next = createMiniMapQuickControlsPerfState();
    try {
      Object.defineProperty(PERF_MODULE, '__h2oPerfState', {
        value: next,
        configurable: true,
        writable: true,
      });
    } catch {
      PERF_MODULE.__h2oPerfState = next;
    }
    return next;
  })();
  ensureMiniMapQuickControlsPerfStateShape(PERF);
  PERF_MODULE.getStats = getMiniMapQuickControlsPerfStats;
  PERF_MODULE.resetStats = () => {
    resetMiniMapQuickControlsPerfState(PERF);
    return getMiniMapQuickControlsPerfStats();
  };

  // Mark plugin
  const QUICK_VER = '1.1.21';
  const QUICK_POPO_LAYOUT = 'view-v2';
  const EV_QUICK_READY = 'evt:h2o:minimap:quick-ready';
  const EV_DIVIDER_CHANGED = 'evt:h2o:minimap:divider:changed';
  const EV_DIVIDER_SELECTED = 'evt:h2o:minimap:divider:selected';
  const QUICK_INSTANCE_ID = `mmqc:${QUICK_VER}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;

  try {
    TOPW.H2O_MM_QUICK_PLUGIN = true;
    TOPW.H2O_MM_QUICK_PLUGIN_VER = QUICK_VER;
    if (typeof TOPW.H2O_MM_QUICK_READY !== 'boolean') TOPW.H2O_MM_QUICK_READY = false;
  } catch {}

  // Kernel-authoritative bridge access (no fallbacks here; util.mm decides)
  const MM = () => (TOPW.H2O_MM_SHARED?.get?.() || null)?.util?.mm || null;
  const MM_coreApi = () => MM()?.core?.() || (TOPW.H2O_MM_SHARED?.get?.() || null)?.api?.core || TOPW?.H2O?.MM?.mnmp?.api?.core || null;
  const MM_ui = () => MM()?.ui?.() || null;
  const MM_uiRefs = () => MM()?.uiRefs?.() || (MM_ui()?.getRefs?.() || {});

  const SkID = 'mnmp';

  // ───────────────────────────── Config / Model ─────────────────────────────

  const quick = {
    actions: [
      { id: 'nudge_left',  icon: '←', section: 'position', step: 4, stepShift: 12 },
      { id: 'nudge_right', icon: '→', section: 'position', step: 4, stepShift: 12 },
      { id: 'nudge_up',    icon: '↑', section: 'position', step: 4, stepShift: 12 },
      { id: 'nudge_down',  icon: '↓', section: 'position', step: 4, stepShift: 12 },
      { id: 'reset_pos',   icon: '⟲', section: 'position' },
    ],
    presets: [
      { id: 'size', icon: '📐', section: 'size',
        options: [
          { key: 's', label: 'S', icon: '📏' },
          { key: 'm', label: 'M', icon: '📐' },
          { key: 'l', label: 'L', icon: '📌' },
        ]
      },
      { id: 'theme', icon: '🎨', section: 'theme',
        options: [
          { key: 'stealth',   label: 'Stealth',     icon: '🕶️' },
          { key: 'readable',  label: 'Readable',    icon: '👓' },
          { key: 'contrast',  label: 'Hi-Contrast', icon: '⚡'  },
        ]
      }
    ],
    toggles: [],
  };

  const CFG = Object.freeze({
    Z_INDEX: 2147483645,
    PAD: 8,
    BOOT_TRIES: 60,
    BOOT_GAP_MS: 160,
    POP_GAP: 8,
    POP_W: 320,
    POP_ANIM_MS: 160,
    NUDGE_STEP: 4,
    NUDGE_STEP_SHIFT: 12,
    CLAMP_X_ON_MANUAL_NUDGE: false,
    DEFAULT_AXIS_X: -16,
    DEFAULT_AXIS_Y: 0,
    RESET_AXIS_EACH_LOAD: true,
    OPACITY_MIN: 0.20,
    OPACITY_MAX: 1.00,
    OPACITY_STEP: 0.01,
    AXIS_X_MIN: -5000,
    AXIS_X_MAX: 5000,
    AXIS_Y_MIN: -240,
    AXIS_Y_MAX: 240,
  });

  const SAND_GLASS = Object.freeze({
    GLASS_TEXT: '#f4f6fb',
    GLASS_TEXT_MUTE: 'rgba(244,246,251,0.70)',
    GLASS_BG_A: 'rgba(255,255,255,0.045)',
    GLASS_BG_B: 'rgba(255,255,255,0.030)',
    GLASS_BLUR_PX: 14,
    GLASS_SAT: 1.05,
    GLASS_CONTRAST: 1.08,
    GLASS_BRIGHT: 1.03,
    GLASS_BORDER: 'rgba(255,255,255,0.12)',
    GLASS_SHADOW: '0 26px 80px rgba(0,0,0,.85), 0 0 0 1px rgba(255,255,255,.10), inset 0 0 0 1px rgba(0,0,0,.25)',
    BTN_BG: 'rgba(255,255,255,0.06)',
    BTN_BG_HOVER: 'rgba(255,255,255,0.10)',
    BTN_BG_ACTIVE: 'rgba(255,255,255,0.14)',
    SEL_BG: 'rgba(147,197,253,0.16)',
    SEL_BORDER: 'rgba(147,197,253,0.30)',
    FOCUS_RING: 'rgba(147,197,253,0.40)',
  });

  // ───────────────────────────── Size Presets (CSS vars only) ─────────────────────────────
  // Single-source geometry packs: apply ONLY CSS variables; never hard-code styles.
  const SIZE_PRESETS = Object.freeze({
    s: {
      '--box-w':'64px', '--box-h':'32px', '--box-r':'7px',
      '--toggle-x':'var(--mm-x)', '--dial-x':'var(--mm-x)',
      '--mm-btn-w':'48px', '--mm-btn-h':'22px', '--mm-btn-r':'6px',
      '--mm-w':'calc(var(--mm-btn-w) + (2 * var(--mm-side-lane)))',
      '--cgxui-mnmp-btn-width':'48px', '--cgxui-mnmp-btn-height':'22px',
    },
    m: {
      '--box-w':'72px', '--box-h':'36px', '--box-r':'8px',
      '--toggle-x':'var(--mm-x)', '--dial-x':'var(--mm-x)',
      '--mm-btn-w':'56px', '--mm-btn-h':'24px', '--mm-btn-r':'6px',
      '--mm-w':'calc(var(--mm-btn-w) + (2 * var(--mm-side-lane)))',
      '--cgxui-mnmp-btn-width':'56px', '--cgxui-mnmp-btn-height':'24px',
    },
    l: {
      '--box-w':'80px', '--box-h':'40px', '--box-r':'9px',
      '--toggle-x':'var(--mm-x)', '--dial-x':'var(--mm-x)',
      '--mm-btn-w':'64px', '--mm-btn-h':'28px', '--mm-btn-r':'8px',
      '--mm-w':'calc(var(--mm-btn-w) + (2 * var(--mm-side-lane)))',
      '--cgxui-mnmp-btn-width':'64px', '--cgxui-mnmp-btn-height':'28px',
    },
  });
  const SIZE_DEFAULT = 'm';


  const ATTR = Object.freeze({
    CGXUI_OWNER: 'data-cgxui-owner',
    CGXUI: 'data-cgxui',
    CGXUI_STATE: 'data-cgxui-state',
    CGXUI_THEME: 'data-cgxui-theme',
    CGXUI_SIZE:  'data-cgxui-size',
  });
  const ATTR_PAGE_LABEL_STYLE = 'data-cgxui-page-label-style';
  const ATTR_PAGE_DIVIDERS = 'data-cgxui-page-dividers';
  const ATTR_CHAT_PAGE_DIVIDERS = 'data-cgxui-chat-pages';

  const UI = Object.freeze({
    ROOT:   'mnmp-root',
    TOGGLE: 'mnmp-toggle',
    PANEL:  'mnmp-minimap',
    AUX:    'mnmp-aux',
    QUICK_POPO:  'mnmp-quick-popover',
  });

  const SEL = Object.freeze({
    ROOT:   `[${ATTR.CGXUI}="${UI.ROOT}"][${ATTR.CGXUI_OWNER}="${SkID}"]`,
    TOGGLE: `[${ATTR.CGXUI}="${UI.TOGGLE}"][${ATTR.CGXUI_OWNER}="${SkID}"]`,
    PANEL:  `[${ATTR.CGXUI}="${UI.PANEL}"][${ATTR.CGXUI_OWNER}="${SkID}"]`,
    AUX:    `[${ATTR.CGXUI}="${UI.AUX}"][${ATTR.CGXUI_OWNER}="${SkID}"]`,
    QUICK_POPO: `[${ATTR.CGXUI}="${UI.QUICK_POPO}"][${ATTR.CGXUI_OWNER}="${SkID}"]`,
    STYLE: '#cgxui-mnmp-quick-style',
  });

  const DISK = Object.freeze({
    // Keep keys stable + explicit (no raw strings scattered)
    NS_FALLBACK: 'h2o:prm:cgx:mnmp',
    KEY_AXIS:    'ui:axis-offset:v1',
    KEY_AXIS_SHIFT_MARK: 'ui:axis-shift-right-step:v4',
    KEY_THEME:   'ui:theme:v1',
    KEY_SIZE:    'ui:size-preset:v1',
    KEY_OPACITY: 'ui:btn-opacity:v1',
    KEY_PAGE_LABEL_STYLE: 'ui:page-label-style:v1',
    KEY_PAGE_DIVIDERS: 'ui:page-dividers:v1',
    KEY_CHAT_PAGE_DIVIDERS: 'ui:chat-pages:v1',
  });
  const DIVIDER_DEFAULT_COLOR = '#facc15';
  const DIVIDER_COLOR_PRESETS = Object.freeze([
    { key: 'gold', value: '#facc15', label: 'Gold' },
    { key: 'mint', value: '#34d399', label: 'Mint' },
    { key: 'sky', value: '#4cd3ff', label: 'Sky' },
    { key: 'rose', value: '#f87171', label: 'Rose' },
  ]);
  const DIVIDER_STYLES = Object.freeze(['solid', 'dashed', 'dotted']);

  function log(...a){ try { console.log('[MiniMap Quick]', ...a); } catch {} }
  function warn(...a){ try { console.warn('[MiniMap Quick]', ...a); } catch {} }

  function perfNow(){
    const n = Number(W.performance?.now?.() || Date.now());
    return Number.isFinite(n) ? n : 0;
  }

  function perfRoundMs(value){
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 1000) / 1000;
  }

  function createDurationBucket(){
    return {
      count: 0,
      totalMs: 0,
      maxMs: 0,
      slowOver4Count: 0,
      slowOver8Count: 0,
      slowOver16Count: 0,
      slowOver50Count: 0,
      slowOver100Count: 0,
    };
  }

  function createDurationBucketMap(keys = []){
    const out = Object.create(null);
    for (const key of keys) out[String(key)] = createDurationBucket();
    return out;
  }

  function createAuxClickPerfState(){
    return Object.assign(createDurationBucket(), {
      lastAt: 0,
      lastControlId: '',
      lastActionType: '',
      controlType: createDurationBucketMap([
        'toggle',
        'toggleSynthetic',
        'unknown',
      ]),
      actionType: createDurationBucketMap([
        'noOp',
        'menuOpen',
        'menuClose',
      ]),
      branches: Object.create(null),
    });
  }

  function createMiniMapQuickControlsPerfState(){
    return {
      auxClick: createAuxClickPerfState(),
    };
  }

  function ensureMiniMapQuickControlsPerfStateShape(target){
    if (!target || typeof target !== 'object') return target;
    if (!target.auxClick || typeof target.auxClick !== 'object') target.auxClick = createAuxClickPerfState();
    if (!target.auxClick.controlType || typeof target.auxClick.controlType !== 'object') target.auxClick.controlType = Object.create(null);
    if (!target.auxClick.actionType || typeof target.auxClick.actionType !== 'object') target.auxClick.actionType = Object.create(null);
    if (!target.auxClick.branches || typeof target.auxClick.branches !== 'object') target.auxClick.branches = Object.create(null);
    return target;
  }

  function recordDuration(bucket, msRaw){
    if (!bucket) return 0;
    const ms = Number(msRaw);
    if (!Number.isFinite(ms) || ms < 0) return 0;
    bucket.count = Number(bucket.count || 0) + 1;
    bucket.totalMs = Number(bucket.totalMs || 0) + ms;
    bucket.maxMs = Math.max(Number(bucket.maxMs || 0), ms);
    if (ms > 4) bucket.slowOver4Count = Number(bucket.slowOver4Count || 0) + 1;
    if (ms > 8) bucket.slowOver8Count = Number(bucket.slowOver8Count || 0) + 1;
    if (ms > 16) bucket.slowOver16Count = Number(bucket.slowOver16Count || 0) + 1;
    if (ms > 50) bucket.slowOver50Count = Number(bucket.slowOver50Count || 0) + 1;
    if (ms > 100) bucket.slowOver100Count = Number(bucket.slowOver100Count || 0) + 1;
    return ms;
  }

  function readDurationBucket(bucket){
    const count = Number(bucket?.count || 0);
    const totalMs = Number(bucket?.totalMs || 0);
    return {
      count,
      totalMs: perfRoundMs(totalMs) ?? 0,
      avgMs: count > 0 ? perfRoundMs(totalMs / count) : null,
      maxMs: count > 0 ? perfRoundMs(bucket?.maxMs || 0) : null,
      slowOver4Count: Number(bucket?.slowOver4Count || 0),
      slowOver8Count: Number(bucket?.slowOver8Count || 0),
      slowOver16Count: Number(bucket?.slowOver16Count || 0),
      slowOver50Count: Number(bucket?.slowOver50Count || 0),
      slowOver100Count: Number(bucket?.slowOver100Count || 0),
    };
  }

  function bumpCounter(obj, key){
    if (!obj) return 0;
    const k = String(key || '');
    obj[k] = Number(obj[k] || 0) + 1;
    return obj[k];
  }

  function ensureDurationBucketMapEntry(obj, key){
    const k = String(key || '').trim() || 'unknown';
    if (!obj[k] || typeof obj[k] !== 'object') obj[k] = createDurationBucket();
    return obj[k];
  }

  function copyDurationBucketMap(obj){
    const out = Object.create(null);
    for (const key of Object.keys(obj || {})) out[key] = readDurationBucket(obj[key]);
    return out;
  }

  function resetMiniMapQuickControlsPerfState(target){
    if (!target) return target;
    target.auxClick = createAuxClickPerfState();
    return target;
  }

  function getMiniMapQuickControlsPerfStats(){
    ensureMiniMapQuickControlsPerfStateShape(PERF);
    const auxClickBucket = PERF.auxClick || {};
    return {
      auxClick: Object.assign(readDurationBucket(auxClickBucket), {
        lastAt: Number(auxClickBucket.lastAt || 0),
        lastControlId: String(auxClickBucket.lastControlId || ''),
        lastActionType: String(auxClickBucket.lastActionType || ''),
        controlType: copyDurationBucketMap(auxClickBucket.controlType),
        actionType: copyDurationBucketMap(auxClickBucket.actionType),
        branches: copyDurationBucketMap(auxClickBucket.branches),
      }),
    };
  }

  // ───────────────────────────── Disk / Storage ─────────────────────────────

  function getShared() { try { return TOPW.H2O_MM_SHARED?.get?.() || null; } catch { return null; } }

  function storageApi() {
    try { return getShared()?.util?.storage || null; } catch { return null; }
  }

  function nsDisk() {
    const sh = getShared();
    try {
      const ns = sh?.util?.ns;
      if (ns && typeof ns.disk === 'function') return ns.disk('prm', 'cgx', 'mnmp');
    } catch {}
    return String(sh?.NS_DISK || DISK.NS_FALLBACK);
  }

  function keyAxis(){ return `${nsDisk()}:${DISK.KEY_AXIS}`; }
  function keyAxisShiftMark(){ return `${nsDisk()}:${DISK.KEY_AXIS_SHIFT_MARK}`; }
  function keyTheme(){ return `${nsDisk()}:${DISK.KEY_THEME}`; }
  function keySize(){ return `${nsDisk()}:${DISK.KEY_SIZE}`; }
  function keyOpacity(){ return `${nsDisk()}:${DISK.KEY_OPACITY}`; }
  function keyPageLabelStyle(){ return `${nsDisk()}:${DISK.KEY_PAGE_LABEL_STYLE}`; }
  function keyPageDividers(){ return `${nsDisk()}:${DISK.KEY_PAGE_DIVIDERS}`; }
  function keyChatPageDividers(){ return `${nsDisk()}:${DISK.KEY_CHAT_PAGE_DIVIDERS}`; }

  function clampNum(n, min, max){
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function parsePx(v, fb=0){
    const s = String(v ?? '').trim();
    if (!s) return fb;
    // Accept "12", "12px", "-3.5px"
    const m = s.match(/-?\d+(?:\.\d+)?/);
    if (!m) return fb;
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : fb;
  }

  function readJSON(key, fb){
    const st = storageApi();
    if (st && typeof st.getJSON === 'function') {
      try {
        const v = st.getJSON(key, null);
        return (v == null) ? fb : v;
      } catch {}
    }
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fb;
      return JSON.parse(raw);
    } catch {
      return fb;
    }
  }

  function writeJSON(key, val){
    const st = storageApi();
    if (st && typeof st.setJSON === 'function') {
      try { st.setJSON(key, val); return true; } catch {}
    }
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch {}
    return false;
  }

  function readStr(key, fb){
    const st = storageApi();
    if (st && typeof st.getStr === 'function') {
      try {
        const v = st.getStr(key, null);
        return (v == null) ? fb : String(v);
      } catch {}
    }
    try {
      const v = localStorage.getItem(key);
      return (v == null) ? fb : String(v);
    } catch {
      return fb;
    }
  }

  function writeStr(key, val){
    const st = storageApi();
    if (st && typeof st.setStr === 'function') {
      try { st.setStr(key, String(val)); return true; } catch {}
    }
    try { localStorage.setItem(key, String(val)); return true; } catch {}
    return false;
  }
    // ───────────────────────────── UI helpers ─────────────────────────────

  function getRefs(){
    // Prefer shared uiRefs (Shell-owned), otherwise query.
    const r = MM_uiRefs();
    const root = (r?.root && r.root.isConnected) ? r.root : document.querySelector(SEL.ROOT);
    const toggle = (r?.toggle && r.toggle.isConnected) ? r.toggle : (root?.querySelector?.(SEL.TOGGLE) || document.querySelector(SEL.TOGGLE));
    const panel = (r?.panel && r.panel.isConnected) ? r.panel : (root?.querySelector?.(SEL.PANEL) || document.querySelector(SEL.PANEL));
    const aux = (r?.aux && r.aux.isConnected) ? r.aux : (root?.querySelector?.(SEL.AUX) || document.querySelector(SEL.AUX));
    return { root, toggle, panel, aux };
  }

  function ensureStyle(){
    let el = document.querySelector(SEL.STYLE);
    if (el) return el;
    el = document.createElement('style');
    el.id = SEL.STYLE.slice(1);
    el.textContent = cssText();
    document.head.appendChild(el);
    return el;
  }

  function cssText(){
    // Sand Glass popover skin + axis transform applied to ROOT (so the whole stack moves).
    const S_ROOT = SEL.ROOT;
    const S_POPO = SEL.QUICK_POPO;
    const S_TOGGLE = SEL.TOGGLE;
    const S_AUX = SEL.AUX;
    const T = SAND_GLASS;

    return `
${S_ROOT}{
  /* Shell owns axis transforms; avoid doubling offset at root level. */
  transform: none !important;
}
${S_TOGGLE}:not([${ATTR.CGXUI_STATE}~="faded"]){
  opacity: var(--mm-ctl-opacity, var(--mm-btn-opacity));
}
${S_AUX}:not([${ATTR.CGXUI_STATE}~="collapsed"]){
  opacity: var(--mm-ctl-opacity, var(--mm-btn-opacity)) !important;
}

/* ── Popover: Sand Glass ───────────────────────── */
${S_POPO}{
  --mmqc-text: ${T.GLASS_TEXT};
  --mmqc-text-mute: ${T.GLASS_TEXT_MUTE};
  --mmqc-border: ${T.GLASS_BORDER};
  --mmqc-btn-bg: ${T.BTN_BG};
  --mmqc-btn-bg-hover: ${T.BTN_BG_HOVER};
  --mmqc-btn-bg-active: ${T.BTN_BG_ACTIVE};
  --mmqc-sel-bg: ${T.SEL_BG};
  --mmqc-sel-border: ${T.SEL_BORDER};
  --mmqc-focus-ring: ${T.FOCUS_RING};
  position: fixed;
  z-index: ${CFG.Z_INDEX};
  width: ${CFG.POP_W}px;
  max-width: min(${CFG.POP_W}px, calc(100vw - ${CFG.PAD * 2}px));
  max-height: calc(100vh - ${CFG.PAD * 2}px);
  border-radius: 18px;
  padding: 12px;
  color: var(--mmqc-text);
  background: linear-gradient(135deg, ${T.GLASS_BG_A}, ${T.GLASS_BG_B});
  border: 1px solid var(--mmqc-border);
  box-shadow: ${T.GLASS_SHADOW};
  filter: none !important;
  backdrop-filter: blur(${T.GLASS_BLUR_PX}px) saturate(${T.GLASS_SAT}) contrast(${T.GLASS_CONTRAST}) brightness(${T.GLASS_BRIGHT});
  -webkit-backdrop-filter: blur(${T.GLASS_BLUR_PX}px) saturate(${T.GLASS_SAT}) contrast(${T.GLASS_CONTRAST}) brightness(${T.GLASS_BRIGHT});
  font: 520 12px/1.25 "SF Pro Text","Avenir Next","Segoe UI",system-ui,sans-serif;

  display: none;
  pointer-events: auto;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-color: rgba(255,255,255,.18) transparent;

  opacity: 0;
  transform: translateY(-6px) scale(0.985);
  transform-origin: top right;
  transition: opacity ${CFG.POP_ANIM_MS}ms ease, transform ${CFG.POP_ANIM_MS}ms ease;
}
${S_POPO}[${ATTR.CGXUI_STATE}~="open"]{
  display: block;
  opacity: 1;
  transform: translateY(0) scale(1);
}

${S_POPO}::before{
  content:"";
  position:absolute;
  inset: 0;
  border-radius: 18px;
  pointer-events:none;
  background: linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0));
  opacity: 0.40;
}
${S_POPO}::-webkit-scrollbar{ width: 8px; height: 8px; }
${S_POPO}::-webkit-scrollbar-thumb{
  background: rgba(255,255,255,.16);
  border-radius: 10px;
}
${S_POPO}::-webkit-scrollbar-thumb:hover{ background: rgba(255,255,255,.22); }

${S_POPO} .mmqc-hdr{
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 10px;
  padding: 4px 4px 10px;
  margin-bottom: 4px;
}
${S_POPO} .mmqc-title{
  display:flex;
  align-items:center;
  gap: 8px;
  font-weight: 740;
  letter-spacing: 0.015em;
  font-size: 13px;
  color: var(--mmqc-text);
}

${S_POPO} .mmqc-close,
${S_POPO} .mmqc-btn,
${S_POPO} .mmqc-reset,
${S_POPO} .mmqc-pill,
${S_POPO} .mmqc-op-reset{
  border: 1px solid rgba(255,255,255,.10);
  background: var(--mmqc-btn-bg);
  color: var(--mmqc-text);
  box-shadow: none;
}
${S_POPO} .mmqc-close{
  width: 26px; height: 26px;
  border-radius: 999px;
  display:grid; place-items:center;
  cursor:pointer;
  opacity: 0.9;
  transition: opacity .16s ease, filter .16s ease, transform .16s ease, background .16s ease, border-color .16s ease, box-shadow .16s ease;
}
${S_POPO} .mmqc-close:hover,
${S_POPO} .mmqc-btn:hover,
${S_POPO} .mmqc-reset:hover,
${S_POPO} .mmqc-pill:hover,
${S_POPO} .mmqc-op-reset:hover{
  background: var(--mmqc-btn-bg-hover);
  border-color: rgba(255,255,255,.16);
  filter: none;
}
${S_POPO} .mmqc-close:hover{ opacity: 1; }
${S_POPO} .mmqc-close:active,
${S_POPO} .mmqc-btn:active,
${S_POPO} .mmqc-reset:active,
${S_POPO} .mmqc-pill:active,
${S_POPO} .mmqc-op-reset:active{ transform: translateY(0.5px) scale(0.985); }
${S_POPO} .mmqc-close:focus-visible,
${S_POPO} .mmqc-btn:focus-visible,
${S_POPO} .mmqc-reset:focus-visible,
${S_POPO} .mmqc-pill:focus-visible,
${S_POPO} .mmqc-op-reset:focus-visible,
${S_POPO} .mmqc-input:focus,
${S_POPO} .mmqc-range:focus-visible{
  outline: none;
  box-shadow: 0 0 0 3px var(--mmqc-focus-ring);
}

${S_POPO} .mmqc-div{
  height: 1px;
  background: linear-gradient(90deg, rgba(255,255,255,0.02), rgba(255,255,255,0.12), rgba(255,255,255,0.02));
  margin: 12px 2px 10px;
}

${S_POPO} .mmqc-sec{ margin-top: 8px; padding: 2px; }
${S_POPO} .mmqc-lbl{
  display:flex;
  align-items:center;
  justify-content: flex-start;
  gap: 8px;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.11em;
  opacity: 0.72;
  margin: 0 2px 8px;
  color: var(--mmqc-text-mute);
}
${S_POPO} .mmqc-lbl-main{
  display:inline-flex;
  align-items:center;
  gap: 7px;
  min-width: 0;
}
${S_POPO} .mmqc-lbl-ico{ opacity: 0.78; }
${S_POPO} .mmqc-help{
  display: inline-block;
  margin-left: 2px;
  font-size: 10px;
  font-weight: 600;
  opacity: 0.46;
  cursor: help;
  color: var(--mmqc-text-mute);
  transition: opacity 0.16s ease, color 0.16s ease;
}
${S_POPO} .mmqc-help:hover{
  opacity: 0.8;
  color: var(--mmqc-text);
}

${S_POPO} .mmqc-row{
  display:flex;
  flex-direction: column;
  gap: 9px;
  align-items: stretch;
}
${S_POPO} .mmqc-nudge{
  display:grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  width: 100%;
}
${S_POPO} .mmqc-position-row{
  display:grid;
  grid-template-columns: repeat(4, 46px) minmax(72px, 1fr);
  gap: 8px;
  align-items:center;
  width: 100%;
}
${S_POPO} .mmqc-btn-dir{
  width: 40px;
  min-width: 40px;
  height: 28px;
  border-radius: 10px;
  padding: 0;
  font-size: 15px;
  line-height: 1;
}
${S_POPO} .mmqc-reset-inline{
  align-self: auto;
  width: 100%;
  min-width: 0;
  height: 28px;
  padding: 0 9px;
  gap: 4px;
}
${S_POPO} .mmqc-reset-inline .mmqc-reset-ico{
  width: 13px;
  height: 13px;
  font-size: 8px;
  background: rgba(255,255,255,.10);
  border: 1px solid rgba(255,255,255,.12);
}
${S_POPO} .mmqc-reset-inline .mmqc-reset-txt {
  font-size: 10px;
  font-weight: 600;
}

${S_POPO} .mmqc-btn{
  height: 33px;
  border-radius: 11px;
  cursor: pointer;
  user-select: none;
  font-weight: 700;
  transition: filter .16s ease, background .16s ease, border-color .16s ease, transform .16s ease, opacity .16s ease, box-shadow .16s ease;
}
${S_POPO} .mmqc-btn[data-variant="accent"],
${S_POPO} .mmqc-pill[aria-pressed="true"],
${S_POPO} .mmqc-btn[aria-pressed="true"]{
  background: var(--mmqc-btn-bg-active);
  border-color: var(--mmqc-sel-border);
  box-shadow: 0 0 0 1px var(--mmqc-sel-border), 0 10px 30px rgba(0,0,0,.35);
}
${S_POPO} .mmqc-reset{
  align-self: flex-end;
  min-width: 0px;
  height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  white-space: nowrap;
  font-weight: 700;
  letter-spacing: 0.01em;
  cursor:pointer;
  opacity: 0.95;
  transition: opacity .16s ease, filter .16s ease, transform .16s ease, background .16s ease, border-color .16s ease, box-shadow .16s ease;
}
${S_POPO} .mmqc-reset .mmqc-reset-ico{
  width: 19px;
  height: 19px;
  border-radius: 999px;
  display: inline-grid;
  place-items: center;
  font-size: 11px;
  background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.12);
}
${S_POPO} .mmqc-reset .mmqc-reset-txt{ line-height: 1; }

${S_POPO} .mmqc-pills{
  display:flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 0 2px;
}
${S_POPO} .mmqc-pills-nowrap{ flex-wrap: nowrap; }
${S_POPO} .mmqc-pills-stretch .mmqc-pill{
  flex: 1 1 0;
  min-width: 0;
  justify-content: center;
}
${S_POPO} .mmqc-pill{
  height: 32px;
  padding: 0 11px;
  border-radius: 999px;
  cursor: pointer;
  user-select: none;
  display:flex;
  align-items:center;
  gap: 6px;
  opacity: 0.88;
  transition: opacity .16s ease, background .16s ease, border-color .16s ease, transform .16s ease, box-shadow .16s ease;
}
${S_POPO} .mmqc-pills-tight{
  gap: 6px;
  padding: 0;
}
${S_POPO} .mmqc-pills-tight .mmqc-pill{
  height: 30px;
  padding: 0 10px;
}
${S_POPO} [data-sec="theme"] .mmqc-pill span:last-child{
  white-space: nowrap;
  font-size: 10.5px;
}
${S_POPO} .mmqc-field{
  display:flex;
  flex-direction:column;
  gap: 6px;
}
${S_POPO} .mmqc-field-lbl{
  font-size: 10px;
  color: var(--mmqc-text-mute);
  letter-spacing: 0.02em;
}
${S_POPO} .mmqc-field-lbl-inline{
  flex: 0 0 62px;
  min-width: 62px;
  margin: 0;
}
${S_POPO} .mmqc-input{
  width: 100%;
  height: 32px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(0,0,0,.22);
  color: var(--mmqc-text);
  padding: 0 10px;
  box-sizing: border-box;
  font: inherit;
}
${S_POPO} .mmqc-input::placeholder{ color: var(--mmqc-text-mute); }
${S_POPO} .mmqc-inline{
  display:flex;
  align-items:flex-end;
  gap: 10px;
}
${S_POPO} .mmqc-inline > *{ min-width: 0; }
${S_POPO} .mmqc-field-color{ flex: 0 0 auto; }
${S_POPO} .mmqc-color-pills{
  display:flex;
  align-items:center;
  gap: 6px;
  flex-wrap: wrap;
}
${S_POPO} .mmqc-color-preset{
  width: 34px;
  height: 28px;
  padding: 0;
  justify-content:center;
}
${S_POPO} .mmqc-color-dot{
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: var(--mmqc-swatch, ${DIVIDER_DEFAULT_COLOR});
  box-shadow: 0 0 0 1px rgba(255,255,255,0.22) inset;
}
${S_POPO} .mmqc-stat{
  flex: 1 1 auto;
  min-height: 24px;
  display:flex;
  align-items:center;
  font-size: 10.5px;
  color: var(--mmqc-text-mute);
}
${S_POPO} .mmqc-actions{
  display:flex;
  align-items:center;
  gap: 8px;
}
${S_POPO} .mmqc-actions .mmqc-btn{ flex: 1 1 0; }
${S_POPO} .mmqc-divider-top{
  display:flex;
  align-items:center;
  gap: 8px;
}
${S_POPO} .mmqc-divider-top .mmqc-input{
  flex: 1 1 auto;
  min-width: 0;
}
${S_POPO} .mmqc-actions-mini{
  display:flex;
  align-items:center;
  gap: 6px;
  flex: 0 0 auto;
}
${S_POPO} .mmqc-btn-icon{
  width: 34px;
  min-width: 34px;
  height: 32px;
  padding: 0;
  border-radius: 10px;
  font-size: 18px;
  line-height: 1;
  display:grid;
  place-items:center;
}
${S_POPO} .mmqc-row-inline{
  display:flex;
  align-items:center;
  gap: 10px;
}
${S_POPO} .mmqc-row-inline .mmqc-pills,
${S_POPO} .mmqc-row-inline .mmqc-color-pills{
  flex: 1 1 auto;
  min-width: 0;
}
${S_POPO} .mmqc-row-inline .mmqc-pills{
  flex-wrap: nowrap;
  padding: 0;
}
${S_POPO} .mmqc-row-inline .mmqc-pills .mmqc-pill{
  flex: 1 1 0;
  min-width: 0;
  justify-content: center;
}
${S_POPO} .mmqc-row-inline .mmqc-color-pills{ flex-wrap: nowrap; }
${S_POPO} .mmqc-divider-note{ display:none; }
${S_POPO} .mmqc-btn[data-variant="subtle"]{
  background: rgba(255,255,255,.05);
}
${S_POPO} .mmqc-btn[disabled],
${S_POPO} .mmqc-pill[disabled],
${S_POPO} .mmqc-input[disabled]{
  opacity: 0.46;
  cursor: not-allowed;
  box-shadow: none !important;
  filter: none !important;
}

${S_POPO} .mmqc-op{
  display:flex;
  flex-direction:column;
  gap: 8px;
  padding: 0 2px;
}
${S_POPO} .mmqc-op-line{
  display:grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items:center;
  gap: 8px;
}
${S_POPO} .mmqc-op-meta{
  display:flex;
  align-items:center;
  justify-content:flex-start;
  font-size: 10.5px;
  color: var(--mmqc-text-mute);
}
${S_POPO} .mmqc-op-note{ color: var(--mmqc-text-mute); }
${S_POPO} .mmqc-op-val{ font-weight: 700; color: var(--mmqc-text); min-width: 40px; text-align: right; }
${S_POPO} .mmqc-op-tools{
  display:flex;
  align-items:center;
  gap: 8px;
}
${S_POPO} .mmqc-op-reset{
  height: 24px;
  min-width: 0;
  padding: 0 9px;
  border-radius: 999px;
  font: 600 11px/1 "SF Pro Text","Avenir Next","Segoe UI",system-ui,sans-serif;
  cursor: pointer;
  transition: background .16s ease, border-color .16s ease, transform .16s ease, box-shadow .16s ease;
}
${S_POPO} .mmqc-range{
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  min-width: 0;
  height: 28px;
  margin: 0;
  background: transparent;
  cursor: pointer;
}
${S_POPO} .mmqc-range:focus{ outline: none; }
${S_POPO} .mmqc-range::-webkit-slider-runnable-track{
  height: 8px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(255,255,255,.18), rgba(147,197,253,.28));
  border: 1px solid rgba(255,255,255,.16);
}
${S_POPO} .mmqc-range::-webkit-slider-thumb{
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  margin-top: -5px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(255,255,255,.98), rgba(226,226,226,.94));
  border: 1px solid rgba(0,0,0,.30);
  box-shadow: 0 2px 8px rgba(0,0,0,.35);
}
${S_POPO} .mmqc-range::-moz-range-track{
  height: 8px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(255,255,255,.18), rgba(147,197,253,.28));
  border: 1px solid rgba(255,255,255,.16);
}
${S_POPO} .mmqc-range::-moz-range-thumb{
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(255,255,255,.98), rgba(226,226,226,.94));
  border: 1px solid rgba(0,0,0,.30);
  box-shadow: 0 2px 8px rgba(0,0,0,.35);
}

/* Theme packs (pure CSS var overrides) */
${S_ROOT}[${ATTR.CGXUI_THEME}="stealth"]{
  --mm-btn-opacity: 0.38;
  --mm-btn-border: 1px solid rgba(255,255,255,0.16);
  --mm-btn-bg: rgba(255,255,255,0.035);
  --mm-btn-bg-hover: rgba(255,255,255,0.06);
  --mm-btn-bg-active: rgba(255,255,255,0.085);
  --mm-fade-o1: 0.68;
  --mm-fade-o2: 0.40;
  --mm-fade-o3: 0.22;
  --toggle-faded: 0.12;
  --toggle-faded-hover: 0.48;
}
${S_ROOT}[${ATTR.CGXUI_THEME}="readable"]{
  --mm-btn-opacity: 0.62;
  --mm-btn-border: 1px solid rgba(255,255,255,0.24);
  --mm-btn-bg: rgba(255,255,255,0.06);
  --mm-btn-bg-hover: rgba(255,255,255,0.10);
  --mm-btn-bg-active: rgba(255,255,255,0.14);
  --mm-fade-o1: 0.82;
  --mm-fade-o2: 0.55;
  --mm-fade-o3: 0.33;
  --toggle-faded: 0.18;
  --toggle-faded-hover: 0.62;
}
${S_ROOT}[${ATTR.CGXUI_THEME}="contrast"]{
  --mm-btn-opacity: 0.82;
  --mm-btn-border: 1px solid rgba(255,255,255,0.34);
  --mm-btn-bg: rgba(255,255,255,0.10);
  --mm-btn-bg-hover: rgba(255,255,255,0.16);
  --mm-btn-bg-active: rgba(255,255,255,0.20);
  --mm-fade-o1: 0.92;
  --mm-fade-o2: 0.70;
  --mm-fade-o3: 0.48;
  --toggle-faded: 0.22;
  --toggle-faded-hover: 0.75;
}
    `;
  }
  function setStateTok(el, tok, on){
    if (!el) return;
    const k = ATTR.CGXUI_STATE;
    const cur = String(el.getAttribute(k) || '').trim();
    const set = new Set(cur ? cur.split(/\s+/).filter(Boolean) : []);
    if (on) set.add(tok); else set.delete(tok);
    if (set.size) el.setAttribute(k, Array.from(set).join(' '));
    else el.removeAttribute(k);
  }

  function isOpen(pop){ return !!pop && String(pop.getAttribute(ATTR.CGXUI_STATE)||'').split(/\s+/).includes('open'); }

  function escapeAttr(value){
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function sectionLabel(icon, label, helpText = ''){
    const tip = String(helpText || '').trim();
    return `
      <div class="mmqc-lbl">
        <span class="mmqc-lbl-main">
          <span class="mmqc-lbl-ico" aria-hidden="true">${icon}</span>
          <span>${label}</span>
          ${tip ? `<span class="mmqc-help" title="${escapeAttr(tip)}">ⓘ</span>` : ''}
        </span>
      </div>
    `;
  }

  function manualDividerSectionHtml(){
    const colorPills = DIVIDER_COLOR_PRESETS.map((preset) => `
      <button
        type="button"
        class="mmqc-pill mmqc-color-preset"
        data-divider-color-preset="${preset.value}"
        aria-pressed="false"
        aria-label="${preset.label} divider color"
        title="${preset.label}"
        style="--mmqc-swatch:${preset.value}"
      ><span class="mmqc-color-dot" aria-hidden="true"></span></button>
    `).join('');
    return `
      <div class="mmqc-sec" data-sec="divider">
        ${sectionLabel('〰', 'Manual Divider', 'Select a manual divider, adjust its style and color, then drag it directly on the MiniMap.')}
        <div class="mmqc-row">
          <div class="mmqc-divider-top">
            <select class="mmqc-input" data-divider-id aria-label="Select divider">
              <option value="">No dividers yet</option>
            </select>
            <div class="mmqc-actions-mini">
              <button type="button" class="mmqc-btn mmqc-btn-icon mmqc-action-btn" data-act="divider_create" data-variant="accent" aria-label="New divider" title="New divider">+</button>
              <button type="button" class="mmqc-btn mmqc-btn-icon mmqc-action-btn" data-act="divider_remove" data-variant="subtle" aria-label="Remove divider" title="Remove divider">-</button>
            </div>
          </div>
          <div class="mmqc-row-inline">
            <div class="mmqc-field-lbl mmqc-field-lbl-inline">Line type</div>
            <div class="mmqc-pills mmqc-pills-tight">
              <button type="button" class="mmqc-pill" data-divider-style="solid" aria-pressed="false">Solid</button>
              <button type="button" class="mmqc-pill" data-divider-style="dashed" aria-pressed="false">Dashed</button>
              <button type="button" class="mmqc-pill" data-divider-style="dotted" aria-pressed="false">Dotted</button>
            </div>
          </div>
          <div class="mmqc-row-inline">
            <div class="mmqc-field-lbl mmqc-field-lbl-inline">Color</div>
            <div class="mmqc-color-pills">${colorPills}</div>
          </div>
          <div class="mmqc-stat mmqc-divider-note" data-divider-note>Create, then drag.</div>
        </div>
      </div>
    `;
  }

  function pageDividersSectionHtml(){
    return `
      <div class="mmqc-sec" data-sec="pages">
        ${sectionLabel('📄', 'Page Dividers', 'Control automatic page dividers every 25 turns on the MiniMap and in the live chat page.')}
        <div class="mmqc-row">
          <div class="mmqc-row-inline">
            <div class="mmqc-field-lbl mmqc-field-lbl-inline">MiniMap Page Dividers</div>
            <div class="mmqc-pills mmqc-pills-tight">
              <button type="button" class="mmqc-pill" data-page-dividers="1" aria-pressed="false">On</button>
              <button type="button" class="mmqc-pill" data-page-dividers="0" aria-pressed="false">Off</button>
            </div>
          </div>
          <div class="mmqc-row-inline">
            <div class="mmqc-field-lbl mmqc-field-lbl-inline">Chat Page Dividers</div>
            <div class="mmqc-pills mmqc-pills-tight">
              <button type="button" class="mmqc-pill" data-chat-page-dividers="1" aria-pressed="false">On</button>
              <button type="button" class="mmqc-pill" data-chat-page-dividers="0" aria-pressed="false">Off</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ───────────────────────────── Axis + Clamp ─────────────────────────────

  function getAxis(root){
    if (!root) return { x: 0, y: 0 };
    // Use inline vars if present; otherwise computed (keeps continuity).
    const sx = root.style.getPropertyValue('--axis-x');
    const sy = root.style.getPropertyValue('--axis-y');
    if (sx || sy) return { x: parsePx(sx, 0), y: parsePx(sy, 0) };
    const cs = getComputedStyle(root);
    return { x: parsePx(cs.getPropertyValue('--axis-x'), 0), y: parsePx(cs.getPropertyValue('--axis-y'), 0) };
  }

  function setAxis(root, x, y){
    if (!root) return;
    const nx = clampNum(Number(x), CFG.AXIS_X_MIN, CFG.AXIS_X_MAX);
    const ny = clampNum(Number(y), CFG.AXIS_Y_MIN, CFG.AXIS_Y_MAX);
    root.style.setProperty('--axis-x', `${Math.round(nx)}px`);
    root.style.setProperty('--axis-y', `${Math.round(ny)}px`);
  }

  function clampAxisToViewport(refs, x, y, opts = {}){
    const root = refs?.root;
    if (!root) return { x, y };
    const clampX = opts?.clampX !== false;
    const clampY = opts?.clampY !== false;

    // Apply proposed (so DOM reflects), then measure union (toggle + panel + aux).
    setAxis(root, x, y);

    const pad = CFG.PAD;
    const vw = Math.max(320, window.innerWidth || document.documentElement.clientWidth || 0);
    const vh = Math.max(320, window.innerHeight || document.documentElement.clientHeight || 0);

    const boxes = [];
    for (const el of [refs.toggle, refs.panel, refs.aux]) {
      if (!el || !el.isConnected) continue;
      try { boxes.push(el.getBoundingClientRect()); } catch {}
    }
    if (!boxes.length) return { x, y };

    const left = Math.min(...boxes.map(r => r.left));
    const right = Math.max(...boxes.map(r => r.right));
    const top = Math.min(...boxes.map(r => r.top));
    const bottom = Math.max(...boxes.map(r => r.bottom));

    let dx = 0, dy = 0;
    if (clampX) {
      if (left < pad) dx = pad - left;
      else if (right > (vw - pad)) dx = (vw - pad) - right;
    }
    if (clampY) {
      if (top < pad) dy = pad - top;
      else if (bottom > (vh - pad)) dy = (vh - pad) - bottom;
    }

    const nx = x + dx;
    const ny = y + dy;

    setAxis(root, nx, ny);
    return { x: nx, y: ny };
  }

  function persistAxis(x, y){
    writeJSON(keyAxis(), { axisX: Math.round(x), axisY: Math.round(y) });
  }

  function loadAxis(){
    const v = readJSON(keyAxis(), null);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const hasX = Object.prototype.hasOwnProperty.call(v, 'axisX');
    const hasY = Object.prototype.hasOwnProperty.call(v, 'axisY');
    if (!hasX && !hasY) return null;
    const axisX = parsePx(v.axisX, CFG.DEFAULT_AXIS_X);
    const axisY = parsePx(v.axisY, CFG.DEFAULT_AXIS_Y);
    return { axisX, axisY };
  }

  function migrateAxisOneStepRight(stepPx = 4){
    const markKey = keyAxisShiftMark();
    if (readStr(markKey, '0') === '1') return false;
    const raw = readJSON(keyAxis(), null);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      writeStr(markKey, '1');
      return false;
    }
    const curX = parsePx(raw.axisX, 0);
    const curY = parsePx(raw.axisY, 0);
    const nextX = Math.round(curX + stepPx);
    const nextY = Math.round(curY);
    writeJSON(keyAxis(), { axisX: nextX, axisY: nextY });
    writeStr(markKey, '1');
    return true;
  }

    function applyAxisFromDisk(refs){
    const root = refs?.root;
    if (!root) return false;
    const saved = CFG.RESET_AXIS_EACH_LOAD ? null : loadAxis();
    const seedX = Number.isFinite(saved?.axisX) ? saved.axisX : CFG.DEFAULT_AXIS_X;
    const seedY = Number.isFinite(saved?.axisY) ? saved.axisY : CFG.DEFAULT_AXIS_Y;
    const clamped = clampAxisToViewport(refs, seedX, seedY, { clampX: true, clampY: true });
    persistAxis(clamped.x, clamped.y);
    if (S) S.currentAxis = { x: clamped.x, y: clamped.y };
    return true;
  }

  // ───────────────────────────── Theme ─────────────────────────────

  function getTheme(root){
    const cur = String(root?.getAttribute?.(ATTR.CGXUI_THEME) || '').trim();
    return cur || 'stealth';
  }

  function setTheme(root, key){
    if (!root) return;
    const k = String(key || 'stealth').trim();
    root.setAttribute(ATTR.CGXUI_THEME, k);
    writeStr(keyTheme(), k);
  }

  function restoreTheme(refs){
    const root = refs?.root;
    if (!root) return false;
    const k = readStr(keyTheme(), 'stealth');
    setTheme(root, k);
    return true;
  }

  // ───────────────────────────── Size Preset ─────────────────────────────

  function getSizePreset(root){
    const cur = String(root?.getAttribute?.(ATTR.CGXUI_SIZE) || '').trim();
    return cur || readStr(keySize(), SIZE_DEFAULT) || SIZE_DEFAULT;
  }

  function applySizePreset(refs, key){
    const root = refs?.root;
    if (!root) return;
    const k = String(key || SIZE_DEFAULT).trim().toLowerCase();
    const pack = SIZE_PRESETS[k] || SIZE_PRESETS[SIZE_DEFAULT];
    for (const [varName, val] of Object.entries(pack)) {
      root.style.setProperty(varName, val);
    }
    root.setAttribute(ATTR.CGXUI_SIZE, k);
    writeStr(keySize(), k);
  }

  function restoreSizePreset(refs){
    const root = refs?.root;
    if (!root) return false;
    const k = readStr(keySize(), SIZE_DEFAULT);
    applySizePreset(refs, k);
    return true;
  }

  // ───────────────────────────── Opacity (fine) ─────────────────────────────

  function getOpacity(root){
    if (!root) return 0.62;
    const inline = parseFloat(String(root.style.getPropertyValue('--mm-btn-opacity') || '').trim());
    if (Number.isFinite(inline)) return clampNum(inline, CFG.OPACITY_MIN, CFG.OPACITY_MAX);
    const cs = getComputedStyle(root);
    const computed = parseFloat(String(cs.getPropertyValue('--mm-btn-opacity') || '').trim());
    if (Number.isFinite(computed)) return clampNum(computed, CFG.OPACITY_MIN, CFG.OPACITY_MAX);
    return 0.62;
  }

  function setOpacity(root, value, persist = true){
    if (!root) return;
    const v = clampNum(Number(value), CFG.OPACITY_MIN, CFG.OPACITY_MAX);
    root.style.setProperty('--mm-btn-opacity', String(v));
    root.style.setProperty('--mm-ctl-opacity', String(v));
    if (persist) writeStr(keyOpacity(), String(v));
  }

  function resetOpacityToTheme(refs, persist = true){
    const root = refs?.root;
    if (!root) return;
    root.style.removeProperty('--mm-btn-opacity');
    root.style.removeProperty('--mm-ctl-opacity');
    const base = getOpacity(root);
    setOpacity(root, base, persist);
  }

  function restoreOpacity(refs){
    const root = refs?.root;
    if (!root) return false;
    const raw = readStr(keyOpacity(), '');
    if (!raw) return false;
    const v = Number(raw);
    if (!Number.isFinite(v)) return false;
    setOpacity(root, v, false);
    return true;
  }

  function normalizePageLabelStyle(_value){
    return 'pill';
  }

  function normalizePageDividersEnabled(value, fallback = true){
    if (typeof value === 'boolean') return value;
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return !!fallback;
    if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'hidden' || raw === 'no') return false;
    if (raw === '1' || raw === 'true' || raw === 'on' || raw === 'show' || raw === 'yes') return true;
    return !!fallback;
  }

  function applyPageUiPrefsToRefs(refs, prefs = {}){
    const pageLabelStyle = 'pill';
    const pageDividersEnabled = normalizePageDividersEnabled(prefs?.pageDividersEnabled, true);
    const chatPageDividersEnabled = normalizePageDividersEnabled(prefs?.chatPageDividersEnabled, true);
    for (const el of [refs?.root, refs?.panel]) {
      if (!el) continue;
      try { el.setAttribute(ATTR_PAGE_LABEL_STYLE, pageLabelStyle); } catch {}
      try { el.setAttribute(ATTR_PAGE_DIVIDERS, pageDividersEnabled ? '1' : '0'); } catch {}
    }
    try { document.documentElement.setAttribute(ATTR_CHAT_PAGE_DIVIDERS, chatPageDividersEnabled ? '1' : '0'); } catch {}
    return { pageLabelStyle, pageDividersEnabled, chatPageDividersEnabled };
  }

  function getPageLabelStylePref(){
    return 'pill';
  }

  function getPageDividersEnabledPref(){
    try {
      const viaApi = coreApi()?.getMiniMapPageDividersEnabled?.();
      if (typeof viaApi === 'boolean') return viaApi;
    } catch {}
    return normalizePageDividersEnabled(readStr(keyPageDividers(), '1'), true);
  }

  function getChatPageDividersEnabledPref(){
    try {
      const viaApi = coreApi()?.getChatPageDividersEnabled?.();
      if (typeof viaApi === 'boolean') return viaApi;
    } catch {}
    return normalizePageDividersEnabled(readStr(keyChatPageDividers(), '1'), true);
  }

  function setPageLabelStylePref(refs, value){
    const next = 'pill';
    const api = coreApi();
    if (api && typeof api.setMiniMapPageLabelStyle === 'function') {
      try {
        api.setMiniMapPageLabelStyle(next, 'quick');
        return next;
      } catch {}
    }
    writeStr(keyPageLabelStyle(), next);
    applyPageUiPrefsToRefs(refs, {
      pageLabelStyle: next,
      pageDividersEnabled: getPageDividersEnabledPref(),
      chatPageDividersEnabled: getChatPageDividersEnabledPref(),
    });
    return next;
  }

  function setPageDividersEnabledPref(refs, value){
    const next = normalizePageDividersEnabled(value, true);
    const api = coreApi();
    if (api && typeof api.setMiniMapPageDividersEnabled === 'function') {
      try {
        api.setMiniMapPageDividersEnabled(next, 'quick');
        return next;
      } catch {}
    }
    writeStr(keyPageDividers(), next ? '1' : '0');
    applyPageUiPrefsToRefs(refs, {
      pageLabelStyle: getPageLabelStylePref(),
      pageDividersEnabled: next,
      chatPageDividersEnabled: getChatPageDividersEnabledPref(),
    });
    return next;
  }

  function setChatPageDividersEnabledPref(refs, value){
    const next = normalizePageDividersEnabled(value, true);
    const api = coreApi();
    if (api && typeof api.setChatPageDividersEnabled === 'function') {
      try {
        api.setChatPageDividersEnabled(next, 'quick');
        return next;
      } catch {}
    }
    writeStr(keyChatPageDividers(), next ? '1' : '0');
    applyPageUiPrefsToRefs(refs, {
      pageLabelStyle: getPageLabelStylePref(),
      pageDividersEnabled: getPageDividersEnabledPref(),
      chatPageDividersEnabled: next,
    });
    return next;
  }



  // ───────────────────────────── Popover UI ─────────────────────────────

  function buildPopover(){
    const pop = document.createElement('div');
    pop.setAttribute(ATTR.CGXUI_OWNER, SkID);
    pop.setAttribute(ATTR.CGXUI, UI.QUICK_POPO);
    pop.setAttribute('data-mmqc-layout', QUICK_POPO_LAYOUT);
    pop.setAttribute('data-mmqc-ver', QUICK_VER);
    pop.setAttribute('data-mmqc-instance', QUICK_INSTANCE_ID);
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'MiniMap Quick Controls');
    pop.innerHTML = `
      <div class="mmqc-hdr">
        <div class="mmqc-title">
          <span>⚡ Quick Controls</span>
          <span class="mmqc-help" title="Middle-click toggle · Shift = big nudge">ⓘ</span>
        </div>
        <button type="button" class="mmqc-close" aria-label="Close">✕</button>
      </div>

      <div class="mmqc-sec" data-sec="view">
        ${sectionLabel('🗺️', 'View', 'Switch between Classic, Q + A, and Branches view modes.')}
        <div class="mmqc-pills mmqc-pills-nowrap mmqc-pills-stretch">
          <button type="button" class="mmqc-pill" data-view="classic" aria-pressed="false"><span>◻️</span><span>Classic</span></button>
          <button type="button" class="mmqc-pill" data-view="qa" aria-pressed="false"><span>🧩</span><span>Q + A</span></button>
          <button type="button" class="mmqc-pill" data-view="branches" aria-pressed="false"><span>🌿</span><span>Branches</span></button>
        </div>
      </div>

      <div class="mmqc-div"></div>

      <div class="mmqc-sec" data-sec="position">
        ${sectionLabel('📍', 'Position', 'Use the arrows to nudge the MiniMap. Hold Shift while nudging to move it by a bigger step.')}
        <div class="mmqc-position-row">
          <button type="button" class="mmqc-btn mmqc-btn-dir" data-act="nudge_left"  aria-label="Nudge left">←</button>
          <button type="button" class="mmqc-btn mmqc-btn-dir" data-act="nudge_up"    aria-label="Nudge up">↑</button>
          <button type="button" class="mmqc-btn mmqc-btn-dir" data-act="nudge_down"  aria-label="Nudge down">↓</button>
          <button type="button" class="mmqc-btn mmqc-btn-dir" data-act="nudge_right" aria-label="Nudge right">→</button>
          <button type="button" class="mmqc-reset mmqc-reset-inline" data-act="reset_pos" aria-label="Reset position">
            <span class="mmqc-reset-ico" aria-hidden="true">⟲</span>
            <span class="mmqc-reset-txt">Reset</span>
          </button>
        </div>
      </div>

      <div class="mmqc-div"></div>

      <div class="mmqc-sec" data-sec="size">
        ${sectionLabel('📐', 'Size', 'Choose the MiniMap control size preset.')}
        <div class="mmqc-pills">
          <button type="button" class="mmqc-pill" data-size="s" aria-pressed="false"><span>📏</span><span>S</span></button>
          <button type="button" class="mmqc-pill" data-size="m" aria-pressed="false"><span>📐</span><span>M</span></button>
          <button type="button" class="mmqc-pill" data-size="l" aria-pressed="false"><span>📌</span><span>L</span></button>
        </div>
      </div>
      <div class="mmqc-div"></div>

      <div class="mmqc-sec" data-sec="theme">
        ${sectionLabel('🎨', 'Readability', 'Switch the MiniMap readability / contrast theme.')}
        <div class="mmqc-pills mmqc-pills-nowrap mmqc-pills-stretch">
          <button type="button" class="mmqc-pill" data-theme="stealth"   aria-pressed="false"><span>🕶️</span><span>Stealth</span></button>
          <button type="button" class="mmqc-pill" data-theme="readable"  aria-pressed="false"><span>👓</span><span>Readable</span></button>
          <button type="button" class="mmqc-pill" data-theme="contrast"  aria-pressed="false"><span>⚡</span><span>Hi-Contrast</span></button>
        </div>

      <div class="mmqc-div"></div>


      <div class="mmqc-sec" data-sec="opacity">
        ${sectionLabel('🫥', 'Opacity (fine)', 'Adjust MiniMap button opacity. Lower is stealthier; higher is more readable.')}
        <div class="mmqc-op">
          <div class="mmqc-op-line">
            <input
              type="range"
              class="mmqc-range"
              data-opacity-range
              min="${CFG.OPACITY_MIN}"
              max="${CFG.OPACITY_MAX}"
              step="${CFG.OPACITY_STEP}"
              value="0.62"
              aria-label="MiniMap buttons opacity"
            />
            <span class="mmqc-op-val" data-opacity-val>62%</span>
            <button type="button" class="mmqc-op-reset" data-act="reset_opacity" aria-label="Reset opacity to theme">Reset</button>
          </div>
        </div>
      </div>
      </div>

      <div class="mmqc-div"></div>

      ${pageDividersSectionHtml()}

      <div class="mmqc-div"></div>

      ${manualDividerSectionHtml()}
    `;
    return pop;
  }

  function ensurePopoverLayout(pop){
    if (!pop) return null;
    pop.setAttribute('data-mmqc-layout', QUICK_POPO_LAYOUT);
    pop.setAttribute('data-mmqc-ver', QUICK_VER);
    pop.setAttribute('data-mmqc-instance', QUICK_INSTANCE_ID);
    const positionSec = pop.querySelector?.('[data-sec="position"]') || null;

    if (!pop.querySelector?.('[data-sec="view"]')) {
      const wrap = document.createElement('div');
      wrap.innerHTML = `
        <div class="mmqc-sec" data-sec="view">
          ${sectionLabel('🗺️', 'View', 'Switch between Classic, Q + A, and Branches view modes.')}
          <div class="mmqc-pills mmqc-pills-nowrap mmqc-pills-stretch">
            <button type="button" class="mmqc-pill" data-view="classic" aria-pressed="false"><span>◻️</span><span>Classic</span></button>
            <button type="button" class="mmqc-pill" data-view="qa" aria-pressed="false"><span>🧩</span><span>Q + A</span></button>
            <button type="button" class="mmqc-pill" data-view="branches" aria-pressed="false"><span>🌿</span><span>Branches</span></button>
          </div>
        </div>
        <div class="mmqc-div"></div>
      `;
      const beforeNode = positionSec || pop.firstChild || null;
      const nodes = Array.from(wrap.childNodes);
      if (beforeNode) {
        for (const n of nodes) pop.insertBefore(n, beforeNode);
      } else {
        for (const n of nodes) pop.appendChild(n);
      }
    }

    const existingPagesSec = pop.querySelector?.('[data-sec="pages"]') || null;
    if (existingPagesSec) {
      const prev = existingPagesSec.previousElementSibling;
      const next = existingPagesSec.nextElementSibling;
      if (prev?.classList?.contains('mmqc-div')) prev.remove();
      if (next?.classList?.contains('mmqc-div')) next.remove();
      existingPagesSec.remove();
    }

    const existingDividerSec = pop.querySelector?.('[data-sec="divider"]') || null;
    if (existingDividerSec) {
      const prev = existingDividerSec.previousElementSibling;
      const next = existingDividerSec.nextElementSibling;
      if (!next && prev?.classList?.contains('mmqc-div')) prev.remove();
      if (next?.classList?.contains('mmqc-div')) next.remove();
      existingDividerSec.remove();
    }
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div class="mmqc-div"></div>${pageDividersSectionHtml()}<div class="mmqc-div"></div>${manualDividerSectionHtml()}`;
    for (const n of Array.from(wrap.childNodes)) pop.appendChild(n);
    return pop;
  }

  function positionPopover(pop, anchorEl){
    if (!pop || !anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const vw = Math.max(320, window.innerWidth || 0);
    const vh = Math.max(320, window.innerHeight || 0);

    // Prefer placing at the LEFT side of the minimap/panel.
    // If there is not enough room on the left, fallback to right side.
    const w = (pop.offsetWidth || CFG.POP_W || 236);
    const h = (pop.offsetHeight || 180);
    let left = Math.round(rect.left - CFG.POP_GAP - w);
    const canFitLeft = left >= CFG.PAD;
    if (!canFitLeft) left = Math.round(rect.right + CFG.POP_GAP);
    let top = Math.round(rect.top);

    if (left < CFG.PAD) left = CFG.PAD;
    if ((left + w) > (vw - CFG.PAD)) left = Math.max(CFG.PAD, vw - CFG.PAD - w);

    if ((top + h) > (vh - CFG.PAD)) top = Math.max(CFG.PAD, vh - CFG.PAD - h);
    if (top < CFG.PAD) top = CFG.PAD;

    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }

  function revealAndPositionPopover(pop, anchorEl){
    if (!pop || !anchorEl) return;
    const wasOpen = isOpen(pop);
    if (!wasOpen) {
      pop.style.visibility = 'hidden';
      setStateTok(pop, 'open', true);
    }
    positionPopover(pop, anchorEl);
    if (!wasOpen) {
      pop.style.visibility = '';
    }
  }

  function getPopoverAnchor(refs){
    if (refs?.panel) return refs.panel;
    return refs?.toggle || null;
  }

  function isCurrentPopover(pop){
    if (!pop?.isConnected) return false;
    const layout = String(pop.getAttribute('data-mmqc-layout') || '').trim();
    const ver = String(pop.getAttribute('data-mmqc-ver') || '').trim();
    const inst = String(pop.getAttribute('data-mmqc-instance') || '').trim();
    const hasViewSection = !!pop.querySelector?.('[data-sec="view"]');
    return hasViewSection && layout === QUICK_POPO_LAYOUT && ver === QUICK_VER && inst === QUICK_INSTANCE_ID;
  }

  function removeAllQuickPopovers(){
    const nodes = Array.from(document.querySelectorAll(`[${ATTR.CGXUI}="${UI.QUICK_POPO}"], [role="dialog"][aria-label="MiniMap Quick Controls"]`));
    const seen = new Set();
    for (const node of nodes) {
      if (!node || seen.has(node)) continue;
      seen.add(node);
      try { node.remove(); } catch {}
    }
  }

  function syncThemePills(pop, themeKey){
    const pills = Array.from(pop.querySelectorAll('.mmqc-pill[data-theme]'));
    for (const p of pills) {
      const k = String(p.getAttribute('data-theme') || '');
      p.setAttribute('aria-pressed', (k === themeKey) ? 'true' : 'false');
    }
  }

  function syncSizePills(pop, sizeKey){
    const pills = Array.from(pop.querySelectorAll('.mmqc-pill[data-size]'));
    for (const p of pills) {
      const k = String(p.getAttribute('data-size') || '');
      p.setAttribute('aria-pressed', (k === sizeKey) ? 'true' : 'false');
    }
  }

  function syncPageLabelStylePills(pop, style){
    const next = normalizePageLabelStyle(style);
    const pills = Array.from(pop.querySelectorAll('.mmqc-pill[data-page-label-style]'));
    for (const pill of pills) {
      const key = normalizePageLabelStyle(pill.getAttribute('data-page-label-style') || '');
      pill.setAttribute('aria-pressed', key === next ? 'true' : 'false');
    }
  }

  function syncPageDividerPills(pop, enabled){
    const next = normalizePageDividersEnabled(enabled, true) ? '1' : '0';
    const pills = Array.from(pop.querySelectorAll('.mmqc-pill[data-page-dividers]'));
    for (const pill of pills) {
      const key = normalizePageDividersEnabled(pill.getAttribute('data-page-dividers') || '1', true) ? '1' : '0';
      pill.setAttribute('aria-pressed', key === next ? 'true' : 'false');
    }
  }

  function syncChatPageDividerPills(pop, enabled){
    const next = normalizePageDividersEnabled(enabled, true) ? '1' : '0';
    const pills = Array.from(pop.querySelectorAll('.mmqc-pill[data-chat-page-dividers]'));
    for (const pill of pills) {
      const key = normalizePageDividersEnabled(pill.getAttribute('data-chat-page-dividers') || '1', true) ? '1' : '0';
      pill.setAttribute('aria-pressed', key === next ? 'true' : 'false');
    }
  }

  function getViewMode(refs){
    try {
      const viaUi = String(MM_ui()?.getViewMode?.() || '').trim();
      if (viaUi) return viaUi;
    } catch {}
    try {
      const viaPanel = String(refs?.panel?.getAttribute?.('data-cgxui-view') || '').trim();
      if (viaPanel) return viaPanel;
    } catch {}
    return 'classic';
  }

  function syncViewPills(pop, mode){
    const pills = Array.from(pop.querySelectorAll('.mmqc-pill[data-view]'));
    for (const p of pills) {
      const k = String(p.getAttribute('data-view') || '');
      p.setAttribute('aria-pressed', (k === mode) ? 'true' : 'false');
    }
  }

  function applyViewMode(refs, mode, source = 'quick'){
    let next = 'classic';
    try {
      next = String(MM_ui()?.setViewMode?.(mode, { source }) || '').trim() || 'classic';
    } catch {}
    try { refs?.panel?.setAttribute('data-cgxui-view', next); } catch {}
    return next;
  }

  function syncOpacityUI(pop, root){
    if (!pop || !root) return;
    const range = pop.querySelector('[data-opacity-range]');
    const valEl = pop.querySelector('[data-opacity-val]');
    const v = getOpacity(root);
    if (range) range.value = String(v);
    if (valEl) valEl.textContent = `${Math.round(v * 100)}%`;
  }

  function normalizeDividerStyle(value){
    const style = String(value || '').trim().toLowerCase();
    return DIVIDER_STYLES.includes(style) ? style : DIVIDER_STYLES[0];
  }

  function normalizeDividerColor(value, fallback = DIVIDER_DEFAULT_COLOR){
    const raw = String(value || '').trim().toLowerCase();
    if (/^#?[0-9a-f]{3}$/i.test(raw)) {
      const hex = raw.replace(/^#/, '');
      return `#${hex.split('').map((ch) => ch + ch).join('')}`;
    }
    if (/^#?[0-9a-f]{6}$/i.test(raw)) {
      return `#${raw.replace(/^#/, '')}`;
    }
    return String(fallback || DIVIDER_DEFAULT_COLOR).trim().toLowerCase();
  }

  function getDividerPresetColor(value, fallback = DIVIDER_DEFAULT_COLOR){
    const normalized = normalizeDividerColor(value, fallback);
    return DIVIDER_COLOR_PRESETS.find((preset) => preset.value === normalized)?.value
      || normalizeDividerColor(fallback, DIVIDER_DEFAULT_COLOR);
  }

  function coreApi(){
    try { return MM_coreApi() || getShared()?.api?.core || TOPW?.H2O?.MM?.mnmp?.api?.core || null; } catch { return null; }
  }

  function manualDividerEditorControls(pop){
    return {
      selectEl: pop?.querySelector?.('[data-divider-id]') || null,
      noteEl: pop?.querySelector?.('[data-divider-note]') || null,
      createBtn: pop?.querySelector?.('[data-act="divider_create"]') || null,
      removeBtn: pop?.querySelector?.('[data-act="divider_remove"]') || null,
    };
  }

  function getCurrentDividerStyle(pop){
    const active = pop?.querySelector?.('.mmqc-pill[data-divider-style][aria-pressed="true"]') || null;
    return normalizeDividerStyle(active?.getAttribute?.('data-divider-style') || '');
  }

  function setDividerStylePills(pop, style){
    const nextStyle = normalizeDividerStyle(style);
    const pills = Array.from(pop?.querySelectorAll?.('.mmqc-pill[data-divider-style]') || []);
    for (const pill of pills) {
      const key = normalizeDividerStyle(pill?.getAttribute?.('data-divider-style') || '');
      pill.setAttribute('aria-pressed', key === nextStyle ? 'true' : 'false');
    }
  }

  function getCurrentDividerColor(pop){
    const active = pop?.querySelector?.('.mmqc-pill[data-divider-color-preset][aria-pressed="true"]') || null;
    return getDividerPresetColor(active?.getAttribute?.('data-divider-color-preset') || DIVIDER_DEFAULT_COLOR, DIVIDER_DEFAULT_COLOR);
  }

  function setDividerColorPills(pop, color){
    const nextColor = getDividerPresetColor(color, DIVIDER_DEFAULT_COLOR);
    const pills = Array.from(pop?.querySelectorAll?.('.mmqc-pill[data-divider-color-preset]') || []);
    for (const pill of pills) {
      const key = getDividerPresetColor(pill?.getAttribute?.('data-divider-color-preset') || '', DIVIDER_DEFAULT_COLOR);
      pill.setAttribute('aria-pressed', key === nextColor ? 'true' : 'false');
    }
  }

  function getCurrentDividerId(pop){
    return String(pop?.querySelector?.('[data-divider-id]')?.value || '').trim();
  }

  // Manual divider editor wiring prefers normalized manualDivider names while
  // remaining compatible with older MiniDivider Core APIs.
  function manualDividerList(api){
    const items = api?.getManualDividers?.() || api?.getMiniDividers?.() || [];
    return Array.isArray(items) ? items.slice() : [];
  }

  function getSelectedManualDividerId(api){
    return String(api?.getSelectedManualDividerId?.() || api?.getSelectedMiniDividerId?.() || '').trim();
  }

  function getManualDividerById(api, manualDividerId){
    const id = String(manualDividerId || '').trim();
    if (!id) return null;
    return api?.getManualDividerById?.(id) || api?.getMiniDividerById?.(id) || null;
  }

  function selectManualDivider(api, manualDividerId, source = 'quick:select'){
    const id = String(manualDividerId || '').trim();
    if (!api || !id) return false;
    const fn = api.selectManualDivider || api.selectMiniDivider;
    if (typeof fn !== 'function') return false;
    try {
      fn.call(api, id, '', String(source || 'quick:select'));
      return true;
    } catch {
      return false;
    }
  }

  function upsertManualDivider(api, record = {}){
    if (!api) return null;
    const fn = api.upsertManualDivider || api.upsertMiniDivider;
    if (typeof fn !== 'function') return null;
    try { return fn.call(api, record) || null; } catch { return null; }
  }

  function createManualDivider(api, record = {}){
    if (!api) return null;
    const fn = api.createManualDivider || api.createMiniDivider;
    if (typeof fn !== 'function') return null;
    try { return fn.call(api, record) || null; } catch { return null; }
  }

  function removeManualDividerById(api, manualDividerId){
    const id = String(manualDividerId || '').trim();
    if (!api || !id) return null;
    const fn = api.removeManualDividerById || api.removeMiniDividerById;
    if (typeof fn !== 'function') return null;
    try { return fn.call(api, id) || null; } catch { return null; }
  }

  function syncDividerSelectOptions(selectEl, items, selectedId){
    if (!selectEl) return;
    const list = Array.isArray(items) ? items : [];
    const nextId = String(selectedId || '').trim();
    selectEl.textContent = '';
    if (!list.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No dividers yet';
      selectEl.appendChild(opt);
      selectEl.value = '';
      return;
    }
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i] || null;
      const opt = document.createElement('option');
      opt.value = String(item?.id || '').trim();
      opt.textContent = `Divider ${i + 1}`;
      selectEl.appendChild(opt);
    }
    selectEl.value = list.some((item) => String(item?.id || '').trim() === nextId)
      ? nextId
      : String(list[0]?.id || '').trim();
  }

  function syncDividerEditor(pop, refs, opts = {}){
    if (!pop) return;
    const { selectEl, noteEl, createBtn, removeBtn } = manualDividerEditorControls(pop);
    if (!selectEl || !noteEl || !createBtn || !removeBtn) return;
    const stylePills = Array.from(pop.querySelectorAll('.mmqc-pill[data-divider-style]'));
    const colorPills = Array.from(pop.querySelectorAll('.mmqc-pill[data-divider-color-preset]'));

    const api = coreApi();
    const items = manualDividerList(api);
    const draftStyle = opts.preserveDraft ? getCurrentDividerStyle(pop) : DIVIDER_STYLES[0];
    const draftColor = opts.preserveDraft ? getCurrentDividerColor(pop) : DIVIDER_DEFAULT_COLOR;
    let selectedId = String(opts.selectedId || '').trim();
    if (!selectedId) selectedId = getSelectedManualDividerId(api);
    if (!selectedId) selectedId = String(selectEl.value || '').trim();
    if (selectedId && !items.some((item) => String(item?.id || '').trim() === selectedId)) selectedId = '';

    syncDividerSelectOptions(selectEl, items, selectedId);
    selectedId = getCurrentDividerId(pop);

    if (api && items.length && !getSelectedManualDividerId(api) && selectedId) {
      selectManualDivider(api, selectedId, 'quick:default');
    }

    const selected = selectedId ? (getManualDividerById(api, selectedId) || items.find((item) => String(item?.id || '').trim() === selectedId) || null) : null;
    const style = selected?.style || draftStyle || DIVIDER_STYLES[0];
    const color = getDividerPresetColor(selected?.color || draftColor || DIVIDER_DEFAULT_COLOR, DIVIDER_DEFAULT_COLOR);

    selectEl.disabled = !api || !items.length;
    for (const pill of stylePills) pill.disabled = !api;
    for (const pill of colorPills) pill.disabled = !api;
    createBtn.disabled = !api;
    removeBtn.disabled = !selected;
    createBtn.textContent = '+';
    removeBtn.textContent = '-';

    setDividerStylePills(pop, style);
    setDividerColorPills(pop, color);

    if (!api) {
      noteEl.textContent = 'MiniMap Core required.';
      return;
    }
    if (selected) {
      noteEl.textContent = 'Drag on MiniMap.';
      return;
    }
    if (items.length) {
      noteEl.textContent = 'Select or create.';
      return;
    }
    noteEl.textContent = 'Create, then drag.';
  }

  function updateSelectedDividerFromPopover(pop, refs, patch = {}){
    const api = coreApi();
    const manualDividerId = getCurrentDividerId(pop);
    if (!api || !manualDividerId) return false;
    const existing = getManualDividerById(api, manualDividerId) || null;
    if (!existing) return false;
    const result = upsertManualDivider(api, Object.assign({}, existing, patch, { id: manualDividerId })) || null;
    syncDividerEditor(pop, refs, { preserveDraft: true, selectedId: manualDividerId });
    return !!result?.ok;
  }

  function createDividerFromPopover(pop, refs){
    const api = coreApi();
    if (!api) return false;
    const result = createManualDivider(api, {
      style: getCurrentDividerStyle(pop),
      color: getCurrentDividerColor(pop),
    }) || null;
    const nextId = String(result?.item?.id || result?.manualDivider?.id || '').trim();
    if (nextId) {
      selectManualDivider(api, nextId, 'quick:create');
    }
    syncDividerEditor(pop, refs, { preserveDraft: true, selectedId: nextId });
    return !!result?.ok;
  }

  function removeSelectedDividerFromPopover(pop, refs){
    const api = coreApi();
    const manualDividerId = getCurrentDividerId(pop);
    if (!api || !manualDividerId) return false;
    const result = removeManualDividerById(api, manualDividerId) || null;
    syncDividerEditor(pop, refs, { preserveDraft: true });
    return !!result?.ok;
  }

  // ───────────────────────────── Actions ─────────────────────────────

  function doNudge(refs, dx, dy){
    const root = refs?.root;
    if (!root) return;
    const cur = S.currentAxis || getAxis(root);
    const targetX = cur.x + dx;
    const targetY = cur.y + dy;

    // Allow free horizontal movement when configured; keep vertical safety clamping.
    const clampX = CFG.CLAMP_X_ON_MANUAL_NUDGE !== false;
    const next = clampAxisToViewport(refs, targetX, targetY, { clampX, clampY: true });
    persistAxis(next.x, next.y);
    S.currentAxis = { x: next.x, y: next.y };
  }

  function doReset(refs){
    const root = refs?.root;
    if (!root) return;
    const bx = CFG.DEFAULT_AXIS_X;
    const by = CFG.DEFAULT_AXIS_Y;
    setAxis(root, bx, by);
    persistAxis(bx, by);
    S.currentAxis = { x: bx, y: by };
  }

  // ───────────────────────────── Boot / Mount ─────────────────────────────

  const S = {
    tries: 0,
    booted: false,
    off: [],
    pop: null,
    currentAxis: null,
  };
  let activeAuxClickPerf = null;

  function auxClickPerfState(){
    return ensureMiniMapQuickControlsPerfStateShape(PERF).auxClick;
  }

  function recordAuxClickBranch(label, msRaw){
    if (!activeAuxClickPerf || !label) return 0;
    return recordDuration(ensureDurationBucketMapEntry(auxClickPerfState().branches, label), msRaw);
  }

  function setAuxClickPrimaryAction(type){
    const next = String(type || '').trim() || 'noOp';
    if (!activeAuxClickPerf) return next;
    if (!activeAuxClickPerf.actionType || activeAuxClickPerf.actionType === 'noOp') {
      activeAuxClickPerf.actionType = next;
    }
    return activeAuxClickPerf.actionType;
  }

  function isActiveInstance(){
    try { return TOPW.H2O_MM_QUICK_ACTIVE_INSTANCE === QUICK_INSTANCE_ID; } catch { return true; }
  }

  function teardown(opts = {}){
    for (const off of S.off.splice(0)) {
      try { off(); } catch {}
    }
    try { S.pop?.remove?.(); } catch {}
    S.pop = null;
    S.booted = false;
    if (opts.keepGlobals === true) return;
    try {
      if (TOPW.H2O_MM_QUICK_CLEANUP === teardown) TOPW.H2O_MM_QUICK_CLEANUP = null;
    } catch {}
    try {
      if (TOPW.H2O_MM_QUICK_ACTIVE_INSTANCE === QUICK_INSTANCE_ID) TOPW.H2O_MM_QUICK_ACTIVE_INSTANCE = null;
    } catch {}
  }

  function claimActiveInstance(){
    try {
      const prev = TOPW.H2O_MM_QUICK_CLEANUP;
      if (typeof prev === 'function' && prev !== teardown) {
        try { prev({ reason: 'replaced', by: QUICK_INSTANCE_ID }); } catch {}
      }
    } catch {}
    try { TOPW.H2O_MM_QUICK_ACTIVE_INSTANCE = QUICK_INSTANCE_ID; } catch {}
    try { TOPW.H2O_MM_QUICK_CLEANUP = teardown; } catch {}
  }

    function bindPopoverEvents(pop){
    const closeBtn = pop?.querySelector?.('.mmqc-close') || null;
    on(closeBtn, 'click', (e) => {
      if (!isActiveInstance()) return;
      e.preventDefault();
      e.stopPropagation();
      closePopover();
    }, { passive: false });

    on(pop, 'click', (e) => {
      if (!isActiveInstance()) return;
      const t = e.target;
      const act = t?.closest?.('[data-act]')?.getAttribute?.('data-act') || '';
      const theme = t?.closest?.('[data-theme]')?.getAttribute?.('data-theme') || '';
      const size = t?.closest?.('[data-size]')?.getAttribute?.('data-size') || '';
      const view = t?.closest?.('[data-view]')?.getAttribute?.('data-view') || '';
      const pageLabelStyle = t?.closest?.('[data-page-label-style]')?.getAttribute?.('data-page-label-style') || '';
      const pageDividers = t?.closest?.('[data-page-dividers]')?.getAttribute?.('data-page-dividers') || '';
      const chatPageDividers = t?.closest?.('[data-chat-page-dividers]')?.getAttribute?.('data-chat-page-dividers') || '';
      const dividerStyle = t?.closest?.('[data-divider-style]')?.getAttribute?.('data-divider-style') || '';
      const dividerColor = t?.closest?.('[data-divider-color-preset]')?.getAttribute?.('data-divider-color-preset') || '';
      const refs2 = getRefs();

      if (act) {
        e.preventDefault(); e.stopPropagation();
        const shift = !!e.shiftKey;
        const step = shift ? CFG.NUDGE_STEP_SHIFT : CFG.NUDGE_STEP;
        switch (act) {
          case 'nudge_left':  return doNudge(refs2, -step, 0);
          case 'nudge_right': return doNudge(refs2, +step, 0);
          case 'nudge_up':    return doNudge(refs2, 0, -step);
          case 'nudge_down':  return doNudge(refs2, 0, +step);
          case 'reset_pos':   return doReset(refs2);
          case 'reset_opacity':
            resetOpacityToTheme(refs2, true);
            return syncOpacityUI(S.pop, refs2.root);
          case 'divider_create':
            return createDividerFromPopover(S.pop, refs2);
          case 'divider_remove':
            return removeSelectedDividerFromPopover(S.pop, refs2);
        }
      }
      if (size) {
        e.preventDefault(); e.stopPropagation();
        applySizePreset(refs2, size);
        syncSizePills(S.pop, size);
        return;
      }

      if (view) {
        e.preventDefault(); e.stopPropagation();
        const next = applyViewMode(refs2, view, 'quick');
        syncViewPills(S.pop, next);
        return;
      }

      if (pageLabelStyle) {
        e.preventDefault(); e.stopPropagation();
        const next = setPageLabelStylePref(refs2, pageLabelStyle);
        syncPageLabelStylePills(S.pop, next);
        return;
      }

      if (pageDividers) {
        e.preventDefault(); e.stopPropagation();
        const next = setPageDividersEnabledPref(refs2, pageDividers);
        syncPageDividerPills(S.pop, next);
        return;
      }

      if (chatPageDividers) {
        e.preventDefault(); e.stopPropagation();
        const next = setChatPageDividersEnabledPref(refs2, chatPageDividers);
        syncChatPageDividerPills(S.pop, next);
        return;
      }

      if (dividerStyle) {
        e.preventDefault(); e.stopPropagation();
        setDividerStylePills(S.pop, dividerStyle);
        if (getCurrentDividerId(S.pop)) {
          updateSelectedDividerFromPopover(S.pop, refs2, { style: dividerStyle });
        }
        return;
      }

      if (dividerColor) {
        e.preventDefault(); e.stopPropagation();
        const color = getDividerPresetColor(dividerColor, DIVIDER_DEFAULT_COLOR);
        setDividerColorPills(S.pop, color);
        if (getCurrentDividerId(S.pop)) {
          updateSelectedDividerFromPopover(S.pop, refs2, { color });
        } else {
          syncDividerEditor(S.pop, refs2, { preserveDraft: true });
        }
        return;
      }

      if (theme) {
        e.preventDefault(); e.stopPropagation();
        setTheme(refs2.root, theme);
        resetOpacityToTheme(refs2, true);
        syncThemePills(S.pop, theme);
        syncOpacityUI(S.pop, refs2.root);
        return;
      }
    }, { passive: false });

    on(pop, 'input', (e) => {
      if (!isActiveInstance()) return;
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      if (!t.matches?.('[data-opacity-range]')) return;
      const refs2 = getRefs();
      if (!refs2?.root) return;
      setOpacity(refs2.root, Number(t.value), true);
      syncOpacityUI(S.pop, refs2.root);
      return;
    }, { passive: true });

    on(pop, 'change', (e) => {
      if (!isActiveInstance()) return;
      const t = e.target;
      if (!(t instanceof HTMLSelectElement)) return;
      if (!t.matches?.('[data-divider-id]')) return;
      const manualDividerId = String(t.value || '').trim();
      selectManualDivider(coreApi(), manualDividerId, 'quick:select');
      syncDividerEditor(S.pop, getRefs(), { preserveDraft: true, selectedId: manualDividerId });
    }, { passive: true });
  }

  function buildFreshPopover(){
    removeAllQuickPopovers();
    const pop = ensurePopoverLayout(buildPopover());
    document.body.appendChild(pop);
    bindPopoverEvents(pop);
    S.pop = pop;
    return pop;
  }

  function ensureCurrentPopover(){
    if (isCurrentPopover(S.pop)) return S.pop;
    return buildFreshPopover();
  }

  function on(target, ev, fn, opts){
    if (!target || !target.addEventListener) return () => {};
    target.addEventListener(ev, fn, opts);
    const off = () => { try { target.removeEventListener(ev, fn, opts); } catch {} };
    S.off.push(off);
    return off;
  }

  function closePopover(){
    if (!isActiveInstance()) return;
    if (!S.pop?.isConnected) return;
    setStateTok(S.pop, 'open', false);
  }

  function openPopover(refs){
    if (!isActiveInstance()) return;
    const pop = ensureCurrentPopover();
    if (!pop) return;
    if (refs?.root) setOpacity(refs.root, getOpacity(refs.root), false);
    const anchor = getPopoverAnchor(refs);
    if (!anchor) {
      if (activeAuxClickPerf) {
        const branchT0 = perfNow();
        recordAuxClickBranch('openPopover:noAnchor', perfNow() - branchT0);
      }
      return;
    }
    if (activeAuxClickPerf) setAuxClickPrimaryAction('menuOpen');
    const themeKey = getTheme(refs?.root);
    const sizeKey = getSizePreset(refs?.root);
    const viewKey = getViewMode(refs);
    const pageLabelStyle = getPageLabelStylePref();
    const pageDividersEnabled = getPageDividersEnabledPref();
    const chatPageDividersEnabled = getChatPageDividersEnabledPref();
    syncThemePills(pop, themeKey);
    syncSizePills(pop, sizeKey);
    syncViewPills(pop, viewKey);
    syncPageLabelStylePills(pop, pageLabelStyle);
    syncPageDividerPills(pop, pageDividersEnabled);
    syncChatPageDividerPills(pop, chatPageDividersEnabled);
    syncOpacityUI(pop, refs?.root);
    if (activeAuxClickPerf) {
      const branchT0 = perfNow();
      syncDividerEditor(pop, refs, { preserveDraft: false });
      recordAuxClickBranch('openPopover:syncDividerEditor', perfNow() - branchT0);
    } else {
      syncDividerEditor(pop, refs, { preserveDraft: false });
    }
    if (activeAuxClickPerf) {
      const branchT0 = perfNow();
      revealAndPositionPopover(pop, anchor);
      recordAuxClickBranch('openPopover:revealAndPosition', perfNow() - branchT0);
    } else {
      revealAndPositionPopover(pop, anchor);
    }
  }

  function togglePopover(refs){
    if (!isActiveInstance()) return;
    const pop = ensureCurrentPopover();
    if (!pop) return;
    if (isOpen(pop)) {
      const branchT0 = activeAuxClickPerf ? perfNow() : 0;
      setAuxClickPrimaryAction('menuClose');
      closePopover();
      if (branchT0) recordAuxClickBranch('togglePopover:close', perfNow() - branchT0);
      return;
    }
    const branchT0 = activeAuxClickPerf ? perfNow() : 0;
    openPopover(refs);
    if (branchT0) recordAuxClickBranch('togglePopover:open', perfNow() - branchT0);
  }

  function mountOnce(){
    if (S.booted) return true;

    const refs = getRefs();
    if (!refs.root || !refs.toggle) return false;

    claimActiveInstance();
    ensureStyle();

    // Ensure persisted prefs restored
    if (!CFG.RESET_AXIS_EACH_LOAD) {
      migrateAxisOneStepRight(CFG.NUDGE_STEP * 2);
    }
    restoreTheme(refs);
    restoreSizePreset(refs);
    restoreOpacity(refs);
    applyPageUiPrefsToRefs(refs, {
      pageLabelStyle: getPageLabelStylePref(),
      pageDividersEnabled: getPageDividersEnabledPref(),
      chatPageDividersEnabled: getChatPageDividersEnabledPref(),
    });
    applyAxisFromDisk(refs);
    S.currentAxis = getAxis(refs.root);

    // Always rebuild the popup DOM for the active script instance.
    // This prevents an older singleton popover from surviving userscript updates.
    ensureCurrentPopover();

    // Middle-click on TOGGLE opens menu (no extra buttons).
    // 1) Prevent browser autoscroll on middle mouse down over the toggle.
    on(refs.toggle, 'mousedown', (e) => {
      if (e.button === 1) { e.preventDefault(); }
    }, { passive: false });

    // 2) Use auxclick to detect middle click reliably.
    on(refs.toggle, 'auxclick', (e) => {
      const perfT0 = perfNow();
      const controlId = String(refs.toggle?.getAttribute?.(ATTR.CGXUI) || UI.TOGGLE || 'unknown').trim() || 'unknown';
      const controlType = e?.__h2oBehaviorSyntheticQuick === true ? 'toggleSynthetic' : (refs.toggle ? 'toggle' : 'unknown');
      activeAuxClickPerf = {
        actionType: 'noOp',
        controlId,
        controlType,
      };
      try {
        if (e.button !== 1) {
          recordAuxClickBranch('toggleAuxclick:nonMiddle', perfNow() - perfT0);
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        togglePopover(getRefs());
      } finally {
        const perfBucket = auxClickPerfState();
        const totalMs = perfNow() - perfT0;
        const actionType = String(activeAuxClickPerf?.actionType || 'noOp');
        recordDuration(perfBucket, totalMs);
        perfBucket.lastAt = Date.now();
        perfBucket.lastControlId = controlId;
        perfBucket.lastActionType = actionType;
        recordDuration(ensureDurationBucketMapEntry(perfBucket.controlType, controlType), totalMs);
        recordDuration(ensureDurationBucketMapEntry(perfBucket.actionType, actionType), totalMs);
        activeAuxClickPerf = null;
      }
    }, { passive: false });

    // Click outside closes
    on(window, 'pointerdown', (e) => {
      if (!isActiveInstance()) return;
      if (!isOpen(S.pop)) return;
      const t = e.target;
      if (t?.closest?.(SEL.QUICK_POPO)) return;
      if (t?.closest?.(SEL.TOGGLE)) return; // keep open if interacting with toggle
      closePopover();
    }, true);

    // Esc closes
    on(window, 'keydown', (e) => {
      if (!isActiveInstance()) return;
      if (e.key === 'Escape' && isOpen(S.pop)) closePopover();
    }, true);

    // Re-clamp on resize
    on(window, 'resize', () => {
      if (!isActiveInstance()) return;
      const r = getRefs();
      const cur = S.currentAxis || getAxis(r.root);
      const sx = Number.isFinite(cur?.x) ? cur.x : CFG.DEFAULT_AXIS_X;
      const sy = Number.isFinite(cur?.y) ? cur.y : CFG.DEFAULT_AXIS_Y;
      const clamped = clampAxisToViewport(r, sx, sy, { clampX: true, clampY: true });
      persistAxis(clamped.x, clamped.y);
      S.currentAxis = { x: clamped.x, y: clamped.y };
      if (isOpen(S.pop)) positionPopover(S.pop, getPopoverAnchor(r));
    }, { passive: true });

    on(window, EV_DIVIDER_SELECTED, () => {
      if (!isActiveInstance()) return;
      if (!S.pop?.isConnected) return;
      syncDividerEditor(S.pop, getRefs(), { preserveDraft: true });
    }, { passive: true });

    on(window, EV_DIVIDER_CHANGED, () => {
      if (!isActiveInstance()) return;
      if (!S.pop?.isConnected) return;
      syncDividerEditor(S.pop, getRefs(), { preserveDraft: true });
    }, { passive: true });

    S.booted = true;
    try { TOPW.H2O_MM_QUICK_ACTIVE_INSTANCE = QUICK_INSTANCE_ID; } catch {}
    try { TOPW.H2O_MM_QUICK_CLEANUP = teardown; } catch {}
    try { TOPW.H2O_MM_QUICK_READY = true; } catch {}
    try { window.dispatchEvent(new CustomEvent(EV_QUICK_READY, { detail: { ver: QUICK_VER } })); } catch {}
    try { window.dispatchEvent(new CustomEvent(EV_QUICK_READY.replace(/^evt:/, ''), { detail: { ver: QUICK_VER } })); } catch {}
    log('Ready.', { ver: QUICK_VER });
    return true;
  }

  function boot(){
    if (mountOnce()) return;
    S.tries++;
    if (S.tries >= CFG.BOOT_TRIES) {
      warn('UI not ready; Quick Controls idle.', { tries: S.tries });
      return;
    }
    setTimeout(boot, CFG.BOOT_GAP_MS);
  }

  boot();
})();
