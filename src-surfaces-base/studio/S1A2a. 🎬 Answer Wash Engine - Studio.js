// ==UserScript==
// @h2o-id             s1a2a.answer.wash.engine.studio
// @name               S1A2a. 🎬 Answer Wash Engine - Studio
// @namespace          H2O.Premium.CGX.answer.wash.engine.minimap.add.on
// @author             HumamDev
// @version            1.3.16
// @revision           001
// @build              260304-102754
// @description        Answer Background Washer for H2O MiniMap: persistent wash map + middle-click palette + paints answer + paints minimap buttons (exported API only).
// @match              https://chatgpt.com/*
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  // Realm-safe window (TM + top)
  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const TOPW = (W.top || W);
  const WASH_VER = '1.3.16';
  const BOOT_KEY = '__H2O_MM_WASH_BOOTED__';

  // Live Sync signal (WebDAV LiveState poll/push can listen without monkeypatching storage)
  const EV_LIVE_CHANGED = 'evt:h2o:data:liveChanged';

  // Signal to MiniMap core that Washer is external (so it can delegate, not duplicate).
  TOPW.H2O_MM_WASH_PLUGIN = true;
  TOPW.H2O_MM_WASH_PLUGIN_VER = WASH_VER;
  if (TOPW[BOOT_KEY] === true && W?.H2O?.MM?.wash) return;
  TOPW[BOOT_KEY] = true;

  // -------- Minimal shared disk keys (MUST MATCH MiniMap v12.5.21) --------
  // These strings are intentionally identical to the MiniMap keys to keep state bit-identical.
  const SUITE = 'prm';
  const HOST  = 'cgx';
  const DsID  = 'mnmp';
  const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`;

  const STORAGE_WASH_MAP_NEW = `${NS_DISK}:state:wash_map:v1`;
  const STORAGE_WASH_MAP_OLD = 'H2O_MM_washMap'; // legacy (pre-H2O disk key) alias key used by older builds
  const STORAGE_WASH_MAP_LEGACY_KEYS = [
    STORAGE_WASH_MAP_OLD,                    // old global
    'ho:mm:washMap',                         // older experiments
    `${NS_DISK}:state:wash_map:v0`,          // early H2O drafts
    `${NS_DISK}:state:washmap:v0`,           // typo-tolerant
    `${NS_DISK}:state:glow_hl:v1`,           // legacy read-only alias (misnamed; wash payload)
  ];

  // -------- Minimal CSS/UI tokens (owned) --------
  const SkID = 'mnmp'; // must match MiniMap skin owner for consistent UI ownership tagging

  const CLS_ = {
    WASH_WRAP:   'cgxui-mnmp-wash-wrap',
    WASH_PREFIX: 'cgxui-mnmp-wash-',
    FLASH:       'cgxui-mnmp-flash',
    COLOR_MENU:  'cgxui-mnmp-color-menu',
  };

  const ATTR_ = {
    CGXUI:       'data-cgxui',
    CGXUI_OWNER: 'data-cgxui-owner',
    CGXUI_FLASH: 'data-cgxui-flash',
    ID:          'data-id',
    PRIMARY_A_ID:'data-primary-a-id',
    MSG_ID:      'data-message-id',
    CGXUI_ID:    'data-cgxui-id',
    MSG_ROLE:    'data-message-author-role',
  };

  const UI_ = {
    COLOR_MENU: 'mnmp-color-menu',
    SWATCH:     'mnmp-color-swatch',
  };
  const SEL_ = {
    MM_BTN: `[${ATTR_.CGXUI}="mnmp-btn"][${ATTR_.CGXUI_OWNER}="${SkID}"]`,
    MM_CONTAINER: `[${ATTR_.CGXUI}="mnmp-minimap"][${ATTR_.CGXUI_OWNER}="${SkID}"], [${ATTR_.CGXUI}="mnmp-col"][${ATTR_.CGXUI_OWNER}="${SkID}"], [${ATTR_.CGXUI}="mnmp-wrap"][${ATTR_.CGXUI_OWNER}="${SkID}"]`,
  };
  const STYLE_ID = 'cgxui-mnmp-wash-addon-style';

  const Z = 2147483647;

  // -------- Minimal helpers --------
  const CLEANUP = [];
  const UTIL_on = (el, ev, fn, opt) => {
    if (!el || typeof el.addEventListener !== 'function') return;
    el.addEventListener(ev, fn, opt);
    CLEANUP.push(() => {
      try { el.removeEventListener(ev, fn, opt); } catch {}
    });
  };

  const UTIL_storage = {
    getStr(key, fallback = null) {
      try {
        const v = TOPW.localStorage.getItem(key);
        return (v == null) ? fallback : v;
      } catch { return fallback; }
    },
    setStr(key, val) {
      try { TOPW.localStorage.setItem(key, String(val)); } catch {}
    },
    // ✅ Always available (fixes “wash loads only after pull event” + prevents silent wipes)
    getJSON(key, fallback = null) {
      try {
        const s = TOPW.localStorage.getItem(key);
        if (!s) return fallback;
        return JSON.parse(s);
      } catch { return fallback; }
    },
    setJSON(key, obj) {
      try { TOPW.localStorage.setItem(key, JSON.stringify(obj)); return true; } catch { return false; }
    },
    del(key) {
      try { TOPW.localStorage.removeItem(key); return true; } catch { return false; }
    }
  };

  // -------- Palette colors (MUST MATCH MiniMap v12.5.21) --------
  const COLORS = [
    // FIRST ROW
    { name:'blue',   color:'#3A8BFF' },
    { name:'red',    color:'#FF4A4A' },
    { name:'green',  color:'#31D158' },
    { name:'gold',   color:'#FFD700' },

    // SECOND ROW
    { name:'sky',    color:'#4CD3FF' },
    { name:'pink',   color:'#FF71C6' },
    { name:'purple', color:'#A36BFF' },
    { name:'orange', color:'#FFA63A' }
  ];

  const COLOR_BY_NAME = Object.fromEntries(COLORS.map(c => [c.name, c.color]));

  function normalizeColor(c) {
    if (!c) return '';
    return COLOR_BY_NAME[c] || c;
  }

  function isValidWashName(name) {
    const n = String(name || '').trim();
    return !!(n && COLOR_BY_NAME[n]);
  }

  // -------- Legacy tripwire (read-only alias) --------
  const CFG_LEGACY_WASH_TRIPWIRE = true;

  function UTIL_makeReadOnlyMapView(obj, label = 'legacy-map') {
    if (!obj || typeof obj !== 'object') return obj;
    return new Proxy(obj, {
      set(_t, prop, _val) {
        try { console.warn(`[Washer] BLOCKED write via ${label}:`, String(prop)); } catch {}
        return true;
      },
      deleteProperty(_t, prop) {
        try { console.warn(`[Washer] BLOCKED delete via ${label}:`, String(prop)); } catch {}
        return true;
      },
      defineProperty(_t, prop) {
        try { console.warn(`[Washer] BLOCKED defineProperty via ${label}:`, String(prop)); } catch {}
        return true;
      }
    });
  }

  // -------- washMap (shared slot in TOPW) --------
  const washMap = (() => {
  // 🧠 Source of truth: STORAGE_WASH_MAP_NEW (disk). We accept multiple legacy keys for migration.
  const isWashShape = (v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    // expect: { [answerId]: colorStr }
    const ks = Object.keys(v);
    if (!ks.length) return true;
    const k0 = ks[0];
    const v0 = v[k0];
    return (typeof v0 === 'string' || v0 === null || v0 === undefined);
  };

  const readJSON = (k) => { try { return UTIL_storage.getJSON(k); } catch { return null; } };

  // 1) Prefer NEW
  let fromDisk = readJSON(STORAGE_WASH_MAP_NEW);

  // 2) Try legacy keys if NEW missing/invalid
  if (!isWashShape(fromDisk)) {
    for (const k of STORAGE_WASH_MAP_LEGACY_KEYS) {
      const v = readJSON(k);
      if (isWashShape(v)) { fromDisk = v; break; }
    }
  }

  const shared = (isWashShape(fromDisk) ? fromDisk : Object.create(null));
  TOPW.H2O_MM_washMap = shared;
  TOPW.H2O_MM_washMap_raw = shared;

  // ✅ One-time normalize: ensure disk has the NEW key so backup/livesync sees it.
  try {
    const cur = UTIL_storage.getStr(STORAGE_WASH_MAP_NEW);
    if (!cur || cur === 'null' || cur === 'undefined') {
      UTIL_storage.setStr(STORAGE_WASH_MAP_NEW, JSON.stringify(shared));
    }
  } catch {}

  return shared;
})();

  function saveWashMap() {
    try {
      const raw = JSON.stringify(washMap || {});
      // ✅ Prefer H2O Data store API (tracked + syncable + emits store-changed); fallback to localStorage wrapper.
      const H2O = (TOPW.H2O || W.H2O);
      const setRaw = H2O?.data?.store?.setRaw || H2O?.store?.setRaw;
      if (typeof setRaw === 'function') setRaw(STORAGE_WASH_MAP_NEW, raw);
      else UTIL_storage.setStr(STORAGE_WASH_MAP_NEW, raw);

      // ✅ emit one standardized “live changed” event for near-instant sync
      try {
        const detail = {
          domain: DsID,
          source: 'wash',
          keys: [STORAGE_WASH_MAP_NEW, STORAGE_WASH_MAP_OLD],
          at: Date.now(),
        };

        // Dispatch on both realms (some TM sandboxes differ from top-realm listeners)
        try { W.dispatchEvent(new CustomEvent(EV_LIVE_CHANGED, { detail })); } catch {}
        try { TOPW.dispatchEvent(new CustomEvent(EV_LIVE_CHANGED, { detail })); } catch {}

        // If Data module exposes a pulse helper, use it too (strongest bridge).
        // 🔔 Order-safe: prefer H2O.sync (canonical), fall back to H2O.data.sync.
        // Also: ChatGPT may run in an iframe → pulse may live on W.H2O instead of TOPW.H2O.
        let pulseRetryT = TOPW.__H2O_WASH_PULSE_RETRY_T__ || null;
        const tryPulse = () => {
          const H2O = (TOPW.H2O || W.H2O);
          const pulse = H2O?.sync?.live?.pulse || H2O?.data?.sync?.live?.pulse;
          if (typeof pulse === 'function') { pulse(detail); return true; }
          return false;
        };

        if (!tryPulse()) {
          // 🧷 self-report once, no freeze, and keep ONLY one retry loop alive.
          if (!TOPW.__H2O_WASH_PULSE_MISS__) {
            TOPW.__H2O_WASH_PULSE_MISS__ = 1;
            try { console.warn('[Washer] LiveSync pulse unavailable (H2O Data not ready yet). Will retry.'); } catch {}
          }
          if (!pulseRetryT) {
            let tries = 0;
            pulseRetryT = setInterval(() => {
              tries++;
              if (tryPulse() || tries > 20) {
                clearInterval(pulseRetryT);
                TOPW.__H2O_WASH_PULSE_RETRY_T__ = null;
              }
            }, 250);
            TOPW.__H2O_WASH_PULSE_RETRY_T__ = pulseRetryT;
          }
        }
      } catch {}
    } catch (err) {
      console.warn('[Washer] failed to save wash map', err);
    }
  }

  // -------- Contrast helper (copied from MiniMap v12.5.21) --------
  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
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

  // -------- Paint answer element (copied from MiniMap v12.5.21) --------
  function applyAnswerWash(msgEl, colorName, on) {
    if (!msgEl) return;

    msgEl.classList.add(CLS_.WASH_WRAP);

    [...msgEl.classList].forEach(c => {
      if ((c.startsWith(CLS_.WASH_PREFIX) || c.startsWith('cgxui-wash-')) && c !== CLS_.WASH_WRAP) {
        msgEl.classList.remove(c);
      }
    });

    if (!on) {
      if (colorName) msgEl.classList.remove(`${CLS_.WASH_PREFIX}${String(colorName).toLowerCase()}`);
      msgEl.style.removeProperty('--h2o-band-color');
      msgEl.style.removeProperty('--h2o-band-opacity');
      msgEl.style.removeProperty('--h2o-at-wash-color');
      msgEl.style.removeProperty('--h2o-at-wash-text');
      msgEl.style.removeProperty('--h2o-at-wash-glow');
      return;
    }

    const c = normalizeColor(colorName);
    const isGold = String(colorName || '').trim().toLowerCase() === 'gold' || String(c || '').toUpperCase() === '#FFD700';
    const paintBg = isGold ? '#E6C200' : c;
    const textColor = bestTextColor(paintBg);
    if (colorName) msgEl.classList.add(`${CLS_.WASH_PREFIX}${String(colorName).toLowerCase()}`);
    msgEl.style.setProperty('--h2o-band-color', c);
    msgEl.style.setProperty('--h2o-band-opacity', '0.12');
    msgEl.style.setProperty('--h2o-at-wash-color', paintBg);
    msgEl.style.setProperty('--h2o-at-wash-text', textColor);
    msgEl.style.setProperty('--h2o-at-wash-glow', c);
  }

  // -------- Paint MiniMap button (copied from MiniMap v12.5.21) --------
  function applyMiniMapWash(primaryId, btn) {
    if (!btn) return;

    const rawName = primaryId ? washMap?.[primaryId] : null;
    const colorName = isValidWashName(rawName) ? rawName : null;

    if (rawName && !colorName) {
      try { delete washMap[primaryId]; } catch {}
    }

    const bg = colorName ? (COLOR_BY_NAME?.[colorName] || null) : null;

    if (bg) {
      const isGold = colorName === 'gold' || normalizeColor(bg) === '#FFD700';
      const paintBg = isGold ? '#E6C200' : bg;
      const text = bestTextColor(paintBg);
      btn.style.background = `linear-gradient(145deg, rgba(255,255,255,0.06), rgba(0,0,0,0.10)), ${paintBg}`;
      btn.style.color = text;
      btn.style.textShadow = (text === '#fff')
        ? '0 0 2px rgba(0,0,0,.35)'
        : '0 1px 0 rgba(255,255,255,.35)';
      btn.style.boxShadow = isGold
        ? '0 0 5px 1px rgba(255,215,0,0.30)'
        : `0 0 6px 2px ${bg}40`;
      btn.dataset.wash = 'true';
      try { btn.setAttribute('data-cgxui-wash', '1'); } catch {}
    } else {
      btn.style.background = 'rgba(255,255,255,.06)';
      btn.style.color = '#e5e7eb';
      btn.style.textShadow = '0 0 2px rgba(0,0,0,.25)';
      btn.style.boxShadow = 'none';
      btn.dataset.wash = 'false';
      try { btn.removeAttribute('data-cgxui-wash'); } catch {}
    }
  }

  function resolvePrimaryAId(anyId) {
    const raw = String(anyId || '').trim();
    if (!raw) return '';
    try {
      if (W?.H2O_MM_turnIdByAId?.has?.(raw)) return raw;
    } catch {}
    try {
      const t = W?.H2O_MM_turnById?.get?.(raw) || null;
      const pid = String(t?.primaryAId || '').trim();
      if (pid) return pid;
    } catch {}
    return raw;
  }

  function findAnswerElById(primaryAId) {
    const id = String(primaryAId || '').trim();
    if (!id) return null;
    try {
      if (typeof W.H2O_MM_getAnswerElById === 'function') {
        const viaApi = W.H2O_MM_getAnswerElById(id);
        if (viaApi) return viaApi;
      }
    } catch {}
    try {
      if (typeof W.CORE_MM_findMessage === 'function') {
        const viaCore = W.CORE_MM_findMessage(id);
        if (viaCore) return viaCore;
      }
    } catch {}
    const esc = (typeof CSS !== 'undefined' && CSS.escape)
      ? CSS.escape(id)
      : id.replace(/"/g, '\\"');
    return (
      document.querySelector(`[${ATTR_.MSG_ROLE}="assistant"][${ATTR_.MSG_ID}="${esc}"]`) ||
      document.querySelector(`[${ATTR_.MSG_ID}="${esc}"]`) ||
      document.querySelector(`[${ATTR_.CGXUI_ID}="${esc}"]`) ||
      null
    );
  }

  function repaintAnswerNow(primaryAId, colorName) {
    const id = resolvePrimaryAId(primaryAId);
    if (!id) return;
    const msgEl = findAnswerElById(id);
    if (!msgEl) return;
    applyAnswerWash(msgEl, colorName, !!colorName);
  }

  function restoreWashedAnswerById(anyId) {
    const id = resolvePrimaryAId(anyId);
    if (!id) return false;
    const rawColor = washMap?.[id];
    const colorName = isValidWashName(rawColor) ? String(rawColor) : null;
    if (rawColor && !colorName) {
      try { delete washMap[id]; } catch {}
      return false;
    }
    if (!colorName) return false;
    repaintAnswerNow(id, colorName);
    return true;
  }

  let RESTORE_RAF = 0;
  function restoreAllWashedAnswers(reason = 'washer:restore') {
    void reason;
    const entries = Object.entries(washMap || {});
    if (!entries.length) return 0;
    let painted = 0;
    for (const [rawId, rawColor] of entries) {
      const id = resolvePrimaryAId(rawId);
      if (!id) continue;
      const colorName = isValidWashName(rawColor) ? String(rawColor) : null;
      if (!colorName) {
        try { delete washMap[id]; } catch {}
        continue;
      }
      repaintAnswerNow(id, colorName);
      painted += 1;
    }
    return painted;
  }

  function scheduleRestoreAllWashedAnswers(reason = 'washer:restore') {
    void reason;
    if (RESTORE_RAF) return false;
    RESTORE_RAF = requestAnimationFrame(() => {
      RESTORE_RAF = 0;
      restoreAllWashedAnswers(reason);
    });
    return true;
  }

  // -------- Washer -> Core notification (Core repaints answer + button) --------
  const EV_WASH_CHANGED = 'evt:h2o:mm:wash_changed';
  const EV_ANSWER_WASH = 'evt:h2o:answer:wash';
  const EV_ANSWER_WASH_ALIAS = 'h2o:answer:wash';
  const EV_ANSWER_WASH_LEGACY_HIGHLIGHT = 'evt:h2o:answer:highlight';
  const EV_ANSWER_WASH_LEGACY_HIGHLIGHT_ALIAS = 'h2o:answer:highlight';
  const WASH_EVENT_SOURCE_ENGINE = 'wash-engine';
  const WASH_EVENT_SOURCE_BRIDGE = 'wash-engine:bridge';
  function emitWashChanged(primaryAId, colorName, opts = {}) {
    try {
      const emitAnswerWash = opts?.emitAnswerWash !== false;
      const colorNorm = isValidWashName(colorName) ? String(colorName) : null;
      const id = String(primaryAId || '').trim();
      const detail = {
        primaryAId: id,
        answerId: id,
        id,
        colorName: colorNorm,
        color: colorNorm,
        source: String(opts?.source || WASH_EVENT_SOURCE_ENGINE),
      };
      window.dispatchEvent(new CustomEvent(EV_WASH_CHANGED, { detail }));
      // legacy non-prefixed
      window.dispatchEvent(new CustomEvent(EV_WASH_CHANGED.slice(4), { detail }));
      // compatibility aliases used by split modules
      window.dispatchEvent(new CustomEvent('evt:h2o:wash:changed', { detail }));
      window.dispatchEvent(new CustomEvent('h2o:wash:changed', { detail }));
      if (emitAnswerWash) {
        window.dispatchEvent(new CustomEvent(EV_ANSWER_WASH, { detail }));
        window.dispatchEvent(new CustomEvent(EV_ANSWER_WASH_ALIAS, { detail }));
      }
    } catch {}
  }

  // -------- Middle-click palette UI (from MiniMap v12.5.21, adapted to be Core-blind) --------
  let colorMenu = document.querySelector(`[${ATTR_.CGXUI_OWNER}="${SkID}"][${ATTR_.CGXUI}="${UI_.COLOR_MENU}"]`);
  if (!colorMenu) {
    colorMenu = document.createElement('div');
    colorMenu.className = CLS_.COLOR_MENU;
    colorMenu.setAttribute(ATTR_.CGXUI_OWNER, SkID);
    colorMenu.setAttribute(ATTR_.CGXUI, UI_.COLOR_MENU);
  }

  Object.assign(colorMenu.style, {
    position: 'fixed',
    zIndex: Z,
    display: 'none',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignContent: 'center',

    gap: '4px',
    width: '115px',
    height: '65px',
    boxSizing: 'border-box',

    borderRadius: '12px',
    background: 'rgba(255,255,255,0.04)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255,255,255,0.06)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    transition: 'opacity 0.15s ease'
  });

  if (!colorMenu.isConnected) document.body.appendChild(colorMenu);
  while (colorMenu.firstChild) {
    try { colorMenu.removeChild(colorMenu.firstChild); } catch { break; }
  }

  COLORS.forEach(({ name, color }) => {
    const swatch = document.createElement('div');
    swatch.setAttribute(ATTR_.CGXUI_OWNER, SkID);
    swatch.setAttribute(ATTR_.CGXUI, UI_.SWATCH);

    Object.assign(swatch.style, {
      width: '22px',
      height: '22px',
      borderRadius: '6px',
      cursor: 'pointer',
      background: `color-mix(in srgb, ${color} 45%, #1a1a1a)`,
      boxShadow: 'inset 0 0 2px rgba(255,255,255,0.05)',
      transition: 'transform 0.15s ease, box-shadow 0.15s ease'
    });

    swatch.title = name;

    swatch.addEventListener('mouseenter', () => {
      swatch.style.transform = 'scale(1.1)';
      swatch.style.boxShadow = `0 0 6px color-mix(in srgb, ${color} 40%, transparent)`;
    });

    swatch.addEventListener('mouseleave', () => {
      swatch.style.transform = '';
      swatch.style.boxShadow = 'inset 0 0 2px rgba(255,255,255,0.05)';
    });

    swatch.addEventListener('click', () => {
      if (!colorMenu._targetId) return;

      const id = resolvePrimaryAId(colorMenu._targetId);
      if (!id) return;
      const newColorName = (washMap[id] === name) ? null : name;

      if (newColorName) washMap[id] = newColorName;
      else delete washMap[id];

      saveWashMap();
      repaintAnswerNow(id, newColorName);
      emitWashChanged(id, newColorName);
      hideColorMenu();
    });

    colorMenu.appendChild(swatch);
  });

  function showColorMenu(event, id, anchorRect = null, leftAnchorX = null) {
    colorMenu._targetId = id;
    colorMenu.style.display = 'flex';
    try { document.body.appendChild(colorMenu); } catch {}

    const menuRect = colorMenu.getBoundingClientRect();
    const w = Math.max(1, Math.round(menuRect.width || parseInt(colorMenu.style.width, 10) || 130));
    const h = Math.max(1, Math.round(menuRect.height || parseInt(colorMenu.style.height, 10) || 90));
    const gap = 8;

    const xBase = Number.isFinite(leftAnchorX)
      ? leftAnchorX
      : (anchorRect ? (anchorRect.left || 0) : (event?.clientX || 0));
    const x = Math.round(xBase - w - gap);
    const y = anchorRect
      ? Math.round((anchorRect.top || 0) + (((anchorRect.height || 0) - h) / 2))
      : Math.round((event?.clientY || 0) + 12);

    const minX = 8;
    const minY = 8;
    const maxX = window.innerWidth - w - 8;
    const maxY = window.innerHeight - h - 8;

    colorMenu.style.left = `${Math.max(minX, Math.min(x, maxX))}px`;
    colorMenu.style.top  = `${Math.max(minY, Math.min(y, maxY))}px`;
  }

  function hideColorMenu() {
    colorMenu.style.display = 'none';
    colorMenu._targetId = null;
  }

  UTIL_on(document, 'click', e => {
    if (!colorMenu.contains(e.target)) hideColorMenu();
  });
  UTIL_on(window, 'scroll', hideColorMenu, { passive: true });

  // -------- Middle-click on MiniMap button -> open washer palette --------
  function resolveMiniMapBtn(target) {
    const el = (target instanceof Element) ? target : (target?.parentElement || null);
    const btn = el?.closest?.(SEL_.MM_BTN) || null;
    if (!btn) return null;
    if (!btn.closest?.(SEL_.MM_CONTAINER)) return null;
    return btn;
  }

  function findMiniMapBtnByPrimaryAId(primaryAId) {
    const wanted = String(primaryAId || '').trim();
    if (!wanted) return null;
    const btns = document.querySelectorAll(SEL_.MM_BTN);
    for (const btn of btns) {
      if (!btn?.closest?.(SEL_.MM_CONTAINER)) continue;
      const pid = String(
        btn.dataset?.primaryAId ||
        btn.getAttribute?.(ATTR_.PRIMARY_A_ID) ||
        ''
      ).trim();
      const bid = String(
        btn.dataset?.id ||
        btn.getAttribute?.(ATTR_.ID) ||
        ''
      ).trim();
      if (pid === wanted || bid === wanted) return btn;
    }
    return null;
  }

  function computeLeftAnchorX(btn, fallbackX) {
    let leftAnchorX = Number.isFinite(btn?.getBoundingClientRect?.()?.left)
      ? btn.getBoundingClientRect().left
      : fallbackX;
    const ownerSel = `[${ATTR_.CGXUI_OWNER}="${SkID}"]`;
    const minimapEl = btn?.closest?.(`[${ATTR_.CGXUI}="mnmp-minimap"]${ownerSel}`) || null;
    const wrapEl = btn?.closest?.(`[${ATTR_.CGXUI}="mnmp-wrap"]${ownerSel}`) || null;
    const dotRowEl = wrapEl?.querySelector?.(`[${ATTR_.CGXUI}="mnmp-dotrow"]${ownerSel}`) || null;

    const minimapRect = minimapEl?.getBoundingClientRect?.();
    const dotRowRect = dotRowEl?.getBoundingClientRect?.();
    if (Number.isFinite(minimapRect?.left)) leftAnchorX = Math.min(leftAnchorX, minimapRect.left);
    if (Number.isFinite(dotRowRect?.left)) leftAnchorX = Math.min(leftAnchorX, dotRowRect.left);
    return leftAnchorX;
  }

  function openPaletteFromMiddle(event) {
    const btn = resolveMiniMapBtn(event?.target);
    if (!btn || event.button !== 1) return;

    event.preventDefault();
    event.stopPropagation();

    const primaryAId = resolvePrimaryAId(String(
      btn.dataset.primaryAId ||
      btn.getAttribute?.(ATTR_.PRIMARY_A_ID) ||
      btn.dataset.id ||
      btn.getAttribute?.(ATTR_.ID) ||
      ''
    ).trim());
    if (!primaryAId) return;

    const rect = btn.getBoundingClientRect?.();
    const clientX = Number.isFinite(event?.clientX)
      ? event.clientX
      : Math.round((rect?.left || 0) + ((rect?.width || 0) / 2));
    const clientY = Number.isFinite(event?.clientY)
      ? event.clientY
      : Math.round((rect?.top || 0) + ((rect?.height || 0) / 2));

    const leftAnchorX = computeLeftAnchorX(btn, clientX);

    showColorMenu({ clientX, clientY }, primaryAId, rect || null, leftAnchorX);
  }

  const supportsAuxClick = ('onauxclick' in document);
  const suppressMiddleDown = (event) => {
    const btn = resolveMiniMapBtn(event?.target);
    if (!btn || event.button !== 1) return;
    event.preventDefault();
    event.stopPropagation();
  };

  if (supportsAuxClick) {
    UTIL_on(document, 'mousedown', suppressMiddleDown, true);
    UTIL_on(document, 'auxclick', openPaletteFromMiddle, true);
  } else {
    UTIL_on(document, 'mousedown', openPaletteFromMiddle, true);
  }

  // -------- CSS (wash + flash overlay) --------
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
  }
  style.setAttribute(ATTR_.CGXUI_OWNER, SkID);
  style.textContent = `
    .${CLS_.WASH_WRAP} {
      position: relative;
      z-index: 0;
    }

    ${COLORS.map(({ name, color }) => `
      .${CLS_.WASH_PREFIX}${name}::before {
        content: '';
        position: absolute;
        top: var(--cgxui-mnmp-answer-wash-top, var(--cgxui-mnmp-answer-flash-top, -25px));
        bottom: var(--cgxui-mnmp-answer-wash-bottom, var(--cgxui-mnmp-answer-flash-bottom, -50px));
        left: -100vw;
        right: -100vw;
        z-index: -1;
        pointer-events: none;
        background: color-mix(in srgb, ${color} 50%, transparent);
        opacity: 0.08;
      }
    `).join('')}

    .${CLS_.WASH_WRAP}[data-at-collapsed="1"]::before {
      opacity: 0 !important;
    }

    @keyframes cgxui-mnmp-flash-fade {
      0%   { opacity: 0; }
      25%  { opacity: var(--cgxui-mnmp-flash-peak, 0.18); }
      75%  { opacity: var(--cgxui-mnmp-flash-peak, 0.18); }
      100% { opacity: 0; }
    }

    .${CLS_.WASH_WRAP}.${CLS_.FLASH}::after,
    .${CLS_.WASH_WRAP}[${ATTR_.CGXUI_FLASH}="1"]::after {
      content: '';
      position: absolute;
      left: -100vw;
      right: -100vw;
      background: color-mix(in srgb, gold 60%, transparent);
      box-shadow: 0 0 var(--cgxui-mnmp-flash-glow-blur, 22px) rgba(255, 215, 0, var(--cgxui-mnmp-flash-glow-alpha, 0.35));
      opacity: 0;
      z-index: 0;
      pointer-events: none;
      border-radius: var(--cgxui-mnmp-flash-radius, 12px);
      animation: cgxui-mnmp-flash-fade var(--cgxui-mnmp-flash-ms, 1600ms) var(--cgxui-mnmp-flash-ease, ease-in-out);
    }

    .${CLS_.WASH_WRAP}[data-cgxui-flash-surface="question"]::after {
      top: var(--cgxui-mnmp-question-flash-top, -12px);
      bottom: var(--cgxui-mnmp-question-flash-bottom, -18px);
    }

    .${CLS_.WASH_WRAP}[data-cgxui-flash-surface="answer"]::after,
    .${CLS_.WASH_WRAP}:not([data-cgxui-flash-surface])::after {
      top: var(--cgxui-mnmp-answer-flash-top, -25px);
      bottom: var(--cgxui-mnmp-answer-flash-bottom, -50px);
    }
  `;
  if (!style.isConnected) document.documentElement.appendChild(style);

  // -------- Optional bridge (kept minimal; no MiniMap internals) --------
  let BRIDGE_BOUND = false;
  let RESTORE_BOUND = false;
  function bindBridgeOnce() {
    if (BRIDGE_BOUND || TOPW.H2O_MM_WASH_BRIDGE) return;
    TOPW.H2O_MM_WASH_BRIDGE = true;
    BRIDGE_BOUND = true;
    let lastBridgeSig = '';
    let lastBridgeTs = 0;
    // Canonical wash input + legacy compatibility aliases.
    const onAnswerWashEvent = (e) => {
      const d = e?.detail || {};
      const answerId = resolvePrimaryAId(String(d.answerId || d.primaryAId || '').trim());
      const color = d.color ?? d.colorName ?? null;
      if (!answerId) return;
      const source = String(d.source || '').trim();
      if (source === WASH_EVENT_SOURCE_ENGINE || source === WASH_EVENT_SOURCE_BRIDGE) return;

      const normalizedColor = isValidWashName(color) ? String(color) : null;
      const sig = `${answerId}|${normalizedColor || ''}`;
      const now = performance.now();
      if (sig && sig === lastBridgeSig && (now - lastBridgeTs) < 45) return;
      lastBridgeSig = sig;
      lastBridgeTs = now;

      if (normalizedColor) washMap[answerId] = normalizedColor;
      else delete washMap[answerId];

      saveWashMap();
      repaintAnswerNow(answerId, normalizedColor);
      const fromLegacy = (e?.type === EV_ANSWER_WASH_LEGACY_HIGHLIGHT || e?.type === EV_ANSWER_WASH_LEGACY_HIGHLIGHT_ALIAS);
      emitWashChanged(answerId, normalizedColor, {
        emitAnswerWash: fromLegacy,
        source: WASH_EVENT_SOURCE_BRIDGE,
      });
    };
    UTIL_on(window, EV_ANSWER_WASH, onAnswerWashEvent);
    UTIL_on(window, EV_ANSWER_WASH_ALIAS, onAnswerWashEvent);
    // Legacy read-alias only: old emitters used highlight naming for wash.
    UTIL_on(window, EV_ANSWER_WASH_LEGACY_HIGHLIGHT, onAnswerWashEvent);
    UTIL_on(window, EV_ANSWER_WASH_LEGACY_HIGHLIGHT_ALIAS, onAnswerWashEvent);
  }

  function bindRestoreBridgeOnce() {
    if (RESTORE_BOUND) return;
    RESTORE_BOUND = true;

    const onAnswersScan = () => {
      scheduleRestoreAllWashedAnswers('answers:scan');
    };
    const onMmIndexHydrated = () => {
      scheduleRestoreAllWashedAnswers('index:hydrated');
    };
    const onMmIndexAppended = (e) => {
      const d = e?.detail || {};
      const appendedId = String(d?.msgId || d?.answerId || d?.primaryAId || d?.id || '').trim();
      if (!appendedId) {
        scheduleRestoreAllWashedAnswers('index:appended:fallback');
        return;
      }
      restoreWashedAnswerById(appendedId);
    };
    UTIL_on(window, 'evt:h2o:answers:scan', onAnswersScan);
    UTIL_on(window, 'h2o:answers:scan', onAnswersScan);
    UTIL_on(window, 'evt:h2o:minimap:index:hydrated', onMmIndexHydrated);
    UTIL_on(window, 'evt:h2o:minimap:index:appended', onMmIndexAppended);

    scheduleRestoreAllWashedAnswers('boot');
    setTimeout(() => { scheduleRestoreAllWashedAnswers('boot:late'); }, 260);
  }

  function dispose() {
    while (CLEANUP.length) {
      const fn = CLEANUP.pop();
      try { fn?.(); } catch {}
    }
    try { colorMenu?.remove?.(); } catch {}
    try { style?.remove?.(); } catch {}
    BRIDGE_BOUND = false;
    RESTORE_BOUND = false;
    if (RESTORE_RAF) {
      try { cancelAnimationFrame(RESTORE_RAF); } catch {}
      RESTORE_RAF = 0;
    }
    try { TOPW.H2O_MM_WASH_BRIDGE = false; } catch {}
    try { TOPW[BOOT_KEY] = false; } catch {}
    return true;
  }

  // -------- Export contract (ONLY surface) --------
  W.H2O = W.H2O || {};
  W.H2O.MM = W.H2O.MM || {};

  W.H2O.MM.washMap = washMap;

  bindBridgeOnce();
  bindRestoreBridgeOnce();

  W.H2O.MM.wash = {
    version: WASH_VER,

    // State
    getWashMap: () => washMap,
    getColorByName: () => COLOR_BY_NAME,
    isValid: (name) => isValidWashName(name),

    // Persistence
    save: () => saveWashMap(),

    // Paint
    applyToMiniBtn: (primaryAId, btnEl) => applyMiniMapWash(String(primaryAId || '').trim(), btnEl),
    applyToAnswerEl: (answerEl, colorName, on = true) => applyAnswerWash(answerEl, colorName, !!on),

    // UI
    openPalette: (pointerEvent, targetPrimaryAId, anchorBtnEl = null) => {
      const id = String(targetPrimaryAId || '').trim();
      const ev = pointerEvent || {};
      const btn =
        resolveMiniMapBtn(anchorBtnEl) ||
        resolveMiniMapBtn(ev?.target) ||
        findMiniMapBtnByPrimaryAId(id);
      if (btn) {
        const rect = btn.getBoundingClientRect?.() || null;
        const clientX = Number.isFinite(ev?.clientX)
          ? ev.clientX
          : Math.round((rect?.left || 0) + ((rect?.width || 0) / 2));
        const clientY = Number.isFinite(ev?.clientY)
          ? ev.clientY
          : Math.round((rect?.top || 0) + ((rect?.height || 0) / 2));
        const leftAnchorX = computeLeftAnchorX(btn, clientX);
        showColorMenu({ clientX, clientY }, id, rect, leftAnchorX);
        return true;
      }
      showColorMenu(ev, id);
      return true;
    },
    closePalette: () => hideColorMenu(),

    // Optional bridge
    bindBridgeOnce: () => bindBridgeOnce(),
    dispose: () => dispose(),
  };


  // 🔄 Reload wash map after Data pull/import (so other systems update immediately)
  function reloadWashMapFromDisk() {
// ⚠️ UTIL_storage.getJSON is NOT guaranteed (depends on H2O Data build / load order).
// Read string + JSON.parse is the most portable path.
const readJSON = (k) => {
  // Prefer getStr (always present in our storage wrapper)
  try {
    const s = UTIL_storage.getStr(k, null);
    if (!s) return null;
    const j = JSON.parse(s);
    return (j && typeof j === 'object' && !Array.isArray(j)) ? j : null;
  } catch {
    // Optional fallback if some host build only exposes getJSON
    try {
      const fn = UTIL_storage.getJSON;
      if (typeof fn !== 'function') return null;
      const j = fn(k, null);
      return (j && typeof j === 'object' && !Array.isArray(j)) ? j : null;
    } catch {
      return null;
    }
  }
};
    const prevSnap = (() => {
      try { return Object.assign(Object.create(null), washMap || {}); } catch { return Object.create(null); }
    })();

    let fromDisk = readJSON(STORAGE_WASH_MAP_NEW);
    if (!fromDisk) fromDisk = readJSON(STORAGE_WASH_MAP_OLD);
    const next = fromDisk || Object.create(null);

    // Keep object identity stable (MiniMap / other scripts hold references)
    try { Object.keys(washMap).forEach(k => { try { delete washMap[k]; } catch {} }); } catch {}
    try { Object.assign(washMap, next); } catch {}

    TOPW.H2O_MM_washMap = washMap;
    TOPW.H2O_MM_washMap_raw = washMap;

    // Return changed ids (for efficient MiniMap button repaint; avoids event storms)
    const changed = [];
    try {
      const seen = new Set();
      for (const k of Object.keys(prevSnap || {})) seen.add(k);
      for (const k of Object.keys(next || {})) seen.add(k);
      for (const k of seen) {
        const a = prevSnap?.[k];
        const b = next?.[k];
        if (String(a || '') !== String(b || '')) changed.push(k);
      }
    } catch {}
    return changed;
  }

  // Listen to H2O Data store changes (WebDAV pull/import) and re-apply washes instantly.
  // NOTE: depending on ChatGPT build, H2O Data may emit on the iframe window (W) or on TOPW.
  function onEvtBoth(topic, fn) {
    try { W.addEventListener(topic, fn, { passive: true }); } catch {}
    try { if (TOPW && TOPW !== W) TOPW.addEventListener(topic, fn, { passive: true }); } catch {}
  }

  const onStoreChanged = (ev) => {
    const d = ev?.detail || {};
    // H2O Data emits either { key } (older) or { keys:[...] } (newer)
    const keys = Array.isArray(d.keys) ? d.keys : (d.key ? [d.key] : []);
    if (!keys.includes(STORAGE_WASH_MAP_NEW) && !keys.includes(STORAGE_WASH_MAP_OLD)) return;

    const changed = reloadWashMapFromDisk();
    try { scheduleRestoreAllWashedAnswers('data:store:changed'); } catch {}

    // 🎨 Update MiniMap buttons
    try {
      const isFullImport =
        (String(ev?.type || '') === 'evt:h2o:data:backup:imported') ||
        (d?.kind === 'import') ||
        (d?.full === true);

      // Rare path: full restore/import → emit ALL (debounced single-flight) so MiniMap repaints without rebuild.
      if (isFullImport) {
        if (!TOPW.__H2O_WASH_EMIT_ALL_DEBOUNCE__) {
          TOPW.__H2O_WASH_EMIT_ALL_DEBOUNCE__ = 1;
          const runAll = () => {
            TOPW.__H2O_WASH_EMIT_ALL_DEBOUNCE__ = 0;
            try {
              const map = washMap || Object.create(null);
              const ids = Object.keys(map);
              let i = 0;
              const CHUNK = 40;
              const step = () => {
                const end = Math.min(i + CHUNK, ids.length);
                for (; i < end; i++) {
                  const id = resolvePrimaryAId(ids[i]);
                  if (!id) continue;
                  const raw = map?.[id];
                  const colorName = isValidWashName(raw) ? String(raw) : null;
                  emitWashChanged(id, colorName);
                }
                if (i < ids.length) requestAnimationFrame(step);
              };
              requestAnimationFrame(step);
            } catch {}
          };
          // Prefer idle time if available (prevents jank on huge maps)
          if (typeof requestIdleCallback === 'function') requestIdleCallback(runAll, { timeout: 300 });
          else setTimeout(runAll, 0);
        }
        return;
      }

      // Normal path: store-changed should carry small deltas → emit only changed ids.
      const ids = Array.isArray(changed) ? changed : [];
      if (!ids.length) return;
      let i = 0;
      const CHUNK = 25;
      const tick = () => {
        const end = Math.min(i + CHUNK, ids.length);
        for (; i < end; i++) {
          const id = resolvePrimaryAId(ids[i]);
          if (!id) continue;
          const raw = washMap?.[id];
          const colorName = isValidWashName(raw) ? String(raw) : null;
          emitWashChanged(id, colorName);
        }
        if (i < ids.length) requestAnimationFrame(tick);
      };
      setTimeout(tick, 0);
    } catch {}
  };

  onEvtBoth('evt:h2o:data:store:changed', onStoreChanged);
  onEvtBoth('evt:h2o:data:backup:imported', onStoreChanged);

})();
