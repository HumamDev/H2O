// ==UserScript==
// @name         1d.🔴🎨 Toolbar Palette Button 🎨
// @namespace    H2O.ChatGPT.toolbarPaletteExact
// @version      0.7.6
// @description  ONE ▦ button only in the answer toolbar, placed right before ⋯. Opens MiniMap palette if available; otherwise opens a 1:1 clone. Same storage key + same glow classes. Also removes any non-toolbar duplicate ▦ buttons.
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const INIT_KEY = '__H2O_TOOLBAR_PALETTE_EXACT_v076';
  if (window[INIT_KEY]) return;
  window[INIT_KEY] = true;

  /******************************************************************
   * 0) MUST match MiniMap storage + color order
   ******************************************************************/
  const STORAGE_HIGHLIGHT_MAP = 'ho_multicolor_glow_highlights_v7';

  // ✅ keep this order EXACTLY like your MiniMap blocks
  const COLORS = [
    { name: 'blue',   color: '#4664c8' },
    { name: 'red',    color: '#b33a3a' },
    { name: 'green',  color: '#3c965a' },
    { name: 'gold',   color: '#d4af37' },
    { name: 'sky',    color: '#3aa7d4' },
    { name: 'purple', color: '#a05ade' },
    { name: 'pink',   color: '#d45ab2' },
    { name: 'orange', color: '#e68c3c' }
  ];

  /******************************************************************
   * 1) Button identity (used to de-dupe safely)
   ******************************************************************/
  const BTN_ATTR = 'data-h2o-palettebtn';
  const BTN_KIND = 'toolbar'; // mark OUR button
  const BTN_CLASS = 'h2o-toolbar-palette-btn';

  /******************************************************************
   * 2) CSS (button + clone palette only; NO frame)
   ******************************************************************/
  const style = document.createElement('style');
  style.textContent = `
    .${BTN_CLASS}{
      color: inherit;
      display:inline-flex; align-items:center; justify-content:center;
      border-radius: 8px;
      background: transparent;
      border: 0;
      padding: 0;
      cursor: pointer;
      pointer-events: auto !important;
    }
    .${BTN_CLASS} > span{
      display:flex; align-items:center; justify-content:center;
      width: 32px; height: 32px;
      font-size: 16px;
      line-height: 1;
    }
    .${BTN_CLASS}:hover{ background: rgba(255,255,255,.08); }

    /* 1:1 MiniMap-style clone palette (ONLY when MiniMap palette is absent/broken) */
    .h2o-mm-clone-pal{
      position: fixed;
      z-index: 999999;
      display: none;
      flex-wrap: wrap;
      justify-content: center;
      align-content: center;
      gap: 4px;
      width: 115px;
      height: 65px;
      box-sizing: border-box;
      border-radius: 12px;
      background: rgba(255,255,255,0.04);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255,255,255,0.06);
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      transition: opacity 0.15s ease;
      opacity: 0;
      pointer-events: auto;
      user-select: none;
      -webkit-user-select: none;
    }
    .h2o-mm-clone-pal .h2o-sq{
      width: 22px;
      height: 22px;
      border-radius: 6px;
      cursor: pointer;
      background: rgba(255,255,255,0.12);
      box-shadow: inset 0 0 2px rgba(255,255,255,0.05);
      transition: transform 0.15s ease, box-shadow 0.15s ease;
      border: 0;
      padding: 0;
    }
    .h2o-mm-clone-pal .h2o-sq:hover{
      transform: scale(1.1);
      box-shadow: 0 0 6px rgba(255,255,255,0.08);
    }

    /* Clone-mode highlight effect: soft wash only (no border/frame) */
    .ho-glow-wrap{ position: relative; z-index: 0; }
    ${COLORS.map(({name, color}) => `
      .ho-glow-wrap.ho-glow-${name}::before{
        content:'';
        position:absolute;
        top:-10px;
        bottom:-60px;
        left:-100vw;
        right:-100vw;
        z-index:-1;
        pointer-events:none;
        background: color-mix(in srgb, ${color} 50%, transparent);
        opacity: 0.08;
      }
    `).join('\n')}
  `;
  document.documentElement.appendChild(style);

  /******************************************************************
   * 3) Find the correct toolbar (stable copy-anchor)
   ******************************************************************/
  const SEL_COPY = [
    'button[data-testid="copy-turn-action-button"]',
    'button[data-testid*="copy-turn-action"]',
    'button[data-testid*="copy"]',
    'button[aria-label*="Copy"]',
    'button[title*="Copy"]'
  ].join(',');

  const SEL_MORE = [
    'button[aria-label="More actions"]',
    'button[aria-label*="More"]',
    'button[aria-haspopup="menu"]',
    'button[data-testid*="more"]'
  ].join(',');

  function getAssistantMsgFromAnyNode(node) {
    const turn =
      node.closest?.('[data-testid="conversation-turn"]') ||
      node.closest?.('article') ||
      null;

    return (
      turn?.querySelector?.('[data-message-author-role="assistant"]') ||
      node.closest?.('[data-message-author-role="assistant"]') ||
      null
    );
  }

  function findToolbarFromCopy(copyBtn) {
    let n = copyBtn;
    for (let i = 0; i < 16 && n; i++) {
      n = n.parentElement;
      if (!n) break;
      if (!n.contains(copyBtn)) continue;

      const btns = n.querySelectorAll?.('button') || [];
      const cs = window.getComputedStyle(n);
      const looksFlex = cs && (cs.display.includes('flex') || cs.display.includes('inline-flex'));

      if ((btns.length >= 4 && btns.length <= 28 && looksFlex) || btns.length >= 6) return n;
    }
    return copyBtn.parentElement || null;
  }

  function getMessageId(msgEl) {
    if (!msgEl) return null;
    return (
      msgEl.getAttribute('data-message-id') ||
      msgEl.dataset.messageId ||
      msgEl.querySelector?.('[data-message-id]')?.getAttribute('data-message-id') ||
      (msgEl.dataset.hoId ||= `ho-${Math.random().toString(36).slice(2)}`)
    );
  }

  /******************************************************************
   * 4) Shared storage (exact sync with MiniMap)
   ******************************************************************/
  function loadMap() {
    try { return JSON.parse(localStorage.getItem(STORAGE_HIGHLIGHT_MAP) || '{}') || {}; }
    catch { return {}; }
  }
  function saveMap(map) {
    try { localStorage.setItem(STORAGE_HIGHLIGHT_MAP, JSON.stringify(map || {})); } catch {}
  }

  /******************************************************************
   * 5) Clone palette (only if MiniMap palette is absent OR broken)
   ******************************************************************/
  let clonePal = null;
  let cloneTarget = null; // { id, msgEl }

  function ensureClonePal() {
    if (clonePal) return clonePal;

    clonePal = document.createElement('div');
    clonePal.className = 'h2o-mm-clone-pal';

    COLORS.forEach(({ name, color }) => {
      const b = document.createElement('button');
      b.className = 'h2o-sq';
      b.title = name;
      b.style.background = `color-mix(in srgb, ${color} 45%, #1a1a1a)`;

      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!cloneTarget) return;

        const map = loadMap();
        const cur = map[cloneTarget.id] || null;
        const next = (cur === name) ? null : name;

        if (next) map[cloneTarget.id] = next;
        else delete map[cloneTarget.id];
        saveMap(map);

        // Apply same class names as MiniMap uses
        cloneTarget.msgEl.classList.add('ho-glow-wrap');
        COLORS.forEach(c => cloneTarget.msgEl.classList.remove(`ho-glow-${c.name}`));
        if (next) cloneTarget.msgEl.classList.add(`ho-glow-${next}`);

        window.dispatchEvent(new CustomEvent('ho-answer:highlight', {
          detail: { answerId: cloneTarget.id, colorName: next }
        }));

        hideClonePal();
      });

      clonePal.appendChild(b);
    });

    document.documentElement.appendChild(clonePal);

    document.addEventListener('pointerdown', (e) => {
      if (!clonePal || clonePal.style.display !== 'flex') return;
      if (e.target.closest?.(`[${BTN_ATTR}]`)) return;
      if (clonePal.contains(e.target)) return;
      hideClonePal();
    }, true);

    window.addEventListener('scroll', hideClonePal, { passive: true });
    window.addEventListener('resize', hideClonePal, { passive: true });

    return clonePal;
  }

  function showClonePalUnder(clientX, clientY, id, msgEl) {
    const el = ensureClonePal();
    cloneTarget = { id, msgEl };

    el.style.display = 'flex';
    el.style.opacity = '1';

    const r = el.getBoundingClientRect();
    const menuW = r.width || 115;
    const menuH = r.height || 65;

    const x = Math.min(Math.max(clientX - menuW / 2, 10), window.innerWidth - menuW - 10);
    const y = Math.min(Math.max(clientY + 10, 10), window.innerHeight - menuH - 10);

    el.style.left = x + 'px';
    el.style.top  = y + 'px';
  }

  function hideClonePal() {
    if (!clonePal) return;
    clonePal.style.opacity = '0';
    setTimeout(() => {
      if (!clonePal) return;
      clonePal.style.display = 'none';
      cloneTarget = null;
    }, 120);
  }

  function isMiniPaletteVisible() {
    const el = document.querySelector('.ho-color-menu');
    if (!el) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && Number(cs.opacity || '1') > 0.05;
  }

  function openMiniThenFallback(id, msgEl, x, y) {
    // Attempt MiniMap palette first (exact)
    try {
      if (typeof window.H2O_showColorMenuAt === 'function') {
        window.H2O_showColorMenuAt(id, x, y);
      } else {
        window.dispatchEvent(new CustomEvent('ho:mm:openColorMenu', {
          detail: { answerId: id, free: true, clientX: x, clientY: y }
        }));
      }
    } catch {}

    // If MiniMap palette exists but is broken/not opening -> fallback to clone
    setTimeout(() => {
      if (!isMiniPaletteVisible()) showClonePalUnder(x, y, id, msgEl);
    }, 60);
  }

  function openPaletteFor(id, msgEl, x, y) {
    const miniPalExists = !!document.querySelector('.ho-color-menu');
    if (miniPalExists) {
      openMiniThenFallback(id, msgEl, x, y);
      return;
    }
    showClonePalUnder(x, y, id, msgEl);
  }

  /******************************************************************
   * 6) HARD de-dupe: remove any ▦ buttons NOT in toolbars
   ******************************************************************/
  function purgeNonToolbarPaletteButtons() {
    const all = Array.from(document.querySelectorAll(`button[${BTN_ATTR}]`));
    for (const b of all) {
      // keep our toolbar one
      if (b.dataset.h2oPalettebtn === BTN_KIND) continue;

      // If it's not sitting inside a real action toolbar (with Copy), kill it.
      const bar = b.closest?.('div');
      const hasCopyNearby = !!(bar && bar.querySelector?.(SEL_COPY));
      if (!hasCopyNearby) {
        b.remove();
      }
    }
  }

  /******************************************************************
   * 7) Inject ONLY ONE ▦ button per toolbar, placed BEFORE ⋯ (or last)
   ******************************************************************/
  function injectFromCopy(copyBtn) {
    if (!copyBtn) return 0;

    const bar = findToolbarFromCopy(copyBtn);
    if (!bar) return 0;

    const msgEl = getAssistantMsgFromAnyNode(copyBtn);
    if (!msgEl) return 0;

    const id = getMessageId(msgEl);
    if (!id) return 0;

    // If exists already: ensure it's OURS and in correct position
    let btn = bar.querySelector?.(`button[${BTN_ATTR}]`);
    if (btn && btn.dataset.h2oPalettebtn !== BTN_KIND) {
      // чужой/old one inside toolbar -> remove it
      btn.remove();
      btn = null;
    }

    if (!btn) {
      btn = document.createElement('button');
      btn.setAttribute(BTN_ATTR, '1');
      btn.dataset.h2oPalettebtn = BTN_KIND;
      btn.className = `${BTN_CLASS} text-token-text-secondary hover:bg-token-bg-secondary rounded-lg`;
      btn.type = 'button';
      btn.setAttribute('aria-label', 'H2O Palette');

      const span = document.createElement('span');
      span.className = 'flex items-center justify-center touch:w-10 h-8 w-8';
      span.textContent = '▦';
      btn.appendChild(span);

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const r = btn.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.bottom;

        openPaletteFor(id, msgEl, x, y);
      });
    }

    // ✅ place BEFORE ⋯ if present, else before last button
    const moreBtn = bar.querySelector?.(SEL_MORE);
    if (moreBtn) {
      moreBtn.insertAdjacentElement('beforebegin', btn);
    } else {
      const buttons = Array.from(bar.querySelectorAll('button'));
      const lastBtn = buttons[buttons.length - 1];
      if (lastBtn && lastBtn !== btn) lastBtn.insertAdjacentElement('beforebegin', btn);
      else if (!bar.contains(btn)) bar.appendChild(btn);
    }

    return 1;
  }

  function refreshAll() {
    purgeNonToolbarPaletteButtons();
    const copies = Array.from(document.querySelectorAll(SEL_COPY));
    for (const c of copies) injectFromCopy(c);
  }

  // Restore highlights ONLY in clone-mode (MiniMap handles its own)
  function restoreHighlightsCloneMode() {
    if (document.querySelector('.ho-color-menu')) return;
    const map = loadMap();
    const answers = Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
    for (const a of answers) {
      const id = getMessageId(a);
      const color = map[id] || null;
      if (!color) continue;
      a.classList.add('ho-glow-wrap');
      COLORS.forEach(c => a.classList.remove(`ho-glow-${c.name}`));
      a.classList.add(`ho-glow-${color}`);
    }
  }

  // Init
  refreshAll();
  restoreHighlightsCloneMode();

  // DOM changes
  const mo = new MutationObserver(() => {
    requestAnimationFrame(() => {
      refreshAll();
      restoreHighlightsCloneMode();
    });
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // Late toolbars on hover
  document.addEventListener('pointerenter', (e) => {
    const near =
      e.target?.closest?.('[data-testid="conversation-turn"]') ||
      e.target?.closest?.('[data-message-author-role="assistant"]');
    if (!near) return;

    setTimeout(refreshAll, 50);
    setTimeout(refreshAll, 250);
  }, true);

  console.log('[H2O] Toolbar palette button v0.7.6 active ✅');
})();
