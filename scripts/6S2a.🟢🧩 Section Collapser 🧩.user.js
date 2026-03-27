// ==UserScript==
// @h2o-id             6s2a.section.collapser
// @name               6S2a.🟢🧩 Section Collapser 🧩
// @namespace          H2O.Premium.CGX.section.collapser
// @author             HumamDev
// @version            1.2.2
// @revision           001
// @build              260314-113900
// @description        Sectionize assistant answers by headings, with API hooks for show/collapse/expand/restore and first-title full-answer collapse control.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  /*************************
   * Config ⚙️
   *************************/
  const MD_ATTR    = 'data-ho-sectionized';
  const CYCLE_ATTR = 'data-ho-sec-cycle';     // 0 raw, 1 split(open), 2 collapsed, 3 expanded (next => restore)
  const SEC_CLASS  = 'ho-sec-details';
  const ANSWER_COLLAPSED_ATTR = 'data-ho-answer-collapsed';
  const ANSWER_COLLAPSED_CLASS = 'ho-answer-collapsed';

  // Keep original HTML for restore (per message)
  const originalHTML = new WeakMap();

  /*************************
   * Styles 🎨
   *************************/
  const style = document.createElement('style');
  style.textContent = `
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

    /* Only show the copied summary title while collapsed.
       When open, the native heading inside the content should be the only title. */
    details.${SEC_CLASS}[open] > summary{
      padding-top: 2px;
      padding-bottom: 2px;
      min-height: 12px;
      opacity: .7;
    }
    details.${SEC_CLASS}[open] > summary .ho-sec-title,
    details.${SEC_CLASS}[open] > summary .ho-sec-meta{
      display: none;
    }

    .${ANSWER_COLLAPSED_CLASS}{
      border-radius: 12px;
      margin: 10px 0;
      padding: 10px 12px;
      background: rgba(255,255,255,.03);
      outline: 1px solid rgba(255,255,255,.06);
    }
    .${ANSWER_COLLAPSED_CLASS} > :first-child{
      margin-top: 0 !important;
      margin-bottom: 0 !important;
      cursor: pointer;
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
   * Locate assistant markdown 🧱
   *************************/
  function findAssistantTurnFromNode(node) {
    if (!node) return null;
    return (
      node.closest?.('div[data-message-author-role="assistant"]') ||
      node.closest?.('article') ||
      node.closest?.('div[role="presentation"]') ||
      null
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

  function findMarkdownFromNode(node) {
    return findMarkdownEl(findAssistantTurnFromNode(node));
  }

  /*************************
   * Chunking logic: wrap heading sections into <details> ▦
   *************************/

  function clearCollapsedAnswerState(md) {
    if (!md) return;
    md.removeAttribute(ANSWER_COLLAPSED_ATTR);
  }

  function buildCollapsedAnswerMarkerFromHTML(html) {
    const wrap = document.createElement('div');
    wrap.innerHTML = String(html || '');

    const firstHeading = wrap.querySelector('h1,h2,h3,h4,h5,h6');
    let lead = firstHeading ? firstHeading.cloneNode(true) : null;

    if (!lead) {
      const firstBlock = Array.from(wrap.childNodes).find((node) => {
        if (node.nodeType === 1) return true;
        if (node.nodeType === 3 && String(node.textContent || '').trim()) return true;
        return false;
      });
      if (firstBlock?.nodeType === 1) lead = firstBlock.cloneNode(true);
      else if (firstBlock?.nodeType === 3) {
        const p = document.createElement('p');
        p.textContent = String(firstBlock.textContent || '').trim();
        lead = p;
      }
    }

    if (!lead) return null;

    const shell = document.createElement('div');
    shell.className = ANSWER_COLLAPSED_CLASS;
    shell.appendChild(lead);
    return shell;
  }

  function attachCollapsedAnswerToggle(shell, md) {
    if (!shell || !md) return shell;
    shell.addEventListener('click', (ev) => {
      const target = ev.target;
      if (!(target instanceof Element)) return;
      const titleEl = shell.firstElementChild;
      if (target === titleEl || titleEl?.contains(target)) {
        ev.preventDefault();
        ev.stopPropagation();
        restoreOriginal(md);
      }
    });
    return shell;
  }

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

  function ensureSectionized(md, { expand = true } = {}) {
    if (!md) return false;
    if (md.getAttribute(ANSWER_COLLAPSED_ATTR) === '1') restoreOriginal(md);
    if (!originalHTML.has(md)) originalHTML.set(md, md.innerHTML);
    applySectionize(md);
    if (md.getAttribute(MD_ATTR) !== '1') return false;
    if (expand) expandAll(md);
    md.setAttribute(CYCLE_ATTR, expand ? '1' : '2');
    return true;
  }

  function showSections(md) {
    return ensureSectionized(md, { expand: true });
  }

  function collapseSections(md) {
    const ok = ensureSectionized(md, { expand: false });
    if (!ok) return false;
    collapseAll(md);
    md.setAttribute(CYCLE_ATTR, '2');
    return true;
  }

  function collapseEntireAnswer(md) {
    if (!md) return false;
    const html = originalHTML.get(md) || md.innerHTML;
    if (!originalHTML.has(md)) originalHTML.set(md, md.innerHTML);

    const shell = buildCollapsedAnswerMarkerFromHTML(html);
    if (!shell) return false;

    attachCollapsedAnswerToggle(shell, md);

    md.innerHTML = '';
    md.appendChild(shell);
    md.setAttribute(ANSWER_COLLAPSED_ATTR, '1');
    md.removeAttribute(MD_ATTR);
    md.removeAttribute(CYCLE_ATTR);
    return true;
  }

  function expandEntireAnswer(md) {
    if (!md) return false;
    if (md.getAttribute(ANSWER_COLLAPSED_ATTR) === '1') return restoreOriginal(md);
    const ok = ensureSectionized(md, { expand: true });
    if (!ok) return false;
    expandAll(md);
    md.setAttribute(CYCLE_ATTR, '3');
    return true;
  }

  function restoreOriginal(md) {
    const html = originalHTML.get(md);
    if (!html) return false;

    md.innerHTML = html;
    md.removeAttribute(MD_ATTR);
    md.removeAttribute(CYCLE_ATTR);
    md.removeAttribute(ANSWER_COLLAPSED_ATTR);
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


  // Expose functions to be used by other scripts
  window.H2O = window.H2O || {};
  window.H2O.SectionCollapser = {
    applySectionize,
    ensureSectionized,
    showSections,
    collapseSections,
    collapseAll,
    expandAll,
    collapseEntireAnswer,
    expandEntireAnswer,
    restoreOriginal,
    onCycleClick,
    findAssistantTurnFromNode,
    findMarkdownEl,
    findMarkdownFromNode,
  };
})();
