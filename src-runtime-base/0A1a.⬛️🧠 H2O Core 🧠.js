// ==H2O Module==
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
// ==/H2O Module==

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

      // Loader V2.1: explicit `{ replay: true }` writes the latest detail to
      // the bounded cache so late onReady() subscribers replay it once. This
      // is the spelling the V2.1 plan calls for (emit + replay flag) and is
      // equivalent to calling H2O.events.emitReady directly. Override is
      // explicit: it bypasses READY_PREDICATE — callers who pass
      // { replay: true } know they want replay, regardless of name shape.
      if (opts && opts.replay === true) {
        try {
          readyCache.set(readyCacheKey(canonical), { detail: detail || {}, ts: Date.now() });
        } catch (_) {}
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

    /* ─────────────────── *:ready replay buffer (Phase 4 Step 4) ───────────────────
     * Bounded last-value cache for *:ready / *-ready events. Strictly additive:
     * the existing emit / bus / dual-DOM-mirror topology is unchanged. Late
     * subscribers can use H2O.events.onReady(name, fn) to receive the cached
     * value once (microtask-deferred) and also subscribe to future emits via
     * the DOM event path (which already auto-mirrors evt:h2o:* ↔ h2o:*).
     *
     * Migration is opt-in: only emitters that explicitly call emitReady()
     * populate the cache. emit() is unchanged, so existing direct-dispatch
     * emitters (W.dispatchEvent(...)) leave the cache empty until they
     * migrate (or until a later batch decides to migrate them).
     *
     * Cache shape: Map<canonicalKey, { detail, ts }>. One entry per event
     * name, last-value-wins on duplicate emits, no history list. Predicate-
     * gated writes ensure non-ready events are never cached.
     * ───────────────────────────────────────────────────────────────────────────── */

    // Loader V2.1: also accept the established `:ready:vN` / `-ready-vN`
    // suffix convention used by Control Hub, Library Core, and Side Actions
    // Panel. Without this, e.g. `h2o.ev:prm:cgx:cntrlhb:ready:v1` was emitted
    // as a "ready" event but the cache never picked it up, so late
    // subscribers fell through to plain addEventListener and missed the fire.
    const READY_PREDICATE = (n) => typeof n === 'string'
      && /(?:[:-])ready(?:[:-]v\d+)?$/i.test(n);

    // Normalize so 'evt:h2o:foo:ready' and 'h2o:foo:ready' map to the same
    // cache slot. Other event consumers still see whatever name was passed;
    // only the cache key is normalized.
    function readyCacheKey(ev) {
      const s = String(ev || '');
      if (s.startsWith('evt:')) return s;
      if (EVENT_ALIAS[s]) return EVENT_ALIAS[s];
      if (s.startsWith('h2o:')) return 'evt:' + s;
      return s;
    }

    const readyCache = new Map();

    H2O.events.emitReady = function emitReady(ev, detail, opts) {
      // Always do everything emit() does — preserves bus + DOM dispatch +
      // legacy mirrors exactly.
      H2O.events.emit(ev, detail || {}, opts || {});
      // Then, IFF this event is replayable, write to the bounded cache.
      if (!READY_PREDICATE(ev)) return;
      try {
        readyCache.set(readyCacheKey(ev), { detail: detail || {}, ts: Date.now() });
      } catch (_) {}
    };

    H2O.events.onReady = function onReady(ev, fn, _opts) {
      if (typeof fn !== 'function' || typeof ev !== 'string' || !ev) {
        return function noopOff() {};
      }
      // 1) Microtask-deferred replay if cached. Caller's setup completes first.
      let cached = null;
      try { cached = readyCache.get(readyCacheKey(ev)); } catch (_) {}
      if (cached) {
        Promise.resolve().then(() => {
          try { fn(cached.detail); }
          catch (err) { try { console.warn('[H2O.Core] onReady replay err ' + ev, err); } catch (_) {} }
        });
      }
      // 2) Subscribe to future emits via DOM. Catches BOTH bus-routed and
      //    direct W.dispatchEvent(...) calls — important since many existing
      //    *:ready emitters use direct dispatch.
      const wrapped = (e) => {
        try { fn((e && e.detail) || {}); }
        catch (err) { try { console.warn('[H2O.Core] onReady handler err ' + ev, err); } catch (_) {} }
      };
      try { W.addEventListener(ev, wrapped, false); } catch (_) {}
      return function offReady() {
        try { W.removeEventListener(ev, wrapped, false); } catch (_) {}
      };
    };

    // Diagnostic exposure (read-only by convention; useful for devtools
    // inspection and the proposed validation tests).
    H2O.events.__readyCache = readyCache;
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

  /* ───────────────────────────── 🟦 4b) H2O.surface ─────────────────────────────
   * Phase 3 micro-batch: canonical surface classification + change events.
   *
   * Listens to existing route signals only — does NOT install a new
   * history.pushState / replaceState wrapper (9 such wrappers already exist
   * in this codebase). Relies on:
   *   • popstate / hashchange (browser-native)
   *   • evt:h2o:route:changed / h2o:route:changed (already dispatched by
   *     1A1c MiniMap Engine and others when they detect SPA navigation)
   *
   * If routing changes are missed in practice, a guarded history wrapper
   * can be added later as a follow-up micro-patch.
   * ─────────────────────────────────────────────────────────────────────────── */
  if (!H2O.surface) {
    H2O.surface = (() => {
      const RE_GPT_CHAT  = /^\/g\/[^/]+\/c\/([a-z0-9-]+)/i;
      const RE_PROJECT   = /^\/g\/[^/]+\/project\b/i;
      const RE_GPT_HUB   = /^\/g\/[^/]+(?:\/|$)/i;
      const RE_CHAT      = /^\/c\/([a-z0-9-]+)/i;
      const RE_SETTINGS  = /^\/(?:auth|settings|admin)(?:\/|$)/i;
      const RE_LIBRARY   = /^\/library(?:\/|$)/i;
      const RE_EXPLORE   = /^\/explore(?:\/|$)/i;
      const RE_CANVAS    = /^\/canvas(?:\/|$)/i;
      const RE_GPTS      = /^\/gpts(?:\/|$)/i;
      const RE_HOME      = /^\/?$/;

      function classify(pathnameRaw) {
        const p = String(pathnameRaw || '');
        if (RE_GPT_CHAT.test(p)) return 'project-chat';
        if (RE_PROJECT.test(p))  return 'project';
        if (RE_GPT_HUB.test(p))  return 'project';
        if (RE_CHAT.test(p))     return 'chat';
        if (RE_SETTINGS.test(p)) return 'settings';
        if (RE_LIBRARY.test(p))  return 'library';
        if (RE_EXPLORE.test(p))  return 'explore';
        if (RE_CANVAS.test(p))   return 'canvas';
        if (RE_GPTS.test(p))     return 'gpts';
        if (RE_HOME.test(p))     return 'home';
        return 'unknown';
      }

      let _last = classify(location.pathname);

      function _maybeEmit() {
        let cur;
        try { cur = classify(location.pathname); }
        catch (_) { return; }
        if (cur === _last) return;
        const detail = { from: _last, to: cur, pathname: location.pathname };
        _last = cur;
        try { H2O.events?.emit?.('surface:change', detail); } catch (_) {}
        try { W.dispatchEvent(new CustomEvent('evt:h2o:surface:change', { detail })); } catch (_) {}
        try { W.dispatchEvent(new CustomEvent('h2o:surface:change', { detail })); } catch (_) {}
      }

      // Subscribe to existing route signals. No history wrapper added in
      // this batch — by design.
      try { W.addEventListener('evt:h2o:route:changed', _maybeEmit, { passive: true }); } catch (_) {}
      try { W.addEventListener('h2o:route:changed',     _maybeEmit, { passive: true }); } catch (_) {}
      try { W.addEventListener('popstate',              _maybeEmit, { passive: true }); } catch (_) {}
      try { W.addEventListener('hashchange',            _maybeEmit, { passive: true }); } catch (_) {}

      function onChange(fn) {
        if (typeof fn !== 'function') return () => {};
        const wrapped = (e) => {
          try {
            fn(e && e.detail ? e.detail : { from: null, to: classify(location.pathname), pathname: location.pathname });
          } catch (_) {}
        };
        try { W.addEventListener('evt:h2o:surface:change', wrapped, { passive: true }); } catch (_) {}
        return () => {
          try { W.removeEventListener('evt:h2o:surface:change', wrapped); } catch (_) {}
        };
      }

      function onChangeImmediate(fn) {
        if (typeof fn !== 'function') return () => {};
        try { fn({ from: null, to: classify(location.pathname), pathname: location.pathname }); } catch (_) {}
        return onChange(fn);
      }

      return Object.freeze({
        current()    { return classify(location.pathname); },
        classify,
        isChat()     { const s = classify(location.pathname); return s === 'chat' || s === 'project-chat'; },
        isProject()  { const s = classify(location.pathname); return s === 'project' || s === 'project-chat'; },
        chatId()     { return H2O.util.getChatId() || null; },
        onChange,
        onChangeImmediate,
      });
    })();
  }

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

  /* ── Chat Atlas logical ledger (LP1.1 shadow mode) ────────────────────────
   *
   * Native ChatGPT owns physical hydration. This private ledger observes its
   * persistent turn shells and groups them into logical Q+A members, but it
   * does not feed commitTurnDrafts(), existing getters, or any UI consumer
   * unless an operator explicitly selects the in-memory CV-2 alternate source.
   */
  const CHAT_ATLAS_SHELL_SEL = 'section[data-testid^="conversation-turn-"]';
  const CHAT_ATLAS_PAGE_SIZE = 25;
  const chatAtlasLedgerState = {
    ready: false,
    version: 0,
    chatKey: '',
    members: [],
    nextMemberId: 1,
    subscribers: new Set(),
    observer: null,
    observerRoot: null,
    observerActive: false,
    canonicalListenerBound: false,
    dirtyShells: new Set(),
    fullRebuildPending: false,
    raf: 0,
    buildCount: 0,
    lastBuildMs: 0,
    flushCount: 0,
    lastFlushMs: 0,
    maxFlushMs: 0,
    lastDirtyShellCount: 0,
    aliasAbsorbCount: 0,
    duplicateAliasCount: 0,
    currentCrossMemberDuplicateCount: 0,
    crossMemberAliasConflictCount: 0,
    crossMemberAliasRepairCount: 0,
    currentAliasConflictCount: 0,
    historicalAliasConflictCount: 0,
    pairingAdjacencyRejectCount: 0,
    quarantinedAliases: new Set(),
    quarantinedAliasResolutionCount: 0,
    lastAliasConflict: null,
    recentAliasConflicts: [],
    lastPairingRejection: null,
    recentPairingRejections: [],
    completeShellMap: false,
    duplicateMemberCandidates: [],
    unboundShells: [],
    parityWithCurrentTurnRuntime: false,
    parityStatus: 'not-built',
    parityDisagreements: [],
    warnings: [],
    canonicalRecordCount: 0,
    canonicalTurnVersion: 0,
    shellCount: 0,
    questionShellCount: 0,
    answerShellCount: 0,
  };

  const CHAT_ATLAS_CANONICAL_SOURCE_LEGACY = 'legacy-durable-cache';
  const CHAT_ATLAS_CANONICAL_SOURCE_LEDGER = 'chat-atlas-ledger';
  const CHAT_ATLAS_CANONICAL_SOURCES = Object.freeze([
    CHAT_ATLAS_CANONICAL_SOURCE_LEGACY,
    CHAT_ATLAS_CANONICAL_SOURCE_LEDGER,
  ]);
  const CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT = 12;
  const CHAT_ATLAS_DUAL_RUN_FIELDS = Object.freeze([
    'count',
    'order',
    'stableIdentity',
    'qId',
    'primaryAId',
    'answerIds',
    '_aliasIds',
    'turnNo',
    'idx',
    'noAnswer',
    'fieldShape',
    'missingInLegacy',
    'missingInAdapter',
    'duplicateIdentity',
    'duplicateAlias',
    'primaryRekey',
  ]);

  function createChatAtlasMismatchCounters() {
    return Object.fromEntries(CHAT_ATLAS_DUAL_RUN_FIELDS.map((field) => [field, 0]));
  }

  const chatAtlasCanonicalSourceState = {
    defaultSource: CHAT_ATLAS_CANONICAL_SOURCE_LEGACY,
    activeSource: CHAT_ATLAS_CANONICAL_SOURCE_LEGACY,
    effectiveSource: CHAT_ATLAS_CANONICAL_SOURCE_LEGACY,
    switchCount: 0,
    invalidSwitchCount: 0,
    rejectedSwitchCount: 0,
    canonicalMutationAttemptCount: 0,
    lastSwitch: null,
    lastInvalidSwitch: null,
    lastRejectedSwitch: null,
    latestLegacyRecords: [],
    latestLegacyVersion: 0,
    latestLegacyCapture: null,
    legacyCaptureCount: 0,
    lastSelection: null,
  };

  const chatAtlasDualRunState = {
    ready: false,
    comparisonCount: 0,
    sequence: 0,
    lastComparisonTimestamp: null,
    lastReason: null,
    legacyCount: 0,
    adapterCount: 0,
    countParity: false,
    orderParity: false,
    fieldShapeParity: false,
    exactParity: false,
    totalMismatchCount: 0,
    currentMismatchCount: 0,
    cleanComparisonStreak: 0,
    mismatchCountersByField: createChatAtlasMismatchCounters(),
    cumulativeMismatchCountersByField: createChatAtlasMismatchCounters(),
    missingInLegacyCount: 0,
    missingInAdapterCount: 0,
    duplicateIdentityCount: 0,
    duplicateAliasCount: 0,
    primaryRekeyCount: 0,
    recentMismatchSamples: [],
    recentSkipSamples: [],
    evidenceChatKey: '',
    comparisonEligible: false,
    comparisonActive: false,
    lastSkipReason: null,
    skippedComparisonCount: 0,
    staleCaptureSkipCount: 0,
    chatKeyMismatchSkipCount: 0,
    generationMismatchSkipCount: 0,
    reentrantSkipCount: 0,
    rebaseCount: 0,
    lastRebaseTimestamp: null,
    lastRebaseReason: null,
    comparedLedgerVersion: null,
    comparedCaptureSequence: null,
    instrumentationErrorCount: 0,
    lastInstrumentationError: null,
    warnings: [],
  };

  function chatAtlasNow() {
    try { return performance.now(); } catch { return Date.now(); }
  }

  function chatAtlasCurrentChatKey() {
    return String(H2O.util?.getChatId?.() || D.location?.pathname || '');
  }

  function chatAtlasNormalizeId(value) {
    return normalizeTurnAlias(value);
  }

  function chatAtlasFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    if (Array.isArray(value)) {
      for (const item of value) chatAtlasFreeze(item);
    } else {
      for (const item of Object.values(value)) chatAtlasFreeze(item);
    }
    try { return Object.freeze(value); } catch { return value; }
  }

  function chatAtlasShellDescriptor(shell) {
    if (!shell || !shell.isConnected) return null;
    return {
      connected: true,
      testId: String(shell.getAttribute?.(ATTR_TESTID) || ''),
      turnId: String(shell.getAttribute?.('data-turn-id') || ''),
      role: String(shell.getAttribute?.('data-turn') || ''),
    };
  }

  function chatAtlasRecordAliases(record) {
    const aliases = new Set();
    const add = (value) => {
      const id = chatAtlasNormalizeId(value);
      if (id) aliases.add(id);
    };
    add(record?.qId);
    add(record?.primaryAId);
    for (const value of record?.answerIds || []) add(value);
    for (const value of record?._aliasIds || []) add(value);
    return aliases;
  }

  function chatAtlasReadShell(shell, index) {
    if (!shell || !shell.isConnected) return null;
    let role = String(shell.getAttribute?.('data-turn') || '').trim().toLowerCase();
    let roleNode = null;
    try {
      roleNode = shell.querySelector?.(SEL_CORE_WITH_ROLE) || null;
      if (role !== 'user' && role !== 'assistant') {
        role = String(roleNode?.getAttribute?.(ATTR_MESSAGE_AUTHOR_ROLE) || '').trim().toLowerCase();
      }
    } catch { roleNode = null; }

    const shellTurnId = chatAtlasNormalizeId(shell.getAttribute?.('data-turn-id')) || null;
    const testId = String(shell.getAttribute?.(ATTR_TESTID) || '');
    const shellOrdinal = Math.max(0, Number(testId.match(/conversation-turn-(\d+)/)?.[1] || 0) || 0);
    const flowRef = shell.closest?.('main') || shell.ownerDocument?.body || null;
    const messageId = roleNode?.isConnected
      ? (chatAtlasNormalizeId(
        roleNode.getAttribute?.(ATTR_MESSAGE_ID)
        || roleNode.dataset?.messageId
        || '',
      ) || null)
      : null;
    const aliases = new Set();
    const add = (value) => {
      const id = chatAtlasNormalizeId(value);
      if (id) aliases.add(id);
    };
    add(shell.getAttribute?.('data-turn-id'));
    add(shell.getAttribute?.(ATTR_MESSAGE_ID));
    if (roleNode) {
      add(getMsgIdAttr(roleNode));
      add(roleNode.getAttribute?.('data-turn-id'));
      add(roleNode.dataset?.turnId);
    }

    return {
      shell,
      shellIndex: index,
      testId,
      shellOrdinal,
      flowRef,
      role,
      roleNode: roleNode?.isConnected ? roleNode : null,
      hydrated: !!(roleNode && roleNode.isConnected),
      aliases,
      shellTurnId,
      messageId,
      currentId: messageId || shellTurnId || null,
    };
  }

  function chatAtlasFindConversationRoot(shells) {
    const list = Array.isArray(shells) ? shells.filter((shell) => shell?.isConnected) : [];
    if (!list.length) return D.querySelector?.('main#main, #thread, main') || D.body || null;
    const first = list[0];
    const last = list[list.length - 1];
    const preferred = first.closest?.('main#main, #thread, [data-ho-chat-root="true"], [class*="group/scroll-root"], main');
    if (preferred && preferred.contains(last)) return preferred;
    let common = first.parentElement;
    while (common && !common.contains(last)) common = common.parentElement;
    return common || D.body || null;
  }

  // All DOM reads for one build happen here. The returned evidence contains
  // live references only for in-memory binding and is never persisted.
  function chatAtlasReadEvidence() {
    const started = chatAtlasNow();
    let shells = [];
    try { shells = Array.from(D.querySelectorAll(CHAT_ATLAS_SHELL_SEL)); } catch { shells = []; }
    const evidence = [];
    const unbound = [];
    let questionShellCount = 0;
    let answerShellCount = 0;

    for (let index = 0; index < shells.length; index += 1) {
      const item = chatAtlasReadShell(shells[index], index);
      if (!item || (item.role !== 'user' && item.role !== 'assistant')) {
        unbound.push({
          shellIndex: index,
          testId: String(shells[index]?.getAttribute?.(ATTR_TESTID) || ''),
          reason: item ? 'unknown-role' : 'disconnected-or-unreadable',
        });
        continue;
      }
      if (item.role === 'user') questionShellCount += 1;
      else answerShellCount += 1;
      evidence.push(item);
    }

    const canonicalRecords = turnState.turns.slice();
    const canonicalShellBindings = new Map();
    for (const record of canonicalRecords) {
      let qShell = null;
      const answerShells = [];
      try { qShell = record?.live?.qEl?.closest?.(CHAT_ATLAS_SHELL_SEL) || null; } catch {}
      for (const answerEl of record?.live?.answerEls || []) {
        try {
          const shell = answerEl?.closest?.(CHAT_ATLAS_SHELL_SEL) || null;
          if (shell) answerShells.push(shell);
        } catch {}
      }
      canonicalShellBindings.set(record, { qShell, answerShells });
    }

    return {
      shells,
      root: chatAtlasFindConversationRoot(shells),
      evidence,
      unbound,
      questionShellCount,
      answerShellCount,
      canonicalRecords,
      canonicalShellBindings,
      canonicalVersion: turnState.version,
      completeShellMap: shells.length > 0
        && unbound.length === 0
        && evidence.length === shells.length,
      readMs: Math.max(0, chatAtlasNow() - started),
    };
  }

  function chatAtlasPairEvidence(evidence) {
    const pairs = [];
    const rejectedAssistants = [];
    let current = null;
    for (const shellEvidence of Array.isArray(evidence) ? evidence : []) {
      if (shellEvidence.role === 'user') {
        current = { question: shellEvidence, answers: [] };
        pairs.push(current);
        continue;
      }
      const previousShell = current
        ? (current.answers[current.answers.length - 1] || current.question)
        : null;
      const sameFlow = !!previousShell?.flowRef && previousShell.flowRef === shellEvidence.flowRef;
      const adjacentShell = Number(shellEvidence.shellIndex) === Number(previousShell?.shellIndex) + 1;
      const adjacentOrdinal = !previousShell?.shellOrdinal
        || !shellEvidence.shellOrdinal
        || shellEvidence.shellOrdinal === previousShell.shellOrdinal + 1;
      if (!current || !previousShell || !sameFlow || !adjacentShell || !adjacentOrdinal) {
        rejectedAssistants.push({
          shellIndex: shellEvidence.shellIndex,
          shellOrdinal: shellEvidence.shellOrdinal || null,
          testId: shellEvidence.testId || '',
          previousShellIndex: previousShell?.shellIndex ?? null,
          previousShellOrdinal: previousShell?.shellOrdinal || null,
          reason: !current || !previousShell
            ? 'assistant-without-question'
            : (!sameFlow
              ? 'assistant-flow-mismatch'
              : (!adjacentShell ? 'assistant-shell-not-adjacent' : 'assistant-ordinal-not-adjacent')),
        });
        current = null;
        continue;
      }
      current.answers.push(shellEvidence);
    }
    return { pairs, rejectedAssistants };
  }

  function chatAtlasBuildOwnerMap(records, aliasFn) {
    const owners = new Map();
    for (const record of Array.isArray(records) ? records : []) {
      for (const alias of aliasFn(record)) {
        if (!owners.has(alias)) owners.set(alias, new Set());
        owners.get(alias).add(record);
      }
    }
    return owners;
  }

  function chatAtlasQuestionEvidenceAliases(pair) {
    return chatAtlasCv2CurrentIds([
      pair?.question?.messageId,
      pair?.question?.shellTurnId,
      ...(pair?.question?.aliases || []),
    ]);
  }

  function chatAtlasMatchPreviousRecord(
    pair,
    previousByQuestionShell,
    previousQuestionOwners,
    usedPrevious,
    quarantinedAliases,
  ) {
    const candidates = new Set();
    const shellCandidate = pair?.question?.shell
      ? previousByQuestionShell.get(pair.question.shell)
      : null;
    if (shellCandidate) {
      return usedPrevious.has(shellCandidate)
        ? { record: null, basis: 'question-shell-already-used', candidates: [shellCandidate] }
        : { record: shellCandidate, basis: 'question-shell', candidates: [shellCandidate] };
    }
    for (const alias of chatAtlasQuestionEvidenceAliases(pair)) {
      if (quarantinedAliases.has(alias)) continue;
      for (const owner of previousQuestionOwners.get(alias) || []) candidates.add(owner);
    }
    if (candidates.size !== 1) {
      return { record: null, basis: candidates.size ? 'ambiguous-question-alias' : 'no-positive-question-match', candidates: Array.from(candidates) };
    }
    const record = Array.from(candidates)[0];
    return usedPrevious.has(record)
      ? { record: null, basis: 'question-alias-already-used', candidates: [record] }
      : { record, basis: 'question-alias', candidates: [record] };
  }

  function chatAtlasCanonicalQuestionAliases(record) {
    return chatAtlasCv2CurrentIds([record?.qId]);
  }

  function chatAtlasMatchCanonicalRecord(
    member,
    canonicalQuestionOwners,
    canonicalShellBindings,
    usedCanonical,
    quarantinedAliases,
  ) {
    const shellCandidates = [];
    for (const [canonical, bindings] of canonicalShellBindings) {
      if (bindings?.qShell && bindings.qShell === member.question.shellRef) shellCandidates.push(canonical);
    }
    if (shellCandidates.length === 1) {
      const record = shellCandidates[0];
      return usedCanonical.has(record) ? null : record;
    }
    if (shellCandidates.length > 1) return null;

    const candidates = new Set();
    for (const alias of chatAtlasCv2CurrentIds([
      member?.question?.qId,
      ...(member?.question?.currentAliases || []),
    ])) {
      if (quarantinedAliases.has(alias)) continue;
      for (const owner of canonicalQuestionOwners.get(alias) || []) candidates.add(owner);
    }
    if (candidates.size !== 1) return null;
    const record = Array.from(candidates)[0];
    return usedCanonical.has(record) ? null : record;
  }

  function chatAtlasMemberDiagnosticRef(member) {
    return {
      logicalMemberKey: String(member?.logicalMemberKey || ''),
      turnNo: Number(member?.turnNo || 0) || null,
    };
  }

  function chatAtlasRecordAliasConflict(sample, kind = 'historical') {
    const event = {
      timestamp: new Date().toISOString(),
      flushSequence: Number(chatAtlasLedgerState.version || 0) + 1,
      ...sample,
    };
    chatAtlasLedgerState.crossMemberAliasConflictCount += 1;
    if (kind === 'current') chatAtlasLedgerState.currentAliasConflictCount += 1;
    if (kind === 'historical') chatAtlasLedgerState.historicalAliasConflictCount += 1;
    if (kind === 'repair') chatAtlasLedgerState.crossMemberAliasRepairCount += 1;
    chatAtlasLedgerState.lastAliasConflict = event;
    chatAtlasLedgerState.recentAliasConflicts.push(event);
    if (chatAtlasLedgerState.recentAliasConflicts.length > CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT) {
      chatAtlasLedgerState.recentAliasConflicts.splice(
        0,
        chatAtlasLedgerState.recentAliasConflicts.length - CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT,
      );
    }
  }

  function chatAtlasRecordPairingRejection(rejection) {
    const event = {
      timestamp: new Date().toISOString(),
      flushSequence: Number(chatAtlasLedgerState.version || 0) + 1,
      ...rejection,
    };
    chatAtlasLedgerState.pairingAdjacencyRejectCount += 1;
    chatAtlasLedgerState.lastPairingRejection = event;
    chatAtlasLedgerState.recentPairingRejections.push(event);
    if (chatAtlasLedgerState.recentPairingRejections.length > CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT) {
      chatAtlasLedgerState.recentPairingRejections.splice(
        0,
        chatAtlasLedgerState.recentPairingRejections.length - CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT,
      );
    }
  }

  function chatAtlasBuildCurrentAliasOwners(members) {
    const owners = new Map();
    const add = (member, side, path, values) => {
      for (const alias of chatAtlasCv2CurrentIds(values)) {
        if (!owners.has(alias)) owners.set(alias, new Map());
        const memberKey = String(member.logicalMemberKey || '');
        if (!owners.get(alias).has(memberKey)) {
          owners.get(alias).set(memberKey, { member, sides: new Set(), paths: new Set() });
        }
        const evidence = owners.get(alias).get(memberKey);
        evidence.sides.add(side);
        evidence.paths.add(path);
      }
    };
    for (const member of Array.isArray(members) ? members : []) {
      add(member, 'question', 'question-current-alias', member.question.currentAliases);
      add(member, 'question', 'question-shell-evidence', member.question.evidenceAliases);
      add(member, 'question', 'current-qid', [member.question.currentQId]);
      if (member.answer.currentProjectionSource === 'native-evidence') {
        add(member, 'answer', 'answer-current-alias', member.answer.currentAliases);
        add(member, 'answer', 'answer-shell-evidence', member.answer.evidenceAliases);
        add(member, 'answer', 'answer-current-id', member.answer.currentAnswerIds);
        add(member, 'answer', 'projected-primary', [member.answer.primaryAId]);
      }
    }
    return owners;
  }

  function chatAtlasPrepareAliasQuarantine(currentOwners, priorQuarantine) {
    const quarantine = new Set();
    for (const alias of priorQuarantine || []) {
      if ((currentOwners.get(alias)?.size || 0) !== 1) quarantine.add(alias);
    }
    let currentConflicts = 0;
    for (const [alias, owners] of currentOwners) {
      if (owners.size <= 1) continue;
      currentConflicts += 1;
      quarantine.add(alias);
      const entries = Array.from(owners.values());
      chatAtlasRecordAliasConflict({
        alias,
        winningMemberKey: null,
        winningTurnNo: null,
        losingMembers: entries.map((entry) => chatAtlasMemberDiagnosticRef(entry.member)),
        evidenceClass: 'current',
        evidencePaths: entries.flatMap((entry) => Array.from(entry.paths)),
        action: 'quarantined',
      }, 'current');
    }
    chatAtlasLedgerState.currentCrossMemberDuplicateCount = currentConflicts;
    return quarantine;
  }

  function chatAtlasRecordAliasRepairOnce(
    alias,
    winner,
    loser,
    evidenceClass,
    source,
    repairEventKeys,
  ) {
    const winnerRef = chatAtlasMemberDiagnosticRef(winner);
    const loserRef = chatAtlasMemberDiagnosticRef(loser);
    const key = `${alias}|${winnerRef.logicalMemberKey}|${loserRef.logicalMemberKey}`;
    if (repairEventKeys.has(key)) return;
    repairEventKeys.add(key);
    chatAtlasRecordAliasConflict({
      alias,
      winningMemberKey: winnerRef.logicalMemberKey,
      winningTurnNo: winnerRef.turnNo,
      losingMembers: [loserRef],
      evidenceClass,
      source,
      action: 'removed-from-historical-owner',
    }, 'repair');
  }

  function chatAtlasAbsorbHistoricalAliases(target, values, context) {
    let absorbed = 0;
    for (const alias of chatAtlasCv2CurrentIds(values)) {
      const currentOwners = context.currentOwners.get(alias);
      if (currentOwners?.size > 1) continue;
      if (currentOwners?.size === 1) {
        const winner = Array.from(currentOwners.values())[0].member;
        if (winner !== context.member) {
          chatAtlasRecordAliasRepairOnce(
            alias,
            winner,
            context.member,
            'current-wins-historical',
            context.source,
            context.repairEventKeys,
          );
          continue;
        }
      } else if (context.quarantine.has(alias)) {
        continue;
      }
      if (target.has(alias)) continue;
      target.add(alias);
      absorbed += 1;
    }
    return absorbed;
  }

  function chatAtlasRebuildResolverAliases(member) {
    member.aliases = new Set([
      ...(member.question.aliases || []),
      ...(member.answer.aliases || []),
      ...(member.resolverHistoryAliases || []),
    ]);
  }

  function chatAtlasRemoveResolverAlias(member, alias) {
    member.question.aliases.delete(alias);
    member.answer.aliases.delete(alias);
    member.resolverHistoryAliases.delete(alias);
    member.aliases.delete(alias);
  }

  function chatAtlasRepairResolverOwnership(
    members,
    currentOwners,
    quarantine,
    repairEventKeys,
  ) {
    for (const member of members) chatAtlasRebuildResolverAliases(member);
    const resolverOwners = chatAtlasBuildOwnerMap(members, (member) => member.aliases);
    for (const [alias, owners] of resolverOwners) {
      if (owners.size <= 1) continue;
      const current = currentOwners.get(alias);
      if (current?.size === 1) {
        const winner = Array.from(current.values())[0].member;
        for (const loser of owners) {
          if (loser === winner) continue;
          chatAtlasRemoveResolverAlias(loser, alias);
          chatAtlasRecordAliasRepairOnce(
            alias,
            winner,
            loser,
            'current-wins-historical',
            'final-resolver-repair',
            repairEventKeys,
          );
        }
        continue;
      }
      quarantine.add(alias);
      const ownerList = Array.from(owners);
      for (const member of ownerList) chatAtlasRemoveResolverAlias(member, alias);
      if (!current || current.size <= 1) {
        chatAtlasRecordAliasConflict({
          alias,
          winningMemberKey: null,
          winningTurnNo: null,
          losingMembers: ownerList.map(chatAtlasMemberDiagnosticRef),
          evidenceClass: 'historical',
          action: 'quarantined',
        }, 'historical');
      }
    }
    for (const alias of quarantine) {
      for (const member of members) chatAtlasRemoveResolverAlias(member, alias);
    }
    for (const member of members) chatAtlasRebuildResolverAliases(member);
    const finalOwners = chatAtlasBuildOwnerMap(members, (member) => member.aliases);
    chatAtlasLedgerState.quarantinedAliasResolutionCount = Array.from(quarantine)
      .filter((alias) => (finalOwners.get(alias)?.size || 0) > 0)
      .length;
    return finalOwners;
  }

  function chatAtlasRecordNoAnswerHistoryRepairs(
    previousRecord,
    member,
    currentOwners,
    repairEventKeys,
  ) {
    if (!previousRecord) return;
    const questionAliases = new Set(previousRecord.question.aliases || []);
    const dropped = chatAtlasCv2CurrentIds([
      ...(previousRecord.answer.aliases || []),
      ...Array.from(previousRecord.aliases || []).filter((alias) => !questionAliases.has(alias)),
    ]);
    for (const alias of dropped) {
      const owners = currentOwners.get(alias);
      if (owners?.size !== 1) continue;
      const winner = Array.from(owners.values())[0].member;
      if (winner === member) continue;
      chatAtlasRecordAliasRepairOnce(
        alias,
        winner,
        member,
        'current-wins-no-answer-history',
        'no-answer-history-drop',
        repairEventKeys,
      );
    }
  }

  function chatAtlasMemberSignature(member) {
    return JSON.stringify({
      key: member.logicalMemberKey,
      turnNo: member.turnNo,
      qId: member.question.qId || '',
      currentQId: member.question.currentQId || '',
      primaryAId: member.answer.primaryAId || '',
      aliases: Array.from(member.aliases).sort(),
      questionShellTurnId: member.question.shellTurnId || '',
      questionMessageId: member.question.messageId || '',
      questionCurrentAliases: member.question.currentAliases || [],
      questionEvidenceAliases: member.question.evidenceAliases || [],
      answerCurrentIds: member.answer.currentAnswerIds || [],
      answerCurrentAliases: member.answer.currentAliases || [],
      answerEvidenceAliases: member.answer.evidenceAliases || [],
      answerCurrentShells: member.answer.currentShells || [],
      answerCurrentProjectionSource: member.answer.currentProjectionSource || 'none',
      qHydrated: member.question.hydrated,
      aHydrated: member.answer.hydrated,
      noAnswer: member.noAnswer,
    });
  }

  function chatAtlasPublicMember(member) {
    return {
      logicalMemberKey: member.logicalMemberKey,
      turnNo: member.turnNo,
      question: {
        shellBinding: chatAtlasShellDescriptor(member.question.shellRef),
        shellTurnId: member.question.shellTurnId || null,
        messageId: member.question.messageId || null,
        qId: member.question.qId || null,
        currentQId: member.question.currentQId || null,
        projectedQId: member.question.qId || null,
        currentAliases: (member.question.currentAliases || []).slice(),
        evidenceAliases: (member.question.evidenceAliases || []).slice(),
        aliases: Array.from(member.question.aliases),
        hydrated: !!member.question.hydrated,
      },
      answer: {
        shellBinding: chatAtlasShellDescriptor(member.answer.shellRef),
        shellTurnId: member.answer.shellTurnId || null,
        messageId: member.answer.messageId || null,
        primaryAId: member.answer.primaryAId || null,
        projectedPrimaryAId: member.answer.primaryAId || null,
        currentAnswerIds: (member.answer.currentAnswerIds || []).slice(),
        currentAliases: (member.answer.currentAliases || []).slice(),
        evidenceAliases: (member.answer.evidenceAliases || []).slice(),
        currentShells: (member.answer.currentShells || []).map((item) => ({ ...item })),
        currentProjectionSource: member.answer.currentProjectionSource || 'none',
        aliases: Array.from(member.answer.aliases),
        hydrated: !!member.answer.hydrated,
      },
      resolverAliases: Array.from(member.aliases),
      noAnswer: !!member.noAnswer,
      hydration: member.hydration,
      pageNo: member.pageNo,
      pageIndex: member.pageIndex,
    };
  }

  function chatAtlasCv2UniqueIds(values, opts = {}) {
    const primary = chatAtlasNormalizeId(opts.primaryId) || null;
    const ids = new Set();
    for (const value of values || []) {
      const id = chatAtlasNormalizeId(value);
      if (id && id !== primary) ids.add(id);
    }
    const ordered = Array.from(ids).sort();
    if (primary) ordered.push(primary);
    return ordered;
  }

  function chatAtlasCv2CurrentIds(values) {
    const ids = new Set();
    for (const value of values || []) {
      const id = chatAtlasNormalizeId(value);
      if (id) ids.add(id);
    }
    return Array.from(ids);
  }

  function chatAtlasCv2RecordFromDraft(draft, index, logicalMemberKey = '', opts = {}) {
    const turnNo = index + 1;
    const qId = chatAtlasNormalizeId(draft?.qId) || null;
    const rawAnswerIds = Array.isArray(draft?.answerIds) ? draft.answerIds : [];
    const draftPrimary = chatAtlasNormalizeId(draft?.primaryAId)
      || chatAtlasNormalizeId(rawAnswerIds[rawAnswerIds.length - 1])
      || null;
    const preserveProjectionOrder = !!opts.preserveProjectionOrder;
    const answerIds = preserveProjectionOrder
      ? chatAtlasCv2CurrentIds(rawAnswerIds)
      : chatAtlasCv2UniqueIds(rawAnswerIds, { primaryId: draftPrimary });
    const primaryAId = preserveProjectionOrder
      ? (answerIds[answerIds.length - 1] || null)
      : (draftPrimary && answerIds.includes(draftPrimary) ? draftPrimary : null);
    const aliasIds = preserveProjectionOrder
      ? chatAtlasCv2CurrentIds(draft?.aliasIds || draft?._aliasIds || [])
      : chatAtlasCv2UniqueIds(draft?.aliasIds || draft?._aliasIds || []);
    const noAnswer = typeof draft?.noAnswer === 'boolean'
      ? draft.noAnswer
      : !primaryAId && answerIds.length === 0;
    return {
      logicalMemberKey: String(logicalMemberKey || ''),
      turnId: buildCanonicalTurnId({ turnNo, qId, primaryAId }),
      turnNo,
      idx: turnNo,
      index: turnNo,
      qId,
      primaryAId,
      answerIds,
      _aliasIds: aliasIds,
      aliasIds: aliasIds.slice(),
      hasQuestion: !!qId,
      hasAssistant: !noAnswer && answerIds.length > 0,
      noAnswer,
      live: { qEl: null, primaryAEl: null, answerEls: [], connected: false },
    };
  }

  // Pure view adapter. Resolver aliases stay broad in the ledger; canonical
  // fields project only the current native shell/message evidence.
  function buildChatAtlasLedgerCanonicalRecords(members = chatAtlasLedgerState.members) {
    const orderedMembers = Array.isArray(members)
      ? members.slice().sort((a, b) => Number(a?.turnNo || 0) - Number(b?.turnNo || 0))
      : [];
    return orderedMembers.map((member, index) => {
      const qId = chatAtlasNormalizeId(member?.question?.qId) || null;
      const answerIds = member?.noAnswer
        ? []
        : chatAtlasCv2CurrentIds(member?.answer?.currentAnswerIds || []);
      const primaryAId = member?.noAnswer
        ? null
        : (answerIds[answerIds.length - 1] || null);
      const aliasIds = chatAtlasCv2CurrentIds([
        ...(member?.question?.currentAliases || []),
        ...(member?.answer?.currentAliases || []),
      ]);
      return chatAtlasCv2RecordFromDraft({
        qId,
        primaryAId,
        answerIds,
        aliasIds,
        noAnswer: !!member?.noAnswer,
      }, index, member?.logicalMemberKey || '', { preserveProjectionOrder: true });
    });
  }

  function chatAtlasCv2RecordsToDrafts(records) {
    return (Array.isArray(records) ? records : []).map((record, index) => ({
      turnNo: index + 1,
      qId: record?.qId || null,
      primaryAId: record?.primaryAId || null,
      answerIds: Array.isArray(record?.answerIds) ? record.answerIds.slice() : [],
      aliasIds: Array.isArray(record?._aliasIds) ? record._aliasIds.slice() : [],
      noAnswer: !!record?.noAnswer,
      hasQuestion: !!record?.qId,
      hasAssistant: !record?.noAnswer && !!record?.primaryAId,
      live: { qEl: null, primaryAEl: null, answerEls: [], connected: false },
    }));
  }

  function chatAtlasCv2RecordInstrumentationError(error, operation = 'instrumentation') {
    try {
      const timestamp = new Date().toISOString();
      chatAtlasDualRunState.instrumentationErrorCount += 1;
      chatAtlasDualRunState.lastInstrumentationError = {
        operation: String(operation || 'instrumentation'),
        timestamp,
        message: String(error?.message || error || 'unknown'),
      };
    } catch {}
  }

  function chatAtlasCv2ResetBindingEvidence(chatKey, reason = 'chat-key-change') {
    const key = String(chatKey || '');
    if (chatAtlasDualRunState.evidenceChatKey === key) return;
    chatAtlasDualRunState.evidenceChatKey = key;
    chatAtlasDualRunState.ready = false;
    chatAtlasDualRunState.sequence = 0;
    chatAtlasDualRunState.lastComparisonTimestamp = null;
    chatAtlasDualRunState.lastReason = null;
    chatAtlasDualRunState.legacyCount = 0;
    chatAtlasDualRunState.adapterCount = 0;
    chatAtlasDualRunState.countParity = false;
    chatAtlasDualRunState.orderParity = false;
    chatAtlasDualRunState.fieldShapeParity = false;
    chatAtlasDualRunState.exactParity = false;
    chatAtlasDualRunState.totalMismatchCount = 0;
    chatAtlasDualRunState.currentMismatchCount = 0;
    chatAtlasDualRunState.cleanComparisonStreak = 0;
    chatAtlasDualRunState.mismatchCountersByField = createChatAtlasMismatchCounters();
    chatAtlasDualRunState.cumulativeMismatchCountersByField = createChatAtlasMismatchCounters();
    chatAtlasDualRunState.missingInLegacyCount = 0;
    chatAtlasDualRunState.missingInAdapterCount = 0;
    chatAtlasDualRunState.duplicateIdentityCount = 0;
    chatAtlasDualRunState.duplicateAliasCount = 0;
    chatAtlasDualRunState.primaryRekeyCount = 0;
    chatAtlasDualRunState.recentMismatchSamples = [];
    chatAtlasDualRunState.recentSkipSamples = [];
    chatAtlasDualRunState.comparisonEligible = false;
    chatAtlasDualRunState.lastSkipReason = null;
    chatAtlasDualRunState.comparedLedgerVersion = null;
    chatAtlasDualRunState.comparedCaptureSequence = null;
    chatAtlasDualRunState.warnings = [];
    chatAtlasDualRunState.rebaseCount += 1;
    chatAtlasDualRunState.lastRebaseTimestamp = new Date().toISOString();
    chatAtlasDualRunState.lastRebaseReason = String(reason || 'chat-key-change');
  }

  function chatAtlasCv2RecordComparisonSkip(reason, detail = {}) {
    const skipReason = String(reason || 'comparison-ineligible');
    chatAtlasDualRunState.comparisonEligible = false;
    chatAtlasDualRunState.lastSkipReason = skipReason;
    chatAtlasDualRunState.skippedComparisonCount += 1;
    if (skipReason === 'capture-generation-stale') {
      chatAtlasDualRunState.staleCaptureSkipCount += 1;
      chatAtlasDualRunState.generationMismatchSkipCount += 1;
    } else if (skipReason === 'chat-key-mismatch') {
      chatAtlasDualRunState.chatKeyMismatchSkipCount += 1;
    } else if (skipReason === 'comparison-reentrant') {
      chatAtlasDualRunState.reentrantSkipCount += 1;
    }
    const sample = {
      reason: skipReason,
      timestamp: new Date().toISOString(),
      ...detail,
    };
    chatAtlasDualRunState.recentSkipSamples.push(sample);
    if (chatAtlasDualRunState.recentSkipSamples.length > CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT) {
      chatAtlasDualRunState.recentSkipSamples.splice(
        0,
        chatAtlasDualRunState.recentSkipSamples.length - CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT,
      );
    }
    return { eligible: false, reason: skipReason };
  }

  function chatAtlasCv2CaptureLegacyDrafts(drafts) {
    const records = (Array.isArray(drafts) ? drafts : [])
      .map((draft, index) => chatAtlasCv2RecordFromDraft(draft, index));
    const sequence = chatAtlasCanonicalSourceState.legacyCaptureCount + 1;
    const chatKey = chatAtlasCurrentChatKey();
    const capture = {
      records,
      chatKey,
      sequence,
      timestamp: new Date().toISOString(),
      ledgerChatKey: String(chatAtlasLedgerState.chatKey || ''),
      ledgerVersion: Number(chatAtlasLedgerState.version || 0),
      ledgerFlushCount: Number(chatAtlasLedgerState.flushCount || 0),
      canonicalTurnVersion: Number(turnState.version || 0),
      ledgerPending: !!(
        chatAtlasLedgerState.raf
        || chatAtlasLedgerState.fullRebuildPending
        || chatAtlasLedgerState.dirtyShells.size
      ),
    };
    chatAtlasCanonicalSourceState.latestLegacyRecords = records;
    chatAtlasCanonicalSourceState.latestLegacyVersion += 1;
    chatAtlasCanonicalSourceState.legacyCaptureCount = sequence;
    chatAtlasCanonicalSourceState.latestLegacyCapture = capture;
    return capture;
  }

  function chatAtlasCv2ComparableIds(record) {
    return new Set(chatAtlasCv2UniqueIds([
      record?.turnId,
      record?.qId,
      record?.primaryAId,
      ...(record?.answerIds || []),
      ...(record?._aliasIds || []),
    ]));
  }

  function chatAtlasCv2IdentityKey(record) {
    const qId = chatAtlasNormalizeId(record?.qId);
    if (qId) return `q:${qId}`;
    const primaryAId = chatAtlasNormalizeId(record?.primaryAId);
    if (primaryAId) return `a:${primaryAId}`;
    const logicalMemberKey = String(record?.logicalMemberKey || '').trim();
    if (logicalMemberKey) return `logical:${logicalMemberKey}`;
    return `turn:${Math.max(0, Number(record?.turnNo || 0) || 0)}`;
  }

  function chatAtlasCv2OwnerMap(records, valueFn) {
    const owners = new Map();
    for (let index = 0; index < records.length; index += 1) {
      for (const value of valueFn(records[index])) {
        if (!owners.has(value)) owners.set(value, new Set());
        owners.get(value).add(index);
      }
    }
    return owners;
  }

  function chatAtlasCv2SortedIds(values) {
    return chatAtlasCv2UniqueIds(values).sort();
  }

  function chatAtlasCv2ArraysEqual(left, right) {
    const a = chatAtlasCv2SortedIds(left);
    const b = chatAtlasCv2SortedIds(right);
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }

  function chatAtlasCv2PushMismatch(counters, samples, field, detail) {
    counters[field] = (counters[field] || 0) + 1;
    if (samples.length < CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT) {
      samples.push({ field, ...detail });
    }
  }

  function chatAtlasCv2CompareCanonicalViews(legacyRecords, adapterRecords) {
    const legacy = Array.isArray(legacyRecords) ? legacyRecords : [];
    const adapter = Array.isArray(adapterRecords) ? adapterRecords : [];
    const counters = createChatAtlasMismatchCounters();
    const samples = [];
    const legacyAliasOwners = chatAtlasCv2OwnerMap(legacy, chatAtlasCv2ComparableIds);
    const legacyIdentityOwners = chatAtlasCv2OwnerMap(legacy, (record) => [chatAtlasCv2IdentityKey(record)]);
    const adapterIdentityOwners = chatAtlasCv2OwnerMap(adapter, (record) => [chatAtlasCv2IdentityKey(record)]);
    const legacyAllAliasOwners = chatAtlasCv2OwnerMap(legacy, chatAtlasCv2ComparableIds);
    const adapterAllAliasOwners = chatAtlasCv2OwnerMap(adapter, chatAtlasCv2ComparableIds);
    const usedLegacy = new Set();

    if (legacy.length !== adapter.length) {
      chatAtlasCv2PushMismatch(counters, samples, 'count', {
        reason: 'record-count-mismatch',
        legacyCount: legacy.length,
        adapterCount: adapter.length,
      });
    }

    for (const [identity, owners] of legacyIdentityOwners) {
      if (owners.size > 1) chatAtlasCv2PushMismatch(counters, samples, 'duplicateIdentity', { source: 'legacy', identity, indexes: Array.from(owners) });
    }
    for (const [identity, owners] of adapterIdentityOwners) {
      if (owners.size > 1) chatAtlasCv2PushMismatch(counters, samples, 'duplicateIdentity', { source: 'adapter', identity, indexes: Array.from(owners) });
    }
    for (const [alias, owners] of legacyAllAliasOwners) {
      if (owners.size > 1) chatAtlasCv2PushMismatch(counters, samples, 'duplicateAlias', { source: 'legacy', alias, indexes: Array.from(owners) });
    }
    for (const [alias, owners] of adapterAllAliasOwners) {
      if (owners.size > 1) chatAtlasCv2PushMismatch(counters, samples, 'duplicateAlias', { source: 'adapter', alias, indexes: Array.from(owners) });
    }

    for (let adapterIndex = 0; adapterIndex < adapter.length; adapterIndex += 1) {
      const adapted = adapter[adapterIndex];
      const candidates = new Set();
      for (const id of chatAtlasCv2ComparableIds(adapted)) {
        for (const legacyIndex of legacyAliasOwners.get(id) || []) {
          if (!usedLegacy.has(legacyIndex)) candidates.add(legacyIndex);
        }
      }
      let legacyIndex = candidates.size === 1 ? Array.from(candidates)[0] : -1;
      if (legacyIndex < 0 && candidates.size === 0 && legacy[adapterIndex] && !usedLegacy.has(adapterIndex)) {
        const fallback = legacy[adapterIndex];
        if (!chatAtlasCv2ComparableIds(adapted).size && !chatAtlasCv2ComparableIds(fallback).size) {
          legacyIndex = adapterIndex;
        }
      }
      if (legacyIndex < 0) {
        chatAtlasCv2PushMismatch(counters, samples, 'stableIdentity', {
          adapterIndex,
          logicalMemberKey: adapted?.logicalMemberKey || '',
          turnNo: adapted?.turnNo || adapterIndex + 1,
          reason: candidates.size > 1 ? 'ambiguous-legacy-identity' : 'no-record-local-identity-match',
        });
        chatAtlasCv2PushMismatch(counters, samples, 'missingInLegacy', {
          adapterIndex,
          logicalMemberKey: adapted?.logicalMemberKey || '',
          turnNo: adapted?.turnNo || adapterIndex + 1,
          reason: candidates.size > 1 ? 'ambiguous-legacy-identity' : 'legacy-record-not-found',
          candidateIndexes: Array.from(candidates),
        });
        continue;
      }
      usedLegacy.add(legacyIndex);
      const current = legacy[legacyIndex];
      const context = {
        logicalMemberKey: adapted?.logicalMemberKey || '',
        adapterIndex,
        legacyIndex,
        turnNo: adapted?.turnNo || adapterIndex + 1,
      };
      if (legacyIndex !== adapterIndex) {
        chatAtlasCv2PushMismatch(counters, samples, 'order', { ...context, reason: 'logical-order-mismatch' });
      }
      if (!current || typeof current !== 'object'
        || !Array.isArray(current.answerIds)
        || !Array.isArray(current._aliasIds)
        || !adapted || typeof adapted !== 'object'
        || !Array.isArray(adapted.answerIds)
        || !Array.isArray(adapted._aliasIds)) {
        chatAtlasCv2PushMismatch(counters, samples, 'fieldShape', { ...context, reason: 'required-field-shape-mismatch' });
      }
      for (const field of ['qId', 'primaryAId', 'turnNo', 'idx', 'noAnswer']) {
        const left = field === 'qId' || field === 'primaryAId'
          ? (chatAtlasNormalizeId(current?.[field]) || null)
          : current?.[field];
        const right = field === 'qId' || field === 'primaryAId'
          ? (chatAtlasNormalizeId(adapted?.[field]) || null)
          : adapted?.[field];
        if (left !== right) {
          chatAtlasCv2PushMismatch(counters, samples, field, { ...context, legacyValue: left, adapterValue: right });
          if (field === 'primaryAId' && left && right) {
            chatAtlasCv2PushMismatch(counters, samples, 'primaryRekey', {
              ...context,
              legacyPrimaryAId: left,
              adapterPrimaryAId: right,
            });
          }
        }
      }
      if (!chatAtlasCv2ArraysEqual(current?.answerIds, adapted?.answerIds)) {
        chatAtlasCv2PushMismatch(counters, samples, 'answerIds', {
          ...context,
          legacyValue: chatAtlasCv2SortedIds(current?.answerIds),
          adapterValue: chatAtlasCv2SortedIds(adapted?.answerIds),
        });
      }
      if (!chatAtlasCv2ArraysEqual(current?._aliasIds, adapted?._aliasIds)) {
        chatAtlasCv2PushMismatch(counters, samples, '_aliasIds', {
          ...context,
          legacyValue: chatAtlasCv2SortedIds(current?._aliasIds),
          adapterValue: chatAtlasCv2SortedIds(adapted?._aliasIds),
        });
      }
    }

    for (let legacyIndex = 0; legacyIndex < legacy.length; legacyIndex += 1) {
      if (usedLegacy.has(legacyIndex)) continue;
      chatAtlasCv2PushMismatch(counters, samples, 'missingInAdapter', {
        legacyIndex,
        turnNo: legacy[legacyIndex]?.turnNo || legacyIndex + 1,
        reason: 'adapter-record-not-found',
      });
    }

    const currentMismatchCount = Object.values(counters).reduce((sum, value) => sum + value, 0);
    return {
      counters,
      samples,
      currentMismatchCount,
      countParity: counters.count === 0,
      orderParity: counters.order === 0 && counters.missingInLegacy === 0 && counters.missingInAdapter === 0,
      fieldShapeParity: counters.fieldShape === 0,
      exactParity: currentMismatchCount === 0,
    };
  }

  function chatAtlasCv2ComparisonEligibility() {
    if (chatAtlasDualRunState.comparisonActive) {
      return chatAtlasCv2RecordComparisonSkip('comparison-reentrant');
    }
    const capture = chatAtlasCanonicalSourceState.latestLegacyCapture;
    if (!capture || !Array.isArray(capture.records)) {
      return chatAtlasCv2RecordComparisonSkip('missing-legacy-capture');
    }
    if (!chatAtlasLedgerState.ready || !chatAtlasLedgerState.members.length) {
      return chatAtlasCv2RecordComparisonSkip('ledger-not-ready', {
        captureSequence: capture.sequence,
      });
    }
    const currentChatKey = chatAtlasCurrentChatKey();
    const ledgerChatKey = String(chatAtlasLedgerState.chatKey || '');
    if (!currentChatKey
      || capture.chatKey !== currentChatKey
      || ledgerChatKey !== currentChatKey
      || capture.ledgerChatKey !== ledgerChatKey) {
      return chatAtlasCv2RecordComparisonSkip('chat-key-mismatch', {
        captureChatKey: capture.chatKey,
        captureLedgerChatKey: capture.ledgerChatKey,
        ledgerChatKey,
        currentChatKey,
        captureSequence: capture.sequence,
      });
    }
    const currentLedgerVersion = Number(chatAtlasLedgerState.version || 0);
    const currentLedgerFlushCount = Number(chatAtlasLedgerState.flushCount || 0);
    const ledgerPending = !!(
      chatAtlasLedgerState.raf
      || chatAtlasLedgerState.fullRebuildPending
      || chatAtlasLedgerState.dirtyShells.size
    );
    if (capture.ledgerPending
      || ledgerPending
      || Number(capture.ledgerVersion) !== currentLedgerVersion
      || Number(capture.ledgerFlushCount) !== currentLedgerFlushCount) {
      return chatAtlasCv2RecordComparisonSkip('capture-generation-stale', {
        captureSequence: capture.sequence,
        captureLedgerVersion: capture.ledgerVersion,
        ledgerVersion: currentLedgerVersion,
        captureLedgerFlushCount: capture.ledgerFlushCount,
        ledgerFlushCount: currentLedgerFlushCount,
        captureLedgerPending: !!capture.ledgerPending,
        ledgerPending,
      });
    }
    return {
      eligible: true,
      capture,
      ledgerVersion: currentLedgerVersion,
      ledgerFlushCount: currentLedgerFlushCount,
      ledgerChatKey,
    };
  }

  function chatAtlasRunCanonicalDualComparison(reason = 'ledger-update') {
    let eligibility = null;
    try {
      eligibility = chatAtlasCv2ComparisonEligibility();
    } catch (error) {
      chatAtlasCv2RecordInstrumentationError(error, 'comparison-eligibility');
      return { eligible: false, ok: false, reason: 'instrumentation-failed' };
    }
    if (!eligibility.eligible) return eligibility;
    chatAtlasDualRunState.comparisonActive = true;
    try {
      const capture = eligibility.capture;
      const legacy = capture.records;
      const adapter = buildChatAtlasLedgerCanonicalRecords();
      const result = chatAtlasCv2CompareCanonicalViews(legacy, adapter);
      chatAtlasDualRunState.ready = true;
      chatAtlasDualRunState.comparisonEligible = true;
      chatAtlasDualRunState.comparisonCount += 1;
      chatAtlasDualRunState.sequence = chatAtlasLedgerState.version;
      chatAtlasDualRunState.lastComparisonTimestamp = new Date().toISOString();
      chatAtlasDualRunState.lastReason = String(reason || 'ledger-update');
      chatAtlasDualRunState.legacyCount = legacy.length;
      chatAtlasDualRunState.adapterCount = adapter.length;
      chatAtlasDualRunState.countParity = result.countParity;
      chatAtlasDualRunState.orderParity = result.orderParity;
      chatAtlasDualRunState.fieldShapeParity = result.fieldShapeParity;
      chatAtlasDualRunState.exactParity = result.exactParity;
      chatAtlasDualRunState.currentMismatchCount = result.currentMismatchCount;
      chatAtlasDualRunState.totalMismatchCount += result.currentMismatchCount;
      chatAtlasDualRunState.cleanComparisonStreak = result.exactParity
        ? chatAtlasDualRunState.cleanComparisonStreak + 1
        : 0;
      chatAtlasDualRunState.mismatchCountersByField = { ...result.counters };
      for (const field of CHAT_ATLAS_DUAL_RUN_FIELDS) {
        chatAtlasDualRunState.cumulativeMismatchCountersByField[field] += result.counters[field] || 0;
      }
      chatAtlasDualRunState.missingInLegacyCount = result.counters.missingInLegacy;
      chatAtlasDualRunState.missingInAdapterCount = result.counters.missingInAdapter;
      chatAtlasDualRunState.duplicateIdentityCount = result.counters.duplicateIdentity;
      chatAtlasDualRunState.duplicateAliasCount = result.counters.duplicateAlias;
      chatAtlasDualRunState.primaryRekeyCount = result.counters.primaryRekey;
      chatAtlasDualRunState.recentMismatchSamples = result.samples.slice(0, CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT);
      chatAtlasDualRunState.comparedLedgerVersion = eligibility.ledgerVersion;
      chatAtlasDualRunState.comparedCaptureSequence = capture.sequence;
      chatAtlasDualRunState.warnings = [];
      return { eligible: true, exact: result.exactParity };
    } catch (error) {
      chatAtlasCv2RecordInstrumentationError(error, 'dual-run-comparison');
      return { eligible: true, ok: false, reason: 'instrumentation-failed' };
    } finally {
      chatAtlasDualRunState.comparisonActive = false;
    }
  }

  function chatAtlasCanonicalSourceDiagnostics() {
    return {
      defaultSource: chatAtlasCanonicalSourceState.defaultSource,
      activeSource: chatAtlasCanonicalSourceState.activeSource,
      effectiveSource: chatAtlasCanonicalSourceState.effectiveSource,
      supportedSources: CHAT_ATLAS_CANONICAL_SOURCES.slice(),
      switchCount: chatAtlasCanonicalSourceState.switchCount,
      invalidSwitchCount: chatAtlasCanonicalSourceState.invalidSwitchCount,
      rejectedSwitchCount: chatAtlasCanonicalSourceState.rejectedSwitchCount,
      lastSourceSwitch: chatAtlasCanonicalSourceState.lastSwitch ? { ...chatAtlasCanonicalSourceState.lastSwitch } : null,
      lastInvalidSwitch: chatAtlasCanonicalSourceState.lastInvalidSwitch ? { ...chatAtlasCanonicalSourceState.lastInvalidSwitch } : null,
      lastRejectedSwitch: chatAtlasCanonicalSourceState.lastRejectedSwitch ? { ...chatAtlasCanonicalSourceState.lastRejectedSwitch } : null,
      lastSelection: chatAtlasCanonicalSourceState.lastSelection ? { ...chatAtlasCanonicalSourceState.lastSelection } : null,
      persisted: false,
    };
  }

  function chatAtlasDualRunDiagnostics() {
    const capture = chatAtlasCanonicalSourceState.latestLegacyCapture;
    return {
      ready: chatAtlasDualRunState.ready,
      status: chatAtlasDualRunState.ready
        ? (chatAtlasDualRunState.exactParity ? 'exact' : 'mismatch')
        : 'not-ready',
      comparisonCount: chatAtlasDualRunState.comparisonCount,
      flushComparisonSequence: chatAtlasDualRunState.sequence,
      lastComparisonTimestamp: chatAtlasDualRunState.lastComparisonTimestamp,
      lastReason: chatAtlasDualRunState.lastReason,
      legacyCount: chatAtlasDualRunState.legacyCount,
      adapterCount: chatAtlasDualRunState.adapterCount,
      countParity: chatAtlasDualRunState.countParity,
      orderParity: chatAtlasDualRunState.orderParity,
      fieldShapeParity: chatAtlasDualRunState.fieldShapeParity,
      exactParity: chatAtlasDualRunState.exactParity,
      totalMismatchCount: chatAtlasDualRunState.totalMismatchCount,
      currentMismatchCount: chatAtlasDualRunState.currentMismatchCount,
      cleanComparisonStreak: chatAtlasDualRunState.cleanComparisonStreak,
      mismatchCountersByField: { ...chatAtlasDualRunState.mismatchCountersByField },
      cumulativeMismatchCountersByField: { ...chatAtlasDualRunState.cumulativeMismatchCountersByField },
      missingInLegacyCount: chatAtlasDualRunState.missingInLegacyCount,
      missingInAdapterCount: chatAtlasDualRunState.missingInAdapterCount,
      duplicateIdentityCount: chatAtlasDualRunState.duplicateIdentityCount,
      duplicateAliasCount: chatAtlasDualRunState.duplicateAliasCount,
      primaryRekeyCount: chatAtlasDualRunState.primaryRekeyCount,
      recentMismatchSamples: chatAtlasDualRunState.recentMismatchSamples.map((sample) => ({ ...sample })),
      recentSkipSamples: chatAtlasDualRunState.recentSkipSamples.map((sample) => ({ ...sample })),
      mismatchSampleLimit: CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT,
      evidenceChatKey: chatAtlasDualRunState.evidenceChatKey,
      legacyCaptureChatKey: capture?.chatKey || '',
      ledgerChatKey: String(chatAtlasLedgerState.chatKey || ''),
      legacyCaptureSequence: capture?.sequence ?? null,
      legacyCaptureCount: chatAtlasCanonicalSourceState.legacyCaptureCount,
      legacyCaptureTimestamp: capture?.timestamp || null,
      captureLedgerVersion: capture?.ledgerVersion ?? null,
      captureLedgerFlushCount: capture?.ledgerFlushCount ?? null,
      captureCanonicalTurnVersion: capture?.canonicalTurnVersion ?? null,
      captureLedgerPending: capture?.ledgerPending ?? null,
      comparedLedgerVersion: chatAtlasDualRunState.comparedLedgerVersion,
      comparedCaptureSequence: chatAtlasDualRunState.comparedCaptureSequence,
      comparisonEligible: chatAtlasDualRunState.comparisonEligible,
      lastSkipReason: chatAtlasDualRunState.lastSkipReason,
      skippedComparisonCount: chatAtlasDualRunState.skippedComparisonCount,
      staleCaptureSkipCount: chatAtlasDualRunState.staleCaptureSkipCount,
      chatKeyMismatchSkipCount: chatAtlasDualRunState.chatKeyMismatchSkipCount,
      generationMismatchSkipCount: chatAtlasDualRunState.generationMismatchSkipCount,
      reentrantSkipCount: chatAtlasDualRunState.reentrantSkipCount,
      rebaseCount: chatAtlasDualRunState.rebaseCount,
      lastRebaseTimestamp: chatAtlasDualRunState.lastRebaseTimestamp,
      lastRebaseReason: chatAtlasDualRunState.lastRebaseReason,
      instrumentationErrorCount: chatAtlasDualRunState.instrumentationErrorCount,
      lastInstrumentationError: chatAtlasDualRunState.lastInstrumentationError
        ? { ...chatAtlasDualRunState.lastInstrumentationError }
        : null,
      warnings: chatAtlasDualRunState.warnings.slice(),
      domWriteCount: 0,
      storageWriteCount: 0,
      physicalExecutorCallCount: 0,
      paginationExecutorCallCount: 0,
      unmountExecutorCallCount: 0,
    };
  }

  function getChatAtlasCanonicalSource() {
    return chatAtlasCanonicalSourceState.activeSource;
  }

  function chatAtlasLedgerCanonicalSourceReady() {
    const currentChatKey = chatAtlasCurrentChatKey();
    return !!chatAtlasLedgerState.ready
      && !!chatAtlasLedgerState.members.length
      && chatAtlasLedgerState.chatKey === currentChatKey;
  }

  function setChatAtlasCanonicalSource(value) {
    const requested = String(value || '').trim();
    if (!CHAT_ATLAS_CANONICAL_SOURCES.includes(requested)) {
      chatAtlasCanonicalSourceState.invalidSwitchCount += 1;
      chatAtlasCanonicalSourceState.lastInvalidSwitch = {
        requested,
        activeSource: chatAtlasCanonicalSourceState.activeSource,
        timestamp: new Date().toISOString(),
        reason: 'unsupported-source',
      };
      return chatAtlasFreeze({ ok: false, reason: 'unsupported-source', ...chatAtlasCanonicalSourceDiagnostics() });
    }
    if (requested === chatAtlasCanonicalSourceState.activeSource) {
      return chatAtlasFreeze({ ok: true, changed: false, ...chatAtlasCanonicalSourceDiagnostics() });
    }
    if (requested === CHAT_ATLAS_CANONICAL_SOURCE_LEDGER
      && !chatAtlasLedgerCanonicalSourceReady()) {
      chatAtlasCanonicalSourceState.rejectedSwitchCount += 1;
      chatAtlasCanonicalSourceState.lastRejectedSwitch = {
        requested,
        activeSource: chatAtlasCanonicalSourceState.activeSource,
        timestamp: new Date().toISOString(),
        reason: 'ledger-not-ready',
      };
      return chatAtlasFreeze({ ok: false, reason: 'ledger-not-ready', ...chatAtlasCanonicalSourceDiagnostics() });
    }

    const previous = chatAtlasCanonicalSourceState.activeSource;
    const switchedAt = new Date().toISOString();
    chatAtlasCanonicalSourceState.activeSource = requested;
    chatAtlasCanonicalSourceState.canonicalMutationAttemptCount += 1;
    try {
      buildTurns();
      chatAtlasCanonicalSourceState.switchCount += 1;
      chatAtlasCanonicalSourceState.lastSwitch = {
        from: previous,
        to: requested,
        timestamp: switchedAt,
        reason: 'operator',
      };
      return chatAtlasFreeze({ ok: true, changed: true, ...chatAtlasCanonicalSourceDiagnostics() });
    } catch (error) {
      const fallbackSource = requested === CHAT_ATLAS_CANONICAL_SOURCE_LEGACY
        ? CHAT_ATLAS_CANONICAL_SOURCE_LEGACY
        : previous;
      chatAtlasCanonicalSourceState.activeSource = fallbackSource;
      if (fallbackSource === CHAT_ATLAS_CANONICAL_SOURCE_LEGACY) {
        chatAtlasCanonicalSourceState.effectiveSource = CHAT_ATLAS_CANONICAL_SOURCE_LEGACY;
      }
      chatAtlasCanonicalSourceState.rejectedSwitchCount += 1;
      chatAtlasCanonicalSourceState.lastRejectedSwitch = {
        requested,
        activeSource: fallbackSource,
        timestamp: switchedAt,
        reason: `canonical-rebuild-failed:${String(error?.message || error || 'unknown')}`,
      };
      if (requested !== CHAT_ATLAS_CANONICAL_SOURCE_LEGACY) {
        try { buildTurns(); } catch {}
      }
      return chatAtlasFreeze({ ok: false, reason: 'canonical-rebuild-failed', ...chatAtlasCanonicalSourceDiagnostics() });
    }
  }

  function selectChatAtlasCanonicalDrafts(legacyDrafts) {
    const legacyCanonicalDrafts = Array.isArray(legacyDrafts) ? legacyDrafts : [];
    try {
      chatAtlasCv2CaptureLegacyDrafts(legacyCanonicalDrafts);
      chatAtlasRunCanonicalDualComparison('legacy-capture');
    } catch (error) {
      chatAtlasCv2RecordInstrumentationError(error, 'legacy-capture');
    }
    let selectedDrafts = legacyCanonicalDrafts;
    let effectiveSource = CHAT_ATLAS_CANONICAL_SOURCE_LEGACY;
    if (chatAtlasCanonicalSourceState.activeSource === CHAT_ATLAS_CANONICAL_SOURCE_LEDGER
      && chatAtlasLedgerCanonicalSourceReady()) {
      selectedDrafts = chatAtlasCv2RecordsToDrafts(buildChatAtlasLedgerCanonicalRecords());
      effectiveSource = CHAT_ATLAS_CANONICAL_SOURCE_LEDGER;
    }
    chatAtlasCanonicalSourceState.effectiveSource = effectiveSource;
    chatAtlasCanonicalSourceState.lastSelection = {
      activeSource: chatAtlasCanonicalSourceState.activeSource,
      effectiveSource,
      legacyCount: legacyCanonicalDrafts.length,
      selectedCount: selectedDrafts.length,
      ledgerReady: !!chatAtlasLedgerState.ready,
      ledgerSourceReady: chatAtlasLedgerCanonicalSourceReady(),
      timestamp: new Date().toISOString(),
    };
    return selectedDrafts;
  }

  function chatAtlasComputeParity(members, canonicalRecords) {
    const disagreements = [];
    const canonical = Array.isArray(canonicalRecords) ? canonicalRecords : [];
    const total = Math.max(members.length, canonical.length);
    for (let index = 0; index < total; index += 1) {
      const shadow = members[index] || null;
      const current = canonical[index] || null;
      if (!shadow || !current) {
        disagreements.push({
          turnNo: index + 1,
          reason: shadow ? 'missing-current-turn-runtime-record' : 'missing-shadow-member',
        });
        continue;
      }
      const currentAliases = chatAtlasRecordAliases(current);
      const overlap = Array.from(shadow.aliases).some((alias) => currentAliases.has(alias));
      if (!overlap) {
        disagreements.push({
          turnNo: index + 1,
          reason: 'identity-alias-disagreement',
          shadowKey: shadow.logicalMemberKey,
          currentTurnId: String(current.turnId || ''),
        });
      }
    }
    return {
      exact: members.length === canonical.length && disagreements.length === 0,
      status: members.length === canonical.length
        ? (disagreements.length ? 'identity-disagreement' : 'exact')
        : 'count-difference-explained-by-hydration-or-legacy-witness',
      disagreements,
    };
  }

  function chatAtlasApplyEvidence(read, reason, isFlush) {
    const started = chatAtlasNow();
    const nextChatKey = chatAtlasCurrentChatKey();
    const previousLedgerChatKey = String(chatAtlasLedgerState.chatKey || '');
    const previous = chatAtlasLedgerState.members;
    const previousByQuestionShell = new Map();
    for (const record of previous) {
      if (record.question.shellRef) previousByQuestionShell.set(record.question.shellRef, record);
    }
    const previousQuestionOwners = chatAtlasBuildOwnerMap(previous, (record) => chatAtlasCv2CurrentIds([
      record?.question?.qId,
      ...(record?.question?.currentAliases || []),
    ]));
    const canonicalQuestionOwners = chatAtlasBuildOwnerMap(read.canonicalRecords, chatAtlasCanonicalQuestionAliases);
    const pairing = chatAtlasPairEvidence(read.evidence);
    for (const rejection of pairing.rejectedAssistants) chatAtlasRecordPairingRejection(rejection);
    const completeShellMap = !!read.completeShellMap && pairing.rejectedAssistants.length === 0;
    if (!completeShellMap && previous.length) {
      chatAtlasLedgerState.completeShellMap = false;
      chatAtlasLedgerState.unboundShells = [
        ...read.unbound,
        ...pairing.rejectedAssistants.map((item) => ({ ...item, reason: `pairing-rejected:${item.reason}` })),
      ];
      chatAtlasLedgerState.warnings = ['incomplete-stable-shell-map-retained-prior-ledger'];
      return chatAtlasFreeze({
        reason: String(reason || 'unknown'),
        version: chatAtlasLedgerState.version,
        added: [],
        removed: [],
        updated: [],
        memberCount: previous.length,
        shellCount: read.shells.length,
        skipped: true,
        skipReason: 'incomplete-stable-shell-map',
      });
    }
    const pairs = pairing.pairs;
    const next = [];
    const buildContexts = [];
    const candidateConflicts = [];
    const usedPrevious = new Set();
    const usedCanonical = new Set();
    const priorQuarantine = previousLedgerChatKey === nextChatKey
      ? new Set(chatAtlasLedgerState.quarantinedAliases)
      : new Set();
    const repairEventKeys = new Set();
    let absorbed = 0;

    for (let index = 0; index < pairs.length; index += 1) {
      const pair = pairs[index];
      const previousMatch = chatAtlasMatchPreviousRecord(
        pair,
        previousByQuestionShell,
        previousQuestionOwners,
        usedPrevious,
        priorQuarantine,
      );
      if (!previousMatch.record && previousMatch.candidates.length) {
        candidateConflicts.push({
          turnNo: index + 1,
          reason: previousMatch.basis,
          candidateKeys: previousMatch.candidates.map((item) => item.logicalMemberKey),
        });
      }
      const previousRecord = previousMatch.record;
      if (previousRecord) usedPrevious.add(previousRecord);

      const lastAnswer = pair.answers[pair.answers.length - 1] || null;
      const questionCurrentAliases = chatAtlasCv2CurrentIds([
        pair.question?.messageId,
        pair.question?.shellTurnId,
      ]);
      const currentQId = questionCurrentAliases[0] || null;
      const projectedQId = currentQId || previousRecord?.question?.qId || null;
      const questionEvidenceAliases = chatAtlasCv2CurrentIds([
        ...(pair.question?.aliases || []),
        ...questionCurrentAliases,
      ]);
      const currentAnswerShells = pair.answers.map((answer) => ({
        shellTurnId: answer?.shellTurnId || null,
        messageId: answer?.messageId || null,
        currentAnswerId: answer?.messageId || answer?.shellTurnId || null,
      }));
      const answerCurrentAliases = chatAtlasCv2CurrentIds(
        currentAnswerShells.flatMap((answer) => [answer.shellTurnId, answer.messageId]),
      );
      const currentAnswerIds = chatAtlasCv2CurrentIds(
        currentAnswerShells.map((answer) => answer.currentAnswerId),
      );
      const answerEvidenceAliases = chatAtlasCv2CurrentIds([
        ...pair.answers.flatMap((answer) => Array.from(answer?.aliases || [])),
        ...answerCurrentAliases,
        ...currentAnswerIds,
      ]);
      let currentProjectionSource = currentAnswerIds.length ? 'native-evidence' : 'none';
      if (pair.answers.length && !currentAnswerIds.length && previousRecord?.answer?.primaryAId) {
        currentAnswerIds.push(previousRecord.answer.primaryAId);
        currentProjectionSource = 'previous-primary-fallback';
      }
      const projectedPrimaryAId = currentAnswerIds[currentAnswerIds.length - 1] || null;
      const member = {
        logicalMemberKey: previousRecord?.logicalMemberKey || `atlas:${chatAtlasLedgerState.nextMemberId++}`,
        turnNo: index + 1,
        aliases: new Set(),
        resolverHistoryAliases: new Set(),
        question: {
          shellRef: pair.question?.shell?.isConnected ? pair.question.shell : null,
          shellTurnId: pair.question?.shellTurnId || null,
          messageId: pair.question?.messageId || null,
          qId: projectedQId,
          currentQId,
          currentAliases: questionCurrentAliases,
          evidenceAliases: questionEvidenceAliases,
          aliases: new Set(),
          hydrated: !!pair.question?.hydrated,
        },
        answer: {
          shellRef: lastAnswer?.shell?.isConnected ? lastAnswer.shell : null,
          shellTurnId: lastAnswer?.shellTurnId || null,
          messageId: lastAnswer?.messageId || null,
          primaryAId: projectedPrimaryAId,
          currentAnswerIds,
          currentAliases: answerCurrentAliases,
          currentShells: currentAnswerShells,
          currentProjectionSource,
          evidenceAliases: answerEvidenceAliases,
          aliases: new Set(),
          hydrated: pair.answers.some((answer) => !!answer.hydrated),
        },
        noAnswer: pair.answers.length === 0,
        hydration: 'none',
        pageNo: Math.floor(index / CHAT_ATLAS_PAGE_SIZE) + 1,
        pageIndex: Math.floor(index / CHAT_ATLAS_PAGE_SIZE),
      };
      next.push(member);
      buildContexts.push({ member, previousRecord, pair });
    }

    const currentOwners = chatAtlasBuildCurrentAliasOwners(next);
    const quarantine = chatAtlasPrepareAliasQuarantine(currentOwners, priorQuarantine);
    for (const member of next) {
      member.question.aliases = new Set(member.question.evidenceAliases.filter((alias) => !quarantine.has(alias)));
      member.answer.aliases = new Set(member.answer.evidenceAliases.filter((alias) => !quarantine.has(alias)));
    }

    for (const context of buildContexts) {
      const { member, previousRecord, pair } = context;
      const absorbContext = (source) => ({
        member,
        currentOwners,
        quarantine,
        repairEventKeys,
        source,
      });
      const trueNoAnswer = completeShellMap && pair.answers.length === 0 && member.noAnswer;
      if (previousRecord) {
        absorbed += chatAtlasAbsorbHistoricalAliases(
          member.question.aliases,
          previousRecord.question.aliases,
          absorbContext('previous-question-history'),
        );
        if (member.noAnswer) {
          if (trueNoAnswer) {
            chatAtlasRecordNoAnswerHistoryRepairs(
              previousRecord,
              member,
              currentOwners,
              repairEventKeys,
            );
          }
        } else {
          absorbed += chatAtlasAbsorbHistoricalAliases(
            member.answer.aliases,
            previousRecord.answer.aliases,
            absorbContext('previous-answer-history'),
          );
          absorbed += chatAtlasAbsorbHistoricalAliases(
            member.resolverHistoryAliases,
            previousRecord.aliases,
            absorbContext('previous-resolver-history'),
          );
        }
      }

      const canonical = chatAtlasMatchCanonicalRecord(
        member,
        canonicalQuestionOwners,
        read.canonicalShellBindings,
        usedCanonical,
        quarantine,
      );
      if (canonical) {
        usedCanonical.add(canonical);
        absorbed += chatAtlasAbsorbHistoricalAliases(
          member.question.aliases,
          [canonical.qId],
          absorbContext('canonical-question-enrichment'),
        );
        if (!member.noAnswer) {
          absorbed += chatAtlasAbsorbHistoricalAliases(
            member.answer.aliases,
            [canonical.primaryAId, ...(canonical.answerIds || [])],
            absorbContext('canonical-answer-enrichment'),
          );
          absorbed += chatAtlasAbsorbHistoricalAliases(
            member.resolverHistoryAliases,
            chatAtlasRecordAliases(canonical),
            absorbContext('canonical-resolver-enrichment'),
          );
        }
      }

      chatAtlasRebuildResolverAliases(member);
      member.hydration = member.question.hydrated && member.answer.hydrated
        ? 'both'
        : (member.question.hydrated ? 'question' : (member.answer.hydrated ? 'answer' : 'none'));
    }

    const aliasOwners = chatAtlasRepairResolverOwnership(
      next,
      currentOwners,
      quarantine,
      repairEventKeys,
    );
    const duplicateAliases = Array.from(aliasOwners.entries())
      .filter(([, owners]) => owners.size > 1)
      .map(([alias, owners]) => ({ alias, memberKeys: Array.from(owners).map((record) => record.logicalMemberKey) }));
    const parity = chatAtlasComputeParity(next, read.canonicalRecords);
    const previousSignatures = new Map(previous.map((member) => [member.logicalMemberKey, chatAtlasMemberSignature(member)]));
    const nextSignatures = new Map(next.map((member) => [member.logicalMemberKey, chatAtlasMemberSignature(member)]));
    const added = next.filter((member) => !previousSignatures.has(member.logicalMemberKey)).map((member) => member.logicalMemberKey);
    const removed = previous.filter((member) => !nextSignatures.has(member.logicalMemberKey)).map((member) => member.logicalMemberKey);
    const updated = next.filter((member) => {
      const before = previousSignatures.get(member.logicalMemberKey);
      return before != null && before !== nextSignatures.get(member.logicalMemberKey);
    }).map((member) => member.logicalMemberKey);

    chatAtlasLedgerState.members = next;
    chatAtlasLedgerState.ready = true;
    chatAtlasLedgerState.version += 1;
    chatAtlasLedgerState.chatKey = nextChatKey;
    try {
      if (previousLedgerChatKey !== nextChatKey) {
        chatAtlasCv2ResetBindingEvidence(
          nextChatKey,
          previousLedgerChatKey ? 'ledger-chat-key-change' : 'ledger-initial-binding',
        );
      }
    } catch (error) {
      chatAtlasCv2RecordInstrumentationError(error, 'ledger-binding-evidence');
    }
    chatAtlasLedgerState.buildCount += 1;
    chatAtlasLedgerState.aliasAbsorbCount += absorbed;
    chatAtlasLedgerState.duplicateAliasCount = duplicateAliases.length;
    chatAtlasLedgerState.quarantinedAliases = quarantine;
    chatAtlasLedgerState.completeShellMap = completeShellMap;
    chatAtlasLedgerState.duplicateMemberCandidates = candidateConflicts;
    chatAtlasLedgerState.unboundShells = [
      ...read.unbound,
      ...pairing.rejectedAssistants.map((item) => ({ ...item, reason: `pairing-rejected:${item.reason}` })),
    ];
    chatAtlasLedgerState.parityWithCurrentTurnRuntime = parity.exact;
    chatAtlasLedgerState.parityStatus = parity.status;
    chatAtlasLedgerState.parityDisagreements = parity.disagreements;
    chatAtlasLedgerState.canonicalRecordCount = read.canonicalRecords.length;
    chatAtlasLedgerState.canonicalTurnVersion = read.canonicalVersion;
    chatAtlasLedgerState.shellCount = read.shells.length;
    chatAtlasLedgerState.questionShellCount = read.questionShellCount;
    chatAtlasLedgerState.answerShellCount = read.answerShellCount;
    chatAtlasLedgerState.warnings = completeShellMap
      ? []
      : ['incomplete-stable-shell-map'];
    const elapsed = Math.max(0, chatAtlasNow() - started) + Math.max(0, Number(read.readMs) || 0);
    chatAtlasLedgerState.lastBuildMs = elapsed;
    if (isFlush) {
      chatAtlasLedgerState.flushCount += 1;
      chatAtlasLedgerState.lastFlushMs = elapsed;
      chatAtlasLedgerState.maxFlushMs = Math.max(chatAtlasLedgerState.maxFlushMs, elapsed);
    }
    chatAtlasRunCanonicalDualComparison(reason);

    const delta = chatAtlasFreeze({
      reason: String(reason || 'unknown'),
      version: chatAtlasLedgerState.version,
      added,
      removed,
      updated,
      memberCount: next.length,
      shellCount: read.shells.length,
    });
    for (const listener of Array.from(chatAtlasLedgerState.subscribers)) {
      try { listener(delta); } catch (error) {
        try { console.warn('[H2O.Core] Chat Atlas ledger subscriber error', error); } catch {}
      }
    }
    return delta;
  }

  function chatAtlasRebindObserver(root) {
    if (!root || !root.isConnected || typeof MutationObserver !== 'function') return;
    if (chatAtlasLedgerState.observerRoot === root && chatAtlasLedgerState.observerActive) return;
    try { chatAtlasLedgerState.observer?.disconnect(); } catch {}
    chatAtlasLedgerState.observerRoot = root;
    chatAtlasLedgerState.observer = new MutationObserver((mutations) => {
      let relevant = false;
      for (const mutation of mutations) {
        const nodes = [mutation.target, ...(mutation.addedNodes || []), ...(mutation.removedNodes || [])];
        for (const node of nodes) {
          if (!node || node.nodeType !== 1) continue;
          let shell = null;
          try { shell = node.matches?.(CHAT_ATLAS_SHELL_SEL) ? node : node.closest?.(CHAT_ATLAS_SHELL_SEL); } catch {}
          if (shell) {
            chatAtlasLedgerState.dirtyShells.add(shell);
            relevant = true;
          }
          try {
            if (node.matches?.(SEL_CORE_WITH_ROLE) || node.querySelector?.(SEL_CORE_WITH_ROLE)) relevant = true;
            for (const descendant of node.querySelectorAll?.(CHAT_ATLAS_SHELL_SEL) || []) {
              chatAtlasLedgerState.dirtyShells.add(descendant);
              relevant = true;
            }
          } catch {}
        }
      }
      if (!relevant) return;
      if (!chatAtlasLedgerState.dirtyShells.size) chatAtlasLedgerState.fullRebuildPending = true;
      scheduleChatAtlasLedgerFlush('mutation');
    });
    try {
      chatAtlasLedgerState.observer.observe(root, { childList: true, subtree: true });
      chatAtlasLedgerState.observerActive = true;
    } catch {
      chatAtlasLedgerState.observerActive = false;
    }
  }

  function chatAtlasFlush(reason = 'scheduled') {
    chatAtlasLedgerState.raf = 0;
    const dirtyCount = chatAtlasLedgerState.dirtyShells.size;
    chatAtlasLedgerState.lastDirtyShellCount = dirtyCount;
    chatAtlasLedgerState.dirtyShells.clear();
    chatAtlasLedgerState.fullRebuildPending = false;
    try {
      const read = chatAtlasReadEvidence();
      const delta = chatAtlasApplyEvidence(read, reason, true);
      chatAtlasRebindObserver(read.root);
      return delta;
    } catch (error) {
      chatAtlasLedgerState.warnings = [`flush-failed:${String(error?.message || error || 'unknown')}`];
      return null;
    }
  }

  function scheduleChatAtlasLedgerFlush(reason = 'scheduled') {
    if (chatAtlasLedgerState.raf) return;
    try {
      chatAtlasLedgerState.raf = W.requestAnimationFrame(() => chatAtlasFlush(reason));
    } catch {
      chatAtlasLedgerState.raf = W.setTimeout(() => chatAtlasFlush(reason), 0);
    }
  }

  function startChatAtlasLedger() {
    try {
      const read = chatAtlasReadEvidence();
      chatAtlasApplyEvidence(read, 'boot', false);
      chatAtlasRebindObserver(read.root);
      if (!chatAtlasLedgerState.canonicalListenerBound) {
        chatAtlasLedgerState.canonicalListenerBound = true;
        H2O.bus.on(EV_CORE_TURN_UPDATED, () => scheduleChatAtlasLedgerFlush('canonical-turn-updated'));
      }
    } catch (error) {
      chatAtlasLedgerState.ready = false;
      chatAtlasLedgerState.warnings = [`boot-failed:${String(error?.message || error || 'unknown')}`];
    }
  }

  function getChatAtlasLedgerSnapshot() {
    try {
      return chatAtlasFreeze({
        ledgerReady: !!chatAtlasLedgerState.ready,
        version: chatAtlasLedgerState.version,
        chatKey: chatAtlasLedgerState.chatKey,
        memberCount: chatAtlasLedgerState.members.length,
        completeShellMap: chatAtlasLedgerState.completeShellMap,
        quarantinedAliasCount: chatAtlasLedgerState.quarantinedAliases.size,
        quarantinedAliases: Array.from(chatAtlasLedgerState.quarantinedAliases)
          .slice(0, CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT),
        quarantinedAliasResolutionCount: chatAtlasLedgerState.quarantinedAliasResolutionCount,
        members: chatAtlasLedgerState.members.map(chatAtlasPublicMember),
      });
    } catch (error) {
      return chatAtlasFreeze({ ledgerReady: false, memberCount: 'unknown', members: [], warning: String(error?.message || error || 'snapshot-failed') });
    }
  }

  /* Chat Atlas convergence parity (CV-1, explicit read-only probe).
   *
   * This operator-called API compares the private Chat Atlas ledger, current
   * canonical turnRuntime records, and rendered MiniMap boxes. It does not
   * participate in normal diagnostics, publish rows, or invoke repair paths.
   */
  const CHAT_ATLAS_CONVERGENCE_MINIMAP_ROOT_SEL = [
    '[data-cgxui="mnmp-root"][data-cgxui-owner="mnmp"]',
    '[data-h2o-owner="minimap-v10"]',
  ].join(', ');
  const CHAT_ATLAS_CONVERGENCE_MINIMAP_BOX_SEL = [
    '[data-cgxui="mnmp-btn"]',
    '[data-cgxui="mm-btn"]',
    '.cgxui-mm-btn',
  ].join(', ');
  const CHAT_ATLAS_CONVERGENCE_MINIMAP_WRAP_SEL = [
    '[data-cgxui="mnmp-wrap"]',
    '[data-cgxui="mm-wrap"]',
    '.cgxui-mm-wrap',
  ].join(', ');
  const CHAT_ATLAS_CONVERGENCE_SAFETY_KEYS = [
    'domWriteCount',
    'storageWriteCount',
    'physicalExecutorCallCount',
    'paginationExecutorCallCount',
    'unmountExecutorCallCount',
    'consumerSwitchCount',
    'canonicalMutationAttemptCount',
  ];

  function chatAtlasConvergenceAttr(el, name) {
    try { return String(el?.getAttribute?.(name) || '').trim(); } catch { return ''; }
  }

  function chatAtlasConvergenceText(el) {
    try { return String(el?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120); } catch { return ''; }
  }

  function chatAtlasConvergencePositiveInt(value) {
    const number = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function chatAtlasConvergenceIds(values) {
    const ids = new Set();
    for (const value of values || []) {
      const id = chatAtlasNormalizeId(value);
      if (id) ids.add(id);
    }
    return ids;
  }

  function chatAtlasConvergenceSafetyCounters() {
    let diagnostics = {};
    try { diagnostics = getChatAtlasLedgerDiagnostics() || {}; } catch {}
    const counters = {};
    for (const key of CHAT_ATLAS_CONVERGENCE_SAFETY_KEYS) {
      const value = Number(diagnostics?.[key]);
      counters[key] = Number.isFinite(value) ? value : 'unknown';
    }
    return counters;
  }

  function chatAtlasConvergenceSafetyResult(before, after) {
    const changes = [];
    for (const key of CHAT_ATLAS_CONVERGENCE_SAFETY_KEYS) {
      if (before?.[key] !== after?.[key]) {
        changes.push({ key, before: before?.[key] ?? 'unknown', after: after?.[key] ?? 'unknown' });
      }
    }
    return {
      safetyCountersBefore: before,
      safetyCountersAfter: after,
      safetyCountersUnchanged: changes.length === 0,
      safetyCounterChanges: changes,
    };
  }

  function chatAtlasConvergenceLedgerRow(member) {
    const answerAliases = Array.from(member?.answer?.aliases || []).map(chatAtlasNormalizeId).filter(Boolean);
    const questionAliases = Array.from(member?.question?.aliases || []).map(chatAtlasNormalizeId).filter(Boolean);
    const qId = chatAtlasNormalizeId(member?.question?.qId) || null;
    const primaryAId = chatAtlasNormalizeId(member?.answer?.primaryAId) || null;
    const allIds = chatAtlasConvergenceIds([qId, primaryAId, ...answerAliases, ...questionAliases]);
    const answerIds = chatAtlasConvergenceIds([primaryAId, ...answerAliases]);
    const questionIds = chatAtlasConvergenceIds([qId, ...questionAliases]);
    return {
      row: {
        logicalMemberKey: String(member?.logicalMemberKey || ''),
        turnNo: Math.max(0, Number(member?.turnNo || 0) || 0),
        pageNo: Math.max(0, Number(member?.pageNo || 0) || 0),
        pageIndex: Math.max(0, Number(member?.pageIndex || 0) || 0),
        noAnswer: !!member?.noAnswer,
        qId,
        primaryAId,
        answerAliases,
        questionAliases,
        hydration: String(member?.hydration || 'none'),
      },
      allIds,
      answerIds,
      questionIds,
    };
  }

  function chatAtlasConvergenceCanonicalRow(record, index, fieldShapeMismatches) {
    const turnNo = Math.max(0, Number(record?.turnNo || record?.idx || record?.index || index + 1) || 0);
    const rawAnswerIds = Array.isArray(record?.answerIds) ? record.answerIds : [];
    const rawAliasIds = Array.isArray(record?._aliasIds) ? record._aliasIds : [];
    if (!record || typeof record !== 'object') {
      fieldShapeMismatches.push({ source: 'canonical', index, reason: 'record-not-object' });
    } else {
      if (!Array.isArray(record.answerIds)) fieldShapeMismatches.push({ source: 'canonical', turnNo, field: 'answerIds', reason: 'expected-array' });
      if (!Array.isArray(record._aliasIds)) fieldShapeMismatches.push({ source: 'canonical', turnNo, field: '_aliasIds', reason: 'expected-array' });
    }
    const answerIds = rawAnswerIds.map(chatAtlasNormalizeId).filter(Boolean);
    const aliasIds = rawAliasIds.map(chatAtlasNormalizeId).filter(Boolean);
    const qId = chatAtlasNormalizeId(record?.qId) || null;
    const primaryAId = chatAtlasNormalizeId(record?.primaryAId) || null;
    const allIds = chatAtlasConvergenceIds([
      record?.turnId,
      qId,
      primaryAId,
      ...answerIds,
      ...aliasIds,
    ]);
    return {
      row: {
        turnNo,
        idx: Number.isFinite(Number(record?.idx)) ? Number(record.idx) : null,
        qId,
        primaryAId,
        answerIds,
        _aliasIds: aliasIds,
        noAnswer: record?.noAnswer === true || record?.hasAssistant === false || (!primaryAId && answerIds.length === 0),
        pageNo: turnNo > 0 ? Math.floor((turnNo - 1) / CHAT_ATLAS_PAGE_SIZE) + 1 : 0,
      },
      allIds,
      answerIds: chatAtlasConvergenceIds([primaryAId, ...answerIds]),
      questionIds: chatAtlasConvergenceIds([qId]),
    };
  }

  function chatAtlasConvergenceWashMarker(btn) {
    try {
      if (btn?.getAttribute?.('data-cgxui-wash') === '1' || btn?.dataset?.wash === 'true') return true;
      if (btn?.getAttribute?.('data-h2o-wash-name') || btn?.getAttribute?.('data-h2o-wash-id')) return true;
      return Array.from(btn?.classList || []).some((name) => name.startsWith('cgxui-mnmp-wash-') || name.startsWith('cgxui-wash-'));
    } catch {
      return false;
    }
  }

  function chatAtlasConvergenceNoAnswerMarker(btn, wrap = null) {
    const sources = [];
    const read = (name) => chatAtlasConvergenceAttr(btn, name) || chatAtlasConvergenceAttr(wrap, name);
    let value = false;
    for (const name of ['data-no-answer', 'data-at-no-answer', 'data-cgxui-no-answer']) {
      const attrValue = read(name);
      const present = !!(btn?.hasAttribute?.(name) || wrap?.hasAttribute?.(name));
      if (!present) continue;
      sources.push(name);
      if (attrValue === '1' || attrValue === 'true') value = true;
    }
    const primaryAId = read('data-primary-a-id');
    if (/^no-answer:/i.test(primaryAId)) {
      sources.push('data-primary-a-id:no-answer-prefix');
      value = true;
    }
    const classNames = Array.from(btn?.classList || []);
    if (classNames.some((name) => /(^|-)no-answer($|-)/i.test(String(name)))) {
      sources.push('class:no-answer');
      value = true;
    }
    return {
      available: sources.length > 0,
      value,
      source: sources.length ? sources.join('+') : 'unavailable',
    };
  }

  function chatAtlasConvergenceMiniMapBox(btn, domIndex) {
    const wrap = btn?.closest?.(CHAT_ATLAS_CONVERGENCE_MINIMAP_WRAP_SEL) || null;
    const read = (name) => chatAtlasConvergenceAttr(btn, name) || chatAtlasConvergenceAttr(wrap, name);
    const dataPrimaryAId = read('data-primary-a-id');
    const dataTurn = read('data-turn');
    const dataTurnId = read('data-turn-id');
    const dataId = read('data-id');
    const dataQuestionId = read('data-question-id');
    const dataPage = read('data-page');
    const inferredTurnNo = chatAtlasConvergencePositiveInt(read('data-turn-idx'))
      || chatAtlasConvergencePositiveInt(btn?.querySelector?.('.cgxui-mm-num')?.textContent)
      || chatAtlasConvergencePositiveInt(chatAtlasConvergenceText(btn));
    const inferredPageNo = chatAtlasConvergencePositiveInt(read('data-page-num'))
      || chatAtlasConvergencePositiveInt(dataPage)
      || (inferredTurnNo ? Math.floor((inferredTurnNo - 1) / CHAT_ATLAS_PAGE_SIZE) + 1 : 0);
    const noAnswerMarker = chatAtlasConvergenceNoAnswerMarker(btn, wrap);
    return {
      row: {
        domIndex,
        label: chatAtlasConvergenceAttr(btn, 'aria-label') || chatAtlasConvergenceAttr(btn, 'title'),
        text: chatAtlasConvergenceText(btn),
        dataPrimaryAId,
        dataTurn,
        dataTurnId,
        dataPage,
        inferredTurnNo,
        inferredPageNo,
        noAnswer: noAnswerMarker.available ? noAnswerMarker.value : 'unknown',
        noAnswerSemanticAvailable: noAnswerMarker.available,
        noAnswerMarkerSource: noAnswerMarker.source,
        washMarker: chatAtlasConvergenceWashMarker(btn),
        resolvedTurnNo: null,
        resolvedLogicalMemberKey: null,
        mismatchReason: '',
      },
      btn,
      allIds: chatAtlasConvergenceIds([dataPrimaryAId, dataTurnId, dataId, dataQuestionId]),
    };
  }

  function chatAtlasConvergenceAliasOwners(entries) {
    const owners = new Map();
    for (let index = 0; index < entries.length; index += 1) {
      for (const id of entries[index].allIds) {
        if (!owners.has(id)) owners.set(id, new Set());
        owners.get(id).add(index);
      }
    }
    return owners;
  }

  function chatAtlasConvergenceMatch(entry, owners, fallbackIndex, used = null) {
    const candidates = new Set();
    for (const id of entry?.allIds || []) {
      for (const index of owners.get(id) || []) candidates.add(index);
    }
    const available = Array.from(candidates).filter((index) => !used?.has(index));
    if (available.length === 1) return { index: available[0], basis: 'record-local-alias', candidates: available };
    if (!available.length && Number.isInteger(fallbackIndex) && fallbackIndex >= 0 && !used?.has(fallbackIndex)) {
      return { index: fallbackIndex, basis: 'turn-order-fallback', candidates: [] };
    }
    return { index: -1, basis: available.length ? 'ambiguous-alias' : 'unmatched', candidates: available };
  }

  function chatAtlasConvergenceWasherState(entry, btn, warnings) {
    let washApi = null;
    try { washApi = W?.H2O?.MM?.wash || W?.top?.H2O?.MM?.wash || null; } catch {}
    if (!washApi || typeof washApi.inspectMiniBtn !== 'function') {
      warnings.push('washer-read-api-unavailable');
      return {
        available: false,
        expectedAvailable: false,
        expectedWashed: 'unknown',
        actualWashed: 'unknown',
        computedVisualWash: 'unknown',
        washerExpectedSource: 'unavailable',
        washerActualSource: 'unavailable',
        selectedOrCurrent: 'unknown',
        actualWashAttrs: {},
        actualWashClasses: [],
      };
    }
    const buttonId = chatAtlasConvergenceAttr(btn, 'data-primary-a-id') || entry?.row?.primaryAId || '';
    let inspected = null;
    try { inspected = washApi.inspectMiniBtn(buttonId, btn) || null; } catch {}
    if (!inspected || typeof inspected.shouldWash !== 'boolean') {
      warnings.push('washer-expected-state-unavailable');
      return {
        available: false,
        expectedAvailable: false,
        expectedWashed: 'unknown',
        actualWashed: 'unknown',
        computedVisualWash: 'unknown',
        washerExpectedSource: 'unavailable',
        washerActualSource: 'unavailable',
        selectedOrCurrent: 'unknown',
        actualWashAttrs: {},
        actualWashClasses: [],
      };
    }
    const actualWashAttrs = {
      dataCgxuiWash: chatAtlasConvergenceAttr(btn, 'data-cgxui-wash'),
      dataWash: chatAtlasConvergenceAttr(btn, 'data-wash'),
      dataH2oWashId: chatAtlasConvergenceAttr(btn, 'data-h2o-wash-id'),
      dataH2oWashName: chatAtlasConvergenceAttr(btn, 'data-h2o-wash-name'),
    };
    const actualWashClasses = Array.from(btn?.classList || [])
      .filter((name) => /^cgxui-(?:mnmp-)?wash-/i.test(String(name)));
    const actualWashed = actualWashAttrs.dataCgxuiWash === '1'
      || actualWashAttrs.dataWash === 'true'
      || !!actualWashAttrs.dataH2oWashId
      || !!actualWashAttrs.dataH2oWashName
      || actualWashClasses.length > 0;
    const selectedOrCurrent = !!inspected.selectedOrCurrent;
    const washerActualSource = actualWashed
      ? (actualWashClasses.length ? 'minimap-wash-attrs+classes' : 'minimap-wash-attrs')
      : (selectedOrCurrent ? 'selected-or-current-style-only' : 'no-wash-projection');
    return {
      available: true,
      expectedAvailable: true,
      expectedWashed: !!inspected.shouldWash,
      expectedColorName: String(inspected.colorName || '') || null,
      washerExpectedSource: `washer-owner:inspectMiniBtn${inspected.expectedSource ? `:${inspected.expectedSource}` : ''}`,
      actualWashed,
      washerActualSource,
      computedVisualWash: inspected?.computedVisualWash ?? 'unknown',
      actualColorName: actualWashAttrs.dataH2oWashName || null,
      selectedOrCurrent,
      selectedStateTokens: String(inspected.selectedStateTokens || ''),
      actualWashAttrs,
      actualWashClasses,
      projectedWashId: actualWashAttrs.dataH2oWashId || null,
    };
  }

  function getChatAtlasConvergenceParity() {
    const safetyBefore = chatAtlasConvergenceSafetyCounters();
    try {
      const blockers = [];
      const warnings = [];
      const notes = [
        'operator-called-read-only-probe',
        'does-not-drive-canonical-records-or-minimap-rendering',
      ];
      const countMismatches = [];
      const orderMismatches = [];
      const fieldShapeMismatches = [];
      const qIdMismatches = [];
      const primaryAIdMismatches = [];
      const aliasMismatches = [];
      const noAnswerMismatches = [];
      const pageNoMismatches = [];
      const miniMapMissingBoxes = [];
      const miniMapUnexpectedBoxes = [];
      const miniMapOrderMismatches = [];
      const washerMismatches = [];
      const washerAudit = [];

      const ledgerEntries = chatAtlasLedgerState.members.map(chatAtlasConvergenceLedgerRow);
      const canonicalEntries = turnState.turns.map((record, index) => chatAtlasConvergenceCanonicalRow(record, index, fieldShapeMismatches));
      const ledgerRows = ledgerEntries.map((entry) => entry.row);
      const canonicalRows = canonicalEntries.map((entry) => entry.row);
      const canonicalOwners = chatAtlasConvergenceAliasOwners(canonicalEntries);
      const usedCanonical = new Set();
      const ledgerReady = !!chatAtlasLedgerState.ready;
      const canonicalReady = canonicalRows.length > 0;

      if (ledgerReady && canonicalReady) {
      for (let index = 0; index < ledgerEntries.length; index += 1) {
        const ledger = ledgerEntries[index];
        const match = chatAtlasConvergenceMatch(ledger, canonicalOwners, index, usedCanonical);
        if (match.index < 0) {
          aliasMismatches.push({
            logicalMemberKey: ledger.row.logicalMemberKey,
            turnNo: ledger.row.turnNo,
            reason: match.basis === 'ambiguous-alias' ? 'ambiguous-canonical-alias-match' : 'canonical-record-not-matched',
            candidateIndexes: match.candidates,
          });
          continue;
        }
        usedCanonical.add(match.index);
        const canonical = canonicalEntries[match.index];
        if (match.basis === 'turn-order-fallback' && ledger.allIds.size && canonical.allIds.size) {
          aliasMismatches.push({
            logicalMemberKey: ledger.row.logicalMemberKey,
            turnNo: ledger.row.turnNo,
            canonicalTurnNo: canonical.row.turnNo,
            reason: 'turn-order-matched-without-record-local-alias',
          });
        }
        if (match.index !== index || canonical.row.turnNo !== ledger.row.turnNo) {
          orderMismatches.push({
            logicalMemberKey: ledger.row.logicalMemberKey,
            expectedIndex: index,
            canonicalIndex: match.index,
            ledgerTurnNo: ledger.row.turnNo,
            canonicalTurnNo: canonical.row.turnNo,
          });
        }
        if (ledger.row.qId && canonical.row.qId
          && !ledger.questionIds.has(canonical.row.qId)
          && !canonical.questionIds.has(ledger.row.qId)) {
          qIdMismatches.push({
            logicalMemberKey: ledger.row.logicalMemberKey,
            turnNo: ledger.row.turnNo,
            ledgerQId: ledger.row.qId,
            canonicalQId: canonical.row.qId,
          });
        }
        if (ledger.row.primaryAId && canonical.row.primaryAId
          && !ledger.answerIds.has(canonical.row.primaryAId)
          && !canonical.answerIds.has(ledger.row.primaryAId)) {
          primaryAIdMismatches.push({
            logicalMemberKey: ledger.row.logicalMemberKey,
            turnNo: ledger.row.turnNo,
            ledgerPrimaryAId: ledger.row.primaryAId,
            canonicalPrimaryAId: canonical.row.primaryAId,
          });
        }
        if (ledger.row.noAnswer !== canonical.row.noAnswer) {
          noAnswerMismatches.push({
            source: 'ledger-vs-canonical',
            logicalMemberKey: ledger.row.logicalMemberKey,
            turnNo: ledger.row.turnNo,
            ledgerNoAnswer: ledger.row.noAnswer,
            canonicalNoAnswer: canonical.row.noAnswer,
            classification: 'blocker',
            rationale: 'authoritative-ledger-canonical-disagreement',
          });
        }
        if (ledger.row.pageNo !== canonical.row.pageNo) {
          pageNoMismatches.push({
            source: 'ledger-vs-canonical',
            logicalMemberKey: ledger.row.logicalMemberKey,
            turnNo: ledger.row.turnNo,
            ledgerPageNo: ledger.row.pageNo,
            canonicalPageNo: canonical.row.pageNo,
          });
        }
      }

      for (let index = 0; index < canonicalEntries.length; index += 1) {
        if (!usedCanonical.has(index)) {
          aliasMismatches.push({ source: 'canonical', canonicalIndex: index, turnNo: canonicalEntries[index].row.turnNo, reason: 'canonical-record-not-matched-to-ledger' });
        }
      }
      }

      let miniMapRoot = null;
      try { miniMapRoot = D.querySelector(CHAT_ATLAS_CONVERGENCE_MINIMAP_ROOT_SEL); } catch {}
      let miniMapEntries = [];
      if (miniMapRoot) {
        try {
          miniMapEntries = Array.from(miniMapRoot.querySelectorAll(CHAT_ATLAS_CONVERGENCE_MINIMAP_BOX_SEL))
            .map(chatAtlasConvergenceMiniMapBox);
        } catch { miniMapEntries = []; }
      }
      const renderedMiniMapBoxes = miniMapEntries.map((entry) => entry.row);
      const ledgerOwners = chatAtlasConvergenceAliasOwners(ledgerEntries);
      const boxesByLedgerIndex = new Map();
      if (ledgerReady) {
      for (let index = 0; index < miniMapEntries.length; index += 1) {
        const box = miniMapEntries[index];
        const fallbackIndex = box.row.inferredTurnNo > 0 ? box.row.inferredTurnNo - 1 : index;
        const match = chatAtlasConvergenceMatch(box, ledgerOwners, fallbackIndex);
        if (match.index < 0) {
          box.row.mismatchReason = match.basis === 'ambiguous-alias' ? 'ambiguous-ledger-alias-match' : 'no-ledger-member-match';
          miniMapUnexpectedBoxes.push({ ...box.row });
          continue;
        }
        const ledger = ledgerEntries[match.index];
        box.row.resolvedTurnNo = ledger.row.turnNo;
        box.row.resolvedLogicalMemberKey = ledger.row.logicalMemberKey;
        if (!boxesByLedgerIndex.has(match.index)) boxesByLedgerIndex.set(match.index, []);
        boxesByLedgerIndex.get(match.index).push(box);
        if (match.index !== index) {
          miniMapOrderMismatches.push({
            logicalMemberKey: ledger.row.logicalMemberKey,
            expectedDomIndex: match.index,
            actualDomIndex: index,
            turnNo: ledger.row.turnNo,
          });
        }
        if (box.row.inferredPageNo && box.row.inferredPageNo !== ledger.row.pageNo) {
          pageNoMismatches.push({
            source: 'ledger-vs-minimap',
            logicalMemberKey: ledger.row.logicalMemberKey,
            turnNo: ledger.row.turnNo,
            ledgerPageNo: ledger.row.pageNo,
            miniMapPageNo: box.row.inferredPageNo,
          });
        }
        if (box.row.noAnswerSemanticAvailable && box.row.noAnswer !== ledger.row.noAnswer) {
          noAnswerMismatches.push({
            source: 'ledger-vs-minimap',
            logicalMemberKey: ledger.row.logicalMemberKey,
            turnNo: ledger.row.turnNo,
            ledgerNoAnswer: ledger.row.noAnswer,
            miniMapNoAnswer: box.row.noAnswer,
            miniMapNoAnswerMarkerSource: box.row.noAnswerMarkerSource,
            classification: 'blocker',
            rationale: 'reliable-minimap-no-answer-marker-disagrees',
          });
        }
        const wash = chatAtlasConvergenceWasherState(ledger, box.btn, warnings);
        let washerMismatchReason = '';
        if (wash.expectedAvailable) {
          if (wash.actualWashed !== wash.expectedWashed) {
            washerMismatchReason = 'washer-owner-vs-explicit-projection-mismatch';
          } else if (wash.expectedWashed && wash.actualWashed
            && wash.expectedColorName && wash.actualColorName
            && wash.expectedColorName !== wash.actualColorName) {
            washerMismatchReason = 'washer-color-attribute-mismatch';
          } else if (wash.expectedWashed && wash.actualWashed && wash.computedVisualWash === false) {
            washerMismatchReason = 'wash-visual-missing';
          }
        }
        const washerRow = {
          logicalMemberKey: ledger.row.logicalMemberKey,
          turnNo: ledger.row.turnNo,
          ...wash,
          mismatchReason: washerMismatchReason,
          classification: washerMismatchReason ? 'blocker' : (wash.expectedAvailable ? 'pass' : 'warning'),
          rationale: washerMismatchReason
            ? 'washer-owner-state-disagrees-with-explicit-minimap-wash-projection'
            : (wash.expectedAvailable
              ? (wash.selectedOrCurrent && !wash.actualWashed
                ? 'selected-or-current-style-is-not-washer-evidence'
                : 'washer-owner-and-explicit-projection-agree')
              : 'washer-owner-state-unavailable'),
        };
        washerAudit.push(washerRow);
        if (washerMismatchReason) washerMismatches.push({ ...washerRow, reason: washerMismatchReason });
      }
      }

      if (ledgerReady && miniMapRoot && miniMapEntries.length) {
        for (let index = 0; index < ledgerEntries.length; index += 1) {
          const boxes = boxesByLedgerIndex.get(index) || [];
          if (!boxes.length) miniMapMissingBoxes.push({ ...ledgerEntries[index].row });
          if (boxes.length > 1) {
            miniMapUnexpectedBoxes.push({
              logicalMemberKey: ledgerEntries[index].row.logicalMemberKey,
              turnNo: ledgerEntries[index].row.turnNo,
              domIndexes: boxes.map((box) => box.row.domIndex),
              reason: 'duplicate-minimap-boxes-for-ledger-member',
            });
          }
        }
      }

      const ledgerMemberCount = ledgerRows.length;
      const canonicalRecordCount = canonicalRows.length;
      const renderedMiniMapBoxCount = renderedMiniMapBoxes.length;
      const expectedPageCount = ledgerMemberCount ? Math.ceil(ledgerMemberCount / CHAT_ATLAS_PAGE_SIZE) : 0;
      const noAnswerCountLedger = ledgerRows.filter((row) => row.noAnswer).length;
      const noAnswerCountCanonical = canonicalRows.filter((row) => row.noAnswer).length;
      const miniMapRendered = !!miniMapRoot && renderedMiniMapBoxCount > 0;
      const noAnswerLedgerIndexes = ledgerEntries
        .map((entry, index) => entry.row.noAnswer ? index : -1)
        .filter((index) => index >= 0);
      const noAnswerMarkerRows = noAnswerLedgerIndexes.flatMap((index) => boxesByLedgerIndex.get(index) || []);
      const noAnswerSemanticAvailable = noAnswerLedgerIndexes.length === 0
        ? true
        : noAnswerMarkerRows.length === noAnswerLedgerIndexes.length
          && noAnswerMarkerRows.every((entry) => entry.row.noAnswerSemanticAvailable);
      const miniMapNoAnswerMarkerSources = Array.from(new Set(
        noAnswerMarkerRows
          .filter((entry) => entry.row.noAnswerSemanticAvailable)
          .map((entry) => entry.row.noAnswerMarkerSource)
          .filter(Boolean)
      ));
      const miniMapNoAnswerMarkerSource = noAnswerLedgerIndexes.length === 0
        ? 'not-applicable'
        : (noAnswerSemanticAvailable ? miniMapNoAnswerMarkerSources.join('+') : 'unavailable');
      const noAnswerCountMiniMap = noAnswerSemanticAvailable
        ? noAnswerMarkerRows.filter((entry) => entry.row.noAnswer === true).length
        : 'unknown';
      const noAnswerMatches = noAnswerMismatches.length === 0;
      if (miniMapRendered && noAnswerLedgerIndexes.length && !noAnswerSemanticAvailable) {
        warnings.push('minimap-no-answer-marker-unavailable');
        notes.push('no-answer-parity-uses-ledger-vs-canonical-only');
      }
      const washerExpectedSources = Array.from(new Set(washerAudit.map((row) => row.washerExpectedSource).filter(Boolean)));
      const washerActualSources = Array.from(new Set(washerAudit.map((row) => row.washerActualSource).filter(Boolean)));
      const washerExpectedSource = washerExpectedSources.length === 1 ? washerExpectedSources[0] : washerExpectedSources;
      const washerActualSource = washerActualSources.length === 1 ? washerActualSources[0] : washerActualSources;
      const washerMatches = washerAudit.some((row) => !row.expectedAvailable)
        ? (washerMismatches.length ? false : 'unknown')
        : washerMismatches.length === 0;
      const countParity = ledgerReady && canonicalReady && miniMapRendered
        ? ledgerMemberCount === canonicalRecordCount && canonicalRecordCount === renderedMiniMapBoxCount
        : 'unknown';

      if (ledgerReady && canonicalReady && ledgerMemberCount !== canonicalRecordCount) {
        countMismatches.push({ source: 'ledger-vs-canonical', ledgerMemberCount, canonicalRecordCount });
      }
      if (ledgerReady && miniMapRendered && ledgerMemberCount !== renderedMiniMapBoxCount) {
        countMismatches.push({ source: 'ledger-vs-minimap', ledgerMemberCount, renderedMiniMapBoxCount });
      }
      if (!ledgerReady) warnings.push('chat-atlas-ledger-not-ready');
      if (!canonicalReady) warnings.push('canonical-turn-runtime-not-ready');
      if (!miniMapRoot) warnings.push('minimap-root-not-rendered');
      else if (!miniMapRendered) warnings.push('minimap-boxes-not-rendered');

      const mismatchGroups = [
        countMismatches,
        orderMismatches,
        fieldShapeMismatches,
        qIdMismatches,
        primaryAIdMismatches,
        aliasMismatches,
        noAnswerMismatches,
        pageNoMismatches,
        miniMapMissingBoxes,
        miniMapUnexpectedBoxes,
        miniMapOrderMismatches,
        washerMismatches,
      ];
      if (countMismatches.length) blockers.push('count-mismatch');
      if (orderMismatches.length) blockers.push('ledger-canonical-order-mismatch');
      if (fieldShapeMismatches.length) blockers.push('canonical-field-shape-mismatch');
      if (qIdMismatches.length) blockers.push('question-id-mismatch');
      if (primaryAIdMismatches.length) blockers.push('primary-answer-id-mismatch');
      if (aliasMismatches.length) blockers.push('record-local-alias-mismatch');
      if (noAnswerMismatches.length) blockers.push('no-answer-mismatch');
      if (pageNoMismatches.length) blockers.push('page-membership-mismatch');
      if (miniMapMissingBoxes.length) blockers.push('minimap-missing-boxes');
      if (miniMapUnexpectedBoxes.length) blockers.push('minimap-unexpected-boxes');
      if (miniMapOrderMismatches.length) blockers.push('minimap-order-mismatch');
      if (washerMismatches.length) blockers.push('washer-mismatch');

      const unknown = !ledgerReady || !canonicalReady || !miniMapRendered;
      const mismatch = mismatchGroups.some((group) => group.length > 0);
      const parityStatus = unknown ? 'unknown' : (mismatch ? 'mismatch' : (warnings.length ? 'warn' : 'exact'));
      const safetyAfter = chatAtlasConvergenceSafetyCounters();
      const safety = chatAtlasConvergenceSafetyResult(safetyBefore, safetyAfter);
      if (!safety.safetyCountersUnchanged) blockers.push('safety-counter-changed-during-probe');

      return chatAtlasFreeze({
        readOnly: true,
        authority: 'chat-atlas-convergence-parity',
        parityStatus: !safety.safetyCountersUnchanged ? 'mismatch' : parityStatus,
        blockers: Array.from(new Set(blockers)),
        warnings: Array.from(new Set(warnings)),
        notes,
        chatKey: chatAtlasLedgerState.chatKey,
        ledgerReady,
        canonicalReady,
        miniMapRendered,
        ledgerMemberCount,
        canonicalRecordCount,
        renderedMiniMapBoxCount,
        countParity,
        expectedPageCount,
        noAnswerCountLedger,
        noAnswerCountCanonical,
        noAnswerCountMiniMap,
        noAnswerSemanticAvailable,
        miniMapNoAnswerMarkerSource,
        noAnswerMatches,
        washerExpectedSource,
        washerActualSource,
        washerMatches,
        ledgerRows,
        canonicalRows,
        renderedMiniMapBoxes,
        countMismatches,
        orderMismatches,
        fieldShapeMismatches,
        qIdMismatches,
        primaryAIdMismatches,
        aliasMismatches,
        noAnswerMismatches,
        pageNoMismatches,
        miniMapMissingBoxes,
        miniMapUnexpectedBoxes,
        miniMapOrderMismatches,
        washerAudit,
        washerMismatches,
        miniMapRootSelector: miniMapRoot ? CHAT_ATLAS_CONVERGENCE_MINIMAP_ROOT_SEL : null,
        miniMapBoxSelector: miniMapRoot ? CHAT_ATLAS_CONVERGENCE_MINIMAP_BOX_SEL : null,
        ...safety,
      });
    } catch (error) {
      const safetyAfter = chatAtlasConvergenceSafetyCounters();
      const safety = chatAtlasConvergenceSafetyResult(safetyBefore, safetyAfter);
      return chatAtlasFreeze({
        readOnly: true,
        authority: 'chat-atlas-convergence-parity',
        parityStatus: 'unknown',
        blockers: [],
        warnings: [`convergence-parity-probe-failed:${String(error?.message || error || 'unknown')}`],
        notes: ['operator-called-read-only-probe'],
        chatKey: chatAtlasLedgerState.chatKey,
        ledgerReady: !!chatAtlasLedgerState.ready,
        canonicalReady: 'unknown',
        miniMapRendered: 'unknown',
        ledgerMemberCount: chatAtlasLedgerState.members.length,
        canonicalRecordCount: 'unknown',
        renderedMiniMapBoxCount: 'unknown',
        countParity: 'unknown',
        expectedPageCount: 'unknown',
        noAnswerCountLedger: 'unknown',
        noAnswerCountCanonical: 'unknown',
        noAnswerCountMiniMap: 'unknown',
        noAnswerSemanticAvailable: 'unknown',
        miniMapNoAnswerMarkerSource: 'unknown',
        noAnswerMatches: 'unknown',
        washerExpectedSource: 'unknown',
        washerActualSource: 'unknown',
        washerMatches: 'unknown',
        ledgerRows: [],
        canonicalRows: [],
        renderedMiniMapBoxes: [],
        countMismatches: [],
        orderMismatches: [],
        fieldShapeMismatches: [],
        qIdMismatches: [],
        primaryAIdMismatches: [],
        aliasMismatches: [],
        noAnswerMismatches: [],
        pageNoMismatches: [],
        miniMapMissingBoxes: [],
        miniMapUnexpectedBoxes: [],
        miniMapOrderMismatches: [],
        washerAudit: [],
        washerMismatches: [],
        ...safety,
      });
    }
  }

  function getChatAtlasLedgerDiagnostics() {
    try {
      const members = chatAtlasLedgerState.members;
      return chatAtlasFreeze({
        ledgerReady: !!chatAtlasLedgerState.ready,
        memberCount: members.length,
        shellCount: chatAtlasLedgerState.shellCount,
        questionShellCount: chatAtlasLedgerState.questionShellCount,
        answerShellCount: chatAtlasLedgerState.answerShellCount,
        hydratedMemberCount: members.filter((member) => member.hydration !== 'none').length,
        noAnswerCount: members.filter((member) => member.noAnswer).length,
        logicalPageCount: members.length ? Math.ceil(members.length / CHAT_ATLAS_PAGE_SIZE) : 0,
        buildCount: chatAtlasLedgerState.buildCount,
        lastBuildMs: chatAtlasLedgerState.lastBuildMs,
        flushCount: chatAtlasLedgerState.flushCount,
        lastFlushMs: chatAtlasLedgerState.lastFlushMs,
        maxFlushMs: chatAtlasLedgerState.maxFlushMs,
        dirtyShellCount: chatAtlasLedgerState.dirtyShells.size,
        lastDirtyShellCount: chatAtlasLedgerState.lastDirtyShellCount,
        aliasAbsorbCount: chatAtlasLedgerState.aliasAbsorbCount,
        duplicateAliasCount: chatAtlasLedgerState.duplicateAliasCount,
        currentCrossMemberDuplicateCount: chatAtlasLedgerState.currentCrossMemberDuplicateCount,
        crossMemberAliasConflictCount: chatAtlasLedgerState.crossMemberAliasConflictCount,
        crossMemberAliasRepairCount: chatAtlasLedgerState.crossMemberAliasRepairCount,
        currentAliasConflictCount: chatAtlasLedgerState.currentAliasConflictCount,
        historicalAliasConflictCount: chatAtlasLedgerState.historicalAliasConflictCount,
        pairingAdjacencyRejectCount: chatAtlasLedgerState.pairingAdjacencyRejectCount,
        quarantinedAliasCount: chatAtlasLedgerState.quarantinedAliases.size,
        quarantinedAliases: Array.from(chatAtlasLedgerState.quarantinedAliases)
          .slice(0, CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT),
        quarantinedAliasResolutionCount: chatAtlasLedgerState.quarantinedAliasResolutionCount,
        lastAliasConflict: chatAtlasLedgerState.lastAliasConflict
          ? { ...chatAtlasLedgerState.lastAliasConflict }
          : null,
        recentAliasConflicts: chatAtlasLedgerState.recentAliasConflicts
          .slice(-CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT)
          .map((item) => ({ ...item })),
        lastPairingRejection: chatAtlasLedgerState.lastPairingRejection
          ? { ...chatAtlasLedgerState.lastPairingRejection }
          : null,
        recentPairingRejections: chatAtlasLedgerState.recentPairingRejections
          .slice(-CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT)
          .map((item) => ({ ...item })),
        aliasConflictSampleLimit: CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT,
        completeShellMap: chatAtlasLedgerState.completeShellMap,
        duplicateMemberCandidates: chatAtlasLedgerState.duplicateMemberCandidates.length,
        duplicateMemberCandidateDetails: chatAtlasLedgerState.duplicateMemberCandidates.slice(),
        unboundShells: chatAtlasLedgerState.unboundShells.slice(),
        parityWithCurrentTurnRuntime: chatAtlasLedgerState.parityWithCurrentTurnRuntime,
        parityStatus: chatAtlasLedgerState.parityStatus,
        parityDisagreements: chatAtlasLedgerState.parityDisagreements.slice(),
        canonicalRecordCount: chatAtlasLedgerState.canonicalRecordCount,
        canonicalTurnVersion: chatAtlasLedgerState.canonicalTurnVersion,
        observerActive: chatAtlasLedgerState.observerActive,
        warnings: chatAtlasLedgerState.warnings.slice(),
        ledgerMode: chatAtlasCanonicalSourceState.activeSource === CHAT_ATLAS_CANONICAL_SOURCE_LEGACY
          ? 'shadow'
          : 'canonical-source',
        canonicalSource: chatAtlasCanonicalSourceDiagnostics(),
        dualRun: chatAtlasDualRunDiagnostics(),
        zeroConsumerSwitches: chatAtlasCanonicalSourceState.switchCount === 0,
        consumerSwitchCount: chatAtlasCanonicalSourceState.switchCount,
        canonicalMutationAttemptCount: chatAtlasCanonicalSourceState.canonicalMutationAttemptCount,
        domWriteCount: 0,
        storageWriteCount: 0,
        physicalExecutorCallCount: 0,
        paginationExecutorCallCount: 0,
        unmountExecutorCallCount: 0,
      });
    } catch (error) {
      return chatAtlasFreeze({
        ledgerReady: false,
        warning: String(error?.message || error || 'diagnostics-failed'),
        canonicalSource: chatAtlasCanonicalSourceDiagnostics(),
        dualRun: chatAtlasDualRunDiagnostics(),
        zeroConsumerSwitches: chatAtlasCanonicalSourceState.switchCount === 0,
        consumerSwitchCount: chatAtlasCanonicalSourceState.switchCount,
        canonicalMutationAttemptCount: chatAtlasCanonicalSourceState.canonicalMutationAttemptCount,
        domWriteCount: 0,
        storageWriteCount: 0,
        physicalExecutorCallCount: 0,
      });
    }
  }

  function subscribeChatAtlasLedger(listener) {
    if (typeof listener !== 'function') return () => {};
    chatAtlasLedgerState.subscribers.add(listener);
    return () => { chatAtlasLedgerState.subscribers.delete(listener); };
  }

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

  // Phase 4 Step 2.2: optional `preScanned` parameter avoids a redundant DOM
  // scan when refresh() has already collected the same node set. When omitted
  // (e.g. called from reconcileTurnRecordsFromPaginationSnapshot), the function
  // falls back to its original behavior of scanning the document itself.
  function buildLiveTurnDrafts(preScanned) {
    const nodes = Array.isArray(preScanned)
      ? preScanned
      : Array.from(D.querySelectorAll(SEL_CORE_WITH_ROLE));
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

  // ── Durable turn-draft retention ──────────────────────────────────────────
  // The live DOM is only a window of the conversation: ChatGPT virtualizes
  // far-away turns out of the document, and chat optimizers hide/collapse
  // pages. A canonical turn set rebuilt from a narrower scan would drop the
  // missing turns and reindex the remaining subset from turn 1 ("16/16 /
  // Page 1" MiniMap bug). The durable cache therefore RETAINS every turn seen
  // for the current conversation and merges each fresh live scan into it:
  // known turns keep their position (stable turn numbers and page membership),
  // unknown turns are inserted after their nearest known live neighbor, and
  // turns missing from the scan survive as element-free drafts. The cache
  // resets when the conversation changes and is capped defensively. This is a
  // chat-side data layer only — it must never write MiniMap state.
  const DURABLE_TURN_CACHE_MAX = 5000;

  function durableDraftKey(draft) {
    const qId = String(draft?.qId || '').trim();
    if (qId) return `q:${qId}`;
    const aId = String(draft?.primaryAId || (draft?.answerIds || [])[0] || '').trim();
    if (aId) return `a:${aId}`;
    const alias = (Array.isArray(draft?.aliasIds) ? draft.aliasIds : [])
      .map((value) => String(value || '').trim())
      .find(Boolean);
    return alias ? `x:${alias}` : '';
  }

  // Element-free clone kept in the cache so retained drafts never pin
  // detached DOM subtrees in memory.
  function slimTurnDraft(draft) {
    return {
      turnNo: 0,
      qId: draft?.qId || null,
      answerIds: Array.isArray(draft?.answerIds) ? draft.answerIds.slice() : [],
      aliasIds: Array.isArray(draft?.aliasIds) ? draft.aliasIds.slice() : [],
      hasQuestion: !!draft?.qId,
      hasAssistant: !!(Array.isArray(draft?.answerIds) && draft.answerIds.length),
      live: { qEl: null, primaryAEl: null, answerEls: [], connected: false },
    };
  }

  function ensureDurableTurnCache() {
    if (!(turnState.durableByKey instanceof Map)) {
      turnState.durableByKey = new Map();
      turnState.durableOrder = [];
      turnState.durableChatKey = '';
    }
    const chatKey = String(D?.location?.pathname || '/');
    if (turnState.durableChatKey !== chatKey) {
      turnState.durableChatKey = chatKey;
      turnState.durableOrder = [];
      turnState.durableByKey.clear();
    }
  }

  function seedDurableTurnDrafts(drafts) {
    ensureDurableTurnCache();
    turnState.durableOrder = [];
    turnState.durableByKey.clear();
    for (const draft of Array.isArray(drafts) ? drafts : []) {
      const key = durableDraftKey(draft);
      if (!key || turnState.durableByKey.has(key)) continue;
      turnState.durableByKey.set(key, slimTurnDraft(draft));
      turnState.durableOrder.push(key);
    }
  }

  function mergeDurableTurnDrafts(liveDrafts) {
    ensureDurableTurnCache();
    const live = Array.isArray(liveDrafts) ? liveDrafts : [];
    // Authoritative-size draft sets win outright: when the fresh set is at
    // least as large as the retained cache, adopt its order wholesale so a
    // stale or corrupted cache can never re-order or dilute it.
    if (live.length >= turnState.durableOrder.length) {
      seedDurableTurnDrafts(live);
      return live.slice();
    }
    const order = turnState.durableOrder;
    const byKey = turnState.durableByKey;
    const freshByKey = new Map();

    // ChatGPT renders a contiguous window, so each unknown draft is inserted
    // right after the durable position of the previous live draft. A window
    // that starts mid-conversation prepends at the head; later scans that
    // reveal earlier turns self-correct the ordering.
    let anchorIdx = -1;
    for (const draft of live) {
      const key = durableDraftKey(draft);
      if (!key) continue;
      freshByKey.set(key, draft);
      byKey.set(key, slimTurnDraft(draft));
      const existingIdx = order.indexOf(key);
      if (existingIdx >= 0) {
        anchorIdx = existingIdx;
        continue;
      }
      order.splice(anchorIdx + 1, 0, key);
      anchorIdx += 1;
    }

    if (order.length > DURABLE_TURN_CACHE_MAX) {
      const removed = order.splice(0, order.length - DURABLE_TURN_CACHE_MAX);
      for (const key of removed) byKey.delete(key);
    }

    const out = [];
    for (const key of order) {
      const draft = freshByKey.get(key) || byKey.get(key);
      if (draft) out.push(draft);
    }
    return out;
  }

  // ChatGPT keeps EVERY conversation turn in the document as
  // <section data-testid="conversation-turn-N" data-turn="user|assistant"
  // data-turn-id="<message-id>"> and only virtualizes the message CONTENT out
  // of far-away sections. The section attributes are therefore the
  // authoritative full-chat map — order, roles, stable message ids, and the
  // true total — available synchronously at any moment. The
  // [data-message-author-role] scan below only sees hydrated content, so on
  // its own it would shrink the canonical set to the rendered window and
  // renumber it from 1 (the "16/16 / Page 1" MiniMap failure).
  const SEL_CORE_TURN_SECTION = '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]';

  function buildSectionTurnDrafts() {
    let sections = [];
    try { sections = Array.from(D.querySelectorAll(SEL_CORE_TURN_SECTION)); } catch { sections = []; }
    if (!sections.length) return null;

    const entries = [];
    for (const section of sections) {
      const role = String(section.getAttribute?.('data-turn') || '').trim().toLowerCase();
      if (role !== 'user' && role !== 'assistant') continue;
      const turnAttrId = String(section.getAttribute?.('data-turn-id') || '').trim();
      let msgEl = null;
      try { msgEl = section.querySelector(`[${ATTR_MESSAGE_AUTHOR_ROLE}="${role}"]`) || null; } catch {}
      if (role === 'user') {
        entries.push({
          role,
          qEl: msgEl,
          qId: (msgEl ? getQId(msgEl) : '') || turnAttrId,
          aliasIds: [turnAttrId, msgEl ? getMsgIdAttr(msgEl) : ''],
        });
      } else {
        entries.push({
          role,
          aEl: msgEl,
          aId: (msgEl ? getAId(msgEl) : '') || turnAttrId,
          aliasIds: [turnAttrId, msgEl ? getMsgIdAttr(msgEl) : ''],
        });
      }
    }
    if (!entries.length) return null;
    return buildTurnDraftsFromEntries(entries);
  }

  // Phase 4 Step 2.2: forwards the optional `preScanned` node list to
  // buildLiveTurnDrafts() so refresh() can avoid a redundant scan. Other
  // callers (e.g. boot retry paths) pass nothing and behave identically
  // to the prior implementation.
  function buildTurns(preScanned) {
    const liveDrafts = buildLiveTurnDrafts(preScanned);
    const sectionDrafts = buildSectionTurnDrafts();
    const sectionDraftsAreAuthoritative = Array.isArray(sectionDrafts)
      && sectionDrafts.length >= liveDrafts.length;
    const baseDrafts = sectionDraftsAreAuthoritative
      ? sectionDrafts
      : liveDrafts;
    let legacyCanonicalDrafts = null;
    if (Array.isArray(turnState.paginationDrafts) && turnState.paginationDrafts.length) {
      legacyCanonicalDrafts = turnState.paginationDrafts;
    } else if (sectionDraftsAreAuthoritative) {
      // Every turn section remains mounted even when its message content is
      // virtualized. Once that complete map wins the existing source-choice
      // rule, replace the same-route durable cache so a shorter branch can
      // retire records that no longer exist. Hydrated live drafts are still
      // applied by commitTurnDrafts() below to upgrade the retained records.
      seedDurableTurnDrafts(sectionDrafts);
      legacyCanonicalDrafts = sectionDrafts.slice();
    } else {
      legacyCanonicalDrafts = mergeDurableTurnDrafts(baseDrafts);
    }
    const canonicalDrafts = selectChatAtlasCanonicalDrafts(legacyCanonicalDrafts);
    commitTurnDrafts(canonicalDrafts, liveDrafts);
  }

  function reconcileTurnRecordsFromPaginationSnapshot(rows = []) {
    const drafts = buildPaginationTurnDrafts(rows);
    turnState.paginationDrafts = drafts.length ? drafts : null;
    // The pagination master index is full-chat authoritative: refresh the
    // durable cache from it so retention stays correct after teardown.
    if (drafts.length) seedDurableTurnDrafts(drafts);
    const legacyCanonicalDrafts = turnState.paginationDrafts || buildLiveTurnDrafts();
    commitTurnDrafts(selectChatAtlasCanonicalDrafts(legacyCanonicalDrafts), buildLiveTurnDrafts());
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

    // Phase 4 Step 2.2: consolidate three boot-time DOM scans into one.
    // Previously: querySelectorAll(SEL_CORE_USER) + querySelectorAll(SEL_CORE_ASSISTANT)
    // here, plus a third querySelectorAll(SEL_CORE_WITH_ROLE) inside
    // buildLiveTurnDrafts() called by buildTurns() below. All three target
    // the same `document` root with no DOM mutations between calls. Now:
    // one querySelectorAll(SEL_CORE_WITH_ROLE), partitioned by role inline
    // for state.qList/aList ordering, and the same array forwarded to
    // buildTurns() so buildLiveTurnDrafts() can skip its scan. Output is
    // byte-equivalent: DOM iteration order matches separate role-filtered
    // scans because querySelectorAll always returns nodes in document order.
    const allRoleNodes = Array.from(D.querySelectorAll(SEL_CORE_WITH_ROLE));
    const userNodes = [];
    const assistantNodes = [];
    for (const el of allRoleNodes) {
      const role = el.getAttribute(ATTR_MESSAGE_AUTHOR_ROLE);
      if (role === 'user') userNodes.push(el);
      else if (role === 'assistant') assistantNodes.push(el);
    }

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

    buildTurns(allRoleNodes);

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
    listTurns: listTurnRecords,
    listTurnRecords,
    patchTurnPageState: (turnId, partialPageState, opts = {}) => patchTurnPageState(turnId, partialPageState, opts),
    patchTurnMountState: (turnId, partialMountState, opts = {}) => patchTurnMountState(turnId, partialMountState, opts),
    getChatAtlasLedgerSnapshot,
    getChatAtlasLedgerDiagnostics,
    getChatAtlasConvergenceParity,
    subscribeChatAtlasLedger,
    getChatAtlasCanonicalSource,
    setChatAtlasCanonicalSource,
    _reconcilePaginationSnapshot: (rows = []) => reconcileTurnRecordsFromPaginationSnapshot(rows),
    _clearPaginationSnapshot: () => clearPaginationTurnSnapshot(),
  };

  /* ───────────────────────────── 🟨 7) TIME / OBSERVERS ───────────────────────────── */
  (() => {
    let ownMO = null;
    let hubBound = false;

    function bindToHubIfReady() {
      const hub = W.H2O?.obs;
      if (!hub || typeof hub.onMutations !== 'function') return false;

      if (ownMO) {
        try { ownMO.disconnect(); } catch (_) {}
        ownMO = null;
      }
      if (hubBound) return true;
      hubBound = true;

      hub.onMutations('h2ocore:mut', (payload) => {
        if (!payload?.conversationRelevant) return;
        scheduleRefresh('hub:mo');
      });

      hub.onReady('h2ocore:ready', () => {
        scheduleRefresh('hub:ready');
      }, { immediate: true });

      return true;
    }

    function armFallbackMO() {
      if (ownMO || hubBound) return;
      ownMO = new MutationObserver((muts) => {
        let touched = false;
        for (const m of muts) {
          const nodes = [...(m.addedNodes || []), ...(m.removedNodes || [])];
          for (const n of nodes) {
            if (n.nodeType !== 1) continue;
            if (
              n.matches?.(SEL_CORE_USER) ||
              n.matches?.(SEL_CORE_ASSISTANT) ||
              n.querySelector?.(`${SEL_CORE_USER},${SEL_CORE_ASSISTANT}`)
            ) { touched = true; break; }
          }
          if (touched) break;
        }
        if (touched) scheduleRefresh('mo:fallback');
      });
      ownMO.observe(D.body, { childList: true, subtree: true });
    }

    if (!bindToHubIfReady()) {
      armFallbackMO();
      let tries = 0;
      const retry = W.setInterval(() => {
        tries++;
        if (bindToHubIfReady() || tries > 40) {
        W.clearInterval(retry);
        }
      }, 400);
    }
  })();

  H2O.bus.on(BUS_SCAN_QUESTIONS, (detail) => scheduleRefresh(`bus:questions:${detail?.reason || ''}`));
  H2O.bus.on(BUS_SCAN_ANSWERS, (detail) => scheduleRefresh(`bus:answers:${detail?.reason || ''}`));

  W.addEventListener(EV_H2O_MESSAGE_REMOUNTED, () => scheduleRefresh('evt:remounted:h2o'));
  W.addEventListener(EV_H2O_INLINE_CHANGED, () => scheduleRefresh('evt:inline:h2o'));

  refresh('boot');
  startChatAtlasLedger();

  // P3a (Loader V3 readiness migration): write to bounded readyCache so late
  // subscribers attached AFTER this emission still receive the detail via
  // H2O.events.onReady(...). emitReady() internally calls H2O.events.emit(),
  // so the immediate-bus-fan-out is preserved. The legacy emitFn(...) and
  // raw W.dispatchEvent(...) below are RETAINED unchanged as backups; for
  // ready listeners (typically `once: true` or init-guarded) the additional
  // bus emit from emitReady is idempotent.
  try {
    H2O.events.emitReady(EV_CORE_READY, { version: state.version, turnVersion: turnState.version });
  } catch (_) {}

  const emitFn = H2O.events?.emit || H2O.bus?.emit || busEmit;
  emitFn(EV_CORE_READY, { version: state.version, turnVersion: turnState.version });

  try {
    W.dispatchEvent(new CustomEvent(EV_CORE_READY, { detail: { version: state.version, turnVersion: turnState.version } }));
  } catch {}

})();
