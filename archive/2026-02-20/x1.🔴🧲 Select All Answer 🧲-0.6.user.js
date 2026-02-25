// ==UserScript==
// @name         x1.🔴🧲 Select All Answer 🧲
// @namespace    H2O.ChatGPT.toolbarInject
// @version      0.6
// @description  Adds a toolbar button under each assistant answer that selects the full answer text in a mouse-like way so the native “Ask ChatGPT” bubble can appear.
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const BTN_ATTR  = 'data-ho-selectall';
  const BTN_CLASS = 'ho-selectall-toolbar-btn';

  // ── Style (ChatGPT-like) ──
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
    }
    .${BTN_CLASS}:hover{ background: rgba(255,255,255,.08); }
    .${BTN_CLASS}:active{ transform: translateY(0.5px); }
  `;
  document.documentElement.appendChild(style);

  // ── Find the exact assistant toolbar ──
  function findToolbars() {
    const copyBtns = document.querySelectorAll('button[data-testid="copy-turn-action-button"]');
    const bars = [];

    copyBtns.forEach(copyBtn => {
      const bar = copyBtn.closest('div');
      if (!bar) return;

      const hasGood = bar.querySelector('button[data-testid="good-response-turn-action-button"]');
      const hasBad  = bar.querySelector('button[data-testid="bad-response-turn-action-button"]');
      const hasMore = bar.querySelector('button[aria-label="More actions"]');

      if (hasGood && hasBad && hasMore) bars.push(bar);
    });

    return Array.from(new Set(bars));
  }

  function findAnswerTextElFromToolbar(bar) {
    const turn =
      bar.closest('[data-testid^="conversation-turn"]') ||
      bar.closest('article') ||
      bar.closest('div[data-message-author-role]') ||
      bar.closest('div');

    if (!turn) return null;

    return (
      turn.querySelector('.markdown') ||
      turn.querySelector('[class*="markdown"]') ||
      turn.querySelector('.prose') ||
      turn.querySelector('[class*="prose"]') ||
      turn.querySelector('[data-message-author-role="assistant"]') ||
      turn
    );
  }

  // ── Core select-all ──
  function selectAllText(el) {
    if (!el) return;

    // Make element focusable (some selection UIs key off focus/active element)
    try {
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
    } catch {}

    const sel = window.getSelection();
    if (!sel) return;

    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);

    // Set a stable direction (helps some anchor logic)
    try { sel.setBaseAndExtent(range.startContainer, range.startOffset, range.endContainer, range.endOffset); } catch {}
  }

  // ── “Mouse-like” arming: do selection during the next trusted pointerup ──
  let armedTextEl = null;
  let armed = false;

  // Capture pointerup globally: still a trusted user event
  document.addEventListener('pointerup', (e) => {
    if (!armed || !armedTextEl) return;
    armed = false;

    // Do the selection NOW (inside the trusted pointerup call stack)
    selectAllText(armedTextEl);

    // Don’t stop propagation — let ChatGPT's own pointerup handlers run and see the selection
    // (no preventDefault / stopPropagation here)
    armedTextEl = null;
  }, true);

  function inject(bar) {
    if (!bar || bar.querySelector(`[${BTN_ATTR}]`)) return;

    const btn = document.createElement('button');
    btn.setAttribute(BTN_ATTR, '1');
    btn.className = `${BTN_CLASS} text-token-text-secondary hover:bg-token-bg-secondary rounded-lg`;
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Select full answer');

    const span = document.createElement('span');
    span.className = 'flex items-center justify-center touch:w-10 h-8 w-8';
    span.textContent = '⧉';
    btn.appendChild(span);

    // Arm on pointerdown (don’t block events)
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const textEl = findAnswerTextElFromToolbar(bar);
      if (!textEl) return;

      armedTextEl = textEl;
      armed = true;
      // NO preventDefault / stopPropagation
    }, true);

    const more = bar.querySelector('button[aria-label="More actions"]');
    if (more) more.insertAdjacentElement('beforebegin', btn);
    else bar.appendChild(btn);
  }

  function refresh() {
    findToolbars().forEach(inject);
  }

  refresh();
  const mo = new MutationObserver(refresh);
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
