// ==UserScript==
// @name         H2O Right Sidebar POC (Tab + Drawer)
// @namespace    H2O.Prime.CGX.RightDrawer
// @version      0.1.0
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
    tab:   `[${ATTR_OWNER}="${SkID}"][${ATTR_UI}="tab"]`,
    pane:  `[${ATTR_OWNER}="${SkID}"][${ATTR_UI}="pane"]`,
    close: `[${ATTR_OWNER}="${SkID}"][${ATTR_UI}="close"]`,
  };

  const CSS_ID = 'cgxui-rightdrawer-style';

  // -----------------------------
  // CSS
  // -----------------------------
  function mountCSSOnce() {
    if (document.getElementById(CSS_ID)) return;
    const s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = `
      :root {
        --cgx-rd-z: 2147483646;
        --cgx-rd-pane-w: 360px;
        --cgx-rd-tab-w: 44px;
        --cgx-rd-tab-h: 120px;
        --cgx-rd-radius: 14px;
        --cgx-rd-gap: 12px;
        --cgx-rd-blur: 10px;
      }

      ${SEL.root} {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: var(--cgx-rd-z);
      }

      ${SEL.tab} {
        pointer-events: auto;
        position: fixed;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        width: var(--cgx-rd-tab-w);
        height: var(--cgx-rd-tab-h);

        display: flex;
        align-items: center;
        justify-content: center;

        border-top-left-radius: var(--cgx-rd-radius);
        border-bottom-left-radius: var(--cgx-rd-radius);

        background: rgba(255,255,255,0.08);
        backdrop-filter: blur(var(--cgx-rd-blur));
        -webkit-backdrop-filter: blur(var(--cgx-rd-blur));

        box-shadow: 0 10px 28px rgba(0,0,0,0.35);
        cursor: pointer;
        user-select: none;
      }

      ${SEL.tab}:hover {
        background: rgba(255,255,255,0.12);
      }

      /* little grip dots like a “handle” */
      ${SEL.tab} .cgxui-grip {
        display: grid;
        grid-template-columns: repeat(2, 6px);
        gap: 6px;
        opacity: 0.8;
      }
      ${SEL.tab} .cgxui-grip i {
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: rgba(255,255,255,0.55);
        display: block;
      }

      ${SEL.pane} {
        pointer-events: auto;
        position: fixed;
        top: var(--cgx-rd-gap);
        right: var(--cgx-rd-gap);
        height: calc(100vh - (var(--cgx-rd-gap) * 2));
        width: var(--cgx-rd-pane-w);

        border-radius: 16px;
        background: rgba(20,20,20,0.75);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);

        box-shadow: 0 14px 38px rgba(0,0,0,0.55);
        border: 1px solid rgba(255,255,255,0.10);

        transform: translateX(calc(var(--cgx-rd-pane-w) + 24px));
        transition: transform 180ms ease, opacity 180ms ease;
        opacity: 0;

        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      ${SEL.root}[data-open="1"] ${SEL.pane} {
        transform: translateX(0);
        opacity: 1;
      }

      ${SEL.root}[data-open="1"] ${SEL.tab} {
        /* slightly tuck tab behind when open (optional) */
        opacity: 0.92;
      }

      .cgxui-rd-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        border-bottom: 1px solid rgba(255,255,255,0.10);
      }

      .cgxui-rd-title {
        font: 600 13px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
        color: rgba(255,255,255,0.9);
        letter-spacing: 0.2px;
      }

      ${SEL.close} {
        border: 0;
        background: rgba(255,255,255,0.10);
        color: rgba(255,255,255,0.9);
        border-radius: 10px;
        padding: 6px 10px;
        cursor: pointer;
      }
      ${SEL.close}:hover { background: rgba(255,255,255,0.16); }

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

    const tab = document.createElement('div');
    tab.setAttribute(ATTR_OWNER, SkID);
    tab.setAttribute(ATTR_UI, 'tab');
    tab.title = 'Open Sidebar';

    tab.innerHTML = `
      <span class="cgxui-grip" aria-hidden="true">
        <i></i><i></i>
        <i></i><i></i>
        <i></i><i></i>
      </span>
    `;

    const pane = document.createElement('aside');
    pane.setAttribute(ATTR_OWNER, SkID);
    pane.setAttribute(ATTR_UI, 'pane');

    pane.innerHTML = `
      <div class="cgxui-rd-head">
        <div class="cgxui-rd-title">Right Sidebar (POC)</div>
        <button ${ATTR_OWNER}="${SkID}" ${ATTR_UI}="close" type="button">Close</button>
      </div>
      <div class="cgxui-rd-body">
        <div class="cgxui-rd-card">
          ✅ Sidebar is mounted.<br/>
          🧩 Next: you can design your own UI here (tabs, settings, minimap tools, whatever).
        </div>
      </div>
    `;

    root.appendChild(tab);
    root.appendChild(pane);
    document.documentElement.appendChild(root);

    // wiring
    const btnClose = root.querySelector(SEL.close);

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

    return root;
  }

  function setOpen(root, isOpen) {
    root.dataset.open = isOpen ? '1' : '0';
  }

  // -----------------------------
  // Boot (simple POC)
  // -----------------------------
  ensureUI();
})();