// ==UserScript==
// @name         0A1.⬛️🧠 H2O Core 🧠
// @namespace    H2O.ChatGPT.Core
// @version      1.0.0
// @description  (Bus + Unified Q/A Index + Turn Index) One event bus + index + stable Turn(Q→A) grouping for MiniMap/Quotes.
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
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
    byQId: new Map(),
    byAId: new Map(),
    aToPrimaryAId: new Map(),
  };

  function buildTurns() {
    const nodes = Array.from(D.querySelectorAll(SEL_CORE_WITH_ROLE));
    const turns = [];
    let current = null;
    let idx = 0;

    for (const el of nodes) {
      const role = el.getAttribute(ATTR_MESSAGE_AUTHOR_ROLE);
      if (role === 'user') {
        idx++;
        const qId = getQId(el);
        current = {
          idx,
          turnId: '',
          qEl: el,
          qId,
          answers: [],
          primaryAEl: null,
          primaryAId: null,
        };
        turns.push(current);
      } else if (role === 'assistant') {
        if (!current) {
          idx++;
          current = { idx, turnId: '', qEl: null, qId: null, answers: [], primaryAEl: null, primaryAId: null };
          turns.push(current);
        }
        const aId = getAId(el);
        current.answers.push({ el, id: aId });
      }
    }

    for (const turn of turns) {
      if (turn.answers.length) {
        const last = turn.answers[turn.answers.length - 1];
        turn.primaryAEl = last.el;
        turn.primaryAId = last.id;
      }
      turn.turnId =
        turn.qId ? `turn:${turn.qId}` :
        (turn.primaryAId ? `turn:a:${turn.primaryAId}` : `turn:${turn.idx}`);
    }

    turnState.byTurnId.clear();
    turnState.byQId.clear();
    turnState.byAId.clear();
    turnState.aToPrimaryAId.clear();

    for (const turn of turns) {
      turnState.byTurnId.set(turn.turnId, turn);
      if (turn.qId) turnState.byQId.set(turn.qId, turn.idx);
      const primary = turn.primaryAId || null;
      for (const answer of turn.answers) {
        if (answer?.id) {
          turnState.byAId.set(answer.id, turn.idx);
          if (primary) turnState.aToPrimaryAId.set(answer.id, primary);
        }
      }
      if (turn.primaryAId) turnState.byAId.set(turn.primaryAId, turn.idx);
    }

    turnState.turns = turns;
    turnState.version++;

    const emitFn = H2O.events?.emit || H2O.bus?.emit || busEmit;
    emitFn(EV_CORE_TURN_UPDATED, {
      reason: 'refresh',
      version: turnState.version,
      turnTotal: turns.length,
    });
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
    getTurnByIndex: (i) => (i > 0 ? turnState.turns[i - 1] || null : null),
    getTurnIndexByQId: (qId) => turnState.byQId.get(qId) || 0,
    getTurnIndexByQEl: (qEl) => (qEl ? (turnState.byQId.get(getQId(qEl)) || 0) : 0),
    getTurnIndexByAId: (aId) => turnState.byAId.get(aId) || 0,
    getTurnIndexByAEl: (aEl) => (aEl ? (turnState.byAId.get(getAId(aEl)) || 0) : 0),
    getPrimaryAIdByAId: (aId) => turnState.aToPrimaryAId.get(aId) || aId || null,
    getPrimaryAIdByTurnIndex: (i) => (i > 0 ? (turnState.turns[i - 1]?.primaryAId || null) : null),
    getTurnIdByTurnIndex: (i) => (i > 0 ? (turnState.turns[i - 1]?.turnId || null) : null),
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
