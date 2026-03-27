// ==UserScript==
// @h2o-id             3w1a.context.engine
// @name               3W1a.🟧🧠 Context Engine 🧠
// @namespace          H2O.Premium.CGX.context.engine
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260312-120000
// @description        Per-chat Context Stack store + source promotion + prompt insertion. Exposes window.H2O_Context and stays offline-first in localStorage.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const D = W.document;

  const TOK = 'CE';
  const PID = 'ctxeng';
  const CID = 'contextengine';
  const SkID = 'ctxng';
  const BrID = PID;
  const DsID = PID;

  const SUITE = 'prm';
  const HOST = 'cgx';

  const H2O = (W.H2O = W.H2O || {});
  H2O[TOK] = H2O[TOK] || {};

  const VAULT = (H2O[TOK][BrID] = H2O[TOK][BrID] || {});
  VAULT.meta = VAULT.meta || { tok: TOK, pid: PID, cid: CID, skid: SkID, suite: SUITE, host: HOST };

  const KEY_META = 'h2o:prm:cgx:ctxeng:meta:v1';
  const KEY_ITEMS = (chatId) => `h2o:prm:cgx:ctxeng:items:v1:${String(chatId || 'unknown')}`;
  const KEY_UI = (chatId) => `h2o:prm:cgx:ctxeng:ui:v1:${String(chatId || 'unknown')}`;
  const KEY_HISTORY = (chatId) => `h2o:prm:cgx:ctxeng:history:v1:${String(chatId || 'unknown')}`;

  const EV_CHANGED = 'h2o:context:changed';
  const EV_INSERTED = 'h2o:context:inserted';
  const EV_PROMOTED = 'h2o:context:promoted';
  const EV_UI_CHANGED = 'h2o:context:ui-changed';

  const EV_NOTES_CHANGED = 'h2o:notes:changed';
  const EV_NOTES_CHANGED_ALT = 'h2o-notes:changed';
  const EV_INLINE_CHANGED = 'h2o:inline:changed';
  const EV_INLINE_CHANGED_EVT = 'evt:h2o:inline:changed';
  const EV_MSG_REMOUNTED = 'h2o:message:remounted';
  const EV_MSG_REMOUNTED_EVT = 'evt:h2o:message:remounted';

  const CFG = Object.freeze({
    profiles: Object.freeze(['coding', 'legal', 'study']),
    uiModes: Object.freeze(['active', 'library', 'history']),
    sorts: Object.freeze(['manual', 'updated', 'created', 'title']),
    tagsMax: 16,
    searchMax: 240,
    titleMax: 96,
    historyMax: 30,
    remountRetries: 12,
    remountRetryMs: 120,
    flashMs: 900,
    moObserveSubtree: true,
    exportVersion: '1.0.0',
  });

  const UI_DEFAULTS = Object.freeze({
    mode: 'active',
    search: '',
    profile: 'coding',
    selectedId: null,
    expanded: {},
    sort: 'manual',
  });

  VAULT.diag = VAULT.diag || { ver: 'context-engine-v1', bootCount: 0, lastBootAt: 0, steps: [], lastError: null, stepsMax: 140 };
  function DIAG(name, extra) {
    try {
      const d = VAULT.diag;
      d.steps.push({ t: Date.now(), name, extra: extra ?? null });
      if (d.steps.length > d.stepsMax) d.steps.shift();
    } catch (_) {}
  }

  VAULT.state = VAULT.state || {
    booted: false,
    chatId: 'unknown',
    mo: null,
    onPop: null,
  };
  const S = VAULT.state;

  function UTIL_now() { return Date.now(); }

  function UTIL_getChatId() {
    const viaCore = W.H2O?.util?.getChatId?.();
    if (viaCore) return String(viaCore);
    const m = String(location.pathname || '').match(/\/c\/([a-z0-9-]+)/i);
    return m ? String(m[1]) : 'unknown';
  }

  function UTIL_resolveChatId(chatId) {
    return String(chatId || S.chatId || UTIL_getChatId() || 'unknown');
  }

  function UTIL_normMsgId(id) {
    const viaCore = W.H2O?.msg?.normalizeId?.(id);
    if (viaCore) return String(viaCore);
    return String(id || '').replace(/^conversation-turn-/, '').replace(/^turn:/, '').replace(/^msg:/, '').trim();
  }

  function UTIL_safeParse(raw, fallback) {
    try { return JSON.parse(String(raw || '')); } catch (_) { return fallback; }
  }

  function UTIL_lsGet(key) {
    try { return W.localStorage.getItem(key); } catch (_) { return null; }
  }

  function UTIL_lsSet(key, value) {
    try { W.localStorage.setItem(key, String(value)); return true; } catch (_) { return false; }
  }

  function UTIL_wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function UTIL_cryptoId(prefix = 'ctx') {
    try { return `${prefix}_${crypto.randomUUID()}`; }
    catch (_) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`; }
  }

  function UTIL_cleanLine(value, maxLen = 0) {
    let text = String(value || '').replace(/\s+/g, ' ').trim();
    if (maxLen > 0 && text.length > maxLen) text = `${text.slice(0, maxLen - 1).trimEnd()}…`;
    return text;
  }

  function UTIL_cleanBlock(value) {
    return String(value || '')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function UTIL_firstLine(text, maxLen = CFG.titleMax) {
    const line = String(text || '').split('\n').find((part) => String(part || '').trim()) || '';
    return UTIL_cleanLine(line, maxLen);
  }

  function UTIL_normProfile(value) {
    const v = String(value || '').trim().toLowerCase();
    return CFG.profiles.includes(v) ? v : UI_DEFAULTS.profile;
  }

  function UTIL_normScope(_value) {
    return 'chat';
  }

  function UTIL_normSort(value) {
    const v = String(value || '').trim().toLowerCase();
    return CFG.sorts.includes(v) ? v : UI_DEFAULTS.sort;
  }

  function UTIL_normMode(value) {
    const v = String(value || '').trim().toLowerCase();
    return CFG.uiModes.includes(v) ? v : UI_DEFAULTS.mode;
  }

  function UTIL_normTags(value) {
    const list = Array.isArray(value)
      ? value
      : String(value || '')
        .split(',')
        .map((part) => part.trim());

    const out = [];
    const seen = new Set();
    for (const raw of list) {
      const tag = UTIL_cleanLine(raw, 40).toLowerCase();
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);
      out.push(tag);
      if (out.length >= CFG.tagsMax) break;
    }
    return out;
  }

  function UTIL_mergeTags(...lists) {
    return UTIL_normTags(lists.flat());
  }

  function UTIL_normExpanded(value) {
    if (!value || typeof value !== 'object') return {};
    const out = {};
    for (const [key, flag] of Object.entries(value)) {
      const id = String(key || '').trim();
      if (!id || !flag) continue;
      out[id] = true;
    }
    return out;
  }

  function UTIL_num(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function UTIL_preview(text, maxLen = 140) {
    return UTIL_cleanLine(UTIL_cleanBlock(text), maxLen);
  }

  function UTIL_normSource(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const kindRaw = String(src.kind || 'manual').trim().toLowerCase();
    const kind =
      kindRaw === 'note' ? 'notes' :
      kindRaw === 'highlight' ? 'highlights' :
      kindRaw === 'bookmark' ? 'bookmarks' :
      kindRaw || 'manual';

    const snapshot = src.snapshot && typeof src.snapshot === 'object'
      ? {
          title: UTIL_cleanLine(src.snapshot.title || '', CFG.titleMax),
          text: UTIL_cleanBlock(src.snapshot.text || ''),
        }
      : null;

    return {
      kind,
      id: String(src.id || '').trim(),
      msgId: UTIL_normMsgId(src.msgId || ''),
      snapshot: snapshot && (snapshot.title || snapshot.text) ? snapshot : null,
    };
  }

  function ITEM_manualSort(a, b, activeOnly = false) {
    if (!activeOnly) {
      const ap = a?.pinned ? 0 : 1;
      const bp = b?.pinned ? 0 : 1;
      if (ap !== bp) return ap - bp;
    }
    const ao = UTIL_num(a?.order, Number.MAX_SAFE_INTEGER);
    const bo = UTIL_num(b?.order, Number.MAX_SAFE_INTEGER);
    if (ao !== bo) return ao - bo;
    return UTIL_num(b?.updatedAt, 0) - UTIL_num(a?.updatedAt, 0);
  }

  function ITEM_sort(items, sort = 'manual', activeOnly = false) {
    const list = Array.isArray(items) ? items.slice() : [];
    const mode = UTIL_normSort(sort);

    if (mode === 'manual') {
      list.sort((a, b) => ITEM_manualSort(a, b, activeOnly));
      return list;
    }

    list.sort((a, b) => {
      const ap = a?.pinned ? 0 : 1;
      const bp = b?.pinned ? 0 : 1;
      if (ap !== bp) return ap - bp;

      if (mode === 'title') {
        const at = String(a?.title || '').localeCompare(String(b?.title || ''));
        if (at !== 0) return at;
      }

      if (mode === 'created') {
        const delta = UTIL_num(b?.createdAt, 0) - UTIL_num(a?.createdAt, 0);
        if (delta !== 0) return delta;
      }

      if (mode === 'updated') {
        const delta = UTIL_num(b?.updatedAt, 0) - UTIL_num(a?.updatedAt, 0);
        if (delta !== 0) return delta;
      }

      return ITEM_manualSort(a, b, activeOnly);
    });

    return list;
  }

  function ITEM_matches(item, query) {
    const q = UTIL_cleanLine(query || '').toLowerCase();
    if (!q) return true;
    const bag = [
      item?.title,
      item?.text,
      Array.isArray(item?.tags) ? item.tags.join(' ') : '',
      item?.profile,
      item?.source?.kind,
      item?.source?.snapshot?.title,
      item?.source?.snapshot?.text,
    ].join('\n').toLowerCase();
    return bag.includes(q);
  }

  function ITEM_sourceKey(item) {
    const kind = String(item?.source?.kind || '').trim();
    const id = String(item?.source?.id || item?.source?.msgId || '').trim();
    return kind && id ? `${kind}:${id}` : '';
  }

  function ITEM_shouldRefreshFromSource(existing) {
    const currentTitle = UTIL_cleanLine(existing?.title || '');
    const currentText = UTIL_cleanBlock(existing?.text || '');
    const snapTitle = UTIL_cleanLine(existing?.source?.snapshot?.title || '');
    const snapText = UTIL_cleanBlock(existing?.source?.snapshot?.text || '');

    if (!currentText) return true;
    if (snapText && currentText === snapText) return true;
    if (snapTitle && currentTitle === snapTitle && snapText && currentText === snapText) return true;
    return false;
  }

  function META_read() {
    const raw = UTIL_lsGet(KEY_META);
    const meta = UTIL_safeParse(raw, {});
    return {
      version: 1,
      updatedAt: UTIL_num(meta?.updatedAt, 0),
      chats: meta?.chats && typeof meta.chats === 'object' ? { ...meta.chats } : {},
    };
  }

  function META_touch(chatId, patch = {}) {
    const id = UTIL_resolveChatId(chatId);
    const meta = META_read();
    const now = UTIL_now();
    meta.updatedAt = now;
    meta.chats[id] = {
      ...(meta.chats[id] && typeof meta.chats[id] === 'object' ? meta.chats[id] : {}),
      ...patch,
      updatedAt: now,
    };
    UTIL_lsSet(KEY_META, JSON.stringify(meta));
    return meta;
  }

  function STORE_readItems(chatId) {
    const id = UTIL_resolveChatId(chatId);
    const raw = UTIL_lsGet(KEY_ITEMS(id));
    const arr = UTIL_safeParse(raw, []);
    return Array.isArray(arr) ? arr.slice() : [];
  }

  function STORE_saveItems(chatId, items) {
    const id = UTIL_resolveChatId(chatId);
    UTIL_lsSet(KEY_ITEMS(id), JSON.stringify(Array.isArray(items) ? items : []));
    META_touch(id, { itemCount: Array.isArray(items) ? items.length : 0 });
  }

  function UI_normalize(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      mode: UTIL_normMode(src.mode),
      search: UTIL_cleanLine(src.search || '', CFG.searchMax),
      profile: UTIL_normProfile(src.profile),
      selectedId: src.selectedId ? String(src.selectedId) : null,
      expanded: UTIL_normExpanded(src.expanded),
      sort: UTIL_normSort(src.sort),
    };
  }

  function STORE_readUi(chatId) {
    const id = UTIL_resolveChatId(chatId);
    const raw = UTIL_lsGet(KEY_UI(id));
    return UI_normalize(raw ? UTIL_safeParse(raw, null) : null);
  }

  function EMIT(name, detail) {
    try { W.dispatchEvent(new CustomEvent(name, { detail })); } catch (_) {}
  }

  function EMIT_changed(chatId, extra = {}) {
    const id = UTIL_resolveChatId(chatId);
    const detail = {
      chatId: id,
      ts: UTIL_now(),
      count: STORE_readItems(id).length,
      ...extra,
    };
    EMIT(EV_CHANGED, detail);
    return detail;
  }

  function EMIT_uiChanged(chatId, ui, reason = 'ui') {
    const id = UTIL_resolveChatId(chatId);
    const detail = { chatId: id, ts: UTIL_now(), reason, ui: UI_normalize(ui) };
    EMIT(EV_UI_CHANGED, detail);
    return detail;
  }

  function STORE_saveUi(chatId, nextUi, reason = 'ui') {
    const id = UTIL_resolveChatId(chatId);
    const ui = UI_normalize(nextUi);
    UTIL_lsSet(KEY_UI(id), JSON.stringify(ui));
    META_touch(id, { profile: ui.profile, lastUiAt: UTIL_now() });
    EMIT_uiChanged(id, ui, reason);
    return ui;
  }

  function HISTORY_normalize(entry) {
    const src = entry && typeof entry === 'object' ? entry : {};
    const resolvedText = UTIL_cleanBlock(src.resolvedText || src.text || '');
    const text = UTIL_cleanBlock(src.text || resolvedText);
    const itemIds = Array.isArray(src.itemIds)
      ? Array.from(new Set(src.itemIds.map((id) => String(id || '').trim()).filter(Boolean)))
      : [];

    return {
      id: String(src.id || UTIL_cryptoId('ctxhist')).trim(),
      kind: String(src.kind || 'active').trim() || 'active',
      requestedMode: String(src.requestedMode || src.mode || 'append').trim() || 'append',
      actualMode: String(src.actualMode || src.mode || 'append').trim() || 'append',
      profile: UTIL_normProfile(src.profile),
      count: Math.max(itemIds.length, UTIL_num(src.count, 0)),
      itemIds,
      insertedAt: UTIL_num(src.insertedAt, UTIL_now()),
      preview: UTIL_preview(src.preview || resolvedText, 180),
      text,
      resolvedText,
    };
  }

  function STORE_readHistory(chatId) {
    const id = UTIL_resolveChatId(chatId);
    const raw = UTIL_lsGet(KEY_HISTORY(id));
    const list = UTIL_safeParse(raw, []);
    return Array.isArray(list)
      ? list.map((entry) => HISTORY_normalize(entry)).sort((a, b) => b.insertedAt - a.insertedAt)
      : [];
  }

  function STORE_saveHistory(chatId, entries) {
    const id = UTIL_resolveChatId(chatId);
    UTIL_lsSet(KEY_HISTORY(id), JSON.stringify(Array.isArray(entries) ? entries : []));
    META_touch(id, { historyCount: Array.isArray(entries) ? entries.length : 0, lastHistoryAt: UTIL_now() });
  }

  function HISTORY_record(chatId, entry) {
    const id = UTIL_resolveChatId(chatId);
    const next = [HISTORY_normalize(entry), ...STORE_readHistory(id)]
      .filter((row, idx, arr) => arr.findIndex((test) => test.id === row.id) === idx)
      .slice(0, CFG.historyMax);
    STORE_saveHistory(id, next);
    return next[0] || null;
  }

  function ITEM_nextOrder(items) {
    const list = Array.isArray(items) ? items : [];
    let max = 0;
    for (const item of list) {
      max = Math.max(max, UTIL_num(item?.order, 0));
    }
    return max + 1;
  }

  function ITEM_fromStore(raw, index = 0) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const text = UTIL_cleanBlock(src.text || '');
    const title = UTIL_cleanLine(src.title || '', CFG.titleMax) || UTIL_firstLine(text, CFG.titleMax);
    const createdAt = UTIL_num(src.createdAt, UTIL_now());
    const updatedAt = Math.max(createdAt, UTIL_num(src.updatedAt, createdAt));
    return {
      id: String(src.id || UTIL_cryptoId('ctxitm')).trim(),
      title,
      text,
      tags: UTIL_normTags(src.tags),
      profile: UTIL_normProfile(src.profile),
      active: src.active !== false,
      pinned: !!src.pinned,
      order: UTIL_num(src.order, index + 1),
      scope: UTIL_normScope(src.scope),
      createdAt,
      updatedAt,
      source: UTIL_normSource(src.source),
    };
  }

  function ITEM_make(raw, items) {
    const base = ITEM_fromStore(raw, Array.isArray(items) ? items.length : 0);
    if (!base.title && !base.text) return null;
    const now = UTIL_now();
    return {
      ...base,
      id: String(raw?.id || UTIL_cryptoId('ctxitm')).trim(),
      order: UTIL_num(raw?.order, ITEM_nextOrder(items)),
      createdAt: now,
      updatedAt: now,
      source: UTIL_normSource(raw?.source),
    };
  }

  function ITEM_patch(current, patch, items) {
    if (!current) return null;
    const next = ITEM_fromStore({
      ...current,
      ...patch,
      tags: patch?.tags != null ? patch.tags : current.tags,
      source: patch?.source != null ? patch.source : current.source,
      createdAt: current.createdAt,
      updatedAt: UTIL_now(),
    });
    if (!next.title && !next.text) return null;
    next.id = current.id;
    next.createdAt = current.createdAt;
    if (patch?.active === true && current.active === false && !patch?.order) {
      next.order = ITEM_nextOrder(items);
    }
    return next;
  }

  function API_list(chatId, opts = {}) {
    const id = UTIL_resolveChatId(chatId);
    const options = opts && typeof opts === 'object' ? opts : {};
    let items = STORE_readItems(id).map((item, index) => ITEM_fromStore(item, index));

    if (options.profile) {
      const profile = UTIL_normProfile(options.profile);
      items = items.filter((item) => item.profile === profile);
    }

    if (options.activeOnly) items = items.filter((item) => item.active);
    if (options.scope) items = items.filter((item) => item.scope === UTIL_normScope(options.scope));
    if (options.search) items = items.filter((item) => ITEM_matches(item, options.search));

    return ITEM_sort(items, options.sort || 'manual', !!options.activeOnly);
  }

  function API_get(chatId, id) {
    const want = String(id || '').trim();
    if (!want) return null;
    return API_list(chatId).find((item) => item.id === want) || null;
  }

  function API_add(chatId, item) {
    const id = UTIL_resolveChatId(chatId);
    const items = STORE_readItems(id).map((row, index) => ITEM_fromStore(row, index));
    const next = ITEM_make(item, items);
    if (!next) return null;

    items.push(next);
    STORE_saveItems(id, items);
    EMIT_changed(id, { reason: 'add', changedId: next.id });
    return next;
  }

  function API_update(chatId, id, patch) {
    const ctxId = UTIL_resolveChatId(chatId);
    const want = String(id || '').trim();
    if (!want) return null;

    const items = STORE_readItems(ctxId).map((row, index) => ITEM_fromStore(row, index));
    const index = items.findIndex((item) => item.id === want);
    if (index < 0) return null;

    const next = ITEM_patch(items[index], patch, items);
    if (!next) return null;

    items[index] = next;
    STORE_saveItems(ctxId, items);
    EMIT_changed(ctxId, { reason: 'update', changedId: want });
    return next;
  }

  function API_remove(chatId, id) {
    const ctxId = UTIL_resolveChatId(chatId);
    const want = String(id || '').trim();
    if (!want) return false;

    const items = STORE_readItems(ctxId).map((row, index) => ITEM_fromStore(row, index));
    const next = items.filter((item) => item.id !== want);
    if (next.length === items.length) return false;

    STORE_saveItems(ctxId, next);

    const ui = STORE_readUi(ctxId);
    if (ui.selectedId === want || ui.expanded[want]) {
      const expanded = { ...ui.expanded };
      delete expanded[want];
      STORE_saveUi(ctxId, { ...ui, selectedId: ui.selectedId === want ? null : ui.selectedId, expanded }, 'remove');
    }

    EMIT_changed(ctxId, { reason: 'remove', changedId: want });
    return true;
  }

  function API_toggleActive(chatId, id) {
    const item = API_get(chatId, id);
    if (!item) return null;
    return API_update(chatId, id, { active: !item.active });
  }

  function API_reorder(chatId, orderedIds) {
    const ctxId = UTIL_resolveChatId(chatId);
    const ids = Array.from(new Set((Array.isArray(orderedIds) ? orderedIds : []).map((id) => String(id || '').trim()).filter(Boolean)));
    if (!ids.length) return [];

    const items = STORE_readItems(ctxId).map((row, index) => ITEM_fromStore(row, index));
    const rest = ITEM_sort(items.filter((item) => !ids.includes(item.id)), 'manual');
    const nextIds = [...ids, ...rest.map((item) => item.id)];
    const rank = new Map(nextIds.map((idValue, index) => [idValue, index + 1]));
    const now = UTIL_now();

    const next = items.map((item) => {
      if (!rank.has(item.id)) return item;
      return { ...item, order: rank.get(item.id), updatedAt: now };
    });

    STORE_saveItems(ctxId, next);
    EMIT_changed(ctxId, { reason: 'reorder', orderedIds: ids });
    return API_list(ctxId, { sort: 'manual' });
  }

  function API_getUi(chatId) {
    return STORE_readUi(chatId);
  }

  function API_setUi(chatId, patch, reason = 'ui') {
    const ctxId = UTIL_resolveChatId(chatId);
    const current = STORE_readUi(ctxId);
    const next = STORE_saveUi(ctxId, { ...current, ...(patch && typeof patch === 'object' ? patch : {}) }, reason);
    return next;
  }

  function API_listHistory(chatId, opts = {}) {
    const ctxId = UTIL_resolveChatId(chatId);
    const options = opts && typeof opts === 'object' ? opts : {};
    let rows = STORE_readHistory(ctxId);

    if (options.profile) {
      const profile = UTIL_normProfile(options.profile);
      rows = rows.filter((row) => row.profile === profile);
    }

    if (options.search) {
      const q = UTIL_cleanLine(options.search).toLowerCase();
      rows = rows.filter((row) => `${row.preview}\n${row.resolvedText || row.text || ''}`.toLowerCase().includes(q));
    }

    return rows;
  }

  function API_getHistoryRow(chatId, id) {
    const ctxId = UTIL_resolveChatId(chatId);
    const want = String(id || '').trim();
    if (!want) return null;
    return STORE_readHistory(ctxId).find((row) => row.id === want) || null;
  }

  function API_clearHistory(chatId) {
    const ctxId = UTIL_resolveChatId(chatId);
    STORE_saveHistory(ctxId, []);
    EMIT_changed(ctxId, { reason: 'history:clear' });
    return true;
  }

  function TEXT_buildItem(item, opts = {}) {
    if (!item) return '';
    const body = UTIL_cleanBlock(item.text || '');
    const title = UTIL_cleanLine(item.title || '', CFG.titleMax);
    const includeTitle = opts.includeTitle !== false;
    if (!body) return title || '';
    if (!includeTitle || !title) return body;
    const first = UTIL_firstLine(body, CFG.titleMax).toLowerCase();
    if (first === title.toLowerCase()) return body;
    return `${title}\n${body}`;
  }

  function API_buildActiveText(chatId, opts = {}) {
    const ctxId = UTIL_resolveChatId(chatId);
    const ui = STORE_readUi(ctxId);
    const profile = UTIL_normProfile(opts.profile || ui.profile);
    const items = API_list(ctxId, { profile, activeOnly: true, sort: 'manual' });
    return items.map((item) => TEXT_buildItem(item, opts)).filter(Boolean).join('\n\n');
  }

  async function UTIL_copyText(text) {
    const value = String(text || '');
    if (!value) return false;

    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (_) {}

    try {
      const ta = D.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      D.body.appendChild(ta);
      ta.select();
      D.execCommand('copy');
      ta.remove();
      return true;
    } catch (_) {
      return false;
    }
  }

  function UTIL_isVisibleComposerEl(el) {
    if (!el) return false;
    const cs = W.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    return !!(el.offsetParent !== null || el.getClientRects().length);
  }

  function UTIL_pickComposerTarget() {
    const selectors = [
      '#prompt-textarea',
      '[data-testid="prompt-textarea"]',
      'form[data-type="unified-composer"] [contenteditable="true"]',
      'form.group\\/composer [contenteditable="true"]',
      'form[data-testid="composer"] [contenteditable="true"]',
      'form[action*="conversation"] [contenteditable="true"]',
      'form[data-testid="composer"] textarea',
      'form[action*="conversation"] textarea',
      '[data-composer-surface="true"] [contenteditable="true"]',
      '[role="textbox"][contenteditable="true"]',
      '[contenteditable="true"]',
      'textarea',
    ];

    for (const selector of selectors) {
      const nodes = Array.from(D.querySelectorAll(selector)).filter(UTIL_isVisibleComposerEl);
      if (nodes.length) return nodes[0];
    }

    return null;
  }

  function UTIL_setNativeTextareaValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && typeof desc.set === 'function') desc.set.call(el, value);
    else el.value = value;
  }

  function UTIL_selectAllEditable(el) {
    try {
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        el.select();
        return true;
      }
      if (el && el.isContentEditable) {
        const range = D.createRange();
        range.selectNodeContents(el);
        const sel = W.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      }
    } catch (_) {}
    return false;
  }

  function UTIL_placeCaretAtEnd(el) {
    try {
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        const len = String(el.value || '').length;
        el.setSelectionRange(len, len);
        return true;
      }
      if (el && el.isContentEditable) {
        const range = D.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = W.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      }
    } catch (_) {}
    return false;
  }

  function UTIL_insertIntoContentEditable(el, text, replace = false) {
    try {
      el.focus();
      if (replace) UTIL_selectAllEditable(el);
      else UTIL_placeCaretAtEnd(el);

      try {
        el.dispatchEvent(new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: replace ? 'insertReplacementText' : 'insertText',
          data: text,
        }));
      } catch (_) {}

      if (typeof D.execCommand === 'function' && D.execCommand('insertText', false, text)) {
        try {
          el.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            inputType: replace ? 'insertReplacementText' : 'insertText',
            data: text,
          }));
        } catch (_) {
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return true;
      }

      const sel = W.getSelection();
      if (!sel) return false;
      if (!sel.rangeCount) UTIL_placeCaretAtEnd(el);
      const range = sel.getRangeAt(0);
      if (replace) range.deleteContents();
      const node = D.createTextNode(text);
      range.insertNode(node);
      range.setStartAfter(node);
      range.setEndAfter(node);
      sel.removeAllRanges();
      sel.addRange(range);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    } catch (_) {
      return false;
    }
  }

  function UTIL_insertDirect(text, mode = 'append') {
    const value = String(text || '');
    if (!value) return false;

    const replace = mode === 'replace';
    const el = UTIL_pickComposerTarget();
    if (!el) return false;

    try {
      el.focus();

      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        const current = String(el.value || '');
        const next = replace ? value : (current ? `${current}\n${value}` : value);
        UTIL_setNativeTextareaValue(el, next);
        try {
          el.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            inputType: replace ? 'insertReplacementText' : 'insertText',
            data: value,
          }));
        } catch (_) {
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
        UTIL_placeCaretAtEnd(el);
        return true;
      }

      if (el.isContentEditable) {
        const chunk = replace ? value : (UTIL_cleanBlock(el.innerText || '') ? `\n${value}` : value);
        return UTIL_insertIntoContentEditable(el, chunk, replace);
      }
    } catch (_) {}

    return false;
  }

  async function UTIL_insertText(text, mode = 'append') {
    const value = UTIL_cleanBlock(text);
    if (!value) return { ok: false, reason: 'empty', actualMode: mode, via: 'none' };

    if (mode === 'copy') {
      const ok = await UTIL_copyText(value);
      return { ok, reason: ok ? 'copied' : 'copy-failed', actualMode: 'copy', via: 'clipboard' };
    }

    try {
      const shared = W.H2O?.Workspace?.insertTextIntoComposer;
      if (typeof shared === 'function' && shared(value, { replace: mode === 'replace' })) {
        return { ok: true, reason: 'inserted', actualMode: mode, via: 'workspace' };
      }
    } catch (_) {}

    if (UTIL_insertDirect(value, mode)) {
      return { ok: true, reason: 'inserted', actualMode: mode, via: 'dom' };
    }

    const copied = await UTIL_copyText(value);
    return {
      ok: copied,
      reason: copied ? 'copied-fallback' : 'copy-failed',
      actualMode: copied ? 'copy' : mode,
      via: 'clipboard',
      fallback: true,
    };
  }

  function SOURCE_getNotesApi() {
    return W.H2ONotes || W.HoNotes || null;
  }

  function SOURCE_getInlineApi() {
    return W.H2OInline || W.H2O?.inline || W.HoInline || null;
  }

  function SOURCE_getBookmarksApi() {
    return W.H2OBookmarks || W.HoBookmarks || null;
  }

  function PROMOTE_collect(kind, source = {}) {
    const ids = Array.isArray(source.ids)
      ? new Set(source.ids.map((id) => String(id || '').trim()).filter(Boolean))
      : null;

    if (kind === 'notes') {
      const list = SOURCE_getNotesApi()?.list?.() || [];
      return list.filter((row) => !ids || ids.has(String(row?.id || '').trim()));
    }

    if (kind === 'highlights') {
      const list = SOURCE_getInlineApi()?.listEntries?.({
        includeEmptyText: false,
        maxTextLen: 500,
        maxContextLen: 900,
      }) || [];
      return list.filter((row) => !ids || ids.has(String(row?.hlId || '').trim()));
    }

    if (kind === 'bookmarks') {
      const list = SOURCE_getBookmarksApi()?.list?.() || [];
      return list.filter((row) => {
        if (!ids) return true;
        const msgId = UTIL_normMsgId(row?.msgId || '');
        return ids.has(msgId) || ids.has(String(row?.msgId || '').trim());
      });
    }

    return [];
  }

  function PROMOTE_fromNote(note, profile) {
    const title = UTIL_cleanLine(note?.title || '', CFG.titleMax) || UTIL_firstLine(note?.text || '', CFG.titleMax) || 'Context';
    const text = UTIL_cleanBlock(note?.text || '');
    if (!title && !text) return null;
    return {
      title,
      text,
      tags: UTIL_normTags(note?.tags),
      profile,
      active: true,
      pinned: !!note?.pinned,
      scope: 'chat',
      source: {
        kind: 'notes',
        id: String(note?.id || '').trim(),
        msgId: UTIL_normMsgId(note?.source?.msgId || note?.source?.id || ''),
        snapshot: { title, text },
      },
    };
  }

  function PROMOTE_fromHighlight(entry, profile) {
    const text = UTIL_cleanBlock(entry?.context || entry?.text || '');
    const title = UTIL_firstLine(entry?.text || entry?.context || `Highlight ${entry?.answerNumber || ''}`, CFG.titleMax) || 'Highlight';
    if (!title && !text) return null;
    return {
      title,
      text,
      tags: UTIL_normTags(entry?.colorName ? [entry.colorName] : []),
      profile,
      active: true,
      pinned: false,
      scope: 'chat',
      source: {
        kind: 'highlights',
        id: String(entry?.hlId || '').trim(),
        msgId: UTIL_normMsgId(entry?.answerId || entry?.turnId || ''),
        snapshot: { title, text },
      },
    };
  }

  function PROMOTE_fromBookmark(entry, profile) {
    const text = UTIL_cleanBlock(entry?.snapText || entry?.snippet || '');
    const title = UTIL_cleanLine(entry?.title || '', CFG.titleMax) || UTIL_firstLine(text, CFG.titleMax) || 'Bookmark';
    if (!title && !text) return null;
    return {
      title,
      text,
      tags: [],
      profile,
      active: true,
      pinned: false,
      scope: 'chat',
      source: {
        kind: 'bookmarks',
        id: UTIL_normMsgId(entry?.msgId || ''),
        msgId: UTIL_normMsgId(entry?.msgId || ''),
        snapshot: { title, text },
      },
    };
  }

  function PROMOTE_makeCandidate(kind, row, profile) {
    if (kind === 'notes') return PROMOTE_fromNote(row, profile);
    if (kind === 'highlights') return PROMOTE_fromHighlight(row, profile);
    if (kind === 'bookmarks') return PROMOTE_fromBookmark(row, profile);
    return null;
  }

  function API_promoteFromSource(chatId, source = {}) {
    const ctxId = UTIL_resolveChatId(chatId);
    const kindRaw = String(source?.kind || '').trim().toLowerCase();
    const kind =
      kindRaw === 'note' ? 'notes' :
      kindRaw === 'highlight' ? 'highlights' :
      kindRaw === 'bookmark' ? 'bookmarks' :
      kindRaw;

    if (!['notes', 'highlights', 'bookmarks'].includes(kind)) {
      return { ok: false, reason: 'unsupported-source', chatId: ctxId, kind };
    }

    const ui = STORE_readUi(ctxId);
    const profile = UTIL_normProfile(source?.profile || ui.profile);
    const rows = PROMOTE_collect(kind, source);
    const items = STORE_readItems(ctxId).map((row, index) => ITEM_fromStore(row, index));
    const bySource = new Map(items.map((item) => [ITEM_sourceKey(item), item]));
    const added = [];
    const updated = [];

    for (const row of rows) {
      const candidate = PROMOTE_makeCandidate(kind, row, profile);
      if (!candidate) continue;

      const key = ITEM_sourceKey(candidate);
      const existing = key ? bySource.get(key) || null : null;
      if (!existing) {
        const next = ITEM_make(candidate, items);
        if (!next) continue;
        items.push(next);
        if (key) bySource.set(key, next);
        added.push(next);
        continue;
      }

      const shouldRefresh = source?.refreshText === true || ITEM_shouldRefreshFromSource(existing);
      const patch = {
        source: candidate.source,
        profile,
        active: source?.activate === false ? existing.active : true,
        pinned: source?.pin === true ? true : existing.pinned,
      };

      if (shouldRefresh) {
        patch.title = candidate.title;
        patch.text = candidate.text;
        patch.tags = UTIL_mergeTags(existing.tags, candidate.tags);
      }

      const next = ITEM_patch(existing, patch, items);
      if (!next) continue;
      const index = items.findIndex((item) => item.id === existing.id);
      if (index >= 0) items[index] = next;
      bySource.set(key, next);
      updated.push(next);
    }

    if (!added.length && !updated.length) {
      return { ok: true, chatId: ctxId, kind, added: 0, updated: 0, items: [] };
    }

    STORE_saveItems(ctxId, items);

    const detail = {
      chatId: ctxId,
      ts: UTIL_now(),
      kind,
      added: added.length,
      updated: updated.length,
      itemIds: [...added, ...updated].map((item) => item.id),
      profile,
    };

    EMIT_changed(ctxId, { reason: 'promote', kind, promoted: detail.itemIds });
    EMIT(EV_PROMOTED, detail);

    return { ok: true, ...detail, items: [...added, ...updated] };
  }

  function API_duplicate(chatId, id) {
    const item = API_get(chatId, id);
    if (!item) return null;
    return API_add(chatId, {
      ...item,
      id: '',
      title: item.title ? `${item.title} Copy` : 'Context Copy',
      source: { kind: 'manual', id: '', msgId: '', snapshot: null },
      active: item.active,
      pinned: false,
    });
  }

  async function API_insertItem(chatId, id, mode = 'append', opts = {}) {
    const ctxId = UTIL_resolveChatId(chatId);
    const item = API_get(ctxId, id);
    if (!item) return { ok: false, reason: 'missing-item', chatId: ctxId };

    const text = TEXT_buildItem(item, opts);
    if (!text) return { ok: false, reason: 'empty-item', chatId: ctxId, itemId: item.id };

    const result = await UTIL_insertText(text, mode);
    if (!result.ok) return { ...result, chatId: ctxId, itemId: item.id };

    HISTORY_record(ctxId, {
      kind: 'item',
      requestedMode: mode,
      actualMode: result.actualMode,
      profile: item.profile,
      count: 1,
      itemIds: [item.id],
      insertedAt: UTIL_now(),
      preview: text,
      text,
      resolvedText: text,
    });

    const detail = {
      chatId: ctxId,
      ts: UTIL_now(),
      requestedMode: mode,
      actualMode: result.actualMode,
      via: result.via,
      kind: 'item',
      itemIds: [item.id],
      profile: item.profile,
      count: 1,
    };
    EMIT(EV_INSERTED, detail);
    META_touch(ctxId, { lastInsertAt: detail.ts });

    return { ...result, ...detail, text };
  }

  async function API_insertActive(chatId, mode = 'append', opts = {}) {
    const ctxId = UTIL_resolveChatId(chatId);
    const ui = STORE_readUi(ctxId);
    const profile = UTIL_normProfile(opts.profile || ui.profile);
    const items = API_list(ctxId, { profile, activeOnly: true, sort: 'manual' });
    const text = API_buildActiveText(ctxId, { ...opts, profile });

    if (!text) {
      return { ok: false, reason: 'empty-active', chatId: ctxId, profile, count: 0, itemIds: [] };
    }

    const result = await UTIL_insertText(text, mode);
    if (!result.ok) return { ...result, chatId: ctxId, profile, count: items.length, itemIds: items.map((item) => item.id) };

    HISTORY_record(ctxId, {
      kind: 'active',
      requestedMode: mode,
      actualMode: result.actualMode,
      profile,
      count: items.length,
      itemIds: items.map((item) => item.id),
      insertedAt: UTIL_now(),
      preview: text,
      text,
      resolvedText: text,
    });

    const detail = {
      chatId: ctxId,
      ts: UTIL_now(),
      requestedMode: mode,
      actualMode: result.actualMode,
      via: result.via,
      kind: 'active',
      itemIds: items.map((item) => item.id),
      profile,
      count: items.length,
    };
    EMIT(EV_INSERTED, detail);
    META_touch(ctxId, { lastInsertAt: detail.ts });

    return { ...result, ...detail, text };
  }

  async function API_reinsertHistory(chatId, historyId, mode) {
    const ctxId = UTIL_resolveChatId(chatId);
    const row = API_getHistoryRow(ctxId, historyId);
    if (!row) return { ok: false, reason: 'missing-history', chatId: ctxId, historyId: String(historyId || '') };

    const text = UTIL_cleanBlock(row.resolvedText || row.text || '');
    if (!text) return { ok: false, reason: 'empty-history', chatId: ctxId, historyId: row.id };

    const requestedMode = String(mode || row.actualMode || row.requestedMode || 'append').trim() || 'append';
    const result = await UTIL_insertText(text, requestedMode);
    if (!result.ok) return { ...result, chatId: ctxId, historyId: row.id, itemIds: row.itemIds.slice(), profile: row.profile };

    HISTORY_record(ctxId, {
      kind: row.kind || 'active',
      requestedMode,
      actualMode: result.actualMode,
      profile: row.profile,
      count: row.count,
      itemIds: row.itemIds.slice(),
      insertedAt: UTIL_now(),
      preview: text,
      text,
      resolvedText: text,
    });

    const detail = {
      chatId: ctxId,
      ts: UTIL_now(),
      requestedMode,
      actualMode: result.actualMode,
      via: result.via,
      kind: row.kind || 'active',
      itemIds: row.itemIds.slice(),
      profile: row.profile,
      count: row.count,
      historyId: row.id,
    };
    EMIT(EV_INSERTED, detail);
    META_touch(ctxId, { lastInsertAt: detail.ts });

    return { ...result, ...detail, text };
  }

  function SOURCE_findMessageEl(msgId) {
    const id = UTIL_normMsgId(msgId);
    if (!id) return null;

    return (
      W.H2O?.msg?.findEl?.(id) ||
      SOURCE_getBookmarksApi()?.findMessageEl?.(id) ||
      D.querySelector(`[data-message-id="${CSS.escape(id)}"]`) ||
      D.querySelector(`[data-testid="conversation-turn-${CSS.escape(id)}"]`) ||
      D.getElementById(`conversation-turn-${id}`) ||
      null
    );
  }

  function SOURCE_requestMount(msgId) {
    const id = UTIL_normMsgId(msgId);
    if (!id) return false;

    try {
      const helper = W.H2O?.DP?.dckpnl?.api?.getContract?.()?.helpers?.requestRemountByMsgId;
      if (typeof helper === 'function') {
        helper(id);
        return true;
      }
    } catch (_) {}

    try {
      if (W.H2O?.msg?.ensureMountedById?.(id) || W.H2O?.msg?.requestMountById?.(id)) return true;
    } catch (_) {}

    try {
      W.dispatchEvent(new CustomEvent('h2o:message:mount:request', { detail: { msgId: id } }));
      return true;
    } catch (_) {
      return false;
    }
  }

  function SOURCE_ensureFlashStyle() {
    const styleId = 'cgxui-context-engine-flash-style';
    if (D.getElementById(styleId)) return;
    const style = D.createElement('style');
    style.id = styleId;
    style.textContent = `
      [data-h2o-context-flash="1"]{
        outline: 2px solid rgba(245,158,11,.95) !important;
        outline-offset: 3px !important;
        box-shadow: 0 0 0 4px rgba(245,158,11,.22) !important;
        transition: outline-color .15s ease, box-shadow .2s ease;
      }
      mark[data-h2o-context-flash="1"]{
        box-shadow: 0 0 0 3px rgba(245,158,11,.25);
      }
    `;
    D.head.appendChild(style);
  }

  function SOURCE_flash(el) {
    if (!el) return;
    SOURCE_ensureFlashStyle();
    try { el.setAttribute('data-h2o-context-flash', '1'); } catch (_) {}
    setTimeout(() => {
      try { el.removeAttribute('data-h2o-context-flash'); } catch (_) {}
    }, CFG.flashMs);
  }

  function SOURCE_findHighlightMark(item) {
    const source = item?.source || {};
    const msgId = SOURCE_resolveMsgId(item);
    const msgEl = SOURCE_findMessageEl(msgId);
    if (!msgEl) return null;

    const marks = Array.from(msgEl.querySelectorAll('mark[data-highlight-id], mark[data-h2o-hl-id], mark[class*="inline-hl"], mark.cgxui-inhl-inline-hl'));
    if (!marks.length) return null;

    const hlId = String(source.id || '').trim();
    if (hlId) {
      const exact = marks.find((mark) =>
        String(mark.getAttribute('data-highlight-id') || '').trim() === hlId ||
        String(mark.getAttribute('data-h2o-hl-id') || '').trim() === hlId
      );
      if (exact) return exact;
    }

    const want = UTIL_cleanBlock(source?.snapshot?.text || item?.text || '');
    if (want) {
      const exactText = marks.find((mark) => UTIL_cleanBlock(mark.textContent || '') === want);
      if (exactText) return exactText;
      const partial = marks.find((mark) => {
        const text = UTIL_cleanBlock(mark.textContent || '');
        return text && (want.includes(text) || text.includes(want));
      });
      if (partial) return partial;
    }

    return marks[0] || null;
  }

  function SOURCE_resolveMsgId(item) {
    const source = item?.source || {};
    const direct = UTIL_normMsgId(source.msgId || '');
    if (direct) return direct;

    if (source.kind === 'notes') {
      const notes = SOURCE_getNotesApi()?.list?.() || [];
      const note = notes.find((row) => String(row?.id || '').trim() === String(source.id || '').trim());
      return UTIL_normMsgId(note?.source?.msgId || note?.source?.id || '');
    }

    if (source.kind === 'highlights') {
      const entry = (SOURCE_getInlineApi()?.listEntries?.({
        includeEmptyText: true,
        maxTextLen: 500,
        maxContextLen: 900,
      }) || []).find((row) => String(row?.hlId || '').trim() === String(source.id || '').trim());
      return UTIL_normMsgId(entry?.answerId || entry?.turnId || '');
    }

    if (source.kind === 'bookmarks') {
      const row = (SOURCE_getBookmarksApi()?.list?.() || []).find((entry) => {
        const msgId = UTIL_normMsgId(entry?.msgId || '');
        return msgId === UTIL_normMsgId(source.id || '');
      });
      return UTIL_normMsgId(row?.msgId || source.id || '');
    }

    return '';
  }

  function SOURCE_tryLocate(item) {
    const msgId = SOURCE_resolveMsgId(item);
    if (!msgId) return null;

    if (item?.source?.kind === 'highlights') {
      const mark = SOURCE_findHighlightMark(item);
      if (mark) return { node: mark, type: 'highlight', msgId };
    }

    const msgEl = SOURCE_findMessageEl(msgId);
    if (msgEl) return { node: msgEl, type: 'message', msgId };
    return null;
  }

  async function API_jumpToSource(chatId, id) {
    const ctxId = UTIL_resolveChatId(chatId);
    const item = API_get(ctxId, id);
    if (!item) return false;

    const msgId = SOURCE_resolveMsgId(item);
    if (!msgId) return false;

    const attempt = () => {
      const found = SOURCE_tryLocate(item);
      if (!found?.node) return false;
      try { found.node.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
      SOURCE_flash(found.node);
      return true;
    };

    if (attempt()) return true;

    try {
      await W.H2O_Pagination?.ensureVisibleById?.(msgId, {
        reason: 'context:jump',
        restoreAnchor: false,
        timeoutMs: 1400,
      });
    } catch (_) {}

    SOURCE_requestMount(msgId);

    for (let i = 0; i < CFG.remountRetries; i += 1) {
      await UTIL_wait(CFG.remountRetryMs);
      if (attempt()) return true;
    }

    return false;
  }

  function API_export(chatId) {
    const ctxId = UTIL_resolveChatId(chatId);
    return JSON.stringify({
      chatId: ctxId,
      ui: STORE_readUi(ctxId),
      items: API_list(ctxId),
      history: STORE_readHistory(ctxId),
      exportedAt: UTIL_now(),
      version: CFG.exportVersion,
    }, null, 2);
  }

  function API_openDock() {
    const dockApi = W.H2O?.DP?.dckpnl?.api || null;
    if (!dockApi?.setView || !dockApi?.open) return false;

    try { dockApi.ensurePanel?.(); } catch (_) {}

    try {
      dockApi.setView('context');
      dockApi.open();
      dockApi.requestRender?.();
      return true;
    } catch (_) {
      return false;
    }
  }

  function CORE_syncChat() {
    const next = UTIL_getChatId();
    if (next === S.chatId) return;
    S.chatId = next;
    DIAG('chat:sync', { chatId: next });
    EMIT_changed(next, { reason: 'chat:changed' });
  }

  function CORE_hasSourceKind(chatId, kind) {
    return API_list(chatId).some((item) => item?.source?.kind === kind);
  }

  function CORE_hasSourceMsg(chatId, msgId) {
    const want = UTIL_normMsgId(msgId);
    if (!want) return false;
    return API_list(chatId).some((item) => SOURCE_resolveMsgId(item) === want);
  }

  function CORE_bindRuntime() {
    S.onPop = () => CORE_syncChat();
    W.addEventListener('popstate', S.onPop, true);

    if (typeof MutationObserver === 'function') {
      S.mo = new MutationObserver(() => CORE_syncChat());
      S.mo.observe(D.documentElement, { childList: true, subtree: CFG.moObserveSubtree });
    }

    const onNotes = (ev) => {
      const detail = ev?.detail || {};
      const chatId = UTIL_resolveChatId(detail.chatId || S.chatId);
      if (CORE_hasSourceKind(chatId, 'notes')) EMIT_changed(chatId, { reason: 'source:notes', external: true });
    };

    const onInline = (ev) => {
      const detail = ev?.detail || {};
      const chatId = UTIL_resolveChatId(detail.chatId || S.chatId);
      if (CORE_hasSourceKind(chatId, 'highlights')) EMIT_changed(chatId, { reason: 'source:highlights', external: true });
    };

    const onRemounted = (ev) => {
      const detail = ev?.detail || {};
      const chatId = UTIL_resolveChatId(detail.chatId || S.chatId);
      const msgId = UTIL_normMsgId(detail.msgId || detail.id || '');
      if (msgId && CORE_hasSourceMsg(chatId, msgId)) EMIT_changed(chatId, { reason: 'source:remounted', external: true, msgId });
    };

    W.addEventListener(EV_NOTES_CHANGED, onNotes, true);
    W.addEventListener(EV_NOTES_CHANGED_ALT, onNotes, true);
    W.addEventListener(EV_INLINE_CHANGED, onInline, true);
    W.addEventListener(EV_INLINE_CHANGED_EVT, onInline, true);
    W.addEventListener(EV_MSG_REMOUNTED, onRemounted, true);
    W.addEventListener(EV_MSG_REMOUNTED_EVT, onRemounted, true);
  }

  function CORE_installApi() {
    const API = {
      chatId: () => UTIL_resolveChatId(),
      keyMeta: () => KEY_META,
      keyItems: (chatId) => KEY_ITEMS(UTIL_resolveChatId(chatId)),
      keyUi: (chatId) => KEY_UI(UTIL_resolveChatId(chatId)),
      keyHistory: (chatId) => KEY_HISTORY(UTIL_resolveChatId(chatId)),

      list: API_list,
      get: API_get,
      add: API_add,
      update: API_update,
      remove: API_remove,
      toggleActive: API_toggleActive,
      reorder: API_reorder,
      promoteFromSource: API_promoteFromSource,
      buildActiveText: API_buildActiveText,
      insertActive: API_insertActive,
      jumpToSource: API_jumpToSource,

      getUi: API_getUi,
      setUi: API_setUi,
      listHistory: API_listHistory,
      clearHistory: API_clearHistory,
      insertItem: API_insertItem,
      duplicate: API_duplicate,
      reinsertHistory: API_reinsertHistory,
      exportJSON: API_export,
      openDock: API_openDock,
    };

    W.H2O_Context = Object.assign(W.H2O_Context || {}, API);
    H2O.Context = Object.assign(H2O.Context || {}, W.H2O_Context);
  }

  function CORE_boot() {
    if (S.booted) return;
    S.booted = true;

    try {
      VAULT.diag.bootCount += 1;
      VAULT.diag.lastBootAt = UTIL_now();

      S.chatId = UTIL_getChatId();
      CORE_installApi();
      CORE_bindRuntime();
      META_touch(S.chatId, { profile: STORE_readUi(S.chatId).profile });
      EMIT_changed(S.chatId, { reason: 'boot' });
      DIAG('boot:done', { chatId: S.chatId });
    } catch (err) {
      VAULT.diag.lastError = String(err?.stack || err || '');
      DIAG('boot:crash', VAULT.diag.lastError);
      throw err;
    }
  }

  CORE_boot();
})();
