// ==UserScript==
// @name         9b.🟤🔖 Tab Title 🔖
// @namespace    H2O.ChatGPT.TabTitle
// @version      1.4.3
// @description  Chat pages: tab = chat title only (no folder, no ChatGPT). Project list pages (/g/.../project): tab = project name only.
// @match        https://chatgpt.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  let lastSetTitle = '';

  const FULL_CHAT_KEY = (id) => `H2O:fullTitle:chat:${id}`;
  const FULL_PROJ_KEY = (id) => `H2O:fullTitle:proj:${id}`;

  // ───────────────── URL detection ─────────────────

  function isChatPage() {
    return /\/c\/[a-z0-9-]+/i.test(location.pathname);
  }

  function isProjectListPage() {
    // example: /g/g-p-*********-******/project
    return /^\/g\/g-p-[^/]+\/project\/?$/i.test(location.pathname);
  }

  function getChatIdFromUrl() {
    const m = location.pathname.match(/\/c\/([a-z0-9-]+)/i);
    return m ? m[1] : null;
  }

  function getProjectIdFromUrl() {
    const m = location.pathname.match(/^\/g\/(g-p-[^/]+)\/project\/?$/i);
    return m ? m[1] : null;
  }

  // ───────────────── text helpers ─────────────────

function cleanText(s) {
  return (s || '').replace(/[\s\u00A0]+/g, ' ').trim();
}


  // ✅ NEW: strip a trailing "– ChatGPT" / "— ChatGPT" / "- ChatGPT" only at the END
  function stripTrailingChatGPT(raw) {
    return cleanText(raw).replace(/\s*[–—-]\s*ChatGPT\s*$/i, '').trim();
  }

  // split on any dash type with optional spaces
  function splitTitle(raw) {
    return (raw || '')
      .split(/\s*[–—-]\s*/g)
      .map(cleanText)
      .filter(Boolean);
  }

  // Chat rule:
  // - strip trailing "– ChatGPT"
  // - split on dash
  // - remove any "ChatGPT" segment
  // - keep LAST remaining segment
  // - if only "ChatGPT" or empty → return ''
  function extractChatOnly(rawTitle) {
    const parts = splitTitle(stripTrailingChatGPT(rawTitle));
    if (!parts.length) return '';

    const filtered = parts.filter(p => p.toLowerCase() !== 'chatgpt');
    if (!filtered.length) return '';

    const last = cleanText(filtered[filtered.length - 1] || '');
    if (!last || last.toLowerCase() === 'chatgpt') return '';

    return last;
  }

  // Project rule:
  // - strip trailing "– ChatGPT"
  // - remove "ChatGPT"
  // - if multiple remain, choose longest meaningful segment
  function extractProjectOnly(rawTitle) {
    const parts = splitTitle(stripTrailingChatGPT(rawTitle));
    if (!parts.length) return '';

    const filtered = parts.filter(p => p.toLowerCase() !== 'chatgpt');
    if (!filtered.length) return '';

    if (filtered.length === 1) return cleanText(filtered[0]);

    return filtered
      .map(cleanText)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)[0] || '';
  }

  // ───────────────── DOM readers ─────────────────

  function getProjectNameFromDom() {
    const sels = [
      'main h1',
      'header h1',
      'h1',
      '[role="heading"][aria-level="1"]'
    ];

    for (const sel of sels) {
      const el = document.querySelector(sel);
      const t = cleanText(el && el.textContent);
      if (t && t.toLowerCase() !== 'chatgpt') return t;
    }
    return '';
  }

function getEmojiPrefixFromRow(row) {
  if (!row) return '';

  // Helper: take first emoji-like token at the start of a string
  const firstEmojiFrom = (s) => {
    s = cleanText(s || '');
    const m = s.match(/^(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)/u);
    return m ? m[1] : '';
  };

  // 1) Emoji present as plain text somewhere in the row's textContent
  // (we still return it, because TreeWalker "best" may not include it)
  const txtEmoji = firstEmojiFrom(row.textContent || '');
  if (txtEmoji) return txtEmoji;

  // 2) Emoji rendered as <img alt="😀">
  const img = row.querySelector('img[alt]');
  const altEmoji = firstEmojiFrom(img && img.getAttribute('alt'));
  if (altEmoji) return altEmoji;

  // 3) Emoji rendered via aria-label
  const ariaEl = row.querySelector('[aria-label]');
  const ariaEmoji = firstEmojiFrom(ariaEl && ariaEl.getAttribute('aria-label'));
  if (ariaEmoji) return ariaEmoji;

  return '';
}


