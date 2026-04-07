// ==UserScript==
// @h2o-id             1b2a.minimap.context.menu
// @name               1B2a.🟥🖱️🗺️ Context Menu (MiniMap 🔌 Plugin) 🗺️
// @namespace          H2O.Premium.CGX.minimap.context.menu
// @author             HumamDev
// @version            0.1.0
// @revision           001
// @build              260304-102754
// @description        Standalone right-click context menu for MiniMap (blocks page menu only over MiniMap). Dummy items for testing.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const TOPW = W.top || W;

  // ---------- Identity (matches your Shell/MiniMap owner) ----------
  const SkID = 'mnmp';
  const EVT_ARCHIVE_REHYDRATE = 'evt:h2o:archive:rehydrate';
  const COLD_RIGHT_DBLCLICK_MS = 360;
  const COLD_MENU_DELAY_MS = 400;

  // ---------- Registries / Shared bridge ----------
  const SH = () => (TOPW.H2O_MM_SHARED?.get?.() || null);

  const UTIL_on = () => SH()?.util?.on || ((t, ev, fn, opts) => {
    t?.addEventListener?.(ev, fn, opts);
    return () => { try { t?.removeEventListener?.(ev, fn, opts); } catch {} };
  });

  const UTIL_cleanupMake = () => SH()?.util?.cleanupMake || (() => {
    const fns = [];
    return {
      add(fn) { if (typeof fn === 'function') fns.push(fn); return fn; },
      run() { for (const fn of fns.splice(0)) { try { fn(); } catch {} } }
    };
  });

  // ---------- No-raw-strings style: centralize tokens ----------
  const ATTR_ = Object.freeze({
    CGXUI_OWNER: 'data-cgxui-owner',
    CGXUI: 'data-cgxui',
  });

  const UI_ = Object.freeze({
    ROOT: `${SkID}-root`,
    MINIMAP: `${SkID}-minimap`,
  });

  // Shell uses: [data-cgxui="mnmp-minimap"][data-cgxui-owner="mnmp"] etc. :contentReference[oaicite:2]{index=2}
  const SEL_ = Object.freeze({
    ROOT:   `[${ATTR_.CGXUI}="${UI_.ROOT}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`,
    PANEL:  `[${ATTR_.CGXUI}="${UI_.MINIMAP}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`,
    BTN:    '[data-cgxui="mnmp-btn"], [data-cgxui="mm-btn"], .cgxui-mm-btn',
  });

  const CSS_ = Object.freeze({
    STYLE_ID: `cgxui-${SkID}-ctxmenu-style`,
  });

  const CLS_ = Object.freeze({
    MENU: `cgxui-${SkID}-ctxmenu`,
    ITEM: `cgxui-${SkID}-ctxmenu-item`,
    SEP:  `cgxui-${SkID}-ctxmenu-sep`,
    HOT:  `cgxui-${SkID}-ctxmenu-hot`,
  });

  const STATE = {
    running: false,
    menuEl: null,
    styleEl: null,
    lastAnchor: null,
    pendingColdMenuTimer: 0,
    lastColdRightTs: 0,
    lastColdRightKey: '',
    cleanup: null,
  };

  function q(sel, root = document) {
    try { return root.querySelector(sel); } catch { return null; }
  }

  function insideMiniMap(target) {
    if (!target) return false;
    try {
      // Panel is the safest boundary: only block native menu when the pointer is inside it.
      const panel = q(SEL_.PANEL);
      if (panel && (target === panel || panel.contains(target))) return true;
    } catch {}
    try {
      const root = q(SEL_.ROOT);
      if (root && (target === root || root.contains(target))) return true;
    } catch {}
    return false;
  }

  function ensureStyle() {
    const id = CSS_.STYLE_ID;
    let el = document.getElementById(id);
    if (el) return el;

    el = document.createElement('style');
    el.id = id;
    el.textContent = `
      .${CLS_.MENU}{
        position: fixed;
        z-index: 2147483647;
        min-width: 210px;
        padding: 6px;
        border-radius: 10px;
        background: rgba(18,18,20,0.92);
        border: 1px solid rgba(255,255,255,0.10);
        box-shadow: 0 10px 30px rgba(0,0,0,0.45);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        font-family: var(--ui-font-modern, system-ui, -apple-system, Segoe UI, Roboto, Arial);
        font-size: 13px;
        color: rgba(255,255,255,0.92);
        user-select: none;
      }
      .${CLS_.ITEM}{
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 8px 10px;
        border-radius: 8px;
        cursor: pointer;
        opacity: 0.96;
      }
      .${CLS_.ITEM}:hover{
        background: rgba(255,255,255,0.07);
      }
      .${CLS_.HOT}{
        color: rgba(255,255,255,0.65);
        font-size: 12px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      }
      .${CLS_.SEP}{
        height: 1px;
        margin: 6px 6px;
        background: rgba(255,255,255,0.10);
      }
    `;
    document.documentElement.appendChild(el);
    return el;
  }

  function clearPendingColdMenu() {
    if (!STATE.pendingColdMenuTimer) return;
    try { clearTimeout(STATE.pendingColdMenuTimer); } catch {}
    STATE.pendingColdMenuTimer = 0;
  }

  function getMiniMapBtn(target) {
    if (!target?.closest) return null;
    try {
      const btn = target.closest(SEL_.BTN);
      if (!btn) return null;
      const owner = String(btn.getAttribute?.(ATTR_.CGXUI_OWNER) || '').trim();
      if (owner === SkID) return btn;
      if (btn.classList?.contains?.('cgxui-mm-btn')) return btn;
    } catch {}
    return null;
  }

  function isColdMiniMapBtn(btn) {
    if (!btn) return false;
    try {
      if (btn.classList?.contains?.('h2o-mm-cold')) return true;
    } catch {}
    try {
      return String(btn.getAttribute?.('data-h2o-archive-cold') || '') === '1';
    } catch {}
    return false;
  }

  function coldTurnKey(btn) {
    const turnId = String(btn?.dataset?.id || btn?.dataset?.turnId || btn?.dataset?.primaryAId || '').trim();
    if (turnId) return turnId;
    const turnIdx = Math.max(1, Number(btn?.dataset?.turnIdx || 0) || 0);
    return turnIdx ? `turn:${turnIdx}` : '';
  }

  function dispatchColdRehydrate(btn) {
    if (!btn) return false;
    const answerIndex = Math.max(1, Number(btn?.dataset?.turnIdx || 0) || 0);
    try {
      window.dispatchEvent(new CustomEvent(EVT_ARCHIVE_REHYDRATE, {
        detail: {
          answerIndex,
          turnIndex: answerIndex,
          turnId: String(btn?.dataset?.turnId || btn?.dataset?.id || '').trim(),
          answerId: String(btn?.dataset?.primaryAId || '').trim(),
          kind: 'answer',
          source: 'minimap:contextmenu:dblright',
        },
      }));
      return true;
    } catch {}
    return false;
  }

  function queueColdMenu(anchor) {
    clearPendingColdMenu();
    STATE.pendingColdMenuTimer = setTimeout(() => {
      STATE.pendingColdMenuTimer = 0;
      showMenuAt(anchor.x, anchor.y, anchor);
    }, COLD_MENU_DELAY_MS);
  }

  function hideMenu() {
    clearPendingColdMenu();
    if (STATE.menuEl) {
      try { STATE.menuEl.remove(); } catch {}
    }
    STATE.menuEl = null;
    STATE.lastAnchor = null;
  }

  function clampToViewport(x, y, menuEl) {
    const pad = 8;
    const r = menuEl.getBoundingClientRect();
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;
    let nx = x;
    let ny = y;

    if (nx + r.width + pad > vw) nx = Math.max(pad, vw - r.width - pad);
    if (ny + r.height + pad > vh) ny = Math.max(pad, vh - r.height - pad);

    return { x: nx, y: ny };
  }

  function buildMenuItems(anchor) {
    // Dummy items for now (test only)
    return [
      { kind: 'item', label: 'Dummy Action A', hot: 'A', onPick: () => console.log('[MM CtxMenu] A', anchor) },
      { kind: 'item', label: 'Dummy Action B', hot: 'B', onPick: () => console.log('[MM CtxMenu] B', anchor) },
      { kind: 'sep' },
      { kind: 'item', label: 'Close', hot: 'Esc', onPick: () => hideMenu() },
    ];
  }

  function showMenuAt(x, y, anchor) {
    hideMenu();
    ensureStyle();

    const menu = document.createElement('div');
    menu.className = CLS_.MENU;
    menu.setAttribute(ATTR_.CGXUI_OWNER, SkID);
    menu.setAttribute(ATTR_.CGXUI, `${SkID}-ctxmenu`);

    const items = buildMenuItems(anchor);
    for (const it of items) {
      if (it.kind === 'sep') {
        const sep = document.createElement('div');
        sep.className = CLS_.SEP;
        menu.appendChild(sep);
        continue;
      }
      const row = document.createElement('div');
      row.className = CLS_.ITEM;

      const left = document.createElement('div');
      left.textContent = String(it.label || '');

      const right = document.createElement('div');
      right.className = CLS_.HOT;
      right.textContent = String(it.hot || '');

      row.appendChild(left);
      row.appendChild(right);

      row.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { it.onPick?.(); } catch {}
        hideMenu();
      }, true);

      menu.appendChild(row);
    }

    document.body.appendChild(menu);

    // Position after DOM insert (so we can clamp with real size)
    menu.style.left = `${Math.round(x)}px`;
    menu.style.top = `${Math.round(y)}px`;
    const clamped = clampToViewport(x, y, menu);
    menu.style.left = `${Math.round(clamped.x)}px`;
    menu.style.top = `${Math.round(clamped.y)}px`;

    STATE.menuEl = menu;
    STATE.lastAnchor = anchor || null;
  }

  function onContextMenu(ev) {
    // Only intercept over MiniMap — otherwise let the page do normal.
    const t = ev?.target;
    if (!insideMiniMap(t)) return;

    // Block native page menu ONLY here ✅
    ev.preventDefault();
    ev.stopPropagation();

    const anchor = {
      x: Number(ev.clientX || 0),
      y: Number(ev.clientY || 0),
      targetTag: String(t?.tagName || '').toLowerCase(),
    };

    const btn = getMiniMapBtn(t);
    if (isColdMiniMapBtn(btn)) {
      const now = performance.now();
      const key = coldTurnKey(btn);
      const isDouble = !!key && key === STATE.lastColdRightKey && (now - STATE.lastColdRightTs) < COLD_RIGHT_DBLCLICK_MS;
      STATE.lastColdRightKey = key;
      STATE.lastColdRightTs = now;

      if (isDouble) {
        hideMenu();
        dispatchColdRehydrate(btn);
        return;
      }

      hideMenu();
      queueColdMenu(anchor);
      return;
    }

    showMenuAt(anchor.x, anchor.y, anchor);
  }

  function boot() {
    if (STATE.running) return;
    STATE.running = true;

    const cleanup = UTIL_cleanupMake()();
    STATE.cleanup = cleanup;

    const on = UTIL_on();

    // Capture phase so we reliably beat the page context menu.
    cleanup.add(on(window, 'contextmenu', onContextMenu, true));

    // Dismiss paths
    cleanup.add(on(window, 'mousedown', (e) => {
      if (!STATE.menuEl && !STATE.pendingColdMenuTimer) return;
      const inside = !!(STATE.menuEl && e?.target && STATE.menuEl.contains(e.target));
      if (!inside) hideMenu();
    }, true));

    cleanup.add(on(window, 'scroll', () => hideMenu(), true));
    cleanup.add(on(window, 'resize', () => hideMenu(), true));
    cleanup.add(on(window, 'keydown', (e) => {
      if (e?.key === 'Escape') hideMenu();
    }, true));

    // Soft publish (no coupling): lets other scripts ping status if they want.
    try { TOPW.H2O_MM_CTXMENU_PLUGIN = true; } catch {}
    try { TOPW.H2O_MM_CTXMENU_VER = '0.1.0'; } catch {}

    // Also expose in H2O.MM namespace (Kernel ensures it exists). :contentReference[oaicite:3]{index=3}
    try {
      TOPW.H2O = TOPW.H2O || {};
      TOPW.H2O.MM = TOPW.H2O.MM || {};
      TOPW.H2O.MM.ctxmenu = {
        ver: '0.1.0',
        hide: hideMenu,
        showAt: showMenuAt,
        dispose,
      };
    } catch {}
  }

  function dispose() {
    if (!STATE.running) return;
    STATE.running = false;

    hideMenu();

    try { STATE.cleanup?.run?.(); } catch {}
    STATE.cleanup = null;

    try { document.getElementById(CSS_.STYLE_ID)?.remove?.(); } catch {}
    STATE.styleEl = null;

    try { if (TOPW.H2O_MM_CTXMENU_PLUGIN) TOPW.H2O_MM_CTXMENU_PLUGIN = false; } catch {}
  }

  // Boot immediately (document-idle)
  boot();

})();
