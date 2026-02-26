// ==UserScript==
// @name         6b.🔵💿 Quick Export 💿
// @namespace    H2O.ChatGPT.QuickExport
// @version      3.7.1
// @description  💾 Answer toolbar Export .md button 💾
// @description  Adds a Save button into the assistant toolbar row; exports nearest user Q + this A as Markdown
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  console.log('%c[QuickExport] loaded', 'color: cyan');

  /********************************************************************
   * 0) CONFIG
   ********************************************************************/
  const CFG = {
    buttonLabel: '💾',
    buttonTitle: 'Save this Q&A as Markdown',
    filePrefix: 'Q&A',
    debounceMs: 120,
  };

  const SEL = {
    assistantMsg: '[data-message-author-role="assistant"]',
    userMsg:      '[data-message-author-role="user"]',
  };

  /********************************************************************
   * 1) YOUR BUTTON PIECE (kept same behavior)
   ********************************************************************/
  const BTN_ATTR  = 'data-ho-testbtn';
  const BTN_CLASS = 'ho-test-toolbar-btn';

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
      user-select:none;
    }
    .${BTN_CLASS} > span{
      display:flex; align-items:center; justify-content:center;
      width: 32px; height: 32px;
    }
    .${BTN_CLASS}:hover{
      background: rgba(255,255,255,.08);
    }
    .${BTN_CLASS}:active{
      transform: scale(0.98);
    }
  `;
  document.documentElement.appendChild(style);

  /********************************************************************
   * 2) SAVE HANDLER
   ********************************************************************/
  async function saveAsMD(filename, content) {
    if (window.showSaveFilePicker) {
      try {
        const handle = await showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    const blob = new Blob([content], { type: 'text/markdown' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: filename
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  function getCleanText(el) {
    if (!el) return '';
    const clone = el.cloneNode(true);

    // Remove our injected button if it got cloned (rare but safe)
    clone.querySelectorAll?.(`[${BTN_ATTR}]`).forEach(n => n.remove());

    // Remove native action buttons if present
    clone.querySelectorAll?.(
      `button[data-testid="copy-turn-action-button"],
       button[data-testid="good-response-turn-action-button"],
       button[data-testid="bad-response-turn-action-button"],
       button[aria-label="More actions"]`
    ).forEach(n => n.remove());

    return clone.innerText.trim();
  }

  function findPrevUserMessage(assistantEl) {
    let prev = assistantEl?.previousElementSibling;
    while (prev) {
      if (prev.matches?.(SEL.userMsg)) return prev;
      const nested = prev.querySelector?.(SEL.userMsg);
      if (nested) return nested;
      prev = prev.previousElementSibling;
    }
    // fallback climb
    let p = assistantEl?.parentElement;
    while (p) {
      const sib = p.previousElementSibling;
      if (sib) {
        if (sib.matches?.(SEL.userMsg)) return sib;
        const deep = sib.querySelector?.(SEL.userMsg);
        if (deep) return deep;
      }
      p = p.parentElement;
    }
    return null;
  }

  function answerIndex(assistantEl) {
    const all = Array.from(document.querySelectorAll(SEL.assistantMsg));
    const i = all.indexOf(assistantEl);
    return i >= 0 ? i : 0;
  }

  function filenameFor(idx) {
    return `${CFG.filePrefix}${idx + 1}.md`;
  }

  /********************************************************************
   * 3) FIND TOOLBARS (your original robust way)
   ********************************************************************/
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

  /********************************************************************
   * 4) MAP TOOLBAR -> ITS ASSISTANT ANSWER (the key missing part)
   ********************************************************************/
  function getAnswerForToolbar(bar) {
    // Best case: toolbar is inside assistant message wrapper
    const direct = bar.closest(SEL.assistantMsg);
    if (direct) return direct;

    // Common case: toolbar is in a sibling footer after the assistant node
    // Walk up a bit, then scan previous siblings for nearest assistant message
    let node = bar;
    for (let up = 0; up < 6 && node; up++) {
      let sib = node.previousElementSibling;
      while (sib) {
        if (sib.matches?.(SEL.assistantMsg)) return sib;
        const nested = sib.querySelector?.(SEL.assistantMsg);
        if (nested) return nested;
        sib = sib.previousElementSibling;
      }
      node = node.parentElement;
    }
    return null;
  }

  /********************************************************************
   * 5) INJECT BUTTON
   ********************************************************************/
  function inject(bar) {
    if (!bar || bar.querySelector(`[${BTN_ATTR}]`)) return;

    const answerEl = getAnswerForToolbar(bar);
    if (!answerEl) {
      // This is the exact reason your current version “shows nothing”
      // (toolbar found but no answer mapped)
      return;
    }

    const btn = document.createElement('button');
    btn.setAttribute(BTN_ATTR, '1');

    btn.className = `${BTN_CLASS} text-token-text-secondary hover:bg-token-bg-secondary rounded-lg`;
    btn.type = 'button';
    btn.setAttribute('aria-label', CFG.buttonTitle);
    btn.title = CFG.buttonTitle;

    const span = document.createElement('span');
    span.className = 'flex items-center justify-center touch:w-10 h-8 w-8';
    span.textContent = '⤓';
    btn.appendChild(span);

    let busy = false;
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (busy) return;
      busy = true;

      try {
        const qEl = findPrevUserMessage(answerEl);
        const qText = getCleanText(qEl) || '(User message not found)';
        const aText = getCleanText(answerEl);

        const md = [
          '# ChatGPT Q&A Export', '',
          '**Question**', '', qText, '',
          '**Answer**', '', aText, '',
        ].join('\n');

        const idx = answerIndex(answerEl);
        await saveAsMD(filenameFor(idx), md);
      } finally {
        setTimeout(() => (busy = false), 350);
      }
    });

    // Insert right before "More actions" (⋯)
    const more = bar.querySelector('button[aria-label="More actions"]');
    if (more) more.insertAdjacentElement('beforebegin', btn);
    else bar.appendChild(btn);
  }

  function refresh() {
    const bars = findToolbars();
    // Debug: you can check if toolbars are detected at all
    // console.log('[QuickExport] toolbars:', bars.length);
    bars.forEach(inject);
  }

  refresh();
  const mo = new MutationObserver(() => refresh());
  mo.observe(document.documentElement, { childList: true, subtree: true });

})();
