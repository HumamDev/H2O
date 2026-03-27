// ==UserScript==
// @h2o-id             1c1a.color.legend
// @name               1C1a.🟥🧭 Color Legend 🧭
// @namespace          H2O.Premium.CGX.color.legend
// @author             HumamDev
// @version            2.1.0
// @revision           001
// @build              260304-102754
// @description        Compact per-chat color legend: 4-page responsive editor with glassy color-pill dropdown + recent custom history.
// @match              https://chatgpt.com/*
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  // -----------------------------
  // Colors (yours)
  // -----------------------------
  const COLORS = [
    // Match Navigation Controls button base colors exactly.
    { name: 'blue',   color: '#345E9E' },
    { name: 'red',    color: '#A83A3A' },
    { name: 'green',  color: '#2C7A4A' },
    { name: 'gold',   color: '#C7A106' },
    { name: 'sky',    color: '#3FA7D6' },
    { name: 'pink',   color: '#C05C95' },
    { name: 'purple', color: '#6740A8' },
    { name: 'orange', color: '#D47A38' },
  ];

  const PRESETS = [
    'Important','Solution','Issue','Evidence','Todo','Quote','Follow-up','Risk',
    'Question','Decision','Summary','Bug','Fix'
  ];
  const COLOR_RECOMMENDED = Object.freeze({
    blue: ['Summary', 'Context', 'Question', 'Decision'],
    red: ['Risk', 'Issue', 'Bug', 'Warning'],
    green: ['Solution', 'Fix', 'Resolved', 'Validated'],
    gold: ['Important', 'Priority', 'Key point', 'Must do'],
    sky: ['Reference', 'Note', 'Clarify', 'Idea'],
    pink: ['Quote', 'Tone', 'Opinion', 'Voice'],
    purple: ['Insight', 'Pattern', 'Theme', 'Concept'],
    orange: ['Todo', 'Action', 'Follow-up', 'Next step'],
  });
  const WORD_COLOR_FALLBACK = Object.freeze({
    important: 'gold',
    solution: 'green',
    issue: 'red',
    evidence: 'sky',
    todo: 'orange',
    quote: 'pink',
    'follow-up': 'orange',
    risk: 'red',
    question: 'blue',
    decision: 'blue',
    summary: 'blue',
    bug: 'red',
    fix: 'green',
  });
  const MAX_RECENT_CUSTOM = 24;

  const HIGHLIGHT_DOT_COLORS_COL_1 = ['blue', 'red', 'green', 'gold'];
  const HIGHLIGHT_DOT_COLORS_COL_2 = ['sky', 'pink', 'purple', 'orange'];
  const HIGHLIGHT_DOT_HEX = Object.freeze({
    blue: '#3A8BFF',
    red: '#FF4A4A',
    green: '#31D158',
    gold: '#FFD700',
    sky: '#4CD3FF',
    pink: '#FF71C6',
    purple: '#A36BFF',
    orange: '#FFA63A',
  });

  const COLOR_PAGES = [
    ['blue', 'red', 'green', 'gold'],
    ['sky', 'pink', 'purple', 'orange'],
    HIGHLIGHT_DOT_COLORS_COL_1,
    HIGHLIGHT_DOT_COLORS_COL_2,
  ];
  const COLORS_BY_NAME = Object.fromEntries(COLORS.map((c) => [c.name, c]));
  const PANEL_BASE_WIDTH = Object.freeze({ s: 168, m: 188, l: 208 });
  const PANEL_NUDGE_Y = -25; // move legend panel up/down relative to button
  const WHEEL_MIN_DELTA = 90;
  const WHEEL_THROTTLE_MS = 320;
  const COMPOSER_ANCHOR_MAX_VH = 0.9;
  const COMPOSER_ANCHOR_MIN_PX = 280;
  const COMPOSER_ANCHOR_MAX_PX = 1200;

  // Same mount slot used by 1A3 nav up/down buttons.
  const NAV_LEFT_SLOT_SELECTOR = '.cgxui-nav-box-left[data-cgxui-owner="nvcn"][data-cgxui="nvcn-nav-box-left"]';
  const NAV_RIGHT_SLOT_SELECTOR = '.cgxui-nav-box-right[data-cgxui-owner="nvcn"][data-cgxui="nvcn-nav-box-right"]';
  const CHUB_STATE_KEY = 'h2o:prm:cgx:cntrlhb:state:hub:v1';
  const CHUB_CHANGED_EVENT = 'h2o.ev:prm:cgx:cntrlhb:changed:v1';

  const NS_DISK = 'h2o:legend:chatgpt';
  const VERSION = 'v3';

  // -----------------------------
  // Utilities
  // -----------------------------
  const D = document;
  const W = window;

  function debounce(fn, ms) {
    let t = null;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }
  function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }
  function normalizeText(v) {
    return String(v || '').trim().replace(/\s+/g, ' ');
  }
  function normalizeColorName(v) {
    const k = String(v || '').trim().toLowerCase();
    return COLORS_BY_NAME[k] ? k : '';
  }
  function textKey(v) {
    return normalizeText(v).toLowerCase();
  }
  const WORD_RECOMMENDED_COLOR = (() => {
    const out = Object.create(null);
    for (const [color, words] of Object.entries(COLOR_RECOMMENDED)) {
      for (const w of (words || [])) {
        const k = textKey(w);
        if (!k || out[k]) continue;
        out[k] = color;
      }
    }
    for (const [k, color] of Object.entries(WORD_COLOR_FALLBACK)) {
      const key = textKey(k);
      if (!key || out[key]) continue;
      out[key] = color;
    }
    return out;
  })();
  const KNOWN_WORD_KEYS = (() => {
    const s = new Set();
    for (const w of PRESETS) s.add(textKey(w));
    for (const arr of Object.values(COLOR_RECOMMENDED)) {
      for (const w of (arr || [])) s.add(textKey(w));
    }
    return s;
  })();
  function sanitizeRecentCustom(raw) {
    const list = Array.isArray(raw) ? raw.slice() : [];
    list.sort((a, b) => (Number(b?.ts) || 0) - (Number(a?.ts) || 0));
    const out = [];
    const seen = new Set();
    for (const x of list) {
      const text = normalizeText(x?.text);
      if (!text) continue;
      const key = textKey(text);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({
        text,
        color: normalizeColorName(x?.color),
        ts: Number(x?.ts) || Date.now(),
      });
      if (out.length >= MAX_RECENT_CUSTOM) break;
    }
    return out;
  }
  function getRecommendedColorForWord(word, fallbackColor = '') {
    const key = textKey(word);
    const rec = normalizeColorName(WORD_RECOMMENDED_COLOR[key]);
    if (rec) return rec;
    return normalizeColorName(fallbackColor);
  }

  function getChatKey() {
    const p = (location.pathname || '').split('/').filter(Boolean);
    const last = p[p.length - 1] || 'root';
    const uuidish = p.find(s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s));
    const longish = p.slice().reverse().find(s => s.length >= 16 && /^[a-z0-9-_]+$/i.test(s));
    const key = uuidish || longish || last || 'root';
    return `${key}::${location.pathname}`;
  }
  function diskKey() { return `${NS_DISK}:${getChatKey()}:${VERSION}`; }

  function emptyLabels() {
    const labels = {};
    for (const c of COLORS) labels[c.name] = '';
    return labels;
  }

  // Schema:
  // { labels:{...}, ui:{ size:'s'|'m'|'l' }, recentCustom:[{text,color,ts}] }
  function loadState() {
    const raw = localStorage.getItem(diskKey());
    const obj = safeJsonParse(raw, null);
    if (obj && typeof obj === 'object') {
      const labels = (obj.labels && typeof obj.labels === 'object') ? obj.labels : emptyLabels();
      const ui = (obj.ui && typeof obj.ui === 'object') ? obj.ui : { size: 's' };
      const recentCustom = sanitizeRecentCustom(obj.recentCustom);
      if (!ui.size) ui.size = 's';
      for (const c of COLORS) if (!(c.name in labels)) labels[c.name] = '';
      return { labels, ui, recentCustom };
    }
    return { labels: emptyLabels(), ui: { size: 's' }, recentCustom: [] };
  }
  function saveState(st) { localStorage.setItem(diskKey(), JSON.stringify(st)); }

  // -----------------------------
  // Styles (tight + compact)
  // -----------------------------
  const STYLE_ID = 'h2o-legend-style';
  function mountStyleOnce() {
    if (D.getElementById(STYLE_ID)) return;
    const s = D.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      :root{
        --h2o-lg-z: 999999;
        --h2o-lg-font: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        --h2o-lg-bg: rgba(18, 18, 22, 0.86);
        --h2o-lg-border: rgba(255,255,255,0.10);
        --h2o-lg-shadow: 0 18px 70px rgba(0,0,0,0.62);
        --h2o-lg-radius: 12px;
      }

      /* Mounted in nav right slot (same footprint as nav up/down) */
      .h2o-lg-fbtn{
        all: unset;
        width: 7px;
        min-width: 7px;
        max-width: 7px;
        height: 46px;
        min-height: 46px;
        max-height: 46px;
        box-sizing: border-box;
        flex: 0 0 7px;
        align-self: flex-start;
        border-radius: 8px;
        padding: 0;
        line-height: 1;

        font-family: var(--h2o-lg-font);
        font-size: 0;
        font-weight: 700;
        letter-spacing: 0;
        color: transparent;
        text-shadow: none;

        background:
          linear-gradient(145deg, rgba(255,255,255,0.03), rgba(0,0,0,0.1)),
          linear-gradient(145deg, #7E7E7E, #545454);
        border: none;
        cursor: pointer;
        user-select: none;
        opacity: 0.82;
        display: grid;
        grid-template-rows: 1fr 1fr 1fr 1fr;
        align-items: stretch;
        justify-items: stretch;
        position: relative;
        overflow: hidden;
        transition: opacity 140ms ease, filter 140ms ease, box-shadow 140ms ease;
        box-shadow:
          inset 0 0 1px rgba(255,255,255,0.05),
          0 2px 5px rgba(0,0,0,0.3);
        margin-left: 0;
      }
      .h2o-lg-fseg{
        display: block;
        width: 100%;
        height: 100%;
        pointer-events: none;
        background:
          linear-gradient(145deg, rgba(255,255,255,0.03), rgba(0,0,0,0.10)),
          linear-gradient(145deg, #6f6f6f, #4f4f4f);
        opacity: 0.92;
        transition: opacity 140ms ease, filter 140ms ease;
      }
      .h2o-lg-fseg-mid-1{
        background:
          linear-gradient(145deg, rgba(255,255,255,0.025), rgba(0,0,0,0.125)),
          linear-gradient(145deg, #6a6a6a, #4b4b4b);
      }
      .h2o-lg-fseg-mid-2{
        background:
          linear-gradient(145deg, rgba(255,255,255,0.022), rgba(0,0,0,0.13)),
          linear-gradient(145deg, #686868, #494949);
      }
      .h2o-lg-fseg-bot{
        background:
          linear-gradient(145deg, rgba(255,255,255,0.018), rgba(0,0,0,0.15)),
          linear-gradient(145deg, #666, #474747);
      }
      .h2o-lg-fbtn[data-page="0"] .h2o-lg-fseg-top,
      .h2o-lg-fbtn[data-page="1"] .h2o-lg-fseg-mid-1,
      .h2o-lg-fbtn[data-page="2"] .h2o-lg-fseg-mid-2,
      .h2o-lg-fbtn[data-page="3"] .h2o-lg-fseg-bot{
        filter: brightness(1.30) saturate(1.08);
        opacity: 1;
        box-shadow:
          inset 0 0 0 1px rgba(255,255,255,0.22),
          inset 0 -1px 3px rgba(0,0,0,0.45);
      }
      .h2o-lg-fsplit{
        position: absolute;
        left: 1px;
        right: 1px;
        top: 25%;
        height: 1px;
        transform: translateY(-0.5px);
        background: rgba(255,255,255,0.20);
        box-shadow: 0 1px 1px rgba(0,0,0,0.35);
        pointer-events: none;
      }
      .h2o-lg-fsplit-2{ top: 50%; }
      .h2o-lg-fsplit-3{ top: 75%; }
      .h2o-lg-fbtn:hover{
        opacity: 1;
        filter: brightness(1.08);
        box-shadow:
          0 0 6px 2px rgba(255,255,255,0.08),
          0 2px 4px rgba(0,0,0,0.25);
      }
      .h2o-lg-fbtn:active{ filter: brightness(1.02); }

      /* Compact sticky panel (no header/footer) */
      .h2o-lg-panel{
        position: fixed;
        z-index: var(--h2o-lg-z);
        left: 0;
        top: 0;
        right: auto;
        bottom: auto;

        background: rgba(255,255,255,0.01);
        color: #e5e7eb;
        border: 1px solid rgba(255,255,255,0.04);
        border-radius: var(--h2o-lg-radius);
        box-shadow: 0 2px 6px rgba(0,0,0,0.22);
        backdrop-filter: blur(2px);
        -webkit-backdrop-filter: blur(2px);

        padding: 6px;
        display: grid;
        gap: 4px;
        max-height: min(60vh, 260px);
        overflow-x: hidden;
        overflow-y: auto;

        transform-origin: left center;
        animation: h2oLgIn 150ms ease-out;
      }
      @keyframes h2oLgIn{
        from{ opacity: 0; transform: translateX(8px) scale(0.985); }
        to{ opacity: 1; transform: translateX(0) scale(1); }
      }

      .h2o-lg-panel[data-size="s"]{ width: 168px; max-width: min(62vw, 168px); }
      .h2o-lg-panel[data-size="m"]{ width: 188px; max-width: min(68vw, 188px); }
      .h2o-lg-panel[data-size="l"]{ width: 208px; max-width: min(74vw, 208px); }
      .h2o-lg-panel[data-compact="1"]{
        padding: 4px;
        gap: 3px;
      }

      .h2o-lg-grid{
        display: grid;
        grid-template-columns: 1fr;
        gap: 4px;
      }
      .h2o-lg-grid[data-layout="grid8"]{
        grid-template-columns: 1fr 1fr;
        column-gap: 6px;
        row-gap: 4px;
      }
      .h2o-lg-panel[data-compact="1"] .h2o-lg-grid{ gap: 3px; }
      .h2o-lg-panel[data-compact="1"] .h2o-lg-grid[data-layout="grid8"]{
        column-gap: 4px;
        row-gap: 3px;
      }

      .h2o-lg-row{
        display: grid;
        grid-template-columns: 12px 1fr;
        gap: 6px;
        align-items: center;
        height: 22px;
        padding: 2px 8px;
        border-top-left-radius: 999px;
        border-bottom-left-radius: 999px;
        border-top-right-radius: 6px;
        border-bottom-right-radius: 6px;
        background: rgba(255,255,255,0.01);
        border: 1px solid rgba(255,255,255,0.04);
        box-sizing: border-box;
      }
      .h2o-lg-grid[data-layout="grid8"] .h2o-lg-row{
        grid-template-columns: 8px 1fr;
        height: 22px;
        padding: 2px 8px;
        gap: 4px;
      }
      .h2o-lg-grid[data-dot-page="1"] .h2o-lg-row{
        grid-template-columns: 12px 1fr;
        gap: 6px;
      }
      .h2o-lg-panel[data-compact="1"] .h2o-lg-row{
        height: 20px;
        padding: 1px 6px;
        gap: 5px;
      }
      .h2o-lg-panel[data-compact="1"] .h2o-lg-grid[data-layout="grid8"] .h2o-lg-row{
        height: 20px;
        padding: 1px 6px;
        gap: 5px;
      }

      .h2o-lg-swatch{
        width: 11px;
        height: 11px;
        border-radius: 1px;
        justify-self: center;
        box-shadow:
          inset 0 0 1px rgba(255,255,255,0.06),
          0 2px 5px rgba(0,0,0,0.28);
      }
      .h2o-lg-panel[data-compact="1"] .h2o-lg-swatch{
        width: 9px;
        height: 9px;
      }
      .h2o-lg-grid[data-layout="grid8"] .h2o-lg-swatch{
        width: 5px;
        height: 5px;
        border-radius: 999px;
        box-shadow: none;
      }
      .h2o-lg-grid[data-dot-page="1"] .h2o-lg-swatch{
        width: 7px;
        height: 7px;
        border-radius: 999px;
        box-shadow: none;
      }
      .h2o-lg-panel[data-compact="1"] .h2o-lg-grid[data-layout="grid8"] .h2o-lg-swatch{
        width: 4px;
        height: 4px;
      }
      .h2o-lg-panel[data-compact="1"] .h2o-lg-grid[data-dot-page="1"] .h2o-lg-swatch{
        width: 6px;
        height: 6px;
      }

      .h2o-lg-input{
        width: 100%;
        box-sizing: border-box;
        font-family: var(--h2o-lg-font);
        font-size: 11px;
        color: rgba(249,250,251,0.96);
        background: transparent;
        border: none;
        border-radius: 0;
        padding: 0 2px;
        height: 16px;
        outline: none;
        transition: color 120ms ease, opacity 120ms ease;
      }
      .h2o-lg-grid[data-layout="grid8"] .h2o-lg-input{
        font-size: 9px;
        height: 13px;
        padding: 0 1px;
      }
      .h2o-lg-grid[data-dot-page="1"] .h2o-lg-input{
        font-size: 11px;
        height: 16px;
        padding: 0 2px;
      }
      .h2o-lg-input::placeholder{ color: transparent; }
      .h2o-lg-input:focus{ color: rgba(255,255,255,0.99); }

      /* Preset dropdown (appears on input click/focus) */
      .h2o-lg-dd{
        position: fixed;
        z-index: calc(var(--h2o-lg-z) + 8);
        width: 152px;
        max-width: min(58vw, 170px);
        background: rgba(255,255,255,0.01);
        border: 1px solid rgba(255,255,255,0.04);
        border-radius: 9px;
        box-shadow:
          0 2px 6px rgba(0,0,0,0.22);
        backdrop-filter: blur(2px);
        -webkit-backdrop-filter: blur(2px);
        padding: 3px;
      }
      .h2o-lg-dd-words{
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        align-items: flex-start;
        align-content: flex-start;
        gap: 3px;
        max-height: min(50vh, 248px);
        overflow-y: auto;
        overflow-x: hidden;
      }
      .h2o-lg-ddi{
        all: unset;
        cursor: pointer;
        width: auto;
        max-width: 100%;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        box-sizing: border-box;
        font-family: var(--h2o-lg-font);
        font-size: 10px;
        line-height: 1.15;
        color: rgba(246,248,255,0.95);
        padding: 3px 7px;
        border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--pill-color, rgba(255,255,255,0.35)) 68%, rgba(255,255,255,0.35));
        background: color-mix(in srgb, var(--pill-color, rgba(255,255,255,0.18)) 20%, rgba(255,255,255,0.04));
        box-shadow:
          inset 0 0 0 1px rgba(255,255,255,0.08),
          0 1px 2px rgba(0,0,0,0.35);
        transition: filter 140ms ease, border-color 140ms ease, background 140ms ease;
      }
      .h2o-lg-ddi:hover{
        filter: brightness(1.08);
        border-color: color-mix(in srgb, var(--pill-color, rgba(255,255,255,0.45)) 78%, rgba(255,255,255,0.4));
      }
      .h2o-lg-dd-txt{
        display: block;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `;
    D.head.appendChild(s);
  }

  // -----------------------------
  // State
  // -----------------------------
  let ST = loadState();
  const saveDebounced = debounce(() => saveState(ST), 200);

  let btn = null;
  let panel = null;
  let dd = null; // dropdown
  let currentPage = 0;
  let preferredOpenPage = 0;
  let wheelDeltaAccum = 0;
  let lastWheelSwitchAt = 0;

  // -----------------------------
  // Nav-controls slot discovery
  // -----------------------------
  function findNavRightSlot() {
    return D.querySelector(NAV_RIGHT_SLOT_SELECTOR);
  }
  function findNavLeftSlot() {
    return D.querySelector(NAV_LEFT_SLOT_SELECTOR);
  }

  function isDockRightSlotActive() {
    const slot = findNavRightSlot();
    if (!slot) return false;
    const st = String(slot.getAttribute?.('data-cgxui-state') || '').toLowerCase();
    return st.split(/\s+/g).includes('dock');
  }

  function isLegendEnabledFromControlHub() {
    try {
      const raw = localStorage.getItem(CHUB_STATE_KEY);
      if (!raw) return true;
      const parsed = JSON.parse(raw);
      const v = parsed?.minimap?.mmLegend;
      return (typeof v === 'boolean') ? v : true;
    } catch {
      return true;
    }
  }

  function isLegendEnabledEffective() {
    if (isLegendEnabledFromControlHub()) return true;
    return isDockRightSlotActive();
  }

  function scoreBottomLaneRect(r) {
    if (!r) return 0;
    const vh = Math.max(1, Number(W.innerHeight) || 0);
    const bottom = Number(r.bottom);
    let score = 0;
    if (Number.isFinite(bottom)) {
      if (bottom >= (vh * 0.45)) score += 2;
      if (bottom <= (vh + 24)) score += 1;
      const distFromBottom = Math.abs(vh - bottom);
      score += Math.max(0, 420 - distFromBottom) / 70;
    }
    return score;
  }

  function mergeRects(rects) {
    const xs = [];
    const ys = [];
    const x2 = [];
    const y2 = [];
    for (const r of (rects || [])) {
      if (!r) continue;
      if (!Number.isFinite(r.left) || !Number.isFinite(r.top) || !Number.isFinite(r.right) || !Number.isFinite(r.bottom)) continue;
      if ((Number(r.width) || 0) <= 0 || (Number(r.height) || 0) <= 0) continue;
      xs.push(r.left);
      ys.push(r.top);
      x2.push(r.right);
      y2.push(r.bottom);
    }
    if (!xs.length) return null;
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...x2);
    const bottom = Math.max(...y2);
    return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  }

  function getComposerRect() {
    try {
      const ta = (
        D.querySelector('#prompt-textarea') ||
        D.querySelector('form[data-type="unified-composer"] [contenteditable="true"]') ||
        D.querySelector('form.group\\/composer [contenteditable="true"]') ||
        D.querySelector('form[data-testid="composer"] [contenteditable="true"]') ||
        D.querySelector('form[action*="conversation"] [contenteditable="true"]') ||
        D.querySelector('form[data-testid="composer"] textarea') ||
        D.querySelector('form[action*="conversation"] textarea')
      );
      const bestSurface = pickBestComposerSurface(ta || null);
      if (bestSurface?.getBoundingClientRect) {
        const sr = bestSurface.getBoundingClientRect();
        if (sr && sr.width > 0 && sr.height > 0) return clampComposerAnchorRect(sr);
      }

      const surface = (
        ta?.closest?.('[data-composer-surface="true"]') ||
        D.querySelector('form[data-type="unified-composer"] [data-composer-surface="true"]') ||
        D.querySelector('form.group\\/composer [data-composer-surface="true"]') ||
        D.querySelector('form[data-testid="composer"] [data-composer-surface="true"]') ||
        D.querySelector('form[action*="conversation"] [data-composer-surface="true"]')
      );
      if (surface?.getBoundingClientRect) {
        const sr = surface.getBoundingClientRect();
        if (sr && sr.width > 0 && sr.height > 0) return clampComposerAnchorRect(sr);
      }
      const form = (
        ta?.closest?.('form[data-type="unified-composer"], form.group\\/composer, form[data-testid="composer"], form[action*="conversation"]') ||
        D.querySelector('form[data-type="unified-composer"], form.group\\/composer, form[data-testid="composer"], form[action*="conversation"]')
      );
      const sendBtn = (
        form?.querySelector?.('button[data-testid="send-button"], button[aria-label*="send" i]') ||
        null
      );

      const rForm = form?.getBoundingClientRect?.() || null;
      const rInput = ta?.getBoundingClientRect?.() || null;
      const rSend = sendBtn?.getBoundingClientRect?.() || null;
      return clampComposerAnchorRect(mergeRects([rForm, rInput, rSend]) || rInput || rForm || rSend || null);
    } catch {
      return null;
    }
  }

  function pickBestComposerSurface(inputHint = null) {
    try {
      const list = Array.from(D.querySelectorAll('[data-composer-surface="true"]'));
      if (!list.length) return null;

      let best = null;
      let bestScore = -Infinity;
      for (const el of list) {
        const r = el?.getBoundingClientRect?.();
        if (!r || r.width <= 0 || r.height <= 0) continue;

        let score = 0;
        if (r.width >= 300) score += 2;
        if (el.closest?.('form[data-type="unified-composer"], form.group\\/composer, form[data-testid="composer"], form[action*="conversation"]')) score += 6;
        if (inputHint && el.contains?.(inputHint)) score += 18;
        score += scoreBottomLaneRect(r);

        if (score > bestScore) {
          best = el;
          bestScore = score;
        }
      }
      return best;
    } catch {
      return null;
    }
  }

  function clampComposerAnchorRect(r) {
    if (!r) return null;

    const left = Number(r.left);
    const top = Number(r.top);
    const right = Number(r.right);
    const bottom = Number(r.bottom);
    if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) {
      return r;
    }

    const width = Math.max(0, Number(r.width) || (right - left));
    const rawHeight = Math.max(0, bottom - top);
    const maxAnchorHeight = Math.max(
      COMPOSER_ANCHOR_MIN_PX,
      Math.min(COMPOSER_ANCHOR_MAX_PX, Math.round(W.innerHeight * COMPOSER_ANCHOR_MAX_VH))
    );

    if (rawHeight <= maxAnchorHeight + 1) {
      return { left, top, right, bottom, width, height: rawHeight };
    }

    const clampedTop = Math.max(0, bottom - maxAnchorHeight);
    return {
      left,
      top: clampedTop,
      right,
      bottom,
      width,
      height: Math.max(0, bottom - clampedTop),
    };
  }

  function rectOverlaps(a, b, gap = 0) {
    if (!a || !b) return false;
    return !(
      (a.right + gap) <= b.left ||
      (a.left - gap) >= b.right ||
      (a.bottom + gap) <= b.top ||
      (a.top - gap) >= b.bottom
    );
  }

  function syncButtonMirrorGap() {
    if (!btn || !btn.isConnected) return;

    const composer = getComposerRect();
    const leftSlot = findNavLeftSlot();
    const leftBtn = leftSlot?.querySelector?.('.cgxui-nav-btn');

    if (!composer || !leftBtn) {
      btn.dataset.h2oLgShiftX = '0';
      btn.style.transform = '';
      return;
    }

    const lr = leftBtn.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    if (
      !Number.isFinite(composer.left) ||
      !Number.isFinite(composer.right) ||
      !Number.isFinite(lr.right) ||
      !Number.isFinite(br.left)
    ) return;

    const targetGap = Math.max(0, composer.left - lr.right);
    const storedShift = Number(btn.dataset.h2oLgShiftX || '0');
    const activeShift = Number.isFinite(storedShift) ? storedShift : 0;

    // Compute from button's unshifted base position to avoid transform oscillation.
    const baseLeft = br.left - activeShift;
    const baseGap = baseLeft - composer.right;
    const desiredShiftRaw = Math.round(targetGap - baseGap);
    const desiredShift = Math.max(-120, Math.min(120, desiredShiftRaw));

    if (Math.abs(desiredShift - activeShift) < 1) return;

    btn.dataset.h2oLgShiftX = String(desiredShift);
    btn.style.transform = (Math.abs(desiredShift) <= 0) ? '' : `translateX(${desiredShift}px)`;
  }

  function updateButtonPageState() {
    if (!btn) return;
    btn.setAttribute('data-page', String(currentPage || 0));
  }

  function resolvePageFromButtonEvent(e) {
    if (!btn || !Number.isFinite(Number(e?.clientY))) return 0;
    const total = Math.max(1, COLOR_PAGES.length);
    if (total <= 1) return 0;
    const r = btn.getBoundingClientRect();
    const h = Math.max(1, Number(r.height) || 1);
    const y = Math.max(0, Math.min(h - 0.001, Number(e.clientY) - r.top));
    const idx = Math.floor((y / h) * total);
    return Math.max(0, Math.min(total - 1, idx));
  }

  // -----------------------------
  // Dropdown (presets) for an input
  // -----------------------------
  function closeDropdown() {
    if (!dd) return;
    dd.remove();
    dd = null;
    D.removeEventListener('pointerdown', onDocCloseDropdown, true);
  }

  function onDocCloseDropdown(e) {
    if (!dd) return;
    const t = e.target;
    if (dd.contains(t)) return;
    // allow clicking the same input without immediately closing (it will reopen)
    closeDropdown();
  }

  function getDotHexForColor(colorName) {
    const c = normalizeColorName(colorName);
    if (!c) return '#8a8f9f';
    return HIGHLIGHT_DOT_HEX[c] || COLORS_BY_NAME[c]?.color || '#8a8f9f';
  }

  function rememberCustomWord(word, colorName) {
    const text = normalizeText(word);
    const color = normalizeColorName(colorName);
    if (!text || !color) return;
    if (KNOWN_WORD_KEYS.has(textKey(text))) return;

    if (!Array.isArray(ST.recentCustom)) ST.recentCustom = [];
    const key = textKey(text);
    const rest = ST.recentCustom.filter((x) => textKey(x?.text) !== key);
    ST.recentCustom = [{ text, color, ts: Date.now() }, ...rest].slice(0, MAX_RECENT_CUSTOM);
    saveState(ST);
  }

  function buildDropdownItemsForColor(colorName) {
    const color = normalizeColorName(colorName);
    const items = [];
    const seen = new Set();
    const push = (text, meta = {}) => {
      const t = normalizeText(text);
      const key = textKey(t);
      if (!t || seen.has(key)) return;
      seen.add(key);
      items.push({ text: t, ...meta });
    };

    const recent = sanitizeRecentCustom(ST.recentCustom).slice(0, 8);
    for (const r of recent) {
      push(r.text, {
        bubbleColor: normalizeColorName(r.color) || getRecommendedColorForWord(r.text, color),
      });
    }

    for (const w of (COLOR_RECOMMENDED[color] || [])) {
      push(w, {
        bubbleColor: getRecommendedColorForWord(w, color),
      });
    }

    for (const p of PRESETS) {
      push(p, {
        bubbleColor: getRecommendedColorForWord(p, color),
      });
    }

    return items;
  }

  function openDropdownForInput(inputEl, colorName, onPick) {
    closeDropdown();

    dd = D.createElement('div');
    dd.className = 'h2o-lg-dd h2o-lg-dd-words';

    const currentColor = normalizeColorName(colorName);
    const items = buildDropdownItemsForColor(colorName);
    for (const itx of items) {
      const it = D.createElement('button');
      it.type = 'button';
      it.className = 'h2o-lg-ddi';

      const bubbleColorName = getRecommendedColorForWord(itx.text, normalizeColorName(itx.bubbleColor) || currentColor);
      const bubbleHex = getDotHexForColor(bubbleColorName);
      it.style.setProperty('--pill-color', bubbleHex);

      const txt = D.createElement('span');
      txt.className = 'h2o-lg-dd-txt';
      txt.textContent = itx.text;
      it.appendChild(txt);

      let done = false;
      const choose = (e) => {
        if (done) return;
        done = true;
        e.preventDefault();
        e.stopPropagation();
        onPick(itx.text);
        closeDropdown();
      };
      // Use pointerdown so selection is reliable on compact UIs.
      it.addEventListener('pointerdown', choose, true);
      it.addEventListener('click', choose, true);
      dd.appendChild(it);
    }

    D.body.appendChild(dd);

    const r = inputEl.getBoundingClientRect();
    const targetW = Math.max(124, Math.min(168, Math.round((r.width || 124) + 22)));
    dd.style.width = `${targetW}px`;
    dd.style.maxWidth = `${targetW}px`;

    const mw = dd.offsetWidth || targetW || 152;
    const mh = dd.offsetHeight || 220;

    // Open above the input if near bottom, else below
    let left = r.left;
    let top = r.bottom + 8;

    if (top + mh > W.innerHeight - 10) {
      top = Math.max(10, r.top - mh - 8);
    }

    // Clamp
    left = Math.max(10, Math.min(left, W.innerWidth - mw - 10));
    top = Math.max(10, Math.min(top, W.innerHeight - mh - 10));

    dd.style.left = `${left}px`;
    dd.style.top = `${top}px`;

    D.addEventListener('pointerdown', onDocCloseDropdown, true);
  }

  // -----------------------------
  // Panel toggle
  // -----------------------------
  function getPageColors(idx) {
    const names = COLOR_PAGES[idx] || COLOR_PAGES[0] || [];
    return names.map((name) => COLORS_BY_NAME[name]).filter(Boolean);
  }

  function buildPanel(initialPage = 0) {
    ST = loadState();
    const totalPages = Math.max(1, COLOR_PAGES.length);
    currentPage = ((Number(initialPage) || 0) % totalPages + totalPages) % totalPages;
    preferredOpenPage = currentPage;
    updateButtonPageState();
    wheelDeltaAccum = 0;
    lastWheelSwitchAt = 0;

    const p = D.createElement('div');
    p.className = 'h2o-lg-panel';
    p.setAttribute('data-size', ST.ui.size || 's');

    const grid = D.createElement('div');
    grid.className = 'h2o-lg-grid';

    const renderPage = () => {
      closeDropdown();
      grid.innerHTML = '';
      const isDotPage = (currentPage >= 2);
      grid.setAttribute('data-layout', 'stack');
      grid.setAttribute('data-dot-page', isDotPage ? '1' : '0');

      for (const c of getPageColors(currentPage)) {
        const row = D.createElement('div');
        row.className = 'h2o-lg-row';

        const sw = D.createElement('div');
        sw.className = 'h2o-lg-swatch';
        if (isDotPage) {
          const dotColor = HIGHLIGHT_DOT_HEX[c.name] || c.color;
          sw.style.background = dotColor;
          sw.style.boxShadow = `0 0 2px ${dotColor}`;
        } else {
          sw.style.background = `linear-gradient(145deg, rgba(255,255,255,0.03), rgba(0,0,0,0.10)), ${c.color}`;
        }

        const input = D.createElement('input');
        input.className = 'h2o-lg-input';
        input.type = 'text';
        input.placeholder = '';
        input.value = ST.labels[c.name] || '';

        input.addEventListener('input', () => {
          ST.labels[c.name] = input.value;
          saveDebounced();
        });

        input.addEventListener('blur', () => {
          ST.labels[c.name] = input.value;
          rememberCustomWord(input.value, c.name);
          saveState(ST);
          setTimeout(() => closeDropdown(), 0);
        });

        const openDD = (e) => {
          e?.stopPropagation?.();
          openDropdownForInput(input, c.name, (picked) => {
            input.value = picked;
            ST.labels[c.name] = picked;
            saveState(ST);
            input.focus();
          });
        };

        // Click opens presets, but user can still freely type custom text.
        input.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          openDD(e);
        }, true);

        input.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            openDD(e);
          }
          if (e.key === 'Escape') closeDropdown();
        });

        row.appendChild(sw);
        row.appendChild(input);
        grid.appendChild(row);
      }
      updateButtonPageState();
    };

    const switchPage = (dir) => {
      const total = Math.max(1, COLOR_PAGES.length);
      if (total <= 1) return;
      currentPage = (currentPage + dir + total) % total;
      preferredOpenPage = currentPage;
      renderPage();
    };

    p.addEventListener('wheel', (e) => {
      e.preventDefault();
      const now = performance.now();
      wheelDeltaAccum += e.deltaY;

      if (Math.abs(wheelDeltaAccum) < WHEEL_MIN_DELTA) return;
      if (now - lastWheelSwitchAt < WHEEL_THROTTLE_MS) {
        wheelDeltaAccum = 0;
        return;
      }

      const dir = wheelDeltaAccum > 0 ? 1 : -1;
      wheelDeltaAccum = 0;
      lastWheelSwitchAt = now;
      switchPage(dir);
    }, { passive: false });

    p.__setPage = (idx) => {
      const total = Math.max(1, COLOR_PAGES.length);
      currentPage = ((Number(idx) || 0) % total + total) % total;
      preferredOpenPage = currentPage;
      renderPage();
    };
    p.__getPage = () => currentPage;

    renderPage();
    p.appendChild(grid);
    return p;
  }

  function positionPanelNearButton() {
    if (!panel || !panel.isConnected || !btn || !btn.isConnected) return;
    syncButtonMirrorGap();

    const gap = 8;
    const pad = 8;
    const br = btn.getBoundingClientRect();
    const size = String(panel.getAttribute('data-size') || ST?.ui?.size || 's');
    const baseFromSize = PANEL_BASE_WIDTH[size] || PANEL_BASE_WIDTH.s;
    const baseW = baseFromSize;
    const availableRight = Math.max(24, W.innerWidth - (br.right + gap + pad));

    // Responsive width: shrink with viewport while keeping right-side opening.
    let targetW = Math.min(baseW, availableRight);
    targetW = Math.max(24, Math.min(targetW, W.innerWidth - (pad * 2)));
    panel.style.width = `${targetW}px`;
    panel.style.maxWidth = `${targetW}px`;
    panel.style.minWidth = `${targetW}px`;
    panel.setAttribute('data-compact', targetW < 138 ? '1' : '0');

    const maxH = Math.max(110, W.innerHeight - (pad * 2));
    panel.style.maxHeight = `${maxH}px`;

    // Measure after responsive size is applied.
    const pRect = panel.getBoundingClientRect();
    const pw = pRect.width || targetW || 140;
    const ph = pRect.height || 140;

    // Always open on the right side of the trigger.
    let left = br.right + gap;
    let top = br.top + ((br.height - ph) / 2) + PANEL_NUDGE_Y;

    // Keep inside viewport so panel never leaves the frame.
    left = Math.max(pad, Math.min(left, W.innerWidth - pw - pad));
    top = Math.max(pad, Math.min(top, W.innerHeight - ph - pad));

    // Avoid collision with composer/input area when page is tight.
    const composer = getComposerRect();
    const nextRect = { left, top, right: left + pw, bottom: top + ph };
    if (composer && rectOverlaps(nextRect, composer, 4)) {
      const aboveTop = Math.max(pad, composer.top - ph - gap);
      const belowTop = composer.bottom + gap;
      if (aboveTop + ph <= (W.innerHeight - pad)) {
        top = aboveTop;
      } else if (belowTop + ph <= (W.innerHeight - pad)) {
        top = belowTop;
      } else {
        top = Math.max(pad, Math.min(top, W.innerHeight - ph - pad));
      }
    }

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function togglePanel(pageIdx = null) {
    mountStyleOnce();
    closeDropdown();

    if (pageIdx !== null && pageIdx !== undefined) {
      const total = Math.max(1, COLOR_PAGES.length);
      preferredOpenPage = ((Number(pageIdx) || 0) % total + total) % total;
      currentPage = preferredOpenPage;
      updateButtonPageState();
    }

    if (panel && panel.isConnected) {
      if (pageIdx !== null && pageIdx !== undefined && typeof panel.__setPage === 'function') {
        const active = (typeof panel.__getPage === 'function') ? panel.__getPage() : currentPage;
        if (Number(active) !== Number(preferredOpenPage)) {
          panel.__setPage(preferredOpenPage);
          positionPanelNearButton();
          return;
        }
      }
      saveState(ST);
      panel.remove();
      panel = null;
      return;
    }

    panel = buildPanel(preferredOpenPage);
    D.body.appendChild(panel);
    positionPanelNearButton();
    requestAnimationFrame(positionPanelNearButton);
  }

  // -----------------------------
  // Middle-click options on Legend button
  // -----------------------------
  function setSize(sz) {
    ST = loadState();
    ST.ui.size = sz;
    saveState(ST);
    if (panel && panel.isConnected) {
      panel.setAttribute('data-size', sz);
      requestAnimationFrame(positionPanelNearButton);
    }
  }

  function openOptionsMenu() {
    // Lightweight options menu using the same dropdown UI
    // (no extra UI clutter)
    closeDropdown();

    const menu = D.createElement('div');
    menu.className = 'h2o-lg-dd';

    const addItem = (label, fn) => {
      const it = D.createElement('button');
      it.type = 'button';
      it.className = 'h2o-lg-ddi';
      it.textContent = label;
      it.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
        menu.remove();
      });
      menu.appendChild(it);
    };

    addItem('Reset this chat', () => {
      ST = loadState();
      ST.labels = emptyLabels();
      saveState(ST);
      if (panel && panel.isConnected) { panel.remove(); panel = null; togglePanel(); }
    });
    addItem('Size: Small',  () => setSize('s'));
    addItem('Size: Medium', () => setSize('m'));
    addItem('Size: Large',  () => setSize('l'));

    D.body.appendChild(menu);

    const r = btn.getBoundingClientRect();
    const mw = menu.offsetWidth || 188;
    const mh = menu.offsetHeight || 180;

    let left = r.left - mw - 10;
    let top = r.top;

    if (left < 10) left = r.right + 10;
    top = Math.max(10, Math.min(top, W.innerHeight - mh - 10));
    left = Math.max(10, Math.min(left, W.innerWidth - mw - 10));

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    // close on outside click
    const close = (e) => {
      if (menu.contains(e.target) || btn.contains(e.target)) return;
      menu.remove();
      D.removeEventListener('pointerdown', close, true);
    };
    D.addEventListener('pointerdown', close, true);
  }

  // -----------------------------
  // Mount button
  // -----------------------------
  function hideLegendUi() {
    try { closeDropdown(); } catch {}
    try {
      for (const el of Array.from(D.querySelectorAll('.h2o-lg-dd'))) {
        el.remove();
      }
    } catch {}
    if (panel && panel.isConnected) { panel.remove(); panel = null; }
    if (btn && btn.isConnected) btn.remove();
  }

  function syncLegendVisibility() {
    if (!isLegendEnabledEffective()) {
      hideLegendUi();
      return false;
    }
    return mountButtonOnce();
  }

  function mountButtonOnce() {
    mountStyleOnce();

    if (!isLegendEnabledEffective()) {
      hideLegendUi();
      return false;
    }

    if (!btn) {
      btn = D.createElement('button');
      btn.type = 'button';
      btn.className = 'h2o-lg-fbtn';
      btn.textContent = '';
      btn.title = 'Legend';
      btn.setAttribute('aria-label', 'Legend');

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const page = resolvePageFromButtonEvent(e);
        togglePanel(page);
      }, true);

      // Middle click (wheel click) = options
      btn.addEventListener('auxclick', (e) => {
        if (e.button !== 1) return;
        e.preventDefault();
        e.stopPropagation();
        openOptionsMenu();
      }, true);

      const segTop = D.createElement('span');
      segTop.className = 'h2o-lg-fseg h2o-lg-fseg-top';
      const segMid1 = D.createElement('span');
      segMid1.className = 'h2o-lg-fseg h2o-lg-fseg-mid-1';
      const segMid2 = D.createElement('span');
      segMid2.className = 'h2o-lg-fseg h2o-lg-fseg-mid-2';
      const segBot = D.createElement('span');
      segBot.className = 'h2o-lg-fseg h2o-lg-fseg-bot';
      const split1 = D.createElement('span');
      split1.className = 'h2o-lg-fsplit h2o-lg-fsplit-1';
      const split2 = D.createElement('span');
      split2.className = 'h2o-lg-fsplit h2o-lg-fsplit-2';
      const split3 = D.createElement('span');
      split3.className = 'h2o-lg-fsplit h2o-lg-fsplit-3';
      btn.append(segTop, segMid1, segMid2, segBot, split1, split2, split3);
      updateButtonPageState();
    }

    const slot = findNavRightSlot();
    if (!slot) return false;
    if (btn.parentElement !== slot) slot.appendChild(btn);
    syncButtonMirrorGap();
    return true;
  }

  // -----------------------------
  // Boot
  // -----------------------------
  function boot() {
    syncLegendVisibility();

    const followPanel = () => {
      syncButtonMirrorGap();
      if (panel && panel.isConnected) positionPanelNearButton();
    };
    let resizeBurstTimer = 0;
    let resizeBurstUntil = 0;
    const kickResizeBurst = () => {
      resizeBurstUntil = performance.now() + 1100;
      followPanel();
      if (resizeBurstTimer) return;
      resizeBurstTimer = W.setInterval(() => {
        if (performance.now() > resizeBurstUntil) {
          W.clearInterval(resizeBurstTimer);
          resizeBurstTimer = 0;
          return;
        }
        followPanel();
      }, 70);
    };

    const mo = new MutationObserver(() => {
      syncLegendVisibility();
      followPanel();
    });
    mo.observe(D.documentElement, { childList: true, subtree: true });

    const onNav = () => {
      closeDropdown();
      if (panel && panel.isConnected) { panel.remove(); panel = null; }
      setTimeout(() => {
        syncLegendVisibility();
      }, 250);
    };
    W.addEventListener('popstate', onNav);
    W.addEventListener('hashchange', onNav);
    W.addEventListener('resize', followPanel, { passive: true });
    W.addEventListener('resize', kickResizeBurst, { passive: true });
    W.addEventListener('scroll', followPanel, { passive: true });
    if (W.visualViewport) {
      W.visualViewport.addEventListener('resize', followPanel, { passive: true });
      W.visualViewport.addEventListener('resize', kickResizeBurst, { passive: true });
      W.visualViewport.addEventListener('scroll', followPanel, { passive: true });
    }

    W.addEventListener('storage', (e) => {
      if (String(e?.key || '') !== CHUB_STATE_KEY) return;
      syncLegendVisibility();
    }, { passive: true });

    W.addEventListener(CHUB_CHANGED_EVENT, (e) => {
      const d = e?.detail || {};
      if (String(d.featureKey || '') !== 'minimap') return;
      if (String(d.optKey || '') !== 'mmLegend') return;
      syncLegendVisibility();
    }, { passive: true });
  }

  boot();
})();
