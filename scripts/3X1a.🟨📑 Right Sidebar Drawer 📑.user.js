// ==UserScript==
// @h2o-id      h2o.right.sidebar.poc.tab.drawer
// @name         3X.🟨📑 Right Sidebar Drawer 📑
// @namespace    H2O.Prime.CGX.RightDrawer
// @version      0.3.5
// @rev        000001
// @build      2026-02-28T17:33:34Z
// @description  Proof of concept: right-side edge tab that toggles a slide-out sidebar (design later).
// @match       https://chatgpt.com/*
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  // -----------------------------
  // Identity / tokens (keep simple for POC)
  // -----------------------------
  const SkID = 'cgxui-rightdrawer';
  const ATTR_OWNER = 'data-cgxui-owner';
  const ATTR_UI = 'data-cgxui';

  const SEL = {
    root:  `[${ATTR_OWNER}="${SkID}"][${ATTR_UI}="root"]`,
    edge:  `[${ATTR_OWNER}="${SkID}"][${ATTR_UI}="edge"]`,
    edgeHot: `[${ATTR_OWNER}="${SkID}"][${ATTR_UI}="edge-hot"]`,
    tab:   `[${ATTR_OWNER}="${SkID}"][${ATTR_UI}="tab"]`,
    pane:  `[${ATTR_OWNER}="${SkID}"][${ATTR_UI}="pane"]`,
    close: `[${ATTR_OWNER}="${SkID}"][${ATTR_UI}="close"]`,
    modeDock: `[${ATTR_OWNER}="${SkID}"][${ATTR_UI}="mode-dock"]`,
    modeOverlay: `[${ATTR_OWNER}="${SkID}"][${ATTR_UI}="mode-overlay"]`,
  };

  const CSS_ID = 'cgxui-rightdrawer-style';
  const PAGE_PUSH_ATTR = 'data-cgxui-rd-push';

  // -----------------------------
  // CSS
  // -----------------------------
  function mountCSSOnce() {
    if (document.getElementById(CSS_ID)) return;
    const s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = `
      :root {
        --cgx-rd-z: 2147483647;
        --cgx-rd-pane-w: 360px;
        --cgx-rd-pane-right: 12px;
        --cgx-rd-tab-w: 24px;
        --cgx-rd-tab-h: 116px;
        --cgx-rd-tab-peek: calc(var(--cgx-rd-tab-w) / 2);
        --cgx-rd-edge-w: 12px;
        --cgx-rd-edge-hot-w: 14px;
        --cgx-rd-edge-hot-h: calc(var(--cgx-rd-tab-h) + 22px);
        --cgx-rd-radius: 12px;
        --cgx-rd-gap: 12px;
        --cgx-rd-blur: 12px;
        --cgx-rd-page-shift: var(--cgx-rd-pane-w);
      }

      ${SEL.root} {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: var(--cgx-rd-z);
        isolation: isolate;
      }

      html[${PAGE_PUSH_ATTR}="1"] body {
        transform: translateX(calc(-1 * var(--cgx-rd-page-shift)));
      }

      body {
        transition: transform 420ms cubic-bezier(0.16, 1, 0.3, 1);
      }

      ${SEL.edge} {
        pointer-events: auto;
        position: fixed;
        right: 0;
        top: 0;
        width: var(--cgx-rd-edge-w);
        height: 100vh;
      }

      ${SEL.edgeHot} {
        pointer-events: auto;
        position: fixed;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        width: var(--cgx-rd-edge-hot-w);
        height: var(--cgx-rd-edge-hot-h);
      }

      ${SEL.tab} {
        position: fixed;
        pointer-events: none;
        right: calc(var(--cgx-rd-tab-w) * -1);
        top: 50%;
        transform: translateY(-50%) scale(0.96);
        transform-origin: right center;
        width: var(--cgx-rd-tab-w);
        height: var(--cgx-rd-tab-h);

        display: flex;
        align-items: center;
        justify-content: center;

        border: 1px solid rgba(255,255,255,0.18);
        border-top-left-radius: var(--cgx-rd-radius);
        border-bottom-left-radius: var(--cgx-rd-radius);
        border-top-right-radius: 0;
        border-bottom-right-radius: 0;

        background:
          radial-gradient(circle at 30% 24%, rgba(42, 240, 198, 0.20), transparent 62%),
          linear-gradient(180deg, rgba(39, 32, 37, 0.94), rgba(27, 22, 27, 0.95));
        backdrop-filter: blur(var(--cgx-rd-blur)) saturate(1.15);
        -webkit-backdrop-filter: blur(var(--cgx-rd-blur)) saturate(1.15);

        box-shadow:
          0 14px 30px rgba(0,0,0,0.42),
          inset 0 1px 0 rgba(255,255,255,0.12);
        cursor: pointer;
        user-select: none;
        opacity: 0;
        filter: saturate(0.9);
        transition:
          right 560ms cubic-bezier(0.16, 1, 0.3, 1),
          transform 560ms cubic-bezier(0.16, 1, 0.3, 1),
          opacity 460ms ease,
          filter 360ms ease,
          box-shadow 420ms ease,
          background 420ms ease;
      }

      ${SEL.root}[data-edge="1"][data-open="0"] ${SEL.tab} {
        pointer-events: auto;
        right: calc(var(--cgx-rd-tab-peek) * -1);
        transform: translateY(-50%) scale(1);
        opacity: 1;
      }

      ${SEL.root}[data-edge="2"][data-open="0"] ${SEL.tab} {
        pointer-events: auto;
        right: 0;
        transform: translateY(-50%) scale(1);
        opacity: 1;
      }

      ${SEL.root}[data-open="1"] ${SEL.tab} {
        pointer-events: none;
        right: calc(var(--cgx-rd-tab-w) * -1);
        transform: translateY(-50%) scale(0.96);
        opacity: 0;
      }

      ${SEL.root}[data-mode="dock"] {
        --cgx-rd-pane-right: 0px;
      }

      ${SEL.tab}:hover {
        filter: saturate(1.15);
        box-shadow:
          0 18px 36px rgba(0,0,0,0.5),
          inset 0 1px 0 rgba(255,255,255,0.2),
          0 0 0 1px rgba(35, 214, 180, 0.35);
      }

      ${SEL.tab} .cgxui-tab-glyph {
        font: 700 16px/1 "SF Pro Display", "Segoe UI", sans-serif;
        color: rgba(34, 235, 194, 0.95);
        transform: translateX(0);
        text-shadow:
          0 0 12px rgba(35, 214, 180, 0.34),
          0 1px 0 rgba(255,255,255,0.18);
      }

      ${SEL.root}[data-open="1"] ${SEL.tab} .cgxui-tab-glyph {
        color: rgba(52, 245, 207, 0.98);
      }

      ${SEL.pane} {
        pointer-events: auto;
        position: fixed;
        top: var(--cgx-rd-gap);
        right: var(--cgx-rd-pane-right);
        height: calc(100vh - (var(--cgx-rd-gap) * 2));
        width: var(--cgx-rd-pane-w);

        border-radius: 16px;
        background: rgba(20,20,20,0.75);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);

        box-shadow: 0 14px 38px rgba(0,0,0,0.55);
        border: 1px solid rgba(255,255,255,0.10);

        transform: translateX(calc(var(--cgx-rd-pane-w) + 48px));
        transition: transform 420ms cubic-bezier(0.16, 1, 0.3, 1), opacity 360ms ease;
        opacity: 0;

        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      ${SEL.root}[data-open="1"] ${SEL.pane} {
        transform: translateX(0);
        opacity: 1;
      }

      ${SEL.root}[data-mode="dock"] ${SEL.pane} {
        top: 0;
        right: 0;
        height: 100vh;
        border-radius: 0;
        border-right: 0;
      }

      @media (prefers-reduced-motion: reduce) {
        ${SEL.tab},
        ${SEL.pane},
        body {
          transition: none;
        }
      }

      .cgxui-rd-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px;
        border-bottom: 1px solid rgba(255,255,255,0.10);
      }

      .cgxui-rd-actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .cgxui-rd-title {
        font: 600 13px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
        color: rgba(255,255,255,0.9);
        letter-spacing: 0.2px;
      }

      ${SEL.modeDock},
      ${SEL.modeOverlay},
      ${SEL.close} {
        border: 1px solid rgba(255,255,255,0.14);
        background: rgba(255,255,255,0.08);
        color: rgba(255,255,255,0.88);
        border-radius: 8px;
        width: 26px;
        height: 26px;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font: 700 12px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial;
        cursor: pointer;
        transition: background 180ms ease, border-color 180ms ease, color 180ms ease, transform 140ms ease;
      }

      ${SEL.modeDock}:hover,
      ${SEL.modeOverlay}:hover,
      ${SEL.close}:hover {
        background: rgba(255,255,255,0.14);
      }

      ${SEL.root}[data-mode="dock"] ${SEL.modeDock},
      ${SEL.root}[data-mode="overlay"] ${SEL.modeOverlay} {
        background: rgba(35, 214, 180, 0.18);
        border-color: rgba(35, 214, 180, 0.45);
        color: rgba(208, 255, 244, 0.98);
      }

      .cgxui-rd-body {
        padding: 12px;
        color: rgba(255,255,255,0.85);
        font: 12px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial;
        overflow: auto;
      }

      .cgxui-rd-card {
        padding: 10px;
        border-radius: 12px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.08);
      }
    `;
    document.documentElement.appendChild(s);
  }

  // -----------------------------
  // DOM mount
  // -----------------------------
  function ensureUI() {
    let root = document.querySelector(SEL.root);
    if (root && root.isConnected) return root;

    mountCSSOnce();

    root = document.createElement('div');
    root.setAttribute(ATTR_OWNER, SkID);
    root.setAttribute(ATTR_UI, 'root');
    root.dataset.open = '0';
    root.dataset.edge = '0';
    root.dataset.mode = 'overlay';

    const edge = document.createElement('div');
    edge.setAttribute(ATTR_OWNER, SkID);
    edge.setAttribute(ATTR_UI, 'edge');
    edge.setAttribute('aria-hidden', 'true');

    const edgeHot = document.createElement('div');
    edgeHot.setAttribute(ATTR_OWNER, SkID);
    edgeHot.setAttribute(ATTR_UI, 'edge-hot');
    edgeHot.setAttribute('aria-hidden', 'true');

    const tab = document.createElement('div');
    tab.setAttribute(ATTR_OWNER, SkID);
    tab.setAttribute(ATTR_UI, 'tab');
    tab.title = 'Open Sidebar';

    tab.innerHTML = `
      <span class="cgxui-tab-glyph" aria-hidden="true">
        D
      </span>
    `;

    const pane = document.createElement('aside');
    pane.setAttribute(ATTR_OWNER, SkID);
    pane.setAttribute(ATTR_UI, 'pane');

    pane.innerHTML = `
      <div class="cgxui-rd-head">
        <div class="cgxui-rd-title">Right Sidebar (POC)</div>
        <div class="cgxui-rd-actions">
          <button ${ATTR_OWNER}="${SkID}" ${ATTR_UI}="mode-dock" type="button" title="Push mode" aria-label="Push mode">P</button>
          <button ${ATTR_OWNER}="${SkID}" ${ATTR_UI}="mode-overlay" type="button" title="Overlay mode" aria-label="Overlay mode">O</button>
          <button ${ATTR_OWNER}="${SkID}" ${ATTR_UI}="close" type="button" title="Close" aria-label="Close">C</button>
        </div>
      </div>
      <div class="cgxui-rd-body">
        <div class="cgxui-rd-card">
          ✅ Sidebar is mounted.<br/>
          🧩 Next: you can design your own UI here (tabs, settings, minimap tools, whatever).
        </div>
      </div>
    `;

    root.appendChild(edge);
    root.appendChild(edgeHot);
    root.appendChild(tab);
    root.appendChild(pane);
    document.documentElement.appendChild(root);

    // wiring
    const btnClose = root.querySelector(SEL.close);
    const btnModeDock = root.querySelector(SEL.modeDock);
    const btnModeOverlay = root.querySelector(SEL.modeOverlay);
    let edgeHideTimer = 0;

    const clearHideTimer = () => {
      if (edgeHideTimer) {
        window.clearTimeout(edgeHideTimer);
        edgeHideTimer = 0;
      }
    };

    const applyEdgeStateFromHover = () => {
      if (root.dataset.open === '1') {
        root.dataset.edge = '2';
        return;
      }
      if (edgeHot.matches(':hover') || tab.matches(':hover') || pane.matches(':hover')) {
        root.dataset.edge = '2';
        return;
      }
      if (edge.matches(':hover')) {
        root.dataset.edge = '1';
        return;
      }
      root.dataset.edge = '0';
    };

    const showPeek = () => {
      if (root.dataset.open === '1') return;
      clearHideTimer();
      if (root.dataset.edge !== '2') root.dataset.edge = '1';
    };

    const showFull = () => {
      clearHideTimer();
      root.dataset.edge = '2';
    };

    const hideTabSoon = () => {
      if (root.dataset.open === '1') return;
      clearHideTimer();
      edgeHideTimer = window.setTimeout(() => {
        if (root.dataset.open === '1') return;
        applyEdgeStateFromHover();
      }, 220);
    };

    edge.addEventListener('pointerenter', showPeek);
    edge.addEventListener('pointerleave', hideTabSoon);
    edgeHot.addEventListener('pointerenter', showFull);
    edgeHot.addEventListener('pointerleave', hideTabSoon);
    tab.addEventListener('pointerenter', showFull);
    tab.addEventListener('pointerleave', hideTabSoon);
    pane.addEventListener('pointerenter', showFull);
    pane.addEventListener('pointerleave', hideTabSoon);

    tab.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setOpen(root, root.dataset.open !== '1');
    });

    btnClose.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setOpen(root, false);
    });

    btnModeDock.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setMode(root, 'dock');
    });

    btnModeOverlay.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setMode(root, 'overlay');
    });

    // click outside closes (optional)
    document.addEventListener('click', (e) => {
      if (root.dataset.open !== '1') return;
      const paneEl = root.querySelector(SEL.pane);
      const tabEl = root.querySelector(SEL.tab);
      if (!paneEl.contains(e.target) && !tabEl.contains(e.target)) setOpen(root, false);
    }, true);

    // Esc closes
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && root.dataset.open === '1') setOpen(root, false);
    }, true);

    applyPagePush(root);
    return root;
  }

  function setOpen(root, isOpen) {
    if (isOpen && root.parentNode === document.documentElement) {
      document.documentElement.appendChild(root);
    }
    root.dataset.open = isOpen ? '1' : '0';
    if (isOpen) root.dataset.edge = '0';
    const tab = root.querySelector(SEL.tab);
    if (tab) tab.title = isOpen ? 'Close Sidebar' : 'Open Sidebar';
    applyPagePush(root);
    if (!isOpen) {
      window.setTimeout(() => {
        const edge = root.querySelector(SEL.edge);
        const edgeHot = root.querySelector(SEL.edgeHot);
        const pane = root.querySelector(SEL.pane);
        const tabEl = root.querySelector(SEL.tab);
        if (!edge || !edgeHot || !pane || !tabEl) return;
        if (edgeHot.matches(':hover') || pane.matches(':hover') || tabEl.matches(':hover')) {
          root.dataset.edge = '2';
          return;
        }
        if (edge.matches(':hover')) {
          root.dataset.edge = '1';
          return;
        }
        root.dataset.edge = '0';
      }, 220);
    }
  }

  function setMode(root, mode) {
    root.dataset.mode = mode === 'dock' ? 'dock' : 'overlay';
    applyPagePush(root);
  }

  function applyPagePush(root) {
    const isPush = root.dataset.open === '1' && root.dataset.mode === 'dock';
    if (isPush) {
      document.documentElement.setAttribute(PAGE_PUSH_ATTR, '1');
      return;
    }
    document.documentElement.removeAttribute(PAGE_PUSH_ATTR);
  }

  // -----------------------------
  // Boot (simple POC)
  // -----------------------------
  ensureUI();
})();
