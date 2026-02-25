// ==UserScript==
// @name         1A6.🔴🌈 Highlight Dots (MiniMap Plugin) 🗺️
// @namespace    H2O.Prime.CGX.MiniMap.Dots
// @version      1.3.1
// @description  Self-contained copy of the MiniMap left-side inline highlight dots (identical visuals + behavior)
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  /* ----------------------------------------------------------------------
   *  GOAL
   *  Reproduce the MiniMap “inline highlight dots” that sit on the LEFT of
   *  each MiniMap button, with the same persistence, rendering, dot-menu,
   *  anti-flicker cache, and event bridges—without depending on the full
   *  MiniMap userscript.
   * ---------------------------------------------------------------------- */

  /* ───────────────────────── 0) Realm + Identity ───────────────────────── */
  const W = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
  const R = window;

  // ✅ Ownership flag: this script is the single authority for MiniMap left-side dots
  const TOPW = (W.top || W);
  TOPW.H2O_MM_DOTS_PLUGIN = true;
  TOPW.H2O_MM_DOTS_PLUGIN_VER = '1.1.1';
  const MM_HAS_EXTERNAL_WASH = () => !!TOPW.H2O_MM_WASH_PLUGIN || !!(W.H2O && W.H2O.MM && W.H2O.MM.wash);

  const SUITE = 'prm';
  const HOST  = 'cgx';
  const DsID  = 'mnmp';
  const SkID  = 'mnmp';
  const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`;

  /* ───────────────────────── 1) Tokens (attrs/ui/cls/sel) ───────────────────────── */
  const ATTR_ = Object.freeze({
    CGXUI_OWNER:  'data-cgxui-owner',
    CGXUI:        'data-cgxui',
    CGXUI_STATE:  'data-cgxui-state',
    CGXUI_ID:     'data-cgxui-id',
    MSG_ID:       'data-message-id',
    MSG_ROLE:     'data-message-author-role',
    PRIMARY_A_ID: 'data-primary-a-id',
    DOT_COLORS:   'data-dot-colors',
    TURN_ID:      'data-turn-id',
    DOT_COLOR:    'data-h2o-dot-color',
  });

  const UI_ = Object.freeze({
    MINIMAP:   `${SkID}-minimap`,
    COL:       `${SkID}-col`,
    WRAP:      `${SkID}-wrap`,
    BTN:       `${SkID}-btn`,
    DOTROW:    `${SkID}-dotrow`,
    DOT_CELL:  `${SkID}-dot-cell`,
    DOT_MENU:  `${SkID}-dot-menu`,
    SWATCH_ROW:`${SkID}-hl-swatches`,
    SWATCH:    `${SkID}-hl-swatch`,
  });

  const CLS_ = Object.freeze({
    WRAP:      `cgxui-${SkID}-wrap`,
    DOTROW:    `cgxui-${SkID}-dotrow`,
    DOT_CELL:  `cgxui-${SkID}-dot-cell`,
    DOT_MENU:  `cgxui-${SkID}-dot-menu`,
    SWATCH_ROW:`cgxui-${SkID}-hl-swatches`,
    SWATCH:    `cgxui-${SkID}-hl-swatch`,
  });

  const SEL_ = Object.freeze({
    MINIMAP:   `[${ATTR_.CGXUI}="${UI_.MINIMAP}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`,
    MM_COL:    `[${ATTR_.CGXUI}="${UI_.COL}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`,
    MM_WRAP:   `[${ATTR_.CGXUI}="${UI_.WRAP}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`,
    MM_BTN:    `[${ATTR_.CGXUI}="${UI_.BTN}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`,
    MM_DOTROW: `[${ATTR_.CGXUI}="${UI_.DOTROW}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`,
  });

  /* ───────────────────────── 2) Events & Keys ───────────────────────── */
  const EV_ = Object.freeze({
    INLINE_CHANGED:   'evt:h2o:inline:changed',
    INLINE_RESTORED:  'evt:h2o:inline:restored',
    ANSWER_HIGHLIGHT: 'evt:h2o:answer:highlight',
  });

  // Live Sync signal (WebDAV LiveState poll/push can listen without monkeypatching storage)
  const EV_LIVE_CHANGED = 'evt:h2o:data:liveChanged';

  const KEY_ = Object.freeze({
    DISK_GLOW_HL:      `${NS_DISK}:state:glow_hl:v7`,
    DISK_WASH_MAP:     `${NS_DISK}:state:wash_map:v1`,
    DISK_INLINE_DOTS:  `${NS_DISK}:state:inline_dots:v2`,
  });

  /* ───────────────────────── 3) Storage helpers ───────────────────────── */
  const UTIL_storage = {
    getStr(key, fb = null) {
      try { return localStorage.getItem(key) ?? fb; } catch { return fb; }
    },
    setStr(key, val) {
      try { localStorage.setItem(key, String(val)); return true; } catch { return false; }
    },
    getJSON(key, fb = null) {
      const s = this.getStr(key, null);
      if (s == null) return fb;
      try { return JSON.parse(s); } catch { return fb; }
    },
    setJSON(key, obj) {
      try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch { return false; }
    }
  };

  /* ───────────────────────── 4) Palette + helpers ───────────────────────── */
  const COLORS = [
    { name:'blue',   color:'#3A8BFF' },
    { name:'red',    color:'#FF4A4A' },
    { name:'green',  color:'#31D158' },
    { name:'gold',   color:'#FFD700' },
    { name:'sky',    color:'#4CD3FF' },
    { name:'pink',   color:'#FF71C6' },
    { name:'purple', color:'#A36BFF' },
    { name:'orange', color:'#FFA63A' },
  ];

  const DOT_ORDER = (() => {
    const legacy = Array.isArray(R.H2O?.MM?.DOT_ORDER) ? R.H2O.MM.DOT_ORDER : null;
    const fallback = ['blue','red','green','gold','sky','pink','purple','orange'];
    return legacy && legacy.length ? legacy.slice() : fallback;
  })();

  const COLOR_BY_NAME = Object.fromEntries(COLORS.map(c => [String(c.name).toLowerCase(), c.color]));
  const DOT_REF_HEX = {
    green:  '#22c55e',
    blue:   '#3b82f6',
    red:    '#ef4444',
    gold:   '#facc15',
    purple: '#a855f7',
    sky:    '#5BAFEF',
    pink:   '#ec4899',
    orange: '#f97316'
  };

  function cssToRgb(str) {
    if (!str) return null;
    str = String(str).trim().toLowerCase();
    if (DOT_REF_HEX[str]) return cssToRgb(DOT_REF_HEX[str]);
    let m = /^#?([0-9a-f]{6})$/i.exec(str);
    if (m) {
      const hex = m[1];
      return { r: parseInt(hex.slice(0,2),16), g: parseInt(hex.slice(2,4),16), b: parseInt(hex.slice(4,6),16) };
    }
    m = /^rgb\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(str);
    if (m) return { r:+m[1], g:+m[2], b:+m[3] };
    return null;
  }

  function nearestDotColorName(raw) {
    if (!raw) return null;
    let s = String(raw).trim().toLowerCase();
    if (DOT_ORDER.includes(s)) return s;
    if (COLOR_BY_NAME[s]) s = COLOR_BY_NAME[s];
    const rgb = cssToRgb(s);
    if (!rgb) return null;
    let best = null, bestDist = Infinity;
    for (const name of DOT_ORDER) {
      const ref = cssToRgb(DOT_REF_HEX[name]);
      if (!ref) continue;
      const dr = rgb.r - ref.r, dg = rgb.g - ref.g, db = rgb.b - ref.b;
      const d = dr*dr + dg*dg + db*db;
      if (d < bestDist) { bestDist = d; best = name; }
    }
    return best;
  }

  function canonicalInlineColors(raw) {
    const set = new Set();
    (raw || []).forEach(c => {
      const name = nearestDotColorName(c);
      if (name) set.add(name);
    });
    return DOT_ORDER.filter(n => set.has(n));
  }

  const VALID_WASH_NAMES = new Set(COLORS.map(({ name }) => name.toLowerCase()));
  const VALID_DOT_NAMES  = new Set(DOT_ORDER.map(n => n.toLowerCase()));
  const isValidWashName  = (n) => !!n && VALID_WASH_NAMES.has(String(n).toLowerCase());
  const isValidDotName   = (n) => !!n && VALID_DOT_NAMES.has(String(n).toLowerCase());
  const DEBUG_DOT_CLICK  = !!(TOPW.H2O_MM_DEBUG_DOT_CLICK || TOPW.H2O_MM_DEBUG || false);
  const INLINE_NODE_SEL  = '[data-h2o-inline-color], [data-inline-hl], .cgxui-inline-hl, mark, span[data-inline-hl], span[data-h2o-inline-color], span[style*="background"], mark[style*="background"]';

  /* ───────────────────────── 5) Wash + Inline dot maps (persisted) ───────────────────────── */
  const STORAGE_WASH_MAP_NEW = KEY_.DISK_WASH_MAP;
  const STORAGE_WASH_MAP_OLD = KEY_.DISK_GLOW_HL;
  const KEY_INLINE_DOTS      = KEY_.DISK_INLINE_DOTS;

  const washMap = (() => {
    const topW = (W && W.top) ? W.top : window;
    let shared = topW.H2O_MM_washMap;
    if (!shared || typeof shared !== 'object' || Array.isArray(shared)) {
      let fromDisk = null;
      try {
        const raw = UTIL_storage.getStr(STORAGE_WASH_MAP_NEW, null);
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) fromDisk = parsed;
      } catch {}
      if (!fromDisk) {
        try {
          const rawOld = UTIL_storage.getStr(STORAGE_WASH_MAP_OLD, null);
          const parsedOld = rawOld ? JSON.parse(rawOld) : null;
          if (parsedOld && typeof parsedOld === 'object' && !Array.isArray(parsedOld)) fromDisk = parsedOld;
        } catch {}
      }
      shared = fromDisk || Object.create(null);
    }
    topW.H2O_MM_washMap = shared;
    return shared;
  })();

  function saveWashMap() {
    try {
      UTIL_storage.setStr(STORAGE_WASH_MAP_NEW, JSON.stringify(washMap || {}));

      // ✅ standardized signal for near-instant sync
      try {
        TOPW.dispatchEvent(new CustomEvent(EV_LIVE_CHANGED, {
          detail: {
            domain: DsID,
            source: 'dots',
            keys: [STORAGE_WASH_MAP_NEW, STORAGE_WASH_MAP_OLD],
            at: Date.now(),
          }
        }));
      } catch {}
    } catch {}
  }

  const inlineDotMap = (() => {
    const topW = (W && W.top) ? W.top : window;
    if (topW.H2O_MM_inlineDotMap && typeof topW.H2O_MM_inlineDotMap === 'object') {
      return topW.H2O_MM_inlineDotMap;
    }
    let obj = Object.create(null);
    try {
      const raw = UTIL_storage.getStr(KEY_INLINE_DOTS, null);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) obj = parsed;
    } catch {}
    topW.H2O_MM_inlineDotMap = obj;
    return obj;
  })();

  function saveInlineDots() {
    try {
      UTIL_storage.setStr(KEY_INLINE_DOTS, JSON.stringify(inlineDotMap || {}));

      // ✅ standardized signal for near-instant sync
      try {
        TOPW.dispatchEvent(new CustomEvent(EV_LIVE_CHANGED, {
          detail: {
            domain: DsID,
            source: 'dots',
            keys: [KEY_INLINE_DOTS],
            at: Date.now(),
          }
        }));
      } catch {}
    } catch {}
  }

  try {
    W.H2O = W.H2O || {};
    W.H2O.MM = W.H2O.MM || {};
    W.H2O.MM.inlineDotMap = inlineDotMap;
    W.H2O.MM.washMap = washMap;
  } catch {}

