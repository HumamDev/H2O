// ==UserScript==
// @name         0Z1.⬛️🕹️ Control Hub 🕹️
// @namespace    H2O.Prime.CGX.ControlHub
// @version      3.4.11
// @description  Liquid-glass cockpit to toggle MiniMap, Highlighter, etc. Uses window.h2oConfig.features.
// @author       HumamDev
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  try {

  /* ───────────────────────────── ⬜️ DEFINE — META / BOOTSTRAP 📄🔒💧 ───────────────────────────── */

  const W = window;
  const D = document;

  // ✅ LOCKED identity (Control Hub)
  const TOK  = 'CH';
  const PID  = 'cntrlhb';
  const BrID = PID;
  const DsID = PID;
  const CID  = 'chub';
  const SkID = 'cnhb';

  const MODTAG = 'CtrlHub';
  const MODICON = '🕹️';
  const EMOJI_HDR = 'ON';

  const SUITE = 'prm';
  const HOST  = 'cgx';

  const PID_UP = PID.toUpperCase();
  const CID_UP = CID.toUpperCase();

  // H2O vault
  const H2O = (W.H2O = W.H2O || {});
  const MOD_OBJ = ((H2O[TOK] = H2O[TOK] || {})[BrID] = (H2O[TOK][BrID] || {}));

  MOD_OBJ.meta = MOD_OBJ.meta || {
    tok: TOK, pid: PID, brid: BrID, dsid: DsID, skid: SkID, cid: CID_UP, modtag: MODTAG, suite: SUITE, host: HOST,
  };

  // DIAG (bounded)
  MOD_OBJ.diag = MOD_OBJ.diag || { t0: performance.now(), steps: [], errors: [], bufMax: 160, errMax: 30 };
  const DIAG = MOD_OBJ.diag;

  // optional ecosystem registries (MODE B: warn + keep first)
  H2O.KEYS = H2O.KEYS || {};
  H2O.EV   = H2O.EV   || {};
  H2O.SEL  = H2O.SEL  || {};
  H2O.UI   = H2O.UI   || {};

  /* ───────────────────────────── ⬛️ DEFINE — CONFIG / CONSTANTS 📄🔒💧 ───────────────────────────── */

const CFG_CH = {
  /* ===================== 🎛️ Control Hub — TUNING KEYS =====================
   * Change values below to tune size, scrolling, colors, and blur.
   * Keys marked with 👈 are the ones you'll tweak most often.
   * ====================================================================== */
  BACKDROP_Z: 2147483659,
  PANEL_Z: 2147483679,

  // ── Size / Layout tuning (UI) ─────────────────────────────
  PANEL_TOP_PCT: 50,          // % : vertical anchor of panel (44→50 centers it)
    PANEL_W_VW: 72,             // vw: width cap (was 68vw)
  PANEL_MAX_H_VH: 92,         // vh: overall panel max height (was 70vh)
  PANEL_MAX_H_PX: 900,        // px: overall panel max height cap (was 620px)

  MAIN_MAX_H_VH: 88,          // vh: inner grid max height (keep <= PANEL_MAX_H_VH)
  LIST_PAD_RIGHT_PX: 12,      // px: right padding so scrollbar doesn’t overlay content 👈

  // ── Width / Height fine tuning (advanced) ─────────────────
  PANEL_W_PX: 900,            // px: hard width cap before vw applies 👈            // px: hard width cap before vw applies 👈
  PANEL_MIN_W_PX: 540,        // px: minimum usable width on small screens
  PANEL_LEFT_PCT: 50,         // % : horizontal anchor (usually keep 50)
  BACKDROP_BLUR_PX: 2,       // px: background blur when hub is open 👈

  // ── Hub background tuning ─────────────────────────────────
  HUB_BG_A: 'rgba(255,255,255,0.04)',    // base gradient A 👈
  HUB_BG_B: 'rgba(255,255,255,0.04)',    // base gradient B 👈
  HUB_TINT_A: 'rgba(255,255,255,0.04)', // top-left tint 👈
  HUB_TINT_B: 'rgba(255,255,255,0.04)', // bottom-right tint 👈

  // ── Self-heal / recovery ──────────────────────────────────
  BUTTON_REPAIR_MS: 900,
};


  const EV_SECTION_BANDS_AUTO = 'h2o:section-bands:auto-mode';
  const FEATURE_KEY_SECTION_BANDS = 'sectionBands';

  // ATTR_ (real attribute-name strings)
  const ATTR_TESTID     = 'data-testid';
  const ATTR_ROLE       = 'role';
  const ATTR_CGXUI      = 'data-cgxui';
  const ATTR_CGXUI_OWNER= 'data-cgxui-owner';
  const ATTR_CGXUI_STATE= 'data-cgxui-state';
  const ATTR_CGXUI_KEY  = 'data-cgxui-key';
  const ATTR_CGXUI_MODE = 'data-cgxui-mode';
  const ATTR_CGXUI_ORDER= 'data-cgxui-order';
  const ATTR_CHUB_ART   = 'data-h2o-chub-artifact';

  // Namespaces (boundary-only)
  const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`;    // no trailing ":"
  const NS_EV   = `h2o.ev:${SUITE}:${HOST}:${DsID}`; // no trailing ":"

  // Disk keys (contract-compliant)
  const KEY_CHUB_STATE_HUB_V1 = `${NS_DISK}:state:hub:v1`;
  const KEY_CHUB_CFG_UI_V1    = `${NS_DISK}:cfg:ui:v1`;
  const KEY_CHUB_MIG_HUB_V1   = `${NS_DISK}:migrate:hub:v1`;
  const KEY_CHUB_FEATCAT_V1   = `${NS_DISK}:state:featcat:v1`;

  // Legacy disk key (read-only migration)
  const KEY_LEGACY_HO_HUB_V2 = 'ho:controlhub:v2';

  // EV_ (defined; not required to be emitted in Stage 1)
  const EV_CHUB_READY_V1   = `${NS_EV}:ready:v1`;
  const EV_CHUB_CHANGED_V1 = `${NS_EV}:changed:v1`;
  const EV_CHUB_NAV_LEG    = 'ho:navigate';
  const EV_CHUB_NAV_CANON  = 'evt:h2o:navigate';
  const EV_PM_READY_V1      = 'evt:h2o:pm:ready:v1';

  // UI tokens (SkID-based values)
  const UI_CHUB_TOPBTN   = `${SkID}-topbtn`;
  const UI_CHUB_BACKDROP = `${SkID}-backdrop`;
  const UI_CHUB_PANEL    = `${SkID}-panel`;
  const UI_CHUB_DOCK     = `${SkID}-dock`;
  const UI_CHUB_BTN      = UI_CHUB_TOPBTN; // plugin/compat alias

  // CSS ids (cgxui- namespace)
  const CSS_CHUB_STYLE_ID    = `cgxui-${SkID}-style`;

  // Light class prefix (owned only; cgxui namespace)
  const CLS = `cgxui-${SkID}`;

  // Modes + meta
  const MODES = ['default', 'focus', 'review', 'performance'];

  // Feature categories (left rail filter)
  const CAT_ALL = 'all';
  const CAT_NAV = 'nav';
  const CAT_MARK = 'mark';
  const CAT_SAVE = 'save';
  const CAT_PERF = 'perf';

  const FEATURE_CATS = [
    { id: CAT_ALL,  label: 'All' },
    { id: CAT_NAV,  label: 'Navigate' },
    { id: CAT_MARK, label: 'Mark & Read' },
    { id: CAT_SAVE, label: 'Save & Sync' },
    { id: CAT_PERF, label: 'Performance & Look' },
  ];

  const FEATURE_META = [
{ key:'data',              label:'Data',                icon:'🗄️',
      subtitle:'Store, backup, and archive utilities.',
      description:{default:'Browse and export H2O Data backups.', focus:'Keep the latest snapshot close while reviewing.', review:'Snapshot long chats for later reference.', performance:'Lightweight exports that stay out of the way.'}},
    { key:'minimap',           label:'Mini Map',           icon:'🗺️',
      subtitle:'Sidebar MiniMap + answer map + nav buttons.',
      description:{default:'Balanced navigation.', focus:'Emphasize current answer.', review:'Scan long chats fast.', performance:'Fewer effects for speed.'}},
    { key:'questions',         label:'Questions',          icon:'❓',
      subtitle:'Question bubble tools (QWrap, etc).',
      description:{default:'Control question UI behaviors (quote bubble position).', focus:'Keep questions compact and readable.', review:'Make quoted context easier to scan.', performance:'Minimal DOM changes for speed.'}},
    { key:'marginAnchor',      label:'Margin Anchor',      icon:'📍',
      subtitle:'Left-margin pins, notes, and status dots.',
      description:{default:'Quickly jump to any margin pin.', focus:'Surface active notes and anchors.', review:'Keep reference marks visible during longer reads.', performance:'Keep anchors lightweight.'}},
    { key:'dockPanel',         label:'Dock Panel',         icon:'🎖️',
      subtitle:'Docked sidebar with tabs + side-panel controls.',
      description:{
        default:'Dock context, tabs, and side-panel controls.',
        focus:'Lean dock layouts with minimal side-panel clutter.',
        review:'Highlight nav tabs while keeping the side panel tidy.',
        performance:'Lazy tab rendering and light side-panel updates.',
      }},
    { key:'inlineHighlighter', label:'Highlighter',        icon:'🖌️',
      subtitle:'Sentence-level highlights and inline tools.',
      description:{default:'Standard palette + shortcuts.', focus:'Stronger emphasis colors.', review:'Mark summary sentences.', performance:'Minimal DOM / animations.'}},
    { key:'sectionBands',      label:'Section Bands',      icon:'🧱',
      subtitle:'Colored bands grouping answer sections.',
      description:{default:'Soft, readable bands.', focus:'High-contrast focus blocks.', review:'Clear big-chunk separation.', performance:'Subtle, low-cost bands.'}},
    { key:'saveExport',        label:'Export Chat',        icon:'📀',
      subtitle:'Save to Markdown / HTML / OneNote.',
      description:{default:'Standard exports.', focus:'Export selected focus items.', review:'Bundle summaries.', performance:'Fast/minimal processing.'}},
        { key:'unmountMessages',   label:'Unmount Messages',   icon:'⛰️',
      subtitle:'Soft virtual-scrolling for long chats.',
      description:{default:'Unmount far-away messages.', focus:'Keep scroll light for focus mode.', review:'Re-mount when needed.', performance:'Keeps DOM small.'}},
    { key:'themesPanel',       label:'Themes Panel',       icon:'🎨',
      subtitle:'Color themes and layout tweaks.',
      description:{default:'Normal dark theme controls.', focus:'Focus-friendly contrast.', review:'Long-reading colors.', performance:'Simplified theme.'}},
    { key:'folders',           label:'Folders',            icon:'🗂️',
      subtitle:'Project / folder list tweaks.',
      description:{default:'Tweak folder spacing & colors.', focus:'Focus on active projects.', review:'Highlight project grouping.', performance:'Minimal DOM work.'}},
    { key:'interfaceEnhancer', label:'Interface Enhancer', icon:'🖥️',
      subtitle:'Sidebar + project list color dots.',
      description:{default:'Heatmap-style indicators for chats.', focus:'Spot recent chats faster.', review:'Quick color toggles near chat links.', performance:'Small DOM footprint.'}},
    { key:'titles',            label:'Titles',             icon:'🏷️',
      subtitle:'Title helpers for answers + chats.',
      description:{default:'Sync titles with MiniMap + cards.', focus:'Keep labels legible.', review:'Badge + tooltip helpers.', performance:'Lightweight updates.'}},
  ];


const FEATURE_CONTROLS = {

    inlineHighlighter: [
      { type:'select', key:'hlTrigger', label:'Trigger', def:'cmd1', opts:[
        ['cmd1','Cmd/Ctrl+1'], ['cmdSection','Cmd/Ctrl+§'], ['doubleClick','Double-click sentence'],
      ]},
      { type:'select', key:'hlPalette', label:'Palette', def:'classic', opts:[
        ['classic','Classic'], ['pastel','Pastel'], ['mono','Mono (yellow only)'],
      ]},
      { type:'range', key:'hlGlow', label:'Glow intensity', def:0.6, min:0, max:1, step:0.05, unit:'' },
      { type:'toggle', key:'hlDots', label:'Show dots on MiniMap', def:true },
      { type:'toggle', key:'hlAutoSentence', label:'Auto-expand sentence', def:true },
    ],

    sectionBands: [
      { type:'select', key:'sbDensity', label:'Density', def:'medium', opts:[ ['dense','Dense'],['medium','Medium'],['sparse','Sparse'] ]},
      { type:'toggle', key:'sbLabels', label:'Show labels', def:true },
    ],

    sidePanel: [
      { type:'select', key:'spPos', label:'Position', def:'right', opts:[ ['right','Right'],['left','Left'] ]},
      { type:'range', key:'spWidth', label:'Panel width', def:260, min:220, max:400, step:10, unit:'px' },
    ],

    themesPanel: [
      { type:'select', key:'thPreset', label:'Preset', def:'system', opts:[ ['system','System'], ['darkMatte','Dark Matte'], ['neon','Neon'] ]},
    ],

    saveExport: [
      { type:'select', key:'svFormat', label:'Default format', def:'markdown', opts:[ ['markdown','Markdown'], ['html','HTML'], ['onenote','OneNote (future)'] ]},
      { type:'toggle', key:'svAutoDl', label:'Auto-download', def:false },
    ],


    questions: [
      {
        type: 'select',
        key: 'qwrap_quote_mode',
        label: 'Quote Bubble Position',
        def: 'inside',
        opts: [['inside','Inside (default)'], ['outside','Outside (above)']],
        getLive() { return (W.H2O_QWRAP?.getQuoteMode?.() || 'inside'); },
        setLive(v) { W.H2O_QWRAP?.setQuoteMode?.(v); },
      },
    ],
  };

  const FEATURE_ALIASES = {
    sidePanel: 'dockPanel',
  };


  function CAT_forFeatureKey(featureKey){
    const k = FEATURE_getCanonicalKey(featureKey);
    // Navigate
    if (k === 'minimap' || k === 'questions' || k === 'marginAnchor' || k === 'dockPanel' || k === 'titles') return CAT_NAV;
    // Mark & Read
    if (k === 'inlineHighlighter' || k === 'sectionBands') return CAT_MARK;
    // Save & Sync
    if (k === 'saveExport' || k === 'data') return CAT_SAVE;
    // Performance & Look
    if (k === 'unmountMessages' || k === 'themesPanel' || k === 'folders' || k === 'interfaceEnhancer') return CAT_PERF;
    return CAT_ALL;
  }

  function CAT_setCurrent(id){
    const next = FEATURE_CATS.some(x => x.id === id) ? id : CAT_ALL;
    STATE_CH.curCat = next;
    try { UTIL_storage.setStr(KEY_CHUB_FEATCAT_V1, next); } catch {}
  }

  function CAT_loadCurrent(){
    const raw = UTIL_storage.getStr(KEY_CHUB_FEATCAT_V1, CAT_ALL);
    return FEATURE_CATS.some(x => x.id === raw) ? raw : CAT_ALL;
  }

  function FEATURE_getCanonicalKey(key){
    if (!key) return '';
    return FEATURE_ALIASES[key] || key;
  }

  function FEATURE_getAliasControlDefs(targetKey){
    const defs = [];
    if (!targetKey) return defs;
    for (const [alias, dest] of Object.entries(FEATURE_ALIASES)){
      if (dest !== targetKey) continue;
      const aliasDefs = FEATURE_CONTROLS?.[alias];
      if (Array.isArray(aliasDefs) && aliasDefs.length) defs.push(...aliasDefs);
    }
    return defs;
  }

  function FEATURE_getControlsForKey(key){
    const canonical = FEATURE_getCanonicalKey(key);
    const baseDefs = FEATURE_CONTROLS?.[canonical];
    const aliasDefs = FEATURE_getAliasControlDefs(canonical);
    const plugDefs  = PLUG_getControlsForKey(canonical);
    if ((!Array.isArray(baseDefs) || !baseDefs.length) && (!Array.isArray(aliasDefs) || !aliasDefs.length) && (!Array.isArray(plugDefs) || !plugDefs.length)) return [];
    return [
      ...(Array.isArray(baseDefs) ? baseDefs : []),
      ...(Array.isArray(aliasDefs) ? aliasDefs : []),
      ...(Array.isArray(plugDefs) ? plugDefs : []),
    ];
  }

  /* ───────────────────────────── 🌲 SEL — SELECTOR REGISTRY 📄🔒💧 ───────────────────────────── */

  // Owned nodes (prefer data-cgxui + owner)
  const SEL_CHUB_TOPBTN   = `[${ATTR_CGXUI}="${UI_CHUB_TOPBTN}"][${ATTR_CGXUI_OWNER}="${SkID}"]`;
  const SEL_CHUB_BACKDROP = `[${ATTR_CGXUI}="${UI_CHUB_BACKDROP}"][${ATTR_CGXUI_OWNER}="${SkID}"]`;
  const SEL_CHUB_PANEL    = `[${ATTR_CGXUI}="${UI_CHUB_PANEL}"][${ATTR_CGXUI_OWNER}="${SkID}"]`;
  const SEL_CHUB_DOCK     = `[${ATTR_CGXUI}="${UI_CHUB_DOCK}"][${ATTR_CGXUI_OWNER}="${SkID}"]`;

  // Inside panel selectors (scoped by owned panel root)
  const SEL_CHUB_XBTN       = `${SEL_CHUB_PANEL} .${CLS}-x`;
  const SEL_CHUB_TABS       = `${SEL_CHUB_PANEL} .${CLS}-tabs`;
  const SEL_CHUB_LIST       = `${SEL_CHUB_PANEL} .${CLS}-list`;
  const SEL_CHUB_DETAIL     = `${SEL_CHUB_PANEL} .${CLS}-detail`;

  const SEL_CHUB_PILL       = `${SEL_CHUB_PANEL} .${CLS}-pill`;
  const SEL_CHUB_FNAME      = `${SEL_CHUB_PANEL} .${CLS}-fn`;
  const SEL_CHUB_FSUB       = `${SEL_CHUB_PANEL} .${CLS}-fs`;
  const SEL_CHUB_BODY       = `${SEL_CHUB_PANEL} .${CLS}-body`;

  // Legacy/host buttons (read-only selection; not owned)

  /* ───────────────────────────── 🧊 GLASSY / FROSTED FLOATING PANEL (ADD) ─────────────────────────────
   * Purpose:
   *  - Create ONE glassy palette-like container (hidden by default)
   *  - Provide tiny show()/hide() helpers (display + opacity fade)
   * Notes:
   *  - No swatches, no logic. Just the panel + helpers.
   *  - Styling matches your spec exactly (rgba + blur + border + shadow).
   */

  /** @glassy */
  function CHUB_createGlassyPanel() {
    const ID = `cgxui-${SkID}-glassy-palette`;
    let el = D.getElementById(ID);
    if (el) return el;

    el = D.createElement('div');
    el.id = ID;

    // Optional: keep it "owned" for debugging / cleanup consistency
    el.setAttribute(ATTR_CGXUI, `${SkID}-glassy-palette`);
    el.setAttribute(ATTR_CGXUI_OWNER, SkID);

    // ✅ EXACT glassy styling
    el.style.position = 'fixed';
    el.style.zIndex = '999999';
    el.style.display = 'none';
    el.style.opacity = '0';
    el.style.width = '115px';
    el.style.height = '65px';
    el.style.boxSizing = 'border-box';
    el.style.borderRadius = '12px';
    el.style.background = 'rgba(255,255,255,0.04)';
    el.style.backdropFilter = 'blur(8px)';
    el.style.webkitBackdropFilter = 'blur(8px)';
    el.style.border = '1px solid rgba(255,255,255,0.06)';
    el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
    el.style.transition = 'opacity 0.15s ease';

    D.body.appendChild(el);
    return el;
  }

  /** @glassy */
  function CHUB_glassyShow(x, y) {
    const el = CHUB_createGlassyPanel();
    if (Number.isFinite(x)) el.style.left = `${Math.round(x)}px`;
    if (Number.isFinite(y)) el.style.top  = `${Math.round(y)}px`;

    el.style.display = 'flex';
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    return el;
  }

  /** @glassy */
  function CHUB_glassyHide() {
    const el = CHUB_createGlassyPanel();
    el.style.opacity = '0';
    W.setTimeout(() => { el.style.display = 'none'; }, 160);
    return el;
  }

  /* ───────────────────────────── 🟩 TOOLS — UTILITIES 📄🔓💧 ───────────────────────────── */

  const UTIL_storage = {
    getStr(key, fallback=null){ try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
    setStr(key, val){ try { localStorage.setItem(key, String(val)); return true; } catch { return false; } },
    getJSON(key, fallback=null){
      const s = this.getStr(key, null);
      if (s == null) return fallback;
      try { return JSON.parse(s); } catch { return fallback; }
    },
    setJSON(key, obj){ try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch { return false; } },
    del(key){ try { localStorage.removeItem(key); return true; } catch { return false; } },
  };

  function UTIL_capPush(arr, item, max){
    try {
      arr.push(item);
      if (arr.length > max) arr.splice(0, arr.length - max);
    } catch {}
  }
  function DIAG_step(msg, extra){
    UTIL_capPush(DIAG.steps, { t: Math.round(performance.now() - DIAG.t0), msg, extra: extra ? String(extra) : undefined }, DIAG.bufMax);
  }
  function DIAG_err(msg, err){
    UTIL_capPush(DIAG.errors, { t: Math.round(performance.now() - DIAG.t0), msg, err: String(err?.stack || err || '') }, DIAG.errMax);
  }

  function UTIL_q(sel, root=D){ try { return root.querySelector(sel); } catch { return null; } }
  function UTIL_qAll(sel, root=D){ try { return Array.from(root.querySelectorAll(sel)); } catch { return []; } }

  function UTIL_isFn(x){ return typeof x === 'function'; }

  function UTIL_emit(topic, detail){
    try { W.dispatchEvent(new CustomEvent(topic, { detail })); } catch {}
  }

  /* ───────────────────────────── 🔴 STATE — REGISTRIES / CACHES 📄🔓💧 ───────────────────────────── */

  const STATE_CH = MOD_OBJ.state = MOD_OBJ.state || {
    booted: false,
    _booting: false,
    curMode: 'default',
    curKey: FEATURE_getCanonicalKey(FEATURE_META?.[0]?.key || 'minimap'),
    curCat: CAT_ALL,
    cleanups: [],
    sectionBandsBtn: null,
    sectionBandsBtnListener: null,
    plugins: new Map(),
    buttonRepairTimer: null,
  };
  STATE_CH.plugins = STATE_CH.plugins || new Map();

  function CLEAN_add(fn){
    if (!UTIL_isFn(fn)) return;
    STATE_CH.cleanups.push(fn);
  }
  function CLEAN_runAll(){
    const list = STATE_CH.cleanups.splice(0);
    for (let i = list.length - 1; i >= 0; i--){
      try { list[i](); } catch (e) { DIAG_err('dispose cleanup failed', e); }
    }
  }

  /* ───────────────────────────── 🟤 VERIFY/SAFETY — GUARDS 📝🔓💧 ───────────────────────────── */

  function SAFE_call(label, fn){
    try { return fn(); } catch (e) { DIAG_err(label, e); return undefined; }
  }
  /* ───────────────────────────── 🔌 PLUGINS — REGISTRY / HOOKS ───────────────────────────── */

  function PLUG_skin(){
    return {
      SkID,
      CLS,
      ATTR_CGXUI,
      ATTR_CGXUI_OWNER,
      UI_CHUB_PANEL,
      UI_CHUB_BTN,
      panelSel: SEL_CHUB_PANEL,
      bodySel: `.${CLS}-body`,
    };
  }

  function PLUG_get(key){
    const canonical = FEATURE_getCanonicalKey(key);
    return STATE_CH.plugins.get(canonical) || null;
  }

  function PLUG_register(spec){
    if (!spec || !spec.key) return false;
    const canonical = FEATURE_getCanonicalKey(spec.key);
    STATE_CH.plugins.set(canonical, spec);

    const cssText = (typeof spec.cssText === 'function') ? spec.cssText(PLUG_skin()) : spec.cssText;
    if (cssText && typeof cssText === 'string') {
      const styleId = `cgxui-${SkID}-plugin-${canonical}`;
      let styleEl = D.getElementById(styleId);
      if (!styleEl) {
        styleEl = D.createElement('style');
        styleEl.id = styleId;
        styleEl.setAttribute(ATTR_CGXUI_OWNER, SkID);
        D.head.appendChild(styleEl);
        CLEAN_add(() => { try { styleEl.remove(); } catch {} });
      }
      if (styleEl.textContent !== cssText) styleEl.textContent = cssText;
    }

    return true;
  }

  function PLUG_unregister(key){
    const canonical = FEATURE_getCanonicalKey(key);
    STATE_CH.plugins.delete(canonical);
    const styleId = `cgxui-${SkID}-plugin-${canonical}`;
    const s = D.getElementById(styleId);
    if (s) try { s.remove(); } catch {}
    return true;
  }

  function PLUG_getControlsForKey(key){
    const p = PLUG_get(key);
    if (!p) return [];
    const fn = p.getControls || p.controls;
    if (!fn) return [];
    return SAFE_call(`plugin.getControls:${String(p.key || key)}`, () => {
      const out = (typeof fn === 'function') ? fn({ key, mode: STATE_CH.curMode, skin: PLUG_skin() }) : fn;
      return Array.isArray(out) ? out : [];
    }) || [];
  }

  function PLUG_runDetailHook(key, panel){
    const p = PLUG_get(key);
    const fn = p?.detailHook || p?.renderDetail || null;
    if (!fn) return;
    SAFE_call(`plugin.detailHook:${String(p.key || key)}`, () => fn({ key, panel, mode: STATE_CH.curMode, skin: PLUG_skin() }));
  }

  function PLUG_afterAction(key, panel){
    const p = PLUG_get(key);
    const fn = p?.afterAction || null;
    if (!fn) return;
    SAFE_call(`plugin.afterAction:${String(p.key || key)}`, () => fn({ key, panel, mode: STATE_CH.curMode, skin: PLUG_skin() }));
  }

  function CORE_CH_invalidate(){
    const panel = UTIL_q(SEL_CHUB_PANEL);
    if (!panel) return;
    const visible = panel.getAttribute('aria-hidden') !== 'true' && !panel.hasAttribute('hidden');
    if (!visible) return;
    ENGINE_renderTabs(panel);
    ENGINE_renderDetail(panel);
    ENGINE_renderControls(panel);
  }

  function ENGINE_parseActionMessage(result, fallback=''){
    if (!result) return fallback || '';
    if (typeof result === 'string') return result;
    if (typeof result === 'object') {
      if (result.msg) return result.msg;
      if (result.message) return result.message;
      if (result.text) return result.text;
      if (result.error) return String(result.error);
    }
    return fallback || '';
  }


  function SAFE_features(){
    if (!W.h2oConfig && !W.hoConfig) {
      const base = {};
      W.h2oConfig = base;
      W.hoConfig = base;
    } else if (!W.h2oConfig) {
      W.h2oConfig = W.hoConfig;
    } else if (!W.hoConfig) {
      W.hoConfig = W.h2oConfig;
    }

    const host = W.h2oConfig;
    const features = host.features || W.hoConfig.features || {};
    host.features = features;
    W.hoConfig.features = features;
    return features;
  }

  function SAFE_getCfg(key){
    const F = SAFE_features();
    return F?.[key] || null;
  }

  function SAFE_isOn(key){
    const c = SAFE_getCfg(key);
    if (!c) return true;
    if (typeof c.enabled === 'function') return !!SAFE_call('feature.enabled()', () => c.enabled());
    if (typeof c.enabled === 'boolean') return !!c.enabled;
    return true;
  }

  function SAFE_setOn(key, v){
    const c = SAFE_getCfg(key);
    if (c && typeof c.setEnabled === 'function') SAFE_call('feature.setEnabled()', () => c.setEnabled(!!v));
  }

  function SAFE_setMode(key, mode){
    const c = SAFE_getCfg(key);
    if (c && typeof c.setMode === 'function') SAFE_call('feature.setMode()', () => c.setMode(mode));
  }

  function SAFE_getDesc(key, mode){
    const c = SAFE_getCfg(key);
    if (c && typeof c.getSummary === 'function') {
      const t = SAFE_call('feature.getSummary()', () => c.getSummary(mode));
      if (t) return String(t);
    }
    const meta = FEATURE_META.find(x => x.key === key);
    return (meta?.description?.[mode]) || '';
  }

  // Hub state I/O (new key)
  function STORE_loadHub(){
    return UTIL_storage.getJSON(KEY_CHUB_STATE_HUB_V1, {}) || {};
  }
  function STORE_saveHub(st){
    UTIL_storage.setJSON(KEY_CHUB_STATE_HUB_V1, st || {});
  }
  function STORE_getOpt(featureKey, optKey, defVal){
    const st = STORE_loadHub();
    return (st?.[featureKey] && Object.prototype.hasOwnProperty.call(st[featureKey], optKey)) ? st[featureKey][optKey] : defVal;
  }
  function STORE_setOpt(featureKey, optKey, val){
    const st = STORE_loadHub();
    st[featureKey] = st[featureKey] || {};
    st[featureKey][optKey] = val;
    STORE_saveHub(st);

    const c = SAFE_getCfg(featureKey);
    if (c && typeof c.applySetting === 'function') SAFE_call('feature.applySetting()', () => c.applySetting(optKey, val));

    UTIL_emit(EV_CHUB_CHANGED_V1, { featureKey, optKey, val });
  }

  // Disk migration (legacy → new) (read-only legacy, write new)
  function MIG_CH_migrateHubOnce(){
    if (UTIL_storage.getStr(KEY_CHUB_MIG_HUB_V1, null) === '1') return;

    const already = UTIL_storage.getJSON(KEY_CHUB_STATE_HUB_V1, null);
    if (already && typeof already === 'object' && Object.keys(already).length) {
      try { UTIL_storage.setStr(KEY_CHUB_MIG_HUB_V1, '1'); } catch {}
      return;
    }

    const legacy = UTIL_storage.getJSON(KEY_LEGACY_HO_HUB_V2, null);
    if (!legacy || typeof legacy !== 'object') {
      try { UTIL_storage.setStr(KEY_CHUB_MIG_HUB_V1, '1'); } catch {}
      return;
    }

    // write into new namespace (no legacy writes)
    UTIL_storage.setJSON(KEY_CHUB_STATE_HUB_V1, legacy);
    DIAG_step('migrated legacy hub state', KEY_LEGACY_HO_HUB_V2);
    try { UTIL_storage.del(KEY_LEGACY_HO_HUB_V2); } catch {}
    try { UTIL_storage.setStr(KEY_CHUB_MIG_HUB_V1, '1'); } catch {}
  }

  /* ───────────────────────────── 🟧 BOUNDARIES — DOM / MOUNT 📝🔓💥 ───────────────────────────── */
  function DOM_ensureBackdrop(){
    let b = UTIL_q(SEL_CHUB_BACKDROP);
    if (b) return b;

    b = D.createElement('div');
    b.setAttribute(ATTR_CGXUI, UI_CHUB_BACKDROP);
    b.setAttribute(ATTR_CGXUI_OWNER, SkID);
    b.setAttribute('hidden', 'true');
    D.body.appendChild(b);

    b.addEventListener('click', () => CORE_CH_hidePanel(), true);

    return b;
  }

  function DOM_buildPanel(){
    let p = UTIL_q(SEL_CHUB_PANEL);
    if (p) return p;

    p = D.createElement('div');
    p.setAttribute(ATTR_CGXUI, UI_CHUB_PANEL);
    p.setAttribute(ATTR_CGXUI_OWNER, SkID);
    p.setAttribute('hidden', 'true');

    p.innerHTML = `
      <div class="${CLS}-header">
        <div class="${CLS}-title">Control Hub <small>Cockpit</small></div>
        <button class="${CLS}-x" type="button" aria-label="Close">✕</button>
      </div>

      <div class="${CLS}-toprow">
        <div class="${CLS}-tabs"></div>
      </div>

      <div class="${CLS}-main">
        <div class="${CLS}-catrail"></div>
        <div class="${CLS}-list"></div>
        <div class="${CLS}-detail">
          <div class="${CLS}-pill"></div>
          <div class="${CLS}-fl">FEATURE</div>
          <div class="${CLS}-fn"></div>
          <div class="${CLS}-fs"></div>
          <div class="${CLS}-body"></div>
        </div>
      </div>

      <div class="${CLS}-footer">
        <span>Tabs: each feature has its own controls.</span>
        <span>Shortcuts: Cmd/Ctrl+1 — highlight (when enabled).</span>
      </div>
    `;

    D.body.appendChild(p);

    const x = UTIL_q(SEL_CHUB_XBTN);
    if (x) x.addEventListener('click', () => CORE_CH_hidePanel(), true);

    return p;
  }

  function DOM_createTopButton(){
    if (UTIL_q(SEL_CHUB_TOPBTN)) return UTIL_q(SEL_CHUB_TOPBTN);

    const btn = D.createElement('button');
    btn.type = 'button';
    btn.setAttribute(ATTR_CGXUI, UI_CHUB_TOPBTN);
    btn.setAttribute(ATTR_CGXUI_OWNER, SkID);
    btn.className = `${CLS}-topbtn`;
    btn.innerHTML = `<span>Cockpit Pro</span>`;                           // 👈 Host's existing premium button (or just a fun label if not present)

    btn.addEventListener('click', () => {
      const p = DOM_buildPanel();
      const isHidden = !!p?.hasAttribute('hidden');
      if (isHidden) CORE_CH_showPanel();
      else CORE_CH_hidePanel();
    }, true);

    return btn;
  }

  // Dock + mount location (owned)
  function DOM_placeTopButton(){
    const dock = DOM_ensureDock();
    if (!dock) return false;

    const btn = DOM_createTopButton();
    if (btn.parentElement === dock) return true;
    dock.appendChild(btn);
    return true;
  }

  function DOM_ensureDock(){
    let dock = UTIL_q(SEL_CHUB_DOCK);
    if (dock) return dock;

    dock = D.createElement('div');
    dock.setAttribute(ATTR_CGXUI, UI_CHUB_DOCK);
    dock.setAttribute(ATTR_CGXUI_OWNER, SkID);
    D.body.appendChild(dock);

    return dock;
  }

  /* ───────────────────────────── 🟪 UI BOUNDARY — CSS RULES 📄🔓💧 ───────────────────────────── */

  function CSS_CH_TEXT(){
    const selScoped = (ui) => `[${ATTR_CGXUI}="${ui}"][${ATTR_CGXUI_OWNER}="${SkID}"]`;
    const P  = selScoped(UI_CHUB_PANEL);
    const B  = selScoped(UI_CHUB_BACKDROP);
    const DK = selScoped(UI_CHUB_DOCK);
    return `
/* ${MODICON} ${MODTAG} — UI (owned only) */

${B}{
  position:fixed; inset:0; z-index:${CFG_CH.BACKDROP_Z};
  background: radial-gradient(60% 50% at 50% 10%, rgba(0,0,0,.15), rgba(0,0,0,.25));  /* 👈 page darkness .35 & .75*/
  backdrop-filter: blur(${CFG_CH.BACKDROP_BLUR_PX}px);                              /* 👈 */
  -webkit-backdrop-filter: blur(${CFG_CH.BACKDROP_BLUR_PX}px);                      /* 👈 */
  pointer-events:auto;
  isolation:isolate;
  will-change:opacity, backdrop-filter;
}
${B}[hidden]{ display:none !important; }

${P}{
  /* ── Hub panel geometry (CFG_CH) ────────────────────────── */
  position:fixed;
  left:${CFG_CH.PANEL_LEFT_PCT}%;               /* 👈 */
  top:${CFG_CH.PANEL_TOP_PCT}%;                /* 👈 */
  transform:translate(-50%,-50%);
  width:min(${CFG_CH.PANEL_W_PX}px, ${CFG_CH.PANEL_W_VW}vw); /* 👈 */
  min-width:${CFG_CH.PANEL_MIN_W_PX}px;         /* 👈 */
  max-height:min(${CFG_CH.PANEL_MAX_H_VH}vh, ${CFG_CH.PANEL_MAX_H_PX}px); /* 👈 */
  height:min(${CFG_CH.PANEL_MAX_H_VH}vh, ${CFG_CH.PANEL_MAX_H_PX}px); /* 👈 fixed size */

  /* Layout: keep header/toprow/footer fixed; main scrolls inside */
  display:flex;
  flex-direction:column;
  min-height:0;

  padding:16px 18px 14px;
  border-radius:22px;
  overflow:hidden;

  color:#f4f6fb;
  z-index:${CFG_CH.PANEL_Z};
  background:
    radial-gradient(circle at 0% 0%, ${CFG_CH.HUB_TINT_A}, transparent 45%), /* 👈 */
    radial-gradient(circle at 100% 100%, ${CFG_CH.HUB_TINT_B}, transparent 55%), /* 👈 */
    linear-gradient(135deg, ${CFG_CH.HUB_BG_A}, ${CFG_CH.HUB_BG_B}); /* 👈 */
  box-shadow: 0 26px 80px rgba(0,0,0,.90), 0 0 0 1px rgba(255,255,255,.05);
  filter:none !important;

  /* backdrop-filter:none; */

  backdrop-filter: blur(14px) saturate(1.2);               /* 👈👈👈 🪞 Make the Control Hub panel itself more “glassy / blurry”  */
-webkit-backdrop-filter: blur(14px) saturate(1.2);

  isolation:isolate;
  transform-style:preserve-3d;
  pointer-events:auto;
  will-change:transform, opacity;
}
${P}[hidden]{ display:none !important; }

${P}::before{
  content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
  border:1px solid rgba(255,255,255,0.10);
  box-shadow:
    0 0 0 1px rgba(15,23,42,0.65) inset,
    0 0 28px rgba(15,23,42,0.75),
    0 0 60px rgba(0,0,0,0.85);
  background:
    radial-gradient(60% 70% at 0% 0%, rgba(255,255,255,.18), transparent 45%),
    radial-gradient(40% 40% at 100% 100%, rgba(255,255,255,.08), transparent 55%);
  mix-blend-mode: screen; opacity:.9;
}

/* Header */
${P} .${CLS}-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
${P} .${CLS}-title{font-size:14px;font-weight:600;letter-spacing:.02em}
${P} .${CLS}-title small{opacity:.8;font-weight:400;margin-left:4px}
${P} .${CLS}-x{border:none;background:rgba(255,255,255,.12);color:#fff;width:22px;height:22px;border-radius:999px;display:inline-grid;place-items:center;cursor:pointer;box-shadow:0 4px 10px rgba(0,0,0,.55)}
${P} .${CLS}-x:hover{background:rgba(255,255,255,.18)}

${DK}{
  position:fixed;
  top:0;
  right:16px;

  /* Make dock behave like a topbar strip */
  height:48px;                 /* 👈 if it’s still low, try 44px */
  display:inline-flex;
  align-items:center;          /* 👈 vertical centering */
  justify-content:flex-end;
  gap:6px;

  z-index:${CFG_CH.PANEL_Z};
  pointer-events:none;
  box-sizing:border-box;
}
${DK} > *{pointer-events:auto;}

${DK} > button{
  pointer-events:auto;
}

/* Mode tabs + per-feature ON/OFF */
${P} .${CLS}-toprow{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:10px}
${P} .${CLS}-tabs{display:flex;gap:8px}
${P} .${CLS}-tab{padding:4px 18px;border-radius:999px;border:none;cursor:pointer;font-size:12px;
  background:rgba(6,10,18,.78);color:rgba(238,242,252,.88);
  box-shadow:0 0 0 1px rgba(255,255,255,.05), inset 0 4px 12px rgba(0,0,0,.55);
  transition:.18s}
${P} .${CLS}-tab:hover{transform:translateY(-0.5px);box-shadow:0 0 0 1px rgba(255,255,255,.20), inset 0 8px 20px rgba(0,0,0,.75)}
${P} .${CLS}-tab[${ATTR_CGXUI_STATE}="active"]{
  background:radial-gradient(circle at 50% 0%, #ffdf89, #b87d1c);
  color:#222;
  box-shadow:0 0 0 1px rgba(255,248,235,.9), 0 6px 18px rgba(0,0,0,.9)
}

/* Main grid */
${P} .${CLS}-main{
display:grid;
grid-template-columns:32px minmax(200px, 230px) minmax(380px, 1fr);
gap:18px;
margin-top:6px;

flex:1 1 auto;                                   /* 👈 */
min-height:0;                                    /* 👈 */
max-height:min(${CFG_CH.MAIN_MAX_H_VH}vh, 100%);  /* 👈 */
align-items:stretch;
overflow:hidden;

}

/* Left list */

/* Category rail (vertical filter) */
${P} .${CLS}-catrail{
  display:flex;
  flex-direction:column;
  align-items:stretch;
  justify-content:flex-start;
  gap:8px;
  padding:4px 0;
  height:100%;
  min-height:0;
  overflow:hidden;
}
${P} .${CLS}-catbtn{
  width:32px;
  height:92px;
  border:none;
  border-radius:10px;
  cursor:pointer;
  background:linear-gradient(135deg, rgba(8,8,12,0.72), rgba(3,3,6,0.92));
  box-shadow:0 0 0 1px rgba(255,255,255,.08), 0 3px 7px rgba(0,0,0,.4);
  color:rgba(238,242,252,.82);
  display:flex;
  align-items:center;
  justify-content:center;
  padding:0;
  transition:.16s;
}
${P} .${CLS}-catbtn:hover{
  transform:translateY(-.5px);
  background:linear-gradient(135deg, rgba(255,255,255,.10), rgba(255,255,255,.04));
  box-shadow:0 0 0 1px rgba(255,255,255,.20), 0 6px 14px rgba(0,0,0,.55);
}
${P} .${CLS}-catbtn[${ATTR_CGXUI_STATE}="active"]{
  background:linear-gradient(135deg, rgba(255,255,255,.22), rgba(255,255,255,.05));
  color:#ffffff;
  box-shadow:0 0 0 1px rgba(255,255,255,.30);
}
${P} .${CLS}-catlbl{
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-size:11px;
  letter-spacing:.04em;
  line-height:1;
  user-select:none;
  opacity:.95;
}
${P} .${CLS}-list{
  display:flex;
  flex-direction:column;
  gap:8px;
  height:100%;
  max-height:100%;
  min-height: 0;
  overflow-y:auto;
  padding-right:${CFG_CH.LIST_PAD_RIGHT_PX}px;                        /* 👈👈👈 */
  box-sizing: border-box;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,.4) transparent;

padding-top: 2px;
padding-left: 2px;

}
${P} .${CLS}-list::-webkit-scrollbar{width:6px}
${P} .${CLS}-list::-webkit-scrollbar-thumb{
  background:rgba(255,255,255,.35);
  border-radius:3px;
}
${P} .${CLS}-item{
  display:flex;align-items:center;justify-content:space-between;gap:8px;
  padding:7px 10px;border-radius:13px;cursor:pointer;font-size:12px;
  background:linear-gradient(135deg, rgba(8,8,12,0.72), rgba(3,3,6,0.92));   /* 👈 tab color .06/.02 */
  box-shadow:0 0 0 1px rgba(255,255,255,.08), 0 3px 7px rgba(0,0,0,.4);transition:.16s
}
${P} .${CLS}-item:hover{transform:translateY(-.3px);background:linear-gradient(135deg, rgba(255,255,255,.10), rgba(255,255,255,.04))}
${P} .${CLS}-item[${ATTR_CGXUI_STATE}="active"]{
  /* clearer active state (higher contrast, modern) */
  background:
    linear-gradient(135deg, rgba(90,140,255,.30), rgba(10,12,18,.92));
  box-shadow:
    0 0 0 1px rgba(255,255,255,.34),
    inset 0 1px 0 rgba(255,255,255,.18),
    inset 0 -1px 0 rgba(0,0,0,.45);
}
${P} .${CLS}-item-left{display:flex;align-items:center;gap:8px;min-width:0}
${P} .${CLS}-ico{width:22px;height:22px;border-radius:11px;display:grid;place-items:center;font-size:14px;
  background:radial-gradient(circle at 30% 20%, rgba(255,255,255,.9), rgba(200,200,220,.2))}
${P} .${CLS}-mainlbl{font-weight:500}
${P} .${CLS}-sublbl{font-size:10px;opacity:.65}

${P} .${CLS}-item-switch{
  flex:0 0 auto; position:relative; width:34px; height:18px; border-radius:999px;
  border:1px solid rgba(255,255,255,.28);
  background:rgba(255,255,255,.10);
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.35);
  cursor:pointer; padding:0; outline:none; opacity:.95;
}
${P} .${CLS}-item-switch>i{
  position:absolute; top:1px; left:2px; width:14px; height:14px; border-radius:50%;
  background:radial-gradient(circle at 30% 20%, #fff, #cfd3e6);
  box-shadow:0 1px 3px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.55);
  transition:transform .16s ease;
}
${P} .${CLS}-item-switch[${ATTR_CGXUI_STATE}="on"]{
  background:linear-gradient(135deg,#ffd966,#ffb347);
  border-color:rgba(255,255,255,.75);
  box-shadow:0 0 0 1px rgba(255,255,255,.55), 0 0 10px rgba(255,205,90,.55);
}
${P} .${CLS}-item-switch[${ATTR_CGXUI_STATE}="on"]>i{transform:translateX(16px)}

/* Right details */
${P} .${CLS}-detail{
  position:relative; padding:10px 14px 12px; border-radius:16px;
  background: radial-gradient(circle at 0% 0%, rgba(255,255,255,.08), transparent 45%),
             linear-gradient(135deg, rgba(6,10,20,.94), rgba(6,6,16,.97));
  box-shadow:0 0 0 1px rgba(255,255,255,.06), 0 10px 32px rgba(0,0,0,.80);
  min-height:0;
  height:100%;
  max-height:100%;
  overflow-y:auto;
  scrollbar-gutter: stable; /* 👈 keep scrollbar from overlaying content */
}
${P} .${CLS}-pill{position:absolute;right:10px;top:10px;font-size:11px;padding:3px 10px;border-radius:999px;background:rgba(255,255,255,.09);
  box-shadow:0 0 0 1px rgba(255,255,255,.20), 0 3px 8px rgba(0,0,0,.75)}
${P} .${CLS}-fl{font-size:10px;letter-spacing:.16em;opacity:.72;text-transform:uppercase}
${P} .${CLS}-fn{margin-top:4px;font-size:15px;font-weight:600}
${P} .${CLS}-fs{margin-top:2px;font-size:11px;opacity:.82}
${P} .${CLS}-body{margin-top:10px;font-size:12px;line-height:1.45;opacity:.95}

${P} .${CLS}-theme-action{
  margin-top:12px;
  display:flex;
  justify-content:flex-start;
}
${P} .${CLS}-themeBtn{
  padding:0 16px;
  height:34px;
  border-radius:10px;
  border:1px solid rgba(255,255,255,.25);
  background:rgba(255,255,255,.04);
  color:#f4f6fb;
  font-size:13px;
  letter-spacing:.1em;
  text-transform:uppercase;
  cursor:pointer;
  transition:background .2s ease, border-color .2s ease;
}
${P} .${CLS}-themeBtn:not(:disabled):hover{
  background:rgba(255,255,255,.08);
  border-color:rgba(255,255,255,.5);
}
${P} .${CLS}-themeBtn:disabled{
  opacity:.65;
  cursor:not-allowed;
}

/* Footer */
${P} .${CLS}-footer{display:flex;justify-content:space-between;margin-top:10px;font-size:10px;opacity:.8}

/* Controls area */
${P} .${CLS}-controls{margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,.08)}
${P} .${CLS}-ctrlrow{display:flex; align-items:center; justify-content:space-between; gap:10px; margin:8px 0}
/* ✅ Action rows: stack label + help above buttons to avoid cramped word-wrapping */
${P} .${CLS}-ctrlrow.${CLS}-ctrlrow-action{flex-direction:column; align-items:stretch; justify-content:flex-start; gap:8px}
${P} .${CLS}-ctrlrow.${CLS}-ctrlrow-action .${CLS}-ctrlLabGroup{max-width:none; min-width:0; width:100%}
${P} .${CLS}-ctrlrow.${CLS}-ctrlrow-action .${CLS}-ctrlui{min-width:0; width:100%}
${P} .${CLS}-ctrlrow.${CLS}-ctrlrow-action .${CLS}-ctrlAction{width:100%}
${P} .${CLS}-ctrlrow.${CLS}-ctrlrow-action .${CLS}-ctrlActionBtns{flex-wrap:wrap; justify-content:flex-start; gap:10px}
${P} .${CLS}-ctrlrow.${CLS}-ctrlrow-action .${CLS}-ctrlActionStatus{min-width:0; flex:1}
${P} .${CLS}-ctrllab{font-size:12px; opacity:.9}
${P} .${CLS}-ctrlui{display:flex; align-items:center; justify-content:flex-end; gap:8px; min-width:220px; flex-wrap:wrap}
${P} .${CLS}-select2{
  font-size:12px; color:#f4f6fb;
  background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.12);
  padding:5px 8px; border-radius:10px; outline:none;
}
${P} .${CLS}-group-title{
  font-size:10px;
  letter-spacing:.08em;
  text-transform:uppercase;
  opacity:.65;
  margin-top:18px;
  margin-bottom:4px;
}
${P} .${CLS}-rangebox{display:flex; align-items:center; gap:8px}
${P} .${CLS}-rangebox input[type="range"]{width:160px}
${P} .${CLS}-rangeval{font-size:12px; opacity:.75; min-width:48px; text-align:right}
${P} .${CLS}-ctrlLabGroup{display:flex; flex-direction:column; gap:3px; min-width:0; max-width:280px}
${P} .${CLS}-ctrlHint{font-size:11px; opacity:.65; color:rgba(255,255,255,.78)}
${P} .${CLS}-ctrlAction{display:flex; align-items:center; gap:12px; flex-wrap:wrap}
${P} .${CLS}-ctrlActionBtns{display:flex; gap:8px; flex-wrap:wrap}
${P} .${CLS}-actionBtn{padding:7px 14px; border-radius:999px; border:1px solid rgba(255,255,255,.14); background:linear-gradient(135deg, rgba(255,217,102,.98), rgba(244,123,30,.98)); color:#131313; font-size:12px; cursor:pointer; transition:.18s; box-shadow:0 10px 26px rgba(0,0,0,.32), inset 0 1px 0 rgba(255,255,255,.28)}
${P} .${CLS}-actionBtn.primary{background:linear-gradient(135deg, rgba(255,245,192,.98), rgba(245,156,26,.98)); font-weight:650}
${P} .${CLS}-actionBtn:disabled{opacity:.45; cursor:not-allowed; box-shadow:none}
${P} .${CLS}-ctrlActionStatus{font-size:11px; opacity:.7; min-width:140px; text-align:right}
${P} .${CLS}-miniSwitch{
  position:relative; width:34px; height:18px; border-radius:999px;
  border:1px solid rgba(255,255,255,.25);
  background:rgba(255,255,255,.10);
  cursor:pointer;
}
${P} .${CLS}-miniSwitch>i{
  position:absolute; top:1px; left:2px; width:14px; height:14px; border-radius:50%;
  background:radial-gradient(circle at 30% 20%, #fff, #d0d0e0);
  transition:transform .16s;
  box-shadow:0 1px 3px rgba(0,0,0,.55);
}
${P} .${CLS}-miniSwitch[${ATTR_CGXUI_STATE}="on"]{
  background:linear-gradient(135deg,#ffd966,#ffb347);
  border-color:rgba(255,255,255,.7);
}
${P} .${CLS}-miniSwitch[${ATTR_CGXUI_STATE}="on"]>i{transform:translateX(15px)}

${P} .${CLS}-band-toggle-row{margin-top:8px}
${P} .${CLS}-band-toggle{
  border:1px solid rgba(255,255,255,.25);
  border-radius:999px;
  padding:6px 16px;
  min-width: 150px;
  font-size:12px;
  letter-spacing:.04em;
  background:rgba(255,255,255,.06);
  color:#fefefe;
  cursor:pointer;
  transition:all .18s ease;
  box-shadow:0 2px 6px rgba(0,0,0,.35);
}
${P} .${CLS}-band-toggle[${ATTR_CGXUI_STATE}="on"]{
  background:linear-gradient(135deg,#ffd966,#ffb347);
  border-color:rgba(255,215,0,.9);
  color:#2d1605;
  box-shadow:0 10px 24px rgba(255,200,80,.45);
}
${P} .${CLS}-band-toggle:disabled{
  opacity:.65;
  filter:grayscale(.15);
  cursor:not-allowed;
}

/* Topbar Control button (owned) */
[${ATTR_CGXUI}="${UI_CHUB_TOPBTN}"][${ATTR_CGXUI_OWNER}="${SkID}"].${CLS}-topbtn{
  display:flex; align-items:center; justify-content:center; gap:4px;
  padding:0 10px; min-height:32px; height:32px;
  border-radius:8px; box-sizing:border-box; border:none; outline:none;
  background: rgba(255,255,255,0.035);
  box-shadow: inset 0 0 2px rgba(255,255,255,0.03), 0 2px 4px rgba(0,0,0,0.2);
  font-weight:500; font-size:13px; line-height:1;
  color: rgba(255,255,255,0.4);
  letter-spacing:0.2px;
  text-shadow:0 0 2px rgba(0,0,0,0.2);
  cursor:pointer;
  white-space:nowrap;
  background-clip:padding-box;
  transition: all 0.15s ease, transform 0.15s ease;

  /* placement (top “bar” feel) */
  position:fixed;
  top:10px;
  left:50%;
  transform:translateX(-50%);
  z-index:${CFG_CH.PANEL_Z}; /* CFG_CH.PANEL_Z in your script */
}

[${ATTR_CGXUI}="${UI_CHUB_TOPBTN}"][${ATTR_CGXUI_OWNER}="${SkID}"].${CLS}-topbtn:hover{
  filter: brightness(1.15);
  box-shadow: inset 0 1px 1px rgba(255,255,255,0.07), 0 3px 6px rgba(255,215,0,0.2);
}

[${ATTR_CGXUI}="${UI_CHUB_TOPBTN}"][${ATTR_CGXUI_OWNER}="${SkID}"].${CLS}-topbtn:active{
  filter: brightness(1.25);
  color: rgba(255,255,255,0.85);
  box-shadow: inset 0 0 3px rgba(255,255,255,0.10), 0 3px 8px rgba(255,215,0,0.35);
}

[${ATTR_CGXUI}="${UI_CHUB_TOPBTN}"][${ATTR_CGXUI_OWNER}="${SkID}"].${CLS}-topbtn span{
  pointer-events:none;
  line-height:1;
}

${DK}{
    position:fixed;
    top:12px;
    right:16px;
    display:inline-flex;
    gap:4px;
    z-index:${CFG_CH.PANEL_Z};
  }
  ${DK} > button{
    pointer-events:auto;
  }

  /* Dock spacing (owned dock only) */


/* DataTab plugin CSS is injected by the Data Tab module */


/* Hide scrollbars but keep scrolling */
${P} .${CLS}-list,
${P} .${CLS}-detail{
  scrollbar-width: none;        /* Firefox */
  -ms-overflow-style: none;     /* old Edge/IE */
}

${P} .${CLS}-list::-webkit-scrollbar,
${P} .${CLS}-detail::-webkit-scrollbar{
  width: 0 !important;
  height: 0 !important;
}

`;
  }

  function CSS_CH_ensureStyle(){
    let s = D.getElementById(CSS_CHUB_STYLE_ID);
    const txt = CSS_CH_TEXT();

    if (!s) {
      s = D.createElement('style');
      s.id = CSS_CHUB_STYLE_ID;
      s.setAttribute(ATTR_CGXUI_OWNER, SkID);
      D.head.appendChild(s);
      CLEAN_add(() => { try { s.remove(); } catch {} });
    }
    if (s.textContent !== txt) s.textContent = txt;
  }

  /* ───────────────────────────── 🟥 ENGINE — RENDER / UI LOGIC 📝🔓💥 ───────────────────────────── */

  function HO_sectionBandsApi(){
    const mod = W.H2O?.SB?.sctnbnds?.api;
    if (!mod) return null;
    return mod.autoMode || mod;
  }

  function HO_sectionBandsAutoMode(){
    const api = HO_sectionBandsApi();
    if (!api) return null;
    if (typeof api.isAutoModeOn === 'function') return !!api.isAutoModeOn();
    return null;
  }

  function HO_toggleSectionBandsAutoMode(){
    const api = HO_sectionBandsApi();
    if (!api) return;
    if (typeof api.toggleAutoMode === 'function') {
      api.toggleAutoMode();
    } else if (typeof api.setAutoMode === 'function') {
      api.setAutoMode(!HO_sectionBandsAutoMode());
    }
  }

  function ENGINE_updateSectionBandsButtonState(){
    const btn = STATE_CH.sectionBandsBtn;
    if (!btn) return;
    const state = HO_sectionBandsAutoMode();
    if (state === null) {
      btn.disabled = true;
      btn.removeAttribute(ATTR_CGXUI_STATE);
      btn.textContent = 'Bands: Loading…';
      return;
    }
    btn.disabled = false;
    btn.setAttribute(ATTR_CGXUI_STATE, state ? 'on' : 'off');
    btn.textContent = state ? 'Bands: ◉' : 'Bands: ◎';
  }

  function ENGINE_renderTabs(panel){
    const el = UTIL_q(`.${CLS}-tabs`, panel);
    if (!el) return;
    el.innerHTML = '';

    for (const m of MODES){
      const b = D.createElement('button');
      b.className = `${CLS}-tab`;
      b.setAttribute(ATTR_CGXUI_MODE, m);
      b.setAttribute(ATTR_CGXUI_STATE, m === STATE_CH.curMode ? 'active' : 'idle');
      b.textContent = m[0].toUpperCase() + m.slice(1);

      b.addEventListener('click', () => {
        if (STATE_CH.curMode === m) return;
        STATE_CH.curMode = m;

        // update active visuals
        UTIL_qAll(`${SEL_CHUB_PANEL} .${CLS}-tab`).forEach(t => {
          const tm = t.getAttribute(ATTR_CGXUI_MODE) || '';
          t.setAttribute(ATTR_CGXUI_STATE, tm === STATE_CH.curMode ? 'active' : 'idle');
        });

        SAFE_setMode(STATE_CH.curKey, STATE_CH.curMode);
        ENGINE_renderDetail(panel);
      }, true);

      el.appendChild(b);
    }
  }


  function ENGINE_renderCategories(panel){
    const rail = UTIL_q(`.${CLS}-catrail`, panel);
    if (!rail) return;

    // lazy-load current category (disk) once per panel-show
    if (!STATE_CH.curCat) STATE_CH.curCat = CAT_ALL;

    rail.innerHTML = '';
    for (const c of FEATURE_CATS){
      const b = D.createElement('button');
      b.type = 'button';
      b.className = `${CLS}-catbtn`;
      b.setAttribute(ATTR_CGXUI_KEY, c.id);
      b.setAttribute(ATTR_CGXUI_STATE, c.id === STATE_CH.curCat ? 'active' : 'idle');

      const lbl = D.createElement('div');
      lbl.className = `${CLS}-catlbl`;
      lbl.textContent = c.label;

      b.appendChild(lbl);

      b.addEventListener('click', () => {
        if (STATE_CH.curCat === c.id) return;
        CAT_setCurrent(c.id);

        // update visuals
        UTIL_qAll(`${SEL_CHUB_PANEL} .${CLS}-catbtn`).forEach(x => {
          const k = x.getAttribute(ATTR_CGXUI_KEY);
          x.setAttribute(ATTR_CGXUI_STATE, k === STATE_CH.curCat ? 'active' : 'idle');
        });

        ENGINE_renderList(panel);

        // if current feature is now hidden by filter, pick first visible
        const visibleKeys = FEATURE_META
          .map(m => FEATURE_getCanonicalKey(m.key))
          .filter(k => k && (STATE_CH.curCat === CAT_ALL || CAT_forFeatureKey(k) === STATE_CH.curCat));

        if (STATE_CH.curCat !== CAT_ALL && !visibleKeys.includes(STATE_CH.curKey)) {
          STATE_CH.curKey = visibleKeys[0] || STATE_CH.curKey;
          ENGINE_renderDetail(panel);
        } else {
          // keep active row highlight correct
          UTIL_qAll(`${SEL_CHUB_PANEL} .${CLS}-item`).forEach(x => {
            const k = x.getAttribute(ATTR_CGXUI_KEY);
            x.setAttribute(ATTR_CGXUI_STATE, k === STATE_CH.curKey ? 'active' : 'idle');
          });
        }
      }, true);

      rail.appendChild(b);
    }
  }

  function ENGINE_renderList(panel){
    const list = UTIL_q(`.${CLS}-list`, panel);
    if (!list) return;
    list.innerHTML = '';

    const currentActive = FEATURE_getCanonicalKey(STATE_CH.curKey);

    const curCat = STATE_CH.curCat || CAT_ALL;
    if (STATE_CH.curKey !== currentActive) STATE_CH.curKey = currentActive;

    for (const meta of FEATURE_META){
      const canonicalKey = FEATURE_getCanonicalKey(meta.key);
      if (canonicalKey !== meta.key) continue;

      if (curCat !== CAT_ALL && CAT_forFeatureKey(canonicalKey) !== curCat) continue;

      const row = D.createElement('div');
      row.className = `${CLS}-item`;
      row.setAttribute(ATTR_CGXUI_KEY, canonicalKey);
      row.setAttribute(ATTR_CGXUI_STATE, canonicalKey === STATE_CH.curKey ? 'active' : 'idle');

      const left = D.createElement('div');
      left.className = `${CLS}-item-left`;

      const ico = D.createElement('div');
      ico.className = `${CLS}-ico`;
      ico.textContent = meta.icon || '•';

      const labels = D.createElement('div');
      labels.style.display = 'flex';
      labels.style.flexDirection = 'column';
      labels.style.minWidth = '0';

      const a = D.createElement('div');
      a.className = `${CLS}-mainlbl`;
      a.textContent = meta.label;

      const b = D.createElement('div');
      b.className = `${CLS}-sublbl`;
      b.textContent = meta.subtitle;

      labels.append(a, b);
      left.append(ico, labels);

      // per-feature enable switch
      const sw = D.createElement('button');
      sw.type = 'button';
      sw.className = `${CLS}-item-switch`;
      sw.setAttribute('aria-label', `Toggle ${meta.label}`);
      sw.innerHTML = '<i></i>';
      sw.setAttribute(ATTR_CGXUI_STATE, SAFE_isOn(canonicalKey) ? 'on' : 'off');

      sw.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const now = sw.getAttribute(ATTR_CGXUI_STATE) !== 'on';
        sw.setAttribute(ATTR_CGXUI_STATE, now ? 'on' : 'off');
        SAFE_setOn(canonicalKey, now);

      }, true);

      row.addEventListener('click', () => {
        if (STATE_CH.curKey === canonicalKey) return;
        STATE_CH.curKey = canonicalKey;

        UTIL_qAll(`${SEL_CHUB_PANEL} .${CLS}-item`).forEach(x => {
          const k = x.getAttribute(ATTR_CGXUI_KEY);
          x.setAttribute(ATTR_CGXUI_STATE, k === STATE_CH.curKey ? 'active' : 'idle');
        });

        SAFE_setMode(STATE_CH.curKey, STATE_CH.curMode);
        ENGINE_renderDetail(panel);
      }, true);

      row.append(left, sw);
      list.appendChild(row);
    }
  }

  function ENGINE_renderControls(panel){
    // remove old controls
    UTIL_qAll(`${SEL_CHUB_PANEL} .${CLS}-controls`).forEach(x => { try { x.remove(); } catch {} });

    const canonicalKey = FEATURE_getCanonicalKey(STATE_CH.curKey);
    if (canonicalKey !== STATE_CH.curKey) STATE_CH.curKey = canonicalKey;
    const defs = FEATURE_getControlsForKey(canonicalKey);
    if (!Array.isArray(defs) || defs.length === 0) {
      const wrap = D.createElement('div');
      wrap.className = `${CLS}-controls`;

      const row = D.createElement('div');
      row.className = `${CLS}-row`;

      const msg = D.createElement('div');
      msg.style.opacity = '0.75';
      msg.style.fontSize = '12px';
      msg.textContent = 'No controls for this tab (plugin/module missing).';

      row.appendChild(msg);
      wrap.appendChild(row);

      const body = UTIL_q(`.${CLS}-body`, panel);
      if (body) body.insertAdjacentElement('afterend', wrap);
      else panel.appendChild(wrap);
      return;
    }

    const wrap = D.createElement('div');
    wrap.className = `${CLS}-controls`;

    const getValue = (def) => (typeof def.getLive === 'function') ? def.getLive() : STORE_getOpt(STATE_CH.curKey, def.key, def.def);
    const applyValue = (def, v) => {
      if (typeof def.setLive === 'function') def.setLive(v);
      else STORE_setOpt(STATE_CH.curKey, def.key, v);
    };

    let currentGroup = null;
    for (const def of defs){
      const groupLabel = def.group || null;
      if (groupLabel && groupLabel !== currentGroup){
        const title = D.createElement('div');
        title.className = `${CLS}-group-title`;
        title.textContent = groupLabel;
        wrap.appendChild(title);
        currentGroup = groupLabel;
      } else if (!groupLabel){
        currentGroup = null;
      }

      const row = D.createElement('div');
      // ✅ Action rows need a different layout to prevent label “word stacking”
      // when the right side (buttons) is wider than the panel.
      row.className = `${CLS}-ctrlrow${def.type === 'action' ? ` ${CLS}-ctrlrow-action` : ''}`;

      const labGroup = D.createElement('div');
      labGroup.className = `${CLS}-ctrlLabGroup`;

      const lab = D.createElement('div');
      lab.className = `${CLS}-ctrllab`;
      lab.textContent = def.label ?? def.key ?? '';
      labGroup.appendChild(lab);

      if (def.help){
        const hint = D.createElement('div');
        hint.className = `${CLS}-ctrlHint`;
        hint.textContent = def.help;
        labGroup.appendChild(hint);
      }

      const right = D.createElement('div');
      right.className = `${CLS}-ctrlui`;
      row.append(labGroup, right);

      const curVal = getValue(def);

      if (def.type === 'toggle'){
        const sw = D.createElement('button');
        sw.type = 'button';
        sw.className = `${CLS}-miniSwitch`;
        sw.innerHTML = '<i></i>';
        sw.setAttribute(ATTR_CGXUI_STATE, curVal ? 'on' : 'off');

        sw.addEventListener('click', () => {
          const now = sw.getAttribute(ATTR_CGXUI_STATE) !== 'on';
          sw.setAttribute(ATTR_CGXUI_STATE, now ? 'on' : 'off');
          applyValue(def, now);
        }, true);

        right.appendChild(sw);
      }
      else if (def.type === 'select'){
        const sel = D.createElement('select');
        sel.className = `${CLS}-select2`;

        (def.opts || []).forEach(([v, t]) => {
          const o = D.createElement('option');
          o.value = v;
          o.textContent = t;
          sel.appendChild(o);
        });

        sel.value = (curVal ?? def.def ?? (def.opts?.[0]?.[0] ?? ''));
        sel.addEventListener('change', () => applyValue(def, sel.value), true);
        right.appendChild(sel);
      }
      else if (def.type === 'range'){
        const box = D.createElement('div');
        box.className = `${CLS}-rangebox`;

        const inp = D.createElement('input');
        inp.type = 'range';
        inp.min = def.min;
        inp.max = def.max;
        inp.step = def.step;
        inp.dataset.featureKey = STATE_CH.curKey;
        inp.dataset.optionKey = def.key;

        const initial = (curVal ?? def.def ?? def.min ?? 0);
        inp.value = String(initial);

        const val = D.createElement('span');
        val.className = `${CLS}-rangeval`;

        const fmt = (x) => def.unit ? `${x}${def.unit}` : (Number(def.max) <= 1 ? (+x).toFixed(2) : String(x));
        val.textContent = fmt(inp.value);

        inp.addEventListener('input', () => {
          val.textContent = fmt(inp.value);
          const out = (Number(def.max) <= 1) ? parseFloat(inp.value) : parseInt(inp.value, 10);
          applyValue(def, out);
        }, true);

        box.append(inp, val);
        right.appendChild(box);
      }

      else if (def.type === 'action'){
        const actionWrap = D.createElement('div');
        actionWrap.className = `${CLS}-ctrlAction`;

        const btnGroup = D.createElement('div');
        btnGroup.className = `${CLS}-ctrlActionBtns`;

        const status = D.createElement('span');
        status.className = `${CLS}-ctrlActionStatus`;
        status.textContent = def.statusText || '';

        const buttons = (Array.isArray(def.buttons) && def.buttons.length)
          ? def.buttons
          : [{
              label: def.buttonLabel || def.label || 'Run',
              action: def.action,
              primary: true,
            }];

        buttons.forEach((btnDef) => {
          const btn = D.createElement('button');
          btn.type = 'button';
          btn.className = `${CLS}-actionBtn${btnDef.primary ? ' primary' : ''}`;
          btn.textContent = btnDef.label || 'Run';
          if (btnDef.disabled) btn.disabled = true;

          btn.addEventListener('click', async (evt) => {
            evt.preventDefault();
            const handler = btnDef.action || def.action;
            if (typeof handler !== 'function') {
              status.textContent = 'No handler.';
              return;
            }
            btn.disabled = true;
            status.textContent = btnDef.statusLoading || 'Working…';
            try {
              const result = await Promise.resolve(handler());
              const msg = ENGINE_parseActionMessage(result, btnDef.successText || def.successText || '');
              status.textContent = msg || '';
            } catch (error) {
              status.textContent = btnDef.errorText || error?.message || 'Failed';
            } finally {
              btn.disabled = false;
            }
            PLUG_afterAction(canonicalKey, panel);
          }, true);

          btnGroup.appendChild(btn);
        });

        actionWrap.append(btnGroup, status);

        // Extra custom UI for this action (optional)
        if (typeof def.render === 'function') {
          try {
            const extra = def.render({ panel, wrap, row, right, actionWrap, status });
            if (extra) actionWrap.appendChild(extra);
          } catch (e) {
            console.warn('[ControlHub] action render failed', e);
          }
        }
        right.appendChild(actionWrap);
      }

      wrap.appendChild(row);
    }

    if (STATE_CH.curKey === FEATURE_KEY_SECTION_BANDS) {
      const row = D.createElement('div');
      row.className = `${CLS}-ctrlrow ${CLS}-band-toggle-row`;

      const lab = D.createElement('div');
      lab.className = `${CLS}-ctrllab`;
      lab.textContent = 'Bands auto-mode';

      const right = D.createElement('div');
      right.className = `${CLS}-ctrlui`;

      const btn = D.createElement('button');
      btn.type = 'button';
      btn.className = `${CLS}-band-toggle`;
      btn.setAttribute('aria-label', 'Toggle section bands auto-mode');
      btn.addEventListener('click', () => {
        HO_toggleSectionBandsAutoMode();
      }, true);

      right.appendChild(btn);
      row.append(lab, right);
      wrap.appendChild(row);

      STATE_CH.sectionBandsBtn = btn;
      ENGINE_updateSectionBandsButtonState();
    } else {
      STATE_CH.sectionBandsBtn = null;
    }

    const body = UTIL_q(`.${CLS}-body`, panel);
    if (body) body.insertAdjacentElement('afterend', wrap);
    else panel.appendChild(wrap);
  }


  function PLUG_clearFeatureArtifacts(panel){
    // Removes per-feature plugin UI that is meant to exist only while a tab is active.
    // Plugins should mark such nodes with [data-h2o-chub-artifact="1"].
    try {
      panel.querySelectorAll(`[${ATTR_CHUB_ART}="1"]`).forEach(n => { try { n.remove(); } catch {} });
    } catch {}
  }

function ENGINE_renderDetail(panel){
    const canonicalKey = FEATURE_getCanonicalKey(STATE_CH.curKey);
    if (canonicalKey !== STATE_CH.curKey) STATE_CH.curKey = canonicalKey;

    PLUG_clearFeatureArtifacts(panel);
    const meta = FEATURE_META.find(f => f.key === canonicalKey) || FEATURE_META[0];
    const pill = UTIL_q(`.${CLS}-pill`, panel);
    const fn   = UTIL_q(`.${CLS}-fn`, panel);
    const fs   = UTIL_q(`.${CLS}-fs`, panel);
    // NOTE: keep detail rendering stable (panel-scoped queries only)

    if (pill) pill.textContent = `Mode: ${STATE_CH.curMode[0].toUpperCase() + STATE_CH.curMode.slice(1)}`;
    if (fn) fn.textContent = meta.label;
    if (fs) fs.textContent = meta.subtitle;

    const bd = UTIL_q(`.${CLS}-body`, panel);
    if (bd) bd.textContent = SAFE_getDesc(meta.key, STATE_CH.curMode);

    const existingDataSummary = UTIL_q(`.${CLS}-data-summary`, panel);
    if (existingDataSummary) {
      try { existingDataSummary.remove(); } catch {}
    }
    PLUG_runDetailHook(meta.key, panel);

    const existingThemeAction = UTIL_q(`.${CLS}-theme-action`, panel);
    if (existingThemeAction) {
      try { existingThemeAction.remove(); } catch {}
    }

    if (meta.key === 'themesPanel') {
      const action = D.createElement('div');
      action.className = `${CLS}-theme-action`;
      const btn = D.createElement('button');
      btn.type = 'button';
      btn.className = `${CLS}-themeBtn`;
      btn.textContent = 'Open Themes Panel';

      let retry = 0;
      const checkReady = () => {
        // ✅ Themes Panel module path adapter:
        //    - legacy: H2O.TP.themes.api.open
        //    - current: H2O.TP.thmspnl.api.open  (Themes Panel v2.1.5+)
        const api = W.H2O?.TP?.thmspnl?.api || W.H2O?.TP?.themes?.api;
        const ready = !!(api?.open);
        btn.disabled = !ready;
        btn.title = ready ? 'Launch the themes customization panel' : 'Themes panel is loading…';
        if (!ready && retry < 6) {
          retry += 1;
          W.setTimeout(checkReady, 600);
        }
      };
      checkReady();

      btn.addEventListener('click', () => {
        SAFE_call('open-theme-panel', () => {
          (W.H2O?.TP?.thmspnl?.api || W.H2O?.TP?.themes?.api)?.open?.();
          CORE_CH_hidePanel();
        });
      }, true);
      action.appendChild(btn);

      if (bd) bd.insertAdjacentElement('afterend', action);
      else panel.appendChild(action);
    }

    ENGINE_renderControls(panel);
  }

  function ENGINE_renderAll(panel){
    ENGINE_renderTabs(panel);
    ENGINE_renderCategories(panel);
    ENGINE_renderList(panel);
    ENGINE_renderDetail(panel);
  }

  /* ───────────────────────────── 🟨 TIME — SCHEDULING / OBSERVERS 📝🔓💥 ───────────────────────────── */

  /* ───────────────────────────── 🟦 SURFACE — API (definitions only) 📄🔒💧 ───────────────────────────── */

  /* ───────────────────────────── ⚫️ LIFECYCLE — INIT / STARTUP 📝🔓💥 ───────────────────────────── */

  function CORE_CH_showPanel(){
    const b = DOM_ensureBackdrop();
    const p = DOM_buildPanel();

    if (b && b.parentElement) b.parentElement.appendChild(b);
    if (p && p.parentElement) p.parentElement.appendChild(p);

    b.removeAttribute('hidden');
    p.removeAttribute('hidden');

    STATE_CH.curCat = CAT_loadCurrent();
    ENGINE_renderAll(p);

    UTIL_emit(EV_CHUB_CHANGED_V1, { action: 'show' });
  }

  function CORE_CH_hidePanel(){
    const b = UTIL_q(SEL_CHUB_BACKDROP);
    const p = UTIL_q(SEL_CHUB_PANEL);
    if (b) b.setAttribute('hidden', 'true');
    if (p) p.setAttribute('hidden', 'true');

    UTIL_emit(EV_CHUB_CHANGED_V1, { action: 'hide' });
  }
  function CORE_CH_boot(){
    // If we already booted AND the launcher exists, do nothing.
    const hasBtn = !!UTIL_q(SEL_CHUB_TOPBTN);
    if (STATE_CH.booted && hasBtn) return;

    // Repair: older v3.4.2 could set booted=true then crash before creating the launcher.
    if (STATE_CH.booted && !hasBtn) {
      DIAG_step('boot-repair', 'booted=true but launcher missing');
      SAFE_call('boot-repair.cleanups', () => CLEAN_runAll());
      STATE_CH.booted = false;
    }

    if (STATE_CH._booting) return;
    STATE_CH._booting = true;

    try {
      DIAG_step('boot', `${TOK}/${PID}`);

      // migrate old disk state once (defensive)
      SAFE_call('migrateHubOnce', () => MIG_CH_migrateHubOnce());

      // css (defensive)
      SAFE_call('ensureStyle', () => CSS_CH_ensureStyle());

      // ensure launcher (topbar/fixed fallback)
      DOM_placeTopButton();

      // self-heal: if another module or host rerender drops our launcher, restore it.
      if (!STATE_CH.buttonRepairTimer) {
        STATE_CH.buttonRepairTimer = W.setInterval(() => {
          SAFE_call('button-repair.tick', () => {
            if (!STATE_CH.booted) return;
            const dock = UTIL_q(SEL_CHUB_DOCK);
            const btn = UTIL_q(SEL_CHUB_TOPBTN);
            if (!dock || !btn || btn.parentElement !== dock) DOM_placeTopButton();
          });
        }, CFG_CH.BUTTON_REPAIR_MS);
        CLEAN_add(() => {
          if (STATE_CH.buttonRepairTimer) {
            try { W.clearInterval(STATE_CH.buttonRepairTimer); } catch {}
            STATE_CH.buttonRepairTimer = null;
          }
        });
      }

      // re-bind listener cleanly (avoid duplicates on repair boots)
      if (STATE_CH.sectionBandsBtnListener) {
        try { W.removeEventListener(EV_SECTION_BANDS_AUTO, STATE_CH.sectionBandsBtnListener, true); } catch {}
        STATE_CH.sectionBandsBtnListener = null;
      }

      const bandAutoSync = () => ENGINE_updateSectionBandsButtonState();
      STATE_CH.sectionBandsBtnListener = bandAutoSync;
      W.addEventListener(EV_SECTION_BANDS_AUTO, bandAutoSync, true);
      CLEAN_add(() => { try { W.removeEventListener(EV_SECTION_BANDS_AUTO, bandAutoSync, true); } catch {} });

      UTIL_emit(EV_CHUB_READY_V1, { tok: TOK, pid: PID, skid: SkID });

      // expose minimal internal api (not a promised stable port; internal use)
      MOD_OBJ.api = MOD_OBJ.api || {};
      MOD_OBJ.api.show = CORE_CH_showPanel;
      MOD_OBJ.api.hide = CORE_CH_hidePanel;
      MOD_OBJ.api.dispose = CORE_CH_dispose;
      MOD_OBJ.api.registerPlugin = PLUG_register;
      MOD_OBJ.api.unregisterPlugin = PLUG_unregister;
      MOD_OBJ.api.getSkin = PLUG_skin;
      MOD_OBJ.api.invalidate = CORE_CH_invalidate;

      CLEAN_add(() => {
        try { if (MOD_OBJ.api) delete MOD_OBJ.api; } catch {}
      });

      STATE_CH.booted = true;
    } catch (e) {
      DIAG_err('boot failed', e);
      STATE_CH.booted = false;
    } finally {
      STATE_CH._booting = false;
    }
  }


  /* ───────────────────────────── ⚪️ LIFECYCLE — DISPOSE / CLEANUP 📝🔓💥 ───────────────────────────── */

  function CORE_CH_dispose(){
    if (!STATE_CH.booted) return;
    STATE_CH.booted = false;

    DIAG_step('dispose');

    // timers

    // hide/remove owned UI
    SAFE_call('hidePanel', () => CORE_CH_hidePanel());
    const p = UTIL_q(SEL_CHUB_PANEL);
    const b = UTIL_q(SEL_CHUB_BACKDROP);
    const btn = UTIL_q(SEL_CHUB_TOPBTN);
    const dock = UTIL_q(SEL_CHUB_DOCK);

    if (p) try { p.remove(); } catch {}
    if (b) try { b.remove(); } catch {}
    if (btn) try { btn.remove(); } catch {}
    if (dock) try { dock.remove(); } catch {}

    if (STATE_CH.buttonRepairTimer) {
      try { W.clearInterval(STATE_CH.buttonRepairTimer); } catch {}
      STATE_CH.buttonRepairTimer = null;
    }

    CLEAN_runAll();
  }


    // [BRIDGE] Prompt Manager (v3.1.1+) ready handshake (defensive)
    try {
      if (!MOD_OBJ.state) MOD_OBJ.state = {};
      if (!MOD_OBJ.state._pmReadyHooked) {
        MOD_OBJ.state._pmReadyHooked = true;
        W.addEventListener(EV_PM_READY_V1, (e) => {
          try {
            MOD_OBJ.state.pm = e?.detail || null;
            MOD_OBJ.state.pmApi = e?.detail?.api || null;
          } catch {}
        });
      }
    } catch {}


  // Boot now (document-idle). Defensive: wait for DOM if needed.
  const bootNow = () => SAFE_call('boot-top', () => CORE_CH_boot());
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', bootNow, { once: true });
  else bootNow();

  } catch (e) {
    try { console.error('[H2O ControlHub] ❌ top-level crash', e); } catch {}
  }

})();
