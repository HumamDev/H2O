// ==UserScript==
// @h2o-id             3v1a.navigator.engine
// @name               3V1a.🟧🧭 Navigator Engine 🧭
// @namespace          H2O.Premium.CGX.navigator.engine
// @author             OpenAI
// @version            1.0.0
// @description        Dock Navigator engine: per-chat state, Q→A structure, badges, filtering, jump/remount, pins, aliases.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const H2O = (W.H2O = W.H2O || {});
  H2O.NV = H2O.NV || {};
  const MOD = H2O.NV;

  const TOK = 'VE';
  const PID = 'nvgngn';
  const SUITE = 'prm';
  const HOST = 'cgx';
  const NS = `h2o:${SUITE}:${HOST}:${PID}`;
  const KEY_BOOT = `${NS}:booted`;
  const KEY_STATE_PREFIX = `${NS}:state:navigator:v1`;

  const EV_CHANGED = 'h2o:navigator:changed';
  const EV_JUMP = 'h2o:navigator:jump';
  const EV_PINNED = 'h2o:navigator:pinned';
  const EV_RENAMED = 'h2o:navigator:renamed';

  const UPSTREAM_EVENTS = [
    'evt:h2o:core:index:updated',
    'evt:h2o:core:turn:updated',
    'evt:h2o:inline:changed',
    'evt:h2o:message:remounted',
    'evt:h2o:bookmarks:changed',
    'evt:h2o:notes:changed',
    'h2o-bookmarks:changed',
    'h2o-notes:changed',
    'h2o:inline:changed',
    'h2o:message:remounted'
  ];

  const DEFAULT_STATE = Object.freeze({
    version: 1,
    mode: 'all',
    filter: '',
    filterMode: 'highlight',
    fuzzy: true,
    selectedNodeId: '',
    pins: [],
    aliases: {},
    collapsed: {}
  });

  const S = MOD.state = MOD.state || {
    booted: false,
    chatId: '',
    refreshScheduled: false,
    lastNodes: [],
    listeners: new Set(),
    onEvents: [],
  };

  function now() { return Date.now(); }
  function txt(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
  function normalizeMsgId(v) {
    const fn = W.H2O?.msg?.normalizeId;
    if (typeof fn === 'function') return String(fn(v) || '').trim();
    return String(v || '').replace(/^conversation-turn-/, '').trim();
  }
  function getChatId() {
    const fn = W.H2O?.util?.getChatId;
    if (typeof fn === 'function') {
      const v = fn();
      if (v) return String(v);
    }
    const m = String(location.pathname || '').match(/\/c\/([a-z0-9-]+)/i);
    return m ? String(m[1]) : 'unknown';
  }
  function keyForChat(chatId) { return `${KEY_STATE_PREFIX}:${String(chatId || 'unknown')}`; }
  function parseJSON(s, fb) {
    try { return JSON.parse(s); } catch { return fb; }
  }
  function loadState(chatId = getChatId()) {
    const raw = localStorage.getItem(keyForChat(chatId));
    const got = parseJSON(raw, null);
    return { ...DEFAULT_STATE, ...(got && typeof got === 'object' ? got : {}) };
  }
  function saveState(next, chatId = getChatId()) {
    const st = { ...DEFAULT_STATE, ...(next && typeof next === 'object' ? next : {}) };
    localStorage.setItem(keyForChat(chatId), JSON.stringify(st));
    return st;
  }
  function patchState(patch, chatId = getChatId(), reason = 'state') {
    const cur = loadState(chatId);
    const next = saveState({ ...cur, ...(patch || {}) }, chatId);
    emitChanged(reason, { chatId, patch: patch || {} });
    return next;
  }
  function emit(name, detail) {
    try { W.dispatchEvent(new CustomEvent(name, { detail })); } catch {}
    try { H2O.events?.emit?.(name, detail); } catch {}
  }
  function emitChanged(reason = 'refresh', extra = {}) {
    const detail = { chatId: getChatId(), reason, ts: now(), ...extra };
    emit(EV_CHANGED, detail);
    for (const fn of Array.from(S.listeners)) {
      try { fn(detail); } catch {}
    }
  }
  function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    S.listeners.add(fn);
    return () => S.listeners.delete(fn);
  }

  function getDockApi() {
    return H2O?.DP?.dckpnl?.api || H2O?.Dock || H2O?.PanelSide || null;
  }
  function getDockContract() {
    const api = getDockApi();
    try { return api?.getContract?.() || null; } catch { return null; }
  }

  function getTurnsFromCore() {
    const runtimeTurns = W.H2O?.turnRuntime?.listTurns?.();
    if (Array.isArray(runtimeTurns) && runtimeTurns.length) return runtimeTurns;

    const turns = W.H2O?.turn?.getTurns?.();
    if (Array.isArray(turns) && turns.length) return turns;
    return [];
  }

  function summarizeTurnText(turn) {
    const q = txt(turn?.qEl?.textContent || '');
    const a = txt(turn?.primaryAEl?.textContent || turn?.answers?.[turn?.answers?.length - 1]?.el?.textContent || '');
    return {
      questionText: q,
      answerText: a,
      questionTitle: q ? q.slice(0, 120) : `Question ${turn?.idx || ''}`,
      answerTitle: a ? a.slice(0, 120) : `Answer ${turn?.idx || ''}`,
    };
  }

  function getAllHighlights() {
    try { return Array.isArray(W.H2O?.inline?.listEntries?.()) ? W.H2O.inline.listEntries() : []; } catch { return []; }
  }
  function getAllBookmarks() {
    try { return Array.isArray(W.H2OBookmarks?.getAll?.()) ? W.H2OBookmarks.getAll() : []; } catch { return []; }
  }
  function getAllNotes() {
    try { return Array.isArray(W.H2ONotes?.list?.()) ? W.H2ONotes.list() : []; } catch { return []; }
  }

  function countAttachmentsOnEl(rootEl) {
    if (!rootEl || !(rootEl instanceof Element)) return 0;
    const names = new Set();
    const imgs = rootEl.querySelectorAll('img');
    imgs.forEach((img) => {
      const src = String(img.currentSrc || img.src || '').trim();
      if (!src || src.startsWith('data:')) return;
      names.add(`img:${src}`);
    });
    const links = rootEl.querySelectorAll('a[href]');
    links.forEach((a) => {
      const href = String(a.href || '').trim();
      if (!href) return;
      if (/\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|png|jpe?g|webp|gif|mp3|mp4|mov|csv|txt|md|json|js|ts|css|html|user\.js)(\b|$)/i.test(href) || /\/(download|file|files|attachments?)\b/i.test(href)) {
        names.add(`href:${href}`);
      }
    });
    return names.size;
  }

  function buildBadgeMap(turns) {
    const byTurnId = new Map();
    for (const t of turns) byTurnId.set(String(t.turnId || ''), { h: 0, b: 0, n: 0, a: 0 });

    const hl = getAllHighlights();
    for (const entry of hl) {
      const tid = String(entry?.turnId || '').trim();
      if (!tid) continue;
      const row = byTurnId.get(tid);
      if (row) row.h += 1;
    }

    const turnsByPrimaryAId = new Map();
    const turnsByQId = new Map();
    for (const t of turns) {
      const pid = normalizeMsgId(t?.primaryAId || '');
      const qid = normalizeMsgId(t?.qId || '');
      if (pid) turnsByPrimaryAId.set(pid, t.turnId);
      if (qid) turnsByQId.set(qid, t.turnId);
      for (const a of Array.isArray(t?.answers) ? t.answers : []) {
        const aid = normalizeMsgId(a?.id || '');
        if (aid) turnsByPrimaryAId.set(aid, t.turnId);
      }
    }

    const bm = getAllBookmarks();
    for (const b of bm) {
      const key = normalizeMsgId(b?.primaryAId || b?.msgId || '');
      if (!key) continue;
      const tid = turnsByPrimaryAId.get(key);
      if (!tid) continue;
      const row = byTurnId.get(tid);
      if (row) row.b += 1;
    }

    const notes = getAllNotes();
    for (const n of notes) {
      const src = n?.source || null;
      const key = normalizeMsgId(src?.messageUid || src?.msgId || src?.messageId || src?.turnId || '');
      if (!key) continue;
      const tid = key.startsWith('turn:') ? key : (turnsByPrimaryAId.get(key) || turnsByQId.get(key) || '');
      if (!tid) continue;
      const row = byTurnId.get(tid);
      if (row) row.n += 1;
    }

    for (const t of turns) {
      const row = byTurnId.get(String(t.turnId || ''));
      if (!row) continue;
      row.a = countAttachmentsOnEl(t.qEl) + (Array.isArray(t.answers) ? t.answers.reduce((sum, a) => sum + countAttachmentsOnEl(a?.el), 0) : 0);
    }

    return byTurnId;
  }

  function makeQuestionNode(turn, st, badges) {
    const texts = summarizeTurnText(turn);
    const alias = st.aliases?.[turn.turnId] || '';
    const id = `q:${turn.turnId}`;
    return {
      id,
      kind: 'question',
      turnId: turn.turnId,
      qId: normalizeMsgId(turn.qId || ''),
      primaryAId: normalizeMsgId(turn.primaryAId || ''),
      turnIndex: Number(turn.idx || 0),
      title: alias || texts.questionTitle,
      rawText: texts.questionText,
      badges,
      pinned: !!st.pins?.some?.((p) => p.turnId === turn.turnId && p.kind === 'question'),
      collapsed: !!st.collapsed?.[turn.turnId],
      answers: [],
    };
  }

  function makeAnswerNode(turn, answer, idx, st, badges) {
    const alias = st.aliases?.[`${turn.turnId}::a:${answer.id}`] || st.aliases?.[turn.turnId] || '';
    const text = txt(answer?.el?.textContent || '');
    return {
      id: `a:${turn.turnId}:${idx + 1}`,
      kind: 'answer',
      turnId: turn.turnId,
      qId: normalizeMsgId(turn.qId || ''),
      answerId: normalizeMsgId(answer?.id || ''),
      primaryAId: normalizeMsgId(turn.primaryAId || answer?.id || ''),
      turnIndex: Number(turn.idx || 0),
      answerIndex: idx,
      title: alias || (text ? text.slice(0, 120) : `Answer ${turn.idx}`),
      rawText: text,
      badges,
      pinned: !!st.pins?.some?.((p) => p.turnId === turn.turnId && p.kind === 'answer' && (!p.answerId || p.answerId === normalizeMsgId(answer?.id || ''))),
      parentId: `q:${turn.turnId}`,
    };
  }

  function buildAllNodes() {
    const turns = getTurnsFromCore();
    const st = loadState();
    const badgeMap = buildBadgeMap(turns);
    const qNodes = [];
    const aNodes = [];
    const pinned = [];

    for (const turn of turns) {
      const badges = badgeMap.get(String(turn.turnId || '')) || { h: 0, b: 0, n: 0, a: 0 };
      const qNode = makeQuestionNode(turn, st, { ...badges });
      const answers = Array.isArray(turn.answers) ? turn.answers : [];
      qNode.answers = answers.map((a, i) => makeAnswerNode(turn, a, i, st, { ...badges }));
      qNodes.push(qNode);
      aNodes.push(...qNode.answers);
      if (qNode.pinned) pinned.push(qNode);
      qNode.answers.forEach((a) => { if (a.pinned) pinned.push(a); });
    }

    const pinOrder = new Map((st.pins || []).map((p, i) => [`${p.kind}:${p.turnId}:${p.answerId || ''}`, Number(p.order ?? i)]));
    pinned.sort((a, b) => {
      const ak = `${a.kind}:${a.turnId}:${a.answerId || ''}`;
      const bk = `${b.kind}:${b.turnId}:${b.answerId || ''}`;
      return (pinOrder.get(ak) ?? 999999) - (pinOrder.get(bk) ?? 999999);
    });

    return { turns, qNodes, aNodes, pinned, state: st };
  }

  function fuzzyIncludes(haystack, needle) {
    const h = txt(haystack).toLowerCase();
    const n = txt(needle).toLowerCase();
    if (!n) return true;
    let pos = 0;
    for (const ch of n) {
      pos = h.indexOf(ch, pos);
      if (pos < 0) return false;
      pos += 1;
    }
    return true;
  }
  function exactIncludes(haystack, needle) {
    const h = txt(haystack).toLowerCase();
    const n = txt(needle).toLowerCase();
    return !n || h.includes(n);
  }
  function matchNode(node, filter, fuzzy) {
    const target = `${node.title || ''} ${node.rawText || ''}`;
    return fuzzy ? fuzzyIncludes(target, filter) : exactIncludes(target, filter);
  }

  function listNodes(options = {}) {
    const built = buildAllNodes();
    const st = built.state;
    const mode = String(options.mode || st.mode || 'all');
    const filter = String(options.filter ?? st.filter ?? '').trim();
    const fuzzy = options.fuzzy != null ? !!options.fuzzy : !!st.fuzzy;

    let out = [];
    if (mode === 'questions') {
      out = built.qNodes.filter((n) => matchNode(n, filter, fuzzy));
    } else if (mode === 'answers') {
      out = built.aNodes.filter((n) => matchNode(n, filter, fuzzy));
    } else if (mode === 'pinned') {
      out = built.pinned.filter((n) => matchNode(n, filter, fuzzy));
    } else {
      out = built.qNodes
        .map((q) => {
          const qMatch = matchNode(q, filter, fuzzy);
          const answers = (q.answers || []).filter((a) => matchNode(a, filter, fuzzy));
          if (!filter || qMatch || answers.length) return { ...q, answers };
          return null;
        })
        .filter(Boolean);
    }
    S.lastNodes = out;
    return out;
  }

  function getNodeById(id) {
    const nodes = listNodes({ mode: 'all', filter: '', fuzzy: true });
    for (const q of nodes) {
      if (q.id === id) return q;
      for (const a of q.answers || []) if (a.id === id) return a;
    }
    const pins = listNodes({ mode: 'pinned', filter: '', fuzzy: true });
    return pins.find((n) => n.id === id) || null;
  }

  function findTargetElement(node) {
    if (!node) return null;
    if (node.kind === 'question') {
      const id = normalizeMsgId(node.qId || node.turnId || '');
      return W.H2O?.msg?.findEl?.(id) || document.querySelector(`[data-message-id="${CSS.escape(id)}"]`);
    }
    const aid = normalizeMsgId(node.answerId || node.primaryAId || '');
    return W.H2O?.msg?.findEl?.(aid) || document.querySelector(`[data-message-id="${CSS.escape(aid)}"]`);
  }

  async function ensureMountedByNode(node) {
    const contract = getDockContract();
    const helper = contract?.helpers?.requestRemountByMsgId;
    const targetId = normalizeMsgId(node?.kind === 'question' ? node.qId : (node?.answerId || node?.primaryAId));
    let el = findTargetElement(node);
    if (el || !targetId) return el;
    try { helper?.(targetId); } catch {}
    for (let i = 0; i < 12; i += 1) {
      await new Promise((r) => setTimeout(r, 60));
      el = findTargetElement(node);
      if (el) return el;
    }
    return null;
  }

  function flashEl(el) {
    if (!el) return;
    const cls = 'cgxui-navigator-flash';
    const prev = el.getAttribute('data-cgxui-navflash');
    if (!document.getElementById('cgxui-navigator-engine-style')) {
      const s = document.createElement('style');
      s.id = 'cgxui-navigator-engine-style';
      s.textContent = `
        [data-cgxui-navflash="1"].${cls}, .${cls}[data-cgxui-navflash="1"] {
          outline: 2px solid rgba(255, 210, 90, .95) !important;
          outline-offset: 3px !important;
          box-shadow: 0 0 0 4px rgba(255,210,90,.20) !important;
          transition: outline-color .15s ease, box-shadow .2s ease;
        }`;
      document.head.appendChild(s);
    }
    el.classList.add(cls);
    el.setAttribute('data-cgxui-navflash', '1');
    setTimeout(() => {
      try { el.classList.remove(cls); el.removeAttribute('data-cgxui-navflash'); } catch {}
    }, 850);
  }

  async function jumpToNode(nodeOrId, opts = {}) {
    const node = typeof nodeOrId === 'string' ? getNodeById(nodeOrId) : nodeOrId;
    if (!node) return false;
    const el = await ensureMountedByNode(node);
    if (!el) return false;
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
    if (opts.flash !== false) flashEl(el);
    emit(EV_JUMP, { chatId: getChatId(), nodeId: node.id, turnId: node.turnId, kind: node.kind, ts: now() });
    return true;
  }

  function pinNode(nodeOrId) {
    const node = typeof nodeOrId === 'string' ? getNodeById(nodeOrId) : nodeOrId;
    if (!node) return false;
    const st = loadState();
    const pins = Array.isArray(st.pins) ? st.pins.slice() : [];
    const exists = pins.find((p) => p.turnId === node.turnId && p.kind === node.kind && (p.answerId || '') === (node.answerId || ''));
    if (exists) return true;
    pins.push({ id: `pin_${now()}_${Math.random().toString(36).slice(2, 8)}`, turnId: node.turnId, kind: node.kind, answerId: node.answerId || '', order: pins.length, createdAt: now() });
    saveState({ ...st, pins });
    emit(EV_PINNED, { chatId: getChatId(), pinned: true, nodeId: node.id, turnId: node.turnId, kind: node.kind, ts: now() });
    emitChanged('pin');
    return true;
  }
  function unpinNode(nodeOrId) {
    const node = typeof nodeOrId === 'string' ? getNodeById(nodeOrId) : nodeOrId;
    if (!node) return false;
    const st = loadState();
    const pins = (Array.isArray(st.pins) ? st.pins : []).filter((p) => !(p.turnId === node.turnId && p.kind === node.kind && (p.answerId || '') === (node.answerId || '')));
    saveState({ ...st, pins });
    emit(EV_PINNED, { chatId: getChatId(), pinned: false, nodeId: node.id, turnId: node.turnId, kind: node.kind, ts: now() });
    emitChanged('unpin');
    return true;
  }
  function togglePin(nodeOrId) {
    const node = typeof nodeOrId === 'string' ? getNodeById(nodeOrId) : nodeOrId;
    if (!node) return false;
    return node.pinned ? unpinNode(node) : pinNode(node);
  }
  function renameNode(nodeOrId, alias) {
    const node = typeof nodeOrId === 'string' ? getNodeById(nodeOrId) : nodeOrId;
    if (!node) return false;
    const st = loadState();
    const aliases = { ...(st.aliases || {}) };
    const key = node.kind === 'answer' ? `${node.turnId}::a:${node.answerId}` : node.turnId;
    const val = String(alias || '').trim();
    if (val) aliases[key] = val; else delete aliases[key];
    saveState({ ...st, aliases });
    emit(EV_RENAMED, { chatId: getChatId(), nodeId: node.id, turnId: node.turnId, kind: node.kind, alias: val, ts: now() });
    emitChanged('rename');
    return true;
  }
  function toggleCollapsed(turnId) {
    const st = loadState();
    const collapsed = { ...(st.collapsed || {}) };
    collapsed[turnId] = !collapsed[turnId];
    saveState({ ...st, collapsed });
    emitChanged('collapse');
    return !!collapsed[turnId];
  }

  function requestRefresh(reason = 'manual') {
    if (S.refreshScheduled) return;
    S.refreshScheduled = true;
    requestAnimationFrame(() => {
      S.refreshScheduled = false;
      emitChanged(reason);
    });
  }

  function installApi() {
    const api = {
      getChatId,
      loadState: () => loadState(),
      saveState: (st) => saveState(st),
      patchState: (patch, reason) => patchState(patch, getChatId(), reason),
      listNodes,
      getNodeById,
      jumpToNode,
      pinNode,
      unpinNode,
      togglePin,
      renameNode,
      toggleCollapsed,
      subscribe,
      requestRefresh,
      events: { EV_CHANGED, EV_JUMP, EV_PINNED, EV_RENAMED },
    };
    MOD.api = api;
    W.H2ONavigator = api;
    W.HoNavigator = api;
  }

  function bindEvents() {
    if (S.onEvents.length) return;
    for (const ev of UPSTREAM_EVENTS) {
      const fn = () => requestRefresh(ev);
      W.addEventListener(ev, fn, true);
      S.onEvents.push([ev, fn]);
    }
    W.addEventListener('popstate', () => setTimeout(() => requestRefresh('popstate'), 20), true);
  }

  function boot() {
    if (S.booted || W[KEY_BOOT]) return;
    W[KEY_BOOT] = 1;
    S.booted = true;
    S.chatId = getChatId();
    installApi();
    bindEvents();
    requestRefresh('boot');
  }

  boot();
})();
