// ==UserScript==
// @h2o-id             0a1a.h2o.core
// @name               0A1a.⬛️🧠 H2O Core 🧠
// @namespace          H2O.Premium.CGX.h2o.core
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260304-102754
// @description        (Bus + Unified Q/A Index + Turn Index) One event bus + index + stable Turn(Q→A) grouping for MiniMap/Quotes.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  console.log("H2O DEV LOAD ✅", Date.now());

  const D = document;
  const W = window;

  /* ───────────────────────────── ⬜️ 0) IDENTITY / META ───────────────────────────── */
  const TOK = 'HC';
  const PID = 'h2ocr';
  const CID = 'HCore';
  const SkID = 'h2cr';

  const MODTAG = 'HCore';
  const MODICON = '🧠';
  const EMOJI_HDR = '⬛️🧠';
  const SUITE = 'prm';
  const HOST = 'cgx';

  const DsID = PID;
  const BrID = PID;

  const PID_UP = PID.toUpperCase();
  const CID_UP = CID.toUpperCase();

  const H2O = (W.H2O = W.H2O || {});
  H2O[TOK] = H2O[TOK] || {};
  const MOD_OBJ = (H2O[TOK][BrID] = H2O[TOK][BrID] || {});
  MOD_OBJ.meta = MOD_OBJ.meta || { tok: TOK, pid: PID, cid: CID_UP, skid: SkID, modtag: MODTAG, modicon: MODICON, emoji: EMOJI_HDR, suite: SUITE, host: HOST };
  MOD_OBJ.diag = MOD_OBJ.diag || { t0: performance.now(), steps: [], errors: [], bufMax: 160, errMax: 30 };
  const DIAG = MOD_OBJ.diag;

  H2O.KEYS = H2O.KEYS || {};
  H2O.EV = H2O.EV || {};
  H2O.SEL = H2O.SEL || {};
  H2O.UI = H2O.UI || {};

  const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`;
  const NS_EV = `h2o.ev:${SUITE}:${HOST}:${DsID}`;

  /* ───────────────────────────── ⬜️ 1) ATTR / SELECTORS ───────────────────────────── */
  const ATTR_MESSAGE_AUTHOR_ROLE = 'data-message-author-role';
  const ATTR_MESSAGE_ID = 'data-message-id';
  const ATTR_H2O_ID = 'data-h2o-id';
  const ATTR_H2O_UID = 'data-h2o-uid';
  const ATTR_H2O_ANS_ID = 'data-h2o-ans-id';
  const ATTR_H2O_ANS_UID = 'data-h2o-ans-uid';
  const ATTR_TESTID = 'data-testid';

  const SEL_CORE_USER = `[${ATTR_MESSAGE_AUTHOR_ROLE}="user"]`;
  const SEL_CORE_ASSISTANT = `[${ATTR_MESSAGE_AUTHOR_ROLE}="assistant"]`;
  const SEL_CORE_WITH_ROLE = `[${ATTR_MESSAGE_AUTHOR_ROLE}]`;

  H2O.SEL[`${TOK}_USER`] = H2O.SEL[`${TOK}_USER`] || SEL_CORE_USER;
  H2O.SEL[`${TOK}_ASSISTANT`] = H2O.SEL[`${TOK}_ASSISTANT`] || SEL_CORE_ASSISTANT;
  H2O.SEL[`${TOK}_ANY_ROLE`] = H2O.SEL[`${TOK}_ANY_ROLE`] || SEL_CORE_WITH_ROLE;

  /* ───────────────────────────── ⬜️ 2) EVENTS ───────────────────────────── */
  const EV_CORE_READY = 'evt:h2o:core:ready';
  const EV_CORE_INDEX_UPDATED = 'evt:h2o:core:index:updated';
  const EV_CORE_TURN_UPDATED = 'evt:h2o:core:turn:updated';
  const EV_H2O_INLINE_CHANGED = 'evt:h2o:inline:changed';
  const EV_H2O_MESSAGE_REMOUNTED = 'evt:h2o:message:remounted';
  const EV_H2O_BOOKMARKS_CHANGED = 'evt:h2o:bookmarks:changed';
  const EV_H2O_NOTES_CHANGED = 'evt:h2o:notes:changed';

  const EV_LEGACY_INLINE_CHANGED = 'h2o-inline:changed';
  const EV_LEGACY_MESSAGE_REMOUNTED = 'h2o:message-remounted';
  const EV_LEGACY_BOOKMARKS_CHANGED = 'h2o-bookmarks:changed';
  const EV_LEGACY_NOTES_CHANGED = 'h2o-notes:changed';
  const BUS_SCAN_QUESTIONS = 'questions:scan';
  const BUS_SCAN_ANSWERS = 'answers:scan';

  H2O.EV[`${TOK}_READY`] = H2O.EV[`${TOK}_READY`] || EV_CORE_READY;
  H2O.EV[`${TOK}_INDEX_UPDATED`] = H2O.EV[`${TOK}_INDEX_UPDATED`] || EV_CORE_INDEX_UPDATED;
  H2O.EV[`${TOK}_TURN_UPDATED`] = H2O.EV[`${TOK}_TURN_UPDATED`] || EV_CORE_TURN_UPDATED;

  const LEGACY_EVENT_MIRRORS = Object.freeze({
    [EV_CORE_READY]: ['core:ready', 'h2o:core:ready'],
    [EV_CORE_INDEX_UPDATED]: ['index:updated', 'h2o:index:updated'],
    [EV_CORE_TURN_UPDATED]: ['turn:updated', 'h2o:turn:updated'],
  });

  /* ───────────────────────────── ⬜️ 3) EVENT BUS / ROUTER ───────────────────────────── */
  const listeners = new Map();

  function busOn(evt, fn) {
    if (!listeners.has(evt)) listeners.set(evt, new Set());
    listeners.get(evt).add(fn);
    return () => busOff(evt, fn);
  }

  function busOff(evt, fn) {
    listeners.get(evt)?.delete(fn);
  }

  function dispatchDom(evt, detail) {
    try { W.dispatchEvent(new CustomEvent(evt, { detail })); } catch {}
    const mirrors = LEGACY_EVENT_MIRRORS[evt];
    if (mirrors && mirrors.length) {
      for (const alias of mirrors) {
        try { W.dispatchEvent(new CustomEvent(alias, { detail })); } catch {}
      }
    } else if (evt.startsWith('evt:')) {
      const alt = evt.replace(/^evt:/, 'h2o:');
      if (alt !== evt) {
        try { W.dispatchEvent(new CustomEvent(alt, { detail })); } catch {}
      }
    }
  }

  function busEmit(evt, detail = {}) {
    listeners.get(evt)?.forEach(fn => {
      try { fn(detail); } catch (err) { console.warn(`[H2O.Core] handler err ${evt}`, err); }
    });
    dispatchDom(evt, detail);
  }

  H2O.bus = { on: busOn, off: busOff, emit: busEmit };

  H2O.events = H2O.events || {};
  if (!H2O.events.__routerInstalled__) {
    H2O.events.__routerInstalled__ = 1;
    const EVENT_ALIAS = Object.freeze({
      'inline:changed': EV_H2O_INLINE_CHANGED,
      'message:remounted': EV_H2O_MESSAGE_REMOUNTED,
      'bookmarks:changed': EV_H2O_BOOKMARKS_CHANGED,
      'notes:changed': EV_H2O_NOTES_CHANGED,
      'h2o-inline:changed': EV_H2O_INLINE_CHANGED,
      'h2o:message-remounted': EV_H2O_MESSAGE_REMOUNTED,
      'h2o-bookmarks:changed': EV_H2O_BOOKMARKS_CHANGED,
      'h2o-notes:changed': EV_H2O_NOTES_CHANGED,
    });
    const LEGACY_BRIDGES = Object.freeze({
      [EV_LEGACY_INLINE_CHANGED]: EV_H2O_INLINE_CHANGED,
      [EV_LEGACY_MESSAGE_REMOUNTED]: EV_H2O_MESSAGE_REMOUNTED,
      [EV_LEGACY_BOOKMARKS_CHANGED]: EV_H2O_BOOKMARKS_CHANGED,
      [EV_LEGACY_NOTES_CHANGED]: EV_H2O_NOTES_CHANGED,
    });
    const LEGACY_DOM_DISPATCH = Object.freeze({
      [EV_H2O_INLINE_CHANGED]: [EV_LEGACY_INLINE_CHANGED],
      [EV_H2O_MESSAGE_REMOUNTED]: [EV_LEGACY_MESSAGE_REMOUNTED],
      [EV_H2O_BOOKMARKS_CHANGED]: [EV_LEGACY_BOOKMARKS_CHANGED],
      [EV_H2O_NOTES_CHANGED]: [EV_LEGACY_NOTES_CHANGED],
    });

    function emitInternal(evt, detail) {
      listeners.get(evt)?.forEach(fn => {
        try { fn(detail); } catch (err) { console.warn(`[H2O.Core] handler err ${evt}`, err); }
      });
    }

    H2O.events.emit = function(ev, detail = {}, opts = {}) {
      const canonical = ev.startsWith('evt:') ? ev : (EVENT_ALIAS[ev] || ev);
      emitInternal(canonical, detail);
      dispatchDom(canonical, detail);

      if (!opts.fromLegacy && LEGACY_DOM_DISPATCH[canonical]) {
        const legacyDetail = (detail && typeof detail === 'object')
          ? { ...detail, __H2O_ROUTED__: 1 }
          : { value: detail, __H2O_ROUTED__: 1 };
        for (const legacyName of LEGACY_DOM_DISPATCH[canonical]) {
          try { W.dispatchEvent(new CustomEvent(legacyName, { detail: legacyDetail })); } catch {}
        }
      }
    };

    function bridgeLegacy(legacyEvt, canonicalEvt) {
      W.addEventListener(legacyEvt, (event) => {
        if (event?.detail && event.detail.__H2O_ROUTED__) return;
        H2O.events.emit(canonicalEvt, event?.detail || {}, { fromLegacy: true });
      }, true);
    }

    for (const [legacy, canonical] of Object.entries(LEGACY_BRIDGES)) {
      bridgeLegacy(legacy, canonical);
    }

    H2O.emit = H2O.events.emit;
  }

  /* ───────────────────────────── 🟩 4) UTILITIES / MESSAGES ───────────────────────────── */
  H2O.msg = H2O.msg || {};
  H2O.msg.normalizeId = (id) => String(id || '').replace(/^conversation-turn-/, '').trim();

  H2O.msg.getIdFromEl = (el) => {
    if (!el) return '';
    const tryAttr = () => (
      el.getAttribute?.(ATTR_MESSAGE_ID) ||
      el.dataset?.messageId ||
      el.getAttribute?.(ATTR_H2O_ID) ||
      el.dataset?.h2oId ||
      el.getAttribute?.(ATTR_H2O_UID) ||
      el.dataset?.h2oUid ||
      el.getAttribute?.(ATTR_H2O_ANS_ID) ||
      el.dataset?.h2oAnsId ||
      el.getAttribute?.(ATTR_H2O_ANS_UID) ||
      el.dataset?.h2oAnsUid ||
      ''
    );
    const mid = tryAttr();
    if (mid) return H2O.msg.normalizeId(mid);
    const testId = el.dataset?.testid || el.dataset?.testId || el.getAttribute?.(ATTR_TESTID) || '';
    if (testId && testId.startsWith('conversation-turn-')) return H2O.msg.normalizeId(testId);
    return '';
  };

  H2O.msg.findEl = (id) => {
    const nid = H2O.msg.normalizeId(id);
    if (!nid) return null;
    return (
      document.querySelector(`[${ATTR_H2O_ID}="${nid}"]`) ||
      document.querySelector(`[${ATTR_H2O_UID}="${nid}"]`) ||
      document.querySelector(`[${ATTR_H2O_ANS_ID}="${nid}"]`) ||
      document.querySelector(`[${ATTR_H2O_ANS_UID}="${nid}"]`) ||
      document.querySelector(`[${ATTR_MESSAGE_ID}="${nid}"]`) ||
      document.querySelector(`[${ATTR_TESTID}="conversation-turn-${nid}"]`) ||
      document.querySelector(`[${ATTR_TESTID}="${nid}"]`)
    );
  };

  H2O.util = H2O.util || {};
  H2O.util.getChatId = () => {
    const match = location.pathname.match(/\/c\/([a-z0-9-]+)/i);
    return match ? match[1] : '';
  };
  H2O.util.safeParse = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };
  H2O.runtime = H2O.runtime || {};

  H2O.emitCompat = (name, detail) => {
    try {
      if (detail !== undefined) W.dispatchEvent(new CustomEvent(name, { detail }));
      else W.dispatchEvent(new Event(name));
    } catch {}
    try { H2O.bus?.emit?.(name, detail || {}); } catch {}
  };

  /* ───────────────────────────── 🟣 5) TIME HELPERS ───────────────────────────── */
  (() => {
    if (H2O.time) return;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const pad2 = (n) => String(n).padStart(2, '0');

    function format(epochSeconds) {
      const d = new Date(epochSeconds * 1000);
      return `${months[d.getMonth()]} ${d.getDate()} - ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    }

    function getReactHandle(el) {
      if (!el) return null;
      const key = Object.keys(el).find(x => x.startsWith('__reactFiber$') || x.startsWith('__reactProps$'));
      return key ? { key, value: el[key] } : null;
    }

    function findCreateTimeFromReact(el) {
      const handle = getReactHandle(el);
      if (!handle) return null;
      if (handle.key.startsWith('__reactProps$')) {
        const props = handle.value;
        const t = props?.messages?.[0]?.create_time ?? props?.message?.create_time ?? null;
        return (typeof t === 'number' && isFinite(t)) ? t : null;
      }
      let ptr = handle.value;
      for (let i = 0; i < 18 && ptr; i++) {
        const memo = ptr.memoizedProps;
        const t =
          memo?.messages?.[0]?.create_time ??
          memo?.message?.create_time ??
          memo?.children?.props?.messages?.[0]?.create_time ??
          memo?.children?.props?.message?.create_time ??
          null;
        if (typeof t === 'number' && isFinite(t)) return t;
        ptr = ptr.return;
      }
      return null;
    }

    const cache = new WeakMap();
    function getCreateTime(msgEl) {
      if (!msgEl) return null;
      if (cache.has(msgEl)) {
        const stored = cache.get(msgEl);
        return stored ? stored : null;
      }
      const candidates = [msgEl, msgEl.firstElementChild, msgEl.querySelector?.(`[${ATTR_MESSAGE_ID}]`), msgEl.querySelector?.('div')];
      let ts = null;
      for (const candidate of candidates) {
        if (!candidate) continue;
        ts = findCreateTimeFromReact(candidate);
        if (ts) break;
      }
      cache.set(msgEl, ts || 0);
      return ts;
    }

    H2O.time = { getCreateTime, format };
  })();

  (() => {
    if (H2O.runtime.schedule) return;
    const tasks = new Map();

    function getTaskEntry(key) {
      const id = String(key || '');
      if (!id) return null;
      let entry = tasks.get(id);
      if (!entry) {
        entry = { raf: 0, timeout: 0 };
        tasks.set(id, entry);
      }
      return { id, entry };
    }

    function pruneTaskEntry(id, entry) {
      if (entry && !entry.raf && !entry.timeout) tasks.delete(id);
    }

    function cancel(key) {
      const id = String(key || '');
      if (!id) return false;
      const entry = tasks.get(id);
      if (!entry) return false;
      if (entry.raf) {
        try { W.cancelAnimationFrame(entry.raf); } catch {}
        entry.raf = 0;
      }
      if (entry.timeout) {
        try { W.clearTimeout(entry.timeout); } catch {}
        entry.timeout = 0;
      }
      pruneTaskEntry(id, entry);
      return true;
    }

    function isPending(key) {
      const entry = tasks.get(String(key || ''));
      return !!(entry && (entry.raf || entry.timeout));
    }

    function rafOnce(key, fn) {
      if (typeof fn !== 'function') return 0;
      const task = getTaskEntry(key);
      if (!task) return 0;
      const { id, entry } = task;
      if (entry.raf) return entry.raf;
      entry.raf = W.requestAnimationFrame(() => {
        const next = tasks.get(id);
        if (next) {
          next.raf = 0;
          pruneTaskEntry(id, next);
        }
        fn();
      });
      return entry.raf;
    }

    function timeoutOnce(key, ms, fn) {
      if (typeof fn !== 'function') return 0;
      const task = getTaskEntry(key);
      if (!task) return 0;
      const { id, entry } = task;
      if (entry.timeout) return entry.timeout;
      const delay = Math.max(0, Math.floor(Number(ms) || 0));
      entry.timeout = W.setTimeout(() => {
        const next = tasks.get(id);
        if (next) {
          next.timeout = 0;
          pruneTaskEntry(id, next);
        }
        fn();
      }, delay);
      return entry.timeout;
    }

    H2O.runtime.schedule = { rafOnce, timeoutOnce, cancel, isPending };
  })();

  /* ───────────────────────────── 🟥 6) STATE / INDEX DATA ───────────────────────────── */
  const state = {
    version: 0,
    qList: [],
    aList: [],
    qById: new Map(),
    aById: new Map(),
    scheduled: false,
  };

  const weakFallback = new WeakMap();

  function fallbackId(el, prefix) {
    let value = weakFallback.get(el);
    if (!value) {
      value = `${prefix}_${Math.random().toString(36).slice(2)}`;
      weakFallback.set(el, value);
    }
    return value;
  }

  function getMsgIdAttr(el) {
    const attr = (
      el?.getAttribute?.(ATTR_MESSAGE_ID) ||
      el?.dataset?.messageId ||
      el?.getAttribute?.(ATTR_H2O_ID) ||
      el?.dataset?.h2oId ||
      el?.getAttribute?.(ATTR_H2O_UID) ||
      el?.dataset?.h2oUid ||
      el?.getAttribute?.(ATTR_H2O_ANS_ID) ||
      el?.dataset?.h2oAnsId ||
      el?.getAttribute?.(ATTR_H2O_ANS_UID) ||
      el?.dataset?.h2oAnsUid ||
      ''
    );
    return attr;
  }

  function getQId(el) {
    return (
      H2O.msg.normalizeId(getMsgIdAttr(el)) ||
      (typeof W.H2O_getStableQwrapId === 'function' ? W.H2O_getStableQwrapId(el) : null) ||
      fallbackId(el, 'q')
    );
  }

  function getAId(el) {
    return H2O.msg.normalizeId(getMsgIdAttr(el)) || fallbackId(el, 'a');
  }

  const turnState = {
    version: 0,
    turns: [],
    byTurnId: new Map(),
    byTurnNo: new Map(),
    byQId: new Map(),
    byAId: new Map(),
    aToPrimaryAId: new Map(),
    aliasToTurnId: new Map(),
    paginationDrafts: null,
  };

  function createEmptyPageState() {
    return {
      answerNumber: null,
      answerIndex0: null,
      pageIndex: null,
      pageCount: null,
      pageSize: null,
      bufferAnswers: null,
      turnStart: null,
      turnEnd: null,
      answerStartIndex: null,
      answerEndIndex: null,
      bufferedAnswerStartIndex: null,
      bufferedAnswerEndIndex: null,
      inCurrentPage: false,
      inBufferedWindow: false,
    };
  }

  function createEmptyMountState() {
    return {
      mountState: 'mounted',
      isMounted: true,
      placeholderEl: null,
      lastMountReason: null,
      lastUnmountReason: null,
    };
  }

  function createTurnRecord(turnId, turnNo) {
    return {
      turnId: String(turnId || ''),
      turnNo: Math.max(1, Number(turnNo || 1) || 1),
      qId: null,
      answerIds: [],
      primaryAId: null,
      hasQuestion: false,
      hasAssistant: false,
      live: {
        qEl: null,
        primaryAEl: null,
        answerEls: [],
        connected: false,
      },
      page: createEmptyPageState(),
      mount: createEmptyMountState(),
      _aliasIds: [],
    };
  }

  function refreshLegacyTurnCompat(record) {
    if (!record || typeof record !== 'object') return record;
    record.idx = record.turnNo;
    record.index = record.turnNo;
    record.id = record.turnId;
    record.answerId = record.primaryAId || null;
    record.qEl = record.live.qEl || null;
    record.primaryAEl = record.live.primaryAEl || null;
    record.answerEls = Array.isArray(record.live.answerEls) ? record.live.answerEls.slice() : [];
    record.answers = record.answerIds.map((id, idx) => ({ id, el: record.answerEls[idx] || null }));
    return record;
  }

  function normalizeTurnAlias(raw) {
    return H2O.msg.normalizeId(raw);
  }

  function addTurnAlias(map, raw, turnId, opts = {}) {
    if (!(map instanceof Map)) return;
    const id = normalizeTurnAlias(raw);
    const canonicalTurnId = String(turnId || '').trim();
    if (!id || !canonicalTurnId) return;

    map.set(id, canonicalTurnId);

    if (id.startsWith('turn:a:')) {
      const bare = normalizeTurnAlias(id.slice(7));
      if (bare) {
        map.set(bare, canonicalTurnId);
        map.set(`turn:${bare}`, canonicalTurnId);
      }
      return;
    }

    if (id.startsWith('turn:')) {
      const bare = normalizeTurnAlias(id.slice(5));
      if (bare) map.set(bare, canonicalTurnId);
      return;
    }

    if (opts.turnVariant) map.set(`turn:${id}`, canonicalTurnId);
    if (opts.assistantTurnVariant) map.set(`turn:a:${id}`, canonicalTurnId);
  }

  function getRecordByTurnNoInternal(turnNo) {
    const no = Math.max(1, Number(turnNo || 0) || 0);
    return no > 0 ? (turnState.byTurnNo.get(no) || null) : null;
  }

  function getRecordByTurnIdInternal(turnId) {
    const key = normalizeTurnAlias(turnId);
    if (!key) return null;
    const canonicalTurnId = turnState.byTurnId.has(key)
      ? key
      : (turnState.aliasToTurnId.get(key) || '');
    return canonicalTurnId ? (turnState.byTurnId.get(canonicalTurnId) || null) : null;
  }

  function getRecordByQIdInternal(qId) {
    const key = normalizeTurnAlias(qId);
    if (!key) return null;
    return getRecordByTurnNoInternal(turnState.byQId.get(key) || 0);
  }

  function getRecordByAIdInternal(aId) {
    const key = normalizeTurnAlias(aId);
    if (!key) return null;
    return getRecordByTurnNoInternal(turnState.byAId.get(key) || 0);
  }

  function buildCanonicalTurnId(turn) {
    const turnNo = Math.max(1, Number(turn?.turnNo || turn?.idx || 1) || 1);
    const qId = normalizeTurnAlias(turn?.qId || '');
    const primaryAId = normalizeTurnAlias(turn?.primaryAId || '');
    if (qId) return `turn:${qId}`;
    if (primaryAId) return `turn:a:${primaryAId}`;
    return `turn:${turnNo}`;
  }

  function buildTurnDraftsFromEntries(entries = []) {
    const drafts = [];
    let current = null;
    let idx = 0;

    const finalize = (draft) => {
      if (!draft) return null;
      draft.qId = normalizeTurnAlias(draft.qId || '') || null;
      draft.answerIds = draft.answerIds.map((id) => normalizeTurnAlias(id)).filter(Boolean);
      draft.primaryAId = draft.answerIds.length ? draft.answerIds[draft.answerIds.length - 1] : null;
      draft.hasQuestion = !!draft.qId;
      draft.hasAssistant = !!draft.answerIds.length;
      draft.live.answerEls = Array.isArray(draft.live.answerEls) ? draft.live.answerEls.filter(Boolean) : [];
      if (!draft.live.primaryAEl && draft.live.answerEls.length) {
        draft.live.primaryAEl = draft.live.answerEls[draft.live.answerEls.length - 1] || null;
      }
      draft.live.connected = !!(
        (draft.live.qEl && draft.live.qEl.isConnected)
        || (draft.live.primaryAEl && draft.live.primaryAEl.isConnected)
        || draft.live.answerEls.some((el) => !!(el && el.isConnected))
      );
      draft.aliasIds = Array.from(new Set((draft.aliasIds || []).map((value) => normalizeTurnAlias(value)).filter(Boolean)));
      return draft;
    };

    for (const entry of Array.isArray(entries) ? entries : []) {
      const role = String(entry?.role || '').trim();
      if (role === 'user') {
        idx += 1;
        current = {
          turnNo: idx,
          qId: entry?.qId || null,
          answerIds: [],
          aliasIds: Array.isArray(entry?.aliasIds) ? entry.aliasIds.slice() : [],
          live: {
            qEl: entry?.qEl?.isConnected ? entry.qEl : null,
            primaryAEl: null,
            answerEls: [],
            connected: !!(entry?.qEl && entry.qEl.isConnected),
          },
        };
        drafts.push(current);
        continue;
      }

      if (role !== 'assistant') continue;
      if (!current) {
        idx += 1;
        current = {
          turnNo: idx,
          qId: null,
          answerIds: [],
          aliasIds: [],
          live: {
            qEl: null,
            primaryAEl: null,
            answerEls: [],
            connected: false,
          },
        };
        drafts.push(current);
      }

      if (entry?.aId) current.answerIds.push(entry.aId);
      if (Array.isArray(entry?.aliasIds) && entry.aliasIds.length) current.aliasIds.push(...entry.aliasIds);
      if (entry?.aEl?.isConnected) {
        current.live.answerEls.push(entry.aEl);
        current.live.primaryAEl = entry.aEl;
        current.live.connected = true;
      }
    }

    return drafts.map(finalize).filter(Boolean);
  }

  function buildLiveTurnDrafts() {
    const nodes = Array.from(D.querySelectorAll(SEL_CORE_WITH_ROLE));
    const entries = [];
    for (const el of nodes) {
      const role = el.getAttribute(ATTR_MESSAGE_AUTHOR_ROLE);
      if (role === 'user') {
        entries.push({
          role,
          qEl: el,
          qId: getQId(el),
          aliasIds: [
            getMsgIdAttr(el),
            String(el?.dataset?.turnId || '').trim(),
          ],
        });
      } else if (role === 'assistant') {
        entries.push({
          role,
          aEl: el,
          aId: getAId(el),
          aliasIds: [
            getMsgIdAttr(el),
            String(el?.dataset?.turnId || '').trim(),
          ],
        });
      }
    }
    return buildTurnDraftsFromEntries(entries);
  }

  function buildPaginationTurnDrafts(rows = []) {
    const entries = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      const role = String(row?.role || '').trim();
      const node = row?.node || null;
      const answerEl = row?.answerEl || row?.primaryAEl || null;
      if (role === 'user') {
        entries.push({
          role,
          qEl: node,
          qId: node ? getQId(node) : null,
          aliasIds: [
            row?.turnId,
            row?.uid,
            node ? getMsgIdAttr(node) : '',
            String(node?.dataset?.turnId || '').trim(),
          ],
        });
      } else if (role === 'assistant') {
        const aEl = answerEl || node || null;
        entries.push({
          role,
          aEl,
          aId: normalizeTurnAlias(row?.answerId || getMsgIdAttr(aEl)),
          aliasIds: [
            row?.turnId,
            row?.uid,
            row?.answerId,
            String(aEl?.dataset?.turnId || '').trim(),
            aEl ? getMsgIdAttr(aEl) : '',
          ],
        });
      }
    }
    return buildTurnDraftsFromEntries(entries);
  }

  function findPreviousTurnRecord(draft, used = new Set()) {
    const candidates = [];
    const pushRecord = (record) => {
      if (!record || used.has(record)) return;
      candidates.push(record);
    };

    pushRecord(getRecordByTurnIdInternal(buildCanonicalTurnId(draft)));
    if (draft?.qId) pushRecord(getRecordByQIdInternal(draft.qId));
    if (draft?.primaryAId) pushRecord(getRecordByAIdInternal(draft.primaryAId));
    for (const answerId of draft?.answerIds || []) pushRecord(getRecordByAIdInternal(answerId));
    for (const aliasId of draft?.aliasIds || []) pushRecord(getRecordByTurnIdInternal(aliasId));
    if (!candidates.length && !(turnState.paginationDrafts && turnState.paginationDrafts.length)) {
      pushRecord(getRecordByTurnNoInternal(draft?.turnNo || 0));
    }
    return candidates[0] || null;
  }

  function applyCanonicalDraft(record, draft) {
    const turnNo = Math.max(1, Number(draft?.turnNo || record?.turnNo || 1) || 1);
    const answerIds = Array.isArray(draft?.answerIds) ? draft.answerIds.slice() : [];
    const primaryAId = answerIds.length ? answerIds[answerIds.length - 1] : null;
    record.turnNo = turnNo;
    record.qId = draft?.qId || null;
    record.answerIds = answerIds;
    record.primaryAId = primaryAId;
    record.turnId = buildCanonicalTurnId({
      turnNo,
      qId: record.qId,
      primaryAId: record.primaryAId,
    });
    record.hasQuestion = !!record.qId;
    record.hasAssistant = !!record.answerIds.length;
    record._aliasIds = Array.from(new Set((draft?.aliasIds || []).map((value) => normalizeTurnAlias(value)).filter(Boolean)));
    if (!record.page || typeof record.page !== 'object') record.page = createEmptyPageState();
    if (!record.mount || typeof record.mount !== 'object') record.mount = createEmptyMountState();
    record.live = {
      qEl: null,
      primaryAEl: null,
      answerEls: [],
      connected: false,
    };
    return refreshLegacyTurnCompat(record);
  }

  function applyLiveDraft(record, draft) {
    if (!record || !draft) return record;
    let shouldRebuildTurnId = false;
    record.live = {
      qEl: draft?.live?.qEl || null,
      primaryAEl: draft?.live?.primaryAEl || null,
      answerEls: Array.isArray(draft?.live?.answerEls) ? draft.live.answerEls.filter(Boolean) : [],
      connected: !!draft?.live?.connected,
    };
    if (!record.qId && draft?.qId) {
      record.qId = draft.qId;
      shouldRebuildTurnId = true;
    }
    if ((!record.answerIds || !record.answerIds.length) && Array.isArray(draft?.answerIds) && draft.answerIds.length) {
      record.answerIds = draft.answerIds.slice();
      record.primaryAId = draft.answerIds[draft.answerIds.length - 1] || null;
      record.hasAssistant = !!record.answerIds.length;
      shouldRebuildTurnId = true;
    }
    if (shouldRebuildTurnId) record.turnId = buildCanonicalTurnId(record);
    return refreshLegacyTurnCompat(record);
  }

  function rebuildTurnMaps(records) {
    turnState.byTurnId.clear();
    turnState.byTurnNo.clear();
    turnState.byQId.clear();
    turnState.byAId.clear();
    turnState.aToPrimaryAId.clear();
    turnState.aliasToTurnId.clear();

    for (const record of Array.isArray(records) ? records : []) {
      const turnId = String(record?.turnId || '').trim();
      const turnNo = Math.max(1, Number(record?.turnNo || 0) || 0);
      if (!turnId || !turnNo) continue;

      turnState.byTurnId.set(turnId, record);
      turnState.byTurnNo.set(turnNo, record);
      addTurnAlias(turnState.aliasToTurnId, turnId, turnId, { turnVariant: true });
      if (record.qId) {
        turnState.byQId.set(record.qId, turnNo);
        addTurnAlias(turnState.aliasToTurnId, record.qId, turnId, { turnVariant: true });
      }
      const primary = record.primaryAId || null;
      for (const answerId of record.answerIds || []) {
        if (!answerId) continue;
        turnState.byAId.set(answerId, turnNo);
        if (primary) turnState.aToPrimaryAId.set(answerId, primary);
        addTurnAlias(turnState.aliasToTurnId, answerId, turnId, { turnVariant: true, assistantTurnVariant: true });
      }
      for (const aliasId of record._aliasIds || []) {
        addTurnAlias(turnState.aliasToTurnId, aliasId, turnId, { turnVariant: true, assistantTurnVariant: true });
      }
    }
  }

  function commitTurnDrafts(canonicalDrafts, liveDrafts = canonicalDrafts) {
    const nextRecords = [];
    const used = new Set();

    const sourceDrafts = Array.isArray(canonicalDrafts) ? canonicalDrafts : [];
    for (let i = 0; i < sourceDrafts.length; i += 1) {
      const draft = sourceDrafts[i] || {};
      draft.turnNo = i + 1;
      const existing = findPreviousTurnRecord(draft, used);
      const record = existing || createTurnRecord('', draft.turnNo);
      applyCanonicalDraft(record, draft);
      used.add(record);
      nextRecords.push(record);
    }

    rebuildTurnMaps(nextRecords);

    const unmatchedLiveDrafts = [];
    for (const draft of Array.isArray(liveDrafts) ? liveDrafts : []) {
      const record =
        getRecordByTurnIdInternal(buildCanonicalTurnId(draft))
        || (draft?.qId ? getRecordByQIdInternal(draft.qId) : null)
        || (draft?.primaryAId ? getRecordByAIdInternal(draft.primaryAId) : null)
        || (draft?.answerIds || []).map((id) => getRecordByAIdInternal(id)).find(Boolean)
        || (draft?.aliasIds || []).map((id) => getRecordByTurnIdInternal(id)).find(Boolean)
        || null;

      if (!record) {
        unmatchedLiveDrafts.push(draft);
        continue;
      }
      applyLiveDraft(record, draft);
    }

    for (const draft of unmatchedLiveDrafts) {
      const record = createTurnRecord('', nextRecords.length + 1);
      draft.turnNo = nextRecords.length + 1;
      applyCanonicalDraft(record, draft);
      applyLiveDraft(record, draft);
      nextRecords.push(record);
    }

    for (const record of nextRecords) refreshLegacyTurnCompat(record);
    turnState.turns = nextRecords;
    rebuildTurnMaps(nextRecords);
    turnState.version++;

    const emitFn = H2O.events?.emit || H2O.bus?.emit || busEmit;
    emitFn(EV_CORE_TURN_UPDATED, {
      reason: 'refresh',
      version: turnState.version,
      turnTotal: nextRecords.length,
    });
  }

  function buildTurns() {
    const liveDrafts = buildLiveTurnDrafts();
    const canonicalDrafts = Array.isArray(turnState.paginationDrafts) && turnState.paginationDrafts.length
      ? turnState.paginationDrafts
      : liveDrafts;
    commitTurnDrafts(canonicalDrafts, liveDrafts);
  }

  function reconcileTurnRecordsFromPaginationSnapshot(rows = []) {
    const drafts = buildPaginationTurnDrafts(rows);
    turnState.paginationDrafts = drafts.length ? drafts : null;
    commitTurnDrafts(turnState.paginationDrafts || buildLiveTurnDrafts(), buildLiveTurnDrafts());
    return listTurnRecords();
  }

  function clearPaginationTurnSnapshot() {
    for (const record of turnState.turns) {
      record.page = createEmptyPageState();
      refreshLegacyTurnCompat(record);
    }
    turnState.paginationDrafts = null;
    buildTurns();
    return listTurnRecords();
  }

  function patchTurnPageState(turnId, partialPageState, opts = {}) {
    if (String(opts?.owner || '') !== 'pagination') {
      console.warn('[H2O.Core] patchTurnPageState denied', { turnId, owner: opts?.owner || '' });
      return null;
    }
    const record = getRecordByTurnIdInternal(turnId);
    if (!record) return null;
    record.page = Object.assign(record.page || createEmptyPageState(), partialPageState || {});
    refreshLegacyTurnCompat(record);
    return record;
  }

  function patchTurnMountState(turnId, partialMountState, opts = {}) {
    if (String(opts?.owner || '') !== 'unmount') {
      console.warn('[H2O.Core] patchTurnMountState denied', { turnId, owner: opts?.owner || '' });
      return null;
    }
    const record = getRecordByTurnIdInternal(turnId);
    if (!record) return null;
    record.mount = Object.assign(record.mount || createEmptyMountState(), partialMountState || {});
    refreshLegacyTurnCompat(record);
    return record;
  }

  function listTurnRecords() {
    return turnState.turns.slice();
  }

  function refresh(reason = 'manual') {
    state.version++;

    const userNodes = Array.from(D.querySelectorAll(SEL_CORE_USER));
    const assistantNodes = Array.from(D.querySelectorAll(SEL_CORE_ASSISTANT));

    state.qList = [];
    state.aList = [];
    state.qById.clear();
    state.aById.clear();

    userNodes.forEach((el, index) => {
      const id = getQId(el);
      const idx = index + 1;
      state.qList.push({ id, el, idx });
      state.qById.set(id, idx);
    });

    assistantNodes.forEach((el, index) => {
      const id = getAId(el);
      const idx = index + 1;
      state.aList.push({ id, el, idx });
      state.aById.set(id, idx);
    });

    buildTurns();

    const emitFn = H2O.events?.emit || H2O.bus?.emit || busEmit;
    emitFn(EV_CORE_INDEX_UPDATED, {
      reason,
      version: state.version,
      qTotal: state.qList.length,
      aTotal: state.aList.length,
      turnTotal: turnState.turns.length,
    });
  }

  function scheduleRefresh(reason = 'scheduled') {
    if (state.scheduled) return;
    state.scheduled = true;
    requestAnimationFrame(() => {
      state.scheduled = false;
      refresh(reason);
    });
  }

  function getIndex(map, elOrId, idFn) {
    const id = (typeof elOrId === 'string') ? elOrId : idFn(elOrId);
    return map.get(id) || 0;
  }

  H2O.index = {
    refresh,
    scheduleRefresh,
    getQId,
    getAId,
    getQIndex: (x) => getIndex(state.qById, x, getQId),
    getAIndex: (x) => getIndex(state.aById, x, getAId),
    qTotal: () => state.qList.length,
    aTotal: () => state.aList.length,
    version: () => state.version,
    _state: state,
  };

  H2O.turn = {
    version: () => turnState.version,
    total: () => turnState.turns.length,
    getTurns: () => turnState.turns.slice(),
    getTurnByIndex: (i) => getRecordByTurnNoInternal(i),
    getTurnIndexByQId: (qId) => turnState.byQId.get(normalizeTurnAlias(qId)) || 0,
    getTurnIndexByQEl: (qEl) => (qEl ? (turnState.byQId.get(getQId(qEl)) || 0) : 0),
    getTurnIndexByAId: (aId) => turnState.byAId.get(normalizeTurnAlias(aId)) || 0,
    getTurnIndexByAEl: (aEl) => (aEl ? (turnState.byAId.get(getAId(aEl)) || 0) : 0),
    getPrimaryAIdByAId: (aId) => turnState.aToPrimaryAId.get(normalizeTurnAlias(aId)) || normalizeTurnAlias(aId) || null,
    getPrimaryAIdByTurnIndex: (i) => getRecordByTurnNoInternal(i)?.primaryAId || null,
    getTurnIdByTurnIndex: (i) => getRecordByTurnNoInternal(i)?.turnId || null,
  };

  H2O.turnRuntime = {
    getTurnRecordByTurnId: (turnId) => getRecordByTurnIdInternal(turnId),
    getTurnRecordByAId: (aId) => getRecordByAIdInternal(aId),
    getTurnRecordByQId: (qId) => getRecordByQIdInternal(qId),
    getTurnRecordByTurnNo: (turnNo) => getRecordByTurnNoInternal(turnNo),
    listTurnRecords,
    patchTurnPageState: (turnId, partialPageState, opts = {}) => patchTurnPageState(turnId, partialPageState, opts),
    patchTurnMountState: (turnId, partialMountState, opts = {}) => patchTurnMountState(turnId, partialMountState, opts),
    _reconcilePaginationSnapshot: (rows = []) => reconcileTurnRecordsFromPaginationSnapshot(rows),
    _clearPaginationSnapshot: () => clearPaginationTurnSnapshot(),
  };

  /* ───────────────────────────── 🟨 7) TIME / OBSERVERS ───────────────────────────── */
  (() => {
    let mo = null;
    if (!mo) {
      mo = new MutationObserver((muts) => {
        let touched = false;
        for (const mutation of muts) {
          const nodes = [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])];
          for (const node of nodes) {
            if (node.nodeType !== 1) continue;
            if (
              node.matches?.(SEL_CORE_USER) ||
              node.matches?.(SEL_CORE_ASSISTANT) ||
              node.querySelector?.(`${SEL_CORE_USER},${SEL_CORE_ASSISTANT}`)
            ) {
              touched = true;
              break;
            }
          }
          if (touched) break;
        }
        if (touched) scheduleRefresh('mo');
      });
      mo.observe(D.body, { childList: true, subtree: true });
    }
  })();

  H2O.bus.on(BUS_SCAN_QUESTIONS, (detail) => scheduleRefresh(`bus:questions:${detail?.reason || ''}`));
  H2O.bus.on(BUS_SCAN_ANSWERS, (detail) => scheduleRefresh(`bus:answers:${detail?.reason || ''}`));

  W.addEventListener(EV_H2O_MESSAGE_REMOUNTED, () => scheduleRefresh('evt:remounted:h2o'));
  W.addEventListener(EV_H2O_INLINE_CHANGED, () => scheduleRefresh('evt:inline:h2o'));

  refresh('boot');

  const emitFn = H2O.events?.emit || H2O.bus?.emit || busEmit;
  emitFn(EV_CORE_READY, { version: state.version, turnVersion: turnState.version });

  try {
    W.dispatchEvent(new CustomEvent(EV_CORE_READY, { detail: { version: state.version, turnVersion: turnState.version } }));
  } catch {}

})();
