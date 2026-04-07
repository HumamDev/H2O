// ==UserScript==
// @name         3Y2a.🟠🔎 Finder 🔎
// @namespace    h2o
// @version      0.2.0
// @description  Unified finder tab for Dock: search highlights, bookmarks, notes.
// @match        https://chatgpt.com/*
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const D = W.document;

  const TOK = 'DP';
  const PID = 'dckpnl';
  const TAB_ID = 'finder';
  const TAB_TITLE = 'Finder';
  const SLOT_ALIAS_ID = 'slot8';
  const CSS_ID = 'h2o-finder-css';

  const EV_BOOKMARKS_CHANGED = 'h2o:bookmarks:changed';
  const EV_NOTES_CHANGED = 'h2o:notes:changed';
  const EV_INLINE_CHANGED = 'h2o:inline:changed';

  let apiDock = null;
  let contract = null;

  const STATE = {
    booted: false,
    ready: false,
    tries: 0,
    bootRaf: 0,
    eventsBound: false,
    root: null,
    chatId: '',
    q: '',
    kind: 'all',
    groupBy: 'turn',
    recentQueries: [],
    results: [],
    index: [],
    indexVersion: 0,
  };

  function getChatId() {
    try {
      const viaCore = W.H2O?.util?.getChatId?.();
      if (viaCore) return String(viaCore);
      const m = String(location.pathname || '').match(/\/c\/([^/?#]+)/);
      return m?.[1] || 'default';
    } catch {
      return 'default';
    }
  }

  function getUiKey(chatId) {
    return `h2o:prm:cgx:finder:ui:v1:${String(chatId || 'default')}`;
  }

  function loadUiState() {
    try {
      const raw = W.localStorage.getItem(getUiKey(STATE.chatId));
      if (!raw) return;
      const data = JSON.parse(raw);
      if (typeof data.q === 'string') STATE.q = data.q;
      if (typeof data.kind === 'string') STATE.kind = data.kind;
      if (typeof data.groupBy === 'string') STATE.groupBy = data.groupBy;
      if (Array.isArray(data.recentQueries)) STATE.recentQueries = data.recentQueries.slice(0, 10);
    } catch {}
  }

  function saveUiState() {
    try {
      W.localStorage.setItem(getUiKey(STATE.chatId), JSON.stringify({
        q: STATE.q,
        kind: STATE.kind,
        groupBy: STATE.groupBy,
        recentQueries: STATE.recentQueries.slice(0, 10),
      }));
    } catch {}
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function shortText(value, maxLen = 140) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
  }

  function normalizeText(value) {
    return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function scoreRecord(record, qNorm) {
    if (!qNorm) return 0;
    const title = normalizeText(record.title);
    const text = normalizeText(record.text);
    let score = 0;

    if (title === qNorm) score += 100;
    if (title.includes(qNorm)) score += 60;
    if (text.includes(qNorm)) score += 35;
    if (title.startsWith(qNorm)) score += 20;
    if (record.msgId) score += 5;

    return score;
  }

  function getBookmarksRecords() {
    try {
      const api = W.H2OBookmarks || W.HoBookmarks || null;
      const arr = api?.getAll?.() || api?.list?.() || [];
      return arr.map((item, index) => ({
        id: item.id || item.msgId || `bm_${index}`,
        kind: 'bookmarks',
        msgId: item.msgId || '',
        turnNo: item.pairNo || item.answerNo || item.turnNo || 0,
        title: shortText(item.title || item.snippet || item.snapText || 'Bookmark', 80),
        text: item.snapText || item.snippet || item.title || '',
        updatedAt: item.updatedAt || item.createdAt || item.ts || 0,
        createdAt: item.createdAt || item.updatedAt || item.ts || 0,
      }));
    } catch {
      return [];
    }
  }

  function getNotesRecords() {
    try {
      const api = W.H2ONotes || W.HoNotes || null;
      const arr = api?.list?.() || [];
      return arr.map((item, index) => ({
        id: item.id || `note_${index}`,
        kind: 'notes',
        msgId: item.source?.msgId || item.source?.id || item.msgId || '',
        turnNo: item.turnNo || 0,
        title: shortText(item.title || item.text || 'Note', 80),
        text: item.text || item.body || '',
        updatedAt: item.updatedAt || item.createdAt || item.ts || 0,
        createdAt: item.createdAt || item.updatedAt || item.ts || 0,
      }));
    } catch {
      return [];
    }
  }

  function getHighlightsRecords() {
    try {
      const api = W.H2OInline || W.HoInline || W.H2O?.inline || null;
      const arr = api?.listEntries?.({
        includeText: true,
        includeEmptyText: true,
        maxTextLen: 800,
        maxContextLen: 1200,
      }) || [];
      return arr.map((item, index) => ({
        id: item.hlId || item.id || `hl_${index}`,
        kind: 'highlights',
        msgId: item.answerId || item.turnId || item.msgId || '',
        turnNo: item.answerNumber || item.turnNo || 0,
        title: shortText(item.text || item.context || item.title || 'Highlight', 80),
        text: item.context || item.text || '',
        updatedAt: item.updatedAt || item.createdAt || item.ts || 0,
        createdAt: item.createdAt || item.updatedAt || item.ts || 0,
      }));
    } catch {
      return [];
    }
  }

  function rebuildIndex() {
    STATE.index = [
      ...getHighlightsRecords(),
      ...getBookmarksRecords(),
      ...getNotesRecords(),
    ];
    STATE.indexVersion += 1;
    runSearch();
  }

  function runSearch() {
    const qNorm = normalizeText(STATE.q);
    let out = STATE.index.slice();

    if (STATE.kind !== 'all') out = out.filter((row) => row.kind === STATE.kind);

    if (qNorm) {
      out = out
        .map((row) => ({ ...row, _score: scoreRecord(row, qNorm) }))
        .filter((row) => row._score > 0)
        .sort((a, b) => (b._score - a._score) || ((b.updatedAt || 0) - (a.updatedAt || 0)));
    } else {
      out = out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }

    STATE.results = out;
  }

  function groupedResults() {
    if (STATE.groupBy === 'type') {
      const groups = new Map();
      for (const row of STATE.results) {
        const key = row.kind;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      }
      return [...groups.entries()];
    }

    const groups = new Map();
    for (const row of STATE.results) {
      const key = row.msgId || `turn_${row.turnNo || 'unknown'}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    return [...groups.entries()];
  }

  function openSourceTab(kind) {
    const map = {
      highlights: 'highlights',
      bookmarks: 'bookmarks',
      notes: 'notes',
    };
    apiDock?.setView?.(map[kind] || TAB_ID);
  }

  async function jumpToMsg(msgId) {
    if (!msgId) return;
    try { contract?.helpers?.requestRemountByMsgId?.(msgId); } catch {}

    const escId = (W.CSS && CSS.escape) ? CSS.escape(msgId) : msgId;
    const selectors = [
      `[data-h2o-msg-id="${escId}"]`,
      `[data-msg-id="${escId}"]`,
      `[data-testid="conversation-turn-${escId}"]`,
      `#conversation-turn-${escId}`,
    ];

    let tries = 0;
    const timer = W.setInterval(() => {
      tries += 1;
      const el = D.querySelector(selectors.join(', '));
      if (el) {
        W.clearInterval(timer);
        try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
        try {
          el.classList.add('h2o-finder-ping');
          W.setTimeout(() => el.classList.remove('h2o-finder-ping'), 1200);
        } catch {}
      }
      if (tries > 20) W.clearInterval(timer);
    }, 120);
  }

  function addRecentQuery(q) {
    const value = String(q || '').trim();
    if (!value) return;
    STATE.recentQueries = [value, ...STATE.recentQueries.filter((item) => item !== value)].slice(0, 8);
    saveUiState();
  }

  function renderToolbar() {
    const chips = [
      ['all', 'All'],
      ['highlights', 'Highlights'],
      ['bookmarks', 'Bookmarks'],
      ['notes', 'Notes'],
    ].map(([kind, label]) => `
      <button class="h2o-finder-chip ${STATE.kind === kind ? 'is-active' : ''}" data-kind="${kind}">
        ${label}
      </button>
    `).join('');

    return `
      <div class="h2o-finder-toolbar">
        <input class="h2o-finder-input" type="text" placeholder="Find saved items..." value="${escapeHtml(STATE.q)}" />
        <div class="h2o-finder-chips">${chips}</div>
        <div class="h2o-finder-group">
          <button class="h2o-finder-group-btn ${STATE.groupBy === 'turn' ? 'is-active' : ''}" data-group="turn">By Turn</button>
          <button class="h2o-finder-group-btn ${STATE.groupBy === 'type' ? 'is-active' : ''}" data-group="type">By Type</button>
        </div>
        <div class="h2o-finder-meta">${STATE.results.length} result(s)</div>
      </div>
    `;
  }

  function renderResults() {
    const groups = groupedResults();
    if (!groups.length) return `<div class="h2o-finder-empty">No matches.</div>`;

    return groups.map(([groupKey, rows]) => `
      <section class="h2o-finder-groupbox">
        <div class="h2o-finder-grouptitle">${escapeHtml(groupKey)}</div>
        ${rows.map((row) => `
          <div class="h2o-finder-row" data-id="${escapeHtml(row.id)}" data-kind="${escapeHtml(row.kind)}" data-msg-id="${escapeHtml(row.msgId || '')}">
            <div class="h2o-finder-row-main">
              <div class="h2o-finder-row-title">${escapeHtml(row.title || '(untitled)')}</div>
              <div class="h2o-finder-row-text">${escapeHtml(shortText(row.text, 140))}</div>
            </div>
            <div class="h2o-finder-row-side">
              <span class="h2o-finder-badge">${escapeHtml(row.kind)}</span>
              <button class="h2o-finder-open" data-open-tab="${escapeHtml(row.kind)}">Open</button>
            </div>
          </div>
        `).join('')}
      </section>
    `).join('');
  }

  function rerenderRoot(root) {
    if (!root) return;
    root.innerHTML = renderToolbar() + renderResults();
    attachEvents(root);
  }

  function attachEvents(root) {
    const input = root.querySelector('.h2o-finder-input');
    if (input) {
      let t = 0;
      input.addEventListener('input', () => {
        W.clearTimeout(t);
        t = W.setTimeout(() => {
          STATE.q = input.value || '';
          runSearch();
          saveUiState();
          rerenderRoot(root);
        }, 100);
      });

      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') addRecentQuery(STATE.q);
        if (ev.key === 'Escape') {
          STATE.q = '';
          input.value = '';
          runSearch();
          saveUiState();
          rerenderRoot(root);
        }
      });
    }

    root.querySelectorAll('.h2o-finder-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        STATE.kind = btn.dataset.kind || 'all';
        runSearch();
        saveUiState();
        rerenderRoot(root);
      });
    });

    root.querySelectorAll('.h2o-finder-group-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        STATE.groupBy = btn.dataset.group || 'turn';
        saveUiState();
        rerenderRoot(root);
      });
    });

    root.querySelectorAll('.h2o-finder-row').forEach((row) => {
      row.addEventListener('click', async (ev) => {
        if (ev.target.closest('.h2o-finder-open')) return;
        addRecentQuery(STATE.q);
        await jumpToMsg(row.dataset.msgId || '');
      });
    });

    root.querySelectorAll('.h2o-finder-open').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openSourceTab(btn.dataset.openTab || '');
      });
    });
  }

  function injectCssOnce() {
    if (D.getElementById(CSS_ID)) return;
    const style = D.createElement('style');
    style.id = CSS_ID;
    style.textContent = `
      .h2o-finder-toolbar { display:grid; gap:8px; margin-bottom:10px; }
      .h2o-finder-input { width:100%; padding:10px 12px; border-radius:12px; }
      .h2o-finder-chips, .h2o-finder-group { display:flex; gap:6px; flex-wrap:wrap; }
      .h2o-finder-chip, .h2o-finder-group-btn, .h2o-finder-open { cursor:pointer; }
      .h2o-finder-chip.is-active, .h2o-finder-group-btn.is-active { font-weight:700; }
      .h2o-finder-groupbox { margin:10px 0; }
      .h2o-finder-grouptitle { font-weight:700; opacity:.8; margin-bottom:6px; }
      .h2o-finder-row { display:flex; justify-content:space-between; gap:10px; padding:10px; border-radius:12px; }
      .h2o-finder-row + .h2o-finder-row { margin-top:6px; }
      .h2o-finder-row-title { font-weight:700; }
      .h2o-finder-row-text { opacity:.82; font-size:.92em; }
      .h2o-finder-row-side { display:flex; align-items:center; gap:8px; }
      .h2o-finder-badge { font-size:.8em; opacity:.75; }
      .h2o-finder-empty { opacity:.7; padding:12px 0; }
      .h2o-finder-ping { outline: 2px solid rgba(255,215,0,.65); transition: outline-color .6s ease; }
    `;
    D.head.appendChild(style);
  }

  function syncChatContext() {
    const nextChatId = getChatId();
    if (nextChatId === STATE.chatId) return false;
    STATE.chatId = nextChatId;
    STATE.q = '';
    STATE.kind = 'all';
    STATE.groupBy = 'turn';
    STATE.recentQueries = [];
    loadUiState();
    rebuildIndex();
    return true;
  }

  function renderFinderTab(ctx = {}) {
    const root = ctx?.listEl || ctx?.panelEl || STATE.root;
    if (!root) return;

    STATE.root = root;
    injectCssOnce();

    if (!STATE.chatId) {
      STATE.chatId = getChatId();
      loadUiState();
    }

    syncChatContext();
    if (!STATE.indexVersion) rebuildIndex();
    rerenderRoot(root);
  }

  function register() {
    const Dock = W.H2O?.Dock || W.H2O?.PanelSide || null;
    if (!Dock?.registerTab) return false;

    const tabDef = {
      title: TAB_TITLE,
      __h2oFinderTab: true,
      render: (ctx) => renderFinderTab(ctx || {}),
    };

    if (!Dock.tabs?.[TAB_ID]?.__h2oFinderTab) Dock.registerTab(TAB_ID, tabDef);
    if (!Dock.tabs?.[SLOT_ALIAS_ID]?.__h2oFinderTab) {
      Dock.registerTab(SLOT_ALIAS_ID, { ...tabDef, title: TAB_TITLE, __h2oFinderTab: true });
    }
    return true;
  }

  function bindEventsOnce() {
    if (STATE.eventsBound) return;
    STATE.eventsBound = true;

    const rerender = () => {
      rebuildIndex();
      try {
        const view = apiDock?.getView?.() || '';
        if (view === TAB_ID || view === SLOT_ALIAS_ID) apiDock?.requestRender?.();
      } catch {}
    };

    W.addEventListener(EV_BOOKMARKS_CHANGED, rerender, true);
    W.addEventListener(EV_NOTES_CHANGED, rerender, true);
    W.addEventListener(EV_INLINE_CHANGED, rerender, true);
  }

  function waitForDockPanelApi(timeout = 8000) {
    const started = Date.now();
    return new Promise((resolve) => {
      (function tick() {
        const api = W.H2O?.[TOK]?.[PID]?.api || null;
        const ok = !!(api?.getContract && W.H2O?.Dock?.registerTab);
        if (ok) return resolve(api);
        if (Date.now() - started > timeout) return resolve(null);
        W.requestAnimationFrame(tick);
      })();
    });
  }

  function scheduleBootRetry() {
    if (STATE.ready || STATE.bootRaf) return;
    STATE.bootRaf = W.requestAnimationFrame(() => {
      STATE.bootRaf = 0;
      void tryBoot();
    });
  }

  async function tryBoot() {
    if (STATE.ready) return;
    STATE.tries += 1;

    apiDock = await waitForDockPanelApi(1200);
    if (!apiDock) {
      if (STATE.tries < 180) scheduleBootRetry();
      return;
    }

    contract = apiDock.getContract?.() || null;
    if (!contract) {
      if (STATE.tries < 180) scheduleBootRetry();
      return;
    }

    STATE.ready = true;
    STATE.chatId = getChatId();
    loadUiState();
    register();
    bindEventsOnce();
    rebuildIndex();
    try { apiDock.requestRender?.(); } catch {}
  }

  function bootFinder() {
    if (STATE.booted) return;
    STATE.booted = true;
    scheduleBootRetry();
  }

  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', bootFinder, { once: true });
  else bootFinder();
})();
