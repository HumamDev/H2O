// ==UserScript==
// @h2o-id      1a1z.minimap.quick.controls
// @name         1B1.🔴⚡ MiniMap Quick Controls 🗺️
// @namespace    H2O.Prime.CGX.MiniMapQuickControls
// @version      1.1.2
// @description  Modern Quick Controls Popover for MiniMap: middle-click toggle opens menu; nudge position (persisted + clamped) + size presets (S/M/L) + theme presets. UI-only plugin: writes CSS vars + disk prefs.
// @author       HumamDev
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  // Realm-safe window (TM + top)
  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const TOPW = W.top || W;

  // Mark plugin
  try {
    TOPW.H2O_MM_QUICK_PLUGIN = true;
    TOPW.H2O_MM_QUICK_PLUGIN_VER = '1.0.1';
  } catch {}

  // Kernel-authoritative bridge access (no fallbacks here; util.mm decides)
  const MM = () => (TOPW.H2O_MM_SHARED?.get?.() || null)?.util?.mm || null;
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
    PAD: 8,
    BOOT_TRIES: 60,
    BOOT_GAP_MS: 160,
    POP_GAP: 8,
    POP_W: 236,
    POP_ANIM_MS: 160,
    NUDGE_STEP: 4,
    NUDGE_STEP_SHIFT: 12,
    DEFAULT_AXIS_X: 16,
    DEFAULT_AXIS_Y: 0,
    OPACITY_MIN: 0.20,
    OPACITY_MAX: 1.00,
    OPACITY_STEP: 0.01,
  });

  // ───────────────────────────── Size Presets (CSS vars only) ─────────────────────────────
  // Single-source geometry packs: apply ONLY CSS variables; never hard-code styles.
  const SIZE_PRESETS = Object.freeze({
    s: {
      '--box-w':'64px', '--box-h':'32px', '--box-r':'7px',
      '--toggle-x':'0px', '--dial-x':'0px',
      '--mm-btn-w':'48px', '--mm-btn-h':'22px', '--mm-btn-r':'6px',
      '--mm-w':'calc(var(--mm-btn-w) + (2 * var(--mm-side-lane)))',
      '--cgxui-mnmp-btn-width':'48px', '--cgxui-mnmp-btn-height':'22px',
    },
    m: {
      '--box-w':'72px', '--box-h':'36px', '--box-r':'8px',
      '--toggle-x':'0px', '--dial-x':'0px',
      '--mm-btn-w':'56px', '--mm-btn-h':'24px', '--mm-btn-r':'6px',
      '--mm-w':'calc(var(--mm-btn-w) + (2 * var(--mm-side-lane)))',
      '--cgxui-mnmp-btn-width':'56px', '--cgxui-mnmp-btn-height':'24px',
    },
    l: {
      '--box-w':'80px', '--box-h':'40px', '--box-r':'9px',
      '--toggle-x':'0px', '--dial-x':'0px',
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
    KEY_THEME:   'ui:theme:v1',
    KEY_SIZE:    'ui:size-preset:v1',
    KEY_OPACITY: 'ui:btn-opacity:v1',
  });

  function log(...a){ try { console.log('[MiniMap Quick]', ...a); } catch {} }
  function warn(...a){ try { console.warn('[MiniMap Quick]', ...a); } catch {} }

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
  function keyTheme(){ return `${nsDisk()}:${DISK.KEY_THEME}`; }
  function keySize(){ return `${nsDisk()}:${DISK.KEY_SIZE}`; }
  function keyOpacity(){ return `${nsDisk()}:${DISK.KEY_OPACITY}`; }

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
    // Modern matte popover + theme packs + axis transform applied to ROOT (so the whole stack moves).
    const S_ROOT = SEL.ROOT;
    const S_POPO = SEL.QUICK_POPO;
    const S_TOGGLE = SEL.TOGGLE;
    const S_AUX = SEL.AUX;

    return `
${S_ROOT}{
  transform: translate(calc(var(--axis-x, 0px)), calc(var(--axis-y, 0px)));
  will-change: transform;
}
${S_TOGGLE}:not([${ATTR.CGXUI_STATE}~="faded"]){
  opacity: var(--mm-ctl-opacity, var(--mm-btn-opacity));
}
${S_AUX}:not([${ATTR.CGXUI_STATE}~="collapsed"]){
  opacity: var(--mm-ctl-opacity, var(--mm-btn-opacity)) !important;
}

/* ── Popover: modern matte glass ───────────────────────── */
${S_POPO}{
  position: fixed;
  z-index: 2147483647;
  width: ${CFG.POP_W}px;
  border-radius: 18px;
  padding: 12px;
  background:
    radial-gradient(180px 90px at 86% -6%, rgba(255,215,0,0.15), rgba(255,215,0,0) 72%),
    linear-gradient(160deg, rgba(30,33,40,0.96), rgba(12,13,17,0.95));
  border: 1px solid rgba(255,255,255,0.12);
  box-shadow:
    0 22px 52px rgba(0,0,0,0.58),
    0 10px 20px rgba(0,0,0,0.30),
    inset 0 1px 0 rgba(255,255,255,0.10);
  backdrop-filter: blur(16px) saturate(1.1);
  -webkit-backdrop-filter: blur(16px) saturate(1.1);
  color: rgba(245,245,245,0.92);
  font: 520 12px/1.25 "SF Pro Text","Avenir Next","Segoe UI",system-ui,sans-serif;

  display: none;
  pointer-events: auto;
  overflow: hidden;

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
  background: linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0));
  opacity: 0.45;
}

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
}
${S_POPO} .mmqc-sub{
  font-size: 10.5px;
  opacity: 0.68;
  margin-left: 2px;
  margin-top: 3px;
}

${S_POPO} .mmqc-close{
  width: 26px; height: 26px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.20);
  background: linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.05));
  color: rgba(255,255,255,0.78);
  display:grid; place-items:center;
  cursor:pointer;
  opacity: 0.9;
  transition: opacity .16s ease, filter .16s ease, transform .16s ease, background .16s ease, border-color .16s ease;
}
${S_POPO} .mmqc-close:hover{ opacity: 1; filter: brightness(1.12); border-color: rgba(255,215,0,0.45); }
${S_POPO} .mmqc-close:active{ transform: translateY(0.5px) scale(0.98); }

${S_POPO} .mmqc-div{
  height: 1px;
  background: linear-gradient(90deg, rgba(255,255,255,0.02), rgba(255,255,255,0.12), rgba(255,255,255,0.02));
  margin: 12px 2px 10px;
}

${S_POPO} .mmqc-sec{ margin-top: 8px; padding: 2px; }
${S_POPO} .mmqc-lbl{
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.11em;
  opacity: 0.62;
  margin: 0 2px 8px;
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

${S_POPO} .mmqc-btn{
  height: 33px;
  border-radius: 11px;
  border: 1px solid rgba(255,255,255,0.17);
  background: linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.045));
  color: rgba(245,245,245,0.92);
  cursor: pointer;
  user-select: none;
  font-weight: 700;
  transition: filter .16s ease, background .16s ease, border-color .16s ease, transform .16s ease, opacity .16s ease, box-shadow .16s ease;
}
${S_POPO} .mmqc-btn:hover{
  filter: brightness(1.12);
  background: linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.07));
  border-color: rgba(255,215,0,0.35);
  box-shadow: 0 6px 16px rgba(0,0,0,0.26);
}
${S_POPO} .mmqc-btn:active{ transform: translateY(0.5px) scale(0.985); }

${S_POPO} .mmqc-reset{
  align-self: flex-end;
  min-width: 112px;
  height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.22);
  background: linear-gradient(180deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05));
  color: rgba(245,245,245,0.94);
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
${S_POPO} .mmqc-reset:hover{
  opacity: 1;
  filter: brightness(1.06);
  border-color: rgba(255,215,0,0.45);
  box-shadow: 0 8px 20px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.22);
}
${S_POPO} .mmqc-reset:active{ transform: translateY(0.5px) scale(0.985); }
${S_POPO} .mmqc-reset .mmqc-reset-ico{
  width: 19px;
  height: 19px;
  border-radius: 999px;
  display: inline-grid;
  place-items: center;
  font-size: 11px;
  background: rgba(255,255,255,0.16);
  border: 1px solid rgba(255,255,255,0.26);
}
${S_POPO} .mmqc-reset .mmqc-reset-txt{
  line-height: 1;
}

${S_POPO} .mmqc-pills{
  display:flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 0 2px;
}
${S_POPO} .mmqc-pill{
  height: 32px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.18);
  background: linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04));
  color: rgba(245,245,245,0.90);
  cursor: pointer;
  user-select: none;
  display:flex;
  align-items:center;
  gap: 6px;
  opacity: 0.82;
  transition: opacity .16s ease, filter .16s ease, transform .16s ease, background .16s ease, border-color .16s ease;
}
${S_POPO} .mmqc-pill:hover{
  opacity: 1;
  filter: brightness(1.08);
  border-color: rgba(255,215,0,0.35);
}
${S_POPO} .mmqc-pill:active{ transform: translateY(0.5px) scale(0.99); }
${S_POPO} .mmqc-pill[aria-pressed="true"]{
  opacity: 1;
  background: linear-gradient(180deg, rgba(255,215,0,0.20), rgba(255,215,0,0.06));
  border-color: rgba(255,215,0,0.52);
  box-shadow: 0 0 0 1px rgba(255,215,0,0.24) inset, 0 7px 18px rgba(0,0,0,0.24);
}

${S_POPO} .mmqc-op{
  display:flex;
  flex-direction:column;
  gap: 8px;
  padding: 0 2px;
}
${S_POPO} .mmqc-op-meta{
  display:flex;
  align-items:center;
  justify-content:space-between;
  font-size: 10.5px;
  opacity: 0.84;
}
${S_POPO} .mmqc-op-note{ opacity: 0.68; }
${S_POPO} .mmqc-op-val{ font-weight: 700; opacity: 0.96; }
${S_POPO} .mmqc-op-tools{
  display:flex;
  align-items:center;
  gap: 8px;
}
${S_POPO} .mmqc-op-reset{
  height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.18);
  background: linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04));
  color: rgba(245,245,245,0.90);
  font: 600 11px/1 "SF Pro Text","Avenir Next","Segoe UI",system-ui,sans-serif;
  cursor: pointer;
  transition: filter .16s ease, border-color .16s ease, transform .16s ease;
}
${S_POPO} .mmqc-op-reset:hover{
  filter: brightness(1.08);
  border-color: rgba(255,215,0,0.36);
}
${S_POPO} .mmqc-op-reset:active{ transform: translateY(0.5px) scale(0.985); }
${S_POPO} .mmqc-range{
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 28px;
  background: transparent;
  cursor: pointer;
}
${S_POPO} .mmqc-range:focus{ outline: none; }
${S_POPO} .mmqc-range::-webkit-slider-runnable-track{
  height: 8px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(255,255,255,0.18), rgba(255,215,0,0.28));
  border: 1px solid rgba(255,255,255,0.16);
}
${S_POPO} .mmqc-range::-webkit-slider-thumb{
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  margin-top: -5px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(226,226,226,0.94));
  border: 1px solid rgba(0,0,0,0.30);
  box-shadow: 0 2px 8px rgba(0,0,0,0.35);
}
${S_POPO} .mmqc-range::-moz-range-track{
  height: 8px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(255,255,255,0.18), rgba(255,215,0,0.28));
  border: 1px solid rgba(255,255,255,0.16);
}
${S_POPO} .mmqc-range::-moz-range-thumb{
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(226,226,226,0.94));
  border: 1px solid rgba(0,0,0,0.30);
  box-shadow: 0 2px 8px rgba(0,0,0,0.35);
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
  --mm-btn-bg-active: rgba(255,215,0,0.18);
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
    root.style.setProperty('--axis-x', `${Math.round(x)}px`);
    root.style.setProperty('--axis-y', `${Math.round(y)}px`);
  }

  function clampAxisToViewport(refs, x, y){
    const root = refs?.root;
    if (!root) return { x, y };

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
    if (left < pad) dx = pad - left;
    else if (right > (vw - pad)) dx = (vw - pad) - right;

    if (top < pad) dy = pad - top;
    else if (bottom > (vh - pad)) dy = (vh - pad) - bottom;

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
    const axisX = parsePx(v?.axisX, 0);
    const axisY = parsePx(v?.axisY, 0);
    return { axisX, axisY };
  }

  function applyAxisFromDisk(refs){
    const root = refs?.root;
    if (!root) return false;
    const clamped = clampAxisToViewport(refs, CFG.DEFAULT_AXIS_X, CFG.DEFAULT_AXIS_Y);
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



  // ───────────────────────────── Popover UI ─────────────────────────────

  function buildPopover(){
    const pop = document.createElement('div');
    pop.setAttribute(ATTR.CGXUI_OWNER, SkID);
    pop.setAttribute(ATTR.CGXUI, UI.QUICK_POPO);
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'MiniMap Quick Controls');
    pop.innerHTML = `
      <div class="mmqc-hdr">
        <div>
          <div class="mmqc-title">⚡ Quick Controls</div>
          <div class="mmqc-sub">Middle-click toggle · Shift = big nudge</div>
        </div>
        <button type="button" class="mmqc-close" aria-label="Close">✕</button>
      </div>

      <div class="mmqc-sec" data-sec="position">
        <div class="mmqc-lbl">📍 Position</div>
        <div class="mmqc-row">
          <div class="mmqc-nudge">
            <button type="button" class="mmqc-btn" data-act="nudge_left"  aria-label="Nudge left">←</button>
            <button type="button" class="mmqc-btn" data-act="nudge_up"    aria-label="Nudge up">↑</button>
            <button type="button" class="mmqc-btn" data-act="nudge_down"  aria-label="Nudge down">↓</button>
            <button type="button" class="mmqc-btn" data-act="nudge_right" aria-label="Nudge right">→</button>
          </div>
          <button type="button" class="mmqc-reset" data-act="reset_pos" aria-label="Reset position">
            <span class="mmqc-reset-ico" aria-hidden="true">⟲</span>
            <span class="mmqc-reset-txt">Reset</span>
          </button>
        </div>
      </div>
      <div class="mmqc-div"></div>

      <div class="mmqc-sec" data-sec="size">
        <div class="mmqc-lbl">📐 Size</div>
        <div class="mmqc-pills">
          <button type="button" class="mmqc-pill" data-size="s" aria-pressed="false"><span>📏</span><span>S</span></button>
          <button type="button" class="mmqc-pill" data-size="m" aria-pressed="false"><span>📐</span><span>M</span></button>
          <button type="button" class="mmqc-pill" data-size="l" aria-pressed="false"><span>📌</span><span>L</span></button>
        </div>
      </div>

      <div class="mmqc-div"></div>

      <div class="mmqc-sec" data-sec="opacity">
        <div class="mmqc-lbl">🫥 Opacity (fine)</div>
        <div class="mmqc-op">
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
          <div class="mmqc-op-meta">
            <span class="mmqc-op-note">Lower = stealthy, higher = readable</span>
            <div class="mmqc-op-tools">
              <span class="mmqc-op-val" data-opacity-val>62%</span>
              <button type="button" class="mmqc-op-reset" data-act="reset_opacity" aria-label="Reset opacity to theme">Reset</button>
            </div>
          </div>
        </div>
      </div>

      <div class="mmqc-div"></div>


      <div class="mmqc-sec" data-sec="theme">
        <div class="mmqc-lbl">🎨 Theme</div>
        <div class="mmqc-pills">
          <button type="button" class="mmqc-pill" data-theme="stealth"   aria-pressed="false"><span>🕶️</span><span>Stealth</span></button>
          <button type="button" class="mmqc-pill" data-theme="readable"  aria-pressed="false"><span>👓</span><span>Readable</span></button>
          <button type="button" class="mmqc-pill" data-theme="contrast"  aria-pressed="false"><span>⚡</span><span>Hi-Contrast</span></button>
        </div>
      </div>
    `;
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

  function getPopoverAnchor(refs){
    if (refs?.panel) return refs.panel;
    return refs?.toggle || null;
  }

  function syncThemePills(pop, themeKey){
    const pills = Array.from(pop.querySelectorAll('.mmqc-pill'));
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

  function syncOpacityUI(pop, root){
    if (!pop || !root) return;
    const range = pop.querySelector('[data-opacity-range]');
    const valEl = pop.querySelector('[data-opacity-val]');
    const v = getOpacity(root);
    if (range) range.value = String(v);
    if (valEl) valEl.textContent = `${Math.round(v * 100)}%`;
  }

  // ───────────────────────────── Actions ─────────────────────────────

  function doNudge(refs, dx, dy){
    const root = refs?.root;
    if (!root) return;
    const cur = S.currentAxis || getAxis(root);
    const targetX = cur.x + dx;
    const targetY = cur.y + dy;

    // Horizontal nudges should not be restricted by viewport clamping.
    if (dy === 0 && dx !== 0) {
      setAxis(root, targetX, targetY);
      persistAxis(targetX, targetY);
      S.currentAxis = { x: targetX, y: targetY };
      return;
    }

    const next = clampAxisToViewport(refs, targetX, targetY);
    persistAxis(next.x, next.y);
    S.currentAxis = { x: next.x, y: next.y };
  }

  function doReset(refs){
    const root = refs?.root;
    if (!root) return;
    const base = S.initialAxis || getAxis(root);
    const bx = Number.isFinite(base?.axisX) ? base.axisX : (Number.isFinite(base?.x) ? base.x : CFG.DEFAULT_AXIS_X);
    const by = Number.isFinite(base?.axisY) ? base.axisY : (Number.isFinite(base?.y) ? base.y : CFG.DEFAULT_AXIS_Y);
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
    initialAxis: null,
    currentAxis: null,
  };

  function captureInitialAxis(refs){
    if (S.initialAxis) return;
    const root = refs?.root;
    if (!root) return;
    const a = getAxis(root);
    S.initialAxis = { axisX: a.x, axisY: a.y };
    S.currentAxis = { x: a.x, y: a.y };
  }

  function on(target, ev, fn, opts){
    if (!target || !target.addEventListener) return () => {};
    target.addEventListener(ev, fn, opts);
    const off = () => { try { target.removeEventListener(ev, fn, opts); } catch {} };
    S.off.push(off);
    return off;
  }

  function closePopover(){
    if (!S.pop) return;
    setStateTok(S.pop, 'open', false);
  }

  function openPopover(refs){
    if (!S.pop) return;
    if (refs?.root) setOpacity(refs.root, getOpacity(refs.root), false);
    const anchor = getPopoverAnchor(refs);
    if (!anchor) return;
    positionPopover(S.pop, anchor);
    const themeKey = getTheme(refs?.root);
    const sizeKey = getSizePreset(refs?.root);
    syncThemePills(S.pop, themeKey);
    syncSizePills(S.pop, sizeKey);
    syncOpacityUI(S.pop, refs?.root);
    setStateTok(S.pop, 'open', true);
  }

  function togglePopover(refs){
    if (!S.pop) return;
    if (isOpen(S.pop)) closePopover();
    else openPopover(refs);
  }

  function mountOnce(){
    if (S.booted) return true;

    const refs = getRefs();
    if (!refs.root || !refs.toggle) return false;

    ensureStyle();

    // Ensure persisted prefs restored
    restoreTheme(refs);
    restoreSizePreset(refs);
    restoreOpacity(refs);
    applyAxisFromDisk(refs);
    captureInitialAxis(refs);
    requestAnimationFrame(() => captureInitialAxis(getRefs()));
    setTimeout(() => captureInitialAxis(getRefs()), 120);

    // Create popover (singleton)
    S.pop = document.querySelector(SEL.QUICK_POPO);
    if (!S.pop) {
      S.pop = buildPopover();
      document.body.appendChild(S.pop);
    }

    // Middle-click on TOGGLE opens menu (no extra buttons).
    // 1) Prevent browser autoscroll on middle mouse down over the toggle.
    on(refs.toggle, 'mousedown', (e) => {
      if (e.button === 1) { e.preventDefault(); }
    }, { passive: false });

    // 2) Use auxclick to detect middle click reliably.
    on(refs.toggle, 'auxclick', (e) => {
      if (e.button !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      togglePopover(getRefs());
    }, { passive: false });

    const closeBtn = S.pop.querySelector('.mmqc-close');
    on(closeBtn, 'click', (e) => { e.preventDefault(); e.stopPropagation(); closePopover(); }, { passive: false });

    on(S.pop, 'click', (e) => {
      const t = e.target;
      const act = t?.closest?.('[data-act]')?.getAttribute?.('data-act') || '';
      const theme = t?.closest?.('[data-theme]')?.getAttribute?.('data-theme') || '';
      const size = t?.closest?.('[data-size]')?.getAttribute?.('data-size') || '';
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
        }
      }
      if (size) {
        e.preventDefault(); e.stopPropagation();
        applySizePreset(refs2, size);
        syncSizePills(S.pop, size);
      }
      if (theme) {
        e.preventDefault(); e.stopPropagation();
        setTheme(refs2.root, theme);
        resetOpacityToTheme(refs2, true);
        syncThemePills(S.pop, theme);
        syncOpacityUI(S.pop, refs2.root);
      }
    }, { passive: false });

    on(S.pop, 'input', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      if (!t.matches?.('[data-opacity-range]')) return;
      const refs2 = getRefs();
      if (!refs2?.root) return;
      setOpacity(refs2.root, Number(t.value), true);
      syncOpacityUI(S.pop, refs2.root);
    }, { passive: true });

    // Click outside closes
    on(window, 'pointerdown', (e) => {
      if (!isOpen(S.pop)) return;
      const t = e.target;
      if (t?.closest?.(SEL.QUICK_POPO)) return;
      if (t?.closest?.(SEL.TOGGLE)) return; // keep open if interacting with toggle
      closePopover();
    }, true);

    // Esc closes
    on(window, 'keydown', (e) => {
      if (e.key === 'Escape' && isOpen(S.pop)) closePopover();
    }, true);

    // Re-clamp on resize
    on(window, 'resize', () => {
      const r = getRefs();
      const a = loadAxis();
      const clamped = clampAxisToViewport(r, a.axisX, a.axisY);
      persistAxis(clamped.x, clamped.y);
      S.currentAxis = { x: clamped.x, y: clamped.y };
      if (isOpen(S.pop)) positionPopover(S.pop, getPopoverAnchor(r));
    }, { passive: true });

    S.booted = true;
    log('Ready.', { ver: '1.1.0' });
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