function getChatTitleFromSidebar() {
  const chatId = getChatIdFromUrl();
  if (!chatId) return '';

  const selector =
    `aside a[href*="/c/${chatId}"],` +
    `nav a[href*="/c/${chatId}"]`;

  const row = document.querySelector(selector);
  if (!row) return '';

  // ✅ BEST: if another script stored exact raw title, use it (keeps emoji)
  const raw1 = row.getAttribute('data-ho-raw-title');
  const raw2 = row.dataset && (row.dataset.hoRawTitle || row.dataset.hoRawTitleFull);
  const raw = cleanText(raw1 || raw2 || '');
  if (raw) return extractChatOnly(raw) || raw;

  const IGNORE_SEL = [
    '.ho-colorbtn',
    '.ho-palette',
    '.ho-swatch',
    '.ho-meta-row',
    '.ho-meta-action',
    '.ho-meta-actions-right',
    '#ho-preview-tip',
    '[data-h2o-owner]',
    '[data-ho-owner]'
  ].join(',');

  const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const t = cleanText(node.nodeValue);
      if (!t) return NodeFilter.FILTER_REJECT;
      const p = node.parentElement;
      if (p && p.closest && p.closest(IGNORE_SEL)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const texts = [];
  while (walker.nextNode()) texts.push(cleanText(walker.currentNode.nodeValue));

  const best = texts
    .filter(t => t.length >= 2)
    .sort((a, b) => b.length - a.length)[0] || '';

  // ✅ If the UI emoji isn’t in text nodes, recover it and prepend it
  const emoji = getEmojiPrefixFromRow(row);
  let candidate = best;

  if (emoji && candidate && !candidate.startsWith(emoji)) {
    candidate = `${emoji} ${candidate}`; // keep emoji at start
  }

  // Only normalize via extractChatOnly if we actually have a dash separator.
// If no dash, keep the candidate exactly (to preserve emoji).
const hasDash = /[–—-]/.test(candidate);
return (hasDash ? (extractChatOnly(candidate) || '') : cleanText(candidate)) || '';

}


  // ───────────────── FULL title capture ─────────────────

  function maybeSaveFullTitle(storageKey) {
    const raw = document.title || '';
    const dashCount = (raw.match(/[–—-]/g) || []).length;
    const looksNative = /\bChatGPT\b/i.test(raw) && dashCount >= 1;

    if (looksNative && raw !== lastSetTitle) {
      sessionStorage.setItem(storageKey, raw);
      window.H2O_fullOriginalTitle = raw;
    }
  }

  // ───────────────── apply logic ─────────────────

  function setTabTitle(desired) {
    desired = cleanText(desired);

    if (!desired) return;
    if (desired.toLowerCase() === 'chatgpt') return;

    if (desired === lastSetTitle) return;
    lastSetTitle = desired;

    if (document.title !== desired) document.title = desired;
  }

  function updateTabTitle() {
    // ✅ Project list page
    if (isProjectListPage()) {
      const pid = getProjectIdFromUrl();
      if (pid) {
        const saved = sessionStorage.getItem(FULL_PROJ_KEY(pid));
        if (saved) window.H2O_fullOriginalTitle = saved;
        maybeSaveFullTitle(FULL_PROJ_KEY(pid));
      }

      const domName = getProjectNameFromDom();
      if (domName) return setTabTitle(domName);

      const fallback = extractProjectOnly(document.title || '');
      return setTabTitle(fallback);
    }

    // ✅ Chat page
    if (isChatPage()) {
      const chatId = getChatIdFromUrl();
      if (!chatId) return;

      const saved = sessionStorage.getItem(FULL_CHAT_KEY(chatId));
      if (saved) window.H2O_fullOriginalTitle = saved;
      maybeSaveFullTitle(FULL_CHAT_KEY(chatId));

      const fromSidebar = getChatTitleFromSidebar();
      if (fromSidebar) return setTabTitle(fromSidebar);

let fallback = extractChatOnly(document.title || '');
if (!fallback && window.H2O_fullOriginalTitle) {
  fallback = extractChatOnly(window.H2O_fullOriginalTitle);
}
return setTabTitle(fallback);

    }
  }

  // ───────────────── wiring ─────────────────

  function watchTitleEl() {
    const el = document.querySelector('title');
    if (!el) return false;
    const obs = new MutationObserver(updateTabTitle);
    obs.observe(el, { childList: true, characterData: true, subtree: true });
    return true;
  }

  updateTabTitle();

  const t = setInterval(() => {
    updateTabTitle();
    if (watchTitleEl()) clearInterval(t);
  }, 120);

  const origPushState = history.pushState;
  history.pushState = function (...args) {
    origPushState.apply(this, args);
    setTimeout(updateTabTitle, 60);
  };

  const origReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    origReplaceState.apply(this, args);
    setTimeout(updateTabTitle, 60);
  };

  window.addEventListener('popstate', () => setTimeout(updateTabTitle, 60));
  window.addEventListener('focus', () => setTimeout(updateTabTitle, 60));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(updateTabTitle, 60);
  });

  setInterval(updateTabTitle, 2000);

})();