/* ───────────────────────── 6) Style injection (dot layout) ───────────────────────── */
(function injectDotCSS() {
  const ID = 'h2o-mm-dots-standalone-css';

  // ✅ update-or-create
  let st = document.getElementById(ID);
  if (!st) {
    st = document.createElement('style');
    st.id = ID;
    document.head.appendChild(st);
  } else {
    // ✅ ensure it's last (wins if specificity ties)
    document.head.appendChild(st);
  }

  const wrapSel   = `.${CLS_.WRAP}[${ATTR_.CGXUI_OWNER}="${SkID}"][${ATTR_.CGXUI}="${UI_.WRAP}"]`;
  const dotRowSel = `.${CLS_.DOTROW}[${ATTR_.CGXUI_OWNER}="${SkID}"][${ATTR_.CGXUI}="${UI_.DOTROW}"]`;
  const dotSel    = `.${CLS_.DOT_CELL}[${ATTR_.CGXUI_OWNER}="${SkID}"][${ATTR_.CGXUI}="${UI_.DOT_CELL}"]`;

  st.textContent = `
:root{
  --mm-dot-gutter: 22px;
  --mm-dot-gap: 10px;
  --mm-dot-x: calc(-2 * (var(--mm-dot-gutter) - var(--mm-dot-gap)) + 8px);

  /* move lane one step LEFT from the button edge */
  --mm-dot-shift: 2px;                                  /* 👈👈👈👈 */

  --mm-dot-size: 5px;
  --mm-dot-col-gap: 3px;
  --mm-dot-row-gap: 3px;
  --mm-dot-cols: 4;
  --mm-btn-h: 24px;
}

${wrapSel}{
  position: relative !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  height: var(--mm-btn-h, 24px) !important;
}

${dotRowSel}{
  position: absolute !important;
  top: 50% !important;
  transform: translateY(-50%) !important;

  display: grid !important;
  align-items: center !important;
  justify-items: center !important;
  pointer-events: auto !important;
  z-index: 10 !important;
  box-sizing: content-box !important;
  contain: paint !important;

  grid-template-columns: repeat(var(--mm-dot-cols), var(--mm-dot-size)) !important;
  grid-auto-rows: var(--mm-dot-size) !important;
  column-gap: var(--mm-dot-col-gap) !important;
  row-gap: var(--mm-dot-row-gap) !important;

  left: calc(var(--mm-dot-x) + var(--mm-dot-shift)) !important;
}

${dotSel}{
  width: 5px !important;
  height: 5px !important;
  border-radius: 50% !important;
  margin: 0 !important;
  background: transparent;
  box-shadow: none;
}
`;
})();


  /* ───────────────────────── 7) Dot Menu UI (palette) ───────────────────────── */
  const Z = 2147483647;
  const dotMenu = document.createElement('div');
  dotMenu.className = CLS_.DOT_MENU;
  dotMenu.setAttribute(ATTR_.CGXUI_OWNER, SkID);
  dotMenu.setAttribute(ATTR_.CGXUI, UI_.DOT_MENU);
  Object.assign(dotMenu.style, {
    position: 'fixed',
    zIndex: Z,
    display: 'none',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    padding: '5px 6px',
    borderRadius: '6px',
    background: 'rgba(26,26,26,0.85)',
    border: '1px solid rgba(255,255,255,0.04)',
    boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
  });
  document.body.appendChild(dotMenu);

  const styleDotMenu = document.createElement('style');
  styleDotMenu.textContent = `
  .${CLS_.SWATCH_ROW} { display: inline-flex; gap: 3px; margin-right: 3px; }
  .${CLS_.SWATCH} {
    all: unset;
    width: 12px;
    height: 4px;
    border-radius: 2px;
    cursor: pointer;
    border: 1px solid rgba(0,0,0,0.4);
    opacity: 0.85;
    filter: brightness(0.7) contrast(0.7);
    transition: transform .15s, opacity .15s, filter .15s;
  }
  .${CLS_.SWATCH}:hover { opacity: 1; transform: scaleY(1.2); filter: brightness(1.05) contrast(1); }
  `;
  document.head.appendChild(styleDotMenu);

  const swatchRow = document.createElement('div');
  swatchRow.className = CLS_.SWATCH_ROW;
  swatchRow.setAttribute(ATTR_.CGXUI_OWNER, SkID);
  swatchRow.setAttribute(ATTR_.CGXUI, UI_.SWATCH_ROW);
  dotMenu.appendChild(swatchRow);

  COLORS.forEach(({ name, color }) => {
    const sw = document.createElement('button');
    sw.className = CLS_.SWATCH;
    sw.setAttribute(ATTR_.CGXUI_OWNER, SkID);
    sw.setAttribute(ATTR_.CGXUI, UI_.SWATCH);
    sw.style.background = color;
    sw.title = name;
    sw.addEventListener('click', () => {
      if (!dotMenu._target) return;
      const { answerId, colorIndex } = dotMenu._target;
      const arr = inlineDotMap[answerId] || [];
      if (isValidDotName(name)) arr[colorIndex] = name;
      else delete arr[colorIndex];
      inlineDotMap[answerId] = arr.filter(Boolean);
      saveInlineDots();
      syncMiniMapDot(answerId, arr);
      hideDotMenu();
    });
    swatchRow.appendChild(sw);
  });

  function showDotMenu(event, answerId, colorIndex) {
    event.preventDefault();
    dotMenu._target = { answerId, colorIndex };
    dotMenu.style.display = 'flex';
    const rect = event.target.getBoundingClientRect();
    const menuWidth = 110;
    dotMenu.style.left = Math.max(4, rect.left - menuWidth - 8) + 'px';
    dotMenu.style.top  = Math.max(6, rect.top - 4) + 'px';
  }
  function hideDotMenu() { dotMenu.style.display = 'none'; dotMenu._target = null; }
  window.addEventListener('click', e => { if (!dotMenu.contains(e.target)) hideDotMenu(); }, true);
  window.showDotMenu = showDotMenu;

  /* ───────────────────────── 7.5) Turn recolor popup bridge (Highlights Engine authority) ───────────────────────── */
  function openHighlightsPopupBridge(event, ctx) {
    const payload = {
      turnId: String(ctx?.turnId || '').trim(),
      answerId: String(ctx?.answerId || '').trim(),
      sourceColor: String(ctx?.sourceColor || '').trim().toLowerCase(),
      anchorRect: ctx?.anchorRect || null,
      leftAnchorX: ctx?.leftAnchorX,
      clientX: Number(event?.clientX || 0),
      clientY: Number(event?.clientY || 0),
      mode: 'bulk-recolor',
      source: 'dots:middle'
    };
    const openFns = [
      TOPW?.H2O_HL?.openPopup,
      W?.H2O?.inline?.openPopup,
      W?.H2OInline?.openPopup,
    ].filter((fn) => typeof fn === 'function');
    for (const fn of openFns) {
      try {
        const out = fn(payload);
        if (out === true || (out && typeof out === 'object')) return true;
      } catch {}
    }
    return false;
  }

  /* ───────────────────────── 8) Button resolver ───────────────────────── */
  const mapButtons = (() => {
    const topW = (W && W.top) ? W.top : window;
    if (topW.H2O_MM_mapButtons instanceof Map) return topW.H2O_MM_mapButtons;
    const m = new Map();
    topW.H2O_MM_mapButtons = m;
    return m;
  })();

  function H2O_MM_findMiniBtn(anyId) {
    const key = String(anyId || '').trim();
    if (!key) return null;
    try { const b = mapButtons.get(key); if (b) return b; } catch {}

    // dataset primaryAId scan fallback
    try {
      let found = null;
      mapButtons.forEach((b) => {
        if (found) return;
        const pid = String(b?.dataset?.primaryAId || '').trim();
        if (pid && pid === key) found = b;
      });
      if (found) return found;
    } catch {}

    // DOM search fallback
    try {
      const esc = CSS.escape ? CSS.escape(key) : key.replace(/"/g, '\\"');
      return document.querySelector(`${SEL_.MM_BTN}[${ATTR_.PRIMARY_A_ID}="${esc}"]`)
          || document.querySelector(`${SEL_.MM_BTN}[${ATTR_.CGXUI_ID}="${esc}"]`)
          || document.querySelector(`${SEL_.MM_BTN}[data-primary-a-id="${esc}"]`);
    } catch {}
    return null;
  }

  /* ───────────────────────── 9) Wash + dot application ───────────────────────── */
  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!m) return { r: 0, g: 0, b: 0 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }
  function luminance({ r, g, b }) {
    const srgb = [r, g, b].map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  }
  function bestTextColor(bgHex) {
    const L = luminance(hexToRgb(bgHex || '#222'));
    return L > 0.5 ? '#111' : '#fff';
  }

  function applyMiniMapWash(primaryId, btn) {
    const washApi = W?.H2O?.MM?.wash;
    if (washApi && typeof washApi.applyToMiniBtn === 'function') {
      try { washApi.applyToMiniBtn(primaryId, btn); return; } catch {}
    }

    const rawName = primaryId ? washMap?.[primaryId] : null;
    const colorName = isValidWashName(rawName) ? rawName : null;
    if (rawName && !colorName) { try { delete washMap[primaryId]; } catch {} }
    const bg = colorName ? (COLOR_BY_NAME?.[colorName] || null) : null;
    if (bg) {
      const text = bestTextColor(bg);
      btn.style.background =
        `linear-gradient(145deg, rgba(255,255,255,0.06), rgba(0,0,0,0.10)), ${bg}`;
      btn.style.color = text;
      btn.style.textShadow =
        text === '#fff' ? '0 0 2px rgba(0,0,0,.35)' : '0 1px 0 rgba(255,255,255,.35)';
      btn.style.boxShadow = `0 0 6px 2px ${bg}40`;
      btn.dataset.hl = 'true';
    } else {
      btn.style.background = 'rgba(255,255,255,.06)';
      btn.style.color = '#e5e7eb';
      btn.style.textShadow = '0 0 2px rgba(0,0,0,.25)';
      btn.style.boxShadow = 'none';
      btn.dataset.hl = 'false';
    }
  }

  function applyMiniMapDots(primaryId, host, btn, colors = null, opts = {}) {
    const { persist = false } = opts;
    if (!host || !btn) return;

    let source = colors;
    if (source == null) source = inlineDotMap?.[primaryId] || [];
    if (!Array.isArray(source)) source = [source];

    const namesRaw = canonicalInlineColors(source);
    const names = namesRaw.filter(isValidDotName);
    let row = host.querySelector(SEL_.MM_DOTROW);

    if (!names.length) {
      row?.remove?.();
      btn.removeAttribute(ATTR_.DOT_COLORS);
      if (persist) { delete inlineDotMap[primaryId]; saveInlineDots(); }
      return;
    }

    if (persist) { inlineDotMap[primaryId] = names; saveInlineDots(); }

    const active = new Set(names.map(n => String(n).toLowerCase()));
    const ORDER = (W.H2O?.MM?.DOT_ORDER && W.H2O.MM.DOT_ORDER.length) ? W.H2O.MM.DOT_ORDER : DOT_ORDER;

    const dotKey = ORDER.map(n => {
      const nn = String(n).toLowerCase();
      return active.has(nn) ? nn : '';
    }).join('|');

    if (btn.getAttribute(ATTR_.DOT_COLORS) === dotKey && row) return;
    btn.setAttribute(ATTR_.DOT_COLORS, dotKey);

    if (!row) {
      row = document.createElement('div');
      row.className = CLS_.DOTROW;
      row.setAttribute(ATTR_.CGXUI_OWNER, SkID);
      row.setAttribute(ATTR_.CGXUI, UI_.DOTROW);
      host.appendChild(row);
    }
    if (!row._h2oRecolorBound) {
      row._h2oRecolorBound = true;
      const openTurnRecolor = (event) => {
        if ((event.button ?? -1) !== 1) return;
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();

        const rowEl = event.currentTarget;
        const btnEl = rowEl?.closest?.(SEL_.MM_WRAP)?.querySelector?.(SEL_.MM_BTN) || null;
        const turnId = String(
          rowEl?.getAttribute?.(ATTR_.TURN_ID) ||
          btnEl?.dataset?.turnId ||
          btnEl?.dataset?.id ||
          ''
        ).trim();
        const answerId = String(btnEl?.dataset?.primaryAId || '').trim();
        if (!turnId) return;

        const dotEl = event.target?.closest?.(`.${CLS_.DOT_CELL}[${ATTR_.CGXUI_OWNER}="${SkID}"][${ATTR_.CGXUI}="${UI_.DOT_CELL}"]`) || null;
        let sourceColor = String(dotEl?.getAttribute?.(ATTR_.DOT_COLOR) || '').trim().toLowerCase();
        if (!sourceColor || !isValidDotName(sourceColor)) sourceColor = '';

        // If source color is ambiguous, pick dominant color inside this turn.
        const answerEl = resolveAnswerElInTurn(turnId, answerId);
        if (!sourceColor || !hasTurnColor(answerEl, answerId, sourceColor)) {
          sourceColor = getDominantTurnColor(answerEl, answerId);
        }

        const anchorRect = btnEl?.getBoundingClientRect?.() || rowEl?.getBoundingClientRect?.() || null;
        const leftAnchorX = Number.isFinite(rowEl?.getBoundingClientRect?.()?.left)
          ? rowEl.getBoundingClientRect().left
          : Number.isFinite(anchorRect?.left) ? anchorRect.left : (event?.clientX || 0);
        openHighlightsPopupBridge(event, { turnId, answerId, sourceColor, anchorRect, leftAnchorX });
      };
      row.addEventListener('mousedown', openTurnRecolor, true);
      row.addEventListener('auxclick', (event) => {
        if ((event.button ?? -1) !== 1) return;
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      }, true);
    }
    const hostTurnId = String(btn?.dataset?.turnId || btn?.dataset?.id || '').trim();
    if (hostTurnId) row.setAttribute(ATTR_.TURN_ID, hostTurnId);

    row.innerHTML = '';

    ORDER.forEach((slotName, idx) => {
      const name = String(slotName).toLowerCase();
      const dot = document.createElement('span');
      dot.className = CLS_.DOT_CELL;
      dot.setAttribute(ATTR_.CGXUI_OWNER, SkID);
      dot.setAttribute(ATTR_.CGXUI, UI_.DOT_CELL);
      dot.setAttribute(ATTR_.DOT_COLOR, name);
      Object.assign(dot.style, {
        width: '5px',
        height: '5px',
        borderRadius: '50%',
        background: 'transparent',
        boxShadow: 'none',
        cursor: active.has(name) ? 'pointer' : 'default',
        margin: '0'
      });
      if (active.has(name)) {
        const resolveDotContext = (event) => {
          const rowEl = event.currentTarget?.closest?.(SEL_.MM_DOTROW) || null;
          const btnEl =
            rowEl?.closest?.(SEL_.MM_WRAP)?.querySelector?.(SEL_.MM_BTN) ||
            event.currentTarget?.closest?.(SEL_.MM_WRAP)?.querySelector?.(SEL_.MM_BTN) ||
            null;
          const turnId = String(
            rowEl?.getAttribute?.(ATTR_.TURN_ID) ||
            btnEl?.dataset?.turnId ||
            btnEl?.dataset?.id ||
            ''
          ).trim();
          const colorKey = String(event.currentTarget?.getAttribute?.(ATTR_.DOT_COLOR) || name || '').trim().toLowerCase();
          const answerId = String(btnEl?.dataset?.primaryAId || primaryId || '').trim();
          return { turnId, colorKey, answerId };
        };

        dot.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        }, true);

        // Left-click: jump immediately on mousedown for maximum responsiveness.
        dot.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
          const { turnId, colorKey, answerId } = resolveDotContext(e);
          scrollToFirstHighlightInTurn(turnId, colorKey, { answerId, dotEl: e.currentTarget });
        }, true);

        const c = COLOR_BY_NAME?.[name] || DOT_REF_HEX?.[name];
        if (c) {
          dot.style.background = c;
          dot.style.boxShadow = `0 0 2px ${c}`;
        }
        // Suppress synthesized click side-effects (handled on mousedown).
        dot.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        }, true);
      }
      row.appendChild(dot);
    });
  }

  function syncMiniMapDot(anyId, colors = null, opts = {}) {
    const { persist = false } = opts;
    if (!anyId || anyId === 'undefined') return;
    const key = String(anyId).trim();
    const btn = H2O_MM_findMiniBtn(key);
    if (btn) btn._h2oHost = btn._h2oHost || btn.closest?.(SEL_.MM_WRAP) || null;

    // If no button exists yet, only persist
    if (!btn) {
      if (persist) {
        const arr = Array.isArray(colors) ? colors : (colors == null ? [] : [colors]);
        const names = canonicalInlineColors(arr);
        const valid = names.filter(isValidDotName);
        if (valid.length) inlineDotMap[key] = valid;
        else delete inlineDotMap[key];
        saveInlineDots();
      }
      return;
    }

    const colEl =
      document.querySelector(SEL_.MM_COL) ||
      btn.closest?.(SEL_.MM_COL) ||
      document.querySelector(SEL_.MINIMAP);

    let host = btn._h2oHost || btn.closest?.(SEL_.MM_WRAP) || null;
    if (!host || !host.matches?.(SEL_.MM_WRAP)) {
      const wrap = document.createElement('div');
      wrap.className = CLS_.WRAP;
      wrap.setAttribute(ATTR_.CGXUI_OWNER, SkID);
      wrap.setAttribute(ATTR_.CGXUI, UI_.WRAP);
      if (btn.isConnected) { btn.replaceWith(wrap); } else { (colEl || document.body).appendChild(wrap); }
      wrap.appendChild(btn);
      host = wrap;
    }
    btn._h2oHost = host;
    if (colEl && host.parentElement !== colEl) colEl.appendChild(host);

    const primaryId = String(btn.dataset.primaryAId || '').trim();
    if (!primaryId) {
      host?.querySelector?.(SEL_.MM_DOTROW)?.remove?.();
      btn.removeAttribute(ATTR_.DOT_COLORS);
      return;
    }

    applyMiniMapWash(primaryId, btn);
    applyMiniMapDots(primaryId, host, btn, colors, { persist });
  }

  const STATE_DOT_SYNC_QUEUE = new Map();
  let STATE_DOT_SYNC_RAF = 0;
  function scheduleDotSync(answerId, colors, persist) {
    const id = String(answerId || '').trim();
    if (!id) return;

    // Keep last payload in frame; explicit color payload wins over null payload.
    const prev = STATE_DOT_SYNC_QUEUE.get(id);
    const hasColors = colors != null;
    if (!prev || hasColors) {
      STATE_DOT_SYNC_QUEUE.set(id, { colors, persist: !!persist });
    } else if (persist) {
      prev.persist = true;
    }

    if (STATE_DOT_SYNC_RAF) return;
    STATE_DOT_SYNC_RAF = requestAnimationFrame(() => {
      STATE_DOT_SYNC_RAF = 0;
      const entries = Array.from(STATE_DOT_SYNC_QUEUE.entries());
      STATE_DOT_SYNC_QUEUE.clear();
      for (const [queuedId, payload] of entries) {
        try {
          const btn = H2O_MM_findMiniBtn(queuedId);
          if (btn) btn.removeAttribute(ATTR_.DOT_COLORS);
          syncMiniMapDot(queuedId, payload?.colors ?? null, { persist: !!payload?.persist });
        } catch {}
      }
    });
  }

  /* ───────────────────────── 10) Inline → dots bridge ───────────────────────── */
  function onInlineChanged(e) {
    const detail = e?.detail || {};
    const answerId = String(detail.answerId || '').trim();
    if (!answerId) {
      window.H2O_scheduleMiniMapRebuild?.('inline:changed (no answerId)');
      return;
    }
    const hasColors = detail.colors != null;
    const colors = hasColors ? detail.colors : null;
    scheduleDotSync(answerId, colors, !!hasColors);
  }

  function onAnswerHighlight(e) {
    const detail = e?.detail || {};
    const answerId = String(detail.answerId || detail.primaryAId || '').trim();
    const color = detail.color ?? detail.colorName ?? null;
    if (!answerId) return;

    // Washer add-on owns wash-map writes when present.
    if (!MM_HAS_EXTERNAL_WASH()) {
      if (isValidWashName(color)) washMap[answerId] = color;
      else delete washMap[answerId];
      saveWashMap();
    }

    scheduleDotSync(answerId, null, false);
  }

  (function bindDotBridgesOnce() {
    if (window.H2O_MM_DOT_BRIDGES) return;
    window.H2O_MM_DOT_BRIDGES = true;
    const dual = (ev, fn) => { window.addEventListener(ev, fn); if (ev.startsWith('evt:')) window.addEventListener(ev.slice(4), fn); };
    dual(EV_.INLINE_CHANGED,   onInlineChanged);
    dual(EV_.INLINE_RESTORED,  onInlineChanged);
    dual(EV_.ANSWER_HIGHLIGHT, onAnswerHighlight);
  })();

  /* ───────────────────────── 11) Optional: Inline mutation observer ─────────────────────────
   * Only runs if helper functions exist; otherwise skipped harmlessly.
   */
  const STATE_INLINE_DIRTY = new Set();
  let STATE_INLINE_SCHED = false;

  function inlineScheduleFlush() {
    if (STATE_INLINE_SCHED) return;
    STATE_INLINE_SCHED = true;
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 80));
    idle(() => {
      STATE_INLINE_SCHED = false;
      if (document.documentElement.dataset.h2oMmMutating === '1') {
        setTimeout(inlineScheduleFlush, 120);
        return;
      }
      if (typeof getMessageId !== 'function' || typeof collectInlineColors !== 'function') {
        STATE_INLINE_DIRTY.clear();
        return;
      }
      STATE_INLINE_DIRTY.forEach(answerEl => {
        const id = getMessageId(answerEl);
        if (!id) return;
        const target = (typeof getAnswerContent === 'function' ? (getAnswerContent(answerEl) || answerEl) : answerEl);
        const raw = collectInlineColors(target);
        const colors = canonicalInlineColors(raw);
        const prev = inlineDotMap[id] || [];
        if (prev.length === colors.length && prev.every((c, i) => c === colors[i])) return;
        inlineDotMap[id] = colors;
        saveInlineDots();
        window.dispatchEvent(new CustomEvent(EV_.INLINE_CHANGED, {
          detail: { answerId: id, colors },
          bubbles: true,
          composed: true
        }));
      });
      STATE_INLINE_DIRTY.clear();
    }, { timeout: 600 });
  }

  function detachLegacyInlineObserver() {
    const roots = [
      document.querySelector('[data-testid="conversation-turns"]'),
      document.querySelector('main'),
      document.body
    ].filter(Boolean);
    for (const root of roots) {
      const obs = root?._h2oInlineObs;
      if (obs && typeof obs.disconnect === 'function') {
        try { obs.disconnect(); } catch {}
        try { delete root._h2oInlineObs; } catch { root._h2oInlineObs = null; }
      }
    }
  }

  function attachInlineMutationObserver() {
    if (window.H2O_MM_DOTS_INLINE_OBS) return;
    if (typeof MutationObserver === 'undefined') return;
    // guard missing helpers
    if (typeof isInlineNode !== 'function' || typeof collectInlineColors !== 'function') return;

    // Take ownership from legacy observers (if MiniMap core attached one before this plugin loaded).
    detachLegacyInlineObserver();
    window.H2O_MM_INLINE_OBS = true;
    window.H2O_MM_DOTS_INLINE_OBS = true;

    const root =
      document.querySelector('[data-testid="conversation-turns"]') ||
      document.querySelector('main') ||
      document.body;
    if (!root || root._h2oInlineObs) return;
    const mo = new MutationObserver((muts) => {
      if (document.documentElement.dataset.h2oMmMutating === '1') return;
      for (const m of muts) {
        if (m.type === 'attributes') {
          if (!isInlineNode(m.target)) continue;
          const ans = m.target.closest?.(`div[${ATTR_.MSG_ROLE}="assistant"]`);
          if (ans) STATE_INLINE_DIRTY.add(ans);
          continue;
        }
        if (m.type === 'childList') {
          const nodes = [...m.addedNodes, ...m.removedNodes];
          for (const n of nodes) {
            if (!(n instanceof HTMLElement)) continue;
            const hit = isInlineNode(n) || !!n.querySelector?.('[data-inline-hl]');
            if (!hit) continue;
            const ans = (n.matches?.(`div[${ATTR_.MSG_ROLE}="assistant"]`) ? n : null) ||
                        (n.closest?.(`div[${ATTR_.MSG_ROLE}="assistant"]`) || null) ||
                        (n.querySelector?.(`div[${ATTR_.MSG_ROLE}="assistant"]`) || null);
            if (ans) STATE_INLINE_DIRTY.add(ans);
          }
        }
      }
      if (STATE_INLINE_DIRTY.size) inlineScheduleFlush();
    });
    mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['style','class','data-inline-hl','data-h2o-inline-color'] });
    root._h2oInlineObs = mo;
  }
  attachInlineMutationObserver();

  /* ───────────────────────── 12) Dot click → turn-scoped inline jump ───────────────────────── */
  const STATE_DOT_DEBUG = { lastBtnCaptureTs: 0, lastBtnCaptureTurnId: '' };
  const HEADER_CANDIDATE_SEL = [
    'header',
    '[data-testid="page-header"]',
    '[data-headlessui-state] header',
    'div[class*="top-0"][class*="sticky"]',
    'div[class*="top-0"][class*="fixed"]',
  ].join(', ');

  if (DEBUG_DOT_CLICK) {
    window.addEventListener('click', (e) => {
      const btn = e?.target?.closest?.(SEL_.MM_BTN);
      if (!btn) return;
      STATE_DOT_DEBUG.lastBtnCaptureTs = performance.now();
      STATE_DOT_DEBUG.lastBtnCaptureTurnId = String(btn.dataset?.turnId || btn.dataset?.id || '').trim();
    }, true);
  }

  function escAttrValue(raw) {
    const s = String(raw || '');
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(s);
    return s.replace(/"/g, '\\"');
  }

  function resolveTurnObj(turnId = '') {
    const key = String(turnId || '').trim();
    if (!key) return null;
    try {
      const t = TOPW.H2O_MM_turnById?.get?.(key);
      if (t) return t;
    } catch {}
    try {
      const t = W?.H2O?.MM?.core?.getTurnById?.(key);
      if (t) return t;
    } catch {}
    return null;
  }

  function resolveAnswerIdForTurn(turnId = '', answerIdHint = '') {
    const hint = String(answerIdHint || '').trim();
    if (hint) return hint;
    const turn = resolveTurnObj(turnId);
    const fromTurn = String(turn?.answerId || turn?.primaryAId || '').trim();
    if (fromTurn) return fromTurn;
    const key = String(turnId || '').trim();
    if (!key) return '';
    try {
      const entries = TOPW.H2O_MM_turnIdByAId?.entries?.();
      if (entries) {
        for (const [aId, tId] of entries) {
          if (String(tId || '').trim() === key) return String(aId || '').trim();
        }
      }
    } catch {}
    return '';
  }

  function resolveAnswerElInTurn(turnId = '', answerIdHint = '') {
    const turn = resolveTurnObj(turnId);
    const fromTurn = turn?.el || null;
    if (fromTurn?.isConnected) return fromTurn;

    const answerId = resolveAnswerIdForTurn(turnId, answerIdHint);
    if (answerId) {
      const escA = escAttrValue(answerId);
      const byMsgId =
        document.querySelector(`div[${ATTR_.MSG_ROLE}="assistant"][${ATTR_.MSG_ID}="${escA}"]`) ||
        document.querySelector(`article[${ATTR_.MSG_ROLE}="assistant"][${ATTR_.MSG_ID}="${escA}"]`) ||
        document.querySelector(`[${ATTR_.MSG_ID}="${escA}"]`);
      if (byMsgId) return byMsgId;
    }

    const key = String(turnId || '').trim();
    if (key) {
      const escT = escAttrValue(key);
      const byTurn =
        document.querySelector(`div[${ATTR_.MSG_ROLE}="assistant"][${ATTR_.TURN_ID}="${escT}"]`) ||
        document.querySelector(`article[${ATTR_.MSG_ROLE}="assistant"][${ATTR_.TURN_ID}="${escT}"]`) ||
        document.querySelector(`[${ATTR_.TURN_ID}="${escT}"]`);
      if (byTurn) return byTurn;
    }
    return null;
  }

  function readInlineNodeColor(node) {
    if (!node) return '';
    const a = String(node.getAttribute?.('data-h2o-inline-color') || '').trim().toLowerCase();
    if (a) return String(nearestDotColorName(a) || a || '').trim().toLowerCase();
    const b = String(node.getAttribute?.('data-inline-hl') || '').trim().toLowerCase();
    if (b) {
      const tok = b.split(/\s+/).find(Boolean) || '';
      if (tok) return String(nearestDotColorName(tok) || tok || '').trim().toLowerCase();
    }
    const cls = String(node.className || '').trim().toLowerCase();
    if (cls) {
      const hit = DOT_ORDER.find((c) => cls.includes(c));
      if (hit) return hit;
    }
    const inlineBg = String(node.style?.backgroundColor || node.style?.background || '').trim();
    const c1 = nearestDotColorName(inlineBg);
    if (c1) return c1;
    let c2 = '';
    try { c2 = nearestDotColorName(String(getComputedStyle(node).backgroundColor || '').trim()) || ''; } catch {}
    return c2;
  }

  function hasTurnColor(answerEl, answerId = '', colorName = '') {
    const c = String(colorName || '').trim().toLowerCase();
    if (!c) return false;
    const id = String(answerId || '').trim();
    if (id && Array.isArray(inlineDotMap?.[id]) && canonicalInlineColors(inlineDotMap[id]).includes(c)) return true;
    if (!answerEl) return false;
    const hit = findFirstHighlightInAnswer(answerEl, c);
    return !!hit;
  }

  function getDominantTurnColor(answerEl, answerId = '') {
    const id = String(answerId || '').trim();
    if (answerEl) {
      const counts = Object.create(null);
      const nodes = answerEl.querySelectorAll?.(INLINE_NODE_SEL) || [];
      for (const n of nodes) {
        const c = readInlineNodeColor(n);
        if (!c || !isValidDotName(c)) continue;
        counts[c] = (counts[c] || 0) + 1;
      }
      let best = '', bestCount = -1;
      for (const c of DOT_ORDER) {
        const ct = Number(counts[c] || 0);
        if (ct > bestCount) { bestCount = ct; best = c; }
      }
      if (best && bestCount > 0) return best;
    }
    const fromMap = canonicalInlineColors(inlineDotMap?.[id] || []);
    return fromMap[0] || '';
  }

  function recolorTurnHighlights(turnId, fromColor, toColor, opts = {}) {
    const turnKey = String(turnId || '').trim();
    const from = String(nearestDotColorName(fromColor) || fromColor || '').trim().toLowerCase();
    const to = String(nearestDotColorName(toColor) || toColor || '').trim().toLowerCase();
    const answerId = resolveAnswerIdForTurn(turnKey, opts.answerId || '');
    if (!turnKey || !answerId || !from || !to || !isValidDotName(from) || !isValidDotName(to) || from === to) {
      return { ok: false, changed: 0, reason: 'noop' };
    }
    const fn =
      TOPW?.H2O_HL?.recolorTurnHighlights ||
      W?.H2O?.inline?.recolorTurnHighlights ||
      W?.H2OInline?.recolorTurnHighlights ||
      null;
    if (typeof fn !== 'function') return { ok: false, changed: 0, reason: 'hl-api-missing' };
    try {
      return fn(turnKey, from, to, { answerId, source: 'dots:bulk-recolor' }) || { ok: true, changed: 0, answerId, turnId: turnKey, from, to };
    } catch (err) {
      try { console.warn('[MiniMap Dots] recolorTurnHighlights failed', err); } catch {}
      return { ok: false, changed: 0, reason: 'exception' };
    }
  }

  function findFirstHighlightInAnswer(answerEl, colorKey) {
    if (!answerEl || !colorKey) return null;
    const c = escAttrValue(colorKey);
    const exactSel = `[data-h2o-inline-color="${c}"], [data-inline-hl="${c}"], [data-h2o-inline-color~="${c}"], [data-inline-hl~="${c}"]`;
    const exact = answerEl.querySelector?.(exactSel);
    if (exact) return exact;

    // Fallback: class/style based markers used by some highlight renderers.
    const fallbackNodes = answerEl.querySelectorAll?.(INLINE_NODE_SEL);
    if (!fallbackNodes?.length) return null;
    for (const el of fallbackNodes) {
      if (readInlineNodeColor(el) === colorKey) return el;
    }
    return null;
  }

  function getHeaderOffsetPx() {
    let maxBottom = 0;
    const nodes = document.querySelectorAll(HEADER_CANDIDATE_SEL);
    nodes.forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      let cs = null;
      try { cs = getComputedStyle(el); } catch { cs = null; }
      if (!cs) return;
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      if (cs.position !== 'fixed' && cs.position !== 'sticky') return;
      const r = el.getBoundingClientRect?.();
      if (!r || !Number.isFinite(r.height) || r.height <= 0) return;
      if (r.top > 6 || r.bottom <= 0) return;
      if (r.height > Math.max(240, window.innerHeight * 0.45)) return;
      maxBottom = Math.max(maxBottom, r.bottom);
    });
    return Math.max(0, Math.round(maxBottom + 8));
  }

  function smoothScrollToTargetWithOffset(targetEl) {
    if (!targetEl) return;
    try { targetEl.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' }); } catch {}
    const headerOffset = getHeaderOffsetPx();
    if (headerOffset <= 0) return;
    requestAnimationFrame(() => {
      try {
        const y = window.pageYOffset + targetEl.getBoundingClientRect().top - headerOffset;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      } catch {}
    });
  }

  function tryEnsureInlineRestoreForTurn(turnId, answerId) {
    try { W.H2O?.MM?.dots?.attachInlineMutationObserver?.(); } catch {}
    const detail = {
      answerId: String(answerId || '').trim(),
      turnId: String(turnId || '').trim(),
      source: 'dots:jump-retry'
    };
    try { window.dispatchEvent(new CustomEvent(EV_.INLINE_RESTORED, { detail, bubbles: true, composed: true })); } catch {}
    try { window.dispatchEvent(new CustomEvent(EV_.INLINE_RESTORED.replace(/^evt:/, ''), { detail, bubbles: true, composed: true })); } catch {}
  }

  function runDotClickDebugCheck({ turnId, answerEl, foundElement, colorKey, dotEl }) {
    if (!DEBUG_DOT_CLICK) return;
    const sameTurn = !!(answerEl && foundElement && answerEl.contains(foundElement));
    const hitBtn = (performance.now() - Number(STATE_DOT_DEBUG.lastBtnCaptureTs || 0)) < 120 &&
      String(STATE_DOT_DEBUG.lastBtnCaptureTurnId || '') === String(turnId || '');
    try {
      console.debug('[MiniMap Dots] dot click jump', {
        turnId: String(turnId || ''),
        color: String(colorKey || ''),
        foundElement: foundElement || null,
        foundInsideTurn: sameTurn,
        dotTriggeredMiniBtnClick: hitBtn,
        dotEl: dotEl || null,
      });
    } catch {}
  }

  function scrollToFirstHighlightInTurn(turnId, colorKey, opts = {}) {
    const turnKey = String(turnId || '').trim();
    const color = String(nearestDotColorName(colorKey) || colorKey || '').trim().toLowerCase();
    const answerId = resolveAnswerIdForTurn(turnKey, opts.answerId || '');
    const hasColorInMap = !!(answerId && inlineDotMap?.[answerId] && canonicalInlineColors(inlineDotMap[answerId]).includes(color));
    let answerEl = resolveAnswerElInTurn(turnKey, answerId);
    let found = findFirstHighlightInAnswer(answerEl, color);

    if (!found && (hasColorInMap || answerEl) && opts.retry !== false) {
      tryEnsureInlineRestoreForTurn(turnKey, answerId);
      answerEl = resolveAnswerElInTurn(turnKey, answerId);
      found = findFirstHighlightInAnswer(answerEl, color);
    }

    if (found) {
      smoothScrollToTargetWithOffset(found);
      try { W.applyTempFlash?.(found); } catch {}
    }
    runDotClickDebugCheck({ turnId: turnKey, answerEl, foundElement: found, colorKey: color, dotEl: opts.dotEl || null });
    return found || null;
  }

  /* ───────────────────────── 12.5) Public API (Split contract) ───────────────────────── */
  try {
    W.H2O = W.H2O || {};
    W.H2O.MM = W.H2O.MM || {};
    W.H2O.MM.dots = W.H2O.MM.dots || {};
    // Read-only map access for other modules (e.g., MiniMap Nav include-inline)
    W.H2O.MM.dots.getInlineDotMap = () => inlineDotMap;
    // Compatibility: other modules may still call syncMiniMapDot(...) directly
    W.H2O.MM.dots.syncMiniMapDot = syncMiniMapDot;
    // Runtime owner (Engine) may request observer attach through dots bridge.
    W.H2O.MM.dots.attachInlineMutationObserver = attachInlineMutationObserver;
    // Optional helpers
    W.H2O.MM.dots.saveInlineDots = saveInlineDots;
    W.H2O.MM.dots.showDotMenu = showDotMenu;
    W.H2O.MM.dots.scrollToFirstHighlightInTurn = scrollToFirstHighlightInTurn;
    W.H2O.MM.dots.recolorTurnHighlights = recolorTurnHighlights;
    W.H2O.MM.dots.openHighlightsPopupBridge = openHighlightsPopupBridge;
  } catch {}

  // Legacy global alias (safe): allows older scripts to keep working without owning dot logic.
  try { if (typeof window.syncMiniMapDot !== 'function') window.syncMiniMapDot = syncMiniMapDot; } catch {}

  /* ───────────────────────── 13) Public helper to repaint all dots (optional) ───────────────────────── */
  window.H2O_MM_repaintDots = function repaintAll() {
    document.querySelectorAll(SEL_.MM_BTN).forEach(btn => {
      const id = btn.dataset.primaryAId || btn.getAttribute(ATTR_.PRIMARY_A_ID) || '';
      if (id) syncMiniMapDot(id);
    });
  };
})();
