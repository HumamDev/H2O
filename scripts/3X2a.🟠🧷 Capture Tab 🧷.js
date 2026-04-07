// ==UserScript==
// @h2o-id             3y2a.capture.tab
// @name               3Y2a.🟠🧷 Capture Tab 🧷
// @namespace          H2O.Premium.CGX.capture.tab
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260312-000001
// @description        Dock Panel tab renderer for Capture Box. Provides Capture + Review sub-tabs, quick capture, selection capture, routing actions, and review workflow.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const D = document;
  const TOK = 'DP';
  const PID = 'dckpnl';
  const NS = 'cgx-cap';
  const TAB_ID = 'capture';
  const TAB_TITLE = 'Capture Box';
  const TAB_ICON = '🧷';
  const SLOT_ALIAS_ID = 'slot7';
  const PREVIOUS_SLOT_ALIAS_ID = 'slot8';
  const MIGRATION_KEY = 'h2o:prm:cgx:capture:migrate:slot8-to-slot7:v1';

  const STR = Object.freeze({
    subCapture: 'capture',
    subReview: 'review',
  });

  const ST = {
    booted: false,
    ready: false,
    tries: 0,
    bootRaf: 0,
    root: null,
    apiDock: null,
    eng: null,
    ui: null,
    lastView: '',
  };

  function now() { return Date.now(); }
  function txt(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function ageLabel(ts) {
    const ms = Math.max(0, now() - Number(ts || 0));
    const min = Math.floor(ms / 60000);
    if (min < 1) return 'now';
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    const d = Math.floor(hr / 24);
    return `${d}d`;
  }

  function waitForDockPanelApi(maxMs = 8000) {
    const t0 = performance.now();
    return new Promise((resolve) => {
      (function tick() {
        const api = W.H2O?.[TOK]?.[PID]?.api || null;
        const eng = W.H2OCapture || W.HoCapture || W.H2O?.Capture || null;
        const ok = !!(api?.getContract && W.H2O?.Dock?.registerTab && eng?.listItems);
        if (ok) return resolve({ apiDock: api, eng });
        if (performance.now() - t0 > maxMs) return resolve(null);
        requestAnimationFrame(tick);
      })();
    });
  }

  function ensureStylesOnce(contract) {
    const id = `${NS}-styles`;
    if (D.getElementById(id)) return;
    const style = D.createElement('style');
    style.id = id;
    style.textContent = `
      .${NS}-panel{display:flex;flex-direction:column;gap:10px;padding:10px 10px 12px;min-height:100%;box-sizing:border-box;color:inherit}
      .${NS}-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .${NS}-title{font-weight:700;font-size:13px;letter-spacing:.01em}
      .${NS}-counts{display:flex;gap:6px;flex-wrap:wrap}
      .${NS}-pill,.${NS}-subbtn,.${NS}-btn,.${NS}-mini{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:inherit;border-radius:10px;cursor:pointer}
      .${NS}-pill{padding:3px 8px;font-size:11px}
      .${NS}-subbar{display:flex;gap:8px}
      .${NS}-subbtn{padding:7px 10px;font-size:12px;font-weight:600}
      .${NS}-subbtn[aria-pressed="true"]{background:rgba(255,255,255,.14)}
      .${NS}-quick{display:flex;flex-direction:column;gap:8px}
      .${NS}-ta,.${NS}-search{width:100%;box-sizing:border-box;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:inherit;padding:10px 12px;font:inherit}
      .${NS}-ta{min-height:86px;resize:vertical}
      .${NS}-actions{display:flex;flex-wrap:wrap;gap:8px}
      .${NS}-btn{padding:8px 10px;font-size:12px;font-weight:600}
      .${NS}-btn[data-kind="primary"]{background:rgba(255,255,255,.14)}
      .${NS}-list{display:flex;flex-direction:column;gap:8px;min-height:140px}
      .${NS}-card{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.04);border-radius:14px}
      .${NS}-line1{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
      .${NS}-text{font-size:12px;line-height:1.45;white-space:pre-wrap;word-break:break-word}
      .${NS}-meta{display:flex;gap:8px;flex-wrap:wrap;font-size:11px;opacity:.82}
      .${NS}-cardActions{display:flex;flex-wrap:wrap;gap:6px}
      .${NS}-mini{padding:5px 8px;font-size:11px}
      .${NS}-empty{padding:14px;border:1px dashed rgba(255,255,255,.15);border-radius:14px;opacity:.78;font-size:12px}
      .${NS}-search{min-height:auto;padding:8px 10px}
      .${NS}-warn{font-size:11px;opacity:.75}
    `;
    D.head.appendChild(style);
  }

  function getUi() {
    return ST.eng.loadUi(ST.eng.getChatId());
  }

  function setUi(patch) {
    const cur = getUi();
    ST.eng.saveUi(ST.eng.getChatId(), { ...cur, ...(patch || {}) });
  }

  function filterItems(items, ui) {
    const q = txt(ui?.query || '').toLowerCase();
    const filter = String(ui?.filter || 'all');
    let out = items.slice();
    if (filter === 'new' || filter === 'reviewed' || filter === 'converted' || filter === 'archived') {
      out = out.filter(x => String(x?.status || 'new') === filter);
    } else if (filter === 'aging') {
      const counts = ST.eng.getCounts(ST.eng.getChatId());
      if (counts.aging >= 0) out = ST.eng.getReviewQueue(ST.eng.getChatId(), { onlyAging: true });
    }
    if (q) {
      out = out.filter(it => {
        const hay = [it?.text, it?.title, it?.routeSuggestion, it?.source?.role, it?.source?.msgId].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
    }
    const sortBy = String(ui?.sortBy || 'newest');
    out.sort((a, b) => {
      if (sortBy === 'oldest') return (a?.createdAt || 0) - (b?.createdAt || 0);
      if (sortBy === 'aging') return (a?.createdAt || 0) - (b?.createdAt || 0);
      return (b?.createdAt || 0) - (a?.createdAt || 0);
    });
    return out;
  }

  function countsHtml(c) {
    return `
      <span class="${NS}-pill">New ${c.new}</span>
      <span class="${NS}-pill">Review ${c.reviewed + c.aging}</span>
      <span class="${NS}-pill">Converted ${c.converted}</span>
    `;
  }

  function itemCardHtml(item) {
    const src = item?.source || {};
    const badge = esc(String(item?.routeSuggestion || 'note'));
    const st = esc(String(item?.status || 'new'));
    const title = txt(item?.title || '');
    const display = title || txt(item?.text || '').slice(0, 320);
    const hasSource = !!txt(src.msgId || src.turnId);
    return `
      <div class="${NS}-card" data-item-id="${esc(item.id)}">
        <div class="${NS}-line1">
          <div class="${NS}-text">${esc(display)}</div>
        </div>
        <div class="${NS}-meta">
          <span>${badge}</span>
          <span>${st}</span>
          <span>${esc(String(src.role || 'unknown'))}</span>
          <span>${ageLabel(item.createdAt)}</span>
          ${hasSource ? `<span>${esc(String(src.msgId || src.turnId))}</span>` : ''}
        </div>
        <div class="${NS}-cardActions">
          ${hasSource ? `<button class="${NS}-mini" data-act="open-source">Open source</button>` : ''}
          <button class="${NS}-mini" data-act="to-note">Note</button>
          <button class="${NS}-mini" data-act="to-bookmark">Bookmark</button>
          <button class="${NS}-mini" data-act="to-attachment">Attachment</button>
          <button class="${NS}-mini" data-act="mark-reviewed">Reviewed</button>
          <button class="${NS}-mini" data-act="archive">Archive</button>
          <button class="${NS}-mini" data-act="delete">Delete</button>
        </div>
      </div>
    `;
  }

  function renderCaptureView(ui, items) {
    return `
      <div class="${NS}-quick">
        <textarea class="${NS}-ta" data-role="quick-text" placeholder="Drop quick idea here…"></textarea>
        <div class="${NS}-actions">
          <button class="${NS}-btn" data-kind="primary" data-act="save-quick">Save</button>
          <button class="${NS}-btn" data-act="capture-selection">Capture Selection</button>
          <button class="${NS}-btn" data-act="filter-new">Only New</button>
          <button class="${NS}-btn" data-act="filter-all">All</button>
        </div>
        <div class="${NS}-warn">Temporary intake layer: capture first, route later.</div>
      </div>
      <input class="${NS}-search" data-role="query" placeholder="Filter captured items…" value="${esc(ui.query || '')}">
      <div class="${NS}-list">${items.length ? items.map(itemCardHtml).join('') : `<div class="${NS}-empty">Nothing captured yet.</div>`}</div>
    `;
  }

  function renderReviewView(ui, items) {
    return `
      <div class="${NS}-actions">
        <button class="${NS}-btn" data-kind="primary" data-act="review-start">Start review</button>
        <button class="${NS}-btn" data-act="filter-aging">Aging</button>
        <button class="${NS}-btn" data-act="filter-review">Needs review</button>
        <button class="${NS}-btn" data-act="review-finish">Finish review</button>
      </div>
      <input class="${NS}-search" data-role="query" placeholder="Filter review queue…" value="${esc(ui.query || '')}">
      <div class="${NS}-list">${items.length ? items.map(itemCardHtml).join('') : `<div class="${NS}-empty">No items need review right now.</div>`}</div>
    `;
  }

  function renderTab(ctx = {}) {
    const root = ctx?.listEl || ctx?.panelEl || ctx?.rootEl || ctx?.host || ST.root;
    if (!root || !ST.eng) return;
    ST.root = root;
    const ui = getUi();
    const counts = ST.eng.getCounts(ST.eng.getChatId());
    const all = ST.eng.listItems(ST.eng.getChatId());
    const items = ui.subTab === STR.subReview ? filterItems(ST.eng.getReviewQueue(ST.eng.getChatId()), ui) : filterItems(all, ui);

    root.innerHTML = `
      <div class="${NS}-panel">
        <div class="${NS}-head">
          <div class="${NS}-title">🧷 Capture Box</div>
          <div class="${NS}-counts">${countsHtml(counts)}</div>
        </div>
        <div class="${NS}-subbar">
          <button class="${NS}-subbtn" data-sub="capture" aria-pressed="${ui.subTab === STR.subCapture ? 'true' : 'false'}">Capture</button>
          <button class="${NS}-subbtn" data-sub="review" aria-pressed="${ui.subTab === STR.subReview ? 'true' : 'false'}">Review</button>
        </div>
        ${ui.subTab === STR.subReview ? renderReviewView(ui, items) : renderCaptureView(ui, items)}
      </div>
    `;

    bindUi(root);
  }

  function nearestCard(target) {
    return target?.closest?.(`.${NS}-card`) || null;
  }

  function getItemIdFromEvent(e) {
    return nearestCard(e.target)?.getAttribute('data-item-id') || '';
  }

  function bindUi(root) {
    root.querySelectorAll(`[data-sub]`).forEach(btn => {
      btn.addEventListener('click', (e) => {
        const sub = e.currentTarget.getAttribute('data-sub');
        setUi({ subTab: sub, filter: 'all', query: '' });
        renderTab({ panelEl: root });
      }, { passive: true });
    });

    const ta = root.querySelector(`[data-role="quick-text"]`);
    root.querySelector(`[data-act="save-quick"]`)?.addEventListener('click', () => {
      const value = txt(ta?.value || '');
      if (!value) return;
      ST.eng.createItem({ kind: 'quick', text: value, source: { role: 'user' } });
      if (ta) ta.value = '';
    });

    root.querySelector(`[data-act="capture-selection"]`)?.addEventListener('click', () => {
      ST.eng.createFromSelection();
    });

    root.querySelectorAll(`[data-act="filter-new"]`).forEach(btn => btn.addEventListener('click', () => { setUi({ filter: 'new' }); renderTab({ panelEl: root }); }));
    root.querySelectorAll(`[data-act="filter-all"]`).forEach(btn => btn.addEventListener('click', () => { setUi({ filter: 'all' }); renderTab({ panelEl: root }); }));
    root.querySelectorAll(`[data-act="filter-aging"]`).forEach(btn => btn.addEventListener('click', () => { setUi({ filter: 'aging', sortBy: 'aging' }); renderTab({ panelEl: root }); }));
    root.querySelectorAll(`[data-act="filter-review"]`).forEach(btn => btn.addEventListener('click', () => { setUi({ filter: 'all' }); renderTab({ panelEl: root }); }));
    root.querySelector(`[data-act="review-start"]`)?.addEventListener('click', () => { ST.eng.startReview(ST.eng.getChatId()); });
    root.querySelector(`[data-act="review-finish"]`)?.addEventListener('click', () => { ST.eng.finishReview(ST.eng.getChatId()); });

    root.querySelectorAll(`[data-role="query"]`).forEach(inp => {
      inp.addEventListener('input', (e) => {
        setUi({ query: e.target.value || '' });
        renderTab({ panelEl: root });
      });
    });

    root.querySelectorAll(`.${NS}-cardActions button`).forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const act = e.currentTarget.getAttribute('data-act');
        const itemId = getItemIdFromEvent(e);
        if (!itemId) return;
        if (act === 'open-source') ST.eng.openSource(itemId);
        else if (act === 'to-note') ST.eng.convertToNote(itemId);
        else if (act === 'to-bookmark') ST.eng.convertToBookmark(itemId);
        else if (act === 'to-attachment') ST.eng.convertToAttachment(itemId);
        else if (act === 'mark-reviewed') ST.eng.reviewItem(itemId);
        else if (act === 'archive') ST.eng.archiveItem(itemId);
        else if (act === 'delete') ST.eng.removeItem(itemId);
      });
    });
  }

  function register() {
    const Dock = W.H2O?.Dock || W.H2O?.PanelSide || null;
    if (!Dock?.registerTab) return false;
    const tabDef = {
      title: TAB_TITLE,
      icon: TAB_ICON,
      __h2oCaptureTab: true,
      render: (ctx) => renderTab(ctx || {}),
    };
    if (!Dock.tabs?.[TAB_ID]?.__h2oCaptureTab) Dock.registerTab(TAB_ID, tabDef);
    if (!Dock.tabs?.[SLOT_ALIAS_ID]?.__h2oCaptureTab) {
      Dock.registerTab(SLOT_ALIAS_ID, { ...tabDef, title: TAB_TITLE, __h2oCaptureTab: true });
    }
    return true;
  }

  function migrateLegacyDockView(apiDock) {
    if (!apiDock?.getContract) return;

    const contract = apiDock.getContract();
    const helpers = contract?.helpers || {};
    const key = contract?.disk?.KEY_DPANEL_STATE_PANEL_V1 || '';
    if (!key) return;

    try {
      if (helpers.lsGet?.(MIGRATION_KEY)) return;
    } catch (_) {}

    if (String(apiDock.getView?.() || '') === PREVIOUS_SLOT_ALIAS_ID) {
      try { apiDock.setView?.(SLOT_ALIAS_ID); } catch (_) {}
    }

    try {
      const raw = helpers.lsGet?.(key);
      const state = helpers.jsonParse?.(raw, null);
      if (state && typeof state === 'object' && state.view === PREVIOUS_SLOT_ALIAS_ID) {
        helpers.lsSet?.(key, JSON.stringify({ ...state, view: SLOT_ALIAS_ID }));
      }
    } catch (_) {}

    try { helpers.lsSet?.(MIGRATION_KEY, '1'); } catch (_) {}
  }

  function bindEventsOnce() {
    if (ST._bound) return;
    ST._bound = true;
    const rerender = () => {
      try {
        const api = ST.apiDock;
        const view = api?.getView?.() || '';
        if (view === TAB_ID || view === SLOT_ALIAS_ID) api.requestRender?.();
      } catch (_) {}
    };
    W.addEventListener('h2o:capture:changed', rerender);
    W.addEventListener('h2o:capture:review-started', rerender);
    W.addEventListener('h2o:capture:review-finished', rerender);
    W.addEventListener('h2o-notes:changed', rerender);
    W.addEventListener('ho-notes:changed', rerender);
    W.addEventListener('h2o-bookmarks:changed', rerender);
    W.addEventListener('h2o:bookmarks:changed', rerender);
    W.addEventListener('evt:h2o:pagination:pagechanged', rerender, { passive: true });
    W.addEventListener('h2o:pagination:pagechanged', rerender, { passive: true });
  }

  function scheduleBootRetry() {
    if (ST.ready || ST.bootRaf) return;
    ST.bootRaf = requestAnimationFrame(() => {
      ST.bootRaf = 0;
      void tryBoot();
    });
  }

  async function tryBoot() {
    if (ST.ready) return;
    ST.tries += 1;

    const got = await waitForDockPanelApi(1200);
    if (!got) {
      if (ST.tries < 180) scheduleBootRetry();
      return;
    }

    ST.apiDock = got.apiDock;
    ST.eng = got.eng;
    ST.ready = true;
    const contract = ST.apiDock.getContract();
    ensureStylesOnce(contract);
    migrateLegacyDockView(ST.apiDock);
    register();
    bindEventsOnce();
    try { ST.apiDock.requestRender?.(); } catch (_) {}
  }

  function boot() {
    if (ST.booted) return;
    ST.booted = true;
    scheduleBootRetry();
  }

  try { boot(); } catch (err) { console.error('[H2O Capture Tab] boot failed:', err); }
})();
