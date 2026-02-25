// ==UserScript==
// @name         h1.🔴🧩 Section Collapser 🧩 (4-Step Cycle Restore)
// @namespace    H2O.ChatGPT.sectionCollapser
// @version      1.1.0
// @description  Adds a toolbar button under each assistant answer: Split→Collapse→Expand→Restore original.
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  /*************************
   * Config ⚙️
   *************************/
  const BTN_ATTR   = 'data-ho-seccollapse-btn';
  const BTN_CLASS  = 'ho-sec-toolbar-btn';
  const MD_ATTR    = 'data-ho-sectionized';
  const CYCLE_ATTR = 'data-ho-sec-cycle';     // 0 raw, 1 split(open), 2 collapsed, 3 expanded (next => restore)
  const SEC_CLASS  = 'ho-sec-details';
  const ICON       = '▤';                    // toolbar-like icon (no emoji)

  // Keep original HTML for restore (per message)
  const originalHTML = new WeakMap();

  /*************************
   * Styles 🎨
   *************************/
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
      opacity: .9;
    }
    .${BTN_CLASS}:hover{
      background: rgba(255,255,255,.08);
    }

    /* Section UI */
    details.${SEC_CLASS}{
      border-radius: 12px;
      margin: 10px 0;
      padding: 6px 10px;
      background: rgba(255,255,255,.03);
      outline: 1px solid rgba(255,255,255,.06);
    }
    details.${SEC_CLASS}[open]{
      background: rgba(255,255,255,.035);
      outline-color: rgba(255,255,255,.08);
    }
    details.${SEC_CLASS} > summary{
      cursor: pointer;
      user-select: none;
      display:flex;
      align-items:center;
      gap: 8px;
      padding: 6px 2px;
      border-radius: 10px;
      color: inherit;
      opacity: .92;
    }
    details.${SEC_CLASS} > summary:hover{
      background: rgba(255,255,255,.06);
      opacity: 1;
    }
    details.${SEC_CLASS} > summary::marker{
      font-size: .95em;
    }
    .ho-sec-title{
      font-weight: 600;
      letter-spacing: .1px;
    }
    .ho-sec-meta{
      margin-left:auto;
      opacity:.55;
      font-size: 12px;
      font-weight: 500;
    }
  `;
  document.documentElement.appendChild(style);

  /*************************
   * Find the toolbar row under answers 🧭
   *************************/
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

  /*************************
   * Locate assistant "turn" + markdown content 🧱
   *************************/
  function findAssistantTurnFromToolbar(bar) {
    return (
      bar.closest('div[data-message-author-role="assistant"]') ||
      bar.closest('article') ||
      bar.closest('div[role="presentation"]') ||
      bar.parentElement
    );
  }

  function findMarkdownEl(turn) {
    if (!turn) return null;
    return (
      turn.querySelector('.markdown') ||
      turn.querySelector('[data-message-content]') ||
      turn.querySelector('div[class*="markdown"]') ||
      turn.querySelector('div.prose') ||
      null
    );
  }

  /*************************
   * Chunking logic: wrap heading sections into <details> ▦
   *************************/
  function getTopLevelHeadings(md) {
    const all = Array.from(md.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    return all.filter(h => {
      if (!md.contains(h)) return false;
      if (h.closest(`details.${SEC_CLASS}`)) return false;
      if (h.closest('pre, code')) return false;
      return true;
    });
  }

  function headingLevel(h) {
    const tag = (h.tagName || '').toLowerCase();
    const n = parseInt(tag.replace('h',''), 10);
    return Number.isFinite(n) ? n : 6;
  }

  function textOfHeading(h) {
    return (h.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function applySectionize(md) {
    if (!md || md.getAttribute(MD_ATTR) === '1') return;

    const headings = getTopLevelHeadings(md);
    if (!headings.length) {
      md.setAttribute(MD_ATTR, 'noheadings');
      return;
    }

    const used = new Set();

    headings.forEach((h) => {
      if (!h.isConnected) return;
      if (used.has(h)) return;

      const lvl = headingLevel(h);

      // refresh list because DOM changes as we wrap
      const allNow = getTopLevelHeadings(md);
      const idx = allNow.indexOf(h);

      let nextBoundary = null;
      for (let i = idx + 1; i < allNow.length; i++) {
        const cand = allNow[i];
        if (!cand.isConnected) continue;
        if (headingLevel(cand) <= lvl) { nextBoundary = cand; break; }
      }

      const details = document.createElement('details');
      details.className = SEC_CLASS;

      const summary = document.createElement('summary');

      const title = document.createElement('span');
      title.className = 'ho-sec-title';
      title.textContent = textOfHeading(h) || '(Section)';

      const meta = document.createElement('span');
      meta.className = 'ho-sec-meta';
      meta.textContent = `H${lvl}`;

      summary.appendChild(title);
      summary.appendChild(meta);
      details.appendChild(summary);

      h.parentNode.insertBefore(details, h);

      let node = h;
      while (node && node !== nextBoundary) {
        const next = node.nextSibling;
        details.appendChild(node);
        node = next;
      }

      used.add(h);
    });

    md.setAttribute(MD_ATTR, '1');
  }

  function collapseAll(md) {
    md.querySelectorAll(`details.${SEC_CLASS}`).forEach(d => (d.open = false));
  }

  function expandAll(md) {
    md.querySelectorAll(`details.${SEC_CLASS}`).forEach(d => (d.open = true));
  }

  function restoreOriginal(md) {
    const html = originalHTML.get(md);
    if (!html) return false;

    md.innerHTML = html;
    md.removeAttribute(MD_ATTR);
    md.removeAttribute(CYCLE_ATTR);
    return true;
  }

  /*************************
   * 4-step cycle handler 🔁
   *************************/
  function onCycleClick(md) {
    if (!md) return;

    const cycle = parseInt(md.getAttribute(CYCLE_ATTR) || '0', 10) || 0;

    // 0 → 1: split (open)
    if (cycle === 0) {
      if (!originalHTML.has(md)) originalHTML.set(md, md.innerHTML);

      applySectionize(md);

      // If no headings, don't change state (avoid "locking" UI)
      if (md.getAttribute(MD_ATTR) !== '1') return;

      expandAll(md);
      md.setAttribute(CYCLE_ATTR, '1');
      return;
    }

    // 1 → 2: collapse
    if (cycle === 1) {
      collapseAll(md);
      md.setAttribute(CYCLE_ATTR, '2');
      return;
    }

    // 2 → 3: expand
    if (cycle === 2) {
      expandAll(md);
      md.setAttribute(CYCLE_ATTR, '3');
      return;
    }

    // 3 → 0: restore original (remove blocks)
    if (cycle === 3) {
      const ok = restoreOriginal(md);
      if (!ok) {
        // fallback: if snapshot missing, just reset state
        md.removeAttribute(CYCLE_ATTR);
        md.removeAttribute(MD_ATTR);
      }
      return;
    }
  }

  /*************************
   * Inject button into toolbar 🧷
   *************************/
  function inject(bar) {
    if (!bar || bar.querySelector(`[${BTN_ATTR}]`)) return;

    const btn = document.createElement('button');
    btn.setAttribute(BTN_ATTR, '1');

    // Match ChatGPT vibe
    btn.className = `${BTN_CLASS} text-token-text-secondary hover:bg-token-bg-secondary rounded-lg`;
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Sections: Split → Collapse → Expand → Restore');

    const span = document.createElement('span');
    span.className = 'flex items-center justify-center touch:w-10 h-8 w-8';
    span.textContent = ICON;
    btn.appendChild(span);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const turn = findAssistantTurnFromToolbar(bar);
      const md = findMarkdownEl(turn);
      onCycleClick(md);
    });

    // Put it right before the "More actions" button (⋯)
    const more = bar.querySelector('button[aria-label="More actions"]');
    if (more) more.insertAdjacentElement('beforebegin', btn);
    else bar.appendChild(btn);
  }

  function refresh() {
    findToolbars().forEach(inject);
  }

  refresh();
  const mo = new MutationObserver(() => refresh());
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
