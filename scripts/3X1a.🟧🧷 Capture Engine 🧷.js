// ==UserScript==
// @h2o-id             3y1a.capture.engine
// @name               3Y1a.🟧🧷 Capture Engine 🧷
// @namespace          H2O.Premium.CGX.capture.engine
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260312-000001
// @description        Per-chat Capture Box engine. Stores temporary captured items, selection captures, review state, and conversions to Notes/Bookmarks with safe source links.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const D = document;
  const NS = 'h2o:prm:cgx:capture';
  const API_NAME = 'H2OCapture';
  const API_LEGACY = 'HoCapture';

  const EV = Object.freeze({
    changed: 'h2o:capture:changed',
    created: 'h2o:capture:item-created',
    updated: 'h2o:capture:item-updated',
    converted: 'h2o:capture:item-converted',
    archived: 'h2o:capture:item-archived',
    reviewStarted: 'h2o:capture:review-started',
    reviewFinished: 'h2o:capture:review-finished',
  });

  const CFG = Object.freeze({
    storeVersion: 1,
    reviewAgeMs: 7 * 24 * 60 * 60 * 1000,
    maxItemsSoft: 500,
    maxTextLen: 6000,
    maxSelectionLen: 2400,
    maxSnippetLen: 240,
  });

  const STR = Object.freeze({
    unknownChat: 'unknown',
    unknown: 'unknown',
    sourceCapture: 'capture-engine',
  });

  const SEL = Object.freeze({
    msgAny: '[data-message-author-role="assistant"], [data-message-author-role="user"]',
    msgRole: '[data-message-author-role]',
  });

  const S = {
    booted: false,
    chatId: 'unknown',
    onPop: null,
    mo: null,
  };

  function now() { return Date.now(); }
  function uid(prefix = 'cap') { return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`; }
  function txt(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
  function clampText(v, n = CFG.maxTextLen) { const s = String(v || ''); return s.length > n ? s.slice(0, n) : s; }
  function normId(v) { return String(v || '').trim(); }
  function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function getChatId() {
    const m = location.pathname.match(/\/c\/([^/?#]+)/);
    return m ? m[1] : STR.unknownChat;
  }

  function keyStore(chatId = S.chatId || getChatId()) { return `${NS}:store:v${CFG.storeVersion}:${chatId}`; }
  function keyUi(chatId = S.chatId || getChatId()) { return `${NS}:ui:v${CFG.storeVersion}:${chatId}`; }

  function defaultStore() {
    const t = now();
    return { version: CFG.storeVersion, items: [], meta: { createdAt: t, updatedAt: t, lastReviewAt: 0 } };
  }

  function defaultUi() {
    return { version: CFG.storeVersion, subTab: 'capture', sortBy: 'newest', filter: 'all', query: '' };
  }

  function lsGet(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (_) { return false; }
  }

  function ensureStoreShape(store) {
    const base = defaultStore();
    const src = (store && typeof store === 'object') ? store : base;
    const items = Array.isArray(src.items) ? src.items.filter(Boolean) : [];
    const meta = { ...base.meta, ...(src.meta || {}) };
    return { version: CFG.storeVersion, items, meta };
  }

  function ensureUiShape(ui) {
    const base = defaultUi();
    const src = (ui && typeof ui === 'object') ? ui : base;
    return { ...base, ...src, version: CFG.storeVersion };
  }

  function loadStore(chatId = S.chatId || getChatId()) { return ensureStoreShape(lsGet(keyStore(chatId), defaultStore())); }
  function saveStore(chatId, store) {
    const next = ensureStoreShape(store);
    next.meta.updatedAt = now();
    lsSet(keyStore(chatId), next);
    return next;
  }
  function loadUi(chatId = S.chatId || getChatId()) { return ensureUiShape(lsGet(keyUi(chatId), defaultUi())); }
  function saveUi(chatId, ui) {
    const next = ensureUiShape(ui);
    lsSet(keyUi(chatId), next);
    return next;
  }

  function emit(evName, detail = {}) {
    try { W.dispatchEvent(new CustomEvent(evName, { detail: { ...detail, ts: now() } })); } catch (_) {}
  }

  function emitChange(chatId, reason, itemId = null, extra = null) {
    const detail = { chatId, reason, itemId, ...(extra || {}) };
    emit(EV.changed, detail);
    if (reason === 'create') emit(EV.created, detail);
    else if (reason === 'update' || reason === 'review' || reason === 'dismiss') emit(EV.updated, detail);
    else if (reason === 'convert') emit(EV.converted, detail);
    else if (reason === 'archive') emit(EV.archived, detail);
  }

  function onChange(fn, opts) {
    if (typeof fn !== 'function') return () => {};
    W.addEventListener(EV.changed, fn, opts);
    return () => { try { W.removeEventListener(EV.changed, fn, opts); } catch (_) {} };
  }

  function hashText(s) {
    let h = 2166136261;
    const str = String(s || '');
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  function snippet(s, n = CFG.maxSnippetLen) {
    const t = txt(s);
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
  }

  function routeLabel(route) {
    return String(route || 'note');
  }

  function suggestRoute(text, source = {}) {
    const t = String(text || '').trim();
    if (!t) return 'note';
    if (/\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|png|jpe?g|webp|gif|mp3|mp4|mov|csv|txt|md|json|js|ts|css|html|user\.js)(\?|#|$)/i.test(t)) return 'attachment';
    if (/^(todo|fix|bug|task):/i.test(t)) return 'task';
    if (/^https?:\/\//i.test(t) && /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z)(\?|#|$)/i.test(t)) return 'attachment';
    if (source?.role === 'assistant' && txt(t).length <= 180) return 'bookmark';
    if (txt(t).length > 180) return 'note';
    return 'note';
  }

  function listItems(chatId = S.chatId || getChatId()) {
    return loadStore(chatId).items.slice().sort((a, b) => (b?.createdAt || 0) - (a?.createdAt || 0));
  }

  function getItem(itemId, chatId = S.chatId || getChatId()) {
    return loadStore(chatId).items.find(x => x && x.id === itemId) || null;
  }

  function getCounts(chatId = S.chatId || getChatId()) {
    const store = loadStore(chatId);
    const t = now();
    const out = { total: store.items.length, new: 0, reviewed: 0, converted: 0, archived: 0, aging: 0 };
    for (const it of store.items) {
      const st = String(it?.status || 'new');
      if (st in out) out[st]++;
      if ((st === 'new' || st === 'reviewed') && (t - (it?.createdAt || t) >= CFG.reviewAgeMs)) out.aging++;
    }
    return out;
  }

  function normalizeSource(source) {
    return {
      msgId: normId(source?.msgId),
      turnId: normId(source?.turnId),
      role: /^(assistant|user|system)$/i.test(String(source?.role || '')) ? String(source.role).toLowerCase() : STR.unknown,
      selectionText: clampText(source?.selectionText || '', CFG.maxSelectionLen),
      selectionHash: normId(source?.selectionHash),
      url: String(source?.url || '').trim(),
    };
  }

  function normalizeItem(partial, chatId = S.chatId || getChatId()) {
    const source = normalizeSource(partial?.source || {});
    const text = clampText(partial?.text || '', CFG.maxTextLen).trim();
    const title = txt(partial?.title || '');
    const createdAt = now();
    return {
      id: uid('cap'),
      chatId,
      kind: String(partial?.kind || 'text'),
      text,
      title,
      source,
      routeSuggestion: routeLabel(partial?.routeSuggestion || suggestRoute(text, source)),
      status: String(partial?.status || 'new'),
      tags: Array.isArray(partial?.tags) ? partial.tags.map(txt).filter(Boolean) : [],
      pinned: !!partial?.pinned,
      createdAt,
      updatedAt: createdAt,
      reviewedAt: Number(partial?.reviewedAt || 0),
      convertedTo: partial?.convertedTo || null,
      dismissed: !!partial?.dismissed,
    };
  }

  function trimStoreIfNeeded(store) {
    if (!store || !Array.isArray(store.items)) return store;
    if (store.items.length <= CFG.maxItemsSoft) return store;
    store.items = store.items.slice(0, CFG.maxItemsSoft);
    return store;
  }

  function createItem(partial, chatId = S.chatId || getChatId()) {
    const store = loadStore(chatId);
    const item = normalizeItem(partial, chatId);
    if (!item.text && !item.title) return null;
    store.items.unshift(item);
    trimStoreIfNeeded(store);
    saveStore(chatId, store);
    emitChange(chatId, 'create', item.id);
    return item;
  }

  function updateItem(itemId, patch, chatId = S.chatId || getChatId()) {
    if (!itemId) return null;
    const store = loadStore(chatId);
    const idx = store.items.findIndex(x => x && x.id === itemId);
    if (idx < 0) return null;
    const cur = store.items[idx];
    const next = {
      ...cur,
      ...(patch || {}),
      title: patch?.title != null ? txt(patch.title) : cur.title,
      text: patch?.text != null ? clampText(patch.text, CFG.maxTextLen).trim() : cur.text,
      tags: patch?.tags != null ? (Array.isArray(patch.tags) ? patch.tags.map(txt).filter(Boolean) : cur.tags) : cur.tags,
      source: patch?.source != null ? normalizeSource(patch.source) : cur.source,
      updatedAt: now(),
    };
    store.items[idx] = next;
    saveStore(chatId, store);
    emitChange(chatId, 'update', itemId);
    return next;
  }

  function removeItem(itemId, chatId = S.chatId || getChatId()) {
    const store = loadStore(chatId);
    const next = store.items.filter(x => x && x.id !== itemId);
    if (next.length === store.items.length) return false;
    store.items = next;
    saveStore(chatId, store);
    emitChange(chatId, 'update', itemId, { removed: true });
    return true;
  }

  function archiveItem(itemId, chatId = S.chatId || getChatId()) {
    const out = updateItem(itemId, { status: 'archived', reviewedAt: now() }, chatId);
    if (out) emitChange(chatId, 'archive', itemId);
    return out;
  }

  function reviewItem(itemId, chatId = S.chatId || getChatId()) {
    return updateItem(itemId, { status: 'reviewed', reviewedAt: now() }, chatId);
  }

  function dismissItem(itemId, chatId = S.chatId || getChatId()) {
    return updateItem(itemId, { dismissed: true, status: 'archived', reviewedAt: now() }, chatId);
  }

  function nearestMsgEl(node) {
    try {
      return node?.closest?.(SEL.msgAny) || null;
    } catch (_) {
      return null;
    }
  }

  function detectMsgId(msgEl) {
    if (!msgEl) return '';
    const candidates = [
      msgEl.getAttribute('data-message-id'),
      msgEl.getAttribute('data-msg-id'),
      msgEl.getAttribute('data-id'),
      msgEl.id,
    ].filter(Boolean);
    for (const c of candidates) {
      const id = normId(c);
      if (id) return id;
    }
    const any = Array.from(msgEl.attributes || []).find(a => /message.*id|msg.*id/i.test(a.name) && a.value);
    return normId(any?.value || '');
  }

  function detectRole(msgEl) {
    const roleEl = msgEl?.matches?.(SEL.msgRole) ? msgEl : msgEl?.querySelector?.(SEL.msgRole);
    const role = String(roleEl?.getAttribute?.('data-message-author-role') || '').toLowerCase();
    return role === 'assistant' || role === 'user' || role === 'system' ? role : STR.unknown;
  }

  function inferTurnId(msgId, msgEl = null) {
    const id = normId(msgId);
    if (id) return id;
    const idx = msgEl ? Array.from(D.querySelectorAll(SEL.msgAny)).indexOf(msgEl) : -1;
    return idx >= 0 ? `turn_${idx + 1}` : '';
  }

  function readSelection() {
    const sel = W.getSelection?.();
    if (!sel || sel.rangeCount < 1 || sel.isCollapsed) return null;
    const text = clampText(sel.toString().trim(), CFG.maxSelectionLen);
    if (!text) return null;
    const range = sel.getRangeAt(0);
    const common = range.commonAncestorContainer;
    const host = common?.nodeType === 1 ? common : common?.parentElement;
    const msgEl = nearestMsgEl(host);
    const msgId = detectMsgId(msgEl);
    const role = detectRole(msgEl);
    return {
      text,
      msgEl,
      msgId,
      role,
      turnId: inferTurnId(msgId, msgEl),
      selectionHash: hashText(text),
    };
  }

  function createFromSelection(chatId = S.chatId || getChatId()) {
    const sel = readSelection();
    if (!sel) return null;
    return createItem({
      kind: 'selection',
      text: sel.text,
      source: {
        msgId: sel.msgId,
        turnId: sel.turnId,
        role: sel.role,
        selectionText: sel.text,
        selectionHash: sel.selectionHash,
      },
    }, chatId);
  }

  function findMessageElById(msgId) {
    const id = normId(msgId);
    if (!id) return null;
    const els = Array.from(D.querySelectorAll(SEL.msgAny));
    return els.find((el) => detectMsgId(el) === id) || null;
  }

  function openSource(itemOrId, chatId = S.chatId || getChatId()) {
    const item = typeof itemOrId === 'string' ? getItem(itemOrId, chatId) : itemOrId;
    if (!item) return false;
    const msgId = normId(item?.source?.msgId || item?.source?.turnId);
    const dockApi = W.H2O?.DP?.dckpnl?.api || W.H2O?.Dock || null;
    const helpers = dockApi?.getContract?.()?.helpers || null;
    try {
      if (msgId && typeof helpers?.requestRemountByMsgId === 'function') helpers.requestRemountByMsgId(msgId);
    } catch (_) {}
    const target = (msgId && findMessageElById(msgId)) || null;
    if (target) {
      try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) { try { target.scrollIntoView(); } catch (_) {} }
      try { target.animate?.([{ outline: '2px solid rgba(255,214,10,.0)' }, { outline: '2px solid rgba(255,214,10,.95)' }, { outline: '2px solid rgba(255,214,10,.0)' }], { duration: 650, easing: 'ease-out' }); } catch (_) {}
      return true;
    }
    return false;
  }

  function openDock() {
    const dockApi = W.H2O?.DP?.dckpnl?.api || null;
    if (!dockApi?.setView || !dockApi?.open) return false;

    try { dockApi.ensurePanel?.(); } catch (_) {}

    try {
      dockApi.setView('capture');
      dockApi.open();
      dockApi.requestRender?.();
      return true;
    } catch (_) {
      return false;
    }
  }

  function convertToNote(itemOrId, chatId = S.chatId || getChatId()) {
    const item = typeof itemOrId === 'string' ? getItem(itemOrId, chatId) : itemOrId;
    const api = W.H2ONotes || W.HoNotes || null;
    if (!item || typeof api?.add !== 'function') return null;
    const created = api.add({
      type: 'capture',
      title: item.title || snippet(item.text, 72),
      text: item.text,
      tags: item.tags || [],
      source: item.source || null,
    });
    if (!created?.id) return null;
    updateItem(item.id, { status: 'converted', reviewedAt: now(), convertedTo: { kind: 'note', id: created.id } }, chatId);
    emitChange(chatId, 'convert', item.id, { targetKind: 'note', targetId: created.id });
    return created;
  }

  function convertToBookmark(itemOrId, chatId = S.chatId || getChatId()) {
    const item = typeof itemOrId === 'string' ? getItem(itemOrId, chatId) : itemOrId;
    const api = W.H2OBookmarks || W.HoBookmarks || null;
    const msgId = normId(item?.source?.msgId);
    if (!item || !msgId || typeof api?.toggle !== 'function') return null;
    const on = api.toggle({
      msgId,
      title: item.title || snippet(item.text, 72),
      snippet: snippet(item.text, 160),
      snapText: item.text,
      createdAt: now(),
    });
    if (typeof on !== 'boolean') return null;
    updateItem(item.id, { status: 'converted', reviewedAt: now(), convertedTo: { kind: 'bookmark', id: msgId, active: on } }, chatId);
    emitChange(chatId, 'convert', item.id, { targetKind: 'bookmark', targetId: msgId });
    return { id: msgId, active: on };
  }

  function convertToAttachment(itemOrId, chatId = S.chatId || getChatId()) {
    const item = typeof itemOrId === 'string' ? getItem(itemOrId, chatId) : itemOrId;
    if (!item) return null;
    const url = item?.source?.url || (/https?:\/\/\S+/i.exec(item.text || '') || [])[0] || '';
    updateItem(item.id, { status: 'converted', reviewedAt: now(), convertedTo: { kind: 'attachment', id: url || item.id } }, chatId);
    emitChange(chatId, 'convert', item.id, { targetKind: 'attachment', targetId: url || item.id });
    return { id: url || item.id, url };
  }

  function getReviewQueue(chatId = S.chatId || getChatId(), opts = {}) {
    const t = now();
    const onlyAging = !!opts.onlyAging;
    return listItems(chatId).filter((it) => {
      const st = String(it?.status || 'new');
      if (st === 'converted' || st === 'archived') return false;
      if (onlyAging) return (t - (it?.createdAt || t)) >= CFG.reviewAgeMs;
      return st === 'new' || st === 'reviewed';
    });
  }

  function startReview(chatId = S.chatId || getChatId()) {
    emit(EV.reviewStarted, { chatId });
    return getReviewQueue(chatId);
  }

  function finishReview(chatId = S.chatId || getChatId()) {
    const store = loadStore(chatId);
    store.meta.lastReviewAt = now();
    saveStore(chatId, store);
    emit(EV.reviewFinished, { chatId });
    emitChange(chatId, 'update', null, { reviewFinished: true });
    return true;
  }

  function rebindIfChatChanged() {
    const next = getChatId();
    if (next === S.chatId) return;
    S.chatId = next;
    emitChange(S.chatId, 'navigation', null);
  }

  function installApi() {
    const api = {
      events: EV,
      cfg: CFG,
      keyStore,
      keyUi,
      getChatId: () => S.chatId,
      loadStore,
      saveStore,
      loadUi,
      saveUi,
      listItems,
      getItem,
      createItem,
      createFromSelection,
      updateItem,
      removeItem,
      archiveItem,
      reviewItem,
      dismissItem,
      suggestRoute,
      convertToNote,
      convertToBookmark,
      convertToAttachment,
      getReviewQueue,
      getCounts,
      emitChange,
      onChange,
      openSource,
      openDock,
      findMessageElById,
      startReview,
      finishReview,
    };
    W[API_NAME] = W[API_NAME] || api;
    W[API_LEGACY] = W[API_LEGACY] || W[API_NAME];
    W.H2O = W.H2O || {};
    W.H2O.Capture = W.H2O.Capture || api;
  }

  function bindNav() {
    if (S.onPop) return;
    S.onPop = () => rebindIfChatChanged();
    W.addEventListener('popstate', S.onPop);
    if (typeof MutationObserver !== 'function') return;
    S.mo = new MutationObserver(() => rebindIfChatChanged());
    S.mo.observe(D.documentElement, { childList: true, subtree: true });
  }

  function boot() {
    if (S.booted) return;
    S.booted = true;
    S.chatId = getChatId();
    installApi();
    bindNav();
    emitChange(S.chatId, 'boot', null, { source: STR.sourceCapture });
  }

  try { boot(); } catch (err) { console.error('[H2O Capture Engine] boot failed:', err); }
})();
