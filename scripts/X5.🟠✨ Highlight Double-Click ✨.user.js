// ==UserScript==
// @h2o-id      zh3.highlight.double-click
// @name         h3.🟠✨ Highlight Double-Click ✨
// @namespace    hobayda.highlight.persistent
// @version      2.0
// @rev        000002
// @build      2026-02-28T17:33:34Z
// @description  Double-click text to highlight with modern dark-mode friendly colors. Highlights are saved across reloads.
// @match        https://chatgpt.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const highlightClasses = [
    'highlight-yellow',
    'highlight-green',
    'highlight-blue',
    'highlight-pink'
  ];

  const highlightStyles = `
    .highlight-yellow { background-color: #fff59d; color: #000; }
    .highlight-green  { background-color: #a5d6a7; color: #000; }
    .highlight-blue   { background-color: #90caf9; color: #000; }
    .highlight-pink   { background-color: #f48fb1; color: #000; }
  `;

  // Inject styles
  const style = document.createElement('style');
  style.textContent = highlightStyles;
  document.head.appendChild(style);

  // Get next highlight class
  function getNextClass(current) {
    const index = highlightClasses.indexOf(current);
    if (index === -1) return highlightClasses[0];
    if (index < highlightClasses.length - 1) return highlightClasses[index + 1];
    return null; // remove
  }

  // Save highlights to localStorage
  function saveHighlights() {
    const spans = document.querySelectorAll('span[data-highlight-id]');
    const data = [];
    spans.forEach(span => {
      data.push({
        id: span.dataset.highlightId,
        text: span.textContent,
        class: highlightClasses.find(cls => span.classList.contains(cls)) || null,
        path: getDomPath(span)
      });
    });
    localStorage.setItem('chatgptHighlights', JSON.stringify(data));
  }

  // Load highlights from localStorage
  function loadHighlights() {
    const data = JSON.parse(localStorage.getItem('chatgptHighlights') || '[]');
    data.forEach(item => {
      const target = queryDomPath(item.path);
      if (target && target.textContent.includes(item.text)) {
        const index = target.textContent.indexOf(item.text);
        const before = document.createTextNode(target.textContent.slice(0, index));
        const match = document.createElement('span');
        match.textContent = item.text;
        match.dataset.highlightId = item.id;
        if (item.class) match.classList.add(item.class);
        const after = document.createTextNode(target.textContent.slice(index + item.text.length));
        const parent = target.parentNode;
        parent.replaceChild(after, target);
        parent.insertBefore(match, after);
        parent.insertBefore(before, match);
      }
    });
  }

  // Create DOM path string for element identification
  function getDomPath(el) {
    const stack = [];
    while (el && el.nodeType === 1) {
      let sibCount = 0;
      let sibIndex = 0;
      for (let i = 0; i < el.parentNode?.childNodes.length; i++) {
        const sib = el.parentNode.childNodes[i];
        if (sib.nodeName === el.nodeName) {
          if (sib === el) sibIndex = sibCount;
          sibCount++;
        }
      }
      const nodeName = el.nodeName.toLowerCase();
      const nth = sibCount > 1 ? `:nth-of-type(${sibIndex + 1})` : '';
      stack.unshift(`${nodeName}${nth}`);
      el = el.parentNode;
    }
    return stack.join(' > ');
  }

  function queryDomPath(path) {
    try {
      return document.querySelector(path);
    } catch (e) {
      return null;
    }
  }

  // Handle double-click
  function handleDoubleClick(e) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const selectedText = range.toString().trim();
    if (!selectedText) return;

    const span = document.createElement('span');
    span.textContent = selectedText;
    span.dataset.highlightId = Date.now().toString(36) + Math.random().toString(36).substr(2);

    const nextClass = highlightClasses[0];
    if (nextClass) span.classList.add(nextClass);

    range.deleteContents();
    range.insertNode(span);
    selection.removeAllRanges();

    saveHighlights();
  }

  // Handle cycling through highlight classes
  document.addEventListener('click', (e) => {
    if (e.target.tagName === 'SPAN' && e.target.dataset.highlightId) {
      const currentClass = highlightClasses.find(cls => e.target.classList.contains(cls));
      const nextClass = getNextClass(currentClass);
      highlightClasses.forEach(cls => e.target.classList.remove(cls));
      if (nextClass) e.target.classList.add(nextClass);
      else e.target.removeAttribute('data-highlight-id'); // remove if no class
      saveHighlights();
    }
  });

  // Setup
  window.addEventListener('load', () => {
    setTimeout(loadHighlights, 300); // wait a moment for DOM to load
  });

  document.addEventListener('dblclick', handleDoubleClick);
})();
