// ==H2O Module==
// @h2o-id             9b1a.tab.title
// @name               9B1a.🟤🔖 Tab Title 🔖
// @namespace          H2O.Premium.CGX.tab.title
// @author             HumamDev
// @version            2.0.0
// @revision           001
// @build              260506-000000
// @description        Browser tab title renderer for H2O.ChatTitle canonical state.
// @match              https://chatgpt.com/*
// @run-at             document-start
// @grant              none
// ==/H2O Module==

(function () {
  'use strict';

  const W = window;
  const D = document;
  const TITLE_WRITE_TTL_MS = 900;
  let lastRendered = '';
  let unsubscribe = null;
  let attachTimer = 0;

  function norm(value) {
    return String(value || '').replace(/[\s\u00A0]+/g, ' ').trim();
  }

  function stripTrailingChatGPT(raw) {
    return norm(raw).replace(/\s*[–—-]\s*ChatGPT\s*$/i, '').trim();
  }

  function fallbackTitle() {
    const raw = stripTrailingChatGPT(D.title || '');
    if (!raw || /^chatgpt$/i.test(raw)) return '';
    const parts = raw.split(/\s*[–—-]\s*/g).map(norm).filter(Boolean);
    const filtered = parts.filter((part) => !/^chatgpt$/i.test(part));
    return filtered[filtered.length - 1] || raw;
  }

  function renderTitle(nextTitle) {
    const title = norm(nextTitle);
    if (!title || /^chatgpt$/i.test(title)) return;
    if (title === lastRendered && document.title === title) return;

    lastRendered = title;
    try {
      W.H2O?.ChatTitle?.markDocumentTitleWrite?.(title, {
        source: 'tab-title',
        ttlMs: TITLE_WRITE_TTL_MS,
      });
    } catch {}
    if (document.title !== title) document.title = title;
  }

  function renderFromState(state) {
    const nextTitle = state?.documentTitle || state?.displayTitle || state?.baseTitle || '';
    if (nextTitle) renderTitle(nextTitle);
  }

  function attach() {
    const api = W.H2O && W.H2O.ChatTitle;
    if (!api || typeof api.subscribe !== 'function') return false;
    if (unsubscribe) return true;

    unsubscribe = api.subscribe((state) => renderFromState(state));
    try { renderFromState(api.getState()); } catch {}
    return true;
  }

  function scheduleAttach() {
    clearTimeout(attachTimer);
    attachTimer = setTimeout(() => {
      if (!attach()) scheduleAttach();
    }, 120);
  }

  if (!attach()) {
    const fallback = fallbackTitle();
    if (fallback) renderTitle(fallback);
    scheduleAttach();
  }

  W.addEventListener('h2o:chat-title:changed', (event) => {
    renderFromState(event && event.detail);
  });
  W.addEventListener('evt:h2o:chat-title:changed', (event) => {
    renderFromState(event && event.detail);
  });
})();
